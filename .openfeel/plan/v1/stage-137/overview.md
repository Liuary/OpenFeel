# v1.6.4-stage-137

## 目标

清理 1.6.3 收口留下的三项文档/死代码小债，**零行为变更**（只动文案、死分支与文档）：

1. **model 死文案 + 死分支**：模型两层化后 `inconsistent` 恒 `false`、`byScope.default` 恒 `null`，i18n 的 `model.get.inconsistent` / `model.get.shadowed` 仍写「以 frontmatter 为准」「用 --scope default」，`src/commands/model.ts` 对应三段分支已不可达 → 删文案、删分支，但**保留** `GetModelResult` 的 `inconsistent` / `byScope.default` 字段与 `get --json` 键序（A71.2 契约）。
2. **ADAPTER 验证计数**：`dsh/ADAPTER.md:294-302` 仍停在 v1.6.0 快照（53/129/180/10）→ 按实测更新为 contract 54 / verify 136 / guard 193 / preflight 10 / integration 跳过，并标快照日期。
3. **config models 迁移提示**：1.6.2 起 `init` 不再生成 `models:` 段，存量项目旧段不生效且受 guard 保护（agent 不能改）→ 文档给出「人工整段删除 + 重启会话 + `config get --all` 确认」的操作说明。

依据：REQ-071（A71.1—A71.6），详见 `plan.md`。

## 关联需求

| 需求 | 标题 | 判据 |
|---|---|---|
| REQ-071 | 1.6.4 清理债：model 死文案/死分支 + ADAPTER 验证计数 + config models 迁移提示 | A71.1—A71.6 |

## 节奏

fast 模式，单需求拉通，**严格串行**（T2/T4 同写 `dsh/ADAPTER.md`，必须分区先后）：

| 步 | 任务 | 产出 |
|---|---|---|
| S1 | T1 死文案 + 死分支 | `src/commands/model.ts`、`src/core/i18n-data/{zh-CN,en}.ts`（+ `model-config.ts` 注释） |
| S2 | T2 ADAPTER 验证计数 | `dsh/ADAPTER.md`（仅 :294-302） |
| S3 | T3 config models 迁移提示 | `docs/GETTING_STARTED.md` |
| S4 | T4 版本与发布文档 | `CHANGELOG.md`、`docs/VERSIONS.md`、`docs/releases/v1.6.4.md`、`dsh/ADAPTER.md`（:18 + 文末新节）、两包 `package.json`、`package-lock.json` |
| S5 | 全量门禁 | `tsc --noEmit` / `npm test` / `build`×2 / dsh 五测 / `lint i18n` / `release --dry-run --skip-build`（reviewer 独立复跑） |

## 验收

- **A71.1/A71.2**：i18n 两文件 `frontmatter` 零命中、`model.ts` `inconsistent|shadowed` 零命中；`model get/list --json` 键序不变、`get --scope default --json` = `model:null,source:null`；`json-contract.test.ts` / `model-config.test.ts` / `model.test.ts` 全绿（无需改测试）。
- **A71.3**：`dsh/ADAPTER.md` 验证段 = contract 54 / verify 136 / guard 193 / preflight 10 / integration 跳过 + `2026-11-26` 实测标注。
- **A71.4**：`docs/GETTING_STARTED.md` 命中「models 段 / 整段删除 / 受 guard 保护 / 重启会话」，且不给可抄的 `models:` 示例。
- **A71.5**：两包 1.6.4 lockstep（`requiresCli >=1.6.4`）、lockfile `:3`/`:9`、CHANGELOG `## [1.6.4]`、VERSIONS 中英各一段、`docs/releases/v1.6.4.md` 存在；全量门禁全绿；push master 后 CI 自动发布（人类执行）。
- **A71.6**：diff 复核零行为面改动（model-config 逻辑 / guard / flow / `emitJson` 键 / 测试均未动）。

## 风险

- **删分支打穿 JSON 契约**：只删 CLI 打印分支，`inconsistent` / `byScope.default` 字段与 `get --json` 键序保留；误删字段即回退（A71.2 硬门）。
- **删 i18n 键**：`zh-CN` / `en` 必须双侧同删（`lint i18n` 查键一致）；被拒时走 G1 退化（保留键位、文案改「框架不提供 default 层」）。
- **ADAPTER 计数再次漂移**：计数先跑后写并标快照日期；`dsh/README.md:310-313`（54/136/**191**/10）与 `ACTION-GUIDE.md:79` 为同源旧值，登记待 lead 裁决。
- **文档多处版本引用漏改**：7 处一次改完；漏一处 `release --dry-run --skip-build` 的版本一致性检查即 exit 1。
- **契约面误伤**：`toJsonModel` 的 default 兜底、`src/core/config.ts` 的 ModelsSchema / 只读兼容不动。

## 依赖

REQ-070（v1.6.3，已完成：default 层移除、两层语义）为语义前置；REQ-069（v1.6.2，config 模板不预设模型）为 `models:` 迁移提示的事实前置。无其它阶段依赖；不动提示词、发布链路与 guard 规则。

## 操作方案

按 `plan.md` §二 的单写者矩阵执行 T1→T2→T3→T4→S5；每步收尾立即跑对应 C1—C6 取证，执行中偏差按 `REQ-071.plan.md` 的「偏差与回写」格式登记。`git push` / tag / `npm publish` 归人类（push master 后由 CI 发布 1.6.4）。
