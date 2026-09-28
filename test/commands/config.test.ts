/**
 * config 命令集成测试（v1.1.2-stage-42 op-002）
 * 覆盖 config effective（多键 / 单键 / 未知键 exit 1）。
 * 全部在隔离 HOME（mock node:os homedir）+ 临时项目 fixture 下运行，
 * 禁止依赖本项目真实 config.yaml / profile.yaml 值。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Command, CommanderError } from 'commander';
import { registerConfigCommand } from '../../src/commands/config.js';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// mock homedir：隔离全局 profile / 全局配置读写
const mockHome = vi.hoisted(() => ({ dir: '' }));
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => mockHome.dir };
});

describe('config 命令（stage-42 op-002）', () => {
  let tmpDir: string;
  let program: Command;
  let logMock: ReturnType<typeof vi.fn>;
  let errorMock: ReturnType<typeof vi.fn>;
  let cwdMock: ReturnType<typeof vi.fn>;
  let exitMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-cmd-config-test-'));
    mockHome.dir = tmpDir;
    logMock = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorMock = vi.spyOn(console, 'error').mockImplementation(() => {});
    cwdMock = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    exitMock = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);

    program = new Command();
    program.exitOverride();
    registerConfigCommand(program);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    mockHome.dir = '';
    logMock.mockRestore();
    errorMock.mockRestore();
    cwdMock.mockRestore();
    exitMock.mockRestore();
  });

  /** 安全解析命令，捕获 CommanderError 不使测试中断 */
  async function safeParse(args: string[]): Promise<void> {
    try {
      await program.parseAsync(args, { from: 'user' });
    } catch (err) {
      if (!(err instanceof CommanderError)) {
        throw err;
      }
    }
  }

  /** 写项目 config.yaml（defaults.auto_advance） */
  function writeProjectConfig(autoAdvance: string): void {
    mkdirSync(join(tmpDir, '.openfeel'), { recursive: true });
    writeFileSync(join(tmpDir, '.openfeel', 'config.yaml'), `defaults:\n  auto_advance: ${autoAdvance}\n`, 'utf-8');
  }

  /** 写隔离 HOME 下的全局画像 preferences.auto_advance */
  function writeGlobalProfile(autoAdvance: string): void {
    const dir = join(tmpDir, '.config', 'openfeel');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'profile.yaml'), `preferences:\n  auto_advance: ${autoAdvance}\n`, 'utf-8');
  }

  function stdout(): string {
    return logMock.mock.calls.map((c) => c[0] as string).join('\n');
  }

  function stderr(): string {
    return errorMock.mock.calls.map((c) => c[0] as string).join('\n');
  }

  it('config effective 输出四键，且 auto_advance 来源为 config.yaml（项目优先于画像）', async () => {
    writeGlobalProfile('enabled');
    writeProjectConfig('disabled');

    await safeParse(['config', 'effective']);

    const out = stdout();
    // 四键齐全
    expect(out).toContain('execution_mode');
    expect(out).toContain('auto_advance');
    expect(out).toContain('test_enabled');
    expect(out).toContain('merge_mode');
    // auto_advance 有效值取项目 config（disabled），来源标注 config.yaml
    expect(out).toContain('disabled');
    expect(out).toMatch(/auto_advance.*config\.yaml/);
    expect(out).toMatch(/\[(来源|source):/);
  });

  it('config effective auto_advance 单键输出', async () => {
    writeGlobalProfile('enabled');
    writeProjectConfig('disabled');

    await safeParse(['config', 'effective', 'auto_advance']);

    const lines = logMock.mock.calls.map((c) => c[0] as string);
    const out = lines.join('\n');
    expect(out).toContain('auto_advance');
    expect(out).toContain('config.yaml');
    // 单键模式：不出现标题行（四键表格才打印标题）
    expect(out).not.toContain('merge_mode');
  });

  it('config effective bogus 未知键 → stderr 报错并 exit 1', async () => {
    writeProjectConfig('disabled');
    // 还原真实终止语义：process.exit 抛哨兵，避免 mock 为 no-op 后继续执行
    exitMock.mockImplementation((() => {
      throw new Error('__EXIT__');
    }) as never);

    let thrown: unknown;
    try {
      await safeParse(['config', 'effective', 'bogus']);
    } catch (err) {
      thrown = err;
    }

    expect((thrown as Error)?.message).toBe('__EXIT__');
    expect(exitMock).toHaveBeenCalledWith(1);
    expect(stderr()).toMatch(/(未知配置键|Unknown config key)/);
    expect(stdout()).not.toContain('bogus');
  });

  it('画像兜底：项目无 auto_advance 声明 + 画像 enabled → 来源 profile.yaml', async () => {
    writeGlobalProfile('enabled');
    // 项目 config 存在但不含 auto_advance
    mkdirSync(join(tmpDir, '.openfeel'), { recursive: true });
    writeFileSync(join(tmpDir, '.openfeel', 'config.yaml'), 'defaults:\n  execution_mode: manual\n', 'utf-8');

    await safeParse(['config', 'effective', 'auto_advance']);

    expect(stdout()).toMatch(/auto_advance.*profile\.yaml/);
  });
});
