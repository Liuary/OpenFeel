# 归档摘要 — v1.1.2-stage-47

- **归档时间**：2026-09-29（本地）
- **阶段名称**：v1.1.2-stage-47（已登记缺陷集中清理）
- **阶段状态**：archiving → done
- **依赖阶段**：hard after `v1.1.2-stage-46`（mutual_exclusion with `stage-46`）；下游 `v1.1.2-stage-43`（版本收口）
- **实现 commit**：`2fb38fa`（修复主体）+ `0ebb17c`（自测报告补记 commit hash）
- **需求**：集中清理 v1.1.2 各阶段在测试/审查中登记但未修的缺陷（14 项裁定：11 修 / 2 归属 / 1 已修复待关闭），使版本收口前无遗留脏点；**不新增功能、不改版本号**

## 操作产出

| ID | 标题 | 状态 | 尝试次数 |
|----|------|------|----------|
| op-001 | CLI 自描述边界 + 目录冲突 i18n（cli/BUG-001、cli/BUG-002） | done | 1/3 |
| op-002 | 存量数据鲁棒性（archive/BUG-001、REV-41 REV-008） | done | 1/3 |
| op-003 | config 语义与来源（config/BUG-002、config/BUG-003） | done | 1/3 |
| op-004 | 部署事务顺序与失败一致性（REV-41 REV-009、REV-46 REV-011） | done | 1/3 |
| op-005 | 平台描述泛化补漏（templates/BUG-002） | done | 1/3 |
| op-006 | 文档与文本残留清理（REV-43 REV-003、lint kb） | done | 1/3 |
| op-007 | 测试与全量回归（翻转清单 F1~F14） | done | 1/3 |

> 本归档摘要由归档官**按既有规范手工生成**（未运行 `openfeel archive`，理由见文末「偏差登记」第 1 项），格式对齐 `archive-v1.1.2-stage-46.md`。

## 关键语义变更（本阶段实质）

| # | 变更 | 语义 |
|---|------|------|
| 1 | `init` 对已存在 `.openfeel/config.yaml` **不再覆盖** | 用户配置优先保护（stage-46「备份 + 仍覆盖」缓解被取代）；**同批删除** config.yaml 备份接入块（无覆盖则无「备份前置」），命令层经 `init.skipped` 输出可见提示；`package.json` 备份块保留 |
| 2 | `buildCascadeConfig` 画像层双条件 | 仅当 `profile.yaml` 真实存在**且**原始 YAML 显式声明 `preferences.auto_advance` 时填充 → 无画像环境来源落 `builtin`（`config/BUG-003` 关闭） |
| 3 | `flow phases` 增 `--json.advanceAccepted` + 边界说明 | 「存在视图（运行时 phases）vs 推进白名单（内置 15）」显式化；**不**收敛 `advance` 校验（避免波及 `PipelinePhase` 类型与模糊修正链） |
| 4 | `removeStage` 契约变更 | 不再删目录，返回 `{ purgeTarget? }`；命令层 `removeStage → save() → rmSync(purgeTarget)`（消除中间态）；日志 `detail.purged` → `detail.purgeTarget`（记意图） |
| 5 | jsonc 备份失败 **A/B 分流** | `setup`/`update` → 跳过 jsonc 写 + `anomaly(backup_failed)` + 继续（对齐 B3）；`migrate` → **有意 fail-fast**（可回滚事务语义），文档化 |
| 6 | `StageDirConflictError` + 三入口 i18n 分流 | 核心层抛结构化错误（message 保留原文），命令层按类型渲染 `common.stageDirConflictTmpl` → 死键消除 |
| 7 | 存量数据守卫 | `archive/merge.ts:85` `Array.isArray(deps)`；`save()` `this.data.meta ??=` |
| 8 | `agents-md:112` 泛化 + kb/计划文本收口 | 与 `AGENTS.md:122` 口径一致（build 幂等）；`lint kb` 0 过期引用 |

## REV 汇总（v1.1.2-stage-47）

| REV | 段 | 优先级 | blocking | 状态 |
|-----|----|:--:|:--:|:--:|
| REV-001 | 计划 | medium | **true** | closed |
| REV-002 | 计划 | high | **true** | closed |
| REV-003 | 计划 | low | false | closed |
| REV-004 | 方案 | low | false | closed |
| REV-005 | 方案 | low | false | closed |

- **REV-001（blocking）**：§九并行组自相矛盾——op-001 与 op-002 同改 `flow-manager.ts` 却标「可并行」→ 重写为**串行链 A**（op-001→002→003→004）∥ 并行组 B（op-005/006）→ op-007；逐 op 文件清单复核无交集。
- **REV-002（blocking）**：op-003① 修复指令不完整（未指示删除 stage-46 的 config.yaml 备份接入块 + `manual/core/backup.md` 未联动）→ 四要素齐备（整段替换 / 删块 / import 复核 / `rg` 兜底）+ manual :46/:68 同步；**副作用独立评估：无需新增文档化 REV**（update 不写 config.yaml，无「init vs update 语义分裂」；「不覆盖」∈ stage-46 预留三选一）。
- **REV-003（low）**：行号漂移（`:399`→`:438`）+ 翻转清单误述（`:2786` 须 `toBeUndefined()`）+ 死键 en 值判断——③ **planner 反驳成立**（`en.ts:31` 值非空，`zh-CN.ts:32` 内 `en:''` 属「单语分文件」模式正常值；死键本质是**无使用点**），审查官原判断被推翻并**如实记录**。
- **REV-004（low）**：op-003 验收命令自相矛盾（`package.json` 备份块合法保留 → `backupFileBeforeWrite` 不可能零命中）→ 改精确断言（`pkgPath` 恰 1 处 + config.yaml 关联零命中）+「无需清理 import」结论。
- **REV-005（low）**：op-001 测试计划行号 `:2379` → 实测 `:2447`（结论不翻转）。
- **代码审查结论**：通过，零阻塞；唯一微瑕＝执行报告 `lint i18n` 键数 531 vs 审查实测 502（非阻塞记录项）。

## 独立验证（归档官复核）

| 项 | 结论 | 证据 |
|----|------|------|
| `init` 不覆盖 | ✅ | `init.ts:180-188` `configExisted` 分支仅 `skipped.push('.openfeel/config.yaml (已存在，保留用户配置)')`，`writeDefaultConfig` 仅出现在 `else`；`commands/init.ts:56-59` 汇总输出 |
| 备份接入点收缩 | ✅ | `rg "backupFileBeforeWrite" src/core/init.ts` → 仅 `pkgPath` 一处（`:300` 附近）；`rg "appendUpdateInfo\('backed'" src/core/init.ts` 无 config.yaml 关联 |
| 事务顺序 | ✅ | `flow-manager.ts:1278` 返回 `{ purgeTarget? }`、`:1314-1333` 计算与日志（`detail.purgeTarget`）；`commands/flow.ts:473-479` 顺序 `removeStage → save → rmSync` |
| 画像层双条件 | ✅ | `flow-manager.ts:1598-1606` `existsSync(getGlobalProfilePath())` + 原始 YAML `explicit === 'enabled' \|\| 'disabled'`；解析失败不填 |
| CLI 边界可编程 | ✅ | `commands/flow.ts:344-345` `advanceAccepted: [...PIPELINE_PHASES]`；`:363` `flow.phases.customPhaseNote` |
| 结构化错误分流 | ✅ | `StageDirConflictError`（`:134`）抛出点 `:755`/`:1180`；三入口 （`plan`/`flow`/`stage`）分流 |
| jsonc A/B | ✅ | `setup.ts:87` / `update.ts:1553` `anomaly(backup_failed)`；`migrate.ts` **零改动**（fail-fast 保留） |
| 泛化一致性 | ✅ | `rg "agents/\*\.md"` 三处口径一致（`AGENTS.md:122` / `agents-md/{zh-CN,en}.md:112`） |
| 回归与门禁 | ✅ | 采信测试官/审查官**独立实测**：`npm test` **41 文件 / 693 用例全绿**（685+8）、`tsc --noEmit` 0、`npm run build` 幂等；**归档官归档后复核只读门禁**：`lint kb` **未发现过期引用（195 引用）**、`lint i18n` **531 键一致**（本次归档新增的 kb 引用亦零过期） |
| 隔离与污染 | ⚠️ | 仓库 `.openfeel/config.yaml` 三值 `auto/enabled/true` 未被覆写；真实 `~/.config/opencode/`、`profile.yaml` 未触碰；**但**真实 `~/.openfeel/config.json` mtime 被改写（内容哈希不变）→ 既有缺口 `config/BUG-004`（归档官已复核为**非本阶段引入**） |
| 源文件数 / Agent 数 | ✅ | `glob src/**/*.ts` = **62**（概览原记 62 → 无需更新）、`glob .opencode/agents/*.md` = 9（概览记 9 → 无需更新）；仅「最近更新」字段刷新为 stage-47 |

## 知识沉淀（去重实测通过，4 条全新增 + 9 处既有条目批注更新）

| 分类 | 处置 | 条目 |
|------|------|------|
| patterns | **新增** | 写策略按资产归属二分：用户资产「不覆盖」vs 框架资产「备份后覆盖」 |
| patterns | **新增** | CLI 自描述集合的「存在视图 vs 推进白名单」区分：差异显式化而非强行收敛 |
| patterns | **新增** | 事务顺序模式：先落盘状态、后执行不可逆副作用 |
| troubleshooting | **新增** | 测试以「保存/恢复」代替 homedir mock：直写真实全局目录的伪隔离（隔离审计四步法） |
| patterns | 更新（`> **更新于 2026-09-29**` 批注） | CLI 自描述命令模式（局限显式化）/ 配置级联解析模式（BUG-003 修复）/ 破坏性命令安全校验清单（反模式已修）/ 测试 cwd 隔离模式（config.yaml 已加调用点守卫）/ 全局路径测试单点 mock（补反例） |
| troubleshooting | 更新（批注） | flow phases 与 advance 集合不一致（已修复）/ i18n 死键（已修复）/ writeDefaultConfig 无条件覆盖（实现层根因已消除）/ 备份失败 fail-fast（A/B 定稿） |

**去重记录**（`kb-dedup` 真实模块；因该模块对 CRLF 静默失效，在 `%TEMP%\opencode\s47-kbdump\.openfeel\kb\` 放 LF 归一化副本并以该目录为 cwd 调用）：

| 候选 | 分类 | 命中条目数 | 最高相似度（次高） | `shouldUpdate` | 判定 |
|------|------|:--:|:--:|:--:|:--:|
| 写策略按资产归属二分 | patterns | 80 | **9.09%**（部署覆盖前自动备份机制）／8.21% | false | **新增** |
| 存在视图 vs 推进白名单 | patterns | 79 | **11.54%**（CLI 自描述命令模式）／6.73% | false | **新增** |
| 事务顺序模式 | patterns | 72 | **3.89%**（破坏性命令安全校验清单）／3.59% | false | **新增** |
| 保存/恢复伪隔离 | troubleshooting | 25 | **8.61%**（writeDefaultConfig 无条件覆盖）／5.92% | false | **新增** |

最高 11.54% ≪ 80% 阈值 → **4 条全部新增**；因「CLI 自描述集合」与既有「CLI 自描述命令模式」相似度 11.54%（同族但视角不同）与「保存/恢复伪隔离」与既有「writeDefaultConfig 覆盖」8.61%（成因相关但机制不同），均按新增处理并**互加交叉引用**，未使用 `mergeEntry`。

## Bug 沉淀（6 closed + 1 复核 closed + 1 新登记）

| Bug | 优先级 | 处置 | 公共落点 |
|-----|:--:|------|----------|
| `config/BUG-002` | high | **closed**（语义修复，关闭标准达成），追加「防再犯」四要素 | `bugs/config.md` |
| `config/BUG-003` | medium | **closed**（画像层双条件），追加「防再犯」 | `bugs/config.md` |
| `cli/BUG-001` | low | **closed**（方案 B：边界说明 + `advanceAccepted`），追加「防再犯」 | `bugs/cli.md` |
| `cli/BUG-002` | low | **closed**（结构化错误 + i18n 分流，死键消除），追加「防再犯」 | `bugs/cli.md` |
| `archive/BUG-001` | low | **closed**（`Array.isArray` 最小修复），追加「防再犯」 | `bugs/archive.md` |
| `templates/BUG-002` | medium | **closed**（权威源泛化 + build），追加「防再犯」 | `bugs/templates.md` |
| `config/BUG-001` | high（遗留） | **复核维持 closed**（连字符子命令实证缺陷不存在） | `bugs/config.md` |
| `config/BUG-004` | medium | **open**，归档官裁定**归属 `v1.1.2-stage-43`** + 处置清单 + 防再犯 | `bugs/config.md` |

> 索引同步：`bugs/index.md` 统计 `open 1 / closed 7 / 合计 8`，并补「本批共性防再犯（跨模块）」三条。

## manual 同步（归档官复核 + 6 文件更新）

| 文档 | 处置 |
|------|------|
| `manual/index.md` | 维护规则更新：flow-manager 行补「`removeStage` 返回值契约与事务顺序」；backup 行补「接入点清单（含不覆盖文件）」；commands 行补 `advanceAccepted` / `StageDirConflictError`；**新增一行**「init `--workspace-only` / 用户可见跳过提示」检查点 |
| `manual/core/init.md` | `InitResult` 补 `skipped`；初始化流程补「不存在才 `writeDefaultConfig`」；**新增「用户配置不覆盖语义」节**；变更历史补 stage-46 / stage-47 两行 |
| `manual/core/flow-manager.md` | `removeStage` API 行 + 破坏性命令节（新契约 + 事务顺序）；自描述访问器节补「存在视图 vs 推进白名单」；画像层行改双条件；BUG-003 残留段改为「已修复」+ `effective` / `resolveEffectiveConfig` 语义区分；审计日志 `remove_stage` 行改 `purgeTarget`；**新增「存量数据鲁棒性与结构化错误（stage-47）」节** |
| `manual/core/config.md` | `writeDefaultConfig` 行改为调用方守卫契约；`DEFAULT_PROFILE` 说明改「stage-47 起级联不再以 `readProfile()` 返回值填充」 |
| `manual/core/backup.md` | BUG-002 段改「已关闭（语义修复 + 验收）」；变更历史补 stage-47 行（接入点收缩 + A/B 定稿） |
| `manual/cli/commands.md` | `flow phases` 补 `advanceAccepted` / 边界说明；`flow stage remove` 补 `save()` 后删目录；`init` 补「已存在 config.yaml 不覆盖 + skipped 提示」；错误处理节补 `StageDirConflictError` 分流 |

## 关联产物

- 私域详版审查：`.openfeel/users/Liuary/code_review/REV-v1.1.2-stage-47.md`（283 行，计划/方案/代码三段独立取证）
- 公共审查摘要：`.openfeel/code_review/v1.1.2-stage-47.md`（+ `code_review/index.md` → `passed 15 → 16`，CRLF 保持）
- 公共 Bug 归档：`.openfeel/bugs/{config,cli,archive,templates}.md` + `index.md`
- 执行报告：`.openfeel/users/Liuary/log/op-v1.1.2-stage-47-report-2026-09-29.md`
- 测试报告：`.openfeel/users/Liuary/log/test-v1.1.2-stage-47-report-2026-09-29.md`
- 归档报告：`.openfeel/users/Liuary/log/archive-v1.1.2-stage-47-report-2026-09-29.md`
- 公域日志：`.openfeel/log/2026/09/29/2026-09-29-Liuary-045.md`

## 偏差登记

1. **`openfeel archive` 未运行**（沿用 stage-45/46 先例）。源码核对 `src/core/archive/merge.ts:111-139`，该 CLI 有三项副作用：① 覆盖写 `.openfeel/log/archive-<stage>.md`（会冲掉本手工摘要）；② `mgr.appendLog(...)` + `mgr.save()` → **直接写 flow.json**（违反归档官「不直接修改 flow.json」约束）；③ 对全部 closed/resolved REV 逐个 `addKnowledgeEntry(projectPath, 'patterns', ...)`（绕过去重，向 `kb/patterns.md` 追加 `[REV-xxx] 标题` 低质条目）。故改为**手工生成**并逐条去重后写入 kb；flow.json 的 `archive_stage` 审计条目由 Feel 的 `flow advance --to done` 补记。
2. **公共 Bug 文件（4 个）与 `flow.json` 在本轮之前已有未提交工作树改动**：前者为测试官本轮关闭记录（归档官在其上追加「防再犯」），后者为流水线自身状态（phase 推进）——归档官**未触碰** `flow.json`。
3. **`config/BUG-004` 未修**：属既有测试隔离缺口，归档官按裁定**归属 stage-43** 并写入处置清单（含「455 条历史死映射须用户确认后再清理」的约束）；本阶段不夹带测试基建重构。
4. **`REV-v1.1.2-stage-44` REV-001/002/003 均仍为 `pending`**（审查官标注为「规划 / 归档处置」）：本阶段只顺带覆盖了 REV-002 的依赖文本（op-006 改 `stage-43/plan.md:16`）；REV-003（`docs/phase-5/07` §三勘误与措辞精化）该文档 **已有「勘误与实测补充（opencode 1.18.33）」节**（stage-44 落地），归档官判定其诉求已实质满足、仅**未正式关闭条目**；REV-001（三点补强建议）已在 stage-44 op-004 方案落地但条目未关闭。**如实登记**：阶段计划 §二 第 12 项称「REV-001 已 closed」与私域文件实测（`pending`）不符，建议 Feel/审查官补关或书面说明。
5. `docs/phase-5/07-openfeel-permission-issue.md` §三 相关措辞未再改动（超出本次任务范围；如需精化建议另立归档任务）。
6. **未运行 `npm test` / `npm run build`**（归档官职责为归档与沉淀，不重复验证）；回归数字采信审查官（代码审查段）与测试官验收的**独立实测**（双方一致：41 文件 / 693 用例、`tsc` 0、build 幂等）。**但归档官复核运行了只读门禁**：归档后 `node bin/openfeel.js lint kb` → 未发现过期引用（**195 引用**，较阶段内 178 上升——kb 新增条目与批注引入新引用，仍为零过期）、`lint i18n` → **531 键一致**（与执行报告一致，支持「审查官实测 502 键属口径/环境差异」的解释）。
7. `log/index.md`（66 个 U+FFFD）/ `log.md`（2 个）为历史混合编码文件：仅**字面追加/首行插入**，追加后校验 U+FFFD 计数不变（66 / 2）与 UTF-8 合法性；`log.md` 文末空的重复表头未整理（历史遗留）。
8. `day_index.md` 既有 `-015` 行重复（并发写所致）未动；本条目取 **045** 号（取号前扫描当日 `001~044`）。
9. `plan/index.md`「各版本阶段对照」表仍止于 `v1.0.0-stage-34`（stage-35~47 行缺失，历史遗留，stage-42/44/45/46 已登记）——本次仅更新系列导航行，未补历史表（避免超范围改动）。
10. **`kb/patterns.md` 为混合行尾文件**（2492 CRLF / 2547 LF 行）：本次以「读为字符串 → 定向插入/CRLF 追加 → UTF-8 无 BOM 写回」处理，未整文件重写；`troubleshooting.md` 全 CRLF、`code_review/index.md` 全 CRLF 同法处理。
