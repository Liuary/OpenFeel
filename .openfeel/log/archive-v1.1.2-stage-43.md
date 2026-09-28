# 归档摘要 — v1.1.2-stage-43

- **归档时间**：2026-09-29（本地）
- **阶段名称**：v1.1.2-stage-43（CLI 文档 skill 化与版本收口）——**v1.1.2 最后阶段**
- **阶段状态**：archiving → done
- **依赖阶段**：hard after `v1.1.2-stage-41`、`v1.1.2-stage-47`；soft `stage-42`/`44`/`45`/`46`（均已 satisfied）；**最终顺序 `41 → 42 → 44 → 45 → 46 → 47 → 43`**
- **实现 commit**：`cbc606f`
- **需求**：① 将 CLI 操作文档沉淀为按需加载 skill（`openfeel-cli-usage`），根治「工具不自描述、Agent 被迫翻包源码」痛点；② 版本 1.1.2 全链路收口（§3.1 权威清单）；③ 修复 `config/BUG-004` 测试隔离缺口；④ `REV-44` 三项 pending 归属处置
- **版本定位**：本阶段通过后 **v1.1.2 七阶段（41/42/44/45/46/47/43）全部闭环，`npm publish` 就绪**

## 操作产出

| ID | 标题 | 状态 | 尝试次数 |
|----|------|------|----------|
| op-001 | 新增 `openfeel-cli-usage` skill（CLI 用法按需加载） | done | 1/3 |
| op-002 | 文档与交叉引用同步（docs、manual、AGENTS.md、wizard） | done | 1/3 |
| op-003 | 版本 1.1.2 收口与全量回归（§3.1 权威清单） | done | 1/3 |
| op-004 | `config/BUG-004` 测试隔离修复与隔离守护用例 | done | 1/3 |
| op-005 | §3.1 清单复核收口与文本残留闭环（含 `REV-44` 归属落地） | done | 1/3 |

> 本归档摘要由归档官**按既有规范手工生成**（未运行 `openfeel archive`，理由见文末「偏差登记」第 1 项），格式对齐 `archive-v1.1.2-stage-47.md`。

## 关键语义变更（本阶段实质）

| # | 变更 | 语义 |
|---|------|------|
| 1 | **新增 `openfeel-cli-usage` skill** | CLI 用法首次成为**按需加载的知识载体**（此前只存在于手工文档/源码）；权威源单文件 + build 双注入 + 自举，**`build.js` 零改动**（新增目录自动纳入同源校验）；skill 总数 **16 → 17** |
| 2 | **快照声明** | skill 首节声明「本文档为 v1.1.2 快照；命令细节以 `openfeel <cmd> --help` 实时输出为准」——**文档自认滞后**，把实时权威指回 CLI 自身（与自描述命令互补），是本版本对「文档-实现发散」的正面设计 |
| 3 | **版本 1.1.2 全链路收口** | A1~A8（含 `agents-md` 权威源、仓库根 `AGENTS.md` **漂移 v1.1.0 修正**、`package-lock.json` root 两行）+ B 生成段（build 幂等）+ C `CHANGELOG` + D/E；**`package-lock` 手改两行而非 `npm install`**（零依赖树变动，diff 可逐行审） |
| 4 | **`config/BUG-004` 修复** | 测试隔离从「保存/恢复伪隔离」改为 **N4 单点 `vi.mock('node:os')`**；新增**只读隔离守护用例**（真实 `config.json` 的 mtime + SHA-256 前后断言）——把纪律变成可执行闸门 |
| 5 | **`REV-44` 归属闭环** | REV-002 本阶段落地（依赖文本按实盘更新）；REV-001/003 显式**归归档官**并列入交接项（**最后阶段的归属收口**，否则永久丢失） |
| 6 | **`lint i18n` 键数终裁** | 502 系**审查会话裸跑 PATH 全局旧版 CLI**（v1.1.1）输出——环境污染；531 为本仓 `node bin/openfeel.js` 唯一真实键数；**撤销 stage-47「微瑕」错误判定**，落「门禁统一本地 bin」约定 |

## REV 汇总（v1.1.2-stage-43）

| REV | 段 | 优先级 | blocking | 状态 |
|-----|----|:--:|:--:|:--:|
| REV-001 | 计划 | high | **true** | closed |
| REV-002 | 计划 | low | false | closed |
| REV-003 | 计划 | low | false | closed |
| REV-004 | 方案 | medium | **true** | closed |
| REV-005 | 方案 | low | false | closed |
| REV-006 | 代码 | low | false | closed |

- **REV-001（blocking）**：op-003 原「四处同步」清单**遗漏 `templates-data/agents-md/{zh-CN,en}.md` 权威源** → 扩充为 §3.1 权威清单 A1~A8 + B/C/D/E（不改则生成段与全局 `AGENTS.md` 版本 ≠ 实际版本，且 build 纯文案校验不报错）。
- **REV-002**：三处管线纠正（扁平单文件 / 无 `{lang}` / 无 `NEW_SKILL_NAMES`）经实测复核确认，无需修复。
- **REV-003（low）**：旧「四处/三处」表述残留 5 处 → 全部清除（`resolved`，仅追加处理记录）。
- **REV-004（blocking, medium）**：`REV-44` 三项 pending 在 stage-43 plan/ops **零提及**，而本阶段为最后阶段 → op-005 §4 三项全落地（4a 依赖文本实盘更新 / 4b 显式归归档官 / 4c REV-44 补处理记录不改状态）。
- **REV-005（low）**：翻转清单遗漏（补全 **14 处**，含 `expectedSkills` 白名单）+ 门禁数字表述 + skill 快照声明。
- **REV-006（low，终裁改写）**：键数争议以代码级铁证定案（见上表 #6）；审查官**自我更正**入档。
- **代码审查结论**：通过，**零阻塞**。

## 独立验证（归档官复核，只读门禁）

| 项 | 结论 | 证据 |
|----|------|------|
| 版本一致性 | ✅ | `node bin/openfeel.js --version` → **1.1.2**；`package.json` / `config.yaml` / `config.ts` / `agents-md` / `AGENTS.md` 均为 1.1.2（审查官实测 A1~A8 逐条） |
| skill 落地 | ✅ | `.opencode/skills/` = **17** 个目录；权威源 `templates-data/opencode/skills/openfeel-cli-usage/SKILL.md` 存在（审查官三重核验：形态 / 15 phase 与 `pipeline-schema.ts` 逐项一致 / 命令逐条 `rg` 无虚构） |
| 门禁（本地 bin） | ✅ | `node bin/openfeel.js lint kb` → **0 过期引用（归档后 224 引用；阶段内 195）**；`lint i18n` → **531 键一致**（**本次归档新增的 kb 引用亦零过期**） |
| 环境陷阱确证 | ✅ | `Get-Command openfeel` → `C:\Users\Liuary\AppData\Roaming\npm\openfeel.ps1`（**全局旧版 v1.1.1**）——坐实 REV-006 终裁；归档门禁一律用 `node bin/openfeel.js` |
| 概览字段 | ✅ | `glob src/**/*.ts` = **62**（原记 62 → 无需更新）、`.opencode/agents/*.md` = **9**（原记 9 → 无需更新）；仅「最近更新」刷新 |
| 回归与隔离 | ✅ | 采信审查官/测试官**独立实测**（一致）：`npm test` **41 文件 / 694 用例全绿**、`tsc` 0、build 幂等；真实 `~/.openfeel/config.json` mtime+SHA-256 前后不变（测试官外部独立进程比对） |

## 知识沉淀（去重实测通过，4 条全新增）

| 分类 | 处置 | 条目 |
|------|------|------|
| patterns | **新增** | CLI 用法 skill 化模式：权威源单文件 + build 双注入 + 自举 + 「以 `--help` 为准」快照声明 |
| patterns | **新增** | 版本号全链路收口清单模式：A 必改 / B 生成段 / C 传播 / D 禁改 / E 无载体 |
| troubleshooting | **新增** | 裸跑 `openfeel` 命中 PATH 全局旧版 CLI：门禁数字与行为口径被环境污染 |
| troubleshooting | **新增** | 长版本多阶段流水线的两类「伪信号」：审查会话幻觉 与 验收动作自身污染基线（v1.1.2 复盘） |

**去重记录**（`kb-dedup` 真实模块；因该模块对 CRLF 静默失效，在 `%TEMP%\opencode\s43-kbdump\.openfeel\kb\` 放 LF 归一化副本并以该目录为 cwd 调用）：

| 候选 | 分类 | 命中条目数 | 最高相似度（次高） | `shouldUpdate` | 判定 |
|------|------|:--:|:--:|:--:|:--:|
| 裸跑 openfeel 命中 PATH 全局旧版 | troubleshooting | 26 | **6.47%**（保存/恢复伪隔离）／6.45% | false | **新增** |
| 版本级两类伪信号 | troubleshooting | 25 | **11.97%**（保存/恢复伪隔离）／7.91% | false | **新增** |
| CLI 用法 skill 化模式 | patterns | 85 | **11.68%**（新增 Agent 全链路更新清单模式）／10.96% | false | **新增** |
| 版本号全链路收口清单 | patterns | 85 | **10.37%**（AGENTS.md 模板同步模式）／9.03% | false | **新增** |

最高 11.97% ≪ 80% 阈值 → **4 条全部新增**；因「版本级两类伪信号」与既有「保存/恢复伪隔离」11.97%（同域不同视角）及「CLI 用法 skill 化」与「新增 Agent 全链路更新清单」11.68%（同族载体）均按新增处理并**互加交叉引用**，未使用 `mergeEntry`。

## Bug 沉淀（1 closed + 1 新登记）

| Bug | 优先级 | 处置 | 公共落点 |
|-----|:--:|------|----------|
| `config/BUG-004` | medium | **closed**（N4 单点 mock + 删伪隔离 + 只读守护用例；测试官外部独立进程比对 mtime+SHA-256 前后不变），追加「防再犯」四要素 | `bugs/config.md` |
| `cli/BUG-003` | low | **新登记（open，非阻塞）**：`flow phases --json` 的 `--help` 文案缺 `advanceAccepted`（`cli/BUG-001` 收尾遗漏）；**裁定归下一版本或由用户决定**，本阶段不修 | `bugs/cli.md` |

> 索引同步：`bugs/index.md` 统计 `open 1 / closed 8 / 合计 9`；补充「本批共性防再犯」第 4 条（门禁用 `node bin/openfeel.js`）。

## manual 同步（归档官复核 + 2 文件更新）

| 文档 | 处置 |
|------|------|
| `manual/index.md` | **模块树新增「Skill 体系」分支**（`openfeel-cli-usage` 登记 + 权威源路径）；**维护规则新增一行**「skill 体系 / CLI 用法参考」（skill 数量 / 计数白名单 / `--help` 文案与自描述键集一致性 / 快照声明版本号） |
| `manual/cli/commands.md` | **新增「相关 skill」节**（`openfeel-cli-usage` 定位/权威源/build 双注入与自举/部署路径/维护触发），与既有命令示例呼应 |
| `manual/core/*` | 复核：本阶段无源码 API/结构变更（skill 为文档载体；`global-paths.md` 的「死映射安全清理」节已由 op-004 落地），**无需追加** |

## 版本级收尾（本轮新增，v1.1.2 收官）

| 产物 | 处置 |
|------|------|
| `.openfeel/plan/index.md` | 系列导航 v1.1.2 行 → **全部归档（v1.1.2 收官）**；「各版本阶段对照」**补入 14 行**（v1.1.0-35~40 / v1.1.1-01 / v1.1.2-41~47/43）并加补齐说明（**闭合长期历史缺口**） |
| `.openfeel/plan/plan_log.md` | 首行插入 stage-43 归档 + 版本收官记录 |
| `.openfeel/roadmap/v1.1.2.md` | 头部状态改「**已完成（2026-09-29 收官，`npm publish` 就绪）**」；新增「**收官摘要**」节（阶段/测试/门禁/版本载体/能力增量/缺陷/知识沉淀/遗留/发布）；修订记录追加一行 |
| `.openfeel/dev/current.md` | 总进度改「**已收官 ✅**」；知识库 160 / skill **17** / 测试 **694** / 阶段覆盖 **48 全覆盖**；stage-43 里程碑行补齐 |
| `.openfeel/log/{index.md,log.md,2026/09/29/day_index.md}` | 新增 **052** 号日志（取号前扫描当日 `001~051`）+ 三处索引同步 |
| `.openfeel/plan/v1/stage-43/status.md` | status → **done**（含完整状态记录） |
| `docs/` + `CHANGELOG.md` + `README×3` | **核实一致**：`CHANGELOG.md` 含 `## [1.1.2] - 2026-09-29`（Added/Changed/Fixed，历史条目未改）；`docs/commands.md` 含 `## config` 节；`README*` 与 `docs/**` **无版本号载体**（E 类复核确认），无需补 v1.1.2 能力说明（**未重写历史**） |

## 关联产物

- 私域详版审查：`.openfeel/users/Liuary/code_review/REV-v1.1.2-stage-43.md`（285 行，计划/方案/代码三段独立取证 + 可信度声明）
- 公共审查摘要：`.openfeel/code_review/v1.1.2-stage-43.md`（+ `code_review/index.md` → `passed 16 → 17`，新增 v1.1.2 系列总结行）
- 公共 Bug 归档：`.openfeel/bugs/{config,cli}.md` + `index.md`
- 执行报告：`.openfeel/users/Liuary/log/op-v1.1.2-stage-43-report-2026-09-29.md`
- 归档报告：`.openfeel/users/Liuary/log/archive-v1.1.2-stage-43-report-2026-09-29.md`
- 公域日志：`.openfeel/log/2026/09/29/2026-09-29-Liuary-052.md`

## 偏差登记

1. **`openfeel archive` 未运行**（沿用 stage-45/46/47 先例）。源码核对 `src/core/archive/merge.ts:111-139`，该 CLI 有三项副作用：① 覆盖写 `.openfeel/log/archive-<stage>.md`（会冲掉本手工摘要）；② `mgr.appendLog(...)` + `mgr.save()` → **直接写 flow.json**（违反归档官「不直接修改 flow.json」约束）；③ 对全部 closed/resolved REV 逐个 `addKnowledgeEntry(projectPath, 'patterns', ...)`（绕过去重，向 `kb/patterns.md` 追加 `[REV-xxx] 标题` 低质条目）。故改为**手工生成**并逐条去重后写入 kb；flow.json 的 `archive_stage` 审计条目由 Feel 的 `flow advance --to done` 补记。
2. **`flow.json` / `flow.json.bak` 未触碰**：工作树中的改动为流水线自身状态与 `.openfeel/checkpoints/` 快照文件（`review_pending`→`archiving` 系列），**归档官未编辑**。
3. **`cli/BUG-003` 未修**：裁定顺延下一版本或由用户决定（low / 非阻塞 / 非发布阻塞）；已在 `bugs/cli.md` 登记建议修复方向（含「推荐改为不逐一列举键」）。
4. **`REV-44` REV-001/003 归归档官**：本轮**已在 op-005 产出中确认归属与理由**并写入 REV-44 处理记录；**条目状态仍为 `pending`**（状态流转由审查/验收方裁定，归档官不改状态）——如实记录为「交接已登记、关闭待办」。REV-001 载体（`manual/core/permission.md`、agents-md 权限节）已由 stage-44 落地；REV-003 目标 `docs/phase-5/07-...md` 已有「勘误与实测补充」节，其修订应走**归档流程**（非「禁止回改历史」）。
5. **`plan/index.md` 补入 14 行阶段对照**：超出「仅更新 v1.1.2 系列行」的最小范围，属**主动闭合此前多次登记的 historical 缺口**；v1.1.0-35~40 与 v1.1.1-01 的 op 计数在 `flow.json` 中未留存（`ops: {}`），记 `—`，**未臆造**。
6. **本阶段无独立测试报告文件**：`test-v1.1.2-stage-43-report-*` 不存在（验收证据落于 `REV-v1.1.2-stage-43.md` 代码审查段 8 项 + 私域 `bugs/config/BUG-004` 验收记录）→ 公共审查摘要已如实改指，避免悬空引用。
7. **未运行 `npm test` / `npm run build`**（归档官职责为归档与沉淀，不重复验证）；回归数字采信审查官与测试官**独立实测**（双方一致）。**但归档官执行了只读门禁**：`--version` → 1.1.2、`lint kb` → 0 过期引用（195）、`lint i18n` → 531 键；并复核 `glob` 计数（src 62 / agents 9 / skills 17）。
8. **行尾处理**：`kb/patterns.md`（混合：2536 CRLF / 55 LF）、`kb/troubleshooting.md`（700 CRLF）、`code_review/index.md`（全 CRLF）——新增条目按**占优行尾** CRLF 追加；`code_review/index.md` 因编辑引入 LF 行，已**整文件统一回 CRLF**（64 行）以保持原状。`log/index.md`（66 U+FFFD）/`log.md`（2 U+FFFD）为历史混合编码文件：仅**首部插入**，写入后 U+FFFD 计数**不变**（66 / 2）且 UTF-8 合法。
9. **历史遗留未整理**（如实登记）：`log.md` 文末空的重复表头；`day_index.md` 既有 `-015` 重复行；`kb-dedup` 对 CRLF 条目的解析缺陷（新增条目未被 `parseKbFile` 识别，需 LF 归一化副本才能去重——已在 `kb/troubleshooting.md` 有专条记录）。
10. **`profile.yaml` 无备份整体覆盖语义未修**（stage-47 已登记的同类残留）；**455 条历史死映射不清理**（裁定见 `config/BUG-004` 与 `manual/core/global-paths.md`）。
