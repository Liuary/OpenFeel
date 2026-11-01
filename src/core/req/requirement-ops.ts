/**
 * 需求原语 — 需求层纯内存操作的单一入口
 *
 * 职责：需求读取（读侧宽容 + 浅副本）、ID 分配、写路径原语（add / claim / release / update / advance / link）
 *       与共用谓词（终态判定 / 全部关联阶段 done（聚合单源）/ 完成门判据）。全部为**纯内存**操作 + 审计内嵌（`data.log`），
 *       零独立写盘点——落盘恒走调用方（命令层）的 `FlowManager` 落盘方法。
 * 边界声明：不依赖归档层；模式属性（workflow_mode?）为调度属性——本层只做「值域校验 + 载体制门」，
 *   解析 / 下发单点在 FlowManager；不参与聚合判定。
 */
import type { FlowData, PipelinePhase, StageData, StageRequirementLink } from '../flow-manager.js';  // 仅类型（编译期擦除）
import { stageRequirementIds } from './stage-links.js';   // 阶段↔需求关联读取单点（v1.5.8 / REQ-028）
import { WORKFLOW_MODES, type WorkflowMode } from '../config.js';   // 值域单源（运行时值导入，禁就地三值字面量）
import {
  REQ_ID_PATTERN, REQ_PRIORITIES, REQ_STATUSES, REVIEW_RESULTS, VERIFICATION_KINDS,
  type RequirementData, type RequirementPriority, type RequirementStatus,
  type ReviewResult, type VerificationKind,
} from './types.js';

/** 需求原语错误码（冻结；命令层据此映射 exit 非 0 零写盘） */
export type RequirementErrorCode =
  | 'not_found'        // 需求不存在
  | 'stage_not_found'  // 阶段不存在（link 专用）
  | 'already_claimed'  // 已被他人占用（claim）
  | 'already_linked'   // **已退役**（v1.5.8 / REQ-028 多值模型下阶段可挂多个需求，link 不再返回）；保留取值以兼容既有映射面
  | 'invalid_status'   // 状态门拒绝（claim 终态 / 非法流转 / patch.status 非法值 / link 终态需求）
  | 'invalid_field'      // 字段门拒绝（白名单外键 / 非法值 / owner 空串 / title 空串）
  | 'general_mode_conflict'; // 载体制门（stage-90）：general 仅限无关联阶段的需求 / general 需求不接受阶段关联

/** 写路径原语结果（ok=false 时携错误码；命令层映射 exit 非 0 零写盘） */
export type RequirementOpResult = { ok: true; changed: boolean } | { ok: false; code: RequirementErrorCode };

/** 拆分原语结果（成功携子需求**本体**列表；失败携错误码——**业务分流范式**，REV-87-002 定稿） */
export type RequirementSplitResult =
  | { ok: true; children: RequirementData[] }
  | { ok: false; code: RequirementErrorCode };

/** 追加需求审计日志（纯内存；save 由调用方承担） */
function appendRequirementLog(data: FlowData, action: string, detail: Record<string, unknown>): void {
  data.log.push({ time: new Date().toISOString(), agent: 'cli', action, detail });
}

// ═══ 读取与分配（读侧宽容 + 浅副本，裁定 2/8）═══

/** 全量需求（读侧宽容：缺失/非数组 → []；数组 + 元素浅副本，防外部直改内存） */
export function getRequirements(data: FlowData): RequirementData[] {
  const list = data.requirements;
  return Array.isArray(list) ? list.map((r) => ({ ...r })) : [];
}

/** 按 id 查询（未命中 null；返回浅副本） */
export function getRequirement(data: FlowData, id: string): RequirementData | null {
  const found = (Array.isArray(data.requirements) ? data.requirements : []).find((r) => r?.id === id);
  return found ? { ...found } : null;
}

/** 过滤查询（status 精确 / target_version 精确 / owner 精确；多条件 AND；API 面命名统一 target_version——REV-81-012） */
export function listRequirements(
  data: FlowData,
  filter?: { status?: RequirementStatus; target_version?: string; owner?: string },
): RequirementData[] {
  let result = getRequirements(data);
  if (filter?.status !== undefined) { result = result.filter((r) => r.status === filter.status); }
  if (filter?.target_version !== undefined) { result = result.filter((r) => r.target_version === filter.target_version); }
  if (filter?.owner !== undefined) { result = result.filter((r) => r.owner === filter.owner); }
  return result;
}

/** 需求 ID 格式化（三位起补零；序列化单点） */
function formatRequirementId(seq: number): string {
  return `REQ-${String(seq).padStart(3, '0')}`;
}

/**
 * 现存需求 ID 的最大序号（异常 id 跳过不崩；空集 → 0）。
 * 仅看 `requirements` 现存条目——归档后条目已被移出，故**不可**作为唯一单调依据（见 requirementSeqFloor）。
 */
function maxRequirementSeqInList(requirements: RequirementData[]): number {
  let max = 0;
  for (const r of requirements) {
    const m = REQ_ID_PATTERN.exec(typeof r?.id === 'string' ? r.id : '');
    if (!m) { continue; }
    const n = Number.parseInt(m[1], 10);
    if (Number.isFinite(n) && n > max) { max = n; }
  }
  return max;
}

/**
 * 需求序号下限（单调计数器读取单点；v1.5.8 / REQ-030）：
 * `max(现存 requirements 最大号, meta.last_req_seq ?? 0)`。
 * 旧数据无 `last_req_seq` → 0 兜底；归档后现存集为空时仍由计数器防复用。
 */
export function requirementSeqFloor(data: FlowData): number {
  const stored = typeof data.meta?.last_req_seq === 'number' && Number.isFinite(data.meta.last_req_seq)
    ? data.meta.last_req_seq
    : 0;
  return Math.max(stored, maxRequirementSeqInList(Array.isArray(data.requirements) ? data.requirements : []));
}

/**
 * 下一个需求 ID（**只读**：不写计数器）。
 * 语义 = `requirementSeqFloor(data) + 1`；分配场景请用 `allocateRequirementId`（同批写回计数器）。
 */
export function nextRequirementId(data: FlowData): string {
  return formatRequirementId(requirementSeqFloor(data) + 1);
}

/**
 * 分配需求 ID 并**同批写回** `meta.last_req_seq`（纯内存；落盘恒由调用方 save() 承担——单批原子）。
 * 写回的是本次分配序号，保证归档移走条目后 seq 不回退（单调不复用）。
 * @returns 分配的 ID（`REQ-NNN`）
 */
export function allocateRequirementId(data: FlowData): string {
  const seq = requirementSeqFloor(data) + 1;
  if (data.meta && typeof data.meta === 'object') {
    data.meta.last_req_seq = seq;
  }
  return formatRequirementId(seq);
}

/** 终态判定（done/cancelled/rejected；claim / link 门共用） */
export function isTerminalRequirementStatus(status: RequirementStatus): boolean {
  return status === 'done' || status === 'cancelled' || status === 'rejected';
}

/** 裁定 4：全部关联阶段 done（零关联 → false，空集守卫）；v1.5.8 / REQ-028 多值经单点判定 */
export function allLinkedStagesDone(data: FlowData, requirementId: string): boolean {
  const linked = Object.values(data.stages ?? {}).filter((s) => stageRequirementIds(s).includes(requirementId));
  return linked.length > 0 && linked.every((s) => s.phase === 'done');
}

/**
 * 完成门「阶段已开工」相位集（v1.5.7 / REQ-023：需求完成与阶段关闭解耦）：
 * `exec_running` 及其后的全部执行 / 收口相位。阶段是**版本容器**（长期停留在 exec_running），
 * 需求是**工作单元**，因此阶段仍开启不应阻塞需求完成；plan / scheme 相位（计划方案未落地）仍拒绝。
 * 与流水线相位生命周期顺序同源，但本模块按 stage-90 正交纪律禁用相位表常量（禁用串零命中），故显式列举。
 */
const COMPLETION_READY_PHASES: readonly PipelinePhase[] = [
  'exec_running', 'review_pending', 'review_failed', 'review_passed',
  'test_pending', 'test_failed', 'test_passed', 'archiving', 'done',
];

/**
 * 完成门拒绝原因（v1.5.8 / REQ-027「完成必审验」）：命令层据此区分文案。
 * - `stage_phase`：关联阶段仍在 plan / scheme 相位（v1.5.7 判据，未变）
 * - `review`：缺审查记录或结果非 pass
 * - `verification`：缺验证记录或结果非 pass
 */
export type RequirementDoneBlocker = 'stage_phase' | 'review' | 'verification';

/**
 * 完成门判据（v1.5.7 / REQ-023 相位判据 + v1.5.8 / REQ-027 审查验证判据）：
 *   ① 零关联阶段 → 相位维度直接放行（允许显式完成；空集守卫只保留在聚合投影 aggregate.ts）；
 *   ② 有关联阶段 → 仅当**每个**关联阶段 phase ∈ COMPLETION_READY_PHASES（已进入 exec_running 及之后）时放行；
 *   ③ 追加硬门（REQ-027）：`review?.result === 'pass'` ∧ `verification?.result === 'pass'`——
 *      「完成必审验」：缺审查 / 缺验证一律拒绝，且**无 force 逃生口**（证据不可协商）。
 * 判据只看关联阶段相位与两条记录，不按 workflow_mode 分支（模式是调度属性，不入完成门）；
 * `allLinkedStagesDone` 仍是聚合 done 判定单源（aggregate.ts），与完成门解耦、语义不变。
 * @returns 首个不满足的判据（null = 可完成）；判定顺序固定：阶段相位 → 审查 → 验证
 */
export function requirementDoneBlocker(data: FlowData, req: RequirementData): RequirementDoneBlocker | null {
  const linked = Object.values(data.stages ?? {}).filter((s) => stageRequirementIds(s).includes(req.id));
  if (linked.length > 0 && !linked.every((s) => (COMPLETION_READY_PHASES as readonly string[]).includes(s.phase))) {
    return 'stage_phase';
  }
  if (req.review?.result !== 'pass') { return 'review'; }
  if (req.verification?.result !== 'pass') { return 'verification'; }
  return null;
}

/** 完成门布尔投影（单点消费者：`applyStatusChange`；文案分流用 `requirementDoneBlocker`） */
export function canCompleteRequirement(data: FlowData, req: RequirementData): boolean {
  return requirementDoneBlocker(data, req) === null;
}

// ═══ 审查 / 验证记录写路径（v1.5.8 / REQ-027「完成必审验」）═══

/** 需求审查记录入参（命令层 / 适配器共用；值域校验在本层单点） */
export interface ReviewRecordInput {
  /** 结论（值域 = REVIEW_RESULTS） */
  result: string;
  /** 审查者（非空） */
  by: string;
  /** 结论摘要（非空） */
  note: string;
  /** 是否独立审查（缺省 false = 自我审查，须显式标注） */
  independent?: boolean;
}

/** 需求验证记录入参（命令层 / 适配器共用；值域校验在本层单点） */
export interface VerificationRecordInput {
  /** 结论（值域 = REVIEW_RESULTS） */
  result: string;
  /** 验证种类（值域 = VERIFICATION_KINDS） */
  kind: string;
  /** 验证者（非空） */
  by: string;
  /** 结论摘要（非空） */
  note: string;
  /** 证据（命令 / 报告路径；可选，空串视为未提供） */
  evidence?: string;
}

/**
 * 记录需求审查（纯内存 + 单条审计 `requirement_review`；落盘恒由调用方 save()）。
 * 校验顺序固定（任一失败 → 零变更零审计）：需求存在 → 非终态 → result 值域 → by / note 非空。
 * 覆盖语义：新记录整体替换旧记录（不保留历史；历史在 `data.log` 审计里）。
 * @returns `{ ok: true, changed: true }`（记录写入即真实变更）或错误码
 */
export function recordRequirementReview(
  data: FlowData,
  id: string,
  input: ReviewRecordInput,
): RequirementOpResult {
  const req = (Array.isArray(data.requirements) ? data.requirements : []).find((r) => r?.id === id);
  if (!req) { return { ok: false, code: 'not_found' }; }
  if (isTerminalRequirementStatus(req.status)) { return { ok: false, code: 'invalid_status' }; }
  const result = typeof input?.result === 'string' ? input.result.trim() : '';
  const by = typeof input?.by === 'string' ? input.by.trim() : '';
  const note = typeof input?.note === 'string' ? input.note.trim() : '';
  if (!(REVIEW_RESULTS as readonly string[]).includes(result)) { return { ok: false, code: 'invalid_field' }; }
  if (by === '' || note === '') { return { ok: false, code: 'invalid_field' }; }
  const at = new Date().toISOString();
  const independent = input?.independent === true;
  req.review = { result: result as ReviewResult, by, at, note, independent };
  req.updated_at = at;
  appendRequirementLog(data, 'requirement_review', { id, result, by, independent });
  return { ok: true, changed: true };
}

/** 与 `recordRequirementReview` 同构的验证记录写入（审计 action `requirement_verification`） */
export function recordRequirementVerification(
  data: FlowData,
  id: string,
  input: VerificationRecordInput,
): RequirementOpResult {
  const req = (Array.isArray(data.requirements) ? data.requirements : []).find((r) => r?.id === id);
  if (!req) { return { ok: false, code: 'not_found' }; }
  if (isTerminalRequirementStatus(req.status)) { return { ok: false, code: 'invalid_status' }; }
  const result = typeof input?.result === 'string' ? input.result.trim() : '';
  const kind = typeof input?.kind === 'string' ? input.kind.trim() : '';
  const by = typeof input?.by === 'string' ? input.by.trim() : '';
  const note = typeof input?.note === 'string' ? input.note.trim() : '';
  const evidence = typeof input?.evidence === 'string' ? input.evidence.trim() : '';
  if (!(REVIEW_RESULTS as readonly string[]).includes(result)) { return { ok: false, code: 'invalid_field' }; }
  if (!(VERIFICATION_KINDS as readonly string[]).includes(kind)) { return { ok: false, code: 'invalid_field' }; }
  if (by === '' || note === '') { return { ok: false, code: 'invalid_field' }; }
  const at = new Date().toISOString();
  const record = {
    result: result as ReviewResult,
    kind: kind as VerificationKind,
    by, at, note,
    ...(evidence === '' ? {} : { evidence }),
  };
  req.verification = record;
  req.updated_at = at;
  appendRequirementLog(data, 'requirement_verification', { id, result, kind, by });
  return { ok: true, changed: true };
}

// ═══ 写路径原语 ═══

/**
 * 新建需求（恒 `status: 'draft'`；读侧宽容写路径；返回**本体**供调用方继续设 body_path）。
 * 非法入参（空 title / 非法 priority / 空 target_version）属构造期契约违反 → 抛错（唯一抛错原语，REV-81-015）。
 * REV-81-018 登记：add 构造期抛错 / update 运行期错误码为接受差异（与命令层分流矩阵同口径，REV-82-002）；stage-81 冻结面不统一。
 */
export function addRequirement(
  data: FlowData,
  input: { title: string; target_version?: string; priority?: RequirementPriority; workflow_mode?: WorkflowMode },
): RequirementData {
  const title = typeof input?.title === 'string' ? input.title.trim() : '';
  if (title === '') { throw new Error('需求标题不能为空'); }        // 非法入参：编程错误抛错（非业务冲突）
  if (input.priority !== undefined && !(REQ_PRIORITIES as readonly string[]).includes(input.priority)) {
    throw new Error(`需求优先级非法：${String(input.priority)}`);    // 值域单点 = REQ_PRIORITIES
  }
  if (input.workflow_mode !== undefined && !(WORKFLOW_MODES as readonly string[]).includes(input.workflow_mode)) {
    throw new Error(`需求工作流模式非法：${String(input.workflow_mode)}`);   // 值域单点 = WORKFLOW_MODES
  }
  // 命名统一（REV-81-012）：API 面恒 target_version（与存储字段同名，零映射层）
  if (input.target_version !== undefined && String(input.target_version).trim() === '') { throw new Error('预估版本不能为空串'); }
  // 非数组（损坏数据）视同空集重建——与其余原语「非数组 ≡ 空集」宽容口径统一（req/BUG-001 = REV-81-019 单点收口）；改自 ??=（??= 不替换非数组真值 → push 抛 TypeError）
  data.requirements = Array.isArray(data.requirements) ? data.requirements : [];
  const now = new Date().toISOString();
  const req: RequirementData = {
    id: allocateRequirementId(data),                               // 须在 push 之前分配（同批写回 meta.last_req_seq）
    title,
    status: 'draft',                                               // 新建即 draft（REV-81-005）
    created_at: now,
    updated_at: now,
  };
  if (input.target_version !== undefined) { req.target_version = String(input.target_version).trim(); }
  if (input.priority !== undefined) { req.priority = input.priority; }
  if (input.workflow_mode !== undefined) { req.workflow_mode = input.workflow_mode; }
  data.requirements.push(req);
  appendRequirementLog(data, 'requirement_add', { id: req.id, title: req.title });
  return req;                                                      // 本体（调用方继续设 body_path）
}

/** 子需求初值状态：拆分即发布（Q11 定稿——子需求直接入 `req next` 候选池，达成「并行接取就绪」） */
const SPLIT_CHILD_STATUS: RequirementStatus = 'scheduled';

/**
 * 拆分需求为若干子需求（T1 / Q4 定稿；纯内存 + 单条审计，落盘恒由调用方 save()）。
 * 门（顺序固定；任一失败 → **零变更零审计**）：
 *   ① children 非数组 / 空 → invalid_field（argument-shape）
 *   ② 父不存在 → not_found
 *   ③ 父终态 → invalid_status（与 claim / link 同款终态门）
 *   ④ 逐子项标题校验（trim 后空串）→ invalid_field
 *      —— **校验内容**对齐 add 构造期口径，**错误范式**为运行期错误码（REV-87-002 定稿：
 *      split 不复用 add 的抛错路径，自持校验循环，与 update 同族——命令层 failCode 分流零适配）。
 * 构造（校验全通过后单趟完成，循环内零可失败语句）：
 *   - 顺序分配 ID：第 N 子 = 当前 max + N（经 staged 容器复用 nextRequirementId **单源派生**——不新写解析）；
 *   - parent_id = 父 ID；status = SPLIT_CHILD_STATUS；created_at / updated_at 同批；
 *   - **一次性并入** data.requirements（半成品不可达——全成或零变更）；
 *   - 审计恰一条 requirement_split（detail {parentId, children: [ids]}——对齐 requirement_* 族命名）；
 *   - 父需求**零副作用**（状态不变 / 不刷 updated_at / 不写父侧字段——父流转由 feel 显式执行）。
 * 环检测：不写——子 ID 恒为新建 max+1、方向恒 `child → parent`，结构上无环。
 * 返回子需求**本体**列表（供调用方逐条铺正文，对齐 addRequirement 返回本体先例；禁浅副本路径）。
 */
export function splitRequirement(
  data: FlowData,
  parentId: string,
  children: Array<{ title: string }>,
): RequirementSplitResult {
  if (!Array.isArray(children) || children.length === 0) { return { ok: false, code: 'invalid_field' }; }
  const parent = (Array.isArray(data.requirements) ? data.requirements : []).find((r) => r?.id === parentId);
  if (!parent) { return { ok: false, code: 'not_found' }; }
  if (isTerminalRequirementStatus(parent.status)) { return { ok: false, code: 'invalid_status' }; }
  const titles: string[] = [];
  for (const c of children) {
    const title = typeof c?.title === 'string' ? c.title.trim() : '';
    if (title === '') { return { ok: false, code: 'invalid_field' }; }
    titles.push(title);
  }
  // staged 容器承载「当前 max」：复用 allocateRequirementId 单源派生 → 顺序分配且同批写回 meta.last_req_seq
  // （staged 与 data 共享同一 meta 引用；写回随调用方 save() 单批落盘）
  const list: RequirementData[] = Array.isArray(data.requirements) ? [...data.requirements] : [];
  const staged: FlowData = { ...data, requirements: list };
  const now = new Date().toISOString();
  const created: RequirementData[] = [];
  for (const title of titles) {
    const child: RequirementData = {
      id: allocateRequirementId(staged),
      title,
      status: SPLIT_CHILD_STATUS,
      parent_id: parentId,
      created_at: now,
      updated_at: now,
    };
    list.push(child);
    created.push(child);
  }
  data.requirements = list;
  appendRequirementLog(data, 'requirement_split', { parentId, children: created.map((c) => c.id) });
  return { ok: true, children: created };
}

/** 认领需求（占用校验；同 owner 幂等；终态拒绝；他人占用零变更零审计） */
export function claimRequirement(data: FlowData, id: string, owner: string): RequirementOpResult {
  const name = typeof owner === 'string' ? owner.trim() : '';
  if (name === '') { return { ok: false, code: 'invalid_field' }; }
  const req = (Array.isArray(data.requirements) ? data.requirements : []).find((r) => r?.id === id);
  if (!req) { return { ok: false, code: 'not_found' }; }
  if (isTerminalRequirementStatus(req.status)) { return { ok: false, code: 'invalid_status' }; }
  if (req.owner && req.owner !== name) { return { ok: false, code: 'already_claimed' }; }  // 数据零变更
  if (req.owner === name) { return { ok: true, changed: false }; }                          // 同 owner 幂等
  req.owner = name;
  req.claimed_at = new Date().toISOString();
  req.updated_at = req.claimed_at;
  appendRequirementLog(data, 'requirement_claim', { id, owner: name });
  return { ok: true, changed: true };
}

/** 释放认领（裁定 5：无占用者 = no-op 成功——不刷 updated_at / 不写审计；不设状态门） */
export function releaseRequirement(data: FlowData, id: string): RequirementOpResult {
  const req = (Array.isArray(data.requirements) ? data.requirements : []).find((r) => r?.id === id);
  if (!req) { return { ok: false, code: 'not_found' }; }
  if (!req.owner) { return { ok: true, changed: false }; }   // 无占用者：no-op 成功（不刷 updated_at / 不写审计）
  const prevOwner = req.owner;
  delete req.owner; delete req.claimed_at;
  req.updated_at = new Date().toISOString();
  appendRequirementLog(data, 'requirement_release', { id, owner: prevOwner });
  return { ok: true, changed: true };
}

/** 显式流转表（裁定 3；终态不再流转）——状态流转单点 */
const ALLOWED_TRANSITIONS: Record<RequirementStatus, RequirementStatus[]> = {
  draft: ['scheduled', 'blocked', 'cancelled', 'rejected'],
  scheduled: ['in_progress', 'blocked', 'cancelled', 'rejected'],
  in_progress: ['done', 'blocked', 'cancelled', 'rejected'],
  blocked: ['scheduled', 'in_progress', 'cancelled', 'rejected'],
  done: [], cancelled: [], rejected: [],
};

/**
 * 当前状态的合法目标列表（只读纯函数；领域外状态 → []）。
 * 命令层「列合法目标」的唯一来源——禁第二份流转表（REV-82-003）；返回副本，防调用方直改内部表。
 */
export function getAllowedNextStatuses(status: RequirementStatus): RequirementStatus[] {
  return [...(ALLOWED_TRANSITIONS[status] ?? [])];
}

/** 状态变更应用（唯一实现）：返回 false = invalid_status（含 done 门不满足） */
function applyStatusChange(data: FlowData, req: RequirementData, to: RequirementStatus): boolean {
  if (!(REQ_STATUSES as readonly string[]).includes(to)) { return false; }
  if (to === req.status) { return false; }                       // 同值由调用方按幂等 no-op 处理
  // 域外 status（存量脏数据 / 人工篡改）→ 查表得 undefined，守卫后与「表外组合」同语义，不抛 TypeError（REV-81-016）
  const allowed = ALLOWED_TRANSITIONS[req.status];
  if (!allowed || !allowed.includes(to)) { return false; }
  // 裁定 4 扩展（stage-93）：completion 判据单点（canCompleteRequirement），不再直呼路 1
  if (to === 'done' && !canCompleteRequirement(data, req)) { return false; }
  const from = req.status;
  req.status = to;
  req.updated_at = new Date().toISOString();                      // 状态维度刷新（单次赋值纪律，REV-81-013）
  appendRequirementLog(data, 'requirement_status', { id: req.id, from, to });
  return true;
}

/** 字段白名单（= RequirementData 可变字段名子集） */
const PATCH_WHITELIST = ['status', 'title', 'target_version', 'priority', 'workflow_mode'] as const;

/**
 * 更新需求（patch 白名单；全部维度先校验后落地——校验失败整 patch 零变更）。
 * 恒 raw find 改 `data.requirements` 本体（禁经 getRequirement 的浅副本——副本陷阱，REV-81-011）。
 */
export function updateRequirement(
  data: FlowData,
  id: string,
  patch: { status?: RequirementStatus; title?: string; target_version?: string; priority?: RequirementPriority; workflow_mode?: WorkflowMode },
): RequirementOpResult {
  // ① 内联 raw find（与 claim / release 同款）
  const req = (Array.isArray(data.requirements) ? data.requirements : []).find((r) => r?.id === id);
  if (!req) { return { ok: false, code: 'not_found' }; }

  const p = patch ?? {};
  const keys = Object.entries(p).filter(([, v]) => v !== undefined).map(([k]) => k);
  // ② 白名单外键（值非 undefined 才计）
  for (const k of keys) {
    if (!(PATCH_WHITELIST as readonly string[]).includes(k)) { return { ok: false, code: 'invalid_field' }; }
  }
  // ③ 全空 patch（或全 undefined 值）
  if (keys.length === 0) { return { ok: true, changed: false }; }

  // ④ 值校验（全部维度先校验，失败即整 patch 零变更）
  // REV-81-018 登记：add 构造期抛错 / update 运行期错误码为接受差异（与命令层分流矩阵同口径，REV-82-002）；stage-81 冻结面不统一。
  if (p.title !== undefined && String(p.title).trim() === '') { return { ok: false, code: 'invalid_field' }; }
  if (p.target_version !== undefined && (typeof p.target_version !== 'string' || p.target_version.trim() === '')) {
    return { ok: false, code: 'invalid_field' };
  }
  if (p.priority !== undefined && !(REQ_PRIORITIES as readonly string[]).includes(p.priority)) {
    return { ok: false, code: 'invalid_field' };
  }
  if (p.status !== undefined && !(REQ_STATUSES as readonly string[]).includes(p.status)) {
    return { ok: false, code: 'invalid_status' };
  }
  if (p.workflow_mode !== undefined && !(WORKFLOW_MODES as readonly string[]).includes(p.workflow_mode)) {
    return { ok: false, code: 'invalid_field' };                  // 值域单点 = WORKFLOW_MODES
  }
  // 载体制门（D-90-4）：general 仅限**无关联阶段**的需求（有链接阶段 → 拒绝；零变更零审计）
  if (p.workflow_mode === 'general') {
    const hasLinked = Object.values(data.stages ?? {}).some((s) => stageRequirementIds(s).includes(id));
    if (hasLinked) { return { ok: false, code: 'general_mode_conflict' }; }
  }

  // ⑥ 状态维度（= 当前则无变更；≠ 走单点 applyStatusChange）
  let statusChanged = false;
  if (p.status !== undefined && p.status !== req.status) {
    if (!applyStatusChange(data, req, p.status)) { return { ok: false, code: 'invalid_status' }; }
    statusChanged = true;
  }

  // ⑦ 字段维度（逐字段比较后对 raw 本体赋值；仅实际不同才赋值）
  const changedFields: string[] = [];
  if (p.title !== undefined) {
    const v = String(p.title).trim();
    if (req.title !== v) { req.title = v; changedFields.push('title'); }
  }
  if (p.target_version !== undefined) {
    const v = String(p.target_version).trim();
    if (req.target_version !== v) { req.target_version = v; changedFields.push('target_version'); }
  }
  if (p.priority !== undefined) {
    if (req.priority !== p.priority) { req.priority = p.priority; changedFields.push('priority'); }
  }
  if (p.workflow_mode !== undefined) {
    if (req.workflow_mode !== p.workflow_mode) { req.workflow_mode = p.workflow_mode; changedFields.push('workflow_mode'); }
  }

  // ⑧ updated_at 单次赋值纪律（REV-81-013）：字段维度实际变更且状态维度未变时刷新一次；
  //    状态维度已由 applyStatusChange 刷新，两维度并存时不重复赋值
  if (changedFields.length > 0) {
    if (!statusChanged) { req.updated_at = new Date().toISOString(); }
    appendRequirementLog(data, 'requirement_update', { id, fields: changedFields });
  }

  // ⑩
  return { ok: true, changed: statusChanged || changedFields.length > 0 };
}

/** 显式人工推进（裁定 M）；语义与 update({status}) 完全一致（同表同门同审计，零第二套） */
export function advanceRequirement(data: FlowData, id: string, to: RequirementStatus): RequirementOpResult {
  return updateRequirement(data, id, { status: to });
}

// ═══ 发布门与顺延（v1.5.8 / REQ-030）═══

/**
 * 版本号归一（**仅比较用**）：trim + 去单个前导 `v`。
 * 让 `v1.5.8` 与 `1.5.8` 视为同一版本；不校验形态（target_version 是自由文本维度）。
 */
function normalizeVersionToken(version: string): string {
  const trimmed = typeof version === 'string' ? version.trim() : '';
  return trimmed.startsWith('v') ? trimmed.slice(1) : trimmed;
}

/** target_version 是否等于给定版本（比较用归一；缺失 target_version → false） */
function sameRequirementVersion(target: string | undefined, version: string): boolean {
  return typeof target === 'string' && normalizeVersionToken(target) === normalizeVersionToken(version);
}

/** 发布检查分桶结果（只读；命令层人类 / JSON 输出共用） */
export interface ReleaseCheckResult {
  /** 归一后的版本号（回显用户输入 trim 值） */
  version: string;
  /** 已完成需求（status=done） */
  done: RequirementData[];
  /** 未完成需求（非终态：draft / scheduled / in_progress / blocked） */
  unfinished: RequirementData[];
  /** 其它（cancelled / rejected） */
  other: RequirementData[];
  /** 计数（四段；total = done + unfinished + other） */
  counts: { done: number; unfinished: number; other: number; total: number };
}

/**
 * 发布检查（**只读纯函数**，零写盘；v1.5.8 / REQ-030）：
 * 按 `target_version === version` 分三桶——done / 未完成（非终态）/ 其它（cancelled+rejected）。
 * 作为「软门」的唯一判据来源：`flow archive` 与 `req release-check` 共用，未完成需求**不阻断**发布，
 * 但归档需显式 `--allow-unfinished`。已归档需求不在 flow.json，故本函数只反映活跃集。
 */
export function releaseCheckRequirements(data: FlowData, version: string): ReleaseCheckResult {
  const done: RequirementData[] = [];
  const unfinished: RequirementData[] = [];
  const other: RequirementData[] = [];
  for (const req of getRequirements(data)) {
    if (!sameRequirementVersion(req.target_version, version)) { continue; }
    if (req.status === 'done') {
      done.push(req);
    } else if (isTerminalRequirementStatus(req.status)) {
      other.push(req);
    } else {
      unfinished.push(req);
    }
  }
  return {
    version: typeof version === 'string' ? version.trim() : '',
    done,
    unfinished,
    other,
    counts: { done: done.length, unfinished: unfinished.length, other: other.length, total: done.length + unfinished.length + other.length },
  };
}

/** 顺延结果（成功携实际改动需求列表；空列表 = no-op 成功） */
export type RolloverResult =
  | { ok: true; moved: RequirementData[] }
  | { ok: false; code: RequirementErrorCode };

/**
 * 未完成需求顺延到新版本（纯内存 + 单条审计 `requirement_rollover`；落盘恒由调用方 save()）。
 *
 * 门（顺序固定；任一失败 → **零变更零审计**）：
 *   ① `from` / `to` 归一后非空且不同 → 否则 invalid_field；
 *   ② `--id` 与 `--all` 必须且只能提供一个 → 否则 invalid_field（命令层亦做 argument-shape 守卫）；
 *   ③ `--id`：不存在 → not_found；终态 → invalid_status；`target_version` 不属于 `from` → invalid_field；
 *   ④ `--all`：仅取 `target_version === from` 且**非终态**的需求（终态静默跳过）。
 *
 * 写语义：`target_version = to`；`carried_from` 去重保序追加 `from`；`updated_at` 单次刷新。
 * 审计恰一条（detail `{from,to,ids,count}`；changed=0 时不写审计）。
 * @returns `{ ok: true, moved }`（moved 为空 = no-op 成功）或错误码
 */
export function rolloverRequirements(
  data: FlowData,
  from: string,
  to: string,
  options: { id?: string; all?: boolean },
): RolloverResult {
  const source = typeof from === 'string' ? from.trim() : '';
  const target = typeof to === 'string' ? to.trim() : '';
  if (source === '' || target === '' || normalizeVersionToken(source) === normalizeVersionToken(target)) {
    return { ok: false, code: 'invalid_field' };
  }
  const byId = typeof options?.id === 'string' && options.id !== '';
  const all = options?.all === true;
  if (byId === all) { return { ok: false, code: 'invalid_field' }; }   // 互斥且必选其一

  let candidates: RequirementData[];
  if (byId) {
    const req = (Array.isArray(data.requirements) ? data.requirements : []).find((r) => r?.id === options.id);
    if (!req) { return { ok: false, code: 'not_found' }; }
    if (isTerminalRequirementStatus(req.status)) { return { ok: false, code: 'invalid_status' }; }
    if (!sameRequirementVersion(req.target_version, source)) { return { ok: false, code: 'invalid_field' }; }
    candidates = [req];
  } else {
    candidates = (Array.isArray(data.requirements) ? data.requirements : []).filter(
      (r) => r && !isTerminalRequirementStatus(r.status) && sameRequirementVersion(r.target_version, source),
    );
  }

  if (candidates.length === 0) { return { ok: true, moved: [] }; }

  const at = new Date().toISOString();
  for (const req of candidates) {
    req.target_version = target;
    const carried = Array.isArray(req.carried_from) ? req.carried_from.filter((v) => typeof v === 'string') : [];
    // 去重保序：同一来源版本只记一次（回滚到旧版本再顺延时不会堆叠重复）
    req.carried_from = carried.includes(source) ? carried : [...carried, source];
    req.updated_at = at;
  }
  appendRequirementLog(data, 'requirement_rollover', {
    from: source,
    to: target,
    ids: candidates.map((r) => r.id),
    count: candidates.length,
  });
  return { ok: true, moved: candidates };
}

/**
 * 阶段需求关联写路径可选参数（v1.5.8 / REQ-028）。
 * `unlinkRequirementId` 仅在 `requirementId === null`（解绑方向）时生效：只解绑该需求；
 * 缺省 = 清空该阶段的**全部**关联（既有语义）。
 */
export interface LinkRequirementOptions {
  /** 只解绑这一个需求（其余关联保留；未关联 → no-op 零写盘） */
  unlinkRequirementId?: string;
}

/**
 * 归一阶段需求链接（纯函数：返回规范化列表，**不改** stage）。
 * - `requirements[]` 元素缺 `id` / 空串 / 重复 → 丢弃（读侧宽容，写前收敛）；
 * - `requirements` 缺省 / 空集 + 旧 `requirement_id` 非空 → 以旧单值构造单元素列表（**迁移语义**，防写多值时丢旧关联）。
 */
function normalizedStageLinks(stage: StageData): StageRequirementLink[] {
  const src = Array.isArray(stage.requirements) ? stage.requirements : [];
  const links: StageRequirementLink[] = [];
  const seen = new Set<string>();
  for (const link of src) {
    const id = typeof link?.id === 'string' ? link.id : '';
    if (id === '' || seen.has(id)) { continue; }
    seen.add(id);
    links.push({ ...link, id });
  }
  if (links.length === 0 && typeof stage.requirement_id === 'string' && stage.requirement_id !== '') {
    links.push({ id: stage.requirement_id });
  }
  return links;
}

/** 追加关联的排序键：取现有 order 最大值 +1（无 order 时退化为列表长度） */
function nextLinkOrder(links: StageRequirementLink[]): number {
  let next = links.length;
  for (const link of links) {
    if (typeof link.order === 'number' && Number.isFinite(link.order) && link.order >= next) {
      next = link.order + 1;
    }
  }
  return next;
}

/**
 * 阶段关联需求（stage 侧写点；v1.5.8 / REQ-028 **多值语义**）。
 *
 * 写语义：
 * - `requirementId` 非 null → **追加**关联（同一需求重复链接 → 幂等 no-op）；同一需求可挂多个阶段（既有语义保留）；
 * - `requirementId === null` ∧ 无 options → 清空该阶段**全部**关联（既有语义）；
 * - `requirementId === null` ∧ `options.unlinkRequirementId` → 只解绑该需求（其余保留）。
 *
 * 校验（顺序固定；任一失败 → 零变更零审计）：stage 不存在 → `stage_not_found`；需求不存在 → `not_found`；
 * 需求终态 → `invalid_status`；`workflow_mode === 'general'` → `general_mode_conflict`。
 *
 * 兼容：写路径**不再写** `requirement_id`（旧键存在时清空，避免双真源；读取仍经 stageRequirementIds 兜底）。
 * 审计：`requirement_link`，detail `{ stage, requirementId, action: 'link' | 'unlink' }`。
 * 不刷新 requirement.updated_at（关联写点落在 stage 记录，需求对象零变更）。
 */
export function linkRequirement(
  data: FlowData,
  stageId: string,
  requirementId: string | null,
  options: LinkRequirementOptions = {},
): RequirementOpResult {
  const stage = data.stages?.[stageId];
  if (!stage) { return { ok: false, code: 'stage_not_found' }; }     // ① 阶段不存在

  if (requirementId !== null) {
    const req = (Array.isArray(data.requirements) ? data.requirements : []).find((r) => r?.id === requirementId);
    if (!req) { return { ok: false, code: 'not_found' }; }                             // 需求不存在
    if (isTerminalRequirementStatus(req.status)) { return { ok: false, code: 'invalid_status' }; }  // 终态拒绝
    // 载体制门（D-90-4）：general（无流水线）需求不接受阶段关联
    if (req.workflow_mode === 'general') { return { ok: false, code: 'general_mode_conflict' }; }
    const links = normalizedStageLinks(stage);
    if (links.some((l) => l.id === requirementId)) { return { ok: true, changed: false }; }   // 同值幂等（多值模型下即「已链接」）
    links.push({ id: requirementId, order: nextLinkOrder(links) });
    stage.requirements = links;
    delete stage.requirement_id;               // 单值键退役（防双真源；旧数据读取仍兼容）
    appendRequirementLog(data, 'requirement_link', { stage: stageId, requirementId, action: 'link' });
    return { ok: true, changed: true };
  }

  // ③ null = 解绑方向（显式 null，对齐「可空」裁定 D）
  const links = normalizedStageLinks(stage);
  const target = options.unlinkRequirementId;
  if (target !== undefined) {
    // 只解绑指定需求（未关联 → no-op；旧单值同值键一并清理）
    const rest = links.filter((l) => l.id !== target);
    if (rest.length === links.length) {
      return { ok: true, changed: false };
    }
    if (rest.length === 0) { delete stage.requirements; } else { stage.requirements = rest; }
    if (stage.requirement_id === target) { delete stage.requirement_id; }
    appendRequirementLog(data, 'requirement_link', { stage: stageId, requirementId: target, action: 'unlink' });
    return { ok: true, changed: true };
  }
  // 清空全部（既有语义）：多值列表 + 旧单值键一并移除
  if (links.length === 0 && stage.requirement_id === undefined && stage.requirements === undefined) {
    return { ok: true, changed: false };
  }
  delete stage.requirements;
  delete stage.requirement_id;
  appendRequirementLog(data, 'requirement_link', { stage: stageId, requirementId: null, action: 'unlink' });
  return { ok: true, changed: true };
}
