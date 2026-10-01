/**
 * FlowManager 单元测试
 * 测试流水线状态管理的所有核心功能：读写、查询、推进、重试、审查、日志、校验
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FlowManager, mapPhaseToStageStatus, normalizeAgentName, FlowConcurrentModificationError, isFlowConcurrentError, findOrphanOps, type FlowData, type StageData, type OpState, type PipelinePhase, type MetaPhase } from '../../src/core/flow-manager.js';
import { t } from '../../src/core/i18n.js';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { join, sep } from 'node:path';
import { tmpdir } from 'node:os';

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
    // 有效值来源落 builtin（框架内置默认 disabled）
    const r = makeMgr().resolveEffectiveConfig();
    expect(r.auto_advance).toEqual({ value: 'disabled', source: 'builtin' });
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

  it('resolveEffectiveConfig：无 config 文件时 test_enabled/merge_mode 来源为 builtin（不出现 profile.yaml）', () => {
    // 无 profile 文件（BUG-003 后不再回退默认值）→ auto_advance 亦落 builtin；
    // execution_mode/test_enabled/merge_mode 不在画像键集内 → builtin。
    const r = makeMgr().resolveEffectiveConfig();
    expect(r.auto_advance).toEqual({ value: 'disabled', source: 'builtin' });
    expect(r.test_enabled).toEqual({ value: 'false', source: 'builtin' });
    expect(r.merge_mode).toEqual({ value: 'manual', source: 'builtin' });
    expect(r.execution_mode).toEqual({ value: 'manual', source: 'builtin' });
    expect(r.test_enabled.source).not.toBe('profile.yaml');
    expect(r.merge_mode.source).not.toBe('profile.yaml');
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

    it('T9：mapPhaseToStageStatus testEnabled 两分支', () => {
      expect(mapPhaseToStageStatus('review_passed', 'x', true)).toBe('review_passed');
      expect(mapPhaseToStageStatus('review_passed', 'x', false)).toBe('done');
    });

    it('T9：canAdvance 合法/非法目标两分支', () => {
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
});
