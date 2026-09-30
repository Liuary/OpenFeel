# v1.1.2-stage-50 归档 — 全量审查 non-blocking 集中清理（第二批）

- **归档 Agent**：openfeel-archiver（deepseek-flash）
- **归档时间**：2026-09-30（本地）
- **阶段**：`v1.1.2-stage-50`（全量审查 non-blocking 集中清理·第二批，T1~T57 / 7 op）｜进入时 phase = `archiving`｜出口 phase = `done`（由 Feel 执行 CLI）
- **实现 commit**：`feae65e`（op-001 批次 A T1~T16）/ `b2cbad3`（op-003 批次 C T22~T37）/ `d546e0b`（op-002 批次 B T17~T21）/ `a4d70bd`（op-004 批次 D T38~T42）/ `bcb5353`（op-005 批次 E T43~T52）/ `f50960f`（op-006 批次 F T53~T57）/ `def6a33`（op-007 收口）
- **需求**：承接 `.openfeel/users/Liuary/code_review/v1.1.2-stage-49-全量审查总报告.md` §五 流转裁定的全部 non-blocking 项，编号化清理（T1~T57，6 批次 A~F）；**继续 v1.1.2，不改版本号**
- **前置**：`v1.1.2-stage-49`（已 done，硬依赖）｜**下游**：`v1.1.2-stage-51`（硬依赖本阶段，复用 T1/T8 契约）

---

## 一、归档产物清单

| # | 产物 | 类型 | 说明 |
|---|------|------|------|
| 1 | `.openfeel/log/archive-v1.1.2-stage-50.md` | 新建 | 本归档摘要（**手工生成**，未运行 `openfeel archive`，理由见第六节偏差 1） |
| 2 | `.openfeel/code_review/v1.1.2-stage-50.md` | 新建 | 阶段公共摘要：结论 `passed`；审查范围（T1~T57 / 6 批次 / 7 op）+ R1~R6 裁定落地表 + REV 清单（001 closed / 002·003 resolved / 004 pending 归下版本）+ 验证门禁 + Bug 收口 + 不修/登记/归档留痕 |
| 3 | `.openfeel/code_review/index.md` | 更新 | 统计 `passed 19` → **`passed 20`**；系列总结行追加 stage-50（T1~T57 / R1~R6 / 790 用例 / 560 键 / BUG-003 关闭 / cli/BUG-004 新登记）；v1.1.2 表在 stage-49 行后插入 stage-50 行（**保持全 CRLF：67/0**） |
| 4 | `.openfeel/bugs/cli.md` | 更新（+1 条） | 新增 **BUG-004**（en 模式 `--help` 的 Arguments 描述仍为中文；T38 仅落地遍历机制，23 处 `.argument()` 仅 1 处补键）——核心结论 / 影响范围 / 建议修复方向 / 验收记录；建议归 stage-51 |
| 5 | `.openfeel/bugs/templates.md` | 更新 | `templates/BUG-003` 状态 `open → **closed**`；新增「关闭记录（v1.1.2-stage-50，op-006 T53）」——5 skill 双口径 + 加注补齐 + build 幂等 + 轻量断言 + 防再犯 |
| 6 | `.openfeel/bugs/index.md` | 更新 | 统计 `open 1 / closed 9 / 合计 10` → **`open 1 / closed 10 / 合计 11`**；新增「v1.1.2-stage-50 收口」说明段；cli 模块表新增 BUG-004 行；templates/BUG-003 行改 `closed` |
| 7 | `.openfeel/kb/patterns.md` | 更新（+4 条） | 新增：全量审查发现的批量清理方法论 / 跨阶段「契约先行」协同 / CLI 退出码语义 / 命令面收敛与弃用策略（**CRLF 保持：2730/55**） |
| 8 | `.openfeel/kb/troubleshooting.md` | 更新（+1 条） | 新增：配置键白名单须 schema 驱动 + 值类型归一（避免字符串 `"true"` 写入破坏配置）（**CRLF 保持：758/0**） |
| 9 | `.openfeel/kb/index.md` | 更新 | 快速概览「最近更新」刷新为 stage-50 + **源文件 62 → 63**（stage-50 净增 1：`commands/shared/errors.ts` + `core/fs/safe-read.ts` 新增、`utils/path.ts` 删除）；分类概览（patterns 106 → **110**、troubleshooting 35 → **36**）；各分类摘要新增 5 行；最近更新表首行插入 stage-50（**LF 保持**） |
| 10 | `.openfeel/manual/cli/commands.md` | 更新（4 处） | i18n 集成补 `arguments` 遍历（T38）；退出码表补 **lint 门禁退出码（R1/T17）**；`flow phases --json` 补 `transitionsDiff`（T19）；`config get/set` 补全量 `defaults.*`（R3/T36）；新增 `view add` 弃用行（R4/T37） |
| 11 | `.openfeel/manual/core/flow-manager.md` | 更新（API 表 +1 行 / +1 节） | 新增 `syncCurrentOp(stageName)` 行 + 「内部一致性与门禁支撑（v1.1.2-stage-50，T1~T19）」节（T1/T2/T4/T5/T6/T9/T10/T11/T12/T14/T16/T19） |
| 12 | `.openfeel/manual/core/config.md` | 更新（1 行 +1 节） | `setConfigValue` 值类型归一（R3/T36）；新增「健壮性补强（v1.1.2-stage-50）」节（T28 深拷贝 / T32 大小写去重 / R3 全量键 / T29 逐键 Zod / T33 parseError 提示） |
| 13 | `.openfeel/manual/core/global-paths.md` | 更新（API +1 行 / 陈旧名单修正 / +1 行历史） | 新增 `getHomedir()`（T27）；**「homedir 分散 4 处」陈旧名单修正**（U3-008，实测已单点收敛，仅本模块 import `node:os`）；变更历史补 stage-50 行 |
| 14 | `.openfeel/manual/core/update-infos.md` | 更新（1 条 +1 行历史） | 新增「条目只增不减（R2/T25，按保守默认）」设计要点（不新增自动清理/命令 + 人工清理建议）；变更历史补 stage-50 行 |
| 15 | `.openfeel/manual/index.md` | 更新（4 行） | 维护规则表：flow-manager（`syncCurrentOp` / `transitionsDiff`）、config（全量 `defaults.*` + 类型归一）、global-paths（`getHomedir` + 单点收敛）、update-infos（R2）、commands/i18n（R1/R3/R4/T38/T19）检查点 |
| 16 | `docs/commands.md` | 更新（4 处，文档类修复） | `flow phases --json` 补 `transitionsDiff`；`view add` 标弃用 + 迁移 `flow review add`；`config get/set` 补全量 `defaults.*` + 类型归一 + 枚举校验不写盘；`lint` 节补退出码门禁语义 |
| 17 | `README.zh-CN.md` | 更新（3 处） | `lint` 补「发现问题非 0 退出」；`config` 补全量 `defaults.*` + effective；`view` 的 `add` 标已弃用；测试 `716 / 41 文件` → **`790 / 54 文件`** |
| 18 | `README.en.md` | 更新（3 处） | 同上（英文）；测试 `716 cases / 41 files` → **`790 cases / 54 files`** |
| 19 | `CHANGELOG.md` | 更新（Fixed 收口） | `[1.1.2]` `Fixed` 占位替换为 6 条分批实际条目（批次 A~F；含 R1/R2/R3/R4/T19/T49 行为变更已在 Added/Changed/Deprecated 登记） |
| 20 | `.openfeel/log/2026/09/30/2026-09-30-Liuary-010.md` | 新建 | 公域日志（title + 详情 + 偏差登记）——编号 **010**（取号前扫描 2026-09-30 已用 001~009） |
| 21 | `.openfeel/log/2026/09/30/day_index.md` | 更新 | 追加 stage-50 归档行 |
| 22 | `.openfeel/log/index.md` | 更新 | 2026-09 节追加 stage-50 归档行 |
| 23 | `.openfeel/log/log.md` | 更新 | 主表首行插入条目行 |
| 24 | `.openfeel/plan/index.md` | 更新 | v1.1.2 系列导航行改为「stage-41~50 全部归档」；阶段对照表新增 stage-50 行 |
| 25 | `.openfeel/plan/plan_log.md` | 更新 | 表首插入 stage-50 归档条目 |
| 26 | `.openfeel/plan/v1/stage-50/status.md` | 更新 | `planned → done`（含状态一致性观察） |
| 27 | `.openfeel/roadmap/v1.1.2.md` | 更新 | M6 非阻塞清零 → done；阶段完成 9/9 → **11/11（含 50）**；测试/门禁/缺陷/知识行刷新；修订记录补 stage-50 归档行 |
| 28 | `.openfeel/dev/current.md` | 更新 | 收官状态（十阶段）+ 统计（测试 790 / 54 文件、知识 177、缺陷 11）+ 里程碑表补 stage-50 |
| 29 | `.openfeel/users/Liuary/dev_last.md` | 覆盖 | 会话状态覆盖写入（含决策历史、经验暂存、stage-51 待办） |
| 30 | `.openfeel/users/Liuary/log/archive-v1.1.2-stage-50-report-2026-09-30.md` | 新建 | 本报告（完整版） |

> **未产出**：`flow.json`（**不直写**，见第五节需 Feel 执行的命令）。

---

## 二、用户裁定落地归档（R1~R6，2026-09-30）

| 裁定 | 结论 | 落地 | 归档记录 |
|:--:|------|:--:|------|
| **R1** | `lint i18n`/`lint kb` 发现问题**非 0 退出**；**不新增逃生阀** | T17 | 本仓 `exit 0` + 缺陷 fixture `exit 1`；`--warn-only`/`--no-fail` 不存在；用 `process.exitCode`；CHANGELOG Changed |
| **R2** | `update_infos` **按保守默认** | T25 | 仅代码注释 + `manual/core/update-infos.md` 文档化「条目只增不减」；无新命令 |
| **R3** | `config set/get` 扩**全量 `defaults.*`** | T36 | Schema 驱动白名单 + 枚举校验不写盘 + 值类型归一 + 三口径一致；CHANGELOG Added |
| **R4** | 审查条目**收敛单入口**；`view add` 弃用（下版本删除） | T37 | `addReviewEntry`/`generateReviewId` 单点；仅 TTY stderr；CHANGELOG Deprecated；登记项成文 |
| **R5** | 覆盖补 **4 项**，其余 7 族仅登记 | T46 | `test/commands/{stage,update,setup}.test.ts` + `test/cli/repl.test.ts` |
| **R6** | coverage **仅报告不阻断** | T18③ | `vitest.config.ts` 无 `thresholds`；CI 独立报告步骤 |

---

## 三、知识沉淀（本轮 5 条，全部新增）

| # | 分类 | 条目 | 依据 |
|---|------|------|------|
| 1 | patterns | 全量审查发现的批量清理方法论：主题分批 + T 编号化 + 裁定回写 | T1~T57 / 6 批次 A~F / 收口零空格子 |
| 2 | patterns | 跨阶段「契约先行」协同：单一 owner + 事前接口约束（禁各自实现） | T1 ↔ stage-51 N4；T8 ↔ stage-51 N9；REV-001 |
| 3 | patterns | CLI 退出码语义：发现问题即非 0 退出 + 不设逃生阀 + 用 `process.exitCode` | T17 / R1 |
| 4 | patterns | 命令面收敛与弃用策略：单入口 + TTY 提示 + 下版本删除登记 | T37 / R4 + REV-004 |
| 5 | troubleshooting | 配置键白名单须 schema 驱动 + 值类型归一：避免字符串 `"true"` 写入破坏配置 | T36 / R3 + REV-002 |

> **去重**：调用 `src/utils/kb-dedup.ts` 的 `findSimilarEntries(target, category, basePath?)`（新增的 `basePath` 参数即本阶段 T8 产物）。**patterns.md / troubleshooting.md 为 CRLF 占优 → kb-dedup 的 `$` 锚点在 CRLF 下失配（已知问题）**，故以 **LF 归一化副本 + 显式 `basePath`** 隔离运行真实模块。最高相似度：C1 3.90% / C2 7.14% / C3 5.66% / C4 3.98% / C5 4.29%，**均 ≪ 80%** → **5 条全部新增**，无需合并。

---

## 四、Bug 沉淀

- **`templates/BUG-003`（low）关闭**：5 个部署型 skill 模板「用户环境主口径 `openfeel <cmd>` + 本仓自举加注」双口径落地（`node bin/openfeel.js` 计数各 = 1 仅加注行），3 个原无加注 skill（health/model-check/recover）补齐，`npm run build` 幂等 + 轻量断言；满足与 `U4-001` 的关闭条件（op-006 T53）。
- **新登记 `cli/BUG-004`**（low，open，非阻塞）：en 模式下 `--help` 的 Arguments 描述仍为中文（T38 只落地 `walkCmd` 遍历机制，23 处 `.argument()` 仅 `stage.create` 补键）→ **建议归 `v1.1.2-stage-51`**（该阶段大量触及 CLI/i18n，与 REV-004 下版本 `view add` 移除一并收口）。
- 统计：**11 条（open 1 / closed 10）**。

---

## 五、需 Feel 执行的命令（flow.json 不直写）

```bash
# 将 stage-50 标记为完成（唯一状态变更；归档官不直写 flow.json）
node bin/openfeel.js flow advance --stage v1.1.2-stage-50 --to done
```

> 归档完成后的阶段 phase 必须为 `done`（不得用 `completed` 等非标准值）。`archive_stage` 审计条目由该 `flow advance --to done` 补记。**stage-51 已在 flow.json 中为 `scheme_pending`（checkpoint `v1.1.2-stage-51-...scheme_pending.json` 存在），本归档不触碰。**

---

## 六、偏差与遗留

1. **未运行 `openfeel archive`（沿用先例）**：CLI `archive` 有三项副作用——覆盖手工摘要 / `appendLog` + `save()` 直写 `flow.json`（越权）/ 对 closed REV 绕过去重追加低质条目。故改为**手工生成归档摘要**，`archive_stage` 审计条目由 Feel 的 `flow advance --to done` 补记。
2. **`status.md` 与 `flow.json` phase 不一致观察**（沿用历史）：`plan/v1/stage-50/status.md` 自创建起为 `planned`（manual 模式系统性滞后），`flow.json` 已至 `archiving`。**以 `flow.json` 为准**；本阶段由归档官刷新为 `done` 并留痕，不引入机制修复。
3. **归档官未重复 `npm test`/`npm run build`**：回归与门禁数字采信执行/测试官独立实测（一致：54 文件 / 790 用例、`lint i18n` 560 键、`lint kb` 0 过期）。归档官仅执行文档/kb/索引写入与行尾保持。
4. **`CHANGELOG` `[1.1.2]` 发布日期保持 `2026-09-29`**（未改）：沿用 stage-49 先例（stage-49 向同一节追加 Fixed 条目时亦未改日期）；发布时机待用户决定，是否刷新发布日期由 Feel/用户裁定。
5. **`REV-004`（low）未修**：`help.view.add` 域键未同步弃用文案（`applyHelpI18n` 用 `help.<path>` 覆盖 `.description()`）——测试官裁定「可接受、非阻塞」；**与下版本移除 `view add` 合并修**（归 stage-51 或下版本）。
6. **登记项（7 条，归后续版本）**：① 下一版本移除 `openfeel view add`（R4）；② 命令层覆盖缺口其余 7 族（R5）；③ `lint --warn-only` 逃生阀（不加）；④ coverage 阈值收紧路径（R6）；⑤ `update_infos` 自动化清理（R2）；⑥ `U3-008`（已在本归档修正）+ 其余文档类；⑦ `U3-010` 文档注明 + `U8-012①②` 历史归档只读（只注记不改原文）。
7. **跨阶段契约（供 stage-51 复用）**：`FlowManager.syncCurrentOp(stageName): { stage, op }`（`current.op` 单一 owner，`rg` 4 处无双实现）；`findSimilarEntries(target, category, basePath?)`（`basePath` = `.openfeel/kb` 绝对路径，缺省调用时解析，`resolve('.openfeel/kb')` 全仓仅 1 处）。已登记于 `code_review/v1.1.2-stage-50.md` 与 op-007 收口报告 §三。
8. **归档官边界**：本阶段源码改动已由 executor 完成；归档官仅改 `docs/**`、`README*`、`.openfeel/**`、`CHANGELOG.md`（**均非 `src/**`**），符合「归档和沉淀知识，不修改源码」边界。
