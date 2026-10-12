# 模板加载模块（template-loader）

> 模块文档，由归档官在归档时维护。对应源码：`src/core/template-loader.ts`。

## 职责

运行时模板加载器，提供按语言 / 名称查表返回模板内容的能力。模板内容在 `npm run build` 时由 `build.js` 从模板源内联为 TS 字符串常量（`AUTO-GENERATED-BEGIN/END` 块），运行时零 fs 读取，消除跨平台路径解析风险。**skill 权威源 = 中立共享源 `src/core/templates-data/skills/`**（stage-68 由 `opencode/skills` 迁入）；agent / ADAPTER 源自 `templates-data/opencode/`；**Claude Code agent / 约束源自 `templates-data/claude/`**（stage-69 新增）；AGENTS.md 源自 `templates-data/agents-md/`。

> 说明：本文中 `templates-data/opencode/` 与 `OPENCODE_*` 均为 **opencode 适配器**的目录/常量名（属适配器实现细节，保留）。

## 单源架构（stage-36）

v1.1.0-stage-36 前存在双层模板源（`templates-data/agents/` vs `templates-data/opencode/agents/` 等三对），已收敛为**单一权威树**（agent/adapter 源自 `templates-data/opencode/`，**skill 源自中立共享源 `templates-data/skills/`（v1.1.6-stage-68 由 `opencode/skills` 迁入，为多 harness 共用）**，全局 AGENTS.md 源自 `templates-data/agents-md/`）。template-loader 持有的注入对象（`AGENT_TEMPLATES` / `OPENCODE_AGENT_TEMPLATES` / `OPENCODE_SKILL_DEFINITIONS` / `OPENCODE_CONFIG_TEMPLATES` / `AGENTS_MD_TEMPLATES`）全部由该单源生成；build.js 的 `validateSingleSourceConsistency()` 断言两对对象键集与内容一致（v1.1.1 移除 instructions 双源断言；`CORE_INSTRUCTIONS_TEMPLATES` 已退役）。

## 核心 API

| 函数 | 功能 |
|------|------|
| `loadAgentTemplate(lang, agentId)` | 按语言 + agentId 返回 update 用 agent 模板（`AGENT_TEMPLATES`） |
| `listAgentIds(lang)` | 列出 update 用 agent 模板的 agentId |
| `loadTemplate(lang, templateName)` | 按语言 + 模板名返回模板（agents-md / core-instructions） |
| `loadOpencodeAgentTemplate(lang, agentId)` | 按语言 + agentId 返回 init 用 agent 模板（`OPENCODE_AGENT_TEMPLATES`，`openfeel-*` 前缀） |
| `listOpencodeAgentIds(lang)` | 列出 init 用 agent 模板的 agentId（`feel` + 8 个 `openfeel-*`） |
| `loadOpencodeSkillTemplate(skillName)` | 按 skill 名返回 init 用 skill 模板（`OPENCODE_SKILL_DEFINITIONS`，`openfeel-*` 前缀） |
| `listOpencodeSkillNames()` | 列出全部 skill 名（18 个，均带 `openfeel-` 前缀） |
| `loadOpencodeConfigTemplate(lang, configName)` | 按语言 + 配置名返回 opencode 配置模板（`OPENCODE_CONFIG_TEMPLATES`） |
| `loadClaudeConstraintTemplate(lang)` | 按语言返回 Claude 约束模板（`CLAUDE_CONSTRAINT_TEMPLATES`，即 CLAUDE.md 内容）；回退 `zh-CN` + 缺失抛错（stage-69） |
| `loadClaudeAgentTemplate(lang, agentId)` | 按语言 + agentId 返回 Claude agent 模板（`CLAUDE_AGENT_TEMPLATES`，9 个含 `feel`）；回退 + 缺失抛错（stage-69） |
| `listClaudeAgentIds(lang)` | 列出 Claude agent id（**9**，含 `feel`）（stage-69） |

## 语言回退

- `lang` 缺失或不存在时回退 `zh-CN`（`AGENT_TEMPLATES[lang] ?? AGENT_TEMPLATES['zh-CN']`）。
- `AGENTS_MD_TEMPLATE` / `CORE_INSTRUCTIONS_TEMPLATE_B64` 为 `zh-CN` 缺省导出的便捷常量。

## 变更历史

| 阶段 | 变更 |
|------|------|
| stage-36 | 模板源收敛为 `templates-data/opencode/` 单源；agent/skill 键加 `openfeel-` 前缀（`feel` 保留）；生成段键随 build 重生成自动带前缀 |
| v1.1.1 | 退役 `CORE_INSTRUCTIONS_TEMPLATES` 生成段与 `loadTemplate('core-instructions')`；`TemplateName` 收窄为 `'agents-md'`；`AGENTS_MD_TEMPLATE` 保留、移除 `CORE_INSTRUCTIONS_TEMPLATE_B64`；`OPENCODE_CONFIG_TEMPLATES` 仅保留 adapter |
| v1.1.6-stage-68 | **skill 源改中立共享源**：`OPENCODE_SKILL_DEFINITIONS`（及 `SKILL_DEFINITIONS`）改由 `templates-data/skills/`（原 `opencode/skills`）生成——**对象名 / 加载 API 不变**，仅数据源改共享；`listOpencodeSkillNames()` 仍返回 17 个 skill 名 |
| v1.1.6-stage-69 | **新增 Claude 生成段 + 运行时 3 API**：build 注入 `CLAUDE_AGENT_TEMPLATES`（双层 Record）/ `CLAUDE_CONSTRAINT_TEMPLATES`（单层 Record），各 1 对 `AUTO-GENERATED-BEGIN/END` 锚点（位于 `OPENCODE_CONFIG_TEMPLATES` 段之后）；手写区新增 `loadClaudeConstraintTemplate` / `loadClaudeAgentTemplate` / `listClaudeAgentIds`（语义沿 `loadAgentTemplate`：语言回退 `zh-CN` + 缺失抛错）；生成段由 build 重生成（**禁手改**） |
