---
name: openfeel-recover
description: 跨会话上下文恢复，供 Agent 在会话启动时重建流水线状态。
---

<!-- openfeel:generated — 本文件由 npm run build 生成，请勿手工编辑 -->
# 跨会话上下文恢复

> ⚠️ **本仓自举**：本仓（openfeel 源码仓库）开发/执行时请用 `node bin/openfeel.js <cmd>`；安装后使用 `openfeel <cmd>`。

## 输入

无

## 执行步骤

1. 运行 `openfeel flow recover` 获取全局状态、流水线阶段、当前操作、阻塞原因与待处理任务
2. 读取**索引** `.openfeel/users/{username}/dev_last.md`（「用户偏好」「主题索引」「公共交接区」）→ **按需**再读主题文件（**文件名英文，如 `decisions.md`/`pending.md`**）恢复详情；**旧格式**（无 `## 主题索引` 节）→ 触发惰性迁移（按英文命名映射拆分生成 `dev_last/` + 索引，原文保留）
3. 将两者合并为当前会话起点

> **加锁提示（A9）**：恢复流程为**只读**，无需加锁；仅**会话末尾写入**走 `withFileLock` 临界区（见 agents-md「并发写加锁协议」）。

## 输出

恢复摘要：流水线状态 + 阻塞项 + 待处理任务列表
