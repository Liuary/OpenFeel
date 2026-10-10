# Claude 适配器

> ✅ 已实现（v1.1.6）。

- **启用**：`openfeel setup --tools claude`（与 opencode 适配器并存，**默认不启用**；不带 `--tools` 时 `~/.claude/` 零变化）。
- **部署资产到 `~/.claude/`**：`CLAUDE.md`（全局约束，用户已有内容 append 不覆盖）、`agents/`（9 个，含 `feel`）、`skills/`（17 个共享源）、`settings.json`（注入 `"agent":"feel"` + `"permissions":{"defaultMode":"auto"}`，用户既有键逐字保留）。
- **升级**：`npm i -g openfeel@latest` → `openfeel setup --tools claude`；首次创建 `~/.claude/{agents,skills}` 后重启会话或 `/reload-skills`。
