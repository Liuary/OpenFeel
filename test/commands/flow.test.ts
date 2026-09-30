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

import { Command, CommanderError } from 'commander';
import { registerFlowCommand } from '../../src/commands/flow.js';
import { initProject } from '../../src/core/init.js';
import { FlowManager } from '../../src/core/flow-manager.js';
import { mkdtempSync, rmSync, readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

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

    logMock = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorMock = vi.spyOn(console, 'error').mockImplementation(() => {});
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
});
