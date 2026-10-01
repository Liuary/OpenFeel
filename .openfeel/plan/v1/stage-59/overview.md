# v1.1.2-stage-59

## 目标

> 修复 CI 环境守卫误报，让 CI 转绿并发布（1.1.2）。
> **根因（决定性复现）**：stage-58 新增「运行日志默认开启」后，`bin/openfeel.js` 每次运行写 `~/.openfeel/cli/logs/` + `~/.openfeel/locks/`；而 `build-and-test` 的守卫窗口（`Env snapshot` → `Env guard`）内包含 **非测试步骤** `Version consistency guard`（`node bin/openfeel.js --version`）与 `lint i18n` → 干净 runner 上 `~/.openfeel` 由 `ABSENT` 变为「存在」→ `Env guard` **误报**（`环境被测试改动：/home/runner/.openfeel`）。**非测试污染**：只跑 `npm test` 零写盘（已实测）。

## 依赖

- hard: `v1.1.2-stage-58`（已归档；本阶段修复其引入的运行日志在 CI 守卫窗口内的副作用）

## 操作方案

> 2 op，顺序 `op-001 → op-002`。改动限定 `.github/workflows/ci.yml` 单文件。

| op | 主题 | 覆盖 |
|:--:|------|------|
| **op-001** | CI 修复（守卫误报） | M1~M6：3 处注入 `env: OPENFEEL_LOG: '0'`（`build-and-test` 的 `Version guard`/`lint i18n` + `publish` 的 `Version guard`）+ `Env snapshot` 下移至 `lint i18n` 后、`Test` 前 + 快照三态加固（`ABSENT`/`EXISTS-EMPTY`/清单） |
| **op-002** | 回归 + 可推送结论 + 阶段报告 | WSL 本地守卫窗口三场景对照（S1 空 / S2 空 / S3 非空复现）+ 门禁（build 幂等 / test 61·1018·0 / tsc 0 / lint i18n 730 / lint kb 0 / YAML 自检）+「可推送」结论与 CI 确认步骤 |

## 边界

- 不改 `flow.json`；不改 `src/**`/`test/**`/`package.json`；**不改实现语义**（运行日志默认开启为用户裁定，保留）。
- 不代 Feel 推送；不执行 `npm publish`（由 CI 自动）；不创建 op 文件（由 openfeel-schemer 产出）。
- 不新增 job/步骤；不改 coverage 与 stage-57 失败注解；不改 CI runner / Node matrix；不新增依赖。

## 关键改动表（`.github/workflows/ci.yml`）

| # | 位置（修复前） | 改动 |
|:-:|----------------|------|
| M1 | `:33-34` `Version consistency guard` | 加 `env: OPENFEEL_LOG: '0'` |
| M2 | `:42` `node bin/openfeel.js lint i18n` | 加 `env: OPENFEEL_LOG: '0'`（保持匿名 `run`） |
| M3 | `:113-115` `publish` 的 `Version consistency guard` | 加 `env: OPENFEEL_LOG: '0'` |
| M4 | `:19-32` `Env snapshot (before test)` | 下移至 `lint i18n`（`:42`）后、`Test`（`:43`）前 |
| M5/M6 | `:22-30` / `:78-82` 守卫 exists 分支 | 三态加固（空清单写 `EXISTS-EMPTY` 固定标记，两处同批一致） |

> `Env guard` 的 after 快照仍在 `Test` + `Coverage` 之后（`:71`）。评估结论：下移**不削弱**守卫（目标 = 「测试不得污染真实环境」；新窗口恰为目标范围）。

> 详细计划见 [plan.md](plan.md)。
