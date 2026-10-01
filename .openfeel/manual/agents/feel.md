# Agent 体系设计（agents）

> 模块文档，由归档官在归档时维护。对应源码：`src/core/templates-data/agents/{zh-CN,en}/*.md` + `.opencode/agents/*.md`（opencode 适配器部署副本）。

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
| Vision | 视觉官 | 多模态模型 (deepseek-flash) | subagent | low |
| Archiver | 归档官 | 推理模型 | subagent | low |

## 调度模型

- **流程**：用户输入 → Feel 理解意图 → 按阶段调对应 Agent（Planner→Schemer→Executor→Reviewer→Feel Tester→Archiver）→ 检查结果 → 推进流水线
- **硬性纪律**：Feel 不得跳过任何 Agent，禁止亲为下游职责（编码、审查、测试等）
- **写入约束**：Planner 与 Archiver 对 flow.json 的操作必须通过 Feel + CLI 间接完成
- **跨 Agent 协作**：`[HANDOFF: agent]` 标记可触发委派（如 Executor → Vision 分析截图）

## 审查会话健康探测与可疑产出处置（v1.1.2-stage-48 事件 A）

> 落点（权威源）：`src/core/templates-data/opencode/agents/{zh-CN,en}/feel.md`「审查会话健康探测与可疑产出处置」节 + `.../openfeel-reviewer.md`「工具调用异常与独立取证纪律」节；配套规范见 `manual/core/code-review.md`。

- **健康探测（唤起审查官首轮执行）**：要求 openfeel-reviewer 在首轮先做**最小工具自检**——执行 `rg --version` 并读取一个已知文件（如 `package.json` 首行）**回报内容**。若自检失败、内容不符或工具结果异常 → 判定该会话**不可用**，立即中止并**重开会话**，不得沿用其后续产出。
- **可疑产出处置（REV-48-005）**：一旦判定某会话可疑，其已写出的 **REV 条目 / 验收记录自动降级为「待复核」**，**不得**被后续会话或 Feel 直接引用推进；须由新会话**独立复核关键结论后**方可据此推进（并追加「可信度声明」）。
- **审查纪律四条**（写进 reviewer 模板，随会话自动加载）：① 工具异常即中止并如实报告（不得臆造/续写）；② 可疑历史结论不得继承；③ 命令行取证优先于 `read`/`glob`；④ 结论须「命令 + 版本 + 环境」三要素可第三方复现。

## 任务类型路由（非编码任务一等公民）

| 任务类型 | 处理路径 |
|----------|----------|
| 调研/探索（读代码、查资料、定位问题） | Feel → research（general / explore Agent），只读探索不产出源码变更 |
| 编码实现（新增/修改源码） | 完整流水线（Planner → Schemer → Executor → Reviewer → Tester） |
| 选型讨论（敲定技术方案/设计取舍） | Feel + `question` 工具，对话式决策产出结论不产出 plan.md |

非编码任务不强制创建计划或推进流水线，flow.json 不必为所有任务空转。

## 轻量决策边界

对话式选型（Feel 与用户通过 `question` 工具敲定技术方向/设计取舍，产出结论不产出 plan.md）由 Feel 直接处理，不委托 Planner；仅当需要**产出正式计划文档**（plan.md，含阶段划分、任务表、约束表）或达规模阈值时才委托 Planner。消除「要么全亲为、要么全委托」的极端。

## 决策归属区分

长期决策（技术选型、架构方向、跨会话有效的设计取舍）以 ADR 格式同步写入 `.openfeel/dev/decisions.md`；会话临时决策（流程调整、单次取舍）仅记录在 `dev_last/decisions.md`（主题文件「决策记录」；A10 英文文件名）。

## 思考深度配置

各 Agent frontmatter 含 `reasoning_effort` 字段（high/medium/low）：规划/方案类用 high，调度/审查/测试用 medium，执行/机械/归档/视觉用 low。模板与 `.opencode/agents/` 部署副本（opencode 适配器）需保持同步。
