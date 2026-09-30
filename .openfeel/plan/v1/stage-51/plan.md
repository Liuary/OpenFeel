# v1.1.2-stage-51 — 流水线状态维护与 CLI 可维护性（反馈二）

> **版本**：v1.1.2（**继续，不新建版本**） | **创建日期**：2026-09-30 | **Planner**：独立 openfeel-planner
> **来源**：下游反馈原文 `docs/phase-5/08-openfeel-workflow-feedback.md`（11 条）+ Feel 逐条核实结论
> **定位**：补齐「**纠正/清理**」侧 CLI 能力——孤儿 op 回收、结构字段增删改、阶段注册语义统一、`current.op` 生命周期、`stage set` 幂等与字段扩展、`stage task --add`、op 文件名规范、knowledge 宽容解析与**新增 `openfeel knowledge dedup` 子命令**、日志布局**仅统一未来写入**、git 警告降噪。**核心命题**：创建侧齐备 → 纠正侧补齐，使「禁止手改 flow.json」在故障恢复场景下可解。

---

## 一、背景与动机

反馈一（`06`）解决了「计划 → 流水线」落地的自描述与可纠错（stage-41）；反馈二指出**新一类系统性缺陷**：

> 「OpenFeel CLI 在**创建侧**能力齐备，但在**纠正/清理**侧近乎空白：能创建阶段、创建 op、推进相位，但**不能删除阶段、不能删除 op、不能设置阶段依赖**。一旦多创建了条目（本会话多建 5 个 op），**没有任何 CLI 手段可回收**，只能永久残留或违规手改 `flow.json`——这使硬性纪律「禁止手动编辑 flow.json」在**故障恢复场景下无解**。」

> 本次调用已**完整读取反馈原文**并对关键点抽查复核（见各 N 项「证据」列）；核实结论与 Feel 提供的一致（`N3(b)` 报错回显已修、`N6` config 侧部分已具备、`N9` 澄清点均已按核实口径记录）。

---

## 二、编号化待修清单（N1~N11）

> 证据列已逐条抽查（`文件:行号` 为实测值）；「归属 op」见 §四。

### 批次 H1（高优先）：纠正/清理能力骨架

| 编号 | 标题 | 优先级 | 证据（文件:行号） | 影响面 | 修法 | 归属 op | 验收要点 |
|:--:|------|:--:|------------------|--------|------|:--:|----------|
| **N1** | **孤儿 op 回收与检测** | **高** | `src/core/plan/scheme.ts:177-211`（仅 `createScheme`）；`src/commands/plan.ts:96-132`（仅 create/list）；`flow-manager.ts:2205-2410` `repair()` 无 op↔opsDir 对账；`flow health` `flow-manager.ts:2685-2752` 只查 `current` 指向的 op | op 数虚高、幽灵条目被调度、审计链污染；**故障恢复无合法手段** | ① 新增 `openfeel plan scheme remove <stage> <opId>`（校验：模板文件不存在 / 无 checkpoint 进展 / 非 done，默认拒绝并给 `--force`；删 `stages[].ops` 键 + appendLog）；② `flow repair` 增「ops 键 ↔ opsDir 文件」对账（**默认只报告**，`--prune-orphans` 显式清理，见 §五 A2）；③ `flow health` 增**孤儿 op** warn | op-001 | `plan scheme remove` 成功删键并留日志；孤儿 op 时 `flow repair --dry-run` 列出、`--prune-orphans` 清理、`flow health` warn 可见；有 checkpoint 的 op 默认拒删 |
| **N2** | **结构字段 CLI（deps / reviews）** | **高** | deps 仅创建时 `commands/plan.ts:27`（`--deps`）；reviews 仅 `flow.ts:738-834`（add/resolve）与 `view.ts:15-91`（list/add/accept）——**无 update/delete**；ops 无增删改 | 修错就得手改 flow.json（违反纪律） | ① `openfeel flow stage set <id> --deps <ids...>`（复用 `normalizeStageId` + 存在性/悬空校验，对齐 stage-41 的 `plan stage add --deps` 校验）；② `flow review update <id> [--priority/--title/--blocking]`、`flow review remove <id>`（`view` 侧同步能力或标注归属） | op-002 | `flow stage set --deps` 写入并校验悬空（悬空 exit 1）；`review update/remove` 生效并留日志；`view add` 与 `flow review add` 语义边界文档化 |
| **N3** | **`scheme create` 注册语义统一** | **高** | `src/core/plan/scheme.ts:107-132`（阶段缺失**隐式注册**，phase=`plan_pending`）+ `:185-188`（仅 `mkdirSync(opsDir)`，**不建 overview/status**）；`N3(b)` 报错回显**已修复**（`commands/flow.ts:566-576` 已输出真实 phase + 合法目标） | 「半注册」阶段：`plan/..` 缺 overview/status，`advance` 报错误导 | **裁定 ②（见 §五 A1）**：隐式注册时**补建 overview/status 骨架**（复用 `core/plan/stage.ts` 的骨架生成）；并在 `scheme create` 于阶段缺失时输出明确提示「已按注册语义补齐阶段骨架」；`N3(b)` 已修，不重复 | op-003 | 先在空项目执行 `plan scheme create` → 阶段被注册**且** `overview.md`/`status.md` 存在（骨架内容合规）；提示文案含补齐说明 |

### 批次 H2（中优先）：状态维护可用性

| 编号 | 标题 | 优先级 | 证据（文件:行号） | 影响面 | 修法 | 归属 op | 验收要点 |
|:--:|------|:--:|------------------|--------|------|:--:|----------|
| **N4** | **`flow attempt` 同步 `current.op`** | 中 | `src/commands/flow.ts:675-702` + `flow-manager.ts:1791-1859` `recordAttempt`：只改 `op.state/attempts`，**不碰 `pipeline.current`** | 每阶段执行方需写「current.op 滞后」偏差说明；跨会话恢复误判进度 | pass 后重扫该 stage 首个 `pending`/`executing` op 写回 `current.op`；或 `flow current --set <opId>`。**必须与 stage-50 的 T1 合并设计为同一 `current.op` 生命周期**（见 §三 协同约束） | op-004 | 连续 `flow attempt` 后 `flow current` 的 `current.op` 与之同步；与 T1 修复后无二次悬空 |
| **N5** | **`stage set` 幂等化 + 按需备份** | 中 | `src/commands/stage.ts:343-344`（**无条件** `backupStatus`）；`setStatusField` `:205-229` 以「内容是否变化」判定字段缺失（`:222-224`），同值 → 误报错（文案 `i18n-data/zh-CN.ts:356`） | 幂等脚本失败；`.bak` 累积 | 区分「字段缺失」与「值未变」：同值 → **no-op 成功 + 提示**；备份移到**确认将变更之后** | op-005 | 同值 `stage set` exit 0 + no-op 提示 + **不生成 `.bak`**；字段确实缺失时仍报错 |
| **N6** | **`stage task --add` / `plan stage add --tasks`** | 中 | `src/commands/stage.ts:356-399`（无 `--add`）；`cmd plan/stage.ts:83-85` 模板「当前任务」为 `> 待补充`（无任务行）→ `stage task <id> 1 --done` 报「未找到任务 1」 | 批量勾选全部失败，只能手改 status.md（违反纪律） | ① `stage task <id> --add "描述"` 追加任务行；② `plan stage add <name> --tasks "t1" "t2"` 初始化；解析保持 `- [ ] 任务N：...` 范式 | op-005 | `--add` 后任务行存在且编号连续；`stage task <id> N --done` 可勾选；`plan stage add --tasks` 生成的 status.md 含任务行 |
| **N7** | **`stage set` 字段扩展** | 中/低 | `src/commands/stage.ts:327-354`（仅 `--status`）；`setStatusField` 可复用 | 阶段级「执行模式/自动推进/责任 Agent」无 CLI | 增 `--exec-mode <manual\|auto>` / `--auto-advance <enabled\|disabled>` / `--review-agent <agent>`（复用 `setStatusField` + **字段白名单校验**，见 §五 A4） | op-005 | 三选项分别写入 status.md 对应字段并校验合法值；非法值 exit 1 |
| **N8** | **op 文件名固定 `op-NNN.md`** | 中/低 | `scheme.ts:191-196`（`safeTitle` 仅替换空白）；标题含 `/` → `fs/sequence.ts:98` `openSync(path,'wx')` 抛 ENOENT（**创建直接失败**）；本仓 ops 实为手工 `op-NNN.md` | 路径不一致、归档/审查引用断链；含 `/` 直接失败 | 文件名改为 `${opIdOf(seq)}.md`（**标题写入内容**，模板已含 `# {opId}：{title}`）；读取端 `extractTitle`（`scheme.ts:71-75`）**兼容回退**（旧 `op-NNN_title.md` 仍可读）；给出**迁移说明**（历史文件不回改） | op-006 | 标题含 `/`/空格/中文均可创建成功；新文件为 `op-NNN.md`；旧命名文件仍可被 `list`/`get` 读取 |
| **N9** | **knowledge index 宽容解析 + 暴露 `openfeel knowledge dedup`（A6 用户裁定）** | 低/中 | `knowledge list` **不读 index**（读分类文件 `workspace/knowledge.ts:158-179`）；报错源为 `knowledge index`（`:215-236`，严格段头 `## 分类概览`/`## 最近更新`，`:291-311`）与 `add`（硬编码 `\|------\|------\|------\|`，`:142-149`）；`utils/kb-dedup.ts` **全仓零 import**（仅模板文本提及） | 下游无该文件 → **必然降级**；自定义 index 格式不兼容；去重能力对下游不可用 | ① 放宽段头/表头匹配（容忍变体与列数差异）；② `addKnowledgeEntry` 不再硬编码 3 列分隔行；③ **A6 裁定：把 `utils/kb-dedup.ts` 能力暴露为 `openfeel knowledge dedup` 子命令并随包分发**（见 §五 A6-已裁定） | op-007 | 自定义段头/列数的 index.md 可被 `knowledge index` 解析；`add` 对非 3 列 index 不报错；**`openfeel knowledge dedup` 可运行**（输出相似条目建议，只读不改盘）；下游安装后可真正使用（模板引用同步更新） |

### 批次 H3（低优先）：布局与噪声

| 编号 | 标题 | 优先级 | 证据（文件:行号） | 影响面 | 修法 | 归属 op | 验收要点 |
|:--:|------|:--:|------------------|--------|------|:--:|----------|
| **N10** | **公共日志布局统一（仅未来写入 · A7 用户裁定）** | 低 | 代码只写嵌套（`public-logger.ts:164-181`）；本仓实测同日并存 `log/2026/08/07` 与 `log/2026-08-07`；`migrate` 不含日志布局 | 索引各自维护、检索割裂 | 以嵌套 `log/{yyyy}/{MM}/{dd}/` 为**唯一约定**并统一**未来写入路径**（`public-logger.ts` + `init` 固定布局）；**不新增历史迁移命令**（A7 裁定）；要求 `log/index.md` 与 `day_index.md` **同时反映两套布局的共存现状**（文档/索引层说明，不改历史目录） | op-008 | 新建日志一律落 `log/{yyyy}/{MM}/{dd}/`（实测新写入路径）；**无** migrate 日志迁移步骤；`log/index.md`/`day_index.md` 含「历史扁平目录与嵌套目录共存」说明且两边条目均可检索到 |
| **N11** | **git 脏区警告降噪** | 低 | `src/commands/flow.ts:647-662`（无条件打印）；`advance` 选项 `:495-501` 无 `--quiet` | 每次 `advance` 都打印，正常中间态也被警告 | `advance` 增 `--quiet`；**默认仅在 `--to done` 时提示**；或按「是否存在未提交的**源码**变更」过滤（见 §五 A8） | op-008 | 默认 `advance`（非 done）无警告；`--to done` 或在 `--quiet` 未指定且存在源码变更时提示；`--quiet` 完全静默 |

---

## 三、与 stage-50 的边界与协同约束

| 项 | 归属 | 说明 |
|----|------|------|
| `config set` 白名单扩展（反馈 #6 的 config 侧） | **stage-50**（T36 + 待裁定 R3） | 本阶段**不改 config 命令**；仅做 `stage set` 侧字段扩展（N7） |
| `utils/kb-dedup.ts` 的 `basePath` 参数化 | **stage-50 T8 为本项基础（协同，见下）** | **A6 裁定：暴露为 CLI 子命令（不删除）** → **T8 不再作废，反而成为 N9 的基础**。**约束**：T8（加 `basePath` + 最小测试）先行落地或被 N9 一并实现；N9 的 `openfeel knowledge dedup` 子命令**必须复用 T8 的 `basePath` 参数化**（子命令以 `--project <path>`/`process.cwd()` 传入 basePath），**不得另写路径解析** |
| `flow repair` / `flow health` 增强 | **本阶段**（N1） | stage-50 未涉及 repair/health 的孤儿对账 |
| `commands/flow.ts` git 警告（反馈 #8 类） | **本阶段**（N11） | stage-50 未列该条 |

### **T8 ↔ N9 协同设计约束（强制，A6 裁定后修订）**

- **T8**（stage-50 批次 C）：`utils/kb-dedup.ts:34` 模块加载时固化 `KB_BASE_DIR` → **加 `basePath` 可选参数**（默认保留现行为）+ 补最小测试。
- **N9**（本阶段，A6 用户裁定）：把 kb-dedup 能力**暴露为 `openfeel knowledge dedup` 子命令并随包分发**。
- **协同**：① **T8 是本项基础**（不再作废）——子命令**复用 T8 的 `basePath` 参数化**，路径来源由命令层注入（`--project <path>`，默认 `process.cwd()`），`kb-dedup.ts` 内部仍保留「无参数时用 cwd」的兼容行为；② 若 stage-50 先落地 T8 → 本阶段直接复用；若本阶段先落地 → **N9 一并实现 `basePath` 参数化**，并在 stage-50 T8 条目登记「已由 stage-51 提供，改为仅补测试」；③ 两侧**禁止各自实现路径解析**。
- **验收联动**：`openfeel knowledge dedup` 在指定 `--project` 时读取该项目的 `.openfeel/kb`；T8 的单测覆盖 `basePath` 显式传入与缺省两条路径。

### **T1 ↔ N4 协同设计约束（强制）**

- **T1**（stage-50 批次 A）：推进时 `pipeline.current.op` 保留上一阶段 op → **悬空**（`flow-manager.ts:1099-1106`）。
- **N4**（本阶段）：`flow attempt` 期间 `current.op` **从不推进**（`recordAttempt` 不碰 current）。
- 二者是**同一生命周期**的两个缺口 → **必须共用单一 owner**：
  - 抽出 `FlowManager.syncCurrentOp(stageName)`（扫描该 stage 首个 `pending`/`executing` op，写回 `current`；无则 `op=''`）。
  - `advanceStagePhase`（T1）与 `recordAttempt`（N4）**均调用该函数**，禁止各自实现。
  - **执行顺序约束**：若 stage-50 先落地 T1 → 本阶段 N4 复用其函数；若 N4 先落地 → 本阶段实现该函数并在计划中回填「T1 改调用点」。**任一侧先实施时，必须在另一侧计划/REV 中登记「已由对方提供/需改用」**，避免双实现。
- **验收联动**：`flow attempt` → `flow current` 同步；随后 `advance` → 无悬空残留（两修复叠加后行为一致）。

---

## 四、op 级任务清单

| op | 批次 | 主题（N 项） | 具体改动点（文件:行号） | 验收要点 |
|:--:|:--:|------|------------------------|----------|
| op-001 | H1 | 孤儿 op 回收与检测（N1） | NEW `commands/plan.ts` scheme remove 子命令（`plan.ts:96-132` 附近）；`core/plan/scheme.ts` 新增 `removeScheme(projectPath, stage, opId, {force})`（校验模板文件/checkpoint/done）；`flow-manager.ts:2205-2410` `repair()` 增 op↔opsDir 对账（默认报告 + `--prune-orphans`）；`:2685-2752` `healthCheck` 增孤儿 warn；`commands/flow.ts` repair 选项；i18n 键 | 见 §二 N1 |
| op-002 | H1 | 结构字段 CLI（N2） | `commands/flow.ts` 新增 `flow stage set <id> --deps <ids...>`（复用 `commands/flow.ts:376-381` 的 `validateStageId`/`normalizeStageId` + 悬空校验，对齐 `commands/plan.ts:37-44`）；`flow review update/remove`（`flow.ts:738-834` 附近）；`commands/view.ts:15-91` 同步或标注；`flow-manager.ts` 增 `setStageDeps`/`updateReview`/`removeReview` + appendLog；i18n 键 | 见 §二 N2 |
| op-003 | H1 | `scheme create` 注册语义统一（N3） | `core/plan/scheme.ts:107-132`：隐式注册分支增「补建 overview/status 骨架」（复用 `core/plan/stage.ts` 生成逻辑，抽公共函数）；`scheme.ts` 于阶段缺失/补齐时输出提示；i18n 键 | 见 §二 N3 |
| op-004 | H2 | `current.op` 生命周期（N4，协同 T1） | `flow-manager.ts` 新增 `syncCurrentOp(stageName)`（抽自 `:1099-1106` 逻辑，`op` 无则置 `''`）；`recordAttempt`（`:1791-1859`）pass 后调用；`advanceStagePhase`（`:1099-1106`）改调用同一函数；`commands/flow.ts:675-702` attempt 输出可选提示 | 见 §二 N4 + §三 协同 |
| op-005 | H2 | `stage set` 幂等+字段扩展 / `stage task --add`（N5/N6/N7） | `commands/stage.ts:205-229` `setStatusField` 返回三态（`updated`/`unchanged`/`not-found`）；`:343-354` 备份移到确认变更后 + 同值 no-op 成功；`:327-354` 增 `--exec-mode/--auto-advance/--review-agent`（字段白名单）；`:356-399` 增 `--add "描述"`；`core/plan/stage.ts:83-85` + `plan.ts` 增 `--tasks`；i18n 键（含 `zh-CN.ts:356` 文案修正） | 见 §二 N5/N6/N7 |
| op-006 | H2 | op 文件名固定 `op-NNN.md`（N8） | `core/plan/scheme.ts:191-196`：`candidate` 改 `${opIdOf(seq)}.md`（去掉 `_${safeTitle}`）；`:71-75` `extractTitle` 兼容回退（新命名取内容首行标题）；`listSchemes`/`getScheme`（`:223-311`）适配；manual/kb 迁移说明 | 见 §二 N8 |
| op-007 | H3 | knowledge 宽容解析 + **新增 `openfeel knowledge dedup` 子命令**（N9 · **A6 用户裁定**） | ① `core/workspace/knowledge.ts:215-236/:291-311`（放宽段头/表头匹配、容忍列数）；`:142-149`（去硬编码 3 列分隔行，按实际列数生成）；② **新增子命令**：`src/commands/knowledge.ts`（现有 `registerKnowledgeCommand`）注册 `dedup` 子命令 → 调 `src/utils/kb-dedup.ts` 的 `findSimilarEntries`（**复用 T8 的 `basePath` 参数化**，选项 `--project <path>` 默认 `process.cwd()`、`--threshold <n>` 可选、输出为**只读建议**，不自动改写 kb）；③ i18n 双语 help（`help.knowledge.dedup*`）+ 输出文案；④ 文档：`.openfeel/manual/cli/commands.md`（或 `manual/cli/` 新节）+ kb（若有引用）；⑤ **模板引用同步**：`templates-data/opencode/agents/{zh-CN,en}/openfeel-archiver.md` 与相关 skill 中「`kb-dedup.ts` 不存在 → 降级手工去重」改为「用 `openfeel knowledge dedup` 做去重建议」；⑥ 若涉模板/生成段改动 → `npm run build` | 见 §二 N9；`openfeel knowledge dedup --help` 可用；`--project` 指向隔离项目时读该项目 kb；输出为建议（不改盘）；`rg -c "kb-dedup 不存在\|降级手工去重"` 在模板中清零 |
| op-008 | H3 | 日志写入路径统一（**仅未来**）+ git 警告降噪（N10/N11 · **A7 用户裁定**） | ① `core/public-logger.ts:164-181`：确认/统一为嵌套 `log/{yyyy}/{MM}/{dd}/`（**仅未来写入**）；`core/init.ts` 固定布局；② **索引共存说明（不迁移历史）**：`log/index.md` 与 `day_index.md` 的生成/说明需**同时反映扁平 `log/{yyyy-MM-dd}/` 与嵌套 `log/{yyyy}/{MM}/{dd}/` 两套布局共存现状**（文档层说明 + 索引可检索两边）；**不新增 migrate 日志迁移步骤**；③ `commands/flow.ts:647-662`（默认仅 `--to done` 提示 + 增 `--quiet`；`:495-501` 加选项）；④ i18n 键 | 见 §二 N10/N11；新建日志落嵌套路径；`git status` 无 migrate 改动；`log/index.md`/`day_index.md` 含共存说明；`advance` 默认非 done 无警告、`--quiet` 静默 |
| op-009 | — | 全量回归与门禁 | `npm run build && npm test`；`lint i18n`（533 键）；`lint kb`（0 过期）；环境隔离核验（hash+mtime 双快照零 diff） | 四门禁全绿 + 环境零污染 |

**op 数 = 9。**

---

## 五、裁定表与待裁定项

| 裁定 | 条目 | 说明 |
|------|------|------|
| **本阶段修（11 条）** | N1~N11 | 全部纳入；N4 须与 stage-50 T1 协同（§三）；N9 须与 stage-50 T8 协同（§三） |
| **不纳入本阶段（1 项）** | 反馈 #6 的 `config set` 白名单扩展 | 归 **stage-50 T36 + R3**（避免重复修） |
| **已闭环（不重复）** | 反馈 #3(b) `advance` 报错回显 | 实测 `commands/flow.ts:566-576` 已输出真实 phase + 合法目标 |
| **澄清（非缺陷）** | 反馈 #9 的 `knowledge list` | `list` 本就不读 index（读分类文件），无需「解析自定义 index」；真正需要宽容化的是 `index`/`add` |

### 裁定项（**用户已裁定 2026-09-30**，不可推翻）

| # | 条目 | 用户裁定 | 兼容性影响 / 说明 |
|:--:|------|----------|-------------------|
| **A1** | N3 `scheme create` 隐式注册 | **采纳方案②：隐式注册时补齐 `overview.md`/`status.md` 骨架** | **零破坏**（现有调用不变，仅多产两个骨架文件）；消除「半注册」 |
| **A2** | N1 孤儿 op 回收 | **默认只报告 + `--prune-orphans` 显式清理**（与建议一致）；`flow health` 增孤儿检测（warn） | 非破坏：默认不删任何条目；清理须显式开关 |
| **A3** | N5 `stage set` 同值 | **采纳：同值 → no-op 成功 + 提示**；`.bak` 仅在确认变更后生成 | 行为变更（由报错→成功）；符合幂等诉求 |
| **A4** | N7 `stage set` 字段白名单 | **采纳**：白名单 = `状态`/`执行模式`/`自动推进`/`当前责任 Agent`/`上一责任 Agent` | 新增 CLI 面（非破坏） |
| **A5** | N8 op 文件名 | **改命名为 `op-NNN.md` + 不做迁移命令**（与建议一致）：新建固定 `op-NNN.md`（标题写入内容）；**历史文件名保持原样**；读取端 `extractTitle` 兼容回退 | 破坏性面：既有 `op-NNN_title.md` 引用失效 → 由**读取端兼容回退** + manual/kb 记录缓解；**不提供迁移命令** |
| **A6** | N9 `kb-dedup` 去留 | **暴露为 CLI 子命令**（**与 Planner 建议「删除」相反**）：把 `src/utils/kb-dedup.ts` 能力暴露为 **`openfeel knowledge dedup`** 并**随包分发**，使下游真正可用 | **新增公开命令面**（向后兼容，无破坏）；须同步：命令注册 / i18n 双语 help / `manual/` 文档 / **模板引用更新**（`openfeel-archiver.md` 与相关 skill 的「kb-dedup 不存在 → 降级手工去重」→「用 `openfeel knowledge dedup`」）；**与 stage-50 T8 协同：T8 不再作废，成为本项基础（§三）** |
| **A7** | N10 日志布局 | **仅统一未来写入**（**与 Planner 建议「纳入 migrate 迁移」相反**）：以嵌套 `log/{yyyy}/{MM}/{dd}/` 为唯一约定并统一**未来**写入；**不新增历史迁移命令**；历史扁平目录保持原状，**索引能同时反映两套布局**（`log/index.md`/`day_index` 说明共存现状） | 非破坏：不改动任何历史目录；代价 = 历史与新增布局长期共存（由索引层兜住可检索性） |
| **A8** | N11 git 警告 | **采纳**：`advance` 默认仅在 `--to done` 提示 + 新增 `--quiet` | 行为变更（默认降噪）；不做「源码变更」路径过滤 |

---

## 六、前置依赖与上下游衔接

- **hard 依赖 `v1.1.2-stage-50`**（当前状态 `planned`，未开始）：① `commands/flow.ts`、`flow-manager.ts`、`core/plan/scheme.ts` 均为 stage-50 热区（T1/T2/T3/T19/T37 等），必须串行在其后，避免同文件冲突；② N4 与 T1 共用 `current.op` 生命周期（§三）；③ **N9 以 T8 的 `basePath` 参数化为基础**（§三 T8↔N9 协同，A6 裁定后 T8 不再作废）。
- **soft 依赖 stage-41**（`plan scheme create`/`flow stage remove`/`plan stage add --deps` 为本阶段扩展的基线能力）。
- **下游**：无固定后继（v1.1.2 收尾）。
- **顺序**：`… → 49 → 50 → 51`。

---

## 七、影响文件清单

| op | 新增 | 修改（预估） |
|:--:|------|--------------|
| op-001 | — | `src/commands/plan.ts`、`src/core/plan/scheme.ts`、`src/core/flow-manager.ts`、`src/commands/flow.ts`、`src/core/i18n-data/{zh-CN,en}.ts` |
| op-002 | — | `src/commands/flow.ts`、`src/commands/view.ts`、`src/core/flow-manager.ts`、`src/core/i18n-data/{zh-CN,en}.ts` |
| op-003 | — | `src/core/plan/scheme.ts`、`src/core/plan/stage.ts`（抽骨架公共函数）、`src/core/i18n-data/{zh-CN,en}.ts` |
| op-004 | — | `src/core/flow-manager.ts`、`src/commands/flow.ts` |
| op-005 | — | `src/commands/stage.ts`、`src/core/plan/stage.ts`、`src/commands/plan.ts`、`src/core/i18n-data/{zh-CN,en}.ts` |
| op-006 | — | `src/core/plan/scheme.ts`、`.openfeel/manual/cli/commands.md`（迁移说明）、`.openfeel/kb/patterns.md`（命名约定注记） |
| op-007 | — | `src/core/workspace/knowledge.ts`、**`src/commands/knowledge.ts`（新增 `dedup` 子命令）**、`src/utils/kb-dedup.ts`（`basePath` 参数化，复用/承接 T8）、`src/core/i18n-data/{zh-CN,en}.ts`、`.openfeel/manual/cli/commands.md`、**`src/core/templates-data/opencode/agents/{zh-CN,en}/openfeel-archiver.md`**（模板引用更新）、`src/core/template-loader.ts`（生成段，build）、`.opencode/agents/*`（自举，build） |
| op-008 | — | `src/core/public-logger.ts`、`src/core/init.ts`、`src/commands/flow.ts`、`src/core/i18n-data/{zh-CN,en}.ts`；`log/index.md`/`day_index.md`（共存说明；由归档官/命令层维护） |
| op-009 | — | 测试文件（新增/调整） |

> 合计约 **22~27 个文件**（**无删除**：`src/utils/kb-dedup.ts` 保留并增强；新增子命令 1 个）；净增/改 **900~1300 行**（含 4~5 个新命令/子命令与 i18n 键）。

---

## 八、完成标准

1. N1~N11 全部处置：10 条按「建议」实施、A2/A5/A6/A7 按用户裁定实施；反馈 #6 的 config 侧与 #3(b) 不重复处理（显式记录）。
2. **门禁全绿**：`npm run build && npm test`（基线 **41 文件 / 716 用例**，本阶段新增后 ≥ 该数）；`node bin/openfeel.js lint i18n`（**533 键**）；`node bin/openfeel.js lint kb`（**0 过期**）。
3. **测试隔离硬要求**：`vi.mock('node:os')` / 临时 HOME；实测不触碰真实 `~/.openfeel/`、`~/.config/opencode/`、`~/.config/openfeel/` 与仓库 `.openfeel/config.yaml`；op-009 以 hash+mtime 双快照核验零 diff。
4. **`current.op` 单一 owner**：`syncCurrentOp` 被 `advanceStagePhase` 与 `recordAttempt` 共用（§三 约束已落地，无双实现）。
5. 行为变更项（A3/A5/A6/A7/A8）在 `CHANGELOG.md` 与 manual 同步说明；**历史数据不迁移**（A5 op 文件名保持原样 + 读取端兼容；A7 日志历史扁平目录保持原状 + 索引共存说明）；**A6 新增公开子命令**须在 CHANGELOG `Added` 记录。
6. `templates/BUG-003` 类口径不变；op-007 涉模板改动须 `npm run build` 且幂等（`openfeel-archiver.md` 两语言模板 + 生成段 + 自举）。
7. **A6 交付物**：`openfeel knowledge dedup` 可用（只读建议）、i18n 双语 help、manual 文档、模板引用更新（`kb-dedup 不存在 → 降级手工去重` 表述清零）。
8. **A7 交付物**：新建日志一律落 `log/{yyyy}/{MM}/{dd}/`；**无** migrate 日志迁移步骤；`log/index.md`/`day_index.md` 含共存说明且两边条目可检索。

---

## 九、测试策略

| 验证点 | op | 方式 |
|--------|:--:|------|
| 孤儿 op 回收 | 001 | 构造「ops 键存在但 opsDir 无文件」→ `flow repair --dry-run` 列出；`--prune-orphans` 清理；`plan scheme remove` 成功删键 + 日志；有 checkpoint 的 op 拒删 |
| deps CLI + 悬空校验 | 002 | `flow stage set <id> --deps <不存在的>` → exit 1；合法 → 写入且 overview/flow.json 一致 |
| review update/remove | 002 | 改 priority/title/blocking 生效；remove 后 `flow status` 不再计入 open |
| `scheme create` 注册语义 | 003 | 空项目 `plan scheme create` → 阶段注册 + `overview.md`/`status.md` 存在且骨架合规 |
| `current.op` 生命周期 | 004 | 连续 `attempt` → `current.op` 同步；随后 `advance` 无悬空（与 T1 叠加） |
| `stage set` 幂等 | 005 | 同值 → exit 0 + no-op + 无 `.bak`；变更 → 写盘 + `.bak`；字段缺失 → exit 1 |
| `stage set` 字段/`task --add` | 005 | `--exec-mode/--auto-advance/--review-agent` 写入并校验非法值；`--add` 后任务编号连续且可勾选；`plan stage add --tasks` 初始化 |
| op 文件名 | 006 | 标题含 `/`、空格、中文 → 创建成功且文件为 `op-NNN.md`；旧 `op-NNN_x.md` 仍可 list/get |
| knowledge 宽容解析 | 007 | 自定义段头/列数的 index.md → `knowledge index` 可解析；`add` 不因列数报错 |
| `openfeel knowledge dedup` 子命令（A6） | 007 | `openfeel knowledge dedup --help` 可用（i18n 双语）；`--project <隔离项目>` 时读取该项目 `.openfeel/kb` 输出**相似条目建议**（**不改盘**）；模板中「kb-dedup 不存在/降级手工去重」表述清零；`build` 幂等 |
| 日志写入路径（A7） | 008 | 新建日志落 `log/{yyyy}/{MM}/{dd}/`（实测新文件路径）；**`migrate` 无日志迁移步骤**（`git status`/`--dry-run` 输出无相关项）；`log/index.md`/`day_index.md` 含两套布局共存说明 |
| git 警告降噪 | 008 | 默认非 done → 无警告；`--to done` → 提示；`--quiet` → 静默 |
| 全量回归 + 隔离 | 009 | 四门禁 + 环境双快照零 diff |

---

## 十、风险与注意事项

| # | 风险 | 缓解 |
|---|------|------|
| R-1 | **热区冲突**：`flow-manager.ts`/`commands/flow.ts`/`plan/scheme.ts` 同时是 stage-50 改动区 | **hard 串行**（stage-50 先完成）；本阶段内部尽量单执行流 |
| R-2 | **`current.op` 双实现**（T1 与 N4 各改一处） | §三 强制「单一 owner `syncCurrentOp`」；任一侧先落地须在另一侧登记 |
| R-3 | 自动清理孤儿 op 误删（A2） | 默认**只报告**；清理需 `--prune-orphans` 显式；`plan scheme remove` 校验 checkpoint/done |
| R-4 | op 文件名变更破坏既有引用（A5） | 读取端**兼容回退**；历史不回改；manual/kb 记录；**不做迁移命令**（用户已裁定） |
| R-5 | 暴露 `kb-dedup` 为子命令时的模板/自举一致性（A6） | 同步 `openfeel-archiver.md`（zh/en）模板引用并 `npm run build`；build 一致性断言兜底；子命令为**只读建议**，不自动改写 kb（避免误删） |
| R-6 | 日志两套布局长期共存导致索引割裂（A7） | 不迁移历史（用户裁定）；以 `log/index.md`/`day_index.md` 的**共存说明 + 双边可检索**兜底；新写入统一嵌套 |
| R-7 | 测试隔离缺口（历史事故） | 全部新增测试 `vi.mock('node:os')`/临时 HOME；op-009 双快照核验 |
| R-8 | i18n 键新增不对称（含 `knowledge.dedup` 双语 help） | 同批补 `zh-CN.ts`/`en.ts`；`lint i18n` 门禁 |
| R-9 | 范围过大（11 项 + 9 op）导致质量下降 | 若审查/用户认为过大，**可将 H3（N9/N10/N11）拆为 stage-52**（见 §十一 可选拆分） |
| R-10 | `knowledge dedup` 的相似度阈值导致建议噪声/漏检 | 阈值可配置（`--threshold`）；输出为建议不阻断；manual 说明定位（辅助去重，非强制） |

---

## 十一、op 顺序与（可选）拆阶段建议

```
【主串行链（共享 flow-manager.ts / commands/flow.ts / plan/scheme.ts）】
  op-001（N1 孤儿 op）→ op-002（N2 结构字段）→ op-003（N3 注册语义）
    → op-004（N4 current.op）→ op-006（N8 文件名）→ op-008（N10/N11 布局与降噪）

【并行（与主链文件不交叠）】
  op-005（N5/N6/N7，`commands/stage.ts` + `core/plan/stage.ts`）
  op-007（N9，`commands/knowledge.ts` + `core/workspace/knowledge.ts` + `utils/kb-dedup.ts` + 模板）

【收尾】
  op-009（全量回归 + 门禁）
```

**建议顺序**：`op-001 → op-002 → op-003 → op-004 → op-006 → op-008` ∥ `op-005` ∥ `op-007` → **op-009**。

- op-005 与 op-007 的文件（`commands/stage.ts`、`core/plan/stage.ts`、`commands/knowledge.ts`、`core/workspace/knowledge.ts`、`src/utils/kb-dedup.ts`）与主链**无交叠**，可并行。
- **op-007 与 stage-50 T8 的协同**：T8 的 `basePath` 参数化是本项基础（§三）；两侧禁各自实现路径解析。
- op-004 必须先于/协同 stage-50 T1（§三）。
- op-009 最后。

### 是否拆为 stage-51 + stage-52（Planner 结论）

**结论：建议不拆，保持单 stage-51（9 op）**。理由：① 11 项中 high 仅 3 项，其余为中/低；② 多数为命令层增量与新命令，单点改动 1~30 行；③ 与 stage-50 的协同（T1↔N4、T8↔N9）在同一阶段内更易保证一致性，拆开反而增加跨阶段约束成本。

**可选拆分点（若审查/用户认为过大）**：将 **H3 批次（N9/N10/N11）拆为 stage-52**——理由：N9 含**新增公开子命令**、N10 涉及**布局约定与索引共存**（原「历史迁移」已按 A7 裁定取消），风险与 topic 均独立于 H1/H2 的「命令层补齐」，且不阻塞 H1/H2 的价值交付。

---

## 十二、修订记录

| 时间 | 修订人 | 依据 | 修订内容 |
|------|--------|------|----------|
| 2026-09-30 | openfeel-planner | 用户需求「v1.1.2-stage-51（反馈二：流水线状态维护与 CLI 可维护性）」 | 新建本阶段：完整读取 `docs/phase-5/08-*.md` 并抽查核实，N1~N11 编号化（3 批次 H1~H3）；op-001~op-009；裁定表（10 修 / 1 不纳入 / 1 已闭环 / 1 澄清）与待裁定 A1~A8；**T1↔N4 协同约束**与 **T8↔N9 协同**；拆阶段建议（不建议拆，给出可选拆分点） |
| 2026-09-30 | openfeel-planner | **用户对 A1~A8 的裁定**（不可推翻） | **A2/A5 与建议一致**（孤儿 op 默认只报告 + `--prune-orphans`；op 文件名改 `op-NNN.md` 且**不做迁移命令**）。**A6 与建议相反** → §二 N9、§三、§四 op-007、§五、§七、§八、§九、§十 全部改为「**暴露 `openfeel knowledge dedup` 子命令并随包分发**」+ 模板引用同步（`openfeel-archiver.md` 等），并**重写 T8↔N9 协同为「T8 为本项基础，不再作废」**。**A7 与建议相反** → §二 N10、§四 op-008、§五、§七、§八、§九、§十 改为「**仅统一未来写入 + 不新增历史迁移命令 + 索引共存说明**」，并**从 op-008 删除 migrate 迁移内容**。A1/A3/A4/A8 按建议执行。裁定表由「待裁定」改为「**用户已裁定 2026-09-30**」 |
