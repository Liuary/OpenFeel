# v1.2.0-stage-85 计划 — 文档与版本收口（v1.2.0 收官）

- **阶段**：`v1.2.0-stage-85`（双主题 · 终局收口）
- **依赖**：**hard: v1.2.0-stage-84**（全部功能与契约落定后收口；**版本收口 op 须为最终 op**——v1.1.6/v1.1.7 既有口径）
- **优先级**：P0（版本级终局包装：文档多载体 + CHANGELOG + 版本号全链路 + 双主题端到端验收 + roadmap/plan 回填）
- **制定人**：openfeel-planner ｜ **制定时间**：2026-10-11
- **定位**：把 v1.2.0 双主题收口为可发布状态——① 文档多载体同步（README×3 / GETTING_STARTED / commands）；② manual 分级模块文档（`core/flow-archive` + `core/requirement` + `cli/req` + `index.md`）；③ `CHANGELOG [1.2.0]`；④ 版本 **1.2.0** 全链路 A/B/C/D/E（含 B 类**双生成物**）；⑤ 双主题端到端验收（归档实跑 / 常规路径零触碰 / 跨版本 deps / 需求全生命周期 / 认领并发 / 向后兼容 / 正交性）；⑥ roadmap/plan 回填。
- **范围**：`README.md` / `README.zh-CN.md` / `README.en.md` / `docs/GETTING_STARTED.md` / `docs/commands.md` / `.openfeel/manual/**` / `CHANGELOG.md` / `package.json` / `package-lock.json`（root 两行）/ `.openfeel/config.yaml`（`meta.version` 单行）/ `src/core/config.ts`（`CONFIG_TEMPLATE_*` 版本行）/ `src/core/templates-data/agents-md/{zh-CN,en}.md` / `src/core/templates-data/claude/constraint/{zh-CN,en}.md` / `.openfeel/roadmap/v1.2.0.md` + `.openfeel/plan/v1/v1.2.0/**`（回填）。
- **边界**：**不改** 命令行为（文档级收口）；**不做** `npm publish` / `git push`（由 Feel/用户执行）；不改 CI；不新增第三方依赖；收口期**不再引入新功能**（发现缺口 → 记录并评估，不擅自扩面）。

## KB 检索（`openfeel-check-kb`）

- 已加载。**高度相关条目**：
  - `kb/patterns.md #版本号全链路收口清单模式：A 必改 / B 生成段 / C 传播 / D 禁改 / E 无载体` → 本阶段逐类核对（清单见大计划 §六）。
  - `kb/patterns.md #文档侧历史标记纳入版本收口禁改白名单：B 类双生成物 + 「残留=0」白名单化 + 收口 op 为最终 op` → ① B 类 = `template-loader.ts` **+** `update.ts`；② 「残留=0」断言白名单化（禁广谱 sed）；③ 收口 op 为最终 op。
  - `kb/patterns.md #README 与实现同步的检查清单（测试数/命令表/架构图/部署口径/旧版本号零残留）` → README 五面核对；zh/en 逐节同构。
  - `kb/patterns.md #部署型资产变更的多载体同步面清单` → 新命令组须落 docs/manual/skill/CHANGELOG 全载体。
  - `kb/patterns.md #CLI 输出编码单一咽喉` 等无关；`kb/troubleshooting.md #flow.json 内容增量核验必含 meta.revision/meta.updated` → 验收脚本核验 flow.json 排除两字段。
  - **无**「双主题收口」既有条目 → 归档时按既有分类补沉。

---

## 一、背景与实测证据（大计划 §六 版本收口清单摘引）

| 事实 | 位置 | 结论 |
|------|------|------|
| A 类手工载体：`package.json` / `package-lock.json`（root 两处，**禁 `npm install` 重生成**）/ `.openfeel/config.yaml`（单行）/ `CONFIG_TEMPLATE_{ZH,EN}` / `agents-md/{zh-CN,en}` / `claude/constraint/{zh-CN,en}` | 实测（v1.1.7 收口清单同构） | 6 类载体逐处改 `1.1.7 → 1.2.0` |
| B 类生成段（**双份**）：`template-loader.ts` + `update.ts` | `build.js:23` / `:183-212` 注入；实测 | `npm run build` 重生成（禁手改） |
| `--version` 直读 `package.json`（无 VERSION 常量） | `src/cli/index.ts:15-16` / `:24` | A 类改 `package.json` 即生效 |
| manual 结构：`index.md` + `core/*.md` + `cli/*.md`（v1.1.7 新增 `core/claude-settings.md` 先例） | `.openfeel/manual/`（实测：core 21 份 / cli 4 份） | 本版新增 `core/flow-archive.md` + `core/requirement.md` + `cli/req.md`；`index.md` 树图登记 |
| `CHANGELOG.md` 既有 `[1.1.7]` 节先例 | `CHANGELOG.md` | 追加 `## [1.2.0]`（两组新命令 + 字段 + 归档语义 + 兼容说明） |
| docs 快照声明先例（GETTING_STARTED / commands） | `docs/GETTING_STARTED.md` / `docs/commands.md`（v1.1.7 快照先例） | 快照更新 v1.2.0 + 新命令节 |
| roadmap/plan 回填先例（状态「已归档」/ 里程碑 done） | `.openfeel/roadmap/v1.1.7.md`；`.openfeel/plan/v1/v1.1.7/plan.md` | 收官时回填 M33~M40 与状态 |

---

## 二、目标语义与不变量

| 维度 | 内容 |
|------|------|
| 版本事实源 | `package.json` `version` = `1.2.0`（`--version` 直读）；`.openfeel/config.yaml` `meta.version` = 框架版本单行 |
| 文档覆盖面 | 双主题：`flow archive`（三子命令 + 与顶层 archive 区分）+ `openfeel req`（10 子命令）+ `requirements` / `archived_versions` / `requirement_id` 字段语义 + 向后兼容说明（旧 flow.json 零报错、升级无需迁移） |
| 端到端 | 大计划 §十一 十一条验收的可执行化（隔离临时项目 + 本仓迁移复核） |

**不变量**：

1. **行为零变更**：本阶段不改命令行为 / 不下探功能实现；仅文档 + 版本载体。
2. **B 类双生成物**：`template-loader.ts` + `update.ts` 均由 build 重生成；`git status --porcelain src/` 空。
3. **残留=0（白名单化）**：A 类旧版本 `1.1.7` 残留 = 0（文档侧历史标记白名单除外，kb 纪律）。
4. **收口 op 为最终 op**：版本号修改与最终门禁在同一收口 op 内完成（不得再引入代码改动）。
5. **manual 与实际一致**：新模块文档与源码职责/API 一致（归档官口径复用于此处核对）。

---

## 三、变更点清单（编号 T）

### T1 — 文档多载体（README×3 / GETTING_STARTED / commands）
- `README.md` / `README.zh-CN.md` / `README.en.md`：版本横幅 → v1.2.0；能力小节新增「flow.json 归档拆分（v1.2.0 起）」与「需求流转系统（v1.2.0 起）」；测试数/命令表按实测更新（五面核对清单）。
- `docs/GETTING_STARTED.md`：快照 v1.2.0 + 归档用法小节（版本收官后 `flow archive`）+ 需求流转入门（`req add/claim/link/board` 最小闭环）+ 升级指引（存量为零迁移）。
- `docs/commands.md`：快照 ×2（如有双处）+ `flow archive` 三子命令 + `req` 十字命令组 + 「与顶层 `openfeel archive` 的区分」注记。

### T2 — manual 分级模块文档
- 新增 `core/flow-archive.md`（归档文件 schema / 原语 API / 两步事务顺序 / 索引与对账 / 边界）。
- 新增 `core/requirement.md`（四层模型 / 7 状态 / 聚合投影 / CRUD 原语 / 正交说明）。
- 新增 `cli/req.md`（10 子命令 + `--json` 契约 + 退出码）；`cli/commands.md` 补 `flow archive` 节。
- `index.md` 树图登记三份新文档；顺带核对既有模块文档与实现一致性（零改写或最小补正）。

### T3 — `CHANGELOG [1.2.0]` + 版本 1.2.0 全链路 A/B/C/D/E
- CHANGELOG：`## [1.2.0]` —— Added（`flow archive` 组 / `openfeel req` 组 / 字段 `requirements`、`archived_versions`、`requirement_id`）+ Changed（无默认行为变更声明）+ 兼容说明（旧 flow.json 零报错）。
- A 类逐处：`package.json` / `package-lock.json`（root 两行，**禁 `npm install`**）/ `.openfeel/config.yaml`（单行）/ `CONFIG_TEMPLATE_{ZH,EN}` / `agents-md/{zh-CN,en}`（「当前 v1.1.x」行）/ `claude/constraint/{zh-CN,en}`。
- B 类：`npm run build` 重生成双生成物。
- D 类：历史批注 / 依赖版本 / manual 变更历史 / test 注释 / `docs/phase-*` **禁改**；文档侧历史标记白名单化。
- 验证：`node bin/openfeel.js --version` = `1.2.0`；A 类旧版本残留 `rg` = 0（白名单除外）。

### T4 — 双主题端到端验收 + roadmap/plan 回填
- 验收执行（大计划 §十一 ×11）：归档实跑 / 判据门 / 常规路径零触碰（重命名目录法）/ 跨版本 deps / 存量迁移复核（本仓 9 组）/ 需求全生命周期 / 认领并发 / 向后兼容实跑 / 正交性 / Agent 实机（可选）/ 默认非回归。
- 报告落 `.openfeel/tmp/`（验收记录，非本计划产物）。
- 回填：`.openfeel/roadmap/v1.2.0.md`（状态「已归档」+ M33~M40 进度）+ `.openfeel/plan/v1/v1.2.0/plan.md`（如需）；归档官在 archiving 阶段做最终知识沉淀前的一致性核对。

### T5 — 门禁
`npm run build` ×2（幂等）→ `npm test`（0 skipped / 0 failed）→ `tsc` = 0 → `lint i18n` 新基线（显式登记）→ `lint kb` = 0 → `--version` = 1.2.0 → A 类残留复核。

---

## 四、验收要点（阶段级）

1. 文档五载体与 manual 三新文档落地；README 五面核对通过（zh/en 同构）。
2. 版本 A/B/C/D/E 全链路通过：`--version` = 1.2.0；B 类由 build 重生成；A 类残留 0。
3. 大计划 §十一 十一条验收执行完毕（记录留存）；双主题端到端闭环。
4. roadmap/plan 回填完成。
5. 门禁全绿；**收口 op 为最终 op**。

## 五、风险

| # | 风险 | 缓解 |
|:-:|------|------|
| R-85-1 | 版本载体遗漏（A 类扩展面） | 内容特征扫描兜底（`rg "1\.1\.7"` 全仓排除历史批注）+ 逐命中判 A/B/C/D/E |
| R-85-2 | B 类手改 / 生成物漂移 | build 重生成 + `git status --porcelain src/` 空断言 |
| R-85-3 | 文档-实现发散（快照写未来能力） | 「提供版本」标注纪律 + 与 `--help` 实测对照 |
| R-85-4 | 验收遗漏（双主题十一条） | 逐条勾选执行 + 报告落盘 |

> 说明：op 级拆分建议——op-001（T1+T2 文档与 manual）→ op-002（T3 CHANGELOG 与版本全链路）→ op-003（T4 端到端验收 + T5 门禁，**收口 op 为最终 op**）；由 openfeel-schemer 定稿并落 `ops/deps.yaml`。

## 六、修订记录

| 时间 | 制定人 | 说明 |
|------|--------|------|
| 2026-10-11 | openfeel-planner | 初稿（立项随批次落盘）：T1~T5；依据大计划 §六 收口清单 / §七 边界 / §十一 端到端验收。**只写计划文档，未改源码、未动 flow.json、未改版本载体。** |
