# op-010：更新 AGENTS.md 引用

- **阶段**：v4-stage-01
- **状态**：done
- **前置**：op-001, op-009（必须先删除旧 Agent 并更新 core.md，再修改 AGENTS.md 确保一致性）
- **负责 Agent**：Executor
- **最多重试**：3

## 目标
更新 `AGENTS.md`（当前 96 行），移除废弃 Agent 引用，更新职责边界表和自动闭环约束为 Feel 调度模型。

## 实施步骤
- [x] 1. 读取源文件 `C:\Code\AI\OpenFeel\AGENTS.md`（96 行）
- [x] 2. 执行以下精确修改（保持其他行不变）：
  - **L70-75「职责边界」表**：当前引用了 Planner / Executor / Architect / Reviewer / Tester / Archiver
    - `Architect / Reviewer 审查代码` → `Reviewer 审查代码`
    - `Tester 提交 Bug 和验收` → `Feel Tester 提交 Bug 和验收`
    - 确保 Planner / Executor / Archiver 保持不变
  - **L77「自动闭环约束」**：当前引用了 `AutoRunner`、`code-worker`、`review-worker`、`test-writer`、`tester`、`debug`
    - 整段重写为 Feel 调度模型：
    ```
    4. **Feel 调度约束**：Feel 总统领统一调度下游 Agent（Planner / Schemer / Executor / Reviewer / Feel Tester / Archiver），通过 `task` 工具按流水线阶段（计划→方案→执行→审查→测试→归档）串行推进。各 Agent 仅在自己的职责边界内操作，不得越界启动其他 Agent 或自行修改 flow.json 状态。
    ```
- [x] 3. 全文搜索确认无其他废弃 Agent 引用（architect / code / auto-runner / code-worker / review-worker / test-writer / debug / ask / tester）残留

## 产出文件
- `AGENTS.md`（更新）

## 自测清单
- [x] 职责边界表已更新：无 `Architect`、`Tester` 已改为 `Feel Tester`
- [x] 自动闭环约束已替换为 Feel 调度约束
- [x] 无 `AutoRunner` / `code-worker` / `review-worker` / `test-writer` / `debug` / `ask` / `auto-runner` 残留
- [x] 无 `worktree` 残留
- [x] 文件总行数变化 ±5 行以内
- [x] 保留的行为准则、核心约束、编码风格、操作规范等章节未受损

## 修正记录
| 次数 | 时间 | 问题 | 修正内容 |
|------|------|------|----------|
