# v1.2.1-stage-93 计划 — 文档与版本收口（v1.2.1 收官）

- **阶段**：`v1.2.1-stage-93`（七主题之收官 · 版本计划 §四 阶段表第八项 + §六 版本收口清单 + 附录 A「stage-93」）
- **依赖**：**hard: `v1.2.1-stage-91` / `v1.2.1-stage-92`**（flow.json `deps=["v1.2.1-stage-91","v1.2.1-stage-92"]`；两者均已 done）。**实况登记**：`v1.2.1-stage-94`（模型默认值与部署非破坏性，用户直接指令新增的**表外补阶段**）已于 2026-10-15 先行完成（归档提交 `e72539f`）——其模型默认值统一与部署非破坏性（用户主权键 `model`）语义**须被本阶段文档口径吸收**（stage-94 计划 §边界 8 明示交接口径）；本阶段为其后的**唯一活跃阶段**（flow.json `stages` 17 项中 86~94 全 done，仅 93 `plan_pending`）。
- **优先级**：P0（版本级终局包装：**缺陷清零** + 文档多载体 + CHANGELOG + 版本 **1.2.1** 全链路 A/B/C/D/E + 七主题端到端验收 + roadmap/plan 回填 + 承接 REV 处置）
- **制定人**：openfeel-planner ｜ **制定时间**：2026-10-15 ｜ **修订轮**：修订 0（初稿）
- **基线**：**HEAD `e72539f`**（「chore: 阶段归档 v1.2.1-stage-94」）。全表实测；本文行号 / 键值均以该基线为准（如漂移按**内容特征**复核）。
- **上游基线（stage-94 归档登记值；本会话实测复核项已标注）**：`npm test` **71 文件 / 1707 用例** 0 skipped / 0 failed（stage-94 审查会 + 测试官双独立复跑）；`npx tsc --noEmit` = **0**；`openfeel lint i18n` = **944**；`openfeel lint kb` = 0 过期（612 引用）；`git status --porcelain src/` **空**（双生成物与源一致；本会话实测全仓仅 ` M .openfeel/metrics.json` = 运行痕迹）；`node bin/openfeel.js --version` = **1.2.0**（本会话实测；归本阶段改 1.2.1）；flow.json `revision 1175` / `archived_versions` **9** / `requirements` **0** / `reviews` **0**（本会话实测）；agent **10** / skills **22** / 双注入键集 **22**；本仓 `.openfeel/config.yaml defaults.workflow_mode: full` + `test_enabled: true`；本阶段 status.md 工作流模式 = **full**。
- **定位**：把 v1.2.1（八阶段 86~93 + 表外补阶段 94）收口为**可归档状态**——在**全内容冻结**（86~92 功能 + 94 模型/部署语义）之上完成三件事：
  1. **缺陷清零**（收口前必修）：`req/BUG-002`（medium，general 需求恒无法 `done`——载体制约束 × done 门死锁；修复**须显式 supersede C2 断言口径**）+ `cli/BUG-011`（medium，`--review-tier lean|skip` 在阶段恰停于被裁剪相位时报「无合法跳转目标」exit 1——免审档典型用法失效；须补该场景覆盖）+ `templates/BUG-007`（low，en 侧归档官指针 `§Archive Mechanical Checklist` 悬空）。
  2. **版本收口**：版本 **1.2.1** 全链路 A/B/C/D/E（6 载体 / 8 文件 / 10 处 + B 双生成物重生成 + C 传播 + D 白名单 file:line 枚举 + E 无载体）+ `CHANGELOG [1.2.1]` + 文档多载体（README×3 / GETTING_STARTED / commands / manual / cli-usage skill 快照）。
  3. **收官验收与承接**：七主题端到端验收（大计划 §十一 ×10，隔离脚本 + 本仓复核二分）+ roadmap/plan 回填 + 承接 REV 与 BUG 处置表（判据源 = 上游台账实测）。
- **收口纪律（承 v1.2.0-stage-85 / REV-85-006 定稿）**：**版本收口 op = 阶段最终 op**（版本号写入、CHANGELOG、验收、门禁、回填、入管**同 op**）；版本号修改后至阶段结束**不再引入任何代码改动**；**收口期不引入新功能**——缺陷修复仅限上述三 BUG 白名单（发现新缺口 → 记录并评估，不擅自扩面）。
- **范围（文件级）**：
  - **缺陷清零面**：`src/core/req/requirement-ops.ts`（done 门 + 载体制门）、`src/core/req/types.ts`、`src/commands/req.ts`（文案 / help）、`src/core/i18n-data/{zh-CN,en}.ts`（文案键）、`src/core/flow-manager.ts`（`pruneTransitionsByTier` / 评估 `findPhasePath`）、`src/core/pipeline-schema.ts`（如涉 `TIER_PRUNED_PHASES`）、`src/core/templates-data/{claude,opencode}/agents/en/openfeel-archiver.md`（BUG-007 两处）、`src/core/template-loader.ts` + `src/core/update.ts`（**双生成物，build 重生成禁手改**）
  - **断言面**：`test/core/req.test.ts`、`test/commands/req.test.ts`、`test/core/flow-manager.test.ts`、`test/commands/flow.test.ts`、`test/core/templates.test.ts`（§锚完整性评估）
  - **版本载体（A 类）**：`package.json`（`:3`）、`package-lock.json`（root `:3`/`:9` 两处，**禁 `npm install` 重生成**）、`.openfeel/config.yaml`（`:7` 单行 edit，**禁整文件重写**）、`src/core/config.ts`（`CONFIG_TEMPLATE_{ZH,EN}` 版本行 `:436`/`:493`）、`src/core/templates-data/agents-md/{zh-CN,en}.md`（`:135`「当前 v1.x」行）、`src/core/templates-data/claude/constraint/{zh-CN,en}.md`（`:138` 同款）
  - **文档载体（C 类）**：`README.md`（`:11` 横幅 + `:51` 起能力节）、`README.zh-CN.md` / `README.en.md`（`:83` 能力节 + `:211` 测试数行）、`docs/GETTING_STARTED.md`（`:3` 快照）、`docs/commands.md`（`:3` 快照 + `req split` / `--workflow-mode` / `--review-tier` 等新命令面）、`.openfeel/manual/{index.md,core/req.md,core/flow-manager.md,cli/commands.md}`（核对/最小补正 + 已知缺口清除）、`src/core/templates-data/skills/openfeel-cli-usage/SKILL.md`（**快照件 → v1.2.1**：`:3` description / `:15` 快照行 / `:38` 表行 / `:50` 起新节 / `:65` **陈旧计数订正**〔E-89-6〕）、`src/core/templates-data/skills/openfeel-req/SKILL.md`（`:77` 模式表述精确化，随修复）
  - **回填面**：`.openfeel/roadmap/v1.2.1.md`（状态 + M41~M48）+ `.openfeel/plan/v1/v1.2.1/plan.md`（最小追加，含 stage-94 表外登记）
  - **收口面**：`CHANGELOG.md`（`## [1.2.1]`）、`.openfeel/plan/v1/stage-93/ops/**`（末位 op 的 produces 清单）
- **边界**：
  1. **不改命令行为**（除三 BUG 修复的**有意变更**且登记）；**不新增功能 / 命令 / 字段 / 配置键**；收口期控制流冻结（缺口 → 记录评估，不擅自扩面——承 stage-85 口径）。
  2. **修复仅限白名单三 BUG**（BUG-002 / BUG-011 / BUG-007）；每项修复的**有意语义变更**须显式登记 + supersede 材料（禁静默改写断言——BUG-002 的 C2 口径）。
  3. **收口 op 为最终 op**：版本号 / CHANGELOG / 验收 / 门禁 / 回填 / ops 入管**同 op**；其后零代码改动。
  4. **A 类内容特征扫描兜底 + D 类 file:line 白名单**（禁广谱 sed）；「残留 = 0」白名单化；`package-lock.json` 禁 `npm install`；`config.yaml` 禁整文件重写（单行 edit）。
  5. **双生成物纪律**：`templates-data/**` 任何改动（BUG-007 / cli-usage / agents-md / constraint）→ 同批 `npm run build`；`git status --porcelain src/` ⊆ produces。
  6. **零回归**：既有命令输出 / `--json` 契约 / phase 枚举 15 项 / `advanceAccepted` / `flow phases` 键序**逐字不变**（除有意变更且登记）；存量 `flow.json` **零注入**；`--version` 由 `package.json` 直读（无 VERSION 常量）。
  7. **验收二分**（kb #双主题收官端到端验收范式）：隔离脚本（`OPENFEEL_LOG=0` + 隔离 fixture，防真实用户目录副作用）+ 本仓复核（归档态 + 17 阶段）。
  8. **不做**：不做需求归档 / DAG 调度 / dashboard；不改 phase 枚举 / `checkpoint_mapping` / `phase_corrections` / `advanceAccepted`；不改 CI；不引入第三方依赖；不 `npm publish` / 不 `git push`；**不直写 `flow.json`**；不推进 phase（由 Feel 经 CLI 执行）；提交精确 `git add`（禁 `-A`）；不改 `build.js`；`openfeel-reviewer` 模型档位为部署侧配置（§七.7 边界，本阶段零动作）。
  9. **历史文档不回溯改**（stage-90 计划 / 历史 REV 记录中的旧口径文字）——supersede 以**追加式**记录（原行保留 + 变更块；kb #supersede 范式），不重写历史。
  10. **平台不可控项禁虚述**（会话卫生 / compaction 归属已在 91/92 落痕，本阶段引用不重述）。

## KB 检索（`openfeel-check-kb`）

已加载 `.openfeel/kb/index.md` 分类摘要（architecture **51** / patterns **195** / troubleshooting **66**，2026-10-15 更新）。**高度相关条目**：

- `kb/patterns.md #版本号全链路收口清单模式：A 必改 / B 生成段 / C 传播 / D 禁改 / E 无载体` → 本阶段 T3 逐类核对（清单已实测至 file:line，见 §一 表 B）。
- `kb/patterns.md #文档侧历史标记纳入版本收口禁改白名单：B 类双生成物 + 「残留=0」白名单化 + 收口 op 为最终 op` → ① B 类 = `template-loader.ts` **+** `update.ts`（缺一不可）；② 「残留 = 0」**白名单化**（禁广谱 sed；白名单 file:line 显式枚举）；③ 收口 op 为最终 op。
- `kb/patterns.md #supersede 历史决策的追加式记录：保留原行 + 追加注记块`（`:3056`）→ **BUG-002 的 C2 口径 supersede 格式先例**（五要素：日期+阶段 / 变更内容 / 理由 / 适用边界 / 回滚；原行不删）。
- `kb/patterns.md #双主题收官端到端验收范式（隔离脚本 + 本仓复核二分）`（`:4003`）→ T4 验收法（隔离实测 + 本仓复核；报告落 tmp）。
- `kb/patterns.md #README 与实现同步的检查清单（测试数/命令表/架构图/部署口径/旧版本号零残留）` → README×3 五面核对；三载体差异按**实测**（版本横幅仅 `README.md:11`）。
- `kb/patterns.md #部署型资产变更的多载体同步面清单`（`:3077`）→ 新命令面 / 修复后文案的同步面 = 源 → 双注入（双生成物）→ 文档 / skill / manual 全载体。
- `kb/patterns.md #全量审查的发现分类与流转裁定` + `#REV/缺陷状态收口的分层口径：清账层 / 历史层 / 无法判定 + 脚本实时重跑` → §七 承接表三分口径（本阶段处置 / 显式转后续 / 台账保留·销账）。
- `kb/patterns.md #陈旧计数「全枚举」纪律`（`:3983`）+ `#同类缺陷一次全量扫描` → **E-89-6 订正**（cli-usage `:65`「9 个 agents / 18 个共享源」→ 实测值）+ 计数面双路扫描 + 逐处判类（零未判类）。
- `kb/patterns.md #未来功能/未落地能力写入 skill 与文档须标注「提供版本」`（`:3483`）→ 快照件 / 新节「v1.2.1 起提供」标注纪律。
- `kb/troubleshooting.md #改 templates-data 源须同批重生成的「双生成物」`（`:1151`）+ `#build「双生成物」禁手改的段二分`（`:1236`）→ BUG-007 / 文档模板改动同批 `npm run build` + `--porcelain` 断言。
- `kb/troubleshooting.md #断言串与落文逐字核对纪律（markdown 粗体断串致 0 命中）`（`:1138`）+ `#多源文案同步陷阱`（`:591`）→ 修复文案与断言**同批原子更新**；双份同句全仓 `rg` 兜底。
- `kb/troubleshooting.md #默认开启写真实用户目录的副作用防护（VITEST 继承 + OPENFEEL_LOG=0）` + `#子进程测试未设 cwd 致真实仓库污染` → T4 隔离实测环境纪律。
- `kb/architecture.md #需求级模式属性架构：需求携带模式 + 单点解析链第二条 + 载体制约束（general 仅需求级合法）`（`:977`）→ **BUG-002 的架构上下文**（含「已知缺口」标注——本阶段修复后归档轮 supersede 补记）。
- `kb/architecture.md #审查档位架构`（stage-92 沉淀）→ **BUG-011 的架构上下文**（裁剪谱 / 唯一取表点 / 边收缩回退——修复须沿同构延伸，禁第二份裁剪实现）。
- `kb/architecture.md #部署非破坏性语义架构（用户主权键）`（stage-94 沉淀）→ 文档吸收点（README / CHANGELOG / cli-usage 的「模型默认值统一 + 部署非破坏性」口径）。
- `kb/patterns.md #模型默认值统一范式 + 反转登记`（stage-94 沉淀）→ CHANGELOG / cli-usage 对 94 语义的准确表述（`deepseek/deepseek-flash` 为回退终值；「模板硬编码异族」已废止）。
- `kb/architecture.md #双模式转移表选择：getValidTargets 单一取表点 + stage→mode→表 三元解析` → BUG-011 修复须保持「单一取表点」与「可达 ≠ 合法」口径。
- **无**「收官轮缺陷清零（白名单修复 + supersede 差额对照 + 隔离实跑）」既有条目 → **归档轮补沉** patterns。

> 执行任务前，若知识库中有相关条目，务必参考。重复踩过的坑不可再犯。

---

## 一、实测清单（基线 HEAD `e72539f`；行号 / 键值以本基线为准）

### 表 A：缺陷清零面（三 BUG + 承接 REV）

| # | 事实（实测） | 位置 | 结论 |
|:-:|------|------|------|
| A1 | **BUG-002 复现链**（隔离工程，stage-90 测试验收提交）：`req add --workflow-mode general` → `advance --to in_progress`（exit 0）→ `advance --to done` **exit 1**（`set --status done` 同源拒绝）；对照 = 同需求升 `fast` + 关联 `phase=done` 阶段后 exit 0。**唯一差异 = 是否有关联阶段** | `.openfeel/bugs/req.md` 条目 BUG-002（medium / open）；私域详报 `.openfeel/users/Liuary/bugs/req/` | 死锁双因：① 载体制约束 `general ⟹ 零关联`（双向门）；② done 门 `allLinkedStagesDone` 要求 `linked.length > 0`（零关联恒 false） |
| A2 | **BUG-002 双根因源码位**：① done 门 = `applyStatusChange` 单点：`if (to === 'done' && !allLinkedStagesDone(data, req.id)) { return false; }`（裁定 4）；② `allLinkedStagesDone` = `linked.length > 0 && linked.every((s) => s.phase === 'done')`；③ 载体制门双向：`updateRequirement` 的 general 门（`hasLinked → general_mode_conflict`）+ `linkRequirement` 的 general 门 | `src/core/req/requirement-ops.ts:238`（done 门）/ `:84`（单源谓词）/ `:289`（set 门）/ `:346`（link 门）；`PATCH_WHITELIST:244` | 修复面收敛于 `applyStatusChange` 的 done 门（唯一判定点）+ 文案 / help / 文档同步 |
| A3 | **BUG-002 附带缺陷（同因）**：拒绝文案 `req.err.invalidStatusTmpl` = `{id} 目标状态 {to} 被拒（当前 {current}；合法目标：{targets}）`——`targets` 取 `getAllowedNextStatuses`（**静态**合法集，恒含 done），未反映 done 门的**动态前置**（零关联拒绝）→ 「把 done 列为合法目标却又拒绝它」 | `src/core/i18n-data/zh-CN.ts:1132` / `en.ts:1088`；命令层消费 `src/commands/req.ts:398`（set）/ `:525`（advance）；help 描述 `:503`（「done 须全部关联阶段 done」） | 修复须同步：**文案反映动态原因** + help / skill / manual 同步（候选形态见 §三 T1.1） |
| A4 | **BUG-002 的 C2 断言面（supersede 对象，逐处实测）**：① 段 C（stage-83）`aggregate.ts` NEEDLES **6 串含 `workflow_mode`**（零命中锁）；② 段 C 动态断言（stage-90）内含注释「模式为纯调度属性：**不入聚合 / 不入 done 门 / 不入对账**」；③ T5.6（stage-90）三源 NEEDLES 6 串（含 `resolveStageWorkflowMode`）+ 受控串判类 + 正控（`workflow_mode?: WorkflowMode` / `WORKFLOW_MODES` / `general_mode_conflict`）；④ T90 段载体制门断言（17/18/19）。**零用例覆盖「general 需求 done」场景**（BUG-002 根因之一） | `test/core/req.test.ts:913-955`（段 C，`:949` 注释）/ `:617-667`（T5.6）/ `:1231-1280`（T90） | supersede 口径 = 「模式不参与 done 门」→「模式**经载体制对偶完成路径**参与 done 门；**聚合面（`aggregate.ts`）仍零 `workflow_mode`**」；**聚合 6 串零命中与动态断言（改模式 → 聚合输出不变）实质保持**，注释 / 新用例同批改写，**禁删除**（差额对照留痕） |
| A5 | **BUG-002 同步载体**：manual 已知缺口标注两处；`openfeel-req` skill `:77`「`workflow_mode` 不影响需求状态机与命令行为」；kb `#需求级模式属性架构`（`:977` 起）「已知缺口」 | `.openfeel/manual/core/req.md:149` / `.openfeel/manual/index.md:19`；`skills/openfeel-req/SKILL.md:77`；`kb/architecture.md` | 本阶段改 manual ×2 + skill 表述；kb supersede 材料**本阶段产出、归档轮写入**（承 stage-90/94 先例） |
| A6 | **BUG-011 复现链**（隔离工程，stage-92 测试验收）：阶段停在 `plan_review` → `flow advance --to plan_passed --review-tier skip` → 「无法从 plan_review 到达 plan_passed；当前可达目标：(无)」**exit 1 零写盘**；`--force` 可绕（连带跳过非法 phase / 跳跃校验——「以降低保护换取通行」，不应是必需代价） | `.openfeel/bugs/cli.md` 条目 BUG-011（medium / open）；私域详报 `.openfeel/users/Liuary/bugs/cli/` | 根因 = `pruneTransitionsByTier` 步骤②「源条件相位全部被裁剪 → **整体删除该 key**」——阶段**恰停于被裁剪相位**（`plan_review`@skip / `scheme_review`@lean）时 `getValidTargets(当前相位,…)` 恒空集，BFS 无出边 |
| A7 | **BUG-011 修复位**：裁剪函数步骤② 位于 `pruneTransitionsByTier`（唯一消费点 `resolveTransitionsForMode(mode, tier)`）；裁剪谱 `TIER_PRUNED_PHASES`（lean = `[scheme_review]` / skip = `[plan_review, scheme_review]`）；步骤③「目标侧过滤」/ ④「边收缩回退」已在位 | `src/core/flow-manager.ts:2136-2160`（② 于 `:2145-2148`）；`src/core/pipeline-schema.ts:78` | 修复方向（BUG 建议原案）= **裁剪只作用于「入边 / 目标侧」**——全裁 key **不删**、改与 ③/④ 同口径过滤 targets（`plan_review: ['plan_passed','plan_pending']` 均为非裁剪项 → 原样保留）→ 处于被裁剪关的阶段可正常向该档位下游推进 |
| A8 | **BUG-011 覆盖缺口**：op-001 边界表 B1~B10 未登记本场景；core 单测 T92.1~T92.6 与命令层 T92.1~T92.7 **仅覆盖「目标相位被裁剪 → 不可达」**，零用例覆盖「**当前相位被裁剪 → 出边归零**」 | `test/core/flow-manager.test.ts` / `test/commands/flow.test.ts`（tier 相关 describe）；stage-92 定义表 `.openfeel/tmp/stage-92-tier-definition.md` | 修复须**补该场景覆盖**：core（两档 × 两相位 `getValidTargets` / `findPhasePath` 断言）+ 命令层实跑（`--review-tier skip` 从 `plan_review` → `plan_passed` exit 0） |
| A9 | **BUG-007 悬空指针**：en 侧归档官「一行指针」指向 `§Archive Mechanical Checklist`——全仓**除 en 归档官模板（源 2 处 + 生成物 3 处）外 0 命中**（目标 skill 实际节标题 `### 7. 归档机械核对清单（命令化 / 幂等 / 无推理）`，仅中文）；zh 侧指针 `§归档机械核对清单` 可解析 → **两语言不对称** | 源：`templates-data/claude/agents/en/openfeel-archiver.md:15` / `templates-data/opencode/agents/en/openfeel-archiver.md:20`；生成物：`template-loader.ts:204/:2452/:6530`；目标 `skills/openfeel-logging/SKILL.md:62` | 修复形态（方案期定稿）：① en 侧改用中文节名（与 zh 一致；双语混排在 en 模板已属既有惯例）／② 节标题双语化。**现有「skill 索引引用完整性」断言只校验文件存在性、不校验 `§<节名>` 字面命中** → 防再犯增强见 T1.3 |
| A10 | **REV-92-006**（skip 档对完全不可达目标报「路径深度超过上限（8）」而非「无路径」——`findPhasePath` BFS 既有行为，环路图上深度上限先于队列穷尽触发；exit 1 + 零写盘均正确，属**错误语义精度**问题） | `.openfeel/users/Liuary/code_review/REV-92.md`（低 / pending，处置建议「后续阶段（或 93 收口轮）评估」） | 本阶段**评估**（Q2）：修复（BFS 穷尽后再报 no-path）或文案补充提示或登记保留——若做，与 BUG-011 同面（同文件）同批 |

### 表 B：版本收口面（1.2.0 → 1.2.1，A/B/C/D/E；归 T3）

| 类 | 事实（实测，基线 `e72539f`） | 位置 | 处置 |
|:-:|------|------|------|
| **A1** | `package.json` `"version": "1.2.0"`；`--version` 直读（无 VERSION 常量） | `package.json:3` | 改 `1.2.1` |
| **A2** | `package-lock.json` root 两处 `"version": "1.2.0"`（`:3` / `:9`；另 `:3194` 为**依赖自身版本**，D 类禁改） | `package-lock.json:3/:9` | 手改两处（**禁 `npm install` 重生成**） |
| **A3** | `.openfeel/config.yaml` `meta.version: 1.2.0` | `.openfeel/config.yaml:7` | **单行 edit**（禁整文件重写） |
| **A4** | `CONFIG_TEMPLATE_{ZH,EN}` 版本行 `version: 1.2.0` 各一处 | `src/core/config.ts:436` / `:493` | 改 `1.2.1` |
| **A5** | agents-md 版本行「OpenFeel 框架已发布正式版 v1.0.x（当前 v1.2.0）」×2 语言（en 同款英文句） | `templates-data/agents-md/zh-CN.md:135` / `en.md:135` | 改 `1.2.1` |
| **A6** | claude/constraint 同款版本行 ×2 语言 | `templates-data/claude/constraint/zh-CN.md:138` / `en.md:138` | 改 `1.2.1` |
| **B** | **双生成物**：`src/core/template-loader.ts` + `src/core/update.ts`（`rg -c "1\.2\.0"` 实测 = **11** / **7** 处）；本阶段 templates-data 有改动（BUG-007 / cli-usage / agents-md / constraint）→ 同批 `npm run build` | `build.js` 注入段 | **禁手改**；build ×2 幂等 + `git status --porcelain src/` 干净断言 |
| **C1** | `CHANGELOG.md` 末节 = `## [1.2.0] - 2026-10-13`（`:5`），**无 [1.2.1]** | `CHANGELOG.md:5` | 追加 `## [1.2.1]`（插其前；显著登记见 §三 T3） |
| **C2** | `README.md` 横幅「最新版本 v1.2.0」（`:11`）+「## v1.2.0 新增能力」节（`:51` 起）；**无 v1.2.1 节** | `README.md:11/:51` | 横幅 → v1.2.1 + 新增「v1.2.1 新增能力」节 |
| **C3** | `README.zh-CN.md` / `README.en.md`：v1.2.0 能力节（`:83`）+ 测试数行「1557 用例 / 70 个测试文件」（`:211`，**显著陈旧**——现基线 71 / 1707） | `README.{zh-CN,en}.md:83/:211` | 新增 v1.2.1 节 + 测试数行 → 本阶段门禁实测值 |
| **C4** | `docs/GETTING_STARTED.md:3` / `docs/commands.md:3` 均「v1.2.0 快照」；`commands.md` **未含** `req split` / `req --workflow-mode` / `flow advance --review-tier` / 三模式 general / explorer / 模型默认值（实测 rg 零命中） | `docs/*` | 快照 → v1.2.1 + 新命令面补漏（含 stage-94 语义） |
| **C5** | `cli-usage/SKILL.md`（**权威源 / 快照件**）：`:15`「v1.2.0 快照」；`:3` description 能力摘要止于 v1.2.0；`:38` 表行；`:50` 起「v1.2.0 新增能力（stage-78~84）」节；`:53` 仍记「10 子命令」（现 11：+`split`）；**`:65` 陈旧计数「9 个 agents / 18 个共享源」（E-89-6，现 10 / 22）** | `templates-data/skills/openfeel-cli-usage/SKILL.md` | 快照 → v1.2.1 + description 追加 v1.2.1 摘要 + 新增「v1.2.1 新增能力」节（含 94 语义）+ **E-89-6 计数订正**（快照声明件随收官轮刷新——REV-89-006 交付口径） |
| **D** | `src/` 非生成物 `1.2.0` 残留全景（实测）：A 类 6 处（上表）+ `flow-archive/archive-health.ts:10`（注释引用历史计划路径，**判类 = 历史引用 → 白名单**）+ `cli-usage/SKILL.md:3/:15/:38/:50/:53`（C 类，随快照刷新）+ `context-hygiene/SKILL.md:60`（**历史核验记录「三要素」（Claude 2.1.300 / opencode 1.18.35 / openfeel 1.2.0）→ 白名单**）+ `openfeel-req/SKILL.md:11`（「v1.2.0 起提供」**历史标记 → 保留**）；`test/**` 同名命中（`flow-archive.test.ts` / `templates.test.ts` 等）→ **禁改**（D 类） | `src/**` / `test/**` 实测 `rg -n "1\.2\.0"` | 执行期**内容特征扫描兜底**（`rg "当前 v1\.2\.0"` 全仓逐命中判类，零未判类）+ 白名单 file:line **显式枚举**；**禁广谱 sed** |
| **E** | 无载体：`docs/design-philosophy.md` 等非版本型文档（仅当能力描述失实时按需改，非版本收口项） | — | 按需判类 |

### 表 C：文档载体面（现状核对）

| # | 事实（实测） | 位置 | 结论 |
|:-:|------|------|------|
| C1 | `manual/index.md` 模块树**已含**：`core/req.md`（v1.2.1-stage-87/90 补记）、`core/runtime-log.md`（stage-86 补）、`core/session.md`（stage-86 新建）、`core/metrics.md`（stage-86 接线）、`cli/req.md`（stage-87/90 补）、agents/feel.md（stage-88/89/90/91/92 补记）、skills 18→22 说明、`cli-usage` 快照行（v1.2.0） | `.openfeel/manual/index.md` | 核对/最小补正：`cli-usage` 快照行 → v1.2.1；`core/req.md` 行「已知缺口 BUG-002」→ 修复记录 |
| C2 | `manual/core/req.md:149`「**已知缺口（`req/BUG-002`，medium / open，非阻塞）**」节 + `:189` 变更历史 | 同左 | 修复后改写为「stage-93 缺陷清零」记录（历史表述以追加式，不重写旧行） |
| C3 | `manual/core/flow-manager.md` / `cli/commands.md`：stage-92 已补审查档位节 / `--review-tier` / `reviewTier` 键 | 同左 | 核对/最小补正（BUG-011 修复行为若改变展示差异 → 同批补记） |
| C4 | `docs/commands.md` / `GETTING_STARTED.md` 未含 v1.2.1 新命令面（表 B C4 实测） | 同左 | T2 补漏（`req split` / `--workflow-mode` / `--review-tier` / 三模式 / explorer / 模型默认值+用户主权键概述） |
| C5 | `openfeel-req/SKILL.md:77`「`workflow_mode` 不影响需求状态机与命令行为」——修复 BUG-002 后该句需精确化（不再全称） | 同左 | 随 T1 修复同批改（最小改写，禁全文重写） |

### 表 D：承接台账面（判据源实测）

| # | 条目 | 状态 / 优先级 | 去向 |
|:-:|------|:--:|------|
| D1 | **`req/BUG-002`**（general 需求恒无法 done） | open（medium） | **本阶段缺陷清零**（T1.1；含 C2 supersede） |
| D2 | **`cli/BUG-011`**（档位裁剪致当前相位无跳转目标） | open（medium） | **本阶段缺陷清零**（T1.2） |
| D3 | **`templates/BUG-007`**（en 归档官指针悬空） | open（low） | **本阶段缺陷清零**（T1.3） |
| D4 | **REV-92-006**（findPhasePath 报「路径深度超上限」而非「无路径」） | pending（low） | **本阶段评估**（T1.4；Q2 定稿）：修复 / 文案提示 / 登记保留三选一 |
| D5 | **E-89-6**（cli-usage `:65`「18 个共享源」+「9 个 agents」陈旧计数；REV-89-006 已 closed 且实测交付口径 = 快照件随收官轮刷新） | 在案（转 93） | **本阶段处置**（T2.5） |
| D6 | **REV-90-011 / REV-89-008 / REV-91-010**（status.md 未随 op 推进；`openfeel stage set` 权限层拒绝——同源家族三例） | pending（low / medium） | **转主会话**（`openfeel stage` / `flow` CLI 补齐；本阶段零动作；本阶段同类风险预告见 §五 验收要点 10） |
| D7 | **REV-94-005**（stage-94 `status.md:21` 任务文案旧字面值）/ **REV-94-006**（stage-94 plan.md 未入提交——**已随 `e72539f` 入管，本会话实测 `git ls-files` 在位**） | pending（low ×2） | **转主会话**（CLI 同步 / 已闭合登记）；本阶段零动作 |
| D8 | **REV-94-007**（既有部署实例停留旧模板默认值——「键存在即保留」设计语义的可见性提示） | pending（low） | **归档轮已补 kb 边界说明**（stage-94 归档信息）；本阶段引用不重述 |
| D9 | **REV-86-009 / REV-86-010**（T4.4 用例未命中 `computeResumed` 分支 / `session.json` 守卫缺位） | pending（low ×2） | **台账保留·销账维持**（承 92 口径；非本阶段面） |
| D10 | **REV-92-001~005 / REV-91-011 / REV-94-001~004**（闭合证据在位） | 登记转主会话 | **零动作**（登记） |

### 表 E：验收基线面（七主题成果材料指针，供 T4 复用）

| # | 主题 | 成果材料（既有，可直接引用 / 需复跑项标注） |
|:-:|------|------|
| E1 | 可观测性（86） | `recordRun` 接线（`commands/flow.ts` `PHASE_AGENT_MAP`）+ 日志 3 字段 + op 时间戳 + 跨会话标注；**需复跑**：metrics 非空 / done 行 3 字段 / 零注入 |
| E2 | 需求接取与拆分（87） | `req split`（11 子命令）；**需复跑**：拆分 → 并行 claim 互不阻塞 / 版本解绑 |
| E3 | 调度机制（88） | 实测记录（opencode 嵌套 task / Claude Handoff）；**引用既有材料**（阶段报告） |
| E4 | 通用工作者（89） | explorer 双 harness 双语言 + 只读 4 工具阴性断言；**引用 + 可复跑路由验证** |
| E5 | 三模式（90） | 值域 3 值 / 需求级解析单点 / 升级不降级；**需复跑**：general → fast 升级链（叠加 BUG-002 修复后的 general 全生命周期） |
| E6 | 提示词瘦身（91） | 索引壳 + 三类静态断言（尺寸 / 引用完整性 / 跨 harness 对称）；**引用 + 门禁复核** |
| E7 | 提速（92） | 审查档位三档 + 并行编排契约 + 归档轻量化；**需复跑**：档位按档生效（含 BUG-011 场景） |
| E8 | 模型/部署（94） | 模型默认值统一（`deepseek/deepseek-flash` 回退终值）+ 用户主权键 `model`；**引用**（三扫描零未判类材料） |

### 表 F：门禁与状态（阶段起止对照）

| 项 | 起点（`e72539f` 实测 / 登记） | 阶段末目标 |
|----|------|------|
| `npm test` | 71 文件 / **1707 用例** 0 skipped / 0 failed | 新基线（> 1707；三 BUG 新增用例逐项登记） |
| `npx tsc --noEmit` | 0 | 0 |
| `lint i18n` | **944** | 新基线（≥ 944 + 新文案键，逐键列名） |
| `lint kb` | 0 过期（612 引用） | 0 |
| `npm run build` | ×2 幂等 | ×2 幂等（`git status --porcelain src/` ⊆ produces） |
| `--version` | **1.2.0** | **1.2.1** |
| A 类残留 | 10 处（6 载体 / 8 文件） | **0**（白名单化） |
| flow.json | `revision 1175` / 17 stages（93 为唯一未 done） | 零直写（推进由 Feel 经 CLI） |

---

## 二、目标语义与不变量

| 维度 | 内容 |
|------|------|
| 缺陷清零 | 三 BUG 全部**修复 + 回归证据 + 验收**（BUG-002 / BUG-011 / BUG-007 → closed）；每项修复的**有意语义变更**显式登记（supersede / 差额对照），**禁静默**；修复设计要点见 §三 T1（schemer 细化为 op） |
| BUG-002 完成语义 | `general` 需求（**恒零关联阶段**——载体制约束）完成路径 = **载体制对偶完成路径**（显式完成，不经阶段聚合门）；非 general 需求 done 判定**单源不变**（`allLinkedStagesDone`）；聚合面（`aggregate.ts`）**仍零 `workflow_mode`** |
| 版本事实源 | `package.json` `version` = **1.2.1**（`--version` 直读）；`.openfeel/config.yaml` `meta.version` = 1.2.1；全链路 A/B/C/D/E 按 §六清单（本计划表 B 已实测到 file:line） |
| 文档覆盖面 | v1.2.1 全语义：需求接取/拆分（split/版本解绑/并行接取）+ 通用工作者调度（双口径）+ explorer + 三模式（general 仅需求级）+ 提示词瘦身（索引壳）+ 可观测性（3 字段 + op 埋点）+ 审查档位（三档）+ 模型默认值统一 / 部署非破坏性（94 吸收）；**每条以 `--help` 实测为准**（防文档-实现发散） |
| 端到端 | 大计划 §十一 ×10 的可执行化（隔离脚本 + 本仓复核二分）；BUG-002 / 011 修复场景**进验收链** |
| 承接 | 上游 BUG / REV 逐条去向可核（三分零灭失）；E-89-6 本阶段清账 |

**不变量**：

1. **收口期冻结**：除三 BUG 白名单修复 + 文档/版本载体外**零功能改动**；收口 op（版本号放入后）起**零代码改动**。
2. **零回归**：既有命令输出 / `--json` 契约（含 `flow phases` 7 键）/ phase 枚举 15 项 / `advanceAccepted` / `flow advance` 退出码语义**逐字不变**（除有意变更且登记）。
3. **done 判定单源**：`allLinkedStagesDone` 仍为**有阶段需求** done 判定唯一原语；BUG-002 修复新增的 general 路径为**载体制判据**（非第二份聚合表达式——`.every(` 在聚合面仍零命中），且不得引入第二份 `.every(` 复写。
4. **聚合面零模式**：`aggregate.ts` 对 `workflow_mode` **零命中保持**（段 C NEEDLES 6 串零命中锁 + 动态断言「改模式 → 聚合不变」保持）；模式仅经**完成门**（`applyStatusChange` 单点）参与，不参与聚合投影 / 对账。
5. **supersede 显式化**：C2 口径（「模式不参与 done 门」）改写为「模式经载体制对偶完成路径参与 done 门；聚合面零命中」——**差额对照逐条留痕**（旧断言 → 新断言说明），**禁删除**；kb / manual 同步以**追加式**（原行保留 + supersede 块五要素）。
6. **档位语义不变**：BUG-011 修复只改「被裁剪相位的**出边可达性**」（阶段已处于被裁剪关时可向下游推进），**不改**「进入被裁剪关被裁」语义（步骤③目标侧过滤保持）；「可达 ≠ 合法」/ 单点取表 / `full` 零裁剪 逐字不变。
7. **文案与断言同批**（kb #断言串与落文逐字核对）：i18n 双表成对（zh / en）+ 接入消费点（防死键）+ 关键句全仓 `rg` 兜底。
8. **B 类双生成物**：`templates-data/**` 改动 → 同批 `npm run build`；`git status --porcelain src/` ⊆ produces；build ×2 幂等。
9. **白名单化收口**：「A 类残留 = 0」+ D 类白名单 file:line 显式枚举（内容特征扫描兜底，零未判类）；**禁广谱 sed**。
10. **流程与提交卫生**：精确 `git add`（禁 `-A`）；不直写 `flow.json`；不推进 phase；不 `npm publish` / 不 `git push`。

---

## 三、变更点清单（编号 T）

### T1 — 缺陷清零（收口前必修；三 BUG 白名单）

**T1.1 `req/BUG-002`：general 需求完成路径 + C2 supersede（核心语义项）**

- **修复方向（方案期以本章要点细化；形态 Q1 定稿）**：为 `general` 需求开辟**载体制对偶完成路径**——done 门判定由「仅 `allLinkedStagesDone`」扩展为「**两路**」：
  - 路 1（不变）：非 general 需求恒走 `allLinkedStagesDone`（有阶段 ∧ 全 done）；
  - 路 2（新增）：`workflow_mode === 'general'` 的需求走**载体制完成路径**（恒零关联——由双向载体制门保证；显式完成 `advance/set --to done` 直接放行）。
  - **实现形态候选**（schemer 裁定）：**(a) 谓词单点**——新增 `[建议]` 显式谓词（如 `canCompleteRequirement(data, req)`，`applyStatusChange` 单点消费；general ⟹ 载体制零关联防御断言），`allLinkedStagesDone` 原样保留（聚合委托关系不变）；**(b) 最小例外**——`applyStatusChange` 一行改动（`to === 'done'` 判定加 `req.workflow_mode !== 'general'` 前置）。**推荐 (a)**（显式单点 + 可测 + 防御注释），代价 = 新增导出符号（进断言面）。
- **C2 supersede（强制；禁静默改写）**：旧口径「模式**不参与**聚合 / done 门 / 对账」→ 新口径「模式**经载体制对偶完成路径参与 done 门**；聚合投影 / 对账仍不参与」。**差额对照逐条留痕**（旧断言 → 新断言）：
  - ① `test/core/req.test.ts:949` 注释文字改写（断言本体「改模式 → 聚合输出不变」**保持**——聚合仍零命中）；
  - ② 段 C / T5.6 的 NEEDLES 与受控串清单**逐条判类**（保留 / 改写 / 新增三类，禁删除；新符号名若入断言 → 同批）；
  - ③ **新增正向断言**：general 需求 `advance --to done` 可达（引擎层）+ 非 general 零回归（有阶段未全 done → 拒）+ 聚合面 `workflow_mode` 零命中复锁（防修复引入聚合耦合）；
  - ④ supersede 材料按 kb #supersede 范式五要素产出（落 `.openfeel/tmp/stage-93-supersede-materials.md`；**kb 写入归归档轮**）。
- **文案修复（附带缺陷，同因）**：拒绝文案须反映 done 门**动态前置**。候选（Q1 定稿）：**(a) 专用文案**（当 `to === 'done'` 且门不满足 → 新键 `req.err.doneGate*` / 或错误码细化）；**(b) 通用文案澄清**（`req.err.invalidStatusTmpl` 追加静态前置说明「done 须全部关联阶段 done」+ 通用表述去矛盾）。**推荐 (b) 最小化**（不动错误码契约——错误码枚举为 `--json` 契约面）；若选 (a) 须评估 `RequirementErrorCode` 契约影响（登记）。
- **同步面**：`commands/req.ts:503` help 描述（「done 须全部关联阶段 done」补 general 例外）+ `openfeel-req/SKILL.md:77`（表述精确化）+ `manual/{index.md:19,core/req.md:149}`（已知缺口 → 修复记录，追加式）+ i18n 双表（zh/en 同批 + `lint i18n` 新基线逐键列名）。
- **验收**：BUG 复现序列实跑（隔离工程）——`add general → in_progress → done` **exit 0**；`req board` done 桶收纳；`req set --workflow-mode general`（有链接）/ `req link`（general 目标）**双向门零回归**；非 general done 门零回归。
- **边界**：`aggregate.ts` 零改动（零 `workflow_mode` 保持）；`AUTO_DONE_PRECONDITION` / `syncRequirementStatus` / `requirementHealthItems` 零改动（general done 需求聚合恒 null → 回写与对账均零动作——**已在 A4 判类核实**）；`allLinkedStagesDone` 语义零改动。

**T1.2 `cli/BUG-011`：档位裁剪的「当前相位」出边修复 + 场景覆盖**

- **修复方向（BUG 建议原案）**：`pruneTransitionsByTier` **步骤② 不删 key**——全裁 key 的 targets 改与步骤 ③/④ **同口径过滤**（本例 `plan_review: ['plan_passed','plan_pending']` 均非裁剪项 → 原样保留）；「**进入**被裁剪关」仍被步骤③（目标侧过滤）裁掉——语义差 = 只修「已处于被裁剪关的出边」。
- **边界复核（方案期逐条论证）**：① `full` 档零裁剪逐字不变；② `lean`/`skip` 的「目标侧不可达」断言**保持**（进入仍被裁）；③ 边收缩回退（④）与新语义无冲突（步骤②不再产生「删 key」输入）；④ `transitionsDiff` / `flow phases` 展示口径若变化 → 同批登记（预期无变化：展示为基表 diff，不涉档位裁剪表）；⑤ 关联语义：「档位裁剪谱」单源（`TIER_PRUNED_PHASES`）与「唯一取表点」不动。
- **覆盖补齐**：core 单测——两档（`lean`@`scheme_review` / `skip`@`plan_review` + `skip`@`scheme_review`）的 `getValidTargets(当前被裁剪相位)` **非空** + `findPhasePath` 可达断言；命令层实跑——`flow advance --to plan_passed --review-tier skip`（自 `plan_review`）**exit 0 零 `--force`**；阴性——两档下**进入**被裁剪关仍不可达（保留原断言）。
- **验收**：BUG 复现链实跑转正；既有 T92.x tier 断言零回归；`--review-tier full` 与缺省档位零回归。

**T1.3 `templates/BUG-007`：en 侧指针悬空修复 + 引用完整性防再犯**

- **修复形态（Q3 定稿；推荐 ①）**：① en 侧 ↔ zh 侧同口径改用**中文节名** `§归档机械核对清单`（与 zh 指针一致；双语混排在 en 模板已属既有惯例，如 `openfeel-archiver (归档官)`）／② `openfeel-logging` 节标题双语化（`### 7. 归档机械核对清单 / Archive Mechanical Checklist`）。**推荐 ①**（改动面最小、与 zh 对称性最高、不动共享 skill 节标题）。
- **改动点**：`templates-data/{claude/agents/en,opencode/agents/en}/openfeel-archiver.md` 各 1 处（跨 harness × 语言对称四律：同语言双 harness 字节等值保持；插入外零改动）+ 同批 `npm run build`（生成物 3 处副本随重生成）+ 尺寸断言复核（archiver ×4 ≤ 上限；本改动为短化，无上限风险）。
- **防再犯增强（范围 Q3 定稿）**：`§<节名>` 指针的**字面命中**校验纳入引用完整性断言（现有断言仅校验 skill 文件存在性）。执行法：**先全量扫描**（全模板 `§<节名>` 指针 → 目标文件字面命中）——若另有悬空 → 逐处判类（本阶段修 / 登记转后续）；若仅本条 → 修复 + 断言增强（`test/core/templates.test.ts`）。**增强须零误报**（扫描口径：`§` + 节名 token 在目标文件 `includes`）。
- **验收**：全仓 `rg "Archive Mechanical Checklist"` **零命中**（源 + 生成物）；zh 侧指针逐字不变；`npm run build` ×2 幂等。

**T1.4 `REV-92-006` 评估（Q2 定稿；与 T1.2 同面）**

- **候选**：**(a)** `findPhasePath` BFS **队列穷尽后再报 no-path**（语义正确化——需论证环路图下的判定条件：仅当队列耗尽且无深度受限节点时）；**(b)** `depth-exceeded` 文案补充「目标可能不可达」提示（最小）；**(c)** 登记保留（转 v1.3.0）。**推荐 (b) 或 (a)**——与 BUG-011 同文件同批（一次触碰 `flow-manager.ts` + 同批测试）；**若选 (c) 须显式登记理由**（禁静默）。
- **约束**：错误语义精度改进**不得改变 exit code / 写盘行为**（exit 1 + 零写盘逐字保持）；既有 `depth-exceeded` 判定路径的其它消费点（如 `checkpoint restore` 路径查询若同源）同批复核。

### T2 — 文档多载体（README×3 / GETTING_STARTED / commands / manual / cli-usage 快照）

**T2.1 README×3（按三载体差异实测）**
- `README.md`：`:11` 横幅「最新版本 v1.2.0」→ **v1.2.1**（能力摘要一句话：需求接取/拆分 + 三模式 + 通用工作者 + 审查档位 + 模型部署语义）；`:51` 起「v1.2.0 新增能力」节**保留**（历史节），其后新增「**v1.2.1 新增能力**」节（七主题 + 94 语义，按实测命令面书写）。
- `README.zh-CN.md` / `README.en.md`：`:83` 起新增 v1.2.1 节（与主 README 同构、逐节对照）；`:211` 测试数行「1557 用例 / 70 个测试文件」→ **本阶段门禁实测值**（起点 71 / 1707）。
- 纪律：zh/en 逐节同构；「（v1.1.7 起）」「(since v1.2.0)」类历史标记**保留**（D 类）；命令表按 `--help` 实测。

**T2.2 `docs/GETTING_STARTED.md` / `docs/commands.md`**
- 快照行（`:3`）→ **v1.2.1**；补漏（实测零命中项）：`req split`（重复 `--into`、拆分即发布）/ `req add|set --workflow-mode`（三值 + general 仅需求级）/ `flow advance --review-tier`（三档 + 本阶段修复语义）/ `flow phases --json` 7 键（`reviewTier`）/ `openfeel-explorer` / 模型默认值统一 + 用户主权键（部署非破坏性概述，详指 skill）。
- `GETTING_STARTED`：新增「v1.2.1 能力速览」小节（需求流转 / 三模式选择 / 审查档位最小示例）+ 升级指引（存量 flow.json 零迁移；部署非破坏性——「无则创建、有则不覆盖（`model` 键）」）。

**T2.3 manual（核对/最小补正；命名核对禁新建重复页）**
- `index.md:19`：req 行「已知缺口 → BUG-002」→ 修复记录（追加式）；`cli-usage` 快照行 → v1.2.1；模块树与实况核对（explorer / 可观测性 / 三模式条目已在位，实测）。
- `core/req.md:149`：已知缺口节 → 「stage-93 缺陷清零」记录（保留旧行 + 追加）；变更历史表追加 v1.2.1-stage-93 行。
- `core/flow-manager.md` / `cli/commands.md`：BUG-011 修复行为若改变档位可达语义 → 同批最小补记（审查档位节）。

**T2.4 `cli-usage` skill 快照 → v1.2.1（权威源；快照声明件）**
- `:3` description 追加「v1.2.1 新增能力（…）」摘要（能力名级别，含 94）；`:15` 快照行 → v1.2.1；`:38` 表行核对；`:50` 起**新增「v1.2.1 新增能力（stage-78~93 + 94）」节**——内容按实测命令面（split / --workflow-mode / 三值模式 / --review-tier / explorer / 可观测性字段 / 模型默认值 + 部署非破坏性）；`openfeel req` 子命令计数 10 → **11**（`:53`）。
- **E-89-6 订正**：`:65`「`agents/`（**9 个**）」「`skills/`（**18 个**共享源）」→ 实测 **10 / 22**；同批全仓 `rg` 兜底（「9 个」「18 个」等同族陈旧计数逐处判类，零未判类）。
- 纪律：能力名叙述 + 「**v1.2.1 起提供**」标注（kb #未来功能标注纪律）；build 重生成副本。

**T2.5 `openfeel-req` skill 精确化（随 T1.1）**：`:77`「`workflow_mode` 不影响需求状态机与命令行为」→ 精确表述（模式经载体制完成路径参与 done 门；其余不影响）。

### T3 — `CHANGELOG [1.2.1]` + 版本 1.2.1 全链路 A/B/C/D/E（**并入最终 op**）

- **CHANGELOG**：追加 `## [1.2.1] - <日期>`（插于 `:5` `## [1.2.0]` 之前）：
  - **Added**：三模式架构（`full / fast / general`；`general` 仅需求级 + 需求级模式属性 + 升级不降级）／需求接取与拆分（`req split` 拆分即发布 + `parent_id` 溯源 + 并行接取 + 版本解绑）／通用工作者直接调度（双口径：opencode 嵌套 task / Claude Handoff 直发；规则放宽）／新 agent `openfeel-explorer`（只读 4 工具；agent 9→10）／可观测性（`recordRun` 接线 + CLI 日志 `duration_ms`/`project`/`session_id` + op 级时间戳 + 跨会话标注）／审查档位（`full/lean/skip`；`--review-tier`）／并行编排契约 + 归档轻量化／模型默认值统一（opencode 侧显式默认收敛 `deepseek/deepseek-flash`）+ 部署非破坏性（用户主权键 `model`：无则创建、有则不覆盖）。
  - **Fixed**：`req/BUG-002`（general 需求完成路径）／`cli/BUG-011`（档位裁剪致当前相位无跳转目标）／`templates/BUG-007`（en 归档官指针悬空）。
  - **Changed**：无默认行为变更（除上述有意变更）；**兼容说明**：旧 `flow.json` 零报错零迁移；`--json` 既有键逐字保留（`flow phases` 6→7 为追加键）。
  - **Documentation**：README×3 / GETTING_STARTED / commands / manual / cli-usage 快照 v1.2.1。
- **A 类逐处（实测 6 载体 / 8 文件 / 10 处；行号见表 B）**：`package.json:3`；`package-lock.json:3/:9`（**禁 `npm install`**）；`.openfeel/config.yaml:7`（**单行 edit**）；`src/core/config.ts:436/:493`；`agents-md/{zh-CN,en}.md:135`；`claude/constraint/{zh-CN,en}.md:138`。**实施前内容特征扫描兜底**（`rg "当前 v1\.2\.0"` 全仓逐命中判类，零未判类）。
- **B 类**：`npm run build` 重生成双生成物（禁手改）；本阶段 templates-data 改动（T1.3 / T2.4 / A5 / A6）**同批**；生成物中 A/C 类副本随 build 更新。
- **D 类禁改白名单（file:line 显式枚举；基线实测）**：`src/core/flow-archive/archive-health.ts:10`（注释历史引用）／`skills/openfeel-context-hygiene/SKILL.md:60`（历史核验记录）／`skills/openfeel-req/SKILL.md:11`（「v1.2.0 起提供」历史标记）／`package-lock.json:3194`（依赖自身版本）／`test/**` 同名命中（注释/fixture）／`docs/phase-*/**`；按需复核是否新增（执行期扫描差额登记）。
- **E 无载体**：按需判类（非版本收口项）。
- **验证**：`node bin/openfeel.js --version` = **1.2.1**；A 类残留 = 0；`src/` 全量扫描剩余命中 ⊆ 白名单；build ×2 幂等。

### T4 — 七主题端到端验收（隔离脚本 + 本仓复核二分）

- **隔离脚本**（`OPENFEEL_LOG=0` + 隔离 fixture/临时 HOME；报告落 `.openfeel/tmp/`）：
  1. 可观测性（86）：实跑后 `metrics.json` 非空 + CLI 日志 done 行含 3 字段 + flow.json op 时间戳 + 跨会话标注可辨 + 旧 flow.json 纯 `load→save` **零注入**（字节级断言）；
  2. 需求拆分与并行接取（87）：`req add → split` 两子需求 → 两 owner 并行 `claim` 互不阻塞 → 子需求各自 link / 推进；无 `target_version` 全生命周期可用；
  3. 调度机制（88）：引用既有实测记录（三要素 + go/no-go + Handoff 链路），**不重跑不可复现项**（如实标注引用来源）；
  4. 探索者（89）：路由「调研/探索」→ `openfeel-explorer`（只读行为阴性核验，能跑则实跑）；
  5. 三模式（90）+ **BUG-002 修复链**：`req add --workflow-mode general → advance in_progress → done`（**exit 0**）→ `req set --workflow-mode fast` 升级链；不自动降级断言；
  6. 提示词面（91）：feel.md 体积复测（≤ 50% 方向值）+ skill 索引引用完整性（含 §锚增强）+ 跨 harness 对称全绿；
  7. 提速（92）+ **BUG-011 修复链**：三档各一轮实跑（含「当前相位被裁剪」场景转正）；并行组合转移复用复测；
  8. 模型/部署（94）：引用既有实测（`deepseek/deepseek-flash` 终值 + 用户主权键保留语义），本仓 `~/.claude` 面**只读复核**；
  9. 零回归面：`req` 11 子命令 `--json` 契约 / `flow archive` / `flow phases`（7 键）/ `advanceAccepted` / phase 15 项逐字；
  10. 版本面：`--version` = 1.2.1 + A 类残留 0（并入 T3 验证）。
- **本仓复核**：归档态（9 组）+ 17 阶段全 done（本阶段除外）；`flow health` 增量核对；模板 / 生成物一致（`--porcelain`）。
- **纪律**：隔离环境（防真实用户目录副作用）；命令 + 版本 + 环境三要素留痕；**验收须在收口 op 内**（与 T3 同 op——kb #收口 op 为最终 op）。

### T5 — roadmap/plan 回填

- `.openfeel/roadmap/v1.2.1.md`：状态「规划中」→ **「已归档」**；里程碑表 M41~M48 → **done**（补归档 commit 列）；**补登 stage-94**（表外补阶段，登记来源 = stage-94 plan §七）；「执行顺序」注记按实况登记（86~92 串行 → **94（表外）先于收官轮完成** → 93 最终收口）。
- `.openfeel/plan/v1/v1.2.1/plan.md`（大计划）：**最小追加**——修订记录补一行（收官实况：8 阶段 + 表外 94；版本 1.2.1）；§四/§五 若有「待注册」类表述 → 更新为实况；**不重写**计划正文（历史文档）。
- 纪律：回填属**主会话/归档面**协同项——执行 Agent 完成文本改写在**收口 op**；flow.json / phase 推进仍归 Feel（CLI）。

### T6 — 门禁 + 收口

- **门禁全量（收口 op；顺序固定）**：`npm run build` ×2（幂等）→ `npm test`（0 skipped / 0 failed；新基线逐项登记）→ `npx tsc --noEmit` = 0 → `lint i18n`（新基线 ≥ 944，新增键逐键列名）→ `lint kb` = 0 → `--version` = 1.2.1 → A 类残留复核（白名单化）。
- **收口动作**：`ops/**` 精确 `git add`（禁 `-A`）；终局报告（三 BUG 修复对照 / 验收记录 / 版本收口清单 / 承接三分四表）落 `.openfeel/tmp/`；supersede 材料落盘（kb 写入归归档轮）；归档轮落点登记（kb 补沉 + manual 面 + cli-usage 快照去向 + **`flow archive v1.2.1` 前置**：本阶段 done 后由 Feel/主会话执行——判据 = 全阶段 done + 无 blocking open REV）。
- **流程面移交**：`status.md` 经 `openfeel stage` CLI（executor 可能无 phase 推进权 → 移交主会话登记不阻塞，承 D6 家族口径）。

---

## 四、开放问题（方案期 / 执行期定稿）

- **Q1 BUG-002 修复形态与文案**。实现：(a) 谓词单点 `canCompleteRequirement`（推荐）／(b) 最小一行例外；文案：(a) 专用键 / 错误码细化（触 `--json` 契约，须登记）／(b) 通用文案澄清（推荐，最小）。**方案期显式裁定 + 差额对照**（C2 supersede 材料随裁定定稿）。
- **Q2 REV-92-006 处置**。修复 BFS 穷尽语义 / 文案补充提示（推荐，与 T1.2 同批）／登记保留（须理由）。**方案期定稿**。
- **Q3 BUG-007 形态与防再犯范围**。① 中文节名（推荐）／② 节标题双语；§锚完整性断言增强的扫描口径与范围（先全量扫描评估——若批量悬空则本阶段修本次触面 + 其余登记）。
- **Q4 T4 验收的执行粒度**。哪些项复跑（标注「需复跑」项）/ 哪些引用既有材料（E3 / E8）；隔离脚本落点与命名；报告格式（承 stage-85/92 先例）。
- **Q5 op 数与依赖**。4 op（推荐；收口恒独立）vs 3 op 降级（验收并入收口 op）；见 §八。
- **Q6 大计划回填范围**。`.openfeel/plan/v1/v1.2.1/plan.md` 的最小追加边界（修订记录 + 实况登记）；stage-94 表外登记的落点（roadmap 表 vs 大计划 §五附注）——**回写归主会话裁定**，本计划给出建议落点。
- **Q7 E-89-6 范围**：`cli-usage:65` 订正外，是否顺带全量刷新 `cli-usage` 其它陈旧计数（`rg` 兜底结果为准）；同族「9 个 / 18 个」残留逐处判类。

## 五、验收要点（阶段级）

1. **缺陷清零**：三 BUG 修复 + 回归证据齐备（BUG-002 复现链转正 / BUG-011 免审档实跑 / BUG-007 全仓零悬空）；**C2 supersede 差额对照**在位（旧断言 → 新断言逐条说明，禁删除）；三 BUG 状态流转由测试官 / 审查官按流程收口（planner 不代办）。
2. **版本收口 A/B/C/D/E**：A 类 10 处逐处改毕 + 残留 0（白名单化）；B 双生成物 build 重生成 + ×2 幂等；C 传播全载体（CHANGELOG / README×3 / GETTING_STARTED / commands / cli-usage）；D 白名单 file:line 显式枚举（零未判类）；E 按需判类；`--version` = **1.2.1**。
3. **文档一致性**：文档命令面与 `--help` 实测一致（关键句全仓 `rg` 兜底）；zh/en 同构；「v1.2.1 起提供」类标注在位。
4. **manual**：核对/最小补正；已知缺口清零（BUG-002 记录改写为修复）；禁新建重复页。
5. **端到端（七主题 ×10 项）**：§三 T4 各链实跑 / 引用留痕；BUG-002 / 011 修复场景在验收链内。
6. **零回归**：既有命令输出 / `--json` 契约 / phase 15 项 / `advanceAccepted` / `flow phases` 键序逐字；存量 `flow.json` 零注入。
7. **回填**：roadmap 状态 / M41~M48 / stage-94 登记；大计划最小追加。
8. **门禁**：§一 表 F 阶段末目标逐项达成（测试 / tsc / i18n / kb / build / `--version`）。
9. **承接**：三分结论零灭失（本阶段处置 = 三 BUG + E-89-6 + REV-92-006 评估；转主会话 = D6/D7 家族；台账保留 = D9）；supersede 材料归档轮落点登记。
10. **收口与移交**：`ops/**` 精确入管；终局报告四表；status.md 走 CLI（权限不足移交主会话登记不阻塞）；`flow archive v1.2.1` 执行前置条件（本阶段 done）登记——执行归 Feel。

## 六、风险

| # | 风险 | 影响 | 缓解 |
|:-:|------|------|------|
| R-93-1 | **BUG-002 修复引入聚合耦合**（general 路径误入聚合 / `.every(` 第二份 / 聚合面混入 `workflow_mode`） | **高** | 不变量 3/4：`aggregate.ts` 零改动 + 段 C NEEDLES 6 串复锁 + 动态断言保持 + 新增正控（general done 后聚合投影恒 null、`syncRequirementStatus` 零动作） |
| R-93-2 | **C2 supersede 静默弱化**（断言被顺手放宽 / 删除） | **高** | supersede 材料五要素 + 差额对照逐条（旧 → 新）+ 审查聚焦「强度不降」+ kb / manual 追加式（原行保留） |
| R-93-3 | **BUG-011 修复改变档位可达矩阵**（引入意外可达路径） | 中 | 「进入被裁剪关仍被裁」断言保持（阴性复核）+ 隔离实跑 + `full` 零裁剪逐字 + 展示面 diff 复核 |
| R-93-4 | **版本收口误改**（广谱 sed 伤及 D 类 / `package-lock` 被 `npm install` 重写 / `config.yaml` 整文件重写） | 中 | 内容特征扫描兜底 + file:line 白名单 + 单行 edit 纪律 + 禁 `npm install`（A2 硬件纪律） |
| R-93-5 | **陈旧计数再遗漏**（E-89-6 复发 / cli-usage 快照刷新不全） | 中 | 全枚举双路扫描（「9 个 / 18 个 / 10 子命令」等同族串）+ 逐处判类（零未判类）+ `:3/:15/:38/:53/:65` 逐处登记 |
| R-93-6 | **文档-实现发散**（新命令面 / 修复后文案与文档不一致） | 中 | 文档以 `--help` 实测为准 + 关键句 `rg` 兜底 + 「提供版本」标注纪律 |
| R-93-7 | **收口期越界**（修复连带重构 / 发现新缺口擅自扩面） | 中 | 白名单三 BUG 边界 + 缺口「记录不擅自扩面」+ 审查核对 diff 面 |
| R-93-8 | **B 类漏 build**（templates-data 改动后未重生成） | 中 | 同批 `npm run build` + `--porcelain` ⊆ produces + 双注入键集一致 |
| R-93-9 | **i18n 死键 / 漏键**（修复文案新键） | 中 | zh / en 双份同批 + 接入消费点（防死键）+ `lint i18n` 逐键列名 |
| R-93-10 | **验收样本失真 / 环境副作用**（真实用户目录被写） | 中 | `OPENFEEL_LOG=0` + 隔离 fixture（kb 同族坑位）+ 本仓面只读复核 |
| R-93-11 | **REV-92-006 修复副作用**（BFS 语义改动影响其它路径报错） | 低 | 若选 (a) 须论证判定条件 + 同源消费点复核；优先 (b) 文案提示最小化 |
| R-93-12 | **status.md 脱节家族复发**（executor 无 phase 推进权） | 低 | 收口 op 显式移交主会话（D6 口径）+ 终局报告登记不阻塞 |

**回滚**：源码层均可 `git revert` 对应提交；BUG-002 修复为门判定单点（回退即恢复原门）；BUG-011 为裁剪函数单点（回退即恢复原裁剪）；BUG-007 为模板文本（回退 + build 重生成）；版本载体类回退 = 反向 sed 白名单（或 revert）；文档 / skill 为纯文本；**无数据格式破坏**（不触碰 `flow.json` 结构 / phase 枚举 / 既有 `--json` 键）。

---

## 七、承接 REV 与处置表（REV-85-002 固化口径；判据源 = 上游台账文件）

- **判据源**：`.openfeel/users/Liuary/code_review/REV-92.md`（001~006）+ `REV-94.md`（001~007）+ `REV-91.md`（010/011）+ `REV-90.md`（011）+ `REV-89.md`（006/008）+ `REV-86.md`（009/010）+ `.openfeel/code_review/v1.2.1-{stage-92,stage-94}.md`（遗留节）+ `.openfeel/bugs/{req,cli,templates}.md`（BUG-002/011/007）+ 本会话实测。

| 上游条目 | 优先级 | 去向 | 依据 |
|---------|:--:|------|------|
| **`req/BUG-002`**（general 恒无法 done） | medium | **本阶段处置**（T1.1；含 C2 supersede） | BUG 条目「承接 v1.2.1-stage-93 收口轮缺陷清零」 |
| **`cli/BUG-011`**（档位裁剪致无跳转目标） | medium | **本阶段处置**（T1.2） | 同上 |
| **`templates/BUG-007`**（en 指针悬空） | low | **本阶段处置**（T1.3） | 同上 |
| **REV-92-006**（`findPhasePath` 报错语义精度） | low | **本阶段评估**（T1.4；Q2 三选一） | 处置建议「后续阶段（或 93 收口轮）评估」 |
| **E-89-6**（cli-usage 陈旧计数；REV-89-006 已 closed） | low | **本阶段处置**（T2.4） | 快照声明件随收官轮刷新（REV-89-006 交付口径） |
| **REV-90-011 / REV-89-008 / REV-91-010**（status.md 脱节家族） | low / medium | **转主会话**（CLI 补齐） | 流程态遗留非代码缺陷；本阶段零动作（同类风险预告见 §五.10） |
| **REV-94-005 / REV-94-006 / REV-94-007** | low | **转主会话 / 已闭合**（005 CLI 同步；006 已入管实测；007 归档轮 kb 说明在位） | stage-94 审查摘要遗留节 |
| **REV-86-009 / REV-86-010** | low ×2 | **台账保留·销账维持** | 非本阶段面（flow-manager 测试 / session 模块） |
| REV-92-001~005 / REV-91-011 / REV-94-001~004 / REV-87 / REV-88 / REV-90 其余 / REV-91 其余 | — | **已闭合 / 登记零动作** | 台账实测 |

- **三分结论**：本阶段处置 **5**（三 BUG + E-89-6 + REV-92-006 评估）／显式转出 **6**（REV-90-011 / 89-008 / 91-010 + REV-94-005/006/007）／台账保留 **2**（REV-86-009 / 010）→ **零灭失成立**。
- **产出清单双向偏差登记（供 `deps.yaml` 后续同步与阶段对账；同步由主会话执行，本 Agent 不直改）**：

| 面 | 条目 | 说明 |
|----|------|------|
| **增补面**（deps 缺 / 实际改动） | ① `src/core/req/requirement-ops.ts` + `src/commands/req.ts` + `src/core/i18n-data/{zh-CN,en}.ts`（BUG-002）② `src/core/flow-manager.ts`（BUG-011 + 若 REV-92-006 修复）③ `templates-data/{claude,opencode}/agents/en/openfeel-archiver.md`（BUG-007）④ `test/**` 相关 describe（四文件）⑤ `src/core/templates-data/skills/openfeel-req/SKILL.md`（T2.5）⑥ `.openfeel/tmp/**`（supersede 材料 / 验收记录 / 终局报告） | `deps.yaml` 的 stage-93 `produces_core` 未含 ①②③④⑤ → 按上表增补（对账登记） |
| **移除面**（deps 有 / 本阶段零触碰） | — | 无（deps 列载体系均已覆盖） |
| **阴性面**（不在本轮改动清单） | phase 枚举 / `checkpoint_mapping` / `phase_corrections` / `advanceAccepted` 语义、`.openfeel/pipeline.yaml`、`build.js`、`src/core/req/aggregate.ts`（**零改动**——R-93-1 关键防线）、`docs/phase-*/**`、`docs/v1.2.1-design.md` / `docs/claude-code-adapter-plan.md`（非版本型）、`flow.json`、既有 `--json` 键面 | 按边界隔离；既有断言与契约门锁定 |

## 八、op 拆分建议（供 openfeel-schemer 定稿；`est_ops = 4`〔大计划 §四 登记 **3**；对账 = +1：本阶段含**缺陷清零**新职责（T1 独立 op）且收口恒独立〕）

| op | 内容 | 主要文件 | 依赖 |
|:--:|------|------|------|
| `op-001` | **T1 缺陷清零**：BUG-002（完成路径 + C2 supersede 材料 + 文案 + 同步面 + 单测）／BUG-011（裁剪步骤② 修复 + 场景覆盖 + 边界复核）／BUG-007（en 指针 + 防再犯断言评估）／REV-92-006 评估（Q2） | `src/core/req/requirement-ops.ts`、`src/commands/req.ts`、`src/core/i18n-data/*.ts`、`src/core/flow-manager.ts`、`templates-data/{claude,opencode}/agents/en/openfeel-archiver.md`、双生成物、`test/core/{req,flow-manager,templates}.test.ts`、`test/commands/{req,flow}.test.ts` | — |
| `op-002` | **T2 文档多载体**：README×3 / GETTING_STARTED / commands / manual 核对 / cli-usage 快照 v1.2.1（+E-89-6）/ `openfeel-req` 精确化 | `README*.md`、`docs/{GETTING_STARTED,commands}.md`、`.openfeel/manual/{index.md,core/req.md,core/flow-manager.md,cli/commands.md}`、`templates-data/skills/{openfeel-cli-usage,openfeel-req}/SKILL.md`、双生成物 | **hard: op-001**（文档须描述修复后语义与最终命令面） |
| `op-003` | **T4 端到端验收**：七主题 ×10 隔离实跑 / 引用留痕 / 本仓复核（报告落 `.openfeel/tmp/`） | 隔离脚本（tmp）+ 既有材料引用 | **hard: op-001 / op-002**（功能与文档冻结后） |
| `op-004` | **T3 版本收口 + T5 回填 + T6 门禁（阶段最终 op）**：CHANGELOG `[1.2.1]` / A 类 10 处 / B 类 build / C 类核对 / D 白名单 / roadmap+plan 回填 / 门禁全量 / `--version` 1.2.1 / 四表终局报告 / 承接三分 / `ops/**` 入管 / 流程面移交 | `CHANGELOG.md`、`package.json`、`package-lock.json`、`.openfeel/config.yaml`、`src/core/config.ts`、`templates-data/{agents-md/**,claude/constraint/**}`、`.openfeel/roadmap/v1.2.1.md`、`.openfeel/plan/v1/v1.2.1/plan.md`、双生成物、`.openfeel/plan/v1/stage-93/ops/**` | **hard: op-001 / op-002 / op-003**（源码冻结后） |

- **文件冲突（`mutual_exclusion`）**：op-001~004 全部串行（op-001 与 op-002 共有 `cli-usage` skill 文本面？—— op-001 不触 cli-usage；op-002 与 op-004 共有 templates-data（cli-usage / agents-md / constraint）与**双生成物**（两次 build）→ 恒串行；op-004 为收口（恒末位）。
- **降级方案（3 op）**：若方案期判定验收可与收口同 op（stage-85 先例：T4 验收与 T3 版本同 op-003）→ op-003 并入 op-004，op 数 = **3**（对齐大计划 `est_ops`）；**取舍须在方案期显式登记**（验收独立性 vs op 数对账）。
- **op 级依赖与文件清单由 openfeel-schemer 落 `ops/deps.yaml`**（hard / soft / mutual_exclusion，声明实际文件名）。

## 九、修订记录

| 时间 | 制定人 | 说明 |
|------|--------|------|
| 2026-10-15 | openfeel-planner | 初稿：依据大计划 `.openfeel/plan/v1/v1.2.1/plan.md`（§六 版本收口清单 A/B/C/D/E + §八 全局验收 + §十一 端到端验收 + 附录 A「stage-93」）+ 设计 `docs/v1.2.1-design.md` + 上游四阶段收口材料（stage-90/92/94 计划与审查摘要）+ `kb/` 相关条目（supersede 范式 / 版本收口清单 / 收官验收二分 / 陈旧计数全枚举 / 双生成物）+ 三 BUG 台账（`.openfeel/bugs/{req,cli,templates}.md`）。源码 / 运行时复核 **8 表 36 项**（缺陷清零面 A1~A10、版本收口面 B、文档载体面 C、承接台账面 D、验收基线面 E、门禁状态面 F）；变更点 T1~T6（含**三 BUG 修复方案要点**：BUG-002 载体制对偶完成路径 + C2 supersede 差额对照 / BUG-011 裁剪只作用入边-目标侧 + 场景覆盖 / BUG-007 en 指针修复 + §锚防再犯）；开放问题 Q1~Q7；风险 R-93-1~12；承接表（处置 5 / 转出 6 / 保留 2 = 零灭失）；op 拆分建议 4 项（含 3 op 降级方案）。**只写本计划文档**（未改源码 / 未改 deps.yaml / 未直写 flow.json / 未推进 phase / 未写其它阶段文件；基线 HEAD `e72539f`）。 |
