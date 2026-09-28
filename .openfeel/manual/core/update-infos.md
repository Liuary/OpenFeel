# 增量更新记录模块（update-infos）

> 模块文档，由归档官在归档时维护。对应源码：`src/core/update-infos.ts`。

## 职责

读写 `~/.openfeel/update_infos.md`，记录 `openfeel update` 因目标文件无控制区标记而追加的受管内容（appended），以及标记解析异常（malformed）未写入、待人工修复的文件（anomaly），供会话启动时检查并修复（feel.md 消费）。

## 核心 API

| 函数 | 功能 |
|------|------|
| `loadUpdateInfos()` | 读 update_infos.md 解析为条目列表；不存在/损坏 → []（降级，不中断） |
| `appendUpdateInfo(kind, target)` | 加锁 + 原子写追加一条记录（kind: appended / anomaly） |
| `resolveUpdateInfo(target)` | 标记匹配条目为已复核（resolved） |
| `clearUpdateInfos()` | 清空全部条目（写空骨架） |

## 数据结构

条目 `UpdateInfoEntry`：`{ kind, absolutePath?, projectRoot?, relativePath?, timestamp, resolved }`。目标 `UpdateInfoTarget` 二选一：全局资产 `{ absolutePath }`，项目资产 `{ projectRoot, relativePath }`。

## 路径二元组（REV-903）

update_infos.md 存于全局 `~/.openfeel/`（跨项目共享），条目路径必须自包含无歧义：

| 资产类型 | 记录方式 |
|----------|----------|
| 全局资产（opencode 适配器：`~/.config/opencode/` 下） | 绝对路径 |
| 项目资产（AGENTS.md / .gitignore 等） | 「项目根 + 相对路径」二元组（`AGENTS.md (项目: /abs/root)`） |

禁止对项目资产只记相对路径（跨项目共享文件会归属歧义）。

## 设计要点

- **加锁 + 原子写**：写入走 `withFileLock(globalLockPath('update-infos'))` + `atomicWriteFileSync`（跨项目共享，须加锁）。
- **anomaly 去重**：同路径已有未修复（resolved=false）的 anomaly 条目则跳过，避免每次 update 无限累积。
- **降级不中断**：文件损坏时 `loadUpdateInfos()` 返回 []（警告），不抛错。
- **会话启动消费方（Feel）不可 import TS 模块**：Feel 用 edit 工具直接编辑 `~/.openfeel/update_infos.md` 勾选条目，故 `resolveUpdateInfo`/`clearUpdateInfos` 保留供未来 CLI 或其他调用方使用。

## 调用关系

```
src/core/update.ts（writeManagedFile 追加/异常动作内联写）
  └─ src/core/update-infos.ts（读写）
       └─ ~/.openfeel/update_infos.md（经 global-paths.ts getGlobalUpdateInfosPath）
```

## 变更历史

| 阶段 | 变更 |
|------|------|
| stage-38 | 初始创建，appended/anomaly 两类条目 + 路径二元组 + 加锁原子写 |
