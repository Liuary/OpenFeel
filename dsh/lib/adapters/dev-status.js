/**
 * dev 状态同步（v1.5.0，适配器侧只读）
 *
 * 与 CLI `openfeel dev status` 同源：读 `.openfeel/dev/.sync.json` 判断是否到期；
 * 只读，不写盘。用于 feel_next / feel_status 暴露 statusSync.due。
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** 默认同步间隔（分钟） */
export const DEFAULT_SYNC_INTERVAL_MINUTES = 30;

/**
 * 读取状态同步快照（缺失/损坏 → due=true 且 lastSync=null）。
 * @param {string} projectRoot
 * @param {number} [now]
 * @returns {{ due: boolean, lastSync: string|null, intervalMinutes: number }}
 */
export function readStatusSync(projectRoot, now = Date.now()) {
  const file = join(projectRoot, '.openfeel', 'dev', '.sync.json');
  let lastSync = null;
  let intervalMinutes = DEFAULT_SYNC_INTERVAL_MINUTES;
  try {
    if (existsSync(file)) {
      const raw = JSON.parse(readFileSync(file, 'utf-8'));
      if (typeof raw.last_sync === 'string') lastSync = raw.last_sync;
      if (typeof raw.interval_minutes === 'number' && raw.interval_minutes > 0) {
        intervalMinutes = raw.interval_minutes;
      }
    }
  } catch {
    /* 损坏 → 视为到期 */
  }
  let due = true;
  if (lastSync !== null) {
    const last = Date.parse(lastSync);
    due = !Number.isFinite(last) || now - last >= intervalMinutes * 60_000;
  }
  return { due, lastSync, intervalMinutes };
}
