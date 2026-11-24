/**
 * 共享夹具工厂测试 — v1.6.1 / REQ-065 A65.1
 *
 * 断言三件事（判据仍单点在 `src/core/plan/filled.ts`，本文件不复制任何阈值）：
 * 1. 工厂产物**直接**通过 `isRequirementBodyFilled` / `isRequirementPlanFilled` /
 *    `isStagePlanFilled` / `isStageOverviewFilled`；
 * 2. 两个栈拿到的是**同一份导出**（`test/fixtures/requirements.ts` 只是再导出，
 *    与直接 import `requirement-input.js` 的函数引用同一）；
 * 3. `dsh/test/verify.js` 真的 import 了这份共享 helper（注释声明不算复用）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  FILLED_ACCEPTANCE_TEXT,
  FILLED_GOAL_TEXT,
  FILLED_SUMMARY_TEXT,
  makeFilledBodyInput,
  makeFilledRequirement,
  makeOverview,
  makeRequirementPlan,
  makeStagePlan,
} from './requirements.js';
import * as direct from './requirement-input.js';
import {
  isRequirementBodyFilled,
  isRequirementPlanFilled,
  isStageOverviewFilled,
  isStagePlanFilled,
} from '../../src/core/plan/filled.js';

/** 仓库根（本文件位于 `test/fixtures/`；不使用被测代码的 CWD） */
const REPO_ROOT = process.cwd();

describe('共享夹具工厂（test/fixtures/requirement-input.js）', () => {
  it('需求正文产物直接过写实判据（isRequirementBodyFilled）', () => {
    for (const [id, title] of [['REQ-001', '写实需求'], ['REQ-099', '带编号的需求']] as const) {
      const body = makeFilledRequirement(id, title);
      expect(isRequirementBodyFilled(body)).toBe(true);
      expect(body).toContain(`# ${id}：${title}`);
      expect(body).toContain('## 摘要');
      expect(body).toContain('## 目标与验收');
    }
    // 缺参缺省也可用（最小调用形态）
    expect(isRequirementBodyFilled(makeFilledRequirement())).toBe(true);
  });

  it('需求级计划产物直接过写实判据（isRequirementPlanFilled）', () => {
    const plan = makeRequirementPlan('REQ-001', '写实需求');
    expect(isRequirementPlanFilled(plan)).toBe(true);
    for (const name of ['目标', '任务拆解', '验收判据', '偏差与回写']) {
      expect(plan).toContain(`## ${name}`);
    }
    expect(isRequirementPlanFilled(makeRequirementPlan())).toBe(true);
  });

  it('阶段 plan / overview 产物直接过写实判据（isStagePlanFilled / isStageOverviewFilled）', () => {
    expect(isStagePlanFilled(makeStagePlan('stage-133'))).toBe(true);
    expect(isStagePlanFilled(makeStagePlan())).toBe(true);
    expect(isStageOverviewFilled(makeOverview())).toBe(true);
    expect(makeOverview()).toContain('## 操作方案');
  });

  it('字段口径唯一：makeFilledBodyInput 的三字段与正文常量逐字一致', () => {
    const input = makeFilledBodyInput();
    expect(input).toEqual({
      summary: FILLED_SUMMARY_TEXT,
      goal: FILLED_GOAL_TEXT,
      acceptance: FILLED_ACCEPTANCE_TEXT,
    });
    // 正文由同一份三字段拼出（不另写第二份字符串）
    const body = makeFilledRequirement('REQ-001', '写实需求');
    expect(body).toContain(FILLED_SUMMARY_TEXT);
    expect(body).toContain(FILLED_GOAL_TEXT);
    expect(body).toContain(FILLED_ACCEPTANCE_TEXT);
  });

  it('两栈同一导出：requirements.ts 的再导出与直接 import 是同一函数引用', () => {
    expect(makeFilledRequirement).toBe(direct.makeFilledRequirement);
    expect(makeRequirementPlan).toBe(direct.makeRequirementPlan);
    expect(makeStagePlan).toBe(direct.makeStagePlan);
    expect(makeOverview).toBe(direct.makeOverview);
    expect(makeFilledBodyInput).toBe(direct.makeFilledBodyInput);
  });

  it('dsh/test/verify.js 真正 import 共享 helper（不是注释声明）', () => {
    const verifySource = readFileSync(join(REPO_ROOT, 'dsh', 'test', 'verify.js'), 'utf-8');
    // 真实的 import 语句（去注释后仍命中）；`from` 说明符指向共享 helper
    expect(verifySource).toMatch(
      /^import\s*\{[^}]*makeFilled(?:BodyInput|Requirement)[^}]*\}\s*from\s*'\.\.\/\.\.\/test\/fixtures\/requirement-input\.js';$/m,
    );
    // 且真的用它构造参数（消费点在同一文件内）
    expect(verifySource).toMatch(/makeFilledBodyInput\s*\(/);
  });
});
