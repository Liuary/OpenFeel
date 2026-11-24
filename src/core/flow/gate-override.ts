/**
 * GateOverride — 留痕放行的统一审计 schema（v1.7.0 / REQ-062 A62.2—A62.4）。
 *
 * **唯一构造点**：`flow advance --force`、`flow stage reset --force` 与各门
 * `allowGateOverride` 的放行路径都经 {@link buildGateOverrideAudit} 产出同一形状的
 * `appendLog.detail` 键集：
 *
 *   `gate_overrides`（本次实际被放行的门，原数组）
 * + `gate_missing`（可选：仅计划门有结构化缺项快照）
 * + `by` / `reason` / `from` / `to` / `at`（谁、为什么、从哪个相位到哪个相位、何时）
 *
 * 判定拒绝路径**零写盘零审计**：本模块只在门已放行后构造审计，不参与门判定。
 * 禁止在命令层 / 核心层就地拼第二份键集（A62.2 的 grep 断言）。
 */

/** `gate_overrides` 取值闭集（A62.2）：新增门必须在此登记。 */
export type GateOverrideGate = 'plan' | 'dev_sync' | 'req_review' | 'req_body' | 'req_plan';

/** 留痕放行的完整记录（输入/输出同形；`from`/`to` 必填）。 */
export interface GateOverride {
  /** 本次被放行的门（原数组，按触发顺序） */
  gates: GateOverrideGate[];
  /** 放行原因（缺省 `manual`；`flow advance --force --reason <text>` 带入） */
  reason: string;
  /** 放行者（`flow advance` = 触发者如 `cli`；`flow stage reset` = `flow-manager`） */
  by: string;
  /** 起始相位（由核心层按实际转换补全） */
  from: string;
  /** 目标相位 */
  to: string;
  /** 放行时刻（ISO） */
  at: string;
}

/** 写进 `appendLog.detail` 的审计键（`gate_missing` 仅计划门有结构化缺项时出现）。 */
export interface GateOverrideAudit {
  gate_overrides: GateOverrideGate[];
  gate_missing?: unknown;
  by: string;
  reason: string;
  from: string;
  to: string;
  at: string;
}

/** `--reason` 缺省值（A62.2：三处 `--force` 的 reason 缺省 `manual`）。 */
export const DEFAULT_GATE_OVERRIDE_REASON = 'manual';

/** 取第一个非空白字符串（空串/空白视为「未提供」，由核心层补全）。 */
function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() !== '') return value;
  }
  return undefined;
}

/**
 * 命令层构造入口：只给已知信息（reason / by / to …），`from` 与 `gates` 由核心层按实际
 * 转换/实际触发的门补齐（避免命令层猜相位）。
 */
export function createGateOverride(input: {
  gates?: GateOverrideGate[];
  reason?: string;
  by?: string;
  from?: string;
  to?: string;
  at?: string;
} = {}): GateOverride {
  return {
    gates: [...(input.gates ?? [])],
    reason: firstNonEmpty(input.reason) ?? DEFAULT_GATE_OVERRIDE_REASON,
    by: firstNonEmpty(input.by) ?? '',
    from: firstNonEmpty(input.from) ?? '',
    to: firstNonEmpty(input.to) ?? '',
    at: firstNonEmpty(input.at) ?? new Date().toISOString(),
  };
}

/**
 * 核心层归一：调用方元信息优先；缺省/空值由本次实际转换补齐。
 * `gates` 取**并集**——实际触发的门不得被调用方传的空数组抹掉（审计只增不减）。
 */
export function normalizeGateOverride(
  input: GateOverride | undefined,
  context: {
    gates: GateOverrideGate[];
    by: string;
    from: string;
    to: string;
    now?: string;
  },
): GateOverride {
  const gates = [...new Set<GateOverrideGate>([...(input?.gates ?? []), ...context.gates])];
  return {
    gates,
    reason: firstNonEmpty(input?.reason) ?? DEFAULT_GATE_OVERRIDE_REASON,
    by: firstNonEmpty(input?.by) ?? context.by,
    from: firstNonEmpty(input?.from) ?? context.from,
    to: firstNonEmpty(input?.to) ?? context.to,
    at: firstNonEmpty(input?.at) ?? context.now ?? new Date().toISOString(),
  };
}

/**
 * 唯一构造点：GateOverride（+ 可选缺项快照）→ `appendLog.detail` 审计键。
 * `gate_missing` 只在有结构化缺项时写入（账本门原因在 `error.detail`，不伪造快照）。
 */
export function buildGateOverrideAudit(
  override: GateOverride,
  gateMissing?: unknown,
): GateOverrideAudit {
  const audit: GateOverrideAudit = {
    gate_overrides: [...override.gates],
    by: override.by,
    reason: override.reason,
    from: override.from,
    to: override.to,
    at: override.at,
  };
  if (gateMissing !== undefined && gateMissing !== null) audit.gate_missing = gateMissing;
  return audit;
}
