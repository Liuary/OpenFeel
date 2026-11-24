# test/fixtures — 共享夹具工厂

> v1.6.1 / REQ-065 A65.1。**口径单点在 `requirement-input.js`**，任何字段措辞/结构变更只允许改那里。

## 为什么是 `.js`

`requirement-input.js` 同时被**两个栈** import：

| 消费方 | 入口 | 说明 |
|---|---|---|
| CLI 测试（vitest） | `test/fixtures/requirements.ts` | 只做类型化再导出（`export … from './requirement-input.js'`） |
| DSH 适配器验证 | `dsh/test/verify.js` | `import { makeFilledBodyInput } from '../../test/fixtures/requirement-input.js'` |

因此实现文件必须是**纯 ESM、零依赖、无 TS 语法**：`dsh/package.json` 与根 `package.json` 都是
`"type": "module"`，`node dsh/test/verify.js` 直跑不需要任何编译步骤；`dsh` 发布物 `files`
不含 `test/`，测试期只读依赖不影响发版。

## 导出（判据仍单点在 `src/core/plan/filled.ts`）

| 导出 | 产物 | 满足的判据 |
|---|---|---|
| `makeFilledRequirement(id, title)` | 需求正文 Markdown | `isRequirementBodyFilled` |
| `makeRequirementPlan(id, title)` | 需求级计划 Markdown | `isRequirementPlanFilled` |
| `makeStagePlan(stage)` | 阶段 `plan.md` | `isStagePlanFilled` |
| `makeOverview()` | 阶段 `overview.md` | `isStageOverviewFilled` |
| `makeFilledBodyInput()` | `{summary, goal, acceptance}` | `req add --summary/--goal/--acceptance` 三字段 |
| `FILLED_SUMMARY_TEXT` / `FILLED_GOAL_TEXT` / `FILLED_ACCEPTANCE_TEXT` | 三个常量 | 断言正文里确实落进了同一段文字 |

工厂**不复制判据**：占位字面量、`MIN_FILLED_CHARS`、判据行前缀仍只在 `src/core/plan/filled.ts`；
这里只拼「已知能过门」的最小结构。`test/fixtures/factories.test.ts` 直接调判据函数断言，
并校验 `requirements.ts` 与直接 import `requirement-input.js` 是**同一函数引用**、
`dsh/test/verify.js` 确实带 `from '../../test/fixtures/requirement-input.js'` 的 import 语句。

## 负例

空壳样本（`（待补充）` 骨架、空 overview 等）留在各自测试文件里、不进化成工厂导出：
工厂若同时产「写实」与「空壳」，消费方很容易在门禁用例里误用空壳样本而假绿。
