# 归档摘要 — v1.2.0-stage-84

- **归档时间**：2026-10-13
- **阶段名称**：v1.2.0-stage-84（Agent/skill 契约 — **双主题**）
- **阶段状态**：archiving → done
- **依赖阶段**：hard `v1.2.0-stage-82`（需求命令面）+ `v1.2.0-stage-83`（需求聚合语义，均已归档冻结面）；下游 = `v1.2.0-stage-85`（文档与版本收口，消费本阶段 Agent 契约与 skill）
- **归档人**：openfeel-archiver

## 阶段目标

把 v1.2.0 双主题（需求流转 / 归档拆分）语义落为**第 ② 位读者（Agent）的行为契约与 skill 权威源**——① `feel.md`×4（2 harness × 2 语言）：新增「需求流转（requirement lifecycle）」+「归档与历史读取」两节；② `openfeel-planner.md`×4：新增「需求感知」节；③ **新建** skill `openfeel-req`（需求流转用法权威源单文件）；④ `openfeel-cli-usage` skill 补 `req` / `flow archive` 两节 + 六处修订；⑤ build 重生成**双生成物**（`template-loader.ts` + `update.ts`，禁手改）+ 静态断言（S1~S5）+ **skills 计数 17→18 全量翻转**。

## 操作产出

| ID | 标题 | 状态 | Commit |
|----|------|------|--------|
| op-001 | `feel.md`×4 需求与归档纪律（节锚点插入；zh/en 各自跨 harness 切片字节等值） | done | —（未提交） |
| op-002 | `openfeel-planner.md`×4 需求感知 + 新建 `openfeel-req` skill + `openfeel-cli-usage` 六处修订 + build 重生成 + skills **17→18** 计数翻转全量 | done | —（未提交） |
| op-003 | 静态断言补点（`templates.test.ts` S1~S5）+ T5 全门禁 + 承接闭环核验（**阶段收口 op**） | done | —（未提交） |

> 注：executor 按 `ops/deps.yaml`「不 commit」约定，产出停留工作区（HEAD `ab60cb6`，**本阶段未 commit**）；执行序 = `op-001 → op-002 → op-003`（严格串行）。审查：plan_review **fail（2 blocking + 3 非阻塞）→ 修订 → pass** / scheme_review（pass）/ code_review（pass）。验收 **通过、0 Bug**。

## 改动文件

- **`src/core/templates-data/opencode/agents/{zh-CN,en}/feel.md`** + **`src/core/templates-data/claude/agents/{zh-CN,en}/feel.md`**（8 份中的 4 份 feel；**节锚点插入**）：新增「需求流转（requirement lifecycle）」节（四层模型 / 需求=排期与调度层 / 7 状态 / 认领协议 / 聚合由阶段驱动 / `req` 命令示例 / `workflow_mode` 正交注记一行）+「归档与历史读取」节（版本收官提示 `flow archive <version>`、**不主动读 `.openfeel/flow-archive/**`**、按需 `flow archive show`）。**同语言跨 harness 切片逐字等值**（提取式对称）。
- **`src/core/templates-data/opencode/agents/{zh-CN,en}/openfeel-planner.md`** + **`src/core/templates-data/claude/...`**（4 份）：新增「需求感知（Requirement Awareness）」节（`req show` 读取 / `plan.md` 标注「关联需求：REQ-NNN」/ 需求状态流转不在 planner 职责内 / 与「工作流模式感知」正交）。
- **`src/core/templates-data/skills/openfeel-req/SKILL.md`**（**新建**）：frontmatter（description 含需求 / requirement / REQ / req 触发词）+ 正文（生命周期 / 7 状态 / 10 子命令 / 认领协议 / `REQ-NNN.md` 正文与权威源 / 与计划关系 / 正交 / 「v1.2.0 起提供」/ 快照声明）。**中立共享源单文件、中文单语**。
- **`src/core/templates-data/skills/openfeel-cli-usage/SKILL.md`**（**六处修订**）：description / 快照版本（v1.2.0）/ 命令速查行 / `flow` 子命令行 / **`:52` 陈旧计数「17 个共享源」→ 18** / 新增「v1.2.0 新增能力（stage-78~84）」节。
- **`src/core/template-loader.ts`** + **`src/core/update.ts`**（**build 重生成双生成物，禁手改**）：新 skill 已注入双生成物（`SKILL_DEFINITIONS` / `OPENCODE_SKILL_DEFINITIONS` **键集各 18**）；`update.ts` 手写注释区（`:1898`/`:1915`）零触碰（REV-84-006 登记转 stage-85）。
- **测试**（5 份 `test/core/`）：`setup.test.ts`（字面量 17→18 ×2 + 派生总数 27→28 / 55→57）、`templates-migration.test.ts`（字面量 ×3）、`update.test.ts`（字面量 + 派生总数 28→29 ×3 + `expectedSkills` 白名单追加）、`template-loader.test.ts`（字面量 + 派生）、`templates.test.ts`（**新增 stage-84 describe 组 S1~S5**）。**既有断言段零改动**（仅数值/白名单更新 + import）。
- **方案层**：`.openfeel/plan/v1/stage-84/ops/{deps.yaml,op-001~003.md}`；临时自检脚本 `.openfeel/tmp/stage-84-verify.mjs`（工作区，不入版本管理）。

## 关键不变量（设计裁定与实测）

| 不变量 | 内容 | 实证 |
|--------|------|------|
| **4 份 feel.md 对称** | 同语言跨 harness（opencode × claude）切片**逐字等值**；差异仅既有 harness 差异词 | S2 提取式切片 `toBe`（标题行→下一标题行停机；切片非空防假绿） |
| **4 份 planner 对称** | 同上 | S2 同口径 |
| **正交落文** | 需求纪律 / 归档纪律**不与 `workflow_mode`（full/fast）耦合** | S3 阴性断言（不含「fast 跳过需求流转」类耦合表述） |
| **生成物禁手改** | `template-loader.ts` + `update.ts` 由 `npm run build` 重生成 | build 首次输出「18 个…注入」双行；第二次幂等（两生成物 sha1 前后一致） |
| **计数一致（17→18）** | **7 处字面量** + **5 处派生总数**（27→28 / 55→57 / 28→29 ×3）+ **`expectedSkills` 白名单手工追加** `openfeel-req`；`SKILL_DEFINITIONS` ≡ `OPENCODE_SKILL_DEFINITIONS` 键集一致（18） | T4 逐点清单 + 全仓扫 `17` 及总数常量（含标题/注释/生成物/死资产）+ build 生成物键集断言 |
| **零行为耦合 / 零回归** | 模板改动**不引入新命令/新权限**，只描述已实现能力；opencode 既有关键串零回归 | S1 存在性 + 逐字串；S3 opencode 零回归抽样；`git status --porcelain src/` 空（生成物非手改） |
| **断言串纪律** | 一律取**不含 `**` 边界的稳定子串**（防 markdown 粗体断串致 0 命中） | S1/S3/S4/S5 断言串逐字取自落文 |
| **承接闭环** | 承接表 10 条（REV-83-009~018）逐条去向可核；本阶段**零条行为动作** | op-003 §四.6 核验 + deps `notes` 同步 |

## 审查记录

### 计划审查轮（plan_review，2026-10-12，首轮 fail：2 blocking + 3 非阻塞 → 修订 → pass）

| ID | 标题 | 状态 | 优先级 |
|----|------|------|--------|
| REV-84-001 | `skills 17→18` 计数翻转清单不完整（漏 1 字面量 + 5 派生总数 + 白名单） | **closed** | high（**blocking**） |
| REV-84-002 | 承接上游 pending REV 零交代（**第 5 次复发**） | **closed** | high（**blocking**） |
| REV-84-003 | T4 提及 `claude-adapter.test.ts` 而 §范围 / deps 未列 | closed | low |
| REV-84-004 | 死资产 `opencode/ADAPTER.{zh-CN,en}.md` 计数陈旧（登记转 stage-85） | closed | low |
| REV-84-005 | 生成物内 `skills/（17 个共享源）` 同步未在 T3 点名 | closed | low |

### 计划复审（修订验收，2026-10-12，结论 pass：001~005 全闭合 + 新增 1 条）

| ID | 标题 | 状态 | 优先级 |
|----|------|------|--------|
| REV-84-006 | `update.ts` 手写陈旧计数注释（`:1898`/`:1915`）漏登记 | **pending → 归档轮显式销账** | low |

### 方案审查轮（scheme_review，2026-10-13，结论 pass：0 阻塞 + 4 非阻塞）

| ID | 标题 | 状态 | 优先级 |
|----|------|------|--------|
| REV-84-007 | op-002 2.5(a) `description` 插入点描述与源文不符 | pending（转 stage-85 收口轮） | low |
| REV-84-008 | op-002 2.7 F 步扫描范围与允许残留清单不匹配 | pending（转 stage-85 收口轮） | low |
| REV-84-009 | op-003 断言串纪律表述与实际用串自相矛盾 | pending（转 stage-85 收口轮） | low |
| REV-84-010 | op-003 planner S1 用例体为占位注释 | pending（转 stage-85 收口轮） | low |

### 代码审查轮（code_review，2026-10-13，结论 pass：0 阻塞 + 5 非阻塞）

| ID | 标题 | 状态 | 优先级 |
|----|------|------|--------|
| REV-84-011 | 新断言（S1/S2/S3）按原始字节比切片，未做 EOL 归一 | pending（转 stage-85 收口轮，medium） | medium |
| REV-84-012 | 新 skill `openfeel-req` 未纳入 T53 示例清单 | pending（转 stage-85 收口轮） | low |
| REV-84-013 | cli-usage「新增能力」节版本序非单调 | pending（转 stage-85 顺势整理） | low |
| REV-84-014 | 偏差③ 未逐 op 落自测报告（合并收口） | pending（本摘要显式记录） | low |
| REV-84-015 | 需求「自动收口 done」表述省略前置集 | pending（转 stage-85 收口轮） | low |

> 结论：**passed（全 15 条：closed 5 / pending 10，0 blocking 遗留）**。REV-84-001/002（计划轮 blocking）经修订轮闭合。归档官处置：**REV-84-006 据 S-84-5 于本归档轮显式销账**（避免「承接零交代」第 6 次复发）；**REV-84-007~010（方案轮）+ 011~015（代码轮）** 共 9 条非阻塞转 **stage-85 收口轮**。

## 缺陷记录

| ID | 标题 | 状态 | 优先级 |
|----|------|------|--------|
| — | 本阶段**无新增 Bug** | — | — |

> 测试官正式验收 **通过（0 Bug）**。

## 门禁

- `npm test` **70 文件 / 1557 用例 0 skipped / 0 failed**（stage-83 基线 70 文件 / 1547 用例 → 本阶段 **+10 用例**，文件数不变）
- `npx tsc --noEmit` → exit 0
- `OPENFEEL_LOG=0 node bin/openfeel.js lint i18n` → **911**（不变；本阶段无新键）
- `OPENFEEL_LOG=0 node bin/openfeel.js lint kb` → **0**（过期引用）
- `npm run build` ×2 → 幂等（第二次后 `git status` 对生成物零 diff）
- `git status --porcelain src/` → 空（生成物非手改；新 skill 已注入双生成物）
- HEAD 恒 `ab60cb6`（零 commit）

## 知识沉淀

| 分类 | 标题 | 动作 |
|------|------|------|
| patterns | 跨 harness × 语言模板对称纪律：提取式切片字节等值 + 节锚点插入 + 无裸主语 | 新增 |
| patterns | skills 计数翻转全量清单：字面量 + 派生总数 + 白名单枚举（派生值 27/28/55 陷阱） | 新增 |
| patterns | 新增 skill 纳入生成物键集：build 按目录自动纳入 + 白名单手工追加 + 键集一致断言 | 新增 |
| troubleshooting | build 生成物的「段二分」：AUTO-GENERATED 段禁手改 vs 手写注释段（陈旧计数漏登记陷阱） | 新增 |

> 去重（`node bin/openfeel.js knowledge dedup`）：candidate ①（双 harness 对称）最高 **2.7%**；②（计数翻转清单）最高 **1.8%**；③（双生成物段二分）最高 **2.2%**；④（新 skill 键集）最高 **2.4%**，均 ≪ 80% → 4 条均判**新增**。kb 分类计数：architecture 42（不变）、patterns 175→**178**、troubleshooting 60→**61**。

## manual 更新

- **`manual/index.md`**：模块树 Skill 体系节补 `openfeel-req` 条目（需求流转用法权威源）；维护规则「skill 体系 / CLI 用法参考」行 **skill 计数 17→18** 订正。
- **`manual/cli/commands.md`**：「相关 skill」节 skill 总数 **17→18** + 补 `openfeel-req` 说明（生命周期 / 10 子命令 / 认领协议 / 与计划关系 / 正交；权威源 / build 双注入 / 部署）。
- **`manual/agents/feel.md`**：未改（Agent 数量 / 模型 / 调度规则未变；本次仅补 Agent 行为契约节，非调度规则变更）。

## 遗留与下游

- ★ **flow 状态推进**：`v1.2.0-stage-84` → `done`（**由主会话** Feel 经 `openfeel flow advance --stage v1.2.0-stage-84 --to done` 执行；archiver 不直写 flow.json）。`archive_stage` 由该 advance 补记。
- **REV 遗留（10 条 pending 非阻塞，0 blocking）**：REV-84-006（**本归档轮显式销账**）+ 007~010（方案轮）+ 011~015（代码轮）共 **9 条转 stage-85 收口轮**。**0 blocking 遗留**。
- **Bug 遗留**：无。
- **下游契约**：Agent 行为契约（feel ×4 需求/归档纪律 + planner ×4 需求感知）+ skill 权威源（`openfeel-req` 新建 + `openfeel-cli-usage` 补节）交 **stage-85**（文档/版本收口：README×3 + GETTING_STARTED + commands + manual + CHANGELOG `[1.2.0]` + 版本 1.2.0 全链路 + 双主题端到端验收）。
- **兼容承诺**：本阶段**零源码行为变更**（模板/skill 文本 + 计数断言 + build 生成物）；既有命令接受集不变；`workflow_mode` 正交（需求纪律在 full/fast 下一致）。
- **未 commit / 未 push / 未 publish / 未改版本**（版本保持 1.1.7，版本收口归 stage-85）。

> 归档方式：手工生成摘要（沿用先例，未运行 `openfeel archive <stage>` CLI 以避免其副作用）。
