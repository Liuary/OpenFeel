# v5 系列计划索引

> OpenFeel v5 系列各期计划核心摘要（v5.0 ~ v5.7）

## 系列总览

| 版本 | 状态 | 阶段数 | 完成 | 摘要 |
|------|------|--------|------|------|
| [v5.0](v5.0/plan.md) | 已归档 | 1 | 1/1 done | 框架级记忆体系 |
| [v5.1](v5.1/ops/op-001.md) | 已归档 | 1 | 1/1 done | 工具链内化与一致性治理 |
| [v5.2](v5.2/ops/op-001.md) | 已归档 | 1 | 1/1 done | 职责迁移与 Agent 协作原语 |
| [v5.3](v5.3/ops/op-001.md) | 已归档 | 1 | 1/1 done | 状态持久化与灵活流程控制 |
| [v5.4](v5.4/ops/op-001.md) | 已归档 | 1 | 1/1 done | 质量保障与知识库健康 + CLI-Agent 对齐 |
| [v5.5](v5.5/ops/op-001.md) | 已归档 | 1 | 1/1 done | 缺陷修复（部署传播 + autoCommitOnDone 时序） |
| [v5.6](v5.6/ops/op-001.md) | 已归档 | 1 | 1/1 done | 版本管理规范 + manual 模块文档 + reasoning_effort |
| v5.7 | 已归档 | 1 | 1/1 done | 计划目录重构 + reasoning_effort 调整 |

> 系列路线图：[roadmap-v5](roadmap-v5.md)（由 v4.7 迁入）

## 各期摘要

### v5.7：计划目录重构 + reasoning_effort 调整 ✅ 已归档

**目标**：(1) `.openfeel/plan/` 从平铺目录重构为按大版本分组（v4/、v5/ 系列收纳，git mv 保留历史），建立"系列索引 + 顶层指针"导航体系；(2) 调整 4 个 Agent 的 reasoning_effort（Planner/Schemer→max，Executor/Vision→medium），12 文件中英双语一致。1 项 op 全部落地，自测五维全通过。

### [OpenFeel v5 — 工具链 + 协作增强 + 质量保障](roadmap-v5.md) ✅ 已完成

**目标**：v5.0 框架级记忆体系，v5.1 CLI 内化归档 git commit + 提示词统一，v5.2 Handoff 原语 + 规范迁移，v5.3 Checkpoint 快照 + 组合终止条件，v5.4 lint 质量门禁 + CLI-Agent 对齐，v5.5 验证缺陷修复（AGENTS.md 部署传播 + autoCommitOnDone 时序）。

| 阶段 | 任务 | 优先级 | 状态 |
|------|------|:--:|:--:|
| v5.0 | 框架级记忆体系（全局 profile + 项目记忆卡片，3 项） | P1 | done ✅ |
| v5.1 | 工具链内化与一致性治理（2 项） | P1 | done ✅ |
| v5.2 | 职责迁移与 Agent 协作原语（2 项） | P1 | done ✅ |
| v5.3 | 状态持久化与灵活流程控制（2 项） | P1 | done ✅ |
| v5.4 | 质量保障与知识库健康 + CLI-Agent 对齐（3 项） | P1 | done ✅ |
| v5.5 | 缺陷修复：AGENTS.md 部署传播 + autoCommitOnDone 时序（2 项） | P0 | done ✅ |
| v5.6 | 版本管理规范 + manual 模块文档 + reasoning_effort 思考深度配置（3 项） | P1 | done ✅ |
| v5.7 | 目录重构 + reasoning_effort 调整（1 项） | P1 | done ✅ |
| **v5 全系列** | **7 期 16 项任务** | — | **✅ 全部完成** |
