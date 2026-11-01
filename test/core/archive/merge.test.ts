/**
 * Archive Merge 单元测试
 * 测试阶段归档核心操作：归档汇总、摘要生成、知识提取
 * v1.5.8（REQ-024）：已完成需求汇总 / 发布说明草稿 / 按 harness 生成 skill
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FlowManager } from '../../../src/core/flow-manager.js';
import {
  archiveStage,
  ArchiveExistsError,
  InvalidSkillSlugError,
  type ArchiveResult,
} from '../../../src/core/archive/merge.js';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// 隔离 HOME：skill 生成的 harness 探测在项目无标记时会读全局标记（v1.5.8）
const mockHome = vi.hoisted(() => ({ dir: '' }));
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => mockHome.dir };
});

/**
 * 创建含阶段和操作的基础 FlowData 用于测试
 */
function makeFlowWithStage(stageName: string, overrides?: Record<string, unknown>) {
  return {
    meta: { version: '1.0', project: 'Test', updated: new Date().toISOString() },
    pipeline: { phase: 'plan_pending' as const, current: { stage: '', op: '' }, retry: 0 },
    stages: {
      [stageName]: {
        name: '测试阶段',
        status: 'in_progress',
        deps: [] as string[],
        ops: {
          'op-001': {
            id: 'op-001', title: '操作1', state: 'done' as const,
            assignee: 'openfeel-executor', attempts: 1, max_attempts: 3,
            checkpoints: {
              plan: 'passed', scheme: 'passed',
              exec: { attempts: 1, self: 'passed' },
              review: 'passed', test: 'passed',
            },
          },
          'op-002': {
            id: 'op-002', title: '操作2', state: 'pending' as const,
            assignee: 'openfeel-executor', attempts: 0, max_attempts: 3,
            checkpoints: {
              plan: 'pending', scheme: 'pending',
              exec: { attempts: 0, self: 'pending' },
              review: 'pending', test: 'pending',
            },
          },
        },
      },
    },
    reviews: [] as Array<{
      id: string; op: string; status: 'open' | 'resolved' | 'closed';
      priority: 'high' | 'medium' | 'low'; title: string;
      filed_by: string; filed_at: string;
    }>,
    log: [] as Array<{ time: string; agent: string; action: string; detail: Record<string, unknown> }>,
    ...overrides,
  };
}

describe('Archive Merge', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-archive-test-'));
    mockHome.dir = tmpDir;
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    mockHome.dir = '';
  });

  describe('archiveStage', () => {
    it('flow.json 未初始化时应返回 null', () => {
      const result = archiveStage(tmpDir, 'stage-01');
      expect(result).toBeNull();
    });

    it('阶段不存在时应返回 null', () => {
      FlowManager.initFlow(tmpDir);
      const result = archiveStage(tmpDir, 'nonexistent-stage');
      expect(result).toBeNull();
    });

    it('正常归档有 ops 和 reviews 的阶段', () => {
      FlowManager.initFlow(tmpDir);
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeFlowWithStage('stage-06', {
        reviews: [
          {
            id: 'REV-001', op: 'stage-06.op-001', status: 'closed',
            priority: 'high', title: '已解决: 类型推导优化',
            filed_by: 'openfeel-reviewer', filed_at: '2026-06-01T00:00:00Z',
          },
          {
            id: 'REV-002', op: 'stage-06.op-002', status: 'resolved',
            priority: 'medium', title: '已修复: 空值处理',
            filed_by: 'openfeel-reviewer', filed_at: '2026-06-02T00:00:00Z',
          },
          {
            id: 'REV-003', op: 'stage-06.op-001', status: 'open',
            priority: 'low', title: '待处理: 日志格式',
            filed_by: 'openfeel-reviewer', filed_at: '2026-06-03T00:00:00Z',
          },
          {
            // 不同阶段的审查条目，不应被计入
            id: 'REV-004', op: 'stage-07.op-001', status: 'closed',
            priority: 'medium', title: '无关条目',
            filed_by: 'openfeel-reviewer', filed_at: '2026-06-01T00:00:00Z',
          },
        ],
      }));
      mgr.save();

      const result = archiveStage(tmpDir, 'stage-06');
      expect(result).not.toBeNull();

      // 验证 ArchiveResult 字段
      expect(result!.opsCount).toBe(2);
      expect(result!.reviewsCount).toBe(3); // 只有 stage-06 相关审查条目

      // 验证摘要内容包含关键信息
      expect(result!.summary).toContain('# 归档摘要 — stage-06');
      expect(result!.summary).toContain('操作1');
      expect(result!.summary).toContain('操作2');
      expect(result!.summary).toContain('已解决: 类型推导优化');
      expect(result!.summary).toContain('已修复: 空值处理');
      expect(result!.summary).toContain('待处理: 日志格式');

      // 无关条目不应出现
      expect(result!.summary).not.toContain('无关条目');
    });

    it('v1.3.3 P0-2：stage 级 REV（op=含点 stageId）纳入归档摘要，不被 lastIndexOf 误切', () => {
      FlowManager.initFlow(tmpDir);
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeFlowWithStage('v0.0.1-stage-01', {
        reviews: [
          {
            id: 'REV-101', op: 'v0.0.1-stage-01', status: 'closed',
            priority: 'medium', title: '阶段级审查（无 op）',
            filed_by: 'cli', filed_at: '2026-10-30T00:00:00Z',
          },
          {
            // 真正属于别的阶段：不应被计入
            id: 'REV-102', op: 'v0.0.1-stage-02.op-001', status: 'open',
            priority: 'low', title: '别的阶段',
            filed_by: 'cli', filed_at: '2026-10-30T00:00:01Z',
          },
        ],
      }));
      mgr.save();

      const result = archiveStage(tmpDir, 'v0.0.1-stage-01');
      expect(result).not.toBeNull();
      expect(result!.reviewsCount).toBe(1);
      expect(result!.summary).toContain('REV-101');
      expect(result!.summary).not.toContain('别的阶段');
    });

    it('空阶段（无 ops）正常归档', () => {
      FlowManager.initFlow(tmpDir);
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeFlowWithStage('stage-empty', {
        stages: {
          'stage-empty': {
            name: '空阶段',
            status: 'pending',
            deps: [],
            ops: {},
          },
        },
      }));
      mgr.save();

      const result = archiveStage(tmpDir, 'stage-empty');
      expect(result).not.toBeNull();
      expect(result!.opsCount).toBe(0);
      expect(result!.reviewsCount).toBe(0);
    });

    it('阶段缺 deps 字段时归档不抛错且摘要为「依赖阶段：无」（archive BUG-001）', () => {
      FlowManager.initFlow(tmpDir);
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeFlowWithStage('stage-nodeps', {
        stages: {
          'stage-nodeps': {
            name: '无 deps 字段阶段',
            status: 'pending',
            // 故意不提供 deps（存量数据鲁棒性）
            ops: {},
          },
        },
      }));
      mgr.save();

      const result = archiveStage(tmpDir, 'stage-nodeps');
      expect(result).not.toBeNull();
      expect(result!.summary).toContain('依赖阶段**：无');
    });

    it('归档文件应生成在 .openfeel/log/archive-{stage}.md', () => {
      FlowManager.initFlow(tmpDir);
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeFlowWithStage('stage-06'));
      mgr.save();

      archiveStage(tmpDir, 'stage-06');

      const archivePath = join(tmpDir, '.openfeel', 'log', 'archive-stage-06.md');
      expect(existsSync(archivePath)).toBe(true);

      // 验证文件内容
      const content = readFileSync(archivePath, 'utf-8');
      expect(content).toContain('# 归档摘要 — stage-06');
      expect(content).toContain('操作1');
    });

    it('知识提取：只有 closed 和 resolved 状态被提取', () => {
      FlowManager.initFlow(tmpDir);
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeFlowWithStage('stage-06', {
        reviews: [
          {
            id: 'REV-001', op: 'stage-06.op-001', status: 'closed',
            priority: 'high', title: '知识A',
            filed_by: 'r', filed_at: '2026-01-01T00:00:00Z',
          },
          {
            id: 'REV-002', op: 'stage-06.op-001', status: 'resolved',
            priority: 'medium', title: '知识B',
            filed_by: 'r', filed_at: '2026-01-01T00:00:00Z',
          },
          {
            id: 'REV-003', op: 'stage-06.op-001', status: 'open',
            priority: 'low', title: '待处理问题',
            filed_by: 'r', filed_at: '2026-01-01T00:00:00Z',
          },
        ],
      }));
      mgr.save();

      const result = archiveStage(tmpDir, 'stage-06');
      expect(result).not.toBeNull();

      // knowledgeExtracts 应只包含 closed 和 resolved 的条目
      expect(result!.knowledgeExtracts.length).toBe(2);
      expect(result!.knowledgeExtracts).toContain('[REV-001] 知识A');
      expect(result!.knowledgeExtracts).toContain('[REV-002] 知识B');
      // open 状态不应被提取
      const hasOpen = result!.knowledgeExtracts.some((e) => e.includes('待处理问题'));
      expect(hasOpen).toBe(false);
    });

    it('无 closed/resolved 审查条目时 knowledgeExtracts 为空数组', () => {
      FlowManager.initFlow(tmpDir);
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeFlowWithStage('stage-06', {
        reviews: [
          {
            id: 'REV-001', op: 'stage-06.op-001', status: 'open',
            priority: 'low', title: '仅开放条目',
            filed_by: 'r', filed_at: '2026-01-01T00:00:00Z',
          },
        ],
      }));
      mgr.save();

      const result = archiveStage(tmpDir, 'stage-06');
      expect(result).not.toBeNull();
      expect(result!.knowledgeExtracts).toEqual([]);
    });

    it('归档日志应追加到 flow.json', () => {
      FlowManager.initFlow(tmpDir);
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeFlowWithStage('stage-06'));
      mgr.save();

      // 记录日志数
      const mgrBefore = new FlowManager(tmpDir);
      const beforeCount = mgrBefore.getData()!.log.length;

      archiveStage(tmpDir, 'stage-06');

      const mgrAfter = new FlowManager(tmpDir);
      expect(mgrAfter.getData()!.log.length).toBe(beforeCount + 1);
      const lastLog = mgrAfter.getData()!.log[beforeCount];
      expect(lastLog.action).toBe('archive_stage');
      expect(lastLog.agent).toBe('openfeel-archiver');
    });

    it('T3：含点 stageId（v1.0.0-stage-04）的审查条目应被计入（lastIndexOf 分割）', () => {
      FlowManager.initFlow(tmpDir);
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeFlowWithStage('v1.0.0-stage-04', {
        reviews: [
          {
            id: 'REV-001', op: 'v1.0.0-stage-04.op-001', status: 'closed',
            priority: 'high', title: '含点阶段审查记录',
            filed_by: 'openfeel-reviewer', filed_at: '2026-06-01T00:00:00Z',
          },
          {
            // 不同阶段，不应被计入
            id: 'REV-002', op: 'v1.0.0-stage-05.op-001', status: 'closed',
            priority: 'low', title: '无关条目',
            filed_by: 'openfeel-reviewer', filed_at: '2026-06-01T00:00:00Z',
          },
        ],
      }));
      mgr.save();

      const result = archiveStage(tmpDir, 'v1.0.0-stage-04');
      expect(result).not.toBeNull();
      expect(result!.reviewsCount).toBe(1);
      expect(result!.summary).toContain('含点阶段审查记录');
      expect(result!.summary).not.toContain('无关条目');
    });

    // ── v1.2.4 A1：归档覆盖保护（core 层） ──

    /** 归档内容哈希 + flow.json revision / log 长度（零写盘主判据） */
    function snapshot(stageName: string): { hash: string; revision: number | undefined; logLength: number } {
      const archivePath = join(tmpDir, '.openfeel', 'log', `archive-${stageName}.md`);
      const data = new FlowManager(tmpDir).getData()!;
      return {
        hash: createHash('sha256').update(readFileSync(archivePath)).digest('hex'),
        revision: data.meta.revision,
        logLength: data.log.length,
      };
    }

    it('A1: 已有归档且未 force → 抛 ArchiveExistsError 且零写盘', () => {
      FlowManager.initFlow(tmpDir);
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeFlowWithStage('stage-06'));
      mgr.save();
      archiveStage(tmpDir, 'stage-06');
      const before = snapshot('stage-06');

      expect(() => archiveStage(tmpDir, 'stage-06')).toThrow(ArchiveExistsError);
      // 错误携带目标路径，供命令层 detail 使用
      try {
        archiveStage(tmpDir, 'stage-06');
      } catch (err) {
        expect((err as ArchiveExistsError).archivePath).toBe(
          join(tmpDir, '.openfeel', 'log', 'archive-stage-06.md'),
        );
        expect((err as ArchiveExistsError).stage).toBe('stage-06');
      }
      expect(snapshot('stage-06')).toEqual(before);
    });

    it('A1: force=true → 真实覆盖（哈希变化 / revision 递增 / log 追加）', () => {
      FlowManager.initFlow(tmpDir);
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeFlowWithStage('stage-06'));
      mgr.save();
      archiveStage(tmpDir, 'stage-06');
      const before = snapshot('stage-06');

      const result = archiveStage(tmpDir, 'stage-06', { force: true });
      expect(result).not.toBeNull();
      const after = snapshot('stage-06');
      expect(after.hash).not.toBe(before.hash);
      expect(after.revision).toBeGreaterThan(before.revision as number);
      expect(after.logLength).toBe(before.logLength + 1);
    });

    it('A1: 别名边界 → 短名/全名派生不同目标文件，互不触发保护', () => {
      FlowManager.initFlow(tmpDir);
      const mgr = new FlowManager(tmpDir);
      const data = makeFlowWithStage('v1.2.0-stage-78', {
        stages: {
          'v1.2.0-stage-78': { name: 'v1.2.0-stage-78', status: 'pending', deps: [], ops: {} },
          'stage-78': { name: 'stage-78', status: 'pending', deps: [], ops: {} },
        },
      });
      mgr.setData(data);
      mgr.save();

      expect(archiveStage(tmpDir, 'v1.2.0-stage-78')).not.toBeNull();
      // 短名派生 archive-stage-78.md：不应被全名归档文件触发
      expect(archiveStage(tmpDir, 'stage-78')).not.toBeNull();
      expect(existsSync(join(tmpDir, '.openfeel', 'log', 'archive-v1.2.0-stage-78.md'))).toBe(true);
      expect(existsSync(join(tmpDir, '.openfeel', 'log', 'archive-stage-78.md'))).toBe(true);
      // 全名重跑 → 只保护全名文件
      expect(() => archiveStage(tmpDir, 'v1.2.0-stage-78')).toThrow(ArchiveExistsError);
    });
  });

  // ── v1.5.8 / REQ-024：归档官增强 ──

  describe('v1.5.8 归档官增强（REQ-024）', () => {
    const stageName = 'v1.5.8-stage-122';
    const version = 'v1.5.8';
    const releaseNotesRel = join('docs', 'releases', `${version}.md`);

    /** 建 flow：阶段 v1.5.8-stage-122 + 三条需求（REQ-003 经 requirement_id 关联、版本不同） */
    function setupFlow(requirementId: string | null = 'REQ-003'): void {
      FlowManager.initFlow(tmpDir);
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeFlowWithStage(stageName, {
        stages: {
          [stageName]: {
            name: '归档官增强',
            status: 'in_progress',
            deps: [],
            requirement_id: requirementId,
            ops: {
              'op-001': {
                id: 'op-001', title: '归档增强', state: 'done' as const,
                assignee: 'openfeel-executor', attempts: 1, max_attempts: 3,
                checkpoints: {
                  plan: 'passed', scheme: 'passed',
                  exec: { attempts: 1, self: 'passed' },
                  review: 'passed', test: 'passed',
                },
              },
            },
          },
        },
        requirements: [
          {
            id: 'REQ-001', title: '已完成A', status: 'done', target_version: version,
            priority: 'P1', created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-30T00:00:00Z',
          },
          {
            id: 'REQ-002', title: '进行中B', status: 'in_progress', target_version: version,
            priority: 'P2', created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-31T00:00:00Z',
          },
          {
            id: 'REQ-003', title: '已完成C', status: 'done', target_version: 'v1.4.0',
            priority: 'P0', created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-30T00:00:00Z',
          },
        ],
      }));
      mgr.save();
    }

    it('归档摘要含「已完成需求」：版本命中 ∪ 阶段关联，排除未完成需求', () => {
      setupFlow();
      const result = archiveStage(tmpDir, stageName);
      expect(result).not.toBeNull();

      const summary = result!.summary;
      expect(summary).toContain('## 已完成需求');
      expect(summary).toContain('REQ-001');
      expect(summary).toContain('已完成A');
      expect(summary).toContain('REQ-003');        // requirement_id 命中（版本不同也并入）
      expect(summary).toContain('已完成C');
      expect(summary).not.toContain('REQ-002');    // status != done
      expect(result!.generated.requirements).toEqual(['REQ-001', 'REQ-003']);

      // 归档文件落盘内容与 summary 一致
      const archiveFile = join(tmpDir, '.openfeel', 'log', `archive-${stageName}.md`);
      expect(readFileSync(archiveFile, 'utf-8')).toContain('## 已完成需求');
    });

    it('多需求关联（REQ-028）：摘要列出全部关联需求，已完成需求仍只收 done（版本命中在前）', () => {
      FlowManager.initFlow(tmpDir);
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeFlowWithStage(stageName, {
        stages: {
          [stageName]: {
            name: '多需求阶段', status: 'in_progress', deps: [], ops: {},
            requirements: [{ id: 'REQ-002' }, { id: 'REQ-003' }],
          },
        },
        requirements: [
          {
            id: 'REQ-001', title: '已完成A', status: 'done', target_version: version,
            priority: 'P1', created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-30T00:00:00Z',
          },
          {
            id: 'REQ-002', title: '进行中B', status: 'in_progress', target_version: version,
            priority: 'P2', created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-31T00:00:00Z',
          },
          {
            id: 'REQ-003', title: '已完成C', status: 'done', target_version: 'v1.4.0',
            priority: 'P0', created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-30T00:00:00Z',
          },
        ],
      }));
      mgr.save();

      const result = archiveStage(tmpDir, stageName);
      expect(result).not.toBeNull();
      // 阶段信息列出该 stage 的全部关联需求（声明序）
      expect(result!.summary).toContain('- **关联需求**：REQ-002, REQ-003');
      // 已完成需求 = 版本命中（REQ-001）∪ 关联命中且 done（REQ-003）；REQ-002 未完成被排除
      expect(result!.generated.requirements).toEqual(['REQ-001', 'REQ-003']);
      expect(result!.summary).not.toContain('进行中B');
    });

    it('无已完成需求时摘要该节写「无」，generated.requirements 为空数组', () => {
      FlowManager.initFlow(tmpDir);
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeFlowWithStage(stageName, {
        stages: {
          [stageName]: { name: '无需求阶段', status: 'pending', deps: [], ops: {} },
        },
      }));
      mgr.save();

      const result = archiveStage(tmpDir, stageName);
      expect(result).not.toBeNull();
      expect(result!.summary).toContain('## 已完成需求\n\n无');
      expect(result!.generated.requirements).toEqual([]);
    });

    it('生成 docs/releases/<version>.md 草稿，返回相对路径', () => {
      setupFlow();
      const result = archiveStage(tmpDir, stageName);
      expect(result).not.toBeNull();
      expect(result!.generated.releaseNotes).toBe(releaseNotesRel);

      const abs = join(tmpDir, releaseNotesRel);
      expect(existsSync(abs)).toBe(true);
      const content = readFileSync(abs, 'utf-8');
      expect(content).toContain(`# ${version} 发布说明`);
      expect(content).toContain('## 已完成需求');
      expect(content).toContain('**REQ-001** 已完成A（P1）');
      expect(content).toContain('## 变更摘要');
      expect(content).toContain(`.openfeel/log/archive-${stageName}.md`);
      expect(content).toContain('## 升级与验证');
    });

    it('发布说明已存在 → 不覆盖（releaseNotes 为 null）；--force 才覆盖', () => {
      setupFlow();
      const abs = join(tmpDir, releaseNotesRel);
      mkdirSync(join(tmpDir, 'docs', 'releases'), { recursive: true });
      writeFileSync(abs, 'KEEP-RELEASE-NOTES', 'utf-8');

      const first = archiveStage(tmpDir, stageName);
      expect(first).not.toBeNull();
      expect(first!.generated.releaseNotes).toBeNull();
      expect(readFileSync(abs, 'utf-8')).toBe('KEEP-RELEASE-NOTES');

      const forced = archiveStage(tmpDir, stageName, { force: true });
      expect(forced).not.toBeNull();
      expect(forced!.generated.releaseNotes).toBe(releaseNotesRel);
      const content = readFileSync(abs, 'utf-8');
      expect(content).not.toBe('KEEP-RELEASE-NOTES');
      expect(content).toContain(`# ${version} 发布说明`);
    });

    it('--skill：按探测到的 harness 各写一份 SKILL.md（.dsh / .claude）', () => {
      setupFlow();
      mkdirSync(join(tmpDir, '.dsh'), { recursive: true });
      mkdirSync(join(tmpDir, '.claude'), { recursive: true });

      const result = archiveStage(tmpDir, stageName, { skill: 'openfeel-archive' });
      expect(result).not.toBeNull();

      const expected = [
        join('.dsh', 'skills', 'openfeel-archive', 'SKILL.md'),
        join('.claude', 'skills', 'openfeel-archive', 'SKILL.md'),
      ];
      expect(result!.generated.skills).toEqual(expected);

      for (const rel of expected) {
        const abs = join(tmpDir, rel);
        expect(existsSync(abs)).toBe(true);
        const content = readFileSync(abs, 'utf-8');
        expect(content).toContain('# Openfeel Archive');            // slug 标题化默认值
        expect(content).toContain('由 OpenFeel 归档生成');
        expect(content).toContain(`（${version} · `);
        expect(content).toContain('## 何时使用');
        expect(content).toContain('REQ-001 已完成A');                // 依据需求标题
        expect(content).toContain('## 步骤');
        expect(content).toContain('## 参考');
        expect(content).toContain(`.openfeel/log/archive-${stageName}.md`);
        expect(content).toContain(releaseNotesRel);                  // 发布说明路径
      }
    });

    it('无 --skill 选项 → 不生成任何 skill 文件', () => {
      setupFlow();
      mkdirSync(join(tmpDir, '.dsh'), { recursive: true });

      const result = archiveStage(tmpDir, stageName);
      expect(result).not.toBeNull();
      expect(result!.generated.skills).toEqual([]);
      expect(existsSync(join(tmpDir, '.dsh', 'skills'))).toBe(false);
    });

    it('skill 已存在 → 不覆盖（skills 为空）；--force 才覆盖', () => {
      setupFlow();
      mkdirSync(join(tmpDir, '.dsh'), { recursive: true });
      const skillAbs = join(tmpDir, '.dsh', 'skills', 'openfeel-archive', 'SKILL.md');
      mkdirSync(join(tmpDir, '.dsh', 'skills', 'openfeel-archive'), { recursive: true });
      writeFileSync(skillAbs, 'KEEP-SKILL', 'utf-8');

      const first = archiveStage(tmpDir, stageName, { skill: 'openfeel-archive' });
      expect(first).not.toBeNull();
      expect(first!.generated.skills).toEqual([]);
      expect(readFileSync(skillAbs, 'utf-8')).toBe('KEEP-SKILL');

      const forced = archiveStage(tmpDir, stageName, { force: true, skill: 'openfeel-archive' });
      expect(forced).not.toBeNull();
      expect(forced!.generated.skills).toEqual([join('.dsh', 'skills', 'openfeel-archive', 'SKILL.md')]);
      expect(readFileSync(skillAbs, 'utf-8')).toContain('# Openfeel Archive');
    });

    it('非法 slug → 抛 InvalidSkillSlugError 且零写盘', () => {
      setupFlow();
      const archiveFile = join(tmpDir, '.openfeel', 'log', `archive-${stageName}.md`);
      const releaseAbs = join(tmpDir, releaseNotesRel);
      const before = new FlowManager(tmpDir).getData()!;
      const revisionBefore = before.meta.revision;
      const logBefore = before.log.length;

      for (const bad of ['OpenFeel', 'a/b', '-leading', '', 'has space']) {
        expect(() => archiveStage(tmpDir, stageName, { skill: bad })).toThrow(InvalidSkillSlugError);
      }

      expect(existsSync(archiveFile)).toBe(false);
      expect(existsSync(releaseAbs)).toBe(false);
      expect(existsSync(join(tmpDir, '.dsh'))).toBe(false);
      const after = new FlowManager(tmpDir).getData()!;
      expect(after.meta.revision).toBe(revisionBefore);
      expect(after.log.length).toBe(logBefore);

      try {
        archiveStage(tmpDir, stageName, { skill: 'BAD' });
      } catch (err) {
        expect((err as InvalidSkillSlugError).skill).toBe('BAD');
      }
    });

    it('阶段名无法解析出模块版本 → 跳过发布说明（releaseNotes 为 null）但仍归档', () => {
      FlowManager.initFlow(tmpDir);
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeFlowWithStage('stage-empty', {
        stages: { 'stage-empty': { name: '空阶段', status: 'pending', deps: [], ops: {} } },
        requirements: [
          {
            id: 'REQ-009', title: '短名阶段关联', status: 'done', target_version: 'v9.9.9',
            priority: 'P2', created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-02T00:00:00Z',
          },
        ],
      }));
      mgr.save();

      // 短名 stage-empty 无法被 parseStageId 解析 → 版本为 null；目标版本需求不被误并
      const result = archiveStage(tmpDir, 'stage-empty', { skill: 'foo-bar' });
      expect(result).not.toBeNull();
      expect(result!.generated.releaseNotes).toBeNull();
      expect(result!.generated.requirements).toEqual([]);
      // 回退 harness（无项目标记 + HOME 隔离）→ .opencode/skills/foo-bar/SKILL.md
      expect(result!.generated.skills).toEqual([join('.opencode', 'skills', 'foo-bar', 'SKILL.md')]);
      expect(existsSync(join(tmpDir, '.opencode', 'skills', 'foo-bar', 'SKILL.md'))).toBe(true);
    });
  });
});
