# v1.1.7-stage-77 计划 — 文档与版本收口（v1.1.7 收官）

- **阶段**：`v1.1.7-stage-77`
- **依赖**：**hard: `v1.1.7-stage-76`**（模板与 skill 措辞已冻结，收口才有权威来源）
- **优先级**：P0（**版本收官阶段**：版本收口 op 须为最终 op）
- **制定人**：openfeel-planner ｜ **制定时间**：2026-10-11
- **定位**：① 文档多载体同步（fast 模式能力 + 新命令 + **默认 `auto_advance` 开启**的显著登记与迁移指引）；② manual 模块文档更新；③ **版本 1.1.6 → 1.1.7 全链路收口（A/B/C/D/E）**；④ **fast 隔离端到端验收**（临时项目跑通快线链）；⑤ roadmap/plan 回填。
- **范围**：`README.md` / `README.zh-CN.md` / `README.en.md`、`docs/GETTING_STARTED.md`、`docs/commands.md`、`CHANGELOG.md`、`.openfeel/manual/{core/config.md,core/flow-manager.md,cli/commands.md}`、版本载体（见 §三 A/B/C）、`src/core/templates-data/skills/openfeel-cli-usage/SKILL.md`（若 stage-76 未含版本快照）、`.openfeel/roadmap/v1.1.7.md`、`.openfeel/plan/index.md`、`.openfeel/plan/plan_log.md`。
- **边界**：不改 `src/**` 逻辑（除版本载体行与 build 重生成）；不改 CI；不改 `docs/phase-*/**` 与历史正文；不 `npm publish` / 不 `git push`；不推进 flow phase（由 Feel 执行）；不新增依赖。

## KB 检索（`openfeel-check-kb`）

- 已加载。**高度相关条目**：
  - `kb/patterns.md #版本号全链路收口清单模式` → A 类手工载体逐项、B 类 build 重生成（**禁手改**）、C 类传播、D 类禁改、E 类无载体；以**内容特征**判定（不以行号）。
  - `kb/patterns.md #多 harness 版本载体清单扩展` → **`claude/constraint/{zh-CN,en}.md` 为 v1.1.6 新增版本载体**（曾漏列，本阶段必须纳入 A 类清单）。
  - `kb/troubleshooting.md #`advanceAccepted` 被误述为「组合条件路径」` → 文档写「字段是什么」前**回读实现取真值**；`flow mode --json` / `flow phases --json` 的字段语义须各自标注（存在视图 / 推进白名单 / 模式表）。
  - `kb/patterns.md #CLI 自描述集合的「存在视图 vs 推进白名单」区分` → docs 中相位叙述不得混淆两类集合。
  - `kb/troubleshooting.md #默认开启写真实用户目录的副作用防护` → 端到端验收用**隔离 HOME + 临时项目**（`USERPROFILE`/`HOME`/`XDG_CONFIG_HOME` 三设），**严禁**触碰真实 `~/.openfeel`。
  - **无**「默认行为变更的迁移指引」条目 → 归档时补沉 patterns（首次出现「框架默认值变更」的登记与迁移写法）。

## 一、背景与实测证据

| 事实 | 位置 | 结论 |
|------|------|------|
| README×3 + GETTING_STARTED + commands 为既有文档载体 | 实测 | 沿用 v1.1.6-stage-72 的「多载体同步」清单扩展 |
| manual 模块文档：`core/config.md`（四键/级联）、`core/flow-manager.md`（双表/四键/健康检查）、`cli/commands.md`（新命令） | 实测 | 三份必须更新（归档时二次核对） |
| 版本载体 A 类 6 项（含 `claude/constraint`） | 大计划 §六 | 逐项收口 + `1.1.6` 残留 0 断言 |
| CHANGELOG 现最新 `[1.1.6]` | 实测 | 追加 `## [1.1.7]`（**显著登记默认值变更**） |
| 测试/门禁基线：1206 用例、`lint i18n` 774（可能被 stage-75 提升）、`lint kb` 396 引用 | 实测 | 收口时以**实测新基线**登记 |

---

## 二、目标语义（收口面）

| 面 | 改前 | 改后 |
|----|------|------|
| README×3 | v1.1.6 能力叙述 | 增「快速迭代模式（v1.1.7 起）」小节（fast 链 + `--workflow-mode` + `flow mode`）+ 版本横幅 v1.1.7 + 测试数实测更新 |
| docs/GETTING_STARTED | v1.1.6 快照 | 快照 v1.1.7 + 模式选择指引 + **默认自动推进开启**说明 |
| docs/commands.md | 三键 / 旧命令面 | 四键（`workflow_mode`）+ 新命令（`plan stage add --workflow-mode` / `stage set --workflow-mode` / `flow mode`）+ 快照 v1.1.7 |
| CHANGELOG | 最新 `[1.1.6]` | `## [1.1.7]`：**默认行为变更（`auto_advance` 默认 `enabled`）+ 新增 `workflow_mode`（默认 fast）+ 新命令 + fast 链**；含迁移指引 |
| manual | 三键口径 | 四键 + 双表 + 模式标记三层载体 + 健康检查项 |
| 版本 | 1.1.6 | **1.1.7**（A/B/C/D/E 全链路） |
| roadmap/plan | v1.1.6 收官状态 | v1.1.7（M29~M32 状态回填 + `plan/index.md` + `plan_log.md`） |

**不变量**：历史正文不改（`docs/phase-*/**`、CHANGELOG 既有条目）；版本收口 op 为最终 op；`VERSION` 常量不存在（`--version` 直读 `package.json`）。

---

## 三、变更点清单（编号 T）

### T1 — 文档多载体（README × 3 / GETTING_STARTED / commands）
- README×3：能力小节 + 版本横幅 + 测试数（实测）；**三份措辞一致**（zh-CN / en / 默认）。
- `docs/GETTING_STARTED.md`：快照升级 + 「模式选择」小节（如何选、如何切回、如何查）+ 默认 `auto_advance: enabled` 说明。
- `docs/commands.md`：`config`（四键与 `--sync-stages` 适用键增列）、`plan stage`、`stage set`、`flow mode`（含 `--json` 结构字段语义标注）。

### T2 — manual 三份
- `manual/core/config.md`：四键（`workflow_mode`）、`STAGE_FIELD_BY_CONFIG_KEY` 三映射、模板默认值（`auto_advance: enabled`）。
- `manual/core/flow-manager.md`：双表与**表选择单一权威**、`resolveStageWorkflowMode`、四键级联与来源、`flow mode` 出口、health 一致性 warn 项。
- `manual/cli/commands.md`：新命令与 `--json` 契约。
- 归档官二次核对：模块树「维护规则」表相关行（本阶段简述，归档时补齐）。

### T3 — 版本收口 1.1.6 → 1.1.7（A/B/C/D/E）
- **A 类（6 载体）**：`package.json`；`package-lock.json`（root ×2，**禁 `npm install` 重生成**）；`.openfeel/config.yaml`（`meta.version` 单行 edit）；`src/core/config.ts`（`CONFIG_TEMPLATE_ZH/EN` 各一处）；`src/core/templates-data/agents-md/{zh-CN,en}.md`；`src/core/templates-data/claude/constraint/{zh-CN,en}.md`。
- **B 类**：`npm run build` 重生成 `template-loader.ts`（**禁手改**）。
- **C 类**：`CHANGELOG.md` 追加 `## [1.1.7]`（含**默认值变更**与迁移指引）；`cli-usage` skill 快照 v1.1.7（若 stage-76 未含）。
- **D 类禁改**：`src/**` 历史批注、依赖自身版本、manual 变更历史、`test/**` 注释。
- **E 类无载体**：`docs/design-philosophy.md` 等。
- **断言**：A 类 `1.1.6` 残留 = 0（历史批注除外）；`--version` = `1.1.7` = `package.json`。

### T4 — fast 隔离端到端验收（**决定性**）
- 临时项目 + 隔离 HOME：`openfeel init` → `config set defaults.workflow_mode fast` → `plan stage add` →
  1. `plan_pending → plan_passed → exec_running → review_pending → review_failed → review_pending → review_passed → archiving → done` 全链 `advance` 成功；
  2. `--to plan_review` / `scheme_pending` / `test_pending` 被拒绝（exit 非 0）；
  3. `stage set <id> --workflow-mode full` 后 `plan_passed → scheme_pending` 可推进；
  4. `flow mode --json` 字段与来源正确；
  5. 全流程**无 `~/.openfeel` 真实目录写入**（隔离断言）。
- 记录为阶段报告的一部分（不新增脚本文件亦可，方案期定稿）。

### T5 — roadmap/plan 回填
- `roadmap/v1.1.7.md`：M29~M32 状态 + 归档日期 + 备注（含 Q1 实际走向）。
- `.openfeel/plan/index.md`：系列导航行（v1.1.7）+ 阶段对照表 4 行。
- `.openfeel/plan/plan_log.md`：变更摘要条目。

### T6 — 门禁与报告
`npm run build` ×2（幂等）→ `npm test`（0 skipped / 0 failed）→ `tsc` = 0 → `lint i18n` 实测新基线登记 → `lint kb` = 0 → `--version` = 1.1.7 → A 类残留 0 → 本仓 `config.yaml` / `flow.json` 结构零意外变更（仅 D-BOOT 预期行）。产门禁报告 + 自测报告（`.openfeel/tmp/`）。

---

## 四、验收要点（阶段级 = 版本级）

1. §三 T4 的 fast 端到端 5 项全部通过（**版本级决定性验收**）。
2. 文档多载体与 manual 与 CLI 输出**逐字一致**（相位/模式/字段语义三处抽检）。
3. 版本全链路：A 类残留 0、`--version` 1.1.7、CHANGELOG 含 `[1.1.7]` 与默认值变更登记。
4. 门禁全绿；默认非回归（full 路径输出逐字不变）。
5. roadmap/plan 回填完成（M29~M32）。

## 五、风险

| # | 风险 | 缓解 |
|:-:|------|------|
| R-77-1 | 默认值变更未显著登记 → 升级用户困惑 | CHANGELOG 独立小节 + GETTING_STARTED 迁移指引 |
| R-77-2 | 文档与实现口径分叉（历史教训） | 抽检回读实现取真值 + `lint kb` 引用校验 |
| R-77-3 | 版本载体漏项（如 claude/constraint 曾漏） | A 类 6 项清单化 + `1.1.6` 残留 0 断言 |
| R-77-4 | 端到端验收污染真实 HOME | 三环境变量隔离 + 前后快照比对 |
| R-77-5 | 版本收口 op 非最终 op | 收口项排为阶段末 op（方案期固定顺序） |

> 说明：op 级拆分（建议 op-001 T1/T2、op-002 T3、op-003 T4/T5/T6）由 openfeel-schemer 定稿并落 `ops/deps.yaml`。
