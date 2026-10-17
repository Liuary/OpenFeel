# CLI 命令体系（commands）

> 模块文档，由归档官在归档时维护。对应源码：`src/cli/index.ts` + `src/commands/*.ts`。
>
> **版本快照：v1.2.3（2026-10-17 补丁收口）** —— 契约 **33 成功出口 / 34 注册 `--json` 选项**（`--version --json` 单列）；命令面与本模块「调度决策面」「读命令 `--json` 全量补全」「全局选项与错误处理」三节一致，细节以 `node bin/openfeel.js <cmd> --help` 实测为准。v1.2.3：并发 JSON 退出统一（置码返回）+ `--review-tier` help 文案订正。

## 职责

基于 Commander 构建 OpenFeel CLI 入口，动态注册各命令组，并通过 i18n 机制翻译 help 文本。入口 `bin/openfeel.js`：无参数进入 REPL 交互模式，有参数走 CLI 模式。

## 命令注册

`src/cli/index.ts` 中每个命令组一个注册函数，统一 `import` + `register`：

```
src/commands/init.ts        registerInitCommand
src/commands/flow.ts        registerFlowCommand
src/commands/plan.ts        registerPlanCommand
src/commands/view.ts        registerViewCommand
src/commands/archive.ts     registerArchiveCommand
src/commands/roadmap.ts     registerRoadmapCommand
src/commands/instructions.ts registerInstructionsCommand
src/commands/update.ts      registerUpdateCommand
src/commands/knowledge.ts   registerKnowledgeCommand
src/commands/stage.ts       registerStageCommand
src/commands/project.ts     registerProjectCommand
src/commands/config.ts      registerConfigCommand
src/commands/lint.ts        registerLintCommand
src/commands/migrate.ts     registerMigrateCommand
src/commands/model.ts       registerModelCommand
src/commands/setup.ts       registerSetupCommand
src/commands/req.ts         registerReqCommand
```

新增命令组：在 `src/commands/` 创建 `registerXxxCommand(program)` 模块，并在 `src/cli/index.ts` 末尾追加 import + register 调用。

## 全局选项

除 Commander 内置 `-v, --version` / `-h, --help` 外，根程序注册以下**全局选项**（v1.1.2-stage-58 新增 `--encoding`/`--log-file`/`--no-log`/`--debug`）：

| 选项 | 说明 |
|------|------|
| `--project <path>` | **v1.2.2-stage-95 新增**：以指定目录为项目上下文（语义等效 cwd）；`runCli` 预扫描后 `process.chdir` 单点注入，不传回退 `process.cwd()` |
| `--no-color` | 禁用彩色输出（亦可通过 `NO_COLOR=1`；当前无着色实现，与编码解耦） |
| `--encoding <encoding>` | 输出编码（`utf8\|gbk\|auto`，默认 `auto`） |
| `--log-file <path>` | 运行日志文件路径（默认 `~/.openfeel/cli/logs/openfeel-YYYY-MM-DD.log`；相对路径按**原始 cwd** 解析，不受 `--project` chdir 影响） |
| `--no-log` | 关闭运行日志（亦可通过 `OPENFEEL_LOG=0` / `OPENFEEL_NO_LOG=1`） |
| `--debug` | 记录 debug 级日志（默认仅 info/warn/error） |

**`--project` 边界（v1.2.2-stage-95）**：支持 `--project <path>` / `--project=<path>`；多值不一致 → `INVALID_ARGUMENT`（exit 1），路径不存在或非目录 → `PROJECT_NOT_FOUND`（exit 1）；命令输出语言按**目标项目**解析，而 `--help` 语言按原始 cwd（`applyHelpI18n` 在 chdir 前执行，已登记为文档边界）；CLI 为单进程单命令，`chdir` 每进程至多一次。`knowledge dedup` 保留其本地 `--project` 声明（语法零变化），经 `optsWithGlobals()` + 单点解析读取。

**`--version --json`（v1.2.2-stage-95）**：`--version --json` / `-v --json` 输出 `{schemaVersion:1,version,node}`（三键，`schemaVersion` 首键，exit 0）；纯文本 `--version` 逐字不变。

**输出编码自适应（stage-58）**：`auto` 在 Windows 非 TTY（管道/重定向）下按 `chcp` 映射转码，TTY/POSIX 直通 UTF-8；`--json` **恒 UTF-8**（解析第 1 步最高优先，覆盖显式 `--encoding`/`OPENFEEL_ENCODING`/auto）；不可编码字符降 `?` 且**不告警**；**仅支持 UTF-8 字符串语义**（非默认 encoding 的直接 write 不受支持）。详见 [输出编码自适应](output-encoding.md)。

**运行日志（stage-58）**：默认**开启**，恒 UTF-8，按日一文件（不自动清理）；`info`/`warn`/`error` 默认记录、`debug` 默认关；best-effort（写失败不阻塞 CLI）；与 `.openfeel/log/**` / `flow.json.log[]` / `update_infos.md` 四类日志**语义分离**；`error` 仅记「命令处理中抛出的异常」，**commander 解析期错误不入日志**（REV-002）。详见 [CLI 运行日志](../core/runtime-log.md)。

## i18n 集成

- 翻译数据：`src/core/i18n-data/{zh-CN,en}.ts`，按域组织（common/flow/init/...）
- 核心函数：`t(key, lang, vars)` 按 key 取翻译；`getCliLang(projectPath)` 确定当前语言
- `applyHelpI18n(program)`：递归遍历 Commander 命令树，将 description / option 硬编码文本替换为当前语言翻译（`help.{命令}.{选项}` key 规则）。**v1.1.2-stage-50（T38）起**：`walkCmd` 增 **`arguments` 遍历**（键 `help.<path>.arg<name>`，以 `hasKey` 守卫避免缺失告警）——en 下位置参数描述同走 i18n；**选项遍历亦以 `hasKey` 守卫（v1.1.2-stage-58：`--encoding` 等根选项无 `help.openfeel.<opt>` 键，避免每命令缺失告警）**；**v1.1.2-stage-51 起全量补齐**（`cli/BUG-004` **closed**）：存量 20 处 + 新增子命令 `knowledge dedup` 1 处 + 已补 `stage.create` 1 处，均有 `help.<path>.arg<name>` 双语键；op-009 增**运行时全量枚举门禁**（`test/cli/help-arguments.test.ts`：动态遍历命令树，en 下 `Arguments:` 段 CJK 零命中，**33 个含位置参数的命令**，新增命令自动纳入）。并发冲突文案亦收敛至 `handleCliError` 单点。

## 错误处理与退出码

`src/cli/index.ts` 提供统一 CLI 入口与错误处理（v1.1.0-stage-35 新增；**v1.2.2-stage-95 扩展为分层错误出口**）：

- `runCli()`：包裹 `program.parse()`，捕获冒泡异常交给 `handleCliError()`；`bin/openfeel.js` 有参数模式改调 `runCli()`（REPL 分支不变）。
- `handleCliError(err)`：识别 `isFlowConcurrentError(err)`（flow.json 乐观并发冲突）→ 统一并发出口（v1.2.3 起：JSON 模式 emit envelope + 置 `process.exitCode=2` 后返回；非 JSON 模式 `process.exit(EXIT_CONCURRENT)`）；非并发错误原样 rethrow。
- `EXIT_CONCURRENT = 2`：并发冲突退出码，与通用错误 1 区分，供自动化识别「可重试」冲突。
- **错误层（v1.2.2-stage-95）**：`src/core/errors.ts` 提供 12 行 `code → kind → exitCode` 映射表（单一权威，含 `kind ∈ {refusal,internal}`）；`src/commands/shared/errors.ts` 提供 `failCli` / `failRefusal` / `failInternal`；`runCli` 统一 catch——JSON 模式输出错误 envelope，非 JSON 模式保留既有 stderr 文案并把内部错误置 exit 3。**v1.2.3-stage-99（REV-95-009）**：`handleConcurrentConflict` JSON 分支与 `failCli` 同机制（emit → exitCode → return），`handleAddStageError` 返回类型 `void`，10 个调用点显式返回、无 fallthrough。
- **双形态**：新 envelope `{schemaVersion:1,error:{code,kind,message,detail}}` 覆盖文本型失败；legacy `{schemaVersion,error:'...'}` 保留 `error` 为 `string` 与既有键序，仅在末尾追加 `errorKind`；判别唯一规则 `typeof doc.error`。
- **JSON 模式用法错误**：Commander 解析期错误（未知命令 / 未知选项 / 缺参）经 `exitOverride` 归 `INVALID_ARGUMENT`/refusal/1；非 JSON 模式零变化。
- 完整契约（首键 / 单文档 / **33 出口冻结表** / 12 行映射表 / 迁移边界）见 [JSON 输出契约](../core/json-contract.md)。

| 场景 | kind | 退出码 |
|------|------|:--:|
| 成功 | — | `0` |
| 预期拒绝（门禁拒绝 / 相位非法 / 非法参数 / 用法错误 / 未初始化 / 并发冲突） | `refusal` | `1`（并发冲突为 `2`，保留 `EXIT_CONCURRENT`） |
| 内部错误（未捕获异常 / 内部故障） | `internal` | `3`（v1.2.2-stage-95 新增） |
| 并发写冲突（可重试） | `refusal` | `2` |

**质量门禁退出码（v1.1.2-stage-50，R1/T17）**：`lint i18n` / `lint kb` **发现问题即 `exit 1`**（对齐 `flow health`），使 CI 可直接以其为门禁；用 `process.exitCode = 1` 而非 `process.exit(1)`（防 stdout 异步 flush 被截断）。**不新增** `--warn-only`/`--no-fail` 逃生阀——忽略结果应由调用方显式表达（`lint kb || true`）。

已包裹 `mgr.save()` 的 catch 块（`flow stage add`、`stage create`、`flow wizard`）在 catch 首部增加 `isFlowConcurrentError` 分支，保证同样提示与退出码 2。

**结构化错误分流（stage-47）**：`plan stage add` / `flow stage add` / `stage create` 三入口在通用 `common.errorTmpl` 之前增加 `err instanceof StageDirConflictError` 分支 → 用 `common.stageDirConflictTmpl`（zh/en 对称）渲染冲突信息（含 `stage` / `other`），杜绝「核心层抛中文错误绕过 `t()`」的死键问题（`cli/BUG-002`）。

## 关键命令示例

> ⚠️ 本仓执行一律用 `node bin/openfeel.js <cmd>`；全局 `openfeel` 可能命中旧版（如 1.1.1）。安装后的一般使用者用法 `openfeel <cmd>`（查询型）见 `manual/index` / skill 说明。

- `node bin/openfeel.js flow advance --stage <id> --to <phase> [--dry-run] [--force] [--review-tier <full|lean|skip>]` — 推进阶段（经 FlowManager 校验）；`--dry-run` 预览不修改，`--force` 跳过非法 phase 和阶段跳跃检查。**`--dry-run` 字节级不写盘（stage-49 B1）**：目标阶段 phase/status 不一致时，`autoRepairInconsistency` 走**预览模式**（`{dryRun}` 只算不赋值），仅非 dry-run 才 `save()`；dry-run 输出用**预览专用键** `flow.advance.autoRepairPreview`（「正式执行将自动修复」），`flow.json` 字节 / `meta.revision` / phase 均不变（回归断言）。**v1.2.1-stage-92 起**：新增 **`--review-tier <full|lean|skip>`**（**审查档位**，本次调用**显式声明**；**缺省 = `full`（零裁剪）= 零回归**——按模式派生的是 `flow phases` 的展示值 `reviewTier`，不是 `flow advance` 的生效档位；**v1.2.3-stage-99 订正 help 文案**）——按档位裁剪审查关（`full` 零裁剪 / `lean` 裁 `scheme_review` / `skip` 裁 `plan_review`+`scheme_review`；**恒保留** `review_pending` 代码审查关 + blocking REV 门不得绕过）；值域非法 → exit 1 零写盘；显式 `lean`/`skip` → 一行**非阻断** `console.warn`；`--dry-run` 预览含档位行；审计 detail **仅显式时**追加可选键 `review_tier`（既有键逐字保留）。**缺陷修复记录（v1.2.1-stage-93 清零）**：`cli/BUG-011`——阶段恰停于被裁剪相位时该档位曾无可达目标（死锁）；**现裁剪只作用于入边 / 目标侧，被裁剪相位保留出边**，可正常向该档位下游推进（`plan_review` + `skip` → `plan_passed` exit 0 零 `--force`）；「**进入**被裁剪关」仍不可达；同场景失败提示行的可达目标由「(无)」转非空（有意变更，已登记）
- `node bin/openfeel.js flow phases [--mode <full|fast|general>] [--stage <id>] [--json]` — 自描述全部合法 phase 与运行时流转映射（数据源 `.openfeel/pipeline.yaml`，缺省回退默认表）；运行时含内置 15 之外的 phase 时追加**边界说明**，`--json` 结构为 `{ schemaVersion, phases, transitions, advanceAccepted, transitionsDiff, workflowMode, reviewTier, displayReviewTier, effectiveReviewTier }`（**v1.2.2-stage-96：既有 7 键逐字保留，末位追加 2 键 → 9 键**；`reviewTier` = 展示值兼容别名，`displayReviewTier` = 同值显式名，`effectiveReviewTier` = `flow advance` 缺省生效档位恒 `'full'`；`advanceAccepted` = 内置 15，即 `flow advance` 的推进白名单；`phases` 为存在视图；**`transitionsDiff`（stage-50 T19）** = 运行时与内置默认转移表的差异报告，`missing` 列出内置默认有而运行时缺失的 source——使 `pipeline.yaml` 漂移**可见而非静默**，未修改 `pipeline.yaml`）。**v1.1.7-stage-75 起**：新增 **`--mode`/`--stage` 模式解析链**（`--mode` 显式 → `--stage` → `current.stage` → 级联兜底 builtin；经 `resolveStageWorkflowMode` **单点派生**，与 `flow mode` 同源，**禁第二信源**）+ 人类输出**模式分节行** + **`--json` 追加 `workflowMode`**（既有五键逐字不变；`transitionsDiff` **同模式**对比）；显式消除 `:391/:393` 无参调用（修复 fast 阶段**静默输出 full 表**的错表缺陷；`--mode`/`--stage` 非法 → exit 1）。**v1.2.1-stage-92 起**：人读增设**审查档位分节行**（档位 + 来源 + 查看指引）；`--json` **末位追加** `reviewTier`（= 模式派生档位 `MODE_DERIVED_TIER[derivedMode]`，既有 6 键**逐字保留、顺序不变**，7 键 = 6 + 1）。**审查档位**（`full`/`lean`/`skip`）与**工作流模式**（`workflow_mode`）分属两轴，展示命名禁「快线」二字（消歧）
- `node bin/openfeel.js flow next [--json]` — **v1.2.2-stage-96 新增（只读）**：当前阶段的调度决策单点输出。人类输出：阶段 / 相位 / 负责 Agent / 工作流模式 / 展示档位 / 生效档位 / 合法下一相位 / 建议命令 / 守卫 / 阻塞 REV。`--json` **12 键固定序** `{ schemaVersion, stage, phase, phaseLabel, responsibleAgent, workflowMode, reviewTier, effectiveReviewTier, legalNextPhases, suggestedCommand, guards, blockingReviews }`；`responsibleAgent` 经 `getResponsibleAgent`（与 `mapPhaseToAgent` 同源）；`legalNextPhases` = `getAvailablePhases` 直接可达集（每元素均被 `flow advance` 接受）；`suggestedCommand` = `openfeel flow advance --stage <s> --to <首项>`（空集 `null`）；`guards` 本地化字符串数组（固定序：无活跃阶段 → auto-advance disabled → blocking REV → 无合法目标 → 展示档位≠生效档位）；`blockingReviews[]` 元素键 `{id,title,priority,op}`（阶段域过滤）。**空态**：无活跃阶段/阶段记录缺失 → 可空字段全 `null`、数组 `[]`、`responsibleAgent='feel'`、`guards=[noActiveStage]`；未初始化 → `NO_INIT` refusal exit 1。**只读零写盘**（不 save / 不 appendLog / 不改 phase）；本版不支持 `--stage`
- `node bin/openfeel.js flow mode [--stage <id>] [--json]` — **v1.1.7-stage-75 新增（只读）**：显示当前工作流模式与来源（`当前模式：{mode}  [来源: {source}]` + 可达目标）；`--json` 结构 `{ schemaVersion, stage, mode, source, modes: { full, fast, general } }`（**稳定结构**，`source` 含 `status.md`/`requirement`/`config.yaml`/`profile.yaml`/`builtin`；`modes` v1.2.1-stage-90 起 3 值）；**不写盘、不推进**（执行前后 `flow.json`/`config.yaml`/`status.md` SHA256 不变）；非法 `--stage` → exit 1 + 建议名
- `node bin/openfeel.js flow stage add <stageId>` — 注册层：仅注册 flow.json，不建目录（通常应使用 `node bin/openfeel.js plan stage add`）
- `node bin/openfeel.js flow stage remove <stageId> [--force] [--dry-run] [--purge]` — 移除阶段（安全校验：ops 非空 / 当前活跃 / 被 deps 引用；默认仅注销 flow.json，`--purge` 删目录且**在 `save()` 成功后**执行，避免「目录已删、注册仍在」中间态）
- `node bin/openfeel.js flow stage reset <stageId> --to <phase> [--dry-run]` — **精准复位**阶段 phase（**允许回退**，不受正向 `transitions` 限制；受**合法 phase 值域** + `to=done` 的**阻塞 REV 检查**约束）；写 `phase` 后按 `mapPhaseToStageStatus` 投影同步 `status`（phase 权威）；审计 `reset_stage_phase`；**不触发归档 commit**、不写 checkpoint；`--dry-run` 零写盘（v1.1.4-stage-65）
- `node bin/openfeel.js flow checkpoint restore <file> [--force] [--stage <id>] [--dry-run]` — Checkpoint 恢复：**无 `--stage` = 全量覆盖**（需 `--force` 确认；**最后手段**）；**`--stage <id>` = 仅回退该阶段子树**（其它阶段与 pipeline 其余字段不动）；**`--dry-run` = 只读差异预览**（列出 `阶段: fromPhase(fromStatus) → toPhase(toStatus)`，**零写盘**，不要求 `--force`）；快照文件名仅允许纯文件名（拒绝路径穿越），乐观并发 `revision` 校验 + 写前 `.bak`（v1.1.4-stage-65）
- `node bin/openfeel.js flow archive <version> [--dry-run] [--json]` — **v1.2.0-stage-79 新增**：`flow.json` 版本分片归档（把已收官版本的 `stages` + 关联 `reviews` + `log` 三段移入 `.openfeel/flow-archive/{version}.json`）。**版本存在性门前置**（无该 version 候选 → exit 1 零写盘，防空归档覆盖既有归档）→ **判据门**（全 done + 无 `blocking !== false && status==='open'` REV → exit 1 零写盘，列未满足项；不设 `--force`）→ `--dry-run` 预览（**四写盘点逐字节零写盘**）→ **两步事务顺序**（先 `writeArchiveFile`〔独立锁 `flow-archive`〕→ 移除三段 + `addArchivedVersion` + `applyArchivePipelineDisposition` → `mgr.save()`〔后，并发冲突 exit 2〕）→ 审计 `archive_flow_version` + `pipeline` 处置（`current` 置空 + `phase` 重算〔空集→`active`〕）。`--json` 成功 `{schemaVersion:1,version,stages,reviews,log,dryRun}`、失败**纯 JSON 单文档** + exit 1；**v1.2.2-stage-97 起**：拒绝/成功分支均追加判据明细 `eligible` / `unfinishedStages:[{id,phase}]` / `blockingReviews:[{id,title,priority}]`（legacy 键序保留，新键插在 `blockingOpen` 后、`errorKind` 前；成功两分支同形 `eligible:true` + 空数组；判据复用 `listArchivableCandidates` + `listBlockingOpenRevsForVersion`；`--dry-run` 零写盘）；`<version>` 接受 `v1.1.7`/`1.1.7`（归一 = **去 v 再加 v**）。**与顶层 `openfeel archive <stage>`（阶段摘要 → `.openfeel/log/archive-*.md`）职责分离**
- `node bin/openfeel.js flow archive list [--json]` — **v1.2.0-stage-79 新增（只读）**：列出已归档版本 + 计数（引擎**字典序**，非语义版本序）；空目录 → 「暂无归档」exit 0；子命令 action 合并 `command.parent?.opts().json`（REV-79-018）
- `node bin/openfeel.js flow archive show <version> [--json]` — **v1.2.0-stage-79 新增（只读）**：查看指定归档版本（人类 = counts + stages 概览；`--json` = **全量**含 log/reviews + `schemaVersion:1`）；版本不存在 → exit 1 + 列可用版本
- `node bin/openfeel.js flow wizard` — 交互式流水线向导，支持无阶段时自动引导创建首个阶段；**v1.1.7-stage-75 起**：**首次选型工作流模式**——TTY 下若目标阶段无「工作流模式」字段且项目未设 `config.yaml defaults.workflow_mode`（首次），则 `select` 询问一次（`full`/`fast`），选择写该 stage `status.md` + `config.yaml`（**项目级记忆**）+ 输出「已记忆」；已设值不再询问（幂等，改值走 `stage set --workflow-mode`）。**非 TTY → 既有全局守卫逐字不动**（`nonTtyHint` + `process.exitCode = 1`；模式询问不可达、零写盘、退出码不变，T39 保持）
- `node bin/openfeel.js flow health --quick` — 流水线健康检查；**非 `--quick` 时含第 7 项「悬空依赖」检测**（`checkDanglingDeps`：`stages[].deps` 指向未注册阶段时 `warn`；仅数据卫生提示，`ok` 判定只看 `fail`，不阻塞退出码，stage-49 B2）+ **第 8 项「孤儿操作方案」检测（v1.1.2-stage-51，N1-3）**：键孤儿/文件孤儿计数 `warn`（**非 `fail`，不改变退出码**；与 `flow repair` 共用 `findOrphanOps`）+ **「归档一致性」检查项（v1.2.0-stage-80）**：a 索引↔归档文件双向对账 + b 活跃集残留（**两段式键粒度**判据）+ c 悬空依赖读侧同口径；全 `warn`-only、**恒无 `fail`、不改退出码、非 quick、不参与 `--fix`**（见 `core/flow-archive.md`）。**第 7 项悬空依赖 v1.2.0-stage-80 起读侧同口径**：`known` 并入 core helper `isArchivedVersionOf`（**版本粒度、短名恒 false**）——已归档版本阶段视为**已满足**、不再报悬空（与写侧两校验点同 helper 同口径）
- `node bin/openfeel.js stage set <id> --status <v>` — 更新阶段状态（**v1.1.2-stage-51 起幂等 + 字段扩展**：同值 no-op + 按需 `.bak` + `--exec-mode`/`--auto-advance`/`--review-agent`/`--workflow-mode`，详见下「纠正/清理侧命令面」；**v1.1.4-stage-62 起 `--status` 值域校验**：仅接受粗粒度状态枚举，相位值/任意值 → exit 1 零写盘）
- `node bin/openfeel.js plan stage add <name> [--deps <ids...>] [--tasks <items...>] [--exec-mode <manual|auto>] [--auto-advance <enabled|disabled>] [--workflow-mode <full|fast|general>]` — 完整入口（推荐）：建目录 + overview/status + 注册 flow.json + 依赖落点；**`--deps` 校验依赖存在性（stage-49 B2）**：命令层用 `normalizeStageId` 归一化比对 `deps ⊆ 已注册 stages`，无效项列出已注册阶段并 **exit 1**；`flow.json` 未初始化（无阶段）时同样 exit 1（提示「已注册阶段：（无）」）；**v1.1.4-stage-63 起** `--exec-mode`/`--auto-advance` 显式覆盖 config 默认（值域非法 → **exit 1 且不建阶段**）；未显式时新阶段 status.md 的 `执行模式`/`自动推进` 初值取 `config.yaml.defaults`（`resolveConfigDefaults`，缺失/非法逐键回退 `DEFAULT_CONFIG`）；核心层 `addStage` 不做存在性校验（仅命令层强制）。**v1.2.0-stage-80 起**：**已归档版本**（`meta.archived_versions`）的 dep 视为**已满足**（core helper `isArchivedVersionOf`，**版本粒度、短名恒 false**）——`v1.0.0-stage-01`（显式版本前缀且版本已归档）放行；短名/typo 仍 `exit 1`（既有负例零翻转）**v1.1.7-stage-75 起**：新增 **`--workflow-mode`**（逐条仿 `--exec-mode`：值域 `getConfigFieldLegalValues('workflow_mode')` 派生、非法 **exit 1 不建阶段**、缺省取 config 默认），骨架 status.md 在「**自动推进**」行后增 `- **工作流模式**：{v}` 行；`flow.json` 同步写冗余字段（裁定 G）
- `node bin/openfeel.js stage create <stageId>` — 已弃用（注册层，与 `flow stage add` 等价；建议改用 `plan stage add` / `flow stage add`）
- `node bin/openfeel.js migrate [path] [--dry-run] [--remap-assignee] [--clean-global-core-md]` — 存量旧布局项目迁移（检测/备份/迁移/回滚），`--dry-run` 预览不写盘，`--remap-assignee` 改写 flow.json 旧 assignee（默认仅报告），`--clean-global-core-md` 删除已废弃的全局 core.md（默认仅提示不删）
- `node bin/openfeel.js migrate rollback [--dry-run]` — 回滚最近一次迁移（读 `.openfeel/backup/{latest}/manifest.json`），`--dry-run` 仅预览回滚计划
- `node bin/openfeel.js setup [--lang <zh-CN|en>] [--tools <list>] [--check [--json]]` — 纯全局部署（全局 AGENTS.md + agent + skill + 全局平台适配器配置（opencode.jsonc）），不建立项目 `.openfeel/`，幂等；**`--check` 为只读诊断**（四态、零写盘、一致退出 0 否则 1，`--json` 单文档含 `schemaVersion`，v1.1.5）；**`--tools <list>`（v1.1.6-stage-71）**：部署目标工具（逗号分隔，如 `opencode,claude`），默认仅 `opencode`，非法值 exit 1 前置校验零写盘（`setup --tools claude` → 仅 `~/.claude/`：CLAUDE.md + **10 agents**（v1.2.1-stage-89 由 9 翻转） + 22 skills + `settings.json` 注入 `agent`/`permissions.defaultMode`，v1.1.6-stage-73）（详见 [setup 命令](cli/setup.md)）
- `node bin/openfeel.js update <path> [--lang <zh-CN|en>] [--force] [--tools <list>]` — 增量部署；**`--tools <list>`（v1.1.6-stage-71）**：与 setup 共用 `parseToolList`（非法值 exit 1）；**默认（不带 `--tools`）仅部署默认启用工具**（`supportedTools.filter(t=>t.enabled)`，R-5）——默认 `update <path>` 后 `~/.claude` 零触；`--tools claude` 部署 CLAUDE.md + **10 agents**（v1.2.1-stage-89 由 9 翻转） + 22 skills（含 settings.json 注入）
- `node bin/openfeel.js init [path] [--workspace-only] [--non-interactive]` — 项目初始化；`--workspace-only` 仅创建 `.openfeel/` 工作区（不建全局规则/平台适配器配置（AGENTS.md/opencode.jsonc）），供 Feel 空白项目自动搭建；**已存在的 `.openfeel/config.yaml` 不覆盖**（保留用户配置，`InitResult.skipped` 经 `init.skipped` 输出用户可见提示，stage-47）
- `node bin/openfeel.js model set <agent> <model> [--scope default|global|project] [--build] [--force]` — 三层级 agent 模型读写，详见 [model 命令组](cli/model.md)
- `node bin/openfeel.js config effective [key]` — 输出**四个**受管配置键（`execution_mode` / `auto_advance` / `merge_mode` / **`workflow_mode`**，v1.1.7-stage-74 增）的有效值 + 生效来源（`status.md > config.yaml > profile.yaml > builtin`）；复用 `FlowManager.resolveEffectiveConfig()` 单一权威，与 `flow status --verbose` 级联表同源；未知 key → stderr + exit 1（不静默）
- `node bin/openfeel.js config get [key] [--global]` / `node bin/openfeel.js config set <key> <value> [--global] [--sync-stages] [--stage <ids...>]` — 原始值读写（不经级联解析）；**v1.1.2-stage-50（R3/T36）起支持全量 `defaults.*`**（键白名单由 Schema 驱动，与 `config effective` 覆盖范围一致）：值类型归一（boolean 键写布尔）+ 枚举校验（**非法报错且不写盘**）+ get/set/effective 三口径一致；**v1.1.4-stage-63 起** `defaults.X ≡ X`（键归一，单一来源 `normalizeConfigKey`；`--global` 的 profile 键域不受影响），且 `config set ... --sync-stages`（**仅项目模式**，与 `--global` 组合 → exit 1）将值批量写入阶段 status.md 对应字段——适用键 `auto_advance`（`自动推进`）/`execution_mode`（`执行模式`）/**`workflow_mode`（`工作流模式`，v1.1.7-stage-75）**；同值 **no-op**，其它键（无阶段字段）**跳过并报告**。**v1.1.7-stage-75 起**：新增 **`--stage <ids...>` 作用域限定**（缺省 = 全量；空格/逗号两种写法；**前置全量校验、未注册 exit 1 零写盘**；**单独 `--stage` 或与 `--global` 组合 → exit 1**；**不过滤阶段状态**，done 阶段显式列入正常处理）；`workflow_mode` 字段缺失改走**插入**（`insertStatusField`），命令层落地 **`inserted` / `skipped-no-anchor`** 分支（**禁落 default 报错**）+ 汇总行「**同步 N / 插入 M / 跳过 K**」（**退出码恒 0**）；`config get-lang` / `set-lang <lang>` / `list-projects` 为全局语言子命令

### 纠正/清理侧命令面（v1.1.2-stage-51，反馈 08）

> 补齐「创建侧齐备、纠正侧空白」缺口，使「禁止手改 `flow.json`」在**故障恢复场景**下可解。核心命题与三类能力（删除/修正/对账）见 `kb/architecture.md #纠正侧能力对称原则`。

- `node bin/openfeel.js plan scheme remove <stage> <opId> [--force] [--dry-run]` — 注销 op 注册键（**不删除 op 模板文件**）：默认拒绝删除 `state=done` 或**存在 checkpoint 进展**的 op（`--force` 覆盖）；孤儿（无文件）可直删并提示；`--dry-run` 预览不写盘；审计 `scheme_remove`。
- `node bin/openfeel.js plan scheme register <stage> [opId] [--dry-run]` — 补注册 ops/ 中**未注册的 op 文件**（fileOrphans，与 `flow repair --prune-orphans` 清键孤儿对称）；未指定 opId 补全量，`--dry-run` 零写盘；注册默认 `state=pending`，audit `register_op`。
- `node bin/openfeel.js flow repair [--dry-run] [--backup] [--prune-orphans]` — **op↔文件对账**：默认**只报告**键孤儿（有注册无文件）/ 文件孤儿（有文件无注册），**零写盘**；`--prune-orphans` 仅清理**键孤儿**（删 flow.json 键），**文件孤儿永不自动删除**；对账由 `findOrphanOps` 单一实现，与 `flow health` 共用。文件孤儿的**补注册出口**为 `plan scheme register`（本行 `--prune-orphans` 仅清键孤儿，方向相反）。
- `node bin/openfeel.js flow stage set <stageId> --deps <ids...>` — 覆盖阶段依赖（支持空格/逗号）；**悬空依赖 exit 1 且不写盘**（命令层强制校验，对齐 `plan stage add --deps`）；**v1.2.0-stage-80 起**已归档版本 dep 视为已满足（`isArchivedVersionOf`，版本粒度、短名恒 false）；未带 `--deps` 视为清空。
- `node bin/openfeel.js flow review update <revId> [--priority high|medium|low] [--title <text>] [--blocking true|false]` — 更新审查条目（至少一字段；非法枚举/未命中 exit 1）；`flow review remove <revId>` 删除并打印标题（审计 `review_update` / `review_remove`）。`view` 侧**不新增** update/remove（禁止第二套实现；`view` 组的 `add` 子命令**已移除**，改用 `flow review add`）。
- `node bin/openfeel.js flow advance ... [--quiet]` — **git 脏区警告降噪**：默认仅 `--to done` 时提示（非 done 不再调用 `git status`）；`--quiet` 完全静默（成功行与警告均不打印；错误仍 stderr + exit 1）。
- `node bin/openfeel.js stage set <id> [--status <v>] [--exec-mode manual|auto] [--auto-advance enabled|disabled] [--workflow-mode full|fast|general] [--review-agent <agent>]` — **先探测后写**（三态 `not-found`/`unchanged`/`will-change`）：同值 → **no-op 成功 exit 0 且不生成 `.bak`**；将变更 → 备份后写入；字段缺失 → exit 1。字段白名单：`状态`/`执行模式`/`自动推进`/`工作流模式`/`当前责任 Agent`/`上一责任 Agent`（非法枚举 exit 1 且不写盘）。**`--status` 值域校验（v1.1.4-stage-62）**：仅接受**粗粒度状态枚举** `planned` / `review_failed` / `review_passed` / `testing` / `archiving` / `done`（单一来源 `STAGE_STATUS_VALUES`，`flow-manager` 导出）；传入**相位值**（如 `review_pending`，含 `_`）或**任意值** → **exit 1 且零写盘**（复用既有 `stage.set.invalidValueTmpl`，不生成 `.bak`）。**v1.1.7-stage-75 起 `--workflow-mode` 插入语义（裁定 H）**：目标 `status.md` 无「工作流模式」行时 → 走 **`insertStatusField`**（锚点链「自动推进」→「执行模式」；`.bak` + 原子写，其余内容逐字保留）；**锚点皆缺 → exit 1 不写盘、无 `.bak`**；其余旧字段（状态/执行模式/自动推进/责任 Agent）**保持既有 exit 1 口径不变**（零回归）；`flow.json` 冗余字段同步写入（冗余仅在**实际写入**时同步）
- `node bin/openfeel.js stage task <id> --add "<描述>"` — 追加任务行（编号 = 既有最大 +1，范式 `- [ ] 任务N：...`）；`--add` 与 `--done`/`--undo` 互斥；`<taskNo>` 由必填改为可选。
- `node bin/openfeel.js plan stage add <name> [--deps <ids...>] [--tasks "<t1>" "<t2>"] [--exec-mode <manual|auto>] [--auto-advance <enabled|disabled>]` — 初始化任务行（与 `stage task --add` 共用生成函数，产物格式逐字节一致）；无 `--tasks` 时保持 `> 待补充`；`--exec-mode`/`--auto-advance` 显式覆盖 config 默认（**v1.1.4-stage-63**，未显式则取 `config.yaml.defaults`）。
- `node bin/openfeel.js knowledge dedup [content] [--project <path>] [--category <architecture|patterns|troubleshooting|setup>] [--threshold <0~1>]` — **检索相似知识条目（只读建议，不修改 kb）**；未传 `content` 时从 stdin 读取；`--project` 注入 `basePath`（默认 `process.cwd()`）；输出相似度 + 「建议合并/更新」标注 + 只读尾注；正常 exit 0、参数错误 exit 1；随包分发（`npm pack` 含 `dist/utils/kb-dedup.js`）。模板引用已同步为「用 `openfeel knowledge dedup` 获取去重建议」（A6）。
- **op 文件命名（v1.1.2-stage-51，N8/A5）**：新建 op 固定 `op-NNN.md`（**标题写入内容首行** `# {opId}：{title}`，不再进文件名）——标题含 `/`/空格/中文均可创建（修复含 `/` 时 ENOENT 创建失败）；**历史 `op-NNN_标题.md` 不迁移**，读取端 `extractTitle` **兼容回退**（文件名含 `_` 走原解析，否则读内容首行）；**不提供** `rename`/`migrate` 命令。

### 可编排性与可观测性命令面（v1.1.2-stage-52，反馈 09）

> 面向「长时间、多阶段自动推进」：**批量编排**（一次到位/批量校正）、**机器可读**（`--json`/UTF-8）、**自愈恢复**（`--fix`/空模板检测）。核心设计见 `kb/patterns.md`（`--json` 约定 / 只报告型 vs 修复型边界 / draft 两阶段 / 多步 REV 复检）。

- **`--json` 结构化输出（B1）**：`flow status|current|health|metrics|overview --json` 输出**顶层对象 + `schemaVersion:1`**，纯 JSON 单文档（无 ANSI/标题，与人类可读互斥）；`flow phases --json` 保持既有键（`phases`/`transitions`/`advanceAccepted`/`transitionsDiff`）并**追加** `schemaVersion`。
- **`flow metrics` 口径注记（v1.2.1-stage-86）**：人类输出（有数据分支）末尾追加一行「耗时口径 = phase 窗口（含跨会话闲置 / 等待），非 agent 纯执行时长」（i18n 键 `metrics.summary.caliberNote`，+1 键）；**`flow metrics --json`（`getSummaryData()`）契约逐字不变**——该键**只增不改**；数据由 `recordRun` 在 advance 命令层接线写入（详见 `core/metrics.md`）。
- **`flow health --fix`（B2；v1.1.4-stage-62 权威口径）**：**权威 = `mapPhaseToStageStatus(phase)`（phase 的粗粒度投影；phase 为单一事实源）**，**仅回写 `status.md` 的「状态」字段**（执行模式/自动推进/当前任务/状态记录等独立字段绝不触碰），**批量遍历全部 stages**；`--fix --dry-run` 预览零写盘；幂等（已一致 applied=0）。`flow advance` **不回写** `status.md`，故 `--fix` 为**唯一批量对账/回写入口**（D3）。**L7 文件孤儿仅报告**（本仓 62 条，无清理入口，A6）。
- **`flow ops list [--stage] [--json]`（B3）**：展示每 op 的 `state` + 模板填充度（`(filled)`/`(empty)`）+ 空模板 warning；**`draft` 单独分组**。**（stage-54）** 填充度判定为**整行锚定**（正文行内引用占位标记不误报）；**已知边界（A9）**：`readOpTemplate` 返回 `null`（op 文件缺失 / 命名不含前缀 / 目录不可读）时按 `filled` 处理，与 `health` 的「`null` 跳过不报」为**同向漏检**（非分叉，两者同源 `opsMap`）——**不扩展** `detectFillState` 返回域与 `--json` 的 `fill` 取值集合。
- **`plan scheme create --draft` + `plan scheme publish <stage> <opId>`（B4）**：draft→pending 两阶段；`publish` 校验模板非空（否则 exit 1）；**窄兼容**：health 不报 draft 空模板 / advance·统计·归档不计入 draft / **`flow attempt --op <draft>` 拒绝**（exit 1 + 提示先 `publish`，命令层 + core 双层守卫）。**（v1.1.4-stage-64）** `plan scheme create` 序号改为**「ops/ 文件 ∪ flow.json 注册」最小未用正整数（空位回填）**；创建后对目标阶段**未注册文件**输出 stderr 告警并提示 `plan scheme register <stage>`；补注册入口为 `plan scheme register`。
- **`flow advance --stage <id> --to <phase>`（B5）**：沿 transitions **自动逐步**（BFS 唯一路径，深度 ≤8）；`--dry-run` 打印**完整路径**（`A → B → C`）；非法/多义目标 exit 1 + 列可达目标；**每步 `assertNoBlockingOpenRev` 复检**（blocking open REV 拦截，exit 1 + `revision` 不变）；未提供 `--to` 的单步行为不变。
- **`plan scheme rename <stage> <opId> --title "<title>"`（B6）**：同步 `flow.json` 标题与 op 文件内容首行；不存在 op → exit 1。
- **`plan scheme create <stage> [title] --from-tasks`（v1.1.7-stage-75，T6 裁定 I）**：从阶段**任务表**机械生成 `ops/op-NNN.md` 骨架 + `ops/deps.yaml` 占位（**不调用任何 Agent**、不要求 schemer 在场）；**幂等前缀锚定**（已铺任务跳过，`ops/deps.yaml` 占位不覆盖）；`--from-tasks` 与 `<title>` **互斥**（标题由任务行派生）；无待铺任务 → `无待铺任务`。提供 fast（及 full）模式所需的**全量骨架**，默认**无隐式副作用**（不在 `plan stage add` 时自动铺 op）
- **`NO_COLOR` / `--no-color`（B7）**：尊重环境变量与全局选项，输出无 ANSI 转义。**B9 实测**：真实 PS5.1 / `chcp 936` 下输出为合法 UTF-8（**不复现乱码**）→ 不引入编码 hack；但 PowerShell **直接管道捕获** `--json` 可能因消费端编码（gb2312）失真——建议重定向到文件 / 用 `JSON.parse` / pwsh 7 设 UTF-8。
- **`view add` 已移除（A4，破坏性）**：改用 `flow review add`（`addReviewEntry` 单点等价）；**保留** `view list`/`view accept`；`CHANGELOG` `Removed` 含迁移指引。
- **`flow current` 无 op（B8）**：回退显示 `current.stage` + 「(无 op)」。

> ✅ **已关闭缺陷（v1.1.2-stage-54）**：`cli/BUG-005`（medium）空模板检测**已由纯子串改为整行锚定**（`EMPTY_TEMPLATE_LINE_RE`，`isTemplateEmpty`/`detectFillState`/`publishScheme` 单一来源）——op 正文行内引用占位标记不再误判（`publish` 不再误拒 / `ops list` 不误报 `(empty)` / `health` 不误报），仓库空模板告警归零。`cli/BUG-006`（low）en 模式 blocking REV 拒绝文案**已迁 i18n**（`flow.advance.blockingRevRefused`/`blockingRevHint`，en CJK=0、zh 逐字不变）。`cli/BUG-003`（low）`flow phases --help` 已补 `transitionsDiff`（JSON 契约未变）。

### JSON 输出契约与错误封装（v1.2.2-stage-95）

> 面向 DSH 等机器消费者：契约正文单一权威 = `docs/json-contract.md`；可执行冻结 = `test/cli/json-contract.test.ts`；错误矩阵 = `test/cli/error-envelope.test.ts`。

- **33 个成功出口**（v1.2.2-stage-97 起）：`flow` 15（status / next / **recover** / **checkpoint list** / **log** / overview / current / metrics / phases / mode / ops list / archive / archive list / archive show / health）+ `req` 5（list / show / split / board / next）+ `instructions` 1 + `setup --check` 1 + **`stage status` 1** + **`knowledge` 4**（search / list / index / dedup）+ **`config` 2**（get / effective）+ **`view list` 1** + **`plan scheme list` 1** + **`project overview` 1** + **`archive <stage>` 1**；全部 `schemaVersion:1` 运行时首键 + stdout 单文档；键序/键集冻结，只增不改。
- **条件键登记**：`flow health.reconciled` 与 `flow ops list[].warning` 为恒在键（缺省 `null`）；`req next.candidates` 为条件出现键（`--limit > 1`）。
- **有意变更**：C1 `instructions` 补首键；C1b/G-1 `flow archive show` 首键由第 6 位重定位为 `schemaVersion`（其余 6 键相对序不变）；v1.2.2-stage-97 #8 `flow archive` 判据明细三新键、#12 `req list` 末位两键。
- **错误模式开关**：`flow advance --json` 成功仍输出人类文本、仅失败走 envelope，**不计入 33 个成功出口**。
- **注册选项数 34**：33 个成功出口 + 1 个错误模式开关；「注册选项数」与「成功出口数」不得混用（v1.2.2-stage-97：33 / 34）。
- **契约助手**：`src/commands/shared/json-output.ts`（`withSchemaVersion` / `emitJson` / `setJsonMode` / `resolveJsonMode` / argv 预扫描）；命令层不得自行解析 `--json`。

### 调度决策面（v1.2.2-stage-96）

> 面向 DSH 等适配器：调度决策（谁负责 / 可去哪里 / 下一步命令 / 守卫 / 阻塞项）由 CLI 单点输出，适配器不再镜像 `PHASE_AGENT_MAP` 或转移表。

- **`flow next [--json]`**（第 19 个成功 JSON 出口）：见上「关键命令示例」；只读零写盘。
- **`flow status --json.stages[]`**：每元素 **10 键固定序** `id,phase,status,deps,ops,workflowMode,requirementId,reviewTier,effectiveReviewTier,opsSummary`——**既有 5 键（`id,phase,status,deps,ops`）键序与类型/值逐字不变**，新增 5 键仅追加于后。`workflowMode` 逐阶段经 `resolveStageWorkflowMode(id)`；`requirementId = stage.requirement_id ?? null`；`reviewTier = MODE_DERIVED_TIER[workflowMode]`（展示）；`effectiveReviewTier = DEFAULT_EFFECTIVE_REVIEW_TIER`（恒 `'full'`）；`opsSummary = { total, byState }`（`total = Object.keys(ops).length = ΣbyState`，`byState` 仅含观测到的状态、空 ops → `{total:0,byState:{}}`）。顶层 4 键 `schemaVersion,pipeline,stages,counts` 不变。
- **`flow phases --json`**：9 键（既有 7 键 + 末位 `displayReviewTier` / `effectiveReviewTier`）；三模式取值 `full→full / fast→lean / general→full`。
- **三处档位一致**：`flow next` / `flow status.stages[]` / `flow phases` 的 `reviewTier` 均为展示值、`effectiveReviewTier` 均为生效值（恒 `full`）；契约正文见 `docs/json-contract.md` §12.1~§12.3。
- **决策单点**（核心层）：`getResponsibleAgent` / `listStageBlockingOpenReviews` / `DEFAULT_EFFECTIVE_REVIEW_TIER`——详见 [流水线管理](../core/flow-manager.md)。

### 读命令 `--json` 全量补全与判据扩展（v1.2.2-stage-97）

> 面向 DSH 等适配器：13 个读命令面不再需要解析中文人类文本；`req list` / `flow archive` 两个既有出口只增不改。契约权威 = `docs/json-contract.md` §5（33 出口）、§6（有意增量）、§13（读命令细则）。

- **新增 `--json` 的 13 个命令面（14 个新成功出口 #20~#33）**：
  - `stage status [stageId] --json`：无参 `{schemaVersion,stages:[{stageId,status,statusPath}],count}`；有参 `{schemaVersion,stageId,statusPath,fields,tasks,blockedBy}`——`fields` 为 7 规范键（`execMode,autoAdvance,status,reviewAgent,previousReviewAgent,updatedAt,workflowMode`）+ `raw`（原始中文键）；`tasks[]` 元素 `{number,done,description}`；路径为绝对路径；阶段不存在 → `STAGE_NOT_FOUND`/refusal/1。
  - `flow recover --json`：`{schemaVersion,initialized,phase,currentOp,stageStatus,blockedBy,pendingTasks,stageStats}`；未初始化 → `initialized:false` + 空值，exit 0。
  - `flow checkpoint list [stage] --json`：`{schemaVersion,stage,checkpoints:[string],count}`。
  - `flow log --last <n> --json`：`{schemaVersion,count,entries:[{time,agent,action,detail}]}`。
  - `knowledge search <q> --json`：`{schemaVersion,query,limit,offset,results:[{title,category,date,enabled,content,summary}]}`（含 content 全文）。
  - `knowledge list --json`：`{schemaVersion,entries:[{title,category,date,enabled}],count}`（不含正文）。
  - `knowledge index --json`：`{schemaVersion,categories,recentUpdates}`。
  - `knowledge dedup --json`：`{schemaVersion,threshold,categories,found,readOnly:true,matches:[{category,title,date,enabled,similarity,flagged}]}`。
  - `config get [key] [--global] --json`：项目 `{schemaVersion,scope,key,value}`；全局无 key `{schemaVersion,scope,values}`（6 键固定序）；项目无 key → `INVALID_ARGUMENT`/refusal/1。
  - `config effective [key] --json`：`{schemaVersion,effective:{key:{value,source}}}` 或指定 key `{schemaVersion,key,value,source}`。
  - `view list --json`：`{schemaVersion,count,reviews:[{id,op,status,priority,title,filed_by,filed_at,blocking,canAutoFix,autoFixDetail}]}`（`blocking` 缺省 `true`、`canAutoFix` 缺省 `false`、`autoFixDetail` 可空）。
  - `plan scheme list [stage] --json`：`{schemaVersion,stage,count,schemes:[{stage,opId,title,filePath,draft,fill}]}`（`fill` 复用 `detectFillState`）。
  - `project overview --json`：`{schemaVersion,project:{name,version,description},dirs,stats,entries,techStack}`（先 `collectProjectOverview` 聚合再双渲染；无 `initialized` 键，恒 exit 0）。
- **`archive <stage> --json`（第 33 个成功出口）**：`{schemaVersion,stage,archivePath,opsCount,reviewsCount,knowledgeExtracts}`；`archivePath` 与人类输出同源（绝对路径）；失败（阶段不存在/未初始化/写盘拒绝）→ `ARCHIVE_FAILED`/refusal/1；内部异常 → `INTERNAL_ERROR`/internal/3；不改变归档写盘行为。与 `flow archive <version>`（版本分片）职责分离。
- **`req list --json` 增量**：`requirements[]` 元素末位追加 `linkedStages:[{id,phase}]` 与 `progress:{done,total}`（聚合单点 `listLinkedStages` + `computeRequirementAggregate`）；零关联 `[]` + `{0,0}`；既有字段顺序/值不变。
- **`flow archive --dry-run --json` 判据明细**：判据拒绝分支（exit 1）保留 legacy `schemaVersion,error(string),version,notDone,blockingOpen`，在 `blockingOpen` 后、`errorKind` 前插入 `eligible:false` / `unfinishedStages:[{id,phase}]` / `blockingReviews:[{id,title,priority}]`（9 键）；成功 dry-run 与非 dry-run 同形追加 `eligible:true` + 两空数组；判据复用 `listArchivableCandidates` + `listBlockingOpenRevsForVersion`；`--dry-run` 零写盘。
- **no-init / 空态口径**：读视图 0 + `initialized:false`（`flow recover`）/ 空集合 0（`checkpoint list` / `flow log` / `knowledge search·list` / `view list` / `plan scheme list` / `project overview`）；需项目命令 refusal 1（`stage status <不存在>` → `STAGE_NOT_FOUND`；`config get` 项目无 key / `config effective` 未知 key → `INVALID_ARGUMENT`）。
- **内部异常口径**：JSON 模式内部异常 exit 3；`view list` 人类模式与 `flow archive` 非 dry-run `save()` 异常保持 exit 1（已登记边界，见 `docs/json-contract.md` §13.4 / §14.1）。
- **判定风格**：13 命令面的成功分支读**命令级 `options.json`**，错误 envelope 一律经 `isJsonMode()` 单点（§13 登记例外；`flow next` 沿用 `isJsonMode()`）。
- **已知边界**：`plan scheme list.draft` 的 opId 跨阶段同名匹配风险（§13.5，转 stage-98）；`knowledge index.recentUpdates` 的 `category/title` 受索引表头解析口径影响（人类输出同样表现，非本阶段引入）。
- **stage-98（文档收口）**：快照 / 计数 / 错误封装 / 读命令说明定稿；无源码变更。

### 需求命令组 `req`（v1.2.0-stage-82）

> 需求流转系统（主题一）的命令面（`openfeel req`，**11 子命令**；v1.2.1-stage-87 增 `split`）；命令层**零业务逻辑**（字段白名单 / 值域 / 状态流转合法性 / 认领占用 / 关联唯一性 / done 门**单点在引擎** `src/core/req/`）。**`split` 为唯一带 `--json` 的写命令**，其余写命令无 `--json`（既有边界，后续增补属纯增量）。

- `node bin/openfeel.js req add <title> [--target-version <v>] [--priority <P0|P1|P2>] [--workflow-mode <full|fast|general>]` — 创建需求（ID 自动分配 `REQ-NNN`；正文骨架铺到 `.openfeel/requirements/`；**`--workflow-mode` v1.2.1-stage-90 增**——`general` 无流水线、仅需求级合法、缺省不写该键；引擎抛错分流 → `common.errorTmpl` exit 1）。
- `node bin/openfeel.js req list [--status <s>] [--target-version <v>] [--owner <o>] [--json]` — 列出需求（多条件 AND；`--status` 值域取 `REQ_STATUSES`，非法 → exit 1）。**v1.2.2-stage-97 起**：`--json.requirements[]` 元素**末位**追加 `linkedStages:[{id,phase}]` 与 `progress:{done,total}`（聚合单点 `listLinkedStages` + `computeRequirementAggregate`，无 N+1；零关联 `[]` + `{0,0}`；既有字段顺序/值逐字不变）。
- `node bin/openfeel.js req split <id> --into <title> [--into <title> ...] [--json]` — **拆分一等动作**（v1.2.1-stage-87；**首个 repeatable option** + **首个带 `--json` 的写命令**）：顺序 ID + `parent_id` + 子初值 `scheduled`（拆分即发布）；失败零写盘（父不存在/父终态/空标题/缺 `--into`）；exit 0/1/2。
- `node bin/openfeel.js req show <id> [--json]` — 需求详情（关联阶段为**原始只读枚举**，零 done/进度聚合；v1.2.1-stage-87：human +父/子 2 行、`--json` 追加 `parent`/`children`，**只增不改**）。
- `node bin/openfeel.js req claim <id> [--owner <name>]` — 认领（四码分流 `not_found`/`already_claimed`/`invalid_field`/`invalid_status`；`--owner` 缺省走三级链 `.info.json user` → `git config user.name` → 哨兵 `unknown` 拒绝，**禁硬编码**；同 owner 幂等）。
- `node bin/openfeel.js req release <id>` — 释放认领（未占用 **no-op 恒 exit 0**）。
- `node bin/openfeel.js req set <id> [--status <s>] [--title <t>] [--target-version <v>] [--priority <p>] [--workflow-mode <m>]` — 更新字段（白名单；值域/流转合法性由引擎判定；合法目标经 `getAllowedNextStatuses` 派生，**禁命令层枚举**；**`--workflow-mode` v1.2.1-stage-90 增**——`general` 有链接 → `general_mode_conflict` 拒；`set`/`link` 经单点 `syncConfigFieldToStages` **下发**关联阶段）。
- `node bin/openfeel.js req link --stage <stageId> (--requirement <id> | --unlink)` — 关联/解绑（`--requirement` 与 `--unlink` **二选一**；`already_linked` **硬拒** exit 1 零写盘，须先解绑；仅一次 `normalizeStageId` 归一）。
- `node bin/openfeel.js req advance <id> --to <status>` — 显式推进状态（合法目标由引擎流转表判定；**done 门：非 `general` 需求须全部关联阶段 done；零关联 `general` 需求可显式完成**（v1.2.1-stage-93 载体制对偶完成路径）；被拒时 `done` 门场景输出专用文案 `req.err.doneGateTmpl`，错误码恒 `invalid_status`；**不设 `--force`**；同值 no-op exit 0）。
- `node bin/openfeel.js req board [--target-version <v>] [--json]` — 需求看板（按状态分组，**7 组固定顺序** = `REQ_STATUSES`，恒含空组；v1.2.1-stage-87：条目行 owner 非空时追加后缀，**仅 human**）。
- `node bin/openfeel.js req next [--owner <name>] [--limit <n>] [--json]` — 推荐下一个可接取需求（scheduled ∧ 未认领；排序：`target_version` 升序 → `created_at` → `id`；v1.2.1-stage-87：`--limit`（≥1 整数，判定基准 = 解析后数值；`> 1` 时 `--json` 追加 `candidates`））。
- **`--json` 契约**（5 命令 `list`/`show`/`split`/`board`/`next`）：成功/失败**均走 stdout 纯 JSON 单文档** + **stderr 零输出**；成功 `{schemaVersion:1,...领域对象}`、失败 `{schemaVersion:1,error,...ctx}` + exit 1；**exit 2（并发冲突）走统一出口非 JSON 单文档**（有意差异）。
- **退出码 0/1/2**：成功 0 / 各错误 1（`process.exitCode = 1`，**禁 `process.exit(1)`**）/ 并发写冲突 2（`handleConcurrentConflict` 单点）；失败路径 flow.json 逐字节零写盘。
- **help 键双规**（`applyHelpI18n`）：位置参数键 = `arg`+参数名逐字（非 camelCase）、选项键 = 长名 camelCase —— **44 键双向逐键断言**防死键（REV-82-011；37 → 42（v1.2.1-stage-87）→ **44**（v1.2.1-stage-90 增 `--workflow-mode`））。
- **正交**：`src/commands/req.ts` 不引用 `ALLOWED_TRANSITIONS` / 工作流模式 / 归档层 / `.phase` / `allLinkedStagesDone`（直读源文全内容 7 禁止串零命中）。
- **已知边界（REV-83-016）**：`flow stage reset` 复位后再推进 `done` **不回写** → 需求遗留漂移（health「需求漂移」warn 可察、**非自愈**）；行为修复转后续版本评估（收口期控制流冻结）。

### 故障恢复路径（v1.1.4-stage-65）

> 为「禁止手改 `flow.json`」在**故障场景**下提供可解路径。**顺序即优先级**；`flow stage reset`/`checkpoint restore` 改写 `flow.json`，`flow health --fix` 仅回写 `status.md`。

```
① flow health（诊断，只报告）
② flow stage reset <id> --to <phase>（精准复位单阶段）       ← 首选
③ checkpoint restore <file> --stage <id> --dry-run（预览）→ 去 --dry-run 执行（按阶段回退）
④ checkpoint restore <file>（无 --stage，全量覆盖）          ← 最后手段
⑤ flow health --fix（对账 status.md「状态」，仅该字段）
```

- **① 诊断**：`flow health`（可加 `--quick`/`--json`）只报告问题，**不修复**。
- **② 精准复位（首选）**：`flow stage reset <id> --to <phase>` 直接改 `flow.json` 目标阶段的 `phase`（并按投影同步 `status`），不影响其它阶段；先 `--dry-run` 预览。
- **③ 按阶段回退**：`checkpoint restore <file> --stage <id> --dry-run` 预览差异（零写盘）→ 确认后去掉 `--dry-run` 执行（同样需 `--force` 确认；**`--force` 对 dry-run 非必需**）。
- **④ 全量 restore（最后手段）**：`checkpoint restore <file> --force`（无 `--stage`）整份覆盖 `flow.json`；多阶段并行时会**跨阶段连带回退**，故列为最后手段。
- **⑤ 对账**：`flow health --fix`（`--fix --dry-run` 预览）以 phase 投影为权威，**仅回写 `status.md` 的「状态」行**（不改 `flow.json`），为唯一批量对账入口。

## 相关 skill

- **`openfeel-cli-usage`**（CLI 用法参考，**查询型**）：命令清单与关键参数、15 个 phase 枚举与转移表、stageId 三格式与目录映射约定、典型场景、权限要点；含**快照声明**「本文档为 v1.2.2 快照，命令/参数细节以 `node bin/openfeel.js <cmd> --help` 实时输出为准」（防文档-实现发散；**v1.2.2-stage-98 更新说明**：权威源 `src/core/templates-data/skills/openfeel-cli-usage/SKILL.md` 已同批更新为 **v1.2.2 快照**，含 `flow next` / 全局 `--project` / 13 读命令 `--json`（33 成功出口 / 34 注册选项）/ 错误封装 / `--version --json` / `reviewTier` 消歧；skill 权威源已于 stage-68 迁**中立共享源**）。与 `openfeel-wizard`（**执行型**交互向导）职责分离、正文互引。
  - 权威源：`src/core/templates-data/skills/openfeel-cli-usage/SKILL.md`（**中立共享源**，stage-68 由 `templates-data/opencode/skills/` 迁入；**扁平单文件、中文单语**）；经 `npm run build` 双注入（`update.ts` 的 `SKILL_DEFINITIONS` / `template-loader.ts` 的 `OPENCODE_SKILL_DEFINITIONS`）；由 `openfeel setup` 部署至全局 `~/.config/opencode/skills/`（**生成物禁手改**）。**stage-55 起仓库自身不再自举项目级 `.opencode/skills/**`**（自举步骤已随 `build.js` 步骤 8 移除）。skill 总数 **18**。
  - 维护触发：新增/修改 CLI 命令、phase 枚举或 stageId 约定时，须同批更新该 skill 权威源 + 跑 build（详见 `manual/index.md` 维护规则「skill 体系」行）。

- **`openfeel-req`**（需求流转用法参考，**查询型**；**v1.2.0-stage-84 新增**）：需求生命周期 7 状态、`openfeel req` **11 子命令**与参数（v1.2.1-stage-87 增 `split`）、认领协议（`owner` + `claimed_at`，无 TTL）、`REQ-NNN.md` 正文与机读权威源（`flow.json`）、需求与计划的关系（需求 ≠ 计划、实现仍走流水线）、**需求与版本解绑** + **并行接取**（v1.2.1-stage-87）、与 `workflow_mode` 正交；**快照声明**「以 `node bin/openfeel.js req --help` 为准」（v1.2.0 起提供）。权威源 `src/core/templates-data/skills/openfeel-req/SKILL.md`（中立共享源、扁平单文件中文单语）；经 `npm run build` 双注入（`update.ts` / `template-loader.ts`，键集 18）+ `openfeel setup` 部署至全局 `~/.config/opencode/skills/`（生成物禁手改）。
