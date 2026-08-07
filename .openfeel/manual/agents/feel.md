# Agent 体系设计（agents）

> 模块文档，由归档官在归档时维护。对应源码：`src/core/templates-data/agents/{zh-CN,en}/*.md` + `.opencode/agents/*.md`。

## 职责

定义 OpenFeel 9 Agent 协作体系：角色分工、驱动模型、调起方式与调度规则。Agent prompt 由 Feel 总统领统一调度，按流水线阶段串行推进。

## 9 Agent 体系

| Agent | 角色 | 驱动模型 | 调起方式 | 思考深度 |
|-------|------|----------|----------|:--:|
| Feel | 总统领 | 主力推理模型 | primary | medium |
| Planner | 计划官 | 推理模型 | subagent | high |
| Schemer | 方案官 | 主力推理模型 | subagent | high |
| Executor | 执行官 | 快速模型 (Flash) | subagent | low |
| Reviewer | 审查官 | 异种推理模型 (GLM) | subagent | medium |
| Feel Tester | 测试官 | 推理模型 | subagent | medium |
| 事务官 | 事务官 | 快速模型 (Flash) | subagent | low |
| Vision | 视觉官 | 多模态模型 (qwen-vl-plus) | subagent | low |
| Archiver | 归档官 | 推理模型 | subagent | low |

## 调度模型

- **流程**：用户输入 → Feel 理解意图 → 按阶段调对应 Agent（Planner→Schemer→Executor→Reviewer→Feel Tester→Archiver）→ 检查结果 → 推进流水线
- **硬性纪律**：Feel 不得跳过任何 Agent，禁止亲为下游职责（编码、审查、测试等）
- **写入约束**：Planner 与 Archiver 对 flow.json 的操作必须通过 Feel + CLI 间接完成
- **跨 Agent 协作**：`[HANDOFF: agent]` 标记可触发委派（如 Executor → Vision 分析截图）

## 思考深度配置

各 Agent frontmatter 含 `reasoning_effort` 字段（high/medium/low）：规划/方案类用 high，调度/审查/测试用 medium，执行/机械/归档/视觉用 low。模板与 `.opencode/agents/` 部署副本需保持同步。
