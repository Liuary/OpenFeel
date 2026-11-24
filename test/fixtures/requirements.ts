/**
 * 共享夹具工厂的类型化再导出（TS 栈入口）— v1.6.1 / REQ-065 A65.1
 *
 * **实现单点在 `./requirement-input.js`**（纯 ESM、零依赖，同时被
 * `dsh/test/verify.js` 直接 import）。本文件只补类型，不复制任何字段常量：
 * 若这里另拼一份字符串，「两栈共用同一份口径」即刻退化回注释声明。
 */
export {
  FILLED_ACCEPTANCE_TEXT,
  FILLED_GOAL_TEXT,
  FILLED_SUMMARY_TEXT,
  makeFilledBodyInput,
  makeFilledRequirement,
  makeOverview,
  makeRequirementPlan,
  makeStagePlan,
} from './requirement-input.js';

/** `req add --summary/--goal/--acceptance` 三字段（与 `makeFilledBodyInput()` 同形） */
export interface FilledBodyInput {
  summary: string;
  goal: string;
  acceptance: string;
}
