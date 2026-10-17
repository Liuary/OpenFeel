# 需求核心引擎模块（req）

> 模块文档，由归档官在归档时维护。对应源码：`src/core/req/`（引擎面）+ `src/commands/req.ts`（命令面，v1.2.0-stage-82）。

## 职责

需求流转系统（requirement lifecycle system）的**引擎面**——需求层类型与常量的**单一来源**、需求条目在 `flow.json` 的存储字段、需求 CRUD / 认领 / 状态流转原语、ID 分配与正文文件原语；另含**聚合投影与对称回写**（`aggregate.ts`，v1.2.0-stage-83）。需求层为「**排期与调度层**」（`版本 roadmap → 需求 REQ-NNN → 计划 stage → 方案 op` 四层中的第二层）；**工序单一事实源仍是阶段 `phase`**，需求状态为显式粗粒度字段（**聚合回写**见「聚合投影与对称回写」节）。

## 模块分层与文件

| 文件 | 职责 | 依赖 |
|------|------|------|
| `types.ts` | 类型与常量**单一来源**（叶子模块、**零 import**）：`REQ_STATUSES`（7 值）+ `RequirementStatus`（自常量派生）+ `REQ_PRIORITIES`（三档）+ `RequirementPriority` + `REQ_ID_PATTERN`（`/^REQ-(\d{3,})$/`，含数字捕获组、非全局标志）+ `RequirementData`（**12 字段**，stage-87 增 `parent_id?`、v1.2.1-stage-90 增 `workflow_mode?`） | 无 |
| `requirement-ops.ts` | 需求原语单点（**纯内存、零写盘、审计内嵌**）：读取 / 过滤 / ID 分配 / 写路径 / 共用谓词 / 状态流转单点表 | `import type { FlowData }`（仅类型，编译期擦除）+ `types.js` |
| `body-file.ts` | 正文路径单点 + 骨架机械铺（`REQ-NNN.md`） | `node:path` / `node:fs` / `../fs/atomic-write.js` / `types.js`（**禁** `process.cwd` / `homedir`） |
| `aggregate.ts` | **聚合投影与对称回写**（v1.2.0-stage-83，**纯函数/纯内存、无 IO**）：`computeRequirementAggregate`（阶段 phase → 需求状态投影；done 判定**委托** `allLinkedStagesDone`）/ `resolveRequirementStatusForStage` / `syncRequirementStatus`（回写入口，返回受影响需求 ID 列表）/ `AUTO_DONE_PRECONDITION`（前置集单点常量）/ `requirementHealthItems`（health 对账项） | `import type { FlowData }` + `allLinkedStagesDone`（`requirement-ops.js`）+ `types.js` + `../i18n.js`（对账文案） |

> **模式边界（v1.2.1-stage-90 supersede 旧「正交」口径）**：需求层**可携带**模式属性 `workflow_mode?`（受控串——字段声明 / `PATCH_WHITELIST` / 值域校验合法）；模式**仅经单点解析器**消费（`FlowManager.resolveStageWorkflowMode`）且**不入聚合 / 不入 done 门 / 不入对账**。`src/core/req/**` 与 `src/commands/req.ts` 仍**禁** `resolveStageWorkflowMode`（**新禁止串**，禁第二份解析）/ `PIPELINE_PHASES` / `getValidTargets` / `flow-archive` / `process.cwd` / `homedir`；`body-file.ts`（人读骨架）对 `workflow_mode` **仍零命中**，聚合面 `aggregate.ts` **仍零命中**。以 `test/core/req.test.ts`（C1/C2）与 `test/commands/req.test.ts`（C3）显式改写后的断言固化（受控串分文件判类 + 新禁止串 + 正控扩容 + `NEEDLES.length` 锁定）。

## 核心数据

### `RequirementData`（12 字段）

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | `REQ-NNN`（max+1 不回收；`REQ_ID_PATTERN`） |
| `title` | `string` | 需求标题（人读简明描述；非空） |
| `status` | `RequirementStatus` | 显式粗粒度状态；新建恒 `draft` |
| `target_version?` | `string` | 预估版本（如 `v1.3.0`） |
| `priority?` | `RequirementPriority` | 优先级 `P0`/`P1`/`P2` |
| `owner?` | `string` | 认领人（claim 写入） |
| `claimed_at?` | `string` | 认领时间 ISO 8601（与 `owner` 同批写入/清除） |
| `created_at` | `string` | 创建时间 ISO 8601 |
| `updated_at` | `string` | 最近更新时间（**仅实际变更时刷新**，单次赋值纪律） |
| `body_path?` | `string` | 正文相对路径（POSIX 分隔符，如 `.openfeel/requirements/REQ-001.md`） |
| `parent_id?` | `string` | **拆分来源父需求 ID**（v1.2.1-stage-87 新增；**仅溯源**——不参与聚合判定 / 不参与 done 门 / 无父子级联 / 不进 `PATCH_WHITELIST`；**读侧宽容不 load 补齐**） |
| `workflow_mode?` | `WorkflowMode` | **需求级模式属性**（v1.2.1-stage-90 新增；值域 `full`/`fast`/`general`，权威 = `WORKFLOW_MODES` 单源）。**仅调度属性**——不入聚合 / 不入 done 门 / 不入对账；**读侧宽容 + 零注入**；`import type` 保「零运行时 import」。经**单点解析**作用于其关联阶段（链序 `status.md > 需求级 > config > profile > builtin`）；`general` **仅需求级合法**（见下「需求级模式」节） |

**值域常量（单一来源，命令层须从此派生、禁硬编码）**：`REQ_STATUSES` = `draft`/`scheduled`/`in_progress`/`done`/`blocked`/`cancelled`/`rejected`（7 值）；`REQ_PRIORITIES` = `P0`/`P1`/`P2`。**无 `source`、无 `reason`**（REV-81-005；`reason` 属 Q4-schema 未来增量可选字段，本版不冻结）。

### 存储字段（`flow-manager.ts` 最小追加）

- `FlowData.requirements?: RequirementData[]`——**顶层可选**（类比 `reviews`）；**读侧宽容**：`load()` **不补齐**，读侧 `getRequirements` 派生 `?? []`、写侧 `addRequirement` 内 `??= []` 兜底（对齐 REV-78-015 / stage-79 移除 `archived_versions` load 补齐的方向；避免任意 `load→save` 向存量 `flow.json` 注入 `requirements: []`）。
- `StageData.requirement_id?: string | null`——需求↔阶段 **1:N** 的「阶段侧单值」；缺省 ≡ `null`（存量不迁移）。

## 核心 API（`requirement-ops.ts`）

| 原语 | 签名（要点） | 说明 |
|------|--------------|------|
| `getRequirements(data)` | `(FlowData) => RequirementData[]` | 读侧宽容派生 `?? []`；返回**数组 + 元素浅副本**（防外部直改内存） |
| `getRequirement(data, id)` | `(FlowData, string) => RequirementData \| null` | 命中返回浅副本、未命中 `null` |
| `listRequirements(data, filter?)` | `filter?: { status?, target_version?, owner? }` | 多条件 AND；命名统一 `target_version` |
| `nextRequirementId(data)` | `(FlowData) => string` | 现存 id 数字部分 **max+1**；异常 id 跳过不崩；三位起补零不截断 |
| `addRequirement(data, input)` | `input: { title, target_version?, priority?, workflow_mode? }` | 新建恒 `status:'draft'`；返回**本体**（调用方继续设 `body_path`）；**唯一抛错原语**（空 title / 非法 priority / 空串 target_version / **非法 `workflow_mode`**〔v1.2.1-stage-90，运行时读 `WORKFLOW_MODES` 单源校验〕— 构造期入参校验） |
| `claimRequirement(data, id, owner)` | `=> RequirementOpResult` | 占用校验：`owner` 空 → `invalid_field`；不存在 → `not_found`；终态 → `invalid_status`；他人占用 → `already_claimed`（**数据零变更**）；同 owner 幂等 `{ok:true,changed:false}` |
| `releaseRequirement(data, id)` | `=> RequirementOpResult` | 无占用者 → **no-op 成功**（不刷 `updated_at` / 不写审计）；有占用者 → 清除 `owner`+`claimed_at` |
| `updateRequirement(data, id, patch)` | `patch: { status?, title?, target_version?, priority?, workflow_mode? }` | 白名单外键 → `invalid_field`；校验失败**整 patch 零变更**；**raw find 改本体**（禁经 `getRequirement`，防副本陷阱）；`updated_at` 单次赋值；**`workflow_mode?`**（v1.2.1-stage-90：`PATCH_WHITELIST` 增键 + 引擎层值域校验） |
| `advanceRequirement(data, id, to)` | `=> RequirementOpResult` | **零第二套**——委托 `updateRequirement(data, id, { status: to })`（同表同门同审计） |
| `linkRequirement(data, stageId, requirementId)` | `requirementId: string \| null`（`null` = 解绑） | 阶段不存在 → `stage_not_found`；需求不存在 → `not_found`；终态需求 → `invalid_status`；跨需求重绑 → `already_linked`（须先解绑）；**不刷新需求 `updated_at`**（关联写点落在 stage 记录） |
| `splitRequirement(data, parentId, children)` | `children: Array<{title: string}>` → `RequirementSplitResult`（v1.2.1-stage-87 新增） | **拆分一等动作**（批量构造原语）。门序 = ①children 空 → `invalid_field` ②父不存在 → `not_found` ③**父终态** → `invalid_status` ④逐子标题 trim 空 → `invalid_field`；任一失败**零变更零审计**。构造：顺序 ID（staged 容器复用 `nextRequirementId` 单源派生，第 N 子 = 当前 max + N）+ `parent_id = 父 ID` + 子初值 `scheduled`（`SPLIT_CHILD_STATUS`，**拆分即发布**，直入 `req next` 候选池）+ **一次性并入** + 恰 1 条 `requirement_split` 审计 + **父零副作用**（状态不变 / 不刷 `updated_at`）；返回子需求**本体**列表 |
| `isTerminalRequirementStatus(status)` | `=> boolean` | 终态 = `done` / `cancelled` / `rejected`（claim / link 门共用） |
| `allLinkedStagesDone(data, id)` | `=> boolean` | **done 门**：`requirement_id === id` 的阶段集**非空** ∧ 全部 `phase === 'done'`；**零关联 → false**（空集守卫防 vacuous truth） |

**结果类型与错误码**：`RequirementOpResult = { ok: true; changed: boolean } | { ok: false; code: RequirementErrorCode }`；`RequirementSplitResult = { ok: true; children: RequirementData[] } | { ok: false; code: RequirementErrorCode }`（v1.2.1-stage-87）；`RequirementErrorCode` = `not_found` / `stage_not_found` / `already_claimed` / `already_linked` / `invalid_status` / `invalid_field` / **`general_mode_conflict`**（v1.2.1-stage-90；载体制约束：需求为 `general` 却有已链接阶段 / 链到 `general` 需求——单码两文案）。**抛错 vs 错误码不对称**：`addRequirement` 为**唯一抛错原语**（构造期入参契约违反），其余恒经错误码（业务冲突，命令层映射 exit 非 0 零写盘）——**`splitRequirement` 择定错误码范式**（REV-87-002 定稿：自持校验循环、与 `update` 同族，**不复用** `add` 抛错路径）。

## 状态流转单点表（`ALLOWED_TRANSITIONS`）

| 当前 status | 允许的显式目标 |
|-------------|----------------|
| `draft` | `scheduled` / `blocked` / `cancelled` / `rejected` |
| `scheduled` | `in_progress` / `blocked` / `cancelled` / `rejected` |
| `in_progress` | `done`（**门**：`allLinkedStagesDone`）/ `blocked` / `cancelled` / `rejected` |
| `blocked` | `scheduled` / `in_progress` / `cancelled` / `rejected` |
| `done` / `cancelled` / `rejected` | 终态，无可显式流转（done 的自动回退由 stage-83 聚合承担） |
| 同值（`X → X`） | 幂等 no-op `{ok:true, changed:false}` |

表外组合 → `invalid_status`。**`done` 的唯一自动写路径 = stage-83 聚合回写；显式路径仅此表**。阶段-83 的 `computeRequirementAggregate` 须与 `allLinkedStagesDone` **语义等价**（禁第二套判定）。

## 审计日志 action（`requirement_*`）

| action | detail | 写入条件 |
|--------|--------|----------|
| `requirement_add` | `{ id, title }` | 恒（新建必发生） |
| `requirement_claim` | `{ id, owner }` | 仅实际认领 |
| `requirement_release` | `{ id, owner }`（owner = 释放前占用者） | 仅实际释放 |
| `requirement_status` | `{ id, from, to }` | 仅状态实际变更（`applyStatusChange` 内写，`update`/`advance` 共用） |
| `requirement_update` | `{ id, fields: [...] }` | 仅字段实际变更 |
| `requirement_link` | `{ stage, requirementId }`（解绑 = `null`） | 仅实际变更 |
| `requirement_split` | `{ parentId, children: [ids] }` | 恒（每次拆分恰 1 条聚合事件，**非 N 条子事件**；v1.2.1-stage-87） |

- 审计**在内存**追加（`appendRequirementLog` 单点，镜像 `FlowManager.appendLog` 的 time 填充），**落盘由调用方 `save()` 承担**——原语零写盘点。
- **幂等 / 冲突路径零审计**（日志 = 事实变更）。

## 正文文件原语（`body-file.ts`）

| 函数 | 说明 |
|------|------|
| `getRequirementsDir(projectPath)` | `{projectPath}/.openfeel/requirements`（**不纳入 `WORKSPACE_DIRS`**，按需 mkdir 幂等创建） |
| `getRequirementBodyRelPath(id)` | 正文**存储**相对路径，恒 POSIX 正斜杠（`.openfeel/requirements/{id}.md`；禁 `path.join`——Windows 产反斜杠） |
| `getRequirementBodyPath(projectPath, id)` | 正文**文件系统**路径（单点；FS 访问用原生分隔符） |
| `writeRequirementBodySkeleton(projectPath, req)` | 机械铺骨架：mkdir 幂等 + `atomicWriteFileSync`（`backup` 缺省 false）+ 已存在 → **no-op 不覆盖**（保留人工补充）+ 恒将 `req.body_path` 设为 POSIX 相对路径（**须传 `addRequirement` 返回的本体**）+ 返回绝对路径 |

**骨架章节**（H1 + **7 H2**，v1.2.1-stage-87 增 `## 父需求`）：标题 / 状态 / 摘要 / 目标与验收 / 预估版本 / **父需求**（恒渲染；`add` 径渲染 `（无）`、拆分子需求渲染父 ID——**悬空 `parent_id` 原样回显不报错**，REV-87-004①） / 关联阶段 / 变更记录（状态行**参数化** `${req.status}`，非硬编码 `draft`）。文件头注记「**机读权威恒为 `flow.json` 的 `requirements` 条目**；两者不一致以 flow.json 为准；状态为创建时快照，不追写实时状态」——**防第二事实源**。

## 命令面（`openfeel req`，v1.2.0-stage-82）

> 命令面源码：`src/commands/req.ts`（`registerReqCommand`）；`src/cli/index.ts` **两行注册**（import + register）。

**11 子命令**（v1.2.1-stage-87 增 `split`）：

| 子命令 | 类型 | `--json` | 关键行为 |
|--------|------|:--:|----------|
| `add <title> [--target-version] [--priority] [--workflow-mode]` | 写 | ✗ | 引擎抛错分流（唯一 throw 路径）；正文骨架直传本体；骨架失败不 save；**`--workflow-mode <mode>`**（v1.2.1-stage-90；构造期值域校验，非法抛错 → 通用模板 exit 1） |
| `list [--status] [--target-version] [--owner]` | 读 | ✓ | `--status` 值域取 `REQ_STATUSES`；多条件 AND；**v1.2.2-stage-97**：`--json.requirements[]` 末位追加 `linkedStages:[{id,phase}]` 与 `progress:{done,total}`（`listLinkedStages` 单点 + `computeRequirementAggregate`，无 N+1；零关联 `[]` + `{0,0}`；既有字段顺序/值不变） |
| `show <id>` | 读 | ✓ | 关联阶段**仅原始 id 枚举**（零聚合）；v1.2.1-stage-87：human 插 2 行（`父需求:` / `子需求:`）、`--json` 追加载荷 `parent` + `children`（**追加在既有三键之后，只增不改**；键序 `schemaVersion, requirement, stages, parent, children`） |
| `split <id> --into <title>` | 写 | ✓ | **拆分一等动作**（v1.2.1-stage-87，本仓**首个 repeatable option** + **首个带 `--json` 的写命令**）；`--into` 可重复（`collectInto` 累加，至少一项，缺省 → `invalid-argument`）；四码分流（`not_found`/`invalid_status`/`invalid_field`/`invalid-argument`）；失败**零写盘**；成功逐条铺子正文后单次 `save()` | 0 / 1 / 2 |
| `claim <id> [--owner]` | 写 | ✗ | 四码分流 + `--owner` 三级链 + 同 owner 幂等 |
| `release <id>` | 写 | ✗ | 未占用 no-op 恒 exit 0 |
| `set <id> [--status/--title/--target-version/--priority/--workflow-mode]` | 写 | ✗ | 命令层零校验；无字段守卫；targets 引擎派生；**`--workflow-mode <mode>`**（v1.2.1-stage-90；引擎值域校验 + 成功后**下发所有已链接阶段**〔见「需求级模式」节〕；`general` 且已有链接阶段 → `general_mode_conflict` 拒绝） |
| `link --stage <id> (--requirement <id> \| --unlink)` | 写 | ✗ | 互斥守卫；仅一次 `normalizeStageId`；`already_linked` 硬拒；**v1.2.1-stage-90：目标需求带模式 → 经 `syncConfigFieldToStages` 下发到该阶段**（status.md 字段 + flow.json 冗余同批）；目标需求为 `general` → `general_mode_conflict` 拒绝 |
| `advance <id> --to <status>` | 写 | ✗ | 零校验；done 门引擎单点；不设 `--force` |
| `board [--target-version]` | 读 | ✓ | 7 组固定顺序（= `REQ_STATUSES`）恒含空组；v1.2.1-stage-87：条目行 owner 非空时追加后缀（**仅 human**；`--json groups` 键集零改动） |
| `next [--owner] [--limit]` | 读 | ✓ | scheduled ∧ 未认领（`--owner` 扩候选）；排序冻结；v1.2.1-stage-87：`--limit <n>`（≥1 整数，**判定基准 = 解析后数值**——显式 `--limit 1` 与缺省同形态；`> 1` 时 `--json` 追加 `candidates` + human 多行；非法值 exit 1 零写盘） |

**命令层零业务逻辑**：字段白名单 / 值域 / 状态流转合法性 / 认领占用 / 关联唯一性 / done 门**单点在引擎**；命令层仅「解析参数 → 调引擎原语 → 错误码→文案映射 → `save()`（成功路径）→ `process.exitCode`」。`set`/`advance` **零校验**（合法目标经引擎新增导出 `getAllowedNextStatuses` 派生，禁命令层硬编码枚举 → 防第二份流转表）。

**`--json` 契约（5 个命令，成功/失败同契约）**：读命令 4 个（`list`/`show`/`board`/`next`）+ **写命令 1 个（`split`，v1.2.1-stage-87 起）**——均走 **stdout 纯 JSON 单文档** + **stderr 零输出**；成功 `{schemaVersion:1, ...领域对象}`（`list`/`show`/`board`/`next`/`split` 各自领域对象；`split` → `{parent, children}`）；失败 `{schemaVersion:1, error, ...ctx}` + exit 1。**其余 6 个写命令无 `--json`**（`add`/`claim`/`release`/`set`/`link`/`advance`，既有边界）。**exit 2（并发写冲突）走统一 `handleConcurrentConflict`（非 JSON 单文档）**——显式登记的有意差异。

**退出码 0/1/2**：成功 0 / 各错误 1（`process.exitCode = 1`，**禁 `process.exit(1)`**）/ 并发写冲突 2（`handleConcurrentConflict` 单点）。失败路径 **flow.json 逐字节零写盘**。

**引擎补丁**：`getAllowedNextStatuses(status)`（`requirement-ops.ts` 新增导出；只读纯函数、返回副本、域外 → `[]`；`ALLOWED_TRANSITIONS` 保持**模块私有**）；`addRequirement` 非数组守卫收口（`??=` → `Array.isArray` 重建续建，与其余 8 原语口径统一）。

**`--owner` 三级链**（`claim`）：`.openfeel/.info.json user` → `git config user.name` → 哨兵 `'unknown'` 显式拒绝（提示显式 `--owner`）；**禁硬编码用户名**；缺省判定 `=== undefined`（显式空串直通引擎 → `invalid_field`）。

**help 键双规**（`applyHelpI18n`）：位置参数键 = `arg`+参数名逐字（非 camelCase）、选项键 = 长名 camelCase；**44 键双向逐键断言**防死键（37 → 41〔op-001〕→ 42〔op-002〕→ **44**〔v1.2.1-stage-90：`add`/`set` 各增 `--workflow-mode` 选项键〕）。

**版本解绑（v1.2.1-stage-87）**：`target_version` 为**纯可选、纯展示/过滤/排序维度**——全生命周期无一处作为门（核验面 = 6 消费点 + 6 无版本条件点，结论全部「否」）；「无 `target_version` 全生命周期可用」有端到端断言固定；skill `openfeel-req` 落 `## 需求与版本解绑` 节。

**模式边界声明（v1.2.1-stage-90 supersede）**：`src/commands/req.ts` 不 import / 不引用 `ALLOWED_TRANSITIONS` / **`resolveStageWorkflowMode`**（**新禁止串**，禁第二份解析）/ 归档层 / `.phase` / `allLinkedStagesDone`——直读源文全内容**受控串 + 新禁止串**固化（`workflow_mode` 由禁止串 → **受控串**：`--workflow-mode` 选项 + patch 传参合法）。

## 需求级模式（v1.2.1-stage-90，supersede 旧「正交」口径）

需求**携带**模式属性 `workflow_mode?`，经**单点解析**作用于其关联阶段。

- **解析链（唯一）**：`FlowManager.resolveStageWorkflowMode(stageId)` = `status.md 显式 > 需求级 > config.yaml > profile.yaml（不承载）> builtin`；新增 `ConfigSource` 第 5 值 **`'requirement'`**；需求级层在 `status.md` 分支之后插入（`stages[id].requirement_id → requirements[]` 命中且值合法 → 返回；缺失 / 悬空 / 非法 → **自然回落**下一层，零报错）。`resolveEffectiveConfig().workflow_mode` **委托**同一单点（禁第二份层序判定）。
- **生效路径（禁「名义层」）**：因 `ensureStageSkeleton` 恒写「工作流模式」行（status.md 层恒命中）→ 需求级层须经**显式动作下发**：`req link` / `req set --workflow-mode` 经单点原语 `syncConfigFieldToStages('workflow_mode', v, { onlyStages })` 下发（status.md 字段 + flow.json 冗余**同批**）→ 「需求级为权威源头、阶段字段为投影」；`plan stage add` 骨架初值链亦经单点（需求级 > config defaults）。
- **载体制约束（`general` 仅需求级合法）**：需求侧门——需求为 `general` ⟹ **零关联阶段**（`req set --workflow-mode general` 有链接 → 拒；`req link` 到 `general` 需求 → 拒；错误码 `general_mode_conflict`）。阶段级 / 部署级写入面（`plan stage add` / `stage set` / `config set` / **`flow wizard` 双写入面**）拒绝 `general`（详见 `manual/core/flow-manager.md` / `manual/core/config.md`）。**流转**：`general → fast / full` 显式升级可用；**反向不自动降级**。
- **模式不入聚合**：`workflow_mode` **不参与**聚合投影 / 对账（`aggregate.ts` 仍零命中）；**经完成门单点参与 done 门**（`canCompleteRequirement` 字段直判——stage-93 起）；`allLinkedStagesDone` 单源未松动。
- **已知缺口（`req/BUG-002`，medium / open，非阻塞）**：`general` 需求**恒无法进入 `done`**——载体制约束（general ⟹ 零关联阶段）与既有 done 门（`allLinkedStagesDone` 要求 `linked.length > 0 && every(phase === 'done')`）叠加成**死锁**（`req advance --to done` / `req set --status done` 同源拒绝；拒绝文案把 `done` 列为合法目标却拒绝，自相矛盾）；有绕行路径（升级 `fast`/`full` 后完成），**承接阶段 93 收口轮 / 后续裁定**。
- **stage-93 缺陷清零（v1.2.1-stage-93；旧句保留，追加）**：`general` 需求经**载体制对偶完成路径**（`canCompleteRequirement` 谓词**单点**，判据 = 需求自身 `workflow_mode` **字段直判**，与载体制门同源；`applyStatusChange` 单点消费）可**显式完成**（`req advance --to done` / `req set --status done` 放行）；非 `general` done 判定单源 `allLinkedStagesDone` **不变**；聚合面零命中保持；`general` **且有链接**（载体制门不可达的数据损坏态）**从严回落**路 1；拒绝文案专用化（`req.err.doneGateTmpl`，错误码恒 `invalid_status`）；新增导出 `canCompleteRequirement`。

## 聚合投影与对称回写（`aggregate.ts`，v1.2.0-stage-83）

> 把「需求状态 = 关联阶段 phase 聚合投影」落地为**双向对称回写**闭环；接入 `flow-manager.ts` 两热点（`advanceStagePhase` done 分支 / `resetStagePhase`），**纯内存、同事务复用既有 `save()`、不新增写盘点、零控制流改动**。

**核心导出**：

| 导出 | 说明 |
|------|------|
| `computeRequirementAggregate(data, requirementId): RequirementAggregate` | 纯投影：`stageIds`（`data.stages` 键序）/ `stageCount` / `doneCount` / `aggregate`（`'scheduled' \| 'in_progress' \| 'done' \| null`）。done 分支**直委托 `allLinkedStagesDone`**（含空集守卫）；**零关联 → `aggregate = null`**（禁误报 done）。**v1.2.2-stage-97**：内部 `stageIds` 过滤改用 `listLinkedStages`（单点，行为等价） |
| `listLinkedStages(data, requirementId): {id, phase}[]` | **v1.2.2-stage-97 新增**：关联阶段枚举单点——唯一实现 `data.stages` 单次遍历 + `requirement_id === id` 过滤，按 `data.stages` 键序；`computeRequirementAggregate` 内部复用，`req list --json` 直接消费（`linkedStages` + `progress`，无 N+1）。**单点覆盖范围 = `req list + aggregate`**；`req show`/`req split` 的既有内联过滤未纳入（REV-97-006 登记，纯等价重构转后续） |
| `resolveRequirementStatusForStage(data, stageId)` | 单阶段 → 目标状态纯函数；无关联 / 阶段不存在 / 空串 → `null` |
| `syncRequirementStatus(data, stageId): string[]` | **对称回写入口**（纯内存）；全程只读 `data.requirements`（禁 `??=` 注入）；返回受影响需求 ID 列表；审计 `requirement_auto_done` / `requirement_auto_reopen`（`agent: 'cli'`） |
| `AUTO_DONE_PRECONDITION` | `readonly RequirementStatus[] = ['scheduled', 'in_progress']`（**前置集单点**——回写守卫与 health 漂移判据**同口径**） |
| `requirementHealthItems({ data, lang })` | health 对账项（悬空关联 / done 漂移；**warn-only 恒无 fail**） |

**回写规则（聚合视图表述，不绑定事件）**：

1. **正向**（`advanceStagePhase` **仅 `targetPhase === 'done'` 分支**）：`aggregate === 'done' ∧ status ∈ AUTO_DONE_PRECONDITION` → 需求置 `done` + 审计；**前置集外（`draft`/`blocked`/终态）→ 零动作零审计**；非 done 推进**不触发**（`scheduled → in_progress` 由 `req advance` 显式驱动）。
2. **反向**（`resetStagePhase` 全复位路径）：**重算聚合** → `aggregate ≠ 'done' ∧ status === 'done'` → 回退 `in_progress` + 审计（**不做 `done → scheduled` 细粒度回退**）。
3. 其余（前置集外 / 悬空关联 / 状态无变化）→ 零动作零审计。

**不变量**：`--dry-run` **双路径零回写**（`flow advance --dry-run` 命令层截断 / `flow stage reset --dry-run` 引擎早退，均早于回写点）；**done 判定单源**（`allLinkedStagesDone`，禁第二份 `.every(`）；同事务（无「阶段 done 而需求未回写」中间态）；无 `requirement_id` 阶段**零行为差异**（补丁前/后归一化快照 diff 为空）。

**health 需求对账**（`flow health` 新增「需求对账」/「需求漂移」两 section）：悬空 `requirement_id` → warn；`done` 漂移（**前置集内** ∧ 聚合 done ∧ status ≠ done）→ warn；**前置集外设计豁免不报**；**不改退出码、不参与 `--fix`、`--quick` 跳过**（对齐 `archive-health.ts` 先例）。

**接入点（`flow-manager.ts`）**：`advanceStagePhase` done 分支（`endStage` 后 / `return true` 前）；`resetStagePhase`（`appendLog` 审计块后 / `const curStage` 前——**不在** `if (normCur === key)` 守卫内）。

**关联阶段枚举单点（v1.2.2-stage-97）**：`listLinkedStages(data, requirementId)` 为「`requirement_id` 过滤」的唯一新增实现（`data.stages` 单次遍历 + 键序），`computeRequirementAggregate` 内部改用它（原内联 filter 删除，行为等价）；`req list --json` 末位两键直接消费。**空态/悬空**：零关联与悬空 `requirement_id` 均给 `[]` + `{done:0,total:0}`；与 `req show --json.stages` 的一致性由测试交叉断言。**已知边界（REV-97-006）**：`req show`（stages）与 `req split` 仍保留既有内联过滤，单点覆盖范围 = `req list + aggregate`；纯等价重构留待 stage-98/后续版本，当前语义等价。

## 设计要点与判据

- **纯内存 + 调用方落盘**：本模块**零独立写盘点**（唯一 IO = 正文文件骨架）；`flow.json` 落盘恒经 `FlowManager.save()`（锁 + `meta.revision` 乐观锁 + `.bak` + 原子写）——需求写入**零自造路径**。
- **读侧宽容不注入**：顶层可选字段不在 `load()` 补齐（见 kb/patterns.md #顶层可选字段「读侧宽容不注入」模式）；反例断言「纯 load→save → `'requirements' in parsed === false`」。
- **副本纪律**：查询 API 返回浅副本（数组 + 元素）；**写路径须 raw find 改本体**——经查询 API 拿浅副本会**静默丢更新**（REV-81-011）。
- **模式边界**：需求**携带**模式属性（`workflow_mode?`）但**模式不参与聚合 / done 门 / 对账**；模式仅经单点解析器消费（详见「需求级模式」节；v1.2.1-stage-90 supersede 旧「零耦合」口径）。与归档层仍零耦合（本版不归档 `requirements`）。
- **已知边界（REV-83-016）**：`flow stage reset` 复位到 default 分支相位后再推进 `done` **不回写** → 需求遗留漂移（health「需求漂移」warn 可察、**非自愈**）；行为修复（advance 命中 done 按聚合视图无条件重算）转后续版本评估（收口期控制流冻结）。

## 变更历史

| 版本 | 变更 |
|------|------|
| v1.2.2-stage-98 | 文档收口复核：`listLinkedStages` / `req list` 两键口径与契约一致；无源码变更。 |
| v1.2.1-stage-93 | **缺陷清零（`req/BUG-002`）**：新增导出谓词 `canCompleteRequirement(data, req)`（**载体制对偶完成路径**：`general` 需求显式完成直接放行；判据 = 需求自身 `workflow_mode` **字段直判**，与载体制门 `:287-290` / `:346` **同源**；禁解析级联——`resolveStageWorkflowMode` 于 `requirement-ops.ts` 仍零出现）；`applyStatusChange` done 门改**单点消费**（谓词恰 1 处新增）；`general` 且有链接（损坏态）**从严回落**路 1（`allLinkedStagesDone`）；`allLinkedStagesDone` 语义零改动（仍含唯一 `.every(`）；i18n +1 键 `req.err.doneGateTmpl`（zh/en 成对）+ 条件消费（`commands/req.ts` set / advance 两处；错误码恒 `invalid_status`）+ `req.advance` help 三处同步；i18n 944 → **945**；C2 断言**显式 supersede**（段 C 注释改写 + 差额对照逐条；聚合面 NEEDLES 6 串零命中保持）。门禁 **71 文件 / 1719 用例** 0 skipped 0 failed、`tsc` 0、`lint kb` 0、build ×2 幂等。 |
| v1.2.1-stage-90 | **需求级模式属性（supersede 旧「正交」口径）**：`RequirementData` +`workflow_mode?`（**12 字段**；值域 `full`/`fast`/`general`；**仅调度属性**、读侧宽容零注入）；`addRequirement` 入参 + 值域校验、`updateRequirement` `PATCH_WHITELIST` 增键；错误码 +`general_mode_conflict`（载体制约束——general 需求不得有已链接阶段）；命令面 `add`/`set` 各增 `--workflow-mode`（help 键 **42 → 44**）+ `link`/`set` 经 `syncConfigFieldToStages` **下发**关联阶段；解析链插入**需求级层**（`status.md > requirement > config > profile > builtin`，`ConfigSource` 第 5 值 `'requirement'`）+ `resolveEffectiveConfig` 委托单点；断言 C1/C2/C3 **显式改写**（`workflow_mode` 禁止串 → **受控串** + 新禁止串 `resolveStageWorkflowMode` + 正控扩容，**严格强于旧断言**）。i18n 931 → **939**（+8 键）。4 commits（`342e6ef`/`143928c`/`77552f9`/`02156a9`）；门禁 **71 文件 / 1674 用例** 0 skipped 0 failed、`tsc` 0、build ×2 幂等。**已知缺口**：`general` 需求恒无法 `done` → `req/BUG-002`（转 stage-93）。 |
| v1.2.1-stage-87 | **需求接取制度与拆分**：`RequirementData` +`parent_id?`（**11 字段**；仅溯源不聚合）；新增 `splitRequirement` 原语 + `RequirementSplitResult`（**批量构造：全成或零变更 + 顺序 ID 单源派生 + 父终态门 + 子初值 `scheduled` + 恰 1 条 `requirement_split` 审计 + 父零副作用**）+ `SPLIT_CHILD_STATUS` 常量；命令面 **10 → 11 子命令**（+`req split`，首个 repeatable option + 首个带 `--json` 的写命令）+ `req next --limit` + `req board` owner 后缀 + `req show` 父子展示（悬空 `parent_id` 原样回显）；骨架 +`## 父需求`（**7 H2**）+ `## 变更记录` 状态参数化；help 键 **37 → 42**；i18n 912 → **931**（+19 键）。3 op（`f46d01d`/`a84227f`/`b3c4df3`）；门禁 **71 文件 / 1614 用例** 0 skipped 0 failed、`tsc` 0、`lint i18n` 931、build ×2 幂等。 |
| v1.2.0-stage-83 | **补聚合投影与对称回写**：新建 `src/core/req/aggregate.ts`（`computeRequirementAggregate` done 判定**单源委托** `allLinkedStagesDone` + `resolveRequirementStatusForStage` + `syncRequirementStatus` 对称回写入口 + `AUTO_DONE_PRECONDITION` 前置集单点 + `requirementHealthItems`）；`flow-manager.ts` 对称回写两热点（**8+/0-**；纯内存同事务）；`flow.ts` health 三处合并（warn-only）；i18n 908→**911**（+3 键 `flow.health.req*`）；零回归取证（补丁前/后归一化快照 diff 空 + golden + 正控）。3 op（未 commit，HEAD `33185a3`）；门禁 70 文件 / 1547 用例 0 failed。 |
| v1.2.0-stage-82 | **补命令面**：新建 `src/commands/req.ts`（`openfeel req` 10 子命令）+ `src/cli/index.ts` 两行注册；引擎小幅补丁（新增导出 `getAllowedNextStatuses` + `addRequirement` 非数组守卫收口 `req/BUG-001`）；`--json` 四读命令成功/失败同契约 + 退出码 0/1/2 + help 键双规（37 键双向断言）+ `--owner` 三级链；i18n 829→**908**。3 op（未 commit，HEAD `c5f1d53`）；门禁 70 文件 / 1506 用例 0 failed。**下游** stage-83（聚合回写）消费。 |
| v1.2.0-stage-81 | **新建模块** `src/core/req/`（types / requirement-ops / body-file）；`flow-manager.ts` 最小追加 `FlowData.requirements?` + `StageData.requirement_id?`（读侧宽容不 load 补齐）；9 原语 + 状态流转单点表 + done 门 + 正文骨架；正交静态断言固化。3 op（未 commit，HEAD `3be254c`）；门禁 69 文件 / 1476 用例 0 failed。**下游** stage-82（命令面）/ stage-83（聚合回写）消费。 |
