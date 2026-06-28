# 计划索引

> OpenFeel 项目各期计划核心摘要

## 当前计划

### [OpenFeel v3.0 — 生产加固](v3/plan.md) ← 实现完成，待审查验收

**目标**：基于二期 NumKit 端到端测试审查，修复 flow.json 鲁棒性、落地模型分配、优化效率、补全体验。4 阶段 21 项任务，全部实现。

| 阶段 | 任务 | 优先级 | 状态 |
|------|------|:--:|:--:|
| [v3-stage-01](v3/v3-stage-01/status.md) | flow.json 鲁棒性加固 | P0 | ready_for_review |
| [v3-stage-02](v3/v3-stage-02/status.md) | 模型配置落地 | P0 | ready_for_review |
| [v3-stage-03](v3/v3-stage-03/status.md) | 效率优化 | P1 | ready_for_review |
| [v3-stage-04](v3/v3-stage-04/status.md) | 体验补全 | P2 | ready_for_review |

## 历史计划

### [OpenFeel v2.0 — 迭代打磨](v2/plan.md) ✅ 已完成

**目标**：统一工作区结构、建立可扩展架构（核心+适配器）、实现交互式 CLI。7 阶段 28 项改进，全部闭环。

### [OpenFeel v1.0 — 初始版本](v1/plan.md) ✅ 已归档

**目标**：构建 OpenFeel CLI + flow.json 流水线工具，以 Feel 为总统领、Schemer/Executor/Reviewer/Tester/Archiver 为流程 Agent 链，模型分工（推理/快速/异种），支持 OpenCode 平台。9 阶段全部完成。

## 各版本阶段对照

| 版本 | 状态 | 阶段数 | 完成 | 复盘 |
|------|------|--------|------|------|
| v1.0 | 已归档 | 9 | 9/9 done | [phase-1](../docs/phase-1/) |
| v2.0 | 已完成 | 7 | 7/7 done | [phase-1](../docs/phase-1/) |
| v3.0 | 实现完成 | 4 | 4/4 | 待审查验收 |
