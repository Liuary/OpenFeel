# OpenCode 平台适配器

这是 OpenCode 平台适配器，包含 9 个 Agent 定义和 14 个 Skill。

部署后将在目标项目中生成：

- `opencode.jsonc` — OpenCode 平台配置（Agent 模型、Skills 列表等）
- `.opencode/agents/` — 9 个 Agent 定义（feel、planner、schemer、executor、reviewer、feel-tester、vision、archiver、utility）
- `.opencode/skills/` — 14 个 Skill 定义（agent-model-check、bug-acceptance、check-kb、get-bugs、get-stage-status、health、model-check、model-config、recover、roadmap、search-kb、sync-status、update-stage-status、wizard）
- `.opencode/instructions/core.md` — 平台操作规范
- `.opencode/ADAPTER.md` — 本适配器说明
- `.opencode/.gitignore` — 忽略规则

> 注：本项目不部署 `package.json`（由用户项目自行管理）。
