/**
 * 归档文件 schema — `.openfeel/flow-archive/{version}.json`
 * 职责：定义归档文件结构与 schema 版本常量（大计划 §三 裁定 U）；
 *      类型复用 flow-manager / req 既有定义（仅类型导入，编译期擦除，零运行时依赖边）。
 */
import type { StageData, ReviewItem, LogEntry } from '../flow-manager.js';
import type { RequirementData } from '../req/types.js';

/** 归档文件 schema 版本（写侧恒用此值；读侧对未知值宽容，不阻断读取） */
export const ARCHIVE_SCHEMA_VERSION = 1;

/**
 * 归档段计数（冗余展示字段；读侧缺失时按实际长度回填，见 archive-ops 的 withCountsFallback）。
 * `requirements` 为 v1.5.8 / REQ-030 **追加键**：老归档文件无此键（读侧视同 0，不注入键）。
 */
export interface ArchiveCounts {
  /** 归档阶段条目数 */
  stages: number;
  /** 归档审查条目数 */
  reviews: number;
  /** 归档日志条目数 */
  log: number;
  /** 归档需求条目数（**可选**：v1.5.8 之前写的归档无此键，读侧视同 0） */
  requirements?: number;
}

/** 归档文件结构（`.openfeel/flow-archive/{version}.json`；只增不改，同版本重归档 = 幂等覆盖） */
export interface ArchiveFile {
  /** schema 版本：写侧恒为 ARCHIVE_SCHEMA_VERSION；读侧宽容 */
  schemaVersion: number;
  /** 被归档的版本前缀（如 `v1.1.7`） */
  version: string;
  /** 归档时间（ISO 8601） */
  archived_at: string;
  /** 该版本全部阶段条目（stageId → StageData） */
  stages: Record<string, StageData>;
  /** 该版本关联的审查条目 */
  reviews: ReviewItem[];
  /** 该版本关联的日志条目 */
  log: LogEntry[];
  /**
   * 随版本归档的需求（v1.5.8 / REQ-030）：`target_version === version` **且终态**（done/cancelled/rejected）。
   * **可选**——旧归档文件无此键可读（读侧不注入，`file.requirements` 保持 undefined）。
   */
  requirements?: RequirementData[];
  /** 四段计数（冗余展示字段；读侧缺失时按实际长度回填） */
  counts: ArchiveCounts;
}
