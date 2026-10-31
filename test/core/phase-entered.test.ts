/**
 * `src/core/phase-entered.ts` 单测（v1.5.6-stage-116，REV-023）
 *
 * 关键防线：本文件内保留**冻结的 legacy 参考实现**（下沉前 `flow.ts` 私有函数的逐字副本，
 * 只把 `mgr` 换成 `log` 入参），在多组 fixture 上与共享实现逐条比对。
 * 任何人日后「顺手」改口径，这里立刻红。
 */
import { describe, it, expect } from 'vitest';
import { findPhaseEnteredAtMs, findPhaseEntry } from '../../src/core/phase-entered.js';
import type { LogEntry } from '../../src/core/flow-manager.js';

/** 构造日志条目 */
function entry(action: string, time: string, detail: Record<string, unknown>): LogEntry {
  return { time, agent: 'test', action, detail };
}

/**
 * 冻结的 legacy 参考实现 —— **逐字**来自 v1.5.6 下沉前的 `src/commands/flow.ts`
 * `function findPhaseEnteredAtMs(mgr, stageArg, fromPhase, logLenBefore)`。
 * 唯一改动：`const log = mgr.getData()?.log ?? []` → `log` 入参。
 * ⛔ 不要为了「让新实现通过」修改本函数：它代表已冻结的历史契约（T1 duration / metrics.json）。
 */
function legacyFindPhaseEnteredAtMs(
  log: LogEntry[],
  stageArg: string,
  fromPhase: string,
  logLenBefore: number,
): number | null {
  const upper = Math.min(logLenBefore, log.length);
  for (let k = upper - 1; k >= 0; k--) {
    const e = log[k];
    if (e.action !== 'advance_stage_phase' && e.action !== 'reset_stage_phase') { continue; }
    if (e.detail.stageName !== stageArg || e.detail.to !== fromPhase) { continue; }
    const ms = Date.parse(e.time);
    return Number.isNaN(ms) ? null : ms;
  }
  if (fromPhase === 'plan_pending') {
    for (let k = upper - 1; k >= 0; k--) {
      const e = log[k];
      if (e.action !== 'register_stage' || e.detail.stageName !== stageArg) { continue; }
      const ms = Date.parse(e.time);
      return Number.isNaN(ms) ? null : ms;
    }
  }
  return null;
}

const T = (minute: number): string => new Date(Date.parse('2026-01-01T00:00:00.000Z') + minute * 60_000).toISOString();

/** 参考实现 vs 共享实现的全组合比对 */
function expectEquivalentToLegacy(log: LogEntry[]): void {
  const stages = ['s1', 's2', 's3'];
  const phases = ['plan_pending', 'plan_review', 'plan_passed', 'exec_running'];
  for (const stage of stages) {
    for (const phase of phases) {
      for (let len = 0; len <= log.length; len++) {
        expect(findPhaseEnteredAtMs(log, stage, phase, len), `stage=${stage} phase=${phase} len=${len}`)
          .toBe(legacyFindPhaseEnteredAtMs(log, stage, phase, len));
      }
    }
  }
}

describe('findPhaseEnteredAtMs：与冻结 legacy 参考实现逐条等价（REV-023）', () => {
  it('register 锚：等价', () => {
    const log = [
      entry('register_stage', T(0), { stageName: 's1', deps: [] }),
      entry('advance_stage_phase', T(10), { stageName: 's1', from: 'plan_pending', to: 'plan_review', resumed: false }),
      entry('advance_stage_phase', T(20), { stageName: 's1', from: 'plan_review', to: 'plan_passed', resumed: false }),
    ];
    expectEquivalentToLegacy(log);
    // 显式样板断言（防「两边都错」的空等价）
    expect(findPhaseEnteredAtMs(log, 's1', 'plan_pending', log.length)).toBe(Date.parse(T(0)));
    expect(findPhaseEnteredAtMs(log, 's1', 'plan_review', log.length)).toBe(Date.parse(T(10)));
  });

  it('reset 锚：等价', () => {
    const log = [
      entry('register_stage', T(0), { stageName: 's1', deps: [] }),
      entry('advance_stage_phase', T(5), { stageName: 's1', from: 'plan_pending', to: 'plan_review', resumed: false }),
      entry('reset_stage_phase', T(30), { stageName: 's1', from: 'plan_review', to: 'plan_pending', resumed: false }),
      entry('advance_stage_phase', T(40), { stageName: 's1', from: 'plan_pending', to: 'plan_review', resumed: false }),
    ];
    expectEquivalentToLegacy(log);
    // 复位后的锚来自 reset，而不是更旧的 register
    expect(findPhaseEnteredAtMs(log, 's1', 'plan_pending', log.length)).toBe(Date.parse(T(30)));
  });

  it('多周期（返工轮）与 logLenBefore 上界：等价', () => {
    const log = [
      entry('register_stage', T(0), { stageName: 's1', deps: [] }),
      entry('advance_stage_phase', T(5), { stageName: 's1', from: 'plan_pending', to: 'plan_review', resumed: false }),
      entry('advance_stage_phase', T(6), { stageName: 's1', from: 'plan_review', to: 'plan_pending', resumed: false }),
      entry('advance_stage_phase', T(8), { stageName: 's1', from: 'plan_pending', to: 'plan_review', resumed: false }),
      entry('advance_stage_phase', T(9), { stageName: 's1', from: 'plan_review', to: 'plan_passed', resumed: true }),
    ];
    expectEquivalentToLegacy(log);
    // 上界排除「本事件」：len=2 时看不到 T(6) 那条（返工回 plan_pending）
    expect(findPhaseEnteredAtMs(log, 's1', 'plan_pending', 2)).toBe(Date.parse(T(0)));
    expect(findPhaseEnteredAtMs(log, 's1', 'plan_pending', 3)).toBe(Date.parse(T(6)));
  });

  it('无基线（只有 add_stage 且未开启 includeAddStage / 空日志）：等价', () => {
    const log = [
      entry('add_stage', T(1), { stageId: 's2', phase: 'plan_pending' }),
      entry('register_stage', T(2), { stageName: 's3', deps: [] }),
    ];
    expectEquivalentToLegacy(log);
    expect(findPhaseEnteredAtMs(log, 's2', 'plan_pending', log.length)).toBeNull();
    expect(findPhaseEnteredAtMs([], 's1', 'plan_pending', 0)).toBeNull();
    expect(legacyFindPhaseEnteredAtMs([], 's1', 'plan_pending', 0)).toBeNull();
  });

  it('命中条目时间不可解析 → null（不继续回扫更旧条目，与 legacy 一致）', () => {
    const log = [
      entry('register_stage', T(0), { stageName: 's1', deps: [] }),
      entry('advance_stage_phase', 'not-a-time', { stageName: 's1', from: 'plan_pending', to: 'plan_review' }),
    ];
    expectEquivalentToLegacy(log);
    expect(findPhaseEnteredAtMs(log, 's1', 'plan_review', log.length)).toBeNull();
  });

  it('阶段键必须同时匹配（不跨阶段串味）', () => {
    const log = [
      entry('register_stage', T(0), { stageName: 's1', deps: [] }),
      entry('register_stage', T(1), { stageName: 's2', deps: [] }),
    ];
    expectEquivalentToLegacy(log);
    expect(findPhaseEnteredAtMs(log, 's2', 'plan_pending', log.length)).toBe(Date.parse(T(1)));
  });
});

describe('findPhaseEnteredAtMs：add_stage 锚（includeAddStage）', () => {
  const log = [
    entry('add_stage', T(3), { stageId: 's2', phase: 'plan_pending' }),
    entry('advance_stage_phase', T(9), { stageName: 's2', from: 'plan_pending', to: 'plan_review' }),
  ];

  it('includeAddStage:true 采 add_stage（detail.stageId）', () => {
    expect(findPhaseEnteredAtMs(log, 's2', 'plan_pending', 1, { includeAddStage: true })).toBe(Date.parse(T(3)));
    expect(findPhaseEntry(log, 's2', 'plan_pending', 1, { includeAddStage: true })?.anchor).toBe('add');
  });

  it('includeAddStage:false（默认）不采 add_stage —— 保住 T1 duration / metrics.json 契约（M4）', () => {
    expect(findPhaseEnteredAtMs(log, 's2', 'plan_pending', 1)).toBeNull();
    expect(findPhaseEnteredAtMs(log, 's2', 'plan_pending', 1, { includeAddStage: false })).toBeNull();
  });

  it('add_stage.phase !== plan_pending → 排除（不存在「plan_pending 停留」）', () => {
    const started = [entry('add_stage', T(3), { stageId: 's9', phase: 'exec_running' })];
    expect(findPhaseEnteredAtMs(started, 's9', 'plan_pending', started.length, { includeAddStage: true })).toBeNull();
  });

  it('add_stage 缺 phase 字段 → 视为 plan_pending（旧条目兼容）', () => {
    const legacyish = [entry('add_stage', T(4), { stageId: 's8' })];
    expect(findPhaseEnteredAtMs(legacyish, 's8', 'plan_pending', 1, { includeAddStage: true })).toBe(Date.parse(T(4)));
  });

  it('register_stage 优先于 add_stage（同时存在时取完整层）', () => {
    const both = [
      entry('add_stage', T(1), { stageId: 's1', phase: 'plan_pending' }),
      entry('register_stage', T(2), { stageName: 's1', deps: [] }),
    ];
    expect(findPhaseEntry(both, 's1', 'plan_pending', both.length, { includeAddStage: true })?.anchor).toBe('register');
  });
});

describe('findPhaseEntry：脏条目降级（缺 detail / detail:null，REV-024）', () => {
  /** 手工构造脏条目：`FlowManager.load` 只做 JSON.parse，不校验 log[] 形状 */
  const missingDetail = { time: T(0), agent: 'x', action: 'register_stage' } as unknown as LogEntry;
  const nullDetail = { time: T(1), agent: 'x', action: 'advance_stage_phase', detail: null } as unknown as LogEntry;
  const nullAddDetail = { time: T(2), agent: 'x', action: 'add_stage', detail: null } as unknown as LogEntry;
  const dirtyLog = [
    missingDetail,
    nullDetail,
    nullAddDetail,
    entry('register_stage', T(3), { stageName: 's1', deps: [] }),
  ];

  it('不抛（总函数契约），合法锚仍可取', () => {
    expect(() => findPhaseEntry(dirtyLog, 's1', 'plan_pending', dirtyLog.length)).not.toThrow();
    expect(() => findPhaseEnteredAtMs(dirtyLog, 's1', 'plan_pending', dirtyLog.length)).not.toThrow();
    expect(findPhaseEntry(dirtyLog, 's1', 'plan_pending', dirtyLog.length)?.time).toBe(T(3));
    expect(findPhaseEntry(dirtyLog, 's1', 'plan_pending', dirtyLog.length)?.anchor).toBe('register');
  });

  it('脏条目自身永不成为锚（含 includeAddStage）', () => {
    expect(findPhaseEntry(dirtyLog, 'ghost', 'plan_pending', dirtyLog.length)).toBeNull();
    expect(findPhaseEntry(dirtyLog, 'ghost', 'plan_pending', dirtyLog.length, { includeAddStage: true })).toBeNull();
    expect(findPhaseEntry([missingDetail, nullDetail], 'ghost', 'plan_pending', 2)).toBeNull();
    // 只有一条 advance_stage_phase（detail:null）也不会被 match 成任何阶段
    expect(findPhaseEntry([nullDetail], 'x', 'plan_review', 1)).toBeNull();
  });
});
