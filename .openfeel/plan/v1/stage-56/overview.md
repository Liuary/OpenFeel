# v1.1.2-stage-56 — 发布前收尾（遗留清理 + skill 全量对齐 + 全局刷新 + 发布就绪）

## 目标

> v1.1.2 **发布前最后一轮收尾**：逐条**实测验证**并清掉发布前应修的遗留项（`flow phases --json` 键数文案、`openfeel-cli-usage` skill 全量对齐、5 条 trivial REV、Bug 索引计数），随后 `npm run build` 传播 + 备份并 `openfeel setup` 刷新全局副本，最后跑回归门禁并复核发布就绪。**不含实际 `npm publish`**（由用户决定）。

## 依赖

- **hard**：`v1.1.2-stage-55`（已全部闭环，全局 phase = `done`）

## 范围约束

- 允许改：`templates-data/**`（skill + agents-md）、`docs/**`、`.openfeel/**`、`manual/**`、`CHANGELOG.md`、`build.js`（注释）、`src/core/managed-region.ts`（注释）。
- **不改**：`flow.json`、业务源码；**不创建 op 文件**；**不执行 `npm publish`**。
- 全局刷新（`openfeel setup`）为**本阶段唯一触碰真实全局目录的操作**，须先备份。

## 实测基线（本轮命令复核）

| 项 | 值 |
|----|----|
| `flow phases --json` | **5 键**（`schemaVersion`/`phases`/`transitions`/`advanceAccepted`/`transitionsDiff`） |
| `npm test` | **59 文件 / 985 用例 0 skipped** |
| `tsc` | **0** |
| `lint i18n` | **726 键**（exit 0） |
| `lint kb` | **0 过期**（248 引用） |
| `--version` / `npm pack` | **1.1.2** / **263 文件 · 554.5 kB** |
| 全局 skills / agents | **17 / 9**（skill 含 markers，与源非逐字节相等） |
| 私域 Bug 文件数 | **17**（公域索引仅 15） |

## 操作方案

| op | 主题 | 覆盖 | 依赖 |
|:--:|------|------|------|
| **op-001** | skill 对齐 | S2 + S1-1（16 项补全 / `:82` 修正 / 过时表重写 / description / `:46` 5 键） | — |
| **op-002** | 模板与文档同步 | S1-2~4（docs/manual/CHANGELOG 键数） | — |
| **op-003** | 5 条 REV | S3（3 修：en.md/managed-region 注释/backup.md；2 已解决登记；REV 状态留痕） | — |
| **op-004** | 索引与全局刷新与门禁 | S1-5 + S4 + S5 + S6（build 传播 / bug 索引 / 备份+setup / test·tsc·lint·pack） | op-001、op-002、op-003 |

**顺序**：`op-001 → op-002 → op-003 → op-004`（**硬约束**：build 与本地门禁通过后才备份 + `setup` 刷全局）。

详细计划见 `.openfeel/plan/v1/stage-56/plan.md`。
