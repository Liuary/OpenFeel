# 流水线管理模块（flow-manager）

> 模块文档，由归档官在归档时维护。对应源码：`src/core/flow-manager.ts`。

## 职责

管理 `flow.json` 的读写、流水线阶段推进、操作（Op）追踪、审查/日志记录与健康校验，是 OpenFeel 流水线的状态中枢。

## 核心 API

| 方法 | 功能 |
|------|------|
| `load()` / `save()` | 读取 / 持久化 flow.json（save 含乐观并发校验、写前备份与原子写；load 含 ops 防御性类型守卫） |
| `addStage(stageId, deps?)` | 注册新阶段（写入前做 `(series, stageDir)` 冲突检测：不同 stageId 映射同目录时抛错，同 stageId 幂等静默） |
| `advanceStagePhase(stageName, phase)` | 推进阶段到目标 phase（校验合法性） |
| `syncCurrentOp(stageName)` | **`pipeline.current.op` 单一 owner（stage-50 T1）**：按 pending op 计算并同步 `current.op`，未命中置 `''`（不碰 phase、无 IO）；`advanceStagePhase` 与 `recordAttempt` 共用（禁止第二实现；**stage-51 N4 起 `recordAttempt` 的 pass / fail-retry 两分支亦调用**）。修复「推进无 pending op 的阶段时 `current.op` 跨阶段悬空」 |
| `getSummary()` / `summary(lang)` | 获取流水线摘要（结构化 / 文本） |
| `validate()` / `repair()` / `healthCheck()` | 校验、自动修复（含 ops 字段补全）、健康检查（**非 `--quick` 含第 7 项悬空依赖检测**，见下） |
| `autoRepairInconsistency(stageName, options?)` | 自动修复 phase↔status 不一致（`status=done` 且 `phase≠done` → 同步 phase；反之同步 status）；**stage-49 B1 起增可选 `options: { dryRun?: boolean }`**——`dryRun` 时**只计算不赋值**（返回「将修复 X」的报告），供 `flow advance --dry-run` 预览（不再写盘） |
| `saveCheckpoint()` / `restoreCheckpoint()` | 阶段检查点保存与回滚 |
| `autoCommitOnDone(stageName)` | 阶段 done 时自动 git 提交 |
| `mapPhaseToAgent(phase)` | 将 PipelinePhase 映射为负责 Agent 标识（返回**新名** `openfeel-*`，`done → none`） |
| `normalizeAgentName(name)` | 归一化 agent 名（旧名→新名，读取兼容 P5；`toLowerCase` 幂等；非 agent 值原样保留） |
| `checkRemovable(stageId, {force})` | 只读可移除性检查（`ops` 非空 / 当前活跃 / 被 `deps` 引用），`removeStage` 与 `--dry-run` 共用 |
| `removeStage(stageId, {force, purge})` | 注销阶段（含 `current` 兜底回退、`remove_stage` 审计日志）；**不执行目录删除**，`purge` 时返回 `{ purgeTarget }` 由命令层在 `save()` 成功后删除（stage-47 事务顺序） |
| `getPipelinePhases()` / `getPipelineTransitions()` | 自描述访问器：返回运行时 `pipelineConfig` 的 phase 列表与转移表**副本**（缺省回退默认表） |
| `resolveEffectiveConfig()` | 解析四个受管配置键（`EFFECTIVE_CONFIG_KEYS`）的「有效值 + 生效来源」，输出 `key → { value, source }`；复用内部 `buildCascadeConfig`（单一权威，避免第二套解析） |
| `FlowConcurrentModificationError` / `isFlowConcurrentError(err)` | flow.json 乐观并发冲突错误类型与识别函数（命令层统一捕获） |

## 并发保护与乐观并发校验

`save()` / `restoreCheckpoint()` / `repair()` 的 flow.json 写入均在 `flow.lock`（`.openfeel/tmp/locks/flow.lock`）内 + 原子写（`backup:true`），详见 `manual/core/fs.md`。

- **`.bak` 语义（S5）**：写前复制旧文件为 `.bak`，写成功后不再覆盖，使 `.bak` 始终保留**上一个已落盘版本**（修复旧实现「写后被新内容覆盖」的缺陷）。
- **乐观并发校验**：`meta.revision`（整数，单调递增；缺失 / 非整数视为 0）作为版本标识。`load()` 记录 `loadedRevision`；`save()` 在锁内 `readDiskRevision()` 比对基线，不一致抛 `FlowConcurrentModificationError(expected, actual)`（**不写盘 / 不备份**），一致则 `revision+1` 随内容原子落盘并同步内存基线。
- **恢复 / 修复**：`restoreCheckpoint()` 冲突时返回 `false` 并告警，成功时快照 revision 重定基为 `diskRevision+1`；`repair()` 为显式恢复工具**不做校验**，但写时递增 revision；`saveCheckpoint()` / `initFlow()` 原子写但**不加锁**（唯一文件名 / 首次创建）。
- **写入路径审计**：flow.json 全部写入路径（`save` / `restoreCheckpoint` / `repair` / `initFlow` / `saveCheckpoint`）均已审计并标注是否加锁及理由。
- **能力边界**：仅检测经 `FlowManager.save()` 维护 revision 的写入者；外部手工改写不递增 revision 无法检测。

## 自描述命令与破坏性命令支撑（stage-41）

- **`getPipelinePhases(): string[]`** / **`getPipelineTransitions(): Record<string, string[]>`**：供 `openfeel flow phases [--json]` 展示。数据源为运行时 `pipelineConfig`（`.openfeel/pipeline.yaml`），缺省回退 `getDefaultPipelineConfig()`；**返回副本**（外部修改不污染内部状态）。与校验用的 `hasTransition()` / `getValidTargets()` 同读 `pipelineConfig.transitions`，杜绝「展示与实际不符」的第二信源。
  - **两集合语义区分（stage-47 / `cli/BUG-001`）**：`phases` 为**存在视图**（运行时全部 phase，可含自定义如 `gate`）；`flow advance` 的 phase 白名单为 **`PIPELINE_PHASES` 内置 15**（推进白名单），`flow phases --json` 另增 `advanceAccepted: [...PIPELINE_PHASES]` 使差异可编程消费，人类输出在有差异时追加 `flow.phases.customPhaseNote` 边界说明。**不**把 `advance` 校验收敛到运行时 phases（会波及 `PipelinePhase` 类型与模糊修正链）。
- **`checkRemovable(stageId, {force}): RemovalCheck`**：只读可移除性检查，供 `removeStage` 与 `flow stage remove --dry-run` 共用（消除骨架与验收标准矛盾）。三类校验——`ops` 非空 / 当前活跃阶段（`pipeline.current.stage`）/ 被其它阶段 `deps` 引用（`(series, stageDir)` 归一化匹配 + `Array.isArray` 守卫兼容存量缺 `deps` 字段）。`--force` 时 `ok` 恒 `true`，但 `opCount` / `isCurrent` / `referencing` 仍如实返回。
- **`removeStage(stageId, {force, purge}): { purgeTarget?: string }`**：注销阶段。`current` 兜底——移除 `pipeline.current.stage` 后按 `stages` 插入序回退「首个非 done 阶段」，无可回退则清空为 `{stage:'', op:''}`（避免后续 `advance` 失败）；**不删除目录**：`purge: true` 时仅**计算并返回** `purgeTarget`（plan 目录绝对路径），审计日志 `detail = { stageId, purgeTarget, referencing, snapshot }`（记录**意图**而非已发生事实）。`--force` **不清理**引用方悬空 `deps`（保留 + 日志可审计）。
  - **事务顺序（stage-47 / `REV-v1.1.2-stage-41` REV-009）**：命令层顺序固定为 `removeStage(...)` → `save()`（成功）→ `rmSync(purgeTarget)`（`commands/flow.ts`），消除「目录已删但注册未落盘」的中间态；core 层不产生任何不可逆副作用。契约变更已同步唯一调用方（`rg "removeStage("` 全域 1 处）。
- **冲突检测接入**：`registerStage` / `addStage` 写入前调用 `findStageDirConflict`（来自 `plan/path.ts`）。

## dry-run 自动修复预览与悬空依赖检测（v1.1.2-stage-49）

- **`autoRepairInconsistency(stageName, { dryRun? })`（B1）**：签名新增**可选** `options`（向后兼容）。`dryRun: true` 时两个修复分支**只计算 detail、不改内存**（`stage.phase` / `stage.status` 不变）→ 命令层据此在 `--dry-run` 下**不调用 `save()`**，使 `flow.json` 字节 / `revision` / phase 均不变（修复前实测 dry-run 会因 `autoRepair` + `save()` 先于 dry-run 分支执行而写盘 revision 2→3，违反 help「仅验证」承诺）。dry-run 输出用预览专用键 `flow.advance.autoRepairPreview`；非 dry-run 路径不变（仍修复并 `save()`）。
- **`checkDanglingDeps(items)`（B2，私有）**：`healthCheck` 新增第 7 项「悬空依赖」检测（**仅 `!quick`**）——遍历 `stages[].deps`，以 `normalizeStageId` 归一化后比对已注册阶段集合，检出即 `warn`（列出前 5 条），无则 `pass`；**核心层仅 `warn` 宽松兜底**（不进 `ok` 判定、不阻断退出码），**强制校验点在命令层** `commands/plan.ts`（见 `cli/commands.md`）。为此 `flow-manager.ts` 新增 `normalizeStageId` import（并入既有 `./plan/path.js` 导入行）。

## 存量数据鲁棒性与结构化错误（v1.1.2-stage-47）

- **`save()` 缺 `meta` 守卫**（`REV-v1.1.2-stage-41` REV-008）：入口先 `this.data.meta ??= { version: '1.0', project: '', updated: '', revision: 0 }`（与 `defaultFlowData` 字段一致），仅补**整体缺失**、不覆盖既有字段，使存量 `flow.json` 不再抛 `TypeError`。
- **`StageDirConflictError`（导出）**：`registerStage` / `addStage` 检测到两个不同 stageId 映射同一 `(series, stageDir)` 时抛该结构化错误（含 `stage` / `other` 字段；`message` 保留原中文文案以兼容既有断言）。命令层三入口（`plan stage add` / `flow stage add` / `stage create`）按错误类型分流用 `common.stageDirConflictTmpl` 渲染（zh/en 对称，消除死键）；与 `FlowConcurrentModificationError` 同级同构。
- **`buildCascadeConfig` 画像层**：见「配置级联与有效值来源」——新增 `global-paths` 的 `getGlobalProfilePath` 依赖（`global-paths` 不反向依赖本模块，无循环）。

## 内部一致性与门禁支撑（v1.1.2-stage-50，T1~T19）

- **T1 `syncCurrentOp(stageName)`**：见核心 API（`current.op` 单一 owner，供 stage-51 N4 复用）。
- **T2 `load()` normalize 收口**：存量缺 `ops`/`deps` 时统一补 `ops = {}` / `deps = []`（一处收口），修复 `advance`/`save` 双 `TypeError` 与 `validate()` 漏检。
- **T4 `fuzzyCorrectPhase` 后缀唯一性**：后缀匹配补齐唯一命中检查（对齐 prefix/contains），`--force` 下任意尾串不再误命中枚举首个。
- **T5 `logMilestone` extra 展开**：公共日志里程碑不再丢弃 `MilestoneEvent` 除 title 外的字段（`extra: { title, ...event }`，保留耗时数据）。
- **T6 `paused` 软语义**：`pipeline.phase` 覆写前对 `paused` 打 WARN 或注释声明语义（零行为变更）。
- **T9 `testEnabled` 注入**：`canAdvance` / `mapPhaseToStageStatus` 的 test 分支由 CLI 传入 `test_enabled`（`buildCascadeConfig`）闭环，消除生产不可达分支。
- **T10 core 层不 `process.exit`**：`plan/roadmap.ts` 改抛 `Error`，退出码由命令层决定。
- **T11 单例键含路径**：`PublicLogger` / `MetricsStore` 单例键含 `projectPath`/`dataDir`（不同 key → 不同实例），避免跨项目复用进程写错目录。
- **T12 `checkpoint_mapping`**：补 `archiving` 主用键（`archive` 保留为历史键），使 `archiving` 阶段更新 checkpoint。
- **T14 僵尸检测锚定**：`checkZombieStates` 统一 `startsWith(stageId + '.')`（与 `:1064` 锚定写法一致），杜绝前缀重叠 stageId 误报。
- **T16 `autoCommitOnDone`**：git 提交改 `execFileSync('git', [...])` 数组形式（stageName 不再拼入 shell 串）。
- **T19 `transitionsDiff`**：`flow phases --json` 增运行时与内置默认转移表的差异报告（`missing` 列出内置默认有而运行时缺失的 source），使 `pipeline.yaml` 漂移可见而非静默；**未修改 `pipeline.yaml`**（不补组合键，避免削弱 `test_enabled` 门禁）。


## 纠正侧能力与孤儿对账（v1.1.2-stage-51，反馈 08）

- **`removeScheme(projectPath, stageName, opId, {force?, dryRun?}): RemoveSchemeResult`**（`core/plan/scheme.ts`，导出）：从 `flow.json` 注销一个 op **注册键**（**不删除 op 模板文件**——删键后文件转列 fileOrphan，由 `flow repair` 报告）。默认拒绝 `state=done`（`reason='op-done'`）或**存在 checkpoint 进展**（`reason='has-checkpoint'`）的 op（`--force` 覆盖）；孤儿可直删（`orphan: true`）。经 `FlowManager` 加锁 + `save()` + `appendLog({ action:'scheme_remove', detail:{ stage, opId, force, orphan } })`。
- **`findOrphanOps(projectPath): { keyOrphans, fileOrphans }`**（`core/flow-manager.ts`，模块级导出）：对账 `stages[].ops` 键 ↔ `ops/` 目录文件。**唯一对账实现**，`repair()` 与 `healthCheck()` 共用（禁止第二套）。文件存在性判定**同时匹配** `op-NNN.md` 与 `op-NNN_*.md`（防历史命名误判为键孤儿）。
- **`repair(dryRun)` 集成**：`RepairResult` 增可选 `orphans`；**默认只报告**（命令层打印清单，flow.json 零变更）；`--prune-orphans` **仅清理 keyOrphans**（删键 + `appendLog`），**fileOrphans 永不自动删除**；与 `--dry-run` 组合仍只预览。
- **`healthCheck` 第 8 项**：私有 `checkOrphanOps(items)`（**仅 `!quick`**，与 `checkDanglingDeps` 一致）——键/文件孤儿 → `warn`（detail 列前 5 + 总数），**不设 `fail`、不改变退出码**。
- **`scheme create` 注册语义统一（N3/A1）**：`core/plan/stage.ts` 抽 **`ensureStageSkeleton(projectPath, name, deps?)`**（幂等「不存在才写」），`addStage` 改为复用；`scheme.ts` 隐式注册分支在写 `flow.json` 条目后调用之，**消除「半注册」**（`plan/…/{stage}/` 缺 `overview.md`/`status.md`）；`addStage` 与 `scheme create` 两路径骨架**逐字节一致**；骨架创建失败仅 `warn` 不中止。
- **op 文件命名（N8/A5）**：`createScheme` 的 `candidate` 改为 `${opIdOf(seq)}.md`（**删除 `safeTitle`**，标题不再进文件名——修复标题含 `/` 时 `openSync(path,'wx')` ENOENT）；序号分配 `parse`（`/^op-(\d+)/`）**未改**（新旧命名均占号，避免撞号）；`extractTitle(filePath, fileName)` 兼容回退（文件名含 `_` 走历史解析，否则读内容首行 `# {opId}：{title}`，IO 失败回退文件名不抛错）。
- **`recordAttempt` 同步 `current.op`（N4）**：pass / fail-retry 两分支在改 `op.state` 后**复用** `syncCurrentOp(stageId)`（stage-50 T1 落地，**不重复实现**，`rg syncCurrentOp` = 定义 1 + 调用 3）；`flow attempt` 输出「当前指针」行（`flow.attempt.currentOpTmpl`）。

## 可编排性与自愈能力（v1.1.2-stage-52，反馈 09）

- **`reconcileStatusMd({ dryRun? })`**：遍历 stages，比对 `flow.json` 的 `status` 与 `status.md` 的「状态」行，**仅回写差异项**（定向替换「状态」行，**非整文件重写**）；字段缺失 `skipped-not-found`（不新建文件）；`dryRun` 只报告不写盘。命令出口 `flow health --fix`；与 `stage set` 的 `setStatusField` 同语义（标注防重复实现）。
- **结构化访问器（供 `--json`）**：`getHealthReport()`（items 数组）、`getMetricsSummary()` 等，供 `flow status/current/health/metrics/overview --json` 输出**领域对象 + `schemaVersion:1`**（纯 JSON 单文档）。
- **`findPhasePath(stageName, to)`**：沿 transitions 做 **BFS 求唯一可达路径**（深度 ≤8；多义/无路径返回原因），供 `flow advance --to` 自动逐步与 `--dry-run` 完整路径；命令层多步循环**每步调用 `assertNoBlockingOpenRev`**（blocking open REV 拦截、exit 1 + `revision` 不变）。
- **`draft` 状态（窄兼容）**：`scheme create --draft` → `op.state='draft'`；`publishScheme()` 校验非空转 `pending`；`recordAttempt`（core）对 draft op **守卫拒绝**（与命令层双层，返回契约不变）；health 跳过 draft 空模板 warning、归档/统计不计入 draft。
- **`listCheckpoints(stageId?)`**：短名归一化 + **短名旧文件 `||` 兜底**（无参行为不变）。
- **stage 解析归一化闭包（op-012/013/014，共 10 处）**：统一范式 `normalizeStageId(x) ?? x` + **双键回退** `stages[normalized] ?? stages[raw]`（详见 `kb/patterns.md #短名/全名 stage 解析归一化的统一范式`）；覆盖 `findPhasePath` / `resolveCurrentPhase` / `autoRepairInconsistency` / `advanceStagePhase`（体内 `key` 贯穿，含 checkpoint 命名）/ `parseOpId` 出口 / `removeStage`+`checkRemovable` / `addAutoFixReview` / `addReviewEntry`（`core/view/entry.ts`）/ `archiveStage`（`core/archive/merge.ts`）/ `listCheckpoints`。独立全量扫描确认**无第 11 处**，闭包正式收口。
- **`autoRepairInconsistency` / `findPhasePath` 等 stage 入参**：均支持短名（归一化恒等；全名路径行为不变）。

## 状态机

阶段 phase 枚举（`src/core/pipeline-schema.ts` 的 `PIPELINE_PHASES`）：

```
plan_pending → plan_review → plan_passed
→ scheme_pending → scheme_review → scheme_passed
→ exec_running → review_pending → review_failed | review_passed
→ test_pending → test_failed | test_passed
→ archiving → done
```

- 全局宏观状态 `META_PHASES`：`active` / `paused` / `done`（仅元信息，调度基于阶段 phase）
- **全局状态聚合（stage-42 P3）**：`advanceStagePhase` 结束时按「全部阶段聚合」推导 `pipeline.phase` —— `stages.length > 0 && every(s => s.phase === 'done')` 成立则置 `done`，否则置 `active`（空集守卫防 `every` 对空数组返回 `true` 的 vacuous truth）；单阶段 done **不**改变全局状态；`current` 不随之下沉/回退（设计行为，P3a）；历史 flow.json 不迁移（该字段可由 `stages` 推导 + 任一次 advance 自愈）
- 合法流转由 `transitions` 表控制，key 可用 `|` 组合多个源 phase（并行场景）
- 推进必须通过 CLI（`openfeel flow advance`），禁止手动编辑 flow.json

## 配置级联与有效值来源（stage-42）

`buildCascadeConfig()`（内部）+ `resolveEffectiveConfig()`（公开）构成**唯一解析权威**，供 `flow status --verbose` 级联表与 `openfeel config effective` 两个出口共用（`rg` 实证：`buildCascadeConfig` 调用方仅 `verboseSummary` 与 `resolveEffectiveConfig`）。

优先级链（低 → 高）：`builtin` < `profile.yaml`（全局画像兜底）< `config.yaml defaults` < `status.md` 覆盖

| 层 | 来源 | 说明 |
|----|------|------|
| `profileDefaults` | `~/.config/openfeel/profile.yaml` | **仅取 `preferences.auto_advance` 单值**（不做 `preferences` 整体替换）；**stage-47（`config/BUG-003`）起仅当画像文件真实存在且原始 YAML 显式声明 `preferences.auto_advance`（`enabled`/`disabled`）时填充**，文件缺失/解析失败/缺键或非枚举值 → 不填 → 落 `builtin`；`readProfile()` 自身异常安全行为不变 |
| `configDefaults` | `.openfeel/config.yaml` `defaults` 块 | 全部键 `String(value)` 收集；文件不存在或解析失败则为空 |
| `statusOverrides` | 当前 `pipeline.current.stage` 的 `status.md` | 正则提取 `**执行模式**` → `execution_mode`、`**自动推进**` → `auto_advance` |
| `effective` | 浅合并 `{...profileDefaults, ...configDefaults, ...statusOverrides}` | 三层均为扁平 `Record<string,string>`，无嵌套覆盖风险 |

来源判定与合并顺序逐字对应：`status.md > config.yaml > profile.yaml > builtin`（三层皆无 → `String(DEFAULT_CONFIG[key])` 标 `builtin`）。

> **`config/BUG-003` 已修复（v1.1.2-stage-47，`buildCascadeConfig`）**：画像层改为「文件真实存在 + 原始 YAML 显式声明」双条件，无画像环境下来源正确落 `builtin`（`auto_advance: disabled [来源: builtin]`）；有 profile 且显式值时仍为 `profile.yaml`。**测试注意**：`effective` 是三层**显式声明值的浅合并**（无 builtin 回填），故无画像时 `effective.auto_advance` 为 `undefined`，而 `resolveEffectiveConfig()` 经 `DEFAULT_CONFIG` 回填后为 `{ value: 'disabled', source: 'builtin' }`——两者语义不同，断言不可互换。

## 审计日志 action 一览（stage-41 / stage-42）

| action | agent | 写入点 | 语义 |
|--------|-------|--------|------|
| `advance_stage_phase` | `cli` | `advanceStagePhase` | 阶段 phase 推进 |
| `attempt_pass` | `openfeel-executor` | op 尝试通过 | op 执行计数 |
| `add_stage` | `flow-manager` | `addStage`（`flow stage add` / `stage create`） | **仅注册层**：只落 flow.json |
| `register_stage` | `cli` | `registerStage`（`plan stage add`） | **完整层**：建目录 + overview/status + 注册 + 依赖（`:747-749` 注释写明双轨差异） |
| `register_op` | `cli` | `plan/scheme.ts` `createScheme` | op 注册（在 `save()` 之前写入，每次均记） |
| `remove_stage` | `cli` | `removeStage` | 注销阶段（`detail = { stageId, purgeTarget, referencing, snapshot }`；目录删除由命令层在 `save()` 后执行） |
| `archive_stage` | `openfeel-archiver` | `archiveStage` | 阶段归档 |
| `scheme_rename` | `cli` | `plan/scheme.ts` `renameScheme` | op 标题重命名（v1.1.2-stage-52 op-006，同步 flow.json 标题 + op 文件首行） |
| `scheme_publish` | `cli` | `plan/scheme.ts` `publishScheme` | draft op 发布（v1.1.2-stage-52 op-005，`draft`→`pending`） |

- **幂等/冲突不写日志**：`registerStage` 的幂等早返回与冲突抛错均位于 `appendLog` **之前**，保证「日志 = 事实变更」。
- **`plan/scheme.ts` 兜底注册（stage-42 op-004）**：`createScheme` 中 `syncToFlowJson` 的兜底注册路径改经 `validateStageId` + `findStageDirConflict` 校验，命中冲突时 `warn` 并 `return`（**不抛错**：外层 try/catch 会吞非并发错误，warn 显式可见且不破坏「op 文件已创建」契约）；注册成功后写 `register_op`，再由 `save()` 落盘。
- 审计查询须同时识别 `add_stage` 与 `register_stage`（双轨非重复）。

## 数据位置

`flow.json` 位于项目根 `.openfeel/` 下，含 `pipeline`（宏观状态 + 当前阶段/op）、`stages`（各阶段独立状态机）、`reviews`、`log`。

## status.md 路径解析

`findStatusPath`（及健康检查）委托 `src/core/plan/path.ts` 的 `findStageStatusPath` 实现**三级回退**：

```
1. plan/{series}/stage-NN/status.md   ← 解析 stageId → 精确路径（首选）
2. plan/**/stage-NN/status.md         ← fast-glob 递归（兼容 series 变化/旧平铺）
3. stages/{stageId}/status.md         ← 历史遗留，只读兜底
```

stageId↔目录映射收敛到 `plan-path` 模块，flow-manager 不再自行 split 版本号或 resolve 目录（stage-34 变更）。

## agent 命名与读取兼容（stage-36）

v1.1.0-stage-36 统一 agent 命名为 `openfeel-` 前缀（`feel` 保留原名），并采用「写入新名 + 读取兼容旧名」策略：

- **写入新名**：`mapPhaseToAgent` 返回 `openfeel-planner` / `openfeel-schemer` / `openfeel-executor` / `openfeel-reviewer` / `openfeel-feel-tester` / `openfeel-archiver`（`done → none`）；`flow-manager.ts` 内 `agent: 'executor'` 写入点全部改为 `agent: 'openfeel-executor'`。
- **读取兼容**：模块级 `normalizeAgentName(name)`（配合 `LEGACY_AGENT_NAME_MAP`）在**所有读取并展示 agent 名**的路径归一化旧名→新名——`flow status --verbose`（`responsibleAgent` + `change.agent`）、`flow overview` / `flow log`（`entry.agent`）、`flow metrics`（`m.agentName`）、`view list`（`item.filed_by`）。内部 `toLowerCase()` 归一大小写；幂等（已是 `openfeel-*` 原样返回）；`feel` / `none` / `unknown` / 非 agent 值（`flow-manager`）原样保留。
- **不迁移历史**：不批量改写历史 `flow.json` / 日志 / `status.md`，旧名经归一化后仍可正常读取展示；存量 assignee 重映射留给后续 `openfeel migrate`。
