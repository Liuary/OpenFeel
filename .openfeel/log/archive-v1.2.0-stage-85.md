# 归档摘要 — v1.2.0-stage-85

- **归档时间**：2026-10-13
- **阶段名称**：v1.2.0-stage-85（文档与版本收口 — **v1.2.0 收官 · 最终阶段**，双主题）
- **阶段状态**：archiving → done
- **依赖阶段**：hard `v1.2.0-stage-84`（Agent/skill 契约，已归档冻结面）
- **下游**：无（**版本最终阶段**；v1.2.0 八阶段全闭环）
- **基线**：HEAD `9b8d839`（本阶段未 commit）
- **归档人**：openfeel-archiver

## 阶段目标

把 v1.2.0 双主题（需求流转 / 归档拆分）收口为**可发布状态**：① 文档多载体同步（README×3 **按三载体差异** / GETTING_STARTED / commands / cli-usage 核对）+ manual **核对/最小补正 + 真新增 `cli/req.md`**；② `CHANGELOG [1.2.0]`；③ 版本 **1.2.0** 全链路 A/B/C/D/E（含 B 类**双生成物**、D 类白名单 **file:line 枚举**）；④ 双主题端到端验收（归档实跑 / 常规路径零触碰 / 跨版本 deps / 需求全生命周期 / 认领并发 / 向后兼容 / 正交性）；⑤ roadmap/plan 回填；⑥ 承接 REV 处置（**20 条**）+ 根因固化（T7① `kb/patterns.md` 子条款）；⑦ 陈旧计数 17→18 全量翻转。

## 操作产出

| ID | 标题 | 状态 | Commit |
|----|------|------|--------|
| op-001 | 文档多载体与 manual（README×3 / docs×2 / manual 核对补正 + 真新增 `cli/req.md` + 陈旧计数文档侧 20 必改 + cli-usage 节序降序） | done | —（未提交） |
| op-002 | 承接 REV 处置与根因固化（T6+T7①；src 侧陈旧计数 6 + ADAPTER×2 / 断言稳定化 `norm()` / 前置集订正 / `kb/patterns.md` 子条款） | done | —（未提交） |
| op-003 | 版本 1.2.0 全链路收口与终局验收门禁（T3+T4+T5+T7②；**阶段最终 op**） | done | —（未提交） |

> 注：executor 按 `ops/deps.yaml`「不 commit」约定，产出停留工作区（HEAD 恒 `9b8d839`，**本阶段未 commit**）；执行序 = `op-001 → op-002 → op-003`（严格串行，**收口 op-003 = 最终 op**）。审查：plan_review **fail（2 blocking + 6 非阻塞）→ 修订 → pass** / scheme_review **fail（1 blocking + 2 非阻塞）→ 修订 ×2 → pass** / code_review（pass，0 阻塞 + 1 非阻塞）。验收 **通过、0 Bug**。

## 改动文件

- **文档五载体**：`README.md`（**唯一版本横幅** `:11` → v1.2.0 + `## v1.2.0 新增能力` 节 + `:38` skills 17→18）/ `README.zh-CN.md` / `README.en.md`（能力节 + 测试数行 1557/70 + 命令表补 `flow archive`/`req` + skills 17→18）/ `docs/GETTING_STARTED.md`（快照 v1.2.0 + `### 5.5 版本归档` + `### 5.6 需求流转` + 升级说明）/ `docs/commands.md`（快照 + `flow archive` 三子节 + `## req — 需求流转` 节 + 尾注）。
- **`src/core/templates-data/skills/openfeel-cli-usage/SKILL.md`**：「新增能力」节序由 v1.1.6→v1.1.7→v1.2.0 重排为 **v1.2.0 → v1.1.7 → v1.1.6**（三节标题/正文逐字不动，仅块序；REV-84-013）。
- **manual**：**新建 `.openfeel/manual/cli/req.md`**（cli 4→5；10 子命令 + `--json` 契约 + 退出码 0/1/2 + help 键双规 + 与 `core/req.md` 引擎面分工）；`core/flow-archive.md`（零改写）/ `core/req.md`（+ REV-83-016 已知边界 bullet）/ `cli/commands.md`（+ REV-83-016 一行 + skills 17→18）/ `index.md`（补登 `cli/req.md` + 计数 17→18）。
- **陈旧计数全量翻转 17→18**：文档面 **必改 20**（标准 18 + 表格式 2〔`manual/core/setup.md:33`/`:37`〕）；src 手写区 6（`setup.ts:3`/`:57`/`:106`/`:120` + `update.ts:1981`/`:1998`）；死资产 `ADAPTER.{zh-CN,en}.md` ×2（+ 列表补 `openfeel-req`）。
- **版本载体 A 类（6 类 / 8 文件 / 10 处）**：`package.json:3` / `package-lock.json`（root `:3`+`:9`，禁 `npm install`）/ `.openfeel/config.yaml:7`（单行）/ `src/core/config.ts:435`+`:492` / `agents-md/{zh-CN,en}.md:134` / `claude/constraint/{zh-CN,en}.md:137`。
- **B 类双生成物**：`src/core/template-loader.ts` + `src/core/update.ts`（`npm run build` 重生成，禁手改）。
- **前置集订正（REV-84-015）**：`openfeel-req/SKILL.md:32` + `feel.md`×4 需求「自动收口 done」补前置集限定 `{scheduled, in_progress}`（同语言跨 harness 逐字一致）。
- **测试**：`test/core/templates.test.ts`（文件级 `norm()` EOL 归一 + feel/planner 两 describe 套 `norm()`；`SKILLS` 5→6 + T53 标签「5 skill」→「6 skill」）。
- **`CHANGELOG.md`**：追加 `## [1.2.0] - 2026-10-13`（Added / Changed「无默认行为变更」/ 兼容说明 / Documentation）。
- **回填**：`.openfeel/roadmap/v1.2.0.md` + `.openfeel/plan/v1/v1.2.0/plan.md`（T7② 纪律行 + 命名订正）。
- **方案层**：`.openfeel/plan/v1/stage-85/ops/{deps.yaml,op-001~003.md}`；临时报告 `.openfeel/tmp/stage-85-{doc,closeout,final}-report.md` + 脚本 `stage-85-acceptance.mjs`（工作区，不入版本管理）。

## 关键不变量（设计裁定与实测）

| 不变量 | 内容 | 实证 |
|--------|------|------|
| **行为零变更** | 仅文档 + 版本载体 + 注释/断言稳定化；不改命令行为/控制流/契约 | 承接处置仅限注释/文档订正 + 断言稳定化 + 台账销账；`flow.phases`/`advance` 接受集逐字不变（`phases=15`/`advanceAccepted=15`） |
| **B 类双生成物** | `template-loader.ts` + `update.ts` 由 build 重生成（禁手改） | build ×2 sha1 前后一致 + `git status --porcelain src/` 变更行 ⊆ produces |
| **残留=0（白名单化）** | A 类旧版本 `1.1.7` 残留 = 0；`src/` 全量剩余命中 ⊆ D 类白名单（**file:line 枚举，禁广谱 sed**） | A 类载体 `rg` 零命中；`src/` 剩余 = **21 处** ⊆ 登记白名单（12 示例/注释 + 3 历史标记 + 6 生成物副本） |
| **版本收口 op = 最终 op** | T3（版本全链路）与 T5（门禁）**同 op（op-003）**；改后至阶段结束零代码改动 | REV-85-006 定稿；op-003 为最终 op |
| **manual 与实际一致 + 命名唯一** | `core/req.md` 为需求模块唯一名；**禁新建 `core/requirement.md`** | `cli/req.md` 真新增；`core/requirement.md` 不存在 |
| **端到端双主题闭环** | 归档实跑 + 需求全生命周期 + 正交性 + 向后兼容 | 隔离脚本 **ALL PASS**（0 FAILURES）+ 本仓复核（9 组归档） |
| **承接零灭失** | 承接表 **20 条**（REV-84-006~015 ×10 + REV-83-015~018 ×4 + REV-83-009~014 ×6）逐条去向可核 | op-002 收口报告 ② + op-003 复核 |

## 审查记录

### 计划审查轮（plan_review，2026-10-13，首轮 fail：2 blocking + 6 非阻塞 → 修订 → pass）

| ID | 标题 | 状态 | 优先级 |
|----|------|------|--------|
| REV-85-001 | 承接上游 pending REV 零交代（**第 6 次复发**） | **closed** | high（**blocking**） |
| REV-85-003 | T2 manual 交付项与实况冲突（拟新建 `core/requirement.md`） | **closed** | high（**blocking**） |
| REV-85-002 | 承接零交代根因修复未纳入收口 | closed | medium |
| REV-85-004 | A 类「`1.1.7` 残留=0」白名单未枚举 | closed | medium |
| REV-85-005 | §一 manual「core 21 份」陈旧 → 实测 24 份 | closed | low |
| REV-85-006 | 「收口 op 为最终 op」与 op 拆分矛盾 | closed | medium |
| REV-85-007 | `cli-usage/SKILL.md` 快照 v1.2.0 已落地仍列「待更新」 | closed | low |
| REV-85-008 | T1 称 README×3 均改「版本横幅」——实测仅 1 处 | closed | low |

### 计划复审（修订验收，2026-10-13，结论 pass：001~008 全闭合 + 新增 1 条）

| ID | 标题 | 状态 | 优先级 |
|----|------|------|--------|
| REV-85-009 | `produces_core` 与计划「范围」不对齐（纯声明性元数据） | **closed（归档轮收口销账）** | low |

### 方案审查轮（scheme_review，2026-10-13，结论 fail：1 阻塞 + 2 非阻塞）

| ID | 标题 | 状态 | 优先级 |
|----|------|------|--------|
| REV-85-010 | 陈旧计数枚举遗漏 `manual/core/setup.md` + 该文件不在 produces | **closed** | medium（**blocking**） |
| REV-85-011 | op-002 §2.4 T53 标签「5 skill」未随 `SKILLS` 5→6 同步 | closed | low |
| REV-85-012 | kb 当前行为「17 skill」转归档轮须落实 | closed | low |

### 方案复审（修订验收，2026-10-13，结论 fail：010~012 闭合 + 新增 2 条）

| ID | 标题 | 状态 | 优先级 |
|----|------|------|--------|
| REV-85-013 | op-001 §1.7 漏 `manual/core/setup.md:33`/`:37` 表格式陈旧计数（静默漏改） | **closed** | medium（**blocking**） |
| REV-85-014 | §1.7「非扫描历史特征 2」不完整（另有 3 处历史零触碰） | closed | low |

### 方案复审（修订验收，2026-10-13，结论 pass：013~014 闭合 + 新增 2 条）

| ID | 标题 | 状态 | 优先级 |
|----|------|------|--------|
| REV-85-015 | op-001 §1.7 枚举计数不自洽（标准扫描/保留/全集三处） | **closed（执行期落实）** | low |
| REV-85-016 | `docs/claude-code-adapter-plan.md:271` 误标「双模式均不可见」 | **closed（执行期落实）** | low |

### 代码审查轮（code_review，2026-10-13，结论 pass：0 阻塞 + 1 非阻塞）

| ID | 标题 | 状态 | 优先级 |
|----|------|------|--------|
| REV-85-017 | `openfeel-cli-usage` 权威源未同步「需求自动收口」前置集限定 | **pending（转下一版本）** | low |

> 结论：**passed（全 17 条：closed 16 / pending 1，0 blocking 遗留）**。归档官处置：REV-85-009/015/016 收口销账；**REV-85-017 转下一版本**（收口期 `src/core/templates-data/**` 冻结 + 最终 op 零代码改动不变量，非阻塞）。

## 缺陷记录

| ID | 标题 | 状态 | 优先级 |
|----|------|------|--------|
| — | 本阶段**无新增 Bug** | — | — |

> 测试官正式验收 **通过（0 Bug）**。

## 门禁

- `npm run build` ×2 → 幂等（两次 sha1 前后一致 + `git status --porcelain src/` 快照 S2 === S1）
- `npm test` **70 文件 / 1557 用例 0 skipped / 0 failed**
- `npx tsc --noEmit` → exit 0
- `OPENFEEL_LOG=0 node bin/openfeel.js lint i18n` → **911**（不变；本阶段无新键）
- `OPENFEEL_LOG=0 node bin/openfeel.js lint kb` → **0**（530 引用零过期）
- `node bin/openfeel.js --version` → **1.2.0** == `package.json.version`
- A 类残留 = 0；`src/` 全量剩余命中 = 21 ⊆ D 类白名单
- HEAD 恒 `9b8d839`（零 commit）

## 知识沉淀

| 分类 | 标题 | 动作 |
|------|------|------|
| patterns | 版本号全链路收口清单模式：A/B/C/D/E …（追加 v1.2.0-stage-85 更新注记：A 6 载体/8 文件/10 处 + B 双生成物 + D file:line 白名单 + 收口 op = 最终 op） | **更新** |
| patterns | 陈旧计数「全枚举」纪律：标准正则 + 宽词界双路扫描 + 表格式计数差集 + 分层判类 | 新增 |
| patterns | 双主题收官端到端验收范式：隔离临时项目脚本 + 本仓复核二分 | 新增 |
| patterns | 跨阶段承接 REV 与处置表（子条款「全量审查的发现分类与流转裁定」追加） | **本阶段已落**（T7①，op-002；归档轮登记，不重复新增） |

> 去重（`node bin/openfeel.js knowledge dedup`）：① 版本号全链路收口 → 最高 **6.2%**（同类条目「文档侧历史标记纳入版本收口禁改白名单」）→ 判**更新**（追加于既有「版本号全链路收口清单模式」条目）；② 陈旧计数全枚举 → 最高 **1.2%**；③ 双主题验收 → **无相似条目**，均 ≪ 80% → ②③ 判**新增**；④ 承接 REV 根因固化已由 op-002 落地（本归档轮不重复新增）。kb 分类计数：architecture 42（不变）、patterns 178→**180**、troubleshooting 61（不变）。

## kb 当前行为计数订正（REV-85-012 / op-002 §2.10 ⑥）

- **订正（当前行为描述 17 → 18）**：`kb/architecture.md:723`（编排面 claude 分支）/ `kb/index.md:66`（supersede N1 摘要部署口径）/ `kb/index.md:71`（多 harness 部署编排架构摘要行）——**本轮已实际订正**。
- **保留（历史记录/叙事引用，零触碰）**：`kb/architecture.md:382`/`:387`/`:411`/`:633`、`kb/index.md:16`（历史里程碑链）/`:212`/`:334`/`:358`/`:367`/`:371`、`kb/troubleshooting.md:1208`、`kb/patterns.md:3112`。

## manual 更新

- **`manual/index.md`**：模块树 CLI 层已含 `cli/req.md`（op-001 落地）；维护规则「skill 体系」行 skill 计数 **18** 在位——**归档核对无补充**。
- **`manual/cli/req.md`**（新建）/ `manual/core/req.md` / `manual/cli/commands.md`（flow archive + req 节 + REV-83-016 标注）：op-001 落地，归档核对无补充。
- **`manual/agents/feel.md`**：未改（Agent 数量 / 模型 / 调度规则未变）。

## 遗留与下游

- ★ **flow 状态推进**：`v1.2.0-stage-85` → `done`（**由主会话** Feel 经 `openfeel flow advance --stage v1.2.0-stage-85 --to done` 执行；archiver 不直写 flow.json）。`archive_stage` 由该 advance 补记。
- **REV 遗留（1 条 pending 非阻塞，0 blocking）**：**REV-85-017**（`openfeel-cli-usage` 权威源前置集限定）**转下一版本**（收口期模板源冻结 + 最终 op 零代码改动不变量）。
- **Bug 遗留**：无。
- **承接闭环**：承接表 **20 条**（REV-84-006~015 ×10 / REV-83-015~018 ×4 / REV-83-009~014 ×6）逐条去向可核，**零灭失**。
- **兼容承诺**：本阶段**零源码行为变更**；旧 flow.json（无 `requirements`/`archived_versions`）全命令零报错、升级无需迁移；`workflow_mode` 正交。
- **版本事实**：`--version` == `package.json.version` == **1.2.0**；`CHANGELOG [1.2.0]` 已追加。
- **未 commit / 未 push / 未 publish**（由 Feel/用户执行）。

> 归档方式：手工生成摘要（沿用先例，**未运行 `openfeel archive <stage>` CLI** 以避免其副作用；`archive_stage` 由 Feel 的 `flow advance --to done` 补记）。
