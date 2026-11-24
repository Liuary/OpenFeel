/**
 * body-lint 单元测试 — 空壳检测（v1.6.0-stage-132 / T3）
 *
 * 覆盖：
 * - 需求正文空壳（`## 摘要` / `## 目标与验收` 未写实）与写实正文的区分；
 * - 缺需求级计划（`.openfeel/plan/reqs/REQ-NNN.plan.md` 不存在）与已建计划的区分；
 * - CRLF 正文（`\r\n`）判据与 LF 同口径；
 * - `.openfeel/requirements` 不存在 / 零需求项目（空集而非报错）；
 * - 阶段文档：`overview.md` / `plan.md` **存在但未写实**才计入，缺失不计入；
 * - 确定性（两次扫描逐字相等）与只读（不创建 `plan/reqs` 目录）。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  lintRequirementBodies,
  lintStageDocs,
} from '../../../src/core/plan/body-lint.js';

/** 写实正文（非空白字符数远超 MIN_FILLED_CHARS=40） */
const FILLED_TEXT =
  '本段是写实内容，说明问题现状、交付物与边界，并给出可复现的验收路径，足以支撑审查判断。';
/** 写实判据行（`## 目标与验收` 额外要求至少一条） */
const CRITERIA_LINE = '- A1：空壳清单可枚举且不改变 lint 退出码。';

/** 空壳需求正文（骨架形态） */
function shellBody(id: string, eol = '\n'): string {
  return [
    `# ${id}：空壳需求`,
    '',
    '## 摘要',
    '',
    '（待补充）',
    '',
    '## 目标与验收',
    '',
    '（待补充）',
    '',
    '## 变更记录',
    '',
    '- 创建',
    '',
  ].join(eol);
}

/** 写实需求正文 */
function filledBody(id: string, eol = '\n'): string {
  return [
    `# ${id}：写实需求`,
    '',
    '## 摘要',
    '',
    FILLED_TEXT,
    '',
    '## 目标与验收',
    '',
    CRITERIA_LINE,
    '- A2：正文写实后不再出现在 fill.emptyBody。',
    '',
  ].join(eol);
}

/** 写实需求级计划（三节均过阈值；`## 偏差与回写` 不在本模块判据内） */
function filledRequirementPlan(): string {
  return [
    '## 目标',
    '',
    '把空壳检测做成只读清单，判据全部复用 filled.ts，避免第二套占位规则导致的误报与漂移。',
    '',
    '## 任务拆解',
    '',
    '先遍历需求正文与计划路径，再扫阶段目录，最后接进 lint req 与 lint fill 两个出口。',
    '',
    '## 验收判据',
    '',
    '单测覆盖空壳 / 写实 / 缺计划 / CRLF / 空目录五类夹具，并且同一夹具连续两次扫描的输出逐字相同，确保清单可被审查者复现。',
    '',
  ].join('\n');
}

/** 写实 overview（`## 目标` + `## 操作方案`） */
function filledOverview(): string {
  return [
    '## 目标',
    '',
    '让阶段目标与操作方案都可被机器读取，并在派发子 agent 之前提供可判定的上下文与边界，避免空壳目标误导执行方向。',
    '',
    '## 操作方案',
    '',
    '先补目标与操作方案两节的实质内容，再以 lint 的空壳清单为证据逐条收口，最后由独立审查者复核判据。',
    '',
  ].join('\n');
}

/** 空壳 overview（两节都是占位） */
function shellOverview(): string {
  return [
    '## 目标',
    '',
    '（待补充）',
    '',
    '## 操作方案',
    '',
    '（待补充）',
    '',
  ].join('\n');
}

/** 写实阶段计划（标题行不计入信息量，正文非空白 ≥ 2×40） */
function filledStagePlan(): string {
  return [
    '# 计划',
    '',
    '## 一、目标',
    '',
    '把正文写入、计划门与空壳枚举收敛到同一判据来源，确保没有第二套占位或字数规则在仓库里漂移。',
    '',
    '## 二、拆解',
    '',
    '先落判据模块，再做写入原语与空壳清单，最后接门禁与 lint，并用命令级样本逐条取证。',
    '',
  ].join('\n');
}

/** 空壳阶段计划（只剩标题 + 占位行） */
function shellStagePlan(): string {
  return ['# 计划', '', '## 目标', '', '- [ ] 待补充', ''].join('\n');
}

describe('body-lint：需求正文与需求级计划', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-body-lint-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  /** 写文件（自动建父目录） */
  function write(relPath: string, content: string): void {
    const abs = join(tmpDir, relPath);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content, 'utf-8');
  }

  it('T1：混合夹具 → 空壳 / 写实 / 缺计划分组正确（按文件名字典序）', () => {
    write('.openfeel/requirements/REQ-001.md', shellBody('REQ-001'));
    write('.openfeel/requirements/REQ-002.md', filledBody('REQ-002'));
    write('.openfeel/requirements/REQ-003.md', shellBody('REQ-003'));
    write('.openfeel/plan/reqs/REQ-002.plan.md', filledRequirementPlan());

    const report = lintRequirementBodies(tmpDir);
    expect(report.checked).toBe(3);
    expect(report.empty).toEqual([
      { id: 'REQ-001', emptySections: ['摘要', '目标与验收'] },
      { id: 'REQ-003', emptySections: ['摘要', '目标与验收'] },
    ]);
    expect(report.missingPlan).toEqual([{ id: 'REQ-001' }, { id: 'REQ-003' }]);
  });

  it('T2：CRLF 正文与 LF 同口径（空壳仍命中；写实仍放行）', () => {
    write('.openfeel/requirements/REQ-010.md', shellBody('REQ-010', '\r\n'));
    write('.openfeel/requirements/REQ-011.md', filledBody('REQ-011', '\r\n'));

    const report = lintRequirementBodies(tmpDir);
    expect(report.checked).toBe(2);
    expect(report.empty).toEqual([
      { id: 'REQ-010', emptySections: ['摘要', '目标与验收'] },
    ]);
    expect(report.missingPlan).toEqual([{ id: 'REQ-010' }, { id: 'REQ-011' }]);
  });

  it('T3：缺 `.openfeel/requirements` 目录 → 全空、零报错', () => {
    const report = lintRequirementBodies(tmpDir);
    expect(report).toEqual({ checked: 0, empty: [], missingPlan: [] });
  });

  it('T4：零需求项目（只有阶段目录）→ 空集，且阶段目录不被当作需求', () => {
    write('.openfeel/plan/v1/stage-01/overview.md', filledOverview());
    const report = lintRequirementBodies(tmpDir);
    expect(report).toEqual({ checked: 0, empty: [], missingPlan: [] });
  });

  it('T5：只读 — 扫描不创建 `plan/reqs` 目录', () => {
    write('.openfeel/requirements/REQ-020.md', shellBody('REQ-020'));
    const reqsDir = join(tmpDir, '.openfeel', 'plan', 'reqs');
    expect(existsSync(reqsDir)).toBe(false);

    lintRequirementBodies(tmpDir);

    // findRequirementPlanPath 只解析不建目录：缺失计划被登记，但不产生磁盘副作用
    expect(existsSync(reqsDir)).toBe(false);
  });

  it('T6：确定性 — 同一夹具两次扫描结果逐字相等', () => {
    write('.openfeel/requirements/REQ-030.md', shellBody('REQ-030'));
    write('.openfeel/requirements/REQ-031.md', filledBody('REQ-031'));
    const first = lintRequirementBodies(tmpDir);
    const second = lintRequirementBodies(tmpDir);
    expect(second).toEqual(first);
  });

  it('T11（REV-019）：emptyPlan 只统计在办需求；emptyBody 保持全量', () => {
    write('.openfeel/requirements/REQ-001.md', shellBody('REQ-001'));
    write('.openfeel/requirements/REQ-002.md', filledBody('REQ-002'));

    // ① 已登记状态：done / draft 都不需要执行前计划
    const statusOf = (id: string): 'done' | 'draft' | undefined =>
      id === 'REQ-001' ? 'done' : (id === 'REQ-002' ? 'draft' : undefined);
    const settled = lintRequirementBodies(tmpDir, { statusOf });
    // emptyBody 仍是全量：空壳 REQ-001（done）照旧列出
    expect(settled.empty).toEqual([{ id: 'REQ-001', emptySections: ['摘要', '目标与验收'] }]);
    expect(settled.missingPlan).toEqual([]);                 // done / draft → 不进 emptyPlan

    // ② 在办（scheduled / in_progress）→ 列入 emptyPlan
    const active = lintRequirementBodies(tmpDir, {
      statusOf: (id) => (id === 'REQ-001' ? 'scheduled' : 'in_progress'),
    });
    expect(active.missingPlan).toEqual([{ id: 'REQ-001' }, { id: 'REQ-002' }]);

    // ③ 状态未知（未登记 flow.json）→ 保守保留（advisory 宁可多列）
    expect(lintRequirementBodies(tmpDir, { statusOf: () => undefined }).missingPlan)
      .toEqual([{ id: 'REQ-001' }, { id: 'REQ-002' }]);
  });

  it('T12（REV-019）：默认状态源 = FlowManager 读 flow.json（done 需求不进 emptyPlan）', () => {
    write('.openfeel/requirements/REQ-010.md', filledBody('REQ-010'));
    write('.openfeel/requirements/REQ-011.md', filledBody('REQ-011'));
    write('.openfeel/flow.json', JSON.stringify({
      meta: { version: '1.0', project: 'T', updated: '2026-01-01T00:00:00Z', revision: 0 },
      pipeline: { phase: 'active', current: { stage: '', op: '' }, retry: 0 },
      stages: {},
      reviews: [],
      log: [],
      requirements: [
        { id: 'REQ-010', status: 'done' },
        { id: 'REQ-011', status: 'in_progress' },
      ],
    }));
    // 两份正文都写实 ⇒ 都缺计划；只有 in_progress 的 REQ-011 应被列入
    expect(lintRequirementBodies(tmpDir).missingPlan).toEqual([{ id: 'REQ-011' }]);
  });

  it('T13（REV-019）：已随版本归档的需求（flow.json 无条目）同样不进 emptyPlan', () => {
    write('.openfeel/requirements/REQ-040.md', filledBody('REQ-040'));
    write('.openfeel/requirements/REQ-041.md', filledBody('REQ-041'));
    // REQ-040 已归档（done）→ 已处置；REQ-041 从未登记且未归档 → 保守列出
    write('.openfeel/flow-archive/v1.6.0.json', JSON.stringify({
      version: 'v1.6.0',
      requirements: [{ id: 'REQ-040', status: 'done' }],
    }));
    write('.openfeel/flow.json', JSON.stringify({
      meta: { version: '1.0', project: 'T', updated: '2026-01-01T00:00:00Z', revision: 0 },
      pipeline: { phase: 'active', current: { stage: '', op: '' }, retry: 0 },
      stages: {},
      reviews: [],
      log: [],
      requirements: [],
    }));
    expect(lintRequirementBodies(tmpDir).missingPlan).toEqual([{ id: 'REQ-041' }]);
  });
});

describe('body-lint：阶段文档', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-body-lint-stage-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  /** 写文件（自动建父目录） */
  function write(relPath: string, content: string): void {
    const abs = join(tmpDir, relPath);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content, 'utf-8');
  }

  it('T7：只报「存在但未写实」的 overview / plan；缺失与写实均不计入', () => {
    // stage-101：空 overview + 写实 plan → 只进 overviewEmpty
    write('.openfeel/plan/v1/stage-101/overview.md', shellOverview());
    write('.openfeel/plan/v1/stage-101/plan.md', filledStagePlan());
    // stage-102：写实 overview + 空 plan → 只进 planEmpty
    write('.openfeel/plan/v1/stage-102/overview.md', filledOverview());
    write('.openfeel/plan/v1/stage-102/plan.md', shellStagePlan());
    // stage-103：两个文件都缺失 → 都不是空壳（缺失是常态，不是「存在但没写实」）
    write('.openfeel/plan/v1/stage-103/notes.txt', 'placeholder');
    // stage-104：都写实 → 不计入
    write('.openfeel/plan/v1/stage-104/overview.md', filledOverview());
    write('.openfeel/plan/v1/stage-104/plan.md', filledStagePlan());

    const report = lintStageDocs(tmpDir);
    expect(report.overviewEmpty).toEqual([{ stageId: 'stage-101' }]);
    expect(report.planEmpty).toEqual([{ stageId: 'stage-102' }]);
  });

  it('T8：`.openfeel/plan` 不存在 → 两个集合均为空', () => {
    expect(lintStageDocs(tmpDir)).toEqual({ overviewEmpty: [], planEmpty: [] });
  });

  it('T9：非 stage-NN 目录不被当作阶段（只认目录名形态）', () => {
    write('.openfeel/plan/v1/reqs/overview.md', shellOverview());
    write('.openfeel/plan/v1/stageX/overview.md', shellOverview());
    expect(lintStageDocs(tmpDir)).toEqual({ overviewEmpty: [], planEmpty: [] });
  });

  it('T10：series 目录可嵌套，stageId 取目录名短名', () => {
    write('.openfeel/plan/v1/stage-201/overview.md', shellOverview());
    expect(lintStageDocs(tmpDir).overviewEmpty).toEqual([{ stageId: 'stage-201' }]);
  });
});
