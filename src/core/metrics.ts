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
  /** 计入平均耗时的样本数（v1.5.23；旧数据缺省 → 按 totalRuns 近似） */
  durationSamples?: number;
}

/** phase → 负责 Agent 映射（T1 归属口径；`*_passed` / `done` / meta 等不入表 = 跳过不记） */
export const PHASE_AGENT_MAP: Readonly<Record<string, string>> = {
  plan_pending: 'openfeel-planner',
  plan_review: 'openfeel-planner',
  scheme_pending: 'openfeel-schemer',
  scheme_review: 'openfeel-schemer',
  exec_running: 'openfeel-executor',
  review_pending: 'openfeel-reviewer',
  review_failed: 'openfeel-reviewer',
  test_pending: 'openfeel-feel-tester',
  test_failed: 'openfeel-feel-tester',
  archiving: 'openfeel-archiver',
};

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
    durationSamples: 0,
  };
}

/**
 * 由 phase 窗口基线记录一次运行（v1.5.23 / REQ-042 / 六期缺陷 A）。
 *
 * 背景：旧实现只在 `flow advance` 成功分支 `recordRun(..., 'success')`，
 * `failedRuns` / 成功率因此恒为「零失败」——读出来不是空，是静默误导。
 *
 * 口径与成功路径一致（T1：窗口 = 进入 phase 的转换 → 退出）：
 *  - 有基线：耗时 = now - baseMs；
 *  - 无基线：成功跳过（不写 0 污染 avg），失败仍记一条（0 时长，只为让失败可见）；
 *  - 无 agent（该相位不入表）：两者都不记。
 * @returns 是否真的写入了一条指标
 */
export function recordPhaseWindowRun(
  store: MetricsStore,
  agentName: string | undefined,
  baseMs: number | null,
  ok: boolean,
  now: number = Date.now(),
): boolean {
  if (agentName === undefined || agentName === '') return false;
  const hasBaseline = baseMs !== null && baseMs > 0;
  if (!hasBaseline && ok) return false;
  store.recordRun(
    agentName,
    hasBaseline ? now - (baseMs as number) : 0,
    ok ? 'success' : 'failure',
    0,
    hasBaseline,
  );
  return true;
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
    countDuration: boolean = true,
  ): void {
    let metrics = this.agents.get(agentName);
    if (!metrics) {
      metrics = createDefaultMetrics(agentName);
      this.agents.set(agentName, metrics);
    }

    // v1.5.23：平均耗时的分母改为「计入时长的样本数」（旧数据无该键 → 按总次数近似，
    // 与旧公式一致）。失败但无 phase 基线时只计失败次数、不计时长，避免拉低 avg。
    const previousSamples = typeof metrics.durationSamples === 'number'
      ? metrics.durationSamples
      : metrics.totalRuns;
    metrics.totalRuns += 1;
    const samples = previousSamples + (countDuration ? 1 : 0);
    metrics.durationSamples = samples;
    if (countDuration) {
      metrics.totalDurationMs += durationMs;
    }

    if (result === 'success') {
      metrics.successfulRuns += 1;
    } else {
      metrics.failedRuns += 1;
    }

    metrics.totalRetries += retries;
    metrics.avgDurationMs = samples > 0 ? Math.round(metrics.totalDurationMs / samples) : 0;
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

    // T1 口径注记：耗时 = phase 窗口（非 agent 纯执行时长）；仅在有数据分支追加
    lines.push('', t('metrics.summary.caliberNote', lang));

    return lines.join('\n');
  }

  /**
   * 结构化指标摘要（B1-4：供 `flow metrics --json` 消费）。
   * 键名与 summary() 语义一致；新增 successRate 百分比（无数据时为 null）。
   * 不改变 summary() 既有签名与输出。
   */
  getSummaryData(): { agents: Array<AgentMetrics & { successRate: number | null }> } {
    const agents = Array.from(this.agents.values()).map((m) => {
      // v1.5.23：durationSamples 是内部记账字段，不进 JSON 契约（键集与既有冻结一致）
      const { durationSamples: _durationSamples, ...rest } = m;
      return {
        ...rest,
        successRate: m.totalRuns > 0
          ? Number(((m.successfulRuns / m.totalRuns) * 100).toFixed(1))
          : null,
      };
    });
    return { agents };
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
