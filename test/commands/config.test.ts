/**
 * config 命令集成测试（v1.1.2-stage-42 op-002）
 * 覆盖 config effective（多键 / 单键 / 未知键 exit 1）。
 * 全部在隔离 HOME（mock node:os homedir）+ 临时项目 fixture 下运行，
 * 禁止依赖本项目真实 config.yaml / profile.yaml 值。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Command, CommanderError } from 'commander';
import { registerConfigCommand } from '../../src/commands/config.js';
import { FlowManager } from '../../src/core/flow-manager.js';
import { addStage } from '../../src/core/plan/stage.js';
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

  /** 写项目 config.yaml（原始内容，供 workflow_mode 等新增键） */
  function writeProjectConfigRaw(content: string): void {
    mkdirSync(join(tmpDir, '.openfeel'), { recursive: true });
    writeFileSync(join(tmpDir, '.openfeel', 'config.yaml'), content, 'utf-8');
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
    expect(out).toContain('merge_mode');
    expect(out).toContain('workflow_mode');
    // auto_advance 有效值取项目 config（disabled），来源标注 config.yaml
    expect(out).toContain('disabled');
    expect(out).toMatch(/auto_advance.*config\.yaml/);
    expect(out).toMatch(/\[(来源|source):/);
  });

  it('config effective workflow_mode 单键输出（来源 config.yaml）', async () => {
    writeProjectConfigRaw('defaults:\n  auto_advance: disabled\n  workflow_mode: full\n');

    await safeParse(['config', 'effective', 'workflow_mode']);

    const out = stdout();
    expect(out).toContain('workflow_mode');
    expect(out).toMatch(/workflow_mode.*config\.yaml/);
  });

  it('T7.5（CLI 半段）：隔离 HOME 无 config.yaml → auto_advance=builtin（翻转后 enabled）[REV-74-008]', async () => {
    // 隔离 HOME 指向不存在路径（无 profile.yaml），且不写 config.yaml
    mockHome.dir = join(tmpDir, 'no-such-home');

    await safeParse(['config', 'effective', 'auto_advance']);

    const out = stdout();
    expect(out).toContain('enabled');
    expect(out).toMatch(/auto_advance.*builtin/);
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

  // ═══ v1.1.4-stage-63 op-002：config set --sync-stages 批量同步（T6.7 / T6.9） ═══

  const stageStatusPath = (stage: string): string =>
    join(tmpDir, '.openfeel', 'plan', 'v1', stage, 'status.md');

  /** 建两阶段（flow.json 注册 + status.md 骨架） */
  function setupTwoStages(): void {
    FlowManager.initFlow(tmpDir);
    addStage(tmpDir, 'stage-01');
    addStage(tmpDir, 'stage-02');
  }

  it('T6.7：--sync-stages 写 auto_advance=自动推进；同值 no-op 逐字节不变', async () => {
    setupTwoStages();
    // stage-74：DEFAULT_CONFIG.auto_advance 翻转 enabled → 新建骨架初值为 enabled，同步目标改为 disabled 以构成真实变更
    await safeParse(['config', 'set', 'auto_advance', 'disabled', '--sync-stages']);
    expect(exitMock).not.toHaveBeenCalled();
    expect(readFileSync(stageStatusPath('stage-01'), 'utf-8')).toContain('- **自动推进**：disabled');
    expect(readFileSync(stageStatusPath('stage-02'), 'utf-8')).toContain('- **自动推进**：disabled');
    expect(stdout()).toContain('已更新');

    // 同值再执行 → 两 status.md 逐字节不变 + noop 输出
    const before1 = readFileSync(stageStatusPath('stage-01'), 'utf-8');
    const before2 = readFileSync(stageStatusPath('stage-02'), 'utf-8');
    logMock.mockClear();
    await safeParse(['config', 'set', 'auto_advance', 'disabled', '--sync-stages']);
    expect(readFileSync(stageStatusPath('stage-01'), 'utf-8')).toBe(before1);
    expect(readFileSync(stageStatusPath('stage-02'), 'utf-8')).toBe(before2);
    expect(stdout()).toContain('已是目标值');
  });

  it('T6.7：--sync-stages 写 execution_mode=执行模式为 auto', async () => {
    setupTwoStages();

    await safeParse(['config', 'set', 'execution_mode', 'auto', '--sync-stages']);

    expect(exitMock).not.toHaveBeenCalled();
    expect(readFileSync(stageStatusPath('stage-01'), 'utf-8')).toContain('- **执行模式**：auto');
    expect(readFileSync(stageStatusPath('stage-02'), 'utf-8')).toContain('- **执行模式**：auto');
  });

  it('T6.7：--sync-stages merge_mode 无阶段字段 → exit 0 且 stderr 报告未找到', async () => {
    setupTwoStages();
    errorMock.mockClear();

    await safeParse(['config', 'set', 'merge_mode', 'auto', '--sync-stages']);

    expect(exitMock).not.toHaveBeenCalled();
    expect(stderr()).toContain('未找到');
  });

  it('T6.9：--global --sync-stages 组合 → exit 1 且明确报错', async () => {
    exitMock.mockImplementation((() => {
      throw new Error('__EXIT__');
    }) as never);

    let thrown: unknown;
    try {
      await safeParse(['config', 'set', 'auto_advance', 'enabled', '--global', '--sync-stages']);
    } catch (err) {
      thrown = err;
    }

    expect((thrown as Error)?.message).toBe('__EXIT__');
    expect(exitMock).toHaveBeenCalledWith(1);
    expect(stderr()).toContain('--sync-stages');
  });

  // ═══ v1.1.7-stage-75 op-003：--stage 限定 + inserted / skipped-no-anchor + 冗余写入 ═══

  /** 删除 status.md 的「工作流模式」行（模拟旧版骨架） */
  function dropWorkflowModeLine(stage: string): void {
    const p = stageStatusPath(stage);
    writeFileSync(p, readFileSync(p, 'utf-8').split('\n').filter((l) => !l.includes('工作流模式')).join('\n'), 'utf-8');
  }

  /** 改写 status.md 的「工作流模式」行值 */
  function setWorkflowModeLine(stage: string, mode: string): void {
    const p = stageStatusPath(stage);
    writeFileSync(p, readFileSync(p, 'utf-8').replace(/\*\*工作流模式\*\*[：:]\s*\w+/, `**工作流模式**：${mode}`), 'utf-8');
  }

  function flowJson(): Record<string, { workflow_mode?: string }> {
    return JSON.parse(readFileSync(join(tmpDir, '.openfeel', 'flow.json'), 'utf-8')).stages;
  }

  it('T7.7a：批量插入 → inserted 分支 + .bak 生成 + 汇总「同步 0 / 插入 2 / 跳过 0」', async () => {
    setupTwoStages();
    dropWorkflowModeLine('stage-01');
    dropWorkflowModeLine('stage-02');

    await safeParse(['config', 'set', 'workflow_mode', 'full', '--sync-stages']);

    expect(exitMock).not.toHaveBeenCalled();
    expect(readFileSync(stageStatusPath('stage-01'), 'utf-8')).toContain('- **工作流模式**：full');
    expect(readFileSync(stageStatusPath('stage-02'), 'utf-8')).toContain('- **工作流模式**：full');
    expect(stdout()).toContain('插入');
    expect(stdout()).toContain('同步 0 / 插入 2 / 跳过 0');
    // 插入路径生成 .bak
    expect(existsSync(join(tmpDir, '.openfeel', 'tmp', 'status.v1.0.0-stage-01.bak'))).toBe(true);
    // 冗余字段同步
    expect(flowJson()['v1.0.0-stage-01'].workflow_mode).toBe('full');
    expect(flowJson()['v1.0.0-stage-02'].workflow_mode).toBe('full');
  });

  it('T7.7b：分类正确（noop + updated）→ 汇总计数准确', async () => {
    setupTwoStages();
    setWorkflowModeLine('stage-01', 'full'); // 已同值 → noop
    setWorkflowModeLine('stage-02', 'fast'); // 需更新 → updated

    await safeParse(['config', 'set', 'workflow_mode', 'full', '--sync-stages']);

    expect(exitMock).not.toHaveBeenCalled();
    expect(readFileSync(stageStatusPath('stage-02'), 'utf-8')).toContain('- **工作流模式**：full');
    expect(stdout()).toContain('已是目标值');
    expect(stdout()).toContain('同步 1 / 插入 0 / 跳过 1');
    // noop 阶段不触发冗余改写（仍为新建时写入的 config 默认 fast）
    expect(flowJson()['v1.0.0-stage-01'].workflow_mode).toBe('fast');
    expect(flowJson()['v1.0.0-stage-02'].workflow_mode).toBe('full');
  });

  it('T7.7c：--stage 限定（空格写法）→ 仅前两者被写；第三阶段逐字不变；逗号写法等价', async () => {
    FlowManager.initFlow(tmpDir);
    addStage(tmpDir, 'stage-01');
    addStage(tmpDir, 'stage-02');
    addStage(tmpDir, 'stage-03');
    for (const s of ['stage-01', 'stage-02', 'stage-03']) {
      setWorkflowModeLine(s, 'fast');
    }
    const before3 = readFileSync(stageStatusPath('stage-03'), 'utf-8');

    await safeParse(['config', 'set', 'workflow_mode', 'full', '--sync-stages', '--stage', 'stage-01', 'stage-02']);

    expect(exitMock).not.toHaveBeenCalled();
    expect(readFileSync(stageStatusPath('stage-01'), 'utf-8')).toContain('- **工作流模式**：full');
    expect(readFileSync(stageStatusPath('stage-02'), 'utf-8')).toContain('- **工作流模式**：full');
    expect(readFileSync(stageStatusPath('stage-03'), 'utf-8')).toBe(before3);
    expect(stdout()).toContain('同步 2 / 插入 0 / 跳过 0');

    // 逗号写法等价（单参数 a,b）
    logMock.mockClear();
    await safeParse(['config', 'set', 'workflow_mode', 'fast', '--sync-stages', '--stage', 'stage-01,stage-02']);
    expect(readFileSync(stageStatusPath('stage-01'), 'utf-8')).toContain('- **工作流模式**：fast');
    expect(readFileSync(stageStatusPath('stage-02'), 'utf-8')).toContain('- **工作流模式**：fast');
    expect(readFileSync(stageStatusPath('stage-03'), 'utf-8')).toBe(before3);
  });

  it('T7.7d：未注册 --stage → exit 1 + 建议名 + 前置零写盘', async () => {
    setupTwoStages();
    const cfgPath = join(tmpDir, '.openfeel', 'config.yaml');
    const cfgExisted = existsSync(cfgPath);
    const cfgBefore = cfgExisted ? readFileSync(cfgPath, 'utf-8') : '';
    const s1 = readFileSync(stageStatusPath('stage-01'), 'utf-8');

    await safeParse(['config', 'set', 'workflow_mode', 'full', '--sync-stages', '--stage', 'bogus-x']);

    expect(exitMock).toHaveBeenCalledWith(1);
    expect(stderr()).toContain('bogus-x');
    expect(stderr()).toContain('建议名称');
    // config.yaml 未被创建/改写；status.md 未写
    expect(existsSync(cfgPath)).toBe(cfgExisted);
    if (cfgExisted) {
      expect(readFileSync(cfgPath, 'utf-8')).toBe(cfgBefore);
    }
    expect(readFileSync(stageStatusPath('stage-01'), 'utf-8')).toBe(s1);
  });

  it('T7.7e：单独 --stage / --global --stage → exit 1', async () => {
    setupTwoStages();

    await safeParse(['config', 'set', 'auto_advance', 'disabled', '--stage', 'stage-01']);
    expect(exitMock).toHaveBeenCalledWith(1);
    expect(stderr()).toContain('--sync-stages');

    exitMock.mockClear();
    await safeParse(['config', 'set', 'auto_advance', 'disabled', '--global', '--sync-stages', '--stage', 'stage-01']);
    expect(exitMock).toHaveBeenCalledWith(1);
    expect(stderr()).toContain('--stage');
  });

  it('T7.7f：done 阶段显式列入 → 不做 phase 过滤，正常处理并报告', async () => {
    setupTwoStages();
    const mgr = new FlowManager(tmpDir);
    mgr.getData()!.stages['v1.0.0-stage-01'].phase = 'done';
    mgr.save();
    setWorkflowModeLine('stage-01', 'fast');

    await safeParse(['config', 'set', 'workflow_mode', 'full', '--sync-stages', '--stage', 'stage-01']);

    expect(exitMock).not.toHaveBeenCalled();
    expect(readFileSync(stageStatusPath('stage-01'), 'utf-8')).toContain('- **工作流模式**：full');
    expect(stdout()).toContain('同步 1 / 插入 0 / 跳过 0');
  });

  it('T7.7g：幂等 → 第二次执行全 noop、flow.json 与 status.md 零写盘', async () => {
    setupTwoStages();
    dropWorkflowModeLine('stage-01');
    dropWorkflowModeLine('stage-02');
    await safeParse(['config', 'set', 'workflow_mode', 'full', '--sync-stages']);

    const flowBefore = readFileSync(join(tmpDir, '.openfeel', 'flow.json'), 'utf-8');
    const s1 = readFileSync(stageStatusPath('stage-01'), 'utf-8');
    const s2 = readFileSync(stageStatusPath('stage-02'), 'utf-8');
    logMock.mockClear();

    await safeParse(['config', 'set', 'workflow_mode', 'full', '--sync-stages']);

    expect(exitMock).not.toHaveBeenCalled();
    expect(stdout()).toContain('同步 0 / 插入 0 / 跳过 2');
    expect(readFileSync(join(tmpDir, '.openfeel', 'flow.json'), 'utf-8')).toBe(flowBefore);
    expect(readFileSync(stageStatusPath('stage-01'), 'utf-8')).toBe(s1);
    expect(readFileSync(stageStatusPath('stage-02'), 'utf-8')).toBe(s2);
  });

  it('T7.7h：锚点缺失 → skipped-no-anchor 计入跳过、退出码 0、stderr 报告', async () => {
    FlowManager.initFlow(tmpDir);
    addStage(tmpDir, 'stage-01');
    // 手工破坏：status.md 仅「状态」行（无锚点）
    writeFileSync(stageStatusPath('stage-01'), '# x\n\n- **状态**：planned\n', 'utf-8');
    const before = readFileSync(stageStatusPath('stage-01'), 'utf-8');

    await safeParse(['config', 'set', 'workflow_mode', 'full', '--sync-stages']);

    expect(exitMock).not.toHaveBeenCalled();
    expect(stderr()).toContain('插入锚点');
    expect(stdout()).toContain('同步 0 / 插入 0 / 跳过 1');
    expect(readFileSync(stageStatusPath('stage-01'), 'utf-8')).toBe(before);
  });

  it('T7.7i：非法键（merge_mode）零回归 → skipped-no-field 计入跳过', async () => {
    setupTwoStages();
    errorMock.mockClear();

    await safeParse(['config', 'set', 'merge_mode', 'auto', '--sync-stages']);

    expect(exitMock).not.toHaveBeenCalled();
    expect(stderr()).toContain('未找到');
    expect(stdout()).toContain('同步 0 / 插入 0 / 跳过 2');
  });
});
