# 当前进度

> OpenFeel v5 全系列 — 已完成 ✅

- **状态**：v0.5.0~v0.5.8 全部归档 ✅ | v5 全系列最终闭环
- **知识库**：architecture(14) + patterns(47) + troubleshooting(10) + setup(4) = 75 条目
- **Agent 数**：9 个
- **Skill 数**：12 个（全量对齐）

## v5 全系列里程碑

| 版本 | 主题 | 核心产出 | 知识沉淀 |
|:--:|------|------|:--:|
| v0.5.0 | 框架级记忆体系 | 全局 profile（~/.config/openfeel/profile.yaml）+ dev_last.md 7 节模板 + CLI config --global | patterns ×2 |
| v0.5.1 | 工具链内化 + 一致性治理 | flow advance --to done 自动 git commit + feel.md 编号修复 + AGENTS.md 四节补齐 | patterns ×3 |
| v0.5.2 | Handoff 原语 + 规范迁移 | Handoff 委派机制（feel.md + 4 Agent）+ 工具规范 dev_core → core.md 迁移 | patterns ×2 |
| v0.5.3 | Checkpoint + 组合条件 | 快照自动保存（list/restore CLI，毫秒时间戳，20上限）+ transitions `\|` 运算符 | patterns ×2 + troubleshooting ×1 |
| v0.5.4 | lint 质量门禁 + CLI-Agent 对齐 | lint i18n（422键）+ lint kb（过期引用）+ 4 新 skill（roadmap/health/recover/wizard） | patterns ×3 + architecture ×1 |
| v0.5.5 | 缺陷修复 | AGENTS.md 部署传播内容哈希比对 + autoCommitOnDone 时序修正（save 前移至 commit 前） | patterns ×1（新增）+ patterns ×1（更新） |
| v0.5.6 | 版本规范 + manual 文档 | AGENTS.md 版本号语义 + .openfeel/manual/ 模块文档系统 + 9 Agent reasoning_effort 分档 | architecture ×1 + patterns ×2 |
| v0.5.7 | 计划目录分组 + thinking 调整 | plan 目录按大版本系列分组（v4/v5）+ reasoning_effort 分档调整（Executor/Vision low→medium） | architecture ×1 + patterns ×1(更新) |
| v0.5.8 | 三项缺陷修复 | mapPhaseToStageStatus 映射修正 + AGENTS.md 模板补版本管理节 + init 创建 manual/ 目录 | patterns ×2 + troubleshooting ×1(更新) |
| **合计** | **8 期 19 项任务** | **8 期全部完成** | **18 条目 + 2 更新** |

## 整体统计

- 版本覆盖：v1.0 → v0.5.8（19 个大版本）
- 知识库总量：75 条目（architecture 14 + patterns 47 + troubleshooting 10 + setup 4）
- 源文件：46 个 .ts 文件
- 流水线阶段：23 个已归档

## v0.5.5 缺陷修复详情

| # | 缺陷 | 文件 | 修复方式 |
|:--:|------|------|------|
| 1 | AGENTS.md 模板更新无法传播到语言相同的存量项目 | `src/core/update.ts` | 语言判断 → 内容哈希比对（2 处分支） |
| 2 | autoCommitOnDone 在 save 前执行，commit 不含 phase 变更 | `src/core/flow-manager.ts` + `src/commands/flow.ts` | 返回 boolean 标记，命令层 save 后调用 |

## v0.5.8 缺陷修复详情

| # | 缺陷 | 文件 | 修复方式 |
|:--:|------|------|------|
| 1 | autoCommitOnDone 失效：mapPhaseToStageStatus 映射错误导致 autoRepairInconsistency 截断路径 | `src/core/flow-manager.ts` | test_passed→testing, archiving→archiving, 仅 done→done |
| 2 | AGENTS.md 模板缺失"版本管理"节 | `src/core/templates-data/agents-md/zh-CN.md` `en.md` | 对比根 AGENTS.md 追加对应节 |
| 3 | init 不创建 `.openfeel/manual/` 目录 | `src/core/workspace/structure.ts` | WORKSPACE_DIRS 追加 `'manual'` |

## 下一版本
待定。v5 全系列 8 期 19 项任务全部完成，后续方向由用户决定。
