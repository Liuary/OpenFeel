# OpenFeel — AI Agent Development Process Governance CLI

[中文](README.zh-CN.md) | [Changelog](CHANGELOG.md) | [npm](https://www.npmjs.com/package/openfeel) | [Getting Started](docs/GETTING_STARTED.md)

OpenFeel is a TypeScript CLI tool for end-to-end process governance in AI Agent development. Core philosophy: **"Slim prompts, process in tools"** — agents understand workflows by reading `flow.json` state, not long text documents.

> **Current adapter harness**: **opencode (default)** ｜ **Claude Code** (`--tools claude`, since v1.1.6); the framework targets multi-harness support (other adapters reserved).  
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

## Claude Code Adapter (since v1.1.6)

> Coexists with the opencode adapter; **disabled by default** (requires explicit `--tools claude`).

- **Enable**: `openfeel setup --tools claude` (or `--tools opencode,claude` for both harnesses).
- **Assets deployed to `~/.claude/`**: `CLAUDE.md` (global constraints, managed-region three-state; existing user content is appended, not overwritten), `agents/` (**10**, incl. `feel`), `skills/` (**22** shared sources), `settings.json` (injects `"agent":"feel"` + `"permissions":{"defaultMode":"auto"}`; **existing user keys preserved verbatim**; **created when absent, never overwritten** — the user-sovereign `model` key is not rewritten).
- **Upgrade**: `npm i -g openfeel@latest` → `openfeel setup --tools claude`; **after the first creation of `~/.claude/{agents,skills}`, restart the session or run `/reload-skills`** to load new skills/agents; `CLAUDE.md` takes effect on the **next session**. `npm i -g` alone does not refresh global assets.
- **Zero-touch by default**: without `--tools`, `~/.claude/` is **unchanged**.

## Fast Iteration Mode (since v1.1.7)

> **Coexists** with the full pipeline; new deployments default to **fast** (`config.yaml defaults.workflow_mode`), overridable per stage.

- **Fast line**: `plan_pending → plan_review → plan_passed → exec_running → review_pending → review_passed → archiving → done` (skips 6 phases: `scheme_*` / `test_*`; **plan review and code review each keep a single round**; `review_failed` loops back for retries).
- **Choose and switch**: `openfeel plan stage add <name> --workflow-mode full|fast|general` (new stage); `openfeel stage set <stage> --workflow-mode full|fast|general` (per-stage switch); `openfeel config set defaults.workflow_mode full|fast|general` (project-level default memory). **`general` is requirement-level only** (since v1.2.1; see "What's New in v1.2.1").
- **Inspect (read-only)**: `openfeel flow mode [--stage <id>] [--json]` (current mode + source); `openfeel flow phases [--mode full|fast|general] [--stage <id>]` (view the transition table per mode).
- **Auto-advance enabled by default**: new deployments default to `auto_advance: enabled` (since v1.1.7); to disable: `openfeel config set auto_advance disabled`.

Upgrade/migration notes: see [docs/GETTING_STARTED.md](docs/GETTING_STARTED.md) ("工作流模式（full / fast）与自动推进" section, Chinese) and [CHANGELOG.md](CHANGELOG.md) `[1.1.7]`.

## What's New in v1.2.2

> Stages covered: **stage-95 ~ 98**. All capabilities below are **available since v1.2.2**; `docs/json-contract.md` is the single authority for the JSON contract (33 successful exports / 34 registered options). This repository's closure baseline: 74 test files / 1894 cases / 21 stages.

- **`openfeel flow next [--json]` (decision authority, read-only)**: 12 keys in fixed order (`schemaVersion,stage,phase,phaseLabel,responsibleAgent,workflowMode,reviewTier,effectiveReviewTier,legalNextPhases,suggestedCommand,guards,blockingReviews`); `responsibleAgent` shares the same source as `mapPhaseToAgent`; every element of `legalNextPhases` is accepted by `flow advance`; zero writes.
- **Global `--project <path>`**: leading/trailing/`=` forms before or after any command; semantically equivalent to cwd; language resolves from the target project while `--log-file` relative paths resolve from the original cwd; `knowledge dedup` keeps its local declaration (syntactically compatible).
- **Full read-command `--json` coverage**: 13 command surfaces (`stage status` / `flow recover` / `flow checkpoint list` / `flow log` / `project overview` / `knowledge search|list|index|dedup` / `config get|effective` / `view list` / `plan scheme list`) plus `archive <stage> --json`; **33 successful exports / 34 registered options** in total.
- **Machine-readable error envelope**: `{schemaVersion:1,error:{code,kind,message,detail}}`; exit codes **0 success / 1 expected refusal / 2 concurrent conflict / 3 internal error (new)**; legacy `{error:'...'}` keeps the string type and key order, appending `errorKind` at the end; 12-row `code→kind→exitCode` mapping.
- **`--version --json`**: `{schemaVersion:1,version,node}` (three keys; listed separately, not counted among the 33 exports/34 options).
- **`flow archive --dry-run --json` criteria details + `archive <stage> --json`**: `eligible` / `unfinishedStages` / `blockingReviews`; `archivePath` / counts; `--dry-run` writes nothing.
- **`reviewTier` disambiguation**: `flow phases --json` / `flow status.stages[]` / `flow next` now expose both the display value `reviewTier`/`displayReviewTier` and the effective value `effectiveReviewTier` (always `full`). **Correction**: when `flow advance` is not given an explicit `--review-tier`, the effective tier is always **`full`** (not derived from the mode); the mode-derived value is `flow phases --json.reviewTier` (display only). Source help-text correction moves to v1.2.3.
- **Compatibility promise**: the existing 19 successful export field sets are unbroken (additive only); human output is unchanged verbatim; exit codes 0/1/2 keep their semantics while 3 is new only; the 15-phase enum / `advanceAccepted` / full-fast behavior are unchanged; existing `flow.json` files need zero migration and receive zero injection; REQ-001 L80 ("2 = internal or usage error") is registered as a requirement-text erratum (authoritative wording in contract §2/§10).

## What's New in v1.2.1

> Stages covered: **stage-86 ~ 93 + 94** (94 = out-of-table supplementary stage: model defaults and non-destructive deployment). All capabilities below are **available since v1.2.1**.

- **Three-mode architecture (`full` / `fast` / `general`)**: the `workflow_mode` value domain grows from 2 to 3 values (default remains `fast`). `general` (no pipeline) is **requirement-level only** — stage-level / deployment-level write surfaces reject it (explicit command-layer gates in `plan stage add` / `stage set` / `config set`; wizard offers no such option); the resolution chain gains a "requirement" layer (`status.md > requirement > config.yaml > builtin`); **upgrades only, never implicit downgrades**.
- **Requirement intake and splitting (`openfeel req split`)**: **splitting publishes** — children enter `scheduled` in one shot; `parent_id` is traceability-only (**not in aggregation / not in the done gate / not in `PATCH_WHITELIST`**); parallel intake (`claim` never blocks); **requirements are decoupled from versions** (`target_version` is display / filter / sort only, never a gate). The `req` command group grows **10 → 11 subcommands**.
- **Direct dispatch of general workers (two dialects)**: opencode = nested `task` tool; Claude Code = direct Handoff. In general mode any Agent can accept **directly dispatched** execution work.
- **New agent `openfeel-explorer` (read-only)**: dedicated "research / exploration" route — 4 read-only tools (Read / Glob / Grep / Bash); agent count **9 → 10**.
- **Observability**: `metrics.json` wired via `recordRun`; CLI logs carry `duration_ms` / `project` / `session_id`; op-level timestamps; cross-session resume marker (`resumed`).
- **Review tiers (`--review-tier <full|lean|skip>`)**: an axis **orthogonal** to workflow mode — the mode picks the base table, the tier prunes review gates (`full` prunes nothing / `lean` prunes `scheme_review` / `skip` prunes `plan_review + scheme_review`; code review, test and archiving gates are always kept). Defaults derive from the mode (`full`→`full` / `fast`→`lean` / `general`→`full`). `flow phases --json` appends `reviewTier` last (existing 6 keys unchanged verbatim, **7 keys total**).
- **Parallel orchestration contract + lightweight archiving**.
- **Unified model defaults + non-destructive deployment (user-sovereign `model` key)**: deployment (`setup` / `update`) **creates the user's `model` key when absent and never overwrites it**.

### Bug Fixes (v1.2.1)

- **`req/BUG-002`**: the **completion path for `general` requirements** — a `general` requirement always has zero linked stages (bidirectional carrier gate) while the done gate demands all linked stages done; the two crossed and left `general` requirements **permanently unable to reach `done`**. A **dual completion path** is now provided (criterion = the requirement's own `workflow_mode` field, same source as the carrier gate), so `req advance --to done` / `req set --status done` **succeed** for stage-less `general` requirements; the single-source rule for non-`general` requirements is unchanged; done-gate rejections use dedicated copy.
- **`cli/BUG-011`**: tier pruning left a stage **with no transition targets when sitting exactly on a pruned phase**. Pruning now **applies to incoming edges / targets only**, so pruned phases keep their outgoing edges; **entering** a pruned gate remains unreachable.
- **`templates/BUG-007`**: the en archiver pointer dangled → switched to the Chinese section name, plus a "named § pointer literal hit" assertion to prevent recurrence.

## What's New in v1.2.0

- **flow.json version-shard archiving (`flow archive`)**: three entry points — `openfeel flow archive <version>` (perform archiving; gate = all stages of that version are done and no blocking open REV; **no `--force`**), `openfeel flow archive list`, `openfeel flow archive show <version> [--json]`; archives land at `.openfeel/flow-archive/{version}.json`. **Distinct from the top-level `openfeel archive <stage>` (stage-summary archiving)**; regular commands do not read archives.
- **Requirement flow (`openfeel req`)**: 10 subcommands (11 since v1.2.1, +`split`) (add / list / show / claim / release / set / link / advance / board / next) + 7 statuses (`draft` / `scheduled` / `in_progress` / `done` / `blocked` / `cancelled` / `rejected`); requirement progress is aggregated from linked stage phases (**auto-closes once all linked stages are done**); claim protocol = `owner` + `claimed_at` (no TTL). Authoritative usage source: the `openfeel-req` skill.
- **Compatibility**: legacy flow.json (without `requirements` / `archived_versions`) raises no errors; upgrading **requires no migration**.

## What's New in v1.1.2

- **Self-description**: `flow phases [--json]` lists all valid phases and the transition table (6 top-level JSON keys: `schemaVersion` / `phases` / `transitions` / `advanceAccepted` / `transitionsDiff` / `workflowMode` (added in v1.1.7; existing five keys unchanged verbatim); **7 keys since v1.2.1**, appending `reviewTier` last).
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
| `openfeel update` | Incrementally deploy platform adapter to existing projects; `--tools <list>` explicitly enables the Claude Code adapter |
| `openfeel flow` | Pipeline state management (status / phases / overview / current / advance / attempt / ops list / health [--fix] / checkpoint / migrate; status·current·health·metrics·overview support --json) |
| `openfeel roadmap` | Version roadmap management (create / show) |
| `openfeel plan` | Stage and scheme management (stage add/list [--deps/--tasks], scheme create [--draft] / publish / rename / remove / list) |
| `openfeel lint` | Quality gate checks (i18n key symmetry / kb stale references; **non-zero exit on findings**, no escape hatch) |
| `openfeel config` | Configuration management (get / set[**all `defaults.*`**] / effective / get-lang / list-projects, supports --global) |
| `openfeel knowledge` | Knowledge base management (list / add / search / index / dedup) |
| `openfeel archive <stage>` | Stage archiving with knowledge extraction (**stage-summary archiving** — distinct from `flow archive` version-shard archiving) |
| `openfeel flow archive` | flow.json version-shard archiving (`<version>` / `list` / `show`; distinct from `openfeel archive` stage-summary archiving) |
| `openfeel req` | Requirement flow (add / list / show / claim / release / set / link / advance / board / next) |
| `openfeel setup` | Global-only deployment (global AGENTS.md + agents + skills + adapter config); no project `.openfeel/`; `--tools <list>` explicitly enables the Claude Code adapter |
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
npm test           # Run tests (1894 cases / 74 test files; Linux CI skips 1 Windows-only case)
```

## Acknowledgments

This project is based on [AI_Prompt](https://github.com/Liuary/AI_Prompt) and draws inspiration from tools like [OpenSpec](https://github.com/Fission-AI/OpenSpec).

## License

[MIT](LICENSE)
