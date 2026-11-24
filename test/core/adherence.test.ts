/**
 * 遵守率四指标纯函数（v1.7.0 / REQ-066 A66.3）
 *
 * 口径（与 `src/core/adherence.ts` 头部注释同源）：
 * - mainWriteRatio = origin=root 的**写决策** / 全部写决策（只读 shell 审计不计入）
 * - subagentPerReq = 已 close 的 executor 派发数 / 进行中需求数
 * - syncGapMinutes = 现在 − dev/.sync.json 的 last_sync（取整分钟）
 * - violationRate = guard deny / 全部 guard 决策（allow + deny + warn）
 *
 * 边界：0/0 → value:null（不 NaN）；样本不足不抛错；definition 必含分子/分母与样本窗口。
 */
import { describe, it, expect } from 'vitest';

import { computeAdherence, ADHERENCE_METRIC_KEYS } from '../../src/core/adherence.js';

/** 90 分钟前的固定「现在」（syncGap 断言用）。 */
const NOW = Date.parse('2026-11-24T12:00:00.000Z');

describe('computeAdherence：遵守率四指标（REQ-066 A66.3）', () => {
  it('四项指标按口径计算（main 0.5 / subagent 0.5 / sync 90 / violation 0.2）', () => {
    const report = computeAdherence({
      now: NOW,
      // 写决策：2 root + 2 子 Agent（subagent/delegated）；最后一条是**只读** shell（不计入分母）
      guardAudit: [
        { event: 'guard_allow', decision: 'allow', tool: 'write', origin: 'root' },
        { event: 'guard_allow', decision: 'allow', tool: 'edit', origin: 'root' },
        { event: 'guard_allow', decision: 'allow', tool: 'write', origin: 'subagent' },
        { event: 'guard_deny', decision: 'deny', tool: 'write', origin: 'delegated' },
        {
          event: 'guard_shell_unresolved', decision: 'warn', tool: 'shell',
          kind: 'undecidable', reason: 'shell-undecidable',
        },
      ],
      dispatchRecords: [
        { dispatchId: 'd-0001', role: 'executor', closing: { status: 'done' } },
        { dispatchId: 'd-0002', role: 'executor', closing: { status: 'failed' } },
        { dispatchId: 'd-0003', role: 'executor', closing: null },
        { dispatchId: 'd-0004', role: 'reviewer', closing: { status: 'done' } },
      ],
      requirements: [
        { id: 'REQ-001', status: 'in_progress' },
        { id: 'REQ-002', status: 'in_progress' },
        { id: 'REQ-003', status: 'done' },
      ],
      devSync: { lastSync: '2026-11-24T10:30:00.000Z' },
      sessions: [{ id: 's1', stage: 'x', lastSeen: '2026-11-24T11:00:00.000Z' }],
    });

    // 写决策 4 条（root 2 / subagent 2）→ 2/4
    expect(report.mainWriteRatio.value).toBeCloseTo(0.5);
    expect(report.definitions.mainWriteRatio).toMatchObject({ numerator: 2, denominator: 4, unknown: 0 });

    expect(report.subagentPerReq.value).toBeCloseTo(0.5);
    expect(report.definitions.subagentPerReq).toMatchObject({ numerator: 1, denominator: 2 });

    expect(report.syncGapMinutes.value).toBe(90);
    expect(report.definitions.syncGapMinutes.numerator).toBe(90 * 60_000);
    expect(report.definitions.syncGapMinutes.denominator).toBe(60_000);

    // 5 条决策：allow×3 + deny×1 + warn×1 → 1/5
    expect(report.violationRate.value).toBeCloseTo(0.2);
    expect(report.definitions.violationRate).toMatchObject({ numerator: 1, denominator: 5 });

    expect(report.sample).toMatchObject({
      dispatchRecords: 4,
      guardAudit: 5,
      guardAuditWriteDecisions: 4,
      sessions: 1,
      requirements: 3,
      inProgressRequirements: 2,
      closedExecutorDispatches: 1,
    });
  });

  it('A66.3 写决策口径：3 条只读 shell 不进分母；单纯只读样本 → value:null（不是 0）', () => {
    // 3 条只读（kind:none / readonly-interpreter / undecidable）+ 2 条写（write root / edit subagent）
    const withWrites = computeAdherence({
      now: NOW,
      guardAudit: [
        { decision: 'allow', tool: 'shell', kind: 'none', reason: 'shell-no-write', origin: 'root' },
        { decision: 'allow', tool: 'shell', kind: 'readonly-interpreter', reason: 'shell-readonly-interpreter', origin: 'subagent' },
        { decision: 'warn', tool: 'shell', kind: 'undecidable', reason: 'shell-undecidable', origin: 'root' },
        { decision: 'allow', tool: 'write', origin: 'root' },
        { decision: 'deny', tool: 'edit', origin: 'subagent' },
      ],
    });
    expect(withWrites.definitions.mainWriteRatio).toMatchObject({ numerator: 1, denominator: 2, unknown: 0 });
    expect(withWrites.mainWriteRatio.value).toBeCloseTo(0.5);
    expect(withWrites.sample.guardAuditWriteDecisions).toBe(2);

    // 纯只读：分母 0 → null（旧实现会把 3 条只读计入分母 → 0）
    const readOnlyOnly = computeAdherence({
      now: NOW,
      guardAudit: [
        { decision: 'allow', tool: 'shell', kind: 'none', reason: 'shell-no-write', origin: 'root' },
        { decision: 'allow', tool: 'shell', kind: 'none', reason: 'shell-no-write', origin: 'subagent' },
        { decision: 'warn', tool: 'shell', kind: 'undecidable', reason: 'shell-undecidable' },
      ],
    });
    expect(readOnlyOnly.definitions.mainWriteRatio.denominator).toBe(0);
    expect(readOnlyOnly.mainWriteRatio.value).toBeNull();
  });

  it('A66.3 写决策口径：旧审计行无 kind 时按 reason 兜底判只读；无 kind/reason 的行保守计为写', () => {
    const report = computeAdherence({
      now: NOW,
      guardAudit: [
        { decision: 'allow', tool: 'shell', reason: 'shell-no-write', origin: 'root' },         // 只读
        { decision: 'allow', tool: 'shell', reason: 'shell-undecidable', origin: 'root' },      // 只读
        { decision: 'allow', tool: 'shell', reason: 'shell-readonly-interpreter', origin: 'root' }, // 只读
        { decision: 'allow', tool: 'shell', kind: 'targets', origin: 'subagent' },              // 写
        { decision: 'allow', origin: 'root' },                                                  // 无信息 → 保守计写
      ],
    });
    expect(report.definitions.mainWriteRatio).toMatchObject({ numerator: 1, denominator: 2 });
    expect(report.mainWriteRatio.value).toBeCloseTo(0.5);
  });

  it('definition 复述口径：非空、含分子/分母与样本窗口；四键齐全', () => {
    const report = computeAdherence({ now: NOW });
    expect(Object.keys(report)).toEqual([
      'mainWriteRatio', 'subagentPerReq', 'syncGapMinutes', 'violationRate', 'definitions', 'sample',
    ]);
    expect(ADHERENCE_METRIC_KEYS).toEqual([
      'mainWriteRatio', 'subagentPerReq', 'syncGapMinutes', 'violationRate',
    ]);
    for (const key of ADHERENCE_METRIC_KEYS) {
      const metric = report[key];
      expect(typeof metric.definition).toBe('string');
      expect(metric.definition).toContain('分子');
      expect(metric.definition).toContain('分母');
      expect(metric.definition).toContain('样本窗口');
      expect(report.definitions[key].definition).toBe(metric.definition);
    }
  });

  it('无数据 / 0 分母 → value 全为 null（不是 0，绝不 NaN）', () => {
    const report = computeAdherence();
    for (const key of ADHERENCE_METRIC_KEYS) {
      expect(report[key].value).toBeNull();
      expect(Number.isNaN(report[key].value as number)).toBe(false);
    }
    expect(report.definitions.mainWriteRatio.denominator).toBe(0);
    expect(report.definitions.violationRate.denominator).toBe(0);
    expect(report.definitions.subagentPerReq.denominator).toBe(0);
    expect(report.sample.guardAudit).toBe(0);
  });

  it('边界：lastSync 缺失/非法 → null；未来时间按 0；有派发但无进行中需求 → null', () => {
    const missing = computeAdherence({
      now: NOW,
      devSync: null,
      dispatchRecords: [{ role: 'executor', closing: { status: 'done' } }],
      requirements: [],
    });
    expect(missing.syncGapMinutes.value).toBeNull();
    expect(missing.subagentPerReq.value).toBeNull();
    expect(missing.definitions.subagentPerReq.numerator).toBe(1); // 有 done 派发，但分母 0 → null

    const invalid = computeAdherence({ now: NOW, devSync: { lastSync: 'not-a-date' } });
    expect(invalid.syncGapMinutes.value).toBeNull();

    const future = computeAdherence({ now: NOW, devSync: { lastSync: '2026-11-25T12:00:00.000Z' } });
    expect(future.syncGapMinutes.value).toBe(0);
  });

  it('边界：origin 缺失计入分母并标注 unknown；非 allow/deny/warn 的决策不进 violation 分母', () => {
    const report = computeAdherence({
      now: NOW,
      guardAudit: [
        { decision: 'allow', origin: 'root' },
        { decision: 'allow' }, // unknown 来源
        { decision: 'allow', origin: 'subagent' },
        { decision: 'deny', origin: 'root' },
        { decision: 'other' }, // 不是合法决策：不进 violation 分母
        { decision: 'warn', origin: 'unknown-owner' },
      ],
    });
    // 写调用来源：root 2 / (root 2 + subagent 1 + unknown 3) = 1/3
    expect(report.mainWriteRatio.value).toBeCloseTo(1 / 3);
    expect(report.definitions.mainWriteRatio.unknown).toBe(3);
    expect(report.mainWriteRatio.definition).toContain('unknown 3');
    // 合法决策 5 条（allow×3 + deny×1 + warn×1），deny 1 → 0.2
    expect(report.violationRate.value).toBeCloseTo(0.2);
    expect(report.definitions.violationRate.denominator).toBe(5);
  });

  it('边界：非对象 / null 元素被跳过，不抛错', () => {
    const report = computeAdherence({
      now: NOW,
      guardAudit: [null, 42, { decision: 'deny' }],
      dispatchRecords: [null, { role: 'executor', closing: { status: 'done' } }],
      requirements: [null, { status: 'in_progress' }],
      sessions: [null, { id: 's' }],
    });
    expect(report.sample.guardAudit).toBe(3);
    expect(report.sample.dispatchRecords).toBe(2);
    expect(report.violationRate.value).toBe(1);
    expect(report.subagentPerReq.value).toBe(1);
  });
});
