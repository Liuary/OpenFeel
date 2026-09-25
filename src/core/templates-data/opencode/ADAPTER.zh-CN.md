# OpenCode 平台适配器

这是 OpenCode 平台适配器，包含 9 个 Agent 定义和 14 个 Skill。

部署后将在目标项目中生成：

- `opencode.jsonc` — OpenCode 平台配置（Agent 模型、Skills 列表等）
- `.opencode/agents/` — 9 个 Agent 定义（feel、openfeel-planner、openfeel-schemer、openfeel-executor、openfeel-reviewer、openfeel-feel-tester、openfeel-vision、openfeel-archiver、openfeel-utility）
- `.opencode/skills/` — 14 个 Skill 定义（openfeel-agent-model-check、openfeel-bug-acceptance、openfeel-check-kb、openfeel-get-bugs、openfeel-get-stage-status、openfeel-health、openfeel-model-check、openfeel-model-config、openfeel-recover、openfeel-roadmap、openfeel-search-kb、openfeel-sync-status、openfeel-update-stage-status、openfeel-wizard）
- `.opencode/instructions/core.md` — 平台操作规范
- `.opencode/ADAPTER.md` — 本适配器说明
- `.opencode/.gitignore` — 忽略规则

> 注：本项目不部署 `package.json`（由用户项目自行管理）。
