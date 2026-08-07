/**
 * metrics 单元测试
 * 测试 MetricsStore 单例的性能指标记录、摘要生成与持久化读写
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MetricsStore, type AgentMetrics } from '../../src/core/metrics.js';
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
    store.recordRun('executor', 120, 'success');
    store.recordRun('executor', 80, 'success');

    const metrics = store.getAgentMetrics('executor') as AgentMetrics;
    expect(metrics.totalRuns).toBe(2);
    expect(metrics.successfulRuns).toBe(2);
    expect(metrics.failedRuns).toBe(0);
    expect(metrics.totalDurationMs).toBe(200);
    // 平均耗时 = 200 / 2
    expect(metrics.avgDurationMs).toBe(100);
  });

  it('recordRun 应记录失败运行与重试次数', () => {
    const store = MetricsStore.getInstance(tmpDir);
    store.recordRun('executor', 50, 'failure', 2);

    const metrics = store.getAgentMetrics('executor') as AgentMetrics;
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
    store.recordRun('executor', 100, 'success');
    store.recordRun('feel', 200, 'success');

    const all = store.getAgentMetrics() as AgentMetrics[];
    expect(all).toHaveLength(2);
  });

  it('summary 应包含各 Agent 的执行统计与成功率', () => {
    const store = MetricsStore.getInstance(tmpDir);
    store.recordRun('executor', 100, 'success');
    store.recordRun('executor', 100, 'failure');

    const text = store.summary();
    expect(text).toContain('executor');
    expect(text).toContain('成功 / 失败: 1 / 1');
    expect(text).toContain('成功率: 50.0%');
  });

  it('summary 无数据时应返回提示文案', () => {
    const store = MetricsStore.getInstance(tmpDir);
    expect(store.summary()).toContain('暂无');
  });

  it('save 应写入 metrics.json 并自动创建 .openfeel 目录', () => {
    const store = MetricsStore.getInstance(tmpDir);
    store.recordRun('executor', 100, 'success');
    store.save();

    const filePath = join(tmpDir, 'metrics.json');
    expect(existsSync(filePath)).toBe(true);
    const data = JSON.parse(readFileSync(filePath, 'utf-8'));
    expect(data.agents['executor'].totalRuns).toBe(1);
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
    store.recordRun('executor', 150, 'success', 1);
    store.save();

    // 模拟新进程：重置单例后从同一 dataDir 加载
    MetricsStore.resetInstance();
    const store2 = MetricsStore.getInstance(tmpDir);
    store2.load();
    const metrics = store2.getAgentMetrics('executor') as AgentMetrics;
    expect(metrics.totalRuns).toBe(1);
    expect(metrics.totalRetries).toBe(1);
    expect(metrics.avgDurationMs).toBe(150);
  });
});
