# v4.1-stage-01 代码审查

> 构建脚本自动同步模板 — 5 个 op (op-001 ~ op-005)

## 统计

| 状态 | 数量 |
|------|------|
| pending | 1 |
| closed | 0 |

---

## REV-001: buildUpdatedJsonc 未确保已有 opencode.jsonc 的 instructions 包含 AGENTS.md

- **状态**：pending
- **优先级**：low
- **提出人**：Reviewer (GLM-5.1)
- **提出时间**：2026-07-07 00:30
- **blocking**：false

### 问题描述

`update.ts` 中 `buildUpdatedJsonc()` 函数仅在 `instructions` 字段不存在时设置默认值 `['AGENTS.md', '.opencode/instructions/core.md']`。当目标项目已有 `opencode.jsonc` 且 `instructions` 数组不含 `AGENTS.md` 时，`openfeel update` 不会将其添加。

op-004 新增了 `initProject()` 创建 AGENTS.md 骨架文件的逻辑，但 `updateProject()` 未同步确保 instructions 引用包含 `AGENTS.md`。对于先 init 再 update 的流程，AGENTS.md 会被 init 创建但 update 不会补充引用。

### 影响范围

仅影响已有 `opencode.jsonc` 但 instructions 缺少 `AGENTS.md` 的目标项目。新项目（无 opencode.jsonc）不受影响，因为会创建包含 `AGENTS.md` 的默认 instructions。

### 建议修复

在 `buildUpdatedJsonc()` 中，当 `instructions` 数组存在但不含 `AGENTS.md` 时，将其插入到数组首位：

```typescript
if (Array.isArray(jsoncObj.instructions) && !jsoncObj.instructions.includes('AGENTS.md')) {
  jsoncObj.instructions.unshift('AGENTS.md');
}
```

### 处理记录

| 时间 | 操作者 | 说明 | Commit |
|------|--------|------|--------|

### 验收记录

| 时间 | 验收人 | 结论 | 备注 |
|------|--------|------|------|
