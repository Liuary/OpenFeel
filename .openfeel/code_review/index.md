# 代码审查索引

> 公共域代码审查摘要，按计划阶段组织

## 统计

| 状态 | 数量 |
|------|------|
| pending | 0 |
| passed | 23 |
| failed | 0 |

## v1.1.2 系列审查

> **系列总结（v1.1.2，2026-09-28 ~ 2026-09-29）**：**8 个阶段（41/42/44/45/46/47/43/48）全部 `passed`**（共 **50 条 REV**，全部 `closed`，其中多条 `blocking`）——stage-41（9 REV）/ 42（6）/ 44（3）/ 45（1）/ 46（11）/ 47（5）/ 43（6）/ 48（9）；**stage-49（整仓全量审查）审查完成：8 单元 73 条原始发现（去重 68 条），blocking 4 条全部独立复现成立并由 `op-010`/`op-011` 修复闭环（B1 dry-run 写盘 / B2 悬空依赖 / B3 postinstall 失效+engines / B4 VERSION 死导出），状态 `passed`**。交付主题：**CLI 自描述与可纠错** + **配置口径与流水线状态正确性** + **权限模型修正（实测推翻需求 §二.2）** + **平台描述泛化（零行为变更）** + **部署覆盖前自动备份** + **已登记缺陷集中清理** + **CLI 文档 skill 化与版本 1.1.2 收口** + **事件加固（审查幻觉 / 测试隔离 / 命令口径）与 13 项遗留清零**。测试口径 631 → **716 用例**；`lint i18n` 525 → **533 键**（须以 `node bin/openfeel.js` 为准，PATH 全局旧版会给出错误口径）；`lint kb` **0 过期引用**。**v1.1.2 主线七阶段已收官；stage-49 整仓全量审查完成、blocking 修复闭环（`passed`），可发布 1.1.2。** **追加 stage-50（全量审查 non-blocking 集中清理·第二批）`passed`**：承接 stage-49 总报告 §五 流转裁定，**T1~T57**（6 批次 A~F）由 7 op（`feae65e`~`def6a33`）落地；**用户裁定 R1~R6 全落地**（R1 `lint` 非 0 退出〔无逃生阀〕/ R3 `config set/get` 扩全量 `defaults.*` / R4 审查条目收敛单入口〔`view add` deprecated〕/ R2 保守默认 / R5 补 4 项 / R6 coverage 报告不阻断）；**54 文件 / 790 用例全绿（0 skipped）**、`tsc` 0、build 幂等、`lint i18n` **560 键**、`lint kb` 0 过期；环境零污染；`templates/BUG-003` **关闭**、新登记 `cli/BUG-004`（low）；REV-002/003 已修正、REV-004（low）归下版本。 **追加 stage-51（流水线状态维护与 CLI 可维护性·反馈 08）`passed`**：承接 `docs/phase-5/08-openfeel-workflow-feedback.md`（11 条），编号化 **N1~N11**（3 批次 H1~H3）/ 9 op（commits `a008f69`~`34385a4`）；**用户裁定 A2/A5/A6/A7 全落地**（A2 孤儿默认只报告 + `--prune-orphans`｜A5 op 文件名 `op-NNN.md` + 不做迁移 + 读取端兼容｜**A6 `kb-dedup` 暴露为 `openfeel knowledge dedup` 随包分发**｜A7 日志仅统一未来写入 + 索引共存）；补齐「纠正/清理侧」CLI（`plan scheme remove` + 孤儿对账 / `flow stage set --deps` / `flow review update|remove` / `ensureStageSkeleton` / `syncCurrentOp` 复用 / `stage set` 幂等三态 + 字段扩展 + `stage task --add` / `op-NNN.md` / knowledge 宽容解析 + `knowledge dedup` / 日志布局 + `advance --quiet`）；**56 文件 / 869 用例全绿（0 skipped）**、`tsc` 0、build 幂等、`lint i18n` **649 键**、`lint kb` 0 过期（242 引用）、`npm pack` 263 文件含 `dist/utils/kb-dedup.js`；环境零污染；**REV-004（stage-50 交接）closed**；`cli/BUG-004` **关闭**；知识沉淀 5 条（architecture 1 + patterns 4 + troubleshooting 1 更新）。**v1.1.2 十一阶段（41~51）全部闭环。**

**追加 stage-52（反馈 09 可编排性/可观测性 + 遗留清账 + 约束体系精简）`passed`**：F1~F8 逐条实测（F3/F7/F8 已解决仅登记）+ L1~L8 清账；B1~B9 全部落地（`--json`×6 含 `schemaVersion` / `health --fix` 仅回写「状态」字段 / `ops list` 填充度 + 空模板 warning / `draft` 两阶段窄兼容 / `advance --to` 自动逐步 + 路径预览 / `scheme rename` / `NO_COLOR` 编码保障 / **`kb-dedup` CRLF 修复**〔patterns 2→105 / troubleshooting 0→31〕）；用户裁定 **A1~A7 全落地**（**A4 本阶段移除 `view add`**〔破坏性 + CHANGELOG `Removed`〕、A5 CRLF 归一、A6 文件孤儿仅报告、A7 不做编码 hack）+ **C1~C4 约束体系精简**（简洁约束单行 / B 组阈值定性保留 D 组 / 根 `AGENTS.md` 对齐 / 「14→17」Skill 计数）；修复轮 op-012/013/014 **stage 解析归一化闭包 10 处收口**（`rg` 独立确认无第 11 处）；**59 文件 / 979 用例全绿（0 skipped）**、`tsc` 0、build 幂等、`lint i18n` **724 键**、`lint kb` 0 过期；三段审查零阻塞（**REV-005~009 全 closed**）；测试官 14 项抽验全通过；新登记 `cli/BUG-005`（medium 空模板子串误报）/`cli/BUG-006`（low en REV 拒绝文案）；知识沉淀 8 条（patterns 5 + troubleshooting 3）。

| 阶段 | 摘要 | 状态 |
|------|------|------|
| [v1.1.2-stage-41](v1.1.2-stage-41.md) | CLI 自描述与可纠错能力 — 9 REV（7 closed + REV-008/009 low 非阻塞），631/631 测试 | passed |

| [v1.1.2-stage-42](v1.1.2-stage-42.md) | 配置口径与流水线状态正确性 — 6 REV（REV-001~004/010/011 全部 closed，含 1 条 blocking 修复后闭环），652/652 测试 | passed |

| [v1.1.2-stage-44](v1.1.2-stage-44.md) | 权限模型修正 — 3 REV（REV-001/002/003 全部 closed，REV-003 low 转归档后闭环），658/658 测试（40 文件），18 模板补 `external_directory` + `write`→`edit` + 覆盖语义文档化 | passed |

| [v1.1.2-stage-45](v1.1.2-stage-45.md) | 平台强限定内容「描述泛化」 — 1 REV（REV-001 low 复核 closed），659/659 测试（40 文件），零行为变更（注释/文案/文档/模板 + i18n 双语 7 键 + 泛化锁断言），Bug：templates/BUG-002（medium 非阻塞，归 stage-47） | passed |

| [v1.1.2-stage-46](v1.1.2-stage-46.md) | 部署已有文件备份 + 全局状态文件提示 — 11 REV（REV-001~010 closed 含 3 blocking 修复闭环；REV-011 low 非阻塞 → 归 stage-47），685/685 测试（41 文件），新增 backup.ts（写前备份 + 分区 + manifest + 单锁临界区 + 绝不覆盖）+ update_infos 第三类 backed + 四链路接入 + deployGlobalAsset 破坏性签名变更（9 调用点全改），Bug：config/BUG-002 仅缓解（保持 open，语义修复归 stage-47） | passed |

| [v1.1.2-stage-47](v1.1.2-stage-47.md) | 已登记缺陷集中清理 — 5 REV（REV-001~005 全部 closed，含 2 条 blocking：并行组修正 / BUG-002 修复指令补全），693/693 测试（41 文件）；`config/BUG-002`（high）**语义修复**：`init` 不再覆盖已存在 `config.yaml`（删 stage-46 备份接入块）+ `config/BUG-003` 画像层显式性双条件 + `cli/BUG-001` `--json.advanceAccepted`（存在视图 vs 推进白名单）+ `cli/BUG-002` `StageDirConflictError` + 三入口 i18n 分流（死键消除）+ `archive/BUG-001` deps 守卫 + `save()` meta 守卫 + `removeStage` 事务顺序（`purgeTarget`）+ jsonc 备份失败 A/B 分流（setup/update 跳过继续、migrate fail-fast）+ `agents-md:112` 泛化 + kb 过期引用/版本文本收口；**Bug 6 条 closed**（测试官隔离端到端验收）+ `config/BUG-001` 维持 closed + 新登记 `config/BUG-004`（medium，测试隔离缺口，归 stage-43） | passed |
| [v1.1.2-stage-43](v1.1.2-stage-43.md) | CLI 文档 skill 化与版本收口（**v1.1.2 最后阶段**）— 6 REV（REV-001~006 全 closed，含 1 条 blocking：REV-004 `REV-44` 三项归属遗漏），694/694 测试（41 文件）；新增 `openfeel-cli-usage` skill（权威源 + build 双注入 + 自举 + 快照声明，16→17）+ 版本 1.1.2 全链路收口（A1~A8 + B 生成段 + C `CHANGELOG` + D/E；`package-lock` 手工同步两行零依赖树变动）+ `docs/commands.md` config 节 + `AGENTS.md` 命令清单/skill 指向 + `config/BUG-004` 测试隔离修复（N4 mock + 删伪隔离 + 只读守护用例）+ skill 计数同步 14 处 + `REV-44` 归属闭环；`config/BUG-004` **closed**、新登记 `cli/BUG-003`（low 非阻塞，归下一版本）；**REV-006 终裁**：`lint i18n` 502 系 PATH 全局旧版 CLI 环境污染，撤销 stage-47「微瑕」判定 | passed |
| [v1.1.2-stage-48](v1.1.2-stage-48.md) | 事件加固 + 遗留问题修复 — 9 REV（REV-001~008 全 closed，含 2 条 blocking；REV-009 low 非阻塞 → 转 stage-49），**41 文件 / 706 用例全绿**（基线 694）；三大过程事件机制加固：A 审查官幻觉（reviewer 模板四条纪律 + `feel.md` 健康探测 + H12）/ B `npm test` 覆写真实环境（两测试补 `vi.mock('node:os')` + 对照实验证 mock 为有效屏障 + CI 环境哈希守卫）/ C 裸跑命中全局旧版（执行型口径统一 `node bin/openfeel.js` + CI 版本门禁双 job）；遗留 13 项全部落地（**455 条死映射 455→0** + `profile.yaml` 健壮性 + 权限措辞 + `cli/BUG-003` 收口）；`cli/BUG-003` **closed** + 新登记 `templates/BUG-003`（low 非阻塞，建议并入 stage-49） | passed |
| [v1.1.2-stage-49](v1.1.2-stage-49.md) | 整仓全量审查（8 单元并行 + op-009 汇总裁定）— 8 单元 MECE 覆盖 src 62 文件；**73 条原始发现（去重 68 条），blocking 4 条全部独立复现成立**：U2-REV-001 `flow advance --dry-run` 写盘（实测 revision 2→3）/ U2-REV-002 `plan stage add --deps` 悬空依赖静默入库 / U7-REV-U7-01 postinstall 用户端必然静默失效 + engines 崩坏（布局模拟实测）/ U7-REV-U7-02 `src/index.ts:10` VERSION 死导出经 exports 暴露 0.1.0；跨单元矛盾裁定 1 处（skill 部署口径以 U4 全量为准）；REV-49-005（基线 694→706）closed；**blocking 4 条由 `op-010`/`op-011`（commits `3f023e3`/`1a8546a`）修复闭环，exec_review 零阻塞零新增 REV，`npm test` 41 文件 / 716 用例全绿，可发布 1.1.2**；单元报告（文件级跳转）：[U1](../users/Liuary/code_review/REV-v1.1.2-stage-49-U1.md) / [U2](../users/Liuary/code_review/REV-v1.1.2-stage-49-U2.md) / [U3](../users/Liuary/code_review/REV-v1.1.2-stage-49-U3.md) / [U4](../users/Liuary/code_review/REV-v1.1.2-stage-49-U4.md) / [U5](../users/Liuary/code_review/REV-v1.1.2-stage-49-U5.md) / [U6](../users/Liuary/code_review/REV-v1.1.2-stage-49-U6.md) / [U7](../users/Liuary/code_review/REV-v1.1.2-stage-49-U7.md) / [U8](../users/Liuary/code_review/REV-v1.1.2-stage-49-U8.md) / [总报告](../users/Liuary/code_review/v1.1.2-stage-49-全量审查总报告.md) | passed |
| [v1.1.2-stage-50](v1.1.2-stage-50.md) | 全量审查 non-blocking 集中清理（第二批） — **T1~T57**（6 批次 A~F）7 op（commits `feae65e`~`def6a33`）；**用户裁定 R1~R6 全落地**（R1 `lint` 非 0 退出〔无逃生阀〕/ R3 `config set/get` 扩全量 `defaults.*`〔schema 驱动 + 枚举校验不写盘 + 值类型归一〕/ R4 审查条目收敛单入口〔`view add` deprecated，下版本删除〕/ R2 `update_infos` 保守默认 / R5 覆盖补 4 项 / R6 coverage 报告不阻断）；关键实现 `syncCurrentOp` 单一 owner（T1）/ `kb-dedup` `basePath` 参数化（T8）/ lint 退出码（T17）/ `transitionsDiff`（T19）/ 死代码删除（T22）/ config 白名单（T36）/ 双入口收敛（T37）/ 部署型 skill 双口径（T53）；**54 文件 / 790 用例全绿**、`tsc` 0、build 幂等、`lint i18n` 560 键、`lint kb` 0 过期；REV-001 closed、REV-002/003 resolved、REV-004（low）归下版本；`templates/BUG-003` 关闭 + 新登记 `cli/BUG-004`；知识沉淀 5 条（patterns 4 + troubleshooting 1） | passed |
| [v1.1.2-stage-51](v1.1.2-stage-51.md) | 流水线状态维护与 CLI 可维护性（反馈 08） — 补齐「纠正/清理侧」CLI 能力 **N1~N11**（3 批次 H1~H3）9 op（commits `a008f69`~`34385a4`）；**用户裁定 A2/A5/A6/A7 全落地**（A2 孤儿默认只报告 + `--prune-orphans` 显式清理 / A5 op 文件名固定 `op-NNN.md` 不做迁移 + `extractTitle` 兼容回退 / **A6 `kb-dedup` 暴露为 `openfeel knowledge dedup` 随包分发**〔只读建议，`npm pack` 含 `dist/utils/kb-dedup.js`〕/ A7 日志仅统一未来写入 + 索引共存）；关键实现 `plan scheme remove` + `findOrphanOps` 对账/health warn（N1）/ `flow stage set --deps` + `flow review update\|remove`（N2）/ `ensureStageSkeleton` 消除「半注册」（N3）/ `syncCurrentOp` 单一 owner 复用（N4）/ `stage set` 三态幂等 + 字段白名单 + `stage task --add`/`plan stage add --tasks`（N5~N7）/ `op-NNN.md` + 兼容回退（N8）/ knowledge 宽容解析 + `knowledge dedup`（N9）/ 日志布局 + `advance --quiet`（N10/N11）；**56 文件 / 869 用例全绿**、`tsc` 0、build 幂等、`lint i18n` 649 键、`lint kb` 0 过期（242 引用）；**三段审查零阻塞零新增 REV**、REV-004 closed；`cli/BUG-004` **关闭**（en `--help` Arguments 段 CJK 零命中，33 命令）；知识沉淀 5 条（architecture 1 + patterns 4 + troubleshooting 1 更新） | passed |
| [v1.1.2-stage-52](v1.1.2-stage-52.md) | 反馈 09（可编排性/可观测性）+ 遗留清账 + 约束体系精简 — **14 op**（主链 11 + 修复轮 3；commits `c6d89f6`~`facf825` / `6abd4fb` / `820855b` / `9e56c45`）；F1~F8 逐条实测（F3/F7/F8 已解决仅登记）+ L1~L8 清账；B1~B9 全落地：`status/current/health/metrics/overview --json`（含 `schemaVersion`）/ `health --fix`（仅「状态」字段、`--dry-run` 预览、幂等）/ `ops list`（填充度 + 空模板 warning + draft 分组）/ `draft` 两阶段（窄兼容 5 条含 attempt 拒绝）/ `advance --to` 自动逐步 + 路径预览 + 每步 REV 复检（`assertNoBlockingOpenRev`）/ `scheme rename` / `NO_COLOR`/`--no-color` / **L8 `kb-dedup` CRLF 修复**（2→105 / 0→31）；用户裁定 **A1~A7 全落地**（**A4 移除 `view add`**〔破坏性 + CHANGELOG `Removed`〕、A5 CRLF 归一、A6 文件孤儿 62 条仅报告、A7 不做编码 hack〔B9 实测不复现〕）+ **C1~C4**（简洁约束单行 / B 组阈值定性保留 D 组 / 根 `AGENTS.md` 对齐 / 14→17 Skill）；**stage 解析归一化闭包 10 处收口**（op-012/013/014，`rg` 确认无第 11 处）；**59 文件 / 979 用例全绿（0 skipped）**、`tsc` 0、build 幂等、`lint i18n` **724 键**、`lint kb` 0 过期；三段审查零阻塞（**REV-005~009 全 closed**）；测试官 14 项抽验全通过；新登记 `cli/BUG-005`（medium 空模板子串误报）/ `cli/BUG-006`（low en REV 拒绝文案）；知识沉淀 8 条（patterns 5 + troubleshooting 3） | passed |
| [v1.1.2-stage-53](v1.1.2-stage-53.md) | current.md / dev_last.md 职能与格式重构 — **两条设计目的 + 三层分层**写入全局约束；`current.md` 团队文件新格式（≤5 条 + 自动归档 `current_archive/`）；`dev_last.md` 索引 + 同名主题目录（活跃 ≤5 / 索引 ≤5×100 字 / 主题 ≤10×300 字 / 超量转 `tmp/` / 超期不归档 / R1~R6 含 R4 就地收敛 + R6 加锁）；用户裁定 **A5/A6/A9/A10** 全落地；存量迁移零丢失（current 82→14、dev_last 53→34 + 5 英文主题）；**59 文件 / 949 用例全绿**、build 幂等、`lint i18n` 724 键、`lint kb` 0 过期；三段审查零阻塞（REV-003 closed）；新登记 `templates/BUG-004`（low，归档官就地修正）；知识沉淀 5 条（architecture 2 + patterns 2 + troubleshooting 1） | passed |

## v5 系列审查

| 阶段 | 摘要 | 状态 |
|------|------|------|
| [v0.5.11-stage-01](v0.5.11-stage-01.md) | 目录归位 + 版本号重映射 + 四级版本号规则 — 3 REV 全部非阻塞 (low) | passed |

## v4 系列审查

| 阶段 | 摘要 | 状态 |
|------|------|------|
| [v5.10-stage-01](v5.10-stage-01.md) | profile 自动填充 + 异常安全 — 3 REV 全部 closed | passed |
| [v4.6-stage-01](v4.6-stage-01.md) | Vision Agent 全链路落地 — 3 REV 全部 closed | passed |
| [v4.4-stage-01](v4.4-stage-01.md) | i18n 基建 + CLI 国际化 — 12 REV (4 closed, 8 non-blocking) | passed |
| [v4.4-stage-02](v4.4-stage-02.md) | 日志修复 + 流水线安全 — 4 REV (1 closed, 3 non-blocking) | passed |
| [v4.2-stage-01](v4.2-stage-01.md) | 项目快速架构索引 — 4 REV (3 closed, 1 low pending) | passed |

## v3 系列审查

| 阶段 | 摘要 | 状态 |
|------|------|------|
| [v3-stage-01](v3-stage-01.md) | flow.json 鲁棒性 — 5 REV (4 high) 全部闭环，测试 71/71 | passed |
| [v3-stage-02](v3-stage-02.md) | 模型配置落地 — 2 REV (1 medium) 全部闭环 | passed |
| [v3-stage-03](v3-stage-03.md) | 效率优化 — 5 REV (2 high) 全部闭环 | passed |
| [v3-stage-04](v3-stage-04.md) | 体验补全 — 3 REV (1 medium) 全部闭环 | passed |

## v1 系列审查

| 阶段 | 摘要 | 状态 |
|------|------|------|
| [stage-06](stage-06.md) | View + Archive 闭环 — 无阻塞问题，通过 | passed |
| [stage-09](stage-09.md) | 测试文档发布准备 — REV-001 CI 缺失已修复，通过 | passed |
| [v1.0.0-stage-31](v1.0.0-stage-31.md) | Pantheogen CLI 体验优化 — 4 REV (3 closed + 1 low non-blocking) | passed |
| [v1.0.0-stage-32](v1.0.0-stage-32.md) | update 增量更新 + 冲突标记机制 — 3 REV (all non-blocking) | passed |
