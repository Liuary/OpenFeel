# v1.2.1-stage-90 计划 — 三模式架构（规划 / 快速 / 通用）（主题五）

- **阶段**：`v1.2.1-stage-90`（七主题之五 · 三模式架构）
- **依赖**：**hard: `v1.2.1-stage-89`**（大计划 §四 依赖图 + `deps.yaml`）。实质 = **顺序 + 语义前置**（设计 §9 S5 依赖 S4）——89 已把「需求 = 排期调度层」与「通用工作者（执行者 / 探索者）」落为实体（含 agent 9→10 全枚举收口）；本阶段让**模式成为需求级属性**（需求携带 `workflow_mode`，经**单点解析**作用于其关联阶段），并把 v1.2.0「需求与模式正交」旧断言**显式 supersede**。**功能面无代码级依赖**（89 产物集中于 templates-data / agent 面）：其前置意义 = **语义冻结**（需求层可选字段「仅溯源不聚合」范式已定稿 → 本阶段 `workflow_mode` 同范式落地）。
- **优先级**：P0 ｜ **制定人**：openfeel-planner ｜ **制定时间**：2026-10-15 ｜ **修订轮**：修订 1（计划审查退回处置：REV-90-001 阻塞 + REV-90-002~005 非阻塞，逐条见 §九）
- **基线**：**HEAD `9a0c6be`**（stage-89 归档提交「chore: 阶段归档 v1.2.1-stage-89」；功能收口 `f33e6b1`）。全表实测；文中行号 / 键值均以该基线为准。
- **上游基线（stage-89 归档登记值）**：测试 **71 文件 / 1629 用例** 0 skipped / 0 failed；`npx tsc --noEmit` = 0；`openfeel lint i18n` = **931**；`lint kb` = 0（572 引用）；`npm run build` ×2 幂等（双生成物 sha256 稳定）；`--version` = **1.2.0**（本阶段不改，归 stage-93）；flow.json `revision 1123` / `archived_versions: 9` / `requirements: 0` / `reviews: 0`；v1.2.1-stage-86~89 `done`、90~94 `plan_pending`（`v1.2.1-stage-94` 亦已登记，但**不在大计划八阶段表内**——本阶段不涉及）；本仓 `.openfeel/config.yaml defaults.workflow_mode: full`（裁定 B：八阶段全 full）。
- **定位**：把设计 §7「三模式架构」从表格落为**代码事实**——① **值域 3 值**（`full / fast / general`，保留既有字面量**零回归**）；② **需求级模式属性**（`RequirementData.workflow_mode?` 可选 + 解析链 `status.md 显式 > 需求级 > config.yaml > profile.yaml（不承载）> builtin` 经 `resolveStageWorkflowMode` **单点**延伸 + **生效路径**）；③ **规模驱动默认与升级路径**（需求默认快速；`general → fast / full` 可升级、**不自动降级**）；④ **显式 supersede** v1.2.0「需求层正交边界」旧断言（代码断言 3 组 + 模板文案 15 处 + kb 条目归档轮）——**禁静默删除**（R-2）。
- **上游编号消歧（REV-90-004）**：主题编号跨文档漂移——设计 `docs/v1.2.1-design.md:248` 节题作「**主题四**：三模式架构」，版本计划 `.openfeel/plan/v1/v1.2.1/plan.md:81`（表 D）作「**主题五**」。本计划**统一采用版本计划口径（主题五）**；跨文档引用以**节题定位**（「设计 §7 三模式架构」），**禁行号依赖**——编号漂移不影响本计划事实与结论。
- **范围（文件级）**：
  - **值域面**：`src/core/config.ts`（`WORKFLOW_MODES` 3 值 + 类型联合归一）、`src/core/flow-manager.ts`（status.md 正则 / `ConfigSource` / 转移表 general 分支 / casts）、`src/core/plan/stage.ts`（overrides 类型 + 骨架初值链）、`src/commands/{flow,plan,stage}.ts`
  - **需求级面**：`src/core/req/types.ts`（字段 + 头注）、`src/core/req/requirement-ops.ts`（patch 白名单 + 值域校验 + 头注）、`src/commands/req.ts`（`add / set --workflow-mode` + 头注 + 承接 REV-88-010）
  - **单点解析面**：`src/core/flow-manager.ts`（`resolveStageWorkflowMode` 链 + 需求级层 + 下发复用 `syncConfigFieldToStages` 单点）
  - **i18n**：`src/core/i18n-data/{zh-CN,en}.ts`（help / wizard / 提示键）
  - **supersede 面（代码）**：`test/core/req.test.ts`（T5.6 段 + 段 C）、`test/commands/req.test.ts`（T-C5）、`src/core/req/{types,requirement-ops,aggregate}.ts` 与 `src/commands/req.ts` 头注口径
  - **supersede 面（模板）**：`src/core/templates-data/{opencode,claude}/agents/{zh-CN,en}/{feel,openfeel-planner}.md`（8 文件）+ `src/core/templates-data/skills/openfeel-req/SKILL.md` + `test/core/templates.test.ts`（逐字串清单）
  - **生成物**：`src/core/template-loader.ts` + `src/core/update.ts`（build 重生成，**禁手改**）
  - **断言面（值域）**：`test/core/{config,flow-manager}.test.ts` + `test/commands/{flow,plan,stage,config}.test.ts` + `test/cli/output-encoding.test.ts`
  - `.openfeel/plan/v1/stage-90/ops/**`（末位 op 的 `produces` 清单；承 stage-88 T3.3 制度性修复）
- **边界**：
  1. **保留既有字面量零回归**：`full` / `fast` 的**行为、转移表、默认值、既有断言**逐字不变；`DEFAULT_CONFIG.workflow_mode` 仍为 `'fast'`（裁定 E：需求默认快速）；`FAST_TRANSITIONS` 9 条目零触碰；`config effective` 四键零改动。
  2. **解析单点（禁第二份判定）**：模式解析**只能**经 `FlowManager.resolveStageWorkflowMode`（链序唯一实现在此）；`src/core/req/**` 与 `src/commands/req.ts` **不得**出现 `resolveStageWorkflowMode` / `PIPELINE_PHASES` / `getValidTargets` / `flow-archive`（新禁止串，替代旧「`workflow_mode` 禁止串」口径）。
  3. **聚合判定单源**：`allLinkedStagesDone`（`requirement-ops.ts:81`）为需求 done 判定**唯一**原语；`src/core/req/aggregate.ts` **零** `workflow_mode`（模式不参与聚合 / 不参与 done 门 / 无第二份 `.every(`）——本阶段**不得**引入第二份聚合或第二份解析（承 REV-83-002 纪律）。
  4. **值域单源**：3 值的**唯一权威** = `src/core/config.ts:26 WORKFLOW_MODES`；骨架 / 冗余字段 / health / `flow mode` / `flow phases` / 命令面值域门**全部派生**（禁任何第二份 3 值字面量清单；`status.md` 正则与命令 `--mode` 值域须与该常量同源）。**例外·有意子集（REV-90-001）**：wizard 选项恒为**阶段合法子集**（full / fast——载体制约束下 general 于阶段级 / 部署级非法），判类 = **有意保留**（非漏改）；cast 归一（值形态口径：`WorkflowMode` 或方案期定稿更严形态），**选项集合恒不含 general**（显式子集或自 `WORKFLOW_MODES` 派生过滤，方案期定稿）。
  5. **可选字段读侧宽容**：`RequirementData.workflow_mode?` 缺失 = 未设置（不 load 补齐、不注入旧 flow.json）；JSON 输出只增不改（`req show --json` 的 `requirement` 内新增可选键属**增量**）。
  6. **`general` 不新增 phase**（裁定 C/D/E）：合法 phase 枚举 15 项不变；`general` 的语义 = 「**无流水线**」（转移表空 + 显式错误引导，非静默失败）。
  7. **supersede 禁删除**（裁定 D + R-2）：旧「正交 / 禁止串」断言一律**显式改写**（旧断言 → 新断言**差额对照**入报告与 §九），**且严格强于旧断言**（负向 → 负向 + 新禁止串 + 正控三件套）；模板正交文案同批改写（逐处去向不留空白）。
  8. **单写者纪律（裁定 J）**：本阶段不做散文重写式收编；模板面只做**功能性子句 / 单行替换**（新增 / 改写块 ≤6 行 / 处），其余模板语义收编归 **stage-91**；文档 / README / CHANGELOG / cli-usage 快照归 **stage-93**。
  9. **不做**：审查档位与并行编排（归 92）；提示词瘦身 / 上下文治理（归 91）；需求树聚合 / 需求归档（大计划 §七.1/.2）；`Task` 能力位（89 已裁定不启用）；`phase` 枚举 / `checkpoint_mapping` / `advanceAccepted` 语义；`.openfeel/pipeline.yaml` 新增 `general_transitions` 键（**本阶段不引入新配置键**，见 Q1）；不建 dashboard；不引第三方依赖；不改 `build.js`。
  10. **不改版本号**（`--version` 保持 1.2.0，归 93）；不 `npm publish` / 不 `git push`；**不直写 `flow.json`**；不推进 phase（由 Feel 经 CLI 执行）；提交精确 `git add`（禁 `-A`）。

## KB 检索（`openfeel-check-kb`）

已加载 `.openfeel/kb/index.md`（architecture 46 / patterns 190 / troubleshooting 66 / setup 6）。**高度相关条目**：

- `kb/architecture.md #双模式转移表选择：getValidTargets 单一取表点 + stage→mode→表 三元解析` → **本阶段扩展基点**：值域 +1 值而**取表点不变**（`resolveTransitionsForMode` 唯一）；新增值只增分支，不改「唯一取表法则」。
- `kb/architecture.md #部署级默认翻转的单一权威（DEFAULT_CONFIG ≡ schema 逐键默认）` → 默认值**不动**（仍 `fast`），3 值扩展不动单一权威；`resolveConfigDefaults` 派生零改动。
- `kb/architecture.md #需求层正交边界架构（**本版将被 supersede**）`（`:840`）→ 本阶段 supersede 落点：旧断言「`src/core/req/**` 对 `workflow_mode` **零耦合** + 6 禁止串静态断言」→ 新断言「**需求可携带模式属性**；模式仅经**单点解析器**消费；聚合判定单源不变」。**归档轮**执行追加式 supersede（五要素）+ 新继承条目；本阶段**零 kb 正文写入**。
- `kb/architecture.md #需求流转四层模型架构` + `#双层状态聚合架构`（done 判定单源 `allLinkedStagesDone` + 空集守卫）→ 不变量 3 的依据；模式字段**仅溯源 / 仅调度属性**，不入聚合。
- `kb/architecture.md #需求命令面架构：引擎单点 + 命令层零业务逻辑` → `req add/set --workflow-mode` 的**校验必须在引擎层**（命令层只做参数形状守卫与错误码→文案映射）；值域单源（禁命令层硬编码枚举）。
- `kb/patterns.md #关系型可选字段「仅溯源不聚合」模式`（`parent_id` 先例）→ `workflow_mode?` 同范式：可选、读侧宽容、不参与聚合、不注入旧文件。
- `kb/patterns.md #跨 harness × 语言模板对称纪律（节锚点插入 + 提取式切片字节等值 + 无裸主语）` → 模板正交文案改写的**四律**（同语言跨 harness 逐字同文 + 切片 `===` + 无裸主语 + 插入外零改动）。
- `kb/patterns.md #模板断言的保护边界（build 注入常量 vs 源文件直读）` + `#断言串与落文逐字核对纪律` → supersede 改写的**断言语义**：断言直读 `templates-data/**` 源文件；逐字串清单与落文必须同批原子更新（防假绿）。
- `kb/troubleshooting.md #改 templates-data 源须同批重生成「双生成物」（template-loader.ts + update.ts）` + `kb/patterns.md #零行为变更改造的验证方法（diff 归因 + build 幂等 + 命令输出对比）` → 模板改写同批 `npm run build`；生成物禁手改；`--porcelain src/` ⊆ produces 清单。
- `kb/patterns.md #零回归取证范式（补丁前/后归一化快照 diff 空）` → **full / fast 零回归**的取证法：模式解析 / 转移表 / 命令输出前后快照 diff（除有意变更登记项）。
- `kb/patterns.md #对称回写模式` + `config set --sync-stages` 先例 → 需求级模式**下发**复用既有单点同步原语（`syncConfigFieldToStages`），不新增第二套回写。
- `kb/patterns.md #CLI --json 成功/失败同契约` + `#help 键命名双规` + `#CLI 退出码语义` → 新增 `--workflow-mode` 选项（`req add/set`）的 help 键双规（`help.req.*`）+ 失败同契约（`schemaVersion:1` / 错误码）。
- `kb/patterns.md #陈旧计数「全枚举」纪律：标准正则 + 宽词界双路扫描 + 表格式计数差集 + 分层判类` + `#变体面同口径（存量枚举 / 断言 / 复核三处同口径）` → **值域全枚举**（`full` / `fast` 字面量与类型联合逐处判类：必改 / 保留 / 非扫描）与**可枚举断言面**（`/^(full|fast)$/` 等）的扫描口径。
- `kb/troubleshooting.md #可选字段「读侧补齐」的序列化副作用` + `#flow.json 内容增量核验必含 meta.revision/meta.updated` → 新可选字段**零注入**（旧 flow.json `load→save` 字节级断言）+ 写盘核验含 `meta.revision`。
- `kb/troubleshooting.md #Claude Code 实机验证方法（隔离 config + settings.json）` + `#fast 隔离 E2E 断言口径` → 三模式实跑（隔离临时项目）的验收方法（大计划 §十一.6）。
- **无**「需求级模式属性 / 三模式值域扩展 / 断言 supersede 的显式改写范式」既有条目 → **归档轮补沉**：architecture（**需求级模式属性架构：需求携带模式 + 单点解析链 + 载体制约束**）与 patterns（**断言 supersede 范式：禁止串 → 受控串 + 新禁止串 + 正控三件套 + 差额对照**；**值域扩展全枚举范式**）。
- `kb/patterns.md #模式标记三层载体与记忆语义（项目默认 config.yaml → 阶段覆盖 status.md → flow.json 不冗余）`（`:3641`）→ **wizard 双写入面的载体语义来源（修订 1 · REV-90-001）**：wizard 的 `:2173` 写**阶段级覆盖层**、`:2180` 写**项目级默认层**——general 在两层均非法（载体制约束）→ wizard 不得提供该选项；同时印证「记忆写在哪几层」正是该约束面的**穷尽依据**。
- `kb/troubleshooting.md #配置键白名单须 schema 驱动 + 值类型归一` → **枚举非法值「报错且不写盘」先例**（目标文件 hash / mtime 不变为硬断言）→ 载体制约束（三命令面拒 general）的**零写盘验收口径**；另一层判据：`setConfigValue` 仅经 schema 校验 → 3 值化后 **schema 放行 general**，故拒设**不能**依赖 schema（须命令层显式门 + wizard 不提供选项，REV-90-001）。

> ⚠️ 执行任务前，若知识库中有相关条目，务必参考。重复踩过的坑不可再犯。

---

## 一、实测清单（基线 HEAD `9a0c6be`；行号以本基线为准）

### 表 A：值域 3 值扩展面（消费点全枚举）

| # | 事实（实测复核） | 位置 | 结论 |
|:-:|------|------|------|
| A1 | `export const WORKFLOW_MODES = ['full','fast'] as const`；`WorkflowMode` 由其派生；`ConfigDefaultsSchema.workflow_mode = z.enum(WORKFLOW_MODES).optional().default('fast')`；`DEFAULT_CONFIG.workflow_mode = 'fast'` | `src/core/config.ts:26 / :28 / :36 / :177` | **值域单源**：只改 `:26` 为 3 值；`:36` schema 与 `:28` 类型**自动派生**；**默认值不动**（裁定 E） |
| A2 | 类型联合硬编码「`full` 竖线 `fast`」全仓共 **13 处**（rg 实测）= 本行 **9 处**（`config.ts:162/:168/:185`；`flow-manager.ts:110/:3728/:3740/:3762`；`plan/stage.ts:29`；`commands/stage.ts:84`）+ **命令面 cast 4 处**（`commands/flow.ts:403/:411/:2170`；`commands/plan.ts:121`——登记于 A8，**两表合计穷尽 13 处**） | 实测（REV-90-002 订正） | 逐处归一为 `WorkflowMode`（禁第二份联合清单；`:3728/:3740/:3762` 为冗余字段写入 cast）；**执行期扫描锚点 = 全仓 rg「`full` 竖线 `fast`」（13 处）** |
| A3 | **status.md 值域正则硬编码**：`content.match(/\*\*工作流模式\*\*[：:]\s*(full\|fast)/)` | `src/core/flow-manager.ts:2292` | **值域第 2 实现（唯一硬编码处）**：须与 `WORKFLOW_MODES` 同源（由常量构造正则或加同源断言）；漏改 → 三值在第 1 层即被丢弃（**静默回落 config**） |
| A4 | 转移表：`resolveTransitionsForMode(mode)`（`fast → fastTransitions ?? 内置快线`；else `→ pipelineConfig.transitions`）；`getDefaultPipelineConfig(mode)`（`fast → FAST_TRANSITIONS`）；`FAST_TRANSITIONS` 9 条目（8 流转键 + `done`） | `flow-manager.ts:2096-2101 / 4278-4308 / 476-494` | 新增 `general` 分支（**空表**，Q1）；`full` / `fast` 分支逐字不变 |
| A5 | `ConfigSource = 'status.md' \| 'config.yaml' \| 'profile.yaml' \| 'builtin'` | `flow-manager.ts:190` | 新增第 5 值（需求级来源；命名 Q4）；消费点 = `flow mode` / `config effective` / `flow status --verbose` 的 `source` 展示（i18n `mode.lineTmpl` / `effective.row` 为占位符模板，**零文案改动**） |
| A6 | health 第 10 项 `checkWorkflowModeRedundancy`（冗余字段 vs `resolveStageWorkflowMode` 解析值，warn 不 fail） | `flow-manager.ts:3504 / 3816-3840` | 经单点 → **零改动自动覆盖**新层；配套单测补「需求级来源」场景 |
| A7 | 骨架：`ensureStageSkeleton` **恒写** `- **工作流模式**：${workflowMode}`（`overrides?.workflowMode ?? resolveConfigDefaults().workflow_mode`）；`addStage` 仅**新建**写入 flow.json 冗余字段 `:216-221` | `src/core/plan/stage.ts:154 / :216-221` | **关键实测**：status.md 层**恒命中** → 需求级层存在**被短路**风险（表 B B3）；初值链与下发口径 = Q3 |
| A8 | 命令面：`flow phases --mode`（help 文案 + `explicitMode` 联合 cast + `getConfigFieldLegalValues` 值域门）；`flow mode`（只读查询；`modes` 两键 `{ full, fast }`）；**wizard（`:2164-2183`）= 载体制约束双写入面**（`:2164-2170` choices 2 项 + cast；`:2173` `insertStatusField` **阶段级** status.md 写；`:2180` `setConfigValue` **部署级** config.yaml 写）；`plan stage add --workflow-mode`；`stage set --workflow-mode`；`config set workflow_mode` | `commands/flow.ts:395/:403/:411/:435-453/:487-546（:523-526）/:2164-2183`；`commands/plan.ts:33/:63-67/:120-121`；`commands/stage.ts:386/:408-409/:463/:489/:84` | help 文案 3 值；`modes` 增 `general` 键；**wizard 保持 2 项 = 阶段合法子集（full / fast）、不提供 general**（REV-90-001 裁定；双写入面禁入 general）；命令值域门 `getConfigFieldLegalValues` 派生自动 3 值 + **新增载体制约束门**（general → 拒，见 Q2）；**实测补充**：`setConfigValue`（`config.ts:581`）仅经 `ConfigDefaultsSchema` 校验 → 3 值化后 **schema 放行 general**；wizard 又**直调**该函数（不经 `config set` 命令层门）→ 部署级拒 general **不能靠 schema**，靠命令层显式门 + wizard「不提供选项」 |
| A9 | i18n：`help.flow.phases.mode`（`zh-CN.ts:674` / `en.ts:641`）、`help.stage.set.workflowMode`（`zh-CN.ts:815` / `en.ts:778`）含 2 值枚举字面；`flow.wizard.modeFull` / `modeFast`（`zh-CN.ts:358-359` + en 同键） | 实测 | 4 键文案改 3 值；**wizard 不提供 general → `flow.wizard.modeGeneral` 不新增**（modeFull / modeFast 逐字保留；REV-90-001）；**i18n 键数 931 → 931+N**（N = general 显式错误文案 + 「general 仅限需求级」提示键 + 需求面 help 键；执行期逐键登记） |
| A10 | 模板副本：`skills/openfeel-cli-usage/SKILL.md:3/:57`（`双模式工作流` + 值域 `full \| fast` + 级联「三层载体」）、`skills/openfeel-get-stage-status/SKILL.md:18/:95`（值域行）、`skills/openfeel-wizard/SKILL.md:18`（`（full / fast）`） | 实测 | cli-usage（**v1.2.0 快照声明件**）→ **显式转 stage-93**；get-stage-status / wizard skill → **显式转 stage-91**（收编点）；三者本阶段**零触碰**、逐条登记 |
| A11 | 生成物同源副本：`template-loader.ts:7714/:7995`、`update.ts:476/:757`（「双模式工作流…值域 `full \| fast`」/「工作流模式：full \| fast」） | 实测（生成物） | **禁手改**；随模板改写 + `npm run build` 同批重生成 |
| A12 | 值域断言面（测试，逐项）：`test/cli/output-encoding.test.ts:299`（`toMatch(/^(full\|fast)$/)`）、`test/commands/plan.test.ts:115`（错误文案「允许：full, fast」）、`test/commands/flow.test.ts:361-370`（`modes` 两键 `typeof` 断言）、`test/commands/stage.test.ts:241` / `test/core/config.test.ts:473/:482/:605-651/:677-688`（模板文本 `workflow_mode: fast`——**零改动**）、`test/core/flow-manager.test.ts:4318+`（「双模式转移表」describe）/`:4532-4590`（四层解析）/`:4826+`（health 冗余项） | 实测 | **必改 3**（output-encoding / plan.test 文案 / flow.test modes）+ **新增**（general 空表 + 需求级层 + health 需求级来源）；describe 名「双模式转移表」（`:4315`/`:4318`）**保留**（历史用例名，登记为非扫描） |
| A13 | `pipeline.yaml` 侧：`FastTransitionsSchema`（`:78`）为**可选顶层键**；`.openfeel/pipeline.yaml` 无 `general` 相关键 | `src/core/pipeline-schema.ts:63-78` | **本阶段不新增配置键**（Q1）：general 表在代码内定，不引入 `general_transitions` |
| A14 | 本仓 config：`.openfeel/config.yaml defaults.workflow_mode: full`；v1.2.1 八阶段 status.md 均为 `full`；flow.json 冗余字段均 `full` | 实测 | **本仓自举零扰动**（裁定 B）：本阶段不改本仓模式值；health 第 10 项保持零告警 |

### 表 B：需求级模式属性与解析面

| # | 事实（实测复核） | 位置 | 结论 |
|:-:|------|------|------|
| B1 | `RequirementData` 现有 **11 字段**（10 + `parent_id?`）；`types.ts` 头注「正交声明：零 import（叶子模块）；…不引用工作流模式字段」；`PATCH_WHITELIST = ['status','title','target_version','priority']`；`updateRequirement` 全维度先校验后落地 | `src/core/req/types.ts:5 / :22-45`；`requirement-ops.ts:7 / :240 / :246-308` | 新增 `workflow_mode?: WorkflowMode`（可选 + 读侧宽容）；`PATCH_WHITELIST` 增键 + 值域校验（**引擎层单点**）；头注口径改写（见 T3） |
| B2 | 解析单点 `resolveStageWorkflowMode(stageId)`：链 = `status.md（:2292 正则）` > `config.yaml` > `profile.yaml（:2357 不承载）` > `builtin`；调用点 **8 处**（`flow-manager.ts:1993/:2011/:2037/:2791/:3827`；`commands/flow.ts:435/:522/:2160`——rg 实测；另有定义 `:2347` 与注释 `:1966/:2225` 非调用点；REV-90-003 订正） | 实测 | **链上第 2 层插入「需求级」**（裁定 D）；调用点**零改动**（形参契约不变 → 自动覆盖） |
| B3 | **生效路径风险（关键）**：骨架恒写「工作流模式」行（A7）→ `status.md` 层恒命中 → **需求级层在新阶段上被短路**；且 `plan stage add` 通常先于 `req link`（模式尚未可知） | 实测（A7 + 命令序） | 必须同时界定**生效路径**（Q3）：建议 **P1'**＝骨架初值经单点派生 + **`req link` / `req set --workflow-mode` 时经单点下发**（复用 `syncConfigFieldToStages` 同步 status.md 字段 + flow.json 冗余）；否则「需求级为权威」名存实亡 |
| B4 | 关联面：`linkRequirement(data, stageId, requirementId)` 写 `stages[].requirement_id`（同值幂等 / 跨需求重绑拒绝）；`req show --json` 输出 `{ schemaVersion, requirement, stages, parent, children }`（**整对象回显** —— 新字段自动入 JSON） | `requirement-ops.ts:319-337`；`commands/req.ts:224-232` | 下发点 = `link` 与 `req set --workflow-mode`；`--json` 契约**只增不改**（可选键缺失即不出现） |
| B5 | 聚合面：`allLinkedStagesDone`（`requirement-ops.ts:81`）+ `aggregate.ts`（`:41` linked 过滤 / `:67` 反向查 / `:119-133` 对账）；**零** `workflow_mode` 消费 | 实测 | **不变量 3 落地**：模式**不入聚合、不入 done 门、不入对账**（聚合文件保持 `workflow_mode` 零命中——列为**新禁止串断言面**） |
| B6 | `body-file.ts`（正文骨架）含「## 预估版本」等节，**不含**模式节；头注「路径全由 projectPath 参数传入…不引用工作流模式字段」 | `src/core/req/body-file.ts:5 / :30-66` | **零动作**（模式**不**入人读副本骨架——机读权威恒为 flow.json；避免人读快照与机读权威二次漂移）；头注措辞保留（该声明仍为真） |
| B7 | 需求命令面：`add <title> [--target-version] [--priority]`（构造期抛错 → 通用模板 exit 1）；`set <id> [--status/--title/--target-version/--priority]`（无字段守卫 + 引擎返回码映射）；`req show --json` 硬编码 option 描述缺 `parent, children` | `commands/req.ts:100-140 / :193 / :350-412` | 两命令各增 `--workflow-mode <mode>`；`set` 的无字段守卫与 help 键同批；**顺带承接 REV-88-010**（`show --json` 描述补 `parent, children`——本阶段已在本文件扩面，零扩面成本） |
| B8 | 需求侧 i18n 键族（`req.*`）：`add.priority` / `set.priority` / `set.noFieldsTmpl` / `err.invalidFieldTmpl` 等 | `i18n-data/zh-CN.ts:897-940 / :1075-1140` | 新增 `help.req.add.workflowMode` / `help.req.set.workflowMode`；`err.invalidFieldTmpl` 的字段清单文案同步（若含字段枚举） |

### 表 C：断言面（supersede / 翻转 / 新增 / 零回归）

| # | 断言 | 位置 | 变化 |
|:-:|------|------|------|
| C1 | **T5.6 正交边界**：`FILES = ['types.ts','requirement-ops.ts','body-file.ts']` × `NEEDLES` 6 串（`workflow_mode` / `PIPELINE_PHASES` / `getValidTargets` / `flow-archive` / `process.cwd` / `homedir`）+ `NEEDLES.length === 6` + 正控 3 断言 | `test/core/req.test.ts:617-649` | **显式 supersede（禁删除）**：`workflow_mode` 由**禁止串**→**受控串**（`types.ts` 字段声明 + `requirement-ops.ts` patch 白名单**合法**；`body-file.ts` 保持零命中）；**新增禁止串** `resolveStageWorkflowMode`（禁第二份解析）；**新增正控**（`types.ts` 含字段声明、`requirement-ops.ts` 含值域校验）；`NEEDLES.length` 锁定值同步 |
| C2 | **聚合正交与单源**：`aggregate.ts` × 6 串零命中 + `allLinkedStagesDone(` 在位 + `.every(` 零 + 动作名/前置集常量 | `test/core/req.test.ts:900-929` | **保持**（6 串**含 `workflow_mode`**——聚合面**仍须零命中**）+ **新增**：模式不影响聚合的**动态断言**（同一 fixture：改需求的 `workflow_mode` → `computeRequirementAggregate` 输出**不变**） |
| C3 | **命令层越界**：`src/commands/req.ts` × 7 禁止串（含 `workflow_mode`）+ 6 正控 | `test/commands/req.test.ts:1022-1041` | **显式 supersede**：`workflow_mode` → **受控串**（`--workflow-mode` 选项 + patch 传参合法）；**新增禁止串** `resolveStageWorkflowMode`；正控新增 `--workflow-mode` 选项串在位 |
| C4 | **模板正交文案正控**：feel.md ×4 `'正交注记'` / `'Orthogonality note'`；planner.md ×4 `'与「工作流模式感知」正交'` / `'Orthogonal to "Workflow Mode Awareness"'`；req skill `'与 workflow_mode 正交'` | `test/core/templates.test.ts:343 / :349 / :427 / :428 / :488` | **显式改写**（新文案逐字串替换，**禁删除**）；**差额对照**入报告；其余同 describe 断言（S1 裸主语 / S2 跨 harness 切片 `===` / S3 零回归 + 阴性）**保持全绿** |
| C5 | 跨 harness 对称：feel.md 需求节 + planner.md 需求感知节 提取式切片 zh/zh、en/en **逐字一致**；节内零裸主语 `Feel` / `主会话` | `templates.test.ts:390-398 / :450-457 / :379-388 / :467-475` | 改写后**须仍逐字一致**（同一文本替换两 harness）+ 零裸主语（新增文案禁含 `Feel` / `主会话` / `main session`） |
| C6 | 值域断言：`/^(full\|fast)$/`；「允许：full, fast」；`modes` 两键 | `output-encoding.test.ts:299`；`plan.test.ts:115`；`flow.test.ts:361-370` | **翻转 3 处**（3 值 / 允许清单 / `modes` 增 `general`）；`flow.test.ts` 的 `Object.keys(obj)`（顶层 5 键）**不变** |
| C7 | stage-74/75 既有断言（双模式转移表 9 条目 / 单一取表点 / 四层解析 / health 冗余项 / `sync-stages` 派生值 / 四键 `config effective`） | `flow-manager.test.ts:4318+ / 4532-4590 / 4826+`；`config.test.ts`；`commands/config.test.ts` | **零改写**（full / fast 逐字不变）；**新增**：general 空表 + `flow advance` 显式错误；需求级层三场景（生效 / 被 status.md 覆盖 / 无关联回落） |
| C8 | `--json` 契约：`flow phases --json` 6 键不变；`flow mode --json` 顶层 5 键不变；`req show --json` 顶层 5 键不变 | `output-encoding.test.ts:288-300`；`flow.test.ts:361-370`；`req.test.ts:1259` | **零破坏**（`modes` 与 `requirement` 为**嵌套新增**）；新增断言：`modes.general` 存在、`requirement.workflow_mode` 缺省不出现 |
| C9 | 「零注入」：旧 flow.json（无 `workflow_mode` 字段的需求）`load→save` 字节级零变化 | 承 kb #可选字段读侧宽容 先例 | **新增断言**（本阶段新字段的零注入门） |

### 表 D：模板 / 文档面（supersede 正文 + 逐处去向）

| # | 面 | 位置（实测） | 去向 |
|:-:|------|------|------|
| D1 | feel.md 需求节**正交注记** ×4（`> 正交注记：需求流转与工作流模式（full / fast）正交——两种模式下需求纪律一致。` / `> Orthogonality note: …`） | `opencode/agents/zh-CN/feel.md:246`、`opencode/agents/en/feel.md:246`、`claude/agents/zh-CN/feel.md:220`、`claude/agents/en/feel.md:220` | **本阶段改写**（T3）：→「模式注记：需求**携带**模式属性（需求级 `workflow_mode`，经单点解析作用于其关联阶段）；三种模式下需求纪律一致。」（同语言跨 harness 逐字同文） |
| D2 | planner.md 需求感知节**正交 bullet** ×4 | `opencode/agents/{zh-CN:119,en:119}/openfeel-planner.md`、`claude/agents/{zh-CN:114,en:114}/openfeel-planner.md` | **本阶段改写**（T3）：→「与「工作流模式感知」的关系：需求携带模式属性（需求级 `workflow_mode`，经单点解析作用于关联阶段）；三种模式下需求感知口径一致。」 |
| D3 | `skills/openfeel-req/SKILL.md`：description 尾「与 workflow_mode 正交」（`:3`）、节标题「## 与 workflow_mode 正交」（`:75`）、正交断言行（`:77`） | 实测 | **本阶段改写**（T3）：标题 →「## 与 workflow_mode 的关系」；正文 → 需求**携带**模式属性（值域 `full` / `fast` / `general`）+ 单点解析 + 三模式纪律一致 |
| D4 | feel.md「工作流模式」节模式枚举 ×4：`两种模式：` / `Two modes:`（+ full / fast 两条目） | `opencode/agents/zh-CN/feel.md:217`、`opencode/agents/en/feel.md:217`、`claude/agents/zh-CN/feel.md:191`、`claude/agents/en/feel.md:191` | **本阶段改写**（T3）：→「三种模式：」+ 新增 general 条目（**无流水线** / 按需调度通用工作者 / 不新增 phase / 可显式升级、不自动降级）；full / fast 两条目逐字保留 |
| D5 | `skills/openfeel-get-stage-status/SKILL.md:95`（`- 工作流模式：full \| fast`；`:18` 提及四键） | 实测 | **显式转 stage-91**（登记，零动作）——承 stage-89 Q3 口径（工具 / skill 面归 91 收编） |
| D6 | `skills/openfeel-wizard/SKILL.md:18`（模式选型 `（full / fast）`） | 实测 | **显式转 stage-91**（登记，零动作）；**修订 1 注**：该行与 wizard 本体「保持 2 项」口径**一致·仍为真**（REV-90-001），91 收编时按「阶段合法子集」复核（仅须防误扩为 3 值） |
| D7 | `skills/openfeel-cli-usage/SKILL.md:3`（`双模式工作流` 触发词）+ `:57`（值域 / 三层载体 / 级联口径） | 实测 | **显式转 stage-93**（**快照声明件**：`:15` 已声明 v1.2.0 快照，随收官轮刷新；承 stage-89 Q3/E-89-6 口径） |
| D8 | 约束层 / 路由面：`agents-md/{zh-CN,en}.md:18`、`claude/constraint/{zh-CN,en}.md:18`（`workflow_mode=fast` 快线表述）、reviewer 模板术语消歧 ×4（**工作流快线 vs FAST-PASS**） | 实测 | **零动作**（表述仍为真：fast 快线语义未变；值域单源不在这些行）——登记为**保留层** |
| D9 | manual 面：`.openfeel/manual/core/req.md`（需求字段 / 正交口径）、`manual/core/flow-manager.md` 与 `manual/agents/feel.md`（模式值域 / 模式节） | 实测（manual 存在） | **显式转归档轮**（archiver 职责：模块文档随 API / 语义变更同步） |
| D10 | 文档面：`README*` / `docs/{commands.md,GETTING_STARTED.md}` / `CHANGELOG.md` | 实测 | **显式转 stage-93**（版本收口 C 传播）；本阶段零触碰 |

### 表 E：承接 REV 台账（判据源，实测）

| # | 条目 | 状态 | 去向 |
|:-:|------|:--:|------|
| E1 | **REV-88-010**（`commands/req.ts` `show --json` 硬编码 option 描述缺 `parent, children`；i18n 键 `:908` 已含全量） | `pending` | **本阶段处置**（T4.3）：本阶段已在 `commands/req.ts` 扩面（新增 `--workflow-mode`）→ **同批一行订正**，零扩面成本；免除滞留至 93 |
| E2 | REV-86-009 / REV-86-010（low） | `pending` | **台账保留·销账维持**（v1.2.1 收官轮〔93〕或 v1.3.0）——非本阶段面，零重复登记 |
| E3 | REV-89-001~009（含 006 cli-usage 快照陈旧计数 / 008 status 留痕已由主会话修复） | 全 `closed` | **已闭合**（登记）；其中 REV-89-006 / E-89-6 的快照刷新去向与 D7 **同源**（→ 93） |
| E4 | 本阶段自身计划审查 REV-90-001~005（1 阻塞 + 4 非阻塞；判据源 `.openfeel/users/Liuary/code_review/REV-90.md`） | **修订 1 已处置**（§九） | 001 → 载体制约束面补 wizard 双面（A8 / A9 / 边界 4 / §二 / T1.3 / T1.4 / Q2 / 验收 1·6 / R-90-5 / op-001）；002 → A2 计数 13；003 → B2 调用点 8；004 → 头部编号消歧注记；005 → Q1 可达性推演登记 |

---

## 二、目标语义与不变量

| 维度 | 内容 |
|------|------|
| 值域 | `WORKFLOW_MODES = ['full','fast','general']`（单一来源）；展示命名 **规划 / 快速 / 通用**；`general` =「**无流水线**、按需调度通用工作者」形态；**不新增 phase** |
| 默认（不变） | `DEFAULT_CONFIG.workflow_mode = 'fast'`（裁定 E：**有一定规模的需求默认走快速流水线**）；`full` 由用户要求或设置 |
| 需求级属性 | `RequirementData.workflow_mode?`（可选、读侧宽容、零注入、仅调度属性——**不入聚合 / 不入 done 门**） |
| 解析链（唯一） | `FlowManager.resolveStageWorkflowMode(stageId)`：**status.md 显式 > 需求级 > config.yaml > profile.yaml（不承载）> builtin**；`source` 新增第 5 值 |
| 生效路径 | 需求级模式经**显式动作**作用于关联阶段：`req link` / `req set --workflow-mode` → 经单点**下发**（复用 `syncConfigFieldToStages`：status.md 字段 + flow.json 冗余）→「需求级为权威源头、阶段字段为投影」 |
| 流转 | `general → fast / full` **显式升级**可用；反向**仅显式**、**不自动降级**（无自动流转） |
| 载体制约束 | `general` **仅需求级合法**。**写入面穷尽枚举（4 面，REV-90-001）**：① `plan stage add --workflow-mode general` ② `stage set --workflow-mode general` ③ `config set workflow_mode general` —— ①②③ → exit 1 + 提示「general 仅限需求级」（**零写盘**）；④ **`flow wizard`（双写入面：`:2173` 阶段级 `insertStatusField` + `:2180` 部署级 `setConfigValue`）→ 以「不提供 general 选项」达成同口径拒绝**（choices 恒 = 阶段合法子集 full / fast；wizard 直调 core 写函数、不经命令层门，故**不得**开放 general）。需求为 `general` 时**不得有已链接阶段**（`req set` / `req link` 写路径门）——**Q2 定稿** |
| supersede（核心） | 「需求与 `workflow_mode` **正交**」→「**模式是需求级属性**」：代码断言 ×3 组显式改写 + 模板文案 15 处改写 + kb 条目归档轮追加式 supersede |

**不变量**：

1. **零回归（full / fast）**：转移表 / 解析结果 / 命令输出 / `--json` 契约 / 既有断言逐字不变；`getPipelineTransitions('full')` / `getPipelineTransitions('fast')` 与 `FAST_TRANSITIONS` 9 条目零触碰（前后归一化快照 diff = 空）。
2. **值域单源**：3 值只出自 `WORKFLOW_MODES`；**禁**任何第二份值域清单（含 `status.md` 正则、命令 help、i18n 文案以外的代码枚举）——以**同源断言**锁定；**有意子集例外**：wizard 选项 = 阶段合法子集（full / fast，不含 general），见边界 4（REV-90-001）。
3. **解析单点**：模式解析唯一入口 `resolveStageWorkflowMode`；`src/core/req/**` 与 `src/commands/req.ts` **禁** `resolveStageWorkflowMode` / `PIPELINE_PHASES` / `getValidTargets` / `flow-archive` / `process.cwd` / `homedir`（聚合面另加 `workflow_mode` 零命中）。
4. **聚合判定单源**：`allLinkedStagesDone` 唯一；模式**不参与**聚合 / done 门 / 对账；无第二份 `.every(`。
5. **字段可选 + 零注入**：`workflow_mode?` 缺失 = 未设置；旧 `flow.json` `load→save` **字节级零变化**；读写路径对旧文件零报错。
6. **显式失败优先**：`general`（无流水线）下的 `flow advance` / 值域非法输入 → **明确错误文案 + exit 非 0**，禁静默回落 / 静默无操作。
7. **supersede 禁删除**：旧断言 → 新断言**差额对照**（逐条：旧 / 新 / 强度对比）；新断言**严格强于**旧断言（负向 → 负向 + 新禁止串 + 正控）。
8. **跨 harness × 语言对称（四律）**：模板改写保同语言跨 harness **逐字同文**（切片 `===`）、**零裸主语**（`Feel` / `主会话` / `main session`）、**改写外零改动**、按节锚点定位（**禁行号**）。
9. **build 双生成物**：templates-data 改动同批 `npm run build`；生成物**禁手改**；`git status --porcelain src/` ⊆ produces 清单。
10. **零行为变更归因**：非结构性改动（注释 / 文案）须 diff 归因可列；无夹带。
11. **提交卫生**：精确 `git add`（禁 `-A`）；不 push / publish / 不直写 `flow.json` / 不推进 phase；`ops/` 入末位 op 的 produces。

---

## 三、变更点清单（编号 T）

### T1 — 值域扩展：`full / fast / general`（3 值）+ 消费点全枚举同步

**T1.1 值域中心（`src/core/config.ts`）**
- `:26`：`WORKFLOW_MODES = ['full', 'fast', 'general'] as const`（**唯一改动点**；注释补 `general` 语义一行：无流水线 / 按需调度）。
- `:28` 类型、`:36` schema、`:173-178` `DEFAULT_CONFIG`、`:204-230` `resolveConfigDefaults`：**派生零改动**（默认值仍 `'fast'`）。
- `:162 / :168 / :185`：类型联合 → `WorkflowMode`（归一，禁第二份联合）。

**T1.2 解析与转移表（`src/core/flow-manager.ts`）**
- `:2292` status.md 正则：值域与 `WORKFLOW_MODES` **同源**（由常量构造或同处断言锁定）→ 3 值；**漏改即静默回落**（A3）。
- `:2096-2101 resolveTransitionsForMode` + `:4278-4308 getDefaultPipelineConfig`：新增 `general` 分支 → **空表**（`{}`；phases 仍 15 项，**不新增 phase**）。
- `:110`、`:3728 / :3740 / :3762`：类型归一。
- **`flow advance` 显式错误**：目标阶段解析为 `general` 时（空表 → 无合法目标）→ 明确文案（「该阶段模式为 **general（无流水线）**；如需推进请先显式升级为 `fast` / `full`」），**非静默失败**（复用既有 advance 失败路径文案机制 + 新 i18n 键）。**定级（REV-90-005）**：常规写路径下 general 阶段态**不可达**（可达性推演见 Q1）→ 本项为**防御性路径**（防手改 status.md 等非正常写入），**保留不删**。
- `:190 ConfigSource`：新增需求级来源值（Q4 命名）。
- `health` 第 10 项：**零改动**（经单点自动覆盖；补测）。

**T1.3 命令面（`src/commands/{flow,plan,stage}.ts`）**
- `flow phases --mode`（help 3 值 + cast 归一）、`flow mode`（只读查询；`modes` 增 `general` 键）、**wizard（REV-90-001 裁定）**：choices **保持 2 项** = 阶段合法子集（full / fast）、**不提供 general**（`flow.wizard.modeGeneral` 不新增；modeFull / modeFast 逐字保留）；`:2170` cast 归一（值形态口径见边界 4）；**登记为载体制约束第 4 写入面（双面）**，配套断言（方案期定稿形态）：wizard 选项构造处零 `general`（静态源扫描）。
- `plan stage add --workflow-mode` / `stage set --workflow-mode` / `config set workflow_mode`：值域门自动派生（3 值放行）；**新增载体制约束**（`general` → exit 1 + 明确提示「general 仅限需求级」+ **零写盘**〔目标文件 hash / mtime 不变——承 kb #配置键白名单须 schema 驱动 先例〕；落点见 Q2 —— **写入面穷尽 = 三命令面 + wizard 双面** + `req link` / `req set` 的需求侧门）。
- `src/core/plan/stage.ts:29`：overrides 类型归一；`:154` 初值链（Q3）。

**T1.4 i18n 与单测**
- 文案：`help.flow.phases.mode` / `help.stage.set.workflowMode`（zh / en）→ 3 值；`plan.ts:33` / `stage.ts:386` 的**行内 help 文案**同步（实测：两键**未被命令层消费**——命令 help 为行内硬编码串；两者**同批**订正，防键值与实际帮助文案漂移）。新增：`general` 显式错误文案、「general 仅限需求级」提示键、需求面 help 键；**不新增 `flow.wizard.modeGeneral`**（wizard 不提供 general，REV-90-001）。
- 单测：`output-encoding.test.ts:299` 值域正则、`plan.test.ts:115` 允许清单、`flow.test.ts:361-370` `modes` 键；新增 general 场景（空表 / 错误文案 / `flow phases --mode general --json` 的 `workflowMode: 'general'`）；**新增载体制约束场景**（三命令面 general → exit 1 且零写盘〔hash / mtime 不变〕；wizard 选项源扫描零 `general`）。

### T2 — 需求级模式属性 + 解析链单点延伸（含生效路径）

**T2.1 字段与引擎（`src/core/req/{types,requirement-ops}.ts`）**
- `types.ts:22-45`：新增 `workflow_mode?: WorkflowMode`（JSDoc：**需求级模式属性**；可选 + 读侧宽容 + 仅调度属性，不入聚合；值域权威 = `WORKFLOW_MODES`）。**导入形态** `import type`（保「零运行时 import」）；头注 `:5` 口径改写（T3）。
- `requirement-ops.ts`：`addRequirement` 入参增 `workflow_mode?`（构造期值域校验 → 抛错，与 `priority` 同款）；`PATCH_WHITELIST` 增 `'workflow_mode'`；`updateRequirement` 增值域校验（`WORKFLOW_MODES` 单一来源）+ 差异赋值 + `changedFields`；头注 `:7` 口径改写（T3）。
- **约束**：聚合面（`aggregate.ts`）**零触碰**（B5）；`body-file.ts` 零触碰（B6）。

**T2.2 解析链单点延伸（`src/core/flow-manager.ts`）**
- `resolveStageWorkflowMode(stageId)`：`status.md` 之后插入「**需求级**」层——`stages[stageId].requirement_id` → `requirements[]` 命中且 `workflow_mode` 合法 → 返回该值 + 新 `source` 值；缺失 / 悬空 / 非法 → **自然回落**下一层（零报错，与既有风格一致）。
- `resolveEffectiveConfig()`（`:2320`）的 `workflow_mode` 出口：**同源口径**（Q4 定稿：或复用同一层级函数，或显式登记差异 + 断言，**禁**两份判定）。

**T2.3 生效路径（Q3 定稿；建议 P1'）**
- `plan stage add`：骨架初值 = **需求级（若该阶段此刻已有关联需求）> config defaults**（经单点；实现上优先复用层级函数，禁第二份判定）。
- `req link --stage S --requirement R`：**下发** R 的模式 → S（`syncConfigFieldToStages('workflow_mode', value, { onlyStages: [stageId] })` 单点复用；status.md 字段 + flow.json 冗余同批）+ 输出提示（新 i18n 键）。
- `req set <id> --workflow-mode X`：需求字段更新成功后，对**所有已链接阶段**下发（同单点）+ 提示；无关联阶段 → 仅更新需求（零副作用）。

**T2.4 需求侧 CLI（`src/commands/req.ts`）**
- `add <title>` 增 `--workflow-mode <mode>`；`set <id>` 增 `--workflow-mode <mode>`（无字段守卫 + 帮助键同批）。
- 命令层**零值域校验**（引擎单点判定；值域门由引擎返回码→文案映射）；失败同契约（`schemaVersion:1` / 错误码）。
- **承接 REV-88-010**（T4.3）：`show` 的 `--json` option 描述补 `parent, children`（与 i18n `:908` 对齐）。
- 头注 `:8` 口径改写（T3）；**新增**禁止串 `resolveStageWorkflowMode`（C3）。

**T2.5 载体制约束（Q2 定稿；建议「禁设 + 引导」）**
- `req set --workflow-mode general`：若该需求**已有链接阶段** → 拒绝（exit 1 + 提示「先解绑阶段或改走 `fast` / `full`」；零写盘）。
- `req link`：目标需求为 `general` → 拒绝（同口径）。
- 阶段级 / 部署级写入面拒绝 `general`（T1.3）。

### T3 — supersede 显式改写（**独立任务块 + 独立提交 + 差额对照**；裁定 D / R-2）

**T3.1 代码断言（3 组，全部显式改写、禁删除）**
- `test/core/req.test.ts:617-649`（T5.6）：`workflow_mode` 由禁止串 → **受控串**（分文件判类：`types.ts` 字段声明**合法**、`requirement-ops.ts` 白名单 / 校验**合法**、`body-file.ts` **仍零命中**）+ **新增禁止串** `resolveStageWorkflowMode`（禁第二份解析）+ **新增正控**（字段声明 / 值域校验在位）+ `NEEDLES.length` 锁定值同步 + describe 名改为「**需求层模式边界（stage-90 supersede v1.2.0 正交口径）**」。
- `test/core/req.test.ts:900-929`（聚合面）：**保持** 6 串（含 `workflow_mode`）零命中 + **新增**动态同源断言（改模式 → 聚合输出不变）。
- `test/commands/req.test.ts:1022-1041`（命令层）：`workflow_mode` → 受控串 + **新增禁止串** `resolveStageWorkflowMode` + 正控增 `--workflow-mode`。
- 源码头注口径改写：`req/{types,requirement-ops}.ts:5/:7`、`aggregate.ts:8`、`commands/req.ts:8`（新口径：「**需求可携带模式属性**；模式仅经单点解析器消费；本层不作流水线判定 / 不参与聚合」；`body-file.ts:5` **保留**）。

**T3.2 模板文案（15 处；表 D D1~D4）**
- feel.md 正交注记 ×4 → 「模式注记 …」（新文案见 §T3 口径，落文以方案期定稿逐字为准）
- planner.md 正交 bullet ×4 → 「与『工作流模式感知』的关系 …」
- req skill ×3（description / 节标题 / 正文）
- feel.md 模式节 ×4（`两种模式：` → `三种模式：` + general 条目）
- **纪律**：同语言跨 harness **逐字同文**；零裸主语；改写外零改动；节锚点定位（**禁行号**）。

**T3.3 模板断言（`test/core/templates.test.ts`）**
- `:343`（`'正交注记'`）→ 新文案串；`:349`（`'Orthogonality note'`）→ 新串；`:427 / :428`（planner 正交串）→ 新串；`:488`（`'与 workflow_mode 正交'`）→ 新串（`'与 workflow_mode 的关系'`）+ 正文要点串。
- **保持全绿**：S1 裸主语（`:379-388`）、S2 跨 harness 切片 `===`（`:390-398 / :450-457`）、S3 零回归（`:402-408` 含 `#### 工作流模式（workflow_mode）` / `术语消歧`）+ 阴性（NEG 5 串）。

**T3.4 差额对照（交付物）**
- 报告 §「supersede 差额对照」逐条：**旧断言 / 新断言 / 强度对比**（例：`expect(NEEDLES.length).toBe(6)` → 新锁定值；`workflow_mode` 零命中 → 受控串 + `resolveStageWorkflowMode` 零命中 + 正控 2 断言）；模板串新旧逐字对照。**禁**以「删除旧断言」形式收场。

### T4 — 门禁前置件与承接

- **T4.1 双生成物**：模板改写后同批 `npm run build`（`template-loader.ts` + `update.ts` 重生成；**禁手改**）。
- **T4.2 零注入与零回归取证**：旧 `flow.json`（无字段需求）`load→save` 字节级不变；full / fast 归一化快照 diff = 空（除登记翻转项）。
- **T4.3 承接 REV-88-010**：`commands/req.ts` `show --json` option 描述补 `parent, children`（一行文案；与 i18n `:908` 对齐）。

### T5 — 门禁收口（阶段末 op）+ 归档轮落点

| 项 | 口径 |
|------|------|
| `npm run build` ×2 | 幂等；`git status --porcelain src/` ⊆ produces 清单 |
| `npm test` | **0 skipped / 0 failed**；**新基线显式登记**（71 文件 / 1629 + 本阶段新增用例，逐条写明来源） |
| `npx tsc --noEmit` | 0 |
| `openfeel lint i18n` | **931 + N**（新键逐条列名；**N 实测登记**，非「不变」） |
| `openfeel lint kb` | 0 |
| 值域全枚举扫描 | 标准正则（`full` 竖线 `fast` 各式 / `双模式` / `两种模式`）+ 宽词界双路扫描 → **差集逐处判类**（必改 / 保留 / 非扫描），条数自洽、零未判类（表 A/B/C/D 为登记基线）；**联合字面量计数锚点 = 13 处**（表 A A2 + A8，REV-90-002）；**wizard choices（full / fast）判类 = 保留·阶段合法子集**（REV-90-001，非漏改） |
| supersede 完整性 | 3 组代码断言 + 15 处模板文案 + 4 处模板断言**逐处落地**；差额对照入报告；全仓「正交」残留 = **仅保留层**（表 D D8） |
| 零注入 | 旧 flow.json `load→save` 字节级不变 |
| `--version` | **1.2.0**（本阶段不改，归 93） |
| `ops/` 入管 | `.openfeel/plan/v1/stage-90/ops/**` 纳入精确 `git add` 清单 |
| **归档轮（kb supersede 落点）** | ① `kb/architecture.md:840` 条目（#需求层正交边界架构）**追加式 supersede**（五要素：原断言 / 新断言 / 替代条目 / 生效阶段 / 迁移说明）；② 新增继承条目「**需求级模式属性架构**」（字段 / 链序 / 载体制约束 / 生效路径 / 单源不变）；③ `kb/index.md:77` 摘要行改写；④ `kb/patterns.md` 补沉（**断言 supersede 范式** + **值域扩展全枚举范式**）+ `kb/index.md` 计数 / 摘要刷新；⑤ 公共日志记录 |

---

## 四、开放问题（方案期 / 执行期定稿）

- **Q1 `general` 的转移表形态与阶段级可达性**。建议 **A 案**：`general` → **空转移表**（忠实「无流水线」语义）+ `flow advance` **显式错误引导**（不静默）；配套**载体制约束**（`general` 仅需求级合法，阶段级 / 部署级写入面拒绝——见 Q2）。**B 案（备选）**：`general` 复用 `fast` 表（保守、但语义与「无流水线」矛盾，且会误导执行者）。**注意既有先例张力**：REV-74-009 曾把 `pipeline.yaml fast_transitions: {}` 判为「无合法用途 → 回落」——本阶段需**显式论证分野**（配置误写 vs 模式语义如此），方案期成文。**不新增配置键**（不引入 `general_transitions`）。**可达性推演（REV-90-005 登记）**：载体制约束三支（general 仅需求级合法 + 需求为 general ⟹ 零关联阶段 + 阶段级 / 部署级写入面〔含 wizard 双面〕拒绝）⟹ **常规写路径下不存在 `general` 阶段态**——status.md 显式层 / config 层 / 需求级下发**三路皆不可达**。故 `flow advance` 的 general 显式错误、status.md 正则三值识别、`flow phases --mode general` 一律为**防御性路径 / 纯展示查询**（防手改 status.md 等；不变量 6「显式失败优先」）。方案期成文：① **不得**据不可达性删减防御路径；② 测试矩阵 = **保留**防御路径用例（手改 status.md 写 general → advance 显式报错）+ **不构造**「可达 general 阶段」的常规冗余用例。
- **Q2 `general` 与「阶段」的边界（= 大计划 §十 Q5）**。建议：**禁设 + 引导**——① 需求为 `general` ⟹ **零关联阶段**（`req set --workflow-mode general` 有已链接阶段 → 拒绝；`req link` 到 `general` 需求 → 拒绝）；② 阶段级 / 部署级写入面（`plan stage add` / `stage set` / `config set` / **`flow wizard` 双面**）拒绝 `general`（「general 仅限需求级」；wizard 以「不提供选项」达成——**已裁定（REV-90-001）：不提供 general**；如方案期另有论证，须**显式修订 §二 载体制约束清单**（而非就地豁免）：开放 general 即经 `:2173` 阶段级 + `:2180` 部署级双写入打开阶段卡死路径〔R-90-5 直接触发〕）。理由：`general` 语义 = 该需求**无流水线**，与「阶段」存在自相矛盾（避免阶段卡死 + 避免宣称无流水线却挂阶段）。**备选**：放宽为「提示 + 保留」（不拒绝，靠 `flow advance` 错误引导）——须方案期与用户确认。
- **Q3 需求级的生效路径（骨架短路）**。**实测矛盾**：骨架恒写「工作流模式」行（A7）→ status.md 层恒命中 → 需求级层在新阶段被短路（B3）。建议 **P1'**：① 骨架初值经单点派生（需求级 > config）；② `req link` / `req set --workflow-mode` 经 `syncConfigFieldToStages` **下发**（status.md + 冗余字段）；链序保持裁定 D（`status.md 显式 > 需求级 > …`）。**备选 P2**：骨架**不再写**该字段（字段仅显式设置时写入）——零下发复杂度，但改变骨架文本（回归面更大）。**禁**：让需求级层成为「名义层」（被短路却声称权威）。
- **Q4 `source` 新值与四出口同源口径**。建议命名 `'requirement'`（值域 = `ConfigSource` 第 5 值）；**必须**同时定稿 `resolveEffectiveConfig().workflow_mode` 与 `resolveStageWorkflowMode()` 的**同源关系**（复用层级函数 或 显式登记差异 + 断言；**禁两份判定**）。涉及出口：`flow mode`、`flow phases --mode`、`config effective`、`flow status --verbose`。
- **Q5 需求字段的导入形态与值域单源**。建议：`types.ts` 用 `import type { WorkflowMode }`（保「零运行时 import」）；`requirement-ops.ts` 引擎值域校验**运行时**导入 `WORKFLOW_MODES`（单源，禁就地写三值字面量）；配套断言：`req/**` 对 `../config.js` 的导入**仅**类型 / 值域常量两种合法形态。
- **Q6 op 拆分粒度**。建议 **3 op**（对齐 `deps.yaml est_ops: 3`）：op-001 值域 / op-002 需求级 + CLI / op-003 **supersede 显式改写 + 门禁**。裁定 D 要求「断言改写须**独立 op**」——落法 = **独立任务块 + 独立 commit（差额对照）**；若方案期 / 审查认为须独立 op → 拆 4 op（`deps.yaml est_ops` 由主会话同步，本 Agent 不直改）。
- **Q7 需求正文骨架是否承载模式**。建议**不承载**（B6：机读权威恒为 flow.json；避免人读快照漂移）——若方案期认为需要，须同批扩展 `body-file.ts` 与相应断言（增量面）。

---

## 五、验收要点（阶段级）

1. **值域 3 值可用**：`WORKFLOW_MODES` 3 值；schema / 骨架 / 冗余字段 / health / `flow mode` / `flow phases` / 命令值域门**全部派生**（双路扫描零未判类，**无第二份值域清单**；wizard 判类 = **有意子集**，见边界 4）；`flow mode --json` 的 `modes` 含 `general`；`flow phases --mode general --json` 的 `workflowMode === 'general'`（空表 = 纯展示查询）；**wizard 零 `general` 入口**（choices 保持 full / fast；源扫描断言）。
2. **full / fast 零回归**：转移表 / 解析 / 命令输出 / `--json` 契约 / 既有断言逐字不变（归一化快照 diff = 空，除登记翻转 3 项）。
3. **需求级模式**：`req add/set --workflow-mode` 可用（合法值写入、非法值 exit 1 零写盘）；`req show`（人读 + `--json`）可见字段；可选 + **零注入**（旧 flow.json 字节级不变）。
4. **解析链单点**：`status.md 显式 > 需求级 > config > profile（不承载）> builtin` 四场景单测（生效 / 被阶段显式覆盖 / 无关联回落 / 悬空关联回落）；`source` 新值可辨；**无第二份解析**（req 层新禁止串零命中）。
5. **生效路径可证**：`req link` / `req set --workflow-mode` 下发后，关联阶段 status.md 字段与 flow.json 冗余**同批**更新；`plan stage add` 初值链按定稿口径生效；反向：需求级被阶段显式值覆盖（链序正确）。
6. **流转与边界**：`general → fast/full` 升级可用、**不自动降级**；`general` 载体制约束生效（**4 面穷尽**：三命令面 exit 1 零写盘 + wizard 零 general 入口；已链接阶段的需求禁设 general）；`flow advance` 在 general 阶段**显式报错**（**防御路径**用例：手改 status.md 写 general → advance 报错；常规路径不可达，见 Q1）。
7. **supersede 完整**：3 组代码断言 + 15 处模板文案 + 4 处模板断言**逐处落地**；**差额对照**成文（旧 → 新，逐条强度对比）；**零静默删除**；聚合面 `workflow_mode` 仍零命中 + 动态同源断言通过。
8. **承接与门禁**：REV-88-010 处置（一行文案 + 台账 `resolved`，`closed` 归 reviewer）；`npm test` 0 skipped / 0 failed（新基线登记）；`tsc` 0；`lint i18n` 931 + N（逐键列名）；`lint kb` 0；build ×2 幂等；`--version` 1.2.0；`ops/` 入管；**归档轮 kb supersede 落点**执行并登记。

## 六、风险

| # | 风险 | 影响 | 缓解 |
|:-:|------|------|------|
| R-90-1 | **值域第 2 实现漏改**（`status.md` 正则 `:2292` 硬编码 2 值；类型联合全仓 **13 处** = 表 A A2 9 处 + 命令面 cast 4 处，REV-90-002） | **高** | 表 A 全枚举（13 处锚点）+ 双路扫描差集判类 + 同源断言（正则与 `WORKFLOW_MODES` 绑定）+ 新增「三值在第 1 层即生效」用例（**防御路径**：手改 status.md 写 `general` → 解析为 general → advance 显式报错；见 Q1） |
| R-90-2 | **supersede 被做成静默删除 / 弱化**（裁定 D + R-2） | **高** | T3 独立任务块 + 独立 commit + 逐条差额对照；新断言**严格强于**旧断言（受控串判类 + 新禁止串 + 正控）；审查逐条核对旧 → 新 |
| R-90-3 | **需求级层被短路**（骨架恒写字段 → 需求级名存实亡） | **高** | Q3 定稿 + 生效路径用例（下发后字段值 = 需求值；未下发且无字段时经链生效）；禁用「名义层」收场 |
| R-90-4 | **聚合判定引入第二份**（需求模式误入 done 门 / `.every(` 复写） | **高** | 不变量 3 + `aggregate.ts` `workflow_mode` 零命中断言 + 动态同源断言（改模式 → 聚合不变） |
| R-90-5 | **`general` 语义落地为「阶段卡死」**（含 **wizard 双写入面**——若无防护，开放 general 即恢复卡死路径；REV-90-001） | 中 | Q1 / Q2 载体制约束（**4 面穷尽**：三命令面拒设 + wizard 零 general 入口 + 需求侧门；禁设 + 明确错误 + 可升级可逆）；`flow advance` 显式文案；不新增静默路径 |
| R-90-6 | **模板改写破坏跨 harness 对称 / 裸主语** | 中 | 四律 + 同语言跨 harness 逐字同文 + 既有 S1/S2/S3 断言（切片 `===` / 裸主语 / 阴性）保持全绿 |
| R-90-7 | **断言与落文不同批**（串清单更新滞后 → 假绿 / 红） | 中 | T3 内「文案 + 断言」**原子同批**（同 op 同 commit）；断言直读源文件；`rg` 复核原始输出留痕 |
| R-90-8 | **可选字段注入旧文件**（`load→save` 副作用） | 中 | 读侧宽容（缺省不补齐）+ 零注入字节级断言 + `meta.revision` 核验（kb 先例） |
| R-90-9 | **i18n 键数变化被当作回归** | 低 | T5 显式登记「931 + N」并逐键列名（非「不变」口径）；zh / en 双文件同批（lint 门） |
| R-90-10 | **越界收编**（顺手重写模板散文 / 改本仓 config 模式 / 动 92 面） | 中 | 边界 8：改写块 ≤6 行 / 处、仅功能性子句；本仓模式零扰动（A14）；审查核对 diff 白名单 |
| R-90-11 | **承接口径漂移**（REV-88-010 上游裁定转 93，本阶段改判处置） | 低 | 显式登记改判理由（同批零扩面）+ 台账 `resolved`（不自行 `closed`）；若审查认为维持 93 去向 → 撤回该项（零损失） |

**回滚**：值域扩展为**单常量 + 分支**改动（回滚 1 行 + 分支）；需求级字段为**可选**（缺省即回落，回滚后旧数据无残留）；下发为显式动作（可逐阶段回写）；模板 / i18n 为**行级替换**（逐行 revert）；supersede 断言旧版本在 git 历史（可 revert 回 stage-89 版本）；生成物随源回滚 + build 重生成。**无数据格式破坏**（`flow.json` 结构不变，仅需求条目新增可选键）。

---

## 七、承接 REV 与处置表（REV-85-002 固化口径；判据源 = 上游台账文件）

- **判据源**：`.openfeel/users/Liuary/code_review/REV-89.md`（001~009 **全 `closed`**）+ `REV-88.md`（010 `pending`）+ `REV-86.md`（009 / 010 `pending`）+ `.openfeel/code_review/v1.2.1-stage-89.md`（遗留节）。

| 上游条目 | 优先级 | 去向 | 依据 |
|---------|:--:|------|------|
| **REV-88-010**（`req show --json` option 描述缺 `parent, children`） | low | **本阶段处置**（T4.3：一行文案订正） | 上游（88 / 89）原定转 93；**本阶段改判**——本阶段已在同文件扩面（`--workflow-mode` 选项 + help 键同批），同批订正**零扩面成本**，且免滞留。若审查维持 93 去向 → 撤回（R-90-11） |
| **REV-86-009 / REV-86-010** | low | **台账保留·销账维持**（v1.2.1 收官轮〔93〕或 v1.3.0） | 89 已同口径转出；本阶段非其面，零重复登记 |
| **REV-89-006 / E-89-6**（cli-usage 快照陈旧计数） | low | **维持转 stage-93**（本阶段模板面改动使其**进一步陈旧**：值域行 → 登记在表 D D7，随快照刷新一并订正） | 快照声明件口径（`:15`）不因本阶段改变；本阶段零触碰（A10 / D7） |
| **REV-89-001~009** | — | **已闭合**（登记，零动作） | 台账实测全 `closed`；008 由主会话修复（89 归档轮） |

- **三分结论**：本阶段处置 **1**（REV-88-010）/ 台账保留 **2**（REV-86-009 / 010）/ 显式转后续 **0 新增**（89-006 + E-89-6 维持 93 去向，本阶段仅**补登记**模板面新增陈旧行）→ **零灭失**成立。
- **产出清单双向偏差登记（供 `deps.yaml` 后续同步与阶段对账）**：

| 面 | 条目 | 说明 |
|----|------|------|
| **增补面**（deps 缺 / 实际改动） | ① `src/commands/plan.ts` ② `src/commands/stage.ts` ③ `test/commands/{plan,stage,config}.test.ts` ④ `test/cli/output-encoding.test.ts` ⑤ `test/core/templates.test.ts` ⑥ `src/core/templates-data/{opencode,claude}/agents/{zh-CN,en}/{feel,openfeel-planner}.md`（8 文件）⑦ `src/core/templates-data/skills/openfeel-req/SKILL.md` ⑧ `src/core/{template-loader.ts,update.ts}`（build 重生成）⑨ `src/core/req/requirement-ops.ts` ⑩ `.openfeel/plan/v1/stage-90/ops/**` | ①~⑩ 见 T1~T5；`deps.yaml` `produces_core` 13 项命中 11（含 `config.ts` / `req/types.ts` / `flow-manager.ts` / `plan/stage.ts` / `commands/req.ts` / `commands/flow.ts` / i18n ×2 / `test/core/{config,req,flow-manager}.test.ts` / `test/commands/{req,flow}.test.ts`）→ 余项按上表增补（**deps 同步由主会话执行**，本 Agent 不直改） |
| **移除面**（deps 有 / 本阶段零触碰） | **无**（deps 13 项全部在范围内） | — |
| **阴性面**（不在本轮改动清单） | `src/core/req/body-file.ts`（除头注保留）与 `aggregate.ts`（仅头注口径）、`src/core/pipeline-schema.ts`、`.openfeel/pipeline.yaml`、`skills/openfeel-{cli-usage,get-stage-status,wizard}/SKILL.md`、`README*` / `docs/**` / `manual/**` / `CHANGELOG.md`、`.openfeel/config.yaml`（本仓模式零扰动）、`flow.json` 结构、`phase` 枚举、`build.js` | 值域 / 聚合 / 快照 / 文档面按边界隔离；既有断言与契约门锁定 |

## 八、op 拆分建议（供 openfeel-schemer 定稿；`est_ops = 3`）

| op | 内容 | 主要文件 | 依赖 |
|:--:|------|------|------|
| `op-001` | **T1 值域扩展（3 值）+ 消费点全枚举同步**：`WORKFLOW_MODES` / 类型归一（13 处）/ status.md 正则同源 / 转移表 general 分支 + advance 显式错误 / `ConfigSource` 新值 / 命令面（`flow mode`·`flow phases`·**wizard（保持 full / fast 子集 + 载体制面登记）**·`plan stage add`·`stage set`·`config set` 载体制门）/ 骨架类型与初值链 / i18n 文案键 / 值域面单测 | `src/core/{config.ts,flow-manager.ts,plan/stage.ts}`、`src/commands/{flow,plan,stage}.ts`、`src/core/i18n-data/{zh-CN,en}.ts`、`test/core/{config,flow-manager}.test.ts`、`test/commands/{flow,plan,stage,config}.test.ts`、`test/cli/output-encoding.test.ts` | — |
| `op-002` | **T2 需求级模式属性 + 解析单点 + 生效路径 + 需求侧 CLI**：字段 / 引擎白名单与值域校验 / 解析链插入需求级层 + `source` / 下发（`syncConfigFieldToStages` 复用）/ `req add`·`set --workflow-mode` / 载体制约束（需求侧门）/ **T4.3 REV-88-010 一行订正** / i18n 需求键 / 单测（四场景 + 零注入 + 零回归） | `src/core/req/{types,requirement-ops}.ts`、`src/commands/req.ts`、`src/core/flow-manager.ts`、`test/core/req.test.ts`、`test/commands/req.test.ts`、i18n | **hard: op-001**（值域 3 值须先可用；`flow-manager.ts` 同文件 → 串行） |
| `op-003` | **T3 supersede 显式改写（独立任务块 + 独立 commit + 差额对照）+ T4.1/T4.2 + T5 门禁 + 归档轮落点**：3 组代码断言改写 / 源码头注口径 / 15 处模板文案 / 4 处模板断言 / build ×2 / 门禁全量 / 值域双路扫描 / 差额对照报告 / `ops/**` 入管 / **kb supersede 落点登记** | `test/core/{req,templates}.test.ts`、`test/commands/req.test.ts`、`src/core/req/*.ts`（头注）、`src/commands/req.ts`（头注）、`src/core/templates-data/**`（8+1 文件）、`src/core/{template-loader.ts,update.ts}`、`.openfeel/plan/v1/stage-90/ops/**` | **hard: op-002**（字段落地后断言才可改写；模板面与门禁须在源码冻结后） |

- **文件冲突（`mutual_exclusion` 提示）**：op-001 与 op-002 **共有** `src/core/flow-manager.ts`（值域分支 / 解析链）→ **必须串行**（消除同文件并发写）；op-003 含 build 与门禁 → 须在 op-001 / op-002 之后（恒序）。
- **op 级依赖与文件清单由 openfeel-schemer 落 `ops/deps.yaml`**（hard / soft / mutual_exclusion，声明实际文件名）。

## 九、修订记录

| 时间 | 制定人 | 说明 |
|------|--------|------|
| 2026-10-15 | openfeel-planner | 初稿：依据大计划 `.openfeel/plan/v1/v1.2.1/plan.md`（§二 表 D 三模式源码核验 D1~D4 + §三 裁定 C/D/E + 附录 A「stage-90」+ §十 Q5）+ 设计 `docs/v1.2.1-design.md` §7 + `deps.yaml` stage-90 notes；源码复核 5 表 45 项（值域消费点 A1~A14、需求级与解析面 B1~B8、断言面 C1~C9、模板 / 文档面 D1~D10、承接 REV E1~E4）；变更点 T1~T5（含 supersede 三面显式改写 + 差额对照、生效路径、载体制约束）；开放问题 Q1~Q7；风险 R-90-1~11；承接表（处置 1 / 保留 2 / 零灭失核对）；op 拆分 3 项。**只写本计划文档**（未改源码 / 未改 `deps.yaml` / 未直写 flow.json / 未推进 phase / 未写其它阶段文件）。 |
| 2026-10-15 | openfeel-planner | **修订 1**（计划审查退回处置；判据源 `.openfeel/users/Liuary/code_review/REV-90.md`）：REV-90-001（high 阻塞）→ wizard 补入载体制约束面清单（A8 / A9 / 边界 4 / §二 / T1.3 / T1.4 / Q2 / 验收 1·6 / R-90-5 / op-001）：wizard 保持 2 项（阶段合法子集）、不提供 general、`flow.wizard.modeGeneral` 不新增、双写入面（:2173 阶段级 + :2180 部署级）登记；REV-90-002 → A2 计数订正为 13 处（9 + 命令面 cast 4；R-90-1 同步）；REV-90-003 → B2 调用点订正为 8 处；REV-90-004 → 头部补「上游编号消歧」注记（设计「主题四」vs 版本计划「主题五」）；REV-90-005 → Q1 补「可达性推演」登记（general 阶段态常规不可达；防御路径保留、不构造冗余常规用例），T1.2 / 验收 6 / R-90-1 同步定级为防御路径。**只改本计划文档**（未改源码 / 未改 `deps.yaml` / 未直写 flow.json / 未推进 phase / 未写其它阶段文件）。 |
