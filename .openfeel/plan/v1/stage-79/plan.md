# v1.2.0-stage-79 计划 — 归档命令面（flow archive 子命令组）

- **阶段**：`v1.2.0-stage-79`（主题二 · 归档拆分第二阶段）
- **依赖**：**hard: v1.2.0-stage-78**（消费 `src/core/flow-archive/` 全部原语；契约见大计划 §既有 `downstream_contracts` 第 1 条）
- **优先级**：P0（把引擎能力暴露为 **CLI 控制**的命令面——用户诉求「这个流程也是 CLI 控制的」的直接落点）
- **制定人**：openfeel-planner ｜ **制定时间**：2026-10-11
- **定位**：新增 `flow archive` **子命令组**（挂既有 `flow` 命令，不改顶层命令树）——① `flow archive <version>` 执行归档（判据门 + `--dry-run` + 两步事务顺序 + 审计 + `pipeline` 处置）；② `flow archive list` / `flow archive show <version> [--json]` 只读读取（**不进常规路径**）。
- **范围**：`src/commands/flow.ts`（追加子命令组）、`src/core/i18n-data/{zh-CN,en}.ts`（新键双表）、`test/commands/flow.test.ts`、`test/core/flow-archive.test.ts`（跨层断言）；如需 `src/core/flow-archive/` 小幅补丁（如 `pipeline` 处置 helper），同阶段内完成。
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

| 事实 | 位置 | 结论 |
|------|------|------|
| `flow` 命令组注册范式（子命令 + `createManager()` + `common.errorTmpl`） | `src/commands/flow.ts:36+`（`registerFlowCommand`）；`flow mode` 只读范式 `:481-530` | `flow archive` 同范式；`--json` 纯单文档（`:524` 先例） |
| `flow advance` 命令 save 事务 | `src/commands/flow.ts:766-830` / `:932` | 归档命令的 flow.json 变更同样 `mgr.save()` 单次调用 |
| 并发冲突统一处理 | `src/commands/shared/errors.ts:19-28`（`handleConcurrentConflict`） | 归档 save 冲突 → exit 2 可重试提示 |
| 宏观 done 判定（空集守卫先例） | `src/core/flow-manager.ts:1484-1486` | 归档后 `pipeline.phase` 重算按同范式（裁定 P；空集语义开放问题 Q3） |
| `pipeline.current` 单点 owner | `src/core/flow-manager.ts:1368-1399`（`syncCurrentOp`） | 归档命中 `current.stage` 版本 → 置空/指向（**不复用 `syncCurrentOp`**——它是 op 级同步；归档处置单点实现于本阶段） |
| i18n 双文件 | `src/core/i18n-data/{zh-CN,en}.ts`；基线 796 | 新键显式登记 |
| 既有顶层 `openfeel archive` | `src/commands/archive.ts:1-46` | **不改**；i18n 与 docs 显式区分两概念（裁定 O3） |

---

## 二、目标语义与不变量

| 维度 | 内容 |
|------|------|
| 执行命令 | `flow archive <version>`：判据门（该版本全 done + 无 `blocking && open` REV）→ `--dry-run`？预览：写归档文件 → `save()` 移除 → 审计 → `pipeline` 处置 |
| 只读命令 | `flow archive list`（已归档版本 + 计数）；`flow archive show <version> [--json]`（读归档文件，schemaVersion:1） |
| 前缀兼容 | `<version>` 接受 `v1.1.7` 与 `1.1.7`（去 `v` 归一，与 `normalizeVersion` 同范式） |

**不变量**：

1. **两步事务顺序**：归档文件写成功之前**不**改 flow.json；`save()` 失败（并发冲突）→ 归档文件已存在（幂等可重跑），flow.json 原样，命令 exit 2。
2. **`--dry-run` 字节级零写盘**：flow.json（含 `meta.revision`/`meta.updated`）、归档文件、checkpoints、log 四写盘点全不动。
3. **判据门零写盘拒绝**：未满足 → exit 1 + 列出未满足项（未 done 阶段 / blocking REV）；**不设 `--force`**（裁定 O2）。
4. **常规路径零触碰**：本阶段仅新增子命令；既有命令不读 `flow-archive/`。
5. **审计**：`appendLog({ action: 'archive_flow_version', detail: { version, stages, reviews, log } })`——记录在**归档后**的 flow.json（不属被归档版本）。
6. **既有输出零破坏**：`flow --help` 仅新增子命令；`flow phases` / `flow mode` / `flow status` 输出逐字不变。

---

## 三、变更点清单（编号 T）

### T1 — `flow archive <version>` 执行命令（`src/commands/flow.ts`）
- 参数：`<version>`（必填，`v` 前缀可选归一）+ `--dry-run` + `--json`（输出 `{ schemaVersion: 1, version, stages: n, reviews: n, log: n, dryRun }`）。
- 流程：`createManager()` → 未初始化 → `common.errorNoInit` exit 1 → 版本归一 + 依赖 `listArchivableCandidates`/`splitForArchive`（core，禁复制逻辑）→ **判据门**（未满足 exit 1 零写盘，列未满足项）→ `--dry-run` 预览（零写盘）→ `writeArchiveFile`（先）→ 内存移除（stages/reviews/log）+ `addArchivedVersion` → `pipeline` 处置（T3）→ `mgr.save()`（后，捕获并发冲突 → `handleConcurrentConflict`）。
- 幂等：同版本重复归档（文件已存在）→ 覆盖写 + 索引 no-op + 输出「已重新归档」提示（方案期定稿文案）。

### T2 — `flow archive list` / `flow archive show <version> [--json]`（只读）
- `list`：`listArchiveVersions` + 逐文件 `counts`（读侧复用 `readArchiveFile`）；空目录 → 「暂无归档」提示（退出码 0）。
- `show`：版本不存在 → exit 1（i18n 模板列可用版本）；`--json` 纯单文档（`schemaVersion:1` + 归档文件内容摘要或全量——方案期定稿，默认**计数 + stages 概览**防上下文膨胀）。
- 两命令**零写盘**、不触发 deployment-check 之外的 IO（沿用既有门控）。

### T3 — `pipeline` 处置（归档后语义，裁定 P）
- `pipeline.current.stage` 属被归档版本 → **置空**（`''`）；`pipeline.current.op` 同步置空。
- `pipeline.phase` 按归档后活跃集重算（`length > 0 && every(done)` 范式，`:1484-1486`；空集语义按开放问题 Q3 定稿，默认保持 `active`）。
- 实现落点：core 小 helper（`src/core/flow-archive/` 或 `flow-manager.ts` 最小追加，方案期定稿），**纯内存**（save 由 T1 统一）。

### T4 — i18n 双表 + help 域
- 新增键前缀 `flow.archive.*`（执行/列表/查看/判据门/错误/提示）+ `help.flow.archive` / `help.flow.archive.list` / `help.flow.archive.show`；双表成对；`lint i18n` 新基线显式登记（预期 796 + N）。
- `--help` 文案与 `docs`（归 stage-85）口径一致：与顶层 `openfeel archive`（阶段摘要）措辞区分。

### T5 — 测试
- T5.1 判据门：未全 done / 含 blocking REV → exit 1 零写盘（`meta.revision` / 归档目录 / checkpoints 三处断言不变）。
- T5.2 成功路径：归档文件内容 = 切分结果（复用 core 断言）+ flow.json 零残留 + 审计条目存在 + `archived_versions` 含版本。
- T5.3 `--dry-run` 字节级零写盘（四写盘点）。
- T5.4 幂等重跑；并发冲突（同进程构造 revision 漂移）→ exit 2。
- T5.5 `list` / `show`（含 `--json` 纯单文档 + 不存在版本 exit 1）。
- T5.6 既有命令零破坏：`flow phases --json` / `flow mode --json` / `flow status` 逐字不变断言。
- 全程 fixture tmpDir / 隔离 HOME。

### T6 — 门禁
`npm run build` ×2 → `npm test`（0 skipped / 0 failed）→ `tsc` = 0 → `lint i18n` 新基线（显式登记）→ `lint kb` = 0。

---

## 四、验收要点（阶段级）

1. 判据门 / 成功路径 / dry-run / 幂等 / 并发五组用例绿；**顺序不变量**经故障注入验证（构造 save 失败 → 归档文件在、flow.json 原样）。
2. `flow archive list/show` 可用且 `--json` 契约成立；既有命令输出逐字不变。
3. i18n 新基线登记 + 双表成对；`flow --help` 仅增子命令。
4. `pipeline.current/phase` 处置符合裁定 P（`current` 置空 + `phase` 重算）。
5. 门禁全绿。

## 五、风险

| # | 风险 | 缓解 |
|:-:|------|------|
| R-79-1 | dry-run 连带写盘（checkpoint/audit/归档文件） | T5.3 四写盘点逐一断言（kb #`--dry-run` 必须字节级不写盘） |
| R-79-2 | 两步事务半完成 | 顺序不变量 + 故障注入（T5.2/验收 1）+ 幂等重跑收敛 |
| R-79-3 | 与顶层 `archive` 概念混淆 | i18n/help/docs 显式双概念区分（T4） |
| R-79-4 | `show` 输出过大反噬上下文 | 默认计数概览（T2）；全量经 `--json` 显式请求 |

> 说明：op 级拆分建议——op-001（T1 执行命令 + T3 处置）→ op-002（T2 只读 + T4 i18n）→ op-003（T5/T6 测试与门禁）；由 openfeel-schemer 定稿并落 `ops/deps.yaml`。

## 六、修订记录

| 时间 | 制定人 | 说明 |
|------|--------|------|
| 2026-10-11 | openfeel-planner | 初稿（立项随批次落盘）：T1~T6；依据大计划 §三 裁定 O2/O3/P/T/U 与 §二 表 A。**只写计划文档，未改源码、未动 flow.json。** |
