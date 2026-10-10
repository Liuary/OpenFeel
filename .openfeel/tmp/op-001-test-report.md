# 自测报告 — op-001

- **执行时间**：2026-10-10
- **执行 Agent**：openfeel-executor
- **重试次数**：第 1 次
- **commit sha**：`89978e73663b3b5b87c5a3dfd20a3537f3bf7ac7`（`89978e7`）

## 执行摘要
17 个 skill 权威源由 `templates-data/opencode/skills/` 经 `git mv` 迁至中立共享源 `templates-data/skills/`（逐字节不变）；`build.js` 常量/读点/校验/冗余树断言全部重指共享源；两测试文件 5 处旧路径同步。全部 12 项自测通过，`npm run build` 成功且幂等。

## 实施步骤完成情况
- [x] T1.1 `git mv src/core/templates-data/opencode/skills src/core/templates-data/skills`（EXIT=0）
- [x] T1.2 迁移完整：共享源 17 目录；旧树 `Test-Path=False`；`git status` 显示纯 `R`（17 行）
- [x] T1.3 `templates-data/opencode/` 下仅剩 `agents`、`ADAPTER.en.md`、`ADAPTER.zh-CN.md`
- [x] T1.4 `git diff --cached --numstat --find-renames`：17 行内容列均 `0|0`（纯重命名）
- [x] T2.1 常量块重指：删除 `TEMPLATE_OPENCODE_SKILLS_DIR`，新增 `TEMPLATE_SHARED_SKILLS_DIR`，`SKILLS_DIR = TEMPLATE_SHARED_SKILLS_DIR`
- [x] T2.2 步骤 6 `generateOpencodeSkillTemplates` 4 处改指共享源（`:258` 注释、`:264/265`、`:269`、`:275`）
- [x] T2.3 `validateOpencodeSkillDefinitions` 3 处改指共享源（`:825/826/828`）
- [x] T2.4 穷举校验：`TEMPLATE_OPENCODE_SKILLS_DIR` 0；`SKILLS_DIR = TEMPLATE_SHARED_SKILLS_DIR` 1 处
- [x] T3.1 冗余树断言扩展：`validateSingleSourceConsistency` 加 `resolve(TEMPLATES_DATA_DIR,'opencode','skills')`，文案显式提示迁共享源
- [x] T2.5 `test/core/templates.test.ts:11` 改指共享源
- [x] T2.6 `test/core/template-loader.test.ts` 4 处（`:189/:397/:403/:404`）改指共享源
- [x] T2.7 全仓核验：`src/` 与 `test/` 下旧路径 0 命中

## 自测清单验证
| 检查项 | 结果 | 备注 |
|--------|:--:|------|
| S1 迁移完整（17 目录、旧树不存在） | ✅ | 17/17；`Test-Path=False` |
| S2 纯重命名（内容列 0） | ✅ | 17 行 `0|0` |
| S3 无 `TEMPLATE_OPENCODE_SKILLS_DIR` 残留 + 赋值 1 处 | ✅ | 0 / 1（`build.js:37`） |
| S4 双注入对象名不变 | ✅ | `update.ts:102`、`template-loader.ts:6508` |
| S5 冗余树断言覆盖 `opencode/skills` | ✅ | `build.js:1028-1029` |
| S6 测试旧路径清零（src/test 0） | ✅ | rg 无命中 |
| S7 `npm run build` 成功 | ✅ | 校验 3/3 + opencode 3/3 + 单源一致性通过 |
| S8 build 幂等 | ✅ | 两次 build 后 `template-loader.ts`/`update.ts` 无漂移 |
| S9 零内容变更（仅 `R`，无 `M`） | ✅ | 17 R，无 M |
| S10 局部测试全绿 | ✅ | Test Files 2 passed / Tests 48 passed |
| S11 `npx tsc --noEmit` = 0 | ✅ | TSC_EXIT=0 |
| S12 `lint i18n` = 761 | ✅ | `✅ 761 键一致`；`--version`=1.1.5 |

## 产出文件
- `src/core/templates-data/skills/**`（新增 17 个 `SKILL.md`，内容逐字节不变）
- `src/core/templates-data/opencode/skills/**`（移除）
- `build.js`（常量重指 + 步骤 6/校验读点 + 冗余树断言扩展）
- `test/core/templates.test.ts`（`:11` 路径同步）
- `test/core/template-loader.test.ts`（`:189/:397/:403/:404` 路径同步）

## 前置校验结果
- 方案完整性：通过（6 必填字段齐备）
- Phase 合法性：通过（stage-68 `exec_running`；`openfeel flow health --quick` EXIT=0）
- 流转合法性：通过（`openfeel flow health --quick` 通过）

## 偏差记录
- **`flow.json` `current.op` 为空**（方案前置校验预期 `op-001`）；Feel 已明确指示执行 op-001/op-002，phase 为合法 `exec_running`，故继续并在自测报告注明。未改 `flow.json`。
- **T2.4 与 T3.1 轻微张力**：T2.4 预期 `rg "templates-data/opencode/skills" build.js`=0，但 T3.1 要求断言文案显式提示该旧路径，故 `build.js:1031` 断言文案中出现 1 处该字符串（非代码读点）。以 T3.1 明文要求为准。
- **`template-loader.test.ts` 4 处额外路径同步**：计划仅列 `templates.test.ts:11`，源码核验发现 `template-loader.test.ts` 另有 4 处旧路径直读，按 op-001 决策表 #1「以源码为准，全部 5 处同步」处理。
