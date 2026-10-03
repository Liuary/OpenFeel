# OpenFeel — AI Agent Development Process Governance CLI

[中文](README.zh-CN.md) | [Changelog](CHANGELOG.md) | [npm](https://www.npmjs.com/package/openfeel) | [Getting Started](docs/GETTING_STARTED.md)

OpenFeel is a TypeScript CLI tool for end-to-end process governance in AI Agent development. Core philosophy: **"Slim prompts, process in tools"** — agents understand workflows by reading `flow.json` state, not long text documents.

> **Current adapter harness**: opencode (default); the framework targets multi-harness support (other adapters reserved).  
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

## What's New in v1.1.2

- **Self-description**: `flow phases [--json]` lists all valid phases and the transition table (5 top-level JSON keys: `schemaVersion` / `phases` / `transitions` / `advanceAccepted` / `transitionsDiff`).
- **Stage governance**: `flow stage remove` / `plan stage add --deps` / `stageId` validation and directory-conflict detection.
- **Effective config**: `config effective` prints the resolved value plus its source (`status.md > config.yaml > profile.yaml > builtin`).
- **Structured output**: `flow status/current/health/metrics/overview --json` (pure JSON + `schemaVersion`).
- **Correction/cleanup CLI surface**: `plan scheme remove/rename/publish`, `flow ops list`, `flow health --fix`, `knowledge dedup`, `lint` non-zero exit on findings.
- **Deployment & backup**: automatic backup before overwrite at `~/.openfeel/backup/{ts}/`; new skill `openfeel-cli-usage` (skills 16 → 17).
- **Output encoding adaptation (stage-58 / stage-61 fix)**: `auto` passes through **UTF-8** on Windows non-TTY (pipe-friendly); TTY / POSIX pass through UTF-8; **GBK requires explicit** `--encoding gbk` / `OPENFEEL_ENCODING`; `--json` is **always UTF-8**; unencodable chars degrade to `?` without warning.
- **Runtime log (stage-58)**: written by default to `~/.openfeel/cli/logs/openfeel-YYYY-MM-DD.log` (UTF-8, one file per day); `--log-file <path>` changes the path, `--no-log` / `OPENFEEL_LOG=0` disables it, `--debug` enables debug-level entries.

## Command Reference

| Command | Purpose |
|---------|---------|
| `openfeel init [path]` | Initialize new project with `.openfeel/` workspace and platform adapter (current: opencode) |
| `openfeel update` | Incrementally deploy platform adapter to existing projects |
| `openfeel flow` | Pipeline state management (status / phases / overview / current / advance / attempt / ops list / health [--fix] / checkpoint / migrate; status·current·health·metrics·overview support --json) |
| `openfeel roadmap` | Version roadmap management (create / show) |
| `openfeel plan` | Stage and scheme management (stage add/list [--deps/--tasks], scheme create [--draft] / publish / rename / remove / list) |
| `openfeel lint` | Quality gate checks (i18n key symmetry / kb stale references; **non-zero exit on findings**, no escape hatch) |
| `openfeel config` | Configuration management (get / set[**all `defaults.*`**] / effective / get-lang / list-projects, supports --global) |
| `openfeel knowledge` | Knowledge base management (list / add / search / index / dedup) |
| `openfeel archive <stage>` | Stage archiving with knowledge extraction |
| `openfeel setup` | Global-only deployment (global AGENTS.md + agents + skills + adapter config); no project `.openfeel/` |
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

Framework assets (9 agents / 17 skills / global `AGENTS.md` / global `opencode.jsonc`) are deployed to `~/.config/opencode/` via `openfeel setup`; **the repository itself keeps no project-level `.opencode/agents|skills`** (since stage-55).

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

> **Global asset deployment**: 9 agents / 17 skills / global `AGENTS.md` / global `opencode.jsonc` are deployed to `~/.config/opencode/` via `openfeel setup`; the repository itself keeps no project-level `.opencode/agents|skills` (since stage-55).

## Development

```bash
npm install        # Install dependencies
npm run build      # Compile TypeScript
npm test           # Run tests (1018 cases / 61 test files; Linux CI skips 1 Windows-only case)
```

## Acknowledgments

This project is based on [AI_Prompt](https://github.com/Liuary/AI_Prompt) and draws inspiration from tools like [OpenSpec](https://github.com/Fission-AI/OpenSpec).

## License

[MIT](LICENSE)
