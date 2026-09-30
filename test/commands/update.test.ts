/**
 * update 命令测试（stage-50 op-005 T46，命令层覆盖补齐）
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const mockHome = vi.hoisted(() => ({ dir: '' }));
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => mockHome.dir };
});

import { Command, CommanderError } from 'commander';
import { registerUpdateCommand } from '../../src/commands/update.js';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('update 命令（stage-50 op-005 T46）', () => {
  let homeDir: string;
  let projDir: string;
  let program: Command;
  let prevExitCode: number | string | undefined;

  beforeEach(() => {
    homeDir = mkdtempSync(join(tmpdir(), 'openfeel-cmd-update-home-'));
    projDir = mkdtempSync(join(tmpdir(), 'openfeel-cmd-update-proj-'));
    mockHome.dir = homeDir;
    prevExitCode = process.exitCode;
    process.exitCode = undefined;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    program = new Command();
    program.exitOverride();
    registerUpdateCommand(program);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = prevExitCode;
    rmSync(homeDir, { recursive: true, force: true });
    rmSync(projDir, { recursive: true, force: true });
    mockHome.dir = '';
  });

  async function safeParse(args: string[]): Promise<void> {
    try {
      await program.parseAsync(args, { from: 'user' });
    } catch (err) {
      if (!(err instanceof CommanderError)) {
        throw err;
      }
    }
  }

  it('基本路径：update <path> 部署全局 + 自动初始化项目工作区', async () => {
    await safeParse(['update', projDir]);
    // 全局 AGENTS.md 落到 mock HOME
    expect(existsSync(join(homeDir, '.config', 'opencode', 'AGENTS.md'))).toBe(true);
    // 项目 .openfeel 自动初始化
    expect(existsSync(join(projDir, '.openfeel'))).toBe(true);
    expect(process.exitCode).toBeUndefined();
  });

  it('失败路径：update 不存在的路径 → exit 1', async () => {
    const exitMock = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('__EXIT__');
    }) as never);
    let thrown: unknown;
    try {
      await safeParse(['update', join(projDir, 'nope-subdir')]);
    } catch (err) {
      thrown = err;
    }
    expect((thrown as Error)?.message).toBe('__EXIT__');
    expect(exitMock).toHaveBeenCalledWith(1);
  });
});
