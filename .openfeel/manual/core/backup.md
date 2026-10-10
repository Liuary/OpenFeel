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
├── global-external/<sha8>/…               # HOME 外全局资产（D-CFG，见下节）
└── project/OpenFeel-3f2a1c9b/             # 项目资产：basename + sha256(projectPath).slice(0,8)
    ├── .openfeel/config.yaml
    └── package.json
```

### HOME 外路径 fallback（D-CFG，v1.1.6-stage-71）

`computeBackupRel` 原对越出 HOME 的路径**抛 `BackupError`**（致「备份失败 → 跳过写入」）；D-CFG 使该场景可备份——**越界判定不变**（仍以 `relative(getHomedir(), abs)` 是否 `..`/绝对判定），**仅改处置**：

- **HOME 内** → 沿用 `global/<HOME 相对>`（**零回归**）；
- **HOME 外** → `global-external/<sha8>/<规范化尾段>`，**不再抛错**；
  - `sha8 = sha256(resolve(absPath)).digest('hex').slice(0,8)`——输入**规范化绝对路径（含盘符）**，输出仅 `[0-9a-f]` → 天然规避盘符冒号与保留字符，跨平台可复现、可作单层目录名（`C:\foo` 与 `D:\foo` 不撞）；
  - 尾段：逐段剥离 Windows 盘符（`^[A-Za-z]:`）+ 清洗 `[<>:"|?*]` → `_`，**保留目录层级**，空段防御补 `root`。
- **project 分支不动**：`projectPath` 越界**仍抛 `BackupError`**（处置仅针对 global 分支）。

动机：`CLAUDE_CONFIG_DIR` 可指向 HOME 外，stage-73 的 `settings.json` 写入需其覆盖前备份可行。详见 `kb/patterns.md #备份 HOME 外 fallback 的 sha8 口径`。

- **`{ts}` 语义（B2）**：`yyyyMMddTHHmmssSSS`（本地时区），进程内首次生成后缓存；同毫秒撞名依次 `-2`、`-3`；**绝不覆盖**既有备份（**每进程（通常即每命令）一个独立目录**——`cachedTs` 为进程级缓存，REPL/同进程多命令共享同一 `{ts}`）。
- **原子性与并发（B3/REV-005）**：备份写入走 `atomicWriteFileSync`；**整次备份会话（ts 探测 + mkdir + 备份副本写入 + manifest 读改写）全程在单一 `withFileLock(globalLockPath('backup'))` 临界区内**，消除跨进程 TOCTOU。
- **失败不覆盖（B3）**：`readFileSync` / `mkdirSync` / `atomicWriteFileSync` 任一异常 → `BackupError`，调用方跳过该文件写入并记 `note='backup_failed'` 异常。

## 接入链路（B9 / 裁定 #3）

| 覆盖写路径 | 接入点 | command |
|------------|--------|:--:|
| 全局资产（AGENTS.md / agents / skills） | `writeManagedFile`（updated / adopt / appended 三分支） | setup / update / migrate |
| 全局 `opencode.jsonc` | setup.ts / update.ts / migrate.ts 三处直写（备份在 jsonc 锁**之外**） | setup / update / migrate |
| 项目 `.openfeel/config.yaml` | **不再覆盖**（stage-47 BUG-002 语义修复：已存在则保留用户配置），无备份接入 | — |
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
- **失败路径语义分叉（REV-011，stage-47 定稿：混合裁定）**：全局 `opencode.jsonc` 三处直写路径的 `backupFileBeforeWrite` 失败（`BackupError`）按命令语义分流——① **`setup.ts` / `update.ts` → 跳过继续（对齐 B3）**：补 `try/catch` **仅捕获 `BackupError`**（锁超时等其余错误仍上抛），命中时 `appendUpdateInfo('anomaly', {note:'backup_failed'})` + `console.warn` + **跳过本次 jsonc 写入、继续其余步骤**；跳过写后 `updateFileHash` 不执行 → 下次 update 重跑自愈。② **`migrate.ts` → 有意 fail-fast**：`backupFileBeforeWrite` 直接上抛 → abort 整条命令；依据：migrate 为**可回滚事务**（`finally` 回填 + `rollbackMigration`），abort 比「部分部署」更干净。两分支各自自洽，已文档化。
- **`BUG-002` 已关闭（stage-47 语义修复 + 测试官验收）**：`init` 不再覆盖已存在的 `.openfeel/config.yaml`（保留用户配置；`configExisted` 分支仅 `skipped.push` 提示，无写盘/无备份接入）——stage-46 的「备份 + 仍覆盖」缓解被取代，`config.yaml` 备份接入点已删除；隔离实测：用户自定义三值文件经两次重跑 `init` 哈希不变、无 `backed` 条目。

## 变更历史

| 阶段 | 变更 |
|------|------|
| stage-46 | 初始创建：`backup.ts`（写前备份 + manifest + backup 锁临界区）+ `getGlobalBackupRootPath`；四链路（setup/update/init/migrate）覆盖写接入；`update_infos` 新增 backed 类 |
| v1.1.2-stage-47 | 接入点清单收缩：项目 `.openfeel/config.yaml` **改为「不再覆盖」→ 删除其备份接入**（`config/BUG-002` 语义修复）；jsonc 三处失败路径定稿为 **A/B 分流**（`setup`/`update` 跳过继续 + `anomaly(backup_failed)`；`migrate` 有意 fail-fast）；`config.yaml` 与 `package.json` 分离处置（后者备份保留） |
| v1.1.6-stage-71 | **D-CFG**：`computeBackupRel` global 分支新增 HOME 外 fallback `global-external/<sha8>/<规范化尾段>`（`sha8=sha256(resolve(absPath)).slice(0,8)`），越界不再抛错；HOME 内与 project 分支零回归（project 越界仍抛 `BackupError`） |
