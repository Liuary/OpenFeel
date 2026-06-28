# OpenFeel 一期：核心流水线搭建

> 归档时间：2026-06-27 | 基于 plan/v1/plan.md + 9 阶段开发日志

## 一期目标

构建 OpenFeel 的**核心流水线体系**——从零搭建 Feel 总统领驱动的 7 Agent 协作系统，实现"计划→方案→编码→审查→测试→归档"的完整闭环。

## 关键交付

### Agent 体系（7 个）

| Agent | 模型策略 | 核心职责 |
|-------|----------|----------|
| **Feel** | 主力推理模型 | 总调度、意图理解、流水线管理 |
| **Planner** | 推理模型 | 分期大纲、阶段划分、依赖声明 |
| **Schemer** | 推理模型 | 极细粒度操作方案（三层计划最底层） |
| **Executor** | 快速模型 | 按方案编码 + 自测 |
| **Reviewer** | **异种推理模型** | 交叉审查（5 维） |
| **Tester** | 推理模型 | 正式测试 + Bug 管理 |
| **Archiver** | 推理模型 | 产出归档 + 知识提取 |

### 核心机制

- **流水线状态机**：15 个 phase 的完整状态流转（plan_pending → ... → done）
- **flow.json**：运行态状态记录，驱动各 Agent 推进
- **三层计划**：Roadmap（分期大纲）→ Stage（工作阶段）→ Op（操作方案）
- **公共域/私域分离**：`.openfeel/` 公共域纳入 git，`users/{name}/` 私域 gitignore
- **8 个 /opfx: 技能**：flow / plan / scheme / code / view / test / archive / kb

### CLI 工具

- `openfeel init` / `flow status` / `plan stage add` / `scheme create` / `flow advance` 等 20+ 子命令
- 技术栈：TypeScript + commander + zod + yaml

### 开发过程

共 9 个阶段（stage-01 ~ stage-09），按 5 个批次并行推进，涵盖：
- stage-01~03：项目骨架 + flow.json 状态机 + CLI 命令核心
- stage-04~06：Pipeline + Plan + Archive 命令
- stage-07~09：CLI 发行 + 容器化 + 测试文档

记录了 4 条关键 REV（审查问题），涉及依赖缺失、循环检测、日志字段、JSON 格式化等。

## 经验沉淀

一期开发中提取了大量架构决策和代码模式，形成了知识库的种子数据，包括：
- 库项目不使用 package-lock.json 的决策
- TypeScript strict + ESM + NodeNext 的技术选型
- vitest 覆盖率阈值配置模式
- CI 流程与单二进制发布策略

## 原始设计文档

详见：`.openfeel/plan/v1/plan.md`（441 行完整设计）
