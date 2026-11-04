/**
 * dashboard 命令测试（v1.5.10-stage-125）
 * op-001 段：数据聚合层 `src/core/dashboard/aggregate.ts` —— T3 / T4 / T5 / T6 / T7 / T8 / T24。
 * op-002（渲染）与 op-003（命令层 CLI）的用例后续续填本文件。
 *
 * 隔离声明：全程 fixture tmpDir + 隔离 HOME（`initProject` 的全局配置写入不触碰真实 `~/.openfeel/`）；
 * 聚合函数是纯函数——本文件只经入参注入 `data` / `statusDoc` / `healthReport`，不改仓库任何状态。
 */
import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';

// 单点隔离：homedir → 临时目录（对齐 test/commands/req.test.ts）
const mockHome = vi.hoisted(() => ({ dir: '' }));
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => mockHome.dir };
});

// op-003：mock child_process（本仓范式；**必须**导出 spawn，否则 `--open` 会拿到 undefined）
// execSync / execFileSync 一并提供，避免 identity / flow-manager 的真实 git 调用。
const mockedChild = vi.hoisted(() => ({ execSync: vi.fn(), execFileSync: vi.fn(), spawn: vi.fn() }));
vi.mock('node:child_process', () => ({
  execSync: mockedChild.execSync,
  execFileSync: mockedChild.execFileSync,
  spawn: mockedChild.spawn,
}));

import { mkdtempSync, readFileSync, readdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { Command, CommanderError } from 'commander';
import { initProject } from '../../src/core/init.js';
import { MetricsStore } from '../../src/core/metrics.js';
import { FlowManager, type FlowData, type HealthCheckResult, type Op, type OpState, type ReviewItem, type StageData } from '../../src/core/flow-manager.js';
import { REQ_STATUSES, type RequirementData, type RequirementStatus } from '../../src/core/req/types.js';
import { writeArchiveFile } from '../../src/core/flow-archive/archive-ops.js';
import { ARCHIVE_SCHEMA_VERSION, type ArchiveFile } from '../../src/core/flow-archive/archive-file.js';
import {
  collectDashboardData,
  type DashboardData,
  type DashboardStatusDoc,
} from '../../src/core/dashboard/aggregate.js';
// op-002 段：HTML 渲染层直接取返回值（本 op 阶段 CLI 尚未注册，不得走命令层 / 写盘）
import { renderDashboardHtml } from '../../src/core/dashboard/render.js';
import type { DashboardRequirementItem } from '../../src/core/dashboard/aggregate.js';
import { t } from '../../src/core/i18n.js';
// op-003 段：命令层（注册到独立 Command，避免触碰真实 CLI 树）
import { registerDashboardCommand, defaultDashboardPath, browserCommand } from '../../src/commands/dashboard.js';
// 集成用例：真 buildStatusJson（钉住命令层 cast 与 flow status --json 形状不漂移）
import { buildStatusJson } from '../../src/commands/flow.js';
import { setJsonMode, resetJsonModeForTest } from '../../src/commands/shared/json-output.js';

/** T24 用：模块顶层捕获仓库根（不依赖被测代码的 CWD；且早于任何 spy 安装） */
const REPO_ROOT = process.cwd();

/** 需求条目最小样本 */
function makeReq(id: string, status: RequirementStatus, overrides: Partial<RequirementData> = {}): RequirementData {
  return {
    id,
    title: `需求 ${id}`,
    status,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/** 阶段最小样本（`links` = 关联需求 ID 列表，走 v1.5.8 多值 `requirements[]`） */
function makeStage(phase: StageData['phase'], links: string[] = []): StageData {
  return {
    name: `stage-${phase}`,
    phase,
    status: 'planned',
    deps: [],
    ops: {},
    ...(links.length > 0 ? { requirements: links.map((id) => ({ id })) } : {}),
  };
}

/** 审查条目最小样本 */
function makeReview(
  id: string,
  op: string,
  status: ReviewItem['status'] = 'open',
  blocking = true,
): ReviewItem {
  return { id, op, status, priority: 'high', title: `t-${id}`, filed_by: 'test', filed_at: '', blocking };
}

/** 操作最小样本（集成用例写入真 flow.json 用；`save()` 会剥掉运行时 id 字段） */
function makeOp(id: string, state: OpState): Op {
  return {
    id,
    title: id,
    state,
    assignee: '',
    attempts: 0,
    max_attempts: 3,
    checkpoints: { plan: '', scheme: '', exec: { attempts: 0, self: '' }, review: '', test: '' },
  };
}

/** flow 数据最小样本（全部覆盖可经 overrides） */
function makeData(overrides: Partial<FlowData> = {}): FlowData {
  return {
    meta: { version: '1.0', project: 'test', updated: '', revision: 1 },
    pipeline: { phase: 'active', current: { stage: '-', op: '-' }, retry: 0 },
    stages: {},
    reviews: [],
    requirements: [],
    log: [],
    ...overrides,
  };
}

/** 注入用 statusDoc（`flow status --json` 的聚合相关三键） */
function makeStatusDoc(
  rows: DashboardStatusDoc['stages'],
  pipeline: DashboardStatusDoc['pipeline'] = { phase: 'active', current: { stage: null, op: null } },
): DashboardStatusDoc {
  const done = rows.filter((row) => row.phase === 'done').length;
  return { pipeline, stages: rows, counts: { total: rows.length, done, active: rows.length - done } };
}

/** 归档文件最小样本 */
function makeArchiveFile(version: string): ArchiveFile {
  return {
    schemaVersion: ARCHIVE_SCHEMA_VERSION,
    version,
    archived_at: '2026-01-01T00:00:00.000Z',
    stages: {},
    reviews: [],
    log: [],
    counts: { stages: 0, reviews: 0, log: 0 },
  };
}

/**
 * 剥离注释（T24 的 CJK 扫描必须先剥离，否则本仓满篇中文注释必红）。
 * 轻量状态机而非正则：字符串 / 模板字符串内的 `//` **不得**被当注释删掉
 * （否则 `docs://` 之类内容会被吞掉，CJK 扫描出现假阴性）。
 */
function stripComments(source: string): string {
  type Mode = 'code' | 'line' | 'block' | 'single' | 'double' | 'template';
  let mode: Mode = 'code';
  let out = '';
  let i = 0;
  while (i < source.length) {
    const ch = source[i] as string;
    const next = source[i + 1];
    if (mode === 'code') {
      if (ch === '/' && next === '/') {
        mode = 'line';
        i += 2;
        continue;
      }
      if (ch === '/' && next === '*') {
        mode = 'block';
        i += 2;
        continue;
      }
      if (ch === "'") mode = 'single';
      else if (ch === '"') mode = 'double';
      else if (ch === '`') mode = 'template';
      out += ch;
      i += 1;
      continue;
    }
    if (mode === 'line') {
      if (ch === '\n') {
        mode = 'code';
        out += ch;
      }
      i += 1;
      continue;
    }
    if (mode === 'block') {
      if (ch === '*' && next === '/') {
        mode = 'code';
        i += 2;
      } else {
        if (ch === '\n') out += ch;
        i += 1;
      }
      continue;
    }
    // 字符串模式：内容原样保留（含 `//`），仅处理转义与闭合
    out += ch;
    if (ch === '\\') {
      out += source[i + 1] ?? '';
      i += 2;
      continue;
    }
    if ((mode === 'single' && ch === "'") || (mode === 'double' && ch === '"') || (mode === 'template' && ch === '`')) {
      mode = 'code';
    }
    i += 1;
  }
  return out;
}

/**
 * 提取模块说明符的三种形态（T24 层间禁串面）：
 * ① `import … from '…'` / `export … from '…'`；② 裸副作用 `import '…'`；③ 动态 `import('…')`。
 * 返回去重后的说明符原文（含引号已去除）。
 */
function importSpecifiers(source: string): string[] {
  const specs: string[] = [];
  for (const m of source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)) specs.push(m[1] as string);
  for (const m of source.matchAll(/\bimport\s+['"]([^'"]+)['"]/g)) specs.push(m[1] as string);
  for (const m of source.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) specs.push(m[1] as string);
  return [...new Set(specs)];
}

describe('dashboard 聚合层（stage-125 / op-001）', () => {
  let tmpDir: string;
  let logMock: MockInstance;
  let errorMock: MockInstance;
  let exitMock: MockInstance;

  /** 统一调用入口：缺省空数据 + 空 statusDoc + 无注入健康项 */
  function collect(overrides: {
    data?: FlowData;
    statusDoc?: DashboardStatusDoc;
    healthReport?: HealthCheckResult;
    lang?: string;
  } = {}): DashboardData {
    return collectDashboardData(tmpDir, {
      data: overrides.data ?? makeData(),
      statusDoc: overrides.statusDoc ?? makeStatusDoc([]),
      healthReport: overrides.healthReport ?? { ok: true, items: [] },
      lang: overrides.lang ?? 'zh-CN',
    });
  }

  beforeEach(async () => {
    mockHome.dir = mkdtempSync(join(tmpdir(), 'openfeel-cmd-dashboard-home-'));
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-cmd-dashboard-test-'));
    await initProject(tmpDir, 'zh-CN');

    logMock = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorMock = vi.spyOn(console, 'error').mockImplementation(() => {});
    exitMock = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    MetricsStore.resetInstance();
  });

  afterEach(() => {
    logMock.mockRestore();
    errorMock.mockRestore();
    exitMock.mockRestore();
    MetricsStore.resetInstance();
    rmSync(tmpDir, { recursive: true, force: true });
    rmSync(mockHome.dir, { recursive: true, force: true });
  });

  it('T3: requirements.groups / counts 键序恒 = REQ_STATUSES（7 组恒在），元素含 linkedStages + progress', () => {
    const data = makeData({
      requirements: REQ_STATUSES.map((status, i) => makeReq(`REQ-00${i + 1}`, status)),
      stages: { 'v1.0.0-stage-01': makeStage('exec_running', ['REQ-003']) },
    });

    const d = collect({ data });

    expect(Object.keys(d.requirements.groups)).toEqual([...REQ_STATUSES]);
    expect(Object.keys(d.requirements.counts)).toEqual([...REQ_STATUSES]);
    for (const status of REQ_STATUSES) {
      expect(d.requirements.groups[status]).toHaveLength(1);
      expect(d.requirements.counts[status]).toBe(1);
    }
    expect(d.requirements.total).toBe(REQ_STATUSES.length);

    const claimed = d.requirements.groups.in_progress[0];
    expect(claimed?.id).toBe('REQ-003');
    expect(claimed?.linkedStages).toEqual([{ id: 'v1.0.0-stage-01', phase: 'exec_running' }]);
    expect(claimed?.progress).toEqual({ done: 0, total: 1 });
    // RequirementData 既有键零改：投影是「原字段 + 末位追加」
    expect(claimed?.title).toBe('需求 REQ-003');
  });

  it('T4: stages.items 是 statusDoc 的投影（opsTotal / opsDone 派生 + workflowMode / requirementId 透传）', () => {
    const statusDoc = makeStatusDoc([
      {
        id: 'v1.0.0-stage-01',
        phase: 'exec_running',
        status: 'planned',
        opsSummary: { total: 2, byState: { done: 1, running: 1 } },
        workflowMode: 'fast',
        requirementId: 'REQ-001',
      },
      {
        id: 'v1.0.0-stage-02',
        phase: 'plan_pending',
        status: 'planned',
        opsSummary: { total: 0, byState: {} },
        workflowMode: 'full',
        requirementId: null,
      },
    ]);
    const before = JSON.stringify(statusDoc);

    const d = collect({ statusDoc });

    expect(d.stages.items).toHaveLength(2);
    expect(d.stages.items[0]).toEqual({
      id: 'v1.0.0-stage-01',
      phase: 'exec_running',
      status: 'planned',
      opsTotal: 2,
      opsDone: 1,
      workflowMode: 'fast',
      requirementId: 'REQ-001',
    });
    // 投影键集固定（不是逐字照搬 statusDoc 行）
    expect(Object.keys(d.stages.items[0] as object)).toEqual([
      'id', 'phase', 'status', 'opsTotal', 'opsDone', 'workflowMode', 'requirementId',
    ]);
    // byState 无零值键 → opsDone 靠 `?? 0`
    expect(d.stages.items[1]?.opsTotal).toBe(0);
    expect(d.stages.items[1]?.opsDone).toBe(0);
    // pipeline / counts 逐字取自 statusDoc
    expect(d.stages.pipeline).toEqual(statusDoc.pipeline);
    expect(d.stages.counts).toEqual({ total: 2, done: 0, active: 2 });
    // 不得改写 statusDoc 形状
    expect(JSON.stringify(statusDoc)).toBe(before);
  });

  it('T5: releases.gates 只含未归档版本且 unfinished 为 ID 串数组；已归档版本只出现在 archived[]', () => {
    writeArchiveFile(tmpDir, makeArchiveFile('v1.5.8'));
    const data = makeData({
      requirements: [
        makeReq('REQ-001', 'done', { target_version: 'v1.9.0' }),
        makeReq('REQ-002', 'scheduled', { target_version: 'v1.10.0' }),
        // 已归档版本（无前导 v）：与 v1.5.8 视为同版本 → 不得出现在 gates
        makeReq('REQ-003', 'done', { target_version: '1.5.8' }),
      ],
    });

    const d = collect({ data });

    // 顺序不锁字典序（'1.10.0' < '1.9.0' 会误导 semver 直觉）：按集合同等断言
    expect(new Set(d.releases.gates.map((g) => g.version))).toEqual(new Set(['v1.9.0', 'v1.10.0']));
    const gateV19 = d.releases.gates.find((g) => g.version === 'v1.9.0');
    expect(gateV19?.counts).toEqual({ done: 1, unfinished: 0, other: 0, total: 1 });
    expect(gateV19?.unfinished).toEqual([]);
    const gateV110 = d.releases.gates.find((g) => g.version === 'v1.10.0');
    expect(gateV110?.counts).toEqual({ done: 0, unfinished: 1, other: 0, total: 1 });
    expect(gateV110?.unfinished).toEqual(['REQ-002']);

    expect(d.releases.archived).toEqual([{ version: 'v1.5.8', counts: { stages: 0, reviews: 0, log: 0 } }]);
    // 归一化比较：任何形态的 1.5.8 都不得出现在 gates
    expect(d.releases.gates.some((g) => g.version.replace(/^v/, '') === '1.5.8')).toBe(false);
  });

  it('T6: blockingReviews 跨阶段摊平且 done 阶段的 blocking REV 不计入', () => {
    const data = makeData({
      stages: {
        'v1.0.0-stage-01': makeStage('exec_running'),
        'v1.0.0-stage-02': makeStage('plan_pending'),
        'v1.0.0-stage-03': makeStage('done'),
      },
      reviews: [
        makeReview('REV-001', 'v1.0.0-stage-01.op-001'),
        makeReview('REV-002', 'v1.0.0-stage-02.op-001'),
        makeReview('REV-003', 'v1.0.0-stage-03.op-001'), // done 阶段 → 不计入
        makeReview('REV-004', 'v1.0.0-stage-01.op-002', 'resolved'),
        makeReview('REV-005', 'v1.0.0-stage-01.op-003', 'open', false), // 非阻塞 → 不计入
      ],
    });

    const d = collect({ data });

    expect(d.blockingReviews).toHaveLength(2);
    expect(d.blockingReviews.map((r) => r.id)).toEqual(['REV-001', 'REV-002']);
    expect(d.blockingReviews[0]).toEqual({
      stage: 'v1.0.0-stage-01',
      op: 'v1.0.0-stage-01.op-001',
      id: 'REV-001',
      title: 't-REV-001',
      priority: 'high',
    });
    expect(d.blockingReviews.some((r) => r.stage === 'v1.0.0-stage-03')).toBe(false);
  });

  it('T7: health.items 三来源合并（注入项在前、归档对账与需求对账在后），ok 取注入值且不被 warn 翻转', () => {
    const data = makeData({
      // 索引有、归档文件缺 → 归档对账 warn
      meta: { version: '1.0', project: 'test', updated: '', revision: 1, archived_versions: ['v1.0.0'] },
      // 阶段引用不存在需求 → 需求对账 warn
      stages: { 'v1.0.0-stage-01': makeStage('exec_running', ['REQ-404']) },
    });
    const healthReport: HealthCheckResult = {
      ok: true,
      items: [{ section: 'injected', status: 'pass', message: 'injected-item' }],
    };

    const d = collect({ data, healthReport });

    const sections = d.health.items.map((item) => item.section);
    expect(sections[0]).toBe('injected');
    expect(sections).toContain('归档一致性');
    expect(sections).toContain('需求对账');
    // 顺序 = 注入项 → 归档对账 → 需求对账
    const archiveIdx = sections.indexOf('归档一致性');
    const reqIdx = sections.indexOf('需求对账');
    expect(archiveIdx).toBeGreaterThan(0);
    expect(reqIdx).toBeGreaterThan(archiveIdx);
    // 元素统一为 {section,status,message}
    for (const item of d.health.items) {
      expect(Object.keys(item)).toEqual(['section', 'status', 'message']);
    }
    // ok 恒取注入值：合并来源的 warn 不翻转
    expect(d.health.items.some((item) => item.status === 'warn')).toBe(true);
    expect(d.health.ok).toBe(true);
    expect(d.health.items[0]).toEqual({ section: 'injected', status: 'pass', message: 'injected-item' });
  });

  it('T8: 空数据聚合形状（7 空组 + 四块空数组 + health 仍出真实检查项 + total:0）', () => {
    const mgr = new FlowManager(tmpDir);
    const data = mgr.getData();
    expect(data).not.toBeNull();
    const healthReport = mgr.healthCheck(false);

    const d = collect({ data: data as FlowData, healthReport });

    expect(Object.keys(d.requirements.groups)).toEqual([...REQ_STATUSES]);
    for (const status of REQ_STATUSES) {
      expect(d.requirements.groups[status]).toEqual([]);
      expect(d.requirements.counts[status]).toBe(0);
    }
    expect(d.requirements.total).toBe(0);
    expect(d.stages.items).toEqual([]);
    expect(d.releases.gates).toEqual([]);
    expect(d.releases.archived).toEqual([]);
    expect(d.blockingReviews).toEqual([]);
    // health 仍出真实检查项（归档对账 + 需求对账恒各 ≥1 项）；ok 同源于注入报告
    expect(d.health.items.length).toBeGreaterThanOrEqual(2);
    expect(d.health.ok).toBe(healthReport.ok);
    // 空项目无 metrics.json → 空 agents；无 package.json → name/version 为 null
    expect(d.metrics).toEqual({ agents: [] });
    expect(d.project).toEqual({ root: tmpDir, name: null, version: null });
    expect(d.schemaVersion).toBe(1);
    expect(d.generator).toMatch(/^openfeel\/\d+\.\d+\.\d+/);
    expect(Number.isNaN(Date.parse(d.generatedAt))).toBe(false);
  });

  it('T24: src/core/dashboard/** 零 commands/ 与 cli/ 说明符（含裸/动态 import）+ 剥离注释后零 CJK', () => {
    const dashboardDir = join(REPO_ROOT, 'src', 'core', 'dashboard');
    const coreDir = join(REPO_ROOT, 'src', 'core');
    // 动态枚举**当前已存在**的 .ts（不硬编码文件名：render.ts 尚未存在不得因此红）
    const files = readdirSync(dashboardDir).filter((name) => name.endsWith('.ts'));
    expect(files.length).toBeGreaterThan(0);

    // 说明符提取覆盖三形态（含无 from 的裸 import 与动态 import）；用合成片段自检提取器
    const synthetic = [
      "import '../commands/x.js';",
      "export { a } from './y.js';",
      "const m = await import('../cli/z.js');",
      "const url = 'a//b'; // real comment",
    ].join('\n');
    expect(importSpecifiers(synthetic)).toEqual(
      expect.arrayContaining(['../commands/x.js', './y.js', '../cli/z.js']),
    );
    // `//` 在字符串内不得被剥离（假阴性防护）
    expect(stripComments(synthetic)).toContain("'a//b'");

    for (const file of files) {
      const source = readFileSync(join(dashboardDir, file), 'utf-8');
      const specs = importSpecifiers(source);
      expect(specs.length).toBeGreaterThan(0);

      for (const spec of specs) {
        // ① 层间禁串：无 commands/ 或 cli/ 说明符（含 ../src/commands、../../commands、@/cli 变体）
        expect(spec, `${file} → ${spec}`).not.toMatch(/(^|\/)(commands|cli)\//);
        // ② 载荷约束：相对说明符必须留在 src/core 内；裸说明符只能是 Node 内建
        if (spec.startsWith('.')) {
          const target = resolve(dashboardDir, spec);
          expect(target.startsWith(`${coreDir}${sep}`), `${file} → ${spec}`).toBe(true);
        } else {
          expect(spec.startsWith('node:'), `${file} → ${spec}`).toBe(true);
        }
      }

      // ③ 剥离注释后再断言零 CJK（字符串内容保留：真 CJK 文案仍会被抓住）
      expect(stripComments(source), `${file}: 非注释区出现 CJK`).not.toMatch(
        /[\u3000-\u303F\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/,
      );
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// op-002：HTML 渲染层 `src/core/dashboard/render.ts`（T13~T18）
// D-125-06 r4 语言确定性：全部显式传 { lang: 'zh-CN' }，期望值用同一个 'zh-CN' 求，
// 不依赖进程默认语言、不省略 t() 的 lang。
// ═══════════════════════════════════════════════════════════════

/** 空看板数据（DashboardData 全键最小样本：零需求 / 零阶段 / 零归档 / 零指标项） */
function makeEmptyDashboard(): DashboardData {
  const counts = {} as Record<RequirementStatus, number>;
  const groups = {} as Record<RequirementStatus, DashboardRequirementItem[]>;
  for (const status of REQ_STATUSES) {
    counts[status] = 0;
    groups[status] = [];
  }
  return {
    schemaVersion: 1,
    generatedAt: '2026-01-01T00:00:00.000Z',
    generator: 'openfeel/0.0.0',
    project: { root: '/tmp/openfeel-dashboard-fixture', name: null, version: null },
    requirements: { groups, counts, total: 0 },
    stages: {
      pipeline: { phase: 'active', current: { stage: null, op: null } },
      items: [],
      counts: { total: 0, done: 0, active: 0 },
    },
    releases: { gates: [], archived: [] },
    blockingReviews: [],
    health: { ok: true, items: [] },
    metrics: { agents: [] },
  };
}

/** 需求行最小样本（`DashboardRequirementItem` = `RequirementData` + linkedStages + progress） */
function makeDashboardRequirement(id: string, title: string): DashboardRequirementItem {
  return {
    id,
    title,
    status: 'scheduled',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    linkedStages: [],
    progress: { done: 0, total: 0 },
  };
}

/** 空看板 + 一条（scheduled 列）需求：用于注入载荷 / 确定性用例 */
function withRequirement(title: string): DashboardData {
  const data = makeEmptyDashboard();
  data.requirements.total = 1;
  data.requirements.counts.scheduled = 1;
  data.requirements.groups.scheduled = [makeDashboardRequirement('REQ-001', title)];
  return data;
}

describe('dashboard 渲染层（stage-125 / op-002）', () => {
  it('T13: H1/H2 单文件 + 零外链（剥离 openfeel-data 数据块后断言）', () => {
    const html = renderDashboardHtml(makeEmptyDashboard(), { lang: 'zh-CN' });
    // 数据块是惰性 JSON、属预期内容：先整段剥离再断言「零资源引用」
    const stripped = html.replace(/<script id="openfeel-data"[\s\S]*?<\/script>/, '');
    expect(stripped).not.toBe(html); // 剥离确实发生了，断言面不含数据块

    // H1 单文件自包含：无 src= / href=（≡ 无 <script src=> / <link> / 本地 <img>）
    expect(stripped).not.toContain('src=');
    expect(stripped).not.toContain('href=');
    expect(stripped).not.toContain('<link');

    // H2/H3 零外链 + 零网络
    expect(stripped).not.toContain('http://');
    expect(stripped).not.toContain('https://');
    expect(stripped).not.toContain('//cdn');
    expect(stripped).not.toContain('fetch(');
    expect(stripped).not.toContain('XMLHttpRequest');

    // H3 strict CSP 原文
    expect(stripped).toContain("default-src 'none'");
    expect(stripped).toContain("script-src 'none'");
    expect(stripped).toContain("style-src 'unsafe-inline'");
    expect(stripped).toContain('img-src data:');
  });

  it('T14: H4/H5 <script 恰 1 次且为惰性 JSON 数据块；</script> 恰 1 次（注入载荷后仍为 1）', () => {
    const plain = renderDashboardHtml(makeEmptyDashboard(), { lang: 'zh-CN' });
    expect(plain.match(/<script/g) ?? []).toHaveLength(1);
    expect(plain.match(/<\/script>/g) ?? []).toHaveLength(1);
    expect(plain).toContain('<script id="openfeel-data" type="application/json">');
    expect(plain).toContain('type="application/json"');

    // 标题塞 </script><script>alert(1)</script> → 数据块不得提前闭合
    const evilHtml = renderDashboardHtml(withRequirement('</script><script>alert(1)</script>'), { lang: 'zh-CN' });
    expect(evilHtml.match(/<script/g) ?? []).toHaveLength(1);
    expect(evilHtml.match(/<\/script>/g) ?? []).toHaveLength(1);
    expect(evilHtml).toContain('\\u003c/script');
  });

  it('T15: H6 动态文本全量 escapeHtml（标题含 <img src=x onerror=...> 不落原始标签）', () => {
    const html = renderDashboardHtml(withRequirement('<img src=x onerror=alert(1)>'), { lang: 'zh-CN' });
    expect(html).toContain('&lt;img');
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('onerror=alert(1)>');
  });

  it('T16: H8 空数据 HTML：空态节点 + 实际译文（非 key 字符串）+ 零 undefined/NaN', () => {
    const html = renderDashboardHtml(makeEmptyDashboard(), { lang: 'zh-CN' });

    // ① 空态节点带 data-i18n="dashboard.html.empty"
    expect(html).toContain('data-i18n="dashboard.html.empty"');

    // ② 空态译文来自 t('dashboard.html.empty','zh-CN') 的实际返回值（缺键守卫：禁止假绿）
    const emptyText = t('dashboard.html.empty', 'zh-CN');
    expect(emptyText).not.toBe('dashboard.html.empty');
    expect(emptyText.trim()).not.toBe('');
    expect(html).toContain(emptyText);

    // ③ 零 undefined / NaN（空表已被空态节点替代）
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('NaN');
  });

  it('T17: H9/H10 确定性（同 data 同 lang 两次渲染，剔除 generatedAt 值后逐字相等）', () => {
    const data = makeEmptyDashboard();
    data.requirements.total = 1;
    data.requirements.counts.scheduled = 1;
    data.requirements.groups.scheduled = [makeDashboardRequirement('REQ-001', '确定性标题')];

    const first = renderDashboardHtml(data, { lang: 'zh-CN' });
    const second = renderDashboardHtml(data, { lang: 'zh-CN' });
    const stripGeneratedAt = (html: string): string => html.split(data.generatedAt).join('<generatedAt>');

    expect(stripGeneratedAt(first)).toBe(stripGeneratedAt(second));
    // 唯一时间字段仍来自 data（页脚 + 数据块），不取运行时刻
    expect(first).toContain(data.generatedAt);
  });

  it('T18: H7 <meta charset="utf-8"> 是 <head> 第一个子元素', () => {
    const html = renderDashboardHtml(makeEmptyDashboard(), { lang: 'zh-CN' });
    expect(/<head>\s*<meta charset="utf-8">/.test(html)).toBe(true);
  });

  it('T25(补强): 全字段恶意载荷矩阵 —— 零原始标签 + 数据块可回读原值 + 不抛', () => {
    const payload = `A&B'C"D</script><script>alert(1)</script>\u2028\u2029`;
    const data = makeEmptyDashboard();
    data.requirements.total = 1;
    data.requirements.counts.scheduled = 1;
    data.requirements.groups.scheduled = [makeDashboardRequirement('REQ-001', payload)];
    data.stages.items = [{
      id: payload,
      phase: payload,
      status: payload,
      opsTotal: 1,
      opsDone: 1,
      workflowMode: payload,
      requirementId: payload,
    }];
    data.releases.gates = [{
      version: payload,
      counts: { done: 1, unfinished: 0, other: 0, total: 1 },
      unfinished: [payload],
    }];
    data.releases.archived = [{ version: payload, counts: { stages: 1, reviews: 2, log: 3 } }];
    data.blockingReviews = [{ stage: payload, op: payload, id: payload, title: payload, priority: 'high' }];
    data.health = { ok: false, items: [{ section: payload, status: 'pass', message: payload }] };

    let html = '';
    expect(() => {
      html = renderDashboardHtml(data, { lang: 'zh-CN' });
    }).not.toThrow();

    // H4/H5：全文 `<script` / `</script>` 各恰 1（注入不提前闭合数据块）
    expect(html.match(/<script/g) ?? []).toHaveLength(1);
    expect(html.match(/<\/script>/g) ?? []).toHaveLength(1);

    // 数据块回读 = 原值（`\u003c` 等转义经 JSON.parse 还原）
    const block = html.match(/<script id="openfeel-data" type="application\/json">([\s\S]*?)<\/script>/);
    expect(block).not.toBeNull();
    const parsed = JSON.parse(block![1] as string) as {
      requirements: { groups: Record<string, Array<{ title: string }>> };
      blockingReviews: Array<{ title: string }>;
    };
    expect(parsed.requirements.groups.scheduled![0]!.title).toBe(payload);
    expect(parsed.blockingReviews[0]!.title).toBe(payload);
    expect(block![1]).not.toContain('</script>');

    // 页面文本区（剥离数据块）不得残留原始标签 / 原始引号
    const stripped = html.replace(/<script id="openfeel-data"[\s\S]*?<\/script>/, '');
    expect(stripped).not.toContain('<script');
    expect(stripped).not.toContain('</script>');
    expect(stripped).toContain('&lt;/script&gt;');
    expect(stripped).toContain('&amp;');
    expect(stripped).toContain('&#39;');
    expect(stripped).toContain('&quot;');
  });

  it('T26(补强): 非字符串 title/id 不抛且渲染为字符串（损坏数据零异常）', () => {
    const data = makeEmptyDashboard();
    data.requirements.total = 1;
    data.requirements.counts.scheduled = 1;
    const item = makeDashboardRequirement('REQ-001', 123 as unknown as string);
    item.id = 456 as unknown as string;
    data.requirements.groups.scheduled = [item];
    data.blockingReviews = [{
      stage: 789 as unknown as string,
      op: null as unknown as string,
      id: 1 as unknown as string,
      title: 2 as unknown as string,
      priority: 'high',
    }];
    data.health = { ok: true, items: [{ section: 3 as unknown as string, status: 'pass', message: 4 as unknown as string }] };

    let html = '';
    expect(() => {
      html = renderDashboardHtml(data, { lang: 'zh-CN' });
    }).not.toThrow();
    expect(html).toContain('<code>456</code>');
    expect(html).toContain('>123<');
    expect(html).toContain('<code>1</code>');
    expect(html).toContain('>2<');
  });
});

// ═══════════════════════════════════════════════════════════════
// op-003：命令层 `src/commands/dashboard.ts`（T1 / T2 / T9~T12 / T19~T21）
// D-125-06 r4 语言确定性：隔离 HOME + `initProject(tmpDir, 'zh-CN')`（lang 落 .info.json），
// 渲染与断言同用 'zh-CN'；禁 `config set-lang`、禁省略 initProject 第二参。
// `failCli` 非 JSON 分支是即时 `process.exit()`（errors.ts:78）→ 必须先 mock `process.exit`。
// ═══════════════════════════════════════════════════════════════
describe('dashboard 命令层（stage-125 / op-003）', () => {
  let tmpDir: string;
  let program: Command;
  let logMock: MockInstance;
  let errorMock: MockInstance;
  let warnMock: MockInstance;
  let exitMock: MockInstance;
  let cwdMock: MockInstance;
  let prevExitCode: typeof process.exitCode;

  beforeEach(async () => {
    mockHome.dir = mkdtempSync(join(tmpdir(), 'openfeel-cmd-dashboard-home-'));
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-cmd-dashboard-cli-'));
    await initProject(tmpDir, 'zh-CN');

    mockedChild.execSync.mockReset();
    mockedChild.execFileSync.mockReset();
    mockedChild.spawn.mockReset();

    logMock = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorMock = vi.spyOn(console, 'error').mockImplementation(() => {});
    warnMock = vi.spyOn(console, 'warn').mockImplementation(() => {});
    exitMock = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    cwdMock = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    prevExitCode = process.exitCode;
    process.exitCode = 0;
    MetricsStore.resetInstance();
    resetJsonModeForTest();

    program = new Command();
    program.exitOverride();
    registerDashboardCommand(program);
  });

  afterEach(() => {
    resetJsonModeForTest();
    mockedChild.spawn.mockReset();
    mockedChild.execSync.mockReset();
    mockedChild.execFileSync.mockReset();
    logMock.mockRestore();
    errorMock.mockRestore();
    warnMock.mockRestore();
    exitMock.mockRestore();
    cwdMock.mockRestore();
    process.exitCode = prevExitCode;
    MetricsStore.resetInstance();
    rmSync(tmpDir, { recursive: true, force: true });
    rmSync(mockHome.dir, { recursive: true, force: true });
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

  /** stdout 汇总 */
  function out(): string {
    return logMock.mock.calls.map((c) => String(c[0])).join('\n');
  }

  /** stderr 汇总 */
  function err(): string {
    return errorMock.mock.calls.map((c) => String(c[0])).join('\n');
  }

  /** warn 汇总 */
  function warned(): string {
    return warnMock.mock.calls.map((c) => String(c[0])).join('\n');
  }

  /** 清空捕获（子用例复用） */
  function resetCapture(): void {
    logMock.mockClear();
    errorMock.mockClear();
    warnMock.mockClear();
    process.exitCode = 0;
  }

  it('T1/T2: --json 单文档 + 顶层键序冻结（schemaVersion 首键，前后零杂行）', async () => {
    await safeParse(['dashboard', '--json']);

    expect(process.exitCode).toBe(0);
    // 恰好一个 stdout 文档（JSON 模式人类摘要零输出）
    expect(logMock).toHaveBeenCalledTimes(1);
    expect(errorMock).not.toHaveBeenCalled();

    const raw = logMock.mock.calls[0][0] as string;
    // 前后零杂行：trim 后可直接解析，且 trim 不改变内容
    const parsed = JSON.parse(raw.trim()) as Record<string, unknown>;
    expect(raw.trim()).toBe(raw);
    expect(Object.keys(parsed)).toEqual([
      'schemaVersion', 'generatedAt', 'generator', 'project', 'requirements',
      'stages', 'releases', 'blockingReviews', 'health', 'metrics',
    ]);
    expect(parsed.schemaVersion).toBe(1);
    // --json 不写文件、不 spawn
    expect(existsSync(join(tmpDir, '.openfeel', 'tmp'))).toBe(false);
    expect(mockedChild.spawn).not.toHaveBeenCalled();
  });

  it('T9: 未初始化 → --json 侧 NO_INIT/refusal/exit 1；人类侧 stderr 含 common.errorNoInit', async () => {
    rmSync(join(tmpDir, '.openfeel', 'flow.json'));

    // JSON 侧（envelope 需进程级 JSON 模式；生产由 runCli 预扫描置位）
    setJsonMode(true);
    try {
      await safeParse(['dashboard', '--json']);
      expect(process.exitCode).toBe(1);
      const d = JSON.parse(logMock.mock.calls[0][0] as string);
      expect(d.schemaVersion).toBe(1);
      expect(d.error.code).toBe('NO_INIT');
      expect(d.error.kind).toBe('refusal');
    } finally {
      resetJsonModeForTest();
    }

    // 人类侧（failCli 即时 process.exit → 已 mock）
    resetCapture();
    await safeParse(['dashboard']);
    expect(process.exitCode).toBe(1);
    expect(err()).toContain(t('common.errorNoInit', 'zh-CN'));
  });

  it('T10: 互斥/参数矩阵四例 → INVALID_ARGUMENT + exit 1 + 零文件被创建', async () => {
    const neverCreated = join(tmpDir, 'never-created.html');

    // (1) --json × --out
    setJsonMode(true);
    try {
      await safeParse(['dashboard', '--json', '--out', neverCreated]);
      expect(process.exitCode).toBe(1);
      const d = JSON.parse(logMock.mock.calls[0][0] as string);
      expect(d.error.code).toBe('INVALID_ARGUMENT');
      expect(d.error.kind).toBe('refusal');
      expect(d.error.detail).toEqual({ conflict: 'json-out' });
    } finally {
      resetJsonModeForTest();
    }
    expect(existsSync(neverCreated)).toBe(false);

    // (2) --json × --open
    resetCapture();
    setJsonMode(true);
    try {
      await safeParse(['dashboard', '--json', '--open']);
      expect(process.exitCode).toBe(1);
      const d = JSON.parse(logMock.mock.calls[0][0] as string);
      expect(d.error.code).toBe('INVALID_ARGUMENT');
      expect(d.error.detail).toEqual({ conflict: 'json-open' });
    } finally {
      resetJsonModeForTest();
    }
    expect(mockedChild.spawn).not.toHaveBeenCalled();

    // (3) --out ''（人类分支）
    resetCapture();
    await safeParse(['dashboard', '--out', '']);
    expect(process.exitCode).toBe(1);
    expect(err()).toContain(t('dashboard.outEmpty', 'zh-CN'));

    // (4) --out <已存在目录>（人类分支）
    resetCapture();
    await safeParse(['dashboard', '--out', tmpDir]);
    expect(process.exitCode).toBe(1);
    expect(err()).toContain(t('dashboard.outIsDirectory', 'zh-CN', { path: tmpDir }));

    // 四例均零写盘（默认产物也不得生成：校验先于写盘）
    expect(existsSync(defaultDashboardPath(tmpDir))).toBe(false);
  });

  it('T11: --out 父目录不存在 → 递归创建 + 写盘成功（doctype / charset）+ 3 行摘要绝对路径', async () => {
    const target = join(tmpDir, 'sub', 'b.html');
    await safeParse(['dashboard', '--out', target]);

    expect(process.exitCode).toBe(0);
    expect(existsSync(target)).toBe(true);
    const html = readFileSync(target, 'utf-8');
    expect(html).toContain('<!doctype html');
    expect(html).toContain('<meta charset="utf-8"');
    // 人类摘要恒 3 行，且打印绝对路径
    expect(logMock).toHaveBeenCalledTimes(3);
    expect(out()).toContain(resolve(target));
  });

  it('T12: 无 --out → 默认路径 <项目根>/.openfeel/tmp/dashboard.html 且摘要打印该绝对路径', async () => {
    const expected = defaultDashboardPath(tmpDir);
    await safeParse(['dashboard']);

    expect(process.exitCode).toBe(0);
    expect(existsSync(expected)).toBe(true);
    expect(out()).toContain(expected);
  });

  it('T19: 写盘失败（父路径是已存在文件）→ 人类侧 stderr + exit 3', async () => {
    const blocker = join(tmpDir, 'blocker');
    writeFileSync(blocker, 'x', 'utf-8');
    const badOut = join(blocker, 'sub', 'b.html');

    // 生产可达路径只有人类分支：`--json` × `--out` 在 ① 参数校验即被拒绝（INVALID_ARGUMENT/1），
    // 故 `INTERNAL_ERROR` 的 JSON envelope 形态在本命令生产不可达，测试只锁人类分支。
    await safeParse(['dashboard', '--out', badOut]);

    expect(process.exitCode).toBe(3);
    expect(err()).toContain('错误：');
  });

  it('T20: --open 拉起失败只 warn 且恒 exit 0（spawn 抛错 / error 事件 / exit 非零 三失败面）', async () => {
    const expected = defaultDashboardPath(tmpDir);
    const failText = t('dashboard.openFailedTmpl', 'zh-CN', { path: expected });

    // (a) spawn 同步抛错（ENOENT 等）
    mockedChild.spawn.mockImplementationOnce(() => {
      throw new Error('ENOENT');
    });
    await safeParse(['dashboard', '--open']);
    expect(process.exitCode).toBe(0);
    expect(warned()).toContain(failText);

    // (b) 假 child 手动触发 on('error')
    resetCapture();
    const onErrorMock = vi.fn();
    mockedChild.spawn.mockReturnValueOnce({ unref: vi.fn(), on: onErrorMock });
    await safeParse(['dashboard', '--open']);
    expect(process.exitCode).toBe(0);
    const errorHandler = onErrorMock.mock.calls.find((call) => call[0] === 'error')?.[1] as
      | ((err: Error) => void)
      | undefined;
    expect(errorHandler).toBeTypeOf('function');
    errorHandler?.(new Error('no display'));
    expect(warned()).toContain(failText);

    // (c) 假 child 手动触发 on('exit') 且 code 非零 → 同样只 warn、exit 0
    resetCapture();
    const onExitMock = vi.fn();
    mockedChild.spawn.mockReturnValueOnce({ unref: vi.fn(), on: onExitMock });
    await safeParse(['dashboard', '--open']);
    expect(process.exitCode).toBe(0);
    const exitHandler = onExitMock.mock.calls.find((call) => call[0] === 'exit')?.[1] as
      | ((code: number | null) => void)
      | undefined;
    expect(exitHandler).toBeTypeOf('function');
    exitHandler?.(1);
    expect(warned()).toContain(failText);

    // (d) exit 0 → 不 warn（正常拉开浏览器）
    resetCapture();
    const onOkMock = vi.fn();
    mockedChild.spawn.mockReturnValueOnce({ unref: vi.fn(), on: onOkMock });
    await safeParse(['dashboard', '--open']);
    expect(process.exitCode).toBe(0);
    const okExitHandler = onOkMock.mock.calls.find((call) => call[0] === 'exit')?.[1] as
      | ((code: number | null) => void)
      | undefined;
    okExitHandler?.(0);
    expect(warned()).toBe('');
  });

  it('T21: --open 不带 --out → spawn 收到默认产物绝对路径（无 shell + detached/ignore）', async () => {
    const expected = defaultDashboardPath(tmpDir);
    mockedChild.spawn.mockReturnValue({ unref: vi.fn(), on: vi.fn() });

    await safeParse(['dashboard', '--open']);

    expect(process.exitCode).toBe(0);
    expect(existsSync(expected)).toBe(true);
    expect(mockedChild.spawn).toHaveBeenCalledTimes(1);
    const call = mockedChild.spawn.mock.calls[0] as [string, string[], { detached?: boolean; stdio?: string }];
    // cmd/args 必须与 browserCommand 同源（路径恒独立 argv，不拼 shell 字符串）
    const expectedCall = browserCommand(process.platform, expected);
    expect(call[0]).toBe(expectedCall.cmd);
    expect(call[1]).toEqual(expectedCall.args);
    expect(call[2]).toEqual({ detached: true, stdio: 'ignore' });
  });

  it('P0: browserCommand 三平台矩阵 —— win32 不经 cmd，特殊字符路径原样单 argv', () => {
    const winPaths = [
      'C:/tmp/R&D/d.html',
      'C:/tmp/a b/c&d|e<f>g^h.html',
      'C:/tmp/中文 目录/d.html',
    ];
    for (const path of winPaths) {
      const call = browserCommand('win32', path);
      expect(call.cmd).not.toBe('cmd');
      expect(call.cmd).toBe('rundll32');
      // 路径是单个 argv 元素：& | < > ^ 无二次解析面
      expect(call.args).toEqual(['url.dll,FileProtocolHandler', path]);
    }
    expect(browserCommand('darwin', '/tmp/a b.html')).toEqual({ cmd: 'open', args: ['/tmp/a b.html'] });
    expect(browserCommand('linux', '/tmp/a&b.html')).toEqual({ cmd: 'xdg-open', args: ['/tmp/a&b.html'] });
  });

  it('集成：真 FlowManager + 真 buildStatusJson 走 --json，钉住命令层 cast 不漂移', async () => {
    const mgr = new FlowManager(tmpDir);
    const data = mgr.getData()!;
    const stage = makeStage('exec_running');
    stage.ops = { 'op-001': makeOp('op-001', 'done'), 'op-002': makeOp('op-002', 'pending') };
    data.stages['v1.0.0-stage-01'] = stage;
    mgr.save();

    // 同一 manager 快照：statusDoc 投影是本次 --json 输出的唯一上游
    const statusDoc = buildStatusJson(mgr) as {
      stages: Array<{ id: string; opsSummary: { total: number; byState: Record<string, number> } }>;
    };
    const expectedRow = statusDoc.stages.find((row) => row.id === 'v1.0.0-stage-01')!;

    await safeParse(['dashboard', '--json']);

    expect(process.exitCode).toBe(0);
    const d = JSON.parse(logMock.mock.calls[0][0] as string);
    expect(d.stages.items).toHaveLength(1);
    const item = d.stages.items[0];
    expect(item).toMatchObject({
      id: 'v1.0.0-stage-01',
      phase: 'exec_running',
      status: 'planned',
      opsTotal: expectedRow.opsSummary.total,
      opsDone: expectedRow.opsSummary.byState.done,
      requirementId: null,
    });
    expect(item.opsTotal).toBe(2);
    expect(item.opsDone).toBe(1);
    expect(typeof item.workflowMode).toBe('string');
  });

  it('降级矩阵：损坏 package.json / metrics.json / flow-archive 是文件 → --json exit 0 不抛', async () => {
    writeFileSync(join(tmpDir, 'package.json'), '{ bad json', 'utf-8');
    writeFileSync(join(tmpDir, '.openfeel', 'metrics.json'), '{ bad json', 'utf-8');
    writeFileSync(join(tmpDir, '.openfeel', 'flow-archive'), 'not a dir', 'utf-8');

    await safeParse(['dashboard', '--json']);

    expect(process.exitCode).toBe(0);
    const d = JSON.parse(logMock.mock.calls[0][0] as string);
    expect(d.project.name).toBeNull();
    expect(d.metrics).toEqual({ agents: [] });
    expect(d.releases).toEqual({ gates: [], archived: [] });
  });
});
