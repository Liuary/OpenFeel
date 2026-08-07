# op-005：新建 feel-tester.md — 测试官 Agent

- **阶段**：v4-stage-01
- **状态**：pending
- **前置**：op-001（确保 tester.md 已删除，避免新旧共存）
- **负责 Agent**：Executor
- **最多重试**：3

## 目标
新建 feel-tester.md（约 53 行），作为测试官 Agent 取代已删除的 tester.md。推理模型驱动，负责正式测试验收与 Bug 管理。

## 实施步骤
- [ ] 1. 读取部署项目参考文件 `C:\Code\AI\test_deploy\openfeel_test\.opencode\agents\feel-tester.md`
- [ ] 2. 确认源项目 `.opencode/agents/tester.md` 已被 op-001 删除
- [ ] 3. 以部署项目 feel-tester.md 为蓝本，新建源项目 `C:\Code\AI\OpenFeel\.opencode\agents\feel-tester.md`：
  - frontmatter: `description: Feel Tester 测试官 Agent`, `mode: subagent`, `color: "#E8A838"`
  - 核心职责（4 条）：测试分析 / 测试执行 / Bug 提交 / 回归验证
  - 测试类型表（3 类）：单元测试 / 集成测试 / 验收测试
  - Bug 管理格式模板（简洁版）
  - 与其他 Agent 的关系说明（4 条）
  - 模型选择声��：由推理模型驱动
- [ ] 4. 写完后校对行数，确保约 53 行

## 产出文件
- `.opencode/agents/feel-tester.md`（新建）

## 自测清单
- [ ] `.opencode/agents/feel-tester.md` 文件存在
- [ ] frontmatter 包含 `mode: subagent`, `color: "#E8A838"`
- [ ] 核心职责包含「测试分析」「测试执行」「Bug 提交」「回归验证」
- [ ] 包含测试类型表（单元测试/集成测试/验收测试）
- [ ] 包含 Bug 管理格式模板
- [ ] 明确声明「由推理模型驱动」
- [ ] 明确声明各 Agent 关系（Feel 调度 → Reviewer 审查通过后 → Tester → Schemer 修复 → 重新测试）
- [ ] 不包含冗长的会话启动流程
- [ ] 不包含独立的工具使用规范
- [ ] 总行数约 53~58 行
- [ ] 确认旧的 tester.md 已不存在

## 修正记录
| 次数 | 时间 | 问题 | 修正内容 |
|------|------|------|----------|
