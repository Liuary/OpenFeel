# v1.5.5-stage-113 计划 — 批次：preflight 账本 + 适配器补闸 + 禁止 shell 写状态 + 审查独立性

- **阶段**：`v1.5.5-stage-113`（fast；**批次发布，全部完成才发 1.5.5**）
- **关联需求**：REQ-014
- **基线**：v1.5.4（HEAD `0925171`）；83/2024；dsh 42+95+58+10=205
- **根因**：1.5.4 阶段流程走了，但调度流程没走——没有先 `feel_status/feel_next`、没派子 agent、用 shell CLI 绕过适配器、用自审代替独立审查。

## 1. CLI preflight 账本（P0）

- 新增 `src/core/preflight.ts`：
  - `.openfeel/dev/.preflight.json`：`{at, stage, phase, revision}`；
  - `recordPreflight()`（`flow next` / `flow status` 保存）；
  - `checkPreflight()`：有效窗口 **10 分钟**；mode = `OPENFEEL_PREFLIGHT`（`off|warn|strict`，默认 `warn`）。
- 写命令校验：`flow advance`、`plan stage add`、`req add`、`req claim`：
  - `strict` + 缺失/过期 → `PREFLIGHT_REQUIRED`（exit 1，提示 `flow next`）；
  - `warn` → 仅 TTY stderr 提示（不破坏脚本/测试）；
  - `off` → 不检查。
- 本仓与 DSH 适配器调用默认 **strict**（适配器 CLI 执行器注入 `OPENFEEL_PREFLIGHT=strict`；用户 shell 默认 warn）。

## 2. 适配器补闸（P0）

- `feel_status` / `feel_next` 返回 `preflight`（`ok/at/ageMs/mode`）。
- 适配器 CLI 执行器注入 strict：`feel_*` 写命令必须先有近期 `feel_status`/`feel_next`（`flow next/status` 会写账本）。
- 提示段：**禁止用 shell 调 `openfeel flow/stage/req` 写命令**（会绕过 preflight）；状态写操作只用 `feel_*`。

## 3. 审查独立性（P1）

- 提示段：fast 单轮审查也应由**独立 reviewer** 完成；Feel 自审必须在 REV 标题标注 `self-review`，归档摘要记录自审原因。
- 无法机器判定 actor，先做提示与审计约定；后续有指标再考虑强制。

## 4. 测试/文档/发布

- 单元：`test/core/preflight.test.ts`（记录、过期、模式、损坏降级）；flow advance strict 行为可用 env 注入测试。
- 适配器 verify：`preflight` 字段存在；提示段含禁 shell 写与自审标注。
- 文档：CHANGELOG/VERSIONS/README/GETTING_STARTED、dsh README/ADAPTER、cli-usage skill、`docs/commands.md`（preflight 语义）。
- 版本 1.5.5，单次发布。

## 验收

- a) `flow next` 后 `.preflight.json` 存在；10 分钟后 `checkPreflight` 失效。
- b) `OPENFEEL_PREFLIGHT=strict` 下，未 preflight 的 `flow advance`/`plan stage add` 拒绝（`PREFLIGHT_REQUIRED`），提示 `flow next`；有 preflight 则通过。
- c) 默认 `warn` 非 TTY 静默，不破坏脚本；适配器调用 strict。
- d) `feel_status`/`feel_next` 含 `preflight`；提示段含「禁止 shell 写状态」「自审标注」。
- e) 全门禁绿；1.5.5 单次发布。
