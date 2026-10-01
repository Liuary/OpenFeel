# 存量迁移模块（migrate）

> 模块文档，由归档官在归档时维护。对应源码：`src/core/migrate.ts`。

## 职责

`openfeel migrate` 的核心编排层：将存量旧布局项目（项目内 `.opencode/agents|skills|instructions`、旧 `opencode.jsonc` 非法 `skills` 映射、混合 `update_state.json`）迁移到 stage-37 的全局部署架构。支持 `--dry-run` 预览与 `rollback` 回滚，全程可回滚。本模块处理的是 **opencode 适配器**的 legacy 布局（下文 `.opencode/...` 与 `opencode.jsonc` 均为该适配器历史路径/文件名，属实现细节，保留）。

## 核心 API

| 函数 | 功能 |
|------|------|
| `detectLegacy(projectPath)` | 五条判据检测 legacy 布局，返回 `LegacyReport`（任一为 true 即 legacy） |
| `listLegacyFiles(projectPath, lang?)` | 按「框架同源 / 项目自定义」分类列出 legacy 项目文件（REV-007） |
| `backupLegacy(projectPath, report, opts?)` | 备份将被删除/改写的文件到 `.openfeel/backup/{ts}/` + 生成 `manifest.json` |
| `splitUpdateState(projectPath, lang?, globalStateIn?)` | 旧项目 state 框架条目重键移入全局 state，项目条目保留 |
| `remapAssignees(projectPath, dryRun)` | 扫描 flow.json 旧 assignee，报告旧名→新名映射；dryRun 仅报告不写 |
| `migrateProject(projectPath, opts?)` | 迁移主流程：检测→备份→全局部署→state 拆分→清理→assignee 报告 |
| `cleanOldBackups(projectPath, keep?)` | 保留最近 keep 次备份，删除更早备份目录 |
| `rollbackMigration(projectPath, backupTs?)` | 回滚最近一次迁移：按 manifest 逆向恢复项目文件 + 还原全局 state 新增条目 |
| `previewRollback(projectPath, backupTs?)` | 回滚预览：读取最新 manifest 返回 entries 列表（source + op 类型），不写盘 |

## 迁移流程（M4，顺序不可变，保证可回滚）

```
1. 检测（detectLegacy）：五条判据，无 legacy →「已是最新布局」退出
2. 备份（backupLegacy）：.openfeel/backup/{ts}/ + manifest.json（每条 {op, source, backupPath, hash}）
3. 全局部署：复用 deployGlobalAsset（core.md/agents/skills）+ 深度合并全局平台适配器配置（opencode.jsonc，加锁+原子写）
4. state 拆分/重键（splitUpdateState）：旧框架 key → 归一化新名 → 全局 state 绝对路径 key
5. 清理 legacy 框架文件（listLegacyFiles 仅删框架同源，custom 保留原位）+ 清理项目平台适配器配置文件（opencode.jsonc）非法字段
6. assignee 报告（默认仅报告，--remap-assignee 才改写）
7. 备份清理（cleanOldBackups 保留最近 5 次）
```

任一步抛异常 → 中止 + 输出「可 `openfeel migrate rollback` 回滚」提示。

## legacy 判据（M3）

| # | 判据 | 检测方式 |
|---|------|----------|
| ① | 项目 `.opencode/agents/` 含「框架同源」.md（项目自定义不计） | `normalizeAgentName(文件名) ∈ 框架清单` |
| ② | 项目 `.opencode/skills/` 含「框架同源」skill（项目自定义不计） | `remapSkillName(目录名) ∈ 框架清单` |
| ③ | 项目 `.opencode/instructions/core.md` 存在 | `existsSync` |
| ④ | 项目 `opencode.jsonc` 含非法 `skills` 映射（`{name:path}` 对象）或 `instructions` 字段 | `parseJsonc` 后检查 |
| ⑤ | 项目 `update_state.json` 含 `.opencode/...` 旧框架 key | `isLegacyFrameworkKey` |

> 判据 ①/② 采用「框架同源判定」保证 migrate 幂等：项目自定义资产迁移后保留原位，不应使其恒判 legacy。

## 回滚边界（REV-1201）

- 全局框架资产（agents/skills/core.md/opencode.jsonc）幂等可重建，回滚**不还原全局文件**（可 `openfeel update` 重建）。
- 仅还原：① 项目文件（按 `manifest.entries` 逆向 copy 回）；② 全局 update_state 的本次新增条目（`manifest.globalStateKeys` 精确删，不触碰历史条目，REV-1302）。
- `--remap-assignee` 时 flow.json 必须纳入 manifest（记录改写前快照）。

## 关键修正（stage-39）

| 项 | 修正 |
|----|------|
| `deployGlobalAsset` 抽取 | 从 update.ts 最小侵入抽取（等价 `writeManagedFile(..., {isGlobal:true})`），migrate 与 update 共用（REV-1205） |
| manifest 回填 | 全局部署 + state 拆分包在 `try/finally`，finally 回填 `manifest.globalStateKeys`（REV-1405） |
| splitUpdateState 复用 state | 新增 `globalStateIn` 可选参数，复用已加载全局 state，消除重复 IO（REV-1402） |
| skill 旧名重键 | `remapSkillName` 旧无前缀名 → openfeel- 前缀（全部 skill，REV-1303） |
| assignee 遍历 | 用 `Object.values` 遍历 stages/ops 对象（非数组），`for...of` 对象会抛 TypeError（REV-1301） |

## 变更历史

| 阶段 | 变更 |
|------|------|
| stage-39 | 初始创建：`openfeel migrate` 命令核心（detectLegacy/backupLegacy/splitUpdateState/remapAssignees/migrateProject/rollbackMigration/previewRollback/cleanOldBackups） |
| v1.1.1 | `remapLegacyKey` 的 `.opencode/instructions/core.md` 目标由 `getGlobalCoreMdPath()` 改 `getGlobalAgentsMdPath()`；全局部署 corePath → 全局 AGENTS.md；新增 `detectDeprecatedCompat`（全局旧 core.md / 存量项目 AGENTS.md 仅提示）与 `--clean-global-core-md`（显式删除，默认不删） |
