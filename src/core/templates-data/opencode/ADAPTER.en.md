# OpenCode Platform Adapter

This is the OpenCode platform adapter, containing 9 Agent definitions and 14 Skills.

After deployment, the following files will be generated in the target project:

- `opencode.jsonc` — OpenCode platform configuration (Agent models, Skills list, etc.)
- `.opencode/agents/` — 9 Agent definitions (feel, openfeel-planner, openfeel-schemer, openfeel-executor, openfeel-reviewer, openfeel-feel-tester, openfeel-vision, openfeel-archiver, openfeel-utility)
- `.opencode/skills/` — 14 Skill definitions (openfeel-agent-model-check, openfeel-bug-acceptance, openfeel-check-kb, openfeel-get-bugs, openfeel-get-stage-status, openfeel-health, openfeel-model-check, openfeel-model-config, openfeel-recover, openfeel-roadmap, openfeel-search-kb, openfeel-sync-status, openfeel-update-stage-status, openfeel-wizard)
- `.opencode/ADAPTER.md` — This adapter documentation
- `.opencode/.gitignore` — Ignore rules

> Note: This project does not deploy `package.json` (managed by the user's project itself).
