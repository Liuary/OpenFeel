---
name: openfeel-memory
description: 记忆与落档（v1.5.0 瘦身）——默认不加载、不写回；仅在 recover / 用户要求 / 节点交接时按需读写；唯一写者是 Feel。用于「记忆 / 交接 / 恢复」相关判断。
---

# 记忆与落档（v1.5.0 瘦身）

> ⚠️ **本仓自举**：本仓（openfeel 源码仓库）开发/执行时请用 `node bin/openfeel.js <cmd>`；安装后使用 `openfeel <cmd>`。

## 原则

- **唯一写者 = Feel**：`dev_last*`、`dev/current.md`、`status.md`、`flow.json` 只由 Feel 写；**子 agent 不读不写**，上下文由派发 prompt / 交接文档提供。
- **默认不动**：普通会话启动**不读** `dev_last`、**不写**任何状态/日志；上下文来自 `flow next` / 计划 / op / REV。
- **节点更新**：开始 / 转折 / 结束，或 `statusSync.due=true`（默认 30 分钟）时，Feel 更新一次**交接摘要（≤5 行）**，随后运行 `openfeel dev sync`（CLI 在节点/到期时自动同步）。

## 按需读取（recover / 用户要求）

1. 全局偏好：`readProfile()`（文件不存在用默认值）。
2. 项目规则：`.openfeel/dev/dev_core.md`（`[+]` / `[-]`）。
3. 交接：`dev_last.md` 的「公共交接区」+ `dev_last/` 主题文件（仅需要详情时读）。

> `dev_last.md` 的「自动状态」块由 CLI 维护（`openfeel dev sync`），**不要手改**。

## 按需写入（仅 Feel）

- 交接摘要写 `dev_last.md`「公共交接区」或主题文件；单条 ≤5 行，只写「做了什么 / 卡在哪 / 下一步」。
- **固定键（v1.5.3，建议）**：`done: …` / `next: …` / `block: …` 三行；恢复包会直接读取该段（≤600 字）。
- 长期技术/架构决策 → `.openfeel/dev/decisions.md`（ADR）；会话临时取舍不落档。
- **确需写主题文件时**（临界区）：`withFileLock(projectLockPath(cwd, 'dev-last-' + username), () => { … })`，锁路径 `.openfeel/tmp/locks/`；合并后用 `atomicWriteFileSync` 落盘。
- `dev/current.md` 仅为可选项，不再强制维护。

## 检查（不阻塞）

- `update_state.json` 冲突条目、`~/.openfeel/update_infos.md` 例外条目：存在时简要提示用户；非 TTY 静默；**不阻塞**主流程。

## 输出

- 恢复摘要（仅 recover 时）：生效偏好 + 交接摘要（≤5 行）。
- 写入记录：仅在确实写入时报告路径。
