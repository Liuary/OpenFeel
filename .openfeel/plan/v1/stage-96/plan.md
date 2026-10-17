# v1.2.2-stage-96 计划 — 调度决策权威（flow next 与阶段调度属性）

- **阶段**：`v1.2.2-stage-96`（v1.2.2 四阶段之二 · 决策权威）
- **依赖**：**hard: `v1.2.2-stage-95`**（契约助手、错误封装、JSON 模式单点必须先冻结）
- **优先级**：P0（DSH 适配器核心诉求：消除 `PHASE_AGENT_MAP` 镜像与文本决策）
- **关联需求**：REQ-001（CLI 机器可读契约与调度决策下沉（DSH 适配器需求）；关联由 Feel 经 `openfeel req link` 执行）
- **制定人**：openfeel-planner ｜ **制定时间**：2026-10-17 ｜ **修订轮**：修订 0（初稿）
- **基线**：**HEAD `38f1e05`** + 当前工作区；上游门禁登记值 71 文件 / 1719 用例、`lint i18n` 945、`lint kb` 0 过期 / 624 引用、`--version` 1.2.1、flow.json `revision 1188` / 17 stages 全 done / `reviews` 0。**实况复核**：stage-95 完成后以其门禁实测值为准（本阶段不得引用旧值）。
- **定位**：把「当前阶段 + 相位 → 谁负责 → 合法下一相位 → 建议命令 → 守卫 → 阻塞项」收敛为 CLI 单点输出；并让 `flow status --json` 一次给出每阶段调度属性，消除适配器 N 次 `flow mode` 调用。
- **范围（文件级）**：
  - **修改**：`src/core/flow-manager.ts`（公开 `getResponsibleAgent` / 抽阻塞 REV 单点谓词）；`src/core/pipeline-schema.ts`（如需新增 `DEFAULT_EFFECTIVE_REVIEW_TIER` 常量）；`src/commands/flow.ts`（`flow next` / `buildStatusJson` / `flow phases --json`）；`src/core/i18n-data/{zh-CN,en}.ts`；`test/core/flow-manager.test.ts`、`test/commands/flow.test.ts`、`test/cli/json-contract.test.ts`、`docs/json-contract.md`。
  - **只读**：其他命令文件、`src/cli/**`。
- **边界**：
  1. **只读新增**：`flow next` 不写盘、不改 phase、不 save、不 appendLog。
  2. **不改转移表**：不裁剪、不新增边、不改 `getValidTargets` / `resolveTransitionsForMode` 语义。
  3. **`reviewTier` 只增不改**：既有 7 键 / `stages[]` 既有 5 字段逐字保留、顺序不变。
  4. **不实现**读命令 `--json`（stage-97）；不实现 `req list` 扩展 / `flow archive` 明细（stage-97）。
  5. **不引入第三方依赖**；不直写 `flow.json`。

## KB 检索（`openfeel-check-kb`）

- `kb/architecture.md #双模式转移表选择：getValidTargets 单一取表点 + stage→mode→表 三元解析` → `legalNextPhases` 必须复用单一取表，禁第二份。
- `kb/architecture.md #需求级模式属性架构：需求携带模式 + 单点解析链第二条` → `workflowMode` 必须经 `resolveStageWorkflowMode` 单点。
- `kb/architecture.md #审查档位架构（裁剪谱 / 唯一取表点 / 边收缩回退）` → `reviewTier` 展示值语义与 `effectiveReviewTier` 的区分依据。
- `kb/patterns.md #CLI --json 成功/失败同契约` → 新命令 JSON 形态。
- `kb/patterns.md #零回归取证范式` → 既有 5 字段 / 7 键键序不变的取证。
- `kb/patterns.md #同类缺陷一次全量扫描` → phase→agent 映射与阻塞 REV 谓词的消费点全枚举。
- `kb/troubleshooting.md #断言串与落文逐字核对纪律` → `flow next` 字段名与文档/测试同批。
- **无**「flow next / 阶段调度属性聚合」既有条目 → 归档轮补沉 patterns。

---

## 一、实测清单（基线 HEAD `38f1e05`）

### 表 A：决策数据源与消费点

| # | 事实（实测） | 位置 | 结论 |
|:-:|------|------|------|
| A1 | `mapPhaseToAgent` **private**：prefix → agent（plan/scheme/exec/review/test/archiving/done）；无 idle | `flow-manager.ts:2550-2570` | 新增公开 `getResponsibleAgent(phase)` 委托；命令层禁复制 |
| A2 | `getPhaseLabels(lang)` 15 项双语；缺省回落 phase 原文 | `flow-manager.ts:2236-2290` | `phaseLabel` 复用 |
| A3 | `getAvailablePhases(stageName?, tier='full')` → 当前相位直接可达；`getValidTargets` 单一取表 | `flow-manager.ts:2030-2041 / 1996` | `legalNextPhases` 复用 |
| A4 | `resolveStageWorkflowMode(stageId?)` 单点链：status.md > 需求级 > config > profile > builtin | `flow-manager.ts:2443-2469` | 每阶段 `workflowMode` 唯一来源 |
| A5 | `MODE_DERIVED_TIER = {full:'full', fast:'lean', general:'full'}`；`flow advance` 缺省 `effTier = explicitTier ?? 'full'` | `flow-manager.ts:497-501`；`flow.ts:811` | `reviewTier` 展示值；`effectiveReviewTier='full'` |
| A6 | 阻塞 REV 阶段域过滤在 `assertNoBlockingOpenRev`（命令层）与 `advanceStagePhase` done 门（核心层）各一份 | `flow.ts:2397-2417`；`flow-manager.ts:1512-1527` | 抽 `listStageBlockingOpenReviews(reviews, stage)` 单点；`flow next` 与命令层复用 |
| A7 | `flow status --json.stages[]` 恰 `{id,phase,status,deps,ops}`；`ops` 为 opId→state | `flow.ts:2467-2473`；`collectOpStates:2442` | 追加 5 字段，既有键序不变 |
| A8 | `flow phases --json` 恰 7 键，`reviewTier` 在末位 | `flow.ts:454` | 追加 2 键到末位 |
| A9 | `flow next` 不存在（实测 unknown command exit 1） | 实测 | 新增命令 |
| A10 | `StageData.requirement_id?: string \| null` 已在位 | `flow-manager.ts:103-116` | `requirementId = ?? null` |
| A11 | `FlowData.reviews` 含 `blocking?: boolean`（缺省 undefined = 阻塞） | `flow-manager.ts:72-90` | 输出解析为布尔：`blocking !== false` |

### 表 B：门禁基线

| 项 | 起点（stage-95 完成后复核） | 阶段末目标 |
|----|------|------|
| `npm test` | stage-95 登记值 | 新基线（新增 flow next / stages 属性 / phases 消歧用例） |
| `npx tsc --noEmit` | 0 | 0 |
| `lint i18n` | stage-95 登记值 | ≥ 起点 + 新 guard/文案键（逐键列名） |
| `lint kb` | 0 过期 | 0 |
| `npm run build` | ×2 幂等 | ×2 幂等（本阶段不改 templates-data） |
| 人类输出 | 基线快照 | `flow status` / `flow phases` / `flow` 帮助逐字不变（除新增 `flow next`） |

---

## 二、目标语义与不变量

| 维度 | 内容 |
|------|------|
| `flow next` 语义 | 只读聚合：当前阶段（缺省 `pipeline.current.stage`）+ phase → responsibleAgent / phaseLabel / workflowMode / reviewTier / effectiveReviewTier / legalNextPhases / suggestedCommand / guards / blockingReviews |
| `flow status` 语义 | `stages[]` 每元素追加 `workflowMode`（解析值）/ `requirementId` / `reviewTier`（展示）/ `effectiveReviewTier`（缺省推进）/ `opsSummary:{total,byState}` |
| `flow phases` 语义 | 既有 `reviewTier` 为**展示值**；追加 `displayReviewTier`（同值显式名）/ `effectiveReviewTier`（推进缺省 = full） |
| 单源纪律 | phase→agent 经 `getResponsibleAgent`；模式经 `resolveStageWorkflowMode`；可达相位经 `getAvailablePhases`；阻塞 REV 经 `listStageBlockingOpenReviews` |
| 零回归 | 既有 `flow status` 5 字段 / `flow phases` 7 键键序不变；人类输出不变；只读零写盘 |

**不变量**：

1. `flow next` 的 `responsibleAgent` 与 `mapPhaseToAgent` 输出**逐字一致**（除无活跃阶段 → `'feel'` 的显式约定）。
2. `flow next.legalNextPhases` 的每个元素均被 `flow advance --stage <stage> --to <phase>`（缺省 tier）接受；非法相位不在其中（不要求覆盖多步跳跃集）；测试交叉断言。
3. `effectiveReviewTier` 恒为 `'full'`（本版不引入阶段级显式生效档位）。
4. `blockingReviews` 仅含**当前阶段**（`r.op === stage || r.op.startsWith(stage+'.')`）的 blocking open REV。
5. `flow status --json` 既有 5 字段类型与顺序不变；`opsSummary.total === Object.keys(ops).length`；`byState` 仅含观测到的状态。
6. `flow phases --json` 既有 7 键类型与顺序不变；新增 2 键在末位。
7. 不写盘、不 save、不 appendLog；不引入第三方依赖。

---

## 三、变更点清单（编号 T）

### T1 — `flow next [--json]`

- **实现**：
  - `src/commands/flow.ts` 新增 `flow.command('next')`：`.option('--json')`；人类输出 + JSON 输出。
  - 数据获取：`createManager()`；未初始化 → JSON refusal `NO_INIT` / 人类 `common.errorNoInit` exit 1。
  - `stage = data.pipeline.current.stage || null`；无 stage → `phase=null`，`responsibleAgent='feel'`，`legalNextPhases=[]`，`suggestedCommand=null`，`guards=[...]`。
  - 有 stage：`phase = data.stages[stage].phase`；`phaseLabel = mgr.getPhaseLabels(lang)[phase] ?? phase`；`responsibleAgent = mgr.getResponsibleAgent(phase)`；`workflowMode = mgr.resolveStageWorkflowMode(stage).value`；`reviewTier = MODE_DERIVED_TIER[workflowMode]`；`effectiveReviewTier='full'`；`legalNextPhases = mgr.getAvailablePhases(stage)`；`suggestedCommand = legalNextPhases[0] ? \`openfeel flow advance --stage ${stage} --to ${legalNextPhases[0]}\` : null`；`blockingReviews = listStageBlockingOpenReviews(data.reviews, stage)`。
  - `guards`（本地化字符串数组；Q5 定稿）：auto-advance disabled、blocking REV 非空、无合法目标、展示档位≠生效档位（可选）。
  - JSON 固定键序：`schemaVersion,stage,phase,phaseLabel,responsibleAgent,workflowMode,reviewTier,effectiveReviewTier,legalNextPhases,suggestedCommand,guards,blockingReviews`；无值 `null` / `[]`。
  - `blockingReviews` 元素：`{id,title,priority,op}`（P2-1 固定键集）。
- **人类输出**：阶段 / 相位 / 负责 Agent / 合法下一相位 / 建议命令 / 守卫 / 阻塞 REV；无活跃阶段时友好提示。
- **测试**：core 层 15 phase 矩阵；命令层 JSON 键集/值；只读（文件哈希 / save 调用零）；与 advance 接受集交叉。
- **边界**：本版仅当前阶段，不新增 `--stage`（Q6）；不写盘。

### T2 — `FlowManager` 单点方法

- **实现**：
  - `public getResponsibleAgent(phase: PipelinePhase): string { return this.mapPhaseToAgent(phase); }`（或把 `mapPhaseToAgent` 改 public 并更新内部调用；优先新增包装，改动面最小）。
  - 新增导出纯函数 `listStageBlockingOpenReviews(reviews: ReviewItem[], stage: string): ReviewItem[]`（阶段域过滤）；`flow next` 与 `assertNoBlockingOpenRev` 复用；`advanceStagePhase` done 门**本版不改**（保持行为逐字，避免回归）。
  - `src/core/pipeline-schema.ts` 或 `flow-manager.ts` 导出 `DEFAULT_EFFECTIVE_REVIEW_TIER: ReviewTier = 'full'`（单源常量）。
- **测试**：`getResponsibleAgent` 15 phase 断言；`listStageBlockingOpenReviews` 前缀重叠 / blocking 缺省 / status 过滤断言。
- **边界**：不改 `mapPhaseToAgent` 的既有映射结果；不改 `advanceStagePhase` 行为。

### T3 — `flow status --json.stages[]` 调度属性

- **实现**：`buildStatusJson` 的 stage map 追加（固定顺序）：
  - `workflowMode: mgr.resolveStageWorkflowMode(id).value`
  - `requirementId: stage.requirement_id ?? null`
  - `reviewTier: MODE_DERIVED_TIER[workflowMode]`
  - `effectiveReviewTier: DEFAULT_EFFECTIVE_REVIEW_TIER`
  - `opsSummary: { total, byState }`
- `byState`：对 `collectOpStates(stage)` 的值计数；仅含出现的状态；`total = sum`；空 ops → `{total:0,byState:{}}`。
- 既有 `id,phase,status,deps,ops` 保持原顺序；新增字段在其后。
- **测试**：键序 / 类型 / 值（fixture 含 requirement_id / 空 ops / 多状态）；既有断言更新。
- **边界**：不改 `pipeline` / `counts`；不改 `ops` 类型。

### T4 — `flow phases --json` 消歧字段

- **实现**：在既有 JSON 对象末位追加：`displayReviewTier: MODE_DERIVED_TIER[derivedMode]`、`effectiveReviewTier: DEFAULT_EFFECTIVE_REVIEW_TIER`。既有 `reviewTier` 保持不变（= displayReviewTier）。
- **测试**：7 键顺序/值不变；9 键；`--mode fast` 时 `reviewTier='lean'` / `displayReviewTier='lean'` / `effectiveReviewTier='full'`；`--mode general` 时 `reviewTier='full'`。
- **边界**：不改人类输出（`flow phases` 人类分支）；不改 `transitions` / `transitionsDiff`。

### T5 — i18n + 契约测试 + 门禁

- 新增 `flow.next.*` 文案（标题 / 字段标签 / guards / 无活跃阶段 / 阻塞项）；zh/en 成对。
- `docs/json-contract.md` 追加 `flow next` / `flow status` / `flow phases` 冻结表。
- 门禁：test / tsc / i18n / kb / build ×2；人类输出快照 diff（`flow status` / `flow phases` 除新增 `next` 外零变化）。

---

## 四、开放问题（方案期 / 执行期定稿）

- **Q1**：`guards` 文案与触发集合（auto-advance disabled / blocking REV / 无合法目标 / 展示档位≠生效档位）；是否输出 `guardCodes`（本版不做）。
- **Q2**：`suggestedCommand` 多合法目标时取转移表首项是否稳定；是否需要 `suggestedPhase` 独立字段（倾向不需要）。
- **Q3**：`flow next` 是否支持 `--stage <id>`（本版倾向不支持；适配器用 `flow status` 获取多阶段后自行判断）。
- **Q4**：`flow status --json` 每阶段调用 `resolveStageWorkflowMode` 会重复读取 status.md；是否在单次 `buildStatusJson` 内做缓存（17 阶段量级可接受；方案期定稿）。
- **Q5**：`opsSummary.byState` 是否包含零值状态（倾向仅含观测到的状态）。

## 五、验收要点（阶段级）

1. **`flow next`**：JSON 12 键齐全、键序固定；`responsibleAgent` 与 `mapPhaseToAgent` 同源；`legalNextPhases` 每个元素均被 `flow advance` 接受；非法相位不在其中；`blockingReviews` 阶段域正确；只读零写盘；人类输出可读。
2. **`flow status --json`**：既有 5 字段逐字不变；新增 5 字段类型/值正确；`opsSummary` 与 `ops` 同源；`requirementId` 空值 `null`。
3. **`flow phases --json`**：既有 7 键逐字不变；新增 2 键；展示值/生效值语义可程序化区分；`fast` / `full` / `general` 三模式断言。
4. **零回归**：`flow status` / `flow phases` 人类输出快照 diff 空；既有测试全绿。
5. **门禁**：test / tsc / i18n / kb / build 全绿；新增用例登记。

## 六、风险

| # | 风险 | 影响 | 缓解 |
|:-:|------|------|------|
| R-96-1 | **决策映射漂移**（命令层复制 phase→agent / 阻塞 REV 第三份） | 高 | `getResponsibleAgent` 单点 + `listStageBlockingOpenReviews` 抽取 + 同源断言 |
| R-96-2 | **`legalNextPhases` 与 advance 接受集不一致** | 高 | 复用 `getAvailablePhases` + 交叉测试（逐 phase 与 `flow advance --dry-run` 对比） |
| R-96-3 | **`reviewTier` 消歧仍被误用** | 中 | 三处输出同时给 display/effective + 文档固定说明 + DSH 断言 |
| R-96-4 | **`flow status` 逐阶段解析开销 / 不一致** | 中 | 单次调用复用同一 manager；必要时缓存；契约测试 |
| R-96-5 | **既有键序被重排** | 中 | 只追加末位 + 键序断言 + 快照 diff |
| R-96-6 | **`flow next` 只读承诺被破坏** | 低 | 文件哈希 / 零 save 断言；审查聚焦写盘调用 |

**回滚**：`flow next` 删除即回退；`getResponsibleAgent` / 谓词抽取为增量；`stages[]` / `phases` 字段追加可 revert；无数据格式破坏。

## 七、承接 REV 与处置表（REV-85-002 固化口径）

- **判据源**：flow.json `reviews: 0` + 用户台账 `REV-92` / `REV-94` + stage-95 处置结果 + 本会话实测。
- **上游 stage-95**：本阶段承接其契约助手 / 错误封装；stage-95 新增 REV 按流程处置（本表在 stage-95 归档后补记）。

| 上游条目 | 优先级 | 去向 | 依据 |
|---------|:--:|------|------|
| REV-92-006（BFS 报错语义） | low | **台账保留**（本阶段不使用 `findPhasePath`） | 非本阶段面 |
| REV-92-002（est_ops 对账） | low | **台账保留**（本阶段 est_ops=3 已在 deps.yaml 登记） | 本计划 §附录 A |
| REV-94-005 / 006 | low | **转 stage-98**（文档/入管核对） | 承 stage-95 三分 |
| REV-94-007 | low | **台账保留**（部署侧） | 承 stage-94 留痕 |
| 其余已闭合条目 | — | **零动作**（登记） | 台账实测 |

- **三分结论**：本阶段处置 0／显式转出 2（REV-94-005/006）／台账保留 2（REV-92-006、REV-92-002）→ **零灭失成立**。

## 八、op 拆分建议（供 openfeel-schemer 定稿；`est_ops = 3`）

| op | 内容 | 主要文件 | 依赖 |
|:--:|------|------|------|
| `op-001` | **T2 单点方法 + T1 `flow next`**：getResponsibleAgent / listStageBlockingOpenReviews / DEFAULT_EFFECTIVE_REVIEW_TIER / 命令 + 人类输出 / core+命令测试 | `src/core/flow-manager.ts`、`src/core/pipeline-schema.ts`、`src/commands/flow.ts`、`test/core/flow-manager.test.ts`、`test/commands/flow.test.ts` | hard: stage-95 |
| `op-002` | **T3 `flow status` 调度属性 + T4 `flow phases` 消歧**：buildStatusJson / phases JSON / 契约表更新 / 测试 | `src/commands/flow.ts`、`docs/json-contract.md`、`test/commands/flow.test.ts`、`test/cli/json-contract.test.ts` | hard: op-001（单点方法） |
| `op-003` | **T5 i18n + 门禁 + 收尾**：双表文案 / 快照 diff / 全量门禁 | i18n 双表、`test/**` | hard: op-001 / op-002 |

- **文件冲突（mutual_exclusion）**：`src/commands/flow.ts` 由 op-001 与 op-002 共同触碰 → 串行；op-003 收尾。
- **op 级依赖与文件清单由 openfeel-schemer 落 `ops/deps.yaml`**。

## 九、修订记录

| 时间 | 制定人 | 说明 |
|------|--------|------|
| 2026-10-17 | openfeel-planner | 初稿：依据大计划 §二/§三/附录 A「stage-96」+ DSH P0-1/P1-1/P2-2 + 源码实测（2 表 17 项）；变更点 T1~T5；开放问题 Q1~Q5；风险 R-96-1~6；承接三分（处置 0 / 转出 2 / 保留 2）；op 拆分 3 项。**只写本计划文档**。 |
