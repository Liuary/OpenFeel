# OpenFeel v1.2.2 — CLI 机器可读契约与调度决策下沉（DSH 适配器 11 项需求）

> **版本**：v1.2.2（Z 级递增，功能主题） | **创建日期**：2026-10-17 | **Planner**：openfeel-planner
> **规模判定**：**大规模**（4 阶段，跨 `src/cli/**` + `src/commands/**`（11 个命令文件）+ `src/core/{flow-manager,errors,pipeline-schema,req/aggregate}.ts` + i18n 双表 + `test/**` + 文档/版本载体 + 适配器端到端验收；含**输出契约冻结**与**错误语义层**两类架构级变更）→ 独立 openfeel-planner → openfeel-reviewer 完整流程。
> **定位**：把 CLI 变成**机器可读契约的唯一权威**——读命令全面 `--json`、失败结构化（稳定 `code` + `kind`）、调度决策（谁负责 / 下一步 / 建议命令 / 阻塞项）由 `flow next` 单点输出，消除 DSH 适配器对中文文本与 `PHASE_AGENT_MAP` 镜像的依赖。
> **需求权威**：`docs/v1.2.2-requirements.md`（原文）+ `REQ-001`（标题：CLI 机器可读契约与调度决策下沉（DSH 适配器需求））。**所有阶段关联 REQ-001**。
> **阶段计划**：`.openfeel/plan/v1/stage-95/plan.md` … `stage-98/plan.md`（**四阶段均已注册并归档，2026-10-17**）。
> **路线图**：`.openfeel/roadmap/v1.2.2.md`。
> **依赖声明**：`.openfeel/plan/v1/v1.2.2/deps.yaml`（阶段级 hard 依赖 + op 级由 openfeel-schemer 细化）。
> **系列**：`v1`；`stageDir` 映射 `stage-95` ~ `stage-98`；阶段 ID 自 `v1.2.2-stage-95` 起（承接 v1.2.1-stage-94）。
> **当前基线**（实测，HEAD `38f1e05` + 当前工作区；本会话逐项核验）：CLI `1.2.1`；flow 注册阶段 **17**（v1.2.0-stage-78~85 + v1.2.1-stage-86~94 全 done；`pipeline.current.stage = v1.2.1-stage-93`）；`flow.json` `revision 1188` / `meta.archived_versions` **9**（v1.0.0~v1.1.7）/ `requirements` **1**（REQ-001 `draft`）/ `reviews` **0**；测试 **71 文件 / 1719 用例**（README 登记值；文件数本会话实测 71——任务简述中的「67 文件」为陈旧值，须以实测为准）；`lint i18n` **945**（本会话实测；v1.2.1 收口登记 944 为旧值）；`lint kb` **0 过期 / 624 引用**（本会话实测）；agent **10** / skills **22**；`npm run build` 双生成物；本仓 `.openfeel/config.yaml defaults.workflow_mode: full`。

---

## 一、需求映射（11 项 → 阶段 → 验收锚点）

| 需求 | 优先级 | 目标能力 | 阶段 | 验收锚点 |
|------|:--:|------|:--:|------|
| **P0-1** `flow next [--json]` | P0 | `stage` / `phase` / `phaseLabel` / `responsibleAgent` / `workflowMode` / `reviewTier` / `effectiveReviewTier` / `legalNextPhases` / `suggestedCommand` / `guards` / `blockingReviews` | 96 | 字段齐全；`responsibleAgent` 与 `mapPhaseToAgent` 同源；`legalNextPhases` 每个元素均被 `flow advance` 接受（非法相位不在其中）；只读零写盘 |
| **P0-2** 读命令补齐 `--json` | P0 | 10 组 / **13 个命令面**：`stage status`、`flow recover`、`flow checkpoint list`、`knowledge search/list/index/dedup`、`config get/effective`、`view list`、`plan scheme list`、`flow log`、`project overview` | 97 | 每个命令 `--json` 输出 `{schemaVersion:1,...}` 单文档；stdout 无人类文本；人类输出不变 |
| **P0-3** 机器可读错误封装 | P0 | `{schemaVersion:1,error:{code,kind,message,detail}}`；`kind=refusal 或 internal`；**退出码 0 成功 / 1 预期拒绝 / 2 并发冲突（语义零改动）/ 3 内部错误（新增）**；legacy 载荷追加 `errorKind`；语言无关 `code`；12 行 code→kind→exitCode 映射表 | 95（地基）+ 97（读命令接入） | `flow advance` 非法转移等文本型失败输出 envelope；zh/en `code` 一致；非 JSON 模式人类文案不变；并发冲突 `kind=refusal` + exit 2；内部错误 exit 3；legacy 失败载荷全部含 `errorKind` |
| **P1-1** `flow status --json` 阶段调度属性 | P1 | `stages[]` 追加 `workflowMode` / `requirementId` / `reviewTier` / `effectiveReviewTier` / `opsSummary:{total,byState}` | 96 | 既有 5 字段（`id/phase/status/deps/ops`）键序不变；新增字段值经单点解析；无值 `null` / 空对象 |
| **P1-2** 全局 `--project <path>` | P1 | 根命令全局选项；语义 = 以该路径为 cwd；`knowledge dedup --project` 语法兼容 | 95 | 任意命令前置/后置 `--project` 均生效；非法路径明确错误；不传时回退 `process.cwd()` |
| **P1-3** `req list --json` 关联阶段 | P1 | `requirements[]` 追加 `linkedStages:[{id,phase}]`、`progress:{done,total}` | 97 | 与 `flow.json stages[*].requirement_id` 一致；零关联 → `[]` + `{done:0,total:0}`；消除 N+1 |
| **P1-4** `flow archive` 判据明细 | P1 | `--dry-run --json` 输出 `eligible` / `unfinishedStages` / `blockingReviews`；判据与门禁同源 | 97 | `eligible:true` 时两数组为空；失败时明细非空且 exit 1；`--dry-run` 零写盘（字节级） |
| **P2-1** JSON 稳定字段顺序与类型 | P2 | `schemaVersion` 恒为首键；数组元素字段冻结；可选字段 `null`；新增 `docs/json-contract.md` + 契约测试 | 95 | 18 个既有出口逐个断言首键/键集/类型；`instructions --json` 补 `schemaVersion`（见 §二 A2） |
| **P2-2** `reviewTier` 语义消歧 | P2 | `flow phases --json` 保留 `reviewTier`（展示值）并追加 `displayReviewTier` / `effectiveReviewTier`；文档固定说明 | 96 | 既有 7 键逐字保留、顺序不变；`effectiveReviewTier` 恒为 `flow advance` 缺省 `full`；文档可程序化区分 |
| **P2-3** `--version --json` | P2 | `{schemaVersion:1,version,node}` 单文档；纯文本模式不变 | 95 | `version` 与 `package.json` 一致；`node` 为运行时版本；`-v/--version` 均支持 |
| **P2-4** `archive <stage> --json` | P2 | 单文档含 `archivePath` / `knowledgeExtracts` / 计数；人类输出不变 | 97 | 结构化字段与人类输出同源；失败走错误封装；与 `flow archive` 职责区分不变 |

---

## 二、源码核验结论（以源码为准；行号 / 键值以 HEAD `38f1e05` 为基线）

### 表 A：既有 `--json` 出口与契约现状

| # | 出口 | 注册位置 | 现状 | 结论 |
|:-:|------|----------|------|------|
| A1 | `flow status` | `src/commands/flow.ts:49` / `buildStatusJson:2457` | 顶层 `schemaVersion,pipeline,stages,counts`；`stages[]` 元素恰 `{id,phase,status,deps,ops}`（实测） | P1-1 追加字段，既有 5 字段键序不变 |
| A2 | `instructions` | `src/commands/instructions.ts:19` | `generateInstructionsJson` 返回 `artifact/task/project_context/rules/dependencies/output/instruction/template/unlocks`，**无 `schemaVersion`**（实测 `instruction-loader.ts:365-398`） | **与需求单「18 个出口均 schemaVersion:1」不符**；P2-1 须补 `schemaVersion` 为首键（增量、不删既有字段）。**C1 必须修改项**：构造序 `{ schemaVersion: 1, ...doc }`；同步清单见 stage-95「扩展优先原则」 |
| A3 | `setup --check --json` | `src/commands/setup.ts:17-35` | `schemaVersion,status,cliVersion,deployedVersion` | 需求单未列但属实际第 18 个出口；纳入冻结集 |
| A4 | `flow phases` | `flow.ts:392-454` | 7 键：`schemaVersion,phases,transitions,advanceAccepted,transitionsDiff,workflowMode,reviewTier`；`reviewTier = MODE_DERIVED_TIER[mode]`（展示值，**不参与推进**） | P2-2 只增不改，追加 `displayReviewTier` / `effectiveReviewTier` |
| A5 | `flow mode` | `flow.ts:493-535` | `schemaVersion,stage,mode,source,modes` | 冻结 |
| A6 | `flow archive <version>` | `flow.ts:1705-1840` | 成功 `schemaVersion,version,stages,reviews,log,dryRun`；判据拒绝 `schemaVersion,error:'gate-rejected',version,notDone,blockingOpen`；其他失败 `error:'...'` 字符串 | P1-4 追加 `eligible` / `unfinishedStages` / `blockingReviews`；**保留 `error` 字符串与 `notDone`/`blockingOpen`，stage-95 末尾追加 `errorKind`**（`archive-write-failed` → internal） |
| A7 | `req list/show/split/board/next` | `req.ts:144/193/557/633/669` | 均 `schemaVersion:1`；失败经 `failJson` 输出 `{schemaVersion,error:'...'}` 字符串 | P1-3 追加字段；失败载荷 `error` 字符串/键序保持，**stage-95 追加顶层 `errorKind`** |
| A8 | `flow health` | `flow.ts:1939-1948` | `schemaVersion,ok,items`；`--fix` 时追加 `reconciled`（可选键） | P2-1 可选键 `reconciled: null` 占位；豁免须按 Q3 判据并在冻结表登记为条件出现键 |
| A9 | 其余（`overview/current/metrics/ops list/archive list/show`） | `flow.ts:179/326/375/1137/1844/1881` | 均以 `schemaVersion` 为首键（实测） | 冻结；仅按 P2-1 补 `null` 占位 |

> **出口计数裁定**：实际注册 **18** 个 `--json` 选项（flow 11 + req 5 + instructions 1 + setup 1）；需求单正文列出 17 个（未含 `setup --check`），并断言全部 `schemaVersion:1`——**`instructions` 是唯一例外**。本计划以「18 个注册出口」为冻结集，`instructions` 的 `schemaVersion` 补齐为 P2-1 的显式变更。

### 表 B：读命令 `--json` 缺口（P0-2 / P1-3 / P1-4 / P2-4）

| # | 命令 | 实现位置 | 当前输出 / 可复用数据源 | 结论 |
|:-:|------|----------|--------------------------|------|
| B1 | `stage status [stageId]` | `stage.ts:334-375`；`showStageStatus:179`；`parseStatusFields:91` | 人类文本；字段为中文键（执行模式/自动推进/状态/当前责任 Agent/工作模式等），任务列表 `parseTasks:108` | 新增 `--json`；输出规范化英文字段 + `tasks` + `blockedBy` |
| B2 | `flow recover` | `flow.ts:2051-2101`；`FlowManager.recoverContext:1309` | 人类文本；数据源 `RecoveryContext {phase,currentOp,stageStatus,blockedBy,pendingTasks}` + `getAllStageStats()` | 新增 `--json` |
| B3 | `flow checkpoint list [stage]` | `flow.ts:1621-1645`；`listCheckpoints:670` | 人类文本；数据源 `string[]` 文件名 | 新增 `--json` |
| B4 | `knowledge search <q>` | `knowledge.ts:105-137`；`searchKnowledge` | 人类文本；`KnowledgeEntry {title,category,date,content,enabled}` | 新增 `--json` |
| B5 | `knowledge list` | `knowledge.ts:28-56`；`listKnowledge:180` | 人类表格；同上元数据 | 新增 `--json` |
| B6 | `knowledge index` | `knowledge.ts:142-170`；`getKnowledgeIndex` | 人类文本；`{categories,recentUpdates}` | 新增 `--json` |
| B7 | `knowledge dedup` | `knowledge.ts:175-242`；`findSimilarEntries` | 人类文本；本地 `--project` 选项在位 | 新增 `--json`；**保留本地 `--project` 声明**，全局同名选项并行提供（扩展优先，不收敛）。 |
| B8 | `config get` / `effective` | `config.ts:123-178` / `383-408`；`resolveEffectiveConfig:2411` | 人类文本；`effective` 已有 `{value,source}` | 新增 `--json` |
| B9 | `view list` | `view.ts:18-40`；`listReviews:187` | 人类文本；`ReviewItem {id,op,status,priority,title,filed_by,filed_at,blocking?,canAutoFix?}` | 新增 `--json`；`blocking` 解析为布尔 |
| B10 | `plan scheme list [stage]` | `plan.ts:310-343`；`listSchemes:890`；`detectFillState:4517` | 人类文本；`Scheme {opId,stage,title,content,filePath}` + 现有 draft 标记逻辑 | 新增 `--json`；复用 `detectFillState` 给 `fill` |
| B11 | `flow log --last <n>` | `flow.ts:1216-1245` | 人类文本；`data.log` | 新增 `--json` |
| B12 | `project overview` | `project.ts:17-172` | 人类文本；实时扫描（package.json / 目录统计 / kb 条目数） | 新增 `--json`；先聚合数据对象再渲染（人类输出逐字不变） |
| B13 | `openfeel archive <stage>` | `archive.ts:10-46`；`archiveStage` | 人类文本；`ArchiveResult {opsCount,reviewsCount,knowledgeExtracts}` + `archivePath` | 新增 `--json`（P2-4） |
| B14 | `flow archive --dry-run --json` | `flow.ts:1711-1794` | 判据拒绝先于 dry-run 分支；成功 dry-run 仅计数 | P1-4 增量字段 + 零写盘断言 |

### 表 C：错误处理与 CLI 骨架

| # | 事实（实测） | 位置 | 结论 |
|:-:|------|------|------|
| C1 | **无 `src/core/errors` 目录 / 无统一错误类型**；命令层 `process.exit(1)` **143 处**、`process.exitCode = 1` **37 处**、`console.error` **220 处**（`src/commands` 实测） | `src/commands/**` | 全量机械迁移不可取；新增统一 helper，分层迁移：JSON 模式相关失败必迁，人类专用路径保持 |
| C2 | 共享错误层仅覆盖并发冲突与 `addStage` 失败；`EXIT_CONCURRENT = 2` | `src/commands/shared/errors.ts:12-50` | 扩展为 `refusal` / `internal` / 并发三分；并发冲突 JSON 模式输出 envelope 并保留 exit 2 |
| C3 | `handleCliError` 记录运行日志后**重新抛出**（未捕获 → Node exit 1）；`runCli` 无统一 catch | `src/cli/index.ts:183-207` | 在 `runCli` 增加统一 catch：JSON 模式输出 envelope；非 JSON 模式记录日志/保留 stderr 形态后 **exit 3**（内部错误；0/1/2 语义零改动） |
| C4 | `--json` 失败载荷已有两种范式：`failJson`（req / flow archive）输出 `{schemaVersion,error:'...'}`；其余失败走 stderr 文本 | `req.ts:33-36`；`flow.ts:1715-1719` | 新 envelope 仅覆盖**文本型失败**；既有结构化失败载荷保留 `error` 类型/键序并**末尾追加 `errorKind`**（类型判别：`typeof doc.error`） |
| C5 | 全局选项可置于子命令之后（实测 `flow status --no-color` / `--debug` exit 0） | `src/cli/index.ts:21-32` | 全局 `--project` 可按同范式注册；预扫描 argv 实现 chdir |
| C6 | `process.cwd()` 在 `src/commands` **121 处** | 实测 | 不改调用点；`--project` 经进程级 chdir 一次性生效 |

### 表 D：调度决策数据源

| # | 事实（实测） | 位置 | 结论 |
|:-:|------|------|------|
| D1 | `mapPhaseToAgent` **private**，prefix → agent；`idle` 未覆盖（phase 类型仅 15 项）；`done → 'none'` | `flow-manager.ts:2550-2570` | `flow next` 须经公开单点方法复用；禁止命令层复制 switch |
| D2 | `getPhaseLabels(lang)` 返回 15 项双语标签；无 `idle` | `flow-manager.ts:2236-2290` | `phaseLabel` = 标签映射，缺省回落 phase 原文 |
| D3 | `getAvailablePhases(stageName?, tier='full')` 返回当前相位直接可达目标；`getValidTargets` 单一取表 | `flow-manager.ts:2030-2041 / 1996` | `legalNextPhases` 复用；与 `flow advance` 缺省同源 |
| D4 | `resolveStageWorkflowMode(stageId?)` 单点解析链：status.md > 需求级 > config > profile > builtin | `flow-manager.ts:2443-2469` | `workflowMode` / `reviewTier` 唯一来源 |
| D5 | `MODE_DERIVED_TIER = {full:'full', fast:'lean', general:'full'}`；`flow advance` 缺省 `effTier = explicitTier ?? 'full'` | `flow-manager.ts:497-501`；`flow.ts:811` | P2-2 消歧的语义基础：展示值 ≠ 生效值 |
| D6 | 阻塞 REV 判定为**阶段域**：`r.op === stage 或 r.op.startsWith(stage+'.')` ∧ `r.blocking !== false` ∧ `r.status === 'open'`；`assertNoBlockingOpenRev` 与 `advanceStagePhase(done 门)` 各有一份同口径过滤 | `flow.ts:2397-2417`；`flow-manager.ts:1512-1527` | `flow next.blockingReviews` 须阶段域；抽单点谓词，避免第三份 |
| D7 | `flow status --json.stages[]` 现有 `ops` 为 `opId→state`；`opsSummary` 可由同源派生 | `flow.ts:2442-2484` | 追加 `{total,byState}`，不改 `ops` |
| D8 | `flow next` **不存在**（`flow.ts` 无 `.command('next')`；`flow next` 实测 unknown command exit 1） | 实测 | P0-1 为新增命令 |
| D9 | 需求关联阶段可从 `computeRequirementAggregate` 的 `stageIds/stageCount/doneCount` 派生；过滤条件 = `stage.requirement_id === req.id` | `core/req/aggregate.ts:41-57` | P1-3 复用；新增 `listLinkedStages` 单点避免第二份过滤 |

### 表 E：门禁、版本与文档基线

| 项 | 实测 / 登记值 | 位置 | 结论 |
|----|------|------|------|
| 测试 | **71 文件 / 1719 用例**（README 登记；文件数实测 71） | `README.zh-CN.md:230` | 任务简述「67 文件」陈旧；本版新增契约测试后逐阶段登记新基线 |
| `lint i18n` | **945 键一致**（实测） | `lint i18n` 输出 | 新键须 zh/en 成对；各阶段登记新基线 |
| `lint kb` | **0 过期 / 624 引用**（实测） | `lint kb` 输出 | 归档轮按需补沉 |
| 构建 | `npm run build` 双生成物 `template-loader.ts` + `update.ts` | `build.js` | templates-data 改动同批重生成；`--porcelain src/` 干净 |
| 版本载体 | package.json `:3`；package-lock `:3/:9`；config.yaml `:7`；config.ts `:436/:493`；agents-md `:135`×2；constraint `:138`×2 | 实测 | 1.2.1 → 1.2.2 全链路 A/B/C/D/E |
| 存档 | `meta.archived_versions` 9（v1.0.0~v1.1.7）；v1.2.1 尚未归档 | flow.json 实测 | 本版收口不依赖 v1.2.1 归档；归档由 Feel 在条件满足后执行 |
| Agent / skills | 10 / 22 | 实测 | 本版不改 Agent 编制；模板改动仅版本行（如涉） |

---

## 三、关键裁定（实现取向与备选方案）

### D-0（全局）扩展优先原则

- **裁定**：OpenFeel 本体必须保持正常可用。① 如非必要，**只扩展、不修改**（新增字段 / 新增退出码 / 新增选项优先，既有语义零改动）；② 确实必须修改时，**原本的适配必须同步跟进**——受影响的既有适配器 / 模板 / 技能 / 文档（opencode / Claude Code 适配模板、`openfeel-cli-usage` skill、`docs` / `manual` / `README`）必须在**同一版本内**同步更新，不得让任何既有消费者静默失效。
- **本版落实**：退出码 0/1/2 语义零改动、新增 3；legacy `error` 字符串载荷零改动（仅末尾追加 `errorKind`）；`knowledge dedup --project` 优先保留本地声明（C2 扩展路径）；`instructions --json` 首键为唯一必须修改项（C1，附同步清单）。候选项与同步清单详见 `.openfeel/plan/v1/stage-95/plan.md`「扩展优先原则」。
- **备选**：先改后补文档 / 仅在收口阶段统一补（会让既有消费者在版本中途静默失效，否）。
- **理由**：契约型版本的最大风险是既有消费者静默失效；扩展优先把风险收敛为「新增面」，必须修改项以同版本同步清单兜底。

### D-1（P0-3）机器可读错误封装

- **裁定**：
  1. 新增 `src/core/errors.ts`：`CliErrorKind = 'refusal' | 'internal'`；稳定错误码常量表（12 码，内嵌 `kind` 与 `exitCode`，单一来源）；`CliError` 类型；`isCliError`。
  2. 新增 `src/commands/shared/json-output.ts`：`withSchemaVersion`（保证首键）、`emitJson`（单文档）、`setJsonMode` / `isJsonMode`（进程级单点，`runCli` 从 argv 预扫描 `--json`）。
  3. 新增 `src/commands/shared/errors.ts` 能力：`failRefusal({code,message,detail})`、`failInternal(err)`；`handleConcurrentConflict` 在 JSON 模式下输出 `FLOW_CONCURRENT_CONFLICT`（**`kind:'refusal'`**——并发冲突是预期、可重试，不是内部故障）并保留 exit 2。
  4. `src/cli/index.ts`：`runCli` 统一 catch——JSON 模式输出 `{schemaVersion:1,error:{code,kind,message,detail}}`（内部错误 exit 3）；非 JSON 模式记录日志、保持既有 stderr 形态后置 exit 3（不再依赖未捕获异常；0/1/2 语义零改动）。
  5. **兼容策略（R-cp-2 已裁定）**：既有 `{schemaVersion,error:'...'}` 结构化失败载荷**保留原字段与键序**（`flow archive*` / `req *`），并**追加顶层 `errorKind`**（`refusal|internal`，新键恒末尾；不改 `error` 字符串类型）；新 envelope 只用于当前走 stderr 文本的失败路径。`docs/json-contract.md` 明示两种 `error` 类型及判别方式（`typeof doc.error`），并登记 `errorKind` 增量与全部 legacy 失败路径。
  6. **退出码（R-cp-1 已裁定）**：**0** 成功；**1** 预期拒绝（`kind=refusal`，含门禁拒绝、相位非法、非法参数/用法错误）；**2** 并发写冲突（保留 `EXIT_CONCURRENT`，`kind=refusal`）；**3** 内部错误（`kind=internal`，未捕获异常/内部故障）。`kind` 是分类权威，退出码为冗余信号；**既有 0/1/2 语义零改动，3 为新增**。
  6.1 **需求文本勘误登记**：REQ-001 L80 括注「2 = 内部错误或用法错误」与既有实现不符（2 仅用于并发写冲突；用法错误为 1）。**用户最终裁定（2026-10-17）以 6 为准**：该括注登记为**需求文本勘误**，不修改 REQ-001 机读数据；在 stage-95 计划、`docs/json-contract.md` 与 `CHANGELOG`（stage-98）留痕，供 stage-98 DSH 验收对表。
  6.2 **code → kind → exitCode 映射表**：12 行单一权威（11 个阶段内 code + stage-97 预留 `ARCHIVE_FAILED`），入 `docs/json-contract.md` 并作为 `error-envelope.test.ts` 断言基线；显式 `FLOW_CONCURRENT_CONFLICT→refusal/2`、`ARCHIVE_WRITE_FAILED→internal/3`、`INVALID_ARGUMENT→refusal/1`。详见 stage-95 计划 T2。
  7. **迁移边界**：只迁移 `--json` 已启用或本版新增 `--json` 的命令面；其余人类专用路径（`init` / `migrate` / `update` / `model` 等）保持现状并在契约文档列明。
- **备选**：① 全量替换 180 处 `exit(1)`（风险高、收益低，否）；② 仅新命令使用 envelope、`flow advance` 不迁移（不满足 P0-3「门禁拒绝」主场景，否）；③ 把 legacy `error` 改为对象（破坏既有消费者，否）。
- **理由**：以最小注入面覆盖适配器最痛的「门禁拒绝无法分类」问题，同时不破坏已经结构化的旧出口。

### D-2（P1-2）全局 `--project <path>`

- **裁定**：根命令注册 `--project <path>`；新增 `src/cli/project-option.ts`，在 `runCli` 解析前预扫描 argv（支持 `--project <path>` 与 `--project=<path>`），校验目录存在后 `process.chdir(resolve(path))`。语义 = 以该路径为 `cwd`；不传时维持 `process.cwd()`。
- **边界裁定（REV-95-003）**：① chdir 后语言按**目标项目**解析（`getCliLang(process.cwd())`）；根选项描述在模块加载期固定，登记为已知边界；② `--log-file` 相对路径在 chdir 前按**原始 cwd** 解析（示例：在 `/work` 下传 `--log-file logs/run.log` → `/work/logs/run.log`）；③ `--project` 与 `--json` 预扫描**成对防误判**（跳过已知取值选项的下一 token + 文档登记「裸 `--xxx` 取值」边界）；④ CLI **单进程单命令** → chdir 每进程一次 → 无进程内多项目并发（`--project` 不是常驻进程多项目切换能力）。
- **`knowledge dedup` 兼容（C2，扩展路径优先）**：**保留本地 `--project` 声明**（help / 语法零变化），同时注册根全局选项；`dedup` 动作改从 `optsWithGlobals()` 读取（Commander 语义：全局优先）。两者同时给出且解析后路径不一致 → `INVALID_ARGUMENT`（refusal/1）。若方案期实测同名双注册引发 help 重复/解析歧义，则改为删除本地声明并同批同步 C2 清单（docs/commands、manual、skill、测试）。
- **备选**：① 引入项目上下文对象并替换 121 处 `process.cwd()`（改动面大、易漏，否）；② 仅把路径传给 `FlowManager`（129 处命令层路径解析仍用 cwd，否）；③ 环境变量注入（仍受调用点影响，否）。
- **理由**：`chdir` 是进程级、一次性、语义精确的「等效 cwd」，与需求验收措辞一致；风险集中在单一入口，便于测试与回滚。

### D-3（P2-2）`reviewTier` 展示值与生效值消歧

- **裁定**：**只增不改**。`flow phases --json` 既有 7 键逐字保留、顺序不变；末位追加 `displayReviewTier`（= 既有 `reviewTier` 同值）与 `effectiveReviewTier`（`flow advance` 未显式传 `--review-tier` 时的生效档位，恒 `'full'`）。`flow status --json.stages[]` 与 `flow next --json` 同样输出两个字段。`reviewTier` 保留为 `displayReviewTier` 的兼容别名。
- **备选**：① 把 `reviewTier` 重命名为 `displayReviewTier`（破坏既有消费者，否）；② 仅改文档不改字段（不满足「可程序化区分」，否）。
- **理由**：零破坏 + 显式语义；`effectiveReviewTier` 的定义必须写成「缺省推进档位」，避免被误解为「模式派生档位」。

### D-4（P2-1）契约冻结实现

- **裁定**：新增 `docs/json-contract.md`（契约正文）与 `test/cli/json-contract.test.ts`（可执行断言）。冻结规则：① `schemaVersion` 恒为首键且值为 `1`；② 每个出口的顶层键集与数组元素键集登记在案；③ 可选字段用 `null`、数组用 `[]`、映射用 `{}`；④ 既有字段只增不删、不重排；⑤ stdout 仅一个 JSON 文档。
- **存量审计**：18 个注册出口逐个建立「现有键序 → 冻结键序」表；`instructions --json` 补 `schemaVersion` 首键（表 A2）；`flow health.reconciled`、`flow ops list[].warning` 等条件键评估补 `null` 占位（允许增量，不做删除）。
- **构造与豁免约束（REV-95-004）**：`withSchemaVersion` 必须以 `{ schemaVersion: 1, ...doc }` 构造（运行时首键；类型签名不保证，契约测试兜底）。条件键豁免判据：**仅当已知外部消费者对键集做严格相等断言时才豁免**，且冻结表须登记为「条件出现键」并附依据（消费者名称 + 断言位置）；否则默认补 `null`。
- **备选**：引入 JSON Schema 库（新增第三方依赖，违反红线，否）；仅文档不测试（无法防回归，否）。
- **理由**：无依赖、可执行、与既有测试风格一致。

### D-5（P1-1 / P0-1）调度属性与 `flow next` 的单源纪律

- **裁定**：
  - `FlowManager` 新增公开 `getResponsibleAgent(phase)`（内部委托 `mapPhaseToAgent`，禁止命令层复制 switch）；`done → 'none'`；无活跃阶段时 `flow next.responsibleAgent = 'feel'`。
  - `flow next.legalNextPhases` = `getAvailablePhases(stage)`（缺省 `tier='full'`，**直接可达**），每个元素均被 `flow advance` 接受；不把多步跳跃计入；`suggestedCommand` = `openfeel flow advance --stage <stage> --to <legalNextPhases[0]>`，无合法目标时 `null`。
  - `blockingReviews` = 当前阶段域 blocking open REV；抽取单点谓词 `listStageBlockingOpenReviews(reviews, stage)`，`assertNoBlockingOpenRev` 与 `flow next` 共用（消除第三份）。
  - `workflowMode` 经 `resolveStageWorkflowMode(stage)` 单点；`reviewTier = MODE_DERIVED_TIER[mode]`；`effectiveReviewTier = 'full'`。
  - `flow status --json.stages[]` 的 `workflowMode` 逐阶段经同一解析器；`requirementId = stage.requirement_id ?? null`；`opsSummary` 从既有 `ops` 映射派生。
- **备选**：命令层重新实现 phase→agent 映射（违反「CLI 单一权威」初衷，否）；`legalNextPhases` 使用 `findPhasePath` 的 BFS 可达集（会把多步跳跃算作「下一相位」，语义不符，否）。
- **理由**：所有调度事实保持单一数据源；`flow next` 只是既有能力的聚合投影。

### D-6（P1-3 / P1-4 / P2-4）读命令扩展的具体形态

- **P1-3**：`linkedStages: [{id, phase}]`（`data.stages` 键序）；`progress: {done, total}`（对象，非 `"0/0"` 字符串——满足「两者均为数值」且类型稳定）；零关联 → `[]` + `{done:0,total:0}`。复用 `computeRequirementAggregate` / 新增 `listLinkedStages` 单点。
- **P1-4**：成功 dry-run 在既有键后追加 `eligible:true` / `unfinishedStages:[]` / `blockingReviews:[]`；判据拒绝保留 `error:'gate-rejected'` / `notDone` / `blockingOpen`，追加 `eligible:false` / `unfinishedStages:[{id,phase}]` / `blockingReviews:[{id,title,priority}]`；判据复用 `listArchivableCandidates` + `listBlockingOpenRevsForVersion`（禁第二份）。
- **P2-4**：`archive <stage> --json` 输出 `schemaVersion,stage,archivePath,opsCount,reviewsCount,knowledgeExtracts`；`archiveStage` 返回 `null` → `ARCHIVE_FAILED`（`kind=refusal` / exit 1；映射已在 stage-95 12 行表预留）；人类输出逐字不变。
- **备选**：`progress` 用字符串 `"done/total"`（类型弱、需解析，否）；`unfinishedStages` 仅字符串 ID（丢失 phase，适配器仍需二次查询，否）。

### D-7（P2-3）`--version --json`

- **裁定**：`runCli` 预扫描 argv；同时命中 `--version`/`-v` 与 `--json` 时，直接输出 `{schemaVersion:1,version,node}` 并返回（exit 0），不进入 Commander。纯文本 `--version` 行为逐字不变。
- **备选**：`program.exitOverride()` + 捕获 `commander.version`（会改变 `--help`/错误退出路径，影响面更大，否）。

---

## 四、阶段概览、依赖图与执行顺序

| 阶段 | 主题 | 名称 | 核心交付 | 依赖 | op 估 |
|------|:--:|------|----------|------|:--:|
| `v1.2.2-stage-95` | 基础设施 | JSON 输出契约与错误封装基础设施 | ① `docs/json-contract.md` + 契约测试骨架；② 错误层（`CliError` / `failRefusal` / `failInternal` / JSON 模式单点 / `runCli` catch）；③ `--version --json`；④ 全局 `--project`（预扫描 chdir + dedup 扩展路径）；⑤ 18 出口契约审计（`instructions` 补 `schemaVersion`、条件键 `null` 占位） + i18n + 单测 | — | 4 |
| `v1.2.2-stage-96` | 决策权威 | 调度决策权威 | ① `flow next [--json]`（responsibleAgent / legalNextPhases / suggestedCommand / guards / blockingReviews / workflowMode / reviewTier / effectiveReviewTier）；② `flow status --json.stages[]` 追加 5 属性；③ `flow phases --json` 追加 `displayReviewTier` / `effectiveReviewTier`；④ 单源谓词抽取 + i18n + 单测 | hard: 95 | 3 |
| `v1.2.2-stage-97` | 读命令 | 读命令 `--json` 全量补全 | ① 13 个命令面 `--json`（flow/stage/knowledge/config/view/plan/project）；② `req list --json` 关联阶段/进度；③ `flow archive --dry-run --json` 判据明细；④ `archive <stage> --json`；⑤ 这些命令的失败路径接入错误封装 + i18n + 契约测试 | hard: 95, 96 | 4 |
| `v1.2.2-stage-98` | 收口 | 文档与版本收口（v1.2.2 收官） | ① 文档多载体（README×3 / GETTING_STARTED / commands / json-contract 定稿 / manual / cli-usage 快照）；② CHANGELOG `[1.2.2]` + 版本 **1.2.2** 全链路 A/B/C/D/E；③ DSH 端到端契约验收（既有 18 + 本版 11 项全部出口）；④ roadmap/plan 回填 + 承接 REV 处置表 + 门禁 | hard: 95, 96, 97 | 3 |

**阶段执行进度（归档回填）**：

| 里程碑 | 阶段 | 状态 | 归档 | 备注 |
|--------|:--:|:--:|------|------|
| M49 JSON 契约与错误封装基础设施 | stage-95 | **done（2026-10-17）** | [archive-v1.2.2-stage-95.md](../../../log/archive-v1.2.2-stage-95.md) | 18 出口冻结 + 错误层（0/1/2/3 + `errorKind`）+ `--version --json` + 全局 `--project`；门禁 74 文件 / 1779 用例；验收 0 Bug |
| M50 调度决策权威 | stage-96 | **done（2026-10-17）** | [archive-v1.2.2-stage-96.md](../../../log/archive-v1.2.2-stage-96.md) | `flow next`（12 键）+ `stages[]` 5 调度属性 + `phases` 档位消歧 + 决策三单点；契约 19 出口 / 20 注册选项；门禁 74 文件 / 1809 用例；验收 0 Bug |
| M51 读命令 `--json` 全量补全 | stage-97 | **done（2026-10-17）** | [archive-v1.2.2-stage-97.md](../../../log/archive-v1.2.2-stage-97.md) | 13 读命令面 + `archive <stage>` = 14 新成功出口（#20~#33）+ `req list` 末位两键 + `flow archive` 判据明细；契约 33 出口 / 34 注册选项；门禁 74 文件 / 1894 用例；验收 0 Bug |
| M52 文档与版本收口 | stage-98 | **done（2026-10-17）** | [archive-v1.2.2-stage-98.md](../../../log/archive-v1.2.2-stage-98.md) | 文档多载体 + `CHANGELOG [1.2.2]` + 版本 1.2.2 全链路；契约 33 出口 / 34 注册选项；DSH 最终验收通过（33 出口/11 项映射/15 决策/多项目/零回归/真实消费 48-48）；门禁 74 文件 / 1894 用例；验证 0 Bug；**v1.2.2 版本收官（四阶段 95~98 全 done）** |

### 依赖图与执行顺序（**严格串行**）

```text
stage-95 ─▶ stage-96 ─▶ stage-97 ─▶ stage-98
 契约/错误     决策权威      读命令补全     文档/版本/验收
   └── 地基 ──┘  └──── 共享契约助手 ────┘  └── 冻结后收口 ──┘
```

**执行顺序：95 → 96 → 97 → 98。** 理由见 `roadmap/v1.2.2.md`「为什么按此顺序」。

**各阶段明细（目标 / 任务表 / 约束 / 验收要点 / 依赖）见附录 A。**

---

## 五、建议阶段注册表（供 Feel 经 CLI 执行；本计划**不推进 phase**）

| # | stageId | 名称 | deps | exec-mode | auto-advance | workflow-mode | 关联需求 |
|:-:|---------|------|------|:--:|:--:|:--:|:--:|
| 1 | `v1.2.2-stage-95` | JSON 输出契约与错误封装基础设施 | — | auto | enabled | full | REQ-001 |
| 2 | `v1.2.2-stage-96` | 调度决策权威 | `v1.2.2-stage-95` | auto | enabled | full | REQ-001 |
| 3 | `v1.2.2-stage-97` | 读命令 `--json` 全量补全 | `v1.2.2-stage-95` `v1.2.2-stage-96` | auto | enabled | full | REQ-001 |
| 4 | `v1.2.2-stage-98` | 文档与版本收口（v1.2.2 收官） | `v1.2.2-stage-95` `v1.2.2-stage-96` `v1.2.2-stage-97` | auto | enabled | full | REQ-001 |

- **注册命令（Feel 执行）**：`openfeel plan stage add <stageId> --deps <ids...> --tasks <items...> --exec-mode auto --auto-advance enabled --workflow-mode full`；随后 `openfeel flow advance --stage <stageId> --to plan_pending`；再 `openfeel req link --stage <stageId> --requirement REQ-001`。
- **review-agent**：全部 `openfeel-reviewer`。
- **op 级依赖**（`ops/deps.yaml`）由 openfeel-schemer 在各阶段产方案时落盘（hard / soft / mutual_exclusion，声明实际文件名）。
- **本计划已落盘**：`.openfeel/roadmap/v1.2.2.md` + `.openfeel/plan/v1/v1.2.2/{plan.md,deps.yaml}` + 四个阶段计划；**阶段目录 / status.md 骨架、flow.json 注册、phase 推进、REQ-001 关联仍由 Feel/CLI 执行**。
- **计划纪律（REV-85-002 固化）**：每阶段计划含「承接 REV 与处置表」；上游 v1.2.1 收口（`reviews: 0`）为空账；用户台账 pending 条目按「本阶段处置 / 显式转后续 / 台账保留」三分登记。

---

## 六、版本收口清单（1.2.1 → 1.2.2，A/B/C/D/E，归 stage-98）

> 依据 `kb/patterns.md #版本号全链路收口清单模式`；以**内容特征**判定，不以行号为准；B 类为双生成物。

- **A 手工载体**（6 载体 / 8 文件 / 10 处，承 v1.2.1 口径）：`package.json:3`；`package-lock.json:3/:9`（**禁 `npm install` 重生成**）；`.openfeel/config.yaml:7`（**单行 edit，禁整文件重写**）；`src/core/config.ts:436/:493`；`src/core/templates-data/agents-md/{zh-CN,en}.md:135`；`src/core/templates-data/claude/constraint/{zh-CN,en}.md:138`。
- **B 生成段（双份）**：`src/core/template-loader.ts` + `src/core/update.ts`，由 `npm run build` 重生成（**禁手改**；`git status --porcelain src/` 干净断言）。
- **C 传播**：`CHANGELOG.md` 追加 `## [1.2.2]`（显著登记：`flow next` / 全局 `--project` / 13 读命令 `--json` / 错误封装（**退出码 0/1/2/3 + `errorKind` + REQ-001 L80 勘误留痕**）/ `--version --json` / `flow archive` 判据明细 / `archive --json` / `reviewTier` 消歧）；`README*`（能力节 + 测试数）；`docs/commands.md`（新命令/选项）；`docs/GETTING_STARTED.md`（快照 + 最小示例）；`docs/json-contract.md`（契约定稿）；`templates-data/skills/openfeel-cli-usage/SKILL.md`（快照 v1.2.2 + 新节）；`.openfeel/manual/**`（按模块核对）。
- **D 禁改**：`src/**` 历史批注（`v1.2.1-stage-*` 示例）、依赖自身版本、manual 变更历史、`test/**` 注释、`docs/phase-*/**`；文档侧能力引入标记白名单化（file:line 显式枚举）。
- **E 无载体**：`docs/design-philosophy.md` 等非版本型文档（仅当能力描述失实时按需改）。
- **CLI `VERSION` 常量不存在**：`--version` 直读 `package.json`；`--version --json` 复用同一来源。

---

## 七、边界（不做）

1. 不改 phase 枚举（15 项）/ `checkpoint_mapping` / `phase_corrections` / `advanceAccepted` 语义；不改转移表语义（本版仅读，不裁剪/不新增边）。
2. 不重写 DSH 适配器领域逻辑；不把决策逻辑搬进适配器。
3. 不删除 / 不改类型既有 18 个 `--json` 出口字段；不把 legacy `{error:'...'}` 字符串载荷改为对象，**仅末尾追加 `errorKind`**；`error` 恒为 string、既有键序零改动。
4. 不引入第三方依赖（含 JSON Schema 校验库）；不改 CI workflow。
5. 不做 dashboard / 可视化；不改 CLI 运行日志布局。
6. 不迁移 `init` / `migrate` / `update` / `model` 等非适配器读命令的失败路径（在契约文档列明边界）。
7. 不 `npm publish`、不 `git push`；**不直写 `flow.json`**；不推进流水线 phase（由 Feel 经 CLI 执行）。
8. 不改 `flow archive` 判据口径（全阶段 done + 无 blocking open REV）；`--dry-run` 零写盘语义不变。
9. 不改版本归档口径（`requirements` 不随版本归档，承 v1.2.0 裁定 W / v1.2.1 裁定 M）。
10. 不改 `flow next` 的 `guards` 为结构化对象（保持字符串数组；如需 code 化留待后续版本）。

---

## 八、全局验收标准（版本级）

1. **门禁**：`npm test` 全绿（0 skipped / 0 failed；起点 71 文件 / 1719 用例，新增契约测试后逐阶段登记）；`npx tsc --noEmit` = 0；`openfeel lint i18n` = 新基线（起点 **945**，新增键逐键列名）；`openfeel lint kb` = 0 过期；`npm run build` ×2 幂等（`git status --porcelain src/` 空）；`node bin/openfeel.js --version` = **1.2.2**。
2. **JSON 契约（P2-1）**：18 个既有出口 + 本版新增出口均满足——stdout 单文档、`schemaVersion` 首键且为 1、键序/键集冻结、可选字段 `null`、数组 `[]`、映射 `{}`；`instructions --json` 补 `schemaVersion`；契约测试全绿。
3. **错误封装（P0-3）**：JSON 模式下——非法相位转移 / 门禁拒绝 / 非法参数/用法错误 / 缺失项目 → `error.kind='refusal'`、`code` 稳定、exit 1；内部异常 → `error.kind='internal'`、**exit 3**；并发冲突 → **`kind='refusal'` + exit 2**；zh/en 下 `code` 一致；**12 行 code→kind→exitCode 映射表逐行断言**；非 JSON 模式人类文案不变（0/1/2 语义零改动）；legacy `error` 字符串载荷类型与键序不变、**全部追加 `errorKind`**（`archive-write-failed` → internal/3）。
4. **全局 `--project`（P1-2）**：任意命令前置/后置 `--project <path>` 均按目标项目解析；不传时回退 cwd；非法路径 → 明确错误（JSON 下 envelope）；`knowledge dedup --project` 语法可用；**chdir 后语言按目标项目、`--log-file` 相对路径按原始 cwd、`--project`/`--json` 预扫描成对防误判、单进程单命令前提**均有测试或文档登记。
5. **决策权威（P0-1 / P1-1 / P2-2）**：`flow next --json` 字段齐全且只读；`responsibleAgent` 与 `mapPhaseToAgent` 同源；`legalNextPhases` 每个元素均被 `flow advance` 接受；`flow status --json.stages[]` 既有 5 字段不变 + 5 新字段；`flow phases --json` 既有 7 键不变 + 2 消歧字段；文档明示展示值/生效值语义。
6. **读命令补全（P0-2 / P1-3 / P1-4 / P2-4）**：13 个命令面 `--json` 可用且关键字段齐全；`req list --json` 含 `linkedStages/progress`；`flow archive --dry-run --json` 含 `eligible/unfinishedStages/blockingReviews` 且零写盘；`archive <stage> --json` 含摘要路径与知识条目；人类输出逐字不变。
7. **零回归**：既有 18 个 `--json` 出口字段零破坏；人类输出逐字不变（除登记的有意变更：`instructions` 追加 `schemaVersion`、条件键 `null` 占位、legacy 载荷追加 `errorKind`、`flow archive` 追加判据字段、`flow phases` 追加 2 键、`flow status.stages[]` 追加字段、`flow next` 新增）；退出码 0/1/2 语义不变、3 仅新增；legacy `error` 类型/键序不变；phase 枚举 / `advanceAccepted` / full/fast 行为不变；存量 `flow.json` 零迁移零注入。
8. **适配器端到端**：用 OpenFeel-DSH 真实消费「既有 18 个出口 + 本版 11 项需求的全部出口」做契约断言（字段存在性/类型/首键/退出码）；适配器移除对 `PHASE_AGENT_MAP` 镜像与文本解析的依赖；记录链路（命令 + 版本 + 环境三要素）。
9. **文档与版本**：版本 1.2.2 全链路 A/B/C/D/E（A 类残留 0）；CHANGELOG / README×3 / GETTING_STARTED / commands / json-contract / manual / cli-usage 同步；roadmap v1.2.2 回填。
10. **流程**：所有阶段关联 REQ-001；阶段计划含承接 REV 处置表；收口 op 为阶段最终 op；不直写 `flow.json`。
11. **扩展优先与同步核对**：C1~C6 候选项逐项给出「已同步 / 无需变更（依据）」结论；`instructions --json` 首键（C1）同步清单全部完成；`knowledge dedup --project`（C2）优先扩展路径；既有 0/1/2 与 legacy `error` 字符串载荷零改动；任何必须修改项均在**同一版本**内完成适配/模板/技能/文档同步，无既有消费者静默失效。

---

## 九、风险总览

| # | 风险 | 影响 | 缓解 |
|:-:|------|------|------|
| **R-1** | **契约冻结误伤既有消费者**（键序/类型/新增 `null` 键被严格断言拒绝） | **高** | 只增不改 + 18 出口逐项「现有键序 → 冻结键序」表 + 契约测试 + DSH 真实消费验收；`instructions` 补键显式登记为有意变更 |
| **R-2** | **错误封装双形态导致适配器误判**（legacy `error:string` vs 新 `error:object`；`errorKind` 追加触发严格键集断言） | **高** | `docs/json-contract.md` 明示 `typeof doc.error` 判别；12 行 code→kind→exitCode 映射表；新 envelope 仅用于文本型失败；`errorKind` 仅末尾追加；DSH 端到端覆盖两类；`kind` 作为唯一分类权威 |
| **R-3** | **全局 `--project` 的 chdir 副作用**（语言解析漂移、相对日志路径、相对路径、全局命令） | 中 | 单一注入点 + 目标路径先校验 + **语言按目标项目（文档化）** + **`--log-file` 在 chdir 前按原始 cwd 解析** + 相对路径语义文档化 + 子进程测试（不同 cwd 启动）+ **单进程单命令前提登记**；`knowledge dedup` 语法回归 |
| **R-4** | **决策映射漂移**（`flow next` 复制 phase→agent / 阻塞 REV 第三份谓词） | 中 | 公开单点方法 + 抽 `listStageBlockingOpenReviews` + 测试断言与 `mapPhaseToAgent` / `assertNoBlockingOpenRev` 同源 |
| **R-5** | **`flow status --json` 逐阶段解析开销 / 状态不一致** | 中 | 单次调用内复用同一 `FlowManager` 快照；`resolveStageWorkflowMode` 单点；17 阶段量级可接受；契约测试断言一致性 |
| **R-6** | **`reviewTier` 语义仍被误用**（把展示值当生效值） | 中 | 三处输出同时给 `displayReviewTier`/`effectiveReviewTier`；文档固定说明；DSH 断言 `effectiveReviewTier === 'full'` |
| **R-7** | **`flow archive` 判据第二份实现**（明细字段与门禁口径漂移） | 中 | 复用 `listArchivableCandidates` + `listBlockingOpenRevsForVersion`；dry-run 零写盘字节级断言 |
| **R-8** | **读命令 `--json` 改造破坏人类输出** | 中 | 先聚合数据对象再渲染；人类输出快照对比（补丁前/后逐字）；契约测试 |
| **R-9** | **i18n 漏键 / 死键**（新命令文案与 guard 文案） | 中 | zh/en 双表成对 + 消费点接入 + `lint i18n` 逐键列名 |
| **R-10** | **版本收口遗漏**（A 类残留 / 双生成物未重生成） | 中 | 内容特征扫描兜底 + file:line 白名单 + `npm run build` ×2 + `--porcelain` 断言 |
| **R-11** | **测试基线误报**（任务简述 67 文件 vs 实测 71） | 低 | 以本计划实测 71 / 1719 为起点；每阶段门禁实测登记，不以简述值验收 |
| **R-12** | **`instructions --json` 补 `schemaVersion` 被旧消费者拒绝** | 低 | 需求 P2-1 明确要求；增量首键不删既有字段；C1 同步清单（测试/文档/skill/DSH）；变更登记 CHANGELOG |
| **R-13** | **扩展优先原则失效**（必须修改项未同步跟进，既有调用方静默失效） | **高** | C1~C6 同步清单 + §八.11 核对项 + stage-98 多载体收口 + CHANGELOG 勘误留痕；C1 为首要跟进项 |

**回滚**：各阶段均可 `git revert` 对应提交；错误层 / 契约助手为新增模块，回滚即恢复旧路径；全局 `--project` 为单点预扫描，回滚即恢复 cwd 语义；读命令 `--json` 为新增开关，回滚即隐藏；文档 / 版本载体为文本；**无数据格式破坏**（不触碰 flow.json 结构 / phase 枚举 / 既有 `--json` 字段）。

---

## 十、开放问题（方案期 / 执行期定稿）

- **Q1（stage-95）**：**映射表 12 行已在 stage-95 计划 T2 定稿**；本项仅剩 legacy 字符串 → 稳定 `code` 的完整清单（`no-init` → `NO_INIT` 等，执行期全枚举）与 `detail` 最小字段集。
- **Q2（stage-95）**：预扫描器已知取值选项的最终名单与 `--json=true` 等价形态；**边界规则已定稿（`--json` / `--project` 成对防误判，见 D-2）**，方案期仅定稿名单与实现。
- **Q3（stage-95）**：18 出口中哪些条件键补 `null` 占位（`flow health.reconciled` / `flow ops list[].warning` 等）；**豁免判据已定稿（仅当已知外部消费者对键集严格相等断言时才豁免，须登记条件出现键并附依据）**。
- **Q4（stage-95）**：`--project` 缺失值/非法路径文案；`knowledge dedup` 同名双注册的实测结论（保留本地声明 vs 收敛 + C2 同步清单）；**语言解析与 `--log-file` 相对路径已定稿（见 D-2）**。
- **Q5（stage-96）**：`flow next.guards` 的具体文案与触发集合（auto-advance disabled / blocking REV / 无合法目标 / 展示档位≠生效档位）；是否输出 `guardCodes`（本版不做）。
- **Q6（stage-96）**：`suggestedCommand` 在多个合法下一相位时的选择规则（取转移表首项）；是否需要 `suggestedPhase` 独立字段。
- **Q7（stage-97）**：`stage status --json` 的字段规范名与原始中文键的映射（`fields` 原样 + 规范化字段双给，或仅规范化）。
- **Q8（stage-97）**：`knowledge search --json` 是否返回 `content` 全文（默认上限 10 条）或仅摘要；`project overview --json` 的目录/统计键名冻结。
- **Q9（stage-98）**：DSH 端到端验收的执行方式（隔离 fixture + 真实 DSH 仓库只读消费）；18+11 出口的断言清单落点（`.openfeel/tmp/` 报告）。
- **Q10（stage-98）**：`flow archive v1.2.1` 是否在本版收口前由 Feel 执行（当前 `archived_versions` 止于 v1.1.7）；本计划不将其作为 v1.2.2 前置。

---

## 十一、端到端验收（实现后，由用户 / 测试官 / DSH 适配器执行）

1. **静态门禁**：见 §八.1。
2. **契约矩阵**：对 18 个既有出口 + 本版新增出口逐个执行 `--json`，断言：单文档、首键 `schemaVersion:1`、键集/类型、无人类文本；人类模式下输出快照对比。
3. **错误矩阵**：非法相位转移 / 门禁拒绝 / 非法参数 / 未初始化 / 并发冲突 / 模拟内部异常 ×（zh-CN, en）→ 断言 `code`/`kind`/退出码。
4. **决策矩阵**：对每个 phase（15 项）构造 fixture，断言 `flow next.responsibleAgent` / `legalNextPhases` / `suggestedCommand`；与 `flow advance --dry-run` 接受集交叉验证。
5. **多项目**：从目录 A 启动 `--project B`，断言 `flow status --json` / `config effective --json` / `knowledge list --json` 均读 B；非法路径断言 envelope。
6. **读命令**：13 个命令面在隔离 fixture 上逐条实跑，断言关键字段与人类输出等价。
7. **归档判据**：构造「未完成阶段 + blocking REV」fixture → `flow archive <v> --dry-run --json` 断言 `eligible:false` 与明细；零写盘哈希对比；合格 fixture → `eligible:true`。
8. **适配器**：OpenFeel-DSH 真实消费 18+11 出口；记录命令/版本/环境；断言不再依赖 `PHASE_AGENT_MAP` 镜像与文本正则。
9. **零回归**：v1.2.1 既有命令（`flow phases` / `flow archive` / `req` 11 子命令 / `flow mode` / `flow health`）逐字或契约级回归；本仓复核 17 阶段。
10. **版本面**：`--version` / `--version --json` = 1.2.2；A 类残留 0。

---

## 十二、修订记录

| 时间 | 制定人 | 说明 |
|------|--------|------|
| 2026-10-17 | openfeel-planner | 初稿：依据 `docs/v1.2.2-requirements.md` + `REQ-001` 制定 4 阶段（95~98）；源码核验 5 表 30+ 项；关键裁定 D-1~D-7；里程碑 M49~M52；版本收口 A/B/C/D/E；风险 R-1~R-12；开放问题 Q1~Q10。**只写计划文档，未改源码、未直写 flow.json、未推进 phase。** |
| 2026-10-17 | openfeel-executor | **stage-98 收口实况回填（最小追加）**：CLI **1.2.2**；契约 **33 成功出口 / 34 注册选项**；门禁 **74 文件 / 1894 用例**（0 failed / 0 skipped）、`tsc --noEmit` 0、`lint i18n` 983、`lint kb` 0 过期；本仓 **21 阶段**；DSH 最终验收通过（33 出口 41/41、11 项映射 11/11、决策 15/15、多项目 5/5、零回归 5/5、真实消费 48/48 exit 0）；§四 M52/stage-98 状态与归档列同步回填。**不重写正文，未推进 phase / 未直写 flow.json。** |
| 2026-10-17 | openfeel-archiver | **阶段归档 + v1.2.2 版本收官回填**：归档摘要 `.openfeel/log/archive-v1.2.2-stage-98.md` 生成（含「v1.2.2 版本收官」节：四阶段 95~98 全 done / 11 项需求出口与证据 / 33-34 口径 / REQ-001 自动收口说明）；M52 归档链接去「归档轮生成」占位并补版本收官备注。**只改计划回填与归档材料，未改源码 / 测试 / flow.json，未 commit / push。** |

---

## 附录 A：阶段明细（目标 / 任务表 / 约束 / 验收要点 / 依赖）

### stage-95 JSON 输出契约与错误封装基础设施

- **目标**：建立全版本共用的「单文档 JSON + 稳定错误」地基，并完成两个独立入口能力（`--version --json`、全局 `--project`）。
- **任务表**：T1 契约助手与 `docs/json-contract.md`（含退出码表 + 12 行映射表 + legacy 双形态）；T2 错误层与 `runCli` 统一 catch（退出码 0/1/2/3、并发冲突 `kind=refusal`、legacy `errorKind`）；T3 全局 `--project`（预扫描 chdir + dedup 扩展路径 + 语言/日志/误判/单进程四项边界）；T4 `--version --json`；T5 18 出口契约审计（`instructions` 补 `schemaVersion`、条件键 `null` 占位与豁免判据、键序冻结表）；T6 i18n + 单测 + 门禁 + 扩展同步核对。
- **约束**：既有 18 出口只增不改；legacy `error` 字符串保留（仅末尾追加 `errorKind`）；退出码 0/1/2 语义零改动、新增 3=internal；人类输出逐字不变；chdir 单点注入（语言按目标项目、`--log-file` 按原始 cwd）；扩展优先 + C1~C6 同步清单；不引入依赖。
- **验收要点**：契约测试全绿；错误 envelope 形态/退出码（0/1/2/3 + 12 行映射表 + legacy `errorKind`）；`--project` 多目录实跑（含语言/日志路径/预扫描误判对）；`--version --json` 精确形态；18 出口首键断言；扩展同步核对。
- **依赖**：无（上游 v1.2.1-stage-94 done）。

### stage-96 调度决策权威

- **目标**：让 CLI 成为「下一步该谁做」的唯一权威。
- **任务表**：T1 `flow next`（JSON + 人类输出 + guards + suggestedCommand）；T2 `FlowManager` 公开 `getResponsibleAgent` + 抽 `listStageBlockingOpenReviews`；T3 `flow status --json.stages[]` 5 属性；T4 `flow phases --json` 追加 `displayReviewTier`/`effectiveReviewTier`；T5 i18n + 单测 + 契约测试。
- **约束**：`legalNextPhases` 与 `flow advance` 缺省同源；`responsibleAgent` 禁第二份映射；`reviewTier` 只增不改；`flow next` 只读零写盘。
- **验收要点**：字段齐全；15 phase 矩阵；与 advance 接受集交叉断言；既有 7 键/5 字段不变。
- **依赖**：hard: 95。

### stage-97 读命令 `--json` 全量补全

- **目标**：消除适配器对 13 个命令人类文本的解析，并补齐关联阶段/判据明细/阶段归档 JSON。
- **任务表**：T1 flow/stage 读命令（`stage status` / `flow recover` / `flow checkpoint list` / `flow log` / `project overview`）；T2 knowledge/config/view/plan（`knowledge search/list/index/dedup` / `config get/effective` / `view list` / `plan scheme list`）；T3 `req list --json` 关联阶段/进度；T4 `flow archive --dry-run --json` 判据明细；T5 `archive <stage> --json`；T6 失败路径接入错误封装 + i18n + 契约测试。
- **约束**：人类输出逐字不变；每命令退出码语义镜像人类模式；`flow archive` 判据复用既有单点；`--dry-run` 零写盘；`progress` 为对象。
- **验收要点**：13 命令面契约断言；`linkedStages/progress`；`eligible/unfinishedStages/blockingReviews`；`archive` JSON；既有出口零破坏。
- **依赖**：hard: 95, 96。

### stage-98 文档与版本收口（v1.2.2 收官）

- **目标**：文档多载体 + 版本 1.2.2 全链路 + DSH 端到端契约验收。
- **任务表**：T1 文档多载体（README×3 / GETTING_STARTED / commands / json-contract 定稿 / manual / cli-usage 快照）；T2 CHANGELOG `[1.2.2]` + 版本 A/B/C/D/E；T3 DSH 端到端验收（18+11）；T4 roadmap/plan 回填 + 承接 REV 处置表；T5 门禁全量 + 收口 op（最终 op）。
- **约束**：收口 op = 阶段最终 op；A 类内容特征扫描兜底；D 类白名单 file:line；双生成物同批 build；不引入代码改动。
- **验收要点**：§八全项；`--version` = 1.2.2；A 类残留 0；DSH 断言全绿；文档与 `--help` 实测一致。
- **依赖**：hard: 95, 96, 97。
