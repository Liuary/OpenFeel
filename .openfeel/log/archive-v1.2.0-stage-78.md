# 归档摘要 — v1.2.0-stage-78

- **归档时间**：2026-10-12
- **阶段名称**：v1.2.0-stage-78（归档核心引擎：flow.json 版本分片 — **v1.2.0 归档主题首阶段**）
- **阶段状态**：archiving → done
- **依赖阶段**：hard `v1.1.7-stage-77`（v1.1.7 收官基线）；下游 = hard `v1.2.0-stage-79`（归档命令面）+ `v1.2.0-stage-80`（消费点适配与存量迁移）
- **归档人**：openfeel-archiver

## 阶段目标

为 `.openfeel/flow.json` 版本分片建立**引擎面**（主题二“flow.json 归档拆分”先行执行）：① 归档文件 schema 与读写原语（`.openfeel/flow-archive/{version}.json`）；② 版本分组与切分**纯函数**（`stages` / `reviews` / `log` 三段）；③ `meta.archived_versions` 轻量索引管理；④ 为 stage-79/80 提供**函数签名级契约**（禁命令层第二套解析/切分）。本阶段为**纯库层新增**，常规路径零触碰（产物仅被测试 import）。

## 操作产出

| ID | 标题 | 状态 | Commit |
|----|------|------|--------|
| op-001 | 归档文件 schema 与版本分组/切分纯函数（T1 + T2 + T4.1/T4.2） | done | —（未提交） |
| op-002 | 归档 IO 原语与 `meta.archived_versions` 索引（T3 + T4.3 + REV-78-006） | done | —（未提交） |
| op-003 | 边界用例、隔离复核与全门禁（T4.4 + T4.5 + T5；**本阶段最终 op**） | done | —（未提交） |

> 注：executor 按 `ops/deps.yaml`「不 commit」约定，产出停留工作区（HEAD `84951ce`）；执行序 = `op-001 → op-002 → op-003`（严格按 `execution_order`）。

## 改动文件

- **新增模块**：`src/core/flow-archive/archive-file.ts`（`ARCHIVE_SCHEMA_VERSION=1` + `ArchiveFile`/`ArchiveCounts`；类型复用 flow-manager，仅 `import type`）、`src/core/flow-archive/grouping.ts`（`versionOfStageId`/`groupStagesByVersion`/`listArchivableCandidates`/`splitForArchive` **纯函数**）、`src/core/flow-archive/archive-ops.ts`（`getArchiveDir`/`getArchiveFilePath`/`writeArchiveFile`/`listArchiveVersions`/`readArchiveFile`/`addArchivedVersion`/`getArchivedVersions` **IO 原语**）
- **测试**：`test/core/flow-archive.test.ts`（T4.1~T4.5，**31 passed**）
- **最小追加**：`src/core/flow-manager.ts`（`12 增 / 1 删`；REV-78-006——`FlowData.meta.archived_versions?: string[]` 可选字段声明 + `load()` 读侧补齐 `??= []`，**语义删除 = 0**、方法语义零改）
- **方案层**：`.openfeel/plan/v1/stage-78/ops/{deps.yaml,op-001~003.md}`（随阶段纳入版本管理）
- **报告**：`.openfeel/tmp/stage-78-{selftest,gate}-report.md` + `op-v1.2.0-stage-78.op-00{1,2,3}-test-report.md`（工作区）

## 审查记录

### 计划审查轮（plan_review，2026-10-11，结论 pass：0 阻塞 + 7 非阻塞）

| ID | 标题 | 状态 | 优先级 |
|----|------|------|--------|
| REV-78-001 | 归档消费点枚举不完整 + 「既有命令逐字不变」过度承诺 | closed | medium（非阻塞） |
| REV-78-002 | `plan.md` 内 log 条数自相矛盾（1306 vs 1313） | closed | low（非阻塞） |
| REV-78-003 | flow.json 体积登记偏差（396KB→实测 406280 B） | closed | low（非阻塞） |
| REV-78-004 | 裁定交叉引用两处错位 | closed | low（非阻塞） |
| REV-78-005 | A13 行号区间未覆盖 `restoreCheckpoint` | closed | low（非阻塞） |
| REV-78-006 | `meta.archived_versions` 字段落点未进 stage-78/79 交付面 | closed | low（非阻塞） |
| REV-78-007 | 大计划裁定 H 未显式化需求聚合的「零关联阶段」守卫 | closed | low（非阻塞） |

> 001~005/007 经 planner「计划审查 REV 修订轮」于 `.openfeel/plan/v1/v1.2.0/plan.md` §六（`:328`）逐条落实（消费点清单完整化 / log 1313 / 体积 406280 B / 裁定 X + Q1·M 引用修正 / A13 补 `:794` / 裁定 H 空集守卫）；006 由 op-002 落实（`flow-manager.ts` 最小追加）。归档官回填验收 closed（验收人 openfeel-reviewer / 2026-10-12 / pass）。

### 方案审查轮（scheme_review，2026-10-12，结论 pass：0 阻塞 + 7 非阻塞 → 全 closed）

| ID | 标题 | 状态 | 优先级 |
|----|------|------|--------|
| REV-78-008 | op-001 Step 3 fixture 助手声明含 `makeReview` 但未定义 | closed | low |
| REV-78-009 | op-002 `load()` 无条件补 `archived_versions` 与不变量⑤张力 | closed | medium |
| REV-78-010 | op-001 事实基准 log 计数漂移（1324/1151/173 → 实测 1328/1155/173） | closed | low |
| REV-78-011 | `getArchiveFilePath` 已导出但不校验 version（纵深防御缺口） | closed | low |
| REV-78-012 | `readArchiveFile` 对「合法 JSON 但结构非法」合成空结构而非返回 null | closed | low |
| REV-78-013 | op-003 头部前置列 op-001（传递）+ op-002，与 deps.yaml 表述不一 | closed | low |
| REV-78-014 | `listArchiveVersions` 返回 UTF-16 字典序（非语义版本序） | closed | low |

### 代码审查轮（code_review，2026-10-12，结论 pass：0 阻塞 + 3 非阻塞）

| ID | 标题 | 状态 | 优先级 |
|----|------|------|--------|
| REV-78-015 | `load()` 读侧补齐的序列化副作用已实际落地，不变量⑤在磁盘格式层松绑 | closed（with-note） | low |
| REV-78-016 | op-002 判据「删除行 = 0」在方案文本下**不可达** | closed（with-note） | low |
| REV-78-017 | op-003 自测清单「`git status --porcelain src/` 空」口径与实测不符 | closed（with-note） | low |

> 015~017 处置（3 条 low 非阻塞，实现无缺陷）：**close-with-note**——015 保留 `load()` 读侧补齐现状（`getArchivedVersions`/`addArchivedVersion` 自带 `Array.isArray` 自防御，正确性非必需；「留 stage-79/85 评估是否删除」），016/017 为**方案文本判据口径不可达/自测清单口径偏差**（实现无缺陷，已由门禁报告正确改述）。三条均以归档官注记闭合，阶段无 pending 遗留。

> 结论：**passed（计划轮 7 + 方案轮 7 + 代码轮 3，全 17 条闭合，无 blocking 遗留）**。

## 缺陷记录

| ID | 标题 | 状态 | 优先级 |
|----|------|------|--------|
| — | 无新增缺陷（测试验收通过、0 Bug） | — | — |

## 门禁

- `npm test` **68 文件 / 1337 用例 0 skipped / 0 failed**（基线 67 / 1306 → +1 文件 / +31 用例）
- `npx tsc --noEmit` → exit 0
- `node bin/openfeel.js lint i18n` → **796**（不变，本阶段不新增键）
- `node bin/openfeel.js lint kb` → **0 过期**（434 引用）
- `npm run build` ×2 → 幂等（`dist/` 全文件 sha1 聚合 `e2c6015b…` 前后一致；`git status --porcelain` 前后逐字一致）
- 路径单点：`rg "flow-archive" src/` 命中仅 `src/core/flow-archive/**`（`src/commands`/`src/cli` 零命中）
- 契约导出：12/12 rg 全命中（签名对齐 `ops/deps.yaml` `downstream_contracts`）
- diff 归因：`flow-manager.ts` = **12 增 / 1 删**（REV-78-006；**语义删除 = 0**）
- 本仓零触碰：`.openfeel/flow.json` sha1 前后一致 `22f3858a…`；`locks/` 空；HEAD 恒 `84951ce`（零 commit）
- 既有命令零回归：`flow status` exit 0（阶段数 86 / 操作 149 / 待处理审查 0，**不读归档文件**）
- 定向测试：`vitest run test/core/flow-archive.test.ts` → **31 passed**

## 知识沉淀

| 分类 | 标题 | 动作 |
|------|------|------|
| architecture | 版本分片归档架构：按版本前缀分片 + 三段归档单元 + `meta.archived_versions` 轻量索引 | 新增 |
| patterns | 归档引擎分层与独立锁模式：纯函数（分组/切分）与 IO 原语分离 + 独立锁不嵌套 + 复用 `parseStageId` 探针法 + 幂等覆盖写 + 读侧宽容 | 新增 |
| troubleshooting | 可选字段「读侧补齐」的序列化副作用：`load()` 的 `??= []` 使任意 load→save 向存量 flow.json 注入空数组 | 新增 |

> 去重（`node bin/openfeel.js knowledge dedup`）：architecture 候选最高 **6.0%**、patterns 候选最高 **3.6%**、troubleshooting 候选最高 **6.8%**，均 ≪ 80% → 3 条均判**新增**。

## manual 更新

- **新增** `core/flow-archive.md`（新模块 `src/core/flow-archive/`：三段归档文件 schema / 分组切分纯函数 / IO 原语 + 独立锁 `flow-archive` + 契约清单）
- `index.md`：模块树「核心引擎」节补「版本分片归档（flow-archive）」条目；维护规则表补对应行
- （`core/flow-manager.md` / `core/fs.md` 本阶段无 API 语义变更，核对零改动——`flow-manager.ts` 仅 REV-78-006 可选字段声明 + 读侧补齐）

## 遗留与下游

- ★ **flow 状态推进**：`v1.2.0-stage-78` → `done`（**由主会话** Feel 经 `openfeel flow advance --stage v1.2.0-stage-78 --to done` 执行；archiver 不直写 flow.json）。`archive_stage` 由该 advance 补记。
- **REV-78-015 评估项**：保留 `load()` 读侧补齐现状，**留 stage-79/85 评估**是否删除（字段仅在归档时落盘）。
- **下游契约**：12 导出（`archive-file` 3 + `grouping` 4 + `archive-ops` 7）交付 stage-79/80；stage-79 编排顺序不变量「先写归档文件 → 后 flow save」（两次独立临界区，裁定 P）；如需语义版本序须自行排序（`listArchiveVersions` 为字典序）。
- **兼容承诺**：存量 flow.json 于**下一次 `save()`** 会写入 `archived_versions: []`（轻量索引，读侧宽容，无兼容风险）。
- **未 commit / 未 push / 未 publish / 未改版本**（版本保持 1.1.7，版本收口归 stage-85）。

> 归档方式：手工生成摘要（沿用先例，未运行 `openfeel archive` CLI 以避免其副作用）。
