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
    delete process.env.CLAUDE_CONFIG_DIR;
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
    delete process.env.CLAUDE_CONFIG_DIR;
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

  it('R-5 守卫：update <path> 默认部署 opencode，不触 ~/.claude', async () => {
    await safeParse(['update', projDir]);
    expect(existsSync(join(homeDir, '.config', 'opencode', 'AGENTS.md'))).toBe(true);
    expect(existsSync(join(homeDir, '.claude'))).toBe(false);
    expect(process.exitCode).toBeUndefined();
  });

  it('--tools opencode：部署 opencode，不触 ~/.claude，退出码未置位', async () => {
    await safeParse(['update', projDir, '--tools', 'opencode']);
    expect(existsSync(join(homeDir, '.config', 'opencode', 'AGENTS.md'))).toBe(true);
    expect(existsSync(join(homeDir, '.claude'))).toBe(false);
    expect(process.exitCode).toBeUndefined();
  });

  it('--tools foo（非法值）→ exit 1 且校验前置（零写盘）', async () => {
    const exitMock = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('__EXIT__');
    }) as never);
    let thrown: unknown;
    try {
      await safeParse(['update', projDir, '--tools', 'foo']);
    } catch (err) {
      thrown = err;
    }
    expect((thrown as Error)?.message).toBe('__EXIT__');
    expect(exitMock).toHaveBeenCalledWith(1);
    // 校验前置：全局文件未部署
    expect(existsSync(join(homeDir, '.config', 'opencode', 'AGENTS.md'))).toBe(false);
  });

  it('--tools 空串 → exit 1（显式指定却无合法值属误用）', async () => {
    const exitMock = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('__EXIT__');
    }) as never);
    let thrown: unknown;
    try {
      await safeParse(['update', projDir, '--tools', '']);
    } catch (err) {
      thrown = err;
    }
    expect((thrown as Error)?.message).toBe('__EXIT__');
    expect(exitMock).toHaveBeenCalledWith(1);
  });

  // ── stage-71/T3：update --tools claude 命令面 ──

  it('stage-71/T3：update <projDir> --tools claude → 部署 CLAUDE.md，不触 opencode', async () => {
    await safeParse(['update', projDir, '--tools', 'claude']);
    expect(existsSync(join(homeDir, '.claude', 'CLAUDE.md'))).toBe(true);
    expect(existsSync(join(homeDir, '.config', 'opencode', 'AGENTS.md'))).toBe(false);
    expect(process.exitCode).toBeUndefined();
  });

  it('stage-71/T3：update <projDir>（默认）→ 不触 ~/.claude', async () => {
    await safeParse(['update', projDir]);
    expect(existsSync(join(homeDir, '.claude'))).toBe(false);
    expect(process.exitCode).toBeUndefined();
  });
});
