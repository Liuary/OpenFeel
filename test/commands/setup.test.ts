/**
 * setup 命令测试（stage-50 op-005 T46，命令层覆盖补齐）
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const mockHome = vi.hoisted(() => ({ dir: '' }));
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => mockHome.dir };
});

import { Command } from 'commander';
import { registerSetupCommand } from '../../src/commands/setup.js';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('setup 命令（stage-50 op-005 T46）', () => {
  let homeDir: string;
  let program: Command;
  let logMock: ReturnType<typeof vi.fn>;
  let prevExitCode: number | string | undefined;

  beforeEach(() => {
    homeDir = mkdtempSync(join(tmpdir(), 'openfeel-cmd-setup-'));
    mockHome.dir = homeDir;
    prevExitCode = process.exitCode;
    process.exitCode = undefined;
    logMock = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    program = new Command();
    program.exitOverride();
    registerSetupCommand(program);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = prevExitCode;
    rmSync(homeDir, { recursive: true, force: true });
    mockHome.dir = '';
  });

  it('基本路径：部署全局文件并输出完成（exit 0）', async () => {
    await program.parseAsync(['setup'], { from: 'user' });
    expect(logMock).toHaveBeenCalled();
    // 全局 AGENTS.md 落到 mock HOME
    expect(existsSync(join(homeDir, '.config', 'opencode', 'AGENTS.md'))).toBe(true);
    expect(process.exitCode).toBeUndefined();
  });
});
