# OpenFeel — Persistence, Indexing & Version Management

**Behavioral specification for a byte-compatible reimplementation.**
Analyzed from `C:\Users\Liuary\Dev\Mine\AI\OpenFeel` (v1.2.1 tree, read-only).

Source anchors (all paths relative to the analyzed project root):

| Area | File |
|---|---|
| Atomic write primitive | `src/core/fs/atomic-write.ts` |
| Cross-process file lock | `src/core/fs/file-lock.ts` |
| Tolerant read helper | `src/core/fs/safe-read.ts` |
| Atomic sequence allocation | `src/core/fs/sequence.ts` |
| `flow.json` owner | `src/core/flow-manager.ts` |
| Version archive (schema) | `src/core/flow-archive/archive-file.ts` |
| Version archive (IO + index) | `src/core/flow-archive/archive-ops.ts` |
| Version archive (grouping/split) | `src/core/flow-archive/grouping.ts` |
| Version archive (health) | `src/core/flow-archive/archive-health.ts` |
| Version archive (CLI) | `src/commands/flow.ts` (`flow archive …`) |
| Stage summary archive | `src/core/archive/merge.ts`, `src/commands/archive.ts` |
| Metrics | `src/core/metrics.ts` |
| Workspace audit log | `src/core/public-logger.ts` |
| CLI runtime log | `src/core/runtime-log.ts`, `src/core/session.ts` |
| Workspace identity | `src/core/workspace/identity.ts` |
| Workspace directories | `src/core/workspace/structure.ts` |
| Update state | `src/core/update-state.ts` |
| Locked error rendering | `src/commands/shared/errors.ts` |

Conventions in this document: **MUST** / **MUST NOT** are conformance requirements. Strings given in `zh` / `en` are the exact user-visible i18n texts; `{name}` marks an interpolation slot.

---

## 1. The `.openfeel/` directory

Root: `<project>/.openfeel/`. Everything is UTF-8, no BOM.

### 1.1 Created eagerly by `init` (`createWorkspace`, `src/core/workspace/structure.ts`)

`WORKSPACE_DIRS` = `plan`, `kb`, `dev`, `log`, `code_review`, `bugs`, `users`, `tmp`, `manual`, `update_conflicts`.
`DEV_SUB_DIRS` = `note`, `current_archive` (under `dev/`).

`createWorkspace()` `mkdir -p`s the root and each of the above, returning the relative paths it actually created (`.openfeel/`, `.openfeel/plan/`, …). Already-present directories are silently skipped.

| Path | Owner | Purpose |
|---|---|---|
| `.openfeel/` | all | Workspace root. |
| `.openfeel/flow.json` | `FlowManager` | **Single source of truth** for pipeline state (see §4). |
| `.openfeel/flow.json.bak` | `save()`/restore/repair | Byte copy of the **previous** `flow.json` (see §4.5). |
| `.openfeel/flow.json.v4.0.bak` | `FlowManager.migrate()` | One-shot pre-migration backup for the legacy-format migration only. |
| `.openfeel/.info.json` | `workspace/identity.ts` | Workspace identity: `{user, lang}` (see §11). |
| `.openfeel/config.yaml` | `core/config.ts` | Project config (`defaults.*`). Created by `init`; **never overwritten** if present. |
| `.openfeel/pipeline.yaml` | `FlowManager.loadPipelineConfig()` | Optional pipeline override (phases/transitions/checkpoint_mapping, optional `fast_transitions`, `phase_corrections`). **Not created by `init`**; absent ⇒ built-in defaults. |
| `.openfeel/models.template.yaml` | `openfeel model` | Generated export of the `models:` section. Optional. |
| `.openfeel/update_state.json` | `core/update-state.ts` | Per-project hash/conflict ledger for `openfeel update` (see §11.3). Git-ignored. |
| `.openfeel/flow-archive/` | `flow-archive/archive-ops.ts` | **Version archive**: `{version}.json` per archived version (§6). **Not** in `WORKSPACE_DIRS`; created on demand. |
| `.openfeel/checkpoints/` | `FlowManager.saveCheckpoint()` | `{stageId}-{yyyyMMddTHHmmssSSS}-{phase}.json` snapshots, 20 kept per stage. Created on demand. |
| `.openfeel/log/` | `public-logger.ts`, stage archive | Team-level audit log + `index.md` + `log.md` + `archive-{stage}.md` (§5). |
| `.openfeel/plan/` | `core/plan/*` | `{series}/{stageDir}/` with `status.md`, `ops/op-NNN.md`, `deps.yaml` (at `plan/deps.yaml`), `index.md`, `plan_index.md`, `plan_log.md`. |
| `.openfeel/roadmap/` | `core/plan/roadmap.ts` | `{version}.md` roadmaps. Created on demand (**not** in `WORKSPACE_DIRS` despite the `init.ts` comment). |
| `.openfeel/kb/` | `workspace/knowledge.ts` | Knowledge base (`index.md`, `architecture.md`, `patterns.md`, `setup.md`, `troubleshooting.md`). |
| `.openfeel/dev/` | `init` + agents | `dev_core.md`, `current.md`, `decisions.md`, `note/`, `current_archive/`. |
| `.openfeel/code_review/` | agents | `index.md`, `log.md`, `stage-NN.md`. |
| `.openfeel/bugs/` | agents | `index.md`, `archive.md`, `cli.md`, `config.md`, … |
| `.openfeel/users/` | agents + `flow-manager.ts:1245` | Per-user private area: `users/{username}/log/`. Git-ignored. |
| `.openfeel/tmp/` | FS layer | Scratch. Holds `locks/*.lock`, `session.json`, `status.{stageId}.bak`, misc fixtures. Git-ignored. |
| `.openfeel/manual/` | docs | User manual mirror. |
| `.openfeel/update_conflicts/` | `core/update.ts` | Conflict copies produced by `update`. Git-ignored. |
| `.openfeel/stages/` | **legacy** | Pre-`plan/` stage layout; read-only fallback (`plan/path.ts:321`). Never written. |
| `.openfeel/adapters/` | repo docs | Documentation-only (`README.md`); no CLI code reads it. |
| `.openfeel/metrics.json` | `core/metrics.ts` | Agent performance metrics (see §10). **Not** created by `init`; written on first `recordRun`+`save`. |

### 1.2 Lock files

| Scope | Path | Names used |
|---|---|---|
| Project | `<project>/.openfeel/tmp/locks/{name}.lock` | `flow`, `log`, `flow-archive`, `kb`, `update-state`, `status-{stageDir}`, `scheme-{stageDir}`, `dev-last-{username}` |
| Global | `~/.openfeel/locks/{name}.lock` | `global-config`, `global-update-state`, `runtime-log` |

### 1.3 Other global paths (`src/core/global-paths.ts`)

`~/.openfeel/config.json` (global pref: `{lang, projects}`), `~/.openfeel/update_state.json`, `~/.openfeel/update_infos.md`, `~/.openfeel/schemas/`, `~/.openfeel/backup/`, `~/.openfeel/cli/logs/`, `~/.config/openfeel/profile.yaml`, `~/.config/opencode/…`, `~/.claude/…`.

---

## 2. Atomic write primitive (`src/core/fs/atomic-write.ts`)

### 2.1 Temp file naming

```
buildTempName(filePath):
  dir  = dirname(filePath)
  name = basename(filePath)
  rand = randomBytes(6).toString('hex')          // exactly 12 lowercase hex chars
  return join(dir, `.${name}.${process.pid}.${rand}.tmp`)
```

Example for `<prj>/.openfeel/flow.json` with pid `12345`: `<prj>/.openfeel/.flow.json.12345.a1b2c3d4e5f6.tmp`.

Properties a reimplementation must preserve: **same directory as the target** (guarantees same-volume rename), **leading dot** (hidden), **PID + 12 random hex** (multi-process uniqueness), **`.tmp` suffix**.

### 2.2 Signature

```ts
interface AtomicWriteOptions {
  encoding?: BufferEncoding;  // default 'utf-8' (ignored for Buffer content)
  fsync?: boolean;            // default true
  backup?: boolean;           // default false → copy old target to `${filePath}.bak` BEFORE writing
}

atomicWriteFileSync(filePath: string, content: string | Buffer, options?: AtomicWriteOptions): void
atomicWriteJson(filePath: string, obj: unknown, options?: AtomicWriteOptions): void
```

### 2.3 Algorithm (exact order)

1. `mkdirSync(dirname(filePath), {recursive: true})`.
2. If `backup === true` **and** `existsSync(filePath)`: `copyFileSync(filePath, filePath + '.bak')`. Any failure is **swallowed** (must not block the write). This is a plain copy, not atomic; no fsync. Because it happens before the rename, `.bak` always holds the *previous* on-disk version and is never touched again after a successful write.
3. `tmpPath = buildTempName(filePath)`.
4. `fd = openSync(tmpPath, 'w')`; in `try`: `writeFileSync(fd, content, encoding)`, then if `fsync` → `fsyncSync(fd)`; in `finally`: `closeSync(fd)`.
5. `renameSync(tmpPath, filePath)` — replaces the target atomically (same directory ⇒ same volume).
6. On **any** throw from steps 4–5: best-effort `unlinkSync(tmpPath)` (its own failure is ignored), then re-throw the original error.

`atomicWriteJson` = `atomicWriteFileSync(p, JSON.stringify(obj, null, 2) + '\n', opts)`.

### 2.4 Byte-compatibility guarantees

* Content is written **verbatim**: no EOL normalization (`\r\n` stays `\r\n`), no BOM insertion, no character trimming. All "pretty" formatting is the *caller's* `JSON.stringify(x, null, 2) + '\n'`.
* 2-space indent, LF newlines, one trailing `\n`, no trailing whitespace. That is the single serialization format used by `flow.json`, `.bak`, checkpoints, `flow-archive/*.json`, `metrics.json`, `.info.json`, `update_state.json`, `~/.openfeel/config.json`.
* No directory fsync is performed anywhere ⇒ after a hard power loss the directory entry for the rename may not be durable. Do not claim crash-durability beyond the file data.

### 2.5 Windows caveats

* `renameSync` maps to `MoveFileExW(..., MOVEFILE_REPLACE_EXISTING)`: an existing read-only target yields `EPERM`/`EACCES`, an existing target held open by another process without `FILE_SHARE_DELETE` yields `EPERM`/`EBUSY`. **There is no retry loop** — the write throws and the temp file is removed.
* `fsyncSync` = `FlushFileBuffers`.
* `copyFileSync` for `.bak` can itself fail with `EBUSY` if `flow.json` is open elsewhere; failure is swallowed (no `.bak` for that write).
* Long paths: the temp name is longer than the target (`.<name>.<pid>.<12hex>.tmp` = target + 22 chars). Projects near `MAX_PATH` with `flow.json` can fail on the temp file rather than the target.
* Antivirus/indexers briefly opening the just-written temp file can make the immediate `rename` fail; since there is no retry, the operation fails and must be retried by the caller.

---

## 3. File lock protocol (`src/core/fs/file-lock.ts`)

Advisory (cooperative), synchronous, cross-process, **non-reentrant**.

### 3.1 Constants

| Constant | Value | Meaning |
|---|---|---|
| `LOCK_TIMEOUT_MS_DEFAULT` | `5000` | Total acquisition budget. |
| `LOCK_STALE_MS_DEFAULT` | `3000` | Age beyond which a lock file is considered stale. |
| `LOCK_INITIAL_BACKOFF_MS_DEFAULT` | `10` | First sleep. |
| `LOCK_MAX_BACKOFF_MS_DEFAULT` | `500` | Backoff ceiling. |

Rationale recorded in the source: measured P99 critical section ≈ 8.14 ms on NTFS, so 3000 ms ≈ 368×P99; `staleMs < timeoutMs` so a crashed holder's residue can be reclaimed inside one wait window. Heartbeat renewal is explicitly rejected (the event loop is blocked during synchronous critical sections).

### 3.2 Lock file content

`openSync(lockPath, 'wx')` (O_CREAT|O_EXCL) succeeds ⇒ we own it. Then a **compact** JSON (no whitespace) is written and the fd closed:

```json
{"pid":12345,"time":1730000000000,"token":"9f8e7d6c5b4a3928"}
```

`token = randomBytes(8).toString('hex')` (16 hex chars). `time` = `Date.now()`. There is **no** trailing newline, **no** indentation.

### 3.3 Acquisition loop

```
mkdirSync(dirname(lockPath), {recursive:true})
token    = randomBytes(8).toString('hex')
deadline = Date.now() + timeoutMs
backoff  = initialBackoffMs
loop:
  try  fd = openSync(lockPath,'wx'); write {pid,time:Date.now(),token}; closeSync(fd); break
  catch e:
      if e.code !== 'EEXIST' → throw e            // permission/ENOENT/etc. surface immediately
  tryReclaimStale(lockPath, staleMs)              // best-effort, result ignored
  if Date.now() >= deadline → throw new Error(`获取文件锁超时（${timeoutMs}ms）：${lockPath}`)
  jitter  = 1 + (Math.random() - 0.5) * 0.4       // ∈ [0.8, 1.2)
  sleepSync(min(backoff, maxBackoffMs) * jitter)  // Atomics.wait on a SharedArrayBuffer (blocking, 0% CPU)
  backoff = min(backoff * 2, maxBackoffMs)
```

`sleepSync` uses `Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)` — a true synchronous block, not a busy loop.

The timeout message is hard-coded Chinese, **not** i18n'd.

### 3.4 Stale-lock reclamation

```
tryReclaimStale(lockPath, staleMs):
  mtimeMs = statSync(lockPath).mtimeMs          // throw → return false (already gone)
  if Date.now() - mtimeMs <= staleMs → return false
  stalePath = `${lockPath}.stale.${pid}.${randomBytes(4).toString('hex')}`   // 8 hex
  try renameSync(lockPath, stalePath) catch → return false   // ENOENT = someone else won; EPERM/EBUSY = Windows holder alive
  try unlinkSync(stalePath) catch → ignore
  return true
```

The `rename` is the atomic claim: exactly one concurrent process wins; losers see `ENOENT` and fall back to the retry loop. Reclaimed residue has a unique name so it never blocks later acquisitions.

### 3.5 Release

In a `finally` around the critical section: re-read the lock file as JSON; **only if** `info.token === token` do `unlinkSync(lockPath)` (failure ignored). This prevents a process that overran its TTL from deleting a *newer* holder's lock.

### 3.6 Conformance requirements & caveats

* **Non-reentrant.** Re-entering `withFileLock` for the same `lockPath` in the same process sees its own lock as `EEXIST`, cannot reclaim it (fresh mtime), and spins until `timeoutMs` → throws. Never nest the same lock name.
* **Never nested across features.** `flow` and `flow-archive` are deliberately separate lock names and MUST NOT be held simultaneously by one code path ("裁定 P"): the archive file is written under `flow-archive`, then `flow.json` is saved under `flow` — sequentially, never nested.
* **Readers do not lock.** `load()` / `readDiskRevision()` / archive reads / `flow archive list|show` take no lock at all; consistency comes from the atomic rename plus the revision CAS (§4.4).
* Any critical section longer than `staleMs` (3000 ms) risks having its lock stolen. All current critical sections are single small file read-modify-writes.
* Windows: (a) deleting an open lock file can fail → the lock lingers for up to 3 s until reclamation; (b) renaming a lock file held open by another process fails `EPERM`/`EBUSY` → treated as "not stale", retry until timeout; (c) a backwards system-clock jump makes `Date.now() - mtimeMs` small, postponing reclamation.
* Global locks exist so that *different projects* on one machine serialise cross-project writes (`~/.openfeel/config.json`, `~/.openfeel/update_state.json`, the CLI runtime log).

---

## 4. `flow.json` contract

### 4.1 Path and top-level shape

`<project>/.openfeel/flow.json`

```jsonc
{
  "meta": {
    "version": "1.0",
    "project": "OpenFeel",
    "updated": "2026-10-15T07:34:06.404Z",   // ISO-8601 UTC, ms precision
    "revision": 1187,                         // optional; absent ≡ 0
    "archived_versions": ["v1.0.0", "v1.1.0"] // optional; absent ≡ []
  },
  "pipeline": {
    "phase": "active",                        // MetaPhase: active | paused | done
    "current": { "stage": "v1.2.1-stage-93", "op": "" },
    "retry": 0
  },
  "stages": {
    "v1.2.0-stage-78": {
      "name": "v1.2.0-stage-78",
      "phase": "done",                        // PipelinePhase enum
      "status": "done",
      "deps": [],
      "ops": {
        "op-001": {
          "title": "…",
          "state": "pending",                 // pending | executing | done | failed | draft
          "assignee": "openfeel-executor",
          "attempts": 0,
          "max_attempts": 3,
          "checkpoints": {
            "plan": "pending", "scheme": "pending",
            "exec": { "attempts": 0, "self": "pending" },
            "review": "pending", "test": "pending"
          },
          "attempted_at": "…",                // optional
          "completed_at": "…"                 // optional
        }
      },
      "stats": { "start_time": "…", "end_time": "…", "duration_ms": 4799534 },  // optional
      "workflow_mode": "full",                // optional redundant field
      "requirement_id": null                  // optional
    }
  },
  "reviews": [
    {
      "id": "REV-78-001",
      "op": "v1.2.0-stage-78.op-001",         // "<stageId>.<opId>" or "<stageId>"
      "status": "open",                       // open | resolved | closed
      "priority": "high",                     // high | medium | low
      "title": "…",
      "filed_by": "openfeel-reviewer",
      "filed_at": "…",
      "canAutoFix": true,                     // optional
      "autoFixDetail": "…",                   // optional
      "blocking": true                        // optional; absent ⇔ blocking
    }
  ],
  "requirements": [],                          // optional; absent ≡ [], NOT repaired on load
  "log": [
    { "time": "…", "agent": "cli", "action": "advance_stage_phase",
      "detail": { "stageName": "v1.2.0-stage-78", "from": "exec_running", "to": "review_pending" } }
  ]
}
```

**`requirements` ordering note:** the key is written only when set, so it typically appears after `reviews`/`log`. A reimplementation must not force a key that is absent.

**`op.id` is runtime-only.** On disk an `ops` entry never carries `id`; the map key is authoritative. `load()` injects `op.id = <map key>`; `save()`, `saveCheckpoint()` and `repair()` delete `id` from the deep-cloned snapshot before serializing. A reimplementation MUST NOT persist `id`.

### 4.2 Serialization format

`JSON.stringify(obj, null, 2) + '\n'` written through `atomicWriteFileSync`.

* 2-space indentation, no tabs.
* LF only (JSON.stringify never emits other EOLs; content is not normalized).
* Exactly one trailing newline; no trailing spaces.
* **Key order = JS insertion order of the in-memory object**, which for a loaded file equals the parse order of the file. Implementations must therefore preserve object key order across load→save round-trips instead of re-sorting. The canonical *new-file* order is `meta, pipeline, stages, reviews, log`; inside `meta`: `version, project, updated, revision, archived_versions`; inside `pipeline`: `phase, current{stage,op}, retry`.
* Empty objects/arrays serialize as `{}` / `[]` (JSON.stringify semantics — no multi-line empty containers).
* Non-finite numbers become `null`; `undefined` values are dropped.

### 4.3 Default template (`defaultFlowData()`, also `FlowManager.initFlow`)

```json
{
  "meta": { "version": "1.0", "project": "OpenFeel", "updated": "<now ISO>", "revision": 0 },
  "pipeline": { "phase": "active", "current": { "stage": "-", "op": "init" }, "retry": 0 },
  "stages": {},
  "reviews": [],
  "log": []
}
```

`initFlow(projectPath)`: `mkdir -p .openfeel`; **if `flow.json` exists, return without touching it**; otherwise write the template with `revision: 0` via `atomicWriteFileSync` — **no lock** (first creation, no concurrent readers) and no `.bak`.

### 4.4 Revision / optimistic concurrency (CAS)

State: `FlowManager.loadedRevision: number` (private), initialised `0`.

`extractRevision(data)` = `typeof data.meta.revision === 'number' && Number.isInteger(...) ? revision : 0`.
`readDiskRevision()` = read + `JSON.parse` the file and apply the same rule; **file missing, unreadable, or unparsable ⇒ `0`**.

`load()` sets `loadedRevision = extractRevision(parsed)` (i.e. the CAS baseline is the revision observed **at construction / last successful write**).

`save()` — the only routine write path:

```
if (!this.data) return
this.data.meta ??= { version:'1.0', project:'', updated:'', revision:0 }   // only if meta is entirely missing
this.data.meta.updated = new Date().toISOString()                          // mutates live object before cloning
serializable = JSON.parse(JSON.stringify(this.data))                       // deep clone
for each stage, for each op: delete op.id

withFileLock(`.openfeel/tmp/locks/flow.lock`, () => {
    diskRevision = readDiskRevision()
    if (diskRevision !== this.loadedRevision)
        throw new FlowConcurrentModificationError(this.loadedRevision, diskRevision)
    nextRevision = this.loadedRevision + 1
    serializable.meta.revision = nextRevision
    content = JSON.stringify(serializable, null, 2) + '\n'
    atomicWriteFileSync(filePath, content, { backup: true })
    this.data.meta.revision = nextRevision
    this.loadedRevision    = nextRevision
})
catch (err) { console.error(`[ERROR] flow.json 保存失败: ${err.message}`); throw err }
```

**Semantics a reimplementation must match:**

* Revision is a **monotonically increasing integer**, bumped by exactly `+1` on **every** successful `flow.json` write. There is no reset, no wrap, no "content hash".
* The CAS compares **exact equality** of `loadedRevision` against the on-disk integer. A file with a missing/invalid `revision` counts as `0`, so the first write of a legacy file goes `0 → 1`.
* The comparison and the write happen **inside the lock**, so the pattern is read-modify-write under an advisory lock **plus** an optimistic re-read (belt and braces).
* A reader that wants to write MUST adopt the same protocol: read the file, remember its integer `revision` as `expected`, perform the whole read-modify-write under `flow.lock`, re-read `revision`, and abort if it changed.
* An instance may `save()` repeatedly: after each success both the live object and `loadedRevision` are updated, so the next `save()` from the same process is not a false conflict.
* The in-memory `meta.updated` is set even if the write subsequently fails (the object is mutated before the lock).

**Conflict error**

```ts
class FlowConcurrentModificationError extends Error {
  readonly expectedRevision: number;
  readonly actualRevision: number;
  message = `flow.json 并发冲突：期望 revision=${expected}，磁盘为 ${actual}（已被其它进程修改）`;
  name = 'FlowConcurrentModificationError';
}
function isFlowConcurrentError(err): boolean   // instanceof OR name === 'FlowConcurrentModificationError'
```

The name-based fallback exists to survive duplicated module instances / `instanceof` failures.

**Command-layer rendering** (`src/commands/shared/errors.ts`, `EXIT_CONCURRENT = 2`):

```ts
console.error(t('common.concurrentConflict', lang, {expected, actual})); process.exit(2);
```

* zh: `[并发冲突] flow.json 已被其它进程修改（期望 revision={expected}，磁盘={actual}）；本次修改未写入，请重新执行该命令重试。`
* en: `[concurrent conflict] flow.json was modified by another process (expected revision={expected}, on-disk={actual}); this change was not written, please retry.`

Commands that route through `handleConcurrentConflict`: `flow advance`, `flow stage …` writes, `plan stage add`/`flow stage add` (via `handleAddStageError`), `flow archive <version>`, and checkpoint restore (which prints a warning instead, see §4.7).

**Other `revision` writers**

| Writer | Rule | CAS? |
|---|---|---|
| `save()` | `loadedRevision + 1` | ✅ |
| `restoreCheckpoint()` | `diskRevision + 1` (rebase onto disk; still inside the lock) | ✅ |
| `repair()` (write-back) | `(typeof meta.revision === 'number' ? meta.revision : 0) + 1` — evaluated on the **parsed disk object** | ❌ (lock only ⇒ last-writer-wins) |
| `FlowManager.initFlow()` | literal `0` | n/a (create-only) |
| `flow migrate` | writes through `save()` afterwards | ✅ |

### 4.5 `.bak` behaviour

* Produced **only** by `atomicWriteFileSync(..., {backup:true})`, i.e. `save()` and `restoreCheckpoint()`; `repair()` passes `backup: !recovered` (when recovering from `.bak`, the existing `.bak` is preserved rather than overwritten with the corrupt file).
* Path is always `<file>.bak` (`.openfeel/flow.json.bak`).
* It is a plain byte copy of the file **as it was immediately before this write**.
* After a successful write the `.bak` is **never** touched again — it always holds exactly the previous generation, not a rolling history.
* `.bak` creation failure never blocks the write.
* `flow repair --backup` additionally does a plain `copyFileSync(flow.json, flow.json.bak)` *before* repairing.
* `.bak` is the recovery source for a corrupt `flow.json` inside `repair()` (§4.6) — nothing else reads it.

### 4.6 Load-time tolerance: repaired vs fatal

`load()` (called from the constructor and after every successful direct write):

```
if (!existsSync(filePath)) { data = null; loadedRevision = 0; return }
try {
    data = JSON.parse(readFileSync(filePath,'utf-8'))
    loadedRevision = extractRevision(data)
    for each [_, stage] of Object.entries(data.stages ?? {}) {
        stage.ops  ??= {}          // absent only
        stage.deps ??= []          // absent only
        if ops is a non-array object: for each [opKey, op] of entries: op.id = opKey
    }
} catch { data = null; loadedRevision = 0 }      // silent, no console output
```

**Tolerated silently at load (mutated in memory):**

* Missing `stages` (the whole map is simply skipped — no crash).
* `stage.ops` absent → `{}`; `stage.deps` absent → `[]`.
* `op.id` absent / wrong → overwritten from the map key.
* `stage.ops` being `null`/an array → left as-is (the `typeof` guard skips the `id` injection).
* `meta.revision` missing/non-integer → treated as `0`.

**Not repaired at load — handled only by `validate()` / `health` / `repair()`:**

* `meta` / `meta.version` / `meta.project` / `meta.updated` missing.
* `pipeline` / `pipeline.current` / `pipeline.retry` missing or `phase` not a `MetaPhase`.
* `stages` not an object, or `ops` not an object, or an illegal `PipelinePhase`.
* `reviews` / `log` not arrays.

**Fatal (whole instance unloaded):**

* File unreadable, or any `JSON.parse` failure ⇒ `data = null`, `loadedRevision = 0`. No exception escapes the constructor. `isLoaded()` then returns `false`, and commands print `common.errorNoInit` and exit `1`:
  * zh: `错误：flow.json 未初始化，请先运行 openfeel init`
  * en: `Error: flow.json not initialized, please run openfeel init first`
* Validation is *never* fatal: `validate()` returns `{valid, errors[], warnings[]}` where errors are Chinese strings (`meta.version 缺失`, `pipeline.phase 缺失`, `stages 不是有效对象`, `reviews 不是有效数组`, `log 不是有效数组`, …). `validate()` **does** mutate in-memory phases via fuzzy correction and pushes a matching warning.

`repair(dryRun, {pruneOrphans})` — the explicit healing path, in order:

1. `flow.json` missing → `initFlow`, change `flow.json 不存在，已创建默认 flow.json` (dry-run reports only).
2. Read fails → `无法读取 flow.json`, `fixed:false`.
3. `JSON.parse` fails → try `flow.json.bak`; on success `recovered:true`, change `flow.json 解析失败，已从 .bak 恢复`.
4. Both corrupt → dry-run reports `flow.json 和 .bak 均已损坏（dry-run 模式下不自动重建）`; otherwise `unlinkSync(flow.json)` + `initFlow`, change `flow.json 和 .bak 均已损坏，已重建默认 flow.json`.
5. No `.bak` → dry-run reports `flow.json 解析失败且无 .bak（dry-run 模式下不自动重建）`; otherwise unlink + `initFlow`, change `flow.json 解析失败且无 .bak，已重建默认 flow.json`.
6. Field repair: whole `meta`; `meta.version`/`project`/`updated`/`revision`; whole `pipeline`; `pipeline.current`; `pipeline.retry`; `pipeline.phase` (fuzzy `MetaPhase`, worst case `active`); `stages` type; per-stage `phase` (fuzzy `PipelinePhase`, worst case `plan_pending`, message `… 无法修正，使用默认值 'plan_pending'`); per-stage `ops` → `{}`; `reviews` → `[]`; `log` → `[]`. Each emits a Chinese `changes[]` entry.
7. `pruneOrphans` (opt-in, never in dry-run): delete `flow.json` op keys that have no `ops/op-NNN*.md` file. **Files are never deleted.** Appends `{time, agent:'cli', action:'prune_orphan_ops', detail:{count, ops:['stage.op-001', …]}}` to `flowData.log` (the parsed copy, not `this.data`).
8. Write back when `(modified || recovered) && !dryRun`: `meta.revision = (number? : 0) + 1`; deep clone; delete `op.id`; `JSON.stringify(…, null, 2)+'\n'`; `withFileLock('flow')` → `atomicWriteFileSync(…, {backup: !recovered})`; then `this.load()` to resync `data` + `loadedRevision`. A write failure yields change `修复后写入失败: {msg}` and `fixed:false`.

`orphan` reconciliation rule (used by both `repair` and `health`): op files match `/^(op-\d+)/` under `.openfeel/plan/{series}/{stageDir}/ops/`, so both `op-001.md` and `op-001_*.md` count as present. Non-parseable stage ids are skipped.

### 4.7 Checkpoints and restore (same serialization, different CAS baseline)

* Directory `.openfeel/checkpoints/`; filename `{stageId}-{yyyyMMddTHHmmssSSS}-{phase}.json` (millisecond timestamp, local time, no `Z`), e.g. `v1.1.1-stage-01-20260926T140355939-done.json`.
* Content = same serializer, `op.id` stripped, `meta.revision` copied from the source snapshot (not bumped).
* Written via `atomicWriteFileSync` with **no lock** and full `try/catch` (failure silently ignored — snapshots must never block a phase advance).
* Retention: 20 per stage (`CHECKPOINT_MAX_KEEP`); after each save, oldest files for that stage (ascending filename) are deleted until ≤ 20.
* Filename safety on restore: reject names containing `/`, `\` or `..`; require existence; require parseable content.
* `restoreCheckpoint(filename, {stage?, dryRun?})`:
  * `dryRun` → pure preview, zero writes, reports `conflicts` by comparing `readDiskRevision() !== loadedRevision`.
  * Otherwise, under `flow.lock`: if `readDiskRevision() !== loadedRevision` ⇒ `conflict = true`, no write, then `console.warn(flow.manager.snapshotRestoreRefused)` (`[WARN] flow.json 已被其它进程修改，拒绝从快照恢复（请重新加载后重试）`), return `false`.
  * Else build the target data (full = snapshot; `stage` = disk base with that one stage subtree replaced), set `meta.revision = diskRevision + 1`, write with `{backup:true}`, then `load()`. Return `true`. Any thrown error ⇒ `false`.

---

## 5. Logs

Three **independent** log systems; do not conflate them.

### 5.1 `flow.json` `log[]` — pipeline audit trail

Shape: `{time: ISO8601, agent: string, action: string, detail: object}`.

`appendLog(entry)`:

```
if (!this.data) return
this.data.log.push({ ...entry, time: entry.time || new Date().toISOString() })
```

* **Append-only, in insertion order.** Callers may pass `time: ''` to auto-stamp.
* **No maximum length, no trimming, no rotation, no dedupe, no sorting.** `flow.json` grows until a version archive moves entries out (§6). Observed live file: 462 log entries.
* `detail` is always an object (possibly `{}`). Known `detail` keys: `stageName`, `from`, `to`, `opId`, `session_id`, `review_tier`, `version`, `stages`/`reviews`/`log` counts, `archivePath`, `opsCount`, `reviewsCount`, `knowledgeCount`, …
* Notable `action` values: `advance_stage_phase`, `reset_stage_phase`, `archive_stage`, `archive_flow_version`, `prune_orphan_ops`, `auto_fix_review`, `review_added`, `review_update`, `review_remove`, `attempt_pass`/`attempt_fail_*`, `stage_completed`.
* Readers: `flow log --last N` (default 10) prints `data.log.slice(-N)` with a `{n}` title; `flow status` prints `日志总数: data.log.length` (= `flow.status.logTotal`); cross-session resume detection scans backwards for the last `advance_stage_phase`/`reset_stage_phase` with `detail.stageName === stageKey && detail.to === exitedPhase`, then compares `detail.session_id` — a `proc:`-prefixed id on either side makes the result undeterminable (`resumed` omitted).
* Persisted only through `save()`; `appendLog` itself never writes.

### 5.2 Workspace audit log files — `.openfeel/log/` (`public-logger.ts`)

**Path:** `.openfeel/log/{yyyy}/{MM}/{dd}/{yyyy-mm-dd}-{username}-{NNN}.md` (nested layout = the only one written since v1.1.2).

**Sequence:** `NNN` is a 1-based, 3-digit, per-day counter, allocated atomically by `reserveSequence` (`openSync(path,'wx')` empty-file占位, `EEXIST` ⇒ increment; up to 1000 attempts). Candidate start = `max(parsed NNN of files matching \`${date}-${username}-\`) + 1`. Only filenames are parsed — never file contents — so a crashed placeholder still claims its number.

**Lock:** `withFileLock(.openfeel/tmp/locks/log.lock)` wraps *allocate + write file + update all three indexes* in one critical section.

**File content template** (`lines.join('\n')`, ending with a single `\n`):

```
# {fileName without .md}

- **时间**：{now.toISOString()}
- **操作者**：{username}
- **事件类型**：{状态变更|审查事件|测试事件|里程碑}
- **操作**：{action}
[- **关联操作**：{opId}]
[- **变更前**：{from}]
[- **变更后**：{to}]

## 补充信息
- **{key}**：{String(value)}
```

(`## 补充信息` block only when `extra` has ≥1 key; `milestone` merges `{title, ...extra}` and takes `extra.action` as the action, default `milestone`.)

**Indexes maintained in the same critical section:**

* `{day}/day_index.md` — header `# {yyyy-mm-dd}\n\n## 日志列表\n| 文件 | 操作者 | 描述 |\n|------|--------|------|` then one row per file. Appends are idempotent (`content.includes(fileName)` ⇒ no-op); trailing whitespace stripped before appending.
* `.openfeel/log/index.md` — "date index". Header `# 日志索引\n\n## 日期索引\n\n| 日期 | 摘要 |\n|------|------|\n`. Adds a row per (date, description) for the nested layout plus one row per **legacy flat** directory `{yyyy-mm-dd}/` (layout tags `（嵌套）` / `（历史扁平）`). Idempotent per row; missing rows are inserted at the end of the existing table.
* `.openfeel/log/log.md` — "recent 30". Header `# 最近日志\n\n| 文件 | 用户 | 描述 |\n|------|------|------|\n`; the new row is inserted **immediately after the `|------|------|------|` separator** (newest first); then *all* lines starting with `| [` are counted and only the first **30** are kept (older rows dropped). A file whose separator is missing is reinitialised.

**Failure policy:** the entire operation is wrapped in `try/catch` → `console.warn(t('flow.log.writeFailedTmpl'))` = `[WARN] 公共日志写入失败: {err}`. Audit logging never blocks the pipeline.

**Layout compatibility:** legacy flat directories `.openfeel/log/{yyyy-mm-dd}/` are read-only — scanned by `updateRootIndex`, never migrated, never deleted, requires no `day_index.md`.

**Username source:** `.openfeel/.info.json` `user` (string, non-empty) else `git config user.name` else `'unknown'`. Loaded once per `PublicLogger` singleton (cached per `projectPath`).

### 5.3 CLI runtime log — `~/.openfeel/cli/logs/` (`runtime-log.ts`)

**Path:** `~/.openfeel/cli/logs/openfeel-{YYYY-MM-DD}.log` (local date, one file per day, never rotated or cleaned).

**Line format (exact):**

```
[{ISO8601}][{LEVEL}][{pid}] {message}\n
```

`LEVEL` ∈ `DEBUG|INFO|WARN|ERROR` (uppercased). Appended with `appendFileSync(..., {encoding:'utf-8'})` under `withFileLock(~/.openfeel/locks/runtime-log.lock)`.

**The three canonical lines:**

```
… [INFO] cli start: {argv.join(' ')} [project={process.cwd()}] [session={sessionId}]
… [INFO] cli done exit={code} [duration_ms={ms}] [project={process.cwd()}] [session={sessionId}]
… [DEBUG] metrics skip (no baseline): stage={stage} phase={phase}       (debug only)
```

* `duration_ms` = `Date.now() - PROCESS_START_MS`, where `PROCESS_START_MS` is captured at **module load** (includes subsequent module resolution + command execution; excludes node bootstrap).
* `project` = `process.cwd()` verbatim (so it may contain spaces; the `[key=value]` bracket form keeps parsing unambiguous).
* `session` = session id, see below.
* `cli done` is written at most once: a module-level `cliDoneLogged` flag is set **before** the write (so `--no-log` still records "done happened"); the `exit` handler is the single writer, and `SIGINT`→`process.exit(130)` / `SIGTERM`→`process.exit(143)` merely preserve the interrupt semantics.

**Session id** (`src/core/session.ts`), memoised per project, three-level chain:

1. `env:` + `CLAUDE_CODE_SESSION_ID` (if non-empty after trim);
2. `project:` + `session_id` from `<project>/.openfeel/tmp/session.json` (shape `{session_id, source:'env', started_at}`; written best-effort when the env value is found);
3. `proc:` + first 8 chars of a `randomUUID()` — **never persisted**.

Only `env:` / `project:` ids participate in cross-session resume detection; `proc:` short-circuits to "unknown".

**Enable / disable / level (resolved from env + argv, re-evaluated on `installRuntimeLog`):**

| Knob | Effect |
|---|---|
| `--no-log`, `OPENFEEL_LOG=0`, `OPENFEEL_NO_LOG=1` | disable entirely |
| `--debug`, `OPENFEEL_DEBUG=1` | `minLevel = 'debug'` (default `'info'`) |
| `--log-file <p>` / `--log-file=<p>` / `OPENFEEL_LOG_FILE` | override path (absolute-resolved) |

Library-side default is **disabled** (`config === null` ⇒ every call is a no-op); only `bin/openfeel.js` calls `installRuntimeLog`. Every write is best-effort: any failure (disk, permission, lock timeout) is swallowed.

---

## 6. Version archive — `flow archive <version>`

Purpose: shard a **finished version's** stages/reviews/logs **out of `flow.json`** into a per-version archive file, then compact `pipeline`.

### 6.1 Archive file schema (`archive-file.ts`)

Path: `<project>/.openfeel/flow-archive/{version}.json` — `version` includes the leading `v`, e.g. `v1.1.7.json`.

```jsonc
{
  "version": "v1.1.1",            // canonical, leading v
  "stages": { "v1.1.1-stage-01": { /* StageData verbatim */ } },
  "reviews": [ /* ReviewItem verbatim */ ],
  "log": [ /* LogEntry verbatim */ ],
  "counts": { "stages": 1, "reviews": 0, "log": 12 },
  "schemaVersion": 1,
  "archived_at": "2026-10-11T19:32:01.256Z"
}
```

* `ARCHIVE_SCHEMA_VERSION = 1`. Written **always** as `1`; read tolerantly (unknown values are not rejected).
* **Key order on disk is exactly as above** — `version, stages, reviews, log, counts, schemaVersion, archived_at` — because the command assembles `{...split.archive, schemaVersion, archived_at}` where `split.archive` is `{version, stages, reviews, log, counts}`. A reimplementation must reproduce this order to be byte-identical.
* `counts` is redundant metadata; on read, if any of the three numbers is missing, all three are recomputed from the actual lengths (`withCountsFallback`, read-time only, never written back).
* Same serializer everywhere: `JSON.stringify(file, null, 2) + '\n'`.
* Write is `atomicWriteFileSync(..., {backup:false})` under the **separate** lock `flow-archive` (`.openfeel/tmp/locks/flow-archive.lock`), after `mkdirSync(flow-archive, {recursive:true})`.
* Overwriting an existing file is the intended, idempotent "re-archive" path.

### 6.2 Version string rules

* Valid version: `isValidArchiveVersion(s)` ⇔ `s.length > 0` and `versionOfStageId(`${s}-stage-00`) === s`, i.e. the probe stage id parses (`/^(v\d+(?:\.\d+)*)-stage-(\d+)$/`) and the version segment round-trips. Net effect: `v` + dot-separated numbers, e.g. `v1`, `v1.1`, `v1.0.0`, `v4`. Empty strings, path separators, `stage-01`, `V1.0.0` (uppercase) are invalid.
* `normalizeArchiveVersion(input)`: `trim()` → drop **one** leading `v` if present → prepend `v` → validate. So `1.1.7` → `v1.1.7`, `v1.1.7` → `v1.1.7`, `vv1.1.7` → invalid (`null`), `""` → `null`. Invalid ⇒ CLI exit 1, **zero writes**.
* `versionOfStageId(stageId)` = `parseStageId(stageId)` then strip the `-{stageDir}` suffix. Short names (`stage-01`) normalise to `v1.0.0-stage-01` ⇒ version `v1.0.0` (`DEFAULT_STAGE_VERSION`).

### 6.3 Sharding rules (`splitForArchive`, pure)

Given `version`:

| Section | Moves to the archive iff | Stays in `flow.json` |
|---|---|---|
| `stages` | `versionOfStageId(stageId) === version` | everything else, incl. unparseable stage ids |
| `reviews` | `versionOfReviewOp(review.op) === version` | everything else |
| `log` | `versionOfLogEntry(entry) === version` | everything else |

* `versionOfReviewOp(op)`: strip a trailing `.op-NNN` via `/^(.+)\.(op-\d+)$/` (dot-anchored, because a stageId may itself contain dots), then `versionOfStageId` on the remainder. Empty/non-string ⇒ `null`.
* `versionOfLogEntry(entry)`: reads **only** `detail.stageName`. `detail.stageId`, `detail.stage`, etc. are deliberately ignored. Missing / non-string / unparseable ⇒ `null` ⇒ the entry **stays** in `flow.json`.
* Order is preserved on both sides (object key order / array order).
* Groups are computed with stable insertion order (`groupStagesByVersion`); unparseable stage ids never form a group and are therefore never archivable.
* All moved objects are the original references (shallow) — a reimplementation may deep-copy, but must not mutate them.

`meta.archived_versions` is **not** touched by `splitForArchive`.

### 6.4 The gate

`flow archive <version>` has exactly two options: `--dry-run`, `--json`. **There is no `--force`.**

Evaluation order (each failure ⇒ exit code 1, zero writes):

1. **Init gate** — `flow.json` not loaded: JSON `{schemaVersion:1, error:'no-init'}`; text `common.errorNoInit`.
2. **Version syntax gate** — `normalizeArchiveVersion` returns `null`:
   * JSON `{schemaVersion:1, error:'invalid-version', input:<raw input>}`
   * zh: `{input} → 非法版本号（应为 vX.Y[.Z] 形式，如 v1.1.7）`
   * en: `{input} → invalid version (expected vX.Y[.Z], e.g. v1.1.7)`
3. **Existence gate** — `listArchivableCandidates(data).find(c => c.version === version)` is `undefined` (version absent from the active `stages` keys, i.e. never existed **or already archived**):
   * JSON `{schemaVersion:1, error:'version-not-active', version}`
   * zh: `版本 {version} 未注册于活跃 flow.json（不存在或已归档）；拒绝归档（零写盘）`
   * en: `Version {version} is not registered in the active flow.json (missing or already archived); archive refused (zero writes)`
4. **Gate** — rejected if **either** condition holds:
   * **all stages of that version must be `phase === 'done'`**, with the empty-set guard: `allDone = stageIds.length > 0 && stageIds.every(id => data.stages[id]?.phase === 'done')` (an empty group is never "all done", though in practice step 3 already excluded it);
   * **no blocking open review** in that version's scope, using the single repository-wide predicate
     `r.blocking !== false && r.status === 'open'` (absent `blocking` **means blocking**) and the same version-scope resolution as the split (`versionOfReviewOp(r.op) === version`).
   * JSON: `{schemaVersion:1, error:'gate-rejected', version, notDone:[stageIds…], blockingOpen:[reviewIds…]}`
   * Text output, in this order:
     ```
     ▶ if notDone.length > 0:
       zh: 版本 {version} 存在未完成阶段（{n} 个）：
       en: Version {version} has unfinished stages ({n}):
       then one line per stage: "  - {stageId} [{phase}]"      (flow.archive.gateItemTmpl = '  - {item}')
     ▶ if blockingOpen.length > 0:
       zh: 版本 {version} 存在阻塞 open 审查（{n} 条）：
       en: Version {version} has blocking open reviews ({n}):
       then one line per review: "  - {id}: {title} (priority={priority})"
     ▶ always last:
       zh: 归档判据未满足，拒绝执行（零写盘）
       en: Archive gate not satisfied, refused (zero writes)
     ```
   * exit code 1.

**One-line rule:** *a version is archivable ⇔ it still has stages in `flow.json` ∧ every one of those stages is `phase==='done'` ∧ it has no review with `status==='open'` and `blocking!==false`.*

### 6.5 Write order and effects (non-dry-run)

```
① writeArchiveFile(project, {version, stages, reviews, log, counts, schemaVersion:1, archived_at:now})
      → lock `flow-archive`; mkdir; atomic write; backup:false
      → on failure: JSON {error:'archive-write-failed', version} / common.errorTmpl; exit 1; memory untouched, flow.json untouched
② data.stages  = remainder.stages
   data.reviews = remainder.reviews
   data.log     = remainder.log
③ added = addArchivedVersion(data, version)        // meta.archived_versions, idempotent, in-memory only
④ disposed = applyArchivePipelineDisposition(data, version)   // in-memory only
⑤ mgr.appendLog({time:'', agent:'cli', action:'archive_flow_version',
                 detail:{version, stages, reviews, log}})     // counts, not the entries
⑥ mgr.save()  → revision+1, .bak updated, atomic write under the `flow` lock
      → FlowConcurrentModificationError ⇒ handleConcurrentConflict ⇒ exit 2
        (archive file already written; re-running is idempotent)
```

The invariant is **archive file first, `flow.json` second**: if the process dies between ① and ⑥, the archive exists but `flow.json` still has the entries — a re-run is idempotent (overwrite). The reverse order is never allowed.

**Pipeline disposition** (`applyArchivePipelineDisposition`, after stages were removed):

* `currentCleared = versionOfStageId(data.pipeline.current.stage) === version`; when true, `pipeline.current = {stage:'', op:''}` (both cleared).
* `pipeline.phase` is recomputed over the **remaining** stages: `allDone = keys.length > 0 && every(s.phase === 'done')` ⇒ `'done'`, else `'active'`. Empty set ⇒ `'active'` (never `'done'`).
* `pipeline.retry` is untouched.

**`meta.archived_versions` maintenance** (`addArchivedVersion`):

* Pure in-memory; if `data.meta` is missing it is first set to `{version:'1.0', project:'', updated:'', revision:0}`.
* `getArchivedVersions` returns a **copy** (`[...list]`); a non-array/absent value reads as `[]`.
* Append **only if not already present**; returns `added: false` for a duplicate (⇒ the CLI prints the "re-archived" message instead of "archived").
* **Nothing ever removes an entry.** No `removeArchivedVersion` exists; the list is the monotonically growing version index.
* Persisted only by step ⑥'s `save()`.

### 6.6 `flow archive list`

Read-only: no lock, no `save()`, no `appendLog()`, **does not even read `flow.json`**.

* Versions come from the **filesystem**: `readdirSync(flow-archive)`, keep `*.json`, strip `.json`, keep names passing `isValidArchiveVersion`, **sort lexicographically** (`['v1.0.0','v1.1.0','v1.1.1','v1.1.10','v1.1.2', …]` — *not* semantic version order). Missing dir ⇒ `[]`.
* Each version's `counts` is re-read via `readArchiveFile` (corrupt ⇒ `null`).
* `--json`: `{"schemaVersion":1,"versions":[{"version":"v1.1.7","counts":{"stages":1,"reviews":0,"log":12}}]}`. (`--json` on the child also honours `--json` on the parent command.)
* Text: empty ⇒ `暂无归档版本（.openfeel/flow-archive/ 为空或不存在）` / `No archived versions (.openfeel/flow-archive/ is empty or missing)`; else title `已归档版本：` / `Archived versions:` then per row
  `  + {version}：阶段 {stages} / 审查 {reviews} / 日志 {log}` (`  + {version}: stages {stages} / reviews {reviews} / log {log}`), or `  + {version}：(不可读，文件损坏或非法)` (`  + {version}: (unreadable, file is corrupt or invalid)`).

`readArchiveFile(project, version)` tolerance: invalid version ⇒ `null` (no throw); missing ⇒ `null`; JSON parse error ⇒ `null`; valid JSON that is `null`/array/scalar ⇒ `null`; unknown keys are **preserved** (the object is not rebuilt); missing `counts` ⇒ computed on the fly.

### 6.7 `flow archive show <version>`

* Normalises the version; invalid ⇒ JSON `{schemaVersion:1, error:'invalid-version', input, available}` else text `{input} → 非法版本号…`; exit 1.
* Not found ⇒ JSON `{schemaVersion:1, error:'not-found', version, available}` else
  `归档版本 {version} 不存在；可用版本：{versions}` (with `(无)` / `(none)` when none); exit 1.
* `--json` ⇒ the **entire `ArchiveFile` verbatim** (its own `schemaVersion`/`archived_at`, full `log` and `reviews`), pretty-printed with 2 spaces.
* Text: `归档版本 {version}（archived_at: {at}）` → `阶段 {stages} / 审查 {reviews} / 日志 {log}` → `阶段：` → one `  - {stage} [{phase}]` per stage (or `(无)`/`(none)`) → `（完整 log / reviews 请用 --json 查看）`.

### 6.8 `--dry-run`

Pure in-memory rehearsal; **four write sites untouched**: no archive file, no `addArchivedVersion`, no `appendLog`, no `save()`.

* Gates 1–4 still run identically (so a rejected gate still exits 1).
* The pipeline disposition is computed on a **deep-copied** view (`pipeline` and `pipeline.current` cloned) so the live object is never mutated.
* Output: `[dry-run] 将归档 {version}：阶段 {stages} / 审查 {reviews} / 日志 {log}`, then `pipeline 处置：current={current}，phase={phase}`, then `（预览模式：未写入任何文件）`; `--json` ⇒ `{schemaVersion:1, version, stages, reviews, log, dryRun:true}`.

### 6.9 Archive consistency health (`archive-health.ts`, consumed by `flow health`)

Two warn-only items (never `fail`, never affect the exit code; skipped by `--quick` and when `flow.json` is not loaded):

1. **`归档一致性`** — `meta.archived_versions` ↔ archive directory, bidirectional diff.
   * both diffs empty: `pass`, `归档索引与归档文件一致（{n} 个版本）`.
   * otherwise `warn`, listing up to 5 each:
     `归档索引与文件不一致：索引有文件缺 [{…}]；文件有索引缺 [{…}]（可经 flow archive list / flow archive show 复核）`.
2. **`归档残留`** — a stage still present in `flow.json.stages` that (a) has a version prefix in `archived_versions` **and** (b) whose stage id is present in that version's archive snapshot `stages` keys (proving it was archived). Non-candidates do not read archive files; an unreadable snapshot ⇒ cannot prove ⇒ not reported. Produces one `warn`:
   `flow.json 仍含已归档版本阶段：{…up to 5}（可能由 checkpoint restore 带回或重复归档残留；须重新执行 flow archive <version> 收敛）`.

Related dependency semantics: a `deps` entry is treated as *satisfied* when it carries an explicit version prefix whose version ∈ `archived_versions` (`isArchivedVersionOf`); short names never qualify (they normalise to `v1.0.0` by default and are explicitly rejected: `parsed.fullStageId !== stageId ⇒ false`).

---

## 7. Stage summary archive — `openfeel archive <stage>`

A completely different feature: a Markdown *summary* of one stage, written into the log directory. **It does not remove anything from `flow.json` and never touches `flow-archive/`.**

`archiveStage(projectPath, stageName)` (`src/core/archive/merge.ts`):

1. `new FlowManager(projectPath)`; if not loaded ⇒ return `null`; if `data` falsy ⇒ `null`.
2. Resolve the stage: `key = normalizeStageId(stageName) ?? stageName`; `stage = data.stages[key] ?? data.stages[stageName]`; missing ⇒ `null`. (Short names are normalised; the raw input is a fallback key.)
3. `opsCount = Object.values(stage.ops).length`.
4. Related reviews: `r.op.lastIndexOf('.')` split (so a stageId containing dots is handled) → `opStage = r.op.substring(0, dotIdx)`; keep when `opStage === key || opStage === stageName`. Reviews with no `.` never match. `reviewsCount = relatedReviews.length`.
5. `knowledgeExtracts` = related reviews with `status ∈ {'closed','resolved'}` mapped to `[${r.id}] ${r.title}`.
6. Markdown summary written to `.openfeel/log/archive-{stageName}.md` (**the raw argument as given**, e.g. `archive-stage-06.md`; not normalised) via `atomicWriteFileSync` — **no lock**, byte-for-byte:

```markdown
# 归档摘要 — {stageName}

- **归档时间**：{ISO}
- **阶段名称**：{stageName}
- **阶段状态**：{stage.status}
- **依赖阶段**：{deps.join(', ') | 无}

## 操作产出

| ID | 标题 | 状态 | 尝试次数 |
|----|------|------|----------|
| {op.id || (无)} | {op.title} | {op.state} | {op.attempts}/{op.max_attempts} |
…

## 审查记录

| ID | 标题 | 状态 | 优先级 |
|----|------|------|--------|
| {r.id} | {r.title} | {r.status} | {r.priority} |
…
```

(Empty tables fall back to `| (无) | - | - | - |`; the file ends with a trailing newline from the template.)

7. `mgr.appendLog({time:'', agent:'openfeel-archiver', action:'archive_stage', detail:{stageName, opsCount, reviewsCount, knowledgeCount, archivePath}})` — note `stageName` is the raw argument.
8. `mgr.save()` ⇒ **revision + 1**, `.bak` updated. A concurrent conflict here surfaces as the standard `common.concurrentConflict` + exit 2 (via the generic catch in `commands/archive.ts` it is actually rendered as `common.errorTmpl` + exit 1, since `archive.ts` only catches and prints `common.errorTmpl`).
9. If `knowledgeExtracts.length > 0`: `initKnowledgeBase(projectPath)` then `addKnowledgeEntry(projectPath, 'patterns', entry, '归档自阶段 {stageName}')` for each extract (`kb/` write, own `kb` lock).
10. Returns `{summary, opsCount, reviewsCount, knowledgeExtracts}`.

CLI (`src/commands/archive.ts`) prints:

```
✓ 阶段已归档: {stage}              // archive.okTmpl
  操作数: {opsCount}               // archive.opsCount
  审查条目数: {reviewsCount}       // archive.reviewsCount
  知识提取:                        // only when non-empty
    - {entry}
  归档文件: {cwd}/.openfeel/log/archive-{stage}.md
```

`null` result ⇒ `错误：归档失败，请确认阶段 "{stage}" 存在且 flow.json 已初始化。` + `process.exit(1)`; a thrown error ⇒ `common.errorTmpl` + exit 1.

**Verdict: `openfeel archive <stage>` leaves `flow.json` structurally unchanged except for one appended `log` entry (+ revision bump).**

---

## 8. The two archive features compared

| Dimension | **Version archive** — `flow archive <version>` | **Stage summary archive** — `openfeel archive <stage>` |
|---|---|---|
| Command | `openfeel flow archive <version>` (subcommand of `flow`) | `openfeel archive <stage>` (top-level) |
| Goal | Compact `flow.json` by sharding a finished version out | Produce a human-readable Markdown recap of one stage |
| Output artifact | `.openfeel/flow-archive/{version}.json` (structured JSON) | `.openfeel/log/archive-{stage}.md` (Markdown) |
| Schema | `ArchiveFile` (`schemaVersion:1`, `version`, `archived_at`, `stages`, `reviews`, `log`, `counts`) | none — free-form Markdown |
| Granularity | **all** stages/reviews/logs of a version prefix | **one** stage (short or full id) |
| Mutates `flow.json` | **Yes** — removes the moved `stages`/`reviews`/`log` entries, updates `meta.archived_versions`, recomputes `pipeline.current`/`pipeline.phase` | **No** — only appends one `log` entry |
| `flow.json` revision | +1 (via `save()`) | +1 (via `save()`) |
| Preconditions | version present in active `stages`; **all** its stages `phase==='done'`; **no** blocking open REV | `flow.json` loaded **and** the stage exists (no phase/done/review check) |
| Refusal | existence gate + gate, exit 1, **zero writes**, no `--force` | `null` ⇒ exit 1 with `archive.errorArchiveFailedTmpl` |
| Idempotent? | Yes — same-version re-archive overwrites the file and skips the index append (`added:false`) | Yes — overwrites the same `.md`, appends another log entry |
| Locks | `flow-archive` (file) then `flow` (save) — never held simultaneously | `flow` (via `mgr.save()`), plus `kb` if knowledge is extracted |
| `--force` | **none** | none |
| Dry-run | `--dry-run` (zero writes) | none |
| JSON output | `--json` on archive / list / show | none |
| Read-back | `flow archive list`, `flow archive show <version>` | read the Markdown file |
| Consistency check | `flow health` items `归档一致性` / `归档残留` | none |
| Side effects | pipeline disposition (current cleared if it belonged to the version) | knowledge extraction into `kb/patterns.md` |
| Ordering invariant | archive file written **before** `flow.json` is modified | `flow.json` saved **before** `kb/` writes |

---

## 9. `metrics.json` (`src/core/metrics.ts`)

### 9.1 Schema (on disk)

Path: `<project>/.openfeel/metrics.json` (same dir as `flow.json`).

```jsonc
{
  "agents": {
    "openfeel-executor": {
      "agentName": "openfeel-executor",
      "totalRuns": 9,
      "successfulRuns": 9,
      "failedRuns": 0,
      "totalRetries": 0,
      "totalDurationMs": 13989829,
      "avgDurationMs": 1554425
    }
    // … one entry per agent name
  }
}
```

* **No `schemaVersion` on disk.** No timestamp, no run history, no per-run records — only monotonically accumulating counters per agent.
* Serialized `JSON.stringify(data, null, 2) + '\n'`, atomic write, **no lock** ("low concurrency, not a consistency-critical path").
* **No retention policy, no trimming, no rotation.** Entries accumulate forever; one entry per distinct `agentName`.

### 9.2 `recordRun(agentName, durationMs, result, retries = 0)`

```
entry = agents.get(agentName) ?? createDefaultMetrics(agentName)   // all zeros
entry.totalRuns        += 1
entry.totalDurationMs  += durationMs
result === 'success' ? entry.successfulRuns += 1 : entry.failedRuns += 1
entry.totalRetries     += retries
entry.avgDurationMs     = Math.round(entry.totalDurationMs / entry.totalRuns)
```

`Math.round` (half-up), recomputed from the running totals — never an incremental average. `result` is the literal union `'success' | 'failure'`; anything not `'success'` increments `failedRuns`. `recordRun` only mutates memory — `save()` must be called to persist.

### 9.3 Store lifecycle

* `MetricsStore.getInstance(dataDir?)` — singleton **per `dataDir`** (`default = resolve(process.cwd(), '.openfeel')`), so several projects in one process do not share state. `resetInstance()` clears the cache (tests).
* `load()` — missing file ⇒ no-op; unreadable/unparsable ⇒ silently keep the empty state (`try/catch`); on success, each `agents[name]` is shallow-copied into the map. **`load()` overwrites in-memory entries with disk values**, hence callers must `load()` before `recordRun()`+`save()` or they will drop history:
  ```ts
  const metricsStore = MetricsStore.getInstance();
  metricsStore.load();          // read-merge to protect history
  … metricsStore.recordRun(agentName, Date.now() - baseMs, 'success', 0);
  ```
* `save()` — `mkdirSync(dataDir, {recursive:true})` if absent; rebuild `{agents}`; atomic write.
* `summary(lang)` — human text (`Agent 性能指标摘要` + `═══…`; per agent a name line then `总执行次数` / `成功 / 失败` / `成功率` (`%.1f%`, `N/A` when `totalRuns===0`) / `总重试次数` / `总耗时 (ms)` / `平均耗时 (ms)`), empty ⇒ `暂无 Agent 性能数据。`; a closing caliber note `注：耗时口径 = phase 窗口（含跨会话闲置 / 等待），非 agent 纯执行时长。`
* `getSummaryData()` ⇒ `{agents:[{...AgentMetrics, successRate: number|null}]}` where `successRate = Number(((ok/runs)*100).toFixed(1))` or `null`.
* `flow metrics` ⇒ `store.load(); console.log(store.summary(lang))`.
* `flow metrics --json` ⇒ `JSON.stringify({schemaVersion:1, ...getSummaryData()}, null, 2)` — note `schemaVersion` is **only** in the CLI payload, not in the file.

### 9.4 Which runs are recorded

`PHASE_AGENT_MAP` (phase → owning agent), the only mapping used:

| phase | agent |
|---|---|
| `plan_pending`, `plan_review` | `openfeel-planner` |
| `scheme_pending`, `scheme_review` | `openfeel-schemer` |
| `exec_running` | `openfeel-executor` |
| `review_pending`, `review_failed` | `openfeel-reviewer` |
| `test_pending`, `test_failed` | `openfeel-feel-tester` |
| `archiving` | `openfeel-archiver` |

`*_passed` / `done` / meta phases are not in the table ⇒ never recorded.

`flow advance` (non-dry-run only) records **one run per exited phase**: after each successful step + `save()`, `exitedPhase = (i>0 ? phasePath[i-1] : startPhase)`; if mapped, `durationMs = Date.now() - baseMs` where `baseMs` is the phase-entry timestamp recovered from `flow.json.log` (scanned back over entries older than `logLenBefore`, i.e. excluding this run's own writes) or, for later steps, the previous step's completion time. If no baseline can be established the run is **skipped**, not recorded with `0`, and a `debug` line `metrics skip (no baseline): stage=… phase=…` is emitted to the runtime log.

---

## 10. `.info.json` — workspace identity (`src/core/workspace/identity.ts`)

Path: `<project>/.openfeel/.info.json`. Schema:

```jsonc
{
  "user": "Liuary",
  "lang": "zh-CN"      // 'zh-CN' | 'en'
}
```

* `ensureInfoJson(projectPath)`:
  * file absent → `getUserName()` then write `{user, lang:'zh-CN'}` with `JSON.stringify(..., null, 2) + '\n'` (atomic). `init` immediately follows with `writeLang(projectPath, lang)` applying the chosen language.
  * file present and `lang` missing/invalid → set `lang: 'zh-CN'` and rewrite **preserving all other keys** (the parsed object is re-serialized).
  * file present with a valid `lang` → untouched. **`user` is never overwritten.**
  * JSON parse failure → do nothing (file left as-is).
* `getUserName(projectPath)`: `.info.json.user` (non-empty string) → else `git config user.name` (via `execSync`, `cwd = projectPath`, trimmed, must be non-empty) → else `'unknown'`. Each step `try/catch`-guarded.
* `getLang(projectPath)`: `.info.json.lang` if it is one of `VALID_LANGS` → else `'zh-CN'`. Read-only; never writes.
* `.info.json` is also the username source for `PublicLogger` (which reads it directly, defaulting to `'unknown'`).

### 10.1 Global preference store (`~/.openfeel/config.json`)

```jsonc
{ "lang": "zh-CN", "projects": { "C:\\path\\to\\project": "zh-CN" } }
```

* `getGlobalConfig()` — missing ⇒ a deep copy of `{lang:'zh-CN', projects:{}}` **without creating the file**; parse failure ⇒ same default plus `console.warn('[WARN] Failed to parse global config JSON; using defaults')`; a non-object `projects` is coerced to `{}`.
* `setGlobalConfig()` — `withFileLock(~/.openfeel/locks/global-config.lock)` + atomic write.
* `recordProjectLang(projectPath, lang)` — normalises with `resolve()`, skips the write when the mapping already equals `lang`, otherwise upserts and writes.
* `isFirstUse()` ⇔ the global config file does not exist.

### 10.2 `.openfeel/update_state.json` (`src/core/update-state.ts`)

Zod-validated; also used verbatim for `~/.openfeel/update_state.json`.

```jsonc
{
  "version": "1.0",                          // literal
  "last_update": "2026-10-15T05:42:02.193Z",
  "openfeel_version": "1.0.6",
  "files": {
    ".opencode/agents/feel.md": {
      "hash": "28f678e815056706e76c53de4fca8ee52dcd24d249678817c7eb3a918cf22f28",  // sha256 hex
      "status": "clean"                      // 'clean' | 'conflict'
    }
  }
}
```

* Keys of `files` are project-relative paths (forward slashes) — or absolute paths in the **global** state.
* `hashContent(s)` = SHA-256 hex of the string with **CRLF and lone CR normalised to LF** first.
* `loadUpdateState` / `loadGlobalUpdateState` — missing ⇒ `null`; schema mismatch ⇒ `console.warn` + `null`; parse error ⇒ `null` (`null` ⇒ the caller falls back to "full overwrite + rebuild state").
* `saveUpdateState` — `withFileLock(.openfeel/tmp/locks/update-state.lock)` + atomic write; `saveGlobalUpdateState` — `~/.openfeel/locks/global-update-state.lock`.
* `getOpenfeelVersion()` reads the CLI's own `package.json` via `createRequire(import.meta.url)('../../package.json').version`.
* Legacy keys are those starting with `.opencode/` or `.opencode\` (used by `openfeel migrate`).

---

## 11. Observed live state (reference sample, `OpenFeel` repo)

Useful as a conformance fixture; values are facts about the analyzed checkout, not normative defaults.

`.openfeel/flow.json` (136 700 B):

```jsonc
"meta": { "version":"1.0", "project":"OpenFeel", "updated":"2026-10-15T07:34:06.404Z",
          "revision":1187,
          "archived_versions":["v1.0.0","v1.1.0","v1.1.1","v1.1.2","v1.1.3","v1.1.4","v1.1.5","v1.1.6","v1.1.7"] }
```
Top-level keys in order: `meta, pipeline, stages, reviews, log` (no `requirements`). `log.length = 462`, `stages` = 17 entries, `reviews` = 0.

* `.openfeel/flow.json.bak` — 136 358 B (previous generation).
* `.openfeel/metrics.json` — 6 agents: `openfeel-executor` (9/9), `openfeel-reviewer` (11/11), `openfeel-feel-tester` (9/9), `openfeel-archiver` (9/9), `openfeel-planner` (22/22), `openfeel-schemer` (18/18); all `failedRuns:0`, `totalRetries:0`.
* `.openfeel/.info.json` — `{"user":"Liuary","lang":"zh-CN"}`.
* `.openfeel/update_state.json` — `version 1.0`, `openfeel_version 1.0.6`, 3 entries (`.opencode/agents/feel.md`, `.opencode/agents/reviewer.md`, `opencode.jsonc`), all `clean`.
* `.openfeel/flow-archive/` — 9 files: `v1.0.0.json` (89 990 B) … `v1.1.7.json` (29 219 B), exactly matching `archived_versions`.
* `.openfeel/log/` — nested `2026/{06,07,08,09,10}/{dd}/` with `YYYY-MM-DD-Liuary-NNN.md` + `day_index.md`; legacy flat `2026-08-07/`, `2026-08-09/`, `2026-08-11/`; root `index.md`, `log.md`, `archive-{version}-stage-NN.md`, plus two legacy root-level `2026-07-14-feel-001.md` / `2026-10-11-feel-001.md`.
* `.openfeel/tmp/locks/` — empty between commands (lock files are transient).

---

## 12. Reimplementation conformance checklist

**Storage layer**

1. `atomicWriteFileSync` writes `.<name>.<pid>.<12hex>.tmp` in the target directory, `fsync`s, then renames; cleans up the temp on failure; optional `{backup:true}` copies the old file to `.bak` **before** the write.
2. All JSON is `JSON.stringify(x, null, 2) + '\n'`, UTF-8, LF, no BOM, object key order preserved from load.
3. `withFileLock` uses O_EXCL + JSON `{pid,time,token}`, 10→500 ms jittered exponential backoff, 5000 ms deadline, 3000 ms stale reclaim by atomic rename, token-verified release; it is non-reentrant and advisory only.
4. Lock names: project `flow` / `log` / `flow-archive` / `kb` / `update-state` / `status-{stageDir}` / `scheme-{stageDir}`; global `global-config` / `global-update-state` / `runtime-log`.

**`flow.json`**

5. Disk `ops` entries never contain `id`; `id` is injected from the map key on load.
6. `save()` = (fill `meta`, stamp `meta.updated`) → deep clone → strip `op.id` → **under `flow.lock`**: compare on-disk integer `revision` to the baseline, throw `FlowConcurrentModificationError` on mismatch, else write `revision = baseline + 1` with `{backup:true}` and adopt the new revision.
7. Missing/invalid `revision` ≡ `0`; revisions increase by exactly 1 per successful write; concurrent writers must retry from a fresh read.
8. Conflict ⇒ command layer prints `common.concurrentConflict` and exits `2`.
9. `.bak` = previous generation, written only on save/restore (and repair unless recovered), never rotated, never deleted.
10. `load()` is silent and total: absent file / bad JSON ⇒ unloaded (`loadedRevision = 0`); it only repairs `stage.ops ??= {}`, `stage.deps ??= []` and `op.id`; everything else is `validate()`/`repair()` territory.
11. `initFlow` never overwrites an existing `flow.json`; new files carry `revision: 0` and the exact default template.
12. `log[]` is append-only with no cap; `flow log` shows `slice(-N)`.

**Version archive**

13. `flow archive <version>` gate = (version present in active stages) ∧ (all its stages `phase==='done'`) ∧ (no `status==='open'` review with `blocking !== false` in that version's scope); **no `--force`**; every refusal exits 1 with zero writes.
14. Write order: archive file (lock `flow-archive`, `backup:false`) → remove from memory → append `meta.archived_versions` (idempotent) → pipeline disposition → append `archive_flow_version` log → `save()` (lock `flow`). Never nested locks.
15. Archive file key order `version, stages, reviews, log, counts, schemaVersion, archived_at`; `schemaVersion` always `1`; `counts` recomputed on read when absent.
16. `flow archive list` is filesystem-only and lexicographically sorted; `show --json` returns the file verbatim.
17. `meta.archived_versions` is append-only and never pruned.

**Everything else**

18. `metrics.json` accumulates per-agent counters with `avgDurationMs = round(total/totalRuns)`, atomically written without a lock, no retention; `load()` before `recordRun()` + `save()`.
19. Workspace audit log path `log/{yyyy}/{MM}/{dd}/{yyyy-mm-dd}-{user}-{NNN}.md` with atomic `NNN`, three idempotent indexes, 30-row `log.md`, best-effort failure; legacy flat dirs are read-only.
20. CLI runtime log line `[ISO][LEVEL][pid] message`, `cli start:` / `cli done exit=… [duration_ms=…] [project=…] [session=…]`, `~/.openfeel/cli/logs/openfeel-YYYY-MM-DD.log`, best-effort, no rotation.
21. `.info.json` = `{user, lang}`; `user` is never overwritten; `lang` defaults to `zh-CN`.
22. `openfeel archive <stage>` writes `.openfeel/log/archive-{stage}.md`, appends one `archive_stage` log entry, saves `flow.json`, optionally seeds `kb/patterns.md` — and removes nothing.
