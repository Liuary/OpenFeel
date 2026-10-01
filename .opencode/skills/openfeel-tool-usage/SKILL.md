---
name: openfeel-tool-usage
description: Agent 工具使用规范（todowrite/question/task/skill 四工具触发条件、使用要求、禁止行为 + 优先级表）。
---

<!-- openfeel:generated — 本文件由 npm run build 生成，请勿手工编辑 -->
# Agent 工具使用规范

## 输入

无

## 执行步骤

### 1. todowrite — 任务列表管理
触发条件（任一即用）：多个独立步骤（多文件改动、需跨会话跟踪等） / 多任务下达 / 跨文件修改。使用要求：执行前创建、单条 in_progress、完成即标 completed、新步骤追加末尾。

### 2. question — 向用户提问
触发条件（任一必问）：需求歧义 / 多个同等合理方案 / 不可逆后果 / 架构决策。使用要求：(Recommended) 标记、选项附后果、≤3 选项、高风险含"取消"。禁止：模糊时自行假设、多方案不选直接实施。

### 3. task — 子 Agent 调度
触发条件：并行探索多代码区 / 复杂多步委托 general / 下游 Agent（经 Feel）。使用要求：并行一条消息多 task、prompt 含任务描述+期望返回、明确只读/可写。

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
