# OpenFeel CLI JSON 输出契约（v1.5.6）

- **权威范围**：`--json` 成功输出（41 个成功出口）与 `--json` 失败输出（错误 envelope / legacy 双形态）。
- **实现锚点**：`src/commands/shared/json-output.ts`（契约助手）、`src/commands/shared/errors.ts` 与 `src/cli/index.ts`（错误层，stage-95 op-002）。
- **维护纪律**：本文件为单一权威；源码实测变更须同批更新本文件与可执行冻结测试 `test/cli/json-contract.test.ts`。§6 登记的是有意增量清单，未登记即视为破坏。
- **v1.5.6-stage-115 收口**：新增出口 **#41 `lint req`**（需求正文命令名校验）；计数升为 **41 成功出口 / 42 注册 `--json` 选项**；`target:'req'` 比其他 lint 出口多 `suspects` / `unknownCount` / `suspectCount` 三个键（A/B 分级），详见 §16。
- **v1.2.4-stage-100 收口**：DSH ACTION-GUIDE A1~A5 交付——A1 `archive <stage>` 覆盖保护（`ARCHIVE_EXISTS`）+ A2~A4 新增 7 个成功出口（#34~#40）+ A5 `config get --all` 扩展。计数升级为 **40 成功出口 / 41 注册 `--json` 选项**；§15 为本版细则。
- **v1.2.3-stage-99 收口**：并发冲突 JSON 退出机制已与 `failCli` 统一（§14.2）；§14.1 补锁超时 E2E 证据；当时 33 成功出口 / 34 注册选项与退出码语义零改动。
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
| `ARCHIVE_EXISTS` | refusal | 1（v1.2.4 A1：目标归档文件已存在且未显式 `--force`；零写盘） |

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

## §5 41 出口冻结表

> 计数口径：**41 个成功 JSON 出口**（#1~#41）。`flow advance --json` 为错误封装开关，不计入（见 §7）。

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
| 27 | `config get` | 项目：`schemaVersion,scope,key,value`；项目 `--all`：`schemaVersion,scope,defaults`；全局无 key：`schemaVersion,scope,values`；全局有 key：同项目形态 | `values` = 6 全局键固定序（`user.name,user.lang,preferences.auto_advance,preferences.review_mode,preferences.communication,preferences.confirm_threshold`）；`defaults` = 4 项目键固定序（`execution_mode,auto_advance,merge_mode,workflow_mode`，取自 `resolveConfigDefaults`） | 全局缺省值 `undefined` → JSON `null`（人类显示空串；`DEFAULT_PROFILE` 回填后 6 键通常有值）；项目无 key 且无 `--all` → envelope `INVALID_ARGUMENT`（`key-required`）；`--all`+`--global` → `all-global-conflict`；`--all`+key → `all-with-key` |
| 28 | `config effective` | 无 key：`schemaVersion,effective`；有 key：`schemaVersion,key,value,source` | `effective` 为受管键映射（键序 = `EFFECTIVE_CONFIG_KEYS`） | 未知 key → envelope `INVALID_ARGUMENT`（refusal/1） |
| 29 | `view list` | `schemaVersion,count,reviews` | `reviews[]` 10 键：`id,op,status,priority,title,filed_by,filed_at,blocking,canAutoFix,autoFixDetail` | `blocking` 缺省 `true`（`!== false`）；`canAutoFix` 缺省 `false`（`=== true`）；`autoFixDetail` 可空；空态 `reviews:[]`；内部异常 JSON `INTERNAL_ERROR`/3（人类 1） |
| 30 | `plan scheme list` | `schemaVersion,stage,count,schemes` | `schemes[]{stage,opId,title,filePath,draft,fill}`；`filePath` 为项目根相对路径 | `stage` 可空（`null` = 全部）；`draft` = flow.json 同 opId 存在 `state:'draft'`（跨阶段全局匹配，见 §13.5）；`fill` 经 `detectFillState`；空态 `schemes:[]` |
| 31 | `flow log` | `schemaVersion,count,entries` | `entries[]{time,agent,action,detail}`；`time` 原始 ISO（不截断）；`agent` 经 `normalizeAgentName` | 空日志与未初始化同形 `entries:[]` + exit 0 |
| 32 | `project overview` | `schemaVersion,project,dirs,stats,entries,techStack` | `project{name,version,description}`；`dirs{src{exists,cli,commands,core,utils},opencode{exists,agents,skills},openfeel{exists,kb,plan,codeReview,bugs}}`；`stats{tsSourceFiles,agentDefs,cliModules,kbEntries,planVersions}`；`entries{available,cli,pkg,build}`；`techStack{runtime,language,cliFramework,validation,config,fileMatch,test}` | `dirs.*` 子项目录不存在时 `null`（`bugs` 为 boolean）；`stats` 恒 number；`entries.available` 反映 `src` 存在性 |
| 33 | `archive <stage>` | `schemaVersion,stage,archivePath,opsCount,reviewsCount,knowledgeExtracts` | `archivePath` 绝对路径；`opsCount/reviewsCount` 为 number；`knowledgeExtracts:string[]` | 阶段不存在 / 未初始化 → envelope `ARCHIVE_FAILED`/refusal/1；目标归档已存在且未 `--force` → `ARCHIVE_EXISTS`/refusal/1（零写盘）；异常 → `INTERNAL_ERROR`/internal/3（人类保持 1）；`--force` 不新增返回键 |
| 34 | `plan stage list` | `schemaVersion,stages,count` | `stages[]{id,phase,status,deps,workflowMode,opsTotal,opsDone}`；`phase/status` 可空，`deps` 恒数组 | flow.json 注册阶段（声明序）；`workflowMode` 经 `resolveStageWorkflowMode`；空态/未初始化 `stages:[]` + `count:0` + exit 0；人类输出保持计划目录清单（不同视图） |
| 35 | `model list` | `schemaVersion,scope,agents` | `agents[]{agent,provider,model,source}`；`scope` 回显 `--scope`（未指定 `null`） | `provider/model` 按生效值首个 `/` 切分（无 `/` → `provider:null`）；`source` = 生效层（default > project > global），无值 `null` |
| 36 | `model get` | `schemaVersion,scope,agent,provider,model,source` | 单 agent 六键；派生规则同 #35 | 非法 scope → `INVALID_ARGUMENT`/refusal/1；人类输出不变 |
| 37 | `flow retry` | `schemaVersion,op,attempts,maxAttempts,exhausted,state` | `attempts = getRetryCount(op)`；`maxAttempts = op.max_attempts`；`exhausted = attempts >= maxAttempts` | 只读；未初始化 → `NO_INIT`；阶段不存在 → `STAGE_NOT_FOUND`；非法 opId / op 不存在 → `INVALID_ARGUMENT`（detail.reason） |
| 38 | `lint i18n` | `schemaVersion,target,ok,issues` | `target:"i18n"`；`issues[]{path,message}`；`path ∈ {src/core/i18n-data/zh-CN.ts, src/core/i18n-data/en.ts}` | `ok = issues.length === 0`；`ok:false` 仍为成功文档 + exit 1；人类输出逐字不变 |
| 39 | `lint kb` | `schemaVersion,target,ok,issues` | `target:"kb"`；`issues[]{path,message}`；`path = .openfeel/kb/<file>`（项目根相对） | 无 kb 目录 → `ok:true,issues:[]` + exit 0；过期引用 → `ok:false` + exit 1 |
| 40 | `roadmap show` | `schemaVersion,version,milestones` | `milestones[]{title,theme,stage,deliverable}`（表头驱动；兼容 3/4 列，缺列 `null`） | 不传版本 → `version:null,milestones:[]` + exit 0；版本不存在 → `INVALID_ARGUMENT`/refusal/1；人类输出逐字不变 |
| 41 | `lint req` | `schemaVersion,target,ok,issues,suspects,unknownCount,suspectCount` | `target:"req"`；`issues[]{path,message}`（A 类 unknown-command）；`suspects[]{path,message}`（B 类 suspect-command-group）；两个计数为 number；`path = .openfeel/requirements/<file>` | `ok = (issues.length === 0)`（与 #38/#39 一致）；`suspects` 不参与 `ok` / 退出码；无需求目录 → `ok:true,issues:[],suspects:[]` + exit 0；A 类 → `ok:false` + exit 1；抑制行数 / 未闭合警告**不进 JSON**（见 §16） |

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
16. **v1.2.4-stage-100：A1~A5 有意增量（#34~#40 + 2 项既有出口扩展）**——A1 `archive <stage>` 增 `ARCHIVE_EXISTS` 拒绝（错误码第 13 行）与 `--force`（出口 #33 键集不变）；A2~A4 新增 #34~#40 七个出口；A5 `config get --all` 扩展 #27（项目模式新增 `defaults` 形态）。既有出口字段键集/键序/类型零改动；详见 §15。
17. **v1.5.6-stage-115：新增出口 #41 `lint req`**——`target:'req'` 比其他 lint 出口多出 `suspects` 与两个计数键（共 3 个新键：`suspects` / `unknownCount` / `suspectCount`），理由：A 类阻塞 / B 类 advisory 必须可分，塞进单一 `issues` 会破坏 `ok` 不变量。`ok = issues.length === 0` 与 #38/#39 完全一致；既有 40 个出口字段键集/键序/类型零改动；详见 §16。

## §7 计数口径

- **成功 JSON 出口 = 41 个**（flow 16 + req 5 + instructions 1 + setup 1 + stage 1 + knowledge 4 + config 2 + view 1 + plan 2 + project 1 + archive 1 + model 2 + lint 3 + roadmap 1）。
  - flow 16 = `status,overview,current,metrics,phases,mode,ops list,archive,archive list,archive show,health,next,recover,checkpoint list,log,retry`。
  - v1.2.4 新增 7 个：#34 `plan stage list`、#35 `model list`、#36 `model get`、#37 `flow retry`、#38 `lint i18n`、#39 `lint kb`、#40 `roadmap show`；`config get --all`（#27 扩展）与 `archive --force`（#33 选项扩展）不计新增出口。
  - v1.5.6 新增 1 个：#41 `lint req`（lint 分项 2 → 3）。
- `flow advance --json` 为**错误封装开关**：成功输出保持人类文本，不计入成功出口。
- 注册的 `--json` 选项数为 **42**（41 成功出口 + 1 错误模式开关 `flow advance --json`）；「注册选项数」与「成功出口数」不得混用。`lint i18n` / `lint kb` / `lint req` 为三个独立 Commander 子命令，各计 1。
- 三处对齐：源码 `option('--json'` 去重计数 42 / 本文件 41+42 / `test/cli/json-contract.test.ts` 用例 #1~#41；`test/commands/knowledge.test.ts` 计数用例 = 42/41。
- **--version --json（§6.6）为顶层成功 JSON 形态（三键），不计入 41 个成功出口、也不计入 42 个注册选项（非 Commander 选项）；验收单列。**

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

## §15 v1.2.4-stage-100 细则（DSH ACTION-GUIDE A1~A5）

### §15.1 A1：`archive <stage> [--json] [--force]` 覆盖保护

- **判定顺序**：`FlowManager` 只读加载 → 阶段解析（短名归一 + 双键回退）→ **目标文件存在性检查** → 计算摘要 → 写归档 → `appendLog` → `save()` → KB 同步。
- **拒绝条件**：`.openfeel/log/archive-{stageName}.md` 已存在且未传 `force` → `ARCHIVE_EXISTS` / `kind=refusal` / exit 1；JSON `detail={stage,archivePath}`；人类 stderr 单行 + exit 1。
- **零写盘保证**：检查点位于 `mkdirSync` / `atomicWriteFileSync` / `appendLog` / `save()` / `initKnowledgeBase` / `addKnowledgeEntry` 之前。主判据 = 归档文件内容 SHA-256 + `flow.json` revision + `log[]` 长度 + KB 条目数；`mtime` 仅辅助（测试在并发/时间粒度下稳定）。
- **`--force` 语义**：仅绕过归档文件覆盖保护；成功出口 #33 六键不变；重复归档可能重复写 KB 条目，去重由 `knowledge dedup` 承担。
- **已知边界（归档文件级，非阶段级）**：
  - `openfeel archive v1.2.0-stage-78` → `.openfeel/log/archive-v1.2.0-stage-78.md`
  - `openfeel archive stage-78` → `.openfeel/log/archive-stage-78.md`
  - 两者派生**不同目标文件**，互不触发覆盖保护；保护只针对本次命令的写入目标文件。

### §15.2 A2：`plan stage list --json`

- **数据源**：`FlowManager.getData().stages`（flow.json 注册阶段，声明序）；**不枚举计划目录**。
- `phases/status` 缺省 `null`；`deps = Array.isArray(stage.deps) ? stage.deps : []`；`workflowMode = resolveStageWorkflowMode(id).value`；`opsTotal = Object.keys(stage.ops ?? {}).length`；`opsDone = values.filter(state === 'done').length`。
- **人类输出**：保持 `listStages()` 目录清单逐字不变；JSON 是「注册阶段调度视图」，两者为不同视图。

### §15.3 A3：`model list|get --json`

- `scope` 回显 `--scope`，未指定 `null`；指定 scope 时取 `byScope[scope]`，否则取 `effective`（default > project > global）。
- `provider`/`model`：有效值首个 `/` 之前为 provider、之后为 model；无 `/` → `provider:null`、`model` 为原值；无有效值 → 三者均 `null`。
- `source`：指定 scope 且值非空 → 该 scope；未指定 → 解析链首个非空层；无值 → `null`。

### §15.4 A4：三命令面

- **`flow retry`**：`attempts = getRetryCount(op)`、`maxAttempts = op.max_attempts`、`exhausted = attempts >= maxAttempts`、`state = op.state`；只读零写盘。
- **`lint i18n|kb`**：`ok = issues.length === 0`；`ok:false` 仍输出成功文档并保持 `process.exitCode = 1` 门禁语义；结构化 issues 与人类输出同源（人类行逐字不变）；`lint kb` 无目录 → `ok:true,issues:[]`。（`lint req` 见 §16，历史小节口径不改。）
- **`roadmap show`**：`version` = 归一化版本（去前导 `v`）；不传版本 → `version:null,milestones:[]`；表头驱动解析 `## 里程碑` 表格（兼容 3/4 列；缺列 `null`）；无小节/占位文案 → `milestones:[]`；版本不存在 → `INVALID_ARGUMENT`/refusal/1。

### §15.5 A5：`config get --all --json`

- 形态：`{schemaVersion,scope:"project",defaults:{execution_mode,auto_advance,merge_mode,workflow_mode}}`（`resolveConfigDefaults` 四键固定序，缺失/非法逐键回退 `DEFAULT_CONFIG`）。
- **仅项目模式**：`--all` + `--global` → `INVALID_ARGUMENT`（`all-global-conflict`）；`--all` + 位置 key → `INVALID_ARGUMENT`（`all-with-key`）。
- **不再 `key-required`**：项目模式无 key 且带 `--all` → 成功文档 exit 0；不带 `--all` 的既有行为逐字不变（人类输出四行 `key: value` 仅出现在 `--all`）。

## §16 v1.5.6-stage-115 细则（`lint req`，出口 #41）

**首段（契约差异声明）**：`target:'req'` 比其他 lint 出口**多出 `suspects` 与两个计数键（共 3 个新键：`suspects` / `unknownCount` / `suspectCount`）**，理由：**A/B 分级**——A 类阻塞驱动 `ok` 与退出码，B 类 advisory 仅提示；两级语义无法塞进单一 `issues` 数组而不破坏 `ok` 不变量。本出口无历史消费者，新增键不受「只增不改」约束，但必须在此显式登记。

### §16.1 顶层键序（恒 7 键）

`schemaVersion,target,ok,issues,suspects,unknownCount,suspectCount`（`schemaVersion` 恒首；`target` 恒 `"req"`）。
`issues[]` / `suspects[]` 元素键序恒 `path,message`（复用 `LintIssue` 形状）；空集恒 `[]`（非 `null`）；两个计数恒 number。

### §16.2 A / B 判定与 `ok`

- **A 类**（`unknown-command`，进 `issues`）：剥 `openfeel` 前缀后，首 token 是根命令、但逐 token 下降在某处断掉，**且断点父命令未声明位置参数** → **阻塞**；message 报「无法解析为命令路径（断在 `<父命令完整内部路径>`）」，如断在 `flow` 或 `flow.stage`。
- **B 类**（`suspect-command-group`，进 `suspects`）有两种来源 → **advisory**，不影响 `ok` / 退出码：
  1. 首 token **非**根命令、串长 ≥2、且**尾 token** 命中全树命令名 → message「疑似未知命令组（尾命令 `<tail>` 已注册）」（`op create` / `npm run lint`）；
  2. **参数起点歧义**：在声明了位置参数的节点上，下一个 token 既不匹配子命令、又命中全树命令名 → message「疑似把参数写成命令名（`<token>` 是已注册命令名，命令路径无法确定）」（`archive create` / `knowledge search lint`）。
- **通过**：逐 token 全部命中（允许停在父命令，如 `stage` / `plan scheme` / `flow review`）；或到达**声明位置参数的节点**后，剩余 token 均非命令名（视为参数值：`stage set stage-01` / `config get workflow_mode` / `archive v1.2.0`）。
- **静默**：单 token 且非根命令（`plan_review` / `stage-114`），或两端都不满足 A/B 条件。
- **`ok = (issues.length === 0)`** —— 与 #38/#39（`lint i18n` / `lint kb`）语义完全一致；**`suspects` 不参与 `ok`、不参与退出码**。
- **退化边界（已知并接受）**：`flwo stage set` → B（exit 0）；`stagee deps` → 完全静默；`npm run lint` / `git status` 这类外部工具命令 → B 面噪声（故 B 类永不阻塞）；**父命令声明位置参数时，命中命令名的参数值降级为 suspect**（`openfeel archive create` → B 而非 A，因为 `archive <stage>` 的参数值恰好是命令名，路径无法确定）；反过来，参数值本身是命令名时也会被提示（`req add add`），属 B 面噪声、不阻塞。
- **已知边界（刻意的取舍，**不修**）**：当父命令**同时声明位置参数且有子命令**时（`flow.archive` 1 参数 + 2 子命令、`migrate` 1 参数 + 1 子命令），子命令优先；因此**在值位上拼错的子命令会静默通过**——`flow archive lst` / `migrate rollbak` 被判为「参数值」（A=0/B=0），与合法的 `flow archive v1.2.0` 无法区分。**原因**：位置参数是任意字符串，解析器没有形态学依据判定「这看起来像命令名」。要让它报错只能改判定（把「参数位 + 形近子命令」也报 A），那会把正常参数值（版本号/ID/自由文本）大量误伤——故登记为已知边界，并用测试锁住当前行为（core `T17` / commands `C13`）。

### §16.3 候选识别与前缀 token 串

- 载体：行内反引号 `` `…` ``（不跨行）；span 两端 `trim` 后按 `\s+` 切分。
- **前缀 token 串**：从第一个 token 起连续收集匹配 `^[a-z][a-z0-9_-]*$` 的 token（**允许下划线**），首个不匹配即停；对**已收集前缀**判定（**不得**「整 span 含不合形态 token 就跳过」——否则 `flow review_add` / `flow stats --json` 永远免检）。
- **参数起点（REV-020）**：解析按「子命令优先」——当前节点的子命令里有该 token 就下降；否则若当前节点 `argCount > 0`（commander `registeredArguments.length`），**后续 token 视为位置参数**，解析结束：命中命令名 → 降级 suspect，否则 → 通过。
- 串长 `1 ≤ n ≤ 4`；`n > 4` 整体跳过。
- 剥前缀：仅首 token 严格等于 `openfeel` 时剥**一次**。
- 扫描面：仅 `.openfeel/requirements/*.md`（一层、不递归、不跟随符号链接、按文件名升序）；**不扫** `docs/**` / `.openfeel/flow-archive/**` / `.openfeel/plan/**` / `.openfeel/log/**` / `.openfeel/kb/**`。

### §16.4 抑制两档 + 使用约束

- 行内 `<!-- lint-req:ignore -->`：跳过该行全部候选；区间 `<!-- lint-req:ignore-start -->` … `<!-- lint-req:ignore-end -->`：跳过区间内全部候选（**区间起行**与**区间内的止行**自身亦不提取候选；**孤 `ignore-end` 行**按普通行扫描、候选照报，见 §16.5）。
- 标记匹配对象是**剥离行内代码后的文本** ⇒ 写在反引号里的标记写法不生效；标记**区分大小写**。
- 未闭合 `ignore-start` → 区间延续到文件末尾（EOF），**不静默**（见 §16.5）；孤 `ignore-end` 不报错、不改变区间状态（该行按普通行扫描）。
- 状态机（REV-020）：嵌套 `ignore-start` **不覆盖**外层起行（不累加深度）；**同行 start+end 自闭合**不开启区间，也不会提前关闭已开启的外层区间。
- **使用约束**：只允许用于「正文按定义必须引用**错误命令名**」的场景（bug 例证 / 历史差异记录 / 错误示例）；**不得**用来掩盖正文里的错误命令名（那属于改正正文）。每处标记须在同行或同节说明理由，并配反向验证。

### §16.5 不新增 JSON 键的部分（REV-011）

- **抑制行数**（`suppressedLines`）只进**人类输出**首行（`抑制 {n} 行`），让抑制量可见。
  **口径**（REV-020）：计入「抑制标记行（起 / 止 / 行内）+ 区间内内容行」；**孤 `ignore-end` 行不计**（它什么也没抑制，按普通行扫描）。
- **未闭合区间**（`unclosedRegions`）每处一行 **stderr** 警告（`lint.req.unclosedRegionWarn`），**不改退出码**、**不进 JSON**。⇒ JSON 键集**恒 7 键**。
- `--json` 模式 stdout **恰好一个** JSON 文档；未闭合区间的 stderr 行不是错误信封、不影响退出码。

### §16.6 排序 / 退出码 / `path` / 文案

- **排序**：`issues` 与 `suspects` **各自独立**升序——`path` 字节序 → `line` 升序 → 同行出现序；两类不混排。
- **退出码**：仅 A 类 → `process.exitCode = 1`；只有 B 类 / 无 issue / 目录缺失 → 0；不新增错误码（复用 exit 1）、不提供 `--fix` / `--warn-only` / `--no-fail`。
- **`path`**：项目根相对路径 `.openfeel/requirements/<file>`（恒正斜杠），与 `lint kb` 的 `.openfeel/kb/<file>` 同风格。
- **文案**：`message` 与人类输出**同一份字符串**（人类行 = `'  ' + path + ' ' + message`），不含绝对路径 / 反斜杠 / **不含任何近似纠错建议**（A 类只报「无法解析为命令路径 + 断点位置」）。
- **无需求目录 / 无 `*.md`** → `files:0,candidates:0,issues:[],suspects:[]` → `ok:true` + exit 0（镜像 `lint kb` 的「无目录即通过」）。
