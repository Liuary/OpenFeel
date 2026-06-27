# 计划索引

> OpenFeel 项目各期计划核心摘要

## 当前计划

### [OpenFeel v2.0 — 迭代打磨](v2/plan.md) ← 已确认，等待启动

**目标**：统一工作区结构、建立可扩展架构（核心+适配器）、实现交互式 CLI。7 阶段 28 项改进。

## 历史计划

### [OpenFeel v1.0 — 初始版本](v1/plan.md) ✅ 已归档

**目标**：构建 OpenFeel CLI + flow.json 流水线工具，以 Feel 为总统领、Schemer/Executor/Reviewer/Tester/Archiver 为流程 Agent 链，模型分工（推理/快速/异种），支持 OpenCode 平台。

**核心理念**：提示词瘦身，流程入工具——Agent 通过 TypeScript 工具（FlowManager）操作 flow.json 获取状态和下一步指令。

**核心里程碑**（9 阶段）：
1. TypeScript 项目骨架 + CLI 框架
2. Schema 驱动的 ArtifactGraph 引擎
3. .openfeel/ 工作区 + flow.json + FlowManager 工具
4. 三层计划管理（roadmap → stages → ops）+ scheme 命令
5. AI 指令生成系统
6. Review + Archive 闭环
7. OpenCode 适配器（Feel/Planner/Schemer/Executor/Reviewer/Tester/Archiver + /opfx:*）
8. 知识库系统
9. 测试、文档与 npm 发布

**交付状态**：stage-01~07 已部署，一期部署测试完成（Todo CLI 全流水线验证），复盘文档见 `docs/2026-06-27-001-deploy-review.md`。

## 各版本阶段对照

| 版本 | 状态 | 阶段数 | 完成 | 复盘 |
|------|------|--------|------|------|
| v1.0 | 已归档 | 9 | stage-01 done | [001-deploy-review](../docs/2026-06-27-001-deploy-review.md) |
| v2.0 | 已完成 | 7 | 7/7 done | [003-deploy-v2-review](../docs/2026-06-27-003-deploy-v2-review.md) |
