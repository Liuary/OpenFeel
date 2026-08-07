# op-001：删除 9 个旧 Agent 文件

- **阶段**：v4-stage-01
- **状态**：pending
- **前置**：无
- **负责 Agent**：Executor
- **最多重试**：3

## 目标
删除 9 个废弃的 Agent 定义文件，将 Agent 体系从 15 个精简为 7 个的参数准备。

## 实施步骤
- [ ] 1. 进入 `.opencode/agents/` 目录，确认以下 9 个文件存在：
  - `auto-runner.md` — 自动闭环调度器，职责由 Feel + flow.json 接管
  - `code-worker.md` — 自动闭环中的编码子 Agent，职责合并到 executor
  - `review-worker.md` — 自动闭环中的审查子 Agent，职责合并到 reviewer
  - `ask.md` — 问答 Agent，职责由 Feel 兼任
  - `debug.md` — 调试 Agent，职责并入 executor 的自测 + 修复机制
  - `test-writer.md` — 测试编写 Agent，职责由 feel-tester 接管
  - `architect.md` — 架构审查 Agent，职责合并到 reviewer
  - `code.md` — Bug 修复 Agent，职责合并到 executor
  - `tester.md` — 旧测试 Agent，替换为 feel-tester
- [ ] 2. 逐一删除上述 9 个文件（使用 `git rm` 保留版本历史）
- [ ] 3. 确认 `.opencode/agents/` 剩余 6 个文件：archiver.md, executor.md, feel.md, planner.md, reviewer.md, schemer.md（feel-tester.md 将由 op-005 新建）

## 产出文件
- `git rm` 操作，无新增文件

## 自测清单
- [ ] `.opencode/agents/` 下确认为 6 个文件（archiver, executor, feel, planner, reviewer, schemer）
- [ ] 确认已删除的 9 个文件在 `git status` 中显示为 deleted
- [ ] 确认 `git status` 无其他意外变更
- [ ] 各 op-002~op-005 的目标文件（feel.md, executor.md, reviewer.md）仍然存在，可供后续重写

## 修正记录
| 次数 | 时间 | 问题 | 修正内容 |
|------|------|------|----------|
