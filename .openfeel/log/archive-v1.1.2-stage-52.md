# v1.1.2-stage-52 归档 — 反馈 09（可编排性/可观测性）+ 遗留清账 + 约束体系精简

- **归档 Agent**：openfeel-archiver（deepseek-flash）
- **归档时间**：2026-10-01（本地）
- **阶段**：`v1.1.2-stage-52`（**14 op**：主链 op-001~011 + 修复轮 op-012/013/014；归档时 phase = `archiving`，目标 phase = `done`，由 Feel 执行 CLI）
- **实现 commit**：主链 `c6d89f6`(op-001 B1+B8) / `e94a35e`(op-003 B2+L7) / `a8109cb`(op-004 B5) / `7e950b9`(op-005 B3+B4) / `0cca773`(op-006 B6) / `aa8975a`(op-007 L5) / `884f31b`(op-002 B7+B9) / `9fffb5c`(op-008 L8) / `95e690c`(op-009 A4) / `79ec7a4`(op-011 C1~C4) / `b655ce5`(op-007 补全) / `facf825`(op-010 收口)；修复轮 `6abd4fb`(op-012) / `820855b`(op-013) / `9e56c45`(op-014)
- **来源**：`docs/phase-5/09-openfeel-automation-feedback.md`（8 条）+ v1.1.2 遗留 L1~L8 + 用户裁定 C1~C4 —— **逐条先在当前代码实测验证**（重复项仅登记不修）；**继续 v1.1.2，不改版本号**
- **前置**：`v1.1.2-stage-51`（hard；`flow-manager.ts`/`commands/flow.ts`/`plan.ts`/`core/plan/scheme.ts` 热区串行 + B3/B4 依赖 N8/N1）；soft `stage-50`（`lint` 退出码 R1）
- **后继**：无固定后继（v1.1.2 收尾）；`v1.1.2-stage-53`（current/dev_last 重构，hard 依赖本阶段）已归档

---

## 一、归档产物清单

| # | 文件 | 操作 | 说明 |
|---|------|------|------|
| 1 | `.openfeel/log/archive-v1.1.2-stage-52.md` | 新建 | **本归档摘要**（手工生成；未运行 `openfeel archive`，理由见偏差 1） |
| 2 | `.openfeel/code_review/v1.1.2-stage-52.md` | 新建 | 阶段公共审查摘要（结论 `passed`；F1~F8/L1~L8 处置表 + A1~A7/C1~C4 落地表 + REV 清单〔REV-001~003/005~009 全 closed〕+ 验证与门禁 + Bug 收口 + 过程偏差 + 不修/登记） |
| 3 | `.openfeel/code_review/index.md` | 更新 | 统计 `passed 22` → **`passed 23`**；系列总结追加 stage-52 段；v1.1.2 表追加 stage-52 行（**保持全 CRLF**） |
| 4 | `.openfeel/bugs/cli.md` | 更新 | 追加 **`cli/BUG-005`**（medium，空模板子串误报）/ **`cli/BUG-006`**（low，en REV 拒绝文案硬编码中文）两条（`open`，非阻塞；含核心结论/影响范围/建议修复方向/验收记录） |
| 5 | `.openfeel/bugs/index.md` | 更新 | 统计 `open 0 / closed 12 / 合计 12` → **`open 2 / closed 12 / 合计 14`**；cli 模块表追加 BUG-005/006；追加 v1.1.2-stage-52 收口说明 |
| 6 | `.openfeel/kb/patterns.md` | 更新（**+5 条**） | stage 解析归一化统一范式 / CLI `--json` + `schemaVersion` 约定 / 只报告型 vs 修复型命令边界 / draft 两阶段窄兼容 / 多步 REV 复检等价论证（**CRLF 保持**） |
| 7 | `.openfeel/kb/troubleshooting.md` | 更新（**+3 条**） | 空模板检测纯子串匹配误报 / 即席实测误在仓库 cwd 执行真实命令 / 同类缺陷须一次全量扫描而非逐个暴露（**CRLF 保持**） |
| 8 | `.openfeel/kb/index.md` | 更新 | 快速概览「最近更新」刷新为 stage-52（stage-53 转「上一里程碑」）；分类计数 patterns 116 → **121**、troubleshooting 37 → **40**（合计 187 → **195**）；patterns/troubleshooting 摘要表各追加对应行；「最近更新」表追加 stage-52 行（**LF**） |
| 9 | `.openfeel/manual/cli/commands.md` | 更新（+1 节） | 新增「**可编排性与可观测性命令面（v1.1.2-stage-52，反馈 09）**」（`--json`/`--fix`/`ops list`/`draft`+`publish`/`advance --to` 多步/`scheme rename`/`NO_COLOR`/`view add` 移除/`current` 无 op；含 BUG-005/006 标注） |
| 10 | `.openfeel/manual/core/flow-manager.md` | 更新（+1 节 + 审计表 +2 行） | 新增「**可编排性与自愈能力（v1.1.2-stage-52）**」节（`reconcileStatusMd` / `--json` 访问器 / `findPhasePath` BFS / `draft` 守卫 / `listCheckpoints` / 归一化闭包 10 处）；审计表补 `scheme_rename` / `scheme_publish` |
| 11 | `.openfeel/manual/core/plan-path.md` | 更新（+1 行） | 变更历史补 stage-52「**本模块未改**——`normalizeStageId` 被 10 处调用点复用，归档核对确认无需变更」 |
| 12 | `.openfeel/manual/core/config.md` | **核对（无需变更）** | stage-52 op-007 仅改 `config.ts` 的 `console.warn` i18n 文案，非 API/结构变更；已核对确认 |
| 13 | `.openfeel/manual/index.md` | 更新（2 行） | 维护规则：flow-manager 行补 stage-52 检查点、命令注册/i18n 行补 stage-52 命令面 |
| 14 | `CHANGELOG.md` | 更新（`[1.1.2]` 追加 `[stage-52]` 块） | Added/Changed/Removed/Fixed 四组 + 约束体系（C1~C4）+ 登记项（发布日期仍 `2026-09-29`，见偏差 4） |
| 15 | `.openfeel/log/2026/10/01/2026-10-01-Liuary-034.md` | 新建 | 公共日志条目（`stage_archived`；**取 034 号**，取号前扫描 2026-10-01 已用 001~033） |
| 16 | `.openfeel/log/2026/10/01/day_index.md` | 更新 | 追加 stage-52 归档条目（034） |
| 17 | `.openfeel/log/index.md` | 更新 | `## 2026-10` 节追加 stage-52 归档条目 |
| 18 | `.openfeel/log/log.md` | 更新 | 首表追加 stage-52 归档摘要行（034） |
| 19 | `.openfeel/plan/index.md` | 更新 | v1.1.2 系列说明/阶段对照表 stage-52 改**已归档**（13 阶段全部归档） |
| 20 | `.openfeel/plan/plan_log.md` | 更新 | 追加 stage-52 归档条目 |
| 21 | `.openfeel/plan/v1/stage-52/status.md` | 更新 | `planned` → **`done`**（状态一致性观察，以 `flow.json` 为准） |
| 22 | `.openfeel/roadmap/v1.1.2.md` | 更新 | M8 `done`；阶段完成改 **13/13**（41~53）；收官摘要刷新（测试 979）；发布行改「就绪」；修订记录追加 |
| 23 | `.openfeel/dev/current.md` | 更新 | 统计刷新（59 文件 / **979 用例**、kb **195**、Bug 14）+ 里程碑表 stage-52 行改「归档完成」 |
| 24 | `.openfeel/users/Liuary/dev_last.md` + `dev_last/*.md` | 更新 | 索引 + 主题文件（`last-operation` / `pipeline-state` / `pending` / `decisions` / `experience`）登记本轮遗留与收尾（按新格式） |
| 25 | `.openfeel/users/Liuary/log/archive-v1.1.2-stage-52-report-2026-10-01.md` | 新建 | 完整归档报告（私域） |

> **未触碰**：`flow.json`（**不直写**）；`src/**`（归档官不改源码）；`.openfeel/plan/v1/stage-52/ops/**`（历史归档只读）。

---

## 二、用户裁定落地（A1~A7 + C1~C4，2026-10-01，权威）

| 裁定 | 结论 | 落地（op） |
|:--:|------|:--:|
| **A1** | 引入 `draft`，**窄兼容** | op-005（op-005 窄兼容 5 条含 attempt 双层守卫） |
| **A2** | `--fix` **仅回写 status.md「状态」字段** | op-003 |
| **A3** | `--to` 自动逐步 + 每步 REV 复检 | op-004 |
| **A4** | **本阶段直接移除 `view add`**（破坏性） | op-009 |
| **A5** | `kb-dedup` CRLF 归一化修复 | op-008 |
| **A6** | 文件孤儿**不加清理入口**，仅报告 | op-003 |
| **A7** | B9 实测后定编码方案 | op-002（实测不复现 → 不做 hack） |
| **C1~C4** | 约束体系精简 + B 组阈值定性化 | op-011 |

---

## 三、知识沉淀（8 条：patterns 5 + troubleshooting 3）

| # | 分类 | 标题 | 依据 | 去重 |
|---|------|------|------|------|
| 1 | patterns | 短名/全名 stage 解析归一化的统一范式：调用点归一化 + 双键回退 + 闭包式全量扫描 | op-012/013/014（REV-005/007/009） | 2.54% → 新增 |
| 2 | patterns | CLI `--json` 结构化输出约定：顶层对象 + `schemaVersion` + 纯 JSON 单文档 | op-001（B1）+ B9 | 3.80% → 新增 |
| 3 | patterns | 「只报告型」与「修复型」命令的边界：默认零写盘 + 显式 `--fix` 仅回写可对账字段 | op-003（B2/A2） | 2.02% → 新增 |
| 4 | patterns | 两阶段状态 draft/publish 的窄兼容设计：扩取值域 + 未发布隔离 | op-005（B4/A1） | 1.47% → 新增 |
| 5 | patterns | 多步推进的 REV 阻塞复检：论证等价为主 + 每步复检加固 | op-004（REV-52-001） | 12.50% → 新增 |
| 6 | troubleshooting | 空模板检测纯子串匹配误报：正文引用占位标记即被误判未填充 | `cli/BUG-005` | 0.52% → 新增 |
| 7 | troubleshooting | 即席实测误在仓库 cwd 执行真实命令：fixture 前须显式断言 cwd | op-014 exec_review 偏差 | 2.00% → 新增 |
| 8 | troubleshooting | 同类缺陷须一次全量扫描而非逐个暴露：stage 解析归一化三轮修复教训 | REV-005/007/009 | 2.44% → 新增 |

> **去重口径**：`kb-dedup` CRLF 已由本阶段 op-008 修复 → 直接用 `dist/utils/kb-dedup.js` 的 `findSimilarEntries(text, category, basePath)` 计算；8 条候选最高 **12.50%**（≪ 80% 阈值）→ **全部新增**，无合并。

---

## 四、Bug 收口

- **新登记 `cli/BUG-005`（medium，open，非阻塞）**：空模板检测为纯子串匹配（`EMPTY_TEMPLATE_MARKER='- [ ] 待补充'`，`isTemplateEmpty`/`detectFillState`/`publishScheme` 均 `content.includes(marker)`）→ op 正文引用该字面量即被误判未填充（① `plan scheme publish` **误拒**〔功能性〕；② `flow ops list` 误报 `(empty)`；③ `flow health` 误报空模板〔本仓实测 op-005〕）。建议检测收紧为整行/列表项匹配。
- **新登记 `cli/BUG-006`（low，open，非阻塞）**：en 模式下 `flow advance --to done` 的 blocking REV 拒绝文案硬编码中文（`flow.ts:742-743`，未走 `t(...)`）。**预存量**（源自 `98fd2dd` op-002），与 `cli/BUG-004` 同族（en 泄漏）；op-007 仅覆盖 `console.warn`。
- **统计**：`open 2 / closed 12 / 合计 14`。

---

## 五、需 Feel 执行的命令（flow.json 不直写）

```bash
# 将 stage-52 标记为完成（唯一状态变更，归档官不直写 flow.json）
node bin/openfeel.js flow advance --stage v1.1.2-stage-52 --to done
```

> 归档完成后阶段 phase 必须为 `done`（不得使用 `completed` 等非标准值）；`archive_stage` 审计条目由该 `flow advance --to done` 补记。stage-52 为 v1.1.2 收尾阶段，完成后**十三阶段（41~53）全部 `done`**（stage-53 已 `done`），可发布 1.1.2。

---

## 六、偏差与登记

1. **未运行 `openfeel archive`**（沿用先例）：CLI `archive` 具三副作用——覆盖手工摘要 / `appendLog` + `save()` 直写 `flow.json`（越权）/ 对 closed REV 绕过去重追加低质条目；故改为**手工生成归档摘要**，`archive_stage` 审计条目由 Feel 的 `flow advance --to done` 补记。
2. **`status.md` 与 `flow.json` phase 不一致观察**（沿用历史）：`stage-52/status.md` 自创建起为 `planned`（manual 模式系统性滞后），`flow.json` 已至 `archiving`；**以 `flow.json` 为准**，本阶段由归档官统一刷新为 `done` 并留痕。
3. **归档官未重复 `npm test`/`npm run build`**：回归与门禁数字采信执行/测试官独立实测（一致：59 文件 / 979 用例、0 skipped、`tsc` 0、build 幂等、`lint i18n` 724 键、`lint kb` 0 过期）；归档官仅执行文档/kb/索引写入与行尾核验。
4. **`CHANGELOG` `[1.1.2]` 节发布日期保持 `2026-09-29`**：未改（沿用 stage-49/50/51/53 先例）；发布时机待用户决定是否刷新。
5. **L8 解析量口径**：计划基线 105/31（@提交点 `9fffb5c` 精确一致）；归档期实测 107/32，系 stage-53 归档新增 kb 条目的正常增长，非缺陷（测试报告 §六已复核）。
6. **`flow phases --json` 键数**：实际含 `transitionsDiff`（stage-50 T19 既有），plan §5.4「三键」表述陈旧但无害（测试报告 §十一观察项 2）。
7. **过程偏差（测试隔离事故）**：executor 在 T3 实测中误在仓库 cwd 运行 `openfeel archive`，`flow.json` 被写（+1 日志 / rev 441）+ 误生成文件；即时回滚（rev 440、删误产物）；审查官独立核验**无数据损坏**（rev=442、log 815、`archive_stage` 10 条均合法），裁定「误跑=违规、回滚=合规应急」，整改：fixture 前显式 `Push-Location` + 断言 cwd。详见 `code_review/v1.1.2-stage-52.md` 与 `kb/troubleshooting.md`。
8. **登记项（非阻塞，归后续版本）**：`cli/BUG-005`（medium）/ `cli/BUG-006`（low）/ `lint --warn-only`（不加）/ coverage 阈值（暂不设）/ 历史日志布局（不迁移）/ 文件孤儿治理入口（按 A6 仅报告）；`setStatusField` 与 core 状态写函数下沉合并（op-003 登记）。
9. **部署延迟（非缺陷）**：`~/.config/opencode/AGENTS.md` 与全局 skill（op-011 模板改动）须用户运行 **`openfeel setup`** 方生效（本阶段不自动执行、未触碰真实全局目录）。
10. **归档官边界**：本阶段源码改动均由 executor 完成；归档官仅改 `CHANGELOG.md` / `.openfeel/**` / 私域日志，**未改 `src/**`**，符合「归档和沉淀知识、不修改源码」边界。
