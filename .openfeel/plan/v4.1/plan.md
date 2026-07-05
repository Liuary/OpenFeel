# OpenFeel v4.1 — 模板自动同步

> 基于 v4.0 部署时发现的模板不同步问题

## 一、背景

v4.0 审查阶段发现 `openfeel update` 部署的 core.md 是旧版（424行），根因是 `src/core/templates.ts` 中的 Base64 模板为手动维护的静态快照，修改源文件（`.opencode/instructions/core.md`）不会自动同步。

## 二、目标

将模板维护从"手动同步"改为"构建时自动生成"，消除人工遗漏风险。

## 三、改造项

| # | 任务 | 说明 |
|:--:|------|------|
| 1 | **构建脚本自动生成 core.md 模板** | `build.js` 中增加步骤：读取 `.opencode/instructions/core.md` → Base64 编码 → 写入 templates.ts |
| 2 | **构建脚本自动生成 Agent 模板** | 读取 `.opencode/agents/*.md` → 生成 `AGENT_DEFINITIONS` 到 update.ts |
| 3 | **构建脚本自动生成 Skill 模板** | 读取 `.opencode/skills/*/SKILL.md` → 生成 `SKILL_DEFINITIONS` 到 update.ts |
| 4 | **移除 dev_core.md 中手动同步约束** | 自动同步后，该约束不再需要 |
| 5 | **构建产物验证** | CI/build 后自动对比模板与源文件，不一致时报错 |
| 6 | **init 创建 AGENTS.md 模板** | `init` 应创建 AGENTS.md 空模板，与 opencode.jsonc 的 instructions 引用保持一致 |
| 7 | **子 Agent 返回精简模式** (P2) | 减少 Feel 上下文膨胀，实际 cache 命中率 95.5% 说明当前影响有限 |

## 四、预期效果

- 修改 core.md / Agent / Skill 后，`npm run build` 自动同步模板
- 不再出现 `update` 部署旧版内容的问题
- `init` 产出完整骨架（含 AGENTS.md）
- 子 Agent 返回精简摘要，会话上下文增速降低 ~60%
