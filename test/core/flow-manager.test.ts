/**
 * FlowManager 单元测试
 * 测试流水线状态管理的所有核心功能：读写、查询、推进、重试、审查、日志、校验
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FlowManager, type FlowData, type OpState, type PipelinePhase, type MetaPhase } from '../../src/core/flow-manager.js';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

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
            assignee: 'executor',
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
                assignee: 'executor',
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
                assignee: 'executor',
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
                assignee: 'executor',
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
          { id: 'REV-001', op: 'stage-01.op-001', status: 'open', priority: 'high', title: '问题1', filed_by: 'reviewer', filed_at: '2026-01-01T00:00:00Z' },
          { id: 'REV-002', op: 'stage-01.op-001', status: 'resolved', priority: 'medium', title: '问题2', filed_by: 'reviewer', filed_at: '2026-01-01T00:00:00Z' },
        ],
      }));
      expect(mgr.getReviewItems().length).toBe(2);
    });

    it('按 opId 过滤应只返回对应条目', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData({
        reviews: [
          { id: 'REV-001', op: 'stage-01.op-001', status: 'open', priority: 'high', title: '问题1', filed_by: 'reviewer', filed_at: '2026-01-01T00:00:00Z' },
          { id: 'REV-002', op: 'stage-02.op-001', status: 'open', priority: 'low', title: '问题2', filed_by: 'reviewer', filed_at: '2026-01-01T00:00:00Z' },
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
        filed_by: 'reviewer',
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
        filed_by: 'reviewer',
        filed_at: new Date().toISOString(),
      });
      mgr.addReview({
        id: 'REV-001',
        op: 'stage-01.op-001',
        status: 'resolved',
        priority: 'high',
        title: '已修复问题',
        filed_by: 'reviewer',
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
                id: 'op-001', title: '待计划', state: 'pending', assignee: 'planner',
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
});
