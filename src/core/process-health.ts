/**
 * 流程健康（v1.5.6-stage-116）—— 零运行时开销的代理指标
 *
 * REQ-016：v1.5.5 加了 preflight 闸门，但无法验证它是否真的在起作用。
 * 本模块**不加监控、不告警、不写盘**，只从已存在的两份账本推导三项代理指标：
 * 1. resumed 比例（`flow.json.log` 的 `advance_stage_phase`）；
 * 2. `plan_pending → plan_review` 平均停留（同一日志；锚点复用 `phase-entered.ts` 的
 *    `findPhaseEntry`，即与 `findPhaseEnteredAtMs` 同一次回扫的唯一实现，REV-023）；
 * 3. 最近 preflight 年龄（`.openfeel/dev/.preflight.json`，只读）。
 *
 * 硬约束：
 * - 全部为**纯函数**（零 I/O、零副作用），非法输入一律降级跳过，**绝不抛**；
 * - 不新增写盘；本模块不 import `preflight.ts` 的写入口（只 import 其类型与阈值常量）；
 * - token 无法直接测 ⇒ 这些只是「流程行为是否变化」的代理指标（见 docs/commands.md 局限）。
 */
import { MAX_LOG_ENTRIES, type LogEntry } from './flow-manager.js';
import { findPhaseEntry, type PhaseEntryAnchor } from './phase-entered.js';
import { PREFLIGHT_MAX_AGE_MS, type PreflightRecord } from './preflight.js';

/**
 * 统计窗口 = 全保留条目。
 *
 * 不设「最近 50 条」：`MAX_LOG_ENTRIES = 200` 已是最小保留集，再截窗会让 n 掉到 ≈1，
 * 「无样本」会掩盖真实信号（R3 裁定）。
 */
export const PROCESS_HEALTH_WINDOW = MAX_LOG_ENTRIES;

/** resumed 比例（分母 = 带布尔标注的**推进**条目）。 */
export interface ResumedRatio {
  /** 实际参与计算的日志条目数（窗口大小，非日志总量） */
  window: number;
  /** 窗口内 `advance_stage_phase` 条目数 */
  advance: number;
  /** 其中 `resumed` 为布尔值的条目数（**分母**） */
  labeled: number;
  /** 其中 `resumed === true` 的条目数（**分子**） */
  resumedTrue: number;
  /** `advance - labeled`（结构性不可判定，必须外显） */
  unlabeled: number;
  /** `resumedTrue / labeled`；`labeled === 0` → `null`（不除零、不输出 0.0%） */
  ratio: number | null;
}

/** 一次成功配对的 dwell 样本。 */
export interface PlanDwellSample {
  stage: string;
  startAt: string;
  endAt: string;
  ms: number;
  anchor: PhaseEntryAnchor;
}

/** `plan_pending → plan_review` 平均停留。 */
export interface PlanDwell {
  /** `detail.to === 'plan_review'` 的 advance 事件总数 */
  events: number;
  /** 成功配对（有锚 + 时间可解析 + 非倒序）的样本数 */
  samples: number;
  /** 无锚 / 时间不可解析 / 倒序 的事件数 */
  skipped: number;
  /** `samples === 0` → `null` */
  avgMs: number | null;
  /** 最后一个成功配对的样本（时间序） */
  last: PlanDwellSample | null;
}

/** 最近 preflight（只读账本的降级形态）。 */
export interface PreflightAge {
  at: string | null;
  ageMs: number | null;
  ok: boolean;
}

/** 三项代理指标。 */
export interface ProcessHealth {
  resumed: ResumedRatio;
  dwell: PlanDwell;
  preflight: PreflightAge;
}

/** 取窗口尾部；非法窗口 → 空数组（总函数）。 */
function tailWindow(log: LogEntry[], window: number): LogEntry[] {
  if (!Array.isArray(log) || log.length === 0) { return []; }
  const size = Math.floor(window);
  if (!Number.isFinite(size) || size <= 0) { return []; }
  return log.slice(-size);
}

/**
 * resumed 比例。
 *
 * - 分母只含 `typeof resumed === 'boolean'` 的 `advance_stage_phase`；
 * - `reset_stage_phase` **显式排除**（R4：返工 ≠ 推进恢复），且**不进 skipped**；
 * - `labeled === 0` → `ratio: null`（「没测到」≠「测到为零」）。
 */
export function computeResumedRatio(log: LogEntry[], window: number = PROCESS_HEALTH_WINDOW): ResumedRatio {
  const entries = tailWindow(log, window);
  let advance = 0;
  let labeled = 0;
  let resumedTrue = 0;
  for (const entry of entries) {
    // R4 冻结：reset 是返工语义，混进分母会让「恢复率」失去含义
    if (entry.action !== 'advance_stage_phase') { continue; }
    advance += 1;
    const resumed = entry.detail?.resumed;
    if (typeof resumed === 'boolean') {
      labeled += 1;
      if (resumed) { resumedTrue += 1; }
    }
  }
  return {
    window: entries.length,
    advance,
    labeled,
    resumedTrue,
    unlabeled: advance - labeled,
    ratio: labeled === 0 ? null : resumedTrue / labeled,
  };
}

/**
 * `plan_pending → plan_review` 平均停留（逐 `plan_review` 事件配对）。
 *
 * 锚点**只**来自 `findPhaseEntry(..., { includeAddStage: true })`（REV-023：唯一实现，
 * 本模块**不做**第二份回扫）。返工轮（`plan_review → plan_pending → plan_review`）
 * 自然各自成样本。
 */
export function computePlanDwell(log: LogEntry[], window: number = PROCESS_HEALTH_WINDOW): PlanDwell {
  const entries = tailWindow(log, window);
  let events = 0;
  let samples = 0;
  let skipped = 0;
  let totalMs = 0;
  let last: PlanDwellSample | null = null;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.action !== 'advance_stage_phase' || entry.detail?.to !== 'plan_review') { continue; }
    events += 1;
    const stage = typeof entry.detail?.stageName === 'string' ? entry.detail.stageName : '';
    if (stage === '') { skipped += 1; continue; }
    const endMs = Date.parse(entry.time);
    if (Number.isNaN(endMs)) { skipped += 1; continue; }
    // 上界 = 本事件在窗口内的下标 ⇒ 只回扫「本事件之前」的条目
    const hit = findPhaseEntry(entries, stage, 'plan_pending', i, { includeAddStage: true });
    if (hit === null) { skipped += 1; continue; }
    const startMs = Date.parse(hit.time);
    if (Number.isNaN(startMs)) { skipped += 1; continue; }
    const ms = endMs - startMs;
    if (ms < 0) { skipped += 1; continue; }
    samples += 1;
    totalMs += ms;
    last = { stage, startAt: hit.time, endAt: entry.time, ms, anchor: hit.anchor };
  }

  return {
    events,
    samples,
    skipped,
    avgMs: samples === 0 ? null : Math.round(totalMs / samples),
    last,
  };
}

/**
 * 最近 preflight（**只读**；`record === null` → 无记录）。
 * 阈值复用 `PREFLIGHT_MAX_AGE_MS`（不另写 10 分钟常量，避免与核心闸门漂移）。
 */
export function describePreflight(
  record: PreflightRecord | null,
  nowMs: number,
  maxAgeMs: number = PREFLIGHT_MAX_AGE_MS,
): PreflightAge {
  if (record === null || typeof record.at !== 'string') {
    return { at: null, ageMs: null, ok: false };
  }
  const at = Date.parse(record.at);
  if (!Number.isFinite(at)) {
    // 保留原始 at（权威不丢），只把年龄降级为 null
    return { at: record.at, ageMs: null, ok: false };
  }
  const ageMs = nowMs - at;
  return { at: record.at, ageMs, ok: ageMs <= maxAgeMs };
}

/** 三项指标一次算完（总函数：缺字段 / 空日志 / null 账本都不抛）。 */
export function computeProcessHealth(input: {
  log: LogEntry[];
  preflight: PreflightRecord | null;
  nowMs?: number;
  window?: number;
}): ProcessHealth {
  const window = input.window ?? PROCESS_HEALTH_WINDOW;
  const log = Array.isArray(input.log) ? input.log : [];
  return {
    resumed: computeResumedRatio(log, window),
    dwell: computePlanDwell(log, window),
    preflight: describePreflight(input.preflight ?? null, input.nowMs ?? Date.now()),
  };
}

/**
 * 人类可读时长（逐字规则，全 `Math.floor`）：
 * `<60s` → `{s}s`；`<60m` → `{m}m {s}s`（秒为 0 → `{m}m`）；
 * `<24h` → `{h}h {m}m`（分为 0 → `{h}h`）；否则 `{d}d {h}h`；负数 → `0s`。
 */
export function formatDuration(ms: number): string {
  const raw = Number.isFinite(ms) ? ms : 0;
  const totalSec = Math.floor(Math.max(0, raw) / 1000);
  const s = totalSec % 60;
  const m = Math.floor((totalSec % 3600) / 60);
  const h = Math.floor((totalSec % 86400) / 3600);
  const d = Math.floor(totalSec / 86400);
  if (totalSec < 60) { return `${s}s`; }
  if (totalSec < 3600) { return s === 0 ? `${m}m` : `${m}m ${s}s`; }
  if (totalSec < 86400) { return m === 0 ? `${h}h` : `${h}h ${m}m`; }
  return `${d}d ${h}h`;
}

/** resumed 行（INV-3 / INV-4：恒带样本量或「无数据」，`labeled===0` 时不含 `%`）。 */
function formatResumedLine(resumed: ResumedRatio, en: boolean): string {
  const unlabeled = en ? `${resumed.unlabeled} unlabelled` : `另有 ${resumed.unlabeled} 条不可判定`;
  if (resumed.labeled === 0 || resumed.ratio === null) {
    return en
      ? `  resumed ratio: no data (no advance entry carries resumed in window) · ${unlabeled}`
      : `  resumed 比例: 无数据（窗口内无带 resumed 标注的推进） · ${unlabeled}`;
  }
  const percent = `${(resumed.ratio * 100).toFixed(1)}%`;
  return en
    ? `  resumed ratio: ${resumed.resumedTrue}/${resumed.labeled} (${percent}) · ${unlabeled}`
    : `  resumed 比例: ${resumed.resumedTrue}/${resumed.labeled} (${percent}) · ${unlabeled}`;
}

/** dwell 行（INV-5：恒带 `(n=…)` 或「无样本」；`n===1` 标「样本不足」）。 */
function formatDwellLine(dwell: PlanDwell, en: boolean): string {
  const label = en ? 'plan_pending → plan_review avg dwell' : 'plan_pending → plan_review 平均停留';
  if (dwell.samples === 0 || dwell.avgMs === null) {
    return en ? `  ${label}: no sample (no pair in window)` : `  ${label}: 无样本（窗口内无配对）`;
  }
  const duration = formatDuration(dwell.avgMs);
  if (dwell.samples === 1) {
    return en ? `  ${label}: ${duration} (n=1, insufficient sample)` : `  ${label}: ${duration} (n=1，样本不足)`;
  }
  return `  ${label}: ${duration} (n=${dwell.samples})`;
}

/** preflight 行（INV-6：恒含「前（有效）」「前（已过期）」「无记录」「时间戳不可解析」之一）。 */
function formatPreflightLine(preflight: PreflightAge, en: boolean): string {
  if (preflight.at === null) {
    return en
      ? '  last preflight: none (flow next / flow status has not run)'
      : '  最近 preflight: 无记录（未调用过 flow next / flow status）';
  }
  // 与 `flow log` 惯例一致：原始 ISO 截到秒（UTC，不本地化）
  const at = preflight.at.length > 19 ? preflight.at.substring(0, 19) : preflight.at;
  if (preflight.ageMs === null) {
    return en ? `  last preflight: ${at} (unparsable timestamp)` : `  最近 preflight: ${at}（时间戳不可解析）`;
  }
  const duration = formatDuration(preflight.ageMs);
  return en
    ? `  last preflight: ${at} @ ${duration} ago (${preflight.ok ? 'fresh' : 'expired'})`
    : `  最近 preflight: ${at} @ ${duration} 前（${preflight.ok ? '有效' : '已过期'}）`;
}

/**
 * 人类输出行（含块头）。零 i18n 键：与 `flow log` 阶段摘要同范式内联 `en ? … : …`。
 * @param lang CLI 语言（`'en'` / `'zh-CN'` 等）
 */
export function formatProcessHealth(health: ProcessHealth, lang: string): string[] {
  const en = lang === 'en';
  return [
    en ? '── Process health ──' : '── 流程健康 ──',
    formatResumedLine(health.resumed, en),
    formatDwellLine(health.dwell, en),
    formatPreflightLine(health.preflight, en),
  ];
}
