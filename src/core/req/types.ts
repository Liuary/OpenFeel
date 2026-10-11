/**
 * 需求层类型与常量 — 单一来源（叶子模块）
 *
 * 职责：需求状态值域、优先级值域、需求 ID 格式与 `RequirementData` 字段表的**唯一权威定义**。
 * 正交声明：零 import（叶子模块）；不依赖归档层 / 不引用工作流模式字段。
 */

/** 需求状态值域（7 值，裁定 B；单一来源——stage-82 命令层校验须从此派生，禁硬编码） */
export const REQ_STATUSES = ['draft', 'scheduled', 'in_progress', 'done', 'blocked', 'cancelled', 'rejected'] as const;
/** 需求状态联合类型（自 REQ_STATUSES 派生，唯一权威） */
export type RequirementStatus = (typeof REQ_STATUSES)[number];

/** 需求优先级值域（三档；单一来源） */
export const REQ_PRIORITIES = ['P0', 'P1', 'P2'] as const;
/** 需求优先级类型（自 REQ_PRIORITIES 派生） */
export type RequirementPriority = (typeof REQ_PRIORITIES)[number];

/** 需求 ID 格式（REQ-NNN 三位起补零；含数字捕获组；非全局标志，防 lastIndex 状态污染） */
export const REQ_ID_PATTERN = /^REQ-(\d{3,})$/;   // 含数字捕获组（m[1] 供 nextRequirementId 解析）；非全局标志

/** 需求条目数据（需求层显式字段；聚合方向归 stage-83） */
export interface RequirementData {
  /** 需求 ID（REQ-NNN，max+1 不回收；格式见 REQ_ID_PATTERN） */
  id: string;
  /** 需求标题（人读简明描述；非空） */
  title: string;
  /** 显式粗粒度状态；新建恒 'draft'（REV-81-005） */
  status: RequirementStatus;
  /** 预估版本（如 v1.3.0；可选） */
  target_version?: string;
  /** 优先级 P0/P1/P2（可选） */
  priority?: RequirementPriority;
  /** 认领人（claim 写入；未认领缺省） */
  owner?: string;
  /** 认领时间 ISO 8601（与 owner 同批写入/清除） */
  claimed_at?: string;
  /** 创建时间 ISO 8601 */
  created_at: string;
  /** 最近更新时间 ISO 8601（仅实际变更时刷新） */
  updated_at: string;
  /** 正文相对路径（POSIX 分隔符，如 .openfeel/requirements/REQ-001.md） */
  body_path?: string;
}
