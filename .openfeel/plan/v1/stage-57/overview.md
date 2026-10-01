# v1.1.2-stage-57 — 发布收尾（CI 修复 + CI 可观测性 + README 更新）

## 目标

> v1.1.2 **发布收尾**。用户授权推送 `f178600` 后 **CI run #51 失败**（两个 `build-and-test` matrix job 均在 `npm test` 步骤失败；`publish` job 被 skip），1.1.2 实际未发布。本阶段：① 修 CI 失败（**T32 盘符用例平台化**）；② 补 CI 失败注解可观测性（Actions 日志需认证，注解可经 API 自助诊断）；③ 更新三份滞后 README；④ 本地回归 + 给出「可推送」结论（**由 Feel/用户推送，本阶段不代推**）。**不含实际 `npm publish`**。

## 依赖

- **hard**：`v1.1.2-stage-56`（已归档）

## 范围约束

- 允许改：`test/core/config.test.ts`、`.github/workflows/ci.yml`、`README.md` / `README.zh-CN.md` / `README.en.md`。
- **不改**：`flow.json`、实现语义（`src/core/config.ts` 零改动）；**不代 Feel 推送**；**不执行 `npm publish`**；**不创建 op 文件**。

## 实测证据（唯一事实基准）

| 项 | 值 |
|----|----|
| CI run #51（`f178600`） | 两 matrix job（Node 20.x/22.x）**failure**，失败步骤 = `npm test -- --reporter=verbose`；`publish` **skipped** |
| 本机 Windows | `npm test` **985 用例全绿 / 0 skipped**；单文件 `config.test.ts` **37 passed** |
| **根因** | `test/core/config.test.ts:514-529` T32 用 `ensureProfileDefaults('C:\\Proj\\X')`，POSIX 下非绝对路径 → 去重 key ≠ 预置 `c:/proj/x` → 失败；**Windows 盘符专属** |
| README 陈旧 | `:149` 写「790 用例 / 54 文件」（实测 59 文件）；无 v1.1.2 信息；`project` 写 `(list / info)`（实测仅 `overview`）；架构未反映全局部署 |
| `flow phases --json` | 顶层 **5 键** |

## 操作方案

| op | 主题 | 覆盖 | 依赖 |
|:--:|------|------|------|
| **op-001** | **CI 修复 + 可观测性** | C1（T32 拆为「跨平台」+「Windows 专属 `it.skipIf`」）+ C2（`set -o pipefail` + `tee` + `if: failure()` 注解） | — |
| **op-002** | **README ×3** | C3（测试数 / v1.1.2 新增能力 / 命令表修正 / 架构与工作区分层 / 免责声明），共 28 处 | hard: op-001 |
| **op-003** | **回归 + 推送验证** | C4（`build` 幂等不复活 / `npm test` / `tsc` 0 / `lint i18n` 726 / `lint kb` 0 / `flow phases --json` 5 键 + 「可推送」结论/命令） | hard: op-001、op-002 |

**顺序**：`op-001 → op-002 → op-003`。

详细计划见 `.openfeel/plan/v1/stage-57/plan.md`。
