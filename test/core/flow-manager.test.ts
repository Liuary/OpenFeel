/**
 * FlowManager 单元测试
 * 测试流水线状态管理的所有核心功能：读写、查询、推进、重试、审查、日志、校验
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FlowManager, type FlowData, type OpState, type PipelinePhase } from '../../src/core/flow-manager.js';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/** 创建测试用 FlowData（带一个阶段和一个 op） */
function makeTestFlowData(overrides?: Partial<FlowData>): FlowData {
  return {
    meta: { version: '1.0', project: 'TestProject', updated: '2026-01-01T00:00:00Z' },
    pipeline: {
      phase: 'plan_pending' as PipelinePhase,
      current: { stage: '', op: '' },
      retry: 0,
    },
    stages: {
      'stage-01': {
        name: '测试阶段',
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
      expect(mgr.getPhase()).toBe('plan_pending');
    });

    it('load 应能加载已保存的数据', () => {
      FlowManager.initFlow(tmpDir);
      const mgr = new FlowManager(tmpDir);
      const testData = makeTestFlowData();
      mgr.setData(testData);
      mgr.save();

      // 新建实例验证
      const mgr2 = new FlowManager(tmpDir);
      expect(mgr2.getPhase()).toBe('plan_pending');
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
      expect(mgr.getPhase()).toBe('plan_pending');
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
          phase: 'scheme_pending' as PipelinePhase,
          current: { stage: '', op: '' },
          retry: 0,
        },
      }));
      mgr.save();

      // 再次调用 initFlow 不应覆盖
      FlowManager.initFlow(tmpDir);
      const mgr2 = new FlowManager(tmpDir);
      expect(mgr2.getPhase()).toBe('scheme_pending');
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

    it('应返回正确的当前阶段', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      expect(mgr.getPhase()).toBe('plan_pending');
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
          phase: 'exec_running' as PipelinePhase,
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

    it('应返回中文摘要文本', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData({
        reviews: [
          { id: 'REV-001', op: 'stage-01.op-001', status: 'open', priority: 'high', title: '问题', filed_by: 'r', filed_at: '2026-01-01T00:00:00Z' },
        ],
      }));
      const text = mgr.summary();
      expect(text).toContain('OpenFeel 流水线状态');
      expect(text).toContain('plan_pending');
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

    it('应返回正确的结构化摘要', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData({
        pipeline: {
          phase: 'exec_running' as PipelinePhase,
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
      expect(s.phase).toBe('exec_running');
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
          phase: 'plan_pending' as PipelinePhase,
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

  describe('advancePhase', () => {
    it('应更新 pipeline.phase 和 current', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      mgr.advancePhase('stage-01.op-001', 'plan_passed');
      expect(mgr.getPhase()).toBe('plan_passed');
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

    it('应追加一条日志', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      const data = mgr.getData()!;
      const before = data.log.length;
      mgr.advancePhase('stage-01.op-001', 'plan_passed');
      expect(data.log.length).toBe(before + 1);
    });

    it('日志的 from 字段应为推进前的阶段值（REV-001）', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData({
        pipeline: {
          phase: 'plan_pending' as PipelinePhase,
          current: { stage: '', op: '' },
          retry: 0,
        },
      }));
      mgr.advancePhase('stage-01.op-001', 'plan_review');
      const data = mgr.getData()!;
      const lastLog = data.log[data.log.length - 1];
      expect(lastLog.detail.from).toBe('plan_pending');
      expect(lastLog.detail.to).toBe('plan_review');
    });

    it('切换到新操作时应重置 pipeline.retry 为 0（REV-002）', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData({
        pipeline: {
          phase: 'plan_pending' as PipelinePhase,
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
          phase: 'plan_pending' as PipelinePhase,
          current: { stage: 'stage-01', op: 'op-001' }, // 相同 op
          retry: 3,
        },
      }));
      mgr.advancePhase('stage-01.op-001', 'plan_review');
      // 相同 op 时不应重置 retry
      expect(mgr.getData()!.pipeline.retry).toBe(3);
    });

    it('不存在的 opId 不应修改数据', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      mgr.advancePhase('stage-99.op-999', 'plan_passed');
      expect(mgr.getPhase()).toBe('plan_pending');
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
          phase: 'exec_running' as PipelinePhase,
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
    it('合法流转应返回 true', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      expect(mgr.canAdvance('stage-01.op-001', 'plan_review')).toBe(true);
      expect(mgr.canAdvance('stage-01.op-001', 'plan_passed')).toBe(true);
    });

    it('非法流转应返回 false', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData());
      // 从 plan_pending 不能直接跳到 exec_running
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
          phase: 'done' as PipelinePhase,
          current: { stage: 'stage-01', op: 'op-001' },
          retry: 0,
        },
      }));
      expect(mgr.canAdvance('stage-01.op-001', 'plan_passed')).toBe(false);
    });

    // BUG-01/02 修复验证：失败态应能回退到 scheme_pending
    it('review_failed → scheme_pending 应返回 true（BUG-01 修复）', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData({
        pipeline: {
          phase: 'review_failed' as PipelinePhase,
          current: { stage: 'stage-01', op: 'op-001' },
          retry: 0,
        },
      }));
      expect(mgr.canAdvance('stage-01.op-001', 'scheme_pending')).toBe(true);
    });

    it('test_failed → scheme_pending 应返回 true（BUG-02 修复）', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData({
        pipeline: {
          phase: 'test_failed' as PipelinePhase,
          current: { stage: 'stage-01', op: 'op-001' },
          retry: 0,
        },
      }));
      expect(mgr.canAdvance('stage-01.op-001', 'scheme_pending')).toBe(true);
    });

    it('exec_running → scheme_pending 应返回 true', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData({
        pipeline: {
          phase: 'exec_running' as PipelinePhase,
          current: { stage: 'stage-01', op: 'op-001' },
          retry: 0,
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

    // REV-005: 新增功能测试 — validate 自动修正
    it('非法 phase 可自动修正时应返回 valid=true 且 warnings 包含修正信息', () => {
      const mgr = new FlowManager(tmpDir);
      const bad = makeTestFlowData({
        pipeline: {
          phase: 'planning' as unknown as PipelinePhase,
          current: { stage: '', op: '' },
          retry: 0,
        },
      });
      mgr.setData(bad);
      const { valid, errors, warnings } = mgr.validate();
      expect(valid).toBe(true);
      expect(errors.length).toBe(0);
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0]).toContain('自动修正');
      expect(warnings[0]).toContain('planning');
      expect(mgr.getPhase()).toBe('plan_pending'); // 已修正
    });

    it('无法自动修正的非法 phase 应返回 valid=false 且 errors 包含错误', () => {
      const mgr = new FlowManager(tmpDir);
      const bad = makeTestFlowData({
        pipeline: {
          phase: 'xyz_invalid_phase' as unknown as PipelinePhase,
          current: { stage: '', op: '' },
          retry: 0,
        },
      });
      mgr.setData(bad);
      const { valid, errors, warnings } = mgr.validate();
      expect(valid).toBe(false);
      expect(errors.some((e) => e.includes('不是合法的') || e.includes('无法自动修正'))).toBe(true);
    });

    it('合法 phase 应返回 valid=true 且无 errors 和 warnings', () => {
      const mgr = new FlowManager(tmpDir);
      mgr.setData(makeTestFlowData({
        pipeline: {
          phase: 'exec_running' as PipelinePhase,
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

    it('dry-run 模式在正常 flow.json 时应返回 fixed=false 且 changes 含"未检测到"', () => {
      FlowManager.initFlow(tmpDir);
      const mgr = new FlowManager(tmpDir);
      const result = mgr.repair(true);
      expect(result.fixed).toBe(false);
      expect(result.changes.some((c) => c.includes('未检测到'))).toBe(true);
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
