---
name: openfeel-tool-usage
description: Agent 工具使用规范（todowrite/question/task/skill 四工具触发条件、使用要求、禁止行为 + 优先级表）。
---

# Agent 工具使用规范

## 输入

无

## 执行步骤

### 1. todowrite — 任务列表管理
触发条件（任一即用）：多个独立步骤（多文件改动、需跨会话跟踪等） / 多任务下达 / 跨文件修改。使用要求：执行前创建、单条 in_progress、完成即标 completed、新步骤追加末尾。

### 2. question — 向用户提问
触发条件（任一必问）：需求歧义 / 多个同等合理方案 / 不可逆后果 / 架构决策。使用要求：(Recommended) 标记、选项附后果、≤3 选项、高风险含"取消"。禁止：模糊时自行假设、多方案不选直接实施。

### 3. task — 子 Agent 调度
触发条件：并行探索多代码区 / 复杂多步委托 general / 下游 Agent（经主会话（Feel）） / 直接调度通用工作者（执行者 openfeel-executor；任意 Agent 均可直发，不经多级转介）。使用要求：并行一条消息多 task、prompt 含任务描述+期望返回、明确只读/可写。

### 4. skill — 技能加载
触发条件：查阶段状态→openfeel-get-stage-status / 查知识库→openfeel-check-kb / 取 Bug→openfeel-get-bugs。使用要求：会话开始载 check-kb、处理阶段任务前载 get-stage-status、不凭记忆跳过。

### 5. 工具使用优先级
| 场景 | 优先工具 | 禁止做法 |
|------|---------|----------|
| 多步骤任务 | todowrite | 凭记忆逐条执行 |
| 需求不明确 | question | 自行假设后动手 |
| 探索代码 | task(explore) | 手动逐个 grep/read |
| 获取状态 | skill(openfeel-get-stage-status) | 凭记忆推断 |
| 批量文件操作 | task(general) | 串行逐个处理 |
| 通用执行任务 | task(openfeel-executor) | 自行串行处理 |

### 6. 规模阈值与轻量决策边界

按改动**波及面**（是否跨文件、是否跨阶段 / 跨模块）选择档位：

| 规模 | 处理方式 | 流程 |
|------|----------|------|
| 微小改动（单文件、无跨文件影响） | 调用方自行处理（兼任 openfeel-planner） | 直接编码，无需正式计划 |
| 跨文件改动 | 唤起 openfeel-planner 制定正式计划 | 调用方 → openfeel-planner → openfeel-executor |
| 多阶段规模化改动（跨模块或需求边界不清） | 大规模规划，必须走完整流程 | 调用方 → openfeel-planner → openfeel-schemer → openfeel-executor → openfeel-reviewer |

**轻量决策边界**：轻量决策指对话式选型——调用方与用户澄清并敲定技术方向或设计取舍，产出的是「结论」而非「正式计划文档」，不产出 plan.md；此类决策由调用方直接处理，无需委托 openfeel-planner。仅当需要**产出正式计划文档**（plan.md，含阶段划分、任务表、约束表）或该变更明显为跨模块 / 跨阶段性质时，才委托 openfeel-planner。

### 7. 委托纪律

委托边界、dispatch 双口径、流程不可跳过、Handoff 与多模态委派、子任务上下文描述要求见 `openfeel-delegation`。

## 工具名映射（跨 harness）

本 skill 的四种核心工具（`todowrite`/`question`/`task`/`skill`）在各 harness 的等价工具名见下表；**不改变**既有触发条件/使用要求/优先级表语义。

| opencode（小写） | Claude Code | 说明 |
|------|------|------|
| `bash` | `Bash` | 命令执行 |
| `read` | `Read` | 读文件 |
| `write` | `Write` | 写文件 |
| `edit` | `Edit` | 编辑文件 |
| `glob` | `Glob` | 文件匹配 |
| `grep` | `Grep` | 内容检索 |
| `todowrite` | `TodoWrite` | 任务列表 |
| `skill` | `Skill` | 技能加载 |
| `task` | `Task` | 子 Agent 调度 |
| `question` | `AskUserQuestion` | 向用户提问 |
