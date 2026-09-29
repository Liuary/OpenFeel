# v1.1.2-stage-49 归档 — 整仓全量审查 + blocking 修复（本轮收尾）

- **归档 Agent**：openfeel-archiver（deepseek-flash）
- **归档时间**：2026-09-30（本地）
- **阶段**：`v1.1.2-stage-49`（整仓全量审查 + 4 条 blocking 修复）｜进入时 phase = `archiving`｜出口 phase = `done`（由 Feel 执行 CLI）
- **实现 commit**：`3f023e3`（op-010 B1+B2）/ `1a8546a`（op-011 B3+B4）
- **需求**：对整个仓库做一次系统审查（8 单元 × 6 维度，范围不限 v1.1.2），产出报告 + REV，blocking 当阶段修、其余按裁定流转；**纯审查 + 仅修 4 条 blocking，不改版本号（仍 1.1.2）**
- **前置**：`v1.1.2-stage-48`（已 done，硬依赖）｜**本轮整体**＝stage-48（事件加固 + 13 项遗留，含 455 死映射清理）+ stage-49（整仓审查 + 4 blocking 修复）

---

## 一、归档产物清单

| # | 产物 | 类型 | 说明 |
|---|------|------|------|
| 1 | `.openfeel/log/archive-v1.1.2-stage-49.md` | 新建 | 本归档摘要（**手工生成**，未运行 `openfeel archive`，理由见第六节偏差 1） |
| 2 | `.openfeel/code_review/v1.1.2-stage-49.md` | 更新 | 阶段公共摘要：结论改为 **passed** + 新增「结案记录」表（4 blocking 修复 / 提交 / 门禁 / 发布实测 / 代码审查 / 修复范围 / 流转） |
| 3 | `.openfeel/code_review/index.md` | 更新 | 统计 `pending 1 / passed 18` → `pending 0 / passed 19`；系列总结行刷新（stage-49 → `passed`；测试 706 → **716**、i18n 531 → **533**；末尾「可发布 1.1.2」）；stage-49 行状态 `pending` → `passed` + 补修复闭环摘要（**保持全 CRLF：66/66**） |
| 4 | `.openfeel/bugs/templates.md` | 更新 | `templates/BUG-003` 状态行补「stage-49 裁定：归后续补丁阶段」；新增「裁定记录（v1.1.2-stage-49，2026-09-30）」——合并处置（并入 U4-REV-001）/ 范围扩围（29 行 2 skill → **34 行 5 skill**）/ 裁定与去向 / 口径判据沉淀 / 状态维持 open |
| 5 | `.openfeel/bugs/index.md` | 更新 | 新增「v1.1.2-stage-49 收口」说明段：**本轮无新 Bug 登记**（4 blocking 以 REV 形式登记并修复闭环）；BUG-003 扩围 + 裁定；统计维持 **10 条（open 1 / closed 9）** |
| 6 | `.openfeel/kb/patterns.md` | 更新（+6 条） | 新增：整仓全量审查的单元划分与覆盖矩阵方法 / 全量审查的发现分类与流转裁定 / 全量审查的结论复核纪律 / `--dry-run` 必须字节级不写盘 / 死导出·漂移 API 清理判据 / 部署语境 vs 本仓语境命令口径二分（**CRLF 保持：2666/55**） |
| 7 | `.openfeel/kb/troubleshooting.md` | 更新（+1 条） | 新增：随包 postinstall 在用户端路径层级失效（**CRLF 保持：735/0**） |
| 8 | `.openfeel/kb/index.md` | 更新 | 快速概览「最近更新」刷新为 stage-49；分类概览（patterns 100 → **106**、troubleshooting 34 → **35**，用途串追加）；各分类摘要新增 7 行（patterns 6 + troubleshooting 1）；最近更新表首行插入 stage-49（**LF 保持：280/0**） |
| 9 | `.openfeel/manual/cli/commands.md` | 更新（3 处） | `flow advance` 补 dry-run 字节级不写盘（B1）；`flow health` 补第 7 项悬空依赖检测（B2）；`plan stage add --deps` 补存在性校验（B2） |
| 10 | `.openfeel/manual/core/flow-manager.md` | 更新（API 表 +1 行 / +1 节） | 新增 `autoRepairInconsistency(stageName, options?)` 行；「dry-run 自动修复预览与悬空依赖检测（v1.1.2-stage-49）」节（B1/B2） |
| 11 | `.openfeel/manual/core/build.md` | 更新（+1 节 +1 行） | 新增「发布元数据与死导出清理（v1.1.2-stage-49）」（B3/B4）；变更历史补 stage-49 行 |
| 12 | `.openfeel/manual/index.md` | 更新（1 行） | build 维护规则行补「发布元数据（`files`/`engines`/`postinstall`）与主入口死导出清理」 |
| 13 | `docs/commands.md` | 更新（文档类修复 6 处） | 版本头 → v1.1.2 快照 + 以 `--help` 为准；`flow phases --json` 补 `advanceAccepted`；`flow advance` `--op`（必填）→ **`--stage`（必填）** + dry-run/force 选项；`flow review add` 补 `--auto-fix`/`--blocking`；**新增 6 个命令组节**（lint/stage/model/setup/migrate/project）；update 节补 `opencode.jsonc` 深度合并 |
| 14 | `docs/GETTING_STARTED.md` | 更新（1 处） | 版本头 `1.0.0` → v1.1.2 快照 + 以 `--help` 为准 |
| 15 | `README.md` | 更新（1 处） | 默认模型表述 `Alibaba-CN（多模态）` → `DeepSeek-flash（多模态视觉）`（对齐 zh/en 与权威源） |
| 16 | `README.zh-CN.md` | 更新（3 处） | 删重复 `openfeel update` 行；`事务官｜事务官` → `Utility｜事务官`；测试 `395` → `716`；命令参考补 7 组（setup/migrate/model/stage/project/view/instructions） |
| 17 | `README.en.md` | 更新（2 处） | 删重复 `openfeel update` 行；测试 `395` → `716`；命令参考补 7 组 |
| 18 | `.openfeel/log/2026/09/30/2026-09-30-Liuary-001.md` | 新建 | 公域日志（title + 详情 + 偏差登记）——编号 **001**（取号前扫描 2026-09-30 无已用编号） |
| 19 | `.openfeel/log/2026/09/30/day_index.md` | 新建 | 当日索引（首个条目，LF） |
| 20 | `.openfeel/log/index.md` | 更新 | 2026-09 节追加 stage-49 归档行 |
| 21 | `.openfeel/log/log.md` | 更新 | 主表首行插入条目行 |
| 22 | `.openfeel/plan/index.md` | 更新 | v1.1.2 系列导航行改为「**stage-41~49 全部归档**」；阶段对照表新增 stage-49 行 |
| 23 | `.openfeel/plan/plan_log.md` | 更新 | 表首插入 stage-49 归档条目 |
| 24 | `.openfeel/plan/v1/stage-49/status.md` | 更新 | `planned → done`（并记录 status.md 与 flow.json phase 不一致观察，见偏差 2） |
| 25 | `.openfeel/roadmap/v1.1.2.md` | 更新 | M5 整仓审查 → done；收官摘要追加「＋ 48/49」；修订记录补 stage-49 归档行 |
| 26 | `.openfeel/dev/current.md` | 更新 | 收官状态 + 统计（测试 716、kb 条目数）+ 里程碑表补 stage-48/49 |
| 27 | `.openfeel/users/Liuary/dev_last.md` | 覆盖 | 会话状态覆盖写入（含决策历史、经验暂存、~40 条 non-blocking 清单指引） |
| 28 | `.openfeel/users/Liuary/log/archive-v1.1.2-stage-49-report-2026-09-30.md` | 新建 | 本报告（完整版） |

> **未产出**：`flow.json`（**不直写**，见第五节需 Feel 执行的命令）。

---

## 二、blocking 修复归档（B1~B4，commits `3f023e3`/`1a8546a`）

| # | 条目 | 证据（独立复现） | 落地 |
|---|------|------------------|------|
| B1 | U2-REV-001 `flow advance --dry-run` 校验前 autoRepair 写盘 | 隔离 fixture 实测 revision 2→3、phase 被改写；`autoRepair` + `save()` 位于 dry-run 分支之前 | `autoRepairInconsistency(stageName, {dryRun?})` 预览模式（只算不赋值）+ 命令层仅非 dry-run 才 `save()` + 预览专用键 `flow.advance.autoRepairPreview`；回归断言 dry-run 字节/revision/phase 不变 |
| B2 | U2-REV-002 `plan stage add --deps` 悬空依赖静默入库 | 实测 `--deps stage-99` EXIT=0、`deps` 入库；health 无告警 | 命令层 `normalizeStageId` 归一化校验 `deps ⊆ 已注册 stages`（无效 / 未初始化均 exit 1；新增键 `plan.stage.invalidDepsTmpl`）+ 核心层 `checkDanglingDeps`（`!quick`，warn） |
| B3 | U7-REV-U7-01 postinstall 用户端必然静默失效 + engines 崩坏 | 用户端扁平化布局模拟实测「文件不存在，跳过」×2、EXIT=0；`@inquirer/core@11.2.1` 要求 `^20.17.0` vs 本包 `>=20.0.0` | 删 `postinstall` + 删 `scripts/patch-inquirer.js` + `files` 去 `scripts` + `engines >=20.17.0`（不做 engine-strict——对消费者无效） |
| B4 | U7-REV-U7-02 `src/index.ts:10` VERSION 死导出 | 全仓零引用、值 `0.1.0` 与 1.1.2 漂移、经 `exports["."]` 暴露 | **删而非同步** + `npm run build` 重生成 dist（`'VERSION' in exports === false`）+ `CHANGELOG` 3 条 Fixed；`--version` 仍 1.1.2 |

**代码审查（exec_review）**：**通过，零阻塞、零新增 REV**；REV-006（build 互斥组）/ REV-007（两处微瑕）方案侧已改并 closed；`REV-49-005`（基线 694→706）closed。

---

## 三、知识沉淀（本轮 7 条，全部新增）

| # | 分类 | 条目 | 依据 |
|---|------|------|------|
| 1 | patterns | 整仓全量审查的单元划分与覆盖矩阵方法：以 `src/**/*.ts` 全量映射保证 MECE | U1~U8；实测 62/62；计划审查 MECE 缺口（REV-49-001） |
| 2 | patterns | 全量审查的发现分类与流转裁定：blocking 当阶段 / 非阻塞补丁 / 文档归归档官 / 历史只读 | 总报告 §二/§五；M1~M5 去重 + U4 vs U6 矛盾裁定 |
| 3 | patterns | 全量审查的结论复核纪律：blocking 逐条独立复现 + 非阻塞随机抽验 | op-009 汇总；U8 过程偏差留痕 |
| 4 | patterns | `--dry-run` 必须字节级不写盘：含连带写盘点（autoRepair/checkpoint/log） | B1 |
| 5 | patterns | 死导出/漂移 API 的清理判据：全仓零引用 + 对外暴露即修（删而非同步） | B4 |
| 6 | patterns | 部署语境 vs 本仓语境的命令口径二分：产物落点是唯一判据 | `templates/BUG-003` + U4-REV-001 |
| 7 | troubleshooting | 随包 postinstall 在用户端路径层级失效：包内脚本假设 rootDir 且静默跳过 | B3 |

> **去重**：调用 `src/utils/kb-dedup.ts` 的 `findSimilarEntries()`（CRLF 失效→以 LF 归一化副本 + 隔离 cwd 实跑真实模块）。最高相似度 **8.65% ≪ 80%**（对应「纯全局部署命令模式」），**7 条全部新增**，无需合并。

---

## 四、Bug 沉淀

- **本轮无新 Bug 登记**：4 条 blocking 以 **REV** 形式登记（`code_review/v1.1.2-stage-49.md`）并经 op-010/op-011 修复闭环，未开 Bug 单。
- **`templates/BUG-003`（low，open）**：与 `REV-v1.1.2-stage-48` REV-009② **合并并入 U4-REV-001**；范围由 **29 行/2 skill 扩至 34 行/5 skill**（新增 health/model-check/recover 三个 skill 无二态加注）；**裁定归后续补丁阶段**（stage-49 未夹带 non-blocking），状态维持 `open`；口径判据已沉淀至 `kb/patterns.md`。
- 统计维持 **10 条（open 1 / closed 9）**。

---

## 五、需 Feel 执行的命令（flow.json 不直写）

```bash
# 将 stage-49 标记为完成（唯一状态变更；归档官不直写 flow.json）
node bin/openfeel.js flow advance --stage v1.1.2-stage-49 --to done
```

> 归档完成后的阶段 phase 必须为 `done`（不得用 `completed` 等非标准值）。`archive_stage` 审计条目由该 `flow advance --to done` 补记。

---

## 六、偏差与遗留

1. **未运行 `openfeel archive`（沿用先例）**：CLI `archive` 有三项副作用——覆盖手工摘要 / `appendLog` + `save()` 直写 `flow.json`（越权）/ 对 closed REV 绕过去重追加 `patterns` 低质条目。故改为**手工生成归档摘要**，`archive_stage` 审计条目由 Feel 的 `flow advance --to done` 补记。
2. **`status.md` 与 `flow.json` phase 不一致观察**（测试官发现，归档官记录）：`plan/v1/stage-49/status.md` 长期为 `planned`（manual 模式系统性滞后——阶段创建时 planned，实际全流程后才由归档官刷新），而 `flow.json` phase 已至 `test_pending`/`archiving`。**本次不引入机制修复**（已有历史观察项），仅记录并要求归档时以 `flow.json` 为准、由归档官统一刷新 status.md。
3. **文档类修复的边界**：`docs/**` 与 `README*` 为**纯文档**，归档官**已直接修复**（13~17 号产物）。下列属**模板/源码**、修改后须 `npm run build` 同步生成段与自举实例，**超出归档官「不改源码」边界**，**顺延 executor / 后续补丁阶段**：
   - `templates-data/agents-md/en.md:438` 流转图注「验收不通过」未译（U4-REV-002）；
   - `openfeel-cli-usage` skill 枚举缺 `phases`/`stage` + 命令表缺 5 命令族（U4-REV-003）；
   - `build.js` 注释计数漂移（U4-REV-004）；
   - 部署型 skill 34 行口径（U4-REV-001 / BUG-003）。
4. **~40 条 non-blocking 待后续补丁阶段**：详见 `v1.1.2-stage-49-全量审查总报告.md` §四/§五 与各单元报告；建议**按「内部模式一致性」分批打包**（op 分割写法统一 / 守卫收口 / 错误处理模式），而非零散修改。清单指引已写入 `dev_last.md`。
5. **历史归档只读**：U8-012①②（op-008 行号/行数漂移）与 U6 §七 历史核验，**只注记不改原文**。
6. **U8 过程偏差（如实留痕）**：U8 审查中一次 rollback 实测遗漏隔离 env，对真实 `~/.openfeel/update_state.json` 做了「内容不变重写」（mtime 更新、数据完整性未受损）；整改要求（真实路径即席实测先显式注入隔离 env + 写类实测打印目标路径断言 + 脚本落盘）已写入总报告 §六.3 与 kb。
