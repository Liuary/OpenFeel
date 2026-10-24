# 版本能力概览 — OpenFeel

> 本文是**面向用户的版本能力概览**：每个版本「是什么、能做什么、如何升级」。
> 逐版本完整明细（Added / Changed / Fixed、技术细节、阶段 ID）见 [CHANGELOG.md](../CHANGELOG.md)。
> 两者分工：**VERSIONS = 用户视角摘要；CHANGELOG = Keep a Changelog 明细**。本文不记录测试计数与内部审查编号。
> 覆盖范围：README 曾展示的版本（v1.1.2 起）；更早版本（v1.0.0 / v1.1.0 / v1.1.1）见 [CHANGELOG.md](../CHANGELOG.md)。

## English highlights

OpenFeel is a CLI for AI-agent development process governance. Recent releases:

- **v1.3.2** — DSH activation + write guard: `ctx.tools.guard()` denies `edit` / `write` / `apply_patch` / `str_replace_editor`; non-OpenFeel workspaces get a bootstrap prompt, and `enforce=always` blocks writes until `openfeel init` (`project` / `off` opt-out).
- **v1.3.1** — DSH deploy hotfix: `setup --tools dsh` now runs `pnpm install` with `--no-frozen-lockfile`, so stale profile lockfiles no longer block deployment.
- **v1.3.0** — The DSH adapter now ships inside the `openfeel` package; `openfeel setup --tools dsh` installs it into DSH profiles. README was slimmed: version notes moved here.
- **v1.2.4** — Data-safe `archive <stage>` overwrite protection (`ARCHIVE_EXISTS` / `--force`), JSON output for the remaining read commands, and `config get --all`.
- **v1.2.2 / v1.2.3** — Machine-readable JSON contract (`flow next`, error envelopes, exit codes 0/1/2/3) and its concurrency/test-seam fixes.
- **v1.2.1** — Requirement intake/splitting (`req`), three workflow modes (`full` / `fast` / `general`), review tiers.
- **v1.2.0** — Version-shard archiving (`flow archive`) and requirement flow (`req`).
- Upgrade: `npm i -g openfeel@latest` → `openfeel setup` → restart the harness.

## v1.3.2 — DSH 激活与写入门禁

- **`ctx.tools.guard` 写入门禁**：同步拒绝 `edit` / `write` / `apply_patch` / `str_replace_editor`。`.openfeel/**` 流程产物任意阶段可写（`flow.json` / `status.md` 除外）；外部源码要求 `exec_running`；无活跃阶段拒绝（general 需求例外）。
- **非项目 bootstrap**：`activation=auto` 时未初始化工作区注入短提示（只读可进行；写文件按 `enforce` 说明），不再静默。
- **默认 `enforce=always`**：无 `.openfeel` 时也拒绝文件写入，防止绕过 `openfeel init`；`project` / `off` opt-out。
- **边界**：`pwsh` / `bash` 默认不守，仍是显式逃生通道；`apply_patch` 混合/无头保守拒绝。
- **升级**：`npm i -g openfeel@latest` → `openfeel setup --tools dsh` → 重启 DSH。详见 [CHANGELOG](../CHANGELOG.md#132---2026-10-24)。

## v1.3.1 — DSH 部署热修复（frozen-lockfile）

- **`setup --tools dsh` 修复**：profile 的 `openfeel-dsh` `link:` 目标变化会使 `pnpm-lock.yaml` 过期；内部 `pnpm install` 增加 `--no-frozen-lockfile`，不再被 `ERR_PNPM_OUTDATED_LOCKFILE` 阻断。
- **行为边界**：保留写前备份、失败回滚 `package.json`、幂等跳过与多 profile fail-fast；失败时 lockfile / `node_modules` 可能保留部分更新，下一次 `setup` 收敛。
- **升级**：`npm i -g openfeel@latest` → `openfeel setup --tools dsh` → 重启 DSH。详见 [CHANGELOG](../CHANGELOG.md#131---2026-10-17)。

## v1.3.0 — DSH 适配器单包分发 + README 重构

- **DSH 适配器随包分发**：`openfeel` npm 包现已包含 `dsh/` 运行文件；不再需要单独的 `openfeel-dsh` 包。
- **`openfeel setup --tools dsh`**：把适配器以 `link:` 依赖写入 DSH profile、追加 `dsh.profile.bundles`、按需执行 `pnpm install`，并提示重启 DSH 宿主。支持 `--dsh-profile <name>` 窄化；默认部署全部已检测 profile。
- **`openfeel update --tools dsh`**：明确拒绝并指引使用 `setup`（DSH 是全局部署，不属于项目 update）。
- **适配器位置参数修复**：修复 6 处把空字符串当 flag 的问题（`feel_op create` / `register`、`checkpoint list`、`config effective`、`scheme list`、`roadmap show` 带位置参数时不再错误）。
- **README 瘦身**：版本能力章节迁出至本文件，由 README 索引；新增 DSH 安装说明与「需求 + 快速迭代」推荐用法。
- **升级**：`npm i -g openfeel@latest` → `openfeel setup --tools dsh`（可选 `--tools opencode,dsh`）→ 重启 DSH。详见 [CHANGELOG](../CHANGELOG.md#130---2026-10-17)。

## v1.2.4 — 归档覆盖保护 + 读命令 JSON 收口

- **归档覆盖保护（数据安全）**：`openfeel archive <stage>` 对已存在的归档文件默认拒绝覆盖（`ARCHIVE_EXISTS`、零写盘），显式 `--force` 才覆盖。
- **`plan stage list --json`**：阶段调度视图（七键）。
- **`model list|get --json`**：模型配置的 provider / model / 生效来源。
- **`flow retry` / `lint i18n|kb` / `roadmap show --json`**：低频只读面结构化。
- **`config get --all --json`**：一次取全量项目配置，不再要求 key。
- **升级**：`npm i -g openfeel@latest`；JSON 契约与退出码语义保持兼容。详见 [CHANGELOG](../CHANGELOG.md#124---2026-10-17)。

## v1.2.3 — 补丁：并发 JSON 退出与测试 seam

- **并发 JSON 退出统一**：冲突时输出 envelope 并置退出码 2，避免 Windows 管道截断。
- **`--review-tier` help 文案订正**：缺省 = `full`（零裁剪）。
- **`req` 过滤单点化**：行为不变，减少双实现。
- **锁超时 E2E 测试钩子**：仅测试环境生效，生产超时默认值不变。
- **升级**：补丁版本，直接升级即可。详见 [CHANGELOG](../CHANGELOG.md#123---2026-10-17)。

## v1.2.2 — 机器可读 JSON 契约与调度决策下沉

- **`flow next --json`**：负责 Agent、合法下一相位、建议命令、守卫与阻塞审查。
- **全局 `--project <path>`**：任意命令锚定项目。
- **13 个读命令 `--json`**：结构化输出全面补全。
- **错误封装**：`{schemaVersion,error:{code,kind,message,detail}}`；退出码 0/1/2/3。
- **`--version --json`**、`flow archive --dry-run --json`、`reviewTier` 消歧。
- **升级**：既有 JSON 字段只增不改，人类输出不变。详见 [CHANGELOG](../CHANGELOG.md#122---2026-10-17)。

## v1.2.1 — 需求拆分、三模式与审查档位

- **三模式 `full` / `fast` / `general`**：`general` 仅需求级；模式可逐阶段覆盖与切回。
- **需求接取与拆分**：`req split` 拆分即发布；并行认领；需求与版本解绑。
- **审查档位 `--review-tier`**：与模式正交，裁剪审查关但恒保留代码审查 / 测试 / 归档关。
- **新 agent `openfeel-explorer`**：只读调研路由。
- **模型默认值统一 + 部署非破坏性**：用户主权 `model` 键不被覆盖。
- **升级**：旧项目零迁移；`general` 仅需求级合法。详见 [CHANGELOG](../CHANGELOG.md#121---2026-10-15)。

## v1.2.0 — 版本分片归档与需求流转

- **`flow archive`**：按版本把 `flow.json` 切分到 `.openfeel/flow-archive/{version}.json`；判据 = 全部阶段 done 且无 blocking REV。
- **`openfeel req`**：需求 7 状态与 10 子命令；全部关联阶段 done 时自动收口；认领无 TTL。
- **兼容**：旧 `flow.json` 无需迁移。
- **升级**：直接升级；归档命令按需使用。详见 [CHANGELOG](../CHANGELOG.md#120---2026-10-13)。

## v1.1.2 — 自描述、阶段治理与结构化输出

- **自描述**：`flow phases [--json]` 输出合法相位与转移表。
- **阶段治理**：`flow stage remove`、`plan stage add --deps`、stageId 校验与冲突检测。
- **配置有效值**：`config effective` 输出来源链。
- **结构化输出**：`flow status/current/health/metrics/overview --json`。
- **纠正 / 清理命令面**：scheme remove/rename/publish、ops list、health --fix、knowledge dedup、lint 非 0 退出。
- **部署与备份**：覆盖前自动备份；输出编码自适应；运行日志。
- **升级**：直接升级。详见 [CHANGELOG](../CHANGELOG.md#112---2026-10-11)。

---

> 更早版本（v1.0.x / v1.1.0 / v1.1.1 等）见 [CHANGELOG.md](../CHANGELOG.md) 与 [docs/index.md](index.md)。
