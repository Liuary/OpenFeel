# OpenFeel Global Behavioral Constraints

> This document is the global constraint layer of the OpenFeel framework, deployed by `openfeel setup` to the **current harness's global rules location** (opencode adapter: `~/.config/opencode/AGENTS.md`), applicable uniformly across all OpenFeel projects.

Behavioral constraints and coding conventions for AI Agents. This document is a permanent constraint that applies to all AI Agent sessions within OpenFeel projects.

## Code of Conduct

You should think in English. At the start of a session, organize your analysis into concise information and output it in English.

## Task Type Routing

Not all tasks must go through the full pipeline. Non-coding tasks and coding tasks are both first-class citizens; choose the path based on task type:

| Task Type | Handling Path | Notes |
|-----------|---------------|-------|
| Research/exploration (reading code, consulting references, locating issues) | Feel → research (general / explore Agent) | Read-only exploration, no source code changes; flow.json need not spin up for this |
| Coding implementation (adding/modifying source code) | Full pipeline (openfeel-planner → openfeel-schemer → openfeel-executor → openfeel-reviewer → openfeel-feel-tester) | Involves source changes, must go through the full audit chain |
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

3. **Feel orchestration constraint**: Feel, as the overall commander, uniformly orchestrates downstream Agents (openfeel-planner / openfeel-schemer / openfeel-executor / openfeel-reviewer / openfeel-feel-tester / openfeel-utility Agent / openfeel-vision / openfeel-archiver), advancing serially via the `task` tool according to pipeline phases (plan → scheme → execute → review → test → archive). Each Agent operates only within its own responsibility boundary and must not start other Agents beyond its scope or modify flow.json state on its own.

4. **Lightweight decision boundary**: Conversational selections (Feel and the user settle a technical direction or design trade-off via the `question` tool, producing a conclusion but no plan.md) are handled by Feel directly, without delegating to openfeel-planner; only when a **formal plan document** (plan.md, including stage division, task table, constraint table) is needed, or the planning scale threshold is reached, should openfeel-planner be delegated. Avoid the extremes of "handle everything personally" or "delegate everything".

Deviating from the above constraints is considered a violation and will be flagged during review.

### 9-Agent System Overview

| Agent | Role | Driving Model | Invocation |
|-------|------|---------------|------------|
| Feel | Overall Commander | Flagship reasoning model | primary |
| openfeel-planner | Planning Officer | Reasoning model | subagent |
| openfeel-schemer | Scheme Officer | Flagship reasoning model | subagent |
| openfeel-executor | Execution Officer | Fast model (Flash) | subagent |
| openfeel-reviewer | Review Officer | Heterogeneous reasoning model (GLM) | subagent |
| openfeel-feel-tester | Testing Officer | Reasoning model | subagent |
| openfeel-utility Agent | Utility Officer | Fast model (Flash) | subagent |
| openfeel-vision | Vision Officer | Multimodal model (deepseek-flash) | subagent |
| openfeel-archiver | Archiving Officer | Reasoning model | subagent |

> **Write constraint**: openfeel-planner and openfeel-archiver must operate on flow.json indirectly through Feel, and must not directly `edit` or `write` flow.json.

## Permission Model (Agent permission)

Each of the 9 agents inlines a `permission:` allowlist (including `external_directory: "allow"`), deployed by `openfeel setup` to the **global agents directory** (opencode adapter: `~/.config/opencode/agents/*.md`).

- **Merge semantics (deep merge per permission key; agent wins)**: the agent `.md` frontmatter `permission` and the project/global `opencode.jsonc` `permission` / `agent.<name>.permission` are **deep-merged per permission key**; **for a key declared in the agent `.md`, the `.md` value wins (config files cannot override it)**, and only keys absent from the agent `.md` take effect from config.
- **`external_directory`**: the framework inlines `"allow"` → the agent's effective value is `allow` (no prompt outside the workspace); the **opencode platform default is `ask`**, so adding the key is a behavior change (ask→allow; verified in an isolated environment on opencode 1.18.33).
- **Project-level tightening (the only entry)**: create `.opencode/agent/<name>.md` at the project root to override the same-named agent and rewrite the full `permission` block; **`agent.<name>.permission` in `opencode.jsonc` cannot tighten a declared key (mirroring every key does not help either)**. See `.openfeel/manual/core/permission.md`.
- **Do not hand-edit the global agent file frontmatter**: `openfeel update` overwrites same-named frontmatter fields (shallow merge; the nested `permission` object is replaced wholesale, see `src/core/managed-region.ts`); put custom content outside the managed region (`<!-- openfeel:begin/end -->`).
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
The OpenFeel framework has released the official v1.0.x (currently v1.1.2). After deploying the global constraints via openfeel setup, new projects set their own starting version number as needed.

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

> This section describes the structural semantics and rule constraints of the `.openfeel/` workspace. Operational details (which directories to `mkdir`, which empty files to create at session startup, etc.) have been split into on-demand skills: `openfeel-workspace` (session startup self-check) and `openfeel-tool-usage` (tool usage conventions); pipeline operations are in the `openfeel-wizard` / `openfeel-health` skills, and process rules are dynamically injected by the OpenFeel CLI tool.

At the start of each session, check the .openfeel directory under the project path and its contents. This directory is the single source of truth for ensuring development consistency, and you must maintain its integrity and accuracy.

> **Two design goals (the axioms behind every format rule)**:
> ① **Preserve the core information needed for recovery** — at any moment, opening an index (`dev/current.md` / `users/{username}/dev_last.md`) restores enough context to continue working within a limited context budget.
> ② **Avoid polluting the context with irrelevant information** — the index layer holds only "conclusions and locations"; details sink into topic files / `tmp/` documents; the index does not carry process details.
>
> **Layering principle**:
>
> | Layer | Carrier | Granularity limit | Reader |
> |-------|---------|-------------------|--------|
> | Index layer | `.openfeel/dev/current.md`, `.openfeel/users/{username}/dev_last.md` | Hard cap on entries + characters | User / session startup |
> | Topic layer | `.openfeel/users/{username}/dev_last/{english-name}.md` | ≤10 entries, ≤300 chars each | On-demand |
> | Detail layer | `.openfeel/users/{username}/tmp/` documents | Unlimited (record the **path** only) | Read only when explicitly specified |

### Design Principles

**Layering principle**: index layer (`dev/current.md` / `users/{username}/dev_last.md`) → topic layer (`users/{username}/dev_last/{english-name}.md`) → detail layer (`users/{username}/tmp/` documents). See the introduction above for the three-layer division of labor.

The .openfeel directory is divided into **Public Domain** and **Private Domain**:

- Public Domain: directly under `.openfeel/`, stores project-level shared content (core rules, plans, team logs, knowledge base, etc.), included in version control.
- Private Domain: under `.openfeel/users/{username}/`, stores personal operation status, logs, notes, code reviews, Bug tracking, etc., added to `.gitignore` and not included in version control.

All users (including single-person projects) follow this structure.

### User Identity

> .openfeel/.info.json

```json
{ "user": "username" }
```

At the start of each session, the Agent first reads this file to get the current username. If the file does not exist or `user` is empty, automatically execute `git config user.name` to get the Git username and write it. If there is no Git configuration, use a default username. This file is added to `.gitignore` and excluded from version control.

#### Path Self-Check

Large models may inadvertently truncate or modify the username when constructing `.openfeel/users/{username}/` paths (e.g., `Alice` → `Alic`), causing file read/write failures. When accessing any file under `.openfeel/users/{username}/`, the following self-check rules must be followed:

1. **Immediate check on access failure**: When `read` or `glob` returns "file not found" or "no such file", do not report an error directly. First execute `read .openfeel/.info.json` to re-acquire the correct `username`.
2. **Compare and correct**: Compare the currently used `username` with the value in `.openfeel/.info.json` character by character. If inconsistent, reconstruct the full path with the correct value and retry.
3. **Escalate on consecutive failures**: If the retry still fails, report to the user that "Path `{failed path}` does not exist. Confirmed username is `{correct username}`", and wait for user confirmation before proceeding.

This rule applies to all Agents (Feel / openfeel-planner / openfeel-schemer / openfeel-executor / openfeel-reviewer / openfeel-feel-tester / openfeel-vision / openfeel-archiver).

---

### Public Domain

#### Development Directory

> .openfeel/dev

Stores project-shared core rules and progress status.

> .openfeel/dev/dev_core.md

Stores long-term valid rules. Priority: user instructions > this document > session temporary hints. Each rule is prefixed with `[+]` (enabled) / `[-]` (disabled). Rules can only be marked as disabled, not deleted. When more than 10 rules are disabled, remind the user to clean up.

> .openfeel/dev/current.md

**Team file (user-level view)**: records **cross-user operations** and **overall information**.
- **Update only on personal submission** (one submission = one record);
- Write **overall information** only (what was done, current state); **no** agent details; **no** `## @member` sections (itemized logs go to `dev_last` topic files);
- Keep only the **latest 5** records (newest first);
- When a new record pushes the count > 5: move the **oldest** one out to `.openfeel/dev/current_archive/` (archived, **never deleted**; public domain, tracked in version control);
- Archive filename `current-{yyyy-mm-dd}-{NNN}.md` (NNN increments within the same day).

```markdown
# Current Progress

> {one-line overall progress} (overall information, user-level view)

## Recent Submissions (max 5, newest first)

- **{yyyy-mm-dd HH:MM}** @{username}: {overall information: what was done, current state (no agent details, no itemized log)}
- **{yyyy-mm-dd HH:MM}** @{username}: {...}

> Earlier records: see `.openfeel/dev/current_archive/` (each submission auto-archives the oldest; this file keeps only the latest 5).
```

> **Note on `@{username}` (A5)**: keep the inline `@{username}` in records (identifies the submitter in cross-user scenarios; this is **not** an "@member section" — an inline identifier is not a section). If the user asks to remove it, simply delete the inline identifier (the rest of the rules are unaffected).

> .openfeel/dev/current_archive/

Archives old records rotated out of `current.md`. **Public domain → tracked in version control** (`.gitignore` only ignores `users/` and `tmp/`).
Naming convention: `current-{yyyy-mm-dd}-{NNN}.md`; content = the moved-out record line + a `>` meta line (original date, move-out time). Archives are **append-only**.

> .openfeel/dev/note/dev_note.md

Team-shared development notes, sourced from member personal notes (see Private Domain > Personal Notes). Brief descriptions only; details go into sub-files with an index.

#### Log Directory

> .openfeel/log

Public log directory, **only records team-level important events** (records when any of the following conditions are met):
- Creation or important modification of public domain files
- Cross-member collaboration key operations (public note submission, plan adjustments, etc.)
- Plan milestone achievements or major deviations
- Severe issues in private code reviews or Bugs (high priority, report details on first discovery)
- Anomalous events affecting multiple people

Daily operations (routine code modifications, personal plan advancement, debugging, personal notes) are recorded in the private log.

Logs are organized by year/month/day hierarchy. Day directories are only created when important events occur on that day. File naming: `yyyy-mm-dd-{username}-NNN.md`, day directories contain `day_index.md`. The root maintains `index.md` (date index) and `log.md` (last 30 summary entries, format `[filename] {username}: description`, with jump links).

#### Code Review Directory

> .openfeel/code_review

Public code review directory, storing core conclusion summaries after private reviews are completed. Included in version control for team reference.

Organized by plan stage, corresponding to the private review directory. The root maintains `index.md` (grouped by stage, with status count statistics at the top). Each stage's insights and suggestions are summarized in `{stage}.md`. The specific review process and detailed content for each submission point are stored in the private `code_review/REV-{stage}.md`.

#### Bug Tracking Directory

> .openfeel/bugs

Public Bug tracking directory, storing core conclusion summaries after private Bugs are closed. Included in version control for team reference.

Organized by module, corresponding to the private Bug directory. The root maintains `index.md` (grouped by module). Each module's Bug resolution insights and root cause analysis are archived in `{module}.md`. Specific Bug reports, reproduction steps, and acceptance details are stored in the private `bugs/{module}/`.

#### Plan Directory

> .openfeel/plan

**Automated planning**: When the user proposes a task with the following characteristics, the Agent should proactively update `plan.md`; **only update `current.md` when the change is a cross-user overall progress item**, without waiting for manual user trigger:
- Involves multi-step operations
- Requires cross-session progress tracking
- May affect multiple modules or files

Plans are divided into two layers:
- **Large plan** (`plan.md`): Overall goals, technical architecture, core milestones. Changes require team communication and confirmation.
- **Small plans** (`{stage}/` subdirectories): Specific task breakdown and implementation steps. Daily modifications and progress happen at this layer.

If a plan does not exist, create it based on user instructions. Large plan changes require user confirmation; small plan adjustments can be done autonomously by the Agent but must be recorded.

Plan indexes are organized by major version series: `plan/index.md` is the top-level index, and series indexes such as `plan/v4/index.md` and `plan/v5/index.md` store core summaries of each plan. `plan_log.md` records the last 30 change summaries, format `{username}: change description`, with jump links.

If unplanned operations or deviations occur, explain to the user first and seek confirmation, while recording in the log.

> Each stage's state is jointly managed by `flow.json` and `status.md`; pipeline advancement (`openfeel flow` / `openfeel stage` / phase enumeration) rules are dynamically injected by the OpenFeel CLI tool, see the `openfeel-wizard` / `openfeel-health` skill.

#### Temporary Directory

> .openfeel/tmp

Stores project-level temporary files (shared data, build artifacts, etc.). Only reads files from this directory when specified by the user.

#### Knowledge Base

> .openfeel/kb

Records "what this project is like" and "what to do when problems arise", separated from the constraint system (which records "what to do").

```
.openfeel/kb/
├── index.md           # Main index: category overview, file summaries, recent updates
├── architecture.md    # Architecture decisions, design rationale, technology selection
├── patterns.md        # Code patterns, project conventions, best practices
├── troubleshooting.md # Common issues, debugging procedures, known pitfalls
└── setup.md           # Environment setup, build process, dependency management
```

There is no hard limit on the number of categories. `index.md` maintains clear summaries for Agents to quickly locate. The `[+]`/`[-]` marking rules for each category file are consistent with `dev_core.md`.

**Write conventions:**

| Type | Write Path |
|------|------------|
| Architecture decisions (e.g., OAuth2 + refresh token approach) | `architecture.md` |
| Code patterns (e.g., State machine using Switch + Enum) | `patterns.md` |
| Troubleshooting experience (e.g., Steps to handle build errors) | `troubleshooting.md` |
| Environment configuration (e.g., Special compilation flow) | `setup.md` |
| Project analysis reports (test retrospectives, process analysis, issue summaries) | Project root `docs/phase-{N}/` |
| Understanding of the system (same directory as analysis reports) | Project root `docs/phase-{N}/` |

Prohibited from writing to the knowledge base: behavioral constraints, operating procedures (→ global AGENTS.md), workspace maintenance rules (→ dev_core.md). After each write, record in the public log.

> The knowledge base "Automatic Writing Mechanism" process (experience staging → user confirmation → write to kb → update index) is in the `openfeel-check-kb` skill.

---

### Private Domain

> .openfeel/users/{username}/

The private domain directory. Each time the Agent obtains the current username from `.openfeel/.info.json` to determine the corresponding path. After code modifications, synchronously update related files in the private domain (plans, logs, notes, etc.) to maintain consistency with the actual state.

#### Personal Operation Status

> .openfeel/users/{username}/dev_last.md

Records the brief state at the end of the last operation, overwritten at the end of each conversation. At the next startup, read it first to restore context. If the content contradicts the current conversation, mark it as "may be outdated" and confirm with the user.

**Template**:
```markdown
# Last Operation Status
- Time: yyyy-mm-dd HH:MM
- Stage: {current plan stage}
- Operation: {one-sentence description}
- Files: {key files added or modified}
- Current State: {stage progress, e.g., 3/7 tasks completed}

## User Preferences
- Language: {lang}
- Auto Advance: {auto_advance}
- Review Mode: {review_mode}
- Communication: {communication}
- Confirm Threshold: {confirm_threshold}

## Context Snapshot
- Current Pipeline Phase: {phase}
- Active Stages: {active_stages}
- Last Operation Summary: {one sentence}

## Pending Items
- [ ] {unfinished tasks}
- [ ] {blockers}

## Key Decisions
- {important architecture or design decisions from this session}

## Decision History
(New decisions from this session are appended here in the format `- [x] {date}: {decision description}`)

## Experience Staging
- [ ] `architecture`: {architecture decisions pending archiving}
- [ ] `patterns`: {code patterns pending archiving}
- [ ] `troubleshooting`: {troubleshooting experience pending archiving}
- [ ] `setup`: {environment configuration pending archiving}
```

This template ensures that cross-session context is restored to a level sufficient to execute the next task, while also supporting the experience staging function that underpins the automatic knowledge base writing mechanism. **Write instructions**: Feel fills the "User Preferences" section from `readProfile()` global preferences at startup; appends technical/architecture decisions to "Decision History" during the session; updates the "Context Snapshot" section every time it writes dev_last.md.

#### Personal Notes

> .openfeel/users/{username}/note/

The **primary location** for lessons learned. Brief descriptions; details go into sub-files with an index. In each conversation, the Agent may randomly remind the user whether to submit to the public note `dev/note/dev_note.md`. After submission, annotate "Submitted to public domain" with a jump link.

#### Personal Logs

> .openfeel/users/{username}/log/

The **primary location** for daily operations. Structure consistent with the public log directory. File naming format: `yyyy-mm-dd-NNN.md` (no username needed, as it is already under the user's directory).

#### Code Review

> .openfeel/users/{username}/code_review/

Manages code review issues during the development stage (architecture, conventions, logic), organized by plan stage. Separated from Bug tracking.

**Role division:**
- **openfeel-reviewer**: Reviews code according to the plan stage, submits issues, verifies fix results.
- **openfeel-executor**: Handles review issues, modifies code and updates status.

Review issues for each plan stage are consolidated in `REV-{plan_stage}.md`. Entry template:

```markdown
## REV-{NO}: {Brief Title}
- **Status**: pending | fixing | resolved | closed
- **Priority**: high | medium | low
- **Author**: openfeel-reviewer
- **Created**: yyyy-mm-dd HH:MM

### Issue Description
...

### Processing Record
| Time | Operator | Description | Commit |
|------|----------|-------------|--------|

### Acceptance Record
| Time | openfeel-reviewer | Conclusion | Notes |
|------|----------|------------|-------|
```

The root maintains `index.md` (grouped by stage, with status count statistics at the top) and `log.md` (last 30 review change summaries).

When a review issue is marked as `pending` with `high` priority, the issue details (title, description, impact scope) must be written to the public log to ensure timely team visibility. When an item is `closed`, the core conclusion is written to `.openfeel/code_review/{stage}.md`, and briefly recorded in the public log.

#### Bug Tracking

> .openfeel/users/{username}/bugs/

Manages defects found during the testing phase, organized by module. Separated from code review.

**Role division:**
- **openfeel-feel-tester**: Submits Bugs and performs final acceptance.
- **openfeel-executor**: Fixes Bugs by module. On session start, uses `load skill openfeel-get-bugs` to get pending Bugs for the responsible module.

Bugs are organized in module subdirectories. Bug naming in each module directory: `BUG-{NNN}_{brief_title}.md` (NNN increments within the module):

```
.openfeel/users/{username}/bugs/
├── index.md              # Grouped by module (### {module_name} @{responsible_Agent_name})
├── log.md                # Last 30 change summaries
├── {module_a}/
│   ├── BUG-001_title.md
│   └── BUG-002_title.md
└── {module_b}/
    └── BUG-001_title.md
```

When a Bug is marked as `open` with `high` priority, the defect details (title, description, reproduction steps, affected modules) must be written to the public log to ensure timely team visibility. When an item is `closed`, the core conclusion is written to `.openfeel/bugs/{module}.md`, and briefly recorded in the public log.

#### Review/Bug Lifecycle

Both share the same state flow model (only the starting state name differs):

```
pending/open  ──→  fixing  ──→  resolved  ──→  closed
      ↑                         │
      └─────── 验收不通过 / review failed ───────┘
```

| State | Code Review | Bug Tracking | Operator |
|-------|------------|-------------|----------|
| Start | `pending` | `open` | Submitted by openfeel-reviewer / openfeel-feel-tester |
| Fixing | `fixing` | `fixing` | Assigned to openfeel-executor |
| Ready for acceptance | `resolved` | `resolved` | Completed by openfeel-executor |
| Closed | `closed` | `closed` | Accepted by openfeel-reviewer / openfeel-feel-tester |

#### Personal Temporary Directory

> .openfeel/users/{username}/tmp/

Stores temporary files for the current user, fully isolated from other users.
