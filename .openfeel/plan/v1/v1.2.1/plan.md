# OpenFeel v1.2.1 — 需求为核心 × 通用工作者调度 × 提示词瘦身（七主题）

> **版本**：v1.2.1（Z 级递增，功能主题） | **创建日期**：2026-10-15 | **Planner**：openfeel-planner
> **规模判定**：**大规模**（8 阶段，跨 `src/core/{metrics,runtime-log,flow-manager,config,req/**}` + `src/commands/{flow,req}.ts` + `src/cli/**` + `src/core/templates-data/**`（agent 模板 36 份 + 约束 4 份 + skills）+ `test/**` + 文档与版本载体；含**流水线语义变更**（三模式 / 审查档位）与 **Agent 体系结构变更**（新增探索者 / 调度机制 / 提示词范式））→ 走独立 openfeel-planner → openfeel-reviewer 完整流程。
> **定位（七主题）**：① **需求接取制度为核心**（发布/接取/拆分；**流水线与版本解绑**，仅发布时推进版本号）；② **通用工作者直接调度**（执行者/探索者可被**任意 agent 直接调度**——与需求接取制度是**两套**机制，勿混淆）；③ **新增探索者 agent**（只读）与执行者（读写），**先探后执行**，替代对内置 Explore/general 的依赖；④ **提示词瘦身**（必要的操作流程一律转 skill；agent 提示词只列 skill 索引）；⑤ **三模式架构**（规划/快速/通用；需求规模驱动）；⑥ **可观测性改造**（接线 `recordRun` / CLI 日志补字段 / op 级埋点）；⑦ **并行提速**（鼓励拆分需求并行执行）。
> **权威设计记录**：`docs/v1.2.1-design.md`（用户定稿，本计划的唯一权威依据）；数据依据 = `.openfeel/users/Liuary/tmp/analysis/{opencode,pipeline,claude}-analysis.md`（三数据面只读分析）。
> **阶段计划**：`.openfeel/plan/v1/stage-86/plan.md` … `stage-93/plan.md`（待 Feel 注册后落盘）。
> **路线图**：`.openfeel/roadmap/v1.2.1.md`。
> **依赖声明**：`.openfeel/plan/v1/v1.2.1/deps.yaml`（阶段级 hard 依赖 + op 级由 openfeel-schemer 细化）。
> **系列**：`v1`；`stageDir` 映射 `stage-86` ~ `stage-93`；阶段 ID 自 `v1.2.1-stage-86` 起（承接 v1.2.0 的 stage-85）。
> **当前基线**（实测，HEAD `11f0bd2`）：CLI `1.2.0`；flow 注册阶段 **8**（v1.2.0-stage-78~85 全 done）；`flow.json` `revision 1060` / `archived_versions` **9** / `requirements` **0** / `reviews` **0**；测试 **70 文件 / 1557 用例**（v1.2.0-stage-85 门禁登记值）；共享 skills **18**；agent **9**（feel + 8）；`lint i18n` **911**（stage-85 登记值）；本仓 `config.yaml defaults.workflow_mode: full`；三数据面 66 天（opencode）分析结论见 §一。

---

## 一、背景与需求来源

用户定稿设计文档 `docs/v1.2.1-design.md` 明确本次改造总纲：**把 OpenFeel 从「一切皆流水线」改造为「以需求为核心、非流水线优先、Agent 自治调度」**——以需求发布/接取为主工作模式、流水线与版本解绑；执行者/探索者作为通用工作者可被任意 Agent 按需调度；鼓励拆分需求并行执行；并据此提速、瘦身提示词、简化通用任务、新增三模式。

### 数据依据（三数据面分析，摘要）

- **慢** = 串行 subagent 派发（`task` 工具 141.7h / 占 73%，单次均 331s）+ 多道审查关（reviewer 占流水线活跃耗时 ~37%）+ 人工等待（`question` 17.5%~32.6%）+ 跨会话闲置（最慢 stage 的 96~99% 是跨会话闲置，**原始墙钟不能用于判断「agent 慢」**）。
- **贵** = 缓存重放（opencode 97.2% / Claude 98.4% token 为 cache_read）+ reviewer 模型档位（`glm-5.3-flash`，$52.49 / 33%）+ 子会话膨胀（cost 84%）+ **上下文膨胀（Claude 主会话 14.4× 且从不 compact）**。
- **无关** = CLI 执行速度（命令中位 19ms；CLI 唯一价值 = 事件时间戳）。
- **缺** = 可观测性（模型推理 / op 级 / subagent 调度全盲；`recordRun` 死代码；CLI 日志无 duration/project/session）。

### 知识库检索（`openfeel-check-kb`）结果

已加载 `.openfeel/kb/index.md`（architecture 42 条 / patterns 180 条 / troubleshooting 61 条 / setup 6 条）。**高度相关条目**：

- `kb/architecture.md #双模式转移表选择：getValidTargets 单一取表点 + stage→mode→表 三元解析` + `#部署级默认翻转的单一权威` → 三模式扩展（值域 + 解析级联）的既有架构基础与零回归纪律。
- `kb/architecture.md #需求流转四层模型架构` + `#双层状态聚合架构` + `#需求层正交边界架构（**本版将被 supersede**）` → 需求级模式属性须显式记录 supersede；聚合判定单源（`allLinkedStagesDone`）不得引入第二份。
- `kb/patterns.md #跨 Agent Handoff 委派原语模式（[HANDOFF: agent_name]，Feel 自动解析，零 CLI 新增）` → dispatch 的 Claude 侧降级通道基础。
- `kb/patterns.md #跨 harness × 语言模板对称纪律（节锚点插入 + 提取式切片字节等值 + 无裸主语）` + `#新增 Agent 全链路更新清单模式` → 新增探索者 agent 与模板改造的四律。
- `kb/patterns.md #skills 计数翻转全量清单（字面量 + 派生总数 + 白名单枚举）` + `#陈旧计数「全枚举」纪律` → agent 9→10 与 skills 计数翻转的全枚举纪律。
- `kb/patterns.md #顶层可选字段「读侧宽容不注入」模式` + `#零回归取证范式（补丁前/后归一化快照 diff 空）` + `#对称回写模式` → 可观测性埋点与模式解析延伸的字段 / 热点改造纪律。
- `kb/patterns.md #CLI 用法 skill 化模式` + `#约束/操作分离模式` + `#任务类型路由 + 轻量决策边界模式` → 提示词瘦身（流程→skill）与路由表更新的既有范式。
- `kb/patterns.md #CLI --json 成功/失败同契约` + `#help 键命名双规` + `#CLI 退出码语义` → 新增命令面（`req split` / `--workflow-mode`）的契约纪律。
- `kb/troubleshooting.md #Claude Code 实机验证方法（隔离 config + settings.json 派发 subagent；Q1 subagent 不可调 Task）` → dispatch 实测方法 + Claude 侧限制事实。
- `kb/troubleshooting.md #改 templates-data 源须同批重生成「双生成物」（template-loader.ts + update.ts）` + `#build「双生成物」段二分` → 模板改造与收口的生成物纪律。
- `kb/troubleshooting.md #可选字段「读侧补齐」的序列化副作用` + `#flow.json 内容增量核验必含 meta.revision/meta.updated` → 埋点字段与验收口径。
- `kb/patterns.md #双主题收官端到端验收范式（隔离脚本 + 本仓复核二分）` + `#版本号全链路收口清单模式（A/B/C/D/E）` → 收官阶段验收与版本收口。
- **无**「提示词瘦身 / 三模式 / 通用工作者调度」既有条目 → 归档时补沉 architecture（三模式值域与需求级解析、dispatch 双口径通道）与 patterns（瘦身范式：索引壳 + 流程下沉 / 拆分父子模型）。

---

## 二、源码核验结论（以源码为准，行号以 HEAD `11f0bd2` 为准）

### 表 A：可观测性（主题六）

| # | 事实 | 源码位置 | 结论 |
|:-:|------|----------|------|
| A1 | `recordRun` 定义于 `src/core/metrics.ts:79`；`rg "recordRun" src/` 仅自身命中（零调用点）＝**死代码**；`flow metrics`（`src/commands/flow.ts:374`）经 `MetricsStore.getSummaryData()` 读取 | 实测 | 接线须新增「调用点 + agent 归属口径 + duration 口径」；目标 = `flow metrics` 输出真实数据（非空） |
| A2 | 运行日志行格式 `[ISO][LEVEL][pid] message`（`src/core/runtime-log.ts:108`）；**无** duration/project/session 字段；调用点 3 处：`src/cli/index.ts:186`（cli error）/ `:197`（cli start）/ `:205`（cli done exit=） | 实测 | `duration_ms` 落 done 行（`:205`）；`project`/`session_id` 须采集并注入（start/done 对称） |
| A3 | `bin/openfeel.js` 进程入口 `installRuntimeLog()`（单一咽喉，argv 就绪后安装） | 实测 | 进程起始时间戳 / 项目路径 / 会话标识采集注入点 = bin 或模块级（方案期定稿口径） |
| A4 | CLI 日志 **578/5371 条 start 无 done（10.8% 丢失）**——耗时永久丢失 | 分析报告 §8.2 #6 | `duration_ms` 生效前置 = **done 行必写加固**（异常路径亦落 done/error 行） |
| A5 | op 结构 `stages[id].ops[opId]` = `{title,state,assignee,attempts,max_attempts,checkpoints}`（实测）——**无时间戳字段** | `.openfeel/flow.json` 实测 | op 级埋点 = 新增**可选**时间字段（读侧宽容不注入——kb #顶层可选字段模式） |
| A6 | `exec_running` 为**阶段级** phase（n=104 / 86 stage ≈ 1.2，不区分 op） | 分析报告 §8.2 #4 | 「exec_running 细分到 op」须 op 级信号，无法从现有 phase 段推导 |
| A7 | 活跃/闲置语义靠「phase 段 >20min」启发式（在分析脚本层，非 CLI） | 分析报告 §8.3 #4 | 替代 = phase 转换时**显式标注**是否跨会话恢复（依赖 A2 的 session 标识） |

### 表 B：需求接取与拆分（主题一）

| # | 事实 | 源码位置 | 结论 |
|:-:|------|----------|------|
| B1 | `RequirementData` **10 字段**（`src/core/req/types.ts:22+`：id/title/status/target_version/priority/owner/claimed_at/created_at/updated_at/body_path）——**无 parent_id**；`target_version?` 可选 | 实测 | 拆分父子关系须新增可选字段；版本解绑的既有基础 = target_version 本就可选 |
| B2 | `openfeel req` **10 子命令**（`src/commands/req.ts`：add/list/show/claim/release/set/link/advance/board/next）——**无 split** | 实测 | 「拆分为一等动作」= 新增命令 + 字段；形态（名称/参数）方案期定稿 |
| B3 | 认领协议在位：`claim` 占用校验（已被他人占用 → exit 1 零写盘，无 `--force`）+ `release`；`owner` + `claimed_at` | v1.2.0-stage-81/82 既有 | 「接取制为默认调度」的**机制层已具备**；本版强化 = 拆分并行 + 契约（发布/接取/通知 feel） |
| B4 | v1.2.0 裁定 W：本版不归档 `requirements`（归档口径留后续版本） | `.openfeel/plan/v1/v1.2.0/plan.md` | v1.2.1 **维持不归档**——需求解绑版本后与版本切分正交（口径不变，收官文档明示） |
| B5 | 本仓 `flow.json` `requirements: 0` / `reviews: 0`（实测） | 实测 | 承接 REV 空账（无 v1.2.0 遗留 pending REV） |

---

### 表 C：通用工作者调度（主题二 / 三）

| # | 事实 | 源码位置 | 结论 |
|:-:|------|----------|------|
| C1 | opencode 侧 `task: "allow"` 现状：仅 `openfeel-executor` + `openfeel-feel-tester`（8 subagent 中 2/8）；`feel`（primary）已 allow | `src/core/templates-data/opencode/agents/**` 实测 | 直接调度 = 权限扩展 + **先隔离实测**（嵌套 task 行为未实证） |
| C2 | Claude 侧 8 subagent `tools` 白名单**均无 Task**；平台事实：**subagent 不可调 Task**（v1.1.6-stage-69 实证 Q1） | `src/core/templates-data/claude/agents/**` 实测 | Claude 侧**不能**嵌套 Task → 通道须另设计（`[HANDOFF: agent_name]` 原语在位 = 降级通道基础） |
| C3 | 无 explorer agent（两 harness agents 目录各 9 文件）；路由表「调研/探索 → research（general / Explore Agent）」位于 `agents-md/{zh-CN,en}.md:17` + `claude/constraint/{zh-CN,en}.md:17` | 实测 | 新增 agent + 路由行更新 + 计数翻转（9→10）全链路 |
| C4 | utility（事务官，机械操作）保留；设计 §5.5 边界：事务官（无推理机械活）｜探索者（只读推理）｜执行者（读写推理） | 设计 §5.5 + 既有模板 | 探索者/执行者面向「需要推理」的通用任务，不与 utility 重叠 |

### 表 D：三模式架构（主题五）

| # | 事实 | 源码位置 | 结论 |
|:-:|------|----------|------|
| D1 | `WORKFLOW_MODES = ['full','fast']`（`src/core/config.ts:26`）；`ConfigDefaultsSchema.workflow_mode` default `'fast'`（`:36`）；`DEFAULT_CONFIG` 与 schema 逐键默认同键值（单一权威） | 实测 | 值域扩展为 3 值（新增 `general`），保留 `full`/`fast` 字面量**零回归**；展示命名（规划/快速/通用）由文档定稿 |
| D2 | v1.2.0 正交硬约束：`src/core/req/**` 对 `workflow_mode` **零耦合** + **6 禁止串静态断言**（stage-81） | kb `#需求层正交边界架构` + `test/core/req.test.ts` | v1.2.1 **supersede**（需求级模式属性）——断言须**显式改写**（禁删除），kb supersede 记录（归档轮） |
| D3 | `FAST_TRANSITIONS` **9 条目**（`src/core/flow-manager.ts:471`，`plan_review` 必经）；`resolveStageWorkflowMode` 多点消费（`flow-manager.ts:1946/1964/1990`、`commands/flow.ts:434/521/2136`） | 实测 | 需求级解析层须经**单点解析器**延伸（禁第二份判定）；调用点消费面已收敛 |
| D4 | status.md「工作流模式」行（骨架 `src/core/plan/stage.ts:154-159`）+ flow.json 冗余字段（仅新建写入，`stage.ts:216-220`） | 实测 | 值域扩展须同步：骨架值域校验 / `insertStatusField` / 冗余字段校验 / health 第 10 项 |

### 表 E：模板与提示词（主题四）

| # | 事实 | 源码位置 | 结论 |
|:-:|------|----------|------|
| E1 | feel.md **31036 B**（opencode zh-CN）/ **30545 B**（claude zh-CN）；subagent 2.2~10.5KB；zh-CN 两 harness 18 文件合计 ~159KB | `wc -c` 实测 | 瘦身目标载体；验收方向值 = feel.md ≤ 现状 50%（方案期定稿分档） |
| E2 | agent ×2 harness ×2 lang = **36 文件**；约束 ×4（`agents-md/{zh-CN,en}.md` + `claude/constraint/{zh-CN,en}.md`）；共享 skills **18**（实测） | 实测 | 模板改造面（36+4）+ skills 增减计数翻转面 |
| E3 | build **双生成物** `template-loader.ts` + `update.ts`（禁手改）；skill 目录**自动纳入** build；计数翻转先例 = 7 字面量 + 5 派生总数 + `expectedSkills` 白名单 | v1.2.0-stage-84 既有 | 模板 / skill 改造须同批 `npm run build` 重生成 + 计数全枚举翻转 |
| E4 | 既有断言大量引用模板文本（跨 harness 对称断言 / 关键串 `toContain` / 键集断言） | `test/core/{templates,claude-adapter,template-loader,setup,update}.test.ts` | 瘦身重写须**同批同步断言**（先界定断言类 → 全量枚举 → 同批修订，kb #同类缺陷一次全量扫描） |

### 表 F：流水线提速（主题七）

| # | 事实 | 源码位置 | 结论 |
|:-:|------|----------|------|
| F1 | 审查关：full = 3 道（plan/scheme/code）、fast = 2 道（plan/code；FAST_TRANSITIONS 见 D3）；reviewer 占流水线活跃耗时 **~37%** | 分析报告 §3 | 「合并/抽样」= 转移表 + 档位机制变更（方案期定稿档位形态） |
| F2 | transitions **组合条件 `\|` 运算符**在位（多 Agent 并行任一完成即触发推进） | v0.5.3 既有（kb #组合终止条件） | 并行拆分执行的转移层基础**可复用**，无需新增转移语义 |
| F3 | `task` 派发 = 工具时间 **73%**（141.7h，单次均 331s）；主会话 **99%** 时间在等待（task+question 175.6h / 总 177.4h）；subagent 时间轴重叠仅 8.3% | 分析报告（opencode §7 / claude §8.5） | 并行化目标 = 独立子需求 / 子任务并行派发；串行仅限有依赖链 |
| F4 | archiver 中位 **5.9min**、0 离群（固定开销，占 ~11%）；`question` 等待 33.9h / 17.5% | 分析报告 §3 / §1.2 | 「归档轻量化 + 减少提问/批量确认」为提速项（评估→落地） |

---

## 三、关键裁定（本计划的决策基线）

| # | 议题 | **裁定** | 依据/备注 |
|:-:|------|----------|-----------|
| **A** | 执行顺序 | **86→87→88→89→90→91→92→93 严格串行**：可观测性前置（先有度量）→ 需求接取 → 调度机制 → 通用工作者 → 三模式 → 提示词瘦身（收编）→ 提速 → 收官 | 设计 §9 S1~S7 依赖逐条落序（S1 前置 / S3 依赖 S2 / S4 依赖 S3 / S5 依赖 S4 / S6 依赖 S3 且须在 S5 后收编 / S7 依赖 S1+S5） |
| **B** | 本仓自举工作流模式 | v1.2.1 八阶段**全部以 `full` 运行**（架构级变更需完整审计链；归因清晰） | 对齐 v1.2.0 裁定 X；如需切换由 Feel 执行 `openfeel config set defaults.workflow_mode ... --sync-stages` |
| **C** | 模式值域与命名 | `WORKFLOW_MODES` 扩展为 **3 值 `full / fast / general`**（保留既有字面量零回归）；展示命名 **规划 / 快速 / 通用**；`general` 语义 =「无流水线、按需调度通用工作者」形态 | 核验 D1/D3；值域扩展而非改名（零回归原则）；`general` 不新增 phase |
| **D** | 需求级模式属性 | `RequirementData.workflow_mode?`（可选）；解析链 **`status.md 显式 > 需求级 > config > profile > builtin`** 经 `resolveStageWorkflowMode` **单点**延伸；**supersede** v1.2.0「需求层正交边界」——6 禁止串断言**显式改写**为「模式仅经单点解析器消费」类断言 + kb supersede 记录（归档轮） | 核验 D2；设计 §2.3「流水线模式是需求级属性」；断言改写须独立 op 并经审查（防静默弱化） |
| **E** | 默认与流转 | 需求默认走**快速**流水线（「有一定规模的需求」）；用户要求或设置 → `full`；`general → fast/full` **可升级**（显式命令），**不自动降级** | 设计 §7「模式选择 / 流转」 |
| **F** | 拆分模型 | **拆分 = 一等动作**（`req split`，命令形态与参数**方案期定稿**）+ 可选父子字段（`parent_id?`）+ 父子展示；**不做**需求树状态聚合（父不聚合子） | 设计 §3.1/§3.4；父子关系仅作溯源，聚合仍单源 `allLinkedStagesDone`（不新增第二份判定） |
| **G** | 接取制语义（机制层） | feel **发布**（`req add/split`）→ 各 Agent **认领**（`claim` 占用校验在位）→ 完成即 **Handoff 通知 feel** → feel 发布下一步；**并行接取** = 独立子需求并行 claim；机制层由**常驻 feel 中介**（因只有 feel 常驻） | 设计 §2.4/§3；核验 B3；与裁定 H 的「直接调度」是**两套**机制 |
| **H** | 通用工作者调度机制（双口径） | **opencode** = 直接嵌套 `task`（permission 授权扩展；**先隔离实测，go/no-go**）；**Claude Code** = 平台不支持嵌套 Task → 降级通道 = `[HANDOFF: agent_name]` 直发 + feel 即到即派；统一语义 =「**调度请求直发**，不经多级转介」。**降级红线**：若 opencode 实测亦不可行 → 两 harness 统一 Handoff 中介并如实留痕（不虚构能力） | 设计 §2.2；核验 C1/C2；实测方法照 kb #Claude Code 实机验证方法（隔离环境） |
| **I** | 探索者工具集 | `openfeel-explorer` = **`Bash, Read, Glob, Grep`**（只读 4 项，**不加 Skill**）；opencode permission 对标 reviewer 只读块；执行者维持读写工具集（`Edit/Write/TodoWrite`） | 设计 §5.2/§5.3（工具清单为设计定稿）；「先探后执行」原则落契约定稿 |
| **J** | 瘦身口径（单写者纪律） | agent 提示词 =「**skill 索引壳 + 最小约束**」；可复用操作流程一律下沉 skill；CLI 可校验的规则移出提示词（**约束工具化**）；验收方向值 = **feel.md ≤ 现状 50%**（31036B → ≤15.5KB；其余 agent 幅度方案期定稿）。**单写者纪律**：88~90 只做**最小必要落文**（功能性规则行 / 新文件），91 统一收编重写（吸收 87~90 全部语义） | 设计 §5；核验 E1~E4；避免「瘦身后又大改」的重复改写 |
| **K** | 审查档位 | 三档「**免审 / 快线 / 全量**」按模式与规模裁剪（合并 / 抽样）；**转移表层**实现；**不破坏** blocking REV 门、审计与 `--dry-run` 语义；档位判据与配置形态方案期定稿 | 设计 §4（小改免审 / 计划与方案审查合并 / 高风险才走满 3 道）；核验 F1 |
| **L** | 并行拆分执行 | 拆分 = 一等动作（87）+ 并行编排契约与**组合转移复用**（92）；**并行仅限独立子任务**（无依赖），有依赖仍串行 | 设计 §3.3/§4；核验 F2/F3 |
| **M** | 版本解绑 | 需求**不绑版本**（`target_version` 维持可选、不作为门）；**版本号仅在发布时推进**（契约 + 文档）；`requirements` 归档口径**维持不归档**（v1.2.0 裁定 W 延续——需求与版本切分正交） | 设计 §2.3；核验 B1/B4；口径变更须先回答「跨版本需求如何切分」——本版不做 |
| **N** | 可观测性边界 | 不建 dashboard、不改 phase 枚举；埋点新增字段一律**可选 + 读侧宽容**（防 `load→save` 注入存量文件，kb 先例）；`metrics.json` 语义（含闲置）须与活跃/闲置标注联合解释并文档明示 | 核验 A1~A7；设计 §8 四项为最小改造集（另并入分析 §8.2#6 done 必写加固） |
| **O** | 文档与模板纪律 | 全阶段遵守：跨 harness × 语言模板对称四律（节锚点插入 / 提取式切片字节等值 / 无裸主语 / 插入外零改动）；templates-data 改造同批 `npm run build`（双生成物禁手改）；计数类事实**全枚举**翻转 | kb #跨 harness × 语言模板对称纪律 / #双生成物 / #陈旧计数全枚举 |
| **P** | 边界（不做） | 见 §七 | 设计「不做」清单 + 减法优先 |

---

## 四、阶段概览、依赖图与执行顺序

| 阶段 | 主题 | 名称 | 核心交付 | 依赖 | op 估 |
|------|:--:|------|----------|------|:--:|
| `v1.2.1-stage-86` | 可观测性 | 可观测性改造 | ① 接线 `recordRun`（落点候选 = 阶段推进 / attempt 触发 + phase→agent 归属；至少一处真实调用 → `flow metrics` 非空）② CLI 日志补 `duration_ms`（done 行）/`project`/`session_id` + **done 行必写加固**（异常路径）③ op 级 phase 埋点（flow.json op 可选时间字段，读侧宽容）④ 活跃/闲置语义标注（phase 转换显式标注跨会话恢复，替代 >20min 启发式）+ 单测 | — | 3 |
| `v1.2.1-stage-87` | 需求 | 需求接取制度与拆分 | ① 拆分一等动作（`req split` + `parent_id?` 可选字段 + 父子展示）② 并行接取就绪视图（board/next 增强，方案期定稿范围）③ 版本解绑语义（需求不绑版本；仅发布推进版本号；CLI/文档口径核验）+ i18n + 单测 | hard: 86 | 3 |
| `v1.2.1-stage-88` | 调度 | 通用工作者直接调度机制 | ① 平台能力核验（opencode 嵌套 task **隔离实测**；Claude Task 限制复核 + Handoff 通道确认）② 机制落地（opencode permission `task` 授权扩展；Claude 通道裁定落档）③ 最小必要规则落文 + 断言（模板权限断言；「subagent 不调用 Task」类措辞清单化） | hard: 87 | 3 |
| `v1.2.1-stage-89` | 工作者 | 通用工作者：探索者与执行者 | ① 新增 `openfeel-explorer`（templates ×2 harness ×2 语言 + frontmatter 结构化映射 + build 纳入）② 执行者通用化 + 路由表更新（`agents-md` / `claude/constraint` ×4 路由行「调研/探索 → 探索者」）③ agent **9→10** 计数全枚举翻转 + 断言 | hard: 88 | 3 |
| `v1.2.1-stage-90` | 模式 | 三模式架构（规划/快速/通用） | ① 值域扩展（`WORKFLOW_MODES` 3 值；骨架 / 冗余字段 / health 同步；零回归）② 需求级模式属性（字段 + 解析级联单点 + **supersede 断言显式改写**）③ 规模驱动默认与升级路径（`req add/set --workflow-mode`、`flow mode` 适配、不自动降级）+ i18n + 单测 | hard: 89 | 3 |
| `v1.2.1-stage-91` | 提示词 | 提示词瘦身与上下文治理 | ① 流程 → skill 下沉（新增 / 增补 skill + 约束工具化清单）② 36 agent 模板 + 4 约束文件**索引壳化重写**（收编 87~90 全部语义；先例四律）③ 上下文治理（compact / 工具结果 / 按需加载指引落 skill 与约束；harness 能力边界留痕）④ build 双生成物 + 静态断言（尺寸方向值 / skill 索引引用完整性 / 跨 harness 对称）+ 计数翻转 | hard: 88, 89, 90 | 4 |
| `v1.2.1-stage-92` | 提速 | 流水线提速与并行拆分执行 | ① 审查档位与合并（免审/快线/全量；转移表层 + `flow phases` 展示 + 断言；契约 delta 按**瘦身后范式**）② 并行编排与交互提速（拆分并行契约 + 组合转移复用 + 减少提问/批量确认 + 缩短长子会话指引 + 会话卫生可行性核验）③ 归档轻量化（archiver 固定开销；机械步骤下沉 utility/脚本，评估→落地）+ 单测 | hard: 86, 90, 91 | 3 |
| `v1.2.1-stage-93` | 收官 | 文档与版本收口（v1.2.1 收官） | 文档多载体（README×3 + GETTING_STARTED + commands + manual（新 agent / 可观测性 / 三模式）+ cli-usage skill 快照）+ CHANGELOG `[1.2.1]` + 版本 **1.2.1** 全链路 A/B/C/D/E + roadmap/plan 回填 + **七主题端到端验收** + 承接 REV 处置表 | hard: 91, 92 | 3 |

### 依赖图与执行顺序（**严格串行**）

```text
stage-86 ─▶ stage-87 ─▶ stage-88 ─▶ stage-89 ─▶ stage-90 ─▶ stage-91 ─▶ stage-92 ─▶ stage-93
 可观测性     需求接取      调度机制      通用工作者     三模式      提示词瘦身     提速        收官
   └──── 度量前置 ────┘   └────── 语义冻结 ──────┘            └─ 收编 ─┘  └─ 增量 ─┘
```

**执行顺序：86 → 87 → 88 → 89 → 90 → 91 → 92 → 93。**

**各阶段明细（目标 / 任务表 / 约束 / 验收要点 / 依赖）见附录 A。**

**为何 8 阶段（对齐设计 §9 S1~S7 + 收官）**：

1. **可观测性前置**（S1）——设计 §8 明示：本批提速举措若无埋点则无法度量，故列为前置；且 86 的 session 标识是 91/92 验收的度量基础。
2. **机制三段性质不同**——需求接取（87：`req` 命令面 + 字段 + 语义）｜调度机制（88：平台能力实测 + 权限 + 通道裁定）｜通用工作者（89：新 agent 全链路 + 路由 + 计数）——各自独立审查焦点。
3. **瘦身须在语义冻结后**（91 收编 87~90）——单写者纪律（裁定 J）：避免「瘦身后又大改」；否则 36+4 文件将被重写两次。
4. **提速放瘦身后**（92）——审查档位 / 转移表变更以**功能面**先冻结，契约 delta 按瘦身后范式（skill 化）落文，减少对新建索引壳的二次改写。
5. **收官独立**（93）——版本收口 op 须为最终 op（v1.1.6 / v1.1.7 / v1.2.0 既有口径）；文档载体收敛（README / docs / manual）与端到端验收须在全部内容冻结后。

---

## 五、建议阶段注册表（供 Feel 经 CLI 执行；本计划**不推进 phase**）

| # | stageId | 名称 | deps | exec-mode | auto-advance | workflow-mode |
|:-:|---------|------|------|:--:|:--:|:--:|
| 1 | `v1.2.1-stage-86` | 可观测性改造 | — | auto | enabled | full |
| 2 | `v1.2.1-stage-87` | 需求接取制度与拆分 | `v1.2.1-stage-86` | auto | enabled | full |
| 3 | `v1.2.1-stage-88` | 通用工作者直接调度机制 | `v1.2.1-stage-87` | auto | enabled | full |
| 4 | `v1.2.1-stage-89` | 通用工作者：探索者与执行者 | `v1.2.1-stage-88` | auto | enabled | full |
| 5 | `v1.2.1-stage-90` | 三模式架构（规划/快速/通用） | `v1.2.1-stage-89` | auto | enabled | full |
| 6 | `v1.2.1-stage-91` | 提示词瘦身与上下文治理 | `v1.2.1-stage-88` `v1.2.1-stage-89` `v1.2.1-stage-90` | auto | enabled | full |
| 7 | `v1.2.1-stage-92` | 流水线提速与并行拆分执行 | `v1.2.1-stage-86` `v1.2.1-stage-90` `v1.2.1-stage-91` | auto | enabled | full |
| 8 | `v1.2.1-stage-93` | 文档与版本收口（v1.2.1 收官） | `v1.2.1-stage-91` `v1.2.1-stage-92` | auto | enabled | full |

- **注册命令**（Feel 执行）：`openfeel plan stage add <stageId> --deps <ids...> --tasks <items...> --exec-mode auto --auto-advance enabled --workflow-mode full`；随后 `openfeel flow advance --stage <stageId> --to plan_pending`。
- **review-agent**：全部 `openfeel-reviewer`。
- **op 级依赖**（`ops/deps.yaml`）由 openfeel-schemer 在各阶段产方案时落盘（hard / soft / mutual_exclusion，声明实际文件名）。
- **本计划已代 Feel 落盘**：`.openfeel/roadmap/v1.2.1.md` + `.openfeel/plan/v1/v1.2.1/{plan.md,deps.yaml}`；**阶段目录 / status.md 骨架、flow.json 注册与 phase 推进仍由 Feel/CLI 执行**。
- **计划纪律（REV-85-002 固化）**：每阶段计划须含「承接 REV 与处置表」（上游 pending REV 逐条去向三分：本阶段处置 / 显式转后续 / 台账保留·销账）+ `deps.yaml notes` 同步承接声明；判据 = 上游『转下阶段』条目零丢失。本版上游 = v1.2.0 收口（pending REV 空账，实测 `reviews: 0`）。

## 六、版本收口清单（1.2.0 → 1.2.1，A/B/C/D/E，归 stage-93）

> 依据 `kb/patterns.md #版本号全链路收口清单模式` + `#文档侧历史标记纳入版本收口禁改白名单`；以**内容特征**判定，不以行号为准；B 类为**双生成物**。

- **A 手工载体**（6 载体 / 8 文件 / 10 处，承 v1.2.0 口径）：`package.json`（`version`）；`package-lock.json`（root 两处，**禁 `npm install` 重生成**）；`.openfeel/config.yaml`（`meta.version` **单行 edit，禁整文件重写**）；`src/core/config.ts`（`CONFIG_TEMPLATE_ZH` / `_EN` 各一处版本行）；`src/core/templates-data/agents-md/{zh-CN,en}.md`（「当前 v1.x」行）；`src/core/templates-data/claude/constraint/{zh-CN,en}.md`（同款版本行）。**实施前以内容特征扫描兜底**（`rg "当前 v1\.2\.0"` 全仓逐命中判类——核验 kb #多 harness 版本收口 A 类清单扩展）。
- **B 生成段（双份）**：`src/core/template-loader.ts` + `src/core/update.ts`，由 `npm run build` 重生成（**禁手改**；`git status --porcelain src/` 干净断言）。**注**：stage-91 瘦身亦触发本双份重生成（同批）。
- **C 传播**：`CHANGELOG.md` 追加 `## [1.2.1]`（显著登记：`req split` / 需求级模式 / 三模式 / 新 agent `openfeel-explorer` / dispatch 机制 / 可观测性字段 / 审查档位）；`README*`（能力节 + 测试数）；`docs/commands.md`（`req split` 与 `--workflow-mode`）；`docs/GETTING_STARTED.md`（快照 + 模式指引）；`templates-data/skills/openfeel-cli-usage/SKILL.md`（快照 v1.2.1 + 新命令 / 模式节）。
- **D 禁改**：`src/**` 历史批注（`v1.2.0-stage-*` 示例）、依赖自身版本、manual 变更历史、`test/**` 注释、`docs/phase-*/**`；**文档侧能力引入标记**（「v1.2.0 起」等）**白名单化**处理（file:line 显式枚举）。
- **E 无载体**：`docs/design-philosophy.md` 等非版本型文档（仅当能力描述失实时按需改，非版本收口项）。
- **CLI `VERSION` 常量不存在**：`--version` 直读 `package.json`。

---

## 七、边界（不做）

1. 不做**需求间运行时 DAG 调度 / 需求树状态聚合**（父子关系仅作溯源；聚合仍单源 `allLinkedStagesDone`）。
2. 不做 `requirements` 随版本归档（裁定 M 维持 v1.2.0 裁定 W；口径变更须先回答「跨版本需求如何切分」）。
3. 不做 TTL / 心跳抢占（`req release` 显式释放；认领协议不变）。
4. 不改 phase 枚举（15 项）/ `checkpoint_mapping` / `phase_corrections` / `advanceAccepted` 语义；不改 `.openfeel/pipeline.yaml` 既有内容（除非审查档位方案期裁定必需，且须零回归论证）。
5. **Claude 侧不强求嵌套 Task**（平台限制，裁定 H 双口径）；不引入第三方依赖；不改 CI workflow；不触碰 `build.js` / `package.json`（除模板重生成与版本收口必需）。
6. 不做 dashboard / 可视化（可观测性 = 埋点 + 既有命令消费）；不改 CLI 日志文件布局（四类日志边界不变）。
7. `openfeel-reviewer` 模型档位（`glm-5.3-flash` → 降本建议）为**部署侧配置项**（可经 `openfeel model` 调整），**不属本版本代码变更范围**（用户决策）。
8. 会话卫生（一次性调研子会话自动 archive）为**平台侧能力**——stage-92 核验；不可控则文档留痕为边界（不虚构实现）。
9. 不 `npm publish`、不 `git push`；**不直写 `flow.json`**；不推进流水线 phase（由 Feel 经 CLI 执行）。
10. 不破坏既有 `--json` 契约（既有命令输出只增不改；新命令自身遵循 `schemaVersion:1`）。

## 八、全局验收标准（版本级）

1. **门禁**：`npm test` 全绿（`0 skipped / 0 failed`，登记值 ≥ 70 文件 / 1557 用例 + 本版新增）；`npx tsc --noEmit` = 0；`openfeel lint i18n` = 实测新基线（> **911**，各阶段显式登记）；`openfeel lint kb` = 0 过期；`npm run build` ×2 幂等（`git status --porcelain src/` 空）；`node bin/openfeel.js --version` == `1.2.1`。
2. **可观测性**（主题六）：跑一轮真实命令后——① `.openfeel/metrics.json` 非空且 `flow metrics` 展示真实数据（run 级耗时 + agent 归属）；② CLI 日志行含 `duration_ms`（done 行）/`project`/`session_id`；③ done 行覆盖率加固生效（异常路径亦落行）；④ flow.json 含 op 级时间戳（可选字段，旧文件零注入）；⑤ 跨会话恢复可显式分辨（不再依赖 >20min 启发式）。
3. **需求接取与拆分**（主题一）：`req split` 实跑（父子关系 + 子需求独立可用）；并行接取 = 两子需求并行 claim 互不阻塞；版本解绑 = 无 `target_version` 的需求全生命周期可用；认领占用校验零回归。
4. **调度机制**（主题二）：opencode 嵌套 task 隔离实测记录（go/no-go 结论 + 命令三要素）；Claude 侧 Handoff 通道生效记录；两 harness 通道文档双口径一致（无「不实机」含糊）。
5. **通用工作者**（主题三）：`openfeel-explorer` 双 harness 双语言可加载；工具集恰为 `Bash/Read/Glob/Grep`（无写工具，阴性断言）；路由表指向探索者；agent 计数 9→10 全枚举一致（模板 / 断言 / 文档）。
6. **三模式**（主题五）：值域 3 值可用；需求级模式解析（显式 > 继承 > 默认）经单点；`general → fast/full` 升级可用、不自动降级；**既有 full/fast 行为逐字不变**（零回归断言）；supersede 断言改写经审查确认（非静默删除）。
7. **提示词瘦身**（主题四）：feel.md 体积 ≤ 现状 50%（方案期定稿分档；方向值）；全部 agent 提示词含 skill 索引节；被引用的 skill 全部存在（引用完整性断言）；「流程 → skill」清单成文（无遗漏在提示词内的可复用操作流程）；build 双生成物幂等。
8. **提速**（主题七）：审查档位按模式 / 规模生效（转移表 + 断言）；并行组合转移复用可用（隔离实测）；归档轻量化落地项实测（机械步骤下沉后 archiver 阶段清单缩减）；交互提速契约成文。
9. **零回归**：既有命令输出 / `--json` 契约 / phase 枚举（15）/ `advanceAccepted` 逐字不变（除有意变更且登记）；`flow.json` 存量文件未被注入新可选字段（`load→save` 零注入断言）；本仓复核（v1.2.0 归档态 + 8 阶段全 done）。
10. **文档与版本**：版本 **1.2.1** 全链路 A/B/C/D/E（A 类残留 0）；CHANGELOG / README×3 / GETTING_STARTED / commands / manual / cli-usage skill 同步；roadmap v1.2.1 回填。

---

## 九、风险总览

| # | 风险 | 影响 | 缓解 |
|:-:|------|------|------|
| **R-1** | **提示词瘦身语义丢失**（36+4 文件重写，既有断言大量引用模板文本） | **高** | 单写者纪律（裁定 J）+ 流程清单先成文后落文 + 断言先界定类再全量枚举同批修订（核验 E4）+ 审查聚焦「语义等价」 |
| **R-2** | **supersede 断言静默弱化**（`src/core/req/**` 6 禁止串断言改写为宽松断言） | **高** | 断言改写独立 op + 差额对照（旧断言 → 新断言逐条说明）+ 指定「模式仅经单点解析器消费」正向断言 + kb supersede 记录 |
| **R-3** | **dispatch 平台不确定性**（opencode 嵌套 task 未实证；Claude 平台限制） | **高** | 隔离实测先行（裁定 H；方法照 kb #Claude Code 实机验证方法）+ 降级红线预先成文（统一 Handoff 中介 + 留痕） |
| **R-4** | **三模式值域扩散**（config / schema / 骨架 / 冗余字段 / health / `flow mode` / `flow phases` / wizard 等消费点） | 中 | 单点解析器延伸（裁定 D）+ 消费点全枚举清单（承 v1.1.7 模式先例）+ 零回归断言（full/fast 逐字） |
| **R-5** | **审查档位弱化审计**（免审批档） | 中 | 档位显式声明 + 审计留痕（advance 记录档位）+ 不破坏 blocking REV 门与 `--dry-run` 语义 + 高风险强制全量 |
| **R-6** | **新 agent 计数 / 键集翻转遗漏**（9→10 多形态表达） | 中 | 全枚举纪律：双路扫描（标准正则 + 宽词界）+ 表格式差集 + 白名单枚举（kb 先例） |
| **R-7** | **可观测性埋点触碰热点**（`flow-manager` 推进路径 / `runtime-log` 咽喉） | 中 | 可选字段读侧宽容（零注入断言）+ 零回归取证范式（补丁前/后归一化快照 diff 空）+ bin 单一咽喉不破坏 |
| **R-8** | **metrics 语义误导**（phase 窗口含跨会话闲置） | 中 | 与活跃 / 闲置标注联合口径 + 文档明示 + `flow metrics` 展示口径标注（裁定 N） |
| **R-9** | **拆分字段与聚合耦合**（parent_id 误入聚合判定） | 中 | 裁定 F：父子仅溯源；聚合单源断言（禁第二份 `.every(`——承 REV-83-002 纪律） |
| **R-10** | 模板改造遗漏 build 重生成（源改生成物未改） | 中 | 双生成物同批 `npm run build` + `--porcelain` 断言 + 计数全枚举（核验 E3） |
| **R-11** | 本仓自举期误用新机制（v1.2.1 阶段被误设 general / 误拆分） | 低 | 本仓八阶段 workflow-mode=full 显式登记（裁定 B）；需求账空（`requirements: 0`）无从误关联 |

**回滚**：各阶段均可 `git revert` 对应提交；字段类变更（`parent_id` / `workflow_mode` / op 时间戳）缺省即回落（读侧宽容）；`metrics.json` / 日志字段为增量（旧行兼容）；模板类回滚以源文件 + build 重生成。无数据格式破坏。

## 十、开放问题（留待实施期定稿 / 用户确认）

- **Q1**：`session_id` 采集链（多 harness env 探测名 → 会话续接文件 → 进程 UUID 兜底）与「人工 / 自动化」区分口径 → **stage-86 方案期定稿**。
- **Q2**：`recordRun` 接线落点与 duration / 归属口径（阶段推进触发 + phase→agent 映射 vs attempt 触发 + 命令时长）→ **stage-86 方案期定稿**（要求至少一处真实调用）。
- **Q3**：dispatch 实测 go/no-go 判据与降级红线（opencode 嵌套 task 实测；失败时两 harness 统一 Handoff）→ **stage-88 执行期定稿 + 留痕**。
- **Q4**：`req split` 命令形态（`--into` 列表 vs 交互）与字段名（`parent_id` vs `split_from`）→ **stage-87 方案期定稿**。
- **Q5**：`general` 模式与已链接阶段的需求的边界（设 general 时已存阶段如何处置：禁设 / 降级提示 / 保留）→ **stage-90 方案期定稿**。
- **Q6**：审查档位的档数、判据（规模阈值）与配置形态（config 键 vs 转移表变体）→ **stage-92 方案期定稿**。
- **Q7**：瘦身量化分档（feel.md 目标值；其余 agent 目标）与「流程→skill」清单边界（哪些属可复用流程）→ **stage-91 方案期定稿**。
- **Q8**：会话卫生（子会话自动 archive）平台能力核验结论与处置（opencode 配置可达性）→ **stage-92 核验后定稿**。
- **Q9**：本仓 v1.2.1 八阶段是否以 full 运行（裁定 B 默认 full）→ 如切 fast 仅需 Feel 执行 `openfeel config set defaults.workflow_mode fast --sync-stages`（无需改计划）。

---

## 十一、端到端验收（实现后，由用户 / 测试官执行）

1. **静态门禁**：见 §八.1。
2. **可观测性实跑**（隔离临时项目 + 本仓）：`flow attempt` / `flow advance` 实跑 → `metrics.json` 增条目 + CLI 日志 done 行含 3 字段 + flow.json op 时间戳 + 跨会话标注可辨；旧 flow.json 纯 `load→save` 零注入（字节级断言）。
3. **需求拆分与并行接取**（隔离临时项目）：`req add` → `req split` 两子需求 → 两个 owner 并行 `claim` 互不阻塞 → 子需求各自 link 阶段 → 聚合 / 状态流转零回归。
4. **dispatch 实测**（opencode 隔离环境；Claude Code 实机）：opencode 子 agent 嵌套派发 exploration / execution 任务（go/no-go 记录）；Claude 子 agent 输出 `[HANDOFF: ...]` → 主会话派发（链路记录）。
5. **探索者实机**（两 harness）：路由「调研/探索」任务 → 调用 `openfeel-explorer`（只读行为验证：无写盘副作用）；对照旧路径（general/Explore）行为差异记录。
6. **三模式实跑**（隔离临时项目）：`req add --workflow-mode general` → `req set --workflow-mode fast` 升级 → 阶段按 fast 链推进；`--workflow-mode full` 全量链推进；不自动降级（断言）。
7. **提示词瘦身度量**：feel.md 体积前后对比（目标 ≤50%）+ 全 agent skill 索引节断言 + 被引用 skill 存在性全量校验 + `npm run build` ×2 幂等。
8. **提速机制**：审查档位按档生效（低风险免审档实跑 / 高风险全量档实跑）；并行组合转移实跑（两独立 op 并行完成 → 任一触发推进）。
9. **零回归**：v1.2.0 既有命令（`req` 10 子命令 / `flow archive` / 双模式行为）逐字回归；`flow phases` / `advanceAccepted` 逐字不变；本仓复核（归档态 9 组 + 8 阶段）。
10. **Agent 实机**（Claude Code + opencode 各一次）：Feel 按新契约处理「需求发布 → 接取 → 流转 → 完成」（含拆分并行）；子 agent 按新契约直发调度请求；文档 / 模板措辞与 CLI 输出一致。

## 十二、修订记录

| 时间 | 制定人 | 说明 |
|------|--------|------|
| 2026-10-15 | openfeel-planner | 初稿：依据 `docs/v1.2.1-design.md`（用户定稿）制定七主题版本计划——8 阶段（86~93，对齐设计 §9 S1~S7 + 收官）；源码核验 6 表 28 项；关键裁定 A~P；里程碑 M41~M48；版本收口清单 A/B/C/D/E；风险 R-1~R-11；开放问题 Q1~Q9。**只写计划文档，未改源码、未直写 flow.json、未推进 phase。** |
| 2026-10-15 | openfeel-planner | 补全：新增附录 A「阶段明细」（每阶段 目标 / 任务表 / 约束 / 验收要点 / 依赖）+ §四 附录指针。**只改计划文档。** |

---

## 附录 A：阶段明细（目标 / 任务表 / 约束 / 验收要点 / 依赖）

### stage-86 可观测性改造

- **目标**：建立度量基线——`recordRun` 接线、CLI 日志 3 字段、op 级埋点、活跃/闲置标注（设计 §8 前置）。
- **任务表**：T1 接线 `recordRun`（至少一处真实调用 → `flow metrics` 非空；Q2 落点方案期定稿）；T2 CLI 日志 `duration_ms`/`project`/`session_id` + done 行必写加固（Q1 采集链方案期定稿）；T3 op 级时间字段（可选 + 读侧宽容）；T4 跨会话恢复显式标注（依赖 T2）；T5 i18n + 单测 + 门禁。
- **约束**：不改 phase 枚举；不做 dashboard；埋点字段一律可选（存量 `load→save` 零注入）；`bin/openfeel.js` 单一咽喉不破坏；四类日志边界不变（裁定 N）。
- **验收要点**：`metrics.json` 非空且 `flow metrics` 展示真实数据；日志行含 3 字段；done 行覆盖率加固；op 时间戳可读；跨会话可辨；零注入字节级断言。
- **依赖**：无。

### stage-87 需求接取制度与拆分

- **目标**：拆分＝一等动作；并行接取就绪；版本解绑语义（设计 §2.3/§2.4/§3）。
- **任务表**：T1 `req split` + `parent_id?` 可选字段 + 父子展示（Q4 形态方案期定稿）；T2 `req board`/`req next` 并行接取就绪增强；T3 版本解绑口径核验（CLI/文档「仅发布推进版本号」）；T4 i18n + 单测。
- **约束**：父子关系仅溯源（聚合单源 `allLinkedStagesDone`，禁第二份判定——承 REV-83-002）；不做需求树聚合；`requirements` 不归档（裁定 F/M）；命令面 `--json` 同契约 + help 键双规；`claim` 协议零改动。
- **验收要点**：split 实跑（父子独立可用）；两 owner 并行 claim 互不阻塞；无 `target_version` 全程可用；占用校验零回归。
- **依赖**：hard: 86。

### stage-88 通用工作者直接调度机制

- **目标**：冻结并落地「任意 agent 直接调度通用工作者」机制（双口径，设计 §2.2）。
- **任务表**：T1 平台能力核验（opencode 嵌套 task 隔离实测 go/no-go + Claude Task 限制复核 + Handoff 通道确认——Q3）；T2 机制落地（opencode permission `task` 授权扩展 + Claude 通道裁定落档）；T3 最小必要规则落文 + 断言（权限断言 + 「subagent 不调用 Task」措辞清单化）。
- **约束**：实测先行（不得未经实测假设能力）；降级红线预先成文（裁定 H）；单写者纪律（散文收编归 91）；模板改造同批 `npm run build` 双生成物。
- **验收要点**：实测记录（命令 + 版本 + 环境三要素 + go/no-go 结论）；模板权限断言；两 harness 通道口径一致（无含糊）。
- **依赖**：hard: 87。

### stage-89 通用工作者：探索者与执行者

- **目标**：新增只读探索者 + 执行者通用化 + 路由表更新（设计 §6）。
- **任务表**：T1 `openfeel-explorer` ×2 harness ×2 语言 + frontmatter 结构化映射 + build 自动纳入；T2 执行者通用化 + 路由行 ×4（`agents-md:17` + `claude/constraint:17`）；T3 agent 9→10 计数全枚举翻转 + 断言。
- **约束**：探索者只读 4 工具（阴性断言，不加 Skill——裁定 I）；跨 harness 对称四律；键集断言非内容断言；utility 边界不动（设计 §5.5）。
- **验收要点**：explorer 双 harness 双语言可加载；无写工具；路由指向正确；计数全枚举一致。
- **依赖**：hard: 88。

### stage-90 三模式架构（规划/快速/通用）

- **目标**：值域 3 值 + 需求级模式属性（含 supersede）+ 规模驱动默认与升级路径（设计 §2.3/§7）。
- **任务表**：T1 值域扩展（消费点全枚举同步）；T2 需求级字段 + 解析单点延伸 + **supersede 断言显式改写**（独立 op + 差额对照）；T3 CLI（`req add/set --workflow-mode` + `flow mode` 适配）+ i18n + 单测。
- **约束**：保留既有字面量零回归；解析经单点（禁第二份）；断言改写**禁删除**（R-2）；kb supersede 记录归归档轮；`general` 不新增 phase（裁定 C/D/E）。
- **验收要点**：3 值可用；需求级解析（显式 > 继承 > 默认）；`general → fast/full` 升级可用、不自动降级；full/fast 行为逐字不变；supersede 经审查确认。
- **依赖**：hard: 89。

### stage-91 提示词瘦身与上下文治理

- **目标**：流程 → skill 下沉 + 36+4 文件索引壳化（收编 87~90 全部语义）+ 上下文治理（设计 §5）。
- **任务表**：T1 流程 → skill 清单与落文 + 约束工具化清单（Q7 边界方案期定稿）；T2 agent 模板 + 约束文件索引壳化重写（含新语义）；T3 上下文治理指引（compact / 工具结果 / 按需加载；harness 边界留痕）；T4 build 双生成物 + 静态断言 + 计数翻转。
- **约束**：**单写者**（本阶段为唯一收编点——裁定 J）；对称四律；被引用 skill 必存在（引用完整性断言）；尺寸方向值 feel.md ≤ 50%（Q7 分档）。
- **验收要点**：体积达标；全 agent 含 skill 索引节；引用完整性；build 幂等；既有模板断言同批修订（R-1 缓解）；「流程 → skill」清单成文。
- **依赖**：hard: 88, 89, 90。

### stage-92 流水线提速与并行拆分执行

- **目标**：审查档位三档 + 并行编排 + 交互提速 + 归档轻量化（设计 §4）。
- **任务表**：T1 审查档位与合并（免审/快线/全量——转移表层 + `flow phases` 展示 + 断言；Q6 方案期定稿）；T2 并行编排与交互提速（拆分并行契约 + 组合转移 `|` 复用 + 减少提问/批量确认 + 缩短长子会话指引 + 会话卫生核验——Q8）；T3 归档轻量化（机械步骤下沉 utility/脚本，评估→落地）。
- **约束**：不破坏 blocking REV 门 / 审计 / `--dry-run` 语义；并行仅独立子任务（裁定 L）；契约 delta 按瘦身后范式（skill 化）；平台不可控项留痕不虚构（R-5）。
- **验收要点**：档位按档生效（低风险免审 + 高风险全量实跑）；并行组合转移实跑；归档轻量化落地项实测；交互提速契约成文。
- **依赖**：hard: 86, 90, 91。

### stage-93 文档与版本收口（v1.2.1 收官）

- **目标**：文档多载体 + 版本 **1.2.1** 全链路 + 七主题端到端验收（收口 op = 最终 op）。
- **任务表**：T1 文档多载体（README×3 / GETTING_STARTED / commands / manual / cli-usage skill 快照）；T2 版本收口 A/B/C/D/E + CHANGELOG `[1.2.1]`；T3 端到端验收（§十一）+ roadmap/plan 回填 + 承接 REV 处置表。
- **约束**：收口 op = 阶段最终 op（v1.2.0 口径）；A 类内容特征扫描兜底；D 类白名单 file:line 显式枚举；验收二分（隔离脚本 + 本仓复核——kb 范式）。
- **验收要点**：§八 全项通过；A 类残留 0；`--version` == 1.2.1；roadmap v1.2.1 回填；文档与 CLI 输出一致。
- **依赖**：hard: 91, 92。
