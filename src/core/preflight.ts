/**
 * Preflight 账本（v1.5.5）
 *
 * 目的：让「先读状态、再写状态」从提示词约定变成可校验事实。
 * - `flow next` / `flow status` 记录 `.openfeel/dev/.preflight.json`；
 * - 写命令（flow advance / plan stage add / req add / claim）在 strict 模式下要求 10 分钟内读过状态。
 *
 * 模式（OPENFEEL_PREFLIGHT）：off | warn（默认，仅 TTY 提示）| strict（拒绝）。
 * DSH 适配器以 strict 调用 CLI，用户 shell 默认 warn。
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { atomicWriteFileSync } from './fs/atomic-write.js';

export const PREFLIGHT_MAX_AGE_MS = 10 * 60_000;

export type PreflightMode = 'off' | 'warn' | 'strict';

export interface PreflightRecord {
  at: string;
  stage: string | null;
  phase: string | null;
  revision: number | null;
}

export interface PreflightCheck {
  ok: boolean;
  mode: PreflightMode;
  reason: 'ok' | 'missing' | 'expired' | 'invalid';
  record: PreflightRecord | null;
  ageMs: number | null;
}

export function preflightPath(projectPath: string): string {
  return join(projectPath, '.openfeel', 'dev', '.preflight.json');
}

export function getPreflightMode(env: NodeJS.ProcessEnv = process.env): PreflightMode {
  const raw = (env.OPENFEEL_PREFLIGHT ?? '').trim().toLowerCase();
  if (raw === 'off' || raw === 'strict') return raw;
  return 'warn';
}

export function recordPreflight(projectPath: string, now: Date = new Date()): PreflightRecord {
  let stage: string | null = null;
  let phase: string | null = null;
  let revision: number | null = null;
  try {
    const flow = JSON.parse(readFileSync(join(projectPath, '.openfeel', 'flow.json'), 'utf-8')) as {
      revision?: number;
      stages?: Record<string, { phase?: string }>;
    };
    const active = Object.entries(flow.stages ?? {}).find(([, s]) => s.phase !== 'done');
    if (active) {
      stage = active[0];
      phase = active[1]?.phase ?? null;
    }
    if (typeof flow.revision === 'number') revision = flow.revision;
  } catch {
    /* 未初始化 / 损坏 → 仍记录时间，写命令会按 flow 自身报错 */
  }
  const record: PreflightRecord = { at: now.toISOString(), stage, phase, revision };
  // 账本是「读命令的副作用」，任何写失败都必须静默降级（只读盘 / CI / 权限）。
  try {
    const file = preflightPath(projectPath);
    const dir = dirname(file);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    atomicWriteFileSync(file, `${JSON.stringify(record, null, 2)}\n`);
  } catch {
    /* best-effort */
  }
  return record;
}

export function readPreflight(projectPath: string): PreflightRecord | null {
  const file = preflightPath(projectPath);
  if (!existsSync(file)) return null;
  try {
    const raw = JSON.parse(readFileSync(file, 'utf-8')) as Partial<PreflightRecord>;
    if (typeof raw.at !== 'string') return null;
    return {
      at: raw.at,
      stage: typeof raw.stage === 'string' ? raw.stage : null,
      phase: typeof raw.phase === 'string' ? raw.phase : null,
      revision: typeof raw.revision === 'number' ? raw.revision : null,
    };
  } catch {
    return null;
  }
}

export function checkPreflight(projectPath: string, now: number = Date.now()): PreflightCheck {
  const mode = getPreflightMode();
  const record = readPreflight(projectPath);
  if (record === null) {
    return { ok: false, mode, reason: 'missing', record: null, ageMs: null };
  }
  const at = Date.parse(record.at);
  if (!Number.isFinite(at)) {
    return { ok: false, mode, reason: 'invalid', record, ageMs: null };
  }
  const ageMs = now - at;
  if (ageMs > PREFLIGHT_MAX_AGE_MS) {
    return { ok: false, mode, reason: 'expired', record, ageMs };
  }
  return { ok: true, mode, reason: 'ok', record, ageMs };
}

/** 写命令统一前置检查：strict 返回 false；warn 仅 TTY 提示后放行。 */
export function preflightGate(
  projectPath: string,
  message: string,
): { ok: boolean; message: string } {
  const check = checkPreflight(projectPath);
  if (check.ok || check.mode === 'off') return { ok: true, message: '' };
  if (check.mode === 'warn') {
    if (process.stderr.isTTY) console.error(message);
    return { ok: true, message };
  }
  return { ok: false, message };
}
