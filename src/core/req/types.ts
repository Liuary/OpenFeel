/**
 * 需求层类型与常量 — 单一来源（叶子模块）
 *
 * 职责：需求状态值域、优先级值域、需求 ID 格式与 `RequirementData` 字段表的**唯一权威定义**。
 * 边界声明：仅类型导入（import type，编译期擦除、零运行时依赖）；不依赖归档层；模式属性（workflow_mode?）为调度属性——
 *   不参与聚合判定 / 不入 done 门（done 判定单源恒在 allLinkedStagesDone）。
 */
import type { WorkflowMode } from '../config.js';   // 仅类型（编译期擦除、零运行时依赖）

/**
 * 需求状态值域（8 值，裁定 B；单一来源——stage-82 命令层校验须从此派生，禁硬编码）。
 *
 * v1.7.0 / REQ-063 A63.1：新增 `review_pending`（需求审查相位），声明序插在
 * `in_progress` 与 `done` 之间 —— 值域声明序即 `req board` / `dashboard` 的分组键序，
 * 旧 7 键**一个不删不改**，只在此处新增一档（向后兼容：旧键保留 + 新键追加）。
 */
export const REQ_STATUSES = [
  'draft', 'scheduled', 'in_progress', 'review_pending', 'done', 'blocked', 'cancelled', 'rejected',
] as const;
/** 需求状态联合类型（自 REQ_STATUSES 派生，唯一权威） */
export type RequirementStatus = (typeof REQ_STATUSES)[number];

/** 需求优先级值域（三档；单一来源） */
export const REQ_PRIORITIES = ['P0', 'P1', 'P2'] as const;
/** 需求优先级类型（自 REQ_PRIORITIES 派生） */
export type RequirementPriority = (typeof REQ_PRIORITIES)[number];

/** 需求 ID 格式（REQ-NNN 三位起补零；含数字捕获组；非全局标志，防 lastIndex 状态污染） */
export const REQ_ID_PATTERN = /^REQ-(\d{3,})$/;   // 含数字捕获组（m[1] 供 nextRequirementId 解析）；非全局标志

/** 审查 / 验证结果值域（单一来源；v1.5.8 / REQ-027） */
export const REVIEW_RESULTS = ['pass', 'fail'] as const;
/** 审查结果类型（自 REVIEW_RESULTS 派生） */
export type ReviewResult = (typeof REVIEW_RESULTS)[number];

/** 验证种类值域（单一来源；test = 自动化测试 / manual = 手工验证 / build = 构建或类型检查） */
export const VERIFICATION_KINDS = ['test', 'manual', 'build'] as const;
/** 验证种类类型（自 VERIFICATION_KINDS 派生） */
export type VerificationKind = (typeof VERIFICATION_KINDS)[number];

/**
 * 需求审查记录（v1.5.8 / REQ-027「完成必审验」）。
 * done 门要求 `review.result === 'pass'`；`independent === false` 表示自我审查（归档摘要须标注）。
 */
export interface RequirementReviewRecord {
  /** 结论：pass / fail（fail 同样留痕，但不满足 done 门） */
  result: ReviewResult;
  /** 审查者（自由文本；非空） */
  by: string;
  /** 记录时间 ISO 8601 */
  at: string;
  /** 结论摘要（非空） */
  note: string;
  /** 是否独立审查（false = 自我审查，须显式标注） */
  independent: boolean;
  /** 落库时的会话标识（v1.5.24 / REQ-049：署名用项目用户，人机区分与回溯看这里；可选） */
  session?: string;
}

/**
 * 需求验证记录（v1.5.8 / REQ-027）。
 * done 门要求 `verification.result === 'pass'`；`evidence` 可选（测试命令 / 报告路径等）。
 */
export interface RequirementVerificationRecord {
  /** 结论：pass / fail */
  result: ReviewResult;
  /** 验证种类 */
  kind: VerificationKind;
  /** 验证者（自由文本；非空） */
  by: string;
  /** 记录时间 ISO 8601 */
  at: string;
  /** 结论摘要（非空） */
  note: string;
  /** 证据（命令 / 路径 / 摘要；可选） */
  evidence?: string;
  /**
   * 关联的验收判据 id（v1.5.23 / REQ-044 / 六期反馈 #10）。
   * **只读引用**：记录在案供归档与看板消费，不参与 done 门判定（升级为门禁须另立版本）。
   */
  criteria?: string[];
  /** 落库时的会话标识（v1.5.24 / REQ-049：署名为项目用户，人机区分看这里；可选） */
  session?: string;
}

/** 阶段验证记录（与需求验证记录同形；v1.5.8 / REQ-027） */
export type StageVerificationRecord = RequirementVerificationRecord;

/**
 * 需求豁免记录（v1.5.23 / REQ-043 / 六期反馈 #8）。
 *
 * 语义：**主动放弃并移出阶段 done 门**——与 `cancelled`（用户取消）不同，
 * waived 记录「谁、何时、为什么」放弃，归档与看板仍能看到这条需求。
 * 不含状态变更：需求状态保持原样，stage done 门把它当作「已处置」。
 */
export interface RequirementWaiverRecord {
  /** 放弃原因（非空） */
  reason: string;
  /** 决策人 / 会话标识 */
  by: string;
  /** 记录时间 ISO 8601 */
  at: string;
}

/**
 * trivial 标记（v1.5.23 / REQ-043 / 六期反馈 #5）。
 *
 * 语义：**显式声明本条改动无需审验**（docs/文案/测试注释类），
 * done 门跳过 review / verification 两项；阶段相位门与聚合门不变。
 * 只接受显式标记，不做「按路径自动豁免」——那会让文档即契约的项目失去审查。
 */
export interface RequirementTrivialRecord {
  /** 为什么算 trivial（非空） */
  reason: string;
  /** 标记人 / 会话标识 */
  by: string;
  /** 标记时间 ISO 8601 */
  at: string;
}

/**
 * 需求门「留痕放行」记录（v1.6.0 / stage-132 T4 正文门 + T7 计划门）。
 *
 * 语义：门判据不通过时**不是**静默绕过，而是 `--force` 写一条可追溯的放弃记录
 * （谁、何时、为什么），随后同一判据重新求值即放行。与 T6 的 `plan.deviations`
 * 同一哲学：force 是「本次放行 + 留痕」，不是「洗白证据」——正文/计划文件仍应补写。
 */
export interface RequirementGateWaiverRecord {
  /** 记录时间 ISO 8601 */
  at: string;
  /** 决策人（命令层缺省 = 项目用户） */
  by: string;
  /** 放行原因（命令层写入渠道，如 `claim-force` / `advance-force`） */
  reason: string;
}

/**
 * 需求级计划「执行前指纹」盖章（v1.6.0 / REQ-056 T6）。
 *
 * 盖章时机：阶段计划门（`advanceStagePhase` → `exec_running`）**放行时**写入，
 *   含 `allowGateOverride`（`--force`）留痕放行；拒绝路径零写盘。
 * 校验时机：需求 `→ done` 前比对当前 `.openfeel/plan/reqs/REQ-NNN.plan.md` 的 sha256；
 *   计划被执行改动且 `## 偏差与回写` 未写实 → `plan_deviation`（可机器校验证据）。
 * 可选（读侧宽容）：本字段引入前已启动的历史需求无此字段 —— done 门**放行**、
 *   审计记 `plan_unstamped:true`（兼容存量，不阻塞）。
 */
export interface RequirementPlanRecord {
  /** 计划文件相对路径（POSIX 分隔符；恒 `.openfeel/plan/reqs/REQ-NNN.plan.md`，全局固定不随版本漂移） */
  path: string;
  /**
   * 计划内容 sha256 的**前 12 位**十六进制（与 `sha256sum` 输出前缀同口径）。
   * 12 位 = 48 bit，对「计划文件是否被改动」足够；不存全量摘要以控制 flow.json 体积。
   */
  sha256: string;
  /** 盖章时间 ISO 8601 */
  recorded_at: string;
  /** 偏差留痕放行次数（`req advance --force` 递增；缺省为 0 时不写键） */
  deviations?: number;
}

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
  /** 拆分来源父需求 ID（**仅溯源**：不参与聚合判定 / 不参与 done 门 / 无父子级联；可选——读侧宽容不 load 补齐） */
  parent_id?: string;
  /** 需求级工作流模式（**调度属性**：经解析单点作用于其关联阶段；可选 + 读侧宽容不 load 补齐；不入聚合 / 不入 done 门；值域权威 = WORKFLOW_MODES） */
  workflow_mode?: WorkflowMode;
  /** 最近一次审查记录（v1.5.8 / REQ-027；done 门要求 result === 'pass'；可选——读侧宽容） */
  review?: RequirementReviewRecord;
  /** 最近一次验证记录（v1.5.8 / REQ-027；done 门要求 result === 'pass'；可选——读侧宽容） */
  verification?: RequirementVerificationRecord;
  /**
   * 顺延来源版本链（v1.5.8 / REQ-030）：`req rollover` 每次改 `target_version` 时追加来源版本，
   * 去重保序（不重复记录同一版本）。可选——读侧宽容不 load 补齐，不参与 done 门 / 聚合判定。
   */
  carried_from?: string[];
  /** 豁免记录（v1.5.23 / REQ-043）：存在即视为「已处置」，移出阶段 done 门的未完成集合 */
  waiver?: RequirementWaiverRecord;
  /** trivial 标记（v1.5.23 / REQ-043）：存在即视为无需审验（跳过 review / verification 两项） */
  trivial?: RequirementTrivialRecord;
  /**
   * 执行前计划指纹（v1.6.0 / REQ-056 T6）：阶段计划门放行时盖章，
   * `→ done` 前比对当前计划文件；改动未回写 → `plan_deviation`。可选——历史需求缺省放行。
   */
  plan?: RequirementPlanRecord;
  /**
   * 正文门留痕放行（v1.6.0 / stage-132 T4）：存在即跳过正文写实判据。
   * 只由 `req claim/advance/complete --force` 写入（同时审计 `requirement_body_forced`）；
   * 可选——读侧宽容，缺省表示未放行（判据生效）。
   */
  body_waiver?: RequirementGateWaiverRecord;
  /**
   * 需求级计划门留痕放行（v1.6.0 / stage-132 T7）：存在即跳过计划写实判据。
   * 只由 `req advance/complete --force` 写入（同时审计 `requirement_plan_forced`）；
   * 可选——读侧宽容，缺省表示未放行（判据生效）。
   */
  plan_waiver?: RequirementGateWaiverRecord;
}
