/**
 * 遵守率指标（v1.6.1 / REQ-066 A66.3）— 纯函数，零 I/O。
 *
 * 目标：把「主会话只调度、不直接写仓库」从口头约定变成**可量化**的四项指标：
 *
 * | 指标 | 分子 | 分母 | 样本窗口 |
 * |------|------|------|----------|
 * | `mainWriteRatio` | guard audit 中 `origin=root` 的**写决策** | 写决策中的 root + 子 Agent 派生写调用（`origin=subagent/delegated`）+ `origin` 缺失（计为 unknown）；**纯只读 shell 审计不计入** | `.openfeel/log/guard-audit.jsonl` 全量 |
 * | `subagentPerReq` | 台账中 `role=executor` 且 `closing.status='done'` 的派发数 | 当前进行中需求数（`status='in_progress'`） | 台账（24h / 200 行）+ 当前 flow.json |
 * | `syncGapMinutes` | 现在 − `.openfeel/dev/.sync.json` 的 `last_sync`（毫秒） | 60000（1 分钟） | 最近一次同步时刻 |
 * | `violationRate` | guard audit 中 `decision='deny'` 的条数 | 全部 guard 决策（allow / deny / warn） | `.openfeel/log/guard-audit.jsonl` 全量 |
 *
 * **「写决策」口径（A66.3 / v1.6.1 修复）**：guard audit 记录的是**门禁决策**而不是「一次写」——
 * 只读 shell 命令也会留审计（`kind:'none'` / `reason:'shell-no-write'`），把它们算进
 * `mainWriteRatio` 分母会把比率稀释成假的「主会话写得少」。因此先按行判定是否为写决策：
 *   ① `decision==='deny'`（被拒的写尝试）→ 写；
 *   ② `tool ∈ {write, edit, diagram_apply}`（写工具）→ 写；
 *   ③ shell 分类（审计 `kind`）：`none` / `undecidable` / `readonly-interpreter` → **只读**，
 *      其余（`targets` / `whole-tree` / `indirect` / `class1` / `class2` …）→ 写；
 *   ④ 旧审计行没有 `kind` 时按 `reason` 兜底（`shell-no-write` / `shell-undecidable` /
 *      `shell-readonly-interpreter` → 只读），仍无法归类 → **保守计入分母**。
 * 纯只读样本全部排除后分母为 0 ⇒ `value:null`（不是 0）。
 *
 * 边界纪律：
 * - **样本不足 → `value:null`，绝不返回 NaN / Infinity**（0/0 不是 0）；
 * - 每个指标都带 `definition`（分子/分母 + 样本窗口），默认中文口径取自本文件常量；
 * - 这是**只读观测**（用户裁定 ②：不做硬拦、不产生 deny），调用方不得用它驱动门禁；
 * - 指标定义与采集分离：本文件只算数，读文件在命令层（`src/commands/lint.ts`）完成。
 */

/** 四个指标键（报告键名与分析口径的单一清单）。 */
export const ADHERENCE_METRIC_KEYS = Object.freeze([
  'mainWriteRatio',
  'subagentPerReq',
  'syncGapMinutes',
  'violationRate',
] as const);

/** 指标键字面量联合。 */
export type AdherenceMetricKey = (typeof ADHERENCE_METRIC_KEYS)[number];

/** 台账一行里我们关心的字段（读侧宽容：缺什么都行）。 */
export interface DispatchRecordInput {
  dispatchId?: string;
  stage?: string;
  phase?: string;
  role?: string;
  targetAgent?: string;
  origin?: string;
  closing?: { status?: string } | null;
}

/** guard audit 一行（`.openfeel/log/guard-audit.jsonl`）。 */
export interface GuardAuditRecordInput {
  event?: string;
  decision?: string;
  tool?: string;
  /** shell 分类（`none` / `undecidable` / `readonly-interpreter` / `targets` / `class1` …）；非 shell 行为空。 */
  kind?: string;
  /** 审计原因（`shell-no-write` / `shell-undecidable` / `phase` …）；旧审计行可按它兜底判只读。 */
  reason?: string;
  /** v1.6.1 起可携带来源：`root` = 主会话，`subagent`/`delegated` = 子 Agent 派生。缺失计为 unknown。 */
  origin?: string;
}

/** 会话登记一行（`.openfeel/dev/sessions.json` 的 `sessions[]`）。 */
export interface SessionRecordInput {
  id?: string;
  stage?: string | null;
  lastSeen?: string;
}

/** dev 同步元数据（`.openfeel/dev/.sync.json`；只取 `last_sync`）。 */
export interface DevSyncInput {
  lastSync?: string | null;
}

/** 需求记录（只取 `status`；`in_progress` 才算「进行中」）。 */
export interface RequirementInput {
  id?: string;
  status?: string;
}

/** `computeAdherence` 的输入（全部可选：缺失 = 空样本）。 */
export interface AdherenceInput {
  dispatchRecords?: readonly DispatchRecordInput[] | null;
  guardAudit?: readonly GuardAuditRecordInput[] | null;
  sessions?: readonly SessionRecordInput[] | null;
  devSync?: DevSyncInput | null;
  requirements?: readonly RequirementInput[] | null;
  /** 当前时间（毫秒）；缺省 `Date.now()`，测试注入用。 */
  now?: number;
}

/** 一个指标的口径数据（分子/分母/窗口/未知来源计数 + 人话定义）。 */
export interface AdherenceDefinition {
  /** 分子（口径见 `definition`）。 */
  numerator: number;
  /** 分母；`0` → `value:null`（样本不足）。 */
  denominator: number;
  /** 样本窗口说明。 */
  window: string;
  /** 分母中「来源缺失、无法归因」的条数（仅 `mainWriteRatio` 非 0）。 */
  unknown: number;
  /** 一句话口径（分子/分母 + 样本窗口），供 `--json` 与 feel_verify 输出。 */
  definition: string;
}

/** 单个指标（A66.3 要求的最小形状：`{value, definition}`）。 */
export interface AdherenceMetric {
  value: number | null;
  definition: string;
}

/** `computeAdherence` 的报告。 */
export interface AdherenceReport {
  mainWriteRatio: AdherenceMetric;
  subagentPerReq: AdherenceMetric;
  syncGapMinutes: AdherenceMetric;
  violationRate: AdherenceMetric;
  /** 每个指标的完整口径（供人类摘要与测试断言；不直接进 CLI JSON）。 */
  definitions: Record<AdherenceMetricKey, AdherenceDefinition>;
  /** 样本量（人类摘要用于「样本不足」自证；不直接进 CLI JSON）。 */
  sample: {
    dispatchRecords: number;
    guardAudit: number;
    /** guard audit 里被判定为「写决策」的行数（`mainWriteRatio` 的分母口径）。 */
    guardAuditWriteDecisions: number;
    sessions: number;
    requirements: number;
    inProgressRequirements: number;
    closedExecutorDispatches: number;
  };
}

/** 安全取数组（缺失 / 非数组 → 空数组）。 */
function asArray<T>(value: readonly T[] | null | undefined): readonly T[] {
  return Array.isArray(value) ? value : [];
}

/**
 * 比率：分母 ≤ 0 / 非有限 → `null`（样本不足，**不是 0**，也绝不 NaN）。
 * @param numerator 分子
 * @param denominator 分母
 */
function ratio(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return null;
  }
  return numerator / denominator;
}

/** 统一大小写 + 去空白的 origin 归一。 */
function normalizeOrigin(value: unknown): 'root' | 'subagent' | 'unknown' {
  const origin = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (origin === 'root') return 'root';
  if (origin === 'subagent' || origin === 'delegated' || origin === 'child') return 'subagent';
  return 'unknown';
}

/** 写工具白名单（guard audit 的 `tool` 字段）：命中即「写决策」。 */
const WRITE_TOOLS: ReadonlySet<string> = new Set(['write', 'edit', 'diagram_apply']);

/**
 * 只读 / 不可判的 shell 分类（shell 分支审计的 `kind`）：
 * `none` = 确认无写目标；`undecidable` = 静态不可判（默认告警放行）；`readonly-interpreter` = 只读内联。
 * 这三类都不是「写决策」，不得进 `mainWriteRatio` 分母。
 */
const READ_ONLY_SHELL_KINDS: ReadonlySet<string> = new Set(['none', 'undecidable', 'readonly-interpreter']);

/** 旧审计行没有 `kind` 时的只读 reason 兜底（与上表同口径）。 */
const READ_ONLY_SHELL_REASONS: ReadonlySet<string> = new Set([
  'shell-no-write',
  'shell-undecidable',
  'shell-readonly-interpreter',
]);

/** 小写 + 去空白（非字符串 → 空串）。 */
function normalizeToken(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/**
 * 判定一条 guard 审计是否「写决策」（A66.3 口径，逐条见文件头）。
 *
 * 纯只读 shell 审计（确认无写 / 静态不可判 / 只读内联）不算写决策；无法归类的行
 * **保守计入**（宁可分母偏大，也不把真正的写调用漏掉）。
 */
export function isWriteDecision(record: GuardAuditRecordInput): boolean {
  if (record === null || typeof record !== 'object') return false;
  if (normalizeToken(record.decision) === 'deny') return true;
  if (WRITE_TOOLS.has(normalizeToken(record.tool))) return true;
  const kind = normalizeToken(record.kind);
  if (kind !== '') return !READ_ONLY_SHELL_KINDS.has(kind);
  if (READ_ONLY_SHELL_REASONS.has(normalizeToken(record.reason))) return false;
  return true;
}

/**
 * 计算遵守率四项指标（纯函数：同输入 → 同输出，零 I/O、零时钟副作用）。
 *
 * @param input 采集到的台账 / guard audit / 会话 / dev 同步 / 需求（全部可缺省）
 * @returns 四指标 + 口径定义 + 样本量
 */
export function computeAdherence(input: AdherenceInput = {}): AdherenceReport {
  const dispatchRecords = asArray(input.dispatchRecords);
  const guardAudit = asArray(input.guardAudit);
  const sessions = asArray(input.sessions);
  const requirements = asArray(input.requirements);
  const now = typeof input.now === 'number' && Number.isFinite(input.now) ? input.now : Date.now();

  // ── ① mainWriteRatio：写决策中的 root 调用 / 写决策总数 ─────────────────
  // 只读 shell 审计（kind:'none' / 'undecidable' / 'readonly-interpreter' 等）不进分子分母。
  let rootWrites = 0;
  let subagentWrites = 0;
  let unknownWrites = 0;
  for (const entry of guardAudit) {
    if (entry === null || typeof entry !== 'object') continue;
    if (!isWriteDecision(entry)) continue;
    const origin = normalizeOrigin(entry.origin);
    if (origin === 'root') rootWrites += 1;
    else if (origin === 'subagent') subagentWrites += 1;
    else unknownWrites += 1;
  }
  const writeDenominator = rootWrites + subagentWrites + unknownWrites;
  const mainWriteRatio: AdherenceMetric = {
    value: ratio(rootWrites, writeDenominator),
    definition: `分子 = guard audit 的**写决策**中 origin=root 的 ${rootWrites} 条；分母 = 写决策中 root + 子 Agent 派生写调用（origin=subagent/delegated）+ origin 缺失（unknown ${unknownWrites} 条，已计入分母并标注），共 ${writeDenominator} 条；写决策判定 = decision='deny' 或 tool ∈ {write,edit,diagram_apply} 或 shell 分类 kind 非 none/undecidable/readonly-interpreter；纯只读 shell 审计（shell-no-write / shell-undecidable / readonly-interpreter）不计入；样本窗口 = .openfeel/log/guard-audit.jsonl 全量（仅写决策行）。`,
  };

  // ── ② subagentPerReq：已 close 的 executor 派发 / 进行中需求 ──
  const closedExecutorDispatches = dispatchRecords.filter((record) => (
    record !== null
    && typeof record === 'object'
    && record.role === 'executor'
    && record.closing !== null
    && record.closing !== undefined
    && record.closing.status === 'done'
  )).length;
  const inProgressRequirements = requirements.filter((req) => (
    req !== null && typeof req === 'object' && req.status === 'in_progress'
  )).length;
  const subagentPerReq: AdherenceMetric = {
    value: ratio(closedExecutorDispatches, inProgressRequirements),
    definition: `分子 = 派发台账中 role=executor 且 closing.status='done' 的派发 ${closedExecutorDispatches} 条；分母 = 进行中需求（status='in_progress'）${inProgressRequirements} 个；样本窗口 = .openfeel/dev/dispatch.jsonl（24h / 200 行）+ 当前 flow.json。`,
  };

  // ── ③ syncGapMinutes：现在 − dev/.sync.json 的 last_sync（分钟） ──
  const lastSyncRaw = input.devSync !== null && input.devSync !== undefined
    && typeof input.devSync.lastSync === 'string'
    ? input.devSync.lastSync
    : '';
  const lastSyncMs = lastSyncRaw === '' ? Number.NaN : Date.parse(lastSyncRaw);
  const gapMs = Number.isFinite(lastSyncMs) ? Math.max(0, now - lastSyncMs) : Number.NaN;
  const syncGapMinutes: AdherenceMetric = {
    value: Number.isFinite(gapMs) ? Math.round(gapMs / 60_000) : null,
    definition: `分子 = 现在与 .openfeel/dev/.sync.json 的 last_sync 的毫秒差（缺失/不可解析 → null，未来时间按 0）；分母 = 60000（1 分钟），值 = 分子/分母 后取整分钟；样本窗口 = 最近一次同步时刻（单点，无平均）。`,
  };

  // ── ④ violationRate：guard deny / 全部 guard 决策 ──
  let denyDecisions = 0;
  let totalDecisions = 0;
  for (const entry of guardAudit) {
    if (entry === null || typeof entry !== 'object') continue;
    const decision = typeof entry.decision === 'string' ? entry.decision.trim().toLowerCase() : '';
    if (decision !== 'allow' && decision !== 'deny' && decision !== 'warn') continue;
    totalDecisions += 1;
    if (decision === 'deny') denyDecisions += 1;
  }
  const violationRate: AdherenceMetric = {
    value: ratio(denyDecisions, totalDecisions),
    definition: `分子 = guard audit 中 decision='deny' 的条数 ${denyDecisions}；分母 = 全部 guard 决策（allow + deny + warn）${totalDecisions}；样本窗口 = .openfeel/log/guard-audit.jsonl 全量。`,
  };

  const definitions: Record<AdherenceMetricKey, AdherenceDefinition> = {
    mainWriteRatio: {
      numerator: rootWrites,
      denominator: writeDenominator,
      window: '.openfeel/log/guard-audit.jsonl（全量；仅写决策）',
      unknown: unknownWrites,
      definition: mainWriteRatio.definition,
    },
    subagentPerReq: {
      numerator: closedExecutorDispatches,
      denominator: inProgressRequirements,
      window: '.openfeel/dev/dispatch.jsonl（24h / 200 行）+ 当前 flow.json',
      unknown: 0,
      definition: subagentPerReq.definition,
    },
    syncGapMinutes: {
      numerator: Number.isFinite(gapMs) ? Math.round(gapMs) : 0,
      denominator: 60_000,
      window: '.openfeel/dev/.sync.json 的 last_sync（单点）',
      unknown: 0,
      definition: syncGapMinutes.definition,
    },
    violationRate: {
      numerator: denyDecisions,
      denominator: totalDecisions,
      window: '.openfeel/log/guard-audit.jsonl（全量）',
      unknown: 0,
      definition: violationRate.definition,
    },
  };

  return {
    mainWriteRatio,
    subagentPerReq,
    syncGapMinutes,
    violationRate,
    definitions,
    sample: {
      dispatchRecords: dispatchRecords.length,
      guardAudit: guardAudit.length,
      guardAuditWriteDecisions: writeDenominator,
      sessions: sessions.length,
      requirements: requirements.length,
      inProgressRequirements,
      closedExecutorDispatches,
    },
  };
}
