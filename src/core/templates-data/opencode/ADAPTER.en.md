# OpenCode Platform Adapter

This is the OpenCode platform adapter, containing 9 Agent definitions and 14 Skills.

After deployment, the following files will be generated in the target project:

- `opencode.jsonc` — OpenCode platform configuration (Agent models, Skills list, etc.)
- `.opencode/agents/` — 9 Agent definitions (feel, planner, schemer, executor, reviewer, feel-tester, vision, archiver, utility)
- `.opencode/skills/` — 14 Skill definitions (agent-model-check, bug-acceptance, check-kb, get-bugs, get-stage-status, health, model-check, model-config, recover, roadmap, search-kb, sync-status, update-stage-status, wizard)
- `.opencode/instructions/core.md` — Platform operation instructions
- `.opencode/ADAPTER.md` — This adapter documentation
- `.opencode/.gitignore` — Ignore rules

> Note: This project does not deploy `package.json` (managed by the user's project itself).
