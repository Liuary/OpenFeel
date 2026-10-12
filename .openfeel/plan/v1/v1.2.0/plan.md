# OpenFeel v1.2.0 — 双主题：flow.json 归档拆分 + 需求流转系统

> **版本**：v1.2.0（Y 级递增，新开发周期） | **创建日期**：2026-10-11 | **Planner**：openfeel-planner
> **规模判定**：**大规模**（8 阶段，跨 `src/core/flow-manager.ts`（`FlowData` / `StageData` / `advanceStagePhase` / `resetStagePhase` / `load` / `save` / 宏观 done 判定）/ **新建** `src/core/flow-archive/` + `src/core/req/` + `src/commands/req.ts` / `src/commands/flow.ts` / `src/commands/plan.ts` / `src/cli/index.ts` / `i18n-data` / `templates-data`（agent ×2 harness ×2 语言 + 共享 skills）/ `test/**` / 文档与版本载体，含**持久化架构级增量**（flow.json 分片）与 **Agent 职责边界（需求调度层）调整**）→ 走独立 openfeel-planner → openfeel-reviewer 完整流程。
> **定位（双主题）**：① **需求流转系统**——插入需求层，四层模型 `版本 → 需求 REQ-NNN → 计划 stage(15-phase) → 方案 op`；② **flow.json 归档拆分**——已收官版本的历史按版本号迁出，常规读取路径不触碰归档（**先行执行**）。
> **权威设计记录**：`.openfeel/dev/decisions.md` **ADR-011**（需求流转：状态=研究定稿，待立项 → 本计划即立项产出）；归档拆分以本计划 §三 裁定 O~V 为权威。
> **阶段计划**：`.openfeel/plan/v1/stage-78/plan.md` … `stage-85/plan.md`（待 Feel 注册后落盘）。
> **路线图**：`.openfeel/roadmap/v1.2.0.md`。
> **依赖声明**：`.openfeel/plan/v1/v1.2.0/deps.yaml`（阶段级 hard 依赖 + op 级由 openfeel-schemer 细化）。
> **系列**：`v1`；`stageDir` 映射 `stage-78` ~ `stage-85`；阶段 ID 自 `v1.2.0-stage-78` 起（承接 v1.1.7 的 stage-77）。
> **当前基线**（实测，HEAD `84951ce`；统计类均标「登记值 / 复现命令」）：CLI `1.1.7`；flow 注册阶段 **78** 个（全 done，末位 `v1.1.7-stage-77`；复现：`node -e "console.log(Object.keys(require('./.openfeel/flow.json').stages).length)"`）；`flow.json` **406280 B / revision 914 / `log` 1313 条 / 顶层 5 键**（`meta`/`pipeline`/`stages`/`reviews`/`log`，实测）；`lint i18n` = **796**（v1.1.7 门禁登记值）；`lint kb` = 0 过期；测试 **67 文件**（复现：`find test -name '*.test.ts' | wc -l`）/ **1306 用例**（登记值：v1.1.7 门禁；复现命令 `npm test`）；共享 skills **17 个**（复现：`ls src/core/templates-data/skills/`）；`.openfeel/requirements/` 与 `.openfeel/flow-archive/` **均不存在**（实测）；本仓 `config.yaml defaults`：`execution_mode: auto`、`auto_advance: enabled`、`workflow_mode: full`（另遗留 `test_enabled: true`，代码侧已移除、passthrough 容错）。

---

## 一、背景与需求来源

### 主题二：flow.json 归档拆分（先行执行）

- **用户诉求原话**：「flow 只在一个文件中，应该也要对 flow json 文件进行归档拆分。flow 文件只保留近期事务和未归档事务，已归档的历史信息按版本号归档到归档 flow json 文件中。这个流程也是 CLI 控制的，避免读取污染大模型上下文窗口。」
- **现状实测**：`.openfeel/flow.json` 单文件 **406280 B / revision 914 / 78 阶段全留 / `log[]` 1313 条**；版本前缀分布 = `v1.0.0`×34 / `v1.1.0`×6 / `v1.1.1`×1 / `v1.1.2`×20 / `v1.1.3`×1 / `v1.1.4`×4 / `v1.1.5`×2 / `v1.1.6`×6 / `v1.1.7`×4（复现：按 `/^(v\d+(?:\.\d+)*)-stage-\d+$/` 分组统计）。每次 `flow status` / `overview` / Agent 读状态都吞下整文件（污染上下文窗口）；`save()` 每次重写全文件（写放大）。
- **目标**：flow.json 只保留**未归档（近期）**事务；已归档历史按版本号落 `.openfeel/flow-archive/{version}.json`；**常规读取路径不触碰归档**；归档全程 CLI 控制（可预览、可审计、不自动触发）。

### 主题一：需求流转系统

- **用户诉求原话**：「当前工作流是固定的计划范式，比较线性推进，但实际开发中一个版本号可能有若干需求。做一套需求流转系统，Agent 接取后流转需求状态，最终完成需求。需求不同于计划，可以指定预估版本号，计划则是对某项明确需求的具体实现。」
- **现状缺口**：唯一流转实体是阶段（stage），一个版本 = 一串阶段线性跑完；版本内若干需求无独立身份 / 生命周期 / 排期 / 认领。`flow.json` 无 `requirements` 字段；`StageData`（`src/core/flow-manager.ts:92-104`）无需求关联字段。
- **既定设计（ADR-011，用户已确认，不推翻）**：四层模型 + 四条锁定抉择（双层状态模型 / 存储 flow.json 内 / 需求↔计划 1:N / 轻量原子认领）+ 命令面 `openfeel req`。

### 知识库检索（`openfeel-check-kb`）结果

已加载 `.openfeel/kb/index.md`。**高度相关条目**：

- `kb/architecture.md #状态/相位单一事实源：status 为 phase 的粗粒度投影，phase 为唯一事实源` → 需求状态必须是「显式字段 + 阶段 phase 聚合」的**投影**（方向单一：phase → 需求状态），**绝不**由需求状态前推阶段 phase（对齐 ADR-003）。
- `kb/patterns.md #flow.json 乐观并发校验模式` + `#原子写模式` + `#建议性文件锁模式` → 归档与需求写入**必须**复用 `FlowManager.save()`（锁 + revision 乐观校验 + `atomicWriteFileSync{backup}`）或 fs 工具层原语，**禁止**绕过锁的直写。
- `kb/patterns.md #破坏性命令安全校验清单模式：默认拒绝 + 显式越权 + 可预览 + 可审计` → `flow archive`（版本未全 done 拒绝）/ `req claim`（占用校验）/ `req link`（存在性校验）默认拒绝非法态，错误路径 exit 非 0 零写盘；`--dry-run` 复用只读校验。
- `kb/patterns.md #CLI --json 结构化输出约定：顶层对象 + schemaVersion + 纯 JSON 单文档` → `flow archive show` / `req` 各命令 `--json` 沿用 `schemaVersion:1`、纯单文档、与人类输出互斥。
- `kb/patterns.md #两阶段状态 draft/publish 的窄兼容设计：扩取值域 + 未发布隔离` → 需求状态扩 7 值域（含 `draft`/`blocked`/`cancelled`/`rejected`）须逐一回答各路径（list / board / next / 聚合 / health / 归档）如何对待。
- `kb/patterns.md #op frontmatter 状态为文档副本、权威源 flow.json` → `REQ-NNN.md` 正文为**人读副本**，机读状态权威恒为 `flow.json`；遇不一致以 flow.json 为准（不为副本漂移开 Bug）。
- `kb/patterns.md #事务顺序模式：先落盘状态、后执行不可逆副作用` → 归档两步（写归档文件 → 移除 flow.json 条目）的**顺序不变量**：先写新增（归档文件），后写删除（flow.json save）；也对齐 kb「刷新严格早于删除」的安全程序。
- `kb/patterns.md #版本号全链路收口清单模式：A/B/C/D/E` + `#文档侧历史标记纳入版本收口禁改白名单：B 类双生成物` → 版本 1.2.0 收口归 stage-85、收口 op 须为最终 op；B 类生成物 = `template-loader.ts` + `update.ts` **双份**。
- `kb/patterns.md #CLI 用法 skill 化模式：权威源单文件 + build 双注入 + 自举 + 快照声明` → 新 skill（`openfeel-req`）零代码改动（build 自动纳入），但**计数断言 17→18 六处**须同批翻转（见核验 A #24）。
- `kb/patterns.md #跨阶段「契约先行」协同` → 归档引擎（78）与需求引擎（81）被下游复用的 API 须在 `deps.yaml` 写 `downstream_contracts`（函数签名级）。
- `kb/troubleshooting.md #需求/文档记载的根因判断须实测复核` + `#flow.json 内容增量核验必含 meta.revision/meta.updated` → 本计划全部断言以源码实测为准（§二）；验收脚本核验 flow.json 增量时须排除 `meta.revision` / `meta.updated`。
- **无**「flow.json 归档拆分 / 需求流转系统」既有条目 → 归档时补沉 architecture（版本分片归档架构 / 四层模型与需求聚合投影）与 patterns（轻量认领协议 / 归档两步事务顺序）。

## 二、源码核验结论（以源码为准，行号以 HEAD `84951ce` 为准）

### 表 A：归档拆分（主题二）

| # | 事实 | 源码位置 | 结论 |
|:-:|------|----------|------|
| A1 | `flow.json` 单文件树：`meta`（version/project/updated/revision）/ `pipeline` / `stages` / `reviews` / `log` 全量同存 | `src/core/flow-manager.ts:107-113`；实测 `.openfeel/flow.json`（406280 B / 78 阶段 / `log` 1313 条） | 归档单元 = `stages` 条目 + 关联 `reviews` + 关联 `log`；`meta`/`pipeline` 保留 |
| A2 | `load()` 从磁盘整体读入（无分片）；存量容错补齐 `ops`/`deps` | `src/core/flow-manager.ts:496-526` | 归档后 `load()` 天然只读活跃视图（归档文件不参与 load）——**常规路径零触碰** |
| A3 | `save()`：锁内乐观校验 + `revision+1` + `.bak` + 原子写全文件 | `src/core/flow-manager.ts:528-568` | 归档后的 flow.json 变更继续走 `save()`；体积下降 → 写放大下降（收益本体） |
| A4 | 宏观 `pipeline.phase` 全量 done 判定：`length > 0 && every(done)`（空集守卫防 vacuous truth；符号 `advanceStagePhase` 内判定） | `src/core/flow-manager.ts:1490-1493`（基线 `fdfebc9`；原 `84951ce` `:1484-1486`） | 归档移除阶段后该判定语义随活跃集变化（**裁定 P：归档后按活跃集重算**；**空集 → 保持 `active`**——stage-79 已定稿） |
| A5 | `pipeline.current = { stage, op }` 单点 owner `syncCurrentOp` | `src/core/flow-manager.ts:1368-1399` | 归档若命中 `current.stage` 所属版本 → `current` **置空** `{stage:'',op:''}`（**裁定 P④；stage-79 已定稿**——REV-79-011/017 收敛） |
| A6 | `advanceStagePhase()` done 分支按 `r.op.startsWith(key + ".")` 过滤该阶段 REV（阻塞检查） | `src/core/flow-manager.ts:1440-1454` | 归档 reviews 后该检查仅剩活跃条目；不影响既有语义（归档版本阶段不再 advance） |
| A7 | `appendLog()` 单点（`this.data.log.push`） | `src/core/flow-manager.ts:2676-2690` | 归档操作自身审计（`archive_flow_version` 等）走同一入口——**注意**：归档后本条审计留在新 flow.json（不属被归档版本） |
| A8 | `flow status --verbose` 显示 `recentLogs = this.data.log.length`（活跃视图计数） | `src/core/flow-manager.ts:1081`；`src/commands/flow.ts:96` | 归档后该计数 = 活跃 log 数（语义变化为「活跃视图」——文档明示） |
| A9 | `flow overview` 读 `data.log.slice(-5)` 展示最近日志 | `src/commands/flow.ts:289-294` | 归档后仅显示活跃 log 末尾——符合「常规路径不读归档」 |
| A10 | `flow log [--last n]` 读 `data.log.slice(-n)` | `src/commands/flow.ts:1141-1170` | 同上；历史日志经 `flow archive show <version>` 获取 |
| A11 | `plan stage add --deps` 校验 `deps ⊆ flow.json 已注册 stages`（未注册 → exit 1 零写盘） | `src/commands/plan.ts:85-99` | **跨版本依赖失效点**：deps 指向已归档阶段时须视为已满足（**裁定 Q**，经 `meta.archived_versions` 判定） |
| A12 | `parseStageId()` 解析三格式并给出 `series`（`v1`）与版本前缀（`v1.1.7`）；`normalizeStageId()` | `src/core/plan/path.ts:41-63` / `:83-86` | 版本分组键直接复用（`fullStageId` 的版本段），**禁自写解析** |
| A13 | `flow checkpoint` 子命令与 `saveCheckpoint` / `listCheckpoints` / `restoreCheckpoint`（`.openfeel/checkpoints/`，保留 20） | `src/commands/flow.ts:1543+`；`src/core/flow-manager.ts:601-670`（save/list）+ `:794`（restore） | 恢复早于归档点的快照会把归档阶段带回 flow.json → **裁定 R**（health 一致性检查 + 文档路径） |
| A14 | `flow health`：`getHealthReport(quick)` + `--fix`（仅回写 status.md 状态） | `src/commands/flow.ts:1630-1670` | 新增「归档一致性」检查项（**裁定 R**，warn 级不改退出码） |
| A15 | `flow metrics` → `MetricsStore.getSummaryData()`，持久化独立文件 `.openfeel/metrics.json`（与 flow.json 同级） | `src/commands/flow.ts:369-378`；`src/core/metrics.ts:1-8` | metrics 数据**不在 flow.json 内**，归档不触碰；归档后指标统计口径 = 活跃集（文档明示） |
| A16 | 既有 `openfeel archive <stage>` = **阶段归档**（`archiveStage` → `.openfeel/log/archive-{stage}.md` 摘要），openfeel-archiver 操作 | `src/commands/archive.ts:1-46`；`src/core/archive/merge.ts:110-116` | 与本次「flow.json 版本归档」**职责分离**（**裁定 O3**）；命名区分：`flow archive` 子命令 vs 顶层 `archive` |
| A17 | `.openfeel/` 实测目录：**无 `archive/` 目录**；有 `checkpoints/`、`flow.json.bak`、`stages/`（历史遗留）、`tmp/`、`users/` 等 | 实测 | 新目录 `.openfeel/flow-archive/` 无命名冲突（方案期可最终定名） |
| A18 | 目录/路径常量单点：`gitignore 生成`、`WORKSPACE_DIRS`（kb #WORKSPACE_DIRS 同步模式） | `src/core/workspace*`（方案期核验） | 新目录 `flow-archive/` 是否需要纳入工作区管理/忽略清单 → 方案期核验（不在本计划冻结） |
| A19 | `flow-manager.ts` 文件锁工具：`withFileLock(projectLockPath(p, "flow"))` / `atomicWriteFileSync{backup}` 由 `src/core/fs/` 提供（零依赖） | `src/core/flow-manager.ts:33-34` | 归档文件写盘复用 fs 工具层 + 独立锁名（如 `flow-archive`），**不与 flow 锁嵌套**（kb #锁不嵌套） |
| A20 | `meta.version` 语义：flow.json = 内部格式（"1.0"） vs config.yaml = 框架版本（1.1.7，kb #config.yaml meta.version 语义） | 实测两文件；kb `#config.yaml meta.version 语义：OpenFeel 框架版本` | **裁定 V**：flow.json `meta.version` 保持内部格式语义；归档文件自带 `schemaVersion: 1` |
| A21 | 本仓 `flow.json.meta = {version:"1.0", project:"OpenFeel", revision:914}`；`pipeline = {phase:"done", current:{stage:"v1.1.7-stage-77", op:"op-001"}}` | 实测 | 存量迁移（stage-80）须处理：`current` 指向将被归档的 v1.1.7-stage-77 |
| A22 | `flow repair`（op↔文件对账）与 `flow review` 均为活跃视图消费 | `src/commands/flow.ts:1173+` / `:1396+` | 归档后仅作用于活跃集；归档文件内 REV 只读展示（`flow archive show`） |

### 表 B：需求流转（主题一）

| # | 事实 | 源码位置 | 结论 |
|:-:|------|----------|------|
| B1 | `FlowData` 顶层 5 键；`reviews: ReviewItem[]` 为顶层数组先例 | `src/core/flow-manager.ts:107-113`（`reviews` 于 111） | 需求层**类比 reviews** 新增顶层 `requirements`；实测本仓 `reviews: []` |
| B2 | `StageData` 无需求字段；已有可选冗余 `workflow_mode?: "full" \| "fast"` | `src/core/flow-manager.ts:92-104`（`workflow_mode` 102-103） | 新增 `requirement_id?: string \| null`（单值、可空；存量 `undefined` ≡ null） |
| B3 | `load()` 对存量容错补齐 `ops`/`deps` | `src/core/flow-manager.ts:496-526`（补齐 511-513） | `requirements` **读侧宽容**（消费处 `?? []` / `getRequirements` 派生；**不** load 补齐——对齐 REV-78-015 方向〔REV-81-003 更正〕）→ **零迁移**向后兼容 |
| B4 | `registerStage()` 幂等（已注册跳过）+ 仅实际新增写 `appendLog(register_stage)` | `src/core/flow-manager.ts:1090-1113` | 需求 `add` 同范式：幂等早返回 + 审计在 `appendLog` 之前判定（kb #审计双轨命名） |
| B5 | `advanceStagePhase()`：done 分支阻塞 REV 检查（1440-1455）→ 写 phase（1461）→ checkpoint（1464）→ `syncCurrentOp`（1478）→ 宏观 done 判定（1484-1486）→ `appendLog`（1489-1494）→ status 投影（1501-1502）→ `targetPhase==="done"` 时 `endStage` + `return true`（1510-1514，命令层 save 后 `autoCommitOnDone`） | `src/core/flow-manager.ts:1408-1517` | **聚合回写第一落点**：done 分支追加**内存**需求状态重算（不改既有控制流与返回值）；命令层既有单次 `save()` 构成同事务 |
| B6 | `resetStagePhase()` 对称复位（允许回退；`to==="done"` 复用阻塞 REV 检查；审计 `reset_stage_phase`） | `src/core/flow-manager.ts:1532+` | **对称回写第二落点**：需求 `done` 是「全部关联阶段 done」的**投影**，阶段回退后不再成立 → 须同步重算（防投影漂移） |
| B7 | `appendLog()` 单点 | `src/core/flow-manager.ts:2676` | 需求动作审计复用（`requirement_add` / `requirement_claim` / `requirement_release` / `requirement_link` / `requirement_status` / `requirement_auto_done` 等） |
| B8 | `getReviewItems()` 防御式查询（无数据返回 `[...]`） | `src/core/flow-manager.ts:970-977` | 需求查询 API 同范式（返回副本，防外部改内存） |
| B9 | `PIPELINE_PHASES` 硬编码 15 项；`META_PHASES = ["active","paused","done"]` | `src/core/pipeline-schema.ts:14-20` / `:29` | **零新增**（硬约束）；需求层不定义新 phase |
| B10 | `mapPhaseToStageStatus()`（阶段 status 投影） | `src/core/flow-manager.ts:4324`（default 分支注释 4311） | 需求聚合为**独立投影函数**（`computeRequirementAggregate`），**不改**既有投影 |
| B11 | 命令注册唯一入口：16 命令组 import（59-74）+ register（76-91） | `src/cli/index.ts:59-74` / `:76-91` | `registerReqCommand` **两行接入** |
| B12 | `registerRoadmapCommand` 命令组范式（子命令 + `common.errorTmpl` + `process.exitCode = 1`） | `src/commands/roadmap.ts:9-46` | `src/commands/req.ts` 同范式 |
| B13 | `plan stage add` 值域校验：`getConfigFieldLegalValues` 派生、非法 exit 1 **且不建阶段** | `src/commands/plan.ts:46-71` | `req set --status/--priority` 值域校验同范式（值域常量单一来源） |
| B14 | `flow mode` 只读命令：`--stage` 存在性校验（未注册且无 status.md → exit 1 防 typo）+ `--json` 纯单文档 | `src/commands/flow.ts:481-530`（`--json` 于 524） | `req show` / `req board` 同范式（REQ ID 非法 → exit 1） |
| B15 | `flow phases --json` 含 `schemaVersion: 1` | `src/commands/flow.ts:447` | `req --json` 沿用 `schemaVersion:1` |
| B16 | `flow review add`：解析 / 校验 / ID 分配 / 写入**单点**（`addReviewEntry`），命令层只呈现 | `src/commands/flow.ts:1173-1230` | 需求命令**单点实现**：ID 分配与校验在 core（`src/core/req/`），命令层零业务逻辑 |
| B17 | `flow advance` 命令：autoRepair → validate → phase 校验 → `advanceStagePhase`（932）→ `save()` → `autoCommitOnDone` | `src/commands/flow.ts:766-830` / `:932` | 需求聚合回写在 core 内存阶段完成 → 既有 `save()` 即同事务；命令层零改动 |
| B18 | `parseStageId()` 三格式；`normalizeStageId()`；`findStageStatusPath()` 三级回退 | `src/core/plan/path.ts:41-63` / `:83-86` / `:261-292` | `req link --stage` 归一化与存在性校验复用（禁自写解析） |
| B19 | `ensureStageSkeleton()`（骨架含「工作流模式」行）；`addStage()` 注册 + **仅新建**时写 `workflow_mode` 冗余 | `src/core/plan/stage.ts:105-192` / `:203-225` | 可选增量：`plan stage add --requirement <REQ-NNN>` —— **方案期定稿**（默认不做，`req link` 已覆盖） |
| B20 | `ConfigDefaultsSchema` 四键（`.passthrough()`）；`getConfigFieldLegalValues()` 派生；`STAGE_FIELD_BY_CONFIG_KEY` | `src/core/config.ts:31-37` / `:56-69` / `:76-80` | 需求 `status`/`priority` 值域**不进 config**；以 `src/core/req/` 常量数组为单一来源 |
| B21 | `WORKFLOW_MODES = ["full","fast"]`（单一来源） | `src/core/config.ts:26-28` | **需求层与 workflow_mode 正交**（硬约束）：`src/core/req/**` 与 `src/commands/req.ts` **不得** import/读取 `workflow_mode` 或转移表 |
| B22 | 共享 skills **17 个**目录；计数断言 **6 处**硬编码 `17` | 实测 `src/core/templates-data/skills/`（17 目录）；`test/core/setup.test.ts:65` / `:221`、`test/core/templates-migration.test.ts:32` / `:41` / `:42`、`test/core/update.test.ts:816` | 新增 skill（`openfeel-req`）→ **17→18 六处翻转** + `npm run build` 重生成双生成物（禁手改） |
| B23 | build 按目录自动纳入 skills（步骤 4 注 `update.ts`；步骤 6 注 `template-loader.ts`）；步骤 8 已移除 | `build.js:34-37` / `:183-215` / `:265-303`（步骤 8 移除 `:1335` / `:1363`） | 新 skill 目录自动纳入 build（`build.js` 零改动） |
| B24 | i18n 双文件 `zh-CN.ts` / `en.ts`（`lint i18n` 对称性校验） | `src/core/i18n-data/{zh-CN,en}.ts` 实测 | `req` 全部文案双表成对；各阶段显式登记新基线（> **796**） |
| B25 | 测试面 67 文件（实测 `find test -name "*.test.ts" \| wc -l` = 67）；v1.1.7 门禁登记 1306 用例 | `test/**` | 新增 `test/core/req*.test.ts` + `test/commands/req.test.ts`；门禁复跑（0 skipped / 0 failed） |
| B26 | `.openfeel/requirements/` 目录**不存在**（实测） | 实测 | 需求正文目录由 stage-81 原语按需 `mkdirSync(recursive)` 创建（幂等） |
| B27 | 本仓 `flow.json`：78 阶段全 done、`reviews: []`、`log` 1313 条（实测） | `.openfeel/flow.json` 实测 | 向后兼容基线：`requirements` 缺失 → load 补齐；78 阶段 `requirement_id` 缺省 = null（不迁移） |
| B28 | `.openfeel/pipeline.yaml` **存在**（自定义 full 表：14 流转键 + `done`；含 `phase_corrections`） | 实测 | 需求层与归档层**均不触碰** `pipeline.yaml` |

## 三、关键裁定（本计划的决策基线）

### 表 A：归档拆分（主题二）裁定 O~V

| # | 议题 | **裁定** | 依据/备注 |
|:-:|------|----------|-----------|
| **O1** | 归档粒度 | **版本** = stageId 的版本前缀（`parseStageId` 的 `vX.Y[.Z]` 段，如 `v1.1.7`）；同版本全部阶段一次性成组 | 核验 A12；用户诉求「按版本号归档」 |
| **O2** | 可归档判据 | **版本存在性门**：活跃 flow.json 无该版本条目（不存在 / 已归档）→ 拒绝零写盘（防空归档覆盖；覆盖写仅限活跃集仍含该版本条目——REV-79-001）；该版本**全部阶段 `phase=done`** + 无该版本 `r.blocking !== false && r.status === 'open'` 的 REV（**全仓唯一谓词**，`blocking` 缺省 = 阻塞——REV-79-002）；不满足 → 默认拒绝（exit 非 0 零写盘，列未满足项）；**不做 `--force`** | kb #破坏性命令安全校验清单；版本收官语义 |
| **O3** | 与既有 `openfeel archive` 的边界 | **职责分离**：顶层 `openfeel archive <stage>` = 阶段摘要归档（`.openfeel/log/archive-*.md`，archiver 用，**不改**）；本期新增 `openfeel flow archive` 子命令组 = flow.json 版本分片（**不改**顶层命令） | 核验 A16；避免同名混淆（i18n 与 docs 显式区分两概念） |
| **P** | 归档写盘与 `pipeline` 处置 | ① 归档文件写盘走 fs 工具层（独立锁名 `flow-archive`，不嵌套 flow 锁）；② flow.json 变更走既有 `save()`；③ **顺序不变量**：先写归档文件（新增），成功后 `save()` 移除条目（删除）；④ `pipeline.current.stage` 属被归档版本 → **置空** `{stage:'',op:''}`（**stage-79 已定稿**，无第二口径）；⑤ `pipeline.phase` 按归档后活跃集重算（**空集 → `active`**，stage-79 已定稿；空集守卫先例 = 工作区 `flow-manager.ts:1490-1493`〔基线 `fdfebc9`；基线 `84951ce` `:1484-1486`〕）；⑥ 完整消费点清单与「阶段枚举视图随活跃集收缩（文档明示，非回归）」口径见下方『裁定 P 附注』 | 核验 A4/A5/A19；kb #事务顺序模式（先落盘后副作用）+ 「刷新严格早于删除」 |
| **Q** | 跨版本依赖（裁定①） | `flow.json.meta.archived_versions: string[]`（轻量索引，`flow archive` 追加 + 幂等去重）；`plan stage add --deps` 校验扩展：deps 版本前缀 ∈ `archived_versions` → **视为已满足**；展示层（**完整消费点清单见『裁定 P 附注』**）**不读归档文件**；详查经 `flow archive show <version>` | 核验 A11；「常规路径零触碰归档」原则 |
| **R** | 恢复与健康可见性（裁定②） | ① `flow checkpoint restore`（含 `--stage`）恢复早于归档点的快照 → 归档阶段被带回：`flow health` 新增「归档一致性」检查项（`archived_versions` ↔ `.openfeel/flow-archive/` 文件对账 + 「flow.json 又含已归档版本阶段」→ **warn**，不改退出码）；② 恢复路径文档明示（restore 后须重新归档）；③ `flow recover`（跨会话恢复）读 flow.json + status.md，**不读**归档（行为不变） | 核验 A13/A14；ADR-004 恢复分层口径延续；消费点清单见『裁定 P 附注』 |
| **S** | 存量迁移（裁定③） | 迁移 = 对本仓按版本依次执行 `flow archive <version>`（`--dry-run` 先行）；程序照 kb #真实全局目录操作的安全程序：**全量备份**（flow.json 至备份目录 + SHA256）+ 逐版本**判据门**（全 done 校验）+ 回滚路径成文；**归 stage-80 自举项**（执行前用户确认；类比 v1.1.7 T9 口径） | 核验 A21；本仓 = 首个迁移对象（dogfood） |
| **T** | 切分细则 | `stages` 按版本分组全搬；`reviews` 按 `r.op` 前缀（`<stageId>.op-NNN` 或 `<stageId>`）解析版本分组；`log` 按 `detail.stageName` 解析版本分组，**缺失/不可解析者保留在 flow.json**（不归档）；归档文件整体重写（同版本重复归档 = 幂等覆盖 + 审计） | 核验 A1/A6/A22；log 实测 13 种 action（`advance_stage_phase` / `add_stage` / `archive_stage` / `attempt_pass` / `register_op` / `register_stage` / `scheme_remove` / `stage_deps_set` / `scheme_create` / `scheme_publish` / `remove_stage` / `scheme_rename` / `config_sync_stage`）——无 stageName 条目须兜底 |
| **U** | 归档文件 schema | `.openfeel/flow-archive/{version}.json`：`{ schemaVersion: 1, version, archived_at, stages, reviews, log, counts: {...} }`；**只增不改**（无 unarchive 命令 → 留后续版本）；写入=新建/覆盖（按 version 幂等） | kb #CLI --json 约定（`schemaVersion:1`）；核验 A17（目录无冲突） |
| **V** | `meta.version` 语义（裁定⑤） | flow.json `meta.version` 保持**内部 schema 格式**语义（当前 `"1.0"`，**非**框架版本——框架版本在 `config.yaml meta.version`，kb 已载）；归档文件自带 `schemaVersion: 1`；`flow archive` **不改** flow.json `meta.version` | 核验 A20；kb #config.yaml meta.version 语义 |
| **W** | 边界（不做，归档拆分） | 不做自动归档（**不挂** `advanceStagePhase` 钩子）；不做 log「保留最近 N 条」窗口（归档即按版本全搬）；不归档 `.openfeel/metrics.json`（独立文件）；不做归档文件删除/还原命令；**不归档 `requirements` 字段**（需求层尚未落地——其归档口径留后续版本，见 §七） | 用户约束「CLI 控制」+ 减法优先 |

> **裁定 P 附注 —— 归档消费点清单（完整枚举；裁定 P/Q/R 与 §八.4 / §八.14 / §十一.3 共用口径）**：
>
> ① **阶段枚举消费点（按活跃 `data.stages` 渲染/判定，随活跃集收缩；均不读 `.openfeel/flow-archive/**` 文件内容——唯一例外：`flow health` 归档一致性对账读目录清单级信息）**
>   - 渲染类：`flow status`（阶段计数 + current phase；verbose 含活跃 log 计数）、`flow overview`（阶段列表 + 最近日志）、`flow current`、`flow ops list`、`flow log`（活跃 log）、`flow wizard`、`flow health`；
>   - 判定/操作类：`flow mode`（`--stage` 存在性校验 + 目标行）、`flow phases`（`--stage` 存在性校验）、`flow advance` / `attempt` / `retry` / `repair` / `recover` / `checkpoint restore`、`flow stage add/remove/set/reset`、`stage create`、`plan stage add --deps`、`plan scheme list`（draft 标记）、`plan register`、`openfeel archive <stage>`（阶段摘要归档；已 flow-归档版本的阶段不再经此入口）、`config set --sync-stages`（无 `--stage` = 活跃集枚举；**显式 `--stage` 命中已归档版本时按附注④ 降级适配**）。
>
> ② **文件系统视图/操作（不随归档变化，文档明示）**：`plan stage list`（扫描 `.openfeel/plan/**`）、`stage status` / `stage task` / `stage set`（status.md 定位与操作——含已归档版本；`stage set --workflow-mode` 的 flow.json 冗余同步对已归档阶段静默跳过；**`config set --sync-stages --stage <已归档显式全名>` 同范式降级**——仅同步 status.md、跳过 flow.json 冗余 + info〔REV-80-003 裁定①〕）、`view list` / `view accept`（审查条目）——归档仅移转 flow.json 内条目，**不触碰**文件系统；已归档版本的 plan 目录 / status.md 仍在原位。
>
> ③ **阶段枚举视图随活跃集收缩（文档明示，非回归）**：归档后 ① 类视图的阶段枚举/计数随活跃集减少（如 `flow status` 的 stagesCount、`flow overview` 的阶段列表），属**设计预期**；已归档版本历史仅经 `flow archive show <version>` 按需读取。`flow metrics` 读独立 `.openfeel/metrics.json`（不经 flow.json），归档对其零影响。
>
> ④ **口径边界——「枚举收缩」不涵盖「操作拒绝」（REV-80-003）**：③ 的枚举收缩仅指**无显式目标的枚举/计数视图**（如 `flow status` 计数、`flow overview` 列表、无 `--stage` 的 `config set --sync-stages`）。**显式命名已归档版本**时，各消费点行为须**逐命令显式裁定**，不得以枚举收缩笼统豁免：**适配类**——`plan stage add --deps` / `flow stage set --deps`（显式版本前缀 ∧ 版本 ∈ `archived_versions` → 视为已满足，裁定 Q；短名仍须已注册）、`config set --sync-stages --stage <已归档显式全名>`（降级「仅 status.md、跳过 flow.json 冗余」，REV-80-003 裁定①）、`flow mode` / `flow phases`（`--stage` 校验为「已注册 **或** status.md 存在」双条件，对已归档版本原样可用）；**有意拒绝类**——flow.json 记录层操作（`flow advance` / `attempt` / `stage reset` / `flow stage set <已归档目标>` 等）对已归档目标 → 拒绝（阶段已退出活跃集、记录冻结于归档文件），属**有意拒绝**（语义正确；文档成文归 stage-85），**不属**枚举收缩豁免、**不属**§八.14「零报错」承诺范围。

### 表 B：需求流转（主题一）裁定 A~N

| # | 议题 | **裁定** | 依据/备注 |
|:-:|------|----------|-----------|
| **A** | 模型层级 | 四层：`版本 roadmap → 需求 REQ-NNN → 计划 stage(15-phase) → 方案 op`；**需求 = 排期与调度层，计划 = 对某项明确需求的具体实现** | ADR-011；用户诉求原话 |
| **B** | 需求状态模型 | **双层**：需求层显式粗粒度状态 `draft → scheduled → in_progress → done`（+ `blocked` / `cancelled` / `rejected`，共 7 值）；`in_progress` 内部进度由关联阶段 15-phase **聚合**；工序单一事实源 = `phase`（对齐 ADR-003） | ADR-011 抉择 1；kb #状态/相位单一事实源 |
| **C** | 存储 | `flow.json` 顶层 `requirements: RequirementData[]`（load 缺失补齐）；**所有写入复用 `save()`**（锁 + revision 乐观锁 + 原子写 + `.bak` + 审计）；需求正文 `.openfeel/requirements/REQ-NNN.md` 为**人读副本**，机读权威恒为 `flow.json` | ADR-011 抉择 2；核验 B3/B4；kb #op frontmatter 权威源 |
| **D** | 需求↔计划基数 | **1:N**：`stage.requirement_id` 单值、可空（存量 = null）；stage 单属一需求 | ADR-011 抉择 3 |
| **E** | 认领协议 | `owner` + `claimed_at`；`req claim` **占用校验**（已被他人占用 → exit 1 零写盘，**不设 `--force`**；换人须先 `req release`）；**无 TTL / 心跳 / 抢占** | ADR-011 抉择 4；kb #破坏性命令安全校验清单 |
| **F** | 需求 ID | `REQ-NNN`（三位补零）；分配 = 现存 `requirements` 的 max+1（**不回收、不解析文件**，core 单点分配）；格式校验 `/^REQ-\d{3,}$/` | 类比 REV 分配；无删除命令 → 回收无收益 |
| **G** | 命令面 | 新增顶层命令组 `openfeel req`（`add` / `list` / `show` / `claim` / `release` / `set` / `link` / `advance` / `board` / `next`）；落地 = 新建 `src/commands/req.ts` + `src/cli/index.ts` 两行注册；`--json` 沿用 `schemaVersion:1` | ADR-011；核验 B11/B15/B16 |
| **H** | 聚合判定与回写 | 聚合 = **独立投影函数**（阶段 phase → 需求状态）：全部关联阶段 `done` → 需求 `done`（**零关联阶段不作 done 判定**——空集守卫；done 判定与 `req advance --to done` 门**同源**，复用 `allLinkedStagesDone` 单一原语——REV-83-002）；任一阶段非 `plan_pending` → `in_progress`（**投影语义、不自动回写**——`scheduled → in_progress` 由 `req advance` 显式驱动；非 done 推进不触发聚合回写——REV-83-005）；**回写落点** = `advanceStagePhase` **仅 done 分支**（auto-done 前置集 = `{scheduled, in_progress}`）+ `resetStagePhase`（**对称回退，按聚合视图**：重算聚合 ≠ done ∧ status === done → 回退 `in_progress`）；纯内存重算，命令层既有单次 `save()` 即同事务；**不新增写盘点**、不改 `mapPhaseToStageStatus`、不改返回值语义 | 核验 B5/B6/B10；「投影可重算」= 漂移自愈；口径同步 = REV-83-009（用户裁定：维持 `{scheduled, in_progress}`） |
| **I** | phase 枚举 | **零新增**；不改 `PIPELINE_PHASES` / 转移表 / `checkpoint_mapping` / `phase_corrections` / `advanceAccepted` 语义 | 硬约束；核验 B9 |
| **J** | workflow_mode 正交 | 需求层**不读 / 不写** `workflow_mode` 与转移表；full / fast 阶段均可关联同一需求且行为一致 | 核验 B21；ADR-011 后果节 |
| **K** | 需求正文模板 | `.openfeel/requirements/REQ-NNN.md` 骨架（建议）：标题 / 状态 / 摘要 / 目标与验收 / 预估版本 / 关联阶段 / 变更记录；骨架由 CLI 机械铺（core 原语），Agent 填充；**方案期定稿** | 核验 B26；裁定 C |
| **L** | 不做历史迁移 | 存量 78 阶段 `requirement_id` 缺省 = 遗留无需求；**不回填**、不建「遗留需求」占位 | kb #「未来写入统一 + 历史共存」渐进收敛策略 |
| **M** | 显式推进 vs 聚合 | `req advance` 为**显式人工推进**，合法目标 = 引擎流转表单点（`requirement-ops.ts :: ALLOWED_TRANSITIONS @ :143-149`，HEAD `c5f1d53`）：前进路 `draft → scheduled` / `scheduled → in_progress` / `in_progress → done`；**`blocked` 回流** `blocked → scheduled` / `blocked → in_progress`（**枚举补全**——REV-82-003）；任意非终态 → `blocked`/`cancelled`/`rejected`；终态零出口。命令层**零第二份流转表**（「列合法目标」经引擎新增导出 `getAllowedNextStatuses` 消费——REV-82-003）；`done` 目标须**全部关联阶段 done**（不设 `--force` 绕过聚合）；聚合自动回写**前置集 = `{scheduled, in_progress}`**（聚合 done → 需求 `done`；非 done 推进不触发）；对称回退按**聚合视图**（重算聚合 ≠ done ∧ status === done → 回退 `in_progress`）——详见裁定 H | 核验 B5；开放问题 Q4；REV-82-003；口径同步 = REV-83-009（用户裁定：维持 `{scheduled, in_progress}`） |
| **N** | 边界（不做，需求流转） | 不做需求间运行时 DAG 调度（仅 `deps` 就绪判定）；不做 TTL / 心跳抢占；不做 artifact-graph 集成（本版**不借**其拓扑排序）；不做 M:N；不新增第三方依赖；不触碰 `build.js` / `package.json`（除模板重生成必需） | 用户任务书边界；ADR-011 |

### 跨主题裁定

| # | 议题 | **裁定** | 依据/备注 |
|:-:|------|----------|-----------|
| **X** | 本仓 v1.2.0 工作流模式 | 本仓 v1.2.0 八阶段**全部以 `full` 运行**（架构级变更需完整审计链；稳定性/归因优先）；如需切换 fast dogfood，仅需 Feel 执行 `openfeel config set defaults.workflow_mode fast --sync-stages`（无需改计划） | roadmap「关键裁定 · 本仓自举」；开放问题 Q1 |

### 执行顺序裁定（主题二先行）

**裁定 S（顺序）**：**归档拆分先行**（78→79→80，主题二）→ 需求流转（81→85，主题一），全程严格串行。理由：

1. **收益前置兑现**——归档后本仓 flow.json 体积骤减（仅剩 v1.2.0 阶段），后续 7 个阶段的每次 `save()` 与 Agent 读状态成本同步下降（本仓即首个 dogfood 受益者，与用户「避免读取污染上下文」诉求同向）。
2. **减少主题一（需求流转）的不确定面**——若先做需求层，归档设计须额外处理「`requirements` 如何随版本切分」（需求可跨版本、可关联多版本阶段 → 切分语义复杂）；归档先行则切分只处理既有三段（stages/reviews/log），`requirements` 归档口径留后续版本（裁定 W）。
3. **风险面分离**——归档触碰「版本收官后的搬运」（历史只读面）与既有 done 阶段；需求层触碰「推进中部」（`advanceStagePhase` done 回写）。串行 + 归档先行使需求层在**已收缩的 stage 集合**上开发聚合逻辑（边界情形更少）。
4. **失败可回退**——归档若审查/验收不通过，需求层尚未开始，回滚面最小（仅归档文件与 flow.json 备份还原）。

## 四、阶段概览、依赖图与执行顺序

| 阶段 | 主题 | 名称 | 核心交付 | 依赖 | op 估 |
|------|:--:|------|----------|------|:--:|
| `v1.2.0-stage-78` | 归档 | 归档核心引擎 | 新建 `src/core/flow-archive/`：归档文件 schema（裁定 U）+ 读/写/列举原语（fs 工具层 + 独立锁）+ 版本分组解析（`parseStageId` 复用，裁定 O1）+ 切分纯函数（stages/reviews/log，裁定 T）+ `meta.archived_versions` 管理（裁定 Q）+ 单测 | — | 3 |
| `v1.2.0-stage-79` | 归档 | 归档命令面 | `flow archive <version>`（**版本存在性门** + 判据门 + `--dry-run` + `--json`）+ `flow archive list` + `flow archive show <version> [--json]` + i18n 双表 + 审计（`archive_flow_version`）+ **`pipeline.current`/`phase` 处置（裁定 P；与归档同一事务，owner = 本阶段）** + 单测 | hard: 78 | 3 |
| `v1.2.0-stage-80` | 归档 | 归档消费点适配与存量迁移 | 跨版本 deps 适配（`plan stage add` + `flow stage set` 两处校验点 + health 读侧 `checkDanglingDeps`，单一口径 helper；裁定 Q）+ `config set --sync-stages --stage` 已归档目标降级（REV-80-003 裁定①）+ `flow health` 归档一致性检查（裁定 R；落点 `src/core/flow-archive/archive-health.ts`；**`pipeline` 处置已归 stage-79**——本阶段仅消费点适配 + 迁移 + 健康检查 + 承接 REV 收口）+ **本仓 78 阶段一次性迁移**（备份程序 + 判据门 + 回滚路径成文，裁定 S）+ 端到端（归档后既有命令全绿 + flow.json 体积实测下降） | hard: 78, 79 | 3 |
| `v1.2.0-stage-81` | 需求 | 需求核心引擎 | `RequirementData` / `RequirementStatus` 类型 + `FlowData.requirements`（load 补齐）+ `StageData.requirement_id` + 需求 CRUD 与认领原语（add/get/list/update/claim/release）+ ID 分配（REQ-NNN，裁定 F）+ 正文文件原语（裁定 K）+ 单测 | hard: 80 | 3 |
| `v1.2.0-stage-82` | 需求 | 需求命令面 | `src/commands/req.ts`（10 子命令）+ `src/cli/index.ts` 注册 + i18n 双表 + `--json` 契约 + 退出码语义（并发 2 / 通用 1）+ 单测 | hard: 81 | 3 |
| `v1.2.0-stage-83` | 需求 | 需求聚合判定与对账 | `computeRequirementAggregate`（独立投影）+ `advanceStagePhase` done / `resetStagePhase` **对称回写**（内存，同事务）+ 存量兼容（`requirement_id` 缺省、`requirements` 缺失零报错）+ health 对账（可选 warn）+ 端到端聚合单测 | hard: 81, 82 | 2 |
| `v1.2.0-stage-84` | 双主题 | Agent/skill 契约 | `feel.md`×4 + `openfeel-planner.md`×4（需求纪律 + 归档纪律）+ 新 skill `openfeel-req` + `openfeel-cli-usage` 补 `req` 与 `flow archive` + build 双生成物重生成 + 静态断言（skills **17→18** 六处计数翻转） | hard: 82, 83 | 3 |
| `v1.2.0-stage-85` | 双主题 | 文档与版本收口（v1.2.0 收官） | README×3 + GETTING_STARTED + commands + manual（core/flow-archive + core/requirement + cli/req）+ CHANGELOG `[1.2.0]` + 版本 **1.2.0** 全链路（A/B/C/D/E）+ roadmap/plan 回填 + 双主题端到端验收 | hard: 84 | 3 |

### 依赖图与执行顺序（**严格串行**）

```
stage-78 ─▶ stage-79 ─▶ stage-80 ─▶ stage-81 ─▶ stage-82 ─▶ stage-83 ─▶ stage-84 ─▶ stage-85
  └─────────── 主题二：归档拆分（先行）───────────┘└──────────── 主题一：需求流转 ────────────┘
```

**执行顺序：78 → 79 → 80 → 81 → 82 → 83 → 84 → 85。**

**为何 8 阶段（而非更少）**：

1. **主题二边界（归档拆分）**：归档「引擎 / 命令面 / 消费点与迁移」三段性质不同——引擎是纯函数与 IO 原语（单测可尽验）；命令面是交互副作用（判据门 / `--dry-run` / i18n / `--json` 契约 / `pipeline` 处置〔须与归档同一事务，REV-79-005〕）；消费点适配 + 存量迁移是**对既有系统的侵入面**（deps 校验 / health），风险最高、须独立审查焦点与独立回滚（备份程序）。
2. **主题一边界（需求流转）**：需求「引擎 / 命令面 / 聚合回写」三段与 v1.1.7 的 74/75 切分同构（引擎纯单测；命令面 TTY/i18n/`--json`）；聚合回写独立成阶段——它触碰 `advanceStagePhase` / `resetStagePhase`（既有推进热点），须独立端到端（「阶段推进 → 需求自动 done」）。
3. **契约vs收口**：`stage-84`（Agent 行为契约）与 `stage-85`（终局包装）分离——版本收口 op 须为最终 op（v1.1.6/v1.1.7 既有口径）；契约须在冻结前经审查与测试。

### 主题二为何先行（归档 → 需求）

见 §三「执行顺序裁定 S」四点理由（收益前置 / 减少需求层不确定面 / 风险面分离 / 失败可回退）。**补充硬证据**：本仓 flow.json 现为 **406280 B / revision 914 / 1313 条 log**；归档后预估活跃体积降至 v1.2.0 单版本（约 1/10），主题一（需求流转）全部 5 个阶段的 `save()` 写放大与 Agent 读状态成本直接受益——与用户「避免读取污染大模型上下文窗口」的原始诉求同向。

## 五、建议阶段注册表（供 Feel 经 CLI 执行；本计划**不推进 phase**）

| # | stageId | 名称 | deps | exec-mode | auto-advance | workflow-mode |
|:-:|---------|------|------|:--:|:--:|:--:|
| 1 | `v1.2.0-stage-78` | 归档核心引擎 | — | auto | enabled | full |
| 2 | `v1.2.0-stage-79` | 归档命令面 | `v1.2.0-stage-78` | auto | enabled | full |
| 3 | `v1.2.0-stage-80` | 归档消费点适配与存量迁移 | `v1.2.0-stage-79` | auto | enabled | full |
| 4 | `v1.2.0-stage-81` | 需求核心引擎 | `v1.2.0-stage-80` | auto | enabled | full |
| 5 | `v1.2.0-stage-82` | 需求命令面 | `v1.2.0-stage-81` | auto | enabled | full |
| 6 | `v1.2.0-stage-83` | 需求聚合判定与对账 | `v1.2.0-stage-81` `v1.2.0-stage-82` | auto | enabled | full |
| 7 | `v1.2.0-stage-84` | Agent/skill 契约（双主题） | `v1.2.0-stage-82` `v1.2.0-stage-83` | auto | enabled | full |
| 8 | `v1.2.0-stage-85` | 文档与版本收口（v1.2.0 收官） | `v1.2.0-stage-84` | auto | enabled | full |

- **注册命令**（Feel 执行）：`openfeel plan stage add <stageId> --deps <ids...> --tasks <items...> --exec-mode auto --auto-advance enabled --workflow-mode full`；随后 `openfeel flow advance --stage <stageId> --to plan_pending`。
- **review-agent**：全部 `openfeel-reviewer`。
- **op 级依赖**（`ops/deps.yaml`）由 openfeel-schemer 在各阶段产方案时落盘（hard / soft / mutual_exclusion，声明实际文件名）。
- **本计划已代 Feel 落盘**：`.openfeel/roadmap/v1.2.0.md` + `.openfeel/plan/v1/v1.2.0/{plan.md,deps.yaml}` + `.openfeel/plan/v1/v1.2.0/` 目录；**阶段目录/status.md 骨架、flow.json 注册与 phase 推进仍由 Feel/CLI 执行**。

## 六、版本收口清单（1.1.7 → 1.2.0，A/B/C/D/E，归 stage-85）

> 依据 `kb/patterns.md #版本号全链路收口清单模式` + `#文档侧历史标记纳入版本收口禁改白名单`；以**内容特征**判定，不以行号为准；B 类为**双生成物**。

- **A 手工载体**：`package.json`（`version`）；`package-lock.json`（root 两处，**禁 `npm install` 重生成**）；`.openfeel/config.yaml`（`meta.version` **单行 edit，禁整文件重写**）；`src/core/config.ts`（`CONFIG_TEMPLATE_ZH` / `_EN` 各一处版本行）；`src/core/templates-data/agents-md/{zh-CN,en}.md`（「当前 v1.1.x」行）；`src/core/templates-data/claude/constraint/{zh-CN,en}.md`（同款版本行）。
- **B 生成段（双份）**：`src/core/template-loader.ts` + `src/core/update.ts`，由 `npm run build` 从 A 类权威源 + 模板源重生成（**禁手改**；`git status --porcelain src/` 干净断言）。
- **C 传播**：`CHANGELOG.md` 追加 `## [1.2.0]`（显著登记：新增 `flow archive` 子命令组 + 顶层 `openfeel req` 命令组 + `requirements`/`archived_versions` 字段 + 归档语义）；`README*`（版本横幅 + 能力小节 ×2 主题）；`docs/commands.md` 快照 + 新命令组；`docs/GETTING_STARTED.md` 快照 + 归档/需求指引；`templates-data/skills/openfeel-cli-usage/SKILL.md`（权威源快照 v1.2.0 + `req` 与 `flow archive` 两节）。
- **D 禁改**：`src/**` 历史批注（`v1.1.x-stage-*` 示例）、依赖自身版本、manual 变更历史、`test/**` 注释、`docs/phase-*/**`；**文档侧能力引入标记**（「v1.1.6 起」等）白名单化处理。
- **E 无载体**：`docs/design-philosophy.md` 等非版本型文档（仅当能力描述失实时按需改，非版本收口项）。
- **CLI `VERSION` 常量不存在**：`--version` 直读 `package.json`。

## 七、边界（不做）

**主题二（归档拆分）**：

1. 不做**自动归档**（不挂 `advanceStagePhase` 钩子；触发 = 显式命令）。
2. 不做 log「保留最近 N 条」窗口（归档 = 按版本全搬；「近期」即「未归档」）。
3. 不归档 `.openfeel/metrics.json`（独立文件，不在 flow.json 内）。
4. 不做归档文件删除 / 还原（无 `unarchive` 命令，留后续版本评估）。
5. 不归档 `requirements` 字段（需求层尚未落地；其归档口径留后续版本裁定——届时须回答「跨版本需求如何切分」）。
6. 不改 `.openfeel/checkpoints/`（快照仍为 flow.json 全量快照；恢复与归档的关系按裁定 R 处理）。
7. 不改顶层 `openfeel archive <stage>`（阶段摘要归档）语义——**两概念职责分离**（裁定 O3）。

**主题一（需求流转）**：

8. 不做需求间运行时 DAG 调度（仅 `deps` 就绪判定；`req next` 仅做筛选与排序，不做自动调度）。
9. 不做 TTL / 心跳抢占（`req release` 显式释放）。
10. 不做 artifact-graph 集成（与流水线脱钩，本版不借其拓扑排序）。
11. 不做 M:N（stage 单属一需求）。
12. 不做需求删除命令（`cancelled` / `rejected` 为终态表达）。

**双主题共同**：

13. 不改 phase 枚举（15 项）/ 转移表 / `checkpoint_mapping` / `phase_corrections` / `advanceAccepted` 语义；不改 `.openfeel/pipeline.yaml`。
14. 不新增第三方依赖；不改 `bin/openfeel.js` 安装链路；不改 CI workflow；不触碰 `build.js` / `package.json`（除模板重生成必需）。
15. 不破坏既有 `--json` 契约（既有命令输出只增不改；新命令自身遵循 `schemaVersion:1`）。
16. 不 `npm publish`、不 `git push`；**不直写 `flow.json`**；不推进流水线 phase（由 Feel 经 CLI 执行）。
17. 需求层与归档层**正交**：`workflow_mode`（full/fast）不参与任一层语义。

## 八、全局验收标准（版本级）

1. **门禁**：`npm test` 全绿（`0 skipped / 0 failed`，登记值 ≥ 67 文件 / 1306 用例 + 本版新增）；`npx tsc --noEmit` = 0；`openfeel lint i18n` = 实测新基线（> **796**，各阶段显式登记）；`openfeel lint kb` = 0 过期；`npm run build` ×2 幂等（`git status --porcelain src/` 空）；`node bin/openfeel.js --version` == `1.2.0`。
2. **归档正确性**（隔离临时项目）：构造多版本 fixture → `flow archive vX` 后：① `.openfeel/flow-archive/vX.json` 含该版本全部 stages + 关联 reviews + 关联 log；② flow.json 中该版本条目**零残留**；③ 审计含 `archive_flow_version`；④ `meta.archived_versions` 含 `vX`；⑤ 重复归档幂等（文件覆盖 + 无重复索引）。
3. **归档判据门**：含未 done 阶段或 blocking open REV 的版本 → `flow archive` **拒绝**（exit 非 0、零写盘、列未满足项）；`--dry-run` 逐字节零写盘（含 flow.json、归档文件、`meta.revision` 不变）。
4. **常规路径零触碰**：归档后全部消费点（完整清单见 §三 裁定 P 附注；含 `flow status` / `overview` / `current` / `ops list` / `health` / `log` / `metrics` / `wizard` / `advance` 等）不读 `.openfeel/flow-archive/**` 文件内容（例外：`flow health` 归档一致性对账读目录清单级信息）；可用文件访问断言或重命名归档目录后命令全绿验证。
5. **跨版本 deps**：`plan stage add --deps` / `flow stage set --deps`（同判据单一口径）`<已归档 stage>`（**显式版本前缀命名**）→ **成功**（视为已满足）；`<不存在且未归档 stage>` → 仍 exit 1；**短名仍须已注册**（REV-80-001）。
6. **恢复一致性**：`flow checkpoint restore` 带回归档阶段 → `flow health` 报「归档一致性 warn」（`archived_versions` 与 flow.json 对账），退出码不变。
7. **存量迁移（本仓自举）**：78 阶段按 9 个版本组归档后：① flow.json 体积实测显著下降（记录前/后 KB）；② `plan`/`flow`/`stage` 既有命令全绿；③ 备份 + 回滚路径成文；④ `flow archive list` 列出 9 组。
8. **需求全生命周期**（隔离临时项目）：`req add` → `req set --status scheduled` → `req claim` → `req link --stage X` → 阶段推进 → 全阶段 done → **需求自动 done**（同事务；审计 `requirement_auto_done`）；`reset` 回退阶段 → 需求回退 `in_progress`（对称）。
9. **需求认领**：第二方 `req claim` 占用中需求 → exit 1 零写盘；`req release` 后可再 claim；`claim`/`release`/`set` 幂等与审计齐全。
10. **需求 `--json` 契约**：`req list/show/board --json` 纯 JSON 单文档 + `schemaVersion:1`；`--json` 与人类输出互斥（无 ANSI/提示行）。
11. **相位零新增**：`PIPELINE_PHASES` 15 项不变；`flow phases` / `flow advance` 输出与接受集**逐字不变**（归档与需求层均不触碰转移表）。
12. **正交性**：fast 阶段与 full 阶段可关联同一需求且聚合行为一致；`req` / `flow archive` 代码不 import/读取 `workflow_mode`。
13. **Agent 侧对称**：`feel.md` 4 份（opencode/claude × zh-CN/en）需求与归档纪律一致；`openfeel-planner.md` 4 份对称；opencode 既有关键串**零回归**（跨 harness diff 断言）；skills 计数 17→18 六处同步；`template-loader.ts` + `update.ts` 由 build 重生成（禁手改）。
14. **向后兼容**：无 `requirements` / `archived_versions` 字段的旧 flow.json 与无归档文件的仓库 → 全命令零报错；本仓既有命令**不读** `.openfeel/flow-archive/**` 文件内容（例外：`flow health` 归档一致性对账读目录清单级信息）、**不报错**（除 `flow health` 新增 warn 项与 `flow --help` 新增子命令）；**阶段枚举视图随活跃集收缩（文档明示，非回归——仅限无显式目标的枚举/计数视图）**；对已归档版本的**显式命名操作**按各命令裁定处理（deps 判定视为已满足 / `config set --sync-stages --stage` 降级「仅 status.md」/ flow.json 记录层操作有意拒绝——**不属**枚举收缩豁免与「零报错」承诺范围）——见 §三 裁定 P 附注④。

## 九、风险总览

| # | 风险 | 影响 | 缓解 |
|:-:|------|------|------|
| **R-1** | **归档两步事务半完成**（归档文件已写、flow.json save 失败/冲突）→ 双份数据 | **高** | 顺序不变量「先写归档文件（新增）→ 后 save 移除（删除）」（裁定 P）；幂等重跑收敛（同版本覆盖写）；归档命令捕获并发冲突走既有退出码 2；验收 2.⑤ |
| **R-2** | **常规路径误读归档**（违反「不污染上下文」目标） | **高** | 归档文件独立目录 + 常规命令零 import；验收 4（重命名归档目录后全命令绿）；kb 文档明示 |
| **R-3** | **跨版本 deps 断链**（`plan stage add` 拒绝依赖已归档阶段） | **高** | `meta.archived_versions` 轻量索引 + 前缀判定（裁定 Q）；验收 5（正/负例） |
| **R-4** | **聚合回写触碰 `advanceStagePhase` / `resetStagePhase`**（既有 78 阶段推进路径回归） | **高** | 回写只追加**内存**操作、不改控制流与返回值（裁定 H）；新增「无 `requirement_id` 阶段推进逐字不变」回归断言；验收 11 |
| **R-5** | **第二事实源**（需求状态 vs 阶段 phase；`REQ-NNN.md` 正文 vs flow.json） | 中 | 聚合为纯投影函数（可重算 = 漂移自愈）；正文为人读副本 + 权威源明示（裁定 C）；health 对账（裁定 R 扩展） |
| **R-6** | **存量迁移误操作**（本仓 78 阶段搬迁） | 中 | 裁定 S：全量备份 + SHA256 + 逐版本判据门 + `--dry-run` 先行 + 回滚路径成文；执行前用户确认 |
| **R-7** | **恢复（checkpoint restore）带回归档阶段** | 中 | 裁定 R：health 一致性 warn + 文档明示（restore 后须重新归档） |
| **R-8** | 新 skill 触发 **17→18 计数翻转点遗漏**（六处） | 中 | 核验 B22 清单逐点翻转 + build 重生成 + 全仓 `rg` 复核 |
| **R-9** | `req` / `flow archive` 的 i18n 键与 `--json` 契约遗漏 | 中 | 双表成对 + 各阶段显式登记新基线（> 796）+ 契约兼容性单测（`--json` 纯单文档断言） |
| **R-10** | 需求 ID 分配并发（两进程同时 `req add` → 同号） | 低 | `save()` 乐观并发校验兜底（后写者退出码 2）；单机低频（与 REV/op 分配同风险级） |
| **R-11** | `pipeline.phase` 空集语义不清（全部阶段被归档后） | 低 | 裁定 P 明确「按活跃集重算 + 空集与既有守卫（工作区 `:1490-1493`，基线 `fdfebc9`）对齐」→ **stage-79 已定稿并断言** |
| **R-12** | 文档-实现发散（快照类文档写未来能力） | 低 | 「提供版本」标注纪律（kb #未来功能写入 skill 与文档须标注提供版本） |
| **R-13** | 本仓自举期 78~85 阶段被误关联需求 / 误归档 | 低 | 本仓 78~85 阶段 `requirement_id` = null；v1.2.0 版本自身在版本收官前不满足归档判据（O2） |

**回滚**：主题二——恢复 flow.json 备份（或 `git checkout`）+ 删除 `flow-archive/` 目录 + `meta.archived_versions` 移除；主题一——`git revert` 对应 commits + 移除 `requirements`/`requirement_id`（字段缺省即回落），`req` 命令注册两行移除；两主题均无数据格式破坏（缺省即回落）。

## 十、开放问题（留待实施期定稿/用户确认）

- **Q1（需用户确认）**：本仓 v1.2.0 八阶段**全部以 `full` 运行**（**裁定 X**——见 §三「跨主题裁定」；稳定性/归因优先）vs fast dogfood。如需切换，仅需 Feel 执行 `openfeel config set defaults.workflow_mode fast --sync-stages`（无需改计划）。
- **Q2**：归档目录最终定名 `.openfeel/flow-archive/` vs 其它（须核验 `WORKSPACE_DIRS` / gitignore 生成 / workspace skill 的目录清单是否需同步登记）→ **stage-78 方案期定稿**（核验 A18）。
- **Q3**：`pipeline.phase` / `pipeline.current` 在归档后的精确语义（置空 vs 指向活跃；空集时 `phase` 取值）→ **已收敛（stage-79 定稿：`current` 置空 `{stage:'',op:''}`；空集 → `phase='active'`）**（裁定 P）。
- **Q4**：`req advance --to done` 的严格性（默认要求全部关联阶段 done、不设 `--force`）与 `blocked` 解除路径（`req set --status` + reason 字段是否入 schema）→ **stage-81/82 方案期定稿**。
- **Q5**：`req next` 就绪判定口径（纯筛选：`status=scheduled` + `owner` 空 + `target_version` 排序 vs 含关联阶段 deps 只读提示）→ **stage-82 方案期定稿**（默认纯筛选，不做 DAG）。
- **Q6**：需求层是否并入 `flow health` 对账项（悬空 `requirement_id` / `done` 漂移）→ **stage-83 定稿**（默认：warn 级、不改退出码，与裁定 R 同范式）。
- **Q7**：新 skill 命名（`openfeel-req` vs `openfeel-requirement`）与 `plan stage add --requirement <REQ-NNN>` 是否本版提供 → **stage-81/84 定稿**（默认：`openfeel-req`；`--requirement` 不做，`req link` 已覆盖）。
- **Q8**：`req board` 人类输出形态（表格 vs 分组看板）与 `flow archive list` 输出列 → **方案期定稿**（`--json` 结构先行冻结）。
- **Q9**：本仓自举迁移（stage-80）的版本批次与时机（一次全搬 vs 分批）→ **stage-80 方案期定稿**（须用户确认后执行）。

## 十一、端到端验收（实现后，由用户/测试官执行）

1. **静态门禁**：见 §八.1。
2. **归档实跑**（隔离临时项目）：多版本 fixture → `flow archive vX --dry-run`（零写盘）→ `flow archive vX`（成功）→ 断言归档文件内容与 flow.json 零残留；再归档**未全 done 版本** → 拒绝。
3. **常规路径零触碰**：归档后重命名 `.openfeel/flow-archive/` → 消费点清单全员（§三 裁定 P 附注；含 `flow status` / `overview` / `current` / `ops list` / `health` / `log` / `metrics` / `advance` 等）全命令绿；恢复目录名后一致。
4. **跨版本依赖**：归档 vA → `plan stage add` 新阶段 `--deps <vA 中阶段>` → 成功注册并可在 status/overview 正常展示。
5. **存量迁移（本仓）**：备份 → 按 9 版本组归档 → 记录 flow.json 体积前后对比 → 既有命令全绿 → `flow archive list` / `show v1.1.7 --json` 可用。
6. **需求全生命周期**（隔离临时项目）：`req add`（含 `--target-version`）→ `claim` → `link` 两个阶段 → 两阶段依次 done → 需求**自动 done** + 审计；`reset` 其一 → 需求回退 `in_progress`。
7. **认领并发**：两次 `req claim --owner a` / `--owner b`（同需求）→ 第二次 exit 非 0 零写盘；`release` 后可再认领。
8. **向后兼容实跑**：拷贝归档前 flow.json 备份回临时项目（含 `requirements`/`archived_versions` 缺失）→ 全命令零报错。
9. **正交性实跑**：同需求关联一个 full 阶段 + 一个 fast 阶段 → 聚合行为一致（不读模式）。
10. **Agent 实机**（Claude Code + opencode 各一次）：Feel 按新纪律处理「需求接取 → 流转 → 完成」（`req` 命令链）+ 版本收官后提示归档（`flow archive`）；文档/模板措辞与 CLI 输出一致。
11. **默认非回归**：本仓既有命令**不读** `.openfeel/flow-archive/**` 文件内容、**不报错**（除已声明的新增项）；阶段枚举视图随活跃集收缩（文档明示，非回归——见 §三 裁定 P 附注）；`flow.phases` / `advance` 接受集逐字不变。

## 十二、修订记录

| 时间 | 制定人 | 说明 |
|------|--------|------|
| 2026-10-11 | openfeel-planner | 初稿（单主题「需求流转系统」）：5 阶段（78~82）；源码核验 30 项；裁定 A~N。 |
| 2026-10-11 | openfeel-planner | **范围变更修订轮（用户新增主题二「flow.json 归档拆分」）**：v1.2.0 由单主题改**双主题**；阶段扩充为 **8 个（78~85）**——主题二归档 78~80 先行、主题一需求 81~85 顺延；新增裁定 O~W（归档）与执行顺序裁定 S；源码核验表拆为表 A（归档 22 项）+ 表 B（需求 28 项）；版本收口清单与边界、验收、风险、开放问题均双主题化。**只改计划文档，未改源码、未直写 flow.json。** |
| 2026-10-11 | openfeel-planner | **计划审查 REV 修订轮（v1.2.0-stage-78 plan_review 7 条非阻塞 REV 落实）**：REV-78-001 归档消费点清单完整化（裁定 P ⑥ + 『裁定 P 附注』完整枚举；Q/R 引用；§八.4 / §八.14 / §十一.3 / §十一.11 与 roadmap / deps.yaml invariants 口径统一为「不读 `.openfeel/flow-archive/**` 文件内容、不报错」+ 另立「阶段枚举视图随活跃集收缩（文档明示，非回归）」条目）；REV-78-002 log **1313** 条（原 1306 系测试用例数误植）；REV-78-003 体积口径统一改记字节数 **406280 B**（HEAD `84951ce` 实测，复现 `git cat-file -s HEAD:.openfeel/flow.json`；原 396KB 为 KiB 口径、审查所记 402564 实为 UTF-16 字符数）；REV-78-004 新增「跨主题裁定 X：本仓 v1.2.0 八阶段以 full 运行」并修正 Q1 引用（原引「裁定 L」错位）、裁定 M 备注 Q3→Q4；REV-78-005 核验 A13 行号补 `:794`（restore）；REV-78-006 deps.yaml stage-78 `produces_core` 补 `src/core/flow-manager.ts`（仅 `meta.archived_versions` 可选字段声明 + 读侧补齐）；REV-78-007 裁定 H 补零关联空集守卫。**只改计划文档，未改源码、未直写 flow.json、未推进 phase。** |
| 2026-10-12 | openfeel-planner | **stage-79 计划审查 REV 修订轮（REV-79-005 落实）**：`pipeline` 处置 **owner 裁定 = stage-79**（处置须与归档同一事务）——§四 stage-79 行补交付项、stage-80 行移除「`pipeline.current`/`phase` 处置」（仅消费点适配 + 迁移 + 健康检查）、「为何 8 阶段」第 1 条同步（stage-80 侵入面 = deps 校验 / health；stage-79 命令面含 `pipeline` 处置）；裁定 O2 口径同步（补版本存在性门 + 谓词改 `r.blocking !== false && r.status === 'open'`，REV-79-001/002）；`deps.yaml` stage-79/stage-80 notes、`downstream_contracts`（新增 stage-79 导出登记）与 `invariants`（版本存在性门）同步。**只改计划文档，未改源码、未直写 flow.json、未推进 phase。** |
| 2026-10-12 | openfeel-planner | **stage-80 计划审查 REV 修订轮（REV-80-001~008 落实）**：T1 deps 判定收敛为「显式版本前缀才生效、短名恒走已注册原路径」+ 新增 `flow stage set --deps` 第二校验点与 `checkDanglingDeps` 读侧单一口径（REV-80-001/002）；T2 落点定稿 `archive-health.ts`（REV-80-005②）；新增 T7 `config set --sync-stages --stage` 已归档目标降级（REV-80-003 裁定①）并按此修订附注①/② 口径划分 + **新增附注④「枚举收缩不涵盖操作拒绝」** + §八.5 / §八.14 / §四 stage-80 行同步；本计划 A4/A5/P④⑤/R-11/Q3 双口径收敛（REV-79-011/017，本轮落实）；`deps.yaml` stage-80 `produces_core` 补 9 归档文件与新增文件、`downstream_contracts` 登记两 helper、invariants 增「显式命名操作」条（REV-80-004/005）。**只改计划文档，未改源码、未直写 flow.json、未推进 phase。** |
| 2026-10-12 | openfeel-planner | **stage-81 计划审查 REV 修订轮（REV-81-003/005 波及本计划）**：表 B B3 结论「`requirements` 同范式补齐（`??= []`）」更正为「读侧宽容（不 load 补齐，对齐 REV-78-015；`getRequirements` 派生 + `addRequirement` 内 `??= []` 后 push）」；`deps.yaml` `downstream_contracts` 同步——第 5 条签名删 `source?` + 新建即 `status:'draft'`（REV-81-005）、第 6 条「load 补齐为 []」改「读侧宽容」（REV-81-003）。**只改计划文档，未改源码、未直写 flow.json、未推进 phase。** |
| 2026-10-12 | openfeel-planner | **stage-82 计划审查 REV 修订轮（REV-82-003 / 005 波及本计划）**：裁定 M 合法目标枚举**补全**——显式补 `blocked → scheduled` / `blocked → in_progress`（引擎 `ALLOWED_TRANSITIONS @ :143-149` 实有；REV-82-003），并声明命令层零第二份流转表（「列合法目标」经引擎新增导出 `getAllowedNextStatuses` 消费）；`deps.yaml` 同步——stage-82 `produces_core` 补 `test/core/req.test.ts`、stage-82 `notes` 登记引擎小幅补丁与承接表索引（REV-82-004）、i18n 契约条目标注 stage-82 入口基线 829（REV-82-005）。**只改计划文档，未改源码、未直写 flow.json、未推进 phase。** |
| 2026-10-12 | openfeel-planner | **REV-83-009~011 落实（stage-83 计划复审非阻塞 3 条）**：REV-83-009 **用户裁定 = 维持 auto-done 前置集 `{scheduled, in_progress}`**——裁定 H 上推规则与裁定 M 反射句同步为 stage-83 定稿口径（done 判定同源 `allLinkedStagesDone`；`scheduled → in_progress` 由 `req advance` 显式驱动、非 done 推进不触发聚合回写；`advanceStagePhase` 仅 done 分支 / `resetStagePhase` 按聚合视图回退）；REV-83-010/011 波及 `deps.yaml`（「78 阶段」改 8；需求原语契约补 `stageIds` + 零关联 `aggregate = null` + 首参形态方案期定稿）。**只改计划文档，未改源码、未直写 flow.json、未推进 phase。** |
