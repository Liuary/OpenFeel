/**
 * FlowManager — 流水线状态管理核心类
 * 负责 flow.json 的读写、状态推进、重试计数、审查管理、日志记录与校验。
 *
 * 变更摘要 (stage-01: flow.json 鲁棒性加固):
 * - PipelinePhase 类型从动态 string 硬化为 Zod enum（从 pipeline-schema 导入）
 * - validate() 增强: 使用 PipelinePhaseSchema 校验 + 模糊匹配自动修正非法 phase
 * - save() 增加备份与临时文件写入机制，防止 JSON 损坏导致状态丢失
 * - advancePhase() 增加 to 参数的 PipelinePhaseSchema 校验
 * - 新增 repair() 方法，自动检测并修复 flow.json 常见问题
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, renameSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { parse as parseYaml } from 'yaml';
import {
  PipelineConfigSchema,
  PipelinePhaseSchema,
  PIPELINE_PHASES,
  MetaPhaseSchema,
  META_PHASES,
  type PipelineConfig,
  type PipelinePhase,
  type MetaPhase,
  type StageStats,
} from './pipeline-schema.js';
import { PublicLogger } from './public-logger.js';
export { type PipelinePhase, type MetaPhase, type StageStats } from './pipeline-schema.js';

/** 操作执行状态 */
export type OpState = 'pending' | 'executing' | 'done' | 'failed';

/** 检查点结构 */
export interface Checkpoints {
  plan: string;
  scheme: string;
  exec: { attempts: number; self: string };
  review: string;
  test: string;
}

/** 操作 (Op) 结构 */
export interface Op {
  id: string;
  title: string;
  state: OpState;
  assignee: string;
  attempts: number;
  max_attempts: number;
  checkpoints: Checkpoints;
}

/** 审查条目 */
export interface ReviewItem {
  id: string;
  op: string;
  status: 'open' | 'resolved' | 'closed';
  priority: 'high' | 'medium' | 'low';
  title: string;
  filed_by: string;
  filed_at: string;
  /** Reviewer 认为可直接修复时设为 true，跳过 Schemer 重新规划 */
  canAutoFix?: boolean;
  /** 自动修复说明 */
  autoFixDetail?: string;
  /** 是否阻塞流水线。
   * - true：REV 未关闭时阻止流水线进入下一阶段（阻塞性 REV）
   * - false（默认）：REV 不中断流水线，仅作为记录跟踪（非阻塞 REV）
   *
   * 方案级审查 REV 默认非阻塞（blocking=false），代码级审查 REV 默认阻塞（blocking=true）。
   * 审查者可根据严重程度覆盖默认值。
   */
  blocking?: boolean;
}

/** 日志条目 */
export interface LogEntry {
  time: string;
  agent: string;
  action: string;
  detail: Record<string, unknown>;
}

/** 阶段数据结构 */
export interface StageData {
  name: string;
  /** 阶段当前流水线阶段 */
  phase: PipelinePhase;
  status: string;
  deps: string[];
  ops: Record<string, Op>;
  /** 阶段耗时统计（可选，运行时填充） */
  stats?: StageStats;
}

/** Flow 完整数据结构 */
export interface FlowData {
  meta: { version: string; project: string; updated: string };
  pipeline: { phase: MetaPhase; current: { stage: string; op: string }; retry: number };
  stages: Record<string, StageData>;
  reviews: ReviewItem[];
  log: LogEntry[];
}

/** 流水线摘要 */
export interface PipelineSummary {
  phase: string;
  currentOp: string | null;
  retryCount: number;
  stagesCount: number;
  opsCount: number;
  reviewItemsOpen: number;
  recentLogs: number;
}

/** verbose 模式下的配置级联信息 */
export interface CascadeConfig {
  configDefaults: Record<string, string>;
  statusOverrides: Record<string, string>;
  effective: Record<string, string>;
}

/** verbose 模式下的状态变更记录 */
export interface RecentChange {
  time: string;
  agent: string;
  change: string;
  description: string;
}

/** verbose 模式下的下游阶段信息 */
export interface DownstreamPhase {
  phase: string;
  label: string;
  responsibleAgent: string;
}

/** verbose 模式摘要（供 --verbose 输出） */
export interface VerboseSummary {
  basic: PipelineSummary;
  cascade: CascadeConfig;
  recentChanges: RecentChange[];
  downstreamPhases: DownstreamPhase[];
}

/** 跨会话上下文恢复结果 */
export interface RecoveryContext {
  /** 当前流水线阶段 */
  phase: PipelinePhase | null;
  /** 当前操作 ID */
  currentOp: string | null;
  /** 当前阶段状态（来自 status.md） */
  stageStatus: string;
  /** 阻塞原因（若有） */
  blockedBy: string;
  /** 待处理任务列表 */
  pendingTasks: string[];
}

/** 校验结果 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/** 修复结果 */
export interface RepairResult {
  fixed: boolean;
  changes: string[];
  recovered: boolean;
}

/** 健康检查单项 */
export interface HealthCheckItem {
  section: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
}

/** 健康检查结果 */
export interface HealthCheckResult {
  items: HealthCheckItem[];
  ok: boolean;
}

// ── 默认值 ──

/** 创建默认的 Checkpoints */
function defaultCheckpoints(): Checkpoints {
  return {
    plan: 'pending',
    scheme: 'pending',
    exec: { attempts: 0, self: 'pending' },
    review: 'pending',
    test: 'pending',
  };
}

/** 创建默认的 FlowData */
function defaultFlowData(): FlowData {
  return {
    meta: {
      version: '1.0',
      project: 'OpenFeel',
      updated: new Date().toISOString(),
    },
    pipeline: {
      phase: 'active',
      current: { stage: '-', op: 'init' },
      retry: 0,
    },
    stages: {},
    reviews: [],
    log: [],
  };
}

/** opId 解析结果 */
interface OpIdParts {
  stageId: string;
  opLocalId: string;
}

// ── 核心类 ──

export class FlowManager {
  private projectPath: string;
  private data: FlowData | null;
  private filePath: string;
  /** 从 pipeline.yaml 加载的流水线配置（含后备默认值） */
  private pipelineConfig: PipelineConfig | null = null;
  /** 公共日志写入器（审计链） */
  private publicLogger: PublicLogger;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
    this.data = null;
    this.filePath = resolve(projectPath, '.openfeel', 'flow.json');
    this.publicLogger = PublicLogger.getInstance(projectPath);
    this.loadPipelineConfig();
    this.load();
  }

  // ═══ 数据读写 ═══

  /** 加载 flow.json */
  load(): void {
    if (!existsSync(this.filePath)) {
      this.data = null;
      return;
    }
    try {
      const raw = readFileSync(this.filePath, 'utf-8');
      this.data = JSON.parse(raw) as FlowData;
      // 从 stages 的键名恢复 op 的 id 字段（运行时便利字段，磁盘不存储）
      if (this.data && this.data.stages) {
        for (const [, stage] of Object.entries(this.data.stages)) {
          for (const [opKey, op] of Object.entries(stage.ops)) {
            op.id = opKey;
          }
        }
      }
    } catch {
      this.data = null;
    }
  }

  /** 保存 flow.json（自动更新 meta.updated，序列化时去除 op 中的 id 字段以与键名保持一致） */
  save(): void {
    if (!this.data) {
      return;
    }
    this.data.meta.updated = new Date().toISOString();

    // 创建清理后的副本：去除 op 中的 id 字段（id 由 stages.{stageId}.ops 的键名决定）
    const serializable = JSON.parse(JSON.stringify(this.data)) as FlowData;
    for (const stage of Object.values(serializable.stages)) {
      for (const op of Object.values(stage.ops)) {
        delete (op as unknown as Record<string, unknown>).id;
      }
    }

    const content = JSON.stringify(serializable, null, 2) + '\n';
    const tmpPath = this.filePath + '.tmp';
    const bakPath = this.filePath + '.bak';

    // 备份旧文件（写入前）
    if (existsSync(this.filePath)) {
      try {
        copyFileSync(this.filePath, bakPath);
      } catch {
        // 备份失败不阻塞写入
      }
    }

    // 写入临时文件
    writeFileSync(tmpPath, content, 'utf-8');

    // 校验临时文件 JSON 合法性
    try {
      const tmpContent = readFileSync(tmpPath, 'utf-8');
      JSON.parse(tmpContent);
    } catch (parseErr) {
      // 清理失败的临时文件
      try {
        writeFileSync(tmpPath, '', 'utf-8');
      } catch {
        // 清理失败也不阻塞
      }
      throw new Error(
        `flow.json 写入校验失败: ${(parseErr as Error).message}。备份已保留在 ${bakPath}`,
      );
    }

    // 校验通过，rename 临时文件到正式文件
    renameSync(tmpPath, this.filePath);
  }

  /** 数据是否已加载 */
  isLoaded(): boolean {
    return this.data !== null;
  }

  /** 获取原始数据（供测试用） */
  getData(): FlowData | null {
    return this.data;
  }

  // ═══ 查询 ═══

  /** 获取全局宏观状态（MetaPhase：active/paused/done） */
  getPhase(): MetaPhase | null {
    if (!this.data) {
      return null;
    }
    return this.data.pipeline.phase;
  }

  /** 获取当前操作 */
  getCurrent(): { stage: string; op: string } | null {
    if (!this.data) {
      return null;
    }
    const cur = this.data.pipeline.current;
    if (!cur.stage || !cur.op) {
      return null;
    }
    return { stage: cur.stage, op: cur.op };
  }

  /** 解析 opId（格式 "stage-xx.op-xxx"） */
  private parseOpId(opId: string): OpIdParts | null {
    const dotIdx = opId.lastIndexOf('.');
    if (dotIdx === -1) {
      return null;
    }
    const stageId = opId.substring(0, dotIdx);
    const opLocalId = opId.substring(dotIdx + 1);
    // 排除空字符串情况
    if (!stageId || !opLocalId) {
      return null;
    }
    return { stageId, opLocalId };
  }

  /** 根据 opId 查找 Op 对象 */
  private getOp(opId: string): Op | null {
    if (!this.data) {
      return null;
    }
    const parts = this.parseOpId(opId);
    if (!parts) {
      return null;
    }
    const stage = this.data.stages[parts.stageId];
    if (!stage) {
      return null;
    }
    return stage.ops[parts.opLocalId] ?? null;
  }

  /** 获取 op 的执行状态 */
  getOpState(opId: string): OpState | null {
    const op = this.getOp(opId);
    return op ? op.state : null;
  }

  /** 获取 op 的检查点 */
  getOpCheckpoints(opId: string): Checkpoints | null {
    const op = this.getOp(opId);
    return op ? op.checkpoints : null;
  }

  /**
   * 获取 ready 状态（pending 或 executing）的操作
   * 可选按 stageId 过滤
   */
  getReadyOps(stageId?: string): Op[] {
    if (!this.data) {
      return [];
    }
    const result: Op[] = [];
    for (const [sid, stage] of Object.entries(this.data.stages)) {
      if (stageId && sid !== stageId) {
        continue;
      }
      for (const op of Object.values(stage.ops)) {
        if (op.state === 'pending' || op.state === 'executing') {
          result.push({ ...op, id: `${sid}.${op.id}` });
        }
      }
    }
    return result;
  }

  /** 获取审查条目，可按 opId 过滤 */
  getReviewItems(opId?: string): ReviewItem[] {
    if (!this.data) {
      return [];
    }
    if (!opId) {
      return [...this.data.reviews];
    }
    return this.data.reviews.filter((r) => r.op === opId);
  }

  /** 获取指定 op 的重试次数 */
  getRetryCount(opId: string): number {
    const op = this.getOp(opId);
    return op ? op.attempts : 0;
  }

  /** 返回人类可读的中文摘要 */
  summary(): string {
    if (!this.data) {
      return '流水线未初始化（flow.json 不存在）';
    }

    const stagesCount = Object.keys(this.data.stages).length;
    let opsCount = 0;
    for (const stage of Object.values(this.data.stages)) {
      opsCount += Object.keys(stage.ops).length;
    }

    const openReviews = this.data.reviews.filter(
      (r) => r.status === 'open',
    ).length;

    const cur = this.data.pipeline.current;
    const stagePhase = (cur.stage && this.data.stages[cur.stage])
      ? this.data.stages[cur.stage].phase
      : '(无当前阶段)';
    const lines: string[] = [
      'OpenFeel 流水线状态',
      `全局状态: ${this.data.pipeline.phase}`,
      `当前阶段: ${cur.stage || '(无)'} — 阶段状态: ${stagePhase}`,
      `当前操作: ${cur.stage ? `${cur.stage}.${cur.op}` : '(无)'}`,
      `重试次数: ${this.data.pipeline.retry}`,
      `阶段数: ${stagesCount}`,
      `操作数: ${opsCount}`,
      `待处理审查: ${openReviews}`,
      `日志总数: ${this.data.log.length}`,
      `最后更新: ${this.data.meta.updated}`,
    ];
    return lines.join('\n');
  }

  /** 获取 PipelineSummary 结构化摘要 */
  getSummary(): PipelineSummary {
    if (!this.data) {
      return {
        phase: 'uninitialized',
        currentOp: null,
        retryCount: 0,
        stagesCount: 0,
        opsCount: 0,
        reviewItemsOpen: 0,
        recentLogs: 0,
      };
    }

    let opsCount = 0;
    for (const stage of Object.values(this.data.stages)) {
      opsCount += Object.keys(stage.ops).length;
    }

    return {
      phase: this.data.pipeline.phase,
      currentOp: this.data.pipeline.current.stage
        ? `${this.data.pipeline.current.stage}.${this.data.pipeline.current.op}`
        : null,
      retryCount: this.data.pipeline.retry,
      stagesCount: Object.keys(this.data.stages).length,
      opsCount,
      reviewItemsOpen: this.data.reviews.filter((r) => r.status === 'open').length,
      recentLogs: this.data.log.length,
    };
  }

  /**
   * 将阶段注册到 flow.json 的 stages 中（若不存在）
   * @param stageName 阶段名（如 stage-01）
   * @param deps 依赖阶段列表（可选）
   */
  registerStage(stageName: string, deps: string[] = []): void {
    if (!this.data) {
      return;
    }
    if (this.data.stages[stageName]) {
      return; // 已注册，跳过
    }
    this.data.stages[stageName] = {
      name: stageName,
      phase: 'plan_pending' as PipelinePhase,
      status: 'planned',
      deps,
      ops: {},
    };
  }

  // ═══ 阶段耗时统计 ═══

  /**
   * 记录阶段开始时间
   * @param stageId 阶段 ID（如 stage-01）
   */
  startStage(stageId: string): void {
    if (!this.data) {
      return;
    }
    const stage = this.data.stages[stageId];
    if (!stage) {
      return;
    }
    if (!stage.stats) {
      stage.stats = { start_time: '', end_time: '', duration_ms: 0 };
    }
    stage.stats.start_time = new Date().toISOString();
  }

  /**
   * 记录阶段结束时间并计算耗时
   * @param stageId 阶段 ID（如 stage-01）
   */
  endStage(stageId: string): void {
    if (!this.data) {
      return;
    }
    const stage = this.data.stages[stageId];
    if (!stage) {
      return;
    }
    // 确保 stats 已初始化
    if (!stage.stats) {
      stage.stats = { start_time: '', end_time: '', duration_ms: 0 };
    }
    stage.stats.end_time = new Date().toISOString();
    // 计算耗时（毫秒）
    if (stage.stats.start_time) {
      const startMs = new Date(stage.stats.start_time).getTime();
      const endMs = new Date(stage.stats.end_time).getTime();
      stage.stats.duration_ms = Math.max(0, endMs - startMs);
    }

    // 公域日志：阶段完成时汇总写入一条里程碑记录
    this.publicLogger.logMilestone(`阶段 ${stageId} 完成`, {
      action: 'stage_completed',
      stageId,
      durationMs: stage.stats?.duration_ms ?? 0,
      finalPhase: stage.phase,
    });
  }

  /**
   * 获取阶段耗时统计
   * @param stageId 阶段 ID（如 stage-01）
   * @returns 阶段耗时数据，不存在时返回 null
   */
  getStageStats(stageId: string): StageStats | null {
    if (!this.data) {
      return null;
    }
    const stage = this.data.stages[stageId];
    if (!stage || !stage.stats) {
      return null;
    }
    return { ...stage.stats };
  }

  /**
   * 获取所有阶段的耗时统计映射
   */
  getAllStageStats(): Record<string, StageStats> {
    if (!this.data) {
      return {};
    }
    const result: Record<string, StageStats> = {};
    for (const [stageId, stage] of Object.entries(this.data.stages)) {
      if (stage.stats) {
        result[stageId] = { ...stage.stats };
      }
    }
    return result;
  }

  // ═══ 跨会话上下文恢复 ═══

  /**
   * 从 flow.json + status.md 恢复上下文
   * 供 Feel 重启后准确恢复状态机位置，无需重新推断
   * @returns 恢复上下文对象
   */
  recoverContext(): RecoveryContext {
    if (!this.data) {
      return {
        phase: null,
        currentOp: null,
        stageStatus: '未初始化',
        blockedBy: '',
        pendingTasks: [],
      };
    }

    const cur = this.data.pipeline.current;
    // phase 从当前 stage 的 stage.phase 读取，而非全局 pipeline.phase
    const phase = (cur.stage && this.data.stages[cur.stage])
      ? this.data.stages[cur.stage].phase
      : null;
    const currentOp = (cur.stage && cur.op) ? `${cur.stage}.${cur.op}` : null;

    // 从 status.md 读取当前阶段详细状态
    let stageStatus = '未知';
    let blockedBy = '';
    const pendingTasks: string[] = [];

    if (cur.stage) {
      const statusPath = this.findStatusPath(cur.stage);
      if (statusPath) {
        try {
          const content = readFileSync(statusPath, 'utf-8');

          // 提取执行模式
          const execMatch = content.match(/\*\*执行模式\*\*[：:]\s*(manual|auto)/);
          const modeLabel = execMatch ? (execMatch[1] === 'auto' ? '自动执行' : '手动执行') : '';

          // 提取状态
          const statusMatch = content.match(/\*\*状态\*\*[：:]\s*(\S+)/);
          stageStatus = statusMatch ? statusMatch[1] : '未知';
          if (modeLabel) {
            stageStatus += ` (${modeLabel})`;
          }

          // 提取阻塞原因
          const blockMatch = content.match(/\*\*阻塞原因\*\*[：:]\s*(.+)/);
          if (blockMatch) {
            blockedBy = blockMatch[1].trim();
          }

          // 提取待完成/待续事项
          const contentLower = content.toLowerCase();
          // 查找待续事项或未完成的任务
          const todoSection = content.match(/##\s*待续事项[\s\S]*?(?=##)/i)
            || content.match(/##\s*待做[\s\S]*?(?=##)/i);
          if (todoSection) {
            const lines = todoSection[0].split(/\r?\n/);
            for (const line of lines) {
              const taskMatch = line.match(/[-*]\s*\[ \]\s*(.+)/);
              if (taskMatch) {
                pendingTasks.push(taskMatch[1].trim());
              }
            }
          }

          // 如果没有找到待续事项，尝试从所有阶段收集未完成的 op
          if (pendingTasks.length === 0) {
            for (const [, stage] of Object.entries(this.data.stages)) {
              for (const [opKey, op] of Object.entries(stage.ops)) {
                if (op.state === 'pending' || op.state === 'executing') {
                  pendingTasks.push(`${stage.name}.${opKey}: ${op.title}`);
                }
              }
            }
          }
        } catch {
          stageStatus = '无法读取 status.md';
        }
      } else {
        stageStatus = 'status.md 不存在';
      }
    } else {
      // 无当前阶段时，列出所有 pending/executing 的任务
      for (const [stageId, stage] of Object.entries(this.data.stages)) {
        for (const [opKey, op] of Object.entries(stage.ops)) {
          if (op.state === 'pending' || op.state === 'executing') {
            pendingTasks.push(`${stageId}.${opKey}: ${op.title}`);
          }
        }
      }
      stageStatus = '无当前阶段';
    }

    return { phase, currentOp, stageStatus, blockedBy, pendingTasks };
  }

  // ═══ 推进 ═══

  /**
   * 推进指定阶段到目标流水线阶段（新 API）
   * @param stageName 阶段名（如 stage-01）
   * @param phase 目标流水线阶段（PipelinePhase）
   */
  advanceStagePhase(stageName: string, phase: PipelinePhase, triggeredBy?: string): void {
    if (!this.data) {
      return;
    }
    const actualTrigger = triggeredBy ?? 'flow-manager';

    // 校验 stageName 存在
    const stage = this.data.stages[stageName];
    if (!stage) {
      throw new Error(`阶段 '${stageName}' 不存在`);
    }

    // 校验 phase 为合法 PipelinePhase，非法时走模糊修正兜底
    let targetPhase: PipelinePhase;
    const phaseResult = PipelinePhaseSchema.safeParse(phase);
    if (!phaseResult.success) {
      const corrected = this.fuzzyCorrectPhase(phase as unknown as string);
      if (corrected) {
        console.warn(`[WARN] advanceStagePhase: Phase '${phase}' 自动修正为 '${corrected}'`);
        targetPhase = corrected;
      } else {
        throw new Error(`非法 phase '${phase}'，模糊修正失败`);
      }
    } else {
      targetPhase = phaseResult.data;
    }

    // 保存旧 phase 用于日志
    const fromPhase = stage.phase;

    // 更新 stage phase
    this.data.stages[stageName].phase = targetPhase;

    // 同步更新 pipeline.current：从该 stage 的 ops 中找到第一个 pending/executing 的 op
    const pendingOpEntry = Object.entries(stage.ops).find(
      ([, op]) => op.state === 'pending' || op.state === 'executing',
    );
    this.data.pipeline.current = {
      stage: stageName,
      op: pendingOpEntry ? pendingOpEntry[0] : this.data.pipeline.current.op,
    };

    // 同步更新 pipeline.phase 为 'active'
    this.data.pipeline.phase = 'active' as MetaPhase;

    // 追加日志（使用实际触发者名，而非硬编码 'flow-manager'）
    this.appendLog({
      time: '',
      agent: actualTrigger,
      action: 'advance_stage_phase',
      detail: { stageName, from: fromPhase, to: targetPhase },
    });

    // REV-003: advance_stage_phase 改为 endStage 时批量聚合，取消逐条写入
    // this.publicLogger.logPhaseChange({...});

    // 同步 stage status（调用已有 mapPhaseToStageStatus）
    const prevStatus = stage.status;
    const newStatus = mapPhaseToStageStatus(targetPhase, prevStatus);
    stage.status = newStatus;

    // 自动记录阶段计时：首次状态变更时启动
    if (!stage.stats || !stage.stats.start_time) {
      this.startStage(stageName);
    }

    // 阶段完成时自动结束计时
    if (targetPhase === 'done' && prevStatus !== 'done') {
      this.endStage(stageName);
    }
  }

  /**
   * 新增流水线阶段
   * @param stageId 阶段标识符（如 v4.3）
   * @param initialPhase 初始流水线阶段，默认 plan_pending
   */
  addStage(stageId: string, initialPhase: PipelinePhase = 'plan_pending'): void {
    if (!this.data) {
      return;
    }
    if (this.data.stages[stageId]) {
      throw new Error(`阶段 '${stageId}' 已存在`);
    }
    this.data.stages[stageId] = {
      name: stageId,
      phase: initialPhase,
      status: 'planned',
      deps: [],
      ops: {},
    };
    this.data.pipeline.current = {
      stage: stageId,
      op: '',
    };
    this.appendLog({
      time: '',
      agent: 'flow-manager',
      action: 'add_stage',
      detail: { stageId, phase: initialPhase },
    });
  }

  /**
   * 推进流水线阶段（旧 API）
   * @param opId 操作 ID（格式 "stage-xx.op-xxx"）
   * @param to 目标流水线阶段
   * @param stageId 可选阶段 ID，传入时同步更新 flow.json.stages[stageId].status
   * @param force 是否强制执行（非法 phase 时走模糊修正路径）
   * @deprecated 请使用 advanceStagePhase(stageName, phase) 替代。内部保留 op 级逻辑后委托给 advanceStagePhase。
   */
  advancePhase(opId: string | null, to: string, stageId?: string, force?: boolean): void {
    console.warn('[DEPRECATED] advancePhase() 已弃用，请使用 advanceStagePhase(stageName, phase) 替代');

    // ── 1. 校验目标 phase ──
    let targetPhase: PipelinePhase;
    const phaseResult = PipelinePhaseSchema.safeParse(to);
    if (!phaseResult.success) {
      if (force) {
        const corrected = this.fuzzyCorrectPhase(to);
        if (corrected) {
          console.warn(`[WARN] Phase '${to}' 自动修正为 '${corrected}'`);
          targetPhase = corrected;
        } else {
          console.error(`错误: '${to}' 不是合法的 PipelinePhase 值，且无法自动修正`);
          throw new Error(`非法 phase '${to}'，模糊修正失败`);
        }
      } else {
        const validPhasesStr = (PIPELINE_PHASES as readonly string[]).join(', ');
        console.error(`错误: '${to}' 不是合法的 PipelinePhase。合法值: [${validPhasesStr}]`);
        return;
      }
    } else {
      targetPhase = phaseResult.data;
    }

    if (!this.data) {
      return;
    }

    // ── 2. 解析 stageId ──
    const resolvedStageId = stageId || (opId ? this.parseOpId(opId)?.stageId : this.data.pipeline.current.stage);
    if (!resolvedStageId) {
      console.warn('[DEPRECATED] advancePhase: 无法解析 stageId，跳过');
      return;
    }

    // ── 3. Op 级工作（检查点更新、重试计数） ──
    if (opId) {
      const op = this.getOp(opId);
      if (op) {
        const parts = this.parseOpId(opId);
        if (parts) {
          const prevStage = this.data.pipeline.current.stage;
          const prevOp = this.data.pipeline.current.op;

          // 更新 pipeline current（用于 op 级追踪）
          this.data.pipeline.current = { stage: parts.stageId, op: parts.opLocalId };

          // REV-002: 切换到新操作时重置重试计数
          if (prevStage !== parts.stageId || prevOp !== parts.opLocalId) {
            this.data.pipeline.retry = 0;
          }

          // 根据目标 phase 更新对应的 checkpoint
          const checkpointKey = this.getCheckpointFromPhase(targetPhase);
          if (checkpointKey) {
            if (checkpointKey === 'exec') {
              if (targetPhase === 'exec_running') {
                op.checkpoints.exec.self = 'running';
              }
            } else {
              if (targetPhase.endsWith('_passed')) {
                (op.checkpoints as unknown as Record<string, string>)[checkpointKey] = 'passed';
              } else if (targetPhase.endsWith('_failed')) {
                (op.checkpoints as unknown as Record<string, string>)[checkpointKey] = 'failed';
              } else {
                (op.checkpoints as unknown as Record<string, string>)[checkpointKey] = 'pending';
              }
            }
          }
        }
      }
    }

    // ── 4. 委托给 advanceStagePhase（处理 stage phase 更新、pipeline.phase、日志、stage status、统计） ──
    this.advanceStagePhase(resolvedStageId, targetPhase);
  }

  // ── 阶段跳转检测 ──

  /**
   * 检查当前 phase 到目标 phase 是否存在直接跳转路径
   * 供 CLI --force 判断使用
   * @param stageName 可选阶段名，提供时使用该阶段 phase 进行查找；否则使用 current.stage 的 phase
   */
  hasTransition(to: string, stageName?: string): boolean {
    if (!this.data || !this.pipelineConfig) {
      return false;
    }
    const phase = this.resolveCurrentPhase(stageName);
    if (!phase) return false;
    const validTargets = this.pipelineConfig.transitions[phase];
    return validTargets ? validTargets.includes(to) : false;
  }

  /**
   * 获取当前阶段的所有可达下一阶段（基于 transitions 表）
   * 供 flow wizard 交互模式使用
   * @param stageName 可选阶段名，提供时使用该阶段 phase 进行查找；否则使用 current.stage 的 phase
   */
  getAvailablePhases(stageName?: string): PipelinePhase[] {
    if (!this.data) {
      return [];
    }
    if (!this.pipelineConfig) {
      return [];
    }
    const currentPhase = this.resolveCurrentPhase(stageName);
    if (!currentPhase) return [];
    const validTargets = this.pipelineConfig.transitions[currentPhase];
    return (validTargets ?? []) as PipelinePhase[];
  }

  /**
   * 解析当前阶段 phase：优先使用传入的 stageName，其次 current.stage，最后 fallback
   */
  private resolveCurrentPhase(stageName?: string): PipelinePhase | null {
    if (!this.data) return null;
    const targetStageName = stageName || this.data.pipeline.current.stage;
    if (!targetStageName) return null;
    const stage = this.data.stages[targetStageName];
    return stage?.phase ?? null;
  }

  /**
   * 获取流水线阶段的中文标签映射
   * 从 pipelineConfig.phases 动态生成：已知阶段使用预定义标签，未知阶段自动生成回退标签
   * 供 flow wizard 交互模式使用
   */
  getPhaseLabels(): Record<string, string> {
    // 内置中文标签映射（含所有标准阶段）
    const builtinLabels: Record<string, string> = {
      plan_pending: '计划待定',
      plan_review: '计划审查中',
      plan_passed: '计划已通过',
      scheme_pending: '方案待定',
      scheme_review: '方案审查中',
      scheme_passed: '方案已通过',
      exec_running: '执行中',
      review_pending: '审查待定',
      review_failed: '审查未通过',
      review_passed: '审查已通过',
      test_pending: '测试待定',
      test_failed: '测试未通过',
      test_passed: '测试已通过',
      archiving: '归档中',
      done: '已完成',
    };

    // 从 pipelineConfig 获取完整阶段列表
    const phases = this.pipelineConfig?.phases ?? [];

    // 动态生成标签：优先使用预定义标签，未知阶段生成回退标签
    const labels: Record<string, string> = {};
    for (const phase of phases) {
      if (builtinLabels[phase]) {
        labels[phase] = builtinLabels[phase];
      } else {
        // 自动生成回退标签：将下划线替换为空格作为可读名称
        labels[phase] = phase.replace(/_/g, ' ');
      }
    }

    return labels;
  }

  /**
   * verbose 模式摘要（返回结构化数据供命令层排版）
   * 包含：配置级联、最近状态变更、下游 Agent 就绪状态
   * @param maxChanges 最近状态变更条数（默认 5）
   */
  verboseSummary(maxChanges: number = 5): VerboseSummary {
    const basic = this.getSummary();

    // ── 配置级联状态 ──
    const cascade = this.buildCascadeConfig();

    // ── 最近 N 条状态变更（从 status.md 的状态记录表提取） ──
    const recentChanges = this.extractRecentChanges(maxChanges);

    // ── 下游 Agent 就绪状态 ──
    const downstreamPhases = this.buildDownstreamPhases();

    return { basic, cascade, recentChanges, downstreamPhases };
  }

  /** 构建配置级联信息 */
  private buildCascadeConfig(): CascadeConfig {
    const configDefaults: Record<string, string> = {};
    const statusOverrides: Record<string, string> = {};
    const effective: Record<string, string> = {};

    // 读取 config.yaml defaults
    const configPath = resolve(this.projectPath, '.openfeel', 'config.yaml');
    if (existsSync(configPath)) {
      try {
        const raw = readFileSync(configPath, 'utf-8');
        const config = parseYaml(raw) as Record<string, unknown>;
        if (config && typeof config === 'object' && config.defaults) {
          const defaults = config.defaults as Record<string, unknown>;
          for (const [key, value] of Object.entries(defaults)) {
            configDefaults[key] = String(value);
            effective[key] = String(value);
          }
        }
      } catch {
        // 解析失败则用空值
      }
    }

    // 读取当前 stage 的 status.md（如果存在）
    if (this.data && this.data.pipeline.current.stage) {
      const stageId = this.data.pipeline.current.stage;
      const statusPath = this.findStatusPath(stageId);
      if (statusPath) {
        try {
          const content = readFileSync(statusPath, 'utf-8');
          // 匹配执行模式、自动推进
          const execMatch = content.match(/\*\*执行模式\*\*[：:]\s*(manual|auto)/);
          const autoMatch = content.match(/\*\*自动推进\*\*[：:]\s*(disabled|enabled)/);
          if (execMatch) {
            statusOverrides['execution_mode'] = execMatch[1];
            effective['execution_mode'] = execMatch[1];
          }
          if (autoMatch) {
            statusOverrides['auto_advance'] = autoMatch[1];
            effective['auto_advance'] = autoMatch[1];
          }
        } catch {
          // 读取失败则跳过
        }
      }
    }

    return { configDefaults, statusOverrides, effective };
  }

  /** 查找 status.md 的路径（先查 stages 目录，再回退 plan 目录） */
  private findStatusPath(stageId: string): string | null {
    const stagesDir = resolve(this.projectPath, '.openfeel', 'stages', stageId, 'status.md');
    if (existsSync(stagesDir)) {
      return stagesDir;
    }
    const planDir = resolve(this.projectPath, '.openfeel', 'plan', stageId, 'status.md');
    if (existsSync(planDir)) {
      return planDir;
    }
    return null;
  }

  /** 从 status.md 的状态记录表提取最近 N 条变更 */
  private extractRecentChanges(maxChanges: number): RecentChange[] {
    const results: RecentChange[] = [];
    if (!this.data || !this.data.pipeline.current.stage) {
      return results;
    }

    const statusPath = this.findStatusPath(this.data.pipeline.current.stage);
    if (!statusPath) {
      return results;
    }

    try {
      const content = readFileSync(statusPath, 'utf-8');
      // 找到 ## 状态记录 之后的表格
      const recordIdx = content.indexOf('## 状态记录');
      if (recordIdx === -1) {
        return results;
      }

      const afterRecord = content.substring(recordIdx);
      // 按行分割查找表格行（跳过表头和分隔线）
      const lines = afterRecord.split(/\r?\n/);
      let inTable = false;
      for (const line of lines) {
        const trimmed = line.trim();
        // 跳过表头
        if (trimmed.startsWith('| 时间') || trimmed.startsWith('|------')) {
          inTable = true;
          continue;
        }
        if (!inTable) {
          continue;
        }
        // 空行或非表格行结束
        if (!trimmed.startsWith('|')) {
          break;
        }
        // 解析表格行: | 时间 | Agent | 状态变化 | 说明 |
        const cells = trimmed.split('|').map((c) => c.trim()).filter(Boolean);
        if (cells.length >= 4) {
          results.push({
            time: cells[0],
            agent: cells[1],
            change: cells[2],
            description: cells[3],
          });
        }
      }
    } catch {
      // 读取失败
    }

    // 返回最近 N 条（倒序取最后）
    return results.slice(-maxChanges);
  }

  /** 构建下游阶段列表（当前 phase 的可达下一阶段 + Agent 映射） */
  private buildDownstreamPhases(): DownstreamPhase[] {
    const available = this.getAvailablePhases();
    const labels = this.getPhaseLabels();
    const result: DownstreamPhase[] = [];

    for (const phase of available) {
      result.push({
        phase,
        label: labels[phase] ?? phase.replace(/_/g, ' '),
        responsibleAgent: this.mapPhaseToAgent(phase),
      });
    }
    return result;
  }

  /** 将 PipelinePhase 映射为负责 Agent 标识 */
  private mapPhaseToAgent(phase: PipelinePhase): string {
    const prefix = phase.split('_')[0];
    switch (prefix) {
      case 'plan':
        return 'planner';
      case 'scheme':
        return 'schemer';
      case 'exec':
        return 'executor';
      case 'review':
        return 'reviewer';
      case 'test':
        return 'feel-tester';
      case 'archiving':
        return 'archiver';
      case 'done':
        return 'none';
      default:
        return 'unknown';
    }
  }

  /** 从 PipelinePhase 提取对应的 checkpoint 字段名（从 pipeline.yaml 映射查找） */
  private getCheckpointFromPhase(phase: PipelinePhase): keyof Checkpoints | null {
    const prefix = phase.split('_')[0];
    return (this.pipelineConfig?.checkpoint_mapping[prefix] as keyof Checkpoints) ?? null;
  }

  /**
   * 记录一次操作执行结果
   * @returns 包含是否应重试、是否应重新规划的信息
   */
  recordAttempt(
    opId: string,
    result: 'pass' | 'fail',
  ): { shouldRetry: boolean; shouldReplan: boolean } {
    if (!this.data) {
      return { shouldRetry: false, shouldReplan: false };
    }

    const op = this.getOp(opId);
    if (!op) {
      return { shouldRetry: false, shouldReplan: false };
    }

    op.attempts += 1;

    if (result === 'pass') {
      op.state = 'done';
      this.data.pipeline.retry = 0;
      this.appendLog({
        time: '',
        agent: 'executor',
        action: 'attempt_pass',
        detail: { opId, attempts: op.attempts },
      });
      // 公共日志：记录执行通过（审计链）
      this.publicLogger.logPhaseChange({
        action: 'attempt_pass',
        opId,
        extra: { attempts: op.attempts },
      });
      return { shouldRetry: false, shouldReplan: false };
    }

    // result === 'fail'
    if (op.attempts < op.max_attempts) {
      op.state = 'pending'; // 回到 pending 等待重试
      this.data.pipeline.retry += 1;
      this.appendLog({
        time: '',
        agent: 'executor',
        action: 'attempt_fail_retry',
        detail: { opId, attempts: op.attempts, maxAttempts: op.max_attempts },
      });
      // 公共日志：记录执行失败-重试（审计链）
      this.publicLogger.logPhaseChange({
        action: 'attempt_fail_retry',
        opId,
        extra: { attempts: op.attempts, maxAttempts: op.max_attempts },
      });
      return { shouldRetry: true, shouldReplan: false };
    }

    // 重试耗尽
    op.state = 'failed';
    this.data.pipeline.retry += 1;
    this.appendLog({
      time: '',
      agent: 'executor',
      action: 'attempt_fail_exhausted',
      detail: { opId, attempts: op.attempts, maxAttempts: op.max_attempts },
    });
    // 公共日志：记录执行失败-耗尽（审计链）
    this.publicLogger.logPhaseChange({
      action: 'attempt_fail_exhausted',
      opId,
      extra: { attempts: op.attempts, maxAttempts: op.max_attempts },
    });
    return { shouldRetry: false, shouldReplan: true };
  }

  /** 添加或更新审查条目 */
  addReview(item: ReviewItem): void {
    if (!this.data) {
      return;
    }
    const idx = this.data.reviews.findIndex((r) => r.id === item.id);
    if (idx !== -1) {
      this.data.reviews[idx] = item;
    } else {
      this.data.reviews.push(item);
    }
    // 公共日志：记录审查事件（审计链）
    this.publicLogger.logReviewEvent({
      action: 'review_added',
      opId: item.op,
      extra: { reviewId: item.id, status: item.status, priority: item.priority, title: item.title },
    });
  }

  /** 将指定审查条目标记为 resolved */
  resolveReview(reviewId: string): boolean {
    if (!this.data) {
      return false;
    }
    const review = this.data.reviews.find((r) => r.id === reviewId);
    if (!review) {
      return false;
    }
    review.status = 'resolved';
    return true;
  }

  /**
   * 添加自动修复审查条目
   * 当 Reviewer 认为问题可直接修复时调用，REV 条目状态直接设为 resolved，
   * pipeline.phase 跳过 review_failed→scheme_pending，直接推进到 exec_running。
   * @param item 审查条目（canAutoFix 自动设为 true）
   * @param opId 关联的操作 ID
   */
  addAutoFixReview(item: ReviewItem, opId: string): void {
    if (!this.data) {
      return;
    }

    // 校验 opId 格式：必须包含 '.'，且 stage 必须存在于 stages 中
    if (!opId.includes('.')) {
      console.error(`错误：opId 格式不正确 "${opId}"，应为 stage-xx.op-xxx`);
      return;
    }
    const stageId = opId.substring(0, opId.lastIndexOf('.'));
    const stage = this.data.stages[stageId];
    if (!stage) {
      console.error(`错误：opId "${opId}" 中的 stage "${stageId}" 不存在`);
      return;
    }

    // 前置条件：仅允许从 review_failed 状态调用，检查对应 stage 的 phase
    if (stage.phase !== 'review_failed') {
      console.warn(`[WARN] addAutoFixReview 仅允许从 review_failed 状态调用，当前 stage ${stageId} phase 为 ${stage.phase}`);
      return;
    }

    // 标记为自动修复
    item.canAutoFix = true;

    // 添加审查条目（状态直接为 resolved，跳过 pending→fixing 流程）
    item.status = 'resolved';
    this.addReview(item);

    // 推进流水线：跳过 review_failed→scheme_pending，直通 exec_running
    this.advancePhase(opId, 'exec_running' as PipelinePhase);

    // 写入日志
    this.appendLog({
      time: '',
      agent: 'flow-manager',
      action: 'auto_fix_review',
      detail: { opId, reviewId: item.id, detail: item.autoFixDetail ?? '' },
    });

    // 公共日志：记录自动修复审查事件（审计链）
    // 注: advancePhase 和 addReview 调用已各自记录其事件，此处记录 auto_fix 专项事件
    this.publicLogger.logReviewEvent({
      action: 'auto_fix_review',
      opId,
      extra: { reviewId: item.id, autoFixDetail: item.autoFixDetail ?? '' },
    });
  }

  /** 追加操作日志（若 time 为空则自动生成） */
  appendLog(entry: LogEntry): void {
    if (!this.data) {
      return;
    }
    const logEntry: LogEntry = {
      ...entry,
      time: entry.time || new Date().toISOString(),
    };
    this.data.log.push(logEntry);
  }

  // ═══ 校验 ═══

  /**
   * 校验 phase 流转是否合法（从 pipeline.yaml 配置驱动）
   * 使用 opId 对应的 stage.phase 作为当前阶段进行流转校验
   */
  canAdvance(opId: string, to: PipelinePhase): boolean {
    if (!this.data) {
      return false;
    }

    // 检查 opId 指向的 op 是否存在
    const op = this.getOp(opId);
    if (!op) {
      return false;
    }

    // 若 pipelineConfig 未加载，无法校验
    if (!this.pipelineConfig) {
      return false;
    }

    // 从 opId 解析出 stage，使用 stage.phase 而非全局 pipeline.phase
    const parts = this.parseOpId(opId);
    if (!parts || !this.data.stages[parts.stageId]) {
      return false;
    }
    const currentPhase = this.data.stages[parts.stageId].phase;

    // 检查从当前 phase 到目标 phase 的流转是否合法
    const validTargets = this.pipelineConfig.transitions[currentPhase];
    if (!validTargets || !validTargets.includes(to)) {
      return false;
    }

    return true;
  }

  /**
   * 校验 flow.json 格式合法性
   * 检查必填字段是否存在，对非法 phase 值进行模糊匹配自动修正。
   * 可自动修正的问题记录在 warnings 中而不影响 valid 判定。
   */
  validate(): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!this.data) {
      errors.push('flow.json 未加载或不存在');
      return { valid: false, errors, warnings };
    }

    // 检查 meta 必填字段
    if (!this.data.meta?.version) {
      errors.push('meta.version 缺失');
    }
    if (!this.data.meta?.project) {
      errors.push('meta.project 缺失');
    }

    // 检查 pipeline 必填字段
    if (!this.data.pipeline?.phase) {
      errors.push('pipeline.phase 缺失');
    }

    // pipeline.phase 校验：使用 MetaPhaseSchema（全局宏观状态：active/paused/done）
    if (this.data.pipeline?.phase) {
      const phaseResult = MetaPhaseSchema.safeParse(this.data.pipeline.phase);
      if (!phaseResult.success) {
        // 尝试简单修正：若非 MetaPhase 值，默认为 'active'
        const corrected = this.fuzzyCorrectMetaPhase(this.data.pipeline.phase as string);
        if (corrected) {
          warnings.push(
            `pipeline.phase '${this.data.pipeline.phase}' 自动修正为 '${corrected}'`,
          );
          this.data.pipeline.phase = corrected;
        } else {
          errors.push(
            `pipeline.phase 值 "${this.data.pipeline.phase}" 不是合法的 MetaPhase 枚举值（active/paused/done），且无法自动修正`,
          );
        }
      }
    }

    if (!this.data.pipeline?.current) {
      errors.push('pipeline.current 缺失');
    }

    // 检查 stages 是否为对象
    if (typeof this.data.stages !== 'object' || this.data.stages === null) {
      errors.push('stages 不是有效对象');
    } else {
      // 遍历每个 stage，校验其 phase 字段为合法 PipelinePhase
      for (const [stageId, stage] of Object.entries(this.data.stages)) {
        if (!stage.phase) {
          warnings.push(`stages.${stageId}.phase 缺失，设为默认 'plan_pending'`);
          stage.phase = 'plan_pending' as PipelinePhase;
        } else {
          const stagePhaseResult = PipelinePhaseSchema.safeParse(stage.phase);
          if (!stagePhaseResult.success) {
            const corrected = this.fuzzyCorrectPhase(stage.phase as string);
            if (corrected) {
              warnings.push(
                `stages.${stageId}.phase '${stage.phase}' 自动修正为 '${corrected}'`,
              );
              stage.phase = corrected;
            } else {
              errors.push(
                `stages.${stageId}.phase 值 "${stage.phase}" 不是合法的 PipelinePhase 枚举值，且无法自动修正`,
              );
            }
          }
        }
      }
    }

    // 检查 reviews 是否为数组
    if (!Array.isArray(this.data.reviews)) {
      errors.push('reviews 不是有效数组');
    }

    // 检查 log 是否为数组
    if (!Array.isArray(this.data.log)) {
      errors.push('log 不是有效数组');
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * 模糊匹配非法 phase 值到最近合法值
   * 优先级: 精确匹配 → phase_corrections 映射 → 前缀匹配 → 包含匹配
   */
  private fuzzyCorrectPhase(input: string): PipelinePhase | null {
    // 先尝试 phase_corrections 精确映射（来自 pipeline.yaml 配置）
    const phaseCorrections = this.pipelineConfig?.phase_corrections ?? {};
    if (phaseCorrections[input]) {
      return phaseCorrections[input] as PipelinePhase;
    }

    // 标准化: 去除首尾空格，转小写，统一分隔符，去除首尾下划线
    const normalized = input.trim().toLowerCase().replace(/[\s_-]+/g, '_').replace(/^_|_$/g, '');

    // 直接匹配合法值
    if ((PIPELINE_PHASES as readonly string[]).includes(normalized)) {
      return normalized as PipelinePhase;
    }

    // 前缀匹配: 如 'plan' → 'plan_pending', 'review' → 'review_pending'
    const prefixMatches = (PIPELINE_PHASES as readonly string[]).filter(
      (p) => p.startsWith(normalized + '_'),
    );
    if (prefixMatches.length === 1) {
      return prefixMatches[0] as PipelinePhase;
    }

    // 插入下划线后再试前缀匹配: 如 'planpending' → 'plan_pending'
    for (const phase of PIPELINE_PHASES) {
      const stripped = phase.replace(/_/g, '');
      if (stripped === normalized) {
        return phase;
      }
    }

    // 包含匹配（唯一命中时采用）
    const containsMatches = (PIPELINE_PHASES as readonly string[]).filter(
      (p) => p.includes(normalized),
    );
    if (containsMatches.length === 1) {
      return containsMatches[0] as PipelinePhase;
    }

    // 后缀匹配: 查找 normalized 是否为某合法值的后缀
    for (const phase of PIPELINE_PHASES) {
      if (phase.endsWith('_' + normalized) || phase.endsWith(normalized)) {
        return phase;
      }
    }

    // 常见拼写修正（硬编码扩展）
    const extraCorrections: Record<string, PipelinePhase> = {
      'planned': 'plan_pending',
      'planning': 'plan_pending',
      'plan_done': 'plan_passed',
      'plans_passed': 'plan_passed',
      'scheme_planned': 'scheme_pending',
      'scheme_done': 'scheme_passed',
      'exec': 'exec_running',
      'exec_pending': 'scheme_passed',
      'running': 'exec_running',
      'review': 'review_pending',
      'review_done': 'review_passed',
      'reviews_passed': 'review_passed',
      'testing': 'test_pending',
      'test': 'test_pending',
      'test_done': 'test_passed',
      'archive': 'archiving',
      'archived': 'done',
      'finished': 'done',
      'completed': 'done',
      'complete': 'done',
      'end': 'done',
    };
    if (extraCorrections[normalized]) {
      return extraCorrections[normalized];
    }

    return null;
  }

  /**
   * 模糊修正非法 MetaPhase 值
   * 将所有非 MetaPhase 的 pipeline.phase 默认为 'active'
   */
  private fuzzyCorrectMetaPhase(input: string): MetaPhase | null {
    const normalized = input.trim().toLowerCase();
    if ((META_PHASES as readonly string[]).includes(normalized)) {
      return normalized as MetaPhase;
    }
    // 任何 PipelinePhase 值或未知值皆默认映射为 'active'
    return 'active' as MetaPhase;
  }

  // ═══ 修复 ═══

  /**
   * 自动检测并修复 flow.json 中的常见问题
   * @param dryRun true 时仅检测不修复
   * @returns 修复结果（修改列表 + 是否从 .bak 恢复）
   */
  repair(dryRun: boolean = false): RepairResult {
    const changes: string[] = [];
    let recovered = false;

    // 尝试加载 flow.json
    if (!existsSync(this.filePath)) {
      if (dryRun) {
        changes.push('检测到 flow.json 不存在（dry-run 模式下不自动创建）');
        return { fixed: false, changes, recovered: false };
      }
      FlowManager.initFlow(this.projectPath);
      changes.push('flow.json 不存在，已创建默认 flow.json');
      return { fixed: true, changes, recovered: false };
    }

    // 尝试解析 JSON，失败时从 .bak 恢复
    let raw: string;
    try {
      raw = readFileSync(this.filePath, 'utf-8');
    } catch {
      changes.push('无法读取 flow.json');
      return { fixed: false, changes, recovered: false };
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // JSON 解析失败，尝试从 .bak 恢复
      const bakPath = this.filePath + '.bak';
      if (existsSync(bakPath)) {
        try {
          const bakContent = readFileSync(bakPath, 'utf-8');
          parsed = JSON.parse(bakContent);
          recovered = true;
          changes.push('flow.json 解析失败，已从 .bak 恢复');
        } catch {
          // .bak 也损坏，无法恢复
          if (dryRun) {
            changes.push('flow.json 和 .bak 均已损坏（dry-run 模式下不自动重建）');
            return { fixed: false, changes, recovered: false };
          }
          FlowManager.initFlow(this.projectPath);
          changes.push('flow.json 和 .bak 均已损坏，已重建默认 flow.json');
          return { fixed: true, changes, recovered: false };
        }
      } else {
        // 无 .bak，重建
        if (dryRun) {
          changes.push('flow.json 解析失败且无 .bak（dry-run 模式下不自动重建）');
          return { fixed: false, changes, recovered: false };
        }
        FlowManager.initFlow(this.projectPath);
        changes.push('flow.json 解析失败且无 .bak，已重建默认 flow.json');
        return { fixed: true, changes, recovered: false };
      }
    }

    let modified = false;

    // 加载为 FlowData 进行修复
    const flowData = parsed as Partial<FlowData>;
    const defaults = defaultFlowData();

    // 修复缺失的 meta 字段
    if (!flowData.meta) {
      flowData.meta = defaults.meta;
      changes.push('已补全缺失的 meta');
      modified = true;
    } else {
      if (!flowData.meta.version) {
        flowData.meta.version = defaults.meta.version;
        changes.push('已补全缺失的 meta.version');
        modified = true;
      }
      if (!flowData.meta.project) {
        flowData.meta.project = defaults.meta.project;
        changes.push('已补全缺失的 meta.project');
        modified = true;
      }
      if (!flowData.meta.updated) {
        flowData.meta.updated = defaults.meta.updated;
        changes.push('已补全缺失的 meta.updated');
        modified = true;
      }
    }

    // 修复缺失的 pipeline 字段
    if (!flowData.pipeline) {
      flowData.pipeline = defaults.pipeline;
      changes.push('已补全缺失的 pipeline');
      modified = true;
    } else {
      if (!flowData.pipeline.current) {
        flowData.pipeline.current = defaults.pipeline.current;
        changes.push('已补全缺失的 pipeline.current');
        modified = true;
      }
      if (typeof flowData.pipeline.retry !== 'number') {
        flowData.pipeline.retry = defaults.pipeline.retry;
        changes.push('已修正 pipeline.retry 为默认值');
        modified = true;
      }

      // 修复非标准 pipeline.phase（MetaPhase：active/paused/done）
      if (flowData.pipeline.phase) {
        const phaseResult = MetaPhaseSchema.safeParse(
          flowData.pipeline.phase,
        );
        if (!phaseResult.success) {
          const corrected = this.fuzzyCorrectMetaPhase(
            flowData.pipeline.phase as string,
          );
          if (corrected) {
            changes.push(
              `pipeline.phase '${flowData.pipeline.phase}' 已修正为 '${corrected}'`,
            );
            flowData.pipeline.phase = corrected;
            modified = true;
          } else {
            changes.push(
              `pipeline.phase '${flowData.pipeline.phase}' 无法修正，使用默认值 'active'`,
            );
            flowData.pipeline.phase = defaults.pipeline.phase;
            modified = true;
          }
        }
      } else {
        flowData.pipeline.phase = defaults.pipeline.phase;
        changes.push('已补全缺失的 pipeline.phase');
        modified = true;
      }
    }

    // 修复 stages 类型
    if (!flowData.stages || typeof flowData.stages !== 'object' || Array.isArray(flowData.stages)) {
      flowData.stages = defaults.stages;
      changes.push('已补全缺失的 stages');
      modified = true;
    } else {
      // 修复各 stage 的 phase 字段（PipelinePhase）
      for (const [stageId, stage] of Object.entries(flowData.stages)) {
        const s = stage as unknown as Record<string, unknown>;
        if (s && typeof s === 'object' && s.phase) {
          const stagePhaseResult = PipelinePhaseSchema.safeParse(s.phase);
          if (!stagePhaseResult.success) {
            const corrected = this.fuzzyCorrectPhase(s.phase as string);
            if (corrected) {
              changes.push(`stages.${stageId}.phase '${s.phase}' 已修正为 '${corrected}'`);
              s.phase = corrected;
              modified = true;
            } else {
              changes.push(`stages.${stageId}.phase '${s.phase}' 无法修正，使用默认值 'plan_pending'`);
              s.phase = 'plan_pending';
              modified = true;
            }
          }
        } else if (s && typeof s === 'object' && !s.phase) {
          s.phase = 'plan_pending';
          changes.push(`已补全缺失的 stages.${stageId}.phase`);
          modified = true;
        }
      }
    }

    // 修复 reviews 类型
    if (!Array.isArray(flowData.reviews)) {
      flowData.reviews = defaults.reviews;
      changes.push('已补全缺失的 reviews');
      modified = true;
    }

    // 修复 log 类型
    if (!Array.isArray(flowData.log)) {
      flowData.log = defaults.log;
      changes.push('已补全缺失的 log');
      modified = true;
    }

    // 写入修复后的数据
    if (modified && !dryRun) {
      // 备份当前文件
      try {
        copyFileSync(this.filePath, this.filePath + '.bak');
      } catch {
        // 备份失败不阻塞
      }

      // 使用安全写入
      const tmpPath = this.filePath + '.tmp';
      const serializable = JSON.parse(JSON.stringify(flowData)) as Record<string, unknown>;
      // 去除 op 中的 id 字段
      if (serializable.stages && typeof serializable.stages === 'object') {
        for (const stage of Object.values(serializable.stages as Record<string, Record<string, unknown>>)) {
          if (stage && typeof stage === 'object' && stage.ops) {
            for (const op of Object.values(stage.ops as Record<string, Record<string, unknown>>)) {
              if (op && typeof op === 'object') {
                delete op.id;
              }
            }
          }
        }
      }

      const content = JSON.stringify(serializable, null, 2) + '\n';
      writeFileSync(tmpPath, content, 'utf-8');

      // 校验临时文件
      try {
        const tmpContent = readFileSync(tmpPath, 'utf-8');
        JSON.parse(tmpContent);
      } catch (parseErr) {
        try {
          writeFileSync(tmpPath, '', 'utf-8');
        } catch {
          // 清理失败不阻塞
        }
        changes.push(`修复后写入校验失败: ${(parseErr as Error).message}`);
        return { fixed: false, changes, recovered };
      }

      renameSync(tmpPath, this.filePath);
    }

    if (!modified && changes.length === 0) {
      changes.push('未检测到需要修复的问题');
    }

    return { fixed: modified || recovered, changes, recovered };
  }

  // ═══ 迁移 ═══

  /**
   * 检测是否为旧版格式（全局 PipelinePhase 而非 MetaPhase）
   * 旧版：pipeline.phase 为 PipelinePhase 值（如 "exec_running"）
   * 新版：pipeline.phase 为 MetaPhase 值（"active"/"paused"/"done"）
   */
  needsMigration(): boolean {
    if (!this.data) return false;
    const phase = this.data.pipeline?.phase;
    if (!phase) return false;
    // 若 phase 是 PipelinePhase 值但非 MetaPhase 值 → 旧版
    return (PIPELINE_PHASES as readonly string[]).includes(phase as string)
      && !(META_PHASES as readonly string[]).includes(phase as string);
  }

  /**
   * 将旧版 flow.json（v4.0：全局 phase）迁移到新版格式（v4.1：阶段级 phase）
   *
   * 迁移逻辑：
   * 1. 旧 pipeline.phase 下沉到 current.stage 对应 stage → stages[stageId].phase = oldPhase
   * 2. 若 pipeline.current.stage 为 "-" 或空，下沉到第一个 stage
   * 3. stages 中已有 phase 的 stage 保持不变（不覆盖）
   * 4. stages 中无 phase 的 stage 默认设为 "done"，但 current.stage 对应 stage 除外
   * 5. 全局 pipeline.phase 改为 "active"（若旧 phase 为 "done" 则改为 "done"）
   *
   * @param dryRun 仅检测预览，不实际写入
   * @param noBackup 跳过 .bak 备份
   * @returns 迁移结果
   */
  migrate(dryRun: boolean = false, noBackup: boolean = false): { migrated: boolean; changes: string[] } {
    const changes: string[] = [];

    if (!this.data) {
      changes.push('flow.json 未加载，无法迁移');
      return { migrated: false, changes };
    }

    // 已是新版格式
    if (!this.needsMigration()) {
      changes.push('已是新版格式，无需迁移');
      return { migrated: false, changes };
    }

    const oldPhase = this.data.pipeline.phase as unknown as string;
    const currentStageId = this.data.pipeline.current?.stage || '-';
    const stageEntries = Object.entries(this.data.stages);

    changes.push(`检测到旧版格式: pipeline.phase="${oldPhase}"`);

    // ── 备份旧文件 ──
    if (!dryRun && !noBackup) {
      const bakPath = this.filePath + '.v4.0.bak';
      try {
        copyFileSync(this.filePath, bakPath);
        changes.push(`已备份旧文件: flow.json.v4.0.bak`);
      } catch (e) {
        changes.push(`备份失败: ${(e as Error).message}`);
        return { migrated: false, changes };
      }
    }

    // dry-run 模式下使用数据副本，避免修改原始内存状态
    const targetData = dryRun ? JSON.parse(JSON.stringify(this.data)) as FlowData : this.data;

    // ── 遍历 stages，为每个没有 phase 的 stage 分配 phase ──
    for (const [stageId, stage] of Object.entries(targetData.stages)) {
      // 已有 phase 的 stage 跳过，不覆盖
      if (stage.phase !== undefined) {
        changes.push(`  ${stageId}: 已有 phase="${stage.phase}"，跳过`);
        continue;
      }

      // 当前 stage → 下沉旧的 phase
      if (stageId === currentStageId && currentStageId !== '-') {
        (stage as StageData).phase = oldPhase as PipelinePhase;
        changes.push(`  ${stageId}: ← 下沉旧 phase="${oldPhase}"`);
      } else {
        (stage as StageData).phase = 'done' as PipelinePhase;
        changes.push(`  ${stageId}: ← 设为 "done"`);
      }
    }

    // 若 current.stage 为 "-" 或空，下沉到第一个 stage
    if (currentStageId === '-' || !currentStageId) {
      const targetEntries = Object.entries(targetData.stages);
      const firstEntry = targetEntries[0];
      if (firstEntry) {
        const [firstStageId, firstStageData] = firstEntry;
        firstStageData.phase = oldPhase as PipelinePhase;
        changes.push(`  ${firstStageId}: ← (current.stage 为空) 下沉旧 phase="${oldPhase}"`);
      }
    }

    // ── 更新全局 phase ──
    const newMetaPhase: MetaPhase = oldPhase === 'done' ? 'done' : 'active';
    targetData.pipeline.phase = newMetaPhase;
    changes.push(`全局 pipeline.phase: "${oldPhase}" → "${newMetaPhase}"`);

    // ── 追加迁移日志 ──
    if (!dryRun) {
      this.appendLog({
        time: '',
        agent: 'flow-manager',
        action: 'migrate_v4.0_to_v4.1',
        detail: {
          oldPhase,
          newMetaPhase,
          currentStage: currentStageId,
          stagesUpdated: stageEntries.filter(([_, s]) => s.phase !== undefined).length,
        },
      });
    }

    return { migrated: true, changes };
  }

  // ═══ 健康检查 ═══

  /**
   * 全面健康检查
   * 检查 flow.json、跨文件一致性、僵尸状态、config.yaml、pipeline.yaml、deps.yaml
   * @param quick true 时仅检查关键项（phase/current 合法性）
   */
  healthCheck(quick: boolean = false): HealthCheckResult {
    const items: HealthCheckItem[] = [];

    // ── 1. flow.json 合法性 ──
    this.checkFlowJson(items);

    // ── 2. 跨文件一致性 ──
    if (!quick) {
      this.checkCrossFileConsistency(items);
    }

    // ── 3. 僵尸状态检测 ──
    if (!quick) {
      this.checkZombieStates(items);
    }

    // ── 4. config.yaml 有效性 ──
    if (!quick) {
      this.checkConfigYaml(items);
    }

    // ── 5. pipeline.yaml 合法性 ──
    if (!quick) {
      this.checkPipelineYaml(items);
    }

    // ── 6. deps.yaml 循环依赖检测 ──
    if (!quick) {
      this.checkDepsYaml(items);
    }

    const ok = items.every((i) => i.status !== 'fail');
    return { items, ok };
  }

  /** 1. 检查 flow.json 合法性 */
  private checkFlowJson(items: HealthCheckItem[]): void {
    const fp = resolve(this.projectPath, '.openfeel', 'flow.json');
    if (!existsSync(fp)) {
      items.push({ section: 'flow.json', status: 'fail', message: 'flow.json 不存在' });
      return;
    }

    // JSON 可解析
    try {
      const raw = readFileSync(fp, 'utf-8');
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') {
        items.push({ section: 'flow.json', status: 'fail', message: 'flow.json JSON 解析后不是有效对象' });
        return;
      }
    } catch (e) {
      items.push({ section: 'flow.json', status: 'fail', message: `flow.json 解析失败: ${(e as Error).message}` });
      return;
    }

    // 数据已加载时检查内部字段
    if (!this.data) {
      items.push({ section: 'flow.json', status: 'warn', message: 'flow.json 可解析但 FlowManager 未加载数据' });
      return;
    }

    // pipeline.phase 合法性（MetaPhase：active/paused/done）
    const metaPhase = this.data.pipeline?.phase;
    if (!metaPhase) {
      items.push({ section: 'flow.json', status: 'fail', message: 'pipeline.phase 缺失' });
    } else {
      const phaseResult = MetaPhaseSchema.safeParse(metaPhase);
      if (!phaseResult.success) {
        items.push({ section: 'flow.json', status: 'fail', message: `pipeline.phase="${metaPhase}" 不是合法 MetaPhase 枚举值（active/paused/done）` });
      } else {
        items.push({ section: 'flow.json', status: 'pass', message: `pipeline.phase=${metaPhase}，合法` });
      }
    }

    // current 指向的 stage/op 是否存在
    const cur = this.data.pipeline?.current;
    if (cur?.stage && cur?.op) {
      const stage = this.data.stages[cur.stage];
      if (!stage) {
        items.push({ section: 'flow.json', status: 'fail', message: `current 指向不存在的 stage: ${cur.stage}` });
      } else if (!stage.ops[cur.op]) {
        items.push({ section: 'flow.json', status: 'fail', message: `current 指向不存在的 op: ${cur.stage}.${cur.op}` });
      } else {
        items.push({ section: 'flow.json', status: 'pass', message: `current=${cur.stage}.${cur.op}，存在` });
      }
    }

    // 各 stage phase 合法性（PipelinePhase）
    if (this.data.stages) {
      for (const [stageId, stage] of Object.entries(this.data.stages)) {
        if (!stage.phase) {
          items.push({ section: 'flow.json', status: 'warn', message: `${stageId}.phase 缺失` });
        } else {
          const stagePhaseResult = PipelinePhaseSchema.safeParse(stage.phase);
          if (!stagePhaseResult.success) {
            items.push({ section: 'flow.json', status: 'fail', message: `${stageId}.phase="${stage.phase}" 不是合法 PipelinePhase 枚举值` });
          } else {
            items.push({ section: 'flow.json', status: 'pass', message: `${stageId}.phase=${stage.phase}，合法` });
          }
        }
      }
    }
  }

  /** 2. 检查 flow.json 与 plan/{stage}/status.md 跨文件一致性 */
  private checkCrossFileConsistency(items: HealthCheckItem[]): void {
    if (!this.data) {
      return;
    }

    const planDir = resolve(this.projectPath, '.openfeel', 'plan');

    // 同时检查 .openfeel/stages/ 目录（代码实际使用路径）
    const stagesDir = resolve(this.projectPath, '.openfeel', 'stages');

    let total = 0;
    let consistent = 0;

    for (const [stageId, stage] of Object.entries(this.data.stages)) {
      // 尝试 .openfeel/stages/{stageId}/status.md（代码实际路径）
      let statusPath = resolve(stagesDir, stageId, 'status.md');
      if (!existsSync(statusPath)) {
        // 回退到 .openfeel/plan/{stageId}/status.md（文档声明路径）
        statusPath = resolve(planDir, stageId, 'status.md');
        if (!existsSync(statusPath)) {
          continue;
        }
      }

      total++;
      try {
        const content = readFileSync(statusPath, 'utf-8');
        // 查找状态行：**状态**：planned
        const statusMatch = content.match(/\*\*状态\*\*[：:]\s*(\w+)/);
        if (statusMatch) {
          const fileStatus = statusMatch[1];
          if (fileStatus === stage.status) {
            consistent++;
          } else {
            items.push({ section: '跨文件一致性', status: 'warn', message: `${stageId}: flow.json 状态="${stage.status}"，status.md 状态="${fileStatus}"` });
          }
        }
      } catch {
        items.push({ section: '跨文件一致性', status: 'warn', message: `${stageId}: 无法读取 status.md` });
      }
    }

    if (total > 0) {
      if (consistent === total) {
        items.push({ section: '跨文件一致性', status: 'pass', message: `一致 (${consistent}/${total} stages)` });
      } else {
        items.push({ section: '跨文件一致性', status: 'warn', message: `${consistent}/${total} stages 一致` });
      }
    }
  }

  /** 3. 僵尸状态检测 */
  private checkZombieStates(items: HealthCheckItem[]): void {
    if (!this.data) {
      return;
    }

    // 僵尸阶段检测：各 stage 在 status.md 中声明的状态与 stage.status 不一致
    const planDir = resolve(this.projectPath, '.openfeel', 'plan');
    const stagesDir = resolve(this.projectPath, '.openfeel', 'stages');

    for (const [stageId, stage] of Object.entries(this.data.stages)) {
      // 所有 REV 已 closed 但 stage 仍为 review_failed
      if (stage.status === 'review_failed') {
        const stageReviews = this.data.reviews.filter((r) => r.op.startsWith(stageId));
        const allClosed = stageReviews.length > 0 && stageReviews.every((r) => r.status === 'closed');
        if (allClosed) {
          items.push({ section: '僵尸状态', status: 'warn', message: `${stageId}: 所有 REV 已 closed 但 stage 仍为 review_failed` });
        }
      }

      // 所有 BUG 已 closed 但 stage 仍为 bug_found
      // 注：当前 flow.json 中无独立 bugs 数据结构，且 Bug 文件按 users/{username}/bugs/{module}/ 组织
      // （非按 stage 组织），无法通过 stageId 前缀过滤。Bug 僵尸检测待 flow.json 增加 bugs 字段后完善。
      if (stage.status === 'bug_found') {
        // 僵尸 Bug 检测已延迟：需待 bugs 数据结构在 flow.json 中正式化
        // 届时可在此处遍历 this.data.bugs 检查是否有 open 状态的 bug
      }
    }

    // 确保至少有一条反馈
    const zombieEntries = items.filter((i) => i.section === '僵尸状态');
    if (zombieEntries.length === 0) {
      items.push({ section: '僵尸状态', status: 'pass', message: '未检测到僵尸状态' });
    }
  }

  /** 4. 检查 config.yaml 有效性 */
  private checkConfigYaml(items: HealthCheckItem[]): void {
    const configPath = resolve(this.projectPath, '.openfeel', 'config.yaml');
    if (!existsSync(configPath)) {
      items.push({ section: 'config.yaml', status: 'warn', message: 'config.yaml 不存在（可选文件）' });
      return;
    }

    try {
      const raw = readFileSync(configPath, 'utf-8');
      const parsed = parseYaml(raw);

      // 不必检查具体字段，仅检查基本结构
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        items.push({ section: 'config.yaml', status: 'fail', message: 'config.yaml 可解析但不是有效对象' });
        return;
      }

      items.push({ section: 'config.yaml', status: 'pass', message: '可解析，结构合法' });
    } catch (e) {
      items.push({ section: 'config.yaml', status: 'fail', message: `config.yaml 解析失败: ${(e as Error).message}` });
    }
  }

  /** 5. 检查 pipeline.yaml 合法性 */
  private checkPipelineYaml(items: HealthCheckItem[]): void {
    const pipelinePath = resolve(this.projectPath, '.openfeel', 'pipeline.yaml');
    if (!existsSync(pipelinePath)) {
      // pipeline.yaml 非必须，不存在也视为通过
      return;
    }

    try {
      const raw = readFileSync(pipelinePath, 'utf-8');
      const parsed = parseYaml(raw);

      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        items.push({ section: 'pipeline.yaml', status: 'fail', message: 'pipeline.yaml 可解析但不是有效对象' });
        return;
      }

      // 通过 Zod Schema 校验
      try {
        PipelineConfigSchema.parse(parsed);
        items.push({ section: 'pipeline.yaml', status: 'pass', message: '可解析，通过 Schema 校验' });
      } catch {
        items.push({ section: 'pipeline.yaml', status: 'fail', message: 'pipeline.yaml 未通过 Schema 校验（可能缺少 phases/transitions/checkpoint_mapping 字段）' });
      }
    } catch (e) {
      items.push({ section: 'pipeline.yaml', status: 'fail', message: `pipeline.yaml 解析失败: ${(e as Error).message}` });
    }
  }

  /** 6. deps.yaml 循环依赖检测（拓扑排序法） */
  private checkDepsYaml(items: HealthCheckItem[]): void {
    const depsPath = resolve(this.projectPath, '.openfeel', 'plan', 'deps.yaml');
    if (!existsSync(depsPath)) {
      return; // deps.yaml 非必须
    }

    try {
      const raw = readFileSync(depsPath, 'utf-8');
      const parsed = parseYaml(raw);

      if (!parsed || typeof parsed !== 'object') {
        items.push({ section: 'deps.yaml', status: 'fail', message: 'deps.yaml 可解析但不是有效对象' });
        return;
      }

      // 构建依赖图：{ stageId: string[] } 在 stages 键下
      const stages = (parsed as Record<string, unknown>).stages;
      if (!stages || typeof stages !== 'object' || Array.isArray(stages)) {
        // deps.yaml 可能以 stages 键组织，也可能直接是键值对
        // 尝试直接使用 parsed 作为图
        const graph = this.buildDepsGraph(parsed as Record<string, unknown>);
        this.detectCycles(graph, items);
        return;
      }

      const graph = this.buildDepsGraph(stages as Record<string, unknown>);
      this.detectCycles(graph, items);
    } catch (e) {
      items.push({ section: 'deps.yaml', status: 'fail', message: `deps.yaml 解析失败: ${(e as Error).message}` });
    }
  }

  /** 从 YAML 解析后的对象中提取依赖图（{ node: deps[] }） */
  private buildDepsGraph(data: Record<string, unknown>): Record<string, string[]> {
    const graph: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const node = value as Record<string, unknown>;
        if (Array.isArray(node.deps)) {
          graph[key] = node.deps.map((d) => String(d));
        } else if (typeof node.depends_on === 'string') {
          graph[key] = [node.depends_on];
        }
      }
    }
    return graph;
  }

  /** DFS 检测有向图中的环 */
  private detectCycles(graph: Record<string, string[]>, items: HealthCheckItem[]): void {
    const nodes = Object.keys(graph);
    if (nodes.length === 0) {
      items.push({ section: 'deps.yaml', status: 'pass', message: '无依赖声明，无环' });
      return;
    }

    const WHITE = 0; // 未访问
    const GRAY = 1;  // 访问中（当前路径上）
    const BLACK = 2; // 已完成

    const color = new Map<string, number>();
    for (const node of nodes) {
      color.set(node, WHITE);
    }

    const cycles: string[] = [];

    const dfs = (node: string, path: string[]): boolean => {
      color.set(node, GRAY);
      // 不存在的节点引用视为合法（硬依赖但未在 stages 中声明）
      for (const dep of (graph[node] ?? [])) {
        if (!color.has(dep)) {
          continue; // 引用不存在的节点，跳过
        }
        const depColor = color.get(dep)!;
        if (depColor === GRAY) {
          // 找到环
          const cycleStart = path.indexOf(dep);
          const cycle = [...path.slice(cycleStart), dep].join(' → ');
          cycles.push(cycle);
          return true;
        }
        if (depColor === WHITE) {
          if (dfs(dep, [...path, dep])) {
            return true;
          }
        }
      }
      color.set(node, BLACK);
      return false;
    };

    for (const node of nodes) {
      if (color.get(node) === WHITE) {
        dfs(node, [node]);
      }
    }

    if (cycles.length > 0) {
      for (const cycle of cycles) {
        items.push({ section: 'deps.yaml', status: 'fail', message: `循环依赖检测: ${cycle}` });
      }
    } else {
      items.push({ section: 'deps.yaml', status: 'pass', message: `无循环依赖 (${nodes.length} 个节点)` });
    }
  }

  // ═══ 初始化 ═══

  /** 初始化 flow.json（创建默认模板） */
  static initFlow(projectPath: string): void {
    const dirPath = resolve(projectPath, '.openfeel');
    // 确保 .openfeel/ 目录存在
    if (!existsSync(dirPath)) {
      mkdirSync(dirPath, { recursive: true });
    }
    const filePath = resolve(dirPath, 'flow.json');
    if (existsSync(filePath)) {
      return; // 已存在则不覆盖
    }
    const data = defaultFlowData();
    writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  }

  /**
   * 内嵌数据（仅供测试使用）
   * 直接设置 flow 数据而不从文件加载
   */
  setData(data: FlowData): void {
    this.data = data;
  }

  // ═══ 流水线配置加载 ═══

  /**
   * 从 .openfeel/pipeline.yaml 加载流水线配置
   * 若文件不存在或解析失败，回退到内置默认值
   */
  private loadPipelineConfig(): void {
    const pipelinePath = resolve(this.projectPath, '.openfeel', 'pipeline.yaml');
    try {
      if (!existsSync(pipelinePath)) {
        this.pipelineConfig = this.getDefaultPipelineConfig();
        return;
      }
      const raw = readFileSync(pipelinePath, 'utf-8');
      const parsed = parseYaml(raw);
      this.pipelineConfig = PipelineConfigSchema.parse(parsed);
    } catch {
      // 解析失败时回退到内置默认值
      this.pipelineConfig = this.getDefaultPipelineConfig();
    }
  }

  /**
   * 获取内置默认流水线配置（等价于硬编码常量 + 3 个 Bug 修复）
   * 当 pipeline.yaml 不存在或解析失败时使用
   */
  private getDefaultPipelineConfig(): PipelineConfig {
    return {
      phases: [
        'plan_pending', 'plan_review', 'plan_passed',
        'scheme_pending', 'scheme_review', 'scheme_passed',
        'exec_running', 'review_pending', 'review_failed',
        'review_passed', 'test_pending', 'test_failed',
        'test_passed', 'archiving', 'done',
      ],
      transitions: {
        plan_pending: ['plan_review', 'plan_passed'],
        plan_review: ['plan_passed', 'plan_pending'],
        plan_passed: ['scheme_pending'],
        scheme_pending: ['scheme_review', 'scheme_passed'],
        scheme_review: ['scheme_passed', 'scheme_pending'],
        scheme_passed: ['exec_running'],
        exec_running: ['review_pending', 'scheme_pending'],       // BUG 修复：增加 scheme_pending
        review_pending: ['review_failed', 'review_passed'],
        review_failed: ['review_pending', 'scheme_pending'],      // BUG 修复：增加 scheme_pending
        review_passed: ['test_pending'],
        test_pending: ['test_failed', 'test_passed'],
        test_failed: ['test_pending', 'scheme_pending'],          // BUG 修复：增加 scheme_pending
        test_passed: ['archiving'],
        archiving: ['done'],
        done: [],
      },
      checkpoint_mapping: {
        plan: 'plan',
        scheme: 'scheme',
        exec: 'exec',
        review: 'review',
        test: 'test',
        archive: 'archive',
      },
      phase_corrections: {
        completed: 'done',
        finished: 'done',
        archived: 'done',
        pending: 'plan_pending',
      },
    };
  }
}

// ── 辅助函数 ──

/**
 * 将 PipelinePhase 映射为 stage 状态
 * @param phase 流水线阶段
 * @param currentStatus 当前 stage 状态（用于不做变更的 phase）
 * @param testEnabled 是否启用测试（false 时 review_passed 直接映射为 done）
 * @returns stage 状态字符串
 */
export function mapPhaseToStageStatus(
  phase: PipelinePhase,
  currentStatus: string,
  testEnabled: boolean = true,
): string {
  switch (phase) {
    case 'review_failed':
      return 'review_failed';
    case 'review_passed':
      return testEnabled ? 'review_passed' : 'done';
    case 'test_passed':
      return 'done';
    case 'archiving':
      return 'done';
    case 'done':
      return 'done';
    default:
      // 其他阶段保持 stage 当前状态不变
      return currentStatus;
  }
}
