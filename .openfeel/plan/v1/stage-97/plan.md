# v1.2.2-stage-97 计划 — 读命令 `--json` 全量补全

- **阶段**：`v1.2.2-stage-97`（v1.2.2 四阶段之三 · 读命令补全）
- **依赖**：**hard: `v1.2.2-stage-95` / `v1.2.2-stage-96`**（契约助手 / 错误封装 / 决策权威先冻结）
- **优先级**：P0（DSH 适配器 P0-2 主体 + P1-3 / P1-4 / P2-4）
- **关联需求**：REQ-001（CLI 机器可读契约与调度决策下沉（DSH 适配器需求）；关联由 Feel 经 `openfeel req link` 执行）
- **制定人**：openfeel-planner ｜ **制定时间**：2026-10-17 ｜ **修订轮**：修订 0（初稿）
- **基线**：**HEAD `38f1e05`** + 当前工作区；上游登记值 71 文件 / 1719 用例、`lint i18n` 945、`lint kb` 0 过期 / 624 引用、`--version` 1.2.1、flow.json `revision 1188` / 17 stages 全 done / `reviews` 0。**实况复核**：stage-95/96 完成后以其实测值为准。
- **定位**：把适配器仍需文本解析的 13 个读命令面一次性补齐 `--json`，并完成 `req list` 关联阶段 / `flow archive` 判据明细 / 阶段归档 JSON 三个扩展。
- **范围（文件级）**：
  - **修改**：`src/commands/{stage,flow,knowledge,config,view,plan,project,archive,req}.ts`；`src/core/req/aggregate.ts`（新增 `listLinkedStages` 单点）；`src/core/flow-archive/grouping.ts`（仅复用，预期不改）；`src/core/i18n-data/{zh-CN,en}.ts`；对应测试；`docs/json-contract.md`。
  - **只读**：`src/cli/**`、`src/core/flow-manager.ts`（除 stage-96 已改面）。
- **边界**：
  1. **人类输出逐字不变**：每命令先构造数据对象，再分别渲染人类文本 / JSON；补丁前/后快照 diff 空。
  2. **不改既有 18 出口字段**（`req list` / `flow archive` 只增不改；其余读命令为新增 `--json` 开关）。
  3. **不改 `flow archive` 判据口径**；`--dry-run` 零写盘。
  4. **不实现** `flow next` / `flow status` 调度属性（stage-96 已完成，本阶段只读不改）。
  5. **不引入第三方依赖**；不直写 `flow.json`。

## KB 检索（`openfeel-check-kb`）

- `kb/patterns.md #CLI --json 成功/失败同契约` → 12 个新出口统一形态。
- `kb/patterns.md #零回归取证范式` → 人类输出快照 diff 与既有出口字段冻结。
- `kb/patterns.md #顶层可选字段「读侧宽容不注入」模式` → 读命令 JSON 不得改变 flow.json 读写。
- `kb/architecture.md #需求流转四层模型架构` + `#双层状态聚合架构` → `req list.linkedStages/progress` 复用 aggregate 单源。
- `kb/patterns.md #陈旧计数「全枚举」纪律` → 出口清单 / 字段清单全枚举。
- `kb/troubleshooting.md #默认开启写真实用户目录的副作用防护` → 命令实跑测试的隔离环境。
- `kb/troubleshooting.md #断言串与落文逐字核对纪律` → 字段名 / 文档 / 测试同批。
- **无**「读命令 JSON 批量补全」既有条目 → 归档轮补沉 patterns。

---

## 一、实测清单（基线 HEAD `38f1e05`）

### 表 A：13 个读命令面现状

| # | 命令 | 实现位置 | 数据源 / 现状 | JSON 要点 |
|:-:|------|----------|---------------|-----------|
| A1 | `stage status [stageId]` | `stage.ts:334-375`；`showStageStatus:179`；`parseStatusFields:91`；`parseTasks:108` | 人类文本；中文键字段；`listAllStages` 无参列表 | `stages[]` 或单阶段 `fields/tasks/blockedBy/statusPath`；字段规范名 Q7 |
| A2 | `flow recover` | `flow.ts:2051-2101`；`recoverContext:1309` | `RecoveryContext {phase,currentOp,stageStatus,blockedBy,pendingTasks}` + `getAllStageStats()` | 直出 + `initialized` + `stageStats` |
| A3 | `flow checkpoint list [stage]` | `flow.ts:1621-1645`；`listCheckpoints:670` | `string[]` 文件名 | `checkpoints:[string]` + `count` + `stage` |
| A4 | `knowledge search <q>` | `knowledge.ts:105-137`；`searchKnowledge` | `KnowledgeEntry[]`（含 content） | `query/limit/offset/results[]`（content 全文或摘要 Q8） |
| A5 | `knowledge list` | `knowledge.ts:28-56`；`listKnowledge:180` | 元数据表格 | `entries[]`（不含 content，保持概览轻量） |
| A6 | `knowledge index` | `knowledge.ts:142-170`；`getKnowledgeIndex` | `{categories,recentUpdates}` | 直出 |
| A7 | `knowledge dedup` | `knowledge.ts:175-242`；`findSimilarEntries` | 人类文本；本地 `--project` | `threshold/categories/matches[]/found/readOnly:true` |
| A8 | `config get` / `effective` | `config.ts:123-178 / 383-408`；`resolveEffectiveConfig:2411` | 项目/全局两模式；`effective` 为 `{value,source}` | `scope/key/value` / `effective` 映射 |
| A9 | `view list` | `view.ts:18-40`；`listReviews:187` | `ReviewItem`（`blocking?` 缺省阻塞） | `reviews[]` 含解析后的 `blocking:boolean` |
| A10 | `plan scheme list [stage]` | `plan.ts:310-343`；`listSchemes:890`；`detectFillState:4517` | `Scheme` + draft 标记 | `schemes[]` 含 `draft:boolean` / `fill` |
| A11 | `flow log --last <n>` | `flow.ts:1216-1245` | `data.log` | `entries[]` + `count` |
| A12 | `project overview` | `project.ts:17-172` | 实时扫描 | `project/dirs/stats/entries/techStack`；先聚合再渲染 |

### 表 B：扩展项现状

| # | 项 | 现状 | 结论 |
|:-:|------|------|------|
| B1 | `req list --json` | `req.ts:180-182` 输出 `{schemaVersion,requirements: rows}`；`rows` 为 `RequirementData[]` | 追加 `linkedStages` / `progress`；复用 `computeRequirementAggregate`（`aggregate.ts:41-57`） |
| B2 | `flow archive --dry-run --json` | `flow.ts:1746-1750` 判据拒绝 `error/notDone/blockingOpen`；`1783-1785` 成功 dry-run 仅计数 | 追加 `eligible/unfinishedStages/blockingReviews`；legacy 保留 |
| B3 | `openfeel archive <stage>` | `archive.ts:10-46` 人类输出；`archiveStage` 返回 `ArchiveResult \| null` | 新增 `--json`；`ARCHIVE_FAILED` refusal |
| B4 | 判据单源 | `listArchivableCandidates` + `listBlockingOpenRevsForVersion`（`grouping.ts:108`） | 复用，禁第二份 |
| B5 | 错误封装 | stage-95 已提供 `failRefusal` / `failInternal` / JSON 模式单点 | 每个新 `--json` 分支的失败路径接入 |

### 表 C：门禁基线

| 项 | 起点（stage-96 完成后复核） | 阶段末目标 |
|----|------|------|
| `npm test` | stage-96 登记值 | 新基线（13 命令 + 3 扩展的新增用例逐项登记） |
| `npx tsc --noEmit` | 0 | 0 |
| `lint i18n` | stage-96 登记值 | ≥ 起点 + 新 help/文案键（逐键列名） |
| `lint kb` | 0 过期 | 0 |
| `npm run build` | ×2 幂等 | ×2 幂等（本阶段不改 templates-data） |
| 人类输出 | 基线快照 | **逐字不变**（13 命令 + `archive` + `req list` + `flow archive`） |

---

## 二、目标语义与不变量

| 维度 | 内容 |
|------|------|
| 读命令 JSON | 13 个命令面均输出 `{schemaVersion:1,...}` 单文档；关键字段与人类输出等价；stdout 无人类文本 |
| 关联阶段 | `req list --json.requirements[].linkedStages=[{id,phase}]`；`progress={done,total}`；零关联 `[]` + `{0,0}` |
| 归档判据 | `flow archive --dry-run --json` 含 `eligible/unfinishedStages/blockingReviews`；判据与门禁同源；零写盘 |
| 阶段归档 | `archive <stage> --json` 含 `archivePath/opsCount/reviewsCount/knowledgeExtracts` |
| 错误 | 新 `--json` 命令失败走 stage-95 envelope；legacy `req` / `flow archive` 字符串载荷保留 |
| 零回归 | 人类输出逐字不变；既有 18 出口零删除；`flow.json` 零注入 |

**不变量**：

1. 每个命令的 JSON 分支**首行输出且纯 JSON**；不打印标题 / 进度 / 警告（警告走 stderr 或 `detail`）。
2. JSON 与人类输出**同源**：先构造数据对象，两个渲染器消费同一对象；禁止两套查询逻辑。
3. `req list` 的 `linkedStages` / `progress` 复用 `computeRequirementAggregate` 单源；新增 `listLinkedStages(data, reqId)` 供两处共用，禁第二份 `.filter(...requirement_id...)`。
4. `flow archive` 判据复用 `listArchivableCandidates` + `listBlockingOpenRevsForVersion`；`--dry-run` 不写归档文件 / 不 save / 不 appendLog。
5. `archive <stage> --json` 与人类输出同源；失败 `null` → `ARCHIVE_FAILED`；不改变归档写盘行为。
6. 每个命令的 JSON 退出码镜像人类模式（成功 0；拒绝 1；并发 2）。
7. 不引入第三方依赖；不改 `flow.json` 结构。

---

## 三、变更点清单（编号 T）

### T1 — flow/stage 读命令（5 个）

- **`stage status`**：新增 `--json`。单阶段：`{schemaVersion,stageId,statusPath,fields:{execMode,autoAdvance,status,reviewAgent,previousReviewAgent,updatedAt,workflowMode,raw},tasks:[{number,done,description}],blockedBy}`（Q7 定稿）；无参：`{schemaVersion,stages:[{stageId,status,statusPath}],count}`。人类输出不变。
- **`flow recover`**：新增 `--json`。`{schemaVersion,initialized,phase,currentOp,stageStatus,blockedBy,pendingTasks,stageStats}`；未初始化 → `initialized:false` + 空值（沿用人类 exit 0）。
- **`flow checkpoint list`**：新增 `--json`。`{schemaVersion,stage,checkpoints:[string],count}`；空列表 `[]`。
- **`flow log`**：新增 `--json`。`{schemaVersion,count,entries:[{time,agent,action,detail}]}`；空日志 `[]`。
- **`project overview`**：新增 `--json`。重构为 `collectProjectOverview(cwd)` 数据对象 + 两个渲染器；`{schemaVersion,project:{name,version,description},dirs,stats,entries,techStack}`；人类输出逐字不变。
- **测试**：每命令 `--json` 形状 / 人类快照 / 退出码。

### T2 — knowledge/config/view/plan 读命令（8 个）

- **`knowledge search`**：`{schemaVersion,query,limit,offset,results:[{title,category,date,enabled,content,summary}]}`（Q8 定稿 content 全文 vs 摘要）。
- **`knowledge list`**：`{schemaVersion,entries:[{title,category,date,enabled}],count}`。
- **`knowledge index`**：`{schemaVersion,categories,recentUpdates}`。
- **`knowledge dedup`**：`{schemaVersion,threshold,categories,found,readOnly:true,matches:[{category,title,date,enabled,similarity,flagged}]}`；`--project` 由 stage-95 全局选项承接。
- **`config get`**：`{schemaVersion,scope:'project'|'global',key,value}`；全局无 key → `{scope:'global',values:{...}}`；项目无 key → refusal `INVALID_ARGUMENT`。
- **`config effective`**：`{schemaVersion,effective:{key:{value,source}}}`；指定 key → `{key,value,source}`。
- **`view list`**：`{schemaVersion,count,reviews:[{id,op,status,priority,title,filed_by,filed_at,blocking,canAutoFix,autoFixDetail}]}`；`blocking = r.blocking !== false`；可选字段 `null`。
- **`plan scheme list`**：`{schemaVersion,stage,count,schemes:[{stage,opId,title,filePath,draft,fill}]}`；`fill` 复用 `detectFillState`；draft 复用现有 flow.json 扫描。
- **测试**：每命令形状 / 人类快照 / 空态 / 过滤参数。

### T3 — `req list --json` 关联阶段与进度（P1-3）

- **实现**：`src/core/req/aggregate.ts` 新增导出 `listLinkedStages(data, requirementId): {id, phase}[]`（单点过滤，`data.stages` 键序）；`computeRequirementAggregate` 内部复用。`req.ts` 的 `rows.map` 追加：
  ```
  linkedStages: listLinkedStages(data, r.id),
  progress: { done: agg.doneCount, total: agg.stageCount }
  ```
  既有 `requirements[]` 字段顺序保持不变，新增两键在末位。
- **测试**：有/无关联、多阶段部分 done、悬空 requirement_id；与 `req show --json.stages` 一致性；N+1 消除（单次调用）。
- **边界**：不改 `req show` / `req board` / `req next`。

### T4 — `flow archive --dry-run --json` 判据明细（P1-4）

- **实现**：
  - 判据拒绝分支（`flow.ts:1746-1750`）：保留 `error:'gate-rejected'` / `version` / `notDone` / `blockingOpen`，追加 `eligible:false` / `unfinishedStages: notDone.map(id => ({id, phase: data.stages[id]?.phase ?? null}))` / `blockingReviews: blockingOpen.map(r => ({id,title,priority}))`。
  - 成功 dry-run 分支（`1783-1785`）：保留 `version/stages/reviews/log/dryRun`，追加 `eligible:true` / `unfinishedStages:[]` / `blockingReviews:[]`。
  - 非 dry-run 成功 JSON 同样追加 `eligible:true` + 空数组（同代码路径，增量）。
- **测试**：不合格 fixture（未完成阶段 + blocking REV）→ `eligible:false` + 明细 + exit 1；合格 fixture → `eligible:true` + 空数组；`--dry-run` 前后 flow.json / flow-archive 目录哈希不变。
- **边界**：不改判据；不改 legacy 字段；不改人类输出。

### T5 — `archive <stage> --json`（P2-4）

- **实现**：`archive.ts` 新增 `.option('--json')`；`archiveStage` 成功 → `{schemaVersion,stage,archivePath,opsCount,reviewsCount,knowledgeExtracts}`；`null` → `ARCHIVE_FAILED` refusal（JSON envelope / 人类 stderr）；异常 → `failInternal`。`archivePath` 与人类输出同源（绝对路径）。
- **测试**：成功 fixture（生成摘要 / 知识提取）JSON 字段；失败 fixture；人类输出快照不变。
- **边界**：不改变归档写盘逻辑；与 `flow archive` 职责区分不变。

### T6 — 错误接入 + i18n + 契约测试 + 门禁

- 每个新 `--json` 分支的失败路径使用 `failRefusal` / `failInternal`；`no-init` 语义镜像人类退出码（读视图 0 + `initialized:false`；需项目的命令 1 + envelope）。
- 新增 help 键（13 个 `--json` 选项）与文案键；zh/en 成对。
- `docs/json-contract.md` 追加 12 个新出口 + 3 个扩展的冻结表。
- 门禁：test / tsc / i18n / kb / build ×2；人类快照 diff 空；既有 18 出口契约测试仍绿。

---

## 四、开放问题（方案期 / 执行期定稿）

- **Q1**：`stage status --json` 的字段命名——仅规范化英文字段 vs `fields.raw` 中文键 + 规范化双给（倾向双给 `fields` + `raw`，适配器用规范化字段）。
- **Q2**：`knowledge search --json` 是否返回 `content` 全文（默认上限 10 条）或仅 `summary`；倾向内容全文 + `summary`，避免适配器再次调用。
- **Q3**：`project overview --json` 的目录/统计/技术栈键名冻结（需与人类输出逐项对应）。
- **Q4**：`config get --json` 全局模式无 key 的输出形态（`values` 对象）与项目模式无 key 的 refusal 错误码。
- **Q5**：`flow archive` 的 `unfinishedStages` 元素形态（`{id,phase}`）与 `blockingReviews` 元素形态（`{id,title,priority}`）——确认适配器消费字段。
- **Q6**：新读命令 no-init 的统一语义——读视图（`flow recover` / `project overview`）返回 0 + `initialized:false`；需项目命令（`stage status` / `config` / `view` / `plan scheme` / `knowledge`）返回 refusal 1；方案期逐命令登记。
- **Q7**：`plan scheme list --json.fill` 的判定边界（`content === null` 视为 filled 的既有口径是否沿用；倾向沿用并在文档标注）。

## 五、验收要点（阶段级）

1. **13 个读命令面**：`--json` 单文档、关键字段齐全、stdout 无人类文本；人类输出快照 diff 空；退出码镜像。
2. **`req list --json`**：`linkedStages` / `progress` 与 flow.json 一致；零关联 `[]` + `{done:0,total:0}`；无 N+1。
3. **`flow archive --dry-run --json`**：`eligible` / `unfinishedStages` / `blockingReviews` 正确；legacy `error/notDone/blockingOpen` 保留；零写盘哈希不变。
4. **`archive <stage> --json`**：`archivePath` / `knowledgeExtracts` / 计数正确；失败 envelope；人类输出不变。
5. **错误一致性**：新命令 JSON 失败走 stage-95 envelope；legacy 载荷保留；zh/en code 一致。
6. **零回归**：既有 18 出口契约测试全绿；人类输出无变化；`flow.json` 零注入。
7. **门禁**：test / tsc / i18n / kb / build 全绿；新增测试文件与用例登记。

## 六、风险

| # | 风险 | 影响 | 缓解 |
|:-:|------|------|------|
| R-97-1 | **人类输出被 JSON 改造破坏** | 高 | 先聚合数据对象再渲染；补丁前/后快照 diff 空；逐命令测试 |
| R-97-2 | **13 命令字段命名不一致** | 中 | 契约表先定稿（`docs/json-contract.md`）+ 统一命名规范（camelCase / `count` / `items`） |
| R-97-3 | **`req list` 第二份关联过滤** | 中 | `listLinkedStages` 单点 + aggregate 复用 + 断言 |
| R-97-4 | **`flow archive` 判据漂移** | 中 | 复用 `listArchivableCandidates` + `listBlockingOpenRevsForVersion`；dry-run 零写盘哈希断言 |
| R-97-5 | **no-init 语义不一致** | 中 | Q6 逐命令登记 + 测试矩阵 |
| R-97-6 | **i18n 漏键 / 死键** | 中 | zh/en 成对 + lint 逐键列名 |
| R-97-7 | **`archive` 写盘副作用被 JSON 分支改变** | 低 | JSON 仅改渲染；写盘路径不动；失败 envelope 后 exit 1 |

**回滚**：每命令 `--json` 为新增开关，删除选项与分支即回退；`req list` / `flow archive` 追加字段可 revert；`archive --json` 删除选项即回退；无数据格式破坏。

## 七、承接 REV 与处置表（REV-85-002 固化口径）

- **判据源**：flow.json `reviews: 0` + 用户台账 `REV-92` / `REV-94` + stage-95/96 处置结果 + 本会话实测。

| 上游条目 | 优先级 | 去向 | 依据 |
|---------|:--:|------|------|
| REV-92-006（BFS 报错语义） | low | **台账保留**（本阶段不触 `findPhasePath`） | 非本阶段面 |
| REV-94-005 / 006 | low | **转 stage-98**（文档/入管） | 承 stage-95 三分 |
| REV-94-007 | low | **台账保留**（部署侧） | 承 stage-94 留痕 |
| stage-95/96 新增 REV | 按实际 | **本阶段处置 / 转 stage-98** | 归档后补记 |
| 其余已闭合条目 | — | **零动作**（登记） | 台账实测 |

- **三分结论**：本阶段处置 = 上游 stage-95/96 新增 REV（按实际登记）／显式转出 2（REV-94-005/006）／台账保留 2（REV-92-006、REV-94-007）→ **零灭失成立**。

## 八、op 拆分建议（供 openfeel-schemer 定稿；`est_ops = 4`）

| op | 内容 | 主要文件 | 依赖 |
|:--:|------|------|------|
| `op-001` | **T1 flow/stage 读命令（5 个） + T6 错误接入** | `src/commands/{stage,flow,project}.ts`、i18n、对应测试 | hard: stage-96 |
| `op-002` | **T2 knowledge/config/view/plan 读命令（8 个） + T6 错误接入** | `src/commands/{knowledge,config,view,plan}.ts`、i18n、对应测试 | hard: op-001（契约风格定稿） |
| `op-003` | **T3 req list 扩展 + T4 flow archive 判据明细 + T5 archive JSON** | `src/commands/{req,flow,archive}.ts`、`src/core/req/aggregate.ts`、对应测试 | hard: op-001 / op-002 |
| `op-004` | **T6 i18n + 契约测试 + 门禁 + 收尾** | `docs/json-contract.md`、`test/cli/json-contract.test.ts`、i18n 双表、快照 | hard: op-001 / op-002 / op-003 |

- **文件冲突（mutual_exclusion）**：`flow.ts` 由 op-001 与 op-003 共同触碰 → 串行；`req.ts` 由 op-003 单独触碰；op-004 收尾。
- **op 级依赖与文件清单由 openfeel-schemer 落 `ops/deps.yaml`**。

## 九、修订记录

| 时间 | 制定人 | 说明 |
|------|--------|------|
| 2026-10-17 | openfeel-planner | 初稿：依据大计划 §二/§三/附录 A「stage-97」+ DSH P0-2/P1-3/P1-4/P2-4 + 源码实测（3 表 22 项）；变更点 T1~T6；开放问题 Q1~Q7；风险 R-97-1~7；承接三分；op 拆分 4 项。**只写本计划文档**。 |
