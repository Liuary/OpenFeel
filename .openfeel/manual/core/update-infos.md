# 增量更新记录模块（update-infos）

> 模块文档，由归档官在归档时维护。对应源码：`src/core/update-infos.ts`。

## 职责

读写 `~/.openfeel/update_infos.md`，记录三类条目，供会话启动时检查并修复（feel.md 消费）：
- **appended**：`openfeel update` 因目标文件无控制区标记而追加的受管内容；
- **anomaly**：标记解析异常（malformed）或**备份失败**（`note='backup_failed'`）未写入、待人工修复/重试的文件；
- **backed**（stage-46）：部署覆盖前已存在的原始文件已备份（记录备份相对路径与来源命令），待检查。

## 核心 API

| 函数 | 功能 |
|------|------|
| `loadUpdateInfos()` | 读 update_infos.md 解析为条目列表；不存在/损坏 → []（降级，不中断）；节识别按 `SECTION_PREFIXES`（短前缀）匹配 |
| `appendUpdateInfo(kind, target)` | 加锁 + 原子写追加一条记录（kind: appended / anomaly / backed）；仅 anomaly 去重 |
| `resolveUpdateInfo(target)` | 标记匹配条目为已复核（resolved） |
| `clearUpdateInfos()` | 清空全部条目（写空骨架） |

## 数据结构

条目 `UpdateInfoEntry`：`{ kind, absolutePath, projectRoot, relativePath, timestamp, resolved, backupRel, command, note }`（除 timestamp/resolved 外均为 `string | null`，必填 + 显式 null）。目标 `UpdateInfoTarget` 二选一：全局资产 `{ absolutePath }`，项目资产 `{ projectRoot, relativePath }`；backed 另传 `{ backupRel, command }`；anomaly 备份失败另传 `{ note: 'backup_failed' }`。

行格式（尾部段可选，向后兼容旧行）：
- backed：`` - [ ] `{displayPath}`（{timestamp}）（备份: `{backupRel}`，来源: {command}） ``
- anomaly（备份失败）：`` - [ ] `{displayPath}`（{timestamp}）（原因: backup_failed） ``
- appended / anomaly（malformed）：`` - [ ] `{displayPath}`（{timestamp}） ``（不变）

## 路径二元组（REV-903）

update_infos.md 存于全局 `~/.openfeel/`（跨项目共享），条目路径必须自包含无歧义：

| 资产类型 | 记录方式 |
|----------|----------|
| 全局资产（opencode 适配器：`~/.config/opencode/` 下） | 绝对路径 |
| 项目资产（AGENTS.md / .gitignore 等） | 「项目根 + 相对路径」二元组（`AGENTS.md (项目: /abs/root)`） |

禁止对项目资产只记相对路径（跨项目共享文件会归属歧义）。

## 设计要点

- **加锁 + 原子写**：写入走 `withFileLock(globalLockPath('update-infos'))` + `atomicWriteFileSync`（跨项目共享，须加锁）。
- **anomaly 去重**：同路径已有未修复（resolved=false）的 anomaly 条目则跳过，避免每次 update 无限累积；**backed 不去重**（一次命令内由调用方保证每文件仅一次）。
- **读侧节识别单一源（stage-46）**：`loadUpdateInfos` 按 `SECTION_PREFIXES`（`## 追加` / `## 异常` / `## 备份` 短前缀）匹配 `currentKind`，不再硬编码全标题。修改 `SECTION_TITLES` 节标题文案时须同步核对/迁移存量 `update_infos.md` 的节标题。
- **降级不中断**：文件损坏时 `loadUpdateInfos()` 返回 []（警告），不抛错。
- **条目只增不减（v1.1.2-stage-50，R2/T25，按保守默认）**：`update_infos.md` 条目**只增不减**——`clearUpdateInfos` 为预留 API（生产零调用），backed 不去重（保留审计轨迹）。**不新增**自动清理命令、**不**自动归档 resolved 条目（用户未要求）。条目的收敛依赖 Feel 会话启动检查勾选（`resolveUpdateInfo`/edit 勾选）；若需人工清理，**直接编辑 `~/.openfeel/update_infos.md`**（删除已完成/已复核条目，保留文件骨架节标题），或调用预留的 `clearUpdateInfos()` 写空骨架。**判据**：`~/.openfeel/update_infos.md` 无限增长的治理留待用户显式诉求，避免引入无实证需求的命令面。
- **会话启动消费方（Feel）不可 import TS 模块**：Feel 用 edit 工具直接编辑 `~/.openfeel/update_infos.md` 勾选条目，故 `resolveUpdateInfo`/`clearUpdateInfos` 保留供未来 CLI 或其他调用方使用。备份类条目处理（含 `backupRel` 存在性检查与 `backup_failed` 分派）见 feel.md「update_infos 检查修复」。

## 调用关系

```
src/core/update.ts（writeManagedFile 追加/异常/备份动作内联写）
src/core/{setup,update,migrate}.ts（全局 opencode.jsonc 覆盖前备份）
src/core/init.ts（项目 config.yaml / package.json 覆盖前备份）
  └─ src/core/update-infos.ts（读写）
       └─ ~/.openfeel/update_infos.md（经 global-paths.ts getGlobalUpdateInfosPath）
```

## 变更历史

| 阶段 | 变更 |
|------|------|
| stage-38 | 初始创建，appended/anomaly 两类条目 + 路径二元组 + 加锁原子写 |
| stage-46 | 新增第三类 backed（`backupRel`/`command` 字段）；anomaly 增 `note` 字段（`backup_failed`）；尾部段容错解析（向后兼容）；读侧改 `SECTION_PREFIXES` 短前缀匹配（消双源） |
| v1.1.2-stage-50 | 文档化「条目只增不减」现状与人工清理建议（**R2 保守默认**：不新增自动清理/命令）；`clearUpdateInfos` 维持预留 API |
