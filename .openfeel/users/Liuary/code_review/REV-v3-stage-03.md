# REV-v3-stage-03：效率优化

> 审查人：Architect Agent (Liuary) | 审查时间：2026-06-27 22:40

## REV-008: Schemer 产出路径指向不存在的目录
- **状态**：pending
- **优先级**：high
- **提出人**：Architect Agent
- **提出时间**：2026-06-27 22:40

### 问题描述

`schemaer.md`（stage-03 新建）第 39 行声明产出路径为 `.openfeel/stages/{stage}/ops/op-NNN_{title}.md`，但该目录**不存在**。现有计划体系使用 `.openfeel/plan/{stage}/` 路径。此路径错误会导致 Schemer 写入失败。

**修复建议**：统一为 `.openfeel/plan/{stage}/ops/op-NNN_{title}.md`，与 planner/architect 对齐。

### 处理记录
| 时间 | 操作者 | 说明 | Commit |
|------|--------|------|--------|

### 验收记录
| 时间 | 验收人 | 结论 | 备注 |
|------|--------|------|------|

---

## REV-009: Feel 任务路由表缺少 Schemer
- **状态**：pending
- **优先级**：high
- **提出人**：Architect Agent
- **提出时间**：2026-06-27 22:40

### 问题描述

`feel.md` 中新增的「并行调度」章节引用了 Schemer 产出多个 op 的场景，但 Feel 的任务路由表（第 45-53 行）中未定义 Schemer 的路由规则。用户无法通过 Feel 请求"制定操作方案"。

**修复建议**：在路由表中增加一行：`"制定方案"、"细化操作步骤" → Schemer（task(schemer)）`

### 处理记录
| 时间 | 操作者 | 说明 | Commit |
|------|--------|------|--------|

### 验收记录
| 时间 | 验收人 | 结论 | 备注 |
|------|--------|------|------|

---

## REV-010: Executor 版本校验和网络安全仅覆盖 npm
- **状态**：pending
- **优先级**：medium
- **提出人**：Architect Agent
- **提出时间**：2026-06-27 22:40

### 问题描述

`executor.md` 的「环境自适应」章节明确支持 5 种包管理器（npm/yarn/pnpm/bun），但「依赖版本自适应」和「网络安全与超时」章节仅使用 npm 命令（`npm view`、`npm ping`、`npm install --timeout`）。这导致：Executor 检测到项目使用 yarn 后，仍用 npm 命令校验版本。

### 处理记录
| 时间 | 操作者 | 说明 | Commit |
|------|--------|------|--------|

### 验收记录
| 时间 | 验收人 | 结论 | 备注 |
|------|--------|------|------|

---

## REV-011: `addAutoFixReview` 命令层 opId 未校验
- **状态**：pending
- **优先级**：medium
- **提出人**：Architect Agent
- **提出时间**：2026-06-27 22:40

### 问题描述

`commands/flow.ts` 中 `flow review add --auto-fix` 命令接受 `--op <id>` 参数后直接传给 `mgr.addAutoFixReview()`，未校验 opId 格式（是否含 `.`）和是否存在对应的 stage/op。其他命令（如 `flow retry`、`flow advance`）均有 `getOp()` 检查。

### 处理记录
| 时间 | 操作者 | 说明 | Commit |
|------|--------|------|--------|

### 验收记录
| 时间 | 验收人 | 结论 | 备注 |
|------|--------|------|------|

---

## REV-012: wizard 的 phaseLabels 硬编码不完整
- **状态**：pending
- **优先级**：low
- **提出人**：Architect Agent
- **提出时间**：2026-06-27 22:40

### 问题描述

`flow wizard` 中 `phaseLabels` 硬编码了 15 个 phase 的中文标签。若 `pipeline.yaml` 自定义扩展了 phase 表，wizard 会显示"未知"。建议从 `pipelineConfig.phases` 动态生成标签。

### 处理记录
| 时间 | 操作者 | 说明 | Commit |
|------|--------|------|--------|

### 验收记录
| 时间 | 验收人 | 结论 | 备注 |
|------|--------|------|------|
