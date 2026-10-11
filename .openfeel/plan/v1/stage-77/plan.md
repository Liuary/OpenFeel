# v1.1.7-stage-77 计划 — 文档与版本收口（v1.1.7 收官）

- **阶段**：`v1.1.7-stage-77`
- **依赖**：**hard: `v1.1.7-stage-76`**（模板与 skill 措辞已冻结，收口才有权威来源）
- **优先级**：P0（**版本收官阶段**：版本收口 op 须为最终 op）
- **制定人**：openfeel-planner ｜ **制定时间**：2026-10-11
- **修订**：**rev2（2026-10-11，HEAD `482fda7`）**——按计划审查（`plan_review`）**REV-77-001~008 逐条落实**（1 blocking + 7 非阻塞）；本文全部引用行号以 HEAD `482fda7` 实测为准。
- **定位**：① 文档多载体同步（fast 模式能力 + 新命令 + **默认 `auto_advance` 开启**的显著登记与迁移指引）；② manual 模块文档**核对补漏**；③ **版本 1.1.6 → 1.1.7 全链路收口（A/B/C/D/E）**；④ **fast 隔离端到端验收**（临时项目跑通快线链）；⑤ roadmap/plan 回填。
- **范围**：`README.md` / `README.zh-CN.md` / `README.en.md`、`docs/GETTING_STARTED.md`、`docs/commands.md`、`CHANGELOG.md`、`.openfeel/manual/{core/config.md,core/flow-manager.md,cli/commands.md,index.md}`、版本载体（见 §三 A/B/C）、`src/core/templates-data/skills/openfeel-cli-usage/SKILL.md`（**实测已为 v1.1.7 快照，仅核对**）、`.openfeel/roadmap/v1.1.7.md`、`.openfeel/plan/index.md`、`.openfeel/plan/plan_log.md`。
- **边界**：不改 `src/**` 逻辑（除版本载体行与 build 重生成）；不改 CI；不改 `docs/phase-*/**` 与历史正文；不 `npm publish` / 不 `git push`；不推进 flow phase（由 Feel 执行）；不新增依赖。

## 修订记录（rev2 · REV-77-001~008 落实对照）

| REV | 优先级 | 审查意见 | 修订动作 | 落点 |
|-----|--------|----------|----------|------|
| 001 | medium（**blocking**） | `docs/commands.md` 覆盖面缺 2 项 v1.1.7 能力 | T1 增列 `flow phases --mode/--stage` + `--json` `workflowMode` 键（`:90-107`，`:100` 现状 5 键）与 `plan scheme create --from-tasks`（`:345-350`，`:350` 现状仅 `[--draft]`）；**同类别扫描引申**：`README.zh-CN.md:74` / `README.en.md:74`「JSON 顶层 5 键」一并更正 | §一 / §二 / T1 / §四 / 风险 R-77-6 |
| 002 | medium（非阻塞） | §一「实测证据」表基线陈旧 | 更正为实测值：用例 **1306**、`lint i18n` **796**、`lint kb` **425 引用**（2026-10-11 实测；T6 复核登记） | §一 / T6 |
| 003 | medium（非阻塞） | 「v1.1.6 起」能力引入标记须显式列入禁改（D 类） | D 类禁改清单补文档侧历史标记：审查列 4 处（`README.md:5`、`README.zh-CN.md:9`、`README.en.md:7`、`docs/GETTING_STARTED.md:47`）+ **全量扫描扩展 3 处节标题**（`README.md:33`、`README.zh-CN.md:63`、`README.en.md:63`）共 **7 处**；「残留 = 0」断言须白名单化 | T3 / §二不变量 / §四 / 风险 R-77-3 |
| 004 | low（非阻塞） | manual 三份已基本完成 | T2 改「**核对 + 补漏**」口径（`rg 'workflow_mode\|v1.1.7'` 抽查；实测四份均已含注记），避免重复改写 | §一 / §二 / T2 |
| 005 | low（非阻塞） | B 类生成段应含 `src/core/update.ts` | B 类改**双生成物**：`template-loader.ts` + `update.ts`（`build.js:23` / `:183-212` 注入 `SKILL_DEFINITIONS`）；其生成段内 `1.1.6` 历史能力条目属 D 类禁改 | §二 / T3 / T6 |
| 006 | low（非阻塞） | CI 快照路径数 | T6 增显式断言「`ci.yml` 快照路径数仍为 **5**」（`:39` / `:82` 两处 `for d in` 各 5 路径；`rg -c '"$HOME/\.claude"'` = 2 作对称锚点） | §一 / T6 / §四 |
| 007 | medium（非阻塞） | 升级指引须点明「存量项目新阶段回落 fast」 | CHANGELOG 增**存量升级迁移小节** + GETTING_STARTED 显式登记（未设 `defaults.workflow_mode` → builtin `fast` 静默生效）；给建议：存量 full 项目执行 `openfeel config set defaults.workflow_mode full` | §一 / §二 / T1 / T3 / §四 / 风险 R-77-1 |
| 008 | low（非阻塞） | README×3 一致性口径 | **明确裁定**：版本横幅**仅 `README.md:11` 承载**（v1.1.6 → v1.1.7）；`README.zh-CN.md` / `README.en.md` **不补横幅**——有意非对称（横幅为默认落地页独有元素；避免新增两处版本维护点）；断言 `rg -c "最新版本 v1\.1\." README*.md` = 1 | §二 / T1 / §四 |

## KB 检索（`openfeel-check-kb`）

- 已加载。**高度相关条目**：
  - `kb/patterns.md #版本号全链路收口清单模式` → A 类手工载体逐项、B 类 build 重生成（**禁手改**）、C 类传播、D 类禁改、E 类无载体；以**内容特征**判定（不以行号）。
  - `kb/patterns.md #多 harness 版本载体清单扩展` → **`claude/constraint/{zh-CN,en}.md` 为 v1.1.6 新增版本载体**（曾漏列，本阶段必须纳入 A 类清单）。
  - `kb/patterns.md #README 与实现同步的检查清单` → T1 收尾五面核对（测试数 / 命令表 / 架构图粒度 / 部署口径 / 旧版本号零残留），**zh/en 逐节同构**。[REV-77-001 修订·引申引用]
  - `kb/troubleshooting.md #新增输出键/契约的同步面清单` → 新增输出键（`workflowMode`）须逐载体核对——`docs/commands.md` 与 README 均属同步面。[REV-77-001 修订·引申引用]
  - `kb/troubleshooting.md #文档根因须实测复核` → 文档写「字段/能力」前**回读实现取真值**；`flow mode --json` / `flow phases --json` 字段语义各自标注（存在视图 / 推进白名单 / 模式表）。[REV-77-002 修订·引申引用]
  - `kb/troubleshooting.md #「advanceAccepted 被误述为组合条件路径」`（`:905`）→ `flow phases --json` 字段语义须与实现对齐（推进白名单 = 内置 15）；历史复现项（BUG-003 复发 / 5 键口径），与 T1 的字段语义标注直接相关。
  - `kb/patterns.md #CLI 自描述集合的「存在视图 vs 推进白名单」区分` → docs 中相位叙述不得混淆两类集合。
  - `kb/troubleshooting.md #默认开启写真实用户目录的副作用防护` → 端到端验收用**隔离 HOME + 临时项目**（`USERPROFILE`/`HOME`/`XDG_CONFIG_HOME` 三设），**严禁**触碰真实 `~/.openfeel`。
  - **无**「默认行为变更的迁移指引」条目 → 归档时补沉 patterns（首次出现「框架默认值变更」的登记与迁移写法；含 REV-77-007 的「存量回落」变体）。

## 一、背景与实测证据

（以下事实均为 2026-10-11 在 HEAD `482fda7` 实测）

| 事实 | 位置 | 结论 |
|------|------|------|
| README×3 + GETTING_STARTED + commands 为既有文档载体 | 实测 | 沿用 v1.1.6-stage-72 的「多载体同步」清单扩展 |
| manual 模块文档：`core/config.md`（四键/级联）、`core/flow-manager.md`（双表/四键/健康检查）、`cli/commands.md`（新命令）、`index.md` | 实测（`rg 'workflow_mode\|v1.1.7'`：config 6 / flow-manager 16 / commands 9 / index 3 命中） | **已含 v1.1.7 注记（stage-74/75 落定）→ 口径改为「核对 + 补漏」，不重复改写** [REV-77-004 修订] |
| 版本载体 A 类 6 项（含 `claude/constraint`），现值均 1.1.6 | 实测：`package.json:3` / `package-lock.json:3,9` / `config.yaml:7` / `config.ts:435,492` / `agents-md:134` / `claude/constraint:137` | 逐项收口 + `1.1.6` 残留 0 断言（**D 类 7 处历史标记白名单除外**，见 T3）[REV-77-003 修订] |
| CHANGELOG 现最新 `[1.1.6]` | 实测（`CHANGELOG.md:5`） | 追加 `## [1.1.7]`（**显著登记默认值变更 + 存量迁移小节**）[REV-77-007 修订] |
| 门禁基线（2026-10-11 实测） | 实测 | `npm test` **67 文件 / 1306 用例 0 skipped / 0 failed**；`lint i18n` **796 键**；`lint kb` 0（**425 引用**）；`--version` = 1.1.6 [REV-77-002 修订] |
| `docs/commands.md` 缺 2 项 v1.1.7 能力：`flow phases`（`:90-107`）仍 5 键（`:100`）/ `plan scheme create`（`:345-350`）无 `--from-tasks`（`:350`） | 实测 | **T1 增列**；`.openfeel/manual/cli/commands.md` 已含（`:81` / `:127`），不重复改 [REV-77-001 修订] |
| `README.zh-CN.md:74` / `README.en.md:74`（v1.1.2 新增能力节内）「JSON 顶层 5 键」同类别陈旧 | 实测 | 随 T1 一并更正为 6 键（追加 `workflowMode`）[REV-77-001 修订·同类别扫描] |
| B 类生成段为**双生成物**：`build.js:23`（`UPDATE_PATH`）+ `:183-212`（`generateSkillDefinitions` → `update.ts` `SKILL_DEFINITIONS`） | 实测（`update.ts:127-1596` AUTO-GENERATED 锚点区） | B 类补 `update.ts`；其生成段内 `1.1.6` 为历史能力条目（D 类禁改）[REV-77-005 修订] |
| `ci.yml:39/82` 两处 `for d in` 各含 **5 路径**；`rg -c '"$HOME/\.claude"' .github/workflows/ci.yml` = 2（左右对称锚点） | 实测 | v1.1.7 无新全局路径 → 「不改 CI」成立；T6 增路径数断言 [REV-77-006 修订] |
| 文档侧 `v1.1.6 起` / `since v1.1.6` 历史标记共 **7 处** | 实测（全量 `rg`） | `README.md:5,33`、`README.zh-CN.md:9,63`、`README.en.md:7,63`、`docs/GETTING_STARTED.md:47`；D 类禁改（审查列 4 处，扫描扩展 3 处节标题）[REV-77-003 修订] |
| README 版本横幅仅 `README.md:11` 一处；`README.zh-CN.md` / `README.en.md` 无横幅（自 stage-72 起非对称） | 实测 | **口径裁定：不补另两份**（有意非对称）；断言 = 1 [REV-77-008 修订] |
| 存量回落链：未设 `defaults.workflow_mode` → `resolveStageWorkflowMode` 至第四源 builtin（`config.ts:177` `workflow_mode: 'fast'`；`flow-manager.ts:2293` 兜底返回） | 源码实测 | 存量项目升级后**新建阶段静默变 fast**（无感行为变更）→ 迁移指引必备 [REV-77-007 修订] |
| `cli-usage` skill 快照已为 v1.1.7（`SKILL.md:15`；含 6 键口径 `:93`，stage-76 落定） | 实测 | T3 C 类该条件项降为**核对确认**（无需改写） |

---

## 二、目标语义（收口面）

| 面 | 改前 | 改后 |
|----|------|------|
| README×3 | v1.1.6 能力叙述 | 增「快速迭代模式（v1.1.7 起）」小节（fast 链 + `--workflow-mode` + `flow mode`）+ 测试数实测更新（zh-CN/en `:192`）+ **`README.zh-CN.md:74` / `README.en.md:74`「5 键」→ 6 键** [REV-77-001 修订]；**版本横幅：仅 `README.md:11` 更新为 v1.1.7，另两份不补（有意非对称）** [REV-77-008 修订] |
| docs/GETTING_STARTED | v1.1.6 快照（`:3`） | 快照 v1.1.7 + 模式选择指引 + **默认自动推进开启**说明 + **存量项目升级迁移指引**（未设 `defaults.workflow_mode` → 新阶段回落 `fast`；存量 full 项目建议 `openfeel config set defaults.workflow_mode full`）[REV-77-007 修订] |
| docs/commands.md | 旧命令面 | 四键（`workflow_mode`）+ 新命令（`plan stage add --workflow-mode` / `stage set --workflow-mode` / `flow mode` / **`flow phases --mode/--stage` + `--json` `workflowMode` 键** / **`plan scheme create --from-tasks`**）+ 快照 v1.1.7（`:3` / `:644`）[REV-77-001 修订] |
| CHANGELOG | 最新 `[1.1.6]` | `## [1.1.7]`：**默认行为变更（`auto_advance` 默认 `enabled`）+ 新增 `workflow_mode`（默认 fast）+ 新命令 + fast 链**；含**存量升级迁移小节**（点明「新阶段回落 fast」与恢复建议）[REV-77-007 修订] |
| manual | 三键口径 | **已含四键 + 双表 + 模式标记三层载体 + 健康检查项（stage-74/75）→ 核对 + 补漏** [REV-77-004 修订] |
| 版本 | 1.1.6 | **1.1.7**（A/B/C/D/E 全链路；**B 类双生成物** [REV-77-005 修订]） |
| roadmap/plan | v1.1.6 收官状态 | v1.1.7（M29~M32 状态回填 + `plan/index.md` + `plan_log.md`） |

**不变量**：历史正文不改（`docs/phase-*/**`、CHANGELOG 既有条目）；**文档侧能力引入标记（`v1.1.6 起` ×7）不改**（历史语义，D 类）[REV-77-003 修订]；版本收口 op 为最终 op；`VERSION` 常量不存在（`--version` 直读 `package.json`）。

---

## 三、变更点清单（编号 T）

### T1 — 文档多载体（README × 3 / GETTING_STARTED / commands）

- README×3：fast 模式能力小节 + 测试数（实测基线 1306）+ 措辞语义一致。
  - **版本横幅口径（明确裁定）**：**仅 `README.md:11` 承载**（v1.1.6 → v1.1.7）；`README.zh-CN.md` / `README.en.md` **不补横幅**——有意非对称（横幅为默认落地页独有元素；避免新增两处版本维护点；两份保持既有结构）。断言：`rg -c "最新版本 v1\.1\." README*.md` = 1 [REV-77-008 修订]。
  - `README.zh-CN.md:74` / `README.en.md:74`（v1.1.2 新增能力节内）「JSON 顶层 5 键」→ **6 键**（追加 `workflowMode`）[REV-77-001 修订·同类别扫描]。
- `docs/GETTING_STARTED.md`：快照升级（`:3` v1.1.6 → v1.1.7）+ 「模式选择」小节（如何选、如何切回、如何查）+ 默认 `auto_advance: enabled` 说明 + **存量项目升级迁移指引**：未设 `defaults.workflow_mode` 的存量项目升级后**新建阶段回落 builtin `fast`（无感行为变更）**；存量 full 流程项目建议执行 `openfeel config set defaults.workflow_mode full`（项目级默认；既有阶段按级联一并回落 full）[REV-77-007 修订]。
- `docs/commands.md`（快照 `:3` 与 `:644` 同步 v1.1.7；下述枚举与 `.openfeel/manual/cli/commands.md` 对齐——**manual 已落定，以其为参照，不重复改写 manual**）：
  - `config`（`:505-516`）：四键与 `--sync-stages` 适用键增列（`workflow_mode` → `工作流模式`；`:516` 现仅列 `auto_advance`/`execution_mode`）+ `--stage` 作用域；
  - `plan stage`（`:293-317`）：补 `--workflow-mode`（`:298` 语法行）；
  - `stage set`（`:594-602`）：补 `--workflow-mode`（插入语义）；
  - `flow mode`：**新增小节**（`flow mode [--stage <id>] [--json]`；`--json` 字段 `{ schemaVersion, stage, mode, source, modes }` 语义标注——`source` 四源枚举 `status.md`/`config.yaml`/`profile.yaml`/`builtin`）；
  - **`flow phases`（`:90-107`）：补 `--mode/--stage` 选项（`:95` 语法行）+ `--json` 追加 `workflowMode` 键（`:100` 现为 5 键逐字 → 改为 6 键并注明「既有五键语义逐字不变」）** [REV-77-001 修订]；
  - **`plan scheme create`（`:345-350`）：补 `--from-tasks`（与 `<title>` 互斥、op 骨架机械铺、零 Agent 调用；`:350` 现仅 `<stage> <title> [--draft]`）** [REV-77-001 修订]。

### T2 — manual：**核对 + 补漏**（不重复改写）[REV-77-004 修订]

- `manual/core/config.md` / `manual/core/flow-manager.md` / `manual/cli/commands.md` / `manual/index.md` **已含 v1.1.7 注记（stage-74/75 落定，2026-10-11 实测）**：
  - 核对法：`rg 'workflow_mode|v1.1.7' .openfeel/manual/` 抽查——配置四键 / 双表与表选择单一权威 / `resolveStageWorkflowMode` / `flow mode` 出口 / health 第 10 项 warn / 新命令与 `--json` 契约 / 索引「维护规则」行；
  - **仅补漏**：与 `--help` / 源码逐字一致即不动；发现缺失或失真才就地修正。
- 归档官二次核对：模块树「维护规则」表相关行（本阶段简述，归档时补齐）。

### T3 — 版本收口 1.1.6 → 1.1.7（A/B/C/D/E）

- **A 类（6 载体）**：`package.json:3`；`package-lock.json`（`:3` / `:9`，**禁 `npm install` 重生成**）；`.openfeel/config.yaml:7`（`meta.version` 单行 edit）；`src/core/config.ts`（`:435` / `:492`，`CONFIG_TEMPLATE_ZH/EN` 各一处）；`src/core/templates-data/agents-md/{zh-CN,en}.md`（`:134`）；`src/core/templates-data/claude/constraint/{zh-CN,en}.md`（`:137`）。
- **B 类（双生成物）**：`npm run build` 重生成 `template-loader.ts` **+ `src/core/update.ts`**（`update.ts` 由 `build.js:23` / `:183-212` 注入 `SKILL_DEFINITIONS`；**两者均禁手改**）[REV-77-005 修订]。
- **C 类**：`CHANGELOG.md` 追加 `## [1.1.7]`（含**默认值变更**、**存量升级迁移小节**与迁移指引 [REV-77-007 修订]）；`cli-usage` skill 快照 **已为 v1.1.7（`SKILL.md:15` 实测）→ 核对确认**（无需改写）。
- **D 类禁改**：`src/**` 历史批注（含 `update.ts` 生成段内 `1.1.6` 历史能力条目 [REV-77-005 修订]）、依赖自身版本、manual 变更历史、`test/**` 注释；**文档侧能力引入标记 7 处**（`README.md:5,33`、`README.zh-CN.md:9,63`、`README.en.md:7,63`、`docs/GETTING_STARTED.md:47` —— `v1.1.6 起` / `since v1.1.6` 历史语义，**禁随「1.1.6 残留 = 0」被替换**）[REV-77-003 修订（审查列 4 处，全量扫描扩展至 7 处）]。
- **E 类无载体**：`docs/design-philosophy.md` 等。
- **断言**：A 类 `1.1.6` 残留 = 0（**D 类 7 处历史标记白名单除外**——禁广谱替换，须逐处判读 [REV-77-003 修订]）；`--version` = `1.1.7` = `package.json`。

### T4 — fast 隔离端到端验收（**决定性**）

- 临时项目 + 隔离 HOME：`openfeel init` → `config set defaults.workflow_mode fast` → `plan stage add` →
  1. `plan_pending → plan_review → plan_passed → exec_running → review_pending → review_failed → review_pending → review_passed → archiving → done` 全链 `advance` 成功（**`plan_review` 为必经节点**）[需求变更 2026-10-11 修订]；
  2. `--to scheme_pending` / `test_pending` 被拒绝（exit 非 0）；**`--to plan_review` 可推进（必经）**；自 `plan_pending` 的 `--to plan_passed` **不能直达**，CLI 沿唯一路径**两跳经 `plan_review`**（`plan_review` 为必经中间态）[REV-77-011 修订] [需求变更 2026-10-11 修订]；
  3. `stage set <id> --workflow-mode full` 后 `plan_passed → scheme_pending` 可推进；
  4. `flow mode --json` 字段与来源正确；
  5. 全流程**无 `~/.openfeel` 真实目录写入**（隔离断言）。
- 记录为阶段报告的一部分（不新增脚本文件亦可，方案期定稿）。

### T5 — roadmap/plan 回填

- `roadmap/v1.1.7.md`：M29~M32 状态（状态表 `:72-75` 现状 planned）+ 归档日期 + 备注（含 Q1 实际走向）。
- `.openfeel/plan/index.md`：系列导航行（v1.1.7，`:16`）+ 阶段对照表 4 行（`:101-104`）。
- `.openfeel/plan/plan_log.md`：变更摘要条目。

### T6 — 门禁与报告

`npm run build` ×2（幂等；**双生成物 `template-loader.ts` + `update.ts` 均零差异核验** [REV-77-005 修订]）→ `npm test`（0 skipped / 0 failed；用例数实测登记，**基线 1306**）→ `tsc` = 0 → `lint i18n` 实测登记（**基线 796 键**）→ `lint kb` = 0（**基线 425 引用**）→ `--version` = 1.1.7 → A 类 `1.1.6` 残留 0（D 类 7 处白名单除外）→ **`ci.yml` 快照路径数仍为 5**（`:39` / `:82` 两处 `for d in` 各 5 路径；`rg -c '"$HOME/\.claude"' .github/workflows/ci.yml` = 2 作左右对称计数锚点——v1.1.7 无新全局路径、CI 不改）[REV-77-006 修订] → 本仓 `config.yaml` / `flow.json` 结构零意外变更（仅 D-BOOT 预期行）。产门禁报告 + 自测报告（`.openfeel/tmp/`）。

> 基线三项（1306 / 796 / 425）均为 2026-10-11 实测值 [REV-77-002 修订]；T6 以**当时实测**复核登记（如有变动须说明来源）。

---

## 四、验收要点（阶段级 = 版本级）

1. §三 T4 的 fast 端到端 5 项全部通过（**版本级决定性验收**）。
2. 文档多载体与 manual 与 CLI 输出**逐字一致**（相位/模式/字段语义三处抽检）；**`docs/commands.md` 覆盖面含 `flow phases --mode/--stage` + `workflowMode` 键与 `plan scheme create --from-tasks`**；**`README.zh-CN.md:74` / `README.en.md:74`「5 键」已更正为 6 键** [REV-77-001 修订]。
3. 版本全链路：A 类残留 0（**D 类 7 处历史标记白名单除外** [REV-77-003 修订]）、`--version` 1.1.7、CHANGELOG 含 `[1.1.7]` 与默认值变更登记 + **存量升级迁移小节** [REV-77-007 修订]。
4. 门禁全绿；默认非回归（full 路径输出逐字不变）；**`ci.yml` 快照路径数 = 5 断言通过** [REV-77-006 修订]。
5. roadmap/plan 回填完成（M29~M32）。
6. **README 横幅口径断言：`rg -c "最新版本 v1\.1\." README*.md` = 1（仅 README.md:11）** [REV-77-008 修订]。

## 五、风险

| # | 风险 | 缓解 |
|:-:|------|------|
| R-77-1 | 默认值变更未显著登记 → 升级用户困惑；**存量项目新建阶段静默回落 builtin `fast`（无感行为变更：`config.ts:177` → `flow-manager.ts:2293`）** [REV-77-007 修订] | CHANGELOG 独立迁移小节 + GETTING_STARTED 显式登记 + **建议存量 full 项目执行 `openfeel config set defaults.workflow_mode full`** |
| R-77-2 | 文档与实现口径分叉（历史教训） | 抽检回读实现取真值 + `lint kb` 引用校验 |
| R-77-3 | 版本载体漏项（如 claude/constraint 曾漏）；**「残留 = 0」误伤历史标记** [REV-77-003 修订] | A 类 6 项清单化 + **D 类 7 处白名单** + `1.1.6` 残留 0 断言（排除白名单后逐处判读） |
| R-77-4 | 端到端验收污染真实 HOME | 三环境变量隔离 + 前后快照比对 |
| R-77-5 | 版本收口 op 非最终 op | 收口项排为阶段末 op（方案期固定顺序） |
| R-77-6 | **docs 载体缺 v1.1.7 能力（REV-77-001 曾漏 2 项）** [REV-77-001 修订] | T1 全量枚举（与 `manual/cli/commands.md` 逐条对齐）+ 收尾 `rg` 关键键名（`workflowMode` / `from-tasks` / `--workflow-mode` / `flow mode`）在 `docs/commands.md` 的命中核对 |

> 说明：op 级拆分（**建议** op-001 T1/T2、op-002 T3、op-003 T4/T5/T6；**版本收口 op 须为最终 op**）由 openfeel-schemer 定稿并落 `ops/deps.yaml`。**实况以 `ops/deps.yaml` 为准**——最终拆分 = op-001（T1/T2）→ op-002（T4 E2E）→ op-003（T3+T5+T6，版本收口最终 op）[REV-77-017 订正]。
