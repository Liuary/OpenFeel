/**
 * Preflight 状态（v1.5.5，适配器只读）
 *
 * 与 CLI `.openfeel/dev/.preflight.json` 同源；供 feel_status/feel_next 暴露是否已读过状态。
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const PREFLIGHT_MAX_AGE_MS = 10 * 60_000;

/**
 * @param {string} projectRoot
 * @param {number} [now]
 * @returns {{ ok: boolean, at: string|null, ageMs: number|null, mode: string }}
 */
export function readPreflightInfo(projectRoot, now = Date.now()) {
  const mode = (process.env.OPENFEEL_PREFLIGHT ?? 'warn').toLowerCase();
  const file = join(projectRoot, '.openfeel', 'dev', '.preflight.json');
  if (!existsSync(file)) return { ok: false, at: null, ageMs: null, mode };
  try {
    const raw = JSON.parse(readFileSync(file, 'utf-8'));
    if (typeof raw.at !== 'string') return { ok: false, at: null, ageMs: null, mode };
    const at = Date.parse(raw.at);
    if (!Number.isFinite(at)) return { ok: false, at: raw.at, ageMs: null, mode };
    const ageMs = now - at;
    return { ok: ageMs <= PREFLIGHT_MAX_AGE_MS, at: raw.at, ageMs, mode };
  } catch {
    return { ok: false, at: null, ageMs: null, mode };
  }
}
