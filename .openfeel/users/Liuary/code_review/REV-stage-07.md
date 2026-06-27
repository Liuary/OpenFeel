# stage-07 代码审查

> OpenCode 适配器：feel Agent 定义、/opfx:* 技能、opencode.jsonc 更新

## REV-001: formatJsonc 丢弃 opencode.jsonc 中的非标准字段，导致数据丢失

- **状态**：closed
- **优先级**：high
- **提出人**：ReviewWorker
- **提出时间**：2026-06-25 23:50

### 问题描述

`formatJsonc()` 函数（`src/core/update.ts:791-839`）采用手动拼接 JSONC 的方式输出配置文件，仅输出以下已知字段：

```typescript
// formatJsonc 当前输出的字段
- `$schema`
- `default_agent`
- `instructions`
- `skills`
- `experimental`
```

当用户的 `opencode.jsonc` 包含其他 OpenCode 标准字段（如 `model`、`models`、`agents`、`mcp_servers`、`plugins`、`permissions` 等）时，这些字段会被**静默丢弃**。

#### 影响范围

- 若用户已在 `opencode.jsonc` 中配置了模型覆盖（`model` / `models`）、MCP 服务器（`mcp_servers`）、插件（`plugins`）等，执行 `openfeel update` 后这些配置将永久丢失。
- 当前项目的 `opencode.jsonc` 仅包含已知字段，因此项目自身不受影响。但该函数作为公共 API 导出，任何下游项目都会面临此风险。

#### 根因

`buildUpdatedJsonc` 将完整对象传入 `formatJsonc`，但 `formatJsonc` 仅序列化已知字段子集，其余字段被忽略。

#### 建议修复

方案一（推荐）：在 `formatJsonc` 开头保留原始 JSON 字符串，仅对 `default_agent`、`skills` 等需要修改的字段做字符串替换，其余保持不变。这样注释和未知字段都能完整保留。

方案二：扩展 `formatJsonc` 为通用 JSONC 序列化器。遍历 `obj` 的所有键，对每个键按类型序列化（string → `"..."`，number → 原样，object → 递归）。已知字段保持注释格式。复杂度较高但更健壮。

方案三（最小修复）：在 `formatJsonc` 中补充 OpenCode 常见字段（`model`、`models`、`agents`、`mcp_servers`、`plugins`）。但这只是补丁，无法覆盖未知的未来字段。

### 处理记录

| 时间 | 操作者 | 说明 | Commit |
|------|--------|------|--------|
| 2026-06-25 23:34 | CodeWorker | 修复：`formatJsonc` 改为双模式 — 有原始内容时基于字符串做补丁式替换（仅替换 `default_agent` 和 `skills` 块），其余字段及注释原样保留；新增 `replaceSkillsFieldInJsonc` 辅助函数处理 skills 块替换 | — |

### 验收记录

| 2026-06-25 23:38 | ReviewWorker | 通过 ✅ | 双模式正确实现：补丁模式仅替换 default_agent 和 skills，保留未知字段和注释；无原始内容时回退到 buildJsoncFromObject 构建。replaceSkillsFieldInJsonc 括号计数正确处理字符串转义和尾随逗号。测试 186/186 全通过。 |


---

## REV-002: CLI update 命令缺少 try-catch 错误处理

- **状态**：closed
- **优先级**：medium
- **提出人**：ReviewWorker
- **提出时间**：2026-06-25 23:50

### 问题描述

`registerUpdateCommand` 的 `.action()` 回调（`src/commands/update.ts:14-52`）直接调用 `updateProject(targetPath)` 而未包裹 `try-catch`。若 `updateProject()` 因文件权限不足、磁盘空间不足、JSONC 解析异常等原因抛出错误，用户将看到未处理的异常堆栈而非清晰的错误提示。

```typescript
// 当前代码 — 无异常处理
.action((path?: string) => {
  const targetPath = resolve(path ?? process.cwd());
  // ...
  const result = updateProject(targetPath);  // 可能抛出异常
  // ...
});
```

#### 对比

- `registerInitCommand`（`src/commands/init.ts`）同样存在此问题，这是现有模式的一致性缺陷。
- 但 `init` 命令通常只在项目创建时执行一次，而 `update` 命令可能被频繁调用（每次流水线更新），异常概率更高。

#### 建议修复

在 `.action()` 回调外层添加 `try-catch`：

```typescript
.action((path?: string) => {
  try {
    const targetPath = resolve(path ?? process.cwd());
    // ... existing logic ...
  } catch (err) {
    console.error(`错误：更新失败 — ${(err as Error).message}`);
    process.exit(1);
  }
});
```

### 处理记录

| 时间 | 操作者 | 说明 | Commit |
|------|--------|------|--------|
| 2026-06-25 23:34 | CodeWorker | 修复：在 `.action()` 回调外层添加 try-catch，捕获异常后输出友好错误信息并退出 | — |

### 验收记录

| 2026-06-25 23:38 | ReviewWorker | 通过 ✅ | try-catch 正确包裹整个 action 回调体，异常信息清晰（错误：更新失败 — + err.message），退出码正确（process.exit(1)）。路径验证也在 try 块内，resolve 异常可被捕获。 |

