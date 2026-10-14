
# v1.2.1-stage-88 计划 — 通用工作者直接调度机制（主题二）

- **阶段**：`v1.2.1-stage-88`（七主题之二 · 通用工作者直接调度）
- **依赖**：**hard: `v1.2.1-stage-87`**（大计划 §四 依赖图 + `deps.yaml`）。实质 = **顺序 + 语义冻结**（设计 §9 S3 依赖 S2）；功能面无代码级依赖——本阶段改造面为**模板层**（`templates-data/**`），87 的 `req` 命令面不参与本阶段产物的功能链。设计对两套机制的区分（§2.2 vs §2.4）须先在 87 冻结「接取制度」语义，本阶段才落地「**直接调度**」——否则两套机制混淆。
- **优先级**：P0
- **制定人**：openfeel-planner ｜ **制定时间**：2026-10-15 ｜ **修订轮**：**修订 1**（计划审查退回 → 处置 REV-88-001~004；修订点与依据见 §九）
- **基线**：**HEAD `a207a30`**（stage-87 归档提交「chore: 阶段归档 v1.2.1-stage-87」；op 收口 `b3c4df3`。全表实测；文中行号/键值均以该基线为准）
- **上游基线（stage-87 归档登记值）**：测试 **71 文件 / 1614 用例** 0 skipped / 0 failed；`npx tsc --noEmit` = 0；`openfeel lint i18n` = **931**；`lint kb` = 0；build ×2 幂等；`--version` = **1.2.0**（本阶段不改版本，归 stage-93）；flow.json `revision 1093` / `requirements: 0` / 活跃阶段 17（v1.2.1-stage-86/87 已 done，88~93 全 `plan_pending`）。
- **定位**：把设计 §2.2「**Agent 自治调度**」从原则落为**可执行机制**——**任意 Agent 均可直接调度通用工作者**（执行者/探索者），不经多级转介。设计原文冲击的现行硬规则是「**subagent 不调用 Task / 仅主会话（Feel）编排**」两条；新语义 = 「**调度请求直发**，不经多级转介」。因两 harness 平台能力不同，机制呈**双口径**：opencode 侧 = 嵌套 `task`（permission 授权扩展，**须先隔离实测 go/no-go**）；Claude Code 侧 = 平台不支持嵌套 Task（v1.1.6-stage-69 Q1 实证）→ **降级通道** = `[HANDOFF: agent_name]` 直发 + 主会话即到即派。**与需求接取制度（stage-87）是两套机制**：本阶段针对**通用工作者**（可被任意 Agent 直接调度），不针对需求（需求仍由 feel 中介，裁定 G）。
- **范围（文件级）**：
  - `src/core/templates-data/opencode/agents/{zh-CN,en}/openfeel-{planner,schemer,reviewer,archiver,utility,vision}.md`（**12 文件**：permission 扩展 + 「调度与 Handoff」节 + 措辞规整）
  - `src/core/templates-data/claude/agents/{zh-CN,en}/openfeel-{planner,schemer,reviewer,archiver,utility,vision}.md`（**12 文件**：同节落文 + 措辞规整；**frontmatter `tools` 白名单不改**——平台客观限制）
  - `src/core/templates-data/{opencode,claude}/agents/{zh-CN,en}/feel.md`（**4 文件**：Handoff 目标表扩展 + 直发语义注记）
  - `src/core/templates-data/skills/openfeel-tool-usage/SKILL.md`（**1 文件**：「task — 子 Agent 调度」条目语义增补，最小追加）
  - `src/core/template-loader.ts` + `src/core/update.ts`（build **双生成物**重生成，**禁手改**）
  - `test/core/template-loader.test.ts` + `test/core/templates.test.ts`（权限断言 + 跨 harness 切片对称 + 阴性断言）
  - `src/core/i18n-data/{zh-CN,en}.ts`（**仅 op-003 承接项**：`help.req.show.json` 描述串订正——REV-87-008；**无新键**，`lint i18n` 931 不变）
  - `src/core/req/body-file.ts`（**仅 op-003 承接项**：JSDoc 订正——REV-87-009；零行为变更）
- **边界**：
  1. **不虚构平台能力（降级红线，裁定 H）**：实测先行；**未获认证/环境受限时不得声称「实测通过」**，须标注「未实测（环境限制）→ 保守默认留痕」（kb #Claude Code 实机验证方法 判据）。若两 harness 嵌套调度均不可行 → **统一 Handoff 中介**并如实留痕，不虚构能力。
  2. **不改 Claude 侧 `tools` 白名单**：subagent 不可调 Task 为平台事实（Q1）；本阶段**不加 `Task` 入白名单**（加了亦不生效，且会污染模板语义与断言面）。
  3. **不引用未存在的 agent**：`openfeel-explorer` 归 **stage-89** 新增——本阶段所有新增文案引用的 Agent 名**仅限既有**（`openfeel-executor`；`openfeel-feel-tester` 以「**非通用工作者**」口径并列表述——**分类学定稿，REV-88-002**）；「探索者」仅作概念表述（不带 agent 名）。explorer 接入归 stage-89（**零悬空引用纪律**）。
  4. **单写者纪律（裁定 J）**：本阶段只做**最小必要落文**（新增/规整功能性子句），**不做散文重写**；36+4 文件的索引壳化收编归 **stage-91**。新增节长度 ≤10 行。
  5. **计数与动态节零触碰**：agent 数 **9**、skills **18**、`claude/constraint` 与 `agents-md` 的 agent 表/路由表/「仅主会话编排」行**全归 stage-89**（9→10 全枚举翻转 + 路由更新）；本阶段**不改任何计数**（**REV-88-004 移除面登记见 §七**）。
  6. **不引入第三方依赖**；不改 `build.js`；不改 `.opencode/opencode.json`（本仓 fixture）；不改 `flow.json` 结构与 phase 枚举（15）。
  7. **不做并行编排契约与组合转移复用**（归 stage-92）；不做需求级模式属性（归 stage-90）；不做审查档位（归 stage-92）。
  8. 本阶段**不改版本号**（`--version` 保持 1.2.0）；README / docs / CHANGELOG / manual / cli-usage skill 快照归 stage-93；manual 更新归归档轮（归档官）。
  9. 不 `npm publish`、不 `git push`；**不直写 `flow.json`**；不推进 phase（由 Feel 经 CLI 执行）；提交精确 `git add`（禁 `-A`——kb #方案层 ops 产出的审计链完整性）。

## KB 检索（`openfeel-check-kb`）

已加载 `.openfeel/kb/index.md`（architecture 44 / patterns 184 / troubleshooting 64 / setup 6）。**高度相关条目**：

- `kb/patterns.md #跨 Agent Handoff 委派原语模式（[HANDOFF: agent_name]，Feel 自动解析，零 CLI 新增）` → **本阶段核心机制基础**：标记格式固定 `[HANDOFF: agent_name]`（Feel 按正则解析）、四条「来源 Agent × 可委派目标」表、Agent 侧落「## Handoff」节——直接调度通道 = 在同一原语上扩展**目标与语义**（不需新基础设施）。
- `kb/troubleshooting.md #Claude Code 实机验证方法与行为事实（隔离 config + settings.json 派发 subagent）` → ① **Q1 subagent 不可调 Task**（平台事实基线）② 隔离 config 无认证 → `Not logged in` **无法派发**，须**复制作数认证 + settings.json** 后方可实机 ③ 判据 = 受限环境按**保守默认**留痕并如实标注「未实机」，**不得与「实测通过」混同**——本阶段 T1 的验收口径与降级红线来源。
- `kb/patterns.md #隔离 HOME 实测 opencode 行为的方法：双设 HOME/USERPROFILE + debug paths 断言 + 零污染核对` → **opencode 侧实测方法**四步法（双设 `HOME`/`USERPROFILE` → `opencode debug paths` 断言隔离生效 → `debug agent`/`run` 双向印证 → 零污染核对）；**工具局限**（`debug agent` 对 `ask` 自动放行、仅强制 `deny`；ask 判别**必须**用 `opencode run`）。
- `kb/patterns.md #跨 harness × 语言模板对称纪律：提取式切片字节等值 + 节锚点插入 + 无裸主语` → 本阶段 24+4 模板改造的**四律**：节锚点插入（禁按行号）｜同语言跨 harness **提取式切片** `===` 逐字等值（切片非空前置防假绿）｜**无裸主语**（同语言两份一致的结构性保证）｜按 harness 替换主语。
- `kb/patterns.md #Agent 模板模式感知落法：节锚点插入 + 同语言跨 harness 逐字一致 + 按 harness 替换主语` → REV-76-010/013 先例（裸 `Feel` 主语破坏同语言 4 份一致；行号定位因前序插入失效）。
- `kb/troubleshooting.md #改 templates-data 源须同批重生成「双生成物」（template-loader.ts + update.ts）` + `kb/patterns.md #零行为变更改造的验证方法（diff 归因 + build 幂等 + 命令输出对比）` → 模板改造必须同批 `npm run build`；生成物禁手改；纯文案改造用 diff 归因取证。
- `kb/patterns.md #模板断言的保护边界（build 注入常量 vs 源文件直读）` + `kb/troubleshooting.md #平台分节中立化的「原文搬家 vs 探针式改写」陷阱` → 断言策略：**源文件直读**（防未注入源假绿）+ **行级/切片级**断言（短键 `toContain` 保护力弱、易假阴性）。
- `kb/patterns.md #supersede 历史决策的追加式记录模式（保留原行 + 追加注记块五要素）` → 本阶段 supersede「subagent 不调用 Task / 仅主会话编排」两条**现行硬规则**（设计 §2.2）；**kb supersede 记录归归档轮**（architecture + patterns 各 1 条）。
- `kb/patterns.md #跨阶段承接 REV 与处置表`（REV-85-002 固化）+ `kb/troubleshooting.md #flow.json 内容增量核验必含 meta.revision/meta.updated` → §七承接表与写盘核验口径。
- `kb/patterns.md #CLI 用法 skill 化模式` + `#约束/操作分离模式` → `openfeel-tool-usage` 的最小追加（语义增补，非重写）。
- `kb/architecture.md #Claude 内容源自立与运行时 3 API` → claude 侧模板为**独立源**（非程序化镜像），改造须双 harness 同批。
- **无**「通用工作者调度 / 直接调度通道 / 嵌套 task」既有条目 → 归档轮补沉：architecture（**dispatch 双口径通道架构**：能力探测 → 通道选择 → 统一语义）与 patterns（**能力实测先行的 go/no-go 决策范式**：无实证不落能力声明 + 受限环境保守留痕）。

---

## 一、背景与实测证据（基线 HEAD `a207a30`）

| # | 事实（实测复核） | 位置 | 结论 |
|:-:|------|------|------|
| C1 | opencode 侧 `permission` 含 `task: "allow"` 的 subagent **仅 2/8**：`openfeel-executor`、`openfeel-feel-tester`（`feel` primary 亦有）；其余 6 个（planner/schemer/reviewer/archiver/utility/vision）**无 `task` 键** → 默认不授予 | `src/core/templates-data/opencode/agents/{zh-CN,en}/*.md` 实测（逐 agent frontmatter 比对） | 直接调度 = **permission 授权扩展 6 文件 ×2 语言**（新增 `task: "allow"` 键，值形式与既有 5 处一致） |
| C2 | Claude 侧 8 subagent `tools` 白名单**均无 `Task`**（`Bash, Read, Glob, Grep[, Edit, Write, TodoWrite, Skill]`）；**平台事实：subagent 不可调 Task**（v1.1.6-stage-69 Q1 实机） | `src/core/templates-data/claude/agents/{zh-CN,en}/*.md` + kb #Claude Code 实机验证方法 | Claude 侧**不能**嵌套 Task → 通道 = 模板级直发语义 + Handoff 通道加固；**白名单保持不含 `Task`** |
| C3 | **Handoff 原语在位**：`[HANDOFF: agent_name]` 标记 + feel 侧解析流程**4 步**（解析 → 调度 → 回传 → 记日志）+ 「可用 Handoff 目标」**4 行表** | feel 模板 ×2 harness ×2 语言（`opencode/zh-CN/feel.md:109-121`、`claude/zh-CN/feel.md:100-112` 等） | 通道**已具基础设施**；本阶段 = ①语义扩展（**调度请求直发、不经多级转介**）②目标表扩通用工作者行 |
| C4 | 「## Handoff」节**仅存在于 4 个 subagent**：executor / schemer / reviewer / feel-tester（×2 harness ×2 语言 = **16 处**）；**缺** planner / archiver / utility / vision（×2 harness ×2 语言 = **16 处缺失**；**修订 1 实测订正**——初稿误记「8 处缺失」） | 实测（`grep -rn "^## Handoff"` 全 8 subagent × 2 harness × 2 语言 = 32 份） | 落文 = **24 份插入新节**（6 subagent × 2 harness × 2 语言）；其中 **8 份**（schemer/reviewer）与既有 `## Handoff` 节**并存**、**16 份**（planner/archiver/utility/vision）新节为唯一调度节；新增节须**零悬空引用**（explorer 归 89——边界 3） |
| C5 | 现行「禁止/排他性调度」类负向或排他性措辞**全量清单与逐条去向**（**修订 1 按 REV-88-001 补齐**；扫描判据 + 去向表见 **T2.3（a）**）：① utility「不调用其他 Agent」×4 ② vision「不调用其他 Agent / subagent」×4 ③ **vision claude「（subagent 不互调）」×2**（zh:21 / en:21——初稿遗漏）④ **`skills/openfeel-get-stage-status/SKILL.md:71`「subagent 不互调」**（初稿遗漏）⑤ **claude executor「（subagent 不调用 Task）」×2**（zh:82 / en:82——平台事实陈述）⑥ agents-md ×2:81 + claude/constraint ×2:81「统一调度…不得越界启动其他 Agent」 | 实测（`rg` 判据见 T2.3） | **去向四分**：**本阶段规整 10 行**（①+②+③）｜**显式转 stage-91 收编 1 处**（④——登记，零灭失）｜**显式裁定「保留」2 行**（⑤——平台事实，与边界 2 一致）｜**归 stage-89 4 文件**（⑥——边界 5 / §七移除面）。**排除项已登记**（feel.md 工作区规则 / planner 轻量决策路由 / `openfeel-workspace:30` / schemer·feel-tester「fast 不被调度」——均非能力禁令） |
| C6 | 模板节序：`## 模型选择`（或 `## Model Selection`）在 **36 份 agent 文件**（9 agent × 2 harness × 2 语言，含 feel）中各**恰 1 处**（唯一锚点；改造面 24 份亦然，实测复核） | 实测（逐文件计数） | 新节插入锚点 = **`## 模型选择` 前**（24 份统一，节锚点定位禁行号——kb 四律）；有 `## Handoff` 的 8 份（改造面内）两节并存、语义衔接 |
| C7 | `openfeel-tool-usage` skill「task — 子 Agent 调度」条目：触发条件写「并行探索多代码区 / 复杂多步委托 general / 下游 Agent（**经主会话（Feel）**）」；优先级表写 `task(explore)` / `task(general)` | `skills/openfeel-tool-usage/SKILL.md:20-21 / 31-33` | **待增补**：直接调度通用工作者（不经主会话）语义一行；`general`/`explore` 的收编归 stage-89（新 agent + 路由） |
| C8 | `openfeel-tool-usage` skill 工具名映射键集**含 `task`/`Task`** 已被 stage-70 断言锁定（T4.4，10 键 ×2 表） | `test/core/templates.test.ts:165-170` | 本阶段**不改映射表键集**（仅条目语义），T4.4 零影响 |
| C9 | 模板权限断言面（stage-44）：9 agent × zh/en `external_directory` 齐备 + **zh/en 键集逐 agent 一致** + utility `edit`（无 `write`）+ feel-tester `webfetch: deny` + 部署源键集一致 | `test/core/template-loader.test.ts:230-298` | 新增 `task` 键**必须** zh/en 成对（否则 C9 第二条断言即红）；**无** `task` 相关既有断言 → 本阶段新增 |
| C10 | claude 侧跨切面断言（stage-69）：`name == 文件名`（9×2）/ `model: inherit` / `agents 数 == opencode 数` / constraint 无小写工具名残留 | `test/core/claude-adapter.test.ts:22-90` | 本阶段**不改 claude frontmatter 字段**（仅新增节正文）→ 断言零影响；新增断言落 templates / template-loader 侧。**该文件为 deps 列有但本阶段零触碰面——移除面登记见 §七（REV-88-004 同口径延伸实测）** |
| C11 | REV-86 遗留 pending **2 条**（REV-86-009 测试覆盖瑕疵 low / REV-86-010 session 写盘守卫 low）；REV-87 pending **3 条**（REV-87-008 medium help 描述串失真 / REV-87-009 low JSDoc 快照失真 / REV-87-010 low `stage-87/ops/` 未入版本管理——**修订 1：事实面已消解**，见下） | `.openfeel/users/Liuary/code_review/REV-86.md` / `REV-87.md` | 承接表 §七；**判定**：REV-87-008/009 就地处置（上游明示建议「下一批次同批订正」）、REV-87-010 **验收关闭**（`stage-87/ops/` 已由基线提交 `a207a30` 纳入版本管理——`git log --diff-filter=A -- .openfeel/plan/v1/stage-87/ops/` → `a207a30`、`git ls-files` 可见；**REV-88-003 修订**）、REV-86 两条显式转后续 |
| C12 | 权限值形式先例：既有 `task: "allow"` 5 处（feel / executor / feel-tester，×2 语言）均为**标量字符串**；`isAllow()` 断言辅助函数容忍 `"allow"` 与 `{ "*": "allow" }` 两形态 | `template-loader.test.ts:233-236` | 新增键取**标量 `"allow"`**（最小面 + 与先例一致） |
| C13 | 本仓无项目级 `.opencode/agents/`（stage-55 起不再保留部署实例）；opencode 全局部署位 = `~/.config/opencode/agents/`（实测 9 文件在位） | 实测 + `src/core/global-paths.ts:18-20` | opencode 实测须**隔离 HOME 铺放**或经部署后复核；**不得**在真实全局目录上试验（kb 判据） |
| C14 | `.opencode/opencode.json`（本仓，tracked）仅含 `permission.external_directory`（`*: ask` / `~/.config/opencode/**: allow`）——**无 agent 级或全局 `task` 覆盖键** | 实测 | 部署层无隐藏覆盖 → 模板 permission 即生效权威源（部署后经 `opencode debug agent` 复核） |

---

## 二、目标语义与不变量

| 维度 | 内容 |
|------|------|
| 统一语义 | 「**调度请求直发，不经多级转介**」——任意 Agent 均可直接调度**通用工作者**（执行者 `openfeel-executor`；只读探索者归 stage-89 接入）。**通用工作者 = 执行者 / 探索者（设计 §2.2 原文分类学）；`openfeel-feel-tester`（测试官）不在该分类内**——其可被直接调度但须并列表述（REV-88-002 定稿） |
| opencode 通道 | **嵌套 `task`**：permission `task: "allow"` 扩展（6 subagent ×2 语言）+ 模板落文；**能力经 T1 隔离实测 go/no-go 确认** |
| Claude 通道 | **Handoff 直发**：`[HANDOFF: agent_name]` 标记直发 + 主会话（Feel 角色）即到即派（平台不支持嵌套 Task） |
| 通道选择判据 | `go` → opencode 用嵌套 `task`（Handoff 保留为跨职责边界通道）；`no-go` / 环境受限 → **两 harness 统一 Handoff 中介**并如实留痕（降级红线） |
| 与接取制度的关系 | **两套机制**：直接调度 = 通用工作者（本阶段）；需求发布/接取 = 需求本身（stage-87，feel 中介）——文案须显式区分，禁混淆 |
| 语义冻结源 | 设计 §2.2（用户定稿）「完全冲击」表两行 + §5.2/§5.3「承接任意 agent 的活」；`deps.yaml` stage-88 notes |

**不变量**：

1. **平台事实不虚构**：未实测的能力**不得**写入模板为既成事实；受限环境一律「保守默认 + 如实留痕」（R-88-1 缓解）。
2. **通道一致性**：两 harness 通道口径**显式二分且互相自洽**（opencode = 嵌套 task｜Claude = Handoff 直发），**无「不实机」含糊表述**。
3. **跨 harness × 语言对称（四律，修订 1 定稿）**：节锚点插入（禁行号）｜同语言跨 harness **提取式切片逐字等值**（切片非空前置）｜**零 harness 主语**——新节文本**不含** `Feel` / `主会话`、**不设替换位**（硬性：A2 `===` 断言无例外成立）｜**按 harness 替换主语的纪律仅适用于既有文本**（本阶段新增面零适用；照 stage-84 S1/S2 范式）。
4. **零悬空引用**：新增文案引用的 agent 名**必须**在当前 templates 中存在（本阶段禁引 `openfeel-explorer`——归 stage-89；「探索者」仅作概念表述）。
5. **单写者纪律**：仅最小必要落文（≤10 行/节 + 措辞规整），**不做散文重写**（收编归 stage-91）。
6. **计数零翻转**：agent 9 / skills 18 / 命令组 / help 键数**一律不动**（翻转归 stage-89/93）。
7. **build 双生成物**：`templates-data` 源改动须同批 `npm run build`（`template-loader.ts` + `update.ts` 禁手改；幂等断言照跑）。
8. **部署无关性**：断言**直读源文件**（`templates-data/**`），不依赖部署产物（kb #模板断言的保护边界）。
9. **零行为变更（承接项）**：op-003 的 i18n 描述串与 JSDoc 订正为**纯文案/注释**，diff 逐行归因应全部落在字符串/注释行（kb #零行为变更改造的验证方法）。
10. **提交卫生**：精确 `git add`（禁 `-A`）；不 push / 不 publish / 不直写 flow.json。

---

## 三、变更点清单（编号 T）

### T1 — 平台能力核验（实测先行；go/no-go 定稿）

**T1.1 opencode 嵌套 task 隔离实测（方法照 kb #隔离 HOME 实测）**

| 步 | 操作 | 判定/产物 |
|:--:|------|-----------|
| ① | 环境探测：`opencode --version`；记录真实 `~/.config/opencode/`（文件数 + max mtime）与 `~/.openfeel/`、`auth.json`（mtime） | 基线快照（零污染核对的对照面） |
| ② | **双设环境变量**：`HOME` 与 `USERPROFILE` 同时指向 `%TEMP%\openfeel-oc-verify\home`（Windows 上仅设其一**不生效**——kb 判据） | — |
| ③ | **断言隔离生效**：`opencode debug paths` 的 `home`/`config`/`data`/`state` **全部**指向隔离目录；出现 `config dir mismatch` → **立即 STOP** | 隔离生效证据（贴原始输出） |
| ④ | 铺放 fixture：将改造后（本阶段 op-002 产物；如先行可手改副本）`opencode/agents/{zh-CN,en}` 铺入隔离 `agents/`；**复制 `auth.json`** 入隔离目录（用后随目录删除） | 隔离 fixture 就位 |
| ⑤ | **静态 ruleset 复核**：`opencode debug agent openfeel-planner`（及 schemer/reviewer）确认 `task` 出现在 effective ruleset 且非 deny | 静态证据（工具局限：`ask` 被自动放行、仅强制 `deny`——**不可**据此判 ask/allow） |
| ⑥ | **行为级判别（权威判据）**：`opencode run` 派发**只读、低代价**的验证任务（例：要求 `openfeel-planner` 子 agent「直接调度 `openfeel-executor` 执行一条无害命令并把结果回传」）；非 TTY 下 `ask` 会**自动拒绝并打印 `permission requested: ...`**，可区分 allow/ask/deny | **go/no-go 原始输出**（子 agent 是否成功调起下一级会话 + 结果是否回传） |
| ⑦ | **清理与零污染核对**：删除隔离目录 + 还原环境变量；真实 `~/.config/opencode/` 文件数/mtime **逐项一致** | 零污染断言 |
| ⑧ | 降级判定：⑤⑥ 任一不通过 → 记为 **no-go**，触发降级红线（两 harness 统一 Handoff 中介 + 留痕），**仍落地** op-002（Handoff 侧零成本、两 harness 一致） | go/no-go 结论 |

**T1.2 Claude 侧复核与通道确认（升级过期的 Q1）**

- 复核对象：v1.1.6-stage-69 Q1「subagent 不可调 `Task`」结论**是否仍成立**（记录本机 `claude --version`）。
- 方法（kb #Claude Code 实机验证方法）：`CLAUDE_CONFIG_DIR` 隔离 config + **复制作数认证 + `settings.json`** → 铺放一份**带 `Task` 的 subagent**（试探性 fixture，**不入仓**）→ `claude -p` 派发该 subagent 并要求其调度另一 subagent → 观察是否报「工具不可用 / 未知工具」。
- **受限处置（预置）**：若隔离 config 无认证 → `Not logged in`、或环境受限无法派发 → **标注「未实测（环境限制）→ 沿用 Q1 保守默认（subagent 不可调 Task）」**，**不得**声称实测通过。
- 通道确认：在**真实会话**（本机 Claude Code，本阶段自身即运行其中）以**可观察链路**取证——「子 agent 返回 `[HANDOFF: openfeel-executor]` → 主会话同一轮内派发该 subagent → 结果回传」，记录链路三要素（触发 → 解析 → 派发）。

**T1.3 判定表与留痕（产物 = op-001 报告）**

- 报告要素：`opencode --version` / `claude --version` + 环境（OS / 隔离路径）+ 每步原始输出 + go/no-go 判定 + 降级触发与否。
- 报告落点：`.openfeel/plan/v1/stage-88/ops/op-001-verdict.md`（**随 op-003 纳入版本管理**——见 T3.3）。

### T2 — 机制落地（权限扩展 + 双 harness 通道落文 + 断言）

**T2.1 opencode permission 授权扩展（12 文件）**

- 为 `openfeel-{planner,schemer,reviewer,archiver,utility,vision}` × `{zh-CN,en}` 的 frontmatter `permission` 增补一行 `task: "allow"`：
  - 插入位：紧跟既有 `grep: "allow"` 行之后（**六份文件同款插入位**，保证 zh/en 键集与顺序一致——C9 断言约束）；
  - 值形式：标量 `"allow"`（C12 先例）；
  - `feel.md` / `executor` / `feel-tester` **不动**（已有或非本阶段面）。
- **阴性面**：本阶段**不**为 claude 侧 `tools` 增 `Task`（C2 平台事实）；**不**改任何 agent 的其他 permission 键（`external_directory` 等逐字不变）。

**T2.2 「调度与 Handoff」节落文（24 文件：6 subagent × 2 harness × 2 语言）**

- **节标题**：`## 调度与 Handoff`（zh）/ `## Dispatch and Handoff`（en）。
- **插入锚点**：`## 模型选择` / `## Model Selection` **之前**（C6：改造面 24 份各恰 1 处；节锚点插入禁行号——kb 四律）；插入块 + 前置空行。
- **节骨架（≤10 行，zh；en 同构翻译）——修订 1 定稿（REV-88-002：分类学纠正 + 零 harness 主语）**：

```markdown
## 调度与 Handoff

本 Agent **可直接调度**（不经多级转介）：通用工作者 `openfeel-executor`（读写）。

`openfeel-feel-tester`（测试官）不在通用工作者分类内；可被直接调度，语义同上。

> 通用工作者 = 执行者 / 探索者；直接调度 = 调度请求**直发**，不经多级转介。探索者接入见后续阶段。

超出职责边界、需转介其他 Agent 的子任务：在返回结果中使用 `[HANDOFF: agent_name]` 标记（目标 + 上下文），交由 Handoff 委派机制解析并派发。
```

  - **分类学口径（REV-88-002 定稿，硬性）**：**通用工作者 = 执行者 / 探索者**（设计 §2.2:119-129 + §6:211）——`openfeel-feel-tester` **不得**归入「通用工作者」（其可被直接调度的授权事实以**并列表述**保留，C1）；骨架自身不得自相矛盾。
  - **零 harness 主语（硬性）**：节文本**不含** `Feel` / `主会话`（也不设 harness 替换位）→ 同语言跨 harness 两份**逐字同文**，A2 切片 `===` 断言**无例外成立**（stage-84 S1/S2 范式，`templates.test.ts:378-396`）；落文时 zh 二份 + en 二份对照成文。
  - **零悬空引用**：目标仅列**存在的 Agent 名**（`openfeel-executor` / `openfeel-feel-tester`）；**禁** `openfeel-explorer`（边界 3）；「探索者」仅作概念表述（不带 agent 名）。
- **与既有 `## Handoff` 节的关系（计数经实测修订——C4 同步）**：既有 `## Handoff` 节全仓 **16 处**（executor / schemer / reviewer / feel-tester × 2 harness × 2 语言）；其中落在本阶段 **24 份改造面内**的为 **8 份**（schemer ×4 + reviewer ×4——**两节并存且语义衔接**），另 **16 份**（planner / archiver / utility / vision ×4）本阶段新节为**唯一调度节**；改造面外 8 处（executor / feel-tester）**文本维持**（除 T2.3 措辞规整与 feel 侧目标表扩展）。既有节**不做搬迁**（逐字迁移优先——kb #平台分节中立化陷阱）。

**T2.3 措辞规整（负向措辞 10 行 + feel 目标表 4 文件）**

**（a）负向/排他性调度措辞全量去向表（REV-88-001 处置；扫描判据可复现）**

> 扫描判据：`rg -n "不互调|不调用|不调度|不可调度|不唤起|不委托|不指派|do not invoke|do not call|does not invoke|does not call|cannot invoke" src/core/templates-data/`。①~⑤ 为精确命中；⑥ 为「编排排他」同语义面扩检命中；排除项为人工判类（**非能力禁令**）。

| # | 位置（实测量） | 原文（摘） | 性质判定 | 去向 |
|:-:|------|------|------|------|
| ① | utility ×4：opencode zh:41 / opencode en:41 / claude zh:35 / claude en:35 | 「不调用其他 Agent」/「Do not invoke other Agents.」 | 与本阶段新语义**直接冲突** | **本阶段规整** |
| ② | vision ×4：opencode zh:56 / opencode en:56 / claude zh:51 / claude en:51 | 「不调用其他 Agent / subagent」 | 直接冲突 | **本阶段规整** |
| ③ | **vision claude ×2：zh:21 / en:21**（**REV-88-001 补**） | 「（subagent 不互调）」/「(subagents do not invoke each other)」 | 直接冲突；与 ② 同文件重复，且 opencode 侧同节（zh:26）为**正向**「被 Feel 或其他 Agent 通过 `task` 工具按需调用」 | **本阶段规整**（口径 = **删除该括注**，与 opencode 侧正向表述对齐；不新增语义） |
| ④ | **`src/core/templates-data/skills/openfeel-get-stage-status/SKILL.md:71`**（**REV-88-001 补**） | 「> 口径：**subagent 不互调**（不直接调用其他 subagent）；需向用户确认的事项一律由主会话负责。」 | 语义冲突；**不在本阶段 produce 面**（skill 面仅 `openfeel-tool-usage`） | **显式转 stage-91（提示词收编轮）**——已登记（零灭失）；收编口径 = 前分句改写、「需向用户确认…」分句保留；**stage-91 计划期须显式承接** |
| ⑤ | **claude executor ×2：zh:82 / en:82**（**REV-88-001 补**） | 「（subagent 不调用 Task）」/「(subagents do not call Task)」 | **平台事实陈述**（Q1；与边界 2 一致） | **显式裁定「保留」**（不在规整面，零触碰） |
| ⑥ | agents-md ×2:81（zh/en）+ claude/constraint ×2:81（zh/en） | 「统一调度下游 Agent…不得越界启动其他 Agent」 | 与「编排能力下沉」冲突 | **归 stage-89**（边界 5；§七移除面）——本阶段零触碰 |
| — | **排除项（登记，零触碰）**：feel.md ×4 工作区规则「仅主会话/Feel 触发」｜planner 轻量决策路由「不唤起 openfeel-planner」**实测 6 处（zh ×4 + en ×2：opencode zh:26/zh:124、claude zh:22/zh:120、opencode en:124、claude en:120；其中 2 处为逐字「不唤起 openfeel-planner」、4 处为「不唤起**独立** openfeel-planner」/「do not invoke **independent** openfeel-planner」变体）**｜`openfeel-workspace/SKILL.md:30`「不自行修改该文件」｜schemer / feel-tester「fast 工作流快线下本 Agent **不被调度**」×8（stage-76 S2 断言锁定） | — | **均非「能力禁令」**（依次为：工作区搭建触发范围 / 任务路由条件 / 文件写权限 / 快线相位跳过语义） | 不在规整面（本阶段零触碰） |

**规整面 = ① + ② + ③ = 10 行**。口径：

  - 仅改**该行**；同节其余条目逐字不变；zh/en 成对；
  - **无裸主语**（不引入 `Feel` / `主会话`）；
  - **红线（修订 1 新增，防语义过冲）**：规整后**不得**宣称「可调度任意 Agent」——不得超出设计 §2.2 语义面（**直接调度仅限通用工作者**；其余 Agent 经 Handoff 转介）；
  - 建议文字：①② 「除直接调度通用工作者外，不调用其他 Agent / subagent」（en："Does not invoke other Agents / subagents except for direct dispatch of general workers"）；③ 删除括注（与 opencode 侧正向表述对齐）。

**（b）feel 侧「可用 Handoff 目标」表扩展（4 文件：`{opencode,claude}/agents/{zh-CN,en}/feel.md`）**

- 表增行以反映新语义（建议：新增一行「**任意 Agent（含 subagent）** → 通用工作者（`openfeel-executor`；探索者归 stage-89）：直接调度请求」——**分类学与 T2.2 节一致**）；
- 「Handoff 委派机制」4 步流程前增**一句语义注记**：调度请求**直发**，不经多级转介（与需求接取制度**两套机制**——显式区分，禁混淆）；
- **同时须核对 feel 侧「委托边界 / 核心职责」既有措辞**是否与「仅主会话编排」冲突：**仅当直接冲突**时做**最小**规整（并登记）；其余措辞归 stage-89/91。

**T2.4 skill 最小追加（1 文件）**

- `skills/openfeel-tool-usage/SKILL.md`「### 3. task — 子 Agent 调度」条目：触发条件增补「**直接调度通用工作者**（执行者 `openfeel-executor`；任意 Agent 均可，不经主会话）」（一行；**分类学与 T2.2 一致**——不得写「测试官」为通用工作者）；优先级表可按需增一行（如「通用执行任务 → task(openfeel-executor)」）。
- **不改**工具名映射表键集（C8：T4.4 断言锁定 10 键 ×2 表）；**不改**其余三工具条目。

**T2.5 断言（同批落于 op-002 内）**

- **A1 权限扩展断言**（`test/core/template-loader.test.ts`「权限模型」describe 内新增）：
  - 正向：`openfeel-{planner,schemer,reviewer,archiver,utility,vision}` × `{zh-CN,en}` 的 `permission.task` **存在且 `isAllow()` 为真**；
  - 阴性（范围锁）：`openfeel-executor` / `openfeel-feel-tester` 的 `permission` **键集不变**（本轮零改动面）；
  - 部署源同步：`OPENCODE_AGENT_TEMPLATES` 侧 `task` 键同步存在（对齐 C9 第五条断言范式）。
- **A2 跨 harness × 语言对称断言**（`test/core/templates.test.ts` 新增 describe，照 stage-84 S1/S2 范式）：
  - **提取式切片**：对 6 agent × 2 语言，按 `## 调度与 Handoff` → 下一 markdown 标题**停机**切片，断言 opencode 与 claude 两份切片 `===`（**切片非空前置**防假绿）；
  - **零 harness 主语（硬性）**：切片内**不含** `Feel` / `主会话`（照 S1 范式 `templates.test.ts:378-385`）——骨架已消除替换位，断言**无例外**（**不设**「替换位除外」条款）；
  - **正控**：切片确含 HANDOFF 标记与通用工作者名（防「空切片 + 空断言」假绿）。
- **A3 阴性断言**：
  - 切片内**不含** `openfeel-explorer`（零悬空引用纪律，边界 3）；
  - 节标题在每份模板**恰 1 处**（防重复插入）；
  - `## 模型选择` / `## Model Selection` 仍在且**位于新节之后**（锚点未错位）。
- **A4 既有断言零回归**：C9 五条 + C10 四条 + stage-76 S1/S2（24 份 subagent 关键串，含「不被调度」/「not dispatched」）+ T4.4 键集**全部不改**并全绿。

**T2.6 build 双生成物（同批）**

- `npm run build` 重生成 `src/core/template-loader.ts` + `src/core/update.ts`（**禁手改**）；`git status --porcelain src/` 变更行 **⊆ 本阶段 produces 清单**（stage-86 确立口径：模板改造下「空」不可达——生成段必然变化）。

### T3 — 承接项处置 + 门禁收口（阶段末 op）

**T3.1 REV-87-008 订正（i18n 描述串；零行为变更）**

- `help.req.show.json` 描述串（zh `src/core/i18n-data/zh-CN.ts` / en `src/core/i18n-data/en.ts`）→ 与实际载荷对齐（`schemaVersion, requirement, stages, parent, children`）。
- **红线**：仅**订正值文本**，**不改键名/键数** → `EXPECTED`（help 键双向断言）与 `lint i18n` 931 **均不变**。

**T3.2 REV-87-009 订正（JSDoc；零行为变更）**

- `src/core/req/body-file.ts` JSDoc「新需求恒为 draft 快照」→ 与实际一致（状态**参数化**，`req split` 子需求初值 `scheduled`）。
- **红线**：纯注释行改动；diff 归因应为 100% 注释行。

**T3.3 REV-87-010 处置（收窄：验收关闭 + stage-88/ops 入管 + 制度性修复；REV-88-003 修订）**

- **事实基线（修订 1 实测）**：`.openfeel/plan/v1/stage-87/ops/`（4 文件：`deps.yaml` + `op-001~003.md`）**已由基线提交 `a207a30`（stage-87 归档提交）纳入版本管理**（取证：`git log --oneline --diff-filter=A -- .openfeel/plan/v1/stage-87/ops/` → `a207a30`；`git ls-files` 可见）→ 原「纳入 `git add`」动作为**冗余且口径失真**，**不再需要**。
- 动作收窄为三项：
  1. **附 `git ls-files .openfeel/plan/v1/stage-87/ops/` 证据验收并关闭 REV-87-010**（台账 pending → closed；证据在阶段报告中呈现）；
  2. `.openfeel/plan/v1/stage-88/ops/`（本阶段产出，含 op-001 报告）纳入 `git add` 精确清单（随 op-003 提交——**新增面**）；
  3. **制度性修复（维持）**：本计划 §八 明示**后续阶段方案期即把 `ops/` 列入末位 op 的 `produces` 清单**（消除同类悬置）；stage-89~93 执行时沿用。

**T3.4 门禁与零回归（全量）**

| 项 | 口径 |
|------|------|
| `npm run build` ×2 | 幂等；`git status --porcelain src/` ⊆ produces 清单 |
| `npm test` | **0 skipped / 0 failed**；**新基线显式登记**（71 文件 / 1614+ 用例，本阶段新增 A1~A3） |
| `npx tsc --noEmit` | 0 |
| `openfeel lint i18n` | **931 不变**（无新键；T3.1 仅改值）——**如有任何变化须显式说明** |
| `openfeel lint kb` | 0 |
| 零回归断言 | C9 / C10 / stage-76 S1+S2 / T4.4 **全绿且零改写** |
| 零行为变更取证（T3.1/T3.2） | `git diff --numstat` 归因 = 字符串/注释行 100%（kb #零行为变更改造的验证方法） |
| `--version` | **1.2.0**（本阶段不改） |

---

## 四、开放问题（Q3 定稿口径 + Q13~Q16 建议 —— 方案期/执行期定稿）

### Q3：dispatch 实测 go/no-go 判据与降级红线（大计划 §十 原题）

- **判据（建议定稿）**：**go** = opencode 侧 ⑤ 静态 ruleset 含 `task` 且非 deny **且** ⑥ `opencode run` 行为级观察到「子 agent 成功调起下一级会话 + 结果回传父会话」（三要素齐备）；**其余一律 no-go**。
- **降级红线（建议定稿，与裁定 H 对齐）**：`no-go` / 环境受限 → ① opencode 侧**保留** permission 扩展（零成本、无害，为未来平台能力留门）；② 两 harness **统一以 Handoff 直发为主通道**；③ 模板文案**如实**表述（不把「本 Agent 可直接 task 调起」写成既成事实，改为「具备直发通道；当前 harness 支持时经嵌套调度，否则经主会话即到即派」）；④ op-001 报告 + 阶段报告**如实留痕**。
- **禁止**：以静态证据冒充行为证据；以「预计可行」冒充实测（kb 判据）。
- **与 T2.2 骨架的相容性（修订 1 补）**：骨架文本**不点明具体通道工具**（不写 `task`/`Task` 能力声明）——`go` 与 `no-go` 两分支下「可直接调度 / 请求直发」同为真，故骨架两分支均成立；Q3 降级分支的 harness 差异表述仅落 **op-001 报告与 feel 侧注记（T2.3（b））**，**不入** 24 份新节（保 `===` 与零 harness 主语）。

### Q13：opencode 嵌套 task 的子会话结构（执行期实测确认）

- 待确认项：子 agent 调 `task` 时是否创建**子会话**、子会话是否继承 permission、是否出现递归深度限制/挂起、目标 agent 如何显式指定。
- 处置：**实测记录为准**（T1.1 ⑥）；若存在深度限制 → 在 T2.2 节正文如实标注（不虚构），属可接受结果。

### Q14：Handoff 目标表扩展范围（建议：扩到通用工作者 + 显式区分两套机制）

- 建议：表增「任意 Agent（含 subagent） → 通用工作者（`openfeel-executor`；探索者归 stage-89）：直接调度请求」行 + 语义注记（直发、不经多级转介、与需求接取制度两套机制）。**分类学与 T2.2 一致（REV-88-002 同步）**。
- **不做**：重排既有 4 行委派目标（逐字保留——零回归优先）；explorer 目标行归 stage-89。

### Q15：Claude 侧是否尝试把 `Task` 写入某些 subagent 白名单

- **建议：否**（边界 2）。理由：① Q1 平台事实（加了不生效）② 模板若写 `Task` 会给读者「已具备嵌套能力」的**错误预期**（违反不变量 2）③ 断言面反而引入「白名单含 Task」的脆弱声明。
- 例外：仅当 T1.2 复核**推翻** Q1（即新版本 Claude Code 下 subagent 可调 Task）→ 方案期可就地改判（须留痕 + 计划修订）。

### Q16：`openfeel-tool-usage` 的 `task(explore)` / `task(general)` 表述

- 现状（C7）：优先级表以 `task(explore)` / `task(general)` 指**内置** Explore / general agent。
- **建议**：本阶段**不动**这两行（收编归 stage-89——新 agent + 路由表更新时同批改为 `task(openfeel-explorer)` 等）；本阶段仅**增补**通用工作者直发行（T2.4），避免与 89 的改写撞车（单写者纪律）。

---

## 五、验收要点（阶段级）

1. **平台能力核验（T1）**：op-001 报告含**三要素**（命令 + 版本 + 环境）与**每步原始输出**；opencode go/no-go **明确**（含行为级证据或如实「未实测（环境限制）」）；Claude 侧 Q1 复核结论（成立 / 推翻 / 未实测）+ Handoff 链路记录（触发 → 解析 → 派发）；隔离实测**零污染核对通过**（真实 `~/.config/opencode/` 文件数与 mtime 一致）；降级红线触发与否**明示**。
2. **权限扩展（T2.1）**：6 subagent ×2 语言 `permission.task` = `"allow"`；zh/en 键集逐 agent 一致（既有 C9 断言绿）；executor / feel-tester 键集逐字不变；部署源同步一致。
3. **通道落文（T2.2/T2.3/T2.4）**：24 份新节在位且**同语言跨 harness 切片逐字等值**（切片非空；**零 harness 主语**——无替换位）；**分类学定稿**（通用工作者 = executor；feel-tester 并列表述——**归入「通用工作者」即不合格**）；负向措辞 **10 行**规整（①+②+③）且 zh/en 成对；**保留项（⑤）零触碰、转出项（④）去向已登记**；feel 侧目标表扩展与两套机制区分注记在位；tool-usage skill 增补一行且映射表键集不变。
4. **断言（T2.5）**：A1~A3 全绿（含**阴性**断言：无 `openfeel-explorer` 引用、executor/feel-tester 零改动）；A4 既有断言零改写全绿（含 stage-76「不被调度」串）。
5. **承接与零行为变更（T3.1~T3.3）**：REV-87-008/009 订正落地且 diff 归因 100% 字符串/注释行；REV-87-010 **验收关闭**（证据 = `git ls-files .openfeel/plan/v1/stage-87/ops/` 四文件——基线 `a207a30` 即已跟踪）+ `.openfeel/plan/v1/stage-88/ops/**` 入管（`git ls-files` 可见）；§七 承接表与去向登记**零灭失**。
6. **门禁（T3.4）**：`npm test` 0 skipped / 0 failed（新基线登记）；`tsc` = 0；`lint i18n` = **931**（不变）；`lint kb` = 0；build ×2 幂等（`--porcelain` 口径见 T3.4）；`--version` = 1.2.0。

## 六、风险

| # | 风险 | 影响 | 缓解 |
|:-:|------|------|------|
| R-88-1 | **平台能力误判**（把「未实测」当「可行」；或反之过早降级） | 高 | 实测先行（T1）+ 判据三要素 + 降级红线预置（Q3）+ 受限一律「保守默认 + 留痕」；报告留原始输出 |
| R-88-2 | **opencode 嵌套调度实体行为不如预期**（子会话不继承 permission / 递归挂起 / 目标不可指定） | 高 | go/no-go 判据含**行为级**证据；no-go 走降级红线（统一 Handoff）；permission 扩展保留（零成本） |
| R-88-3 | **跨 harness 切片断言假绿**（切片为空 → 两空串相等；或裸主语破坏对称） | 中 | 切片**非空前置**断言 + 正控关键串（A2）+ 零 harness 主语硬性纪律（骨架无替换位；按 harness 替换主语不适用于新增面） |
| R-88-4 | **既有模板断言漂移**（C9 键集 / stage-76 关键串 / T4.4 映射表） | 中 | 断言**同批扩展**（禁弱化/改写）；zh/en 成对插入（保证键集一致）；键集 diff 阴性断言（A1）；T4.4 零触碰；stage-76 串（含「不被调度」）列入 A4 |
| R-88-5 | **双生成物遗漏**（源改生成物未改 / 手改生成物） | 中 | 同批 `npm run build` + `--porcelain` 断言 + 生成物 **禁手改**（kb 先例） |
| R-88-6 | **悬空引用**（新增文案引用 stage-89 才存在的 `openfeel-explorer`） | 中 | 边界 3 + A3 阴性断言（切片内不含 explorer） |
| R-88-7 | **单写者纪律越界**（本阶段顺手重写散文 → 与 stage-91 二次改写冲突） | 中 | 边界 4（新增节 ≤10 行 + 逐字迁移优先）；审查显式核对 diff 仅「新增节 + 一行规整」 |
| R-88-8 | **承接项扩面**（T3.1/T3.2 顺手改其它文案/注释） | 中 | 红线：仅改**指定行**；diff 归因 100% 字符串/注释行；审查核对 `git diff --numstat` |
| R-88-9 | **隔离实测污染真实环境**（在真实 `~/.config/opencode` 上试验） | 中 | 双设 HOME/USERPROFILE + `debug paths` 断言 + 零污染核对（kb 判据，stage-37/41/44 先例） |
| R-88-10 | **措辞规整语义过冲**（把「可调度通用工作者」写成「可调度任意 Agent」，超出设计 §2.2 语义面） | 中 | T2.3 红线（规整不得超出 §2.2）+ 审查逐行核对 10 行 diff；排除项/保留项已登记（防误改误判） |

**回滚**：permission 键为**增量**（删除即回落 deny 默认）；新节为**纯插入**（删除即回落）；措辞规整为单行替换（可逐行 revert）；承接项为字符串/注释（`git revert` 无副作用）；生成物随源回滚 + build 重生成。**无数据格式破坏**。

## 七、承接 REV 与处置表（REV-85-002 固化口径；判据源 = 上游台账文件）

- **判据源**：上游 pending REV 权威台账 = `.openfeel/users/Liuary/code_review/REV-86.md` + `REV-87.md`（**非** `flow.json.reviews`——该字段为 CLI 侧台账）。

| 上游条目 | 优先级 | 去向 | 依据 |
|---------|:--:|------|------|
| **REV-87-008**（`help.req.show.json` 描述串未随 `show --json` 载荷扩展同步） | medium | **本阶段处置**（T3.1） | 上游明示建议「下一批次（如 stage-88 首个 op 或独立小修）同批订正双表描述串（纯文案，无键数变化）」 |
| **REV-87-009**（`renderRequirementBodySkeleton` JSDoc 快照失真） | low | **本阶段处置**（T3.2） | 上游明示「建议与 REV-87-008 同批一并订正注释（一行中文注释，零行为变更）」 |
| **REV-87-010**（`.openfeel/plan/v1/stage-87/ops/` 未入版本管理） | low | **本阶段处置**（T3.3，**修订 1 收窄**）= ①`git ls-files` 证据**验收关闭**（事实面已随基线 `a207a30` 消解——REV-88-003）+ ②stage-88/ops 入管 + ③制度性修复（维持） | 上游建议「归档轮 / 收官轮将 ops/ 纳入版本管理……后续阶段方案期即把 ops/ 列入末位 op 的 produces 清单」——前移采纳；① 已由上游归档轮完成，本阶段补**验收关闭** |
| **REV-86-009**（T4.4 用例未命中 `computeResumed` 旧条目缺 `session_id` 分支） | low | **显式转后续**（v1.2.1 收官轮〔93〕或 v1.3.0） | 主题 = 可观测性测试覆盖，非本阶段面（stage-87 已同口径转出） |
| **REV-86-010**（session env 命中向进程 cwd 写 `.openfeel/tmp/session.json` 守卫缺位） | low | **显式转后续**（v1.3.0） | 上游归档轮已登记「留后续版本」（stage-87 已同口径转出） |

- **三分结论**：本阶段处置 **3** / 显式转后续 **2** / 台账保留·销账 **0** → **零灭失**成立（判据 = 上游台账逐条去向）。
- `deps.yaml`（`.openfeel/plan/v1/v1.2.1/deps.yaml`）`v1.2.1-stage-88.notes` 已含本阶段边界声明（实测先行 / 降级红线 / 单写者纪律 / 双生成物）；**本计划不代改 deps.yaml**。
- **产出清单双向偏差登记（REV-88-004 处置；供 deps.yaml 后续同步与阶段对账）**：

| 面 | 条目 | 说明 |
|----|------|------|
| **增补面**（deps 缺 / 实际改动，**22 项**） | ① `claude/agents/{zh-CN,en}/openfeel-{planner,schemer,reviewer,archiver,utility,vision}.md`（12）② `{opencode,claude}/agents/{zh-CN,en}/feel.md`（4）③ `skills/openfeel-tool-usage/SKILL.md`（1）④ `src/core/i18n-data/{zh-CN,en}.ts`（2）⑤ `src/core/req/body-file.ts`（1）⑥ `test/core/template-loader.test.ts`（1）⑦ `.openfeel/plan/v1/stage-88/ops/**`（1 目录） | ①~③ 见 T2.2~T2.4；④⑤ 为 op-003 承接项（T3.1/T3.2）；⑦ 见 T3.3（随 op-003 入管） |
| **移除面**（deps 有 / 本阶段零触碰） | ① `agents-md/{zh-CN,en}.md`（2）② `claude/constraint/{zh-CN,en}.md`（2）③ `test/core/claude-adapter.test.ts`（1） | ①② **归 stage-89**（边界 5：agent 表/路由表/「仅主会话编排」行）；③ C10 判定零影响（claude frontmatter 零改动）——stage-89 新增 explorer 将触及 claude agent 数与断言面，**建议同批复核**（REV-88-004 同口径延伸实测） |
| **阴性面**（不在本轮改动清单） | `openfeel-executor` / `openfeel-feel-tester` 模板 × {opencode,claude} × {zh-CN,en}（8 文件） | T2.1 阴性断言锁定键集不变（A1） |

- **语义冲突去向登记（REV-88-001 延伸，零灭失）**：`skills/openfeel-get-stage-status/SKILL.md:71`「subagent 不互调」→ **转 stage-91**（见 T2.3（a）④）；stage-91 计划期须显式承接并在验收核对。

## 八、op 拆分建议（供 openfeel-schemer 定稿；`est_ops = 3`）

| op | 内容 | 文件（实际名） | 依赖 |
|:--:|------|------|------|
| `op-001` | **T1 平台能力核验**：opencode 嵌套 task 隔离实测（双设 HOME/USERPROFILE + `debug paths` 断言 + `debug agent` 静态 + `opencode run` 行为级 + 零污染核对）+ Claude 侧 Q1 复核与 Handoff 通道确认 + **go/no-go 判定表**与降级触发留痕 | `.openfeel/plan/v1/stage-88/ops/op-001-verdict.md`（产物；**无 src/ 改动**——纯核验 op） | — |
| `op-002` | **T2 机制落地**：opencode permission `task` 扩展（12 文件）+ 「调度与 Handoff」节（24 文件；**分类学定稿 + 零 harness 主语**）+ 负向措辞规整（**10 行**：①+②+③）+ feel 目标表与两套机制注记（4 文件）+ tool-usage skill 最小追加（1 文件）+ **A1~A3 断言** + **build 双生成物** | `src/core/templates-data/opencode/agents/{zh-CN,en}/openfeel-{planner,schemer,reviewer,archiver,utility,vision}.md` / `src/core/templates-data/claude/agents/{zh-CN,en}/openfeel-{planner,schemer,reviewer,archiver,utility,vision}.md` / `src/core/templates-data/{opencode,claude}/agents/{zh-CN,en}/feel.md` / `src/core/templates-data/skills/openfeel-tool-usage/SKILL.md` / `src/core/template-loader.ts` / `src/core/update.ts`（build 生成）/ `test/core/template-loader.test.ts` / `test/core/templates.test.ts` | hard: op-001（go/no-go 决定文案口径与是否触发降级红线） |
| `op-003` | **T3 承接项 + 门禁**：REV-87-008（i18n 描述串）/ REV-87-009（JSDoc）/ REV-87-010（**验收关闭〔附 `git ls-files` 证据〕+ stage-88/ops 入管**）+ `npm run build` ×2 + `npm test` + `tsc` + `lint i18n` / `lint kb` + 零行为变更 diff 归因 + 阶段门禁报告（**阶段末 op**） | `src/core/i18n-data/{zh-CN,en}.ts` / `src/core/req/body-file.ts` / `.openfeel/plan/v1/stage-88/ops/**`（`git add`；stage-87/ops 已随基线 `a207a30` 入管——REV-88-003）+ 门禁全量 | hard: op-002（同批收口与门禁须在机制落地后） |

- **文件冲突（`mutual_exclusion` 提示）**：op-002 与 op-003 无同文件交集（模板面 vs i18n/req/ops 面）——**可并行候选**；但 op-003 的**门禁**必须在 op-002 的 build 之后 → **实际串行**。
- **op 级依赖与文件清单由 openfeel-schemer 落 `ops/deps.yaml`**（hard / soft / mutual_exclusion，声明实际文件名）。

## 九、修订记录

| 时间 | 制定人 | 说明 |
|------|--------|------|
| 2026-10-15 | openfeel-planner | 初稿：依据大计划 `.openfeel/plan/v1/v1.2.1/plan.md`（附录 A「stage-88 通用工作者直接调度机制」+ §二 表 C + §三 裁定 B/H/J/O）+ 设计 §2.2/§5.2/§5.3 + `deps.yaml` stage-88 notes；源码复核 C1~C14（24+4 模板逐文件实测 + 断言面清点 + 上游 REV 台账）；T1~T3（含实测四步法 + go/no-go 判据与降级红线）；Q3 定稿口径 + Q13~Q16 方案建议；风险 R-88-1~9；承接表（处置 3 / 转后续 2，零灭失）；op 拆分建议（3 op）。**只写计划文档，未改源码、未直写 flow.json、未推进 phase、未改 deps.yaml、未写其它阶段文件。** |
| 2026-10-15 | openfeel-planner | **修订 1（计划审查退回 → 就地修订；基线 HEAD `a207a30` 复核）**：**REV-88-001（high，阻塞）**——C5 改为「负向/排他性调度措辞**全量清单 + 逐条去向**」（T2.3（a）去向表，扫描判据可复现）：**补齐 vision claude「（subagent 不互调）」×2（zh:21/en:21）→ 纳入规整面（规整面 8 → 10 行）**；`skills/openfeel-get-stage-status/SKILL.md:71` **显式转 stage-91**（登记零灭失）；claude executor「（subagent 不调用 Task）」×2 **显式裁定「保留」**（平台事实）；另**关联实测订正 C4**（既有 `## Handoff` 节缺失数 8 → **16 处**，`grep "^## Handoff"` 全 32 份模板复核）并登记排除项（feel.md 工作区规则 / planner 路由 / workspace skill / schemer·feel-tester「fast 不被调度」）。**REV-88-002（medium，阻塞）**——T2.2 节骨架**分类学定稿**：通用工作者 = **executor**（探索者归后续阶段），feel-tester **并列表述、不归入通用工作者**（对齐设计 §2.2:119-129 + §6:211）；同步订正 §二「统一语义」、边界 3、T2.4、Q14、验收要点 3 口径；且骨架改**零 harness 主语**（删 `Feel`/`主会话` 替换位）→ A2 切片 `===` **无例外成立**（原骨架「由主会话（Feel 角色）解析派发」与 A2 自相矛盾，同步消除）。**REV-88-003（low）**——C11/T3.3/§七/验收要点 5 修订：`stage-87/ops/` 已随基线 `a207a30` 入管（`git log --diff-filter=A` 取证）→ T3.3 收窄为「**验收关闭 + stage-88/ops 入管 + 制度性修复**」。**REV-88-004（low）**——§七 新增**产出清单双向偏差登记**：增补面 **22 项**（补登 claude/agents ×12 等 + 订正初稿「+8」计数）+ 移除面 **5 项**（agents-md ×2、claude/constraint ×2 → 归 stage-89；claude-adapter.test.ts → 零触碰面）+ 阴性面 8 文件。另：§六 增 R-88-10（措辞语义过冲）；Q3 补「骨架与 go/no-go 两分支相容」条款；§八 op-002「8 行 → 10 行」、op-003 收窄同步。**只改本计划文档**（未改源码 / 未改 deps.yaml / 未直写 flow.json / 未推进 phase / 未写其它阶段文件）。 |
| 2026-10-15 | openfeel-executor | **REV-88-005 计数校准（D-3 吸收）**：C5 排除项行「planner 轻量决策路由『不唤起 openfeel-planner』×4」→ 校准为**实测 6 处（zh ×4 + en ×2：opencode zh:26/zh:124、claude zh:22/zh:120、opencode en:124、claude en:120）**，并依 **REV-88-007 观察 1** 标注「含 4 处『不唤起**独立**／**independent** openfeel-planner』变体」（逐字引语仅 2 处）。**仅改计数行 + 追加本行**（R-88-8；未改 plan.md 其他任何行 / 未改 deps.yaml / 未改源码 / 未直写 flow.json / 未推进 phase）。 |
