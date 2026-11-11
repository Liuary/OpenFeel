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

// v1.5.17：隔离全局画像——`checkPreflight` 现经 `resolvePreflightMode → resolveFeelMode`
// 读取 `~/.config/openfeel/profile.yaml`；不隔离会让「本机把全局 feel_mode 设成 disabled」
// 的开发者机器上 strict 用例翻红（CI 干净 HOME 才绿）。
const mockHome = vi.hoisted(() => ({ dir: '' }));
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => mockHome.dir };
});

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
    // 不存在的 HOME → 无 profile.yaml 干扰（feel_mode 回落 builtin）
    mockHome.dir = join(dir, 'no-such-home');
  });

  afterEach(() => {
    mockHome.dir = '';
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

  it('v1.5.17：strict + 项目 feel_mode=disabled → 有效模式降级 warn 并放行', () => {
    writeFileSync(join(dir, '.openfeel', 'config.yaml'), 'defaults:\n  feel_mode: disabled\n', 'utf-8');
    vi.stubEnv('OPENFEEL_PREFLIGHT', 'strict');
    // 降级必须落在模式判定处：check.mode 也报 warn（不能「报 strict 却放行」）
    expect(checkPreflight(dir).mode).toBe('warn');
    expect(preflightGate(dir, 'need status').ok).toBe(true);
    // off 仍最高优先
    vi.stubEnv('OPENFEEL_PREFLIGHT', 'off');
    expect(checkPreflight(dir).mode).toBe('off');
  });

  // ═══════════════════════════════════════════════════════════════
  // v1.5.6-stage-114 追加 6 条（判定边界 + TTY 控制）
  // ═══════════════════════════════════════════════════════════════

  it('v1.5.6：strict + invalid（at 非日期）→ 拒绝且 reason=invalid', () => {
    vi.stubEnv('OPENFEEL_PREFLIGHT', 'strict');
    mkdirSync(join(dir, '.openfeel', 'dev'), { recursive: true });
    writeFileSync(join(dir, '.openfeel', 'dev', '.preflight.json'), JSON.stringify({ at: 'not-a-date' }), 'utf-8');
    expect(checkPreflight(dir).reason).toBe('invalid');
    expect(preflightGate(dir, 'need status').ok).toBe(false);
  });

  it('v1.5.6：strict + at 在未来 → 放行（时钟偏移容忍）', () => {
    vi.stubEnv('OPENFEEL_PREFLIGHT', 'strict');
    const rec = recordPreflight(dir);
    // 以「记录时刻之前」作为 now：ageMs 为负 → 不判过期
    const earlier = Date.parse(rec.at) - PREFLIGHT_MAX_AGE_MS * 2;
    expect(checkPreflight(dir, earlier).ok).toBe(true);
    expect(preflightGate(dir, 'need status').ok).toBe(true);
  });

  it('v1.5.6：warn + stderr.isTTY=true → 恰好 1 行提示后放行', () => {
    vi.stubEnv('OPENFEEL_PREFLIGHT', 'warn');
    const orig = Object.getOwnPropertyDescriptor(process.stderr, 'isTTY');
    Object.defineProperty(process.stderr, 'isTTY', { value: true, configurable: true });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(preflightGate(dir, 'need status').ok).toBe(true);
      expect(errSpy).toHaveBeenCalledTimes(1);
      expect(errSpy.mock.calls[0][0]).toBe('need status');
    } finally {
      errSpy.mockRestore();
      if (orig) {
        Object.defineProperty(process.stderr, 'isTTY', orig);
      } else {
        delete (process.stderr as { isTTY?: boolean }).isTTY;
      }
    }
  });

  it('v1.5.6：warn + stderr.isTTY=false → 放行且零输出', () => {
    vi.stubEnv('OPENFEEL_PREFLIGHT', 'warn');
    const orig = Object.getOwnPropertyDescriptor(process.stderr, 'isTTY');
    Object.defineProperty(process.stderr, 'isTTY', { value: false, configurable: true });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(preflightGate(dir, 'need status').ok).toBe(true);
      expect(errSpy).not.toHaveBeenCalled();
    } finally {
      errSpy.mockRestore();
      if (orig) {
        Object.defineProperty(process.stderr, 'isTTY', orig);
      } else {
        delete (process.stderr as { isTTY?: boolean }).isTTY;
      }
    }
  });

  it('v1.5.6：off 且账本缺失 → 放行且零输出', () => {
    vi.stubEnv('OPENFEEL_PREFLIGHT', 'off');
    const orig = Object.getOwnPropertyDescriptor(process.stderr, 'isTTY');
    Object.defineProperty(process.stderr, 'isTTY', { value: true, configurable: true });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(preflightGate(dir, 'need status').ok).toBe(true);
      expect(errSpy).not.toHaveBeenCalled();
    } finally {
      errSpy.mockRestore();
      if (orig) {
        Object.defineProperty(process.stderr, 'isTTY', orig);
      } else {
        delete (process.stderr as { isTTY?: boolean }).isTTY;
      }
    }
  });

  it('v1.5.6：warn 过期 → 放行（仅提示）', () => {
    vi.stubEnv('OPENFEEL_PREFLIGHT', 'warn');
    mkdirSync(join(dir, '.openfeel', 'dev'), { recursive: true });
    const stale = new Date(Date.now() - PREFLIGHT_MAX_AGE_MS - 1000).toISOString();
    writeFileSync(join(dir, '.openfeel', 'dev', '.preflight.json'), JSON.stringify({ at: stale }), 'utf-8');
    expect(checkPreflight(dir).reason).toBe('expired');
    const orig = Object.getOwnPropertyDescriptor(process.stderr, 'isTTY');
    Object.defineProperty(process.stderr, 'isTTY', { value: true, configurable: true });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(preflightGate(dir, 'need status').ok).toBe(true);
      expect(errSpy).toHaveBeenCalledTimes(1);   // 仅提示，仍放行
    } finally {
      errSpy.mockRestore();
      if (orig) {
        Object.defineProperty(process.stderr, 'isTTY', orig);
      } else {
        delete (process.stderr as { isTTY?: boolean }).isTTY;
      }
    }
  });
});
