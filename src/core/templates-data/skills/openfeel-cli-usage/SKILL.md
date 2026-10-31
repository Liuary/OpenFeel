---
name: openfeel-cli-usage
description: OpenFeel CLI 命令用法参考：命令清单与关键参数、15 个 phase 枚举与转移表、stageId 命名与目录映射约定、v1.1.2 新增能力（自描述/可纠错、--json 结构化输出、health --fix、scheme draft、knowledge dedup、纠正清理侧命令面）、v1.1.4 新增能力（checkpoint 选择性恢复 --stage/--dry-run、flow stage reset 精准复位、故障恢复路径）、v1.1.5 新增能力（setup --check [--json] 诊断 / 被动部署提示）、v1.1.6 新增能力（Claude Code 适配器 `--tools claude` / settings 注入）、v1.1.7 新增能力（双模式工作流 workflow_mode：flow mode 只读查询 / flow phases --mode 模式分节 / plan stage add --workflow-mode / stage set --workflow-mode / config set --sync-stages --stage）、v1.2.0 新增能力（需求流转命令组 `openfeel req`：需求 7 状态与 10 子命令 / 认领协议；flow.json 版本分片归档 `flow archive`：`<version>` / `list` / `show`）、v1.2.1 新增能力（需求拆分 `req split` / 三模式 `full/fast/general` / 审查档位 `--review-tier` / 通用工作者 `openfeel-explorer` / 可观测性字段 / 模型默认值统一与部署非破坏性）、v1.2.2 新增能力（flow next 调度决策 / 全局 --project / 13 读命令 --json 与 33 成功出口·34 注册选项 / 错误封装 code+kind+errorKind / --version --json / flow archive 判据明细 / archive <stage> --json / reviewTier 消歧）、v1.2.3 修复（并发 JSON 退出统一 / --review-tier help 文案订正 / req 过滤单点化 / 锁超时 E2E 测试钩子）、v1.2.4 收口（archive <stage> 覆盖保护 + --force / plan stage list·model list|get·flow retry·lint i18n|kb·roadmap show --json / config get --all / 40 成功出口·41 注册选项）、v1.3.0（DSH 适配器单包分发 / setup --tools dsh / README 版本能力概览迁出）、v1.3.1 修复（setup --tools dsh 的 pnpm frozen-lockfile 部署失败）、v1.3.2（DSH 写入门禁 `ctx.tools.guard` + 非项目 bootstrap）、v1.3.3 修复（fast 阶段级 REV / `review_passed → exec_running` 返工边 / 写入门禁风险分层 / `plan stage add` 原子聚焦 / 阶段 ID ↔ 目录映射文档化）、v1.3.4 修复（适配器 `review_add --stage` 透传 / `setup --check` 五态含 restart-required / 部署标记刷新）、v1.3.5 修复（统一 shell 工具推荐：Windows 优先 Git Bash 其次 PowerShell 7）、v1.4.0 新增（静态展示资源与 doc 同层 + `openfeel chore` 微变更通道）、v1.5.0 新增（`openfeel dev sync` / 状态记录瘦身：Only-Feel 写状态、日志降级、30 分钟同步）、v1.5.2 新增（流程入口闸：无阶段研究/方案不可写）、v1.5.3 新增（派发契约 / 恢复包 / 结构化交接 / 批次发布）、v1.5.4 新增（日志摘要 / 快照 revision/stale / 观测指标）。当需要查询 CLI 命令、参数、phase、stageId、阶段命名时加载。
---

# OpenFeel CLI 用法参考

## 说明

- 定位：**查询型参考手册**（只读，不自执行）。回答「命令是什么、参数怎么给、phase/stageId 规则如何」。
- 边界：**执行型交互向导**请用 `openfeel-wizard` skill（跑 `openfeel flow wizard` 推进流水线）；本 skill 只承载静态知识查阅。
- 与 `openfeel-tool-usage` 协同：工具选择规范见该 skill；本 skill 补充 CLI 命令细节。
- 正文以**能力名**叙述；平台差异见 `### opencode 适配器` / `### Claude Code 适配器` 两小节。

> 本文档为 v1.5.5 快照；命令/参数细节以 `openfeel <cmd> --help`（本仓执行）实时输出为准（CLI 演进后本文档可能滞后）。
>
> ⚠️ **本仓自举**：本仓（openfeel 源码仓库）开发/执行时请用 `node bin/openfeel.js <cmd>`；安装后使用 `openfeel <cmd>`。

## 命令速查

| 命令 | 用途 | 关键参数 |
|------|------|----------|
| `openfeel init [path]` | 初始化项目工作区 | `--lang <zh-CN\|en>`、`--demo`、`--workspace-only`、`--non-interactive` |
| `openfeel setup` | 部署全局框架配置（不建项目 `.openfeel/`）；`--check` 只读诊断全局部署一致性 | `--lang <zh-CN\|en>`、`--check [--json]`、`--tools <list>`、`--dsh-profile <name>`（v1.3.0） |
| `openfeel update [path]` | 部署适配文件到目标项目 | `--lang`、`--force`、`--tools <list>`（`dsh` 不适用，v1.3.0） |
| `openfeel migrate [path]` | Legacy 布局迁移（检测/备份/迁移/回滚） | `--dry-run`、`--remap-assignee`、`--clean-global-core-md`；`migrate rollback` |
| `openfeel flow ...` | 流水线状态管理（含 `next` 调度决策查询） | 见下「flow 子命令」 |
| `openfeel flow checkpoint restore` | Checkpoint 恢复（全量 / 选择性 / 预览） | `<file> [--force] [--stage <id>] [--dry-run]`（无 `--stage`=全量覆盖，最后手段；`--stage`=按阶段回退；`--dry-run`=零写盘预览） |
| `openfeel flow stage reset` | 精准复位阶段 phase（`flow advance` 的对称复位，允许回退） | `<stageId> --to <phase> [--dry-run]`（受合法值域 + `to=done` 阻塞 REV 约束） |
| `openfeel plan stage add\|list` | 工作阶段管理 | `add <name> --deps <ids...> --tasks <items...> --exec-mode <manual\|auto> --auto-advance <enabled\|disabled> --workflow-mode <full\|fast\|general>`（初值取 `config.yaml.defaults`；显式选项优先；`--workflow-mode` 覆盖 config 默认；**`general` 仅需求级合法**——阶段级写入面拒绝） |
| `openfeel plan scheme create\|publish\|rename\|list\|remove\|register` | 操作方案管理 | `create <stage> <title> [--draft]`、`publish <stage> <opId>`、`rename <stage> <opId> --title <text>`、`remove <stage> <opId> [--force] [--dry-run]`、`register <stage> [opId] [--dry-run]`（补注册 fileOrphans）；`plan stage list [--json]`（v1.2.4 #34） |
| `openfeel stage status\|set\|task` | `status.md` 原子操作 | `set <id> --status/--exec-mode/--auto-advance/--review-agent/--workflow-mode`、`task <id> [no] --add/--done/--undone`（`stage create` 已弃用） |
| `openfeel config ...` | 配置管理 | `get\|set <key> <value> [--global]`（支持全量 `defaults.*`，且 `defaults.X ≡ X`）、`get --all [--json]`（v1.2.4：项目全量 defaults）、`set ... --sync-stages [--stage <ids...>]`（批量写入已注册阶段 `status.md` 的 `自动推进`/`执行模式`/`工作流模式`；`--stage` 限定作用域，单独使用 / 与 `--global` 组合 → exit 1）、`get-lang\|set-lang`、`list-projects`、`effective [key]` |
| `openfeel model set\|get\|list` | 模型三层级配置 | `set <agent> <model>`；`get/list [--scope] [--json]`（v1.2.4 #35/#36） |
| `openfeel lint i18n\|kb` | 健康检查（i18n 键一致性 / kb 过期引用） | `[--json]`（`{target,ok,issues}`；发现问题**非 0 退出**） |
| `openfeel knowledge ...` | 知识库管理 | `list` / `add` / `search` / `index` / `dedup` |
| `openfeel archive <stage>` | 归档指定阶段（汇总产出、生成摘要、提取知识） | `<stage> [--json] [--force]`（v1.2.4：已有归档默认拒绝，`ARCHIVE_EXISTS` 零写盘） |
| `openfeel req ...` | 需求流转（需求管理命令组；**11 子命令**） | 见「v1.2.0 新增能力（stage-78~84）」+「v1.2.1 新增能力（stage-86~93 + 94）」节 |
| `openfeel view list\|accept` | 审查条目验收（`add` 已移除，改用 `flow review add`） | — |
| `openfeel project overview` | 项目结构概览 | `overview`（无 `list`/`info` 子命令） |
| `openfeel roadmap create\|show` | 分期大纲管理 | `create <version>`、`show [version] [--json]`（v1.2.4 #40） |
| `openfeel instructions <artifactId>` | 为指定 artifact 生成结构化指令 | `--change <name>`、`--schema <name>`、`--json` |

**全局选项（v1.2.2 起）**：`--project <path>`（任意命令前置/后置/`=` 形态；语义等效 cwd；语言按目标项目、`--log-file` 相对路径按原始 cwd）；`--version --json` / `-v --json` → `{schemaVersion:1,version,node}`（三键；单列，不计入 40 出口 / 41 注册选项）。

**flow 子命令**：`status` / `current` / `overview` / `phases` / `mode`（`[--stage <id>] [--json]`，只读） / `next`（`[--json]`，只读，v1.2.2 起） / `stage`（`add` / `remove` / `set --deps` / **`reset <id> --to <phase> [--dry-run]`**）/ `metrics` / `advance`（`--stage <id> --to <phase>`、`--op`、`--force`、`--dry-run`、`--quiet`、**`--review-tier <full\|lean\|skip>`**、`--json`（仅错误封装））/ `attempt` / `log` / `review` / `retry` / `repair` / `ops` / `migrate` / `checkpoint`（`list` / **`restore <file> [--force] [--stage <id>] [--dry-run]`**）/ `health` / `recover` / `wizard` / `archive`（`<version>` / `list` / `show`）。

**纠错/清理侧补充**：`flow review add|resolve|update|remove`；`flow ops list [--stage <id>] [--json]`（操作方案视图，draft 分组展示）；`flow repair [--prune-orphans]`（默认只报告，`--prune-orphans` 仅清键孤儿，单向不删文件）；`plan scheme register`（补注册**文件孤儿**：有 op 文件无注册键 → 写入 flow.json，`--dry-run` 零写盘；与 `flow repair --prune-orphans`（仅清键孤儿）对称）；**`flow stage reset <id> --to <phase>`**（`advance` 的**对称复位**：允许回退，受合法 phase 值域 + `to=done` 阻塞 REV 约束，`--dry-run` 零写盘）；**`flow checkpoint restore <file> --stage <id> [--dry-run]`**（按阶段选择性回退；`--dry-run` 差异预览零写盘）。

> 命令职责分层：`plan stage add`（完整，推荐）> `flow stage add`（仅注册 `flow.json`，不建目录）> `stage create`（已弃用）。

## v1.2.2 新增能力（stage-95~98）

> 以下能力**v1.2.2 起提供**；JSON 契约单一权威 docs/json-contract.md（**v1.2.4 起 40 成功出口 / 41 注册选项**；本仓收口基线 75 文件 / 21 阶段）。

- **`flow next [--json]`（决策权威，只读；v1.2.2 起提供）**：输出当前阶段调度决策。`--json` **12 键固定序** `schemaVersion,stage,phase,phaseLabel,responsibleAgent,workflowMode,reviewTier,effectiveReviewTier,legalNextPhases,suggestedCommand,guards,blockingReviews`；`responsibleAgent` 与 `mapPhaseToAgent` 同源；`legalNextPhases` 为直接可达集（每个元素均被 `flow advance` 接受）；`suggestedCommand` 空集为 `null`；`guards` 五类固定序；`blockingReviews[]{id,title,priority,op}`；只读零写盘；本版不支持 `--stage`。
- **全局 `--project <path>`（v1.2.2 起提供）**：任意命令前置/后置/`=` 形态；语义等效 cwd；多值冲突 `INVALID_ARGUMENT` / 非法路径 `PROJECT_NOT_FOUND`；命令输出语言按目标项目、`--log-file` 相对路径按原始 cwd；`knowledge dedup` 保留本地 `--project` 声明（语法兼容）。
- **读命令 `--json` 全量补全（13 个命令面；v1.2.2 起提供）**：`stage status` / `flow recover` / `flow checkpoint list` / `flow log` / `project overview` / `knowledge search|list|index|dedup` / `config get|effective` / `view list` / `plan scheme list`，另 `archive <stage> --json`；统一单文档 + `schemaVersion` 首键、可选字段 `null`、集合 `[]`；累计 **40 个成功出口 / 41 个注册选项**（v1.2.4 新增 #34~#40）。
- **机器可读错误封装（v1.2.2 起提供）**：`{schemaVersion:1,error:{code,kind,message,detail}}`；退出码 **0 成功 / 1 预期拒绝 / 2 并发冲突 / 3 内部错误（新增）**；legacy `{error:'...'}` 保留 string 类型与键序、末尾追加 `errorKind`；判别唯一规则 `typeof doc.error === 'string'`；12 行 `code→kind→exitCode` 映射表。
- **`--version --json`（v1.2.2 起提供）**：`{schemaVersion:1,version,node}`（三键）；**单列，不计入 40 成功出口、也不计入 41 注册选项**；纯文本 `--version` 逐字不变。
- **`flow archive --dry-run --json` 判据明细 + `archive <stage> --json`（v1.2.2 起提供）**：`flow archive` 成功 9 键 / gate-rejected 9 键，含 `eligible` / `unfinishedStages[]{id,phase}` / `blockingReviews[]{id,title,priority}`；`archive <stage> --json` 输出 `archivePath` / 计数 / `knowledgeExtracts`；`--dry-run` 零写盘；与 `flow archive`（版本分片）职责分离。
- **`reviewTier` 消歧（v1.2.2 起提供）**：`flow phases --json` / `flow status.stages[]` / `flow next` 同时给出展示值 `reviewTier`/`displayReviewTier` 与生效值 `effectiveReviewTier`（恒 `full`）。**订正**：`flow advance` 未显式传 `--review-tier` 时生效档位恒 **`full`**（不是按模式派生）；按模式派生的是 `flow phases --json.reviewTier` 展示值。源码 help 文案已于 v1.2.3 订正。
- **兼容承诺（v1.2.2 起提供）**：既有 19 个成功出口字段零破坏（只增不改）；人类输出逐字不变；退出码 0/1/2 语义不变、3 仅新增；phase 枚举 15 项 / `advanceAccepted` / full-fast 行为不变；存量 `flow.json` 零迁移零注入；REQ-001 L80「2=内部错误或用法错误」登记为需求文本勘误（权威口径见契约 §2/§10）。

## v1.3.0（stage-101）

> 次版本：DSH 适配器单包分发 + `openfeel setup --tools dsh` + README 重构。JSON 契约保持 **40 成功出口 / 41 注册选项 / 13 错误码**，退出码语义不变。

- **`openfeel setup --tools dsh [--dsh-profile <name>]`**：将包内 `dsh/` 以 `link:<openfeelRoot>/dsh` 写入 DSH profile（`DSH_HOME` 或 `~/.dsh`）的 `dependencies`，并追加 `dsh.profile.bundles`；依赖变化/链接无效时才执行 `pnpm install`；写前备份、幂等重跑、失败回滚。默认部署全部已检测 profile。
- **`openfeel update --tools dsh`**：不适用（全局部署），命令层在 auto-init / 写盘前 exit 1 并指引 `setup`。
- **错误映射**：预检 / 用法 / profile → `INVALID_ARGUMENT`（refusal/1，`detail.reason=dsh-*`）；备份 / pnpm install → `INTERNAL_ERROR`（internal/3，`dsh-backup-failed` / `dsh-pnpm-install-failed`）。不新增 CLI 错误码。
- **单包**：不发布独立 `openfeel-dsh`；`dsh/` 随 `openfeel` npm 包分发，默认不部署。README 版本能力概览迁至 `docs/VERSIONS.md`。

## v1.5.5（stage-113）

> 批次：preflight 账本 / 适配器 strict / 禁止 shell 写状态 / 审查独立性（无 JSON 契约变更）。

- `flow next` / `flow status` 写 `.openfeel/dev/.preflight.json`；写命令校验 10 分钟窗口（`OPENFEEL_PREFLIGHT=off|warn|strict`）。
- DSH 适配器默认 strict；`feel_status` / `feel_next` 返回 `preflight`。
- 状态写操作只用 `feel_*`；自审 REV 标 `self-review`。

## v1.5.4（stage-112）

> 批次：日志摘要 / 快照 revision/stale / 观测指标 / 闸门滥用提示（无 JSON 契约变更）。

- `flow log` 追加当前阶段摘要（最近转换 / 失败 / resume）；`flow metrics` 追加 `flow.log` 条目/字节。
- `feel_status` / `feel_next` 返回 `revision` / `snapshotAt` / `stale`。
- `plan_pending` 停留 >10 分钟 → 空转提示。

## v1.5.3（stage-111）

> 批次版本：派发契约 + 恢复包 + 结构化交接 + 同步去重。相位机 / REV / 归档语义不变；无新增命令/JSON 出口。

- **派发**：`feel_next.dispatch`（goal/context/boundaries/returnFormat）；子 agent 禁读状态文件，返回 ≤10 行。
- **恢复**：`feel_status.recovery`（lastTransition / handoff / nextAction）；新会话一次调用恢复。
- **交接**：`done: / next: / block:` 固定键；状态未变时 `dev sync` 不重写 dev_last。
- **发布节奏**：批次发布（`docs/VERSIONS.md`「发布节奏」）。

## v1.5.2（stage-110）

> 补丁版本：流程入口闸 + 调度/持久化调研（不改相位机 / REV / 归档语义；无新增命令/JSON 出口）。

- **入口闸（DSH）**：`feel_status` / `feel_next` 在无活跃阶段时返回 `workflowGate`（required / reason / message / actions）。
- **研究产物守卫**：无活跃阶段写 `docs/research/**` 被拒（chore 不能绕过），拒绝写 `guard-audit.jsonl`（`event=guard_deny`）。
- **提示段**：先 `feel_status`；不得以「调研 / 只读」为由跳过阶段；纯只读问答例外。
- **调研文档**：`docs/research/dispatch-persistence-2026-10-31.md`（1.5.3 统一派发/恢复包；1.5.4 结构化交接 + 日志索引）。

## v1.5.0（stage-108）

> 次版本：工作流瘦身（Only-Feel 写状态 / 日志降级 / 30 分钟同步）。相位机 / REV / 归档语义不变；无新增 JSON 出口。

- **只有 Feel 写状态**：`dev_last*`、`dev/current.md`、`status.md`、`flow.json` 只由 Feel 更新；子 agent 不读不写（上下文走派发 prompt / 交接文档）。
- **日志不强制**：不写逐操作流水账；`flow.json.log` 由 CLI 维护（最近 **200** 条）。
- **节点 + 30 分钟同步**：`openfeel dev sync` 写 `dev_last.md` 的 CLI 受管简要状态块（活跃阶段 / 需求 / 最近操作）与 `.openfeel/dev/.sync.json`；`flow advance` 在首次 / 超过 30 分钟 / 节点相位（`exec_running` / `review_passed` / `archiving` / `done`）自动同步；`openfeel dev status` 查看是否到期。
- **适配器**：`feel_next` / `feel_status` 返回 `statusSync`；`due=true` 时只更新交接摘要（≤5 行）再 `dev sync`，不阻塞。
- **升级**：`npm i -g openfeel@latest` → `openfeel setup` → **完全退出并重启宿主**。

## v1.4.0（stage-107）

> 次版本：写入门禁分层 + `chore` 微变更通道（依据 UI 微调反馈）。相位机 / REV / 归档语义不变；无新增 JSON 出口。

- **静态展示资源豁免**：`.css/.scss/.html/.svg/.png/.jpg/.jpeg/.webp` 与路径含 `assets/`、`public/` 的目标，与 doc/note 同层——任意相位可写、不要求活跃阶段；**混合目标从严**（含源码则按源码规则）。
- **源码底线不变**：`.rs/.ts/.js/.py` 等仍要求 `exec_running`；`.openfeel/flow.json`、`**/status.md` 仍禁止手改。
- **审计**：豁免放行与 chore 放行写 `.openfeel/log/guard-audit.jsonl`（time/tool/reason/phase/paths）。
- **`openfeel chore "<说明>"`**：无活跃阶段时开启 60 分钟写窗口（源码也可写）；`--end` 收口、`--status` 查看；不写 `flow.json.stages`，只留 `chore_start` / `chore_end` 日志与 ephemeral `.openfeel/chore.json`。存在活跃阶段 → 拒绝开启（guard 也不生效）。
- **升级**：`npm i -g openfeel@latest` → `openfeel setup` → **完全退出并重启宿主**。

## v1.3.5（stage-106）

> 补丁版本：统一 shell 工具推荐（仅提示/文档层；CLI 命令与相位机不变）。

- **推荐口径**：Windows 下优先 `bash`（Git Bash），其次 `pwsh`（PowerShell 7）；macOS / Linux 用 `bash`；默认不用 `cmd.exe`；同一任务保持同一 shell。
- **落点**：DSH Feel 系统提示（`<feel_mode>` zh/en 新增「命令执行」节）、OpenFeel 全局约束模板（`agents-md` / `claude/constraint` 第 5 条）、`openfeel-tool-usage` skill 注记。
- **升级**：`npm i -g openfeel@latest` → `openfeel setup` → **完全退出并重启宿主**。

## v1.3.4（stage-105）

> 补丁版本：分发链路修复（1.3.3 复测报告）。CLI 相位机 / REV 语义 / 写入门禁不变；`update_state.json` 追加可选 `adapters` 字段，`setup --check --json` 键集不变。

- **适配器 `review_add` 透传 `--stage`**：`feel_flow action=review_add` 的 `op` / `stage` 二选一（皆缺 → `FEEL_BAD_USAGE`）；fast 无 op 场景可直接在工具层建阶段级 REV。
- **`setup --check` 五态**：`ok` / `mismatch`（文件旧，重跑 setup）/ `restart-required`（文件已新但宿主未重启，只需**完全退出并重启宿主**）/ `missing` / `unknown`。检测依赖 `update_state.adapters.dsh.hash`（部署指纹）与 `~/.openfeel/adapter-host-dsh.json`（宿主启动时写入的加载指纹）。
- **部署标记修复**：`setup --tools dsh`（含「已是最新、跳过」分支）也刷新 `openfeel_version` / `last_update` 并写 `adapters.dsh`，消除「setup 成功但 check 永远 mismatch」的死循环。
- **升级纪律**：`npm i -g openfeel@latest` → `openfeel setup` → **完全退出并重启宿主**；看到 `restart-required` 不要重复 setup。

## v1.3.3（stage-104）

> 补丁版本：fast 模式结构性修复（反馈 13 项：P0×4 / P1×5 / P2×4）。合法相位枚举仍 15 项，full 转移表不变；JSON 契约只增不改（无新增成功出口 / 注册选项）。

- **阶段级 REV（P0-2）**：`flow review add` 的 `--op` 改可选 + 新增 `--stage <id>`；fast 无 op 阶段挂 `op = stageId` 的阶段级 REV（`ReviewItem.stage` 可选字段，参与 blocking 门与 `archive <stage>` 摘要；不参与 `flow attempt` / `flow retry`）。`--auto-fix` 仍要求 `--op`。
- **fast 返工边（P0-3）**：`review_passed → exec_running` 合法；`flow advance --reason <text>` 写入审计键 `rework_reason`（仅该一步）。`review_pending → exec_running` 同深度多义 tie-break：优先经 `review_failed`（行为不回归）。
- **写入门禁分层（P0-1 / P0-4，适配器侧）**：bootstrap 例外（无 `.openfeel/` 且全部新增文件 / `apply_patch` 全部 `*** Add File:` → 放行并提示补账本）；`docs/**` 与 `.md/.mdx/.txt/.rst/.adoc` 不绑相位；混合目标从严；源码仍要求 `exec_running`。
- **聚焦 / 单一真源（P1-1 / P1-2）**：`plan stage add` 原子聚焦；`flow next` 在 current 为空时从 stages 只读派生；`advance` 派生写 status.md 受管字段（状态 / 责任 Agent / 更新时间）；DSH 序列化器祖先栈判环（重复引用不再误报 `[循环引用]`）。
- **模板 / 配置 / 档位（P1-3/4/5）**：`instructions` 包内置 schema 回退 + `--change` 可选；`execution_mode=auto + auto_advance=disabled` 静默无效组合在 advance/next 告警；advance 回显生效审查档位。
- **体验（P2）**：init 目录惰性化；阶段 ID 归一化与 `plan/` 目录映射文档化 + `plan stage add` 回显目录；非 git 仓库归档显式告警。

## v1.3.2（stage-103）

> 补丁版本：DSH 适配器激活与写入门禁。CLI JSON 契约保持 **13 错误码 / 40 成功出口 / 41 注册选项**，命令面不变。

- **DSH 写入门禁（适配器侧）**：`ctx.tools.guard()` 同步拒绝 `edit` / `write` / `apply_patch` / `str_replace_editor`；`.openfeel/**` 流程产物任意阶段可写（`flow.json` / `status.md` 除外），外部源码要求 `exec_running`。
- **默认 `enforce=always`**：无 `.openfeel` 的工作区也会拒绝文件写入，防止绕过 `openfeel init`；`project` / `off` 可 opt-out。
- **非项目 bootstrap**：`activation=auto` 时未初始化工作区注入短提示（只读可进行；写文件需 init 或改 enforce），不再静默。
- **`pwsh` 边界**：默认不守，仍是显式逃生通道；`guardShell` 留到后续。

## v1.2.4 收口（stage-100）

> 补丁版本：DSH ACTION-GUIDE A1~A5 收口。JSON 契约升级为 **40 成功出口 / 41 注册选项**；退出码 0/1/2/3 语义不变。本仓收口基线 **75 文件 / 21 阶段**。

- **A1 `archive <stage> [--json] [--force]`**：已有归档且未 `--force` → `ARCHIVE_EXISTS`/refusal/1，**零写盘**（存在性检查先于任何写盘）；`--force` 才覆盖；保护为归档文件级（别名派生不同文件、互不触发）。
- **A2 `plan stage list --json`（#34）**：`{schemaVersion,stages,count}`；`stages[]` 七键 `id,phase,status,deps,workflowMode,opsTotal,opsDone`（flow.json 注册阶段视图）。
- **A3 `model list|get --json`（#35/#36）**：`agents[]{agent,provider,model,source}` / 单 agent 六键；首个 `/` 切分；`source` = default > project > global。
- **A4 `flow retry --op <id> --json`（#37）/ `lint i18n|kb --json`（#38/#39）/ `roadmap show [version] --json`（#40）**：retry 六键；lint `{target,ok,issues:[{path,message}]}`（`ok:false` 仍成功文档 + exit 1）；roadmap 表头驱动 `milestones[{title,theme,stage,deliverable}]`（兼容 3/4 列）。
- **A5 `config get --all --json`**：项目 `{scope:"project",defaults}` 四键固定序；不再 `key-required`；`--all` 与 `--global`/key 组合 → `INVALID_ARGUMENT`。

## v1.2.3 修复（stage-99）

> 补丁版本：v1.2.2 转出项收口。不新增功能；33 成功出口 / 34 注册选项与退出码 0/1/2/3 语义不变。本仓收口基线 **75 文件 / 1911 用例 / 21 阶段**。

- **并发 JSON 退出统一（REV-95-009）**：并发冲突 JSON 模式输出单个 `FLOW_CONCURRENT_CONFLICT`（refusal）envelope → 置 `process.exitCode=2` → return（与 `failCli` 同机制）；非 JSON 模式 `console.error + process.exit(2)` 逐字不变；10 个调用点显式返回。
- **`flow advance --help --review-tier` 订正**：源码 help 与 i18n zh/en 为「缺省=full（零裁剪）」；按模式派生的是 `flow phases --json.reviewTier` 展示值；缺省推进行为不变。
- **`req` 过滤单点化（REV-97-006）**：`req show` / `req set --workflow-mode` 复用 `listLinkedStages`；`req split` 与 core done 原语保留；行为零变化。
- **锁等待超时 E2E 测试钩子（REV-98-006①，test-only）**：仅 `OPENFEEL_TEST_MODE=1` 生效；生产默认 5000/3000ms 不变；E2E 稳定断言 `INTERNAL_ERROR/internal/3`。

## v1.2.1 新增能力（stage-86~93 + 94）

> 以下能力**v1.2.1 起提供**（94 = 表外补阶段：模型默认值与部署非破坏性）。

- **需求接取与拆分（`req split`）**：**拆分即发布**——`openfeel req split <id> --into <title> [--into <title> ...] [--json]`，子需求一次入 `scheduled`；`parent_id` 仅溯源（**不入聚合 / 不入 done 门 / 不参与 `PATCH_WHITELIST`**）；顺序 ID 单源派生 + 父终态门 + 恰 1 条 `requirement_split` 审计。**并行接取**：`req claim` 互不阻塞。**需求与版本解绑**：`target_version` 为纯展示 / 过滤 / 排序维度，非门。命令组 **10 → 11 子命令**。
- **通用工作者直接调度（双口径）**：opencode 侧 = 嵌套 `task` 工具；Claude Code 侧 = Handoff 直发。通用模式下可承接任意 Agent **直接调度**的执行任务（不限于流水线 op）；派发前先探后执行。
- **`openfeel-explorer`（新 agent，只读）**：承接「调研 / 探索」路由；工具集下限恰 4 项（Read / Glob / Grep / Bash），无写、无派发；agent 数 **9 → 10**。
- **三模式（`full` / `fast` / `general`）**：`plan stage add --workflow-mode` / `stage set --workflow-mode` / `config set defaults.workflow_mode` / `flow phases --mode` 值域均为 `full|fast|general`（**`general` 仅需求级合法**——阶段级 / 部署级写入面拒绝，wizard 不提供选项）；需求侧 `req add` / `req set --workflow-mode`；解析链增需求级层（`status.md > 需求级 > config.yaml > builtin`）；**升级不降级**。
- **可观测性**：`metrics.json` 经 `recordRun` 接线（`flow metrics`）；CLI 日志行含 `duration_ms` / `project` / `session_id`；op 级时间戳（`attempted_at` / `completed_at`）；跨会话恢复标注 `resumed`。
- **审查档位（`flow advance --review-tier <full|lean|skip>`）**：与工作流模式**分属两轴**；缺省按模式派生（`flow phases --json.reviewTier`）；显式 `lean` / `skip` 一行非阻断警告；值域非法 exit 1 零写盘。**裁剪只作用于入边 / 目标侧**——阶段恰停于被裁剪相位时保留出边、可向该档位下游推进（v1.2.1-stage-93 修复 `cli/BUG-011`）；「**进入**被裁剪关」仍不可达。
- **模型默认值统一 + 部署非破坏性（用户主权键 `model`）**：部署（`setup` / `update`）对用户既有 `model` 键**无则创建、有则不覆盖**；opencode 侧显式默认收敛为 `deepseek/deepseek-flash`。

## v1.2.0 新增能力（stage-78~84）

- **flow.json 版本分片归档（`flow archive`）**：按版本号归档已收官历史（判据门：该版本全部阶段 done + 无 blocking open REV；归档文件落 `.openfeel/flow-archive/{version}.json`）。三个入口：`openfeel flow archive <version>`（执行归档；`--dry-run` 预览零写盘、`--json` 结构化输出）、`openfeel flow archive list`（列举已归档版本，只读）、`openfeel flow archive show <version>`（查看指定归档版本，只读）。**与顶层 `openfeel archive <stage>` 区分**：顶层命令是**阶段摘要归档**，`flow archive` 是 **flow.json 版本分片归档**，二者职责不同；常规命令不读 `.openfeel/flow-archive/**`（`flow health` 仅目录清单级对账）。
- **需求流转（`openfeel req`）**：需求层命令组（10 子命令（**v1.2.1 起 11**，+`split`）：`add` / `list` / `show` / `claim` / `release` / `set` / `link` / `advance` / `board` / `next`）。需求 7 状态（`draft` / `scheduled` / `in_progress` / `done` / `blocked` / `cancelled` / `rejected`）；**需求进度由关联阶段 phase 聚合**（全部关联阶段 done → 需求自动 done）；认领协议 = `owner` + `claimed_at` 占用校验（无 TTL）。需求正文 `.openfeel/requirements/REQ-NNN.md` 为人读副本，**机读权威恒为 flow.json**。用法权威源见 `openfeel-req` skill；**v1.2.0 起提供**。

## v1.1.7 新增能力（stage-74~76）

- **双模式工作流（`workflow_mode`）**：值域 `full | fast`（默认 `fast`）（**v1.2.1 起 3 值 `full | fast | general`**——`general` 仅需求级合法，见「v1.2.1 新增能力」节）。三层载体：`config.yaml defaults.workflow_mode`（项目默认 / 记忆）→ `status.md「工作流模式」`（阶段覆盖，**读取权威**）→ `flow.json` 冗余字段（可选、**不参与级联**）；级联优先序 `status.md > config.yaml > builtin`（`profile.yaml` 不承载）。只读查询：`openfeel flow mode [--stage <id>] [--json]`（当前模式 + 四源 `source`）。
- **fast 快线转移表（并列）**：`transitions` 共 **9 条目**（8 条流转键 + `done` 终止项）：`plan_pending → plan_review`（**计划审查必经**）、`plan_review → plan_passed / plan_pending`、`plan_passed → exec_running`、`exec_running → review_pending`、`review_pending → review_failed / review_passed`、`review_failed → review_pending / exec_running`（回环）、`review_passed → archiving`（**v1.3.3 起另有返工边 `review_passed → exec_running`**）、`archiving → done`、`done`（终态）。**`phases` / `advanceAccepted` 恒 15 项、模式无关**；fast 下 6 个相位不可达（`scheme_*` / `test_*`）。
- **模式命令面**：`plan stage add --workflow-mode <full|fast>`（值域派生、非法 exit 1 不建阶段）、`stage set <id> --workflow-mode <full|fast>`（缺失字段插入）、`flow phases [--mode <full|fast>] [--stage <id>]`（模式分节；`--json` 追加 `workflowMode`）、`config set ... --sync-stages [--stage <ids...>]`（同步字段含「工作流模式」）（**v1.2.1 起三处参数值域均含 `general`**）。
- **`config effective` 四键**：`auto_advance` / `execution_mode` / `merge_mode` / `workflow_mode`。

## v1.1.6 新增能力（stage-68~73）

- **多 harness 并存**：`openfeel setup` / `openfeel update` 新增 `--tools <逗号列表>`（如 `opencode,claude`）；非法值 **exit 1** 前置校验零写盘；默认仅 `opencode`。**v1.3.0**：`setup --tools dsh` 部署到 DSH profile（`--dsh-profile` 窄化）；`update --tools dsh` 拒绝。
- **Claude Code 适配器资产**：`--tools claude` 部署 `~/.claude/`——`CLAUDE.md`（全局约束，用户已有内容 append 不覆盖）、`agents/`（**10 个**，含 `feel`）、`skills/`（**22 个**共享源）、`settings.json`（注入 `"agent":"feel"` + `"permissions":{"defaultMode":"auto"}`，用户既有键逐字保留；**无则创建、有则不覆盖**——用户主权键 `model` 不被改写）；默认零触（不带 `--tools` 时 `~/.claude/` 零变化）。

## v1.1.5 新增能力（stage-67）

- **主动诊断 `openfeel setup --check [--json]`**：只读检测全局部署版本（`~/.openfeel/update_state.json.openfeel_version`）与 CLI 版本一致性，**不执行部署**；一致退出 `0`，`mismatch`/`missing`/`unknown` 退出 `1`；`--json` 输出 `{schemaVersion,status,cliVersion,deployedVersion}`（`status` ∈ `ok|mismatch|missing|unknown`）。
- **被动部署提示**：任意命令 / REPL 在 TTY 下检测到全局部署漂移（`mismatch`）或缺失（`missing`）时，向 **stderr** 提示运行 `openfeel setup`；**每进程一次**；`--json`/`--quiet`/`--version`/`--help`、CI、`OPENFEEL_NO_UPDATE_CHECK` 及部署类命令（`setup`/`update`/`init`/`migrate`）静默；`unknown`（state 损坏）被动静默、仅 `--check` 显式报告；**不改退出码、不写盘**。

## 升级流程

### opencode 适配器

```bash
npm i -g openfeel@latest   # 1. 升级 CLI
openfeel setup             # 2. 重跑部署，刷新全局 AGENTS.md/agents/skills/opencode.jsonc
# 3. 重启 harness（opencode）以加载新的全局配置
```

仅 `npm i -g` 不会刷新全局资产，须重跑 `openfeel setup` 并重启 harness。`openfeel setup --check` 可诊断全局部署版本与 CLI 版本是否一致（一致退出 0，否则退出 1）。

### Claude Code 适配器

```bash
npm i -g openfeel@latest       # 1. 升级 CLI
openfeel setup --tools claude  # 2. 重跑部署（claude 目标）
```

- **`--tools` 由 v1.1.6 提供**：`openfeel setup --tools claude`；首次创建 `~/.claude/{agents,skills}` 后**重启会话或 `/reload-skills`** 使新 skill/agent 生效。
- 首次创建 `~/.claude/{agents,skills}` 后需**重启会话或 `/reload-skills`** 使新 skill/agent 生效。
- `CLAUDE.md` 于**下次会话**生效。

## v1.1.2 新增能力（stage-41~55）

> 以下为 v1.1.2 相对上版的增量能力（分组摘要，细节以 `<cmd> --help` 为准）。

- **A. 自描述与可纠错（stage-41）**：`flow phases [--json] [--mode <full|fast>] [--stage <id>]`（**6 键**：`schemaVersion`/`phases`/`transitions`/`advanceAccepted`/`transitionsDiff`/`workflowMode`（v1.1.7 追加）；既有五键语义逐字不变；**v1.2.1 起 7 键**——末位追加 `reviewTier`）、`flow stage remove [--force] [--dry-run] [--purge]`、stageId 校验/冲突检测（`validateStageId` / `suggestStageId` / `findStageDirConflict`）、`plan stage add --deps`。
- **B. 状态与口径（stage-42）**：`config effective [key]`（有效值 + 生效来源 `status.md > config.yaml > profile.yaml > builtin`）、`pipeline.phase` 全量 done 判定、审计日志 `register_stage` / `register_op`。
- **C. 部署与备份（stage-46）**：覆盖写前自动备份 `~/.openfeel/backup/{ts}/` + `update_infos.md`「备份」类条目（Agent 按 `feel.md` 检查规则核对）。
- **D. 纠正/清理侧命令面（stage-51/52，v1.1.4-stage-64 补 register）**：`plan scheme remove`（仅删 `flow.json` 注册键，不删 op 文件；done/checkpoint 保护）、`plan scheme register <stage> [opId] [--dry-run]`（对称补全：补注册 fileOrphans，`--dry-run` 零写盘；**`create` 序号基于「ops/ 文件 ∪ flow.json 注册」的最小未用正整数（空位回填），创建后对目标阶段未注册文件输出 stderr 告警并提示 `plan scheme register`**）、`plan scheme rename --title`（必填，空标题报错）、`plan scheme publish` + `create --draft`（draft→pending，空模板拒绝）、`flow stage set --deps`（覆盖写入；**不带 `--deps` 视为清空**）、`flow review update|remove`、`stage set`（**幂等**：同值 no-op + 同值不生成 `.bak`；`--exec-mode <manual\|auto>` / `--auto-advance <enabled\|disabled>` / `--review-agent <agent>`）、`stage task --add|--done|--undone`、`plan stage add --tasks`/`--exec-mode`/`--auto-advance`（显式覆盖 config 默认）、`flow repair --prune-orphans`、`flow health --fix [--dry-run]`（默认只报告；`--fix` **仅回写 status.md「状态」字段**；`--dry-run` 预览零写盘）、`flow ops list`、`flow advance --quiet` + `--to <远距 phase>`（存在唯一路径时自动逐步；`--dry-run` 展示完整路径）、`knowledge dedup`（检索相似条目，**只读建议，不修改 kb**）。`flow attempt` 对 **draft op 拒绝**。
- **E. 输出/门禁/约定（stage-50/52）**：`flow status/current/health/metrics/overview --json`（纯 JSON 单文档，含 `schemaVersion`）、`lint i18n`/`lint kb` **非 0 退出**（门禁语义，无逃生阀）、`config set/get` 支持**全量 `defaults.*`**（`defaults.` 前缀与 bare key 等价；`--sync-stages` 仅项目模式，适用键 `auto_advance`/`execution_mode`，其它键跳过报告；Schema 驱动键白名单 + 值类型归一 + 枚举校验，非法报错不写盘）、`view add` **已移除**（改用 `flow review add`）、`NO_COLOR` 环境变量 / `--no-color`。

## phase 枚举与转移表

15 个 phase（`plan_pending` … `done`）：

```
plan_pending → plan_review → plan_passed → scheme_pending → scheme_review
→ scheme_passed → exec_running → review_pending → review_passed → test_pending
→ test_passed → archiving → done
```

| phase | 合法目标 |
|-------|----------|
| `plan_pending` | `plan_review`, `plan_passed` |
| `plan_review` | `plan_passed`, `plan_pending` |
| `plan_passed` | `scheme_pending` |
| `scheme_pending` | `scheme_review`, `scheme_passed` |
| `scheme_review` | `scheme_passed`, `scheme_pending` |
| `scheme_passed` | `exec_running` |
| `exec_running` | `review_pending`, `scheme_pending` |
| `review_pending` | `review_failed`, `review_passed` |
| `review_failed` | `review_pending`, `scheme_pending` |
| `review_passed` | `test_pending` |
| `test_pending` | `test_failed`, `test_passed` |
| `test_failed` | `test_pending`, `scheme_pending` |
| `test_passed` | `archiving` |
| `archiving` | `done` |
| `done` | （终态） |

**fast 快线转移表（`workflow_mode=fast`）** —— `transitions` 共 **9 条目**（8 条流转键 + `done` 终止项），快线链（可达相位序列）为 `plan_pending → plan_review → plan_passed → exec_running → review_pending → review_failed → review_passed → archiving → done`（v1.3.3 起另有返工边 `review_passed → exec_running`）：

| phase | 合法目标 |
|-------|----------|
| `plan_pending` | `plan_review` |
| `plan_review` | `plan_passed`, `plan_pending` |
| `plan_passed` | `exec_running` |
| `exec_running` | `review_pending` |
| `review_pending` | `review_failed`, `review_passed` |
| `review_failed` | `review_pending`, `exec_running` |
| `review_passed` | `archiving`, `exec_running`（返工边，v1.3.3） |
| `archiving` | `done` |
| `done` | （终态） |

> `phases` / `advanceAccepted` 恒 15 项（模式无关）；fast 下 `scheme_pending` / `scheme_review` / `scheme_passed` / `test_pending` / `test_failed` / `test_passed` 共 **6 项**不可达（无入边）。

- 转移表以**运行时** `.openfeel/pipeline.yaml` 为准；`openfeel flow phases` 查看当前生效值。（`--mode <full|fast|general>` 显式指定 / `--stage <id>` 按阶段派生；`--json` 追加 `workflowMode`，v1.2.1 起末位再追加 `reviewTier`）
- 推进：`openfeel flow advance --stage <id> --to <phase>`。**`advanceAccepted` = 内置 15 个 phase 的「推进白名单」**（`flow advance` 只接受这 15 个值），**不是**组合式条件键的替代品（旧文案曾误述，此处已更正）。**组合式条件差异**（如内置默认含 `review_passed|test_passed`，本仓 `pipeline.yaml` 未列）经 `--json.transitionsDiff.missing` **显式可见**（stage-50 裁定：**不补组合键**，改以 `transitionsDiff` 显式化）。
- 参考：`.openfeel/manual/**`（CLI/flow 模块文档）。

## stageId 命名与目录映射

| 格式 | 示例 | series / stageDir |
|------|------|-------------------|
| 完整四级 | `v1.1.2-stage-43` | `v1` / `stage-43` |
| 历史短版 | `v4-stage-04` | `v4` / `stage-04` |
| 短名 | `stage-01` | `v1`（默认）/ `stage-01` |

- `series = v{MAJOR}`；目录映射 `.openfeel/plan/{series}/stage-{NN}/`。
- 唯一性：`(series, stageDir)` 冲突（如 `v4-stage-04` 与 `v4.0.0-stage-04` 映射同目录）会被 `findStageDirConflict` 检出并阻止；非法输入由 `validateStageId` 报原因 + `suggestStageId` 给建议名（`NN` 限定在同 series 内 max+1）。
- 权威实现与三级回退：见 `.openfeel/manual/core/plan-path.md`。

## 典型场景

1. **落地新阶段**：`openfeel plan stage add v1.1.2-stage-43`（建目录 + 注册）→ `openfeel flow advance --stage v1.1.2-stage-43 --to plan_pending` 起步。
2. **声明依赖**：`openfeel plan stage add v1.1.2-stage-43 --deps v1.1.2-stage-41 v1.1.2-stage-47`（写入 `overview.md`「## 依赖」+ `flow.json.stages[].deps`）。
3. **纠错移除误建阶段**：`openfeel flow stage remove v1.1.2-stage-43 --dry-run` 预览 → 确认后 `--force`（必要时 `--purge` 删目录）。
4. **查询有效配置**：`openfeel config effective auto_advance`（来源优先级 `status.md` > `config.yaml` > `profile.yaml` > `builtin`）。
5. **部署前备份**：`setup`/`update`/`init`/`migrate` 覆盖写入前自动备份至 `~/.openfeel/backup/{ts}/`；`update_infos.md` 会新增「备份」类条目，Agent 须按 `feel.md` 检查规则核对（存在性 + 失败重跑）。
6. **故障恢复路径（v1.1.4-stage-65，顺序即优先级）**：
   ```
   ① flow health（诊断，只报告）
   ② flow stage reset <id> --to <phase>（精准复位单阶段）       ← 首选
   ③ checkpoint restore <file> --stage <id> --dry-run（预览）→ 去 --dry-run 执行（按阶段回退）
   ④ checkpoint restore <file>（无 --stage，全量覆盖）          ← 最后手段
   ⑤ flow health --fix（对账 status.md「状态」，仅该字段）
   ```
   **「全量 restore 为最后手段」**（多阶段并行时跨阶段连带回退）；`flow stage reset`/`checkpoint restore` 改写 `flow.json`，`flow health --fix` 仅回写 `status.md` 的「状态」字段。

## 权限模型要点

### opencode 适配器

- 10 个 agent 内联 `permission:` 白名单，均含 `external_directory: "allow"`（单一键，无读写粒度）；只读探索者 `openfeel-explorer` 恰 5 键（v1.2.1-stage-89 增）。
- **合并语义**：agent `.md` frontmatter 与 `opencode.jsonc` 按权限键**深合并**，同名键以 agent `.md` 为准（配置文件无法覆盖已声明键）。
- **收紧入口**：项目根 `.opencode/agent/<name>.md` 覆盖全局同名 agent 并重写完整 `permission` 块；`model` 键为用户主权配置（`update` 保留其值，无则补模板默认），其余 frontmatter 字段仍会被 `update` 覆盖。
- 详 `.openfeel/manual/core/permission.md`。

### Claude Code 适配器

- subagent 于 frontmatter 声明 `tools`（白名单，未列即不可用）、`disallowedTools`（黑名单）与 `permissionMode`。
- **无 `external_directory` 对等概念**。
- `settings.json` 由 `openfeel setup/update --tools claude` 注入（`agent:"feel"` + `permissions.defaultMode:"auto"`，用户键保留），**v1.1.6 起**。

## 与 openfeel-wizard 的区别

| 维度 | `openfeel-cli-usage`（本 skill） | `openfeel-wizard` |
|------|--------------------------------|-------------------|
| 定位 | 查询型**参考手册**（只读静态知识） | 执行型**交互向导**（跑 `openfeel flow wizard`） |
| 动作 | 回答「命令/参数/phase/stageId 是什么」 | 逐步选择并推进阶段 phase |
| 前置 | 无 | 需交互式 TTY（非 TTY 用 `flow advance --stage <id> --to <phase>`） |

> wizard skill 正文已交叉引用本 skill；二者正文互引，边界为「查手册 vs 跑向导」。
