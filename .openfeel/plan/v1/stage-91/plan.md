# v1.2.1-stage-91 计划 — 提示词瘦身与上下文治理（主题四）

- **阶段**：`v1.2.1-stage-91`（七主题之四 · 提示词瘦身 ／ 大计划 §二 表 E「模板与提示词」）
- **依赖**：**hard: `v1.2.1-stage-88` / `v1.2.1-stage-89` / `v1.2.1-stage-90`**（大计划 §四 依赖图 + `.openfeel/plan/v1/v1.2.1/deps.yaml:137-142`）。实质 = **语义冻结后的唯一收编点**（裁定 J 单写者纪律）：87~90 各阶段只做「最小必要落文」（功能性规则行 / 新文件 / 功能性子句，改写块 ≤6 行 / 处），全部散文与范式收编归本阶段。前置意义 = **待收编语义已全部落地且冻结**（需求接取 / 拆分、dispatch 双口径、探索者与执行者、三模式与需求级模式属性）；本阶段一次性重写，避免「瘦身后又大改」的重复改写（否则 40+4 文件将被重写两次）。
- **优先级**：P0 ｜ **制定人**：openfeel-planner ｜ **制定时间**：2026-10-15 ｜ **修订轮**：修订 0（初稿）
- **基线**：**HEAD `3d25d76`**（stage-90 归档提交「chore: 阶段归档 v1.2.1-stage-90」；功能收口 `02156a9`）。全表实测；本文行号 / 键值均以该基线为准。
- **上游基线（stage-90 归档登记值，实测复核一致）**：测试 **71 文件 / 1674 用例** 0 skipped / 0 failed；`npx tsc --noEmit` = 0；`openfeel lint i18n` = **939**；`lint kb` = 0（593 引用）；`npm run build` ×2 幂等（双生成物 sha256 稳定）；`--version` = **1.2.0**（本阶段不改，归 stage-93）；flow.json `revision 1137` / `archived_versions: 9` / `requirements: 0` / `reviews: 0`；v1.2.1-stage-86~90 `done`、91~94 `plan_pending`（`v1.2.1-stage-94` deps=[92]，**不在大计划八阶段表内**——本阶段零涉及）；本仓 `.openfeel/config.yaml defaults.workflow_mode: full`（裁定 B：八阶段全 full）。
- **定位**：把设计 §5「提示词瘦身」与设计 §1.5「上下文膨胀（主会话 token 14.4× 无 compact）」落为**可验证的模板事实**——① **流程 → skill 下沉**（可复用操作流程落为 skill；agent 提示词精简为「**skill 索引壳 + 最小约束**」）；② **40 agent 模板 + 4 约束文件索引壳化重写**（收编 87~90 全部语义；「36+4」为大计划阶段表在 stage-89 新增探索者**之前**的估值，实测已为 **40+4**）；③ **上下文治理**（按需加载 / 工具结果截断 / compact 指引落 skill 与约束；harness 能力边界如实留痕）；④ build 双生成物 + **静态断言**（尺寸方向值 / skill 索引引用完整性 / 跨 harness 对称）+ 计数翻转。
- **主题编号消歧（承 stage-90 REV-90-004 口径）**：设计 `docs/v1.2.1-design.md`（节题「主题二：提示词瘦身」）与版本计划 `.openfeel/plan/v1/v1.2.1/plan.md`（§四 阶段表 / §二 表 E「主题四」）编号漂移。本计划**统一采用版本计划口径（主题四）**；跨文档引用以**节题定位**（「设计 §5 提示词瘦身」），**禁行号依赖**。
- **范围（文件级）**：
  - **agent 模板面（40 文件）**：`src/core/templates-data/{opencode,claude}/agents/{zh-CN,en}/{feel, openfeel-archiver, openfeel-executor, openfeel-explorer, openfeel-feel-tester, openfeel-planner, openfeel-reviewer, openfeel-schemer, openfeel-utility, openfeel-vision}.md`
  - **约束面（4 文件）**：`src/core/templates-data/agents-md/{zh-CN,en}.md` + `src/core/templates-data/claude/constraint/{zh-CN,en}.md`
  - **skill 面**：`src/core/templates-data/skills/**`（现存 18 个；新增 / 增补按 T1 清单）
  - **收编落点（显式转本阶段）**：`skills/openfeel-get-stage-status/SKILL.md`（`:71`「subagent 不互调」/ `:18` / `:95` 值域行）、`skills/openfeel-wizard/SKILL.md:18`（模式选型行）
  - **生成物**：`src/core/template-loader.ts` + `src/core/update.ts`（build 重生成，**禁手改**）
  - **载体清单**：`src/core/templates-data/opencode/ADAPTER.{zh-CN,en}.md`（skills 计数行 `:3` / `:9`）
  - **断言面**：`test/core/{templates, template-loader, claude-adapter, setup, update, templates-migration}.test.ts`
  - `.openfeel/plan/v1/stage-91/ops/**`（末位 op 的 produces 清单）
- **边界**：
  1. **单写者纪律（裁定 J）**：本阶段为 87~90 语义的**唯一收编点**；重写须**吸收**（非丢失）全部既有语义——需求接取与拆分、dispatch 双口径（直接调度 / Handoff）、探索者路由、三模式与需求级模式属性、fast 快线纪律、supersede 后的「模式注记」口径。
  2. **frontmatter 零改动**：40 份 agent 模板 frontmatter **键集与键值零触碰**（opencode：`description` / `mode` / `model` / `reasoning_effort` / `color` / `permission.*`；claude：`name` / `description` / `tools` / `effort` / `color` / `model`）；瘦身只在**正文**；键集 / 权限断言（`template-loader.test.ts:251-311`、`claude-adapter.test.ts:22-45`、`templates.test.ts:109-133`）保持零改写。
  3. **不新增 CLI 能力**：本阶段 = **文本层重组 + 断言**。「约束工具化」= 将**已由 CLI 校验**的规则从提示词描述中移出（`flow advance` 相位合法性 / `flow health` / `openfeel stage set` 字段写入 / `openfeel init --workspace-only` 工作区骨架——能力均已在位）；若方案期发现某流程确需新 CLI 支持 → **显式登记 + 评估转 92/93**（不静默扩面）。
  4. **跨 harness × 语言对称四律**：节锚点插入（**禁行号**）/ 提取式切片字节等值（同语言跨 harness）/ 无裸主语（`Feel` / `主会话` / `main session`；`OpenFeel` 专名剔除后判）/ 插入外零改动。
  5. **引用完整性**：agent 提示词 skill 索引节中被引用的 skill **必须全部存在**（`templates-data/skills/<name>/SKILL.md`）；新增 skill 须经 build 自动纳入（`build.js` 步骤 4/6 遍历 `templates-data/skills/` 子目录）并同步双注入键集（`SKILL_DEFINITIONS` + `OPENCODE_SKILL_DEFINITIONS`）。
  6. **计数全枚举**：skills **18 → 18+N** 的翻转面**全枚举**（表 D）；agent 计数 **10 不变**（登记为非翻转面，防误翻）。
  7. **尺寸方向值**：feel.md ≤ 现状 **50%**（大计划 §八.7）；其余 agent 与约束文件分档 **Q1/Q8 方案期定稿**；约束文件既有 `≤700 行` 软上限（`claude-adapter.test.ts:47`）**只收紧不放松**。
  8. **语义等价取证**（R-1 缓解，裁定 J）：「流程 → skill 清单」**先成文**（逐条：原位置 → 新归属 → 保留 / 改写 / 下沉判定 + 篇幅变化），后落文；重写后逐条回查，差额对照入报告。
  9. **上下文治理不虚构**：harness **可控项**（提示词 / 约束 / skill 内的按需加载与裁剪指引）与**不可控项**（Claude 侧 auto-compact 为**宿主行为**；opencode 侧 compaction 为**平台配置项**，本仓不注入）**分列留痕**；不可控项**禁**表述为「已实现」。
  10. **不做**：审查档位与并行编排（归 92）；文档 / `README*` / `CHANGELOG` / `manual` / cli-usage 快照（归 93）；`--version`（归 93）；不 `npm publish` / 不 `git push`；**不直写 `flow.json`**；不推进 phase（由 Feel 经 CLI 执行）；提交精确 `git add`（禁 `-A`）。

## KB 检索（`openfeel-check-kb`）

已加载 `.openfeel/kb/index.md`（architecture 47 / patterns 191 / troubleshooting 65 / setup 6；实测启用条目数）。**高度相关条目**：

- `kb/patterns.md #CLI 用法 skill 化模式：权威源单文件 + build 双注入 + 自举 + 「以 --help 为准」快照声明`（`:2586`）→ **本阶段主范式**：流程 → skill 的单源 + 双注入 + 快照声明先例；新增 skill 照此落文。
- `kb/patterns.md #约束/操作分离模式：目录结构语义决定归属（约束→AGENTS.md，操作→skill）`（`:2211`）→ 约束文件瘦身的**判据来源**：约束留「应该怎么做」（全局行为准则），操作（工作区结构细则 / 骨架模板 / 流程步骤）下沉 skill。
- `kb/architecture.md #全局约束架构：约束统一全局 AGENTS.md + 约束/操作分离 + 项目级去约束化`（`:502`）→ 约束文件（agents-md / claude/constraint）的角色边界：**部署到用户全局**，删减须保「最小必要约束集」完整性（R-91-6）。
- `kb/architecture.md #上下文预算治理架构：两条设计目的 + 索引层/主题层/详情层三层分层`（`:590`）→ **上下文治理的既有架构基础**（dev_last 三层 / 索引只放结论与位置）——本阶段指引落文须与该架构一致（按需加载 = 三层分层的提示词侧对偶）。
- `kb/patterns.md #Agent 提示词中的产出最小模板约束模式`（`:540`）+ `#Agent 提示词编号一致性审计模式`（`:793`）→ 提示词瘦身的**保留面判据**：产出模板 / 契约 / 编号引用属最小约束，**不随瘦身删除**。
- `kb/patterns.md #跨 harness × 语言模板对称纪律：提取式切片字节等值 + 节锚点插入 + 无裸主语`（`:3937`）→ 重写全程纪律（四律）；切片比较用 `norm`（EOL 归一，先例 `templates-migration.test.ts:24`）。
- `kb/patterns.md #skills 计数翻转全量清单：字面量 + 派生总数 + 白名单枚举（派生值 27/28/55 陷阱）`（`:3953`）→ 表 D 翻转面依据（18 → 18+N；派生值 29 / 59 陷阱）。
- `kb/patterns.md #新增 skill 纳入生成物键集：build 按目录自动纳入 + 白名单手工追加 + 键集一致断言`（`:3970`）→ 新 skill 落地机制：build 自动纳入 + 三处键集断言（`templates-migration.test.ts` T4.2）。
- `kb/troubleshooting.md #改 templates-data 源须同批重生成「双生成物」（template-loader.ts + update.ts）` → build 同批纪律；`kb/troubleshooting.md #模板断言的保护边界：build 注入常量 vs 源文件直读（「改源忘 build」窗口）`（`:886`）→ 断言**直读源文件**（防未注入源假绿）。
- `kb/patterns.md #陈旧计数「全枚举」纪律：标准正则 + 宽词界双路扫描 + 表格式计数差集 + 分层判类` → 表 D 扫描法（双路扫描 + 逐处判类，零未判类）。
- `kb/patterns.md #同类缺陷一次全量扫描`（承 stage-84/89/90 先例）→ 断言面（表 C）**先界定类 → 全量枚举 → 同批修订**（防「改一处漏十处」）。
- `kb/patterns.md #断言串与落文逐字核对纪律` + `#模板断言的保护边界` → 重写后断言串与落文**同批原子更新**（防假绿 / 红）。
- `kb/patterns.md #零回归取证范式（补丁前/后归一化快照 diff 空）` → 语义等价取证法：重写前 / 后逐节归一化快照对照（差额对照 = 有意变更清单）。
- `kb/patterns.md #部署型资产变更的多载体同步面清单：权威源 skill → build 生成段 → 全局副本`（`:3077`）→ 新 skill / 改 skill 的同步面（源 → 双注入 → 部署实例）。
- `kb/patterns.md #共享 skill 双平台分节中立化：能力名叙述 + 双平台适配器分节`（`:3464`）→ 新 skill 若涉及双 harness 差异，须用「双平台分节」写法（stage-70 先例）。
- `kb/patterns.md #未来功能/未落地能力写入 skill 与文档须标注「提供版本」（防照做报错）`（`:3483`）→ **上下文治理留痕纪律**依据：不可控项须标注能力边界（harness 归属）。
- `kb/troubleshooting.md #多源文案同步陷阱：模板权威源与仓库根手维护文件双份同句易只改一处`（`:591`）→ 收编落点（get-stage-status / wizard skill）与 templates-data 双面同句的同步纪律。
- **无**「提示词瘦身 / 索引壳 / 流程下沉判据 / 上下文治理指引」既有条目 → **归档轮补沉** architecture（提示词索引壳架构：skill 索引壳 + 最小约束 + 引用完整性）与 patterns（瘦身范式：流程清单先行 + 尺寸方向值 + 语义等价对照）。

> ⚠️ 执行任务前，若知识库中有相关条目，务必参考。重复踩过的坑不可再犯。

---

## 一、实测清单（基线 HEAD `3d25d76`；行号 / 字节数以本基线为准）

### 表 A：模板与体量面（瘦身对象全枚举）

| # | 事实（实测） | 位置 | 结论 |
|:-:|------|------|------|
| A1 | agent 模板 **40 文件** = 10 agents × 2 harness × 2 lang；zh-CN 侧合计 86282 B（opencode）/ 87128 B（claude）；en 侧 100922 B / 103086 B | `wc -c` 实测 | 瘦身对象主体；大计划「**36 文件**」为 stage-89 新增探索者**之前**的估值 → 本阶段按 **40** 执行并登记订正 |
| A2 | feel.md 实测 4 份：opencode/zh-CN **31638 B / 463 行**、claude/zh-CN **31147 B / 437 行**、opencode/en **36661 B / 463 行**、claude/en **36517 B** | 实测 | 目标载体；目标值 = 现状 50%（zh ≤15.8KB / en ≤18.3KB；Q1 分档） |
| A3 | subagent 模板 9 × 4 = 36 份，2.7~12.8KB；最小 = **openfeel-explorer**（2710 / 2710 / 3230 / 3258 B，64 行）= **索引壳形态现成先例**（6 节：核心职责 / 调起方式 / 输出规范 / 能力边界 / 模型选择 / 注意事项） | 实测 | 分档依据 + 范式样本（stage-89 产物可直接参照） |
| A4 | 约束文件 4 份：`agents-md/{zh-CN 508 行, en 509 行}`、`claude/constraint/{zh-CN 511 行, en 512 行}`（30.5~35.9KB）；**已有**软上限断言「CLAUDE.md ≤700 行」（`claude-adapter.test.ts:47`） | 实测 | 瘦身 + 上限收紧（既有先例锚点；Q8） |
| A5 | skills **18 个**（合计 76591 B；最大 `openfeel-cli-usage` 22041 B；17 个 <8KB；最短 `openfeel-roadmap` 537 B） | 实测 | 下沉目标载体；新增 skill 触发计数翻转（表 D） |
| A6 | build **双生成物**：`template-loader.ts`（步骤 2 agents / 3 agents-md / 5 opencode agents / 6 skills 定义 / 7 config）+ `update.ts`（步骤 4 `SKILL_DEFINITIONS`）；**skill 目录自动纳入**（遍历 `templates-data/skills/` 子目录） | `build.js:100-341 / :265-300` | 禁手改；源改后同批重生成；新 skill 零 build 脚本改动即纳入 |
| A7 | frontmatter 键集（实测 40 份）：opencode = `description` / `mode` / `model` / `reasoning_effort` / `color` / `permission`（permission 子键逐 agent 不同：`task` / `skill` / `webfetch` / `todowrite` 等）；claude = `name` / `description` / `tools` / `effort` / `color` / `model` | 实测 | **索引壳化禁改 frontmatter**（键集断言面 C3 / C4；边界 2） |
| A8 | feel.md 结构：**19 个 h2 + 18 个 h3**（463 行）；「## 可调用的技能与命令」（`:281-301`）= **索引表雏形**（8 条 CLI 命令 + 5 项 skill + 2 条流程阶段**混列**） | 实测 | 索引壳范式的改造基点（skill 与 CLI 命令须分列） |
| A9 | **收编落点实测**：`get-stage-status` skill `:71`「口径：**subagent 不互调**（不直接调用其他 subagent）」= stage-88 规则放宽后的**残留旧措辞**（`templates.test.ts:581` 阴性断言仅覆盖 claude vision，未覆盖本 skill）；同 skill `:18`（四键）/ `:95`（值域行 `full \| fast`）；wizard skill `:18` 模式选型 `（full / fast）` | 实测（stage-88/89/90 显式转出 + REV-90 遗留） | T1.3 / T2.4 收编清单（**禁**与「阶段合法子集」口径冲突：wizard 保持 2 项——REV-90-001 裁定） |

### 表 B：流程 → skill 下沉面

| # | 事实（实测） | 位置 | 结论 |
|:-:|------|------|------|
| B1 | 既有 18 skill 覆盖面：`workspace`（会话启动自检）/ `tool-usage`（工具使用规范 + 任务类型路由）/ `check-kb` / `search-kb` / `recover` / `health` / `wizard` / `get-stage-status` / `update-stage-status` / `get-bugs` / `bug-acceptance` / `req` / `roadmap` / `sync-status` / `model-check` / `model-config` / `agent-model-check` / `cli-usage` | 实测 | **归属清单**（新流程须先查既有归属；无归属才新建——防过度设计） |
| B2 | feel.md 内**无既有 skill 归属**的可复用流程（实测段清单）：委托边界与硬性纪律（`:33-107`：直接操作白名单 / 必须委托 / 流程不可跳过 / 审查修复必须走流程 / 审查不可跳过 / 无方案委托仍须产 op）/ Handoff 委派（`:109-127`）/ 多模态自动委派（`:129-149`）/ 工作流模式感知（`:215-229`）/ 归档与历史读取（`:249-255`）/ 小改 vs 大规模阈值 + 轻量决策边界（`:257-273`）/ 审查会话健康探测（`:303-306`）/ 日志记录纪律（`:308-339`）/ 记忆加载（`:362-378`）/ 冲突检测（`:380-398`）/ update_infos 检查修复（`:400-414`）/ 决策追加（`:416-428`）/ 信息落档与会话结束写入（`:430-456`） | 实测（463 行中约 350 行为下沉候选） | **下沉清单主面**（Q2 定稿归属与命名；判据见 T1.1） |
| B3 | 约束文件「## .openfeel 工作区结构（约束）」节 = 篇幅主体（`:156-504`，约 15KB）：公共域 / 私域各目录语义 + **骨架模板 4 组**（`current.md` 骨架 / `dev_last` 索引与主题骨架 / REV 条目模板 / Bug 目录结构）+ 审查-追踪生命周期图 | 实测 | 下沉候选：目录语义 → 增补 `openfeel-workspace`；骨架模板 → skill；生命周期图 → 保留或下沉（Q2） |
| B4 | 各 agent skill 引用现状：feel.md 有索引表（5 项 skill）；planner（`:78`）与 schemer（`:29`）提及 `openfeel-check-kb`；其余 7 agent **零 skill 提及** | 实测 | 「全 agent 含 skill 索引节」= 本阶段**新增面**（大计划 §八.7 验收口径） |
| B5 | skill 格式 = frontmatter `name` + `description`（触发词写在 description）；双 harness 差异用「双平台分节」写法（stage-70 先例）；短 skill 21~51 行（workspace 32 / tool-usage 51 / recover 26 / wizard 28） | 实测 | 新 skill 落文格式规范 |
| B6 | 无任何 skill 体量断言（先例仅约束文件「≤700 行」） | 实测 | 尺寸断言新增依据 |

### 表 C：断言面（重写影响全枚举——R-91-1 核心）

| # | 断言面 | 位置 | 变化 |
|:-:|------|------|------|
| C1 | `test/core/templates.test.ts` **810 行 / 10 个 describe**（stage-50 / 53 / 55 / 69 / 70 / 76 / 84 / 88 / 89 / 90），全部以「节标题 + 逐字串 + 提取式切片」锚定模板文本 | 实测 | 索引壳重写**大面积触及**；须**先界定类**（保留 / 改写 / 结构性替换）再全量枚举（kb #同类缺陷一次全量扫描） |
| C2 | 扫描集常量：`CLASSES` 6 类 + `SKILLS5` 5 项 + `files.toHaveLength(37)`（= 4 feel + 24 subagent + 4 约束 + 5 skill） | `templates.test.ts:294-318` | 份数常量重算登记（`SKILLS5` 可能扩；37 口径须重算） |
| C3 | `claude-adapter.test.ts`：name==文件名（10×2）/ model inherit / **CLAUDE.md ≤700 行** / agents 数 10 / explorer 工具集阴性 / 约束层无小写工具名与 `question` | `claude-adapter.test.ts:22-107` | 保留 + **上限收紧**（Q8；只紧不松） |
| C4 | `template-loader.test.ts`：ID 列表 10 / `listOpencodeSkillNames` 18 / permission 键集与 `task` 键 / **「agents-md 含工作区结构约束（core.md 内容已并入）」（`:135-151`）** | `template-loader.test.ts:65-160 / :251-311` | 部分改写：工作区结构下沉后 `:135` 断言须改写为「指向 skill」（保留「约束 → skill」的可达性） |
| C5 | `setup.test.ts`（`:3` 头注 / `:55`/`:210` 测试名 / `:65`/`:221` 断言 / `:88`/`:240` 派生注释：18 skill 部署计数 + 派生 29 / 59）+ `update.test.ts:146`（18 Skill 定义文件） | 实测 | 计数翻转（表 D） |
| C6 | `templates-migration.test.ts`：18 目录 / 双注入键集 18 / 注入内容逐字节一致（`:27/:35/:40/:44-56`） | 实测 57 行 | 计数翻转 + 新 skill 自动纳入验证（键集一致仍是硬门） |
| C7 | **无**尺寸断言（除 CLAUDE.md ≤700 行）；**无** skill 引用完整性断言；**无**「全 agent 含 skill 索引节」断言（`grep` 零命中） | 实测 | 本阶段**新增三类静态断言**（T5.2；对齐大计划 §八.7） |

### 表 D：计数翻转面（skills 18 → 18+N 全枚举）

| # | 位置 | 计数形态 | 处置 |
|:-:|------|----------|------|
| D1 | `test/core/template-loader.test.ts:111` | `返回 18 项全部带 openfeel- 前缀` | 翻转 18+N |
| D2 | `test/core/templates-migration.test.ts:27 / :35 / :40` | 18 ×3（目录数 / 双注入键数 / 键集一致） | 翻转 18+N |
| D3 | `test/core/setup.test.ts:3 / :55 / :65 / :88 / :210 / :221 / :240` | 18（头注 / 测试名 / 断言）+ 派生 29 / 59 | 翻转（派生值同步，kb 派生陷阱） |
| D4 | `test/core/update.test.ts:146` | 18 Skill 定义文件 | 翻转 18+N |
| D5 | `test/core/templates.test.ts:500` | cli-usage 内「**18 个**共享源」字样断言 | 与 D7 联动（快照件 → 93） |
| D6 | `src/core/templates-data/opencode/ADAPTER.{zh-CN,en}.md:3 / :9` | `10 个 Agent 定义和 18 个 Skill` + 枚举清单 | 翻转 18+N + 枚举清单追加 |
| D7 | `src/core/templates-data/skills/openfeel-cli-usage/SKILL.md:65` | `18 个共享源` | **快照声明件 → 维持转 stage-93**（REV-89-006 / E-89-6；本阶段 skill 面变动使其进一步陈旧，登记） |
| D8 | 生成物 `template-loader.ts`（`OPENCODE_SKILL_DEFINITIONS` 键集）+ `update.ts`（`SKILL_DEFINITIONS`） | 键集 | build 重生成（禁手改） |
| D9 | **非翻转面（登记防误翻）**：agent 计数 **10** —— `template-loader.test.ts:65/80/87/94/102`、`claude-adapter.test.ts:65-72`、`templates.test.ts:112`、`test/core/model-config.test.ts:89`、`kb/index.md:13/:15` | 10 | 本阶段**不新增 agent**；逐处判类 = 保留 |

### 表 E：承接 REV 台账（判据源实测）

| # | 条目 | 状态 | 去向 |
|:-:|------|:--:|------|
| E1 | **REV-90-011**（stage-90 `status.md` 主状态仍 `planned`，流水线实际已达 `review_pending`） | `pending`（low） | **转主会话**（`openfeel stage` / `openfeel flow` CLI 补齐；executor / planner 均无权推进 phase）；非本阶段面，登记 |
| E2 | **REV-89-008**（stage-89 同类状态留痕脱节） | `pending`（medium） | **同 E1 口径**（转主会话 / 归档轮 CLI 补齐）；非本阶段面 |
| E3 | **REV-86-009**（T4.4 用例未命中 `computeResumed` 分支，保护力弱）/ **REV-86-010**（`session.json` 守卫缺位） | `pending`（low ×2） | **台账保留·销账维持**（v1.2.1 收官轮〔93〕或 v1.3.0）；非本阶段面 |
| E4 | **REV-89-006 + E-89-6**（cli-usage 快照陈旧计数） | `closed` / 在案 | **维持转 stage-93**；本阶段 skill 面变动使其进一步陈旧（D7 登记） |
| E5 | **`req/BUG-002`**（`general` 需求恒无法 `done`：载体制约束 × done 门死锁） | `open`（medium） | **维持转 stage-93 收口轮 / 后续裁定**（本阶段零触碰；判据源 `.openfeel/bugs/req.md`） |
| E6 | REV-88-010（90 已处置 → `closed`）/ REV-89-001~007 / 009（全 `closed`）/ REV-90-001~010 / 012 / 013（全 `closed`） | 已闭合 | **登记，零动作** |

- **判据源**：`.openfeel/users/Liuary/code_review/REV-90.md`（001~013）+ `REV-89.md`（008）+ `REV-86.md`（009/010）+ `REV-88.md`（010）+ `.openfeel/code_review/v1.2.1-stage-90.md`（遗留节）+ `.openfeel/bugs/req.md`（BUG-002）。

---

## 二、目标语义与不变量

| 维度 | 内容 |
|------|------|
| 瘦身口径 | agent 提示词 = 「**skill 索引壳 + 最小约束**」：① 角色定位（1~2 行）；② 核心职责（≤5 条，结论式）；③ **技能索引节**（skill 名 + 一行用途；与 CLI 命令分列）；④ 最小约束（产出契约 / 关键禁止项 / 编号引用）；⑤ 输出契约。**可复用操作流程一律下沉 skill** |
| 流程下沉 | 可复用操作流程落为 skill（新增或增补既有）；提示词只留**索引 + 触发时机**（一行） |
| 约束工具化 | **已由 CLI 校验**的规则（相位合法性 / 字段写入 / 工作区骨架 / 计数事实）从提示词移出描述，改由 CLI 与断言承载（**不新增 CLI 能力**——边界 3） |
| 尺寸方向值 | feel.md ≤ 现状 **50%**（zh 31638 → ≤15.8KB；en 36661 → ≤18.3KB；claude 侧同口径）；subagent 与约束文件分档（Q1 / Q8 方案期定稿）；约束文件软上限**只紧不松** |
| 索引壳范式 | 全 agent 含 **skill 索引节**；节内被引用 skill **必须存在**（引用完整性）；索引项 = `skill 名 + 一行用途` |
| 上下文治理 | 「按需加载 / 工具结果截断 / compact 时机」指引落 skill 与约束；harness **可控项**（提示词内指引，本阶段落文）与**不可控项**（Claude auto-compact 宿主行为 / opencode compaction 平台配置）**分列留痕**，不可控项禁表述为「已实现」 |
| 收编（单写者） | 87~90 全部语义收编：需求接取与拆分 / 版本解绑口径 / dispatch 双口径（直接调度 + Handoff）/ 探索者路由 / 三模式与需求级模式属性 / fast 快线纪律 / supersede 后「模式注记」口径 + stage-88/89/90 显式转出项（get-stage-status `:71` 措辞 / `:95` 值域行 / wizard `:18` 复核） |

**不变量**：

1. **语义等价（收编不丢规则）**：重写**吸收**既有全部语义；「流程 → skill 清单」**先成文后落文**，逐条登记原位置 → 新归属 → 判定（保留 / 改写 / 下沉 / 合并）；重写后逐条回查，**差额对照**入报告（R-91-1 缓解）。
2. **单写者**：本阶段为 87~90 语义的**唯一**收编点；不吸收后续（92 / 93）语义，不预留未定稿内容。
3. **frontmatter 零改动**：40 份 agent 模板 frontmatter 键集与键值逐字不变；键集 / 权限断言零改写（`template-loader.test.ts:251-311` / `claude-adapter.test.ts:22-45` / `templates.test.ts:109-133`）。
4. **引用完整性**：全部 agent 提示词含 skill 索引节；被引用 skill 全部存在于 `templates-data/skills/<name>/SKILL.md`（新增正控断言）。
5. **跨 harness × 语言对称（四律）**：节锚点插入（禁行号）/ 同语言跨 harness 逐字同文（提取式切片 `===`，`norm` 归一）/ 零裸主语（`Feel` / `主会话` / `main session`，`OpenFeel` 专名剔除后判）/ 改写外零改动。
6. **build 双生成物**：templates-data 源改动同批 `npm run build`；生成物**禁手改**；`git status --porcelain src/` ⊆ produces 清单。
7. **计数全枚举**：skills 18 → 18+N 翻转面逐处判类（表 D）；agent 10 **非翻转**（D9 防误翻）；扫描 = 标准正则 + 宽词界双路 + 差集判类（零未判类）。
8. **尺寸方向值**：feel.md ≤50% + 其余分档（新增断言锁定，防反弹）；约束文件上限收紧（只紧不松）。
9. **断言同批**：模板文本与断言串**同批原子更新**（防假绿 / 红）；既有断言**禁静默删除**——保留 / 改写 / 结构性替换三类须逐条登记与论证（R-91-2）。
10. **不新增 CLI 能力**：本阶段 = 文本层重组 + 断言；如确需 → 显式登记 + 评估转 92/93（边界 3）。
11. **提交卫生**：精确 `git add`（禁 `-A`）；不 push / publish / **不直写 `flow.json`** / 不推进 phase；`ops/**` 入末位 op produces。

## 三、变更点清单（编号 T）

### T1 — 流程 → skill 下沉（清单定稿 + 新增 / 增补 skill）

**T1.1 下沉判据与清单成文（先成文后落文——R-91-1 缓解；Q2 定稿）**
- 判据（四条全满足才下沉）：① 属**操作流程**（步骤 / 纪律 / 检查清单），非角色职责或产出契约；② **可复用**（跨会话复用或 ≥2 角色消费）；③ 独立成文 ≥20 行；④ **无既有 skill 归属**（有归属则增补该 skill，不新建）。
- **候选清单**（实测驱动；方案期定稿命名与归属）：
  - **新建候选**：`openfeel-delegation`（委托与流水线纪律：直接操作白名单 / 委托边界 / 调用子 Agent 硬性纪律 / 流程不可跳过 / 审查不可跳过 / 无方案委托仍须产 op / Handoff 机制）、`openfeel-logging`（日志记录纪律：公域与私域布局 / 必录事件 / 条目格式 / 骨架文件 / 禁止事项）、`openfeel-memory`（记忆与落档：记忆加载 / 偏好合并 / 决策追加 / 信息落档 / 会话结束写入 / 阶段结束检查）、`openfeel-context-hygiene`（上下文治理：按需加载 / 工具结果截断 / compact 时机 / 子会话返回精简）
  - **增补候选**：`openfeel-workspace`（工作区目录语义 + 骨架模板）、`openfeel-get-stage-status`（模式感知收编 + 措辞订正）、`openfeel-tool-usage`（规模阈值 / 轻量决策边界）
  - **保留面（不下沉）**：角色定位 / 核心职责（≤5 条）/ 工具集与权限说明 / 产出契约 / 模型选择 / 关键禁止项（≤5 条）
- 产出：**下沉清单表**（原位置 file:line → 新归属 → 判定 → 篇幅变化 + 内容要点核对），入报告与末位 op。

**T1.2 新增 skill 落文**
- 遵循既有格式（B5）：frontmatter `name` + `description`（含触发词）；正文「## 输入 / ## 执行步骤 / ## 输出」；双 harness 差异用「双平台分节」写法（stage-70 先例）；「本仓自举」加注行（`node bin/openfeel.js`——T53 断言口径）。
- 新增 skill **零 build 脚本改动**（A6 自动纳入）；键集断言（`templates-migration.test.ts` T4.2）同批扩。

**T1.3 增补既有 skill（显式收编落点）**
- `openfeel-get-stage-status`：`:71`「口径：**subagent 不互调**（不直接调用其他 subagent）」→ **改写为 dispatch 新语义**（「除直接调度通用工作者外，不调用其他 Agent；需向用户确认的事项一律由主会话负责」——与 stage-88 既有措辞家族一致）；`:18`（四键）/ `:95`（值域行 `full | fast`）→ 3 值订正（`full | fast | general`，与 `flow mode` 口径一致）。
- `openfeel-wizard`：`:18` 模式选型行**复核**——**保持 2 项（full / fast）= 阶段合法子集**（REV-90-001 裁定：wizard 双写入面禁入 general）；仅补一句「阶段合法子集（不含需求级 general）」防误扩，**禁**改为 3 值。
- 其余 skill 收编面（如 tool-usage 路由行）按 T1.1 清单判定。

**T1.4 约束工具化清单（移出描述 → 校验载体；能力均已在位）**

| 规则 | 现所在 | 校验载体（已在位） |
|------|--------|--------------------|
| 相位合法性与转移合法性 | 提示词散文描述 | `openfeel flow advance` 内置校验 + `openfeel flow phases` / `flow health` |
| status.md 字段写入形态 | feel.md「注意事项」+ 约束 | `openfeel stage set` / `openfeel stage task` + `openfeel-update-stage-status` skill |
| 工作区骨架与结构 | 约束「.openfeel 工作区结构」节 | `openfeel init --workspace-only` + `openfeel-workspace` skill |
| 计数类事实（agent / skill 数） | 约束「Agent 体系总览」节 | 模板断言 + `listAgentIds` / `listOpencodeSkillNames`（不写死提示词） |
| flow.json 禁手改 | feel.md | CLI 内置校验（提示词保留一行索引） |

- 移出的**仅描述**（禁止改变校验能力）；清单成文入报告。

### T2 — 40 agent 模板索引壳化重写（收编 87~90 全部语义）

**T2.1 索引壳范式定稿（Q3）**
- 节结构：`角色定位 → 核心职责（≤5 条）→ 技能索引（skill 表）→ 最小约束 → 输出契约`；按角色裁剪（reviewer 含 REV 条目契约、archiver 含知识暂存判定、executor 含自测与重试契约）。
- skill 索引节格式：`| skill | 用途（一行） |` 表 + 「详细流程见对应 skill 文件」声明；与 CLI 命令**分列**（A8 现状为混列）。

**T2.2 feel.md ×4 重写（目标 ≤50%；zh 31638 → ≤15.8KB）**
- **收编语义**：需求接取与拆分（`req split` / 版本解绑「仅发布推进版本号」）/ dispatch 双口径（直接调度 + `[HANDOFF: agent_name]`）/ 探索者路由 / 三模式（full / fast / general）+ 需求级模式属性 + 载体制约束 / fast 快线纪律（plan_review 必经单轮 / 术语消歧）/ 自动推进决策纪律 / 归档与历史读取。
- **下沉语义**：B2 全清单（委托纪律 / 日志 / 记忆 / 上下文治理 / 健康探测 / 冲突检测 / update_infos / 决策追加 / 落档）。
- **保留**：角色定位 / 核心职责 / 直接操作白名单（最小）/ 技能索引节 / 输出契约 / 关键禁止项。

**T2.3 subagent 36 份重写（分档；Q1 定稿）**
- 逐份：核心职责收敛为结论式 ≤5 条 + 技能索引节（planner / schemer / reviewer 引 `openfeel-check-kb`；executor 引 `openfeel-get-bugs` / `openfeel-bug-acceptance`；archiver 引知识暂存判定；feel-tester 引 `openfeel-bug-acceptance`）+ 最小约束 + 输出契约。
- 先例：`openfeel-explorer`（64 行，A3）为形态样本。
- 语义收编点：探索者 / 执行者「先探后执行」/ 直接调度授权 / 三模式感知 / 术语消歧（工作流快线 vs FAST-PASS）。

**T2.4 收编核对（逐处）**
- 87~90 各阶段落文位置（stage-88 调度与 Handoff 节 / stage-89 探索者注册与路由 / stage-90 三模式文案与需求注记）→ 新位置；逐处登记（用 T1.1 清单表格式）；**零遗漏**为准入条件。

**T2.5 frontmatter 与键集零改动**（边界 2；断言面 C3 / C4 零改写）。

### T3 — 4 约束文件瘦身（工作区结构下沉 + 最小必要约束集）

**T3.1 工作区结构节下沉（B3，约 15KB）**
- 目录语义（公共域 / 私域各目录）→ 增补 `openfeel-workspace` skill。
- 骨架模板 4 组（`current.md` / `dev_last` 索引与主题 / REV 条目 / Bug 目录）→ 落对应 skill（workspace / logging / update-stage-status / get-bugs 或 bug-acceptance；方案期定稿）；约束文件保留**一行指针**（模板见 skill）。
- 张力处置：`template-loader.test.ts:135-151`「agents-md 含工作区结构约束」断言须改写为「含工作区结构**约束与 skill 指针**」（C4），保可核验性。

**T3.2 行为准则精简（保留最小必要约束集）**
- 保留：行为准则 / 任务类型路由 / 核心约束 / 知识约束 / 操作规范 / 编码风格 / 注释规范 / 跨 Agent 工具使用约束（收敛为索引 + 关键条）/ 权限模型 / 动态规则 / 项目特有约束（可选化）/ 工作区结构（指针）。
- 移出：可复用流程细节（→ skill）/ 骨架模板（→ skill）/ 计数类事实（→ 断言）。
- **红线**：约束文件部署到**用户全局**（`~/.claude/CLAUDE.md` / `AGENTS.md`）——删减以「最小必要约束集」为判据，**不得**丢失行为准则与安全边界（R-91-6）。

**T3.3 上限收紧（Q8）**：`claude-adapter.test.ts:47` 的 `≤700 行` 收紧至**方案期定稿值**（方向：现值 60~70%；只紧不松）；agents-md 侧同口径（新增对称断言或共用常量）。

**T3.4 对称与图体**：T54（en 图注纯英文 + zh/en 图体行数一致）保持全绿；四律同 T2。

### T4 — 上下文治理指引落文（设计 §5 / §1.5；不虚构）

**T4.1 按需加载指引**（落 `openfeel-context-hygiene` skill + 约束一行指针）
- 读取分层：索引先行（`dev_last.md` / `flow status` / `kb/index.md`）→ 按需取详情（主题文件 / 报告）→ 详情只在显式指定时读 `tmp/`；与 kb #上下文预算治理架构（三层分层）一致。
- 工具结果治理：Read 大文件分片（offset / limit）/ 搜索限定 path / 不重复读同一文件。

**T4.2 工具结果截断与子会话精简**
- 既有先例「子 Agent 返回精简模式（≤10 行摘要 + 完整报告落盘）」扩展为通用指引：返回精简 + 落盘详情 + 按需 read。

**T4.3 compact 指引（harness 边界留痕）**
- **可控项（本阶段落文）**：提示词 / 约束内的按需加载与裁剪指引；长任务分段与上下文卫生习惯。
- **不可控项（如实留痕，禁表述为「已实现」）**：Claude Code 侧 auto-compact 为**宿主行为**（不在本仓可编程控制面；`claude-settings.ts` 不注入相关键）；opencode 侧 compaction 为**平台配置项**（本仓不注入 `opencode.jsonc` 相关键——`init.ts` 仅写最小 `$schema` 覆盖）。
- 与 92 分界：会话卫生（子会话回收）平台能力核验归 **92**（大计划 §十 Q8）；本阶段只落**指引**，不落实现。

**T4.4 落点**：`openfeel-context-hygiene` skill（主体）+ 约束层一行指针（「上下文卫生见 skill」）+ feel.md 索引节一行。

### T5 — build 双生成物 + 静态断言 + 计数翻转 + 门禁

**T5.1 双生成物**：模板 / skill 源改后同批 `npm run build`；×2 幂等（`git status --porcelain src/` ⊆ produces）。

**T5.2 新增静态断言（三类，对齐大计划 §八.7；现状零命中 = C7）**
1. **尺寸方向值**：feel.md ×4 ≤ 现状 50%（基线 31638 / 31147 / 36661 / 36517 B → ≤15819 / ≤15574 / ≤18331 / ≤18259 B，取整口径方案期定稿；Q1 定档）；subagent 与约束文件分档值。
2. **skill 索引引用完整性**：全部 agent 提示词含 skill 索引节（节标题正控）+ 索引节内每个 `openfeel-*` 名在 `templates-data/skills/` 有对应目录且含 `SKILL.md`（悬空引用零容忍）。
3. **跨 harness 对称**：同语言跨 harness 切片等值（关键节：角色定位 / 技能索引 / 输出契约）+ 零裸主语 + 关键语义串（需求接取 / dispatch / 探索者 / 三模式 / fast 快线）。

**T5.3 既有断言同批修订（表 C 全枚举）**
- 逐 describe 判类：**保留**（结构性断言：键集 / 权限 / 阴性 / 图体）/ **改写**（文字锚点串 → 新文本）/ **结构性替换**（切片锚点变更）；逐条登记 + 差额对照（**禁静默删除**；R-91-2）。

**T5.4 计数翻转**：表 D 逐处（18 → 18+N；派生值 29 / 59 同步）；载体 ADAPTER 双文件（D6）；D7 维持转 93（登记）。

**T5.5 门禁收口（阶段末 op）**：见 §五；`ops/**` 入精确 `git add`；终局报告含「流程 → skill 下沉清单」「收编核对表」「断言修订差额对照」「尺寸前后对照」；归档轮落点登记（kb 补沉 + manual 面同步去向）。

---

## 四、开放问题（方案期 / 执行期定稿）

- **Q1 瘦身量化分档（= 大计划 §十 Q7）**。建议：feel.md ×4 ≤ 现状 **50%**（基线 31638 / 31147 / 36661 / 36517 B → 目标 ≤15819 / ≤15574 / ≤18331 / ≤18259 B）；**subagent 分档**建议「≤ 现状 65% 或 ≤8KB（取先达者）」，其中 explorer / utility 已属壳形态（2700~2900 B）→ **列白名单不改**；**约束文件**建议 ≤ 现状 60%（方向）。全部方向值须以**新增尺寸断言**锁定（T5.2）。方案期定稿后以实测字节登记。
- **Q2 流程 → skill 清单边界与命名（T1.1）**。建议：判据四条（T1.1）+ 候选清单（新建 4 / 增补 3），方案期定稿「新建 vs 增补」归属与 skill 名；**防过度设计**：能并入既有 skill 的一律增补（不新建）。
- **Q3 索引壳范式（T2.1）**。建议：五段节结构 + skill 索引表；**保留面**最小集 = 角色定位 / 核心职责 / 工具与权限 / 产出契约 / 模型选择 / 关键禁止项。方案期定稿逐 agent 的**必要保留项**清单（用 explorer 为参照收紧）。
- **Q4 上下文治理落点与 harness 边界（T4）**。建议：主体落 `openfeel-context-hygiene` skill + 约束一行指针 + feel.md 索引一行；可控 / 不可控分列留痕；与 92 的分界 = 会话卫生平台核验归 92。方案期定稿 skill 名与内容边界。
- **Q5 既有断言重写策略（T5.3）**。建议三类判定（保留 / 改写 / 结构性替换）+ 逐条差额对照；**禁删除**；重写后锚点优先选「节标题 + 稳定语义串」（降低后续阶段再触碰概率）。方案期定稿 `templates.test.ts` 逐 describe 判类表。
- **Q6 op 拆分粒度（§八）**。建议 **4 op**（对齐 `est_ops: 4`）；方案期可调（若 T3 / T4 独立成 op 则 5 op——`deps.yaml` 由主会话同步，本 Agent 不直改）。
- **Q7 约束工具化清单终稿（T1.4）**。建议按表移出**描述**（能力已在位）；方案期逐条核对「移出后是否仍有 CLI / 断言可达」。

## 五、验收要点（阶段级）

1. **瘦身达标**：feel.md ×4 ≤50%（实测字节登记）；subagent / 约束文件分档达标；**三类静态断言**（尺寸 / 引用完整性 / 跨 harness 对称）在位且全绿。
2. **索引壳**：全部 40 份 agent 提示词含 skill 索引节；被引用 skill **零悬空**；skill 与 CLI 命令分列。
3. **流程下沉**：「流程 → skill 清单」成文（**无遗漏**：提示词内不再残留可复用操作流程）；新 skill 均过判据；收编落点全落地（get-stage-status `:71` / `:18` / `:95`；wizard `:18` 复核——**保持 2 项子集**）。
4. **上下文治理**：指引落文（skill + 约束 + feel 索引行）；可控 / 不可控**分列留痕**；无「已实现」虚述。
5. **约束文件**：瘦身达标 + 上限收紧（`≤700 → 紧缩值` 断言在位）；**最小必要约束集完整**（行为准则 / 安全边界零丢失）。
6. **语义等价与断言**：断言全枚举判类落地 + 差额对照成文；收编核对表零遗漏；`npm test` **0 skipped / 0 failed**（新基线逐项登记）；`npx tsc --noEmit` = 0。
7. **门禁**：`npm run build` ×2 幂等；`openfeel lint i18n` = 实测登记值（本阶段预期**不新增键**——不触碰 i18n；若有则逐键列名）；`lint kb` = 0；`--version` = **1.2.0**（本阶段不改，归 93）。
8. **计数**：skills **18 → 18+N** 全枚举一致（双路扫描 + 差集逐处判类，零未判类）；agent **10 非翻转**（D9 登记）。
9. **承接**：REV 处置表三分结论（转主会话 / 台账保留 / 转 93）零灭失；D7 陈旧登记在位。
10. **收口**：`ops/**` 入精确 `git add`；终局报告四表（下沉清单 / 收编核对 / 断言差额 / 尺寸前后）+ 归档轮落点登记（kb 补沉 + manual 面去向）。

## 六、风险

| # | 风险 | 影响 | 缓解 |
|:-:|------|------|------|
| R-91-1 | **语义丢失**（40+4 文件重写 + 约 350 行下沉；「瘦身顺手丢规则」） | **高** | 收编清单**先成文后落文**（T1.1 / T2.4）+ 逐处核对表 + 差额对照 + 审查聚焦「语义等价」（大计划 R-1 缓解组合） |
| R-91-2 | **断言与落文不同批 / 假绿 / 红**（810 行断言面） | **高** | 先界定类再全量枚举同批修订；断言**直读源文件**（防未注入源假绿）；`rg` 原始输出留痕 |
| R-91-3 | **尺寸不达标或反弹** | 中 | 分档先定 + 新增尺寸断言锁定；重写分两轮（结构重排 → 逐节裁剪）；超标即回炉不降标准 |
| R-91-4 | **引用完整性破坏**（新 skill 未纳入生成物 / 索引悬空） | 中 | build 自动纳入（A6）+ 键集一致断言（`templates-migration.test.ts`）+ 新增悬空引用断言（T5.2） |
| R-91-5 | **计数翻转遗漏** | 中 | 表 D 全枚举 + 双路扫描（标准正则 + 宽词界）+ 差集判类；派生值 29 / 59 陷阱显式登记 |
| R-91-6 | **约束文件过度删减**（部署到用户全局，影响所有项目） | **中高** | 红线：最小必要约束集为判据；删减逐节核对（行为准则 / 安全边界零丢失）；审查逐节过签 |
| R-91-7 | **上下文治理虚述**（把宿主能力写成框架能力） | 中 | 可控 / 不可控分列留痕；不可控项禁「已实现」表述（kb #未来功能标注 先例） |
| R-91-8 | **跨 harness 对称破坏**（同语言两侧文案漂移 / 裸主语） | 中 | 四律 + 提取式切片断言（既有 S2 类）+ 新增关键节对称断言 |
| R-91-9 | **收编口径冲突**（wizard 值域误扩 3 值 / 旧措辞残留漏改） | 低 | REV-90-001 裁定口径登记（wizard 保持 2 项）；收编落点清单逐处核销 |
| R-91-10 | **越界改动**（改 frontmatter / 动 CLI / 触碰 92 面） | 中 | 边界 2 / 3 / 10 + diff 白名单；审查核对 produces 清单 |
| R-91-11 | 新增 skill 未标注能力边界（「提供版本」类） | 低 | 参照 cli-usage「快照声明」与 kb #未来功能标注 先例，按需标注 |

**回滚**：模板 / skill / 约束为纯文本变更（逐文件 `git revert`）；生成物随源回滚 + build 重生成；断言随源同批回滚；**无数据格式变更**（不触碰 `flow.json` 结构 / phase 枚举 / `--json` 契约）。

---

## 七、承接 REV 与处置表（REV-85-002 固化口径；判据源 = 上游台账文件）

- **判据源**：`.openfeel/users/Liuary/code_review/REV-90.md`（001~013）+ `REV-89.md`（008）+ `REV-86.md`（009 / 010）+ `REV-88.md`（010）+ `.openfeel/code_review/v1.2.1-stage-90.md`（遗留节）+ `.openfeel/bugs/req.md`（BUG-002）。

| 上游条目 | 优先级 | 去向 | 依据 |
|---------|:--:|------|------|
| **REV-90-011**（stage-90 `status.md` 状态未推进）/ **REV-89-008**（stage-89 同类） | low / medium | **转主会话**（CLI 补齐：`openfeel stage` / `openfeel flow`；executor / planner 无权推进 phase） | 流程态遗留非代码缺陷；本阶段零动作、登记不重复 |
| **REV-86-009**（测试保护力弱）/ **REV-86-010**（`session.json` 守卫缺位） | low ×2 | **台账保留·销账维持**（v1.2.1 收官轮〔93〕或 v1.3.0） | 非本阶段面（flow-manager 测试 / session 模块），零重复登记 |
| **REV-89-006 + E-89-6**（cli-usage 快照陈旧计数） | low | **维持转 stage-93**；本阶段 skill 面变动使其**进一步陈旧**（D7 登记） | 快照声明件口径（`SKILL.md:15`）随收官轮刷新；本阶段零触碰该文件 |
| **`req/BUG-002`**（`general` 需求恒无法 `done`） | medium | **维持转 stage-93 收口轮 / 后续裁定** | stage-90 测试官提交、归档处置「显著登记不静默丢弃」；本阶段零触碰 |
| REV-88-010 / REV-89-001~007 / 009 / REV-90-001~010 / 012 / 013 | — | **已闭合**（登记，零动作） | 台账实测全 `closed` |

- **本阶段新增承接面（收编来源，非 REV 台账）**：`skills/openfeel-get-stage-status/SKILL.md:71`（「subagent 不互调」残留措辞）+ `:18` / `:95`（值域行）+ `skills/openfeel-wizard/SKILL.md:18`（模式选型行复核）——来源 = stage-88 / 89 / 90 显式转出 + `.openfeel/code_review/v1.2.1-stage-90.md` 遗留节「收编去向」。
- **三分结论**：本阶段处置 **0**（上游无本阶段面 pending REV）/ 台账保留 **2**（REV-86-009 / 010）/ 显式转后续 **3**（REV-89-006 + E-89-6 + BUG-002；REV-90-011 与 REV-89-008 转主会话）→ **零灭失**成立。
- **产出清单双向偏差登记（供 `deps.yaml` 后续同步与阶段对账；同步由主会话执行，本 Agent 不直改）**：

| 面 | 条目 | 说明 |
|----|------|------|
| **增补面**（deps 缺 / 实际改动） | ① `src/core/templates-data/opencode/ADAPTER.{zh-CN,en}.md`（D6 计数载体）② `test/core/{templates-migration,update,setup,claude-adapter}.test.ts` ③ `.openfeel/plan/v1/stage-91/ops/**` | ①~③ 见 T5 / 表 D；`deps.yaml:145-165` 的 `produces_core` 已含 templates-data 全类与 `test/core/{templates,template-loader,claude-adapter,setup,update}.test.ts` + 双生成物 → 余项按上表增补 |
| **移除面**（deps 有 / 本阶段零触碰） | **无**（produces_core 全项在范围内） | — |
| **阴性面**（不在本轮改动清单） | `src/**` 非 templates-data 源码（除双生成物）、`src/core/i18n-data/**`、`docs/**`、`README*`、`CHANGELOG.md`、`.openfeel/manual/**`、`skills/openfeel-cli-usage/SKILL.md`（快照件 → 93）、`.openfeel/config.yaml`、`flow.json`、phase 枚举、`build.js`、`.openfeel/pipeline.yaml` | 按边界 3 / 10 隔离；既有断言与契约门锁定 |

## 八、op 拆分建议（供 openfeel-schemer 定稿；`est_ops = 4`）

| op | 内容 | 主要文件 | 依赖 |
|:--:|------|------|------|
| `op-001` | **T1 流程 → skill 下沉**：下沉清单成文（判据 + 逐处登记表）/ 新增 skill（候选 4：delegation / logging / memory / context-hygiene——Q2 定稿）/ 增补既有 skill（workspace / get-stage-status / tool-usage）/ **收编落点**（get-stage-status `:71`/`:18`/`:95`；wizard `:18` 复核）/ 约束工具化清单 / 新增 skill 单测与键集断言 / **build（skill 面注入）+ 计数翻转第一段** | `src/core/templates-data/skills/**`、`test/core/{templates-migration,template-loader}.test.ts`、`test/core/templates.test.ts`（skill 相关 describe）、`src/core/{template-loader.ts,update.ts}`（build 重生成） | — |
| `op-002` | **T2 40 agent 模板索引壳化重写**：索引壳范式（Q3）/ feel.md ×4（≤50%）/ subagent ×36 分档重写 / 收编核对表（87~90 语义逐处）/ frontmatter 零改动 / **既有断言同批修订第一卷**（`templates.test.ts` 各 describe 判类）/ **build（agent 面）+ 尺寸断言第一段** | `src/core/templates-data/{opencode,claude}/agents/**`（40 文件）、`test/core/templates.test.ts`、`test/core/{claude-adapter,template-loader}.test.ts`、双生成物 | **hard: op-001**（skill 名先定稿——索引节引用的 skill 须已存在；防悬空引用） |
| `op-003` | **T3 约束文件瘦身 + T4 上下文治理落文**：工作区结构节下沉（骨架模板 → skill）/ 最小必要约束集精简 / 上限收紧（Q8）/ 上下文治理指引（可控 / 不可控分列）/ 对称与图体断言保持 / **断言第二卷**（`template-loader.test.ts:135-151` 改写 + 上限断言）/ build | `src/core/templates-data/agents-md/*.md`、`src/core/templates-data/claude/constraint/*.md`、`src/core/templates-data/skills/openfeel-workspace/SKILL.md`（及 Q2 定稿的骨架归属 skill）、`test/core/{claude-adapter,template-loader}.test.ts`、双生成物 | **hard: op-001**（骨架 / 指引归属 skill 先落地） |
| `op-004` | **T5 门禁收口（阶段末 op）**：build ×2 幂等 / **新增三类静态断言**（尺寸 / 引用完整性 / 跨 harness 对称）全量版 / 计数翻转全枚举复核（表 D）/ 语义等价取证（收编核对 + 差额对照汇总 + 尺寸前后对照）/ 门禁全量 / `ops/**` 入管 / 终局报告 / 归档轮落点登记 | `test/core/{templates,templates-migration,setup,update}.test.ts`（收口断言）、`.openfeel/plan/v1/stage-91/ops/**`、`.openfeel/plan/v1/stage-91/status.md`（经 CLI 更新，勿手改） | **hard: op-001 / op-002 / op-003**（源码冻结后） |

- **文件冲突（`mutual_exclusion`）**：op-001 / 002 / 003 **共有** `templates-data/skills/**`（引用面 / 骨架归属）与双生成物（三次 build）→ **恒串行**；op-004 为收口（恒末位）。
- **op 级依赖与文件清单由 openfeel-schemer 落 `ops/deps.yaml`**（hard / soft / mutual_exclusion，声明实际文件名）。

## 九、修订记录

| 时间 | 制定人 | 说明 |
|------|--------|------|
| 2026-10-15 | openfeel-planner | 初稿：依据大计划 `.openfeel/plan/v1/v1.2.1/plan.md`（§二 表 E「模板与提示词」E1~E4 + §三 裁定 J/O + 附录 A「stage-91」+ §十 Q7）+ 设计 `docs/v1.2.1-design.md` §5（提示词瘦身）与 §1.5（上下文膨胀）+ `deps.yaml` stage-91 notes；源码 / 模板复核 **5 表 39 项**（载体与体量 A1~A9、下沉面 B1~B6、断言面 C1~C7、计数面 D1~D9、承接 E1~E6）；变更点 T1~T5；开放问题 Q1~Q7；风险 R-91-1~11；承接表（处置 0 / 保留 2 / 转出 3 + 新增承接面）；op 拆分 4 项。**只写本计划文档**（未改源码 / 未改 `deps.yaml` / 未直写 flow.json / 未推进 phase / 未写其它阶段文件）。 |
