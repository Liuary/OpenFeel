# v4 系列计划索引

> OpenFeel v4 系列各期计划核心摘要（v4 ~ v4.7）

## 系列总览

| 版本 | 状态 | 阶段数 | 完成 | 摘要 |
|------|------|--------|------|------|
| [v4](plan.md) | 已归档 | 4 | 4/4 done | 工程精简与能力增强 |
| [v4.1](v4.1/plan.md) | 已归档 | 4 | 4/4 done | 构建稳健性 + Agent 深化 |
| [v4.2](v4.2/plan.md) | 已归档 | 1 | 1/1 done | 项目快速架构索引 |
| [v4.3](v4.3/plan.md) | 已归档 | 3 | 3/3 done | 审计修复 + 中英双语支持 |
| [v4.4](v4.4/plan.md) | 已归档 | 4 | 4/4 done | 国际化 + 流水线纪律强化 |
| [v4.5](v4.5/plan.md) | 已归档 | 1 | 1/1 done | 自动 init 修复 |
| [v4.6](v4.6/plan.md) | 已归档 | 2 | 2/2 done | 新增多模态 Agent + CLI 补充 |
| [v4.7](v4.7/plan.md) | 已归档 | 1 | 1/1 done | 部署版修复 + 路线图（[roadmap-v5](../v5/roadmap-v5.md)） |

## 各期摘要

### [OpenFeel v4.7 — 部署版修复 + 路线图](v4.7/plan.md) ✅ 已归档

**目标**：部署版修复 + 路线图（roadmap-v5 详见 [v5 系列](../v5/index.md)）。

### [OpenFeel v4.6 — 新增多模态 Agent + CLI 补充](v4.6/plan.md) ✅ 已归档

**目标**：(stage-01) 新增 Vision 视觉官 Agent（qwen-vl-plus 多模态模型），全链路 9 项文件更新；(stage-02) 补充 `openfeel config get/set` CLI 命令、AGENTS.md 过度设计规则增强、Reviewer 审查维度扩展、Vision 模板去硬编码。2 阶段全部归档。

| 阶段 | 任务 | 优先级 | 状态 |
|------|------|:--:|:--:|
| v4.6-stage-01 | Vision Agent 全链路落地（8+1 ops） | P1 | done ✅ |
| v4.6-stage-02 | CLI 命令 + 规则/审查增强（8 ops） | P1 | done ✅ |

### [OpenFeel v4.5 — 自动 init 修复](v4.5/plan.md) ✅ 已归档

**目标**：`openfeel update` 在未 init 项目上自动调用 `initProject()`，消除"先 init 再 update"的手动步骤。1 项改动，已实现。

| 阶段 | 任务 | 优先级 | 状态 |
|------|------|:--:|:--:|
| v4.5 | update 自动 init（1 项） | P1 | done ✅ |

### [OpenFeel v4.4 — 国际化 + 流水线纪律强化](v4.4/plan.md) ✅ 已归档

**目标**：(1) CLI 输出国际化 + 全局语言配置；(2) 流水线纪律：REV 闭环、git commit、日志强制落档、日志体系修复；(3) 配置优化与 Agent 提示词完善；(4) 数据同步与收尾修复。共 15 项问题（Feel 研究补充 5 项），4 阶段。

| 阶段 | 任务 | 优先级 | 依赖 | 状态 |
|------|------|:--:|------|:--:|
| v4.4-stage-01 | i18n 基建 + CLI 国际化（6 项） | P0 | — | done ✅ |
| v4.4-stage-02 | 日志修复 + 流水线安全增强（6 项） | P0 | —（与 s01 并行） | done ✅ |
| v4.4-stage-03 | 配置优化 + Agent 提示词完善（3 项） | P1 | s01 (hard), s02 (soft) | done ✅ |
| v4.4-stage-04 | 数据同步 + 收尾修复（5 项） | P2 | s01 (soft), s02 (soft) | done ✅ |

### [OpenFeel v4.3 — 审计修复 + 中英双语支持](v4.3/plan.md) ✅ 已归档

**目标**：(Part A) 修复 v4.2 审计遗留的 3 个违规（日志纪律、自测报告已融入 stage-01，REV-004 独立为 stage-02）；(Part B) 实现中英双语 Agent prompt 部署支持，包括模板文件化重构（构建时内联）、init/update 语言选择、8 个英文 Agent 模板、README 双语化。

| 阶段 | 任务 | 优先级 | 依赖 | 状态 |
|------|------|:--:|------|:--:|
| v4.3-stage-01 | 模板文件化重构 + 纪律强化（8 项） | P0 | — | done ✅ |
| v4.3-stage-02 | REV-004 修复 project.ts（1 项） | P0 | —（与 s01 并行） | done ✅ |
| v4.3-stage-03 | 英文内容 + 双语交互（8 项） | P1 | stage-01 (hard) | done ✅ |

### [OpenFeel v4.1 — 构建稳健性 + Agent 深化](v4.1/plan.md) ✅ 已归档

**目标**：(1) 构建时自动同步模板，消除部署版本漂移；(2) 7 个 Agent prompt 扩充职责边界，新增 Utility Agent。

| 阶段 | 任务 | 优先级 | 状态 |
|------|------|:--:|:--:|
| v4.1-stage-01 | 构建脚本自动同步模板（9 项） | P1 | review_passed |
| v4.1-stage-02 | Agent 特化 + 事务官（11 项） | P1 | done |
| v4.1-stage-03 | flow.json 多阶段状态机（7 项） | P0 | review_passed |
| v4.1-stage-04 | Agent 去语言特化（4 项） | P2 | done |

### [OpenFeel v4.2 — 项目快速架构索引](v4.2/plan.md) ✅ 已归档

**实际实施**：用户确认方案 A+B — 增强 `kb/index.md` 概览节 + `openfeel project overview` CLI 命令。2 个 op 完成，审查 3/4 REV closed（1 low 延期），测试 14/14 通过。

| 阶段 | 任务 | 状态 |
|------|------|:--:|
| v4.2-stage-01 | 方案 A+B 落地（2 项） | done ✅ |

### [OpenFeel v4.0 — 工程精简与能力增强](plan.md) ✅ 已归档

**目标**：15→7 Agent 全面对齐部署项目 + 精简 core.md（424→342 行）+ 落地 12 项改进建议。4 阶段 39 项任务全部闭环。

| 阶段 | 任务 | REV | 状态 |
|------|:--:|:--:|:--:|
| [v4-stage-01](v4-stage-01/status.md) | 工程改造 — 15→7 Agent | 20 | 4→closed | done |
| [v4-stage-02](v4-stage-02/status.md) | 核心增强 — KB 检索 + 前置校验 | 5 | 4→3 closed | done |
| [v4-stage-03](v4-stage-03/status.md) | 审查增强 + 流水线可视化 | 6 | 1→low | done |
| [v4-stage-04](v4-stage-04/status.md) | 体验优化 — 7 项锦上添花 | 8 | 3→low | done |
