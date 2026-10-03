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

import { Command, CommanderError } from 'commander';
import { registerFlowCommand } from '../../src/commands/flow.js';
import { initProject } from '../../src/core/init.js';
import { FlowManager } from '../../src/core/flow-manager.js';
import { mkdtempSync, rmSync, readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
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

  it('op-003/B2: 写盘失败 → exit 1 + 明确错误', async () => {
    setupReconcileStage('stage-99', 'active', 'planned');
    const proto = FlowManager.prototype as unknown as { writeStatusField: () => boolean };
    const spy = vi.spyOn(proto, 'writeStatusField').mockImplementation(() => {
      throw new Error('disk full');
    });
    errorMock.mockClear();
    exitMock.mockClear();
    logMock.mockClear();

    await safeParse(['flow', 'health', '--fix']);

    expect(exitMock).toHaveBeenCalledWith(1);
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
});
