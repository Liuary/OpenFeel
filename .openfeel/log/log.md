# 最近日�?

| 文件 | 用户 | 描述 |
|------|------|------|
| [2026-09-29-Liuary-066.md](2026/09/29/2026-09-29-Liuary-066.md) | Liuary | v1.1.2-stage-49.op-011 执行通过 |
| [2026-09-29-Liuary-065.md](2026/09/29/2026-09-29-Liuary-065.md) | Liuary | v1.1.2-stage-49.op-010 执行通过 |
| [2026-09-29-Liuary-064.md](2026/09/29/2026-09-29-Liuary-064.md) | Liuary | **stage-49 op-009 全量审查汇总完成**：8 单元 73 条发现去重为 68 条；**blocking 4/4 独立核实成立**（`flow advance --dry-run` 写盘实测 revision 2→3 / `plan stage add --deps` 悬空依赖 / postinstall 用户端布局模拟实测静默失效 / VERSION 死导出）；跨单元矛盾裁定（skill 口径以 U4 为准）；REV-49-005 closed；U8 过程偏差留痕 + 整改要求；stage-49 pending，blocking 闭环后可发布 1.1.2 |
| [2026-09-29-Liuary-063.md](2026/09/29/2026-09-29-Liuary-063.md) | Liuary | 阶段 v1.1.2-stage-48 完成 |
| [2026-09-29-Liuary-062.md](2026/09/29/2026-09-29-Liuary-062.md) | Archiver | **stage-48 归档完成（v1.1.2 事件加固 + 遗留问题修复）**：三大过程事件机制加固（A 审查官幻觉 / B `npm test` 覆写真实环境 / C 裸跑命中全局旧版）+ 13 项遗留全部落地（**455 条死映射 455→0** + `profile.yaml` 健壮性 + `cli/BUG-003` 收口）；7 op，**41 文件 / 706 用例全绿**、`lint i18n` 531 键、`lint kb` 0 过期；REV-001~008 closed（含 2 blocking）；新登记 `templates/BUG-003`（low 非阻塞，建议并入 stage-49）；知识沉淀 4 条；manual 更新 `core/{config,global-paths}.md` + `agents/feel.md` + `index.md` |
| [2026-09-29-Liuary-061.md](2026/09/29/2026-09-29-Liuary-061.md) | Liuary | v1.1.2-stage-48.op-007 执行通过 |
| [2026-09-29-Liuary-060.md](2026/09/29/2026-09-29-Liuary-060.md) | Liuary | v1.1.2-stage-48.op-006 执行通过 |
| [2026-09-29-Liuary-059.md](2026/09/29/2026-09-29-Liuary-059.md) | Liuary | v1.1.2-stage-48.op-004 执行通过 |
| [2026-09-29-Liuary-058.md](2026/09/29/2026-09-29-Liuary-058.md) | Liuary | v1.1.2-stage-48.op-005 执行通过 |
| [2026-09-29-Liuary-057.md](2026/09/29/2026-09-29-Liuary-057.md) | Liuary | v1.1.2-stage-48.op-001 执行通过 |
| [2026-09-29-Liuary-056.md](2026/09/29/2026-09-29-Liuary-056.md) | Liuary | v1.1.2-stage-48.op-003 执行通过 |
| [2026-09-29-Liuary-055.md](2026/09/29/2026-09-29-Liuary-055.md) | Liuary | v1.1.2-stage-48.op-002 执行通过 |
| [2026-09-29-Liuary-053.md](2026/09/29/2026-09-29-Liuary-053.md) | Liuary | 阶段 v1.1.2-stage-43 完成 |
| [2026-09-29-Liuary-052.md](2026/09/29/2026-09-29-Liuary-052.md) | Archiver | **stage-43 归档完成 + v1.1.2 版本级收官**：新增 `openfeel-cli-usage` skill（权威源单文件 + build 双注入 + 自举 + 快照声明，16→17 skill）+ **版本 1.1.2 全链路收口**（A1~A8 + B 生成段 + C `CHANGELOG` + D/E；`package-lock` 手工同步 root 两行，零依赖树变动）+ `docs/commands.md` 新增 `## config` 节 + `AGENTS.md` 命令清单补 4 条 + 指向 skill + `config/BUG-004` **测试隔离修复**（N4 `vi.mock('node:os')` + 删 `savedConfig` 伪隔离 + 只读隔离守护用例，真实 `config.json` mtime+SHA-256 前后不变）+ skill 计数同步 14 处（含 `expectedSkills` 白名单）+ `REV-44` 归属闭环；5 op，**41 文件 / 694 用例全绿**、`tsc` 0、`npm run build` 幂等、`lint i18n` **531 键**、`lint kb` **0 过期引用（归档后 224 引用；阶段内 195）**；REV-001~006 全 closed（含 blocking REV-004）；**REV-006 终裁**：`lint i18n` 502 系 **PATH 全局旧版 CLI 环境污染**（531 为本仓真实键数）→ 撤销 stage-47「微瑕」判定 + 落「门禁统一 `node bin/openfeel.js`」改进；Bug：`config/BUG-004` **closed** + 新登记 `cli/BUG-003`（low 非阻塞，归下一版本）；知识沉淀 **4 条新增**（patterns：CLI 用法 skill 化模式 / 版本号全链路收口清单；troubleshooting：PATH 全局旧版环境污染 / 版本级两类伪信号）；版本级收尾：`plan/index.md`（+14 行阶段对照闭合历史缺口）/ `roadmap/v1.1.2.md`（标记完成 + 收官摘要）/ `dev/current.md` / `log` 三索引 / `plan/v1/stage-43/status.md` → done。**v1.1.2 七阶段全部闭环，`npm publish` 就绪** |
| [2026-09-29-Liuary-051.md](2026/09/29/2026-09-29-Liuary-051.md) | Liuary | v1.1.2-stage-43.op-005 执行通过 |
| [2026-09-29-Liuary-050.md](2026/09/29/2026-09-29-Liuary-050.md) | Liuary | v1.1.2-stage-43.op-004 执行通过 |
| [2026-09-29-Liuary-049.md](2026/09/29/2026-09-29-Liuary-049.md) | Liuary | v1.1.2-stage-43.op-003 执行通过 |
| [2026-09-29-Liuary-048.md](2026/09/29/2026-09-29-Liuary-048.md) | Liuary | v1.1.2-stage-43.op-002 执行通过 |
| [2026-09-29-Liuary-047.md](2026/09/29/2026-09-29-Liuary-047.md) | Liuary | v1.1.2-stage-43.op-001 执行通过 |
| [2026-09-29-Liuary-046.md](2026/09/29/2026-09-29-Liuary-046.md) | Liuary | 阶段 v1.1.2-stage-47 完成 |
| [2026-09-29-Liuary-045.md](2026/09/29/2026-09-29-Liuary-045.md) | Archiver | **stage-47 归档完成（v1.1.2 已登记缺陷集中清理）**：`config/BUG-002`（high）**语义修复**——`init` 对已存在 `.openfeel/config.yaml` **不再覆盖**（删除 stage-46 备份接入块 + `init.skipped` 用户可见提示）+ `config/BUG-003` 画像层「文件存在 + 原始 YAML 显式声明」双条件（来源落 `builtin`）+ `cli/BUG-001` `flow phases` 边界说明 + `--json.advanceAccepted`（存在视图 vs 推进白名单）+ `cli/BUG-002` `StageDirConflictError` + 三入口 i18n 分流（死键消除）+ `archive/BUG-001` `Array.isArray(deps)` 守卫 + `save()` `meta ??=` 守卫 + **`removeStage` 事务顺序**（返回 `purgeTarget`，命令层 `save()` 后删目录）+ jsonc 备份失败 **A/B 分流**（setup/update 跳过继续 + `anomaly(backup_failed)`；migrate 有意 fail-fast）+ `agents-md:112` 泛化 + `kb/architecture.md:497` 与计划文本收口（`lint kb` 0 过期引用）；7 op，**693/693 测试全绿（41 文件）**、`tsc` 0、`npm run build` 幂等、`lint i18n` 零错误；REV-001~005 全 closed（含 2 条 blocking：并行组修正 / BUG-002 修复指令补全）；**Bug 6 条 closed**（测试官隔离端到端验收，每条补「防再犯」）+ `config/BUG-001` 复核维持 closed + **新登记 `config/BUG-004`**（medium，测试隔离缺口，**裁定归 stage-43**）；知识沉淀 7 条至 patterns(3) + troubleshooting(1) + 既有条目 9 处「更新于」批注；manual 更新 `core/{init,flow-manager,config,backup}.md` + `cli/commands.md` + `index.md` |
| [2026-09-29-Liuary-044.md](2026/09/29/2026-09-29-Liuary-044.md) | Liuary | v1.1.2-stage-47.op-007 执行通过 |
| [2026-09-29-Liuary-043.md](2026/09/29/2026-09-29-Liuary-043.md) | Liuary | v1.1.2-stage-47.op-006 执行通过 |
| [2026-09-29-Liuary-042.md](2026/09/29/2026-09-29-Liuary-042.md) | Liuary | v1.1.2-stage-47.op-005 执行通过 |
| [2026-09-29-Liuary-041.md](2026/09/29/2026-09-29-Liuary-041.md) | Liuary | v1.1.2-stage-47.op-004 执行通过 |
| [2026-09-29-Liuary-040.md](2026/09/29/2026-09-29-Liuary-040.md) | Liuary | v1.1.2-stage-47.op-003 执行通过 |
| [2026-09-29-Liuary-039.md](2026/09/29/2026-09-29-Liuary-039.md) | Liuary | v1.1.2-stage-47.op-002 执行通过 |
| [2026-09-29-Liuary-038.md](2026/09/29/2026-09-29-Liuary-038.md) | Liuary | v1.1.2-stage-47.op-001 执行通过 |
| [2026-09-29-Liuary-037.md](2026/09/29/2026-09-29-Liuary-037.md) | Liuary | 阶段 v1.1.2-stage-46 完成 |
| [2026-09-29-Liuary-036.md](2026/09/29/2026-09-29-Liuary-036.md) | Archiver | **stage-46 归档完成（v1.1.2 部署已有文件备份 + 全局状态文件提示）**：新增 `backup.ts`（写前备份 + `~/.openfeel/backup/{ts}/` 分区 + `manifest.json` + 单锁临界区 + 绝不覆盖既有备份 + **备份失败绝不覆盖**）+ `update_infos.md` 第三类 `backed`（短前缀读侧分类、旧行兼容）+ 四链路接入（`writeManagedFile` 三分支 / 全局 `opencode.jsonc` 三处 / `init` 的 `config.yaml`、`package.json`）+ `deployGlobalAsset` 破坏性签名变更（增 `command`，9 调用点全改）+ `feel.md` 双语启动检查扩为三类；5 op，685/685 测试全绿（41 文件）、`lint i18n` 502 键、`tsc` 0、build 幂等；REV-001~010 closed + REV-011（low 非阻塞，归 stage-47）；Bug 0 新增，`config/BUG-002` 仅缓解（保持 open）；知识沉淀 4 条至 patterns(3) + troubleshooting(1)；manual 新增 core/backup.md |

# 最近日�?
| 文件 | 用户 | 描述 |
|------|------|------|
