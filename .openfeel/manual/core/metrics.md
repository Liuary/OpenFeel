# Agent 性能指标（metrics）

> 模块文档，由归档官在归档时维护。对应源码：`src/core/metrics.ts`（**v1.2.1-stage-86 op-001 接线**；模块本体创建于更早阶段）。

## 职责

记录每个 Agent 的**执行耗时 / 成功率 / 重试次数**，持久化到 `.openfeel/metrics.json`（与 `flow.json` 同级），供 `flow metrics` 消费——为 v1.2.1 的 **度量基线**提供 run 级数据（agent 归属 + phase 窗口耗时）。

## 核心 API

| 导出 | 签名 | 用途 |
|------|------|------|
| `PHASE_AGENT_MAP` | `Readonly<Record<string, string>>` | **phase → 负责 Agent 映射**（T1 归属口径，**10 键**；`*_passed` / `done` / meta 等**不入表 = 跳过不记**） |
| `AgentMetrics` | `interface` | 单 Agent 指标（`agentName` / `totalRuns` / `successfulRuns` / `failedRuns` / `totalRetries` / `totalDurationMs` / `avgDurationMs`） |
| `MetricsStore.getInstance(dataDir?)` | `static` | 单例（**按 `dataDir` 缓存**，缺省 `<cwd>/.openfeel`，避免跨项目复用首次固化路径） |
| `MetricsStore.resetInstance()` | `static` | 重置单例（**仅测试用**） |
| `store.recordRun(agentName, durationMs, result, retries=0)` | — | 记录一次 Agent 运行（累加 run/duration/retry，重算 `avgDurationMs`） |
| `store.getAgentMetrics(agentName?)` | — | 单个 / 全部指标 |
| `store.summary(lang='zh-CN')` | — | 人类可读摘要（i18n；末尾含**口径注记**） |
| `store.getSummaryData()` | — | 结构化摘要（供 `flow metrics --json`；键名与 `summary()` 一致 + `successRate`，无数据为 `null`） |
| `store.load()` / `store.save()` | — | 读 / 写 `.openfeel/metrics.json`（`save` 仅**原子写、不加锁**——低并发非关键路径） |

### `PHASE_AGENT_MAP`（10 键全集）

`plan_pending` / `plan_review` → `openfeel-planner`；`scheme_pending` / `scheme_review` → `openfeel-schemer`；`exec_running` → `openfeel-executor`；`review_pending` / `review_failed` → `openfeel-reviewer`；`test_pending` / `test_failed` → `openfeel-feel-tester`；`archiving` → `openfeel-archiver`。其余（`*_passed` / `done` / meta）**跳过不记**。

## 接线（T1，v1.2.1-stage-86）

- **调用点落命令层**（`src/commands/flow.ts` advance 逐步推进循环内、`mgr.save()` 之后）——因 `metrics.ts:10` 已 `import { normalizeAgentName } from './flow-manager.js'`，**core 反向接线必成 import 环**；**core 的 `flow-manager` 零 import `metrics`**。
- **duration 口径**：被退出 phase 的**窗口耗时** = now −「**进入该 phase 的那次转换**」时间——按 `detail.to === 被退出 phase` 回扫 `[0, logLenBefore)`（上界快照排除本次写入）+ `plan_pending` 兜底 `register_stage`；**无基线 → 跳过不记**（不写 0 值污染 avg，`debug` 级留痕）。
- **参数口径**：`result = 'success'`、`retries = 0`（不挪用 `pipeline.retry`）。
- **写盘**：命令层仅在「本命令内确有记录」时 `save()` 一次；`--dry-run` 分支提前 return → **字节级零写盘**（本模块零副作用）。
- **已知边界（登记）**：`flow stage reset` / `flow attempt` 自动改道 / deprecated `advancePhase` **未接** `recordRun`（口径一致但记录遗漏，留痕待后续）。

## 口径注记（i18n 键 `metrics.summary.caliberNote`）

`summary()` **仅在有数据分支**末尾追加一行注记：「耗时口径 = phase 窗口（含跨会话闲置 / 等待），**非 agent 纯执行时长**」——`getSummaryData()`（`--json`）**零改动**（契约逐字不变）。判读须与 `flow.json` 审计的 `resumed` 标注（跨会话恢复）联合解释。

## 变更历史

| 阶段 | 变更 |
|------|------|
| v1.2.1-stage-86 | **接线**：`PHASE_AGENT_MAP` 单点常量（10 键）新增导出；`summary()` 追加口径注记行（i18n +1 键）；调用点落 `commands/flow.ts`（core 零改动）；`getSummaryData()` / `--json` 契约不变 |
