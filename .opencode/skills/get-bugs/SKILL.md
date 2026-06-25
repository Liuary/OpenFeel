---
name: get-bugs
description: 获取当前模块下状态为 open 或 fixing 的 Bug 列表，供代码 Agent 会话启动或承接时使用。
---

# 获取当前 Bug

## 输入

无（自动从 `.ai/users/{username}/bugs/index.md` 和模块归属中提取）

## 执行步骤

### 1. 读取模块索引

读取 `.ai/users/{username}/bugs/index.md`，获取当前 Agent 负责模块下的所有 Bug 条目（编号、标题、状态、优先级）。

### 2. 筛选活跃 Bug

过滤出状态为 `open` 或 `fixing` 的 Bug。

### 3. 格式化输出

按优先级排序（high → medium → low），输出格式：

```
模块 [模块名] 待处理 Bug：
  [BUG-001] (open, high) 登录页面崩溃
  [BUG-003] (fixing, medium) 用户列表排序异常

共 2 个：1 个待承接(open) / 1 个修复中(fixing)
```

### 4. 无 Bug 时

输出：`模块 [模块名] 当前无待处理 Bug。`
