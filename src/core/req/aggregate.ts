/**
 * 需求聚合投影与对称回写 — 阶段 phase 集合 → 需求状态的投影与内存回写
 *
 * 职责：① computeRequirementAggregate（纯投影；done 判定委托 allLinkedStagesDone 单一原语——REV-83-002；
 *       零关联 → aggregate = null，空集守卫禁误报 done）；② resolveRequirementStatusForStage（单阶段 → 目标状态，纯函数）；
 *       ③ syncRequirementStatus（对称回写入口，纯内存，返回受影响需求 ID 列表，供测试/日志）；
 *       ④ requirementHealthItems（需求对账项构造——悬空关联 / done 漂移；只读纯函数，warn-only 恒无 fail）。
 * 边界声明：不依赖归档层；模式属性（需求级模式字段）不入聚合 / 不入 done 门 / 不入对账（禁用串零命中，stage-90 保持）；
 *   对 flow-manager 仅 import type（防运行时环）。
 * 写盘：全部纯内存——落盘恒走调用方 FlowManager.save()（不新增写盘点）。
 */
import type { FlowData, HealthCheckItem, PipelinePhase } from '../flow-manager.js';   // 仅类型（编译期擦除；防运行时环）
import { allLinkedStagesDone } from './requirement-ops.js';   // done 判定唯一原语（REV-83-002）
import type { RequirementStatus } from './types.js';
import { t } from '../i18n.js';                                        // 对账文案（新键 flow.health.req*；双表成对）

/** auto-done 前置集（REV-83-004）：聚合 done 时自动置 done 的合法来源状态。
 *  health 漂移判据与此**同口径**（结构化单点，禁第二份列表）；draft/blocked/终态为设计豁免。 */
export const AUTO_DONE_PRECONDITION: readonly RequirementStatus[] = ['scheduled', 'in_progress'];

/** 聚合投影值域（三值；零关联 → null——空集守卫，禁误报 done） */
export type RequirementAggregateValue = 'scheduled' | 'in_progress' | 'done' | null;

/** 聚合投影结果（stageIds = data.stages 键序） */
export interface RequirementAggregate {
  /** 关联阶段 ID 列表（data.stages 键序） */
  stageIds: string[];
  /** 关联阶段数 */
  stageCount: number;
  /** 其中 phase === 'done' 的数量 */
  doneCount: number;
  /** 粗粒度投影：全 done → done；任一非 plan_pending → in_progress；全 plan_pending → scheduled；零关联 → null */
  aggregate: RequirementAggregateValue;
}

/**
 * 需求关联阶段（data.stages 键序；phase 供聚合与适配器共用）
 */
export interface LinkedStage {
  /** 阶段 ID（data.stages 键序） */
  id: string;
  /** 阶段当前相位 */
  phase: PipelinePhase;
}

/**
 * 需求关联阶段单点过滤（唯一实现；命令层与聚合共用）。
 * requirement_id 缺省 / 空串 / null 一律视为未关联（与既有 `(s.requirement_id ?? null) === requirementId` 等价）。
 * @param data flow 数据（只读）
 * @param requirementId 需求 ID
 * @returns 关联阶段列表（data.stages 键序）
 */
export function listLinkedStages(data: FlowData, requirementId: string): LinkedStage[] {
  return Object.entries(data.stages ?? {})
    .filter(([, s]) => (s.requirement_id ?? null) === requirementId)
    .map(([id, s]) => ({ id, phase: s.phase }));
}

/**
 * 需求聚合投影（纯函数；无 IO、无 this 依赖，给定输入相同输出）。
 * done 分支**委托** allLinkedStagesDone（含空集守卫同源）——禁第二份 done 表达式（REV-83-002）。
 * 零关联阶段 → aggregate = null（不参与 done 判定——空集守卫，禁误报）。
 */
export function computeRequirementAggregate(data: FlowData, requirementId: string): RequirementAggregate {
  const linked = listLinkedStages(data, requirementId);
  const stageIds = linked.map((l) => l.id);
  const stageCount = stageIds.length;
  let doneCount = 0;
  let anyStarted = false;
  for (const l of linked) {
    if (l.phase === 'done') { doneCount += 1; }
    if (l.phase !== 'plan_pending') { anyStarted = true; }
  }
  // 零关联 → null（空集守卫）；done 判定唯一经 allLinkedStagesDone 委托（禁第二份表达式）
  let aggregate: RequirementAggregateValue = null;
  if (stageCount > 0) {
    aggregate = allLinkedStagesDone(data, requirementId) ? 'done' : (anyStarted ? 'in_progress' : 'scheduled');
  }
  return { stageIds, stageCount, doneCount, aggregate };
}

/**
 * 单阶段 → 其关联需求的目标状态（纯函数；供回写入口消费）。
 * 阶段不存在 / 无关联（null / undefined / 空串）→ null（早返回单点——零动作）。
 */
export function resolveRequirementStatusForStage(
  data: FlowData,
  stageId: string,
): { requirementId: string; target: Exclude<RequirementAggregateValue, null> } | null {
  const stage = data.stages?.[stageId];
  const requirementId = stage?.requirement_id ?? null;
  if (!requirementId) { return null; }
  const agg = computeRequirementAggregate(data, requirementId);
  if (agg.aggregate === null) { return null; }   // 不可达（该阶段自身即关联）——防御
  return { requirementId, target: agg.aggregate };
}

/** 追加聚合回写审计日志（纯内存；save 由调用方承担；与需求原语审计同形——agent 'cli'，S-83-6） */
function appendAggregateLog(data: FlowData, action: string, detail: Record<string, unknown>): void {
  data.log.push({ time: new Date().toISOString(), agent: 'cli', action, detail });
}

/**
 * 需求聚合对称回写入口（纯内存；返回受影响需求 ID 列表）。
 * 规则（聚合视图表述——不绑定事件，REV-83-005 / plan 不变量 8）：
 * - 聚合 done ∧ status ∈ AUTO_DONE_PRECONDITION → 置 done + 审计 requirement_auto_done；
 * - 聚合 ≠ done ∧ status === 'done' → 回退 'in_progress'（不做 done→scheduled 细粒度回退，S-83-5）+ 审计 requirement_auto_reopen；
 * - 其余（前置集外 / 悬空关联 / 状态无变化）→ 零动作零审计。
 * 触发点由调用方约束：advance 仅 done 分支 / reset 写入后（op-002）；dry-run 路径均不可达。
 */
export function syncRequirementStatus(data: FlowData, stageId: string): string[] {
  const resolved = resolveRequirementStatusForStage(data, stageId);
  if (!resolved) { return []; }
  // raw find 改本体（禁经浅副本——与需求原语写路径同纪律）；非数组视同空集（读侧宽容，零注入）
  const req = (Array.isArray(data.requirements) ? data.requirements : []).find((r) => r?.id === resolved.requirementId);
  if (!req) { return []; }   // 悬空 requirement_id → 零动作（health 对账报告，不自动修）
  const affected: string[] = [];
  if (resolved.target === 'done') {
    // 正向：聚合 done ∧ 前置集内 → done（前置集外零动作零审计——REV-83-004）
    if ((AUTO_DONE_PRECONDITION as readonly string[]).includes(req.status)) {
      const from = req.status;
      req.status = 'done';
      req.updated_at = new Date().toISOString();
      appendAggregateLog(data, 'requirement_auto_done', { requirementId: req.id, from, to: 'done', triggerStage: stageId });
      affected.push(req.id);
    }
  } else if (req.status === 'done') {
    // 对称回退（聚合视图，不绑定事件）：聚合 ≠ done ∧ status === done → in_progress（REV-83-005）
    req.status = 'in_progress';
    req.updated_at = new Date().toISOString();
    appendAggregateLog(data, 'requirement_auto_reopen', { requirementId: req.id, from: 'done', to: 'in_progress', triggerStage: stageId });
    affected.push(req.id);
  }
  return affected;
}

/** 需求对账 section（悬空关联；恒产生 1 条 pass/warn——对齐归档对账 a 项先例） */
const SECTION_REQ_LINKS = '需求对账';
/** 需求漂移 section（仅非空时产生 warn——对齐归档对账 b 项先例） */
const SECTION_REQ_DRIFT = '需求漂移';

/**
 * 需求对账检查项（只读纯函数）：① 悬空 requirement_id（阶段引用的需求不存在）；
 * ② done 漂移（**前置集内**（AUTO_DONE_PRECONDITION 同口径单点）∧ 聚合 done ∧ status ≠ done——
 * draft/blocked/终态为设计豁免不报）。恒无 fail → 不改退出码、不参与 --fix（对齐归档对账范式）。
 */
export function requirementHealthItems(input: { data: FlowData; lang?: string }): HealthCheckItem[] {
  const { data } = input;
  const lang = input.lang ?? 'zh-CN';
  const items: HealthCheckItem[] = [];
  const requirements = Array.isArray(data.requirements) ? data.requirements : [];
  const ids = new Set(requirements.map((r) => r?.id).filter((x): x is string => typeof x === 'string'));

  // ① 悬空需求关联（阶段 → 不存在需求）
  const dangling: string[] = [];
  for (const [stageId, s] of Object.entries(data.stages ?? {})) {
    const rid = s?.requirement_id ?? null;
    if (rid !== null && rid !== '' && !ids.has(rid)) { dangling.push(`${stageId} → ${rid}`); }
  }
  if (dangling.length === 0) {
    items.push({ section: SECTION_REQ_LINKS, status: 'pass', message: t('flow.health.reqLinksPassTmpl', lang, { n: String(requirements.length) }) });
  } else {
    items.push({ section: SECTION_REQ_LINKS, status: 'warn', message: t('flow.health.reqDanglingTmpl', lang, { items: dangling.slice(0, 5).join(', ') }) });
  }

  // ② done 漂移：与回写守卫**同口径**（AUTO_DONE_PRECONDITION 单点——禁第二份前置集列表）
  const drifted: string[] = [];
  for (const r of requirements) {
    if (!(AUTO_DONE_PRECONDITION as readonly string[]).includes(r.status)) { continue; }   // 前置集外（含 draft/blocked/终态）设计豁免
    if (computeRequirementAggregate(data, r.id).aggregate === 'done') { drifted.push(r.id); }
  }
  if (drifted.length > 0) {
    items.push({ section: SECTION_REQ_DRIFT, status: 'warn', message: t('flow.health.reqDriftTmpl', lang, { items: drifted.slice(0, 5).join(', ') }) });
  }
  return items;
}
