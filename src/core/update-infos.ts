/**
 * update_infos.md 读写模块
 * 记录 openfeel update 因目标文件无控制区标记而追加的受管内容，
 * 以及标记解析异常（malformed）未写入、待人工修复的文件，供会话启动时检查并修复（op-003 消费）。
 *
 * 路径二元组（REV-903）：全局资产记绝对路径；项目资产记「项目根 + 相对路径」。
 * 写入走全局文件锁 + 原子写（跨项目共享，N7）。
 *
 * 持久化策略（T25 / R2「按保守默认执行」）：
 * - 条目 **只增不减**：resolved 后不再自动移出（历史记录保留，便于审计）；
 * - `clearUpdateInfos` 当前 **仅测试/预留** 引用，未接入 CLI；
 * - 人工清理入口 = 直接编辑 `~/.openfeel/update_infos.md`（删除已 resolved 条目），
 *   或后续版本评估自动化。
 */
import { existsSync, readFileSync } from 'node:fs';
import { atomicWriteFileSync } from './fs/atomic-write.js';
import { withFileLock, globalLockPath } from './fs/file-lock.js';
import { getGlobalUpdateInfosPath } from './global-paths.js';

/** 条目类型：追加（无标记）/ 异常（标记解析失败或备份失败，未写入待人工修复）/ 备份（部署覆盖前已备份） */
export type UpdateInfoKind = 'appended' | 'anomaly' | 'backed';

/** 单条记录 */
export interface UpdateInfoEntry {
  kind: UpdateInfoKind;
  absolutePath: string | null;   // 全局资产：绝对路径；项目资产：null
  projectRoot: string | null;    // 项目资产：项目根绝对路径；全局资产：null
  relativePath: string | null;   // 项目资产：相对路径；全局资产：null
  timestamp: string;             // ISO 时间戳
  resolved: boolean;             // - [x] 已复核 / - [ ] 待复核
  backupRel: string | null;      // 备份相对路径（backed）；其余 kind 为 null
  command: string | null;        // 部署来源命令（backed）；其余 kind 为 null
  note: string | null;           // 成因标记（anomaly 且为备份失败时 = 'backup_failed'）；其余为 null
}

/** 追加目标（绝对路径 或 项目根+相对路径 二元组，二选一） */
export interface UpdateInfoTarget {
  absolutePath?: string;
  projectRoot?: string;
  relativePath?: string;
  backupRel?: string;   // backed 用
  command?: string;     // backed 用
  note?: string;        // anomaly 备份失败用
}

/** 节标题（追加 / 异常 / 备份） */
const SECTION_TITLES: Record<UpdateInfoKind, string> = {
  appended: '## 追加（无标记 → 末尾追加受管区）',
  anomaly: '## 异常（标记解析失败 → 未写入，需人工修复标记）',
  backed: '## 备份（部署覆盖前已存在 → 已备份，待检查）',
};

/**
 * 节识别短前缀（与 SECTION_TITLES 同源维护、紧邻定义）。
 * ⚠️ 迁移约束：修改 SECTION_TITLES 的节标题文案时，必须同步核对/迁移存量 ~/.openfeel/update_infos.md
 *    的节标题（否则旧文件节标题失配、条目将回落到上一节 kind）。
 */
const SECTION_PREFIXES: Record<UpdateInfoKind, string> = {
  appended: '## 追加',
  anomaly: '## 异常',
  backed: '## 备份',
};

const FILE_HEADER = [
  '# OpenFeel 增量更新记录',
  '',
  '> 本文件记录 `openfeel update` 因目标文件无控制区标记而追加的受管内容，',
  '> 以及标记解析异常（malformed）未写入、待人工修复的文件，',
  '> 供会话启动时检查并修复。修复完成后勾选对应条目。',
  '> 备份类条目记录部署覆盖前已存在的原始文件（备份路径见条目），供会话启动时确认无内容丢失。',
  '',
].join('\n');

/** 生成条目展示路径（项目资产二元组形式） */
function displayPath(e: UpdateInfoEntry): string {
  if (e.absolutePath !== null) {
    return e.absolutePath;
  }
  return `${e.relativePath} (项目: ${e.projectRoot})`;
}

/** 序列化全部条目为 markdown 文本 */
function serialize(entries: UpdateInfoEntry[]): string {
  const byKind = (k: UpdateInfoKind) => entries.filter((e) => e.kind === k);
  // 条目尾部段：backed 显示备份路径/来源；anomaly 且带 note 显示成因；其余为空
  const tail = (e: UpdateInfoEntry): string => {
    if (e.kind === 'backed') {
      return `（备份: \`${e.backupRel ?? ''}\`，来源: ${e.command ?? ''}）`;
    }
    if (e.kind === 'anomaly' && e.note) {
      return `（原因: ${e.note}）`;
    }
    return '';
  };
  const section = (k: UpdateInfoKind) => {
    const list = byKind(k)
      .map((e) => `- [${e.resolved ? 'x' : ' '}] \`${displayPath(e)}\`（${e.timestamp}）${tail(e)}`)
      .join('\n');
    return `${SECTION_TITLES[k]}\n${list}`;
  };
  return `${FILE_HEADER}\n${section('appended')}\n\n${section('anomaly')}\n\n${section('backed')}\n`;
}

/** 从条目行解析 path 与 timestamp（容错，解析失败返回 null；尾部段可选，向后兼容旧行） */
function parseLine(line: string, kind: UpdateInfoKind): UpdateInfoEntry | null {
  // 尾部段可选；timestamp 用 [^（）]+ 阻断全角括号，避免贪婪吞并
  const m = line.match(/^- \[([ x])\] `(.+)`（([^（）]*)）(?:（(.+)）)?$/);
  if (!m) {
    return null;
  }
  const display = m[2];
  const timestamp = m[3];
  const tailRaw = m[4] ?? null;

  let backupRel: string | null = null;
  let command: string | null = null;
  let note: string | null = null;
  if (tailRaw !== null) {
    const b = tailRaw.match(/^备份: `(.+)`，来源: (.+)$/);
    if (b) {
      backupRel = b[1];
      command = b[2];
    }
    const n = tailRaw.match(/^原因: (.+)$/);
    if (n) {
      note = n[1];
    }
  }

  const projMatch = display.match(/^(.*) \(项目: (.*)\)$/);
  if (projMatch) {
    return { kind, absolutePath: null, projectRoot: projMatch[2], relativePath: projMatch[1], timestamp, resolved: m[1] === 'x', backupRel, command, note };
  }
  return { kind, absolutePath: display, projectRoot: null, relativePath: null, timestamp, resolved: m[1] === 'x', backupRel, command, note };
}

/**
 * 读取 update_infos.md 并解析为条目列表。
 * 不存在 → []；解析失败（损坏）→ 警告 + []（降级，不中断）。
 */
export function loadUpdateInfos(): UpdateInfoEntry[] {
  const path = getGlobalUpdateInfosPath();
  if (!existsSync(path)) {
    return [];
  }
  try {
    const text = readFileSync(path, 'utf-8');
    const entries: UpdateInfoEntry[] = [];
    let currentKind: UpdateInfoKind = 'appended';
    const sectionPrefixes = Object.entries(SECTION_PREFIXES) as [UpdateInfoKind, string][];
    for (const line of text.split('\n')) {
      const hit = sectionPrefixes.find(([, prefix]) => line.startsWith(prefix));
      if (hit) { currentKind = hit[0]; continue; }
      if (!line.startsWith('- [')) {
        continue;
      }
      const e = parseLine(line, currentKind);
      if (e) {
        entries.push(e);
      }
    }
    return entries;
  } catch {
    // 读取失败（损坏/权限）：降级为空条目，不中断
    // 无 lang 上下文（全局 update_infos.md）：使用 [WARN] + 英文中性文案；如需本地化请注入 projectPath
    console.warn('[WARN] Failed to parse update_infos.md; treated as no entries');
    return [];
  }
}

/**
 * 追加一条记录（加锁 + 原子写全量重写）。
 * target：全局资产传 { absolutePath }；项目资产传 { projectRoot, relativePath }。
 */
export function appendUpdateInfo(kind: UpdateInfoKind, target: UpdateInfoTarget): void {
  withFileLock(globalLockPath('update-infos'), () => {
    const entries = loadUpdateInfos();
    // anomaly 类按路径去重：同路径已有未修复（resolved=false）的 anomaly 条目则跳过，避免每次 update 无限累积（REV-1103）
    if (kind === 'anomaly') {
      const dup = entries.some((e) => {
        if (e.kind !== 'anomaly' || e.resolved) {
          return false;
        }
        return target.absolutePath
          ? e.absolutePath === target.absolutePath
          : e.projectRoot === target.projectRoot && e.relativePath === target.relativePath;
      });
      if (dup) {
        return;
      }
    }
    const entry: UpdateInfoEntry = {
      kind,
      absolutePath: target.absolutePath ?? null,
      projectRoot: target.projectRoot ?? null,
      relativePath: target.relativePath ?? null,
      timestamp: new Date().toISOString(),
      resolved: false,
      backupRel: target.backupRel ?? null,
      command: target.command ?? null,
      note: target.note ?? null,
    };
    entries.push(entry);
    atomicWriteFileSync(getGlobalUpdateInfosPath(), serialize(entries));
  });
}

/** 标记匹配 target 的条目为已复核（resolved）；无匹配则忽略 */
export function resolveUpdateInfo(target: UpdateInfoTarget): void {
  withFileLock(globalLockPath('update-infos'), () => {
    const entries = loadUpdateInfos();
    let changed = false;
    for (const e of entries) {
      const match = target.absolutePath
        ? e.absolutePath === target.absolutePath
        : e.projectRoot === target.projectRoot && e.relativePath === target.relativePath;
      if (match && !e.resolved) {
        e.resolved = true;
        changed = true;
      }
    }
    if (changed) {
      atomicWriteFileSync(getGlobalUpdateInfosPath(), serialize(entries));
    }
  });
}

/**
 * 清空全部条目（写空骨架）
 *
 * 预留 / 仅测试引用：生产零调用（T25 / R2「按保守默认执行」）。
 * 条目「只增不减」为当前设计；如需清理请直接编辑 `~/.openfeel/update_infos.md`。
 */
export function clearUpdateInfos(): void {
  withFileLock(globalLockPath('update-infos'), () => {
    atomicWriteFileSync(getGlobalUpdateInfosPath(), serialize([]));
  });
}
