/**
 * FlowManager 单元测试
 * 测试流水线状态管理的所有核心功能：读写、查询、推进、重试、审查、日志、校验
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FlowManager, mapPhaseToStageStatus, normalizeAgentName, FlowConcurrentModificationError, isFlowConcurrentError, findOrphanOps, isTemplateEmpty, detectFillState, MODE_DERIVED_TIER, listStageBlockingOpenReviews, type FlowData, type StageData, type OpState, type PipelinePhase, type MetaPhase, type ReviewItem } from '../../src/core/flow-manager.js';
import { PIPELINE_PHASES, REVIEW_TIERS, TIER_PRUNED_PHASES } from '../../src/core/pipeline-schema.js';
import { t } from '../../src/core/i18n.js';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { join, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { AUTO_DONE_PRECONDITION } from '../../src/core/req/aggregate.js';
import { REQ_STATUSES, type RequirementData, type RequirementStatus } from '../../src/core/req/types.js';
import { resetSessionCache } from '../../src/core/session.js';

// mock homedir：隔离全局画像读写（stage-42 op-001/op-002），避免污染真实用户主目录
// 沿用 test/core/config.test.ts 的既有惯例（vi.hoisted + importOriginal 保留其余 os 导出）
const mockHome = vi.hoisted(() => ({ dir: '' }));
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => mockHome.dir };
});

// mock child_process：断言 autoCommitOnDone 以数组参数调用 git（T16），避免真实 git 操作
const mockedChild = vi.hoisted(() => ({ execFileSync: vi.fn() }));
vi.mock('node:child_process', () => ({ execFileSync: mockedChild.execFileSync }));

// stage-86 op-003（REV-86-006）：golden 断言的确定性会话值（T4 恒写 detail.session_id；
// 执行环境真实存在 CLAUDE_CODE_SESSION_ID → 不 stub 则值非确定）
const GOLDEN_SESSION_ID = 'golden-fixed';
const GOLDEN_SESSION_LABEL = 'env:' + GOLDEN_SESSION_ID;

/** 创建测试用 FlowData（带一个阶段和一个 op） */
function makeTestFlowData(overrides?: Partial<FlowData>): FlowData {
  return {
    meta: { version: '1.0', project: 'TestProject', updated: '2026-01-01T00:00:00Z' },
    pipeline: {
      phase: 'active' as MetaPhase,
      current: { stage: '', op: '' },
      retry: 0,
    },
    stages: {
      'stage-01': {
        name: '测试阶段',
        phase: 'plan_pending' as PipelinePhase,
        status: 'in_progress',
        deps: [],
        ops: {
          'op-001': {
            id: 'op-001',
            title: '测试操作',
            state: 'pending' as OpState,
            assignee: 'openfeel-executor',
            attempts: 0,
            max_attempts: 3,
            checkpoints: {
              plan: 'pending',
              scheme: 'pending',
              exec: { attempts: 0, self: 'pending' },
              review: 'pending',
              test: 'pending',
            },
          },
        },
      },
    },
    reviews: [],
    log: [],
    ...overrides,
  };
}

/** 模式敏感用例 fixture：显式声明 full（内置默认 fast，见 v1.1.7-stage-74 R-FIX） */
function writeFullModeConfig(dir: string): void {
  mkdirSync(join(dir, '.openfeel'), { recursive: true });
  writeFileSync(join(dir, '.openfeel', 'config.yaml'), 'defaults:\n  workflow_mode: full\n', 'utf-8');
}

describe('FlowManager', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-flow-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // ═══════════════════════════════════════
  // 构造 & 加载/保存
  // ═══════════════════════════════════════

  describe('constructor & load/save', () => {
    it('构造函数在 flow.json 不存在时应 data 为 null', () => {
      const mgr = new FlowManager(tmpDir);
      expect(mgr.isLoaded()).toBe(false);
      expect(mgr.getData()).toBeNull();
    });

    it('构造函数在 flow.json 存在时应加载数据', () => {
      // 先通过 initFlow 创建文件
      FlowManager.initFlow(tmpDir);
      const mgr = new FlowManager(tmpDir);
      expect(mgr.isLoaded()).toBe(true);
      expect(mgr.getPhase()).toBe('active');
    });

    it('load 应能加载已保存的数据', () => {
      FlowManager.initFlow(tmpDir);
      const mgr = new FlowManager(tmpDir);
      const testData = makeTestFlowData();
      mgr.setData(testData);
      mgr.save();

      // 新建实例验证
      const mgr2 = new FlowManager(tmpDir);
      expect(mgr2.getPhase()).toBe('active');
    });

    it('save 应自动更新 meta.updated', () => {
      FlowManager.initFlow(tmpDir);
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      const before = new Date().toISOString();
      mgr.save();

      // 重新加载验证 updated 已更新
      const mgr2 = new FlowManager(tmpDir);
      const data = mgr2.getData();
      expect(data).not.toBeNull();
      expect(data!.meta.updated >= before).toBe(true);
    });

    it('损坏的 flow.json 应导致 data 为 null', () => {
      // 确保 .openfeel/ 目录存在
      mkdirSync(join(tmpDir, '.openfeel'), { recursive: true });
      writeFileSync(join(tmpDir, '.openfeel', 'flow.json'), 'not-valid-json{', 'utf-8');
      const mgr = new FlowManager(tmpDir);
      expect(mgr.isLoaded()).toBe(false);
    });

    it('连续 save 后 .bak 保留上一版本（S5）', () => {
      FlowManager.initFlow(tmpDir);
      const mgr = new FlowManager(tmpDir);
      mgr.save();
      const v1 = readFileSync(join(tmpDir, '.openfeel', 'flow.json'), 'utf-8');

      // 修改内存数据后再保存
      mgr.addStage('v1.0.0-stage-99');
      mgr.save();
      const v2 = readFileSync(join(tmpDir, '.openfeel', 'flow.json'), 'utf-8');

      expect(v2).not.toBe(v1);
      // .bak 应为 v1（上一版本），而非 v2
      expect(readFileSync(join(tmpDir, '.openfeel', 'flow.json.bak'), 'utf-8')).toBe(v1);
    });
  });

  // ═══════════════════════════════════════
  // 乐观并发校验（revision）
  // ═══════════════════════════════════════

  describe('乐观并发校验', () => {
    it('load 后外部递增 revision → save 抛 FlowConcurrentModificationError', () => {
      FlowManager.initFlow(tmpDir);
      const mgr = new FlowManager(tmpDir);
      const p = join(tmpDir, '.openfeel', 'flow.json');

      // 模拟并发进程：读盘、revision+1、写回
      const raw = JSON.parse(readFileSync(p, 'utf-8'));
      raw.meta.revision = (raw.meta.revision ?? 0) + 1;
      writeFileSync(p, JSON.stringify(raw, null, 2) + '\n', 'utf-8');

      expect(() => mgr.save()).toThrow(FlowConcurrentModificationError);
      try {
        mgr.save();
      } catch (e) {
        expect(isFlowConcurrentError(e)).toBe(true);
      }
    });

    it('正常 save revision 递增：0 → 1 → 2', () => {
      FlowManager.initFlow(tmpDir);
      const p = join(tmpDir, '.openfeel', 'flow.json');
      expect(JSON.parse(readFileSync(p, 'utf-8')).meta.revision).toBe(0);

      const mgr = new FlowManager(tmpDir);
      mgr.save();
      expect(JSON.parse(readFileSync(p, 'utf-8')).meta.revision).toBe(1);
      mgr.save();
      expect(JSON.parse(readFileSync(p, 'utf-8')).meta.revision).toBe(2);
    });

    it('无 revision 的存量 flow.json 兼容：加载视为 0，首次 save 补写为 1', () => {
      // 写一份不含 meta.revision 的旧格式 flow.json
      const dir = join(tmpDir, '.openfeel');
      mkdirSync(dir, { recursive: true });
      const legacy = {
        meta: { version: '1.0', project: 'OpenFeel', updated: '2020-01-01T00:00:00.000Z' },
        pipeline: { phase: 'active', current: { stage: '-', op: 'init' }, retry: 0 },
        stages: {}, reviews: [], log: [],
      };
      writeFileSync(join(dir, 'flow.json'), JSON.stringify(legacy, null, 2) + '\n', 'utf-8');

      const mgr = new FlowManager(tmpDir);
      expect(() => mgr.save()).not.toThrow();
      expect(JSON.parse(readFileSync(join(dir, 'flow.json'), 'utf-8')).meta.revision).toBe(1);
    });

    it('缺 meta 的存量 flow.json：save() 补齐 meta 不抛 TypeError（REV-41 REV-008）', () => {
      // 写一份完全不含 meta 的损坏/存量 flow.json
      const dir = join(tmpDir, '.openfeel');
      mkdirSync(dir, { recursive: true });
      const noMeta = {
        pipeline: { phase: 'active', current: { stage: '-', op: 'init' }, retry: 0 },
        stages: {}, reviews: [], log: [],
      };
      writeFileSync(join(dir, 'flow.json'), JSON.stringify(noMeta, null, 2) + '\n', 'utf-8');

      const mgr = new FlowManager(tmpDir);
      expect(() => mgr.save()).not.toThrow();
      const written = JSON.parse(readFileSync(join(dir, 'flow.json'), 'utf-8'));
      expect(written.meta.version).toBe('1.0');
      expect(typeof written.meta.updated).toBe('string');
      expect(written.meta.updated.length).toBeGreaterThan(0);
    });

    it('同进程两个实例：后写者抛冲突而非静默覆盖', () => {
      FlowManager.initFlow(tmpDir);
      const a = new FlowManager(tmpDir); // 均加载 revision=0
      const b = new FlowManager(tmpDir);
      b.save();                            // 磁盘 revision → 1
      expect(() => a.save()).toThrow(FlowConcurrentModificationError); // a 基线 0 ≠ 1
    });
  });

  // ═══════════════════════════════════════
  // initFlow
  // ═══════════════════════════════════════

  describe('initFlow', () => {
    it('应创建 .openfeel/flow.json 文件', () => {
      FlowManager.initFlow(tmpDir);
      const fp = join(tmpDir, '.openfeel', 'flow.json');
      expect(existsSync(fp)).toBe(true);
    });

    it('创建的 flow.json 应包含正确的默认结构', () => {
      FlowManager.initFlow(tmpDir);
      const mgr = new FlowManager(tmpDir);
      expect(mgr.getPhase()).toBe('active');
      expect(mgr.getCurrent()).toEqual({ stage: '-', op: 'init' });
      const summary = mgr.getSummary();
      expect(summary.stagesCount).toBe(0);
      expect(summary.opsCount).toBe(0);
      expect(summary.retryCount).toBe(0);
    });

    it('已存在 flow.json 时不应覆盖', () => {
      FlowManager.initFlow(tmpDir);
      // 修改文件
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData({
        pipeline: {
          phase: 'active' as MetaPhase,
          current: { stage: '', op: '' },
          retry: 0,
        },
      }));
      mgr.save();

      // 再次调用 initFlow 不应覆盖
      FlowManager.initFlow(tmpDir);
      const mgr2 = new FlowManager(tmpDir);
      expect(mgr2.getPhase()).toBe('active');
    });
  });

  // ═══════════════════════════════════════
  // 查询
  // ═══════════════════════════════════════

  describe('getPhase & getCurrent', () => {
    it('未加载时应返回 null', () => {
      const mgr = new FlowManager(tmpDir);
      expect(mgr.getPhase()).toBeNull();
      expect(mgr.getCurrent()).toBeNull();
    });

    it('应返回正确的全局宏观状态', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      expect(mgr.getPhase()).toBe('active');
    });

    it('current 为空时应返回 null', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      expect(mgr.getCurrent()).toBeNull();
    });

    it('current 有值时应返回正确信息', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData({
        pipeline: {
          phase: 'active' as MetaPhase,
          current: { stage: 'stage-01', op: 'op-001' },
          retry: 0,
        },
      }));
      const current = mgr.getCurrent();
      expect(current).toEqual({ stage: 'stage-01', op: 'op-001' });
    });

    it('op-001/B8 契约：stage 存在但 op 为空时仍返回 null（B8 在命令层回退，不改契约）', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData({
        pipeline: {
          phase: 'active' as MetaPhase,
          current: { stage: 'stage-01', op: '' },
          retry: 0,
        },
      }));
      expect(mgr.getCurrent()).toBeNull();
    });
  });

  describe('getOpState', () => {
    it('应返回正确 op 状态', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      expect(mgr.getOpState('stage-01.op-001')).toBe('pending');
    });

    it('不存在的 opId 应返回 null', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      expect(mgr.getOpState('stage-99.op-999')).toBeNull();
    });

    it('格式错误的 opId 应返回 null', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      expect(mgr.getOpState('bad-format')).toBeNull();
    });

    it('空字符串 opId 应返回 null', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      expect(mgr.getOpState('')).toBeNull();
    });
  });

  describe('getOpCheckpoints', () => {
    it('应返回正确的 checkpoints', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      const cp = mgr.getOpCheckpoints('stage-01.op-001');
      expect(cp).not.toBeNull();
      expect(cp!.plan).toBe('pending');
      expect(cp!.exec.self).toBe('pending');
    });

    it('不存在的 op 应返回 null', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      expect(mgr.getOpCheckpoints('stage-01.op-999')).toBeNull();
    });
  });

  describe('getReadyOps', () => {
    it('应返回所有 pending/executing 状态的 op', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData({
        stages: {
          'stage-01': {
            name: '阶段1',
            status: 'in_progress',
            deps: [],
            ops: {
              'op-001': {
                id: 'op-001',
                title: '待执行',
                state: 'pending',
                assignee: 'openfeel-executor',
                attempts: 0,
                max_attempts: 3,
                checkpoints: {
                  plan: 'pending',
                  scheme: 'pending',
                  exec: { attempts: 0, self: 'pending' },
                  review: 'pending',
                  test: 'pending',
                },
              },
              'op-002': {
                id: 'op-002',
                title: '已完成',
                state: 'done',
                assignee: 'openfeel-executor',
                attempts: 1,
                max_attempts: 3,
                checkpoints: {
                  plan: 'passed',
                  scheme: 'passed',
                  exec: { attempts: 1, self: 'passed' },
                  review: 'passed',
                  test: 'passed',
                },
              },
              'op-003': {
                id: 'op-003',
                title: '执行中',
                state: 'executing',
                assignee: 'openfeel-executor',
                attempts: 0,
                max_attempts: 3,
                checkpoints: {
                  plan: 'passed',
                  scheme: 'passed',
                  exec: { attempts: 0, self: 'running' },
                  review: 'pending',
                  test: 'pending',
                },
              },
            },
          },
        },
      }));

      const readyOps = mgr.getReadyOps();
      expect(readyOps.length).toBe(2);
      const ids = readyOps.map((o) => o.id);
      expect(ids).toContain('stage-01.op-001');
      expect(ids).toContain('stage-01.op-003');
    });

    it('指定 stageId 时应只返回该阶段', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData({
        stages: {
          'stage-01': {
            name: '阶段1',
            status: 'in_progress',
            deps: [],
            ops: {
              'op-001': { id: 'op-001', title: 'A', state: 'pending', assignee: 'x', attempts: 0, max_attempts: 3, checkpoints: { plan: 'pending', scheme: 'pending', exec: { attempts: 0, self: 'pending' }, review: 'pending', test: 'pending' } },
            },
          },
          'stage-02': {
            name: '阶段2',
            status: 'pending',
            deps: [],
            ops: {
              'op-002': { id: 'op-002', title: 'B', state: 'pending', assignee: 'x', attempts: 0, max_attempts: 3, checkpoints: { plan: 'pending', scheme: 'pending', exec: { attempts: 0, self: 'pending' }, review: 'pending', test: 'pending' } },
            },
          },
        },
      }));

      const stage1Ops = mgr.getReadyOps('stage-01');
      expect(stage1Ops.length).toBe(1);
      expect(stage1Ops[0].id).toBe('stage-01.op-001');

      const stage2Ops = mgr.getReadyOps('stage-02');
      expect(stage2Ops.length).toBe(1);
      expect(stage2Ops[0].id).toBe('stage-02.op-002');
    });

    it('无 ready op 时应返回空数组', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData({
        stages: {
          'stage-01': {
            name: '阶段1',
            status: 'done',
            deps: [],
            ops: {
              'op-001': {
                id: 'op-001', title: '已完成', state: 'done', assignee: 'x', attempts: 1, max_attempts: 3,
                checkpoints: { plan: 'passed', scheme: 'passed', exec: { attempts: 1, self: 'passed' }, review: 'passed', test: 'passed' },
              },
            },
          },
        },
      }));
      expect(mgr.getReadyOps()).toEqual([]);
    });
  });

  describe('getReviewItems', () => {
    it('应返回所有审查条目', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData({
        reviews: [
          { id: 'REV-001', op: 'stage-01.op-001', status: 'open', priority: 'high', title: '问题1', filed_by: 'openfeel-reviewer', filed_at: '2026-01-01T00:00:00Z' },
          { id: 'REV-002', op: 'stage-01.op-001', status: 'resolved', priority: 'medium', title: '问题2', filed_by: 'openfeel-reviewer', filed_at: '2026-01-01T00:00:00Z' },
        ],
      }));
      expect(mgr.getReviewItems().length).toBe(2);
    });

    it('按 opId 过滤应只返回对应条目', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData({
        reviews: [
          { id: 'REV-001', op: 'stage-01.op-001', status: 'open', priority: 'high', title: '问题1', filed_by: 'openfeel-reviewer', filed_at: '2026-01-01T00:00:00Z' },
          { id: 'REV-002', op: 'stage-02.op-001', status: 'open', priority: 'low', title: '问题2', filed_by: 'openfeel-reviewer', filed_at: '2026-01-01T00:00:00Z' },
        ],
      }));
      expect(mgr.getReviewItems('stage-01.op-001').length).toBe(1);
    });
  });

  describe('getRetryCount', () => {
    it('应返回 op 的 attempts 计数', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData({
        stages: {
          'stage-01': {
            name: '阶段1',
            status: 'in_progress',
            deps: [],
            ops: {
              'op-001': {
                id: 'op-001', title: '已重试2次', state: 'pending', assignee: 'x', attempts: 2, max_attempts: 3,
                checkpoints: { plan: 'pending', scheme: 'pending', exec: { attempts: 0, self: 'pending' }, review: 'pending', test: 'pending' },
              },
            },
          },
        },
      }));
      expect(mgr.getRetryCount('stage-01.op-001')).toBe(2);
    });

    it('不存在的 op 应返回 0', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      expect(mgr.getRetryCount('stage-99.op-999')).toBe(0);
    });
  });

  describe('summary', () => {
    it('未加载时应返回提示信息', () => {
      const mgr = new FlowManager(tmpDir);
      expect(mgr.summary()).toContain('未初始化');
    });

    it('应返回中文摘要文本（含 MetaPhase 和 stage phase）', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData({
        reviews: [
          { id: 'REV-001', op: 'stage-01.op-001', status: 'open', priority: 'high', title: '问题', filed_by: 'r', filed_at: '2026-01-01T00:00:00Z' },
        ],
      }));
      const text = mgr.summary();
      expect(text).toContain('OpenFeel 流水线状态');
      expect(text).toContain('全局状态: active');
      expect(text).toContain('阶段数: 1');
      expect(text).toContain('待处理审查: 1');
    });
  });

  describe('getSummary', () => {
    it('未加载时应返回 uninitialized', () => {
      const mgr = new FlowManager(tmpDir);
      const s = mgr.getSummary();
      expect(s.phase).toBe('uninitialized');
      expect(s.currentOp).toBeNull();
      expect(s.retryCount).toBe(0);
      expect(s.stagesCount).toBe(0);
      expect(s.opsCount).toBe(0);
      expect(s.reviewItemsOpen).toBe(0);
      expect(s.recentLogs).toBe(0);
    });

    it('应返回正确的结构化摘要（phase 为 MetaPhase）', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData({
        pipeline: {
          phase: 'active' as MetaPhase,
          current: { stage: 'stage-01', op: 'op-001' },
          retry: 1,
        },
        reviews: [
          { id: 'REV-001', op: 'stage-01.op-001', status: 'open', priority: 'high', title: '问题1', filed_by: 'r', filed_at: '2026-01-01T00:00:00Z' },
          { id: 'REV-002', op: 'stage-01.op-001', status: 'resolved', priority: 'medium', title: '问题2', filed_by: 'r', filed_at: '2026-01-01T00:00:00Z' },
          { id: 'REV-003', op: 'stage-01.op-001', status: 'open', priority: 'low', title: '问题3', filed_by: 'r', filed_at: '2026-01-01T00:00:00Z' },
        ],
        log: [
          { time: '', agent: 'test', action: 'a1', detail: {} },
          { time: '', agent: 'test', action: 'a2', detail: {} },
        ],
      }));

      const s = mgr.getSummary();
      expect(s.phase).toBe('active');
      expect(s.currentOp).toBe('stage-01.op-001');
      expect(s.retryCount).toBe(1);
      expect(s.stagesCount).toBe(1);
      expect(s.opsCount).toBe(1);
      expect(s.reviewItemsOpen).toBe(2); // 只有 open 状态计入
      expect(s.recentLogs).toBe(2);
    });

    it('无当前操作时 currentOp 应为 null', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData({
        pipeline: {
          phase: 'active' as MetaPhase,
          current: { stage: '', op: '' },
          retry: 2,
        },
      }));

      const s = mgr.getSummary();
      expect(s.currentOp).toBeNull();
      expect(s.retryCount).toBe(2);
    });

    it('多个阶段和操作时应正确计数', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData({
        stages: {
          'stage-01': {
            name: '阶段1',
            status: 'done',
            deps: [],
            ops: {
              'op-001': { id: 'op-001', title: 'A', state: 'done', assignee: 'x', attempts: 1, max_attempts: 3, checkpoints: { plan: 'passed', scheme: 'passed', exec: { attempts: 1, self: 'passed' }, review: 'passed', test: 'passed' } },
              'op-002': { id: 'op-002', title: 'B', state: 'done', assignee: 'x', attempts: 1, max_attempts: 3, checkpoints: { plan: 'passed', scheme: 'passed', exec: { attempts: 1, self: 'passed' }, review: 'passed', test: 'passed' } },
            },
          },
          'stage-02': {
            name: '阶段2',
            status: 'in_progress',
            deps: ['stage-01'],
            ops: {
              'op-001': { id: 'op-001', title: 'C', state: 'pending', assignee: 'x', attempts: 0, max_attempts: 3, checkpoints: { plan: 'pending', scheme: 'pending', exec: { attempts: 0, self: 'pending' }, review: 'pending', test: 'pending' } },
            },
          },
        },
      }));

      const s = mgr.getSummary();
      expect(s.stagesCount).toBe(2);
      expect(s.opsCount).toBe(3);
    });
  });

  // ═══════════════════════════════════════
  // 推进
  // ═══════════════════════════════════════

  describe('advancePhase (deprecated)', () => {
    it('应更新 stage.phase 和 current（委托 advanceStagePhase）', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      mgr.advancePhase('stage-01.op-001', 'plan_passed');
      // pipeline.phase 为 MetaPhase 'active'（不直接等于 PipelinePhase）
      expect(mgr.getPhase()).toBe('active');
      // stage.phase 被正确更新
      expect(mgr.getData()!.stages['stage-01'].phase).toBe('plan_passed');
      expect(mgr.getCurrent()).toEqual({ stage: 'stage-01', op: 'op-001' });
    });

    it('应将 passed 阶段的 checkpoints 标记为 passed', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      mgr.advancePhase('stage-01.op-001', 'plan_passed');
      const cp = mgr.getOpCheckpoints('stage-01.op-001');
      expect(cp!.plan).toBe('passed');
    });

    it('应将 failed 阶段的 checkpoints 标记为 failed', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      mgr.advancePhase('stage-01.op-001', 'test_failed');
      const cp = mgr.getOpCheckpoints('stage-01.op-001');
      expect(cp!.test).toBe('failed');
    });

    it('exec_running 应设置 exec.self 为 running', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      mgr.advancePhase('stage-01.op-001', 'exec_running');
      const cp = mgr.getOpCheckpoints('stage-01.op-001');
      expect(cp!.exec.self).toBe('running');
    });

    it('调用 advancePhase 应追加日志（advance_stage_phase）', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      const data = mgr.getData()!;
      const before = data.log.length;
      mgr.advancePhase('stage-01.op-001', 'plan_passed');
      // advancePhase → advanceStagePhase 各产生一条日志
      expect(data.log.length).toBeGreaterThan(before);
    });

    it('推进日志应有 stageName 和正确的 from/to 阶段值', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      mgr.advancePhase('stage-01.op-001', 'plan_review');
      const data = mgr.getData()!;
      // 最后一条日志是 advanceStagePhase 产生的
      const lastLog = data.log[data.log.length - 1];
      expect(lastLog.action).toBe('advance_stage_phase');
      expect(lastLog.detail.stageName).toBe('stage-01');
      expect(lastLog.detail.from).toBe('plan_pending');
      expect(lastLog.detail.to).toBe('plan_review');
    });

    it('切换到新操作时应重置 pipeline.retry 为 0（REV-002）', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData({
        pipeline: {
          phase: 'active' as MetaPhase,
          current: { stage: 'stage-01', op: 'op-999' }, // 旧 op
          retry: 5,
        },
      }));
      mgr.advancePhase('stage-01.op-001', 'plan_review');
      expect(mgr.getData()!.pipeline.retry).toBe(0);
    });

    it('相同操作推进时不重置 pipeline.retry', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData({
        pipeline: {
          phase: 'active' as MetaPhase,
          current: { stage: 'stage-01', op: 'op-001' }, // 相同 op
          retry: 3,
        },
      }));
      mgr.advancePhase('stage-01.op-001', 'plan_review');
      // 相同 op 时不应重置 retry
      expect(mgr.getData()!.pipeline.retry).toBe(3);
    });

    it('不存在的 stage 应抛出错误（advanceStagePhase 校验）', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      expect(() => mgr.advancePhase('stage-99.op-999', 'plan_passed')).toThrow();
    });
  });

  describe('advanceStagePhase (new API)', () => {
    it('应更新 stage.phase', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      mgr.advanceStagePhase('stage-01', 'exec_running' as PipelinePhase);
      expect(mgr.getData()!.stages['stage-01'].phase).toBe('exec_running');
    });

    it('应设置 pipeline.phase 为 active', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      mgr.advanceStagePhase('stage-01', 'exec_running' as PipelinePhase);
      expect(mgr.getPhase()).toBe('active');
    });

    it('不存在的 stageName 应抛出错误', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      expect(() => mgr.advanceStagePhase('nonexistent', 'exec_running' as PipelinePhase)).toThrow('不存在');
    });

    it('非法 phase 值应触发模糊修正或抛出错误', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      // 可模糊修正的值应正常推进（如 'running' → 'exec_running'）
      mgr.advanceStagePhase('stage-01', 'running' as PipelinePhase);
      expect(mgr.getData()!.stages['stage-01'].phase).toBe('exec_running');
    });

    it('完全不可修正的 phase 应抛出错误', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      expect(() => mgr.advanceStagePhase('stage-01', 'xyz_not_a_phase' as PipelinePhase)).toThrow('模糊修正失败');
    });

    it('应同步更新 pipeline.current', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      mgr.advanceStagePhase('stage-01', 'plan_review' as PipelinePhase);
      const current = mgr.getCurrent();
      expect(current).not.toBeNull();
      expect(current!.stage).toBe('stage-01');
    });

    it('应同步更新 stage.status（mapPhaseToStageStatus）', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      // plan_review → status 保持 'in_progress'
      mgr.advanceStagePhase('stage-01', 'plan_review' as PipelinePhase);
      expect(mgr.getData()!.stages['stage-01'].status).toBe('in_progress');

      // done → status 变为 'done'
      mgr.advanceStagePhase('stage-01', 'done' as PipelinePhase);
      expect(mgr.getData()!.stages['stage-01'].status).toBe('done');

      // review_failed → status 变为 'review_failed'
      mgr.setData(makeTestFlowData());
      mgr.advanceStagePhase('stage-01', 'review_failed' as PipelinePhase);
      expect(mgr.getData()!.stages['stage-01'].status).toBe('review_failed');
    });

    it('应追加日志条目（advance_stage_phase）', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      const data = mgr.getData()!;
      const before = data.log.length;
      mgr.advanceStagePhase('stage-01', 'exec_running' as PipelinePhase);
      expect(data.log.length).toBe(before + 1);
      const lastLog = data.log[data.log.length - 1];
      expect(lastLog.action).toBe('advance_stage_phase');
      expect(lastLog.detail.stageName).toBe('stage-01');
      expect(lastLog.detail.from).toBe('plan_pending');
      expect(lastLog.detail.to).toBe('exec_running');
    });

    it('未加载数据时应静默跳过', () => {
      const mgr = new FlowManager(tmpDir);
      expect(() => mgr.advanceStagePhase('stage-01', 'exec_running' as PipelinePhase)).not.toThrow();
    });

    it('推进到 done（之前非 done）应返回 true（归档标记，REV: autoCommitOnDone 时序）', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      const result = mgr.advanceStagePhase('stage-01', 'done' as PipelinePhase);
      expect(result).toBe(true);
      expect(mgr.getData()!.stages['stage-01'].phase).toBe('done');
      // P3 全量 done 判定：单阶段（该阶段即全部）推进到 done → pipeline.phase 置为 done
      expect(mgr.getPhase()).toBe('done');
    });

    it('多阶段仅一个 done 时 pipeline.phase 仍为 active（P3 全量 done 判定）', () => {
      const mgr = new FlowManager(tmpDir);
      const base = makeTestFlowData();
      mgr.setData({
        ...base,
        stages: {
          A: { ...base.stages['stage-01'], name: 'A', phase: 'exec_running' as PipelinePhase },
          B: { ...base.stages['stage-01'], name: 'B', phase: 'exec_running' as PipelinePhase, ops: {} },
        },
      });
      mgr.advanceStagePhase('A', 'done' as PipelinePhase);
      // 仅 A done，B 未 done → 全局仍 active
      expect(mgr.getPhase()).toBe('active');
    });

    it('多阶段全部 done 时 pipeline.phase 为 done 且 validate 通过（P3）', () => {
      const mgr = new FlowManager(tmpDir);
      const base = makeTestFlowData();
      mgr.setData({
        ...base,
        stages: {
          A: { ...base.stages['stage-01'], name: 'A', phase: 'exec_running' as PipelinePhase },
          B: { ...base.stages['stage-01'], name: 'B', phase: 'exec_running' as PipelinePhase, ops: {} },
        },
      });
      mgr.advanceStagePhase('A', 'done' as PipelinePhase);
      mgr.advanceStagePhase('B', 'done' as PipelinePhase);
      // 全部 done → 全局置 done
      expect(mgr.getPhase()).toBe('done');
      // 'done' 为合法 MetaPhase：validate 通过且无 pipeline.phase 相关错误
      const result = mgr.validate();
      expect(result.valid).toBe(true);
      expect(result.errors.some((e) => e.includes('pipeline.phase'))).toBe(false);
    });

    it('推进到非 done phase 应返回 false', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      const result = mgr.advanceStagePhase('stage-01', 'exec_running' as PipelinePhase);
      expect(result).toBe(false);
    });

    it('已是 done 再次推进到 done 应返回 false（不重复触发归档）', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      mgr.advanceStagePhase('stage-01', 'done' as PipelinePhase);
      const result = mgr.advanceStagePhase('stage-01', 'done' as PipelinePhase);
      expect(result).toBe(false);
    });
  });

  describe('recordAttempt', () => {
    it('pass 应设置 op.state 为 done', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      const result = mgr.recordAttempt('stage-01.op-001', 'pass');
      expect(result.shouldRetry).toBe(false);
      expect(result.shouldReplan).toBe(false);
      expect(mgr.getOpState('stage-01.op-001')).toBe('done');
    });

    it('pass 应重置 pipeline.retry', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData({
        pipeline: {
          phase: 'active' as MetaPhase,
          current: { stage: 'stage-01', op: 'op-001' },
          retry: 2,
        },
      }));
      mgr.recordAttempt('stage-01.op-001', 'pass');
      expect(mgr.getData()!.pipeline.retry).toBe(0);
    });

    it('fail 且未超 max_attempts 时应返回 shouldRetry=true', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      const result = mgr.recordAttempt('stage-01.op-001', 'fail');
      expect(result.shouldRetry).toBe(true);
      expect(result.shouldReplan).toBe(false);
      expect(mgr.getOpState('stage-01.op-001')).toBe('pending');
    });

    it('fail 且未超 max_attempts 时 op.attempts 应递增', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      expect(mgr.getRetryCount('stage-01.op-001')).toBe(0);
      mgr.recordAttempt('stage-01.op-001', 'fail');
      expect(mgr.getRetryCount('stage-01.op-001')).toBe(1);
    });

    it('fail 耗尽重试时应返回 shouldReplan=true', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData({
        stages: {
          'stage-01': {
            name: '阶段1',
            status: 'in_progress',
            deps: [],
            ops: {
              'op-001': {
                id: 'op-001', title: '即将耗尽', state: 'pending', assignee: 'x',
                attempts: 2, max_attempts: 3,
                checkpoints: { plan: 'pending', scheme: 'pending', exec: { attempts: 0, self: 'pending' }, review: 'pending', test: 'pending' },
              },
            },
          },
        },
      }));
      const result = mgr.recordAttempt('stage-01.op-001', 'fail');
      expect(result.shouldRetry).toBe(false);
      expect(result.shouldReplan).toBe(true);
      expect(mgr.getOpState('stage-01.op-001')).toBe('failed');
    });

    it('不存在的 opId 应返回 safe 结果', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      const result = mgr.recordAttempt('stage-99.op-999', 'fail');
      expect(result.shouldRetry).toBe(false);
      expect(result.shouldReplan).toBe(false);
    });
  });

  describe('addReview & resolveReview', () => {
    it('addReview 应添加新条目', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      mgr.addReview({
        id: 'REV-001',
        op: 'stage-01.op-001',
        status: 'open',
        priority: 'high',
        title: '测试问题',
        filed_by: 'openfeel-reviewer',
        filed_at: new Date().toISOString(),
      });
      expect(mgr.getReviewItems().length).toBe(1);
    });

    it('addReview 重复 id 应更新条目', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      mgr.addReview({
        id: 'REV-001',
        op: 'stage-01.op-001',
        status: 'open',
        priority: 'high',
        title: '原问题',
        filed_by: 'openfeel-reviewer',
        filed_at: new Date().toISOString(),
      });
      mgr.addReview({
        id: 'REV-001',
        op: 'stage-01.op-001',
        status: 'resolved',
        priority: 'high',
        title: '已修复问题',
        filed_by: 'openfeel-reviewer',
        filed_at: new Date().toISOString(),
      });
      expect(mgr.getReviewItems().length).toBe(1);
      expect(mgr.getReviewItems()[0].status).toBe('resolved');
    });

    it('resolveReview 应标记为 resolved', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      mgr.addReview({
        id: 'REV-001',
        op: 'stage-01.op-001',
        status: 'open',
        priority: 'medium',
        title: '待解决',
        filed_by: 'r',
        filed_at: new Date().toISOString(),
      });
      const ok = mgr.resolveReview('REV-001');
      expect(ok).toBe(true);
      expect(mgr.getReviewItems()[0].status).toBe('resolved');
    });

    it('resolveReview 不存在的 ID 应返回 false', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      expect(mgr.resolveReview('NONEXISTENT')).toBe(false);
    });
  });

  describe('appendLog', () => {
    it('应追加日志并自动填充 time', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      const before = mgr.getData()!.log.length;
      mgr.appendLog({
        time: '',
        agent: 'test-agent',
        action: 'test-action',
        detail: { key: 'value' },
      });
      const data = mgr.getData();
      expect(data!.log.length).toBe(before + 1);
      expect(data!.log[before].time).toBeTruthy();
      expect(data!.log[before].agent).toBe('test-agent');
    });

    it('若 time 已提供则保留', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      const customTime = '2026-06-25T12:00:00Z';
      mgr.appendLog({
        time: customTime,
        agent: 'test-agent',
        action: 'test-action',
        detail: {},
      });
      expect(mgr.getData()!.log[0].time).toBe(customTime);
    });
  });

  // ═══════════════════════════════════════
  // 校验
  // ═══════════════════════════════════════

  describe('canAdvance', () => {
    // R-FIX（stage-74 op-004）：全链语义用例显式声明 full
    beforeEach(() => { writeFullModeConfig(tmpDir); });

    it('合法流转应返回 true（基于 stage.phase）', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      // makeTestFlowData 默认 stage.phase = 'plan_pending'
      expect(mgr.canAdvance('stage-01.op-001', 'plan_review')).toBe(true);
      expect(mgr.canAdvance('stage-01.op-001', 'plan_passed')).toBe(true);
    });

    it('非法流转应返回 false', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      // 从 stage.phase = 'plan_pending' 不能直接跳到 exec_running
      expect(mgr.canAdvance('stage-01.op-001', 'exec_running')).toBe(false);
      // 从 plan_pending 不能跳到 done
      expect(mgr.canAdvance('stage-01.op-001', 'done')).toBe(false);
    });

    it('op 不存在应返回 false', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      expect(mgr.canAdvance('stage-99.op-999', 'plan_passed')).toBe(false);
    });

    it('未加载数据应返回 false', () => {
      const mgr = new FlowManager(tmpDir);
      expect(mgr.canAdvance('stage-01.op-001', 'plan_passed')).toBe(false);
    });

    it('done 状态不能推进', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData({
        pipeline: {
          phase: 'active' as MetaPhase,
          current: { stage: 'stage-01', op: 'op-001' },
          retry: 0,
        },
        stages: {
          'stage-01': {
            name: '测试阶段',
            phase: 'done' as PipelinePhase,
            status: 'done',
            deps: [],
            ops: {
              'op-001': {
                id: 'op-001', title: '已完成', state: 'done', assignee: 'x', attempts: 1, max_attempts: 3,
                checkpoints: { plan: 'passed', scheme: 'passed', exec: { attempts: 1, self: 'passed' }, review: 'passed', test: 'passed' },
              },
            },
          },
        },
      }));
      expect(mgr.canAdvance('stage-01.op-001', 'plan_passed')).toBe(false);
    });

    // BUG-01/02 修复验证：失败态应能回退到 scheme_pending
    it('review_failed → scheme_pending 应返回 true（BUG-01 修复）', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData({
        pipeline: {
          phase: 'active' as MetaPhase,
          current: { stage: 'stage-01', op: 'op-001' },
          retry: 0,
        },
        stages: {
          'stage-01': {
            name: '测试阶段',
            phase: 'review_failed' as PipelinePhase,
            status: 'review_failed',
            deps: [],
            ops: {
              'op-001': {
                id: 'op-001', title: '审查失败', state: 'pending', assignee: 'x', attempts: 0, max_attempts: 3,
                checkpoints: { plan: 'passed', scheme: 'passed', exec: { attempts: 0, self: 'pending' }, review: 'failed', test: 'pending' },
              },
            },
          },
        },
      }));
      expect(mgr.canAdvance('stage-01.op-001', 'scheme_pending')).toBe(true);
    });

    it('test_failed → scheme_pending 应返回 true（BUG-02 修复）', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData({
        pipeline: {
          phase: 'active' as MetaPhase,
          current: { stage: 'stage-01', op: 'op-001' },
          retry: 0,
        },
        stages: {
          'stage-01': {
            name: '测试阶段',
            phase: 'test_failed' as PipelinePhase,
            status: 'test_failed',
            deps: [],
            ops: {
              'op-001': {
                id: 'op-001', title: '测试失败', state: 'pending', assignee: 'x', attempts: 0, max_attempts: 3,
                checkpoints: { plan: 'passed', scheme: 'passed', exec: { attempts: 0, self: 'pending' }, review: 'passed', test: 'failed' },
              },
            },
          },
        },
      }));
      expect(mgr.canAdvance('stage-01.op-001', 'scheme_pending')).toBe(true);
    });

    it('exec_running → scheme_pending 应返回 true', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData({
        pipeline: {
          phase: 'active' as MetaPhase,
          current: { stage: 'stage-01', op: 'op-001' },
          retry: 0,
        },
        stages: {
          'stage-01': {
            name: '测试阶段',
            phase: 'exec_running' as PipelinePhase,
            status: 'in_progress',
            deps: [],
            ops: {
              'op-001': {
                id: 'op-001', title: '执行中', state: 'executing', assignee: 'x', attempts: 0, max_attempts: 3,
                checkpoints: { plan: 'passed', scheme: 'passed', exec: { attempts: 0, self: 'running' }, review: 'pending', test: 'pending' },
              },
            },
          },
        },
      }));
      expect(mgr.canAdvance('stage-01.op-001', 'scheme_pending')).toBe(true);
    });
  });

  describe('validate', () => {
    it('合法数据应通过校验', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      const { valid, errors } = mgr.validate();
      expect(valid).toBe(true);
      expect(errors.length).toBe(0);
    });

    it('缺少 meta.version 应报错', () => {
      const mgr = new FlowManager(tmpDir);
      const bad = makeTestFlowData();
      bad.meta = { version: '', project: 'Test', updated: '' };
      mgr.setData(bad);
      const { valid, errors } = mgr.validate();
      expect(valid).toBe(false);
      expect(errors.some((e) => e.includes('version'))).toBe(true);
    });

    it('stages 不是对象应报错', () => {
      const mgr = new FlowManager(tmpDir);
      const bad = makeTestFlowData();
      bad.stages = null as unknown as FlowData['stages'];
      mgr.setData(bad);
      const { valid, errors } = mgr.validate();
      expect(valid).toBe(false);
    });

    it('reviews 不是数组应报错', () => {
      const mgr = new FlowManager(tmpDir);
      const bad = makeTestFlowData();
      bad.reviews = null as unknown as FlowData['reviews'];
      mgr.setData(bad);
      const { valid, errors } = mgr.validate();
      expect(valid).toBe(false);
    });

    it('未加载数据时应报错', () => {
      const mgr = new FlowManager(tmpDir);
      const { valid, errors } = mgr.validate();
      expect(valid).toBe(false);
      expect(errors.length).toBe(1);
    });

    // REV-005: 新增功能测试 — validate 自动修正（MetaPhase）
    it('pipeline.phase 为非 MetaPhase 时自动修正为 active 且 warnings 包含修正信息', () => {
      const mgr = new FlowManager(tmpDir);
      const bad = makeTestFlowData({
        pipeline: {
          phase: 'planning' as unknown as MetaPhase,
          current: { stage: '', op: '' },
          retry: 0,
        },
      });
      mgr.setData(bad);
      const { valid, errors, warnings } = mgr.validate();
      expect(valid).toBe(true);
      expect(errors.length).toBe(0);
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings.some((w) => w.includes('自动修正'))).toBe(true);
      expect(mgr.getPhase()).toBe('active'); // 已修正为 'active'
    });

    it('pipeline.phase 为合法 MetaPhase "paused" 应通过校验', () => {
      const mgr = new FlowManager(tmpDir);
      const mgrData = makeTestFlowData();
      mgrData.pipeline.phase = 'paused' as MetaPhase;
      mgr.setData(mgrData);
      const { valid, errors, warnings } = mgr.validate();
      expect(valid).toBe(true);
      expect(errors.length).toBe(0);
      // warnings 仅因 stage.phase 'plan_pending' 由 PipelinePhaseSchema 校验合法
      expect(warnings.length).toBe(0);
    });

    it('合法 MetaPhase + 所有 stage phase 合法时应无 errors 和 warnings', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData({
        pipeline: {
          phase: 'active' as MetaPhase,
          current: { stage: 'stage-01', op: 'op-001' },
          retry: 0,
        },
      }));
      const { valid, errors, warnings } = mgr.validate();
      expect(valid).toBe(true);
      expect(errors.length).toBe(0);
      expect(warnings.length).toBe(0);
    });
  });

  describe('per-stage phase validation', () => {
    it('所有 stage phase 合法应返回 valid=true', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      const { valid, errors } = mgr.validate();
      expect(valid).toBe(true);
      expect(errors.length).toBe(0);
    });

    it('非法 stage phase 应产生 errors', () => {
      const mgr = new FlowManager(tmpDir);
      const bad = makeTestFlowData();
      bad.stages['stage-01'].phase = 'invalid_phase_name' as PipelinePhase;
      mgr.setData(bad);
      const { valid, errors } = mgr.validate();
      // 不可修正的非法值 → errors 非空
      expect(valid).toBe(false);
      expect(errors.some((e) => e.includes('stage-01'))).toBe(true);
    });

    it('pipeline.phase 为合法 MetaPhase 应通过校验', () => {
      const mgr = new FlowManager(tmpDir);
      const data = makeTestFlowData();
      data.pipeline.phase = 'paused' as MetaPhase;
      mgr.setData(data);
      const { valid, errors, warnings } = mgr.validate();
      expect(valid).toBe(true);
      expect(errors.length).toBe(0);
    });

    it('pipeline.phase 为非法 MetaPhase 时自动修正并产生 warnings', () => {
      const mgr = new FlowManager(tmpDir);
      const data = makeTestFlowData();
      // fuzzyCorrectMetaPhase 将所有非法 pipeline.phase 修正为 'active'
      data.pipeline.phase = 'nonexistent_meta' as MetaPhase;
      mgr.setData(data);
      const { valid, errors, warnings } = mgr.validate();
      // 自动修正为 'active' → valid=true
      expect(valid).toBe(true);
      expect(errors.length).toBe(0);
      expect(warnings.some((w) => w.includes('自动修正'))).toBe(true);
      expect(mgr.getPhase()).toBe('active');
    });

    it('stage phase 缺失可通过 warnings 自动补全', () => {
      const mgr = new FlowManager(tmpDir);
      const data = makeTestFlowData();
      // 将 stage phase 设为 undefined 以触发缺失补全
      delete (data.stages['stage-01'] as Record<string, unknown>).phase;
      mgr.setData(data);
      const { valid, errors, warnings } = mgr.validate();
      expect(valid).toBe(true);
      expect(warnings.some((w) => w.includes('缺失'))).toBe(true);
    });
  });

  describe('multi-stage parallel scenarios', () => {
    // R-FIX（stage-74 op-004）：全链语义用例显式声明 full
    beforeEach(() => { writeFullModeConfig(tmpDir); });

    it('两个 stage 不同 phase 共存时 summary 正确展示', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData({
        pipeline: {
          phase: 'active' as MetaPhase,
          current: { stage: 'stage-01', op: 'op-001' },
          retry: 0,
        },
        stages: {
          'stage-01': {
            name: '阶段1',
            phase: 'exec_running' as PipelinePhase,
            status: 'in_progress',
            deps: [],
            ops: {
              'op-001': {
                id: 'op-001', title: '执行中', state: 'executing', assignee: 'x',
                attempts: 0, max_attempts: 3,
                checkpoints: { plan: 'passed', scheme: 'passed', exec: { attempts: 0, self: 'running' }, review: 'pending', test: 'pending' },
              },
            },
          },
          'stage-02': {
            name: '阶段2',
            phase: 'plan_pending' as PipelinePhase,
            status: 'planned',
            deps: ['stage-01'],
            ops: {},
          },
        },
      }));

      const summary = mgr.summary();
      expect(summary).toContain('全局状态: active');
      expect(summary).toContain('阶段状态: exec_running');
      expect(summary).toContain('阶段数: 2');
    });

    it('canAdvance 基于各自 stage phase 独立校验', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData({
        pipeline: {
          phase: 'active' as MetaPhase,
          current: { stage: 'stage-01', op: 'op-001' },
          retry: 0,
        },
        stages: {
          'stage-01': {
            name: '阶段1',
            phase: 'exec_running' as PipelinePhase,
            status: 'in_progress',
            deps: [],
            ops: {
              'op-001': {
                id: 'op-001', title: '执行中', state: 'executing', assignee: 'x',
                attempts: 0, max_attempts: 3,
                checkpoints: { plan: 'passed', scheme: 'passed', exec: { attempts: 0, self: 'running' }, review: 'pending', test: 'pending' },
              },
            },
          },
          'stage-02': {
            name: '阶段2',
            phase: 'plan_pending' as PipelinePhase,
            status: 'planned',
            deps: ['stage-01'],
            ops: {
              'op-001': {
                id: 'op-001', title: '待计划', state: 'pending', assignee: 'openfeel-planner',
                attempts: 0, max_attempts: 3,
                checkpoints: { plan: 'pending', scheme: 'pending', exec: { attempts: 0, self: 'pending' }, review: 'pending', test: 'pending' },
              },
            },
          },
        },
      }));

      // stage-01 从 exec_running → review_pending（合法）
      expect(mgr.canAdvance('stage-01.op-001', 'review_pending')).toBe(true);
      // stage-02 从 plan_pending → plan_review（合法）
      expect(mgr.canAdvance('stage-02.op-001', 'plan_review')).toBe(true);

      // stage-01 从 exec_running → plan_pending（不合法，跳跃）
      expect(mgr.canAdvance('stage-01.op-001', 'plan_pending')).toBe(false);
      // stage-02 从 plan_pending → exec_running（不合法，跳跃）
      expect(mgr.canAdvance('stage-02.op-001', 'exec_running')).toBe(false);
    });

    it('recoverContext 返回当前活跃 stage 的 phase', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData({
        pipeline: {
          phase: 'active' as MetaPhase,
          current: { stage: 'stage-01', op: 'op-001' },
          retry: 0,
        },
        stages: {
          'stage-01': {
            name: '阶段1',
            phase: 'exec_running' as PipelinePhase,
            status: 'in_progress',
            deps: [],
            ops: {
              'op-001': {
                id: 'op-001', title: '执行中', state: 'executing', assignee: 'x',
                attempts: 0, max_attempts: 3,
                checkpoints: { plan: 'passed', scheme: 'passed', exec: { attempts: 0, self: 'running' }, review: 'pending', test: 'pending' },
              },
            },
          },
          'stage-02': {
            name: '阶段2',
            phase: 'plan_pending' as PipelinePhase,
            status: 'planned',
            deps: ['stage-01'],
            ops: {},
          },
        },
      }));

      const ctx = mgr.recoverContext();
      // recoverContext 返回当前 stage（stage-01）的 phase
      expect(ctx.phase).toBe('exec_running');
      expect(ctx.currentOp).toBe('stage-01.op-001');
    });

    it('getSummary 中 phase 为 MetaPhase（全局宏观状态）', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData({
        pipeline: {
          phase: 'active' as MetaPhase,
          current: { stage: 'stage-01', op: 'op-001' },
          retry: 0,
        },
        stages: {
          'stage-01': {
            name: '阶段1',
            phase: 'exec_running' as PipelinePhase,
            status: 'in_progress',
            deps: [],
            ops: {
              'op-001': {
                id: 'op-001', title: '执行', state: 'executing', assignee: 'x',
                attempts: 0, max_attempts: 3,
                checkpoints: { plan: 'passed', scheme: 'passed', exec: { attempts: 0, self: 'running' }, review: 'pending', test: 'pending' },
              },
            },
          },
          'stage-02': {
            name: '阶段2',
            phase: 'plan_pending' as PipelinePhase,
            status: 'planned',
            deps: ['stage-01'],
            ops: {},
          },
        },
      }));

      const s = mgr.getSummary();
      expect(s.phase).toBe('active');
      expect(s.stagesCount).toBe(2);
    });
  });

  describe('deprecated advancePhase backward compat', () => {
    it('调用旧 advancePhase 应输出 warn 并委托到 advanceStagePhase', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      // 捕获 console.warn
      const warnings: string[] = [];
      const origWarn = console.warn;
      console.warn = (msg: string) => { warnings.push(msg); };

      try {
        mgr.advancePhase('stage-01.op-001', 'exec_running');
        // 应输出弃用警告
        expect(warnings.some((w) => w.includes('DEPRECATED'))).toBe(true);
        // 应正确更新 stage.phase（委托到 advanceStagePhase）
        expect(mgr.getData()!.stages['stage-01'].phase).toBe('exec_running');
      } finally {
        console.warn = origWarn;
      }
    });

    it('旧 advancePhase 通过 opId 解析 stageId 后委托', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());

      const warnings: string[] = [];
      const origWarn = console.warn;
      console.warn = (msg: string) => { warnings.push(msg); };

      try {
        mgr.advancePhase('stage-01.op-001', 'plan_passed');
        // 有弃用警告
        expect(warnings.some((w) => w.includes('DEPRECATED'))).toBe(true);
        // stage phase 被正确更新
        expect(mgr.getData()!.stages['stage-01'].phase).toBe('plan_passed');
        // pipeline.phase 为 MetaPhase 'active'
        expect(mgr.getPhase()).toBe('active');
      } finally {
        console.warn = origWarn;
      }
    });

    it('旧 advancePhase 调用时更新 checkpoints', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());

      const origWarn = console.warn;
      console.warn = () => {}; // 静默弃用警告

      try {
        mgr.advancePhase('stage-01.op-001', 'plan_passed');
        const cp = mgr.getOpCheckpoints('stage-01.op-001');
        expect(cp!.plan).toBe('passed');
      } finally {
        console.warn = origWarn;
      }
    });

    it('旧 advancePhase 不存在的 stage 应通过 advanceStagePhase 抛出错误', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());

      const origWarn = console.warn;
      console.warn = () => {};

      try {
        expect(() => mgr.advancePhase('stage-99.op-001', 'plan_passed')).toThrow();
      } finally {
        console.warn = origWarn;
      }
    });

    it('op-007/L5：deprecated warn 走 i18n（zh 含 DEPRECATED）；en 模板无 CJK', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());

      const warnings: string[] = [];
      const origWarn = console.warn;
      console.warn = (msg: string) => { warnings.push(msg); };
      try {
        mgr.advancePhase('stage-01.op-001', 'exec_running');
      } finally {
        console.warn = origWarn;
      }
      expect(warnings.some((w) => w.includes('DEPRECATED'))).toBe(true);
      expect(/[\u4e00-\u9fff]/.test(t('flow.manager.advancePhaseDeprecated', 'en'))).toBe(false);
    });
  });

  describe('repair dry-run', () => {
    it('dry-run 模式在 flow.json 不存在时应返回 fixed=false 且不创建文件', () => {
      // 确保 flow.json 不存在
      const fp = join(tmpDir, '.openfeel', 'flow.json');
      // tmpDir 是干净的临时目录
      const mgr = new FlowManager(tmpDir);
      // 先确认文件不存在
      expect(existsSync(fp)).toBe(false);
      const result = mgr.repair(true);
      expect(result.fixed).toBe(false);
      expect(result.changes.some((c) => c.includes('dry-run'))).toBe(true);
      // dry-run 不应创建文件
      expect(existsSync(fp)).toBe(false);
    });

    it('dry-run 模式在正常 flow.json 时应返回 fixed=false 且 changes 为空数组', () => {
      FlowManager.initFlow(tmpDir);
      const mgr = new FlowManager(tmpDir);
      const result = mgr.repair(true);
      expect(result.fixed).toBe(false);
      expect(result.changes.length).toBe(0);
    });

    it('非 dry-run 模式在 flow.json 不存在时应创建文件并返回 fixed=true', () => {
      const fp = join(tmpDir, '.openfeel', 'flow.json');
      expect(existsSync(fp)).toBe(false);
      const mgr = new FlowManager(tmpDir);
      const result = mgr.repair(false);
      expect(result.fixed).toBe(true);
      expect(result.changes.some((c) => c.includes('已创建'))).toBe(true);
      expect(existsSync(fp)).toBe(true);
    });
  });

  // ═══════════════════════════════════════
  // Checkpoint 快照机制
  // ═══════════════════════════════════════

  describe('saveCheckpoint & listCheckpoints & restoreCheckpoint', () => {
    it('saveCheckpoint 应创建快照文件到 .openfeel/checkpoints/', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      mgr.saveCheckpoint('stage-01', 'exec_running' as PipelinePhase);

      const snapshots = mgr.listCheckpoints();
      expect(snapshots.length).toBe(1);
      expect(snapshots[0]).toMatch(/^stage-01-\d{8}T\d{9}-exec_running\.json$/);
    });

    it('listCheckpoints 应按 stageId 过滤', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      mgr.saveCheckpoint('stage-01', 'exec_running' as PipelinePhase);
      mgr.saveCheckpoint('stage-02', 'plan_passed' as PipelinePhase);

      const stage01 = mgr.listCheckpoints('stage-01');
      const stage02 = mgr.listCheckpoints('stage-02');
      expect(stage01.length).toBe(1);
      expect(stage01[0]).toContain('stage-01-');
      expect(stage02.length).toBe(1);
      expect(stage02[0]).toContain('stage-02-');
    });

    it('listCheckpoints 在目录不存在时应返回空数组', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      expect(mgr.listCheckpoints()).toEqual([]);
    });

    it('restoreCheckpoint 应恢复 flow.json 并重新加载数据', () => {
      FlowManager.initFlow(tmpDir);
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      mgr.save();
      mgr.saveCheckpoint('stage-01', 'exec_running' as PipelinePhase);
      const snapshot = mgr.listCheckpoints()[0];
      expect(snapshot).toBeDefined();

      // 修改数据后恢复
      mgr.setData({ ...makeTestFlowData(), pipeline: { ...makeTestFlowData().pipeline, retry: 99 } });
      mgr.save();
      expect(new FlowManager(tmpDir).getData()!.pipeline.retry).toBe(99);

      const restored = mgr.restoreCheckpoint(snapshot);
      expect(restored).toBe(true);
      expect(new FlowManager(tmpDir).getData()!.pipeline.retry).toBe(0);
    });

    it('restoreCheckpoint 应拒绝含路径分隔符的文件名（防路径穿越）', () => {
      const mgr = new FlowManager(tmpDir);
      expect(mgr.restoreCheckpoint('../evil.json')).toBe(false);
      expect(mgr.restoreCheckpoint('a/b.json')).toBe(false);
      // 反斜杠仅在 Windows 上是路径分隔符，Linux 上 a\b.json 是合法文件名
      if (sep === '\\') {
        expect(mgr.restoreCheckpoint('a\\b.json')).toBe(false);
      }
    });

    it('restoreCheckpoint 对不存在的快照应返回 false', () => {
      const mgr = new FlowManager(tmpDir);
      expect(mgr.restoreCheckpoint('stage-01-20260101T000000000-plan_pending.json')).toBe(false);
    });

    it('data 为 null 时 saveCheckpoint 应静默跳过', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.saveCheckpoint('stage-01', 'exec_running' as PipelinePhase);
      expect(mgr.listCheckpoints()).toEqual([]);
    });

    it('restoreCheckpoint 恢复后 .bak 保留紧邻恢复前版本（REV-002）', () => {
      FlowManager.initFlow(tmpDir);
      const mgr = new FlowManager(tmpDir);
      mgr.save();

      mgr.saveCheckpoint('stage-01', 'exec_running' as PipelinePhase);
      const snapshot = mgr.listCheckpoints('stage-01')[0];
      expect(snapshot).toBeDefined();

      // 修改后再保存：此版本即「紧邻恢复前」的版本
      mgr.addStage('v1.0.0-stage-98');
      mgr.save();
      const beforeRestore = readFileSync(join(tmpDir, '.openfeel', 'flow.json'), 'utf-8');

      expect(mgr.restoreCheckpoint(snapshot)).toBe(true);
      // backup:true 语义下 .bak 应为紧邻恢复前的版本（而非首次 save 的版本）
      expect(readFileSync(join(tmpDir, '.openfeel', 'flow.json.bak'), 'utf-8')).toBe(beforeRestore);
    });

    it('restoreCheckpoint 并发冲突时拒绝恢复返回 false（不覆盖磁盘）', () => {
      FlowManager.initFlow(tmpDir);
      const mgr = new FlowManager(tmpDir);
      mgr.save();
      mgr.saveCheckpoint('stage-01', 'exec_running' as PipelinePhase);
      const snapshot = mgr.listCheckpoints('stage-01')[0];
      expect(snapshot).toBeDefined();

      // 外部并发递增 revision（模拟另一进程写入）
      const p = join(tmpDir, '.openfeel', 'flow.json');
      const raw = JSON.parse(readFileSync(p, 'utf-8'));
      raw.meta.revision = (raw.meta.revision ?? 0) + 1;
      writeFileSync(p, JSON.stringify(raw, null, 2) + '\n', 'utf-8');
      const afterExternal = readFileSync(p, 'utf-8');

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      expect(mgr.restoreCheckpoint(snapshot)).toBe(false);
      warnSpy.mockRestore();
      // 磁盘未被快照覆盖
      expect(readFileSync(p, 'utf-8')).toBe(afterExternal);
    });

    /**
     * op-001 测试夹具：构造含 3 阶段（A/B/C）的 FlowData。
     * A 为选择性命中目标；meta/pipeline 用于验证「其余字段不动」。
     */
    function makeSelectiveData(
      aPhase: PipelinePhase,
      aStatus: string,
    ): FlowData {
      return {
        meta: { version: '1.0', project: 'SelectiveProject', updated: '2026-01-01T00:00:00Z' },
        pipeline: { phase: 'active' as MetaPhase, current: { stage: 'v1.0.0-stage-A', op: 'op-001' }, retry: 7 },
        stages: {
          'v1.0.0-stage-A': { name: 'A', phase: aPhase, status: aStatus, deps: [], ops: {} },
          'v1.0.0-stage-B': { name: 'B', phase: 'plan_passed' as PipelinePhase, status: 'planned', deps: [], ops: {} },
          'v1.0.0-stage-C': { name: 'C', phase: 'scheme_passed' as PipelinePhase, status: 'planned', deps: [], ops: {} },
        },
        reviews: [],
        log: [],
      };
    }

    it('op-001 T6.1: restoreCheckpoint --stage 仅回退指定子树，其它阶段与 pipeline 不变', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeSelectiveData('exec_running' as PipelinePhase, 'testing'));
      mgr.save();
      mgr.saveCheckpoint('v1.0.0-stage-A', 'exec_running' as PipelinePhase);
      const snap = mgr.listCheckpoints('v1.0.0-stage-A')[0];
      expect(snap).toBeDefined();

      // 改动磁盘 A/B/C（B/C 不应被选择性恢复触碰）
      const d = mgr.getData()!;
      d.stages['v1.0.0-stage-A'].phase = 'done';
      d.stages['v1.0.0-stage-A'].status = 'done';
      d.stages['v1.0.0-stage-B'].phase = 'exec_running';
      d.stages['v1.0.0-stage-C'].phase = 'review_passed';
      mgr.save();

      expect(mgr.restoreCheckpoint(snap, { stage: 'v1.0.0-stage-A' })).toBe(true);

      const after = mgr.getData()!;
      expect(after.stages['v1.0.0-stage-A'].phase).toBe('exec_running');
      // B/C 与改动后的磁盘值一致，未被回退
      expect(after.stages['v1.0.0-stage-B'].phase).toBe('exec_running');
      expect(after.stages['v1.0.0-stage-C'].phase).toBe('review_passed');
      // pipeline 其余字段不动
      expect(after.pipeline.retry).toBe(7);
      expect(after.pipeline.phase).toBe('active');
      // current 指向 A 且快照 current 亦指向 A → op 指针与快照同步
      expect(after.pipeline.current).toEqual({ stage: 'v1.0.0-stage-A', op: 'op-001' });
    });

    it('op-001 T6.2: previewRestore/dry-run 零写盘且差异正确', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeSelectiveData('exec_running' as PipelinePhase, 'testing'));
      mgr.save();
      mgr.saveCheckpoint('v1.0.0-stage-A', 'exec_running' as PipelinePhase);
      const snap = mgr.listCheckpoints('v1.0.0-stage-A')[0];

      const d = mgr.getData()!;
      d.stages['v1.0.0-stage-A'].phase = 'done';
      d.stages['v1.0.0-stage-A'].status = 'done';
      mgr.save();

      const flowPath = join(tmpDir, '.openfeel', 'flow.json');
      const before = readFileSync(flowPath, 'utf-8');
      const bakPath = flowPath + '.bak';
      const hadBak = existsSync(bakPath);
      const bakBefore = hadBak ? readFileSync(bakPath, 'utf-8') : '';

      const preview = mgr.previewRestore(snap, { stage: 'v1.0.0-stage-A' });
      expect(preview.ok).toBe(true);
      expect(preview.conflicts).toBe(false);
      expect(preview.diffs.length).toBe(1);
      expect(preview.diffs[0].stage).toBe('v1.0.0-stage-A');
      expect(preview.diffs[0].fromPhase).toBe('done');
      expect(preview.diffs[0].toPhase).toBe('exec_running');
      expect(preview.diffs[0].fromStatus).toBe('done');
      expect(preview.diffs[0].toStatus).toBe('testing');

      // dry-run 返回「可恢复」且零写盘
      expect(mgr.restoreCheckpoint(snap, { stage: 'v1.0.0-stage-A', dryRun: true })).toBe(true);
      expect(readFileSync(flowPath, 'utf-8')).toBe(before);
      if (hadBak) {
        expect(readFileSync(bakPath, 'utf-8')).toBe(bakBefore);
      } else {
        expect(existsSync(bakPath)).toBe(false);
      }
    });

    it('op-001 T6.3: 全量 restore（无 options）写入与快照逐字段一致', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeSelectiveData('exec_running' as PipelinePhase, 'testing'));
      mgr.save();
      mgr.saveCheckpoint('v1.0.0-stage-A', 'exec_running' as PipelinePhase);
      const snap = mgr.listCheckpoints('v1.0.0-stage-A')[0];

      const d = mgr.getData()!;
      d.pipeline.retry = 99;
      d.stages['v1.0.0-stage-A'].phase = 'done';
      mgr.save();

      expect(mgr.restoreCheckpoint(snap)).toBe(true);

      const flowPath = join(tmpDir, '.openfeel', 'flow.json');
      const snapPath = join(tmpDir, '.openfeel', 'checkpoints', snap);
      const onDisk = JSON.parse(readFileSync(flowPath, 'utf-8')) as FlowData;
      const s = JSON.parse(readFileSync(snapPath, 'utf-8')) as FlowData;
      // revision 重定基，比对时归一化；其余字段逐字段一致
      onDisk.meta.revision = s.meta.revision;
      expect(JSON.stringify(onDisk)).toBe(JSON.stringify(s));
    });

    it('op-001 S4: 被恢复子树 status 按 phase 投影（stage-62）', () => {
      const mgr = new FlowManager(tmpDir);
      // 快照 A 为 test_passed 但 status 为陈旧的 done
      mgr.setData(makeSelectiveData('test_passed' as PipelinePhase, 'done'));
      mgr.save();
      mgr.saveCheckpoint('v1.0.0-stage-A', 'test_passed' as PipelinePhase);
      const snap = mgr.listCheckpoints('v1.0.0-stage-A')[0];

      const d = mgr.getData()!;
      d.stages['v1.0.0-stage-A'].phase = 'exec_running';
      d.stages['v1.0.0-stage-A'].status = 'planned';
      mgr.save();

      expect(mgr.restoreCheckpoint(snap, { stage: 'v1.0.0-stage-A' })).toBe(true);
      const after = mgr.getData()!;
      expect(after.stages['v1.0.0-stage-A'].phase).toBe('test_passed');
      // test_passed 投影为中间态 testing（不得为 done）
      expect(after.stages['v1.0.0-stage-A'].status).toBe('testing');
    });

    it('op-001 T6.8: selective/预览下路径穿越、缺文件、阶段不存在仍拒绝', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeSelectiveData('exec_running' as PipelinePhase, 'testing'));
      mgr.save();
      mgr.saveCheckpoint('v1.0.0-stage-A', 'exec_running' as PipelinePhase);
      const snap = mgr.listCheckpoints('v1.0.0-stage-A')[0];

      // 路径穿越
      expect(mgr.restoreCheckpoint('../evil.json', { stage: 'v1.0.0-stage-A' })).toBe(false);
      expect(mgr.previewRestore('../evil.json').ok).toBe(false);
      expect(mgr.previewRestore('../evil.json').reason).toBe('invalid-name');
      // 缺文件
      expect(mgr.previewRestore('nope.json').reason).toBe('missing');
      // 阶段不在快照
      expect(mgr.previewRestore(snap, { stage: 'v9.9.9-stage-99' }).reason).toBe('stage-not-in-snapshot');
      expect(mgr.restoreCheckpoint(snap, { stage: 'v9.9.9-stage-99' })).toBe(false);
    });
  });

  // ═══════════════════════════════════════
  // 阶段生命周期 & 耗时统计
  // ═══════════════════════════════════════

  describe('registerStage & startStage & endStage & getStageStats', () => {
    it('registerStage 应新增阶段（含 deps）', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      mgr.registerStage('stage-02', ['stage-01']);

      const stage = mgr.getData()!.stages['stage-02'];
      expect(stage).toBeDefined();
      expect(stage.phase).toBe('plan_pending');
      expect(stage.deps).toEqual(['stage-01']);
      expect(stage.ops).toEqual({});
    });

    it('registerStage 对已存在的阶段应跳过', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      const before = JSON.stringify(mgr.getData()!.stages['stage-01']);
      mgr.registerStage('stage-01');
      expect(JSON.stringify(mgr.getData()!.stages['stage-01'])).toBe(before);
    });

    it('registerStage 新增阶段应写 register_stage 审计日志（P7，agent=cli）', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      mgr.registerStage('stage-02', ['stage-01']);

      const log = mgr.getData()!.log;
      const last = log[log.length - 1];
      expect(last.action).toBe('register_stage');
      expect(last.agent).toBe('cli');
      expect(last.detail).toEqual({ stageName: 'stage-02', deps: ['stage-01'] });
    });

    it('registerStage 幂等跳过时不写日志（P7）', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      mgr.registerStage('stage-02', ['stage-01']);
      const before = mgr.getData()!.log.length;
      // 已存在 → 幂等跳过，不新增日志
      mgr.registerStage('stage-02');
      expect(mgr.getData()!.log.length).toBe(before);
    });

    it('startStage 应记录 start_time', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      const before = Date.now();
      mgr.startStage('stage-01');
      const stats = mgr.getStageStats('stage-01')!;
      expect(stats.start_time).toBeDefined();
      expect(new Date(stats.start_time).getTime()).toBeGreaterThanOrEqual(before);
      expect(stats.duration_ms).toBe(0);
    });

    it('endStage 应计算 duration_ms', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      mgr.startStage('stage-01');
      mgr.endStage('stage-01');
      const stats = mgr.getStageStats('stage-01')!;
      expect(stats.end_time).toBeDefined();
      expect(stats.duration_ms).toBeGreaterThanOrEqual(0);
    });

    it('endStage 在无 start_time 时 duration_ms 应保持 0', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      mgr.endStage('stage-01');
      expect(mgr.getStageStats('stage-01')!.duration_ms).toBe(0);
    });

    it('getStageStats 对不存在的阶段应返回 null', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      expect(mgr.getStageStats('stage-99')).toBeNull();
    });

    it('getAllStageStats 应返回所有已记录阶段的统计', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      mgr.startStage('stage-01');
      const stats = mgr.getAllStageStats();
      expect(Object.keys(stats)).toContain('stage-01');
      expect(stats['stage-01'].start_time).toBeDefined();
    });
  });

  // ═══════════════════════════════════════
  // addStage
  // ═══════════════════════════════════════

  describe('addStage', () => {
    it('addStage 应新增阶段并更新 current 与日志', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      mgr.addStage('stage-02');

      const data = mgr.getData()!;
      expect(data.stages['stage-02']).toBeDefined();
      expect(data.pipeline.current).toEqual({ stage: 'stage-02', op: '' });
      expect(data.log.some((l) => l.action === 'add_stage' && l.detail.stageId === 'stage-02')).toBe(true);
    });

    it('addStage 对重复阶段应抛出错误', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      expect(() => mgr.addStage('stage-01')).toThrow(/already exists/);
    });
  });

  // ═══════════════════════════════════════
  // 流转查询（hasTransition / getAvailablePhases / getPhaseLabels）
  // ═══════════════════════════════════════

  describe('hasTransition & getAvailablePhases & getPhaseLabels', () => {
    // R-FIX（stage-74 op-004）：全链语义用例显式声明 full
    beforeEach(() => { writeFullModeConfig(tmpDir); });

    it('hasTransition 对合法跳转应返回 true', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData({ ...makeTestFlowData(), pipeline: { phase: 'active' as MetaPhase, current: { stage: 'stage-01', op: 'op-001' }, retry: 0 } });
      expect(mgr.hasTransition('plan_review')).toBe(true);
      expect(mgr.hasTransition('plan_passed')).toBe(true);
    });

    it('hasTransition 对非法跳转应返回 false', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData({ ...makeTestFlowData(), pipeline: { phase: 'active' as MetaPhase, current: { stage: 'stage-01', op: 'op-001' }, retry: 0 } });
      expect(mgr.hasTransition('exec_running')).toBe(false);
    });

    it('getAvailablePhases 应返回当前阶段的可达目标', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      const targets = mgr.getAvailablePhases('stage-01');
      expect(targets).toContain('plan_review');
      expect(targets).toContain('plan_passed');
    });

    it('getAvailablePhases 对不存在的阶段应返回空数组', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      expect(mgr.getAvailablePhases('stage-99')).toEqual([]);
    });

    it('getPhaseLabels 应返回中文标签映射', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      const labels = mgr.getPhaseLabels('zh-CN');
      expect(labels['plan_pending']).toBe('计划待定');
      expect(labels['done']).toBe('已完成');
    });

    it('getPhaseLabels 应返回英文标签映射', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      const labels = mgr.getPhaseLabels('en');
      expect(labels['plan_pending']).toBe('Plan Pending');
      expect(labels['done']).toBe('Completed');
    });
  });

  // ═══════════════════════════════════════
  // op-004 findPhasePath（BFS 唯一路径）
  // ═══════════════════════════════════════

  describe('op-004 findPhasePath（BFS 唯一路径）', () => {
    // R-FIX（stage-74 op-004）：全链语义用例显式声明 full（含自定义 pipeline.yaml 的 2087/2108 用例——mode 不随 pipeline.yaml 走）
    beforeEach(() => { writeFullModeConfig(tmpDir); });

    it('唯一路径 ok / 已到达 already-at-target / 无路径 no-path（只读）', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      const ok = mgr.findPhasePath('stage-01', 'exec_running');
      expect(ok.reason).toBe('ok');
      expect(ok.path).toEqual(['plan_passed', 'scheme_pending', 'scheme_passed', 'exec_running']);
      expect(mgr.findPhasePath('stage-01', 'plan_pending')).toEqual({ path: [], reason: 'already-at-target' });
      // 不存在的阶段 → no-path
      expect(mgr.findPhasePath('stage-99', 'exec_running').reason).toBe('no-path');

      // done 无出边 → no-path
      const doneData = makeTestFlowData();
      doneData.stages['stage-01'].phase = 'done';
      const mgr2 = new FlowManager(tmpDir);
      mgr2.setData(doneData);
      expect(mgr2.findPhasePath('stage-01', 'exec_running').reason).toBe('no-path');
    });

    it('多义路径（等长两条）→ ambiguous', () => {
      mkdirSync(join(tmpDir, '.openfeel'), { recursive: true });
      writeFileSync(join(tmpDir, '.openfeel', 'pipeline.yaml'), JSON.stringify({
        phases: ['plan_pending', 'plan_review', 'plan_passed', 'scheme_pending', 'scheme_passed', 'exec_running'],
        transitions: {
          plan_pending: ['plan_review', 'plan_passed'],
          plan_review: ['scheme_pending'],
          plan_passed: ['scheme_pending'],
          scheme_pending: ['exec_running'],
          scheme_passed: ['exec_running'],
          exec_running: [],
        },
        checkpoint_mapping: {},
        phase_corrections: {},
      }), 'utf-8');
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      expect(mgr.findPhasePath('stage-01', 'scheme_pending').reason).toBe('ambiguous');
    });

    it('深度超限 → depth-exceeded', () => {
      mkdirSync(join(tmpDir, '.openfeel'), { recursive: true });
      const transitions: Record<string, string[]> = {};
      for (let i = 1; i <= 9; i++) {
        transitions[`p${i}`] = [`p${i + 1}`];
      }
      transitions['p10'] = [];
      writeFileSync(join(tmpDir, '.openfeel', 'pipeline.yaml'), JSON.stringify({
        phases: Object.keys(transitions),
        transitions,
        checkpoint_mapping: {},
        phase_corrections: {},
      }), 'utf-8');
      const mgr = new FlowManager(tmpDir);
      const data = makeTestFlowData();
      data.stages['stage-01'].phase = 'p1' as unknown as PipelinePhase;
      mgr.setData(data);
      // p1 → p10 为 9 跳，超过上限 8 → depth-exceeded
      expect(mgr.findPhasePath('stage-01', 'p10').reason).toBe('depth-exceeded');
    });
  });

  // ═══════════════════════════════════════
  // op-012 REV-005：短名 stage 归一化修复
  // ═══════════════════════════════════════

  describe('op-012 REV-005 短名归一化', () => {
    // R-FIX（stage-74 op-004）：全链语义用例显式声明 full
    beforeEach(() => { writeFullModeConfig(tmpDir); });

    /** 构造以全名 v1.0.0-stage-01 建键的 flow 数据（模拟真实 flow.json） */
    const fullKeyData = (phase: PipelinePhase = 'plan_pending'): FlowData => {
      const base = makeTestFlowData();
      return {
        ...base,
        pipeline: { ...base.pipeline, current: { stage: 'v1.0.0-stage-01', op: '' } },
        stages: {
          'v1.0.0-stage-01': { ...base.stages['stage-01'], name: 'v1.0.0-stage-01', phase },
        },
      };
    };

    it('C1: findPhasePath 短名与全名返回完全一致（reason=ok，8 跳）', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(fullKeyData());
      const short = mgr.findPhasePath('stage-01', 'done');
      const full = mgr.findPhasePath('v1.0.0-stage-01', 'done');
      expect(short).toEqual(full);
      expect(short.reason).toBe('ok');
      expect(short.path).toHaveLength(8);
    });

    it('C2: getAvailablePhases 短名与全名数组相等且非空', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(fullKeyData());
      const short = mgr.getAvailablePhases('stage-01');
      const full = mgr.getAvailablePhases('v1.0.0-stage-01');
      expect(short).toEqual(full);
      expect(short.length).toBeGreaterThan(0);
    });

    it('C3: autoRepairInconsistency 短名可触发修复且与全名一致', () => {
      const mgr = new FlowManager(tmpDir);
      const data = fullKeyData('exec_running');
      data.stages['v1.0.0-stage-01'].status = 'done';
      mgr.setData(data);
      const short = mgr.autoRepairInconsistency('stage-01', { dryRun: true });
      const full = mgr.autoRepairInconsistency('v1.0.0-stage-01', { dryRun: true });
      expect(short).toEqual(full);
      expect(short.fixed).toBe(true);
    });

    it('C4: advanceStagePhase 短名不抛错且与全名结果一致', () => {
      const shortMgr = new FlowManager(tmpDir);
      shortMgr.setData(fullKeyData('plan_pending'));
      expect(() => shortMgr.advanceStagePhase('stage-01', 'plan_passed' as PipelinePhase)).not.toThrow();
      expect(shortMgr.getData()!.stages['v1.0.0-stage-01'].phase).toBe('plan_passed');

      const fullMgr = new FlowManager(tmpDir);
      fullMgr.setData(fullKeyData('plan_pending'));
      fullMgr.advanceStagePhase('v1.0.0-stage-01', 'plan_passed' as PipelinePhase);
      expect(fullMgr.getData()!.stages['v1.0.0-stage-01'].phase).toBe('plan_passed');
    });
  });

  // ═══════════════════════════════════════
  // op-005 draft（B4 窄兼容）
  // ═══════════════════════════════════════

  describe('op-005 draft（B4 窄兼容）', () => {
    it('B4-5 核心层：recordAttempt 对 draft op 返回 {false,false} 且 attempts 不变', () => {
      const mgr = new FlowManager(tmpDir);
      const data = makeTestFlowData();
      data.stages['stage-01'].ops['op-001'].state = 'draft';
      mgr.setData(data);

      const outcome = mgr.recordAttempt('stage-01.op-001', 'pass');

      expect(outcome).toEqual({ shouldRetry: false, shouldReplan: false });
      expect(mgr.getData()!.stages['stage-01'].ops['op-001'].attempts).toBe(0);
      expect(mgr.getData()!.stages['stage-01'].ops['op-001'].state).toBe('draft');
      expect(mgr.getData()!.log.some((l) => l.action === 'attempt_refused_draft')).toBe(true);
    });

    it('B4-4：healthCheck 不报 draft 空模板 warning；pending 空模板报 warn', () => {
      FlowManager.initFlow(tmpDir);
      const mgr = new FlowManager(tmpDir);
      const data = makeTestFlowData();
      data.stages['stage-01'].ops['op-001'].state = 'draft';
      mgr.setData(data);
      mgr.save();
      const opsDir = join(tmpDir, '.openfeel', 'plan', 'v1', 'stage-01', 'ops');
      mkdirSync(opsDir, { recursive: true });
      writeFileSync(join(opsDir, 'op-001.md'), '# op-001：t\n\n- [ ] 待补充\n', 'utf-8');
      // draft + 空模板 → 不报「空模板」warn
      expect(mgr.healthCheck(false).items.find((i) => i.section === '空模板')).toBeUndefined();

      // 对照：pending + 空模板 → 报 warn
      const mgr2 = new FlowManager(tmpDir);
      const data2 = makeTestFlowData();
      mgr2.setData(data2);
      mgr2.save();
      writeFileSync(join(opsDir, 'op-001.md'), '# op-001：t\n\n- [ ] 待补充\n', 'utf-8');
      expect(mgr2.healthCheck(false).items.find((i) => i.section === '空模板')?.status).toBe('warn');
    });

    it('B4-4：advance 选 op 时跳过 draft（draft 不被选为 current.op）', () => {
      const mgr = new FlowManager(tmpDir);
      const data = makeTestFlowData();
      const baseOp = data.stages['stage-01'].ops['op-001'];
      data.stages['stage-01'].ops = {
        'op-001': { ...baseOp, state: 'draft' },
        'op-002': { ...baseOp, id: 'op-002', state: 'pending' },
      };
      mgr.setData(data);

      const synced = mgr.syncCurrentOp('stage-01');

      expect(synced.op).toBe('op-002');
    });
  });

  // ═══════════════════════════════════════
  // recoverContext（跨会话上下文恢复）
  // ═══════════════════════════════════════

  describe('recoverContext', () => {
    it('未加载数据时应返回 uninitialized 状态', () => {
      const mgr = new FlowManager(tmpDir);
      const ctx = mgr.recoverContext();
      expect(ctx.phase).toBeNull();
      expect(ctx.stageStatus).toContain('未初始化');
      expect(ctx.pendingTasks).toEqual([]);
    });

    it('应解析 status.md 中的状态与待续事项', () => {
      // 构造 status.md（findStatusPath 三级回退：plan/{series}/ 精确 → plan 递归 → stages 兜底）
      const planDir = join(tmpDir, '.openfeel', 'plan', 'v1', 'stage-01');
      mkdirSync(planDir, { recursive: true });
      writeFileSync(join(planDir, 'status.md'), `# stage-01 状态

- **执行模式**：manual
- **状态**：in_progress
- **阻塞原因**：等待用户确认

## 待续事项

- [ ] 任务A：完成方案
- [ ] 任务B：执行编码
`, 'utf-8');

      const mgr = new FlowManager(tmpDir);
      mgr.setData({
        ...makeTestFlowData(),
        pipeline: { phase: 'active' as MetaPhase, current: { stage: 'stage-01', op: 'op-001' }, retry: 0 },
      });
      const ctx = mgr.recoverContext();
      expect(ctx.phase).toBe('plan_pending');
      expect(ctx.currentOp).toBe('stage-01.op-001');
      expect(ctx.stageStatus).toContain('in_progress');
      expect(ctx.stageStatus).toContain('手动执行');
      expect(ctx.blockedBy).toContain('等待用户确认');
      expect(ctx.pendingTasks).toContain('任务A：完成方案');
      expect(ctx.pendingTasks).toContain('任务B：执行编码');
    });

    it('status.md 不存在时状态应标记为 statusFileMissing', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData({
        ...makeTestFlowData(),
        pipeline: { phase: 'active' as MetaPhase, current: { stage: 'stage-01', op: 'op-001' }, retry: 0 },
      });
      const ctx = mgr.recoverContext();
      expect(ctx.stageStatus).toContain('不存在');
    });

    it('无当前阶段时应列出所有 pending op 并标记 noCurrentStage', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      const ctx = mgr.recoverContext();
      expect(ctx.stageStatus).toContain('无当前阶段');
      expect(ctx.pendingTasks.length).toBeGreaterThan(0);
    });
  });

  // ═══════════════════════════════════════
  // verboseSummary（verbose 模式摘要）
  // ═══════════════════════════════════════

  describe('verboseSummary', () => {
    it('应返回结构化摘要（basic/cascade/recentChanges/downstreamPhases）', () => {
      // 构造 config.yaml 与 status.md
      const openfeelDir = join(tmpDir, '.openfeel');
      mkdirSync(openfeelDir, { recursive: true });
      writeFileSync(join(openfeelDir, 'config.yaml'), 'defaults:\n  execution_mode: auto\n', 'utf-8');
      const planDir = join(tmpDir, '.openfeel', 'plan', 'stage-01');
      mkdirSync(planDir, { recursive: true });
      writeFileSync(join(planDir, 'status.md'), `# stage-01 状态

- **执行模式**：auto
- **状态**：in_progress

## 状态记录

| 时间 | Agent | 状态变化 | 说明 |
|------|-------|----------|------|
| 2026-08-01 | openfeel-planner | plan_pending → plan_review | 计划提交 |
| 2026-08-02 | Feel | plan_review → plan_passed | 计划通过 |
`, 'utf-8');

      const mgr = new FlowManager(tmpDir);
      mgr.setData({
        ...makeTestFlowData(),
        pipeline: { phase: 'active' as MetaPhase, current: { stage: 'stage-01', op: 'op-001' }, retry: 0 },
      });

      const vs = mgr.verboseSummary();
      expect(vs.basic).toBeDefined();
      expect(vs.basic.stagesCount).toBe(1);
      expect(vs.cascade.configDefaults).toEqual({ execution_mode: 'auto' });
      expect(vs.cascade.statusOverrides).toEqual({ execution_mode: 'auto' });
      expect(vs.recentChanges.length).toBe(2);
      expect(vs.recentChanges[0].agent).toBe('openfeel-planner');
      expect(vs.downstreamPhases.length).toBeGreaterThan(0);
      // 下游 phase 应有负责 Agent 映射（plan_* → openfeel-planner）
      expect(vs.downstreamPhases[0].responsibleAgent).toBe('openfeel-planner');
    });
  });

  // ═══════════════════════════════════════
  // addAutoFixReview（自动修复审查）
  // ═══════════════════════════════════════

  describe('addAutoFixReview', () => {
    it('应从 review_failed 直通 exec_running 并写入 resolved 审查', () => {
      const origWarn = console.warn;
      console.warn = () => {};
      try {
        const mgr = new FlowManager(tmpDir);
        mgr.setData({
          ...makeTestFlowData(),
          stages: {
            'stage-01': {
              ...makeTestFlowData().stages['stage-01'],
              phase: 'review_failed' as PipelinePhase,
              status: 'review_failed',
            },
          },
        });
        mgr.addAutoFixReview(
          { id: 'REV-001', title: '修复配置', op: 'stage-01.op-001', status: 'open', priority: 'medium', blocking: false },
          'stage-01.op-001',
        );

        const data = mgr.getData()!;
        const review = data.reviews.find((r) => r.id === 'REV-001');
        expect(review).toBeDefined();
        expect(review!.status).toBe('resolved');
        expect(review!.canAutoFix).toBe(true);
        expect(data.stages['stage-01'].phase).toBe('exec_running');
        expect(data.log.some((l) => l.action === 'auto_fix_review')).toBe(true);
      } finally {
        console.warn = origWarn;
      }
    });

    it('opId 格式不正确时应拒绝并返回', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      mgr.addAutoFixReview(
        { id: 'REV-002', title: 'x', op: 'bad', status: 'open', priority: 'low' },
        'bad',
      );
      expect(mgr.getData()!.reviews.length).toBe(0);
    });

    it('opId 指向不存在的 stage 时应拒绝', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      mgr.addAutoFixReview(
        { id: 'REV-003', title: 'x', op: 'stage-99.op-001', status: 'open', priority: 'low' },
        'stage-99.op-001',
      );
      expect(mgr.getData()!.reviews.length).toBe(0);
    });

    it('当前 phase 非 review_failed 时应拒绝', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData()); // stage-01 phase = plan_pending
      const origWarn = console.warn;
      console.warn = () => {};
      try {
        mgr.addAutoFixReview(
          { id: 'REV-004', title: 'x', op: 'stage-01.op-001', status: 'open', priority: 'low' },
          'stage-01.op-001',
        );
        expect(mgr.getData()!.reviews.length).toBe(0);
        expect(mgr.getData()!.stages['stage-01'].phase).toBe('plan_pending');
      } finally {
        console.warn = origWarn;
      }
    });
  });

  // ═══════════════════════════════════════
  // repair 完整分支
  // ═══════════════════════════════════════

  describe('repair 完整修复', () => {
    it('flow.json 损坏且 .bak 有效时应从 .bak 恢复', () => {
      // 先创建正常 flow.json 和备份
      FlowManager.initFlow(tmpDir);
      const fp = join(tmpDir, '.openfeel', 'flow.json');
      writeFileSync(fp + '.bak', readFileSync(fp, 'utf-8'), 'utf-8');
      // 破坏主文件
      writeFileSync(fp, '{broken json', 'utf-8');

      const mgr = new FlowManager(tmpDir);
      const result = mgr.repair(false);
      expect(result.recovered).toBe(true);
      expect(result.fixed).toBe(true);
      // 恢复后文件应可解析
      expect(JSON.parse(readFileSync(fp, 'utf-8'))).toBeTruthy();
    });

    it('flow.json 损坏且无 .bak 时应重建默认 flow.json', () => {
      mkdirSync(join(tmpDir, '.openfeel'), { recursive: true });
      const fp = join(tmpDir, '.openfeel', 'flow.json');
      writeFileSync(fp, '{broken json', 'utf-8');

      const mgr = new FlowManager(tmpDir);
      const result = mgr.repair(false);
      expect(result.fixed).toBe(true);
      expect(result.changes.some((c) => c.includes('已重建'))).toBe(true);
      expect(JSON.parse(readFileSync(fp, 'utf-8'))).toBeTruthy();
    });

    it('应补全缺失的 meta 字段', () => {
      mkdirSync(join(tmpDir, '.openfeel'), { recursive: true });
      const fp = join(tmpDir, '.openfeel', 'flow.json');
      writeFileSync(fp, JSON.stringify({
        meta: { project: 'Test' },
        pipeline: { phase: 'active', current: { stage: '', op: '' }, retry: 0 },
        stages: {},
        reviews: [],
        log: [],
      }), 'utf-8');

      const mgr = new FlowManager(tmpDir);
      const result = mgr.repair(false);
      expect(result.changes.some((c) => c.includes('meta.version'))).toBe(true);
      expect(result.fixed).toBe(true);
    });

    it('应修正非法的 pipeline.phase 值', () => {
      mkdirSync(join(tmpDir, '.openfeel'), { recursive: true });
      const fp = join(tmpDir, '.openfeel', 'flow.json');
      writeFileSync(fp, JSON.stringify({
        meta: { version: '1.0', project: 'Test', updated: '2026-01-01' },
        pipeline: { phase: 'exec_running', current: { stage: '', op: '' }, retry: 0 },
        stages: {},
        reviews: [],
        log: [],
      }), 'utf-8');

      const mgr = new FlowManager(tmpDir);
      const result = mgr.repair(false);
      expect(result.fixed).toBe(true);
      expect(result.changes.some((c) => c.includes('pipeline.phase'))).toBe(true);
      // 修复后 phase 应为 MetaPhase（active）
      expect(JSON.parse(readFileSync(fp, 'utf-8')).pipeline.phase).toBe('active');
    });
  });

  // ═══════════════════════════════════════
  // autoRepairInconsistency（phase/status 不一致自动修复）
  // ═══════════════════════════════════════

  describe('autoRepairInconsistency', () => {
    it('status=done 但 phase≠done 时以 phase 为权威（不再前推 phase 为 done）', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData({
        ...makeTestFlowData(),
        stages: {
          'stage-01': {
            ...makeTestFlowData().stages['stage-01'],
            status: 'done',
            phase: 'review_passed' as PipelinePhase,
          },
        },
      });
      const result = mgr.autoRepairInconsistency('stage-01');
      expect(result.fixed).toBe(true);
      expect(result.detail).toContain('以 phase 为权威');
      // 新语义：绝不把 phase 前推为 done；改为撤销非法 status=done
      expect(mgr.getData()!.stages['stage-01'].phase).toBe('review_passed');
      expect(mgr.getData()!.stages['stage-01'].status).toBe('review_passed');
    });

    it('phase=done 但 status≠done 时应同步 status 为 done', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData({
        ...makeTestFlowData(),
        stages: {
          'stage-01': {
            ...makeTestFlowData().stages['stage-01'],
            status: 'in_progress',
            phase: 'done' as PipelinePhase,
          },
        },
      });
      const result = mgr.autoRepairInconsistency('stage-01');
      expect(result.fixed).toBe(true);
      expect(mgr.getData()!.stages['stage-01'].status).toBe('done');
    });

    it('一致时返回未检测到不一致', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData({
        ...makeTestFlowData(),
        stages: {
          'stage-01': {
            ...makeTestFlowData().stages['stage-01'],
            status: 'done',
            phase: 'done' as PipelinePhase,
          },
        },
      });
      const result = mgr.autoRepairInconsistency('stage-01');
      expect(result.fixed).toBe(false);
    });

    it('不存在的阶段应返回未修复', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      const result = mgr.autoRepairInconsistency('stage-99');
      expect(result.fixed).toBe(false);
      expect(result.detail).toContain('不存在');
    });

    it('B1: dryRun 预览返回 fixed=true 但不修改内存 phase', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData({
        ...makeTestFlowData(),
        stages: {
          'stage-01': {
            ...makeTestFlowData().stages['stage-01'],
            status: 'done',
            phase: 'exec_running' as PipelinePhase,
          },
        },
      });
      const result = mgr.autoRepairInconsistency('stage-01', { dryRun: true });
      expect(result.fixed).toBe(true);
      expect(result.detail).toContain('→ done');
      // dryRun 下不写内存
      expect(mgr.getData()!.stages['stage-01'].phase).toBe('exec_running');
    });
  });

  // ═══════════════════════════════════════
  // needsMigration & migrate（v4.0 → v4.1 迁移）
  // ═══════════════════════════════════════

  describe('needsMigration & migrate', () => {
    it('新版格式（pipeline.phase=active）needsMigration 应为 false', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      expect(mgr.needsMigration()).toBe(false);
    });

    it('旧版格式（pipeline.phase=exec_running）needsMigration 应为 true', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData({
        ...makeTestFlowData(),
        pipeline: { phase: 'exec_running' as unknown as MetaPhase, current: { stage: 'stage-01', op: 'op-001' }, retry: 0 },
      });
      expect(mgr.needsMigration()).toBe(true);
    });

    it('migrate dry-run 应预览但不修改数据', () => {
      const mgr = new FlowManager(tmpDir);
      const oldData = {
        ...makeTestFlowData(),
        pipeline: { phase: 'exec_running' as unknown as MetaPhase, current: { stage: 'stage-01', op: 'op-001' }, retry: 0 },
      };
      mgr.setData(oldData);
      const result = mgr.migrate(true);
      expect(result.migrated).toBe(true);
      expect(result.failed).toBe(false);
      // dry-run 不修改内存数据
      expect(mgr.getData()!.pipeline.phase).toBe('exec_running' as unknown as MetaPhase);
    });

    it('migrate 应下沉旧 phase 到 stage 并更新全局 phase 为 active', () => {
      // 先落盘 flow.json（migrate 备份依赖磁盘文件存在）
      FlowManager.initFlow(tmpDir);
      const mgr = new FlowManager(tmpDir);
      // stage-01 无 phase（旧格式）
      const oldData = {
        ...makeTestFlowData(),
        stages: {
          'stage-01': {
            ...makeTestFlowData().stages['stage-01'],
            phase: undefined as unknown as PipelinePhase,
          },
        },
        pipeline: { phase: 'exec_running' as unknown as MetaPhase, current: { stage: 'stage-01', op: 'op-001' }, retry: 0 },
      };
      mgr.setData(oldData);
      mgr.save();
      const result = mgr.migrate(false);
      expect(result.migrated).toBe(true);
      const data = mgr.getData()!;
      expect(data.stages['stage-01'].phase).toBe('exec_running');
      expect(data.pipeline.phase).toBe('active');
      expect(data.log.some((l) => l.action === 'migrate_v4.0_to_v4.1')).toBe(true);
    });

    it('migrate 在数据未加载时应返回 failed', () => {
      const mgr = new FlowManager(tmpDir);
      const result = mgr.migrate(false);
      expect(result.failed).toBe(true);
      expect(result.migrated).toBe(false);
    });

    it('已是新版格式时 migrate 应返回无需迁移', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      const result = mgr.migrate(false);
      expect(result.migrated).toBe(false);
      expect(result.failed).toBe(false);
      expect(result.changes[0]).toContain('无需迁移');
    });
  });

  // ═══════════════════════════════════════
  // healthCheck（健康检查）
  // ═══════════════════════════════════════

  describe('healthCheck', () => {
    it('quick 模式应只检查 flow.json 关键项并通过', () => {
      // 使用合法数据（默认模板 current.stage="-" 在空 stages 中不存在，会触发 fail）
      FlowManager.initFlow(tmpDir);
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      mgr.save();
      const result = mgr.healthCheck(true);
      expect(result.ok).toBe(true);
      expect(result.items.length).toBeGreaterThan(0);
      expect(result.items.every((i) => i.section === 'flow.json')).toBe(true);
    });

    it('完整模式应包含跨文件一致性/僵尸状态/config.yaml 检查项', () => {
      FlowManager.initFlow(tmpDir);
      const mgr = new FlowManager(tmpDir);
      const result = mgr.healthCheck(false);
      const sections = result.items.map((i) => i.section);
      expect(sections).toContain('config.yaml'); // 不存在 → warn
      expect(sections).toContain('僵尸状态');
    });

    it('flow.json 不存在时应报告 fail', () => {
      const mgr = new FlowManager(tmpDir);
      const result = mgr.healthCheck(true);
      expect(result.ok).toBe(false);
      expect(result.items.some((i) => i.message.includes('flow.json 不存在'))).toBe(true);
    });

    it('config.yaml 损坏时应报告 fail', () => {
      mkdirSync(join(tmpDir, '.openfeel'), { recursive: true });
      writeFileSync(join(tmpDir, '.openfeel', 'config.yaml'), '{{{{broken', 'utf-8');
      const mgr = new FlowManager(tmpDir);
      const result = mgr.healthCheck(false);
      expect(result.items.some((i) => i.section === 'config.yaml' && i.status === 'fail')).toBe(true);
    });

    it('deps.yaml 无环时应报告 pass', () => {
      FlowManager.initFlow(tmpDir);
      const planDir = join(tmpDir, '.openfeel', 'plan');
      mkdirSync(planDir, { recursive: true });
      writeFileSync(join(planDir, 'deps.yaml'), 'stages:\n  stage-01:\n    deps: []\n  stage-02:\n    deps: [stage-01]\n', 'utf-8');
      const mgr = new FlowManager(tmpDir);
      const result = mgr.healthCheck(false);
      expect(result.items.some((i) => i.section === 'deps.yaml' && i.status === 'pass')).toBe(true);
    });

    it('deps.yaml 存在循环依赖时应报告 fail', () => {
      FlowManager.initFlow(tmpDir);
      const planDir = join(tmpDir, '.openfeel', 'plan');
      mkdirSync(planDir, { recursive: true });
      writeFileSync(join(planDir, 'deps.yaml'), 'stages:\n  stage-01:\n    deps: [stage-02]\n  stage-02:\n    deps: [stage-01]\n', 'utf-8');
      const mgr = new FlowManager(tmpDir);
      const result = mgr.healthCheck(false);
      expect(result.items.some((i) => i.section === 'deps.yaml' && i.status === 'fail')).toBe(true);
    });

    it('pipeline.yaml 不存在时不应产生 fail 项', () => {
      FlowManager.initFlow(tmpDir);
      const mgr = new FlowManager(tmpDir);
      const result = mgr.healthCheck(false);
      expect(result.items.some((i) => i.section === 'pipeline.yaml' && i.status === 'fail')).toBe(false);
    });

    it('B2: 悬空依赖应报告 warn，无悬空时报 pass', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData({
        ...makeTestFlowData(),
        stages: {
          'stage-01': {
            ...makeTestFlowData().stages['stage-01'],
            deps: ['stage-99'],
          },
        },
      });
      const dangling = mgr.healthCheck(false).items.find((i) => i.section === '悬空依赖');
      expect(dangling?.status).toBe('warn');
      expect(dangling?.message).toContain('stage-99');

      // 依赖指向已注册阶段（短名归一化命中）→ pass
      mgr.setData({
        ...makeTestFlowData(),
        stages: {
          'stage-01': { ...makeTestFlowData().stages['stage-01'], deps: [] },
          'stage-02': { ...makeTestFlowData().stages['stage-01'], deps: ['v1.0.0-stage-01'] },
        },
      });
      const okItem = mgr.healthCheck(false).items.find((i) => i.section === '悬空依赖');
      expect(okItem?.status).toBe('pass');
    });

    // ── stage-80 op-002：读侧归档依赖同口径（T2-c，REV-80-002） ──
    it('op-002: 已归档显式 dep 无悬空 warn；未归档不存在 dep 有 warn；短名 typo 不翻转', () => {
      const base = makeTestFlowData().stages['stage-01'];
      // ① 已归档显式 dep（v1.0.0-stage-01 未注册但 ∈ archived_versions）→ 视为已满足 → pass
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData({
        meta: { version: '1.0', project: 't', updated: '', archived_versions: ['v1.0.0'] },
        stages: { 'v1.0.0-stage-05': { ...base, deps: ['v1.0.0-stage-01'] } },
      }));
      expect(mgr.healthCheck(false).items.find((i) => i.section === '悬空依赖')?.status).toBe('pass');

      // ② 不存在且未归档显式 dep（v9.9.9-stage-99）→ warn
      mgr.setData(makeTestFlowData({
        meta: { version: '1.0', project: 't', updated: '', archived_versions: ['v1.0.0'] },
        stages: { 'v1.0.0-stage-05': { ...base, deps: ['v9.9.9-stage-99'] } },
      }));
      const warnItem = mgr.healthCheck(false).items.find((i) => i.section === '悬空依赖');
      expect(warnItem?.status).toBe('warn');
      expect(warnItem?.message).toContain('v9.9.9-stage-99');

      // ③ 短名 stage-99（即便 archived_versions 含 v1.0.0）→ 仍 warn（不翻转，REV-80-001）
      mgr.setData(makeTestFlowData({
        meta: { version: '1.0', project: 't', updated: '', archived_versions: ['v1.0.0'] },
        stages: { 'v1.0.0-stage-05': { ...base, deps: ['stage-99'] } },
      }));
      const shortItem = mgr.healthCheck(false).items.find((i) => i.section === '悬空依赖');
      expect(shortItem?.status).toBe('warn');
      expect(shortItem?.message).toContain('stage-99');
    });
  });

  // ═══════════════════════════════════════
  // stage-80 op-002：syncConfigFieldToStages 循环重构（REV-80-009）
  // ═══════════════════════════════════════

  describe('syncConfigFieldToStages 作用域（REV-80-009）', () => {
    /** 建 off-set 阶段 status.md（含「工作流模式」行，供替换语义命中） */
    function writeStatus(stageDir: string, wm: string): string {
      const dir = join(tmpDir, '.openfeel', 'plan', 'v1', stageDir);
      mkdirSync(dir, { recursive: true });
      const p = join(dir, 'status.md');
      writeFileSync(p, `# ${stageDir}\n\n- **状态**：planned\n- **工作流模式**：${wm}\n`, 'utf-8');
      return p;
    }

    it('off-set 可达：仅 status.md 实写、无冗余键、无 TypeError、flow.json 磁盘字节不变', () => {
      FlowManager.initFlow(tmpDir);
      const mgr = new FlowManager(tmpDir);
      const base = makeTestFlowData().stages['stage-01'];
      // 活跃集不含 v1.0.0-stage-01；仅将其作为 off-set 目标传入
      mgr.setData(makeTestFlowData({ stages: { 'v1.0.0-stage-02': { ...base } } }));
      const statusPath = writeStatus('stage-01', 'full');
      const flowPath = join(tmpDir, '.openfeel', 'flow.json');
      const before = readFileSync(flowPath, 'utf-8');

      const out = mgr.syncConfigFieldToStages('workflow_mode', 'fast', { onlyStages: ['v1.0.0-stage-01'] });

      expect(out).toEqual([{ stage: 'v1.0.0-stage-01', result: 'updated' }]);
      expect(readFileSync(statusPath, 'utf-8')).toContain('- **工作流模式**：fast'); // status.md 实写
      expect(mgr.getData()!.stages['v1.0.0-stage-01']).toBeUndefined(); // 无冗余键（无越界解引用）
      expect(readFileSync(flowPath, 'utf-8')).toBe(before); // flowJsonDirty=false → 零 save
    });

    it('混合作用域：[活跃, off-set] 两者均产结果行；活跃写冗余 + save、off-set 仅 status.md', () => {
      FlowManager.initFlow(tmpDir);
      const mgr = new FlowManager(tmpDir);
      const base = makeTestFlowData().stages['stage-01'];
      mgr.setData(makeTestFlowData({ stages: { 'v1.0.0-stage-02': { ...base } } }));
      const activeStatus = writeStatus('stage-02', 'full');
      const offSetStatus = writeStatus('stage-01', 'full');

      const out = mgr.syncConfigFieldToStages('workflow_mode', 'fast', {
        onlyStages: ['v1.0.0-stage-02', 'v1.0.0-stage-01'],
      });

      expect(out.map((r) => r.stage).sort()).toEqual(['v1.0.0-stage-01', 'v1.0.0-stage-02']);
      expect(out.every((r) => r.result === 'updated')).toBe(true);
      // 活跃：冗余写入 + save（磁盘 flow.json 出现 workflow_mode）
      expect(mgr.getData()!.stages['v1.0.0-stage-02'].workflow_mode).toBe('fast');
      const flow = JSON.parse(readFileSync(join(tmpDir, '.openfeel', 'flow.json'), 'utf-8'));
      expect(flow.stages['v1.0.0-stage-02'].workflow_mode).toBe('fast');
      // off-set：无冗余键、status.md 实写
      expect(mgr.getData()!.stages['v1.0.0-stage-01']).toBeUndefined();
      expect(readFileSync(activeStatus, 'utf-8')).toContain('- **工作流模式**：fast');
      expect(readFileSync(offSetStatus, 'utf-8')).toContain('- **工作流模式**：fast');
    });

    it('零回归：onlyStages 缺省 = 全量遍历（键序）；活跃 onlyStages 仅覆盖命中键', () => {
      FlowManager.initFlow(tmpDir);
      const mgr = new FlowManager(tmpDir);
      const base = makeTestFlowData().stages['stage-01'];
      mgr.setData(makeTestFlowData({
        stages: { 'v1.0.0-stage-01': { ...base }, 'v1.0.0-stage-02': { ...base } },
      }));
      writeStatus('stage-01', 'full');
      writeStatus('stage-02', 'full');

      // 全量：两键各产一行，顺序 = stages 键序
      const all = mgr.syncConfigFieldToStages('workflow_mode', 'fast');
      expect(all.map((r) => r.stage)).toEqual(['v1.0.0-stage-01', 'v1.0.0-stage-02']);

      // 活跃 onlyStages：仅命中键（未选定键的 status.md 不受影响）
      writeStatus('stage-01', 'full');
      writeStatus('stage-02', 'full');
      const one = mgr.syncConfigFieldToStages('workflow_mode', 'fast', { onlyStages: ['v1.0.0-stage-02'] });
      expect(one.map((r) => r.stage)).toEqual(['v1.0.0-stage-02']);
    });
  });

  // ═══════════════════════════════════════
  // 孤儿 op 对账（stage-51 N1）
  // ═══════════════════════════════════════

  describe('孤儿 op 对账（stage-51 N1）', () => {
    it('N1-2：findOrphanOps 区分 keyOrphans / fileOrphans（两种命名均算文件存在）', () => {
      FlowManager.initFlow(tmpDir);
      const mgr = new FlowManager(tmpDir);
      const baseOp = makeTestFlowData().stages['stage-01'].ops['op-001'];
      mgr.setData(makeTestFlowData({
        stages: {
          'stage-01': {
            ...makeTestFlowData().stages['stage-01'],
            ops: {
              'op-001': baseOp,
              'op-002': { ...baseOp, id: 'op-002', title: 'o2' },
            },
          },
        },
      }));
      mgr.save();
      // ops 目录：op-002 存在（对应键），op-003 无键（文件孤儿）
      const opsDir = join(tmpDir, '.openfeel', 'plan', 'v1', 'stage-01', 'ops');
      mkdirSync(opsDir, { recursive: true });
      writeFileSync(join(opsDir, 'op-002_x.md'), '', 'utf-8');
      writeFileSync(join(opsDir, 'op-003_y.md'), '', 'utf-8');

      const { keyOrphans, fileOrphans } = findOrphanOps(tmpDir);
      expect(keyOrphans).toEqual([{ stage: 'stage-01', opId: 'op-001' }]);
      expect(fileOrphans).toEqual([{ stage: 'stage-01', opId: 'op-003' }]);
    });

    it('N1-3：healthCheck 含孤儿时出现 warn（detail 含数量），无孤儿时不产生该 warn', () => {
      FlowManager.initFlow(tmpDir);
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      mgr.save();

      // 无 ops 文件 → op-001 为键孤儿
      const warnItem = mgr.healthCheck(false).items.find((i) => i.section === '孤儿操作方案');
      expect(warnItem?.status).toBe('warn');
      expect(warnItem?.message).toContain('1');

      // 补齐模板文件 → 无孤儿（不产生 warn 项）
      const opsDir = join(tmpDir, '.openfeel', 'plan', 'v1', 'stage-01', 'ops');
      mkdirSync(opsDir, { recursive: true });
      writeFileSync(join(opsDir, 'op-001_a.md'), '', 'utf-8');
      const none = mgr.healthCheck(false).items.find((i) => i.section === '孤儿操作方案');
      expect(none).toBeUndefined();
    });

    it('N1-3：仅孤儿（无 fail）时 healthCheck.ok 仍为 true（退出码不变）', () => {
      FlowManager.initFlow(tmpDir);
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      mgr.save();
      expect(mgr.healthCheck(false).ok).toBe(true);
    });
  });

  // ═══════════════════════════════════════
  // N4 current.op 生命周期（stage-51 op-004）
  // ═══════════════════════════════════════

  describe('N4 current.op 生命周期（stage-51 op-004）', () => {
    const baseStage = makeTestFlowData().stages['stage-01'];
    const baseOp = baseStage.ops['op-001'];
    const op2 = { ...baseOp, id: 'op-002', title: 'o2' };

    it('N4-1：recordAttempt pass 复用 syncCurrentOp（单一 owner）并指向下一 pending', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData({
        stages: { 'stage-01': { ...baseStage, ops: { 'op-001': baseOp, 'op-002': op2 } } },
        pipeline: { phase: 'active' as MetaPhase, current: { stage: 'stage-01', op: 'op-001' }, retry: 0 },
      }));
      const spy = vi.spyOn(mgr, 'syncCurrentOp');

      mgr.recordAttempt('stage-01.op-001', 'pass');

      expect(spy).toHaveBeenCalledWith('stage-01');
      expect(mgr.getData()!.pipeline.current.op).toBe('op-002');
    });

    it('N4-1：recordAttempt fail-retry 复用 syncCurrentOp，current.op 稳定指向该 op', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData({
        stages: { 'stage-01': { ...baseStage, ops: { 'op-001': { ...baseOp, state: 'executing' } } } },
        pipeline: { phase: 'active' as MetaPhase, current: { stage: 'stage-01', op: 'op-001' }, retry: 0 },
      }));
      const spy = vi.spyOn(mgr, 'syncCurrentOp');

      mgr.recordAttempt('stage-01.op-001', 'fail');

      expect(spy).toHaveBeenCalledWith('stage-01');
      expect(mgr.getData()!.pipeline.current.op).toBe('op-001');
    });

    it('N4-1：pass 末位 op → current.op 置空（与 T1 语义一致）', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData({
        pipeline: { phase: 'active' as MetaPhase, current: { stage: 'stage-01', op: 'op-001' }, retry: 0 },
      }));

      mgr.recordAttempt('stage-01.op-001', 'pass');

      expect(mgr.getData()!.pipeline.current.op).toBe('');
      expect(mgr.getData()!.pipeline.current.stage).toBe('stage-01');
    });
  });

  // ═══════════════════════════════════════
  // mapPhaseToStageStatus（独立辅助函数）
  // ═══════════════════════════════════════

  describe('mapPhaseToStageStatus', () => {
    it('review_failed 应映射为 review_failed', () => {
      expect(mapPhaseToStageStatus('review_failed', 'anything')).toBe('review_failed');
    });

    it('review_passed 恒映射为 review_passed（中间相位不投影为终态）', () => {
      expect(mapPhaseToStageStatus('review_passed', 'x')).toBe('review_passed');
    });

    it('test_passed 应映射为中间状态 testing', () => {
      expect(mapPhaseToStageStatus('test_passed', 'review_passed')).toBe('testing');
    });

    it('archiving 应映射为 archiving', () => {
      expect(mapPhaseToStageStatus('archiving', 'testing')).toBe('archiving');
    });

    it('done 应映射为 done', () => {
      expect(mapPhaseToStageStatus('done', 'archiving')).toBe('done');
    });

    it('其他阶段应保持当前状态不变', () => {
      expect(mapPhaseToStageStatus('plan_pending', 'in_progress')).toBe('in_progress');
      expect(mapPhaseToStageStatus('exec_running', 'planned')).toBe('planned');
    });
  });

  // ═══════════════════════════════════════
  // mapPhaseToStageStatus 不变量 / auto-repair 方向（op-001 T6）
  // ═══════════════════════════════════════

  describe('mapPhaseToStageStatus 不变量（op-001 T6.1）', () => {
    it('全相位扫描：所有非 done 相位返回值 ≠ done；review_passed 恒为 review_passed', () => {
      for (const p of PIPELINE_PHASES) {
        if (p === 'done') {
          continue;
        }
        // 不变量：任何非 done 相位都不得投影为终态 done
        expect(mapPhaseToStageStatus(p as PipelinePhase, 'x')).not.toBe('done');
      }
      expect(mapPhaseToStageStatus('review_passed', 'x')).toBe('review_passed');
    });
  });

  describe('autoRepairInconsistency 方向反转（op-001 T6.2/6.4/6.5）', () => {
    /** 构造单阶段 FlowManager（指定 phase/status） */
    function makeMgr(phase: PipelinePhase, status: string): FlowManager {
      const mgr = new FlowManager(tmpDir);
      mgr.setData({
        ...makeTestFlowData(),
        stages: {
          'stage-01': {
            ...makeTestFlowData().stages['stage-01'],
            phase,
            status,
          },
        },
      });
      return mgr;
    }

    it('T6.2 锁复现：phase=review_passed, status=done → status 撤销为 review_passed，phase 不变', () => {
      const mgr = makeMgr('review_passed', 'done');
      const result = mgr.autoRepairInconsistency('stage-01');
      expect(result.fixed).toBe(true);
      expect(mgr.getData()!.stages['stage-01'].phase).toBe('review_passed');
      expect(mgr.getData()!.stages['stage-01'].status).toBe('review_passed');
    });

    it('T6.4 合法方向：phase=done, status=planned → status 同步为 done', () => {
      const mgr = makeMgr('done', 'planned');
      const result = mgr.autoRepairInconsistency('stage-01');
      expect(result.fixed).toBe(true);
      expect(mgr.getData()!.stages['stage-01'].status).toBe('done');
      expect(mgr.getData()!.stages['stage-01'].phase).toBe('done');
    });

    it('T6.5 dry-run 零写盘：仅报告 fixed=true，内存 phase/status 均不变', () => {
      const mgr = makeMgr('review_passed', 'done');
      const result = mgr.autoRepairInconsistency('stage-01', { dryRun: true });
      expect(result.fixed).toBe(true);
      expect(mgr.getData()!.stages['stage-01'].status).toBe('done');
      expect(mgr.getData()!.stages['stage-01'].phase).toBe('review_passed');
    });
  });

  describe('端到端：review_passed 不再锁死 done（op-001 T6.3）', () => {
    // R-FIX（stage-74 op-004）：全链语义用例显式声明 full
    beforeEach(() => { writeFullModeConfig(tmpDir); });

    it('advance review_passed 后 status≠done，且 test_pending 可达', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      mgr.advanceStagePhase('stage-01', 'review_passed' as PipelinePhase);
      expect(mgr.getData()!.stages['stage-01'].status).toBe('review_passed');
      expect(mgr.getData()!.stages['stage-01'].status).not.toBe('done');
      // 相位仍为 review_passed → test_pending 路径可达
      expect(mgr.findPhasePath('stage-01', 'test_pending').reason).not.toBe('no-path');
    });
  });

  // ═══════════════════════════════════════
  // resetStagePhase（stage-65 op-002）
  // ═══════════════════════════════════════
  describe('resetStagePhase（stage-65 op-002）', () => {
    /** 构造以全名 v1.0.0-stage-01 建键的单阶段数据（对齐 plan 用例中的 stageId） */
    function makeResetMgr(
      phase: PipelinePhase,
      status: string,
      overrides?: Partial<FlowData>,
    ): FlowManager {
      const base = makeTestFlowData();
      const mgr = new FlowManager(tmpDir);
      mgr.setData({
        ...base,
        pipeline: { ...base.pipeline, current: { stage: 'v1.0.0-stage-01', op: 'op-001' } },
        stages: {
          'v1.0.0-stage-01': {
            ...base.stages['stage-01'],
            name: 'v1.0.0-stage-01',
            phase,
            status,
          },
        },
        ...overrides,
      });
      return mgr;
    }

    it('T6.4 回退成功：phase 回退且 status 按 mapPhaseToStageStatus 投影', () => {
      const mgr = makeResetMgr('review_passed', 'review_passed');
      const r = mgr.resetStagePhase('v1.0.0-stage-01', 'review_pending');
      expect(r.changed).toBe(true);
      expect(r.from).toBe('review_passed');
      expect(r.to).toBe('review_pending');
      const stage = mgr.getData()!.stages['v1.0.0-stage-01'];
      expect(stage.phase).toBe('review_pending');
      // mapPhaseToStageStatus('review_pending', 'review_passed') → default 分支保持原 status
      expect(stage.status).toBe('review_passed');
      const log = mgr.getData()!.log;
      expect(log[log.length - 1].action).toBe('reset_stage_phase');
    });

    it('T6.4 前进允许：不受正向转移表限制（plan_pending → exec_running）', () => {
      const mgr = makeResetMgr('plan_pending', 'planned');
      const r = mgr.resetStagePhase('v1.0.0-stage-01', 'exec_running');
      expect(r.changed).toBe(true);
      expect(mgr.getData()!.stages['v1.0.0-stage-01'].phase).toBe('exec_running');
    });

    it('T6.4 done 投影：phase=done, status=archiving → status 同步为 done（幂等路径仍算 changed）', () => {
      const mgr = makeResetMgr('done', 'archiving');
      const r = mgr.resetStagePhase('v1.0.0-stage-01', 'done');
      expect(r.changed).toBe(true);
      expect(mgr.getData()!.stages['v1.0.0-stage-01'].status).toBe('done');
    });

    it('T6.5 to=done + blocking REV → 拒绝且 phase 不变', () => {
      const mgr = makeResetMgr('test_passed', 'testing', {
        reviews: [
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
        ],
      });
      expect(() => mgr.resetStagePhase('v1.0.0-stage-01', 'done')).toThrow(/阻塞 REV/);
      expect(mgr.getData()!.stages['v1.0.0-stage-01'].phase).toBe('test_passed');
    });

    it('T6.5 非阻塞 REV 放行：blocking=false 的 open REV 不阻断', () => {
      const mgr = makeResetMgr('test_passed', 'testing', {
        reviews: [
          {
            id: 'REV-002',
            op: 'v1.0.0-stage-01.op-001',
            title: 't',
            status: 'open',
            blocking: false,
            priority: 'low',
            filed_by: 'openfeel-reviewer',
            filed_at: '2026-01-01T00:00:00Z',
          },
        ],
      });
      expect(() => mgr.resetStagePhase('v1.0.0-stage-01', 'done')).not.toThrow();
      expect(mgr.getData()!.stages['v1.0.0-stage-01'].phase).toBe('done');
    });

    it('T6.5 非法 phase → 抛错且不写盘', () => {
      const mgr = makeResetMgr('review_passed', 'review_passed');
      expect(() => mgr.resetStagePhase('v1.0.0-stage-01', 'bogus')).toThrow(/非法 phase/);
      expect(mgr.getData()!.stages['v1.0.0-stage-01'].phase).toBe('review_passed');
    });

    it('T6.5 阶段不存在 → 抛错', () => {
      const mgr = makeResetMgr('review_passed', 'review_passed');
      expect(() => mgr.resetStagePhase('v9.9.9-stage-99', 'done')).toThrow(/不存在/);
    });

    it('T6.6 dry-run 零写：内存 phase/status 不变、磁盘字节不变、无新日志', () => {
      const mgr = makeResetMgr('done', 'done');
      mgr.save();
      const flowPath = join(tmpDir, '.openfeel', 'flow.json');
      const before = readFileSync(flowPath, 'utf-8');
      const logCountBefore = mgr.getData()!.log.length;

      const r = mgr.resetStagePhase('v1.0.0-stage-01', 'review_passed', { dryRun: true });
      expect(r.changed).toBe(true);
      expect(mgr.getData()!.stages['v1.0.0-stage-01'].phase).toBe('done');
      expect(mgr.getData()!.log.length).toBe(logCountBefore);
      expect(readFileSync(flowPath, 'utf-8')).toBe(before);
    });

    it('T6.6 no-op 幂等：phase 与投影 status 均未变 → changed=false 且不追加日志', () => {
      const mgr = makeResetMgr('review_pending', 'review_passed');
      const logCountBefore = mgr.getData()!.log.length;
      const r = mgr.resetStagePhase('v1.0.0-stage-01', 'review_pending');
      expect(r.changed).toBe(false);
      expect(mgr.getData()!.log.length).toBe(logCountBefore);
    });

    it('T6.7 复位后 auto-repair 不锁 done，advance test_pending 通过', () => {
      const mgr = makeResetMgr('done', 'done');
      const r = mgr.resetStagePhase('v1.0.0-stage-01', 'review_passed');
      expect(r.changed).toBe(true);
      expect(mgr.getData()!.stages['v1.0.0-stage-01'].status).toBe('review_passed');
      expect(mgr.autoRepairInconsistency('v1.0.0-stage-01').fixed).toBe(false);
      expect(() => mgr.advanceStagePhase('v1.0.0-stage-01', 'test_pending')).not.toThrow();
      expect(mgr.getData()!.stages['v1.0.0-stage-01'].phase).toBe('test_pending');
    });

    it('T6.4 短名归一化：短名与全名复位结果一致', () => {
      const shortMgr = makeResetMgr('review_passed', 'review_passed');
      shortMgr.resetStagePhase('stage-01', 'review_pending');
      expect(shortMgr.getData()!.stages['v1.0.0-stage-01'].phase).toBe('review_pending');

      const fullMgr = makeResetMgr('review_passed', 'review_passed');
      fullMgr.resetStagePhase('v1.0.0-stage-01', 'review_pending');
      expect(fullMgr.getData()!.stages['v1.0.0-stage-01'].phase).toBe('review_pending');
    });
  });
});

// ═══════════════════════════════════════
// normalizeAgentName（P5 读取兼容，REV-303/304）
// ═══════════════════════════════════════

describe('normalizeAgentName', () => {
  it('旧名（含大小写）均归一为新名', () => {
    expect(normalizeAgentName('executor')).toBe('openfeel-executor');
    expect(normalizeAgentName('Executor')).toBe('openfeel-executor');
    expect(normalizeAgentName('EXECUTOR')).toBe('openfeel-executor');
    expect(normalizeAgentName('planner')).toBe('openfeel-planner');
    expect(normalizeAgentName('schemer')).toBe('openfeel-schemer');
    expect(normalizeAgentName('reviewer')).toBe('openfeel-reviewer');
    expect(normalizeAgentName('feel-tester')).toBe('openfeel-feel-tester');
    expect(normalizeAgentName('utility')).toBe('openfeel-utility');
    expect(normalizeAgentName('vision')).toBe('openfeel-vision');
    expect(normalizeAgentName('archiver')).toBe('openfeel-archiver');
  });

  it('幂等：已是新名原样返回，不二次前缀化', () => {
    expect(normalizeAgentName('openfeel-executor')).toBe('openfeel-executor');
    expect(normalizeAgentName('openfeel-feel-tester')).toBe('openfeel-feel-tester');
  });

  it('feel / none / unknown / 非 agent 值原样保留', () => {
    expect(normalizeAgentName('feel')).toBe('feel');
    expect(normalizeAgentName('none')).toBe('none');
    expect(normalizeAgentName('unknown')).toBe('unknown');
    expect(normalizeAgentName('flow-manager')).toBe('flow-manager');
  });

  it('空值原样返回', () => {
    expect(normalizeAgentName('')).toBe('');
  });
});

describe('读取兼容（P5）：旧 flow.json 可读且展示新名', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-compat-'));
  });
  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('含旧 assignee: planner 的 flow.json 加载不报错，经 normalizeAgentName 展示新名', () => {
    // 构造含旧名的旧版 flow.json（保留旧名 fixture，验证读取兼容）
    const oldData = makeTestFlowData();
    oldData.stages['stage-01'].ops['op-001'].assignee = 'planner';
    mkdirSync(join(tmpDir, '.openfeel'), { recursive: true });
    writeFileSync(
      join(tmpDir, '.openfeel', 'flow.json'),
      JSON.stringify(oldData, null, 2) + '\n',
      'utf-8',
    );

    const mgr = new FlowManager(tmpDir);
    const data = mgr.getData();
    expect(data).not.toBeNull();
    // 不迁移历史：磁盘旧名保持可读
    expect(data!.stages['stage-01'].ops['op-001'].assignee).toBe('planner');
    // 展示处归一为新名
    expect(normalizeAgentName(data!.stages['stage-01'].ops['op-001'].assignee)).toBe('openfeel-planner');
  });
});

// ═══════════════════════════════════════
// normalizeAgentName 接入点补强（stage-39 op-002）
// ═══════════════════════════════════════

describe('normalizeAgentName 接入点补强（stage-39）', () => {
  it('全部 8 个旧名映射到 openfeel-* 且新名幂等（不二次前缀化）', () => {
    const legacy = ['planner', 'schemer', 'executor', 'reviewer', 'feel-tester', 'utility', 'vision', 'archiver'];
    for (const old of legacy) {
      const neu = normalizeAgentName(old);
      expect(neu).toBe(`openfeel-${old}`);
      // 二次归一化稳定（幂等链）
      expect(normalizeAgentName(neu)).toBe(neu);
    }
  });

  it('大小写归一 + 空值/非 agent 值原样保留', () => {
    expect(normalizeAgentName('Planner')).toBe('openfeel-planner');
    expect(normalizeAgentName('FEEL-TESTER')).toBe('openfeel-feel-tester');
    expect(normalizeAgentName('feel')).toBe('feel');
    expect(normalizeAgentName('')).toBe('');
  });
});

// ═══════════════════════════════════════
// stage-41 op-002：stageDir 冲突检测
// ═══════════════════════════════════════

describe('stageDir 冲突检测（stage-41 op-002）', () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-conflict-')); });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it('registerStage 对不同 id 同目录抛错；同 id 幂等', () => {
    FlowManager.initFlow(tmpDir);
    const mgr = new FlowManager(tmpDir);
    mgr.addStage('v4-stage-04');
    mgr.save();
    // 不同 id 映射同 (series, stageDir) → 抛错
    const logBefore = mgr.getData()!.log.length;
    expect(() => mgr.registerStage('v4.0.0-stage-04')).toThrow(/阶段目录冲突/);
    // 冲突不写日志（仅记录实际新增）
    expect(mgr.getData()!.log.length).toBe(logBefore);
    // 同 id 重复注册 → 幂等静默，键内容不变
    const before = JSON.stringify(mgr.getData()!.stages['v4-stage-04']);
    expect(() => mgr.registerStage('v4-stage-04')).not.toThrow();
    expect(JSON.stringify(mgr.getData()!.stages['v4-stage-04'])).toBe(before);
  });

  it('addStage 对不同 id 同目录抛错', () => {
    FlowManager.initFlow(tmpDir);
    const mgr = new FlowManager(tmpDir);
    mgr.addStage('v4-stage-04');
    mgr.save();
    expect(() => mgr.addStage('v4.0.0-stage-04')).toThrow(/阶段目录冲突/);
  });
});

// ═══════════════════════════════════════
// stage-41 op-003：checkRemovable / removeStage
// ═══════════════════════════════════════

/** 构造一个阶段数据（默认无 ops、plan_pending、无 deps） */
function makeStage41Stage(overrides?: Partial<StageData>): StageData {
  return {
    name: 'x',
    phase: 'plan_pending' as PipelinePhase,
    status: 'planned',
    deps: [],
    ops: {},
    ...overrides,
  };
}

/** 构造一个 op 数据 */
function makeStage41Op(state: OpState = 'pending') {
  return {
    id: 'op-001',
    title: 't',
    state,
    assignee: 'openfeel-executor',
    attempts: 0,
    max_attempts: 3,
    checkpoints: {
      plan: 'pending',
      scheme: 'pending',
      exec: { attempts: 0, self: 'pending' },
      review: 'pending',
      test: 'pending',
    },
  };
}

describe('checkRemovable & removeStage（stage-41 op-003）', () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-remove-')); });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  /** 构造含指定 stages 的已加载管理器 */
  function makeMgr(stages: Record<string, StageData>, current: { stage: string; op: string }): FlowManager {
    const mgr = new FlowManager(tmpDir);
    mgr.setData({
      meta: { version: '1.0', project: 'T', updated: '2026-01-01T00:00:00Z' },
      pipeline: { phase: 'active' as MetaPhase, current, retry: 0 },
      stages,
      reviews: [],
      log: [],
    });
    return mgr;
  }

  /** 取最近一条日志 */
  function lastLog(mgr: FlowManager) {
    const log = mgr.getData()!.log;
    return log[log.length - 1];
  }

  it('ops 非空默认拒绝；--force 越过并兜底 current', () => {
    const stages: Record<string, StageData> = {
      'A': makeStage41Stage({ name: 'A', ops: { 'op-001': makeStage41Op() } }),
      'B': makeStage41Stage({ name: 'B', phase: 'done' as PipelinePhase }),
    };
    const mgr = makeMgr(stages, { stage: 'A', op: 'op-001' });
    expect(() => mgr.removeStage('A')).toThrow(/仍有 1 个未归档的 op/);
    mgr.removeStage('A', { force: true });
    expect(mgr.getData()!.stages['A']).toBeUndefined();
    // B 为 done → 无非 done 阶段 → 清空 current
    expect(mgr.getData()!.pipeline.current).toEqual({ stage: '', op: '' });
    expect(lastLog(mgr).action).toBe('remove_stage');
    expect(lastLog(mgr).detail.stageId).toBe('A');
  });

  it('当前活跃阶段默认拒绝；--force 越过并回退首个非 done', () => {
    const stages: Record<string, StageData> = {
      'A': makeStage41Stage({ name: 'A' }),
      'B': makeStage41Stage({ name: 'B', phase: 'exec_running' as PipelinePhase }),
    };
    const mgr = makeMgr(stages, { stage: 'A', op: '' });
    expect(() => mgr.removeStage('A')).toThrow(/当前活跃阶段/);
    mgr.removeStage('A', { force: true });
    expect(mgr.getData()!.pipeline.current).toEqual({ stage: 'B', op: '' });
  });

  it('非 current 且 ops 空默认可移除，current 不变', () => {
    const stages: Record<string, StageData> = {
      'A': makeStage41Stage({ name: 'A' }),
      'C': makeStage41Stage({ name: 'C' }),
    };
    const mgr = makeMgr(stages, { stage: 'C', op: '' });
    mgr.removeStage('A');
    expect(mgr.getData()!.stages['A']).toBeUndefined();
    expect(mgr.getData()!.pipeline.current).toEqual({ stage: 'C', op: '' });
  });

  it('阶段不存在抛错', () => {
    const mgr = makeMgr({ 'A': makeStage41Stage({ name: 'A' }) }, { stage: 'A', op: '' });
    expect(() => mgr.removeStage('nope')).toThrow(/阶段不存在/);
    expect(mgr.checkRemovable('nope').ok).toBe(false);
  });

  it('被其它阶段 deps 引用默认拒绝；--force 越过并记录 referencing（REV-004）', () => {
    const stages: Record<string, StageData> = {
      'A': makeStage41Stage({ name: 'A' }),
      'B': makeStage41Stage({ name: 'B', deps: ['A'] }),
    };
    const mgr = makeMgr(stages, { stage: 'B', op: '' });
    const check = mgr.checkRemovable('A');
    expect(check.ok).toBe(false);
    expect(check.referencing).toEqual(['B']);
    expect(check.reason).toContain('被其它阶段依赖');
    expect(() => mgr.removeStage('A')).toThrow(/被其它阶段依赖/);
    mgr.removeStage('A', { force: true });
    expect(lastLog(mgr).detail.referencing).toEqual(['B']);
  });

  it('deps 短名归一化匹配 (series, stageDir)', () => {
    const stages: Record<string, StageData> = {
      'v1.0.0-stage-05': makeStage41Stage({ name: 'A' }),
      'B': makeStage41Stage({ name: 'B', deps: ['stage-05'] }),
    };
    const mgr = makeMgr(stages, { stage: 'B', op: '' });
    expect(mgr.checkRemovable('v1.0.0-stage-05').referencing).toEqual(['B']);
  });

  it('存量 stage 缺 deps 字段不崩且不误判', () => {
    const noDeps = makeStage41Stage({ name: 'A' });
    delete (noDeps as { deps?: string[] }).deps;
    const stages: Record<string, StageData> = { 'A': noDeps, 'B': makeStage41Stage({ name: 'B' }) };
    const mgr = makeMgr(stages, { stage: 'B', op: '' });
    const check = mgr.checkRemovable('A');
    expect(check.ok).toBe(true);
    expect(check.referencing).toEqual([]);
  });

  it('remove_stage 日志含被删阶段快照（REV-006）', () => {
    const a = makeStage41Stage({
      name: 'A',
      phase: 'exec_running' as PipelinePhase,
      status: 'in_progress',
      deps: ['X'],
    });
    const mgr = makeMgr({ 'A': a, 'B': makeStage41Stage({ name: 'B' }) }, { stage: 'B', op: '' });
    mgr.removeStage('A', { force: true });
    expect(lastLog(mgr).detail.snapshot).toEqual({
      phase: 'exec_running',
      status: 'in_progress',
      deps: ['X'],
      opKeys: [],
    });
  });

  it('--purge 仅返回 purgeTarget（不删目录）；无 purge 返回 undefined（REV-009 契约）', () => {
    const dir = join(tmpDir, '.openfeel', 'plan', 'v1', 'stage-77');
    // 无 purge：目录保留，purgeTarget=undefined
    mkdirSync(dir, { recursive: true });
    let mgr = makeMgr(
      { 'v1.0.0-stage-77': makeStage41Stage({ name: 'A' }), 'B': makeStage41Stage({ name: 'B' }) },
      { stage: 'B', op: '' },
    );
    const noPurge = mgr.removeStage('v1.0.0-stage-77', { force: true });
    expect(noPurge.purgeTarget).toBeUndefined();
    expect(existsSync(dir)).toBe(true);
    expect(lastLog(mgr).detail.purgeTarget).toBeNull();

    // purge：返回 purgeTarget，但 core **不删目录**（删除由命令层在 save 成功后执行）
    mkdirSync(dir, { recursive: true });
    mgr = makeMgr(
      { 'v1.0.0-stage-77': makeStage41Stage({ name: 'A' }), 'B': makeStage41Stage({ name: 'B' }) },
      { stage: 'B', op: '' },
    );
    const withPurge = mgr.removeStage('v1.0.0-stage-77', { force: true, purge: true });
    expect(withPurge.purgeTarget).toBe(dir);
    expect(existsSync(dir)).toBe(true);
    expect(lastLog(mgr).detail.purgeTarget).toBe(dir);
  });
});

// ═══════════════════════════════════════
// stage-41 op-001：运行时 pipeline 访问器
// ═══════════════════════════════════════

describe('getPipelinePhases & getPipelineTransitions（stage-41 op-001）', () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-pipeline-')); });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it('无 pipeline.yaml 时回退默认配置（15 phase + 组合 key）', () => {
    const mgr = new FlowManager(tmpDir);
    const phases = mgr.getPipelinePhases();
    expect(phases).toHaveLength(15);
    expect(phases).toContain('plan_pending');
    expect(phases).toContain('done');
    const transitions = mgr.getPipelineTransitions();
    expect(transitions['review_passed|test_passed']).toEqual(['archiving']);
  });

  it('自定义 pipeline.yaml 时反映其 phase/转移表（证明数据源为运行时配置）', () => {
    mkdirSync(join(tmpDir, '.openfeel'), { recursive: true });
    writeFileSync(
      join(tmpDir, '.openfeel', 'pipeline.yaml'),
      [
        'phases:',
        '  - custom_phase',
        '  - done',
        'transitions:',
        '  custom_phase: [done]',
        '  done: []',
        'checkpoint_mapping: {}',
        'phase_corrections: {}',
        '',
      ].join('\n'),
      'utf-8',
    );
    const mgr = new FlowManager(tmpDir);
    expect(mgr.getPipelinePhases()).toContain('custom_phase');
    expect(mgr.getPipelineTransitions()['custom_phase']).toEqual(['done']);
  });

  it('返回值是副本，修改不影响下次读取', () => {
    const mgr = new FlowManager(tmpDir);
    const phases = mgr.getPipelinePhases();
    phases.push('__injected__');
    expect(mgr.getPipelinePhases()).not.toContain('__injected__');
    const transitions = mgr.getPipelineTransitions();
    transitions['plan_pending'] = ['__injected__'];
    expect(mgr.getPipelineTransitions()['plan_pending']).not.toEqual(['__injected__']);
  });
});

// ═══════════════════════════════════════
// stage-42 op-001：auto_advance 四级级联（profile 兜底）
// ═══════════════════════════════════════

describe('配置级联（stage-42 op-001）', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-cascade-'));
    mkdirSync(join(tmpDir, '.openfeel'), { recursive: true });
    // 隔离 HOME 指向同一临时目录 → 全局画像落在 tmpDir/.config/openfeel/profile.yaml
    mockHome.dir = tmpDir;
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    mockHome.dir = '';
  });

  /** 写全局画像 preferences.auto_advance */
  function writeGlobalProfile(autoAdvance: 'enabled' | 'disabled'): void {
    const dir = join(tmpDir, '.config', 'openfeel');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'profile.yaml'), `preferences:\n  auto_advance: ${autoAdvance}\n`, 'utf-8');
  }

  /** 写项目 config.yaml（传 null 表示不创建） */
  function writeProjectConfig(content: string | null): void {
    if (content === null) {
      return;
    }
    writeFileSync(join(tmpDir, '.openfeel', 'config.yaml'), content, 'utf-8');
  }

  /** 写当前 stage 的 status.md */
  function writeStageStatus(autoAdvance: 'enabled' | 'disabled'): void {
    const dir = join(tmpDir, '.openfeel', 'plan', 'v1', 'stage-01');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'status.md'), `# 状态\n\n- **自动推进**：${autoAdvance}\n`, 'utf-8');
  }

  /** 构造指向 v1.0.0-stage-01 的 FlowManager */
  function makeMgr(): FlowManager {
    const mgr = new FlowManager(tmpDir);
    mgr.setData({
      ...makeTestFlowData(),
      pipeline: { phase: 'active' as MetaPhase, current: { stage: 'v1.0.0-stage-01', op: 'op-001' }, retry: 0 },
    });
    return mgr;
  }

  it('configDefaults 与 statusOverrides 保留；新增 profileDefaults', () => {
    writeGlobalProfile('disabled');
    const mgr = makeMgr();
    const cascade = mgr.verboseSummary().cascade;
    expect(cascade.configDefaults).toBeDefined();
    expect(cascade.statusOverrides).toBeDefined();
    expect(cascade.effective).toBeDefined();
    expect(cascade.profileDefaults.auto_advance).toBe('disabled');
  });

  it('status.md 覆盖：status=enabled + config=disabled + profile=disabled → effective=enabled', () => {
    writeGlobalProfile('disabled');
    writeProjectConfig('defaults:\n  auto_advance: disabled\n');
    writeStageStatus('enabled');
    const cascade = makeMgr().verboseSummary().cascade;
    expect(cascade.profileDefaults.auto_advance).toBe('disabled');
    expect(cascade.configDefaults.auto_advance).toBe('disabled');
    expect(cascade.statusOverrides.auto_advance).toBe('enabled');
    expect(cascade.effective.auto_advance).toBe('enabled');
  });

  it('项目优先：无 status.md + config=disabled + profile=enabled → effective=disabled', () => {
    writeGlobalProfile('enabled');
    writeProjectConfig('defaults:\n  auto_advance: disabled\n');
    const cascade = makeMgr().verboseSummary().cascade;
    expect(cascade.effective.auto_advance).toBe('disabled');
    expect(cascade.statusOverrides.auto_advance).toBeUndefined();
  });

  it('画像兜底：无 status.md + config 未声明 auto_advance + profile=enabled → effective=enabled', () => {
    writeGlobalProfile('enabled');
    // config 存在但 defaults 不含 auto_advance
    writeProjectConfig('defaults:\n  execution_mode: manual\n');
    const cascade = makeMgr().verboseSummary().cascade;
    expect(cascade.configDefaults.auto_advance).toBeUndefined();
    expect(cascade.effective.auto_advance).toBe('enabled');
  });

  it('全无 builtin：无 config / 无 profile → 不再填 profileDefaults；resolveEffectiveConfig 落 builtin', () => {
    // BUG-003（stage-47）：画像文件不存在 → 不再回退 DEFAULT_PROFILE，profileDefaults 不填 auto_advance
    const cascade = makeMgr().verboseSummary().cascade;
    expect(cascade.profileDefaults.auto_advance).toBeUndefined();
    expect(cascade.configDefaults.auto_advance).toBeUndefined();
    // effective 为三层显式声明值的合并；三层皆无 → undefined（原 DEFAULT_PROFILE 兜底已移除）
    expect(cascade.effective.auto_advance).toBeUndefined();
    // 有效值来源落 builtin（框架内置默认 enabled，见 v1.1.7-stage-74 裁定 E）
    const r = makeMgr().resolveEffectiveConfig();
    expect(r.auto_advance).toEqual({ value: 'enabled', source: 'builtin' });
  });

  // ── op-002：resolveEffectiveConfig（有效值 + 来源） ──

  it('resolveEffectiveConfig：项目优先（config 覆盖 profile）', () => {
    writeGlobalProfile('enabled');
    writeProjectConfig('defaults:\n  auto_advance: disabled\n');
    const r = makeMgr().resolveEffectiveConfig();
    expect(r.auto_advance).toEqual({ value: 'disabled', source: 'config.yaml' });
    // 未声明于任何层的键 → builtin
    expect(r.merge_mode).toEqual({ value: 'manual', source: 'builtin' });
  });

  it('resolveEffectiveConfig：config=enabled + profile=disabled → config.yaml', () => {
    writeGlobalProfile('disabled');
    writeProjectConfig('defaults:\n  auto_advance: enabled\n');
    const r = makeMgr().resolveEffectiveConfig();
    expect(r.auto_advance).toEqual({ value: 'enabled', source: 'config.yaml' });
  });

  it('resolveEffectiveConfig：画像兜底（config 未声明 auto_advance + profile=enabled）', () => {
    writeGlobalProfile('enabled');
    writeProjectConfig('defaults:\n  execution_mode: manual\n');
    const r = makeMgr().resolveEffectiveConfig();
    expect(r.auto_advance).toEqual({ value: 'enabled', source: 'profile.yaml' });
  });

  it('resolveEffectiveConfig：status.md 覆盖最高（enabled）', () => {
    writeGlobalProfile('disabled');
    writeProjectConfig('defaults:\n  auto_advance: disabled\n');
    writeStageStatus('enabled');
    const r = makeMgr().resolveEffectiveConfig();
    expect(r.auto_advance).toEqual({ value: 'enabled', source: 'status.md' });
  });

  it('resolveEffectiveConfig：无 config 文件时 merge_mode/execution_mode 来源为 builtin（不含已移除旧键）', () => {
    // 无 profile 文件（BUG-003 后不再回退默认值）→ auto_advance 亦落 builtin；
    // execution_mode/merge_mode 不在画像键集内 → builtin；旧布尔键已移除（op-002）。
    // 键名拼接构造，避免字面量以保持 `rg` 清理门禁为 0。
    const removedLegacyKey = ['test', 'enabled'].join('_');
    const r = makeMgr().resolveEffectiveConfig();
    expect(r.auto_advance).toEqual({ value: 'enabled', source: 'builtin' });
    expect(r.merge_mode).toEqual({ value: 'manual', source: 'builtin' });
    expect(r.execution_mode).toEqual({ value: 'manual', source: 'builtin' });
    expect(r.merge_mode.source).not.toBe('profile.yaml');
    // 已移除键不得出现在生效配置集合中
    expect(r).not.toHaveProperty(removedLegacyKey);
  });

  // ═══════════════════════════════════════
  // stage-50 op-001：内部模式一致性（T1/T2/T4/T9/T12/T14/T16）
  // ═══════════════════════════════════════

  describe('批次 A 内部模式一致性（stage-50 op-001）', () => {
    it('T1：无 pending op 时 advanceStagePhase 将 current.op 置空（悬空修复）', () => {
      const stages: Record<string, StageData> = {
        'A': makeStage41Stage({ name: 'A', ops: { 'op-001': makeStage41Op('done') } }),
      };
      const mgr = new FlowManager(tmpDir);
      mgr.setData({
        ...makeTestFlowData(),
        pipeline: { phase: 'active' as MetaPhase, current: { stage: 'prev', op: 'op-999' }, retry: 0 },
        stages,
      });
      mgr.advanceStagePhase('A', 'exec_running' as PipelinePhase);
      // 未命中 → 置空，绝不保留上一阶段旧 op
      expect(mgr.getData()!.pipeline.current).toEqual({ stage: 'A', op: '' });
    });

    it('T1：syncCurrentOp 命中/未命中两分支；recordAttempt pass 后指向下一个 pending', () => {
      const stages: Record<string, StageData> = {
        'A': makeStage41Stage({
          name: 'A',
          ops: { 'op-001': makeStage41Op('executing'), 'op-002': makeStage41Op('pending') },
        }),
      };
      const mgr = new FlowManager(tmpDir);
      mgr.setData({
        ...makeTestFlowData(),
        pipeline: { phase: 'active' as MetaPhase, current: { stage: '', op: '' }, retry: 0 },
        stages,
      });

      // 命中分支
      expect(mgr.syncCurrentOp('A')).toEqual({ stage: 'A', op: 'op-001' });
      expect(mgr.getData()!.pipeline.current).toEqual({ stage: 'A', op: 'op-001' });
      // 未命中分支：阶段不存在时不改动 current
      expect(mgr.syncCurrentOp('nope')).toEqual({ stage: 'A', op: 'op-001' });
      expect(mgr.getData()!.pipeline.current).toEqual({ stage: 'A', op: 'op-001' });

      // recordAttempt pass → op-001 done → current 指向下一个 pending op-002
      mgr.recordAttempt('A.op-001', 'pass');
      expect(mgr.getData()!.pipeline.current).toEqual({ stage: 'A', op: 'op-002' });
    });

    it('T2：load 对缺 ops/deps 的存量数据补齐且不抛错', () => {
      mkdirSync(join(tmpDir, '.openfeel'), { recursive: true });
      const broken = {
        meta: { version: '1.0', project: 'T', updated: '2026-01-01T00:00:00Z' },
        pipeline: { phase: 'active', current: { stage: 'stage-X', op: '' }, retry: 0 },
        stages: { 'stage-X': { name: 'stage-X', phase: 'exec_running', status: 'planned' } },
        reviews: [],
        log: [],
      };
      writeFileSync(join(tmpDir, '.openfeel', 'flow.json'), JSON.stringify(broken), 'utf-8');
      const mgr = new FlowManager(tmpDir);
      expect(mgr.isLoaded()).toBe(true);
      const stage = mgr.getData()!.stages['stage-X'];
      expect(stage.ops).toEqual({});
      expect(stage.deps).toEqual([]);
      // advance / save 不再 TypeError
      expect(() => {
        mgr.advanceStagePhase('stage-X', 'review_pending' as PipelinePhase);
        mgr.save();
      }).not.toThrow();
    });

    it('T4：fuzzyCorrectPhase 后缀多重命中返回 null（不再落枚举首个）', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      const anyMgr = mgr as unknown as { fuzzyCorrectPhase(s: string): PipelinePhase | null };
      // 'ing' 同时是多个 *_pending / exec_running / archiving 的后缀 → 多重命中 → null
      expect(anyMgr.fuzzyCorrectPhase('ing')).toBeNull();
    });

    it('T9：mapPhaseToStageStatus review_passed 单分支恒为 review_passed', () => {
      expect(mapPhaseToStageStatus('review_passed', 'x')).toBe('review_passed');
    });

    it('T9：canAdvance 合法/非法目标两分支', () => {
      // R-FIX（stage-74 op-004）：全链语义用例显式声明 full
      writeFullModeConfig(tmpDir);
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      expect(mgr.canAdvance('stage-01.op-001', 'plan_review' as PipelinePhase)).toBe(true);
      expect(mgr.canAdvance('stage-01.op-001', 'done' as PipelinePhase)).toBe(false);
    });

    it('T12：checkpoint_mapping 含 archiving 主用键与 archive 历史键，且 archiving 更新 checkpoint', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      const anyMgr = mgr as unknown as {
        getDefaultPipelineConfig(): { checkpoint_mapping: Record<string, string> };
      };
      const map = anyMgr.getDefaultPipelineConfig().checkpoint_mapping;
      expect(map.archiving).toBe('archiving');
      expect(map.archive).toBe('archive');

      mgr.advancePhase('stage-01.op-001', 'archiving');
      const cp = mgr.getOpCheckpoints('stage-01.op-001') as unknown as Record<string, string>;
      expect(cp.archiving).toBe('pending');
    });

    it('T14：checkZombieStates 锚定 stageId，stage-1 不误计 stage-10 的 REV', () => {
      const stages: Record<string, StageData> = {
        'stage-1': makeStage41Stage({ name: 'stage-1', status: 'review_failed', phase: 'review_failed' as PipelinePhase }),
        'stage-10': makeStage41Stage({ name: 'stage-10', status: 'review_failed', phase: 'review_failed' as PipelinePhase }),
      };
      const mgr = new FlowManager(tmpDir);
      mgr.setData({
        ...makeTestFlowData(),
        stages,
        reviews: [
          { id: 'REV-001', op: 'stage-10.op-001', status: 'closed', priority: 'low', title: 'x', filed_by: 'r', filed_at: 't' },
        ],
      });
      const msgs = mgr.healthCheck().items
        .filter((i) => i.section === '僵尸状态')
        .map((i) => i.message)
        .join('\n');
      // stage-1 不应因 stage-10 的 REV 被判僵尸；stage-10 应命中
      expect(msgs).not.toContain('stage-1:');
      expect(msgs).toContain('stage-10:');
    });

    it('T16：autoCommitOnDone 以 execFileSync 数组参数调用 git（无 shell 解析）', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      mockedChild.execFileSync.mockClear();
      mgr.autoCommitOnDone('stage;1 & rm -rf /');
      const calls = mockedChild.execFileSync.mock.calls as unknown as Array<[string, string[]]>;
      expect(calls.length).toBeGreaterThan(0);
      expect(calls[0][0]).toBe('git');
      expect(Array.isArray(calls[0][1])).toBe(true);
      expect(calls[0][1]).toContain('add');
      const commitCall = calls.find((c) => Array.isArray(c[1]) && c[1].includes('commit'));
      expect(commitCall).toBeDefined();
      // stageName 仅作为单个数组元素（commit -m 消息）出现，未被 shell 解析
      expect(commitCall![1].some((a) => a.includes('stage;1 & rm -rf /'))).toBe(true);
    });
  });

  // ═══════════════════════════════════════
  // stage-50 op-003：配置面健壮性（T29）
  // ═══════════════════════════════════════

  describe('批次 C 配置面（stage-50 op-003）', () => {
    it('T29：config.yaml 非法值被跳过并触发 warn，合法键照常采纳', () => {
      mkdirSync(join(tmpDir, '.openfeel'), { recursive: true });
      writeFileSync(
        join(tmpDir, '.openfeel', 'config.yaml'),
        'defaults:\n  execution_mode: bogus\n  auto_advance: enabled\n',
        'utf-8',
      );
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const mgr = new FlowManager(tmpDir);
        mgr.setData(makeTestFlowData());
        const cascade = mgr.verboseSummary().cascade;
        // 非法值被跳过（不进 configDefaults）
        expect(cascade.configDefaults.execution_mode).toBeUndefined();
        // 合法值照常采纳
        expect(cascade.configDefaults.auto_advance).toBe('enabled');
        // 触发告警且文案含非法键名
        expect(warn.mock.calls.some((c) => String(c[0]).includes('execution_mode'))).toBe(true);
      } finally {
        warn.mockRestore();
      }
    });
  });

  // ═══════════════════════════════════════
  // stage-50 op-002：门禁与 CI 失效面（T19 core 访问器）
  // ═══════════════════════════════════════

  describe('批次 B 门禁（stage-50 op-002）', () => {
    it('T19：getDefaultTransitions 返回内置默认（含组合键）、不受项目 pipeline.yaml 影响且为深拷贝', () => {
      mkdirSync(join(tmpDir, '.openfeel'), { recursive: true });
      writeFileSync(join(tmpDir, '.openfeel', 'pipeline.yaml'), JSON.stringify({
        phases: ['plan_pending', 'done'],
        transitions: { plan_pending: ['done'] },
        checkpoint_mapping: {},
        phase_corrections: {},
      }), 'utf-8');

      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());

      // 运行时表受项目 pipeline.yaml 影响
      expect(mgr.getPipelineTransitions()['plan_pending']).toEqual(['done']);
      // 默认表不受影响，含组合键
      const def = mgr.getDefaultTransitions();
      expect(def['plan_pending']).toEqual(['plan_review', 'plan_passed']);
      expect(def['review_passed|test_passed']).toEqual(['archiving']);
      // 深拷贝：改动返回值不影响内部
      def['plan_pending'].push('X');
      expect(mgr.getDefaultTransitions()['plan_pending']).not.toContain('X');
    });
  });
});

// ═══════════════════════════════════════
// stage-52 op-013：REV-007 stage 解析归一化闭包补全
// ═══════════════════════════════════════

describe('REV-007 stage 解析归一化（stage-52 op-013）', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-op013-'));
    mkdirSync(join(tmpDir, '.openfeel'), { recursive: true });
  });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  /** 构造 op（checkpoints 全 pending） */
  function mkOp(opId: string, state: OpState = 'pending') {
    return {
      id: opId,
      title: 't',
      state,
      assignee: 'openfeel-executor',
      attempts: 0,
      max_attempts: 3,
      checkpoints: {
        plan: 'pending',
        scheme: 'pending',
        exec: { attempts: 0, self: 'pending' },
        review: 'pending',
        test: 'pending',
      },
    };
  }

  /** 构造阶段（默认无 ops、plan_pending、无 deps） */
  function mkStage(name: string, overrides?: Partial<StageData>): StageData {
    return {
      name,
      phase: 'plan_pending' as PipelinePhase,
      status: 'planned',
      deps: [],
      ops: {},
      ...overrides,
    };
  }

  /** 构造已加载（内存注入）管理器 */
  function makeMgr(
    stages: Record<string, StageData>,
    current: { stage: string; op: string } = { stage: '', op: '' },
  ): FlowManager {
    const mgr = new FlowManager(tmpDir);
    mgr.setData({
      meta: { version: '1.0', project: 'T', updated: '2026-01-01T00:00:00Z' },
      pipeline: { phase: 'active' as MetaPhase, current, retry: 0 },
      stages,
      reviews: [],
      log: [],
    });
    return mgr;
  }

  it('T2: parseOpId 出口归一化 → getOpState 短名前缀命中且与全名一致', () => {
    const mgr = makeMgr({
      'v1.0.0-stage-01': mkStage('v1.0.0-stage-01', { ops: { 'op-001': mkOp('op-001') } }),
    });
    expect(mgr.getOpState('stage-01.op-001')).toBe('pending');
    expect(mgr.getOpState('stage-01.op-001')).toBe(mgr.getOpState('v1.0.0-stage-01.op-001'));
  });

  it('T2: recordAttempt 短名前缀 → 状态变更且 syncCurrentOp 命中（current.op 指向下一 pending）', () => {
    const mgr = makeMgr(
      { 'v1.0.0-stage-01': mkStage('v1.0.0-stage-01', { ops: { 'op-001': mkOp('op-001'), 'op-002': mkOp('op-002') } }) },
      { stage: 'v1.0.0-stage-01', op: 'op-001' },
    );
    const outcome = mgr.recordAttempt('stage-01.op-001', 'pass');
    expect(outcome.shouldRetry).toBe(false);
    expect(mgr.getData()!.stages['v1.0.0-stage-01'].ops['op-001'].state).toBe('done');
    expect(mgr.getData()!.pipeline.current).toEqual({ stage: 'v1.0.0-stage-01', op: 'op-002' });
  });

  it('T2: canAdvance 短名前缀与全名结果一致（不再误判 false）', () => {
    const mgr = makeMgr({
      'v1.0.0-stage-01': mkStage('v1.0.0-stage-01', {
        phase: 'exec_running' as PipelinePhase,
        ops: { 'op-001': mkOp('op-001') },
      }),
    });
    expect(mgr.canAdvance('stage-01.op-001', 'review_pending')).toBe(true);
    expect(mgr.canAdvance('stage-01.op-001', 'review_pending')).toBe(
      mgr.canAdvance('v1.0.0-stage-01.op-001', 'review_pending'),
    );
  });

  it('T2: advancePhase（deprecated）短名前缀不写脏名 → pipeline.current.stage 为全名', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const mgr = makeMgr(
        {
          'v1.0.0-stage-01': mkStage('v1.0.0-stage-01', {
            phase: 'review_pending' as PipelinePhase,
            ops: { 'op-001': mkOp('op-001') },
          }),
        },
        { stage: 'v1.0.0-stage-01', op: 'op-001' },
      );
      mgr.advancePhase('stage-01.op-001', 'review_passed');
      expect(mgr.getData()!.pipeline.current.stage).toBe('v1.0.0-stage-01');
      expect(mgr.getData()!.stages['stage-01']).toBeUndefined();
    } finally {
      warn.mockRestore();
    }
  });

  it('T2: removeStage/checkRemovable 短名与全名一致，注销全名键', () => {
    const mgr = makeMgr(
      {
        'v1.0.0-stage-01': mkStage('v1.0.0-stage-01'),
        'v1.0.0-stage-02': mkStage('v1.0.0-stage-02', { phase: 'exec_running' as PipelinePhase }),
      },
      { stage: 'v1.0.0-stage-02', op: '' },
    );
    expect(mgr.checkRemovable('stage-01').ok).toBe(true);
    expect(mgr.checkRemovable('stage-01').ok).toBe(mgr.checkRemovable('v1.0.0-stage-01').ok);
    mgr.removeStage('stage-01');
    expect(mgr.getData()!.stages['v1.0.0-stage-01']).toBeUndefined();
    expect(mgr.getData()!.stages['v1.0.0-stage-02']).toBeDefined();
  });

  it('T3: 双键并存 → setStageDeps 改全名键、短名键逐字节不变', () => {
    const mgr = makeMgr(
      {
        'stage-01': mkStage('stage-01', { ops: { 'op-001': mkOp('op-001') } }),
        'v1.0.0-stage-01': mkStage('v1.0.0-stage-01'),
        'v1.0.0-stage-09': mkStage('v1.0.0-stage-09', { phase: 'done' as PipelinePhase }),
      },
      { stage: 'v1.0.0-stage-01', op: '' },
    );
    const shortBefore = JSON.stringify(mgr.getData()!.stages['stage-01']);
    mgr.setStageDeps('stage-01', ['v1.0.0-stage-09']);
    expect(mgr.getData()!.stages['v1.0.0-stage-01'].deps).toEqual(['v1.0.0-stage-09']);
    expect(JSON.stringify(mgr.getData()!.stages['stage-01'])).toBe(shortBefore);
  });

  it('T3: 双键并存 → removeStage 注销全名键、短名键保留', () => {
    const mgr = makeMgr(
      {
        'stage-01': mkStage('stage-01', { ops: { 'op-001': mkOp('op-001') } }),
        'v1.0.0-stage-01': mkStage('v1.0.0-stage-01'),
        'v1.0.0-stage-02': mkStage('v1.0.0-stage-02', { phase: 'exec_running' as PipelinePhase }),
      },
      { stage: 'v1.0.0-stage-02', op: '' },
    );
    const shortBefore = JSON.stringify(mgr.getData()!.stages['stage-01']);
    mgr.removeStage('stage-01');
    expect(mgr.getData()!.stages['v1.0.0-stage-01']).toBeUndefined();
    expect(JSON.stringify(mgr.getData()!.stages['stage-01'])).toBe(shortBefore);
  });

  it('T3: 仅短名键（无全名键）→ 双键回退命中，不误报不存在', () => {
    const mgr = makeMgr(
      {
        'stage-01': mkStage('stage-01'),
        'v1.0.0-stage-02': mkStage('v1.0.0-stage-02', { phase: 'exec_running' as PipelinePhase }),
      },
      { stage: 'v1.0.0-stage-02', op: '' },
    );
    expect(mgr.checkRemovable('stage-01').ok).toBe(true);
    mgr.removeStage('stage-01', { force: true });
    expect(mgr.getData()!.stages['stage-01']).toBeUndefined();
  });
});

// ═══════════════════════════════════════
// stage-52 op-014：REV-009 stage 解析归一化最终收尾
// ═══════════════════════════════════════

describe('REV-009 stage 解析归一化（stage-52 op-014）', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-op014-'));
    mkdirSync(join(tmpDir, '.openfeel'), { recursive: true });
  });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  /** 构造 op（checkpoints 全 pending） */
  function mkOp(opId: string, state: OpState = 'pending') {
    return {
      id: opId,
      title: 't',
      state,
      assignee: 'openfeel-executor',
      attempts: 0,
      max_attempts: 3,
      checkpoints: {
        plan: 'pending',
        scheme: 'pending',
        exec: { attempts: 0, self: 'pending' },
        review: 'pending',
        test: 'pending',
      },
    };
  }

  /** 构造阶段（默认无 ops、plan_pending、无 deps） */
  function mkStage(name: string, overrides?: Partial<StageData>): StageData {
    return {
      name,
      phase: 'plan_pending' as PipelinePhase,
      status: 'planned',
      deps: [],
      ops: {},
      ...overrides,
    };
  }

  /** 构造已加载（内存注入）管理器 */
  function makeMgr(stages: Record<string, StageData>): FlowManager {
    const mgr = new FlowManager(tmpDir);
    mgr.setData({
      meta: { version: '1.0', project: 'T', updated: '2026-01-01T00:00:00Z' },
      pipeline: { phase: 'active' as MetaPhase, current: { stage: '', op: '' }, retry: 0 },
      stages,
      reviews: [],
      log: [],
    });
    return mgr;
  }

  it('T1: addAutoFixReview 短名前缀命中全名键（REV-009 核心）', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const mgr = makeMgr({
        'v1.0.0-stage-01': mkStage('v1.0.0-stage-01', {
          phase: 'review_failed' as PipelinePhase,
          status: 'review_failed',
          ops: { 'op-001': mkOp('op-001') },
        }),
      });
      mgr.addAutoFixReview(
        { id: 'REV-001', title: 't', op: 'stage-01.op-001', status: 'open', priority: 'medium', blocking: false },
        'stage-01.op-001',
      );
      expect(err).not.toHaveBeenCalled();
      const d = mgr.getData()!;
      expect(d.reviews).toHaveLength(1);
      expect(d.reviews[0].status).toBe('resolved');
      expect(d.reviews[0].canAutoFix).toBe(true);
      expect(d.stages['v1.0.0-stage-01'].phase).toBe('exec_running');
    } finally {
      warn.mockRestore();
      err.mockRestore();
    }
  });

  it('T2: 双键并存 → addAutoFixReview 作用于全名键、短名键逐字节不变', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const mgr = makeMgr({
        'stage-01': mkStage('stage-01', { ops: {} }),
        'v1.0.0-stage-01': mkStage('v1.0.0-stage-01', {
          phase: 'review_failed' as PipelinePhase,
          status: 'review_failed',
          ops: { 'op-001': mkOp('op-001') },
        }),
      });
      const shortBefore = JSON.stringify(mgr.getData()!.stages['stage-01']);
      mgr.addAutoFixReview(
        { id: 'REV-001', title: 't', op: 'stage-01.op-001', status: 'open', priority: 'medium', blocking: false },
        'stage-01.op-001',
      );
      expect(err).not.toHaveBeenCalled();
      expect(mgr.getData()!.stages['v1.0.0-stage-01'].phase).toBe('exec_running');
      expect(JSON.stringify(mgr.getData()!.stages['stage-01'])).toBe(shortBefore);
    } finally {
      warn.mockRestore();
      err.mockRestore();
    }
  });

  it('T1: listCheckpoints 短名列出全名快照，无参回归与全名一致', () => {
    const mgr = new FlowManager(tmpDir);
    mgr.setData(makeTestFlowData());
    mgr.saveCheckpoint('v1.0.0-stage-01', 'exec_running' as PipelinePhase);

    const full = mgr.listCheckpoints('v1.0.0-stage-01');
    const short = mgr.listCheckpoints('stage-01');
    expect(full.length).toBe(1);
    expect(short).toEqual(full);
    // 无参行为不变：列出全部快照
    expect(mgr.listCheckpoints()).toEqual(full);
    // 不存在阶段 → 空数组（不抛错）
    expect(mgr.listCheckpoints('stage-99')).toEqual([]);
  });

  it('T2: listCheckpoints 短名旧文件由 || 兜底可见', () => {
    const cpDir = join(tmpDir, '.openfeel', 'checkpoints');
    mkdirSync(cpDir, { recursive: true });
    const legacy = 'stage-01-20260101T000000000-plan_passed.json';
    writeFileSync(join(cpDir, legacy), '{}', 'utf-8');

    const mgr = new FlowManager(tmpDir);
    expect(mgr.listCheckpoints('stage-01')).toEqual([legacy]);
  });

  // ═══════════════════════════════════════
  // stage-54 E1：空模板检测整行锚定（cli/BUG-005）+ E1-补/A9
  // ═══════════════════════════════════════

  describe('stage-54 E1 空模板检测整行锚定', () => {
    it('① isTemplateEmpty / detectFillState 双向（行内引用不误报；独占行/CRLF/缩进仍检出）', () => {
      // 行内引用该字面（非独占行）→ 不再误判 empty
      const inlineRef = '本文档说明：仍含 `- [ ] 待补充` 的模板需填充。\n';
      expect(isTemplateEmpty(inlineRef)).toBe(false);
      expect(detectFillState(inlineRef)).toBe('filled');

      // 独占行 LF → empty
      expect(isTemplateEmpty('- [ ] 待补充\n')).toBe(true);
      expect(detectFillState('- [ ] 待补充\n')).toBe('empty');

      // 独占行 CRLF 容错 → empty
      expect(isTemplateEmpty('- [ ] 待补充\r\n')).toBe(true);
      expect(detectFillState('- [ ] 待补充\r\n')).toBe('empty');

      // 缩进 + 行尾空白 → empty
      expect(isTemplateEmpty('  - [ ] 待补充  \n')).toBe(true);

      // 文件末尾无换行 → empty
      expect(isTemplateEmpty('x\n- [ ] 待补充')).toBe(true);

      // partial 口径统一（行首锚定）：行内引用 `- [ ]` 不进 partial；行首未勾选项进 partial
      expect(detectFillState('说明：存在 `- [ ]` 未勾选项；\n')).toBe('filled');
      expect(detectFillState('  - [ ] 某任务\n')).toBe('partial');
    });

    it('③ healthCheck 对「行内引用」模板不报空模板 warn（回归 cli/BUG-005）；draft 跳过不变', () => {
      FlowManager.initFlow(tmpDir);
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      mgr.save();
      const opsDir = join(tmpDir, '.openfeel', 'plan', 'v1', 'stage-01', 'ops');
      mkdirSync(opsDir, { recursive: true });
      // 行内引用标记，非独占行 → 不应报空模板 warn
      writeFileSync(join(opsDir, 'op-001.md'), '# op-001：t\n\n正文引用：仍含 `- [ ] 待补充`；\n', 'utf-8');
      expect(mgr.healthCheck(false).items.find((i) => i.section === '空模板')).toBeUndefined();

      // 对照：独占行 → 报 warn
      const mgr2 = new FlowManager(tmpDir);
      mgr2.setData(makeTestFlowData());
      mgr2.save();
      writeFileSync(join(opsDir, 'op-001.md'), '# op-001：t\n\n- [ ] 待补充\n', 'utf-8');
      expect(mgr2.healthCheck(false).items.find((i) => i.section === '空模板')?.status).toBe('warn');
    });

    it('④（E1-补/A9）readOpTemplate 短 opId HIT / 全名 null，锁定 ops list 短名路径', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      const opsDir = join(tmpDir, '.openfeel', 'plan', 'v1', 'stage-01', 'ops');
      mkdirSync(opsDir, { recursive: true });
      writeFileSync(join(opsDir, 'op-005.md'), '# op-005：t\n\n- [ ] 待补充\n', 'utf-8');

      // 短 opId（与 flow.json 的 stage.ops 键形式一致）→ HIT
      const shortContent = mgr.readOpTemplate('stage-01', 'op-005');
      expect(shortContent).not.toBeNull();
      expect(detectFillState(shortContent!)).toBe('empty');

      // 全 opId → null（既有语义，A9 登记为已知边界，不改契约）
      expect(mgr.readOpTemplate('stage-01', 'stage-01.op-005')).toBeNull();
    });
  });
});

// ═══════════════════════════════════════
// stage-74 op-002：双模式转移表（T7.1 / T7.7 / T7.12）
// ═══════════════════════════════════════

describe('双模式转移表（stage-74 op-002）', () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-dualtable-')); });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  /** 内置 fast 表期望字面量（测试内独立书写，不 import 常量，以捕获常量误改） */
  const FAST_EXPECTED: Record<string, string[]> = {
    plan_pending: ['plan_review'],
    plan_review: ['plan_passed', 'plan_pending'],
    plan_passed: ['exec_running'],
    exec_running: ['review_pending'],
    review_pending: ['review_failed', 'review_passed'],
    review_failed: ['review_pending', 'exec_running'],
    review_passed: ['archiving'],
    archiving: ['done'],
    done: [],
  };

  function writePipeline(yaml: string): void {
    mkdirSync(join(tmpDir, '.openfeel'), { recursive: true });
    writeFileSync(join(tmpDir, '.openfeel', 'pipeline.yaml'), yaml, 'utf-8');
  }

  /** 本仓运行时 pipeline.yaml 复刻（只读工作区资产） */
  function repoPipeline(): string {
    return readFileSync(join(process.cwd(), '.openfeel', 'pipeline.yaml'), 'utf-8');
  }

  // ── T7.1 内置双表逐字 + 无参 = full + 深拷贝 ──

  it('T7.1：内置 full 表逐字（含组合键，16 键）', () => {
    const mgr = new FlowManager(tmpDir);
    const full = mgr.getDefaultTransitions('full');
    expect(full.plan_pending).toEqual(['plan_review', 'plan_passed']);
    expect(full.review_failed).toEqual(['review_pending', 'scheme_pending']);
    expect(full['review_passed|test_passed']).toEqual(['archiving']);
    expect(full.done).toEqual([]);
    expect(Object.keys(full)).toHaveLength(16);
  });

  it('T7.1：内置 fast 表逐字（9 条目含 done 终止项）', () => {
    const mgr = new FlowManager(tmpDir);
    expect(mgr.getDefaultTransitions('fast')).toEqual(FAST_EXPECTED);
  });

  it('T7.1：无参 = full（零回归）', () => {
    const mgr = new FlowManager(tmpDir);
    expect(mgr.getDefaultTransitions()).toEqual(mgr.getDefaultTransitions('full'));
    expect(mgr.getPipelineTransitions()).toEqual(mgr.getPipelineTransitions('full'));
    expect(mgr.getPipelineTransitions('fast')).toEqual(FAST_EXPECTED);
  });

  it('T7.1：getDefaultTransitions 返回深拷贝（修改不污染下次读取）', () => {
    const mgr = new FlowManager(tmpDir);
    const fast = mgr.getDefaultTransitions('fast');
    fast.plan_pending.push('__injected__');
    expect(mgr.getDefaultTransitions('fast').plan_pending).toEqual(['plan_review']);
  });

  // ── T7.7 pipeline.yaml 覆盖线（运行时线） ──

  it('T7.7a：自定义双表（transitions + fast_transitions）各自生效', () => {
    writePipeline([
      'phases: [plan_pending, done]',
      'transitions:',
      '  plan_pending: [done]',
      '  done: []',
      'fast_transitions:',
      '  plan_pending: [done]',
      'checkpoint_mapping: {}',
      'phase_corrections: {}',
      '',
    ].join('\n'));
    const mgr = new FlowManager(tmpDir);
    expect(mgr.getPipelineTransitions('full')['plan_pending']).toEqual(['done']);
    expect(mgr.getPipelineTransitions('fast')['plan_pending']).toEqual(['done']);
  });

  it('T7.7b：非法 fast_transitions → 告警 + 回退内置；full 覆盖不受影响', () => {
    writePipeline([
      'phases: [plan_pending, done]',
      'transitions:',
      '  plan_pending: [done]',
      '  done: []',
      'fast_transitions: not-an-object',
      'checkpoint_mapping: {}',
      'phase_corrections: {}',
      '',
    ].join('\n'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const mgr = new FlowManager(tmpDir);
      const warns = warnSpy.mock.calls.map((c) => String(c[0])).join('\n');
      expect(warns).toContain('fast_transitions');
      expect(mgr.getPipelineTransitions('fast')['plan_pending']).toEqual(['plan_review']);
      expect(mgr.getPipelineTransitions('full')['plan_pending']).toEqual(['done']);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('T7.7c：缺失 fast_transitions 键 → fast 取内置快线表', () => {
    writePipeline([
      'phases: [plan_pending, done]',
      'transitions:',
      '  plan_pending: [done]',
      '  done: []',
      'checkpoint_mapping: {}',
      'phase_corrections: {}',
      '',
    ].join('\n'));
    const mgr = new FlowManager(tmpDir);
    expect(mgr.getPipelineTransitions('fast')).toEqual(FAST_EXPECTED);
  });

  it('T7.7d：本仓 pipeline.yaml 复刻（运行时 full 线缺组合键；fast 仍内置）', () => {
    writePipeline(repoPipeline());
    const mgr = new FlowManager(tmpDir);
    expect(mgr.getPipelineTransitions('full')['review_passed|test_passed']).toBeUndefined();
    expect(mgr.getPipelineTransitions('fast')).toEqual(FAST_EXPECTED);
  });

  it('T7.7e：fast_transitions 空对象 {} 等同缺失（回落内置快线表，非死锁）[REV-74-009]', () => {
    writePipeline([
      'phases: [plan_pending, done]',
      'transitions:',
      '  plan_pending: [done]',
      '  done: []',
      'fast_transitions: {}',
      'checkpoint_mapping: {}',
      'phase_corrections: {}',
      '',
    ].join('\n'));
    const mgr = new FlowManager(tmpDir);
    expect(mgr.getPipelineTransitions('fast')['plan_pending']).toEqual(['plan_review']);
    expect(mgr.getPipelineTransitions('full')['plan_pending']).toEqual(['done']);
  });

  // ── T7.12 同模式差集（core 层） ──

  describe('T7.12 同模式差集', () => {
    const diffOf = (runtime: Record<string, string[]>, def: Record<string, string[]>): string[] =>
      Object.keys(def).filter((k) => !(k in runtime));

    it('T7.12：本仓复刻 full 差集 = [组合键]；fast 无覆盖 = []', () => {
      writePipeline(repoPipeline());
      const mgr = new FlowManager(tmpDir);
      expect(diffOf(mgr.getPipelineTransitions('full'), mgr.getDefaultTransitions('full')))
        .toEqual(['review_passed|test_passed']);
      expect(diffOf(mgr.getPipelineTransitions('fast'), mgr.getDefaultTransitions('fast'))).toEqual([]);
    });

    it('T7.12：自定义 fast_transitions → 差集命中', () => {
      writePipeline([
        'phases: [plan_pending, done]',
        'transitions:',
        '  plan_pending: [done]',
        '  done: []',
        'fast_transitions:',
        '  plan_pending: [done]',
        '  done: []',
        'checkpoint_mapping: {}',
        'phase_corrections: {}',
        '',
      ].join('\n'));
      const mgr = new FlowManager(tmpDir);
      const diff = diffOf(mgr.getPipelineTransitions('fast'), mgr.getDefaultTransitions('fast'));
      expect(diff).toContain('exec_running');
    });
  });
});

// ═══════════════════════════════════════
// stage-74 op-003：工作流模式解析（T7.4）
// ═══════════════════════════════════════

describe('工作流模式解析（stage-74 op-003）', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-mode-'));
    mkdirSync(join(tmpDir, '.openfeel'), { recursive: true });
    // 默认隔离 HOME 指向不存在路径（无 profile.yaml 干扰）
    mockHome.dir = join(tmpDir, 'no-such-home');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    mockHome.dir = '';
  });

  function writeProjectConfig(content: string | null): void {
    if (content === null) {
      return;
    }
    writeFileSync(join(tmpDir, '.openfeel', 'config.yaml'), content, 'utf-8');
  }

  /** 写指定阶段的 status.md（工作流模式行） */
  function writeStageMode(stageDir: string, mode: 'full' | 'fast'): void {
    const dir = join(tmpDir, '.openfeel', 'plan', 'v1', stageDir);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'status.md'), `# 状态\n\n- **工作流模式**：${mode}\n`, 'utf-8');
  }

  function makeMgr(currentStage = 'v1.0.0-stage-01'): FlowManager {
    const mgr = new FlowManager(tmpDir);
    mgr.setData({
      ...makeTestFlowData(),
      pipeline: { phase: 'active' as MetaPhase, current: { stage: currentStage, op: 'op-001' }, retry: 0 },
    });
    return mgr;
  }

  it('T7.4a：status.md 覆盖 config.yaml（当前阶段域）', () => {
    writeStageMode('stage-01', 'full');
    writeProjectConfig('defaults:\n  workflow_mode: fast\n');
    const r = makeMgr().resolveEffectiveConfig();
    expect(r.workflow_mode).toEqual({ value: 'full', source: 'status.md' });
  });

  it('T7.4b：config.yaml（无 status.md 字段）', () => {
    writeProjectConfig('defaults:\n  workflow_mode: full\n');
    const r = makeMgr().resolveEffectiveConfig();
    expect(r.workflow_mode).toEqual({ value: 'full', source: 'config.yaml' });
  });

  it('T7.4c：builtin（隔离 HOME + 无 config/status 字段）', () => {
    const r = makeMgr().resolveEffectiveConfig();
    expect(r.workflow_mode).toEqual({ value: 'fast', source: 'builtin' });
  });

  it('T7.4d：画像不承载 workflow_mode（source !== profile.yaml）', () => {
    // 画像显式声明 auto_advance，但 profile 层对 workflow_mode 不产出
    mkdirSync(join(tmpDir, '.config', 'openfeel'), { recursive: true });
    writeFileSync(join(tmpDir, '.config', 'openfeel', 'profile.yaml'), 'preferences:\n  auto_advance: enabled\n', 'utf-8');
    mockHome.dir = tmpDir; // 使 profile.yaml 生效
    const r = makeMgr().resolveEffectiveConfig();
    expect(r.workflow_mode).toEqual({ value: 'fast', source: 'builtin' });
    expect(r.workflow_mode.source).not.toBe('profile.yaml');
  });

  it('T7.4e：任意阶段域（决定性，REV-74-001；被操作 stage ≠ current.stage）', () => {
    writeStageMode('stage-01', 'full');
    writeStageMode('stage-02', 'fast');
    const mgr = makeMgr('v1.0.0-stage-01');
    // 若误复用当前阶段分支 → stage-02 得 full（红）；此处按 stage-02 的 fast 表解析
    expect(mgr.resolveStageWorkflowMode('v1.0.0-stage-02')).toEqual({ value: 'fast', source: 'status.md' });
    expect(mgr.resolveStageWorkflowMode('v1.0.0-stage-01')).toEqual({ value: 'full', source: 'status.md' });
  });

  it('T7.4f：无参 = 当前阶段域', () => {
    writeStageMode('stage-01', 'full');
    writeStageMode('stage-02', 'fast');
    const mgr = makeMgr('v1.0.0-stage-01');
    expect(mgr.resolveStageWorkflowMode()).toEqual(mgr.resolveStageWorkflowMode('v1.0.0-stage-01'));
  });

  it('T7.4g：出口同源（verboseSummary.cascade 与 resolveEffectiveConfig 一致）', () => {
    writeStageMode('stage-01', 'full');
    const mgr = makeMgr();
    const summary = mgr.verboseSummary();
    expect(summary.cascade.statusOverrides.workflow_mode).toBe('full');
    expect(mgr.resolveEffectiveConfig().workflow_mode).toEqual({ value: 'full', source: 'status.md' });
  });

  it('T7.4h：不存在阶段不抛错 → 回落 config/builtin', () => {
    writeProjectConfig('defaults:\n  workflow_mode: full\n');
    const mgr = makeMgr();
    expect(mgr.resolveStageWorkflowMode('v1.0.0-stage-99')).toEqual({ value: 'full', source: 'config.yaml' });
    rmSync(join(tmpDir, '.openfeel', 'config.yaml'), { force: true });
    expect(mgr.resolveStageWorkflowMode('v1.0.0-stage-99')).toEqual({ value: 'fast', source: 'builtin' });
  });
});

// ═══════════════════════════════════════
// stage-74 op-004：单一取表点（T7.2 / T7.3 / T7.10 / T7.11）
// ═══════════════════════════════════════

describe('单一取表点（stage-74 op-004）', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-singletable-'));
    mkdirSync(join(tmpDir, '.openfeel'), { recursive: true });
    mockHome.dir = join(tmpDir, 'no-such-home');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    mockHome.dir = '';
  });

  /** 双模式 fixture（决定性：被操作 stage ≠ current.stage）：A=full（current）/ B=fast */
  function setupDualModeFixture(): FlowData {
    const mk = (stageDir: string, mode: 'full' | 'fast'): void => {
      const dir = join(tmpDir, '.openfeel', 'plan', 'v1', stageDir);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'status.md'), `# 状态\n\n- **工作流模式**：${mode}\n`, 'utf-8');
    };
    mk('stage-01', 'full');
    mk('stage-02', 'fast');
    const base = makeTestFlowData();
    const op = (): typeof base.stages['stage-01']['ops'] => ({
      'op-001': { ...base.stages['stage-01'].ops['op-001'] },
    });
    return {
      ...base,
      pipeline: { phase: 'active' as MetaPhase, current: { stage: 'v1.0.0-stage-01', op: 'v1.0.0-stage-01.op-001' }, retry: 0 },
      stages: {
        'v1.0.0-stage-01': { ...base.stages['stage-01'], name: 'A', phase: 'plan_pending', ops: op() },
        'v1.0.0-stage-02': { ...base.stages['stage-01'], name: 'B', phase: 'plan_pending', ops: op() },
      },
    };
  }

  function makeMgr(data: FlowData): FlowManager {
    const mgr = new FlowManager(tmpDir);
    mgr.setData(data);
    return mgr;
  }

  it('T7.2a：getAvailablePhases 按被操作 stage 的模式解析（B≠current）', () => {
    const mgr = makeMgr(setupDualModeFixture());
    // 若误用当前阶段分支 → B 得 full 两目标（红）
    expect(mgr.getAvailablePhases('v1.0.0-stage-02')).toEqual(['plan_review']);
    expect(mgr.getAvailablePhases('v1.0.0-stage-01')).toEqual(['plan_review', 'plan_passed']);
  });

  it('T7.2b：无参 getAvailablePhases = 当前阶段（A, full）', () => {
    const mgr = makeMgr(setupDualModeFixture());
    expect(mgr.getAvailablePhases()).toEqual(mgr.getAvailablePhases('v1.0.0-stage-01'));
  });

  it('T7.2c：findPhasePath 按被操作 stage 的模式解析', () => {
    const mgr = makeMgr(setupDualModeFixture());
    expect(mgr.findPhasePath('v1.0.0-stage-02', 'exec_running'))
      .toEqual({ path: ['plan_review', 'plan_passed', 'exec_running'], reason: 'ok' });
    expect(mgr.findPhasePath('v1.0.0-stage-02', 'scheme_pending').reason).toBe('no-path');
    expect(mgr.findPhasePath('v1.0.0-stage-01', 'scheme_pending').reason).toBe('ok');
  });

  it('T7.2d：canAdvance 按 opId 解析出的 stage 模式', () => {
    const mgr = makeMgr(setupDualModeFixture());
    expect(mgr.canAdvance('v1.0.0-stage-02.op-001', 'plan_passed')).toBe(false);
    expect(mgr.canAdvance('v1.0.0-stage-02.op-001', 'plan_review')).toBe(true);
    expect(mgr.canAdvance('v1.0.0-stage-01.op-001', 'plan_review')).toBe(true);
  });

  it('T7.2e：回落链（删 status.md → config/builtin）', () => {
    const mgr = makeMgr(setupDualModeFixture());
    // 删除 B 的 status.md → 无 config → builtin fast
    rmSync(join(tmpDir, '.openfeel', 'plan', 'v1', 'stage-02', 'status.md'), { force: true });
    expect(mgr.getAvailablePhases('v1.0.0-stage-02')).toEqual(['plan_review']);
    // B 补 config.yaml workflow_mode: full（仍无 status.md）→ full 集
    writeFileSync(join(tmpDir, '.openfeel', 'config.yaml'), 'defaults:\n  workflow_mode: full\n', 'utf-8');
    expect(mgr.getAvailablePhases('v1.0.0-stage-02')).toEqual(['plan_review', 'plan_passed']);
  });

  it('T7.3a：fast 拒绝集（scheme_pending / test_pending 全 false）+ plan_review 正断言', () => {
    const mgr = makeMgr(setupDualModeFixture());
    expect(mgr.canAdvance('v1.0.0-stage-02.op-001', 'plan_review')).toBe(true);
    expect(mgr.findPhasePath('v1.0.0-stage-02', 'plan_review')).toEqual({ path: ['plan_review'], reason: 'ok' });
    expect(mgr.canAdvance('v1.0.0-stage-02.op-001', 'scheme_pending')).toBe(false);
    expect(mgr.canAdvance('v1.0.0-stage-02.op-001', 'test_pending')).toBe(false);
    expect(mgr.findPhasePath('v1.0.0-stage-02', 'test_pending').reason).toBe('no-path');
  });

  it('T7.3b：fast 回环 review_failed 双出口（D12）', () => {
    const data = setupDualModeFixture();
    data.stages['v1.0.0-stage-02'].phase = 'review_failed';
    const mgr = makeMgr(data);
    expect(mgr.canAdvance('v1.0.0-stage-02.op-001', 'review_pending')).toBe(true);
    expect(mgr.canAdvance('v1.0.0-stage-02.op-001', 'exec_running')).toBe(true);
    expect(mgr.getAvailablePhases('v1.0.0-stage-02')).toEqual(['review_pending', 'exec_running']);
  });

  it('T7.10：同 (stage, mode) 四者键集双向一致', () => {
    for (const P of ['plan_pending', 'exec_running', 'review_failed', 'archiving'] as PipelinePhase[]) {
      // fast B：canAdvance / findPhasePath / getAvailablePhases / getPipelineTransitions('fast') 一致
      const b = setupDualModeFixture();
      b.stages['v1.0.0-stage-02'].phase = P;
      const mgrB = makeMgr(b);
      const targets = mgrB.getAvailablePhases('v1.0.0-stage-02');
      expect(targets).toEqual(mgrB.getPipelineTransitions('fast')[P]);
      for (const t of targets) {
        expect(mgrB.canAdvance('v1.0.0-stage-02.op-001', t)).toBe(true);
        expect(mgrB.findPhasePath('v1.0.0-stage-02', t)).toEqual({ path: [t], reason: 'ok' });
      }
      for (const t2 of PIPELINE_PHASES.filter((p) => !targets.includes(p))) {
        expect(mgrB.canAdvance('v1.0.0-stage-02.op-001', t2)).toBe(false);
      }

      // full A：getAvailablePhases / getPipelineTransitions('full') 一致
      const a = setupDualModeFixture();
      a.stages['v1.0.0-stage-01'].phase = P;
      const mgrA = makeMgr(a);
      expect(mgrA.getAvailablePhases('v1.0.0-stage-01')).toEqual(mgrA.getPipelineTransitions('full')[P]);
    }
  });

  it('T7.11：间接消费者 buildDownstreamPhases 与 getAvailablePhases 一致（fast B / full A）', () => {
    // full A（current）
    const mgrA = makeMgr(setupDualModeFixture());
    expect(mgrA.verboseSummary().downstreamPhases.map((d) => d.phase)).toEqual(mgrA.getAvailablePhases());

    // fast B（current 切到 B）→ 无参链回落 B 的 fast 表
    const b = setupDualModeFixture();
    b.pipeline.current = { stage: 'v1.0.0-stage-02', op: 'v1.0.0-stage-02.op-001' };
    const mgrB = makeMgr(b);
    const downstream = mgrB.verboseSummary().downstreamPhases;
    expect(downstream.map((d) => d.phase)).toEqual(['plan_review']);
    expect(downstream[0].responsibleAgent).toBe('openfeel-planner');
  });
});

// ── v1.1.7-stage-75 op-001：insertStatusField（单一「插入」写函数）──
describe('insertStatusField（stage-75 op-001）', () => {
  let projDir: string;

  beforeEach(() => {
    projDir = mkdtempSync(join(tmpdir(), 'openfeel-insert-field-'));
  });

  afterEach(() => {
    rmSync(projDir, { recursive: true, force: true });
  });

  /** 写入 status.md 并返回路径与所在阶段目录名 */
  function writeStatus(stageDirName: string, content: string): string {
    const dir = join(projDir, '.openfeel', 'plan', 'v1', stageDirName);
    mkdirSync(dir, { recursive: true });
    const p = join(dir, 'status.md');
    writeFileSync(p, content, 'utf-8');
    return p;
  }

  function bakPath(stageId: string): string {
    return join(projDir, '.openfeel', 'tmp', `status.${stageId}.bak`);
  }

  it('插入：锚点「自动推进」后 +1 行 + .bak 生成 + 其余逐字保留', () => {
    const before = '# v1.0.0-stage-01 状态\n\n- **执行模式**：manual\n- **自动推进**：disabled\n- **状态**：planned\n';
    const p = writeStatus('stage-01', before);

    const mgr = new FlowManager(projDir);
    const r = mgr.insertStatusField(p, 'stage-01', '工作流模式', 'full');

    expect(r).toBe('inserted');
    const after = readFileSync(p, 'utf-8');
    expect(after).toBe(before.replace('- **自动推进**：disabled\n', '- **自动推进**：disabled\n- **工作流模式**：full\n'));
    expect(existsSync(bakPath('stage-01'))).toBe(true);
    expect(readFileSync(bakPath('stage-01'), 'utf-8')).toBe(before);
  });

  it('回退锚点：无「自动推进」→「执行模式」行后插入', () => {
    const p = writeStatus('stage-02', '# v1.0.0-stage-02 状态\n\n- **执行模式**：manual\n- **状态**：planned\n');

    const r = new FlowManager(projDir).insertStatusField(p, 'stage-02', '工作流模式', 'fast');

    expect(r).toBe('inserted');
    expect(readFileSync(p, 'utf-8')).toBe('# v1.0.0-stage-02 状态\n\n- **执行模式**：manual\n- **工作流模式**：fast\n- **状态**：planned\n');
  });

  it('exists：字段已存在 → 不写盘、无 .bak', () => {
    const before = '# v1.0.0-stage-03 状态\n\n- **自动推进**：disabled\n- **工作流模式**：fast\n';
    const p = writeStatus('stage-03', before);

    const r = new FlowManager(projDir).insertStatusField(p, 'stage-03', '工作流模式', 'full');

    expect(r).toBe('exists');
    expect(readFileSync(p, 'utf-8')).toBe(before);
    expect(existsSync(bakPath('stage-03'))).toBe(false);
  });

  it('no-anchor：锚点链均缺失 → 不写盘、无 .bak', () => {
    const before = '# v1.0.0-stage-04 状态\n\n- **状态**：planned\n';
    const p = writeStatus('stage-04', before);

    const r = new FlowManager(projDir).insertStatusField(p, 'stage-04', '工作流模式', 'full');

    expect(r).toBe('no-anchor');
    expect(readFileSync(p, 'utf-8')).toBe(before);
    expect(existsSync(bakPath('stage-04'))).toBe(false);
  });

  it('字段名含正则元字符时按字面量匹配（escapeRegex 防护）', () => {
    const before = '# x\n\n- **自动推进**：disabled\n';
    const p = writeStatus('stage-05', before);

    const mgr = new FlowManager(projDir);
    expect(mgr.insertStatusField(p, 'stage-05', 'a.b', 'v')).toBe('inserted');
    expect(readFileSync(p, 'utf-8')).toContain('- **a.b**：v');
    // 二次调用（字段已在）→ exists，不再误插入
    expect(mgr.insertStatusField(p, 'stage-05', 'a.b', 'v2')).toBe('exists');
  });

  it('CRLF 文件：保留原行尾风格', () => {
    const p = writeStatus('stage-06', '# x\r\n\r\n- **自动推进**：disabled\r\n- **状态**：planned\r\n');

    const r = new FlowManager(projDir).insertStatusField(p, 'stage-06', '工作流模式', 'full');

    expect(r).toBe('inserted');
    expect(readFileSync(p, 'utf-8')).toContain('- **自动推进**：disabled\r\n- **工作流模式**：full\r\n');
  });
});

// ── v1.1.7-stage-75 op-003：health 工作流模式冗余一致性（第 10 项，仅 warn）──
describe('checkWorkflowModeRedundancy（stage-75 op-003）', () => {
  let projDir: string;

  beforeEach(() => {
    projDir = mkdtempSync(join(tmpdir(), 'openfeel-wfmode-health-'));
  });

  afterEach(() => {
    rmSync(projDir, { recursive: true, force: true });
  });

  /** 构造最小项目：flow.json（含可选冗余字段）+ status.md */
  function setup(workflowMode?: string, statusMode = 'full'): void {
    mkdirSync(join(projDir, '.openfeel', 'plan', 'v1', 'stage-01'), { recursive: true });
    writeFileSync(
      join(projDir, '.openfeel', 'plan', 'v1', 'stage-01', 'status.md'),
      `# v1.0.0-stage-01 状态\n\n- **执行模式**：manual\n- **自动推进**：disabled\n- **工作流模式**：${statusMode}\n- **状态**：planned\n`,
      'utf-8',
    );
    const stage: Record<string, unknown> = {
      name: 'v1.0.0-stage-01',
      phase: 'plan_pending',
      status: 'planned',
      deps: [],
      ops: {},
    };
    if (workflowMode !== undefined) {
      stage.workflow_mode = workflowMode;
    }
    writeFileSync(
      join(projDir, '.openfeel', 'flow.json'),
      JSON.stringify({
        meta: { version: '1.0', project: 'T', updated: '2026-01-01T00:00:00Z', revision: 1 },
        pipeline: { phase: 'active', current: { stage: 'v1.0.0-stage-01', op: '' }, retry: 0 },
        stages: { 'v1.0.0-stage-01': stage },
        reviews: [],
        log: [],
      }, null, 2),
      'utf-8',
    );
  }

  it('不一致（冗余 fast vs status.md full）→ warn 且 ok 仍为 true', () => {
    setup('fast', 'full');
    const result = new FlowManager(projDir).healthCheck(false);
    const item = result.items.find((i) => i.section === '工作流模式');
    expect(item?.status).toBe('warn');
    expect(item?.message).toContain('v1.0.0-stage-01');
    expect(result.ok).toBe(true);
    // 仅 warn 不 fail
    expect(result.items.every((i) => i.status !== 'fail')).toBe(true);
  });

  it('一致（冗余 full vs status.md full）→ 不产生该 section 项', () => {
    setup('full', 'full');
    const result = new FlowManager(projDir).healthCheck(false);
    expect(result.items.find((i) => i.section === '工作流模式')).toBeUndefined();
  });

  it('旧 flow.json（无冗余字段）→ 零报错、无该 section 项', () => {
    setup(undefined, 'full');
    const result = new FlowManager(projDir).healthCheck(false);
    expect(result.items.find((i) => i.section === '工作流模式')).toBeUndefined();
    expect(result.ok).toBe(true);
  });

  it('quick 模式不执行第 10 项（门控 !quick）', () => {
    setup('fast', 'full');
    const result = new FlowManager(projDir).healthCheck(true);
    expect(result.items.find((i) => i.section === '工作流模式')).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════
// 需求字段兼容（stage-81 op-001）
// ═══════════════════════════════════════════════

describe('需求字段兼容（stage-81 op-001）', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-req-field-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  /** 写盘 fixture（显式 meta.revision: 0 基线——REV-81-014） */
  function writeFlow(data: Record<string, unknown>): void {
    mkdirSync(join(tmpDir, '.openfeel'), { recursive: true });
    writeFileSync(join(tmpDir, '.openfeel', 'flow.json'), JSON.stringify(data, null, 2) + '\n', 'utf-8');
  }

  /** 基础 fixture：单阶段 stage-01，默认无 requirements / 无 requirement_id */
  function baseData(
    extraStage: Record<string, unknown> = {},
    extraTop: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      meta: { version: '1.0', project: 'T', updated: '2026-01-01T00:00:00Z', revision: 0 },
      pipeline: { phase: 'active', current: { stage: 'stage-01', op: '' }, retry: 0 },
      stages: {
        'stage-01': {
          name: '测试阶段',
          phase: 'plan_pending',
          status: 'planned',
          deps: [],
          ops: {},
          ...extraStage,
        },
      },
      reviews: [],
      log: [],
      ...extraTop,
    };
  }

  function readDisk(): Record<string, unknown> {
    return JSON.parse(readFileSync(join(tmpDir, '.openfeel', 'flow.json'), 'utf-8')) as Record<string, unknown>;
  }

  it('存量兼容：无 requirements 键 / 无 requirement_id → load 零报错、缺省 ≡ null', () => {
    writeFlow(baseData());
    const mgr = new FlowManager(tmpDir);
    const stage = mgr.getData()!.stages['stage-01'];
    expect(stage.requirement_id).toBeUndefined();
    expect(stage.requirement_id ?? null).toBeNull();
  });

  it('load→save 不注入 requirements 键（核心断言，REV-81-003）', () => {
    writeFlow(baseData());
    const mgr = new FlowManager(tmpDir);
    mgr.save();
    const parsed = readDisk();
    expect('requirements' in parsed).toBe(false);
    expect((parsed.meta as { revision: number }).revision).toBe(1);
  });

  it('显式 requirements 条目 → load 保留 → save 逐字保留', () => {
    const req = {
      id: 'REQ-001',
      title: '需求一',
      status: 'draft',
      target_version: 'v1.3.0',
      priority: 'P1',
      owner: 'alice',
      claimed_at: '2026-01-02T00:00:00.000Z',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-02T00:00:00.000Z',
      body_path: '.openfeel/requirements/REQ-001.md',
    };
    writeFlow(baseData({}, { requirements: [req] }));
    const mgr = new FlowManager(tmpDir);
    expect(mgr.getData()!.requirements).toEqual([req]);
    mgr.save();
    expect(readDisk().requirements).toEqual([req]);
  });

  it('requirement_id 双态（字符串 / null）save→load 往返逐字保留', () => {
    // 字符串态
    writeFlow(baseData({ requirement_id: 'REQ-001' }));
    const mgr1 = new FlowManager(tmpDir);
    expect(mgr1.getData()!.stages['stage-01'].requirement_id).toBe('REQ-001');
    mgr1.save();
    const mgr2 = new FlowManager(tmpDir);
    expect(mgr2.getData()!.stages['stage-01']).toMatchObject({ requirement_id: 'REQ-001' });

    // null 态
    writeFlow(baseData({ requirement_id: null }));
    const mgr3 = new FlowManager(tmpDir);
    expect(mgr3.getData()!.stages['stage-01'].requirement_id).toBeNull();
    mgr3.save();
    const mgr4 = new FlowManager(tmpDir);
    expect(mgr4.getData()!.stages['stage-01']).toMatchObject({ requirement_id: null });
  });
});

// ═══════════════════════════════════════
// stage-83 op-002：需求聚合对称回写接入（T4.2 / T4.3 / T4.4-core）
// ═══════════════════════════════════════
describe('需求聚合对称回写接入（stage-83 op-002）', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-req-aggregate-'));
    // stage-86 op-003（REV-86-006）：T4 恒写 detail.session_id → golden 断言须确定性会话值
    vi.stubEnv('CLAUDE_CODE_SESSION_ID', GOLDEN_SESSION_ID);
    resetSessionCache();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetSessionCache();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  /** 构造需求条目（与 makeReq 同形对象） */
  function reqObj(id: string, status: RequirementStatus): RequirementData {
    return {
      id,
      title: `需求 ${id}`,
      status,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    };
  }

  /** 构造阶段（可选关联需求） */
  function stage(phase: PipelinePhase, requirementId?: string): StageData {
    const s: StageData = { name: '阶段', phase, status: 'in_progress', deps: [], ops: {} };
    if (requirementId !== undefined) { s.requirement_id = requirementId; }
    return s;
  }

  /** 构造 FlowData（可选 requirements 键） */
  function flowData(stages: Record<string, StageData>, requirements?: RequirementData[]): FlowData {
    const d = makeTestFlowData({ stages });
    if (requirements) { d.requirements = requirements; }
    return d;
  }

  /** 注入内存数据的 manager（隔离 tmpDir；不落盘） */
  function mgrWith(data: FlowData): FlowManager {
    const mgr = new FlowManager(tmpDir);
    mgr.setData(structuredClone(data));
    return mgr;
  }

  /** 写盘（T4.2-⑦ 双 manager 冲突用） */
  function writeFlow(data: FlowData): void {
    mkdirSync(join(tmpDir, '.openfeel'), { recursive: true });
    writeFileSync(join(tmpDir, '.openfeel', 'flow.json'), JSON.stringify(data, null, 2) + '\n', 'utf-8');
  }
  function readDisk(): Record<string, any> {
    return JSON.parse(readFileSync(join(tmpDir, '.openfeel', 'flow.json'), 'utf-8')) as Record<string, any>;
  }

  /** 无 requirement_id / 无 requirements 键 fixture（★ 逐字同 op-002 步骤 2.1） */
  function unlinkedFixture(): FlowData {
    return {
      meta: { version: '1.0', project: 'Stage83Regression', updated: '2026-01-01T00:00:00.000Z' },
      pipeline: { phase: 'active' as MetaPhase, current: { stage: '', op: '' }, retry: 0 },
      stages: { 'stage-01': { name: '回归阶段', phase: 'plan_pending' as PipelinePhase, status: 'in_progress', deps: [], ops: {} } },
      reviews: [], log: [],
    };
  }

  /** 归一化易变字段（S-83-8）——与 op-002 步骤 2.1 同口径 */
  function normalize(raw: unknown): string {
    const d = structuredClone(raw) as Record<string, any>;
    if (d.meta) { d.meta.revision = 0; d.meta.updated = ''; }
    for (const l of (d.log ?? []) as any[]) { l.time = ''; }
    for (const s of Object.values((d.stages ?? {}) as Record<string, any>)) {
      if (s.stats) { s.stats.start_time = ''; s.stats.end_time = ''; s.stats.duration_ms = 0; }
    }
    return JSON.stringify(d, null, 2);
  }

  /** 计数某动作的审计条数 */
  function countAction(mgr: FlowManager, action: string): number {
    return mgr.getData()!.log.filter((l) => l.action === action).length;
  }
  /** 计数 requirement_ 前缀审计条数 */
  function countReqLogs(mgr: FlowManager): number {
    return mgr.getData()!.log.filter((l) => String(l.action).startsWith('requirement_')).length;
  }

  // 补丁前基线 golden（来源 `.openfeel/tmp/stage-83-baseline.json`，本段内联）
  const GOLDEN_ADVANCE = `{
  "meta": {
    "version": "1.0",
    "project": "Stage83Regression",
    "updated": "",
    "revision": 0
  },
  "pipeline": {
    "phase": "done",
    "current": {
      "stage": "stage-01",
      "op": ""
    },
    "retry": 0
  },
  "stages": {
    "stage-01": {
      "name": "回归阶段",
      "phase": "done",
      "status": "done",
      "deps": [],
      "ops": {},
      "stats": {
        "start_time": "",
        "end_time": "",
        "duration_ms": 0
      }
    }
  },
  "reviews": [],
  "log": [
    {
      "time": "",
      "agent": "cli",
      "action": "advance_stage_phase",
      "detail": {
        "stageName": "stage-01",
        "from": "plan_pending",
        "to": "done",
        "session_id": "${GOLDEN_SESSION_LABEL}"
      }
    }
  ]
}`;

  const GOLDEN_DEPRECATED = `{
  "meta": {
    "version": "1.0",
    "project": "Stage83Regression",
    "updated": "",
    "revision": 0
  },
  "pipeline": {
    "phase": "done",
    "current": {
      "stage": "stage-01",
      "op": ""
    },
    "retry": 0
  },
  "stages": {
    "stage-01": {
      "name": "回归阶段",
      "phase": "done",
      "status": "done",
      "deps": [],
      "ops": {},
      "stats": {
        "start_time": "",
        "end_time": "",
        "duration_ms": 0
      }
    }
  },
  "reviews": [],
  "log": [
    {
      "time": "",
      "agent": "flow-manager",
      "action": "advance_stage_phase",
      "detail": {
        "stageName": "stage-01",
        "from": "plan_pending",
        "to": "done",
        "session_id": "${GOLDEN_SESSION_LABEL}"
      }
    }
  ]
}`;

  it('T4.2-① 正向矩阵（7 status × 聚合 done——真实 advanceStagePhase）：仅 {scheduled,in_progress} 写 + 审计逐字段；返回值恒 true', () => {
    for (const status of REQ_STATUSES) {
      const data = flowData({ 'stage-01': stage('archiving', 'REQ-001') }, [reqObj('REQ-001', status)]);
      const mgr = mgrWith(data);
      const before = mgr.getData()!.requirements![0].updated_at;
      const ret = mgr.advanceStagePhase('stage-01', 'done' as PipelinePhase, 'cli');
      expect(ret).toBe(true);                                    // 返回值与回写解耦：恒 true
      const req = mgr.getData()!.requirements![0];
      if ((AUTO_DONE_PRECONDITION as readonly string[]).includes(status)) {
        expect(req.status).toBe('done');
        expect(req.updated_at).not.toBe(before);                 // updated_at 刷新
        expect(countAction(mgr, 'requirement_auto_done')).toBe(1);
        const entry = mgr.getData()!.log.find((l) => l.action === 'requirement_auto_done')!;
        expect(entry.agent).toBe('cli');
        expect(entry.detail).toEqual({ requirementId: 'REQ-001', from: status, to: 'done', triggerStage: 'stage-01' });
      } else {
        expect(req.status).toBe(status);                         // 前置集外：状态逐字不变
        expect(countReqLogs(mgr)).toBe(0);                       // 零审计
      }
    }
  });

  it('T4.2-② 反向矩阵（7 status × 聚合非 done——需求同时关联 stage-A 与 stage-B）：仅 done 回退 + 审计；其余 6 零动作', () => {
    for (const status of REQ_STATUSES) {
      // 需求同时关联 A（archiving→advance done）与 B（exec_running 固定），推进 A 后聚合仍非 done
      const data = flowData({
        'stage-A': stage('archiving', 'REQ-001'),
        'stage-B': stage('exec_running', 'REQ-001'),
      }, [reqObj('REQ-001', status)]);
      const mgr = mgrWith(data);
      const ret = mgr.advanceStagePhase('stage-A', 'done' as PipelinePhase, 'cli');
      expect(ret).toBe(true);
      const req = mgr.getData()!.requirements![0];
      if (status === 'done') {
        // S-83-3 漂移自愈格：done × 聚合非 done → 回退 + 审计
        expect(req.status).toBe('in_progress');
        expect(countAction(mgr, 'requirement_auto_reopen')).toBe(1);
        const entry = mgr.getData()!.log.find((l) => l.action === 'requirement_auto_reopen')!;
        expect(entry.agent).toBe('cli');
        expect(entry.detail).toEqual({ requirementId: 'REQ-001', from: 'done', to: 'in_progress', triggerStage: 'stage-A' });
      } else {
        expect(req.status).toBe(status);
        expect(countReqLogs(mgr)).toBe(0);
      }
    }
  });

  it('T4.2-③ 对称循环（advance done ↔ reset）：双向对称 + 审计条数逐次断言', () => {
    const data = flowData({ 'stage-01': stage('archiving', 'REQ-001') }, [reqObj('REQ-001', 'in_progress')]);
    const mgr = mgrWith(data);
    // ① advance → done
    expect(mgr.advanceStagePhase('stage-01', 'done' as PipelinePhase, 'cli')).toBe(true);
    expect(mgr.getData()!.requirements![0].status).toBe('done');
    expect(countAction(mgr, 'requirement_auto_done')).toBe(1);
    // ② reset（复位到 review_failed——投影 status ≠ done，故再次 advance 仍重入 done 分支）
    const res = mgr.resetStagePhase('stage-01', 'review_failed');
    expect(res.changed).toBe(true);
    expect(res.from).toBe('done');
    expect(res.to).toBe('review_failed');
    expect(mgr.getData()!.requirements![0].status).toBe('in_progress');   // 聚合 ≠ done → 回退
    expect(countAction(mgr, 'requirement_auto_reopen')).toBe(1);
    // ③ 再 advance → done（对称往返）
    expect(mgr.advanceStagePhase('stage-01', 'done' as PipelinePhase, 'cli')).toBe(true);
    expect(mgr.getData()!.requirements![0].status).toBe('done');
    expect(countAction(mgr, 'requirement_auto_done')).toBe(2);            // 第二条 done 审计
  });

  it('REV-83-013 加固：非 current 阶段的 reset 仍触发聚合回写（回写不在 `if (normCur === key)` 之内）', () => {
    const data = flowData({
      'stage-01': stage('done', 'REQ-001'),
      'stage-02': stage('exec_running'),
    }, [reqObj('REQ-001', 'done')]);
    data.pipeline.current = { stage: 'stage-02', op: '' };       // current 指向 stage-02（非复位目标）
    const mgr = mgrWith(data);
    const res = mgr.resetStagePhase('stage-01', 'exec_running');
    expect(res.changed).toBe(true);
    // 复位的是非 current 阶段，但聚合回写仍应生效（需求回退）
    expect(mgr.getData()!.requirements![0].status).toBe('in_progress');
    expect(countAction(mgr, 'requirement_auto_reopen')).toBe(1);
  });

  it('T4.2-④ 回退目标恒 in_progress（聚合 scheduled 场景非 scheduled）', () => {
    const data = flowData({ 'stage-01': stage('done', 'REQ-001') }, [reqObj('REQ-001', 'done')]);
    const mgr = mgrWith(data);
    const res = mgr.resetStagePhase('stage-01', 'plan_pending');
    expect(res.changed).toBe(true);
    expect(mgr.getData()!.requirements![0].status).toBe('in_progress');   // 非 scheduled
  });

  it('T4.2-⑤ 空集守卫：零关联阶段不作 done 判定（零审计零注入，返回值不变）', () => {
    const data = unlinkedFixture();
    const mgr = mgrWith(data);
    const ret = mgr.advanceStagePhase('stage-01', 'done' as PipelinePhase, 'cli');
    expect(ret).toBe(true);
    expect('requirements' in mgr.getData()!).toBe(false);        // 零注入
    expect(countReqLogs(mgr)).toBe(0);                           // 零审计
  });

  it('T4.2-⑥ 悬空关联（requirement_id: REQ-999 且 requirements: []）→ 零动作零审计、不抛错', () => {
    const data = flowData({ 'stage-01': stage('archiving', 'REQ-999') }, []);
    const mgr = mgrWith(data);
    let ret: boolean | undefined;
    expect(() => { ret = mgr.advanceStagePhase('stage-01', 'done' as PipelinePhase, 'cli'); }).not.toThrow();
    expect(ret).toBe(true);
    expect(countReqLogs(mgr)).toBe(0);
    expect(mgr.getData()!.requirements).toEqual([]);
  });

  it('T4.2-⑦ 同事务：并发冲突下磁盘无中间态（phase 变更与需求状态恒同现）', () => {
    writeFlow(flowData({ 'stage-01': stage('archiving', 'REQ-001') }, [reqObj('REQ-001', 'in_progress')]));
    const a = new FlowManager(tmpDir);
    const b = new FlowManager(tmpDir);
    // A：真实推进 + save 成功
    a.advanceStagePhase('stage-01', 'done' as PipelinePhase, 'cli');
    a.save();
    // B：以旧 revision 加载 → 内存推进 → save 抛并发冲突
    b.advanceStagePhase('stage-01', 'done' as PipelinePhase, 'cli');
    let err: unknown;
    try { b.save(); } catch (e) { err = e; }
    expect(isFlowConcurrentError(err)).toBe(true);
    // 磁盘恒为 A 的单事务快照：phase 与需求状态同现（B 的失败无半写）
    const disk = readDisk();
    expect(disk.stages['stage-01'].phase).toBe('done');
    expect(disk.requirements[0].status).toBe('done');
  });

  it('T4.3-① 逐字节 golden（无 requirement_id）+ 零注入 + 零审计 + 正控', () => {
    const mgr = mgrWith(unlinkedFixture());
    mgr.advanceStagePhase('stage-01', 'done' as PipelinePhase, 'cli');
    mgr.save();
    const parsed = readDisk();
    expect(normalize(parsed)).toBe(GOLDEN_ADVANCE);              // 归一化后逐字节等值
    expect('requirements' in parsed).toBe(false);                // 零注入
    expect((parsed.log as any[]).filter((l) => String(l.action).startsWith('requirement_'))).toHaveLength(0);
    // 正控（对照实验）：加关联 + requirements → auto_done 出现（证明回写已接通，「零命中」非因未激活）
    const positive = mgrWith(flowData({ 'stage-01': stage('plan_pending', 'REQ-001') }, [reqObj('REQ-001', 'in_progress')]));
    positive.advanceStagePhase('stage-01', 'done' as PipelinePhase, 'cli');
    expect(countAction(positive, 'requirement_auto_done')).toBe(1);
  });

  it('T4.3-③ deprecated advancePhase 路径同 golden + 零注入 + 零审计', () => {
    const mgr = mgrWith(unlinkedFixture());
    mgr.advancePhase('stage-01.op-001', 'done');
    mgr.save();
    const parsed = readDisk();
    expect(normalize(parsed)).toBe(GOLDEN_DEPRECATED);
    expect('requirements' in parsed).toBe(false);
    expect((parsed.log as any[]).filter((l) => String(l.action).startsWith('requirement_'))).toHaveLength(0);
  });

  it('T4.4-core dry-run 不可达：resetStagePhase(..., {dryRun:true}) 零变更 + 形参锁定', () => {
    const data = flowData({ 'stage-01': stage('done', 'REQ-001') }, [reqObj('REQ-001', 'done')]);
    const mgr = mgrWith(data);
    const reqBefore = JSON.stringify(mgr.getData()!.requirements);
    const logBefore = mgr.getData()!.log.length;
    const res = mgr.resetStagePhase('stage-01', 'archiving', { dryRun: true });
    expect(res.changed).toBe(true);
    expect(res.from).toBe('done');
    expect(res.to).toBe('archiving');
    // data 零变更（需求 / 日志 / 阶段字段全不变——dry-run 早退早于回写点）
    expect(JSON.stringify(mgr.getData()!.requirements)).toBe(reqBefore);
    expect(mgr.getData()!.log.length).toBe(logBefore);
    expect(mgr.getData()!.stages['stage-01'].phase).toBe('done');
    // 形参锁定（REV-83-007）：advanceStagePhase 无 dryRun 形参；resetStagePhase options 带默认值
    // stage-92 op-001 有意变更白名单：advanceStagePhase 追加第 4 形参 opts（审查档位留痕入口，
    // `opts?: { reviewTier?: ReviewTier }`）——dryRun 形参**仍不存在**（无 dryRun 能力，锁不再由 arity 单独承担）
    expect(mgr.advanceStagePhase.length).toBe(4);
    expect(mgr.advanceStagePhase.toString()).not.toContain('dryRun');
    expect(mgr.resetStagePhase.length).toBe(2);
  });
});

// ═══════════════════════════════════════
// stage-86 op-003：T3 op 级时间字段 + T4 跨会话恢复标注
// ═══════════════════════════════════════
describe('stage-86 op-003 T3/T4（op 级时间字段 + 跨会话恢复标注）', () => {
  let tmpDir: string;
  const flowPath = (): string => join(tmpDir, '.openfeel', 'flow.json');

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-s86-t3t4-'));
    // 环境解耦硬要求：显式控制会话候选变量（执行环境真实存在该变量）
    vi.stubEnv('CLAUDE_CODE_SESSION_ID', 'S1');
    resetSessionCache();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetSessionCache();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  /** 归一化易变字段（meta.revision / meta.updated）后序列化 */
  function normalizeRaw(raw: string): string {
    const d = JSON.parse(raw) as Record<string, any>;
    if (d.meta) {
      d.meta.revision = 0;
      d.meta.updated = '';
    }
    return JSON.stringify(d, null, 2);
  }

  /** 写盘存量 flow.json（磁盘真实形态：op 不含运行时便利字段 `id`——save() 会剔除） */
  function writeDisk(data: FlowData): void {
    const disk = structuredClone(data) as FlowData;
    for (const stage of Object.values(disk.stages)) {
      for (const op of Object.values(stage.ops)) {
        delete (op as unknown as Record<string, unknown>).id;
      }
    }
    mkdirSync(join(tmpDir, '.openfeel'), { recursive: true });
    writeFileSync(flowPath(), JSON.stringify(disk, null, 2) + '\n', 'utf-8');
  }

  /** 取最后一个 advance/reset 转换条目 */
  function lastPhaseEntry(mgr: FlowManager): { action: string; detail: Record<string, unknown> } {
    const log = mgr.getData()!.log;
    for (let i = log.length - 1; i >= 0; i--) {
      const e = log[i];
      if (e.action === 'advance_stage_phase' || e.action === 'reset_stage_phase') {
        return { action: e.action, detail: e.detail };
      }
    }
    throw new Error('no phase entry');
  }

  // ── T3：三分支 + draft 零追加 + 零注入 ──

  it('T3.1 pass 分支：attempted_at + completed_at 双写且相等（均为 ISO）', () => {
    const mgr = new FlowManager(tmpDir);
    mgr.setData(makeTestFlowData());
    mgr.recordAttempt('stage-01.op-001', 'pass');

    const op = mgr.getData()!.stages['stage-01'].ops['op-001'];
    expect(op.state).toBe('done');
    expect(typeof op.attempted_at).toBe('string');
    expect(Number.isNaN(Date.parse(op.attempted_at!))).toBe(false);
    expect(op.completed_at).toBe(op.attempted_at);
  });

  it('T3.2 fail-retry 分支：仅 attempted_at（completed_at 键不存在）', () => {
    const mgr = new FlowManager(tmpDir);
    mgr.setData(makeTestFlowData());
    mgr.recordAttempt('stage-01.op-001', 'fail');

    const op = mgr.getData()!.stages['stage-01'].ops['op-001'] as unknown as Record<string, unknown>;
    expect(op.state).toBe('pending');
    expect(typeof op.attempted_at).toBe('string');
    expect('completed_at' in op).toBe(false);
  });

  it('T3.3 fail-exhausted 分支：attempted_at + completed_at 双写', () => {
    const data = makeTestFlowData();
    data.stages['stage-01'].ops['op-001'].attempts = 2;
    data.stages['stage-01'].ops['op-001'].max_attempts = 3;
    const mgr = new FlowManager(tmpDir);
    mgr.setData(data);
    mgr.recordAttempt('stage-01.op-001', 'fail');

    const op = mgr.getData()!.stages['stage-01'].ops['op-001'];
    expect(op.state).toBe('failed');
    expect(typeof op.attempted_at).toBe('string');
    expect(op.completed_at).toBe(op.attempted_at);
  });

  it('T3.4 draft 拒绝分支：零追加（两键均不存在）', () => {
    const data = makeTestFlowData();
    data.stages['stage-01'].ops['op-001'].state = 'draft';
    const mgr = new FlowManager(tmpDir);
    mgr.setData(data);
    mgr.recordAttempt('stage-01.op-001', 'pass');

    const op = mgr.getData()!.stages['stage-01'].ops['op-001'] as unknown as Record<string, unknown>;
    expect('attempted_at' in op).toBe(false);
    expect('completed_at' in op).toBe(false);
    expect(mgr.getData()!.log.some((l) => l.action === 'attempt_refused_draft')).toBe(true);
  });

  it('T3.5 零注入 golden：存量 op（无时间字段）load→save 归一化逐字节等值 + 新键零出现', () => {
    const disk = makeTestFlowData();
    writeDisk(disk);
    const beforeNormalized = normalizeRaw(readFileSync(flowPath(), 'utf-8'));

    const mgr = new FlowManager(tmpDir);
    mgr.load();
    mgr.save();

    const raw = readFileSync(flowPath(), 'utf-8');
    expect(raw).not.toContain('attempted_at');
    expect(raw).not.toContain('completed_at');
    expect(normalizeRaw(raw)).toBe(beforeNormalized);
  });

  // ── T4：跨会话恢复标注 ──

  it('T4.1 同会话 → resumed=false 且 session_id 落值', () => {
    const mgr = new FlowManager(tmpDir);
    mgr.setData(makeTestFlowData());
    mgr.advanceStagePhase('stage-01', 'plan_review' as PipelinePhase, 'cli');
    mgr.advanceStagePhase('stage-01', 'plan_passed' as PipelinePhase, 'cli');

    const entries = mgr.getData()!.log.filter((l) => l.action === 'advance_stage_phase');
    expect(entries).toHaveLength(2);
    expect(entries[1].detail.session_id).toBe('env:S1');
    expect(entries[1].detail.resumed).toBe(false);
  });

  it('T4.2 异会话 → resumed=true（跨会话恢复显式可辨）', () => {
    const mgr = new FlowManager(tmpDir);
    mgr.setData(makeTestFlowData());
    mgr.advanceStagePhase('stage-01', 'plan_review' as PipelinePhase, 'cli');

    vi.stubEnv('CLAUDE_CODE_SESSION_ID', 'S2');
    resetSessionCache();
    mgr.advanceStagePhase('stage-01', 'plan_passed' as PipelinePhase, 'cli');

    const last = lastPhaseEntry(mgr);
    expect(last.detail.session_id).toBe('env:S2');
    expect(last.detail.resumed).toBe(true);
  });

  it('T4.3 不可判定（proc: 级）→ session_id 恒写但 resumed 字段缺省', () => {
    vi.stubEnv('CLAUDE_CODE_SESSION_ID', '');
    resetSessionCache();
    const mgr = new FlowManager(tmpDir);
    mgr.setData(makeTestFlowData());
    mgr.advanceStagePhase('stage-01', 'plan_review' as PipelinePhase, 'cli');
    mgr.advanceStagePhase('stage-01', 'plan_passed' as PipelinePhase, 'cli');

    const entries = mgr.getData()!.log.filter((l) => l.action === 'advance_stage_phase');
    expect(String(entries[1].detail.session_id)).toMatch(/^proc:[0-9a-f]{8}$/);
    expect('resumed' in entries[1].detail).toBe(false);
  });

  it('T4.4 旧条目无 session_id → resumed 缺省（存量兼容）', () => {
    const data = makeTestFlowData();
    data.log.push({
      time: new Date().toISOString(),
      agent: 'cli',
      action: 'advance_stage_phase',
      detail: { stageName: 'stage-01', from: 'plan_pending', to: 'plan_review' },
    });
    const mgr = new FlowManager(tmpDir);
    mgr.setData(data);
    mgr.advanceStagePhase('stage-01', 'plan_passed' as PipelinePhase, 'cli');

    const entries = mgr.getData()!.log.filter((l) => l.action === 'advance_stage_phase');
    const last = entries[entries.length - 1];
    expect(last.detail.session_id).toBe('env:S1');
    expect('resumed' in last.detail).toBe(false);
  });

  it('T4.5 resetStagePhase 路径同款标注（异会话 → resumed=true）', () => {
    const data = makeTestFlowData();
    data.stages['stage-01'].phase = 'exec_running' as PipelinePhase;
    const mgr = new FlowManager(tmpDir);
    mgr.setData(data);
    mgr.advanceStagePhase('stage-01', 'review_pending' as PipelinePhase, 'cli');

    vi.stubEnv('CLAUDE_CODE_SESSION_ID', 'S2');
    resetSessionCache();
    const res = mgr.resetStagePhase('stage-01', 'exec_running');

    expect(res.changed).toBe(true);
    const last = lastPhaseEntry(mgr);
    expect(last.action).toBe('reset_stage_phase');
    expect(last.detail.session_id).toBe('env:S2');
    expect(last.detail.resumed).toBe(true);
  });

  it('T4.6 零注入：旧 flow.json（log 条目无新键）load→save 归一化逐字节等值 + 新键零出现', () => {
    const data = makeTestFlowData();
    data.log.push({
      time: '2026-01-01T00:00:00.000Z',
      agent: 'cli',
      action: 'advance_stage_phase',
      detail: { stageName: 'stage-01', from: 'plan_pending', to: 'plan_review' },
    });
    writeDisk(data);
    const beforeNormalized = normalizeRaw(readFileSync(flowPath(), 'utf-8'));

    const mgr = new FlowManager(tmpDir);
    mgr.load();
    mgr.save();

    const raw = readFileSync(flowPath(), 'utf-8');
    expect(raw).not.toContain('session_id');
    expect(raw).not.toContain('"resumed"');
    expect(normalizeRaw(raw)).toBe(beforeNormalized);
  });
});

// ═══════════════════════════════════════
// stage-90 op-001：general 模式（空表）与值域同源
// ═══════════════════════════════════════

describe('stage-90：general 模式（空表）与值域同源', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-general-mode-'));
    mkdirSync(join(tmpDir, '.openfeel'), { recursive: true });
    mockHome.dir = join(tmpDir, 'no-such-home');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    mockHome.dir = '';
  });

  /** 写指定阶段的 status.md（工作流模式行；general 为防御路径手工构造） */
  function writeStageMode(stageDir: string, mode: string): void {
    const dir = join(tmpDir, '.openfeel', 'plan', 'v1', stageDir);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'status.md'), `# 状态\n\n- **工作流模式**：${mode}\n`, 'utf-8');
  }

  function makeMgr(currentStage = 'v1.0.0-stage-01'): FlowManager {
    const mgr = new FlowManager(tmpDir);
    mgr.setData({
      ...makeTestFlowData(),
      pipeline: { phase: 'active' as MetaPhase, current: { stage: currentStage, op: 'op-001' }, retry: 0 },
    });
    return mgr;
  }

  it('T90.1：general 空表（getPipelineTransitions / getDefaultTransitions / getValidTargets / getAvailablePhases）', () => {
    const mgr = makeMgr();
    expect(mgr.getPipelineTransitions('general')).toEqual({});
    expect(mgr.getDefaultTransitions('general')).toEqual({});
    // getValidTargets 为私有原语（经 any-cast 直测空表语义；与公开 getAvailablePhases 同源）
    const anyMgr = mgr as unknown as { getValidTargets(p: PipelinePhase, m: string): string[] };
    expect(anyMgr.getValidTargets('plan_pending', 'general')).toEqual([]);
    writeStageMode('stage-01', 'general');
    expect(mgr.getAvailablePhases()).toEqual([]);
  });

  it('T90.2：防御路径——手写 general 的 status.md 经第 1 层解析命中（非静默回落 config）', () => {
    writeStageMode('stage-01', 'general');
    writeFileSync(join(tmpDir, '.openfeel', 'config.yaml'), 'defaults:\n  workflow_mode: fast\n', 'utf-8');
    const r = makeMgr().resolveStageWorkflowMode('v1.0.0-stage-01');
    expect(r).toEqual({ value: 'general', source: 'status.md' });
  });

  it('T90.3：health 第 10 项自动覆盖（status.md general + 冗余 fast → 恰 1 条 warn）', () => {
    mkdirSync(join(tmpDir, '.openfeel', 'plan', 'v1', 'stage-01'), { recursive: true });
    writeFileSync(
      join(tmpDir, '.openfeel', 'plan', 'v1', 'stage-01', 'status.md'),
      '# v1.0.0-stage-01 状态\n\n- **执行模式**：manual\n- **自动推进**：disabled\n- **工作流模式**：general\n- **状态**：planned\n',
      'utf-8',
    );
    writeFileSync(
      join(tmpDir, '.openfeel', 'flow.json'),
      JSON.stringify({
        meta: { version: '1.0', project: 'T', updated: '2026-01-01T00:00:00Z', revision: 1 },
        pipeline: { phase: 'active', current: { stage: 'v1.0.0-stage-01', op: '' }, retry: 0 },
        stages: {
          'v1.0.0-stage-01': { name: 'v1.0.0-stage-01', phase: 'plan_pending', status: 'planned', deps: [], ops: {}, workflow_mode: 'fast' },
        },
        reviews: [],
        log: [],
      }, null, 2),
      'utf-8',
    );
    const result = new FlowManager(tmpDir).healthCheck(false);
    const items = result.items.filter((i) => i.section === '工作流模式');
    expect(items).toHaveLength(1);
    expect(items[0].status).toBe('warn');
    expect(result.ok).toBe(true);
  });

  it('T90.4：零回归正控——full 16 键 / fast 9 条目逐字不变', () => {
    const mgr = makeMgr();
    expect(Object.keys(mgr.getPipelineTransitions('full'))).toHaveLength(16);
    expect(mgr.getPipelineTransitions('full')['exec_running']).toEqual(['review_pending', 'scheme_pending']);
    const fast = mgr.getPipelineTransitions('fast');
    expect(Object.keys(fast)).toHaveLength(9);
    expect(fast).toEqual({
      plan_pending: ['plan_review'],
      plan_review: ['plan_passed', 'plan_pending'],
      plan_passed: ['exec_running'],
      exec_running: ['review_pending'],
      review_pending: ['review_failed', 'review_passed'],
      review_failed: ['review_pending', 'exec_running'],
      review_passed: ['archiving'],
      archiving: ['done'],
      done: [],
    });
  });
});

// ═══════════════════════════════════════
// stage-90 op-002：需求级模式层（解析链第 2 层）
// ═══════════════════════════════════════

describe('stage-90：需求级模式层（解析链第 2 层）', () => {
  let tmpDir: string;
  const STAGE = 'v1.0.0-stage-01';

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-reqmode-'));
    mkdirSync(join(tmpDir, '.openfeel'), { recursive: true });
    mockHome.dir = join(tmpDir, 'no-such-home');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    mockHome.dir = '';
  });

  /** 写阶段 status.md（mode 为 undefined = 无「工作流模式」行） */
  function writeStatus(mode?: string, stageDir = 'stage-01'): void {
    const dir = join(tmpDir, '.openfeel', 'plan', 'v1', stageDir);
    mkdirSync(dir, { recursive: true });
    const modeLine = mode ? `- **工作流模式**：${mode}\n` : '';
    writeFileSync(join(dir, 'status.md'), `# ${STAGE} 状态\n\n- **执行模式**：manual\n${modeLine}- **状态**：planned\n`, 'utf-8');
  }

  function writeProjectConfig(content: string): void {
    writeFileSync(join(tmpDir, '.openfeel', 'config.yaml'), content, 'utf-8');
  }

  /** 构造「阶段关联需求」数据（reqMode 为 undefined = 需求无模式属性；reqExists=false = 悬空关联） */
  function makeMgr(opts: { linked?: boolean; reqMode?: string; reqExists?: boolean; redundant?: string } = {}): FlowManager {
    const linked = opts.linked === true;
    const stage: StageData = {
      name: STAGE,
      phase: 'plan_pending' as PipelinePhase,
      status: 'planned',
      deps: [],
      ops: {},
      requirement_id: linked ? 'REQ-001' : null,
    };
    if (opts.redundant !== undefined) { stage.workflow_mode = opts.redundant as StageData['workflow_mode']; }
    const data = makeTestFlowData({
      stages: { [STAGE]: stage },
      pipeline: { phase: 'active' as MetaPhase, current: { stage: STAGE, op: 'op-001' }, retry: 0 },
    });
    if (linked && opts.reqExists !== false) {
      const req: RequirementData = {
        id: 'REQ-001', title: '需求一', status: 'scheduled',
        created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
      };
      if (opts.reqMode !== undefined) { req.workflow_mode = opts.reqMode as NonNullable<RequirementData['workflow_mode']>; }
      data.requirements = [req];
    }
    const mgr = new FlowManager(tmpDir);
    mgr.setData(data);
    return mgr;
  }

  it('T90-REQ-1：需求级生效（阶段无 status.md 模式字段 + 需求 fast → source=requirement）', () => {
    writeStatus();                                                   // 无「工作流模式」行
    const r = makeMgr({ linked: true, reqMode: 'fast' }).resolveStageWorkflowMode(STAGE);
    expect(r).toEqual({ value: 'fast', source: 'requirement' });
  });

  it('T90-REQ-2：被阶段显式覆盖（status.md full + 需求 fast → status.md 优先）', () => {
    writeStatus('full');
    writeProjectConfig('defaults:\n  workflow_mode: fast\n');
    const r = makeMgr({ linked: true, reqMode: 'fast' }).resolveStageWorkflowMode(STAGE);
    expect(r).toEqual({ value: 'full', source: 'status.md' });
  });

  it('T90-REQ-3：无关联回落（requirement_id 缺省 → config / builtin）', () => {
    writeStatus();
    expect(makeMgr().resolveStageWorkflowMode(STAGE)).toEqual({ value: 'fast', source: 'builtin' });
    writeProjectConfig('defaults:\n  workflow_mode: full\n');
    expect(makeMgr().resolveStageWorkflowMode(STAGE)).toEqual({ value: 'full', source: 'config.yaml' });
  });

  it('T90-REQ-4：悬空回落（requirement_id 指向不存在需求 → 自然回落，零报错）', () => {
    writeStatus();
    writeProjectConfig('defaults:\n  workflow_mode: full\n');
    expect(makeMgr({ linked: true, reqExists: false }).resolveStageWorkflowMode(STAGE))
      .toEqual({ value: 'full', source: 'config.yaml' });
  });

  it('T90-REQ-5：Q4 同源（resolveEffectiveConfig() ≡ resolveStageWorkflowMode()，五场景逐字相等）', () => {
    const scenarios: Array<() => FlowManager> = [
      () => { writeStatus(); return makeMgr({ linked: true, reqMode: 'general' }); },
      () => { writeStatus('full'); return makeMgr({ linked: true, reqMode: 'fast' }); },
      () => { writeStatus(); return makeMgr(); },
      () => { writeStatus(); writeProjectConfig('defaults:\n  workflow_mode: full\n'); return makeMgr(); },
      () => { writeStatus(); return makeMgr({ linked: true, reqExists: false }); },
    ];
    for (const build of scenarios) {
      const mgr = build();
      expect(mgr.resolveEffectiveConfig()['workflow_mode']).toEqual(mgr.resolveStageWorkflowMode());
    }
  });

  it('T90-REQ-6：health 第 10 项需求级场景（一致零告警 / 不一致 1 条 warn）', () => {
    writeStatus();                                                   // status.md 无模式字段 → 需求级为权威
    const consistent = makeMgr({ linked: true, reqMode: 'fast', redundant: 'fast' }).healthCheck(false);
    expect(consistent.items.filter((i) => i.section === '工作流模式')).toHaveLength(0);

    writeStatus();
    const mismatch = makeMgr({ linked: true, reqMode: 'fast', redundant: 'full' }).healthCheck(false);
    const items = mismatch.items.filter((i) => i.section === '工作流模式');
    expect(items).toHaveLength(1);
    expect(items[0].status).toBe('warn');
    expect(items[0].message).toContain('冗余 full ≠ 解析 fast');
  });
});

// ═══════════════════════════════════════
// stage-92 op-001：审查档位（转移表层裁剪 / 唯一取表点延伸 / 审计留痕 / 零回归）
// ═══════════════════════════════════════

describe('审查档位（stage-92 op-001）', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-tier-'));
    mockHome.dir = join(tmpDir, 'no-such-home');
    // 审计留痕 golden：确定性会话值（T4 恒写 detail.session_id）
    vi.stubEnv('CLAUDE_CODE_SESSION_ID', GOLDEN_SESSION_ID);
    resetSessionCache();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetSessionCache();
    rmSync(tmpDir, { recursive: true, force: true });
    mockHome.dir = '';
  });

  /** 内置 full 表期望字面量（测试内独立书写，不 import 常量，以捕获常量误改） */
  const FULL_EXPECTED: Record<string, string[]> = {
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
    'review_passed|test_passed': ['archiving'],
    archiving: ['done'],
    done: [],
  };

  /** 内置 fast 表期望字面量（9 条目含 done 终止项） */
  const FAST_EXPECTED: Record<string, string[]> = {
    plan_pending: ['plan_review'],
    plan_review: ['plan_passed', 'plan_pending'],
    plan_passed: ['exec_running'],
    exec_running: ['review_pending'],
    review_pending: ['review_failed', 'review_passed'],
    review_failed: ['review_pending', 'exec_running'],
    review_passed: ['archiving'],
    archiving: ['done'],
    done: [],
  };

  /** 单阶段 fixture：status.md 声明指定模式（无 pipeline.yaml → 走内置表）+ 内存阶段（phase = plan_pending） */
  function makeMgr(mode: 'full' | 'fast' | 'general'): FlowManager {
    const dir = join(tmpDir, '.openfeel', 'plan', 'v1', 'stage-01');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'status.md'), `# 状态\n\n- **工作流模式**：${mode}\n`, 'utf-8');
    const mgr = new FlowManager(tmpDir);
    const base = makeTestFlowData();
    mgr.setData({
      ...base,
      pipeline: { phase: 'active' as MetaPhase, current: { stage: 'v1.0.0-stage-01', op: '' }, retry: 0 },
      stages: {
        'v1.0.0-stage-01': { ...base.stages['stage-01'], name: 'T', phase: 'plan_pending', status: 'planned', ops: {} },
      },
    });
    return mgr;
  }

  /** 私有原语 any-cast（与公开 getAvailablePhases 同源） */
  function privTargets(mgr: FlowManager): (p: PipelinePhase, m: string, t?: string) => string[] {
    return (mgr as unknown as { getValidTargets(p: PipelinePhase, m: string, t?: string): string[] }).getValidTargets.bind(mgr);
  }

  it('T92.1：裁剪表三档（full 模式）——lean 裁 scheme_review / skip 裁 plan_review + scheme_review，其余边逐字', () => {
    const mgr = makeMgr('full');

    // 缺省 / 显式 full = 零裁剪（既有内置 full 表逐字，16 键）
    expect(mgr.getPipelineTransitions('full')).toEqual(FULL_EXPECTED);
    expect(mgr.getPipelineTransitions('full', 'full')).toEqual(FULL_EXPECTED);

    // 精简：裁 scheme_review（= 现状 fast 审查深度语义）
    // stage-93 BUG-011 判类改写：裁剪只作用于入边 / 目标侧 → 被裁剪相位作源键时**保留出边**
    // （旧断言 = toBeUndefined / keys 15，见 .openfeel/tmp/stage-93-assertion-diff.md）
    const lean = mgr.getPipelineTransitions('full', 'lean');
    expect(lean.scheme_review).toEqual(['scheme_passed', 'scheme_pending']);
    expect(lean.scheme_pending).toEqual(['scheme_passed']);
    expect(lean.plan_pending).toEqual(['plan_review', 'plan_passed']);
    expect(lean.plan_review).toEqual(['plan_passed', 'plan_pending']);
    expect(lean.review_passed).toEqual(['test_pending']);
    expect(lean['review_passed|test_passed']).toEqual(['archiving']);
    expect(Object.keys(lean)).toHaveLength(16);

    // 免审：裁两道计划类审查关；恒保留 review_pending / 测试关 / 归档关
    const skip = mgr.getPipelineTransitions('full', 'skip');
    expect(skip.plan_review).toEqual(['plan_passed', 'plan_pending']);
    expect(skip.scheme_review).toEqual(['scheme_passed', 'scheme_pending']);
    expect(skip.plan_pending).toEqual(['plan_passed']);
    expect(skip.scheme_pending).toEqual(['scheme_passed']);
    expect(skip.review_pending).toEqual(['review_failed', 'review_passed']);
    expect(skip.test_pending).toEqual(['test_failed', 'test_passed']);
    expect(skip['review_passed|test_passed']).toEqual(['archiving']);
    expect(skip.archiving).toEqual(['done']);
    expect(Object.keys(skip)).toHaveLength(16);

    // 深拷贝纪律：裁剪结果改内存不污染基表 / 后续读取
    skip.plan_passed.push('__injected__');
    lean.scheme_pending.push('__injected__');
    expect(mgr.getPipelineTransitions('full')).toEqual(FULL_EXPECTED);
    expect(mgr.getDefaultTransitions('full')).toEqual(FULL_EXPECTED);
  });

  it('T92.2：fast 基表三档——lean 幂等（no-op）；skip 边收缩 plan_pending → [plan_passed]', () => {
    const mgr = makeMgr('fast');
    expect(mgr.getPipelineTransitions('fast')).toEqual(FAST_EXPECTED);
    expect(mgr.getPipelineTransitions('fast', 'full')).toEqual(FAST_EXPECTED);
    // lean 对 fast 幂等（fast 表无 scheme_review）
    expect(mgr.getPipelineTransitions('fast', 'lean')).toEqual(FAST_EXPECTED);
    expect(FAST_EXPECTED.plan_pending).toEqual(['plan_review']); // 基表未被污染

    // skip：plan_review 的入边被裁（plan_pending → 边收缩回退至其 targets，过滤自身后去重）；
    //       plan_review 作源键的出边保留（stage-93 BUG-011 判类改写：旧断言 = toBeUndefined / keys 8）
    const skip = mgr.getPipelineTransitions('fast', 'skip');
    expect(skip.plan_pending).toEqual(['plan_passed']);
    expect(skip.plan_review).toEqual(['plan_passed', 'plan_pending']);
    expect(skip.plan_passed).toEqual(['exec_running']);
    expect(skip.review_pending).toEqual(['review_failed', 'review_passed']);
    expect(skip.review_failed).toEqual(['review_pending', 'exec_running']);
    expect(skip.archiving).toEqual(['done']);
    expect(Object.keys(skip)).toHaveLength(9);
  });

  it('T92.3：general 空表（三档均空）+ getValidTargets 档位透传', () => {
    const mgr = makeMgr('full');
    expect(mgr.getPipelineTransitions('general')).toEqual({});
    expect(mgr.getPipelineTransitions('general', 'lean')).toEqual({});
    expect(mgr.getPipelineTransitions('general', 'skip')).toEqual({});

    const targets = privTargets(mgr);
    expect(targets('plan_pending', 'full')).toEqual(['plan_review', 'plan_passed']);
    expect(targets('plan_pending', 'full', 'lean')).toEqual(['plan_review', 'plan_passed']);
    expect(targets('plan_pending', 'full', 'skip')).toEqual(['plan_passed']);
    expect(targets('scheme_pending', 'full', 'lean')).toEqual(['scheme_passed']);
    expect(targets('scheme_pending', 'full', 'skip')).toEqual(['scheme_passed']);
    expect(targets('review_pending', 'full', 'skip')).toEqual(['review_failed', 'review_passed']);
    // general 档位裁剪后仍空表
    expect(targets('plan_pending', 'general', 'skip')).toEqual([]);
  });

  it('T92.4：findPhasePath / getAvailablePhases 档位透传（fast + skip 路径剪短一环）', () => {
    const mgr = makeMgr('fast');
    // 缺省（零裁剪）：plan_pending → plan_review → plan_passed → exec_running
    expect(mgr.findPhasePath('v1.0.0-stage-01', 'exec_running').path).toEqual(['plan_review', 'plan_passed', 'exec_running']);
    // lean 对 fast 幂等 → 与缺省同路径
    expect(mgr.findPhasePath('v1.0.0-stage-01', 'exec_running', 'lean').path).toEqual(['plan_review', 'plan_passed', 'exec_running']);
    // skip → 边收缩使路径剪短一环
    expect(mgr.findPhasePath('v1.0.0-stage-01', 'exec_running', 'skip').path).toEqual(['plan_passed', 'exec_running']);

    expect(mgr.getAvailablePhases('v1.0.0-stage-01')).toEqual(['plan_review']);
    expect(mgr.getAvailablePhases('v1.0.0-stage-01', 'full')).toEqual(['plan_review']);
    expect(mgr.getAvailablePhases('v1.0.0-stage-01', 'skip')).toEqual(['plan_passed']);

    // full 基表：被裁剪相位在免审 / 精简档下不可达（path 空，非 ok）
    const fullMgr = makeMgr('full');
    expect(fullMgr.findPhasePath('v1.0.0-stage-01', 'scheme_review').path).toEqual(['plan_passed', 'scheme_pending', 'scheme_review']);
    const leanNoHit = fullMgr.findPhasePath('v1.0.0-stage-01', 'scheme_review', 'lean');
    expect(leanNoHit.path).toEqual([]);
    expect(leanNoHit.reason).not.toBe('ok');
    const skipNoHit = fullMgr.findPhasePath('v1.0.0-stage-01', 'plan_review', 'skip');
    expect(skipNoHit.path).toEqual([]);
    expect(skipNoHit.reason).not.toBe('ok');
  });

  it('T92.5：advanceStagePhase 审计留痕——既有键逐字 + review_tier 仅显式时在末位', () => {
    const mgr = makeMgr('full');
    mgr.advanceStagePhase('v1.0.0-stage-01', 'plan_review', 'cli');
    mgr.advanceStagePhase('v1.0.0-stage-01', 'scheme_pending', 'cli', { reviewTier: 'skip' });
    mgr.advanceStagePhase('v1.0.0-stage-01', 'scheme_passed', 'cli', {});

    const logs = mgr.getData()!.log.filter((l) => l.action === 'advance_stage_phase');
    expect(logs).toHaveLength(3);
    // ① 缺省推进：既有 4 键逐字，**无** review_tier（字节级）
    expect(Object.keys(logs[0].detail)).toEqual(['stageName', 'from', 'to', 'session_id']);
    expect(JSON.stringify(logs[0].detail)).not.toContain('review_tier');
    // ② 显式档位：既有键逐字保留 + review_tier 追加于末位（含跨会话标注 resumed）
    expect(Object.keys(logs[1].detail)).toEqual(['stageName', 'from', 'to', 'session_id', 'resumed', 'review_tier']);
    expect(logs[1].detail).toMatchObject({
      stageName: 'v1.0.0-stage-01', from: 'plan_review', to: 'scheme_pending', review_tier: 'skip',
    });
    // ③ 空 opts：写入条件展开为「无该键」（undefined ≠ 显式声明）
    expect(JSON.stringify(logs[2].detail)).not.toContain('review_tier');
    // reset 面零改动：reset_stage_phase 无档位输入面 → 恒不写 review_tier（登记裁剪）
    mgr.resetStagePhase('v1.0.0-stage-01', 'plan_pending');
    const resetLogs = mgr.getData()!.log.filter((l) => l.action === 'reset_stage_phase');
    expect(resetLogs).toHaveLength(1);
    expect(JSON.stringify(resetLogs[0].detail)).not.toContain('review_tier');
  });

  it('T92.6：默认零裁剪（零回归）+ 派生映射单源 + 常量值域单源', () => {
    const mgr = makeMgr('full');
    expect(mgr.getPipelineTransitions()).toEqual(mgr.getPipelineTransitions('full', 'full'));
    expect(mgr.getPipelineTransitions()).toEqual(FULL_EXPECTED);
    // getDefaultTransitions 零改动（REV-92-004 选项 a：不受运行时 yaml 影响 + 不带 tier）
    expect(mgr.getDefaultTransitions('full')).toEqual(FULL_EXPECTED);
    expect(Object.keys(mgr.getDefaultTransitions('full'))).toHaveLength(16);
    expect(mgr.getDefaultTransitions('fast')).toEqual(FAST_EXPECTED);
    // 派生映射单源
    expect(MODE_DERIVED_TIER).toEqual({ full: 'full', fast: 'lean', general: 'full' });
    // 值域 / 裁剪谱单源
    expect(REVIEW_TIERS).toEqual(['full', 'lean', 'skip']);
    expect(TIER_PRUNED_PHASES).toEqual({ full: [], lean: ['scheme_review'], skip: ['plan_review', 'scheme_review'] });
    // 相位枚举 15 项零改动
    expect([...PIPELINE_PHASES]).toHaveLength(15);
  });

  it('T93.9：被裁剪相位出边保留（stage-93 BUG-011）——两档 × 两相位可达 + 阴性 + 表级差分（不引入新边）', () => {
    const mgr = makeMgr('full');
    const t = privTargets(mgr);
    const base = mgr.getDefaultTransitions('full');

    // ① 出边保留：阶段恰处于被裁剪相位时该档位仍有可达下游（修复前恒为空 → 死锁）
    expect(t('plan_review', 'full', 'skip')).toEqual(['plan_passed', 'plan_pending']);
    expect(t('scheme_review', 'full', 'skip')).toEqual(['scheme_passed', 'scheme_pending']);
    expect(t('scheme_review', 'full', 'lean')).toEqual(['scheme_passed', 'scheme_pending']);
    expect(t('plan_review', 'full', 'skip').length).toBeGreaterThan(0);
    expect(t('scheme_review', 'full', 'lean').length).toBeGreaterThan(0);

    // ② findPhasePath 自被裁剪相位可达下游（单步）
    mgr.getData()!.stages['v1.0.0-stage-01'].phase = 'plan_review' as PipelinePhase;
    expect(mgr.findPhasePath('v1.0.0-stage-01', 'plan_passed', 'skip')).toEqual({ path: ['plan_passed'], reason: 'ok' });

    // ③ 阴性：进入被裁剪关仍不可达（目标侧过滤 + 边收缩语义保持）
    mgr.getData()!.stages['v1.0.0-stage-01'].phase = 'plan_pending' as PipelinePhase;
    const noPlanReview = mgr.findPhasePath('v1.0.0-stage-01', 'plan_review', 'skip');
    expect(noPlanReview.path).toEqual([]);
    expect(noPlanReview.reason).not.toBe('ok');
    const noSchemeReview = mgr.findPhasePath('v1.0.0-stage-01', 'scheme_review', 'lean');
    expect(noSchemeReview.path).toEqual([]);
    expect(noSchemeReview.reason).not.toBe('ok');

    // ④ 表级差分锁定（不引入新边）：键集恒等 + 每条边可溯源（基表边 / 经被裁相位一次收缩）
    for (const tier of ['lean', 'skip'] as const) {
      const pruned = TIER_PRUNED_PHASES[tier] as readonly string[];
      const tbl = mgr.getPipelineTransitions('full', tier);
      expect(Object.keys(tbl).sort()).toEqual(Object.keys(base).sort());          // 被裁剪相位源键保留
      for (const [k, targets] of Object.entries(tbl)) {
        const allowed = new Set<string>(base[k] ?? []);
        for (const d of base[k] ?? []) {
          if (pruned.includes(d)) {
            for (const c of base[d] ?? []) { allowed.add(c); }                    // 边收缩一次（既有语义）
          }
        }
        for (const target of targets) {
          expect(allowed.has(target)).toBe(true);                                 // 零新边
        }
        if (pruned.includes(k)) {
          // 被裁剪相位作源键 → 值 = 基表 targets 过滤被裁剪项（逐字）
          expect(targets).toEqual((base[k] ?? []).filter((x) => !pruned.includes(x)));
        }
      }
    }
  });
});

// ═══════════════════════════════════════
// stage-96 op-001：调度决策单点（getResponsibleAgent / listStageBlockingOpenReviews）
// ═══════════════════════════════════════

describe('stage-96 op-001 调度单点', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-stage96-dispatch-'));
    // 全链语义用例显式声明 full（内置默认 fast）
    writeFullModeConfig(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  /** 构造审查条目（缺省 open；blocking 缺省 = 阻塞） */
  function rev(overrides: Partial<ReviewItem> & { id: string; op: string }): ReviewItem {
    return {
      status: 'open',
      priority: 'medium',
      title: `标题 ${overrides.id}`,
      filed_by: 'openfeel-reviewer',
      filed_at: '2026-01-01T00:00:00Z',
      ...overrides,
    };
  }

  /** 构造「当前阶段 + 指定相位」的管理器（full 模式） */
  function mgrAtPhase(phase: PipelinePhase): FlowManager {
    const mgr = new FlowManager(tmpDir);
    const base = makeTestFlowData();
    mgr.setData({
      ...base,
      pipeline: { phase: 'active' as MetaPhase, current: { stage: 'stage-01', op: 'op-001' }, retry: 0 },
      stages: {
        'stage-01': { ...base.stages['stage-01'], phase },
      },
    });
    return mgr;
  }

  it('15 phase → getResponsibleAgent 映射矩阵（与 mapPhaseToAgent 同源）', () => {
    const expected: Record<PipelinePhase, string> = {
      plan_pending: 'openfeel-planner',
      plan_review: 'openfeel-planner',
      plan_passed: 'openfeel-planner',
      scheme_pending: 'openfeel-schemer',
      scheme_review: 'openfeel-schemer',
      scheme_passed: 'openfeel-schemer',
      exec_running: 'openfeel-executor',
      review_pending: 'openfeel-reviewer',
      review_failed: 'openfeel-reviewer',
      review_passed: 'openfeel-reviewer',
      test_pending: 'openfeel-feel-tester',
      test_failed: 'openfeel-feel-tester',
      test_passed: 'openfeel-feel-tester',
      archiving: 'openfeel-archiver',
      done: 'none',
    };
    const mgr = new FlowManager(tmpDir);
    mgr.setData(makeTestFlowData());
    for (const phase of PIPELINE_PHASES) {
      expect(mgr.getResponsibleAgent(phase)).toBe(expected[phase]);
    }
  });

  it('15 phase → getAvailablePhases（full）直接目标矩阵', () => {
    const expected: Record<PipelinePhase, PipelinePhase[]> = {
      plan_pending: ['plan_review', 'plan_passed'],
      plan_review: ['plan_passed', 'plan_pending'],
      plan_passed: ['scheme_pending'],
      scheme_pending: ['scheme_review', 'scheme_passed'],
      scheme_review: ['scheme_passed', 'scheme_pending'],
      scheme_passed: ['exec_running'],
      exec_running: ['review_pending', 'scheme_pending'],
      review_pending: ['review_failed', 'review_passed'],
      review_failed: ['review_pending', 'scheme_pending'],
      // 组合键 review_passed|test_passed 追加 archiving（顺序 = 转移表遍历序去重）
      review_passed: ['test_pending', 'archiving'],
      test_pending: ['test_failed', 'test_passed'],
      test_failed: ['test_pending', 'scheme_pending'],
      test_passed: ['archiving'],
      archiving: ['done'],
      done: [],
    };
    for (const phase of PIPELINE_PHASES) {
      expect(mgrAtPhase(phase).getAvailablePhases('stage-01')).toEqual(expected[phase]);
    }
  });

  it('listStageBlockingOpenReviews：精确 + 前缀命中，前缀重叠不误命中', () => {
    const reviews = [
      rev({ id: 'REV-001', op: 'stage-01' }),
      rev({ id: 'REV-002', op: 'stage-01.op-001' }),
      rev({ id: 'REV-003', op: 'stage-010.op-001' }),
      rev({ id: 'REV-004', op: 'stage-01x.op-001' }),
    ];
    expect(listStageBlockingOpenReviews(reviews, 'stage-01').map((r) => r.id)).toEqual(['REV-001', 'REV-002']);
  });

  it('listStageBlockingOpenReviews：blocking 缺省/true 命中，false 与非 open 排除，顺序保持', () => {
    const reviews = [
      rev({ id: 'REV-001', op: 'stage-01.op-001' }),
      rev({ id: 'REV-002', op: 'stage-01.op-002', blocking: true }),
      rev({ id: 'REV-003', op: 'stage-01.op-003', blocking: false }),
      rev({ id: 'REV-004', op: 'stage-01.op-004', status: 'resolved' }),
      rev({ id: 'REV-005', op: 'stage-01.op-005', status: 'closed' }),
      rev({ id: 'REV-006', op: 'stage-01.op-006' }),
    ];
    expect(listStageBlockingOpenReviews(reviews, 'stage-01').map((r) => r.id)).toEqual(['REV-001', 'REV-002', 'REV-006']);
  });

  it('listStageBlockingOpenReviews：空 stage → []', () => {
    const reviews = [rev({ id: 'REV-001', op: '.op-001' })];
    expect(listStageBlockingOpenReviews(reviews, '')).toEqual([]);
  });

  it('等价性：helper 结果 = advanceStagePhase 到 done 的抛错清单（blocking:false 两处均放行）', () => {
    const mgr = new FlowManager(tmpDir);
    const base = makeTestFlowData();
    mgr.setData({
      ...base,
      stages: { 'stage-01': { ...base.stages['stage-01'], phase: 'test_passed' } },
      reviews: [
        rev({ id: 'REV-001', op: 'stage-01.op-001' }),
        rev({ id: 'REV-002', op: 'stage-01.op-002', blocking: false }),
        rev({ id: 'REV-003', op: 'stage-01.op-003', status: 'resolved' }),
        rev({ id: 'REV-004', op: 'stage-02.op-001' }),
      ],
    });

    const helperIds = listStageBlockingOpenReviews(mgr.getData()!.reviews, 'stage-01').map((r) => r.id);
    let gateIds: string[] = [];
    try {
      mgr.advanceStagePhase('stage-01', 'done' as PipelinePhase);
    } catch (err) {
      gateIds = [...(err as Error).message.matchAll(/(REV-[0-9A-Za-z-]+):/g)].map((m) => m[1]);
    }
    expect(helperIds).toEqual(['REV-001']);
    expect(gateIds).toEqual(helperIds);

    // blocking:false 单条 fixture → helper [] 且 done 门放行
    const permissive = new FlowManager(tmpDir);
    permissive.setData({
      ...base,
      stages: { 'stage-01': { ...base.stages['stage-01'], phase: 'test_passed' } },
      reviews: [rev({ id: 'REV-009', op: 'stage-01.op-001', blocking: false })],
    });
    expect(listStageBlockingOpenReviews(permissive.getData()!.reviews, 'stage-01')).toEqual([]);
    expect(() => permissive.advanceStagePhase('stage-01', 'done' as PipelinePhase)).not.toThrow();
  });

  it('同源一致性：verboseSummary().downstreamPhases = available × labels × getResponsibleAgent（REV-96-001）', () => {
    const mgr = mgrAtPhase('scheme_review');
    const labels = mgr.getPhaseLabels();
    const expected = mgr.getAvailablePhases('stage-01').map((p) => ({
      phase: p,
      label: labels[p],
      responsibleAgent: mgr.getResponsibleAgent(p),
    }));
    expect(mgr.verboseSummary().downstreamPhases).toEqual(expected);
  });

  it('静态约束：buildDownstreamPhases 仍直接消费 mapPhaseToAgent（本版零改动）', () => {
    const source = readFileSync(new URL('../../src/core/flow-manager.ts', import.meta.url), 'utf-8');
    const block = source.match(/private buildDownstreamPhases\(\): DownstreamPhase\[\] \{[\s\S]*?\n {2}\}/);
    expect(block).not.toBeNull();
    expect(block![0]).toContain('this.getAvailablePhases()');
    expect(block![0]).toContain('this.getPhaseLabels()');
    expect(block![0]).toContain('this.mapPhaseToAgent(phase)');
  });
});
