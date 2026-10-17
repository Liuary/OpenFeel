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
| `validate()` / `repair()` / `healthCheck()` | 校验、自动修复（含 ops 字段补全）、健康检查（**非 `--quick` 含第 7 项悬空依赖检测**，见下；**第 8 项孤儿 warn**（stage-51）；**第 10 项 `checkWorkflowModeRedundancy` 冗余一致性 warn**（v1.1.7-stage-75，缺失不报、不 fail）） |
| `autoRepairInconsistency(stageName, options?)` | 自动修复 phase↔status 不一致（**phase 为唯一事实源，v1.1.4-stage-62 起单向**：`status=done` 且 `phase≠done` → 将 `status` 修正为 phase 投影、**绝不反向改 `phase`**；`phase=done` 且 `status≠done` → 同步 `status='done'`）；**stage-49 B1 起增可选 `options: { dryRun?: boolean }`**——`dryRun` 时**只计算不赋值**（返回「将修复 X」的报告），供 `flow advance --dry-run` 预览（不再写盘） |
| `saveCheckpoint()` / `restoreCheckpoint()` | 阶段检查点保存与恢复。**v1.1.4-stage-65 起**：`restoreCheckpoint(filename, { stage?, dryRun? })` 支持选择性（`--stage`）与预览（`--dryRun`，零写盘）；无 `stage` 时为**全量覆盖**（向后兼容，逐字节不变）。配套只读 `previewRestore(filename, { stage? })` 与精准复位 `resetStagePhase(stageName, to, { dryRun? })`（详见「Checkpoint 恢复与阶段复位」节） |
| `autoCommitOnDone(stageName)` | 阶段 done 时自动 git 提交 |
| `mapPhaseToAgent(phase)` | 将 PipelinePhase 映射为负责 Agent 标识（返回**新名** `openfeel-*`，`done → none`）；**v1.2.2-stage-96 起私有实现不动**，外部一律经下方 `getResponsibleAgent` 消费 |
| `getResponsibleAgent(phase)` | **v1.2.2-stage-96 新增（公开单点）**：委托既有 private `mapPhaseToAgent`（映射结果零改动）。命令层 / 适配器一律经本方法取 phase→agent，**禁止复制映射**（验收判据：`grep -rn "mapPhaseToAgent" src/commands/` = 0）；与 `flow status --verbose.downstreamPhases[].responsibleAgent` 同源 |
| `listStageBlockingOpenReviews(reviews, stage)` | **v1.2.2-stage-96 新增（模块级导出纯函数）**：过滤指定阶段域的阻塞 open REV——`(r.op === stage \|\| r.op.startsWith(stage + '.')) ∧ r.blocking !== false ∧ r.status === 'open'`；空 `stage` → `[]`；保序。`flow next.blockingReviews` 与命令层 `assertNoBlockingOpenRev` 共用；**核心两处 done 门（`advanceStagePhase` / `resetStagePhase`）内联判定本版零改动**，以等价性测试防漂移 |
| `DEFAULT_EFFECTIVE_REVIEW_TIER` | **v1.2.2-stage-96 新增（`pipeline-schema.ts` 导出常量）**：`ReviewTier = 'full'`——`flow advance` 未显式 `--review-tier` 时的**生效档位**（不随工作流模式变化）。单一来源：`flow advance` 缺省 / `flow next.effectiveReviewTier` / `flow status.stages[].effectiveReviewTier` / `flow phases.effectiveReviewTier`；与展示值 `MODE_DERIVED_TIER` 语义分离 |
| `normalizeAgentName(name)` | 归一化 agent 名（旧名→新名，读取兼容 P5；`toLowerCase` 幂等；非 agent 值原样保留） |
| `checkRemovable(stageId, {force})` | 只读可移除性检查（`ops` 非空 / 当前活跃 / 被 `deps` 引用），`removeStage` 与 `--dry-run` 共用 |
| `removeStage(stageId, {force, purge})` | 注销阶段（含 `current` 兜底回退、`remove_stage` 审计日志）；**不执行目录删除**，`purge` 时返回 `{ purgeTarget }` 由命令层在 `save()` 成功后删除（stage-47 事务顺序） |
| `getPipelinePhases()` / `getPipelineTransitions(mode?)` | 自描述访问器：返回运行时 `pipelineConfig` 的 phase 列表与转移表**副本**（缺省回退默认表）。**v1.1.7-stage-74 起** `getPipelineTransitions(mode: WorkflowMode = 'full')`：**无参 = full**（零回归既有消费点），`fast` 供 stage-75 `flow phases` 模式分节消费；同批新增 `getDefaultTransitions(mode = 'full')`（内置默认表副本，供 `transitionsDiff`） |
| `getValidTargets(fromPhase, mode)` / `resolveStageWorkflowMode(stageId?)` | **v1.1.7-stage-74 新增/变更**：`getValidTargets(fromPhase, mode: WorkflowMode)` **mode 无默认值**（编译期必传）→ 唯一取表点，读表法则唯一为私有 `resolveTransitionsForMode(mode)`（full = `pipelineConfig.transitions` / fast = `fast_transitions ?? 内置快线表`）。**公共** `resolveStageWorkflowMode(stageId?)`：解析指定阶段的工作流模式（`{ value, source }`），带 stage 形参独立解析（当前域 = 无参；任意域 = 显式 stageId）。**v1.2.1-stage-90**：链上插入**需求级层**（`status.md > 需求级 > config.yaml > profile.yaml > builtin`；`source` 新值 `'requirement'`）；`resolveTransitionsForMode` / `getDefaultPipelineConfig` 增 **`general` 分支（空表）** |
| `pruneTransitionsByTier(table, tier)` / `MODE_DERIVED_TIER` | **v1.2.1-stage-92 新增 / v1.2.1-stage-93 修复**（审查档位，详见「审查档位（full / lean / skip）转移表裁剪」节）：`REVIEW_TIERS = ['full','lean','skip']` + `TIER_PRUNED_PHASES` 单源（`pipeline-schema.ts`）；`resolveTransitionsForMode(mode, tier: ReviewTier = 'full')` **第二参**（唯一取表点延伸，**禁第二份取表**）→ 末尾 `pruneTransitionsByTier(raw, tier)`（**调用点恰 1 处**；`tier='full'` 深拷贝原样返回 = **默认零裁剪 = 零回归**；**v1.2.1-stage-93 起：裁剪只作用于入边 / 目标侧——全裁 key 不删、被裁剪相位保留出边**）；`MODE_DERIVED_TIER` = 模式→档位派生映射（仅 `flow phases` 展示）；`advanceStagePhase` 增可选 `opts.reviewTier` → detail 追加 `review_tier`（**仅显式时写**） |
| `resolveEffectiveConfig()` | 解析**四个**受管配置键（`execution_mode` / `auto_advance` / `merge_mode` / **`workflow_mode`**，`EFFECTIVE_CONFIG_KEYS`）的「有效值 + 生效来源」，输出 `key → { value, source }`；复用内部 `buildCascadeConfig`（单一权威，避免第二套解析）。**v1.1.4-stage-62 起布尔测试门禁键已移除**，不再属受管键；**v1.1.7-stage-74 起受管键扩为四键** |
| `syncConfigFieldToStages(configKey, value, options?)` | **v1.1.4-stage-63 新增 / v1.1.7-stage-75 扩参**（`config set --sync-stages`）：将受管配置键批量同步到阶段 `status.md` 对应字段。适用键由 `STAGE_FIELD_BY_CONFIG_KEY`（`config.ts` 单一来源）映射（`auto_advance → 自动推进`、`execution_mode → 执行模式`、**`workflow_mode → 工作流模式`**，v1.1.7-stage-74 增）；**v1.1.7-stage-75 起** `options.onlyStages?: string[]` **限定作用域**（缺省 = 全部已注册阶段；调用方负责前置 `normalizeStageId` 归一 + 已注册校验）。字段缺失 → `workflow_mode` 走**插入**（复用 `insertStatusField`，**禁双实现**）、结果码 **`inserted`**；锚点缺失 → **`skipped-no-anchor`**（归「跳过」类，**退出码恒 0**）；`execution_mode`/`auto_advance` 字段缺失**保持 `skipped-no-field`**（零回归），字段/文件缺失 → `skipped-no-field` / `skipped-no-status` 逐条报告。**只读** `flow.json.stages` 枚举、**不写 flow.json**；审计 action `config_sync_stage`。**v1.2.0-stage-80 循环重构**：遍历集 = **`onlyStages ∪ Object.keys(stages)` 归一化去重**（缺省 `onlyStages` = 活跃集全量，逐字零回归），使 **off-set 目标（已归档/未注册）可达** → 仅 status.md 同步（五态结果不变），flow.json 冗余写入**跳过**（冗余写入三点 `:3637/:3646/:3667` 加注册守卫，防越界解引用；不置 `flowJsonDirty`、不额外 `save()`） |
| `insertStatusField(stageId, field, value)` | **v1.1.7-stage-75 新增**：在阶段 `status.md` **插入**受管字段行（原子写 + 按阶段锁），三态返回 **`inserted` / `exists` / `no-anchor`**；**锚点链**「自动推进」行后 →（缺失则）「执行模式」行后 → 皆缺 = `no-anchor`（**两步全文匹配**，非合并正则）；`.bak` 仅确认插入时生成。与替换语义函数 **严格分离**（`setStatusField`（`commands/stage.ts`）/ `writeStatusField` **零改动**，禁双重语义）；**落点禁** `core/plan/stage.ts`（循环依赖）。供 `stage set --workflow-mode`（单阶段 `no-anchor` → fail-fast exit 1）与 `syncConfigFieldToStages`（批量 `no-anchor` → `skipped-no-anchor`）共用 |
| `StageData.workflow_mode?` | **v1.1.7-stage-75**：`flow.json` 阶段级**可选冗余**字段（裁定 G），**不参与级联**；三写入点（`plan stage add` 初值 / `stage set --workflow-mode` / `--sync-stages`）**仅实际写入时**同步（`stage.ts` 的 `syncWorkflowModeRedundancy`）；`flow health` 增**第 10 项** `checkWorkflowModeRedundancy`——冗余与权威不一致 → **warn，不 fail**（缺失不报） |
| `FlowConcurrentModificationError` / `isFlowConcurrentError(err)` | flow.json 乐观并发冲突错误类型与识别函数（命令层统一捕获） |

## 并发保护与乐观并发校验

`save()` / `restoreCheckpoint()` / `repair()` 的 flow.json 写入均在 `flow.lock`（`.openfeel/tmp/locks/flow.lock`）内 + 原子写（`backup:true`），详见 `manual/core/fs.md`。

- **`.bak` 语义（S5）**：写前复制旧文件为 `.bak`，写成功后不再覆盖，使 `.bak` 始终保留**上一个已落盘版本**（修复旧实现「写后被新内容覆盖」的缺陷）。
- **乐观并发校验**：`meta.revision`（整数，单调递增；缺失 / 非整数视为 0）作为版本标识。`load()` 记录 `loadedRevision`；`save()` 在锁内 `readDiskRevision()` 比对基线，不一致抛 `FlowConcurrentModificationError(expected, actual)`（**不写盘 / 不备份**），一致则 `revision+1` 随内容原子落盘并同步内存基线。
- **恢复 / 修复**：`restoreCheckpoint()` 冲突时返回 `false` 并告警，成功时快照 revision 重定基为 `diskRevision+1`；`repair()` 为显式恢复工具**不做校验**，但写时递增 revision；`saveCheckpoint()` / `initFlow()` 原子写但**不加锁**（唯一文件名 / 首次创建）。
- **写入路径审计**：flow.json 全部写入路径（`save` / `restoreCheckpoint` / `repair` / `initFlow` / `saveCheckpoint`）均已审计并标注是否加锁及理由。
- **能力边界**：仅检测经 `FlowManager.save()` 维护 revision 的写入者；外部手工改写不递增 revision 无法检测。

## 自描述命令与破坏性命令支撑（stage-41）

- **`getPipelinePhases(): string[]`** / **`getPipelineTransitions(mode = 'full'): Record<string, string[]>`**：供 `openfeel flow phases [--json]` 展示。数据源为运行时 `pipelineConfig`（`.openfeel/pipeline.yaml`），缺省回退 `getDefaultPipelineConfig()`；**返回副本**（外部修改不污染内部状态）。与校验用的 `hasTransition()` / `getValidTargets()` **同读** `resolveTransitionsForMode(mode)`，杜绝「展示与实际不符」的第二信源。**v1.1.7-stage-74：`mode` 可选，无参 = full（零回归）**。
  - **两集合语义区分（stage-47 / `cli/BUG-001`）**：`phases` 为**存在视图**（运行时全部 phase，可含自定义如 `gate`）；`flow advance` 的 phase 白名单为 **`PIPELINE_PHASES` 内置 15**（推进白名单），`flow phases --json` 另增 `advanceAccepted: [...PIPELINE_PHASES]` 使差异可编程消费，人类输出在有差异时追加 `flow.phases.customPhaseNote` 边界说明。**不**把 `advance` 校验收敛到运行时 phases（会波及 `PipelinePhase` 类型与模糊修正链）。
- **`checkRemovable(stageId, {force}): RemovalCheck`**：只读可移除性检查，供 `removeStage` 与 `flow stage remove --dry-run` 共用（消除骨架与验收标准矛盾）。三类校验——`ops` 非空 / 当前活跃阶段（`pipeline.current.stage`）/ 被其它阶段 `deps` 引用（`(series, stageDir)` 归一化匹配 + `Array.isArray` 守卫兼容存量缺 `deps` 字段）。`--force` 时 `ok` 恒 `true`，但 `opCount` / `isCurrent` / `referencing` 仍如实返回。
- **`removeStage(stageId, {force, purge}): { purgeTarget?: string }`**：注销阶段。`current` 兜底——移除 `pipeline.current.stage` 后按 `stages` 插入序回退「首个非 done 阶段」，无可回退则清空为 `{stage:'', op:''}`（避免后续 `advance` 失败）；**不删除目录**：`purge: true` 时仅**计算并返回** `purgeTarget`（plan 目录绝对路径），审计日志 `detail = { stageId, purgeTarget, referencing, snapshot }`（记录**意图**而非已发生事实）。`--force` **不清理**引用方悬空 `deps`（保留 + 日志可审计）。
  - **事务顺序（stage-47 / `REV-v1.1.2-stage-41` REV-009）**：命令层顺序固定为 `removeStage(...)` → `save()`（成功）→ `rmSync(purgeTarget)`（`commands/flow.ts`），消除「目录已删但注册未落盘」的中间态；core 层不产生任何不可逆副作用。契约变更已同步唯一调用方（`rg "removeStage("` 全域 1 处）。
- **冲突检测接入**：`registerStage` / `addStage` 写入前调用 `findStageDirConflict`（来自 `plan/path.ts`）。

## dry-run 自动修复预览与悬空依赖检测（v1.1.2-stage-49）

- **`autoRepairInconsistency(stageName, { dryRun? })`（B1）**：签名新增**可选** `options`（向后兼容）。`dryRun: true` 时两个修复分支**只计算 detail、不改内存**（`stage.phase` / `stage.status` 不变）→ 命令层据此在 `--dry-run` 下**不调用 `save()`**，使 `flow.json` 字节 / `revision` / phase 均不变（修复前实测 dry-run 会因 `autoRepair` + `save()` 先于 dry-run 分支执行而写盘 revision 2→3，违反 help「仅验证」承诺）。dry-run 输出用预览专用键 `flow.advance.autoRepairPreview`；非 dry-run 路径不变（仍修复并 `save()`）。
- **`checkDanglingDeps(items)`（B2，私有）**：`healthCheck` 新增第 7 项「悬空依赖」检测（**仅 `!quick`**）——遍历 `stages[].deps`，以 `normalizeStageId` 归一化后比对已注册阶段集合，检出即 `warn`（列出前 5 条），无则 `pass`；**核心层仅 `warn` 宽松兜底**（不进 `ok` 判定、不阻断退出码），**强制校验点在命令层** `commands/plan.ts`（见 `cli/commands.md`）。为此 `flow-manager.ts` 新增 `normalizeStageId` import（并入既有 `./plan/path.js` 导入行）。**v1.2.0-stage-80 读侧同口径**：`known`（已注册阶段集合）判定并入 core helper `isArchivedVersionOf`（`plan/path.ts`，**版本粒度、短名恒 false**）——已归档版本的 stageId 视为**已满足**、不再报悬空；与写侧（`plan stage add --deps` / `flow stage set --deps`）**同一 helper、同一口径**（禁「写侧放行 + 读侧报悬空」并存）；仍恒 `warn`-only、不改退出码。**依赖方向**：本文件对 `flow-archive/*` 零 import（helper 落 `plan/path.ts` 避环）。

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
- **T9 `testEnabled` 注入**：`canAdvance` / `mapPhaseToStageStatus` 的 test 分支由 CLI 传入布尔测试门禁键（`buildCascadeConfig`）闭环，消除生产不可达分支。**v1.1.4-stage-62 已移除**：`mapPhaseToStageStatus` 不再接收该形参，`review_passed` 恒投影 `'review_passed'`（详见「状态/相位单一事实源」节）。
- **T10 core 层不 `process.exit`**：`plan/roadmap.ts` 改抛 `Error`，退出码由命令层决定。
- **T11 单例键含路径**：`PublicLogger` / `MetricsStore` 单例键含 `projectPath`/`dataDir`（不同 key → 不同实例），避免跨项目复用进程写错目录。
- **T12 `checkpoint_mapping`**：补 `archiving` 主用键（`archive` 保留为历史键），使 `archiving` 阶段更新 checkpoint。
- **T14 僵尸检测锚定**：`checkZombieStates` 统一 `startsWith(stageId + '.')`（与 `:1064` 锚定写法一致），杜绝前缀重叠 stageId 误报。
- **T16 `autoCommitOnDone`**：git 提交改 `execFileSync('git', [...])` 数组形式（stageName 不再拼入 shell 串）。
- **T19 `transitionsDiff`**：`flow phases --json` 增运行时与内置默认转移表的差异报告（`missing` 列出内置默认有而运行时缺失的 source），使 `pipeline.yaml` 漂移可见而非静默；**未修改 `pipeline.yaml`**（不补组合键，避免削弱布尔测试门禁；该门禁键已于 v1.1.4-stage-62 移除，phase 图与其无关）。


## 纠正侧能力与孤儿对账（v1.1.2-stage-51，反馈 08）

- **`removeScheme(projectPath, stageName, opId, {force?, dryRun?}): RemoveSchemeResult`**（`core/plan/scheme.ts`，导出）：从 `flow.json` 注销一个 op **注册键**（**不删除 op 模板文件**——删键后文件转列 fileOrphan，由 `flow repair` 报告）。默认拒绝 `state=done`（`reason='op-done'`）或**存在 checkpoint 进展**（`reason='has-checkpoint'`）的 op（`--force` 覆盖）；孤儿可直删（`orphan: true`）。经 `FlowManager` 加锁 + `save()` + `appendLog({ action:'scheme_remove', detail:{ stage, opId, force, orphan } })`。
- **`findOrphanOps(projectPath): { keyOrphans, fileOrphans }`**（`core/flow-manager.ts`，模块级导出）：对账 `stages[].ops` 键 ↔ `ops/` 目录文件。**唯一对账实现**，`repair()` 与 `healthCheck()` 共用（禁止第二套）。文件存在性判定**同时匹配** `op-NNN.md` 与 `op-NNN_*.md`（防历史命名误判为键孤儿）。
- **`repair(dryRun)` 集成**：`RepairResult` 增可选 `orphans`；**默认只报告**（命令层打印清单，flow.json 零变更）；`--prune-orphans` **仅清理 keyOrphans**（删键 + `appendLog`），**fileOrphans 永不自动删除**；与 `--dry-run` 组合仍只预览。
- **`healthCheck` 第 8 项**：私有 `checkOrphanOps(items)`（**仅 `!quick`**，与 `checkDanglingDeps` 一致）——键/文件孤儿 → `warn`（detail 列前 5 + 总数），**不设 `fail`、不改变退出码**。
- **`scheme create` 注册语义统一（N3/A1）**：`core/plan/stage.ts` 抽 **`ensureStageSkeleton(projectPath, name, deps?)`**（幂等「不存在才写」），`addStage` 改为复用；`scheme.ts` 隐式注册分支在写 `flow.json` 条目后调用之，**消除「半注册」**（`plan/…/{stage}/` 缺 `overview.md`/`status.md`）；`addStage` 与 `scheme create` 两路径骨架**逐字节一致**；骨架创建失败仅 `warn` 不中止。
- **op 文件命名（N8/A5）**：`createScheme` 的 `candidate` 改为 `${opIdOf(seq)}.md`（**删除 `safeTitle`**，标题不再进文件名——修复标题含 `/` 时 `openSync(path,'wx')` ENOENT）；序号分配 `parse`（`/^op-(\d+)/`）**未改**（新旧命名均占号，避免撞号）；`extractTitle(filePath, fileName)` 兼容回退（文件名含 `_` 走历史解析，否则读内容首行 `# {opId}：{title}`，IO 失败回退文件名不抛错）。
- **`recordAttempt` 同步 `current.op`（N4）**：pass / fail-retry 两分支在改 `op.state` 后**复用** `syncCurrentOp(stageId)`（stage-50 T1 落地，**不重复实现**，`rg syncCurrentOp` = 定义 1 + 调用 3）；`flow attempt` 输出「当前指针」行（`flow.attempt.currentOpTmpl`）。

## 可编排性与自愈能力（v1.1.2-stage-52，反馈 09）

- **`reconcileStatusMd({ dryRun? })`**：遍历 stages，比对 `flow.json` 的 `status` 与 `status.md` 的「状态」行，**仅回写差异项**（定向替换「状态」行，**非整文件重写**）；字段缺失 `skipped-not-found`（不新建文件）；`dryRun` 只报告不写盘。命令出口 `flow health --fix`（**唯一批量回写入口**），与 `stage set` 的 `setStatusField` 同语义（标注防重复实现）。**权威口径（v1.1.4-stage-62）**：权威值 = `mapPhaseToStageStatus(phase, status)`（即 **phase 的粗粒度投影**，phase 为单一事实源），**仅回写 `status.md` 的「状态」行**（执行模式/自动推进/当前任务/状态记录等独立字段绝不触碰），遍历**全部** stages；`flow advance` **不回写** `status.md`（保持 `--fix` 为唯一批量对账/回写入口，D3）。
- **结构化访问器（供 `--json`）**：`getHealthReport()`（items 数组）、`getMetricsSummary()` 等，供 `flow status/current/health/metrics/overview --json` 输出**领域对象 + `schemaVersion:1`**（纯 JSON 单文档）。
- **`findPhasePath(stageName, to)`**：沿 transitions 做 **BFS 求唯一可达路径**（深度 ≤8；多义/无路径返回原因），供 `flow advance --to` 自动逐步与 `--dry-run` 完整路径；命令层多步循环**每步调用 `assertNoBlockingOpenRev`**（blocking open REV 拦截、exit 1 + `revision` 不变）。
- **`draft` 状态（窄兼容）**：`scheme create --draft` → `op.state='draft'`；`publishScheme()` 校验非空转 `pending`；`recordAttempt`（core）对 draft op **守卫拒绝**（与命令层双层，返回契约不变）；health 跳过 draft 空模板 warning、归档/统计不计入 draft。
- **空模板检测整行锚定（v1.1.2-stage-54，E1 / `cli/BUG-005`）**：`isTemplateEmpty` 由 `content.includes(EMPTY_TEMPLATE_MARKER)` **纯子串**改为**整行锚定** `EMPTY_TEMPLATE_LINE_RE = /(?:^|\n)[ \t]*-\s*\[\s*\]\s*待补充[ \t]*(?=\r?\n|$)/`（**单一来源**，提供缩进/`-` 与 `[ ]` 间空白/行尾空白/CRLF 容错）；`detectFillState` 的 `partial` 分支同口径收紧为 `/(?:^|\n)[ \t]*-\s*\[\s*\]/`；`plan/scheme.ts` 的 `publishScheme` 改调 `isTemplateEmpty`（消除第二处子串判断，`EMPTY_TEMPLATE_MARKER` 仍供模板骨架生成）。**效果**：正文**行内引用**占位标记不再误报（`detectFillState`→`filled` / `publish` 放行 / `health` 不报），真实**独占行**仍判 `empty`（`publish` exit 1）。**已知边界**：代码围栏内的独占行仍判 `empty`（不引入围栏解析，A1）。**返回域不变**（`'empty'|'partial'|'filled'`）。
- **`listCheckpoints(stageId?)`**：短名归一化 + **短名旧文件 `||` 兜底**（无参行为不变）。
- **stage 解析归一化闭包（op-012/013/014，共 10 处）**：统一范式 `normalizeStageId(x) ?? x` + **双键回退** `stages[normalized] ?? stages[raw]`（详见 `kb/patterns.md #短名/全名 stage 解析归一化的统一范式`）；覆盖 `findPhasePath` / `resolveCurrentPhase` / `autoRepairInconsistency` / `advanceStagePhase`（体内 `key` 贯穿，含 checkpoint 命名）/ `parseOpId` 出口 / `removeStage`+`checkRemovable` / `addAutoFixReview` / `addReviewEntry`（`core/view/entry.ts`）/ `archiveStage`（`core/archive/merge.ts`）/ `listCheckpoints`。独立全量扫描确认**无第 11 处**，闭包正式收口。
- **`autoRepairInconsistency` / `findPhasePath` 等 stage 入参**：均支持短名（归一化恒等；全名路径行为不变）。

## Checkpoint 恢复与阶段复位（v1.1.4-stage-65）

> 把 checkpoint `restore` 从「全量快照覆盖」升级为「**按阶段选择性、可预览、可精准复位**」的一等恢复手段，并为「禁止手改 `flow.json`」在故障场景下提供可解的恢复路径。

### 核心 API（选择性恢复 / 预览 / 精准复位）

- **`restoreCheckpoint(filename, options?: { stage?: string; dryRun?: boolean }): boolean`**（签名扩展，向后兼容）：
  - **无 `stage`** → **全量覆盖**（与改前逐字节一致），恢复前将当前 `flow.json` 备份为 `.bak`；
  - **`stage`** → **仅替换 `flow.json.stages[stage]` 子树**，其它阶段与 `pipeline` 其余字段**不动**；子树 `status` 按 `phase` 投影（stage-62 单一事实源）；**仅当 `pipeline.current.stage` 指向该阶段时**同步 `current.op`（否则不动）；
  - **`dryRun`** → 复用 `previewRestore` 只读预览，**零写盘**（不 `atomicWrite`、不改内存 `revision`、不写 `.bak`），返回「是否可恢复」；
  - 安全校验与改前逐字一致：拒绝路径分隔符 / `..`（路径穿越）、乐观并发 `revision` 校验（不一致拒绝）、`.bak` 写前备份。
- **`previewRestore(filename, options?: { stage?: string }): RestorePreview`**：**只读差异**（不加锁、不写盘）。返回 `{ ok, reason?, conflicts, diffs }`；`conflicts` 为「磁盘 `revision` ≠ 已加载 `revision`」的并发冲突提示。
- **`resetStagePhase(stageName, to, options?: { dryRun?: boolean }): ResetStageResult`**（`flow stage reset` 的 core 实现）：
  - **允许回退**（不受正向 `transitions` 限制，受**合法 phase 值域**约束：`PipelinePhaseSchema`，非法直接抛错，**不做模糊修正**）；
  - **`to === 'done'`** 时**复用** `advanceStagePhase` 的**阻塞 REV 检查**（存在 blocking 且 `status=open` 的 REV → 拒绝，不可绕过）；
  - 写入 `phase` 后按 `mapPhaseToStageStatus(to, 原 status)` **同步 `status`**（phase 权威）；幂等（phase 与投影 status 均无变化 → `changed=false` no-op）；
  - 仅当 `pipeline.current` 指向该阶段时同步 `current.op`；重算宏观 `pipeline.phase`（全量 done→`done`，否则 `active`）；
  - 留审计日志 `reset_stage_phase`；**不触发归档 commit**（区别于 `advance`）、**不写 checkpoint 快照**；
  - `dryRun` 时仅计算不修改内存（命令层不 `save()`），零写盘。

### 接口字段

- **`RestoreDiffEntry`**：单条恢复差异 —— `stage`（阶段 ID）、`fromPhase`/`fromStatus`（磁盘当前值，无该阶段时哨兵 `'(absent)'`）、`toPhase`/`toStatus`（快照待恢复值，快照无该阶段时哨兵 `'(removed)'`）。
- **`RestorePreview`**：`ok`（文件名/内容/阶段校验是否通过）、`reason?`（`invalid-name` | `missing` | `bad-content` | `stage-not-in-snapshot`）、`conflicts`（乐观并发冲突）、`diffs: RestoreDiffEntry[]`（计划变更清单；全量模式含全部变动阶段，`--stage` 仅该阶段）。
- **`ResetStageResult`**：`changed`（是否产生实际变更；`false`=no-op）、`from`（复位前 phase）、`to`（复位目标 phase）、`status`（投影后的 status）。

### 故障恢复路径（顺序即优先级）

```
① flow health（诊断，只报告）
② flow stage reset <id> --to <phase>（精准复位单阶段）       ← 首选
③ checkpoint restore <file> --stage <id> --dry-run（预览）→ 去 --dry-run 执行（按阶段回退）
④ checkpoint restore <file>（无 --stage，全量覆盖）          ← 最后手段
⑤ flow health --fix（对账 status.md「状态」，仅该字段）
```

> **「全量 restore 为最后手段」**：多阶段并行时全量覆盖会跨阶段连带回退；优先用 `flow stage reset`（精准复位单阶段）或 `checkpoint restore --stage`（按阶段回退），并以 `--dry-run` 先行预览。
>
> **职责边界**：`flow stage reset` 与 `checkpoint restore` **改写 `flow.json`**（phase/status/revision）；`flow health --fix` **仅回写 `status.md` 的「状态」字段**（不改 `flow.json`）。诊断（`flow health`）只报告，不修复。

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

## 三模式（full / fast / general）转移表（v1.1.7-stage-74；fast 表口径于 v1.1.7-stage-76 T7 修订；**general 于 v1.2.1-stage-90 增**）

> 「快速迭代模式」（`fast`）/「完整链路」（`full`）/「通用模式」（`general`）共存：**同一 phase 图按模式裁剪**，不新增 phase。

- **配置键 `workflow_mode`**（枚举 **`full|fast|general`**〔v1.2.1-stage-90 由 2 值扩为 3 值〕，值域单一来源 `WORKFLOW_MODES`，`core/config.ts`）：项目级默认在 `.openfeel/config.yaml` `defaults.workflow_mode`；阶段级覆盖在 `{stage}/status.md` 的 `**工作流模式**：full|fast|general` 行；**需求级**由需求条目 `workflow_mode?` 承载。级联解析入口 **`resolveStageWorkflowMode(stageId?)`**（公共），优先级 **`status.md > 需求级 > config.yaml > profile.yaml（有意不承载）> builtin(DEFAULT_CONFIG='fast')`**；`ConfigSource` 第 5 值 **`'requirement'`**（v1.2.1-stage-90）。`status.md` 值域正则由 `new RegExp(...WORKFLOW_MODES.join('|'))` **同源构造**（原为硬编码 2 值——漏改即静默回落）。
- **通用模式 `general`（v1.2.1-stage-90）**：语义 = 「**无流水线**、按需调度通用工作者」——`resolveTransitionsForMode('general')` 返回**空表 `{}`**（**不新增 phase**，15 项不变）；`flow advance` 在 general 阶段**显式错误引导**（`flow.advance.generalNoPipeline`；**不静默失败**；防御路径——常规写路径下 general 阶段态不可达，见「载体制约束」）；`flow phases --mode general` 为纯展示查询（空表）。
- **内置 fast 快线表 `FAST_TRANSITIONS`**（`flow-manager.ts`，单一来源，禁命令层/模板层复制）：**v1.1.7-stage-76 T7 起 9 条目**（8 流转键 + `done`；原为 8 条目〔7 流转键 + `done`〕）——`plan_pending → plan_review → plan_passed → exec_running → review_pending → {review_failed, review_passed}`（**fast 下计划审查 `plan_review` 不跳过**，reviewer 单轮必过，与代码审查同级）；`review_failed` **双出口** `[review_pending, exec_running]`（失败回环：重审 或 回执行修复）；`review_passed → archiving → done`。fast 跳过 **6 项**（`scheme_*` / `test_*`）。`full` / `fast` 两表**逐字零回归**。
- **运行时快线表 `pipeline.yaml` 可选 `fast_transitions`**（裁定 F）：独立容错 Schema `FastTransitionsSchema`（`pipeline-schema.ts`）；**缺失 / 类型非法 / 空对象 `{}`** → 回落内置快线表（REV-74-009，避免 fast 全链静默死锁）；非法类型告警 `flow.manager.fastTransitionsInvalid`。`phases` / `checkpoint_mapping` / `phase_corrections` 两模式共用。
- **唯一取表点**：`getValidTargets(fromPhase, mode)`——`mode` **必传**（无默认值）；四调用点（`hasTransition` / `getAvailablePhases` / `findPhasePath` / `canAdvance`）均显式传 `resolveStageWorkflowMode(stage).value`，间接消费者 `buildDownstreamPhases`（`flow status --verbose`）。**任何调用点不得使用默认 mode**（防第二信源，REV-74-002）。
- **零回归**：`getPipelineTransitions()` / `getDefaultTransitions()` **无参 = full**（既有断言逐字绿）；`flow.json` **不写** mode/transitions 冗余字段（裁定 G）。
- **语义边界**：`config effective` / `flow status --verbose` = **当前阶段域**（无参）；`flow mode --stage` / 表选择 = **任意阶段域**（显式 stageId）。命令面（`flow mode` / `flow phases --mode|--stage` / `stage set --workflow-mode`）归 **stage-75**。

### 需求级模式与载体制约束（v1.2.1-stage-90）

- **需求级层（解析链第 2 层）**：`resolveStageWorkflowMode(stageId)` 在 `status.md` 分支之后插入——`stages[id].requirement_id → requirements[]` 命中且 `workflow_mode` 合法 → 返回该值 + `source: 'requirement'`；缺失 / 悬空 / 非法 → **自然回落**下一层（零报错）。`resolveEffectiveConfig().workflow_mode` **委托**同一单点（**禁第二份层序判定**，D-90-6）。
- **生效路径（禁「名义层」）**：因 `ensureStageSkeleton` 恒写「工作流模式」行 → 需求级层须经**显式动作下发**：`req link` / `req set --workflow-mode` 经 `syncConfigFieldToStages('workflow_mode', v, { onlyStages })` 下发（status.md 字段 + flow.json 冗余**同批**）；`plan stage add` 骨架初值与 `addStage` 冗余写入**均经单点**（D-90-5①）。
- **载体制约束（`general` 仅需求级合法）——写入面穷尽 4 面**：① `plan stage add --workflow-mode general` ② `stage set --workflow-mode general` ③ `config set workflow_mode general` → 三面 **exit 1 + 提示「general 仅限需求级」（`common.generalOnlyRequirement`）+ 零写盘**（目标文件 hash / mtime 不变）；④ **`flow wizard` 双写入面**（阶段级 `insertStatusField` + 部署级 `setConfigValue` 直调 core、不经命令层门）→ 以「**不提供 general 选项**」达成同口径拒绝（choices 恒 = 阶段合法子集 `full` / `fast`；无 `flow.wizard.modeGeneral` 键）。**拒设不能赖 schema**：`setConfigValue` 仅经 `ConfigDefaultsSchema` 校验 → 3 值化后 schema **放行** general，故阶段级 / 部署级拒设须**命令层显式门**（REV-90-001）。
- **需求侧门**：需求为 `general` ⟹ **零关联阶段**（`req set --workflow-mode general` 有链接 → 拒；`req link` 到 `general` 需求 → 拒；错误码 `general_mode_conflict`）—— 详见 `manual/core/req.md`。

## 审查档位（full / lean / skip）转移表裁剪（v1.2.1-stage-92）

> 「审查档位」= 模式轴（`workflow_mode`）之外的**第二条轴**：**同一模式基表按档位裁剪审查关**；**不新增 phase、不新增持久载体**。三条硬语义（blocking REV 门 / `--dry-run` 零写盘 / 审计只增不改）零破坏。**默认 full 零裁剪 = 零回归**。

- **单源常量**（`pipeline-schema.ts`）：`REVIEW_TIERS = ['full','lean','skip'] as const` + `ReviewTier` + `TIER_PRUNED_PHASES: Record<ReviewTier, readonly PipelinePhase[]>`（`full: []` / `lean: ['scheme_review']` / `skip: ['plan_review','scheme_review']`）。语义 = **审查关裁剪谱**：全量 = 零裁剪；精简 = 裁 `scheme_review`（= 现状 fast 审查深度语义）；免审 = 裁两道**计划类**审查关，**恒保留** `review_pending`（代码审查）/ `test_pending` / `archiving`。
- **取表单点延伸**：`resolveTransitionsForMode(mode, tier: ReviewTier = 'full')` **第二参**——先按既有三分支取**原始表**，末尾统一 `return pruneTransitionsByTier(raw, tier)`。私有纯函数 `pruneTransitionsByTier(table, tier)`（**调用点恰 1 处**）算法 = ① `tier==='full'` 深拷贝原样返回（**默认零裁剪 = 零回归**）；② 各 key 的 targets 过滤被裁剪相位；③ **边收缩回退**（某 key 过滤后空且原非空 → 并入被删目标的 targets 再过滤去重，保证 fast 基表裁 `plan_review` 后 `plan_pending → ['plan_passed']` 不空集）。**v1.2.1-stage-93 修复（`cli/BUG-011`）**：删除原「全裁 key 整键删除」步骤——**裁剪只作用于入边 / 目标侧**，被裁剪相位作源键时**保留出边**（阶段已处于被裁剪关时可向该档位下游推进）；「**进入**被裁剪关」仍被目标侧过滤裁掉。表级差分锁定：键集 ≡ 基表（`lean`/`skip` 分别 16/16 键），**零新边**。下游签名加**可选末参**（既有调用零改动）：`getValidTargets` / `getPipelineTransitions` / `findPhasePath` / `getAvailablePhases`（`getValidTargets` 的「mode 必传」纪律保持）。
- **派生映射（单源常量）**：`MODE_DERIVED_TIER = { full:'full', fast:'lean', general:'full' }`——仅用于 `flow phases` **展示与提示**，**不改变推进语义**（生效档位 = `explicitTier ?? 'full'`）。
- **命令面**（`commands/flow.ts`）：`flow advance --review-tier <tier>` 本次调用**显式声明**档位（缺省 = 零裁剪）；值域非法 → exit 1 零写盘；显式 `lean` / `skip` → 一行**非阻断** `console.warn`；`--dry-run` 预览含档位行（零写盘）；`flow phases` 人读档位分节行 + `--json` **末位追加** `reviewTier`（既有 6 键逐字保留、顺序不变）。**不新增只读子命令、不扩展 `flow mode`**。详见 `manual/cli/commands.md`。
- **审计**：`advanceStagePhase(..., opts?: { reviewTier? })` 的 detail **仅显式声明时**追加可选键 `review_tier`（既有键 `stageName`/`from`/`to`/`session_id`/`resumed` 逐字保留，条件展开）；`resetStagePhase` **不加**该键；`flow.json` 存量**零注入**（禁 load 侧补齐）。
- **命名消歧**：审查档位三档「全量 / 精简 / 免审」（`full` / `lean` / `skip`）与「工作流快线」（`workflow_mode=fast`）**分属两轴，禁互相引用 / 混用**；「快速通道 / fast track（FAST-PASS）」为审查深度降级**总称**（**禁「快线」二字**指代档位）。
- **缺陷修复记录**（**v1.2.1-stage-93 清零**）：`cli/BUG-011`（medium）——阶段**恰停于被裁剪相位**（如 `plan_review` + `skip`）时 `getValidTargets(当前相位, mode, tier)` 曾为空集 → 无法推进（仅 `--force` 可绕行）；**现裁剪只作用于入边 / 目标侧，被裁剪相位保留出边**，可正常向该档位下游推进（零 `--force`）；语义差 = **只修「已处于被裁剪关的出边」**，入边 / 目标侧过滤与「进入不可达」保持；`full` 档零裁剪逐字不变；`flow advance` 失败提示行的可达目标在同场景由「(无)」转非空（有意变更，已登记）。

## 调度决策单点（v1.2.2-stage-96）

> 为 DSH 适配器提供「当前阶段 + 相位 → 谁负责 → 合法下一相位 → 建议命令 → 守卫 → 阻塞 REV」的 CLI 单点输出（`flow next`）；核心层只**公开既有单点**并抽一个纯谓词，**不新增决策逻辑、不改转移表**。

- **`getResponsibleAgent(phase)`**：公开包装，委托 private `mapPhaseToAgent`（映射零改动）。既有聚合 `DownstreamPhase` / `buildDownstreamPhases()`（三元组 = `getAvailablePhases + getPhaseLabels + mapPhaseToAgent`，供 `flow status --verbose`）**本版零改动**，仅登记为第三消费点，并以同源一致性测试锁定 `verboseSummary().downstreamPhases` ≡ `getAvailablePhases(stage).map(...)`。
- **`listStageBlockingOpenReviews(reviews, stage)`**：阶段域阻塞 REV 纯谓词（见上表）。命令层 `assertNoBlockingOpenRev` 的内联两段 filter 已替换为该单点（输出文案与顺序逐字保留）；核心两处 done 门保留内联判定，以「同一 fixture 下 helper 结果 = done 门抛错清单」的等价性测试防未来漂移。
- **`DEFAULT_EFFECTIVE_REVIEW_TIER`**（`pipeline-schema.ts`）：生效档位单源常量；`flow advance` 的 `explicitTier ?? DEFAULT_EFFECTIVE_REVIEW_TIER` 值恒 `'full'`（行为零变化）；`flow next` / `stages[]` / `phases` 三出口引用同一常量。
- **只读承诺**：`flow next` 不 `save()` / 不 `appendLog` / 不改 phase；`legalNextPhases` 复用 `getAvailablePhases`（唯一取表点），与 `advance --dry-run` 接受集交叉断言（直接可达 ⊂ 接受集）。
- 三处档位语义（展示 vs 生效）与契约见 `manual/cli/commands.md`「调度决策面」与 `docs/json-contract.md` §12；架构判据见 `kb/architecture.md #调度决策单一权威架构`。
- **stage-98 文档收口复核**：无 API 变更；`--review-tier` 缺省 `full` 以契约 §12.3 为准（`flow phases --json.reviewTier` 为展示值）。

### 读命令 JSON 投影消费点（v1.2.2-stage-97）

> 核心层本阶段**零改动**（`flow-manager.ts` 不在 diff）；读命令的 JSON 投影只消费既有方法与数据，验证「聚合先行、双渲染后行」不要求核心新增 API。

- **`flow recover --json`**：消费 `recoverContext`（返回 `RecoveryContext {phase,currentOp,stageStatus,blockedBy,pendingTasks}`）+ `getAllStageStats()`，追加 `initialized` 后直出；未初始化（`initialized:false`）沿用人类模式 exit 0，不新增写盘。
- **`flow checkpoint list [stage] --json`**：消费 `listCheckpoints`（`string[]` 文件名）+ 短名归一兜底，输出 `{stage,checkpoints,count}`；空列表 `[]`、exit 0。
- **`flow log --last <n> --json`**：读取 `data.log` 末尾 n 条（`Math.max(1, parseInt(...) || 10)` 为既有语义），输出 `{count,entries:[{time,agent,action,detail}]}`；不写盘。
- **边界**：`--dry-run` / JSON 模式均不改变上述方法的读语义；`flow archive` 判据明细复用核心/归档层既有判据函数（见 `manual/cli/commands.md`「读命令 `--json` 全量补全与判据扩展」）。
- 架构判据见 `kb/patterns.md #读命令 `--json` 全量补全`；契约见 `docs/json-contract.md` §5 / §13。

## 状态/相位单一事实源（v1.1.4-stage-62）

- **`status` 语义**：`stage.status` 是 `stage.phase` 的**粗粒度投影**，**单一事实源 = `phase`**。任何 `status` 都可由 `phase` 重新投影得到，故对账/修正只允许 `phase → status` 单向。
- **`mapPhaseToStageStatus(phase, currentStatus)`（v1.1.4-stage-62）**：**不含 `testEnabled` 形参**（该键已移除）；`review_passed` **恒返回 `'review_passed'`**（**中间相位不投影终态 `done`**）；`review_failed → 'review_failed'`、`test_passed → 'testing'`、`archiving → 'archiving'`、`done → 'done'`，其余相位 `default → currentStatus`。**不变量**：任何**非 `done`** 相位都不得投影为 `'done'`（防止 `flow advance` 前置 auto-repair 误锁 `done`）。
- **`autoRepairInconsistency` 方向（单向，phase 权威）**：
  - `status==='done' && phase!=='done'` → **以 `phase` 为权威**，将 `status` 修正为投影值（**撤销非法 `done`**）；
  - `phase==='done' && status!=='done'` → 同步 `status='done'`（合法方向）。
  - **禁止任何 `status → phase` 前推**（绝不把 `phase` 改成 `done` 迁就 `status`）。
- **锁根因链与修复**（原布尔测试门禁键关闭场景）：该键关闭 → `advance --to review_passed` 时映射提前把 `status` 投影为终态 `done` → 下一步 `advance --to test_pending` 入口 auto-repair **反向**把 `phase` 锁成 `done` → `findPhasePath(done → test_pending)` 返回 `no-path`，确定性报错（6/6 复发）。**修复**：① 映射去 `testEnabled` 形参（`review_passed` 恒 `'review_passed'`）；② auto-repair 方向反转为仅 `phase → status`。
- **`STAGE_STATUS_VALUES`（导出）**：粗粒度状态枚举 `['planned','review_failed','review_passed','testing','archiving','done']`，由 `mapPhaseToStageStatus` 全部返回值 ∪ 初始值 `planned` 派生，供 `stage set --status` 值域校验复用（单一事实源，禁止命令层硬编码）。

## 配置级联与有效值来源（stage-42）

`buildCascadeConfig(stageId?)`（内部）+ `resolveEffectiveConfig()` / `resolveStageWorkflowMode(stageId?)`（公开）构成**唯一解析权威**，供 `flow status --verbose` 级联表与 `openfeel config effective` 两个出口共用（`rg` 实证：`buildCascadeConfig` 无参调用方仅 `verboseSummary` 与 `resolveEffectiveConfig` 两处——**静态约束**：新增消费点一律显式传 stage）。

> **`buildCascadeConfig(stageId?)` 带 stage 形参（v1.1.7-stage-74，REV-74-001）**：以 `stageId ?? this.data?.pipeline.current.stage` 取目标阶段 status.md（经 `findStatusPath(stageId)`）。**无参 = 当前阶段域**（行为逐字不变）；显式传参 = **任意阶段域**（防「被操作 stage ≠ current.stage」时读错阶段）。`resolveStageWorkflowMode(stageId?)` 即此入口的公开包装（`{ value, source }`）。

优先级链（低 → 高）：`builtin` < `profile.yaml`（全局画像兜底）< `config.yaml defaults` < `status.md` 覆盖

| 层 | 来源 | 说明 |
|----|------|------|
| `profileDefaults` | `~/.config/openfeel/profile.yaml` | **仅取 `preferences.auto_advance` 单值**（不做 `preferences` 整体替换）；**stage-47（`config/BUG-003`）起仅当画像文件真实存在且原始 YAML 显式声明 `preferences.auto_advance`（`enabled`/`disabled`）时填充**，文件缺失/解析失败/缺键或非枚举值 → 不填 → 落 `builtin`；`readProfile()` 自身异常安全行为不变 |
| `configDefaults` | `.openfeel/config.yaml` `defaults` 块 | 全部键 `String(value)` 收集；文件不存在或解析失败则为空（**逐键经 `ConfigDefaultsSchema` 校验**，非法跳过 + warn） |
| `statusOverrides` | 目标阶段的 `status.md`（缺省 = 当前 `pipeline.current.stage`；stage 形参路径 = 该阶段） | 正则提取 `**执行模式**` → `execution_mode`、`**自动推进**` → `auto_advance`、**`**工作流模式**` → `workflow_mode`**（v1.1.7-stage-74 增，**v1.2.1-stage-90 值域扩为 `full|fast|general`**，正则经 `WORKFLOW_MODES` 同源构造） |
| `effective` | 浅合并 `{...profileDefaults, ...configDefaults, ...statusOverrides}` | 三层均为扁平 `Record<string,string>`，无嵌套覆盖风险 |

- **受管键集合 `EFFECTIVE_CONFIG_KEYS`（v1.1.7-stage-74 扩为四键）**：`execution_mode` / `auto_advance` / `merge_mode` / `workflow_mode`——`resolveEffectiveConfig` 按此枚举产出 `{ value, source }`。
- **`workflow_mode` 的 profile 层有意不承载**：`DEFAULT_PROFILE` / `ProfilePreferencesSchema` 不含该键（画卷 = 用户个人偏好）；`resolveStageWorkflowMode` 的 profile 分支为对称性保留、实际不产出（REV-74-005）。

来源判定与合并顺序逐字对应：`status.md > config.yaml > profile.yaml > builtin`（三层皆无 → `String(DEFAULT_CONFIG[key])` 标 `builtin`）。

> **`config/BUG-003` 已修复（v1.1.2-stage-47，`buildCascadeConfig`）**：画像层改为「文件真实存在 + 原始 YAML 显式声明」双条件，无画像环境下来源正确落 `builtin`（`auto_advance: disabled [来源: builtin]`）；有 profile 且显式值时仍为 `profile.yaml`。**测试注意**：`effective` 是三层**显式声明值的浅合并**（无 builtin 回填），故无画像时 `effective.auto_advance` 为 `undefined`，而 `resolveEffectiveConfig()` 经 `DEFAULT_CONFIG` 回填后为 `{ value: 'disabled', source: 'builtin' }`——两者语义不同，断言不可互换。

> **新建阶段初值不同于级联（v1.1.4-stage-63）**：新阶段 `status.md` 的 `执行模式`/`自动推进` 初值取自 `core/config.ts` 的 `resolveConfigDefaults(projectPath)`（**只读 `config.yaml.defaults`、不做 effective 合并、不读 status.md**，见 `manual/core/config.md`），再经 `ensureStageSkeleton`/`addStage` 的 `overrides` 显式覆盖。**级联解析链（本节的 `buildCascadeConfig` / `resolveEffectiveConfig`）零改动**：`status.md > config.yaml > profile.yaml > builtin` 的有效值优先序不变。存量阶段批量回填由 `syncConfigFieldToStages`（上表）承担，与新建继承分工不重叠。

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
- **`advance_stage_phase` / `reset_stage_phase` 的 `detail` 追加可选键**（v1.2.1-stage-86，T4）：`session_id`（恒写）/ `resumed`（条件写，跨会话恢复标注）——详见「op 时间字段与跨会话恢复标注」节。

## 数据位置

`flow.json` 位于项目根 `.openfeel/` 下，含 `pipeline`（宏观状态 + 当前阶段/op）、`stages`（各阶段独立状态机）、`reviews`、`log`、`requirements`（**顶层可选**，v1.2.0-stage-81 起）。

## 需求字段（v1.2.0-stage-81）

- **`FlowData.requirements?: RequirementData[]`**（顶层可选，类比 `reviews`）——需求条目存储段；类型定义与需求原语见 `manual/core/req.md`。**读侧宽容**：`load()` **不补齐**该字段（**不注入**）；读侧由 `src/core/req/requirement-ops.ts` 的 `getRequirements` 派生 `?? []`，写侧 `addRequirement` 内 `??= []` 兜底——对齐 REV-78-015（stage-79 移除 `meta.archived_versions` load 补齐）的方向，避免任意 `load→save` 向存量 `flow.json` 注入 `requirements: []`。**`load()` / `save()` 对既有语义零改动**（净变更 = 1 `import type` + 2 处字段声明 + 注释）。
- **`StageData.requirement_id?: string | null`**（单值可空）——需求↔阶段 **1:N** 的「阶段侧」关联；缺省 ≡ `null`（存量 = 遗留无需求，不迁移）。
- **`requirements` 随版本归档的口径留后续版本**（本版**不归档** `requirements`）；需求层**携带**模式属性（`RequirementData.workflow_mode?`，v1.2.1-stage-90 supersede 旧「正交」口径）——模式仅经单点解析器 `resolveStageWorkflowMode` 消费、**不入聚合**（见「需求级模式与载体制约束」节）。

## 需求聚合回写接入（v1.2.0-stage-83）

> 把「需求状态 = 关联阶段 phase 聚合投影」落地为**对称回写**；两热点均为**最小追加**（净 **8+/0-**：1 行 import + 2 处调用带注释），**零控制流改动、零新增写盘点、同事务复用既有 `save()`**。回写逻辑在 `src/core/req/aggregate.ts :: syncRequirementStatus`（纯内存），本文件仅调用。

- **热点 ① `advanceStagePhase`（done 分支）**：在 `targetPhase === 'done'` 分支内（`this.endStage(key)` 与既有注释之后、`return true` **之前**）调用 `syncRequirementStatus(this.data, key)`——**仅 done 分支触发**；非 done 推进 / `prevStatus === 'done'` 重复推进均**不触发**。`return true` / `endStage` 顺序 / `autoCommitOnDone` 语义零改动。
- **热点 ② `resetStagePhase`（全复位路径）**：在 phase + status 写入 + 审计块（`appendLog`）**之后**、`const curStage` **之前**调用同一入口——**重算聚合视图**（`聚合 ≠ done ∧ status === done → 回退 in_progress`）。**落点须在** `if (normCur === key)` 守卫**之外**（否则非 current 阶段复位不回写——REV-83-013）；`dryRun` / no-op 早退（`resetStagePhase` 前段）**早于**本点（不可达）。
- **`--dry-run` 零回写（双路径）**：`advanceStagePhase` **无 `dryRun` 形参**（`flow advance --dry-run` 于命令层截断）；`resetStagePhase(..., { dryRun })` 引擎早退——两路径均不写内存、不写盘（含聚合）。
- **前置集单点**：`AUTO_DONE_PRECONDITION = ['scheduled', 'in_progress']`（`aggregate.ts`）——回写守卫与 `flow health` 需求漂移判据**同口径**；前置集外（`draft`/`blocked`/终态）零动作零审计。
- **零回归**：无 `requirement_id` / 无 `requirements` 键的阶段推进**逐字节不变**（补丁前/后归一化快照 diff 为空；三路径：本函数 / `flow wizard` / deprecated `advancePhase` 同口径）。

> 详见 `manual/core/req.md`「聚合投影与对称回写」节；`flow health` 新增「需求对账」/「需求漂移」两 section（warn-only、不改退出码、不参与 `--fix`）。

## op 时间字段与跨会话恢复标注（v1.2.1-stage-86）

### `Op` 可选时间字段（T3）

`Op` 接口（`flow-manager.ts:53-61`）追加两个**可选**字段（读侧宽容、**不 load 补齐**）：

| 字段 | 类型 | 写入时机 | 语义 |
|------|------|----------|------|
| `attempted_at?` | `string`（ISO） | `recordAttempt` **三分支**各写 | 最近一次 attempt 记录时间 |
| `completed_at?` | `string`（ISO） | 仅 **pass** / **fail-exhausted** | 进入 `done` / `failed` 终态时间 |

- **三分支写值**：`pass` → 两者均写（相等）；`fail-retry` → **仅** `attempted_at`；`fail-exhausted` → 两者均写；**`draft` 拒绝分支零追加**（B4-5 语义保持）。
- **读侧宽容**：`load()` **零改动**（不加补齐逻辑）→ 存量 `load→save` **零注入**天然成立（kb #顶层可选字段「读侧宽容不注入」模式）。
- **消费语义**：`exec_running` 窗口可按 op 分段 ≈（上一 op `attempted_at` | 阶段进入时间, 本 op `attempted_at` / `completed_at`]——**无需 op 级 phase**，不改 phase 枚举。

### 转换审计 detail 追加 `session_id` / `resumed`（T4）

`advance_stage_phase`（`:1502-1507`）与 `reset_stage_phase`（`:1598-1603`）条目的 `detail` 追加两个**可选**键：

- `session_id`：**恒写**（含 `proc:` 单进程标注）——经 `getSessionId({ projectPath })`（`src/core/session.ts`；core→core 零 import 环）。
- `resumed`：**条件写**——由私有 `computeResumed(log, stageKey, exitedPhase, currentId)` 判定：从 log 尾部回扫该 stage 最近一条 advance/reset 条目（要求 `detail.to === exitedPhase`），**本次会话 ≠ 上次转换会话 → `true`**；同会话 → `false`；**任一侧不可信（`proc:` 级）/ 缺失 / 值非法 → `null` → 省略字段**（不臆断）。
- **计算置于 `appendLog` 之前** → 回扫天然排除本次条目。
- **约束**：纯内存、**不新增写盘点**（落盘归既有命令层单次 `save()`，同事务）；**不改控制流与返回值**；不改既有 action 命名。

> 用途：使「活跃 / 闲置」语义**显式可辨**（跨会话恢复段 vs 同会话段），替代分析层「phase 段 >20min」启发式；与 `flow metrics` 口径注记联合解释（phase 窗口含跨会话闲置）。

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
