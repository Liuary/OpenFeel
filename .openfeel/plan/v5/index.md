# v5 系列计划索引

> OpenFeel v5 系列各期计划核心摘要（v0.5.0 ~ v0.5.11）

## 系列总览

| 版本 | 状态 | 阶段数 | 完成 | 摘要 |
|------|------|--------|------|------|
| [v0.5.0](v5.0/plan.md) | 已归档 | 1 | 1/1 done | 框架级记忆体系 |
| [v0.5.1](v5.1/ops/op-001.md) | 已归档 | 1 | 1/1 done | 工具链内化与一致性治理 |
| [v0.5.2](v5.2/ops/op-001.md) | 已归档 | 1 | 1/1 done | 职责迁移与 Agent 协作原语 |
| [v0.5.3](v5.3/ops/op-001.md) | 已归档 | 1 | 1/1 done | 状态持久化与灵活流程控制 |
| [v0.5.4](v5.4/ops/op-001.md) | 已归档 | 1 | 1/1 done | 质量保障与知识库健康 + CLI-Agent 对齐 |
| [v0.5.5](v5.5/ops/op-001.md) | 已归档 | 1 | 1/1 done | 缺陷修复（部署传播 + autoCommitOnDone 时序） |
| [v0.5.6](v5.6/ops/op-001.md) | 已归档 | 1 | 1/1 done | 版本管理规范 + manual 模块文档 + reasoning_effort |
| v0.5.7 | 已归档 | 1 | 1/1 done | 计划目录重构 + reasoning_effort 调整 |
| [v0.5.8](v5.8/ops/op-001.md) | 已归档 | 1 | 1/1 done | 三项缺陷修复（映射修正 + 模板补节 + manual 目录） |
| [v0.5.9](v5.9/ops/op-001.md) | 已归档 | 1 | 1/1 done | 审查纪律强化（feel/executor 硬性纪律） |
| [v0.5.10](v5.10/ops/op-001.md) | 已归档 | 2 | 2/2 done | profile 自动填充 + 异常安全修复 |
| v0.5.11 | 执行中 | 1 | 0/1 | 目录归位 + 版本号重映射 + 新规则 |

> 系列路线图：[roadmap-v5](roadmap-v5.md)（由 v0.4.7 迁入）

## 各期摘要

### v0.5.11：目录归位 + 版本号重映射 + 新规则 🔄 执行中

**目标**：(1) v0.5.8 ~v0.5.10 plan 目录归位到 v5/ 系列下；(2) 全部版本号统一重映射为 v0 体系；(3) 版本号管理规则升级为 X.Y.Z.W 四级。

### v0.5.10：profile 自动填充 + 异常安全 ✅ 已归档

**目标**：修复全局 profile 首次自动填充 + 3 项健壮性修复（写盘降级 + passthrough 保留 + 路径规范化）。

### v0.5.9：审查纪律强化 ✅ 已归档

**目标**：feel.md 新增「审查不可跳过（硬性纪律）」节 + executor.md 新增「审查移交（硬性纪律）」节，中英双语 6 文件同步插入。

### v0.5.8：三项缺陷修复 ✅ 已归档

**目标**：autoCommitOnDone mapPhaseToStageStatus 映射修正 + AGENTS.md 模板补版本管理节 + init 创建 manual/ 目录。

### v0.5.7：计划目录重构 + reasoning_effort 调整 ✅ 已归档

**目标**：(1) `.openfeel/plan/` 从平铺目录重构为按大版本分组（v4/、v5/ 系列收纳，git mv 保留历史），建立"系列索引 + 顶层指针"导航体系；(2) 调整 4 个 Agent 的 reasoning_effort（Planner/Schemer→max，Executor/Vision→medium），12 文件中英双语一致。1 项 op 全部落地，自测五维全通过。

### [OpenFeel v5 — 工具链 + 协作增强 + 质量保障](roadmap-v5.md) ✅ 已完成

**目标**：v0.5.0 框架级记忆体系，v0.5.1 CLI 内化归档 git commit + 提示词统一，v0.5.2 Handoff 原语 + 规范迁移，v0.5.3 Checkpoint 快照 + 组合终止条件，v0.5.4 lint 质量门禁 + CLI-Agent 对齐，v0.5.5 验证缺陷修复（AGENTS.md 部署传播 + autoCommitOnDone 时序）。

| 阶段 | 任务 | 优先级 | 状态 |
|------|------|:--:|:--:|
| v0.5.0 | 框架级记忆体系（全局 profile + 项目记忆卡片，3 项） | P1 | done ✅ |
| v0.5.1 | 工具链内化与一致性治理（2 项） | P1 | done ✅ |
| v0.5.2 | 职责迁移与 Agent 协作原语（2 项） | P1 | done ✅ |
| v0.5.3 | 状态持久化与灵活流程控制（2 项） | P1 | done ✅ |
| v0.5.4 | 质量保障与知识库健康 + CLI-Agent 对齐（3 项） | P1 | done ✅ |
| v0.5.5 | 缺陷修复：AGENTS.md 部署传播 + autoCommitOnDone 时序（2 项） | P0 | done ✅ |
| v0.5.6 | 版本管理规范 + manual 模块文档 + reasoning_effort 思考深度配置（3 项） | P1 | done ✅ |
| v0.5.7 | 目录重构 + reasoning_effort 调整（1 项） | P1 | done ✅ |
| v0.5.8 | 三项缺陷修复（1 项） | P1 | done ✅ |
| v0.5.9 | 审查纪律强化（1 项） | P1 | done ✅ |
| v0.5.10 | profile 自动填充 + 异常安全（2 项） | P1 | done ✅ |
| **v5 全系列** | **11 期 21 项任务** | — | **✅ 10 期完成 + v0.5.11 执行中** |
