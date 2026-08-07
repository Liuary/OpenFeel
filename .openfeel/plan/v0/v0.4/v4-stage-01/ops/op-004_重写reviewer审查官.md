# op-004：重写 reviewer.md — 审查官 Agent

- **阶段**：v4-stage-01
- **状态**：pending
- **前置**：op-001（确保 architect.md 已删除，reviewer 成为唯一审查者）
- **负责 Agent**：Executor
- **最多重试**：3

## 目标
将 reviewer.md（当前 111 行）重写为部署项目对齐版本（约 44 行），合并 architect.md 职责：架构审查 + 5 审查维度 + 异种模型交叉审查。

## 实施步骤
- [ ] 1. 读取部署项目参考文件 `C:\Code\AI\test_deploy\openfeel_test\.opencode\agents\reviewer.md`
- [ ] 2. 细读源项目当前 `C:\Code\AI\OpenFeel\.opencode\agents\reviewer.md`，确认理解差异
- [ ] 3. 以部署项目 reviewer.md 为蓝本，覆写源项目 reviewer.md，变更要点：
  - frontmatter: `mode: subagent`, `model: cross_model`, `color: "#D4A017"`
  - 标题改为「Reviewer 审查官 Agent，异种推理模型，负责交叉审查计划/方案/代码」
  - 核心职责（4 条）：计划审查 / 方案审查 / 代码审查 / 提交 REV 条目
  - 新增审查维度表（5 维度）：正确性 / 规范性 / 安全性 / 完整性 / 一致性
  - 新增审查流程图：读取方案 → 审查 diff → 提交 REV → Schemer 修正 → 再审 → 通过
  - 保留模型选择声明：必须由异种推理模型驱动
  - 删除原有内容：会话启动自检流程、审查流程-提交问题详细步骤、审查流程-验收详细步骤、与 Tester 的职责边界表、与 review-worker 的区别表、工具使用规范
  - 保留注意事项（精简为 2 条）：只审查不修复、REV 编号格式
- [ ] 4. 写完后校对行数，确保约 44 行

## 产出文件
- `.opencode/agents/reviewer.md`（重写）

## 自测清单
- [ ] reviewer.md frontmatter 包含 `mode: subagent`, `model: cross_model`, `color: "#D4A017"`
- [ ] 核心职责明确包含「计划审查」「方案审查」「代码审查」「提交 REV 条目」四项
- [ ] 包含 5 审查维度表（正确性/规范性/安全性/完整性/一致性）
- [ ] 明确声明「只审查不修复，发现问题交由 Schemer → Executor 链路处理」
- [ ] 明确声明「必须由异种推理模型驱动」
- [ ] 不包含「与 review-worker 的区别」章节
- [ ] 不包含独立的「工具使用规范」章节
- [ ] 不包含冗长的审查提交/验收详细步骤
- [ ] 总行数约 44~50 行

## 修正记录
| 次数 | 时间 | 问题 | 修正内容 |
|------|------|------|----------|
