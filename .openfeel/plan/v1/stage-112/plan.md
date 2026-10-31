# v1.5.4-stage-112 计划 — 批次：日志摘要 + 快照 revision/stale + 指标 + 闸门滥用提示

- **阶段**：`v1.5.4-stage-112`（fast；**批次发布：全部完成才发 1.5.4**）
- **关联需求**：REQ-013
- **基线**：v1.5.3（HEAD `8267ab8`）；82/2022；dsh 42+93+58+10=203
- **依据**：`docs/research/dispatch-persistence-2026-10-31.md` 的 1.5.4 项

## 1. 日志阶段摘要（P1-2，CLI 侧）

- `FlowManager` 新增 `stageLogSummary(stageId)`：从 `flow.log`（最近 200 条明细）派生
  `lastTransition`（from/to/time）、`lastError`（最近 review_failed/test_failed）、`resumeCount`（resumed 次数）。
- `openfeel flow log <stage>` 人类输出末尾追加摘要（**不改 `--json` 契约**）。
- 恢复包（adapter）复用同一派生逻辑（读 flow.json，不新增 CLI 调用）。

## 2. 快照 revision / stale（P1-3，adapter 侧）

- `readSnapshot` 读取 `.openfeel/flow.json` 的 `revision` 与 mtime，返回
  `revision` / `snapshotAt` / `stale`（`flow next` 缺失或回退时为 true）。
- **不改 `flow next --json` 键集**（避免契约破坏）；CLI 侧 revision 已在 flow.json 中，按需读取。
- `feel_status` / `feel_next` 暴露上述字段；stale 时 summary 增加提示。

## 3. 指标（P1/P2，零运行时开销）

- `openfeel flow metrics` 人类输出追加「观测」块：`flow.log` 条目数/字节、当前阶段最近转换时间、活跃阶段数。
- `flow metrics --json` **键集不变**（新增内容仅人类输出），避免 JSON 契约变更。

## 4. 入口闸滥用提示（P0 边界）

- `feel_next` / `feel_status` 在 `plan_pending` 且最近转换 >10 分钟时，`adapterHints` 增加
  「阶段可能在空转：有产物就推进，没有就合并/取消；不要为过闸而建空阶段」。
- 不做 `general` 需求例外（Codex 建议留到有指标后再定），避免开绕过口。

## 涉及文件

- `src/core/flow-manager.ts`（`stageLogSummary`）、`src/commands/flow.ts`（log 摘要 + metrics 观测块）
- `dsh/lib/adapters/dashboard.js`（revision/stale + plan_pending 空转提示）、`dsh/lib/adapters/recovery.js`（扩展摘要字段）
- 测试：`test/core/flow-manager*.test.ts`、`test/commands/flow.test.ts`、`dsh/test/verify.js`
- 文档：`docs/VERSIONS.md`、CHANGELOG、README/GETTING_STARTED、dsh README/ADAPTER、`docs/commands.md`、cli-usage skill

## 验收

- a) `flow log <stage>` 人类输出含 last transition / last error / resume 次数；`--json` 契约零变化。
- b) `feel_status.revision` 为数字、`snapshotAt` 为 ISO、`stale` 布尔；stale 时 summary 有提示。
- c) `flow metrics` 人类输出含日志条目/字节与最近转换；`flow metrics --json` 键集不变。
- d) `plan_pending` 超过 10 分钟时 `feel_next.adapterHints` 含空转提示。
- e) 全门禁绿；1.5.4 单次发布。
