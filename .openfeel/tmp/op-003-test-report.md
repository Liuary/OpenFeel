# 自测报告 — op-003（skill 重命名 + /opfx: 类型化统一）

- **执行时间**：2026-09-25 14:11
- **执行 Agent**：Executor
- **重试次数**：1

## 执行摘要
14 个 skill 目录加 `openfeel-` 前缀并同步 frontmatter `name:`；`NEW_SKILL_NAMES` 等同步；feel.md `/opfx:` 表按类型改写；源码注释 `/opfx:` 清零；根 opencode.jsonc skills 块补齐为 14 条；`npm run build` 通过。

## 实施步骤完成情况
- [x] 步骤 1：`git mv` 14 skill 目录 + frontmatter `name:` 同步 + SKILL.md 行尾归一 LF
- [x] 步骤 2：`NEW_SKILL_NAMES` 8 项加前缀；`update.ts` L60/L1377 注释改 `openfeel-*`；`buildUpdatedJsonc`/`getIncomingContent` 逻辑无需改（`name` 前缀自动传递）
- [x] 步骤 3：feel.md（zh-CN+en）技能表改写为「类型 | 引用 | 用途」三列（CLI/agent/skill/流程阶段），补 status→`openfeel flow overview`，废除 `/opfx:`；L40 utility、L174 flow 改写
- [x] 步骤 4：源码注释 `/opfx:` 清理（flow.ts L14/158/161、i18n zh-CN L446/en L424）
- [x] 步骤 5：skill 名引用同步（instructions 的 `check-kb`/`get-bugs`/`get-stage-status`、`skill(...)`、`load skill ...`）；根 `opencode.jsonc` skills 块手动更新为 **14 条**带前缀路径

## 自测清单验证
| 检查项 | 结果 | 备注 |
|--------|:--:|------|
| listOpencodeSkillNames 返回 14 项带前缀 | ✅ | 新增测试断言 |
| 14 个 SKILL.md frontmatter name 加前缀 | ✅ | 逐一核对 |
| NEW_SKILL_NAMES 8 项带前缀；skills 路径带前缀 | ✅ | |
| 源码+模板源 `/opfx:` 清零 | ✅ | `rg /opfx: src/` = 0 |
| `/opfx:status` 已改 `openfeel flow overview` | ✅ | flow.ts L14/158/161、i18n |
| CLI 子命令未被误改 | ✅ | `openfeel flow recover`/`health`/`roadmap`/`wizard` 未动 |
| roadmap 在 feel.md 双列引用（CLI + skill） | ✅ | |
| npm run build 通过，skills 键带前缀 | ✅ | |

## 产出文件
- `src/core/templates-data/opencode/skills/`（14 重命名 + frontmatter）
- `src/core/update.ts`、`src/core/templates-data/opencode/agents/{zh-CN,en}/feel.md`
- `opencode/instructions/{zh-CN,en}.md`、根 `AGENTS.md`
- `src/commands/flow.ts`、`src/core/i18n-data/{zh-CN,en}.ts`
- 根 `opencode.jsonc`（skills 块 14 条）

## 前置校验结果
- 方案完整性：通过
- Phase 合法性：通过（附 phase 偏差说明）
- 流转合法性：通过

## 偏差记录
- **跳步违规**：无
- **步骤 5 补漏**：首轮 skill 名 grep 遗漏了模板内联引用（ADAPTER 列表、`# Skill:` 标题、check-kb/search-kb/planner/schemer 的 `skill("...")` 提及）。补做一轮全量同步：13 个模板文件更新；ADAPTER 列表 14 名全前缀；`health/recover/roadmap/wizard` 仅在 ADAPTER 列表内作为 skill 名前缀（其余 `openfeel flow health`、`roadmap/{version}.md` 等 CLI/计划特性保持不变）。
- 根版 skills 块按 REV-401 从 9 条补齐至 14 条（对齐模板版，方案已裁定）
- `templates-data/opencode/opencode.jsonc` skills 块由 `SKILLS_PLACEHOLDER` 自动生成，未手改（符合方案）
- 未改动 `.opencode/skills/*`（op-004 重生成）
