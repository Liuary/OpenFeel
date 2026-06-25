/**
 * FlowManager — 流水线状态管理核心类
 * 负责 flow.json 的读写、状态推进、重试计数、审查管理、日志记录与校验。
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

// ── 类型定义 ──

/** 流水线阶段枚举 */
export type PipelinePhase =
  | 'plan_pending'
  | 'plan_review'
  | 'plan_passed'
  | 'scheme_pending'
  | 'scheme_review'
  | 'scheme_passed'
  | 'exec_running'
  | 'review_pending'
  | 'review_failed'
  | 'review_passed'
  | 'test_pending'
  | 'test_failed'
  | 'test_passed'
  | 'archiving'
  | 'done';

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
}

/** 日志条目 */
export interface LogEntry {
  time: string;
  agent: string;
  action: string;
  detail: Record<string, unknown>;
}

/** Flow 完整数据结构 */
export interface FlowData {
  meta: { version: string; project: string; updated: string };
  pipeline: { phase: PipelinePhase; current: { stage: string; op: string }; retry: number };
  stages: Record<string, { name: string; status: string; deps: string[]; ops: Record<string, Op> }>;
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

/** 校验结果 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
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
      phase: 'plan_pending',
      current: { stage: '', op: '' },
      retry: 0,
    },
    stages: {},
    reviews: [],
    log: [],
  };
}

/** 合法的 phase 流转映射 */
const VALID_TRANSITIONS: Record<PipelinePhase, PipelinePhase[]> = {
  plan_pending: ['plan_review', 'plan_passed'],
  plan_review: ['plan_passed', 'plan_pending'],
  plan_passed: ['scheme_pending'],
  scheme_pending: ['scheme_review', 'scheme_passed'],
  scheme_review: ['scheme_passed', 'scheme_pending'],
  scheme_passed: ['exec_running'],
  exec_running: ['review_pending'],
  review_pending: ['review_failed', 'review_passed'],
  review_failed: ['review_pending'],
  review_passed: ['test_pending'],
  test_pending: ['test_failed', 'test_passed'],
  test_failed: ['test_pending'],
  test_passed: ['archiving'],
  archiving: ['done'],
  done: [],
};

/** phase 前缀到 checkpoint 字段的映射 */
const PHASE_TO_CHECKPOINT: Record<string, keyof Checkpoints> = {
  plan: 'plan',
  scheme: 'scheme',
  exec: 'exec',
  review: 'review',
  test: 'test',
};

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

  constructor(projectPath: string) {
    this.projectPath = projectPath;
    this.data = null;
    this.filePath = resolve(projectPath, '.openfeel', 'flow.json');
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

    writeFileSync(this.filePath, JSON.stringify(serializable, null, 2) + '\n', 'utf-8');
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

  /** 获取当前流水线阶段 */
  getPhase(): PipelinePhase | null {
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

    const lines: string[] = [
      'OpenFeel 流水线状态',
      `当前阶段: ${this.data.pipeline.phase}`,
      `当前操作: ${this.data.pipeline.current.stage ? `${this.data.pipeline.current.stage}.${this.data.pipeline.current.op}` : '(无)'}`,
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

  // ═══ 推进 ═══

  /**
   * 推进流水线阶段
   * @param opId 操作 ID（格式 "stage-xx.op-xxx"）
   * @param to 目标流水线阶段
   */
  advancePhase(opId: string, to: PipelinePhase): void {
    if (!this.data) {
      return;
    }

    const op = this.getOp(opId);
    if (!op) {
      return;
    }

    const parts = this.parseOpId(opId);
    if (!parts) {
      return;
    }

    // 保存推进前的状态（REV-001: 日志需要旧 phase 值）
    const fromPhase = this.data.pipeline.phase;
    const prevStage = this.data.pipeline.current.stage;
    const prevOp = this.data.pipeline.current.op;

    // 更新 pipeline 状态
    this.data.pipeline.phase = to;
    this.data.pipeline.current = { stage: parts.stageId, op: parts.opLocalId };

    // REV-002: 切换到新操作时重置重试计数
    if (prevStage !== parts.stageId || prevOp !== parts.opLocalId) {
      this.data.pipeline.retry = 0;
    }

    // 根据目标 phase 更新对应的 checkpoint
    const checkpointKey = this.getCheckpointFromPhase(to);
    if (checkpointKey) {
      if (checkpointKey === 'exec') {
        // exec 检查点需要更新 self 字段
        if (to === 'exec_running') {
          op.checkpoints.exec.self = 'running';
        }
      } else {
        // 以 passed/failed 结尾的阶段更新对应检查点
        if (to.endsWith('_passed')) {
          (op.checkpoints as unknown as Record<string, string>)[checkpointKey] = 'passed';
        } else if (to.endsWith('_failed')) {
          (op.checkpoints as unknown as Record<string, string>)[checkpointKey] = 'failed';
        } else {
          // 中间状态设为 pending 对应的变体
          (op.checkpoints as unknown as Record<string, string>)[checkpointKey] = 'pending';
        }
      }
    }

    // 追加日志（from 使用推进前的阶段值）
    this.appendLog({
      time: '',
      agent: 'flow-manager',
      action: 'advance_phase',
      detail: { opId, from: fromPhase, to },
    });
  }

  /** 从 PipelinePhase 提取对应的 checkpoint 字段名 */
  private getCheckpointFromPhase(phase: PipelinePhase): keyof Checkpoints | null {
    const prefix = phase.split('_')[0];
    return PHASE_TO_CHECKPOINT[prefix] ?? null;
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
   * 校验 phase 流转是否合法
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

    // 检查从当前 phase 到目标 phase 的流转是否合法
    const currentPhase = this.data.pipeline.phase;
    const validTargets = VALID_TRANSITIONS[currentPhase];
    if (!validTargets.includes(to)) {
      return false;
    }

    return true;
  }

  /**
   * 校验 flow.json 格式合法性
   * 检查必填字段是否存在
   */
  validate(): ValidationResult {
    const errors: string[] = [];

    if (!this.data) {
      errors.push('flow.json 未加载或不存在');
      return { valid: false, errors };
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
    if (!this.data.pipeline?.current) {
      errors.push('pipeline.current 缺失');
    }

    // 检查 stages 是否为对象
    if (typeof this.data.stages !== 'object' || this.data.stages === null) {
      errors.push('stages 不是有效对象');
    }

    // 检查 reviews 是否为数组
    if (!Array.isArray(this.data.reviews)) {
      errors.push('reviews 不是有效数组');
    }

    // 检查 log 是否为数组
    if (!Array.isArray(this.data.log)) {
      errors.push('log 不是有效数组');
    }

    return { valid: errors.length === 0, errors };
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
}
