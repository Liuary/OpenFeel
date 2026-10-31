/**
 * 33 出口 JSON 契约可执行冻结（v1.2.2-stage-95 op-001；stage-96 op-001 新增第 19 出口 flow next；
 * stage-97 op-004 扩展第 20~33 出口）
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
import { registerStageCommand } from '../../src/commands/stage.js';
import { registerKnowledgeCommand } from '../../src/commands/knowledge.js';
import { registerConfigCommand } from '../../src/commands/config.js';
import { registerViewCommand } from '../../src/commands/view.js';
import { registerPlanCommand } from '../../src/commands/plan.js';
import { registerProjectCommand } from '../../src/commands/project.js';
import { registerArchiveCommand } from '../../src/commands/archive.js';
import { registerModelCommand } from '../../src/commands/model.js';
import { registerLintCommand } from '../../src/commands/lint.js';
import { registerRoadmapCommand } from '../../src/commands/roadmap.js';
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

describe('33 出口 JSON 契约冻结（stage-95 op-001 / stage-96 / stage-97）', () => {
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
    registerStageCommand(program);
    registerKnowledgeCommand(program);
    registerConfigCommand(program);
    registerViewCommand(program);
    registerPlanCommand(program);
    registerProjectCommand(program);
    registerArchiveCommand(program);
    registerModelCommand(program);
    registerLintCommand(program);
    registerRoadmapCommand(program);

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

  /** 写入 status.md 夹具（字段 7 项 + 任务两项 + 空阻塞段） */
  function writeStatusFixture(stageId: string): void {
    const dir = join(tmpDir, '.openfeel', 'plan', 'v1', 'stage-97');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'status.md'),
      [
        '# 阶段状态',
        '',
        '- **执行模式**：auto',
        '- **自动推进**：enabled',
        '- **状态**：exec_running',
        '- **当前责任 Agent**：openfeel-executor',
        '- **上一责任 Agent**：openfeel-schemer',
        '- **更新时间**：2026-10-17T00:00:00.000Z',
        '- **工作模式**：full',
        '',
        '## 任务',
        '',
        '- [ ] 任务1：待补充',
        '- [x] 任务2：已完成',
        '',
        '## 阻塞 / 暂停原因',
        '',
        '无',
        '',
      ].join('\n'),
      'utf-8',
    );
    // stageId 仅用于调用方语义表达；目录名固定 stage-97
    void stageId;
  }

  /** 写入知识条目（kb/{category}.md，格式与 parseEntryFile 同源） */
  function seedKbEntry(category: string, title: string, date: string, content: string): void {
    const kbDir = join(tmpDir, '.openfeel', 'kb');
    mkdirSync(kbDir, { recursive: true });
    writeFileSync(
      join(kbDir, `${category}.md`),
      `# ${category}\n\n## [+] ${title} (${date})\n\n${content}\n`,
      'utf-8',
    );
  }

  /** 写入全局 profile（隔离 HOME 下） */
  function seedGlobalProfile(yaml: string): void {
    const dir = join(mockHome.dir, '.config', 'openfeel');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'profile.yaml'), yaml, 'utf-8');
  }

  /** 写入审查条目（flow.json reviews） */
  function seedReviews(rows: FlowData['reviews']): void {
    const mgr = new FlowManager(tmpDir);
    const data = mgr.getData()!;
    data.reviews = rows;
    mgr.setData(data);
    mgr.save();
  }

  /** 失败路径：直接 parse 失败 envelope 须显式置位 isJsonMode（finally 复位） */
  async function docFailure(args: string[]): Promise<Record<string, unknown>> {
    setJsonMode(true);
    try {
      return await doc(args);
    } finally {
      resetJsonModeForTest();
    }
  }


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
    expect(Object.keys(d)).toEqual([
      'schemaVersion', 'version', 'stages', 'reviews', 'log', 'dryRun',
      'eligible', 'unfinishedStages', 'blockingReviews',
    ]);
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

  it('#12 req list：requirements 元素为 RequirementData + 末位 linkedStages/progress', async () => {
    seedRequirements([reqRow('REQ-001'), reqRow('REQ-002', { priority: 'P0' })]);
    // 关联阶段：stage-97 的 requirement_id 指向 REQ-001（linkedStages 单点派生）
    const mgr = new FlowManager(tmpDir);
    mgr.addStage('v1.2.2-stage-97');
    mgr.getData()!.stages['v1.2.2-stage-97'].requirement_id = 'REQ-001';
    mgr.getData()!.stages['v1.2.2-stage-97'].phase = 'exec_running';
    mgr.save();

    const d = await doc(['req', 'list', '--json']);
    expect(Object.keys(d)).toEqual(['schemaVersion', 'requirements']);
    const rows = d.requirements as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);
    // 读侧宽容不注入：未设置的 target_version / owner 等键不出现
    expect('target_version' in rows[0]).toBe(false);
    expect('owner' in rows[0]).toBe(false);
    expect(rows[1].priority).toBe('P0');
    // stage-97 增量：既有 RequirementData 键序不变，两键恒为末位
    for (const row of rows) {
      expect(Object.keys(row).slice(-2)).toEqual(['linkedStages', 'progress']);
      expect(Object.keys(row.progress as object)).toEqual(['done', 'total']);
      for (const l of row.linkedStages as Array<Record<string, unknown>>) {
        expect(Object.keys(l)).toEqual(['id', 'phase']);
      }
    }
    expect(rows[0].linkedStages).toEqual([{ id: 'v1.2.2-stage-97', phase: 'exec_running' }]);
    expect(rows[0].progress).toEqual({ done: 0, total: 1 });
    expect(rows[1].linkedStages).toEqual([]);
    expect(rows[1].progress).toEqual({ done: 0, total: 0 });
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

  // ── 20~33：stage-97 读命令与 archive <stage> 新出口 ──

  it('#20 stage status：单阶段 6 键 + fields 7 规范键 + tasks 三元组；无参 3 键', async () => {
    writeStatusFixture('v1.2.2-stage-97');
    // 注册阶段 → 无参列表的 stageId 经 planDirToStageId 回查为全名
    const mgr = new FlowManager(tmpDir);
    mgr.addStage('v1.2.2-stage-97');
    mgr.save();

    const single = await doc(['stage', 'status', 'v1.2.2-stage-97', '--json']);
    expect(Object.keys(single)).toEqual(['schemaVersion', 'stageId', 'statusPath', 'fields', 'tasks', 'blockedBy']);
    expect(single.stageId).toBe('v1.2.2-stage-97');
    expect(String(single.statusPath).startsWith(tmpDir)).toBe(true);
    expect(Object.keys(single.fields as object)).toEqual([
      'execMode', 'autoAdvance', 'status', 'reviewAgent', 'previousReviewAgent', 'updatedAt', 'workflowMode', 'raw',
    ]);
    const tasks = single.tasks as Array<Record<string, unknown>>;
    expect(tasks).toHaveLength(2);
    for (const t of tasks) {
      expect(Object.keys(t)).toEqual(['number', 'done', 'description']);
    }
    expect(tasks[1].done).toBe(true);
    expect(single.blockedBy).toBeNull();

    const list = await doc(['stage', 'status', '--json']);
    expect(Object.keys(list)).toEqual(['schemaVersion', 'stages', 'count']);
    expect(list.count).toBe(1);
    const rows = list.stages as Array<Record<string, unknown>>;
    expect(Object.keys(rows[0])).toEqual(['stageId', 'status', 'statusPath']);
    expect(String(rows[0].statusPath).startsWith(tmpDir)).toBe(true);
  });

  it('#20b stage status：阶段未找到 → STAGE_NOT_FOUND/refusal/1', async () => {
    const d = await docFailure(['stage', 'status', 'v9.9.9-stage-99', '--json']);
    const err = d.error as Record<string, unknown>;
    expect(Object.keys(d)).toEqual(['schemaVersion', 'error']);
    expect(err.code).toBe('STAGE_NOT_FOUND');
    expect(err.kind).toBe('refusal');
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
  });

  it('#21 flow recover：已初始化 7 键；未初始化 initialized:false 空值（exit 0）', async () => {
    const d = await doc(['flow', 'recover', '--json']);
    expect(Object.keys(d)).toEqual([
      'schemaVersion', 'initialized', 'phase', 'currentOp', 'stageStatus', 'blockedBy', 'pendingTasks', 'stageStats',
    ]);
    expect(d.initialized).toBe(true);
    expect(Array.isArray(d.pendingTasks)).toBe(true);
    expect(typeof d.stageStats).toBe('object');
    expect(process.exitCode).toBe(0);

    cwdMock.mockReturnValue(uninitDir);
    const d2 = await doc(['flow', 'recover', '--json']);
    expect(Object.keys(d2)).toEqual([
      'schemaVersion', 'initialized', 'phase', 'currentOp', 'stageStatus', 'blockedBy', 'pendingTasks', 'stageStats',
    ]);
    expect(d2.initialized).toBe(false);
    expect(d2.phase).toBeNull();
    expect(d2.currentOp).toBeNull();
    expect(d2.stageStatus).toBeNull();
    expect(d2.blockedBy).toBeNull();
    expect(d2.pendingTasks).toEqual([]);
    expect(d2.stageStats).toEqual({});
    expect(process.exitCode).toBe(0);
  });

  it('#22 flow checkpoint list：4 键；未初始化与空集合同形 checkpoints:[]', async () => {
    const d = await doc(['flow', 'checkpoint', 'list', '--json']);
    expect(Object.keys(d)).toEqual(['schemaVersion', 'stage', 'checkpoints', 'count']);
    expect(d.stage).toBeNull();
    expect(d.checkpoints).toEqual([]);
    expect(d.count).toBe(0);

    cwdMock.mockReturnValue(uninitDir);
    const d2 = await doc(['flow', 'checkpoint', 'list', 'v1.2.2-stage-97', '--json']);
    expect(Object.keys(d2)).toEqual(['schemaVersion', 'stage', 'checkpoints', 'count']);
    expect(d2.stage).toBe('v1.2.2-stage-97');
    expect(d2.checkpoints).toEqual([]);
    expect(d2.count).toBe(0);
  });

  it('#23 knowledge search：5 键 + results 6 键；空结果 []', async () => {
    seedKbEntry('patterns', '固定条目', '2026-01-01', '固定内容');
    const d = await doc(['knowledge', 'search', '固定', '--json']);
    expect(Object.keys(d)).toEqual(['schemaVersion', 'query', 'limit', 'offset', 'results']);
    expect(d.query).toBe('固定');
    expect(d.limit).toBe(10);
    expect(d.offset).toBe(0);
    const results = d.results as Array<Record<string, unknown>>;
    expect(results).toHaveLength(1);
    expect(Object.keys(results[0])).toEqual(['title', 'category', 'date', 'enabled', 'content', 'summary']);
    expect(results[0].enabled).toBe(true);
    expect(typeof results[0].summary).toBe('string');

    const empty = await doc(['knowledge', 'search', '不存在关键词zzz', '--json']);
    expect(Object.keys(empty)).toEqual(['schemaVersion', 'query', 'limit', 'offset', 'results']);
    expect(empty.results).toEqual([]);
  });

  it('#24 knowledge list：entries 4 键且不含 content；空态 []', async () => {
    seedKbEntry('patterns', '固定条目', '2026-01-01', '固定内容');
    const d = await doc(['knowledge', 'list', '--json']);
    expect(Object.keys(d)).toEqual(['schemaVersion', 'entries', 'count']);
    const entries = d.entries as Array<Record<string, unknown>>;
    expect(entries).toHaveLength(1);
    expect(Object.keys(entries[0])).toEqual(['title', 'category', 'date', 'enabled']);
    expect('content' in entries[0]).toBe(false);

    const empty = await doc(['knowledge', 'list', '--type', 'setup', '--json']);
    expect(empty.entries).toEqual([]);
    expect(empty.count).toBe(0);
  });

  it('#25 knowledge index：3 键 + categories/recentUpdates 元素形态', async () => {
    const d = await doc(['knowledge', 'index', '--json']);
    expect(Object.keys(d)).toEqual(['schemaVersion', 'categories', 'recentUpdates']);
    for (const c of d.categories as Array<Record<string, unknown>>) {
      expect(Object.keys(c)).toEqual(['name', 'description']);
    }
    for (const u of d.recentUpdates as Array<Record<string, unknown>>) {
      expect(Object.keys(u)).toEqual(['date', 'category', 'title']);
    }
  });

  it('#26 knowledge dedup：6 键；有匹配 flagged / 无匹配 found:false', async () => {
    seedKbEntry('patterns', '固定条目', '2026-01-01', '固定内容');
    const d = await doc(['knowledge', 'dedup', '固定内容', '--json']);
    expect(Object.keys(d)).toEqual(['schemaVersion', 'threshold', 'categories', 'found', 'readOnly', 'matches']);
    expect(d.threshold).toBe(0.8);
    expect(d.readOnly).toBe(true);
    expect(d.found).toBe(true);
    const matches = d.matches as Array<Record<string, unknown>>;
    expect(matches.length).toBeGreaterThan(0);
    expect(Object.keys(matches[0])).toEqual(['category', 'title', 'date', 'enabled', 'similarity', 'flagged']);
    expect(matches[0].flagged).toBe(true);

    const none = await doc(['knowledge', 'dedup', '完全无关的量子纠缠话题zzz', '--json']);
    expect(none.found).toBe(false);
    expect(none.matches).toEqual([]);
    expect(none.readOnly).toBe(true);
  });

  it('#27 config get：项目 scope,key,value；全局无 key scope,values；全局有 key 同项目形态', async () => {
    const project = await doc(['config', 'get', 'auto_advance', '--json']);
    expect(Object.keys(project)).toEqual(['schemaVersion', 'scope', 'key', 'value']);
    expect(project.scope).toBe('project');
    expect(project.key).toBe('auto_advance');

    seedGlobalProfile('user:\n  name: tester\npreferences:\n  auto_advance: enabled\n');
    const globalAll = await doc(['config', 'get', '--global', '--json']);
    expect(Object.keys(globalAll)).toEqual(['schemaVersion', 'scope', 'values']);
    expect(globalAll.scope).toBe('global');
    const values = globalAll.values as Record<string, unknown>;
    expect(Object.keys(values)).toEqual([
      'user.name', 'user.lang', 'preferences.auto_advance',
      'preferences.review_mode', 'preferences.communication', 'preferences.confirm_threshold',
    ]);
    expect(values['user.name']).toBe('tester');
    // 缺失字段经 DEFAULT_PROFILE 回填；人类显示同值（JSON null 仅用于 undefined）
    expect(values['preferences.review_mode']).toBe('full');

    const globalKey = await doc(['config', 'get', 'user.name', '--global', '--json']);
    expect(Object.keys(globalKey)).toEqual(['schemaVersion', 'scope', 'key', 'value']);
    expect(globalKey.scope).toBe('global');
    expect(globalKey.key).toBe('user.name');
    expect(globalKey.value).toBe('tester');
  });

  it('#27b config get 项目无 key → INVALID_ARGUMENT/refusal/1', async () => {
    const d = await docFailure(['config', 'get', '--json']);
    const err = d.error as Record<string, unknown>;
    expect(err.code).toBe('INVALID_ARGUMENT');
    expect(err.kind).toBe('refusal');
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
  });

  it('#28 config effective：无 key effective 映射；有 key key,value,source', async () => {
    const all = await doc(['config', 'effective', '--json']);
    expect(Object.keys(all)).toEqual(['schemaVersion', 'effective']);
    expect(Object.keys(all.effective as object)).toEqual([
      'execution_mode', 'auto_advance', 'merge_mode', 'workflow_mode',
    ]);

    const one = await doc(['config', 'effective', 'auto_advance', '--json']);
    expect(Object.keys(one)).toEqual(['schemaVersion', 'key', 'value', 'source']);
    expect(one.key).toBe('auto_advance');
    expect(typeof one.source).toBe('string');
  });

  it('#29 view list：3 键 + reviews 10 键（blocking 缺省 true / false）', async () => {
    seedReviews([
      {
        id: 'REV-A', op: 'v1.2.2-stage-97.op-001', title: 'a', status: 'open', blocking: true,
        priority: 'high', filed_by: 'openfeel-reviewer', filed_at: '2026-01-02T00:00:00Z',
      },
      {
        id: 'REV-B', op: 'v1.2.2-stage-97.op-002', title: 'b', status: 'open', blocking: false,
        canAutoFix: true, priority: 'low', filed_by: 'openfeel-feel-tester', filed_at: '2026-01-01T00:00:00Z',
      },
    ]);
    const d = await doc(['view', 'list', '--json']);
    expect(Object.keys(d)).toEqual(['schemaVersion', 'count', 'reviews']);
    expect(d.count).toBe(2);
    const reviews = d.reviews as Array<Record<string, unknown>>;
    for (const r of reviews) {
      expect(Object.keys(r)).toEqual([
        'id', 'op', 'status', 'priority', 'title', 'filed_by', 'filed_at',
        'blocking', 'canAutoFix', 'autoFixDetail',
      ]);
      expect(typeof r.autoFixDetail === 'string' || r.autoFixDetail === null).toBe(true);
    }
    // filed_at 降序：REV-A 在前
    expect(reviews[0].id).toBe('REV-A');
    expect(reviews[0].blocking).toBe(true);
    expect(reviews[0].canAutoFix).toBe(false);
    expect(reviews[1].blocking).toBe(false);
    expect(reviews[1].canAutoFix).toBe(true);
    expect(reviews[1].filed_by).toBe('openfeel-feel-tester');

    // 空态
    const mgr = new FlowManager(tmpDir);
    mgr.getData()!.reviews = [];
    mgr.save();
    const empty = await doc(['view', 'list', '--json']);
    expect(empty.count).toBe(0);
    expect(empty.reviews).toEqual([]);
  });

  it('#30 plan scheme list：4 键 + schemes 6 键（draft / fill）', async () => {
    const opsDir = join(tmpDir, '.openfeel', 'plan', 'v1', 'stage-97', 'ops');
    mkdirSync(opsDir, { recursive: true });
    writeFileSync(join(opsDir, 'op-001.md'), '# op-001：draft op\n\n- [ ] 待补充\n', 'utf-8');
    writeFileSync(join(opsDir, 'op-002.md'), '# op-002：filled op\n\n- [x] 已完成\n', 'utf-8');
    const mgr = new FlowManager(tmpDir);
    mgr.addStage('v1.2.2-stage-97');
    mgr.getData()!.stages['v1.2.2-stage-97'].ops = { 'op-001': { title: 't', state: 'draft' } } as never;
    mgr.save();

    const d = await doc(['plan', 'scheme', 'list', '--json']);
    expect(Object.keys(d)).toEqual(['schemaVersion', 'stage', 'count', 'schemes']);
    expect(d.stage).toBeNull();
    expect(d.count).toBe(2);
    const schemes = d.schemes as Array<Record<string, unknown>>;
    for (const s of schemes) {
      expect(Object.keys(s)).toEqual(['stage', 'opId', 'title', 'filePath', 'draft', 'fill']);
      expect(String(s.filePath).startsWith('.openfeel/plan/v1/stage-97/ops/')).toBe(true);
      expect(['empty', 'partial', 'filled']).toContain(s.fill);
    }
    const draftRow = schemes.find((s) => s.opId === 'op-001')!;
    expect(draftRow.draft).toBe(true);
    expect(schemes.find((s) => s.opId === 'op-002')!.draft).toBe(false);

    const empty = await doc(['plan', 'scheme', 'list', 'stage-99', '--json']);
    expect(empty.stage).toBe('stage-99');
    expect(empty.count).toBe(0);
    expect(empty.schemes).toEqual([]);
  });

  it('#31 flow log：3 键 + entries 4 键（time 原始 ISO / agent 归一化）', async () => {
    const mgr = new FlowManager(tmpDir);
    const data = mgr.getData()!;
    data.log = [
      { time: '2026-01-01T00:00:00.000Z', agent: 'executor', action: 'act', detail: { k: 'v' } },
    ];
    mgr.setData(data);
    mgr.save();

    const d = await doc(['flow', 'log', '--json']);
    expect(Object.keys(d)).toEqual(['schemaVersion', 'count', 'entries']);
    expect(d.count).toBe(1);
    const entries = d.entries as Array<Record<string, unknown>>;
    expect(Object.keys(entries[0])).toEqual(['time', 'agent', 'action', 'detail']);
    expect(entries[0].time).toBe('2026-01-01T00:00:00.000Z');
    expect(entries[0].agent).toBe('openfeel-executor');

    cwdMock.mockReturnValue(uninitDir);
    const d2 = await doc(['flow', 'log', '--json']);
    expect(d2.count).toBe(0);
    expect(d2.entries).toEqual([]);
  });

  it('#32 project overview：5 段冻结键（src 不存在 → null；存在 → number）', async () => {
    const d = await doc(['project', 'overview', '--json']);
    expect(Object.keys(d)).toEqual(['schemaVersion', 'project', 'dirs', 'stats', 'entries', 'techStack']);
    expect(Object.keys(d.project as object)).toEqual(['name', 'version', 'description']);
    const dirs = d.dirs as Record<string, Record<string, unknown>>;
    expect(Object.keys(dirs)).toEqual(['src', 'opencode', 'openfeel']);
    expect(Object.keys(dirs.src)).toEqual(['exists', 'cli', 'commands', 'core', 'utils']);
    expect(Object.keys(dirs.opencode)).toEqual(['exists', 'agents', 'skills']);
    expect(Object.keys(dirs.openfeel)).toEqual(['exists', 'kb', 'plan', 'codeReview', 'bugs']);
    expect(dirs.src.exists).toBe(false);
    expect(dirs.src.cli).toBeNull();
    expect(Object.keys(d.stats as object)).toEqual([
      'tsSourceFiles', 'agentDefs', 'cliModules', 'kbEntries', 'planVersions',
    ]);
    expect(Object.keys(d.entries as object)).toEqual(['available', 'cli', 'pkg', 'build']);
    expect((d.entries as Record<string, unknown>).available).toBe(false);
    expect(Object.keys(d.techStack as object)).toEqual([
      'runtime', 'language', 'cliFramework', 'validation', 'config', 'fileMatch', 'test',
    ]);

    // src 存在 → exists true、子项为 number
    mkdirSync(join(tmpDir, 'src', 'cli'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'cli', 'index.ts'), 'export {};\n', 'utf-8');
    const d2 = await doc(['project', 'overview', '--json']);
    const dirs2 = d2.dirs as Record<string, Record<string, unknown>>;
    expect(dirs2.src.exists).toBe(true);
    expect(typeof dirs2.src.cli).toBe('number');
    expect((d2.entries as Record<string, unknown>).available).toBe(true);
  });

  it('#33 archive <stage>：6 键；阶段不存在 → ARCHIVE_FAILED/refusal/1', async () => {
    const mgr = new FlowManager(tmpDir);
    mgr.addStage('v1.2.2-stage-97');
    mgr.getData()!.stages['v1.2.2-stage-97'].ops = {
      'op-001': { title: 't1', state: 'done' },
    } as never;
    mgr.getData()!.reviews = [
      {
        id: 'REV-001', op: 'v1.2.2-stage-97.op-001', title: 'k', status: 'closed',
        priority: 'high', filed_by: 'openfeel-reviewer', filed_at: '2026-01-01T00:00:00Z',
      },
    ];
    mgr.save();

    const d = await doc(['archive', 'v1.2.2-stage-97', '--json']);
    expect(Object.keys(d)).toEqual([
      'schemaVersion', 'stage', 'archivePath', 'opsCount', 'reviewsCount', 'knowledgeExtracts',
    ]);
    expect(d.stage).toBe('v1.2.2-stage-97');
    expect(String(d.archivePath).startsWith(tmpDir)).toBe(true);
    expect(d.opsCount).toBe(1);
    expect(d.reviewsCount).toBe(1);
    expect(d.knowledgeExtracts).toEqual(['[REV-001] k']);
    expect(process.exitCode).toBe(0);

    // v1.2.4 A1：已有归档 + 无 --force → ARCHIVE_EXISTS/refusal/1，归档内容逐字不变
    const archivePath = String(d.archivePath);
    const archiveBefore = readFileSync(archivePath, 'utf-8');
    const exists = await docFailure(['archive', 'v1.2.2-stage-97', '--json']);
    const existsErr = exists.error as Record<string, unknown>;
    expect(existsErr.code).toBe('ARCHIVE_EXISTS');
    expect(existsErr.kind).toBe('refusal');
    expect(existsErr.detail).toEqual({ stage: 'v1.2.2-stage-97', archivePath });
    expect(readFileSync(archivePath, 'utf-8')).toBe(archiveBefore);
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;

    const fail = await docFailure(['archive', 'stage-99', '--json']);
    const err = fail.error as Record<string, unknown>;
    expect(err.code).toBe('ARCHIVE_FAILED');
    expect(err.kind).toBe('refusal');
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
  });

  // ── v1.2.4 A2~A5：新增出口 #34~#40 ──

  it('#34 plan stage list：注册阶段调度视图（7 键元素 + count）', async () => {
    const mgr = new FlowManager(tmpDir);
    mgr.addStage('v1.2.4-stage-100');
    mgr.getData()!.stages['v1.2.4-stage-100'].ops = {
      'op-001': { title: 'a', state: 'done' },
      'op-002': { title: 'b', state: 'pending' },
    } as never;
    mgr.save();

    const d = await doc(['plan', 'stage', 'list', '--json']);
    expect(Object.keys(d)).toEqual(['schemaVersion', 'stages', 'count']);
    const stages = d.stages as Array<Record<string, unknown>>;
    const target = stages.find((s) => s.id === 'v1.2.4-stage-100')!;
    expect(Object.keys(target)).toEqual([
      'id', 'phase', 'status', 'deps', 'workflowMode', 'opsTotal', 'opsDone',
    ]);
    expect(target.deps).toEqual([]);
    expect(target.opsTotal).toBe(2);
    expect(target.opsDone).toBe(1);
    expect(typeof target.workflowMode).toBe('string');
    expect(d.count).toBe(stages.length);
    expect(process.exitCode).toBe(0);

    // 空态：未初始化项目 → stages:[] / count:0 / exit 0
    cwdMock.mockReturnValue(uninitDir);
    const empty = await doc(['plan', 'stage', 'list', '--json']);
    expect(empty.stages).toEqual([]);
    expect(empty.count).toBe(0);
    expect(process.exitCode).toBe(0);
    cwdMock.mockReturnValue(tmpDir);
  });

  it('#35/#36 model list|get：键序、首个 / 切分、source 三层', async () => {
    writeFileSync(join(tmpDir, 'opencode.jsonc'), JSON.stringify({
      agent: { 'openfeel-executor': { model: 'deepseek/deepseek-flash' } },
    }, null, 2) + '\n', 'utf-8');

    const list = await doc(['model', 'list', '--scope', 'project', '--json']);
    expect(Object.keys(list)).toEqual(['schemaVersion', 'scope', 'agents']);
    expect(list.scope).toBe('project');
    const agents = list.agents as Array<Record<string, unknown>>;
    expect(agents.length).toBeGreaterThan(0);
    expect(Object.keys(agents[0])).toEqual(['agent', 'provider', 'model', 'source']);
    const executor = agents.find((a) => a.agent === 'openfeel-executor')!;
    expect(executor).toEqual({
      agent: 'openfeel-executor', provider: 'deepseek', model: 'deepseek-flash', source: 'project',
    });

    const get = await doc(['model', 'get', 'openfeel-executor', '--scope', 'project', '--json']);
    expect(Object.keys(get)).toEqual(['schemaVersion', 'scope', 'agent', 'provider', 'model', 'source']);
    expect(get).toMatchObject({
      scope: 'project', agent: 'openfeel-executor', provider: 'deepseek',
      model: 'deepseek-flash', source: 'project',
    });

    // 未指定 scope → 生效值 + default 层来源（框架默认 frontmatter）
    const eff = await doc(['model', 'get', 'openfeel-executor', '--json']);
    expect(eff.scope).toBeNull();
    expect(eff.agent).toBe('openfeel-executor');
    expect(eff.provider).toBe('deepseek');
    expect(eff.model).toBe('deepseek-flash');
    expect(eff.source).toBe('default');
    expect(process.exitCode).toBe(0);
  });

  it('#37 flow retry：六键 + exhausted 判定', async () => {
    const mgr = new FlowManager(tmpDir);
    mgr.addStage('v1.2.4-stage-100');
    mgr.getData()!.stages['v1.2.4-stage-100'].ops = {
      'op-001': { title: 't', state: 'failed', attempts: 3, max_attempts: 3 },
    } as never;
    mgr.save();

    const d = await doc(['flow', 'retry', '--op', 'v1.2.4-stage-100.op-001', '--json']);
    expect(Object.keys(d)).toEqual(['schemaVersion', 'op', 'attempts', 'maxAttempts', 'exhausted', 'state']);
    expect(d).toMatchObject({
      op: 'v1.2.4-stage-100.op-001', attempts: 3, maxAttempts: 3, exhausted: true, state: 'failed',
    });
    expect(process.exitCode).toBe(0);
  });

  it('#38/#39 lint：结构化 issues、ok:false 仍为成功文档 + exit 1', async () => {
    const kbDir = join(tmpDir, '.openfeel', 'kb');
    rmSync(kbDir, { recursive: true, force: true });

    const okDoc = await doc(['lint', 'kb', '--json']);
    expect(Object.keys(okDoc)).toEqual(['schemaVersion', 'target', 'ok', 'issues']);
    expect(okDoc).toMatchObject({ target: 'kb', ok: true, issues: [] });
    expect(process.exitCode).toBe(0);

    mkdirSync(kbDir, { recursive: true });
    writeFileSync(join(kbDir, 'patterns.md'), '见 [缺失](missing-file.md)\n', 'utf-8');
    const badDoc = await doc(['lint', 'kb', '--json']);
    expect(badDoc).toMatchObject({ target: 'kb', ok: false });
    const issues = badDoc.issues as Array<Record<string, unknown>>;
    expect(Object.keys(issues[0])).toEqual(['path', 'message']);
    expect(issues[0].path).toBe('.openfeel/kb/patterns.md');
    expect(String(issues[0].message)).toContain('missing-file.md');
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;

    // i18n：中英键集合在当前工作区一致 → ok:true / issues:[]
    const i18nDoc = await doc(['lint', 'i18n', '--json']);
    expect(Object.keys(i18nDoc)).toEqual(['schemaVersion', 'target', 'ok', 'issues']);
    expect(i18nDoc.target).toBe('i18n');
    expect(i18nDoc.ok).toBe(true);
    expect(i18nDoc.issues).toEqual([]);
  });

  it('#40 roadmap show：version/milestones 键序、3/4 列兼容、空态与版本不存在', async () => {
    const roadmapDir = join(tmpDir, '.openfeel', 'roadmap');
    mkdirSync(roadmapDir, { recursive: true });
    writeFileSync(
      join(roadmapDir, 'v1.9.0.md'),
      [
        '# 分期大纲 v1.9.0',
        '',
        '## 里程碑',
        '',
        '| 里程碑 | 阶段 | 交付物 |',
        '|--------|:--:|--------|',
        '| M1 三列 | stage-1 | 交付一 |',
        '',
        '## 备注',
        '',
      ].join('\n'),
      'utf-8',
    );

    const d = await doc(['roadmap', 'show', 'v1.9.0', '--json']);
    expect(Object.keys(d)).toEqual(['schemaVersion', 'version', 'milestones']);
    expect(d.version).toBe('1.9.0');
    const milestones = d.milestones as Array<Record<string, unknown>>;
    expect(Object.keys(milestones[0])).toEqual(['title', 'theme', 'stage', 'deliverable']);
    expect(milestones[0]).toEqual({
      title: 'M1 三列', theme: null, stage: 'stage-1', deliverable: '交付一',
    });

    // 不传版本 → version:null / milestones:[] / exit 0
    const none = await doc(['roadmap', 'show', '--json']);
    expect(none).toEqual({ schemaVersion: 1, version: null, milestones: [] });
    expect(process.exitCode).toBe(0);

    // 版本不存在 → INVALID_ARGUMENT/refusal/1
    const missing = await docFailure(['roadmap', 'show', '9.9.9', '--json']);
    const err = missing.error as Record<string, unknown>;
    expect(err.code).toBe('INVALID_ARGUMENT');
    expect(err.kind).toBe('refusal');
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
  });

  // ── legacy 失败形态（errorKind 归 op-002，不在此断言） ──

  it('legacy：flow archive gate-rejected → 9 键（error 恒 string、三新键插在 errorKind 前）', async () => {
    seedArchivable();
    // v1.9.0 存在未完成阶段 → 判据拒绝（版本存在性门通过）
    const mgr = new FlowManager(tmpDir);
    mgr.getData()!.stages['v1.9.0-stage-01'].phase = 'exec_running';
    mgr.save();

    const d = await doc(['flow', 'archive', 'v1.9.0', '--json']);
    expect(Object.keys(d)).toEqual([
      'schemaVersion', 'error', 'version', 'notDone', 'blockingOpen',
      'eligible', 'unfinishedStages', 'blockingReviews', 'errorKind',
    ]);
    expect(typeof d.error).toBe('string');
    expect(d.error).toBe('gate-rejected');
    expect(d.version).toBe('v1.9.0');
    expect(d.notDone).toEqual(['v1.9.0-stage-01']);
    expect(d.blockingOpen).toEqual([]);
    expect(d.eligible).toBe(false);
    expect(d.unfinishedStages).toEqual([{ id: 'v1.9.0-stage-01', phase: 'exec_running' }]);
    expect(d.blockingReviews).toEqual([]);
    expect(d.errorKind).toBe('refusal');
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
  });

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

  it('legacy：flow archive --json 在 strict preflight 拒绝 → 三键单文档（与 no-init 同形，REV-008 无 hint）', async () => {
    seedArchivable();
    vi.stubEnv('OPENFEEL_PREFLIGHT', 'strict');
    rmSync(join(tmpDir, '.openfeel', 'dev', '.preflight.json'), { force: true });
    try {
      const d = await doc(['flow', 'archive', 'v1.9.0', '--json']);
      // 三键契约：不得新增顶层 `hint` / 不得混人类文案
      expect(Object.keys(d)).toEqual(['schemaVersion', 'error', 'errorKind']);
      expect(d.error).toBe('preflight-required');
      expect(d.errorKind).toBe('refusal');
      expect(errorMock).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
      // 门后零写盘：归档文件未生成
      expect(existsSync(join(tmpDir, '.openfeel', 'flow-archive', 'v1.9.0.json'))).toBe(false);
    } finally {
      vi.unstubAllEnvs();
      process.exitCode = 0;
    }
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
