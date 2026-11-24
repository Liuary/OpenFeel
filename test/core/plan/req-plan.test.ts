/**
 * plan-file 单元测试 — 需求级计划骨架（v1.7.0 / REQ-064 A64.1 / A64.3）
 *
 * 覆盖：
 * - 四节骨架齐全且 `isRequirementPlanFilled` 为真（内容从需求正文派生，不编判据）；
 * - `## 目标` ← 摘要、`## 任务拆解` ← 判据行、`## 验收判据` ← `## 目标与验收` 原文；
 * - 正文未写实 → 各节诚实留空占位（`isRequirementPlanFilled` 为假，不冒充写实）；
 * - 已存在默认拒绝（**零写盘 / 字节不变**）、`--force` 才覆盖（`overwritten:true`）；
 * - 路径恒为 `.openfeel/plan/reqs/REQ-NNN.plan.md`（POSIX 相对路径）；
 * - 标题从正文 H1 解析（`readRequirementPlanTitle`）。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  buildRequirementPlanSkeleton,
  readRequirementPlanTitle,
  toRequirementPlanSeed,
  writeRequirementPlanSkeleton,
  RequirementPlanFileError,
} from '../../../src/core/req/plan-file.js';
import { getRequirementPlanRelPath } from '../../../src/core/plan/path.js';
import { extractSection, isRequirementPlanFilled } from '../../../src/core/plan/filled.js';

const FILLED_SUMMARY =
  '把需求级计划从手写模板变成一条命令生成：骨架内容全部从需求正文派生，判据仍由 filled.ts 单点判定。';
const CRITERIA_1 = '- A64.1：`req plan` 生成四节骨架且路径恒为 `.openfeel/plan/reqs/REQ-NNN.plan.md`。';
const CRITERIA_2 = '- A64.2：`req body --from` 一次导入多节，元信息小节不被覆盖。';

describe('需求级计划骨架（v1.7.0 / REQ-064）', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-req-plan-'));
    mkdirSync(join(tmpDir, '.openfeel', 'requirements'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  /** 写需求正文（覆盖既有骨架） */
  function writeBody(id: string, title: string, sections: string[]): void {
    writeFileSync(join(tmpDir, '.openfeel', 'requirements', `${id}.md`), [
      `# ${id}：${title}`,
      '',
      ...sections,
      '',
    ].join('\n'), 'utf-8');
  }

  function writeFilledBody(id = 'REQ-001', title = '需求计划生成'): void {
    writeBody(id, title, [
      '## 摘要',
      '',
      FILLED_SUMMARY,
      '',
      '## 目标与验收',
      '',
      CRITERIA_1,
      CRITERIA_2,
      '',
      '## 变更记录',
      '',
      '- 2026-01-01 创建',
    ]);
  }

  function planPath(id = 'REQ-001'): string {
    return join(tmpDir, '.openfeel', 'plan', 'reqs', `${id}.plan.md`);
  }

  // ═══ 1. 四节骨架 + 写实判据 ═══

  it('四节齐全且 isRequirementPlanFilled 为真（内容从正文派生）', () => {
    writeFilledBody();
    const md = buildRequirementPlanSkeleton(tmpDir, { id: 'REQ-001', title: '需求计划生成' }, { now: '2026-01-02T00:00:00.000Z' });

    for (const name of ['目标', '任务拆解', '验收判据', '偏差与回写', '变更记录']) {
      expect(md).toContain(`## ${name}`);
    }
    // 三节写实（判据单点复用 filled.ts，不新写规则）
    expect(isRequirementPlanFilled(md)).toBe(true);
    // 派生关系：目标 ← 摘要；任务拆解 ← 判据行（转可勾任务）；验收判据 ← 目标与验收原文
    expect(extractSection(md, '目标')).toContain(FILLED_SUMMARY.slice(0, 20));
    const tasks = extractSection(md, '任务拆解')!;
    expect(tasks).toContain('- [ ] A64.1');
    expect(tasks).toContain('- [ ] A64.2');
    const criteria = extractSection(md, '验收判据')!;
    expect(criteria).toContain('A64.1');
    expect(criteria).toContain('A64.2');
    // 变更记录带注入时间
    expect(extractSection(md, '变更记录')).toContain('2026-01-02T00:00:00.000Z');
  });

  it('正文未写实 → 三节诚实留空（isRequirementPlanFilled 为假，不冒充写实）', () => {
    writeBody('REQ-002', '空壳需求', [
      '## 摘要', '', '（待补充）', '',
      '## 目标与验收', '', '（待补充）', '',
    ]);
    const md = buildRequirementPlanSkeleton(tmpDir, { id: 'REQ-002', title: '空壳需求' });
    expect(isRequirementPlanFilled(md)).toBe(false);
    expect(extractSection(md, '目标')).toBe('（待补充）');
  });

  it('标题缺省回退 ID；空 ID 抛 invalid_field', () => {
    writeFilledBody();
    const md = buildRequirementPlanSkeleton(tmpDir, { id: 'REQ-001', title: '  ' });
    expect(md.startsWith('# REQ-001 计划：REQ-001')).toBe(true);

    try {
      buildRequirementPlanSkeleton(tmpDir, { id: '', title: 'x' });
      throw new Error('should throw');
    } catch (err) {
      expect(err).toBeInstanceOf(RequirementPlanFileError);
      expect((err as RequirementPlanFileError).code).toBe('invalid_field');
    }
  });

  // ═══ 2. 写盘 / 拒绝覆盖 / --force ═══

  it('写入固定路径 POSIX 相对路径 + created/overwritten/lines 同源', () => {
    writeFilledBody();
    const result = writeRequirementPlanSkeleton(tmpDir, { id: 'REQ-001', title: '需求计划生成' });

    expect(result.path).toBe('.openfeel/plan/reqs/REQ-001.plan.md');
    expect(result.path).toBe(getRequirementPlanRelPath('REQ-001'));
    expect(result.created).toBe(true);
    expect(result.overwritten).toBe(false);
    expect(result.filled).toBe(true);
    expect(existsSync(planPath())).toBe(true);
    const content = readFileSync(planPath(), 'utf-8');
    expect(result.lines).toBe(content.split(/\r?\n/).length);
    expect(isRequirementPlanFilled(content)).toBe(true);
  });

  it('已存在默认拒绝：exit 语义错误码 exists + 字节不变', () => {
    writeFilledBody();
    writeRequirementPlanSkeleton(tmpDir, { id: 'REQ-001', title: '需求计划生成', now: '2026-01-02T00:00:00.000Z' });
    const before = readFileSync(planPath(), 'utf-8');

    try {
      writeRequirementPlanSkeleton(tmpDir, { id: 'REQ-001', title: '需求计划生成', now: '2026-02-02T00:00:00.000Z' });
      throw new Error('should throw');
    } catch (err) {
      expect(err).toBeInstanceOf(RequirementPlanFileError);
      expect((err as RequirementPlanFileError).code).toBe('exists');
      expect((err as RequirementPlanFileError).existingPath).toBe(planPath());
    }
    expect(readFileSync(planPath(), 'utf-8')).toBe(before);
  });

  it('--force 覆盖：overwritten:true + created:false，内容按新注入时间重写', () => {
    writeFilledBody();
    writeRequirementPlanSkeleton(tmpDir, { id: 'REQ-001', title: '需求计划生成' }, { now: '2026-01-02T00:00:00.000Z' });
    const result = writeRequirementPlanSkeleton(
      tmpDir,
      { id: 'REQ-001', title: '需求计划生成' },
      { force: true, now: '2026-03-03T00:00:00.000Z' },
    );

    expect(result.created).toBe(false);
    expect(result.overwritten).toBe(true);
    expect(result.filled).toBe(true);
    expect(readFileSync(planPath(), 'utf-8')).toContain('2026-03-03T00:00:00.000Z');
  });

  // ═══ 3. 标题解析 / 种子转换 ═══

  it('readRequirementPlanTitle 从 H1 解析（全角/半角冒号）；读不到 → null', () => {
    writeFilledBody('REQ-003', '标题解析');
    expect(readRequirementPlanTitle(tmpDir, 'REQ-003')).toBe('标题解析');
    expect(readRequirementPlanTitle(tmpDir, 'REQ-404')).toBeNull();

    writeBody('REQ-004', '半角冒号', ['## 摘要', '', FILLED_SUMMARY, '']);
    // H1 由 writeBody 用全角冒号构造；显式半角再验一次
    writeFileSync(join(tmpDir, '.openfeel', 'requirements', 'REQ-004.md'), '# REQ-004: 半角标题\n\n## 摘要\n\nx\n', 'utf-8');
    expect(readRequirementPlanTitle(tmpDir, 'REQ-004')).toBe('半角标题');
  });

  it('toRequirementPlanSeed 只取 id/title', () => {
    expect(toRequirementPlanSeed({ id: 'REQ-001', title: 't' })).toEqual({ id: 'REQ-001', title: 't' });
  });
});
