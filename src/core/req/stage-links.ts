/**
 * 阶段 ↔ 需求关联读取单点（v1.5.8 / REQ-028）
 *
 * 数据模型（两种形态并存，读侧以多值为权威）：
 * - `stage.requirements[]`：**权威**（一个阶段可挂多个需求；元素 `{ id, role?, order? }`）；
 * - `stage.requirement_id`：v1.5.7 及以前的**单值旧字段**，写路径已退役（不再写入），
 *   仅在 `requirements` 缺省 / 空集时作为旧数据兜底。
 *
 * 本模块只承载**一个**读取函数 `stageRequirementIds`，供聚合投影 / 命令层输出 / 归档摘要 /
 * 开发状态 / 模式级联共用——禁第二份 `requirement_id` 过滤表达式。
 *
 * 边界：不 import 任何**运行时**模块（仅类型擦除），避免与 flow-manager / aggregate 形成运行时环。
 */

/** 阶段需求关联的**结构最小面**（兼容 flow.json 原始 JSON 读取路径，如 dev-status） */
export interface StageRequirementFields {
  /** 多值关联（权威；读侧宽容：非数组 / 元素缺 id / 重复 id 均安全处理） */
  requirements?: ReadonlyArray<{ id?: string | null } | null | undefined> | null;
  /** 旧版单值关联（兼容兜底；缺省 / 空串 / null 一律视为未关联） */
  requirement_id?: string | null;
}

/**
 * 阶段关联需求 ID 列表（去重保序；`requirements[*].id` 顺序即声明顺序）。
 *
 * 兼容规则（单一判定点）：
 * - `requirements` 非空 → 返回其 `id` 序列（去重保序），**忽略** `requirement_id`（防双真源二义）；
 * - `requirements` 缺省 / 空 / 元素全非法 → 回落到 `requirement_id`（非空字符串时返回单元素）；
 * - 其余情况 → `[]`（阶段不存在 / 无任何关联）。
 *
 * @param stage 阶段记录（`StageData` 或 flow.json 原始 JSON 片段）
 * @returns 关联需求 ID 列表（读侧恒安全，不抛错）
 */
export function stageRequirementIds(stage: StageRequirementFields | null | undefined): string[] {
  if (!stage || typeof stage !== 'object') {
    return [];
  }
  const ids: string[] = [];
  const seen = new Set<string>();
  const links = Array.isArray(stage.requirements) ? stage.requirements : [];
  for (const link of links) {
    const id = typeof link?.id === 'string' ? link.id : '';
    if (id === '' || seen.has(id)) { continue; }
    seen.add(id);
    ids.push(id);
  }
  if (ids.length > 0) {
    return ids;
  }
  const legacy = typeof stage.requirement_id === 'string' ? stage.requirement_id : '';
  return legacy === '' ? [] : [legacy];
}
