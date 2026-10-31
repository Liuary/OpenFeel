# 调度与持久化优化调研（v1.5.x）

- 日期：2026-10-31 ｜ 阶段：`v1.5.2-stage-110` ｜ 需求：REQ-011
- 输入：OpenFeel v1.5.1 代码与模板；本地 Codex `gpt-6.1-sol` 只读评审（见 §5）
- 结论：1.5 的方向不是「更全的记录」，而是**更少的跨会话状态 + 更硬的入口契约**。1.5.2 先修「流程违规」；1.5.3 做「结构化交接 + 恢复包」；1.5.4 再动日志索引/快照版本。

## 1. 当前拓扑（谁在何时读写什么）

| 角色 | 读 | 写 / 调度 |
|---|---|---|
| **Feel（主会话）** | `feel_status` / `feel_next`（`flow next/status/mode` 聚合）；按需 `dev_last` 交接区；计划/方案/REV 的目标片段 | 唯一写 `flow.json` / `status.md` / `dev_last*` / 交接摘要（经 CLI 或手写）；派发子 agent；推进阶段 |
| **子 agent**（executor/reviewer/planner…） | 派发 prompt + plan / op / REV / 源码 | **不读写** `dev_last*`、`current.md`、`status.md`、`flow.json`；只改自己职责内的文件并返回摘要 |
| **CLI（FlowManager）** | `flow.json`、pipeline 配置、REV、阶段目录 | `advance` 校验相位/阻塞 REV/CAS；写 phase/status/current；`flow.log` 仅 200 条；节点建日志骨架（旧） |
| **DSH 适配器** | 并发读 `flow next/status/mode`；`guard` 缓存读 flow | 不改状态；翻译 `feel_*`；`guard` 拒绝/放行写并写 `guard-audit.jsonl`；`dev-status` 只读判定 |
| **dev-status（CLI）** | `flow.json` + `.openfeel/dev/.sync.json` | 节点/30 分钟写 `dev_last.md` 的 AUTO 块（活跃阶段/需求/最近操作） |

### 上下文体量（v1.5.1 实测字符 / ≈token）

| 载体 | 字符 | ≈tokens |
|---|---:|---:|
| `agents-md/zh-CN.md`（全局约束，常驻） | 6,688 | 2,229 |
| `opencode/agents/zh-CN/feel.md`（Feel 常驻） | 7,661 | 2,554 |
| `openfeel-memory`（v1.5 后按需） | 1,323 | 441 |
| `openfeel-logging`（按需） | 1,355 | 452 |
| `openfeel-workspace`（按需） | 7,396 | 2,465 |
| `openfeel-context-hygiene`（按需） | 2,596 | 865 |
| 子 agent 模板（executor / reviewer） | 3,516 / 3,061 | 1,172 / 1,020 |

> 常驻治理 ≈4.8k tokens；若加载 4 个 governance skills，启动即 ≈9k tokens，尚未读业务文件。

## 2. 诊断（浪费与风险）

1. **入口无闸**（已发生违规）：v1.5.1 之前只有「写源码需要阶段」；`docs/**` 任意相位可写，研究/方案文档没有阶段要求。模型把「调研」归为只读，跳过 `feel_status → 建阶段`，直到写文件才被拦（本次调研甚至没写文件，完全无摩擦）。
2. **持久化分散且重复**：`flow.log`（事件）、`dev_last`（人读）、`status.md`（派生态）、`current.md`（已停维护）四层有重叠；旧 `current.md` 与 `dev_last` 长期停滞（本仓 `dev_last` 最后更新 2026-10-15），恢复价值低。
3. **交接不可读**：`dev_last` 索引曾膨胀到 5 个主题 × 5 条 × 100 字，恢复时仍需逐条判断；缺「上次做到哪 / 下一步 / 阻塞」固定键。
4. **恢复路径无预算**：`openfeel-recover` 让 agent 读索引 + 主题文件 + flow 状态，未给「最少读哪两样」的硬约束，容易恢复时再次灌满上下文。
5. **调度契约靠自然语言**：派发 prompt 没有统一模板（目标 / 输入 / 边界 / 返回格式），主会话容易把子任务细节、日志、全量 diff 留在自己的上下文里。
6. **日志/状态写入频率已降，但仍有噪音**：30 分钟同步即使状态未变也重写 AUTO 块；日志 `detail` 字段较大，200 条上限只是体积兜底，不是信息密度优化。

## 3. 设计原则（1.5 整体）

- **单一写者**：只有 Feel 写状态；子 agent 只产出「文件 + ≤10 行返回」。
- **分层记忆**：机器真值 `flow.json` ＞ 人读交接 `dev_last` ＞ 团队知识 `kb` ＞ 阶段产物 `plan/op/REV`；层间不复制细节。
- **写入只写增量**：节点/到期才写；状态未变不重写；交接摘要固定键、≤5 行。
- **恢复 ≤3 读**：`flow next`（1 次）+ `dev_last` 交接区（1 次）+ 当前阶段 plan/op（按需 1 次）。
- **入口先闸**：先 `feel_status`，无阶段先建；研究/方案也算流程任务。

## 4. 优化项（按 ROI；P0/P1/P2）

| # | 优化 | 改哪里 | 收益 | 成本/风险 | 验证指标 |
|---|---|---|---|---|---|
| **P0-1** | **入口闸（已实现 1.5.2）** | `dsh/lib/adapters/workflow-gate.js`、`dsh/lib/tools/index.js`、`dsh/lib/guard.js`、`dsh/lib/surface/prompt.js` | 无阶段研究/方案不可静默开始；违规从「无感」变「可拦 + 可审计」 | 可能误伤纯 docs？`docs/research/**` 才拦，普通 docs 不受影响；chore 不能绕过 | 研究写入拦截率 100%；拒绝审计条数；合法任务首轮建阶段率 |
| **P0-2** | **统一派发/返回契约** | `openfeel-delegation` / 子 agent 模板 / `dsh` 提示段 | 主会话上下文不被子任务细节挤占；子 agent 不重复探索 | 模板增加 ~200 字；过细会僵化 | 平均派发 prompt 字符；子 agent 返回行数；返工率 |
| **P0-3** | **恢复包（recovery bundle）** | `feel_status`/新增 `feel_recover`：返回 active stage/phase、last transition、handoff 摘要、next action | 新会话 1 次调用恢复；无需读 4 个文件 | CLI 多一次聚合（可缓存）；需避免与 `flow next` 重复 | 恢复耗时；恢复后首轮可执行率；读取字节数 |
| **P1-1** | **结构化交接 + 跳过未变更同步** | `dev-status.ts`、`openfeel-memory` | 交接可机读（done/block/next/decision）；减少无意义写 | 旧手写摘要兼容；字段过细形式主义 | 恢复后重探索次数；`dev sync` 写入次数/阶段 |
| **P1-2** | **日志摘要索引** | `flow-manager.ts`：保留 200 条明细 + 每 stage `last_transition/last_error/resume_count` | 跨会话不扫日志；`flow.json` 体积可控 | 双写一致性/迁移旧 flow | `flow.json` 字节；恢复读取日志字节；解析耗时 |
| **P1-3** | **快照 revision / stale 标识** | `flow next --json` 增加 `revision`/`snapshotAt`；适配器降级时标 stale | 减少并发误判、重复 CLI 调用 | JSON 契约变更（需版本化）；旧 CLI 兼容 | 每次调度 CLI 次数；revision 不一致率 |
| **P2** | **并行调度阈值 + 成本度量** | `workflow`/`subagent` 使用指南；metrics 增加 dispatch 计数 | 大任务并行提速；避免为并行而并行 | 协调成本；子 agent 重复读 | 每阶段墙钟；dispatch 次数；token 估算 |

## 5. 外部评审（Codex GPT-6.1-Sol，只读）

Codex 的拓扑判断与本地一致；其建议与本文取舍：

- **赞同**：入口闸应收敛为「CLI/适配器权威预检」，而不是只写在提示词里；交接摘要结构化（`done/block/next/decision`）；`flow next` 增加 revision/stale；日志保留明细 + 阶段摘要索引。
- **提醒（已纳入边界）**：`docs/research/**` 规则偏粗，普通 FAQ/会议纪要可能误伤——本实现只拦 `docs/research/**`，`docs/notes/**`、`docs/faq/**` 等普通文档不受影响；混合 patch 只要含研究产物且无阶段就拒绝（与「混合目标从严」一致）。
- **提醒（暂不采纳）**：按「内容实质是否为交付物」启闸需要语义判定，成本高且不稳定；1.5.2 先用路径 + 阶段，靠 1.5.3 的指标（建阶段后 10 分钟无产物 → 提示闸门滥用）纠偏。
- **提醒（延后）**：`general` 需求例外绑定 REQ 的放行规则，留到 1.5.3 与恢复包一起设计，避免现在开绕过口。

## 6. 迭代顺序

**1.5.2（本阶段）**
1. 入口闸：`workflowGate` + `docs/research/**` 无阶段拒绝 + 拒绝审计 + 提示段硬规则。
2. 文档/测试/发布（guard 58、verify 91、全量测试）。

**1.5.3（下一阶段，P0-2 + P0-3）**
1. 统一派发/返回契约（模板 + 适配器提示），返回 ≤10 行、禁止子 agent 读状态文件。
2. 恢复包：一次调用返回 active/phase、last transition、handoff 摘要、next action；`recover` 只读 1 次。

**1.5.4（P1）**
1. 结构化交接 + 跳过未变更同步。
2. `flow.log` 阶段摘要索引；再评估 `flow next` revision（涉及 JSON 契约，单独版本）。

## 7. 成本与指标（避免形式主义）

- 不新增每轮固定 CLI 调用：入口闸复用 `feel_status`；同步仍由 `flow advance` 触发。
- 记录：每次派发 prompt 字符数、子 agent 返回行数、每阶段 CLI 调用数、恢复读取字节数、`plan_pending` 停留时长。
- 反模式告警：建阶段后 10 分钟无产物 / 阶段长期 `plan_pending` → 提示「闸门滥用」，不继续加字段。
