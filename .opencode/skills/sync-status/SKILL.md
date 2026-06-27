---
name: sync-status
description: 聚合所有成员的任务进度视图，供任意 Agent 快速了解项目整体协作状态。
---

# Skill: sync-status

# 聚合任务进度

## 输入

无（自动从 `.openfeel/dev/current.md` 提取）

## 执行步骤

### 1. 读取进度文件

读取 `.openfeel/dev/current.md`，提取所有 `@{username}` 行。

### 2. 解析任务条目

对每行提取：
- **成员**：`@{username}` 后的用户名
- **模块**：`[模块名]` 或 `[-]`
- **状态**：`进行中` / `阻塞` / `已完成`
- **描述**：状态后的任务描述文本
- **锁定**：若有 `🔒` 标记，列出锁定的文件

### 3. 查漏补缺

- 对比 `.openfeel/users/` 下的所有用户目录，检查是否有成员在 `current.md` 中无记录
- 若有，标记为「未同步」

### 4. 格式化输出

按状态分组输出（进行中 → 阻塞 → 已完成 → 未同步），格式：

```
📊 项目协作进度

🟢 进行中（N 人）
  @alice  [auth] 登录模块重构
    🔒 src/auth/login.py
  @bob    [db]   数据库迁移脚本编写
    🔒 migrations/v2.sql

🟡 阻塞（M 人）
  @charlie [api] 等待第三方 OAuth 审批

🔵 已完成（K 人）
  @dave [config] 环境变量模板补充

⚪ 未同步（L 人）
  @eve — 尚未在 current.md 中声明任务
```

### 5. 偏离告警

若发现同一模块有 2 人同时标记为「进行中」且无 🔒 区分，输出告警：

```
⚠️ 模块 [module_name] 多人同时活跃，请确认无冲突
```

## 输出

格式化后的 Markdown 进度摘要，不含文件修改。

Base directory for this skill: file:///C:/Code/AI/AI_Prompt/.kilo/skills/sync-status
