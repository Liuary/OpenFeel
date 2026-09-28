/**
 * 部署覆盖前备份（stage-46）
 * 在「目标已存在且本次将被写入/覆盖」前，把原件复制到全局备份根 ~/.openfeel/backup/{ts}/（保留层级），
 * 并更新当次 manifest.json。整次会话在单一 backup 文件锁临界区内，消除 ts 探测 / manifest 读改写的 TOCTOU。
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { atomicWriteFileSync } from './fs/atomic-write.js';
import { withFileLock, globalLockPath } from './fs/file-lock.js';
import { getGlobalBackupRootPath } from './global-paths.js';
import { getCliLang } from './i18n.js';

/** 会触发部署覆盖写的调用方（B4 枚举） */
export type BackupCommand = 'setup' | 'update' | 'init' | 'migrate';

/** 备份结果（调用方据此写 update_infos「备份」条目） */
export interface BackupResult {
  /** 相对 ~/.openfeel/backup/{ts}/ 的备份路径（POSIX 分隔符，供条目显示） */
  backupRel: string;
  /** 本进程的备份集时间戳（yyyyMMddTHHmmssSSS[-N]） */
  ts: string;
}

/** 备份失败（供调用方跳过该文件写入，B3） */
export class BackupError extends Error {
  readonly filePath: string;
  constructor(filePath: string, cause: unknown) {
    super(`备份失败：${filePath}（${cause instanceof Error ? cause.message : String(cause)}）`);
    this.name = 'BackupError';
    this.filePath = filePath;
  }
}

let cachedTs: string | null = null;
/** 测试隔离：清空进程内 {ts} 缓存（生产不使用） */
export function resetBackupSetCache(): void {
  cachedTs = null;
}

/** 生成本地时间戳 yyyyMMddTHHmmssSSS（本地时区） */
function nowStamp(): string {
  const d = new Date();
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}T${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}${p(d.getMilliseconds(), 3)}`;
}

/** 计算备份相对路径（B1：global/<HOME相对> 或 project/<basename>-<hash8>/<项目相对>） */
function computeBackupRel(absPath: string, projectPath?: string): { zone: 'global' | 'project'; rel: string } {
  if (projectPath) {
    const proj = resolve(projectPath);
    const rel = relative(proj, absPath);
    const hash8 = createHash('sha256').update(proj).digest('hex').slice(0, 8);
    return { zone: 'project', rel: join('project', `${basename(proj)}-${hash8}`, rel) };
  }
  const rel = relative(homedir(), absPath);
  return { zone: 'global', rel: join('global', rel) };
}

/** 读改写当次 manifest（须在 backup 锁内调用） */
function updateManifest(ts: string, command: BackupCommand, source: string, backupRel: string): void {
  const manifestPath = join(getGlobalBackupRootPath(), ts, 'manifest.json');
  let manifest: { ts: string; command: BackupCommand; createdAt: string; entries: Record<string, { backupRel: string; hash: string; command: BackupCommand; time: string }> };
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  } catch {
    manifest = { ts, command, createdAt: new Date().toISOString(), entries: {} };
  }
  manifest.entries[source] = {
    backupRel,
    hash: createHash('sha256').update(readFileSync(source)).digest('hex'),
    command,
    time: new Date().toISOString(),
  };
  atomicWriteFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
}

/**
 * 写前备份（整次会话在单一 backup 锁临界区内，REV-005）。
 * @returns 目标不存在 → null（无需备份）；否则 { backupRel, ts }
 * @throws BackupError 备份失败（调用方须跳过该文件写入，B3）
 */
export function backupFileBeforeWrite(
  absPath: string,
  opts: { command: BackupCommand; projectPath?: string },
): BackupResult | null {
  const source = resolve(absPath);
  if (!existsSync(source)) {
    return null; // 目标不存在 → 新建，无需备份
  }
  return withFileLock(globalLockPath('backup'), () => {
    try {
      // 1. ts 目录探测/预留（撞名加 -N，绝不覆盖）
      if (!cachedTs) {
        const base = nowStamp();
        let candidate = base;
        let n = 2;
        while (existsSync(join(getGlobalBackupRootPath(), candidate))) {
          candidate = `${base}-${n++}`;
        }
        mkdirSync(join(getGlobalBackupRootPath(), candidate), { recursive: true });
        cachedTs = candidate;
      }
      const ts = cachedTs;

      // 2. 计算备份相对路径 + 落盘（原子写）
      const { rel } = computeBackupRel(source, opts.projectPath);
      const dest = join(getGlobalBackupRootPath(), ts, rel);
      mkdirSync(dirname(dest), { recursive: true });
      atomicWriteFileSync(dest, readFileSync(source));

      // 3. manifest 读改写（同一临界区）
      updateManifest(ts, opts.command, source, rel.split('\\').join('/'));

      return { backupRel: rel.split('\\').join('/'), ts };
    } catch (err) {
      throw new BackupError(source, err);
    }
  });
}

/** 备份控制台提示（仅 TTY；非 TTY 静默，B6；沿用 setup.ts / update.ts 的双语字面量惯例，不新增 i18n 键） */
export function notifyBackupIfTTY(backupRel: string): void {
  if (!process.stdout.isTTY) {
    return;
  }
  const lang = getCliLang(process.cwd());
  console.log(lang === 'en'
    ? `[backup] Existing file backed up before overwrite (review the merge): ${backupRel}`
    : `[备份] 覆盖前已备份原文件（请检查合并）：${backupRel}`);
}
