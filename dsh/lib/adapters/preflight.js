/**
 * Preflight 状态（v1.5.5，适配器只读）
 *
 * 与 CLI `.openfeel/dev/.preflight.json` 同源；供 feel_status/feel_next 暴露是否已读过状态。
 *
 * v1.5.14：账本窗口与 CLI 同语义读 `OPENFEEL_PREFLIGHT_MAX_AGE_MS`
 * （仅正整数生效，缺省 10 分钟），避免长构建后适配器视图与 `flow health` / 写门漂移。
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const PREFLIGHT_MAX_AGE_MS = 10 * 60_000;

/** 解析正整数；非字符串 / 空 / 非数字 / ≤0 / 非整数 → null（回退默认）。 */
function parsePositiveInteger(raw) {
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (text === '') return null;
  const value = Number(text);
  if (!Number.isFinite(value) || value <= 0 || !Number.isInteger(value)) return null;
  return value;
}

/**
 * 账本有效期（毫秒）——与 `src/core/preflight.ts:getPreflightMaxAgeMs` 同一语义。
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {number}
 */
export function getPreflightMaxAgeMs(env = process.env) {
  return parsePositiveInteger(env?.OPENFEEL_PREFLIGHT_MAX_AGE_MS) ?? PREFLIGHT_MAX_AGE_MS;
}

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
    return { ok: ageMs <= getPreflightMaxAgeMs(), at: raw.at, ageMs, mode };
  } catch {
    return { ok: false, at: null, ageMs: null, mode };
  }
}
