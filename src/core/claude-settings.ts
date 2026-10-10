/**
 * Claude 全局 settings.json 注入模块（stage-73）
 * 严格 JSON「读-深合并-写回」：把框架自有键（agent / permissions.defaultMode）并入用户既有
 * ~/.claude/settings.json，逐字保留其余用户键。settings.json 为严格 JSON（无注释 / 无受管区标记），
 * 故不复用 opencode-config 的 jsonc 剥注释逻辑，亦不复用 managed-region 的标记三态。
 */
import { existsSync, readFileSync } from 'node:fs';
import { atomicWriteFileSync } from './fs/atomic-write.js';
import { withFileLock, globalLockPath } from './fs/file-lock.js';
import { backupFileBeforeWrite, notifyBackupIfTTY, BackupError } from './backup.js';
import { appendUpdateInfo } from './update-infos.js';
import { getClaudeSettingsPath } from './global-paths.js';
import { updateFileHash, type UpdateState } from './update-state.js';
import { t } from './i18n.js';

/** settings.json 非严格 JSON / 顶层非对象时抛出（调用方捕获 → 跳过写入 + anomaly） */
export class ClaudeSettingsParseError extends Error {
  constructor(message: string) {
    super(`settings.json 解析失败：${message}`);
    this.name = 'ClaudeSettingsParseError';
  }
}

/** 判断纯对象（排除数组 / null） */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** 框架注入片段（供应商中立；JSON 无语言维度 → 代码常量，不经 build 注入） */
export function buildClaudeSettingsFragment(): { agent: string; permissions: { defaultMode: string } } {
  return { agent: 'feel', permissions: { defaultMode: 'auto' } };
}

/**
 * 严格 JSON 深合并：在用户既有 settings 上并入框架片段，逐字保留用户未知键。
 * - 顶层须为对象；严格 JSON.parse（不接受注释 / trailing comma）；失败抛 ClaudeSettingsParseError；
 * - 框架自有键 agent / permissions.defaultMode 覆盖；permissions 下用户其它子键（allow/deny/…）保留；
 * - 输出稳定序列化 JSON.stringify(obj, null, 2) + '\n'（依赖 JS 对象插入序保证二次运行字节幂等）。
 */
export function mergeClaudeSettings(currentRaw: string): string {
  const raw = currentRaw.trim() === '' ? '{}' : currentRaw;
  let base: unknown;
  try {
    base = JSON.parse(raw);
  } catch (err) {
    throw new ClaudeSettingsParseError((err as Error).message);
  }
  if (!isPlainObject(base)) {
    throw new ClaudeSettingsParseError('顶层必须为 JSON 对象');
  }
  const fragment = buildClaudeSettingsFragment();
  const result: Record<string, unknown> = { ...base };
  // 框架自有键：已存在则原位覆盖（保序），不存在则按片段声明序追加
  result.agent = fragment.agent;
  const basePerm = isPlainObject(result.permissions) ? result.permissions : {};
  result.permissions = { ...basePerm, defaultMode: fragment.permissions.defaultMode };
  return JSON.stringify(result, null, 2) + '\n';
}

/** applyClaudeSettings 结果动作 */
export type ClaudeSettingsAction = 'created' | 'updated' | 'skipped';

/**
 * 应用 Claude settings.json 注入（**单一共享函数**，setup.ts / update.ts 共用，避免双实现漂移 R-新11）。
 * 顺序：① lock 之外写前备份（目标存在即备份，对齐 jsonc 口径）→ ② lock 内 read → merge → atomicWrite。
 * @param state    全局 update state（成功写回后以绝对路径记 hash）
 * @param command  调用方（决定 i18n 域前缀；仅 setup / update 接入）
 * @param lang     输出语言
 * @returns 'created'（原不存在）/ 'updated'（合并后变化）/ 'skipped'（无变化 或 备份/读取/解析失败）
 */
export function applyClaudeSettings(
  state: UpdateState,
  command: 'setup' | 'update',
  lang: 'zh-CN' | 'en',
): ClaudeSettingsAction {
  const settingsPath = getClaudeSettingsPath();

  // ① 写前备份（lock 之外，避免 backup 锁与 settings 锁嵌套）——目标存在时备份 + backed + TTY 通知
  try {
    const backup = backupFileBeforeWrite(settingsPath, { command });
    if (backup) {
      appendUpdateInfo('backed', { absolutePath: settingsPath, backupRel: backup.backupRel, command });
      notifyBackupIfTTY(backup.backupRel);
    }
  } catch (err) {
    // 备份失败（B3）：跳过 settings 写入、记 anomaly、继续其余步骤
    if (err instanceof BackupError) {
      appendUpdateInfo('anomaly', { absolutePath: settingsPath, note: 'backup_failed' });
      console.warn(t(`${command}.claudeSettingsWriteSkipTmpl`, lang, { err: err.message }));
      return 'skipped';
    }
    throw err; // 非备份错误照旧上抛（锁超时等不回退）
  }

  // ② 锁内 read → merge → atomicWrite（read 也在锁内，消除 TOCTOU）
  return withFileLock(globalLockPath('global-claude-settings'), (): ClaudeSettingsAction => {
    const existed = existsSync(settingsPath);
    let raw: string;
    try {
      raw = existed ? readFileSync(settingsPath, 'utf-8') : '';
    } catch (err) {
      // 目录占位 / 权限不可读：不写盘，记 anomaly
      appendUpdateInfo('anomaly', { absolutePath: settingsPath, note: 'read_failed' });
      console.warn(t(`${command}.claudeSettingsWriteSkipTmpl`, lang, { err: (err as Error).message }));
      return 'skipped';
    }
    let merged: string;
    try {
      merged = mergeClaudeSettings(raw);
    } catch (err) {
      if (err instanceof ClaudeSettingsParseError) {
        // 严格 JSON 解析失败：不写盘，保留原文件，记 anomaly
        appendUpdateInfo('anomaly', { absolutePath: settingsPath, note: 'parse_failed' });
        console.warn(t(`${command}.claudeSettingsParseSkipTmpl`, lang, { err: err.message }));
        return 'skipped';
      }
      throw err;
    }
    if (existed && merged === raw) {
      return 'skipped'; // 合并无变化 → 幂等（文件字节不变）
    }
    atomicWriteFileSync(settingsPath, merged);
    updateFileHash(state, settingsPath, merged);
    if (process.stdout.isTTY) {
      console.log(t(`${command}.claudeSettingsMergedTmpl`, lang));
    }
    return existed ? 'updated' : 'created';
  });
}
