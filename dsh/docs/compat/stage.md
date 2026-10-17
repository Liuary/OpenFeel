# OpenFeel — Agent Workflow Layer: Stages and Ops (Behavioral Specification)

Exact behavioural specification of the **stage / op layer** of OpenFeel: the `flow.json` stage and op
records, the on-disk stage directory layout, the op state machine, retry & attempt accounting,
checkpoint snapshots, stage dependencies, orphan reconciliation, and the `stage` / `plan stage` /
`flow stage` command surfaces.

Topic boundaries — this document deliberately does **not** re-derive the following; see
[`pipeline.md`](./pipeline.md):

| Topic | Owner document |
| --- | --- |
| phase vocabulary, transition tables, review tiers, `--force` scope | `pipeline.md` §1–§6 |
| `mapPhaseToStageStatus` full table | `pipeline.md` §7 |
| config cascade precedence, `workflow_mode` resolution layers | `pipeline.md` §8 |
| `parseStageId` / `normalizeStageId` / `validateStageId` / `findStageStatusPath` / `isArchivedVersionOf` | `pipeline.md` §9 |
| `save()` revision bumping, `advanceStagePhase` side-effect ordering | `pipeline.md` §10 |

All identifiers, field names, constants, file templates and user-visible strings below are copied
verbatim from source. Chinese message text is the `zh-CN` i18n value.

**Source of truth (read-only analysis of `C:\Users\Liuary\Dev\Mine\AI\OpenFeel`):**

| File | Role |
| --- | --- |
| `src/core/flow-manager.ts` | `Op`, `OpState`, `Checkpoints`, `StageData`, `FlowData`; `registerStage`, `addStage`, `removeStage`, `checkRemovable`, `resetStagePhase`, `recordAttempt`, `setStageDeps`, `saveCheckpoint`, `listCheckpoints`, `previewRestore`, `restoreCheckpoint`, `findOrphanOps`, `reconcileOrphans`, `repair`, `healthCheck`, `StageDirConflictError` |
| `src/core/plan/stage.ts` | `Stage`, `StageSkeletonOverrides`, `addStage`, `ensureStageSkeleton`, `listStages`, `appendStatusTask`, `buildTaskLines`, `sanitizeTaskDesc` |
| `src/core/plan/path.ts` | `parseStageId`, `normalizeStageId`, `stageIdToPlanDir`, `validateStageId`, `suggestStageId`, `findStageDirConflict`, `planDirToStageId`, `findStageStatusPath`, `isArchivedVersionOf`, `DEFAULT_SERIES`, `DEFAULT_STAGE_VERSION` |
| `src/core/plan/scheme.ts` | `Scheme`, `createScheme`, `createSchemesFromTasks`, `removeScheme`, `registerSchemes`, `publishScheme`, `renameScheme`, `getScheme`, `listSchemes`, `defaultOpForRegister`, op file template |
| `src/core/plan/roadmap.ts` | `createRoadmap`, `showRoadmap` (`.openfeel/roadmap/v{ver}.md`) |
| `src/core/flow-manager.ts` (`Op`/`OpState`) + `src/core/config.ts` | `WORKFLOW_MODES`, `DEFAULT_CONFIG`, `STAGE_FIELD_BY_CONFIG_KEY`, `getConfigFieldLegalValues` |
| `src/commands/stage.ts` | `stage status`, `stage set`, `stage task`, `stage create` |
| `src/commands/plan.ts` | `plan stage add`, `plan stage list`, `plan scheme *` |
| `src/commands/flow.ts` | `flow stage add/set/remove/reset`, `flow attempt`, `flow retry`, `flow ops list`, `flow checkpoint list/restore`, `flow repair` |
| `src/core/artifact-graph/*`, `src/core/schema.ts` | `Artifact`, `Schema`, `ArtifactGraph` — the **separate** artifact DAG (see §12) |
| `.openfeel/flow.json`, `.openfeel/plan/**`, `.openfeel/checkpoints/**` | real on-disk data used for every example |

---

## 0. Two independent models — do not conflate

A reimplementation must keep these two models separate; they share vocabulary but no code path.

| | **Stage/Op model** (this document) | **Artifact model** (§12) |
| --- | --- | --- |
| Persistence | `.openfeel/flow.json` + `plan/{series}/{stage}/` markdown | YAML `schema.yaml` files (`.openfeel/schemas/<name>/`) |
| Unit | stage (`v1.2.1-stage-92`), op (`op-001`) | artifact (arbitrary `id`) |
| Dependency | `stages[].deps` (stage→stage, strings) + `ops/deps.yaml` (op→op, human/AI-read only) | `Artifact.dependsOn` / `Artifact.requires` (machine-enforced DAG) |
| Topology | **no** ordering enforcement, **no** cycle detection for stage deps | Kahn topological sort, cycle → throw |
| Consumed by | `flow`, `plan`, `stage` commands, agents, health | `ArtifactGraph` class only (no CLI command in this repo) |

---

## 1. Stage record schema — `flow.json` `stages[<fullStageId>]`

### 1.1 TypeScript

```ts
export interface StageData {
  name: string;
  phase: PipelinePhase;                              // 15-value enum, see pipeline.md §1.1
  status: string;                                    // coarse projection, see pipeline.md §7
  deps: string[];
  ops: Record<string, Op>;                           // key = LOCAL op id ("op-001")
  stats?: StageStats;                                // optional, runtime-filled
  workflow_mode?: WorkflowMode;                      // optional redundant copy (never authoritative)
  requirement_id?: string | null;                     // optional; absent ≡ null
}
```

```ts
export interface StageStats { start_time: string; end_time: string; duration_ms: number }
```

### 1.2 Field table

| Field | Type | Required | Written at creation | Written later by | Notes |
| --- | --- | --- | --- | --- | --- |
| `name` | `string` | yes | always | never | **Always identical to the object key** (the full stage id). Redundant by design. |
| `phase` | `PipelinePhase` | yes | `"plan_pending"` (all creation paths) | `advanceStagePhase`, `resetStagePhase`, `repair` | Sole authority; `status` is derived from it. |
| `status` | `string` | yes | `"planned"` | `advanceStagePhase` / `resetStagePhase` via `mapPhaseToStageStatus` | Writable set is `STAGE_STATUS_VALUES = ['planned','review_failed','review_passed','testing','archiving','done']` (used only by `stage set --status`). |
| `deps` | `string[]` | yes | `[]`, or `--deps` for `plan stage add` | `setStageDeps` (`flow stage set --deps`) | Fully overwritten (never merged). See §7. |
| `ops` | `Record<string, Op>` | yes | `{}` | `createScheme` / `registerSchemes` / implicit register / `removeScheme` / `repair --prune-orphans` | Read-side repaired to `{}` if missing (§1.5). |
| `stats` | `StageStats` | no | absent | `startStage` (first phase change / first `advanceStagePhase`), `endStage` (transition into `done`) | In-memory created as `{start_time:'', end_time:'', duration_ms:0}`. |
| `workflow_mode` | `WorkflowMode` | no | only by `plan stage add` (i.e. `addStage` in `plan/stage.ts`), and only when the stage did **not** already exist | `stage set --workflow-mode`, `config set workflow_mode --sync-stages` | **Redundant, never authoritative.** Authoritative read is the cascade `resolveStageWorkflowMode`. `healthCheck` item 10 warns on mismatch, never fails, never auto-fixes. |
| `requirement_id` | `string \| null` | no | absent | requirement commands | Absent ≡ `null`; readers must not inject. |

**Key rule:** the object key is the **full** stage id (`v1.0.0-stage-01`, `v4-stage-04`, …). Every core
lookup does "normalize, then double-key fallback": try `normalizeStageId(input)`, and if that key is
absent, retry the raw input (compat with legacy short-name keys). See `pipeline.md` §9.2.

### 1.3 Real record (verbatim from `.openfeel/flow.json`)

```json
"v1.2.1-stage-92": {
  "name": "v1.2.1-stage-92",
  "phase": "done",
  "status": "done",
  "deps": ["v1.2.1-stage-86", "v1.2.1-stage-90", "v1.2.1-stage-91"],
  "ops": {},
  "workflow_mode": "full",
  "stats": {
    "start_time": "2026-10-15T02:49:08.280Z",
    "end_time":   "2026-10-15T04:47:42.076Z",
    "duration_ms": 7113796
  }
}
```

Key order produced by `registerStage` then the `workflow_mode` write in `addStage`:
`name, phase, status, deps, ops, workflow_mode`; `stats` is appended on first phase change
(`startStage` mutates the existing object, so it lands last only because it is created later).

### 1.4 Creation defaults per path

| Creation path | `phase` | `status` | `deps` | `ops` | `workflow_mode` | `pipeline.current` |
| --- | --- | --- | --- | --- | --- | --- |
| `FlowManager.registerStage(id, deps)` (used by `plan stage add`) | `plan_pending` | `planned` | arg (`[]` default) | `{}` | not written by `registerStage`; `addStage` (plan/stage.ts) sets it only for a brand-new key | untouched |
| `FlowManager.addStage(id, initialPhase='plan_pending')` (used by `flow stage add`, `stage create`) | arg | `planned` | `[]` | `{}` | not written | **`{ stage: id, op: '' }`** |
| `createScheme` implicit register (stage absent from `flow.json`) | `plan_pending` | `planned` | `[]` | `{}` then the new op | not written | untouched |
| `repair()` fill-in | `plan_pending` if `phase` missing | untouched | untouched | `{}` if missing/invalid | untouched | untouched |

Both `registerStage` and `addStage` are **idempotent for an existing key**: `registerStage` returns
silently (it does **not** update `deps`); `addStage` throws `Stage 'x' already exists`.

### 1.5 Read-side repair (`load()`)

`FlowManager.load()` mutates the parsed object before any consumer sees it:

- missing/nil `stage.ops` → `{}`
- missing/nil `stage.deps` → `[]`
- `op.id = <key>` injected into every op (**runtime-only convenience field**; not a disk field)

`save()` strips `id` from a deep clone before serialising, so it never reaches disk.

### 1.6 `save()` invariants (see `pipeline.md` §10.1 for the full ordering)

- `meta.updated = new Date().toISOString()`
- `meta.revision` incremented by exactly 1 under `flow.lock`
- optimistic concurrency: if the on-disk `revision` ≠ the loaded baseline, throw
  `FlowConcurrentModificationError` (`flow.json 并发冲突：期望 revision=…，磁盘为 …（已被其它进程修改）`); the command layer maps this to **exit code 2**
- old file copied to `flow.json.bak` before the atomic write

---

## 2. Op record schema — `stages[<stage>].ops[<localOpId>]`

### 2.1 TypeScript

```ts
export type OpState = 'pending' | 'executing' | 'done' | 'failed' | 'draft';

export interface Checkpoints {
  plan: string;
  scheme: string;
  exec: { attempts: number; self: string };
  review: string;
  test: string;
}

export interface Op {
  id: string;                    // RUNTIME ONLY — equals the ops-map key; stripped by save()
  title: string;
  state: OpState;
  assignee: string;
  attempts: number;
  max_attempts: number;
  checkpoints: Checkpoints;
  attempted_at?: string;         // ISO; optional — legacy ops lack it; readers must not inject
  completed_at?: string;         // ISO; optional — set only on entry to a terminal state
}
```

### 2.2 Field table

| Field | Type | Required on disk | Default at creation | Mutated by | Notes |
| --- | --- | --- | --- | --- | --- |
| *(map key)* | `string` | yes | `op-NNN` (3-digit zero-padded) | — | **Local** id, no stage prefix. Global reference form is `{stageId}.{op}`. |
| `id` | `string` | **NO** | set in memory from the key | `load()`/`getReadyOps()` | Never persisted. A reimplementation that writes it produces a diff-visible behaviour change. |
| `title` | `string` | yes | the `title` argument of `plan scheme create` (or `任务N：…` for `--from-tasks`) | `plan scheme rename --title` | Authority for `plan scheme list` is the file's first line `# op-NNN：{title}`; `flow.json.title` is a copy kept in sync by `rename()`. |
| `state` | `OpState` | yes | `pending` (or `draft` with `--draft`) | `recordAttempt`, `publishScheme` | See §4. |
| `assignee` | `string` | yes | `openfeel-executor` | **nothing** (write-once) | Present for schema compatibility; no code path ever updates it. |
| `attempts` | `number` | yes | `0` | `recordAttempt` only (`+= 1`) | **Never reset by any command.** |
| `max_attempts` | `number` | yes | `3` | **nothing** (no CLI flag) | Compared with `attempts` inside `recordAttempt`. |
| `checkpoints` | `Checkpoints` | yes | all-`pending` object (§5.1) | legacy `advancePhase` only | Mixed-type: 4 strings + `exec: {attempts, self}`. |
| `attempted_at` | ISO string | no | absent | `recordAttempt` (all three outcomes) | Set on **every** recorded attempt. |
| `completed_at` | ISO string | no | absent | `recordAttempt` on `pass` and on exhaustion only | Same instant as `attempted_at` for those two branches. |

### 2.3 Disk shape — real records from `.openfeel/flow.json` (`v1.2.0-stage-80`)

```json
"op-001": {
  "title": "跨版本 deps 判定适配（单一口径 helper + 命令层两处校验点）（T1）",
  "state": "pending",
  "assignee": "openfeel-executor",
  "attempts": 0,
  "max_attempts": 3,
  "checkpoints": {
    "plan": "pending",
    "scheme": "pending",
    "exec": { "attempts": 0, "self": "pending" },
    "review": "pending",
    "test": "pending"
  }
}
```

Key order is exactly `title, state, assignee, attempts, max_attempts, checkpoints` (the object literal
in `syncToFlowJson` / `defaultOpForRegister` starts with `id`, which `save()` deletes).

### 2.4 Creation defaults — all three creators are byte-identical

`createScheme → syncToFlowJson`, `defaultOpForRegister` (`plan scheme register`), and the `load()`
repair path all produce the same literal:

```ts
{
  id: opId, title,
  state: draft ? 'draft' : 'pending',
  assignee: 'openfeel-executor',
  attempts: 0, max_attempts: 3,
  checkpoints: { plan:'pending', scheme:'pending', exec:{attempts:0,self:'pending'}, review:'pending', test:'pending' }
}
```

`attempted_at` / `completed_at` are **omitted at creation** (legacy-compat: readers tolerate absence).
`exec.attempts` is initialised to `0` and **never incremented by any code path in the codebase** — it is
a reserved field. A conforming reimplementation must preserve it (default `0`, no writes) rather than
remove it.

### 2.5 Op registration side effects

`createScheme(projectPath, stage, title, {draft})`:

1. creates `.openfeel/plan/{series}/{stageDir}/ops/` (`mkdir -p`)
2. under lock `scheme-{stageDir}.lock`: allocates the sequence and atomically writes `ops/op-NNN.md`
3. `syncToFlowJson` (a **separate**, unlocked-then-`save()` step):
   - if `flow.json` absent → returns silently (op file still created)
   - if the stage key is absent → validates `validateStageId`, then `findStageDirConflict`; if either
     check fails it **warns and skips** registration (op file remains → becomes a *file orphan*) — it
     does **not** throw; on success it creates the stage record and calls `ensureStageSkeleton`
   - writes `ops[opId]` with the §2.4 literal
   - appends log `register_op` (agent `cli`) and, for `--draft`, `scheme_create` with `{draft:true}`
   - `save()`; a concurrency failure warns `[WARN] op {opId} 已创建，但 flow.json 同步因并发冲突失败…`
4. `warnUnregisteredFiles` → stderr warning listing up to 5 file orphans of that stage

**Sequence allocation** (`nextSchemeSequence(fileSeqs, registeredSeqs)` then `reserveSequence`):

1. the used set is `ops/` file numbers ∪ `flow.json` `ops` key numbers (both scanned with
   `/^op-(\d+)/`, so legacy `op-NNN_{title}.md` files and `op-NNN-verdict.md` side files occupy numbers)
2. start candidate = **smallest unused positive integer** starting at 1 (holes are back-filled, so
   `op-001`, `op-003` present → next is `op-002`)
3. `reserveSequence` tries `candidate(seq) = 'op-' + String(seq).padStart(3,'0') + '.md'` from that start,
   claiming it with `openSync(path, 'wx')` (**O_EXCL**) and incrementing on `EEXIST`, up to
   `SEQUENCE_MAX_ATTEMPTS_DEFAULT = 1000`; then it throws
   `序号分配失败：连续 1000 次候选均被占用（dir={opsDir}）`
4. the claimed file is an **empty placeholder**; `createScheme` writes the template into it with
   `atomicWriteFileSync`. A crash between claim and write leaves a 0-byte file that still occupies the
   number (never reused, never renumbered downward)

`opIdOf(seq) = 'op-' + String(seq).padStart(3, '0')` — 3-digit minimum, so `op-1000` is 4 digits.

---

## 3. On-disk layout

### 3.1 Path resolution

```
.openfeel/plan/{series}/{stageDir}/
```

| Term | Rule | Examples |
| --- | --- | --- |
| `{series}` | **major version only**, `v{MAJOR}` | `v1`, `v4`, `v0` |
| `{stageDir}` | `stage-{NN}` with the **original digits preserved** (leading zeros not normalised) | `stage-01`, `stage-92`, `stage-092` |
| full stage id | `{version}-stage-{NN}` | `v1.0.0-stage-01`, `v1.2.1-stage-92`, `v4-stage-04` |
| short id | `stage-{NN}` → normalised to `v1.0.0-stage-{NN}` | `stage-01` → `v1.0.0-stage-01` |

`DEFAULT_SERIES = 'v1'`, `DEFAULT_STAGE_VERSION = 'v1.0.0'`.

> **Hazard.** The repository legitimately contains *version* sub-directories next to stage
> directories: `.openfeel/plan/v1/v1.2.1/` holds `plan.md` + `deps.yaml` (version-level plan), **not**
> a stage. `listStages()` and `listSchemes()` iterate *every* directory under `plan/{series}/`, so
> `plan stage list` prints `- v1.2.1  .openfeel/plan/v1/v1.2.1/` as if it were a stage. A
> reimplementation must reproduce this (no `stage-NN` filter) unless deliberately diverging.

### 3.2 Directory inventory (from real data)

A stage directory may contain exactly these entries; nothing else is created by the CLI:

```
.openfeel/plan/v1/stage-92/
├── overview.md                      # ensureStageSkeleton (idempotent, never overwritten)
├── status.md                        # ensureStageSkeleton (idempotent, never overwritten)
├── plan.md                          # written by the planner agent (free-form; not CLI-managed)
└── ops/
    ├── deps.yaml                    # op-dependency declaration (agent-written; CLI only seeds a placeholder)
    ├── op-001.md
    ├── op-002.md
    ├── op-003.md
    └── op-004.md
```

Legacy stage directories under `.openfeel/stages/{fullStageId}/` (e.g. `.openfeel/stages/v0.5.11-stage-01/`)
contain only `overview.md` + `status.md` and are **read-only fallback** targets.

**No `review/` or `test/` sub-directory exists** — neither in the code (no `join(..., 'review')`
anywhere) nor in real data. Review artefacts live outside the stage directory:

| Artefact | Real location |
| --- | --- |
| Code/plan review findings | `.openfeel/users/{username}/code_review/REV-{NN}.md` (per-user) |
| Stage review index/summary | `.openfeel/code_review/stage-{NN}.md`, `.openfeel/code_review/{index,log}.md` |
| Review records (`flow.json.reviews[]`) | `flow.json` top-level array, not a file |
| Agent run logs | `.openfeel/users/{username}/log/{YYYY-MM-DD}-{NNN}.md` |
| Stage timing metrics | `.openfeel/metrics.json` |
| Checkpoint snapshots | `.openfeel/checkpoints/*.json` (§5.2) |
| status.md backups | `.openfeel/tmp/status.{stageId}.bak` |

### 3.3 `status.md` — full structure and managed regions

Skeleton emitted by `ensureStageSkeleton` (exact bytes; `{…}` are substitutions, one trailing `\n`):

```markdown
# {fullStageId} 状态

- **执行模式**：{executionMode}
- **自动推进**：{autoAdvance}
- **工作流模式**：{workflowMode}
- **状态**：planned
- **当前责任 Agent**：user
- **上一责任 Agent**：none
- **更新时间**：{yyyy-MM-dd HH:mm}

## Worktree / Session

- **工作模式**：manual
- **分支名**：-
- **Session 名称**：-
- **合并状态**：not_started
- **清理策略**：manual

## 当前任务

{tasksBlock}

## 阻塞 / 暂停原因

无

## 状态记录

| 时间 | Agent | 状态变化 | 说明 |
|------|-------|----------|------|
| {yyyy-MM-dd HH:mm} | user | planned | 阶段已创建 |
```

- `{yyyy-MM-dd HH:mm}` = `new Date().toISOString().replace('T',' ').substring(0,16)` → **UTC**, minute
  precision, no timezone marker. A local-time implementation silently diverges.
- `{tasksBlock}` = `buildTaskLines(tasks)` → `- [ ] 任务1：desc` lines joined by `\n` (numbering from 1,
  contiguous), or the literal `> 待补充` when no initial tasks.
- `{executionMode}` ← `overrides.executionMode ?? resolveConfigDefaults().execution_mode` (default `manual`)
- `{autoAdvance}` ← `overrides.autoAdvance ?? resolveConfigDefaults().auto_advance` (default `enabled`)
- `{workflowMode}` ← `overrides.workflowMode ?? resolveStageWorkflowMode(fullStageId).value`
  (status.md does not exist yet, so the `status.md` cascade layer cannot hit; result is
  requirement → `config.yaml` → profile → builtin, builtin default **`fast`**)

Real example — `.openfeel/plan/v1/stage-92/status.md`:

```markdown
# v1.2.1-stage-92 状态

- **执行模式**：auto
- **自动推进**：enabled
- **工作流模式**：full
- **状态**：planned
- **当前责任 Agent**：user
- **上一责任 Agent**：none
- **更新时间**：2026-10-14 16:40

## Worktree / Session

- **工作模式**：manual
- **分支名**：-
- **Session 名称**：-
- **合并状态**：not_started
- **清理策略**：manual

## 当前任务

- [ ] 任务1：提速与并行拆分：审查档位 / 并行编排 / 归档轻量化

## 阻塞 / 暂停原因

无

## 状态记录

| 时间 | Agent | 状态变化 | 说明 |
|------|-------|----------|------|
| 2026-10-14 16:40 | user | planned | 阶段已创建 |
```

Legacy `status.md` files (`.openfeel/stages/…`, written before the `工作流模式` field existed) omit that
line entirely; `insertStatusField` exists precisely to add it later.

#### Field parsing

`stage set` / `stage status` / `flow health` all parse the block with
`/^-\s*(?:\*\*)?(.+?)(?:\*\*)?[：:]\s*(.*)$/gm` (key = group 1 trimmed, value = group 2 trimmed). Both
ASCII `:` and full-width `：` are accepted; bold markers are optional.

`showStageStatus` prints known keys in this fixed order, then any unknown keys:

```
执行模式, 自动推进, 状态, 当前责任 Agent, 上一责任 Agent, 更新时间,
工作模式, 分支名, Session 名称, 合并状态, 清理策略, 前置依赖, 依赖状态
```

(`前置依赖` / `依赖状态` are legacy-only and never written by current code.)

#### Managed regions — who writes what

| Region | Written by | Never written by |
| --- | --- | --- |
| `执行模式` | skeleton; `stage set --exec-mode`; `config set execution_mode --sync-stages` | `flow advance` |
| `自动推进` | skeleton; `stage set --auto-advance`; `config set auto_advance --sync-stages` | `flow advance` |
| `工作流模式` | skeleton; `stage set --workflow-mode`; `config set workflow_mode --sync-stages` | `flow advance` |
| `状态` | skeleton; `stage set --status`; `flow health --fix` (`reconcileStatusMd`) | `flow advance` (**deliberately** — `flow.json.stages[].status` is the projection, status.md is not touched by advance) |
| `当前责任 Agent` | skeleton (`user`); `stage set --review-agent` | — |
| `上一责任 Agent` | skeleton (`none`) only | — |
| `更新时间` | skeleton only | — |
| `## Worktree / Session` block | skeleton only | — |
| `## 当前任务` | skeleton; `stage task --add` (append); `stage task --done/--undone` (checkbox) | — |
| `## 阻塞 / 暂停原因` | skeleton (`无`) only | — |
| `## 状态记录` table | skeleton (one row) only; appended manually by agents | — |

**Every write is a targeted surgical replacement** — the rest of the file is preserved byte-for-byte
(CRLF aware in `insertStatusField`). Writes are atomic and taken under
`.openfeel/tmp/locks/status-{stageDir}.lock` (e.g. `.openfeel/tmp/locks/status-stage-35.lock`). A backup
`.openfeel/tmp/status.{stageId}.bak` is copied **only when a change is actually confirmed** (not on
no-op, not on failure, and — notably — not for `stage task --add`).

Lock file names (`projectLockPath(projectPath, name)` → `.openfeel/tmp/locks/{name}.lock`):

| Lock | Name | Guards |
| --- | --- | --- |
| flow | `flow` | `flow.json` read-modify-write + optimistic revision check |
| status | `status-{stageDir}` | per-stage `status.md` read-modify-write |
| scheme | `scheme-{stageDir}` | op sequence allocation + op file creation |

#### `appendStatusTask` algorithm (`stage task <id> --add <desc>`)

1. resolve path via `findStageStatusPath`; missing → throw `STATUS_NOT_FOUND`
2. find the header line `/^##\s*当前任务\s*$/m`; missing → throw `TASK_SECTION_MISSING`
3. `no = max(existing 任务{N} numbers) + 1` (regex `/^-\s*\[[ x]\]\s*任务(\d+)[：:]/gm`); if none → `1`
4. body = lines between this header and the next `\n## ` (or EOF), each `trimEnd()`-ed, dropping blank
   lines and the literal `> 待补充`
5. append `` - [ ] 任务{no}：{sanitizeTaskDesc(desc)} `` where `sanitizeTaskDesc` collapses internal
   newlines to a single space and trims
6. write `prefix + '\n' + body.join('\n') + '\n' + suffix`

### 3.4 `overview.md`

Skeleton (`ensureStageSkeleton`, exact bytes, trailing `\n`):

```markdown
# {fullStageId}

## 目标

> 待补充

## 依赖

{depsText}

## 操作方案

> 待补充
```

`{depsText}` = `- {dep}` lines joined by `\n` when `deps` is non-empty, else the literal `无`.
`overview.md` is **never** rewritten after creation (not even when `deps` change via
`flow stage set --deps`), so it is a *historical* record, not a mirror of `flow.json.deps`.

Real example — `.openfeel/plan/v1/stage-92/overview.md`:

```markdown
# v1.2.1-stage-92

## 目标

> 待补充

## 依赖

- v1.2.1-stage-86
- v1.2.1-stage-90
- v1.2.1-stage-91

## 操作方案

> 待补充
```

### 3.5 `ops/op-NNN*.md` — naming and content

Naming rules:

| Form | Status | Matching predicate used everywhere |
| --- | --- | --- |
| `op-NNN.md` | **current**; the only form `createScheme` writes | exact `f === `${opId}.md`` |
| `op-NNN_{title}.md` | legacy; never migrated, never renamed | `f.startsWith(`${opId}_`)` |
| `op-NNN-{suffix}.md` (e.g. real `op-001-verdict.md`) | agent-authored side file | **counts as a file orphan key** (`/^(op-\d+)/`) but is *not* found by `readOpTemplate` / `hasOpTemplateFile` |

The title is **no longer part of the filename** (it used to break on `/` in titles). The title's
authority for listing is the file's first line matched by `/^#\s*op-\d+[：:]\s*(.+)$/m`; for legacy
names the filename is parsed instead (`op-NNN_{title}.md` → `{title}` with `_` → space); final fallback
is the bare filename.

Exact template (`generateSchemeTemplate`, trailing `\n`):

```markdown
# {opId}：{title}

- **阶段**：{fullStageId}
- **状态**：pending
- **前置**：无
- **负责 Agent**：openfeel-executor
- **最多重试**：3

## 目标
{title}

## 实施步骤
- [ ] 待补充

## 产出文件
- 待补充

## 自测清单
- [ ] 待补充

## 修正记录
| 次数 | 时间 | 问题 | 修正内容 |
|------|------|------|----------|
```

Notes a reimplementation will get wrong:

- There is **no blank line** between `## 目标` and the title line.
- `- **状态**：pending` is emitted **even for `--draft`**, while `flow.json` records `state: "draft"`.
  The file header is therefore *not* the state authority; `flow.json` is.
- `## 产出文件` is `- 待补充` (a plain bullet), while the two fillable sections use the checkbox form
  `- [ ] 待补充` (`EMPTY_TEMPLATE_MARKER`).
- `最多重试：3` is documentary — the operative value is `flow.json` `max_attempts: 3`.

**Fill-state detection** (`isTemplateEmpty` / `detectFillState`, single source of truth):

```ts
export const EMPTY_TEMPLATE_MARKER = '- [ ] 待补充';
const EMPTY_TEMPLATE_LINE_RE = /(?:^|\n)[ \t]*-\s*\[\s*\]\s*待补充[ \t]*(?=\r?\n|$)/;
isTemplateEmpty(c)   // line-anchored: inline mentions do NOT count
detectFillState(c)   // 'empty' | 'partial' (has any unchecked `- [ ]`) | 'filled'
```

`null` content (file missing / unreadable / name without the `op-` prefix) is treated as `filled` by
`flow ops list` and skipped (not reported) by `healthCheck` item 9.

### 3.6 `ops/deps.yaml` — op-dependency declaration

This file is **not read by any CLI code path**. It is written by the `openfeel-schemer` agent and read by
the orchestrating agents. The CLI only seeds a placeholder via
`plan scheme create <stage> --from-tasks` when the file is absent:

```yaml
# {fullStageId} op 依赖声明（占位）
# 由 openfeel plan scheme create --from-tasks 机械生成；依赖关系请由 openfeel-schemer 补全
# 参见 kb/patterns.md #op 文件命名规范 + #deps.yaml 声明实际文件名

version: "1.1"
stage: {fullStageId}

ops: {}
```

The agent-authored form (real, abbreviated from `.openfeel/plan/v1/stage-92/ops/deps.yaml`) uses:

```yaml
version: "1.1"
stage: v1.2.1-stage-92
series: v1
generated_by: openfeel-schemer
generated_at: "2026-10-15"

cross_stage_constraints:            # upstream / downstream notes, type: hard|soft, status: done
  - upstream: v1.2.1-stage-86 / v1.2.1-stage-90 / v1.2.1-stage-91
    type: hard
    status: done
    reason: "..."

ops:
  op-001:
    file: op-001.md
    title: "..."
    produces: [ ...file list... ]
    deps: []                        # first op
    retry: { max: 3, on_fail: 回退 Feel 重议 }
    notes: "..."
  op-002:
    file: op-002.md
    deps:
      - op: op-001
        type: hard
        reason: "..."
mutual_exclusions:
  - group: [op-001, op-002, op-003]
    reason: "..."
```

Legacy stage-level variant, still present at `plan/v1/stage-33/deps.yaml` (note the different key and
the flat string-array form):

```yaml
ops:
  op-001:
    file: "ops/op-001.md"
    depends_on: []
    stage: "v1.0.0-stage-33"
    type: hard
    produces: [ ... ]
```

**Version-level** `plan/{series}/{version}/deps.yaml` carries the stage graph consumed by
`flow health`'s cycle check:

```yaml
stages:
  v1.2.1-stage-86:
    name: 可观测性改造
    deps: []
    priority: P0
    est_ops: 3
    produces_core: [ ... ]
    notes: "..."
```

### 3.7 `plan.md`

Free-form planner output at `plan/{series}/{stage}/plan.md` (real file: 69 KB for `stage-92`). No CLI
code reads or writes it; it is referenced by ops via `对应计划` lines. Real header shape:

```markdown
# v1.2.1-stage-91 计划 — 提示词瘦身与上下文治理（主题四）

- **阶段**：`v1.2.1-stage-91`（…）
- **依赖**：**hard: `v1.2.1-stage-88` / …**
- **优先级**：P0 ｜ **制定人**：openfeel-planner ｜ **制定时间**：2026-10-15 ｜ **修订轮**：修订 0（初稿）
- **基线**：**HEAD `3d25d76`**（…）
```

### 3.8 Roadmap (secondary)

`src/core/plan/roadmap.ts` manages `.openfeel/roadmap/v{version}.md` (version normalised by stripping a
leading `v`). Skeleton:

```markdown
# 分期大纲 v{ver}

## 目标

> 待补充 — 描述本版本的总体目标

## 阶段划分

> 待补充 — 列出各阶段（stage-01, stage-02, ...）及简要说明

## 里程碑

> 待补充 — 关键里程碑和预期完成时间

## 备注

> 待补充
```

`createRoadmap` is no-op-with-message when the file exists (`大纲已存在: v{ver}.md`);
`showRoadmap` with a missing version throws `错误：大纲文件不存在 — v{ver}.md` (core does not
`process.exit`), and without arguments lists `v*.md` filenames.

---

## 4. Op state machine

### 4.1 States

| State | Meaning | Counted as "ready"/current? | Counted in `opsCount`? |
| --- | --- | --- | --- |
| `draft` | created but unpublished (`--draft`); template may still be empty | **no** | **no** |
| `pending` | awaiting execution, or returned to the queue after a retryable failure | yes | yes |
| `executing` | *(reserved)* — recognised by every predicate, **never written by any code path** | yes | yes |
| `done` | terminal success | no | yes |
| `failed` | terminal failure after attempt exhaustion | no | yes |

`executing` is accepted by `getReadyOps`, `syncCurrentOp`, `recoverContext`, and the
`removeStage` current-pointer fallback. **No command, API, or repair path ever sets it.** An op can hold
`executing` only if a human edits `flow.json`. A reimplementation must keep the value in the union and
treat it exactly like `pending` in every predicate, but must not invent a transition into it.

### 4.2 Legal transitions

| From | To | Trigger (exact) | Fields updated | Also updated |
| --- | --- | --- | --- | --- |
| — | `draft` | `plan scheme create <stage> <title> --draft` | full creation literal (§2.4) | log `register_op`, `scheme_create{draft:true}` |
| — | `pending` | `plan scheme create` (no `--draft`); `plan scheme register`; implicit register; `createSchemesFromTasks` | full creation literal | log `register_op` |
| `draft` | `pending` | `plan scheme publish <stage> <op>` (requires the template to be non-empty) | `state` only | log `scheme_publish` |
| `pending` | `done` | `flow attempt --op X --result pass` | `state`, `attempts += 1`, `attempted_at`, `completed_at` | `syncCurrentOp(stage)`, `pipeline.retry = 0`, log `attempt_pass` + public log |
| `pending` | `pending` | `flow attempt --op X --result fail` **and** `attempts < max_attempts` after increment | `attempts += 1`, `attempted_at` (**`completed_at` untouched**) | `syncCurrentOp`, `pipeline.retry += 1`, log `attempt_fail_retry` |
| `pending` | `failed` | `flow attempt --op X --result fail` **and** `attempts >= max_attempts` after increment | `attempts += 1`, `attempted_at`, `completed_at` | `pipeline.retry += 1`, log `attempt_fail_exhausted`; **no** `syncCurrentOp` |
| `executing` | any of the above | same `recordAttempt` code path (the state is not special-cased) | as above | as above |
| `draft` | `draft` (refused) | `flow attempt` on a draft | **nothing** | log `attempt_refused_draft` (agent `openfeel-executor`); CLI prints the publish hint and exits **1** |
| `failed` | `done` / `pending` / `failed` | a subsequent `flow attempt` — `failed` is **not** absorbing | as per the `pass`/`fail` branches | as above |
| `done` | — | no transition out of `done` (only `--force` deletion of the registration) | — | — |

`recordAttempt` increments `attempts` **unconditionally first**, then branches. Therefore the retry gate
is `attempts < max_attempts` *after* the increment — with the default `max_attempts = 3` an op fails
`attempt #1` → `pending`, `#2` → `pending`, `#3` → `failed`.

### 4.3 Who performs what

| Actor | Paths |
| --- | --- |
| **CLI / core** | every state write (`draft`/`pending` at creation, `draft→pending` on publish, `done`/`failed`/`pending` on attempt) |
| **Agents** | may edit `ops/op-*.md` content, `plan.md`, `deps.yaml`, review files; **must not** hand-edit `flow.json` |
| **`repair()`** | never touches `op.state`; can only drop `ops` keys (`--prune-orphans`) |
| **`restoreCheckpoint`** | restores whatever `state` values the snapshot held (whole stage subtree or whole file) |

### 4.4 Command: `flow attempt`

```
openfeel flow attempt --op <stage>.<op> --result <pass|fail>
```

- both options `requiredOption`
- `--result` ∉ {`pass`,`fail`} → `错误：--result 必须为 pass 或 fail` + exit 1
- op state is `draft` → `{opId} 处于 draft（未发布），无法记录执行结果；请先运行 openfeel plan scheme publish {stage} {opId}` + exit 1 (defence-in-depth: core `recordAttempt` also refuses)
- **`pass` prints the success message even when the op does not exist** — `recordAttempt` returns
  `{shouldRetry:false, shouldReplan:false}` for an unknown op and the CLI branches on `--result` first.
  Exit code 0 either way. (Real behavioural quirk; preserve or deliberately deviate.)
- `pass` → `✓ {op} 执行成功`
- `fail` + `shouldRetry` → `⚠ {op} 执行失败，将重试（可重试）`
- `fail` + `shouldReplan` → `✗ {op} 重试耗尽，需要重新规划`, then `advancePhase(op, 'scheme_pending')`
  (deprecated path, emits `[DEPRECATED] advancePhase() 已弃用…` on stderr) + a second `save()`, then
  `→ 已自动回退到 scheme_pending，请重新规划方案`
- finally prints the pointer: `当前指针：{stage}.{op}` or `当前指针：{stage}.（无待执行 op）`

### 4.5 Command: `plan scheme publish`

```
openfeel plan scheme publish <stage> <opId>
```

Order of checks (each failure → exit 1):

1. stage / op not found → `未找到：阶段 {stage} 或操作方案 {opId}` (`reason: 'not-found'`)
2. `op.state !== 'draft'` → `{opId} 不是 draft 状态，无需发布` (`'not-draft'`)
3. template file unreadable → `not-found`
4. `isTemplateEmpty(content)` → `模板未填充，禁止发布：{opId}（请先补全「- [ ] 待补充」）` (`'empty-template'`)
5. success → `state = 'pending'`, log `scheme_publish`, save, `已发布 {opId}（draft → pending）`

---

## 5. Checkpoint model

Two unrelated things are both called "checkpoint".

### 5.1 Op-level `checkpoints` object

```ts
checkpoints: {
  plan:   'pending',                 // string, phase-gated
  scheme: 'pending',                 // string
  exec:   { attempts: 0, self: 'pending' },   // object — the only nested one
  review: 'pending',
  test:   'pending',
}
```

| Member | Value domain observed in code | Written by |
| --- | --- | --- |
| `plan`, `scheme`, `review`, `test` | `'pending'` \| `'passed'` \| `'failed'` | legacy `advancePhase` only |
| `exec.self` | `'pending'` \| `'running'` | legacy `advancePhase` (`exec_running` only) |
| `exec.attempts` | `0` only (§2.4) | nothing |

The only writer is the **deprecated** `FlowManager.advancePhase(opId, to, …)`, which is reachable solely
from `flow attempt` on exhaustion (`to = 'scheme_pending'`). Its rule:

```
checkpointKey = pipelineConfig.checkpoint_mapping[ phase.split('_')[0] ]     // plan|scheme|exec|review|test
if checkpointKey === 'exec':
    if phase === 'exec_running': op.checkpoints.exec.self = 'running'        // else untouched
else:
    phase.endsWith('_passed') ? 'passed'
  : phase.endsWith('_failed') ? 'failed'
  : 'pending'
```

With the current runtime `pipeline.yaml` (`checkpoint_mapping` = `{plan,scheme,exec,review,test,archive}`),
and the only live call site passing `scheme_pending`, the effective net effect is: **all four string
members reset to `'pending'`**; `exec.self` is never touched by it.

`hasCheckpointProgress` (used by `plan scheme remove`) treats progress as "touched" if **any** of the
four strings ≠ `'pending'`, or `exec.attempts ≠ 0`, or `exec.self ≠ 'pending'`.

### 5.2 Snapshot files — `.openfeel/checkpoints/`

| Property | Value |
| --- | --- |
| Directory | `.openfeel/checkpoints/` (created on demand) |
| File name | `{fullStageId}-{yyyyMMddTHHmmssSSS}-{phase}.json` |
| Timestamp | local-time components, **millisecond-precise** (`formatCheckpointTimestamp`) so same-second advances do not collide |
| Content | a full serialisation of `flow.json` at that instant (same serialisation as `save()`, `op.id` stripped), pretty-printed with 2 spaces + trailing `\n` |
| Written by | `advanceStagePhase` **only** (`saveCheckpoint(key, targetPhase)`, after the phase write and before log append) |
| Not written by | `resetStagePhase` (**deliberately**), `recordAttempt`, `save()`, `removeStage` |
| Retention | at most **20** files per stage (`CHECKPOINT_MAX_KEEP = 20`); on overflow the oldest by filename sort are unlinked (best-effort) |
| Failure mode | entirely swallowed — a failed snapshot never blocks an advance |

Real filenames:

```
v0.5.11-stage-01-20260807T204400057-review_pending.json
v1.0.0-stage-01-20260807T212838127-plan_passed.json
v1.0.0-stage-01-20260807T214842127-archiving.json
```

Note the timestamp has **17 digits in the time part** (`HHmmss` + 3-digit ms) and the phase is the
**target** phase.

### 5.3 `flow checkpoint list [stage]`

Read-only. Lists `*.json` in `.openfeel/checkpoints/` sorted ascending by filename; when `stage` is given
it filters by `normalizeStageId(stage)` **and also** by the raw input (legacy short-name snapshots), i.e.
`f.startsWith(key + '-') || f.startsWith(rawInput + '-')`. Output:

```
Checkpoint 快照 [<stage>]:
  <file>
  ...
共 <n> 个快照
```

Empty → `（暂无 Checkpoint 快照）` / `（阶段 {stage} 暂无 Checkpoint 快照）` (exit 0).

### 5.4 `flow checkpoint restore <file> [--force] [--stage <id>] [--dry-run]`

Safety + semantics, in exact order:

1. `--dry-run` → `previewRestore`, **no `--force` required**:
   - revision conflict (disk revision ≠ loaded revision) → stderr
     `[WARN] flow.json 已被其它进程修改，拒绝从快照恢复（请重新加载后重试）` + **exit 1**
   - invalid name / missing / bad JSON → `错误：无法从快照 {file} 恢复（文件不存在、名称非法或内容无效）` + exit 1
   - `--stage` not present in the snapshot (after normalize + raw fallback) →
     `错误：快照中不存在阶段 {stage}` + exit 1
   - prints `Checkpoint 恢复预览（未写盘）` then per-stage
     `  {stage}: {fromPhase}({fromStatus}) → {toPhase}({toStatus})` or `  （无差异）`;
     absent sides render as sentinels `(absent)` / `(removed)`. Exit 0.
2. without `--dry-run`, missing `--force` → `错误：恢复操作将覆盖当前 flow.json，请使用 --force 确认` + exit 1
3. `restoreCheckpoint`:
   - filename safety: rejects any name containing `/`, `\`, or `..` (`invalid-name`)
   - takes `flow.lock`; re-checks revision; on conflict prints the same `[WARN] …` and returns false → CLI prints
     `错误：无法从快照 {file} 恢复…` + exit 1
   - **full restore** (no `--stage`): the snapshot object is written verbatim (its own `stages`, `reviews`,
     `log`, `pipeline`), with `meta.revision = diskRevision + 1`
   - **selective restore** (`--stage`): base = current disk data; only `stages[stageKey]` is replaced
     (its `status` **re-projected** from the snapshot's `phase` via `mapPhaseToStageStatus`); all other
     stages and all other `pipeline` fields untouched; `pipeline.current` is synchronised **only if** the
     current disk stage normalises to `stageKey` **and** the snapshot's current stage also normalises to
     `stageKey` (then `{stage: stageKey, op: snapshot.pipeline.current.op ?? ''}`)
   - writes with `backup: true` (so `flow.json.bak` = the pre-restore file), then reloads
4. success → `✓ 已从快照 {file} 恢复 flow.json（当前文件已备份为 flow.json.bak）`

Restoring an op whose registration no longer exists in `flow.json` is therefore possible in full mode, and
restoring a stage that exists only in the snapshot is possible in selective mode (the stage subtree is
inserted).

---

## 6. Retry semantics

Three independent counters. Getting their ownership right is the most commonly missed part.

| Counter | Location | Incremented by | Reset by | Meaning |
| --- | --- | --- | --- | --- |
| `op.attempts` | `flow.json` `stages[s].ops[o].attempts` | `recordAttempt` (`+= 1` on every recorded attempt, pass or fail) | **nothing** — never reset | Per-op lifetime attempt count. Compared against `max_attempts`. |
| `op.max_attempts` | same | nothing | nothing | Fixed at `3` at creation; no CLI flag, no config key. |
| `op.checkpoints.exec.attempts` | same | **nothing** | nothing | Reserved field; always `0`. |
| `pipeline.retry` | `flow.json` `pipeline.retry` | `recordAttempt` on fail (`+= 1`) | `recordAttempt` on pass (`= 0`); legacy `advancePhase` when the op pointer moves to a different `(stage, op)` (`= 0`) | Global retry counter, display-only (`flow status`). |

Rules:

- **Exhaustion is not a refusal.** `recordAttempt` has no early guard; an already-`failed` op can be
  attempted again, `attempts` keeps growing past `max_attempts`, and every subsequent `fail` lands in the
  `failed` branch again. A later `pass` still moves it to `done`.
- The only "exhausted" reporting is `flow retry`:
  ```
  openfeel flow retry --op <stage>.<op>
  ```
  read-only; prints `操作: …` / `状态: {state}` / `当前尝试次数: {attempts} / {max_attempts}` and, when
  `attempts >= max_attempts`, the extra line `⚠ 重试次数已用尽`. Exit 0. Errors: opId without a `.` →
  `opId 格式不正确，应为 stage-xx.op-xxx（如 stage-01.op-001）`; stage missing →
  `错误：未找到阶段 {stage}`; op missing → `错误：未找到操作 {op}`; all exit 1.
- Exhaustion *does* have a side effect inside `flow attempt`: `shouldReplan: true` triggers
  `advancePhase(op, 'scheme_pending')`, which moves the stage's phase back to re-planning (subject to the
  transition table) and resets `pipeline.retry` if the pointer changed.
- `attempted_at` is written on **every** attempt; `completed_at` only when entering `done` or `failed`.
  Both use the same timestamp value within one call (`op.completed_at = op.attempted_at`).

---

## 7. Dependencies (`stages[].deps`)

### 7.1 Meaning

`deps` is a **declarative, human/agent-facing** list of full stage ids this stage depends on. It is
**not** an execution gate.

Exhaustive list of consumers:

| Consumer | Behaviour |
| --- | --- |
| `plan stage add --deps` | write-time validation: every dep must normalise to a registered stage key, **or** be an *archived* dependency; else exit 1 with zero writes |
| `flow stage set --deps` | same validation, then overwrite write |
| `checkRemovable` / `removeStage` | refuses to remove a stage that other stages list in `deps` (unless `--force`) |
| `healthCheck` item 7 `悬空依赖` | warn-only scan; archived deps exempt |
| `overview.md` skeleton | rendered at creation time only |
| `flow overview` output | displays `deps: stage.deps ?? []` |
| `archive` summary | `- **依赖阶段**：{deps.join(', ')}` or `无` |

**Nothing enforces ordering.** `flow advance`, `phase-path` search, `findPhasePath`, and stage selection
never read `deps`. A stage can be advanced to `done` while its declared dependencies are untouched.
**No cycle detection exists for stage `deps`** — self-references and A↔B cycles are accepted silently by
both write paths and by health.

### 7.2 Write-time validation (`plan stage add`, `flow stage set`)

```
registered = Object.keys(flow.json.stages)                    // as-is, un-normalised
known      = new Set(registered.map(k => normalizeStageId(k) ?? k))
for each d in input deps:
    if known.has(normalizeStageId(d) ?? d)                    → OK (registered wins)
    else if isArchivedVersionOf(d, meta.archived_versions)    → OK, but prints an info line
    else                                                      → invalid
```

- `isArchivedVersionOf` requires the **raw input** to carry an explicit version prefix *and* that version
  to be in `meta.archived_versions`. Short names are **always false** (they normalise to the default
  `v1.0.0`, which must not be inferred as archived). This is why the raw `d` is passed, never the
  normalised value.
- Archived-but-OK deps print `依赖已归档（视为已满足）：{deps}` and are stored verbatim.
- If `flow.json` is absent, `registered` is `[]`, so **any** non-empty `--deps` is invalid.
- `plan stage add` failure message: `依赖阶段不存在：{deps}（已注册阶段：{known}）` + exit 1, **zero writes**
  (not even the directory).
- `flow stage set` failure message: `依赖校验失败：以下阶段不存在 {deps}` + exit 1, zero writes.
- **`flow stage set` without `--deps` clears the list** (empty array is a legal, validated value).
- Order of gates in `plan stage add`: stage-id validity → `--exec-mode` domain → `--auto-advance` domain →
  `--workflow-mode` domain → `--workflow-mode !== 'general'` → deps validation → write.

### 7.3 Reading rules (`healthCheck` item 7)

`known` is the normalised set of registered stage keys. For each dep `d`: skip if normalised `d` is
known; skip if `isArchivedVersionOf(d, archived_versions)`; otherwise record `"{stageId} → {d}"`.
Result is a single item:

- dangling → `status: 'warn'`, `检出 {n} 条悬空依赖：{first 5 joined by '; '}` (+ ` …` if more)
- clean → `status: 'pass'`, `未检测到悬空依赖`

Warning only — never affects `ok`/exit code.

### 7.4 Op-level dependencies

Two historical/present shapes in `ops/deps.yaml` (see §3.6). Neither is validated, ordered, or
cycle-checked by the CLI. The only **machine** dependency graph in the project is the artifact DAG
(§12) and the version-level `plan/{series}/{version}/deps.yaml` `stages:` map consumed by
`healthCheck` item 6.

### 7.5 `healthCheck` item 6 — `deps.yaml` cycle detection

Reads **`.openfeel/plan/deps.yaml`** (project-level; note: **not** the version-level file, and that path
does not exist in this repository, so the check silently returns). When present:

- `buildDepsGraph(root)`: for each entry whose value is an object → `graph[key] = node.deps.map(String)`
  if `node.deps` is an array, else `graph[key] = [node.depends_on]` if `depends_on` is a **string**
  (a `depends_on` **array**, as used by `stage-33/deps.yaml`, is therefore ignored)
- if the document has a `stages:` object, the graph is built from `stages`; otherwise from the root
- DFS three-colour cycle detection; references to unknown nodes are skipped (legal)
- a cycle → one `status: 'fail'` item per cycle: `循环依赖检测: {a → b → a}` (**this is the only
  dependency-related way to make `flow health` fail**)
- no cycle → `status: 'pass'`, `无循环依赖 ({n} 个节点)`; empty graph → `无依赖声明，无环`

---

## 8. Orphan reconciliation

### 8.1 The reconciliation function

`findOrphanOps(projectPath) → { keyOrphans: OrphanOp[]; fileOrphans: OrphanOp[] }` where
`OrphanOp = { stage: string; opId: string }`.

Algorithm (`reconcileOrphans`, the single implementation shared by `repair` and `health`):

```
for each (stageId, stage) in flow.json.stages:
    if parseStageId(stageId) === null:  continue        # non-standard key → skip, no false positives
    keys    = Object.keys(stage.ops ?? {})
    opsDir  = .openfeel/plan/{series}/{stageDir}/ops
    fileIds = { name.match(/^(op-\d+)/)[1] for name in readdirSync(opsDir) }   # Set, includes op-NNN-*.md
    keyOrphans  += [ {stageId, key}   for key in keys    if key not in fileIds ]
    fileOrphans += [ {stageId, fileId} for fileId in fileIds if fileId not in keys ]
```

- Both `op-NNN.md` and legacy `op-NNN_{title}.md` count as "file exists" — this is why
  `hasOpTemplateFile` / `readOpTemplate` / `findOpFileInDir` each try `f === '{op}.md' || f.startsWith('{op}_')`.
- `op-NNN-{suffix}.md` files (real example `op-001-verdict.md`) match the `/^(op-\d+)/` scan and therefore
  register as the same `op-001` id in the file-id set; they are *not* usable as templates.
- Missing `flow.json` or unparsable JSON → both lists empty (never throws).
- Read-side `load()` normalisation (`ops: {}`, `deps: []`) means a damaged stage record yields
  file orphans rather than a crash.

**Real state of this repository:** every `v1.2.1-stage-86 … -94` stage has `"ops": {}` while its `ops/`
directory holds 3–4 `op-*.md` files → those stages are pure file-orphan producers (e.g. `stage-92`:
`op-001..op-004`). `v1.2.0-stage-78 … -85` are the only stages with registered ops. This is expected
data, not corruption: `plan scheme register` was never run for the v1.2.1 stages.

### 8.2 Key orphans — repair command

```
openfeel flow repair [--dry-run] [--backup] [--prune-orphans]
```

- `--backup` (before repair): copies `flow.json` → `flow.json.bak`, prints `已备份: flow.json.bak`
  (or `flow.json 不存在，无需备份`)
- `--prune-orphans` **and not** `--dry-run`: deletes only `keyOrphans` from the in-memory document, appends
  a `prune_orphan_ops` log entry `{count, ops: ["{stage}.{opId}", …]}` (agent `cli`) and records the change
  `已清理 {n} 个键孤儿（文件未删除）`. **Files are never deleted.**
- `fileOrphans` are **never** auto-removed, under any flag:
  `按裁定不提供自动清理（避免误删历史源码）；请人工确认后处理`
- Reporting (always, regardless of flags) — emitted only when at least one list is non-empty:
  ```
  (blank line)
  孤儿 op 对账：
    键孤儿（有注册无文件）：{items}          # keyOrphans only, joined by ", "
  文件孤儿（有文件无注册）： {n}             # fileOrphans count (note the space after the colon)
    文件孤儿（有文件无注册）：{first 5 joined by ", "}{' …' if more}
  按裁定不提供自动清理（避免误删历史源码）；请人工确认后处理
  ```
  and, when pruning actually ran, `已清理 {n} 个键孤儿（文件未删除）`
- `RepairResult.orphans` is **undefined** whenever `repair` takes an early-return path (flow.json
  missing/recreated, unreadable, unparsable-and-rebuilt), so the orphan report is skipped in those cases
  even though a reconciliation would have found entries.
- Repair never touches `op.state`, and bumps `meta.revision` by 1 on write (`recovered` cases write with
  `backup: false`, so the corrupted file is not copied over a good `.bak`).

### 8.3 File orphans — the repair command is `plan scheme register`

```
openfeel plan scheme register <stage> [opId] [--dry-run]
```

- no `opId` → register every file orphan of that stage, sorted ascending
- with `opId` → only that one:
  - already registered → `noop` → `{opId} 已注册，无需补注册` (exit 0)
  - no matching file (or the file name is not `op-\d+`) → `skipped` → CLI prints
    `未找到：阶段 {stage} 或操作方案 {opId}` + **exit 1**
- registration writes the §2.4 literal, taking `title` from `extractTitle` (content first line →
  legacy filename → bare filename), logs `register_op`, `save()` once at the end
- `--dry-run` computes the same result with **zero writes** (revision unchanged)
- output: `已补注册 {count} 个操作方案：{ops}（阶段 {stage}）` / `[DRY-RUN] 将补注册 …` /
  `阶段 {stage} 无待补注册的操作方案`
- stage not present in `flow.json` (`ok === false`) → `未找到：阶段 {stage} 或操作方案 {opId}` + exit 1

### 8.4 Health item 8

`healthCheck` adds **one** item when either list is non-empty:

```
section: '孤儿操作方案'   (flow.health.orphanOps)
status:  'warn'
message: '键孤儿 {n} 个、文件孤儿 {m} 个；运行 flow repair 查看详情（按裁定不提供自动清理）'
         + ' [{stage}.{opId}; …(first 5, " …" if more)]'   # only when n > 0
```

When both lists are empty **no item is emitted at all** (output stays terse). `warn` never affects
`ok`/exit code; `--fix` never repairs orphans.

---

## 9. Stage lifecycle commands

There are **five** distinct entry points; they differ in what they write.

| Command | Directory + skeletons | `flow.json` registration | Deps validated | `workflow_mode` written |
| --- | --- | --- | --- | --- |
| `plan stage add <name>` | **yes** (`ensureStageSkeleton`, idempotent) | yes (`registerStage`) | yes | yes — **only if the key was new** |
| `flow stage add <stageId>` | no | yes (`addStage`) | no (`deps: []`) | no |
| `stage create <stageId>` | no | yes (`addStage`) | no | no (TTY-only deprecation notice on stderr) |
| `plan scheme create <stage> <title>` | yes, implicitly, **only if the stage was unregistered** | yes, implicitly | no | no |
| `plan scheme create --from-tasks` | via per-task `createScheme` | via `createScheme` | no | no |

### 9.1 `plan stage add <name> [--deps …] [--tasks …] [--exec-mode …] [--auto-advance …] [--workflow-mode …]`

Full-fidelity creation. Gate order (each failure exits **1** with zero writes):

1. `validateStageId(name)`; invalid → `{input} → 非法阶段 ID（应为 stage-NN 或 vX.Y.Z-stage-NN）` +
   `建议名称：{suggest}`. `suggestStageId` returns `{version}-stage-{NN}` where `NN = max(used)+1`
   padded to 2 digits, over `flow.json` keys **of that series** ∪ `plan/{series}/stage-NN` directories;
   `version` = the input when it *is* a version literal (`/^v\d+(?:\.\d+)*$/`), else `v1.0.0`.
2. `--exec-mode` ∉ `['manual','auto']` → `字段 执行模式 的取值非法：{value}（允许：manual, auto）`
3. `--auto-advance` ∉ `['disabled','enabled']` → same template with `自动推进` / `disabled, enabled`
4. `--workflow-mode` ∉ `['full','fast','general']` → same template with `工作流模式`
5. `--workflow-mode === 'general'` → `general（通用模式）仅限需求级——阶段级 / 部署级不支持；阶段请使用 fast / full。`
   (**checked after** the domain check, so `general` produces this message, not the invalid-value one)
6. deps validation (§7.2) → `依赖阶段不存在：{deps}（已注册阶段：{known}）`
7. `addStage(projectPath, name, deps?, tasks?, overrides?)`:
   - `ensureStageSkeleton` — creates the directory, `overview.md`, `status.md` **only when absent**
     (existing files are never overwritten, so a re-run cannot clobber content; the return value
     `created` says whether anything was written)
   - if `flow.json` is loaded: `existed = !!stages[fullStageId]`; `registerStage(fullStageId, deps ?? [])`;
     if `!existed` set `stages[fullStageId].workflow_mode = overrides.workflowMode ?? resolveStageWorkflowMode(fullStageId).value`;
     `save()`
   - **Because `registerStage` is idempotent and returns early on an existing key, re-running
     `plan stage add` on an existing stage does NOT update `deps`.** Use `flow stage set --deps`.
8. `StageDirConflictError` → `阶段目录冲突：{stage} 与 {other} 映射同一目录` + exit 1 (§10).
   Concurrency conflict → exit **2**.
9. success → `已创建阶段: {name}`

`--deps` / `--tasks` accept both space-separated and comma-separated values (each token is split again on
the single character `,`, then trimmed, empties dropped).

**Uninitialised project:** `plan stage add` does **not** require `flow.json`. `ensureStageSkeleton` still
creates the directory and both skeletons (falling back to `resolveConfigDefaults` for the initial field
values), the registration block is skipped, and the command exits 0 with `已创建阶段: {name}`. The stage
therefore exists on disk but not in `flow.json` until `flow stage add` / `plan scheme register` is run.

### 9.2 `flow stage add <stageId>` / `stage create <stageId>`

Registration only — no directory, no skeletons. `stage create` prints the deprecation notice

```
[deprecated] `openfeel stage create` 已弃用；请改用 `openfeel flow stage add <stageId>`（仅注册）或 `openfeel plan stage add <name>`（完整入口）
```

on **stderr**, and only when `process.stdout.isTTY` (silent in CI / piped output). Both:
`validateStageId` → `mgr.addStage(stageId)` → `save()`. `addStage` also sets
`pipeline.current = {stage: stageId, op: ''}`. Success: `✓ 已创建阶段: {stage} → plan_pending`.
Errors funnel through `handleAddStageError`: concurrency → exit 2; dir conflict → exit 1; else generic.
Both require `flow.json` to be loadable; otherwise `流水线未初始化（flow.json 不存在）` + exit 1.

### 9.3 `stage set <stageId> [--status] [--exec-mode] [--auto-advance] [--workflow-mode] [--review-agent]`

Manipulates **status.md fields only** (`flow.json` is touched only for the `workflow_mode` redundancy).

- missing `status.md` (3-level `findStageStatusPath`) → `错误：未找到阶段 "{stageId}" 的 status.md 文件` +
  `请确认阶段 ID 是否正确（如 v4-stage-04）` + exit 1
- no option at all → `请至少提供一个字段选项（--status/--exec-mode/--auto-advance/--workflow-mode/--review-agent）` + exit 1
- **fixed write order**: `状态` → `执行模式` → `自动推进` → `工作流模式` → `当前责任 Agent`
- value domains: `状态` ∈ `STAGE_STATUS_VALUES`; `执行模式` ∈ `{manual, auto}`; `自动推进` ∈
  `{enabled, disabled}`; `工作流模式` ∈ `{full, fast, general}`; `--review-agent` must be non-empty after trim
- `--workflow-mode general` → `general（通用模式）仅限需求级——阶段级 / 部署级不支持；阶段请使用 fast / full。`
  + exit 1 **before** any write (**this is the per-stage "general is illegal" rule**; `fast`/`full` are the
  only legal per-stage values). Note the check is on the literal string `'general'`, so a bogus value
  instead reaches the domain check and yields `字段 工作流模式 的取值非法：…`
- any domain violation → `字段 {field} 的取值非法：{value}（允许：{a} / {b}）` (**separator is `' / '` here**,
  unlike `plan stage add`, which joins with `', '`) + exit 1, zero writes
  (validation of **all** jobs happens before **any** write)
- per-field write protocol: **probe first, then write**
  - `not-found` → for `工作流模式` only, switch to *insert* semantics:
    field already present (race) → `backup` + replace; anchor found (`自动推进` line, else `执行模式` line)
    → insert `- **工作流模式**：{value}` immediately after the anchor, preserving the anchor line's EOL,
    then `backup` + write, print `✓ 已在 {stageId} 的 status.md 插入「{field}」字段：{value}`;
    no anchor → `{stageId}：status.md 缺少「{field}」插入锚点（「自动推进」/「执行模式」行均缺失），未写入` + exit 1
  - `not-found` for any other field → `错误：在 {stageId} 的 status.md 中未找到「{field}」字段` + exit 1
  - `unchanged` → `字段 {field} 已是目标值，未做变更` (exit 0, **no `.bak` produced**)
  - `will-change` → `backup` then surgical replace, print `✓ 已更新 {stageId} {field}: → {value}`
- if a later job fails after earlier successes → `已写入：{done}；失败于：{field}` then the specific error, exit 1
- `工作流模式` success additionally calls `syncWorkflowModeRedundancy`: if the stage is registered, set
  `stages[key].workflow_mode = value` and `save()` (unregistered stages are skipped silently)
- **contradiction to preserve:** `stage set --status` writes status.md only, while `flow advance` writes
  `flow.json.stages[].status` only. The two can diverge; `flow health` item 2 reports the divergence as a
  warn and `flow health --fix` realigns **status.md ← flow.json** (`reconcileStatusMd`).

### 9.4 `stage task <stageId> [taskNo] --done|--undone` / `--add <desc>`

- `--add` with `--done`/`--undone` → `错误：--add 与 --done/--undone 互斥` + exit 1
- `--add` alone → `appendStatusTask` (§3.3) → `已追加任务 {no}：{desc}`; `TASK_SECTION_MISSING` →
  `status.md 缺少任务小节，请先运行 openfeel plan stage add 生成骨架` + exit 1
- neither `--add` nor a `taskNo` → `请提供任务编号或使用 --add "<描述>"` + exit 1
- `--done === --undone` → `错误：必须指定 --done 或 --undone（二者互斥）` + exit 1
- non-integer or `< 1` task number → `错误：任务编号必须为正整数` + exit 1
- checkbox toggle: `backup` first, then regex `^(- \[)([ x])(\] 任务{N}[：:].*)$` (multiline, global);
  no match → `错误：在 {stageId} 的 status.md 中未找到「任务{N}」` + exit 1
- success: `✓ 已勾选 {stageId} 任务{N}` / `○ 已取消勾选 {stageId} 任务{N}` (exit 0, idempotent)

### 9.5 `flow stage set <stageId> [--deps …]`

Deps-only overwrite. Gate order: `validateStageId` → manager loaded → normalised deps → §7.2 validation
(`依赖校验失败：以下阶段不存在 {deps}`) → target must exist (`{input} → 非法阶段 ID（…）`) → `setStageDeps`
(log `stage_deps_set`, `save()`). Success: `已更新阶段 {stage} 的依赖：{deps}` or `…：无`.
**Omitting `--deps` clears the list.** Concurrency → exit 2.

### 9.6 `flow stage remove <stageId> [--force] [--dry-run] [--purge]`

`checkRemovable` (read-only), evaluated in this order:

1. ops non-empty → `阶段 '{stage}' 仍有 {opCount} 个未归档的 op；如需强制移除此阶段，请加 --force`
2. `pipeline.current.stage === stage` → `阶段 '{stage}' 是当前活跃阶段；如需强制移除，请加 --force（将自动回退 current）`
3. other stages reference it in `deps` → `阶段 '{stage}' 被其它阶段依赖：{list}；如需强制移除（将产生悬空依赖），请加 --force`

`--force` skips all three (still reporting `opCount` / `isCurrent` / `referencing`).

Command flow:

- stage not registered → `阶段不存在：{stage}` + exit 1 (checked before `--dry-run`)
- `--dry-run` → prints the block
  ```
  ─── Dry-run 预览 ───
    阶段: {stage}
    ops: {opCount}
    current: {current}{ ' ←' if isCurrent }
    引用者 (deps): {list | 无}
  ```
  then, if `!ok`, the reason via the generic error template + exit 1; else
  `✓ 预期可移除（未写盘）；去掉 --dry-run 正式执行` (exit 0)
- `--purge`:
  - non-TTY **and** no `--force` → `删除目录需交互确认；非 TTY 环境请显式加 --force` + exit 1
  - TTY **and** no `--force` → interactive confirm (default **no**); declined → `已取消`, exit 0
- transaction order (**important**): `removeStage` mutates memory (deregisters the stage, computes
  `purgeTarget` **without deleting**) → `save()` → only then `rmSync(purgeTarget, {recursive:true, force:true})`.
  A failed `save()` therefore never leaves a deleted directory behind a live registration.
- `removeStage` side effects:
  - `delete stages[stageKey]`
  - if `pipeline.current.stage === stageKey`: fall back to the **first remaining key in insertion order
    whose `phase !== 'done'`** (with `op` = its first `pending`/`executing` op, else `''`); if none exist
    → `pipeline.current = {stage: '', op: ''}`
  - **dangling references are NOT cleaned up** — other stages keep the removed id in `deps`
  - log `remove_stage` with `{stageId, purgeTarget, referencing, snapshot:{phase, status, deps, opKeys}}`
- messages: `✓ 已移除阶段: {stage}`, plus `✓ 已删除对应 plan 目录` when purged

### 9.7 `flow stage reset <stageId> --to <phase> [--dry-run]`

Deliberate phase rewind/forward, **bypassing the transition table** (any legal `PipelinePhase` is
accepted), but not the `done` gate.

- `--to` is a `requiredOption`
- `to` not in `PIPELINE_PHASES` → `非法 phase '{to}'` (**no fuzzy correction**, unlike `advance`) + exit 1
- `to === 'done'` reuses the blocking-REV gate:
  `无法复位到 done：存在 {n} 个未解决的阻塞 REV：\n  {id}: {title} (priority={priority})` + exit 1.
  `--force` does **not** exist on `reset`, so it cannot be bypassed at all.
- idempotence: `changed = (from !== to) || (status !== projectedStatus)`; when unchanged → prints
  `阶段 {stage} 已处于 {phase}，无需复位` (exit 0) and writes nothing
- `--dry-run` → `─── 复位预览（未写盘）───` + `  {stage}: {from} → {to}（status → {status}）`; never writes,
  never requires confirmation
- on write: `phase = to`; `status = mapPhaseToStageStatus(to, oldStatus)`; log `reset_stage_phase`
  `{stageName, from, to, session_id, resumed?}` (agent `flow-manager`); `syncRequirementStatus`;
  `syncCurrentOp` **only if** `pipeline.current.stage` normalises to this stage; `pipeline.phase`
  recomputed (`allDone && stages.length>0 ? 'done' : 'active'`)
- **`reset` does not write a checkpoint snapshot** and **does not trigger the archive git commit**
- success: `✓ 已复位阶段 {stage}: {from} → {to}`; concurrency → exit 2

### 9.8 `stage status [stageId]`

Read-only. Without an argument it globs `plan/**/status.md`, derives the id by reverse-mapping the
directory name (`planDirToStageId`, which prefers `pipeline.current.stage` among matches, else the
lexicographically greatest version prefix), and prints
`发现 {n} 个阶段` then `  {icon} {stageId}  →  {status}` where the icon is `✅` done / `🔧 coding` /
`📋 planned` / two spaces otherwise, then a hint line. Empty → `未发现任何阶段（.openfeel/plan/ 中无 status.md 文件）`.
With an argument it prints the §3.3 managed-field block plus tasks and a blocking reason
(`阻塞原因: {reason}`, suppressed for `无`/empty). Missing stage → `错误：未找到阶段 "{stageId}" 的 status.md 文件`
+ `请确认阶段 ID 是否正确（如 v4-stage-04）` + exit 1.

---

## 10. `StageDirConflictError`

### 10.1 Definition

```ts
export class StageDirConflictError extends Error {
  readonly stage: string;   // the id being registered
  readonly other: string;   // the already-registered id occupying the same (series, stageDir)
  constructor(stage: string, other: string) {
    super(`阶段目录冲突：'${stage}' 与 '${other}' 映射同一 (series, stageDir)，请改用其它 stage-NN`);
    this.name = 'StageDirConflictError';
  }
}
```

### 10.2 When it fires

The condition is **`parseStageId(a).series === parseStageId(b).series && .stageDir === .stageDir` for two
*different* keys** — i.e. two distinct full ids that map to the same directory. Canonical example:

```
flow.json already has  "v4-stage-04"      → .openfeel/plan/v4/stage-04/
now registering        "v4.0.0-stage-04"  → .openfeel/plan/v4/stage-04/   ⇒ conflict
```

Both ids are individually *valid*; only the collision is illegal. Detection is
`findStageDirConflict(projectPath, stageId)`, which reads `flow.json` from disk and returns the first
(other) colliding key, or `null` when there is no conflict, the input is unparseable, `flow.json` is
missing, or `flow.json` is unreadable (never blocks on IO failure).

Thrown from exactly two places:

| Thrower | Reached from |
| --- | --- |
| `FlowManager.registerStage` | `plan stage add` (via `addStage` in `plan/stage.ts`) |
| `FlowManager.addStage` | `flow stage add`, `stage create` |

`registerStage` returns early on an **existing** key, so re-registering the same id never conflicts.
`createScheme`'s implicit registration does **not** throw — it warns and skips (§2.5), leaving the op
file as a file orphan.

### 10.3 Rendering and remedy

The CLI does not print `err.message`; it matches the error *type* and renders the i18n template:

```
阶段目录冲突：{stage} 与 {other} 映射同一目录
```

then `process.exit(1)`. (`plan stage add` interpolates `err.stage` / `err.other` directly; `flow stage
add` and `stage create` go through `handleAddStageError`, same text.) Concurrency conflicts in the same
code paths exit **2** instead.

**Remedy:** use a different `stage-NN` (`suggestStageId` proposes the next free number for the series),
or reference the stage by the id already registered (`v4-stage-04`, not `v4.0.0-stage-04`). There is no
merge/rename command: the two ids are not reconcilable, because the directory is derived from
`(series, stageDir)` and carries no version prefix.

### 10.4 Two non-conflicts that look like conflicts

Both are legitimate and must **not** raise the error:

| Case | Why it is fine |
| --- | --- |
| Directory already exists on disk, but no `flow.json` key maps to it | Conflict detection reads only `flow.json` keys; an unregistered directory is not an occupant. `ensureStageSkeleton` is idempotent and simply reuses it. |
| `stage-05` vs `stage-005` | `parseStageId` preserves the captured digits verbatim (no `parseInt`), so `stageDir` differs (`stage-05` ≠ `stage-005`) and the paths differ. Two *different* directories, no error — even though a human considers them the same stage. |

Conversely, `v1.0.0-stage-05` and `v1.0.1-stage-05` **do** conflict: both normalise to
`series = 'v1'`, `stageDir = 'stage-05'`, hence the same directory `plan/v1/stage-05/`. The version
prefix is not part of the directory, which is precisely why two ids can collide.

---

## 11. Cross-cutting invariants and the traps most likely to be missed

1. **`op.id` is not persisted.** It is injected on load and stripped on save. Writing it changes the file.
2. **`ops` map keys are local (`op-001`), stage keys are full (`v1.2.1-stage-92`).** Global op reference
   is `"{stageId}.{opId}"`; `parseOpId` splits on the **last** `.` so version dots do not confuse it.
3. **`executing` is declared but unreachable.** Recognised by every predicate, written by none.
4. **`attempts` is never reset; `max_attempts` is never configurable; `checkpoints.exec.attempts` is
   never incremented.** Exhaustion is reported, not refused.
5. **`recordAttempt` loses `syncCurrentOp` in the exhausted branch.** After the final failure the pointer
   keeps aiming at the now-`failed` op until something else triggers a sync (`advancePhase('scheme_pending')`
   from `flow attempt`, or the next `advanceStagePhase`). Reproduce deliberately or fix deliberately.
6. **`flow attempt --result pass` on a nonexistent op prints a success message and exits 0.**
7. **`更新时间` in `status.md` is UTC** (derived from `toISOString()`), minute precision, no `Z`.
   `stats.start_time` / `attempted_at` / `completed_at` are full UTC ISO strings with `Z`.
8. **`plan stage add` is not an upsert.** For an existing stage it silently ignores `--deps` and never
   rewrites `overview.md` / `status.md` / `workflow_mode`.
9. **`--draft` writes `- **状态**：pending` into the op file while `flow.json` says `draft`.**
10. **Reset and advance differ in two ways that look like bugs:** `advance` fuzzy-corrects an illegal
    phase and snapshots a checkpoint; `reset` rejects an illegal phase outright and writes no snapshot.
11. **`stage set` writes `status.md`; `flow advance` writes `flow.json.stages[].status`.** They are
    independent; `flow health` reports divergence and `flow health --fix` syncs only the `状态` field,
    only status.md ← flow.json, never the reverse.
12. **`plan stage list` lists version sub-directories as if they were stages** (§3.1 hazard).
13. **`flow ops list --stage <short>` only works for `v1.0.0-*` stages**: the filter compares the strict
    normalised id (`stage-92` → `v1.0.0-stage-92`), with no double-key fallback, so `v1.2.1-stage-92`
    is not matched.
14. **`deps` never gates anything.** No ordering, no cycle detection, no completeness check before
    `done`; only dangling-reference validation at write time and warn-only reporting afterwards.
15. **`flow health` can fail (`fail`, non-zero exit) only via** invalid `pipeline.phase`, a `current`
    pointing at a missing stage/op, an illegal `stage.phase`, a `config.yaml` / `pipeline.yaml` parse or
    schema error, or a `deps.yaml` cycle. Everything stage/op-lifecycle related is `warn`.
16. **Checkpoint retention is 20 per stage, enforced by filename sort, best-effort** — and snapshot
    writes are entirely swallowed on failure, so a missing snapshot is never an error.
17. **`restore` re-projects `status` from the snapshot's `phase`** in selective mode (and re-bases
    `meta.revision` to `diskRevision + 1` in both modes), so a restored stage never carries an
    inconsistent `status`.

---

## 12. Appendix — the artifact model (separate; not stage/op)

For completeness, since `src/core/artifact-graph/*` lives next to the plan code but is a distinct model.

```ts
// src/core/schema.ts
const DependencySchema = z.object({
  artifact: z.string(),
  type: z.enum(['hard', 'soft']).default('hard'),
  description: z.string().optional(),
});
const ArtifactSchema = z.object({
  id: z.string(),
  description: z.string().optional(),
  generates: z.string(),                       // glob of the produced file(s)
  template: z.string().optional(),
  requires: z.array(DependencySchema).default([]),
  dependsOn: z.array(z.string()).default([]),  // shorthand, always hard
  instruction: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
const SchemaSchema = z.object({
  name: z.string(),
  version: z.string().default('1.0'),
  description: z.string().optional(),
  artifacts: z.array(ArtifactSchema),
}).superRefine(/* duplicate artifact id → issue */);
```

- `collectHardDeps(artifact)` = `dependsOn` (all hard) ∪ `requires` where `type !== 'soft'`, de-duplicated
- `new ArtifactGraph(schema)` throws
  `Artifact "{id}" 依赖了不存在的 artifact "{dep}"` for an unknown dependency target (**constructor-time**)
- `getBuildOrder()` = Kahn BFS with a lexicographically sorted queue for stable output; if not all nodes
  are emitted it throws `检测到循环依赖，以下 artifact 陷入循环：{remaining}` (comma-joined)
- `getNextArtifacts(completed)` = artifacts whose hard deps ⊆ `completed`, ordered by build order;
  `getBlocked(completed)` returns `{blocked:[{artifactId, missingDeps, description?}], ready, completed, total, done}`;
  `isComplete(completed)` is **vacuously true for an empty schema**
- `detectCompletedArtifacts(schema, basePath)` = fast-glob each `generates` pattern; any hit ⇒ completed
- `resolveSchema(name, projectPath)` search order: `.openfeel/schemas/{name}/schema.yaml` →
  `~/.openfeel/schemas/{name}/schema.yaml` → `node_modules/openfeel/schemas/{name}/schema.yaml`;
  otherwise throws `找不到 Schema "{name}": 已搜索路径 {paths}`
- No CLI command in this repository consumes `ArtifactGraph`; the stage/op layer never reads `schemas/`.
