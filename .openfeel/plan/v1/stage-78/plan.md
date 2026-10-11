# v1.2.0-stage-78 计划 — 归档核心引擎（flow.json 版本分片）

- **阶段**：`v1.2.0-stage-78`（主题二 · 归档拆分首阶段）
- **依赖**：**无**（承 v1.1.7 基线：CLI 1.1.7 / i18n **796** / lint kb 0 / 测试 **67 文件 + 1306 用例**（登记值，复现 `npm test`）/ flow 注册阶段 **78** 个全 done；本阶段为纯库层新增，**不改任何既有行为**）
- **优先级**：P0（归档能力底座：文件 schema / 分组切分 / 读写原语 / 轻量索引的**唯一权威**在此建立）
- **制定人**：openfeel-planner ｜ **制定时间**：2026-10-11
- **定位**：为 `.openfeel/flow.json` 版本分片建立**引擎面**——① 归档文件 schema 与读写原语（`.openfeel/flow-archive/{version}.json`）；② 版本分组与切分**纯函数**（stages / reviews / log 三段）；③ `meta.archived_versions` 轻量索引管理；④ 为 stage-79/80 提供**函数签名级契约**（禁命令层第二套解析/切分）。
- **范围**：新建 `src/core/flow-archive/`（`archive-file.ts` / `grouping.ts` / `archive-ops.ts`）+ `test/core/flow-archive.test.ts`；复用 `src/core/fs/`（`withFileLock` / `atomicWriteFileSync`）与 `src/core/plan/path.ts`（`parseStageId`）。**不改** `src/core/flow-manager.ts` 既有方法语义（`meta.archived_versions` 读侧补齐如需可最小追加，方案期定稿）。
- **边界**：**不做命令面**（`flow archive` 归 stage-79）；**不做** deps 校验适配 / health 检查 / 存量迁移（归 stage-80）；**不改** phase 枚举 / 转移表 / `pipeline.yaml`；**不触碰** `build.js` / `package.json`；不新增第三方依赖；不 `npm publish` / 不 `git push`；不直写 `flow.json`。

## KB 检索（`openfeel-check-kb`）

- 已加载。**高度相关条目**：
  - `kb/patterns.md #原子写模式` + `#建议性文件锁模式` → 归档文件写盘复用 `src/core/fs/` 原语（同目录 temp + fsync + rename；独立锁名 `flow-archive`，**不与 flow 锁嵌套**）。
  - `kb/patterns.md #事务顺序模式：先落盘状态、后执行不可逆副作用` → 本阶段仅提供**原语**；两步顺序不变量（先写归档文件 → 后 save 移除）由 stage-79 命令层编排（裁定 P）。
  - `kb/patterns.md #CLI 自描述命令模式` + `#第二信源教训`（troubleshooting `#flow phases vs advance 不一致`）→ 分组/切分**只实现一次**（core 纯函数），stage-79/80 零复制。
  - `kb/patterns.md #阶段路径映射 stageId 三格式解析` → 版本前缀一律经 `parseStageId`（`src/core/plan/path.ts:41-63`），**禁自写正则**。
  - `kb/patterns.md #全局状态文件多类条目扩展与短前缀读侧分类`（读侧兼容范式）→ `meta.archived_versions` 缺失视为 `[]`；归档文件读侧对未知键宽容。
  - **无**「flow.json 归档拆分」既有条目 → 归档时补沉 architecture（版本分片归档架构）。

---

## 一、背景与实测证据（大计划 §二 表 A 摘引；行号以 HEAD `84951ce` 为准）

| 事实 | 位置 | 结论 |
|------|------|------|
| `flow.json` 单文件树：`meta`/`pipeline`/`stages`/`reviews`/`log` 全量同存 | `src/core/flow-manager.ts:107-113`；实测（406280 B / 78 阶段 / `log` 1313 条） | 归档单元 = `stages` 条目 + 关联 `reviews` + 关联 `log`；`meta`/`pipeline` 保留 |
| 版本前缀解析 | `src/core/plan/path.ts:41-63`（`parseStageId`） | 分组键 = `fullStageId` 的版本段（如 `v1.1.7`）；实测分布 9 组 |
| `log` 条目形态 | 实测 13 种 action；`detail.stageName` 为版本归属主要依据 | 缺失/不可解析 → **保留在 flow.json**（裁定 T） |
| `reviews` 条目形态 | `ReviewItem.op`（`<stageId>.op-NNN` 或 `<stageId>`） | 按 `op` 前缀解析版本分组 |
| fs 工具层 | `src/core/flow-manager.ts:33-34`（`withFileLock` / `projectLockPath` / `atomicWriteFileSync`） | 归档写盘复用；独立锁名（核验 A19） |
| `.openfeel/` 无 `archive/` 目录 | 实测 | `.openfeel/flow-archive/` 新建（开放问题 Q2：定名核验 WORKSPACE_DIRS） |

---

## 二、目标语义与不变量

| 维度 | 内容 |
|------|------|
| 归档文件 | `.openfeel/flow-archive/{version}.json`：`{ schemaVersion: 1, version, archived_at, stages, reviews, log, counts }`（裁定 U） |
| 分组 | `stages` 按 `parseStageId` 版本前缀；`reviews` 按 `op` 前缀；`log` 按 `detail.stageName`（缺失保留） |
| 索引 | `flow.json.meta.archived_versions: string[]`（追加 + 幂等去重，裁定 Q） |
| 原语 | `groupStagesByVersion` / `splitForArchive`（纯函数）+ `writeArchiveFile` / `listArchiveVersions` / `readArchiveFile` / `addArchivedVersion`（IO） |

**不变量**：

1. **常规路径零触碰**：本阶段产物不被 `flow status` / `overview` / `health` / `advance` 等既有命令 import（仅 stage-79/80 消费）。
2. **切分无损**：`splitForArchive` 的 `stages ∪ remainder = 原集合`、`reviews`/`log` 同（双向断言）；无 stageName 的 log 一律进 remainder。
3. **幂等**：同版本重复 `writeArchiveFile` = 覆盖写；`addArchivedVersion` 重复 → no-op 不追加。
4. **锁不嵌套**：归档文件写盘锁名 `flow-archive`，与 `flow` 锁**不嵌套**（stage-79 编排时先归档文件、后 flow save，两次独立临界区）。
5. **零既有行为变更**：`src/core/flow-manager.ts` 不改方法语义；既有 67 文件测试逐字绿。

---

## 三、变更点清单（编号 T）

### T1 — 归档文件 schema 与类型（`src/core/flow-archive/archive-file.ts`，新建）
- `ARCHIVE_SCHEMA_VERSION = 1` 常量；`ArchiveFile` 接口（`schemaVersion` / `version` / `archived_at` / `stages: Record<string, StageData>` / `reviews: ReviewItem[]` / `log: LogEntry[]` / `counts: { stages: number; reviews: number; log: number }`）。
- 读侧宽容：未知键保留；缺 `counts` 时按实际长度回填（读时计算，不写）。
- 类型复用：`StageData` / `ReviewItem` / `LogEntry` 从 `flow-manager.ts` 导入（**只导入类型**，不复制定义）。

### T2 — 版本分组与切分纯函数（`src/core/flow-archive/grouping.ts`，新建）
- `versionOfStageId(stageId): string | null`（经 `parseStageId`，禁自写正则）。
- `groupStagesByVersion(stages): Map<string, string[]>`（版本 → stageId 列表，保持稳定顺序）。
- `listArchivableCandidates(data): Array<{ version: string; stages: string[]; allDone: boolean }>`（供 stage-79 判据门消费——**只读纯函数**，不判 REV）。
- `splitForArchive(data, version): { archive: Omit<ArchiveFile, 'schemaVersion' | 'archived_at'>; remainder: { stages; reviews; log } }`——`stages` 全搬；`reviews` 按 `op` 前缀版本命中；`log` 按 `detail.stageName` 命中，**无 stageName / 不可解析 → remainder**。

### T3 — 归档读写原语与索引（`src/core/flow-archive/archive-ops.ts`，新建）
- `getArchiveDir(projectPath)` / `getArchiveFilePath(projectPath, version)`（路径单点；目录 `mkdirSync(recursive)` 幂等）。
- `writeArchiveFile(projectPath, file): void`——独立锁 `flow-archive` 内 `atomicWriteFileSync`（`backup: false`，同版本覆盖即幂等；方案期定稿备份策略）。
- `listArchiveVersions(projectPath): string[]`（目录扫描 + 文件名合法校验）/ `readArchiveFile(projectPath, version): ArchiveFile | null`（缺失/损坏 → null，不抛）。
- `addArchivedVersion(data, version): boolean`（幂等去重；读写 `data.meta.archived_versions`；返回是否新增——**纯内存**，save 由命令层）。
- `getArchivedVersions(data): string[]`（读侧补齐：缺失 → `[]`）。

### T4 — 测试（`test/core/flow-archive.test.ts`，新建）
- T4.1 分组：多版本混排（本仓 9 组实测样本子集）+ 非法/异常 stageId 跳过不崩。
- T4.2 切分无损：`stages/reviews/log` 三段双向断言（并集 = 原集）；无 stageName log 与不可解析 op 均落 remainder。
- T4.3 幂等：`writeArchiveFile` ×2 字节一致；`addArchivedVersion` ×2 仅追加一次。
- T4.4 边界：空 log / 空 reviews / 单阶段版本 / 版本不存在（`splitForArchive` 返回空 archive 而非抛错）。
- T4.5 隔离：全部 fixture tmpDir；**严禁**触碰真实 `.openfeel/` 与本仓 flow.json。

### T5 — 门禁
`npm run build` ×2（幂等）→ `npm test`（0 skipped / 0 failed）→ `npx tsc --noEmit` = 0 → `openfeel lint i18n` = 796（本阶段不新增键，预期不变）→ `openfeel lint kb` = 0。

---

## 四、验收要点（阶段级）

1. 五组单测全绿；切分无损双向断言通过（T4.2）。
2. **零既有行为变更**：`git diff --numstat src/core/flow-manager.ts` 仅类型导入级最小改动（或零改动）；既有 67 文件测试逐字绿。
3. 契约可消费：`splitForArchive` / `writeArchiveFile` / `readArchiveFile` 等签名与 `.openfeel/plan/v1/v1.2.0/deps.yaml` `downstream_contracts` 一致（stage-79/80 直接消费，禁第二套实现）。
4. 路径单点：`rg "flow-archive" src/` 命中仅 `src/core/flow-archive/**`（命令层归 stage-79）。
5. 门禁全绿。

## 五、风险

| # | 风险 | 缓解 |
|:-:|------|------|
| R-78-1 | 切分漏搬/多搬（数据丢失或残留） | T4.2 双向断言 + 无损不变量；stage-79 端到端再验零残留 |
| R-78-2 | 归档文件写盘半途损坏 | `atomicWriteFileSync`（同目录 temp + rename）；读侧损坏 → null 不崩溃 |
| R-78-3 | 版本前缀解析歧义（`v1.0.0` vs `v4` 历史格式） | 一律经 `parseStageId`（既有三格式权威）；T4.1 覆盖历史格式样本 |

> 说明：op 级拆分建议——op-001（T1+T2 纯函数与 schema）→ op-002（T3 读写原语与索引）→ op-003（T4/T5 测试与门禁）；由 openfeel-schemer 定稿并落 `ops/deps.yaml`。

## 六、修订记录

| 时间 | 制定人 | 说明 |
|------|--------|------|
| 2026-10-11 | openfeel-planner | 初稿（立项随批次落盘）：T1~T5；依据大计划 §三 裁定 O1/O2/T/U/Q 与 §二 表 A。**只写计划文档，未改源码、未动 flow.json。** |
| 2026-10-11 | openfeel-planner | REV 修订轮（v1.2.0-stage-78 plan_review 后续）：体积口径统一改记字节数 **406280 B**（HEAD `84951ce` 实测；原 396KB 为 KiB 口径）。**只改计划文档。** |
