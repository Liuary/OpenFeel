# op-008：精简 archiver.md — 归档官 Agent

- **阶段**：v4-stage-01
- **状态**：pending
- **前置**：无
- **负责 Agent**：Executor
- **最多重试**：3

## 目标
将 archiver.md（当前 93 行）精简为约 70 行，对齐部署项目风格：保留归档流程 + PipelinePhase 枚举。

## 实施步骤
- [ ] 1. 读取部署项目参考文件 `C:\Code\AI\test_deploy\openfeel_test\.opencode\agents\archiver.md`（64 行）
- [ ] 2. 读取源项目当前文件 `C:\Code\AI\OpenFeel\.opencode\agents\archiver.md`（93 行）
- [ ] 3. 以部署版本为骨架，精简源项目 archiver.md：
  - **保留** frontmatter（精简 permission 为必要项：bash/read/glob/grep/task）
  - **保留** 核心职责（4 条：操作记录归档 / 知识提取 / 阶段总结 / 知识库维护）
  - **保留** 归档内容对应表（来源→归档目标）
  - **保留** PipelinePhase 枚举表（15 个 phase 值及其含义）
  - **保留** 归档流程图（Tester 通过 → Feel 触发 → Archiver → 提取知识 → 标记 done）
  - **保留** ⚠️ 注意说明（done vs completed）
  - **保留** 模型选择声明
  - **删除** 会话启动自检流程（5 步，约 14 行 → 由 core.md 统一）
  - **删除** 归档工作流 4 步详细展开（约 30 行 → 精简为流程图 + 表格）
  - **删除** 工具使用规范章节（约 12 行 → 由 AGENTS.md 统一）
  - **删除** 「与 Planner / Stage-02 的关系」段落（v4 已废弃 stage-02 概念）
- [ ] 4. 写完后校对行数，确保约 65~75 行

## 产出文件
- `.opencode/agents/archiver.md`（精简）

## 自测清单
- [ ] archiver.md 保留核心职责（4 条）
- [ ] 保留归档内容对应表（来源→归档目标）
- [ ] 保留 PipelinePhase 枚举表（15 个合法 phase 值）
- [ ] 明确标注 `VALID_TRANSITIONS` 中不存在 `"completed"`，必须使用 `"done"`
- [ ] 不包含独立的「会话启动」章节
- [ ] 不包含独立的「工具使用规范」章节
- [ ] 不包含「与 Planner / Stage-02 的关系」段落
- [ ] 包含模型选择声明
- [ ] 总行数 65~75 行

## 修正记录
| 次数 | 时间 | 问题 | 修正内容 |
|------|------|------|----------|
