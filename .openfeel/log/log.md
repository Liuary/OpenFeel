# 最近日�?

| 文件 | 用户 | 描述 |
|------|------|------|
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
| [2026-09-29-Liuary-035.md](2026/09/29/2026-09-29-Liuary-035.md) | Liuary | v1.1.2-stage-46.op-005 执行通过 |
| [2026-09-29-Liuary-034.md](2026/09/29/2026-09-29-Liuary-034.md) | Liuary | v1.1.2-stage-46.op-004 执行通过 |
| [2026-09-29-Liuary-033.md](2026/09/29/2026-09-29-Liuary-033.md) | Liuary | v1.1.2-stage-46.op-003 执行通过 |
| [2026-09-29-Liuary-032.md](2026/09/29/2026-09-29-Liuary-032.md) | Liuary | v1.1.2-stage-46.op-002 执行通过 |
| [2026-09-29-Liuary-031.md](2026/09/29/2026-09-29-Liuary-031.md) | Liuary | v1.1.2-stage-46.op-001 执行通过 |
| [2026-09-29-Liuary-030.md](2026/09/29/2026-09-29-Liuary-030.md) | Liuary | 阶段 v1.1.2-stage-45 完成 |
| [2026-09-29-Liuary-029.md](2026/09/29/2026-09-29-Liuary-029.md) | Archiver | **stage-45 归档完成（v1.1.2 平台强限定内容「描述泛化」）**：源码注释/命令文案/i18n 双语 7 键 + 模板权威源 + 规则/文档/手册 24 文件（含用户点名处 `AGENTS.md:82`）+ 泛化锁断言，全部描述泛化、**零行为变更**（`global-paths.ts` 8/8 全注释行 + build 幂等零 diff + worktree 命令输出逐字一致）；659/659 测试全绿（40 文件）、`lint i18n` 529 键；REV-001（low）closed、三段审查零阻塞；Bug：`templates/BUG-002`（medium 非阻塞，归 stage-47）；知识沉淀 3 条至 patterns(2)+troubleshooting(1) |
| [2026-09-29-Liuary-028.md](2026/09/29/2026-09-29-Liuary-028.md) | Liuary | v1.1.2-stage-45.op-004 执行通过 |
| [2026-09-29-Liuary-027.md](2026/09/29/2026-09-29-Liuary-027.md) | Liuary | v1.1.2-stage-45.op-003 执行通过 |
| [2026-09-29-Liuary-026.md](2026/09/29/2026-09-29-Liuary-026.md) | Liuary | v1.1.2-stage-45.op-002 执行通过 |
| [2026-09-29-Liuary-025.md](2026/09/29/2026-09-29-Liuary-025.md) | Liuary | v1.1.2-stage-45.op-001 执行通过 |
| [2026-09-29-Liuary-024.md](2026/09/29/2026-09-29-Liuary-024.md) | Liuary | 阶段 v1.1.2-stage-44 完成 |
| [2026-09-29-Liuary-022.md](2026/09/29/2026-09-29-Liuary-022.md) | Liuary | v1.1.2-stage-44.op-005 执行通过 |
| [2026-09-29-Liuary-021.md](2026/09/29/2026-09-29-Liuary-021.md) | Liuary | v1.1.2-stage-44.op-004 执行通过 |
| [2026-09-29-Liuary-020.md](2026/09/29/2026-09-29-Liuary-020.md) | Liuary | v1.1.2-stage-44.op-003 执行通过 |
| [2026-09-29-Liuary-019.md](2026/09/29/2026-09-29-Liuary-019.md) | Liuary | v1.1.2-stage-44.op-002 执行通过 |
| [2026-09-29-Liuary-018.md](2026/09/29/2026-09-29-Liuary-018.md) | Liuary | v1.1.2-stage-44.op-001 执行通过 |
| [2026-09-29-Liuary-017.md](2026/09/29/2026-09-29-Liuary-017.md) | Liuary | 阶段 v1.1.2-stage-42 完成 |
| [2026-09-29-Liuary-015.md](2026/09/29/2026-09-29-Liuary-015.md) | Liuary | v1.1.2-stage-42.op-005 执行通过 |

# 最近日�?
| 文件 | 用户 | 描述 |
|------|------|------|
