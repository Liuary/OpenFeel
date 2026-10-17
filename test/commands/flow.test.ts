/**
 * flow 根命令集成测试（v1.1.2-stage-41）
 * 覆盖 flow phases（默认 / --json）与 flow stage remove（--dry-run / 非 TTY --purge 拒绝 / deps 引用）
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// N4 单点隔离（stage-48 op-002 / 事件 B）：homedir → 临时目录
// 根因：initProject → ensureGlobalConfig() 在全局 ~/.openfeel/config.json 不存在时会写真实全局文件（CI/新开发者）
const mockHome = vi.hoisted(() => ({ dir: '' }));
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => mockHome.dir };
});

// mock child_process：断言 advance 的 git 脏区检查是否被调用（N11-1），并避免真实 git
const mockedChild = vi.hoisted(() => ({ execSync: vi.fn(), execFileSync: vi.fn() }));
vi.mock('node:child_process', () => ({
  execSync: mockedChild.execSync,
  execFileSync: mockedChild.execFileSync,
}));

// mock @inquirer/prompts（stage-75 op-004 T7.6b/c）：wizard 的动态 await import 亦被模块级 mock 拦截
const mockedInquirer = vi.hoisted(() => ({ select: vi.fn(), input: vi.fn() }));
vi.mock('@inquirer/prompts', () => ({ select: mockedInquirer.select, input: mockedInquirer.input }));

import { Command, CommanderError } from 'commander';
import { registerFlowCommand, shouldPromptWorkflowMode } from '../../src/commands/flow.js';
import { registerStageCommand } from '../../src/commands/stage.js';
import { registerConfigCommand } from '../../src/commands/config.js';
import { registerPlanCommand } from '../../src/commands/plan.js';
import { registerArchiveCommand } from '../../src/commands/archive.js';
import { applyHelpI18n } from '../../src/cli/index.js';
import { setJsonMode, resetJsonModeForTest } from '../../src/commands/shared/json-output.js';
import { initProject } from '../../src/core/init.js';
import { t } from '../../src/core/i18n.js';
import { FlowManager, FlowConcurrentModificationError, type FlowData, type PipelinePhase, type MetaPhase, type StageData, type ReviewItem } from '../../src/core/flow-manager.js';
import { setConfigValue } from '../../src/core/config.js';
import { addStage } from '../../src/core/plan/stage.js';
import { splitForArchive } from '../../src/core/flow-archive/grouping.js';
import { writeArchiveFile } from '../../src/core/flow-archive/archive-ops.js';
import { ARCHIVE_SCHEMA_VERSION, type ArchiveFile } from '../../src/core/flow-archive/archive-file.js';
import { mkdtempSync, rmSync, readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync, statSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// op-003 真实工作区反守卫（REAL_CWD）：模块顶层捕获真实 flow.json 基线（cwdMock 注入前）
const REAL_CWD = process.cwd();
const REAL_FLOW_PATH = join(REAL_CWD, '.openfeel', 'flow.json');
const REAL_FLOW_RAW = existsSync(REAL_FLOW_PATH) ? readFileSync(REAL_FLOW_PATH, 'utf-8') : null;
// stage-86 op-001 反守卫：真实工作区 metrics.json 基线（模块顶层捕获，cwdMock 注入前）
const REAL_METRICS_PATH = join(REAL_CWD, '.openfeel', 'metrics.json');
const REAL_METRICS_RAW = existsSync(REAL_METRICS_PATH) ? readFileSync(REAL_METRICS_PATH, 'utf-8') : null;

describe('flow 命令（stage-41）', () => {
  let tmpDir: string;
  let program: Command;
  let logMock: ReturnType<typeof vi.fn>;
  let errorMock: ReturnType<typeof vi.fn>;
  let cwdMock: ReturnType<typeof vi.fn>;
  let exitMock: ReturnType<typeof vi.fn>;
  /** 原始 isTTY 值（测试中强制非 TTY，结束后恢复） */
  let originalIsTTY: boolean | undefined;

  beforeEach(async () => {
    // mock HOME 指向临时目录，确保 initProject 的全局配置写入不触碰真实 ~/.openfeel/
    mockHome.dir = mkdtempSync(join(tmpdir(), 'openfeel-cmd-flow-home-'));
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-cmd-flow-test-'));
    // 初始化工作区（temp 项目无 pipeline.yaml → 走默认 15 phase 配置）
    await initProject(tmpDir);
    // R-FIX（stage-74 op-004）：本文件既有用例基线 = full（内置默认 fast；fast CLI 用例归 stage-75）
    setConfigValue(tmpDir, 'workflow_mode', 'full');

    logMock = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorMock = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockedInquirer.select.mockReset();
    mockedInquirer.input.mockReset();
    cwdMock = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    exitMock = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);

    // 强制非 TTY：覆盖「非 TTY 拒绝 --purge」分支，避免测试环境为交互终端时进入 confirm
    originalIsTTY = process.stdout.isTTY;
    Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });

    program = new Command();
    program.exitOverride();
    registerFlowCommand(program);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    rmSync(mockHome.dir, { recursive: true, force: true });
    logMock.mockRestore();
    errorMock.mockRestore();
    cwdMock.mockRestore();
    exitMock.mockRestore();
    Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, configurable: true });
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

  /**
   * stage-96 op-001：flow next --json 测试辅助。
   * 命令层只读 isJsonMode()（stage-95 不变量 2），直接 parseAsync 的测试须显式置位并复位。
   */
  async function runNextJson(args: string[] = ['flow', 'next', '--json']): Promise<Record<string, unknown>> {
    logMock.mockClear();
    errorMock.mockClear();
    setJsonMode(true);
    try {
      await safeParse(args);
    } finally {
      resetJsonModeForTest();
    }
    const raw = logMock.mock.calls.map((c) => c[0] as string).join('\n');
    return JSON.parse(raw) as Record<string, unknown>;
  }

  // ── flow phases ──

  /** 写入缺组合键的 pipeline.yaml（模拟本仓现状；15 phase + 单键 transitions） */
  function writePipelineNoComposite(): void {
    const transitions: Record<string, string[]> = {
      plan_pending: ['plan_review', 'plan_passed'],
      plan_review: ['plan_passed', 'plan_pending'],
      plan_passed: ['scheme_pending'],
      scheme_pending: ['scheme_review', 'scheme_passed'],
      scheme_review: ['scheme_passed', 'scheme_pending'],
      scheme_passed: ['exec_running'],
      exec_running: ['review_pending', 'scheme_pending'],
      review_pending: ['review_failed', 'review_passed'],
      review_failed: ['review_pending', 'scheme_pending'],
      review_passed: ['test_pending'],
      test_pending: ['test_failed', 'test_passed'],
      test_failed: ['test_pending', 'scheme_pending'],
      test_passed: ['archiving'],
      archiving: ['done'],
      done: [],
    };
    writeFileSync(join(tmpDir, '.openfeel', 'pipeline.yaml'), JSON.stringify({
      phases: Object.keys(transitions),
      transitions,
      checkpoint_mapping: {},
      phase_corrections: {},
    }), 'utf-8');
  }

  it('flow phases 默认输出含全部 15 个 phase 与转移表', async () => {
    await safeParse(['flow', 'phases']);

    const phaseLines = logMock.mock.calls
      .map((c) => c[0] as string)
      .filter((line) => line.startsWith('  - '));
    expect(phaseLines).toHaveLength(15);

    const out = logMock.mock.calls.map((c) => c[0] as string).join('\n');
    expect(out).toContain('- plan_pending');
    expect(out).toContain('- done');
    expect(out).toContain('plan_pending → [plan_review, plan_passed]');
  });

  it('flow phases --json 可 JSON.parse，顶层键为 phases / transitions / advanceAccepted（+ T19 transitionsDiff）', async () => {
    writePipelineNoComposite();
    await safeParse(['flow', 'phases', '--json']);

    const raw = logMock.mock.calls[0][0] as string;
    const obj = JSON.parse(raw) as {
      phases: string[];
      transitions: Record<string, string[]>;
      advanceAccepted: string[];
      transitionsDiff: { missing: string[]; extra: string[]; changed: string[] };
    };
    // 既有三字段保留 + 追加 transitionsDiff（T19，向后兼容）
    expect(Object.keys(obj)).toEqual(expect.arrayContaining(['phases', 'transitions', 'advanceAccepted', 'transitionsDiff']));
    expect(obj.phases).toHaveLength(15);
    expect(obj.transitions['plan_pending']).toEqual(['plan_review', 'plan_passed']);
    // advanceAccepted = 内置 15 phase 推进白名单（cli/BUG-001 方案 B）
    expect(obj.advanceAccepted).toHaveLength(15);
    expect(obj.advanceAccepted).toContain('exec_running');
    // T19：本仓 pipeline.yaml 缺组合键 → transitionsDiff.missing 含之
    expect(obj.transitionsDiff.missing).toContain('review_passed|test_passed');
  });

  it('flow phases 在自定义 phase（pipeline.yaml 含 gate）下输出边界提示', async () => {
    // 写入含自定义 phase 的 pipeline.yaml（在 manager 构造前落盘）
    const customConfig = {
      phases: [
        'plan_pending', 'plan_review', 'plan_passed',
        'scheme_pending', 'scheme_review', 'scheme_passed',
        'exec_running', 'review_pending', 'review_failed',
        'review_passed', 'test_pending', 'test_failed',
        'test_passed', 'archiving', 'done', 'gate',
      ],
      transitions: { plan_pending: ['plan_review', 'plan_passed'] },
      checkpoint_mapping: {},
      phase_corrections: {},
    };
    writeFileSync(join(tmpDir, '.openfeel', 'pipeline.yaml'), JSON.stringify(customConfig), 'utf-8');

    await safeParse(['flow', 'phases', '--json']);
    const raw = logMock.mock.calls[0][0] as string;
    const obj = JSON.parse(raw) as { phases: string[]; advanceAccepted: string[] };
    // 存在视图含自定义 gate，但推进白名单仍为内置 15（不含 gate）
    expect(obj.phases).toContain('gate');
    expect(obj.advanceAccepted).toHaveLength(15);
    expect(obj.advanceAccepted).not.toContain('gate');

    logMock.mockClear();
    await safeParse(['flow', 'phases']);
    const out = logMock.mock.calls.map((c) => c[0] as string).join('\n');
    expect(out).toContain('gate');
    expect(out).toContain('内置 15 个 phase 之外');
  });

  it('flow phases 无自定义 phase 时不输出边界提示', async () => {
    await safeParse(['flow', 'phases']);
    const out = logMock.mock.calls.map((c) => c[0] as string).join('\n');
    expect(out).not.toContain('内置 15 个 phase 之外');
  });

  it('T19：无项目 pipeline.yaml 时 transitionsDiff 为空（运行时=内置默认）', async () => {
    rmSync(join(tmpDir, '.openfeel', 'pipeline.yaml'), { force: true });
    await safeParse(['flow', 'phases', '--json']);
    const raw = logMock.mock.calls[0][0] as string;
    const obj = JSON.parse(raw) as { transitionsDiff: { missing: string[]; extra: string[]; changed: string[] } };
    expect(obj.transitionsDiff.missing).toEqual([]);
    expect(obj.transitionsDiff.extra).toEqual([]);
    expect(obj.transitionsDiff.changed).toEqual([]);
  });

  it('T19：默认输出在存在漂移时打印差异提示（pipeline.yaml 缺组合键）', async () => {
    writePipelineNoComposite();
    await safeParse(['flow', 'phases']);
    const out = logMock.mock.calls.map((c) => c[0] as string).join('\n');
    expect(out).toContain('转移表与内置默认存在差异');
    expect(out).toContain('review_passed|test_passed');
  });

  // ── stage-75 op-002：flow mode / flow phases 模式分节 ──

  /** 写入一个含工作流模式字段的 status.md（存在性判定经 findStageStatusPath） */
  function writeStageStatus(stageDirName: string, workflowMode?: string): string {
    const dir = join(tmpDir, '.openfeel', 'plan', 'v1', stageDirName);
    mkdirSync(dir, { recursive: true });
    const p = join(dir, 'status.md');
    const modeLine = workflowMode ? `- **工作流模式**：${workflowMode}\n` : '';
    writeFileSync(p, `# v1.0.0-${stageDirName} 状态\n\n- **执行模式**：manual\n- **自动推进**：disabled\n${modeLine}- **状态**：planned\n`, 'utf-8');
    return p;
  }

  it('T7.11①：flow phases --mode fast → fast 表 + 模式分节行 + --json.workflowMode=fast + diff 全空', async () => {
    rmSync(join(tmpDir, '.openfeel', 'pipeline.yaml'), { force: true });

    await safeParse(['flow', 'phases', '--mode', 'fast']);
    const out = logMock.mock.calls.map((c) => c[0] as string).join('\n');
    expect(out).toContain('plan_pending → [plan_review]');
    expect(out).toContain('plan_review → [plan_passed, plan_pending]');
    expect(out).toContain('review_failed → [review_pending, exec_running]');
    expect(out).toContain('当前模式：fast');
    expect(out).toContain('[来源: --mode]');
    expect(out).toContain('openfeel flow mode');

    logMock.mockClear();
    await safeParse(['flow', 'phases', '--mode', 'fast', '--json']);
    const obj = JSON.parse(logMock.mock.calls[0][0] as string) as {
      workflowMode: string;
      transitionsDiff: { missing: string[]; extra: string[]; changed: string[] };
    };
    expect(obj.workflowMode).toBe('fast');
    expect(obj.transitionsDiff).toEqual({ missing: [], extra: [], changed: [] });
  });

  it('T7.11②：--stage（status.md 置 fast）→ 无 --mode 亦派生 fast 表', async () => {
    writeStageStatus('stage-01', 'fast');
    rmSync(join(tmpDir, '.openfeel', 'pipeline.yaml'), { force: true });

    await safeParse(['flow', 'phases', '--stage', 'v1.0.0-stage-01', '--json']);
    const obj = JSON.parse(logMock.mock.calls[0][0] as string) as { workflowMode: string; transitions: Record<string, string[]> };
    expect(obj.workflowMode).toBe('fast');
    expect(obj.transitions['plan_pending']).toEqual(['plan_review']);
  });

  it('T7.11③：缺省（config full）→ workflowMode === full（既有 full 基线）', async () => {
    await safeParse(['flow', 'phases', '--json']);
    const obj = JSON.parse(logMock.mock.calls[0][0] as string) as { workflowMode: string };
    expect(obj.workflowMode).toBe('full');
  });

  it('T7.11④：无任何来源 → builtin fast 兜底 + source 显示 builtin', async () => {
    rmSync(join(tmpDir, '.openfeel', 'config.yaml'), { force: true });

    await safeParse(['flow', 'mode']);
    const out = logMock.mock.calls.map((c) => c[0] as string).join('\n');
    expect(out).toContain('当前模式：fast');
    expect(out).toContain('[来源: builtin]');
  });

  it('T7.11⑤：--json 只增 workflowMode / reviewTier / displayReviewTier / effectiveReviewTier（既有五键不变）+ 人类输出仅新增 4 行', async () => {
    rmSync(join(tmpDir, '.openfeel', 'pipeline.yaml'), { force: true });
    await safeParse(['flow', 'phases', '--json']);
    const obj = JSON.parse(logMock.mock.calls[0][0] as string) as Record<string, unknown>;
    // 9 键 = 既有五键 + workflowMode + reviewTier（stage-92 op-001）+ displayReviewTier / effectiveReviewTier（stage-96 op-002 末位追加；“只增字段”）
    expect(Object.keys(obj)).toEqual(['schemaVersion', 'phases', 'transitions', 'advanceAccepted', 'transitionsDiff', 'workflowMode', 'reviewTier', 'displayReviewTier', 'effectiveReviewTier']);
    expect(obj.schemaVersion).toBe(1);
    expect((obj.phases as string[]).length).toBe(15);
    expect((obj.advanceAccepted as string[]).length).toBe(15);
    // 本仓基线模式 = full → 派生档位 = full（零裁剪）
    expect(obj.reviewTier).toBe('full');
    expect(obj.displayReviewTier).toBe(obj.reviewTier);
    expect(obj.effectiveReviewTier).toBe('full');

    logMock.mockClear();
    await safeParse(['flow', 'phases']);
    const lines = logMock.mock.calls.map((c) => c[0] as string);
    // 模式分节 2 行（既有）+ 档位分节 2 行（stage-92 op-001 新增）；档位行不匹配模式过滤器
    const newLines = lines.filter((l) => l.includes('当前模式：') || l.includes('openfeel flow mode'));
    expect(newLines).toHaveLength(2);
    const tierLines = lines.filter((l) => l.includes('审查档位：') || l.includes('--review-tier'));
    expect(tierLines).toHaveLength(2);
    expect(tierLines[0]).toContain('审查档位：full（模式派生自 full）');
    // 既有行仍逐字在（改前行集合 ⊆ 改后行集合）
    expect(lines).toContain('OpenFeel 流水线 phase 自描述');
    expect(lines).toContain('phase 流转映射（from → [to...]）:');
    expect(lines.some((l) => l.startsWith('  - plan_pending'))).toBe(true);
    expect(lines.some((l) => l.includes('plan_pending → [plan_review, plan_passed]'))).toBe(true);
  });

  it('T7.11⑥：transitionsDiff 同模式期望值（full 漂移可见 / fast 全空）', async () => {
    writePipelineNoComposite();
    await safeParse(['flow', 'phases', '--json']);
    const full = JSON.parse(logMock.mock.calls[0][0] as string) as { transitionsDiff: { missing: string[] } };
    expect(full.transitionsDiff.missing).toContain('review_passed|test_passed');

    logMock.mockClear();
    await safeParse(['flow', 'phases', '--mode', 'fast', '--json']);
    const fast = JSON.parse(logMock.mock.calls[0][0] as string) as { transitionsDiff: { missing: string[]; extra: string[]; changed: string[] } };
    // fast 走内置快线表（pipeline.yaml 仅覆盖 full 线）→ 同模式对比无差异
    expect(fast.transitionsDiff).toEqual({ missing: [], extra: [], changed: [] });
  });

  it('T7.11⑦：非法 --mode / 非法 --stage → exit 1', async () => {
    await safeParse(['flow', 'phases', '--mode', 'bogus']);
    expect(exitMock).toHaveBeenCalledWith(1);
    expect(errorMock.mock.calls.map((c) => c[0] as string).join('\n')).toContain('取值非法');

    exitMock.mockClear();
    await safeParse(['flow', 'phases', '--stage', 'bad id !!']);
    expect(exitMock).toHaveBeenCalledWith(1);

    exitMock.mockClear();
    await safeParse(['flow', 'phases', '--stage', 'v9.9-stage-99']);
    expect(exitMock).toHaveBeenCalledWith(1);
    expect(errorMock.mock.calls.map((c) => c[0] as string).join('\n')).toBeTruthy();
  });

  it('T7.4：flow mode 只读（输出模式/来源 + 三文件 SHA256 不变 + --json 结构）', async () => {
    const { createHash } = await import('node:crypto');
    const sha = (p: string): string => createHash('sha256').update(readFileSync(p)).digest('hex');
    const flowPath = join(tmpDir, '.openfeel', 'flow.json');
    const cfgPath = join(tmpDir, '.openfeel', 'config.yaml');
    writeStageStatus('stage-01', 'fast');
    // 注册阶段（使 phase 已知 → 可达目标行可渲染）
    const fm = new FlowManager(tmpDir);
    fm.registerStage('v1.0.0-stage-01');
    fm.save();
    const statusPath = join(tmpDir, '.openfeel', 'plan', 'v1', 'stage-01', 'status.md');
    const before = [sha(flowPath), sha(cfgPath), sha(statusPath)];

    await safeParse(['flow', 'mode', '--stage', 'v1.0.0-stage-01']);
    const out = logMock.mock.calls.map((c) => c[0] as string).join('\n');
    expect(out).toContain('当前模式：fast');
    expect(out).toContain('[来源: status.md]');
    expect(out).toContain('可达目标');

    expect([sha(flowPath), sha(cfgPath), sha(statusPath)]).toEqual(before);

    logMock.mockClear();
    await safeParse(['flow', 'mode', '--json']);
    const obj = JSON.parse(logMock.mock.calls[0][0] as string) as {
      schemaVersion: number; stage: string; mode: string; source: string; modes: { full: object; fast: object; general: object };
    };
    expect(Object.keys(obj)).toEqual(['schemaVersion', 'stage', 'mode', 'source', 'modes']);
    expect(obj.schemaVersion).toBe(1);
    expect(typeof obj.mode).toBe('string');
    expect(typeof obj.source).toBe('string');
    expect(typeof obj.modes.full).toBe('object');
    expect(typeof obj.modes.fast).toBe('object');
    expect(typeof obj.modes.general).toBe('object');
    expect([sha(flowPath), sha(cfgPath), sha(statusPath)]).toEqual(before);
  });

  it('T7.5①~③：来源三场景（status.md / config.yaml / builtin）', async () => {
    // ① status.md 有字段
    writeStageStatus('stage-02', 'fast');
    await safeParse(['flow', 'mode', '--stage', 'v1.0.0-stage-02']);
    expect(logMock.mock.calls.map((c) => c[0] as string).join('\n')).toContain('[来源: status.md]');

    // ② 无 stage 字段 + config.yaml 设值（beforeEach 设 full）
    logMock.mockClear();
    await safeParse(['flow', 'mode']);
    expect(logMock.mock.calls.map((c) => c[0] as string).join('\n')).toContain('[来源: config.yaml]');

    // ③ 全无 → builtin
    logMock.mockClear();
    rmSync(join(tmpDir, '.openfeel', 'config.yaml'), { force: true });
    await safeParse(['flow', 'mode']);
    expect(logMock.mock.calls.map((c) => c[0] as string).join('\n')).toContain('[来源: builtin]');
  });

  it('T7.5④：profile.yaml 不承载 workflow_mode（阴性边界）', async () => {
    // 全局画像显式声明 auto_advance（profile 层唯一承载键）
    mkdirSync(join(mockHome.dir, '.config', 'openfeel'), { recursive: true });
    writeFileSync(join(mockHome.dir, '.config', 'openfeel', 'profile.yaml'), 'preferences:\n  auto_advance: enabled\n  workflow_mode: fast\n', 'utf-8');

    await safeParse(['flow', 'mode']);
    const out = logMock.mock.calls.map((c) => c[0] as string).join('\n');
    expect(out).not.toContain('[来源: profile.yaml]');
    // 仍落到 config.yaml（beforeEach 设 full）
    expect(out).toContain('[来源: config.yaml]');
  });

  // ── stage-75 op-004：wizard 首次选型与项目级记忆（T7.6）──

  /** 强制 TTY（可用时恢复） */
  function setTty(value: boolean): void {
    Object.defineProperty(process.stdin, 'isTTY', { value, configurable: true });
    Object.defineProperty(process.stdout, 'isTTY', { value, configurable: true });
  }

  it('T7.6a：shouldPromptWorkflowMode 决策矩阵 4 态', () => {
    expect(shouldPromptWorkflowMode(false, false)).toBe('prompt');
    expect(shouldPromptWorkflowMode(true, false)).toBe('skip');
    expect(shouldPromptWorkflowMode(false, true)).toBe('skip');
    expect(shouldPromptWorkflowMode(true, true)).toBe('skip');
  });

  it('T7.6b：TTY 首次询问 → 选 fast → status.md 插入 + config.yaml 记忆 + 输出「已记忆」', async () => {
    const cfgPath = join(tmpDir, '.openfeel', 'config.yaml');
    // 项目未显式设 defaults.workflow_mode（裸 YAML 读判定）
    writeFileSync(cfgPath, 'defaults:\n  execution_mode: manual\n  auto_advance: enabled\n', 'utf-8');
    addStage(tmpDir, 'stage-01');
    // 造「旧版」骨架：无工作流模式字段
    const statusPath = join(tmpDir, '.openfeel', 'plan', 'v1', 'stage-01', 'status.md');
    writeFileSync(statusPath, readFileSync(statusPath, 'utf-8').split('\n').filter((l) => !l.includes('工作流模式')).join('\n'), 'utf-8');

    mockedInquirer.select.mockResolvedValueOnce('fast').mockResolvedValueOnce('__exit__');
    setTty(true);
    try {
      await safeParse(['flow', 'wizard']);
    } finally {
      setTty(false);
    }

    expect(exitMock).not.toHaveBeenCalled();
    expect(readFileSync(statusPath, 'utf-8')).toContain('- **工作流模式**：fast');
    const cfg = readFileSync(cfgPath, 'utf-8');
    expect(cfg).toContain('workflow_mode: fast');
    // 其余 defaults 键逐字保留
    expect(cfg).toContain('execution_mode: manual');
    expect(cfg).toContain('auto_advance: enabled');
    expect(logMock.mock.calls.map((c) => c[0] as string).join('\n')).toContain('已记忆');
    // 第一次 select = 模式询问，第二次 = 阶段动作选择
    expect(mockedInquirer.select.mock.calls[0][0].message).toBe('首次配置：请选择本阶段的工作流模式');
  });

  it('T7.6c：字段已写 / 项目已设默认 → 二次不询问', async () => {
    const cfgPath = join(tmpDir, '.openfeel', 'config.yaml');
    writeFileSync(cfgPath, 'defaults:\n  execution_mode: manual\n  workflow_mode: full\n', 'utf-8');
    addStage(tmpDir, 'stage-01');

    mockedInquirer.select.mockResolvedValueOnce('__exit__');
    setTty(true);
    try {
      await safeParse(['flow', 'wizard']);
    } finally {
      setTty(false);
    }

    // 仅 1 次 select（阶段动作选择），未出现模式询问
    expect(mockedInquirer.select).toHaveBeenCalledTimes(1);
    expect(mockedInquirer.select.mock.calls[0][0].message).not.toBe('首次配置：请选择本阶段的工作流模式');
  });

  it('T7.6d：非 TTY → 零写盘（T39 口径：exitCode=1 + nonTtyHint）', async () => {
    addStage(tmpDir, 'stage-01');
    const cfgPath = join(tmpDir, '.openfeel', 'config.yaml');
    const cfgBefore = readFileSync(cfgPath, 'utf-8');
    const statusPath = join(tmpDir, '.openfeel', 'plan', 'v1', 'stage-01', 'status.md');
    const statusBefore = readFileSync(statusPath, 'utf-8');
    const prev = process.exitCode;
    process.exitCode = undefined;
    try {
      await safeParse(['flow', 'wizard']);
      expect(process.exitCode).toBe(1);
      expect(errorMock.mock.calls.map((c) => c[0] as string).join('\n')).toContain('非交互式');
      expect(readFileSync(cfgPath, 'utf-8')).toBe(cfgBefore);
      expect(readFileSync(statusPath, 'utf-8')).toBe(statusBefore);
      expect(mockedInquirer.select).not.toHaveBeenCalled();
    } finally {
      process.exitCode = prev;
    }
  });

  it('T39：flow wizard 非 TTY → 输出 nonTtyHint 且 process.exitCode = 1', async () => {
    // beforeEach 已强制 process.stdout.isTTY = false
    const prev = process.exitCode;
    process.exitCode = undefined;
    try {
      await safeParse(['flow', 'wizard']);
      const err = errorMock.mock.calls.map((c) => c[0] as string).join('\n');
      expect(err).toContain('非交互式');
      expect(process.exitCode).toBe(1);
    } finally {
      process.exitCode = prev;
    }
  });

  // ── flow stage add 冲突 i18n（cli/BUG-002）──

  it('flow stage add 目录冲突：en 下输出英文模板（stageDirConflictTmpl）', async () => {
    // 项目语言切为 en（.info.json 优先级最高）
    writeFileSync(join(tmpDir, '.openfeel', '.info.json'), JSON.stringify({ user: 'test', lang: 'en' }), 'utf-8');
    const mgr = new FlowManager(tmpDir);
    mgr.addStage('v4-stage-04'); // 占用 (series=v4, stageDir=stage-04)
    mgr.save();

    await safeParse(['flow', 'stage', 'add', 'v4.0.0-stage-04']);

    expect(exitMock).toHaveBeenCalledWith(1);
    const errOut = errorMock.mock.calls.map((c) => c[0] as string).join('\n');
    expect(errOut).toContain('Stage dir conflict:');
    expect(errOut).toContain('v4.0.0-stage-04');
  });

  // ── flow stage remove ──

  it('flow stage remove --dry-run 不修改 flow.json', async () => {
    const mgr = new FlowManager(tmpDir);
    mgr.addStage('v1.1.2-stage-80');
    mgr.addStage('v1.1.2-stage-81'); // current = stage-81，使 stage-80 非活跃
    mgr.save();

    const flowPath = join(tmpDir, '.openfeel', 'flow.json');
    const before = readFileSync(flowPath, 'utf-8');

    await safeParse(['flow', 'stage', 'remove', 'v1.1.2-stage-80', '--dry-run']);

    expect(readFileSync(flowPath, 'utf-8')).toBe(before);
    const out = logMock.mock.calls.map((c) => c[0] as string).join('\n');
    expect(out).toContain('Dry-run');
    expect(exitMock).not.toHaveBeenCalled();
  });

  it('flow stage remove --dry-run 被引用时 exit 1 且输出引用者', async () => {
    const mgr = new FlowManager(tmpDir);
    mgr.addStage('v1.1.2-stage-81');
    mgr.addStage('v1.1.2-stage-82');
    // stage-82 依赖 stage-81；current 此时为 stage-82
    mgr.getData()!.stages['v1.1.2-stage-82'].deps = ['v1.1.2-stage-81'];
    mgr.save();

    await safeParse(['flow', 'stage', 'remove', 'v1.1.2-stage-81', '--dry-run']);

    expect(exitMock).toHaveBeenCalledWith(1);
    const out = logMock.mock.calls.map((c) => c[0] as string).join('\n');
    expect(out).toContain('v1.1.2-stage-82');
  });

  it('flow stage remove --purge（非 TTY，无 --force）→ exit 1 且目录保留', async () => {
    const mgr = new FlowManager(tmpDir);
    mgr.addStage('v1.1.2-stage-83');
    mgr.save();

    const stageDir = join(tmpDir, '.openfeel', 'plan', 'v1', 'stage-83');
    mkdirSync(stageDir, { recursive: true });
    writeFileSync(join(stageDir, 'status.md'), 'x', 'utf-8');

    await safeParse(['flow', 'stage', 'remove', 'v1.1.2-stage-83', '--purge']);

    expect(exitMock).toHaveBeenCalledWith(1);
    expect(existsSync(stageDir)).toBe(true);
    expect(errorMock).toHaveBeenCalled();
  });

  it('stage-47/REV-009：--purge 时 save() 失败 → 目录仍在、注册仍在（无中间态）', async () => {
    const mgr = new FlowManager(tmpDir);
    mgr.addStage('v1.1.2-stage-84');
    mgr.save();

    const stageDir = join(tmpDir, '.openfeel', 'plan', 'v1', 'stage-84');
    mkdirSync(stageDir, { recursive: true });
    writeFileSync(join(stageDir, 'status.md'), 'x', 'utf-8');

    const flowPath = join(tmpDir, '.openfeel', 'flow.json');
    const beforeFlow = readFileSync(flowPath, 'utf-8');

    // 注入 save() 失败：命令层顺序为 removeStage（返回 purgeTarget）→ save → rmSync(purgeTarget)；
    // save 失败不应到达目录删除，杜绝「目录已删但注册仍在」的中间态（REV-009）
    const saveSpy = vi.spyOn(FlowManager.prototype, 'save').mockImplementation(() => {
      throw new Error('injected save failure');
    });
    try {
      await safeParse(['flow', 'stage', 'remove', 'v1.1.2-stage-84', '--force', '--purge']);
      // 目录未被删（save 失败，未到达 rmSync）
      expect(existsSync(stageDir)).toBe(true);
      // flow.json 注册仍在（save 失败未落盘）
      expect(readFileSync(flowPath, 'utf-8')).toBe(beforeFlow);
      expect(exitMock).toHaveBeenCalledWith(1);
    } finally {
      saveSpy.mockRestore();
    }
  });

  // ── stage-49/B1：dry-run 不写盘（blocking B1） ──

  it('B1: flow advance --dry-run 遇 phase/status 不一致不改写 flow.json', async () => {
    const mgr = new FlowManager(tmpDir);
    mgr.addStage('v1.1.2-stage-90');
    mgr.getData()!.stages['v1.1.2-stage-90'].status = 'done';
    mgr.getData()!.stages['v1.1.2-stage-90'].phase = 'exec_running';
    mgr.save();

    const flowPath = join(tmpDir, '.openfeel', 'flow.json');
    const before = readFileSync(flowPath, 'utf-8');
    const revBefore = JSON.parse(before).meta.revision;
    logMock.mockClear();

    await safeParse(['flow', 'advance', '--stage', 'v1.1.2-stage-90', '--to', 'review_pending', '--dry-run']);

    const after = readFileSync(flowPath, 'utf-8');
    // 核心断言：dry-run 不写盘 → 文件字节、revision、phase 均不变
    expect(after).toBe(before);
    expect(JSON.parse(after).meta.revision).toBe(revBefore);
    expect(JSON.parse(after).stages['v1.1.2-stage-90'].phase).toBe('exec_running');
    const out = logMock.mock.calls.map((c) => c[0] as string).join('\n');
    expect(out).toContain('正式执行将自动修复');
  });

  it('B1: flow advance 非 dry-run 仍修复并写盘', async () => {
    const mgr = new FlowManager(tmpDir);
    mgr.addStage('v1.1.2-stage-91');
    mgr.getData()!.stages['v1.1.2-stage-91'].status = 'done';
    mgr.getData()!.stages['v1.1.2-stage-91'].phase = 'exec_running';
    mgr.save();

    const flowPath = join(tmpDir, '.openfeel', 'flow.json');
    const revBefore = JSON.parse(readFileSync(flowPath, 'utf-8')).meta.revision;

    await safeParse(['flow', 'advance', '--stage', 'v1.1.2-stage-91', '--to', 'review_pending']);

    const after = JSON.parse(readFileSync(flowPath, 'utf-8'));
    // 非 dry-run 仍能修复并写盘：revision 递增，且 phase 不再是原不一致值
    // （autoRepair 先落盘为 done，随后同一命令继续推进至 review_pending）
    expect(after.meta.revision).toBeGreaterThan(revBefore);
    expect(after.stages['v1.1.2-stage-91'].phase).not.toBe('exec_running');
  });

  // ── stage-51/N1-2：flow repair 孤儿 op 对账 ──

  /** 构造一个 pending op 对象 */
  function makeOp(id: string): Record<string, unknown> {
    return {
      id, title: 't', state: 'pending', assignee: 'openfeel-executor', attempts: 0, max_attempts: 3,
      checkpoints: { plan: 'pending', scheme: 'pending', exec: { attempts: 0, self: 'pending' }, review: 'pending', test: 'pending' },
    };
  }

  it('N1-2: flow repair 默认只报告孤儿且 flow.json 零变更', async () => {
    const mgr = new FlowManager(tmpDir);
    mgr.addStage('v1.1.2-stage-70');
    mgr.getData()!.stages['v1.1.2-stage-70'].ops = { 'op-001': makeOp('op-001') as never };
    mgr.save();

    const flowPath = join(tmpDir, '.openfeel', 'flow.json');
    const before = readFileSync(flowPath, 'utf-8');
    logMock.mockClear();

    await safeParse(['flow', 'repair']);

    expect(readFileSync(flowPath, 'utf-8')).toBe(before);
    const out = logMock.mock.calls.map((c) => c[0] as string).join('\n');
    expect(out).toContain('孤儿');
    expect(out).toContain('v1.1.2-stage-70.op-001');
  });

  it('N1-2: flow repair --prune-orphans 清理键孤儿且不删文件', async () => {
    const mgr = new FlowManager(tmpDir);
    mgr.addStage('v1.1.2-stage-71');
    mgr.getData()!.stages['v1.1.2-stage-71'].ops = { 'op-001': makeOp('op-001') as never };
    mgr.save();
    // 构造 fileOrphan：ops 目录有 op-002 文件但无对应键
    const opsDir = join(tmpDir, '.openfeel', 'plan', 'v1', 'stage-71', 'ops');
    mkdirSync(opsDir, { recursive: true });
    writeFileSync(join(opsDir, 'op-002_keep.md'), 'x', 'utf-8');

    await safeParse(['flow', 'repair', '--prune-orphans']);

    const flow = JSON.parse(readFileSync(join(tmpDir, '.openfeel', 'flow.json'), 'utf-8'));
    expect(flow.stages['v1.1.2-stage-71'].ops['op-001']).toBeUndefined();
    expect(existsSync(join(opsDir, 'op-002_keep.md'))).toBe(true);
    const out = logMock.mock.calls.map((c) => c[0] as string).join('\n');
    expect(out).toContain('已清理');
  });

  it('N1-2: flow repair --dry-run --prune-orphans 零变更', async () => {
    const mgr = new FlowManager(tmpDir);
    mgr.addStage('v1.1.2-stage-72');
    mgr.getData()!.stages['v1.1.2-stage-72'].ops = { 'op-001': makeOp('op-001') as never };
    mgr.save();

    const flowPath = join(tmpDir, '.openfeel', 'flow.json');
    const before = readFileSync(flowPath, 'utf-8');
    logMock.mockClear();

    await safeParse(['flow', 'repair', '--dry-run', '--prune-orphans']);

    expect(readFileSync(flowPath, 'utf-8')).toBe(before);
    const out = logMock.mock.calls.map((c) => c[0] as string).join('\n');
    expect(out).toContain('孤儿');
  });

  it('T4: flow repair 选项含 prune-orphans 且不含 register-ops', () => {
    // 锁定 T4/D-reg：补注册由 plan scheme register 承接，flow repair 不新增 --register-ops 别名
    const flowCmd = program.commands.find((c) => c.name() === 'flow');
    expect(flowCmd).toBeDefined();
    const repairCmd = flowCmd!.commands.find((c) => c.name() === 'repair');
    expect(repairCmd).toBeDefined();
    const names = repairCmd!.options.map((o) => o.name());
    expect(names).toContain('prune-orphans');
    expect(names).not.toContain('register-ops');
  });

  it('N1-3: 仅孤儿（无 fail）时 flow health 不 fail 且退出码不变', async () => {
    const mgr = new FlowManager(tmpDir);
    mgr.addStage('v1.1.2-stage-73');
    mgr.getData()!.stages['v1.1.2-stage-73'].ops = { 'op-001': makeOp('op-001') as never };
    mgr.save();
    logMock.mockClear();

    const prevExitCode = process.exitCode;
    process.exitCode = undefined;
    try {
      await safeParse(['flow', 'health']);
      const out = logMock.mock.calls.map((c) => c[0] as string).join('\n');
      expect(out).toContain('孤儿操作方案');
      // 仅 warn，无 fail → 退出码不变（仍为 0/undefined）
      expect(process.exitCode ?? 0).toBe(0);
    } finally {
      process.exitCode = prevExitCode;
    }
  });

  // ── stage-51/N2-1：flow stage set --deps ──

  it('N2-1: flow stage set --deps 写入并留审计日志', async () => {
    const mgr = new FlowManager(tmpDir);
    mgr.addStage('v1.1.2-stage-60');
    mgr.addStage('v1.1.2-stage-61');
    mgr.save();
    logMock.mockClear();

    await safeParse(['flow', 'stage', 'set', 'v1.1.2-stage-61', '--deps', 'v1.1.2-stage-60']);

    expect(exitMock).not.toHaveBeenCalled();
    const flow = JSON.parse(readFileSync(join(tmpDir, '.openfeel', 'flow.json'), 'utf-8'));
    expect(flow.stages['v1.1.2-stage-61'].deps).toEqual(['v1.1.2-stage-60']);
    expect(flow.log.some((l: { action: string }) => l.action === 'stage_deps_set')).toBe(true);
  });

  it('N2-1: 悬空依赖 → exit 1 且不写盘', async () => {
    const mgr = new FlowManager(tmpDir);
    mgr.addStage('v1.1.2-stage-62');
    mgr.save();
    const flowPath = join(tmpDir, '.openfeel', 'flow.json');
    const before = readFileSync(flowPath, 'utf-8');
    errorMock.mockClear();

    await safeParse(['flow', 'stage', 'set', 'v1.1.2-stage-62', '--deps', 'v9.9.9-stage-99']);

    expect(exitMock).toHaveBeenCalledWith(1);
    expect(errorMock.mock.calls.map((c) => c[0] as string).join('\n')).toContain('v9.9.9-stage-99');
    expect(readFileSync(flowPath, 'utf-8')).toBe(before);
  });

  it('N2-1: 简写 stageId 归一（stage-02）', async () => {
    const mgr = new FlowManager(tmpDir);
    mgr.addStage('v1.0.0-stage-01');
    mgr.addStage('v1.0.0-stage-02');
    mgr.save();

    await safeParse(['flow', 'stage', 'set', 'stage-02', '--deps', 'stage-01']);

    const flow = JSON.parse(readFileSync(join(tmpDir, '.openfeel', 'flow.json'), 'utf-8'));
    expect(flow.stages['v1.0.0-stage-02'].deps).toEqual(['stage-01']);
  });

  it('N2-1: 未指定 --deps 视为清空', async () => {
    const mgr = new FlowManager(tmpDir);
    mgr.addStage('v1.1.2-stage-63');
    mgr.getData()!.stages['v1.1.2-stage-63'].deps = ['x'];
    mgr.save();

    await safeParse(['flow', 'stage', 'set', 'v1.1.2-stage-63']);

    const flow = JSON.parse(readFileSync(join(tmpDir, '.openfeel', 'flow.json'), 'utf-8'));
    expect(flow.stages['v1.1.2-stage-63'].deps).toEqual([]);
  });

  // ── stage-80 op-001：flow stage set --deps 归档依赖对称（T1②） ──

  it('op-001: 已归档显式前缀 dep → exit 0 + deps 落盘 + info（同 plan.ts 单一口径）', async () => {
    const mgr = new FlowManager(tmpDir);
    mgr.addStage('v1.2.0-stage-90');
    mgr.getData()!.meta.archived_versions = ['v1.1.2'];
    mgr.save();
    logMock.mockClear();

    await safeParse(['flow', 'stage', 'set', 'v1.2.0-stage-90', '--deps', 'v1.1.2-stage-60']);

    expect(exitMock).not.toHaveBeenCalled();
    const flow = JSON.parse(readFileSync(join(tmpDir, '.openfeel', 'flow.json'), 'utf-8'));
    expect(flow.stages['v1.2.0-stage-90'].deps).toEqual(['v1.1.2-stage-60']);
    const out = logMock.mock.calls.map((c) => c[0] as string).join('\n');
    expect(out).toContain('已归档');
  });

  it('op-001: 短名 stage-99 在 archived_versions 下仍 exit 1（不翻转，REV-80-001）', async () => {
    const mgr = new FlowManager(tmpDir);
    mgr.addStage('v1.2.0-stage-91');
    mgr.getData()!.meta.archived_versions = ['v1.1.2'];
    mgr.save();
    const flowPath = join(tmpDir, '.openfeel', 'flow.json');
    const before = readFileSync(flowPath, 'utf-8');
    errorMock.mockClear();

    await safeParse(['flow', 'stage', 'set', 'v1.2.0-stage-91', '--deps', 'stage-99']);

    expect(exitMock).toHaveBeenCalledWith(1);
    expect(errorMock.mock.calls.map((c) => c[0] as string).join('\n')).toContain('stage-99');
    expect(readFileSync(flowPath, 'utf-8')).toBe(before);
  });

  // ── stage-51/N2-2：flow review update / remove ──

  /** 建立含一条 REV-001 的项目 */
  function setupReview(): void {
    const mgr = new FlowManager(tmpDir);
    mgr.addStage('v1.1.2-stage-64');
    mgr.getData()!.stages['v1.1.2-stage-64'].ops = { 'op-001': makeOp('op-001') as never };
    mgr.getData()!.reviews.push({
      id: 'REV-001', op: 'v1.1.2-stage-64.op-001', status: 'open', priority: 'medium',
      title: 'old title', filed_by: 'openfeel-reviewer', filed_at: '2026-01-01T00:00:00Z',
    });
    mgr.save();
  }

  it('N2-2: flow review update 更新 priority/title/blocking 并留日志', async () => {
    setupReview();

    await safeParse(['flow', 'review', 'update', 'REV-001', '--priority', 'high', '--title', 'new title', '--blocking', 'false']);

    expect(exitMock).not.toHaveBeenCalled();
    const flow = JSON.parse(readFileSync(join(tmpDir, '.openfeel', 'flow.json'), 'utf-8'));
    const rev = flow.reviews.find((r: { id: string }) => r.id === 'REV-001');
    expect(rev.priority).toBe('high');
    expect(rev.title).toBe('new title');
    expect(rev.blocking).toBe(false);
    expect(flow.log.some((l: { action: string }) => l.action === 'review_update')).toBe(true);
  });

  it('N2-2: 非法 priority / 无字段 / 未命中 → exit 1', async () => {
    setupReview();

    await safeParse(['flow', 'review', 'update', 'REV-001', '--priority', 'urgent']);
    expect(exitMock).toHaveBeenCalledWith(1);

    exitMock.mockClear();
    await safeParse(['flow', 'review', 'update', 'REV-001']);
    expect(exitMock).toHaveBeenCalledWith(1);

    exitMock.mockClear();
    await safeParse(['flow', 'review', 'update', 'REV-999', '--priority', 'high']);
    expect(exitMock).toHaveBeenCalledWith(1);
  });

  it('N2-2: flow review remove 删除条目并打印标题；未命中 exit 1', async () => {
    setupReview();
    logMock.mockClear();

    await safeParse(['flow', 'review', 'remove', 'REV-001']);

    expect(exitMock).not.toHaveBeenCalled();
    const flow = JSON.parse(readFileSync(join(tmpDir, '.openfeel', 'flow.json'), 'utf-8'));
    expect(flow.reviews.find((r: { id: string }) => r.id === 'REV-001')).toBeUndefined();
    expect(logMock.mock.calls.map((c) => c[0] as string).join('\n')).toContain('old title');

    exitMock.mockClear();
    await safeParse(['flow', 'review', 'remove', 'REV-999']);
    expect(exitMock).toHaveBeenCalledWith(1);
  });

  // ── stage-51/N4-2：flow attempt 当前指针提示 ──

  it('N4-2: flow attempt 输出当前指针（指向下一 pending）', async () => {
    const mgr = new FlowManager(tmpDir);
    mgr.addStage('v1.1.2-stage-74');
    mgr.getData()!.stages['v1.1.2-stage-74'].ops = {
      'op-001': makeOp('op-001') as never,
      'op-002': makeOp('op-002') as never,
    };
    mgr.save();
    logMock.mockClear();

    await safeParse(['flow', 'attempt', '--op', 'v1.1.2-stage-74.op-001', '--result', 'pass']);

    const out = logMock.mock.calls.map((c) => c[0] as string).join('\n');
    expect(out).toContain('当前指针');
    expect(out).toContain('v1.1.2-stage-74.op-002');
  });

  it('N4-2: attempt 末位 op → 输出无待执行 op 文案', async () => {
    const mgr = new FlowManager(tmpDir);
    mgr.addStage('v1.1.2-stage-75');
    mgr.getData()!.stages['v1.1.2-stage-75'].ops = { 'op-001': makeOp('op-001') as never };
    mgr.save();
    logMock.mockClear();

    await safeParse(['flow', 'attempt', '--op', 'v1.1.2-stage-75.op-001', '--result', 'pass']);

    expect(logMock.mock.calls.map((c) => c[0] as string).join('\n')).toContain('无待执行 op');
  });

  // ── stage-51/N11-1：advance git 警告降噪 + --quiet ──

  it('N11-1: 非 done 的 advance 不打印 Git 警告且不调用 git', async () => {
    mockedChild.execSync.mockClear();
    const mgr = new FlowManager(tmpDir);
    mgr.addStage('v1.1.2-stage-76');
    mgr.save();
    logMock.mockClear();

    await safeParse(['flow', 'advance', '--stage', 'v1.1.2-stage-76', '--to', 'plan_passed']);

    expect(mockedChild.execSync).not.toHaveBeenCalled();
  });

  it('N11-1: --to done 打印 Git 脏区警告（工作区脏）', async () => {
    mockedChild.execFileSync.mockClear();
    mockedChild.execSync.mockClear();
    mockedChild.execSync.mockReturnValue(' M x.ts\n');
    const mgr = new FlowManager(tmpDir);
    mgr.addStage('v1.1.2-stage-77');
    mgr.save();
    const warnMock = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await safeParse(['flow', 'advance', '--stage', 'v1.1.2-stage-77', '--to', 'done', '--force']);

    expect(mockedChild.execSync).toHaveBeenCalled();
    expect(warnMock.mock.calls.map((c) => c[0] as string).join('\n')).toContain('Git 脏区警告');
    warnMock.mockRestore();
  });

  it('N11-1: --quiet 完全静默（stdout 为空）且不调用 git', async () => {
    mockedChild.execSync.mockClear();
    const mgr = new FlowManager(tmpDir);
    mgr.addStage('v1.1.2-stage-78');
    mgr.save();
    logMock.mockClear();

    await safeParse(['flow', 'advance', '--stage', 'v1.1.2-stage-78', '--to', 'plan_passed', '--quiet']);

    expect(logMock).not.toHaveBeenCalled();
    expect(mockedChild.execSync).not.toHaveBeenCalled();
  });

  // ── stage-52/op-001：B1 结构化输出（--json）+ B8 current 无 op 显示 ──

  /** 解析第 n 次 console.log 输出为 JSON（断言纯 JSON 单文档） */
  function parseJsonLog(index = 0): Record<string, unknown> {
    const raw = logMock.mock.calls[index][0] as string;
    // 纯 JSON：无 ANSI、可 JSON.parse
    expect(raw.includes('\u001b[')).toBe(false);
    return JSON.parse(raw) as Record<string, unknown>;
  }

  it('op-001/B1-1: flow status --json 输出纯 JSON 且含 schemaVersion=1', async () => {
    await safeParse(['flow', 'status', '--json']);
    const obj = parseJsonLog();
    expect(obj.schemaVersion).toBe(1);
    expect(obj.pipeline).toBeDefined();
    expect(obj.stages).toBeInstanceOf(Array);
    expect(obj.counts).toBeDefined();
    // 未加 --json 时人类可读输出含标题（互斥）
    logMock.mockClear();
    await safeParse(['flow', 'status']);
    const human = logMock.mock.calls.map((c) => c[0] as string).join('\n');
    expect(human).toContain('OpenFeel 流水线状态');
  });

  it('op-001/B1-2: flow current --json 含 stage/op/phase 且 schemaVersion=1', async () => {
    await safeParse(['flow', 'current', '--json']);
    const obj = parseJsonLog();
    expect(obj.schemaVersion).toBe(1);
    expect(obj).toHaveProperty('stage');
    expect(obj).toHaveProperty('op');
    expect(obj).toHaveProperty('phase');
  });

  it('op-001/B1-3: flow health --json 含 ok/items 且 schemaVersion=1', async () => {
    await safeParse(['flow', 'health', '--json']);
    const obj = parseJsonLog();
    expect(obj.schemaVersion).toBe(1);
    expect(typeof obj.ok).toBe('boolean');
    expect(obj.items).toBeInstanceOf(Array);
    // stage-95 op-001：reconciled 恒在（无 --fix 时为 null），位置固定于 items 之后
    expect(Object.keys(obj)).toEqual(['schemaVersion', 'ok', 'items', 'reconciled']);
    expect(obj.reconciled).toBeNull();
  });

  it('op-001/B1-4: flow metrics --json 含 schemaVersion=1', async () => {
    await safeParse(['flow', 'metrics', '--json']);
    const obj = parseJsonLog();
    expect(obj.schemaVersion).toBe(1);
    expect(obj.agents).toBeInstanceOf(Array);
  });

  it('op-001/B1-5: flow overview --json 含 schemaVersion=1', async () => {
    await safeParse(['flow', 'overview', '--json']);
    const obj = parseJsonLog();
    expect(obj.schemaVersion).toBe(1);
    expect(obj.current).toBeDefined();
    expect(obj.health).toBeDefined();
  });

  it('op-001/B1-6: flow phases --json 既有键零变化仅追加 schemaVersion', async () => {
    writePipelineNoComposite();
    await safeParse(['flow', 'phases', '--json']);
    const obj = parseJsonLog();
    expect(Object.keys(obj)).toEqual(expect.arrayContaining([
      'phases', 'transitions', 'advanceAccepted', 'transitionsDiff', 'schemaVersion',
    ]));
    expect(obj.schemaVersion).toBe(1);
    expect((obj.phases as string[])).toHaveLength(15);
  });

  it('op-001/B1-3: flow health --json 有 fail 时退出码非 0', async () => {
    const mgr = new FlowManager(tmpDir);
    mgr.getData()!.pipeline.phase = 'bogus' as never;
    mgr.save();
    logMock.mockClear();
    exitMock.mockClear();
    process.exitCode = undefined;

    await safeParse(['flow', 'health', '--json']);

    expect(exitMock).toHaveBeenCalledWith(1);
    process.exitCode = undefined;
  });

  // ── stage-80 op-002：flow health 归档一致性合并（T2 消费方） ──

  it('op-002: flow health --json 合并「归档一致性」项（warn-only 不改退出码）', async () => {
    // fixture：注入 archived_versions ['v1.0.0'] 且无归档文件 → 必产生对账 warn；current 置空 → 无 fail
    const mgr = new FlowManager(tmpDir);
    mgr.getData()!.meta.archived_versions = ['v1.0.0'];
    mgr.getData()!.pipeline.current = { stage: '', op: '' };
    mgr.save();
    logMock.mockClear();

    await safeParse(['flow', 'health', '--json']);

    const obj = parseJsonLog();
    expect(obj.items.some((i: { name: string }) => i.name === '归档一致性')).toBe(true);
    expect(obj.ok).toBe(true);
    expect(exitMock).not.toHaveBeenCalled();
  });

  it('op-002: flow health --quick --json 不含归档项（--quick 跳过）', async () => {
    const mgr = new FlowManager(tmpDir);
    mgr.getData()!.meta.archived_versions = ['v1.0.0'];
    mgr.getData()!.pipeline.current = { stage: '', op: '' };
    mgr.save();
    logMock.mockClear();

    await safeParse(['flow', 'health', '--quick', '--json']);

    const obj = parseJsonLog();
    expect(obj.items.every((i: { name: string }) => i.name !== '归档一致性')).toBe(true);
  });

  it('op-002: flow health（人类）输出现「归档一致性」行', async () => {
    const mgr = new FlowManager(tmpDir);
    mgr.getData()!.meta.archived_versions = ['v1.0.0'];
    mgr.getData()!.pipeline.current = { stage: '', op: '' };
    mgr.save();
    logMock.mockClear();

    await safeParse(['flow', 'health']);

    const out = logMock.mock.calls.map((c) => c[0] as string).join('\n');
    expect(out).toContain('归档一致性');
  });

  // ── stage-80 op-004：health b 项判据收窄两段式（REV-80-019）边界固化 ──

  it('op-004: 默认版本新建阶段（键 ∉ 快照）→ 无「归档残留」（REV-80-019 复刻）', async () => {
    // 复刻 reviewer 路径：archived_versions ['v1.0.0'] + `plan stage add stage-31`（键 v1.0.0-stage-31）+ 无归档文件
    addStage(tmpDir, 'stage-31');
    const mgr = new FlowManager(tmpDir);
    mgr.getData()!.meta.archived_versions = ['v1.0.0'];
    mgr.getData()!.pipeline.current = { stage: '', op: '' };
    mgr.save();
    logMock.mockClear();
    exitMock.mockClear();

    await safeParse(['flow', 'health', '--json']);

    const obj = parseJsonLog();
    expect(obj.items.some((i: { name: string }) => i.name === '归档残留')).toBe(false);
    expect(obj.items.some((i: { name: string }) => i.name === '归档一致性')).toBe(true);
    expect(obj.ok).toBe(true);
    expect(exitMock).not.toHaveBeenCalled();
  });

  it('op-004: 真实快照形态（键 ∉ 快照）→ 人类输出无「归档残留」；归档一致性 pass（1 个版本）', async () => {
    addStage(tmpDir, 'stage-31');
    const mgr = new FlowManager(tmpDir);
    mgr.getData()!.meta.archived_versions = ['v1.0.0'];
    mgr.getData()!.pipeline.current = { stage: '', op: '' };
    mgr.save();
    // 实写 v1.0.0.json：含 v1.0.0-stage-01、**不含** v1.0.0-stage-31
    writeArchiveFile(tmpDir, {
      schemaVersion: ARCHIVE_SCHEMA_VERSION,
      version: 'v1.0.0',
      archived_at: '2026-10-11T00:00:00.000Z',
      stages: { 'v1.0.0-stage-01': { name: '样本阶段', phase: 'done', status: 'done', deps: [], ops: {} } },
      reviews: [],
      log: [],
      counts: { stages: 1, reviews: 0, log: 0 },
    });
    logMock.mockClear();

    await safeParse(['flow', 'health']);

    const out = logMock.mock.calls.map((c) => c[0] as string).join('\n');
    expect(out).not.toContain('归档残留');
    expect(out).toContain('归档一致性');
    expect(out).toContain('一致（1 个版本）');
  });

  it('op-004: 正控 — 键 ∈ 快照 → 出现「归档残留」（防恒不报退化）', async () => {
    addStage(tmpDir, 'stage-31');
    const mgr = new FlowManager(tmpDir);
    mgr.getData()!.meta.archived_versions = ['v1.0.0'];
    mgr.getData()!.pipeline.current = { stage: '', op: '' };
    mgr.save();
    // 快照 stages **含** v1.0.0-stage-31（模拟 restore 带回 / 重复归档残留）
    writeArchiveFile(tmpDir, {
      schemaVersion: ARCHIVE_SCHEMA_VERSION,
      version: 'v1.0.0',
      archived_at: '2026-10-11T00:00:00.000Z',
      stages: { 'v1.0.0-stage-31': { name: '样本阶段', phase: 'plan_pending', status: 'pending', deps: [], ops: {} } },
      reviews: [],
      log: [],
      counts: { stages: 1, reviews: 0, log: 0 },
    });
    logMock.mockClear();

    await safeParse(['flow', 'health', '--json']);

    const obj = parseJsonLog();
    expect(obj.items.some((i: { name: string }) => i.name === '归档残留')).toBe(true);
  });

  it('op-001/B8: 无 op 时 flow current 显示 stage + 「无 op」；--json 的 op 为空串', async () => {
    const mgr = new FlowManager(tmpDir);
    mgr.addStage('v1.1.2-stage-95');
    mgr.getData()!.pipeline.current = { stage: 'v1.1.2-stage-95', op: '' };
    mgr.save();
    logMock.mockClear();

    await safeParse(['flow', 'current']);
    const out = logMock.mock.calls.map((c) => c[0] as string).join('\n');
    expect(out).toContain('v1.1.2-stage-95（无 op）');

    logMock.mockClear();
    await safeParse(['flow', 'current', '--json']);
    const obj = parseJsonLog();
    expect(obj.stage).toBe('v1.1.2-stage-95');
    expect(obj.op).toBe('');
  });

  it('op-001/B8: stage 亦为空时保持既有「(无)」文案', async () => {
    const mgr = new FlowManager(tmpDir);
    mgr.getData()!.pipeline.current = { stage: '', op: '' };
    mgr.save();
    logMock.mockClear();

    await safeParse(['flow', 'current']);
    const out = logMock.mock.calls.map((c) => c[0] as string).join('\n');
    expect(out).toContain('(无)');

    logMock.mockClear();
    await safeParse(['flow', 'current', '--json']);
    const obj = parseJsonLog();
    expect(obj.stage).toBe('');
  });

  // ── stage-52/op-003：B2 health --fix 状态对账 + L7 文件孤儿报告 ──

  /** 构造一个含 status.md 的阶段（flowStatus = flow.json 权威值；mdStatus=null 表示不含「状态」字段） */
  function setupReconcileStage(stageSuffix: string, flowStatus: string, mdStatus: string | null): { stageId: string; statusPath: string } {
    const stageId = `v1.1.2-${stageSuffix}`;
    const mgr = new FlowManager(tmpDir);
    mgr.addStage(stageId);
    const st = mgr.getData()!.stages[stageId];
    st.phase = 'exec_running';
    st.status = flowStatus;
    mgr.save();
    const dir = join(tmpDir, '.openfeel', 'plan', 'v1', stageSuffix);
    mkdirSync(dir, { recursive: true });
    const statusPath = join(dir, 'status.md');
    const statusLine = mdStatus === null ? '' : `- **状态**：${mdStatus}\n`;
    writeFileSync(
      statusPath,
      `# ${stageId} 状态\n\n- **执行模式**：manual\n- **自动推进**：disabled\n${statusLine}\n` +
        `## 状态记录\n\n| 时间 | Agent | 状态变化 | 说明 |\n|------|-------|----------|------|\n`,
      'utf-8',
    );
    return { stageId, statusPath };
  }

  it('op-003/B2: health --fix --dry-run 列出差异且两文件零写盘', async () => {
    const { statusPath } = setupReconcileStage('stage-95', 'active', 'planned');
    const flowPath = join(tmpDir, '.openfeel', 'flow.json');
    const flowBefore = readFileSync(flowPath, 'utf-8');
    const mdBefore = readFileSync(statusPath, 'utf-8');
    logMock.mockClear();

    await safeParse(['flow', 'health', '--fix', '--dry-run']);

    expect(readFileSync(flowPath, 'utf-8')).toBe(flowBefore);
    expect(readFileSync(statusPath, 'utf-8')).toBe(mdBefore);
    const out = logMock.mock.calls.map((c) => c[0] as string).join('\n');
    expect(out).toContain('planned');
    expect(out).toContain('仅预览');
  });

  it('op-003/B2: health --fix 仅改「状态」行，其余字节不变', async () => {
    const { statusPath } = setupReconcileStage('stage-96', 'active', 'planned');
    const mdBefore = readFileSync(statusPath, 'utf-8');
    logMock.mockClear();

    await safeParse(['flow', 'health', '--fix']);

    const mdAfter = readFileSync(statusPath, 'utf-8');
    expect(mdAfter).not.toBe(mdBefore);
    expect(mdAfter).toContain('- **状态**：active');
    const beforeLines = mdBefore.split('\n');
    const afterLines = mdAfter.split('\n');
    expect(afterLines.length).toBe(beforeLines.length);
    const changedIdx = beforeLines
      .map((l, i) => (l === afterLines[i] ? -1 : i))
      .filter((i) => i !== -1);
    // 仅 1 行变化，且为「状态」字段行
    expect(changedIdx).toHaveLength(1);
    expect(beforeLines[changedIdx[0]]).toContain('状态');
  });

  it('op-003/B2: 字段缺失 → skipped-not-found 且不新建字段', async () => {
    const { statusPath } = setupReconcileStage('stage-97', 'active', null);
    const mdBefore = readFileSync(statusPath, 'utf-8');
    logMock.mockClear();

    await safeParse(['flow', 'health', '--fix']);

    expect(readFileSync(statusPath, 'utf-8')).toBe(mdBefore);
    const out = logMock.mock.calls.map((c) => c[0] as string).join('\n');
    expect(out).toContain('跳过 1');
  });

  it('op-003/B2: 已一致 → applied=0 且零写盘（幂等）', async () => {
    const { statusPath } = setupReconcileStage('stage-98', 'active', 'active');
    const flowPath = join(tmpDir, '.openfeel', 'flow.json');
    const flowBefore = readFileSync(flowPath, 'utf-8');
    const mdBefore = readFileSync(statusPath, 'utf-8');
    logMock.mockClear();

    await safeParse(['flow', 'health', '--fix']);

    expect(readFileSync(flowPath, 'utf-8')).toBe(flowBefore);
    expect(readFileSync(statusPath, 'utf-8')).toBe(mdBefore);
    const out = logMock.mock.calls.map((c) => c[0] as string).join('\n');
    expect(out).toContain('已回写 0');
  });

  it('op-003/B2: 写盘失败 → exit 3（stage-95 D-95-11 分类补全；文案逐字不变）', async () => {
    setupReconcileStage('stage-99', 'active', 'planned');
    const proto = FlowManager.prototype as unknown as { writeStatusField: () => boolean };
    const spy = vi.spyOn(proto, 'writeStatusField').mockImplementation(() => {
      throw new Error('disk full');
    });
    errorMock.mockClear();
    exitMock.mockClear();
    logMock.mockClear();

    await safeParse(['flow', 'health', '--fix']);

    // 内部故障：原 exit 1 → 本版 exit 3（0/1/2 语义不变，3 为新增内部错误码）
    expect(exitMock).toHaveBeenCalledWith(3);
    expect(errorMock.mock.calls.map((c) => c[0] as string).join('\n')).toContain('disk full');
    spy.mockRestore();
  });

  it('op-003/L7: 文件孤儿只读统计且无删除；health 与 repair 数量一致', async () => {
    const mgr = new FlowManager(tmpDir);
    mgr.addStage('v1.1.2-stage-93');
    mgr.getData()!.stages['v1.1.2-stage-93'].ops = { 'op-001': makeOp('op-001') as never };
    mgr.save();
    const opsDir = join(tmpDir, '.openfeel', 'plan', 'v1', 'stage-93', 'ops');
    mkdirSync(opsDir, { recursive: true });
    writeFileSync(join(opsDir, 'op-002.md'), 'x', 'utf-8');
    const filesBefore = readdirSync(opsDir).sort();

    logMock.mockClear();
    await safeParse(['flow', 'health']);
    const healthOut = logMock.mock.calls.map((c) => c[0] as string).join('\n');
    expect(healthOut).toContain('文件孤儿 1');

    logMock.mockClear();
    await safeParse(['flow', 'repair', '--dry-run']);
    const repairOut = logMock.mock.calls.map((c) => c[0] as string).join('\n');
    expect(repairOut).toContain('文件孤儿');
    expect(repairOut).toContain('v1.1.2-stage-93.op-002');
    expect(repairOut).toContain('不提供自动清理');

    // 无删除行为：ops/ 目录文件清单完全不变
    expect(readdirSync(opsDir).sort()).toEqual(filesBefore);
  });

  // ── stage-52/op-004：B5 多步推进 + REV 复检（REV-52-001） ──

  /** 写入「两条等长路径」的 pipeline.yaml（plan_pending 经 plan_review 或 plan_passed 均到 scheme_pending） */
  function writePipelineAmbiguous(): void {
    const transitions: Record<string, string[]> = {
      plan_pending: ['plan_review', 'plan_passed'],
      plan_review: ['scheme_pending'],
      plan_passed: ['scheme_pending'],
      scheme_pending: ['exec_running'],
      exec_running: ['review_pending', 'scheme_pending'],
      review_pending: ['review_failed', 'review_passed'],
      review_failed: ['review_pending', 'scheme_pending'],
      review_passed: ['test_pending'],
      test_pending: ['test_failed', 'test_passed'],
      test_failed: ['test_pending', 'scheme_pending'],
      test_passed: ['archiving'],
      archiving: ['done'],
      done: [],
    };
    writeFileSync(join(tmpDir, '.openfeel', 'pipeline.yaml'), JSON.stringify({
      phases: Object.keys(transitions),
      transitions,
      checkpoint_mapping: {},
      phase_corrections: {},
    }), 'utf-8');
  }

  it('op-004/B5: advance --to 唯一路径自动逐步（每步一条日志）', async () => {
    const mgr = new FlowManager(tmpDir);
    mgr.addStage('v1.1.2-stage-88');
    mgr.save();
    logMock.mockClear();

    await safeParse(['flow', 'advance', '--stage', 'v1.1.2-stage-88', '--to', 'exec_running']);

    const flow = JSON.parse(readFileSync(join(tmpDir, '.openfeel', 'flow.json'), 'utf-8'));
    expect(flow.stages['v1.1.2-stage-88'].phase).toBe('exec_running');
    const stepLogs = flow.log.filter(
      (l: { action: string; detail: { stageName?: string } }) =>
        l.action === 'advance_stage_phase' && l.detail.stageName === 'v1.1.2-stage-88',
    );
    expect(stepLogs).toHaveLength(4);
    const out = logMock.mock.calls.map((c) => c[0] as string).join('\n');
    expect(out).toContain('已推进：v1.1.2-stage-88');
  });

  it('op-004/B5: advance --dry-run 打印完整路径且零写盘', async () => {
    const mgr = new FlowManager(tmpDir);
    mgr.addStage('v1.1.2-stage-87');
    mgr.save();
    const flowPath = join(tmpDir, '.openfeel', 'flow.json');
    const before = readFileSync(flowPath, 'utf-8');
    logMock.mockClear();

    await safeParse(['flow', 'advance', '--stage', 'v1.1.2-stage-87', '--to', 'exec_running', '--dry-run']);

    expect(readFileSync(flowPath, 'utf-8')).toBe(before);
    const out = logMock.mock.calls.map((c) => c[0] as string).join('\n');
    expect(out).toContain('推进路径');
    expect(out).toContain('plan_pending → plan_passed → scheme_pending → scheme_passed → exec_running');
  });

  it('op-004/B5: 无路径 → exit 1 + 可达目标', async () => {
    const mgr = new FlowManager(tmpDir);
    mgr.addStage('v1.1.2-stage-86');
    mgr.getData()!.stages['v1.1.2-stage-86'].phase = 'done';
    mgr.getData()!.stages['v1.1.2-stage-86'].status = 'done';
    mgr.save();
    errorMock.mockClear();
    exitMock.mockClear();

    await safeParse(['flow', 'advance', '--stage', 'v1.1.2-stage-86', '--to', 'exec_running']);

    expect(exitMock).toHaveBeenCalledWith(1);
    expect(errorMock.mock.calls.map((c) => c[0] as string).join('\n')).toContain('无法从 done 到达 exec_running');
  });

  it('op-004/B5: 多义路径 → exit 1 + ambiguousTmpl', async () => {
    writePipelineAmbiguous();
    const mgr = new FlowManager(tmpDir);
    mgr.addStage('v1.1.2-stage-85');
    mgr.save();
    errorMock.mockClear();
    exitMock.mockClear();

    await safeParse(['flow', 'advance', '--stage', 'v1.1.2-stage-85', '--to', 'scheme_pending']);

    expect(exitMock).toHaveBeenCalledWith(1);
    expect(errorMock.mock.calls.map((c) => c[0] as string).join('\n')).toContain('多条等价路径');
  });

  it('op-004/B5: 已在目标 → no-op 成功', async () => {
    const mgr = new FlowManager(tmpDir);
    mgr.addStage('v1.1.2-stage-84');
    mgr.getData()!.stages['v1.1.2-stage-84'].phase = 'exec_running';
    mgr.save();
    exitMock.mockClear();
    logMock.mockClear();

    await safeParse(['flow', 'advance', '--stage', 'v1.1.2-stage-84', '--to', 'exec_running']);

    expect(exitMock).not.toHaveBeenCalled();
    expect(logMock.mock.calls.map((c) => c[0] as string).join('\n')).toContain('已在目标阶段');
  });

  it('op-004/B5-3: 存量 blocking REV 在多步 --to done 被拦截（exit 1 + revision 不变）', async () => {
    const mgr = new FlowManager(tmpDir);
    mgr.addStage('v1.1.2-stage-83');
    const st = mgr.getData()!.stages['v1.1.2-stage-83'];
    st.phase = 'test_passed';
    st.status = 'testing';
    mgr.getData()!.reviews.push({
      id: 'REV-BLK', op: 'v1.1.2-stage-83.op-001', status: 'open', priority: 'high',
      title: 'blocking', filed_by: 'openfeel-reviewer', filed_at: '2026-01-01T00:00:00Z', blocking: true,
    });
    mgr.save();
    const flowPath = join(tmpDir, '.openfeel', 'flow.json');
    const revBefore = JSON.parse(readFileSync(flowPath, 'utf-8')).meta.revision;
    errorMock.mockClear();
    exitMock.mockClear();

    await safeParse(['flow', 'advance', '--stage', 'v1.1.2-stage-83', '--to', 'done']);

    expect(exitMock).toHaveBeenCalledWith(1);
    const after = JSON.parse(readFileSync(flowPath, 'utf-8'));
    expect(after.meta.revision).toBe(revBefore);
    expect(after.stages['v1.1.2-stage-83'].phase).toBe('test_passed');
  });

  // ── stage-54/op-002：E2 blocking REV 拒绝文案 i18n（cli/BUG-006） ──

  it('op-002/E2: en 模式 blocking REV 拒绝路径 CJK 零命中', async () => {
    // 项目语言切为 en（.info.json 优先级最高）
    writeFileSync(join(tmpDir, '.openfeel', '.info.json'), JSON.stringify({ user: 'test', lang: 'en' }), 'utf-8');
    const mgr = new FlowManager(tmpDir);
    mgr.addStage('v1.1.2-stage-84');
    const st = mgr.getData()!.stages['v1.1.2-stage-84'];
    st.phase = 'test_passed';
    st.status = 'testing';
    mgr.getData()!.reviews.push({
      id: 'REV-BLK2', op: 'v1.1.2-stage-84.op-001', status: 'open', priority: 'high',
      title: 'blocking', filed_by: 'openfeel-reviewer', filed_at: '2026-01-01T00:00:00Z', blocking: true,
    });
    mgr.save();
    errorMock.mockClear();
    exitMock.mockClear();
    const warnMock = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await safeParse(['flow', 'advance', '--stage', 'v1.1.2-stage-84', '--to', 'done']);

      expect(exitMock).toHaveBeenCalledWith(1);
      const out = [
        ...errorMock.mock.calls.map((c) => c[0] as string),
        ...warnMock.mock.calls.map((c) => c[0] as string),
      ].join('\n');
      expect(out).toContain('Error: cannot advance to done');
      expect(out).not.toMatch(/[\u4e00-\u9fff]/);
    } finally {
      warnMock.mockRestore();
    }
  });

  it('op-002/E2: zh 模式 blocking REV 拒绝文案逐字不变', async () => {
    const mgr = new FlowManager(tmpDir);
    mgr.addStage('v1.1.2-stage-85');
    const st = mgr.getData()!.stages['v1.1.2-stage-85'];
    st.phase = 'test_passed';
    st.status = 'testing';
    mgr.getData()!.reviews.push({
      id: 'REV-BLK3', op: 'v1.1.2-stage-85.op-001', status: 'open', priority: 'high',
      title: 'blocking', filed_by: 'openfeel-reviewer', filed_at: '2026-01-01T00:00:00Z', blocking: true,
    });
    mgr.save();
    errorMock.mockClear();
    exitMock.mockClear();

    await safeParse(['flow', 'advance', '--stage', 'v1.1.2-stage-85', '--to', 'done']);

    expect(exitMock).toHaveBeenCalledWith(1);
    const errOut = errorMock.mock.calls.map((c) => c[0] as string).join('\n');
    expect(errOut).toContain('错误：blocking REV 未解决前禁止推进到 done。');
    expect(errOut).toContain('请先解决上述 REV 或通过 flow review resolve 标记为非阻塞。');
  });

  it('op-004/B5-3: 多步 advance 不创建 review', async () => {
    const mgr = new FlowManager(tmpDir);
    mgr.addStage('v1.1.2-stage-82');
    mgr.save();
    const reviewsBefore = mgr.getData()!.reviews.length;

    await safeParse(['flow', 'advance', '--stage', 'v1.1.2-stage-82', '--to', 'exec_running']);

    const after = JSON.parse(readFileSync(join(tmpDir, '.openfeel', 'flow.json'), 'utf-8'));
    expect(after.reviews.length).toBe(reviewsBefore);
  });

  // ── stage-52/op-012：REV-005 短名 stage 归一化（短名 = 全名） ──

  it('op-012/REV-005: 短名与全名 advance --dry-run 输出逐字相等（8 跳，exit 0）', async () => {
    const mgr = new FlowManager(tmpDir);
    mgr.addStage('v1.0.0-stage-01');
    mgr.save();

    logMock.mockClear();
    exitMock.mockClear();
    await safeParse(['flow', 'advance', '--stage', 'stage-01', '--to', 'done', '--dry-run']);
    const shortOut = logMock.mock.calls.map((c) => c[0] as string).join('\n');
    expect(exitMock).not.toHaveBeenCalled();
    expect(shortOut).toContain(
      'plan_pending → plan_passed → scheme_pending → scheme_passed → exec_running → review_pending → review_passed → archiving → done',
    );

    logMock.mockClear();
    await safeParse(['flow', 'advance', '--stage', 'v1.0.0-stage-01', '--to', 'done', '--dry-run']);
    const fullOut = logMock.mock.calls.map((c) => c[0] as string).join('\n');
    expect(fullOut).toBe(shortOut);
  });

  it('op-012/REV-005: 短名多步推进实测（每步一条日志，与全名一致）', async () => {
    const mgr = new FlowManager(tmpDir);
    mgr.addStage('v1.0.0-stage-02');
    mgr.addStage('v1.0.0-stage-03');
    mgr.save();
    exitMock.mockClear();

    await safeParse(['flow', 'advance', '--stage', 'stage-02', '--to', 'exec_running']);
    await safeParse(['flow', 'advance', '--stage', 'v1.0.0-stage-03', '--to', 'exec_running']);

    const flow = JSON.parse(readFileSync(join(tmpDir, '.openfeel', 'flow.json'), 'utf-8'));
    expect(exitMock).not.toHaveBeenCalled();
    expect(flow.stages['v1.0.0-stage-02'].phase).toBe('exec_running');
    expect(flow.stages['v1.0.0-stage-03'].phase).toBe('exec_running');
    const shortLogs = flow.log.filter(
      (l: { action: string; detail: { stageName?: string } }) =>
        l.action === 'advance_stage_phase' && l.detail.stageName === 'v1.0.0-stage-02',
    );
    const fullLogs = flow.log.filter(
      (l: { action: string; detail: { stageName?: string } }) =>
        l.action === 'advance_stage_phase' && l.detail.stageName === 'v1.0.0-stage-03',
    );
    expect(shortLogs).toHaveLength(4);
    expect(fullLogs).toHaveLength(4);
  });

  // ── stage-52/op-013：REV-007 stage remove / retry 短名归一化 ──

  it('op-013/T1: stage remove 短名与全名 --dry-run 输出逐字相等（exit 0）', async () => {
    const mgr = new FlowManager(tmpDir);
    mgr.addStage('v1.0.0-stage-88');
    mgr.addStage('v1.0.0-stage-89'); // current = stage-89，使 stage-88 非活跃
    mgr.save();

    logMock.mockClear();
    exitMock.mockClear();
    await safeParse(['flow', 'stage', 'remove', 'stage-88', '--dry-run']);
    const shortOut = logMock.mock.calls.map((c) => c[0] as string).join('\n');
    expect(exitMock).not.toHaveBeenCalled();
    expect(shortOut).toContain('v1.0.0-stage-88');
    expect(shortOut).not.toContain('阶段不存在');

    logMock.mockClear();
    exitMock.mockClear();
    await safeParse(['flow', 'stage', 'remove', 'v1.0.0-stage-88', '--dry-run']);
    const fullOut = logMock.mock.calls.map((c) => c[0] as string).join('\n');
    expect(exitMock).not.toHaveBeenCalled();
    expect(fullOut).toBe(shortOut);
  });

  it('op-013/T1: stage remove 不存在阶段 → 短名/全名一致 exit 1', async () => {
    exitMock.mockClear();
    await safeParse(['flow', 'stage', 'remove', 'stage-99', '--dry-run']);
    expect(exitMock).toHaveBeenCalledWith(1);

    exitMock.mockClear();
    await safeParse(['flow', 'stage', 'remove', 'v1.0.0-stage-99', '--dry-run']);
    expect(exitMock).toHaveBeenCalledWith(1);
  });

  it('op-013/T1: retry --op 短名前缀可命中（F3）', async () => {
    const mgr = new FlowManager(tmpDir);
    mgr.addStage('v1.0.0-stage-86');
    mgr.getData()!.stages['v1.0.0-stage-86'].ops = { 'op-001': makeOp('op-001') as never };
    mgr.save();

    logMock.mockClear();
    errorMock.mockClear();
    exitMock.mockClear();
    await safeParse(['flow', 'retry', '--op', 'stage-86.op-001']);

    expect(exitMock).not.toHaveBeenCalled();
    expect(errorMock.mock.calls.map((c) => c[0] as string).join('\n')).not.toContain('阶段不存在');
    expect(logMock.mock.calls.map((c) => c[0] as string).join('\n')).toContain('op-001');
  });

  it('op-013/T1: attempt --op 短名前缀等价（F4）+ draft 守卫回归', async () => {
    // 短名前缀 attempt pass → exit 0，指针指向下一 pending
    const mgr = new FlowManager(tmpDir);
    mgr.addStage('v1.0.0-stage-85');
    mgr.getData()!.stages['v1.0.0-stage-85'].ops = {
      'op-001': makeOp('op-001') as never,
      'op-002': makeOp('op-002') as never,
    };
    mgr.save();
    exitMock.mockClear();
    await safeParse(['flow', 'attempt', '--op', 'stage-85.op-001', '--result', 'pass']);
    expect(exitMock).not.toHaveBeenCalled();
    const flow = JSON.parse(readFileSync(join(tmpDir, '.openfeel', 'flow.json'), 'utf-8'));
    expect(flow.stages['v1.0.0-stage-85'].ops['op-001'].state).toBe('done');
    expect(flow.pipeline.current).toEqual({ stage: 'v1.0.0-stage-85', op: 'op-002' });

    // draft 守卫回归：短名前缀 draft op → 仍 exit 1 + draft 提示
    const mgr2 = new FlowManager(tmpDir);
    mgr2.addStage('v1.0.0-stage-84');
    mgr2.getData()!.stages['v1.0.0-stage-84'].ops = {
      'op-001': { ...(makeOp('op-001') as object), state: 'draft' } as never,
    };
    mgr2.save();
    exitMock.mockClear();
    errorMock.mockClear();
    await safeParse(['flow', 'attempt', '--op', 'stage-84.op-001', '--result', 'pass']);
    expect(exitMock).toHaveBeenCalledWith(1);
    expect(errorMock.mock.calls.map((c) => c[0] as string).join('\n')).toContain('draft');
  });

  it('op-013/T4: REV 前缀重叠不误拦（F6 双向往返）', async () => {
    const mgr = new FlowManager(tmpDir);
    mgr.addStage('v1.1.2-stage-5');
    mgr.getData()!.stages['v1.1.2-stage-5'].phase = 'test_passed';
    mgr.addStage('v1.1.2-stage-52');
    mgr.getData()!.stages['v1.1.2-stage-52'].phase = 'test_passed';
    // blocking open REV 挂在 stage-52（stage-5 是其前缀）
    mgr.getData()!.reviews.push({
      id: 'REV-OVL', op: 'v1.1.2-stage-52.op-001', status: 'open', priority: 'high',
      title: 'blocking', filed_by: 'openfeel-reviewer', filed_at: '2026-01-01T00:00:00Z', blocking: true,
    });
    mgr.save();

    // 查询 stage-5：stage-52 的 REV 不应因前缀重叠被误捕（修复前 startsWith(stage-5) 会误拦）
    exitMock.mockClear();
    await safeParse(['flow', 'advance', '--stage', 'v1.1.2-stage-5', '--to', 'done']);
    expect(exitMock).not.toHaveBeenCalled();

    // 查询 stage-52：自身 blocking REV 仍应拦截
    exitMock.mockClear();
    await safeParse(['flow', 'advance', '--stage', 'v1.1.2-stage-52', '--to', 'done']);
    expect(exitMock).toHaveBeenCalledWith(1);
  });

  // ── stage-52/op-005：B3 flow ops list + B4-5 attempt draft 守卫 ──

  it('op-005/B3: flow ops list 显示 state + 填充度', async () => {
    const mgr = new FlowManager(tmpDir);
    mgr.addStage('v1.1.2-stage-79');
    mgr.getData()!.stages['v1.1.2-stage-79'].ops = { 'op-001': makeOp('op-001') as never };
    mgr.save();
    const opsDir = join(tmpDir, '.openfeel', 'plan', 'v1', 'stage-79', 'ops');
    mkdirSync(opsDir, { recursive: true });
    writeFileSync(join(opsDir, 'op-001.md'), '# op-001：t\n\n- [x] done\n', 'utf-8');
    logMock.mockClear();

    await safeParse(['flow', 'ops', 'list']);

    const out = logMock.mock.calls.map((c) => c[0] as string).join('\n');
    expect(out).toContain('v1.1.2-stage-79.op-001');
    expect(out).toContain('[pending]');
    expect(out).toContain('(filled)');

    // --stage 过滤：不匹配的阶段不出现
    const mgr2 = new FlowManager(tmpDir);
    mgr2.addStage('v1.1.2-stage-80');
    mgr2.getData()!.stages['v1.1.2-stage-80'].ops = { 'op-001': makeOp('op-001') as never };
    mgr2.save();
    logMock.mockClear();
    await safeParse(['flow', 'ops', 'list', '--stage', 'v1.1.2-stage-79']);
    const out2 = logMock.mock.calls.map((c) => c[0] as string).join('\n');
    expect(out2).toContain('v1.1.2-stage-79.op-001');
    expect(out2).not.toContain('v1.1.2-stage-80.op-001');
  });

  it('op-005/B3: 空模板 warning + draft 分组 + --json', async () => {
    const mgr = new FlowManager(tmpDir);
    mgr.addStage('v1.1.2-stage-78');
    mgr.getData()!.stages['v1.1.2-stage-78'].ops = {
      'op-001': { ...(makeOp('op-001') as object), state: 'pending' } as never,
      'op-002': { ...(makeOp('op-002') as object), state: 'draft' } as never,
    };
    mgr.save();
    const opsDir = join(tmpDir, '.openfeel', 'plan', 'v1', 'stage-78', 'ops');
    mkdirSync(opsDir, { recursive: true });
    writeFileSync(join(opsDir, 'op-001.md'), '# op-001：t\n\n- [ ] 待补充\n', 'utf-8');
    writeFileSync(join(opsDir, 'op-002.md'), '# op-002：t\n\n- [ ] 待补充\n', 'utf-8');
    logMock.mockClear();

    await safeParse(['flow', 'ops', 'list']);
    const out = logMock.mock.calls.map((c) => c[0] as string).join('\n');
    expect(out).toContain('未发布（draft）');
    expect(out).toContain('(empty)');
    expect(out).toContain('模板未填充');

    logMock.mockClear();
    await safeParse(['flow', 'ops', 'list', '--json']);
    const obj = JSON.parse(logMock.mock.calls[0][0] as string);
    expect(obj.schemaVersion).toBe(1);
    expect(obj.ops).toHaveLength(2);
    expect(obj.ops.every((o: { fill: string }) => ['empty', 'partial', 'filled'].includes(o.fill))).toBe(true);
    // stage-95 op-001：warning 恒在且位于 fill 之后（empty → string，其余 null）
    for (const o of obj.ops as Array<{ fill: string; warning: unknown }>) {
      expect(Object.keys(o)).toEqual(['stage', 'opId', 'title', 'state', 'fill', 'warning']);
      if (o.fill === 'empty') {
        expect(typeof o.warning).toBe('string');
      } else {
        expect(o.warning).toBeNull();
      }
    }
  });

  it('op-005/B4-5: attempt --op <draft op> → exit 1 且 attempts 未递增', async () => {
    const mgr = new FlowManager(tmpDir);
    mgr.addStage('v1.1.2-stage-77');
    mgr.getData()!.stages['v1.1.2-stage-77'].ops = {
      'op-001': { ...(makeOp('op-001') as object), state: 'draft' } as never,
    };
    mgr.save();
    errorMock.mockClear();
    exitMock.mockClear();

    await safeParse(['flow', 'attempt', '--op', 'v1.1.2-stage-77.op-001', '--result', 'pass']);

    expect(exitMock).toHaveBeenCalledWith(1);
    expect(errorMock.mock.calls.map((c) => c[0] as string).join('\n')).toContain('draft');
    const flow = JSON.parse(readFileSync(join(tmpDir, '.openfeel', 'flow.json'), 'utf-8'));
    expect(flow.stages['v1.1.2-stage-77'].ops['op-001'].state).toBe('draft');
    expect(flow.stages['v1.1.2-stage-77'].ops['op-001'].attempts).toBe(0);
  });

  // ── stage-52/op-007：L5 warn i18n 化 ──

  it('op-007/L5: Git 脏区 warn 走 i18n（zh）；en 模板无 CJK', async () => {
    mockedChild.execSync.mockClear();
    mockedChild.execSync.mockReturnValue(' M x.ts\n');
    const mgr = new FlowManager(tmpDir);
    mgr.addStage('v1.1.2-stage-71');
    mgr.save();
    const warnMock = vi.spyOn(console, 'warn').mockImplementation(() => {});
    logMock.mockClear();

    await safeParse(['flow', 'advance', '--stage', 'v1.1.2-stage-71', '--to', 'done', '--force']);

    const warns = warnMock.mock.calls.map((c) => c[0] as string).join('\n');
    expect(warns).toContain('Git 脏区警告');
    const { t } = await import('../../src/core/i18n.js');
    expect(/[\u4e00-\u9fff]/.test(t('flow.advance.gitDirtyBoxMsg', 'en'))).toBe(false);
    expect(/[\u4e00-\u9fff]/.test(t('flow.advance.gitDirtyBoxHint', 'en'))).toBe(false);
    warnMock.mockRestore();
  });

  // ── stage-52/op-014：REV-009 stage 解析归一化最终收尾 ──

  /** 构造 full-name 阶段（review_failed + op-001），用于 --auto-fix 短名前缀场景 */
  function makeReviewFailedStage(stageName: string): void {
    const mgr = new FlowManager(tmpDir);
    mgr.addStage(stageName);
    const st = mgr.getData()!.stages[stageName];
    st.phase = 'review_failed';
    st.status = 'review_failed';
    st.ops = { 'op-001': makeOp('op-001') as never };
    mgr.save();
  }

  it('op-014/T1: review add --auto-fix 短名前缀创建成功（REV-009 核心）且与全名等价', async () => {
    const warnMock = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      // 短名前缀（tmpDir，键为全名）
      makeReviewFailedStage('v1.0.0-stage-01');
      exitMock.mockClear();
      errorMock.mockClear();
      await safeParse(['flow', 'review', 'add', '--op', 'stage-01.op-001', '--title', 't', '--auto-fix', 'x']);
      expect(exitMock).not.toHaveBeenCalled();
      const shortFlow = JSON.parse(readFileSync(join(tmpDir, '.openfeel', 'flow.json'), 'utf-8'));
      expect(shortFlow.reviews).toHaveLength(1);
      expect(shortFlow.reviews[0].status).toBe('resolved');
      expect(shortFlow.reviews[0].canAutoFix).toBe(true);
      expect(shortFlow.stages['v1.0.0-stage-01'].phase).toBe('exec_running');

      // 全名对照（独立 fixture）
      const dir2 = mkdtempSync(join(tmpdir(), 'openfeel-op014-full-'));
      try {
        await initProject(dir2);
        cwdMock.mockReturnValue(dir2);
        const mgr2 = new FlowManager(dir2);
        mgr2.addStage('v1.0.0-stage-01');
        const st2 = mgr2.getData()!.stages['v1.0.0-stage-01'];
        st2.phase = 'review_failed';
        st2.status = 'review_failed';
        st2.ops = { 'op-001': makeOp('op-001') as never };
        mgr2.save();
        exitMock.mockClear();
        errorMock.mockClear();
        await safeParse(['flow', 'review', 'add', '--op', 'v1.0.0-stage-01.op-001', '--title', 't', '--auto-fix', 'x']);
        expect(exitMock).not.toHaveBeenCalled();
        const fullFlow = JSON.parse(readFileSync(join(dir2, '.openfeel', 'flow.json'), 'utf-8'));
        expect(fullFlow.reviews).toHaveLength(1);
        // 短名与全名结果一致（除 review.op 字面值）
        expect(shortFlow.reviews[0].status).toBe(fullFlow.reviews[0].status);
        expect(shortFlow.reviews[0].canAutoFix).toBe(fullFlow.reviews[0].canAutoFix);
        expect(shortFlow.stages['v1.0.0-stage-01'].phase).toBe(fullFlow.stages['v1.0.0-stage-01'].phase);
      } finally {
        cwdMock.mockReturnValue(tmpDir);
        rmSync(dir2, { recursive: true, force: true });
      }
    } finally {
      warnMock.mockRestore();
    }
  });

  it('op-014/T1: review add 短名前缀（无 auto-fix）不再 stageNotFound', async () => {
    makeReviewFailedStage('v1.0.0-stage-02');
    exitMock.mockClear();
    errorMock.mockClear();
    await safeParse(['flow', 'review', 'add', '--op', 'stage-02.op-001', '--title', 't']);
    expect(exitMock).not.toHaveBeenCalled();
    const flow = JSON.parse(readFileSync(join(tmpDir, '.openfeel', 'flow.json'), 'utf-8'));
    expect(flow.reviews).toHaveLength(1);
    expect(flow.reviews[0].status).toBe('open');
    // 错误码契约保持：op 不存在 → opNotFound（exit 1 且不新增条目）
    exitMock.mockClear();
    errorMock.mockClear();
    await safeParse(['flow', 'review', 'add', '--op', 'stage-02.op-999', '--title', 't']);
    expect(exitMock).toHaveBeenCalledWith(1);
    const after = JSON.parse(readFileSync(join(tmpDir, '.openfeel', 'flow.json'), 'utf-8'));
    expect(after.reviews).toHaveLength(1);
  });

  it('op-014/T1: checkpoint list 短名列出全名快照（修复前静默空）+ 无参回归', async () => {
    const cpDir = join(tmpDir, '.openfeel', 'checkpoints');
    mkdirSync(cpDir, { recursive: true });
    const snap = 'v1.0.0-stage-01-20260101T000000000-plan_review.json';
    writeFileSync(join(cpDir, snap), '{}', 'utf-8');

    logMock.mockClear();
    await safeParse(['flow', 'checkpoint', 'list', 'stage-01']);
    const shortOut = logMock.mock.calls.map((c) => c[0] as string).join('\n');
    expect(shortOut).toContain(snap);
    expect(shortOut).not.toContain('暂无');

    logMock.mockClear();
    await safeParse(['flow', 'checkpoint', 'list', 'v1.0.0-stage-01']);
    const fullOut = logMock.mock.calls.map((c) => c[0] as string).join('\n');
    expect(fullOut).toContain(snap);
    expect(fullOut).not.toContain('暂无');

    // 无参回归：仍列出全部快照
    logMock.mockClear();
    await safeParse(['flow', 'checkpoint', 'list']);
    expect(logMock.mock.calls.map((c) => c[0] as string).join('\n')).toContain(snap);
  });

  /** op-001 夹具：写入含 A/B/C 三阶段的 flow.json 并生成 A 阶段快照，返回快照文件名 */
  function setupSelectiveSnapshot(): string {
    const mgr = new FlowManager(tmpDir);
    const data: FlowData = {
      meta: { version: '1.0', project: 'CmdSelective', updated: '2026-01-01T00:00:00Z' },
      pipeline: { phase: 'active' as MetaPhase, current: { stage: 'v1.0.0-stage-A', op: 'op-001' }, retry: 0 },
      stages: {
        'v1.0.0-stage-A': { name: 'A', phase: 'exec_running' as PipelinePhase, status: 'testing', deps: [], ops: {} },
        'v1.0.0-stage-B': { name: 'B', phase: 'plan_passed' as PipelinePhase, status: 'planned', deps: [], ops: {} },
        'v1.0.0-stage-C': { name: 'C', phase: 'scheme_passed' as PipelinePhase, status: 'planned', deps: [], ops: {} },
      },
      reviews: [],
      log: [],
    };
    mgr.setData(data);
    mgr.save();
    mgr.saveCheckpoint('v1.0.0-stage-A', 'exec_running' as PipelinePhase);
    // 先对 A=exec_running 生成快照，再改动磁盘 A/B/C，使 A 有明显可回退差异
    const d = mgr.getData()!;
    d.stages['v1.0.0-stage-A'].phase = 'done';
    d.stages['v1.0.0-stage-A'].status = 'done';
    d.stages['v1.0.0-stage-B'].phase = 'exec_running';
    mgr.save();
    return mgr.listCheckpoints('v1.0.0-stage-A')[0];
  }

  it('op-001 T6.2: checkpoint restore --dry-run 零写盘且输出差异', async () => {
    const snap = setupSelectiveSnapshot();
    const flowPath = join(tmpDir, '.openfeel', 'flow.json');
    const before = readFileSync(flowPath, 'utf-8');

    logMock.mockClear();
    await safeParse(['flow', 'checkpoint', 'restore', snap, '--stage', 'v1.0.0-stage-A', '--dry-run']);
    const out = logMock.mock.calls.map((c) => c[0] as string).join('\n');
    expect(out).toContain('Checkpoint 恢复预览');
    expect(out).toContain('v1.0.0-stage-A');
    expect(out).toContain('exec_running');
    // 零写盘
    expect(readFileSync(flowPath, 'utf-8')).toBe(before);
  });

  it('op-001 T6.1: checkpoint restore --stage 仅回退指定阶段', async () => {
    const snap = setupSelectiveSnapshot();
    const flowPath = join(tmpDir, '.openfeel', 'flow.json');

    logMock.mockClear();
    await safeParse(['flow', 'checkpoint', 'restore', snap, '--stage', 'v1.0.0-stage-A', '--force']);
    expect(exitMock).not.toHaveBeenCalled();

    const after = JSON.parse(readFileSync(flowPath, 'utf-8')) as FlowData;
    expect(after.stages['v1.0.0-stage-A'].phase).toBe('exec_running');
    // B 保留改动后的磁盘值，未被回退
    expect(after.stages['v1.0.0-stage-B'].phase).toBe('exec_running');
    expect(after.stages['v1.0.0-stage-C'].phase).toBe('scheme_passed');
  });

  it('op-001 T6.8: checkpoint restore 路径穿越仍拒绝（exit 1）', async () => {
    await safeParse(['flow', 'checkpoint', 'restore', '../evil.json', '--force']);
    expect(exitMock).toHaveBeenCalledWith(1);
  });

  // ── op-002：flow stage reset ──

  /** op-002 夹具：单阶段（全名键）flow.json + 可选 blocking REV */
  function setupResetStage(
    phase: PipelinePhase,
    status: string,
    reviews: FlowData['reviews'] = [],
  ): void {
    const mgr = new FlowManager(tmpDir);
    const data: FlowData = {
      meta: { version: '1.0', project: 'CmdReset', updated: '2026-01-01T00:00:00Z' },
      pipeline: { phase: 'active' as MetaPhase, current: { stage: 'v1.0.0-stage-01', op: '' }, retry: 0 },
      stages: {
        'v1.0.0-stage-01': { name: 'v1.0.0-stage-01', phase, status, deps: [], ops: {} },
      },
      reviews,
      log: [],
    };
    mgr.setData(data);
    mgr.save();
  }

  it('op-002 T6.4: flow stage reset 回退成功且 status 按投影同步（exit 0）', async () => {
    setupResetStage('review_passed' as PipelinePhase, 'review_passed');
    logMock.mockClear();
    await safeParse(['flow', 'stage', 'reset', 'v1.0.0-stage-01', '--to', 'review_pending']);
    expect(exitMock).not.toHaveBeenCalled();
    const out = logMock.mock.calls.map((c) => c[0] as string).join('\n');
    expect(out).toContain('已复位');
    const after = JSON.parse(readFileSync(join(tmpDir, '.openfeel', 'flow.json'), 'utf-8')) as FlowData;
    expect(after.stages['v1.0.0-stage-01'].phase).toBe('review_pending');
    // mapPhaseToStageStatus('review_pending', 'review_passed') → default 保持原 status
    expect(after.stages['v1.0.0-stage-01'].status).toBe('review_passed');
    const last = after.log[after.log.length - 1];
    expect(last.action).toBe('reset_stage_phase');
  });

  it('op-002 T6.5: reset --to done + blocking REV → exit 1 且 phase 不变', async () => {
    setupResetStage('test_passed' as PipelinePhase, 'testing', [
      {
        id: 'REV-001',
        op: 'v1.0.0-stage-01.op-001',
        title: 't',
        status: 'open',
        blocking: true,
        priority: 'high',
        filed_by: 'openfeel-reviewer',
        filed_at: '2026-01-01T00:00:00Z',
      },
    ]);
    await safeParse(['flow', 'stage', 'reset', 'v1.0.0-stage-01', '--to', 'done']);
    expect(exitMock).toHaveBeenCalledWith(1);
    const after = JSON.parse(readFileSync(join(tmpDir, '.openfeel', 'flow.json'), 'utf-8')) as FlowData;
    expect(after.stages['v1.0.0-stage-01'].phase).toBe('test_passed');
  });

  it('op-002 T6.6: reset --dry-run 零写盘', async () => {
    setupResetStage('done' as PipelinePhase, 'done');
    const flowPath = join(tmpDir, '.openfeel', 'flow.json');
    const before = readFileSync(flowPath, 'utf-8');
    logMock.mockClear();
    await safeParse(['flow', 'stage', 'reset', 'v1.0.0-stage-01', '--to', 'review_passed', '--dry-run']);
    const out = logMock.mock.calls.map((c) => c[0] as string).join('\n');
    expect(out).toContain('复位预览');
    expect(readFileSync(flowPath, 'utf-8')).toBe(before);
  });

  it('op-002 T6.7: reset 复位后 advance --to test_pending 不被锁（exit 0）', async () => {
    setupResetStage('done' as PipelinePhase, 'done');
    await safeParse(['flow', 'stage', 'reset', 'v1.0.0-stage-01', '--to', 'review_passed']);
    expect(exitMock).not.toHaveBeenCalled();
    await safeParse(['flow', 'advance', '--stage', 'v1.0.0-stage-01', '--to', 'test_pending']);
    expect(exitMock).not.toHaveBeenCalled();
    const after = JSON.parse(readFileSync(join(tmpDir, '.openfeel', 'flow.json'), 'utf-8')) as FlowData;
    expect(after.stages['v1.0.0-stage-01'].phase).toBe('test_pending');
  });

  it('op-002: flow stage 子命令含 reset', () => {
    const flowCmd = program.commands.find((c) => c.name() === 'flow');
    const stageCmd = flowCmd!.commands.find((c) => c.name() === 'stage');
    expect(stageCmd!.commands.map((c) => c.name())).toContain('reset');
  });

  // ═══════════════════════════════════════════════
  // flow archive（stage-79 op-001）
  // ═══════════════════════════════════════════════

  describe('flow archive（stage-79 op-001）', () => {
    let revSeq = 0;

    // 防污染 vitest 退出码：失败路径仅置 process.exitCode（非 process.exit）
    beforeEach(() => {
      process.exitCode = 0;
      revSeq = 0;
    });
    afterEach(() => {
      process.exitCode = 0;
    });

    /** 构造最小 StageData */
    function makeStageData(phase: PipelinePhase): StageData {
      return { name: 's', phase, status: String(phase), deps: [], ops: {} };
    }

    /** 构造可配置 status/blocking 的审查条目（未传 blocking 则不写该键，模拟缺省） */
    function makeRevItem(
      op: string,
      opts: { status?: 'open' | 'resolved' | 'closed'; blocking?: boolean } = {},
    ): FlowData['reviews'][number] {
      revSeq += 1;
      const item: FlowData['reviews'][number] = {
        id: `REV-A-${revSeq}`,
        op,
        status: opts.status ?? 'open',
        priority: 'high',
        title: '标题',
        filed_by: 'openfeel-reviewer',
        filed_at: '2026-01-01T00:00:00Z',
      };
      if (opts.blocking !== undefined) {
        item.blocking = opts.blocking;
      }
      return item;
    }

    /** 夹具：直接写入 flow.json（stages / reviews / log / pipeline.current） */
    function setupArchiveFixture(opts: {
      stages: FlowData['stages'];
      reviews?: FlowData['reviews'];
      log?: FlowData['log'];
      current?: { stage: string; op: string };
    }): void {
      const mgr = new FlowManager(tmpDir);
      const data: FlowData = {
        meta: { version: '1.0', project: 'ArchiveFixture', updated: '2026-01-01T00:00:00Z' },
        pipeline: {
          phase: 'active' as MetaPhase,
          current: opts.current ?? { stage: '', op: '' },
          retry: 0,
        },
        stages: opts.stages,
        reviews: opts.reviews ?? [],
        log: opts.log ?? [],
      };
      mgr.setData(data);
      mgr.save();
    }

    /** 四写盘点快照：给定相对路径 → 内容 / 目录标记 / 缺失标记（递归） */
    function collectWrites(): Record<string, string> {
      const out: Record<string, string> = {};
      const add = (p: string): void => {
        if (!existsSync(p)) {
          out[p] = '<missing>';
          return;
        }
        if (statSync(p).isDirectory()) {
          out[p] = '<dir>';
          for (const name of readdirSync(p)) {
            add(join(p, name));
          }
          return;
        }
        out[p] = readFileSync(p, 'utf-8');
      };
      for (const rel of ['flow.json', 'flow.json.bak', 'flow-archive', 'checkpoints', 'log', 'tmp/locks']) {
        add(join(tmpDir, '.openfeel', rel));
      }
      return out;
    }

    /** 成功夹具：v1.9.0 全 done（两阶段）+ 保留 v1.9.9 非 done + reviews/log */
    function setupArchivableV190(current?: { stage: string; op: string }): void {
      setupArchiveFixture({
        stages: {
          'v1.9.0-stage-01': makeStageData('done'),
          'v1.9.0-stage-02': makeStageData('done'),
          'v1.9.9-stage-01': makeStageData('exec_running'),
        },
        reviews: [makeRevItem('v1.9.0-stage-01.op-001', { status: 'closed' })],
        log: [{ time: 't', agent: 'cli', action: 'advance_stage_phase', detail: { stageName: 'v1.9.0-stage-01' } }],
        current,
      });
    }

    const flowJsonPath = (): string => join(tmpDir, '.openfeel', 'flow.json');
    const archivePath = (v: string): string => join(tmpDir, '.openfeel', 'flow-archive', `${v}.json`);

    // ── T5.1 判据门 ──

    it('T5.1①: 未全 done → exit 1 且零写盘（flow.json / 归档目录 / checkpoints 三处不变）', async () => {
      setupArchiveFixture({
        stages: {
          'v1.9.0-stage-01': makeStageData('done'),
          'v1.9.0-stage-02': makeStageData('exec_running'),
          'v1.9.9-stage-01': makeStageData('exec_running'),
        },
        current: { stage: 'v1.9.0-stage-02', op: 'op-001' },
      });
      const beforeFlow = readFileSync(flowJsonPath(), 'utf-8');
      const cpDir = join(tmpDir, '.openfeel', 'checkpoints');
      const beforeCp = existsSync(cpDir) ? readdirSync(cpDir).sort() : [];

      logMock.mockClear();
      await safeParse(['flow', 'archive', 'v1.9.0']);

      expect(process.exitCode).toBe(1);
      expect(readFileSync(flowJsonPath(), 'utf-8')).toBe(beforeFlow);
      expect(existsSync(join(tmpDir, '.openfeel', 'flow-archive'))).toBe(false);
      expect(existsSync(cpDir) ? readdirSync(cpDir).sort() : []).toEqual(beforeCp);
      const out = errorMock.mock.calls.map((c) => c[0] as string).join('\n');
      expect(out).toContain('存在未完成阶段');
      expect(out).toContain('v1.9.0-stage-02');
    });

    it('T5.1②: blocking 缺省（undefined）+ open REV → 拒（exit 1）', async () => {
      setupArchiveFixture({
        stages: { 'v1.9.0-stage-01': makeStageData('done') },
        reviews: [makeRevItem('v1.9.0-stage-01.op-001', { status: 'open' })],
      });
      const beforeFlow = readFileSync(flowJsonPath(), 'utf-8');

      logMock.mockClear();
      await safeParse(['flow', 'archive', 'v1.9.0']);

      expect(process.exitCode).toBe(1);
      expect(readFileSync(flowJsonPath(), 'utf-8')).toBe(beforeFlow);
      expect(existsSync(join(tmpDir, '.openfeel', 'flow-archive'))).toBe(false);
      const out = errorMock.mock.calls.map((c) => c[0] as string).join('\n');
      expect(out).toContain('存在阻塞 open 审查');
      expect(out).toContain('REV-A-1');
    });

    it('T5.1③: blocking:false + open REV → 不拒（进入成功路径）', async () => {
      setupArchiveFixture({
        stages: { 'v1.9.0-stage-01': makeStageData('done'), 'v1.9.9-stage-01': makeStageData('exec_running') },
        reviews: [makeRevItem('v1.9.0-stage-01.op-001', { status: 'open', blocking: false })],
      });

      logMock.mockClear();
      await safeParse(['flow', 'archive', 'v1.9.0']);

      expect(process.exitCode).toBe(0);
      expect(existsSync(archivePath('v1.9.0'))).toBe(true);
      const file = JSON.parse(readFileSync(archivePath('v1.9.0'), 'utf-8')) as ArchiveFile;
      expect(file.reviews).toHaveLength(1);
    });

    it('T5.1④: blocking:true + open REV → 拒（exit 1）', async () => {
      setupArchiveFixture({
        stages: { 'v1.9.0-stage-01': makeStageData('done') },
        reviews: [makeRevItem('v1.9.0-stage-01.op-001', { status: 'open', blocking: true })],
      });

      logMock.mockClear();
      await safeParse(['flow', 'archive', 'v1.9.0']);

      expect(process.exitCode).toBe(1);
      expect(existsSync(join(tmpDir, '.openfeel', 'flow-archive'))).toBe(false);
    });

    // ── T5.2 成功路径 ──

    it('T5.2: 成功路径 — 归档文件 / counts / flow.json 零残留 / 审计 / 索引 / pipeline 处置', async () => {
      setupArchivableV190({ stage: 'v1.9.0-stage-01', op: 'op-001' });
      const pre = new FlowManager(tmpDir).getData()!;
      const expected = splitForArchive(pre, 'v1.9.0');

      logMock.mockClear();
      await safeParse(['flow', 'archive', 'v1.9.0']);

      expect(process.exitCode).toBe(0);
      expect(existsSync(archivePath('v1.9.0'))).toBe(true);
      const file = JSON.parse(readFileSync(archivePath('v1.9.0'), 'utf-8')) as ArchiveFile;
      expect(file.schemaVersion).toBe(ARCHIVE_SCHEMA_VERSION);
      expect(file.version).toBe('v1.9.0');
      expect(Number.isNaN(Date.parse(file.archived_at))).toBe(false);
      expect(file.stages).toEqual(expected.archive.stages);
      expect(file.reviews).toEqual(expected.archive.reviews);
      expect(file.log).toEqual(expected.archive.log);
      expect(file.counts).toEqual(expected.archive.counts);

      const after = JSON.parse(readFileSync(flowJsonPath(), 'utf-8')) as FlowData;
      // 三段零残留
      expect(Object.keys(after.stages)).toEqual(['v1.9.9-stage-01']);
      expect(after.reviews).toEqual([]);
      expect(after.log.filter((e) => e.detail['stageName'] === 'v1.9.0-stage-01')).toHaveLength(0);
      // 审计条目为最后一条（记录在归档后 flow.json）
      const last = after.log[after.log.length - 1];
      expect(last.action).toBe('archive_flow_version');
      expect(last.detail).toMatchObject({ version: 'v1.9.0', stages: 2, reviews: 1, log: 1 });
      // 索引
      expect(after.meta.archived_versions).toEqual(['v1.9.0']);
      // pipeline 处置：current 命中 → 置空；phase 按活跃集重算
      expect(after.pipeline.current).toEqual({ stage: '', op: '' });
      expect(after.pipeline.phase).toBe('active');
      // 人类输出
      const out = logMock.mock.calls.map((c) => c[0] as string).join('\n');
      expect(out).toContain('已归档 v1.9.0：阶段 2 / 审查 1 / 日志 1');
      expect(out).toContain('pipeline 处置：current=(无)，phase=active');
    });

    it('T5.2c: 非 dry-run --json 成功 → 9 键 + eligible:true + 空明细（console.error 零调用）', async () => {
      setupArchivableV190();
      logMock.mockClear();
      errorMock.mockClear();
      await safeParse(['flow', 'archive', 'v1.9.0', '--json']);
      expect(process.exitCode).toBe(0);
      expect(errorMock).not.toHaveBeenCalled();
      expect(logMock).toHaveBeenCalledTimes(1);
      const payload = JSON.parse(logMock.mock.calls[0][0] as string) as Record<string, unknown>;
      expect(Object.keys(payload)).toEqual([
        'schemaVersion', 'version', 'stages', 'reviews', 'log', 'dryRun',
        'eligible', 'unfinishedStages', 'blockingReviews',
      ]);
      expect(payload).toMatchObject({
        schemaVersion: 1, version: 'v1.9.0', stages: 2, reviews: 1, log: 1,
        dryRun: false, eligible: true, unfinishedStages: [], blockingReviews: [],
      });
    });

    it('T5.2b: 活跃集归档后全 done → pipeline.phase = done；current 不命中版本 → 不变', async () => {
      setupArchiveFixture({
        stages: {
          'v1.9.0-stage-01': makeStageData('done'),
          'v1.0.0-stage-01': makeStageData('done'),
        },
        current: { stage: 'v1.0.0-stage-01', op: 'op-002' },
      });

      logMock.mockClear();
      await safeParse(['flow', 'archive', 'v1.9.0']);

      expect(process.exitCode).toBe(0);
      const after = JSON.parse(readFileSync(flowJsonPath(), 'utf-8')) as FlowData;
      expect(after.pipeline.phase).toBe('done');
      expect(after.pipeline.current).toEqual({ stage: 'v1.0.0-stage-01', op: 'op-002' });
      const out = logMock.mock.calls.map((c) => c[0] as string).join('\n');
      expect(out).toContain('phase=done');
    });

    // ── T5.3 dry-run 字节级零写盘（四写盘点）──

    it('T5.3: --dry-run 四写盘点逐字节不变 + 归档目录不存在 + --json 纯单文档', async () => {
      setupArchivableV190({ stage: 'v1.9.0-stage-01', op: 'op-001' });
      const before = collectWrites();

      logMock.mockClear();
      await safeParse(['flow', 'archive', 'v1.9.0', '--dry-run']);

      expect(process.exitCode).toBe(0);
      expect(collectWrites()).toEqual(before);
      expect(existsSync(join(tmpDir, '.openfeel', 'flow-archive'))).toBe(false);
      const out = logMock.mock.calls.map((c) => c[0] as string).join('\n');
      expect(out).toContain('[dry-run] 将归档 v1.9.0：阶段 2 / 审查 1 / 日志 1');
      expect(out).toContain('预览模式：未写入任何文件');

      // --dry-run --json：纯单文档 + dryRun === true（console.error 零调用）
      logMock.mockClear();
      errorMock.mockClear();
      await safeParse(['flow', 'archive', 'v1.9.0', '--dry-run', '--json']);
      expect(process.exitCode).toBe(0);
      expect(errorMock).not.toHaveBeenCalled();
      expect(logMock).toHaveBeenCalledTimes(1);
      const payload = JSON.parse(logMock.mock.calls[0][0] as string) as Record<string, unknown>;
      expect(payload).toEqual({
        schemaVersion: 1, version: 'v1.9.0', stages: 2, reviews: 1, log: 1, dryRun: true,
        eligible: true, unfinishedStages: [], blockingReviews: [],
      });
      // 键序冻结（D-97-03-03）：成功 9 键
      expect(Object.keys(payload)).toEqual([
        'schemaVersion', 'version', 'stages', 'reviews', 'log', 'dryRun',
        'eligible', 'unfinishedStages', 'blockingReviews',
      ]);
      expect(collectWrites()).toEqual(before);
    });

    // ── T5.4 幂等与覆盖写边界 + 顺序不变量 ──

    it('T5.4①: 二次归档同版本 → version-not-active 拒（exit 1）+ 归档文件字节不变 + flow.json 不变', async () => {
      setupArchivableV190();
      await safeParse(['flow', 'archive', 'v1.9.0']);
      expect(process.exitCode).toBe(0);
      const archivedBytes = readFileSync(archivePath('v1.9.0'), 'utf-8');
      const flowBytes = readFileSync(flowJsonPath(), 'utf-8');

      logMock.mockClear();
      errorMock.mockClear();
      await safeParse(['flow', 'archive', 'v1.9.0']);

      expect(process.exitCode).toBe(1);
      expect(readFileSync(archivePath('v1.9.0'), 'utf-8')).toBe(archivedBytes);
      expect(readFileSync(flowJsonPath(), 'utf-8')).toBe(flowBytes);
      expect(errorMock.mock.calls.map((c) => c[0] as string).join('\n')).toContain('未注册于活跃 flow.json');
    });

    it('T5.4②: 不存在版本 v9.9.9 → 存在性门拒绝且归档目录仍不存在（空集不写盘）', async () => {
      setupArchiveFixture({ stages: { 'v1.9.0-stage-01': makeStageData('done') } });
      const beforeFlow = readFileSync(flowJsonPath(), 'utf-8');

      logMock.mockClear();
      await safeParse(['flow', 'archive', 'v9.9.9']);

      expect(process.exitCode).toBe(1);
      expect(existsSync(join(tmpDir, '.openfeel', 'flow-archive'))).toBe(false);
      expect(readFileSync(flowJsonPath(), 'utf-8')).toBe(beforeFlow);
    });

    it('T5.4③: 非法版本（abc / vv1.1.7）→ invalid-version 拒零写盘', async () => {
      setupArchiveFixture({ stages: { 'v1.9.0-stage-01': makeStageData('done') } });
      const beforeFlow = readFileSync(flowJsonPath(), 'utf-8');

      for (const bad of ['abc', 'vv1.1.7']) {
        logMock.mockClear();
        errorMock.mockClear();
        await safeParse(['flow', 'archive', bad]);
        expect(process.exitCode).toBe(1);
        expect(errorMock.mock.calls.map((c) => c[0] as string).join('\n')).toContain('非法版本号');
        expect(existsSync(join(tmpDir, '.openfeel', 'flow-archive'))).toBe(false);
        expect(readFileSync(flowJsonPath(), 'utf-8')).toBe(beforeFlow);
      }
    });

    it('T5.4④: 顺序不变量 — save 抛并发 → exit 2、归档文件已落盘、flow.json 原样；重跑幂等收敛', async () => {
      setupArchivableV190();
      const beforeFlow = readFileSync(flowJsonPath(), 'utf-8');

      const saveSpy = vi.spyOn(FlowManager.prototype, 'save').mockImplementationOnce(() => {
        throw new FlowConcurrentModificationError(1, 2);
      });
      logMock.mockClear();
      errorMock.mockClear();
      await safeParse(['flow', 'archive', 'v1.9.0']);

      expect(exitMock).toHaveBeenCalledWith(2);
      // 归档文件先落盘
      expect(existsSync(archivePath('v1.9.0'))).toBe(true);
      const archivedBytes = readFileSync(archivePath('v1.9.0'), 'utf-8');
      // flow.json 原样（save 未生效）
      expect(readFileSync(flowJsonPath(), 'utf-8')).toBe(beforeFlow);

      saveSpy.mockRestore();

      // 重跑：幂等收敛（覆盖写 + 索引不重复）
      logMock.mockClear();
      errorMock.mockClear();
      await safeParse(['flow', 'archive', 'v1.9.0']);
      expect(process.exitCode).toBe(0);
      const converged = JSON.parse(readFileSync(archivePath('v1.9.0'), 'utf-8')) as ArchiveFile;
      expect(converged.version).toBe('v1.9.0');
      expect(converged.counts.stages).toBe(2);
      const after = JSON.parse(readFileSync(flowJsonPath(), 'utf-8')) as FlowData;
      expect(after.meta.archived_versions).toEqual(['v1.9.0']);
      expect(Object.keys(after.stages)).toEqual(['v1.9.9-stage-01']);
    });

    it('T5.4⑤: 未初始化 → no-init（--json 纯单文档 exit 1）', async () => {
      rmSync(join(tmpDir, '.openfeel', 'flow.json'), { force: true });
      logMock.mockClear();
      await safeParse(['flow', 'archive', 'v1.9.0', '--json']);
      expect(process.exitCode).toBe(1);
      expect(JSON.parse(logMock.mock.calls[0][0] as string)).toEqual({ schemaVersion: 1, error: 'no-init', errorKind: 'refusal' });
    });

    it('T5.1/T5.4 --json: 判据门失败 / 版本未注册 → 纯 JSON 单文档 + exit 1（console.error 零调用）', async () => {
      setupArchiveFixture({
        stages: { 'v1.9.0-stage-01': makeStageData('done'), 'v1.9.0-stage-02': makeStageData('exec_running') },
        reviews: [makeRevItem('v1.9.0-stage-01.op-001', { status: 'open' })],
      });

      logMock.mockClear();
      errorMock.mockClear();
      await safeParse(['flow', 'archive', 'v1.9.0', '--json']);
      expect(process.exitCode).toBe(1);
      expect(errorMock).not.toHaveBeenCalled();
      expect(logMock).toHaveBeenCalledTimes(1);
      const payload = JSON.parse(logMock.mock.calls[0][0] as string) as {
        schemaVersion: number;
        error: string;
        notDone: string[];
        blockingOpen: string[];
        eligible: boolean;
        unfinishedStages: Array<{ id: string; phase: string | null }>;
        blockingReviews: Array<{ id: string; title: string; priority: string }>;
        errorKind: string;
      };
      expect(payload.schemaVersion).toBe(1);
      expect(payload.error).toBe('gate-rejected');
      expect(payload.notDone).toEqual(['v1.9.0-stage-02']);
      expect(payload.blockingOpen).toEqual(['REV-A-1']);
      // stage-95 op-002：legacy 载荷末尾追加 errorKind（refusal），既有键序不变
      // op-003：三新键插在 blockingOpen 后、errorKind 前（D-97-03-03）
      expect(Object.keys(payload)).toEqual([
        'schemaVersion', 'error', 'version', 'notDone', 'blockingOpen',
        'eligible', 'unfinishedStages', 'blockingReviews', 'errorKind',
      ]);
      expect(payload.errorKind).toBe('refusal');
      // op-003 判据明细：eligible=false + 未完成阶段 / 阻塞审查结构化明细
      expect(payload.eligible).toBe(false);
      expect(payload.unfinishedStages).toEqual([{ id: 'v1.9.0-stage-02', phase: 'exec_running' }]);
      expect(payload.blockingReviews).toEqual([{ id: 'REV-A-1', title: '标题', priority: 'high' }]);
      expect(typeof payload.error).toBe('string');
    });
  });

  // ═══════════════════════════════════════════════
  // flow archive list/show（stage-79 op-002）
  // ═══════════════════════════════════════════════

  describe('flow archive list/show（stage-79 op-002）', () => {
    beforeEach(() => {
      process.exitCode = 0;
    });
    afterEach(() => {
      process.exitCode = 0;
    });

    const flowJsonPath = (): string => join(tmpDir, '.openfeel', 'flow.json');
    const archivePath = (v: string): string => join(tmpDir, '.openfeel', 'flow-archive', `${v}.json`);

    /** 夹具：写入 v1.0.0 当前阶段（保留）+ 各待归档版本的 done 阶段 / 可辨识 reviews / log */
    function seedVersions(versions: string[]): void {
      const stages: FlowData['stages'] = {
        'v1.0.0-stage-01': { name: 'c', phase: 'exec_running' as PipelinePhase, status: 'exec_running', deps: [], ops: {} },
      };
      const reviews: FlowData['reviews'] = [];
      const log: FlowData['log'] = [];
      for (const v of versions) {
        stages[`${v}-stage-01`] = { name: v, phase: 'done' as PipelinePhase, status: 'done', deps: [], ops: {} };
        reviews.push({
          id: `REV-SHOW-${v}`,
          op: `${v}-stage-01.op-001`,
          status: 'closed',
          priority: 'low',
          title: 'SHOW-TOKEN-TITLE',
          filed_by: 't',
          filed_at: '',
        });
        log.push({
          time: '2026-01-01T00:00:00.000Z',
          agent: 'cli',
          action: 'SHOW-TOKEN-ACTION',
          detail: { stageName: `${v}-stage-01` },
        });
      }
      const mgr = new FlowManager(tmpDir);
      mgr.setData({
        meta: { version: '1.0', project: 'L', updated: '2026-01-01T00:00:00Z' },
        pipeline: { phase: 'active' as MetaPhase, current: { stage: 'v1.0.0-stage-01', op: '' }, retry: 0 },
        stages,
        reviews,
        log,
      });
      mgr.save();
    }

    /** 采集「写盘点」快照（路径 → 内容 / 目录标记 / 缺失标记，递归） */
    function collectWrites(): Record<string, string> {
      const out: Record<string, string> = {};
      const add = (p: string): void => {
        if (!existsSync(p)) {
          out[p] = '<missing>';
          return;
        }
        if (statSync(p).isDirectory()) {
          out[p] = '<dir>';
          for (const name of readdirSync(p)) {
            add(join(p, name));
          }
          return;
        }
        out[p] = readFileSync(p, 'utf-8');
      };
      for (const rel of ['flow.json', 'flow.json.bak', 'flow-archive', 'checkpoints', 'log', 'tmp/locks']) {
        add(join(tmpDir, '.openfeel', rel));
      }
      return out;
    }

    /** 执行命令并返回 console.log 输出行数组 */
    async function capture(args: string[]): Promise<string[]> {
      logMock.mockClear();
      errorMock.mockClear();
      await safeParse(args);
      return logMock.mock.calls.map((c) => c[0] as string);
    }

    // ── T5.5a 空态 ──

    it('T5.5a: list 空态 → 暂无归档提示且 exit 0', async () => {
      const out = await capture(['flow', 'archive', 'list']);
      expect(process.exitCode).toBe(0);
      expect(errorMock).not.toHaveBeenCalled();
      expect(out.join('\n')).toContain('暂无归档版本');
    });

    // ── T5.5b 字典序 ──

    it('T5.5b: list 顺序 = 引擎字典序（v1.1.6 → v1.1.7）', async () => {
      seedVersions(['v1.1.7', 'v1.1.6']);
      await safeParse(['flow', 'archive', 'v1.1.6']);
      await safeParse(['flow', 'archive', 'v1.1.7']);
      expect(process.exitCode).toBe(0);

      const out = await capture(['flow', 'archive', 'list', '--json']);
      const payload = JSON.parse(out[0]) as { versions: Array<{ version: string }> };
      expect(payload.versions.map((r) => r.version)).toEqual(['v1.1.6', 'v1.1.7']);
    });

    // ── T5.5c list --json 纯单文档 ──

    it('T5.5c: list --json 纯单文档（console.log ×1 / 顶层键 schemaVersion+versions / error 零调用）', async () => {
      seedVersions(['v1.1.7']);
      await safeParse(['flow', 'archive', 'v1.1.7']);

      logMock.mockClear();
      errorMock.mockClear();
      await safeParse(['flow', 'archive', 'list', '--json']);
      expect(process.exitCode).toBe(0);
      expect(logMock).toHaveBeenCalledTimes(1);
      expect(errorMock).not.toHaveBeenCalled();
      const payload = JSON.parse(logMock.mock.calls[0][0] as string) as {
        schemaVersion: number;
        versions: Array<{ version: string; counts: unknown }>;
      };
      expect(Object.keys(payload).sort()).toEqual(['schemaVersion', 'versions']);
      expect(payload.schemaVersion).toBe(1);
      expect(payload.versions).toEqual([{ version: 'v1.1.7', counts: { stages: 1, reviews: 1, log: 1 } }]);
    });

    it('T5.5c2: list 损坏文件 → 不可读文案（不抛）', async () => {
      seedVersions(['v1.1.7']);
      await safeParse(['flow', 'archive', 'v1.1.7']);
      writeFileSync(archivePath('v1.1.7'), '{broken', 'utf-8');

      const out = await capture(['flow', 'archive', 'list']);
      expect(process.exitCode).toBe(0);
      expect(out.join('\n')).toContain('(不可读，文件损坏或非法)');
      const json = await capture(['flow', 'archive', 'list', '--json']);
      const payload = JSON.parse(json[0]) as { versions: Array<{ counts: unknown }> };
      expect(payload.versions[0].counts).toBeNull();
    });

    // ── T5.5d show 成功 & 前缀兼容 ──

    it('T5.5d: show 成功 + 前缀兼容（1.1.7 ≡ v1.1.7）且不含 log/reviews 明细', async () => {
      seedVersions(['v1.1.7']);
      await safeParse(['flow', 'archive', 'v1.1.7']);
      expect(process.exitCode).toBe(0);

      const full = await capture(['flow', 'archive', 'show', 'v1.1.7']);
      const short = await capture(['flow', 'archive', 'show', '1.1.7']);
      expect(process.exitCode).toBe(0);
      expect(short).toEqual(full);
      const text = full.join('\n');
      expect(text).toContain('归档版本 v1.1.7（archived_at: ');
      expect(text).toContain('阶段 1 / 审查 1 / 日志 1');
      expect(text).toContain('阶段：');
      expect(text).toContain('  - v1.1.7-stage-01 [done]');
      expect(text).toContain('完整 log / reviews 请用 --json 查看');
      // 防上下文膨胀（R-79-4）：人类输出不含 log / reviews 明细
      expect(text).not.toContain('SHOW-TOKEN-ACTION');
      expect(text).not.toContain('REV-SHOW-v1.1.7');
      expect(text).not.toContain('SHOW-TOKEN-TITLE');
    });

    // ── T5.5e show --json 全量 ──

    it('T5.5e: show --json = 全量载荷，与磁盘文件深等', async () => {
      seedVersions(['v1.1.7']);
      await safeParse(['flow', 'archive', 'v1.1.7']);

      logMock.mockClear();
      errorMock.mockClear();
      await safeParse(['flow', 'archive', 'show', 'v1.1.7', '--json']);
      expect(process.exitCode).toBe(0);
      expect(logMock).toHaveBeenCalledTimes(1);
      expect(errorMock).not.toHaveBeenCalled();
      const payload = JSON.parse(logMock.mock.calls[0][0] as string) as ArchiveFile;
      const onDisk = JSON.parse(readFileSync(archivePath('v1.1.7'), 'utf-8')) as ArchiveFile;
      expect(payload).toEqual(onDisk);
      expect(payload.schemaVersion).toBe(1);
      // stage-95 op-001 / G-1：首键重定位（命令层 withSchemaVersion；其余相对序不变）
      expect(Object.keys(payload)).toEqual([
        'schemaVersion', 'version', 'stages', 'reviews', 'log', 'counts', 'archived_at',
      ]);
      expect(payload.log).toHaveLength(1);
      expect(payload.reviews).toHaveLength(1);
    });

    // ── T5.5f show 失败两径 ──

    it('T5.5f: show 失败两径（不存在 / 非法版本）；--json 恒纯单文档 + exit 1', async () => {
      seedVersions(['v1.1.7']);
      await safeParse(['flow', 'archive', 'v1.1.7']);

      // 不存在（人类）
      logMock.mockClear();
      errorMock.mockClear();
      await safeParse(['flow', 'archive', 'show', 'v9.9.9']);
      expect(process.exitCode).toBe(1);
      const errText = errorMock.mock.calls.map((c) => c[0] as string).join('\n');
      expect(errText).toContain('归档版本 v9.9.9 不存在；可用版本：v1.1.7');

      // 非法版本（人类）
      logMock.mockClear();
      errorMock.mockClear();
      await safeParse(['flow', 'archive', 'show', 'abc']);
      expect(process.exitCode).toBe(1);
      expect(errorMock.mock.calls.map((c) => c[0] as string).join('\n')).toContain('非法版本号');

      // --json 纯单文档（not-found）
      logMock.mockClear();
      errorMock.mockClear();
      await safeParse(['flow', 'archive', 'show', 'v9.9.9', '--json']);
      expect(process.exitCode).toBe(1);
      expect(errorMock).not.toHaveBeenCalled();
      expect(logMock).toHaveBeenCalledTimes(1);
      expect(JSON.parse(logMock.mock.calls[0][0] as string)).toEqual({
        schemaVersion: 1,
        error: 'not-found',
        version: 'v9.9.9',
        available: ['v1.1.7'],
        errorKind: 'refusal',
      });

      // --json 纯单文档（invalid-version）
      logMock.mockClear();
      errorMock.mockClear();
      await safeParse(['flow', 'archive', 'show', 'abc', '--json']);
      expect(process.exitCode).toBe(1);
      expect(errorMock).not.toHaveBeenCalled();
      expect(JSON.parse(logMock.mock.calls[0][0] as string)).toEqual({
        schemaVersion: 1,
        error: 'invalid-version',
        input: 'abc',
        available: ['v1.1.7'],
        errorKind: 'refusal',
      });
    });

    // ── T5.5g 只读零写盘 ──

    it('T5.5g: list/show 只读零写盘（flow.json / checkpoints / log 三处前后恒等）', async () => {
      seedVersions(['v1.1.7']);
      await safeParse(['flow', 'archive', 'v1.1.7']);
      const before = collectWrites();

      await capture(['flow', 'archive', 'list']);
      await capture(['flow', 'archive', 'list', '--json']);
      await capture(['flow', 'archive', 'show', 'v1.1.7']);
      await capture(['flow', 'archive', 'show', 'v1.1.7', '--json']);
      expect(process.exitCode).toBe(0);

      expect(collectWrites()).toEqual(before);
    });

    // ── T5.6 既有命令零破坏 ──

    it('T5.6: phases/mode --json 归档前后逐字相等；status 标签结构不变；flow --help 仅新增 archive / next', async () => {
      seedVersions(['v1.1.7']);

      const phasesBefore = (await capture(['flow', 'phases', '--json'])).join('\n');
      const modeBefore = (await capture(['flow', 'mode', '--json'])).join('\n');
      const statusBefore = (await capture(['flow', 'status'])).join('\n').split('\n');
      expect(process.exitCode).toBe(0);
      expect(errorMock).not.toHaveBeenCalled();

      await safeParse(['flow', 'archive', 'v1.1.7']);
      expect(process.exitCode).toBe(0);

      const phasesAfter = (await capture(['flow', 'phases', '--json'])).join('\n');
      const modeAfter = (await capture(['flow', 'mode', '--json'])).join('\n');
      const statusAfter = (await capture(['flow', 'status'])).join('\n').split('\n');
      expect(errorMock).not.toHaveBeenCalled();

      // 数据无关命令：逐字不变
      expect(phasesAfter).toBe(phasesBefore);
      expect(modeAfter).toBe(modeBefore);
      // status：计数 / 时间戳随归档合法变化（实测 阶段数 2→1）→ 逐字不变不可达；
      // 断言「标题行 + 10 行头部标签序列」逐字不变（格式零破坏），值按语义更新
      const labelOf = (l: string): string => l.split(':')[0];
      expect(statusAfter[0]).toBe(statusBefore[0]);
      expect(statusAfter.slice(0, 10).map(labelOf)).toEqual(statusBefore.slice(0, 10).map(labelOf));
      expect(statusAfter.join('\n')).toContain('阶段数: 1');

      // flow --help 子命令集合 = 既有集合 + archive（其余条目逐字不变）
      const flowCmd = program.commands.find((c) => c.name() === 'flow')!;
      const names = flowCmd.commands.map((c) => c.name()).filter((n) => n !== 'help');
      expect(names).toEqual([
        'status', 'next', 'overview', 'current', 'metrics', 'phases', 'mode', 'stage', 'advance',
        'attempt', 'ops', 'log', 'review', 'retry', 'repair', 'migrate', 'checkpoint',
        'archive', 'health', 'recover', 'wizard',
      ]);
    });

    // ── op-002 步骤 3.3：applyHelpI18n 冒烟（5 个 help 键已接入，非死键）──

    it('步骤 3.3: applyHelpI18n 使 archive 组 description / 选项 / 参数描述落到新键文案', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const p = new Command();
        p.name('openfeel');
        registerFlowCommand(p);
        applyHelpI18n(p);

        const archiveCmd = p.commands.find((c) => c.name() === 'flow')!.commands.find((c) => c.name() === 'archive')!;
        expect(archiveCmd.description()).toContain('flow.json 版本分片归档');
        expect(archiveCmd.registeredArguments[0].description).toContain('前缀 v 可省略');
        const optDesc = (cmd: Command, flag: string): string =>
          cmd.options.find((o) => o.long === flag)!.description;
        expect(optDesc(archiveCmd, '--dry-run')).toContain('判据门照常校验');
        expect(optDesc(archiveCmd, '--json')).toContain('{ schemaVersion, version, stages, reviews, log, dryRun, eligible, unfinishedStages, blockingReviews }');

        const listCmd = archiveCmd.commands.find((c) => c.name() === 'list')!;
        expect(listCmd.description()).toContain('引擎字典序');
        expect(optDesc(listCmd, '--json')).toContain('{ schemaVersion, versions:');

        const showCmd = archiveCmd.commands.find((c) => c.name() === 'show')!;
        expect(showCmd.description()).toContain('counts + 阶段概览');
        expect(showCmd.registeredArguments[0].description).toContain('前缀 v 可省略');
        expect(optDesc(showCmd, '--json')).toContain('全量归档内容');
      } finally {
        warnSpy.mockRestore();
      }
    });
  });

  // ═══════════════════════════════════════════════
  // 常规路径零触碰（stage-79 op-003）
  // ═══════════════════════════════════════════════

  describe('常规路径零触碰（stage-79 op-003）', () => {
    beforeEach(() => {
      process.exitCode = 0;
    });
    afterEach(() => {
      process.exitCode = 0;
    });

    /** 7 条既有常规命令（T5.7② 口径） */
    const SEVEN: string[][] = [
      ['flow', 'status'],
      ['flow', 'overview'],
      ['flow', 'current'],
      ['flow', 'ops', 'list'],
      ['flow', 'mode'],
      ['flow', 'phases'],
      ['flow', 'log'],
    ];

    const archiveDir = (): string => join(tmpDir, '.openfeel', 'flow-archive');
    const renamedDir = (): string => join(tmpDir, '.openfeel', 'flow-archive-renamed');

    /** 夹具：v1.9.0 全 done（可归档）+ v1.0.0 当前阶段（保留） */
    function seedForRename(): void {
      const mgr = new FlowManager(tmpDir);
      mgr.setData({
        meta: { version: '1.0', project: 'ZeroTouch', updated: '2026-01-01T00:00:00Z' },
        pipeline: { phase: 'active' as MetaPhase, current: { stage: 'v1.0.0-stage-01', op: '' }, retry: 0 },
        stages: {
          'v1.0.0-stage-01': { name: 'c', phase: 'exec_running' as PipelinePhase, status: 'exec_running', deps: [], ops: {} },
          'v1.9.0-stage-01': { name: 'a', phase: 'done' as PipelinePhase, status: 'done', deps: [], ops: {} },
        },
        reviews: [],
        log: [],
      });
      mgr.save();
    }

    /** 依次执行 7 条命令，返回逐条输出（并断言逐条绿） */
    async function runSeven(label: string): Promise<string[]> {
      const outputs: string[] = [];
      for (const args of SEVEN) {
        logMock.mockClear();
        errorMock.mockClear();
        exitMock.mockClear();
        await safeParse(args);
        expect(process.exitCode, `${label} ${args.join(' ')} 退出码`).toBe(0);
        expect(exitMock, `${label} ${args.join(' ')} 不应调用 process.exit`).not.toHaveBeenCalled();
        expect(errorMock, `${label} ${args.join(' ')} 不应输出 error`).not.toHaveBeenCalled();
        outputs.push(logMock.mock.calls.map((c) => c[0] as string).join('\n'));
      }
      return outputs;
    }

    it('T5.7②: 归档目录重命名 → 7 条既有命令全绿；恢复后一致；重命名确已发生（防假绿）', async () => {
      seedForRename();
      await safeParse(['flow', 'archive', 'v1.9.0']);
      expect(process.exitCode).toBe(0);
      expect(existsSync(join(archiveDir(), 'v1.9.0.json'))).toBe(true);

      // 归档后（目录未重命名）
      const presentOut = await runSeven('present');

      // 重命名归档目录（防假绿前置断言：确已发生）
      renameSync(archiveDir(), renamedDir());
      expect(existsSync(archiveDir())).toBe(false);
      expect(existsSync(renamedDir())).toBe(true);

      const renamedOut = await runSeven('renamed');
      // 归档目录不可见不影响常规路径（逐字一致）
      expect(renamedOut).toEqual(presentOut);

      // 恢复目录名 → 结果一致
      renameSync(renamedDir(), archiveDir());
      expect(existsSync(archiveDir())).toBe(true);
      expect(await runSeven('restored')).toEqual(presentOut);
    });

    it('T5.7③: 归档前后既有输出 —— 数据无关命令逐字不变（mode/current/phases）；余者仅值随语义更新', async () => {
      seedForRename();
      const before = await runSeven('before');

      await safeParse(['flow', 'archive', 'v1.9.0']);
      expect(process.exitCode).toBe(0);
      const after = await runSeven('after');

      // 数据无关命令（mode / current / phases）：逐字不变
      const idx = (args: string[]): number => SEVEN.findIndex((a) => a.join(' ') === args.join(' '));
      for (const args of [['flow', 'mode'], ['flow', 'current'], ['flow', 'phases']]) {
        expect(after[idx(args)], args.join(' ')).toBe(before[idx(args)]);
      }
      // 数据相关命令（status / overview / ops list / log）：计数与条目随归档合法变化
      // （实测：阶段数 2→1、v1.9.0 阶段与日志条目迁出）→ 逐字不变不可达；
      // 断言格式零破坏（10 行头部标签序列逐字不变）
      const labelOf = (l: string): string => l.split(':')[0];
      const statusBefore = before[idx(['flow', 'status'])].split('\n');
      const statusAfter = after[idx(['flow', 'status'])].split('\n');
      expect(statusAfter[0]).toBe(statusBefore[0]);
      expect(statusAfter.slice(0, 10).map(labelOf)).toEqual(statusBefore.slice(0, 10).map(labelOf));
      expect(statusAfter.join('\n')).toContain('阶段数: 1');
    });
  });

  // ═══════════════════════════════════════════════
  // 常规路径零触碰与活跃集（stage-80 op-003）
  // ═══════════════════════════════════════════════

  describe('常规路径零触碰与活跃集（stage-80）', () => {
    // 本组消费点清单跨 5 个命令组（flow / stage / config / plan / archive 顶层）
    let prog: Command;

    beforeEach(() => {
      process.exitCode = 0;
      prog = new Command();
      prog.exitOverride();
      registerFlowCommand(prog);
      registerStageCommand(prog);
      registerConfigCommand(prog);
      registerPlanCommand(prog);
      registerArchiveCommand(prog);
    });
    afterEach(() => {
      process.exitCode = 0;
    });

    const flowJsonPath = (): string => join(tmpDir, '.openfeel', 'flow.json');
    const archiveDirPath = (): string => join(tmpDir, '.openfeel', 'flow-archive');
    const renamedDirPath = (): string => join(tmpDir, '.openfeel', 'flow-archive-renamed');
    const stageDirPath = (dir: string): string => join(tmpDir, '.openfeel', 'plan', 'v1', dir);

    const OP_ID = 'v1.9.1-stage-11.op-001';

    /** 安全解析（捕获 CommanderError 不中断测试）——使用本组多命令组 program */
    async function parse(args: string[]): Promise<void> {
      try {
        await prog.parseAsync(args, { from: 'user' });
      } catch (err) {
        if (!(err instanceof CommanderError)) {
          throw err;
        }
      }
    }

    /** 构造阶段数据（phase / status / ops） */
    function stageObj(phase: PipelinePhase, status: string, ops: Record<string, unknown> = {}): StageData {
      return { name: phase, phase, status, deps: [], ops } as StageData;
    }

    /**
     * 创建阶段目录 + status.md（文件系统视图，供 plan stage list / stage status 断言）。
     * status.md 含「工作流模式」字段（值 = full），使 #25 `config set --sync-stages` 走 noop 路径
     * （skipped-* 会写 stderr；本组判据要求 console.error 零调用）。
     */
    function makeDirs(dirs: string[]): void {
      for (const d of dirs) {
        mkdirSync(stageDirPath(d), { recursive: true });
        writeFileSync(
          join(stageDirPath(d), 'status.md'),
          `# ${d} 状态\n\n- **执行模式**：manual\n- **自动推进**：enabled\n- **工作流模式**：full\n- **状态**：planned\n`,
          'utf-8',
        );
      }
    }

    /**
     * 主夹具：v1.9.0（全 done，两阶段，可归档）+ v1.9.1 活跃（含 op-001）+ v1.9.2 依赖目标。
     * @param archived 已归档版本列表（含 'v1.9.0' 时不再登记 v1.9.0 阶段）
     */
    function seedMain(archived: string[] = []): void {
      makeDirs(['stage-01', 'stage-02', 'stage-11', 'stage-21', 'stage-41']);
      const stages: FlowData['stages'] = {
        'v1.9.1-stage-11': stageObj('plan_passed' as PipelinePhase, 'planned', { 'op-001': makeOp('op-001') }),
        'v1.9.2-stage-21': stageObj('plan_pending' as PipelinePhase, 'planned'),
      };
      if (!archived.includes('v1.9.0')) {
        stages['v1.9.0-stage-01'] = stageObj('done' as PipelinePhase, 'done');
        stages['v1.9.0-stage-02'] = stageObj('done' as PipelinePhase, 'done');
      }
      const data: FlowData = {
        meta: { version: '1.0', project: 'ZeroTouch80', updated: '2026-01-01T00:00:00Z', archived_versions: [...archived] },
        pipeline: { phase: 'active' as MetaPhase, current: { stage: 'v1.9.1-stage-11', op: '' }, retry: 0 },
        stages,
        reviews: [],
        log: [],
      };
      const mgr = new FlowManager(tmpDir);
      mgr.setData(data);
      mgr.save();
    }

    /** 清理本组命令可能创建的目录 + 重播种 + 预置 checkpoint（保证重复执行幂等） */
    function resetForGroup(): void {
      for (const d of ['stage-31', 'stage-41', 'stage-51']) {
        rmSync(stageDirPath(d), { recursive: true, force: true });
      }
      seedMain(['v1.9.0']);
      // #15 restore --dry-run 所需快照（幂等；文件名取自 listCheckpoints）
      new FlowManager(tmpDir).saveCheckpoint('v1.9.1-stage-11', 'plan_passed' as PipelinePhase);
    }

    /**
     * 组内 25 条消费点命令（大计划 §三 裁定 P 附注① 全量清单）。
     * mode='green'：退出码 0 + 不调 process.exit + console.error 零调用；
     * mode='wizard'：非 TTY 守卫（T39）声明豁免——console.error(nonTtyHint) + exitCode=1 为既有设计。
     */
    function groupCommands(): Array<{ args: string[]; mode: 'green' | 'wizard' }> {
      const ck = new FlowManager(tmpDir).listCheckpoints('v1.9.1-stage-11')[0];
      return [
        { args: ['flow', 'status'], mode: 'green' },                                              // 1
        { args: ['flow', 'overview'], mode: 'green' },                                            // 2
        { args: ['flow', 'current'], mode: 'green' },                                             // 3
        { args: ['flow', 'ops', 'list'], mode: 'green' },                                         // 4
        { args: ['flow', 'log'], mode: 'green' },                                                 // 5
        { args: ['flow', 'wizard'], mode: 'wizard' },                                             // 6
        { args: ['flow', 'health'], mode: 'green' },                                              // 7
        { args: ['flow', 'mode'], mode: 'green' },                                                // 8
        { args: ['flow', 'phases'], mode: 'green' },                                              // 9
        { args: ['flow', 'advance', '--stage', 'v1.9.1-stage-11', '--to', 'scheme_pending'], mode: 'green' }, // 10
        { args: ['flow', 'attempt', '--op', OP_ID, '--result', 'pass'], mode: 'green' },          // 11
        { args: ['flow', 'retry', '--op', OP_ID], mode: 'green' },                                // 12
        { args: ['flow', 'repair'], mode: 'green' },                                              // 13
        { args: ['flow', 'recover'], mode: 'green' },                                             // 14
        { args: ['flow', 'checkpoint', 'restore', ck, '--dry-run'], mode: 'green' },              // 15
        { args: ['flow', 'stage', 'add', 'v1.9.5-stage-31'], mode: 'green' },                     // 16
        // addStage 会把该阶段置为 current → 移除需 --force（移后 current 自动回退到非 done 阶段）
        { args: ['flow', 'stage', 'remove', 'v1.9.5-stage-31', '--force'], mode: 'green' },       // 17
        { args: ['flow', 'stage', 'set', 'v1.9.2-stage-21', '--deps', 'v1.9.1-stage-11'], mode: 'green' }, // 18
        { args: ['flow', 'stage', 'reset', 'v1.9.1-stage-11', '--to', 'plan_pending', '--dry-run'], mode: 'green' }, // 19
        { args: ['stage', 'create', 'v1.9.6-stage-41'], mode: 'green' },                          // 20
        { args: ['plan', 'stage', 'add', 'v1.9.7-stage-51', '--deps', 'v1.9.1-stage-11'], mode: 'green' }, // 21
        { args: ['plan', 'scheme', 'list'], mode: 'green' },                                      // 22
        { args: ['plan', 'scheme', 'register', 'v1.9.1-stage-11'], mode: 'green' },               // 23
        { args: ['archive', 'v1.9.1-stage-11'], mode: 'green' },                                  // 24
        { args: ['config', 'set', 'workflow_mode', 'full', '--sync-stages'], mode: 'green' },     // 25
      ];
    }

    /** 逐条执行全量清单，返回逐条判据签名（同判据比对用） */
    async function runAll(label: string): Promise<string[]> {
      const sig: string[] = [];
      for (const { args, mode } of groupCommands()) {
        const cmd = args.join(' ');
        logMock.mockClear();
        errorMock.mockClear();
        exitMock.mockClear();
        process.exitCode = 0;
        await parse(args);
        if (mode === 'wizard') {
          // 声明豁免（T39）：非 TTY 守卫路径逐字不变（与归档目录无关）
          expect(process.exitCode, `${label} ${cmd} 退出码`).toBe(1);
          expect(errorMock.mock.calls.map((c) => c[0] as string).join('\n'), `${label} ${cmd} 非 TTY 守卫文案`).toContain('非交互式');
          process.exitCode = 0;
          sig.push(`${cmd}#wizard`);
          continue;
        }
        expect(process.exitCode ?? 0, `${label} ${cmd} 退出码`).toBe(0);
        expect(exitMock, `${label} ${cmd} 不应调用 process.exit`).not.toHaveBeenCalled();
        expect(errorMock.mock.calls.length, `${label} ${cmd} 不应输出 error`).toBe(0);
        sig.push(`${cmd}#ok`);
      }
      return sig;
    }

    it('T5: 归档目录重命名 → 全量 25 条消费点命令全绿；恢复目录名后一致；防假绿前置断言成立', async () => {
      // 1.1 fixture（多版本）→ 归档 v1.9.0 → 产生归档文件
      seedMain();
      await parse(['flow', 'archive', 'v1.9.0']);
      expect(process.exitCode ?? 0).toBe(0);
      expect(existsSync(join(archiveDirPath(), 'v1.9.0.json'))).toBe(true);

      // 防假绿前置断言：重命名确已发生
      renameSync(archiveDirPath(), renamedDirPath());
      expect(existsSync(archiveDirPath())).toBe(false);
      expect(existsSync(renamedDirPath())).toBe(true);

      // 1.2 重命名状态下按全量清单逐条执行
      resetForGroup();
      const renamedSig = await runAll('renamed');

      // 1.3 恢复目录名 → 重复同一组命令 → 结果一致（同判据）
      renameSync(renamedDirPath(), archiveDirPath());
      expect(existsSync(archiveDirPath())).toBe(true);
      resetForGroup();
      const restoredSig = await runAll('restored');

      expect(restoredSig).toEqual(renamedSig);
    });

    it('T5: 归档后活跃集收缩断言（status counts / overview / plan stage list / stage status 全名可用）', async () => {
      seedMain();
      await parse(['flow', 'archive', 'v1.9.0']);
      expect(process.exitCode ?? 0).toBe(0);

      // flow status --json：counts.total = 活跃集数（不含 v1.9.0-stage-*）
      logMock.mockClear();
      await parse(['flow', 'status', '--json']);
      const statusObj = JSON.parse(logMock.mock.calls[0][0] as string) as { counts: { total: number } };
      expect(statusObj.counts.total).toBe(2);

      // flow overview：不含被归档版本阶段
      logMock.mockClear();
      await parse(['flow', 'overview']);
      const overview = logMock.mock.calls.map((c) => c[0] as string).join('\n');
      expect(overview).not.toContain('v1.9.0-stage-');

      // plan stage list：仍列出归档目录（文件系统视图不随归档变化）
      logMock.mockClear();
      await parse(['plan', 'stage', 'list']);
      const listed = logMock.mock.calls.map((c) => c[0] as string).join('\n');
      expect(listed).toContain('stage-01');
      expect(listed).toContain('stage-02');

      // stage status <已归档全名>：可用（文件系统视图不变）
      logMock.mockClear();
      exitMock.mockClear();
      await parse(['stage', 'status', 'v1.9.0-stage-01']);
      expect(exitMock).not.toHaveBeenCalled();
    });

    it('REV-79-022 收口: 已归档版本重新登记 → 再归档 → 幂等收敛（rearchivedTmpl 覆盖分支）', async () => {
      // 活跃集仍含 v1.9.1（全 done）且 archived_versions 已含 v1.9.1（模拟「重新登记 → 再归档」）
      makeDirs(['stage-11']);
      const mgr = new FlowManager(tmpDir);
      mgr.setData({
        meta: { version: '1.0', project: 'Rear', updated: '2026-01-01T00:00:00Z', archived_versions: ['v1.9.1'] },
        pipeline: { phase: 'active' as MetaPhase, current: { stage: '', op: '' }, retry: 0 },
        stages: {
          'v1.9.1-stage-11': stageObj('done' as PipelinePhase, 'done'),
          'v1.9.2-stage-21': stageObj('plan_pending' as PipelinePhase, 'planned'),
        },
        reviews: [],
        log: [],
      });
      mgr.save();

      logMock.mockClear();
      await parse(['flow', 'archive', 'v1.9.1']);

      expect(process.exitCode ?? 0).toBe(0);
      expect(exitMock).not.toHaveBeenCalled();
      expect(logMock.mock.calls.map((c) => c[0] as string).join('\n')).toContain('已重新归档');
      // 归档文件覆盖写出
      expect(existsSync(join(archiveDirPath(), 'v1.9.1.json'))).toBe(true);
      // 索引无重复（恰好一次）+ 阶段已移出活跃集
      const after = JSON.parse(readFileSync(flowJsonPath(), 'utf-8')) as FlowData;
      expect(after.meta.archived_versions).toEqual(['v1.9.1']);
      expect(after.stages['v1.9.1-stage-11']).toBeUndefined();
    });
  });

  // ═══════════════════════════════════════
  // stage-83 op-003：health 需求对账（T4.6）+ dry-run 双路径（T4.4）+ wizard 回归（T4.3-②）
  // ═══════════════════════════════════════

  /** flow.json 路径（本段 fixture） */
  const s83FlowPath = (): string => join(tmpDir, '.openfeel', 'flow.json');
  /** 原始文本读回 */
  const readFlowRaw = (): string => readFileSync(s83FlowPath(), 'utf-8');
  /** 写盘 fixture（显式 revision 0 基线） */
  const writeS83Flow = (data: Record<string, unknown>): void => {
    mkdirSync(join(tmpDir, '.openfeel'), { recursive: true });
    writeFileSync(s83FlowPath(), JSON.stringify(data, null, 2) + '\n', 'utf-8');
  };
  /** 需求条目 */
  const s83Req = (id: string, status: string): Record<string, unknown> => ({
    id, title: `需求 ${id}`, status, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
  });
  /** 基础 fixture（stage 键用全名——命令层 normalizeStageId 会展开短名） */
  const S83_STAGE = 'v1.0.0-stage-01';
  const s83Base = (stages: Record<string, unknown>, extraTop: Record<string, unknown> = {}): Record<string, unknown> => ({
    meta: { version: '1.0', project: 'T', updated: '2026-01-01T00:00:00Z', revision: 0 },
    pipeline: { phase: 'active', current: { stage: S83_STAGE, op: '' }, retry: 0 },
    stages,
    reviews: [], log: [],
    ...extraTop,
  });
  /** 关联某需求的阶段 */
  const s83Stage = (phase: string, requirementId?: string): Record<string, unknown> => {
    const s: Record<string, unknown> = { name: '阶段', phase, status: phase, deps: [], ops: {} };
    if (requirementId !== undefined) { s.requirement_id = requirementId; }
    return s;
  };

  it('op-003 T4.4-① flow advance --dry-run 字节零写盘（含需求字段）+ 正控（真实推进有变化）', async () => {
    writeS83Flow(s83Base({ [S83_STAGE]: s83Stage('archiving', 'REQ-001') }, { requirements: [s83Req('REQ-001', 'in_progress')] }));
    const before = readFlowRaw();
    logMock.mockClear();
    const prevExit = process.exitCode;
    process.exitCode = undefined;
    try {
      await safeParse(['flow', 'advance', '--stage', 'stage-01', '--to', 'done', '--dry-run']);
      const out = logMock.mock.calls.map((c) => c[0] as string).join('\n');
      expect(out).toContain('未实际修改 flow.json');
      expect(readFlowRaw()).toBe(before);                 // 字节不变（含需求字段）
      expect(process.exitCode).not.toBe(1);
    } finally {
      process.exitCode = prevExit;
    }

    // 正控：真实推进 → flow.json 变化且需求 done（证明「零写盘」断言非恒真）
    logMock.mockClear();
    await safeParse(['flow', 'advance', '--stage', 'stage-01', '--to', 'done']);
    const after = JSON.parse(readFlowRaw());
    expect(after.stages[S83_STAGE].phase).toBe('done');
    expect(after.requirements[0].status).toBe('done');
    expect(readFlowRaw()).not.toBe(before);
  });

  it('op-003 T4.4-② flow stage reset --dry-run 字节零写盘 + 正控（回退生效 + requirement_auto_reopen 落盘）', async () => {
    writeS83Flow(s83Base({ [S83_STAGE]: s83Stage('done', 'REQ-001') }, { requirements: [s83Req('REQ-001', 'done')] }));
    const before = readFlowRaw();
    logMock.mockClear();
    await safeParse(['flow', 'stage', 'reset', 'stage-01', '--to', 'archiving', '--dry-run']);
    const out = logMock.mock.calls.map((c) => c[0] as string).join('\n');
    expect(out).toContain('复位预览');
    expect(out).toContain(`${S83_STAGE}: done → archiving`);
    expect(readFlowRaw()).toBe(before);

    // 正控：真实 reset → 需求回退 in_progress + 审计落盘
    logMock.mockClear();
    await safeParse(['flow', 'stage', 'reset', 'stage-01', '--to', 'archiving']);
    const after = JSON.parse(readFlowRaw());
    expect(after.stages[S83_STAGE].phase).toBe('archiving');
    expect(after.requirements[0].status).toBe('in_progress');
    expect(after.log.some((l: Record<string, unknown>) => l.action === 'requirement_auto_reopen')).toBe(true);
  });

  it('op-003 T4.6-① 悬空 warn + ok===true + 退出码不变', async () => {
    writeS83Flow(s83Base({ [S83_STAGE]: s83Stage('done', 'REQ-999') }, { requirements: [] }));
    logMock.mockClear();
    exitMock.mockClear();
    await safeParse(['flow', 'health', '--json']);
    const obj = parseJsonLog();
    const items = obj.items as Array<{ name: string; status: string; detail: string }>;
    expect(items.some((i) => i.name === '需求对账' && i.status === 'warn')).toBe(true);
    expect(items.find((i) => i.name === '需求对账')!.detail).toContain(`${S83_STAGE} → REQ-999`);
    expect(obj.ok).toBe(true);
    expect(exitMock).not.toHaveBeenCalledWith(1);
  });

  it('op-003 T4.6-② 漂移 warn + 退出码不变；T4.6-③ 设计豁免不报', async () => {
    writeS83Flow(s83Base({ [S83_STAGE]: s83Stage('done', 'REQ-001') }, { requirements: [s83Req('REQ-001', 'scheduled')] }));
    logMock.mockClear(); exitMock.mockClear();
    await safeParse(['flow', 'health', '--json']);
    let obj = parseJsonLog();
    let items = obj.items as Array<{ name: string; status: string }>;
    expect(items.some((i) => i.name === '需求漂移' && i.status === 'warn')).toBe(true);
    expect(obj.ok).toBe(true);
    expect(exitMock).not.toHaveBeenCalledWith(1);

    // 设计豁免：draft × 全 done → 无漂移项
    logMock.mockClear();
    writeS83Flow(s83Base({ [S83_STAGE]: s83Stage('done', 'REQ-001') }, { requirements: [s83Req('REQ-001', 'draft')] }));
    await safeParse(['flow', 'health', '--json']);
    obj = parseJsonLog();
    items = obj.items as Array<{ name: string; status: string }>;
    expect(items.some((i) => i.name === '需求漂移')).toBe(false);
    expect(items.find((i) => i.name === '需求对账')!.status).toBe('pass');
  });

  it('op-003 T4.6-④ --quick 跳过；T4.6-⑤ 人类输出含「需求对账」；T4.6-⑥ --fix 不参与', async () => {
    // ④ --quick 跳过
    writeS83Flow(s83Base({ [S83_STAGE]: s83Stage('done', 'REQ-999') }, { requirements: [] }));
    logMock.mockClear();
    await safeParse(['flow', 'health', '--quick', '--json']);
    let obj = parseJsonLog();
    expect((obj.items as Array<{ name: string }>).some((i) => i.name === '需求对账')).toBe(false);

    // ⑤ 干净 fixture：JSON pass + 人类输出现「需求对账」行
    writeS83Flow(s83Base({ [S83_STAGE]: s83Stage('done', 'REQ-001') }, { requirements: [s83Req('REQ-001', 'done')] }));
    logMock.mockClear();
    await safeParse(['flow', 'health', '--json']);
    obj = parseJsonLog();
    expect((obj.items as Array<{ name: string; status: string }>).find((i) => i.name === '需求对账')!.status).toBe('pass');
    logMock.mockClear();
    await safeParse(['flow', 'health']);
    expect(logMock.mock.calls.map((c) => c[0] as string).join('\n')).toContain('需求对账');

    // ⑥ --fix 不参与（payload 无需求修复项；flow.json 字节不变）
    writeS83Flow(s83Base({ [S83_STAGE]: s83Stage('done', 'REQ-001') }, { requirements: [s83Req('REQ-001', 'scheduled')] }));
    const before = readFlowRaw();
    logMock.mockClear();
    await safeParse(['flow', 'health', '--fix', '--dry-run', '--json']);
    obj = parseJsonLog();
    expect(obj).toHaveProperty('reconciled');
    expect(JSON.stringify(obj.reconciled)).not.toContain('REQ-');
    expect(readFlowRaw()).toBe(before);
  });

  it('op-003 T4.3-② wizard 回归：零注入 + requirement_ 零审计 + 期望字段 + 正控', async () => {
    // 无关联 fixture（stage-01 archiving；无 requirements 键）
    writeS83Flow(s83Base({ [S83_STAGE]: s83Stage('archiving') }));
    mockedInquirer.select.mockResolvedValueOnce('done').mockResolvedValueOnce('yes');
    setTty(true);
    try {
      await safeParse(['flow', 'wizard']);
    } finally {
      setTty(false);
    }
    const parsed = JSON.parse(readFlowRaw());
    expect('requirements' in parsed).toBe(false);                                    // 零注入
    expect((parsed.log as Array<{ action: string }>).filter((l) => l.action.startsWith('requirement_'))).toHaveLength(0);
    expect(parsed.stages[S83_STAGE].phase).toBe('done');
    expect(parsed.stages[S83_STAGE].status).toBe('done');
    expect(parsed.pipeline.phase).toBe('done');
    expect(logMock.mock.calls.map((c) => c[0] as string).join('\n')).toContain('已推进');

    // 正控：关联 fixture → requirement_auto_done 出现（回写经 wizard 路径已接通）
    logMock.mockClear();
    writeS83Flow(s83Base({ [S83_STAGE]: s83Stage('archiving', 'REQ-001') }, { requirements: [s83Req('REQ-001', 'in_progress')] }));
    mockedInquirer.select.mockResolvedValueOnce('done').mockResolvedValueOnce('yes');
    setTty(true);
    try {
      await safeParse(['flow', 'wizard']);
    } finally {
      setTty(false);
    }
    const parsed2 = JSON.parse(readFlowRaw());
    expect(parsed2.requirements[0].status).toBe('done');
    expect((parsed2.log as Array<{ action: string }>).some((l) => l.action === 'requirement_auto_done')).toBe(true);
  });

  it('op-003 i18n 键真实接入（t() 渲染 ≠ 原始键；en 渲染非空）', () => {
    expect(t('flow.health.reqDanglingTmpl', 'zh-CN', { items: 'x' })).not.toBe('flow.health.reqDanglingTmpl');
    expect(t('flow.health.reqDanglingTmpl', 'zh-CN', { items: 'x' })).toContain('x');
    expect(t('flow.health.reqDanglingTmpl', 'en', { items: 'x' })).not.toBe('');
    expect(t('flow.health.reqLinksPassTmpl', 'en', { n: '2' })).toContain('2');
    expect(t('flow.health.reqDriftTmpl', 'en', { items: 'y' })).toContain('y');
  });

  it('op-003 真实工作区零触碰（REAL_CWD 反守卫：真实 flow.json 字节不变（基线快照，允许既有 requirements））', () => {
    expect(existsSync(REAL_FLOW_PATH)).toBe(true);
    expect(readFileSync(REAL_FLOW_PATH, 'utf-8')).toBe(REAL_FLOW_RAW);
  });

  // ── stage-86 op-001：T1 recordRun 接线（命令层） ──

  describe('stage-86 op-001 recordRun 接线', () => {
    const S86_STAGE = 'v1.9.0-stage-01';
    const flowPath = () => join(tmpDir, '.openfeel', 'flow.json');
    const metricsPath = () => join(tmpDir, '.openfeel', 'metrics.json');

    /** 读隔离 tmpDir 下的 metrics.json（不存在返回 null） */
    function readMetrics(): { agents: Record<string, { totalRuns: number; totalDurationMs: number }> } | null {
      if (!existsSync(metricsPath())) {
        return null;
      }
      return JSON.parse(readFileSync(metricsPath(), 'utf-8')) as never;
    }

    /**
     * M1/M2/M5 共用的前置构造：stage phase = scheme_pending +
     * 手工塞一条「进入 scheme_pending」的转换条目（time = now-60s）→ duration 下界可断言。
     */
    function seedSchemePending(): void {
      const mgr = new FlowManager(tmpDir);
      mgr.addStage(S86_STAGE);
      const d = mgr.getData()!;
      d.stages[S86_STAGE].phase = 'scheme_pending' as PipelinePhase;
      d.log.push({
        time: new Date(Date.now() - 60_000).toISOString(),
        agent: 'cli',
        action: 'advance_stage_phase',
        detail: { stageName: S86_STAGE, from: 'plan_review', to: 'scheme_pending' },
      });
      mgr.save();
    }

    it('M1: advance 实跑 → metrics.json 生成且非空（agent 归属 + phase 窗口）', async () => {
      seedSchemePending();
      logMock.mockClear();

      await safeParse(['flow', 'advance', '--stage', S86_STAGE, '--to', 'exec_running']);

      const data = readMetrics();
      expect(data).not.toBeNull();
      // 正控（防多步污染）：中间 phase scheme_passed 不入表 → 键集恰 1 键
      expect(Object.keys(data!.agents)).toEqual(['openfeel-schemer']);
      expect(data!.agents['openfeel-schemer'].totalRuns).toBe(1);
      // 窗口 ≈ 60s（下界断言，不设上限——避免机器慢时伪失败）
      expect(data!.agents['openfeel-schemer'].totalDurationMs).toBeGreaterThanOrEqual(59_000);
    });

    it('M2: flow metrics --json 展示真实 run 数据（agent 归属 + 非空）', async () => {
      seedSchemePending();
      await safeParse(['flow', 'advance', '--stage', S86_STAGE, '--to', 'exec_running']);

      logMock.mockClear();
      await safeParse(['flow', 'metrics', '--json']);

      const obj = parseJsonLog();
      const agents = obj.agents as Array<{ agentName: string; totalRuns: number }>;
      const schemer = agents.find((a) => a.agentName === 'openfeel-schemer');
      expect(schemer).toBeDefined();
      expect(schemer!.totalRuns).toBeGreaterThanOrEqual(1);
    });

    it('M3: 无归属 phase（plan_passed 不入表）→ metrics.json 不生成', async () => {
      const mgr = new FlowManager(tmpDir);
      mgr.addStage(S86_STAGE);
      mgr.getData()!.stages[S86_STAGE].phase = 'plan_passed' as PipelinePhase;
      mgr.save();

      await safeParse(['flow', 'advance', '--stage', S86_STAGE, '--to', 'scheme_pending']);

      expect(existsSync(metricsPath())).toBe(false);
    });

    it('M4: 无基线不记（plan_pending 且无 register_stage 条目 → 跳过）', async () => {
      const mgr = new FlowManager(tmpDir);
      mgr.addStage(S86_STAGE); // 默认 phase = plan_pending；add_stage 条目非 register_stage → 无基线
      mgr.save();

      await safeParse(['flow', 'advance', '--stage', S86_STAGE, '--to', 'scheme_pending']);

      expect(existsSync(metricsPath())).toBe(false);
    });

    it('M5: --dry-run 零写盘（flow.json 字节不变 + metrics.json 不生成）', async () => {
      seedSchemePending();
      const before = readFileSync(flowPath(), 'utf-8');
      logMock.mockClear();

      await safeParse(['flow', 'advance', '--stage', S86_STAGE, '--to', 'exec_running', '--dry-run']);

      expect(readFileSync(flowPath(), 'utf-8')).toBe(before);
      expect(existsSync(metricsPath())).toBe(false);
    });

    it('M6: 反守卫 —— 真实工作区 .openfeel/metrics.json 未被触碰', () => {
      const realRaw = existsSync(REAL_METRICS_PATH) ? readFileSync(REAL_METRICS_PATH, 'utf-8') : null;
      expect(realRaw).toBe(REAL_METRICS_RAW);
    });
  });

  // ── stage-90 op-001：general 模式（空表）/ 载体门 / wizard 源扫描 ──

  it('T90.5：flow phases --mode general --json → workflowMode=general + transitions 空表 + 顶层 9 键', async () => {
    await safeParse(['flow', 'phases', '--mode', 'general', '--json']);

    const obj = JSON.parse(logMock.mock.calls[0][0] as string) as {
      workflowMode: string; transitions: Record<string, string[]>; transitionsDiff: { missing: string[]; extra: string[]; changed: string[] };
    };
    // 6 → 7：stage-92 op-001 末位追加 reviewTier；7 → 9：stage-96 op-002 末位追加 displayReviewTier / effectiveReviewTier
    expect(Object.keys(JSON.parse(logMock.mock.calls[0][0] as string) as Record<string, unknown>)).toHaveLength(9);
    expect(obj.workflowMode).toBe('general');
    expect(obj.transitions).toEqual({});
    expect(obj.transitionsDiff).toEqual({ missing: [], extra: [], changed: [] });
  });

  it('T90.6：flow mode --json 的 modes.general 存在（空表）', async () => {
    await safeParse(['flow', 'mode', '--json']);
    const obj = JSON.parse(logMock.mock.calls[0][0] as string) as { modes: Record<string, unknown> };
    expect(obj.modes.general).toEqual({});
    expect(Object.keys(obj.modes)).toEqual(['full', 'fast', 'general']);
  });

  it('T90.7：advance 防御路径（status.md general）→ 显式错误文案 + exit 1 + 零写盘', async () => {
    const mgr = new FlowManager(tmpDir);
    mgr.addStage('v1.0.0-stage-05');
    mgr.save();
    writeStageStatus('stage-05', 'general');
    const flowPath = join(tmpDir, '.openfeel', 'flow.json');
    const before = readFileSync(flowPath, 'utf-8');
    logMock.mockClear();
    errorMock.mockClear();

    await safeParse(['flow', 'advance', '--stage', 'v1.0.0-stage-05', '--to', 'exec_running']);

    const err = errorMock.mock.calls.map((c) => c[0] as string).join('\n');
    expect(err).toContain(t('flow.advance.generalNoPipeline', 'zh-CN', { stage: 'v1.0.0-stage-05' }));
    expect(err).not.toContain(t('flow.advance.noPathTmpl', 'zh-CN', { from: '', to: '', targets: '' }).split('{')[0]);
    expect(exitMock).toHaveBeenCalledWith(1);
    expect(readFileSync(flowPath, 'utf-8')).toBe(before); // 零写盘
  });

  it('T90.8：REV-90-010 边界登记——general + --force 走既有逃生舱（不触发载体门）', async () => {
    const mgr = new FlowManager(tmpDir);
    mgr.addStage('v1.0.0-stage-06');
    mgr.save();
    writeStageStatus('stage-06', 'general');
    const flowPath = join(tmpDir, '.openfeel', 'flow.json');
    const before = readFileSync(flowPath, 'utf-8');
    logMock.mockClear();
    errorMock.mockClear();

    await safeParse(['flow', 'advance', '--stage', 'v1.0.0-stage-06', '--to', 'exec_running', '--force', '--dry-run']);

    const err = errorMock.mock.calls.map((c) => c[0] as string).join('\n');
    expect(err).not.toContain('general');
    expect(exitMock).not.toHaveBeenCalledWith(1);
    expect(readFileSync(flowPath, 'utf-8')).toBe(before);
  });

  it('T90.9：wizard 源扫描断言（D-90-12 判定式：choices 块零 general ∧ 含 full/fast ∧ i18n 无 modeGeneral）', () => {
    const src = readFileSync(join(REAL_CWD, 'src', 'commands', 'flow.ts'), 'utf-8');
    const start = src.indexOf('flow.wizard.modePrompt');
    const end = src.indexOf('})) as WorkflowMode;');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = src.slice(start, end);
    // choices 构造块：仅阶段合法子集（full / fast），零 general 字面量
    expect(block.includes('general')).toBe(false);
    expect(block).toContain("'full'");
    expect(block).toContain("'fast'");

    for (const f of ['zh-CN.ts', 'en.ts']) {
      const table = readFileSync(join(REAL_CWD, 'src', 'core', 'i18n-data', f), 'utf-8');
      expect(table).toContain("flow.wizard.modeFull");
      expect(table).toContain("flow.wizard.modeFast");
      expect(table.includes('flow.wizard.modeGeneral')).toBe(false);
    }
  });

  it('T90.10：flow.wizard.modeFull / modeFast 文案逐字保留（未新增 modeGeneral）', () => {
    const zh = readFileSync(join(REAL_CWD, 'src', 'core', 'i18n-data', 'zh-CN.ts'), 'utf-8');
    const en = readFileSync(join(REAL_CWD, 'src', 'core', 'i18n-data', 'en.ts'), 'utf-8');
    expect(zh).toContain("zh: 'full（完整链路：含计划审查/方案/测试）'");
    expect(zh).toContain("zh: 'fast（快速迭代：跳过方案/测试；保留计划审查与代码审查单轮）'");
    expect(en).toContain("en: 'full (complete pipeline: plan review / scheme / test included)'");
    expect(en).toContain("en: 'fast (quick iteration: scheme/test skipped; single-round plan review and code review kept)'");
  });

  // ═══════════════════════════════════════════════════════════════
  // stage-92 op-001：审查档位（flow advance --review-tier / flow phases 档位分节）
  // ═══════════════════════════════════════════════════════════════

  it('T92.1：--review-tier 非法值 → exit 1 + 「取值非法」+ 零写盘（先于任何取值/路径解析）', async () => {
    setupResetStage('plan_pending' as PipelinePhase, 'planned');
    const flowPath = join(tmpDir, '.openfeel', 'flow.json');
    const before = readFileSync(flowPath, 'utf-8');
    errorMock.mockClear();
    exitMock.mockClear();

    await safeParse(['flow', 'advance', '--stage', 'v1.0.0-stage-01', '--to', 'plan_review', '--review-tier', 'bogus']);

    expect(exitMock).toHaveBeenCalledWith(1);
    const err = errorMock.mock.calls.map((c) => c[0] as string).join('\n');
    expect(err).toContain('取值非法');
    expect(err).toContain('full, lean, skip');
    // 零写盘：flow.json 字节级不变（校验先于 autoRepair / 任何取值与路径解析）
    expect(readFileSync(flowPath, 'utf-8')).toBe(before);
  });

  it('T92.2：--review-tier skip → plan_pending 单步直通 plan_passed + 审计 review_tier + 降档警告', async () => {
    setupResetStage('plan_pending' as PipelinePhase, 'planned');
    const warnMock = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      logMock.mockClear();
      exitMock.mockClear();

      await safeParse(['flow', 'advance', '--stage', 'v1.0.0-stage-01', '--to', 'plan_passed', '--review-tier', 'skip']);

      expect(exitMock).not.toHaveBeenCalled();
      // 单步直通：多步才有的逐步输出（含 plan_review 中间跳）缺席
      const out = logMock.mock.calls.map((c) => c[0] as string).join('\n');
      expect(out).toContain('已推进');
      expect(out).not.toContain('plan_review');

      const warns = warnMock.mock.calls.map((c) => c[0] as string).join('\n');
      expect(warns).toContain('审查档位');
      expect(warns).toContain('plan_review, scheme_review');
      expect(warns).toContain('代码审查关恒保留');

      const after = JSON.parse(readFileSync(join(tmpDir, '.openfeel', 'flow.json'), 'utf-8')) as FlowData;
      expect(after.stages['v1.0.0-stage-01'].phase).toBe('plan_passed');
      const advanceLogs = after.log.filter((l) => l.action === 'advance_stage_phase');
      expect(advanceLogs).toHaveLength(1);
      // 既有键逐字在位 + review_tier 仅显式时追加
      expect(advanceLogs[0].detail).toMatchObject({
        stageName: 'v1.0.0-stage-01', from: 'plan_pending', to: 'plan_passed', review_tier: 'skip',
      });
      expect(typeof advanceLogs[0].detail.session_id).toBe('string');
    } finally {
      warnMock.mockRestore();
    }
  });

  it('T92.3：缺省 = 零裁剪（无 review_tier 键 + 零警告）；显式 full = 零裁剪且留痕 full', async () => {
    setupResetStage('plan_pending' as PipelinePhase, 'planned');
    const warnMock = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const flowPath = join(tmpDir, '.openfeel', 'flow.json');
    try {
      // ① 缺省（无 --review-tier）→ 逐字零回归：既有 full 表路径 + 审计无边车键 + 零警告
      await safeParse(['flow', 'advance', '--stage', 'v1.0.0-stage-01', '--to', 'plan_review']);
      expect(exitMock).not.toHaveBeenCalled();
      const first = JSON.parse(readFileSync(flowPath, 'utf-8')) as FlowData;
      const firstLog = first.log.filter((l) => l.action === 'advance_stage_phase');
      expect(firstLog).toHaveLength(1);
      expect('review_tier' in firstLog[0].detail).toBe(false);
      expect(Object.keys(firstLog[0].detail)).toEqual(['stageName', 'from', 'to', 'session_id']);
      expect(warnMock).not.toHaveBeenCalled();

      // ② 显式 --review-tier full → 档位=零裁剪（路径不变）且**显式声明**留痕
      await safeParse(['flow', 'advance', '--stage', 'v1.0.0-stage-01', '--to', 'plan_passed', '--review-tier', 'full']);
      expect(exitMock).not.toHaveBeenCalled();
      const second = JSON.parse(readFileSync(flowPath, 'utf-8')) as FlowData;
      const secondLog = second.log.filter((l) => l.action === 'advance_stage_phase');
      expect(secondLog).toHaveLength(2); // ① 的 1 条 + ② 的 1 条（plan_review→plan_passed 单步）
      expect(secondLog[1].detail.review_tier).toBe('full');
      expect(secondLog[1].detail).toMatchObject({ from: 'plan_review', to: 'plan_passed' });
      // full 档零裁剪 → 不告警（警告仅 lean / skip）
      expect(warnMock).not.toHaveBeenCalled();
    } finally {
      warnMock.mockRestore();
    }
  });

  it('T92.4：--review-tier lean --dry-run → 预览含档位行且 .openfeel 全目录零写盘', async () => {
    const { createHash } = await import('node:crypto');
    setupResetStage('plan_review' as PipelinePhase, 'planned');
    const snap = (dir: string): Record<string, string> => {
      const out: Record<string, string> = {};
      for (const ent of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, ent.name);
        if (ent.isDirectory()) { Object.assign(out, snap(p)); } else { out[p] = createHash('sha256').update(readFileSync(p)).digest('hex'); }
      }
      return out;
    };
    const openfeelDir = join(tmpDir, '.openfeel');
    const before = snap(openfeelDir);
    expect(Object.keys(before).length).toBeGreaterThanOrEqual(3); // 防假绿：快照非空

    await safeParse(['flow', 'advance', '--stage', 'v1.0.0-stage-01', '--to', 'plan_passed', '--review-tier', 'lean', '--dry-run']);

    expect(exitMock).not.toHaveBeenCalled();
    const out = logMock.mock.calls.map((c) => c[0] as string).join('\n');
    expect(out).toContain('Dry-run');
    expect(out).toContain('审查档位: lean');
    expect(out).toContain('免除: scheme_review');
    expect(snap(openfeelDir)).toEqual(before);
  });

  it('T92.5：--review-tier skip --to done + blocking REV → exit 1 零写盘（--force 不可绕过）', async () => {
    setupResetStage('test_passed' as PipelinePhase, 'testing', [
      {
        id: 'REV-92-BLK', op: 'v1.0.0-stage-01.op-001', title: 'blocking', status: 'open', blocking: true,
        priority: 'high', filed_by: 'openfeel-reviewer', filed_at: '2026-01-01T00:00:00Z',
      },
    ]);
    const flowPath = join(tmpDir, '.openfeel', 'flow.json');
    const revBefore = JSON.parse(readFileSync(flowPath, 'utf-8')).meta.revision;
    const warnMock = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      errorMock.mockClear();
      exitMock.mockClear();
      await safeParse(['flow', 'advance', '--stage', 'v1.0.0-stage-01', '--to', 'done', '--review-tier', 'skip']);
      expect(exitMock).toHaveBeenCalledWith(1);
      expect(errorMock.mock.calls.map((c) => c[0] as string).join('\n')).toContain('blocking REV');
      // 降档警告非阻断（输出一行，退出码以外无副作用）
      expect(warnMock.mock.calls.map((c) => c[0] as string).join('\n')).toContain('审查档位');

      // --force 亦不可绕过 REV 阻塞检查
      errorMock.mockClear();
      exitMock.mockClear();
      await safeParse(['flow', 'advance', '--stage', 'v1.0.0-stage-01', '--to', 'done', '--review-tier', 'skip', '--force']);
      expect(exitMock).toHaveBeenCalledWith(1);

      const after = JSON.parse(readFileSync(flowPath, 'utf-8'));
      expect(after.meta.revision).toBe(revBefore);
      expect(after.stages['v1.0.0-stage-01'].phase).toBe('test_passed');
    } finally {
      warnMock.mockRestore();
    }
  });

  it('T92.6：flow phases --json.reviewTier 三模式取值（full→full / fast→lean / general→full）+ displayReviewTier 同值 + effectiveReviewTier 恒 full', async () => {
    rmSync(join(tmpDir, '.openfeel', 'pipeline.yaml'), { force: true });
    const tiersOf = async (mode: string): Promise<{ reviewTier: unknown; displayReviewTier: unknown; effectiveReviewTier: unknown }> => {
      logMock.mockClear();
      await safeParse(['flow', 'phases', '--mode', mode, '--json']);
      const obj = JSON.parse(logMock.mock.calls[0][0] as string) as { reviewTier: unknown; displayReviewTier: unknown; effectiveReviewTier: unknown };
      return { reviewTier: obj.reviewTier, displayReviewTier: obj.displayReviewTier, effectiveReviewTier: obj.effectiveReviewTier };
    };
    const expectTiers = async (mode: string, tier: string): Promise<void> => {
      const t = await tiersOf(mode);
      expect(t.reviewTier).toBe(tier);
      // stage-96 op-002：displayReviewTier 与 reviewTier 同值；effectiveReviewTier 恒 full
      expect(t.displayReviewTier).toBe(tier);
      expect(t.effectiveReviewTier).toBe('full');
    };
    await expectTiers('full', 'full');
    await expectTiers('fast', 'lean');
    await expectTiers('general', 'full');
  });

  it('T92.7：单一取表点静态断言（pruneTransitionsByTier 调用点恰 1；resolveTransitionsForMode 调用点恰 2）', () => {
    const src = readFileSync(join(REAL_CWD, 'src', 'core', 'flow-manager.ts'), 'utf-8');
    const count = (needle: string): number => src.split(needle).length - 1;
    expect(count('this.pruneTransitionsByTier(')).toBe(1);
    expect(count('this.resolveTransitionsForMode(')).toBe(2);
    // getDefaultTransitions 零改动（REV-92-004 选项 a：不加 tier 参数，保持「不受运行时 yaml 影响」语义）
    const sigStart = src.indexOf('getDefaultTransitions(');
    expect(sigStart).toBeGreaterThan(-1);
    const sigLine = src.slice(sigStart, src.indexOf('\n', sigStart));
    expect(sigLine).toContain("mode: WorkflowMode = 'full'");
    expect(sigLine).not.toContain('tier');
  });

  // stage-93 op-001：BUG-011 修复（裁剪只作用于入边 / 目标侧 → 被裁剪相位保留出边）——命令层实跑
  it('T93.10：phase=plan_review + --review-tier skip → plan_passed exit 0 零 --force；阴性「进入被裁剪关仍拒」', async () => {
    const flowPath = join(tmpDir, '.openfeel', 'flow.json');
    setupResetStage('plan_review' as PipelinePhase, 'planned');
    const warnMock = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      logMock.mockClear();
      errorMock.mockClear();
      exitMock.mockClear();

      await safeParse(['flow', 'advance', '--stage', 'v1.0.0-stage-01', '--to', 'plan_passed', '--review-tier', 'skip']);

      expect(exitMock).not.toHaveBeenCalled();                                  // 修复前 = 死锁（无目标 → exit 1），现零 --force 可达
      expect(errorMock).not.toHaveBeenCalled();
      expect(logMock.mock.calls.map((c) => c[0] as string).join('\n')).toContain('已推进');
      expect(warnMock.mock.calls.map((c) => c[0] as string).join('\n')).toContain('审查档位');   // 降档警告保留

      const after = JSON.parse(readFileSync(flowPath, 'utf-8')) as FlowData;
      expect(after.stages['v1.0.0-stage-01'].phase).toBe('plan_passed');
      const advanceLogs = after.log.filter((l) => l.action === 'advance_stage_phase');
      expect(advanceLogs).toHaveLength(1);
      expect(advanceLogs[0].detail).toMatchObject({ from: 'plan_review', to: 'plan_passed', review_tier: 'skip' });
      const detailKeys = Object.keys(advanceLogs[0].detail);
      expect(detailKeys.indexOf('review_tier')).toBe(detailKeys.length - 1);    // 追加于末位
    } finally {
      warnMock.mockRestore();
    }

    // 阴性：进入被裁剪关仍不可达（plan_pending → plan_review @skip → no-path 零写盘）
    setupResetStage('plan_pending' as PipelinePhase, 'planned');
    const raw = readFileSync(flowPath, 'utf-8');
    const warnMock2 = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      errorMock.mockClear();
      exitMock.mockClear();
      await safeParse(['flow', 'advance', '--stage', 'v1.0.0-stage-01', '--to', 'plan_review', '--review-tier', 'skip']);
      expect(exitMock).toHaveBeenCalledWith(1);
      const err = errorMock.mock.calls.map((c) => c[0] as string).join('\n');
      expect(err).toMatch(/无法从|路径深度超过上限/);                             // 不可达（no-path / 深度上限）
      expect(err).toContain('合法跳转目标: [plan_passed]');                      // 进入被裁剪关不可达（plan_review 不在可达集）
      expect(readFileSync(flowPath, 'utf-8')).toBe(raw);                        // 零写盘
    } finally {
      warnMock2.mockRestore();
    }
  });

  // stage-93 op-001：REV-92-006 文案处置（depth-exceeded 追加「目标可能不可达」提示）——命令层实跑
  it('T93.12：depth-exceeded 文案含新提示 + 被裁剪相位的可达目标非空（REV-93-007 输出面登记）', async () => {
    const flowPath = join(tmpDir, '.openfeel', 'flow.json');
    setupResetStage('plan_review' as PipelinePhase, 'planned');
    const raw = readFileSync(flowPath, 'utf-8');
    const warnMock = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      errorMock.mockClear();
      exitMock.mockClear();
      // 阶段恰处于被裁剪相位（plan_review @skip）且目标不可达（scheme_review 同被裁）→ depth-exceeded
      await safeParse(['flow', 'advance', '--stage', 'v1.0.0-stage-01', '--to', 'scheme_review', '--review-tier', 'skip']);

      expect(exitMock).toHaveBeenCalledWith(1);
      const err = errorMock.mock.calls.map((c) => c[0] as string).join('\n');
      expect(err).toContain('路径深度超过上限');                                  // BFS / 判定逐字不变
      expect(err).toContain('目标可能不可达');                                    // REV-92-006 新增提示
      // REV-93-007：被裁剪相位的可达目标由「(无)」转非空（修复本体语义的一部分）
      expect(err).toContain('合法跳转目标: [plan_passed, plan_pending]');
      expect(err).not.toContain('当前 phase 无合法跳转目标');
      expect(readFileSync(flowPath, 'utf-8')).toBe(raw);                          // 零写盘
    } finally {
      warnMock.mockRestore();
    }
  });

  // ── stage-95 op-002：flow advance --json（错误封装开关）──

  it('stage-95 op-002：advance --json 非法相位 → stdout 单 envelope + exit 1（无 human 输出）', async () => {
    const mgr = new FlowManager(tmpDir);
    mgr.addStage('v1.9.0-stage-77');
    mgr.save();
    logMock.mockClear();
    errorMock.mockClear();
    exitMock.mockClear();
    process.exitCode = 0;
    setJsonMode(true);
    try {
      await safeParse(['flow', 'advance', '--stage', 'v1.9.0-stage-77', '--to', 'bogus', '--json']);

      // JSON 模式：不调用 process.exit，仅置退出码（REV-95-007.1）
      expect(exitMock).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
      expect(logMock).toHaveBeenCalledTimes(1);
      const doc = JSON.parse(logMock.mock.calls[0][0] as string) as {
        schemaVersion: number;
        error: { code: string; kind: string; message: string; detail: unknown };
      };
      expect(Object.keys(doc)).toEqual(['schemaVersion', 'error']);
      expect(Object.keys(doc.error)).toEqual(['code', 'kind', 'message', 'detail']);
      expect(doc.error.code).toBe('PHASE_TRANSITION_ILLEGAL');
      expect(doc.error.kind).toBe('refusal');
      // 失败前的人类提示行改走 stderr，stdout 保持单文档
      expect(errorMock).not.toHaveBeenCalled();
    } finally {
      resetJsonModeForTest();
      process.exitCode = 0;
    }
  });

  // ═══════════════════════════════════════════════
  // stage-96 op-001：flow next（调度决策只读出口）
  // ═══════════════════════════════════════════════

  describe('stage-96 op-001 flow next', () => {
    const NEXT_KEYS = [
      'schemaVersion', 'stage', 'phase', 'phaseLabel', 'responsibleAgent', 'workflowMode',
      'reviewTier', 'effectiveReviewTier', 'legalNextPhases', 'suggestedCommand', 'guards', 'blockingReviews',
    ];
    const STAGE = 'v1.9.0-stage-77';

    /** 构造审查条目（缺省 open；blocking 缺省 = 阻塞） */
    function revItem(overrides: Partial<ReviewItem> & { id: string; op: string }): ReviewItem {
      return {
        status: 'open',
        priority: 'medium',
        title: `标题 ${overrides.id}`,
        filed_by: 'openfeel-reviewer',
        filed_at: '2026-01-01T00:00:00Z',
        ...overrides,
      };
    }

    /** 写入活跃阶段夹具并保存 */
    function seedStage(phase: PipelinePhase = 'plan_pending', reviews: ReviewItem[] = []): void {
      const mgr = new FlowManager(tmpDir);
      mgr.addStage(STAGE, phase);
      if (reviews.length > 0) {
        mgr.getData()!.reviews = reviews;
      }
      mgr.save();
    }

    beforeEach(() => {
      process.exitCode = 0;
    });

    it('full：12 键精确序 + 字段值 + advance 接受集交叉', async () => {
      seedStage();
      const d = await runNextJson();
      expect(Object.keys(d)).toEqual(NEXT_KEYS);
      expect(d.schemaVersion).toBe(1);
      expect(d.stage).toBe(STAGE);
      expect(d.phase).toBe('plan_pending');
      expect(d.phaseLabel).toBe('计划待定');
      expect(d.responsibleAgent).toBe('openfeel-planner');
      expect(d.workflowMode).toBe('full');
      expect(d.reviewTier).toBe('full');
      expect(d.effectiveReviewTier).toBe('full');
      expect(d.legalNextPhases).toEqual(['plan_review', 'plan_passed']);
      expect(d.suggestedCommand).toBe(`openfeel flow advance --stage ${STAGE} --to plan_review`);
      expect(d.guards).toEqual([]);
      expect(d.blockingReviews).toEqual([]);

      // 契约不变量 2：legalNextPhases 每个元素均被 flow advance 接受（dry-run）
      for (const target of d.legalNextPhases as string[]) {
        process.exitCode = 0;
        await safeParse(['flow', 'advance', '--stage', STAGE, '--to', target, '--dry-run']);
        expect(process.exitCode).toBe(0);
      }
    });

    it('fast：workflowMode=fast / reviewTier=lean / effective=full / 档位差守卫', async () => {
      seedStage();
      setConfigValue(tmpDir, 'workflow_mode', 'fast');
      const d = await runNextJson();
      expect(d.workflowMode).toBe('fast');
      expect(d.reviewTier).toBe('lean');
      expect(d.effectiveReviewTier).toBe('full');
      expect(d.legalNextPhases).toEqual(['plan_review']);
      expect(d.suggestedCommand).toBe(`openfeel flow advance --stage ${STAGE} --to plan_review`);
      expect(d.guards).toHaveLength(1);
      const guard = (d.guards as string[])[0];
      expect(guard).toContain('lean');
      expect(guard).toContain('full');
    });

    it('无活跃阶段：初始化占位 - 原样输出（全 null + feel + noActiveStage）', async () => {
      const d = await runNextJson();
      expect(Object.keys(d)).toEqual(NEXT_KEYS);
      expect(d.stage).toBe('-');
      expect(d.phase).toBeNull();
      expect(d.phaseLabel).toBeNull();
      expect(d.responsibleAgent).toBe('feel');
      expect(d.workflowMode).toBeNull();
      expect(d.reviewTier).toBeNull();
      expect(d.effectiveReviewTier).toBeNull();
      expect(d.legalNextPhases).toEqual([]);
      expect(d.suggestedCommand).toBeNull();
      expect(d.guards).toHaveLength(1);
      expect((d.guards as string[])[0]).toContain('无活跃阶段');
      expect(d.blockingReviews).toEqual([]);
    });

    it('无活跃阶段：current.stage 显式空串 → stage=null，其余同上', async () => {
      const mgr = new FlowManager(tmpDir);
      mgr.getData()!.pipeline.current.stage = '';
      mgr.save();
      const d = await runNextJson();
      expect(d.stage).toBeNull();
      expect(d.phase).toBeNull();
      expect(d.responsibleAgent).toBe('feel');
      expect(d.workflowMode).toBeNull();
      expect(d.reviewTier).toBeNull();
      expect(d.effectiveReviewTier).toBeNull();
      expect(d.legalNextPhases).toEqual([]);
      expect(d.suggestedCommand).toBeNull();
      expect(d.guards).toHaveLength(1);
      expect(d.blockingReviews).toEqual([]);
    });

    it('阶段记录缺失：保留原始 stage 值 + 全 null + noActiveStage', async () => {
      const mgr = new FlowManager(tmpDir);
      mgr.getData()!.pipeline.current.stage = 'v9.9.9-stage-99';
      mgr.save();
      const d = await runNextJson();
      expect(d.stage).toBe('v9.9.9-stage-99');
      expect(d.phase).toBeNull();
      expect(d.responsibleAgent).toBe('feel');
      expect(d.legalNextPhases).toEqual([]);
      expect(d.guards).toHaveLength(1);
      expect((d.guards as string[])[0]).toContain('无活跃阶段');
    });

    it('done：legalNextPhases=[] / suggestedCommand=null / 无合法目标守卫', async () => {
      seedStage('done');
      const d = await runNextJson();
      expect(d.phase).toBe('done');
      expect(d.responsibleAgent).toBe('none');
      expect(d.legalNextPhases).toEqual([]);
      expect(d.suggestedCommand).toBeNull();
      expect(d.guards).toHaveLength(1);
      expect((d.guards as string[])[0]).toContain('无合法下一相位');
    });

    it('general：空转移表 → 无合法目标（不新增 other guard）', async () => {
      seedStage();
      setConfigValue(tmpDir, 'workflow_mode', 'general');
      const d = await runNextJson();
      expect(d.workflowMode).toBe('general');
      expect(d.reviewTier).toBe('full');
      expect(d.effectiveReviewTier).toBe('full');
      expect(d.legalNextPhases).toEqual([]);
      expect(d.suggestedCommand).toBeNull();
      expect(d.guards).toHaveLength(1);
      expect((d.guards as string[])[0]).toContain('无合法下一相位');
    });

    it('blocking：仅当前阶段域（前缀重叠不误命中）+ 元素键序 id,title,priority,op', async () => {
      seedStage('plan_pending', [
        revItem({ id: 'REV-001', op: `${STAGE}.op-001`, priority: 'high', title: '真实阻塞' }),
        revItem({ id: 'REV-002', op: `${STAGE}0.op-001` }),
      ]);
      const d = await runNextJson();
      const block = d.blockingReviews as Array<Record<string, unknown>>;
      expect(block).toHaveLength(1);
      expect(Object.keys(block[0])).toEqual(['id', 'title', 'priority', 'op']);
      expect(block[0].id).toBe('REV-001');
      expect(d.guards).toHaveLength(1);
      expect((d.guards as string[])[0]).toContain('阻塞中的 open REV');
    });

    it('guards 顺序：auto-advance → blocking → 无目标（fast + disabled + blocking）', async () => {
      seedStage('plan_pending', [revItem({ id: 'REV-100', op: `${STAGE}.op-001` })]);
      setConfigValue(tmpDir, 'workflow_mode', 'fast');
      setConfigValue(tmpDir, 'auto_advance', 'disabled');
      const d = await runNextJson();
      const guards = d.guards as string[];
      expect(guards).toHaveLength(3);
      expect(guards[0]).toContain('自动推进已禁用');
      expect(guards[1]).toContain('阻塞中的 open REV');
      expect(guards[2]).toContain('展示档位');

      // 无目标守卫出现在 blocking 之后（phase=done）
      const mgr = new FlowManager(tmpDir);
      mgr.getData()!.stages[STAGE].phase = 'done';
      mgr.save();
      const d2 = await runNextJson();
      const guards2 = d2.guards as string[];
      const blockingIdx = guards2.findIndex((g) => g.includes('阻塞中的 open REV'));
      const noTargetIdx = guards2.findIndex((g) => g.includes('无合法下一相位'));
      expect(blockingIdx).toBeGreaterThanOrEqual(0);
      expect(noTargetIdx).toBeGreaterThan(blockingIdx);
    });

    it('人类输出：标题 / 字段标签 / 建议命令；无 ANSI、无 JSON 片段', async () => {
      seedStage();
      logMock.mockClear();
      await safeParse(['flow', 'next']);
      const out = logMock.mock.calls.map((c) => String(c[0])).join('\n');
      expect(out).toContain('流水线下一步（只读）');
      expect(out).toContain('阶段: v1.9.0-stage-77');
      expect(out).toContain('相位: plan_pending (计划待定)');
      expect(out).toContain('负责 Agent: openfeel-planner');
      expect(out).toContain('合法下一相位: [plan_review, plan_passed]');
      expect(out).toContain(`建议命令: openfeel flow advance --stage ${STAGE} --to plan_review`);
      expect(out).not.toContain('\u001b[');
      expect(out).not.toContain('"schemaVersion"');
      expect(process.exitCode).toBe(0);
    });

    it('未初始化：NO_INIT envelope / kind=refusal / exitCode=1 / 不调用 process.exit', async () => {
      rmSync(join(tmpDir, '.openfeel', 'flow.json'));
      expect(exitMock).not.toHaveBeenCalled();
      const d = await runNextJson();
      expect(exitMock).not.toHaveBeenCalled();
      expect(logMock).toHaveBeenCalledTimes(1);
      expect(Object.keys(d)).toEqual(['schemaVersion', 'error']);
      const err = d.error as Record<string, unknown>;
      expect(err.code).toBe('NO_INIT');
      expect(err.kind).toBe('refusal');
      expect(process.exitCode).toBe(1);
    });

    it('只读零写盘：save 零调用 + flow.json 字节前后相等', async () => {
      seedStage();
      const flowPath = join(tmpDir, '.openfeel', 'flow.json');
      const before = readFileSync(flowPath);
      const saveSpy = vi.spyOn(FlowManager.prototype, 'save');
      try {
        await runNextJson();
        await safeParse(['flow', 'next']);
        expect(saveSpy).not.toHaveBeenCalled();
      } finally {
        saveSpy.mockRestore();
      }
      expect(readFileSync(flowPath).equals(before)).toBe(true);
    });

    it('applyHelpI18n：help.flow.next / help.flow.next.json 有消费', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const p = new Command();
        p.name('openfeel');
        registerFlowCommand(p);
        applyHelpI18n(p);
        const nextCmd = p.commands.find((c) => c.name() === 'flow')!.commands.find((c) => c.name() === 'next')!;
        expect(nextCmd.description()).toContain('调度决策');
        const jsonOpt = nextCmd.options.find((o) => o.long === '--json')!;
        expect(jsonOpt.description).toContain('{ schemaVersion, stage, phase');
      } finally {
        warnSpy.mockRestore();
      }
    });
  });
  // ═══════════════════════════════════════════════
  // stage-96 op-002：flow status --json 阶段调度属性 + flow phases --json 档位消歧
  // ═══════════════════════════════════════════════

  describe('stage-96 op-002 阶段调度属性', () => {
    const STAGE_KEYS = [
      'id', 'phase', 'status', 'deps', 'ops',
      'workflowMode', 'requirementId', 'reviewTier', 'effectiveReviewTier', 'opsSummary',
    ];
    const STAGE = 'v1.9.0-stage-77';
    const EMPTY_STAGE = 'v1.9.0-stage-78';

    /** 夹具：STAGE（REQ-001 + 双状态 op）与 EMPTY_STAGE（空 ops / 无需求） */
    function seed(): void {
      const mgr = new FlowManager(tmpDir);
      mgr.addStage(STAGE);
      mgr.getData()!.stages[STAGE].requirement_id = 'REQ-001';
      mgr.getData()!.stages[STAGE].ops = {
        'op-001': { title: 'a', state: 'pending' },
        'op-002': { title: 'b', state: 'done' },
      } as never;
      mgr.addStage(EMPTY_STAGE);
      delete mgr.getData()!.stages[EMPTY_STAGE].requirement_id;
      mgr.getData()!.stages[EMPTY_STAGE].ops = {};
      mgr.save();
    }

    async function statusDoc(): Promise<Record<string, unknown>> {
      logMock.mockClear();
      await safeParse(['flow', 'status', '--json']);
      return JSON.parse(logMock.mock.calls[0][0] as string) as Record<string, unknown>;
    }

    it('顶层 4 键不变 + stages[] 精确 10 键序 + 字段值 / opsSummary 同源', async () => {
      seed();
      const d = await statusDoc();
      // 顶层 4 键零改
      expect(Object.keys(d)).toEqual(['schemaVersion', 'pipeline', 'stages', 'counts']);

      const stages = d.stages as Array<Record<string, unknown>>;
      const s = stages.find((x) => x.id === STAGE)!;
      expect(Object.keys(s)).toEqual(STAGE_KEYS);
      // 既有 5 字段值与夹具一致
      expect(s.phase).toBe('plan_pending');
      expect(s.status).toBe('planned');
      expect(s.deps).toEqual([]);
      expect(s.ops).toEqual({ 'op-001': 'pending', 'op-002': 'done' });
      // 新增 5 字段
      expect(s.workflowMode).toBe('full');          // beforeEach 置 config full
      expect(s.requirementId).toBe('REQ-001');
      expect(s.reviewTier).toBe('full');
      expect(s.effectiveReviewTier).toBe('full');
      expect(s.opsSummary).toEqual({ total: 2, byState: { pending: 1, done: 1 } });
      // 同源不变量：total === Object.keys(ops).length
      expect((s.opsSummary as { total: number }).total).toBe(Object.keys(s.ops as object).length);
    });

    it('空 ops / 缺省需求 → requirementId=null + opsSummary={total:0,byState:{}}', async () => {
      seed();
      const d = await statusDoc();
      const stages = d.stages as Array<Record<string, unknown>>;
      const e = stages.find((x) => x.id === EMPTY_STAGE)!;
      expect(Object.keys(e)).toEqual(STAGE_KEYS);
      expect(e.requirementId).toBeNull();
      expect(e.opsSummary).toEqual({ total: 0, byState: {} });
      expect(e.ops).toEqual({});
    });

    it('workflow_mode=fast → workflowMode=fast / reviewTier=lean / effectiveReviewTier=full，且与 flow mode --stage 同源', async () => {
      seed();
      setConfigValue(tmpDir, 'workflow_mode', 'fast');
      const d = await statusDoc();
      const stages = d.stages as Array<Record<string, unknown>>;
      const s = stages.find((x) => x.id === STAGE)!;
      expect(s.workflowMode).toBe('fast');
      expect(s.reviewTier).toBe('lean');
      expect(s.effectiveReviewTier).toBe('full');

      // 一致性：flow mode --stage <id> --json.mode === stages[].workflowMode
      logMock.mockClear();
      await safeParse(['flow', 'mode', '--stage', STAGE, '--json']);
      const modeDoc = JSON.parse(logMock.mock.calls[0][0] as string) as { mode: string };
      expect(modeDoc.mode).toBe(s.workflowMode);
    });

    it('byState 仅含观测态（无零值键）+ 空串 state 按观测键计数', async () => {
      const mgr = new FlowManager(tmpDir);
      mgr.addStage(STAGE);
      mgr.getData()!.stages[STAGE].ops = {
        'op-001': { title: 'a', state: 'done' },
        'op-002': { title: 'b', state: 'done' },
        'op-003': { title: 'c' },                       // 畸形：state 缺失 → ''
      } as never;
      mgr.save();
      const d = await statusDoc();
      const s = (d.stages as Array<Record<string, unknown>>).find((x) => x.id === STAGE)!;
      // 只出现观测到的键（done / ''），不注入 pending 等零值键；键序 = 首次出现序
      expect(Object.keys((s.opsSummary as { byState: object }).byState)).toEqual(['done', '']);
      expect(s.opsSummary).toEqual({ total: 3, byState: { done: 2, '': 1 } });
    });

    it('flow phases --json 消歧：fast → reviewTier=displayReviewTier=lean / effectiveReviewTier=full', async () => {
      rmSync(join(tmpDir, '.openfeel', 'pipeline.yaml'), { force: true });
      const phaseDoc = async (mode: string): Promise<Record<string, unknown>> => {
        logMock.mockClear();
        await safeParse(['flow', 'phases', '--mode', mode, '--json']);
        return JSON.parse(logMock.mock.calls[0][0] as string) as Record<string, unknown>;
      };
      const fast = await phaseDoc('fast');
      expect(Object.keys(fast)).toEqual([
        'schemaVersion', 'phases', 'transitions', 'advanceAccepted', 'transitionsDiff', 'workflowMode',
        'reviewTier', 'displayReviewTier', 'effectiveReviewTier',
      ]);
      expect(fast.workflowMode).toBe('fast');
      expect(fast.reviewTier).toBe('lean');
      expect(fast.displayReviewTier).toBe('lean');
      expect(fast.effectiveReviewTier).toBe('full');

      const general = await phaseDoc('general');
      expect(general.reviewTier).toBe('full');
      expect(general.displayReviewTier).toBe('full');
      expect(general.effectiveReviewTier).toBe('full');
    });

    it('人类输出零回归：flow status / flow status --verbose / flow phases 不泄漏 JSON 新字段', async () => {
      seed();
      const human = async (args: string[]): Promise<string> => {
        logMock.mockClear();
        await safeParse(args);
        return logMock.mock.calls.map((c) => c[0] as string).join('\n');
      };
      const status = await human(['flow', 'status']);
      expect(status).toContain('OpenFeel 流水线状态');
      // 非 verbose 仅展示当前活跃阶段（addStage 末次 = EMPTY_STAGE）
      expect(status).toContain(EMPTY_STAGE);
      expect(status).not.toContain('opsSummary');
      expect(status).not.toContain('effectiveReviewTier');

      const verbose = await human(['flow', 'status', '--verbose']);
      // verbose 段落标签序列保持不变（逐字 diff 归 op-003）
      expect(verbose).toContain('配置级联状态');
      expect(verbose).toContain('下游 Agent 就绪状态');
      expect(verbose).toContain('跨会话恢复信息');
      expect(verbose).not.toContain('opsSummary');
      expect(verbose).not.toContain('displayReviewTier');

      const phases = await human(['flow', 'phases']);
      expect(phases).toContain('OpenFeel 流水线 phase 自描述');
      expect(phases).not.toContain('displayReviewTier');
      expect(phases).not.toContain('effectiveReviewTier');
    });
  });

  // ═══ stage-97 op-001：flow recover / checkpoint list / log ═══

  describe('stage-97 op-001：人类输出基线与 JSON 契约', () => {
    function stdout(): string {
      return logMock.mock.calls.map((c) => c[0] as string).join('\n');
    }

    it('op-001 基线：flow recover（已初始化）人类输出', async () => {
      await safeParse(['flow', 'recover']);
      expect(stdout()).toMatchInlineSnapshot(`
        "
        ═══ 跨会话上下文恢复 ═══

        全局状态:   active
        流水线阶段: 未知
        当前操作:   -.init
        阶段状态:   status.md 不存在

        无待处理任务

        ═══════════════════════════"
      `);
    });

    it('op-001 基线：flow recover（未初始化）人类输出', async () => {
      const bare = mkdtempSync(join(tmpdir(), 'openfeel-bare-recover-'));
      cwdMock.mockReturnValue(bare);
      try {
        await safeParse(['flow', 'recover']);
        expect(stdout()).toMatchInlineSnapshot(`"流水线未初始化（flow.json 不存在）"`);
      } finally {
        cwdMock.mockReturnValue(tmpDir);
        rmSync(bare, { recursive: true, force: true });
      }
    });

    it('op-001 基线：flow checkpoint list（空 / 有快照 / 指定 stage）人类输出', async () => {
      logMock.mockClear();
      await safeParse(['flow', 'checkpoint', 'list']);
      expect(stdout()).toMatchInlineSnapshot(`"（暂无 Checkpoint 快照）"`);

      const cpDir = join(tmpDir, '.openfeel', 'checkpoints');
      mkdirSync(cpDir, { recursive: true });
      const snap = 'v1.0.0-stage-01-20260101T000000000-plan_review.json';
      writeFileSync(join(cpDir, snap), '{}', 'utf-8');

      logMock.mockClear();
      await safeParse(['flow', 'checkpoint', 'list', 'stage-01']);
      expect(stdout()).toMatchInlineSnapshot(`
        "Checkpoint 快照 [stage-01]:
          v1.0.0-stage-01-20260101T000000000-plan_review.json
        共 1 个快照"
      `);
    });

    it('op-001 基线：flow log（空 / 有日志）人类输出', async () => {
      logMock.mockClear();
      await safeParse(['flow', 'log']);
      expect(stdout()).toMatchInlineSnapshot(`"暂无操作日志"`);

      const mgr = new FlowManager(tmpDir);
      mgr.appendLog({ time: '2026-01-02T03:04:05.000Z', agent: 'openfeel-executor', action: 'start', detail: { k: 'v' } });
      mgr.appendLog({ time: '2026-01-02T03:05:06.000Z', agent: 'cli', action: 'noop', detail: {} });
      mgr.save();

      logMock.mockClear();
      await safeParse(['flow', 'log', '--last', '2']);
      expect(stdout()).toMatchInlineSnapshot(`
        "最近 2 条操作日志:

        [2026-01-02 03:04:05] openfeel-executor — start
          详情: {"k":"v"}

        [2026-01-02 03:05:06] cli — noop
        "
      `);
    });

    // ── JSON 契约 ──

    /** 执行一次命令并解析 stdout 单文档（断言 schemaVersion 首键=1、无 ANSI、无 stderr） */
    async function jsonDoc(args: string[]): Promise<Record<string, unknown>> {
      logMock.mockClear();
      errorMock.mockClear();
      await safeParse(args);
      const raw = stdout();
      expect(raw.trim().length).toBeGreaterThan(0);
      expect(raw).not.toMatch(/\x1b\[/);
      expect(errorMock).not.toHaveBeenCalled();
      const doc = JSON.parse(raw) as Record<string, unknown>;
      expect(Object.keys(doc)[0]).toBe('schemaVersion');
      expect(doc.schemaVersion).toBe(1);
      return doc;
    }

    it('op-001 JSON：flow recover（已初始化）7 键序与值', async () => {
      const doc = await jsonDoc(['flow', 'recover', '--json']);
      expect(Object.keys(doc)).toEqual([
        'schemaVersion', 'initialized', 'phase', 'currentOp',
        'stageStatus', 'blockedBy', 'pendingTasks', 'stageStats',
      ]);
      expect(doc.initialized).toBe(true);
      expect(doc.phase).toBeNull();
      expect(typeof doc.currentOp).toBe('string');
      expect(typeof doc.stageStatus).toBe('string');
      expect(doc.blockedBy).toBeNull();
      expect(doc.pendingTasks).toEqual([]);
      expect(doc.stageStats).toEqual({});
      expect(process.exitCode ?? 0).toBe(0);
    });

    it('op-001 JSON：flow recover（未初始化）→ initialized:false + 空值 + exit 0', async () => {
      const bare = mkdtempSync(join(tmpdir(), 'openfeel-bare-json-recover-'));
      cwdMock.mockReturnValue(bare);
      try {
        const doc = await jsonDoc(['flow', 'recover', '--json']);
        expect(Object.keys(doc)).toEqual([
          'schemaVersion', 'initialized', 'phase', 'currentOp',
          'stageStatus', 'blockedBy', 'pendingTasks', 'stageStats',
        ]);
        expect(doc.initialized).toBe(false);
        expect(doc.phase).toBeNull();
        expect(doc.currentOp).toBeNull();
        expect(doc.stageStatus).toBeNull();
        expect(doc.blockedBy).toBeNull();
        expect(doc.pendingTasks).toEqual([]);
        expect(doc.stageStats).toEqual({});
        expect(exitMock).not.toHaveBeenCalled();
        expect(process.exitCode ?? 0).toBe(0);
      } finally {
        cwdMock.mockReturnValue(tmpDir);
        rmSync(bare, { recursive: true, force: true });
      }
    });

    it('op-001 JSON：flow checkpoint list（空 / 指定 stage）', async () => {
      const empty = await jsonDoc(['flow', 'checkpoint', 'list', '--json']);
      expect(Object.keys(empty)).toEqual(['schemaVersion', 'stage', 'checkpoints', 'count']);
      expect(empty.stage).toBeNull();
      expect(empty.checkpoints).toEqual([]);
      expect(empty.count).toBe(0);

      const cpDir = join(tmpDir, '.openfeel', 'checkpoints');
      mkdirSync(cpDir, { recursive: true });
      const snap = 'v1.0.0-stage-01-20260101T000000000-plan_review.json';
      writeFileSync(join(cpDir, snap), '{}', 'utf-8');

      const doc = await jsonDoc(['flow', 'checkpoint', 'list', 'stage-01', '--json']);
      expect(doc.stage).toBe('stage-01');
      expect(doc.checkpoints).toEqual([snap]);
      expect(doc.count).toBe(1);
      expect(exitMock).not.toHaveBeenCalled();
    });

    it('op-001 JSON：flow log（空 → [] / 有日志 → 键序与值）', async () => {
      const empty = await jsonDoc(['flow', 'log', '--json']);
      expect(Object.keys(empty)).toEqual(['schemaVersion', 'count', 'entries']);
      expect(empty.count).toBe(0);
      expect(empty.entries).toEqual([]);

      const mgr = new FlowManager(tmpDir);
      mgr.appendLog({ time: '2026-01-02T03:04:05.000Z', agent: 'executor', action: 'start', detail: { k: 'v' } });
      mgr.appendLog({ time: '2026-01-02T03:05:06.000Z', agent: 'cli', action: 'noop', detail: {} });
      mgr.save();

      const doc = await jsonDoc(['flow', 'log', '--last', '2', '--json']);
      expect(Object.keys(doc)).toEqual(['schemaVersion', 'count', 'entries']);
      expect(doc.count).toBe(2);
      const entries = doc.entries as Array<Record<string, unknown>>;
      expect(Object.keys(entries[0])).toEqual(['time', 'agent', 'action', 'detail']);
      expect(entries).toEqual([
        { time: '2026-01-02T03:04:05.000Z', agent: 'openfeel-executor', action: 'start', detail: { k: 'v' } },
        { time: '2026-01-02T03:05:06.000Z', agent: 'cli', action: 'noop', detail: {} },
      ]);
      expect(exitMock).not.toHaveBeenCalled();
    });

    it('op-001 JSON：flow log（未初始化）→ entries:[] + exit 0', async () => {
      const bare = mkdtempSync(join(tmpdir(), 'openfeel-bare-json-log-'));
      cwdMock.mockReturnValue(bare);
      try {
        const doc = await jsonDoc(['flow', 'log', '--json']);
        expect(doc.count).toBe(0);
        expect(doc.entries).toEqual([]);
        expect(exitMock).not.toHaveBeenCalled();
        expect(process.exitCode ?? 0).toBe(0);
      } finally {
        cwdMock.mockReturnValue(tmpDir);
        rmSync(bare, { recursive: true, force: true });
      }
    });

    it('op-001 JSON：三条命令只读（flow.json 字节不变）', async () => {
      const flowPath = join(tmpDir, '.openfeel', 'flow.json');
      const before = readFileSync(flowPath, 'utf-8');
      await jsonDoc(['flow', 'recover', '--json']);
      await jsonDoc(['flow', 'checkpoint', 'list', '--json']);
      await jsonDoc(['flow', 'log', '--json']);
      expect(readFileSync(flowPath, 'utf-8')).toBe(before);
    });
  });
});
