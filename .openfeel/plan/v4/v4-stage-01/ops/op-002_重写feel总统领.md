# op-002：重写 feel.md — 总统领 Agent

- **阶段**：v4-stage-01
- **状态**：pending
- **前置**：op-001（确保旧 feel.md 未被误删）
- **负责 Agent**：Executor
- **最多重试**：3

## 目标
将 feel.md（当前 95 行）重写为部署项目对齐版本（约 52 行），变身 Feel 总统领：推理模型驱动、flow.json 调度、Planner 职责兼任、/opfx: 技能表。

## 实施步骤
- [ ] 1. 读取部署项目参考文件 `C:\Code\AI\test_deploy\openfeel_test\.opencode\agents\feel.md`
- [ ] 2. 细读源项目当前 `C:\Code\AI\OpenFeel\.opencode\agents\feel.md`，确认理解差异
- [ ] 3. 以部署项目 feel.md 为蓝本，覆写源项目 feel.md，变更要点：
  - frontmatter: `mode: primary`, `color: "#8B5CF6"`，webfetch 保留 allow
  - 标题改为「Feel 总统领 Agent，推理模型驱动的总调度者」
  - 核心职责：理解用户意图 → 调度下游 Agent → 管理 flow.json 流水线 → 决策权
  - 新增 /opfx: 技能表（8 个技能项：flow/plan/scheme/code/view/test/archive/kb）
  - 新增工作流程图：用户输入 → Feel 理解意图 → 调用对应 Agent → 检查结果 → 推进流水线
  - 保留模型选择说明：由主力推理模型驱动
  - 保留注意事项：不直接修改源码、通过 openfeel flow 管理状态
  - 删除原有内容：自检流程（移至 core.md）、任务路由表（已由 /opfx: 技能表取代）、并行调度策略（简化为 task 调度）、对话管理（由 AGENTS.md 约束）、工具使用规范（由 AGENTS.md 统一约束）
- [ ] 4. 写完后校对行数，确保在 50~55 行范围内

## 产出文件
- `.opencode/agents/feel.md`（重写）

## 自测清单
- [ ] feel.md frontmatter 包含 `mode: primary`, `color: "#8B5CF6"`
- [ ] 包含 `/opfx:` 技能表（至少包含 flow/plan/scheme/code/view/test/archive/kb）
- [ ] 明确声明「Feel 由主力推理模型驱动」
- [ ] 明确声明「Planner 职责由 Feel 兼任」
- [ ] 明确声明「通过 `openfeel flow` 命令管理，不要手动修改 flow.json」
- [ ] 不包含旧的 self-check / 任务路由表 / 工具使用规范（这些职责已归入 core.md / AGENTS.md）
- [ ] 总行数 50~55 行（含 frontmatter）

## 修正记录
| 次数 | 时间 | 问题 | 修正内容 |
|------|------|------|----------|
