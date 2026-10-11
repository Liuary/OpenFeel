# v1.2.0-stage-79 计划 — 归档命令面（flow archive 子命令组）

- **阶段**：`v1.2.0-stage-79`（主题二 · 归档拆分第二阶段）
- **依赖**：**hard: v1.2.0-stage-78**（消费 `src/core/flow-archive/` 全部原语；契约见大计划 §既有 `downstream_contracts` 第 1 条）
- **优先级**：P0（把引擎能力暴露为 **CLI 控制**的命令面——用户诉求「这个流程也是 CLI 控制的」的直接落点）
- **制定人**：openfeel-planner ｜ **制定时间**：2026-10-11
- **定位**：新增 `flow archive` **子命令组**（挂既有 `flow` 命令，不改顶层命令树）——① `flow archive <version>` 执行归档（判据门 + `--dry-run` + 两步事务顺序 + 审计 + `pipeline` 处置）；② `flow archive list` / `flow archive show <version> [--json]` 只读读取（**不进常规路径**）。
- **范围**：`src/commands/flow.ts`（追加子命令组）、`src/core/i18n-data/{zh-CN,en}.ts`（新键双表）、`test/commands/flow.test.ts`、`test/core/flow-archive.test.ts`（跨层断言）、`src/core/flow-archive/` 小幅补丁（**落点单一**：版本校验/归一 helper 导出 + 「版本作用域 blocking open REV」谓词 helper + `pipeline` 处置 helper，见 T1/T3）、`src/core/flow-manager.ts`（**净减法**：顺带移除 `load()` 的 `archived_versions` 读侧补齐——REV-78-015 处置定稿，见 T1）。
- **边界**：**不改**顶层 `openfeel archive <stage>`（阶段摘要归档，职责分离裁定 O3）；**不做** deps 校验适配 / `flow health` 检查项 / 存量迁移（归 stage-80）；**不改** phase 枚举 / 转移表；不自动归档（不挂 `advanceStagePhase` 钩子，裁定 W）；不新增第三方依赖；不 `npm publish` / 不 `git push`；不直写 `flow.json`（归档自身经 CLI + save()）。

## KB 检索（`openfeel-check-kb`）

- 已加载。**高度相关条目**：
  - `kb/patterns.md #破坏性命令安全校验清单模式：默认拒绝 + 显式越权 + 可预览 + 可审计` → 判据门（全 done + 无 blocking open REV）默认拒绝；`--dry-run` 复用只读校验（逐字节零写盘）；审计快照。
  - `kb/patterns.md #事务顺序模式：先落盘状态、后执行不可逆副作用` + kb #真实全局目录操作的安全程序（「刷新严格早于删除」）→ **顺序不变量**：先写归档文件（新增）→ 成功后 `save()` 移除 flow.json 条目（删除）（裁定 P）。
  - `kb/patterns.md #`--dry-run` 必须字节级不写盘`（含连带写盘点）→ dry-run 不得触发 `saveCheckpoint` / `appendLog` / 归档文件写入；三处写盘点逐一断言。
  - `kb/patterns.md #CLI --json 结构化输出约定：顶层对象 + schemaVersion + 纯 JSON 单文档` → `flow archive list/show --json` 沿用 `schemaVersion:1`。
  - `kb/patterns.md #CLI 退出码语义：非 0 退出 + process.exitCode + 无逃生阀` + `#并发写冲突退出码 2` → 判据门失败 exit 1；并发冲突走既有 `handleConcurrentConflict`（exit 2）。
  - `kb/patterns.md #CLI 国际化封装模式` + `#部署型资产变更的多载体同步面清单` → 新键双表成对 + `help.flow.archive*` 域键（`applyHelpI18n` 范式，`src/cli/index.ts:96-175`）。
  - **无**「flow.json 归档命令」既有条目 → 归档时补沉 patterns（归档两步事务顺序）。

---

## 一、背景与实测证据（大计划 §二 表 A 摘引）

> **行号纪律（REV-79-008）**：一律「**符号名 + 行号**」双锚；行号以 HEAD `6c22784` 为准；stage-78 落地后 `flow-manager.ts` 净增 11 行（12 增/1 删），引用基线 `84951ce` 处已注明漂移。

| 事实 | 位置 | 结论 |
|------|------|------|
| `flow` 命令组注册范式（子命令 + `createManager()` + `common.errorTmpl`） | `src/commands/flow.ts` `registerFlowCommand`（`:36`）；`flow mode` 只读范式（`:481` 起） | `flow archive` 同范式；`--json` 纯单文档（`:524` 先例） |
| `flow advance` 命令 save 事务 | `src/commands/flow.ts:766-830` / `:932` | 归档命令的 flow.json 变更同样 `mgr.save()` 单次调用 |
| 并发冲突统一处理 | `src/commands/shared/errors.ts` `handleConcurrentConflict`（`:19` 起） | 归档 save 冲突 → exit 2 可重试提示 |
| 宏观 done 判定（空集守卫先例） | `src/core/flow-manager.ts:1494-1496`（HEAD `6c22784`；基线 `84951ce` `:1483`，stage-78 后净 +11） | 归档后 `pipeline.phase` 重算按同范式（裁定 P；**空集 → 非全 done → `active`**，与守卫同效——T3 定稿） |
| `pipeline.current` 单点 owner | `src/core/flow-manager.ts` `syncCurrentOp`（`:1389`，HEAD `6c22784`；基线 `84951ce` `:1378`，同上净 +11） | 归档命中 `current.stage` 版本 → 置空（**不复用 `syncCurrentOp`**——它是 op 级同步；归档处置 helper 单点落 `src/core/flow-archive/`，见 T3） |
| 可归档候选与切分原语（版本存在性判据来源） | `src/core/flow-archive/grouping.ts`：`listArchivableCandidates`（`:77`）/ `splitForArchive`（`:122`） | 版本不存在 → 候选缺失、切分为**空集且不抛错**（危险源）→ T1 前置**版本存在性门**（REV-79-001） |
| 版本校验/归一原语 | `src/core/flow-archive/archive-ops.ts` `isValidVersionString`（`:38`，非导出，探针法复用 `parseStageId`）；`src/core/plan/roadmap.ts:17` `normalizeVersion`（**去 `v`**） | 引擎键**恒带 `v`**（`versionOfStageId` 返回如 `v1.1.7`）；输入归一 = **去 `v` 后加 `v`**（REV-79-004）；helper 由 flow-archive/ 导出（T1） |
| 全仓唯一 blocking open 谓词 | `src/core/flow-manager.ts:1456` / `:1570`、`src/commands/flow.ts:2053`（`assertNoBlockingOpenRev`）；`blocking` 缺省 = 阻塞（`src/core/view/entry.ts:168`） | 归档判据门谓词 = `r.blocking !== false && r.status === 'open'`（REV-79-002）；「版本作用域」过滤经 core 单一 helper（T1） |
| `load()` 读侧补齐（REV-78-015） | `src/core/flow-manager.ts:515-518`（`archived_versions ??= []`）；`getArchivedVersions` 自带 `Array.isArray` 防御（`archive-ops.ts:136`） | 序列化副作用（任意 load→save 注入 `[]`）→ 本阶段**顺带移除**（T1 定稿；读侧宽容由 `getArchivedVersions` 承担） |
| i18n 双文件 | `src/core/i18n-data/{zh-CN,en}.ts`；基线 796 | 新键显式登记 |
| 既有顶层 `openfeel archive` | `src/commands/archive.ts:1-46` | **不改**；i18n 与 docs 显式区分两概念（裁定 O3） |

---

## 二、目标语义与不变量

| 维度 | 内容 |
|------|------|
| 执行命令 | `flow archive <version>`：**版本存在性门**（无候选 → 拒）→ 判据门（该版本全 done + 无 `r.blocking !== false && r.status === 'open'` REV）→ `--dry-run`？预览：写归档文件 → `save()` 移除 → 审计 → `pipeline` 处置 |
| 只读命令 | `flow archive list`（已归档版本 + 计数）；`flow archive show <version> [--json]`（读归档文件，schemaVersion:1） |
| 前缀兼容 | `<version>` 接受 `v1.1.7` 与 `1.1.7` → 归一 = **去 `v` 后再加 `v`**（canonical 恒带 `v`，与引擎键一致；经 flow-archive/ 导出 helper 探针法校验——**不照搬** `normalizeVersion` 的「去 `v`」方向，REV-79-004） |

**不变量**：

1. **两步事务顺序**：归档文件写成功之前**不**改 flow.json；`save()` 失败（并发冲突）→ 归档文件已存在（幂等可重跑），flow.json 原样，命令 exit 2。
2. **`--dry-run` 字节级零写盘**：flow.json（含 `meta.revision`/`meta.updated`）、归档文件、checkpoints、log 四写盘点全不动。
3. **判据门零写盘拒绝**：**版本存在性门前置**——`listArchivableCandidates(data)` 无该 `version` 候选（版本不存在 / 未注册于活跃 flow.json，含已归档版本）→ exit 1 零写盘，文案区分「版本未注册于活跃 flow.json」；**覆盖写仅在活跃集仍含该版本条目时允许**（防空归档覆盖既有归档；REV-79-001）。存在性通过后：判据未满足（未 done 阶段 / blocking open REV）→ exit 1 + 列出未满足项；**不设 `--force`**（裁定 O2）。
4. **常规路径零触碰**：本阶段仅新增子命令；既有命令不读 `flow-archive/`；**可执行验证** = 静态 import 面断言 + 重命名归档目录全绿（T5.7）。
5. **审计**：`appendLog({ action: 'archive_flow_version', detail: { version, stages, reviews, log } })`——记录在**归档后**的 flow.json（不属被归档版本）。
6. **既有输出零破坏**：`flow --help` 仅新增子命令；`flow phases` / `flow mode` / `flow status` 输出逐字不变。

---

## 三、变更点清单（编号 T）

### T1 — `flow archive <version>` 执行命令（`src/commands/flow.ts` + `src/core/flow-archive/` 小幅补丁）
- 参数：`<version>`（必填）+ `--dry-run` + `--json`（输出 `{ schemaVersion: 1, version, stages: n, reviews: n, log: n, dryRun }`）。
- **版本归一（REV-79-004）**：引擎键**恒带 `v`**（`versionOfStageId` 返回如 `v1.1.7`）；`<version>` 接受 `v1.1.7` / `1.1.7` → 归一 = **去 `v`（如有）后补 `v`**，经 flow-archive/ **导出的**校验/归一 helper（探针法复用 `parseStageId`；**禁**命令层自写正则——`normalizeVersion`〔`src/core/plan/roadmap.ts:17`〕是「去 `v`」方向，**不得**直接复用为引擎键）。helper 落点 `src/core/flow-archive/`（导出；签名与命名方案期定稿），登记 `deps.yaml downstream_contracts`。
- **流程**：`createManager()` → 未初始化 → `common.errorNoInit` exit 1 → 版本归一 + 依赖 `listArchivableCandidates`/`splitForArchive`（core，禁复制逻辑）→ **版本存在性门（前置）**：无该 `version` 候选（不存在 / 已归档）→ exit 1 **零写盘**（文案区分「版本未注册于活跃 flow.json」；REV-79-001）→ **判据门**（`allDone !== true` 或存在该版本 blocking open REV → exit 1 零写盘，列未满足项）→ `--dry-run`？预览（零写盘，纯内存）→ **装配（REV-79-009）**：`SplitResult.archive` 为 `Omit<ArchiveFile, 'schemaVersion' | 'archived_at'>`，命令层装配 `{ ...archive, schemaVersion: ARCHIVE_SCHEMA_VERSION, archived_at: new Date().toISOString() }` → 交 `writeArchiveFile`（先）→ 内存移除（stages/reviews/log）+ `addArchivedVersion` → `pipeline` 处置（T3）→ `mgr.save()`（后，捕获并发冲突 → `handleConcurrentConflict`）。
- **判据门谓词（REV-79-002）**：`r.blocking !== false && r.status === 'open'`（`blocking` 缺省 = 阻塞，对齐全仓唯一谓词 `flow-manager.ts:1456`/`:1570`）；「版本作用域」过滤经 **core 单一 helper**（落 `src/core/flow-archive/`，复用 `versionOfReviewOp` 同源解析）+ **禁命令层第二套谓词/过滤**。
- **幂等与覆盖写边界（REV-79-001）**：覆盖写**仅在活跃集仍含该版本条目**时允许（重复执行重跑收敛；索引 no-op + 输出「已重新归档」提示）；版本已归档（活跃集不含该版本）→ 存在性门拒绝（**不得**写空归档覆盖既有文件）。
- **REV-78-015 处置（定稿：随 T1 顺带移除 `load()` 补齐，二选一写死）**：删除 `src/core/flow-manager.ts:515-518`（`meta.archived_versions ??= []`）——「缺失 ≡ []」语义由 `getArchivedVersions()`（`archive-ops.ts:136`，自带 `Array.isArray` 防御）承担，零语义损失；净减法；翻转 `test/core/flow-archive.test.ts`「load 读侧补齐」用例为「load **不注入**该键；经 `getArchivedVersions` 得 `[]`；load→save 磁盘不新增该键」。

### T2 — `flow archive list` / `flow archive show <version> [--json]`（只读）
- `list`：`listArchiveVersions` + 逐文件 `counts`（读侧复用 `readArchiveFile`）；**输出顺序定稿 = 引擎字典序**（`listArchiveVersions` 契约「非语义版本序」，零命令层第二套排序；i18n 文案不承诺语义序；跨段数版本如 `v1.9`/`v1.10` 的语义序演进路径 = 单点改引擎 + 翻转测试）；空目录 → 「暂无归档」提示（退出码 0）。
- `show`：版本不存在 → exit 1（i18n 模板列可用版本）。
- **`--json` 载荷口径定稿（REV-79-003，消 T2 早期自相矛盾）**：人类输出 = **counts + stages 概览**（防上下文膨胀）；`--json` = **全量**（含 `log`/`reviews`）+ `schemaVersion:1`（显式请求才取全量）；`--json` **失败路径** = **纯 JSON 单文档**（含未满足项/错误信息）+ exit 1（**不混**人类文案、**不**走 stderr 提示行）；`--json` 恒 UTF-8 走既有咽喉（`src/cli/output-encoding.ts` 第 1 步旁路，零新逻辑）。
- 两命令**零写盘**、不触发 deployment-check 之外的 IO（沿用既有门控）。

### T3 — `pipeline` 处置（归档后语义，裁定 P；**owner = 本阶段**，与归档同一事务）
- `pipeline.current.stage` 属被归档版本 → **置空**（`''`）；`pipeline.current.op` 同步置空。
- `pipeline.phase` 按归档后活跃集重算（`length > 0 && every(done)` 范式——`flow-manager.ts` 宏观 done 判定 `:1494-1496`〔HEAD `6c22784`；基线 `84951ce` `:1483`〕；**空集 → 判定非全 done → `pipeline.phase='active'`**，与 `:1494-1496` 空集守卫同效）。
- 实现落点**单一**：`src/core/flow-archive/` 内新增导出 helper（具体文件与函数名方案期定稿）；**禁止**落 `flow-manager.ts`、**禁止**命令层内联（REV-79-005）。**纯内存**（save 由 T1 统一）。
- **owner 裁定（REV-79-005）**：处置须与归档同一事务（同一 `save()`）→ **owner = stage-79**；stage-80 仅做消费点适配 + 迁移 + 健康检查、**不实现处置**（大计划 §四 stage-80 行与 `deps.yaml` stage-80 notes③ 已同步修订）。

### T4 — i18n 双表 + help 域
- 新增键前缀 `flow.archive.*`（执行/列表/查看/判据门/错误/提示）+ help 域：`help.flow.archive` / `help.flow.archive.list` / `help.flow.archive.show`。
- **arg/option help 键（REV-79-006；`applyHelpI18n` 约定 `help.<path>.arg<name>` / `help.<path>.<optName>`〔选项名经 `toCamelCase`〕，先例 `help.flow.checkpoint.list.argstage`）**：`help.flow.archive.argversion`、`help.flow.archive.show.argversion`、`help.flow.archive.dryRun`、`help.flow.archive.json`、`help.flow.archive.list.json`、`help.flow.archive.show.json`。
- 双表成对（zh-CN/en）；`lint i18n` 新基线**显式登记**（796 + N，N = 上述全部新增键合计；登记点 = 本计划验收报告 + 门禁输出双处）。
- `--help` 文案与 `docs`（归 stage-85）口径一致：与顶层 `openfeel archive`（阶段摘要）措辞区分。

### T5 — 测试
- T5.1 判据门：未全 done / 含 blocking REV → exit 1 零写盘（`meta.revision` / 归档目录 / checkpoints 三处断言不变）；**`blocking: undefined` 边界用例**（缺省 = 阻塞 → 拒）+ `blocking: false` 反例（不拒）（REV-79-002）。
- T5.2 成功路径：归档文件内容 = 切分结果（复用 core 断言）+ flow.json 零残留 + 审计条目存在 + `archived_versions` 含版本。
- T5.3 `--dry-run` 字节级零写盘（四写盘点）。
- T5.4 幂等与覆盖写边界：活跃集仍含版本 → 覆盖写收敛；**已归档版本二次归档被拒（exit 1 / 零写盘 / 既有归档文件字节不变）**；**不存在版本 → 存在性门拒绝 +「空集不得写盘」断言**（REV-79-001）；并发冲突（同进程构造 revision 漂移）→ exit 2。
- T5.5 `list` / `show`（含 `--json` 纯单文档〔成功与失败两径〕+ 不存在版本 exit 1 + `list` 字典序断言）。
- T5.6 既有命令零破坏：`flow phases --json` / `flow mode --json` / `flow status` 逐字不变断言。
- T5.7 常规路径零触碰（可执行验证，REV-79-007）：① **静态 import 面断言**（`rg` 断言：仅 `src/commands/flow.ts` import `flow-archive/*`；`src/cli/**` 与其它既有命令文件零命中）；② 归档后**重命名** `.openfeel/flow-archive/` → `flow status` / `overview` / `current` / `ops list` / `mode` / `phases` / `log` 全绿，恢复目录名后一致；③ 保留逐字输出断言。
- 全程 fixture tmpDir / 隔离 HOME。

### T6 — 门禁
`npm run build` ×2 → `npm test`（0 skipped / 0 failed）→ `tsc` = 0 → `lint i18n` 新基线（显式登记）→ `lint kb` = 0。

---

## 四、验收要点（阶段级）

1. 判据门（含**版本存在性门** + `blocking: undefined` 边界）/ 成功路径 / dry-run / 幂等与覆盖写边界 / 并发五组用例绿；**已归档版本二次归档被拒 + 归档文件字节不变**、**空集不得写盘**断言成立；**顺序不变量**经故障注入验证（构造 save 失败 → 归档文件在、flow.json 原样）。
2. `flow archive list/show` 可用且 `--json` 契约成立（**全量载荷** + 失败纯 JSON 单文档 exit 1）；既有命令输出逐字不变（含 T5.7 重命名归档目录全绿验证）。
3. i18n 新基线登记 + 双表成对（含 6 个 arg/option help 键）；`flow --help` 仅增子命令。
4. `pipeline.current/phase` 处置符合裁定 P（`current` 置空 + `phase` 重算〔空集 → `active`〕；helper 落点单一 `src/core/flow-archive/`；owner = 本阶段）。
5. 门禁全绿。
6. **REV-78-015 处置闭环**：`load()` 补齐移除后「无 `archived_versions` 的 flow.json 经 load→save 磁盘不新增该键」断言成立。

## 五、风险

| # | 风险 | 缓解 |
|:-:|------|------|
| R-79-1 | dry-run 连带写盘（checkpoint/audit/归档文件） | T5.3 四写盘点逐一断言（kb #`--dry-run` 必须字节级不写盘） |
| R-79-2 | 两步事务半完成 | 顺序不变量 + 故障注入（T5.2/验收 1）+ 幂等重跑收敛 |
| R-79-3 | 与顶层 `archive` 概念混淆 | i18n/help/docs 显式双概念区分（T4） |
| R-79-4 | `show` 输出过大反噬上下文 | 人类输出默认 **counts + stages 概览**；全量经 `--json` 显式请求（T2 定稿，与 `--json` 全量口径互斥消歧——REV-79-003） |
| R-79-5 | 不存在/已归档版本 → **空归档**覆盖既有归档（引擎空集不抛 + 无候选 vacuous-true；本版无 unarchive → 历史永久丢失） | **版本存在性门**前置（无候选 → exit 1 零写盘）+ 覆盖写仅限活跃集仍含该版本（T1 / 不变量 3）；T5.4 + 验收 1 断言（REV-79-001） |

> 说明：op 级拆分建议——op-001（T1 执行命令 + T3 处置）→ op-002（T2 只读 + T4 i18n）→ op-003（T5/T6 测试与门禁）；由 openfeel-schemer 定稿并落 `ops/deps.yaml`。

## 六、交付与交接提示（REV-79-010）

- **归档官**：归档时同步 `manual/core/flow-archive.md`——本阶段新增**消费面**（`flow archive` 命令组）；stage-78 原文「零 import 表述」（`rg "flow-archive" src/` 仅自身）**将失效**——`src/commands/flow.ts` 成为唯一命令面 import 点（`src/cli/**` 与其它既有命令文件仍零命中，T5.7 断言）。
- **openfeel-schemer**：flow-archive/ 新增导出（版本校验/归一 helper + 版本作用域谓词 helper + `pipeline` 处置 helper）须入 `ops/deps.yaml`；文件级落点与函数名方案期定稿（语义已冻结，见 T1/T3 与 `deps.yaml downstream_contracts`）。
- **openfeel-executor**：实现顺序建议 = op-001（T1 + T3，含 flow-archive/ 小幅补丁与 REV-78-015 移除）→ op-002（T2 + T4）→ op-003（T5/T6 全量测试与门禁）。

## 七、修订记录

| 时间 | 制定人 | 说明 |
|------|--------|------|
| 2026-10-11 | openfeel-planner | 初稿（立项随批次落盘）：T1~T6；依据大计划 §三 裁定 O2/O3/P/T/U 与 §二 表 A。**只写计划文档，未改源码、未动 flow.json。** |
| 2026-10-12 | openfeel-planner | **计划审查 REV 修订轮（REV-79-001~010 落实）**：001 判据门**前置版本存在性门**（无候选 → exit 1 零写盘 + 文案区分「版本未注册于活跃 flow.json」）+ 覆盖写仅限活跃集仍含该版本 + T5.4/验收 1/§二不变量 3 补「空集不得写盘」「二次归档被拒」断言 + R-79-5；002 谓词改 `r.blocking !== false && r.status === 'open'`（对齐全仓唯一谓词）+ core 单一「版本作用域」helper（禁命令层第二套）+ T5.1 `blocking: undefined` 用例；003 `--json` 定稿（人类 = counts + stages 概览 / `--json` = 全量 + `schemaVersion:1`；失败 = 纯 JSON 单文档 exit 1；恒 UTF-8 咽喉），消除与 R-79-4 矛盾；004 归一方向定稿「去 `v` 再加 `v`」+ flow-archive/ **导出**校验/归一 helper（探针法；`deps.yaml downstream_contracts` 登记）；005 `pipeline` 处置 **owner = stage-79**（同一事务）+ helper 落点单一（禁「或」）+ 同步大计划 §四 stage-79/80 行与 `deps.yaml`；006 T4 补 6 个 arg/option help 键 + 新基线显式登记；007 补 T5.7 可执行验证（静态 import 面 `rg` 断言 + 重命名归档目录全绿 + 逐字断言）；008 锚点改「符号名 + 行号」双锚（HEAD `6c22784` 实测 `:1389`/`:1494-1496`；基线 `84951ce` `:1378`/`:1483`，stage-78 后净 +11〔12 增/1 删〕）+ T3 空集措辞消歧 + §一 表 A5 同步；009 T1 补装配步骤（`ARCHIVE_SCHEMA_VERSION` + `archived_at` ISO 8601；dry-run 纯内存）；010 ① REV-78-015 定稿**随 T1 顺带移除 `load()` 补齐**（净减法 + 翻转用例 + `flow-manager.ts` 登记范围）② `list` 输出顺序定稿 = 引擎字典序 ③ 新增 §六 交接提示（归档官同步 `manual/core/flow-archive.md`）。**只改计划文档（stage-79 plan / 大计划 / deps.yaml），未改源码、未直写 flow.json、未推进 phase。** |
