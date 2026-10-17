# OpenFeel CLI JSON 输出契约（v1.2.3）

- **权威范围**：`--json` 成功输出（33 个成功出口）与 `--json` 失败输出（错误 envelope / legacy 双形态）。
- **实现锚点**：`src/commands/shared/json-output.ts`（契约助手）、`src/commands/shared/errors.ts` 与 `src/cli/index.ts`（错误层，stage-95 op-002）。
- **维护纪律**：本文件为单一权威；源码实测变更须同批更新本文件与可执行冻结测试 `test/cli/json-contract.test.ts`。§6 登记的是有意增量清单，未登记即视为破坏。
- **v1.2.3-stage-99 收口**：并发冲突 JSON 退出机制已与 `failCli` 统一（§14.2）；§14.1 补锁超时 E2E 证据；33 成功出口 / 34 注册选项与退出码语义零改动。
- **v1.2.2-stage-98 定稿**：文档多载体（README×3 / GETTING_STARTED / commands / manual / cli-usage）已同批同步；本文件为 v1.2.2 发布口径（33 成功出口 / 34 注册选项）。
- **不变量**：既有 19 个成功出口**零删除 / 零重排 / 类型零改**（本阶段新增第 20~33 个）；只允许本文件 §6 登记的有意增量。出口 #19 `flow next` 为 stage-96 新增（§6.10）。

## §1 单文档规则

1. `--json` 模式下 stdout 恰好输出**一个** JSON 文档；不得混入标题、进度、警告等人类文本（唯一例外：`flow advance --json` 成功输出保持人类文本，见 §7/§8）。
2. `schemaVersion` 恒为**运行时首键**且值为 `1`（构造序必须写成 `{ schemaVersion: 1, ...doc }`，禁止 `{ ...doc, schemaVersion: 1 }`）。
3. 可选字段缺省时使用 `null`；集合字段使用 `[]`；映射字段使用 `{}`；不使用 `undefined`（`JSON.stringify` 会丢键）。
4. 既有字段只增不删、不重排、不改类型；键的语义与取值规则以本文件冻结表为准。
5. JSON 输出与人类可读输出共享同一业务判定，禁止为 JSON 分支复制第二套来源判定。
6. **双轨判定（stage-97 §13.6）**：成功 JSON 分支判定（`options.json`，Commander 已注册选项；直接 `parse` 与 `runCli` 两条入口均可达）与失败 envelope 判定（`isJsonMode()` 单点，由 `runCli` 预扫描置位、命令层不得自行 set）为两条授权入口；测试直接 parse 失败路径须显式 `setJsonMode(true)` 并在 `finally` 复位。

## §2 退出码语义表（权威口径 R-cp-1）

| 退出码 | 语义 | kind | 说明 |
|:--:|------|------|------|
| `0` | 成功 | — | 命令完成（含 `ok:false` 等「成功文档 + 非 0」情形见 §5） |
| `1` | 预期拒绝 | `refusal` | 门禁拒绝、相位非法、非法参数 / 用法错误 |
| `2` | 并发写冲突 | `refusal` | 保留 `EXIT_CONCURRENT`；可重试 |
| `3` | 内部错误 | `internal` | 本版新增；既有 0/1/2 语义零改动 |

- `kind` 为**分类权威**，退出码为冗余信号；适配器应优先读取 `kind`（legacy 形态读 `errorKind`）。
- `0/1/2` 语义零改动；`3` 仅新增，不重映射任何既有路径。
- 需求文本 `REQ-001` L80 括注与实现不符，以本表为准（见 §10）。

## §3 `code → kind → exitCode` 映射表（单一权威）

| code | kind | exitCode |
|------|------|:--:|
| `NO_INIT` | refusal | 1 |
| `INVALID_ARGUMENT` | refusal | 1 |
| `STAGE_NOT_FOUND` | refusal | 1 |
| `PHASE_TRANSITION_ILLEGAL` | refusal | 1 |
| `PHASE_PATH_NOT_FOUND` | refusal | 1 |
| `BLOCKING_REVIEWS` | refusal | 1 |
| `ARCHIVE_GATE_REJECTED` | refusal | 1 |
| `ARCHIVE_WRITE_FAILED` | internal | 3 |
| `PROJECT_NOT_FOUND` | refusal | 1 |
| `FLOW_CONCURRENT_CONFLICT` | refusal | 2 |
| `INTERNAL_ERROR` | internal | 3 |
| `ARCHIVE_FAILED` | refusal | 1（stage-97 实现：`archive <stage> --json` 失败（refusal/1）） |

- `code` 为语言无关常量（zh/en 一致）；`message` 可本地化。
- 映射表与 `src/core/errors.ts` 同源；可执行断言由 `test/cli/error-envelope.test.ts`（op-002）承担。

## §4 错误形态（envelope 与 legacy 双形态）

### 4.1 新 envelope

```json
{
  "schemaVersion": 1,
  "error": {
    "code": "INVALID_ARGUMENT",
    "kind": "refusal",
    "message": "……",
    "detail": null
  }
}
```

- `error.detail` 无值时恒为 `null`（键恒在）。
- 适用：文本型失败路径迁移后的 JSON 模式输出（op-002 落地）。

### 4.2 legacy 形态（零破坏保留）

```json
{
  "schemaVersion": 1,
  "error": "gate-rejected",
  "notDone": ["..."],
  "blockingOpen": ["..."],
  "errorKind": "refusal"
}
```

- `error` **恒为 string**，既有键序不变；仅允许在末尾追加顶层 `errorKind`（`refusal | internal`）。
- `flow archive` 判据拒绝（gate-rejected）9 键固定序：`schemaVersion,error,version,notDone,blockingOpen,eligible,unfinishedStages,blockingReviews,errorKind`；`eligible` 恒 `false`；`unfinishedStages[]{id,phase}`；`blockingReviews[]{id,title,priority}`（见 §13.3）。
- 适用：`flow archive` / `flow archive show` / `req` 族既有 `failJson` 路径。

### 4.3 唯一判别规则

```text
typeof doc.error === 'string'  → legacy
否则（object）                 → envelope
```

- 禁止以退出码、命令名或字段存在性做第二套判别。

## §5 33 出口冻结表

> 计数口径：**33 个成功 JSON 出口**。`flow advance --json` 为错误封装开关，不计入（见 §7）。

| # | 出口 | 顶层键序 | 元素/嵌套键（实测） | 条件键/形态 |
|:-:|------|----------|--------------------|------------|
| 1 | `flow status` | `schemaVersion,pipeline,stages,counts` | `pipeline{phase,current{stage,op}}`；`stages[]{id,phase,status,deps,ops,workflowMode,requirementId,reviewTier,effectiveReviewTier,opsSummary{total,byState}}`；`counts{total,done,active}` | 恒在；`stages[]` 末位新增 5 字段（既有 5 字段键序/类型不变，见 §12.2）；`requirementId` 恒在、可空（`null`）；`byState` 仅含观测态 |
| 2 | `flow overview` | 已初始化：`schemaVersion,phase,current,summary,stages,reviews,health,logs` | `current{stage,op}`；`summary{phase,currentOp,retryCount,stagesCount,opsCount,reviewItemsOpen,recentLogs}`；`stages[]{id,phase,status,opsTotal,opsDone}`；`reviews{open,blockingOpen,nonBlockingOpen,resolved,closed}`；`health{ok,pass,warn,fail}` | **形态变体**：未初始化恰 `schemaVersion,initialized(false)` |
| 3 | `flow current` | `schemaVersion,stage,op,phase` | 均为 string（空态 `''`） | 恒在 |
| 4 | `flow metrics` | `schemaVersion,agents` | `agents[]{agentName,totalRuns,successfulRuns,failedRuns,totalRetries,totalDurationMs,avgDurationMs,successRate}` | 恒在 |
| 5 | `flow phases` | `schemaVersion,phases,transitions,advanceAccepted,transitionsDiff,workflowMode,reviewTier,displayReviewTier,effectiveReviewTier` | `transitionsDiff{missing,extra,changed}` | 恒在；末位新增 2 键（既有 7 键不变，见 §12.3） |
| 6 | `flow mode` | `schemaVersion,stage,mode,source,modes` | `modes{full,fast,general}`（各为 transitions 映射） | 恒在 |
| 7 | `flow ops list` | `schemaVersion,ops` | `ops[]{stage,opId,title,state,fill,warning}` | `warning` 恒在，非 empty 时 `null` |
| 8 | `flow archive` | 成功：`schemaVersion,version,stages,reviews,log,dryRun,eligible,unfinishedStages,blockingReviews` | `stages/reviews/log` 为 number；`dryRun` 为 boolean；`eligible` 成功恒 `true`；`unfinishedStages` / `blockingReviews` 成功恒 `[]` | 失败为 legacy（见 §4；gate-rejected 9 键见 #8b） |
| 9 | `flow archive list` | `schemaVersion,versions` | `versions[]{version,counts}`；`counts{stages,reviews,log}` 或 `null` | `counts` 恒在、可空 |
| 10 | `flow archive show` | **`schemaVersion,version,stages,reviews,log,counts,archived_at`**（本版首键重定位；其余相对序不变） | 嵌套透传归档文件原文 | 失败为 legacy（见 §4） |
| 11 | `flow health` | `schemaVersion,ok,items,reconciled` | `items[]{name,status,detail}` | `reconciled` 恒在，非 `--fix` 时 `null`；`ok:false` 仍为成功文档 + exit 1 |
| 12 | `req list` | `schemaVersion,requirements` | `requirements[]` = `RequirementData` + 末位追加 `linkedStages,progress`；`linkedStages[]{id,phase}`；`progress{done,total}`；`RequirementData` 可选字段（`target_version,priority,owner,claimed_at,body_path,parent_id,workflow_mode`）**条件出现**（读侧宽容不注入） | 条件出现键（依据：`src/core/req/types.ts` 可选标记 + 读侧宽容不注入）；两新键恒在且恒为末位 |
| 13 | `req show` | `schemaVersion,requirement,stages,parent,children` | `stages:string[]`；`parent:string|null`；`children:string[]` | `parent` 恒在、可空 |
| 14 | `req split` | `schemaVersion,parent,children` | `children` = `RequirementData[]` | 恒在 |
| 15 | `req board` | `schemaVersion,groups` | `groups` 键序 = `REQ_STATUSES`（7 值）；值为数组 | 恒在 |
| 16 | `req next` | `schemaVersion,requirement` | `requirement` 对象或 `null` | **`candidates` 条件出现键**（仅 `limit>1`） |
| 17 | `instructions` | **`schemaVersion,artifact,task,project_context,rules,dependencies,output,instruction,template,unlocks`**（C1） | `artifact{id,change,schema}`；`project_context{tech_stack,workspace,project,config{execution_mode,auto_advance,merge_mode}}`；`template` 可空 | `template` 恒在、可空 |
| 18 | `setup --check` | `schemaVersion,status,cliVersion,deployedVersion` | `deployedVersion` 可空 | `status!=='ok'` 仍为成功文档 + exit 1 |
| 19 | `flow next` | `schemaVersion,stage,phase,phaseLabel,responsibleAgent,workflowMode,reviewTier,effectiveReviewTier,legalNextPhases,suggestedCommand,guards,blockingReviews` | `blockingReviews[]{id,title,priority,op}`；`guards:string[]`（本地化；顺序见 §12.1） | 恒在（无活跃阶段亦为完整 12 键文档；可空字段 `null`、数组 `[]`） |
| 20 | `stage status` | 单阶段：`schemaVersion,stageId,statusPath,fields,tasks,blockedBy`；无参：`schemaVersion,stages,count` | 单阶段 `fields` = 7 规范键 + `raw`（`execMode,autoAdvance,status,reviewAgent,previousReviewAgent,updatedAt,workflowMode,raw`）；`tasks[]{number,done,description}`；无参 `stages[]{stageId,status,statusPath}` | `blockedBy` 可空（`null`）；`statusPath` 绝对路径；无参空态 `stages:[]` + `count:0` |
| 21 | `flow recover` | `schemaVersion,initialized,phase,currentOp,stageStatus,blockedBy,pendingTasks,stageStats` | `stageStats` 为映射（`{}` 空态）；`pendingTasks:string[]` | 未初始化：`initialized:false` + `null` / `[]` / `{}`（exit 0，镜像人类） |
| 22 | `flow checkpoint list` | `schemaVersion,stage,checkpoints,count` | `checkpoints:string[]` | `stage` 可空（`null` = 全部）；未初始化与空集合同形 `checkpoints:[]` |
| 23 | `knowledge search` | `schemaVersion,query,limit,offset,results` | `results[]{title,category,date,enabled,content,summary}`；`summary` 为内容前 100 字（超出加 `…`） | 空态 `results:[]` + exit 0 |
| 24 | `knowledge list` | `schemaVersion,entries,count` | `entries[]{title,category,date,enabled}`（不含 `content`） | 空态 `entries:[]` + exit 0 |
| 25 | `knowledge index` | `schemaVersion,categories,recentUpdates` | `categories[]{name,description}`；`recentUpdates[]{date,category,title}` | `index.md` 缺失时 `categories` 为 4 分类缺省、`recentUpdates:[]` |
| 26 | `knowledge dedup` | `schemaVersion,threshold,categories,found,readOnly,matches` | `matches[]{category,title,date,enabled,similarity,flagged}`；`categories:string[]` | 恒 `readOnly:true`；无匹配 `found:false` + `matches:[]`；非法阈值/分类走 envelope（refusal/1） |
| 27 | `config get` | 项目：`schemaVersion,scope,key,value`；全局无 key：`schemaVersion,scope,values`；全局有 key：同项目形态 | `values` = 6 全局键固定序（`user.name,user.lang,preferences.auto_advance,preferences.review_mode,preferences.communication,preferences.confirm_threshold`） | 全局缺省值 `undefined` → JSON `null`（人类显示空串；`DEFAULT_PROFILE` 回填后 6 键通常有值）；项目无 key → envelope `INVALID_ARGUMENT` |
| 28 | `config effective` | 无 key：`schemaVersion,effective`；有 key：`schemaVersion,key,value,source` | `effective` 为受管键映射（键序 = `EFFECTIVE_CONFIG_KEYS`） | 未知 key → envelope `INVALID_ARGUMENT`（refusal/1） |
| 29 | `view list` | `schemaVersion,count,reviews` | `reviews[]` 10 键：`id,op,status,priority,title,filed_by,filed_at,blocking,canAutoFix,autoFixDetail` | `blocking` 缺省 `true`（`!== false`）；`canAutoFix` 缺省 `false`（`=== true`）；`autoFixDetail` 可空；空态 `reviews:[]`；内部异常 JSON `INTERNAL_ERROR`/3（人类 1） |
| 30 | `plan scheme list` | `schemaVersion,stage,count,schemes` | `schemes[]{stage,opId,title,filePath,draft,fill}`；`filePath` 为项目根相对路径 | `stage` 可空（`null` = 全部）；`draft` = flow.json 同 opId 存在 `state:'draft'`（跨阶段全局匹配，见 §13.5）；`fill` 经 `detectFillState`；空态 `schemes:[]` |
| 31 | `flow log` | `schemaVersion,count,entries` | `entries[]{time,agent,action,detail}`；`time` 原始 ISO（不截断）；`agent` 经 `normalizeAgentName` | 空日志与未初始化同形 `entries:[]` + exit 0 |
| 32 | `project overview` | `schemaVersion,project,dirs,stats,entries,techStack` | `project{name,version,description}`；`dirs{src{exists,cli,commands,core,utils},opencode{exists,agents,skills},openfeel{exists,kb,plan,codeReview,bugs}}`；`stats{tsSourceFiles,agentDefs,cliModules,kbEntries,planVersions}`；`entries{available,cli,pkg,build}`；`techStack{runtime,language,cliFramework,validation,config,fileMatch,test}` | `dirs.*` 子项目录不存在时 `null`（`bugs` 为 boolean）；`stats` 恒 number；`entries.available` 反映 `src` 存在性 |
| 33 | `archive <stage>` | `schemaVersion,stage,archivePath,opsCount,reviewsCount,knowledgeExtracts` | `archivePath` 绝对路径；`opsCount/reviewsCount` 为 number；`knowledgeExtracts:string[]` | 阶段不存在 / 未初始化 → envelope `ARCHIVE_FAILED`/refusal/1；异常 → `INTERNAL_ERROR`/internal/3（人类保持 1） |

**登记类别**：恒在键 / 条件出现键 / 文档形态变体三类，测试断言须与类别一致。

## §6 本版新增 / 有意变更登记（全枚举）

1. `instructions --json` 补 `schemaVersion` 首键（C1；既有 9 键相对顺序不变）。
2. `flow archive show --json` 首键重定位为 `schemaVersion`（G-1；既有键相对顺序不变）。
3. `flow health.reconciled` 恒在：`--fix` 时为对账清单，否则 `null`。
4. `flow ops list[].warning` 恒在：`fill==='empty'` 时为提示文案，否则 `null`。
5. legacy 失败载荷末尾追加顶层 `errorKind`（`refusal | internal`；`error` 恒 string、键序不变）。
6. `--version --json` 新出口（op-003；三键文档，见 op-003 契约段）。
7. 全局 `--project` 根选项（op-003；单点注入 chdir）。
8. 退出码 `3`（internal；纯新增）。
9. `flow advance --json` 错误模式开关（op-002；成功输出保持人类文本，非成功出口）。
10. `flow next --json` 新出口（出口 #19；12 键固定序，见 §12.1；REQ P0-1 / P2-2 一致性）。
11. `flow status --json.stages[]` 追加 5 字段（P1-1；既有 5 字段键序/类型不变；见 §12.2）。
12. `flow phases --json` 末位追加 `displayReviewTier` / `effectiveReviewTier`（P2-2；既有 7 键不变；见 §12.3）。
13. **stage-97：14 个读命令 `--json` 新出口（#20~#33）**——`stage status`（单阶段/无参）、`flow recover`、`flow checkpoint list`、`flow log`、`project overview`、`knowledge search|list|index|dedup`、`config get|effective`、`view list`、`plan scheme list`，以及 `archive <stage>`（13 命令面 + `archive <stage>`；详见 §13.1）。
14. **stage-97：`req list --json.requirements[]` 末位追加 `linkedStages` / `progress`**——既有 `RequirementData` 键序不变，仅末位追加；`linkedStages[]{id,phase}`、`progress{done,total}`（见 §13.3）。
15. **stage-97：`flow archive --json`（gate-rejected 与成功）追加 `eligible` / `unfinishedStages` / `blockingReviews`**——legacy 键序与 `error` 类型不变；成功形态 9 键、gate-rejected 形态 9 键（见 §4.2 / §13.3）。

## §7 计数口径

- **成功 JSON 出口 = 33 个**（flow 15 + req 5 + instructions 1 + setup 1 + stage 1 + knowledge 4 + config 2 + view 1 + plan 1 + project 1 + archive 1）。
  - flow 15 = `status,overview,current,metrics,phases,mode,ops list,archive,archive list,archive show,health,next,recover,checkpoint list,log`。
  - 本阶段新增 14 个：#20~#33；`req list` / `flow archive` 为既有出口的键增量（不改变计数）。
- `flow advance --json` 为**错误封装开关**：成功输出保持人类文本，不计入成功出口。
- 注册的 `--json` 选项数为 **34**（33 成功出口 + 1 错误模式开关 `flow advance --json`）；「注册选项数」与「成功出口数」不得混用。
- 三处对齐：源码 `option('--json'` 去重计数 34 / 本文件 33+34 / `test/cli/json-contract.test.ts` 用例 #1~#33。
- **--version --json（§6.6）为顶层成功 JSON 形态（三键），不计入 33 个成功出口、也不计入 34 个注册选项（非 Commander 选项）；验收单列。**

## §8 迁移边界

- **不迁移**（保持人类文本与既有退出码）：`init` / `migrate` / `update` / `model` / `flow review` / `flow stage add` 等人类专用失败路径。
- `flow advance` 成功输出不 JSON 化；仅失败在 JSON 模式下输出 envelope。
- 未注册 `--json` 的命令不接受该选项（Commander 报 unknown option）。
- stage-97 新增 14 个读命令出口（#20~#33）均只新增 JSON 分支；人类输出逐字不变（证据见 `.openfeel/tmp/stage-97/human-output-diff.md`）。

## §9 扩展优先原则 C1~C6 同步清单

| 项 | 决议 | 代码/测试状态 | 其余载体 |
|----|------|---------------|----------|
| **C1** | `instructions --json` 补首键 `schemaVersion` | **已同步**：op-001 命令层 `withSchemaVersion`；核心 loader 零改动（`git status` 空）；`test/commands/instructions.test.ts`（首键+9 键相对序）与 `test/cli/json-contract.test.ts` #17 通过 | **已同步（stage-98）**：README×3 / GETTING_STARTED / docs/commands.md / manual / cli-usage skill；DSH 消费记录与 CHANGELOG 于阶段最终 op（op-003）落地 |
| **C1b** | `flow archive show --json` 首键重定位（G-1） | **已同步**：op-001 命令层 `withSchemaVersion(file)`（`flow.ts:1993`）；既有 6 键相对序不变；`json-contract.test.ts` #10 通过 | **已同步（stage-98）**：docs/commands.md / manual / cli-usage skill；CHANGELOG 于阶段最终 op（op-003）落地 |
| **C2** | `knowledge dedup --project`：**保留本地声明 + 单点解析**（本地 `--project` 声明零修改；根全局 `--project` 并行提供；动作经 `optsWithGlobals()` 读取，路径解析单点） | **已同步**：op-003 实现（`knowledge.ts:182` 本地声明保留；`:176-189` `optsWithGlobals` + `resolveProjectPathForCommand` 单点）；`project-option.test.ts` #13 与 `knowledge.test.ts` 回归通过；实测无 help 重复/解析歧义 | **已同步（stage-98）**：docs/commands.md / README×3 / manual / cli-usage skill |
| **C3** | 条件键 `null` 占位（`flow health.reconciled` / `flow ops list[].warning`） | **已同步**：op-001 实现为**恒在键**；`json-contract.test.ts` #7（`warning` 恒在，empty→string / 其余 null）/ #11（`reconciled` 恒在 null）通过；`req next.candidates` 为条件出现键（#16）；`flow overview` 未初始化形态变体 #2b | **已同步（stage-98）**：GETTING_STARTED / docs/commands.md / cli-usage skill；CHANGELOG 于阶段最终 op（op-003）落地 |
| **C4** | 非 JSON 模式内部错误仅新增退出码 `3`；0/1/2 零改动 | **已同步**：op-002 实现；`error-envelope.test.ts` ①/⑥/⑦、实跑矩阵（10 行 × zh/en，`archive-write-failed`→3、锁超时→`INTERNAL_ERROR`/3）；非 JSON 退出码对照通过 | **已同步（stage-98）**：README×3 / GETTING_STARTED / docs/commands.md / manual / cli-usage skill；DSH 分类断言与 CHANGELOG 于阶段最终 op（op-003）落地 |
| **C5** | legacy `errorKind` 仅末尾追加，`error` 类型与键序零改动 | **已同步**：op-002 实现（`flow archive*` / `req *`）；`error-envelope.test.ts` ① 与契约测试 legacy 段通过；实跑 `08-archive-gate` / `09-archive-write` / `10-req-missing`（zh/en）`error` 恒 string、`errorKind` 为末键 | **已同步（stage-98）**：README×3 / GETTING_STARTED / docs/commands.md / manual / cli-usage skill；DSH 与 CHANGELOG 于阶段最终 op（op-003）落地 |
| **C6** | 全局 `--project` 纯新增根选项；不传时行为逐字不变 | **已同步**：op-003 实现（根选项 + 预扫描 + help 双表）；`project-option.test.ts` 13 项通过；实跑前置/后置/等号/无效路径/缺失值/多值冲突、目标项目语言、`--log-file` 原始 cwd、误判对均通过 | **已同步（stage-98）**：README×3 / docs/commands.md / manual / cli-usage skill |

> 本阶段直接落盘本契约与代码/测试面；其余文档载体由 stage-98 在同一版本内收口，既有消费者不得静默失效。
>
> **REV-95-005 检索备注**：`.openfeel/plan/**` 中「收敛为全局选项」旧口径已清零；`.openfeel/roadmap/v1.2.2.md:31` 仍存一处旧口径（本 op 只读范围外），已登记由 stage-98 文档载体收口同步。


## §10 REQ-001 L80 勘误留痕

- 原文：「保留退出码语义（0 成功 / 1 预期拒绝 / **2 内部错误或用法错误**，按既有约定）」。
- 既有实现与本契约权威口径：**2 = 并发写冲突**（`EXIT_CONCURRENT`）；内部错误 / 用法错误归 `1`（预期拒绝）或本版新增 `3`（internal）。
- 处置：以 §2 的 R-cp-1 为准；**不修改 REQ-001 机读数据**；CHANGELOG 留痕归 stage-98。

## §11 项目锚定边界（`--project`，预登记）

1. **单点注入**：`--project` 经预扫描后单点 `process.chdir` 注入；不传时回退 `process.cwd()`（行为逐字不变）。
2. **语言解析**：chdir 后命令输出语言按**目标项目**解析；根选项描述 / `--help` 语言在 `bin` 阶段先于 chdir 求值，按**原始 cwd**（详见 op-003 实测登记）。
3. **`--log-file` 相对路径**：在 `bin` 的 `installRuntimeLog` 先于 chdir 解析，按**原始 cwd**。
4. **预扫描误判面**：已知取值选项跳过其下一 token（防 `--title --json` / `--encoding --project`）；裸 `--xxx` 取值不保证（如 `--title --json` 中 `--json` 为取值 token 时不被识别为开关）。
5. **前提**：CLI 为一次性进程、单进程单命令；不存在单进程内多项目并发切换的场景承诺。

## §12 调度属性与 `flow next` 冻结语义（v1.2.2-stage-96）

### §12.1 `flow next --json`（出口 #19，stage-96）

- **12 键固定序**：`schemaVersion,stage,phase,phaseLabel,responsibleAgent,workflowMode,reviewTier,effectiveReviewTier,legalNextPhases,suggestedCommand,guards,blockingReviews`；`schemaVersion` 恒为首键、值 `1`。
- **`stage`**：命中的阶段键（双键回退：`normalizeStageId(current.stage)` 优先，其次原始键）；无活跃阶段时保留 `pipeline.current.stage` 原始值（初始化占位 `-` 亦原样输出），原始值为空串时输出 `null`。
- **`phase` / `phaseLabel` / `workflowMode` / `reviewTier` / `effectiveReviewTier`**：无活跃阶段或阶段记录缺失 → 全 `null`（不采用「display 为 null 而 effective 为 full」的混合态）。
- **`responsibleAgent`**：与 `mapPhaseToAgent` 同源（`done → 'none'`）；无活跃阶段 → `'feel'`（显式约定）。
- **`legalNextPhases`**：`getAvailablePhases(stage)`（缺省 tier=`full`）的**直接可达**目标；不是多步 BFS 可达集；顺序 = 转移表遍历序去重。
- **`suggestedCommand`**：`openfeel flow advance --stage <stage> --to <legalNextPhases[0]>`；空集 → `null`。
- **`guards`**：本地化字符串数组；本版不提供 `guardCodes`；顺序固定 ①无活跃阶段 ②`auto_advance=disabled` ③blocking open REV 非空 ④无合法目标 ⑤展示档位 ≠ 生效档位。活跃且健康时 `[]`。
- **`blockingReviews`**：仅当前阶段域（`r.op === stage || r.op.startsWith(stage + '.')`）∧ `blocking !== false` ∧ `status === 'open'`；元素键序 `id,title,priority,op`。
- **只读**：不写盘、不改 phase、不 save、不 appendLog；本版不支持 `--stage`。

### §12.2 `flow status --json.stages[]`（阶段调度属性）

- **10 键固定序**：`id,phase,status,deps,ops,workflowMode,requirementId,reviewTier,effectiveReviewTier,opsSummary`。既有 5 键（`id,phase,status,deps,ops`）键序与类型**逐字不变**，新增 5 键仅追加于其后。
- **`workflowMode`**：逐阶段经 `resolveStageWorkflowMode(id).value` 单点解析（同一 manager 快照；本版不缓存）。
- **`requirementId`**：`stage.requirement_id ?? null`（恒在、可空；存量缺省 ≡ `null`）。
- **`reviewTier`**：`MODE_DERIVED_TIER[workflowMode]`（展示值；`full→full` / `fast→lean` / `general→full`）。
- **`effectiveReviewTier`**：`DEFAULT_EFFECTIVE_REVIEW_TIER`（生效值，恒 `'full'`）。
- **`opsSummary`**：`{ total, byState }`；`total = Object.keys(ops).length = Σ byState`；`byState` **仅含观测到的状态**（零值键不出现），键序 = 状态首次出现序；空 ops → `{ total: 0, byState: {} }`；畸形 op 的 `state` 为空串时按观测键 `''` 计数（与 `collectOpStates` 的 `op?.state ?? ''` 同源）。
- **顶层 4 键不变**：`schemaVersion,pipeline,stages,counts`。

### §12.3 `flow phases --json`（档位消歧）

- **9 键固定序**：`schemaVersion,phases,transitions,advanceAccepted,transitionsDiff,workflowMode,reviewTier,displayReviewTier,effectiveReviewTier`。既有 7 键逐字保留，新增 2 键仅在末位。
- **`reviewTier`**：展示值，保留为兼容别名；**`displayReviewTier`**：与 `reviewTier` 同值（显式名）；**`effectiveReviewTier`**：恒 `'full'`（`flow advance` 缺省生效档位）。
- 三模式取值：`full→full` / `fast→lean` / `general→full`（`reviewTier` 与 `displayReviewTier` 同步取值）。
- **人类输出零变化**：`flow phases` 正文（含档位分节行）逐字不变。

### §12.4 三处档位一致性

`flow next`（§12.1）、`flow status --json.stages[]`（§12.2）、`flow phases --json`（§12.3）的同名档位语义一致：`reviewTier` = 展示档位（由 `workflowMode` 派生），`effectiveReviewTier` = 生效档位（恒 `'full'`）；`flow phases` 另以 `displayReviewTier` 给出展示档位的显式名。

## §13 读命令 JSON 冻结细则（v1.2.2-stage-97）

### §13.1 出口清单与计数

本阶段新增 14 个成功出口（#20~#33），均为只读命令面（`archive <stage>` 除外，它写归档摘要与 flow 日志）。冻结键序见 §5；可执行断言见 `test/cli/json-contract.test.ts` #20~#33。

| # | 出口 | 命令面 |
|:-:|------|--------|
| 20 | `stage status` | `stage status [<stageId>] --json`（单阶段/无参两形态） |
| 21 | `flow recover` | `flow recover --json`（已初始化/未初始化两形态） |
| 22 | `flow checkpoint list` | `flow checkpoint list [stage] --json` |
| 23 | `knowledge search` | `knowledge search <query> [--limit] [--offset] --json` |
| 24 | `knowledge list` | `knowledge list [--type] --json` |
| 25 | `knowledge index` | `knowledge index --json` |
| 26 | `knowledge dedup` | `knowledge dedup [content] [--threshold] [--category] --json` |
| 27 | `config get` | `config get [key] [--global] --json` |
| 28 | `config effective` | `config effective [key] --json` |
| 29 | `view list` | `view list [--op] --json` |
| 30 | `plan scheme list` | `plan scheme list [stage] --json` |
| 31 | `flow log` | `flow log [--last <n>] --json` |
| 32 | `project overview` | `project overview --json` |
| 33 | `archive <stage>` | `archive <stage> --json` |

### §13.2 空态与 no-init 语义（Q6 定稿）

| 命令 | 空态 / no-init 形态 | 退出码 | 人类模式镜像关系 |
|------|--------------------|:--:|------------------|
| `stage status`（无参） | `stages:[]` + `count:0` | 0 | 人类打印「无阶段」（exit 0） |
| `stage status <id>` | 未找到 → envelope `STAGE_NOT_FOUND`/refusal | 1 | 人类 stderr 两行 + exit 1 |
| `flow recover` | `initialized:false` + `phase/currentOp/stageStatus/blockedBy:null` + `pendingTasks:[]` + `stageStats:{}` | 0 | 人类打印未初始化提示（exit 0） |
| `flow checkpoint list` | 未初始化与空集合同形 `stage:null,checkpoints:[],count:0` | 0 | 人类「无快照」（exit 0） |
| `flow log` | 未初始化与空日志同形 `count:0,entries:[]` | 0 | 人类「无日志 / 未初始化」（exit 0） |
| `knowledge search` | `results:[]`（不区分 offset 越界） | 0 | 人类「未找到」+ 偏移提示（exit 0） |
| `knowledge list` | `entries:[]` + `count:0` | 0 | 人类「空」（exit 0） |
| `knowledge index` | `index.md` 缺失 → 4 分类缺省 + `recentUpdates:[]` | 0 | 人类分类概览 + 无更新（exit 0） |
| `knowledge dedup` | 无匹配 → `found:false` + `matches:[]`；无内容 → envelope `INVALID_ARGUMENT` | 0 / 1 | 人类「无相似条目」/ 错误（exit 0 / 1） |
| `config get`（项目） | 无 key → envelope `INVALID_ARGUMENT` | 1 | 人类错误（exit 1） |
| `config get --global`（无 key） | `values` 6 键齐全；`undefined` → JSON `null`（`DEFAULT_PROFILE` 回填后 6 键通常有值；人类模式同值/空串） | 0 | 人类逐行（`undefined` 显示空串） |
| `config effective` | `effective` 恒为受管键映射（含缺省解析值） | 0 | 人类逐行（exit 0） |
| `view list` | `count:0,reviews:[]` | 0 | 人类「空」（exit 0） |
| `plan scheme list` | `schemes:[]` + `count:0`（非法 stage 名同为空） | 0 | 人类「空」（exit 0） |
| `project overview` | 恒输出 5 段结构；目录不存在时子项 `null`（无 `initialized` 键） | 0 | 人类逐段（exit 0） |
| `archive <stage>` | 阶段不存在 / 未初始化 → envelope `ARCHIVE_FAILED` | 1 | 人类 stderr 单行 + exit 1 |

### §13.3 字段形态约定

- **绝对路径**：`stage.status.statusPath`（`resolve(projectPath, ...)`）、`archive <stage>.archivePath`（`join(process.cwd(), '.openfeel', 'log', ...)`）。
- **项目根相对路径**：`plan scheme list.schemes[].filePath`（如 `.openfeel/plan/v1/stage-01/ops/op-001.md`）。
- **`req list` 增量**：`linkedStages[]` 元素 `{id, phase}`（按 flow.json `stages` 声明序）；`progress` = `{done,total}`（`computeRequirementAggregate` 单点派生）。
- **`flow archive` legacy 增量**：gate-rejected 的 `unfinishedStages[]{id,phase}`、`blockingReviews[]{id,title,priority}`；成功形态 `dryRun:boolean`、`eligible:true`、两数组恒 `[]`。键位：legacy 五键序保留，三新键插在 `blockingOpen` 后、`errorKind` 前。
- **`stage.status.fields`**：7 规范键 `execMode,autoAdvance,status,reviewAgent,previousReviewAgent,updatedAt,workflowMode` + `raw`（原始中文键映射）；`tasks[]` 仅三元组 `number,done,description`（不输出 `line`）。

### §13.4 JSON 内部异常口径

- **业务拒绝**：预期拒绝（非法参数、阶段/需求不存在、门禁拒绝）→ envelope `kind=refusal`、exit 1（并发冲突 exit 2）。
- **JSON 内部异常**：命令层捕获的非预期异常，经 `failInternal` 输出 `INTERNAL_ERROR` / `kind=internal` / exit 3（stage-95 §2 的细化；本阶段新增/改造的 13 读命令 + `archive <stage>` 适用）。
- **人类模式**：0/1/2 语义零改动；同类异常仍按既有 `stderr + exit 1`（`view list` / `archive <stage>` 等）。
- **边界例外**：`flow archive` 非 dry-run 的 `mgr.save()` 失败保持既有 stderr + exit 1（legacy 路径，本阶段不改造）。

### §13.5 `plan scheme list.draft` 的 opId 全局匹配（既有口径与风险登记）

- `draft` 标记的既有实现：遍历 **flow.json 全部阶段**的 `ops`，凡 `state === 'draft'` 的 `opId` 进入集合；`schemes[].draft = draftIds.has(s.opId)`。
- **风险**：跨阶段存在同名 `opId`（如各阶段均使用 `op-001`）时，任一阶段存在 draft 会使所有同名 opId 的 scheme 都被标记 `draft`。这是 stage-97 之前的既有口径，本阶段**只登记不改造**；如需阶段域精确匹配，转 stage-98 评估（会改变既有 `draft` 取值，属行为变更）。
- 测试仅断言「存在 draft op 时标记为 true、无 draft 时 false」，不据此反推跨阶段精确语义。

### §13.6 双轨判定例外条款

- **成功输出分支**：可读取命令级 `options.json`（Commander 已注册选项）；`runCli` 与测试内直接 `program.parse` 两条入口均可达。命令层按此分支输出成功文档。
- **失败 envelope 分支**：一律经 `isJsonMode()` 单点判定（由 `runCli` 预扫描置位；命令层不得自行 `setJsonMode`）。
- 测试直接 `parse` 的失败路径须显式 `setJsonMode(true)`，并在 `finally` 调用 `resetJsonModeForTest()`（沿用 `docNext` 范式）。
- 本条款与 op-001 R4、op-002 公共 import 节一致（仅登记，无需改源码）。

## §14 承接 REV 边界登记（v1.2.2-stage-97）

### §14.1 REV-95-008：文件锁等待超时归类

- **归类**：`withFileLock` 等待超时抛**普通 `Error`**（消息 `获取文件锁超时（{timeoutMs}ms）：{lockPath}`），**不是** `FlowConcurrentModificationError`；因此归 `INTERNAL_ERROR` / `kind=internal` / exit `3`（不得误归并发冲突 `FLOW_CONCURRENT_CONFLICT`/2）。
- **命令面**：本阶段新增/改造的 13 个读命令与 `archive <stage>`，在 JSON 模式经 `failInternal` 输出 envelope；人类模式保持既有 exit 1 文案（0/1/2 语义零改动）。
- **边界例外**：`flow archive` 非 dry-run 的 `mgr.save()` 异常保持既有 stderr + exit 1（legacy 路径，本阶段不改造）。
- **覆盖证据**：`test/cli/error-envelope.test.ts` ⑩——单元级（预创建锁文件 + `timeoutMs:5` + `isFlowConcurrentError(err) === false`）与命令级（`FlowManager.prototype.save` 抛出锁超时 → `archive <stage> --json` 输出 `INTERNAL_ERROR`/3）。
- **E2E 证据（v1.2.3-stage-99）**：`test/cli/lock-timeout.test.ts` 以子进程真实触发 `withFileLock` 超时——预置 fresh `.openfeel/tmp/locks/flow.lock` + 测试 env seam（`OPENFEEL_TEST_MODE=1`、`OPENFEEL_TEST_LOCK_TIMEOUT_MS=200`、`OPENFEEL_TEST_LOCK_STALE_MS=60000`）→ `archive <stage> --json` 退出码 3、stdout 单文档 `INTERNAL_ERROR`/`kind=internal`、stderr 不含 envelope；重复 3 次稳定。该 seam **仅测试可用、非公开 CLI 契约**，生产默认 `timeoutMs=5000` / `staleMs=3000` 不变。

### §14.2 REV-95-009：并发冲突退出机制已统一（v1.2.3-stage-99）

- `handleConcurrentConflict` 的 JSON 分支现为：`emitErrorEnvelope` → 置 `process.exitCode = 2` → **return**（由调用方显式 `return` 终止命令），与 `failCli` 机制一致；不再调用 `process.exit(2)`。
- **语义零改动**：stdout 单个 `FLOW_CONCURRENT_CONFLICT`（`kind=refusal`）envelope、exit 2、`detail={expectedRevision,actualRevision}` 均不变；非 JSON 分支 `console.error` + `process.exit(2)` 逐字不变。
- **调用点纪律**：`handleConcurrentConflict` / `handleAddStageError` 返回类型为 `void`；10 个调用点（直接 8 + `handleAddStageError` 调用方 2）均在 handler 后返回，禁止落入通用错误分支（二次输出 / exit 1）。
- **覆盖证据**：`test/cli/error-envelope.test.ts` ⑤/⑤b/⑤c/⑤d/⑤e/⑪（机制 + 命令级无 fallthrough + 非 JSON 不变）与 `test/commands/shared-errors.test.ts`（JSON 置码返回）。

### §14.3 REV-96-008：本阶段零动作

- 转 stage-98（随 ops 归档订正）；本阶段不动作。
