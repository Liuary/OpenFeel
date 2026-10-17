/**
 * 19 出口 JSON 契约可执行冻结（v1.2.2-stage-95 op-001；stage-96 op-001 新增第 19 出口 flow next）
 *
 * 断言：每个成功 `--json` 出口 stdout 恰好一个 JSON 文档、`schemaVersion` 为运行时首键且值为 1、
 * 顶层键序与 `docs/json-contract.md` §5 冻结表逐字一致；条件键 / 形态变体 / legacy 失败形态专项。
 *
 * 隔离纪律：全程 fixture tmpDir + 隔离 HOME；禁止读写真实 `.openfeel/flow.json`。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// N4 单点隔离：homedir → 临时目录（initProject 的全局配置写入不触碰真实 ~/.openfeel/）
const mockHome = vi.hoisted(() => ({ dir: '' }));
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => mockHome.dir };
});

// 避免真实 git 调用（fixture 内命令不依赖仓库状态）
const mockedChild = vi.hoisted(() => ({ execSync: vi.fn(), execFileSync: vi.fn() }));
vi.mock('node:child_process', () => ({
  execSync: mockedChild.execSync,
  execFileSync: mockedChild.execFileSync,
}));

import { Command, CommanderError } from 'commander';
import { createRequire } from 'node:module';
import { registerFlowCommand } from '../../src/commands/flow.js';
import { registerReqCommand } from '../../src/commands/req.js';
import { registerInstructionsCommand } from '../../src/commands/instructions.js';
import { registerSetupCommand } from '../../src/commands/setup.js';
import { runCli, program as rootProgram } from '../../src/cli/index.js';
import { setJsonMode, resetJsonModeForTest } from '../../src/commands/shared/json-output.js';
import { initProject } from '../../src/core/init.js';
import { setConfigValue } from '../../src/core/config.js';
import { FlowManager, type FlowData } from '../../src/core/flow-manager.js';
import type { RequirementData } from '../../src/core/req/types.js';
import { REQ_STATUSES } from '../../src/core/req/types.js';
import { mkdtempSync, rmSync, mkdirSync, copyFileSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const REPO_SCHEMA = fileURLToPath(new URL('../../schemas/spec-driven/schema.yaml', import.meta.url));

// 真实工作区反守卫：模块顶层捕获基线（cwdMock 注入前）
const REAL_CWD = process.cwd();
const REAL_FLOW_PATH = join(REAL_CWD, '.openfeel', 'flow.json');
const REAL_FLOW_RAW = existsSync(REAL_FLOW_PATH) ? readFileSync(REAL_FLOW_PATH, 'utf-8') : null;

describe('19 出口 JSON 契约冻结（stage-95 op-001）', () => {
  let tmpDir: string;
  let uninitDir: string;
  let program: Command;
  let logMock: ReturnType<typeof vi.fn>;
  let errorMock: ReturnType<typeof vi.fn>;
  let cwdMock: ReturnType<typeof vi.fn>;
  let exitMock: ReturnType<typeof vi.fn>;
  let prevExitCode: number | string | undefined;

  beforeEach(async () => {
    mockHome.dir = mkdtempSync(join(tmpdir(), 'openfeel-json-contract-home-'));
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-json-contract-'));
    uninitDir = mkdtempSync(join(tmpdir(), 'openfeel-json-contract-uninit-'));
    mockedChild.execSync.mockReset();
    mockedChild.execFileSync.mockReset();
    await initProject(tmpDir);

    logMock = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorMock = vi.spyOn(console, 'error').mockImplementation(() => {});
    cwdMock = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    exitMock = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    prevExitCode = process.exitCode;
    process.exitCode = 0;

    program = new Command();
    program.exitOverride();
    registerFlowCommand(program);
    registerReqCommand(program);
    registerInstructionsCommand(program);
    registerSetupCommand(program);

    // instructions：复制仓库 schema 到临时项目（隔离；与既有 instructions 测试同源）
    const destDir = join(tmpDir, '.openfeel', 'schemas', 'spec-driven');
    mkdirSync(destDir, { recursive: true });
    copyFileSync(REPO_SCHEMA, join(destDir, 'schema.yaml'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    rmSync(uninitDir, { recursive: true, force: true });
    rmSync(mockHome.dir, { recursive: true, force: true });
    logMock.mockRestore();
    errorMock.mockRestore();
    cwdMock.mockRestore();
    exitMock.mockRestore();
    process.exitCode = prevExitCode;

    // REAL_CWD 反守卫：真实工作区逐字零触碰
    const realRaw = existsSync(REAL_FLOW_PATH) ? readFileSync(REAL_FLOW_PATH, 'utf-8') : null;
    expect(realRaw).toBe(REAL_FLOW_RAW);
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

  /** 捕获一次命令的 stdout（单一 JSON 文档） */
  async function capture(args: string[]): Promise<string> {
    logMock.mockClear();
    errorMock.mockClear();
    await safeParse(args);
    return logMock.mock.calls.map((c) => c[0] as string).join('\n');
  }

  /** 执行命令并解析为单文档（顺带断言 stdout 恰为一个可解析 JSON） */
  async function doc(args: string[]): Promise<Record<string, unknown>> {
    const raw = await capture(args);
    expect(raw.trim().length).toBeGreaterThan(0);
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    expect(Object.keys(parsed)[0]).toBe('schemaVersion');
    expect(parsed.schemaVersion).toBe(1);
    return parsed;
  }

  /** stage-96 op-001：flow next --json（命令层只读 isJsonMode()；直接 parse 须显式置位并复位） */
  async function docNext(): Promise<Record<string, unknown>> {
    setJsonMode(true);
    try {
      return await doc(['flow', 'next', '--json']);
    } finally {
      resetJsonModeForTest();
    }
  }

  /** 写入 archivable 夹具：v1.9.0 全 done + 保留 v1.9.9 非 done */
  function seedArchivable(): void {
    const mgr = new FlowManager(tmpDir);
    const data = mgr.getData()!;
    data.stages = {
      'v1.9.0-stage-01': { name: 'x', phase: 'done', status: 'done', deps: [], ops: {} },
      'v1.9.9-stage-01': { name: 'y', phase: 'exec_running', status: 'exec_running', deps: [], ops: {} },
    } as FlowData['stages'];
    data.reviews = [];
    data.log = [];
    data.pipeline.current = { stage: '', op: '' };
    mgr.setData(data);
    mgr.save();
  }

  /** 写入需求夹具（最小字段，验证可选字段条件出现） */
  function seedRequirements(rows: RequirementData[]): void {
    const mgr = new FlowManager(tmpDir);
    const data = mgr.getData()!;
    data.requirements = rows;
    mgr.setData(data);
    mgr.save();
  }

  function reqRow(id: string, overrides: Partial<RequirementData> = {}): RequirementData {
    return {
      id,
      title: `需求 ${id}`,
      status: 'draft',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      ...overrides,
    };
  }

  // ── 1~6：flow 只读出口 ──

  it('#1 flow status：顶层键序冻结 + stages[] 10 键（末位 5 调度属性）', async () => {
    const mgr = new FlowManager(tmpDir);
    mgr.addStage('v1.2.2-stage-96');
    mgr.getData()!.stages['v1.2.2-stage-96'].requirement_id = 'REQ-001';
    mgr.getData()!.stages['v1.2.2-stage-96'].ops = {
      'op-001': { title: 't1', state: 'pending' },
      'op-002': { title: 't2', state: 'done' },
    } as never;
    mgr.save();

    const d = await doc(['flow', 'status', '--json']);
    expect(Object.keys(d)).toEqual(['schemaVersion', 'pipeline', 'stages', 'counts']);
    expect(Object.keys(d.pipeline as object)).toEqual(['phase', 'current']);
    expect(Object.keys(d.counts as object)).toEqual(['total', 'done', 'active']);

    // stage-96 op-002：stages[] 10 键固定序（既有 5 键零改，新增 5 键仅追加于末位）
    const s = (d.stages as Array<Record<string, unknown>>).find((x) => x.id === 'v1.2.2-stage-96')!;
    expect(Object.keys(s)).toEqual([
      'id', 'phase', 'status', 'deps', 'ops',
      'workflowMode', 'requirementId', 'reviewTier', 'effectiveReviewTier', 'opsSummary',
    ]);
    // fixture 未设 workflow_mode → 内置默认 fast；展示 lean / 生效恒 full
    expect(s.workflowMode).toBe('fast');
    expect(s.reviewTier).toBe('lean');
    expect(s.effectiveReviewTier).toBe('full');
    expect(s.requirementId).toBe('REQ-001');
    expect(s.opsSummary).toEqual({ total: 2, byState: { pending: 1, done: 1 } });
  });

  it('#2 flow overview：已初始化顶层键序冻结', async () => {
    const d = await doc(['flow', 'overview', '--json']);
    expect(Object.keys(d)).toEqual([
      'schemaVersion', 'phase', 'current', 'summary', 'stages', 'reviews', 'health', 'logs',
    ]);
    expect(Object.keys(d.summary as object)).toEqual([
      'phase', 'currentOp', 'retryCount', 'stagesCount', 'opsCount', 'reviewItemsOpen', 'recentLogs',
    ]);
    expect(Object.keys(d.reviews as object)).toEqual([
      'open', 'blockingOpen', 'nonBlockingOpen', 'resolved', 'closed',
    ]);
    expect(Object.keys(d.health as object)).toEqual(['ok', 'pass', 'warn', 'fail']);
  });

  it('#2b flow overview 未初始化 → 文档形态变体（判别键 initialized）', async () => {
    cwdMock.mockReturnValue(uninitDir);
    const d = await doc(['flow', 'overview', '--json']);
    expect(Object.keys(d)).toEqual(['schemaVersion', 'initialized']);
    expect(d.initialized).toBe(false);
  });

  it('#3 flow current：顶层键序冻结', async () => {
    const d = await doc(['flow', 'current', '--json']);
    expect(Object.keys(d)).toEqual(['schemaVersion', 'stage', 'op', 'phase']);
  });

  it('#4 flow metrics：顶层键序冻结', async () => {
    const d = await doc(['flow', 'metrics', '--json']);
    expect(Object.keys(d)).toEqual(['schemaVersion', 'agents']);
    expect(Array.isArray(d.agents)).toBe(true);
  });

  it('#5 flow phases：顶层键序冻结（末位 2 键档位消歧）', async () => {
    const d = await doc(['flow', 'phases', '--json']);
    expect(Object.keys(d)).toEqual([
      'schemaVersion', 'phases', 'transitions', 'advanceAccepted', 'transitionsDiff', 'workflowMode', 'reviewTier',
      'displayReviewTier', 'effectiveReviewTier',
    ]);
    expect(Object.keys(d.transitionsDiff as object)).toEqual(['missing', 'extra', 'changed']);
    // fixture 未设 workflow_mode → 内置默认 fast → 展示档位 lean / 生效档位恒 full
    expect(d.workflowMode).toBe('fast');
    expect(d.reviewTier).toBe('lean');
    expect(d.displayReviewTier).toBe('lean');
    expect(d.effectiveReviewTier).toBe('full');
  });

  it('#6 flow mode：顶层键序冻结', async () => {
    const d = await doc(['flow', 'mode', '--json']);
    expect(Object.keys(d)).toEqual(['schemaVersion', 'stage', 'mode', 'source', 'modes']);
    expect(Object.keys(d.modes as object)).toEqual(['full', 'fast', 'general']);
  });

  // ── 7：flow ops list（warning 恒在） ──

  it('#7 flow ops list：warning 恒在（empty → string，其余 null）', async () => {
    const mgr = new FlowManager(tmpDir);
    mgr.addStage('v1.2.2-stage-95');
    mgr.getData()!.stages['v1.2.2-stage-95'].ops = {
      'op-001': { title: 't1', state: 'pending' },
      'op-002': { title: 't2', state: 'pending' },
    } as never;
    mgr.save();
    const opsDir = join(tmpDir, '.openfeel', 'plan', 'v1', 'stage-95', 'ops');
    mkdirSync(opsDir, { recursive: true });
    writeFileSync(join(opsDir, 'op-001.md'), '# op-001：t\n\n- [ ] 待补充\n', 'utf-8');
    writeFileSync(join(opsDir, 'op-002.md'), '# op-002：t\n\n- [x] ok\n', 'utf-8');

    const d = await doc(['flow', 'ops', 'list', '--json']);
    expect(Object.keys(d)).toEqual(['schemaVersion', 'ops']);
    const ops = d.ops as Array<Record<string, unknown>>;
    expect(ops).toHaveLength(2);
    for (const o of ops) {
      expect(Object.keys(o)).toEqual(['stage', 'opId', 'title', 'state', 'fill', 'warning']);
      if (o.fill === 'empty') {
        expect(typeof o.warning).toBe('string');
      } else {
        expect(o.warning).toBeNull();
      }
    }
    expect(ops.some((o) => o.fill === 'empty')).toBe(true);
  });

  // ── 8~11：flow archive* / health ──

  it('#8 flow archive：成功顶层键序冻结', async () => {
    seedArchivable();
    const d = await doc(['flow', 'archive', 'v1.9.0', '--json']);
    expect(Object.keys(d)).toEqual(['schemaVersion', 'version', 'stages', 'reviews', 'log', 'dryRun']);
    expect(d.dryRun).toBe(false);
  });

  it('#9 flow archive list：顶层与元素键序冻结', async () => {
    seedArchivable();
    await safeParse(['flow', 'archive', 'v1.9.0', '--json']);
    const d = await doc(['flow', 'archive', 'list', '--json']);
    expect(Object.keys(d)).toEqual(['schemaVersion', 'versions']);
    const rows = d.versions as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0])).toEqual(['version', 'counts']);
    expect(Object.keys(rows[0].counts as object)).toEqual(['stages', 'reviews', 'log']);
  });

  it('#10 flow archive show：首键重定位（G-1）且其余相对序不变', async () => {
    seedArchivable();
    await safeParse(['flow', 'archive', 'v1.9.0', '--json']);
    const raw = await capture(['flow', 'archive', 'show', 'v1.9.0', '--json']);
    const d = JSON.parse(raw) as Record<string, unknown>;
    expect(Object.keys(d)).toEqual([
      'schemaVersion', 'version', 'stages', 'reviews', 'log', 'counts', 'archived_at',
    ]);
    expect(d.schemaVersion).toBe(1);
    expect(typeof d.archived_at).toBe('string');
  });

  it('#11 flow health：reconciled 恒在（无 --fix 为 null）', async () => {
    const d = await doc(['flow', 'health', '--json']);
    expect(Object.keys(d)).toEqual(['schemaVersion', 'ok', 'items', 'reconciled']);
    expect(d.reconciled).toBeNull();
  });

  // ── 12~16：req 出口 ──

  it('#12 req list：requirements 元素为 RequirementData（可选字段不注入）', async () => {
    seedRequirements([reqRow('REQ-001'), reqRow('REQ-002', { priority: 'P0' })]);
    const d = await doc(['req', 'list', '--json']);
    expect(Object.keys(d)).toEqual(['schemaVersion', 'requirements']);
    const rows = d.requirements as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);
    // 读侧宽容不注入：未设置的 target_version / owner 等键不出现
    expect('target_version' in rows[0]).toBe(false);
    expect('owner' in rows[0]).toBe(false);
    expect(rows[1].priority).toBe('P0');
  });

  it('#13 req show：parent 恒在、可空；stages/children 为数组', async () => {
    seedRequirements([reqRow('REQ-001')]);
    const d = await doc(['req', 'show', 'REQ-001', '--json']);
    expect(Object.keys(d)).toEqual(['schemaVersion', 'requirement', 'stages', 'parent', 'children']);
    expect(d.parent).toBeNull();
    expect(Array.isArray(d.stages)).toBe(true);
    expect(Array.isArray(d.children)).toBe(true);
  });

  it('#14 req split：顶层键序冻结', async () => {
    seedRequirements([reqRow('REQ-001')]);
    const d = await doc(['req', 'split', 'REQ-001', '--into', 'A', '--into', 'B', '--json']);
    expect(Object.keys(d)).toEqual(['schemaVersion', 'parent', 'children']);
    expect(d.parent).toBe('REQ-001');
    expect(d.children).toHaveLength(2);
  });

  it('#15 req board：groups 键序 = REQ_STATUSES（7 值）', async () => {
    seedRequirements([reqRow('REQ-001')]);
    const d = await doc(['req', 'board', '--json']);
    expect(Object.keys(d)).toEqual(['schemaVersion', 'groups']);
    expect(Object.keys(d.groups as object)).toEqual([...REQ_STATUSES]);
  });

  it('#16 req next：candidates 为条件出现键（仅 limit>1）', async () => {
    seedRequirements([
      reqRow('REQ-001', { status: 'scheduled', target_version: 'v1.3.0' }),
      reqRow('REQ-002', { status: 'scheduled', target_version: 'v1.3.0' }),
      reqRow('REQ-003', { status: 'scheduled', target_version: 'v1.4.0' }),
    ]);
    // 缺省 / 显式 limit 1 → 两键（无 candidates）
    for (const args of [['req', 'next', '--json'], ['req', 'next', '--limit', '1', '--json']]) {
      const d = await doc(args);
      expect(Object.keys(d)).toEqual(['schemaVersion', 'requirement']);
    }
    // limit 2 → 三键（candidates 末尾追加）
    const d2 = await doc(['req', 'next', '--limit', '2', '--json']);
    expect(Object.keys(d2)).toEqual(['schemaVersion', 'requirement', 'candidates']);
    expect(d2.candidates).toHaveLength(2);
  });

  // ── 17~18：instructions / setup --check ──

  it('#17 instructions：schemaVersion 首键 + 既有 9 键相对序不变（C1）', async () => {
    const d = await doc(['instructions', 'proposal', '--change', 'feat-x', '--json']);
    expect(Object.keys(d)).toEqual([
      'schemaVersion', 'artifact', 'task', 'project_context', 'rules',
      'dependencies', 'output', 'instruction', 'template', 'unlocks',
    ]);
  });

  it('#18 setup --check：顶层键序冻结', async () => {
    const d = await doc(['setup', '--check', '--json']);
    expect(Object.keys(d)).toEqual(['schemaVersion', 'status', 'cliVersion', 'deployedVersion']);
    expect(typeof d.status).toBe('string');
    process.exitCode = 0;
  });

  // ── 19：flow next（stage-96 op-001；第 19 个成功出口） ──

  it('#19 flow next：无活跃阶段（初始化占位 - / 显式空串）12 键固定序 + 全 null 空态', async () => {
    const NEXT_KEYS = [
      'schemaVersion', 'stage', 'phase', 'phaseLabel', 'responsibleAgent', 'workflowMode',
      'reviewTier', 'effectiveReviewTier', 'legalNextPhases', 'suggestedCommand', 'guards', 'blockingReviews',
    ];
    // initProject 默认 pipeline.current.stage = '-'（原样输出）
    const d = await docNext();
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
    expect(d.blockingReviews).toEqual([]);

    // 显式置空串 → stage=null，其余同上
    const mgr = new FlowManager(tmpDir);
    mgr.getData()!.pipeline.current.stage = '';
    mgr.save();
    const d2 = await docNext();
    expect(Object.keys(d2)).toEqual(NEXT_KEYS);
    expect(d2.stage).toBeNull();
    expect(d2.phase).toBeNull();
    expect(d2.phaseLabel).toBeNull();
    expect(d2.responsibleAgent).toBe('feel');
    expect(d2.workflowMode).toBeNull();
    expect(d2.reviewTier).toBeNull();
    expect(d2.effectiveReviewTier).toBeNull();
    expect(d2.legalNextPhases).toEqual([]);
    expect(d2.suggestedCommand).toBeNull();
    expect(d2.guards).toHaveLength(1);
    expect(d2.blockingReviews).toEqual([]);
  });

  it('#19 flow next：活跃阶段（内置默认 fast）→ lean/full 档位差 + 建议命令精确匹配', async () => {
    const mgr = new FlowManager(tmpDir);
    mgr.addStage('v1.2.2-stage-96');
    mgr.save();
    const d = await docNext();
    expect(Object.keys(d)).toEqual([
      'schemaVersion', 'stage', 'phase', 'phaseLabel', 'responsibleAgent', 'workflowMode',
      'reviewTier', 'effectiveReviewTier', 'legalNextPhases', 'suggestedCommand', 'guards', 'blockingReviews',
    ]);
    expect(d.stage).toBe('v1.2.2-stage-96');
    expect(d.phase).toBe('plan_pending');
    expect(d.responsibleAgent).toBe('openfeel-planner');
    expect(d.workflowMode).toBe('fast');
    expect(d.reviewTier).toBe('lean');
    expect(d.effectiveReviewTier).toBe('full');
    expect(d.legalNextPhases).toEqual(['plan_review']);
    expect(d.suggestedCommand).toBe('openfeel flow advance --stage v1.2.2-stage-96 --to plan_review');
    expect(d.guards).toHaveLength(1);
    expect((d.guards as string[])[0]).toContain('lean');
    expect(d.blockingReviews).toEqual([]);
  });

  it('#19 flow next：full 模式 → 双合法目标 / reviewTier=full / guards=[]', async () => {
    const mgr = new FlowManager(tmpDir);
    mgr.addStage('v1.2.2-stage-96');
    mgr.save();
    setConfigValue(tmpDir, 'workflow_mode', 'full');
    const d = await docNext();
    expect(d.workflowMode).toBe('full');
    expect(d.reviewTier).toBe('full');
    expect(d.effectiveReviewTier).toBe('full');
    expect(d.legalNextPhases).toEqual(['plan_review', 'plan_passed']);
    expect(d.guards).toEqual([]);
  });

  // ── legacy 失败形态（errorKind 归 op-002，不在此断言） ──

  it('legacy：flow archive 未初始化 → {schemaVersion,error:string,errorKind}', async () => {
    cwdMock.mockReturnValue(uninitDir);
    const d = await doc(['flow', 'archive', 'v9.9.9', '--json']);
    // stage-95 op-002：errorKind 仅追加于末尾（error 恒 string、既有键序不变）
    expect(Object.keys(d)).toEqual(['schemaVersion', 'error', 'errorKind']);
    expect(typeof d.error).toBe('string');
    expect(d.error).toBe('no-init');
    expect(d.errorKind).toBe('refusal');
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
  });

  it('legacy：flow archive show 不存在 → error 为 string 且既有键序不变', async () => {
    const d = await doc(['flow', 'archive', 'show', 'v9.9.9', '--json']);
    expect(typeof d.error).toBe('string');
    expect(Object.keys(d)).toEqual(['schemaVersion', 'error', 'version', 'available', 'errorKind']);
    expect(d.errorKind).toBe('refusal');
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
  });
});

// ── stage-95 op-003：--version --json（T4） ──

describe('stage-95 op-003 --version --json', () => {
  const require = createRequire(import.meta.url);
  const pkg = require('../../package.json') as { version: string };

  let logMock: ReturnType<typeof vi.fn>;
  let parseSpy: ReturnType<typeof vi.spyOn>;
  let prevArgv: string[];
  let prevExitCode: number | string | undefined;

  beforeEach(() => {
    // 防运行日志写真实用户目录（隔离旁路）；清空会话 env 防续接解析
    vi.stubEnv('OPENFEEL_LOG', '0');
    vi.stubEnv('CLAUDE_CODE_SESSION_ID', '');
    prevArgv = process.argv;
    prevExitCode = process.exitCode;
    process.exitCode = 0;
    logMock = vi.spyOn(console, 'log').mockImplementation(() => {});
    parseSpy = vi.spyOn(rootProgram, 'parse').mockImplementation(() => rootProgram);
    resetJsonModeForTest();
  });

  afterEach(() => {
    process.argv = prevArgv;
    process.exitCode = prevExitCode;
    logMock.mockRestore();
    parseSpy.mockRestore();
    resetJsonModeForTest();
    vi.unstubAllEnvs();
  });

  /** 执行 runCli 并返回 stdout 文本 */
  function runAndCapture(argv: string[]): string {
    process.argv = ['node', 'openfeel', ...argv];
    logMock.mockClear();
    runCli();
    return logMock.mock.calls.map((c) => c[0] as string).join('\n');
  }

  it('--version --json：三键单文档，且不进入 Commander', () => {
    const raw = runAndCapture(['--version', '--json']);
    expect(parseSpy).not.toHaveBeenCalled();
    const doc = JSON.parse(raw) as Record<string, unknown>;
    expect(Object.keys(doc)).toEqual(['schemaVersion', 'version', 'node']);
    expect(doc.schemaVersion).toBe(1);
    expect(doc.version).toBe(pkg.version);
    expect(doc.node).toBe(process.version);
    expect(process.exitCode).toBe(0);
  });

  it('-v --json：同形态', () => {
    const raw = runAndCapture(['-v', '--json']);
    expect(parseSpy).not.toHaveBeenCalled();
    const doc = JSON.parse(raw) as Record<string, unknown>;
    expect(Object.keys(doc)).toEqual(['schemaVersion', 'version', 'node']);
    expect(doc.version).toBe(pkg.version);
    expect(doc.node).toBe(process.version);
  });

  it('--version 纯文本：Commander 原生输出保持（无 JSON）', () => {
    const chunks: string[] = [];
    const writeSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(((chunk: unknown) => {
        chunks.push(String(chunk));
        return true;
      }) as never);
    const fresh = new Command();
    fresh.exitOverride();
    fresh.version(pkg.version, '-v, --version');
    try {
      fresh.parse(['--version'], { from: 'user' });
    } catch (err) {
      // exitOverride：--version 以 CommanderError(exitCode 0) 结束
      expect(err).toBeInstanceOf(CommanderError);
    }
    writeSpy.mockRestore();
    expect(chunks.join('').trim()).toBe(pkg.version);
    expect(chunks.join('')).not.toContain('schemaVersion');
  });
});
