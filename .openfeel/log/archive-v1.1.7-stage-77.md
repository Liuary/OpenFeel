# 归档摘要 — v1.1.7-stage-77

- **归档时间**：2026-10-11
- **阶段名称**：v1.1.7-stage-77（文档与版本收口 — **v1.1.7 收官阶段**）
- **阶段状态**：archiving → done
- **依赖阶段**：hard `v1.1.7-stage-76`（模板与 skill 措辞冻结）；下游 = 无（本阶段为版本最终阶段）
- **归档人**：openfeel-archiver

## 阶段目标

**v1.1.7 版本收官**：① 文档多载体同步（README×3 / GETTING_STARTED / commands：fast 模式能力 + 新命令 + 默认 `auto_advance` 开启说明与存量迁移指引）；② manual 模块文档核对补漏；③ **版本 1.1.6 → 1.1.7 全链路收口（A/B/C/D/E）**；④ **fast 隔离端到端验收**（临时项目跑通快线链）；⑤ roadmap/plan 回填（M29~M32）。

## 操作产出

| ID | 标题 | 状态 | Commit |
|----|------|------|--------|
| op-001 | 文档多载体同步与 manual 核对补漏（T1+T2） | done | —（未提交） |
| op-002 | fast 隔离端到端验收（T4） | done | —（未提交） |
| op-003 | 版本收口 A/B/C/D/E + roadmap/plan 回填 + 全门禁（T3+T5+T6；**版本收口 op = 最终 op**） | done | —（未提交） |

> 注：executor 按 `deps.yaml`「不 commit」约定，产出停留工作区（HEAD `482fda7`）；执行序 = `op-001 → op-002 → op-003`（严格按 `execution_order`）；v1.1.7 提交单位 = 阶段归档提交。

## 改动文件（759 insertions）

- **文档载体**：`README.md` / `README.zh-CN.md` / `README.en.md`（fast 小节 + 测试数 1206→**1306** + 「JSON 顶层 5 键」→ 6 键 + 横幅 `README.md:11` → v1.1.7）、`docs/GETTING_STARTED.md`（快照 v1.1.7 + 模式选择 + 存量升级迁移指引）、`docs/commands.md`（快照×2 + `flow phases --mode/--stage` + `flow mode` 新节 + `plan scheme create --from-tasks` + config 四键/`--sync-stages --stage`）
- **版本载体 A 类（6 载体 / 10 处 / 8 文件）**：`package.json:3`；`package-lock.json`（`:3`/`:9` 手工两行，**禁 `npm install`**）；`.openfeel/config.yaml:7`；`src/core/config.ts`（`:435`/`:492`）；`src/core/templates-data/agents-md/{zh-CN,en}.md:134`；`src/core/templates-data/claude/constraint/{zh-CN,en}.md:137`
- **build 生成物 B 类（禁手改）**：`src/core/template-loader.ts`（版本行 4 处）+ `src/core/update.ts`（`SKILL_DEFINITIONS`）——build ×2 幂等
- **C 类传播**：`CHANGELOG.md`（`[1.1.7]` 含 Added / Changed / **Migration** / Documentation）+ `openfeel-cli-usage` skill 快照（stage-76 已 v1.1.7，仅核对）
- **回填**：`.openfeel/roadmap/v1.1.7.md`（状态「已归档」+ M29~M32 done）、`.openfeel/plan/index.md`、`.openfeel/plan/plan_log.md`
- **方案层**：`.openfeel/plan/v1/stage-77/ops/{deps.yaml,op-001~003.md}`（随阶段纳入版本管理）
- **报告**：`test-v1.1.7-stage-77-report-2026-10-11.md`（私域）、`.openfeel/tmp/op-00{1,2,3}-*`（工作区）

## 审查记录

### 计划审查轮（plan_review 首轮不通过 → 修订复审 pass）

| ID | 标题 | 状态 | 优先级 |
|----|------|------|--------|
| REV-77-001 | `docs/commands.md` 覆盖面缺 2 项 v1.1.7 能力 | closed | medium（blocking） |
| REV-77-002 | §一「实测证据」表基线陈旧 | closed | medium（非阻塞） |
| REV-77-003 | 「v1.1.6 起」能力引入标记须显式列入禁改（D 类） | closed | medium（非阻塞） |
| REV-77-004 | manual 三份已基本完成，改「核对 + 补漏」口径 | closed | low（非阻塞） |
| REV-77-005 | B 类生成段应含 `src/core/update.ts` | closed | low（非阻塞） |
| REV-77-006 | CI 快照路径数（断言 = 5） | closed | low（非阻塞） |
| REV-77-007 | 升级指引须点明「存量项目新阶段回落 fast」 | closed | medium（非阻塞） |
| REV-77-008 | README×3 一致性口径（横幅裁定） | closed | low（非阻塞） |

### 方案审查轮（REV-77-009~014 → 复审 pass，断言串 0 MISS）

| ID | 标题 | 状态 | 优先级 |
|----|------|------|--------|
| REV-77-009 | op-002 E3 断言计数错误（「已推进」全角/半角陷阱），自测必 FAIL | closed | high（blocking） |
| REV-77-010 | op-002 I1 隔离断言在真实执行环境必假失败（`~/.claude` 会话期易变） | closed | high（blocking） |
| REV-77-011 | 偏差 D-1 裁定：属计划文本措辞问题；op-002 处置恰当 | closed | medium（非阻塞） |
| REV-77-012 | op-003 内部计数不一致「6 载体（8 处）」→ 10 处 | closed | low（非阻塞） |
| REV-77-013 | op-003 B 类锚点/改动点计数偏差（7 锚点 + `update.ts` 1 锚点；4 行） | closed | low（非阻塞） |
| REV-77-014 | 行号与卫生小漂移（4 项） | closed | low（非阻塞） |

### 归档对账轮（REV-77-015~020，由归档官处置 closed）

| ID | 标题 | 状态 | 处置 |
|----|------|------|------|
| REV-77-015 | CHANGELOG `[1.1.7]` i18n 基线归属与数值错误 | closed | `[stage-76]` 行改「796 不变」+ Added 另起汇总行「774 → 796（stage-74 +1 / stage-75 +21）」 |
| REV-77-016 | op-002 引用不存在的「主计划 §八」 | closed | 改指「本阶段 `plan.md` §三 T4」 |
| REV-77-017 | plan.md/overview.md op 拆分「建议」与 deps.yaml 不一致 | closed | 标注「以 `ops/deps.yaml` 为准」+ 登记实际 op 序 |
| REV-77-018 | op-002 执行报告缺「脚本全文」 | closed | 明确指向权威源 `ops/op-002.md`「步骤 2 — 脚本全文」 |
| REV-77-019 | tmp `op-001-test-report.md` 覆盖前序阶段自测报告 | closed | `git mv` 为 `op-v1.1.7-stage-77.op-001-test-report.md` |
| REV-77-020 | flow health 工作区漂移（归档官对账） | closed | `flow health --fix`：stage-74/75/76 `planned → done`、stage-77 `planned → archiving`（仅回写「状态」字段）；文件孤儿 89 个按裁定**仅报告** |

> 结论：**passed（全 20 条闭合，无 blocking 遗留）**。

## 缺陷记录

| ID | 标题 | 状态 | 优先级 |
|----|------|------|--------|
| — | 无新增缺陷（验收通过、0 Bug） | — | — |

## 门禁

- `npm test` **67 文件 / 1306 用例 0 skipped / 0 failed**（基线 1306）
- `npx tsc --noEmit` → exit 0
- `node bin/openfeel.js lint i18n` → **796**（不变）
- `node bin/openfeel.js lint kb` → 0（425 引用无过期）
- `npm run build` ×2 → 幂等（`template-loader.ts` `c7f99e23…` / `update.ts` `e5e82576…` 前后一致）
- `node bin/openfeel.js --version` → **1.1.7**（= `package.json`）
- A 类 `1.1.6` 残留 → **0**（rg exit=1）；D 类文档侧历史标记 **7 处**逐字保留
- `.github/workflows/ci.yml` → `for d in` 2 行（`:39`/`:82`）各 **5 路径**；`"$HOME/\.claude"` 计数 = 2
- fast 隔离 E2E → **PASS=30 / FAIL=0**（严格面 I1a + 宽松面 I1b 双 PASS）
- `flow health` → 跨文件一致性告警清零（仅余「文件孤儿 89 个（仅报告）」）

## 知识沉淀

| 分类 | 标题 | 动作 |
|------|------|------|
| patterns | 文档侧历史标记纳入版本收口禁改白名单：B 类双生成物 + 「残留=0」白名单化 + 收口 op 为最终 op | 新增 |
| troubleshooting | fast 隔离 E2E 断言口径：「已推进」全角/半角计数陷阱 + 会话期易变目录的三级隔离断言 | 新增 |
| (supersede) | v1.1.7 fast 链（含 `plan_review` 必经）口径：stage-76 已 supersede（`kb/architecture.md` #双模式转移表选择 + `kb/index.md` + `manual/core/flow-manager.md` + `manual/index.md`）→ 本阶段复核**无残留旧口径** | 核对确认 |

> 去重（`node bin/openfeel.js knowledge dedup`，LF 归一副本隔离运行）：patterns 候选最高 **9.5%**、troubleshooting 候选最高 **2.9%**，均 ≪ 80% → 2 条均判**新增**。
> 索引维护：`kb/index.md` 项目快速概览（最近更新 + 源文件 68 / Agent 9 核验一致）+ 分类概览（patterns 163→164 / troubleshooting 55→56）+ 各分类摘要表补入 2 条 + 最近更新表补入 stage-77；`code_review/index.md`（passed 47→48）。

## manual 更新

- `cli/commands.md`：`openfeel-cli-usage` skill 快照声明 **v1.1.6 → v1.1.7**（口径订正：权威源已于 v1.1.7-stage-76 更新为 v1.1.7 快照，含双模式工作流命令面）
- `index.md`：模块树 `openfeel-cli-usage` 行补「快照已更新至 v1.1.7（v1.1.7-stage-76）」
- （`core/config.md` / `core/flow-manager.md` 本阶段无 API / 命令面变更，核对零改动）

## 版本收官

- **版本**：1.1.6 → **1.1.7**（`--version` = `package.json` = 1.1.7）
- **roadmap**：`.openfeel/roadmap/v1.1.7.md` 状态 → **「已归档」**（4 阶段全部闭环 = v1.1.7 版本收官）；M29~M32 → done（归档日期 2026-10-11）；M32 备注登记「Q1 实际走向：4 阶段全部以 full 运行（D-BOOT）」
- **plan**：`.openfeel/plan/index.md`（系列行 + 4 阶段对照行）+ `plan_log.md` 收官回填行

## 遗留与下游

- ★ **flow 状态推进**：`v1.1.7-stage-77` → `done`（**由主会话** Feel 经 `openfeel flow advance --stage v1.1.7-stage-77 --to done` 执行；archiver 不直写 flow.json）。**推进后建议再跑一次 `flow health --fix`** 使 stage-77 `status.md`「状态」由 `archiving` → `done`（对齐当前 `--fix` 结果）。
- **文件孤儿 89 个**（含 stage-76 op-005 等未注册 op 文件）：按既有裁定**仅报告不自动清理**（`flow repair` 可查看详情；如需补注册用 `plan scheme register`）。
- **未 commit / 未 push / 未 publish**（v1.1.7 提交单位 = 阶段归档提交，由 Feel/用户裁定）。

> 归档方式：手工生成摘要（沿用先例，未运行 `openfeel archive` CLI 以避免其副作用）。
