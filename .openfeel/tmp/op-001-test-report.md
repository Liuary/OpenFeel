# 自测报告 — op-001

- **执行时间**：2026-09-25 20:10
- **执行 Agent**：openfeel-executor
- **重试次数**：1（首轮 migrate 测试 6 项失败，修正 3 处实现缺陷后全绿）

## 执行摘要

落地 `openfeel migrate` 命令：检测/备份/迁移/回滚 + `--dry-run` + `--remap-assignee`；新增 migrate 核心模块与命令层、i18n migrate 域、legacy fixture 与测试。共 18 项 migrate 用例全绿。

## 实施步骤完成情况

- [x] 步骤 1：抽取 `deployGlobalAsset`（REV-1205）+ `ManagedAction` 改 export；build.js L240 生成模板改 `export const SKILL_DEFINITIONS`（REV-1308）并 `npm run build` 重生成
- [x] 步骤 2/3：新建 `src/core/migrate.ts`（detectLegacy/listLegacyFiles/backupLegacy/splitUpdateState/remapAssignees/cleanProjectJsonc/cleanOldBackups/migrateProject/rollbackMigration/previewRollback）
- [x] 步骤 4：新建 `src/commands/migrate.ts`（migrate + rollback 子命令）
- [x] 步骤 5：`src/cli/index.ts` 注册；`src/core/i18n.ts` + `zh-CN.ts`/`en.ts` 新增 migrate 域与 help 键
- [x] 步骤 6：`test/fixtures/legacy-project/**` + `test/core/migrate.test.ts`（18 用例）+ `test/commands/migrate.test.ts`（3 用例）

## 自测清单验证

| 检查项 | 结果 | 备注 |
|--------|:--:|------|
| detectLegacy 五判据触发与组合；无 legacy 返回 false | ✅ | 含「仅项目自定义→false」用例 |
| listLegacyFiles：custom-agent.md 归 custom（REV-007） | ✅ | skill 旧名归一化后比对 |
| --dry-run 不写盘：前后快照一致 | ✅ | 项目+全局快照比对 |
| 执行后 framework 清理、custom 保留、jsonc 非法字段清理+用户字段保留 | ✅ | |
| state 拆分重键：planner→全局 openfeel-planner；AGENTS.md 保留 | ✅ | |
| skill 旧名重键：check-kb→openfeel-check-kb（REV-1303） | ✅ | |
| remapAssignees 用 Object.values 不抛 TypeError（REV-1301） | ✅ | |
| rollback 仅删 manifest.globalStateKeys（REV-1302） | ✅ | |
| cleanProjectJsonc 保留合法 {paths,urls}（REV-1305） | ✅ | |
| 全局 jsonc parse 失败降级保留原文件（REV-1306） | ✅ | |
| dry-run + --remap-assignee 时 assigneeReport 非空（REV-1307） | ✅ | |
| rollback --dry-run 输出 entries 预览（REV-1309） | ✅ | CLI 实测通过 |
| build 后 SKILL_DEFINITIONS 为 export const（REV-1308） | ✅ | |
| 幂等：二次 migrate「已是最新布局」（REV-1204①） | ✅ | 全 fixture（含 custom）通过 |
| --remap-assignee 改写 flow.json；不带 flag 不改写 | ✅ | |
| rollback 恢复执行前状态（文件+jsonc+state+flow.json） | ✅ | |
| 回滚不还原全局文件，仅还原全局 state 新增条目 | ✅ | |
| --remap-assignee 时 flow.json 入 manifest，rollback 还原 assignee | ✅ | |
| 备份清理保留最近 5 次（REV-1206） | ✅ | |
| 测试隔离 HOME（REV-1204③） | ✅ | vi.mock node:os |
| i18n migrate 域与 flow.migrate 区分；help 首行标注 | ✅ | |
| openfeel update 全量回归（deployGlobalAsset 等价，REV-1205） | ✅ | 全量 569 测试绿 |
| npm run build && npm test 全绿 | ✅ | |

## 产出文件

- `src/core/migrate.ts`（新增）、`src/commands/migrate.ts`（新增）
- `src/cli/index.ts`、`src/core/i18n.ts`、`src/core/i18n-data/{zh-CN,en}.ts`、`src/core/update.ts`、`build.js`（修改）
- `test/fixtures/legacy-project/**`、`test/core/migrate.test.ts`、`test/commands/migrate.test.ts`（新增）

## 前置校验结果

- 方案完整性：通过（6 必填字段齐备）
- Phase 合法性：通过（stage-39 phase=exec_running；注：`pipeline.phase=active` 为全局标记，`current.op=""`，Feel 已明确指示执行 4 个 op）
- 流转合法性：通过（`openfeel flow health --quick` 正常退出）

## 偏差记录

> 本 op 无「跳步」违规。

1. **detectLegacy ①/② 改为框架同源判定**：方案 M3 代码为「存在即 legacy」（任意 `.md` / 目录存在），但会与 REV-1204① 冲突——fixture 含 `custom-agent.md`（项目自定义，迁移后保留），二次迁移将恒为 `isLegacy=true`，无法输出「已是最新布局」。按 REV-007 框架同源判定修正（仅框架同源旧资产计为 legacy），幂等用例（REV-1204①）得以在完整 fixture 上通过。
2. **migrate 清理新增空父目录清理**：方案仅清理顶层 `.opencode/{agents,skills,instructions}`；删除框架 skill 后残留空 `skills/{name}/` 子目录导致判据② 恒真。新增「删除框架文件后清理空父目录」。
3. **listLegacyFiles skill 名归一化**：方案直接以目录名比对新 skill 名集合，旧无前缀 `check-kb` 会被误归 custom。改用 `remapSkillName` 归一化后比对（REV-1303）。
4. **rollback `--dry-run` 回退读取父命令 opts**：commander 在「可选位置参数 + 子命令」结构下把 `--dry-run` 挂到父 `migrate` 命令，rollback 自身 opts 为空致 dry-run 失效；修复为读取 `command.parent.opts().dryRun`。
5. **fixture `update_state.json` 补充 skill/core 旧 key**：方案仅列 planner+AGENTS.md，skill 重键验证需 skill 旧 key，补充。
6. **i18n 新增 `help.migrate.rollback.dryRun` 键**：`applyHelpI18n` 会为 rollback 子命令的 `--dry-run` 生成该键，缺失产生运行时告警，补充双语键。

## 遗留问题

- 无（op-004 已完成 REV-1304 统一收口）。
