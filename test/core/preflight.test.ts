/**
 * preflight 账本测试（v1.5.5）
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  PREFLIGHT_MAX_AGE_MS,
  checkPreflight,
  getPreflightMode,
  preflightGate,
  readPreflight,
  recordPreflight,
} from '../../src/core/preflight.js';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('preflight（v1.5.5）', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'openfeel-preflight-'));
    mkdirSync(join(dir, '.openfeel'), { recursive: true });
    writeFileSync(join(dir, '.openfeel', 'flow.json'), JSON.stringify({
      revision: 3,
      pipeline: { current: { stage: '', op: '' } },
      stages: { 'v0.0.1-stage-01': { name: 's1', phase: 'exec_running', status: 'planned', deps: [], ops: {} } },
    }), 'utf-8');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  it('record → read：写入 stage/phase/revision', () => {
    const rec = recordPreflight(dir);
    expect(rec.stage).toBe('v0.0.1-stage-01');
    expect(rec.phase).toBe('exec_running');
    expect(rec.revision).toBe(3);
    expect(readPreflight(dir)?.at).toBe(rec.at);
    expect(checkPreflight(dir).ok).toBe(true);
  });

  it('过期 → ok=false / reason=expired', () => {
    const rec = recordPreflight(dir);
    const later = Date.parse(rec.at) + PREFLIGHT_MAX_AGE_MS + 1;
    const check = checkPreflight(dir, later);
    expect(check.ok).toBe(false);
    expect(check.reason).toBe('expired');
  });

  it('缺失 → missing；损坏 → null；at 非法 → invalid', () => {
    expect(checkPreflight(dir).reason).toBe('missing');
    mkdirSync(join(dir, '.openfeel', 'dev'), { recursive: true });
    writeFileSync(join(dir, '.openfeel', 'dev', '.preflight.json'), '{bad', 'utf-8');
    expect(readPreflight(dir)).toBeNull();
    writeFileSync(join(dir, '.openfeel', 'dev', '.preflight.json'), JSON.stringify({ at: 'not-a-date' }), 'utf-8');
    expect(checkPreflight(dir).reason).toBe('invalid');
  });

  it('warn 非 TTY 放行；off 放行', () => {
    vi.stubEnv('OPENFEEL_PREFLIGHT', 'warn');
    expect(preflightGate(dir, 'need status').ok).toBe(true);
    vi.stubEnv('OPENFEEL_PREFLIGHT', 'off');
    expect(preflightGate(dir, 'need status').ok).toBe(true);
  });

  it('模式：默认 warn / off / strict', () => {
    expect(getPreflightMode({} as NodeJS.ProcessEnv)).toBe('warn');
    expect(getPreflightMode({ OPENFEEL_PREFLIGHT: 'off' } as NodeJS.ProcessEnv)).toBe('off');
    expect(getPreflightMode({ OPENFEEL_PREFLIGHT: 'strict' } as NodeJS.ProcessEnv)).toBe('strict');
  });

  it('strict + 缺失 → gate 拒绝；有记录 → 放行', () => {
    vi.stubEnv('OPENFEEL_PREFLIGHT', 'strict');
    expect(preflightGate(dir, 'need status').ok).toBe(false);
    recordPreflight(dir);
    expect(preflightGate(dir, 'need status').ok).toBe(true);
  });
});
