# v1.2.1-stage-89 计划 — 通用工作者：探索者与执行者（主题三）

- **阶段**：`v1.2.1-stage-89`（七主题之三 · 通用工作者：探索者与执行者）
- **依赖**：**hard: `v1.2.1-stage-88`**（大计划 §四 依赖图 + `deps.yaml`）。实质 = **顺序 + 语义冻结**（设计 §9 S4 依赖 S3）：88 冻结「直接调度 = 调度请求**直发**，不经多级转介」与**分类学**（通用工作者 = 执行者 / 探索者；feel-tester 并列表述，REV-88-002），本阶段把该分类学的**第二个成员**（只读探索者）落为实体 agent，并把 88 留下的「探索者接入见后续阶段」占位**统一收口**。功能面无代码级依赖——本阶段改造面仍为**模板层 + 断言面**，88 的 permission / 新节成果是本阶段的前置基线。
- **优先级**：P0
- **制定人**：openfeel-planner ｜ **制定时间**：2026-10-15 ｜ **修订轮**：初稿 → **R1**（计划审查退回；REV-89-001~004 处置见 §十）
- **基线**：**HEAD `61385d8`**（stage-88 归档提交「chore: 阶段归档 v1.2.1-stage-88」；功能收口 `7abc767`）。全表实测；文中行号/键值均以该基线为准。
- **上游基线（stage-88 归档登记值）**：测试 **71 文件 / 1620 用例** 0 skipped / 0 failed；`npx tsc --noEmit` = 0；`openfeel lint i18n` = **931**；`lint kb` = 0；build ×2 幂等（双生成物 sha256 稳定）；`--version` = **1.2.0**（本阶段不改版本，归 stage-93）；flow.json `revision 1109` / `archived_versions: 9` / `requirements: 0` / `reviews: 0`；活跃阶段 v1.2.1-stage-86/87/88 `done`，89~94 `plan_pending`。
- **定位**：把设计 §6「**执行者 / 探索者双通用工作者**」从概念落为**可加载的框架 agent**——① **新增只读探索者 `openfeel-explorer`**（工具恰 `Bash, Read, Glob, Grep`，无写工具、无副作用）替代对内置 `Explore` / `general` 的依赖（模型可控、有框架纪律、可审计）；② **执行者通用化**（承接任意 agent 的活；探索动作改指向 `openfeel-explorer`）；③ **路由表更新**（「调研/探索 → research（general / Explore）」→「→ `openfeel-explorer`」）；④ **agent 计数 9→10 全枚举翻转**（声明 / 总览表 / 派生总数 / 白名单枚举 / 断言）。**原则 = 先探后执行**：需先理解现状 → 派探索者；产出结论后 → 派执行者落地（设计 §5.4）。三者边界：事务官（无推理机械活）｜探索者（只读推理）｜执行者（读写推理）（设计 §5.5）。
- **【本阶段同时承接 REV-88-009（Q1 反转裁定）】**：见 §七 与 T4。三条处置口径 = ① **平台事实重述**（claude executor「（subagent 不调用 Task）」×2，按 2.1.300 事实改写；**原断言须显式翻转**，见 T4.1）；② **kb supersede** —— stage-88 归档轮**已完成**（`kb/troubleshooting.md:1088` 追加式 supersede + `:1097` 新继承条目；`kb/patterns.md:3426` 同批）→ 本阶段**零重复写入**，仅登记证据指针；③ **能力决策** —— **裁定：本阶段不加 `Task`**（口径与理由见 §二「Task 能力决策」）。
- **范围（文件级）**：
  - `src/core/templates-data/opencode/agents/{zh-CN,en}/openfeel-explorer.md`（**新建 2**）
  - `src/core/templates-data/claude/agents/{zh-CN,en}/openfeel-explorer.md`（**新建 2**）
  - `src/core/templates-data/opencode/agents/{zh-CN,en}/openfeel-executor.md` + `src/core/templates-data/claude/agents/{zh-CN,en}/openfeel-executor.md`（**4**：探索动作指向探索者 + 承接面注记 + 平台事实重述）
  - **探索者接入收口 28 处（全部为「改写」，零补行；R1 订正）**：`{opencode,claude}/agents/{zh-CN,en}/openfeel-{planner,schemer,reviewer,archiver,utility,vision}.md` 的占位注记行（**24**）+ `{opencode,claude}/agents/{zh-CN,en}/feel.md` 的「可用 Handoff 目标」表末行（**4**；en 2 处**实测在位**——小写变体，初稿大写敏感扫描误判「缺失」）
  - **feel.md 引用面收口 8 处（token 级替换；R1 补登）**：`{opencode,claude}/agents/{zh-CN,en}/feel.md`「必须委托」表行（**4**）+ 「反例」行（**4**）；另「委托记录」行（**4**）显式转 stage-91（登记，零动作）
  - **计数声明 + 路由表（模板，10 文件）**：`agents-md/{zh-CN,en}.md`（路由行 `:17` + 标题 `:87` + 总览表增行 + `:105` 计数）、`claude/constraint/{zh-CN,en}.md`（路由行 `:17` + 标题 `:87` + `:89` 计数 + 总览表增行 + `:109`「8 个 subagent」→ 9）、`opencode/ADAPTER.{zh-CN,en}.md`（`:3` 计数 + `:8` 清单）
  - `src/core/template-loader.ts` + `src/core/update.ts`（build **双生成物**重生成，**禁手改**）
  - `src/core/model-config.ts`（**仅 JSDoc 注释行**：`:411`「所有 9 个 agent」→ 10；零行为变更）
  - **断言面（7 文件）**：`test/core/{templates,template-loader,claude-adapter,setup,update,model-config}.test.ts` + `test/commands/model.test.ts`
- **边界**：
  1. **探索者只读（硬性，裁定 I）**：工具集**恰 4 项** `Bash, Read, Glob, Grep`；**不加** `Skill`；**不加** `TodoWrite`；**不加** `Task`。opencode 侧 permission 仅 `bash/read/glob/grep/external_directory`；claude 侧 `tools` 白名单不含 `Edit` / `Write` / `Task` / `Skill` / `TodoWrite`。**阴性断言锁定**（T3.1）。
  2. **执行者工具集不变**：读写集合（`Edit/Write/TodoWrite`）**零触碰**；本阶段仅补「承接任意 agent 的活」（通用模式）+ 探索动作指向探索者，**不重写执行者散文**（单写者纪律，收编归 91）。
  3. **单写者纪律（裁定 J）**：本阶段只做**最小必要落文**（新文件 + 功能性子句 / 行级替换），**不做散文重写**；36+4 文件的索引壳化收编归 **stage-91**。新增/改写块 ≤10 行/处。
  4. **`Task` 能力决策 = 本阶段不启用**（Q1 反转的能力面处置，REV-88-009 ③）：理由 ① opencode 侧嵌套调度默认配置实测为 **no-go**（`subagent_depth=1` 拦截，88 op-001 §6/§9）→ 两 harness 当前实际通道统一为 **Handoff 直发**；② Claude 侧仅 **2.1.300 单版本**实测、深度上限未测、`Task`→`Agent` 映射未文档化（88 op-001 §10.3 自登记残留风险）；③ 在 ① 的约束下 claude 侧单边启用会造成**两 harness 语义分叉**，与 88 冻结的「统一语义 + 双口径」架构相悖。**落实 = 「事实重述 + 能力决策成文登记 + 断言面同步」，模板能力位（`tools` 白名单）保持不含 `Task`**；状态可逆（未来单点改 4 文件白名单 + 断言），决策与残留风险**入 stage-91 收编视野**。
  5. **计数与动态节翻转面收口**：agent 9→10 的**全部声明形态**本阶段一次收口（§一 表 D：字面量 / 标题 / 总览表行 / 派生总数 / 白名单枚举），**双路扫描**（标准正则 + 宽词界）零未判类（kb #陈旧计数「全枚举」纪律）。
  6. **不触碰 88 已闭环面**：`permission.task = "allow"` ×12、24 份新节的**结构**（节标题 / 锚点 / HANDOFF 标记行 / 通用工作者首行）逐字不变；仅**占位注记行**一处随 explorer 落地而改写（T2.3，含 stage-88 断言的**显式延期项翻转**——非弱化，见 T3.4 / T4.1）；feel.md 引用面（T2.3(b)/(c)）与 executor 探索行（T2.1）不在 88 新节范围内。
  7. **不做**：executor / feel-tester 的 permission 键集变更（阴性面）；`skills/openfeel-tool-usage` 与 `skills/openfeel-get-stage-status` 的改写（**显式转 stage-91**，口径见 Q3）；三模式（归 90）；提示词瘦身 / 上下文治理（归 91）；提速与并行编排（归 92）；README / docs / CHANGELOG / manual / cli-usage skill 快照（归 93）；kb 正文写入（归归档轮，仅登记新增条目名）。
  8. 本阶段**不改版本号**（`--version` 保持 1.2.0）；不改 phase 枚举（15）；不改 `build.js`；不引入第三方依赖；不改 `flow.json` 结构与内容（除 CLI 自身写入）。
  9. 不 `npm publish`、不 `git push`；**不直写 `flow.json`**；不推进 phase（由 Feel 经 CLI 执行）；提交精确 `git add`（禁 `-A`——kb #方案层 ops 产出的审计链完整性）；`.openfeel/plan/v1/stage-89/ops/` 列入末位 op 的 `produces` 清单（承 stage-88 T3.3 制度性修复）。

## KB 检索（`openfeel-check-kb`）

已加载 `.openfeel/kb/index.md`（architecture 45 / patterns 190 / troubleshooting 66 / setup 6）。**高度相关条目**：

- `kb/patterns.md #新增 Agent 全链路更新清单模式`（v0.4.6-stage-01 先例，8→9 Vision）→ **本阶段主清单骨架**：源模板双语言新建 → 约束层「N Agent 体系总览」（标题计数 + 总览表 + 调度列表）→ 角色/白名单映射回退表 → `test/core/{template-loader,update}.test.ts` 计数断言 → build 零代码变更（目录遍历自动纳入）。**差异点（本阶段须显式加面）**：① **双 harness**（v0.4.6 仅 opencode）→ 新增 `claude/agents/**` + `claude/constraint` + `claude-adapter.test.ts`；② **零悬空引用占位翻转**（88 遗留 28 处）；③ **路由表**行更新（v0.4.6 无此面）。
- `kb/patterns.md #陈旧计数「全枚举」纪律：标准正则 + 宽词界双路扫描 + 表格式计数差集 + 分层判类` → 本阶段 9→10 的**扫描方法**与**登记口径**（必改 / 保留 / 非扫描三层；条数之和须自洽）。
- `kb/patterns.md #skills 计数翻转全量清单：字面量 + 派生总数 + 白名单枚举（派生值 27/28/55 陷阱）` → **agent 侧同构陷阱**：字面量 9（12 处）+ **派生总数 28 / 29 / 57**（5 处，不含 `9` 故宽词界扫描兜不住）+ **白名单枚举**（`listAgentIds` 逐名断言 / ID 数组）。
- `kb/patterns.md #跨 harness × 语言模板对称纪律：提取式切片字节等值 + 节锚点插入 + 无裸主语` → 新增节 + 28 处注记行的**四律**：节锚点插入（禁行号）｜同语言跨 harness **提取式切片** `===` 逐字等值（切片非空前置防假绿）｜**无裸主语**（`Feel` / `主会话` 零出现）｜插入外零改动。
- `kb/patterns.md #Agent 模板模式感知落法：节锚点插入 + 同语言跨 harness 逐字一致 + 按 harness 替换主语` → 新增 agent 的节结构与既有 6 份 subagent 对齐（`## 调度与 Handoff` 在 `## 模型选择` 之前）。
- `kb/architecture.md #8→9 Agent 体系扩展：Vision 视觉官` → 上一位新增 agent 的**设计决策成文范式**（职责 / 模型 / 调起方式 / 权限 / 颜色 / 与既有体系关系）——本阶段 explorer 同款落文。
- `kb/troubleshooting.md #改 templates-data 源须同批重生成「双生成物」（template-loader.ts + update.ts）` + `kb/patterns.md #零行为变更改造的验证方法（diff 归因 + build 幂等 + 命令输出对比）` → 模板改造同批 `npm run build`；生成物禁手改；`--porcelain` ⊆ produces 清单。
- `kb/patterns.md #模板断言的保护边界（build 注入常量 vs 源文件直读）` → 断言**直读源文件**（`templates-data/**`），不依赖部署产物。
- `kb/architecture.md #Claude 内容源自立与运行时 3 API` + build 校验事实（`build.js:1067` `forbiddenTokens = ["mode:", "permission:", "reasoning_effort:", ".opencode/"]`）→ claude 侧为**独立源**，须双 harness 同批；新 claude 模板**须合规**（逐份判负）。
- `kb/troubleshooting.md #Claude Code 实机验证方法与行为事实（Q1 本体）` + **`#Claude Code 2.1.300 subagent 可调 Task（Q1 反转）`**（`:1097` 新继承条目）→ REV-88-009 的**判据源**（与 88 `ops/op-001-verdict.md` §8.1 / §10.3 三处留痕一致）。
- `kb/patterns.md #平台能力实测先行的 go/no-go 决策范式` → `Task` 能力决策的**禁止项**：无行为级证据不得落能力声明；**能力可用 ≠ 必须启用**。
- `kb/patterns.md #跨阶段承接 REV 与处置表`（REV-85-002 固化）+ `kb/troubleshooting.md #flow.json 内容增量核验必含 meta.revision/meta.updated` → §七承接表与写盘核验口径。
- `kb/architecture.md #通用工作者直接调度架构（88 新条目）` → 本阶段是其**后半句落地**（分类学第二成员实体化 + 占位收口），归档轮新增条目须显式回链。
- **无**「只读探索者 agent / 先探后执行 / 占位注记延期翻转」既有条目 → 归档轮补沉：architecture（**只读工作者架构：工具集下限 × 无写能力 × 路由替代内置 agent**）与 patterns（**延迟占位注记的收口模式：占位 → 实体落地 → 阴性断言翻转为正控**）。**R1 追加（归档轮同步补沉）**：`kb/patterns.md #陈旧计数「全枚举」纪律` 的**扫描变体面**补强——存量文本存在**大小写变体**时（en 表行小写 `explorer onboarding…`），**扫描与断言两侧须同用大小写不敏感口径**（`rg -i` / 断言正则 `i` 标志），否则「零残留」静默假绿（R1 实证）；另：**已声明「快照」的文档**（`skills/openfeel-cli-usage/SKILL.md:15`）其陈旧计数属**保留 / 非扫描层**（随收官轮刷新），须显式登记以闭合全枚举口径（R1 补登 `:186`）。

---

## 一、实测清单（基线 HEAD `61385d8`；行号以本基线为准）

### 表 A：探索者接入面（新增 + 收口）

| # | 事实（实测复核） | 位置 | 结论 |
|:-:|------|------|------|
| A1 | 两 harness agents 目录各 **9 文件**（feel + 8 openfeel-*）；**无 explorer** | `src/core/templates-data/{opencode,claude}/agents/{zh-CN,en}/` | 新增 4 文件（2 harness × 2 语言）；build 按**目录遍历**自动纳入（`build.js:111/227/357`）→ **零 build 代码变更** |
| A2 | **占位注记 28 处**（zh 14 + en 14；**大小写不敏感**全扫 `rg -in` 实测；初稿大写敏感口径仅得 26——R1 订正）：24 份「调度与 Handoff」节尾行注记 + **4 份「可用 Handoff 目标」表末行均在位**（zh：opencode `:127` / claude `:118`；en：opencode `:127` / claude `:118`，en 为**小写变体** `explorer onboarding comes in a later stage`） | 对 `templates-data/**` 全量扫描「探索者接入见后续阶段」/`/explorer onboarding comes in a later stage/i`（**须 `-i` 口径**） | 收口面 = **28 处文本动作**（24 节注记 + 4 feel 表行，**全部为改写——零补行**；en 表行小写差异系**本轮扫描方法发现**，非 88 遗留缺陷） |
| A3 | 「调度与 Handoff」节骨架：首行「本 Agent **可直接调度**（不经多级转介）：通用工作者 `openfeel-executor`（读写）。」（88 REV-88-002 分类学定稿）；注记行为**末行**；锚点 `## 模型选择` 在其后 | 24 份节（88 op-002 产物） | 注记行改写**仅动末行**；首行（通用工作者名）本阶段**零触碰**（explorer 由注记行承载）；节标题 / 锚点 / HANDOFF 标记行零触碰 |
| A4 | 执行者探索动作（**R1 行号订正**）：**opencode 侧**「用 `task(explore)` 并行探索代码区域」（zh:88 / **en:88**）；**claude 侧**「由**主会话**经 **Task** 工具调度 `Explore` 并行探索代码区域（subagent 不调用 Task）」（zh:82 / en:82）。**4 份行尾均含第二子句**（zh「跨文件修改先用 `todowrite` / `TodoWrite` 创建任务列表。」/ en "For cross-file modifications, create a task list with `todowrite` / `TodoWrite` first."） | 4 份 executor 模板 | 改写为 **`openfeel-explorer`**（框架内只读工作者）；claude 侧**同时消解**「（subagent 不调用 Task）」**平台断言**（REV-88-009 ①）；**粒度 = 仅替换探索子句，行尾 todowrite 子句逐字保留**（REV-89-003③） |
| A5 | 执行者「非编码小活承接」节**仅**覆盖 `type: utility` 简化流；**无**「承接任意 agent 的活 / 通用模式任意执行任务」表述 | `opencode/agents/{zh-CN,en}/openfeel-executor.md` + `claude/agents/{zh-CN,en}/openfeel-executor.md` | 增补**一段注记**（≤4 行）：通用模式下可承接任意 agent 直接调度的执行任务（与 `type: utility` 通道**并列**，不混淆）；承接面**不重写** |
| A6 | 路由表 4 份，行位 `:17`：zh「Feel → research（general / explore Agent）」；claude 侧「主会话（Feel 角色）→ research（`general` / `Explore` subagent）」 | `agents-md/{zh-CN,en}.md:17` + `claude/constraint/{zh-CN,en}.md:17` | 四份统一改为指向 **`openfeel-explorer`**（zh：`Feel → research（`openfeel-explorer` Agent）`；claude 侧 `→ research（`openfeel-explorer` subagent）`；en 同构）；**行数不变**、第 1 / 3 列逐字不变 |
| A7 | feel.md 的 `general` / `explore` / `Explore` 引用面 **实测 16 处**（**R1 全量补登**）：① 委托记录行 ×4（opencode zh:317 / en:317；claude zh:291 / en:291）；② 「必须委托」表行 ×4（opencode zh:60 / **en:60**；claude zh:51 / **en:51**）；③ 「反例」行 ×4（opencode zh:64 / **en:64**；claude zh:55 / **en:55**）；④ 「可用 Handoff 目标」表末行 ×4（= A2）；另 executor ×4（= A4，不在 feel.md） | 4 份 feel.md + 4 份 executor | **去向逐处（零空白）**：① → **显式转 stage-91**（审计口径举例；登记零灭失）；②③ → **本阶段改写**（token 级替换，T2.3(c)）；④ → **本阶段改写**（T2.3(b)）；executor ×4 → 本阶段改写（T2.1）。**术语非命中**：en feel.md `:113`（opencode）/ `:104`（claude）的 `general workers` 为分类学术语（非内置 `general` 引用）——零动作登记；**REV-89-005 吸收（存量非命中面补登）**：`agents-md/en.md:17` 与 `claude/constraint/en.md:17` **第 1 / 3 列**含 `Research/exploration` / `Read-only exploration…`；`:41`（4 份同构）含 zh「自行探索」/ en `explore independently`——均**保留、零动作**（T2.4 明示第 1 / 3 列逐字不变；故路由阴性**不得**整文件扫描） |
| A8 | `openfeel-tool-usage` skill：触发条件行含「复杂多步委托 general」；优先级表含 `task(explore)` / `task(general)` | `skills/openfeel-tool-usage/SKILL.md:21 / :27-33` | **本阶段零触碰**（显式转 stage-91；88 计划 Q16 已同口径登记）；映射表 10 键 ×2 表由既有断言锁定，键集不变 |
| A9 | 内置 `Explore` / `general` **非框架资产**：无模板、无权限、无断言保护 | 实测（agent 模板面零命中） | 替换为 `openfeel-explorer` **不产生断链**；替代后获得模型可控 / 框架纪律 / 可审计（设计 §5.3 目标） |

### 表 B：探索者模板规范（新建 4 份）

| # | 事实 | 来源 | 结论 |
|:-:|------|------|------|
| B1 | opencode frontmatter 六字段范式：`description` / `mode: subagent` / `model: deepseek/deepseek-flash` / `reasoning_effort` / `color: "#RRGGBB"` / `permission`（键序 `bash → read → glob → grep → [task] → [edit] → external_directory`） | vision / executor / planner 实测 | 新文件**同构**；permission **仅** `bash/read/glob/grep/external_directory`（**无 task / edit / write**） |
| B2 | claude frontmatter 六字段范式：`name`（== 文件名）/ `description` / `tools`（PascalCase、**无 Task**）/ `effort` / `color`（小写英文名）/ `model: inherit` | vision / planner / utility 实测 | 新文件**同构**：`tools: Bash, Read, Glob, Grep`；`model: inherit`；**禁** `mode:` / `permission:` / `reasoning_effort:` / `.opencode/`（build `forbiddenTokens` 逐份判负） |
| B3 | 颜色占用：opencode 六角 8 个已占（`#06B6D4` `#22D3EE` `#4A90D9` `#4CAF50` `#50C878` `#6A8DFF` `#8B5CF6` `#8B9DC3` `#EC4899`）+ claude 名（`blue`×3 / `cyan`×2 / `green`×2 / `pink` / `purple`）；vision 两 harness 色不同 → **不要求跨 harness 同色** | 实测逐文件 color 行 | 探索者取**未占用**色（opencode 六角 / claude 名各一；方案期实测确认） |
| B4 | 正文结构范式：`## 核心职责`（3-4 项）/ `## 调起方式` / `## 输出规范` / `## 能力边界` / `## 模型选择`（claude 侧 `## Model Selection`） | vision / executor 实测 | 新文件同构（zh / en 各一份）；**不含** `Feel` / `主会话` 裸主语（正文用「调用方」） |
| B5 | 跨 harness 内容**不要求字节相同**（harness 差异词允许）；**键集相等**由 build 保护（`assertKeySetsEqual`，`build.js:1271 / :1321`） | build.js 实测 | 新增 4 文件**键必须两 harness 同名同数**（`openfeel-explorer`）→ build 单源一致性校验通过的前提 |
| B6 | 「调度与 Handoff」节由 88 为**其余 6 份 subagent** 落文；**executor / feel-tester 无此节** | 实测（32 份模板扫描） | 探索者为**只读工作者**：**不落**该节（避免与只读定位冲突）；调度语义由「先探后执行」注记承载（Q4；默认不落） |

### 表 C：断言面（既有 / 新增 / 翻转）

| # | 断言 | 位置 | 变化 |
|:-:|------|------|------|
| C1 | claude agents 数 == opencode agents 数（`toBe(9)`）+ 注释「（9×2）」 | `claude-adapter.test.ts:5/23/70` | **翻转 9→10**（注释 + 断言）；新增 explorer 正控（name / model / tools） |
| C2 | claude 源树「agents 各 9 个 .md」 | `templates.test.ts:104/111/115` | **翻转 9→10** |
| C3 | `listAgentIds` 三语言各 9 + `toContain` 逐名（**白名单枚举**） | `template-loader.test.ts:65-105` | **翻转 9→10** + 逐名表**追加 `openfeel-explorer`** |
| C4 | `listClaudeAgentIds` = 9 个 / feel + **8 个 openfeel-** | `template-loader.test.ts:492-497` | **翻转**：10 / **9 个 openfeel-** |
| C5 | 「命名前缀完整性」：9 项 / 8 前缀（zh / en 双 lang） | `template-loader.test.ts:86-104` | **翻转 9→10 / 8→9** |
| C6 | 权限模型「9 agent × zh/en 含 external_directory」+ 键集双语言一致 | `template-loader.test.ts:252` 等 | **翻转 9→10**；explorer 键集 zh / en 成对（既有断言自动覆盖新文件） |
| C7 | setup：全局 agents `toHaveLength(9)` + 幂等 `skipped === 28` + 双 harness `skipped === 57` + claude agents 9 | `setup.test.ts:62/88-89/217/240-241` | **翻转**：9→10 / **28→29** / **57→59**（+2 = 两 harness 各 +1）/ 9→10 |
| C8 | update：用例名「应创建 9 个全局 Agent 定义文件」+ `skipped === 29` + claude `created 29` / `agents 9` / `skipped 29` | `update.test.ts:117/265-275/811-816/871-876` | **翻转**：9→10 / **29→30**（×2）/ 30 / 10 / 30；逐名表追加 `openfeel-explorer.md` |
| C9 | `listAgentModels` = 9 条 | `model-config.test.ts:216-223` | **翻转 9→10**（`listAgentModels` 派生自 `listAgentIds` → 自动含新 agent） |
| C10 | `model list` 输出行 `>= 9` + 计数注释 | `test/commands/model.test.ts:82-90` | 阈值 `>= 9` 在 `>=` 语义下**不红**；**注释翻转** + 断言面登记（方案期定稿是否同步阈值） |
| C11 | stage-88 S1：`block` **`not.toContain(openfeel-explorer)`**（悬空引用阴性） | `templates.test.ts:543`（**断言本体**；`:508-511` 为 describe 头注释、非断言——R1 行号订正） | **延期项显式翻转**：阴性 → 正控（`toContain('openfeel-explorer')`）+ **新增全模板占位零残留**断言（**大小写不敏感**；T3.2 / T4.1） |
| C12 | stage-88 S3：claude executor **`toContain`「（subagent 不调用 Task）」** / en 同款 | `templates.test.ts:583-584` | **显式翻转**为平台事实重述后的新表述（REV-88-009 ①；T4.1） |
| C13 | stage-88 A4 零改写面（`permission.task` ×12 / S2 切片 `===` / S3 负向 10 行 / T4.4 映射表 10 键 / stage-76 S1-S4 37 份阴性 11 串） | `template-loader.test.ts` + `templates.test.ts` | **保持全绿零改写**（除 C11 / C12 两项已登记翻转）；新增内容须**不含** stage-76 禁用串 |
| C14 | build 单源一致性：`AGENT_TEMPLATES` ≡ `OPENCODE_AGENT_TEMPLATES`（内容）+ `CLAUDE_AGENT_TEMPLATES` 键集相等 + claude 必填 `name` / `description` + 禁 opencode 专有串 | `build.js:1067 / :1271-1330` | 新增 4 文件须同时满足（双语言键同名、claude 侧六字段齐备、无 `forbiddenTokens`） |
| C15 | **无**任何断言保护「路由表指向 `general` / `Explore`」 | 实测（`test/**` 零命中） | 路由替换**不红**；**新增**正控（路由行含 `openfeel-explorer`）+ 阴性（4 份路由文件零 `Explore` 残留） |

### 表 D：agent 计数（9→10）全枚举翻转面

| 层 | 表达形态 | 实测位置（**必改**） | 计数 |
|:--:|------|------|:--:|
| **声明** | 标题字面量 | `agents-md/{zh-CN,en}.md:87`（「### 9 Agent 体系总览」/「### 9-Agent System Overview」）；`claude/constraint/{zh-CN,en}.md:87` | 4 |
| **声明** | 正文计数 | `agents-md/zh-CN.md:105`（「9 个 agent 各自内联」）/ `en.md:105`（「Each of the 9 agents」）；`claude/constraint/zh-CN.md:89`（「> **9 agents（含主会话 `feel`）+ Task 调度**」）/ `en.md:89`；`claude/constraint/{zh-CN,en}.md:109`（「本框架 8 个 subagent」/「The 8 subagents」→ **9**） | 5 |
| **声明** | ADAPTER 计数 + 清单 | `opencode/ADAPTER.zh-CN.md:3`（「9 个 Agent 定义」）+ `:8`（枚举 9 名 → 增 explorer）；`ADAPTER.en.md:3` + `:8` | 4 |
| **声明** | 总览表**行** | `agents-md/{zh-CN,en}.md` 9 行表 → **10 行**；`claude/constraint/{zh-CN,en}.md` 同 | 4 行增 |
| **代码** | JSDoc 计数 | `src/core/model-config.ts:411`（「所有 9 个 agent」） | 1 |
| **测试** | 字面量（**12**，逐项） | `claude-adapter.test.ts:70`；`templates.test.ts:115`；`template-loader.test.ts:67/82/88/95/104/252/497`；`setup.test.ts:62/217`；`update.test.ts:816` | 12 |
| **测试** | 派生总数（**5**，逐项；**均不含 9**，字面量扫描兜不住） | `setup.test.ts:89`（**28→29**）、`:241`（**57→59**）；`update.test.ts:275`（**29→30**）、`:814`（**29→30**）、`:876`（**29→30**） | 5 |
| **测试** | 显式面（**5**，逐项；R1 补名——原「22」中不可追溯的余 5 项） | ⑱ `template-loader.test.ts:68-76` 逐名 `toContain` **追加 `openfeel-explorer`**（zh-CN 组；en 组 `:83` `toEqual(zhIds)` 派生覆盖）；⑲ `template-loader.test.ts:97/106` 前缀计数 `filter(startsWith('openfeel-'))` **8→9**（用例名 `:93/:101` 同步）；⑳ `update.test.ts:117-131` 逐名 `existsSync` **追加 `openfeel-explorer.md`**；㉑ `model-config.test.ts:216/223`（用例名 + `toHaveLength(9)`→10）；㉒ `test/commands/model.test.ts:82/88/89`（用例名 + 注释翻转；阈值 `:89` 为 `>= 9` —— `>=` 语义不红 → **保留值**，仅登记） | 5 |
| **测试** | 附属（用例名 / 注释文案，非断言本体；随同批同步，**不计入 22**） | `claude-adapter.test.ts:5/9/23/65`；`templates.test.ts:104/111`；`template-loader.test.ts:65/79/86/226/250/492/495/540/572/575`；`setup.test.ts:3/55/88/210/240`；`update.test.ts:273/813` —— 共 **23 处**（逐文件 4 / 2 / 10 / 5 / 2） | 23 |
| **非扫描（登记）** | 历史行 / 非计数 / 快照件（R1 逐条补登） | ① 历史分析文档：`docs/agent-tool-compatibility-fix.md`、`docs/research/*`、`docs/phase-*`；② 历史决策：`kb/architecture.md:84`（「删除的 9 个 Agent」）、`:189`（v0.4.6 **8→9 历史条目**）；③ `src/core/migrate.ts:183`（「9 agent + 14 skill」历史布局迁移口径）；④ 注释行：`src/core/setup.ts:3/:49/:106`、`src/core/update.ts:1993/:2004`（非必需，可择机同批——仅注释行；初稿 `setup.ts:112` 行号订正）；⑤ **v1.2.0 快照声明件**：`skills/openfeel-cli-usage/SKILL.md:186`（「9 个 agent 内联 permission」——`:15` 快照免责，随 93 收官轮刷新；生成物同源零动作）；⑥ **非 agent 计数**：`test/core/template-loader.test.ts:594/597/606/609`、`test/core/flow-manager.test.ts:4358`（**fast 表 9 条目**，恒 9 禁误改）、`flow-manager.test.ts:2119`（循环变量） | — |

> **口径自洽**：必改 **36 项**（声明 13 + 代码 1 + 测试 **22**〔= 字面量 12 + 派生 5 + 显式面 5，**逐项可追溯**（R1 订正）〕）＋ **总览表行增 4** ＝ **40 动作**；另 feel 表末行 **改写 4**（初稿「补行 2」订正——零补行）+ feel 引用面 **8 处** token 替换（A7 面，非计数面）；附属 **23 处**（用例名 / 注释）与保留 / 非扫描层**逐条登记**（含 cli-usage 快照行、fast 表 9 条目——非 agent 计数），双路扫描（标准正则 + 宽词界 `\b9\b`）后**零未判类**。

### 表 E：REV-88-009 承接（Q1 反转三小项 + 判据源）

| # | 条目 | 现状（实测） | 本阶段动作 |
|:-:|------|------|------|
| E1 | ① 平台事实重述：claude executor「（subagent 不调用 Task）」×2（zh / en `:82`） | 在位且被 stage-88 S3 断言**正向锁定**（C12） | **改写**（T4.1）：随 A4 探索动作改写一并消解平台断言；**断言显式翻转**（非删除） |
| E2 | ② kb supersede | **stage-88 归档轮已完成**：`kb/troubleshooting.md:1088`（原条追加式 supersede，五要素齐备）+ `:1097`（新继承条目「2.1.300 subagent 可调 Task」）；`kb/patterns.md:3426` 同批 | **零重复写入**；仅登记**证据指针**（T4.2） |
| E3 | ③ 能力决策（`Task` 入通用工作者白名单？） | 88 裁定转后续；opencode 侧默认 no-go（`subagent_depth=1`）；Claude 侧 2.1.300 行为级可（`spawnDepth: 2`） | **裁定：本阶段不加**（边界 4 四理由）；落实 = 事实重述 + 决策成文 + 断言同步；**残留风险登记**（单版本 / 深度上限 / 映射未文档化） |
| E4 | ④ 判据源 | REV-88-009 四点零灭失登记 + `code_review/v1.2.1-stage-88.md` 遗留节 | 判据源 = 88 `ops/op-001-verdict.md` §8.1 / §10.3 + 终局报告 §1.2（§七逐条去向） |

---

## 二、目标语义与不变量

| 维度 | 内容 |
|------|------|
| 新增 agent | `openfeel-explorer`（探索者）——**只读通用工作者**：读代码、查资料、定位问题、数据探查；**无副作用** |
| 工具集（硬性） | opencode：`bash / read / glob / grep / external_directory`（**无 task / edit / write**）；claude：`tools: Bash, Read, Glob, Grep`（**无 Task / Skill / TodoWrite / Edit / Write**） |
| 先探后执行 | 需要理解现状 → 先派探索者（只读、可并行、便宜）；产出结论 → 再派执行者落地（读写、需谨慎、串行性强）（设计 §5.4） |
| 路由替代 | 「调研/探索（读代码、查资料、定位问题）」→ **`openfeel-explorer`**（替代内置 `general` / `Explore`：模型可控、有框架纪律、可审计） |
| 三者边界 | 事务官（无推理机械活）｜**探索者（只读推理）**｜执行者（读写推理）（设计 §5.5）——utility 保留、职责**零改动** |
| 计数 | agent **9 → 10**（含 `feel`；`openfeel-*` **8 → 9**） |
| Task 能力决策 | **不启用**（两 harness 均不加）——事实 = Claude 2.1.300 下白名单含 `Task` 可派发下一级（88 实证）；决策 = 当前通道统一 Handoff 直发（opencode 默认 no-go + 保守），能力位保持不含 `Task`；**可逆** |
| 分类学 | **通用工作者 = 执行者 / 探索者**（88 冻结）；`openfeel-feel-tester` **不属该分类**（并列表述）——本阶段新增文案**不得**把 feel-tester 或 utility 归入通用工作者 |

**不变量**：

1. **只读性**：探索者**无任何写路径**（工具集 + permission + 正文能力边界三处一致；阴性断言锁定）；不参与流水线 phase 推进、不写 `flow.json`、不落审计副作用（产出经返回值传递）。
2. **零悬空引用 / 零占位残留**：本阶段结束时全仓模板**无**「探索者接入见后续阶段」类占位（扫描与断言**大小写不敏感**——en 存在小写变体，R1 实证）；新增文案引用的 agent 名**全部存在**；feel.md 路由 / 能力面 `explore` / `Explore` token 零残留（委托记录行显式转 91 除外，登记在册）。
3. **跨 harness × 语言对称（四律）**：节锚点插入（禁行号）｜同语言跨 harness **提取式切片逐字等值**（切片非空前置）｜**无裸主语**（`Feel` / `主会话` 零出现）｜插入外零改动。本阶段改写面为**既有节内单行**：24 节注记行 + 4 份 feel 表末行须保同语言跨 harness 两份**逐字同文**（88 已建立此结构）；**例外（R1 登记）**——executor 探索行按 harness 机制词分叉（`task(...)` vs 直接调度通道，**不要求**逐字同文），feel「必须委托」/「反例」行按各 harness 既有命名惯例（`Agent` / `subagent`）替换 token。
4. **计数全枚举自洽**：9→10 的全部表达形态（表 D）双路扫描后零未判类；登记条数之和自洽（必改 / 保留 / 非扫描三层）。
5. **零回归（88 面）**：`permission.task` ×12、新节**结构**、负向措辞 10 行、T4.4 映射表键集、stage-76 阴性 11 串——**逐字不变**。
6. **零行为变更（承接项）**：`model-config.ts` 仅注释行；diff 归因 100% 注释行。
7. **build 双生成物**：`templates-data` 源改动同批 `npm run build`；生成物**禁手改**；`git status --porcelain src/` ⊆ produces 清单。
8. **断言来源**：断言**直读源文件**（`templates-data/**`），不依赖部署产物。
9. **平台事实不虚构**：`Task` 能力表述**不得**超出 88 实测边界（不得写「无条件可嵌套派发」）；未实测项（深度上限 / 映射文档化）**如实留痕**。
10. **提交卫生**：精确 `git add`（禁 `-A`）；不 push / 不 publish / 不直写 `flow.json`；`ops/` 入末位 op 的 produces。

---

## 三、变更点清单（编号 T）

### T1 — 新增探索者 agent `openfeel-explorer`（4 文件 + build 纳入）

**T1.1 opencode 侧（2 文件）**：`src/core/templates-data/opencode/agents/{zh-CN,en}/openfeel-explorer.md`

- **frontmatter**（六字段，范式照 B1）：
  - `description`：zh「openfeel-explorer 探索者 Agent，只读模型，负责代码 / 资料 / 数据探查与问题定位，输出结构化结论，不产生任何副作用。」（en 同构翻译）；
  - `mode: subagent`；`model: deepseek/deepseek-flash`；`reasoning_effort`（方案期定稿，建议 `medium`——与 vision 同档，Q1）；
  - `color: "#RRGGBB"`（**未占用色**，方案期实测选定，Q2）；
  - `permission`（**5 键，键序**）：`bash: "allow"` → `read: "allow"` → `glob: "allow"` → `grep: "allow"` → `external_directory: "allow"`（**无 `task` / `edit` / `write`**；zh / en 成对）。
- **正文**（结构照 B4；**不含裸主语**）：`## 核心职责`（探索 / 调研：读代码、查资料、定位问题、数据探查；**不得**改 / 造文件）／`## 调起方式`（被任意 agent 经直接调度通道按需调用；输入 = 探查目标 + 期望返回；**先探后执行**注记）／`## 输出规范`（结构化结论：结论 + 证据（命令 / file:line）+ 不确定性；**不写盘**）／`## 能力边界`（能做：只读探查、并行探索多代码区；不做：任何写 / 改 / 删、方案制定、审查、测试、流水线 phase 推进）／`## 模型选择`（沿用尾节范式）。
- **不落**「调度与 Handoff」节（B6：只读定位）。

**T1.2 claude 侧（2 文件）**：`src/core/templates-data/claude/agents/{zh-CN,en}/openfeel-explorer.md`

- **frontmatter**（六字段，范式照 B2）：`name: openfeel-explorer`（== 文件名）；`description`（同 T1.1 语义）；`tools: Bash, Read, Glob, Grep`；`effort`（同 opencode 侧档）；`color`（claude 侧未占用名）；`model: inherit`。**禁** `mode:` / `permission:` / `reasoning_effort:` / `.opencode/`（C14 / forbiddenTokens）。
- **正文**：zh / en 各一份（同语言跨 harness 语义对应，允许既有 harness 差异词；**新增文案优先零主语**）。

**T1.3 build 纳入（零代码）**：`npm run build` 自动遍历目录 → 双注入对象（`AGENT_TEMPLATES` / `OPENCODE_AGENT_TEMPLATES` / `CLAUDE_AGENT_TEMPLATES`）自动含 10 键 + 双生成物重生成（`template-loader.ts` / `update.ts`，**禁手改**）。

### T2 — 执行者通用化 + 探索者接入收口 + 路由表更新

**T2.1 执行者探索动作改写（4 文件；R1 行号订正 + 粒度明示）**

| harness | 现状（行，实测原文；**行尾第二子句须逐字保留**） | 改为 |
|------|------|------|
| opencode **zh:88** | 「2. **探索代码**：用 `task(explore)` 并行探索代码区域。跨文件修改先用 `todowrite` 创建任务列表。」 | 仅替换探索子句 →「…用 `task(openfeel-explorer)` 并行探索代码区域（只读）。跨文件修改先用 `todowrite` 创建任务列表。」 |
| opencode **en:88**（R1 订正：初稿 `:80`） | "2. **Explore code**: Use `task(explore)` to explore code areas in parallel. For cross-file modifications, create a task list with `todowrite` first." | 仅替换探索子句 → "…Use `task(openfeel-explorer)` to explore code areas in parallel (read-only). For cross-file modifications, create a task list with `todowrite` first." |
| claude **zh:82** | 「2. **探索代码**：由**主会话**经 **Task** 工具调度 `Explore` 并行探索代码区域（subagent 不调用 Task）。跨文件修改先用 `TodoWrite` 创建任务列表。」 | 仅替换探索子句 →「2. **探索代码**：经直接调度通道派 `openfeel-explorer` 并行探索代码区域（只读）。跨文件修改先用 `TodoWrite` 创建任务列表。」（**消除**平台断言 + 消除裸主语） |
| claude **en:82** | "2. **Explore code**: The **main session** dispatches `Explore` via the **Task** tool to explore code areas in parallel (subagents do not call Task). For cross-file modifications, create a to-do list with `TodoWrite` first." | 仅替换探索子句 → "2. **Explore code**: Dispatch `openfeel-explorer` via the direct dispatch channel to explore code areas in parallel (read-only). For cross-file modifications, create a to-do list with `TodoWrite` first." |

- **粒度纪律（REV-89-003③ 明示）**：**仅替换探索子句**（第 1 句）；行尾 `todowrite` / `TodoWrite` 子句**逐字保留**（防整行替换误删指引）；改写后 4 份均**不含** `Feel` / `主会话` / `main session` 裸主语（与 88 四律同口径）。
- **harness 分叉例外**：opencode 保留 `task(...)` 调用形态（`permission.task: "allow"` 在既有键集内）；claude 侧用「直接调度通道」表述（**禁**写「Task 工具调度」——能力位不含 `Task`）；两份**不要求逐字同文**（机制词差异，§二 不变量 3 例外）。
- **注**：executor **不在** stage-88 S1 / S2 的 6 IDS 内（实测），故该行改写**无切片断言面**；但须核对 executor 既有断言（stage-76 S2 阳性串 `可达 ≠ 合法` / `plan_pending → plan_review → plan_passed → exec_running` / `review_failed → exec_running`）**不含**该行，且行尾 `todowrite` 子句为 T3.2 新增正控。

**T2.2 执行者承接面注记（4 文件，≤4 行 / 处）**

- 在「非编码小活承接」节**之后**、`## 工作规则` **之前**插入注记段（节锚点插入，禁行号）：
  - zh：「**通用承接**：通用模式下，本 Agent 亦可承接任意 Agent **直接调度**的执行任务（不限于流水线 op 与 `type: utility` 小活）；此类任务仍须**先探后执行**——需要理解现状时先由 `openfeel-explorer` 探索。」
  - en：同构翻译。
- **不加**裸主语；**不改**既有 `type: utility` 机制（与 utility 边界不重叠——设计 §5.5）。

**T2.3 探索者接入收口（28 处改写）+ feel.md 引用面收口（8 处 token 替换；R1 订正）**

- **（a）24 份「调度与 Handoff」节尾行注记**（6 subagent × 2 harness × 2 语言）：
  - zh：`> 通用工作者 = 执行者 / 探索者；直接调度 = 调度请求**直发**，不经多级转介。探索者接入见后续阶段。` → `> 通用工作者 = 执行者 / 探索者（`openfeel-explorer`，只读）；直接调度 = 调度请求**直发**，不经多级转介。`
  - en：`> General workers = executor / explorer; direct dispatch = dispatch requests are **sent directly**, without multi-level referrals. Explorer onboarding comes in a later stage.` → `> General workers = executor / explorer (`openfeel-explorer`, read-only); direct dispatch = dispatch requests are **sent directly**, without multi-level referrals.`
  - **纪律**：仅改**该行**（其余行逐字不变）；同语言跨 harness 两份**逐字同文**（保 88 S2 `===` 断言）；**无裸主语**。
- **（b）4 份 feel.md「可用 Handoff 目标」表末行——改写（非补行；R1 订正，REV-89-001②）**：
  - **核对（替代初稿「补行」）**：4 份表行**实测均在位**（zh：opencode `:127` / claude `:118`；en：opencode `:127` / claude `:118`）；en 为**小写变体**（`explorer onboarding comes in a later stage`——初稿大写敏感扫描漏检 2 处，误判「缺失」）。
  - zh（两份逐字同文）：「| 任意 Agent（含 subagent） | 通用工作者（openfeel-executor；探索者接入见后续阶段）：直接调度请求 |」→「| 任意 Agent（含 subagent） | 通用工作者（openfeel-executor / openfeel-explorer）：直接调度请求 |」（**保持表内既有无 backtick 风格**；分隔符 ` / ` 与 (a) 注记口径一致）
  - en（两份逐字同文）：「| Any Agent (including subagents) | General worker (openfeel-executor; explorer onboarding comes in a later stage): direct dispatch requests |」→「| Any Agent (including subagents) | General workers (openfeel-executor / openfeel-explorer): direct dispatch requests |」（`General worker` → `General workers`：复数与 (a) 注记 `General workers = executor / explorer` 同口径）
  - **纪律**：仅改该行；表结构（表头 2 + 数据 5 行）不变，**零补行**；两份 zh / 两份 en 跨 harness **逐字同文**。
- **（c）feel.md 引用面收口（8 处，token 级最小替换；R1 补登，REV-89-002）**：
  - 「必须委托」表行 ×4（opencode zh:60 / en:60；claude zh:51 / en:51）：opencode 侧 `**explore Agent**` → `**openfeel-explorer Agent**`（zh / en 同款）；claude 侧 ``**`Explore` subagent**`` → ``**`openfeel-explorer` subagent**``。
  - 「反例」行 ×4（opencode zh:64 / en:64；claude zh:55 / en:55）：opencode 侧 `explore Agent` → `openfeel-explorer Agent`；claude 侧 `` `Explore` subagent`` → `` `openfeel-explorer` subagent``（**保留**该行既有上下文词——claude 侧「经 **Task** 工具调度」（**主会话语境**，非 subagent 能力声明，不动）与 `openfeel-utility` 提及）。
  - **纪律**：token 级替换（保各文件既有加粗 / backtick 惯例，与同行既有 agent 名写法一致）；**不重写行内其余散文**（单写者纪律）。
  - **显式转 stage-91（登记，零动作）**：委托记录行 ×4（opencode zh:317 / en:317；claude zh:291 / en:291）——`general / explore` 举例属**审计口径面**（见 A7 / Q3）。

**T2.4 路由表更新（4 文件，行位 `:17`）**

- `agents-md/zh-CN.md:17`：第 2 列 `Feel → research（general / explore Agent）` → `Feel → research（`openfeel-explorer` Agent）`；**行数不变**、第 1 / 3 列逐字不变。
- `agents-md/en.md:17` → `The main session (Feel role) → research (`openfeel-explorer` subagent)`。
- `claude/constraint/zh-CN.md:17` → `主会话（Feel 角色）→ research（`openfeel-explorer` subagent）`（沿用既有 harness 主语「主会话（Feel 角色）」）。
- `claude/constraint/en.md:17` → `The main session (Feel role) → research (`openfeel-explorer` subagent)`。
- **阴性**：4 份路由文件内 `general` / `Explore` **零残留**（T3.2 断言）。

**T2.5 计数声明翻转（模板 10 文件；口径见表 D）**

- `agents-md/{zh-CN,en}.md`：`:87` 标题（「9 Agent 体系总览」→「10 Agent 体系总览」/「9-Agent System Overview」→「10-Agent System Overview」）；总览表**增 1 行**（zh：`| openfeel-explorer | 探索者 | 推理模型 | subagent |`；en：`| openfeel-explorer | Exploration Officer | Reasoning model | subagent |`——**行插入位 = executor 之前**，Q5）；`:105` 计数「9 个 agent」/「Each of the 9 agents」→ 10。
- `claude/constraint/{zh-CN,en}.md`：`:87` 标题 + `:89`（「> **10 agents（含主会话 `feel`）+ Task 调度**」）+ `:109`（「本框架 8 个 subagent」→ **9 个**）+ 总览表增 1 行（启动方式列 = `Claude subagent（Task 调度）`）。
- `opencode/ADAPTER.{zh-CN,en}.md`：`:3` 计数 `9 → 10`；`:8` 清单**追加 `openfeel-explorer`**（枚举序与总览表一致）。
- **纪律**：**只增行 / 只改数字**，其余逐字不变；zh / en 同文件**结构对称**。

### T3 — 断言面（新增 + 翻转 + 零回归）

**T3.1 新增：探索者只读阴性 + 结构正控（`test/core/template-loader.test.ts`「权限模型」describe 内）**

- **opencode 侧**：
  - 正控：`openfeel-explorer` × zh / en `permission` 键集 == **恰** `['bash','external_directory','glob','grep','read']`（排序后 `toEqual`——**比 `toContain` 更强**，锁「无 task / edit / write」）；
  - `external_directory` 值 `isAllow()` 为真；zh / en 键集逐 lang 一致（既有断言自动覆盖）；
  - 部署源（`OPENCODE_AGENT_TEMPLATES`）同步存在且键集一致（照既有第五条范式）。
- **claude 侧**（`test/core/claude-adapter.test.ts` 或 `templates.test.ts`）：`openfeel-explorer` frontmatter `name` == 文件名、`model` == `inherit`（既有遍历自动覆盖）；**新增** `tools` 白名单断言：**恰** `Bash, Read, Glob, Grep`（拆分后集合相等）→ 阴性 = 不含 `Edit` / `Write` / `Task` / `Skill` / `TodoWrite`。
- **正文阴性**：4 份 explorer 文件正文**不含**写动词能力表述（判据方案期定稿，防误伤说明性文字）；**不含**裸主语 `Feel` / `主会话` / `main session`。

**T3.2 新增：注册面 + 路由面 + 引用面（`templates.test.ts` 新 describe「stage-89」；R1 口径收紧）**

- **agent 注册**：`listAgentIds(zh-CN)` 含 `openfeel-explorer`；`listClaudeAgentIds` 同；
- **路由正控**：4 份路由文件（`agents-md/{zh,en}` + `claude/constraint/{zh,en}`）均含 `openfeel-explorer`；
- **路由阴性**：4 份文件内 `general / explore` 类路由串**零命中**（**路由行 scoped + 大小写敏感**；第 1 / 3 列存量 `exploration` 与 `:41` `explore independently` **非命中面，保留**）；
- **占位零残留（大小写不敏感）**：全 `templates-data/**` 内「探索者接入见后续阶段」+ **`/explorer onboarding comes in a later stage/i`** 零命中（替代 C11 的阴性面，**更强**）；断言实现须含 `i` 标志或显式并列小写变体——**R1 教训**：初稿大写敏感口径下 en 表行 2 处小写变体将**逃过扫描**（测试绿、实际残留）；
- **feel.md 引用面**：4 份 feel.md 均含 `openfeel-explorer`（正控）；token 阴性 **scoped**：`explore Agent`（opencode 侧）/ `` `Explore` subagent``（claude 侧）**零残留**——委托记录行（显式转 91）与 en `general workers` 术语**不在该扫描面**（防误伤，登记见 A7）；
- **executor 面**：4 份 executor 模板含 `openfeel-explorer`（探索动作已指向）；claude 侧**不含**「subagent 不调用 Task」/「subagents do not call Task」（REV-88-009 ① 落实）；4 份行尾 **`todowrite` / `TodoWrite` 子句正控在位**（防整行替换误删，REV-89-003③）。

**T3.3 计数翻转（测试面 22 项〔12 + 5 + 5〕+ 附属 23 处 + 代码 1 处——见表 C / D）**

- 逐一按表 D 执行：字面量 **12** + 派生总数 **5** + 显式面 **5**（⑱~㉒：白名单逐名 / 前缀计数 `8→9` / `update` 逐名 / `model-config` / `model.test`）+ 附属 **23 处**（用例名 / 注释，逐文件见 表 D）。
- **双路扫描复核**：标准正则（`9 个 agent` / `9个 Agent` / `9 Agent` / `9 agents` / `9×2` / `9-Agent`）+ 宽词界扫描（test/ 内 `\b9\b` 命中，**含 fast 表 9 条目 / 循环变量等非 agent 计数**）→ **差集逐处判类**（必改 / 保留 / 非扫描），登记条数自洽（表 D 附属 / 非扫描层）。
- **`src/` 侧**：仅 `model-config.ts:411` 注释行（其余命中为生成物 `template-loader.ts` / `update.ts` —— 随 build 重生成，**禁手改**）。

**T3.4 零回归（A4 面，零改写）**

- stage-88：A1（`permission.task` ×12）/ A2（跨 harness 切片 `===`，含新注记行）/ A3（负向 10 行）/ T4.4（映射表 10 键）**全绿**；
- stage-76：S1-S4（含 37 份阴性 11 串扫描）；
- stage-84 / stage-69 既有断言零改写；
- `test/core/templates.test.ts` 的 stage-88 describe **允许且仅允许** C11 / C12 两处登记翻转（提交信息与 §九 记录，附差额对照）。

**T3.5 build 双生成物（同批）**

- `npm run build` 重生成 `template-loader.ts` + `update.ts`；`git status --porcelain src/` ⊆ produces 清单；`npm run build` ×2 幂等（sha256 稳定）。

### T4 — REV-88-009 承接处置（阶段内，与 T2 / T3 同批）

**T4.1 ① 平台事实重述（claude executor ×2）**

- 落点：`claude/agents/{zh-CN,en}/openfeel-executor.md:82`（T2.1 同批改写）；**改写后**该行不再含平台断言（事实面按 2.1.300 + 本框架不启用 `Task` 的实际状态表述）。
- **断言翻转（R1 锚点明文）**：`templates.test.ts:583-584` 的 `toContain('（subagent 不调用 Task）')` / `toContain('(subagents do not call Task)')` → **① 新正控** `toContain('openfeel-explorer')`（同两份 claude executor 正文）+ **② 阴性** `not.toContain('不调用 Task')` / `not.toContain('do not call Task')`。**禁静默删除**：须在本计划 §九 与提交信息中留「旧断言 → 新断言」差额对照（新面由 ① 正控 + ② 阴性构成，**严格强于**原断言）。
- **语义完备性核对**：`rg` 全仓 `src/` 对「不调用 Task」/「do not call Task」归零（登记未改面：`skills/openfeel-get-stage-status/SKILL.md:71`「subagent 不互调」→ **转 stage-91**，见 Q3）。

**T4.2 ② kb supersede 证据指针（零写盘）**

- 本阶段**不写 kb**；在阶段报告登记指针：`kb/troubleshooting.md:1088`（原条 supersede）+ `:1097`（新继承条目）+ `kb/patterns.md:3426`；判据源 = 88 `ops/op-001-verdict.md` §8.1 / §10.3 + 终局报告 §1.2。**归档轮**补沉新增条目（只读工作者架构 + 占位收口模式）。

**T4.3 ③ 能力决策成文（Task 不启用）**

- 落点为**文档 / 记录**（登记于阶段报告 + 本计划 §二「Task 能力决策」）；**模板能力位零变更**（claude `tools` 不含 `Task`）；
- **残留风险登记**（承 88 op-001 §10.3）：单版本实测（2.1.300）/ 深度上限未测 / `Task` 与 `Agent` 映射未文档化 → 未来启用前须**重新实测**（kb #平台能力实测先行）；
- **可逆性**：启用 = 4 文件白名单 + 断言 + 文案同批（单点面已界定）。

### T5 — 门禁收口（阶段末 op）

| 项 | 口径 |
|------|------|
| `npm run build` ×2 | 幂等；`git status --porcelain src/` ⊆ produces 清单 |
| `npm test` | **0 skipped / 0 failed**；**新基线显式登记**（71 文件 / 1620 + 本阶段新增用例） |
| `npx tsc --noEmit` | 0 |
| `openfeel lint i18n` | **931 不变**（无 i18n 键变更）——如有变化须显式说明 |
| `openfeel lint kb` | 0 |
| 计数扫描 | 双路扫描差集逐处判类；登记条数自洽（表 D 口径） |
| 零行为变更 | `model-config.ts` `git diff --numstat` 归因 100% 注释行 |
| `--version` | **1.2.0**（本阶段不改） |
| `ops/` 入管 | `.openfeel/plan/v1/stage-89/ops/**` 纳入 `git add` 精确清单（承 88 T3.3 制度性修复） |

---

## 四、开放问题（方案期 / 执行期定稿）

- **Q1 探索者模型与思考档位**。建议 `deepseek/deepseek-flash` + `reasoning_effort: medium`（与 vision 同档、只读探查成本敏感）；若方案期认为探查质量需更高档 → 与用户确认（**模型配置属部署侧可调项**——参考 v1.2.1 大计划 §七.7 对 model 档位的口径）。
- **Q2 探索者颜色**。opencode 六角 + claude 名各取**未占用**值（实测占用见 B3）；建议 opencode `#FFB020`（琥珀）/ claude `yellow`（探索 / 探照灯联想）——**方案期实测确认未占用**。
- **Q3 `general` / `explore` 残留面的去向（R1 重订）**。本阶段改写面 = 路由表 4（T2.4）+ executor 4（T2.1）+ feel 表末行 4（T2.3(b)）+ **feel「必须委托」表行 4 + 「反例」行 4（T2.3(c)，R1 新增）**；**显式转 stage-91（登记，零灭失）** = ① feel ×4「委托记录」行的 `general / explore` 举例（**审计口径面**）；② `skills/openfeel-tool-usage` 的 `task(explore)` / `task(general)` 与触发条件「委托 general」（**工具面**）；③ `skills/openfeel-get-stage-status/SKILL.md:71`「subagent 不互调」（承 88 T2.3(a)④）。**判据**：②③ 为工具 / 口径举例面，属 91 收编；① 举例属审计口径，本阶段不扩面（**二选一已裁定：转 91**，逐处去向不留空白）；**④ 已撤销**——初稿拟转 91 的「必须委托」表行实测 ×4（含 en ×2）且属**路由 / 能力声明**，REV-89-002 指出其与本阶段路由替代直接相关 → **改判本阶段改写**（T2.3(c)）。
- **Q4 探索者是否落「调度与 Handoff」节**。建议**不落**（只读定位；调度语义由「先探后执行」注记承载，B6）；若方案期认为需与其余 6 份 subagent 对齐 → 须**同步扩展** stage-88 S1 / S2 的 IDS 数组（6→7）并保零 harness 主语（增量面）。
- **Q5 总览表新增行的插入位**。建议 **executor 之前**（与流水线调度序 + 设计 §5.2 / §5.3 叙述序一致）；`ADAPTER` 清单同序。**不影响任何既有断言**（无表行序断言），但须 zh / en 同序。
- **Q6 feel 侧「必须委托」表行是否本阶段改写（R1 定稿：本阶段改写）**。实测 ×**4**（opencode zh:60 / en:60；claude zh:51 / en:51——含 en ×2，初稿漏登）；该行为**路由 / 能力声明**（与 agents-md 路由表同性质），与本阶段路由替代直接相关 → **本阶段 token 级替换**（T2.3(c)）；「反例」行 ×4 同批（REV-89-002：`Explore` 相关行不宜无去向地转 91）。**逐处去向不留空白**（A7）。
- **Q7 en 版 feel.md 表末行「缺失」判定（R1 撤销）**。**实测订正**：en 2 份**均在位**（opencode `:127` / claude `:118`；小写变体 `explorer onboarding comes in a later stage`）——初稿大写敏感正则漏检致误判「缺失 / 88 遗留缺陷」；本阶段**不补行、只改写**（T2.3(b)）；该差异系**本轮扫描方法发现**，阶段报告登记**扫描口径教训**（大小写不敏感，见 §六 R-89-11）。

---

## 五、验收要点（阶段级）

1. **探索者可加载（4 文件）**：双 harness × 双语言文件在位；opencode frontmatter 六字段齐备 + permission 键集**恰** `bash / read / glob / grep / external_directory`；claude frontmatter 六字段齐备 + `tools` **恰** `Bash, Read, Glob, Grep` + `model: inherit` + 无 forbiddenTokens；build 单源一致性通过（三对象键集 10）。
2. **只读阴性**：探索者**无任何写 / 派发能力**（工具集 + permission + 正文三处一致）；正文无裸主语；`bash` 用途在正文有「只读用途」限定表述（承 vision 先例「bash 用途说明」）。
3. **执行者通用化**：4 份 executor 探索动作指向 `openfeel-explorer`；承接面注记在位（≤4 行）；`type: utility` 机制与工具集**零改动**；claude 侧平台断言**已消解**。
4. **接入收口**：28 处**改写**完成（**零补行**）；全仓**零占位残留**（**大小写不敏感**——扫描 / 断言同口径）；同语言跨 harness 注记行**逐字同文**（切片 `===`）；feel 表末行 **4 份均在位**并改写（en 小写变体订正，非补行）；feel「必须委托」表行 / 「反例」行 **8 处 token 替换**完成（`explore Agent` / `` `Explore` subagent`` 零残留）+ 委托记录行 4 处转 91 登记在册。
5. **路由表与路由面**：4 份路由行指向 `openfeel-explorer`；4 份路由文件内 `general` / `Explore` 零残留；行数不变；feel.md 能力面 token（`explore Agent` / `` `Explore` subagent``）零残留（scoped 阴性断言；术语 `general workers` 与委托记录行不在扫描面）。
6. **计数全枚举**：agent 9→10 的声明 / 表行 / 派生总数 / 白名单 / 注释**全部翻转**（表 D 测试 **22 项逐项可追溯**：字面量 12 + 派生 5 + 显式面 5）；双路扫描差集逐处判类、条数自洽（附属 23 处 + 保留 / 非扫描层含 cli-usage 快照行与 fast 表 9 条目——**非 agent 计数，禁误改**）；`setup`（29 / 59）、`update`（30）、`model-config`（10）派生值一致。
7. **REV-88-009 承接**：① 平台事实重述落地（模板 + 断言翻转，差额对照留痕）；② kb 指针登记（零写盘）；③ 能力决策成文（不启用 + 残留风险 + 可逆面）；三件套**零灭失**。
8. **零回归 + 门禁**：stage-88 A1~A4 / stage-76 S1~S4 / stage-84 / stage-69 全绿（仅 C11 / C12 两处登记翻转）；`npm test` 0 skipped / 0 failed（新基线登记）；`tsc` 0；`lint i18n` 931 不变；`lint kb` 0；build ×2 幂等；`--version` 1.2.0；`ops/` 入管。

## 六、风险

| # | 风险 | 影响 | 缓解 |
|:-:|------|------|------|
| R-89-1 | **计数翻转漏面**（派生总数 28 / 29 / 57 不含 9；白名单枚举形态） | 中 | 表 D 全枚举清单 + 双路扫描差集 + 分层判类登记自洽（kb 先例）；`setup` / `update` 派生值逐项复核 |
| R-89-2 | **占位收口遗漏**（实测 zh 14 / en 14；en 表行**小写变体**，初稿大写敏感口径漏检） | 中 | A2 逐文件清单 + **零残留**断言（全 `templates-data/**`，**大小写不敏感**——扫描 / 断言同口径）+ 28 处改写清单核对；4 份表行在位核对（零补行）如实登记 |
| R-89-3 | **探索者只读性被削弱**（顺手加 `Skill` / `TodoWrite` / `task`） | 中 | 键集 / 工具集**精确相等**断言（非 `toContain`）+ 三处一致核对（frontmatter / 正文 / 断言） |
| R-89-4 | **88 断言静默弱化**（C11 / C12 翻转被做成删除或放宽） | 高 | 翻转**必须**附「旧断言 → 新断言」差额对照 + 新断言**严格强于**旧断言（阴性→正控 + 全仓零残留）；独立 op + 审查逐条核对 |
| R-89-5 | **Task 能力决策越界**（把「可嵌套」写成既成能力） | 中 | 边界 4：模板能力位零变更；表述限于实测边界；残留风险成文；文案禁「无条件可派发」 |
| R-89-6 | **跨 harness / 语言对称破坏**（注记行改写引入 harness 差异词或裸主语） | 中 | 四律 + 同语言跨 harness 逐字同文 + 裸主语零出现断言（88 既有断言自动覆盖新文本） |
| R-89-7 | **build 双生成物遗漏**（源改生成物未改 / 手改生成物） | 中 | 同批 `npm run build` + `--porcelain` ⊆ produces + ×2 幂等（kb 先例） |
| R-89-8 | **单写者纪律越界**（顺手重写 executor / 约束层散文 → 与 91 二次改写冲突） | 中 | 边界 3：新增 / 改写块 ≤10 行；审查核对 diff 仅「新文件 + 单行替换 + 表行 / 注记」 |
| R-89-9 | **模型 / 颜色决策失当**（颜色与既有冲突 / 档位与探查质量不匹配） | 低 | Q1 / Q2 方案期实测确认（占用表实证）；模型为部署侧可调项（不锁死） |
| R-89-10 | **路由替换造成隐性断链**（其他文案仍指 `general` / `Explore` 而能力已移除） | 低 | A7 逐处去向（本阶段改写 12 / 转 91 4，零空白）；零灭失登记核对 + feel 面 scoped 阴性断言（T3.2） |
| R-89-11 | **扫描 / 断言口径与存量文本变体面不一致**（大小写、宽窄词界）→ 漏检 → 「零残留」**静默假绿**（R1 实证：en 表行小写变体 + 大写敏感正则） | 高 | 凡存在变体面的扫描：存量枚举、断言、复核**三处同口径**（`rg -i` / 正则 `i` 标志）；存量变体**逐处实测登记**（A2）；T3.2 断言须自带变体面（小写变体显式入检索词） |

**回滚**：新增 4 文件删除即回落（无引用面残留——**占位注记与路由行须同批 revert**）；注记 / 路由 / 计数为**行级替换**（可逐行 revert）；断言翻转可 revert 至 stage-88 版本（旧断言仍在 git 历史）；生成物随源回滚 + build 重生成。**无数据格式破坏**。

## 七、承接 REV 与处置表（REV-85-002 固化口径；判据源 = 上游台账文件）

- **判据源**：`.openfeel/users/Liuary/code_review/REV-88.md`（REV-88-001~008 + 011 `closed`；**009 / 010 `pending`**）+ `.openfeel/code_review/v1.2.1-stage-88.md`（遗留节）。

| 上游条目 | 优先级 | 去向 | 依据 |
|---------|:--:|------|------|
| **REV-88-009** ① 平台事实重述（claude executor「（subagent 不调用 Task）」×2） | medium | **本阶段处置**（T4.1：模板改写 + 断言显式翻转 + 差额对照） | 上游裁定「建议 stage-89 计划期显式承接」（其本就触及 claude agent 数翻转与 C10 断言面，同批复核避免两次翻转） |
| **REV-88-009** ② kb supersede | medium | **已闭合（上游归档轮）**，本阶段**零写盘**仅登记指针（T4.2） | 实测：`kb/troubleshooting.md:1088`（supersede 五要素）+ `:1097`（新继承条目）+ `kb/patterns.md:3426` |
| **REV-88-009** ③ 能力决策（`Task` 入白名单？） | medium | **本阶段处置**（T4.3：**裁定不启用** + 决策成文 + 残留风险登记 + 可逆面界定） | 上游裁定「转后续阶段」；本阶段为该项的**收口轮**（边界 4 四理由） |
| **REV-88-009** ④ 判据源留痕 | medium | **本阶段处置**（引 88 `ops/op-001-verdict.md` §8.1 / §10.3 + 终局报告 §1.2 为判据源；本计划 §一 表 E） | 上游裁定「三处留痕为 stage-89 计划期判据源」 |
| **REV-88-010**（`src/commands/req.ts` `req show --json` 硬编码 help 文案缺 `parent, children`） | low | **显式转后续**（**stage-93 收官轮**） | 上游明示「建议 stage-93 收官轮或下一批含 req 面的小修同批订正（纯文案一行，勿在当前阶段扩面）」——本阶段面无 req 面，**不扩面** |
| **REV-86-009 / REV-86-010** | low | **台账保留·销账维持**（v1.2.1 收官轮〔93〕或 v1.3.0） | 88 已同口径转出；本阶段非其面，**维持去向，零重复登记** |

- **三分结论**：本阶段处置 **4**（REV-88-009 四小项）/ 已闭合 **1**（②，上游完成）/ 显式转后续 **1**（REV-88-010 → 93）/ 台账保留 **2**（REV-86-009 / 010）→ **零灭失**成立。**R1 复核面（REV-89-002）**：feel.md 引用面 **16 处**逐处去向（本阶段改写 12 + 转 91 4），零空白；**本阶段自身计划审查 REV-89-001~004 处置见 §十**。
- **产出清单双向偏差登记（供 deps.yaml 后续同步与阶段对账）**：

| 面 | 条目 | 说明 |
|----|------|------|
| **增补面**（deps 缺 / 实际改动） | ① `opencode/ADAPTER.{zh-CN,en}.md`（2）② `{opencode,claude}/agents/{zh-CN,en}/openfeel-{planner,schemer,reviewer,archiver,utility,vision}.md`（24：占位注记行）③ `{opencode,claude}/agents/{zh-CN,en}/feel.md`（4 文件；**12 处文本动作** = 表末行改写 4〔**零补行**，R1 订正〕+ 「必须委托」表行 4 + 「反例」行 4；另委托记录行 4 显式转 91，R1 补登）④ `src/core/model-config.ts`（1：JSDoc）⑤ `test/core/model-config.test.ts`（1）⑥ `test/commands/model.test.ts`（1）⑦ `.openfeel/plan/v1/stage-89/ops/**`（1 目录） | ①~⑦ 见 T2.3 / T2.5 / T3.3 / T5；③ 的 R1 变更见 §十（REV-89-001/002） |
| **移除面**（deps 有 / 本阶段考虑后零触碰） | `skills/openfeel-tool-usage/SKILL.md`（**不在 deps**，实为**显式不触碰**——Q3 转 91） | 88 T2.4 已最小增补；本阶段 Q3 裁定转 91 收编（避免与 91 撞车） |
| **阴性面**（不在本轮改动清单） | `openfeel-utility` / `openfeel-feel-tester` / `openfeel-vision` 的 permission 与工具集；`skills/**`（除断言直读）；`src/core/i18n-data/**`；`src/commands/**`；README / docs / manual / CHANGELOG | 计数翻转断言锁定；i18n 零新键（931 不变）；文档面归 93 |

## 八、op 拆分建议（供 openfeel-schemer 定稿；`est_ops = 3`）

| op | 内容 | 文件（实际名） | 依赖 |
|:--:|------|------|------|
| `op-001` | **T1 + T2.4 / T2.5 前半**：新增探索者 4 文件（frontmatter 结构化映射 + 正文，含只读阴性内建）+ 路由表 4 文件更新 + build 双生成物 | `src/core/templates-data/{opencode,claude}/agents/{zh-CN,en}/openfeel-explorer.md` / `agents-md/{zh-CN,en}.md` / `claude/constraint/{zh-CN,en}.md` / `src/core/template-loader.ts` / `src/core/update.ts` | — |
| `op-002` | **T2.1~T2.3 + T2.5 后半**：执行者探索动作改写（4）+ 承接面注记（4）+ 接入收口 28 处（**全为改写**）+ **feel 引用面 8 处 token 替换（T2.3(c)）** + 计数声明翻转（ADAPTER 2 + 约束层计数 / 表行）+ `model-config.ts` JSDoc + **T3 断言面**（新增 describe / 精确键集 / 路由正控与阴性 / 零残留 / 计数翻转 / C11+C12 显式翻转）+ build 双生成物 | 24+4 模板 / `opencode/ADAPTER.{zh-CN,en}.md` / `agents-md/{zh-CN,en}.md` / `claude/constraint/{zh-CN,en}.md` / `src/core/model-config.ts` / `test/core/{templates,template-loader,claude-adapter,setup,update,model-config}.test.ts` / `test/commands/model.test.ts` / 生成物 | hard: op-001（新 agent 名须先存在——零悬空引用） |
| `op-003` | **T4 承接 + T5 门禁**：REV-88-009 三件套留痕与登记（差额对照）/ REV-88-010 转出登记 + `npm run build` ×2 + `npm test` + `tsc` + `lint i18n` / `lint kb` + 计数双路扫描差集复核 + 零行为变更 diff 归因 + 阶段门禁报告（**阶段末 op**）+ `.openfeel/plan/v1/stage-89/ops/**` 入管 | 门禁全量 + `.openfeel/plan/v1/stage-89/ops/**` | hard: op-002 |

- **文件冲突（`mutual_exclusion` 提示）**：op-001 与 op-002 **有同文件交集**（`agents-md` / `claude/constraint` 两轮改动）→ 若并行须**行级互斥**（op-001 只动路由行 `:17`，op-002 动标题 / 表行 / 计数）——**建议串行**（消除同文件并发写风险）；op-003 门禁须在 op-002 的 build 之后（实际串行）。
- **op 级依赖与文件清单由 openfeel-schemer 落 `ops/deps.yaml`**（hard / soft / mutual_exclusion，声明实际文件名）。

## 九、修订记录

| 时间 | 制定人 | 说明 |
|------|--------|------|
| 2026-10-15 | openfeel-planner | 初稿：依据大计划 `.openfeel/plan/v1/v1.2.1/plan.md`（附录 A「stage-89 通用工作者：探索者与执行者」+ §二 表 C + §三 裁定 I / J / O + §十 开放问题）+ 设计 `docs/v1.2.1-design.md` §6「主题三：简化通用任务」（其内小节 §5.1~§5.5）+ `deps.yaml` stage-89 notes + **REV-88-009（Q1 反转裁定四小项）**；源码复核 5 表 46 项（新增/收口面 A1~A9、模板规范 B1~B6、断言面 C1~C15、计数全枚举 D、REV 承接 E1~E4）；T1~T5（含只读阴性、占位收口 28 处、路由替换、计数 40 动作、断言翻转差额对照）；Q1~Q7；风险 R-89-1~10；承接表（处置 4 / 已闭合 1 / 转后续 1 / 保留 2，零灭失）。**只写本计划文档**（未改源码 / 未改 deps.yaml / 未直写 flow.json / 未推进 phase / 未写其它阶段文件）。 |
| 2026-10-15 | openfeel-planner | **R1（计划审查退回处置）**：逐条修订 REV-89-001~004（A2 计数 26→28 + `-i` 口径；T2.3(b) 撤销「补行」改 4 处改写；T3.2 零残留断言大小写不敏感；A7/Q3/Q6/§七 补登 feel 引用面 16 处并逐处去向〔新增 T2.3(c) 8 处 token 替换〕；A4 en 行号 `:88` 与 C11 `:543` 订正 + T2.1 粒度明示〔仅探索子句，行尾 todowrite 子句逐字保留〕；表 D 测试 22 逐项列名〔12+5+5〕+ 附属 23 处 + 非扫描层补登〔cli-usage 快照行 / fast 表 9 条目 / setup·update 注释实测行号〕）；新增 §二 不变量 3 harness 分叉例外、R-89-11、§十 处置表。**只写本计划文档**。 |
| 2026-10-15 | openfeel-executor | **REV-89-005 吸收（D-89-6）**：路由阴性定界为**路由行 scoped + 大小写敏感**（T3.2 行补限定；与占位面大小写不敏感显式分野——该窄则窄 / 该宽则宽）+ A7 行补登 4 处存量非命中（第 1 / 3 列 `exploration` / `:41` `explore independently`，零动作保留）。**只写本计划文档**（未改源码 / 未改 deps.yaml / 未直写 flow.json / 未推进 phase）。 |

## 十、计划审查 REV 处置（R1 — 计划审查退回轮）

> 审查报告：`.openfeel/users/Liuary/code_review/REV-89.md`（2 blocking + 2 非阻塞）。**四条全处置**，零遗留；本轮修订仅改本文件（未改源码 / 未改 deps.yaml / 未直写 flow.json / 未推进 phase / 未写其它阶段文件）。

| REV | 优先级 | 处置（落点） |
|-----|:--:|------|
| **REV-89-001** | high · blocking | ① 表 A **A2 计数 26→28**（`-i` 口径；en 表行**实测在位**）；② **T2.3(b) 撤销「补行」→ 4 处改写**（Q7 定性撤销，改记「扫描方法发现」）；③ **T3.2 零残留断言大小写不敏感**（显式含小写变体 / `i` 标志）；④ R-89-2 / §五.4 / §七 增补面同步 + 新增 **R-89-11**（存量枚举 / 断言 / 复核三处同口径） |
| **REV-89-002** | medium · blocking | **A7 全量补登 feel 引用面 16 处**（「必须委托」表行 ×4〔含 en ×2〕+ 「反例」行 ×4；术语 `general workers` 非命中登记）+ Q3④ 撤销改判、Q6 定稿「本阶段改写」+ §七 增补面 ③ 同步；新增 **T2.3(c)**（8 处 token 级替换）与 T3.2 feel 面 scoped 阴性断言 |
| **REV-89-003** | low | ① A4 opencode en 行号 **`:80 → :88`**；② C11 断言本体订正 **`:543`**（`:508-511` 为 describe 头注释）；③ T2.1 新增**粒度纪律**（仅替换探索子句；行尾 `todowrite` / `TodoWrite` 子句逐字保留）+ T3.2 增行尾正控 |
| **REV-89-004** | low | 表 D 测试 **22 逐项列名**（字面量 12 + 派生 5 + 显式面 5 = 22，全可差集核对）；附属 **23 处**单列；非扫描层同步补登（cli-usage `:186` 快照行 / fast 表 9 条目 / `setup.ts:3/:49/:106`·`update.ts:1993/:2004` 实测行号——初稿 `setup.ts:112` 订正） |
| **本轮自订正（超出 REV 字面，同纪律）** | — | ① 表 D 非扫描层由「等 / 可择机」改为**逐条可追溯**（闭合「零未判类」）；② §二 不变量 3 增补 **executor 行 harness 分叉例外**（防误求逐字同文）；③ T4.1 断言翻转**锚点明文**（正控 + 阴性双断言，严格强于旧断言）；④ T2.1 表补 4 份原文行（逐字保留依据） |
| **REV-89-005** | low · 非阻塞 | **本阶段吸收（D-89-6）**：T3.2 行补「**路由行 scoped + 大小写敏感**」定界 + A7 行补登 4 处存量非命中（第 1 / 3 列 `exploration` / `:41` `explore independently`）；占位面保持**大小写不敏感**（两处**显式分野**）；落地 = op-001 §1.9 ③ + op-002 §2.6 ①；台账 `resolved`（**`closed` 归 openfeel-reviewer** 代码审查轮） |

- **逐 REV 结论**：001 已处置 / 002 已处置 / 003 已处置 / 004 已处置（全处置，无遗留）；REV-89-001~004 的台账状态流转由**主会话**按流水线约定处理（本 Agent 不直写台账 / flow.json）。
