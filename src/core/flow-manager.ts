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
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, readdirSync, unlinkSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { execSync } from 'node:child_process';
import { parse as parseYaml } from 'yaml';
import {
  PipelineConfigSchema,
  PipelinePhaseSchema,
  PIPELINE_PHASES,
  MetaPhaseSchema,
  META_PHASES,
  transitionKeyMatches,
  type PipelineConfig,
  type PipelinePhase,
  type MetaPhase,
  type StageStats,
} from './pipeline-schema.js';
import { PublicLogger, formatDate } from './public-logger.js';
import { t, getCliLang } from './i18n.js';
export { type PipelinePhase, type MetaPhase, type StageStats } from './pipeline-schema.js';
import { findStageStatusPath, findStageDirConflict, parseStageId } from './plan/path.js';
import { atomicWriteFileSync } from './fs/atomic-write.js';
import { withFileLock, projectLockPath } from './fs/file-lock.js';

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
  /** openfeel-reviewer 认为可直接修复时设为 true，跳过 openfeel-schemer 重新规划 */
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
  meta: { version: string; project: string; updated: string; revision?: number };
  pipeline: { phase: MetaPhase; current: { stage: string; op: string }; retry: number };
  stages: Record<string, StageData>;
  reviews: ReviewItem[];
  log: LogEntry[];
}

/** flow.json 乐观并发冲突：磁盘 revision 与本次加载时不一致（存在并发写入） */
export class FlowConcurrentModificationError extends Error {
  /** 本次实例加载时的 revision */
  readonly expectedRevision: number;
  /** 锁内读到的磁盘当前 revision */
  readonly actualRevision: number;

  constructor(expected: number, actual: number) {
    super(`flow.json 并发冲突：期望 revision=${expected}，磁盘为 ${actual}（已被其它进程修改）`);
    this.name = 'FlowConcurrentModificationError';
    this.expectedRevision = expected;
    this.actualRevision = actual;
  }
}

/** 判断错误是否为 flow.json 并发冲突（供命令层统一识别） */
export function isFlowConcurrentError(err: unknown): err is FlowConcurrentModificationError {
  return err instanceof FlowConcurrentModificationError
    || (typeof err === 'object' && err !== null && (err as { name?: string }).name === 'FlowConcurrentModificationError');
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

/** 阶段可移除性检查结果（供 removeStage 与 flow stage remove --dry-run 共用，REV-005） */
export interface RemovalCheck {
  /** 是否允许移除（force=true 且阶段存在时恒 true） */
  ok: boolean;
  /** ok=false 时的拒绝原因（中文，供 CLI 直接展示） */
  reason?: string;
  /** 阶段 ops 数量 */
  opCount: number;
  /** 是否为 pipeline.current.stage */
  isCurrent: boolean;
  /** 引用该阶段的其它阶段（flow.json.stages[].deps 命中者，REV-004） */
  referencing: string[];
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
      revision: 0,
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

/** 从 FlowData 提取 revision（缺失/非整数 → 0，兼容存量文件） */
function extractRevision(data: FlowData | null): number {
  const rev = data?.meta?.revision;
  return typeof rev === 'number' && Number.isInteger(rev) ? rev : 0;
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
  /** 本次实例加载（或最近一次成功 save）时的 flow.json revision，用于乐观并发校验 */
  private loadedRevision = 0;
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
      this.loadedRevision = 0;
      return;
    }
    try {
      const raw = readFileSync(this.filePath, 'utf-8');
      this.data = JSON.parse(raw) as FlowData;
      // 记录加载基线 revision（缺失/非法视为 0，兼容存量文件）
      this.loadedRevision = extractRevision(this.data);
      // 从 stages 的键名恢复 op 的 id 字段（运行时便利字段，磁盘不存储）
      if (this.data && this.data.stages) {
        for (const [, stage] of Object.entries(this.data.stages)) {
          // 类型守卫：仅当 ops 为普通对象时才遍历（跳过 null/undefined/数组）
          if (stage.ops && typeof stage.ops === 'object' && !Array.isArray(stage.ops)) {
            for (const [opKey, op] of Object.entries(stage.ops)) {
              op.id = opKey;
            }
          }
        }
      }
    } catch {
      this.data = null;
      this.loadedRevision = 0;
    }
  }

  /** 保存 flow.json（自动更新 meta.updated；锁内做乐观并发校验、备份旧版本并原子写） */
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

    const lockPath = projectLockPath(this.projectPath, 'flow');
    try {
      withFileLock(lockPath, () => {
        // 乐观并发校验：锁内读磁盘 revision，与加载时比对；不一致说明有并发写，拒绝覆盖
        const diskRevision = this.readDiskRevision();
        if (diskRevision !== this.loadedRevision) {
          throw new FlowConcurrentModificationError(this.loadedRevision, diskRevision);
        }
        const nextRevision = this.loadedRevision + 1;
        serializable.meta.revision = nextRevision;

        // S5：写前复制旧文件为 .bak；写成功后不覆盖 .bak，使其始终保留上一版本
        const content = JSON.stringify(serializable, null, 2) + '\n';
        atomicWriteFileSync(this.filePath, content, { backup: true });

        // 同步内存与加载基线，避免同实例连续 save 误判冲突
        this.data!.meta.revision = nextRevision;
        this.loadedRevision = nextRevision;
      });
    } catch (err) {
      console.error(`[ERROR] flow.json 保存失败: ${err instanceof Error ? err.message : err}`);
      throw err;
    }
  }

  /** 读取磁盘当前 revision（不存在/损坏/缺失 → 0，兼容存量文件） */
  private readDiskRevision(): number {
    try {
      const raw = readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as { meta?: { revision?: unknown } };
      const rev = parsed?.meta?.revision;
      return typeof rev === 'number' && Number.isInteger(rev) ? rev : 0;
    } catch {
      // 文件不存在或损坏：视为 0（首次写入 / 由 repair 兜底）
      return 0;
    }
  }

  /** 数据是否已加载 */
  isLoaded(): boolean {
    return this.data !== null;
  }

  // ═══ Checkpoint 快照 ═══

  /** 快照保留上限：超过该数量自动清理最旧的 */
  private static readonly CHECKPOINT_MAX_KEEP = 20;

  /**
   * 保存 flow.json 快照到 .openfeel/checkpoints/
   * 命名格式: {stageId}-{yyyyMMddTHHmmss}-{phase}.json
   * 保留最近 CHECKPOINT_MAX_KEEP 个快照，超出自动清理最旧的。
   * try-catch 包裹：快照失败不阻塞 phase 推进（调用方保证）。
   * @param stageId 阶段 ID（如 v5.3-stage-01）
   * @param phase 推进后的目标 phase（如 exec_running）
   */
  saveCheckpoint(stageId: string, phase: PipelinePhase): void {
    try {
      if (!this.data) {
        return;
      }
      const dir = resolve(this.projectPath, '.openfeel', 'checkpoints');
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      // 序列化时去除 op 中的 id 字段（与 save() 保持一致）
      const serializable = JSON.parse(JSON.stringify(this.data)) as FlowData;
      for (const stage of Object.values(serializable.stages)) {
        for (const op of Object.values(stage.ops)) {
          delete (op as unknown as Record<string, unknown>).id;
        }
      }

      const timestamp = this.formatCheckpointTimestamp(new Date());
      const filename = `${stageId}-${timestamp}-${phase}.json`;
      const filePath = resolve(dir, filename);
      // REV-003：快照唯一文件名 + best-effort，原子写防半写；不接全局锁（避免长序列化纳入临界区）
      atomicWriteFileSync(filePath, JSON.stringify(serializable, null, 2) + '\n');

      // 清理超限的最旧快照
      this.cleanupCheckpoints(stageId);
    } catch {
      // 快照失败静默跳过，不阻塞 phase 推进
    }
  }

  /**
   * 列出 Checkpoint 快照文件名（按时间升序）
   * @param stageId 可选阶段 ID，提供时仅列出该阶段的快照
   * @returns 快照文件名列表，目录不存在或读取失败时返回空数组
   */
  listCheckpoints(stageId?: string): string[] {
    try {
      const dir = resolve(this.projectPath, '.openfeel', 'checkpoints');
      if (!existsSync(dir)) {
        return [];
      }
      return readdirSync(dir)
        .filter((f) => f.endsWith('.json') && (!stageId || f.startsWith(stageId + '-')))
        .sort();
    } catch {
      return [];
    }
  }

  /**
   * 从 Checkpoint 快照恢复 flow.json
   * 恢复前将当前 flow.json 备份为 .bak；恢复成功后重新加载数据。
   * @param filename 快照文件名（仅允许纯文件名，防路径穿越）
   * @returns 是否恢复成功
   */
  restoreCheckpoint(filename: string): boolean {
    // 安全校验：拒绝含路径分隔符或 '..' 的文件名，防止路径穿越
    if (!filename || filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
      return false;
    }
    try {
      const dir = resolve(this.projectPath, '.openfeel', 'checkpoints');
      const filePath = resolve(dir, filename);
      if (!existsSync(filePath)) {
        return false;
      }
      const content = readFileSync(filePath, 'utf-8');
      // 校验快照 JSON 合法性，非法内容拒绝恢复
      JSON.parse(content);

      const lockPath = projectLockPath(this.projectPath, 'flow');
      let conflict = false;
      withFileLock(lockPath, () => {
        // 乐观并发校验：磁盘被并发修改时拒绝恢复，防止覆盖他人写入
        const diskRevision = this.readDiskRevision();
        if (diskRevision !== this.loadedRevision) {
          conflict = true;
          return;
        }
        // 快照 revision 重定基为 diskRevision+1，保证单调递增
        const restored = JSON.parse(content) as FlowData;
        restored.meta.revision = diskRevision + 1;
        const restoredContent = JSON.stringify(restored, null, 2) + '\n';
        // REV-002：与 save() 同锁、同 S5 语义（写前复制旧文件为 .bak，写后不覆盖）
        atomicWriteFileSync(this.filePath, restoredContent, { backup: true });
      });
      if (conflict) {
        console.warn('[WARN] flow.json 已被其它进程修改，拒绝从快照恢复（请重新加载后重试）');
        return false;
      }

      this.load();
      return true;
    } catch {
      return false;
    }
  }

  /** 格式化快照时间戳: yyyyMMddTHHmmssSSS（毫秒级，避免同秒多次推进覆盖快照） */
  private formatCheckpointTimestamp(date: Date): string {
    const pad = (n: number): string => String(n).padStart(2, '0');
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
      `T${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}` +
      `${String(date.getMilliseconds()).padStart(3, '0')}`;
  }

  /**
   * 清理超限快照：按文件名（含时间戳）升序，删除最旧的直至不超过 CHECKPOINT_MAX_KEEP
   * @param stageId 阶段 ID，仅清理该阶段的快照
   */
  private cleanupCheckpoints(stageId: string): void {
    try {
      const dir = resolve(this.projectPath, '.openfeel', 'checkpoints');
      if (!existsSync(dir)) {
        return;
      }
      const entries = readdirSync(dir)
        .filter((f) => f.startsWith(stageId + '-') && f.endsWith('.json'))
        .sort();
      const excess = entries.length - FlowManager.CHECKPOINT_MAX_KEEP;
      if (excess > 0) {
        for (let i = 0; i < excess; i++) {
          try {
            unlinkSync(resolve(dir, entries[i]));
          } catch {
            // 单个文件删除失败跳过
          }
        }
      }
    } catch {
      // 清理失败静默跳过
    }
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

  /** 返回人类可读的流水线摘要（支持 i18n） */
  summary(lang: string = 'zh-CN'): string {
    if (!this.data) {
      return t('common.noInit', lang);
    }

    const stagesCount = Object.keys(this.data.stages).length;
    let opsCount = 0;
    for (const stage of Object.values(this.data.stages)) {
      // 类型守卫：仅统计普通对象 ops（跳过 null/undefined/数组）
      if (stage.ops && typeof stage.ops === 'object' && !Array.isArray(stage.ops)) {
        opsCount += Object.keys(stage.ops).length;
      }
    }

    const openReviews = this.data.reviews.filter(
      (r) => r.status === 'open',
    ).length;

    const cur = this.data.pipeline.current;
    const stagePhase = (cur.stage && this.data.stages[cur.stage])
      ? this.data.stages[cur.stage].phase
      : t('common.none', lang);
    const lines: string[] = [
      t('flow.status.title', lang),
      `${t('flow.status.globalStatus', lang)}: ${this.data.pipeline.phase}`,
      `${t('flow.status.currentStageLabel', lang)}: ${cur.stage || t('common.none', lang)} — ${t('flow.status.stagePhase', lang)}: ${stagePhase}`,
      `${t('flow.status.currentOp', lang)}: ${cur.stage ? `${cur.stage}.${cur.op}` : t('common.none', lang)}`,
      `${t('flow.status.retryCount', lang)}: ${this.data.pipeline.retry}`,
      `${t('flow.status.stagesCount', lang)}: ${stagesCount}`,
      `${t('flow.status.opsCount', lang)}: ${opsCount}`,
      `${t('flow.status.reviewPending', lang)}: ${openReviews}`,
      `${t('flow.status.logTotal', lang)}: ${this.data.log.length}`,
      `${t('flow.status.lastUpdated', lang)}: ${this.data.meta.updated}`,
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
      // 类型守卫：仅统计普通对象 ops（跳过 null/undefined/数组）
      if (stage.ops && typeof stage.ops === 'object' && !Array.isArray(stage.ops)) {
        opsCount += Object.keys(stage.ops).length;
      }
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
      return; // 已注册，跳过（幂等，保持既有行为）
    }
    // 冲突检测：不同 stageId 映射同一 (series, stageDir) 时拒绝写入
    const conflict = findStageDirConflict(this.projectPath, stageName);
    if (conflict) {
      throw new Error(`阶段目录冲突：'${stageName}' 与 '${conflict}' 映射同一 (series, stageDir)，请改用其它 stage-NN`);
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

  // ═══ 日志骨架创建 ═══

  /**
   * 在私域日志目录创建带日期前缀的骨架文件
   * Agent 只需填充内容，无需手动创建文件
   * @param stageId 阶段 ID（如 v4.4-stage-02）
   * @param label 骨架标签（如 exec_running / review_pending / test_pending）
   */
  private createLogSkeleton(stageId: string, label: string): void {
    const username = this.getUsername();
    const now = new Date();
    const dateStr = this.formatDateStr(now);
    const logDir = resolve(this.projectPath, '.openfeel', 'users', username, 'log');

    // 确保私域日志目录存在
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true });
    }

    // 计算 NNN 序号（基于当日已有文件数 + 1）
    const nnn = this.computeSkeletonNnn(logDir, dateStr);
    const fileName = `${dateStr}-${String(nnn).padStart(3, '0')}.md`;
    const filePath = resolve(logDir, fileName);

    // 仅当文件不存在时创建（幂等性）
    if (!existsSync(filePath)) {
      const content = `# ${fileName.replace('.md', '')}
- **时间**：${now.toISOString()}
- **阶段**：${stageId}
- **节点**：${label}
- **状态**：待填充

> 此文件由流水线自动创建。请在此记录操作详情。
`;
      writeFileSync(filePath, content, 'utf-8');
    }
  }

  /** 获取当前用户名（委托给 PublicLogger） */
  private getUsername(): string {
    return this.publicLogger.getUsername();
  }

  /** 格式化日期为 yyyy-mm-dd */
  private formatDateStr(date: Date): string {
    return formatDate(date);
  }

  /** 计算当日已有文件数，返回下一个序号 */
  private computeSkeletonNnn(logDir: string, datePrefix: string): number {
    try {
      const entries = readdirSync(logDir);
      let maxNnn = 0;
      for (const entry of entries) {
        if (entry.startsWith(datePrefix) && entry.endsWith('.md')) {
          const nnnStr = entry.slice(datePrefix.length + 1, -3); // +1 跳过连字符
          const nnn = parseInt(nnnStr, 10);
          if (!isNaN(nnn) && nnn > maxNnn) {
            maxNnn = nnn;
          }
        }
      }
      return maxNnn + 1;
    } catch {
      return 1;
    }
  }

  // ═══ 跨会话上下文恢复 ═══

  /**
   * 从 flow.json + status.md 恢复上下文
   * 供 Feel 重启后准确恢复状态机位置，无需重新推断
   * @param lang 语言标识（默认 'zh-CN'）
   * @returns 恢复上下文对象
   */
  recoverContext(lang: string = 'zh-CN'): RecoveryContext {
    if (!this.data) {
      return {
        phase: null,
        currentOp: null,
        stageStatus: t('flow.recover.statusUninitialized', lang),
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
    let stageStatus = t('common.unknown', lang);
    let blockedBy = '';
    const pendingTasks: string[] = [];

    if (cur.stage) {
      const statusPath = this.findStatusPath(cur.stage);
      if (statusPath) {
        try {
          const content = readFileSync(statusPath, 'utf-8');

          // 提取执行模式
          const execMatch = content.match(/\*\*执行模式\*\*[：:]\s*(manual|auto)/);
          const modeLabel = execMatch
            ? (execMatch[1] === 'auto' ? t('flow.recover.statusAutoExec', lang) : t('flow.recover.statusManualExec', lang))
            : '';

          // 提取状态
          const statusMatch = content.match(/\*\*状态\*\*[：:]\s*(\S+)/);
          stageStatus = statusMatch ? statusMatch[1] : t('common.unknown', lang);
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
          // 查找待续事项或未完成的任务（`(?=##|$)` 支持其作为文件最后章节的边界场景）
          const todoSection = content.match(/##\s*待续事项[\s\S]*?(?=##|$)/i)
            || content.match(/##\s*待做[\s\S]*?(?=##|$)/i);
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
          stageStatus = t('flow.recover.statusUnreadable', lang);
        }
      } else {
        stageStatus = t('flow.recover.statusFileMissing', lang);
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
      stageStatus = t('flow.recover.statusNoCurrentStage', lang);
    }

    return { phase, currentOp, stageStatus, blockedBy, pendingTasks };
  }

  // ═══ 推进 ═══

  /**
   * 推进指定阶段到目标流水线阶段（新 API）
   * @param stageName 阶段名（如 stage-01）
   * @param phase 目标流水线阶段（PipelinePhase）
   * @param triggeredBy 触发者标识（如 'cli' / 'Feel'），默认 'flow-manager'
   * @returns 是否触发 done 归档（true = 本次推进将阶段变为 done 且之前非 done，需在 save 后执行归档 commit）
   */
  advanceStagePhase(stageName: string, phase: PipelinePhase, triggeredBy?: string): boolean {
    if (!this.data) {
      return false;
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

    // REV 闭环：blocking REV > 0 时拒绝推进到 done（--force 仅降级警告）
    if (targetPhase === 'done') {
      const stageReviews = this.data!.reviews.filter(
        (r) => r.op.startsWith(stageName + '.') || r.op === stageName,
      );
      const blockingOpen = stageReviews.filter(
        (r) => r.blocking !== false && r.status === 'open',
      );
      if (blockingOpen.length > 0) {
        const revList = blockingOpen
          .map((r) => `  ${r.id}: ${r.title} (priority=${r.priority})`)
          .join('\n');
        throw new Error(
          `无法推进到 done：存在 ${blockingOpen.length} 个未解决的阻塞 REV：\n${revList}`,
        );
      }
    }

    // 保存旧 phase 用于日志
    const fromPhase = stage.phase;

    // 更新 stage phase
    this.data.stages[stageName].phase = targetPhase;

    // Checkpoint 自动快照：phase 推进成功后保存 flow.json 快照到 .openfeel/checkpoints/（失败不阻塞推进）
    this.saveCheckpoint(stageName, targetPhase);

    // 日志强制落档骨架：关键 phase 节点自动创建骨架文件
    const SKELETON_PHASES: PipelinePhase[] = [
      'exec_running',
      'review_pending',
      'test_pending',
      'archiving',
    ];
    if (SKELETON_PHASES.includes(targetPhase)) {
      this.createLogSkeleton(stageName, targetPhase);
    }

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
      // 归档 git commit 移出本方法：必须在 flow.json save 之后执行（否则 commit 不含本次 phase 变更）。
      // 返回 true 由命令层在 save 后调用 autoCommitOnDone。
      return true;
    }
    return false;
  }

  /**
   * 阶段归档自动 git 提交
   * 目标 phase 为 done 时自动将工作区变更提交，保证归档点有版本记录。
   * 非 git 仓库、git 不可用或无变更时静默跳过，不阻塞 done 推进。
   * 必须在 flow.json save() 之后调用，确保 commit 包含本次 phase 变更。
   * @param stageName 阶段名（用于 commit message）
   */
  public autoCommitOnDone(stageName: string): void {
    const lang = getCliLang(process.cwd());
    try {
      const msg = `chore: 阶段归档 ${stageName}`;
      // cwd 指向项目根，确保 git 在 flow.json 所在仓库执行而非进程工作目录
      execSync(`git add -A && git commit -m "${msg}"`, { stdio: 'pipe', cwd: this.projectPath });
      console.log(t('flow.advance.gitCommitOkTmpl', lang, { stage: stageName }));
    } catch {
      // 不在 git 仓库 / git 不可用 / 无变更时静默跳过，不阻塞 done 推进
      console.log(t('flow.advance.gitCommitSkipTmpl', lang, { stage: stageName }));
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
      throw new Error(`Stage '${stageId}' already exists`);
    }
    // 冲突检测：不同 stageId 映射同一 (series, stageDir) 时拒绝写入
    const conflict = findStageDirConflict(this.projectPath, stageId);
    if (conflict) {
      throw new Error(`阶段目录冲突：'${stageId}' 与 '${conflict}' 映射同一 (series, stageDir)，请改用其它 stage-NN`);
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
   * 检查阶段是否可安全移除（只读，不写盘）。
   *
   * 判定顺序：ops 非空 → 当前活跃阶段 → 被其它阶段 deps 引用。
   * force=true 时越过三项校验（ok 恒 true，阶段不存在除外），但 opCount/isCurrent/referencing 仍如实返回。
   *
   * deps 匹配：精确相等，或 dep/target 经 parseStageId 解析后 (series, stageDir) 相同（兼容短名）。
   * 存量 stage 可能缺 deps 字段（StageData.deps 虽为必填，历史数据未必），以 Array.isArray 守卫。
   *
   * @param stageId 目标阶段 ID
   * @param options.force 是否越权检查
   * @returns 可移除性检查结果
   */
  checkRemovable(stageId: string, options: { force?: boolean } = {}): RemovalCheck {
    if (!this.data) {
      return { ok: false, reason: '流水线数据未加载', opCount: 0, isCurrent: false, referencing: [] };
    }
    const stage = this.data.stages[stageId];
    if (!stage) {
      return { ok: false, reason: `阶段不存在：'${stageId}'`, opCount: 0, isCurrent: false, referencing: [] };
    }

    const opCount = stage.ops && typeof stage.ops === 'object' && !Array.isArray(stage.ops)
      ? Object.keys(stage.ops).length
      : 0;
    const isCurrent = this.data.pipeline.current.stage === stageId;

    // 引用者扫描：其余 stages 的 deps 命中该阶段者（REV-004）
    const target = parseStageId(stageId);
    const referencing: string[] = [];
    for (const [otherId, otherStage] of Object.entries(this.data.stages)) {
      if (otherId === stageId) {
        continue;
      }
      // 存量 stage 可能缺 deps 字段，以 Array.isArray 守卫
      const deps = Array.isArray(otherStage.deps) ? otherStage.deps : [];
      const hit = deps.some((dep) => {
        if (dep === stageId) {
          return true;
        }
        const parsed = parseStageId(dep);
        return !!parsed && !!target && parsed.series === target.series && parsed.stageDir === target.stageDir;
      });
      if (hit) {
        referencing.push(otherId);
      }
    }

    if (!options.force) {
      // 错误路径：ops 非空（存在未归档操作方案）
      if (opCount > 0) {
        return { ok: false, reason: `阶段 '${stageId}' 仍有 ${opCount} 个未归档的 op；如需强制移除此阶段，请加 --force`, opCount, isCurrent, referencing };
      }
      // 错误路径：当前活跃阶段
      if (isCurrent) {
        return { ok: false, reason: `阶段 '${stageId}' 是当前活跃阶段；如需强制移除，请加 --force（将自动回退 current）`, opCount, isCurrent, referencing };
      }
      // 错误路径：被其它阶段 deps 引用（REV-004）
      if (referencing.length > 0) {
        return { ok: false, reason: `阶段 '${stageId}' 被其它阶段依赖：${referencing.join(', ')}；如需强制移除（将产生悬空依赖），请加 --force`, opCount, isCurrent, referencing };
      }
    }
    return { ok: true, opCount, isCurrent, referencing };
  }

  /**
   * 移除流水线阶段（仅注销 flow.json 注册；--purge 时同时删除 plan 目录）。
   *
   * 安全校验复用 checkRemovable：ops 非空 / 当前活跃阶段 / 被其它阶段 deps 引用，默认拒绝，--force 越过。
   * --force 移除时**不清理**引用者 deps 中的悬空项（deps 为声明式引用；保留原样 + 日志 referencing/snapshot 使失真可审计）。
   * 移除后 current 兜底：若 current 指向被删阶段，按 stages 插入序回退首个非 done；无则清空 current。
   *
   * @param stageId 目标阶段 ID
   * @param options.force 越过安全校验；options.purge 同时删除 plan 目录
   */
  removeStage(stageId: string, options: { force?: boolean; purge?: boolean } = {}): void {
    if (!this.data) {
      return;
    }
    const check = this.checkRemovable(stageId, { force: options.force });
    if (!check.ok) {
      throw new Error(check.reason ?? `无法移除阶段 '${stageId}'`);
    }

    // 阶段快照（REV-006）：误删后可从审计日志重建
    const stage = this.data.stages[stageId];
    const snapshot = {
      phase: stage.phase,
      status: stage.status,
      deps: Array.isArray(stage.deps) ? [...stage.deps] : [],
      opKeys: Object.keys(stage.ops ?? {}),
    };

    // ── 注销 flow.json 注册 ──
    delete this.data.stages[stageId];

    // ── current 兜底：不悬空 ──
    if (this.data.pipeline.current.stage === stageId) {
      const remaining = Object.keys(this.data.stages);
      const fallback = remaining.find((k) => this.data!.stages[k].phase !== 'done');
      if (fallback) {
        const pendingOp = Object.entries(this.data.stages[fallback].ops ?? {}).find(
          ([, op]) => op.state === 'pending' || op.state === 'executing',
        );
        this.data.pipeline.current = { stage: fallback, op: pendingOp ? pendingOp[0] : '' };
      } else {
        this.data.pipeline.current = { stage: '', op: '' };
      }
    }

    // ── --purge：删除 plan/{series}/{stageDir}/ 目录 ──
    let purged = false;
    if (options.purge) {
      const parsed = parseStageId(stageId);
      if (parsed) {
        const dir = resolve(this.projectPath, '.openfeel', 'plan', parsed.series, parsed.stageDir);
        if (existsSync(dir)) {
          rmSync(dir, { recursive: true, force: true });
          purged = true;
        }
      }
    }

    // ── 审计日志（含引用者与阶段快照，REV-004 / REV-006） ──
    this.appendLog({
      time: '',
      agent: 'cli',
      action: 'remove_stage',
      detail: { stageId, purged, referencing: check.referencing, snapshot },
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
   * 获取从指定 phase 可达的所有目标 phase（支持组合条件 key）
   * 遍历 transitions 表，key 与 fromPhase 匹配（组合 key 如 'test_passed|review_passed' 任一条件匹配即可）即收集其目标。
   * 无 '|' 的简单 key 保持单条件原行为（精确相等）。
   * @param fromPhase 当前源 phase
   * @returns 去重后的可达目标 phase 列表
   */
  private getValidTargets(fromPhase: PipelinePhase): string[] {
    const transitions = this.pipelineConfig?.transitions ?? {};
    const result = new Set<string>();
    for (const [key, targets] of Object.entries(transitions)) {
      if (transitionKeyMatches(key, fromPhase)) {
        for (const target of targets) {
          result.add(target);
        }
      }
    }
    return [...result];
  }

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
    return this.getValidTargets(phase).includes(to);
  }

  /**
   * 获取当前阶段的所有可达下一阶段（基于 transitions 表，支持组合条件）
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
    return this.getValidTargets(currentPhase) as PipelinePhase[];
  }

  /**
   * 获取运行时生效的 phase 列表（供 flow phases 自描述）。
   * 数据源 = this.pipelineConfig（构造时经 loadPipelineConfig 加载 .openfeel/pipeline.yaml）；
   * 缺省/解析失败时回退内置默认配置。返回副本，避免调用方修改内部状态。
   */
  getPipelinePhases(): string[] {
    const phases = this.pipelineConfig?.phases ?? this.getDefaultPipelineConfig().phases;
    return [...phases];
  }

  /**
   * 获取运行时生效的 phase 转移表（key 可含 '|' 组合条件）。
   * 缺省/解析失败时回退内置默认配置。返回浅拷贝。
   */
  getPipelineTransitions(): Record<string, string[]> {
    const transitions = this.pipelineConfig?.transitions ?? this.getDefaultPipelineConfig().transitions;
    return Object.fromEntries(Object.entries(transitions).map(([k, v]) => [k, [...v]]));
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
   * 获取流水线阶段的标签映射
   * 从 pipelineConfig.phases 动态生成：已知阶段使用预定义标签，未知阶段自动生成回退标签
   * 供 flow wizard 交互模式使用
   * @param lang 语言标识（'zh-CN' | 'en'），默认 'zh-CN'
   */
  getPhaseLabels(lang: string = 'zh-CN'): Record<string, string> {
    // 内置标签映射（含所有标准阶段，双语）
    const zhLabels: Record<string, string> = {
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
    const enLabels: Record<string, string> = {
      plan_pending: 'Plan Pending',
      plan_review: 'Plan Reviewing',
      plan_passed: 'Plan Passed',
      scheme_pending: 'Scheme Pending',
      scheme_review: 'Scheme Reviewing',
      scheme_passed: 'Scheme Passed',
      exec_running: 'Executing',
      review_pending: 'Review Pending',
      review_failed: 'Review Failed',
      review_passed: 'Review Passed',
      test_pending: 'Test Pending',
      test_failed: 'Test Failed',
      test_passed: 'Test Passed',
      archiving: 'Archiving',
      done: 'Completed',
    };
    const builtinLabels = lang === 'en' ? enLabels : zhLabels;

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

  /** 查找 status.md 的路径（三级回退：plan/{series}/ 精确 → plan 递归 → stages 兜底） */
  private findStatusPath(stageId: string): string | null {
    return findStageStatusPath(this.projectPath, stageId);
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

  /** 将 PipelinePhase 映射为负责 Agent 标识（返回新名，供新写入使用） */
  private mapPhaseToAgent(phase: PipelinePhase): string {
    const prefix = phase.split('_')[0];
    switch (prefix) {
      case 'plan':
        return 'openfeel-planner';
      case 'scheme':
        return 'openfeel-schemer';
      case 'exec':
        return 'openfeel-executor';
      case 'review':
        return 'openfeel-reviewer';
      case 'test':
        return 'openfeel-feel-tester';
      case 'archiving':
        return 'openfeel-archiver';
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
        agent: 'openfeel-executor',
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
        agent: 'openfeel-executor',
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
      agent: 'openfeel-executor',
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
   * 当 openfeel-reviewer 认为问题可直接修复时调用，REV 条目状态直接设为 resolved，
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

    // 检查从当前 phase 到目标 phase 的流转是否合法（支持组合条件 key）
    const validTargets = this.getValidTargets(currentPhase);
    if (!validTargets.includes(to)) {
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

        // 检查 phase 与 status 不一致（非阻塞警告）
        if (stage.phase && stage.status) {
          if (stage.status === 'done' && stage.phase !== 'done') {
            warnings.push(
              `${stageId}: status=done 但 phase=${stage.phase}，不一致（非阻塞）`,
            );
          } else if (stage.phase === 'done' && stage.status !== 'done') {
            warnings.push(
              `${stageId}: phase=done 但 status=${stage.status}，不一致（非阻塞）`,
            );
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
          // 删除损坏文件后重建（initFlow 仅在文件不存在时创建）
          try {
            unlinkSync(this.filePath);
          } catch {
            // 删除失败忽略
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
        // 删除损坏文件后重建（initFlow 仅在文件不存在时创建）
        try {
          unlinkSync(this.filePath);
        } catch {
          // 删除失败忽略
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
      // （乐观并发修订）补全缺失的 meta.revision（存量兼容，视为 0）
      if (typeof flowData.meta.revision !== 'number') {
        flowData.meta.revision = 0;
        changes.push('已补全缺失的 meta.revision（存量兼容，视为 0）');
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

        // 修复缺失或非对象的 ops 字段
        if (!s.ops || typeof s.ops !== 'object' || Array.isArray(s.ops)) {
          s.ops = {};
          changes.push(`已为阶段 ${stageId} 补全缺失的 ops`);
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

    // 写入修复后的数据（recovered 场景下磁盘文件仍损坏，即使无字段修改也必须写回恢复内容）
    if ((modified || recovered) && !dryRun) {
      // （乐观并发修订）恢复/修复亦视为一次写入：先在源对象上递增 revision，
      // 再序列化深拷贝，确保 revision 随内容一起落盘（避免陈旧实例后续 save 误判冲突）
      const meta = flowData.meta ?? defaults.meta;
      flowData.meta = meta;
      meta.revision = (typeof meta.revision === 'number' ? meta.revision : 0) + 1;

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
      const lockPath = projectLockPath(this.projectPath, 'flow');
      try {
        withFileLock(lockPath, () => {
          // recovered 场景 .bak 已是有效恢复来源，避免被损坏文件覆盖（保持既有语义）
          atomicWriteFileSync(this.filePath, content, { backup: !recovered });
        });
      } catch (err) {
        changes.push(`修复后写入失败: ${(err as Error).message}`);
        return { fixed: false, changes, recovered };
      }
      // 写盘成功后重新加载，同步 this.data 与 this.loadedRevision 基线
      this.load();
    }

    // changes 在无问题时保持空数组，CLI 层通过 changes.length === 0 判断"没问题"

    return { fixed: modified || recovered, changes, recovered };
  }

  /**
   * 自动修复指定阶段的 phase/status 不一致
   * - status=done 但 phase≠done → 同步 phase 为 done
   * - phase=done 但 status≠done → 同步 status 为 done
   * @param stageName 阶段名（如 stage-01）
   * @returns 修复结果（是否修复 + 详情）
   */
  autoRepairInconsistency(stageName: string): { fixed: boolean; detail: string } {
    if (!this.data) {
      return { fixed: false, detail: 'flow.json 未加载' };
    }
    const stage = this.data.stages[stageName];
    if (!stage) {
      return { fixed: false, detail: `阶段 '${stageName}' 不存在` };
    }

    // 修复: status=done 但 phase≠done 时，同步 phase 为 done
    if (stage.status === 'done' && stage.phase !== 'done') {
      const oldPhase = stage.phase;
      stage.phase = 'done' as PipelinePhase;
      return { fixed: true, detail: `phase ${oldPhase} → done (与 status 同步)` };
    }

    // 修复: phase=done 但 status≠done 时，同步 status
    if (stage.phase === 'done' && stage.status !== 'done') {
      const oldStatus = stage.status;
      stage.status = 'done';
      return { fixed: true, detail: `status ${oldStatus} → done (与 phase 同步)` };
    }

    return { fixed: false, detail: '未检测到不一致' };
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
  migrate(dryRun: boolean = false, noBackup: boolean = false): { migrated: boolean; changes: string[]; failed: boolean } {
    const changes: string[] = [];

    if (!this.data) {
      changes.push('flow.json 未加载，无法迁移');
      return { migrated: false, changes, failed: true };
    }

    // 已是新版格式
    if (!this.needsMigration()) {
      changes.push('已是新版格式，无需迁移');
      return { migrated: false, changes, failed: false };
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
        return { migrated: false, changes, failed: true };
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

    return { migrated: true, changes, failed: false };
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

  /** 2. 检查 flow.json 与 plan/{series}/stage-NN/status.md 跨文件一致性 */
  private checkCrossFileConsistency(items: HealthCheckItem[]): void {
    if (!this.data) {
      return;
    }

    let total = 0;
    let consistent = 0;

    for (const [stageId, stage] of Object.entries(this.data.stages)) {
      // 三级回退查找 status.md（plan/{series}/ 精确 → plan 递归 → stages 兜底）
      const statusPath = findStageStatusPath(this.projectPath, stageId);
      if (!statusPath) {
        continue;
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
    // 首次创建（existsSync 守卫）、无并发读者，故不加锁，仅原子写；默认 revision:0
    atomicWriteFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
  }

  /**
   * 内嵌数据（仅供测试使用）
   * 直接设置 flow 数据而不从文件加载
   */
  setData(data: FlowData): void {
    this.data = data;
    // 测试专用：注入数据视为「当前磁盘状态」，同步并发校验基线，避免后续 save 误判冲突
    this.loadedRevision = this.readDiskRevision();
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
        // 组合条件示例：审查通过 或 测试通过 任一即可推进到 archiving（多 Agent 并行场景，任一完成即推进）
        'review_passed|test_passed': ['archiving'],
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

/** 旧 agent 名 → 新名映射（读取兼容用；skill 名不在此列） */
const LEGACY_AGENT_NAME_MAP: Record<string, string> = {
  planner: 'openfeel-planner',
  schemer: 'openfeel-schemer',
  executor: 'openfeel-executor',
  reviewer: 'openfeel-reviewer',
  'feel-tester': 'openfeel-feel-tester',
  utility: 'openfeel-utility',
  vision: 'openfeel-vision',
  archiver: 'openfeel-archiver',
};

/**
 * 归一化 agent 名：旧名 → 新名（读取兼容 P5）。
 * 内部 toLowerCase() 归一大小写不一致（REV-304）。
 * 幂等：已是 openfeel-* 原样返回；feel / none / unknown / 非 agent 值（如 flow-manager）原样保留。
 */
export function normalizeAgentName(name: string): string {
  if (!name) {
    return name;
  }
  const key = name.trim().toLowerCase();
  // 已是新名（openfeel- 前缀）→ 原样返回，避免二次前缀化
  if (key.startsWith('openfeel-')) {
    return key;
  }
  return LEGACY_AGENT_NAME_MAP[key] ?? key;
}

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
      // status=done 是 phase=done 的专属状态：test_passed 映射为中间状态 testing，
      // 避免 autoRepairInconsistency 在 flow advance 时把 phase 误修正为 done，截断 test_passed→archiving 路径
      return 'testing';
    case 'archiving':
      // 归档阶段映射为中间状态 archiving，避免被 autoRepairInconsistency 误修正为 done
      return 'archiving';
    case 'done':
      return 'done';
    default:
      // 其他阶段保持 stage 当前状态不变
      return currentStatus;
  }
}
