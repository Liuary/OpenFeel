# CLI 命令体系（commands）

> 模块文档，由归档官在归档时维护。对应源码：`src/cli/index.ts` + `src/commands/*.ts`。

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
```

新增命令组：在 `src/commands/` 创建 `registerXxxCommand(program)` 模块，并在 `src/cli/index.ts` 末尾追加 import + register 调用。

## 全局选项

除 Commander 内置 `-v, --version` / `-h, --help` 外，根程序注册以下**全局选项**（v1.1.2-stage-58 新增 `--encoding`/`--log-file`/`--no-log`/`--debug`）：

| 选项 | 说明 |
|------|------|
| `--no-color` | 禁用彩色输出（亦可通过 `NO_COLOR=1`；当前无着色实现，与编码解耦） |
| `--encoding <encoding>` | 输出编码（`utf8\|gbk\|auto`，默认 `auto`） |
| `--log-file <path>` | 运行日志文件路径（默认 `~/.openfeel/cli/logs/openfeel-YYYY-MM-DD.log`） |
| `--no-log` | 关闭运行日志（亦可通过 `OPENFEEL_LOG=0` / `OPENFEEL_NO_LOG=1`） |
| `--debug` | 记录 debug 级日志（默认仅 info/warn/error） |

**输出编码自适应（stage-58）**：`auto` 在 Windows 非 TTY（管道/重定向）下按 `chcp` 映射转码，TTY/POSIX 直通 UTF-8；`--json` **恒 UTF-8**（解析第 1 步最高优先，覆盖显式 `--encoding`/`OPENFEEL_ENCODING`/auto）；不可编码字符降 `?` 且**不告警**；**仅支持 UTF-8 字符串语义**（非默认 encoding 的直接 write 不受支持）。详见 [输出编码自适应](output-encoding.md)。

**运行日志（stage-58）**：默认**开启**，恒 UTF-8，按日一文件（不自动清理）；`info`/`warn`/`error` 默认记录、`debug` 默认关；best-effort（写失败不阻塞 CLI）；与 `.openfeel/log/**` / `flow.json.log[]` / `update_infos.md` 四类日志**语义分离**；`error` 仅记「命令处理中抛出的异常」，**commander 解析期错误不入日志**（REV-002）。详见 [CLI 运行日志](../core/runtime-log.md)。

## i18n 集成

- 翻译数据：`src/core/i18n-data/{zh-CN,en}.ts`，按域组织（common/flow/init/...）
- 核心函数：`t(key, lang, vars)` 按 key 取翻译；`getCliLang(projectPath)` 确定当前语言
- `applyHelpI18n(program)`：递归遍历 Commander 命令树，将 description / option 硬编码文本替换为当前语言翻译（`help.{命令}.{选项}` key 规则）。**v1.1.2-stage-50（T38）起**：`walkCmd` 增 **`arguments` 遍历**（键 `help.<path>.arg<name>`，以 `hasKey` 守卫避免缺失告警）——en 下位置参数描述同走 i18n；**选项遍历亦以 `hasKey` 守卫（v1.1.2-stage-58：`--encoding` 等根选项无 `help.openfeel.<opt>` 键，避免每命令缺失告警）**；**v1.1.2-stage-51 起全量补齐**（`cli/BUG-004` **closed**）：存量 20 处 + 新增子命令 `knowledge dedup` 1 处 + 已补 `stage.create` 1 处，均有 `help.<path>.arg<name>` 双语键；op-009 增**运行时全量枚举门禁**（`test/cli/help-arguments.test.ts`：动态遍历命令树，en 下 `Arguments:` 段 CJK 零命中，**33 个含位置参数的命令**，新增命令自动纳入）。并发冲突文案亦收敛至 `handleCliError` 单点。

## 错误处理与退出码

`src/cli/index.ts` 提供统一 CLI 入口与错误处理（v1.1.0-stage-35 新增）：

- `runCli()`：包裹 `program.parse()`，捕获冒泡异常交给 `handleCliError()`；`bin/openfeel.js` 有参数模式改调 `runCli()`（REPL 分支不变）。
- `handleCliError(err)`：识别 `isFlowConcurrentError(err)`（flow.json 乐观并发冲突）→ 输出中文可重试提示后 `process.exit(EXIT_CONCURRENT)`；非并发错误原样 rethrow。
- `EXIT_CONCURRENT = 2`：并发冲突退出码，与通用错误 1 区分，供自动化识别「可重试」冲突。

| 场景 | 退出码 |
|------|:--:|
| 并发冲突（可重试） | `2` |
| 通用错误 | `1` |
| 成功 | `0` |

**质量门禁退出码（v1.1.2-stage-50，R1/T17）**：`lint i18n` / `lint kb` **发现问题即 `exit 1`**（对齐 `flow health`），使 CI 可直接以其为门禁；用 `process.exitCode = 1` 而非 `process.exit(1)`（防 stdout 异步 flush 被截断）。**不新增** `--warn-only`/`--no-fail` 逃生阀——忽略结果应由调用方显式表达（`lint kb || true`）。

已包裹 `mgr.save()` 的 catch 块（`flow stage add`、`stage create`、`flow wizard`）在 catch 首部增加 `isFlowConcurrentError` 分支，保证同样提示与退出码 2。

**结构化错误分流（stage-47）**：`plan stage add` / `flow stage add` / `stage create` 三入口在通用 `common.errorTmpl` 之前增加 `err instanceof StageDirConflictError` 分支 → 用 `common.stageDirConflictTmpl`（zh/en 对称）渲染冲突信息（含 `stage` / `other`），杜绝「核心层抛中文错误绕过 `t()`」的死键问题（`cli/BUG-002`）。

## 关键命令示例

> ⚠️ 本仓执行一律用 `node bin/openfeel.js <cmd>`；全局 `openfeel` 可能命中旧版（如 1.1.1）。安装后的一般使用者用法 `openfeel <cmd>`（查询型）见 `manual/index` / skill 说明。

- `node bin/openfeel.js flow advance --stage <id> --to <phase> [--dry-run] [--force]` — 推进阶段（经 FlowManager 校验）；`--dry-run` 预览不修改，`--force` 跳过非法 phase 和阶段跳跃检查。**`--dry-run` 字节级不写盘（stage-49 B1）**：目标阶段 phase/status 不一致时，`autoRepairInconsistency` 走**预览模式**（`{dryRun}` 只算不赋值），仅非 dry-run 才 `save()`；dry-run 输出用**预览专用键** `flow.advance.autoRepairPreview`（「正式执行将自动修复」），`flow.json` 字节 / `meta.revision` / phase 均不变（回归断言）
- `node bin/openfeel.js flow phases [--json]` — 自描述全部合法 phase 与运行时流转映射（数据源 `.openfeel/pipeline.yaml`，缺省回退默认表）；运行时含内置 15 之外的 phase 时追加**边界说明**，`--json` 结构为 `{ schemaVersion, phases, transitions, advanceAccepted, transitionsDiff }`（`advanceAccepted` = 内置 15，即 `flow advance` 的推进白名单；`phases` 为存在视图；**`transitionsDiff`（stage-50 T19）** = 运行时与内置默认转移表的差异报告，`missing` 列出内置默认有而运行时缺失的 source——使 `pipeline.yaml` 漂移**可见而非静默**，未修改 `pipeline.yaml`）
- `node bin/openfeel.js flow stage add <stageId>` — 注册层：仅注册 flow.json，不建目录（通常应使用 `node bin/openfeel.js plan stage add`）
- `node bin/openfeel.js flow stage remove <stageId> [--force] [--dry-run] [--purge]` — 移除阶段（安全校验：ops 非空 / 当前活跃 / 被 deps 引用；默认仅注销 flow.json，`--purge` 删目录且**在 `save()` 成功后**执行，避免「目录已删、注册仍在」中间态）
- `node bin/openfeel.js flow wizard` — 交互式流水线向导，支持无阶段时自动引导创建首个阶段
- `node bin/openfeel.js flow health --quick` — 流水线健康检查；**非 `--quick` 时含第 7 项「悬空依赖」检测**（`checkDanglingDeps`：`stages[].deps` 指向未注册阶段时 `warn`；仅数据卫生提示，`ok` 判定只看 `fail`，不阻塞退出码，stage-49 B2）+ **第 8 项「孤儿操作方案」检测（v1.1.2-stage-51，N1-3）**：键孤儿/文件孤儿计数 `warn`（**非 `fail`，不改变退出码**；与 `flow repair` 共用 `findOrphanOps`）
- `node bin/openfeel.js stage set <id> --status <v>` — 更新阶段状态（**v1.1.2-stage-51 起幂等 + 字段扩展**：同值 no-op + 按需 `.bak` + `--exec-mode`/`--auto-advance`/`--review-agent`，详见下「纠正/清理侧命令面」）
- `node bin/openfeel.js plan stage add <name> [--deps <ids...>]` — 完整入口（推荐）：建目录 + overview/status + 注册 flow.json + 依赖落点；**`--deps` 校验依赖存在性（stage-49 B2）**：命令层用 `normalizeStageId` 归一化比对 `deps ⊆ 已注册 stages`，无效项列出已注册阶段并 **exit 1**；`flow.json` 未初始化（无阶段）时同样 exit 1（提示「已注册阶段：（无）」）；核心层 `addStage` 不做存在性校验（仅命令层强制）
- `node bin/openfeel.js stage create <stageId>` — 已弃用（注册层，与 `flow stage add` 等价；建议改用 `plan stage add` / `flow stage add`）
- `node bin/openfeel.js migrate [path] [--dry-run] [--remap-assignee] [--clean-global-core-md]` — 存量旧布局项目迁移（检测/备份/迁移/回滚），`--dry-run` 预览不写盘，`--remap-assignee` 改写 flow.json 旧 assignee（默认仅报告），`--clean-global-core-md` 删除已废弃的全局 core.md（默认仅提示不删）
- `node bin/openfeel.js migrate rollback [--dry-run]` — 回滚最近一次迁移（读 `.openfeel/backup/{latest}/manifest.json`），`--dry-run` 仅预览回滚计划
- `node bin/openfeel.js setup [--lang <zh-CN|en>]` — 纯全局部署（全局 AGENTS.md + agent + skill + 全局平台适配器配置（opencode.jsonc）），不建立项目 `.openfeel/`，幂等（详见 [setup 命令](cli/setup.md)）
- `node bin/openfeel.js init [path] [--workspace-only] [--non-interactive]` — 项目初始化；`--workspace-only` 仅创建 `.openfeel/` 工作区（不建全局规则/平台适配器配置（AGENTS.md/opencode.jsonc）），供 Feel 空白项目自动搭建；**已存在的 `.openfeel/config.yaml` 不覆盖**（保留用户配置，`InitResult.skipped` 经 `init.skipped` 输出用户可见提示，stage-47）
- `node bin/openfeel.js model set <agent> <model> [--scope default|global|project] [--build] [--force]` — 三层级 agent 模型读写，详见 [model 命令组](cli/model.md)
- `node bin/openfeel.js config effective [key]` — 输出四个受管配置键的有效值 + 生效来源（`status.md > config.yaml > profile.yaml > builtin`）；复用 `FlowManager.resolveEffectiveConfig()` 单一权威，与 `flow status --verbose` 级联表同源；未知 key → stderr + exit 1（不静默）
- `node bin/openfeel.js config get [key] [--global]` / `node bin/openfeel.js config set <key> <value> [--global]` — 原始值读写（不经级联解析）；**v1.1.2-stage-50（R3/T36）起支持全量 `defaults.*`**（键白名单由 Schema 驱动，与 `config effective` 覆盖范围一致）：值类型归一（boolean 键写布尔）+ 枚举校验（**非法报错且不写盘**）+ get/set/effective 三口径一致；`config get-lang` / `set-lang <lang>` / `list-projects` 为全局语言子命令

### 纠正/清理侧命令面（v1.1.2-stage-51，反馈 08）

> 补齐「创建侧齐备、纠正侧空白」缺口，使「禁止手改 `flow.json`」在**故障恢复场景**下可解。核心命题与三类能力（删除/修正/对账）见 `kb/architecture.md #纠正侧能力对称原则`。

- `node bin/openfeel.js plan scheme remove <stage> <opId> [--force] [--dry-run]` — 注销 op 注册键（**不删除 op 模板文件**）：默认拒绝删除 `state=done` 或**存在 checkpoint 进展**的 op（`--force` 覆盖）；孤儿（无文件）可直删并提示；`--dry-run` 预览不写盘；审计 `scheme_remove`。
- `node bin/openfeel.js flow repair [--dry-run] [--backup] [--prune-orphans]` — **op↔文件对账**：默认**只报告**键孤儿（有注册无文件）/ 文件孤儿（有文件无注册），**零写盘**；`--prune-orphans` 仅清理**键孤儿**（删 flow.json 键），**文件孤儿永不自动删除**；对账由 `findOrphanOps` 单一实现，与 `flow health` 共用。
- `node bin/openfeel.js flow stage set <stageId> --deps <ids...>` — 覆盖阶段依赖（支持空格/逗号）；**悬空依赖 exit 1 且不写盘**（命令层强制校验，对齐 `plan stage add --deps`）；未带 `--deps` 视为清空。
- `node bin/openfeel.js flow review update <revId> [--priority high|medium|low] [--title <text>] [--blocking true|false]` — 更新审查条目（至少一字段；非法枚举/未命中 exit 1）；`flow review remove <revId>` 删除并打印标题（审计 `review_update` / `review_remove`）。`view` 侧**不新增** update/remove（禁止第二套实现；`view` 组的 `add` 子命令**已移除**，改用 `flow review add`）。
- `node bin/openfeel.js flow advance ... [--quiet]` — **git 脏区警告降噪**：默认仅 `--to done` 时提示（非 done 不再调用 `git status`）；`--quiet` 完全静默（成功行与警告均不打印；错误仍 stderr + exit 1）。
- `node bin/openfeel.js stage set <id> [--status <v>] [--exec-mode manual|auto] [--auto-advance enabled|disabled] [--review-agent <agent>]` — **先探测后写**（三态 `not-found`/`unchanged`/`will-change`）：同值 → **no-op 成功 exit 0 且不生成 `.bak`**；将变更 → 备份后写入；字段缺失 → exit 1。字段白名单：`状态`/`执行模式`/`自动推进`/`当前责任 Agent`/`上一责任 Agent`（非法枚举 exit 1 且不写盘）。
- `node bin/openfeel.js stage task <id> --add "<描述>"` — 追加任务行（编号 = 既有最大 +1，范式 `- [ ] 任务N：...`）；`--add` 与 `--done`/`--undo` 互斥；`<taskNo>` 由必填改为可选。
- `node bin/openfeel.js plan stage add <name> [--deps <ids...>] [--tasks "<t1>" "<t2>"]` — 初始化任务行（与 `stage task --add` 共用生成函数，产物格式逐字节一致）；无 `--tasks` 时保持 `> 待补充`。
- `node bin/openfeel.js knowledge dedup [content] [--project <path>] [--category <architecture|patterns|troubleshooting|setup>] [--threshold <0~1>]` — **检索相似知识条目（只读建议，不修改 kb）**；未传 `content` 时从 stdin 读取；`--project` 注入 `basePath`（默认 `process.cwd()`）；输出相似度 + 「建议合并/更新」标注 + 只读尾注；正常 exit 0、参数错误 exit 1；随包分发（`npm pack` 含 `dist/utils/kb-dedup.js`）。模板引用已同步为「用 `openfeel knowledge dedup` 获取去重建议」（A6）。
- **op 文件命名（v1.1.2-stage-51，N8/A5）**：新建 op 固定 `op-NNN.md`（**标题写入内容首行** `# {opId}：{title}`，不再进文件名）——标题含 `/`/空格/中文均可创建（修复含 `/` 时 ENOENT 创建失败）；**历史 `op-NNN_标题.md` 不迁移**，读取端 `extractTitle` **兼容回退**（文件名含 `_` 走原解析，否则读内容首行）；**不提供** `rename`/`migrate` 命令。

### 可编排性与可观测性命令面（v1.1.2-stage-52，反馈 09）

> 面向「长时间、多阶段自动推进」：**批量编排**（一次到位/批量校正）、**机器可读**（`--json`/UTF-8）、**自愈恢复**（`--fix`/空模板检测）。核心设计见 `kb/patterns.md`（`--json` 约定 / 只报告型 vs 修复型边界 / draft 两阶段 / 多步 REV 复检）。

- **`--json` 结构化输出（B1）**：`flow status|current|health|metrics|overview --json` 输出**顶层对象 + `schemaVersion:1`**，纯 JSON 单文档（无 ANSI/标题，与人类可读互斥）；`flow phases --json` 保持既有键（`phases`/`transitions`/`advanceAccepted`/`transitionsDiff`）并**追加** `schemaVersion`。
- **`flow health --fix`（B2）**：以 `flow.json` 为权威，**仅回写 `status.md` 的「状态」字段**（执行模式/自动推进/当前任务/状态记录等独立字段绝不触碰）；`--fix --dry-run` 预览零写盘；幂等（已一致 applied=0）。**L7 文件孤儿仅报告**（本仓 62 条，无清理入口，A6）。
- **`flow ops list [--stage] [--json]`（B3）**：展示每 op 的 `state` + 模板填充度（`(filled)`/`(empty)`）+ 空模板 warning；**`draft` 单独分组**。**（stage-54）** 填充度判定为**整行锚定**（正文行内引用占位标记不误报）；**已知边界（A9）**：`readOpTemplate` 返回 `null`（op 文件缺失 / 命名不含前缀 / 目录不可读）时按 `filled` 处理，与 `health` 的「`null` 跳过不报」为**同向漏检**（非分叉，两者同源 `opsMap`）——**不扩展** `detectFillState` 返回域与 `--json` 的 `fill` 取值集合。
- **`plan scheme create --draft` + `plan scheme publish <stage> <opId>`（B4）**：draft→pending 两阶段；`publish` 校验模板非空（否则 exit 1）；**窄兼容**：health 不报 draft 空模板 / advance·统计·归档不计入 draft / **`flow attempt --op <draft>` 拒绝**（exit 1 + 提示先 `publish`，命令层 + core 双层守卫）。
- **`flow advance --stage <id> --to <phase>`（B5）**：沿 transitions **自动逐步**（BFS 唯一路径，深度 ≤8）；`--dry-run` 打印**完整路径**（`A → B → C`）；非法/多义目标 exit 1 + 列可达目标；**每步 `assertNoBlockingOpenRev` 复检**（blocking open REV 拦截，exit 1 + `revision` 不变）；未提供 `--to` 的单步行为不变。
- **`plan scheme rename <stage> <opId> --title "<title>"`（B6）**：同步 `flow.json` 标题与 op 文件内容首行；不存在 op → exit 1。
- **`NO_COLOR` / `--no-color`（B7）**：尊重环境变量与全局选项，输出无 ANSI 转义。**B9 实测**：真实 PS5.1 / `chcp 936` 下输出为合法 UTF-8（**不复现乱码**）→ 不引入编码 hack；但 PowerShell **直接管道捕获** `--json` 可能因消费端编码（gb2312）失真——建议重定向到文件 / 用 `JSON.parse` / pwsh 7 设 UTF-8。
- **`view add` 已移除（A4，破坏性）**：改用 `flow review add`（`addReviewEntry` 单点等价）；**保留** `view list`/`view accept`；`CHANGELOG` `Removed` 含迁移指引。
- **`flow current` 无 op（B8）**：回退显示 `current.stage` + 「(无 op)」。

> ✅ **已关闭缺陷（v1.1.2-stage-54）**：`cli/BUG-005`（medium）空模板检测**已由纯子串改为整行锚定**（`EMPTY_TEMPLATE_LINE_RE`，`isTemplateEmpty`/`detectFillState`/`publishScheme` 单一来源）——op 正文行内引用占位标记不再误判（`publish` 不再误拒 / `ops list` 不误报 `(empty)` / `health` 不误报），仓库空模板告警归零。`cli/BUG-006`（low）en 模式 blocking REV 拒绝文案**已迁 i18n**（`flow.advance.blockingRevRefused`/`blockingRevHint`，en CJK=0、zh 逐字不变）。`cli/BUG-003`（low）`flow phases --help` 已补 `transitionsDiff`（JSON 契约未变）。

## 相关 skill

- **`openfeel-cli-usage`**（CLI 用法参考，**查询型**）：命令清单与关键参数、15 个 phase 枚举与转移表、stageId 三格式与目录映射约定、典型场景、权限要点；含**快照声明**「本文档为 v1.1.2 快照，命令/参数细节以 `node bin/openfeel.js <cmd> --help` 实时输出为准」（防文档-实现发散）。与 `openfeel-wizard`（**执行型**交互向导）职责分离、正文互引。
  - 权威源：`src/core/templates-data/opencode/skills/openfeel-cli-usage/SKILL.md`（**扁平单文件、中文单语**）；经 `npm run build` 双注入（`update.ts` 的 `SKILL_DEFINITIONS` / `template-loader.ts` 的 `OPENCODE_SKILL_DEFINITIONS`）；由 `openfeel setup` 部署至全局 `~/.config/opencode/skills/`（**生成物禁手改**）。**stage-55 起仓库自身不再自举项目级 `.opencode/skills/**`**（自举步骤已随 `build.js` 步骤 8 移除）。skill 总数 **17**。
  - 维护触发：新增/修改 CLI 命令、phase 枚举或 stageId 约定时，须同批更新该 skill 权威源 + 跑 build（详见 `manual/index.md` 维护规则「skill 体系」行）。
