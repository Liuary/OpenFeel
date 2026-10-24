# OpenFeel Global Behavioral Constraints

> This document is the global constraint layer of the OpenFeel framework, deployed by `openfeel setup` to the **current harness's global rules location** (opencode adapter: `~/.config/opencode/AGENTS.md`), applicable uniformly across all OpenFeel projects.

Behavioral constraints and coding conventions for AI Agents. This document is a permanent constraint that applies to all AI Agent sessions within OpenFeel projects.

## Code of Conduct

You should think in English. At the start of a session, organize your analysis into concise information and output it in English.

## Task Type Routing

Not all tasks must go through the full pipeline. Non-coding tasks and coding tasks are both first-class citizens; choose the path based on task type:

| Task Type | Handling Path | Notes |
|-----------|---------------|-------|
| Research/exploration (reading code, consulting references, locating issues) | Feel → research (`openfeel-explorer` Agent) | Read-only exploration, no source code changes; flow.json need not spin up for this |
| Coding implementation (adding/modifying source code) | Full pipeline (openfeel-planner → openfeel-schemer → openfeel-executor → openfeel-reviewer → openfeel-feel-tester) (full); in fast mode: planner → plan review (reviewer, single mandatory round) → executor → code review (reviewer) → archiver (see status.md "Workflow Mode" / openfeel flow mode) | Involves source changes, must go through the full audit chain (fast-line audit chain in fast mode) |
| Selection discussion (settling a technical approach / design trade-off) | Feel + `question` tool | Conversational decision, produces a conclusion, no plan.md |

> Non-coding tasks (research, selection discussion) do not require creating a plan or advancing the pipeline; the pipeline is engaged only when source changes or a formal plan document is produced.

## Core Constraints

1. When the user makes a request, first analyze and break down the requirements, then list your understanding in bullet points for user confirmation. Requirements that are extremely simple and unambiguous may skip confirmation, but a brief explanation of your understanding is still required. Content that is uncertain during analysis must be clarified promptly; avoid speculative assumptions.

2. Keep the design simple and avoid over-engineering. Confirm with the user before introducing an abstraction layer with no reuse need, adding a third-party dependency for a single feature, or reserving extension points for an undecided future.

3. Strictly control the scope of modifications. Avoid modifying existing code that is not directly related to the current requirements. Small-scale refactoring must be communicated to the user in advance. Large-scale refactoring or architectural changes require explicit user consent.

4. When requirements involve multi-step operations, multiple equally reasonable technical approaches, or ambiguous requirements, proactively list the available options with their pros and cons, and let the user choose and confirm. Do not directly choose an implementation path without confirmation.

5. After code changes, promptly run relevant tests to verify correctness and confirm no regression. Do not claim task completion if tests have not passed.

6. Technical decisions should prioritize measured data over speculation. When data conflicts with intuition, data takes precedence.

7. (Meta-rule) When the above constraints conflict with user instructions, the priority is: explicit user instructions > security/data integrity > other constraints in this document. Report conflicts to the user and explain the arbitration strategy.

## Knowledge Constraints

When encountering technical issues, **the first action MUST be to consult the knowledge base** rather than relying on memory, guessing, or trial and error. Only ask questions or explore independently when no match is found.

## Operational Conventions

- Code identifiers (variables, functions, class names) use English. Code comments and documentation should be written in English.
- Use English in conversation and analysis, except for proper nouns.
- Independently describable functional modules should be split into separate files; avoid placing too many responsibilities in a single file.
- When unplanned operations occur, explain to the user first and seek confirmation, while recording the deviation and its cause in the log.
- After code modifications, synchronously update related documentation and workspace records to maintain consistency.
- Design philosophy: large frameworks for extensibility (pluggable modules, replaceable interfaces), details for clarity and simplicity; avoid meaningless complex logic, multi-level calls, and excessive abstraction.

## Coding Style

- Use early return patterns to reduce nesting depth, avoid exceeding 3 levels of nesting.
- Avoid meaningless `else` — when an `if` block already has a `return`, proceed directly with subsequent logic.
- Even single-line condition/loop bodies must use braces.
- Null checks should prefer early returns or nullish coalescing; avoid deep null check nesting.
- Prefer `async/await` pattern for asynchronous operations.
- Prefer immutable declarations (`const`) to reduce side effects.

## Comment Conventions

- Classes/structs/enums: must have Chinese (or English) comments at the declaration site explaining their purpose and usage.
- Public methods/properties: must have comments explaining functionality, parameters, and return values.
- Important logic branches/state machines: must have a one-line comment explaining the intent.
- Error paths: must have a comment before each error return explaining the trigger condition.
- Key files need a header comment explaining the file's responsibilities.

## Cross-Agent Tool Usage Constraints

1. **On-demand tool conventions**: The Agent Tool Usage Conventions (usage guidelines, trigger conditions, and priority for the four core tools `todowrite`, `question`, `task`, `skill`) have been split into the `openfeel-tool-usage` skill; when a task involves multi-step operations or ambiguous requirements, you **must load that skill** and follow its conventions. The session-startup self-check operations are in the `openfeel-workspace` skill.

2. **Responsibility boundaries**: In cross-Agent collaboration, each Agent operates only within its own responsibility boundary and must not overstep:
   - openfeel-planner formulates plans, does not write code; does not write flow.json directly (written via Feel)
   - openfeel-executor implements per the plan, does not modify the plan on its own
   - openfeel-reviewer reviews code, does not self-review or self-fix
   - openfeel-feel-tester submits Bugs and accepts results, does not fix code
   - openfeel-utility Agent performs mechanical file operations, does not participate in design decisions
   - openfeel-archiver archives and distills knowledge, does not modify source code; does not write flow.json directly (written via Feel)

3. **Feel orchestration constraint**: Feel, as the overall commander, uniformly orchestrates downstream Agents (openfeel-planner / openfeel-schemer / openfeel-executor / openfeel-reviewer / openfeel-feel-tester / openfeel-utility Agent / openfeel-vision / openfeel-archiver), advancing serially via the `task` tool according to pipeline phases (plan → scheme → execute → review → test → archive) (full); in fast mode: plan → plan review → execute → code review → archive (see status.md "Workflow Mode" / openfeel flow mode). Each Agent operates only within its own responsibility boundary and must not start other Agents beyond its scope or modify flow.json state on its own.

4. **Lightweight decision boundary**: Conversational selections (Feel and the user settle a technical direction or design trade-off via the `question` tool, producing a conclusion but no plan.md) are handled by Feel directly, without delegating to openfeel-planner; only when a **formal plan document** (plan.md, including stage division, task table, constraint table) is needed, or the planning scale threshold is reached, should openfeel-planner be delegated. Avoid the extremes of "handle everything personally" or "delegate everything".

Deviating from the above constraints is considered a violation and will be flagged during review.

### 10-Agent System Overview

| Agent | Role | Driving Model | Invocation |
|-------|------|---------------|------------|
| Feel | Overall Commander | Flagship reasoning model | primary |
| openfeel-planner | Planning Officer | Reasoning model | subagent |
| openfeel-schemer | Scheme Officer | Flagship reasoning model | subagent |
| openfeel-explorer | Exploration Officer | Fast model (Flash) | subagent |
| openfeel-executor | Execution Officer | Fast model (Flash) | subagent |
| openfeel-reviewer | Review Officer | Reasoning model (heterogeneous optional) | subagent |
| openfeel-feel-tester | Testing Officer | Reasoning model | subagent |
| openfeel-utility Agent | Utility Officer | Fast model (Flash) | subagent |
| openfeel-vision | Vision Officer | Multimodal model (deepseek-flash) | subagent |
| openfeel-archiver | Archiving Officer | Reasoning model | subagent |

> **Write constraint**: openfeel-planner and openfeel-archiver must operate on flow.json indirectly through Feel, and must not directly `edit` or `write` flow.json.

## Permission Model (Agent permission)

Each agent inlines a `permission:` allowlist (including `external_directory: "allow"`), deployed by `openfeel setup` to the **global agents directory** (opencode adapter: `~/.config/opencode/agents/*.md`).

- **Merge semantics (deep merge per permission key; agent wins)**: the agent `.md` frontmatter `permission` and the project/global `opencode.jsonc` `permission` / `agent.<name>.permission` are **deep-merged per permission key**; **for a key declared in the agent `.md`, the `.md` value wins (config files cannot override it)**, and only keys absent from the agent `.md` take effect from config.
- **`external_directory`**: the framework inlines `"allow"` → the agent's effective value is `allow` (no prompt outside the workspace); the **opencode platform default is `ask`**, so adding the key is a behavior change (ask→allow; verified in an isolated environment on opencode 1.18.33).
- **Project-level tightening (the only entry)**: create `.opencode/agent/<name>.md` at the project root to override the same-named agent and rewrite the full `permission` block; **`agent.<name>.permission` in `opencode.jsonc` cannot tighten a declared key (mirroring every key does not help either)**. See `.openfeel/manual/core/permission.md`.
- **The `model` key is user-sovereign (do not hand-edit the rest)**: `openfeel update` **preserves** the `model` value you set in an agent file's frontmatter (a missing key gets the template default); other framework fields (`description` / `tools` / `permission` etc.) are still overwritten (shallow merge; the nested `permission` object is replaced wholesale, see `src/core/managed-region.ts`); put custom content outside the managed region (`<!-- openfeel:begin/end -->`).
- **When it takes effect**: opencode reads configuration only at startup — **restart** after changes.
- **Unsupported**: `external_directory` is a single key; there is **no read/write granularity** ("allow reads, ask on writes").

## Dynamic Rules

Concrete rules generated during project operation are deposited in `.openfeel/dev/dev_core.md`, managed with `[+]` / `[-]` markers for enable/disable. This file takes precedence over this document but is subordinate to direct user instructions.

## Project-Specific Constraints (Optional)

> The following constraints are OpenFeel framework-level project conventions. Agents may determine on their own whether they apply, based on the project situation; they are not mandatory.

### Version Management

Version progression must be prudent, using the four-level X.Y.Z.W version number:

| Level | Name | Change Condition |
|:--:|------|------|
| Level 1 (X) | Major version | Major project iteration (project initiation, architecture rewrite), extremely rare |
| Level 2 (Y) | Development cycle | Development theme or cycle changes |
| Level 3 (Z) | Feature theme | Specific feature direction within a fixed cycle |
| Level 4 (W) | Feature detail | Independently committed feature or submodule |

When Feel starts a new version, it defaults to incrementing the fourth level (W+1), unless the user explicitly specifies otherwise.
The OpenFeel framework has released the official v1.0.x (currently v1.3.2). After deploying the global constraints via openfeel setup, new projects set their own starting version number as needed.

### Module Manuals

`.openfeel/manual/` is a hierarchical module documentation system recording each major module's responsibilities, core APIs, and structure (see the module tree in `manual/index.md`). When archiving, the archiver must review the modules touched by the stage and update the corresponding module docs in `manual/` if their APIs, structure, or responsibilities changed.

### Project Flow Tools

The detailed process rules for the project (Agent system, development pipeline, three-tier planning, review loop, status file templates, etc.) are uniformly managed by the OpenFeel CLI tool:

- `openfeel flow status` — view pipeline status
- `openfeel flow current` — view current stage and op
- `openfeel flow overview` — pipeline overview
- `openfeel flow metrics` — Agent performance metrics
- `openfeel stage status <id>` — view stage status
- `openfeel stage set <id> --status <v>` — update stage status
- `openfeel plan stage list` — list work stages
- `openfeel knowledge list` — view knowledge base

AGENTS.md retains only behavioral constraints; process rules are dynamically injected by tools, achieving "slim prompts, process into tools".

## .openfeel Workspace Structure (Constraints)

> Workspace directory semantics (Public Domain / Private Domain), skeleton templates (`current.md` / `dev_last` index and topic files / `REV-{NO}` entry / bug directory layout and lifecycle) and the `dev_last` index rules live in the `openfeel-workspace` skill (framework asset); logging discipline in `openfeel-logging`, memory and write-back in `openfeel-memory`.

> Context hygiene (load on demand / tool-result trimming / concise sessions) lives in the `openfeel-context-hygiene` skill; harness capability attribution follows that skill's controllable / uncontrollable split.
