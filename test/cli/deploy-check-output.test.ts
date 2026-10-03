/**
 * deploy-check-output 单元测试（stage-67 op-001）
 * 隔离 HOME（mock node:os）；stderr 断言**仅针对部署提示文案**（REV-004）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const mockHome = vi.hoisted(() => ({ dir: '' }));
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => mockHome.dir };
});

import { emitGlobalDeployCheck } from '../../src/cli/deploy-check-output.js';
import type { DeployCheckResult } from '../../src/core/deployment-check.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/** 部署提示文案锚点：两条消息均含 'openfeel setup' */
const PROMPT_MARKER = 'openfeel setup';

/** stderr 写入记录器（只收集，不做全空断言——REV-004） */
function captureStderr(): string[] {
  const out: string[] = [];
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
    out.push(String(chunk));
    return true;
  });
  return out;
}
/** 结果工厂 */
const r = (status: DeployCheckResult['status'], deployed: string | null = null, cli = '1.1.5'): DeployCheckResult =>
  ({ status, cliVersion: cli, deployedVersion: deployed });

describe('emitGlobalDeployCheck（stage-67 op-001）', () => {
  beforeEach(() => { mockHome.dir = mkdtempSync(join(tmpdir(), 'openfeel-deployout-')); });
  afterEach(() => { vi.restoreAllMocks(); rmSync(mockHome.dir, { recursive: true, force: true }); });

  it('T5.1 决定性：版本不一致 + TTY + 普通命令 → stderr 出现提示（含 openfeel setup）且退出码不变', () => {
    const prev = process.exitCode;
    const err = captureStderr();
    emitGlobalDeployCheck({
      argv: ['flow', 'status'], isTTY: true, env: {}, warned: { value: false },
      check: () => r('mismatch', '1.0.0', '1.1.5'),
    });
    const joined = err.join('');
    expect(joined).toContain(PROMPT_MARKER);
    expect(joined).toContain('1.0.0');
    expect(joined).toContain('1.1.5');
    expect(process.exitCode).toBe(prev); // 退出码不被改变
  });

  it('T5.2 版本一致 → 无部署提示', () => {
    const err = captureStderr();
    emitGlobalDeployCheck({ argv: ['flow', 'status'], isTTY: true, env: {}, warned: { value: false }, check: () => r('ok', '1.1.5') });
    expect(err.join('')).not.toContain(PROMPT_MARKER);
  });

  it('T5.3 非 TTY → 静默', () => {
    const err = captureStderr();
    emitGlobalDeployCheck({ argv: ['flow', 'status'], isTTY: false, env: {}, warned: { value: false }, check: () => r('mismatch', '1.0.0') });
    expect(err.join('')).not.toContain(PROMPT_MARKER);
  });

  it('T5.4 --json → 静默（保护 stdout 契约）', () => {
    const err = captureStderr();
    emitGlobalDeployCheck({ argv: ['flow', 'status', '--json'], isTTY: true, env: {}, warned: { value: false }, check: () => r('mismatch', '1.0.0') });
    expect(err.join('')).not.toContain(PROMPT_MARKER);
  });

  it('T5.5 --quiet → 静默', () => {
    const err = captureStderr();
    emitGlobalDeployCheck({ argv: ['flow', 'advance', '--quiet'], isTTY: true, env: {}, warned: { value: false }, check: () => r('mismatch', '1.0.0') });
    expect(err.join('')).not.toContain(PROMPT_MARKER);
  });

  it('T5.6 部署修复类命令（setup/update/init/migrate）→ 静默', () => {
    for (const cmd of ['setup', 'update', 'init', 'migrate']) {
      const err = captureStderr();
      emitGlobalDeployCheck({ argv: [cmd], isTTY: true, env: {}, warned: { value: false }, check: () => r('mismatch', '1.0.0') });
      expect(err.join('')).not.toContain(PROMPT_MARKER);
      vi.restoreAllMocks();
    }
  });

  it('T5.7 CI=1 / OPENFEEL_NO_UPDATE_CHECK=1 → 静默', () => {
    for (const env of [{ CI: '1' }, { OPENFEEL_NO_UPDATE_CHECK: '1' }, { CI: 'true' }]) {
      const err = captureStderr();
      emitGlobalDeployCheck({ argv: ['flow', 'status'], isTTY: true, env, warned: { value: false }, check: () => r('mismatch', '1.0.0') });
      expect(err.join('')).not.toContain(PROMPT_MARKER);
      vi.restoreAllMocks();
    }
  });

  it('T5.7b --version / --help → 静默', () => {
    for (const argv of [['--version'], ['-v'], ['--help'], ['-h']]) {
      const err = captureStderr();
      emitGlobalDeployCheck({ argv, isTTY: true, env: {}, warned: { value: false }, check: () => r('mismatch', '1.0.0') });
      expect(err.join('')).not.toContain(PROMPT_MARKER);
      vi.restoreAllMocks();
    }
  });

  it('T5.8 全局部署缺失 → 提示（含 openfeel setup）', () => {
    const err = captureStderr();
    emitGlobalDeployCheck({ argv: ['flow', 'status'], isTTY: true, env: {}, warned: { value: false }, check: () => r('missing') });
    expect(err.join('')).toContain(PROMPT_MARKER);
  });

  it('T5.9 state 损坏（unknown）→ 静默（REV-004：只断言部署提示文案缺席，不断言 stderr 全空）', () => {
    const err = captureStderr();
    emitGlobalDeployCheck({ argv: ['flow', 'status'], isTTY: true, env: {}, warned: { value: false }, check: () => r('unknown') });
    expect(err.join('')).not.toContain(PROMPT_MARKER);
  });

  it('T5.10 每进程一次：连续两次调用（同一 warned 对象）仅首次输出', () => {
    const err = captureStderr();
    const warned = { value: false };
    const check = () => r('mismatch', '1.0.0');
    emitGlobalDeployCheck({ argv: ['flow', 'status'], isTTY: true, env: {}, warned, check });
    emitGlobalDeployCheck({ argv: ['flow', 'status'], isTTY: true, env: {}, warned, check });
    const hits = err.filter((s) => s.includes(PROMPT_MARKER));
    expect(hits.length).toBe(1);
  });

  it('T5.1b 检测抛异常 → 静默不抛（不影响主命令）', () => {
    const err = captureStderr();
    expect(() => emitGlobalDeployCheck({
      argv: ['flow', 'status'], isTTY: true, env: {}, warned: { value: false },
      check: () => { throw new Error('boom'); },
    })).not.toThrow();
    expect(err.join('')).not.toContain(PROMPT_MARKER);
  });
});
