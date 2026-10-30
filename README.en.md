# OpenFeel — AI Agent Development Process Governance CLI

[中文](README.zh-CN.md) | [Changelog](CHANGELOG.md) | [npm](https://www.npmjs.com/package/openfeel) | [Getting Started](docs/GETTING_STARTED.md)

> 📚 Version capability overview (Chinese with English highlights): [docs/VERSIONS.md](docs/VERSIONS.md) | Per-version details: [CHANGELOG.md](CHANGELOG.md)

OpenFeel is a TypeScript CLI tool for end-to-end process governance in AI Agent development. Core philosophy: **"Slim prompts, process in tools"** — agents understand workflows by reading `flow.json` state, not long text documents.

> **Current adapter harness**: **opencode (default)** ｜ **Claude Code** (`--tools claude`, since v1.1.6) ｜ **DSH** (`--tools dsh`, since v1.3.0); the framework targets multi-harness support (other adapters reserved).  
> **Default Model Config**: DeepSeek V4 (primary reasoning) + GLM-5.3-flash (cross-review) + DeepSeek-flash (multimodal vision).  
> `openfeel init` auto-detects registered models and guides configuration.
>
> ⚠️ The `openfeel <cmd>` examples below are the **installed-package usage**; when developing/running **inside this source repository**, use `node bin/openfeel.js <cmd>` instead (the global `openfeel` may lag behind this repository — it is not synced with the source here).

## What Problem Does It Solve

Common pain points in AI Agent project development:
- **Chaotic process**: Agent scheduling relies on ad-hoc coordination without a unified mechanism
- **Untrackable state**: Unclear who is doing what, progress, or blockers
- **Scattered outputs**: Plans, code, reviews, and tests spread across places without a single entry point
- **Lost experience**: Knowledge vanishes after each session, starting from scratch every time

OpenFeel provides automated pipeline governance — agents obtain current state and next instructions from `flow.json` rather than reading lengthy documents.

## Installation

```bash
npm install -g openfeel        # Install
npm install -g openfeel@latest # Update to latest
```

Requires: Node.js ≥ 20

## Upgrading openfeel

```bash
npm i -g openfeel@latest   # 1. Upgrade the CLI
openfeel setup             # 2. Re-run deployment to refresh global AGENTS.md/agents/skills/opencode.jsonc
# 3. Restart the harness (opencode) to load the new global config
```

> `npm i -g` alone does not refresh global assets — you must re-run `openfeel setup` and restart the harness.
> The CLI also prints a passive prompt when it detects deployment drift or a missing global deployment.
> If unsure whether an upgrade is needed, run `openfeel setup --check` to diagnose whether the deployed version matches the CLI version.

## Quick Start

```bash
# 1. Initialize project workspace
openfeel init ./my-project

# 2. Create a version roadmap
openfeel roadmap create v1.0

# 3. Add a work stage
openfeel plan stage add stage-01

# 4. Create an operation scheme
openfeel plan scheme create stage-01 "Implement core features"

# 5. View pipeline status
openfeel flow status
```

## Recommended Usage: Requirement-driven + Fast Iteration

> Use **fast** by default for day-to-day work: one plan review and one code review, skipping scheme/test. Use **full** for large or architectural changes.

```bash
openfeel req add "Add a feature" --workflow-mode fast            # 1. Publish a requirement
openfeel req claim REQ-NNN                                       # 2. Claim it
openfeel plan stage add vX.Y.Z-stage-NN --workflow-mode fast     # 3. Create a fast stage
openfeel req link --stage vX.Y.Z-stage-NN --requirement REQ-NNN  # 4. Link them
openfeel flow next                                               # 5. Iterate as scheduled
```

- **fast (recommended)**: daily iteration; keeps plan review and code review, skips scheme/test;
- **full**: large / architectural changes, all six gates;
- **general**: pipeline-free ad-hoc work, requirement-level only;
- requirements auto-close once every linked stage is done.

## Claude Code Adapter (since v1.1.6)

> Coexists with the opencode adapter; **disabled by default** (requires explicit `--tools claude`).

- **Enable**: `openfeel setup --tools claude` (or `--tools opencode,claude` for both harnesses).
- **Assets deployed to `~/.claude/`**: `CLAUDE.md` (global constraints, managed-region three-state; existing user content is appended, not overwritten), `agents/` (**10**, incl. `feel`), `skills/` (**22** shared sources), `settings.json` (injects `"agent":"feel"` + `"permissions":{"defaultMode":"auto"}`; **existing user keys preserved verbatim**; **created when absent, never overwritten** — the user-sovereign `model` key is not rewritten).
- **Upgrade**: `npm i -g openfeel@latest` → `openfeel setup --tools claude`; **after the first creation of `~/.claude/{agents,skills}`, restart the session or run `/reload-skills`** to load new skills/agents; `CLAUDE.md` takes effect on the **next session**. `npm i -g` alone does not refresh global assets.
- **Zero-touch by default**: without `--tools`, `~/.claude/` is **unchanged**.

## DSH Adapter (since v1.3.0)

> Coexists with the opencode / Claude Code adapters; **not deployed by default**. The adapter ships inside the single `openfeel` package.

```bash
npm i -g openfeel@latest      # 1. Install/upgrade (single package, includes dsh/)
openfeel setup --tools dsh    # 2. Deploy into DSH profiles (all by default; use --dsh-profile web)
# 3. Restart the DSH host
```

- Writes `<DSH_HOME>/profiles/<name>/package.json`: `dependencies["openfeel-dsh"] = "link:<openfeelRoot>/dsh"` plus `dsh.profile.bundles += "openfeel-dsh"`, and runs `pnpm install` when needed (skipped when the dependency is unchanged and the link is valid).
- Requires DSH `0.2.0-rc.2`, Node ≥ 20.17, an existing DSH profile, and a global `openfeel` on PATH.
- Upgrade: `npm i -g openfeel@latest` → restart DSH; the `link:` points at the same path and follows the package.
- For development you can `link:` the repository `dsh/` directly; see [dsh/README.md](dsh/README.md) and [dsh/ADAPTER.md](dsh/ADAPTER.md).
- `openfeel update --tools dsh` does not apply (DSH is a global deployment).

## Fast Iteration Mode (since v1.1.7)

> **Coexists** with the full pipeline; new deployments default to **fast** (`config.yaml defaults.workflow_mode`), overridable per stage.

- **Fast line**: `plan_pending → plan_review → plan_passed → exec_running → review_pending → review_passed → archiving → done` (skips 6 phases: `scheme_*` / `test_*`; **plan review and code review each keep a single round**; `review_failed` loops back for retries).
- **Choose and switch**: `openfeel plan stage add <name> --workflow-mode full|fast|general` (new stage); `openfeel stage set <stage> --workflow-mode full|fast|general` (per-stage switch); `openfeel config set defaults.workflow_mode full|fast|general` (project-level default memory). **`general` is requirement-level only** (since v1.2.1; see [docs/VERSIONS.md](docs/VERSIONS.md)).
- **Inspect (read-only)**: `openfeel flow mode [--stage <id>] [--json]` (current mode + source); `openfeel flow phases [--mode full|fast|general] [--stage <id>]` (view the transition table per mode).
- **Auto-advance enabled by default**: new deployments default to `auto_advance: enabled` (since v1.1.7); to disable: `openfeel config set auto_advance disabled`.
- **v1.3.3 fixes (fast-mode structural gaps)**: fast chain gains a **rework edge** `review_passed → exec_running` (`flow advance --reason "<fix note>"` is audited); fast stages without ops can attach **stage-level REVs** via `flow review add --stage <id>`; the write guard now allows **new files in an uninitialized workspace** and `docs/**` / doc-note paths (source still requires `exec_running`); `plan stage add` now **focuses the stage atomically**. Stage-ID normalization and `plan/` directory mapping: see [docs/commands.md](docs/commands.md).

Upgrade/migration notes: see [docs/GETTING_STARTED.md](docs/GETTING_STARTED.md) ("工作流模式（full / fast）与自动推进" section, Chinese) and [CHANGELOG.md](CHANGELOG.md) `[1.1.7]`.

## Command Reference

| Command | Purpose |
|---------|---------|
| `openfeel init [path]` | Initialize new project with `.openfeel/` workspace and platform adapter (current: opencode) |
| `openfeel update` | Incrementally deploy platform adapter to existing projects; `--tools <list>` explicitly enables the Claude Code adapter; **`--tools dsh` is not supported** (use `setup`) |
| `openfeel flow` | Pipeline state management (status / phases / overview / current / advance / attempt / ops list / health [--fix] / checkpoint / migrate; status·current·health·metrics·overview support --json) |
| `openfeel roadmap` | Version roadmap management (create / show) |
| `openfeel plan` | Stage and scheme management (stage add/list [--deps/--tasks], scheme create [--draft] / publish / rename / remove / list) |
| `openfeel lint` | Quality gate checks (i18n key symmetry / kb stale references; **non-zero exit on findings**, no escape hatch) |
| `openfeel config` | Configuration management (get / set[**all `defaults.*`**] / effective / get-lang / list-projects, supports --global) |
| `openfeel knowledge` | Knowledge base management (list / add / search / index / dedup) |
| `openfeel archive <stage>` | Stage archiving with knowledge extraction (**stage-summary archiving** — distinct from `flow archive` version-shard archiving) |
| `openfeel flow archive` | flow.json version-shard archiving (`<version>` / `list` / `show`; distinct from `openfeel archive` stage-summary archiving) |
| `openfeel req` | Requirement flow (add / list / show / claim / release / set / link / advance / board / next) |
| `openfeel setup` | Global-only deployment (global AGENTS.md + agents + skills + adapter config); no project `.openfeel/`; `--tools <list>` explicitly enables the Claude Code adapter; **`--tools dsh`** deploys into DSH profiles (`--dsh-profile <name>` to narrow) |
| `openfeel migrate` | Migrate legacy-layout projects (detect / backup / rollback) |
| `openfeel model` | Three-tier agent model config (set / get / list, `--scope`) |
| `openfeel stage` | Work stage status (status / set / task / create [deprecated]) |
| `openfeel project` | Project management (overview) |
| `openfeel view` | Review item management (list / accept; add/update/remove via `flow review add|update|remove`) |
| `openfeel instructions` | Generate structured instructions (artifact → XML/JSON) |

Details: [docs/commands.md](docs/commands.md)

## Core Concepts

### Feel Agent (Orchestrator)

Feel is the command center, receiving user intent and dispatching downstream Agents to execute tasks.

### 9-Agent System

| Agent | Role | Description |
|-------|------|-------------|
| Feel | Orchestrator | Global scheduling and decisions |
| Planner | Planner | Roadmap and stage planning |
| Schemer | Schemer | Fine-grained operation plans |
| Executor | Executor | Code implementation |
| Reviewer | Reviewer | Cross-model code review |
| Feel Tester | Tester | Formal test acceptance |
| Utility | Utility Agent | Mechanical file operations |
| Vision | Vision Agent | Multimodal visual analysis |
| Archiver | Archiver | Operation archiving and knowledge extraction |

### Global Deployment and Workspace Layering

Framework assets (10 agents / 22 skills / global `AGENTS.md` / global `opencode.jsonc`) are deployed to `~/.config/opencode/` via `openfeel setup`; **the repository itself keeps no project-level `.opencode/agents|skills`** (since stage-55).

Workspace state is layered into two files: `current.md` (team file, cross-user overall progress, ≤5 entries + auto-archiving) and `dev_last.md` (local index + topic directory, cross-session recovery). Framework assets are **automatically backed up** before deployment overwrite to `~/.openfeel/backup/{ts}/`.

### Three-Tier Planning

```
Roadmap
  └── Stage
        └── Op（operation）— the finest execution unit
```

### flow.json — Pipeline State Core

`.openfeel/flow.json` is the single source of truth, recording all stages, operations, reviews, and logs. Agents read it for context and write back state after execution.

### Pipeline Commands & Agent Roles

| Entry | Purpose |
|-------|---------|
| `openfeel flow` | Pipeline status query & advancement |
| `openfeel plan` | Plan formulation |
| `openfeel plan scheme` | Scheme formulation |
| `openfeel-executor` | Code execution |
| `openfeel view` | Review item acceptance |
| `openfeel-feel-tester` | Test acceptance |
| `openfeel archive` | Stage archiving |
| `openfeel knowledge` | Knowledge base operations |

## Architecture

```
CLI Layer (Commander)
  ├── init / update / setup / migrate
  ├── stage / project / model
  ├── flow         ← FlowManager (state machine core)
  ├── roadmap      ← Roadmap module
  ├── plan         ← Stage / Scheme module
  ├── lint         ← Quality gates (i18n + kb)
  ├── config       ← Configuration management
  ├── knowledge    ← Knowledge base module
  ├── archive      ← Archiving module
  └── view         ← Review item module

Core Layer
  ├── FlowManager — Pipeline state read/write, advance, retry, log
  ├── config — Config file I/O (incl. global profile)
  ├── schema — Zod Schema validation engine
  ├── plan/ — Three-tier planning (roadmap / stage / scheme)
  ├── artifact-graph/ — Dependency graph & instruction generation
  ├── view/ — Review item CRUD
  ├── archive/ — Archive consolidation
  ├── backup.ts — pre-overwrite backup (~/.openfeel/backup/{ts}/)
  ├── fs/ — atomic writes + advisory file locks
  └── workspace/ — Directory structure & knowledge base
```

> **Global asset deployment**: 10 agents / 22 skills / global `AGENTS.md` / global `opencode.jsonc` are deployed to `~/.config/opencode/` via `openfeel setup`; the repository itself keeps no project-level `.opencode/agents|skills` (since stage-55).

## Development

```bash
npm install        # Install dependencies
npm run build      # Compile TypeScript
npm test           # Run tests (77 files / 1978 cases; Linux CI skips 1 Windows-only case)
```

## Acknowledgments

This project is based on [AI_Prompt](https://github.com/Liuary/AI_Prompt) and draws inspiration from tools like [OpenSpec](https://github.com/Fission-AI/OpenSpec).

## License

[MIT](LICENSE)
