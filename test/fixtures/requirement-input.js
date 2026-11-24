/**
 * 共享夹具工厂（**字段口径唯一实现**）— v1.6.1 / REQ-065 A65.1
 *
 * 为什么是 `.js` 而不是 `.ts`：本文件要被**两个栈**同时 import——
 * - CLI 测试（vitest，`test/fixtures/requirements.ts` 只做类型化再导出）；
 * - DSH 适配器验证（`dsh/test/verify.js`，纯 ESM、零依赖、`node test/verify.js` 直跑）。
 * 因此本文件必须是**纯 ESM、零依赖、无 TS 语法**，两条栈读到的字符串才逐字相等
 * （`dsh` 发布物 `files` 不含 `test/`，测试期只读依赖不影响发版）。
 *
 * 判据纪律：本文件只拼「已知能过门」的最小结构，**不复制任何判据**
 * （占位字面量 / 字数阈值 / 判据行前缀全部仍在 `src/core/plan/filled.ts`）。
 * 修改口径只允许发生在这里：`test/fixtures/requirements.ts` 与 `dsh/test/verify.js`
 * 都是它的消费者，不各拼一份常量。
 */

/**
 * 写实摘要（`## 摘要` 正文；非空白字符数远超 `MIN_FILLED_CHARS = 40`）。
 * @type {string}
 */
export const FILLED_SUMMARY_TEXT =
  '把「写实需求 + 需求级计划」固化成一份零依赖的共享测试夹具工厂，让 CLI 测试与 DSH 适配器验证共用同一份字段口径，避免每加一道门禁就各自重写一份夹具。';

/**
 * 写实目标（`## 目标与验收` 的 `### 目标` 子节）。
 * @type {string}
 */
export const FILLED_GOAL_TEXT =
  '同一份工厂同时产出需求正文、需求级计划与阶段文档，产物必须直接通过 filled.ts 的写实判据；任何字段口径的修改只允许发生在本文件。';

/**
 * 写实验收（`## 目标与验收` 的 `### 验收` 子节；至少一条 `- ` 判据行）。
 * @type {string}
 */
export const FILLED_ACCEPTANCE_TEXT = [
  '- A1：`isRequirementBodyFilled(makeFilledRequirement(id, title)) === true`。',
  '- A2：`isRequirementPlanFilled(makeRequirementPlan(id, title)) === true`。',
  '- A3：`isStagePlanFilled(makeStagePlan(stage)) === true` 且 `isStageOverviewFilled(makeOverview()) === true`。',
  '- A4：CLI 测试与 `dsh/test/verify.js` 复用同一份导出（不是各拼一份常量）。',
].join('\n');

/**
 * 需求正文三小节字段（与 `req add --summary/--goal/--acceptance` 同口径）。
 * 适配器侧用它构造 `req add` 参数，测试侧用它拼整份正文——同一份常量，两个消费方。
 *
 * @returns {{ summary: string, goal: string, acceptance: string }}
 */
export function makeFilledBodyInput() {
  return {
    summary: FILLED_SUMMARY_TEXT,
    goal: FILLED_GOAL_TEXT,
    acceptance: FILLED_ACCEPTANCE_TEXT,
  };
}

/**
 * 写实需求正文（满足 `isRequirementBodyFilled`）。
 *
 * @param {string} [id] 需求 ID（缺省 `REQ-001`）
 * @param {string} [title] 需求标题（缺省 `写实需求`）
 * @returns {string} 完整 Markdown 正文（含 `## 摘要` / `## 目标与验收` / `## 变更记录`）
 */
export function makeFilledRequirement(id = 'REQ-001', title = '写实需求') {
  const { summary, goal, acceptance } = makeFilledBodyInput();
  return [
    `# ${id}：${title}`,
    '',
    '## 摘要',
    '',
    summary,
    '',
    '## 目标与验收',
    '',
    '### 目标',
    '',
    goal,
    '',
    '### 验收',
    '',
    acceptance,
    '',
    '## 变更记录',
    '',
    '- 2026-01-01 创建（test/fixtures/requirement-input.js）',
    '',
  ].join('\n');
}

/**
 * 写实需求级计划（满足 `isRequirementPlanFilled`：`## 目标` / `## 任务拆解` / `## 验收判据` 三节）。
 *
 * @param {string} [id] 需求 ID（缺省 `REQ-001`）
 * @param {string} [title] 需求标题（缺省 `写实需求`）
 * @returns {string} 完整 Markdown 计划（含 `## 偏差与回写` / `## 变更记录`）
 */
export function makeRequirementPlan(id = 'REQ-001', title = '写实需求') {
  return [
    `# ${id} 计划：${title}`,
    '',
    '## 目标',
    '',
    '让需求正文、需求级计划与阶段文档的测试夹具只有一个来源，判据仍由 filled.ts 单点判定，避免门禁每加一道就重写一份夹具。',
    '',
    '## 任务拆解',
    '',
    '- [ ] 在 test/fixtures/requirement-input.js 固化字段口径。',
    '- [ ] 让 CLI 测试与 dsh/test/verify.js 同时 import 同一份导出。',
    '- [ ] 用 filled.ts 的判据断言产物直接可过门。',
    '',
    '## 验收判据',
    '',
    'isRequirementPlanFilled 返回 true；三节内容均由本文件派生，测试与适配器两侧读到的字符串逐字相等。',
    '',
    '## 偏差与回写',
    '',
    '- 无实际偏差时本节保持空模板（格式见需求级计划约定）。',
    '',
    '## 变更记录',
    '',
    '- 2026-01-01 创建（test/fixtures/requirement-input.js）',
    '',
  ].join('\n');
}

/**
 * 写实阶段计划（满足 `isStagePlanFilled`：标题行以外的非空白字符数 ≥ 2 × 40）。
 *
 * @param {string} [stage] 阶段 ID（缺省 `stage-001`；只用于标题，不参与判据）
 * @returns {string} 阶段 `plan.md` 内容
 */
export function makeStagePlan(stage = 'stage-001') {
  return [
    `# 阶段计划（${stage}）`,
    '',
    '## 一、目标',
    '',
    '把这一阶段要交付的东西写成可执行、可验收的句子，让执行者不需要猜，也让审查者能只凭本文件复现判据与证据。',
    '',
    '## 二、拆解',
    '',
    '先落共享夹具，再让两个栈同时 import 同一份导出，最后用单测与命令行各跑一遍取证，任何口径变更都只允许发生在夹具文件本身。',
    '',
  ].join('\n');
}

/**
 * 写实阶段 overview（满足 `isStageOverviewFilled`：`## 目标` + `## 操作方案`）。
 *
 * @returns {string} 阶段 `overview.md` 内容
 */
export function makeOverview() {
  return [
    '## 目标',
    '',
    '让阶段文档的测试夹具与需求级夹具同源，判据仍由 filled.ts 单点给出，避免第二套占位规则在测试里漂移。',
    '',
    '## 操作方案',
    '',
    '先在共享工厂里定义写实段落的措辞，再由单测与 lint 用例分别断言：产物写实、空壳不写实，两条口径互不复制。',
    '',
  ].join('\n');
}
