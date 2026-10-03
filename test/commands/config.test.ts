/**
 * config 命令集成测试（v1.1.2-stage-42 op-002）
 * 覆盖 config effective（多键 / 单键 / 未知键 exit 1）。
 * 全部在隔离 HOME（mock node:os homedir）+ 临时项目 fixture 下运行，
 * 禁止依赖本项目真实 config.yaml / profile.yaml 值。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Command, CommanderError } from 'commander';
import { registerConfigCommand } from '../../src/commands/config.js';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
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
  let prevLogEnv: string | undefined;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-cmd-config-test-'));
    mockHome.dir = tmpDir;
    // 隔离运行时日志副作用（防写入真实用户目录）
    prevLogEnv = process.env.OPENFEEL_LOG;
    process.env.OPENFEEL_LOG = '0';
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
    // 还原运行时日志环境变量
    if (prevLogEnv === undefined) {
      delete process.env.OPENFEEL_LOG;
    } else {
      process.env.OPENFEEL_LOG = prevLogEnv;
    }
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

  it('config effective 输出三键，且 auto_advance 来源为 config.yaml（项目优先于画像）', async () => {
    writeGlobalProfile('enabled');
    writeProjectConfig('disabled');

    await safeParse(['config', 'effective']);

    const out = stdout();
    // 三键齐全
    expect(out).toContain('execution_mode');
    expect(out).toContain('auto_advance');
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
    // 单键模式：不出现标题行（三键表格才打印标题）
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

  it('config set --global 遇非法 profile.yaml → 拒绝覆盖（exit 1，文件字节不变）', async () => {
    // stage-48 op-005 遗留 #8：非法 profile 不得被整体覆写
    const dir = join(tmpDir, '.config', 'openfeel');
    mkdirSync(dir, { recursive: true });
    const broken = '{{{{ broken: [unclosed\n';
    writeFileSync(join(dir, 'profile.yaml'), broken, 'utf-8');
    // 还原真实终止语义：process.exit 抛哨兵，避免 mock no-op 后继续执行
    exitMock.mockImplementation((() => {
      throw new Error('__EXIT__');
    }) as never);

    let thrown: unknown;
    try {
      await safeParse(['config', 'set', 'preferences.auto_advance', 'enabled', '--global']);
    } catch (err) {
      thrown = err;
    }

    expect((thrown as Error)?.message).toBe('__EXIT__');
    expect(exitMock).toHaveBeenCalledWith(1);
    expect(stderr()).toMatch(/profile/);
    // 文件字节不变（未被覆盖）
    expect(readFileSync(join(dir, 'profile.yaml'), 'utf-8')).toBe(broken);
  });

  it('画像兜底：项目无 auto_advance 声明 + 画像 enabled → 来源 profile.yaml', async () => {
    writeGlobalProfile('enabled');
    // 项目 config 存在但不含 auto_advance
    mkdirSync(join(tmpDir, '.openfeel'), { recursive: true });
    writeFileSync(join(tmpDir, '.openfeel', 'config.yaml'), 'defaults:\n  execution_mode: manual\n', 'utf-8');

    await safeParse(['config', 'effective', 'auto_advance']);

    expect(stdout()).toMatch(/auto_advance.*profile\.yaml/);
  });

  // ═══ stage-50 op-003：配置面一致性（T30/T33/T35/T36） ═══

  it('T30：config set --global __proto__ 不崩溃且明确报错（原型链穿透防护）', async () => {
    exitMock.mockImplementation((() => {
      throw new Error('__EXIT__');
    }) as never);

    let thrown: unknown;
    try {
      await safeParse(['config', 'set', '__proto__', 'x', '--global']);
    } catch (err) {
      thrown = err;
    }

    expect((thrown as Error)?.message).toBe('__EXIT__');
    expect(exitMock).toHaveBeenCalledWith(1);
    expect(stderr()).toMatch(/(无效的全局配置键|Invalid global config key)/);
  });

  it('T33：config get --global 遇非法 profile → stderr 警告，退出码不变（0）', async () => {
    const dir = join(tmpDir, '.config', 'openfeel');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'profile.yaml'), '{{{{ broken: [unclosed\n', 'utf-8');

    await safeParse(['config', 'get', 'user.name', '--global']);

    expect(exitMock).not.toHaveBeenCalled();
    expect(stderr()).toMatch(/(解析失败|Failed to parse)/);
  });

  it('T35：config 组与 get-lang 使用独立 help 键（无占位符泄漏）', () => {
    const cfg = program.commands.find((c) => c.name() === 'config');
    expect(cfg).toBeDefined();
    expect(cfg!.description()).toBeTruthy();
    expect(cfg!.description()).not.toContain('{lang}');
    const gl = cfg!.commands.find((c) => c.name() === 'get-lang');
    expect(gl).toBeDefined();
    expect(gl!.description()).not.toContain('{lang}');
  });

  it('T36：3 键 round-trip（set → get 回读同值）', async () => {
    const cases: Array<[string, string]> = [
      ['execution_mode', 'auto'],
      ['auto_advance', 'enabled'],
      ['merge_mode', 'auto'],
    ];
    for (const [k, v] of cases) {
      await safeParse(['config', 'set', k, v]);
    }
    for (const [k, v] of cases) {
      logMock.mockClear();
      await safeParse(['config', 'get', k]);
      expect(stdout()).toContain(v);
    }
  });

  it('T36：枚举非法报错（exit 1）且不写盘', async () => {
    writeProjectConfig('manual');
    const before = readFileSync(join(tmpDir, '.openfeel', 'config.yaml'), 'utf-8');
    exitMock.mockImplementation((() => {
      throw new Error('__EXIT__');
    }) as never);

    let thrown: unknown;
    try {
      await safeParse(['config', 'set', 'execution_mode', 'foo']);
    } catch (err) {
      thrown = err;
    }

    expect((thrown as Error)?.message).toBe('__EXIT__');
    expect(exitMock).toHaveBeenCalledWith(1);
    expect(stderr()).toMatch(/(无效的值|Invalid value)/);
    // 文件未变
    expect(readFileSync(join(tmpDir, '.openfeel', 'config.yaml'), 'utf-8')).toBe(before);
  });

  it('T36：未知键报 invalidKey 且 exit 1', async () => {
    exitMock.mockImplementation((() => {
      throw new Error('__EXIT__');
    }) as never);
    let thrown: unknown;
    try {
      await safeParse(['config', 'set', 'bogus_key', 'x']);
    } catch (err) {
      thrown = err;
    }
    expect((thrown as Error)?.message).toBe('__EXIT__');
    expect(exitMock).toHaveBeenCalledWith(1);
    expect(stderr()).toMatch(/(无效的配置键|Invalid config key)/);
  });

  // ═══ v1.1.4-stage-63 op-001：键名归一（defaults.X ≡ X） ═══

  const configPath = (): string => join(tmpDir, '.openfeel', 'config.yaml');

  it('T6.4c：config set defaults.execution_mode 与 bare 键写盘等价', async () => {
    await safeParse(['config', 'set', 'defaults.execution_mode', 'auto']);
    expect(exitMock).not.toHaveBeenCalled();
    expect(readFileSync(configPath(), 'utf-8')).toContain('execution_mode: auto');

    // 归一后 bare 键写同一 defaults 键（结果等价）
    await safeParse(['config', 'set', 'execution_mode', 'auto']);
    expect(exitMock).not.toHaveBeenCalled();
    expect(readFileSync(configPath(), 'utf-8')).toContain('execution_mode: auto');
  });

  it('T6.5：config get defaults.execution_mode 返回 config 默认值（与 bare 等价）', async () => {
    mkdirSync(join(tmpDir, '.openfeel'), { recursive: true });
    writeFileSync(configPath(), 'defaults:\n  execution_mode: auto\n', 'utf-8');

    await safeParse(['config', 'get', 'defaults.execution_mode']);
    const viaPrefix = stdout();
    expect(viaPrefix).toContain('auto');

    logMock.mockClear();
    await safeParse(['config', 'get', 'execution_mode']);
    const viaBare = stdout();
    expect(viaBare).toContain('auto');
    // 值等价（键名回显不同：一个含 defaults. 前缀）
    expect(viaPrefix).toContain('auto');
    expect(viaBare).toContain('auto');
  });

  it('T6.6：config set test_enabled true → 无效键 exit 1 且不写盘（跨阶段回归）', async () => {
    exitMock.mockImplementation((() => {
      throw new Error('__EXIT__');
    }) as never);
    let thrown: unknown;
    try {
      await safeParse(['config', 'set', 'test_enabled', 'true']);
    } catch (err) {
      thrown = err;
    }
    expect((thrown as Error)?.message).toBe('__EXIT__');
    expect(exitMock).toHaveBeenCalledWith(1);
    expect(stderr()).toMatch(/(无效的配置键|Invalid config key)/);
    // 文件未被写入（不存在）
    expect(existsSync(configPath())).toBe(false);
  });

  it('T6.4d：非法值 defaults.execution_mode bogus → exit 1 且不写盘', async () => {
    mkdirSync(join(tmpDir, '.openfeel'), { recursive: true });
    writeFileSync(configPath(), 'defaults:\n  execution_mode: manual\n', 'utf-8');
    const before = readFileSync(configPath(), 'utf-8');
    exitMock.mockImplementation((() => {
      throw new Error('__EXIT__');
    }) as never);
    let thrown: unknown;
    try {
      await safeParse(['config', 'set', 'defaults.execution_mode', 'bogus']);
    } catch (err) {
      thrown = err;
    }
    expect((thrown as Error)?.message).toBe('__EXIT__');
    expect(exitMock).toHaveBeenCalledWith(1);
    expect(readFileSync(configPath(), 'utf-8')).toBe(before);
  });

  it('T6.4d：未知键 defaults.bogus → 白名单拒绝 exit 1，错误含 defaults. 等价提示', async () => {
    exitMock.mockImplementation((() => {
      throw new Error('__EXIT__');
    }) as never);
    let thrown: unknown;
    try {
      await safeParse(['config', 'set', 'defaults.bogus', 'x']);
    } catch (err) {
      thrown = err;
    }
    expect((thrown as Error)?.message).toBe('__EXIT__');
    expect(exitMock).toHaveBeenCalledWith(1);
    // 错误文案回显 defaults. 等价说明
    expect(stderr()).toContain('defaults.');
  });
});
