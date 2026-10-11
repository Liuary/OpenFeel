/**
 * 版本分组与切分纯函数 — 归档引擎的解析核心
 * 职责：stageId → 版本前缀（复用 parseStageId，禁自写正则）；
 *      按版本分组；按版本切分 flow 数据（stages 全搬 / reviews 按 op 前缀 / log 按 detail.stageName）。
 * 本文件全部为纯函数（只读输入，不写盘、不加锁、不读环境）。
 */
import { parseStageId } from '../plan/path.js';
import type { FlowData, StageData, ReviewItem, LogEntry } from '../flow-manager.js';
import type { ArchiveFile } from './archive-file.js';

/** splitForArchive 返回：归档段（缺 schemaVersion/archived_at，由命令层装配） + 保留段 */
export interface SplitResult {
  /** 归档段：不含 schemaVersion / archived_at（由 stage-79 命令层装配后交 writeArchiveFile） */
  archive: Omit<ArchiveFile, 'schemaVersion' | 'archived_at'>;
  /** 保留段：留在 flow.json 的条目（不可归档归属者一律落此） */
  remainder: {
    stages: Record<string, StageData>;
    reviews: ReviewItem[];
    log: LogEntry[];
  };
}

/** 可归档候选（供命令面判据门消费；blocking REV 判定归命令层，本函数只读纯判定） */
export interface ArchivableCandidate {
  /** 版本前缀（如 `v1.1.7`） */
  version: string;
  /** 该版本全部 stageId（保持 stages 键遍历顺序） */
  stages: string[];
  /** 该版本是否全部阶段 phase=done（空集守卫：length>0 && every(done)） */
  allDone: boolean;
}

/**
 * stageId → 版本前缀（如 `v1.1.7`）。
 * 复用 parseStageId（唯一权威，禁自写正则）：fullStageId = `${version}-${stageDir}`，剥离 `-${stageDir}` 后缀即版本段。
 * 短名 stageId 经 parseStageId 归一化为 `v1.0.0-*`（DEFAULT_STAGE_VERSION，既定语义）。
 * 无法解析返回 null。
 */
export function versionOfStageId(stageId: string): string | null {
  const parsed = parseStageId(stageId);
  if (!parsed) {
    return null;
  }
  const suffix = `-${parsed.stageDir}`;
  if (!parsed.fullStageId.endsWith(suffix)) {
    return null;
  }
  return parsed.fullStageId.slice(0, -suffix.length);
}

/**
 * stages 按版本前缀分组（版本 → stageId 列表）。
 * 保持稳定顺序（按 stages 键遍历顺序）；无法解析的 stageId 跳过（不产生分组 → 永不归档）。
 */
export function groupStagesByVersion(stages: Record<string, StageData>): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const stageId of Object.keys(stages)) {
    const version = versionOfStageId(stageId);
    if (!version) {
      continue; // 无法解析 → 不分组（保留在 flow.json）
    }
    const list = groups.get(version);
    if (list) {
      list.push(stageId);
    } else {
      groups.set(version, [stageId]);
    }
  }
  return groups;
}

/**
 * 可归档候选列表（只读纯函数）：版本 + 该版本 stageId 列表 + 是否全部 phase=done。
 * allDone 采用空集守卫（length > 0 && every(done)，对齐 flow-manager.ts:1484-1486 范式——空集不判 done）。
 * 不判 REV（blocking open REV 判定归命令层，裁定 O2）。
 */
export function listArchivableCandidates(data: FlowData): ArchivableCandidate[] {
  const result: ArchivableCandidate[] = [];
  for (const [version, stageIds] of groupStagesByVersion(data.stages)) {
    const allDone = stageIds.length > 0 && stageIds.every((id) => data.stages[id]?.phase === 'done');
    result.push({ version, stages: stageIds, allDone });
  }
  return result;
}

/**
 * reviews 条目 → 版本前缀。
 * `op` 形如 `<stageId>.op-NNN` 或 `<stageId>`：点号锚定正则 `/^(.+)\.(op-\d+)$/` 剥离 opId 段
 * （stageId 自身可含点号，禁 split('.')；见 archive/merge.ts:57-67 既有范式）；stageId 段经 versionOfStageId。
 * 无法归属返回 null（→ 保留在 flow.json）。
 */
function versionOfReviewOp(op: string): string | null {
  if (typeof op !== 'string' || op.length === 0) {
    return null;
  }
  const anchor = op.match(/^(.+)\.(op-\d+)$/);
  const stageId = anchor ? anchor[1] : op;
  return versionOfStageId(stageId);
}

/**
 * log 条目 → 版本前缀。
 * 唯一读 `detail.stageName`（裁定 T）；缺失 / 非字符串 / 不可解析 → null（保留在 flow.json）。
 * 注意：`detail.stageId` / `detail.stage` 等其它键一律不看（保守裁定，见 D3）。
 */
function versionOfLogEntry(entry: LogEntry): string | null {
  const stageName = entry?.detail?.['stageName'];
  if (typeof stageName !== 'string') {
    return null;
  }
  return versionOfStageId(stageName);
}

/**
 * 按版本切分 flow 数据（纯函数，不写盘）。
 * - stages：该版本全部 stageId 条目整体搬入 archive；其余（含不可解析 stageId）保留 remainder。
 * - reviews：`versionOfReviewOp(r.op) === version` 者搬入；其余保留（保序）。
 * - log：`versionOfLogEntry(e) === version` 者搬入；其余保留（保序；无 stageName / 不可解析一律保留）。
 * - 版本不存在 → archive 为空集（counts 全 0），不抛错。
 * 返回集合中的对象为原数据浅引用（调用方不得修改）。
 */
export function splitForArchive(data: FlowData, version: string): SplitResult {
  const archiveStages: Record<string, StageData> = {};
  const remainderStages: Record<string, StageData> = {};
  for (const [stageId, stage] of Object.entries(data.stages)) {
    if (versionOfStageId(stageId) === version) {
      archiveStages[stageId] = stage;
    } else {
      remainderStages[stageId] = stage;
    }
  }

  const archiveReviews: ReviewItem[] = [];
  const remainderReviews: ReviewItem[] = [];
  for (const review of data.reviews ?? []) {
    if (versionOfReviewOp(review.op) === version) {
      archiveReviews.push(review);
    } else {
      remainderReviews.push(review);
    }
  }

  const archiveLog: LogEntry[] = [];
  const remainderLog: LogEntry[] = [];
  for (const entry of data.log ?? []) {
    if (versionOfLogEntry(entry) === version) {
      archiveLog.push(entry);
    } else {
      remainderLog.push(entry);
    }
  }

  return {
    archive: {
      version,
      stages: archiveStages,
      reviews: archiveReviews,
      log: archiveLog,
      counts: {
        stages: Object.keys(archiveStages).length,
        reviews: archiveReviews.length,
        log: archiveLog.length,
      },
    },
    remainder: {
      stages: remainderStages,
      reviews: remainderReviews,
      log: remainderLog,
    },
  };
}
