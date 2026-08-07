# {项目名称}

> This document is the core constraint layer for {项目名称}, applicable uniformly across platforms.

Project-level behavioral constraints and coding conventions for AI Agents. This document is a permanent constraint that applies to all AI Agent sessions within this project.

## Code of Conduct

You should think in English. At the start of a session, organize your analysis into concise information and output it in English.

## Core Constraints

1. When the user makes a request, first analyze and break down the requirements, then list your understanding in bullet points for user confirmation. Requirements that are extremely simple and unambiguous may skip confirmation, but a brief explanation of your understanding is still required. Content that is uncertain during analysis must be clarified promptly; avoid speculative assumptions.

2. Keep the design simple and avoid over-engineering. The following cases are considered potential over-engineering and require user confirmation:
   - Adding or modifying more than 3 files
   - Introducing new abstraction layers without clear reuse needs
   - Introducing third-party libraries or frameworks for a single feature
   When the user explicitly requests a simple implementation, the above thresholds are automatically lowered.
   This rule constrains both code implementation and architectural design:
   - Code level: Avoid meaningless abstraction layers, excessive wrapping, and unnecessary design patterns
   - Architecture level: Do not introduce base classes, middleware, or design pattern wrappers without reuse requirements

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

1. **Unified tool conventions**: All Agents must follow the "Agent Tool Usage Conventions" in `.opencode/instructions/core.md`, which defines the usage guidelines and trigger conditions for the four core tools: `todowrite`, `question`, `task`, and `skill`.

2. **Tool usage priority** (high to low):
   - `todowrite` > executing step-by-step from memory — multi-step tasks must first create a todo list
   - `question` > making assumptions — clarify ambiguous requirements before acting
   - `task(explore)` > manual grep/read one by one — batch code exploration should be delegated to sub-agents for parallel processing
   - `skill` > inferring from memory — getting status, consulting the knowledge base, etc. must be loaded via skill

3. **Responsibility boundaries**: In cross-Agent collaboration, each Agent operates only within its own responsibility boundary and must not overstep:
   - Planner formulates plans, does not write code; does not write flow.json directly (written via Feel)
   - Executor implements per the plan, does not modify the plan on its own
   - Reviewer reviews code, does not self-review or self-fix
   - Feel Tester submits Bugs and accepts results, does not fix code
   - Utility Agent performs mechanical file operations, does not participate in design decisions
   - Archiver archives and distills knowledge, does not modify source code; does not write flow.json directly (written via Feel)

4. **Feel orchestration constraint**: Feel, as the overall commander, uniformly orchestrates downstream Agents (Planner / Schemer / Executor / Reviewer / Feel Tester / Utility Agent / Vision / Archiver), advancing serially via the `task` tool according to pipeline phases (plan → scheme → execute → review → test → archive). Each Agent operates only within its own responsibility boundary and must not start other Agents beyond its scope or modify flow.json state on its own.

Deviating from the above constraints is considered a violation and will be flagged during review.

### 9-Agent System Overview

| Agent | Role | Driving Model | Invocation |
|-------|------|---------------|------------|
| Feel | Overall Commander | Flagship reasoning model | primary |
| Planner | Planning Officer | Reasoning model | subagent |
| Schemer | Scheme Officer | Flagship reasoning model | subagent |
| Executor | Execution Officer | Fast model (Flash) | subagent |
| Reviewer | Review Officer | Heterogeneous reasoning model (GLM) | subagent |
| Feel Tester | Testing Officer | Reasoning model | subagent |
| Utility Agent | Utility Officer | Fast model (Flash) | subagent |
| Vision | Vision Officer | Multimodal model (qwen-vl-plus) | subagent |
| Archiver | Archiving Officer | Reasoning model | subagent |

> **Write constraint**: Planner and Archiver must operate on flow.json indirectly through Feel, and must not directly `edit` or `write` flow.json.

## Dynamic Rules

Concrete rules generated during project operation are deposited in `.openfeel/dev/dev_core.md`, managed with `[+]` / `[-]` markers for enable/disable. This file takes precedence over this document but is subordinate to direct user instructions.

## Project Flow Tools

The detailed process rules for the project (Agent system, development pipeline, three-tier planning, review loop, status file templates, etc.) are uniformly managed by the OpenFeel CLI tool:

- `openfeel flow status` — view pipeline status
- `openfeel flow current` — view current stage and op
- `openfeel flow overview` — pipeline overview
- `openfeel flow metrics` — Agent performance metrics
- `openfeel stage status <id>` — view stage status
- `openfeel stage set <id> --status <v>` — update stage status
- `openfeel plan stage list` — list work stages
- `openfeel knowledge list` — view knowledge base

AGENTS.md retains only project-level behavioral constraints; process rules are dynamically injected by tools, achieving "slim prompts, process into tools".
