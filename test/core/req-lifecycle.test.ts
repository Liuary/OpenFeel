/**
 * 需求生命周期（v1.5.23 / REQ-043）测试：waive / trivial / 一次收口所依赖的门
 *
 * 隔离：纯内存 FlowData 夹具，不触真实 .openfeel。
 */
import { describe, it, expect } from 'vitest';
import {
  addRequirement, claimRequirement, advanceRequirement, linkRequirement,
  waiveRequirement, revokeRequirementWaiver,
  markRequirementTrivial, clearRequirementTrivial,
  canCompleteRequirement, requirementDoneBlocker, getRequirement,
  recordRequirementReview, isDisposedRequirement, releaseCheckRequirements,
} from '../../src/core/req/requirement-ops.js';
import type { FlowData, StageData } from '../../src/core/flow-manager.js';

function makeStage(overrides: Partial<StageData> = {}): StageData {
  return {
    name: '样本阶段',
    phase: 'exec_running',
    status: 'running',
    deps: [],
    ops: {},
    ...overrides,
  } as StageData;
}

function makeFlowData(stages: Record<string, StageData> = {}): FlowData {
  return {
    meta: { version: '1.0', project: 'T', updated: '2026-11-17T00:00:00.000Z' },
    pipeline: { phase: 'active', current: { stage: '', op: '' }, retry: 0 },
    stages,
    reviews: [],
    requirements: [],
    log: [],
  } as unknown as FlowData;
}

/** 造一条 in_progress 且已关联阶段的需求 */
function seedInProgress(data: FlowData, stageId = 'stage-01'): void {
  addRequirement(data, { title: '样本需求' });
  claimRequirement(data, 'REQ-001', 'Alice');
  advanceRequirement(data, 'REQ-001', 'scheduled');
  advanceRequirement(data, 'REQ-001', 'in_progress');
  linkRequirement(data, stageId, 'REQ-001');
}

describe('v1.5.23 / REQ-043：waive', () => {
  it('记录 who / reason / at 并写审计；done 状态拒绝', () => {
    const data = makeFlowData({ 'stage-01': makeStage() });
    seedInProgress(data);
    expect(waiveRequirement(data, 'REQ-001', { reason: '需求作废', by: 'alice' }).ok).toBe(true);
    const req = getRequirement(data, 'REQ-001')!;
    expect(req.waiver).toMatchObject({ reason: '需求作废', by: 'alice' });
    expect(data.log.some((e) => e.action === 'requirement_waive')).toBe(true);
    // reason / by 非空校验
    expect(waiveRequirement(data, 'REQ-001', { reason: '', by: 'alice' }).ok).toBe(false);
    // revoke 后清空
    expect(revokeRequirementWaiver(data, 'REQ-001').ok).toBe(true);
    expect(getRequirement(data, 'REQ-001')!.waiver).toBeUndefined();
    // 重复 revoke → invalid_status
    expect(revokeRequirementWaiver(data, 'REQ-001').code).toBe('invalid_status');
  });
});

describe('v1.5.23 / REQ-043：trivial', () => {
  it('标记后 done 门跳过审验；未标记仍要 review + verify', () => {
    const data = makeFlowData({ 'stage-01': makeStage() });
    seedInProgress(data);
    // 未标记：缺审验 → blocker 报 review
    expect(requirementDoneBlocker(data, getRequirement(data, 'REQ-001')!)).toBe('review');
    expect(canCompleteRequirement(data, getRequirement(data, 'REQ-001')!)).toBe(false);
    // 标记 trivial → 放行
    expect(markRequirementTrivial(data, 'REQ-001', { reason: 'docs 文案', by: 'alice' }).ok).toBe(true);
    expect(canCompleteRequirement(data, getRequirement(data, 'REQ-001')!)).toBe(true);
    expect(advanceRequirement(data, 'REQ-001', 'done').ok).toBe(true);
    expect(getRequirement(data, 'REQ-001')!.status).toBe('done');
  });

  it('trivial 仍需阶段相位门（阶段在 plan_* → 拒绝）', () => {
    const data = makeFlowData({ 'stage-01': makeStage({ phase: 'plan_review' }) });
    addRequirement(data, { title: 'x' });
    advanceRequirement(data, 'REQ-001', 'scheduled');
    linkRequirement(data, 'stage-01', 'REQ-001');
    markRequirementTrivial(data, 'REQ-001', { reason: 'docs', by: 'alice' });
    expect(requirementDoneBlocker(data, getRequirement(data, 'REQ-001')!)).toBe('stage_phase');
  });

  it('clear 后恢复审验要求', () => {
    const data = makeFlowData({ 'stage-01': makeStage() });
    seedInProgress(data);
    markRequirementTrivial(data, 'REQ-001', { reason: 'docs', by: 'alice' });
    expect(clearRequirementTrivial(data, 'REQ-001').ok).toBe(true);
    expect(requirementDoneBlocker(data, getRequirement(data, 'REQ-001')!)).toBe('review');
  });

  it('已存在的 review=fail 不会被 trivial 洗白', () => {
    const data = makeFlowData({ 'stage-01': makeStage() });
    seedInProgress(data);
    recordRequirementReview(data, 'REQ-001', { result: 'fail', by: 'r', note: '缺测试' });
    markRequirementTrivial(data, 'REQ-001', { reason: 'docs', by: 'alice' });
    expect(requirementDoneBlocker(data, getRequirement(data, 'REQ-001')!)).toBe('review');
  });
});

describe('v1.5.23 / REQ-043：waive 与发布/归档闭环', () => {
  it('release-check：waived 计入 other，不再算未完成', () => {
    const data = makeFlowData({ 'stage-01': makeStage() });
    addRequirement(data, { title: 'a', target_version: 'v1.0.0' });
    advanceRequirement(data, 'REQ-001', 'scheduled');
    waiveRequirement(data, 'REQ-001', { reason: '需求作废', by: 'alice' });
    const check = releaseCheckRequirements(data, 'v1.0.0');
    expect(check.counts.done).toBe(0);
    expect(check.counts.unfinished).toBe(0);
    expect(check.counts.other).toBe(1);
    expect(check.other[0].id).toBe('REQ-001');
  });

  it('isDisposedRequirement：终态 或 waiver 为真', () => {
    const data = makeFlowData();
    addRequirement(data, { title: 'a' });
    expect(isDisposedRequirement(getRequirement(data, 'REQ-001'))).toBe(false);
    waiveRequirement(data, 'REQ-001', { reason: 'x', by: 'alice' });
    expect(isDisposedRequirement(getRequirement(data, 'REQ-001'))).toBe(true);
    revokeRequirementWaiver(data, 'REQ-001');
    expect(isDisposedRequirement(getRequirement(data, 'REQ-001'))).toBe(false);
  });
});
