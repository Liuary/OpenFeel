/**
 * init 命令集成测试
 * 测试 openfeel init 命令的 CLI 行为
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// mock homedir：隔离 ensureGlobalConfig 的全局写（~/.openfeel/config.json），不污染真实主目录
const mockHome = vi.hoisted(() => ({ dir: '' }));
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => mockHome.dir };
});

import { Command, CommanderError } from 'commander';
import { registerInitCommand } from '../../src/commands/init.js';
import { existsSync, mkdtempSync, rmSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// 真实仓库根（在 beforeEach mock process.cwd 之前于模块加载期捕获），用于 REV-011 反向守卫断言
const REAL_CWD = process.cwd();

describe('init 命令', () => {
  let tmpDir: string;
  let homeDir: string;
  let program: Command;
  let exitMock: ReturnType<typeof vi.fn>;
  let errorMock: ReturnType<typeof vi.fn>;
  let logMock: ReturnType<typeof vi.fn>;
  let cwdMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-cmd-init-test-'));
    homeDir = mkdtempSync(join(tmpdir(), 'openfeel-home-'));
    mockHome.dir = homeDir;
    // 隔离 cwd（REV-011）：init 不传路径时使用 process.cwd()，必须指向临时目录，
    // 否则会经 writeDefaultConfig 无条件覆写仓库真实 .openfeel/config.yaml
    cwdMock = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    // mock process.exit 防止测试中断（exitOverride 也会调用 process.exit）
    exitMock = vi.spyOn(process, 'exit').mockImplementation((() => {
      // 不真正退出
    }) as never);
    // mock console.error 和 console.log 静默输出
    errorMock = vi.spyOn(console, 'error').mockImplementation(() => {});
    logMock = vi.spyOn(console, 'log').mockImplementation(() => {});
    // 每次创建全新的 Commander 实例，启用 exit override
    program = new Command();
    program.exitOverride(); // 将 process.exit 转为抛出 CommanderError
    registerInitCommand(program);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    rmSync(homeDir, { recursive: true, force: true });
    exitMock.mockRestore();
    errorMock.mockRestore();
    logMock.mockRestore();
    cwdMock.mockRestore();
  });

  it('应在临时目录中创建 .openfeel/ 目录', async () => {
    // from: 'user' 不自动跳过程序名，直接传命令参数
    await program.parseAsync(['init', tmpDir], { from: 'user' });

    // 验证 .openfeel/ 目录已创建
    const openfeelDir = join(tmpDir, '.openfeel');
    expect(existsSync(openfeelDir)).toBe(true);
    expect(existsSync(join(openfeelDir, 'config.yaml'))).toBe(true);
    expect(existsSync(join(openfeelDir, 'flow.json'))).toBe(true);

    // 项目精简：非交互模式不写项目 .opencode/
    expect(existsSync(join(tmpDir, '.opencode'))).toBe(false);
  });

  it('不存在的路径应报错退出', async () => {
    const badPath = join(tmpDir, 'nonexistent-subdir');

    try {
      await program.parseAsync(['init', badPath], { from: 'user' });
    } catch (err) {
      // exitOverride 将 exit(1) 转为 CommanderError 抛出
      expect(err).toBeInstanceOf(CommanderError);
    }

    // 验证输出了错误信息
    expect(errorMock).toHaveBeenCalledWith(
      expect.stringContaining('路径不存在'),
    );
  });

  it('不传路径时应使用当前工作目录（且不触达真实仓库根）', async () => {
    // 反向守卫（REV-011）：先记录真实仓库根 config.yaml 内容
    const repoConfig = join(REAL_CWD, '.openfeel', 'config.yaml');
    const repoBefore = existsSync(repoConfig) ? readFileSync(repoConfig, 'utf-8') : null;

    // 不传路径参数，init 使用 process.cwd()（已 mock 为 tmpDir）
    await program.parseAsync(['init'], { from: 'user' });

    // 正向：init 确实作用于 mock 的 cwd（临时目录）
    expect(existsSync(join(tmpDir, '.openfeel', 'config.yaml'))).toBe(true);
    expect(existsSync(join(tmpDir, '.openfeel', 'flow.json'))).toBe(true);

    // 反向：真实仓库根 config.yaml 未被覆写（内容逐字不变）
    if (repoBefore !== null) {
      expect(readFileSync(repoConfig, 'utf-8')).toBe(repoBefore);
    }
  });
});
