---
name: get-stage-status
description: 读取 .openfeel/plan/{stage}/status.md，判断当前子计划状态、责任 Agent、是否允许自动推进以及下一步建议。用于 Reviewer/Executor/Feel Tester 在处理阶段任务前确认流程状态。
---

# 获取子计划状态

## 输入

- 计划阶段名 `{stage}`（如 `stage01`、`auth-login`）
- 若用户未提供阶段名，先读取 `.openfeel/plan/index.md` 查找当前活跃阶段；仍不明确时询问用户

## 执行步骤

### 0. 读取全局配置

读取 `.openfeel/config.yaml`，解析 `defaults` 中的 `execution_mode`、`auto_advance`、`test_enabled`、`merge_mode`。

### 1. 定位状态文件

读取 `.openfeel/plan/{stage}/status.md`。

若文件不存在：
- 不要自行进入自动流程。
- 返回 `missing_status`，提示需要 Architect 先创建状态文件。

### 2. 提取字段

解析以下字段：

- `执行模式`
- `自动推进`
- `状态`
- `当前责任 Agent`
- `上一责任 Agent`
- `更新时间`
- `当前任务`
- `阻塞 / 暂停原因`
- `前置依赖`
- `依赖状态`

### 3. 依赖就绪检查

若 `status.md` 中存在 `前置依赖` 字段且不为 `无`：

1. 读取 `.openfeel/plan/deps.yaml`，查找当前阶段的 `depends_on` 列表。
2. 对每条依赖检查其阶段状态：
   - `type: hard` 且依赖阶段状态为 `done` → 已满足
   - `type: hard` 且依赖阶段状态非 `done` → 未满足，阻塞
   - `type: soft` 且依赖阶段状态为 `done` → 已满足
   - `type: soft` 且依赖阶段状态非 `done` → 弱阻塞（警告但可启动）
   - `type: mutual_exclusion` 且依赖阶段状态为 `done` → 已满足
   - `type: mutual_exclusion` 且依赖阶段状态非 `done` → 阻塞，必须等待
3. 综合判断 `deps_satisfied`：
   - 所有 `hard` 和 `mutual_exclusion` 依赖满足 → `true`
   - 任一 `hard` 或 `mutual_exclusion` 依赖未满足 → `false`
4. 若 `deps.yaml` 不存在，视为无依赖声明，`deps_satisfied = true`。

### 4. 并行候选检测

当 `deps_satisfied = true` 时：

1. 读取所有阶段的 `status.md`，筛选满足以下条件的阶段：
   - `deps_satisfied = true`（本 Skill 递归判断）
   - `状态` 为 `ready_for_code` 或 `auto_running`
   - `自动推进` 为 `enabled`（若 status.md 未填则回退到 config.yaml `auto_advance`）
2. 收集为 `parallel_candidates` 列表，供 Feel 批量调度执行。

### 5. 判断自动推进资格

**字段回退**：若 `status.md` 未填写 `执行模式` 或 `自动推进`，从 `.openfeel/config.yaml` `defaults` 中读取对应值。

**测试状态排除**：若 `.openfeel/config.yaml` 中 `test_enabled=false`，则以下测试链路状态视为已禁用，不参与自动推进：
  - `ready_for_test`、`test_writing`、`testing`、`bug_found`、`bug_fixing`
  - 当前处于上述任一状态时，建议直接切换至 `done`（跳过测试链路）
  - `review_passed` 在 `test_enabled=false` 时等价于 `done`

只有同时满足以下条件才返回 `can_auto_continue = true`：

- `执行模式` 为 `auto`
- `自动推进` 为 `enabled`
- `状态` 不是 `done` 或 `paused`
- `当前责任 Agent` 不是 `user`
- `依赖状态` 不为 `blocked`（所有 hard 依赖必须满足）

否则返回 `can_auto_continue = false`，并说明原因。

### 6. 输出格式

```markdown
## 子计划状态

- 阶段：{stage}
- 执行模式：manual | auto
- 自动推进：disabled | enabled
- 状态：{status}
- 当前责任 Agent：{agent}
- 前置依赖：{依赖列表 或 无}
- 依赖就绪：true | false
- 可自动推进：true | false
- 阻塞原因：{reason 或 无}

## 并行候选
{若依赖就绪且可自动推进，列出同批次可并行启动的其他阶段}

## 下一步建议
{根据状态给出下一步，例如：启动 Code、等待用户、启动 Tester、停止流程；若存在并行候选则建议批量启动}
```

## 状态到下一步映射

| 状态 | 下一步建议 |
|------|------------|
| `planned` | 等待用户确认或 Planner 细化计划 |
| `ready_for_code` | Planner 可启动 Executor |
| `coding` | Executor 正在开发 |
| `ready_for_review` | Executor 可启动 Reviewer 审查，或等待用户触发 |
| `review_failed` | Reviewer 可启动 Executor 修复审查问题 |
| `review_passed` | Feel 可推进到 ready_for_test |
| `ready_for_test` | Feel 可启动 Feel Tester |
| `test_writing` | Feel Tester 正在写测试 |
| `testing` | Feel Tester 正在测试 |
| `bug_found` | Feel Tester 可启动 Executor 修复 Bug |
| `bug_fixing` | Executor 正在修复 Bug |
| `done` | 流程完成，停止 |
| `paused` | 等待用户处理暂停原因 |
