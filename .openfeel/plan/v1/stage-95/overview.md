# v1.2.2-stage-95

## 目标

JSON 输出契约与错误封装基础设施（v1.2.2 四阶段之一 · 基础设施 / P0）：冻结 18 个既有 `--json` 成功出口的「单文档 + `schemaVersion` 首键 + 键序」契约；新增统一错误层（`code` + `kind ∈ {refusal,internal}`，退出码 0/1/2/3，legacy 载荷末尾追加 `errorKind`）；交付 `--version --json` 与全局 `--project <path>`（预扫描 `chdir` 单点）。本阶段不改任何既有命令的人类输出与业务判定。

## 依赖

无（上游 `v1.2.1-stage-94` 已 done；flow.json `deps=[]`）。下游 stage-96/97 复用契约助手与错误层，stage-98 收口文档多载体与 DSH 端到端验收。

## 操作方案

| op | 主题 | 状态 |
|:--:|------|:--:|
| [op-001](ops/op-001.md) | JSON 契约助手、18 出口冻结审计与契约正文 | done |
| [op-002](ops/op-002.md) | 错误层与 runCli 统一入口（退出码 0/1/2/3 + legacy errorKind） | done |
| [op-003](ops/op-003.md) | 全局 `--project` 与 `--version --json` | done |
| [op-004](ops/op-004.md) | i18n 收口、零回归取证与阶段门禁（阶段末 op） | done |

- 执行序恒为 op-001 → op-002 → op-003 → op-004（hard 依赖 + 文件互斥，详见 [ops/deps.yaml](ops/deps.yaml)）。
- 门禁实测：74 文件 / 1779 用例全绿、`tsc` 0、`lint i18n` 950、`lint kb` 0 过期 / 624 引用、build ×2 幂等、`--version` 1.2.1。
- 归档摘要：[`../../../log/archive-v1.2.2-stage-95.md`](../../../log/archive-v1.2.2-stage-95.md)。
