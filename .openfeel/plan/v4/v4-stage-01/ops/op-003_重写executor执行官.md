# op-003：重写 executor.md — 执行官 Agent

- **阶段**：v4-stage-01
- **状态**：pending
- **前置**：op-001（确保 code.md 已删除，避免残留）
- **负责 Agent**：Executor
- **最多重试**：3

## 目标
将 executor.md（当前 162 行）重写为部署项目对齐版本（约 31 行），合并 code.md 职责：自测 + 修复 + 重试机制。

## 实施步骤
- [ ] 1. 读取部署项目参考文件 `C:\Code\AI\test_deploy\openfeel_test\.opencode\agents\executor.md`
- [ ] 2. 细读源项目当前 `C:\Code\AI\OpenFeel\.opencode\agents\executor.md`，确认理解差异
- [ ] 3. 以部署项目 executor.md 为蓝本，覆写源项目 executor.md，变更要点：
  - frontmatter: `mode: subagent`, `model: fast`, `color: "#D94A4A"`
  - 核心职责（4 条）：按方案编码 / 自测 / 重试机制（最多 3 次，超限回退 Schemer）/ 修正实现
  - 工作规则（4 条）：严格按方案实施 / 每次修改后自测 / 通过后产出自测报告 / 不参与方案制定和正式测试
  - 删除原有全部内容：环境自适应（5 节，约 80 行）、依赖版本自适应、网络安全与超时、代码实现流程、与 Code Agent 的协作边界、工具使用规范。这些内容交由 AGENTS.md 统一约束
  - 保留模型选择声明：由快速模型驱动
- [ ] 4. 写完后校对行数，确保约 31 行

## 产出文件
- `.opencode/agents/executor.md`（重写）

## 自测清单
- [ ] executor.md frontmatter 包含 `mode: subagent`, `model: fast`
- [ ] 核心职责明确包含「按方案编码」「自测」「重试机制」「修正实现」四项
- [ ] 工作规则包含「最多重试 3 次，超限回退 Schemer」
- [ ] 不包含环境自适应（5 节）、依赖版本自适应、网络安全与超时等上下文无关的大段内容
- [ ] 不包含「与 Code Agent 的协作边界」（code.md 已删除）
- [ ] 不包含独立的「工具使用规范」章节
- [ ] 明确声明「不参与方案制定，不执行正式测试」
- [ ] 总行数约 31~35 行

## 修正记录
| 次数 | 时间 | 问题 | 修正内容 |
|------|------|------|----------|
