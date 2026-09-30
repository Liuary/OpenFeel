# v1.1.2-stage-51 归档 — 流水线状态维护与 CLI 可维护性（反馈 08）

- **归档 Agent**：openfeel-archiver（deepseek-flash）
- **归档时间**：2026-10-01（本地）
- **阶段**：`v1.1.2-stage-51`（流水线状态维护与 CLI 可维护性·反馈 08，N1~N11 / 9 op；归档时 phase = `archiving`，目标 phase = `done`，由 Feel 执行 CLI）
- **实现 commit**：`a008f69`（op-001 N1 孤儿 op 回收）/ `5ebd114`（op-002 N2 结构字段 CLI + REV-004）/ `4fb86dd`（op-003 N3 注册语义统一）/ `3f46514`（op-004 N4 `current.op`）/ `5d4ea6b`（op-006 N8 op 文件名）/ `b59705a`（op-008 N10/N11 日志未来写入 + git 降噪）/ `b538bdc`（op-005 N5/N6/N7）/ `1aba277`（op-007 N9/A6 knowledge dedup）/ `34385a4`（op-009 收口）
- **来源**：`docs/phase-5/08-openfeel-workflow-feedback.md`（11 条，Feel 逐条核实）+ `plan/v1/stage-51/plan.md`（N1~N11）——**继续 v1.1.2，不改版本号**
- **前置**：`v1.1.2-stage-50`（已 done，硬依赖）+ 跨阶段契约（T1 `syncCurrentOp` / T8 `basePath`）
- **后继**：无固定后继（v1.1.2 收尾；`npm publish` 待用户决定）

---

## 一、归档产物清单

| # | 文件 | 操作 | 说明 |
|---|------|------|------|
| 1 | `.openfeel/log/archive-v1.1.2-stage-51.md` | 新建 | **本归档摘要**（手工生成；未运行 `openfeel archive`，理由见偏差 1） |
| 2 | `.openfeel/code_review/v1.1.2-stage-51.md` | 新建 | 阶段公共审查摘要（结论 `passed`；范围 N1~N11 / 3 批次 H1~H3 / 9 op + A1~A8 落地表 + REV 清单〔REV-004 closed〕+ 验证与门禁 + Bug 收口 + 不修/登记/归档） |
| 3 | `.openfeel/code_review/index.md` | 更新 | 统计 `passed 20` → **`passed 21`**；系列总结束追加 stage-51；v1.1.2 表追加 stage-51 行（**保持全 CRLF，68/0**） |
| 4 | `.openfeel/bugs/cli.md` | 更新 | `cli/BUG-004` 状态 `open` → **`closed`**；补「关闭记录」（20 处〔+1 新增〕按 op 分派表 + 运行时 33 命令门禁 + 口径澄清）与验收记录 |
| 5 | `.openfeel/bugs/index.md` | 更新 | 统计 `open 1 / closed 10 / 合计 11` → **`open 0 / closed 11 / 合计 11`**；cli 模块 BUG-004 改 closed；追加 v1.1.2-stage-51 收口说明 |
| 6 | `.openfeel/kb/architecture.md` | 更新（+1 条） | 新增 **「纠正侧能力对称原则：创建侧齐备 → 补齐纠正/清理侧 CLI」**（能力三分类 + 配套原则四则） |
| 7 | `.openfeel/kb/patterns.md` | 更新（+4 条） | 新增 孤儿检测与安全清理 / 幂等写入（同值 no-op + 按需备份）/「未来写入统一 + 历史共存」渐进收敛 / 暴露内部模块为 CLI 子命令的判据（**CRLF 保持 2730+**） |
| 8 | `.openfeel/kb/troubleshooting.md` | 更新（1 条批注） | 既有「kb-dedup CRLF 静默失效」条目追加「**更新于 2026-10-01**」：`openfeel knowledge dedup` 同受影响 + 归档绕过法（LF 归一副本 + `--project`）+ 根因修复建议（**CRLF 保持**） |
| 9 | `.openfeel/kb/index.md` | 更新 | 快速概览「最近更新」刷新为 stage-51；分类计数 architecture 25 → **26**、patterns 110 → **114**、troubleshooting 36（更新）、setup 6（合计 **182**）；三处摘要表追加/更新对应行；最近更新表追加 stage-51 行（**LF**） |
| 10 | `.openfeel/manual/cli/commands.md` | 更新（+1 节 +3 处） | 新增「**纠正/清理侧命令面**」节（`plan scheme remove` / `flow repair --prune-orphans` / `flow stage set --deps` / `flow review update·remove` / `flow advance --quiet` / `stage set` 三态幂等 + 字段 / `stage task --add` / `plan stage add --tasks` / `knowledge dedup` / op 命名 `op-NNN.md`）；i18n 节 BUG-004 收口；`flow health` 增第 8 项孤儿 warn；`stage set` 主条目指向新节 |
| 11 | `.openfeel/manual/core/flow-manager.md` | 更新（+1 节 +1 行） | 新增「**纠正侧能力与孤儿对账（v1.1.2-stage-51）**」节（`removeScheme` / `findOrphanOps` / `repair` 集成 / `healthCheck` 第 8 项 / `ensureStageSkeleton` / op 命名 + `extractTitle` / `recordAttempt` 复用 `syncCurrentOp`）；`syncCurrentOp` API 行补「N4 起 `recordAttempt` 两分支调用」 |
| 12 | `.openfeel/manual/index.md` | 更新（3 行） | 维护规则：flow-manager（纠正侧能力）、plan/scheme（stage-51 命名/骨架/注销）、命令注册/i18n（纠正侧命令面 + op 命名） |
| 13 | `.openfeel/manual/core/plan-path.md` | **核对（无需变更）** | stage-51 未触及 `core/plan/path.ts`（`normalizeStageId` 等被复用但未改）；已核对确认 |
| 14 | `.openfeel/manual/core/update-infos.md` / `core/global-paths.md` | **核对（无需变更）** | stage-51 未触及 `update-infos.ts` / `global-paths.ts`；已核对确认 |
| 15 | `CHANGELOG.md` | 更新（`[1.1.2]` 追加 `[stage-51]`） | Added/Changed/Fixed 三组：纠正/清理侧命令面、op 命名、日志布局、`advance` 降噪、`stage set` no-op、`cli/BUG-004` / `REV-004` 修复（发布日期仍 `2026-09-29`，见偏差 4） |
| 16 | `.openfeel/log/2026/10/01/2026-10-01-Liuary-011.md` | 新建 | 公共日志条目（`stage_archived`；title + 详情 + 偏差登记；**取 011 号**，取号前扫描 2026-10-01 已用 001~010） |
| 17 | `.openfeel/log/2026/10/01/day_index.md` | 更新 | 追加 stage-51 归档条目 |
| 18 | `.openfeel/log/index.md` | 更新 | 新增 `## 2026-10` 节（含「历史扁平目录与嵌套目录**共存**」布局说明 + stage-51 归档条目） |
| 19 | `.openfeel/log/log.md` | 更新 | 首表追加 stage-51 归档摘要行 |
| 20 | `.openfeel/plan/index.md` | 更新 | v1.1.2 系列说明/阶段对照表追加 stage-51（**11 阶段全部归档**） |
| 21 | `.openfeel/plan/plan_log.md` | 更新 | 追加 stage-51 归档条目 |
| 22 | `.openfeel/plan/v1/stage-51/status.md` | 更新 | `planned` → **`done`**（状态一致性观察，以 `flow.json` 为准） |
| 23 | `.openfeel/roadmap/v1.1.2.md` | 更新 | M7 `done`；阶段完成改 **11/11**（41~51）；收官摘要（测试/门禁/缺陷/知识）刷新；修订记录追加 stage-51 归档 |
| 24 | `.openfeel/dev/current.md` | 更新 | 收官状态（十一阶段）+ 统计（869 / 56 文件、知识 182、Bug 11 closed）+ 里程碑表追加 stage-51 |
| 25 | `.openfeel/users/Liuary/dev_last.md` | 更新 | 会话状态写入（本轮遗留 + `npm publish` 待决 + 下版本移除 `view add`） |
| 26 | `.openfeel/users/Liuary/log/archive-v1.1.2-stage-51-report-2026-10-01.md` | 新建 | 完整归档报告（私域） |

> **未触碰**：`flow.json`（**不直写**）；`src/**`（归档官不改源码）；`docs/**` / `README*`（stage-51 无 docs 依赖）；`.openfeel/plan/v1/stage-51/ops/**`（历史归档只读）。

---

## 二、用户裁定落地（A1~A8，2026-09-30，权威）

| 裁定 | 结论 | 落地（op） | 归档记录 |
|:--:|------|:--:|------|
| **A1** | `scheme create` 隐式注册**补建骨架**（方案②） | op-003（N3） | 抽 `ensureStageSkeleton`，与 `addStage` 骨架**逐字节一致**；空项目 `scheme create` → overview/status/ops 齐备；幂等不覆盖 |
| **A2** | 孤儿 op **默认只报告** + `--prune-orphans` 显式清理；health 增孤儿 `warn` | op-001（N1） | `flow repair` 默认零写盘；`--prune-orphans` 仅清键孤儿；文件孤儿永不自动删；health `warn` 不改退出码 |
| **A3** | `stage set` 同值 → **no-op 成功**；`.bak` 仅确认变更后生成 | op-005（N5） | 三态探测 `not-found`/`unchanged`/`will-change`；同值 exit 0 + 无 `.bak` |
| **A4** | `stage set` 字段白名单 = 状态/执行模式/自动推进/当前责任 Agent/上一责任 Agent | op-005（N7） | 三选项 `--exec-mode`/`--auto-advance`/`--review-agent`；非法值 exit 1 不写盘 |
| **A5** | op 文件名固定 `op-NNN.md` + **不做迁移命令** + 读取端兼容回退 | op-006（N8） | 删 `safeTitle`；`extractTitle(filePath, fileName)` 双读；`plan scheme` 无 `rename`/`migrate` |
| **A6** | `kb-dedup` **暴露为 `openfeel knowledge dedup` 子命令并随包分发** | op-007（N9） | 只读建议；复用 T8 `basePath`（命令层仅传参）；`npm pack` 含 `dist/utils/kb-dedup.js`；模板引用同步 |
| **A7** | 日志**仅统一未来写入** + 不新增历史迁移 + 索引共存 | op-008（N10） | 新日志落嵌套；根索引含嵌套 + 历史扁平 + 布局标注 + 兜底条目；历史目录零改写 |
| **A8** | `advance` 默认仅 `--to done` 提示 + 新增 `--quiet`；不做「源码变更」过滤 | op-008（N11） | 非 done 不调用 `git status`；`--quiet` 完全静默（错误仍 stderr + exit 1） |

---

## 三、知识沉淀（5 条）

| # | 分类 | 标题 | 依据 | 去重 |
|---|------|------|------|------|
| 1 | architecture | 纠正侧能力对称原则：创建侧齐备 → 补齐纠正/清理侧 CLI（可维护性架构） | 反馈 08 核心命题 + N1~N11 全量 | 最高 1.9% ≪ 80% → **新增** |
| 2 | patterns | 孤儿检测与安全清理模式：键孤儿 vs 文件孤儿二分 + 默认只报告 + 显式 `--prune`（单向） | N1 op-001 | ~0.7% → **新增** |
| 3 | patterns | 幂等写入模式：同值 no-op 成功 + 按需备份（先探测后写） | N5 op-005（A3） | ~2.4% → **新增** |
| 4 | patterns | 「未来写入统一 + 历史共存」渐进收敛策略：不迁移历史 + 索引兜底可检索 | N10 op-008（A7） | 未命中 → **新增** |
| 5 | patterns | 暴露内部模块为 CLI 子命令的判据：零引用 + 下游真实需求 → 接线（只读）而非删除 | N9 op-007（A6） | 未命中 → **新增** |
| — | troubleshooting | （**更新**）kb-dedup 去重检索对 CRLF 行尾静默失效 → 追加「`knowledge dedup` 同受影响 + 归档绕过法 + 根因修复建议」 | 本归档期实测 | 既有条目批注 |

> **去重口径**：因 `kb-dedup` 对 **CRLF** 仍失效（`patterns.md` 2730 CRLF / `troubleshooting.md` 758 CRLF，`$` 锚点失配 → 仅解析出极少条目），改用本阶段 A6 暴露的 **`openfeel knowledge dedup --project <tmp>` + LF 归一副本**隔离运行（`basePath` = `<tmp>/.openfeel/kb`）。归一后 5 条候选最高相似度 **< 4%**（≪ 80% 阈值）→ **全部新增**，无合并。**根因修复建议**已记入 troubleshooting 条目（`parseKbFile` 内做行尾归一，一行改动）。

---

## 四、Bug 收口

- **`cli/BUG-004`（low）关闭**：en 模式下 `--help` 的 Arguments 描述仍为中文（stage-50 T38 仅落地遍历机制）。本阶段按**文件所有权单一 owner** 分派补齐 `help.<path>.arg<name>` 双语键——op-002（5 处）/ op-005（8 处）/ op-007（3 处 + 新增 1 处 `knowledge.dedup`）/ op-008（4 处）= **20 处（+1 新增）**；op-009 增**运行时全量枚举门禁**（`test/cli/help-arguments.test.ts`：en 下 `Arguments:` 段 CJK 零命中，**33 个含位置参数的命令**）。测试官隔离 HOME + en 项目验收通过。
- **口径澄清**：BUG 原文「23 处、仅 1 处已补」为记录时点静态 `.argument()` 计数；实际修复面 = 存量 20 + 新增 1 + 已补 1（`stage.create`）；运行时枚举（33）多于静态计数，差异来自 `.command('remove <stageId>')` 形式声明——**以运行时门禁为准**。
- **统计**：**11 条（open 0 / closed 11）**——自 v1.1.2 起累计 Bug **全部清零**。

---

## 五、需 Feel 执行的命令（flow.json 不直写）

```bash
# 将 stage-51 标记为完成（唯一状态变更，归档官不直写 flow.json）
node bin/openfeel.js flow advance --stage v1.1.2-stage-51 --to done
```

> 归档完成后阶段 phase 必须为 `done`（不得使用 `completed` 等非标准值）；`archive_stage` 审计条目由该 `flow advance --to done` 补记。stage-51 为 v1.1.2 收尾阶段，完成后无固定后继。

---

## 六、偏差与登记

1. **未运行 `openfeel archive`**（沿用先例）：CLI `archive` 具三副作用——覆盖手工摘要 / `appendLog` + `save()` 直写 `flow.json`（越权）/ 对 closed REV 绕过去重追加低质条目；故改为**手工生成归档摘要**，`archive_stage` 审计条目由 Feel 的 `flow advance --to done` 补记。
2. **`status.md` 与 `flow.json` phase 不一致观察**（沿用历史）：`plan/v1/stage-51/status.md` 自创建起为 `planned`（manual 模式系统性滞后），`flow.json` 已至 `archiving`；**以 `flow.json` 为准**，本阶段由归档官统一刷新为 `done` 并留痕。
3. **归档官未重复 `npm test`/`npm run build`**：回归与门禁数字采信执行/测试官独立实测（一致：56 文件 / 869 用例、`lint i18n` 649 键、`lint kb` 0 过期〔242 引用〕、`npm pack` 263 文件）；归档官仅执行文档/kb/索引写入与行尾核验。
4. **`CHANGELOG` `[1.1.2]` 节发布日期保持 `2026-09-29`**：未改（沿用 stage-49/50 先例，同批追加条目时日期不随改）；发布时机待用户决定是否刷新。
5. **op-004（N4）偏差**：N4-1（`recordAttempt` 同步 `current.op`）已由 stage-50 `feae65e`（T1）提前落地 → 本阶段**未重复实现**，仅补 N4-2「当前指针」输出 + 2 i18n 键 + 断言；跨阶段契约「仅复用、禁自建」得到遵守。
6. **其他执行期偏差**（已由各 op 修正记录留痕）：`removeScheme` 增 `dryRun` 选项以支持 `--dry-run` 不写盘；`ensureStageSkeleton` 增 `deps?`/`tasks?` 参数保持 `addStage` 行为一致；`knowledge.ts` 局部 `safeTitle` 重命名为 `entryTitle`（行为不变，满足 op-006 验收 8 字面 grep 归零）；i18n 键数高于逐 op 预估（为新增子命令/选项/参数补 help 键，避免 en 触发缺键告警/CJK）。
7. **登记项（7 条，归后续版本）**：① 下一版本**移除 `openfeel view add`**（stage-50 R4 弃用到期，须同批修正 `help.view.add`）；② 覆盖缺口 7 族（stage-50 R5）；③ `lint --warn-only` 逃生阀（**不加**）；④ coverage 阈值收紧（R6）；⑤ 其余 `console.warn` 硬编码中文统一（`scheme.ts` 既有告警）；⑥ 历史日志布局不迁移（A7，仅备查）；⑦ `flow health` **文件孤儿**治理（执行期快照 162 条为历史手工 op 文件未注册键累积；**当前仓库已 0 条**；按 A2 只报告，如需治理建议后续提供「注册补齐」入口——本次不做，避免误注册历史文件）。
8. **运维教训（测试官过程偏差）**：临时项目 `init` 前须先 `New-Item` 目标目录（`openfeel init` 不自动建父级/目标目录），否则静默失败后续命令误在仓库根执行；本次即时清理无残留污染。
9. **归档官边界**：本阶段源码改动均由 executor 完成；归档官仅改 `CHANGELOG.md` / `.openfeel/**` / 私域日志，**未改 `src/**`**，符合「归档和沉淀知识、不修改源码」边界。
