---
name: openfeel-sync-status
description: 聚合所有成员的任务进度视图（各用户 dev_last 索引主题 + flow.json 阶段状态），供任意 Agent 快速了解项目整体协作状态。
---

# Skill: openfeel-sync-status

# 聚合任务进度

## 输入

无（**自动**：各用户 `.openfeel/users/*/dev_last.md` 索引「主题索引」+ `flow.json` 阶段状态 `stages[].phase/status`）

## 执行步骤

### 1. 读取进度来源

读取 `.openfeel/users/*/dev_last.md` 的「主题索引」摘要 + `flow.json` 的 active stages；**按用户聚合**展示。

### 2. 解析条目

对每个用户提取：
- **成员**：用户目录名（`.openfeel/users/{username}/`）
- **主题**：`dev_last.md`「主题索引」中的显示主题名（附英文文件名 `dev_last/{english-name}.md`）
- **摘要**：各主题下 ≤5 条核心摘要（≤100 字）
- **阶段**：`flow.json` 中与该用户相关的阶段 `phase` / `status`

### 3. 查漏补缺

- 对比 **`flow.json` active stages** 与各用户 `dev_last` 索引覆盖的 stage，检查是否存在**无任何用户索引覆盖的活跃阶段**
- 若有，标记为「未同步」

### 4. 格式化输出

按阶段/用户分组输出，格式：

```
📊 项目协作进度

🟢 {stage-id} [{phase}]
  {username}
    - {主题显示名}（`dev_last/{english-name}.md`）：{摘要（≤100 字）}

🟡 阻塞
  {username} — {阻塞原因（若 dev_last 索引标注）}

⚪ 未同步
  {username} — 尚无主题索引条目
  {stage-id} — 无用户索引覆盖
```

### 5. 偏离告警

若同一 stage 在 `flow.json` 标记为活跃，但**所有用户索引均未覆盖**，输出告警：

```
⚠️ 阶段 {stage_id} 处于活跃状态但无用户索引覆盖，请确认存在负责成员
```

## 输出

格式化后的 Markdown 进度摘要，不含文件修改。
