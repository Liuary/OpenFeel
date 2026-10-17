# v1.2.2-stage-97

## 目标

- **阶段主题**：读命令 `--json` 全量补全（v1.2.2 四阶段之三 · 读命令补全）
- **核心交付**：13 个读命令面新增 `--json` → **14 个新成功出口（#20~#33）**；`req list --json` 末位追加 `linkedStages` / `progress`；`flow archive` 判据明细三新键；`archive <stage> --json`；新 `--json` 失败路径接入 stage-95 错误 envelope。
- **计数权威**：成功出口 **19 → 33**；注册 `--json` 选项 **20 → 34**（源码 / 契约 §7 / 冻结测试三处对齐）。
- **不变量**：人类输出逐字不变（28/28 场景 diff 0）；既有 19 个成功出口零删除/零重排/类型零改；`--dry-run` 零写盘；`flow.json` 零注入。

## 依赖

- `v1.2.2-stage-95`（done / 已归档）：JSON 契约助手与统一错误层。
- `v1.2.2-stage-96`（done / 已归档）：`flow next` 与调度属性；本阶段只读不改。
- op 内部依赖：op-001 → op-002 → op-003 → op-004（hard 依赖 + 文件互斥，恒串行）。

## 操作方案

| op | 主题 | 结果 |
|:--:|------|:--:|
| op-001 | T1 flow/stage 读命令（5 个）：`stage status` / `flow recover` / `flow checkpoint list` / `flow log` / `project overview` | done（14:04） |
| op-002 | T2 knowledge/config/view/plan 读命令（8 个） | done（14:11） |
| op-003 | T3 `req list` 关联阶段 + T4 `flow archive` 判据明细 + T5 `archive <stage> --json` | done（14:27） |
| op-004 | T6 契约登记 / 33 出口冻结测试 / REV 覆盖 / 门禁（阶段末 op） | done（14:30） |

- 方案与依赖详见 `ops/{op-001~004}.md` + `ops/deps.yaml`。

## 门禁

| 项 | 实测 |
|----|------|
| `npm test` | 74 文件 / **1894 用例** / 0 failed / 0 skipped（基线 1809，+85） |
| `npx tsc --noEmit` | 0 errors |
| `lint i18n` | **983** 键一致（基线 969，+14） |
| `lint kb` | 0 过期 / 614 引用 |
| `npm run build` ×2 | 幂等（dist SHA256 一致） |
| `--version` | 1.2.1（版本收口归 stage-98） |

## 审查与验收

- 审查：**passed**（REV-97-001~006 闭环；0 blocking）。
- 验收：**通过**（必验 8/8；**Bug 0**；3 项非阻塞观察登记）。

## 归档

- 归档摘要：[archive-v1.2.2-stage-97.md](../../../log/archive-v1.2.2-stage-97.md)
- 归档时间：2026-10-17；状态：`archiving`（phase=done 由 Feel 经 CLI 推进）。
