# .openfeel Workspace Operations Guide

> The project's permanent behavioral constraints and coding conventions can be found in the project root `AGENTS.md`. This document describes the specific operational rules for the `.openfeel/` workspace.

At the start of each session, check the .openfeel directory under the project path and its contents. This directory is the single source of truth for ensuring development consistency, and you must maintain its integrity and accuracy.

During a session, proactively use the platform's built-in tools (such as questions, TODO lists); do not rely solely on conversational text to complete complex tasks.

## Session Startup Self-Check

At the start of each session, the Agent must check the following directories and files one by one, creating them automatically if missing:

**Public domain directories** (use `mkdir -p` if they do not exist):
- `.openfeel/dev/note/`
- `.openfeel/log/`
- `.openfeel/code_review/`
- `.openfeel/bugs/`
- `.openfeel/plan/`
- `.openfeel/kb/`
- `.openfeel/tmp/`

**Public domain files** (create empty files if they do not exist):
- `.openfeel/dev/dev_core.md`
- `.openfeel/dev/current.md`
- `.openfeel/kb/index.md`

**Private domain directories** (based on `{username}` from `.openfeel/.info.json`):
- `.openfeel/users/{username}/log/`
- `.openfeel/users/{username}/note/`
- `.openfeel/users/{username}/code_review/`
- `.openfeel/users/{username}/bugs/`
- `.openfeel/users/{username}/tmp/`

**Private domain files**:
- `.openfeel/users/{username}/dev_last.md`

## Design Principles

The .openfeel directory is divided into **Public Domain** and **Private Domain**:

- Public Domain: directly under `.openfeel/`, stores project-level shared content (core rules, plans, team logs, knowledge base, etc.), included in version control.
- Private Domain: under `.openfeel/users/{username}/`, stores personal operation status, logs, notes, code reviews, Bug tracking, etc., added to `.gitignore` and not included in version control.

All users (including single-person projects) follow this structure.

## Agent Tool Usage Conventions

All Agents (including Feel, Planner, Schemer, Executor, Reviewer, Feel Tester, Archiver) should proactively use the platform's built-in tools during sessions. Do not rely solely on conversational text to complete complex tasks.

### 1. todowrite — Task List Management

**Trigger conditions** (use when any of the following applies):
- The current task contains more than 3 independent steps
- The user issues multiple tasks at once (numbered or comma-separated)
- The task involves cross-file modifications and needs progress tracking

**Usage requirements**:
- Create a todo list before starting execution, one entry per step
- Only one `in_progress` at a time
- Mark `completed` immediately after finishing (do not wait for batch processing)
- Append newly discovered steps to the end of the list

**Example**:
```
User: "Fix three bugs in flow.json, then run tests"
→ Create todo: [FixBug1, FixBug2, FixBug3, RunTests]
```

### 2. question — Ask the User

**Trigger conditions** (must ask when any applies; speculative assumptions are prohibited):
- The requirement is ambiguous or has multiple reasonable interpretations
- There are 2 or more equally reasonable technical approaches
- The operation may cause irreversible consequences (deleting files, overwriting config, force push, etc.)
- It involves architecture decisions or design direction choices

**Usage requirements**:
- Mark the recommended option with "(Recommended)"
- Each option must include a one-sentence explanation of its consequences
- Simple confirmation questions should not exceed 3 options
- Urgent or high-risk operations must include a "Cancel" option

**Prohibited behaviors**:
- Making speculative assumptions and executing directly when requirements are ambiguous
- Implementing without user selection when multiple options exist
- Starting with "maybe" or "perhaps" without asking

### 3. task — Sub-Agent Dispatch

**Trigger conditions**:
- Need to explore multiple code areas in parallel (launch 2~3 explore agents)
- Complex multi-step tasks need to be delegated to a general agent
- Complex tasks need to be delegated to downstream Agents (dispatched by Feel, the chief conductor)

**Usage requirements**:
- For parallel tasks, issue multiple task calls in a single message
- Each task prompt must include: specific task description + expected information to return
- Clearly tell the sub-agent whether it is read-only research or can write code

### 4. skill — Skill Loading

**Trigger conditions**:
- Need to understand current stage status → `get-stage-status`
- Need to consult the project knowledge base → `check-kb`
- Need to get the Bug list → `get-bugs`

**Usage requirements**:
- Load `check-kb` at session start to get project background
- Load `get-stage-status` before handling stage tasks to confirm process status
- Must not skip skills and operate directly from memory

### 5. Tool Usage Priority

| Scenario | Preferred Tool | Prohibited Practice |
|----------|---------------|---------------------|
| Multi-step tasks | `todowrite` | Executing step-by-step from memory |
| Ambiguous requirements | `question` | Making assumptions and acting directly |
| Code exploration | `task(explore)` | Manual grep/read one by one |
| Getting status | `skill(get-stage-status)` | Inferring from memory |
| Batch file operations | `task(general)` | Processing serially one by one |

## User Identity

> .openfeel/.info.json

```json
{ "user": "username" }
```

At the start of each session, the Agent first reads this file to get the current username. If the file does not exist or `user` is empty, automatically execute `git config user.name` to get the Git username and write it. If there is no Git configuration, use a default username. This file is added to `.gitignore` and excluded from version control.

### Path Self-Check

Large models may inadvertently truncate or modify the username when constructing `.openfeel/users/{username}/` paths (e.g., `Alice` → `Alic`), causing file read/write failures. When accessing any file under `.openfeel/users/{username}/`, the following self-check rules must be followed:

1. **Immediate check on access failure**: When `read` or `glob` returns "file not found" or "no such file", do not report an error directly. First execute `read .openfeel/.info.json` to re-acquire the correct `username`.
2. **Compare and correct**: Compare the currently used `username` with the value in `.openfeel/.info.json` character by character. If inconsistent, reconstruct the full path with the correct value and retry.
3. **Escalate on consecutive failures**: If the retry still fails, report to the user that "Path `{failed path}` does not exist. Confirmed username is `{correct username}`", and wait for user confirmation before proceeding.

This rule applies to all Agents (Feel / Planner / Schemer / Executor / Reviewer / Feel Tester / Archiver).

---

## Public Domain

### Development Directory

> .openfeel/dev

Stores project-shared core rules and progress status.

> .openfeel/dev/dev_core.md

Stores long-term valid rules. Priority: user instructions > this document > session temporary hints. Each rule is prefixed with `[+]` (enabled) / `[-]` (disabled). Rules can only be marked as disabled, not deleted. When more than 10 rules are disabled, remind the user to clean up.

> .openfeel/dev/current.md

Records work currently in progress. Follows the `@{username} description of ongoing work` paradigm to track each member's progress. The top maintains overall progress status.

> .openfeel/dev/note/dev_note.md

Team-shared development notes, sourced from member personal notes (see Private Domain > Personal Notes). Brief descriptions only; details go into sub-files with an index.

### Log Directory

> .openfeel/log

Public log directory, **only records team-level important events** (records when any of the following conditions are met):
- Creation or important modification of public domain files
- Cross-member collaboration key operations (public note submission, plan adjustments, etc.)
- Plan milestone achievements or major deviations
- Severe issues in private code reviews or Bugs (high priority, report details on first discovery)
- Anomalous events affecting multiple people

Daily operations (routine code modifications, personal plan advancement, debugging, personal notes) are recorded in the private log.

Logs are organized by year/month/day hierarchy. Day directories are only created when important events occur on that day. File naming: `yyyy-mm-dd-{username}-NNN.md`, day directories contain `day_index.md`. The root maintains `index.md` (date index) and `log.md` (last 30 summary entries, format `[filename] {username}: description`, with jump links).

### Code Review Directory

> .openfeel/code_review

Public code review directory, storing core conclusion summaries after private reviews are completed. Included in version control for team reference.

Organized by plan stage, corresponding to the private review directory. The root maintains `index.md` (grouped by stage, with status count statistics at the top). Each stage's insights and suggestions are summarized in `{stage}.md`. The specific review process and detailed content for each submission point are stored in the private `code_review/REV-{stage}.md`.

### Bug Tracking Directory

> .openfeel/bugs

Public Bug tracking directory, storing core conclusion summaries after private Bugs are closed. Included in version control for team reference.

Organized by module, corresponding to the private Bug directory. The root maintains `index.md` (grouped by module). Each module's Bug resolution insights and root cause analysis are archived in `{module}.md`. Specific Bug reports, reproduction steps, and acceptance details are stored in the private `bugs/{module}/`.

### Plan Directory

> .openfeel/plan

**Automated planning**: When the user proposes a task with the following characteristics, the Agent should proactively create an entry in `plan.md` or update `current.md`, without waiting for manual user trigger:
- Involves multi-step operations
- Requires cross-session progress tracking
- May affect multiple modules or files

Plans are divided into two layers:
- **Large plan** (`plan.md`): Overall goals, technical architecture, core milestones. Changes require team communication and confirmation.
- **Small plans** (`{stage}/` subdirectories): Specific task breakdown and implementation steps. Daily modifications and progress happen at this layer.

If a plan does not exist, create it based on user instructions. Large plan changes require user confirmation; small plan adjustments can be done autonomously by the Agent but must be recorded.

Plan indexes are organized by major version series: `plan/index.md` is the top-level index, and series indexes such as `plan/v4/index.md` and `plan/v5/index.md` store core summaries of each plan. `plan_log.md` records the last 30 change summaries, format `{username}: change description`, with jump links.

If unplanned operations or deviations occur, explain to the user first and seek confirmation, while recording in the log.

#### Pipeline Advancement

Each stage's state is jointly managed by `flow.json` and `status.md`. The Feel Agent reads flow.json to determine the current stage and phase, and advances the pipeline through the `openfeel flow` command:

- `openfeel flow status` — View current pipeline status
- `openfeel flow advance` — Advance to the next phase
- `openfeel flow repair` — Repair pipeline state

Pipeline phase enumeration (flow.json PipelinePhase):
plan_pending → plan_review → plan_passed → scheme_pending → scheme_review → scheme_passed → exec_running → review_pending → review_failed → review_passed → test_pending → test_failed → test_passed → archiving → done

Manual process is the default mode. Feel dispatches downstream Agents (Planner / Schemer / Executor / Reviewer / Feel Tester / Archiver) based on flow.json state, without relying on legacy automated scheduling.

When the state is done or paused, do not continue automatic advancement. When encountering unplanned changes or consecutive failures, pause and wait for user decision.

### Temporary Directory

> .openfeel/tmp

Stores project-level temporary files (shared data, build artifacts, etc.). Only reads files from this directory when specified by the user.

### Knowledge Base

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

Prohibited from writing to the knowledge base: behavioral constraints (→ AGENTS.md), operating procedures (→ Instructions), workspace maintenance rules (→ dev_core.md). After each write, record in the public log.

#### Automatic Writing Mechanism

**Trigger timing**: After each non-trivial task in a session (excluding pure query/conversation operations), when overwriting `dev_last.md`, temporarily store this session's **key experience** in it.

**Experience staging format** (written to `dev_last.md`):
- `- [ ] \`{category}\`: {experience description}` — pending user confirmation to archive to kb/

**Archiving process**:
1. In the next session, the Agent reads `dev_last.md`. If it finds unarchived experience entries, it reminds the user to confirm.
2. After user confirmation, the Agent writes the experience to the corresponding kb/ category file (`architecture.md` / `patterns.md` / `troubleshooting.md` / `setup.md`).
3. Write format: Each experience entry starts with `## [+] {title} ({date})`, containing a description and context.
4. After writing, update the "Recent Updates" table in `kb/index.md` and record in the public log `.openfeel/log/`.
5. Finally, mark the experience entry in `dev_last.md` as `[x]` (archived) or delete it.

**Automatic write criteria** (write when any is met):
- Solved a previously unknown build/environment issue
- Discovered and recorded a code pattern/best practice
- Made an architecture decision that affects future development
- Encountered a notable pitfall/troubleshooting experience

This process ensures that the Agent's experience does not disappear with session loss, and the knowledge base grows continuously with the project.

---

## Private Domain

> .openfeel/users/{username}/

The private domain directory. Each time the Agent obtains the current username from `.openfeel/.info.json` to determine the corresponding path. After code modifications, synchronously update related files in the private domain (plans, logs, notes, etc.) to maintain consistency with the actual state.

### Personal Operation Status

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

### Personal Notes

> .openfeel/users/{username}/note/

The **primary location** for lessons learned. Brief descriptions; details go into sub-files with an index. In each conversation, the Agent may randomly remind the user whether to submit to the public note `dev/note/dev_note.md`. After submission, annotate "Submitted to public domain" with a jump link.

### Personal Logs

> .openfeel/users/{username}/log/

The **primary location** for daily operations. Structure consistent with the public log directory. File naming format: `yyyy-mm-dd-NNN.md` (no username needed, as it is already under the user's directory).

### Code Review

> .openfeel/users/{username}/code_review/

Manages code review issues during the development stage (architecture, conventions, logic), organized by plan stage. Separated from Bug tracking.

**Role division:**
- **Reviewer**: Reviews code according to the plan stage, submits issues, verifies fix results.
- **Executor**: Handles review issues, modifies code and updates status.

Review issues for each plan stage are consolidated in `REV-{plan_stage}.md`. Entry template:

```markdown
## REV-{NO}: {Brief Title}
- **Status**: pending | fixing | resolved | closed
- **Priority**: high | medium | low
- **Author**: Reviewer
- **Created**: yyyy-mm-dd HH:MM

### Issue Description
...

### Processing Record
| Time | Operator | Description | Commit |
|------|----------|-------------|--------|

### Acceptance Record
| Time | Reviewer | Conclusion | Notes |
|------|----------|------------|-------|
```

The root maintains `index.md` (grouped by stage, with status count statistics at the top) and `log.md` (last 30 review change summaries).

When a review issue is marked as `pending` with `high` priority, the issue details (title, description, impact scope) must be written to the public log to ensure timely team visibility. When an item is `closed`, the core conclusion is written to `.openfeel/code_review/{stage}.md`, and briefly recorded in the public log.

### Bug Tracking

> .openfeel/users/{username}/bugs/

Manages defects found during the testing phase, organized by module. Separated from code review.

**Role division:**
- **Tester**: Submits Bugs and performs final acceptance.
- **Executor**: Fixes Bugs by module. On session start, uses `load skill get-bugs` to get pending Bugs for the responsible module.

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

### Review/Bug Lifecycle

Both share the same state flow model (only the starting state name differs):

```
pending/open  ──→  fixing  ──→  resolved  ──→  closed
      ↑                         │
      └────────── 验收不通过 ───┘
```

| State | Code Review | Bug Tracking | Operator |
|-------|------------|-------------|----------|
| Start | `pending` | `open` | Submitted by Reviewer / Tester |
| Fixing | `fixing` | `fixing` | Assigned to Executor |
| Ready for acceptance | `resolved` | `resolved` | Completed by Executor |
| Closed | `closed` | `closed` | Accepted by Reviewer / Tester |

### Personal Temporary Directory

> .openfeel/users/{username}/tmp/

Stores temporary files for the current user, fully isolated from other users.
