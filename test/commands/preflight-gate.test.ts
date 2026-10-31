/**
 * 写命令统一 preflight 闸（helper）单元测试（v1.5.6-stage-114）
 *
 * 断言集中在「拒绝出口 + 退出方式 + 恢复通道豁免」三面：
 *  - 拒绝只置 `process.exitCode` 并返回 false，**绝不** `process.exit`；
 *  - JSON 模式单文档 envelope（`schemaVersion` 首键、`error` 四键、`detail.reason='preflight-required'`）；
 *  - 人类模式单行 stderr（与 i18n 模板逐字一致）；
 *  - `exemptWhenStateUnreadable` 只在显式 `stateReadable:false` 时生效（缺省 = 可读 → 不逃生）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { enforcePreflightOrFail } from '../../src/commands/shared/preflight-gate.js';
import { resetJsonModeForTest, setJsonMode } from '../../src/commands/shared/json-output.js';
import { t } from '../../src/core/i18n.js';

describe('enforcePreflightOrFail（v1.5.6-stage-114）', () => {
  let dir: string;
  let logMock: ReturnType<typeof vi.fn>;
  let errorMock: ReturnType<typeof vi.fn>;
  let exitMock: ReturnType<typeof vi.fn>;
  let prevExitCode: number | string | undefined;
  let originalStderrIsTTY: boolean | undefined;

  /** 递归列目录（仅用于「放行路径不写盘」断言） */
  function snapshot(root: string): string[] {
    const out: string[] = [];
    const walk = (p: string, rel: string): void => {
      for (const entry of readdirSync(p, { withFileTypes: true })) {
        const next = rel === '' ? entry.name : `${rel}/${entry.name}`;
        if (entry.isDirectory()) {
          out.push(`${next}/`);
          walk(join(p, entry.name), next);
        } else {
          out.push(next);
        }
      }
    };
    walk(root, '');
    return out.sort();
  }

  function stderrText(): string {
    return errorMock.mock.calls.map((c) => String(c[0])).join('\n');
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'openfeel-preflight-gate-'));
    mkdirSync(join(dir, '.openfeel'), { recursive: true });
    writeFileSync(join(dir, '.openfeel', 'flow.json'), JSON.stringify({
      revision: 1,
      pipeline: { current: { stage: '', op: '' } },
      stages: {},
    }), 'utf-8');

    prevExitCode = process.exitCode;
    process.exitCode = 0;
    logMock = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorMock = vi.spyOn(console, 'error').mockImplementation(() => {});
    exitMock = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    // 强制非 TTY（warn 零输出断言的前提）
    originalStderrIsTTY = process.stderr.isTTY;
    Object.defineProperty(process.stderr, 'isTTY', { value: false, configurable: true });
    resetJsonModeForTest();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    logMock.mockRestore();
    errorMock.mockRestore();
    exitMock.mockRestore();
    resetJsonModeForTest();
    vi.unstubAllEnvs();
    Object.defineProperty(process.stderr, 'isTTY', {
      value: originalStderrIsTTY,
      configurable: true,
    });
    process.exitCode = prevExitCode;
  });

  it('strict 拒绝 → 置 exitCode=1 且返回 false（不调用 process.exit）', () => {
    vi.stubEnv('OPENFEEL_PREFLIGHT', 'strict');
    expect(enforcePreflightOrFail(dir, 'zh-CN')).toBe(false);
    expect(exitMock).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('strict 拒绝 + JSON 模式 → 单文档 envelope（首键 schemaVersion / detail.reason）', () => {
    vi.stubEnv('OPENFEEL_PREFLIGHT', 'strict');
    setJsonMode(true);
    expect(enforcePreflightOrFail(dir, 'zh-CN')).toBe(false);
    expect(process.exitCode).toBe(1);
    expect(errorMock).not.toHaveBeenCalled();
    expect(logMock).toHaveBeenCalledTimes(1);
    const doc = JSON.parse(logMock.mock.calls[0][0] as string) as {
      schemaVersion: number;
      error: { code: string; kind: string; message: string; detail: { reason: string } };
    };
    expect(Object.keys(doc)).toEqual(['schemaVersion', 'error']);
    expect(Object.keys(doc.error)).toEqual(['code', 'kind', 'message', 'detail']);
    expect(doc.error.code).toBe('INVALID_ARGUMENT');
    expect(doc.error.kind).toBe('refusal');
    expect(doc.error.detail.reason).toBe('preflight-required');
    expect(doc.error.message).toBe(t('flow.preflightRequiredTmpl', 'zh-CN'));
  });

  it('strict 拒绝 + 非 JSON → 字面文案进 stderr（单行）', () => {
    vi.stubEnv('OPENFEEL_PREFLIGHT', 'strict');
    expect(enforcePreflightOrFail(dir, 'zh-CN')).toBe(false);
    expect(errorMock).toHaveBeenCalledTimes(1);
    expect(errorMock.mock.calls[0][0]).toBe(t('flow.preflightRequiredTmpl', 'zh-CN'));
    expect(logMock).not.toHaveBeenCalled();
  });

  it('off → 放行且零输出（两种 JSON 模式）', () => {
    vi.stubEnv('OPENFEEL_PREFLIGHT', 'off');
    expect(enforcePreflightOrFail(dir, 'zh-CN')).toBe(true);
    setJsonMode(true);
    expect(enforcePreflightOrFail(dir, 'zh-CN')).toBe(true);
    expect(logMock).not.toHaveBeenCalled();
    expect(errorMock).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(0);
  });

  it('warn + 非 TTY → 放行且零输出', () => {
    vi.stubEnv('OPENFEEL_PREFLIGHT', 'warn');
    expect(enforcePreflightOrFail(dir, 'zh-CN')).toBe(true);
    expect(logMock).not.toHaveBeenCalled();
    expect(errorMock).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(0);
  });

  it('reject 覆盖 → 只调 reject、helper 不自输出', () => {
    vi.stubEnv('OPENFEEL_PREFLIGHT', 'strict');
    const reject = vi.fn();
    expect(enforcePreflightOrFail(dir, 'zh-CN', { reject })).toBe(false);
    expect(reject).toHaveBeenCalledTimes(1);
    expect(reject.mock.calls[0][0]).toBe(t('flow.preflightRequiredTmpl', 'zh-CN'));
    // helper 自身不写 stdout / stderr（legacy 三键出口由调用方负责）
    expect(logMock).not.toHaveBeenCalled();
    expect(errorMock).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('exemptWhenStateUnreadable + stateReadable=false → 放行且零输出', () => {
    vi.stubEnv('OPENFEEL_PREFLIGHT', 'strict');
    expect(
      enforcePreflightOrFail(dir, 'zh-CN', { stateReadable: false, exemptWhenStateUnreadable: true }),
    ).toBe(true);
    expect(logMock).not.toHaveBeenCalled();
    expect(errorMock).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(0);
  });

  it('exemptWhenStateUnreadable + stateReadable=true → 仍拒绝', () => {
    vi.stubEnv('OPENFEEL_PREFLIGHT', 'strict');
    expect(
      enforcePreflightOrFail(dir, 'zh-CN', { stateReadable: true, exemptWhenStateUnreadable: true }),
    ).toBe(false);
    expect(process.exitCode).toBe(1);
    expect(stderrText()).toContain('flow next');
  });

  it('exempt 传了但未传 stateReadable → 拒绝（缺省 = 可读，防默认逃生）', () => {
    vi.stubEnv('OPENFEEL_PREFLIGHT', 'strict');
    expect(enforcePreflightOrFail(dir, 'zh-CN', { exemptWhenStateUnreadable: true })).toBe(false);
    expect(process.exitCode).toBe(1);
  });

  it('放行路径不写任何文件（目录快照前后一致）', () => {
    const before = snapshot(dir);
    vi.stubEnv('OPENFEEL_PREFLIGHT', 'warn');
    expect(enforcePreflightOrFail(dir, 'zh-CN')).toBe(true);
    vi.stubEnv('OPENFEEL_PREFLIGHT', 'off');
    expect(enforcePreflightOrFail(dir, 'zh-CN')).toBe(true);
    vi.stubEnv('OPENFEEL_PREFLIGHT', 'strict');
    // 拒绝路径同样只读账本、不刷新它
    expect(enforcePreflightOrFail(dir, 'zh-CN')).toBe(false);
    expect(snapshot(dir)).toEqual(before);
  });
});
