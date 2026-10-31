/**
 * `src/core/process-health.ts` 单测（v1.5.6-stage-116）
 *
 * 纪律（计划 §0.0 / §8 / R5）：**不把写计划时刻的实测数字写进断言**——
 * 所有期望都引用 INV-*（不变量）或「由本文件构造的输入算出来的结果」。
 */
import { describe, it, expect } from 'vitest';
import { MAX_LOG_ENTRIES, type LogEntry } from '../../src/core/flow-manager.js';
import {
  PROCESS_HEALTH_WINDOW,
  computePlanDwell,
  computeProcessHealth,
  computeResumedRatio,
  describePreflight,
  formatDuration,
  formatProcessHealth,
  type ProcessHealth,
} from '../../src/core/process-health.js';

const T = (minute: number): string => new Date(Date.parse('2026-01-01T00:00:00.000Z') + minute * 60_000).toISOString();

function entry(action: string, time: string, detail: Record<string, unknown>): LogEntry {
  return { time, agent: 'test', action, detail };
}

/** advance_stage_phase 条目 */
function advance(time: string, stage: string, from: string, to: string, resumed?: boolean): LogEntry {
  return entry('advance_stage_phase', time, {
    stageName: stage,
    from,
    to,
    session_id: 'project:test',
    ...(resumed === undefined ? {} : { resumed }),
  });
}

describe('computeResumedRatio', () => {
  it('true/false/缺失三态 → 分母只计布尔（INV-3）', () => {
    const log = [
      advance(T(0), 's1', 'plan_pending', 'plan_review', true),
      advance(T(1), 's1', 'plan_review', 'plan_passed', false),
      advance(T(2), 's1', 'plan_passed', 'exec_running'), // 缺 resumed → 不可判定
    ];
    const result = computeResumedRatio(log);
    expect(result.window).toBe(3);
    expect(result.advance).toBe(3);
    expect(result.labeled).toBe(2);
    expect(result.resumedTrue).toBe(1);
    expect(result.unlabeled).toBe(1);
    expect(result.ratio).toBeCloseTo(0.5);
  });

  it('全缺失 → ratio=null 且 labeled=0（不除零），格式化后不含 %（INV-3）', () => {
    const log = [
      advance(T(0), 's1', 'plan_pending', 'plan_review'),
      advance(T(1), 's2', 'plan_pending', 'plan_review'),
    ];
    const result = computeResumedRatio(log);
    expect(result.labeled).toBe(0);
    expect(result.ratio).toBeNull();
    expect(result.unlabeled).toBe(2);
    const lines = formatProcessHealth(computeProcessHealth({ log, preflight: null, nowMs: 0 }), 'zh-CN');
    const resumedLine = lines.find((line) => line.includes('resumed')) ?? '';
    expect(resumedLine).toContain('无数据');
    expect(resumedLine).not.toContain('%');
    // INV-4：恒含「另有 N 条不可判定」，含 0
    expect(resumedLine).toContain(`另有 ${result.unlabeled} 条不可判定`);
  });

  it('只数 advance：reset 不入分母/分子/skipped（INV-11，R4）', () => {
    const base = [
      advance(T(0), 's1', 'plan_pending', 'plan_review', false),
      advance(T(1), 's1', 'plan_review', 'plan_passed', true),
    ];
    const withReset = [
      ...base,
      entry('reset_stage_phase', T(2), { stageName: 's1', from: 'plan_passed', to: 'plan_pending', resumed: true }),
    ];
    const before = computeResumedRatio(base);
    const after = computeResumedRatio(withReset);
    expect(after.advance).toBe(before.advance);
    expect(after.labeled).toBe(before.labeled);
    expect(after.resumedTrue).toBe(before.resumedTrue);
    expect(after.ratio).toBe(before.ratio);
    // skipped 只服务 dwell 配对失败：reset 不得进（且 window 只多 1 条日志）
    expect(after.window).toBe(before.window + 1);
    expect(computePlanDwell(withReset).skipped).toBe(computePlanDwell(base).skipped);
  });

  it('窗口截断：> window 的旧条目不计入', () => {
    const log = [
      advance(T(0), 's1', 'plan_pending', 'plan_review', true),
      advance(T(1), 's1', 'plan_review', 'plan_passed', false),
      advance(T(2), 's1', 'plan_passed', 'exec_running', false),
    ];
    const result = computeResumedRatio(log, 2);
    expect(result.window).toBe(2);
    expect(result.advance).toBe(2);
    expect(result.resumedTrue).toBe(0);
    expect(result.labeled).toBe(2);
    expect(result.ratio).toBe(0);
  });
});

describe('computePlanDwell', () => {
  it('register_stage 锚 + 逐 plan_review 事件配对（INV-5）', () => {
    const log = [
      entry('register_stage', T(0), { stageName: 's1', deps: [] }),
      entry('register_stage', T(1), { stageName: 's2', deps: [] }),
      advance(T(11), 's1', 'plan_pending', 'plan_review'),
      advance(T(21), 's2', 'plan_pending', 'plan_review'),
    ];
    const dwell = computePlanDwell(log);
    expect(dwell.events).toBe(2);
    expect(dwell.samples).toBe(2);
    expect(dwell.skipped).toBe(0);
    // 11 分钟 + 20 分钟 → 平均 15.5 分钟
    expect(dwell.avgMs).toBe(15.5 * 60_000);
    expect(dwell.last?.anchor).toBe('register');
    expect(dwell.last?.stage).toBe('s2');
  });

  it('返工轮：plan_review→plan_pending→plan_review 各成样本', () => {
    const log = [
      entry('register_stage', T(0), { stageName: 's1', deps: [] }),
      advance(T(5), 's1', 'plan_pending', 'plan_review'),
      advance(T(8), 's1', 'plan_review', 'plan_pending'),
      advance(T(10), 's1', 'plan_pending', 'plan_review'),
    ];
    const dwell = computePlanDwell(log);
    expect(dwell.events).toBe(2);
    expect(dwell.samples).toBe(2);
    // 5 分钟 + 2 分钟 → 平均 3.5 分钟
    expect(dwell.avgMs).toBe(3.5 * 60_000);
    // 第二个样本的锚来自 advance（plan_review → plan_pending）
    expect(dwell.last?.anchor).toBe('advance');
    expect(dwell.last?.startAt).toBe(T(8));
  });

  it('只有 register 无 plan_review → 无样本（events=0，avgMs=null）', () => {
    const log = [entry('register_stage', T(0), { stageName: 's1', deps: [] })];
    const dwell = computePlanDwell(log);
    expect(dwell.events).toBe(0);
    expect(dwell.samples).toBe(0);
    expect(dwell.avgMs).toBeNull();
    expect(dwell.last).toBeNull();
  });

  it('时间戳非法 / 倒序 → 跳过且不抛（skipped>0，avg 只由合法样本决定）', () => {
    const log = [
      entry('register_stage', T(0), { stageName: 's1', deps: [] }),
      advance(T(10), 's1', 'plan_pending', 'plan_review'), // 合法：10 分钟
      advance('not-a-time', 's2', 'plan_pending', 'plan_review'), // 非法 end
      entry('register_stage', T(50), { stageName: 's3', deps: [] }),
      advance(T(40), 's3', 'plan_pending', 'plan_review'), // 倒序（end 早于 start）
    ];
    const dwell = computePlanDwell(log);
    expect(dwell.events).toBe(3);
    expect(dwell.samples).toBe(1);
    expect(dwell.skipped).toBe(2);
    expect(dwell.avgMs).toBe(10 * 60_000);
  });

  it('无锚（阶段只有 add_stage 之外的东西缺失）→ skipped，不抛', () => {
    const log = [advance(T(10), 'ghost', 'plan_pending', 'plan_review')];
    const dwell = computePlanDwell(log);
    expect(dwell.events).toBe(1);
    expect(dwell.samples).toBe(0);
    expect(dwell.skipped).toBe(1);
    expect(dwell.avgMs).toBeNull();
  });

  it('add_stage 锚（includeAddStage:true）——REV-023 覆盖注册层阶段', () => {
    const log = [
      entry('add_stage', T(1), { stageId: 's2', phase: 'plan_pending' }),
      advance(T(6), 's2', 'plan_pending', 'plan_review'),
    ];
    const dwell = computePlanDwell(log);
    expect(dwell.samples).toBe(1);
    expect(dwell.avgMs).toBe(5 * 60_000);
    expect(dwell.last?.anchor).toBe('add');
  });
});

describe('describePreflight', () => {
  it('record=null → 全降级（INV-6）', () => {
    expect(describePreflight(null, 1_000)).toEqual({ at: null, ageMs: null, ok: false });
  });

  it('at 不可解析 → ageMs=null、ok=false（保留 at）', () => {
    const result = describePreflight({ at: 'not-a-time', stage: null, phase: null, revision: null }, 1_000);
    expect(result.at).toBe('not-a-time');
    expect(result.ageMs).toBeNull();
    expect(result.ok).toBe(false);
  });

  it('阈值边界：恰好 600000ms → ok=true；600001ms → false', () => {
    const now = Date.parse('2026-01-01T12:00:00.000Z');
    const record = (ageMs: number) => ({
      at: new Date(now - ageMs).toISOString(),
      stage: null,
      phase: null,
      revision: null,
    });
    expect(describePreflight(record(600_000), now)).toEqual({
      at: new Date(now - 600_000).toISOString(),
      ageMs: 600_000,
      ok: true,
    });
    expect(describePreflight(record(600_001), now).ok).toBe(false);
  });
});

describe('formatDuration', () => {
  it('45s / 10m 53s / 8h 19m / 2d 3h / 负数', () => {
    expect(formatDuration(45_000)).toBe('45s');
    expect(formatDuration(653_000)).toBe('10m 53s');
    expect(formatDuration(29_940_000)).toBe('8h 19m');
    expect(formatDuration(((2 * 24 + 3) * 3600) * 1000)).toBe('2d 3h');
    expect(formatDuration(-1)).toBe('0s');
  });

  it('整分/整时省零（60m → 1h；120s → 2m）', () => {
    expect(formatDuration(120_000)).toBe('2m');
    expect(formatDuration(3_600_000)).toBe('1h');
    expect(formatDuration(86_400_000)).toBe('1d 0h');
  });
});

describe('formatProcessHealth（逐字，§2.3）', () => {
  /** 由**本测试构造**的结构体，与仓内真实日志无关（§0.0 警告） */
  const withData: ProcessHealth = {
    resumed: { window: 20, advance: 20, labeled: 17, resumedTrue: 0, unlabeled: 3, ratio: 0 },
    dwell: { events: 3, samples: 3, skipped: 0, avgMs: 635_000, last: null },
    preflight: { at: '2026-10-31T12:13:31.034Z', ageMs: 29_940_000, ok: false },
  };
  const empty: ProcessHealth = {
    resumed: { window: 0, advance: 0, labeled: 0, resumedTrue: 0, unlabeled: 0, ratio: null },
    dwell: { events: 0, samples: 0, skipped: 0, avgMs: null, last: null },
    preflight: { at: null, ageMs: null, ok: false },
  };

  it('zh：有数据文案逐字（含「另有 N 条不可判定」，INV-4）', () => {
    expect(formatProcessHealth(withData, 'zh-CN')).toEqual([
      '── 流程健康 ──',
      '  resumed 比例: 0/17 (0.0%) · 另有 3 条不可判定',
      '  plan_pending → plan_review 平均停留: 10m 35s (n=3)',
      '  最近 preflight: 2026-10-31T12:13:31 @ 8h 19m 前（已过期）',
    ]);
  });

  it('zh：三项全空文案逐字（INV-3 IN-4 INV-5 INV-6）', () => {
    expect(formatProcessHealth(empty, 'zh-CN')).toEqual([
      '── 流程健康 ──',
      '  resumed 比例: 无数据（窗口内无带 resumed 标注的推进） · 另有 0 条不可判定',
      '  plan_pending → plan_review 平均停留: 无样本（窗口内无配对）',
      '  最近 preflight: 无记录（未调用过 flow next / flow status）',
    ]);
  });

  it('en：有/无数据逐字', () => {
    expect(formatProcessHealth(withData, 'en')).toEqual([
      '── Process health ──',
      '  resumed ratio: 0/17 (0.0%) · 3 unlabelled',
      '  plan_pending → plan_review avg dwell: 10m 35s (n=3)',
      '  last preflight: 2026-10-31T12:13:31 @ 8h 19m ago (expired)',
    ]);
    expect(formatProcessHealth(empty, 'en')).toEqual([
      '── Process health ──',
      '  resumed ratio: no data (no advance entry carries resumed in window) · 0 unlabelled',
      '  plan_pending → plan_review avg dwell: no sample (no pair in window)',
      '  last preflight: none (flow next / flow status has not run)',
    ]);
  });

  it('单项降级：n=1 标「样本不足」、at 不可解析、有效', () => {
    const single: ProcessHealth = {
      ...withData,
      dwell: { events: 1, samples: 1, skipped: 0, avgMs: 697_000, last: null },
      preflight: { at: '2026-10-31T12:00:00.000Z', ageMs: 90_000, ok: true },
    };
    const lines = formatProcessHealth(single, 'zh-CN');
    expect(lines[2]).toBe('  plan_pending → plan_review 平均停留: 11m 37s (n=1，样本不足)');
    expect(lines[3]).toBe('  最近 preflight: 2026-10-31T12:00:00 @ 1m 30s 前（有效）');

    const unparsable: ProcessHealth = {
      ...withData,
      preflight: { at: 'garbage', ageMs: null, ok: false },
    };
    expect(formatProcessHealth(unparsable, 'zh-CN')[3]).toBe('  最近 preflight: garbage（时间戳不可解析）');
    expect(formatProcessHealth(unparsable, 'en')[3]).toBe('  last preflight: garbage (unparsable timestamp)');
  });
});

describe('不变量（INV-14 / 总函数性）', () => {
  it('PROCESS_HEALTH_WINDOW === MAX_LOG_ENTRIES（同源常量，非字面量 200）', () => {
    expect(PROCESS_HEALTH_WINDOW).toBe(MAX_LOG_ENTRIES);
  });

  it('computeProcessHealth：空 log + null preflight 不抛且全降级', () => {
    const health = computeProcessHealth({ log: [], preflight: null, nowMs: 0 });
    expect(health.resumed).toEqual({
      window: 0,
      advance: 0,
      labeled: 0,
      resumedTrue: 0,
      unlabeled: 0,
      ratio: null,
    });
    expect(health.dwell).toEqual({ events: 0, samples: 0, skipped: 0, avgMs: null, last: null });
    expect(health.preflight).toEqual({ at: null, ageMs: null, ok: false });
  });

  it('脏条目（缺 detail / detail:null）不抛，按「不可判定」处理（REV-024）', () => {
    // `FlowManager.load` 只做 JSON.parse，不校验 log[] 形状 ⇒ 缺 detail 是可达输入
    const log = [
      { time: T(0), agent: 'x', action: 'advance_stage_phase' } as unknown as LogEntry,
      { time: T(1), agent: 'x', action: 'advance_stage_phase', detail: null } as unknown as LogEntry,
      { time: T(2), agent: 'x', action: 'add_stage', detail: null } as unknown as LogEntry,
      advance(T(3), 's1', 'plan_pending', 'plan_review', true),
    ];
    expect(() => computeProcessHealth({ log, preflight: null, nowMs: 0 })).not.toThrow();
    // resumed：脏推进条目只进 advance/unlabeled，绝不入分母
    const resumed = computeResumedRatio(log);
    expect(resumed.advance).toBe(3);
    expect(resumed.labeled).toBe(1);
    expect(resumed.resumedTrue).toBe(1);
    expect(resumed.unlabeled).toBe(2);
    expect(resumed.ratio).toBe(1);
    // dwell：只有 1 条真 plan_review 事件，且窗口内无锚 ⇒ skipped（脏条目不算锚、也不当 plan_review）
    const dwell = computePlanDwell(log);
    expect(dwell.events).toBe(1);
    expect(dwell.samples).toBe(0);
    expect(dwell.skipped).toBe(1);
    expect(dwell.avgMs).toBeNull();
    // 时间戳缺失/非法也不抛
    const noTime = [{ agent: 'x', action: 'advance_stage_phase', detail: { stageName: 's1', to: 'plan_review' } } as unknown as LogEntry];
    expect(() => computePlanDwell(noTime)).not.toThrow();
  });
});
