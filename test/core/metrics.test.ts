/**
 * metrics 单元测试
 * 测试 MetricsStore 单例的性能指标记录、摘要生成与持久化读写
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MetricsStore, PHASE_AGENT_MAP, type AgentMetrics } from '../../src/core/metrics.js';
import { existsSync, mkdirSync, writeFileSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('MetricsStore', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-metrics-test-'));
    MetricsStore.resetInstance();
  });

  afterEach(() => {
    MetricsStore.resetInstance();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('getInstance 应返回单例（相同 dataDir 复用实例）', () => {
    const a = MetricsStore.getInstance(tmpDir);
    const b = MetricsStore.getInstance(tmpDir);
    expect(a).toBe(b);
  });

  it('resetInstance 后应创建新实例', () => {
    const a = MetricsStore.getInstance(tmpDir);
    MetricsStore.resetInstance();
    const b = MetricsStore.getInstance(tmpDir);
    expect(a).not.toBe(b);
  });

  it('recordRun 应记录成功运行（totalRuns/successfulRuns/duration）', () => {
    const store = MetricsStore.getInstance(tmpDir);
    store.recordRun('openfeel-executor', 120, 'success');
    store.recordRun('openfeel-executor', 80, 'success');

    const metrics = store.getAgentMetrics('openfeel-executor') as AgentMetrics;
    expect(metrics.totalRuns).toBe(2);
    expect(metrics.successfulRuns).toBe(2);
    expect(metrics.failedRuns).toBe(0);
    expect(metrics.totalDurationMs).toBe(200);
    // 平均耗时 = 200 / 2
    expect(metrics.avgDurationMs).toBe(100);
  });

  it('recordRun 应记录失败运行与重试次数', () => {
    const store = MetricsStore.getInstance(tmpDir);
    store.recordRun('openfeel-executor', 50, 'failure', 2);

    const metrics = store.getAgentMetrics('openfeel-executor') as AgentMetrics;
    expect(metrics.totalRuns).toBe(1);
    expect(metrics.failedRuns).toBe(1);
    expect(metrics.totalRetries).toBe(2);
  });

  it('getAgentMetrics 对不存在的 agent 应返回 undefined', () => {
    const store = MetricsStore.getInstance(tmpDir);
    expect(store.getAgentMetrics('ghost')).toBeUndefined();
  });

  it('getAgentMetrics 不带参数应返回全部指标', () => {
    const store = MetricsStore.getInstance(tmpDir);
    store.recordRun('openfeel-executor', 100, 'success');
    store.recordRun('feel', 200, 'success');

    const all = store.getAgentMetrics() as AgentMetrics[];
    expect(all).toHaveLength(2);
  });

  it('summary 应包含各 Agent 的执行统计与成功率', () => {
    const store = MetricsStore.getInstance(tmpDir);
    store.recordRun('openfeel-executor', 100, 'success');
    store.recordRun('openfeel-executor', 100, 'failure');

    const text = store.summary();
    expect(text).toContain('openfeel-executor');
    expect(text).toContain('成功 / 失败: 1 / 1');
    expect(text).toContain('成功率: 50.0%');
  });

  it('summary 无数据时应返回提示文案', () => {
    const store = MetricsStore.getInstance(tmpDir);
    expect(store.summary()).toContain('暂无');
  });

  it('save 应写入 metrics.json 并自动创建 .openfeel 目录', () => {
    const store = MetricsStore.getInstance(tmpDir);
    store.recordRun('openfeel-executor', 100, 'success');
    store.save();

    const filePath = join(tmpDir, 'metrics.json');
    expect(existsSync(filePath)).toBe(true);
    const data = JSON.parse(readFileSync(filePath, 'utf-8'));
    expect(data.agents['openfeel-executor'].totalRuns).toBe(1);
  });

  it('load 应读取已有 metrics.json', () => {
    // 预写数据文件
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(join(tmpDir, 'metrics.json'), JSON.stringify({
      agents: {
        feel: { agentName: 'feel', totalRuns: 3, successfulRuns: 2, failedRuns: 1, totalRetries: 0, totalDurationMs: 300, avgDurationMs: 100 },
      },
    }), 'utf-8');

    const store = MetricsStore.getInstance(tmpDir);
    store.load();
    const metrics = store.getAgentMetrics('feel') as AgentMetrics;
    expect(metrics).toBeDefined();
    expect(metrics.totalRuns).toBe(3);
    expect(metrics.avgDurationMs).toBe(100);
  });

  it('load 对损坏的 metrics.json 应静默忽略', () => {
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(join(tmpDir, 'metrics.json'), '{broken json', 'utf-8');

    const store = MetricsStore.getInstance(tmpDir);
    expect(() => store.load()).not.toThrow();
    expect(store.getAgentMetrics()).toEqual([]);
  });

  it('save 与 load 应能往返（持久化后新实例可恢复）', () => {
    const store = MetricsStore.getInstance(tmpDir);
    store.recordRun('openfeel-executor', 150, 'success', 1);
    store.save();

    // 模拟新进程：重置单例后从同一 dataDir 加载
    MetricsStore.resetInstance();
    const store2 = MetricsStore.getInstance(tmpDir);
    store2.load();
    const metrics = store2.getAgentMetrics('openfeel-executor') as AgentMetrics;
    expect(metrics.totalRuns).toBe(1);
    expect(metrics.totalRetries).toBe(1);
    expect(metrics.avgDurationMs).toBe(150);
  });

  it('T11：不同 dataDir 返回不同实例，相同 dataDir 返回同一实例', () => {
    const dirA = mkdtempSync(join(tmpdir(), 'openfeel-metrics-a-'));
    const dirB = mkdtempSync(join(tmpdir(), 'openfeel-metrics-b-'));
    try {
      const a1 = MetricsStore.getInstance(dirA);
      const a2 = MetricsStore.getInstance(dirA);
      const b = MetricsStore.getInstance(dirB);
      expect(a1).toBe(a2);
      expect(a1).not.toBe(b);
    } finally {
      rmSync(dirA, { recursive: true, force: true });
      rmSync(dirB, { recursive: true, force: true });
    }
  });

  it('T15：summary("en") 不含 CJK，summary()（默认 zh-CN）与现状一致', () => {
    const store = MetricsStore.getInstance(tmpDir);
    store.recordRun('openfeel-executor', 100, 'success');
    store.recordRun('openfeel-executor', 100, 'failure');

    const en = store.summary('en');
    expect(en).not.toMatch(/[\u4e00-\u9fff]/);
    expect(en).toContain('openfeel-executor');
    expect(en).toContain('Success / Failure: 1 / 1');

    // 默认 zh-CN 输出保持现行为
    const zh = store.summary();
    expect(zh).toContain('成功率: 50.0%');
  });

  it('stage-86 op-001：summary() 含口径注记（zh）；en 无 CJK', () => {
    const store = MetricsStore.getInstance(tmpDir);
    store.recordRun('openfeel-executor', 100, 'success');

    expect(store.summary()).toContain('口径');
    const en = store.summary('en');
    expect(en).not.toMatch(/[一-鿿]/);
    expect(en).toContain('phase windows');
  });

  it('stage-86 op-001：无数据分支不加口径注记（仅 noData）', () => {
    const store = MetricsStore.getInstance(tmpDir);
    const text = store.summary();
    expect(text).toBe('暂无 Agent 性能数据。');
    expect(text).not.toContain('口径');
  });

  it('stage-86 op-001：getSummaryData() 键集不变（agents + 既有字段 + successRate）', () => {
    const store = MetricsStore.getInstance(tmpDir);
    store.recordRun('openfeel-executor', 100, 'success');

    const data = store.getSummaryData();
    expect(Object.keys(data)).toEqual(['agents']);
    expect(data.agents).toHaveLength(1);
    expect(Object.keys(data.agents[0]).sort()).toEqual(
      ['agentName', 'avgDurationMs', 'failedRuns', 'successRate', 'successfulRuns', 'totalDurationMs', 'totalRetries', 'totalRuns'],
    );
  });

  it('stage-86 op-001：PHASE_AGENT_MAP 10 键全集 + 值域 6 agent', () => {
    const expectedKeys = [
      'plan_pending', 'plan_review',
      'scheme_pending', 'scheme_review',
      'exec_running',
      'review_pending', 'review_failed',
      'test_pending', 'test_failed',
      'archiving',
    ];
    expect(Object.keys(PHASE_AGENT_MAP)).toHaveLength(10);
    expect(Object.keys(PHASE_AGENT_MAP).sort()).toEqual([...expectedKeys].sort());
    const allowed = new Set([
      'openfeel-planner', 'openfeel-schemer', 'openfeel-executor',
      'openfeel-reviewer', 'openfeel-feel-tester', 'openfeel-archiver',
    ]);
    for (const v of Object.values(PHASE_AGENT_MAP)) {
      expect(allowed.has(v)).toBe(true);
    }
    // 逐键断言（防键名拼写漂移）
    expect(PHASE_AGENT_MAP['plan_pending']).toBe('openfeel-planner');
    expect(PHASE_AGENT_MAP['scheme_pending']).toBe('openfeel-schemer');
    expect(PHASE_AGENT_MAP['exec_running']).toBe('openfeel-executor');
    expect(PHASE_AGENT_MAP['review_failed']).toBe('openfeel-reviewer');
    expect(PHASE_AGENT_MAP['test_failed']).toBe('openfeel-feel-tester');
    expect(PHASE_AGENT_MAP['archiving']).toBe('openfeel-archiver');
    // 非归属 phase 不入表
    expect(PHASE_AGENT_MAP['scheme_passed']).toBeUndefined();
    expect(PHASE_AGENT_MAP['done']).toBeUndefined();
  });
});
