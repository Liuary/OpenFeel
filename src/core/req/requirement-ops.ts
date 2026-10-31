/**
 * 需求原语 — 需求层纯内存操作的单一入口
 *
 * 职责：需求读取（读侧宽容 + 浅副本）、ID 分配、写路径原语（add / claim / release / update / advance / link）
 *       与共用谓词（终态判定 / 全部关联阶段 done（聚合单源）/ 完成门判据）。全部为**纯内存**操作 + 审计内嵌（`data.log`），
 *       零独立写盘点——落盘恒走调用方（命令层）的 `FlowManager` 落盘方法。
 * 边界声明：不依赖归档层；模式属性（workflow_mode?）为调度属性——本层只做「值域校验 + 载体制门」，
 *   解析 / 下发单点在 FlowManager；不参与聚合判定。
 */
import type { FlowData, PipelinePhase } from '../flow-manager.js';  // 仅类型（编译期擦除）
import { WORKFLOW_MODES, type WorkflowMode } from '../config.js';   // 值域单源（运行时值导入，禁就地三值字面量）
import {
  REQ_ID_PATTERN, REQ_PRIORITIES, REQ_STATUSES,
  type RequirementData, type RequirementPriority, type RequirementStatus,
} from './types.js';

/** 需求原语错误码（冻结；命令层据此映射 exit 非 0 零写盘） */
export type RequirementErrorCode =
  | 'not_found'        // 需求不存在
  | 'stage_not_found'  // 阶段不存在（link 专用）
  | 'already_claimed'  // 已被他人占用（claim）
  | 'already_linked'   // 阶段已属其它需求（link 重绑；须先解绑）
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

/** 下一个需求 ID：现存 id 数字部分 max+1（不回收；异常 id 跳过不崩） */
export function nextRequirementId(data: FlowData): string {
  let max = 0;
  for (const r of getRequirements(data)) {
    const m = REQ_ID_PATTERN.exec(typeof r?.id === 'string' ? r.id : '');
    if (!m) { continue; }                                    // 异常 id 跳过（不崩）
    const n = Number.parseInt(m[1], 10);
    if (Number.isFinite(n) && n > max) { max = n; }
  }
  return `REQ-${String(max + 1).padStart(3, '0')}`;
}

/** 终态判定（done/cancelled/rejected；claim / link 门共用） */
export function isTerminalRequirementStatus(status: RequirementStatus): boolean {
  return status === 'done' || status === 'cancelled' || status === 'rejected';
}

/** 裁定 4：全部关联阶段 done（零关联 → false，空集守卫） */
export function allLinkedStagesDone(data: FlowData, requirementId: string): boolean {
  const linked = Object.values(data.stages ?? {}).filter((s) => (s.requirement_id ?? null) === requirementId);
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
 * 完成门判据（v1.5.7 / REQ-023 supersede stage-93 的载体制对偶路径；`applyStatusChange` 单点消费）：
 *   ① 零关联阶段 → 直接放行（允许显式完成；空集守卫只保留在聚合投影 aggregate.ts——
 *      聚合仍为 null，禁把「显式完成」误当「自动收口」）；
 *   ② 有关联阶段 → 仅当**每个**关联阶段 phase ∈ COMPLETION_READY_PHASES（已进入 exec_running 及之后）时放行；
 *      任一阶段仍在 plan_pending / plan_review / plan_passed / scheme_pending / scheme_review / scheme_passed → 拒绝。
 * 判据只看关联阶段相位，不再按 workflow_mode 分支（模式是调度属性，不入完成门）；
 * `allLinkedStagesDone` 仍是聚合 done 判定单源（aggregate.ts），与完成门解耦、语义不变。
 */
export function canCompleteRequirement(data: FlowData, req: RequirementData): boolean {
  const linked = Object.values(data.stages ?? {}).filter((s) => (s.requirement_id ?? null) === req.id);
  if (linked.length === 0) { return true; }
  return linked.every((s) => (COMPLETION_READY_PHASES as readonly string[]).includes(s.phase));
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
    id: nextRequirementId(data),                                   // 须在 push 之前分配
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
  // staged 容器承载「当前 max」：复用 nextRequirementId 单源派生 → 顺序分配且不重解析
  const list: RequirementData[] = Array.isArray(data.requirements) ? [...data.requirements] : [];
  const staged: FlowData = { ...data, requirements: list };
  const now = new Date().toISOString();
  const created: RequirementData[] = [];
  for (const title of titles) {
    const child: RequirementData = {
      id: nextRequirementId(staged),
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
    const hasLinked = Object.values(data.stages ?? {}).some((s) => (s.requirement_id ?? null) === id);
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

/**
 * 阶段关联需求（stage 侧写点；`null` = 解绑）。
 * 终态需求拒绝关联、他人已关联阶段拒绝重绑（须先解绑）；
 * 不刷新 requirement.updated_at（关联写点落在 stage 记录，需求对象零变更）。
 */
export function linkRequirement(data: FlowData, stageId: string, requirementId: string | null): RequirementOpResult {
  const stage = data.stages?.[stageId];
  if (!stage) { return { ok: false, code: 'stage_not_found' }; }     // ① 阶段不存在

  if (requirementId !== null) {
    const req = (Array.isArray(data.requirements) ? data.requirements : []).find((r) => r?.id === requirementId);
    if (!req) { return { ok: false, code: 'not_found' }; }                             // 需求不存在
    if (isTerminalRequirementStatus(req.status)) { return { ok: false, code: 'invalid_status' }; }  // 终态拒绝
    // 载体制门（D-90-4）：general（无流水线）需求不接受阶段关联
    if (req.workflow_mode === 'general') { return { ok: false, code: 'general_mode_conflict' }; }
    if ((stage.requirement_id ?? null) === requirementId) { return { ok: true, changed: false }; }   // 同值幂等
    if (stage.requirement_id != null) { return { ok: false, code: 'already_linked' }; }              // 跨需求重绑
    stage.requirement_id = requirementId;
    appendRequirementLog(data, 'requirement_link', { stage: stageId, requirementId });
    return { ok: true, changed: true };
  }

  // ③ null = 解绑（显式 null，对齐「可空」裁定 D）
  if (stage.requirement_id == null) { return { ok: true, changed: false }; }
  stage.requirement_id = null;
  appendRequirementLog(data, 'requirement_link', { stage: stageId, requirementId: null });
  return { ok: true, changed: true };
}
