# v1.2.1-stage-92 计划 — 流水线提速与并行拆分执行（主题七）

- **阶段**：`v1.2.1-stage-92`（七主题之七 · 流水线提速 ／ 大计划 §二 表 F「流水线提速」）
- **依赖**：**hard: `v1.2.1-stage-86` / `v1.2.1-stage-90` / `v1.2.1-stage-91`**（大计划 §四 阶段表 + `.openfeel/plan/v1/v1.2.1/deps.yaml`）。实质三位一体：
  - **86 = 度量前置**——本阶段两项验收（「档位按档生效」/「归档轻量化落地项实测」）**必须以真实度量**为准：`recordRun` 命令层接线（`commands/flow.ts:944-976`，`PHASE_AGENT_MAP` 归属）+ CLI 日志 3 字段（`duration_ms` / `project` / `session_id`）+ 跨会话恢复显式标注。无 86 则本阶段只能「声称提速」而不能「度量提速」（设计 §1.4：可观测性为本次优化前置）。
  - **90 = 模式与规模轴**——档位判据是「**按模式与规模裁剪**」（裁定 K），其载体 = 三值模式（`full / fast / general`）+ **需求级模式属性**（`RequirementData.workflow_mode?`）+ **单点解析器**（`resolveStageWorkflowMode`，`flow-manager.ts:2358`）。本阶段若新增「审查档位」轴，必须**经同一单点延伸**（禁第二份层序 / 取表判定）。
  - **91 = 收编点（单写者）**——91 已把 40 agent 提示词索引壳化、流程下沉 skill、约束文件瘦身；本阶段全部**契约 delta 按瘦身后范式**落地：**只增 skill 节 / 索引行 / 最小必要句**，不重写模板正文（否则 91 成果被二次改写，违裁定 J 单写者纪律的下游延伸）。
- **优先级**：P0 ｜ **制定人**：openfeel-planner ｜ **制定时间**：2026-10-15 ｜ **修订轮**：修订 0（初稿）
- **基线**：**HEAD `16908fe`**（stage-91 归档提交「chore: 阶段归档 v1.2.1-stage-91」；功能收口 `27e9848`）。全表实测；本文行号 / 键值均以该基线为准。
- **上游基线（stage-91 归档登记值；本会话实测复核）**：`npm test` **71 文件 / 1682 用例** 0 skipped / 0 failed（**本会话实跑复跑 exit 0**——同时闭合 REV-91-011 的门禁复跑诉求）；`npx tsc --noEmit` = **0**（实测）；`openfeel lint i18n` = **939**（实测）；`lint kb` = **0**（实测，599 引用）；`--version` = **1.2.0**（本阶段不改，归 stage-93）；`git status --porcelain src/` **空**（双生成物与源一致，build 幂等旁证）；flow.json `revision 1151` / `archived_versions` **9** / `requirements` **0** / `reviews` **0**；stages **17**（v1.2.0 8 项 + v1.2.1 **86~94**）——`86~91` **done**、`92~94` **plan_pending**（`v1.2.1-stage-94` deps=[92]，**不在大计划八阶段表内**，本阶段零涉及，仅登记）；`flow health` 实测 **8/17 stages 一致**（9 条跨文件一致性 warn = `status.md` 未随 op 推进，承 REV-90-011 / REV-89-008 / REV-91-010 同源家族）；本仓 `.openfeel/config.yaml defaults.workflow_mode: full` + `test_enabled: true`（裁定 B：八阶段全 full）。
- **定位**：把设计 §4「流水线优化提速」（版本计划口径 = **主题七**）落为**可验证的机制事实**——针对设计 §1 的四条根因（**① 串行 subagent 派发 `task` 141.7h / 73%、单次均 331s、subagent 时间轴重叠仅 8.3%；② 多道审查关 reviewer 占流水线活跃耗时 ~37%；③ 人工等待 `question` 33.9h / 17.5%〔Claude 侧「等用户」32.6%〕；④ archiver 固定开销中位 5.9min / 0 离群 / ~11%**）：
  1. **审查档位（免审 / 快线 / 全量）**——按模式与规模裁剪审查关（合并 / 抽样）；**转移表层实现**；不破坏 blocking REV 门、审计与 `--dry-run` 语义（裁定 K）。
  2. **并行编排**——拆分需求并行执行（拆分 = 一等动作〔87 已落〕+ 并行编排契约 + **组合转移 `|` 复用**）；**并行仅限独立子任务**（裁定 L）。
  3. **交互提速**——减少提问 / 批量确认 / 非阻塞式交互 + 缩短长子会话指引 + **会话卫生平台能力核验**（大计划 §十 Q8）。
  4. **归档轻量化**——archiver 机械步骤下沉（utility / 脚本），**评估 → 落地 → 实测**。
- **主题编号消歧（承 stage-91 / REV-90-004 口径）**：设计 `docs/v1.2.1-design.md` 节题为「**主题一**：流水线优化提速」，版本计划 `.openfeel/plan/v1/v1.2.1/plan.md`（§四 阶段表 / §二 表 F / 附录 A）记为「**主题七**」。本计划**统一采用版本计划口径（主题七）**；跨文档引用一律以**节题定位**（「设计 §4 流水线优化提速」），**禁行号依赖**。
- **范围（文件级）**：
  - **转移表 / 档位核心**：`src/core/pipeline-schema.ts`、`src/core/flow-manager.ts`、`src/core/config.ts`、`src/core/plan/stage.ts`（若档位承载于阶段字段）
  - **命令面**：`src/commands/flow.ts`（`flow phases` 展示 / `flow mode` / `flow advance` 审计与 `--dry-run`）、`src/commands/stage.ts`（若档位承载于阶段字段）
  - **需求面（若档位承载于需求级）**：`src/core/req/**`、`src/commands/req.ts`
  - **i18n**：`src/core/i18n-data/{zh-CN,en}.ts`（新增键逐键列名）
  - **契约落点（瘦身后范式）**：`src/core/templates-data/skills/openfeel-delegation/SKILL.md`（并行编排 / 交互提速契约增补——方案期定稿归属）、`openfeel-tool-usage`（提问判据）、`openfeel-context-hygiene`（会话卫生边界对齐）、`openfeel-req`（并行接取对齐）；`src/core/templates-data/{opencode,claude}/agents/{zh-CN,en}/{feel,openfeel-archiver}.md`（**仅索引行 / 最小必要句**）
  - **生成物**：`src/core/template-loader.ts` + `src/core/update.ts`（templates-data 有改动时同批 `npm run build`，**禁手改**）
  - **受控面（默认零改动）**：`.openfeel/pipeline.yaml`（大计划 §七.4：不改既有内容，除非审查档位方案期裁定必需且须**零回归论证**）
  - **断言面**：`test/commands/flow.test.ts`、`test/core/{flow-manager,config,templates}.test.ts`（若涉需求级则加 `test/core/req.test.ts` / `test/commands/req.test.ts`）
  - `.openfeel/plan/v1/stage-92/ops/**`（末位 op 的 produces 清单）
- **边界**：
  1. **不破坏三条硬语义**（裁定 K / 大计划 §八.8）：① **blocking REV 门**——`flow advance --to done` 的 `assertNoBlockingOpenRev` 强制门（命令层 `commands/flow.ts:907-918` + core `flow-manager.ts:1491-1505` / `:1615-1626`）**不得削弱**，`--force` 仍仅「降级警告 + 退出 1」；② **审计留痕**——`advance_stage_phase` / `reset_stage_phase` 的 `appendLog` detail 既有键**逐字保留**，档位为**新增可选键**（读侧宽容）；③ **`--dry-run` 语义**——`flow advance --dry-run` / `flow stage reset --dry-run` / `checkpoint restore --dry-run` 均**零写盘**（含新档位预览），逐字不变。
  2. **相位枚举不变**：`PIPELINE_PHASES` **15 项**（`pipeline-schema.ts:14`）不动；档位只改「**可达**」不改「**合法**」（承 fast 先例「可达 ≠ 合法」；大计划 §七.4）。
  3. **单点解析**：档位 / 模式的判定与取表唯一经既有解析器家族（`resolveStageWorkflowMode` → `resolveTransitionsForMode`，`flow-manager.ts:2097`）**延伸**；**禁第二份**层序判定 / 取表实现（承 kb #双模式转移表选择：单一取表点 + stage→mode→表 三元解析）。
  4. **并行仅限独立子任务**（裁定 L）：并行判据 = **无依赖链 ∧ 无文件冲突域**；有依赖恒串行（判据来源 = kb `architecture.md:5 #Worktree 并行批次策略`）。
  5. **契约 delta 按瘦身后范式**（裁定 J 下游）：可复用流程一律落 **skill**；agent 提示词只留**索引行 / 最小必要句**（改写块 ≤6 行 / 处）；**不重写 40 份模板正文**、**不改 frontmatter**（键集 / 权限断言零改写）。
  6. **平台不可控项如实留痕**：会话卫生（子会话自动 archive）与 compaction 为**平台侧能力**——核验后**可控项落文 / 不可控项留痕**，**禁**表述为「已实现」（承 stage-91 T4 纪律 + kb #未来功能/未落地能力写入 skill 与文档须标注「提供版本」）。
  7. **组合转移 `|` 的既有裁定**：本仓 `pipeline.yaml` **未列**组合键，且 **stage-50 裁定「不补组合键」**（改以 `--json.transitionsDiff.missing` 显式化）；本阶段若「复用」或「启用」组合键，须**显式重审该裁定**并登记（禁无声推翻，承 kb #延迟占位注记的收口模式纪律）。
  8. **术语消歧（继承 + 新增）**：既有——流程模式称「**工作流快线**」（`workflow_mode=fast`），审查深度降级称「**快速通道 / fast track（FAST-PASS）**」，二者**不得互相引用 / 混用**（`openfeel-delegation` §8.5）。**新增风险**：大计划裁定 K 的档位命名「免审 / **快线** / 全量」中「快线」与既有「工作流快线」**同字冲突** → 档位展示命名须**方案期裁定**（Q1），**禁**直接沿用「快线」二字而不加限定。
  9. **不做**：不做需求间运行时 DAG 调度 / 需求树状态聚合（大计划 §七.1）；不做 dashboard（§七.6）；不改 phase 枚举 / `checkpoint_mapping` / `phase_corrections` / `advanceAccepted` 语义（§七.4）；不改 `openfeel-reviewer` 模型档位（§七.7，部署侧配置项）；不 `npm publish` / 不 `git push`；**不直写 `flow.json`**；不推进 phase（由 Feel 经 CLI 执行）；不改 `build.js` / `package.json`（除模板重生成必需）；提交精确 `git add`（禁 `-A`）。
  10. **非翻转面（登记防误翻）**：agent 计数 **10**、skills 计数 **22**——本阶段**预期不新增 agent / skill**（若并行契约确认需新建 skill → 须走 91 已固化的全链路：build 自动纳入 + 双注入键集 + 计数全枚举翻转，方案期显式登记）。

## KB 检索（`openfeel-check-kb`）

已加载 `.openfeel/kb/index.md`（architecture **48** / patterns **193** / troubleshooting **65** / setup **6**，2026-10-15 更新）。**高度相关条目**：

- `kb/architecture.md #Worktree 并行批次策略`（`:5`）→ **并行编排契约的既有判据来源**：按**文件集冲突域**划分并行安全组（无交集 → 可并行；后阶段依赖前阶段 API / 数据结构 / Agent 文件 → 必须串行）；并行合并顺序（先完成先合并、后完成 rebase）+ 冲突锁定机制。本阶段 T2.1 契约须与之同口径（**不另起一套判据**）。
- `kb/patterns.md #流水线 transitions 组合条件 | 运算符模式`（`:949`）→ 组合转移的**既有实现范式**（`TRANSITION_OR_SEPARATOR` + `parseTransitionKey` + `transitionKeyMatches` + `getValidTargets` 统一控制）；同条已注明与 `autoRepairInconsistency` 的已知交互问题。
- `kb/troubleshooting.md #autoRepairInconsistency 干扰组合条件推进路径`（`:106`）→ 组合键启用后**必须复核**的既有坑位（status/phase 同步可能截断组合路径；v1.1.4-stage-62 已修 `review_passed` 分支）——T2.2 实测项。
- `kb/troubleshooting.md #advanceAccepted 被误述为「组合条件路径」：字段语义须与实现对齐`（`:905`）→ 文档 / skill 写 `flow phases --json` 字段语义时的**前车之鉴**（`advanceAccepted` = 内置 15 phase 推进白名单，**不是**组合条件路径）；配套 `#flow phases 与 advance 校验集不一致`。
- `kb/architecture.md #双模式转移表选择：getValidTargets 单一取表点 + stage→mode→表 三元解析`（`kb/index.md` 分类摘要）→ **档位扩展的架构基础与零回归纪律**：新增轴（档位）须**同构**挂在单一取表点，禁第二份判定。
- `kb/architecture.md #需求级模式属性架构`（同摘要）→ 档位若挂在需求级，须与「需求**携带**模式 + 单点解析链第二条 + 载体制约束」同构。
- `kb/architecture.md #可观测性埋点架构（recordRun 命令层接线 + phase→agent 归属 + 日志 3 字段 + 会话标识三级链）`→ 本阶段提速**度量口径**的唯一来源（「先有度量再谈提速」）。
- `kb/patterns.md #值域扩展全枚举范式（单源常量 + 消费点全枚举 + 双路扫描差集逐处判类 + 生成物自动同步）`→ 档位若引入**新值域 / 新配置键**，消费点须**全枚举**（承 stage-90 三模式扩展先例）。
- `kb/patterns.md #跨阶段「契约先行」协同（单一 owner + 事前接口约束）`→ 契约落 skill 的写法纪律（单一 owner）。
- `kb/patterns.md #提示词瘦身范式` + `#模板收口三类静态断言`（参见行 `kb/architecture.md:1017`）→ 本阶段改模板时**尺寸 / 引用完整性 / 跨 harness 对称**三类断言**须保持全绿**（新增节后须复核尺寸上限与零悬空引用）。
- `kb/patterns.md #跨 harness × 语言模板对称纪律：提取式切片字节等值 + 节锚点插入 + 无裸主语`（`:3937`）→ 模板增补节的四律。
- `kb/patterns.md #陈旧计数「全枚举」纪律`（`:3983`）+ `#同类缺陷一次全量扫描` → 若发生计数翻转，双路扫描 + 逐处判类；断言面先界定类再全量枚举。
- `kb/patterns.md #零回归取证范式（补丁前/后归一化快照 diff 空）` + `kb/troubleshooting.md #零回归取证范式`（`:1220`）→ full / fast 既有表与命令输出**逐字零回归**的取证法。
- `kb/troubleshooting.md #改 templates-data 源须同批重生成的「双生成物」`（`:1151`）+ `#build「双生成物」禁手改的段二分`（`:1236`）→ 模板 / skill 改动同批 `npm run build` + `git status --porcelain src/` 断言。
- `kb/troubleshooting.md #断言串与落文逐字核对纪律（markdown 粗体断串致 0 命中）`（`:1138`）+ `#多源文案同步陷阱`（`:591`）→ 断言串与落文**同批原子更新**；双份同句须全仓 `rg` 兜底。
- `kb/troubleshooting.md #Claude Code 实机验证方法与行为事实（隔离 config + settings.json 派发 subagent）`（`:1023`）+ `#Claude Code 2.1.300 subagent 可调 Task（Q1 反转）`（`:1097`）→ **会话卫生 / 平台能力核验的实测方法学**（隔离环境 + 命令 / 版本 / 环境三要素）；且 2.1.300 起 subagent **可**调 `Task`（能力决策，非平台限制）——**本阶段并行编排的平台事实基线**（Q8 一并核验，禁沿用旧结论）。
- `kb/patterns.md #未来功能/未落地能力写入 skill 与文档须标注「提供版本」`（`:3483`）+ `#部署型资产变更的多载体同步面清单`（`:3077`）→ 平台不可控项留痕纪律；改 skill 的同步面（源 → 双注入 → 部署实例）。
- `kb/patterns.md #双主题收官端到端验收范式（隔离脚本 + 本仓复核二分）`（`:4003`）→ 档位 / 并行 / 归档轻量化的**隔离实测 + 本仓复核**二分验收法。
- `kb/troubleshooting.md #默认开启写真实用户目录的副作用防护（VITEST 继承 + OPENFEEL_LOG=0）`→ 隔离实测的环境纪律（实跑一律 `OPENFEEL_LOG=0` + 隔离 fixture ——同族坑位 `#子进程测试未设 cwd 致真实仓库污染`）。
- **无**「审查档位 / 免审 / 并行编排契约 / 归档轻量化」既有条目 → **归档轮补沉** architecture（审查档位架构：档位轴 × 单点取表 × 审计留痕；并行编排契约：冲突域判据 + 组合转移声明）与 patterns（提速度量范式：档位实跑对照 + 归档步骤下沉判据）。

> ⚠️ 执行任务前，若知识库中有相关条目，务必参考。重复踩过的坑不可再犯。

---

## 一、实测清单（基线 HEAD `16908fe`；行号 / 键值以本基线为准）

### 表 A：审查档位面（审查关 / 转移表 / 展示 / 审计）

| # | 事实（实测） | 位置 | 结论 |
|:-:|------|------|------|
| A1 | **审查关计数**：`full` 表 = **3 道审查关**（`plan_review` 计划审查 / `scheme_review` 方案审查 / `review_pending` 代码审查；另 `test_pending` 为测试关，非审查关）；`fast` 表 = **2 道**（`plan_review` 必经单轮 + `review_pending`）；`general` 表 = **0 道**（空表，无流水线） | `flow-manager.ts:4302-4349`（`getDefaultPipelineConfig`） | 档位三档的**语义基线**（设计 / 大计划口径「3 道 → 合并 / 抽样」） |
| A2 | `FAST_TRANSITIONS` = **9 条目**（8 条流转键 + `done` 终止项）；注释明示「`plan_review` 在 fast 下**必经**」「`review_failed` 双出口 = 失败回环」；**单一来源**，仅 `getDefaultPipelineConfig('fast')` 消费（禁命令层 / 模板层复制，R-74-1） | `flow-manager.ts:476-493` | 档位若新增变体，须**同构**为单源常量 + 单点消费 |
| A3 | **运行时表源 = `.openfeel/pipeline.yaml`**（存在即覆盖内置 full 表）：15 个单键 transitions（**无组合键**）+ `checkpoint_mapping` + `phase_corrections`；`fast_transitions` 键**缺失** → fast 走内置快线表 | `.openfeel/pipeline.yaml`（全 **54 行**，实测；[REV-92-001 订正] 原文「45 行」为陈述偏差，内容性断言已复核全部成立） | 「本仓 full 表 = 运行时 yaml」——档位若落在 full 线上，**受控面**（大计划 §七.4） |
| A4 | **组合条件 `\|` 语义在位**：`TRANSITION_OR_SEPARATOR = '\|'` + `parseTransitionKey` + `transitionKeyMatches`（组合任一匹配即生效）；内置 full 表**含** `'review_passed\|test_passed': ['archiving']` | `pipeline-schema.ts:42/:50/:58`；`flow-manager.ts:4331`；`flow-manager.ts:1969`（`getValidTargets` 统一控制） | 并行并行编排的**转移层基础已在位**（大计划 F2）；**但运行时未启用**（见 A5） |
| A5 | **stage-50 裁定「不补组合键」**（显式）：本仓 `pipeline.yaml` 未列该键，改以 `flow phases --json.transitionsDiff.missing` 显式化差异；测试**断言运行时表无该键**（`expect(mgr.getPipelineTransitions('full')['review_passed\|test_passed']).toBeUndefined()`）；skill 亦记载该裁定 | `skills/openfeel-cli-usage/SKILL.md:150`；`test/core/flow-manager.test.ts:4436`；`test/commands/flow.test.ts:171/:226/:314` | **本阶段若「启用」组合键 = 推翻既有裁定** → 须显式重审 + 登记（边界 7） |
| A6 | **运行时实测**（本仓）：`flow phases` 输出「当前模式：full ［来源: status.md］」+ 15 相位 + 15 条单键转移 + **差异提示「缺失键 review_passed\|test_passed」**；`flow mode` 输出模式 + 来源 + 阶段可达目标 | 本会话实跑（`OPENFEEL_LOG=0 node bin/openfeel.js flow phases` / `flow mode`） | 展示面基线（档位须在此**可见**，承 stage-75 op-002 模式分节先例） |
| A7 | `flow phases` 命令面：`--json` **6 键**（`schemaVersion` / `phases` / `transitions` / `advanceAccepted` / `transitionsDiff` / `workflowMode`）+ 人读四段（相位列表 / 模式分节行 / 转移表 / 差异与自定义 phase 提示）；`--mode` 与 `--stage` 互斥优先级「显式 `--mode` > 阶段级联」 | `commands/flow.ts:392-487` | 档位展示 = **追加键 + 追加行**（既有 6 键 / 四段逐字保留） |
| A8 | **「免审」现有的唯一形态 = `--force` 旁路**：`flow advance --to done` 时若当前 phase ∈ `SKIP_WARN_PHASES = ['exec_running','review_pending']` → **警告**（`flow.advance.warnSkipReview`）；命令层 blocking REV 门在其后（见 A9） | `commands/flow.ts:899-905`；i18n `flow.advance.warnSkipReview`（zh-CN `:166` / en `:154`） | 档位「免审」须与此**协同**（警告语义 / 覆盖范围），**禁**静默跳过无留痕 |
| A9 | **blocking REV 门（不可削弱）**：推进到 `done` 时 `assertNoBlockingOpenRev`（命令层兜底 + 多步循环每步后复检）；core 侧 `advanceStagePhase` / `resetStagePhase` 亦拒（`blocking !== false && status === 'open'`）；`--force` **仅降级为警告**且仍 `exit 1` | `commands/flow.ts:907-918`；`flow-manager.ts:1491-1505`（advance）/ `:1615-1626`（reset） | 裁定 K 硬约束：档位任何形态**不得**削弱本门 |
| A10 | **`--dry-run` 语义**：`flow advance --dry-run` 走预览分支（打印 from/to/路径后 `return`，**不 save**，且 `recordRun` 接线天然排除）；`flow stage reset --dry-run` / `checkpoint restore --dry-run` 同旨 | `commands/flow.ts:924-942`（dry-run 分支）/ `:944-946`（注释「recordRun 接线…dry-run 已于上方提前 return」）/ `:728-750` | 档位预览须**并入** dry-run 输出，零写盘逐字不变 |
| A11 | **审计留痕现状**：`advance_stage_phase` appendLog detail = `{ stageName, from, to, session_id, resumed? }`（**无档位字段**）；`reset_stage_phase` 同款；`publicLogger.logPhaseChange` 该路径已注释停用（`// REV-003: 改为 endStage 时批量聚合`） | `flow-manager.ts:1544-1550` / `:1645-1650` / `:1553` | 档位留痕 = **新增可选 detail 键**（读侧宽容；既有键逐字保留） |
| A12 | **模式解析单点**：`resolveStageWorkflowMode(stageId?)` 级联 `status.md > 需求级 > config.yaml > profile.yaml > builtin`（`source` ∈ 5 值）；取表单点 `resolveTransitionsForMode(mode)`（私有）→ `getPipelineTransitions` / `getDefaultTransitions` / `getValidTargets` / `getAvailablePhases` / `findPhasePath` 全部经其取表；`getValidTargets(fromPhase, mode)` **mode 无默认值**（编译期必传） | `flow-manager.ts:2358-2385` / `:2097` / `:1969` / `:2113` / `:2124` / `:2011` / `:2052` | 档位轴须**同构延伸**（禁第二份）；`getValidTargets` 的「必传」纪律是零回归保护 |
| A13 | **配置与载体面**：`WORKFLOW_MODES = ['full','fast','general']`（3 值）；`getConfigFieldLegalValues(key)` schema 派生（enum → options）；`STAGE_FIELD_BY_CONFIG_KEY` **3 键**（`auto_advance` / `execution_mode` / `workflow_mode`）；status.md 骨架「工作流模式」行 + flow.json 冗余 `StageData.workflow_mode?`（**不参与级联**）+ `flow health` 第 10 项冗余一致性 warn | `config.ts:27/:57-70/:77-81`；`plan/stage.ts:154-159`（骨架）/ `:219-226`（冗余写入点①）/ `:216-220`（insertStatusField 面） | 档位若新增**受管键**：须同步 4 处（骨架 / 插入 / 冗余 / health）+ 全枚举（承 stage-75/90 先例） |
| A14 | **相位枚举硬编码**：`PIPELINE_PHASES` **15 项**（`PipelinePhaseSchema` 由此派生）；`flow phases.advanceAccepted = [...PIPELINE_PHASES]`；`flow advance` 只接受 15 值 | `pipeline-schema.ts:14-23`；`commands/flow.ts:453` | **不动**（大计划 §七.4）；档位「可达 ≠ 合法」口径承 fast 先例 |
| A15 | **i18n 现状**：**939 键**（实测 `lint i18n` 全绿）；`flow.*` 域含 `advance.*`（含 `warnSkipReview` / `blockingRevRefused` / `dryRunTitle` / `pathArrow` 等）与 `phases.*` / `mode.*` | `src/core/i18n-data/{zh-CN,en}.ts`；实测 | 档位文案 = **新增键**（zh / en 双份同批 + 接入消费点防死键） |

### 表 B：并行编排面

| # | 事实（实测） | 位置 | 结论 |
|:-:|------|------|------|
| B1 | **拆分 = 一等动作在位**：`req split <id> --into <title>`（可重复；**拆分即发布**——子需求入 `scheduled`）；引擎单点 `splitRequirement`（**全成或零变更** + 顺序 ID + 父终态门 + 子项校验）；`--json` 输出 `{ schemaVersion, parent, children }`；子需求正文骨架逐条铺，任一失败 → 不 save（flow.json 零变更） | `commands/req.ts:546-621`；`src/core/req/**`（`splitRequirement` 原语） | 并行编排的**输入端已在位**（87 交付）；本阶段只做「怎么并行」的契约与转移面 |
| B2 | **`parent_id?` 仅溯源不聚合**：`RequirementData` 12 字段含 `parent_id?` / `workflow_mode?`；聚合仍**单源** `allLinkedStagesDone`（禁第二份 `.every(`——承 REV-83-002 纪律） | `src/core/req/types.ts:46/:48`；`manual/core/req.md`（12 字段 / 11 子命令登记） | 并行编排**不得**引入需求树聚合（大计划 §七.1） |
| B3 | **并行接取就绪**：`req board`（7 组固定顺序）/ `req next`（`scheduled` 且未认领；`--owner` 视角）；占用校验按**需求粒度**（`claim` 已被他人占用 → exit 1 零写盘）；skill 已载「**并行接取**：子需求之间互不阻塞」 | `commands/req.ts:622/:658`；`skills/openfeel-req/SKILL.md:84-86` | 并行 = **接取层已就绪 / 编排契约待成文** |
| B4 | **多阶段并行已在状态模型层支持**：`flow.json` 为**多阶段独立状态机**（`stages.{id}.phase` 各自推进；全局 `pipeline.phase` 仅宏观态）；feel 契约「多阶段并行时按优先级 / 依赖关系择一推进」 | `skills/openfeel-delegation` + `{opencode,claude}/agents/{zh-CN,en}/feel.md`（核心职责 3，实测）；`manual/core/flow-manager.md` | 并行编排的**模型层已在位**；缺口 = **判据 / 契约 / 实测** |
| B5 | **worktree 并行批次资产**：`status.md` `## Worktree / Session` 块（工作模式 / 分支名 / Session / 合并状态 / 清理策略）+ skill `openfeel-update-stage-status` 可选输入 `parallel_batch` / `parallel_stages`（**已在位**）；但**无代码级 worktree 管理**（`rg -l worktree src/` 非模板命中 = 0；本仓 stage-92/93/94 status 全 `manual`） | `plan/stage.ts` 骨架；`skills/openfeel-update-stage-status/SKILL.md:18-24/:62-66`；实测 | 并行编排**契约先行**（本阶段不新建 worktree 机制——防过度设计） |
| B6 | **并行安全判据既有先例**（kb）：按**文件集冲突域**划分并行安全组 + 串行依赖判定（依赖 API / 数据结构 / Agent 文件 → 必须串行）+ 合并顺序（先完成先合并 / 后完成 rebase） | `kb/architecture.md:5 #Worktree 并行批次策略` | T2.1 契约的**判据来源**（复用，不另起） |
| B7 | **串行根因量化**：opencode `task` 派发 1539 次 / **141.7h（73.0%）** / 单次均 **331s**；subagent 时间轴重叠仅 **8.3%**（基本串行）；Claude 侧主会话「等 subagent 22.9%」 | 设计 §1.2 / §1.5（`.openfeel/users/Liuary/tmp/analysis/*.md`） | 并行化的**目标与度量口径**；验收须有**前后对照** |
| B8 | **多 stage 并行事实**：本仓 flow.json 17 stages（86~91 done / 92~94 plan_pending）；`flow health` 报 9 条跨文件一致性 warn（`status.md` 未随 op 推进）——**并行度越高，状态留痕脱节面越大** | 本会话实测 `flow health` | 并行编排契约须含**留痕纪律**（防并行放大既有脱节家族） |

### 表 C：交互提速与会话卫生面

| # | 事实（实测） | 位置 | 结论 |
|:-:|------|------|------|
| C1 | **提问成本**：opencode `question` 130 次 / **33.9h（17.5%）** / 单次均 **939s**；Claude 侧主会话「等用户 32.6%」+「人不在 / 跨夜 40.9%」 | 设计 §1.2 / §1.5 | 交互提速 = **减少提问次数 + 批量确认 + 非阻塞式交互**（设计 §4 原文） |
| C2 | **提问指引现状**：skill `openfeel-tool-usage` §2 = 「触发条件（任一必问）：需求歧义 / 多个同等合理方案 / 不可逆后果 / 架构决策」+「使用要求：(Recommended) 标记、选项附后果、≤3 选项、高风险含取消」+「禁止：模糊时自行假设、多方案不选直接实施」；**无**批量确认 / 非阻塞式交互 / 一轮多问的约定 | `skills/openfeel-tool-usage/SKILL.md:17-19`；`agents-md/{zh-CN,en}.md:19/:71/:83`（路由与轻量决策边界） | 契约 delta 落点 = **该 skill 增补节**（单一 owner；提示词只留索引行） |
| C3 | **长子会话事实**：最长子会话 **1927 step**（`ses_ee3f0cbb`）；日志侧最慢 `loop step` 出现在 feel 主会话（347 step / 25.7h；642 step / 23.2h）；单步均值 130~274s（多为被 `task` / `question` 阻塞） | 设计 §1.2 / 分析报告 §7（`opencode-analysis.md:182/:207`） | 「缩短长子会话指引」= 委派**范围界定 + 分段 + 返回精简**；落 skill / 索引行（下游纪律） |
| C4 | **会话卫生 = 平台侧能力**（大计划 §七.8）：本仓 opencode 侧仅写**最小** `opencode.jsonc`（仅 `$schema`；`init.ts:268-273`，**不注入** compaction / session 回收键）；Claude 侧 `claude-settings.ts` 注入 `agent` + `permissions.defaultMode`（**无**会话回收键）；stage-91 `openfeel-context-hygiene` 已落**可控项指引**，并把「Claude auto-compact 宿主行为 / opencode compaction 平台配置」列为**不可控项** | `core/init.ts:268-273`；`core/claude-settings.ts`；`skills/openfeel-context-hygiene/SKILL.md`（stage-91） | 本阶段 = **核验平台能力**（Q8）：可控 → 落文 / 不可控 → 留痕（禁「已实现」虚述） |
| C5 | **平台事实更新**：Claude Code **2.1.300** 起，`tools` 白名单含 `Task` 的 subagent **可派发下一级**（运行时工具名 `Agent`，`spawnDepth: 2`，双阴性对照）；但本仓 claude 侧 8 份 subagent **白名单均无 `Task`**（Q15 裁定「不加」继续有效；能力可用 ≠ 必须启用） | `kb/troubleshooting.md:1097`；实测 `claude/agents/zh-CN/*.md` frontmatter（planner / reviewer / explorer 等 8 份） | 并行编排的**平台能力基线**（与 opencode 侧 `task: "allow"` 实况对照）；Q8 一并核验，禁沿用旧结论 |
| C6 | **opencode 侧直接调度已授权**：8 份 subagent 中 feel / planner / schemer / executor / reviewer / archiver / feel-tester 的 `permission.task: "allow"`（explorer 只读不派发；实测 `sed -n '/^permission:/,/^---/p'`） | `templates-data/opencode/agents/{zh-CN,en}/*.md` | 并行派发的**权限面已在位**（88 交付） |
| C7 | **度量面就位**（本阶段验收基座）：`recordRun` 命令层接线（`flow advance` 每步记录，phase→agent 归属 `PHASE_AGENT_MAP` 10 项）；CLI 日志 3 字段；`metrics.json` 非空 | `commands/flow.ts:944-976`；`core/metrics.ts:21-32/:93`；stage-86 交付 | 提速效果**可度量**（验收第 1 / 7 项的证据来源） |

### 表 D：归档轻量化面

| # | 事实（实测） | 位置 | 结论 |
|:-:|------|------|------|
| D1 | **archiver 固定成本**：中位 **5.9min**、**0 离群**、合计 7.32h（**~11%** 活跃耗时）——「被低估的固定开销」（设计 §1.2） | 设计 §1.2 表（流水线层） | 轻量化的**量化目标**：机械步骤下沉后阶段清单 / 耗时缩减（须有前后对照） |
| D2 | **归档官职责面（瘦身后模板实测）**：① 操作记录归档（`ops/**` 整理）；② **索引与手册维护**（`kb/index.md`「项目快速概览」三项：源文件数 / Agent 数 / 最近更新 + `manual/index.md` 模块树核对 + 涉及模块同步）；③ **知识提取**（`check-kb` 判定 + `openfeel knowledge dedup` 阈值判定 + 写入 4 分类文件）+ 技能索引 3 项（`check-kb` / `logging` / `memory`） | `{opencode,claude}/agents/{zh-CN,en}/openfeel-archiver.md`（实测） | 下沉候选的**全量枚举基线** |
| D3 | **机械性候选（可脚本化 / 可下沉 utility）**：① 快速概览「源文件数」（实测 `rg --files src -g '*.ts' \| wc -l` = **78**）+「Agent 数 **10**」+「最近更新」时间戳；② `manual/index.md` 模块树**存在性**核对；③ `ops/**` 清单清点与 `flow ops list` 对照；④ 各类 `git status` / 计数核对 | 实测（本会话 `wc` / `rg`；`manual/index.md` 模块树 32 条） | 判据 = **无推理 ∧ 一条命令可完成 ∧ 幂等**；明确**不下沉**面 = 知识**语义**判定（新旧取舍 / 去重裁定 / 手册职责变更判定） |
| D4 | **在位工具面**：`openfeel knowledge {list,add,search,index,dedup}`（`dedup` 为**只读建议**，不改 kb）；`openfeel health` / `flow health`；`openfeel view`；`openfeel archive <stage>`（阶段摘要归档，**与 `flow archive <version>` 版本分片归档职责不同**） | `commands/knowledge.ts:29/:62/:106/:143/:176`；`commands/archive.ts:12`；feel.md（归档与历史读取节） | 下沉**优先复用既有命令**（防过度设计）；若确需新能力 → 显式登记（Q7） |
| D5 | **边界**：归档官**不直写 flow.json / status.md**（经 CLI）；「文件机械操作 → 事务官」路由已在位（delegation skill §2 路由规则 + utility 模板「明确禁止」6 条） | `skills/openfeel-delegation/SKILL.md:28-56`；`openfeel-utility.md` | 下沉路径**不需新机制**：委托描述 + 既有 CLI |
| D6 | **版本归档已 CLI 化**：`flow archive <version>`（判据门 → 先写归档文件 → 再移除活跃条目）；feel 契约「调度侧只提示不代劳」 | `skills/openfeel-cli-usage`；`manual/core/flow-archive.md`；feel.md | **不在**本项范围（已 CLI 化）；本项 = **archiver 阶段本身的步骤轻量化** |
| D7 | **fast 轻量归档先例**（口径可复用）：归档官模板已载「**fast（工作流快线）**：轻量归档——状态记录与知识暂存判定（含去重检索）**不得省略**；清单过程性叙述可合并精简」（保留面 5 项） | `{opencode,claude}/agents/{zh-CN,en}/openfeel-archiver.md`（§工作流模式感知） | 本阶段轻量化**判据同源**：**保留面不可省**（状态记录 / 知识暂存判定 / 概览 / 手册判定 / 公共日志摘要），只减**机械过程** |

### 表 E：承接 REV 台账（判据源实测）

| # | 条目 | 状态 / 优先级 | 去向 |
|:-:|------|:--:|------|
| E1 | **REV-91-011**（审查门禁五项未独立实测；建议主会话复跑闭合） | `pending`（low） | **本阶段已具备闭合证据**：本会话实跑 `npm test` **71 / 1682 / 0 failed**、`tsc` = 0、`lint i18n` = 939、`lint kb` = 0、`git status --porcelain src/` 空（build 幂等旁证）→ **建议主会话登记 closed**（本 Agent 不改他人台账；登记去向 = 主会话） |
| E2 | **REV-91-010**（stage-91 `status.md` 状态未随 op 推进；`openfeel stage set` 被执行会话权限层拒绝） | `pending`（medium） | **转主会话**（CLI 补齐；与 REV-90-011 / REV-89-008 同源家族）。本阶段**同类风险预告**：92 的 op 收口同样会遇「executor 无 phase 推进权」→ 处置归主会话（验收要点 10 登记） |
| E3 | **REV-90-011**（stage-90 同类）/ **REV-89-008**（stage-89 同类） | `pending`（low / medium） | **转主会话**（`openfeel stage` / `openfeel flow` CLI 补齐）；本阶段零动作、不重复登记 |
| E4 | **REV-86-009**（T4.4 用例未命中 `computeResumed` 分支，保护力弱）/ **REV-86-010**（`session.json` 守卫缺位） | `pending`（low ×2） | **台账保留·销账维持**（v1.2.1 收官轮〔93〕或 v1.3.0）；非本阶段面（flow-manager 测试 / session 模块） |
| E5 | **REV-89-006 + E-89-6**（`skills/openfeel-cli-usage/SKILL.md:65`「18 个共享源」快照陈旧计数） | `closed` / 在案 | **维持转 stage-93**（快照声明件随收官轮刷新）；**本阶段若新增命令面 / 键** → 该件进一步陈旧（登记，不提前改） |
| E6 | **`req/BUG-002`**（`general` 需求恒无法 `done`：载体制约束 × done 门死锁） | `open`（medium） | **维持转 stage-93 收口轮 / 后续裁定**（判据源 `.openfeel/bugs/req.md`）；本阶段零触碰（**注**：本阶段涉档位 / 并行契约，若方案期发现与 `general` 载体约束交叉 → 仅**登记**，不改动） |
| E7 | REV-87 / REV-88 全闭环；REV-90-001~010 / 012 / 013 全 `closed`；REV-91-001~009 全 `closed`（含 009 经 op-004 处置） | 已闭合 | **登记，零动作** |

- **判据源**：`.openfeel/users/Liuary/code_review/REV-91.md`（001~011）+ `REV-90.md`（011）+ `REV-89.md`（006 / 008）+ `REV-86.md`（009 / 010）+ `.openfeel/code_review/v1.2.1-stage-91.md`（遗留节）+ `.openfeel/bugs/req.md`（BUG-002）+ 本会话实测（门禁五项复跑）。

---

## 二、目标语义与不变量

| 维度 | 内容 |
|------|------|
| 审查档位 | **三档** =「免审 / 中间档 / 全量」（**中间档展示命名待 Q1 裁定**——既「快线」与「工作流快线」同字冲突）：**全量** = 现状 3 道关（`plan_review` + `scheme_review` + `review_pending`）；**中间档** ≈ 现状 fast 语义（`plan_review` 必经单轮 + `review_pending`）/ 或「计划审查与方案审查**合并**」（设计 §4 原词）；**免审** = 小改直通（**具体跳过哪几道关 + 如何留痕，方案期定稿**——裁定 K 括注「小改免审 / 计划审查与方案审查合并 / 高风险才走满」为**设计取向**，非逐字实现规格）。**实现面 = 转移表**（裁定 K 明文） |
| 档位判据 | **按模式与规模裁剪**（裁定 K）：模式轴（`full` / `fast` / `general`）为**默认推导源**，规模 / 风险为**提升依据**（「高风险强制全量」）；判据形态（阈值 / 显式声明 / 需求级属性）**方案期定稿（Q1 / Q2）** |
| 并行编排 | **并行 = 独立子任务并行**：拆分（`req split`，87 已在位）→ 并行接取（`req claim`，按需求粒度不阻塞）→ 并行执行（**无依赖链 ∧ 无文件冲突域**）→ 各自独立审查 / 归档 → 合并；**有依赖恒串行**（裁定 L） |
| 组合转移复用 | `\|` 组合键表达「**任一源相位完成即推进**」（kb 既有范式）；**本仓是否启用（补键）须显式重审 stage-50 裁定**（Q4）——无论启用与否，均须产出「**并行场景如何声明转移**」的**契约成文** |
| 交互提速 | ① **减少提问**（必问清单收敛 + 可默认项显式化）；② **批量确认**（一轮多问 / 批量放行，替代逐步追问）；③ **非阻塞式交互**（可并行推进的事项不阻塞等待）；④ **缩短长子会话指引**（委派范围界定 + 分段 + 返回精简）——**契约成文**（落 skill） |
| 会话卫生 | **平台能力核验**（Q8）：opencode 侧子会话回收 / compaction 键可达性 + Claude 侧会话回收能力 → **可控项落文 / 不可控项留痕**；核验方法照 kb 实机验证法（隔离环境 + 命令 / 版本 / 环境三要素） |
| 归档轻量化 | **机械步骤下沉**（utility / 既有 CLI / 脚本），**保留推理面**（知识语义判定 / 去重裁定 / 手册职责判定 / 状态记录 / 公共日志摘要——承 D7 轻量口径「保留面不可省」）；**评估 → 落地 → 实测**三段，落地项须**可复跑实测** |
| 提速度量 | 一切提速主张以**实测**为准：`metrics.json`（`recordRun` 归属）+ CLI 日志 `duration_ms` + 阶段 phase 段耗时；**隔离实测 + 本仓复核二分**（kb #双主题收官端到端验收范式） |

**不变量**：

1. **相位枚举 15 项不变**（`PIPELINE_PHASES`）；档位只改**可达**不改**合法**（「可达 ≠ 合法」承 fast 先例）。
2. **blocking REV 门不可绕过**：推进 `done` 的阻塞校验（命令层 + core 双层）**逐字不变**；`--force` 仍仅「降级警告 + 退出 1」。
3. **`--dry-run` 零写盘**：`flow advance` / `flow stage reset` / `checkpoint restore` 的 dry-run 语义逐字不变（新档位预览**并入**输出，不新增写盘点）。
4. **审计只增不改**：`appendLog` detail 既有键（`stageName` / `from` / `to` / `session_id` / `resumed`）逐字保留；档位为**新增可选键**（读侧宽容）；`flow.json` 存量文件**零注入**（禁 `load` 侧补齐）。
5. **单点解析 / 单点取表**：档位与模式**共用**既有解析器家族；新增轴**同构延伸**，禁第二份层序或取表实现；`getValidTargets(fromPhase, mode)` 的「mode 必传」纪律保持。
6. **零回归**：`full` / `fast` / `general` 既有转移表、`flow phases`（人读四段 + `--json` 6 键）、`flow mode`、`flow advance` 输出与退出码**逐字不变**（除**有意**变更且登记）；`advanceAccepted` / `phases` 语义不变。
7. **并行仅限独立子任务**：无依赖链 ∧ 无文件冲突域；有依赖恒串行；**不引入**需求树聚合（聚合单源 `allLinkedStagesDone`）。
8. **平台不可控项禁「已实现」虚述**：核验留痕（三要素），不可控项落「提供版本 / 平台归属」标注。
9. **契约 delta 落 skill（单写者下游）**：可复用流程一律落 skill；agent 提示词只增**索引行 / 最小必要句**（≤6 行 / 处）；**不改 frontmatter**、**不重写模板正文**。
10. **双生成物同批**：`templates-data/**` 有改动 → 同批 `npm run build`；`git status --porcelain src/` ⊆ produces。
11. **非翻转面登记**：agent **10** / skills **22** 本阶段预期不翻转（若翻转须全枚举，见边界 10）。
12. **提交与流程卫生**：精确 `git add`（禁 `-A`）；不直写 `flow.json`；不推进 phase；不 `git push` / `npm publish`。

---

## 三、变更点清单（编号 T）

### T1 — 审查档位（免审 / 中间档 / 全量）

**T1.1 档位语义与判据定稿（Q1 / Q2 方案期定稿；先成文后落文）**
- **产出**：档位定义表（档位名 × 审查关组合 × 默认推导 × 提升条件 × 留痕要求 × 命名消歧裁定），逐档**与现状的差额对照**（现状 3 关 → 各档保留哪些关）。命名须解决边界 8 的「快线」同字冲突（建议方向：**按既有 FAST-PASS 术语体系**命名审查深度档，或加限定词）。
- **判据**：模式（默认源：`full` → 全量；`fast` → 中间档）+ 规模 / 风险（提升至全量；**高风险强制全量**＝裁定 K）+ **低风险 / 小改**回落免审（设计 §4「小改免审」）。
- **禁止**：以「档位」名义**削弱** blocking REV 门 / 审计 / `--dry-run`；以「免审」名义**静默**跳过（须有留痕）。

**T1.2 转移表层实现（单点延伸）**
- 形态（Q2 定稿）：新增档位对应**转移表变体**（与 `FAST_TRANSITIONS` 同构的单源常量 + 单点消费）；档位解析**同构**挂 `resolveStageWorkflowMode` 家族（或与其并列的**同层单点**解析器——禁第二份层序判定）。
- 约束：`phases` / `checkpoint_mapping` / `phase_corrections` 三面**共用不变**；`FAST_TRANSITIONS` / `getDefaultPipelineConfig` 既有分支**逐字不变**（零回归）。
- **免审档的「免」到何种程度**（Q3 定稿）：候选（方案期择一或组合）——跳过 `plan_review`（`plan_pending → plan_passed`）/ 跳过 `scheme_review`（`scheme_pending → scheme_passed`）/ 跳过 `review_pending`（`exec_running → review_passed`）；**任一形态均须**：① 与 `SKIP_WARN_PHASES` 警告机制协同（A8）；② 保留 blocking REV 门；③ 审计留痕。

**T1.3 展示与查询（`flow phases` / `flow mode`）**
- `flow phases`：人读增**档位分节行**（承 stage-75 op-002 模式分节先例：「档位 + 来源 + 查看指引」）；`--json` **末位追加键**（既有 6 键逐字保留、顺序不变）。
- 只读查询：档位来源与生效面须可查（`flow mode` 扩展或新只读子命令——**方案期定稿**；禁引入隐式第二份解析）。
- **差分可见**：若档位引入表变体，`transitionsDiff` 须对新变体**同口径**可见（防「展示与实际不符」——manual `core/flow-manager.md` 既有纪律）。

**T1.4 审计与 dry-run 协同（不变量 2 / 3 / 4）**
- `advance_stage_phase` / `reset_stage_phase` appendLog detail **追加档位可选键**（如 `review_tier`；命名方案期定稿）；既有键零改动。
- `flow advance --dry-run` 预览输出**含档位**（仅打印，零写盘）。
- blocking REV 门与 `--force` 语义**零改动**（断言锁定）。

**T1.5 载体与消费点全枚举（Q2 定稿；承 kb #值域扩展全枚举范式）**
- 若档位承载于**配置键 / 阶段字段 / 需求级属性** → 须同步：`ConfigDefaultsSchema`（若受管键）/ `getConfigFieldLegalValues` / `STAGE_FIELD_BY_CONFIG_KEY` / status.md 骨架 / `insertStatusField` 锚点链 / flow.json 冗余字段 / `flow health` 冗余项 / `config set --sync-stages`；**消费点全枚举 + 双路扫描差集逐处判类（零未判类）**。
- 若档位**不引入**新载体（纯由模式 + 规模在转移表层推导）→ 在计划 / 方案中**显式登记「无新载体」结论**（防审查误判遗漏）。

**T1.6 i18n + 单测 + 断言**
- 新增文案键：zh / en **双份同批** + **接入消费点**（防死键）；键名逐条列名入报告；`lint i18n` 新基线登记（> 939）。
- 单测三类：① **档位生效**（低风险免审路径 / 高风险全量路径 / 中间档路径各自可达性断言）；② **零回归**（full / fast 表与输出逐字）；③ **硬语义保护**（blocking REV 门拒 / dry-run 零写盘 / 审计键保留）。
- 既有断言面：`flow phases` / `flow mode` / `advance` 相关 describe（表 C 类判类法 → **保留 / 改写 / 新增**三类，逐条登记，**禁静默删除**）。

### T2 — 并行编排与交互提速

**T2.1 并行编排契约成文（裁定 L + kb #Worktree 并行批次策略；单一 owner）**
- **落点**（Q5 定稿）：优先**增补** `openfeel-delegation`（并列新节「并行编排」）——**不新建 skill** 为默认取向（防过度设计）；若方案期论证必须独立成文 → 走计数翻转全链路（边界 10）。
- **契约内容（五点，判据同源不另起）**：① **适用范围** = 独立子任务（无依赖链）；② **冲突域判据** = 文件集无交集（kb 既有规则）+ 依赖 API / 数据结构 / Agent 文件 → 恒串行；③ **拆分与接取** = `req split` → `req claim`（按需求粒度不阻塞）；④ **合并顺序** = 先完成先合并、后完成 rebase（kb 既有）；⑤ **留痕纪律** = 并行各支独立审查 / 归档 + 状态留痕（防表 B8 的脱节放大）。
- **显式不做**：不新建 worktree 管理机制（B5）；不做运行时 DAG 调度（大计划 §七.1）。

**T2.2 组合转移 `|` 复用与裁定重审（Q4 定稿）**
- **必做**：产出「**并行场景转移声明指南**」（如何在 `pipeline.yaml` 用组合键表达「任一完成即推进」；含 `advanceAccepted` **≠** 组合路径的既有澄清，承 kb `troubleshooting.md:905`）。
- **本仓处置二选一（显式裁定 + 登记）**：**(a) 维持不补**（stage-50 口径不变；仅文档化「按需声明」路径 + 隔离项目演示）／**(b) 补入**（须零回归论证：full 表「有意变更」登记 + `transitionsDiff.missing` 断言改写 + `autoRepairInconsistency` 交互复核〔kb `troubleshooting.md:106`〕）。**默认建议 (a)**（改动面最小、裁定一致性最高）。
- **隔离实测**（无论 a / b 必做）：隔离项目内构造两独立相位并行完成 → 任一触发推进（命令 + 版本 + 环境三要素留痕）；**并复测** `autoRepairInconsistency` 不与组合路径互相截断。

**T2.3 交互提速契约**
- **落点**：`openfeel-tool-usage` §2（提问）**增补**——① **必问清单收敛**（现状 4 条触发条件复核，剔除可默认项）／② **批量确认**（一轮多问形态 + 放行记录）／③ **非阻塞式交互**（可并行事项不阻塞；对照 `question` 单次均 939s 的成本）／④ **默认推进的留痕**（默认值 + 记录）。
- **边界**：**不降低**「不可逆后果 / 架构决策必问」底线（安全边界不因提速削弱）；与 `openfeel-delegation` §3「流程不可跳过」不冲突（提问收敛 ≠ 审查跳过）。
- feel.md / 约束层：**最多索引行**（不重写正文）。

**T2.4 缩短长子会话指引**
- 内容：**委派范围界定**（单次委派 = 单一目标 + 明确边界）+ **分段**（长任务切分为可交付小段，避免 1000+ step 长子会话）+ **返回精简**（既有先例「子 Agent 返回 ≤10 行摘要 + 完整报告落盘」通用化）。
- 落点：随 T2.1 / T2.3 同批落 skill（`openfeel-delegation` 或 `openfeel-context-hygiene`——Q5 定稿）；**不新增** agent 提示词正文段落。

**T2.5 会话卫生平台能力核验（Q8；禁虚述）**
- **核验项**：① opencode 侧——子会话自动回收 / archive / compaction 配置键**可达性**（本仓 `init.ts` 只写最小 `$schema`，B/C4 事实）；② Claude 侧——会话回收能力归属（宿主行为 vs 可编程面）；③ **并行派发平台事实**（C5 / C6 复核：Claude 2.1.300 `Task` 白名单能力 vs 本仓不加的决策；opencode `task: allow` 实况）。
- **产出**：核验记录（命令 + 版本 + 环境三要素）+ **可控 / 不可控分列**结论 + 处置（可控项落文 / 不可控项留痕，禁「已实现」）。
- **与 stage-91 分界**：91 已落**指引**（`openfeel-context-hygiene`）；本项只做**平台能力核验与边界留痕**，不重复落指引。

### T3 — 归档轻量化（评估 → 落地 → 实测）

**T3.1 归档固定成本拆解与下沉判定（评估；先成文）**
- **产出**：归档官**逐步骤表**（步骤 → 类型〔机械 / 推理〕→ 现状载体 → 下沉目标 → 判据满足性 → 判定）。判据三条：**无推理** ∧ **一条命令可完成** ∧ **幂等**。
- **明确不下沉的保留面**（承 D7）：知识**语义**判定（新旧取舍 / 去重裁定 / 模块职责变更判定）/ 状态记录 / 公共日志摘要 / 知识库快速概览**结论**。
- 输入 = 表 D2 全量职责枚举（防漏项）；产出表入报告 + 末位 op。

**T3.2 落地项（Q7 定稿；优先复用既有能力）**
- 候选（逐项裁定「落地 / 登记不做 + 理由」）：
  - ① **快速概览取值脚本化**：源文件数 / Agent 数 / 最近更新三项**自动派生**（复用 `rg --files` / `listAgentIds` 类既有口径；**若新增只读 CLI 能力须显式登记**——建议优先**脚本 + skill 清单**，避免扩命令面）；
  - ② **`manual/index.md` 模块树核对清单**（存在性 / 覆盖面的机械核对步骤成文）；
  - ③ **`ops/**` 清单清点**与 `flow ops list` 对照步骤成文；
  - ④ **归档官模板轻量化**：把机械步骤描述**替换为一行指针**（指向 skill / 脚本 / 事务官），**保留推理面清单**（≤6 行 / 处；跨 harness × 语言对称四律）。
- **边界**：不改 `openfeel archive` / `flow archive` 语义（D4 / D6）；不新增第三方依赖；不改变「归档官不直写 flow.json / status.md」。

**T3.3 度量与实测（前后对照）**
- **基线**：archiver 中位 5.9min / 0 离群（D1）+ 本仓归档轮步骤清单（隔离项目实跑一轮：`flow advance … --to archiving/done` 类路径 → 归档官步骤 / 时长）。
- **落地后**：同口径复测（步骤数 / 耗时 / 人工介入点），产出**前后对照表**；耗时口径取 `metrics.json`（`archiver` 归属）+ CLI 日志 `duration_ms`。
- **纪律**：隔离 fixture（`OPENFEEL_LOG=0` + cwd 隔离，kb 同族坑位）；本仓复核二分。

### T4 — build 双生成物 + 断言 + 门禁收口（阶段末 op）

**T4.1 双生成物**：`templates-data/**`（skill / agent）有改动 → 同批 `npm run build`；×2 幂等（`git status --porcelain src/` ⊆ produces）。
**T4.2 静态断言复核**：stage-91 三类断言（**尺寸方向值** / **skill 索引引用完整性** / **跨 harness 对称**）在增补节后**保持全绿**；若尺寸贴线 → 同批收紧或登记（**禁**放松上限）。
**T4.3 断言同批修订**：档位 / 面板相关 describe 逐条判类（保留 / 改写 / 新增）+ 差额对照（禁静默删除）。
**T4.4 计数与生成物复核**：agent **10** / skills **22** 非翻转面逐处核对（若翻转 → 全枚举）；双注入键集一致；`ADAPTER.{zh-CN,en}.md` 计数行（若变）。
**T4.5 门禁全量（阶段末）**：`npm test`（新基线登记）/ `tsc --noEmit` = 0 / `lint i18n`（新基线）/ `lint kb` = 0 / `npm run build` ×2 幂等 / `--version` = **1.2.0**（不改，归 93）。
**T4.6 收口**：`ops/**` 精确 `git add`（禁 `-A`）；终局报告含**档位对照表 / 并行实测记录 / 会话卫生核验结论 / 归档轻量化前后对照**四表 + 承接 REV 三分结论；归档轮落点登记（kb 补沉 + manual 面 + cli-usage 快照去向）。
**T4.7 流程面移交**：`status.md` 更新经 `openfeel stage` CLI（**executor 可能无 phase 推进权** → 按 E2 口径移交主会话，登记不阻塞）。

---

## 四、开放问题（方案期 / 执行期定稿）

- **Q1 档位命名与语义边界（= 大计划 §十 Q6）**。建议：采用**非撞名**展示命名（`免审 / 中间档 / 全量` → 定稿中文名 + i18n 英文名）；「中间档」语义二选一——(i) 等同 fast 语义（2 关）／(ii) 「**计划审查与方案审查合并**」为单轮（设计 §4 原词）。**方案期须显式裁定**并解决边界 8 的「快线」同字冲突。
- **Q2 实现形态与载体（= Q6 配置形态部分）**。建议：**优先不加新载体**——档位由「模式 + 规模」在**转移表层**推导（裁定 K 明文「转移表层实现」）；若确需显式声明，再评估「配置键 / 阶段字段 / 需求级属性」三选一，并**全枚举**消费点（表 A13）。**防过度设计**：能不加载体就不加。
- **Q3 免审档的「免」程度与协同**。建议：**默认仅免 `scheme_review`（合并）/ 或按小改豁免单道关**，**不漏 blocking REV 门**；与 `SKIP_WARN_PHASES` 警告（A8）**同批**扩展（警告文案 + 覆盖相位），并在审计 detail 记档位。方案期定稿「跳过哪关 + 警告触发相位 + 留痕键名」。
- **Q4 组合键启用策略（stage-50 裁定重审）**。建议：**维持不补**（选项 a）——本仓零回归、裁定一致；「复用」体现为**契约 + 指南 + 隔离实测**（选项 b 须附零回归论证 + 断言改写）。**须显式登记裁定结论**（禁无声）。
- **Q5 并行 / 交互契约的落点与粒度**。建议：**增补 `openfeel-delegation`**（并行编排节 + 交互提速节），`openfeel-tool-usage` 只落**提问判据**增补；**不新建 skill**（防计数翻转与重复 owner）。若方案期判定独立成文 → 走全链路登记。
- **Q6 档位验收的实跑口径**。建议：隔离项目三路实跑（免审档 / 中间档 / 全量档各一轮，记录相位轨迹 + 审计条目 + `metrics.json` 增量 + CLI 日志字段），本仓复核「full 行为逐字不变」。
- **Q7 归档轻量化落地范围**。建议：**优先脚本 / skill 清单**（不新增 CLI 能力），仅当某步骤在「一条命令」口径下确需新能力时才评估新增（须登记影响面：i18n / help 键 / `--json` 契约 / 测试）。
- **Q8 会话卫生与平台能力核验结论（= 大计划 §十 Q8）**。建议：核验三项（opencode 子会话回收 / compaction 键可达性；Claude 会话回收归属；并行派发平台事实 C5 / C6）→ 结论**分列**（可控项落文 / 不可控项留痕）。**执行期定稿 + 留痕**（命令 + 版本 + 环境三要素）。
- **Q9 与 stage-93 的分界**。建议：`cli-usage` 快照件（E5）、`--version`、README / CHANGELOG / manual 全量刷新归 **93**；本阶段只落**新增命令面 / 键的即时登记**（不提前刷新快照件）。

## 五、验收要点（阶段级）

1. **审查档位按档生效**：三档**各一轮实跑**（隔离项目）——相位轨迹符合档位定义；档位在 `flow phases`（人读 + `--json` 追加键）**可见**；档位来源可查；**高风险强制全量**路径有断言。
2. **硬语义零破坏（断言 + 实测）**：① blocking REV 门拒推进（含 `--force` 仍 exit 1）；② `--dry-run` 零写盘（新预览含档位）；③ 审计 detail 既有键逐字 + 档位新增键在位；④ 相位枚举 15 项 / `advanceAccepted` 逐字不变。
3. **组合转移复用可用**：隔离实测「两独立相位并行完成 → 任一触发推进」+ `autoRepairInconsistency` 交互复测；**stage-50 裁定处置结论显式登记**（维持不补 / 补入 + 论证）。
4. **并行编排契约成文**：skill 节在位（适用范围 / 冲突域判据 / 拆分接取 / 合并顺序 / 留痕纪律 五点齐备）；与 kb #Worktree 并行批次策略**同口径**（无第二套判据）；拆分并行链路实测（`req split` → 两子需求并行 claim → 各自独立推进不阻塞）。
5. **交互提速契约成文**：必问清单收敛 + 批量确认 + 非阻塞式交互 + 默认留痕四项在位；**安全底线未削弱**（不可逆 / 架构决策仍必问）；缩短长子会话指引在位。
6. **会话卫生核验落档**：核验记录（三要素）+ 可控 / 不可控分列 + **零「已实现」虚述**；与 91 的指引不重复。
7. **归档轻量化落地项实测**：前后对照表（步骤 / 耗时 / 人工介入点）；保留面（知识语义判定 / 状态记录 / 公共日志摘要）**零丢失**；归档官模板改动 ≤6 行 / 处且四律通过。
8. **门禁**：`npm test` **0 skipped / 0 failed**（新基线逐项登记，起点 71 文件 / 1682 用例）；`npx tsc --noEmit` = 0；`lint i18n` = **实测新基线**（≥ 939，新增键逐条列名）；`lint kb` = 0；`npm run build` ×2 幂等（`git status --porcelain src/` ⊆ produces）；`--version` = **1.2.0**（不改，归 93）。
9. **承接**：REV 三分结论零灭失；REV-91-011 的**复跑证据**已备（本会话实测）；REV-91-010 / 90-011 / 89-008 转主会话登记在位。
10. **收口**：`ops/**` 精确入管；终局报告四表齐备；status.md 走 CLI（权限不足则按 E2 移交主会话）；归档轮落点（kb 补沉 + manual 面 + cli-usage 快照转 93）登记。

## 六、风险

| # | 风险 | 影响 | 缓解 |
|:-:|------|------|------|
| R-92-1 | **档位弱化审计**（免审批档成为「跳审后门」） | **高** | 裁定 K 硬约束逐条锁定（不变量 2/3/4）+ 档位显式声明与留痕（`advance` detail）+ **高风险强制全量** + 审查聚焦「档位是否削弱质量底线」+ 三档实跑证据 |
| R-92-2 | **档位轴失控**（第二份解析 / 值域扩散 / 消费点遗漏） | **高** | **单点延伸**（不变量 5）+ 消费点**全枚举 + 双路扫描差集逐处判类（零未判类）**（kb 值域扩展范式）+ 「无新载体」须显式登记 |
| R-92-3 | **推翻 stage-50 裁定而无声**（组合键被顺手补入） | 中 | Q4 显式裁定 + 登记 + 断言改写差额对照；`transitionsDiff` 断言同批更新（A5） |
| R-92-4 | **并行误用**（有依赖被并行 → 数据冲突 / 覆盖） | **高** | 契约判据「无依赖 ∧ 无文件冲突域」（kb 同源）+ 隔离实测 + 留痕纪律 + 审查核对 |
| R-92-5 | **平台能力虚述**（会话卫生写「已实现」） | 中 | 可控 / 不可控分列留痕 + 三要素实测 + kb #未来功能标注「提供版本」纪律 |
| R-92-6 | **归档轻量化过度**（机械下沉连带删掉知识语义判定 → 沉淀质量下降） | **中高** | D7 轻量口径「保留面不可省」+ 逐步骤表（类型判定留痕）+ 审查核对保留面 |
| R-92-7 | **契约落点膨胀**（重写模板正文，违单写者） | 中 | 边界 5（只增索引行 / ≤6 行每处）+ diff 白名单 + 审查核对 40 份模板正文零重写 |
| R-92-8 | **零回归破坏**（full / fast 表 / `flow phases --json` 6 键 / `flow advance` 输出） | **高** | kb #零回归取证范式（补丁前后归一化快照 diff 空）+ 逐字断言 + 「有意变更」白名单登记 |
| R-92-9 | **生成物漏 build**（改 skill 忘重生成） | 中 | `templates-data` 改动 → 同批 `npm run build` + `--porcelain` 断言 + 双注入键集一致断言（E3 先例） |
| R-92-10 | **i18n 死键 / 漏键** | 中 | zh / en 双份同批 + 接入消费点（防死键先例）+ `lint i18n` 逐键列名 |
| R-92-11 | **本仓自举混淆**（本仓八阶段恒 full → 档位实跑须隔离） | 低 | 隔离项目实跑（Q6 口径）+ 本仓仅作零回归复核（裁定 B 登记） |
| R-92-12 | **阶段末流程面权限拒绝**（executor 无 `openfeel stage set` 权 → status.md 再度脱节，续 E2 家族） | 低 | 收口 op 显式移交主会话（T4.7）+ 终局报告登记（不阻塞） |

**回滚**：源码层均可 `git revert` 对应提交；档位若为**新增可选载体**（配置键 / 字段）→ 缺省即回落现状语义（读侧宽容，零注入）；转移表变体为**新增单源常量**（不影响既有三表）；skill / 模板为纯文本（逐文件 revert + build 重生成）；**无数据格式破坏**（不触碰 `flow.json` 结构 / phase 枚举 / `--json` 既有键）。

## 七、承接 REV 与处置表（REV-85-002 固化口径；判据源 = 上游台账文件）

- **判据源**：`.openfeel/users/Liuary/code_review/REV-91.md`（001~011）+ `REV-90.md`（011）+ `REV-89.md`（006 / 008）+ `REV-86.md`（009 / 010）+ `.openfeel/code_review/v1.2.1-stage-91.md`（遗留节）+ `.openfeel/bugs/req.md`（BUG-002）+ 本会话门禁复跑实测。

| 上游条目 | 优先级 | 去向 | 依据 |
|---------|:--:|------|------|
| **REV-91-011**（门禁五项未独立实测） | low | **本阶段提供闭合证据 → 转主会话登记 closed** | 本会话实跑：`npm test` 71 / 1682 / 0 failed、`tsc` = 0、`lint i18n` = 939、`lint kb` = 0、`git status --porcelain src/` 空；planner 不改他人台账 |
| **REV-91-010**（stage-91 status.md 未推进）/ **REV-90-011** / **REV-89-008**（同类家族） | medium / low | **转主会话**（CLI 补齐：`openfeel stage` / `openfeel flow`） | 流程态遗留非代码缺陷；本阶段零动作、登记不重复；本阶段**同类风险预告**入 T4.7 |
| **REV-86-009** / **REV-86-010** | low ×2 | **台账保留·销账维持**（93 收官轮或 v1.3.0） | 非本阶段面（flow-manager 测试 / session 模块） |
| **REV-89-006 + E-89-6**（cli-usage 快照陈旧计数） | low | **维持转 stage-93**；本阶段若新增命令面 / 键 → **进一步陈旧（登记）** | 快照声明件随收官轮刷新；本阶段零触碰该文件 |
| **`req/BUG-002`**（`general` 需求恒无法 `done`） | medium | **维持转 stage-93 收口轮 / 后续裁定** | 本阶段零触碰；若方案期发现与档位 / 并行契约交叉 → 仅登记 |
| REV-87 / REV-88 全闭环；REV-90-001~010 / 012 / 013；REV-91-001~009 | — | **已闭合**（登记，零动作） | 台账实测全 `closed` |

- **三分结论**：本阶段处置 **0**（上游无本阶段面 pending REV）／台账保留 **2**（REV-86-009 / 010）／显式转后续或转主会话 **4**（REV-89-006 + E-89-6 + BUG-002 → 93；REV-91-010 / 90-011 / 89-008 → 主会话）+ **1 条提供闭合证据**（REV-91-011）→ **零灭失**成立。
- **产出清单双向偏差登记（供 `deps.yaml` 后续同步与阶段对账；同步由主会话执行，本 Agent 不直改）**：

| 面 | 条目 | 说明 |
|----|------|------|
| **增补面**（deps 缺 / 实际改动） | ① `src/core/i18n-data/{zh-CN,en}.ts`（档位文案键）② `src/commands/stage.ts` / `src/core/plan/stage.ts`（**仅当**档位承载于阶段字段——Q2 定稿）③ `src/core/req/**`（**仅当**档位承载于需求级）④ `src/core/templates-data/skills/**`（并行 / 交互契约节）⑤ `test/**` 相关 describe ⑥ `.openfeel/plan/v1/stage-92/ops/**` | ①~⑥ 见 T1.5 / T1.6 / T2 / T4；`deps.yaml` 的 `produces_core` 已含 `src/core/{flow-manager,config}.ts` + `src/commands/flow.ts` + `test/commands/flow.test.ts` + `test/core/{flow-manager,config}.test.ts` → 余项按上表增补 |
| **移除面**（deps 有 / 本阶段零触碰） | `.openfeel/pipeline.yaml`（**默认零改动**；仅 Q4 裁定补键时触及） | 受控面（大计划 §七.4） |
| **阴性面**（不在本轮改动清单） | `src/core/req/**`（若 Q2 不选需求级）、`docs/**`、`README*`、`CHANGELOG.md`、`.openfeel/manual/**`（除 T4.6 登记）、`skills/openfeel-cli-usage/SKILL.md`（快照件 → 93）、`.openfeel/config.yaml`、`flow.json`、phase 枚举 / `checkpoint_mapping` / `phase_corrections`、`build.js`、`package.json`、`openfeel-archiver` 以外的 agent 模板正文 | 按边界 5 / 9 隔离；既有断言与契约门锁定 |

## 八、op 拆分建议（供 openfeel-schemer 定稿；`est_ops = 4`〔大计划 §四 阶段表登记 **3**；建议增 1 个收口 op——收口恒独立，承 stage-91 先例〕）

| op | 内容 | 主要文件 | 依赖 |
|:--:|------|------|------|
| `op-001` | **T1 审查档位**：档位定义表与判据（Q1~Q3 定稿）/ 转移表变体（单源常量 + 单点延伸）/ `flow phases` + `flow mode` 展示 / 审计 detail 可选键 / `--dry-run` 协同 / 载体与消费点全枚举（若适用）/ i18n 双份 / 单测三类（档位生效 + 零回归 + 硬语义） | `src/core/{pipeline-schema,flow-manager,config}.ts`、`src/commands/flow.ts`、`src/core/i18n-data/*.ts`、`test/commands/flow.test.ts`、`test/core/{flow-manager,config}.test.ts` | — |
| `op-002` | **T2 并行编排与交互提速**：并行编排契约节（五点）/ 组合转移声明指南 + **stage-50 裁定重审结论** + 隔离实测 / 交互提速契约（必问收敛 + 批量确认 + 非阻塞 + 留痕）/ 缩短长子会话指引 / **会话卫生平台核验**（三要素 + 可控不可控分列）/ 模板索引行 / 断言同批 | `src/core/templates-data/skills/{openfeel-delegation,openfeel-tool-usage,openfeel-context-hygiene}.md`、`{opencode,claude}/agents/{zh-CN,en}/feel.md`（索引行）、**`.openfeel/pipeline.yaml`（仅 Q4 选 b 时）**、`src/core/{template-loader,update}.ts`（build）、`test/core/templates.test.ts` | **hard: op-001**（档位裁定影响并行场景的转移声明口径——先冻结转移面语义） |
| `op-003` | **T3 归档轻量化**：逐步骤表（机械 / 推理判定）/ 落地项（脚本或 skill 清单 / manual 核对清单 / ops 清点）/ 归档官模板轻量化（≤6 行每处）/ **前后对照实测**（隔离轮 + 本仓复核） | `{opencode,claude}/agents/{zh-CN,en}/openfeel-archiver.md`、Q7 定稿的脚本 / skill 落点、双生成物、`test/core/templates.test.ts` | **hard: op-002**（同批 build 与模板断言面——减少两次触碰模板） |
| `op-004` | **T4 门禁收口（阶段末 op）**：build ×2 幂等 / 三类静态断言复核（尺寸 / 引用完整性 / 跨 harness 对称）/ 计数非翻转面核对 / 门禁全量（新基线登记）/ 四表汇总（档位对照 / 并行实测 / 会话卫生核验 / 归档前后对照）/ 承接 REV 三分结论 / `ops/**` 入管 / 终局报告 / 归档轮落点登记 / **流程面移交主会话**（T4.7） | `test/**`（收口断言）、`.openfeel/plan/v1/stage-92/ops/**`、`.openfeel/plan/v1/stage-92/status.md`（经 CLI，勿手改） | **hard: op-001 / op-002 / op-003**（源码冻结后） |

- **文件冲突（`mutual_exclusion`）**：op-002 与 op-003 **共有** `test/core/templates.test.ts` 与**双生成物**（两次 build）→ **恒串行**；op-001 与 op-002 共有**转移面语义**（档位影响并行声明口径）→ 串行；op-004 为收口（恒末位）。
- **降级方案（3 op）**：若方案期判定 T3 归档轻量化与 T2 无模板面冲突（Q7 全部落脚本、不动模板）→ T3 并入 op-002，op 数 = 3（对齐大计划 `est_ops = 3`）；**取舍须在方案期显式登记**。
- **op 级依赖与文件清单由 openfeel-schemer 落 `ops/deps.yaml`**（hard / soft / mutual_exclusion，声明实际文件名）。

## 九、修订记录

| 时间 | 制定人 | 说明 |
|------|--------|------|
| 2026-10-15 | openfeel-planner | 初稿：依据大计划 `.openfeel/plan/v1/v1.2.1/plan.md`（§二 表 F「流水线提速」F1~F4 + §三 裁定 K/L/O + §七 边界 + §八.8 验收 + 附录 A「stage-92」+ §十 Q6/Q8）+ 设计 `docs/v1.2.1-design.md` §4（流水线优化提速）与 §1.2/§1.5（时间构成与串行事实）+ `kb/` 20 余条 + `deps.yaml` stage-92 notes；源码 / 运行时复核 **5 表 42 项**（审查档位面 A1~A15、并行编排面 B1~B8、交互提速与会话卫生面 C1~C7、归档轻量化面 D1~D7、承接 REV 台账 E1~E7）；变更点 T1~T4；开放问题 Q1~Q9；风险 R-92-1~12；承接表（处置 0 / 保留 2 / 转出 4 + 1 条闭合证据）；op 拆分建议 4 项（含 3 op 降级方案）。**只写本计划文档**（未改源码 / 未改 `deps.yaml` / 未直写 flow.json / 未推进 phase / 未写其它阶段文件；基线 HEAD `16908fe`）。 |
