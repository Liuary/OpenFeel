# OpenFeel — AI Agent Development Process Governance CLI

[中文](README.zh-CN.md) | [Changelog](CHANGELOG.md) | [Getting Started](docs/GETTING_STARTED.md)

OpenFeel is a TypeScript CLI tool for end-to-end process governance in AI Agent development. Core philosophy: **"Slim prompts, process in tools"** — agents understand workflows by reading `flow.json` state, not long text documents.

> **Supported Platform**: Currently only [opencode](https://opencode.ai).  
> **Default Model Config**: DeepSeek V4 (primary reasoning) + GLM-5.1 (cross-review) + Alibaba-CN qwen3-vl-plus (multimodal vision).  
> `openfeel init` auto-detects registered models and guides configuration.

## What Problem Does It Solve

Common pain points in AI Agent project development:
- **Chaotic process**: Agent scheduling relies on ad-hoc coordination without a unified mechanism
- **Untrackable state**: Unclear who is doing what, progress, or blockers
- **Scattered outputs**: Plans, code, reviews, and tests spread across places without a single entry point
- **Lost experience**: Knowledge vanishes after each session, starting from scratch every time

OpenFeel provides automated pipeline governance — agents obtain current state and next instructions from `flow.json` rather than reading lengthy documents.

## Installation

```bash
npm install -g openfeel
```

Requires: Node.js ≥ 20

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

## Command Reference

| Command | Purpose |
|---------|---------|
| `openfeel init [path]` | Initialize project workspace |
| `openfeel flow` | Pipeline state management (status / current / advance / overview) |
| `openfeel roadmap` | Version roadmap management (create / show) |
| `openfeel plan` | Stage and scheme management (stage add/list, scheme create/list) |
| `openfeel lint` | Quality gate checks (i18n key symmetry / kb stale references) |
| `openfeel config` | Configuration management (get / set / list, supports --global) |
| `openfeel knowledge` | Knowledge base management (list / search) |
| `openfeel archive <stage>` | Stage archiving with knowledge extraction |
| `openfeel update` | Update Agent definitions and Skill files |

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

### Three-Tier Planning

```
Roadmap
  └── Stage
        └── Op（operation）— the finest execution unit
```

### flow.json — Pipeline State Core

`.openfeel/flow.json` is the single source of truth, recording all stages, operations, reviews, and logs. Agents read it for context and write back state after execution.

### /opfx: Skill Mapping

| Skill | Purpose |
|-------|---------|
| `/opfx:flow` | Pipeline status query & advancement |
| `/opfx:plan` | Plan formulation |
| `/opfx:scheme` | Scheme formulation |
| `/opfx:code` | Code execution |
| `/opfx:view` | Code review |
| `/opfx:test` | Test acceptance |
| `/opfx:archive` | Stage archiving |
| `/opfx:kb` | Knowledge base operations |

## Architecture

```
CLI Layer (Commander)
  ├── init / update
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
  └── workspace/ — Directory structure & knowledge base
```

## Development

```bash
npm install        # Install dependencies
npm run build      # Compile TypeScript
npm test           # Run tests (395 cases)
```

## License

[MIT](LICENSE)
