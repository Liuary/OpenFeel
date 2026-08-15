/**
 * FlowManager 单元测试
 * 测试流水线状态管理的所有核心功能：读写、查询、推进、重试、审查、日志、校验
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FlowManager, mapPhaseToStageStatus, type FlowData, type OpState, type PipelinePhase, type MetaPhase } from '../../src/core/flow-manager.js';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { join, sep } from 'node:path';
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
| 2026-08-01 | Planner | plan_pending → plan_review | 计划提交 |
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
      expect(vs.recentChanges[0].agent).toBe('Planner');
      expect(vs.downstreamPhases.length).toBeGreaterThan(0);
      // 下游 phase 应有负责 Agent 映射（plan_* → planner）
      expect(vs.downstreamPhases[0].responsibleAgent).toBe('planner');
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
    it('status=done 但 phase≠done 时应同步 phase 为 done', () => {
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
      const result = mgr.autoRepairInconsistency('stage-01');
      expect(result.fixed).toBe(true);
      expect(result.detail).toContain('→ done');
      expect(mgr.getData()!.stages['stage-01'].phase).toBe('done');
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
  });

  // ═══════════════════════════════════════
  // mapPhaseToStageStatus（独立辅助函数）
  // ═══════════════════════════════════════

  describe('mapPhaseToStageStatus', () => {
    it('review_failed 应映射为 review_failed', () => {
      expect(mapPhaseToStageStatus('review_failed', 'anything')).toBe('review_failed');
    });

    it('review_passed 且 testEnabled 时应映射为 review_passed', () => {
      expect(mapPhaseToStageStatus('review_passed', 'x', true)).toBe('review_passed');
    });

    it('review_passed 且 testEnabled=false 时应映射为 done', () => {
      expect(mapPhaseToStageStatus('review_passed', 'x', false)).toBe('done');
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
});
