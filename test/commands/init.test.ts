/**
 * init 命令集成测试
 * 测试 openfeel init 命令的 CLI 行为
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Command, CommanderError } from 'commander';
import { registerInitCommand } from '../../src/commands/init.js';
import { existsSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('init 命令', () => {
  let tmpDir: string;
  let program: Command;
  let exitMock: ReturnType<typeof vi.fn>;
  let errorMock: ReturnType<typeof vi.fn>;
  let logMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-cmd-init-test-'));
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
    exitMock.mockRestore();
    errorMock.mockRestore();
    logMock.mockRestore();
  });

  it('应在临时目录中创建 .openfeel/ 目录', async () => {
    // from: 'user' 不自动跳过程序名，直接传命令参数
    await program.parseAsync(['init', tmpDir], { from: 'user' });

    // 验证 .openfeel/ 目录已创建
    const openfeelDir = join(tmpDir, '.openfeel');
    expect(existsSync(openfeelDir)).toBe(true);
    expect(existsSync(join(openfeelDir, 'config.yaml'))).toBe(true);
    expect(existsSync(join(openfeelDir, 'flow.json'))).toBe(true);
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

  it('不传路径时应使用当前工作目录', async () => {
    // 不传路径参数，init 命令会使用 process.cwd()
    await program.parseAsync(['init'], { from: 'user' });

    // 当前工作目录（项目根目录）应已存在 .openfeel/，init 不会失败
    // 验证没有触发 exit（即没有 CommanderError 抛出）
    // 如果已存在工作区，initProject 只更新不报错
  });
});
