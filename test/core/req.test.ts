/**
 * 需求核心引擎单元测试（stage-81）
 * 覆盖 T5.1 ID 分配 / T5.2 CRUD / T5.3 认领 / T5.4 状态流转与 link / T5.5 正文骨架 /
 *      T5.4b 读侧宽容 / T5.4c save 集成。
 *
 * 隔离声明：全程使用 fixture tmpDir（mkdtempSync + afterEach 清理），
 * **严禁**触碰本仓真实 `.openfeel/flow.json` 与 `.openfeel/requirements/`。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  getRequirements, getRequirement, listRequirements, nextRequirementId,
  addRequirement, claimRequirement, releaseRequirement, updateRequirement,
  advanceRequirement, linkRequirement, splitRequirement,
  isTerminalRequirementStatus, allLinkedStagesDone,
  getAllowedNextStatuses,
} from '../../src/core/req/requirement-ops.js';
import {
  getRequirementsDir, getRequirementBodyRelPath, getRequirementBodyPath, writeRequirementBodySkeleton,
} from '../../src/core/req/body-file.js';
import { REQ_STATUSES, type RequirementData, type RequirementStatus } from '../../src/core/req/types.js';
import { FlowManager, type FlowData, type StageData, type PipelinePhase, type MetaPhase } from '../../src/core/flow-manager.js';
import {
  AUTO_DONE_PRECONDITION, computeRequirementAggregate, resolveRequirementStatusForStage, syncRequirementStatus,
  requirementHealthItems,
} from '../../src/core/req/aggregate.js';
import { PIPELINE_PHASES } from '../../src/core/pipeline-schema.js';

/** 构造最小 FlowData（含 log: []） */
function makeFlowData(stages: Record<string, StageData> = {}): FlowData {
  return {
    meta: { version: '1.0', project: 'T', updated: '2026-01-01T00:00:00Z', revision: 0 },
    pipeline: { phase: 'active' as MetaPhase, current: { stage: '', op: '' }, retry: 0 },
    stages,
    reviews: [],
    log: [],
  };
}

/** 构造阶段（可传 phase / requirement_id） */
function makeStage(overrides: Partial<StageData> = {}): StageData {
  return {
    name: '测试阶段',
    phase: 'plan_pending' as PipelinePhase,
    status: 'planned',
    deps: [],
    ops: {},
    ...overrides,
  };
}

/** 构造需求条目（直构，供状态流转/认领用） */
function makeReq(id: string, status: RequirementStatus, overrides: Partial<RequirementData> = {}): RequirementData {
  return {
    id,
    title: `需求 ${id}`,
    status,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/** 读取最后一条审计 */
function lastLog(data: FlowData) {
  return data.log[data.log.length - 1];
}

// ═══════════════════════════════════════
// T5.1 ID 分配
// ═══════════════════════════════════════
describe('需求原语 — T5.1 ID 分配', () => {
  it('空列表 → REQ-001', () => {
    expect(nextRequirementId(makeFlowData())).toBe('REQ-001');
  });

  it('连续（REQ-001/002 存在）→ REQ-003', () => {
    const data = makeFlowData();
    data.requirements = [makeReq('REQ-001', 'draft'), makeReq('REQ-002', 'draft')];
    expect(nextRequirementId(data)).toBe('REQ-003');
  });

  it('空洞（REQ-001、REQ-003 存在）→ REQ-004（max+1 不回收）', () => {
    const data = makeFlowData();
    data.requirements = [makeReq('REQ-001', 'draft'), makeReq('REQ-003', 'draft')];
    expect(nextRequirementId(data)).toBe('REQ-004');
  });

  it('异常 id 跳过不崩', () => {
    const data = makeFlowData();
    data.requirements = [
      makeReq('FOO', 'draft'),
      makeReq('REQ-abc', 'draft'),
      makeReq('REQ-12', 'draft'),   // 两位：不匹配 REQ_ID_PATTERN
      makeReq('REQ-002', 'draft'),
    ];
    expect(nextRequirementId(data)).toBe('REQ-003');
  });

  it('REQ-999 → REQ-1000（三位起不截断）', () => {
    const data = makeFlowData();
    data.requirements = [makeReq('REQ-999', 'draft')];
    expect(nextRequirementId(data)).toBe('REQ-1000');
  });

  it('requirements 缺失 → REQ-001（读侧宽容）', () => {
    const data = makeFlowData();
    expect(nextRequirementId(data)).toBe('REQ-001');
  });
});

// ═══════════════════════════════════════
// T5.2 CRUD
// ═══════════════════════════════════════
describe('需求原语 — T5.2 CRUD', () => {
  it('add：status=draft / created_at===updated_at / 返回本体 / 审计 / 可选字段缺省不写键', () => {
    const data = makeFlowData();
    const req = addRequirement(data, { title: '  需求一  ' });
    expect(req.status).toBe('draft');
    expect(req.title).toBe('需求一');
    expect(req.created_at).toBe(req.updated_at);
    expect(req).toBe(data.requirements![0]);              // 返回本体
    expect('target_version' in req).toBe(false);          // 可选字段缺省不写键
    expect('priority' in req).toBe(false);
    expect('owner' in req).toBe(false);
    expect(lastLog(data).action).toBe('requirement_add');
  });

  it('add：可选字段提供时写入', () => {
    const data = makeFlowData();
    const req = addRequirement(data, { title: 'x', target_version: 'v1.3.0', priority: 'P1' });
    expect(req.target_version).toBe('v1.3.0');
    expect(req.priority).toBe('P1');
  });

  it('add 非法入参 → 抛错（唯一抛错原语，REV-81-015）', () => {
    const data = makeFlowData();
    expect(() => addRequirement(data, { title: '   ' })).toThrow();
    expect(() => addRequirement(data, { title: 'x', priority: 'P9' as never })).toThrow();
    expect(() => addRequirement(data, { title: 'x', target_version: '  ' })).toThrow();
  });

  it('get：命中返回浅副本（toEqual 且 not.toBe）/ 未命中 null', () => {
    const data = makeFlowData();
    const stored = addRequirement(data, { title: 'x' });
    const got = getRequirement(data, stored.id)!;
    expect(got).toEqual(stored);
    expect(got).not.toBe(stored);
    expect(getRequirement(data, 'REQ-999')).toBeNull();
  });

  it('list：三 filter + 组合 AND', () => {
    const data = makeFlowData();
    const a = addRequirement(data, { title: 'a', target_version: 'v1.3.0' });
    const b = addRequirement(data, { title: 'b', target_version: 'v1.3.0' });
    const c = addRequirement(data, { title: 'c', target_version: 'v1.4.0' });
    claimRequirement(data, b.id, 'alice');
    advanceRequirement(data, a.id, 'scheduled');
    advanceRequirement(data, c.id, 'cancelled');

    expect(listRequirements(data, { status: 'scheduled' }).map((r) => r.id)).toEqual([a.id]);
    expect(listRequirements(data, { target_version: 'v1.3.0' }).map((r) => r.id).sort()).toEqual([a.id, b.id].sort());
    expect(listRequirements(data, { owner: 'alice' }).map((r) => r.id)).toEqual([b.id]);
    // 组合 AND
    expect(listRequirements(data, { target_version: 'v1.3.0', owner: 'alice' }).map((r) => r.id)).toEqual([b.id]);
  });

  it('list：未知键忽略（多条件 AND 无匹配 → 空）', () => {
    const data = makeFlowData();
    addRequirement(data, { title: 'a', target_version: 'v1.3.0' });
    expect(listRequirements(data, { target_version: 'v9.9.9' })).toEqual([]);
  });

  it('update：白名单合法更新 + 审计 fields + 回写本体 + updated_at 刷新（哨兵）', () => {
    const data = makeFlowData();
    const stored = addRequirement(data, { title: 'x' });
    stored.updated_at = '2000-01-01T00:00:00.000Z';

    const res = updateRequirement(data, stored.id, { title: '新标题', target_version: 'v9.9.9', priority: 'P0' });
    expect(res).toEqual({ ok: true, changed: true });

    const after = data.requirements![0];                    // 回写本体断言（防副本陷阱，REV-81-011）
    expect(after.title).toBe('新标题');
    expect(after.target_version).toBe('v9.9.9');
    expect(after.priority).toBe('P0');
    expect(after.updated_at).not.toBe('2000-01-01T00:00:00.000Z');  // 字段维度收尾刷新（REV-81-013）
    expect(lastLog(data).action).toBe('requirement_update');
    expect(lastLog(data).detail.fields).toEqual(['title', 'target_version', 'priority']);
  });

  it('update：非法键（owner）→ invalid_field 且整 patch 零变更', () => {
    const data = makeFlowData();
    const stored = addRequirement(data, { title: 'x' });
    const before = JSON.stringify(data.requirements);
    const res = updateRequirement(data, stored.id, { title: 'y', owner: 'z' } as never);
    expect(res).toEqual({ ok: false, code: 'invalid_field' });
    expect(JSON.stringify(data.requirements)).toBe(before);
  });

  it('update：值非法的字段 → invalid_field（title 空串 / 空 target_version）', () => {
    const data = makeFlowData();
    const stored = addRequirement(data, { title: 'x' });
    expect(updateRequirement(data, stored.id, { title: '  ' })).toEqual({ ok: false, code: 'invalid_field' });
    expect(updateRequirement(data, stored.id, { target_version: '' })).toEqual({ ok: false, code: 'invalid_field' });
    expect(updateRequirement(data, stored.id, { priority: 'P9' as never })).toEqual({ ok: false, code: 'invalid_field' });
  });

  it('update：undefined 值键不计 / 空 patch → changed:false', () => {
    const data = makeFlowData();
    const stored = addRequirement(data, { title: 'x' });
    expect(updateRequirement(data, stored.id, { title: undefined })).toEqual({ ok: true, changed: false });
    expect(updateRequirement(data, stored.id, {})).toEqual({ ok: true, changed: false });
  });

  it('update：需求不存在 → not_found', () => {
    expect(updateRequirement(makeFlowData(), 'REQ-999', { title: 'x' })).toEqual({ ok: false, code: 'not_found' });
  });
});

// ═══════════════════════════════════════
// T5.3 认领
// ═══════════════════════════════════════
describe('需求原语 — T5.3 认领', () => {
  it('claim 成功：owner/claimed_at/updated_at + 审计', () => {
    const data = makeFlowData();
    const req = addRequirement(data, { title: 'x' });
    const res = claimRequirement(data, req.id, 'alice');
    expect(res).toEqual({ ok: true, changed: true });
    expect(req.owner).toBe('alice');
    expect(req.claimed_at).toBeTruthy();
    expect(req.updated_at).toBe(req.claimed_at);
    expect(lastLog(data).action).toBe('requirement_claim');
  });

  it('他人 claim → already_claimed 且数据零变更 + 零新增审计', () => {
    const data = makeFlowData();
    const req = addRequirement(data, { title: 'x' });
    claimRequirement(data, req.id, 'alice');
    const before = JSON.stringify(data.requirements);
    const logLen = data.log.length;
    const res = claimRequirement(data, req.id, 'bob');
    expect(res).toEqual({ ok: false, code: 'already_claimed' });
    expect(JSON.stringify(data.requirements)).toBe(before);
    expect(data.log.length).toBe(logLen);
  });

  it('同 owner 再 claim → changed:false', () => {
    const data = makeFlowData();
    const req = addRequirement(data, { title: 'x' });
    claimRequirement(data, req.id, 'alice');
    expect(claimRequirement(data, req.id, 'alice')).toEqual({ ok: true, changed: false });
  });

  it('claim 终态 → invalid_status / 不存在 → not_found / owner 空串 → invalid_field', () => {
    const data = makeFlowData();
    const req = addRequirement(data, { title: 'x' });
    req.status = 'done';
    expect(claimRequirement(data, req.id, 'alice')).toEqual({ ok: false, code: 'invalid_status' });
    expect(claimRequirement(data, 'REQ-999', 'alice')).toEqual({ ok: false, code: 'not_found' });
    expect(claimRequirement(data, req.id, '  ')).toEqual({ ok: false, code: 'invalid_field' });
  });

  it('release 有占用 → 清除 owner/claimed_at + 审计；无占用 → changed:false 零变更；不存在 → not_found', () => {
    const data = makeFlowData();
    const req = addRequirement(data, { title: 'x' });
    claimRequirement(data, req.id, 'alice');

    const res = releaseRequirement(data, req.id);
    expect(res).toEqual({ ok: true, changed: true });
    expect('owner' in req).toBe(false);
    expect('claimed_at' in req).toBe(false);
    expect(lastLog(data).action).toBe('requirement_release');
    expect(lastLog(data).detail.owner).toBe('alice');

    // 无占用 → no-op 成功
    const before = JSON.stringify(data.requirements);
    expect(releaseRequirement(data, req.id)).toEqual({ ok: true, changed: false });
    expect(JSON.stringify(data.requirements)).toBe(before);

    expect(releaseRequirement(data, 'REQ-999')).toEqual({ ok: false, code: 'not_found' });
  });

  it('release 后可再 claim（他人可认领）', () => {
    const data = makeFlowData();
    const req = addRequirement(data, { title: 'x' });
    claimRequirement(data, req.id, 'alice');
    releaseRequirement(data, req.id);
    expect(claimRequirement(data, req.id, 'bob')).toEqual({ ok: true, changed: true });
    expect(req.owner).toBe('bob');
  });

  it('isTerminalRequirementStatus：三分支', () => {
    expect(isTerminalRequirementStatus('done')).toBe(true);
    expect(isTerminalRequirementStatus('cancelled')).toBe(true);
    expect(isTerminalRequirementStatus('rejected')).toBe(true);
    expect(isTerminalRequirementStatus('draft')).toBe(false);
    expect(isTerminalRequirementStatus('blocked')).toBe(false);
  });
});

// ═══════════════════════════════════════
// T5.4a 状态流转（裁定 3/4）
// ═══════════════════════════════════════
describe('需求原语 — T5.4a 状态流转', () => {
  const successCases: Array<[RequirementStatus, RequirementStatus]> = [
    ['draft', 'scheduled'],
    ['scheduled', 'in_progress'],
    ['in_progress', 'blocked'],
    ['blocked', 'scheduled'],
    ['blocked', 'in_progress'],
    ['draft', 'cancelled'],
  ];

  for (const [from, to] of successCases) {
    it(`表内正例：${from} → ${to}`, () => {
      const data = makeFlowData();
      data.requirements = [makeReq('REQ-001', from)];
      const res = advanceRequirement(data, 'REQ-001', to);
      expect(res).toEqual({ ok: true, changed: true });
      expect(data.requirements![0].status).toBe(to);
      expect(lastLog(data).action).toBe('requirement_status');
      expect(lastLog(data).detail).toEqual({ id: 'REQ-001', from, to });
    });
  }

  it('done 门：in_progress + 全部关联阶段 done → advance done 成功', () => {
    const data = makeFlowData({
      'vX-stage-01': makeStage({ phase: 'done', requirement_id: 'REQ-001' }),
      'vX-stage-02': makeStage({ phase: 'done', requirement_id: 'REQ-001' }),
    });
    data.requirements = [makeReq('REQ-001', 'in_progress')];
    expect(advanceRequirement(data, 'REQ-001', 'done')).toEqual({ ok: true, changed: true });
    expect(data.requirements![0].status).toBe('done');
  });

  it('done 门：零关联 → invalid_status（空集守卫，裁定 H）', () => {
    const data = makeFlowData();
    data.requirements = [makeReq('REQ-001', 'in_progress')];
    expect(advanceRequirement(data, 'REQ-001', 'done')).toEqual({ ok: false, code: 'invalid_status' });
    expect(data.requirements![0].status).toBe('in_progress');
  });

  it('done 门：一阶段未 done → invalid_status', () => {
    const data = makeFlowData({
      'vX-stage-01': makeStage({ phase: 'done', requirement_id: 'REQ-001' }),
      'vX-stage-02': makeStage({ phase: 'exec_running', requirement_id: 'REQ-001' }),
    });
    data.requirements = [makeReq('REQ-001', 'in_progress')];
    expect(advanceRequirement(data, 'REQ-001', 'done')).toEqual({ ok: false, code: 'invalid_status' });
  });

  const rejectCases: Array<[RequirementStatus, RequirementStatus]> = [
    ['draft', 'in_progress'],
    ['draft', 'done'],
    ['scheduled', 'done'],
    ['scheduled', 'draft'],
    ['done', 'in_progress'],
  ];

  for (const [from, to] of rejectCases) {
    it(`表外拒绝：${from} → ${to} → invalid_status`, () => {
      const data = makeFlowData({
        'vX-stage-01': makeStage({ phase: 'done', requirement_id: 'REQ-001' }),
      });
      data.requirements = [makeReq('REQ-001', from)];
      expect(advanceRequirement(data, 'REQ-001', to)).toEqual({ ok: false, code: 'invalid_status' });
      expect(data.requirements![0].status).toBe(from);
    });
  }

  it('同值 advance → changed:false（幂等 no-op，不写审计）', () => {
    const data = makeFlowData();
    data.requirements = [makeReq('REQ-001', 'scheduled')];
    expect(advanceRequirement(data, 'REQ-001', 'scheduled')).toEqual({ ok: true, changed: false });
    expect(data.log.length).toBe(0);
  });

  it('update({status}) 与 advance 同表同门（同组拒绝用例）', () => {
    const data = makeFlowData();
    data.requirements = [makeReq('REQ-001', 'draft')];
    expect(updateRequirement(data, 'REQ-001', { status: 'done' })).toEqual({ ok: false, code: 'invalid_status' });
    expect(updateRequirement(data, 'REQ-001', { status: 'scheduled' })).toEqual({ ok: true, changed: true });
  });

  it('非法 status 值 → invalid_status', () => {
    const data = makeFlowData();
    data.requirements = [makeReq('REQ-001', 'draft')];
    expect(updateRequirement(data, 'REQ-001', { status: 'bogus' as RequirementStatus }))
      .toEqual({ ok: false, code: 'invalid_status' });
  });

  it('REV-81-016：域外 status 条目 → 不崩、返回 invalid_status', () => {
    const data = makeFlowData();
    data.requirements = [makeReq('REQ-001', 'bogus' as RequirementStatus)];
    expect(() => updateRequirement(data, 'REQ-001', { status: 'scheduled' })).not.toThrow();
    expect(updateRequirement(data, 'REQ-001', { status: 'scheduled' }))
      .toEqual({ ok: false, code: 'invalid_status' });
  });

  it('allLinkedStagesDone：零关联 false / 全 done true / 部分 false', () => {
    expect(allLinkedStagesDone(makeFlowData(), 'REQ-001')).toBe(false);
    const allDone = makeFlowData({
      a: makeStage({ phase: 'done', requirement_id: 'REQ-001' }),
      b: makeStage({ phase: 'done', requirement_id: 'REQ-001' }),
    });
    expect(allLinkedStagesDone(allDone, 'REQ-001')).toBe(true);
    const partial = makeFlowData({
      a: makeStage({ phase: 'done', requirement_id: 'REQ-001' }),
      b: makeStage({ phase: 'exec_running', requirement_id: 'REQ-001' }),
    });
    expect(allLinkedStagesDone(partial, 'REQ-001')).toBe(false);
  });
});

// ═══════════════════════════════════════
// T5.4b link
// ═══════════════════════════════════════
describe('需求原语 — T5.4b link', () => {
  function seed(): FlowData {
    const data = makeFlowData({ 'vX-stage-01': makeStage() });
    data.requirements = [makeReq('REQ-001', 'scheduled'), makeReq('REQ-002', 'scheduled')];
    return data;
  }

  it('link 成功 + 审计', () => {
    const data = seed();
    expect(linkRequirement(data, 'vX-stage-01', 'REQ-001')).toEqual({ ok: true, changed: true });
    expect(data.stages['vX-stage-01'].requirement_id).toBe('REQ-001');
    expect(lastLog(data).action).toBe('requirement_link');
    expect(lastLog(data).detail).toEqual({ stage: 'vX-stage-01', requirementId: 'REQ-001' });
  });

  it('同值幂等 → changed:false', () => {
    const data = seed();
    linkRequirement(data, 'vX-stage-01', 'REQ-001');
    expect(linkRequirement(data, 'vX-stage-01', 'REQ-001')).toEqual({ ok: true, changed: false });
  });

  it('跨需求重绑 → already_linked 零变更', () => {
    const data = seed();
    linkRequirement(data, 'vX-stage-01', 'REQ-001');
    expect(linkRequirement(data, 'vX-stage-01', 'REQ-002')).toEqual({ ok: false, code: 'already_linked' });
    expect(data.stages['vX-stage-01'].requirement_id).toBe('REQ-001');
  });

  it('解绑 null（还原可空）+ 解绑后可再绑', () => {
    const data = seed();
    linkRequirement(data, 'vX-stage-01', 'REQ-001');
    expect(linkRequirement(data, 'vX-stage-01', null)).toEqual({ ok: true, changed: true });
    expect(data.stages['vX-stage-01'].requirement_id).toBeNull();
    expect(linkRequirement(data, 'vX-stage-01', 'REQ-002')).toEqual({ ok: true, changed: true });
    expect(data.stages['vX-stage-01'].requirement_id).toBe('REQ-002');
  });

  it('解绑未关联 stage → changed:false', () => {
    const data = seed();
    expect(linkRequirement(data, 'vX-stage-01', null)).toEqual({ ok: true, changed: false });
  });

  it('stage 不存在 → stage_not_found / 需求不存在 → not_found', () => {
    const data = seed();
    expect(linkRequirement(data, 'nope', 'REQ-001')).toEqual({ ok: false, code: 'stage_not_found' });
    expect(linkRequirement(data, 'vX-stage-01', 'REQ-999')).toEqual({ ok: false, code: 'not_found' });
  });

  it('终态需求 → invalid_status（拒绝关联）', () => {
    const data = makeFlowData({ 'vX-stage-01': makeStage() });
    data.requirements = [makeReq('REQ-001', 'done')];
    expect(linkRequirement(data, 'vX-stage-01', 'REQ-001')).toEqual({ ok: false, code: 'invalid_status' });
  });

  it('link 不刷新 requirement.updated_at', () => {
    const data = seed();
    const before = data.requirements![0].updated_at;
    linkRequirement(data, 'vX-stage-01', 'REQ-001');
    expect(data.requirements![0].updated_at).toBe(before);
  });
});

// ═══════════════════════════════════════
// T5.4c 读侧宽容（读路径）
// ═══════════════════════════════════════
describe('需求原语 — T5.4c 读侧宽容', () => {
  it('无 requirements 字段 → 全部读路径零报错', () => {
    const data = makeFlowData();
    expect(getRequirements(data)).toEqual([]);
    expect(listRequirements(data)).toEqual([]);
    expect(getRequirement(data, 'REQ-001')).toBeNull();
    expect(nextRequirementId(data)).toBe('REQ-001');
  });

  it('requirements 非数组 → 读路径宽容为 []', () => {
    const data = makeFlowData();
    (data as unknown as { requirements: unknown }).requirements = 'not-an-array';
    expect(getRequirements(data)).toEqual([]);
    expect(nextRequirementId(data)).toBe('REQ-001');
  });

  it('查询返回浅副本：改返回值不影响存储', () => {
    const data = makeFlowData();
    addRequirement(data, { title: 'x' });
    const list = getRequirements(data);
    list[0].title = '被篡改';
    expect(data.requirements![0].title).toBe('x');
  });
});

// ═══════════════════════════════════════
// T5.5 正文骨架
// ═══════════════════════════════════════
describe('需求正文原语 — T5.5 骨架', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-req-body-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('路径单点：rel 恒 POSIX；getRequirementBodyPath 落在 getRequirementsDir 下', () => {
    expect(getRequirementBodyRelPath('REQ-001')).toBe('.openfeel/requirements/REQ-001.md');
    expect(getRequirementBodyPath(tmpDir, 'REQ-001')).toBe(join(getRequirementsDir(tmpDir), 'REQ-001.md'));
  });

  it('两次调用 → 目录幂等 + 二次不抛；内容含标题/注记/状态快照/六章节；body_path 已设 POSIX', () => {
    const data = makeFlowData();
    const req = addRequirement(data, { title: '需求一' });

    const p1 = writeRequirementBodySkeleton(tmpDir, req);
    expect(existsSync(p1)).toBe(true);
    expect(() => writeRequirementBodySkeleton(tmpDir, req)).not.toThrow();
    expect(existsSync(getRequirementsDir(tmpDir))).toBe(true);

    const content = readFileSync(p1, 'utf-8');
    expect(content).toContain('# REQ-001：需求一');
    expect(content).toContain('机读权威恒为');
    expect(content).toContain('## 状态');
    expect(content).toContain('draft（创建时快照；以 flow.json 为准）');
    for (const section of ['## 摘要', '## 目标与验收', '## 预估版本', '## 父需求', '## 关联阶段', '## 变更记录']) {
      expect(content).toContain(section);
    }
    // 七 H2 章节
    expect(content.match(/^## /gm)!.length).toBe(7);

    expect(req.body_path).toBe('.openfeel/requirements/REQ-001.md');   // POSIX 断言
  });

  it('target_version 缺省渲染为（未指定）', () => {
    const data = makeFlowData();
    const req = addRequirement(data, { title: 'x' });
    const p = writeRequirementBodySkeleton(tmpDir, req);
    expect(readFileSync(p, 'utf-8')).toContain('（未指定）');
    expect(readFileSync(p, 'utf-8')).toContain('## 父需求\n\n（无）');   // 精确串（防任意「（无）」误命中）
  });

  it('已存在 → no-op 不覆盖（内容逐字不变）；仍保证 body_path 赋值', () => {
    const data = makeFlowData();
    const req = addRequirement(data, { title: 'x' });
    const p = writeRequirementBodySkeleton(tmpDir, req);

    const custom = '# 自定义内容\n\n人工补充\n';
    writeFileSync(p, custom, 'utf-8');
    delete req.body_path;
    const p2 = writeRequirementBodySkeleton(tmpDir, req);
    expect(p2).toBe(p);
    expect(readFileSync(p, 'utf-8')).toBe(custom);                     // 未被覆盖
    expect(req.body_path).toBe('.openfeel/requirements/REQ-001.md');   // 仍赋值
  });
});

// ═══════════════════════════════════════
// T5.4d 集成（写路径 + save）
// ═══════════════════════════════════════
describe('需求原语 — T5.4d save 集成', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-req-save-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('initFlow（revision 0）→ addRequirement → save → 读盘 REQ-001 + revision 1 → 重载保留', () => {
    FlowManager.initFlow(tmpDir);
    const mgr = new FlowManager(tmpDir);
    addRequirement(mgr.getData()!, { title: '需求一' });
    mgr.save();

    const parsed = JSON.parse(readFileSync(join(tmpDir, '.openfeel', 'flow.json'), 'utf-8'));
    expect(parsed.requirements[0].id).toBe('REQ-001');
    expect(parsed.meta.revision).toBe(1);                    // 0 → save 后恒 1（REV-81-014）

    const reloaded = new FlowManager(tmpDir);
    expect(getRequirements(reloaded.getData()!)).toHaveLength(1);
    expect(getRequirements(reloaded.getData()!)[0].title).toBe('需求一');
  });

  it('mkdir 隔离：仅 fixture tmpDir 下创建 requirements 目录', () => {
    const data = makeFlowData();
    const req = addRequirement(data, { title: 'x' });
    const p = writeRequirementBodySkeleton(tmpDir, req);
    // 路径落在 tmpDir 之内（未越界到真实工作区）
    expect(p.startsWith(tmpDir)).toBe(true);
    mkdirSync(getRequirementsDir(tmpDir), { recursive: true });
  });
});

// ═══════════════════════════════════════
// T5.6 正交边界（静态断言）
// ═══════════════════════════════════════
describe('正交边界（stage-81 op-003 / T5.6）', () => {
  const readSrc = (f: string): string =>
    readFileSync(new URL(`../../src/core/req/${f}`, import.meta.url), 'utf-8');

  const FILES = ['types.ts', 'requirement-ops.ts', 'body-file.ts'] as const;
  // 禁用串清单锁定（防清单被删空）
  const NEEDLES = ['workflow_mode', 'PIPELINE_PHASES', 'getValidTargets', 'flow-archive', 'process.cwd', 'homedir'] as const;

  it('防假绿：三源文件内容非空', () => {
    for (const f of FILES) {
      expect(readSrc(f).length).toBeGreaterThan(0);
    }
  });

  it('正控：各文件独有符号存在（证明读取路径真实有效）', () => {
    expect(readSrc('types.ts')).toContain('REQ_STATUSES');
    expect(readSrc('requirement-ops.ts')).toContain('allLinkedStagesDone');
    expect(readSrc('body-file.ts')).toContain('writeRequirementBodySkeleton');
  });

  it('NEEDLES 清单锁定（6 串）', () => {
    expect(NEEDLES.length).toBe(6);
  });

  it('禁止串零命中（扫描源文件全内容，含文件头注释 / JSDoc）', () => {
    for (const f of FILES) {
      const src = readSrc(f);
      for (const n of NEEDLES) {
        expect(src.includes(n)).toBe(false);   // 字面零命中（等价 rg 单串口径）
      }
    }
  });
});

// ═══════════════════════════════════════
// T5.7 承接回归（stage-82）
// ═══════════════════════════════════════
// 承接：req/BUG-001（= REV-81-019 同处单点收口）写路径非数组守卫；
//       新增导出 getAllowedNextStatuses（REV-82-003）。既有断言段零改动（REV-81-017 移交 stage-85）。
describe('需求原语 — T5.7 承接回归（stage-82）', () => {
  it('BUG-001：requirements 非数组真值（{} / "x" / 123）→ addRequirement 不抛错、容器化为数组续建', () => {
    const variants: unknown[] = [{}, 'x', 123];
    for (const bad of variants) {
      const data = makeFlowData();
      // 直构损坏数据（绕过类型：非数组真值）
      (data as unknown as { requirements: unknown }).requirements = bad;
      let created: RequirementData | null = null;
      expect(() => { created = addRequirement(data, { title: '承接回归' }); }).not.toThrow();
      expect(created).not.toBeNull();
      expect(created!.id).toBe('REQ-001');
      expect(Array.isArray(data.requirements)).toBe(true);
      expect(data.requirements).toHaveLength(1);
      expect(data.requirements[0].id).toBe('REQ-001');
      // 审计在位（写路径正常完成）
      expect(lastLog(data).action).toBe('requirement_add');
    }
  });

  it('getAllowedNextStatuses：7 状态全表（含 blocked 两出口补全）', () => {
    expect(getAllowedNextStatuses('draft')).toEqual(['scheduled', 'blocked', 'cancelled', 'rejected']);
    expect(getAllowedNextStatuses('scheduled')).toEqual(['in_progress', 'blocked', 'cancelled', 'rejected']);
    expect(getAllowedNextStatuses('in_progress')).toEqual(['done', 'blocked', 'cancelled', 'rejected']);
    expect(getAllowedNextStatuses('blocked')).toEqual(['scheduled', 'in_progress', 'cancelled', 'rejected']);
    expect(getAllowedNextStatuses('done')).toEqual([]);
    expect(getAllowedNextStatuses('cancelled')).toEqual([]);
    expect(getAllowedNextStatuses('rejected')).toEqual([]);
  });

  it('getAllowedNextStatuses：域外状态 → []（不崩）', () => {
    expect(getAllowedNextStatuses('foo' as RequirementStatus)).toEqual([]);
  });

  it('getAllowedNextStatuses：返回副本（外部 push 不污染内部表）', () => {
    const first = getAllowedNextStatuses('draft');
    first.push('done' as RequirementStatus);
    expect(getAllowedNextStatuses('draft')).toEqual(['scheduled', 'blocked', 'cancelled', 'rejected']);
  });
});

// ═══════════════════════════════════════
// 段 A：聚合投影穷举（stage-83 op-001 / T4.1 + T4.5）
// ═══════════════════════════════════════

/** 构造带（可选）requirements 的 FlowData */
function aggData(stages: Record<string, StageData>, requirements?: RequirementData[]): FlowData {
  const d = makeFlowData(stages);
  if (requirements) { d.requirements = requirements; }
  return d;
}

/** 构造关联某需求的阶段 */
function linkedStage(requirementId: string, phase: PipelinePhase): StageData {
  return makeStage({ phase, requirement_id: requirementId });
}

describe('需求聚合投影 — T4.1 投影穷举（stage-83 op-001）', () => {
  it('T4.1a 单阶段 × 全量 phase 表驱动（PIPELINE_PHASES 单一来源，禁硬编码）', () => {
    expect(PIPELINE_PHASES.length).toBe(15);   // 全量来源锁定
    for (const phase of PIPELINE_PHASES) {
      const data = aggData({ 'stage-01': linkedStage('REQ-001', phase) });
      // plan_pending → scheduled；done → done；其余 13 相位 → in_progress
      const expected = phase === 'plan_pending' ? 'scheduled' : phase === 'done' ? 'done' : 'in_progress';
      const agg = computeRequirementAggregate(data, 'REQ-001');
      expect(agg).toEqual({
        stageIds: ['stage-01'],
        stageCount: 1,
        doneCount: phase === 'done' ? 1 : 0,
        aggregate: expected,
      });
    }
  });

  it('T4.1b 多阶段组合（stageCount / stageIds 键序 / doneCount 同步断言）', () => {
    const cases: Array<{ phases: PipelinePhase[]; expected: string; doneCount: number }> = [
      { phases: ['done', 'done'], expected: 'done', doneCount: 2 },
      { phases: ['done', 'plan_pending'], expected: 'in_progress', doneCount: 1 },
      { phases: ['done', 'exec_running'], expected: 'in_progress', doneCount: 1 },
      { phases: ['plan_pending', 'plan_pending'], expected: 'scheduled', doneCount: 0 },
      { phases: ['plan_pending', 'archiving'], expected: 'in_progress', doneCount: 0 },
    ];
    for (const c of cases) {
      const stages: Record<string, StageData> = {};
      c.phases.forEach((p, i) => { stages[`stage-0${i + 1}`] = linkedStage('REQ-001', p); });
      const agg = computeRequirementAggregate(aggData(stages), 'REQ-001');
      expect(agg.stageCount).toBe(c.phases.length);
      expect(agg.stageIds).toEqual(c.phases.map((_p, i) => `stage-0${i + 1}`));
      expect(agg.doneCount).toBe(c.doneCount);
      expect(agg.aggregate).toBe(c.expected);
    }
  });

  it('T4.1c 空关联与边界（零关联 / stages 缺省不崩 / 关联他需求）', () => {
    // ① 零关联需求 id
    const zero = computeRequirementAggregate(aggData({ 'stage-01': linkedStage('REQ-001', 'done') }), 'REQ-999');
    expect(zero).toEqual({ stageIds: [], stageCount: 0, doneCount: 0, aggregate: null });
    // ② data.stages 缺省（undefined）——读侧宽容不崩
    const noStages = makeFlowData();
    (noStages as unknown as { stages: undefined }).stages = undefined;
    expect(computeRequirementAggregate(noStages, 'REQ-001')).toEqual({ stageIds: [], stageCount: 0, doneCount: 0, aggregate: null });
    // ③ 阶段关联他需求 → 目标需求投影为 null
    const other = computeRequirementAggregate(aggData({ 'stage-01': linkedStage('REQ-002', 'done') }), 'REQ-001');
    expect(other.aggregate).toBeNull();
    expect(other.stageCount).toBe(0);
  });

  it('T4.5 两处同源：aggregate === "done" ⟺ allLinkedStagesDone（全 fixture 四组）', () => {
    const fixtures: FlowData[] = [
      // 组 1：空关联
      aggData({ 'stage-01': linkedStage('REQ-002', 'done') }),
      // 组 2：单阶段 ×15
      ...PIPELINE_PHASES.map((p) => aggData({ 'stage-01': linkedStage('REQ-001', p) })),
      // 组 3：多阶段部分 done
      aggData({ 'stage-01': linkedStage('REQ-001', 'done'), 'stage-02': linkedStage('REQ-001', 'exec_running') }),
      // 组 4：多阶段全 done
      aggData({ 'stage-01': linkedStage('REQ-001', 'done'), 'stage-02': linkedStage('REQ-001', 'done') }),
    ];
    for (const data of fixtures) {
      expect(computeRequirementAggregate(data, 'REQ-001').aggregate === 'done')
        .toBe(allLinkedStagesDone(data, 'REQ-001'));
    }
  });

  it('T4.1d resolveRequirementStatusForStage 四态（有关联 / 无关联 / 阶段不存在 / 空串）', () => {
    // 有关联 → { requirementId, target }
    const linked = aggData({ 'stage-01': linkedStage('REQ-001', 'done') });
    expect(resolveRequirementStatusForStage(linked, 'stage-01')).toEqual({ requirementId: 'REQ-001', target: 'done' });
    // 无关联（requirement_id 缺省）
    const noLink = aggData({ 'stage-01': makeStage({ phase: 'done' }) });
    expect(resolveRequirementStatusForStage(noLink, 'stage-01')).toBeNull();
    // 阶段不存在
    expect(resolveRequirementStatusForStage(linked, 'stage-99')).toBeNull();
    // requirement_id 空串
    const emptyStr = aggData({ 'stage-01': makeStage({ phase: 'done', requirement_id: '' }) });
    expect(resolveRequirementStatusForStage(emptyStr, 'stage-01')).toBeNull();
  });
});

// ═══════════════════════════════════════
// 段 B：回写入口 7×2 直调矩阵（stage-83 op-001 / syncRequirementStatus）
// ═══════════════════════════════════════
describe('需求聚合回写入口 — 7×2 直调矩阵（stage-83 op-001）', () => {
  const ALL_STATUSES: readonly RequirementStatus[] = REQ_STATUSES;

  it('AUTO_DONE_PRECONDITION 逐字锁定（["scheduled","in_progress"]，长度 2）', () => {
    expect(AUTO_DONE_PRECONDITION).toEqual(['scheduled', 'in_progress']);
    expect(AUTO_DONE_PRECONDITION.length).toBe(2);
  });

  it('正向列（7 status × 聚合 done）：仅 {scheduled,in_progress} 写 done + 审计逐字段；其余零动作零审计', () => {
    for (const status of ALL_STATUSES) {
      const data = aggData(
        { 'stage-01': linkedStage('REQ-001', 'done') },
        [makeReq('REQ-001', status)],
      );
      const logLenBefore = data.log.length;
      const affected = syncRequirementStatus(data, 'stage-01');
      const req = data.requirements![0];
      if (status === 'scheduled' || status === 'in_progress') {
        expect(req.status).toBe('done');
        expect(req.updated_at).not.toBe('2026-01-01T00:00:00.000Z');   // updated_at 刷新
        expect(affected).toEqual(['REQ-001']);
        expect(data.log.length).toBe(logLenBefore + 1);                // 恰一条审计
        const entry = lastLog(data);
        expect(entry.action).toBe('requirement_auto_done');
        expect(entry.agent).toBe('cli');
        expect(entry.detail).toEqual({ requirementId: 'REQ-001', from: status, to: 'done', triggerStage: 'stage-01' });
      } else {
        expect(req.status).toBe(status);                               // 状态逐字不变
        expect(affected).toEqual([]);
        expect(data.log.length).toBe(logLenBefore);                    // 零新增日志
      }
    }
  });

  it('反向列（7 status × 聚合非 done 双阶段 [done,exec_running]）：仅 done 回退 in_progress + 审计；其余 6 零动作零审计', () => {
    for (const status of ALL_STATUSES) {
      const data = aggData(
        { 'stage-01': linkedStage('REQ-001', 'done'), 'stage-02': linkedStage('REQ-001', 'exec_running') },
        [makeReq('REQ-001', status)],
      );
      const logLenBefore = data.log.length;
      const affected = syncRequirementStatus(data, 'stage-01');
      const req = data.requirements![0];
      if (status === 'done') {
        // S-83-3 声明式自愈（不绑定事件）：done × 聚合非 done → 回退 + 审计
        expect(req.status).toBe('in_progress');
        expect(affected).toEqual(['REQ-001']);
        expect(data.log.length).toBe(logLenBefore + 1);
        const entry = lastLog(data);
        expect(entry.action).toBe('requirement_auto_reopen');
        expect(entry.agent).toBe('cli');
        expect(entry.detail).toEqual({ requirementId: 'REQ-001', from: 'done', to: 'in_progress', triggerStage: 'stage-01' });
      } else {
        expect(req.status).toBe(status);
        expect(affected).toEqual([]);
        expect(data.log.length).toBe(logLenBefore);
      }
    }
  });

  it('回退目标单点（S-83-5）：status=done × 聚合 scheduled → 回退 in_progress（非 scheduled）', () => {
    const data = aggData(
      { 'stage-01': linkedStage('REQ-001', 'plan_pending') },
      [makeReq('REQ-001', 'done')],
    );
    expect(computeRequirementAggregate(data, 'REQ-001').aggregate).toBe('scheduled');
    syncRequirementStatus(data, 'stage-01');
    expect(data.requirements![0].status).toBe('in_progress');   // 回退目标恒 in_progress
  });

  it('零动作四路：无 requirement_id / 悬空 / requirements 缺省零注入 / 状态已一致', () => {
    // ① 无 requirement_id
    const noLink = aggData({ 'stage-01': makeStage({ phase: 'done' }) }, [makeReq('REQ-001', 'scheduled')]);
    const n0 = noLink.log.length;
    expect(syncRequirementStatus(noLink, 'stage-01')).toEqual([]);
    expect(noLink.log.length).toBe(n0);
    expect(noLink.requirements![0].status).toBe('scheduled');

    // ② 悬空（requirement_id 指向不存在需求）——不抛错
    const dangling = aggData({ 'stage-01': linkedStage('REQ-999', 'done') }, [makeReq('REQ-001', 'scheduled')]);
    const n1 = dangling.log.length;
    expect(() => syncRequirementStatus(dangling, 'stage-01')).not.toThrow();
    expect(syncRequirementStatus(dangling, 'stage-01')).toEqual([]);
    expect(dangling.log.length).toBe(n1);

    // ③ requirements 键缺省 → 零注入（'requirements' in data === false 保持）
    const noReqKey = aggData({ 'stage-01': linkedStage('REQ-001', 'done') });
    expect('requirements' in noReqKey).toBe(false);
    expect(syncRequirementStatus(noReqKey, 'stage-01')).toEqual([]);
    expect('requirements' in noReqKey).toBe(false);

    // ④ 状态已一致（聚合 done ∧ status 已 done → 前置集外 → 零动作）
    const consistent = aggData({ 'stage-01': linkedStage('REQ-001', 'done') }, [makeReq('REQ-001', 'done')]);
    const n3 = consistent.log.length;
    expect(syncRequirementStatus(consistent, 'stage-01')).toEqual([]);
    expect(consistent.requirements![0].status).toBe('done');
    expect(consistent.log.length).toBe(n3);
  });
});

// ═══════════════════════════════════════
// 段 C：正交与单源静态断言（stage-83 op-001）
// ═══════════════════════════════════════
describe('聚合模块 — 正交与单源静态断言（stage-83 op-001）', () => {
  const src = readFileSync(new URL('../../src/core/req/aggregate.ts', import.meta.url), 'utf-8');
  const NEEDLES = ['workflow_mode', 'PIPELINE_PHASES', 'getValidTargets', 'flow-archive', 'process.cwd', 'homedir'] as const;

  it('防假绿：源文件内容非空 + 正控（独有符号在位）', () => {
    expect(src.length).toBeGreaterThan(0);
    expect(src).toContain('computeRequirementAggregate');
  });

  it('禁用串清单锁定（6 串）', () => {
    expect(NEEDLES.length).toBe(6);
  });

  it('禁用串零命中（扫描全内容，含文件头注释 / JSDoc）', () => {
    for (const n of NEEDLES) {
      expect(src.includes(n)).toBe(false);
    }
  });

  it('单源：done 判定委托 allLinkedStagesDone + 禁第二份 done 表达式（.every( 零命中）', () => {
    expect(src).toContain('allLinkedStagesDone(');
    expect(src.includes('.every(')).toBe(false);
  });

  it('动作名单点锁定 + 前置集常量在位', () => {
    expect(src).toContain("'requirement_auto_done'");
    expect(src).toContain("'requirement_auto_reopen'");
    expect(src).toContain('AUTO_DONE_PRECONDITION');
  });
});

// ═══════════════════════════════════════
// 段 D：需求对账项单测（stage-83 op-003 / T4.6 单测面）
// ═══════════════════════════════════════
describe('需求对账项 — requirementHealthItems（stage-83 op-003）', () => {
  it('悬空场景：requirement_id 指向不存在需求 → 恰 1 条「需求对账」warn（含 stage-01 → REQ-999）', () => {
    const data = aggData({ 'stage-01': makeStage({ phase: 'done', requirement_id: 'REQ-999' }) }, []);
    const items = requirementHealthItems({ data });
    const links = items.filter((i) => i.section === '需求对账');
    expect(links).toHaveLength(1);
    expect(links[0].status).toBe('warn');
    expect(links[0].message).toContain('stage-01 → REQ-999');
  });

  it('干净场景：关联且需求存在 → 恰 1 条「需求对账」pass + 无「需求漂移」条目', () => {
    const data = aggData(
      { 'stage-01': linkedStage('REQ-001', 'done') },
      [makeReq('REQ-001', 'done')],
    );
    const items = requirementHealthItems({ data });
    const links = items.filter((i) => i.section === '需求对账');
    expect(links).toHaveLength(1);
    expect(links[0].status).toBe('pass');
    expect(links[0].message).toContain('1');               // 含需求数
    expect(items.some((i) => i.section === '需求漂移')).toBe(false);
  });

  it('漂移场景：status ∈ {scheduled,in_progress} × 关联阶段全 done → 「需求漂移」warn（含 REQ-NNN）', () => {
    for (const status of ['scheduled', 'in_progress'] as const) {
      const data = aggData({ 'stage-01': linkedStage('REQ-001', 'done') }, [makeReq('REQ-001', status)]);
      const items = requirementHealthItems({ data });
      const drift = items.filter((i) => i.section === '需求漂移');
      expect(drift).toHaveLength(1);
      expect(drift[0].status).toBe('warn');
      expect(drift[0].message).toContain('REQ-001');
    }
  });

  it('设计豁免：status ∈ {draft,blocked,cancelled,rejected} × 聚合 done → 无漂移条目（且「需求对账」pass）', () => {
    for (const status of ['draft', 'blocked', 'cancelled', 'rejected'] as const) {
      const data = aggData({ 'stage-01': linkedStage('REQ-001', 'done') }, [makeReq('REQ-001', status)]);
      const items = requirementHealthItems({ data });
      expect(items.some((i) => i.section === '需求漂移')).toBe(false);
      expect(items.find((i) => i.section === '需求对账')!.status).toBe('pass');
    }
  });

  it('前置集命中但聚合非 done → 无漂移条目', () => {
    const data = aggData(
      { 'stage-01': linkedStage('REQ-001', 'done'), 'stage-02': linkedStage('REQ-001', 'exec_running') },
      [makeReq('REQ-001', 'in_progress')],
    );
    const items = requirementHealthItems({ data });
    expect(items.some((i) => i.section === '需求漂移')).toBe(false);
  });

  it('零数据：requirements 键缺省 + stages 空 → 恰 1 条 pass（n=0）；全场景恒无 fail', () => {
    const data = makeFlowData({});
    const items = requirementHealthItems({ data });
    expect(items).toHaveLength(1);
    expect(items[0].section).toBe('需求对账');
    expect(items[0].status).toBe('pass');
    expect(items.every((i) => i.status !== 'fail')).toBe(true);
  });

  it('空串守卫：requirement_id: "" → 不判悬空（pass）', () => {
    const data = aggData({ 'stage-01': makeStage({ phase: 'done', requirement_id: '' }) }, []);
    const items = requirementHealthItems({ data });
    const links = items.filter((i) => i.section === '需求对账');
    expect(links).toHaveLength(1);
    expect(links[0].status).toBe('pass');
    expect(items.every((i) => i.status !== 'fail')).toBe(true);
  });
});

// ═══════════════════════════════════════
// 需求拆分原语 — stage-87 op-001（W1~W10）
// ═══════════════════════════════════════
describe('需求拆分原语 — stage-87 op-001', () => {
  it('W1 成功：顺序 ID / parent_id / scheduled / 同批时间 / 返回本体 / 恰 1 条审计 / 父零副作用', () => {
    const data = makeFlowData();
    const parent = addRequirement(data, { title: '父' });
    const parentUpdatedBefore = parent.updated_at;
    const parentStatusBefore = parent.status;
    const logLenBefore = data.log.length;

    const r = splitRequirement(data, 'REQ-001', [{ title: 'A' }, { title: 'B' }]);

    expect(r.ok).toBe(true);
    if (!r.ok) { return; }
    expect(r.children).toHaveLength(2);
    expect(r.children.map((c) => c.id)).toEqual(['REQ-002', 'REQ-003']);
    for (const c of r.children) {
      expect(c.parent_id).toBe('REQ-001');
      expect(c.status).toBe('scheduled');
      expect(c.created_at).toBe(c.updated_at);
    }
    // 返回本体（非浅副本）
    expect(r.children[0]).toBe(data.requirements![1]);
    expect(r.children[1]).toBe(data.requirements![2]);
    // 审计恰 1 条
    expect(data.log.length).toBe(logLenBefore + 1);
    expect(lastLog(data).action).toBe('requirement_split');
    expect(lastLog(data).detail).toEqual({ parentId: 'REQ-001', children: ['REQ-002', 'REQ-003'] });
    // 父零副作用
    const parentAfter = data.requirements![0];
    expect(parentAfter.status).toBe(parentStatusBefore);
    expect(parentAfter.updated_at).toBe(parentUpdatedBefore);
    expect('parent_id' in parentAfter).toBe(false);
    expect(data.requirements).toHaveLength(3);
  });

  it('W2 顺序 ID + 不回收：现存 REQ-001、REQ-005 → 子 = REQ-006、REQ-007', () => {
    const data = makeFlowData();
    data.requirements = [makeReq('REQ-001', 'draft'), makeReq('REQ-005', 'draft')];
    const r = splitRequirement(data, 'REQ-001', [{ title: 'A' }, { title: 'B' }]);
    expect(r.ok).toBe(true);
    if (!r.ok) { return; }
    expect(r.children.map((c) => c.id)).toEqual(['REQ-006', 'REQ-007']);
  });

  it('W3 父不存在 → not_found + 零变更零审计', () => {
    const data = makeFlowData();
    data.requirements = [makeReq('REQ-001', 'draft')];
    const logLen = data.log.length;
    const r = splitRequirement(data, 'REQ-999', [{ title: 'A' }]);
    expect(r).toEqual({ ok: false, code: 'not_found' });
    expect(data.requirements).toHaveLength(1);
    expect(data.log.length).toBe(logLen);
  });

  it('W4 父终态（done / cancelled / rejected 表驱动）→ invalid_status + 零变更零审计', () => {
    for (const status of ['done', 'cancelled', 'rejected'] as const) {
      const data = makeFlowData();
      data.requirements = [makeReq('REQ-001', status)];
      const logLen = data.log.length;
      const r = splitRequirement(data, 'REQ-001', [{ title: 'A' }]);
      expect(r).toEqual({ ok: false, code: 'invalid_status' });
      expect(data.requirements).toHaveLength(1);
      expect(data.log.length).toBe(logLen);
    }
  });

  it('W5 children = [] → invalid_field + 零变更零审计（argument-shape）', () => {
    const data = makeFlowData();
    data.requirements = [makeReq('REQ-001', 'draft')];
    const logLen = data.log.length;
    const r = splitRequirement(data, 'REQ-001', []);
    expect(r).toEqual({ ok: false, code: 'invalid_field' });
    expect(data.requirements).toHaveLength(1);
    expect(data.log.length).toBe(logLen);
  });

  it('W6 事务性：第 1 项合法 + 第 2 项空白 → invalid_field + 零变更零审计（正控）', () => {
    const data = makeFlowData();
    data.requirements = [makeReq('REQ-001', 'draft')];
    const logLen = data.log.length;
    const r = splitRequirement(data, 'REQ-001', [{ title: 'A' }, { title: '   ' }]);
    expect(r).toEqual({ ok: false, code: 'invalid_field' });
    expect(data.requirements).toHaveLength(1);           // 正控：长度逐字不变
    expect(data.log.length).toBe(logLen);                // 正控：审计零新增
  });

  it('W7 requirements 非数组真值（{}）→ 不抛错 + 视同空集（父不存在 not_found）+ 零变更零审计', () => {
    const data = makeFlowData();
    (data as unknown as { requirements: unknown }).requirements = { 'REQ-001': makeReq('REQ-001', 'draft') };
    const corrupted = data.requirements;
    let r: ReturnType<typeof splitRequirement> | null = null;
    expect(() => { r = splitRequirement(data, 'REQ-001', [{ title: 'A' }]); }).not.toThrow();
    // 非数组 ≡ 空集（读侧宽容口径，BUG-001 / REV-81-019 延伸）→ 父恒不存在
    expect(r!.ok).toBe(false);
    expect((r! as { code: string }).code).toBe('not_found');
    // 零变更：失败路径不改动（容器化仅成功路径发生）
    expect(data.requirements).toBe(corrupted);
    expect(data.log.length).toBe(0);
  });

  it('W8 读侧宽容：add 创建条目无 parent_id 键；split 子条目有 parent_id 键', () => {
    const data = makeFlowData();
    addRequirement(data, { title: '父' });
    expect('parent_id' in data.requirements![0]).toBe(false);   // 不注入
    const r = splitRequirement(data, 'REQ-001', [{ title: 'A' }]);
    expect(r.ok).toBe(true);
    if (!r.ok) { return; }
    expect('parent_id' in r.children[0]).toBe(true);
  });

  it('W9 骨架：split 子正文含「## 父需求\n\nREQ-001」且 ^## 计数 7；add 创建含「（无）」', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-req-split-body-'));
    try {
      const data = makeFlowData();
      addRequirement(data, { title: '父' });
      const r = splitRequirement(data, 'REQ-001', [{ title: 'A' }]);
      expect(r.ok).toBe(true);
      if (!r.ok) { return; }
      const childPath = writeRequirementBodySkeleton(tmpDir, r.children[0]);
      const childContent = readFileSync(childPath, 'utf-8');
      expect(childContent).toContain('## 父需求\n\nREQ-001');
      expect(childContent.match(/^## /gm)!.length).toBe(7);
      expect(childContent).toContain('初始状态 scheduled');   // 状态参数化（非硬编码 draft）

      const addPath = writeRequirementBodySkeleton(tmpDir, data.requirements![0]);
      expect(readFileSync(addPath, 'utf-8')).toContain('## 父需求\n\n（无）');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('W10 聚合隔离（R-87-1 正控）：父子不聚合 + 不参与 done 门', () => {
    const data = makeFlowData({});
    addRequirement(data, { title: '父' });
    splitRequirement(data, 'REQ-001', [{ title: 'A' }, { title: 'B' }]);
    // 父无关联阶段 → 聚合 null（子需求 parent_id 不构成关联）
    expect(computeRequirementAggregate(data, 'REQ-001').aggregate).toBeNull();
    expect(allLinkedStagesDone(data, 'REQ-001')).toBe(false);
    // 子需求亦零关联
    expect(computeRequirementAggregate(data, 'REQ-002').aggregate).toBeNull();
    expect(allLinkedStagesDone(data, 'REQ-002')).toBe(false);
  });
});
