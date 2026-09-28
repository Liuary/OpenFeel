# 部署覆盖前备份模块（backup）

> 模块文档，由归档官在归档时维护。对应源码：`src/core/backup.ts`、`src/core/global-paths.ts`（`getGlobalBackupRootPath`）。

## 职责

在「目标已存在且本次将被写入/覆盖」前，把原始文件复制到全局备份根 `~/.openfeel/backup/{ts}/`，并在全局状态文件 `~/.openfeel/update_infos.md` 登记「备份」类条目（由调用方 `appendUpdateInfo('backed', …)` 写入），供会话启动时检查（feel.md 消费）。

> 需求原文：「如果部署时已有文件，则将原始文件备份，并在全局状态文件中提示 agent 检查」。
> **语义裁定**：**备份成功后仍覆盖**（需求为「备份 + 提示」，非「拒绝覆盖」）；**仅备份失败时**跳过该文件写入（B3）。

## 核心 API

| 函数 | 功能 |
|------|------|
| `backupFileBeforeWrite(absPath, { command, projectPath? })` | 写前备份：目标不存在 → `null`；存在 → 复制原件到 `backup/{ts}/` 并更新 `manifest.json`，返回 `{ backupRel, ts }`；失败抛 `BackupError` |
| `notifyBackupIfTTY(backupRel)` | 备份控制台提示（仅 TTY；非 TTY 静默，B6） |
| `resetBackupSetCache()` | 清空进程内 `{ts}` 缓存（**仅供测试隔离**，生产不使用） |
| `getGlobalBackupRootPath()` | 备份根路径 `~/.openfeel/backup`（global-paths.ts） |

- `BackupCommand = 'setup' | 'update' | 'init' | 'migrate'`（会触发部署覆盖写的调用方）。
- `BackupError`：携带 `filePath`，供调用方跳过写入（`writeManagedFile` 返回既有 `'skipped'` + `appendUpdateInfo('anomaly', { note: 'backup_failed' })`）。

## 备份目录结构（B1）

```
~/.openfeel/backup/{ts}/
├── manifest.json                          # source(绝对路径) → backupRel + hash + command + time
├── global/.config/opencode/AGENTS.md      # 全局资产：相对 HOME 的层级
├── global/.config/opencode/agents/feel.md
└── project/OpenFeel-3f2a1c9b/             # 项目资产：basename + sha256(projectPath).slice(0,8)
    ├── .openfeel/config.yaml
    └── package.json
```

- **`{ts}` 语义（B2）**：`yyyyMMddTHHmmssSSS`（本地时区），进程内首次生成后缓存；同毫秒撞名依次 `-2`、`-3`；**绝不覆盖**既有备份（每次命令一个独立目录）。
- **原子性与并发（B3/REV-005）**：备份写入走 `atomicWriteFileSync`；**整次备份会话（ts 探测 + mkdir + 备份副本写入 + manifest 读改写）全程在单一 `withFileLock(globalLockPath('backup'))` 临界区内**，消除跨进程 TOCTOU。
- **失败不覆盖（B3）**：`readFileSync` / `mkdirSync` / `atomicWriteFileSync` 任一异常 → `BackupError`，调用方跳过该文件写入并记 `note='backup_failed'` 异常。

## 接入链路（B9 / 裁定 #3）

| 覆盖写路径 | 接入点 | command |
|------------|--------|:--:|
| 全局资产（AGENTS.md / agents / skills） | `writeManagedFile`（updated / adopt / appended 三分支） | setup / update / migrate |
| 全局 `opencode.jsonc` | setup.ts / update.ts / migrate.ts 三处直写（备份在 jsonc 锁**之外**） | setup / update / migrate |
| 项目 `.openfeel/config.yaml` | `init.ts` `initWorkspaceCore`（`configExisted` 时，覆盖前） | init |
| 项目 `package.json` | `init.ts` `initProject`（仅实际将写时，覆盖前） | init |

**不备份**：`created`（新建）、`updated==skipped`（无变化）、`malformed`（不写盘）；项目 `flow.json`（`existsSync` 守卫不覆盖）、项目 `opencode.jsonc`（仅缺失时写）。

## 与 migrate 项目内备份的区别（B7）

| | 本模块（全局备份） | migrate 项目内备份 |
|---|--------------------|--------------------|
| 根目录 | `~/.openfeel/backup/{ts}/`（全局，跨项目） | `{项目}/.openfeel/backup/{ts}/`（项目内） |
| 备份对象 | 部署**覆盖前**的原始文件 | 迁移中**将被删除/改写**的项目文件 |
| 目的 | 事后检查（无回滚） | 服务可回滚事务（`rollbackMigration`） |
| 关系 | **不合并** | 保持原样（B7） |

`migrate` 的**全局部署写**已纳入本模块（`command='migrate'`，REV-002）；其**项目内**备份机制不变。

## 豁免与残余风险

- **豁免**：`~/.config/openfeel/profile.yaml`（`writeProfile` 调用方仅 Feel 启动与 profile 写命令，**不在部署链路**，符合需求「部署覆盖前」）；`~/.openfeel/{update_state.json,update_infos.md}`（框架状态文件，可重建）。
- **不做自动清理（R1）**：备份会随每次部署累积，本阶段不加保留策略；如需清理请**手工删除** `~/.openfeel/backup/` 下旧 `{ts}` 目录。
- **已接受残余风险（REV-009⑤）**：全局 `opencode.jsonc` 的备份在 `global-opencode-jsonc` 锁**之外**完成——并发写入者介入时，备份内容可能 ≠ 实际被覆盖内容；因 jsonc 合并在锁内保留用户字段、风险低，显式记录接受。
- **`BUG-002` 为「缓解」非「语义修复」**：`init` 覆盖 `.openfeel/config.yaml` 前备份 + 失败不覆盖，属缓解（可恢复 + 提示）；其「不再无条件覆盖」的语义修复另立 `config/BUG-002`，本阶段不关闭。

## 变更历史

| 阶段 | 变更 |
|------|------|
| stage-46 | 初始创建：`backup.ts`（写前备份 + manifest + backup 锁临界区）+ `getGlobalBackupRootPath`；四链路（setup/update/init/migrate）覆盖写接入；`update_infos` 新增 backed 类 |
