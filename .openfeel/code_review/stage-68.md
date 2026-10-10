# 代码审查摘要 — v1.1.6-stage-68

> 审查人：openfeel-reviewer（GLM，异种交叉审查）｜ 2026-10-10 23:58 ｜ commits：`89978e7`（op-001 skill 源迁移 + build 读点/校验/断言重指）/ `966bd4b`（op-002 迁移不变量测试 + 全门禁 + 阶段报告）；基线 `2799266..HEAD`
> 结论：**passed（通过；0 blocking，2 REV 均 low 非阻塞 open）** ｜ 详细报告：私域 `.openfeel/users/Liuary/code_review/REV-stage-68.md`

## 核心结论

- **代码审查（review_pending）**：快速通道**失效**（产出文件 21 个 ≥ 5）→ 完整 5 维度审查，**7 项审查重点全过**——① **零内容变更**：`git diff 2799266..HEAD -M --numstat -- src/core/templates-data/` **17 个 SKILL.md 全部 `0 0`**（`{opencode => }/skills/<name>/SKILL.md` 纯重命名，内容列零增删）；两提交无夹带；② **双注入对象不合并**：`SKILL_DEFINITIONS`（`update.ts`）与 `OPENCODE_SKILL_DEFINITIONS`（`template-loader.ts`）锚点/对象名不变，build 步骤 4（读 `SKILLS_DIR`）与步骤 6（读共享源）仍为两条独立注入链路，**仅数据源改共享**；③ **读点穷举**：`src/`、`test/` 下 `templates-data/opencode/skills` 直读清零；命中均合法残留（`.opencode/skills` 目标项目语义、`build.js:1030-1031` 防复活断言本身、`templates-migration.test.ts` 阴性断言）；测试路径 5 处同步逐行核对；④ **死常量处置**：`rg "TEMPLATE_OPENCODE_SKILLS_DIR"` 全仓 **0 命中**（已按 op-001 决策改名 `TEMPLATE_SHARED_SKILLS_DIR`，`SKILLS_DIR = TEMPLATE_SHARED_SKILLS_DIR`）；⑤ **冗余树断言（含实测触发）**：`build.js:1030-1031` 扩为「`templates-data/agents` / `core-instructions` / `opencode/skills` 任一存在即失败」，文案提示已迁共享源；**实测**临时复活旧树 → `npm run build` EXIT=1，删除后复通过；未误伤 `templates-data/opencode/`（仅剩 `agents` + `ADAPTER.{en,zh-CN}.md`）；⑥ **测试真实性**：`test/core/templates-migration.test.ts` 4 用例均真实不变量断言（非空跑；T4.4 行尾归一化两侧对称应用，无假通过风险），与 op-002 方案逐字一致；⑦ **边界**：除 17 个 0/0 纯重命名外**无其他 src 改动**，无 skill 正文改写、无 Claude 锚点、无生成段手改（build 幂等佐证）；`package.json`/`package-lock.json`/`.github/`/`vitest.config.ts`/`tsconfig.json` 相对基线零 diff；`--version`=1.1.5（未改版本）。
- **门禁独立复跑**：`npm run build` ×2 **no drift（幂等）**；`npm test` **65 文件 / 1139 用例全绿，0 skipped / 0 failed**；`npx tsc --noEmit` EXIT=0；`lint i18n` **761**；`lint kb` 0 过期（343 引用）；防复活 `Test-Path src/core/templates-data/opencode/skills` = False、`Test-Path .opencode/agents` = False；冗余树断言触发测试实测通过。
- **测试官验收**：**通过（5/5，0 Bug）**。

## REV 登记（全部 low 非阻塞 open）

| 条目 | 阶段 | 优先级 | 状态 | 说明 |
|------|------|--------|------|------|
| REV-68-001 | review_pending | low（非阻塞） | open | `test/core/templates-migration.test.ts:41-42` 的 `expect(fromLoader.length).toBe(17)` 在 `toEqual(fromLoader)` 成立后逻辑冗余（非缺陷：显式断言使失败信息更精确，且与 op-002 方案逐字一致——**实现忠实于方案，方案本身有意为之**）。仅作精简空间记录，**保留现状亦可接受**。 |
| REV-68-002 | review_pending | low（非阻塞） | open | 审查时工作区有 6 个非 untracked 修改（`flow.json`/`flow.json.bak`/`plan/index.md`/`plan_log.md`/`tmp/op-001-test-report.md`/`docs/index.md`），经核实均非源码越界（流水线 CLI 自动推进 + v1.1.6 立项文档索引行）。**提交卫生提醒**：源码提交与流水线/文档状态文件须**分离**，避免归因噪音（本阶段归档已按此执行）。 |

> 两条均 `blocking=false`，无功能缺陷 / 数据丢失 / 流水线阻塞 / 测试破坏；**不阻塞归档与流水线推进**，登记为 open 边界留待后续版本顺手处理（REV-68-002 已在本阶段归档中落地执行）。

## 经验与建议

- **零内容变更的「迁移」类改造**：`git mv`（非复制改写）保留历史 + `numstat 内容列 0/0` 归因 + 生成侧「注入内容 ≡ 共享源逐字节」断言（行尾归一化口径与 build 注入一致）+ build ×2 幂等——四证合围，任何一证失败即暴露「迁移中文本被意外改写」。
- **防复活断言必须扩展覆盖被迁走的旧路径**：单源架构的冗余树断言原只查 `agents`/`core-instructions`；本次迁移后若仅重指读点而不扩展断言，旧树（`opencode/skills`）可静默复活。**断言扩展 + 实测触发验证**（临时复活 → build EXIT=1）是闭环关键。
- **死常量随迁移清理**：改向后不再被消费的源目录常量（`TEMPLATE_OPENCODE_SKILLS_DIR`）应删除并改名（`TEMPLATE_SHARED_SKILLS_DIR`），避免「指向不存在目录的死常量」残留；须先穷举全部消费点再改。
- **读点穷举先于改动**：计划只列 `templates.test.ts:11`，源码核验额外发现 `template-loader.test.ts:189/397/403/404` 4 处旧路径直读——「以源码为准」避免迁移后用例假失败。

## 归档收口（openfeel-archiver，2026-10-10）

- **`openfeel archive v1.1.6-stage-68` 已执行**（摘要落 `.openfeel/log/archive-v1.1.6-stage-68.md`；注：因 flow.json 该阶段 `ops` 未注册，摘要显示操作数 0 / 审查 0，实际 2 op + 2 REV 见私域）。
- **REV**：REV-68-001（T4.2 键数断言逻辑冗余）/ REV-68-002（提交卫生提醒）维持 **open**（全 low 非阻塞，审查结论 passed）；REV-68-002 的「分离归档提交与源码提交」要求已在本阶段归档中执行。
- **KB**：`architecture.md` 更新 `#模板单源架构`（追加更新块：skill 权威源迁中立共享源）；`patterns.md` 更新 `#零行为变更改造的验证方法`（追加「零内容变更（内容逐字节不变）」变体）；去重最高 4.5% / 3.2% ≪ 80%，按「同一架构/方法论条目的追加式更新」处理；同步 `kb/index.md`（概览、摘要表、最近更新）。
- **manual 复核**：`manual/core/build.md`（源路径：skills 迁共享源 + 冗余树断言扩展 + 变更历史）、`manual/core/template-loader.md`（单源架构 skill 来源改共享源 + 变更历史）、`manual/index.md`（Skill 体系权威源路径改 `templates-data/skills/`）三载体同步。
- **未推进 flow 至 done（由 Feel 执行）／未 push／未 `npm publish`／未直写 `flow.json`**。
