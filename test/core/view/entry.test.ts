/**
 * View Entry 单元测试
 * 测试审查条目核心操作：生成 ID、创建、列询、验收
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FlowManager } from '../../../src/core/flow-manager.js';
import {
  generateReviewId,
  createReviewEntry,
  listReviews,
  acceptReview,
  type ReviewItem,
} from '../../../src/core/view/entry.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('View Entry', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-view-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // ═══════════════════════════════════════
  // generateReviewId
  // ═══════════════════════════════════════

  describe('generateReviewId', () => {
    it('流程未初始化时应返回 REV-001', () => {
      const id = generateReviewId(tmpDir);
      expect(id).toBe('REV-001');
    });

    it('已有审查条目时应递增生成', () => {
      // 初始化 flow.json
      FlowManager.initFlow(tmpDir);
      const mgr = new FlowManager(tmpDir);
      // 手动添加两条审查条目（需要 setData 确保数据有效，再 save 持久化）
      mgr.setData({
        meta: { version: '1.0', project: 'Test', updated: new Date().toISOString() },
        pipeline: { phase: 'plan_pending', current: { stage: '', op: '' }, retry: 0 },
        stages: {},
        reviews: [
          {
            id: 'REV-001', op: 'stage-01.op-001', status: 'open',
            priority: 'medium', title: '问题1', filed_by: 'reviewer',
            filed_at: new Date().toISOString(),
          },
          {
            id: 'REV-002', op: 'stage-01.op-001', status: 'open',
            priority: 'medium', title: '问题2', filed_by: 'reviewer',
            filed_at: new Date().toISOString(),
          },
        ],
        log: [],
      });
      mgr.save(); // 持久化到磁盘

      const id = generateReviewId(tmpDir);
      expect(id).toBe('REV-003');
    });
  });

  // ═══════════════════════════════════════
  // createReviewEntry
  // ═══════════════════════════════════════

  describe('createReviewEntry', () => {
    it('flow.json 未初始化时应抛出异常', () => {
      expect(() => {
        createReviewEntry(tmpDir, 'stage-01.op-001', '测试问题');
      }).toThrow('flow.json 未初始化');
    });

    it('正常创建条目应返回正确的 ReviewItem', () => {
      FlowManager.initFlow(tmpDir);

      // 先创建必要的 stage 和 op 数据
      const mgr = new FlowManager(tmpDir);
      mgr.setData({
        meta: { version: '1.0', project: 'Test', updated: new Date().toISOString() },
        pipeline: { phase: 'plan_pending', current: { stage: '', op: '' }, retry: 0 },
        stages: {
          'stage-01': {
            name: '测试阶段',
            status: 'in_progress',
            deps: [],
            ops: {
              'op-001': {
                id: 'op-001', title: '测试操作', state: 'pending',
                assignee: 'x', attempts: 0, max_attempts: 3,
                checkpoints: {
                  plan: 'pending', scheme: 'pending',
                  exec: { attempts: 0, self: 'pending' },
                  review: 'pending', test: 'pending',
                },
              },
            },
          },
        },
        reviews: [],
        log: [],
      });
      mgr.save();

      const review = createReviewEntry(tmpDir, 'stage-01.op-001', '测试审查问题', 'high');

      expect(review.id).toBe('REV-001');
      expect(review.op).toBe('stage-01.op-001');
      expect(review.status).toBe('open');
      expect(review.priority).toBe('high');
      expect(review.title).toBe('测试审查问题');
      expect(review.filed_by).toBe('reviewer');
      expect(review.filed_at).toBeTruthy();
    });

    it('默认优先级应为 medium', () => {
      FlowManager.initFlow(tmpDir);
      const mgr = new FlowManager(tmpDir);
      mgr.setData({
        meta: { version: '1.0', project: 'Test', updated: new Date().toISOString() },
        pipeline: { phase: 'plan_pending', current: { stage: '', op: '' }, retry: 0 },
        stages: {
          'stage-01': {
            name: '测试', status: 'in_progress', deps: [],
            ops: {
              'op-001': {
                id: 'op-001', title: 'op', state: 'pending',
                assignee: 'x', attempts: 0, max_attempts: 3,
                checkpoints: {
                  plan: 'pending', scheme: 'pending',
                  exec: { attempts: 0, self: 'pending' },
                  review: 'pending', test: 'pending',
                },
              },
            },
          },
        },
        reviews: [],
        log: [],
      });
      mgr.save();

      const review = createReviewEntry(tmpDir, 'stage-01.op-001', '默认优先级');
      expect(review.priority).toBe('medium');
    });

    it('创建后应能通过 listReviews 查询到', () => {
      FlowManager.initFlow(tmpDir);
      const mgr = new FlowManager(tmpDir);
      mgr.setData({
        meta: { version: '1.0', project: 'Test', updated: new Date().toISOString() },
        pipeline: { phase: 'plan_pending', current: { stage: '', op: '' }, retry: 0 },
        stages: {
          'stage-01': {
            name: '测试', status: 'in_progress', deps: [],
            ops: {
              'op-001': {
                id: 'op-001', title: 'op', state: 'pending',
                assignee: 'x', attempts: 0, max_attempts: 3,
                checkpoints: {
                  plan: 'pending', scheme: 'pending',
                  exec: { attempts: 0, self: 'pending' },
                  review: 'pending', test: 'pending',
                },
              },
            },
          },
        },
        reviews: [],
        log: [],
      });
      mgr.save();

      const created = createReviewEntry(tmpDir, 'stage-01.op-001', '可查询条目');
      const items = listReviews(tmpDir);

      expect(items.length).toBe(1);
      expect(items[0].id).toBe(created.id);
    });
  });

  // ═══════════════════════════════════════
  // listReviews
  // ═══════════════════════════════════════

  describe('listReviews', () => {
    it('流程未初始化时应返回空数组', () => {
      const items = listReviews(tmpDir);
      expect(items).toEqual([]);
    });

    it('无审查条目时应返回空数组', () => {
      FlowManager.initFlow(tmpDir);
      const items = listReviews(tmpDir);
      expect(items).toEqual([]);
    });

    it('应按 filed_at 降序排列', () => {
      FlowManager.initFlow(tmpDir);
      const mgr = new FlowManager(tmpDir);
      mgr.setData({
        meta: { version: '1.0', project: 'Test', updated: new Date().toISOString() },
        pipeline: { phase: 'plan_pending', current: { stage: '', op: '' }, retry: 0 },
        stages: {},
        reviews: [
          {
            id: 'REV-001', op: 'stage-01.op-001', status: 'open',
            priority: 'high', title: '最早', filed_by: 'reviewer',
            filed_at: '2026-01-01T00:00:00Z',
          },
          {
            id: 'REV-002', op: 'stage-01.op-001', status: 'open',
            priority: 'medium', title: '中间', filed_by: 'reviewer',
            filed_at: '2026-03-01T00:00:00Z',
          },
          {
            id: 'REV-003', op: 'stage-01.op-001', status: 'open',
            priority: 'low', title: '最新', filed_by: 'reviewer',
            filed_at: '2026-06-01T00:00:00Z',
          },
        ],
        log: [],
      });
      mgr.save();

      const items = listReviews(tmpDir);
      expect(items.length).toBe(3);
      // 应按时间降序：最新的在前
      expect(items[0].id).toBe('REV-003');
      expect(items[1].id).toBe('REV-002');
      expect(items[2].id).toBe('REV-001');
    });

    it('按 opId 过滤应只返回对应条目', () => {
      FlowManager.initFlow(tmpDir);
      const mgr = new FlowManager(tmpDir);
      mgr.setData({
        meta: { version: '1.0', project: 'Test', updated: new Date().toISOString() },
        pipeline: { phase: 'plan_pending', current: { stage: '', op: '' }, retry: 0 },
        stages: {},
        reviews: [
          {
            id: 'REV-001', op: 'stage-01.op-001', status: 'open',
            priority: 'high', title: '问题A', filed_by: 'reviewer',
            filed_at: '2026-01-01T00:00:00Z',
          },
          {
            id: 'REV-002', op: 'stage-02.op-001', status: 'open',
            priority: 'medium', title: '问题B', filed_by: 'reviewer',
            filed_at: '2026-01-02T00:00:00Z',
          },
        ],
        log: [],
      });
      mgr.save();

      const filtered = listReviews(tmpDir, 'stage-01.op-001');
      expect(filtered.length).toBe(1);
      expect(filtered[0].id).toBe('REV-001');
    });
  });

  // ═══════════════════════════════════════
  // acceptReview
  // ═══════════════════════════════════════

  describe('acceptReview', () => {
    it('flow.json 未初始化时应返回 null', () => {
      const result = acceptReview(tmpDir, 'REV-001');
      expect(result).toBeNull();
    });

    it('不存在的 ID 应返回 null', () => {
      FlowManager.initFlow(tmpDir);
      const result = acceptReview(tmpDir, 'NONEXISTENT');
      expect(result).toBeNull();
    });

    it('正常验收应将 open 改为 closed', () => {
      FlowManager.initFlow(tmpDir);
      const mgr = new FlowManager(tmpDir);
      mgr.setData({
        meta: { version: '1.0', project: 'Test', updated: new Date().toISOString() },
        pipeline: { phase: 'plan_pending', current: { stage: '', op: '' }, retry: 0 },
        stages: {},
        reviews: [
          {
            id: 'REV-001', op: 'stage-01.op-001', status: 'open',
            priority: 'high', title: '待验收问题', filed_by: 'reviewer',
            filed_at: '2026-01-01T00:00:00Z',
          },
        ],
        log: [],
      });
      mgr.save();

      const result = acceptReview(tmpDir, 'REV-001');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('REV-001');
      expect(result!.status).toBe('closed');
    });

    it('已 closed 的条目再次验收仍返回 closed', () => {
      FlowManager.initFlow(tmpDir);
      const mgr = new FlowManager(tmpDir);
      mgr.setData({
        meta: { version: '1.0', project: 'Test', updated: new Date().toISOString() },
        pipeline: { phase: 'plan_pending', current: { stage: '', op: '' }, retry: 0 },
        stages: {},
        reviews: [
          {
            id: 'REV-001', op: 'stage-01.op-001', status: 'closed',
            priority: 'medium', title: '已关闭问题', filed_by: 'reviewer',
            filed_at: '2026-01-01T00:00:00Z',
          },
        ],
        log: [],
      });
      mgr.save();

      const result = acceptReview(tmpDir, 'REV-001');
      expect(result).not.toBeNull();
      expect(result!.status).toBe('closed');
    });

    it('验收后持久化修改应可跨实例读取', () => {
      FlowManager.initFlow(tmpDir);
      const mgr = new FlowManager(tmpDir);
      mgr.setData({
        meta: { version: '1.0', project: 'Test', updated: new Date().toISOString() },
        pipeline: { phase: 'plan_pending', current: { stage: '', op: '' }, retry: 0 },
        stages: {},
        reviews: [
          {
            id: 'REV-001', op: 'stage-01.op-001', status: 'open',
            priority: 'low', title: '持久化测试', filed_by: 'reviewer',
            filed_at: '2026-01-01T00:00:00Z',
          },
        ],
        log: [],
      });
      mgr.save();

      // 验收
      acceptReview(tmpDir, 'REV-001');

      // 新建实例读取验证
      const mgr2 = new FlowManager(tmpDir);
      const items = mgr2.getReviewItems();
      expect(items.length).toBe(1);
      expect(items[0].status).toBe('closed');
    });
  });
});
