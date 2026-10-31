# v1.5.2-stage-110 计划 — 调度与持久化优化调研

- **阶段**：`v1.5.2-stage-110`（fast；研究阶段，**不发布版本**）
- **关联需求**：REQ-011
- **基线**：v1.5.1（HEAD `28d9e07`）；测试 82/2021；dsh 196
- **用户目标**：
  - A. 不同 Agent 做不同的事，保证上下文健康；
  - B. Agent 记录重要信息，离开会话可快速恢复；
  - C. 不追求完美，兼顾执行效率 / token / 时间成本；1.5 整体按此方向迭代。
- **方法**：
  1. 读代码与模板，绘制「谁在何时读写什么上下文」的现状表（量化字符/tokens）；
  2. 引入本地 Codex（GPT-6.1-Sol）做只读外部评审（先修 Windows 读取问题）；
  3. 交叉比对，形成 P0/P1/P2 优化项与 1.5.2 / 1.5.3 迭代顺序。
- **交付物**：`docs/research/dispatch-persistence-2026-10-31.md`（研究文档；含现状图、诊断、方案、指标）。
- **边界**：本阶段**只调研**，不改运行时代码、不发版；后续实现另立阶段。
- **验收**：
  - 现状表覆盖 Feel / 子 agent / CLI / 持久化文件；
  - 诊断尽量量化（启动读入 tokens、派发契约、恢复路径、日志体量）；
  - 每项优化有「改哪里 / 收益 / 成本风险 / 验证指标」；
  - 给出 1.5.2 / 1.5.3（可含 1.5.4）增量顺序，每版 1-3 项、可独立验证；
  - Codex 评审：成功引用其观点（失败则记录失败原因与已尝试手段）。

## 追加范围（v1.5.2 实现，用户指令）

**根因**：上一轮把「调研」误当纯只读任务，跳过 `feel_status` 与阶段创建；适配器只拦写操作且 `docs/**` 豁免，研究/方案文档没有「必须先有阶段」的判据，导致流程违规无摩擦。

**本次实现**：
1. **入口闸（adapter）**：`feel_status` / `feel_next` 在无活跃阶段时返回 `workflowGate={required, reason, message, actions}`，summary 前置警告；`computeWorkflowGate` 单点。
2. **提示段硬规则（DSH prompt）**：任何会产出仓库文件（含 `docs/research/**`、方案、计划）或需要多步调查/实现的任务，必须先 `feel_status`；无活跃阶段 → `feel_req add → claim → feel_stage add`；纯只读问答可例外；禁止以「调研/只读」为由跳过阶段。
3. **写门禁扩展（guard）**：`docs/research/**` 研究产物在**无活跃阶段**时拒绝（chore 也不能绕过），错误信息给出建阶段指引；普通 `docs/**` 维持任意相位可写。
4. **测试/文档**：guard 分类矩阵、adapter `workflowGate`、提示段断言；README/ADAPTER/commands/VERSIONS/CHANGELOG；版本 1.5.2。
5. **调研文档**：Codex 外部意见 + 本地分析合并到 `docs/research/dispatch-persistence-2026-10-31.md`，给出 1.5.2-1.5.4 迭代顺序。

