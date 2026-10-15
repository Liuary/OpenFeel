# OpenCode 平台适配器

这是 OpenCode 平台适配器，包含 10 个 Agent 定义和 22 个 Skill。

部署后将在目标项目中生成：

- `opencode.jsonc` — OpenCode 平台配置（Agent 模型、Skills 列表等）
- `.opencode/agents/` — 10 个 Agent 定义（feel、openfeel-planner、openfeel-schemer、openfeel-explorer、openfeel-executor、openfeel-reviewer、openfeel-feel-tester、openfeel-vision、openfeel-archiver、openfeel-utility）
- `.opencode/skills/` — 22 个 Skill 定义（openfeel-agent-model-check、openfeel-bug-acceptance、openfeel-check-kb、openfeel-cli-usage、openfeel-context-hygiene、openfeel-delegation、openfeel-get-bugs、openfeel-get-stage-status、openfeel-health、openfeel-logging、openfeel-memory、openfeel-model-check、openfeel-model-config、openfeel-recover、openfeel-req、openfeel-roadmap、openfeel-search-kb、openfeel-sync-status、openfeel-tool-usage、openfeel-update-stage-status、openfeel-wizard、openfeel-workspace）
- `.opencode/ADAPTER.md` — 本适配器说明
- `.opencode/.gitignore` — 忽略规则

> 注：本项目不部署 `package.json`（由用户项目自行管理）。
