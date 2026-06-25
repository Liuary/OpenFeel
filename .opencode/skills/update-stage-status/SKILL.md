---
name: update-stage-status
description: 标准化更新 .ai/plan/{stage}/status.md 的子计划状态、责任 Agent 和状态记录，避免各 Agent 随意改写状态文件。适用于自动闭环和人工流程中的阶段状态变更。
---

# 更新子计划状态

## 输入

- 计划阶段名 `{stage}`
- 新状态 `{status}`
- 当前责任 Agent `{current_agent}`
- 上一责任 Agent `{previous_agent}`
- 说明 `{note}`
- 是否保持自动推进 `{keep_auto}`（默认保持原值）

### 可选输入（Worktree / 并行 管理）

当阶段以 worktree 模式运行时，可额外传入以下字段：

- `worktree_branch`：worktree 分支名（如 `auto-stage-02`）
- `parallel_batch`：并行批次标识（如 `batch-2026-05-15-001`），同一批次并行启动的 worktree 共享此标识
- `parallel_stages`：同批次并行阶段列表（如 `[stage-04]`）
- `merge_status`：合并状态（`not_started` / `pending_merge` / `merged` / `cleanup_ready` / `cleaned`）
- `depends_status`：依赖状态（`pending` / `satisfied` / `blocked`），当依赖阶段完成时更新

## 执行步骤

### 0. 读取全局配置

读取 `.ai/config.yaml`，获取 `defaults` 中的 `execution_mode`、`auto_advance`、`merge_mode`。

### 1. 读取状态文件

读取 `.ai/plan/{stage}/status.md`。

若文件不存在且当前 Agent 为 Architect：
  1. 从 `.ai/config.yaml` `defaults` 读取 `execution_mode`、`auto_advance` 作为初始值
  2. 按模板创建 `status.md`，将 config 默认值写入对应字段
其他 Agent 不得自行创建，必须提示用户或 Architect 先初始化阶段状态。

### 2. 校验状态变更

允许的状态值：

```text
planned | ready_for_code | coding | ready_for_review | review_failed | review_passed | ready_for_test | test_writing | testing | bug_found | bug_fixing | done | paused
```

若新状态不在列表中，停止并说明错误。

### 3. 更新字段

**常规更新**（每次状态变更必须更新）：

- `状态`
- `当前责任 Agent`
- `上一责任 Agent`
- `更新时间`

**Worktree / 并行 更新**（仅在可选输入传入时更新，位于 `## Worktree / Session` 块）：

- `分支名` → `worktree_branch`（如 `auto-stage-02`）
- `并行批次` → `parallel_batch`
- `并行阶段` → `parallel_stages`
- `合并状态` → `merge_status`

**依赖状态更新**（位于文件顶部字段）：

- `依赖状态` → `depends_status`（当 Architect 检测到依赖阶段完成时更新，典型值：`pending → satisfied`）

除非用户明确要求，否则不得改变：

- `执行模式`
- `自动推进`
- `前置依赖`（由 Architect 在 Phase 3.5 中声明，运行时不应修改）

### 4. 追加状态记录

在 `## 状态记录` 表格末尾追加：

```markdown
| yyyy-mm-dd HH:MM | {agent} | {旧状态} → {新状态} | {note} |
```

### 5. 安全暂停规则

遇到以下情况必须将状态改为 `paused`，当前责任 Agent 改为 `user`：

- 计划外架构变更
- 需要修改范围超过原计划
- 权限不明确
- 测试环境缺失
- 连续两次验收失败
- 自动推进链路无法判断下一步

### 6. 合并状态处理

当子计划状态变为 `done` 或 `review_passed`（且 Architect 验收完毕）时，根据 `.ai/config.yaml` 中的 `merge_mode` 决定合并行为：

- **`merge_mode=auto`**：
  1. 将 `合并状态` 更新为 `merged`（实际合并由 AutoRunner 或 Architect 执行 git 操作，Skill 仅更新状态字段）
  2. 将 `合并状态` 更新为 `cleaned`
  3. 在状态记录中注明"自动合并"
- **`merge_mode=manual`**：
  1. 将 `合并状态` 设为 `pending_merge`
  2. 输出提示：合并与清理需在 Agent Manager 中手动完成

### 7. 输出结果

输出更新摘要：

```markdown
已更新 {stage}/status.md：
- 状态：{旧状态} → {新状态}
- 当前责任 Agent：{current_agent}
- 自动推进：保持 {enabled/disabled}
```
