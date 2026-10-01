# 自测报告 — op-009

- **执行时间**：2026-10-01 09:39
- **执行 Agent**：openfeel-executor
- **重试次数**：1

## 执行摘要
A4 破坏性变更落地：`view add` 命令 + 7 键×2 语言 + 文档/README/manual/模板/测试全量清理；CHANGELOG `Removed` + 迁移指引；`view list`/`accept` 保留可用。

## 实施步骤完成情况
- [x] A4-1 删除 `view add` 命令段（`view.ts`）；import 改 `{ listReviews, acceptReview }`；`normalizeAgentName` 保留
- [x] A4-2 i18n 删 7 键×2 语言（`view.add.deprecated`/`errorInvalidPriorityTmpl`/`okTmpl`/`help.view.add`/`.op`/`.title`/`.priority`）
- [x] A4-3 文档清理：`docs/commands.md` 删节；`manual/cli/commands.md:73` 删条目 + `:89` 改「已移除」；`manual/index.md` 同步；README×2 改 `list / accept`
- [x] A4-4 CHANGELOG `### Removed` 显著标注 + 迁移指引（`flow review add`）
- [x] A4-5 测试：`view.test.ts` 重写为 list/accept 覆盖；`cli/index.test.ts` 删 N2-4 用例
- [x] A4-6 残留核验（见下）
- [x] 附加：`flow.ts` 两处 `view.add.errorInvalidPriorityTmpl` → 新键 `flow.review.errorInvalidPriorityTmpl`（否则删键会破坏 `flow review add|update`）
- [x] 附加：cli-usage skill 模板行去 `view add` + `npm run build` 重生成（`template-loader.ts`/`update.ts`/`.opencode` 自举）

## 键数变化
- 基线 **718** → 删 7 键 + 迁移新增 1 键（`flow.review.errorInvalidPriorityTmpl`）→ **712 键**，problems = 0，退出码 0。
- 说明：op-009 方案基于旧基线 649→642（−7）；本次因主链新增键基线为 718，且需保留 `flow review` 的优先级错误文案（原键名带 `view.add.` 前缀被删），故净变化 −6 → **712**。

## 残留核验（精确模式）
| # | 检查 | 结果 |
|---|------|------|
| 1 | `rg --pcre2 "(?<!re)view\.add" src/ test/` | **零命中** |
| 2 | `rg --pcre2 "(?<!re)view add\|'view',\s*'add'" src/ test/` | **零命中** |
| 3 | `rg --pcre2 "(?<!re)view add" docs/ README*.md .openfeel/manual/` | **零命中** |
| 4 | `addReviewEntry` | 定义 1（`entry.ts`）+ 使用 1（`flow.ts`），单点未破坏 |
| 5 | CLI `view add --op x` | `error: unknown command 'add'`，退出码 1 |
| 6 | CLI `view --help` | 仅 `list`/`accept` + `help.view.note`，无 `add` |

> **方案验收口径校正（重要）**：方案 A4-6/§七 的 `rg "view.add"` / `rg "view add"` 会被合法串 **`flow.review.add*`／`flow review add`** 误命中（子串 "view.add"/"view add"）。故本报告采用负向后顾 `(?<!re)` 精确口径，结果为**零命中**；字面口径永远无法为零（除非删除 `flow review add`）。

## 自测清单验证
| 检查项 | 结果 | 备注 |
|--------|:--:|------|
| 命令段删除；import 仅移除未用符号 | ✅ | normalizeAgentName 保留 |
| list/accept/view 组/help.view.note 保留可用 | ✅ | 用例覆盖 |
| 7 键×2 成对删除；lint i18n 0 且退出码 0 | ✅ | 712 键 |
| docs/manual/README 清理 | ✅ | 精确零残留 |
| CHANGELOG Removed + 迁移指引 | ✅ | 见 CHANGELOG [1.1.2] |
| 测试删除/重写；flow review add 等价覆盖 | ✅ | flow.test 既有用例 |
| build + test 全绿 | ✅ | view 5 / cli 3 / flow 56 passed |
| 测试 mkdtemp；config.yaml 零 diff | ✅ | auto/enabled/true |
| 未改真实 flow.json（除 CLI 推进）/pipeline.yaml；无新增依赖 | ✅ | — |

## 产出文件
`src/commands/view.ts`、`src/commands/flow.ts`、`src/core/view/entry.ts`、`src/core/i18n-data/{zh-CN,en}.ts`、`test/commands/view.test.ts`、`test/cli/index.test.ts`、`docs/commands.md`、`.openfeel/manual/cli/commands.md`、`.openfeel/manual/index.md`、`README.zh-CN.md`、`README.en.md`、`CHANGELOG.md`、`src/core/templates-data/opencode/skills/openfeel-cli-usage/SKILL.md`（+ build 产物 `template-loader.ts`/`update.ts`/`.opencode/**`）

## 前置校验结果
- 方案完整性：通过
- Phase 合法性：通过
- 流转合法性：通过

## 偏差记录
- **范围扩展（必要）**：`flow.ts` 复用了 `view.add.errorInvalidPriorityTmpl`（2 处），删键会破坏 `flow review add|update` → 迁移为 `flow.review.errorInvalidPriorityTmpl`（新增 1 键）。
- **验收口径校正**：`rg "view.add"`/`rg "view add"` 与 `flow.review.add*`/`flow review add` 子串冲突，改用 `(?<!re)` 精确口径（零命中）。
- 附加清理 `cli-usage` skill 模板中的 `view add`（方案 §八 未列，但属 src/ 残留核验所需）+ build 重生成。
