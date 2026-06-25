# 计划索引

> OpenFeel 项目各期计划核心摘要

## 当前计划

### [OpenFeel v1.0 — 初始版本](plan.md)

**目标**：构建 OpenFeel CLI + flow.json 流水线工具，以 Feel 为总统领、Schemer/Executor/Reviewer/Tester/Archiver 为流程 Agent 链，模型分工（推理/快速/异种），支持 OpenCode 平台。

**核心理念**：提示词瘦身，流程入工具——Agent 通过 TypeScript 工具（FlowManager）操作 flow.json 获取状态和下一步指令。

**核心里程碑**：
1. TypeScript 项目骨架 + CLI 框架
2. Schema 驱动的 ArtifactGraph 引擎
3. .openfeel/ 工作区 + flow.json + FlowManager 工具
4. 三层计划管理（roadmap → stages → ops）+ scheme 命令
5. AI 指令生成系统
6. Review + Archive 闭环
7. OpenCode 适配器（Feel/Planner/Schemer/Executor/Reviewer/Tester/Archiver + /opfx:*）
8. 知识库系统
9. 测试、文档与 npm 发布

## 各阶段摘要

| 阶段 | 名称 | 状态 | 依赖 |
|------|------|------|------|
| [stage-01](stage-01/) | 项目骨架与构建体系 | planned | 无 |
| [stage-02](stage-02/) | 核心 Schema 引擎 | planned | stage-01 |
| [stage-03](stage-03/) | 工作区 + FlowManager | planned | stage-01 |
| [stage-04](stage-04/) | 三层计划管理 | planned | stage-02, stage-03 |
| [stage-05](stage-05/) | 指令生成系统 | planned | stage-02, stage-04 |
| [stage-06](stage-06/) | Review + Archive 闭环 | planned | stage-02, stage-03 |
| [stage-07](stage-07/) | OpenCode 适配器 | planned | stage-05, stage-03 |
| [stage-08](stage-08/) | 知识库系统 | planned | stage-03 |
| [stage-09](stage-09/) | 测试、文档与发布 | planned | stage-01~08 |