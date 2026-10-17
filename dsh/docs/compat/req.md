# `openfeel req` — Requirement Distribution System — Behavioral Specification

Compatibility specification for a reimplementation of the requirement layer (7 statuses, lifecycle,
claim protocol, split, advance, aggregation, board) of the OpenFeel TypeScript CLI.

**Source of truth (read-only analysis of `C:\Users\Liuary\Dev\Mine\AI\OpenFeel`):**

| Concern | File |
|---|---|
| Status/priority/ID value domains, `RequirementData` | `src/core/req/types.ts` |
| All mutations + ID allocation + transition table + whitelist | `src/core/req/requirement-ops.ts` |
| Progress projection + symmetric write-back + health items | `src/core/req/aggregate.ts` |
| Body markdown file (path + skeleton) | `src/core/req/body-file.ts` |
| CLI surface (11 subcommands, output, `--json`) | `src/commands/req.ts` |
| `requirement_id` on stage, `FlowData`, mode resolution, aggregate triggers | `src/core/flow-manager.ts` |
| `WORKFLOW_MODES` | `src/core/config.ts` (line 27) |
| `PIPELINE_PHASES` (15 phases) | `src/core/pipeline-schema.ts` (line 14) |
| Stage-ID normalization | `src/core/plan/path.ts` (`normalizeStageId`) |
| Owner default chain | `src/core/workspace/identity.ts` (`getUserName`) |
| Message strings | `src/core/i18n-data/zh-CN.ts` lines 1081–1159, `src/core/i18n-data/en.ts` lines 1037–1114 |
| Authoritative usage doc | `src/core/templates-data/skills/openfeel-req/SKILL.md` |
| Behavioral evidence | `test/core/req.test.ts`, `test/commands/req.test.ts` (T-A1…T-E4, T90-REQ-*, T93.*) |

**Architectural invariants a reimplementation must preserve**

1. **Zero business logic in the command layer.** `src/commands/req.ts` only parses args, calls one engine
   primitive, maps an error code to a message, and sets an exit code. All validation, ID allocation,
   transition legality and the `done` gate live in `src/core/req/`.
2. **Engine primitives are pure in-memory.** No primitive writes a file. Persistence is *always* the
   caller's `FlowManager.save()`. This makes "failure ⇒ zero disk change" structural.
3. **Read-side tolerance.** Missing / non-array `requirements` is treated as `[]`; malformed `id` values are
   skipped; out-of-domain `status` values never throw. No `load()` step back-fills `requirements`,
   `parent_id`, or `workflow_mode`.
4. **Single projection direction.** `stage.phase` → `requirement.status`. A requirement status must never
   push stage phases forward.
5. **`workflow_mode` is a *scheduling* attribute.** It gates *carrier legality* (`general` ⇔ zero linked
   stages) and the `done` gate; it never participates in the aggregate projection or drift reconciliation.

---

## 1. Requirement record schema

Stored at `.openfeel/flow.json` → top-level optional array `requirements: RequirementData[]`
(`FlowData.requirements?`, `src/core/flow-manager.ts:132`). It is **not** back-filled at load time.

```ts
interface RequirementData {
  id: string;                              // required
  title: string;                           // required, non-empty (trimmed)
  status: RequirementStatus;               // required
  target_version?: string;                 // optional
  priority?: RequirementPriority;          // optional
  owner?: string;                          // optional
  claimed_at?: string;                     // optional
  created_at: string;                      // required, ISO 8601
  updated_at: string;                      // required, ISO 8601
  body_path?: string;                      // optional
  parent_id?: string;                      // optional
  workflow_mode?: WorkflowMode;            // optional
}
```

| Field | Type | Optional | Semantics | Who writes it |
|---|---|---|---|---|
| `id` | `string` matching `/^REQ-(\d{3,})$/` | no | Immutable. Allocated by `nextRequirementId` (max+1, never recycled). | `add`, `split` |
| `title` | `string` | no | Human-readable summary; always stored trimmed. Empty-after-trim is rejected. | `add` (throws), `split` (error code), `set/update` |
| `status` | `RequirementStatus` (7 values) | no | Coarse explicit status. **New records are always `draft`** (except split children, always `scheduled`). | `add`, `split`, `update`, `advance`, aggregate write-back |
| `target_version` | `string` | yes | Estimated version, e.g. `v1.3.0`. **Never a gate** — does not affect create/claim/link/advance/done. Only used as a `list`/`board` filter and as the primary `next` sort key. Stored trimmed; empty string rejected. | `add`, `set/update` |
| `priority` | `'P0' \| 'P1' \| 'P2'` | yes | Informational only; no ordering/gating use anywhere. | `add`, `set/update` |
| `owner` | `string` | yes | Claimant. Absent = unclaimed. Trimmed on claim. | `claim` (set), `release` (deleted) |
| `claimed_at` | ISO 8601 | yes | **Same batch as `owner`** — set only by `claim`, deleted only by `release`. Never read for gating; displayed by `show` only. No TTL. | `claim`, `release` |
| `created_at` | ISO 8601 | no | Set once at construction. Used as the secondary `next` sort key and in the body skeleton change-log line. | `add`, `split` |
| `updated_at` | ISO 8601 | no | Refreshed **only on an actual change**; single-assignment discipline (see §11). | every mutating op except no-ops |
| `body_path` | `string` (POSIX separators) | yes | `.openfeel/requirements/REQ-NNN.md`. Set by `writeRequirementBodySkeleton`, not by `add`/`split` themselves. | `writeRequirementBodySkeleton` |
| `parent_id` | `string` (`REQ-NNN`) | yes | **Traceability only.** Does not participate in aggregation, the `done` gate, or any cascade. Dangling values are echoed verbatim, never validated on read. | `split` |
| `workflow_mode` | `'full' \| 'fast' \| 'general'` (`WORKFLOW_MODES`) | yes | Scheduling attribute. Resolved once by `FlowManager` onto linked stages. Participates in the *carrier gate* and the `done` gate (general dual path). Not in aggregation / drift. | `add`, `set/update` |

### 1.1 Value domains (single source)

```ts
// src/core/req/types.ts
export const REQ_STATUSES = ['draft','scheduled','in_progress','done','blocked','cancelled','rejected'] as const;
export const REQ_PRIORITIES = ['P0','P1','P2'] as const;
export const REQ_ID_PATTERN = /^REQ-(\d{3,})$/;     // non-global (no lastIndex pollution); m[1] feeds nextRequirementId
// src/core/config.ts
export const WORKFLOW_MODES = ['full','fast','general'] as const;
```

Array **declaration order is behavior**: `board` groups render in exactly this order (note it is *not*
lifecycle order — `done` precedes `blocked`). `list` error messages print `REQ_STATUSES.join(', ')`.

### 1.2 Requirement bodies on disk

Location: `{projectPath}/.openfeel/requirements/{id}.md`. The directory is **not** part of `WORKSPACE_DIRS`;
it is created lazily with idempotent `mkdirSync(..., {recursive:true})`.

Three path helpers (`body-file.ts`) — each a single point, never re-derived elsewhere:

| Function | Returns |
|---|---|
| `getRequirementsDir(projectPath)` | `join(projectPath, '.openfeel', 'requirements')` |
| `getRequirementBodyRelPath(id)` | `` `.openfeel/requirements/${id}.md` `` — **always POSIX `/`** (never `path.join`) |
| `getRequirementBodyPath(projectPath, id)` | `join(getRequirementsDir(projectPath), `${id}.md`)` — native separators |

`writeRequirementBodySkeleton(projectPath, req)`:

1. `mkdirSync(dir, { recursive: true })`.
2. `req.body_path = getRequirementBodyRelPath(req.id)` — **assigned unconditionally**, even on the no-op path,
   so `body_path` is guaranteed consistent. The caller must pass the *same object* returned by
   `addRequirement` / `splitRequirement` (never a shallow copy).
3. If the target file already exists → **return, do not overwrite** (preserves human additions).
4. Otherwise `atomicWriteFileSync(filePath, skeleton)` (backup disabled).
5. Returns the **absolute** file path (this is what the CLI prints).

Skeleton — byte-exact (`\n` line endings, `Array.join('\n')`, exactly one trailing newline):

```
# {id}：{title}

> 本文件为需求正文（人读副本，由 openfeel req 机械铺骨架）。**机读权威恒为 `.openfeel/flow.json` 的 `requirements` 条目**；两者不一致时以 flow.json 为准。下方状态为创建时快照，不追写实时状态。

## 状态

{status}（创建时快照；以 flow.json 为准）

## 摘要

（待补充）

## 目标与验收

（待补充）

## 预估版本

{target_version | （未指定）}

## 父需求

{parent_id | （无）}

## 关联阶段

（以 flow.json 的 `stages[*].requirement_id` 为准；此处可人工补充说明）

## 变更记录

- {created_at} 创建（{id}，初始状态 {status}）
```

Notes: the heading line uses a **full-width colon** `：`; `target_version` renders `（未指定）` when absent
**or** empty string; `status` is a create-time snapshot and is never re-written afterwards
(`req set`/`advance` do not touch the body). The body is a human-readable copy only; `flow.json` is
machine-authoritative.

---

## 2. The 7 statuses — state machine

```ts
// ALLOWED_TRANSITIONS — src/core/req/requirement-ops.ts:231 (the ONLY transition table)
draft:       ['scheduled','blocked','cancelled','rejected']
scheduled:   ['in_progress','blocked','cancelled','rejected']
in_progress: ['done','blocked','cancelled','rejected']
blocked:     ['scheduled','in_progress','cancelled','rejected']
done:        []
cancelled:   []
rejected:    []
```

| from \ to | draft | scheduled | in_progress | done | blocked | cancelled | rejected |
|---|---|---|---|---|---|---|---|
| **draft** | no-op¹ | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ |
| **scheduled** | ❌ | no-op¹ | ✅ | ❌² | ✅ | ✅ | ✅ |
| **in_progress** | ❌ | ❌ | no-op¹ | ✅³ | ✅ | ✅ | ✅ |
| **done** | ❌ | ❌ | ❌ | no-op¹ | ❌ | ❌ | ❌ |
| **blocked** | ❌ | ✅ | ✅ | ❌² | no-op¹ | ✅ | ✅ |
| **cancelled** | ❌ | ❌ | ❌ | ❌ | ❌ | no-op¹ | ❌ |
| **rejected** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | no-op¹ |

¹ `to === from` is **not an error**: `updateRequirement` skips `applyStatusChange` when
`p.status === req.status`, so the result is `{ ok: true, changed: false }` (no `updated_at` refresh, no
audit). CLI prints the no-op message and exits 0.

² Forbidden by the table: `done` is only reachable from `in_progress`. A `scheduled` or `blocked`
requirement must first go to `in_progress`. This is the reason a static-table rejection (not the dedicated
`done` gate message) is produced in that case — see §5.4.

³ Additionally gated by the completion predicate `canCompleteRequirement` (§6.4).

Terminal set (`isTerminalRequirementStatus`): `done`, `cancelled`, `rejected`. **No transition out of a
terminal status exists**, so a requirement could not be reopened via the state machine — only the aggregate
write-back can flip `done → in_progress` (§6.3), and only in response to a stage reset.

### 2.1 Which command performs which transition

| Transition | `req add` | `req split` | `req set --status` | `req advance --to` | aggregate write-back |
|---|---|---|---|---|---|
| (new) → `draft` | ✅ only path | — | — | — | — |
| (new) → `scheduled` | — | ✅ only path (split children) | — | — | — |
| any → `cancelled` / `rejected` | — | — | ✅ | ✅ | — |
| `draft` → `scheduled` | — | — | ✅ | ✅ | — |
| `scheduled` → `in_progress` | — | — | ✅ | ✅ | — |
| `blocked` → `scheduled` / `in_progress` | — | — | ✅ | ✅ | — |
| (`scheduled`\|`in_progress`) → `done` | — | — | ✅ (gated) | ✅ (gated) | ✅ auto (`requirement_auto_done`) |
| `done` → `in_progress` | — | — | ✅⁴ | ✅⁴ | ✅ only (`requirement_auto_reopen`) |
| any non-terminal → `blocked` | — | — | ✅ | ✅ | — |
| same → same | — | — | no-op | no-op | — |

⁴ **`done → in_progress` is forbidden for both `set` and `advance`.** `ALLOWED_TRANSITIONS.done === []`, so
`done` has no outgoing edge at all — `in_progress` appears only as a *target* status, never as a source that
can be re-entered from `done`. The only code path that reopens a completed requirement is the aggregate
write-back (§6.3), which mutates the record directly and bypasses the table by design. A reimplementation
must **not** add `in_progress` to `ALLOWED_TRANSITIONS.done`; doing so lets operators reopen finished work.

Forbidden transitions all fail identically at the engine level — `applyStatusChange` returns `false`, which
`updateRequirement` converts to `{ ok:false, code:'invalid_status' }` **before any field of the record is
mutated** (so a mixed patch such as `{status:'bogus', title:'x'}` changes nothing).

### 2.2 Why these transitions are forbidden

* **Terminal is terminal.** `done`/`cancelled`/`rejected` have empty target lists: a completed or abandoned
  requirement is not resurrected by an operator command. Only stage-driven aggregation may reopen `done`.
* **No `draft → in_progress`/`done`:** publishing (`scheduled`) is an explicit scheduling act; work must be
  visible in the `next` candidate pool before it can be started.
* **No `done → anything`:** closure is a one-way door; the sole exception is the aggregation projection
  observing that the linked stages are no longer all `done`.
* **`blocked → done` forbidden:** unblocking must pass through `scheduled` or `in_progress`, which keeps the
  projection semantics honest (a blocked requirement that is force-completed would otherwise bypass the
  stage aggregate).
* **Nothing returns to `draft`:** `draft` is a construction state only.

---

## 3. The claim protocol

### 3.1 `claimRequirement(data, id, owner)` — `requirement-ops.ts:203`

Evaluation order (**order is behavior; each step is a distinct error code**):

| # | Condition | Result | Disk effect |
|---|---|---|---|
| 1 | `owner.trim() === ''` | `{ ok:false, code:'invalid_field' }` | none |
| 2 | no requirement with `id` | `{ ok:false, code:'not_found' }` | none |
| 3 | `isTerminalRequirementStatus(req.status)` | `{ ok:false, code:'invalid_status' }` | none |
| 4 | `req.owner` set **and** `req.owner !== name` | `{ ok:false, code:'already_claimed' }` | none (zero audit too) |
| 5 | `req.owner === name` | `{ ok:true, changed:false }` | none — **idempotent, no `updated_at` refresh, no audit** |
| 6 | otherwise | `req.owner = name; req.claimed_at = now; req.updated_at = req.claimed_at` (same ISO string); audit `requirement_claim {id, owner}` | caller saves |

Consequences to reproduce exactly:

* Step 3 precedes step 4: claiming someone else's **`done`** requirement yields `invalid_status`
  (`req.claim.terminalTmpl`), not `already_claimed`.
* Step 5 emits *no* log entry and does *not* bump `updated_at`; the CLI returns early **without calling
  `save()`**, so `meta.revision` is unchanged (test T-B3).
* `owner` is stored trimmed.
* `claimed_at` and `updated_at` are the **identical** ISO string (one `new Date()`).

### 3.2 `releaseRequirement(data, id)` — `requirement-ops.ts:219`

| # | Condition | Result |
|---|---|---|
| 1 | no requirement with `id` | `{ ok:false, code:'not_found' }` |
| 2 | `!req.owner` | `{ ok:true, changed:false }` — no-op success: **no `updated_at` refresh, no audit, no save** |
| 3 | otherwise | `delete req.owner; delete req.claimed_at; req.updated_at = now`; audit `requirement_release {id, owner: prevOwner}` |

* **No status gate.** Releasing a claim on a terminal requirement is allowed.
* **No ownership check.** `release` takes no `--owner`; anybody may release anybody's claim. "Light atomic"
  claim protocol: claim is defensive, release is permissive.
* Fields are **deleted**, not set to `null`/`''` (keys disappear from the JSON object).

### 3.3 Concurrency rules — "无 TTL / 无心跳"

* There is **no TTL, no expiry, no heartbeat, no lease renewal**. A stale claim persists forever until an
  explicit `req release`. `claimed_at` is display-only; no code reads it for a gate.
* Atomicity comes solely from `FlowManager.save()`'s optimistic concurrency: `save()` compares the
  in-memory `meta.revision` against the on-disk value; on mismatch it throws
  `FlowConcurrentModificationError(expected, actual)`, the command layer prints
  `common.concurrentConflict` and exits **2**, and **nothing is written**. So two simultaneous
  `req claim` on the same id resolve as "one wins with revision bump, the other exits 2 and retries".
* Because `requirements` is a top-level array in a single `flow.json`, there is no per-requirement lock; the
  whole document is the concurrency unit. That is acceptable for the intended single-machine use.
* The claim gate itself is a *logical* check inside one process's in-memory copy; it is not a mutex.

### 3.4 Who may claim / default owner resolution (command layer only)

`req claim <id> [--owner <name>]`:

1. `isValidReqId(id)` → otherwise `req.invalidIdTmpl`, exit 1, zero write.
2. If `--owner` is absent: `owner = getUserName(process.cwd())`, whose chain is
   `.openfeel/.info.json`'s `user` → `git config user.name` → sentinel `'unknown'`
   (`src/core/workspace/identity.ts:46`).
   If the resolved value is `''` or `'unknown'` → print `req.claim.ownerUnresolvedTmpl`, exit 1, **zero
   write**, and never reach the engine. (A literal `known user named "unknown"` is therefore unusable as an
   implicit owner; pass `--owner unknown` explicitly — the explicit path skips the chain entirely.)
3. Call `claimRequirement`; map by code (see §12).

`req release <id>`: id-format check only; no owner resolution.

---

## 4. `split` — the full algorithm

`splitRequirement(data, parentId, children: Array<{title: string}>)` — `requirement-ops.ts:165`.
Pure in-memory; one audit entry; persistence by the caller.

### 4.1 Gates (fixed order; any failure ⇒ zero change **and zero audit**)

| # | Condition | Result |
|---|---|---|
| 1 | `!Array.isArray(children) \|\| children.length === 0` | `{ ok:false, code:'invalid_field' }` (argument-shape) |
| 2 | no requirement with `parentId` | `{ ok:false, code:'not_found' }` |
| 3 | `isTerminalRequirementStatus(parent.status)` | `{ ok:false, code:'invalid_status' }` (same terminal gate as `claim`/`link`) |
| 4 | any child title, trimmed, is `''` | `{ ok:false, code:'invalid_field' }` |

The child-title validation is **content-aligned with `add` but error-paradigm-aligned with `update`**:
`addRequirement` *throws* on an empty title (programming-error path), while `splitRequirement` returns a
runtime error code (self-contained validation loop). Do not unify these.

CLI `req split <id> --into <t> [--into <t>…] [--json]` adds two command-layer guards **before** the engine:
missing/invalid `id` → `invalid-argument` (json) / `req.invalidIdTmpl`; `--into` count 0 →
`invalid-argument field:"into"` (json) / `req.split.noIntoTmpl`.

### 4.2 Construction (single pass, no fallible statement inside the loop)

```
list  = Array.isArray(data.requirements) ? [...data.requirements] : []
staged = { ...data, requirements: list }        // staged container carries "current max"
now   = new Date().toISOString()
created = []
for each title in titles (already trimmed):
    child = {
      id:         nextRequirementId(staged),    // max+1 over list, which already holds earlier children
      title:      title,
      status:     'scheduled',                  // SPLIT_CHILD_STATUS
      parent_id:  parentId,
      created_at: now,
      updated_at: now,
    }
    list.push(child); created.push(child)
data.requirements = list
appendRequirementLog('requirement_split', { parentId, children: created.map(c => c.id) })  // exactly ONE entry
return { ok: true, children: created }          // the LIVE objects (not shallow copies)
```

* **ID allocation is sequential**: child *N* = (max at entry) + *N*. The `staged` container trick lets
  `nextRequirementId` stay the single derivation point — there is no second parser.
* **All-or-nothing**: children are merged into `data.requirements` only after the whole loop. A partially
  built child is unreachable.
* **`parent_id` records the parent ID and nothing else.** It is traceability: no aggregation, no `done`
  gate, no cascade, no parent status change, no inheritance of fields. A dangling `parent_id` is echoed
  verbatim and never validated on read (`req show` prints it as-is; reconciliation is
  `requirementHealthItems`'s job).
* **Cycle detection is unnecessary and absent**: children always get *new* max+1 IDs and the direction is
  always `child → parent`, so the graph cannot contain a cycle by construction.
* **"拆分即发布" (split = publish)**: `SPLIT_CHILD_STATUS = 'scheduled'`, so children immediately join the
  `req next` candidate pool and can be claimed in parallel — each child has its own ID, own body file, own
  owner, own stage links. This is the whole point of `split` vs. just `add`: no `req advance` step is needed
  to make children workable.
* **What is NOT inherited** (a common reimplementation bug): `target_version`, `priority`, `workflow_mode`,
  `owner`, `claimed_at`, `body_path`, `status`. Children are born with exactly the six keys listed above.
* **Parent has zero side effects**: status unchanged, `updated_at` not refreshed, no field written on the
  parent. Advancing/archiving the parent is an explicit `feel`/operator action.

### 4.3 CLI post-processing for `split`

After `ok:true`, the command writes one body skeleton per child **strictly using the returned live objects**,
collecting the absolute paths. If any body write throws → `failGeneric`, **`save()` is never called** ⇒
`flow.json` unchanged (the already-written `.md` files remain — bodies are not transactional). Then
`saveOrFail` (concurrency → exit 2). Then output.

---

## 5. `advance --to <status>` and `set --status <status>`

`advanceRequirement(data, id, to)` is **literally** `updateRequirement(data, id, { status: to })` — "same
table, same gate, same audit, zero second implementation" (`requirement-ops.ts:345`). Everything below
therefore applies identically to `req set --status`.

### 5.1 `updateRequirement` execution ladder (`requirement-ops.ts:270`)

```
① raw find in data.requirements (NOT via getRequirement — shallow-copy trap)  → miss: not_found
② keys = entries of patch with value !== undefined
③ every key must be in PATCH_WHITELIST                                      → else: invalid_field
④ keys.length === 0 (empty patch / all-undefined)                            → { ok:true, changed:false }
⑤ value validation — ALL dimensions first, no mutation until all pass:
     title         : String(v).trim() !== ''                                  → else invalid_field
     target_version: typeof v === 'string' && v.trim() !== ''                 → else invalid_field
     priority      : REQ_PRIORITIES.includes(v)                               → else invalid_field
     status        : REQ_STATUSES.includes(v)                                 → else invalid_status   ← note the code
     workflow_mode : WORKFLOW_MODES.includes(v)                               → else invalid_field
⑥ carrier gate: if patch.workflow_mode === 'general' AND any linked stage exists
                                                                              → general_mode_conflict
⑦ status dimension: if patch.status !== undefined && patch.status !== req.status:
     applyStatusChange(...) === false                                        → invalid_status
⑧ field dimensions: title / target_version / priority / workflow_mode; assign only when actually different
⑨ updated_at: exactly once — if fields changed and status did not, set now(); if status changed,
              applyStatusChange already did it (no double assignment)
⑩ audit: requirement_status (from applyStatusChange) and/or requirement_update {id, fields:[...]}
return { ok: true, changed: statusChanged || changedFields.length > 0 }
```

### 5.2 `applyStatusChange` — the single status-write implementation

```
if (!REQ_STATUSES.includes(to))                          return false   // invalid_status
if (to === req.status)                                   return false   // caller handles as no-op
allowed = ALLOWED_TRANSITIONS[req.status]
if (!allowed || !allowed.includes(to))                   return false   // out-of-domain current status
                                                                       //   → undefined → same as "not allowed",
                                                                       //     never a TypeError
if (to === 'done' && !canCompleteRequirement(data, req)) return false   // the done gate
req.status = to
req.updated_at = new Date().toISOString()                 // single assignment
audit 'requirement_status' { id, from, to }
return true
```

### 5.3 The `done` gate — `canCompleteRequirement(data, req)` (`requirement-ops.ts:97`)

This is **the** rule. Two paths:

```
canCompleteRequirement(data, req):
    if req.workflow_mode === 'general':
        hasLinked = ∃ stage s in data.stages with (s.requirement_id ?? null) === req.id
        if (!hasLinked) return true                     // PATH 2 — general dual completion path
        // else: general + linked stages = unreachable corrupt state → fall through, NO exemption
    return allLinkedStagesDone(data, req.id)            // PATH 1

allLinkedStagesDone(data, requirementId):
    linked = values of data.stages where (s.requirement_id ?? null) === requirementId
    return linked.length > 0 && linked.every(s => s.phase === 'done')   // empty set guard ⇒ false
```

Exact consequences:

| Situation | Gate result | Reason |
|---|---|---|
| `workflow_mode === 'general'`, **zero** linked stages | **allow `done`** | path 2 (dual carrier completion) |
| `workflow_mode === 'general'`, ≥1 linked stage (corrupt/impossible state) | delegate to path 1 | defence: mode must not buy an exemption |
| any other mode (`full`/`fast`/**absent**), zero linked stages | **deny** | `allLinkedStagesDone` empty-set guard returns `false` |
| any mode, ≥1 linked stage, all `phase === 'done'` | **allow** | path 1 |
| any mode, ≥1 linked stage, any `phase !== 'done'` | **deny** | path 1 |

The predicate source is the requirement's **own `workflow_mode` field, judged directly** — no cascade /
resolution is consulted here. (`FlowManager.resolveStageWorkflowMode` is a *stage-side scheduling* concern and
must not be reused for the `done` gate.)

Note the empty-set guard asymmetry that a reimplementation typically gets wrong: **absent `workflow_mode`
with zero linked stages can never be completed**; to complete such a requirement you must either link a stage
and drive it to `done`, or set `workflow_mode: general` first (`req set --workflow-mode general`, legal
exactly because it has no linked stages) and then `advance --to done`.

### 5.4 Exact refusal messages for `done`

The command layer disambiguates a `done` rejection with a **derived** test, not by inspecting the gate:

```ts
// advance: from = status read before the call (undefined if the requirement is missing)
doneGate = (to === 'done') && from !== undefined && getAllowedNextStatuses(from).includes('done')
// set:    current = getRequirement(data, id)?.status ?? ''
doneGate = (options.status === 'done') && getAllowedNextStatuses(current).includes('done')
```

i.e. "the static table says `done` is a legal target from the current status, yet the engine still refused ⇒
the only remaining cause is the completion gate."

| Current status | Table allows `done`? | Message key | Rendered (zh-CN) |
|---|---|---|---|
| `in_progress` | yes | `req.err.doneGateTmpl` | `{id} 目标状态 done 被拒（当前 {current}）——done 须全部关联阶段 done；零关联阶段的需求可设 general 模式显式完成` |
| `scheduled`, `blocked`, `draft`, terminal | no | `req.err.invalidStatusTmpl` | `{id} 目标状态 {to} 被拒（当前 {current}；合法目标：{targets}）` |

So: `scheduled → done` prints the **generic** message listing the legal targets and **must not** mention the
`done` gate (test T93.8 asserts `err()` does **not** contain `done 须全部关联阶段` and **does** contain
`合法目标：`). Conversely `in_progress → done` with an unfinished stage prints the dedicated gate message and
**must not** say `合法目标：done` (test T-B9).

`targets` = `getAllowedNextStatuses(current).join(', ')` — derived from the engine table (a returned copy;
the command layer must never hold a second transition table). With an out-of-domain stored status,
`targets` is `''`.

### 5.5 Refusal messages for the `general` carrier gate

| Path | Code | Key | Rendered (zh-CN) |
|---|---|---|---|
| `set --workflow-mode general` on a requirement **with** linked stages | `general_mode_conflict` | `req.err.generalModeConflictTmpl` | `{id} 已关联阶段——general（无流水线）仅限无关联阶段的需求（可先解绑阶段，或改走 fast / full）` |
| `link --requirement` of a `general` requirement onto a stage | `general_mode_conflict` | `req.err.generalTargetTmpl` | `{id} 工作流模式为 general（无流水线）——不接受阶段关联` |

The gate is **bidirectional** and both directions are required for the `done` dual path to be sound
(`D-90-4`): `general` ⇔ zero linked stages.

### 5.6 Other `advance` semantics

* `advance` does **not** write the requirement body markdown; `body_path`/`# 状态` stay at the create-time
  snapshot.
* Same-value `advance` → `changed:false` → CLI prints `req.advance.noopTmpl` (`{id} 已是 {to}（no-op）`),
  exit 0, **no save** (revision unchanged).
* `advance` on a terminal requirement with a different target → `invalid_status` (generic message), exit 1,
  zero disk change.
* `advance` never touches stages, never triggers aggregation, never syncs `workflow_mode`.
* Success message: `req.advance.doneTmpl` = `已推进 {id}：{from} → {to}` where `from` is the status read
  **before** the call (a pure read for messaging only).

### 5.7 `set` specifics

* Command-layer "no fields" guard: when **all** of `--status/--title/--target-version/--priority/
  --workflow-mode` are `undefined` → `req.set.noFieldsTmpl`, exit 1 (never reaches the engine, so it is an
  error rather than a no-op). This guard's message lists all five options including `--workflow-mode`.
* Post-save mode propagation (`stage-90 T2.3`), only when `changed === true` **and**
  `--workflow-mode` was supplied:
  ```
  linked = [normalizeStageId(k) ?? k for k in data.stages keys where stage.requirement_id === id]
  if linked.length > 0:
      synced = mgr.syncConfigFieldToStages('workflow_mode', mode, { onlyStages: linked })
      wrote  = count of results in {'updated','inserted'}
      print req.set.modeSyncedTmpl {id, mode, count: wrote}
  ```
  Ordering matters: **save the primary change first, then dispatch**. Zero linked stages → requirement field
  only, no propagation message. `changed === false` (already identical value) → early no-op, no propagation.
* `set` success prints `req.set.doneTmpl` = `已更新 {id}` (after any mode-synced line).
* `set` is the only command that can change `title`/`target_version`/`priority`/`workflow_mode`.

---

## 6. Aggregation — requirements progress from linked stages

Module `src/core/req/aggregate.ts`. Pure functions; all persistence by the caller. `workflow_mode` is
explicitly **excluded** from this module's decisions (it appears nowhere in the projection).

### 6.1 `computeRequirementAggregate(data, requirementId)`

```
linked     = entries of data.stages (in flow.json key order) where (s.requirement_id ?? null) === requirementId
stageIds   = linked keys, in that order
stageCount = stageIds.length
doneCount  = |{ s : s.phase === 'done' }|
anyStarted = ∃ s : s.phase !== 'plan_pending'          // 'plan_pending' is the only "not started" phase
aggregate  = null                                      if stageCount === 0        // empty-set guard
           = allLinkedStagesDone ? 'done'              // DELEGATED, never re-expressed
           : anyStarted ? 'in_progress' : 'scheduled'
return { stageIds, stageCount, doneCount, aggregate }
```

`RequirementAggregateValue = 'scheduled' | 'in_progress' | 'done' | null`.

Key points:

* **`'done'` is decided by delegating to `allLinkedStagesDone`** — a single done predicate; no second
  expression of "all stages done" may exist anywhere.
* `anyStarted` is true for *any* non-`plan_pending` phase, **including `done`** (so a partially-finished
  requirement projects `in_progress`). Of the 15 phases
  (`plan_pending, plan_review, plan_passed, scheme_pending, scheme_review, scheme_passed, exec_running,
  review_pending, review_failed, review_passed, test_pending, test_failed, test_passed, archiving, done`),
  only `plan_pending` counts as not-started.
* **Zero linked stages ⇒ `aggregate = null`**, never `'done'`. A requirement with no stages has *no*
  projection at all — it must not be reported or written as complete by aggregation.
* Stage ordering follows `flow.json` object key order (insertion order); no secondary sort is applied.

### 6.2 `resolveRequirementStatusForStage(data, stageId)`

```
stage = data.stages?.[stageId]; reqId = stage?.requirement_id ?? null
if (!reqId) return null                              // absent stage / no link / '' → zero action
agg = computeRequirementAggregate(data, reqId)
if (agg.aggregate === null) return null               // unreachable defensive guard
return { requirementId: reqId, target: agg.aggregate }
```

### 6.3 `syncRequirementStatus(data, stageId)` — the symmetric write-back (`aggregate.ts:88`)

```
resolved = resolveRequirementStatusForStage(data, stageId)
if (!resolved) return []
req = raw find in data.requirements                  // NOT a shallow copy
if (!req) return []                                  // dangling requirement_id → zero action
if (resolved.target === 'done'):
    if (req.status ∈ AUTO_DONE_PRECONDITION):        // AUTO_DONE_PRECONDITION = ['scheduled','in_progress']
        req.status = 'done'; req.updated_at = now
        audit 'requirement_auto_done' { requirementId, from, to:'done', triggerStage }
        affected.push(req.id)
    // status outside the precondition set → zero action, zero audit
else if (req.status === 'done'):
    req.status = 'in_progress'; req.updated_at = now
    audit 'requirement_auto_reopen' { requirementId, from:'done', to:'in_progress', triggerStage }
    affected.push(req.id)
return affected
```

* **Forward direction**: aggregate `done` ∧ current status ∈ `{scheduled, in_progress}` → `done`.
  `draft`, `blocked`, `cancelled`, `rejected` are **design exemptions** and are never auto-completed (a
  cancelled requirement whose stages all finished stays cancelled; a blocked one stays blocked — this is
  deliberate, so blocking is an effective hold).
* **Reverse direction**: aggregate ≠ `done` ∧ current status === `done` → `in_progress`. It does **not**
  attempt a finer rollback to `scheduled`; `done → in_progress` is the only symmetric undo.
* Anything else (outside precondition set, dangling link, no change) → zero action, zero audit.
* `updated_at` is refreshed only when the status actually flips.
* Status writes go through **raw object mutation**, not the `requirement-ops` path: the table
  (`ALLOWED_TRANSITIONS`) is **bypassed** here, which is exactly how `done → in_progress` becomes possible.
  A reimplementation must not route this through `applyStatusChange`.

**Trigger points** (`FlowManager`), and only these two:

| Trigger | Condition | Location |
|---|---|---|
| `advanceStagePhase` | only when `targetPhase === 'done' && prevStatus !== 'done'`, **after** `endStage(key)` | `flow-manager.ts:1597` |
| `resetStagePhase` | after the phase write commits (not on `dryRun`, not on the changed===false early return) | `flow-manager.ts:1680` |

Both are called inside the same command transaction that already ends with a single `save()` — the
write-back adds **no new persistence point** (same transaction). Neither `req show`, `req board`, `req next`,
`req list`, `run health` nor any read path calls aggregation, so **reading never mutates requirement state**.

### 6.4 `workflow_mode = general` interplay (zero linked stages)

* A `general` requirement has, by the carrier gate, **zero linked stages**, so
  `computeRequirementAggregate` returns `aggregate: null` for it forever.
* `syncRequirementStatus` therefore can never write it: `resolveRequirementStatusForStage` needs a stage with
  `requirement_id` pointing at it, which cannot exist.
* Completion for such a requirement is **explicit only** — `canCompleteRequirement` path 2 returns `true`
  and `advance --to done` / `set --status done` succeed directly (v1.2.1+; before that this was a deadlock).
* Reachability: a `general` requirement cannot be linked (`link → general_mode_conflict`), and a linked
  requirement cannot become `general` (`set --workflow-mode general → general_mode_conflict`). This pair is
  what keeps the dual path sound.

### 6.5 Drift reconciliation (warn-only; `req`-adjacent)

`requirementHealthItems({data, lang})` — used by `flow health`, never by `req`:

1. Section `需求对账` (constant `SECTION_REQ_LINKS`): exactly one item, always emitted. `pass` when no stage's
   `requirement_id` points at a missing requirement (message `flow.health.reqLinksPassTmpl` with `{n}` =
   requirement count); otherwise `warn` with `flow.health.reqDanglingTmpl` (`{items}` = up to 5
   `"{stageId} → {rid}"` pairs joined by `, `).
2. Section `需求漂移` (constant `SECTION_REQ_DRIFT`): emitted **only when non-empty**, `warn`, message
   `flow.health.reqDriftTmpl` (`{items}` = up to 5 requirement IDs). Drift = status ∈
   `AUTO_DONE_PRECONDITION` ∧ `aggregate === 'done'` ∧ status ≠ `done` — i.e. exactly the write-back's own
   precondition set, so the two can never disagree. `draft`/`blocked`/terminal requirements are exempt.
3. **Never produces `fail`** → does not change the exit code and is not part of `--fix`.

---

## 7. ID allocation — `nextRequirementId`

`requirement-ops.ts:67`:

```
max = 0
for r in getRequirements(data):                 // shallow copies; non-array ⇒ [] ⇒ max stays 0
    m = REQ_ID_PATTERN.exec(typeof r?.id === 'string' ? r.id : '')
    if (!m) continue                            // malformed id: skipped, never throws
    n = parseInt(m[1], 10)
    if (Number.isFinite(n) && n > max) max = n
return 'REQ-' + String(max + 1).padStart(3, '0')
```

* **max + 1**, over the numeric capture group of every well-formed `REQ-(\d{3,})` id.
* **Zero-padded to at least 3 digits** — `padStart(3,'0')`, so 1000+ produces `REQ-1000` (no truncation).
* **No recycling**: a deleted/cancelled/rejected requirement's number is never reused while it is present; the
  allocation is purely monotone over the current set. (Consequence: if the highest-numbered requirement is
  *removed* from `flow.json`, its number can be re-issued — the rule is "max+1 of what exists", not a
  persisted counter. There is **no counter field** anywhere.)
* **Allocation happens before insertion**: `addRequirement` computes the id then pushes; `splitRequirement`
  computes each id against a staged container that already includes earlier children.
* Malformed / non-string ids are silently skipped, so a corrupted document cannot crash allocation.
* Non-array `requirements` is treated as `[]` → next id is `REQ-001`.
* Uniqueness is not re-checked after derivation; the parser's digit-count equivalence (`REQ-0001` and
  `REQ-001` both → 1) means mixed-padding legacy data still cannot collide with `max+1`.

---

## 8. `PATCH_WHITELIST`

`requirement-ops.ts:264` — the exact, complete set of patchable fields:

```ts
const PATCH_WHITELIST = ['status', 'title', 'target_version', 'priority', 'workflow_mode'] as const;
```

| Field | In whitelist | CLI surface |
|---|---|---|
| `status` | ✅ | `req set --status`, `req advance --to` |
| `title` | ✅ | `req set --title` |
| `target_version` | ✅ | `req set --target-version` |
| `priority` | ✅ | `req set --priority` |
| `workflow_mode` | ✅ | `req set --workflow-mode`, `req add --workflow-mode` (at creation) |
| `id` | ❌ | never (immutable) |
| `owner`, `claimed_at` | ❌ | only `claim`/`release` |
| `created_at`, `updated_at` | ❌ | engine-managed |
| `body_path` | ❌ | only `writeRequirementBodySkeleton` |
| `parent_id` | ❌ | only `split` (immutable afterwards) |

Rules:

* A key counts only when its value is `!== undefined`; explicit `undefined` keys are filtered out before the
  whitelist test.
* Whitelist check precedes value validation, so `{owner:'x'}` → `invalid_field`, regardless of value.
* **Unknown key ⇒ `invalid_field`, whole patch zero-change.**
* An empty patch / all-`undefined` patch ⇒ `{ ok:true, changed:false }` (success, no-op) — except at the CLI
  where `set` rejects it earlier with `req.set.noFieldsTmpl`.
* `delete`/clear semantics: **none exist**. `target_version`/`priority`/`workflow_mode`/`title` cannot be
  un-set via `set` (empty string is rejected with `invalid_field`). Only `release` deletes fields (`owner`,
  `claimed_at`).

---

## 9. `board` and `next`

Both are strictly read-only: no `save()`, no `appendLog`, no disk write (tests assert unchanged
`meta.revision` and `log.length`).

### 9.1 `board`

```
rows   = listRequirements(data, { target_version: options.targetVersion })   // status filter NOT applied
groups = {} for s in REQ_STATUSES: groups[s] = rows.filter(r => r.status === s)
```

* **Exactly 7 groups, always present, always in `REQ_STATUSES` declaration order**:
  `draft, scheduled, in_progress, done, blocked, cancelled, rejected`. Empty groups are still rendered.
  (Order is declaration order, not lifecycle order — `done` sits between `in_progress` and `blocked`.)
* Requirements whose stored `status` is outside the domain are **silently not rendered** in any group (they
  still exist in `flow.json`).
* `--target-version` filter is applied before grouping; `--owner` is not supported.
* Human layout, per status:
  ```
  {status}（{n}）
    - {id} {title}
    - {id} {title}（已认领：{owner}）
  ```
  i.e. `req.board.groupTmpl` then one `req.board.itemTmpl` per row, with `req.board.ownedSuffixTmpl`
  appended only when `owner` is set. No blank lines, no separator, no header, no trailer.
* Within a group, order = storage order (no sorting).

### 9.2 `next`

```
limit: undefined → 1
       else /^\d+$/ test on the RAW string → Number(...) else NaN
       reject unless Number.isInteger(parsed) && parsed >= 1   → invalid-argument / req.next.limitInvalidTmpl, exit 1

rows       = listRequirements(data, { status: 'scheduled' })        // ONLY scheduled
candidates = rows.filter(r => !r.owner || (options.owner !== undefined && r.owner === options.owner))
candidates.sort(frozen comparator):
    ① target_version ascending, undefined ALWAYS last
       (if av !== bv: av===undefined → 1; bv===undefined → -1; else plain string < / >)
    ② created_at ascending (plain string compare — ISO 8601 sorts lexicographically)
    ③ id ascending (plain string compare) as final tiebreak
    ④ else 0
picked = candidates.slice(0, limit)
top    = picked[0] ?? null
```

Selection-rule details a reimplementation is likely to get wrong:

* **Only `scheduled`** is eligible. `draft`, `in_progress`, `blocked`, `done` never appear — even if
  unclaimed. Availability = *published* (scheduled) ∧ unclaimed.
* **`--owner` widens** the pool: without it, only *unclaimed* rows; with it, unclaimed rows **plus** rows
  claimed by that exact owner (so an agent can re-discover its own work). It never narrows to only that
  owner's rows.
* **Version ordering is lexicographic, not semantic**: `'v1.10.0' < 'v1.9.0'`. Absent `target_version`
  sorts last regardless. Do not introduce semver comparison — the golden output depends on plain `<`/`>`.
* **`limit` is judged on the parsed number, not on "was the flag passed"**: explicit `--limit 1` is
  byte-identical to omitting it (same human line, same two JSON keys). `--limit 001` parses to 1 and equals
  the default; `0`, `-1`, `1.5`, `abc`, `' 1'`, `+1` are all invalid (regex `/^\d+$/` then integer ≥ 1).
* **Empty-result precedence over the multi-label**: when `top === null`, the empty message
  (`req.next.empty` = `（无可接取需求）`) is printed *even when* `limit > 1`; the
  `可接取需求（{n}）:` label is not printed. In JSON, `requirement: null` and (limit>1) `candidates: []`.
* The multi-label count is `picked.length` (actual), not `limit`: 3 candidates with `--limit 5` prints
  `可接取需求（3）:` and 3 item lines — no padding.
* `listRequirements` returns a fresh shallow-copied array, so the in-place `sort` cannot disturb
  `data.requirements`.
* `--json` human/JSON split and key-presence rules: see §10.

---

## 10. `--json` output shapes

Global JSON conventions: a **single pure JSON document on stdout** (`JSON.stringify(payload, null, 2)`),
`stderr` stays empty, and `schemaVersion: 1` is always the **first** key. Failure payloads also go to
`stdout` with `process.exitCode = 1` (never to stderr).

`asJson = options.json === true || command.parent?.opts().json === true` — the parent `req` group does **not**
declare `--json`, so in practice only the subcommand flag matters (the parent check is defensive).

### 10.1 Write commands — only `split` supports `--json`

`add`, `claim`, `release`, `set`, `link`, `advance` have **no `--json` option at all**: passing it is a
commander "unknown option" error (test T-B11). Their `failNoInit` path is the human one.

`req split <id> --into … --json`:

**Success (exit 0):**
```json
{
  "schemaVersion": 1,
  "parent": "REQ-001",
  "children": [
    {
      "id": "REQ-002",
      "title": "A",
      "status": "scheduled",
      "parent_id": "REQ-001",
      "created_at": "2026-01-01T00:00:00.000Z",
      "updated_at": "2026-01-01T00:00:00.000Z",
      "body_path": ".openfeel/requirements/REQ-002.md"
    }
  ]
}
```
Key order is exactly `schemaVersion`, `parent`, `children`. `parent` is the **id string** (not an object).
`children` are the full `RequirementData` records **as persisted** — which is why `body_path` appears:
the skeletons are written before `save()`, so the live objects already carry it.

**Failures (exit 1):**

| Situation | Payload |
|---|---|
| `--json` + flow.json not loaded | `{ "schemaVersion": 1, "error": "no-init" }` |
| malformed `id` (before engine) | `{ "schemaVersion": 1, "error": "invalid-argument", "field": "id", "value": "<input>" }` |
| `--into` count 0 | `{ "schemaVersion": 1, "error": "invalid-argument", "field": "into" }` |
| engine `not_found` | `{ "schemaVersion": 1, "error": "not_found", "id": "<id>" }` |
| engine `invalid_status` | `{ "schemaVersion": 1, "error": "invalid_status", "id": "<id>" }` |
| engine `invalid_field` | `{ "schemaVersion": 1, "error": "invalid_field", "id": "<id>" }` |

Concurrency failure is *not* JSON: it goes through `handleConcurrentConflict` → stderr + `exit(2)`.

### 10.2 Read commands with `--json` (for completeness)

| Command | Success payload | Failure payloads |
|---|---|---|
| `req list` | `{ schemaVersion, requirements: RequirementData[] }` | invalid `--status`: `{ schemaVersion, error:'invalid-argument', field:'status', value, allowed:[...REQ_STATUSES] }`; no-init: `{ schemaVersion, error:'no-init' }` |
| `req show` | `{ schemaVersion, requirement, stages: string[], parent: string \| null, children: string[] }` — key order fixed, `stages` = raw `flow.json` stage keys, `parent` = `r.parent_id ?? null` echoed verbatim (dangling not an error), `children` = storage-order ids | invalid id: `{ schemaVersion, error:'invalid-argument', field:'id', value }`; missing: `{ schemaVersion, error:'not_found', id }`; no-init |
| `req board` | `{ schemaVersion, groups }` where `groups` has exactly the 7 `REQ_STATUSES` keys in declaration order, each an array of full records | no-init |
| `req next` | `limit === 1`: `{ schemaVersion, requirement }` (**exactly two keys**, no `candidates`); `limit > 1`: `{ schemaVersion, requirement, candidates }` (the two existing keys are byte-identical, `candidates` appended) | invalid limit: `{ schemaVersion, error:'invalid-argument', field:'limit', value }`; no-init |

`req show --json` has no aggregation fields — `stages` is a raw read-only enumeration of IDs.

---

## 11. Audit log entries

All engine-level requirement writes append to `data.log` via `appendRequirementLog`, with
`agent: 'cli'`, `time: new Date().toISOString()`, and a `detail` object:

| action | detail | Emitted by |
|---|---|---|
| `requirement_add` | `{ id, title }` | `addRequirement` |
| `requirement_split` | `{ parentId, children: string[] }` — exactly **one** entry per split | `splitRequirement` |
| `requirement_claim` | `{ id, owner }` | `claimRequirement` (not on idempotent no-op) |
| `requirement_release` | `{ id, owner: prevOwner }` | `releaseRequirement` (not on unclaimed no-op) |
| `requirement_status` | `{ id, from, to }` | `applyStatusChange` |
| `requirement_update` | `{ id, fields: string[] }` — only actually-changed field names | `updateRequirement` |
| `requirement_link` | `{ stage, requirementId }` (`requirementId: null` for unlink) | `linkRequirement` |
| `requirement_auto_done` | `{ requirementId, from, to: 'done', triggerStage }` | `syncRequirementStatus` |
| `requirement_auto_reopen` | `{ requirementId, from: 'done', to: 'in_progress', triggerStage }` | `syncRequirementStatus` |

No audit entry is written for a rejected operation or a no-op. A successful write always coincides with
exactly one `save()` (⇒ `meta.revision += 1`).

`updated_at` discipline (`REV-81-013`, single assignment): `applyStatusChange` refreshes it when the status
changes; `updateRequirement` refreshes it once more **only** when fields changed *and* the status did not;
`claim`/`release` refresh it themselves; no-op paths never refresh it.

---

## 12. Engine error codes → exit codes and message mapping

`RequirementErrorCode` (frozen): `not_found` | `stage_not_found` | `already_claimed` | `already_linked` |
`invalid_status` | `invalid_field` | `general_mode_conflict`.

`RequirementOpResult = { ok:true; changed:boolean } | { ok:false; code }`;
`RequirementSplitResult = { ok:true; children: RequirementData[] } | { ok:false; code }` (business branching,
no exceptions).

Exit codes: **0** success (including every no-op); **1** validation / occupancy / existence failure, or an
`add` construction throw; **2** flow.json optimistic-concurrency conflict (`process.exit(2)` inside
`handleConcurrentConflict`, after printing to stderr).

### 12.1 Per-command mapping table (zh-CN strings are the reference rendering)

| Code | `add` | `claim` | `release` | `set` | `advance` | `link` | `split` |
|---|---|---|---|---|---|---|---|
| `not_found` | — | `req.err.notFoundTmpl` | `req.err.notFoundTmpl` | `req.err.notFoundTmpl` | `req.err.notFoundTmpl` | `req.err.notFoundTmpl` | `req.err.notFoundTmpl` |
| `stage_not_found` | — | — | — | — | — | `req.err.stageNotFoundTmpl` | — |
| `already_claimed` | — | `req.err.alreadyClaimedTmpl` | — | — | — | — | — |
| `already_linked` | — | — | — | — | — | `req.err.alreadyLinkedTmpl` | — |
| `invalid_status` | — | `req.claim.terminalTmpl` | — | `req.err.invalidStatusTmpl` or `req.err.doneGateTmpl` | same as `set` | `req.link.terminalTmpl` | `req.split.terminalTmpl` |
| `invalid_field` | thrown (see below) | `req.err.invalidFieldTmpl` | — | `req.err.invalidFieldTmpl` | — | — | `req.split.invalidFieldTmpl` |
| `general_mode_conflict` | — | — | — | `req.err.generalModeConflictTmpl` | — | `req.err.generalTargetTmpl` | — |

Unregistered codes fall back to `common.errorTmpl` with the raw code as `{msg}`.

### 12.2 `add` is the only throwing primitive

`addRequirement` throws (never returns a code) on construction-contract violations; the CLI catches and prints
`common.errorTmpl` (`错误：{msg}`), exit 1, zero write:

| Message | Trigger |
|---|---|
| `需求标题不能为空` | `title`, after trim, is `''` or not a string |
| `需求优先级非法：{value}` | `priority` supplied and not in `REQ_PRIORITIES` |
| `需求工作流模式非法：{value}` | `workflow_mode` supplied and not in `WORKFLOW_MODES` |
| `预估版本不能为空串` | `target_version` supplied and trims to `''` |

(Registered as an accepted asymmetry: `add` throws at construction time; `update`/`split` return runtime error
codes. Do not normalize.)

### 12.3 stderr-only command-layer messages (no engine involvement)

| Key | zh-CN |
|---|---|
| `req.invalidIdTmpl` | `{input} → 非法需求 ID（应为 REQ-NNN，如 REQ-001）` |
| `req.link.exclusiveTmpl` | `--requirement 与 --unlink 必须且只能提供一个` |
| `req.set.noFieldsTmpl` | `未提供任何字段；至少提供 --status / --title / --target-version / --priority / --workflow-mode 之一` |
| `req.split.noIntoTmpl` | `未提供 --into；请至少给出一个子需求标题（--into 可重复）` |
| `req.claim.ownerUnresolvedTmpl` | `无法解析当前用户名（.openfeel/.info.json 与 git config user.name 均不可用）；请显式传入 --owner <name>` |
| `req.list.invalidStatusTmpl` | `{value} → 非法状态过滤值（合法值：{allowed}）` |
| `req.next.limitInvalidTmpl` | `{value} → 非法 --limit 值（应为 ≥1 的整数）` |
| `common.errorNoInit` | `错误：flow.json 未初始化，请先运行 openfeel init` |
| `common.errorTmpl` | `错误：{msg}` |
| `common.concurrentConflict` | `[并发冲突] flow.json 已被其它进程修改（期望 revision={expected}，磁盘={actual}）；本次修改未写入，请重新执行该命令重试。` |
| `common.none` | `(无)` — used by `show` for absent `target_version` / `priority` / `body_path` |

### 12.4 Full message string table (zh-CN / en)

| Key | zh-CN | en |
|---|---|---|
| `req.add.doneTmpl` | `已创建 {id}：{title}（状态 draft）` | `Created {id}: {title} (status: draft)` |
| `req.add.bodyTmpl` | `正文骨架：{path}` | `Body skeleton: {path}` |
| `req.list.empty` | `（无匹配需求）` | `(no matching requirements)` |
| `req.list.itemTmpl` | `  - {id} [{status}] {title}` | `  - {id} [{status}] {title}` |
| `req.show.titleTmpl` | `{id}：{title}` | `{id}: {title}` |
| `req.show.metaTmpl` | `状态: {status} ｜ 预估版本: {targetVersion} ｜ 优先级: {priority}` | `Status: {status} \| Target version: {targetVersion} \| Priority: {priority}` |
| `req.show.ownerTmpl` | `认领人: {owner}（认领于 {claimedAt}）` | `Owner: {owner} (claimed at {claimedAt})` |
| `req.show.ownerNone` | `认领人: （无）` | `Owner: (none)` |
| `req.show.timesTmpl` | `创建: {created} ｜ 更新: {updated}` | `Created: {created} \| Updated: {updated}` |
| `req.show.bodyTmpl` | `正文: {path}` | `Body: {path}` |
| `req.show.parentTmpl` | `父需求: {parent}` | `Parent: {parent}` |
| `req.show.parentNone` | `父需求: （无）` | `Parent: (none)` |
| `req.show.childrenLabel` | `子需求:` | `Children:` |
| `req.show.childItemTmpl` | `  - {id} [{status}] {title}` | `  - {id} [{status}] {title}` |
| `req.show.childrenNone` | `子需求: （无）` | `Children: (none)` |
| `req.show.stagesLabel` | `关联阶段:` | `Linked stages:` |
| `req.show.stageItemTmpl` | `  - {stage}` | `  - {stage}` |
| `req.show.stagesNone` | `关联阶段: （无）` | `Linked stages: (none)` |
| `req.err.notFoundTmpl` | `需求 {id} 不存在` | `Requirement {id} not found` |
| `req.err.stageNotFoundTmpl` | `阶段 {stage} 不存在（未注册于 flow.json 的 stages）` | `Stage {stage} not found (not registered in flow.json stages)` |
| `req.err.alreadyClaimedTmpl` | `{id} 已被他人认领；须先释放：openfeel req release {id}` | `{id} is claimed by someone else; release first: openfeel req release {id}` |
| `req.err.alreadyLinkedTmpl` | `{stage} 已关联其它需求；须先解绑：openfeel req link --stage {stage} --unlink` | `{stage} is already linked to another requirement; unlink first: openfeel req link --stage {stage} --unlink` |
| `req.err.invalidFieldTmpl` | `{id} 字段取值非法（检查 --status / --title / --target-version / --priority / --workflow-mode）` | `{id} invalid field value (check --status / --title / --target-version / --priority / --workflow-mode)` |
| `req.err.invalidStatusTmpl` | `{id} 目标状态 {to} 被拒（当前 {current}；合法目标：{targets}）` | `{id} target status {to} rejected (current {current}; allowed: {targets})` |
| `req.err.doneGateTmpl` | `{id} 目标状态 done 被拒（当前 {current}）——done 须全部关联阶段 done；零关联阶段的需求可设 general 模式显式完成` | `{id} target status done rejected (current {current}) — done requires all linked stages done; a requirement with no linked stages can use general mode for explicit completion` |
| `req.err.generalModeConflictTmpl` | `{id} 已关联阶段——general（无流水线）仅限无关联阶段的需求（可先解绑阶段，或改走 fast / full）` | `{id} has linked stages — general (no pipeline) requires a requirement without linked stages (unlink first, or use fast / full)` |
| `req.err.generalTargetTmpl` | `{id} 工作流模式为 general（无流水线）——不接受阶段关联` | `{id} uses workflow mode general (no pipeline) — stage linking is not allowed` |
| `req.claim.doneTmpl` | `已认领 {id}（{owner}）` | `Claimed {id} ({owner})` |
| `req.claim.idempotentTmpl` | `{id} 已由 {owner} 认领（no-op）` | `{id} already claimed by {owner} (no-op)` |
| `req.claim.terminalTmpl` | `{id} 已是终态（{status}），不可认领` | `{id} is in a terminal status ({status}); cannot claim` |
| `req.release.doneTmpl` | `已释放 {id}` | `Released {id}` |
| `req.release.noopTmpl` | `{id} 未被认领（no-op）` | `{id} is not claimed (no-op)` |
| `req.set.doneTmpl` | `已更新 {id}` | `Updated {id}` |
| `req.set.noopTmpl` | `{id} 无变更（no-op）` | `{id} unchanged (no-op)` |
| `req.set.modeSyncedTmpl` | `已将工作流模式 {mode} 下发到 {count} 个关联阶段` | `Workflow mode {mode} dispatched to {count} linked stage(s)` |
| `req.link.doneTmpl` | `已将 {stage} 关联到 {id}` | `Linked {stage} to {id}` |
| `req.link.unlinkDoneTmpl` | `已解除 {stage} 的需求关联` | `Unlinked requirement from {stage}` |
| `req.link.noopTmpl` | `{stage} 关联未变化（no-op）` | `{stage} link unchanged (no-op)` |
| `req.link.terminalTmpl` | `{id} 已是终态（{status}），不可关联` | `{id} is in a terminal status ({status}); cannot link` |
| `req.link.modeSyncedTmpl` | `已将需求工作流模式 {mode} 下发到阶段 {stage}（status.md 字段 + flow.json 冗余同批）` | `Requirement workflow mode {mode} dispatched to stage {stage} (status.md field + flow.json redundancy batched)` |
| `req.advance.doneTmpl` | `已推进 {id}：{from} → {to}` | `Advanced {id}: {from} -> {to}` |
| `req.advance.noopTmpl` | `{id} 已是 {to}（no-op）` | `{id} is already {to} (no-op)` |
| `req.board.groupTmpl` | `{status}（{n}）` | `{status} ({n})` |
| `req.board.itemTmpl` | `  - {id} {title}` | `  - {id} {title}` |
| `req.board.ownedSuffixTmpl` | `（已认领：{owner}）` | ` (claimed by {owner})` |
| `req.next.foundTmpl` | `下一项：{id} [{status}] {title}` | `Next: {id} [{status}] {title}` |
| `req.next.ownedSuffixTmpl` | `（已认领：{owner}）` | ` (claimed by {owner})` |
| `req.next.empty` | `（无可接取需求）` | `(no claimable requirement)` |
| `req.next.multiLabel` | `可接取需求（{n}）:` | `Claimable requirements ({n}):` |
| `req.next.itemTmpl` | `  - {id} [{status}] {title}` | `  - {id} [{status}] {title}` |
| `req.split.doneTmpl` | `已拆分 {id} → {children}（共 {n} 条子需求）` | `Split {id} -> {children} ({n} child requirements)` |
| `req.split.childTmpl` | `  - {id}：{title}（正文：{path}）` | `  - {id}: {title} (body: {path})` |
| `req.split.terminalTmpl` | `{id} 已是终态（{status}），不可拆分` | `{id} is in a terminal status ({status}); cannot split` |
| `req.split.invalidFieldTmpl` | `子需求取值非法（标题不能为空）` | `Invalid child value (title must not be empty)` |

Interpolation is `{name}` → `vars[name]`, missing var renders literally as `{name}`. In `req.split.doneTmpl`,
`{children}` is the child ids joined by `, `. In `req.split.childTmpl`, `{path}` is the **absolute** body path.

---

## 13. CLI surface — the 11 subcommands

`registerReqCommand(program)` registers the group `req` (`description: '需求管理（需求流转命令组）'`). The
group itself declares no options. All subcommands construct `new FlowManager(process.cwd())` and refuse with
`failNoInit` when `!mgr.isLoaded()`.

| # | Subcommand | Arguments / options | `--json` | Writes |
|---|---|---|---|---|
| 1 | `add <title>` | `--target-version <v>`, `--priority <p>`, `--workflow-mode <m>` | ❌ | flow.json + body file |
| 2 | `list` | `--status <s>`, `--target-version <v>`, `--owner <o>` | ✅ | — |
| 3 | `show <id>` | — | ✅ | — |
| 4 | `claim <id>` | `--owner <o>` (default chain) | ❌ | flow.json |
| 5 | `release <id>` | — | ❌ | flow.json |
| 6 | `set <id>` | `--status`, `--title`, `--target-version`, `--priority`, `--workflow-mode` | ❌ | flow.json (+ status.md/flow.json mode dispatch) |
| 7 | `link` | `--stage <id>` (**required**), `--requirement <id>` **xor** `--unlink` | ❌ | flow.json (+ mode dispatch) |
| 8 | `advance <id>` | `--to <status>` (**required**) | ❌ | flow.json |
| 9 | `split <id>` | `--into <title>` (repeatable, ≥1) | ✅ | flow.json + N body files |
| 10 | `board` | `--target-version <v>` | ✅ | — |
| 11 | `next` | `--owner <o>`, `--limit <n>` | ✅ | — |

Human output line order per command:

* **add**: `req.add.doneTmpl` then `req.add.bodyTmpl` (absolute path).
* **list**: one `req.list.itemTmpl` per row in storage order; `req.list.empty` when zero rows. No header.
* **show**: title → meta → owner → times → body → parent → children block → stages block. Each is one
  `console.log`. Exact order (source lines 239–268):
  1. `req.show.titleTmpl`
  2. `req.show.metaTmpl` (`targetVersion`/`priority` fall back to `common.none` = `(无)`)
  3. `req.show.ownerTmpl` if `owner`, else `req.show.ownerNone`. Note `{claimedAt}` is `r.claimed_at ?? ''`.
  4. `req.show.timesTmpl`
  5. `req.show.bodyTmpl` (`body_path ?? (无)`)
  6. `req.show.parentTmpl` (raw `parent_id`) or `req.show.parentNone`
  7. `req.show.childrenNone` if none, else `req.show.childrenLabel` + one `req.show.childItemTmpl` per child
     (storage order)
  8. `req.show.stagesNone` if none, else `req.show.stagesLabel` + one `req.show.stageItemTmpl` per stage key
* **claim / release / set / link / advance**: single line, or `modeSyncedTmpl` line before `set.doneTmpl`
  (set) / `link.doneTmpl`|`link.unlinkDoneTmpl` (link).
* **split**: `req.split.doneTmpl` then one `req.split.childTmpl` per child (aligned with `bodies[i]`).
* **board**: 7 × (`groupTmpl` + items), continuous lines.
* **next**: `req.next.empty` | single `req.next.foundTmpl`(+owner suffix) | `req.next.multiLabel` + items.
* **Errors**: stderr only + `process.exitCode = 1` (or `exit(2)` for concurrency).

### 13.1 `link` — bidirectional carrier gate + ID normalization

`linkRequirement(data, stageId, requirementId | null)` (`requirement-ops.ts:354`):

```
stage = data.stages?.[stageId]; if (!stage) → stage_not_found        // ① stage existence, FIRST
if (requirementId !== null):
    req = find(requirements, id);            if (!req) → not_found
    if (isTerminal(req.status))              → invalid_status
    if (req.workflow_mode === 'general')     → general_mode_conflict
    if ((stage.requirement_id ?? null) === requirementId) → { ok:true, changed:false }   // idempotent
    if (stage.requirement_id != null)        → already_linked        // cross-requirement rebind
    stage.requirement_id = requirementId; audit 'requirement_link' {stage, requirementId}
    → { ok:true, changed:true }
else:                                        // explicit null = unlink
    if (stage.requirement_id == null)        → { ok:true, changed:false }
    stage.requirement_id = null; audit 'requirement_link' {stage, requirementId: null}
    → { ok:true, changed:true }
```

* `link` writes **only the stage record**; `requirement.updated_at` is deliberately **not** refreshed (the
  requirement object is unchanged).
* Rebind requires an explicit unlink first (`already_linked`); there is no auto-replace.
* The unlink path performs **no** requirement existence / terminal checks.
* The general carrier gate sits **before** the idempotence check.
* Command layer: `--stage` is a `requiredOption`; `--requirement`/`--unlink` are mutually exclusive and one
  is required (`req.link.exclusiveTmpl`). The stage key is normalized **exactly once**:
  `stageKey = normalizeStageId(options.stage) ?? options.stage` — and the engine does **no double-key
  fallback**. So `stage-01` → `v1.0.0-stage-01` works only if that full key exists in `flow.json`; a legacy
  key such as `v4-stage-04` is *not* reachable by passing `v4.0.0-stage-04`.
* Post-save: if the linked requirement carries `workflow_mode`, it is dispatched onto that stage via
  `syncConfigFieldToStages('workflow_mode', mode, { onlyStages: [stageKey] })`, and
  `req.link.modeSyncedTmpl` is printed only when some result is `updated`/`inserted`.
* `requirement_id` is `string | null | undefined` on `StageData`; legacy absence ≡ `null` (read tolerance,
  no migration).

### 13.2 Stage-side mode resolution (context for `workflow_mode`)

`FlowManager.resolveStageWorkflowMode(stageId?)` resolves, in order:
`status.md` field → **requirement-level** (`stages[normalized].requirement_id` → that requirement's
`workflow_mode`, if in `WORKFLOW_MODES`; source label `'requirement'`) → `config.yaml defaults` →
`profile.yaml` (never actually produces a value) → `builtin` (`DEFAULT_CONFIG.workflow_mode = 'fast'`).
Read-tolerant: missing/dangling/illegal requirement mode silently falls through. This is a **stage-side
scheduling** concern and is deliberately *not* used by the `done` gate.

---

## 14. Reference conformance checklist (subtle rules reimplementations get wrong)

1. **`scheduled` cannot jump to `done`.** Only `in_progress → done` exists in the table. So the dedicated
   `done`-gate message only ever appears when the current status is `in_progress`; from `scheduled`/`blocked`
   the generic "allowed targets" message must appear instead (and must not mention the gate).
2. **Absent `workflow_mode` + zero linked stages = permanently un-completable** (empty-set guard). The fix is
   `set --workflow-mode general` first, then `done`. Do not "helpfully" treat zero stages as complete.
3. **`general` + linked stages must fall back to path 1**, not be exempted. Two separate gates
   (`update` carrier gate, `link` carrier gate) are what make that state unreachable.
4. **`done → in_progress` is not in the transition table.** It exists *only* via `syncRequirementStatus`.
   Adding it to `ALLOWED_TRANSITIONS` would let operators reopen completed requirements.
5. **Aggregate auto-done is restricted to `scheduled`/`in_progress`.** `draft`, `blocked`, and terminal
   statuses are never auto-completed; a `blocked` requirement whose stages all finish stays `blocked`.
6. **Aggregate reverse direction always lands on `in_progress`**, never `scheduled`, and only from `done`.
7. **Aggregation triggers only on** `advanceStagePhase(to === 'done', prevStatus !== 'done')` and
   successful `resetStagePhase`. Not on `plan_pending` transitions, not on `dryRun`, not on no-ops, never on
   read commands.
8. **`split` children inherit nothing but the title.** Not `target_version`, not `priority`, not
   `workflow_mode`. They are born `scheduled` (not `draft`).
9. **`split` allocates ids sequentially against a staged container** and returns *live* objects so the caller
   can set `body_path`; a shallow copy would silently break body-path assignment.
10. **`split` has zero parent side effects** — parent status/`updated_at` untouched.
11. **Exact one audit entry per split**, regardless of child count.
12. **Terminal check precedes occupancy check** in `claim` (a done requirement claimed by someone else →
    `invalid_status`, not `already_claimed`).
13. **Same-owner claim is a no-op that does not `save()`** → `meta.revision` unchanged, no audit,
    `updated_at` not refreshed.
14. **`release` has no status gate and no ownership check**, and *deletes* `owner`/`claimed_at` keys.
15. **No TTL / heartbeat anywhere**; `claimed_at` is display-only.
16. **`PATCH_WHITELIST` is exactly 5 fields**; `owner`/`claimed_at`/`parent_id`/`body_path`/timestamps/`id`
    are not patchable. An invalid `status` yields `invalid_status`, while every other bad value yields
    `invalid_field`.
17. **Empty patch is a successful no-op at the engine level**; the CLI's `set` rejects it earlier with its own
    message. `add` **throws** where `split`/`update` return codes.
18. **`updated_at` is written at most once per operation** (status dimension wins; field dimension skips the
    refresh when the status already changed).
19. **`next` sorts `target_version` lexicographically** with `undefined` last; the `--limit` verdict is based
    on the parsed number, so `--limit 1` ≡ no flag (including JSON key set); the empty result wins over the
    multi-label.
20. **`next` eligibility is `scheduled` only, and `--owner` *widens*** (unclaimed ∪ mine), it does not
    restrict to mine.
21. **`board` group order is `REQ_STATUSES` declaration order** — `draft, scheduled, in_progress, done,
    blocked, cancelled, rejected` — which is *not* lifecycle order (`done` sits before `blocked`). Empty
    groups are always printed; out-of-domain stored statuses are dropped from the view.
22. **`show --json` key order and key set are frozen**: `schemaVersion, requirement, stages, parent,
    children`; `parent` is the raw `parent_id ?? null` (dangling echoed, no error).
23. **`next --json` keys are conditional on `limit === 1`** (`candidates` absent), while `show`/`board`/
    `list` always emit their full key set.
24. **JSON failures go to stdout with exit 1 and empty stderr**; concurrency failures are the exception
    (stderr + `exit 2`) and are never JSON.
25. **Only `split` among write commands supports `--json`.**
26. **The requirement body is never updated after creation** (create-time status snapshot). `body_path` is
    (re)assigned unconditionally by `writeRequirementBodySkeleton`, and an existing file is never overwritten.
27. **`requirements` is never back-filled at load**; `getRequirements` derives `[]` on the fly. A non-array
    `requirements` container is rebuilt as an array on the next `add`/`split` (and only there).
28. **`link` does not refresh `requirement.updated_at`** and does not use double-key stage fallback.

---

## Appendix A — consolidated pseudocode

```
# ── read / allocate ───────────────────────────────────────────────────────────
getRequirements(data)        = isArray(data.requirements) ? data.requirements.map(r => {...r}) : []
getRequirement(data, id)     = { ...(find(r => r?.id === id)) } ?? null
listRequirements(data, f)    = getRequirements(data).filter(AND over {status, target_version, owner})
nextRequirementId(data)      = 'REQ-' + pad3(max(parse(ids)) + 1)
isTerminal(status)           = status ∈ {done, cancelled, rejected}

# ── state machine ─────────────────────────────────────────────────────────────
ALLOWED_NEXT = { draft:[scheduled,blocked,cancelled,rejected],
                 scheduled:[in_progress,blocked,cancelled,rejected],
                 in_progress:[done,blocked,cancelled,rejected],
                 blocked:[scheduled,in_progress,cancelled,rejected],
                 done:[], cancelled:[], rejected:[] }
getAllowedNextStatuses(s)    = copy of (ALLOWED_NEXT[s] ?? [])

applyStatusChange(data, req, to):
    if to ∉ REQ_STATUSES                        → false
    if to === req.status                        → false
    if to ∉ (ALLOWED_NEXT[req.status] ?? [])    → false
    if to === 'done' ∧ ¬canComplete(data, req)  → false
    req.status = to; req.updated_at = now(); audit('requirement_status', {id, from, to}); return true

# ── completion gate ───────────────────────────────────────────────────────────
allLinkedStagesDone(data, rid):
    L = [s for s in values(data.stages) where (s.requirement_id ?? null) === rid]
    return len(L) > 0 ∧ ∀s∈L: s.phase === 'done'

canCompleteRequirement(data, req):
    if req.workflow_mode === 'general'
       ∧ ¬∃s: (s.requirement_id ?? null) === req.id   → true
    return allLinkedStagesDone(data, req.id)

# ── aggregate projection ──────────────────────────────────────────────────────
computeRequirementAggregate(data, rid):
    L = [(k,s) for (k,s) in entries(data.stages) where (s.requirement_id ?? null) === rid]
    if len(L) === 0 → {stageIds: [], stageCount: 0, doneCount: 0, aggregate: null}
    doneCount  = |{s ∈ L : s.phase === 'done'}|
    anyStarted = ∃s ∈ L : s.phase !== 'plan_pending'
    aggregate  = allLinkedStagesDone(data,rid) ? 'done' : anyStarted ? 'in_progress' : 'scheduled'

syncRequirementStatus(data, stageId):
    rid = data.stages?.[stageId]?.requirement_id ?? null; if ¬rid → []
    agg = computeRequirementAggregate(data, rid).aggregate; if agg === null → []
    req = raw find(data.requirements, rid); if ¬req → []
    if agg === 'done' ∧ req.status ∈ ['scheduled','in_progress']:
        req.status='done'; req.updated_at=now(); audit('requirement_auto_done', …); return [rid]
    if agg !== 'done' ∧ req.status === 'done':
        req.status='in_progress'; req.updated_at=now(); audit('requirement_auto_reopen', …); return [rid]
    return []

# ── claim protocol ────────────────────────────────────────────────────────────
claim(data, id, owner):
    name = trim(owner); if name === ''                       → invalid_field
    req  = raw find(data.requirements, id); if ¬req           → not_found
    if isTerminal(req.status)                                 → invalid_status
    if req.owner ∧ req.owner !== name                         → already_claimed
    if req.owner === name                                     → ok(changed=false)
    req.owner = name; req.claimed_at = now(); req.updated_at = req.claimed_at
    audit('requirement_claim', {id, owner:name}); ok(changed=true)

release(data, id):
    req = raw find(data.requirements, id); if ¬req → not_found
    if ¬req.owner                                  → ok(changed=false)
    prev = req.owner; delete req.owner; delete req.claimed_at; req.updated_at = now()
    audit('requirement_release', {id, owner:prev}); ok(changed=true)

# ── split ─────────────────────────────────────────────────────────────────────
split(data, parentId, children):
    if ¬isArray(children) ∨ len === 0            → invalid_field
    parent = find(data.requirements, parentId); if ¬parent → not_found
    if isTerminal(parent.status)                 → invalid_status
    titles = [trim(c.title) for c in children]; if any === '' → invalid_field
    list = isArray(data.requirements) ? [...data.requirements] : []
    staged = {...data, requirements: list}; now = now(); created = []
    for t in titles:
        child = {id: nextRequirementId(staged), title: t, status: 'scheduled',
                 parent_id: parentId, created_at: now, updated_at: now}
        list.push(child); created.push(child)
    data.requirements = list
    audit('requirement_split', {parentId, children: created.map(c => c.id)})
    ok(children = created)                       # live objects, single audit, parent untouched
```

## Appendix B — conformance fixtures to assert

| Fixture | Expected |
|---|---|
| empty `requirements` → `req add 'x'` | `REQ-001`, status `draft`, body written, `req.add.doneTmpl` + absolute path |
| only `REQ-005` exists → `add` | `REQ-006` |
| only `REQ-999` exists → `add` | `REQ-1000` |
| `requirements: {}` (corrupt) → `add` | no crash, exit 0, container rebuilt as array |
| `in_progress` + stage `plan_pending` linked → `advance --to done` | exit 1, `done 须全部关联阶段`, zero write |
| `scheduled` (no stages) → `advance --to done` | exit 1, `合法目标：in_progress, blocked, cancelled, rejected` |
| `workflow_mode: general`, 0 stages, `in_progress` → `advance --to done` | exit 0, `已推进 … in_progress → done`, audit `requirement_status` |
| `in_progress` + 2 stages both `done` → `advance --to done` | exit 0, audit `requirement_status` |
| stage → `done` on a `scheduled` requirement (both linked stages done) | requirement auto-flips to `done` with `requirement_auto_done` |
| stage reset out of `done` on a `done` requirement | requirement back to `in_progress` with `requirement_auto_reopen` |
| `draft` requirement whose stage somehow reached `done` | no auto-done (outside precondition set) |
| `req split REQ-001 --into A --into B` on `REQ-001`+`REQ-002` existing | children `REQ-003`, `REQ-004`, both `scheduled`, `parent_id: REQ-001`, bodies written, one `requirement_split` |
| `req split REQ-001 --into '   '` | exit 1, `子需求取值非法（标题不能为空）`, zero write |
| `req board` with one `scheduled` | 7 group lines with `done` before `blocked`, item under `scheduled` |
| `req next --limit 2` with 3 scheduled candidates | `可接取需求（2）:` + 2 items; `--json` adds `candidates` (len 2) |
| `req next --limit 2` with 0 candidates | `（无可接取需求）`; `--json` → `requirement: null, candidates: []` |
| `req next --limit 0` | exit 1, `非法 --limit 值（应为 ≥1 的整数）` |
| `req claim REQ-001 --json` | commander unknown-option error (write commands have no `--json`) |
