/**
 * Agent 性能指标模块
 * 记录每个 Agent 的执行时间、成功率、重试次数
 * 数据持久化到 .openfeel/metrics.json（与 flow.json 同级）
 */

import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { atomicWriteFileSync } from './fs/atomic-write.js';
import { normalizeAgentName } from './flow-manager.js';
import { t } from './i18n.js';

/** Agent 性能指标 */
export interface AgentMetrics {
  agentName: string;
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  totalRetries: number;
  totalDurationMs: number;
  avgDurationMs: number;
}

/** metrics.json 持久化数据结构 */
interface MetricsData {
  agents: Record<string, AgentMetrics>;
}

/** 创建默认的 AgentMetrics 初始值 */
function createDefaultMetrics(agentName: string): AgentMetrics {
  return {
    agentName,
    totalRuns: 0,
    successfulRuns: 0,
    failedRuns: 0,
    totalRetries: 0,
    totalDurationMs: 0,
    avgDurationMs: 0,
  };
}

/**
 * MetricsStore 单例
 * 管理所有 Agent 的性能指标，支持持久化读写
 */
export class MetricsStore {
  /** 按 dataDir 缓存单例，避免跨项目复用首次固化的 dataDir（T11） */
  private static instances = new Map<string, MetricsStore>();
  private agents: Map<string, AgentMetrics> = new Map();
  private dataDir: string;

  private constructor(dataDir: string) {
    this.dataDir = dataDir;
  }

  /** 获取单例实例（按 dataDir 为键；缺省 dataDir = CWD/.openfeel） */
  static getInstance(dataDir?: string): MetricsStore {
    const key = dataDir ?? resolve(process.cwd(), '.openfeel');
    let instance = MetricsStore.instances.get(key);
    if (!instance) {
      instance = new MetricsStore(key);
      MetricsStore.instances.set(key, instance);
    }
    return instance;
  }

  /** 重置单例（仅测试用） */
  static resetInstance(): void {
    MetricsStore.instances.clear();
  }

  /**
   * 记录一次 Agent 运行
   * @param agentName Agent 名称
   * @param durationMs 执行耗时（毫秒）
   * @param result 执行结果（成功或失败）
   * @param retries 本次操作的重试次数
   */
  recordRun(
    agentName: string,
    durationMs: number,
    result: 'success' | 'failure',
    retries: number = 0,
  ): void {
    let metrics = this.agents.get(agentName);
    if (!metrics) {
      metrics = createDefaultMetrics(agentName);
      this.agents.set(agentName, metrics);
    }

    metrics.totalRuns += 1;
    metrics.totalDurationMs += durationMs;

    if (result === 'success') {
      metrics.successfulRuns += 1;
    } else {
      metrics.failedRuns += 1;
    }

    metrics.totalRetries += retries;
    // 平均耗时 = 总耗时 / 总执行次数（取整）
    metrics.avgDurationMs = Math.round(metrics.totalDurationMs / metrics.totalRuns);
  }

  /**
   * 获取指定 Agent 或全部 Agent 的性能指标
   * @param agentName 可选，指定名称返回单个指标，否则返回全部
   */
  getAgentMetrics(agentName?: string): AgentMetrics | AgentMetrics[] | undefined {
    if (agentName) {
      return this.agents.get(agentName);
    }
    return Array.from(this.agents.values());
  }

  /**
   * 生成人类可读的性能摘要字符串（i18n 化，T15）
   * 包含每个 Agent 的总执行次数、成功率、重试次数、耗时统计
   * @param lang 语言标识（'zh-CN' | 'en'），默认 'zh-CN' 保持现行为
   */
  summary(lang: string = 'zh-CN'): string {
    if (this.agents.size === 0) {
      return t('metrics.summary.noData', lang);
    }

    const lines: string[] = [t('metrics.summary.title', lang), '═══════════════════'];

    for (const m of this.agents.values()) {
      const successRate =
        m.totalRuns > 0
          ? `${((m.successfulRuns / m.totalRuns) * 100).toFixed(1)}%`
          : 'N/A';

      lines.push(
        `\n${normalizeAgentName(m.agentName)}`,
        t('metrics.summary.totalRuns', lang, { n: String(m.totalRuns) }),
        t('metrics.summary.successFail', lang, { ok: String(m.successfulRuns), fail: String(m.failedRuns) }),
        t('metrics.summary.successRate', lang, { rate: successRate }),
        t('metrics.summary.totalRetries', lang, { n: String(m.totalRetries) }),
        t('metrics.summary.totalDuration', lang, { n: String(m.totalDurationMs) }),
        t('metrics.summary.avgDuration', lang, { n: String(m.avgDurationMs) }),
      );
    }

    return lines.join('\n');
  }

  /** metrics.json 文件完整路径 */
  private get metricsPath(): string {
    return resolve(this.dataDir, 'metrics.json');
  }

  /**
   * 从 .openfeel/metrics.json 加载已有数据
   * 文件不存在时静默跳过；数据损坏时从空状态开始
   */
  load(): void {
    const filePath = this.metricsPath;
    if (!existsSync(filePath)) {
      return;
    }

    try {
      const raw = readFileSync(filePath, 'utf-8');
      const data: MetricsData = JSON.parse(raw);

      if (data.agents) {
        for (const [name, metrics] of Object.entries(data.agents)) {
          this.agents.set(name, { ...metrics });
        }
      }
    } catch {
      // 文件损坏时静默忽略，从空状态开始
    }
  }

  /**
   * 保存当前所有指标到 .openfeel/metrics.json
   * 确保 .openfeel 目录存在
   */
  save(): void {
    // 确保目录存在
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true });
    }

    const agents: Record<string, AgentMetrics> = {};
    for (const [name, metrics] of this.agents) {
      agents[name] = { ...metrics };
    }

    const data: MetricsData = { agents };
    // 指标写入：仅原子写，不加锁（低并发、非一致性关键路径）
    atomicWriteFileSync(this.metricsPath, JSON.stringify(data, null, 2) + '\n');
  }
}
