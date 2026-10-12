# v1.2.0-stage-85 计划 — 文档与版本收口（v1.2.0 收官）

- **阶段**：`v1.2.0-stage-85`（双主题 · 终局收口）
- **依赖**：**hard: v1.2.0-stage-84**（全部功能与契约落定后收口；**版本收口 op 须为最终 op**——v1.1.6/v1.1.7 既有口径；**REV-85-006 定稿：T3 并入最终 op**）
- **优先级**：P0（版本级终局包装：文档多载体 + CHANGELOG + 版本号全链路 + 双主题端到端验收 + roadmap/plan 回填 + 承接 REV 处置与根因固化）
- **制定人**：openfeel-planner ｜ **制定时间**：2026-10-11 ｜ **修订轮**：2026-10-13（计划审查 REV-85-001~008）
- **基线**：**HEAD `9b8d839`**（修订轮全表实测复核；文中行号均以该基线为准）
- **定位**：把 v1.2.0 双主题收口为可发布状态——① 文档多载体同步（README×3 **按三载体差异** / GETTING_STARTED / commands / cli-usage 核对）；② manual **核对/最小补正**（`core/flow-archive` + `core/req` + `cli/commands` 已在位）+ **真新增** `cli/req.md`；③ `CHANGELOG [1.2.0]`；④ 版本 **1.2.0** 全链路 A/B/C/D/E（含 B 类**双生成物**、D 类白名单 **file:line 枚举**）；⑤ 双主题端到端验收（归档实跑 / 常规路径零触碰 / 跨版本 deps / 需求全生命周期 / 认领并发 / 向后兼容 / 正交性）；⑥ roadmap/plan 回填；⑦ 承接 REV 处置（REV-84-006~015 / REV-83-015~018 / REV-83-009~014 销账）与根因固化（REV-85-002）。
- **范围**：`README.md` / `README.zh-CN.md` / `README.en.md` / `docs/GETTING_STARTED.md` / `docs/commands.md` / `.openfeel/manual/**` / `CHANGELOG.md` / `package.json` / `package-lock.json`（root 两行）/ `.openfeel/config.yaml`（`meta.version` 单行）/ `src/core/config.ts`（`CONFIG_TEMPLATE_*` 版本行）/ `src/core/templates-data/agents-md/{zh-CN,en}.md` / `src/core/templates-data/claude/constraint/{zh-CN,en}.md` / `src/core/templates-data/skills/openfeel-cli-usage/SKILL.md`（核对 + 节序整理）/ `src/core/templates-data/skills/openfeel-req/SKILL.md`（前置集订正）/ `src/core/{setup.ts,update.ts}`（**手写注释区**订正）/ `src/core/templates-data/opencode/ADAPTER.{zh-CN,en}.md`（死资产订正或登记）/ `test/core/templates.test.ts`（断言稳定化）/ `src/core/template-loader.ts` + `src/core/update.ts`（B 类重生成）/ `.openfeel/kb/patterns.md`（T7）/ `.openfeel/roadmap/v1.2.0.md` + `.openfeel/plan/v1/v1.2.0/**`（回填）。
- **边界**：**不改** 命令行为（文档级收口 + 注释/断言稳定化）；**不做** `npm publish` / `git push`（由 Feel/用户执行）；不改 CI；不新增第三方依赖；收口期**不再引入新功能**（发现缺口 → 记录并评估，不擅自扩面）；**承接处置禁改控制流/契约**（行为修复类显式转后续）。

## KB 检索（`openfeel-check-kb`）

- 已加载（修订轮复核）。**高度相关条目**：
  - `kb/patterns.md #版本号全链路收口清单模式：A 必改 / B 生成段 / C 传播 / D 禁改 / E 无载体` → 本阶段逐类核对（清单见大计划 §六）。
  - `kb/patterns.md #文档侧历史标记纳入版本收口禁改白名单：B 类双生成物 + 「残留=0」白名单化 + 收口 op 为最终 op` → ① B 类 = `template-loader.ts` **+** `update.ts`；② 「残留=0」断言白名单化（**禁广谱 sed**）——本修订轮按 **file:line 显式枚举**（REV-85-004）；③ 收口 op 为最终 op（REV-85-006 定稿：T3 并入最终 op）。
  - `kb/patterns.md #README 与实现同步的检查清单（测试数/命令表/架构图/部署口径/旧版本号零残留）` → README 五面核对；zh/en 逐节同构；**三载体差异按实测**（REV-85-008）。
  - `kb/patterns.md #全量审查的发现分类与流转裁定` → 上游 pending REV 逐条明写去处（§三「承接 REV 与处置表」，REV-85-001）；**本阶段将该纪律固化到条目本身（T7，REV-85-002）**。
  - `kb/patterns.md #REV/缺陷状态收口的分层口径：清账层 / 历史层 / 无法判定 + 脚本实时重跑` → 承接处置去向三分（本阶段处置 / 显式转后续 / 台账保留·销账）。
  - `kb/patterns.md #部署型资产变更的多载体同步面清单` → 新命令组须落 docs/manual/skill/CHANGELOG 全载体。
  - `kb/troubleshooting.md #flow.json 内容增量核验必含 meta.revision/meta.updated` → 验收脚本核验 flow.json 排除两字段。
  - **无**「双主题收口」既有条目 → 归档时按既有分类补沉。

---

## 一、背景与实测证据（基线 **HEAD `9b8d839`**）

| 事实 | 位置 | 结论 |
|------|------|------|
| A 类手工载体：`package.json:3`（`1.1.7`）/ `package-lock.json`（root 两处，**禁 `npm install` 重生成**）/ `.openfeel/config.yaml:7`（单行）/ `CONFIG_TEMPLATE_{ZH,EN}`（`config.ts:435` / `:492`）/ `agents-md/{zh-CN,en}.md:134` / `claude/constraint/{zh-CN,en}.md:137` | 实测（基线复核） | **6 类载体 / 8 文件 / 10 处**逐处改 `1.1.7 → 1.2.0`（T3） |
| B 类生成段（**双份**）：`template-loader.ts` + `update.ts` | `build.js:23` / `:183-212` 注入；实测 | `npm run build` 重生成（禁手改） |
| `--version` 直读 `package.json`（无 VERSION 常量） | `src/cli/index.ts:15-16` / `:24` | A 类改 `package.json` 即生效 |
| manual 实况：`index.md` + `core/*.md` **24 份**（复现 `ls .openfeel/manual/core/*.md \| wc -l`）/ `cli/*.md` **4 份**；`core/flow-archive.md`（stage-78 建、stage-79/80 更新）、`core/req.md`（stage-81 建、stage-82/83 更新）、`cli/commands.md`（已含 `flow archive` / `req` 节）**均已在位**；**无 `core/requirement.md`**；`cli/` **无 `req.md`** | 实测 | **真新增 = `cli/req.md`**（cli 4→5）；其余为核对/最小补正；**禁新建 `core/requirement.md`**（重复文档——REV-85-003） |
| `CHANGELOG.md` 末节 = `[1.1.7]` | `CHANGELOG.md:5` | 追加 `## [1.2.0]`（T3） |
| docs 快照：`GETTING_STARTED.md:3` / `commands.md:3` 均「v1.1.7 快照」 | 实测 | 快照更新 v1.2.0 + 新命令节（T1） |
| README 三载体差异：**版本横幅仅 `README.md:11`**（实测）；测试数行在 `README.zh-CN.md:203` / `README.en.md:203`（现「1306 用例 / 67 个测试文件」） | 实测 | T1 按载体差异分别更新（REV-85-008） |
| `cli-usage/SKILL.md` 快照 v1.2.0 与 `req` / `flow archive` 两节**已由 stage-84 落地**（实测 `:15` / `:62`）；「新增能力」节序**非单调**（`:50-72`：v1.1.6 → v1.1.7 → v1.2.0 → v1.1.5…） | 实测 | 核对/最小补正（非「待更新」）+ 节序降序整理（REV-85-007 / REV-84-013） |
| 陈旧计数登记（stage-84 移交）：`src/core/setup.ts:3`/`:57`/`:106`/`:120`、`src/core/update.ts:1981`/`:1998` 手写计数注释「17」；`ADAPTER.{zh-CN,en}.md:3`/`:9`（死资产） | 实测（REV-84-006 提出时 `update.ts:1898`/`:1915`，**build 后行号已漂移**——按内容特征复核） | 本阶段订正（17 → **18**；REV-84-006 + REV-84-004 移交） |
| `src/` 旧版本 `1.1.7` 命中 = **12 处示例/注释**（i18n×6 / flow-archive×4 / flow.ts×2）+ **SKILL.md 历史标记 3 处** + **B 类生成物历史节副本 6 处** | 实测 `rg -n "1\.1\.7" src/` | T3 白名单 **file:line 枚举**（REV-85-004）；其余 A/B 类命中随本阶段改写/重生成 |
| roadmap：M33~M39 done、**M40 未达成**；状态「执行中」 | `.openfeel/roadmap/v1.2.0.md:4` | 收官回填 M40 → done + 状态「已归档」（T4） |
| 上游承接（REV-84 归档收口）：pending 10 条（006~015）转 stage-85 收口轮；REV-83-015~018 移交；REV-83-009~014 台账保留 | `REV-84.md:295-303`；`stage-84/plan.md:93` | §三「承接 REV 与处置表」逐条去向（**REV-85-001**；复发第 6 次） |

---

## 二、目标语义与不变量

| 维度 | 内容 |
|------|------|
| 版本事实源 | `package.json` `version` = `1.2.0`（`--version` 直读）；`.openfeel/config.yaml` `meta.version` = 框架版本单行 |
| 文档覆盖面 | 双主题：`flow archive`（三子命令 + 与顶层 archive 区分）+ `openfeel req`（10 子命令）+ `requirements` / `archived_versions` / `requirement_id` 字段语义 + 向后兼容说明（旧 flow.json 零报错、升级无需迁移） |
| 端到端 | 大计划 §十一 十一条验收的可执行化（隔离临时项目 + 本仓迁移复核） |
| 承接 | 上游 pending REV 逐条去向可核（REV-85-001）；根因固化落地（REV-85-002，T7） |

**不变量**：

1. **行为零变更**：本阶段不改命令行为 / 不下探功能实现；仅文档 + 版本载体 + **注释/断言稳定化**（承接处置禁改控制流/契约）。
2. **B 类双生成物**：`template-loader.ts` + `update.ts` 均由 build 重生成；build 后 `git status --porcelain src/` 生成物零漂移（本阶段登记的手写改动除外，提交后为空）。
3. **残留=0（白名单化）**：A 类旧版本 `1.1.7` 残留 = 0；`src/` 全量扫描剩余命中 ⊆ T3 登记的 **file:line 白名单**（禁广谱 sed；**扫描范围与白名单同集合口径**——REV-84-008 教训）。
4. **版本收口 op 为最终 op**：**T3（版本号全链路 A/B/C/D/E）并入最终 op（op-003）**，与 T4 验收、T5 门禁**同 op**；版本号修改后至阶段结束**不再引入任何代码改动**（REV-85-006 二择一定稿，消除与 op 拆分的矛盾）。
5. **manual 与实际一致 + 命名唯一**：既有模块文档（`core/flow-archive.md` / `core/req.md`）核对后零改写或最小补正；**`core/req.md` 为需求模块文档唯一名**——**禁止**新建 `core/requirement.md`（REV-85-003）。

---

## 三、变更点清单（编号 T）

### T1 — 文档多载体（README×3 **按三载体差异** / GETTING_STARTED / commands / cli-usage 核对）
- `README.md`（主）：**唯一版本横幅** `:11`「最新版本 v1.1.7」→ **v1.2.0**（实测仅此一处横幅）；「快速迭代模式」节后新增 v1.2.0 能力小节（归档 `flow archive` 一段 + 需求 `openfeel req` 一段）；命令表按实测。
- `README.zh-CN.md` / `README.en.md`：**无版本横幅（实测）**——更新范围 = 新增 v1.2.0 能力小节 + **`:203` 测试数行**（现「1306 用例 / 67 个测试文件」→ 阶段执行时 `npm test` 实测值；参考基线：HEAD `9b8d839` 登记 **70 文件 / 1557 用例**）+ 命令表补 `flow archive` / `req`；「（v1.1.7 起）」「(since v1.1.7)」等历史标记**保留**（D 类）。
- `docs/GETTING_STARTED.md`：`:3` 快照 v1.1.7 → **v1.2.0**；归档用法小节（版本收官后 `flow archive`）+ 需求流转入门（`req add/claim/link/board` 最小闭环）+ 升级指引（存量为零迁移）。
- `docs/commands.md`：`:3` 快照 → **v1.2.0**；`flow archive` 三子命令 + `req` 十字命令组节核对补漏 + 「与顶层 `openfeel archive` 的区分」注记。
- `src/core/templates-data/skills/openfeel-cli-usage/SKILL.md`（权威源）：快照 v1.2.0 与 `req` / `flow archive` 两节**已由 stage-84 落地**（实测 `:15` / `:62`）——本阶段为**核对/最小补正**（非「待更新」）+ 顺带处置 **REV-84-013**：「新增能力」节序整理为**降序**（v1.2.0 → v1.1.7 → v1.1.6 → v1.1.5…；实测 `:50-72` 非单调）；build 重生成副本（禁手改）。

### T2 — manual（**核对/最小补正** 与 **真新增** 二分；REV-85-003）
- **已存在 → 核对/最小补正**（基线实测在位）：
  - `core/flow-archive.md`（stage-78 建 / stage-79/80 更新）：核对 schema / 原语 API / 两步事务顺序 / 索引与对账 / 消费面口径与源码一致；零改写或最小补正。
  - `core/req.md`（stage-81 建 / stage-82/83 更新）：核对四层模型 / 7 状态 / 聚合投影 / 对称回写 / CRUD 原语 / 正交说明；零改写或最小补正 + REV-83-016 残留路径标注（T6⑥，若未含）。
  - `cli/commands.md`：`flow archive`（stage-79）与 `req`（stage-82）节已在位——核对 + 最小补正（含 REV-83-016 标注，若未含）。
  - `index.md` 树图：`core/flow-archive.md` / `core/req.md` 已登记（`:18-19`）——补登 `cli/req.md`。
- **真新增**：`cli/req.md`（10 子命令 + `--json` 契约 + 退出码 0/1/2 + 与 `core/req.md` 引擎面分工；与 `cli/commands.md` req 节不重复）。
- **命名纪律（防重复文档）**：模块文档命名 **`core/req.md`**（既有、`index.md:19` 已引用）；**禁止**新建 `core/requirement.md`（REV-85-003 根因）。

### T3 — `CHANGELOG [1.2.0]` + 版本 1.2.0 全链路 A/B/C/D/E（**并入最终 op**；REV-85-006）
- CHANGELOG：`## [1.2.0]` —— Added（`flow archive` 组 / `openfeel req` 组 / 字段 `requirements`、`archived_versions`、`requirement_id`）+ Changed（无默认行为变更声明）+ 兼容说明（旧 flow.json 零报错）+ Documentation 行。
- A 类逐处（基线实测 **6 类载体 / 8 文件 / 10 处**）：`package.json:3`；`package-lock.json`（root 两行，**禁 `npm install`**）；`.openfeel/config.yaml:7`（单行 edit）；`src/core/config.ts:435` / `:492`（`CONFIG_TEMPLATE_{ZH,EN}` 版本行）；`src/core/templates-data/agents-md/{zh-CN,en}.md:134`；`src/core/templates-data/claude/constraint/{zh-CN,en}.md:137`。
- B 类：`npm run build` 重生成双生成物（禁手改；生成物中 A 类源〔agents-md / constraint〕副本随 build 更新为 `1.2.0`）。
- D 类禁改 **白名单（file:line 显式枚举，禁广谱 sed）**——`src/` 全量 `rg "1\.1\.7"` 剩余命中须 ⊆ 下列集合：
  - ① **示例/注释类 12 处**（REV-85-004 实册）：`src/core/i18n-data/zh-CN.ts:119,680,686`、`src/core/i18n-data/en.ts:109,647,653`、`src/core/flow-archive/archive-file.ts:25`、`src/core/flow-archive/grouping.ts:25,34`、`src/core/flow-archive/archive-ops.ts:57`、`src/commands/flow.ts:1642,1817`；
  - ② **cli-usage 权威源历史标记 3 处**：`src/core/templates-data/skills/openfeel-cli-usage/SKILL.md:3,55,99`（description 历代能力摘要 + 「v1.1.7 新增能力」节）；
  - ③ **B 类生成物中 ② 的副本（禁手改，随 build 同步）**：`src/core/update.ts:422,474,518`、`src/core/template-loader.ts:7114,7166,7210`（实测；如行号漂移按**内容特征**逐条复核并登记最终行号——R-85-6）。
- 验证：`node bin/openfeel.js --version` = `1.2.0`；A 类载体残留 = 0；`src/` 全量扫描剩余命中 ⊆ 白名单；build ×2 幂等。

### T4 — 双主题端到端验收 + roadmap/plan 回填
- 验收执行（大计划 §十一 ×11）：归档实跑 / 判据门 / 常规路径零触碰（重命名目录法）/ 跨版本 deps / 存量迁移复核（本仓 9 组）/ 需求全生命周期 / 认领并发 / 向后兼容实跑 / 正交性 / Agent 实机（可选）/ 默认非回归。
- 报告落 `.openfeel/tmp/`（验收记录，非本计划产物）；**含承接表 20 条逐条核验**（归档轮据此销账）。
- 回填：`.openfeel/roadmap/v1.2.0.md`（状态「已归档」+ **M40 → done**〔M33~M39 已 done〕；阶段划分表 stage-85 行 manual 命名同步 `core/req.md`）+ `.openfeel/plan/v1/v1.2.0/plan.md`（如需；含 **T7 纪律行**写入——§五附注或「计划纪律」行）。

### T5 — 门禁
`npm run build` ×2（幂等）→ `npm test`（0 skipped / 0 failed）→ `tsc` = 0 → `lint i18n` 新基线（显式登记）→ `lint kb` = 0 → `--version` = 1.2.0 → A 类残留复核（白名单化）。**与 T3 同在最终 op（op-003）**。

### T6 — 承接 REV 处置（REV-85-001；处置明细见下方「承接 REV 与处置表」）
- **本阶段实操项（写死）**：
  - ① 陈旧计数订正（REV-84-006 + REV-84-004 移交）：`src/core/update.ts:1981` / `:1998` + `src/core/setup.ts:3` / `:57` / `:106` / `:120` 手写注释「17」→ **`18`**（**手写区、build 不涉**；执行时复核 AUTO-GENERATED 段范围）；`ADAPTER.{zh-CN,en}.md`（死资产）复核后最小订正（`:3` / `:9` 17→18 + 列表补 `openfeel-req`）；若核验其被门禁/断言引用则改「登记保留」（零动作）。
  - ② 断言稳定化（REV-84-011）：`test/core/templates.test.ts` S1~S3 切片比较套 `norm()`（先例 `test/core/templates-migration.test.ts:24`）。
  - ③ 示例清单（REV-84-012）：`templates.test.ts:12` `SKILLS` 数组纳入 `openfeel-req`（或按 S4 `:500` 现状销账——二者择一并在报告登记）。
  - ④ 节序整理（REV-84-013）：cli-usage「新增能力」节降序（与 T1 同批）。
  - ⑤ 文档订正（REV-84-015）：需求「自动收口 done」补前置集限定 `{scheduled, in_progress}`（`openfeel-req/SKILL.md:32` + `feel.md`×4 需求节 + `manual/core/req.md` 若涉）。
  - ⑥ 残留路径标注（REV-83-016）：`manual/core/req.md` / `cli/commands.md` req 节标注「复位后再推进不回写 → 需求遗留漂移（health warn 可察、非自愈）」；行为修复**转后续**（收口期控制流冻结）。
- **复核销账项（零代码动作）**：REV-84-007 / 008 / 009 / 010 逐条复核（历史 op 文档不回溯改；实测确认实际执行正确）→ 收口轮报告留痕。
- **转后续项（显式记录理由）**：REV-83-016 行为修复（收口期控制流冻结）、REV-83-017（`src/core/req/**` 冻结、纯一致性、零行为收益）、REV-83-018（测试断言结构优化）、REV-84-014（逐 op 报告流程改进——归档轮已显式记录）。

### T7 — 承接 REV 纪律根因固化（REV-85-002；任务书要点 6）
- ① `.openfeel/kb/patterns.md`：更新既有条目「全量审查的发现分类与流转裁定」，追加子条款「**跨阶段承接 REV 与处置表**」——每阶段计划须含该表（上游 pending REV 逐条去向三分：**本阶段处置 / 显式转后续（写明接手阶段或版本）/ 台账保留·销账**）+ `deps.yaml` notes 同步承接声明；判据 = 上游「转下阶段」条目**零灭失**（复发史 REV-80-004 → 85-001 共 **6** 次）。
- ② 大计划 `.openfeel/plan/v1/v1.2.0/plan.md`：T4 回填时在 §五附注（或「计划纪律」行）写入同条款。
- ③ **跨项目持久化（agent 模板 `openfeel-planner.md`×4）本期不做**——收口期模板面冻结（stage-84 刚经审查定稿）；如需跨项目固化，转下版本评估（显式记录理由）。
- 落点理由：kb 为跨版本持久位置且受 `lint kb` 门禁护航；大计划为本版本纪律基线；避让收口期 `src/core/templates-data/**` 变更（避免再触发 build 双生成物与对称断言）。

### 承接 REV 与处置表（REV-85-001；复发第 **6** 次）

> 复发背景：REV-80-004 / 81-004 / 82-004 / 83-001 / 84-002 / **本条（REV-85-001）**——同类「承接零交代」第 6 次。来源：`REV-84.md:295-303`（归档收口 pending 10 条转 stage-85）+ `REV-83.md` 归档收口（015~018 移交 / 009~014 台账保留）。**处置去向三分**：本阶段处置（实操）/ 显式转后续（写明接手）/ 台账保留·复核销账。

**表 1：REV-84-006~015（10 条，stage-84 归档收口明写转 stage-85）**

| 条目 | 级别 | 摘要 | 处置（写死） | 落点 / 依据 |
|------|:--:|------|------|------|
| **REV-84-006** | low | `update.ts` 手写陈旧计数注释漏登记（提出时 `:1898`/`:1915`；基线复核 `:1981`/`:1998`） | **本阶段订正**（与 `setup.ts:3`/`:57`/`:106`/`:120` 同批 17→18）——T6①；手写区、build 不涉 | `REV-84.md:105-113`；stage-84 方案裁定 S-84-5 |
| REV-84-007 | low | op-002 2.5(a) `description` 插入点描述与源文不符 | **复核销账**（历史 op 文档不回溯；实测 `SKILL.md:3` description 已含 v1.2.0 能力摘要，实际执行正确）——T6 复核项 | `REV-84.md:127-135` |
| REV-84-008 | low | op-002 F 步扫描范围与允许残留清单不匹配 | **复核销账** + 口径固化（本计划 T3 扫描范围与白名单同集合口径） | `REV-84.md:145-153` |
| REV-84-009 | low | op-003 断言串纪律表述矛盾 | **复核销账**（表述类，历史 op 不回溯） | `REV-84.md:163-171` |
| REV-84-010 | low | op-003 planner S1 用例体占位注释 | **复核销账**（实际实现已落地于 `templates.test.ts` S1~S3） | `REV-84.md:181-189` |
| **REV-84-011** | medium | 新断言 S1/S2/S3 未做 EOL 归一（CRLF 伪失败） | **本阶段处置**：套 `norm()`（先例 `templates-migration.test.ts:24`）——T6② | `REV-84.md:205-213` |
| REV-84-012 | low | `openfeel-req` 未纳入 T53 示例清单 | **本阶段处置**：`templates.test.ts:12` 纳入（或按 S4 `:500` 现状销账并登记）——T6③ | `REV-84.md:223-231` |
| REV-84-013 | low | cli-usage「新增能力」节版本序非单调 | **本阶段处置**：节序降序整理（与 REV-85-007 同批）——T6④ | `REV-84.md:241-249` |
| REV-84-014 | low | 未逐 op 落自测报告 | **销账 + 转后续**：归档轮已显式记录（`REV-84.md:302`）；「逐 op 报告」流程改进转下版本评估 | `REV-84.md:259-267` |
| REV-84-015 | low | 需求「自动收口 done」省略前置集 | **本阶段处置**：文档订正补 `{scheduled, in_progress}`——T6⑤ | `REV-84.md:277-285` |

**表 2：REV-83-015~018（4 条，stage-84 移交 stage-85 收口轮）**

| 条目 | 级别 | 摘要 | 处置（写死） | 落点 / 依据 |
|------|:--:|------|------|------|
| REV-83-015 | low | `deps.yaml` `invariants` 计数口径 | **本阶段核对销账**（复核实测条数与口径一致后关闭；无「13/14」矛盾残留） | `REV-83.md:270-278` |
| **REV-83-016** | medium | 复位后再推进不回写 → 需求遗留漂移（非自愈） | **本阶段处置（文档成文）+ 行为修复转后续**：manual `core/req.md` / `cli/commands.md` 标注该已知边界（health 需求漂移 warn 可察）；「advance 命中 done 按聚合视图无条件重算」转后续版本评估（收口期行为冻结）——T6⑥ | `REV-83.md:290-306` |
| REV-83-017 | low | `aggregate.ts:127` 未复用 `getRequirements()` | **转后续**（收口期 `src/core/req/**` 冻结；纯一致性、零行为收益） | `REV-83.md:308-316` |
| REV-83-018 | low | 静态禁令 `.every(` 覆盖全文件偏脆 | **转后续**（测试断言结构优化；登记保留） | `REV-83.md:326-334` |

**表 3：REV-83-009~014（6 条，**销账**——stage-84 台账保留〔已落实核验〕）**

| 条目 | 级别 | 摘要 | 销账口径（复核确认后关闭） | 依据 |
|------|:--:|------|------|------|
| REV-83-009 | medium | auto-done 前置集与裁定 M 不一致 | 用户裁定**维持 `{scheduled, in_progress}`**；大计划 §三 裁定 H/M 已同步定稿 → **销账** | `REV-83.md:160-176`；大计划修订记录 2026-10-12 |
| REV-83-010 | low | deps 残留「78 阶段」 | 已落实（`deps.yaml` 改 8 + 历史口径注）→ **销账** | `REV-83.md:178-194` |
| REV-83-011 | low | 契约滞后（缺 `stageIds` + 零关联 `null`） | 已落实（`deps.yaml` 契约条目同步 + 首参形态定稿）→ **销账** | `REV-83.md:196-212` |
| REV-83-012 | low | op-003 依赖 hard vs deps soft | 历史 op 文档（stage-83 归档）；口径以 deps 为准 → **销账** | `REV-83.md:216-232` |
| REV-83-013 | medium | reset 接入点守卫误插风险 | 已落实（实际实现不在 `if (normCur === key)` 守卫内；kb 记载）→ **销账** | `REV-83.md:234-250` |
| REV-83-014 | low | 反向矩阵 fixture 双阶段关联 | 已落实（stage-83 测试闭环）→ **销账** | `REV-83.md:252-264` |

> 核验口径：本表 = **20 条全集**（REV-84-006~015 ×10 + REV-83-015~018 ×4 + REV-83-009~014 ×6，**零灭失**）；去向三分皆写死；销账动作随本阶段收口轮（reviewer / 归档轮）执行；`deps.yaml` stage-85 `notes` 已同步承接声明（对齐 stage-80~84 惯例）。

---

## 四、验收要点（阶段级）

1. 文档五载体与 manual 落地（**真新增 `cli/req.md`**；`core/flow-archive.md` / `core/req.md` / `cli/commands.md` 核对/最小补正）；README 五面核对通过（zh/en 同构；三载体差异按 T1）。
2. 版本 A/B/C/D/E 全链路通过：`--version` = 1.2.0；B 类由 build 重生成；A 类残留 0；`src/` 白名单外残留 0。
3. 大计划 §十一 十一条验收执行完毕（记录留存）；双主题端到端闭环。
4. roadmap/plan 回填完成（M40 done + 状态「已归档」+ T7 纪律行）。
5. 门禁全绿；**版本号修改与最终门禁同在最终 op（op-003），完成后阶段零后续改动**。
6. **承接闭环**（REV-85-001）：承接表 **20 条**逐条去向可核（处置 / 转后续 / 销账）；陈旧计数订正、断言稳定化、根因固化（T7）落地。

## 五、风险

| # | 风险 | 影响 | 缓解 |
|:-:|------|------|------|
| R-85-1 | 版本载体遗漏（A 类扩展面） | 高 | 内容特征扫描兜底（`rg "1\.1\.7"` 全量）+ 逐命中判 A/B/C/D/E + **白名单 file:line 枚举**（T3） |
| R-85-2 | B 类手改 / 生成物漂移 | 高 | build 重生成 + build 后 `git status --porcelain src/` 生成物零漂移断言 |
| R-85-3 | 文档-实现发散（快照写未来能力） | 中 | 「提供版本」标注纪律 + 与 `--help` 实测对照 |
| R-85-4 | 验收遗漏（双主题十一条） | 中 | 逐条勾选执行 + 报告落盘 |
| R-85-5 | 承接处置越界（收口期引入行为变更） | 中 | 承接处置仅限：文档/注释订正 + 测试断言稳定化 + 历史台账销账；**禁改控制流/契约**；行为修复类（REV-83-016 等）显式转后续 |
| R-85-6 | 白名单/行号漂移（REV-84-006 行号复核即例） | 低 | 白名单「内容特征 + file:line」双锚；执行时逐条复核并登记最终行号；禁广谱 sed |

> 说明：op 级拆分建议（**REV-85-006 定稿：T3 并入最终 op**）——**op-001**（T1+T2 文档与 manual）→ **op-002**（T6+T7 承接 REV 处置 + 根因固化）→ **op-003**（**T3 CHANGELOG 与版本全链路 + T4 端到端验收与回填 + T5 门禁——收口 op = 最终 op**；版本号修改与最终门禁同 op，其后零代码改动）；由 openfeel-schemer 定稿并落 `ops/deps.yaml`。

## 六、修订记录

| 时间 | 制定人 | 说明 |
|------|--------|------|
| 2026-10-11 | openfeel-planner | 初稿（立项随批次落盘）：T1~T5；依据大计划 §六 收口清单 / §七 边界 / §十一 端到端验收。**只写计划文档，未改源码、未动 flow.json、未改版本载体。** |
| 2026-10-13 | openfeel-planner | **REV-85-001 修订**（high，blocking）：新增 §三「承接 REV 与处置表」（**复发第 6 次**）——REV-84-006~015 ×10 + REV-83-015~018 ×4 + REV-83-009~014 销账 ×6，逐条去向写死（处置 / 转后续 / 销账三分）；新增 T6 承接处置；`deps.yaml` stage-85 `notes` 同步承接声明。 |
| 2026-10-13 | openfeel-planner | **REV-85-002 修订**（medium）：新增 T7「承接 REV 纪律根因固化」——`kb/patterns.md`「全量审查的发现分类与流转裁定」追加跨阶段承接子条款 + 大计划回填同批写入纪律行；跨项目模板持久化显式转后续（收口期模板面冻结）。 |
| 2026-10-13 | openfeel-planner | **REV-85-003 修订**（high，blocking）：T2 重写为「核对/最小补正（`core/flow-archive.md` / `core/req.md` / `cli/commands.md` 已在位）+ 真新增（`cli/req.md`）」二分；命名纪律 `core/req.md`、**禁新建 `core/requirement.md`**；§一 manual 实证行同步（core **24** 份 / cli 4→5）。 |
| 2026-10-13 | openfeel-planner | **REV-85-004 修订**（medium）：T3 D 类白名单按 **file:line 显式枚举**（① 示例/注释 12 处 + ② SKILL.md 历史标记 3 处 + ③ B 类生成物副本 6 处；禁广谱 sed；扫描范围与白名单同集合口径）。 |
| 2026-10-13 | openfeel-planner | **REV-85-005 修订**（low）：§一 manual「core 21 份」→ 实测 **24** 份（复现 `ls .openfeel/manual/core/*.md | wc -l`）。 |
| 2026-10-13 | openfeel-planner | **REV-85-006 修订**（medium）：二择一取「**T3 并入最终 op**」——§五 op 拆分改为 op-001（T1+T2）/ op-002（T6+T7）/ op-003（T3+T4+T5，收口 op = 最终 op）；不变量 4 与其口径一致（消除矛盾）。 |
| 2026-10-13 | openfeel-planner | **REV-85-007 修订**（low）：T1 新增 cli-usage 条目——快照 v1.2.0 已由 stage-84 落地（实测 `:15`），由「待更新」改「**核对/最小补正**」+ 顺带处置 REV-84-013（节序降序整理）。 |
| 2026-10-13 | openfeel-planner | **REV-85-008 修订**（low）：T1 按三载体差异分别写明——版本横幅**仅 `README.md:11`**（实测）；zh/en **无横幅**（更新范围 = 能力小节 + `:203` 测试数行 + 命令表）；历史标记保留。 |
