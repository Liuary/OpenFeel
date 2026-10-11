# v1.1.7-stage-76 计划 — 模板与 skill 模式感知（标记双读者 ②）

- **阶段**：`v1.1.7-stage-76`
- **依赖**：**hard: `v1.1.7-stage-74` `v1.1.7-stage-75`**（标记语义与命令面均已定稿，模板才可引用）
- **优先级**：P0（**Agent 行为契约**面：决定 fast 下谁被调度、谁轻量化）
- **制定人**：openfeel-planner ｜ **制定时间**：2026-10-11（**REV-76 修订轮：2026-10-11 18:38**）
- **定位**：实现「标记双读者」的**第 ② 位读者**——Agent 读 `status.md「工作流模式」`自知是否被调度 / 是否轻量化产出。改造面 = **Agent 模板（2 harness × 2 语言对称）** + **中立共享 skills** + **全局约束层模式注记** + build 重生成 + **fast 快线表必经计划审查修订（T7：引擎常量 + 文案 + 测试同步）[需求变更 2026-10-11 修订]**。**不减任何落盘结构**（骨架全量铺由 CLI 保证，见 stage-75 T6）。
- **范围**：`src/core/templates-data/opencode/agents/{zh-CN,en}/{feel,openfeel-planner,openfeel-schemer,openfeel-executor,openfeel-reviewer,openfeel-feel-tester,openfeel-archiver}.md`、`src/core/templates-data/claude/agents/{zh-CN,en}/`（**实测各 9 份**〔含 `openfeel-utility`/`openfeel-vision`〕，本阶段改动 **6 类 + feel**）[REV-76-008 修订]、**`src/core/templates-data/agents-md/{zh-CN,en}.md`** 与 **`src/core/templates-data/claude/constraint/{zh-CN,en}.md`**（仅模式注记两处）[REV-76-001 修订]、`src/core/templates-data/skills/{openfeel-cli-usage,openfeel-get-stage-status,openfeel-update-stage-status,openfeel-wizard}/SKILL.md`（按需）、**`src/core/template-loader.ts` 与 `src/core/update.ts`（均为 build 重生成，禁手改）**[REV-76-002 修订]；`test/core/templates.test.ts`、`test/core/template-loader.test.ts`、`test/core/claude-adapter.test.ts`；**[需求变更 2026-10-11 修订] 引擎快线表修订（T7）**：`src/core/flow-manager.ts`（仅 `FAST_TRANSITIONS` 常量及其注释，经单一取表点传导）、`src/core/config.ts`（仅 `WorkflowMode` 注释 + `CONFIG_TEMPLATE_{ZH,EN}` fast 说明行——**文案**）、`src/core/i18n-data/{zh-CN,en}.ts`（仅 `flow.wizard.modeFast` **文案**）、`test/core/flow-manager.test.ts`、`test/commands/flow.test.ts`（stage-74 fast 断言同步）。
- **边界**：**除 T7 单点修订外**不改 CLI/引擎代码（引擎/命令面冻结于 74/75；**[需求变更 2026-10-11 修订]** T7 = stage-74 成果的需求变更修订，**仅** `FAST_TRANSITIONS` 常量 + 相关**文案**（`config.ts` 注释/模板 + `i18n-data` 两键文本）+ **测试同步**，禁第二处改表、禁改 `getValidTargets` 签名 / phase 枚举 / 命令面）；不改 phase 枚举；`agents-md` / `claude/constraint` **仅改模式注记两处**（路由表行 + 调度段；[REV-76-001 修订]——**不得**沿用「不含模式纪律」的排除理由；机制性模式纪律仍属 Agent 层）；不新增 skill；不改 CI；不新增依赖。

## KB 检索（`openfeel-check-kb`）

- 已加载。**高度相关条目**：
  - `kb/patterns.md #平台无关化「描述泛化」原则` → 模式纪律措辞须**能力名中立**（不绑定单一 harness 工具名）；涉及 harness 特化处用「`### opencode 适配器` / `### Claude Code 适配器`」双平台分节（v1.1.6-stage-70 既定模式）。
  - `kb/patterns.md #多 harness 版本载体清单扩展` + `kb/troubleshooting.md #双层模板源发散` → 模板改动须 `npm run build` 重生成 **`template-loader.ts` 与 `update.ts`（两份生成物）**；**2 harness × 2 语言共 4 份对称**，改后断言键集/关键串一致。[REV-76-002 修订]
  - `kb/patterns.md #CLI 自描述集合的「存在视图 vs 推进白名单」区分` + `kb/index.md #双模式转移表选择` → 模板中的相位/流转描述必须**与 CLI 同一来源口径**（`flow mode` / `flow phases`），避免文案与实现分叉（历史 REV 教训）[REV-76-004 修订]。**[需求变更 2026-10-11 修订]**：KB 现存「fast 内置快线表 **8 条目** / 7 流转键 / 7 项不可达」表述**已被本轮变更 supersede**（新口径 = **9 条目 = 8 流转键 + `done`**、不可达 **6 项**）；KB 同步归**归档官**（stage-76 archiving），本阶段不写 kb。
  - `kb/patterns.md #同类缺陷须一次全量扫描而非逐个暴露` → T7-d 全量扫描收口纪律（「无第 N+1 处」结论）。
  - `kb/patterns.md #命名前缀统一与子串陷阱处理模式`（技术术语误伤教训）→ **术语消歧**参照：易混术语须显式区分——流程模式称「**工作流快线（`workflow_mode=fast`）**」，审查降级称「**快速通道 / fast track（FAST-PASS）**」[REV-76-005 修订]。
  - `kb/patterns.md #写策略按资产归属二分`（部署面）→ 本阶段不涉部署写入，仅内容源。
  - **无**「模式感知模板纪律」条目 → 归档时补沉 patterns。

## 一、背景与实测证据（行号以现 HEAD `9a3fe27` 为准）[REV-76 修订]

| 事实 | 位置 | 结论 |
|------|------|------|
| Agent 模板面 = opencode 9×2 + claude 9×2（含 `feel`；**实测四目录各 9 份**） | `templates-data/{opencode,claude}/agents/{zh-CN,en}/` | 模式纪律改动**必须 4 份对称**（feel.md 为调度中枢）；本阶段改动 **6 类 + feel** [REV-76-008 修订] |
| 现有相位叙述散点：`plan_review`/`scheme_*`/`test_*` 表、相位白名单串 | `opencode/agents/zh-CN/{feel,openfeel-archiver,openfeel-executor}.md`（claude 同构） | 需**并列**补 fast 链说明（**不得**删 full 说明）；**fast 下可达相位为快线链 9 节点，合法相位枚举 15 项不变** [REV-76-004 修订 + 需求变更 2026-10-11 修订] |
| skills 权威源 = 中立共享源 `templates-data/skills/**` | v1.1.6-stage-68 迁入 | 单一源改动，两 harness 同时获益 |
| **build 生成物 = 2 份**：8 锚点中 **7 → `template-loader.ts`**（`:144`/`:175`/`:260`/`:299`/`:340`/`:390`/`:421`）、**1 → `src/core/update.ts`**（`:211` `SKILL_DEFINITIONS`；`UPDATE_PATH = build.js:23`） | `build.js` | 改模板/skill 后必须 `npm run build`（×2 幂等）；**`template-loader.ts` 与 `update.ts` 同批重生成、同批交付** [REV-76-002 修订] |
| 模板测试面 | `test/core/templates.test.ts` / `template-loader.test.ts` / `claude-adapter.test.ts` | 静态断言为主（无行为级 E2E，沿用既有口径）；既有断言须零回归（agents-md 关键串 / constraint ≤700 行 / 无小写工具名） |
| 既有 op 骨架/相位骨架日志说明 | `feel.md`「关键操作…自动创建骨架文件」（zh L277-279） | fast 下 `test_pending` **仍合法但不可达**（无入边）→ 该相位骨架不再产生；文案须防误导（**不得**写「不再出现/被删除」）[REV-76-004 修订] |
| **全局约束层含流水线链叙述（面对 Feel 的调度纪律）** | `agents-md/{zh-CN,en}.md:18`/`:81`、`claude/constraint/{zh-CN,en}.md:18`/`:81`（四份实测同构） | 与 fast 互斥 → 两处纳入**模式注记**（T6）[REV-76-001 修订] |
| **reviewer 模板既有「快速通道 / fast track（FAST-PASS）」= 审查深度降级语义** | `opencode/agents/zh-CN/openfeel-reviewer.md` L48~L71、L114（en 为 Fast Track；claude 同构） | 与新 `workflow_mode=fast` **同名异义** → **术语消歧**（§二 术语约定）[REV-76-005 修订] |
| **stage-75 命令面实测**：`flow phases [--json] [--mode <full\|fast>] [--stage <id>]`（`--json` **6 键**，`workflowMode` 末尾追加）；`flow mode [--stage <id>] [--json]`；`config set ... --sync-stages [--stage <ids...>]`（`STAGE_FIELD_BY_CONFIG_KEY` 三键含「工作流模式」）；`config effective` 四键 | `src/commands/flow.ts:384-449`、`:481-535`、`src/commands/config.ts:185-186`、`src/core/config.ts:76-80` | T3 就地订正 cli-usage L33/L43/L86 的事实依据 [REV-76-003 修订] |
| **`FAST_TRANSITIONS` 现状：`plan_pending: ['plan_passed']`（8 条目；fast **跳过** `plan_review`）** | `src/core/flow-manager.ts:457-466`（判例行号，以实施时为准） | **[需求变更 2026-10-11 修订]** fast 改为**必经 `plan_review`**：`plan_pending: ['plan_review']` + 新增 `plan_review: ['plan_passed', 'plan_pending']` ⇒ **9 条目（8 流转键 + `done`）**；仅经单一取表点 `resolveTransitionsForMode` 传导（T7-a） |
| **「fast 跳过计划审查」文案散点**（全仓 rg 实测仅 5 处）：`WorkflowMode` 注释「跳过上述环节」/ `CONFIG_TEMPLATE_{ZH,EN}` fast 说明行 / i18n `flow.wizard.modeFast`（zh「跳过计划审查/方案/测试」；en「plan review / scheme / test skipped」） | `core/config.ts:27 / :457 / :514`；`i18n-data/zh-CN.ts:333`、`i18n-data/en.ts:308` | T7-b 成对修订（**键数不变 ⇒ `lint i18n` 基线 796 不变**） |
| **stage-74 fast 断言面（随表变更将变红）**：`FAST_EXPECTED` 字面量 / T7.1 条目数 / T7.2a·c·d·e / T7.3a 拒绝集 / T7.7b·e 回退 / T7.11 downstream；CLI 侧 T7.11①·② | `test/core/flow-manager.test.ts`（`FAST_EXPECTED` ≈`:4207`、T7.2a ≈`:4526`、T7.3a ≈`:4560`、T7.11 ≈`:4601`）、`test/commands/flow.test.ts`（T7.11① ≈`:230`、T7.11② ≈`:252`）（行号以实施时为准） | T7-c 同步为 9 条目口径 + `plan_review` 正断言 |

---

## 二、目标语义（Agent 侧模式契约）

| 环节 | full（现状，逐字保留） | fast（新增说明） |
|------|------------------------|------------------|
| Feel 调度 | planner → plan_review（reviewer）→ schemer → executor → reviewer → tester → archiver | planner（**轻量**）→ **plan_review（reviewer 单轮，必经）** → executor → reviewer（**单轮**）→ archiver（**轻量**）；**不派发 schemer / tester**；**[需求变更 2026-10-11 修订]** planner 产出后**必经计划审查**（`plan_pending → plan_review → plan_passed`，原「不等待 reviewer / `plan_review` 无入边」表述**作废**）[REV-76-006 修订] |
| planner | 完整计划文档 | **轻量**产出（口径见 Q4 定稿；**不得**省略任务表 / 依赖 / 验收要点）；产出后**进入 `plan_review`**（不直接跳 `plan_passed`）[需求变更 2026-10-11 修订] |
| reviewer | 计划审查 + 代码审查（多轮位点） | **单轮 ×2，两处均必跑**：① `plan_review` **计划审查（fast 下必经**，与代码审查同级；通过 → `plan_passed`，问题退回 → `plan_pending`）；② 代码审查（exec 后一次；`review_failed` 回环可重审 / 回执行修复）；**质量底线不变**（问题照记、阻断照留）[需求变更 2026-10-11 修订] |
| archiver | 归档全量清单 | **轻量**归档（口径见 Q4；**不得**省略状态记录 / 知识暂存判定） |
| 读取方式 | 读 `flow.json` / `status.md` | **读 `status.md「工作流模式」`**（缺失 → 视作按级联口径的回落值；Agent 侧以 CLI `flow mode` 为权威查询） |
| 骨架 | 全量 | **全量（不变）**；仅 Agent 接力环节减少；**合法相位枚举 15 项不变（fast 下 6 项不可达：`scheme_*` / `test_*`）** [REV-76-004 修订 + 需求变更 2026-10-11 修订] |

**术语约定（[REV-76-005 修订]）**：
- 流程模式统一称「**工作流快线**（`workflow_mode=fast`，源自 `status.md「工作流模式」` / `openfeel flow mode`）」——管**流程链路**（谁被调度、相位如何流转）。
- 审查降级维持既有称名「**快速通道 / fast track（FAST-PASS）**」（reviewer 模板既有机制）——管**审查深度**（5 维度跳过）。
- 二者为**不同机制**、**同名异义**：模板中不得互相引用/混用；T2 的 reviewer 条目须**显式声明**二者互异。

**不变量**：
1. **质量底线不可跳**：reviewer 在 fast 下**必跑两处**——① `plan_review` 计划审查（单轮，必经）② 代码审查（单轮）；`plan_review` 退回与 `review_failed` 均必须留痕（REV 条目照常）[需求变更 2026-10-11 修订]。
2. **full 文案逐字保留**：新增为**并列**描述，不得改写/删除 full 路径叙述（跨 harness diff 断言：opencode 关键串零回归）。
3. **端口中立**：模式纪律为中立表述；工具名差异走双平台分节。
4. **单一来源**：模板中相位/流转/模式取值口径必须与 CLI 输出一致（检索核对）。
5. **骨架全量**：任何模板**不得**写「fast 跳过 XX 文件/骨架」。
6. **相位口径统一（[REV-76-004 修订 + 需求变更 2026-10-11 修订]）**：`phases`（**15，模式无关**）/ `advanceAccepted`（**15，模式无关**）/ fast `transitions`（**9 条目 = 8 条流转键 + `done` 终止项**；`plan_review` 为新增流转键）；T3 文案与 T4 断言必须同口径。
7. **术语消歧（[REV-76-005 修订]）**：见上方术语约定（工作流快线 ≠ 快速通道 / FAST-PASS）。
8. **约束层与 Agent 层一致（[REV-76-001 修订]）**：全局约束层模式注记与 Agent 层 fast 教学同一链条（planner → plan_review → executor → reviewer → archiver）[需求变更 2026-10-11 修订]。
9. **fast 计划审查必经（[需求变更 2026-10-11 修订]）**：fast 下 `plan_review` 为**必经且单轮**节点（`plan_pending → plan_review`；通过 → `plan_passed`；问题退回 → `plan_pending`）；模板/文案/断言**不得**再出现「fast 跳过计划审查 / `plan_review` 无入边 / planner 产出后不等待 reviewer」类表述；fast 表条目数口径 = **9（8 流转键 + `done`）**，不可达 **6 项**（`scheme_*` / `test_*`）。

---

## 三、变更点清单（编号 T）

> **执行序（[需求变更 2026-10-11 修订]）**：**引擎表与文案修订（T7）→ 内容源改动（T1 → T2 → T3 → T6）→ build 重生成（T4）→ 门禁（T5）**。编号沿用首轮审查的 T4/T5 引用不重排；T7 为需求变更新增（置于最末编号，执行序最前——引擎表为模板措辞的事实基准）。

### T1 — `feel.md` × 4（调度中枢，最重）
- 新增「**工作流模式**」小节（置于自动推进决策纪律附近）：读取方式（`status.md` / `openfeel flow mode`）、fast 下的调度表（§二）、**不派发 schemer/tester**、reviewer 单轮、archiver/planner 轻量、`review_failed` 回环语义；**并落一句「fast 下 planner 产出后必经 reviewer 的计划审查（`plan_review` 单轮；通过后方进入 exec，即 `plan_pending → plan_review → plan_passed`）」** [REV-76-006 修订 + **需求变更 2026-10-11 修订**——原「不等待 reviewer / `plan_review` 无入边」表述**作废**]。
- 修正散点：相位骨架日志句（`test_pending` 在 fast 下**仍为合法相位、仅不可达（无入边）**——该相位骨架不再产生；**不得**写成「fast 删除/跳过相位」）[REV-76-004 修订]、相位白名单枚举句（补「**fast 下可达相位为快线链；合法相位枚举 15 项不变**」注记）[REV-76-004 修订]。
- **4 份对称**：`opencode/{zh-CN,en}` + `claude/{zh-CN,en}`；仅工具名（`question`/`AskUserQuestion`）等既有 harness 差异保留。

### T2 — subagent 模板模式感知（6 类 × 4 = 24 份，按需最小改）[REV-76-006 修订]
- `openfeel-planner`：fast 轻量产出边界（保留任务表/依赖/验收；Q4 定稿后落文）+ **「fast 下产出后进入计划审查（`plan_review`），审查通过后方进入 exec」** [REV-76-006 修订 + **需求变更 2026-10-11 修订**——原「直接进入 exec / 不等待 reviewer」表述**作废**]。
- `openfeel-executor`：fast 下相位路径（`plan_pending → plan_review → plan_passed → exec_running`；`review_failed → exec_running` 回环）+ 相位白名单串补注记（口径同 T1：可达 ≠ 合法）[REV-76-004 修订 + **需求变更 2026-10-11 修订**]。
- `openfeel-reviewer`：fast 单轮纪律（**计划审查（`plan_review`）与代码审查均单轮；计划审查为 fast 必经**，退回经 `plan_pending`）[需求变更 2026-10-11 修订] + 失败回环留痕要求 + **显式声明「工作流快线（`workflow_mode=fast`）」与既有「快速通道 / fast track（FAST-PASS）」为不同机制**（措辞按 §二 术语约定）[REV-76-005 修订]。
- `openfeel-archiver`：fast 轻量归档清单口径（Q4）。
- `openfeel-schemer` / `openfeel-feel-tester`：**不删职责**，补一行「fast 模式下本 Agent 不被调度（由 Feel 依据模式跳过）」——防误以为流程缺失。
- **对称与零回归断言（[REV-76-006 修订]）**：24 份 = 6 类 × {opencode,claude} × {zh-CN,en}；harness 内 zh/en 关键串一致 + opencode 既有串零回归（断言落 T4 断言面 6）。

### T3 — skills 收口（中立共享源）
- `openfeel-cli-usage`：
  - 15 phase 表 + **fast 快线转移表并列（`transitions` = 9 条目：8 条流转键 + `done` 终止项；`phases` / `advanceAccepted` 15 项模式无关；fast 下 6 个相位不可达〔`scheme_*` / `test_*`〕；链串须含 `plan_pending → plan_review → plan_passed`）** [REV-76-004 修订 + **需求变更 2026-10-11 修订**]、`workflow_mode` 三层载体与级联（`status.md` > `config.yaml` > `profile.yaml`〔不承载〕 > builtin=fast）、新命令（`flow mode [--stage <id>] [--json]` / `plan stage add --workflow-mode` / `stage set --workflow-mode`）、`config effective` 四键。
  - **就地订正三处既有行（非仅新增段落）[REV-76-003 修订]**：
    - L33 `openfeel config ...` 行：`set ... --sync-stages` → **`set ... --sync-stages [--stage <ids...>]`**，同步字段补「**工作流模式**」（`STAGE_FIELD_BY_CONFIG_KEY` 三键；`--stage` 单独使用 / 与 `--global` 组合 → exit 1）；
    - L43「flow 子命令」枚举：补 **`mode`**（`[--stage <id>] [--json]`，只读）；
    - L86：`flow phases [--json]` → **`flow phases [--json] [--mode <full|fast>] [--stage <id>]`**，**5 键 → 6 键**（追加 `workflowMode`；既有五键语义逐字不变）。
  - 附（收口完整性）：L15 快照脚注「v1.1.6 快照」→「v1.1.7 快照」；frontmatter description 追加 v1.1.7 能力短语（按既有逐版惯例）。
- `openfeel-get-stage-status`：字段清单增「工作流模式」+ 模式分支建议（fast 下下一步建议不指向 scheme/test；**且 `plan_pending` 阶段下一步建议 = `plan_review`（必经，勿建议直接 `plan_passed`）**；**口径：可达 ≠ 合法**，不写「fast 相位变少」）[REV-76-004 修订 + **需求变更 2026-10-11 修订**]。
- `openfeel-update-stage-status`：状态与模式字段的边界（模式字段**不由**状态更新覆盖）。
- `openfeel-wizard`：模式选型交互说明。
- 每处改动静默保 opencode 既有措辞（双平台分节/并列）。

### T4 — build 重生成与静态断言
- **重生成与提交顺序（[REV-76-002 修订]，逐字执行）**：改模板/skill（T1/T2/T3/T6）→ `npm run build` → **提交含 `template-loader.ts` + `update.ts`**（两生成物同批；**禁**只提其一、**禁** `git checkout`/手改任一；本仓 v1.1.7 提交单位 = 阶段归档提交，porcelain 空核验须在该提交之后执行）→ 再 `npm run build` ×2 → **`git status --porcelain src/` 空**（幂等 + 无未纳入生成物）。
- **断言面**（加入既有模板测试文件）：
  1. 4 份 `feel.md` 均含模式小节关键句（fast 不派发 schemer/tester、reviewer 单轮、**planner 产出后必经计划审查 `plan_review`**）[REV-76-006 修订 + **需求变更 2026-10-11 修订**]；
  2. opencode 既有关键串**零回归**（如自动推进决策纪律原文、相位骨架句原意）；
  3. 模板中**不出现**「fast 跳过骨架/文件」类表述；
  4. 模板相位口径与 CLI **同口径**：fast `transitions` 键集 = `new FlowManager(fixture).getDefaultTransitions('fast')` 的 **9 条目**（8 流转键 + `done`；含 `plan_pending → ['plan_review']`、`plan_review → ['plan_passed','plan_pending']`、`review_failed → ['review_pending','exec_running']` 回环）；`phases` = **15（模式无关；`getPipelinePhases()`）**；**代码为唯一来源**，测试内不得硬编码快线表副本 [REV-76-004 修订 + **需求变更 2026-10-11 修订**]；
  5. 失败留痕要求存在于 reviewer 模板（fast 单轮 + REV 照记）+ **术语消歧句存在**（显式声明「工作流快线」与「快速通道 / FAST-PASS」不同机制）[REV-76-005 修订]；
  6. **T2 24 份对称断言**（harness 内 zh/en 关键串一致 + opencode 既有串零回归）**+ T6 4 份约束层断言**（zh/en 各含 fast 注记关键串、full 既有串零回归、`claude-adapter` 既有断言零回归：≤700 行 / 无小写工具名）[REV-76-006 / REV-76-001 修订]。

### T5 — 门禁
`npm run build` ×2 → `npm test`（0 skipped / 0 failed；**含 T7-c 同步后的 stage-74 fast 断言与 T7-a 引擎表**）→ `tsc` = 0 → `lint i18n` 新基线登记：**796（不变；预期 796 → 796——模板/skill 非 i18n 键域；[需求变更 2026-10-11 修订] T7-b 仅改 `flow.wizard.modeFast` **文案**〔zh/en 成对〕与 `config.ts` 模板行文本，**键数与基线不变**，但须实测复核仍为 796）** [REV-76-007 修订] → `lint kb` = 0 → 跨 harness 对称 diff 报告（4 份 feel.md + 24 份 subagent 人工抽查 + 4 份约束层人工 + 断言）。

### T6 — 全局约束层模式注记（`agents-md` + `claude/constraint`，[REV-76-001 新增项]；执行序在 T4 之前）
- **4 份文件**：`agents-md/{zh-CN,en}.md`、`claude/constraint/{zh-CN,en}.md`。
- **两处改动（每份）**：
  1. **任务类型路由表「编码实现」行**（zh L18 / en L18）：处理路径补 full / fast 并列注记——full 链（planner→schemer→executor→reviewer→tester）**逐字保留**；fast = **planner → 计划审查（reviewer，单轮必经）→ executor → 代码审查（reviewer）→ archiver** [需求变更 2026-10-11 修订]；说明列「须走完整审计链」补 fast 限定（快线审计链）；注记须含指引「`status.md「工作流模式」` / `openfeel flow mode`」（与点 2 同位或分置均可）。
  2. **调度约束段**（zh L81 / en L81）：流水线链枚举后补注记「（full）；fast 模式下为 计划 → **计划审查** → 执行 → 代码审查 → 归档」+ 指引「见 `status.md「工作流模式」` / `openfeel flow mode`」[需求变更 2026-10-11 修订]。
- **定位**：只加模式注记；不改职责边界、9 Agent 总览与其它章节；**不得**沿用「不含模式纪律」的排除理由。
- **生成链**：两文件分别经 build 注入 `AGENTS_MD_TEMPLATES` / `CLAUDE_CONSTRAINT_TEMPLATES`（均落 `template-loader.ts`）→ 归入 T4 重生成。
- **约束**：注记以行内补语为主（控制行数；`claude-adapter` ≤700 行断言余量充足——现 510/511）；zh/en 措辞对称；既有断言关键串零回归。

### T7 — fast 快线表修订：必经 `plan_review`（引擎 + 文案 + 测试同步）[需求变更 2026-10-11 修订]

> **来源**：用户 2026-10-11 裁定——**fast 模式下「计划审查」不跳过**。fast 链由 `plan_pending → plan_passed`（跳过 `plan_review`）改为 **`plan_pending → plan_review → plan_passed`**（reviewer 单轮必过，与代码审查同级）；新 fast 链 = **`plan_pending → plan_review → plan_passed → exec_running → review_pending → [review_failed ↺] → review_passed → archiving → done`**。引擎侧属 **stage-74 成果的需求变更修订**。

- **T7-a 引擎表（唯一改点）**：`src/core/flow-manager.ts` 的 `FAST_TRANSITIONS`：
  - `plan_pending: ['plan_passed']` → **`plan_pending: ['plan_review']`**；
  - **新增** `plan_review: ['plan_passed', 'plan_pending']`（与 full 表该键逐字一致：通过 → `plan_passed`；问题退回 → `plan_pending`）；
  - 其余 **7 个条目（6 条流转键 + `done`）逐字不变**（含 `review_failed: ['review_pending', 'exec_running']` 双出口回环）；
  - **条目数 8 → 9**（**8 条流转键 + `done` 终止项**）；常量上方注释同步（「7 条流转键 + `done`」→「8 条流转键 + `done`」，并注明 `plan_review` 在 fast 下**必经**）。
  - **口径校正（实测）**：任务书载「fast 表条目数 8 → 10」；按上述转移语义实测 = **8 → 9**（净增 1 键；条目数 = `Object.keys` 数 = 流转键 + `done`）。本阶段一律以 **9（8 流转键 + `done`）** 为准；**禁**按「10」书写任何断言/文案。
  - **传播与禁令**：仅经单一取表法则 `resolveTransitionsForMode(mode)`（`getValidTargets` 唯一取表点）自动传导至校验/推进/BFS/展示；**禁**在命令层/模板层复制快线表（R-74-1）；**禁**改 `getValidTargets` 签名、phase 枚举、`advanceAccepted`、`checkpoint_mapping`。
- **T7-b 文案同步（「fast 跳过计划审查」表述全量清零）**——全仓 rg 实测**仅 5 处**（`config.ts` 3 + i18n 2），行号以实施时为准：
  - ① `src/core/config.ts:27` `WorkflowMode` 注释：`fast=快速迭代（跳过上述环节，保留审查单轮）` → `fast=快速迭代（跳过方案/测试环节；计划审查与代码审查各保留单轮）`；
  - ② `src/core/config.ts` `CONFIG_TEMPLATE_ZH`（`:457`）：`#            fast=快速迭代（跳过上述环节，保留审查单轮）` → 与 ① 同口径；
  - ③ `src/core/config.ts` `CONFIG_TEMPLATE_EN`（`:514`）：`fast=quick iteration (skip the above; single review round kept)` → `fast=quick iteration (skips scheme/test; keeps single-round plan review and code review)`；
  - ④ `src/core/i18n-data/zh-CN.ts:333` `flow.wizard.modeFast`：`fast（快速迭代：跳过计划审查/方案/测试）` → `fast（快速迭代：跳过方案/测试；保留计划审查与代码审查单轮）`；
  - ⑤ `src/core/i18n-data/en.ts:308` 同名键 en：`fast (quick iteration: plan review / scheme / test skipped)` → `fast (quick iteration: scheme/test skipped; single-round plan review and code review kept)`；
  - **键数不变 ⇒ `lint i18n` 基线 796 不变**（T5 实测复核）；zh/en 文本成对修订。
- **T7-c 测试同步（stage-74 fast 断言，全量）**：
  - `test/core/flow-manager.test.ts`：`FAST_EXPECTED` 字面量（≈`:4207`）→ **9 条目**（`plan_pending: ['plan_review']` + 新增 `plan_review` 键）；T7.1 标题「8 条目含 done 终止项」→「**9 条目**含 done 终止项」；T7.1 深拷贝断言 `['plan_passed']` → `['plan_review']`；**T7.7b / T7.7e** 回退断言 `getPipelineTransitions('fast')['plan_pending']` → `['plan_review']`（T7.7a 自定义 `fast_transitions` 断言不动）；**T7.2a** `getAvailablePhases(B)` → `['plan_review']`；**T7.2c** `findPhasePath(B,'exec_running')` → `{ path: ['plan_review','plan_passed','exec_running'] }`（`scheme_pending` 仍 `no-path`）；**T7.2d** `canAdvance(B,'plan_review')` **false → true**；**T7.2e** 回落断言 → `['plan_review']`；**T7.3a** 更名「fast 拒绝集（`scheme_pending` / `test_pending` 全 false）」+ **新增 `plan_review` 正断言**（`canAdvance` true / `findPhasePath` ok）；**T7.11** downstream 断言 `['plan_passed']` → `['plan_review']`（`responsibleAgent` **仍为 `openfeel-planner`**——`mapPhaseToAgent` 按**前缀** `plan` 映射，实测 `plan_review`.split('_')[0] = `plan`，**勿**误改）。
  - `test/commands/flow.test.ts`：**T7.11①** 人类输出串 `plan_pending → [plan_passed]` → `plan_pending → [plan_review]`（并补 `plan_review → [plan_passed, plan_pending]` 存在性）；**T7.11②**（`--stage` fast）`obj.transitions['plan_pending']` → `['plan_review']`；`transitionsDiff` fast 全空断言**不变**（内置表 vs 内置表，仍无覆盖）。
- **T7-d 全量扫描收口（kb #同类缺陷须一次全量扫描）**：`rg` 全仓（`src/` `test/` `docs/`；排除 `docs/phase-*` 历史与 `templates-data/` 待改面〔T1/T2/T3/T6 覆盖〕）关键词：`plan_review`（判 fast 相关命中）、`8 条目`、`7 流转键`、`7 项不可达`、`跳过计划审查`、`skip the above`、`plan review / scheme / test skipped`；逐命中判定改/不改并给出「**无第 N+1 处**」结论。
- **T7-e 与并行方案修订的协同（本计划不触碰 `ops/`）**：方案修订轮（REV-76 审查修订 + 需求变更 T7 修订）中，原 `ops/op-001~004` 所含已被 supersede 的落文（「`plan_review` 无入边」「8 条目 / 7 流转键 / 7 项不可达」）**已由 op-005 步骤 5「协同口径清单」逐条吸收**，op-001~004 已就地修订至新口径（**9 条目 = 8 流转键 + `done`**；`plan_review` 必经）[REV-76-009 修订]。**T7 已裁定独立成 op-005、执行序最前**（方案层定稿，落 `stage-76/ops/deps.yaml`）；实施时以修订后的最新 `ops/` 落文为准。
- **T7-f 遗留（不在本阶段动作）**：① `kb/architecture.md #双模式转移表选择` 与 `kb/index.md` 摘要中「8 条目 / 7 流转键」口径 → **归档官**在 stage-76 archiving 阶段 supersede 更新；② `stage-74` / `stage-75` 的 `plan.md` 与归档日志为**历史记录不改写**（其内含当时口径；supersede 记录见本计划 §六与 `.openfeel/plan/v1/v1.1.7/plan.md` §三 C 修订）。
- **不变量（T7）**：① full 表逐字不变；② `phases` / `advanceAccepted` 15 项、phase 枚举不变；③ 引擎表唯一改点 + 禁第二信源；④ 本仓以 full 运行（裁定 L）——T7 仅改变 fast 模式解析结果，对本仓自举流水线**零行为影响**。


---

## 四、验收要点（阶段级）

1. 4 份 `feel.md` 模式纪律对称；fast 调度表与 CLI 表口径一致（断言 4；**fast transitions 9 条目含 `done`**，链含 `plan_review`）[REV-76-004 修订 + 需求变更 2026-10-11 修订]。
2. full 叙述零回归；无「fast 跳过骨架」表述（断言 2/3）。
3. skills 权威源改动同步生效：**生成物 2 份**（`template-loader.ts` + `update.ts`）重生成并纳入提交、`git status --porcelain src/` 空 [REV-76-002 修订]。
4. 门禁全绿；模板静态断言全部通过（含 T2 24 份对称断言与 T6 约束层断言）。
5. Q4（轻量化口径）已与用户确认并落文（**未确认前不得自造约束**）。
6. **[REV-76-001]** 4 份全局约束层模式注记落地，且与 Agent 层 fast 教学一致（planner → **计划审查** → executor → 代码审查 → archiver）[需求变更 2026-10-11 修订]。
7. **[REV-76-005]** 术语消歧落文：reviewer 模板显式声明「工作流快线」≠「快速通道 / FAST-PASS」。
8. **[需求变更 2026-10-11 修订] fast 计划审查必经（T7）**：`FAST_TRANSITIONS` = **9 条目**（8 流转键 + `done`）；`plan_pending → ['plan_review']`、`plan_review → ['plan_passed','plan_pending']`；fast 下 `--to plan_review` **可推进**、自 `plan_pending` 的 `--to plan_passed` **被拒**、`scheme_*` / `test_*` 仍被拒；全仓无「fast 跳过计划审查 / `plan_review` 无入边」表述（T7-d 扫描收口）；`lint i18n` 实测仍 **796**。

## 五、风险

| # | 风险 | 缓解 |
|:-:|------|------|
| R-76-1 | 模板/表改动致调度错链（fast **漏跑计划审查** / 误跑 tester / 引擎表与模板文案口径不一致） | 断言 1/5 + T7-a 引擎表断言 + T7-d 全量扫描 + full 零回归断言 [需求变更 2026-10-11 修订] |
| R-76-2 | full 文案被无意改写 | 关键串零回归断言 + 逐文件 diff 复核 |
| R-76-3 | 手改生成段被 build 覆盖（或反之漏重生成） | 生成物 2 份清单 + `git status --porcelain src/` 空断言 [REV-76-002 修订] |
| R-76-4 | 轻量化口径自造 | Q4 **已于 2026-10-11 确认**（底线句 + 保守；`[Q4]` 追加句直接落文，见 op-002）[REV-76-009 修订] |
| R-76-5 | 全局约束层与 Agent 层措辞互斥（一边 fast、一边强制完整链） | T6 注记 + 断言 6 双向核（约束层 fast 链与 feel.md 描述一致）[REV-76-001 修订] |
| R-76-6 | `update.ts` 被误当异常产物回滚/漏提，破坏 skill 部署链 | T4 生成物清单显式 2 份 + build 自身对账（`build.js:757` `SKILL_DEFINITIONS` 校验）[REV-76-002 修订] |
| R-76-7 | 术语同名异义致 Agent 误读（把 fast 模式当审查降级） | §二 术语约定 + reviewer 模板显式声明 + 断言 5 [REV-76-005 修订] |
| R-76-8 | 任务书口径「条目数 8 → 10」与实测（**9**）不一致；按 10 落文 → 断言/文案假红或误导 | T7-a 显式口径校正（9 = 8 流转键 + `done`）+ 断言字面量与代码派生双侧锁定 [需求变更 2026-10-11 修订] |
| R-76-9 | 方案修订轮残留与 T7 口径冲突（原落文含「无入边 / 8 条目 / 7 项不可达」） | T7-e 协同清单（逐 op 逐行列出待改点）+ 方案复审按本计划逐条核对 [需求变更 2026-10-11 修订] |
| R-76-10 | T7-b 文案改漏英文侧（`lint i18n` 只查键对称、不查文本） | T7-b 五处成对清单 + T7-d 全量扫描（含 en 串）+ `lint i18n` 键数复核 [需求变更 2026-10-11 修订] |

> 说明：op 级拆分**已由 openfeel-schemer 定稿并落 `ops/deps.yaml`**（op-005 T7 → op-001 T1/T6 → op-002 T2 → op-003 T3/T4-build → op-004 T4 断言/T5）[REV-76-009 修订]。**[需求变更 2026-10-11 修订]**：T7 **已裁定独立成 op-005**（执行序最前；引擎表为模板措辞的事实基准）；T7-e 协同清单**已由 op-005 步骤 5 吸收**。

## 六、修订记录

| 时间 | 修订人 | 说明 |
|------|--------|------|
| 2026-10-11 | openfeel-planner | 初稿：T1~T5 + 验收 5 条 + 风险 R-76-1~4；注意：首轮审查判定**不通过**（5 blocking + 3 非阻塞）。 |
| 2026-10-11 18:38 | openfeel-planner | **REV-76 计划审查修订轮（001~008 全落实）**：① [REV-76-001] 新增 **T6**（全局约束层 agents-md/claude constraint 模式注记 ×4），边界改写（禁「不含模式纪律」排除理由），范围/§一/deps 补 4 文件、不变量 8、验收 6、R-76-5；② [REV-76-002] 范围与 T4 补 `src/core/update.ts`（生成物 2 份 + 逐字提交顺序 + 禁回滚；锚点位置 `build.js:211`/`UPDATE_PATH:23`），§一 生成物行改写、R-76-6，deps `produces_core` 订正（+`update.ts` + T2 24 份 + T3 3 skill + 4 约束层文件 + 3 测试文件）；③ [REV-76-003] T3 cli-usage 就地订正 L33/L43/L86 三处（+快照脚注/frontmatter 收口），§一 补 stage-75 命令面实测行；④ [REV-76-004] 口径统一（`phases`/`advanceAccepted` 15 模式无关、fast `transitions` **8 条目含 `done`**）：T1「fast 子集」→「可达 vs 合法」、§一 骨架句改「仍合法但不可达」、T3/T4 同口径，不变量 6、验收 1；⑤ [REV-76-005] §二 术语约定 + 不变量 7 + T2 reviewer 显式声明条 + T4 断言 5、验收 7、R-76-7；⑥ [REV-76-006] T1/T2 落「planner 产出后直接进入 exec，不等待 reviewer」+ T4 断言 1/6（24 份对称断言）；⑦ [REV-76-007] T5 登记 **796（不变）**；⑧ [REV-76-008] 范围「7~9 份」→「各 9 份（改动 6 类 + feel）」。行号基准 = 现 HEAD `9a3fe27`。**只改计划文档（plan/overview/status/deps），未改源码、未直写 flow.json。** |
| 2026-10-11 19:10 | openfeel-planner | **需求变更修订轮**（用户 2026-10-11 裁定：**fast 下计划审查不跳过**）——新增 **T7**（fast 表必经 `plan_review`：`plan_pending → ['plan_review']` + `plan_review: ['plan_passed','plan_pending']`；条目数 8 → **9**〔8 流转键 + `done`；**口径校正**：任务书载「8 → 10」，实测语义为 9〕；**文案清零点 5 处**〔`config.ts`×3 + `i18n-data`×2〕；**stage-74 断言同步**〔flow-manager.test.ts 8 处 + flow.test.ts 2 处，全量扫描收口〕；ops 协同清单 T7-e；kb supersede 归归档官 T7-f）；同步改 **T1/T2/T3/T4/T6** 中「`plan_review` 无入边 / 不等待 reviewer / 8 条目 / 7 项不可达」表述与 §二 调度链、不变量 1/6/9、执行序（T7 最前）、验收 1/6/8、R-76-1/8~10。**只改计划文档（本文件 + overview + status + deps + 大计划 + stage-77 计划 + roadmap + ADR-010 注记），未改源码、未动 `ops/`、未直写 flow.json。** |
| 2026-10-11 | openfeel-schemer | **REV-76-009 残留修正轮**（方案层）：T7-e 协同清单状态更新（已由 op-005 步骤 5 吸收；T7 已裁定 op-005 执行序最前）+ §五 说明行同步（op 拆分定稿）+ 方案层 ops 断言串全量核对结论回填。仅动方案 / 计划文档，未改源码、未直写 flow.json。 |
