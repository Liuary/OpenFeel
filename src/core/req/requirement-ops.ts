/**
 * 需求原语 — 需求层纯内存操作的单一入口
 *
 * 职责：需求读取（读侧宽容 + 浅副本）、ID 分配、写路径原语（add / claim / release / update / advance / link）
 *       与共用谓词（终态判定 / 全部关联阶段 done）。全部为**纯内存**操作 + 审计内嵌（`data.log`），
 *       零独立写盘点——落盘恒走调用方（命令层）的 `FlowManager` 落盘方法。
 * 正交声明：不依赖归档层 / 不引用工作流模式字段。
 */
import type { FlowData } from '../flow-manager.js';                 // 仅类型（编译期擦除）
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
  | 'invalid_field';   // 字段门拒绝（白名单外键 / 非法值 / owner 空串 / title 空串）

/** 写路径原语结果（ok=false 时携错误码；命令层映射 exit 非 0 零写盘） */
export type RequirementOpResult = { ok: true; changed: boolean } | { ok: false; code: RequirementErrorCode };

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

// ═══ 写路径原语 ═══

/**
 * 新建需求（恒 `status: 'draft'`；读侧宽容写路径；返回**本体**供调用方继续设 body_path）。
 * 非法入参（空 title / 非法 priority / 空 target_version）属构造期契约违反 → 抛错（唯一抛错原语，REV-81-015）。
 */
export function addRequirement(
  data: FlowData,
  input: { title: string; target_version?: string; priority?: RequirementPriority },
): RequirementData {
  const title = typeof input?.title === 'string' ? input.title.trim() : '';
  if (title === '') { throw new Error('需求标题不能为空'); }        // 非法入参：编程错误抛错（非业务冲突）
  if (input.priority !== undefined && !(REQ_PRIORITIES as readonly string[]).includes(input.priority)) {
    throw new Error(`需求优先级非法：${String(input.priority)}`);    // 值域单点 = REQ_PRIORITIES
  }
  // 命名统一（REV-81-012）：API 面恒 target_version（与存储字段同名，零映射层）
  if (input.target_version !== undefined && String(input.target_version).trim() === '') { throw new Error('预估版本不能为空串'); }
  data.requirements ??= [];                                        // 写路径兜底（REV-81-003）
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
  data.requirements.push(req);
  appendRequirementLog(data, 'requirement_add', { id: req.id, title: req.title });
  return req;                                                      // 本体（调用方继续设 body_path）
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

/** 状态变更应用（唯一实现）：返回 false = invalid_status（含 done 门不满足） */
function applyStatusChange(data: FlowData, req: RequirementData, to: RequirementStatus): boolean {
  if (!(REQ_STATUSES as readonly string[]).includes(to)) { return false; }
  if (to === req.status) { return false; }                       // 同值由调用方按幂等 no-op 处理
  // 域外 status（存量脏数据 / 人工篡改）→ 查表得 undefined，守卫后与「表外组合」同语义，不抛 TypeError（REV-81-016）
  const allowed = ALLOWED_TRANSITIONS[req.status];
  if (!allowed || !allowed.includes(to)) { return false; }
  if (to === 'done' && !allLinkedStagesDone(data, req.id)) { return false; }  // 裁定 4（零关联拒绝）
  const from = req.status;
  req.status = to;
  req.updated_at = new Date().toISOString();                      // 状态维度刷新（单次赋值纪律，REV-81-013）
  appendRequirementLog(data, 'requirement_status', { id: req.id, from, to });
  return true;
}

/** 字段白名单（= RequirementData 可变字段名子集） */
const PATCH_WHITELIST = ['status', 'title', 'target_version', 'priority'] as const;

/**
 * 更新需求（patch 白名单；全部维度先校验后落地——校验失败整 patch 零变更）。
 * 恒 raw find 改 `data.requirements` 本体（禁经 getRequirement 的浅副本——副本陷阱，REV-81-011）。
 */
export function updateRequirement(
  data: FlowData,
  id: string,
  patch: { status?: RequirementStatus; title?: string; target_version?: string; priority?: RequirementPriority },
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
