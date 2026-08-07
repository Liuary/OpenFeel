---
name: recover
description: 跨会话上下文恢复，供 Agent 在会话启动时重建流水线状态。
---

# 跨会话上下文恢复

## 输入

无

## 执行步骤

1. 运行 `openfeel flow recover` 获取全局状态、流水线阶段、当前操作、阻塞原因与待处理任务
2. 读取 `.openfeel/users/{username}/dev_last.md` 恢复上次操作状态与待续事项
3. 将两者合并为当前会话起点

## 输出

恢复摘要：流水线状态 + 阻塞项 + 待处理任务列表
