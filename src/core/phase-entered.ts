/**
 * 「进入某相位」的时间戳查找（v1.5.6-stage-116，REV-023 单一实现）
 *
 * 本文件是**唯一实现**：原 `src/commands/flow.ts` 的文件内私有函数下沉到此。
 * 两个消费方都走本文件的同一次回扫：
 * - `flow.ts`（T1 duration 基线）→ `findPhaseEnteredAtMs`（只取时间戳的薄封装）；
 * - `src/core/process-health.ts`（流程健康 dwell）→ `findPhaseEntry`（同一次回扫，另带 `anchor`）
 * ⇒ 口径不可能分裂（REV-023）。
 *
 * 口径（与下沉前逐字等价，见 `test/core/phase-entered.test.ts` 的冻结 legacy 参考实现）：
 * - 回扫 `[0, logLenBefore)`（= 本次命令写入之前的存量条目，天然排除本次新写入）；
 * - 匹配 `advance_stage_phase` / `reset_stage_phase` 的 `detail.to === fromPhase`
 *   且 `detail.stageName === stageArg`（**阶段键必须同时匹配**，防跨阶段串味）；
 * - `fromPhase === 'plan_pending'` 时先兜底 `register_stage`（`detail.stageName`）；
 * - `options.includeAddStage === true` 时再兜底 `add_stage`（`detail.stageId`，
 *   且 `detail.phase` 缺失或 `=== 'plan_pending'`）——**默认 false**，保住
 *   `flow.ts` T1 duration 与 `.openfeel/metrics.json` 的既有契约（M4 语义冻结）。
 *
 * 关键细节：命中条目后**立即返回**，时间不可解析 → `null`，**不继续回扫**更旧条目
 * （与 legacy 逐条等价；停在这里才不会把「最近的锚坏了」悄悄换成「更旧的锚」）。
 */
import type { LogEntry } from './flow-manager.js';

/** 锚点来源（dwell 输出里用于区分配对依据）。 */
export type PhaseEntryAnchor = 'advance' | 'reset' | 'register' | 'add';

/** 查找到的进入事件（未解析时间；时间解析归调用方）。 */
export interface PhaseEntryHit {
  /** 命中条目的原始时间字符串（ISO） */
  time: string;
  /** 锚点来源 */
  anchor: PhaseEntryAnchor;
}

export interface FindPhaseEnteredOptions {
  /**
   * 是否把 `add_stage` 视为 `plan_pending` 的锚点（默认 `false`）。
   * `add_stage` 由 `flow stage add` / `stage create` / wizard 写入，**没有** `register_stage`；
   * 仅 dwell 需要它，T1 duration 沿用旧口径。
   */
  includeAddStage?: boolean;
}

/**
 * 求「进入 fromPhase 的那次转换」条目。
 * @param log 审计日志（`flow.json.log`）
 * @param stageArg 阶段键（完整 stageId；advance/reset/register 用 stageName，add 用 stageId）
 * @param fromPhase 进入的相位
 * @param logLenBefore 回扫上界（本次命令写入前的日志长度）
 * @param options 见 {@link FindPhaseEnteredOptions}
 * @returns 命中条目；无基线 → `null`（**不返回 0 值**）
 */
export function findPhaseEntry(
  log: LogEntry[],
  stageArg: string,
  fromPhase: string,
  logLenBefore: number,
  options: FindPhaseEnteredOptions = {},
): PhaseEntryHit | null {
  // `FlowManager.load` 只做 JSON.parse，不校验 log[] 形状 ⇒ 脏条目（缺 detail / detail:null）
  // 必须走可选链降级，**绝不抛**（REV-024；与 process-health 的总函数契约一致）。
  const upper = Math.min(logLenBefore, log.length);
  for (let k = upper - 1; k >= 0; k--) {
    const e = log[k];
    if (e.action !== 'advance_stage_phase' && e.action !== 'reset_stage_phase') { continue; }
    if (e.detail?.stageName !== stageArg || e.detail?.to !== fromPhase) { continue; }
    return { time: e.time, anchor: e.action === 'advance_stage_phase' ? 'advance' : 'reset' };
  }
  // plan_pending 的出生锚：register_stage 优先（完整层），随后才是 add_stage（注册层）
  if (fromPhase !== 'plan_pending') { return null; }
  for (let k = upper - 1; k >= 0; k--) {
    const e = log[k];
    if (e.action !== 'register_stage' || e.detail?.stageName !== stageArg) { continue; }
    return { time: e.time, anchor: 'register' };
  }
  if (options.includeAddStage !== true) { return null; }
  for (let k = upper - 1; k >= 0; k--) {
    const e = log[k];
    if (e.action !== 'add_stage' || e.detail?.stageId !== stageArg) { continue; }
    // initialPhase 非 plan_pending ⇒ 不存在「plan_pending 停留」这回事（§7.1 第 6 条，测试固化）
    const initialPhase = e.detail?.phase;
    if (initialPhase !== undefined && initialPhase !== 'plan_pending') { continue; }
    return { time: e.time, anchor: 'add' };
  }
  return null;
}

/**
 * 求「进入 fromPhase 的那次转换」的时间戳（毫秒）。
 * @returns 毫秒时间戳；无基线 / 时间不可解析 → `null`（不记 0 值）
 */
export function findPhaseEnteredAtMs(
  log: LogEntry[],
  stageArg: string,
  fromPhase: string,
  logLenBefore: number,
  options: FindPhaseEnteredOptions = {},
): number | null {
  const hit = findPhaseEntry(log, stageArg, fromPhase, logLenBefore, options);
  if (hit === null) { return null; }
  const ms = Date.parse(hit.time);
  return Number.isNaN(ms) ? null : ms;
}
