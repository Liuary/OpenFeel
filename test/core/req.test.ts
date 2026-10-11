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
  advanceRequirement, linkRequirement,
  isTerminalRequirementStatus, allLinkedStagesDone,
  getAllowedNextStatuses,
} from '../../src/core/req/requirement-ops.js';
import {
  getRequirementsDir, getRequirementBodyRelPath, getRequirementBodyPath, writeRequirementBodySkeleton,
} from '../../src/core/req/body-file.js';
import type { RequirementData, RequirementStatus } from '../../src/core/req/types.js';
import { FlowManager, type FlowData, type StageData, type PipelinePhase, type MetaPhase } from '../../src/core/flow-manager.js';

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
    for (const section of ['## 摘要', '## 目标与验收', '## 预估版本', '## 关联阶段', '## 变更记录']) {
      expect(content).toContain(section);
    }
    // 六 H2 章节
    expect(content.match(/^## /gm)!.length).toBe(6);

    expect(req.body_path).toBe('.openfeel/requirements/REQ-001.md');   // POSIX 断言
  });

  it('target_version 缺省渲染为（未指定）', () => {
    const data = makeFlowData();
    const req = addRequirement(data, { title: 'x' });
    const p = writeRequirementBodySkeleton(tmpDir, req);
    expect(readFileSync(p, 'utf-8')).toContain('（未指定）');
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
