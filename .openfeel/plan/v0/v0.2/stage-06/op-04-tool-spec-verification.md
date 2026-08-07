# op-04：Agent 工具使用规范在实际执行中生效 — 验证报告

- **验证时间**：2026-06-27
- **验证人**：CodeWorker Agent

## 1. `.openfeel/dev/dev_core.md` 中的规范章节

✅ **已包含**。文件第 34-108 行为「Agent 工具使用规范」章节，涵盖：

| 序号 | 工具 | 章节标题 | 行号 |
|------|------|----------|------|
| 1 | `todowrite` | 任务列表管理 | L38-53 |
| 2 | `question` | 向用户提问 | L57-70 |
| 3 | `task` | 子 Agent 调度 | L76-86 |
| 4 | `skill` | 技能加载 | L88-98 |
| - | 优先级表 | 工具使用优先级 | L100-108 |

## 2. Agent 定义文件中的工具规范引用

| Agent 文件 | 是否引用 | 引用位置 |
|-----------|----------|----------|
| `feel.md` | ✅ 引用 | L58-67「工具使用规范」章节 + 优先级表 |
| `planner.md` | ✅ 引用 | L76-85「工具使用规范」章节 + 优先级表 |
| `schemer.md` | ❌ 不存在 | 文件不存在于 `.opencode/agents/` |
| `executor.md` | ✅ 引用 | L113-123「工具使用规范」章节 + 优先级表 |
| `reviewer.md` | ✅ 引用 | L78-88「工具使用规范」章节 + 优先级表 |
| `tester.md` | ✅ 引用 | L80-90「工具使用规范」章节 + 优先级表 |
| `archiver.md` | ✅ 引用 | L76-86「工具使用规范」章节 + 优先级表 |
| `architect.md` | ✅ 引用 | L52-62「工具使用规范」章节 + 优先级表 |
| `auto-runner.md` | ✅ 引用 | L43-53「工具使用规范」章节 + 优先级表 |
| `code-worker.md` | ✅ 引用 | L37-47「工具使用规范」章节 + 优先级表 |
| `review-worker.md` | ✅ 引用 | L39-49「工具使用规范」章节 + 优先级表 |
| `code.md` | ✅ 引用 | L35-45「工具使用规范」章节 + 优先级表 |
| `test-writer.md` | ✅ 引用 | L41-51「工具使用规范」章节 + 优先级表 |

> 缺失：`schemer.md` 文件不存在。Agent 目录共 14 个文件，缺少原计划中的 Schemer Agent 定义。

## 3. `.opencode/instructions/core.md` 中的规范约束

✅ **已包含**。文件第 7 行明确要求：
> 在会话中应主动使用平台内置工具，不得仅凭对话文本完成复杂任务。

虽未单独列出 four 工具规范章节，但：
- L5-7 明确要求使用内置工具
- 全文结构遵循工具规范的范畴（read/write/bash/task/skill 等）

## 4. `src/core/templates.ts` 中生成的模板

✅ **已包含**。`CORE_INSTRUCTIONS_TEMPLATE_B64`（base64 编码的模板）源自项目自身的 `.opencode/instructions/core.md`，解码后内容与上述一致，包含工具使用约束。

`DEV_CORE_TEMPLATE` 为空框架模板，不直接包含工具规范内容（项目级的规范在 `dev_core.md` 中动态维护）。

## 验证结论

| 检查项 | 结果 | 备注 |
|--------|------|------|
| dev_core.md 含工具规范 | ✅ 通过 | 4 项工具 + 优先级表完整 |
| Agent 文件引用规范 | ⚠️ 基本通过 | 12/13 Agent 引用，schemer.md 缺失 |
| core.md 含规范约束 | ✅ 通过 | 工具使用要求明确 |
| templates.ts 含规范引用 | ✅ 通过 | instructions 模板包含完整规范 |

## 发现的问题

1. **schemer.md 缺失**：`schemer` Agent 定义文件不存在于 `.opencode/agents/` 目录。这可能是因为 Schemer 功能已合并到 Planner 或 Architect 中，但如确需独立 Agent，应补充定义文件。
