# OpenFeel CLI JSON 输出契约（v1.2.2）

- **权威范围**：`--json` 成功输出（18 个成功出口）与 `--json` 失败输出（错误 envelope / legacy 双形态）。
- **实现锚点**：`src/commands/shared/json-output.ts`（契约助手）、`src/commands/shared/errors.ts` 与 `src/cli/index.ts`（错误层，stage-95 op-002）。
- **维护纪律**：本文件为单一权威；源码实测变更须同批更新本文件与可执行冻结测试 `test/cli/json-contract.test.ts`。
- **不变量**：既有 18 个成功出口**零删除 / 零重排 / 类型零改**；只允许本文件 §6 登记的有意增量。

## §1 单文档规则

1. `--json` 模式下 stdout 恰好输出**一个** JSON 文档；不得混入标题、进度、警告等人类文本（唯一例外：`flow advance --json` 成功输出保持人类文本，见 §7/§8）。
2. `schemaVersion` 恒为**运行时首键**且值为 `1`（构造序必须写成 `{ schemaVersion: 1, ...doc }`，禁止 `{ ...doc, schemaVersion: 1 }`）。
3. 可选字段缺省时使用 `null`；集合字段使用 `[]`；映射字段使用 `{}`；不使用 `undefined`（`JSON.stringify` 会丢键）。
4. 既有字段只增不删、不重排、不改类型；键的语义与取值规则以本文件冻结表为准。
5. JSON 输出与人类可读输出共享同一业务判定，禁止为 JSON 分支复制第二套来源判定。

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
| `ARCHIVE_FAILED` | refusal | 1（stage-97 预留，本阶段不实现） |

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
- 适用：`flow archive` / `flow archive show` / `req` 族既有 `failJson` 路径。

### 4.3 唯一判别规则

```text
typeof doc.error === 'string'  → legacy
否则（object）                 → envelope
```

- 禁止以退出码、命令名或字段存在性做第二套判别。

## §5 18 出口冻结表

> 计数口径：**18 个成功 JSON 出口**。`flow advance --json` 为错误封装开关，不计入（见 §7）。

| # | 出口 | 顶层键序 | 元素/嵌套键（实测） | 条件键/形态 |
|:-:|------|----------|--------------------|------------|
| 1 | `flow status` | `schemaVersion,pipeline,stages,counts` | `pipeline{phase,current{stage,op}}`；`stages[]{id,phase,status,deps,ops}`；`counts{total,done,active}` | 恒在 |
| 2 | `flow overview` | 已初始化：`schemaVersion,phase,current,summary,stages,reviews,health,logs` | `current{stage,op}`；`summary{phase,currentOp,retryCount,stagesCount,opsCount,reviewItemsOpen,recentLogs}`；`stages[]{id,phase,status,opsTotal,opsDone}`；`reviews{open,blockingOpen,nonBlockingOpen,resolved,closed}`；`health{ok,pass,warn,fail}` | **形态变体**：未初始化恰 `schemaVersion,initialized(false)` |
| 3 | `flow current` | `schemaVersion,stage,op,phase` | 均为 string（空态 `''`） | 恒在 |
| 4 | `flow metrics` | `schemaVersion,agents` | `agents[]{agentName,totalRuns,successfulRuns,failedRuns,totalRetries,totalDurationMs,avgDurationMs,successRate}` | 恒在 |
| 5 | `flow phases` | `schemaVersion,phases,transitions,advanceAccepted,transitionsDiff,workflowMode,reviewTier` | `transitionsDiff{missing,extra,changed}` | 恒在 |
| 6 | `flow mode` | `schemaVersion,stage,mode,source,modes` | `modes{full,fast,general}`（各为 transitions 映射） | 恒在 |
| 7 | `flow ops list` | `schemaVersion,ops` | `ops[]{stage,opId,title,state,fill,warning}` | `warning` 恒在，非 empty 时 `null` |
| 8 | `flow archive` | 成功：`schemaVersion,version,stages,reviews,log,dryRun` | `stages/reviews/log` 为 number | 失败为 legacy（见 §4） |
| 9 | `flow archive list` | `schemaVersion,versions` | `versions[]{version,counts}`；`counts{stages,reviews,log}` 或 `null` | `counts` 恒在、可空 |
| 10 | `flow archive show` | **`schemaVersion,version,stages,reviews,log,counts,archived_at`**（本版首键重定位；其余相对序不变） | 嵌套透传归档文件原文 | 失败为 legacy（见 §4） |
| 11 | `flow health` | `schemaVersion,ok,items,reconciled` | `items[]{name,status,detail}` | `reconciled` 恒在，非 `--fix` 时 `null`；`ok:false` 仍为成功文档 + exit 1 |
| 12 | `req list` | `schemaVersion,requirements` | `requirements[]` = `RequirementData`；可选字段（`target_version,priority,owner,claimed_at,body_path,parent_id,workflow_mode`）**条件出现**（读侧宽容不注入） | 条件出现键（依据：`src/core/req/types.ts` 可选标记 + 读侧宽容不注入） |
| 13 | `req show` | `schemaVersion,requirement,stages,parent,children` | `stages:string[]`；`parent:string|null`；`children:string[]` | `parent` 恒在、可空 |
| 14 | `req split` | `schemaVersion,parent,children` | `children` = `RequirementData[]` | 恒在 |
| 15 | `req board` | `schemaVersion,groups` | `groups` 键序 = `REQ_STATUSES`（7 值）；值为数组 | 恒在 |
| 16 | `req next` | `schemaVersion,requirement` | `requirement` 对象或 `null` | **`candidates` 条件出现键**（仅 `limit>1`） |
| 17 | `instructions` | **`schemaVersion,artifact,task,project_context,rules,dependencies,output,instruction,template,unlocks`**（C1） | `artifact{id,change,schema}`；`project_context{tech_stack,workspace,project,config{execution_mode,auto_advance,merge_mode}}`；`template` 可空 | `template` 恒在、可空 |
| 18 | `setup --check` | `schemaVersion,status,cliVersion,deployedVersion` | `deployedVersion` 可空 | `status!=='ok'` 仍为成功文档 + exit 1 |

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

## §7 计数口径

- **成功 JSON 出口 = 18 个**（flow 11 + req 5 + instructions 1 + setup 1）。
- `flow advance --json` 为**错误封装开关**：成功输出保持人类文本，不计入成功出口。
- 本阶段注册的 `--json` 选项数为 **19**（18 成功出口 + 1 错误模式开关）；「注册选项数」与「成功出口数」不得混用。

## §8 迁移边界

- **不迁移**（保持人类文本与既有退出码）：`init` / `migrate` / `update` / `model` / `flow review` / `flow stage add` 等人类专用失败路径。
- `flow advance` 成功输出不 JSON 化；仅失败在 JSON 模式下输出 envelope。
- 未注册 `--json` 的命令不接受该选项（Commander 报 unknown option）。

## §9 扩展优先原则 C1~C6 同步清单

| 项 | 决议 | 代码/测试状态 | 其余载体 |
|----|------|---------------|----------|
| **C1** | `instructions --json` 补首键 `schemaVersion` | **已同步**：op-001 命令层 `withSchemaVersion`；核心 loader 零改动（`git status` 空）；`test/commands/instructions.test.ts`（首键+9 键相对序）与 `test/cli/json-contract.test.ts` #17 通过 | `openfeel-cli-usage` skill / README / DSH 适配器 / CHANGELOG 登记 stage-98 |
| **C1b** | `flow archive show --json` 首键重定位（G-1） | **已同步**：op-001 命令层 `withSchemaVersion(file)`（`flow.ts:1993`）；既有 6 键相对序不变；`json-contract.test.ts` #10 通过 | CLI 文档 / `openfeel-cli-usage` skill 示例登记 stage-98 |
| **C2** | `knowledge dedup --project`：**保留本地声明 + 单点解析**（本地 `--project` 声明零修改；根全局 `--project` 并行提供；动作经 `optsWithGlobals()` 读取，路径解析单点） | **已同步**：op-003 实现（`knowledge.ts:182` 本地声明保留；`:176-189` `optsWithGlobals` + `resolveProjectPathForCommand` 单点）；`project-option.test.ts` #13 与 `knowledge.test.ts` 回归通过；实测无 help 重复/解析歧义 | `docs/commands.md` / manual / skill 的全局 `--project` 说明登记 stage-98 |
| **C3** | 条件键 `null` 占位（`flow health.reconciled` / `flow ops list[].warning`） | **已同步**：op-001 实现为**恒在键**；`json-contract.test.ts` #7（`warning` 恒在，empty→string / 其余 null）/ #11（`reconciled` 恒在 null）通过；`req next.candidates` 为条件出现键（#16）；`flow overview` 未初始化形态变体 #2b | skill 示例；CHANGELOG（若未来豁免） |
| **C4** | 非 JSON 模式内部错误仅新增退出码 `3`；0/1/2 零改动 | **已同步**：op-002 实现；`error-envelope.test.ts` ①/⑥/⑦、实跑矩阵（10 行 × zh/en，`archive-write-failed`→3、锁超时→`INTERNAL_ERROR`/3）；非 JSON 退出码对照通过 | CHANGELOG / DSH 分类断言 stage-98 |
| **C5** | legacy `errorKind` 仅末尾追加，`error` 类型与键序零改动 | **已同步**：op-002 实现（`flow archive*` / `req *`）；`error-envelope.test.ts` ① 与契约测试 legacy 段通过；实跑 `08-archive-gate` / `09-archive-write` / `10-req-missing`（zh/en）`error` 恒 string、`errorKind` 为末键 | CHANGELOG / DSH 可改用 `errorKind`（stage-98） |
| **C6** | 全局 `--project` 纯新增根选项；不传时行为逐字不变 | **已同步**：op-003 实现（根选项 + 预扫描 + help 双表）；`project-option.test.ts` 13 项通过；实跑前置/后置/等号/无效路径/缺失值/多值冲突、目标项目语言、`--log-file` 原始 cwd、误判对均通过 | `docs/commands.md` / manual / skill / README 选项表 stage-98 |

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
