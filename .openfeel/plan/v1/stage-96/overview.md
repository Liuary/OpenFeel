# v1.2.2-stage-96

## 目标

调度决策权威（v1.2.2 四阶段之二 · 决策权威 / P0）：新增只读命令 `flow next [--json]`（12 键固定序：负责 Agent / 合法下一相位 / 建议命令 / 守卫 / 阻塞 REV）；`flow status --json.stages[]` 追加 5 调度属性（`workflowMode` / `requirementId` / `reviewTier` / `effectiveReviewTier` / `opsSummary`）；`flow phases --json` 显式区分展示档位与生效档位；核心层公开三单点（`getResponsibleAgent` / `listStageBlockingOpenReviews` / `DEFAULT_EFFECTIVE_REVIEW_TIER`），消除适配器侧 `PHASE_AGENT_MAP` 镜像与文本决策。既有 18 个 JSON 出口、人类输出与 phase 枚举/转移表零回归。

## 依赖

- **hard**：`v1.2.2-stage-95`（契约助手 / 错误封装 / JSON 模式单点已冻结）。下游 stage-97（读命令 `--json` 补全）与 stage-98（文档与版本收口、DSH 端到端验收）复用本阶段字段与口径。

## 操作方案

| op | 主题 | 状态 |
|:--:|------|:--:|
| [op-001](ops/op-001.md) | 调度单点方法 + `flow next`（契约第 19 出口） | done |
| [op-002](ops/op-002.md) | `flow status --json.stages[]` 调度属性 + `flow phases --json` 档位消歧 | done |
| [op-003](ops/op-003.md) | i18n 收口、REV 处置登记、零回归取证与阶段门禁（阶段末 op） | done |

- 执行序恒为 op-001 → op-002 → op-003（hard 依赖 + 文件互斥，详见 [ops/deps.yaml](ops/deps.yaml)）。
- 门禁实测：74 文件 / 1809 用例全绿（基线 1779，+30）、`tsc` 0、`lint i18n` 969（+19）、`lint kb` 0 过期 / 604 引用、build ×2 幂等、`--version` 1.2.1。
- 契约计数：成功 JSON 出口 **19**（flow 12）/ 注册 `--json` 选项 **20**。
- 归档摘要：[`../../../log/archive-v1.2.2-stage-96.md`](../../../log/archive-v1.2.2-stage-96.md)。
