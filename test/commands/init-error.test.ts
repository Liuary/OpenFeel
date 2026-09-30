/**
 * init 命令错误出口测试（stage-50 op-004 T41）
 * 注入 initProject 抛错 → 错误模板 + 非 0 退出码 + 无堆栈外泄。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const mockHome = vi.hoisted(() => ({ dir: '' }));
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => mockHome.dir };
});

vi.mock('../../src/core/init.js', () => ({
  initProject: () => { throw new Error('boom'); },
  initWorkspaceOnly: () => { throw new Error('boom'); },
  initDemo: () => { throw new Error('boom'); },
}));

import { Command } from 'commander';
import { registerInitCommand } from '../../src/commands/init.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('init 命令错误出口（stage-50 op-004 T41）', () => {
  let tmpDir: string;
  let program: Command;
  let errorMock: ReturnType<typeof vi.fn>;
  let prevExitCode: number | string | undefined;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-init-err-'));
    mockHome.dir = tmpDir;
    prevExitCode = process.exitCode;
    process.exitCode = undefined;
    errorMock = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    program = new Command();
    program.exitOverride();
    registerInitCommand(program);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = prevExitCode;
    rmSync(tmpDir, { recursive: true, force: true });
    mockHome.dir = '';
  });

  it('init 异常 → 错误模板 + 非 0 退出码 + 无堆栈外泄', async () => {
    try {
      await program.parseAsync(['init', tmpDir], { from: 'user' });
    } catch {
      // CommanderError（exitOverride）可忽略
    }
    const err = errorMock.mock.calls.map((c) => c[0] as string).join('\n');
    expect(err).toContain('错误');
    expect(err).not.toContain('at ');
    expect(process.exitCode).toBe(1);
  });
});
