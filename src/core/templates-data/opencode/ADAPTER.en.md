# OpenCode Platform Adapter

This is the OpenCode platform adapter, containing 10 Agent definitions and 22 Skills.

After deployment, the following files will be generated in the target project:

- `opencode.jsonc` — OpenCode platform configuration (Agent models, Skills list, etc.)
- `.opencode/agents/` — 10 Agent definitions (feel, openfeel-planner, openfeel-schemer, openfeel-explorer, openfeel-executor, openfeel-reviewer, openfeel-feel-tester, openfeel-vision, openfeel-archiver, openfeel-utility)
- `.opencode/skills/` — 22 Skill definitions (openfeel-agent-model-check, openfeel-bug-acceptance, openfeel-check-kb, openfeel-cli-usage, openfeel-context-hygiene, openfeel-delegation, openfeel-get-bugs, openfeel-get-stage-status, openfeel-health, openfeel-logging, openfeel-memory, openfeel-model-check, openfeel-model-config, openfeel-recover, openfeel-req, openfeel-roadmap, openfeel-search-kb, openfeel-sync-status, openfeel-tool-usage, openfeel-update-stage-status, openfeel-wizard, openfeel-workspace)
- `.opencode/ADAPTER.md` — This adapter documentation
- `.opencode/.gitignore` — Ignore rules

> Note: This project does not deploy `package.json` (managed by the user's project itself).
