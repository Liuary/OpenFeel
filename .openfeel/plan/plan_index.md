# 计划索引

> OpenFeel 项目各期计划核心摘要

## 当前计划

### [OpenFeel v4.1 — 构建稳健性 + Agent 深化](v4.1/plan.md) ← 计划中

**目标**：(1) 构建时自动同步模板，消除部署版本漂移；(2) 7 个 Agent prompt 扩充职责边界，新增 Utility Agent。

| 阶段 | 任务 | 优先级 | 状态 |
|------|------|:--:|:--:|
| v4.1-stage-01 | 构建脚本自动同步模板（9 项） | P1 | planned |
| v4.1-stage-02 | Agent 特化 + Utility Agent（11 项） | P1 | planned |

## 历史计划

### [OpenFeel v4.0 — 工程精简与能力增强](v4/plan.md) ✅ 已归档

**目标**：15→7 Agent 全面对齐部署项目 + 精简 core.md（424→342 行）+ 落地 12 项改进建议。4 阶段 39 项任务全部闭环。

| 阶段 | 任务 | REV | 状态 |
|------|:--:|:--:|:--:|
| [v4-stage-01](v4/v4-stage-01/status.md) | 工程改造 — 15→7 Agent | 20 | 4→closed | done |
| [v4-stage-02](v4/v4-stage-02/status.md) | 核心增强 — KB 检索 + 前置校验 | 5 | 4→3 closed | done |
| [v4-stage-03](v4/v4-stage-03/status.md) | 审查增强 + 流水线可视化 | 6 | 1→low | done |
| [v4-stage-04](v4/v4-stage-04/status.md) | 体验优化 — 7 项锦上添花 | 8 | 3→low | done |

### [OpenFeel v3.2 — 收尾补丁](v3.2/v3.2-stage-01/status.md) ✅ 已归档

**目标**：文档路径修正、flow status --verbose 可视化、Schemer 依赖声明。1 阶段 3 项，全部完成。

| 阶段 | 任务 | 优先级 | 状态 |
|------|------|:--:|:--:|
| [v3.2-stage-01](v3.2/v3.2-stage-01/status.md) | 路径修正 + 可视化 + 依赖声明 | P1 | done |

### [OpenFeel v3.1 — 补丁修正](v3.1/v3.1-stage-01/status.md) ✅ 已归档

**目标**：文档写入路径规范化、Flow CLI 严格校验、知识库搜索增强。1 阶段 4 项，全部完成。

| 阶段 | 任务 | 优先级 | 状态 |
|------|------|:--:|:--:|
| [v3.1-stage-01](v3.1/v3.1-stage-01/status.md) | 文档路径 + Flow 校验 + 搜索增强 | P1 | done |

### [OpenFeel v3.0 — 生产加固](v3/plan.md) ✅ 已归档

**目标**：基于二期 NumKit 端到端测试审查，修复 flow.json 鲁棒性、落地模型分配、优化效率、补全体验。4 阶段 21 项任务 + 2 轮补丁，全部闭环。

| 阶段 | 任务 | 优先级 | 状态 |
|------|------|:--:|:--:|
| [v3-stage-01](v3/v3-stage-01/status.md) | flow.json 鲁棒性加固 | P0 | done |
| [v3-stage-02](v3/v3-stage-02/status.md) | 模型配置落地 | P0 | done |
| [v3-stage-03](v3/v3-stage-03/status.md) | 效率优化 | P1 | done |
| [v3-stage-04](v3/v3-stage-04/status.md) | 体验补全 | P2 | done |

### [OpenFeel v2.0 — 迭代打磨](v2/plan.md) ✅ 已完成

**目标**：统一工作区结构、建立可扩展架构（核心+适配器）、实现交互式 CLI。7 阶段 28 项改进，全部闭环。

### [OpenFeel v1.0 — 初始版本](v1/plan.md) ✅ 已归档

**目标**：构建 OpenFeel CLI + flow.json 流水线工具，以 Feel 为总统领、Schemer/Executor/Reviewer/Tester/Archiver 为流程 Agent 链，模型分工（推理/快速/异种），支持 OpenCode 平台。9 阶段全部完成。

## 各版本阶段对照

| 版本 | 状态 | 阶段数 | 完成 | 复盘 |
|------|------|--------|------|------|
| v1.0 | 已归档 | 9 | 9/9 done | [phase-1](../docs/phase-1/) |
| v2.0 | 已完成 | 7 | 7/7 done | [phase-1](../docs/phase-1/) |
| v3.0 | 已归档 | 4 | 4/4 done | — |
| v3.1 | 已归档 | 1 | 1/1 done | — |
| v3.2 | 已归档 | 1 | 1/1 done | — |
| v4.0 | 已归档 | 4 | 4/4 done | — |
| v4.1 | 计划中 | 1 | 0/1 | — |
