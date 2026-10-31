# Changelog

本项目的全部重要变更记录在本文档中，格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。

> 面向用户的版本能力概览见 [docs/VERSIONS.md](docs/VERSIONS.md)；本文保留逐版本 Added / Changed / Fixed 明细。

## [1.5.6] - 2026-10-31

> 批次版本（Patch 批次）：**preflight 写命令全覆盖**。把「先读状态再写状态」从 4 个命令扩到**全部状态写命令**：34 个命令 / 36 个门位统一收敛到单一 helper；dry-run 免门、恢复通道条件豁免、strict 拒绝零写盘。**无 JSON 契约变更、无新增错误码**。

### Added
- [stage-114] **统一 preflight 闸**：新增 `src/commands/shared/preflight-gate.ts`（`enforcePreflightOrFail`）。`src/core/preflight.ts` **零改动**（判定源不变）；拒绝出口统一为「JSON：`emitErrorEnvelope`；人类：单行 stderr + `process.exitCode`」+ 调用方 `return`（不即时 `process.exit`）。
- [stage-114] **34 个命令 / 36 个门位接入**：`flow` 16（`stage add|remove|set|reset` / `advance` / `attempt` / `review add|resolve|update|remove` / `archive` / `repair` / `checkpoint restore` / `migrate` / `health --fix` / `wizard`）、`stage` 3 命令 4 门位（`set` / `task`〔`--add` 分支 + 主路径〕/ `create`）、`plan` 6 命令 7 门位、`req` 7 命令 7 门位、`config set --sync-stages`、`view accept`。
- [stage-114] **门前只读预检**：`flow review update` / `view accept`（`getReviewItems` / `listReviews`）、`plan scheme publish|rename|remove|register`（`flow.json` 注册键 / `ops/*.md`）；`flow stage reset` 采用「门后置到 `save()` 之前」。使非法参数（`REV-999` / `op-999` / `no-such-stage` / `--to bogus`）先报参数错误、再报 preflight。
- [stage-114] **测试矩阵**：新增 `test/commands/preflight-gate.test.ts`（helper 10 条）与 `test/cli/preflight-cli.test.ts`（6 条真实进程冒烟）；命令级 A/B 组矩阵、dry-run 免门 10 条、恢复通道豁免 4 条；`vitest.config.ts` 默认 `OPENFEEL_PREFLIGHT=off`（防开发机 / CI 导出 strict 时既有用例集体失败）。

### Changed
- [stage-114] `flow archive` / `req split` 的 legacy `--json` 拒绝新增 `error = 'preflight-required'`（顶层键集恒 `['schemaVersion','error','errorKind']`，**不携带 `hint`**；提示只走人类 stderr）。
- [stage-114] 写命令拒绝文案来源从各处裸 `console.error` 收敛到同一 i18n 串（`flow.preflightRequiredTmpl`，零新增键）；`flow advance` 非 JSON 拒绝由「即时 `process.exit(1)`」改为「置码 + `return`」（退出码 1 与 stderr 文案不变）。
- [stage-114] **`--dry-run` 免门 10 处**：`flow stage remove|reset` / `advance` / `repair` / `migrate` / `checkpoint restore` / `health --fix` / `archive` / `plan scheme remove|register`。
- [stage-114] **恢复通道条件豁免 2 处**：`flow repair` / `flow checkpoint restore` 在 `flow.json` 不可读（`isLoaded() === false`）时静默放行，避免 strict 死锁；状态可读时二者**仍受门**，其它命令禁止使用该豁免。
- [stage-114] 文档：`docs/commands.md` 新增「preflight 写命令闸（v1.5.6）」段与逐命令注记；`docs/VERSIONS.md`、`docs/GETTING_STARTED.md`、`openfeel-cli-usage` skill 同步（快照声明升至 v1.5.6）。
- [stage-114] i18n：新增 2 个成对键 `flow.repair.backupDryRunSkip` / `flow.repair.backupCorruptSkip`（zh / en 各 1 条，`lint i18n` 1048→1050）；其余拒绝文案零新增键。

### Fixed
- [stage-114] `view accept` 可把 blocking open REV 置 `closed`，从而绕过 `flow advance --to done` / `flow archive` 的阻塞门（strict 下无门）→ 已接入并补只读预检。
- [stage-114] `flow repair --backup` 在 strict 拒绝时仍会写出 `flow.json.bak`（门原在 `.bak` 之后）→ 门前移到 `--backup` 之前，strict 拒绝零写盘；并补两条备份安全前提：`--dry-run` 下一律跳过备份（预览零写盘）、`flow.json` 不可解析时跳过备份（不用损坏内容覆盖原本可用的 `.bak` —— 该覆盖会破坏 `repair()` 的唯一恢复来源）。
- [stage-114] `config set --sync-stages` 在 strict 拒绝时仍写 `config.yaml`（门原在 `setConfigValue` 之后）→ 门前移，三处（`config.yaml` / `status.md` / `flow.json.stages[*].workflow_mode`）零写盘。
- [stage-114] `stage task --add` 分支在门位之前写盘并返回（主路径门不可达）→ 补 `--add` 分支独立门。
- [stage-114] `--dry-run` 探查后被门拦（8 个零写盘命令却受门）→ 统一免门，保住「试探 → `flow next` → 真执行」路径。

## [1.5.5] - 2026-10-31

> 批次版本（Patch 批次）：**preflight 账本 + 适配器补闸 + 禁止 shell 写状态 + 审查独立性**。解决「阶段流程走了、调度流程没走」：先读状态再写状态成为可校验事实。

### Added
- [stage-113] **CLI preflight 账本**：`src/core/preflight.ts`；`flow next` / `flow status` 写 `.openfeel/dev/.preflight.json`（时间 / stage / phase / revision）；**核心写命令**（`flow advance`、`plan stage add`、`req add`、`req claim`）写前校验（10 分钟窗口；`OPENFEEL_PREFLIGHT=off|warn|strict`，默认 warn 仅 TTY 提示）。
- [stage-113] **适配器补闸**：CLI 执行器默认注入 `OPENFEEL_PREFLIGHT=strict`；`feel_status` / `feel_next` 返回 `preflight`（ok / at / ageMs / mode）；strict 下未 preflight 的写命令拒绝（`INVALID_ARGUMENT`，`detail.reason=preflight-required`）。
- [stage-113] **提示段**：状态写操作只能用 `feel_*`，禁止 shell 跑 `openfeel flow/stage/req` 写命令；fast 单轮审查也应由独立 reviewer，自审 REV 标 `self-review`。

### Changed
- [stage-113] `plan stage add` / `req add` / `req claim` 增加 preflight 检查（默认 warn 非 TTY 静默，不破坏脚本）。
- [stage-113] `dsh/package.json`：version `1.5.5`、`requiresCli: ">=1.5.5"`。

### Fixed
- [stage-113] 1.5.4 实测跳过 `feel_status/feel_next`、用 shell CLI 绕过适配器、自审代替独立审查。

## [1.5.4] - 2026-10-31

> 批次版本（Patch 批次）：**日志阶段摘要 + 快照 revision/stale + 观测指标 + 闸门滥用提示**。无 JSON 契约变更（`flow next` / `flow metrics` 键集不变）。

### Added
- [stage-112] **阶段日志摘要**：`FlowManager.getStageLogSummary(stageId)` 从最近 200 条日志派生 `lastTransition` / `lastError` / `resumeCount` / 条目与字节；`flow log` 人类输出追加当前阶段摘要（`--json` 契约不变）。
- [stage-112] **观测指标**：`flow metrics` 人类输出追加 `flow.log` 条目/字节与活跃阶段数（`--json` 键集不变）。
- [stage-112] **快照 revision/stale（adapter）**：`readSnapshot` 读取 `.openfeel/flow.json` 的 `revision` / mtime，返回 `revision` / `snapshotAt` / `stateUpdatedAt` / `stale`；`feel_status` / `feel_next` 暴露，stale 时 summary 提示以 `flow status` 为准。
- [stage-112] **闸门滥用提示**：`feel_next` 在 `plan_pending` 停留 >10 分钟时提示「有产物就推进，没有就合并/取消」。

### Changed
- [stage-112] `recovery` 增加 `lastError` / `resumeCount`（从日志派生，不新增存储）。
- [stage-112] `dsh/package.json`：version `1.5.4`、`requiresCli: ">=1.5.4"`。

### Fixed
- [stage-112] 跨会话恢复仍需扫描日志；`flow metrics` 无法观察日志体积与空转风险。

## [1.5.3] - 2026-10-31

> 批次版本（Patch 批次）：**派发/返回契约 + 恢复包 + 结构化交接 + 同步去重**。按新发布节奏，1.5.3 统一发布，不再为单项功能单独发版。

### Added
- [stage-111] **派发/返回契约（adapter）**：新增 `dsh/lib/adapters/dispatch.js`；`feel_next` 返回 `dispatch`（goal/context/boundaries/returnFormat/budget），boundaries 明确子 agent **禁读** `dev_last*` / `dev/current.md` / `status.md` / `flow.json`，返回 ≤10 行。
- [stage-111] **恢复包（adapter）**：新增 `dsh/lib/adapters/recovery.js`；`feel_status` 返回 `recovery`（active stage/phase/requirement、lastTransition、handoff ≤600 字、nextAction），新会话一次调用即可恢复，不必先读 `dev_last` 全文。
- [stage-111] **发布节奏（流程策略）**：`docs/VERSIONS.md` 新增「批次发布」规则——小功能合并批次、完成全门禁后统一 push + CI publish；禁止单功能即发版。

### Changed
- [stage-111] **结构化交接**：`openfeel-memory` 交接摘要采用固定键 `done: / next: / block:`；恢复包直接读取该段。
- [stage-111] **同步去重**：`syncDevStatus` 在 AUTO 内容未变时**不重写** `dev_last.md`（仅刷新 `.sync.json`），减少无意义写与审计噪音；返回值新增 `changed`。
- [stage-111] **DSH 提示段**：新增「派发契约」节；恢复指引改为优先 `feel_status.recovery`。
- [stage-111] `dsh/package.json`：version `1.5.3`、`requiresCli: ">=1.5.3"`。

### Fixed
- [stage-111] 派发无统一信封导致主会话被迫保留子任务细节/日志；恢复需扫多个文件。

## [1.5.2] - 2026-10-31

> 补丁版本（Patch）：**流程入口闸 + 调度/持久化调研**——修复「以调研/只读为由跳过阶段」的违规；无活跃阶段时研究/方案产物不可写；`feel_status` / `feel_next` 暴露 `workflowGate`。调研文档见 [docs/research/dispatch-persistence-2026-10-31.md](docs/research/dispatch-persistence-2026-10-31.md)。

### Added
- [stage-110] **DSH 入口闸**：新增 `dsh/lib/adapters/workflow-gate.js`；`feel_status` / `feel_next` 返回 `workflowGate={required,reason,message,actions}`，summary 前置「⚠ 无活跃阶段」提示。
- [stage-110] **研究产物守卫**：`dsh/lib/guard.js` 新增 `isResearchArtifactPath`——无活跃阶段时写 `docs/research/**` 拒绝（chore 也不能绕过），错误信息给出 `feel_req add → claim → feel_stage add`；拒绝事件写 `guard-audit.jsonl`（`event=guard_deny`）。
- [stage-110] **调研文档**：`docs/research/dispatch-persistence-2026-10-31.md`（当前拓扑、量化诊断、P0/P1/P2、1.5.2-1.5.4 顺序；含 Codex GPT-6.1-Sol 外部评审取舍）。

### Changed
- [stage-110] **DSH 提示段**：新增「流程入口」硬规则（先 `feel_status`；不得以调研/只读为由跳过阶段）；`docs/research/**` 无阶段会被拒。
- [stage-110] `dsh/package.json`：version `1.5.2`、`requiresCli: ">=1.5.2"`。

### Fixed
- [stage-110] 流程违规：研究/方案任务跳过 `feel_status` 与阶段创建（本次实测发生）。
- [stage-110] 研究产物此前无阶段也可写（doc 豁免），无摩擦、无审计。

## [1.5.1] - 2026-10-31

> 补丁版本（Patch）：**发布链路热修**——1.5.0 发版脚本把 `package-lock.json` 中所有 `1.4.0` 误替换为 `1.5.0`，导致 `natural-compare@1.5.0`（不存在）使 CI `npm ci` 失败、publish 未执行。仅回改锁文件三处；功能与 1.5.0 完全一致。

### Fixed
- [stage-109] `package-lock.json`：`natural-compare` 依赖范围 `^1.5.0 → ^1.4.0`（两处）+ `node_modules/natural-compare.version 1.5.0 → 1.4.0`；`npm ci` 恢复成功，CI publish 可重新执行。

### Changed
- [stage-109] `dsh/package.json`：version `1.5.1`、`requiresCli: ">=1.5.1"`。

## [1.5.0] - 2026-10-31

> 次版本（Minor）：**工作流瘦身**——只有 Feel 写状态；日志降级为简要记录；子 agent 不再读写 `dev_last`；状态记录改为「开始 / 转折 / 结束」节点 + CLI 每 30 分钟自动同步。不改相位机 / 审查 / 归档语义；无新增 JSON 出口。

### Added
- [stage-108] **`openfeel dev sync` / `dev status`**：CLI 维护 `dev_last.md` 的 `<!-- openfeel:auto:begin/end -->` 简要状态块（活跃阶段 / 需求 / 最近操作 / 同步时间）与 `.openfeel/dev/.sync.json`（`interval_minutes: 30`）；只替换受管块，不触碰手写内容；无 `--json`（零契约变更）。
- [stage-108] **节点 + 30 分钟自动同步**：`flow advance` 成功后，首次 / 超过 30 分钟 / 节点相位（`exec_running` / `review_passed` / `archiving` / `done`）自动调用同步（best-effort，不影响推进）。
- [stage-108] **适配器 `statusSync`**：`feel_next` / `feel_status` 返回 `{due,lastSync,intervalMinutes}`；`due=true` 时只提示「更新交接摘要 + `dev sync`」，不阻塞。
- [stage-108] **日志上限**：`flow.json.log` 仅保留最近 **200** 条（`MAX_LOG_ENTRIES`）。

### Changed
- [stage-108] **Only-Feel 状态归属**：`dev_last*` / `dev/current.md` / `status.md` / `flow.json` 只由 Feel（主会话）写；**子 agent 不读不写**（上下文由派发 prompt / 交接文档提供）——落点：agents-md、Claude constraint、4 份 `feel.md`、DSH 提示段。
- [stage-108] **日志不再强制**：`openfeel-logging` 从「必录事件清单 / 逐阶段实时写入」降级为「默认不写；跨会话/公共事件 ≤3 行」；`openfeel-memory` 从「会话结束必写 + 阶段清单」降级为「默认不加载不写；recover/用户要求时按需」；`openfeel-workspace` 标注 `dev/current.md` 可选。
- [stage-108] **`dsh/package.json`**：version `1.5.0`、`requiresCli: ">=1.5.0"`。

### Fixed
- [stage-108] 日志/写状态消耗过多 token 与时间、经常空转（记录责任分散、逐操作写日志、子 agent 读写状态文件）。
- [stage-108] `dev_last.md` 长期停滞（本仓最后更新 2026-10-15）；改由 CLI 按节点/30 分钟自动刷新简要状态。

## [1.4.0] - 2026-10-30

> 次版本（Minor）：**写入门禁分层 + chore 微变更通道**——依据 `OpenFeelHarness/docs/feedback/openfeel-write-gate-friction-2026-10-30.md`（UI 微调被拦 3 次，改 1 行 CSS 需 7 步编排）。源码门禁、受保护路径、混合目标三条底线不变；不新增 JSON 出口（`chore` 无 `--json`）。

### Added
- [stage-107] **静态展示资源豁免（`dsh/lib/guard.js`）**：新增 `isPresentationalAssetPath()` + `PRESENTATIONAL_EXTENSIONS`——`.css/.scss/.html/.svg/.png/.jpg/.jpeg/.webp`，以及路径含 `assets/` 或 `public/`（支持 `crates/cli/assets/index.html` 嵌套资产目录）。与 doc/note 同层：任意相位可写、不要求活跃阶段；**混合目标从严**（任一源码 → 按源码规则）。
- [stage-107] **guard 审计**：doc/静态资源豁免与 chore 放行时，追加 JSONL 到 `.openfeel/log/guard-audit.jsonl`（`time/event/tool/reason/phase/paths`），best-effort 不阻塞放行。
- [stage-107] **`openfeel chore "<说明>"`（微变更通道）**：无活跃阶段时开启 60 分钟写窗口（源码也可写），`--end` 收口、`--status` 只读状态；不写 `flow.json.stages`，只留 `chore_start` / `chore_end` 日志与 ephemeral `.openfeel/chore.json`。存在活跃阶段时拒绝开启，guard 也不生效（不绕过相位门）。

### Changed
- [stage-107] 注册选项 `41 → 43`（`chore --end` / `chore --status`）；成功出口仍 40（无新增 JSON 出口）。
- [stage-107] `dsh/package.json`：version `1.4.0`、`requiresCli: ">=1.4.0"`。

### Fixed
- [stage-107] 全阶段 done 后修改 `.html` / `.css` / 图片 / `assets/**` 被误判为源码而拒绝（反馈验收 1）。
- [stage-107] 改一行 UI 样式需 7 次编排操作（新增 1 步 chore 通道）。

## [1.3.5] - 2026-10-30

> 补丁版本（Patch）：**统一 shell 工具推荐**——Windows 下优先 `bash`（Git Bash），其次 `pwsh`（PowerShell 7）；macOS/Linux 用 `bash`；默认不用 `cmd.exe`。仅提示/文档层变更，不改任何 CLI 命令、相位机、写入门禁、审查/归档语义。

### Added
- [stage-106] **DSH Feel 系统提示**（`dsh/lib/surface/prompt.js`）：新增「命令执行 / Command Execution」节（zh/en），明确 Windows 优先 Git Bash、其次 PowerShell 7，同一任务保持同一 shell。
- [stage-106] **OpenFeel 全局约束模板**：`agents-md/{zh-CN,en}.md` 与 `claude/constraint/{zh-CN,en}.md` 的「跨 Agent 工具使用约束 / Cross-Agent Tool Usage Constraints」新增第 5 条（同一文案）；`openfeel-tool-usage` skill 的工具名映射表后新增 Windows shell 选择注记。

### Changed
- [stage-106] **`dsh/package.json`**：version `1.3.5`、`requiresCli: ">=1.3.5"`。
- [stage-106] **文档**：`dsh/README.md` / `ADAPTER.md` 记录提示段新增推荐；README / GETTING_STARTED / VERSIONS / cli-usage skill 快照同步。

### Fixed
- [stage-106] 无（本版为提示口径统一，不修复缺陷）。

## [1.3.4] - 2026-10-30

> 补丁版本（Patch）：**修复分发链路断点**——依据 `OpenFeelHarness/docs/feedback/openfeel-1.3.3-retest.md`（1.3.3 复测）。1.3.3 的代码修复已存在，但适配器透传、部署版本标记与「宿主未重启」检测三处断点导致用户无法闭环。CLI 相位机 / REV 语义 / 写入门禁不变。

### Added
- [stage-105] **`setup --check` 三态化（restart-required）**：`update_state.json` 追加可选 `adapters: { dsh: { version, hash, deployed_at } }`；DSH 适配器在宿主启动时把自身 `lib/**` 指纹写入 `~/.openfeel/adapter-host-dsh.json`；`checkGlobalDeployment` 在版本一致时比对部署指纹与宿主加载指纹——不一致或缺失 → `restart-required`（明确提示「完全退出并重启宿主」，不再指引重跑 setup）。`--json.status` 取值扩展，键集/键序不变。
- [stage-105] **适配器指纹（新增 `src/core/adapter-hash.ts` + `dsh/lib/adapters/host-state.js`）**：同算法（`lib/**` 相对路径排序 + CRLF→LF + 逐文件 sha256 后拼接再 sha256）；根仓测试直接比较两侧对真实 `dsh/` 目录的输出，锁定 parity。
- [stage-105] **适配器 `review_add` 透传 `--stage`**：`op` / `stage` 二选一（皆缺 → `FEEL_BAD_USAGE`）；fast 无 op 场景 `feel_flow action=review_add --stage <id>` 可直接建阶段级 REV。

### Changed
- [stage-105] **`setup` 刷新部署版本事实源**：`--tools dsh`（含「已是最新、跳过」分支）部署成功后也刷新 `update_state.openfeel_version` / `last_update`，并写入 `adapters.dsh`；修复「dsh-only setup 后 `--check` 永远 mismatch」的死循环。
- [stage-105] **被动部署提示**：`restart-required` 也会在 TTY 下向 stderr 提示（每进程一次），文案区分「重启宿主」与「重跑 setup」。
- [stage-105] **`dsh/package.json`**：version `1.3.4`、`requiresCli: ">=1.3.4"`。

### Fixed
- [stage-105] `feel_flow review_add --stage` 报「请提供 --op 或 --stage（二选一）」（适配器未透传）。
- [stage-105] `setup --check` 无法区分「适配器文件旧」与「文件已新但宿主未重启」，升级后形成 setup → check → setup 死循环。
- [stage-105] `setup` 在「已是最新 / 跳过」分支不更新 `update_state.json` 版本标记。

## [1.3.3] - 2026-10-30

> 补丁版本（Patch）：**fast 模式结构性修复**——依据 `OpenFeelHarness/docs/feedback/openfeel-feedback-2026-10-30.md` 的 13 项非预期拒绝（P0×4 / P1×5 / P2×4）逐条修复。合法相位枚举仍 15 项，full 转移表不变；CLI JSON 契约只增不改（无新增成功出口 / 注册选项）。

### Added
- [stage-104] **阶段级 REV（P0-2）**：`flow review add` 的 `--op` 改为可选并新增 `--stage <id>`；fast 无 op 阶段挂阶段级审查条目（`op = stageId` + 新增可选字段 `ReviewItem.stage`）。新增单点 `reviewStageOf()`，`listStageBlockingOpenReviews` / `archive <stage>` 摘要统一消费（修复 `lastIndexOf('.')` 误切含点 stageId）。`--auto-fix` 仍要求 `--op`。
- [stage-104] **fast 返工边（P0-3）**：`FAST_TRANSITIONS.review_passed = ['archiving', 'exec_running']`；`flow advance --reason <text>` 将整改原因写入审计键 `rework_reason`（仅 `review_passed → exec_running` 一步）。`findPhasePath` 对 `review_pending → exec_running` 的同深度双路径显式 tie-break（优先经 `review_failed`，修复前行为不变）。
- [stage-104] **写入门禁风险分层（P0-1 / P0-4）**：`dsh/lib/guard.js` 新增 bootstrap 例外（无 `.openfeel/` 且全部为新增文件、`apply_patch` 全部为 `*** Add File:` → 放行并提示补账本；`.openfeel/**` / 已存在文件 / Update / Delete / Move 仍拒绝）与 doc-note 分层（`docs/**` 与 `.md/.mdx/.txt/.rst/.adoc` 不绑相位；混合目标从严）。`parsePatchTargets` 追加 `entries[{path,kind}]`（`paths` 形状不变）。
- [stage-104] **归档 git 告警（P2-1）**：`autoCommitOnDone` 先判 `git rev-parse --is-inside-work-tree`；非 git 仓库显式 `[WARN]`「无版本兜底」，无变更仍仅跳过提示。
- [stage-104] **阶段映射文档（P2-2 / P2-3）**：`docs/commands.md` 新增「阶段 ID 归一化与 plan 目录映射」；`plan stage add` 输出回显 `.openfeel/plan/{series}/{stageDir}/`；`openfeel-cli-usage` skill / README 同步。

### Changed
- [stage-104] **聚焦（P1-1）**：`plan stage add` 注册后原子设置 `pipeline.current.stage`；`flow next` 在 current 为空时从 `stages` 只读派生（插入序首个非 done，不写盘；guards 末位提示）。
- [stage-104] **单一真源（P1-2）**：`advanceStagePhase` 将受管字段（状态 / 当前责任 Agent / 上一责任 Agent / 更新时间）派生写入 `status.md`（一次读一次写、按阶段锁、缺失跳过）；骨架责任 Agent 初值改为 `mapPhaseToAgent(plan_pending)`。DSH `stringifySafe` 改为**祖先栈**判环（DAG 重复引用不再显示 `[循环引用]`）。
- [stage-104] **模板（P1-3）**：`resolveSchema` 增包根 `schemas/` 回退（源码检出与单包安装均可用）；`instructions --change` 可选，缺省 `default`。
- [stage-104] **配置（P1-4）**：新增 `readExplicitConfigDefaults()`；仅当项目 `config.yaml` **显式**声明 `execution_mode=auto` 且 `auto_advance=disabled`（静默无效组合）时，`flow advance` 告警、`flow next` guards 提示；builtin / 模板默认 `manual+enabled` 不告警。
- [stage-104] **档位（P1-5）**：`flow advance` 成功输出回显生效审查档位与来源（显式声明 / 缺省 full）；`--quiet` 时静默。
- [stage-104] **init（P2-4）**：`.openfeel/` 目录惰性化——init 只建 `plan` / `kb` / `dev` / `log`（+ dev `note` / `current_archive`）；`code_review` / `bugs` / `users` / `tmp` / `manual` / `update_conflicts` 首次使用时按需创建（`ensureLazyDir`）。文件集不变。
- [stage-104] **dsh/package.json**：version `1.3.3`、`requiresCli: ">=1.3.3"`。

### Fixed
- [stage-104] 空白工作区首次写入被整体拒绝（bootstrap 例外）。
- [stage-104] 阶段收口 / 非 exec 相位写文档被拒（doc-note 分层）。
- [stage-104] `review_passed` 下无返工路径、只能 `reset` / `--force`（fast 返工边）。
- [stage-104] `plan stage add` 后 `flow next` 误报「无活跃阶段」（原子聚焦 + 只读派生）。
- [stage-104] `flow next` 与 `status.md` 责任 Agent 不一致（派生写）。
- [stage-104] `stages[].deps` 误显示 `[循环引用]`（祖先栈判环）。
- [stage-104] 空白项目 `instructions` 报「找不到 Schema」（包内置回退）。
- [stage-104] 双开关依赖只写在注释、静默无效（显式组合告警）。
- [stage-104] 展示档位 ≠ 生效档位且缺省无回显（advance 回显）。
- [stage-104] 归档时 git 未初始化静默跳过（显式告警）。

## [1.3.2] - 2026-10-24

> 补丁版本（Patch）：**DSH 适配器激活与写入门禁**。新增 `ctx.tools.guard()` 同步拒绝文件修改工具，非 OpenFeel 工作区注入 bootstrap；CLI JSON 契约保持 **13 错误码 / 40 成功出口 / 41 注册选项**。

### Added
- [stage-103] **DSH 写入门禁（`dsh/lib/guard.js`）**：用 `ctx.tools.guard()` 同步拒绝 `edit` / `write` / `apply_patch` / `str_replace_editor`。`.openfeel/**` 流程产物任意阶段可写（`.openfeel/flow.json` / `.openfeel/**/status.md` 除外）；`.openfeel/` 外源码要求存在 `exec_running` 阶段；无活跃阶段时拒绝，general 需求 `in_progress` 例外。
- [stage-103] **非项目 bootstrap**：`activation: auto` 时未初始化工作区注入短提示（只读可进行；写文件按 `enforce` 说明），不再静默；`always` 注入完整纪律，`off` 不注入。
- [stage-103] **配置**：`enforce: always|project|off`（默认 `always`）、`activation: auto|always|off`、`mutatingTools`、`allowGeneral`；`ctx.effect()` 管理 guard disposer，`ctx.tools.guard` 缺失时降级警告。
- [stage-103] **apply_patch 目标解析**：解析全部 `*** Update/Add/Delete File:`、`*** Move to:`、`---/+++` 头；全部内部才放行，混合/无头保守拒绝；忽略 `/dev/null`、去引号、Move 源校验。
- [stage-103] **测试**：`dsh/test/guard.js` 36 条门禁矩阵；`dsh/test/verify.js` 增至 83 条；contract 42 / integration 10 不变。

### Changed
- [stage-103] **默认 `enforce=always`**：无 `.openfeel` 的工作区也会拒绝文件写入，防止绕过 `openfeel init` 创建项目产物；`project` / `off` 可 opt-out。
- [stage-103] **`dsh/package.json`**：version `1.3.2`，`requiresCli: ">=1.3.2"`；仍 `private: true`，不单独发布 `openfeel-dsh`。
- [stage-103] **文档**：`dsh/README.md` / `ADAPTER.md` 增写入门禁与边界；`docs/VERSIONS.md` / `CHANGELOG.md` / README 版本快照同步。

### Fixed
- [stage-103] **新工作区静默绕过**：`dsh/lib/index.js` 原先在 `resolved.initialized === false` 时直接返回空提示；现按 `activation` 注入 bootstrap，并可用 `enforce=always` 在工具层拒绝写入。

## [1.3.1] - 2026-10-17

> 补丁版本（Patch）：修复 `setup --tools dsh` 在 DSH profile lockfile 过期时因 pnpm frozen-lockfile 部署失败。

### Fixed
- [stage-102] **`setup --tools dsh` 的 pnpm frozen-lockfile 失败**：profile 的 `openfeel-dsh` `link:` 目标变化会使 `pnpm-lock.yaml` 的 specifier 过期；内部以 `CI=1` 执行 `pnpm install` 时默认 frozen-lockfile，直接 `ERR_PNPM_OUTDATED_LOCKFILE` 并回滚。现改为 `pnpm install --prefer-offline --no-frozen-lockfile`，允许更新 profile lockfile；保留 180s 超时、非交互、失败回滚 `package.json`、`DSH_PNPM_INSTALL_FAILED` / `INTERNAL_ERROR` 映射。`pnpm-lock.yaml` / `node_modules` 在失败时可能保留部分更新，下一次 `setup` 收敛。
- [stage-102] **测试**：`test/core/dsh-profile.test.ts` 断言第二次 `spawnSync` 的 argv 为 `install --prefer-offline --no-frozen-lockfile`（`cwd` 为 profile 目录）。
- [stage-102] **文档**：`docs/commands.md` setup 节与 `manual/core/dsh-profile.md` 记录原因与 lockfile 更新语义。

## [1.3.0] - 2026-10-17

> 次版本（Minor）：**DSH 适配器单包分发 + `setup --tools dsh` + README 重构**。`openfeel` npm 包内置 `dsh/` 运行文件；`update --tools dsh` 明确拒绝；修复适配器 6 处位置参数空值；JSON 契约保持 **40 成功出口 / 41 注册选项 / 13 错误码**，退出码语义不变。

### Added
- [stage-101] **`openfeel setup --tools dsh [--dsh-profile <name>]`**：把 `<openfeelRoot>/dsh` 以 `link:` 依赖写入 DSH profile 的 `package.json`、追加 `dsh.profile.bundles`、按需执行 `pnpm install`，并提示重启 DSH 宿主。默认部署全部已检测 profile；`--dsh-profile` 可窄化；写前备份、幂等重跑、失败回滚。
- [stage-101] **单包分发**：根 `package.json.files` 纳入 `dsh/lib`、`dsh/cordis.patch.yml`、`dsh/package.json`、`dsh/README.md`、`dsh/ADAPTER.md`、`dsh/docs`；不发布独立 `openfeel-dsh` 包。
- [stage-101] **README 推荐用法**：新增「需求驱动 + 快速迭代（fast）」章节（`req add/claim` → fast 阶段 → `flow next`），三语 README 同步。
- [stage-101] **`docs/VERSIONS.md`**：面向用户的版本能力概览（中文主文件 + English highlights），README 仅保留索引。

### Changed
- [stage-101] **README 瘦身**：v1.1.2~v1.2.4 版本能力章节迁出至 `docs/VERSIONS.md`；三份 README 顶部新增 VERSIONS / CHANGELOG 索引行与 DSH harness 标识。
- [stage-101] **`openfeel update --tools dsh` 拒绝**：DSH 是全局部署，命令层在 auto-init / 写盘前 exit 1 并指引 `setup`；`supportedTools` 增加 `dsh` 条目（`enabled=false`、`projectDeployable=false`）。
- [stage-101] **`dsh/package.json`**：version 与根包 lockstep（1.3.0），`requiresCli: ">=1.3.0"`；仍 `private: true`。
- [stage-101] **DSH 适配器既有修复纳入本版**：工作区解析不回溯、提示段经 `agents.currentInitiator()` 取会话 cwd、7 处文本回显改 `--json`、`ARCHIVE_EXISTS` 语义适配、`config get --all` 调用面。

### Fixed
- [stage-101] **适配器位置参数空值（6 处）**：`pushOption(argv, '', value)` 会把空字符串当作 flag 推入 argv，导致 Commander 多收一个空位置参数（实测 `feel_op create` 报 `too many arguments`）。新增 `pushPositional` 并替换 `feel_op create/register`、`feel_checkpoint list`、`feel_verify config_effective`、`feel_plan scheme_list/roadmap_show`；补真实 CLI 断言与 CI 语法检查。

## [1.2.4] - 2026-10-17

> 补丁版本（Patch）：**DSH ACTION-GUIDE A1~A5 收口**。完成 1 项数据安全修复（A1）+ 7 个新增 `--json` 命令面（A2~A4）+ 1 项既有出口扩展（A5）；JSON 契约升级为 **40 成功出口 / 41 注册选项**；退出码 0/1/2/3 语义与 phase 枚举/转移表不变；**不修改 `dsh/`**。

### Added
- [stage-100] **A2 `plan stage list --json`（#34）**：`{schemaVersion,stages,count}`；`stages[]` 七键 `id,phase,status,deps,workflowMode,opsTotal,opsDone`，数据源为 flow.json 注册阶段（声明序），`workflowMode` 经 `resolveStageWorkflowMode` 单点；空态 `[]/0` + exit 0；人类输出（计划目录清单）逐字不变。
- [stage-100] **A3 `model list|get --json`（#35/#36）**：list `{schemaVersion,scope,agents:[{agent,provider,model,source}]}`；get `{schemaVersion,scope,agent,provider,model,source}`；`provider`/`model` 按生效值首个 `/` 切分（无 `/` → `provider:null`），`source` 取生效层（default > project > global）；非法 scope → `INVALID_ARGUMENT`；人类输出不变。
- [stage-100] **A4 三命令面（#37~#40）**：`flow retry --op <id> --json`（六键 `op,attempts,maxAttempts,exhausted,state`）；`lint i18n|kb --json`（`{target,ok,issues:[{path,message}]}`，`ok:false` 仍为成功文档并保持 exit 1 门禁语义；人类行与结构化 issues 同源）；`roadmap show [version] --json`（`version` + 表头驱动的 `milestones[{title,theme,stage,deliverable}]`，兼容 3/4 列历史格式，无版本 `null/[]`）。
- [stage-100] **A5 `config get --all --json`（#27 扩展）**：项目模式一次取全量 `{schemaVersion,scope:"project",defaults:{execution_mode,auto_advance,merge_mode,workflow_mode}}`（`resolveConfigDefaults` 四键固定序）；不再报 `key-required`；`--all` + `--global` / `--all` + key → `INVALID_ARGUMENT`（`all-global-conflict` / `all-with-key`）。

### Fixed
- [stage-100] **A1 `archive <stage>` 覆盖保护（数据安全）**：目标归档文件已存在且未显式 `--force` → `ARCHIVE_EXISTS` / `kind=refusal` / exit 1，且**零写盘**（存在性检查位于 `mkdirSync` / 归档写入 / `appendLog` / `save()` / KB 同步之前；主判据 = 归档内容 SHA-256 + `flow.json` revision + `log[]` 长度 + KB 条目数）。人类模式与 `--json` 模式行为一致；`--force` 仅绕过归档文件覆盖保护。保护为**归档文件级**（`archive v1.2.0-stage-78` 与 `archive stage-78` 派生不同目标文件、互不触发）。

### Changed
- [stage-100] **错误码表 12 → 13 行**：新增 `ARCHIVE_EXISTS`（refusal/1，追加于 `ARCHIVE_FAILED` 之后）。
- [stage-100] **JSON 契约计数 33/34 → 40/41**：新增 #34~#40；`lint kb` 与 `lint i18n` 为两个独立 Commander 子命令，各计 1 个注册选项；`flow advance --json` 仍为错误模式开关（不计成功出口）。
- [stage-100] 版本全链路 **1.2.3 → 1.2.4**（A 类 6 载体 / 8 文件 / 10 处 + B 类生成物 + C 类文档多载体）。

### Compatibility
- **退出码**：0 成功 / 1 预期拒绝 / 2 并发冲突 / 3 内部错误，语义全部不变。
- **JSON 契约**：既有 33 个成功出口字段键集、键序与类型零改动；新增出口只增不改；单一 `schemaVersion` 首键；人类输出逐字不变。
- **行为**：A1 检查先于任何写盘；未归档阶段回归不变；`config get` 既有 key 路径不变；`lint` 人类输出与退出码不变。
- **边界**：`dsh/` 零 diff；未纳入 lint/build/发布扫描；无新增第三方依赖；phase 枚举 15 项 / 转移表不变；存量 `flow.json` 零迁移零注入。

## [1.2.3] - 2026-10-17

> 补丁版本（Patch）：**v1.2.2 转出项收口**。不新增功能 / 字段 / 配置键 / 第三方依赖；33 成功出口 / 34 注册选项契约不变。

### Fixed
- [stage-99] **并发 JSON 退出机制统一（REV-95-009）**：`handleConcurrentConflict` 的 JSON 分支由 `process.exit(2)` 改为「输出 `FLOW_CONCURRENT_CONFLICT` envelope → 置 `process.exitCode=2` → return」，与 `failCli` 同机制（规避 Windows 管道 stdout 截断）；非 JSON 分支 `console.error + process.exit(2)` 逐字不变；`handleAddStageError` 返回类型 `never → void` 并显式 return；10 个调用点（直接 8 + `handleAddStageError` 调用方 2）逐点核对无 fallthrough。
- [stage-99] **`flow advance --help --review-tier` 文案订正（REV-98-003 第 6 项）**：源码 help 与 i18n zh/en 由「缺省=按模式派生」订正为「缺省=full（零裁剪）」；按模式派生的是 `flow phases --json.reviewTier` 展示值；`flow advance` 缺省行为零改动。
- [stage-99] **`req` 内联过滤单点化（REV-97-006）**：`req show` 与 `req set --workflow-mode` 的 `requirement_id` 内联过滤改为复用 `listLinkedStages`（命令层输出面 + 聚合投影唯一实现）；`req split` 与 core 引擎层 `allLinkedStagesDone` / `hasLinked` 保留；纯等价重构、行为零变化。

### Changed
- [stage-99] **锁等待超时 E2E 测试钩子（REV-98-006①，test-only）**：`withFileLock` 增 `OPENFEEL_TEST_MODE=1` 门控的 `OPENFEEL_TEST_LOCK_TIMEOUT_MS` / `OPENFEEL_TEST_LOCK_STALE_MS` 注入面（函数体内读取、显式 options 优先、非法值回落）；生产默认 `timeoutMs=5000` / `staleMs=3000` 与算法零改动；非公开 CLI 契约。新增 `test/cli/lock-timeout.test.ts` 稳定断言锁超时归 `INTERNAL_ERROR/internal/3`。
- [stage-99] 版本全链路 **1.2.2 → 1.2.3**（A 类 6 载体 / 8 文件 / 10 处 + B 类双生成物 + C 类文档多载体）。

### Compatibility
- **退出码**：0 成功 / 1 预期拒绝 / 2 并发冲突 / 3 内部错误，语义全部不变；并发 JSON envelope 内容与 exit 2 不变。
- **JSON 契约**：33 个成功出口 / 34 个注册选项键集与键序不变；非 JSON 并发 stderr 文案逐字不变。
- **行为**：`req show` / `req set` / `req split`、`flow advance` 缺省档位输出不变；存量 `flow.json` 零迁移零注入。

## [1.2.2] - 2026-10-17

> 契约型功能主题版（Z 级）：**CLI 机器可读契约与调度决策下沉**（DSH 适配器需求 11 项 P0×3 / P1×4 / P2×4 一次交付）。
> 口径：**33 个成功 JSON 出口**（19 既有 + 14 本版新增）+ **34 个注册 `--json` 选项**（含 `flow advance --json` 错误模式开关）；`--version --json` 单列，不计入 33/34。权威说明见 `docs/json-contract.md`。

### Added
- [stage-96] **`flow next [--json]`（P0-1 调度决策权威）**：CLI 单点输出「当前阶段 + 相位 → 负责 Agent → 合法下一相位 → 建议命令 → 守卫 → 阻塞 REV」共 **12 键**；`responsibleAgent` 与 `mapPhaseToAgent`、`legalNextPhases` 与 `getAvailablePhases`、`blockingReviews` 与 `assertNoBlockingOpenRev` **同源**（无第二份映射）；只读零写盘。
- [stage-95] **全局 `--project <path>`（P1-2）**：根命令注册，`runCli` 唯一注入点预扫描并 `process.chdir`（语义等价「以该路径为 cwd」）；语言解析按目标项目、`--log-file` 保留原始 cwd；`knowledge dedup` 保留本地声明并以 `optsWithGlobals()` 单点解析（C2 扩展路径）。
- [stage-97] **13 个读命令面 `--json`（P0-2）**：`stage status`（单阶段 / 无参）、`flow recover`、`flow checkpoint list`、`flow log`、`project overview`、`knowledge search|list|index|dedup`、`config get|effective`、`view list`、`plan scheme list`，共新增 **#20~#33** 中 13 个成功出口。
- [stage-95] **`--version --json`（P2-3）**：`{schemaVersion, version, node}` 三键；`-v --json` 同形；`--version` 人类输出逐字不变。
- [stage-97] **`archive <stage> --json`（P2-4）**：`{schemaVersion, stage, archivePath, opsCount, reviewsCount, knowledgeExtracts}`；失败路径 `ARCHIVE_FAILED`/refusal/1、异常 `INTERNAL_ERROR`/internal/3。
- [stage-97] **`flow archive --dry-run --json` 判据明细（P1-4）**：暴露 `eligible` / `unfinishedStages` / `blockingReviews`；判据复用既有单点，`--dry-run` 零写盘。
- [stage-96] **`flow status --json.stages[]` 5 个调度属性（P1-1）**：`workflowMode` / `requirementId` / `reviewTier` / `effectiveReviewTier` / `opsSummary`（`opsSummary.total = Σ byState`）。
- [stage-96] **`flow phases --json` 档位消歧字段（P2-2）**：保留既有 `reviewTier`（展示值），追加 `displayReviewTier`（同值显式名）与 `effectiveReviewTier`（`flow advance` 缺省生效档位 = `full`）；`flow status --json.stages[]` 与 `flow next --json` 同口径给出两者。
- [stage-97] **`req list --json` 关联阶段 / 进度（P1-3）**：末位追加 `linkedStages`（阶段 ID 数组）与 `progress`（`{done,total}` 对象）；零关联需求为 `[]` + `{done:0,total:0}`。
- [stage-95~97] **机器可读错误封装（P0-3）**：新增统一错误层（`src/core/errors.ts` + `src/commands/shared/errors.ts` + JSON 模式单点）；文本型失败改为 `{error:{code,kind,message,detail}}`，`kind ∈ {refusal,internal}`；**退出码 0 成功 / 1 预期拒绝或用法错误 / 2 并发写冲突（语义零改动）/ 3 内部错误（新增）**；legacy 载荷（`flow archive*` / `req *` 的 `error` 字符串）保留类型与键序、仅末尾追加 `errorKind`；`docs/json-contract.md` 载 **12 行 code→kind→exitCode 映射表**。

### Changed
- [stage-95] **JSON 输出契约冻结（P2-1）**：`--json` 模式 stdout 恰好 **一个** JSON 文档；`schemaVersion` 恒为首键；可选字段一律 `null`、数组 `[]`、映射 `{}`；冻结键序稳定。`docs/json-contract.md` 为**单一权威**（33 成功出口全表 + 注册选项 34 + legacy 双形态 + 迁移边界）。
- [stage-95] **`instructions --json` 追加 `schemaVersion` 首键**（既有键与键序顺延保留）。
- [stage-95] **`flow archive show --json` 首键重定位**（`schemaVersion` 前置，其余键序不变）。
- [stage-92/96] **`flow advance --review-tier` 生效缺省 = `full`**：`flow phases --json.reviewTier` 为**展示值**（按工作流模式派生），**生效值**见 `effectiveReviewTier`；`docs/commands.md` / `.openfeel/manual/cli/commands.md` 登记该口径勘误；**源码 help 字符串订正转 v1.2.3 首个规划阶段**（收口期冻结零代码改动）。

### Fixed
- 无（本版为契约增量，不修改既有行为语义）。

### Security
- 无。

### Compatibility / Migration
- **既有 19 个成功出口字段零破坏**：只增不改、键序保留；人类输出逐字不变。
- **退出码**：0/1/2 语义不变，**3 仅新增**（internal）；并发冲突仍为 2 且 `kind=refusal`。
- **legacy `error` 恒 `string`**、键序不变、仅末尾追加 `errorKind`。
- **phase 枚举 15 项 / `advanceAccepted` / full-fast 转移行为不变**；存量 `flow.json` **零迁移、零注入**。
- **`--project`**：不改变既有命令语义；未传时行为与 1.2.1 完全一致。
- **REQ-001 L80 勘误留痕**：需求原文括注「2 = 内部错误或用法错误」与实现不符，权威口径为 **2 = 并发写冲突、3 = 内部错误、1 = 预期拒绝 / 用法错误**；该括注登记为**需求文本勘误**，**不修改 REQ-001 机读数据**（同口径见 `docs/json-contract.md` 与 stage-95 计划）。

### Documentation
- [stage-98] 文档多载体同步：README×3 / `docs/GETTING_STARTED.md` / `docs/commands.md` / `docs/json-contract.md`（定稿）/ `.openfeel/manual/{index,cli/commands,core/flow-manager,core/json-contract,core/req}.md` / `openfeel-cli-usage` skill 快照。
- [stage-98] 版本全链路 **1.2.1 → 1.2.2**（`package.json` / `package-lock.json` / `.openfeel/config.yaml` / 配置模板 / 部署模板 / 双生成物）。
- [stage-98] 本仓收口基线：**74 测试文件 / 1894 用例**、`lint i18n` **983**、**33 成功出口 / 34 注册选项**、**21 阶段**。

## [1.2.1] - 2026-10-15

### Added
- [stage-86~93 + 94] **三模式架构（`full` / `fast` / `general`）**：`workflow_mode` 值域 2 值 → **3 值**（默认仍 `fast`）；`general`（无流水线）**仅需求级合法**（阶段级 / 部署级写入面显式拒绝 + wizard 不提供选项）；模式解析链插入**需求级层**（`status.md > 需求级 > config.yaml > profile.yaml〔不承载〕> builtin`，`ConfigSource` 第 5 值 `'requirement'`）；**升级不降级**（`general → fast / full` 显式可用，反向无隐式动作）
- [stage-87] **需求接取与拆分（`req split`）**：**拆分即发布**（子需求一次入 `scheduled`）+ 顺序 ID 单源派生 + 父终态门 + 恰 1 条 `requirement_split` 审计 + 父零副作用；`parent_id?` **仅溯源**（不入聚合 / 不入 done 门 / 不参与 `PATCH_WHITELIST`）；**并行接取**（`req claim` 互不阻塞）；**需求与版本解绑**（`target_version` 为纯展示 / 过滤 / 排序维度，非门）；`req` 命令组 **10 → 11 子命令**（`split` = 首个 repeatable option + 首个带 `--json` 的写命令）
- [stage-88] **通用工作者直接调度（双口径）**：opencode 侧 = 嵌套 `task` 工具；Claude Code 侧 = Handoff 直发；统一语义「调度请求直发，不经多级转介」+ 能力探测 go/no-go；**并行编排契约**（独立子任务并行〔无依赖链 ∧ 无文件冲突域〕+ 合并顺序 + 留痕纪律）
- [stage-89] **新 agent `openfeel-explorer`（只读）**：承接「调研 / 探索」路由；工具集下限恰 4 项（Read / Glob / Grep / Bash），无写、无派发；Agent 数 **9 → 10**；权限模型「**10 agent**」白名单键集
- [stage-86] **可观测性**：`metrics.json` 经 `recordRun` 接线（`MetricsStore` + `PHASE_AGENT_MAP` 归属单点）；CLI 运行日志行**向后兼容扩展**（`[project=…] [session=…]` + `duration_ms`，前缀不变）；op 级时间戳（`attempted_at?` / `completed_at?`）；跨会话恢复标注 `resumed`；会话标识三级链（env → project 续接文件 → proc 兜底）
- [stage-92] **审查档位（`full` / `lean` / `skip`）**：与工作流模式**正交的第二轴**——模式定基表，档位裁审查关（`full` 零裁剪 / `lean` 裁 `scheme_review` / `skip` 裁 `plan_review` + `scheme_review`；**恒保留**代码审查关 / 测试关 / 归档关）；单源常量 `REVIEW_TIERS` + `TIER_PRUNED_PHASES`；`flow advance --review-tier <tier>`（缺省按模式派生）+ `flow phases --json` 末位追加 `reviewTier`（既有 6 键逐字保留，**7 键**）；归档轻量化
- [stage-91] **提示词瘦身收编点**：40 份 agent 模板重写为「**skill 索引壳 + 最小约束**」+ skill 下沉（skills **18 → 22**：delegation / logging / memory / context-hygiene 新建 + workspace / get-stage-status / tool-usage / wizard / recover 增补）；骨架模板 4 组单一归属 `openfeel-workspace`
- [stage-94] **模型默认值统一 + 部署非破坏性（用户主权键 `model`）**：opencode 侧显式默认收敛为 `deepseek/deepseek-flash`；部署（`setup` / `update`）对用户既有 `model` 键**无则创建、有则不覆盖**（不与用户既有值双写漂移）
- 版本全链路收口 1.2.0 → 1.2.1；i18n 基线 **939 → 945**（stage-91~93 汇总：+1 键 `req.err.doneGateTmpl` 与既有修订键；逐键列名见阶段报告）

### Fixed
- [stage-93] **`req/BUG-002`：`general` 需求完成路径（死锁）**——`general` 恒零关联阶段（载体制双向门）而 done 门要求全部关联阶段 done，两者交叉使 `general` 需求**永远无法 `done`**。修复：新增导出谓词 `canCompleteRequirement`（**载体制对偶完成路径**，判据 = 需求自身 `workflow_mode` **字段直判**，与载体制门**同源**；禁解析级联）+ `applyStatusChange` done 门**单点消费**；`general` 且有链接（数据损坏态）**从严回落**路 1；非 `general` 判定单源 `allLinkedStagesDone` **不变**；done 门拒绝**文案专用化**（`req.err.doneGateTmpl`，错误码恒 `invalid_status`）
- [stage-93] **`cli/BUG-011`：档位裁剪致当前相位无跳转目标**——阶段**恰停于被裁剪相位**（如 `plan_review` + `skip`）时该档位无可达目标（仅 `--force` 可绕行）。修复：裁剪**只作用于入边 / 目标侧**——被裁剪相位**保留出边**（可正常向该档位下游推进，零 `--force`）；「**进入**被裁剪关」仍不可达；`full` 档零裁剪逐字不变
- [stage-93] **`templates/BUG-007`：en 归档官指针悬空**——`§Archive Mechanical Checklist` 指向的节标题仅中文（目标节 `openfeel-logging` §7）。修复：改中文节名 `§归档机械核对清单`（源 ×2 + 生成物同批重生成），并补「**具名 § 指针字面命中**」断言（正控 ≥ 4 + 负控）防再犯
- [stage-93] `REV-92-006` 处置：`flow.advance.depthExceededTmpl` **追加**「目标可能不可达」提示（BFS / exit code / 零写盘**逐字不变**）

### Changed
- **无默认行为变更**（除上述**有意变更且登记**项）；既有命令接受集 / 输出契约逐字保留。
- **有意变更清单（已登记；禁静默）**：① `general` 需求 done 门放行（`req/BUG-002` 修复本体）② 档位表结构差异（被裁剪相位源键保留，`lean` / `skip` 键集 15/14 → **16/16**；`fast`+`skip` 8 → 9）③ `flow advance` 失败提示行的可达目标在「阶段处于被裁剪相位」场景由「(无)」转**非空**（修复本体语义的一部分）④ en 归档官指针文本 ⑤ depth-exceeded 文案 ⑥ 文档面（快照 / 计数家族订正，内容级）⑦ i18n 944 → 945。
- **兼容说明（向后兼容）**：旧 `flow.json`（不含 `requirements` / `archived_versions` / 模式字段）在全部命令下**零报错零注入**；升级**无需迁移**；`--json` 既有键**逐字保留**（`flow phases` 6 → 7 键为**末位追加**，既有键顺序不变）。
- **验收口径（修复后的新增可达路径，旧行为 = 拒绝）**：`req advance --to done`（零关联 `general` 需求）与 `flow advance --to <下游> --review-tier skip`（自被裁剪相位）**均为修复后的新增可达路径**。

### Documentation
- `README.md`（横幅 **v1.2.1** + 新「v1.2.1 新增能力」节）/ `README.zh-CN.md` / `README.en.md`（同构新节 + 部署资产 **10 agents / 22 skills** + 测试基线 **1719 用例 / 71 文件**）
- `docs/GETTING_STARTED.md`（快照 v1.2.1 + 「v1.2.1 能力速览」+ 升级指引）/ `docs/commands.md`（快照 v1.2.1 + `flow advance --review-tier` + `req` 节补 `split` / `--workflow-mode` / `general_mode_conflict`）
- manual 9 文件（已知缺口 → 修复记录〔追加式〕/ 档位边界 → 修复记录 / 变更历史追加 v1.2.1-stage-93 行 / 陈旧计数家族订正）
- `openfeel-cli-usage` skill 快照 **v1.2.1**（新节「v1.2.1 新增能力（stage-86~93 + 94）」）；`openfeel-req` skill done 语义精确化

## [1.2.0] - 2026-10-13

### Added
- [stage-78~80] **flow.json 版本分片归档（`flow archive`）**：子命令组三入口——`flow archive <version>`（执行归档；**判据门** = 该版本全部阶段 done 且无 blocking open REV，**不设 `--force`**；两步事务顺序）、`flow archive list`、`flow archive show <version> [--json]`；归档落点 `.openfeel/flow-archive/{version}.json`；字段 `meta.archived_versions`（轻量索引）；跨版本 deps 判定适配（已归档版本视为已满足）+ `flow health` 归档一致性（a/b/c，warn-only）
- [stage-81~83] **需求流转（`openfeel req`）**：需求层命令组 10 子命令（`add` / `list` / `show` / `claim` / `release` / `set` / `link` / `advance` / `board` / `next`）+ 需求 7 状态；字段 `requirements` / `requirement_id`；聚合投影与对称回写（全部关联阶段 done 时需求自动收口，`reset` 对称回退）
- [stage-84~85] Agent/skill 契约（`feel.md`×4 需求/归档纪律 + planner 需求感知）+ 新 skill `openfeel-req`（总量 17 → **18**）+ 文档多载体收口（README×3 / GETTING_STARTED / commands / manual `cli/req.md` 新建）
- 版本全链路收口 1.1.7 → 1.2.0

### Changed
- **无默认行为变更**：既有命令的接受集/输出契约逐字不变；阶段枚举视图随活跃集收缩（归档后活跃阶段减少）属**设计预期**（已在文档明示），**非回归**。

### Compatibility（向后兼容）
- 旧 `flow.json`（不含 `requirements` / `archived_versions`）在全部命令下**零报错**（缺失字段按回落语义处理，读侧不注入）；升级**无需迁移**。

### Documentation
- `README.md`（版本横幅 v1.2.0）/ `README.zh-CN.md` / `README.en.md`（v1.2.0 能力节 + 测试基线 **1557**）/ `docs/GETTING_STARTED.md` / `docs/commands.md`（快照 v1.2.0 + `flow archive` 三子命令节 + `## req` 节）
- manual：**新建 `cli/req.md`**；`core/{req,flow-archive,setup,update,template-loader,init,build}.md` / `cli/{commands,setup}.md` / `index.md` 同步
- `openfeel-cli-usage` skill 快照 v1.2.0（`req` / `flow archive` 节 + 节序降序）

## [1.1.7] - 2026-10-11

### Added
- [stage-74] 快速迭代模式（fast workflow mode）：新增 `workflow_mode` 配置键（`full|fast`，默认 **fast**，`status.md > config.yaml > profile.yaml〔不承载〕> builtin` 四层级联）+ full/fast 双转移表（`FAST_TRANSITIONS` 内置快线表，可选 `pipeline.yaml fast_transitions` 覆盖）+ `getValidTargets(fromPhase, mode)` 唯一取表点（展示/校验/推进/BFS 同源）
- [stage-75] 模式命令面与交互：`plan stage add --workflow-mode`、`stage set --workflow-mode`（缺失字段**插入**语义）、`flow mode [--stage] [--json]`（只读，四源 `source`）、`flow phases [--mode] [--stage]`（模式分节；`--json` 追加 `workflowMode` 键，既有五键语义逐字不变）、`config set --sync-stages --stage <ids...>`（作用域限定）、wizard 首次模式选型与项目级记忆、`plan scheme create --from-tasks`（op 骨架机械铺，零 Agent 调用）
- 版本全链路收口 1.1.6 → 1.1.7
- i18n 基线 **774 → 796**（v1.1.7 汇总：stage-74 +1 / stage-75 +21；stage-76 不变）[REV-77-015 订正]

### Changed
- **默认行为变更（部署级，请阅读 Migration 小节）**：`auto_advance` 默认值由 `disabled` 翻转为 **`enabled`**（`DEFAULT_CONFIG` 与 schema 逐键默认同键值，单一权威）；新增 `workflow_mode` 默认 **`fast`**（`DEFAULT_PROFILE` 有意保持 `disabled`——用户偏好层与部署级默认二分）
- [stage-76] fast 快线链**必经计划审查**：`FAST_TRANSITIONS` 修订为 **9 条目**（8 流转键 + `done`；`plan_pending → plan_review` 必经、`plan_review` 双出口；`review_failed` 回环保留）；跳过 6 项（`scheme_*` / `test_*`），保留 9 节点
- [stage-76] 模板与 skill 模式感知（37 份：`feel.md`×4 / subagent×24 / 全局约束层×4 / skills×5）+ build 重生成双生成物（`template-loader.ts` + `update.ts`）；i18n 基线 **796 不变**（本阶段无 i18n 键增删）[REV-77-015 订正]
- Agent 配色整体调冷（部署侧视觉）：Claude 侧 `openfeel-planner` → `blue` / `openfeel-executor` → `green` / `openfeel-reviewer` → `pink` / `openfeel-feel-tester` → `cyan`（模板 ×8，zh-CN/en 各 4）；opencode 侧 `openfeel-executor` → `#4CAF50` / `openfeel-reviewer` → `#EC4899` / `openfeel-feel-tester` → `#22D3EE`（模板 ×6，zh-CN/en 各 3）；`npm run build` 传播双生成段（`template-loader.ts`）

### Fixed
- [BUG-006] `openfeel-model-check` skill 的 `### opencode 适配器` 小节 2 条平台专有原句**逐字迁入**（对齐「原文搬家」口径，`v1.1.6-stage-70` 遗留）：`读取 opencode.jsonc…` 与 `扫描 .opencode/agents/…` 恢复为基线原文，正文中性化叙述保留不变；`npm run build` 传播生成段（`update.ts` / `template-loader.ts`）

### Migration（存量项目升级迁移）
- **未设置 `defaults.workflow_mode` 的存量项目**：升级后**新建阶段的骨架初值回落内置默认 `fast`**；既有阶段 `status.md` 若无「工作流模式」字段，其模式解析同样按级联回落 `fast`（无感行为变更）
- 希望保持完整流程（full）的存量项目，建议执行：`openfeel config set defaults.workflow_mode full`（项目级默认；新建与无字段阶段一并回落 full）
- `auto_advance` 默认翻转仅影响**新建阶段初值与未显式设置处的回退值**；既有 `status.md` / `config.yaml` 中的显式值不变。如需关闭：`openfeel config set auto_advance disabled`

### Documentation
- README×3 / GETTING_STARTED / commands：快速迭代模式小节、`--workflow-mode` / `flow mode` / `flow phases --mode` / `create --from-tasks`、`flow phases --json` 六键口径、测试基线 **1306**、快照 v1.1.7
- manual（`core/config.md` / `core/flow-manager.md` / `cli/commands.md` / `index.md`）与 `openfeel-cli-usage` skill 快照 v1.1.7

## [1.1.6] - 2026-10-11

### Added
- Claude Code 适配器（多 harness 并存）：`openfeel setup/update --tools <list>` 显式启用（默认仅 opencode，`~/.claude` 零触）；部署 `~/.claude/CLAUDE.md` + 9 agents（含 `feel`）+ 17 skills
- [stage-73] `~/.claude/settings.json` 注入（严格 JSON 读-深合并-写回）：`agent:"feel"` + `permissions.defaultMode:"auto"`；用户既有键逐字保留；备份/幂等/卸载语义
- [stage-71] 5 个 Claude 全局路径函数（尊重 `CLAUDE_CONFIG_DIR`）+ D-CFG 备份 HOME 外 `global-external/<sha8>/…` fallback
- [stage-68] 17 skills 权威源迁中立共享源 `templates-data/skills/`（opencode/Claude 两 harness 共用）
- 版本全链路收口 1.1.5 → 1.1.6

### Changed
- [stage-70] 共享 skills 中立化（能力名叙述 + `### opencode 适配器` / `### Claude Code 适配器` 双平台分节）
- [stage-71] 重启提醒按 harness 组合参数化；i18n 基线 761 → 774

### Documentation
- README×3 / GETTING_STARTED / commands / manual / `openfeel-cli-usage` skill 六载体补 Claude Code 适配器（`--tools`、`~/.claude/` 资产、settings 注入、升级/重启）
- CI 环境守卫快照路径新增 `$HOME/.claude`（5 路径，判定语义不变）

## [1.1.5] - 2026-10-03

### Added
- 升级后全局部署一致性检测：任意命令与 REPL 在 TTY 下检测到全局部署漂移或缺失时向 stderr 提示（每进程一次；`--json`/`--quiet`/CI/部署类命令静默）
- `openfeel setup --check [--json]`：只读诊断全局部署版本与 CLI 版本一致性（一致退出 0，否则退出 1）
- 版本全链路收口 1.1.4 → 1.1.5

### Documentation
- README（zh/en）、GETTING_STARTED、commands、manual/core/setup、`openfeel-cli-usage` skill 五载体统一「升级流程：`npm i -g` → `openfeel setup` → 重启 harness」

## [1.1.4] - 2026-10-03

### Added
- [stage-65] `openfeel flow checkpoint restore <file> --stage <id>`：按阶段选择性恢复（仅回退目标阶段子树，其它阶段与 pipeline 其余字段不动）
- [stage-65] `openfeel flow checkpoint restore <file> --dry-run`：恢复差异预览（列出 `阶段: fromPhase → toPhase`），**零写盘**
- [stage-65] `openfeel flow stage reset <stageId> --to <phase> [--dry-run]`：精准阶段复位（允许回退；受合法 phase 值域与 `to=done` 阻塞 REV 检查约束；status 按 phase 投影同步）
- [stage-64] `openfeel plan scheme create` 序号改为「注册 ∪ 文件」最小未用（空位回填）；新增 `openfeel plan scheme register <stage> [opId] [--dry-run]` 补注册；`create` 对未注册文件告警
- [stage-63] `openfeel plan stage add --exec-mode/--auto-advance` 显式初值；`openfeel config set/get` 支持 `defaults.X ≡ X`；新增 `openfeel config set --sync-stages`
- [stage-62] `openfeel flow status` 语义收敛：`status` 为 `phase` 的粗粒度投影（消除 `test_enabled=false` 触发 `phase` 锁 `done` 的确定性缺陷）

### Changed
- [stage-62] `test_enabled` 移除（15 相位模型下 phase 图不再依赖）；`flow advance` 的 auto-repair 仅 `phase→status` 单向

### Fixed
- [stage-65] checkpoint 恢复新增选择性/预览；新增 `flow stage reset` 作为 `flow advance` 的对称复位能力，将全量 restore 降为最后手段
- [stage-62] 修复第四轮反馈问题 4/5/7（`phase` 单向锁 `done`，6/6 复发）
- [stage-63] 修复问题 1/6（新阶段初值硬编码、`config set defaults.*` 被拒）
- [stage-64] 修复问题 2（op 序号与注册脱节、无法补注册）

## [1.1.3] - 2026-10-02

### Fixed
- [stage-61] `auto` 输出编码对 UTF-8 管道消费者是回归——Windows 非 TTY 改为**直通 UTF-8**（对齐 Node 默认与管道/CI）；GBK 仅经 `--encoding gbk` / `OPENFEEL_ENCODING=gbk` 显式生效
- [stage-61] 删除 `chcp` 探测与代码页映射死代码（`detectConsoleCodepage` / `codepageToIconv` / `cachedCodepage` / `spawnSync` 导入 / `codepage?` 字段）

## [1.1.2] - 2026-09-29

### Added
- `openfeel flow phases [--json]`：自描述全部合法 phase 与运行时转移表（`--json` 含 `schemaVersion`/`phases`/`transitions`/`advanceAccepted`/`transitionsDiff`）
- `openfeel flow stage remove <stageId>`：安全移除阶段（ops 非空 / 当前活跃 / 被依赖时默认拒绝；`--force` 越过、`--dry-run` 预览、`--purge` 删目录）
- `openfeel plan stage add <name> --deps <ids...>`：CLI 暴露依赖声明（写入 `flow.json.stages[].deps` + `overview.md`）
- `openfeel config effective [key]`：输出配置有效值 + 生效来源（`status.md > config.yaml > profile.yaml > builtin`）
- stageId 校验与冲突检测：`validateStageId` / `suggestStageId` / `findStageDirConflict`（`(series, stageDir)` 冲突阻止 + 建议名）
- 部署覆盖前自动备份：全局根 `~/.openfeel/backup/{ts}/` + `update_infos.md` 新增「备份」类条目 + `feel.md` 检查规则
- 新增 skill `openfeel-cli-usage`（CLI 命令/参数/phase/stageId 用法按需加载参考；skill 总数 16 → 17）
- [stage-50] CI 环境守卫与版本门禁（stage-48）：测试前后对全局目录 + 仓库项目配置做 sha256 快照比对（守卫窗口前移），`--version` 与 `package.json.version` 一致性门禁
- [stage-50] **Added（R3）**：`openfeel config set`/`get` 支持**全量 `defaults.*`** 键（`execution_mode` / `test_enabled` / `merge_mode` 等），含枚举值校验与布尔类型归一
- [stage-50] **Added（R6）**：`npm run test:coverage` 与 CI 覆盖率**报告**（仅观测基线，不阻断）
- [stage-58] **Added**：输出编码自适应——`--encoding <utf8|gbk|auto>` / `OPENFEEL_ENCODING`；Windows 非 TTY（管道/重定向）按控制台 `chcp` 转码；`--json` **恒 UTF-8**（第 1 步最高优先）；不可编码字符降 `?` 不告警
- [stage-58] **Added**：CLI 运行日志——`~/.openfeel/cli/logs/openfeel-YYYY-MM-DD.log`（**恒 UTF-8、默认开启**）；`--log-file <path>` / `--no-log` / `--debug`；与 `.openfeel/log/**`、`flow.json.log[]`、`update_infos.md` 四类日志**语义分离**；`error` 仅记命令处理中抛出的异常（解析期错误不入日志）
- [stage-58] **Added**：直接依赖 `iconv-lite@^0.7.2`（MIT；原已经由 `@inquirer` 间接在 prod 依赖树中，本阶段提升为直接依赖）

### Changed
- `auto_advance` 口径统一为「项目 `config.yaml` 优先、全局画像兜底」三级有效链
- `pipeline.phase` 改为全量 done 判定（所有阶段均 done 时置 `done`）
- 命令职责分层：`plan stage add`（完整入口）> `flow stage add`（仅注册）> `stage create`（弃用，运行时提示）
- 成功注册阶段 / 操作补审计日志（`register_stage` / `register_op`）
- 9 个 agent 模板补 `external_directory: "allow"`（opencode 适配器）；`openfeel-utility` 的 `write` 改回 `edit`
- 平台强限定描述泛化（去「唯一 harness」表述，零行为变更）
- 文档/手册与 CLI 同步（`docs/commands.md` 新增 `## config` 节等）
- 版本号 1.1.0 → 1.1.2 全链路同步（`package.json` / `config.yaml` / `config.ts` 模板 / agents-md 模板 / `AGENTS.md` / `package-lock.json` / `CHANGELOG`）
- [stage-50] CI 加固（stage-49，commit `afe93dd`）：环境守卫覆盖仓库项目配置、coverage 报告步骤、`fetch-depth` 清理
- [stage-50] **Changed（行为变更，R1）**：`openfeel lint i18n` / `lint kb` 发现问题改为**非 0 退出**（门禁语义，对齐 `flow health`；外部脚本若忽略退出码将受影响）
- [stage-50] **Changed（行为变更）**：`openfeel migrate` 备份目录名改为**本地时区 + 毫秒 + 撞名后缀**（T49，防同秒两次备份互相覆盖）
- [stage-50] `openfeel flow phases --json` 追加 `transitionsDiff` 字段（T19，运行时与内置默认转移表差异可见；既有 `phases`/`transitions`/`advanceAccepted` 保留）

### Deprecated
- [stage-50] **Deprecated（R4）**：`openfeel view add` 已弃用，**将于下一版本移除**；请迁移至 `openfeel flow review add`（本版本仅弃用 + 运行时提示）

### Removed
- **`openfeel view add` 子命令已移除**（v1.1.2-stage-52，A4，**破坏性变更**）。迁移：改用 `openfeel flow review add`（同一单点实现 `addReviewEntry`，行为等价，支持 `--priority` / `--blocking` / `--auto-fix`）。保留 `openfeel view list` 与 `openfeel view accept`（列出与验收，与 `flow review` 无重叠语义）。

### Fixed
- `config/BUG-004`：`identity.test.ts` 直写真实 `~/.openfeel/config.json` 的测试隔离缺口——改为 N4 单点 mock + 新增隔离守护用例（真实文件 mtime/SHA-256 前后不变）
- 已登记缺陷集中清理：`cli/BUG-001`、`cli/BUG-002`（stageId 冲突 i18n）、`archive/BUG-001`、`config/BUG-002`（`config.yaml` 覆盖语义）、`config/BUG-003`、`templates/BUG-002`
- 移除随包 `postinstall` 补丁（`scripts/patch-inquirer.js`）：该补丁在用户端 `node_modules` 布局下必然静默失效（`util.styleText` 自 Node 20.12 起已内置，允许区间内无需补丁）
- `engines.node` 由 `>=20.0.0` 收窄为 `>=20.17.0`，与 `@inquirer/core` 要求一致，避免 Node 20.0~20.16 下交互命令崩溃
- 移除 `src/index.ts` 中从未生效的死导出 `VERSION`（值恒为 `0.1.0`、全仓零引用；`exports["."]` 不再暴露错误版本号；CLI 版本仍取自 `package.json`）
- [stage-50] **内部模式一致性（批次 A，T1~T16）**：`pipeline.current.op` 改由 `FlowManager.syncCurrentOp` **单点同步**（修复推进无 pending op 的阶段时 `current.op` 跨阶段悬空）；`load()` 一处收口补 `ops={}`/`deps=[]`（存量缺字段不再 `TypeError`）；`fuzzyCorrectPhase` 后缀补唯一命中检查；`logMilestone` 保留 `MilestoneEvent` 全字段；`checkpoint_mapping` 补 `archiving` 键；`autoCommitOnDone` 改 `execFileSync('git', [...])`；`roadmap` core 层改抛 `Error`；`PublicLogger`/`MetricsStore` 单例键含路径；REV ID 取既有最大序号 +1；僵尸检测锚定 `stageId + '.'`；`metrics.summary` 走 i18n
- [stage-50] **门禁与 CI 失效面（批次 B，T17~T21）**：`lint i18n`/`lint kb` 非 0 退出（**R1**，见 Changed）；`flow phases --json` 增 `transitionsDiff`（T19）；CI 守卫窗口前移 + 覆盖仓库 `.openfeel/config.yaml`；`.gitignore` 补 `.openfeel/tmp/`；`.gitattributes` 补生成物宿主 `template-loader.ts`/`update.ts` `eol=lf`
- [stage-50] **死代码与配置面（批次 C，T22~T37）**：删除死模块 `src/utils/path.ts`（T22，全仓零 import/引用）；`atomicWriteJson` 加「预留」注释；`setup` 补 `skipped` 输出；`update_infos` **保守默认**（**R2**，T25）；`computeBackupRel` 越界抛 `BackupError`；`backup.ts` 委托 `getHomedir()`；`readProfile` 缺失分支改深拷贝（防 `DEFAULT_PROFILE` 被污染）；`buildCascadeConfig` 逐键 Zod 校验；`config set --global` 原型链防护（`Object.hasOwn` + `getNestedValue` 跳过 `__proto__`/`constructor`）；`config set/get` 支持**全量 `defaults.*`**（**R3**，T36，见 Added）；`view add` **弃用**（**R4**，T37，见 Deprecated）；`recent_projects` 去重大小写不敏感；`config get --global` 非法画像 stderr 提示；knowledge 标题写入前转义 `|` 与折叠换行
- [stage-50] **i18n 与命令体验（批次 D，T38~T42）**：`applyHelpI18n` 遍历 `arguments`（en 下位置参数描述走 i18n）；并发冲突文案收敛至 `handleCliError` 单点；`flow wizard` 非 TTY 输出等价提示 + `exit 1`；REPL 不因命令错误退出 + help 动态生成；`init`/`roadmap` 补 try-catch（无堆栈外泄）；`model set --build` 的 `execSync` 加超时并捕获 `ETIMEDOUT`；`stage create`/`flow stage add` 错误处理抽 `handleAddStageError` helper
- [stage-50] **测试质量与覆盖（批次 E，T43~T52）**：`i18n.test` 隔离（不再依赖真实 home/仓库 `.info.json`）；静默 `console.warn` 跳过改 `it.skipIf`（skipped 可见）；`model.test` get 强断言；补 anomaly 去重 / migrate 失败语义 / `update-state` 全局函数断言；`backupLegacy` 改本地时区 + 毫秒 + 撞名后缀（见 Changed）；jsonc 降级安全读取；`saveUpdateState` 加锁 + 原子写；`migrate rollback` 非项目根明确报错；补 `stage`/`update`/`setup` + `repl` smoke **4 项覆盖**（**R5**，其余 7 族登记归后续）
- [stage-50] **模板与文档口径（批次 F，T53~T57）**：5 个部署型 skill 模板改**双口径**（用户环境主口径 `openfeel <cmd>` + 本仓自举加注 `node bin/openfeel.js <cmd>`；`templates/BUG-003` **关闭**）；`agents-md/en.md` 图注改中英并列；`openfeel-cli-usage` skill 枚举补 `phases`/`stage` 与 5 命令族；`build.js` 注释计数修正（「两对」「9/17 带前缀」）

- [stage-51] **纠正/清理侧 CLI 补齐（反馈 08，N1~N11）**：
  - **Added**：`openfeel knowledge dedup [content] [--project <path>] [--category <name>] [--threshold <n>]`（检索相似知识条目，**只读建议**，随包分发）；`openfeel plan scheme remove <stage> <opId>`（注销 op 注册键，done/checkpoint 保护 + `--force`/`--dry-run`）；`openfeel flow stage set <stageId> --deps <ids...>`（悬空校验 exit 1）；`openfeel flow review update <revId>` / `flow review remove <revId>`；`openfeel stage task <id> --add "<描述>"`；`openfeel plan stage add <name> --tasks "<t1>" "<t2>"`；`openfeel flow advance --quiet`；`stage set` 字段扩展 `--exec-mode`/`--auto-advance`/`--review-agent`；`flow repair --prune-orphans`（仅清理键孤儿）
  - **Changed（行为变更）**：op 文件名固定 `op-NNN.md`（标题写入内容首行；历史 `op-NNN_标题.md` **不迁移**，读取端 `extractTitle` 兼容回退）；公共日志未来写入统一为嵌套 `log/{yyyy}/{MM}/{dd}/`（**不迁移历史**，根索引同时反映两套布局 + 布局标注）；`flow advance` 默认仅在 `--to done` 提示 git 脏区（非 done 不再调用 `git status`）；`stage set` 同值由「报错」改为「**no-op 成功 exit 0**」且 `.bak` 仅在确认变更后生成；`flow repair` 输出新增孤儿 op 对账（默认只报告，零写盘）；`plan scheme create` 隐式注册时补建 `overview.md`/`status.md` 骨架（消除「半注册」）；`knowledge index`/`add` 放宽段头/表头/列数解析（标准格式输出不变）
  - **Fixed**：`cli/BUG-004`（en 模式 `--help` 的 Arguments 描述仍为中文）——补齐 20 处（+1 新增）`help.<path>.arg<name>` 双语键 + 运行时全量枚举门禁；`REV-004`（`help.view.add` 未同步弃用文案）——单键合并（删 `view.add.desc`）；op 标题含 `/` 时创建失败（ENOENT）已修复；`flow health` 新增孤儿 op `warn`（**非 `fail`，不改变退出码**）

- [stage-52] **反馈 09（可编排性/可观测性）+ 遗留清账 + 约束体系精简**：
  - **Added**：`openfeel flow status|current|health|metrics|overview --json`（顶层对象 + `schemaVersion:1`，纯 JSON 单文档，与人类可读互斥）；`openfeel flow health --fix`（以 `flow.json` 为权威**仅回写 `status.md`「状态」字段**，`--dry-run` 预览）；`openfeel flow ops list [--stage] [--json]`（state + 模板填充度 + 空模板 warning）；`openfeel plan scheme create --draft` + `openfeel plan scheme publish <stage> <opId>`；`openfeel plan scheme rename <stage> <opId> --title "<title>"`；`openfeel advance --to` **自动逐步**（`--dry-run` 打印完整路径）；全局 `--no-color` 选项
  - **Changed（行为变更）**：`flow advance --to` 在存在唯一路径时**自动逐步推进**（未提供 `--to` 的单步行为不变；多义/非法目标仍 exit 1 + 列可达目标；每步复检 blocking REV）；`flow phases --json` 追加 `schemaVersion`（既有 `phases`/`transitions`/`advanceAccepted`/`transitionsDiff` 不变）；`op.state` 取值域新增 `draft`（health 不报 draft 空模板、advance/统计/归档不计入、`flow attempt` 对 draft op 拒绝）；`flow current` 无 op 时回退显示 `current.stage` +「(无 op)」；尊重 `NO_COLOR`/`--no-color`
  - **Removed**：`openfeel view add`（**破坏性**，见上；改用 `openfeel flow review add`，保留 `view list`/`accept`）
  - **Fixed**：`kb-dedup` CRLF 去重失效（`parseKbFile` 读取处行尾归一化——`patterns.md` / `troubleshooting.md` 解析量 **2→105 / 0→31**）；**stage 解析归一化闭包 10 处**（`flow advance` / `flow stage remove` / `flow attempt` / `flow review add --auto-fix` / `archive` / `checkpoint list` 等的**短名 stage / 短名 opId 前缀不再失效**，统一 `normalizeStageId(x) ?? x` + 双键回退）；`console.warn` 硬编码中文全量 i18n 化（en 模式零泄漏）
  - **Changed（约束体系精简，C1~C4）**：全局约束「简洁设计」改为去硬编码的定性表述（zh/en 语义对等，删除「文件数 > 3」等阈值）；agent 模板（`feel.md`/`openfeel-planner.md`/`openfeel-tool-usage`）B 组规模阈值**定性化**（**保留 D 组工程阈值**）；仓库根 `AGENTS.md` 与模板权威源逐字对齐；「14 个 Skill」计数漂移修正为 **17** 处。**注**：`~/.config/opencode/AGENTS.md` 须运行 `openfeel setup` 方生效
  - **登记（非阻塞）**：`cli/BUG-005`（medium，空模板检测纯子串匹配误报）/ `cli/BUG-006`（low，en 模式 blocking REV 拒绝文案硬编码中文）
- [stage-53] **记忆/状态文件职能与格式重构（current.md / dev_last.md）**：
  - **Changed**：全局约束写入**两条设计目的**（保存核心信息便于恢复 / 避免无关信息污染上下文）+ 索引层/主题层/详情层**三层分层**；**`current.md` 改团队文件格式**——仅个人提交时更新、只描述整体信息、**无 agent 细节、无 `## @成员` 段**、仅留近期 **5** 条记录，旧记录自动归档 `.openfeel/dev/current_archive/`（`openfeel init` 自动创建该目录，`DEV_SUB_DIRS` 新增 `current_archive`）；**`dev_last.md` 改为索引 + 同名主题目录**（活跃主题 ≤5、索引摘要 ≤5 条 ×≤100 字、主题文件 ≤10 条 ×≤300 字、超量详情转 `users/{username}/tmp/` 并记地址、**超期记录不归档**；主题数 >5 时**就地收敛**不迁移文件；主题文件名一律英文 kebab-case）；`feel.md` 记忆加载与会话写入同步改写；`openfeel-sync-status` skill 改读各用户 `dev_last` 主题索引 + `flow.json` 聚合（skill 总数仍 17）
  - **Fixed**：`templates/BUG-004`（迁移后本仓 `current.md` 统计行沿用「执行中」快照、用例数陈旧）——归档时就地修正（942→949 + kb 计数刷新 + stage-53 记录措辞改为「归档完成」）
- [stage-54] **收尾：遗留缺陷清理（发布前清账）**：
  - **Fixed**：`cli/BUG-005`（medium，空模板检测**纯子串**误报——正文行内引用占位标记即被误判未填充，导致 `plan scheme publish` 误拒 / `flow ops list` 误报 `(empty)` / `flow health` 误报）——`isTemplateEmpty` 改**整行锚定**（`EMPTY_TEMPLATE_LINE_RE`，容错缩进/CRLF/行尾空白）+ `detectFillState` 的 `partial` 分支同口径收紧 + `plan/scheme.ts` 复用 `isTemplateEmpty`（**单一来源**）；`cli/BUG-006`（low，en 模式 `flow advance --to done` 的 blocking REV 拒绝文案硬编码中文）——迁 i18n（`flow.advance.blockingRevRefused` / `blockingRevHint`，zh 逐字不变 / en 对称）；`cli/BUG-003`（low **复发**，`flow phases --help` 文案缺 `transitionsDiff`）——仅补 i18n help 文案（**JSON 输出契约未变**）
  - **登记（非阻塞）**：`templates/BUG-005`（low，部署型 skill 模板 `openfeel-cli-usage/SKILL.md` 的 `flow phases --json` 输出说明记 3 键、实测 5 键，**新增输出键的同步面遗漏 skill 模板**）
  - **内部（非随包行为）**：全仓 REV pending **分层统计**（清账层 38 / 历史层 88 / 无法判定 3）+ 清账层收口（**closed 31 / 维持 pending 7**）；`bugs/index.md` 统计修正（open 3 / closed 13）；门禁 `lint i18n` 724 → **726 键**（E2 新增 2 键）

- [stage-55] **清掉项目级约束与 Agent（发布前最后阶段）**：
  - **Removed（仓库自身，非随包行为）**：不再保留**项目级部署资产**——删除根 `AGENTS.md`、根 `opencode.jsonc`、`.opencode/agents/**`（9）、`.opencode/skills/**`（17）、`.opencode/ADAPTER.md`（opencode 适配器构建产物），并删除 `build.js` **自举步骤 8**（`.opencode/` 自举重生成，含 `regenerateOpencodeInstance` / `insertGeneratedMark` 与失效 import，**防 `npm run build` 复活**）；`.opencode/` 仅保留 opencode 运行时目录。框架资产（9 agent / 17 skill / 全局 `AGENTS.md` / 全局 `opencode.jsonc`）统一由 `openfeel setup` 部署到全局 `~/.config/opencode/`。
  - **Changed**：全局约束模板新增「**模块手册 / Module Manuals**」节（`templates-data/agents-md/{zh-CN,en}.md`，双语）——原仓库根 `AGENTS.md` 独有内容迁入全局模板，删除根文件后该约束仍随全局生效；`kb/architecture.md` 原「全局部署架构 N1（仓库自身 `.opencode/` 不动）」决策**追加式 supersede**（原行保留 + 注记块），`dev/decisions.md` 补 ADR-002；`docs/GETTING_STARTED.md` 死链处置；`.openfeel/manual/{core/build,agents/feel,cli/commands,index}.md` 引用同步。
  - **Changed（内部/非随包）**：测试迁移——删除 `test/core/opencode-instance.test.ts`（4 it 随对象消失 / 3 组断言迁至模板源 / 3 it 发布元数据整体迁至**新文件** `test/core/release-metadata.test.ts`）+ 新增「仓库无项目级受管资产」「`build.js` 源码无自举函数」防回归断言；用例 987 → **985**；`npm run build` 不再生成 `.opencode/**` 受管文件。
  - **Fixed（内部）**：`REV-003`（low，覆盖回归）补齐 reviewer 纪律节的**模板源断言**（zh/en 各 1 it，经 `loadOpencodeAgentTemplate`）；`REV-002`（low，it 计数表述）登记更正。
  - **生效**：全局刷新（`openfeel setup`）**须重启 opencode 会话**方生效（本仓不再提供项目级 `.opencode/**`；项目级约束/配置改由全局提供）。

- [stage-56] **发布前最后一轮收尾（发布就绪）**：
  - **Changed（部署产物）**：`openfeel-cli-usage` skill 权威源全量对齐 v1.1.2——补齐 **16 项**命令/参数（`flow ops list`、`plan scheme remove`/`rename`/`publish` + `create --draft`、`flow review update`/`remove`、`flow stage set --deps`、`stage set --exec-mode`/`--auto-advance`/`--review-agent`、`stage task --add`/`--done`/`--undone`、`plan stage add --tasks`、`flow health --fix`、`flow advance --quiet` + `--to` 自动逐步、`flow status`/`current`/`health`/`metrics`/`overview --json`、`knowledge dedup`、`lint` 非 0 退出、`config set`/`get` 全量 `defaults.*`、flow 子命令补 `ops`/`migrate`、`view add` 已移除），修正 `advanceAccepted` 误称（**内置 15 phase 推进白名单**，非组合条件路径）+ 补 `transitionsDiff` 注记；`npm run build` 传播生成段 + `openfeel setup` 刷新全局副本（**须重启 harness 会话生效**）。
  - **Fixed（文档口径）**：`flow phases --json` **5 键**（`schemaVersion`/`phases`/`transitions`/`advanceAccepted`/`transitionsDiff`）全链路同步（`docs/commands.md` / `.openfeel/manual/cli/commands.md` / `CHANGELOG` / 生成段）；`templates/BUG-005`（low，部署型 skill 模板 `flow phases --json` 输出说明缺 `transitionsDiff`）**关闭**；`cli/BUG-007`（low，`docs/commands.md` 的 `project list`/`info` 子命令已不存在）——归档官就地修正为 `openfeel project overview` 并**关闭**。
  - **内部（非随包行为）**：`agents-md/en.md` 图注 CJK 归零（`acceptance rejected`）；`managed-region.ts:182` 注释校准（incoming 全字段覆盖 + existing 独有 passthrough）；`manual/core/backup.md` 措辞（每进程（通常即每命令））；公域 Bug 索引补齐至 **17**（新建 `bugs/kb.md`）。**v1.1.2 累计 18 条 Bug 全部关闭（open 0 / closed 18）。**

- [stage-57] **发布收尾（CI 修复 + CI 可观测性 + README 更新）**：
  - **Fixed（CI）**：`test/core/config.test.ts` 的 T32 盘符用例平台化——拆为「跨平台用例」（前置断言 `expect(preset).not.toBe(target)` 防假绿）与「Windows 专属用例」（`it.skipIf(process.platform !== 'win32')`，Linux skip 不计 failure）。根因（POSIX 下 `C:\Proj\X` 非绝对路径）在**测试侧**，`src/core/config.ts` 无改动；修复后 CI 两个 matrix job 恢复通过（此前 run #51 在 `npm test` 步骤失败、`publish` 被 skip）。
  - **Added（CI 可观测性）**：`.github/workflows/ci.yml` 测试步骤改 `set -o pipefail` + `npm test -- --reporter=verbose --no-color 2>&1 | tee "$RUNNER_TEMP/test.log"`；新增 `if: failure()` 注解步骤（`sed` 剥 ANSI 色码 → `grep` 提取失败用例 → `echo "::error::"`，上限 20、`exit 0`、零写盘、不改 job 判定），失败用例名可经 GitHub `check-runs/{id}/annotations` API 自助读取。
  - **Fixed（文档）**：三份 README 与 `docs/commands.md` 版本快照对齐（测试数 **986 用例 / 59 文件** + Linux 跳过说明、`v1.1.2 新增能力` 节、命令表修正、全局部署架构图注与分层小节、zh/en 逐节对等、旧版本号零残留）；归档官就地修正 README 架构图 Core 层 `backup/` → **`backup.ts`**（REV-005，粒度与真实单文件一致）并清理 `docs/GETTING_STARTED.md` 旧版本号残留。
  - **内部（非随包行为）**：本轮无新登记 Bug（公域 18 全 closed）；知识沉淀 3 条（patterns）。

> 说明：本仓库 `.openfeel/dev/current.md` / `.openfeel/users/{username}/dev_last.md` 为工作区数据（非随包分发产物），格式约定经 `openfeel setup` 部署到全局约束层后生效。


> 完整逐条处置与验证证据见 `.openfeel/code_review/v1.1.2-stage-50.md` 与 `.openfeel/users/Liuary/log/op-v1.1.2-stage-50-report-2026-09-30.md`（T1~T57 覆盖表）。

## [1.1.1] - 2026-09-26

### Added
- `openfeel setup` 命令：纯全局部署（全局 AGENTS.md + 9 agent + 16 skill + 全局 opencode.jsonc），不建立项目 `.openfeel/`，幂等可重跑
- `openfeel init --workspace-only --non-interactive`：非交互轻量子命令，仅创建 `.openfeel/` 工作区（不建 AGENTS.md/opencode.jsonc），供 Feel 空白项目自动搭建
- 新增 skill：`openfeel-workspace`（会话启动自检操作步骤）、`openfeel-tool-usage`（Agent 工具使用规范）；skill 总数 14 → 16
- `openfeel migrate --clean-global-core-md`：显式删除已废弃的全局 core.md（默认仅提示不删）
- `detectDeprecatedCompat`：检测全局旧 core.md / 存量项目 AGENTS.md 并提示

### Changed
- 全局化彻底化：所有约束统一到全局 `~/.config/opencode/AGENTS.md`（移除 core.md）；op-000 实测全局 AGENTS.md 自动加载 = YES，故全局 opencode.jsonc 移除 `instructions` 字段
- 约束/操作分离：core.md 约束类并入全局 AGENTS.md，操作类拆为按需加载 skill（`openfeel-workspace` / `openfeel-tool-usage`）
- AGENTS.md 模板改为「全局行为约束」（移除 `{项目名称}` 占位符；新增「项目特有约束（可选化）」声明节 + 「.openfeel 工作区结构（约束）」节）
- init 收敛：拆除全局 agent/skill/core.md 部署与项目 AGENTS.md 骨架，仅做项目初始化（.openfeel/ 工作区 + 项目 opencode.jsonc）
- update 收敛：拆除项目 AGENTS.md 部署；全局资产部署目标由 core.md 改为全局 AGENTS.md；存量全局 state 的 core.md key 一次性重映射
- migrate：`remapLegacyKey` 目标与全局部署路径改全局 AGENTS.md
- 版本号 1.1.0 → 1.1.1 全链路同步（package.json / agents-md 模板 / CHANGELOG）

## [1.1.0] - 2026-09-25

### Added
- 并发保护基础设施：统一原子写（唯一名 temp + fsync + rename）、跨进程文件锁（O_EXCL + 指数退避 + 陈旧锁抢占）、序号分配原子化，覆盖 flow.json/公共日志/status.md/update_state.json 等高风险写入点
- 全局部署架构：框架资产（9 agent / 14 skill / core.md / opencode.jsonc）从项目内嵌升级为全局安装 `~/.config/opencode/` + 项目精简（项目仅 .openfeel/ + AGENTS.md + opencode.jsonc）；全局/项目双 update_state
- 控制区标记增量更新：`<!-- openfeel:begin/end -->` 受管区 + 部署三态（不存在写 / 无标记追加 + 记录 update_infos.md / 含标记覆盖区内）
- `openfeel migrate` 命令：存量旧布局项目一键迁移（检测/备份/迁移/回滚 + --dry-run + --remap-assignee），项目自定义资产保留

### Changed
- 模板单源收敛：templates-data/ 为唯一权威源，仓库 .opencode/ 降级为构建产物
- 命名前缀统一：8 agent + 14 skill 加 `openfeel-` 前缀（feel 保留）；`/opfx:` 混合命名空间按真实类型引用并清零
- 版本号 1.0.9 → 1.1.0 全链路同步（package.json / config.yaml / config.ts / agents-md 模板 / AGENTS.md / CHANGELOG）

## [1.0.9] - 2026-08-15

### Added
- 路径映射权威工具：新增 `src/core/plan/path.ts`（stageId ↔ plan 目录双向映射唯一权威，含历史格式与短名兼容，findStatusPath 三级回退），init 示例阶段多级化部署到 `plan/v1/stage-01/`

### Changed
- plan 目录多级化与路径统一：阶段工作目录统一为 `plan/{series}/{stage}/`（series = v{MAJOR}），`plan stage add` / `plan scheme create` 从 `.openfeel/stages/` 迁移写入；findStatusPath 三级回退（plan 精确 → plan 递归 → stages 只读兜底）；命令层 stageId 映射修正、模板与 skill 文案同步、docs 文档路径引用统一
- 版本号 1.0.8 → 1.0.9 全链路同步（package.json / config.yaml / config.ts / CHANGELOG）

## [1.0.8] - 2026-08-15

### Added
- 任务类型路由：AGENTS.md 新增「任务类型路由」节，非编码任务（调研/探索、选型讨论）成为一等公民，flow.json 不必为所有任务空转
- decisions.md 纳入框架标准：新增 `.openfeel/dev/decisions.md`（ADR 轻量格式，决策+理由+日期+状态），init 自动生成，core.md 会话自检纳入

### Changed
- Feel 日志纪律解耦：「必须记录的事件」改为「委托任意下游 Agent（含 general / explore / utility 等调研类）都须落公域日志」，删除「委托 Executor / 事务官」的排他性表述，明确不受任务类型豁免
- 轻量决策边界：Feel / Planner / AGENTS 三层统一定义——对话式选型（产出结论不产出 plan.md）由 Feel 直接处理，仅产出正式计划文档或达规模阈值才委托 Planner
- 版本号 1.0.7 → 1.0.8 全链路同步（package.json / config.yaml / config.ts / AGENTS 版本声明）

## [1.0.0] - 2026-08-07

### Added
- GitHub Actions CI/CD 工作流（`.github/workflows/ci.yml`）：push/PR 触发，Node.js 20.x/22.x 双版本矩阵，`npm ci` → `npm run build` → `npm test`
- `CHANGELOG.md` 项目变更日志（本文档）与 `docs/GETTING_STARTED.md` 用户入门指南
- `openfeel lint` 质量门禁落地（i18n 422 键对称性校验 + kb 过期引用检测），为 CI 集成提供前置检查

### Changed
- 版本号统一为 v1.0.0：flow.json 25 个 stageId 从 v0.x.x 体系重映射为 v1.0.0-stage-04 ~ v1.0.0-stage-28，同步更新 plan/index.md 对照表、kb/index.md、dev/current.md
- npm 发布工程准备：package.json 元数据完善（bin/exports 入口、files 白名单、publishConfig）

## [0.5.0] - 2026-08-07

### Added
- 框架级记忆体系：全局用户画像 `~/.config/openfeel/profile.yaml` + `dev_last.md` 生命周期模板 + `openfeel config --global` 标志
- 跨 Agent Handoff 委派原语（`[HANDOFF: agent_name]` 标记）、Checkpoint 快照自动保存与组合终止条件（transitions `|` 运算符）
- `openfeel lint` 质量门禁命令组（i18n 键对称性 + kb 引用检测）与 4 个新 skill 落地（roadmap/health/recover/wizard）

### Changed
- 版本管理规范（主.次.修订语义）与计划目录按大版本系列分组重构（v4/、v5/）；规范迁移 dev_core.md → core.md

### Fixed
- 缺陷修复系列：autoCommitOnDone 时序修正、AGENTS.md 模板补齐版本管理节、init 创建 manual/ 目录、部署传播内容哈希比对

## [0.4.0] - 2026-07-15

### Changed
- 15→7 Agent 精简体系（删除/合并/替代/划归四类操作）；废弃自动闭环，改为 Feel 总统领调度 + CLI 推进模型

### Added
- 知识库自动化体系：检索→去重→沉淀三环闭环，check-kb 技能自包含语义检索
- i18n 基础设施（12 功能域，206 entries × 2 语言）、多语言模板数据管线与双语 CLI 交互（init 选择 → .info.json 持久化 → update 读取）
- Vision 视觉官（8→9 Agent 扩展，qwen-vl-plus 多模态模型）与分级模块文档系统 `.openfeel/manual/`

### Fixed
- 流水线安全增强：REV 闭环双路兜底（flow-manager + 命令层，--force 不可绕过）、公域日志批量聚合降噪 85%+、git 钩子 + 日志骨架

## [0.3.0] - 2026-06-28

### Added
- 流水线 Agent 体系 v3 架构：Feel/Schemer/Executor/Reviewer/Tester/Archiver 六角色 + flow.json + FlowManager + 模型分工（推理/快速/异种）
- 交互式 wizard、demo、知识库与边界处理等体验增强（v3.0 四阶段 21 项任务闭环，测试 217/219 通过）
- Schemer 自动生成 deps.yaml 依赖声明（hard/soft/mutual_exclusion 三档）

### Changed
- Flow CLI 严格校验（非法 phase 拒绝推进，新增 --force/--verbose）、文档路径绝对化与知识库搜索增强（--limit/--offset）

### Fixed
- v3.1/v3.2 补丁系列 + 生产加固验证（5 项目全流水线测试，DateKit 终验零 Bug）

## [0.2.0] - 2026-06-27

### Added
- v2 架构：feel Agent 链 + 三层计划体系（大计划/小计划/操作方案）
- 统一工作区结构（.openfeel/ 命名）+ 核心+适配器分层 + 交互式 CLI

### Changed
- v2.0 七阶段 28 项改进全部闭环（59 文件变更，217/219 测试通过）
- 计划扩展：新增 stage-07 可扩展性重构（pipeline 数据化 / config 通用化 / 指令参数化 / CLI 自动发现）

### Fixed
- 一期部署复盘：deploy-review 对比分析与 blueprint-test-project 蓝图归档至 .openfeel/docs/

## [0.1.0] - 2026-06-24

### Added
- OpenFeel 项目创立，制定 v1.0 开发计划（9 阶段）
- 一期核心流水线搭建（Agent 工作区目录结构 + 状态文件体系）

### Changed
- 工作区命名全局替换为 `.openfeel/`，确立公共域 + 私域分区原则

### Fixed
- 一期部署验证：首个测试项目端到端跑通，产出部署对比分析报告
