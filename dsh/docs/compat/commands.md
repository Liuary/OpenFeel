# OpenFeel CLI — Command Surface & Logging/Observability Contract

Behavioral specification for a byte-faithful reimplementation.

- **Source of truth**: `OpenFeel` @ `package.json` version **1.2.1**, TypeScript, ESM, Node `>=20.17.0`.
- **Analyzed files**: `src/cli/index.ts`, `src/cli/repl.ts`, `src/cli/output-encoding.ts`, `src/cli/deploy-check-output.ts`, `bin/openfeel.js`, all 17 `src/commands/*.ts` registrars, `src/commands/shared/errors.ts`, `src/core/{public-logger,runtime-log,session,metrics,pipeline-schema,config,deployment-check,global-paths}.ts`, `src/core/fs/file-lock.ts`, `src/core/view/entry.ts`, `src/core/req/*`, `src/core/plan/*`, `src/core/archive/merge.ts`, `src/core/flow-archive/*`, `src/core/workspace/knowledge.ts`, `src/core/model-config.ts`.
- **Notation**: `<arg>` = required positional; `[arg]` = optional positional; `--flag <v>` = required value; `[boolean]` = optional-value flag; defaults are as declared to commander.
- **All help text / output prose is i18n**: every user-visible line is `t('<key>', lang, vars)` resolved from `src/core/i18n-data/{zh-CN,en}.ts`; `{var}` placeholders are substituted. English strings quoted below are `en` values. A reimplementation must keep the **key → line** mapping if it wants identical output. Log lines (§7) and machine JSON (§5) are **not** i18n and are frozen.

---

## 1. Process model & entry points

`bin/openfeel.js` is the single throat. Startup order is fixed:

```
installOutputEncoding()   // wrap stdout/stderr encoders (no-op unless target != utf8)
installRuntimeLog()       // read --no-log/--log-file/--debug/OPENFEEL_* → module config
installExitHooks()        // exit / SIGINT / SIGTERM → `cli done` line
applyHelpI18n(program)    // rewrite description()/option descriptions/arg descriptions from i18n
args.length === 0 ? startRepl(program) : runCli()
```

`runCli()`:

```
logCliStart(process.argv.slice(2))
emitGlobalDeployCheck()          // passive stale-deployment hint to stderr (gated, silent-on-error)
try { program.parse() } catch (err) { handleCliError(err) }
logCliDone(process.exitCode ?? 0)
```

`startRepl(program)`:

- `program.exitOverride()`; `readline` prompt `repl.prompt`; prints `repl.welcome`; `emitGlobalDeployCheck()` (once per process); `rl.prompt()`.
- Empty line → re-prompt. `exit` / `quit` → print `repl.bye`, close, `process.exit(0)`.
- `help` / `?` → print `repl.helpTitle` then `  <name>  <description>` for each **top-level** command.
- Any other line is split with `/\s+/` and dispatched as `program.parse(['node','openfeel', ...args])`.
- During dispatch `process.exit` is temporarily replaced by a throwing `ReplExitSignal`, so command-level `exit(1)`/`exit(2)` **does not kill the REPL**. `ReplExitSignal` is swallowed; `commander.helpDisplayed` / `commander.help` / `commander.version` are swallowed; any other error prints `repl.errorPrefix + message` to stderr.
- `process.exit` is restored in `finally`; `rl.on('close')` → `process.exit(0)`.
- **Known limitation**: REPL input is whitespace-split — no shell-like quoting, so `--title "a b"` arrives as two tokens.

`shouldUseColor(options)`: `options.color === false` (from `--no-color`) → false; else `process.env.NO_COLOR` present **and non-empty** → false; else true. **No ANSI coloring is implemented anywhere**; the function is a contract for future use only. Do not emit color.

---

## 2. Global options (root program `openfeel`)

| Flag | Value domain | Default | Meaning |
|---|---|---|---|
| `-v, --version` | — | — | Print `pkg.version`, exit (commander). |
| `--no-color` | negate → `color=false` | color enabled | Disables color; contract-only today. |
| `--encoding <encoding>` | `auto\|utf8\|utf-8\|gbk\|gb2312\|gb18030\|big5\|shift_jis\|sjis\|cp932\|euc-kr\|cp949` | `auto` | Display-only for `--help`; **actual resolution re-reads argv/env** (see below). |
| `--log-file <path>` | filesystem path | `~/.openfeel/cli/logs/openfeel-YYYY-MM-DD.log` | Override runtime-log destination. |
| `--no-log` | negate | logs enabled | Disable runtime log. |
| `--debug` | flag | off | Raise runtime-log min level to `debug`. |

Root description: `AI Agent 开发流程治理 CLI 工具`.

**Encoding resolution** (`resolveTargetEncoding`, pure function, first match wins):

1. argv contains `--json` → `utf8` (machine contract; overrides everything).
2. explicit `--encoding <v>` / `--encoding=<v>` → alias-mapped value.
3. `OPENFEEL_ENCODING` env → alias-mapped value.
4. platform !== `win32` **or** stream `isTTY` → `utf8`.
5. win32 non-TTY → `utf8` (changed from legacy GBK; GBK only via 2/3).

Only `target !== 'utf8'` installs a wrapper; wrapper transcodes **string** chunks via `iconv-lite` (unencodable → `?`, no warning), passes `Buffer` through unchanged, discards caller-supplied encoding (UTF-8 string semantics only). Install is idempotent.

---

## 3. Complete command tree

**17 registrars, 80 leaf subcommands** (leaf = a fully-qualified argv path that dispatches an action).

Registration order in `src/cli/index.ts` (affects `--help` ordering): `init, flow, plan, view, archive, roadmap, instructions, update, knowledge, stage, project, config, lint, migrate, model, setup, req`.

### 3.1 `flow` — pipeline state (`src/commands/flow.ts`) — 29 leaves

| Command | Positional args | Flags (domain / default) | JSON |
|---|---|---|---|
| `flow status` | — | `--verbose`; `-n, --lines <n>` (default `'5'`, parsed `max(1, parseInt‖5)`); `--json` | ✅ |
| `flow overview` | — | `--json` | ✅ |
| `flow current` | — | `--json` | ✅ |
| `flow metrics` | — | `--json` | ✅ |
| `flow phases` | — | `--json`; `--mode <full\|fast\|general>`; `--stage <id>` | ✅ |
| `flow mode` | — | `--stage <id>`; `--json` | ✅ |
| `flow stage add` | `<stageId>` | — | — |
| `flow stage remove` | `<stageId>` | `--force`; `--dry-run`; `--purge` | — |
| `flow stage set` | `<stageId>` | `--deps <ids...>` (space or comma separated; absent = clear) | — |
| `flow stage reset` | `<stageId>` | **`--to <phase>` (required)**; `--dry-run` | — |
| `flow advance` | — | `--op <id>`; **`--to <phase>` (required)**; `--stage <id>` (required at runtime); `--force`; `--dry-run`; `--review-tier <full\|lean\|skip>`; `--quiet` | — |
| `flow attempt` | — | **`--op <id>` (req)**; **`--result <pass\|fail>` (req)** | — |
| `flow ops list` | — | `--stage <id>`; `--json` | ✅ |
| `flow log` | — | `--last <n>` (default `'10'`, parsed `max(1, parseInt‖10)`) | — |
| `flow review add` | — | **`--op <id>` (req)**; `--title <title>`; `--auto-fix <detail>`; `--blocking [boolean]` (default `'true'`; `'false'`/`false` → false) | — |
| `flow review resolve` | `<rev-id>` | — | — |
| `flow review update` | `<rev-id>` | `--priority <high\|medium\|low>`; `--title <text>`; `--blocking <true\|false>` (≥1 required) | — |
| `flow review remove` | `<rev-id>` | — | — |
| `flow retry` | — | **`--op <id>` (req)** | — |
| `flow repair` | — | `--dry-run`; `--backup`; `--prune-orphans` | — |
| `flow migrate` | — | `--dry-run`; `--no-backup` (commander: `backup=false`) | — |
| `flow checkpoint list` | `[stage]` | — | — |
| `flow checkpoint restore` | `<checkpoint-file>` | `--force` (mandatory unless `--dry-run`); `--stage <id>`; `--dry-run` | — |
| `flow archive` | `<version>` (prefix `v` optional) | `--dry-run`; `--json` | ✅ |
| `flow archive list` | — | `--json` | ✅ |
| `flow archive show` | `<version>` | `--json` | ✅ |
| `flow health` | — | `--quick`; `--json`; `--fix`; `--dry-run` | ✅ |
| `flow recover` | — | — | — |
| `flow wizard` | — | — (interactive; requires stdin+stdout TTY) | — |

Group notes (behavioral, must be preserved):

- **`flow status`** (no `--verbose`): `mgr.summary(lang)` block, then `\nCurrent Active Stage: <stage> (<phase>)` when `pipeline.current.stage` resolves, then `\nStage Duration:` with one line per stage `  <stageId> [<phase>]: <duration>` (+ ` common.inProgress` suffix if `end_time` empty). `formatDuration`: `0ms` if ≤0; `<ms>ms` if <1000; `x.y s` if <60000; `Nm[ Ss]` beyond.
  `--verbose` prints: `flow.status.verboseTitle`, 8 basic lines, `cascadeTitle` + fixed table (`key.padEnd(18)` × profile/config/`*`status/effective, rule line `─`×49) + `cascadeNote`, `recentTitleTmpl(n)` + header + rule `─`×55 + rows (`time.padEnd(17) agent.padEnd(14) change.padEnd(20) description`), `downstreamTitle` + `─`×34 rows, then `recoveryTitle` block (stage/op/status/blockedBy/pendingTasks ≤10 + overflow notice).
- **`flow overview`** (text): box banner `╔═×42╗ / ║ <title padStart(38)>              ║ / ╚═×42╝`; sections current status, stages overview (bar `█`×done + `░`×(total−done), `phase=<p> <bar> <done>/<total> <← current>`), reviews (open/resolved/closed + per-open `🔴`/`🟡` + priority `↑/= /↓`), bug stats from `.openfeel/bugs/index.md` (`open:`/`closed:` regexes, `i` flag), last 5 log entries, health (quick) with pass/warn/fail counts and `❌ section: message` per fail, closing rule `═`×44.
- **`flow current`**: `getPhase()` (meta: active/paused/done), stage, stage phase, op, retry. When stage exists but op empty → `flow.current.noOpTmpl {stage}`.
- **`flow metrics`**: `MetricsStore.getInstance()` → `.load()` → text `summary(lang)` or JSON.
- **`flow phases`**: validates `--mode` via `getConfigFieldLegalValues('workflow_mode')` (exit 1 with `stage.set.invalidValueTmpl`), validates `--stage` format then existence (registered in flow.json **or** a resolvable `status.md`); derives mode = explicit `--mode` ?? `resolveStageWorkflowMode(stage).value`; compares runtime transitions vs built-in defaults (`missing`/`extra`/`changed`); text emits phases list, `flow.mode.lineTmpl {mode, source}`, tier line `flow.phases.tierLineTmpl {tier, mode}` (tier = `MODE_DERIVED_TIER[mode]`: full→full, fast→lean, general→full), transitions `  <key> → [a, b]`, optional diff/custom-phase notices.
- **`flow mode`**: read-only; `source ∈ {status.md, config.yaml, profile.yaml, builtin, requirement}`; JSON also returns the three transition tables.
- **`flow stage remove`**: normalizes short id → full id; `--dry-run` runs `checkRemovable` and prints stage / `ops: n` / `current: <stage><←?>` / referencing list, then exits 1 if not removable; `--purge` without `--force` requires TTY (else exit 1), on TTY asks `confirm` (default false); order is unregister-in-memory → `save()` → `rmSync(dir, {recursive,force})`.
- **`flow stage set`**: dangling deps are a **hard error** (exit 1, zero write); deps that are explicitly version-prefixed and in `meta.archived_versions` are accepted with an info line.
- **`flow stage reset`**: `--to` must be a valid `PipelinePhase`; regression allowed; `--to done` still subject to blocking-REV check; core mutates memory only, command layer `save()`s.
- **`flow advance`** (the most complex command — full algorithm):
  1. `--stage` missing → `flow.advance.errorNoStage`, exit 1.
  2. `--review-tier` not in `REVIEW_TIERS` → exit 1 **before any disk touch**. Effective tier = explicit ?? `full` (default = zero pruning; derived tier is display-only).
  3. not loaded → exit 1.
  4. normalize stage; `autoRepairInconsistency(stage, {dryRun})`; if fixed print `autoRepaired` / `autoRepairPreview` and `save()` unless dry-run.
  5. `validate()`; warnings printed as `[WARN] <w>` + `warnAutoCorrect`; invalid → `errorInvalidFormat` + `  - <err>` per error, exit 1.
  6. Unless `--force`: `--to` must satisfy `PipelinePhaseSchema` (15 phases) else `errorInvalidPhaseTmpl` + `labelValidPhases: [ … ]` + `hintUseForceFuzzy`.
  7. Unless `--force`: `findPhasePath(stage, to, tier)`; `no-path`/`ambiguous`/`depth-exceeded` → reason-specific message + `errorPhaseJumpTmpl` + `currentPhaseTmpl` + available targets (`flow.advance.availableTargets: [ … ]` or `noAvailableTargets`) + `hintUseForce`, exit 1 (a `general`-mode stage gets `flow.advance.generalNoPipeline` instead); `already-at-target` → `alreadyAtTargetTmpl` (suppressed by `--quiet`), return 0. BFS depth cap = `PHASE_PATH_MAX_DEPTH` = **8**.
  8. `--to done` from `exec_running`/`review_pending` → warn `warnSkipReview`.
  9. explicit tier `lean`/`skip` → warn `warnTierTmpl {tier, gates}` (`TIER_PRUNED_PHASES`: lean→`scheme_review`, skip→`plan_review,scheme_review`).
  10. `--to done`: blocking open REVs for the stage (`r.op === stage || r.op.startsWith(stage + '.')`, `blocking !== false`, `status === 'open'`) → `revBlockedTitleTmpl` + per-REV `revBlockedItemTmpl` on **stderr** (via `console.warn`), then `blockingRevRefused` + `blockingRevHint`, exit 1. `--force` only adds `forceRevRefused` — **it cannot bypass REV blocking**.
  11. `--dry-run`: optionally warn `dryRunForceWarn`; print `dryRunTitle`, stage, from, to, optional tier line, optional multi-step path `<from> → … → <to>`, blank line, `dryRunOk`; zero writes.
  12. Execute **step by step** along the unique path (`advanceStagePhase(stage, next, 'cli', {reviewTier})` then `save()` per step). Multi-step failure → `partialFailTmpl {done, failed, remaining}` + generic error, exit 1 (no rollback). Multi-step per-step success line `stepOkTmpl` (single-step stays silent). After each step of a multi-step path, re-check blocking REVs → `blockedByRevTmpl`.
  13. Metrics: load store; for each **exited** phase in `PHASE_AGENT_MAP` (plan_pending/plan_review→planner, scheme_pending/scheme_review→schemer, exec_running→executor, review_pending/review_failed→reviewer, test_pending/test_failed→feel-tester, archiving→archiver) record `recordRun(agent, now − enteredAt, 'success', 0)` when a baseline exists (baseline = prior `advance_stage_phase`/`reset_stage_phase` log entry with `detail.to === fromPhase`, or `register_stage` for `plan_pending`); no baseline → `runtimeLog('debug', 'metrics skip (no baseline): stage=<s> phase=<p>')` and no record. `save()` once if anything recorded.
  14. `--quiet` suppresses success line, step lines, git warnings, op label.
  15. Non-quiet success `okTmpl {stage, to}`; when `--to done` or the stage auto-archived: `git status --porcelain` (cwd, timeout 5000) and if dirty print the 4-line `gitDirtyBox*` warning box (git errors silent). `--op` → `opLabelTmpl`.
  16. On stage `done` transition the manager may archive → `autoCommitOnDone(stage)` **after** `save()`.
- **`flow attempt`**: refuses draft op (`flow.attempt.draftRefusedTmpl`) with exit 1; `pass` → `passTmpl`; `fail`+retry → `failRetryTmpl`; `fail`+exhausted → `failReplanTmpl` **and** auto-advances the op to `scheme_pending` + `autoReplan`; always ends with current-pointer line (`currentOpTmpl` / `currentOpEmptyTmpl`).
- **`flow ops list`**: per op `stage, opId, title, state, fill ∈ {empty,partial,filled}` (`detectFillState`; `readOpTemplate` returning `null` ⇒ `filled`). Text groups active (state ≠ draft) then draft; each line `  <stage>.<opId> [<state>] (<fill>) <title>`; `empty` adds `flow.ops.emptyWarningTmpl {opId}`. JSON adds `warning` only when `fill === 'empty'`.
- **`flow log`**: last n from `flow.json.log` (not truncated to newest-first — ascending slice then forward print), `[<time first 19 chars, T→space>] <agent normalized> — <action>` + `  Detail: <json>` when detail non-empty + blank line.
- **`flow review add`**: delegates to the single implementation `addReviewEntry`; default title = `flow.review.detail + ': ' + opId`; priority fixed `medium`; error codes → `notLoaded|invalidOpId|stageNotFound|opNotFound|invalidPriority` messages, exit 1.
- **`flow repair`**: optional `--backup` copies `flow.json` → `flow.json.bak`; `repair(dryRun, {pruneOrphans})`; prints recovered / each change / fix-done|dry-run-hint|no-fix; `fixFailed` on inconsistency → exit 1; suggests `flow migrate` when `needsMigration()`; always reports key-orphans and file-orphans (file orphans: count, first 5, note — **no cleanup entry point exists**); `--prune-orphans` prunes only key orphans.
- **`flow migrate`**: no-op with `alreadyNew` when already v4.1; `--dry-run` prints preview only; otherwise `migrate(false, noBackup)`, `save()`, print changes.
- **`flow checkpoint restore`**: `--dry-run` needs no `--force` (prints diffs or `restoreNoDiff`); conflicts → `flow.manager.snapshotRestoreRefused`, exit 1; without `--force` → `restoreNeedForce`, exit 1.
- **`flow health`**: items from `healthCheck(quick)`, plus (non-quick, loaded) archive-consistency items and requirement-reconciliation items (both **warn-only**). `--fix` runs `reconcileStatusMd({dryRun})` (only the status.md `状态` field). Icons: pass `✅`, warn `⚠️ ` (with trailing space), fail `❌`. Not ok → exit 1 (both text and JSON).
- **`flow recover`**: read-only recovery report (global status, phase, current op, stage status, blockedBy, pending tasks, stage durations).
- **`flow wizard`**: requires both stdin and stdout TTY (else `flow.wizard.nonTtyHint` and `process.exitCode = 1`); loops: refresh, stop when meta phase `done` or every stage `done`; no stages → offer to create one (prompts); >1 stage → `select`; first-time workflow-mode prompt when status.md has no `工作流模式` field **and** project `config.yaml` has no explicit `defaults.workflow_mode` (writes the field + `setConfigValue('workflow_mode', chosen)`); shows status block; lists `getAvailablePhases`; confirmation; `advanceStagePhase(stage, target, 'cli')` + `save()` + optional `autoCommitOnDone`.

### 3.2 `req` — requirements (`src/commands/req.ts`) — 11 leaves

All `req` commands use `process.exitCode = 1` (never a hard `process.exit(1)`), so buffered stdout always flushes.

| Command | Positional | Flags (domain / default) | JSON |
|---|---|---|---|
| `req add` | `<title>` | `--target-version <v>`; `--priority <P0\|P1\|P2>`; `--workflow-mode <full\|fast\|general>` | — |
| `req list` | — | `--status <draft\|scheduled\|in_progress\|done\|blocked\|cancelled\|rejected>`; `--target-version <v>`; `--owner <o>`; `--json` | ✅ |
| `req show` | `<id>` (`REQ-\d{3,}`) | `--json` | ✅ |
| `req claim` | `<id>` | `--owner <owner>` (default chain: `.openfeel/.info.json` `user` → `git config user.name` → refuse with `req.claim.ownerUnresolvedTmpl`) | — |
| `req release` | `<id>` | — | — |
| `req set` | `<id>` | `--status <s>`; `--title <t>`; `--target-version <v>`; `--priority <P0\|P1\|P2>`; `--workflow-mode <mode>` (≥1 required) | — |
| `req link` | — | **`--stage <stageId>` (req)**; `--requirement <id>` XOR `--unlink` (exactly one) | — |
| `req advance` | `<id>` | **`--to <status>` (req)** | — |
| `req split` | `<id>` | `--into <title>` (**repeatable**, accumulating; ≥1); `--json` | ✅ |
| `req board` | — | `--target-version <v>`; `--json` | ✅ |
| `req next` | — | `--owner <o>`; `--limit <n>` (integer ≥1, default `1`); `--json` | ✅ |

Semantics that must be preserved:

- **Status domain** `REQ_STATUSES = [draft, scheduled, in_progress, done, blocked, cancelled, rejected]` (fixed order — this order drives board groups). New requirement status = `draft`.
- **Transition table** (single source): `draft → scheduled|blocked|cancelled|rejected`; `scheduled → in_progress|blocked|cancelled|rejected`; `in_progress → done|blocked|cancelled|rejected`; `blocked → scheduled|in_progress|cancelled|rejected`; `done|cancelled|rejected → []`. `done` additionally requires `canCompleteRequirement` (all linked stages done, unless `workflow_mode === 'general'`).
- **Error codes** mapped to messages + exit 1: `not_found`, `stage_not_found`, `already_claimed`, `already_linked`, `invalid_status`, `invalid_field`, `general_mode_conflict`.
- `req add` writes the flow.json entry **and** a body skeleton `.openfeel/requirements/REQ-NNN.md` (never overwrites an existing body); body write failure ⇒ no `save()` (flow.json untouched).
- `req claim`: same-owner re-claim is idempotent (`req.claim.idempotentTmpl`, **no save**, revision unchanged). Terminal statuses rejected.
- `req release`: unclaimed → `req.release.noopTmpl`, no save, exit 0.
- `req set`: no fields → `req.set.noFieldsTmpl` exit 1; `changed === false` → `req.set.noopTmpl`; when `--workflow-mode` given, after saving, the mode is pushed to every stage whose `requirement_id === id` via `syncConfigFieldToStages('workflow_mode', …)` and `req.set.modeSyncedTmpl {id, mode, count}` is printed only when ≥1 stage was written (zero linked stages ⇒ zero side effects, no line).
- `req link`: stage key normalized once; linking to a terminal requirement rejected (`req.link.terminalTmpl`); a stage already owned by another requirement → `already_linked`; on link, if the requirement carries `workflow_mode`, sync it to that stage and print `req.link.modeSyncedTmpl`.
- `req advance`/`req set --status done`: when the static table allows `done` but the engine refused, this can only be the completion gate → `req.err.doneGateTmpl`; otherwise `req.err.invalidStatusTmpl {id, to, current, targets}` with `targets` = allowed next statuses.
- `req split`: children are created **published** (`scheduled`), get their own body skeleton, and `parent_id` set; JSON form returns the children **bodies**.
- `req board`: always 7 groups in `REQ_STATUSES` order, **including empty groups**; unknown/out-of-domain statuses are not rendered.
- `req next` ordering (frozen): ① `target_version` ascending, unspecified always last ② `created_at` ascending ③ `id` ascending. Candidates = `scheduled` AND (`!owner` OR (`--owner` given AND `owner === --owner`)). `--limit` validation is on the **parsed number** (`/^\d+$/` then `Number`; must be integer ≥1) — explicit `1` behaves exactly like default.
- `--json` detection helper: `options.json === true || command.parent?.opts().json === true` (defensive parent merge; `req` itself declares no `--json`).

### 3.3 `stage` — status.md atomic ops (`src/commands/stage.ts`) — 4 leaves

| Command | Positional | Flags | JSON |
|---|---|---|---|
| `stage status` | `[stageId]` | — | — |
| `stage set` | `<stageId>` | `--status <value>` (∈ `STAGE_STATUS_VALUES`); `--exec-mode <manual\|auto>`; `--auto-advance <enabled\|disabled>`; `--review-agent <agent>` (non-empty after trim); `--workflow-mode <full\|fast>` (`general` rejected) | — |
| `stage task` | `<stageId> [taskNo]` | `--add <desc>` (mutually exclusive with the others); `--done`; `--undone` | — |
| `stage create` | `<stageId>` | — (**deprecated**: prints deprecation on TTY stderr; registers into flow.json only) | — |

- `STAGE_STATUS_VALUES = [planned, review_failed, review_passed, testing, archiving, done]`.
- `stage status` (no arg): scans `.openfeel/plan/**/status.md`, prints `stage.status.foundTmpl {n}` then `  <icon> <stageId>  →  <status>` where icon = `✅` done / `🔧` coding / `📋` planned / two spaces otherwise, then a hint. With an arg: prints `\n── <stageId> ──\n`, fields in fixed order `执行模式, 自动推进, 状态, 当前责任 Agent, 上一责任 Agent, 更新时间, 工作模式, 分支名, Session 名称, 合并状态, 清理策略, 前置依赖, 依赖状态`, then any extra fields in file order, then tasks (`✅`/`⬜` + `stage.task.taskItemTmpl {number, desc}`), then `blockedBy` when the `## 阻塞 / 暂停原因` section is neither empty nor `无`. Missing stage → `errorStageNotFoundTmpl` + `errorCheckStageId`, exit 1.
- `stage set` write order is fixed: 状态 → 执行模式 → 自动推进 → 工作流模式 → 当前责任 Agent. Enum violations → exit 1 zero-write. No options → `stage.set.noOptionTmpl`, exit 1. Each field is **probed first**: `not-found` → for `工作流模式` only, falls back to insert-with-anchor (`stage.set.insertedTmpl`; `no-anchor` → `noAnchorTmpl` exit 1); other fields → `errorFieldNotFoundTmpl` exit 1 (partial writes reported first via `multiPartialTmpl`). `unchanged` → `noopTmpl` (no `.bak`). `will-change` → backup to `.openfeel/tmp/status.<stageId>.bak` then atomic write, `updatedTmpl`. Writing `工作流模式` also syncs the flow.json redundancy `stages[id].workflow_mode` when the stage is registered.
- `stage task` (toggle): requires exactly one of `--done`/`--undone` (equal booleans → `errorMutualExclusive`), `taskNo` ≥1 integer (else `errorInvalidTaskNo`), backs up status.md, flips `- [ ] 任务N：` ↔ `- [x] 任务N：`; not found → exit 1. `--add <desc>` appends `- [ ] 任务N：<desc>` with N = max+1 (`TASK_SECTION_MISSING` → `stage.task.sectionMissingTmpl`). Missing `taskNo` without `--add` → `stage.task.addUsageTmpl` exit 1.
- All status.md read-modify-write happens under lock `.openfeel/tmp/locks/status-<stageDir>.lock`.

### 3.4 `plan` — plans & schemes (`src/commands/plan.ts`) — 8 leaves

| Command | Positional | Flags | JSON |
|---|---|---|---|
| `plan stage add` | `<name>` | `--deps <ids...>`; `--tasks <items...>` (both: space **or** comma separated, re-split on `,`, trimmed, empties dropped) | — |
| `plan stage list` | — | — | — |
| `plan scheme create` | `<stage> [title]` | `--draft`; `--from-tasks` | — |
| `plan scheme publish` | `<stage> <opId>` | — | — |
| `plan scheme rename` | `<stage> <opId>` | **`--title <text>` (required)** | — |
| `plan scheme list` | `[stage]` | — | — |
| `plan scheme remove` | `<stage> <opId>` | `--force`; `--dry-run` | — |
| `plan scheme register` | `<stage> [opId]` | `--dry-run` | — |

- `plan stage add` also takes `--exec-mode <manual\|auto>`, `--auto-advance <enabled\|disabled>`, `--workflow-mode <full\|fast>` (overrides passed to the skeleton; `general` rejected with `common.generalOnlyRequirement`). Invalid stage id → `stageIdInvalidTmpl` + `stageIdSuggestTmpl`, exit 1. Deps must be registered **or** an archived explicit version (info line), else `plan.stage.invalidDepsTmpl` exit 1. Creates the directory + `overview.md`/`status.md` and registers in flow.json (`plan.stage.createdTmpl`).
- `plan stage list`: `- <name>  <path>` lines (path like `.openfeel/plan/v1/stage-01/`), sorted by name; empty → `plan.stage.empty`.
- `plan scheme create`: `--from-tasks` is mechanical (no agent calls) — mutually exclusive with `title` (`fromTasksMutualTmpl`), reads status.md tasks, writes `ops/op-NNN.md` skeletons + `ops/deps.yaml` placeholder, prints `plan.scheme.fromTasks.okTmpl {count, ops, skipped, stage}` or `emptyTmpl`; `STATUS_NOT_FOUND` → `stage.errorStageNotFoundTmpl`. Without `--from-tasks`, `title` is mandatory at runtime (`titleRequiredTmpl`). Unregistered stage is implicitly registered (`plan.scheme.implicitRegisterTmpl`). Prints `plan.scheme.createdTmpl {opId, stage}`.
- `plan scheme publish`: `draft → pending`; failure reasons `empty-template` (`publish.emptyTmpl`), `not-draft` (`notDraftTmpl`), else `notFoundTmpl`; all exit 1.
- `plan scheme rename`: empty/blank title → `rename.emptyTitleTmpl` exit 1; `title-unchanged` → info line, exit 0; `file-missing` / not found → exit 1.
- `plan scheme list`: `[<stage>] <opId> — <title>` with ` [draft]` suffix when the op state is `draft`; empty → `plan.scheme.empty`.
- `plan scheme remove`: only deletes the flow.json registration key (**never** the file). Guard failures: `op-done`, `has-checkpoint` (both overridable with `--force`), otherwise `notFoundTmpl`; exit 1. `--dry-run` prints `remove.dryRunTmpl` and writes nothing. Orphan note when the file remains.
- `plan scheme register`: back-fills `ops/` files not yet registered (file orphans); `--dry-run` previews; specific `opId` with no file → `notFoundTmpl` exit 1; all-registered → `register.noopTmpl`.

### 3.5 `config` (`src/commands/config.ts`) — 6 leaves

| Command | Positional | Flags | JSON |
|---|---|---|---|
| `config get-lang` | — | — | — |
| `config set-lang` | `<lang>` (`zh-CN`\|`en`) | — | — |
| `config list-projects` | — | — | — |
| `config get` | `[key]` | `-g, --global` | — |
| `config set` | `<key> <value>` | `-g, --global`; `--sync-stages`; `--stage <ids...>` | — |
| `config effective` | `[key]` | — | — |

- **Global profile keys** (`~/.config/openfeel/profile.yaml`) whitelist + domains: `user.name` (any string), `user.lang` (`zh-CN`\|`en`), `preferences.auto_advance` (`enabled`\|`disabled`), `preferences.review_mode` (`full`\|`skip_small_changes`), `preferences.communication` (`concise`\|`detailed`), `preferences.confirm_threshold` (`low`\|`medium`\|`high`).
- **Project keys** (`.openfeel/config.yaml` `defaults` block), schema-derived: `execution_mode` (`manual`\|`auto`, default `manual`), `auto_advance` (`disabled`\|`enabled`, default `enabled`), `merge_mode` (`manual`\|`auto`, default `manual`), `workflow_mode` (`full`\|`fast`\|`general`, default `fast`). `defaults.X` and `X` are equivalent (normalized); the user's original spelling is echoed back.
- `config get` (project): `key` is mandatory → else `config.get.noProject {err:'key 未指定…'}`, exit 1; null value → `config.get.result {key, value: common.noConfig}`. `--global`: no key prints the six known keys (`user.name`, `user.lang`, `preferences.*`); unknown key → `globalKeyNotFound`; parse errors warn on stderr (`config.get.parseErrorWarn`) **without** changing the exit code.
- `config set --global`: whitelist violation → `globalInvalidKey` + `globalAllowedKeys`, exit 1; value outside domain → `globalInvalidValue`, exit 1; unparsable profile → refuse to write (`[profile] … 已拒绝写入…`), exit 1; success validates the whole document with `ProfileSchema` then writes.
- `config set` (project) preconditions, all exit 1 and **zero writes**: `--stage` without `--sync-stages`; `--stage`/`--sync-stages` with `--global`; key outside `ConfigDefaultsSchema` (`config.set.invalidKey` listing `<k>（或 defaults.<k>）`); value outside the enum (`config.set.invalidValue`); `workflow_mode=general` at project level (`common.generalOnlyRequirement`); `--stage` ids each normalized and required to be registered **or** an archived explicit version (archived ⇒ downgrade note `config.set.syncArchivedStageTmpl`, status.md only).
- `config set --sync-stages` then calls `syncConfigFieldToStages(key, value, {onlyStages})` per stage; per-result lines: `updated` / `inserted` / `noop` / `skipped-no-anchor` (stderr) / `skipped-no-status` (stderr) / `skipped-no-field` (stderr), then a summary `config.set.syncSummaryTmpl {updated, inserted, skipped}`. Exit code stays 0 even when stages were skipped. Field mapping: `auto_advance→自动推进`, `execution_mode→执行模式`, `workflow_mode→工作流模式` (`merge_mode` has no stage field → `skipped-no-field`).
- `config effective [key]`: resolves the four managed keys `execution_mode, auto_advance, merge_mode, workflow_mode` through the cascade **profile.yaml < config.yaml < status.md < builtin** and prints `key=value (source)`; source ∈ `status.md`|`config.yaml`|`profile.yaml`|`builtin`|`requirement`. Unknown key → `effective.unknownKey` listing the valid keys, exit 1.

### 3.6 `knowledge` (`src/commands/knowledge.ts`) — 5 leaves

| Command | Positional | Flags | JSON |
|---|---|---|---|
| `knowledge list` | — | `--type <architecture\|patterns\|troubleshooting\|setup>` | — |
| `knowledge add` | `<category> <title>` | `--content <text>` (falls back to stdin when piped) | — |
| `knowledge search` | `<query>` | `--limit <n>` (default `'10'`, `max(1, parseInt‖10)`); `--offset <n>` (default `'0'`, `max(0, parseInt‖0)`) | — |
| `knowledge index` | — | — | — |
| `knowledge dedup` | `[content]` | `--project <path>`; `--category <name>`; `--threshold <n>` (0–1, default 0.8) | — |

- Categories are fixed: `architecture | patterns | troubleshooting | setup`. Invalid category → `knowledge.add.errorInvalidCategoryTmpl`, exit 1.
- `knowledge list` renders an aligned text table with columns `Category | Title | Date | Status` where status is `knowledge.list.enabled`/`disabled`; separator row uses `-` runs joined with `-+-`; empty → `knowledge.list.empty`.
- `knowledge add`: content required (`--content`, else stdin when `!isTTY`, else `errorNoContent`); blank content → `errorEmptyContent`; success `knowledge.add.okTmpl {category, title}`. Mutates `.openfeel/kb/<category>.md`.
- `knowledge search`: `knowledge.search.foundTmpl {n}` then per hit `[<category>] <title> (<date>) [<status>]` + a 100-char content summary (with `…`); no hits → `noResultsTmpl` (+ `offsetOutOfBoundsTmpl` when `--offset > 0`).
- `knowledge index`: category overview (name `padEnd(20)` + description), then recent-updates table (`Date | Category | Title`).
- `knowledge dedup`: **read-only advisory** (never writes kb). Invalid threshold → `invalidThresholdTmpl` exit 1; invalid category → `invalidCategoryTmpl` exit 1; no content → `noContentTmpl` exit 1; prints `dedup.title`, per-similar hit `dedup.itemTmpl {category, title, pct, flag}` (flag `dedup.suggestFlag` when similarity > threshold; similarity ≤ 0 skipped), `dedup.noneTmpl {threshold}` when nothing, and always ends with the fixed `dedup.readOnlyNote` line.

### 3.7 `lint` (`src/commands/lint.ts`) — 2 leaves

| Command | Positional | Flags | JSON |
|---|---|---|---|
| `lint i18n` | — | — | — |
| `lint kb` | — | — | — |

See §9.

### 3.8 `archive` — stage archive (top-level, `src/commands/archive.ts`) — 1 leaf

| Command | Positional | Flags | JSON |
|---|---|---|---|
| `archive` | `<stage>` | — | — |

Writes `.openfeel/log/archive-<stage>.md` (full Markdown summary: header bullets for 归档时间/阶段名称/阶段状态/依赖阶段, an ops table `| ID | 标题 | 状态 | 尝试次数 |`, a reviews table `| ID | 标题 | 状态 | 优先级 |`), appends `archive_stage` to `flow.json.log`, `save()`s, then forces every `closed`/`resolved` review of the stage into KB entry `patterns` with content `归档自阶段 <stage>`. Returns `null` (⇒ `archive.errorArchiveFailedTmpl`, exit 1) when flow.json isn't loaded or the stage is unknown. Output: `archive.okTmpl {stage}`, `  Ops: n`, `  Reviews: n`, optional `  Knowledge Extracts:` + `    - <entry>`, `  Archive Path: <abs path>`.

### 3.9 `roadmap` (`src/commands/roadmap.ts`) — 2 leaves

| Command | Positional | Flags | JSON |
|---|---|---|---|
| `roadmap create` | `<version>` (`v` prefix stripped) | — | — |
| `roadmap show` | `[version]` | — | — |

`create` writes `.openfeel/roadmap/v<ver>.md` skeleton (目标 / 阶段划分 / 里程碑 / 备注, each `> 待补充`); existing file → prints `大纲已存在: v<ver>.md` and does **not** overwrite. `show` with a version prints the raw file (missing → error via `common.errorTmpl`, `process.exitCode = 1`); without a version lists `v*.md` filenames one per line; absent directory → `暂无分期大纲（.openfeel/roadmap/ 目录不存在）`. **Note**: the strings in this module are hard-coded Chinese (not i18n).

### 3.10 `project` (`src/commands/project.ts`) — 1 leaf

| Command | Positional | Flags | JSON |
|---|---|---|---|
| `project overview` | — | — | — |

Read-only scan producing a fixed box/section report: banner box (`╔═×42╗`, title `padEnd(40)`, `╚═×42╝`), `📋 Basic Info`, `📁 Directory Structure` (`src/` with cli/commands/core/utils file counts; `.opencode/` agents + skills counts; `.openfeel/` kb/plan/code_review/bugs counts), `📊 Statistics` (ts source files, agent definitions, CLI modules, KB entries parsed from `.openfeel/kb/index.md` category table column index 3, plan versions), `🚪 Entry Points`, `🔧 Tech Stack` (versions read from `package.json` deps, `^`/`~` stripped, defaults `Node.js ≥20` / `TypeScript 5.7+` / `Commander 14+` / `Zod 4+` / `fast-glob` / `Vitest 3+`).

### 3.11 `model` (`src/commands/model.ts`) — 3 leaves

| Command | Positional | Flags | JSON |
|---|---|---|---|
| `model set` | `<agent> <model>` | `--scope <default\|global\|project>` (default `project`); `--build`; `--force` | — |
| `model get` | `<agent>` | `--scope <default\|global\|project>` | — |
| `model list` | — | `--scope <default\|global\|project>` | — |

- Invalid scope → `model.error.scope`, exit 1.
- `--scope default` guards: non-TTY without `--force` and without `--build` → `model.set.needConfirm`, exit 1; framework source not present (no `src/core/templates-data/opencode/agents`) → `model.set.noSourceRepo`, exit 1.
- `model set` prints `model.set.ok {agentId, model, scope}`, then each changed file `  <path>`, optional `model.set.warning`, then `needsBuild` hint or, with `--build`, `model.set.buildTriggered` and `execSync('npm run build', {stdio:'inherit', timeout: 600000})`; build timeout (ETIMEDOUT/SIGTERM) → `Error: build timeout (10min)` with `process.exitCode = 1`, other build failures rethrow.
- Resolution chain for `effective`: `default > project > global`. `model get` prints `Effective: …` + all three scopes (`(none)` for unset), `inconsistent` notice when the default layer has two disagreeing sources, and `model.get.shadowed` when the default layer masks explicit project/global values. `model list` prints `model.list.title` then `  <agentId>: <value|(none)>`.
- Writes: `default` → framework source templates + `src/core/opencode-config.ts` (requires rebuild); `global` → `~/.config/opencode/opencode.jsonc` (+ global agent/skill files); `project` → project `.opencode/` + `opencode.jsonc`.

### 3.12 `view` — review entries (`src/commands/view.ts`) — 2 leaves

| Command | Positional | Flags | JSON |
|---|---|---|---|
| `view list` | — | `--op <id>` | — |
| `view accept` | `<rev-id>` | — | — |

Group `view` adds a trailing help note (`help.view.note`) pointing at `flow review *` as the only mutation entry point — **`view` has no `add`/`update`/`remove`**. See §8.

### 3.13 `instructions` (`src/commands/instructions.ts`) — 1 leaf

| Command | Positional | Flags | JSON |
|---|---|---|---|
| `instructions` | `<artifactId>` | **`--change <name>` (required)**; `--json`; `--schema <name>` (default `spec-driven`) | ✅ |

Loads the schema via `resolveSchema(schemaName, projectPath)`, then emits either XML (`<?xml version="1.0" encoding="UTF-8"?>` + `<artifact id change schema>` with `<task> <project_context> <rules> <dependencies> <output> <instruction> <template> <unlocks>`) or the JSON equivalent (§5.11). Errors → `common.errorTmpl`, `process.exit(1)`.

### 3.14 `init` (`src/commands/init.ts`) — 1 leaf

| Command | Positional | Flags | JSON |
|---|---|---|---|
| `init` | `[path]` (default `cwd`) | `--demo`; `--lang <zh-CN\|en>`; `--workspace-only`; `--non-interactive` | — |

- Path must exist (`init.errorPathNotExistTmpl`), exit 1.
- Prints `init.initializingTmpl {path}`, then `+ item` for created, `~ item` for updated, `- item` for skipped; nothing created/updated → `init.alreadyUpToDate`, else `init.complete`.
- `--workspace-only` → `initWorkspaceOnly` (no global rules / no platform adapter config). `--non-interactive` is **accepted but unused** (workspace-only is already non-interactive).
- `--demo` additionally lays down a demo project skeleton (`init.demoCreating` / `demoCreated` / `demoSkipped` / `demoComplete`); demo language defaults `zh-CN` unless `--lang` is `en`/`zh-CN`.
- Writes: `.openfeel/` directory tree, `config.yaml` (skipped if it exists), `flow.json` (created/updated via `FlowManager.initFlow`), `.info.json`, `dev/dev_core.md`, `dev/current.md`, `dev/decisions.md`, `kb/index.md`, `opencode.jsonc`, `AGENTS.md`, possibly `package.json` (script edit; skipped if backup fails). Errors → `common.errorTmpl` + `process.exitCode = 1`.

### 3.15 `setup` (`src/commands/setup.ts`) — 1 leaf

| Command | Positional | Flags | JSON |
|---|---|---|---|
| `setup` | — | `--lang <zh-CN\|en>` (default `zh-CN`); `--check`; `--json`; `--tools <csv>` | ✅ (only with `--check`) |

- `--check` is a **read-only short-circuit** (zero writes): `checkGlobalDeployment()` → `{status: ok|mismatch|missing|unknown, cliVersion, deployedVersion}`; JSON = `{schemaVersion:1, status, cliVersion, deployedVersion}`; text uses `setup.checkOkTmpl` / `checkMismatchTmpl` / `checkMissingTmpl` / `checkUnknownTmpl`. **Exit 0 iff `status === 'ok'`, else `process.exitCode = 1`.**
- Without `--check`: `--tools` parsed by `parseToolList` (comma separated; unknown or empty item → `update.toolsInvalidTmpl` listing valid ids, exit 1; default `['opencode']`); deploys global framework (`setupGlobalFramework(lang, tools)`); prints created `+ `, updated `~ `, appended `⚠ `, skipped `- `, then `setup.complete` and `setup.restartHarnessTmpl {harness}` where harness = `Claude Code` / `opencode / Claude Code` / `opencode`; with `claude` also `update.claudeReloadHintTmpl`. Supported tool ids: `opencode` (default enabled), `claude`.

### 3.16 `update` (`src/commands/update.ts`) — 1 leaf

| Command | Positional | Flags | JSON |
|---|---|---|---|
| `update` | `[path]` (default `cwd`) | `--lang <lang>`; `--force`; `--tools <list>` | — |

- `--tools` is validated **first** (fail-fast, before auto-init) — invalid → `update.toolsInvalidTmpl`, exit 1. Nonexistent path → `errorPathNotExistTmpl`, exit 1.
- If `.openfeel/` is absent → auto-init (`update.autoInitTmpl` + created list).
- Tool selection: `--tools` → that list; else `[path]` given → **all enabled** tools; else interactive `checkbox` (falls back to all enabled when interaction is unavailable, printing `update.nonInteractiveToolsTmpl`). Empty selection → `update.cancelled`, exit 0.
- Then `updateProject(path, tools, lang, {force, interactive:true, lang})`; prints created/updated/skipped, conflict block (`update.conflictsTitle` + `⚠ item` + `conflictsHint`), appended block (`appendedTitle {n}` + `⚠ item` + `appendedHint`, plus `appendedManyWarning` when > 10), then `alreadyUpToDate` or `complete`. Deploy errors → `update.errorDeployFailedTmpl`, exit 1.

### 3.17 `migrate` — legacy layout (`src/commands/migrate.ts`) — 2 leaves

| Command | Positional | Flags | JSON |
|---|---|---|---|
| `migrate` | `[path]` (default `cwd`) | `--dry-run`; `--remap-assignee`; `--clean-global-core-md` | — |
| `migrate rollback` | — | `--dry-run` | — |

- `migrate`: path must exist; `migrateProject(target, {dryRun, remapAssignee, lang, cleanGlobalCoreMd})`; any failure → `migrate.error.aborted` (+ "runnable rollback" hint) exit 1.
- Report order (`printMigrateReport`): deprecated global `core.md` notice + hint, deprecated project `AGENTS.md` notice, then `not legacy` → `migrate.legacy.alreadyLatest` and **return**; dry-run title; detection report (`① agents / ② skills / ③ instructions` counts, `④ jsonc skills/instructions`, `⑤ mixed state`); cleaned `✗ path`; kept custom `↺ path` + `migrate.clean.keptCustom`; assignee report (`old → new (count)`) + `migrate.assignee.hint` when not remapped; then dry-run note or `migrate.legacy.done` + `migrate.backup.dirTmpl {dir}`.
- `migrate rollback`: refuses outside a project root (no `.openfeel/backup/`) → `migrate.rollback.wrongDir`, exit 1. `--dry-run` (read from **either** its own opts or the parent's opts — commander attaches it to the parent) → `rollback.dryRunTitle` + `  [<op>] <source>` per manifest entry, no writes. Otherwise → `rollback.done` + `  ↺ <path>` per restored path; errors → `rollback.failed`, exit 1.

---

## 4. Read-only vs writing

**READ-ONLY (zero disk writes, no `save()`, no `appendLog`)** — safe for a DSH tool surface:

| Command | Notes |
|---|---|
| `flow status`, `flow overview`, `flow current`, `flow metrics`, `flow phases`, `flow mode`, `flow ops list`, `flow log`, `flow retry`, `flow recover` | `flow metrics` reads `.openfeel/metrics.json`; `flow mode`/`phases` explicitly guarantee no save. |
| `flow health` (without `--fix`) | read-only; `--fix` writes only status.md's `状态`. |
| `flow checkpoint list` | lists `.openfeel/checkpoints/`. |
| `flow archive list`, `flow archive show` | never read flow.json. |
| `flow repair --dry-run` | preview only. |
| `flow migrate --dry-run`, `flow stage remove --dry-run`, `flow stage reset --dry-run`, `flow advance --dry-run`, `flow checkpoint restore --dry-run` | all four write nothing. |
| `req list`, `req show`, `req board`, `req next` | explicit zero-write guarantee. |
| `stage status`, `plan stage list`, `plan scheme list`, `config get-lang`, `config list-projects`, `config get`, `config effective`, `knowledge list`, `knowledge search`, `knowledge index`, `knowledge dedup`, `lint i18n`, `lint kb`, `project overview`, `roadmap show`, `view list`, `setup --check`, `migrate --dry-run`, `migrate rollback --dry-run` | |
| `instructions` | reads schemas/config/templates, writes nothing. |

**WRITING** — mutations:

| Command | Mutates |
|---|---|
| `flow advance` | `.openfeel/flow.json` (phases, status, log, revision, checkpoints), possibly `.openfeel/metrics.json`, possibly git commit (auto-archive on `done`), `.openfeel/checkpoints/*`. |
| `flow attempt` | flow.json (op attempts/state, pipeline.current, log), possibly auto-advance to `scheme_pending`. |
| `flow stage add` / `stage create` | flow.json `stages` + log. |
| `flow stage remove` (`--purge`) | flow.json registration; `--purge` also deletes `.openfeel/plan/<series>/<stageDir>/`. |
| `flow stage set` | flow.json `stages[id].deps`. |
| `flow stage reset` | flow.json stage `phase`/`status` + log. |
| `flow review add/resolve/update/remove` | flow.json `reviews[]` + log. |
| `flow repair` (`--backup`, `--prune-orphans`) | `flow.json.bak`, flow.json repairs, key-orphan pruning. |
| `flow migrate` | flow.json rewritten to v4.1 (+ `flow.json.v4.0.bak`). |
| `flow checkpoint restore` (`--force`) | flow.json overwritten (or one stage subtree). |
| `flow archive <version>` | `.openfeel/flow-archive/<version>.json` (archive file), flow.json (removals, `meta.archived_versions`, pipeline disposition, log). |
| `flow health --fix` | status.md `状态` field only. |
| `flow wizard` | flow.json + status.md + `.openfeel/config.yaml` (`defaults.workflow_mode`). |
| `req add` | flow.json `requirements[]` + log + `.openfeel/requirements/REQ-NNN.md`. |
| `req claim`, `req release`, `req set`, `req advance`, `req link` | flow.json requirement entry + log; `req set --workflow-mode` / `req link` also sync linked stages' status.md `工作流模式` + flow.json redundancy. |
| `req split` | flow.json children + log + child body skeletons. |
| `stage set` | `.openfeel/plan/**/status.md` (+ `.openfeel/tmp/status.<stage>.bak`), flow.json redundancy for `工作流模式`. |
| `stage task` | status.md (+ `.bak`). |
| `plan stage add` | `.openfeel/plan/<series>/<stage>/` (`overview.md`, `status.md`), flow.json registration. |
| `plan scheme create` / `publish` / `rename` / `remove` / `register` | `.openfeel/plan/**/ops/op-NNN.md` (+ `ops/deps.yaml`), flow.json `ops` keys/state/title. |
| `plan scheme remove` | **flow.json key only** (files preserved). |
| `config set-lang`, `config set` | `~/.openfeel/config.json` / `~/.config/openfeel/profile.yaml` / `.openfeel/config.yaml`; `--sync-stages` also rewrites status.md fields. |
| `knowledge add`, `archive` | `.openfeel/kb/*.md` (and `kb/index.md`). |
| `archive` | `.openfeel/log/archive-<stage>.md`, flow.json log, `.openfeel/kb/patterns.md`. |
| `roadmap create` | `.openfeel/roadmap/v<ver>.md`. |
| `model set` | framework templates / `opencode-config.ts` / `~/.config/opencode/*` / project `.opencode/*`; may run `npm run build`. |
| `view accept` | flow.json review `status: closed` + log. |
| `init`, `update`, `setup` (non-`--check`), `migrate`, `migrate rollback` | project workspace files, global deployment files, backups. |

---

## 5. `--json` contract and shapes

Modeled on one rule: **`--json` prints exactly one JSON document on stdout, never mixing human prose or stderr text, and `schemaVersion: 1` is always present at the top level** (except `flow archive show`, which emits the archive file whose own `schemaVersion` is `1`). Failures still print a JSON document (and set a non-zero exit code) rather than human text.

18 commands accept `--json`: `flow status|overview|current|metrics|phases|mode`, `flow ops list`, `flow archive`, `flow archive list`, `flow archive show`, `flow health`, `req list|show|split|board|next`, `setup --check`, `instructions`.

Because `openfeel` never globally registers `--json`, sub-commands take it locally; `flow archive list/show` and `req *` therefore also merge the **parent** command's opts (`command.parent?.opts().json === true`) so `openfeel flow archive list --json` works.

### 5.1 `flow status --json`
```json
{ "schemaVersion": 1,
  "pipeline": { "phase": "active", "current": { "stage": "v1-stage-01", "op": "op-001" } },
  "stages": [ { "id": "v1-stage-01", "phase": "exec_running", "status": "coding", "deps": [], "ops": { "op-001": "done" } } ],
  "counts": { "total": 1, "done": 0, "active": 1 } }
```
Not-loaded fallback: `{schemaVersion:1, pipeline:{phase:"", current:{stage:"",op:""}}, stages:[], counts:{total:0,done:0,active:0}}`.

### 5.2 `flow overview --json`
```json
{ "schemaVersion": 1, "phase": "active",
  "current": { "stage": "", "op": "" },
  "summary": { "phase": "...", "currentOp": null, "retryCount": 0, "stagesCount": 0, "opsCount": 0, "reviewItemsOpen": 0, "recentLogs": 0 },
  "stages": [ { "id": "...", "phase": "...", "status": "...", "opsTotal": 0, "opsDone": 0 } ],
  "reviews": { "open": 0, "blockingOpen": 0, "nonBlockingOpen": 0, "resolved": 0, "closed": 0 },
  "health": { "ok": true, "pass": 0, "warn": 0, "fail": 0 },
  "logs": 0 }
```
Not loaded: `{ "schemaVersion": 1, "initialized": false }` (printed **without** indent).

### 5.3 `flow current --json`
`{schemaVersion:1, stage:"<s>", op:"<o>", phase:"<active|paused|done|''>"}` — empty strings, never `null`. Not loaded → all three empty strings.

### 5.4 `flow metrics --json`
`{schemaVersion:1, agents:[{agentName,totalRuns,successfulRuns,failedRuns,totalRetries,totalDurationMs,avgDurationMs,successRate /* number|null */}]}` (spread of `getSummaryData()`).

### 5.5 `flow phases --json`
```json
{ "schemaVersion": 1,
  "phases": ["plan_pending", "..."],
  "transitions": { "plan_pending": ["plan_review"] },
  "advanceAccepted": ["plan_pending","plan_review","plan_passed","scheme_pending","scheme_review","scheme_passed","exec_running","review_pending","review_failed","review_passed","test_pending","test_failed","test_passed","archiving","done"],
  "transitionsDiff": { "missing": [], "extra": [], "changed": [] },
  "workflowMode": "fast",
  "reviewTier": "lean" }
```
Key order is significant (`schemaVersion`, `phases`, `transitions`, `advanceAccepted`, `transitionsDiff`, `workflowMode`, `reviewTier`).

### 5.6 `flow mode --json`
`{schemaVersion:1, stage:"<normalized id|''>", mode:"full|fast|general", source:"status.md|config.yaml|profile.yaml|builtin|requirement", modes:{full:{…},fast:{…},general:{…}}}` — printed even when flow.json is not initialized.

### 5.7 `flow ops list --json`
`{schemaVersion:1, ops:[{stage,opId,title,state,fill, warning?}]}` — `warning` present only when `fill === "empty"`. Not loaded: `{schemaVersion:1, ops:[]}` (no indent).

### 5.8 `flow archive --json`
- dry-run success: `{schemaVersion:1, version:"v1.1.7", stages:N, reviews:N, log:N, dryRun:true}`
- real success: same with `dryRun:false`
- failures (all + `process.exitCode = 1`):
  - `{schemaVersion:1, error:"no-init"}`
  - `{schemaVersion:1, error:"invalid-version", input:"<raw>"}`
  - `{schemaVersion:1, error:"version-not-active", version:"<normalized>"}`
  - `{schemaVersion:1, error:"gate-rejected", version, notDone:["<stage>"], blockingOpen:["REV-001"]}`
  - `{schemaVersion:1, error:"archive-write-failed", version}`

### 5.9 `flow archive list --json` / `flow archive show --json`
- list: `{schemaVersion:1, versions:[{version:"v1.1.7", counts:{stages,reviews,log}|null}]}` (dictionary order from the engine; unreadable archive → `counts:null`).
- show: the **entire** `ArchiveFile` (`schemaVersion:1`, `version`, `archived_at`, `counts`, `stages`, `reviews`, `log`) verbatim; failures → `{schemaVersion:1, error:"invalid-version"|"not-found", … , available:[...]}` and exit code 1.

### 5.10 `flow health --json`
`{schemaVersion:1, ok:boolean, items:[{name, status:"pass"|"warn"|"fail", detail}], reconciled?:[{stage,from,to,result:"planned"|"applied"|"skipped-not-found"}]}`. `reconciled` only with `--fix`. `ok === false` ⇒ `process.exit(1)` after printing.

### 5.11 `instructions --json`
```json
{ "artifact": { "id": "...", "change": "...", "schema": "spec-driven" },
  "task": "...",
  "project_context": { "tech_stack": "TypeScript", "workspace": ".openfeel/ 工作区已初始化", "project": "OpenFeel",
                       "config": { "execution_mode": null, "auto_advance": null, "merge_mode": null } },
  "rules": ["..."],
  "dependencies": [ { "id": "...", "status": "done|pending", "path": "...", "description": "..." } ],
  "output": "<generates>",
  "instruction": "...",
  "template": "..." ,
  "unlocks": [ { "id": "...", "description": "..."|null } ] }
```
`template` is `null` when the artifact declares none.

### 5.12 `setup --check --json`
`{schemaVersion:1, status:"ok"|"mismatch"|"missing"|"unknown", cliVersion:"1.2.1", deployedVersion:"1.2.1"|null}`.

### 5.13 `req * --json`
- `req list`: `{schemaVersion:1, requirements:[RequirementData…]}` (RequirementData = `{id, title, status, target_version?, priority?, owner?, claimed_at?, created_at, updated_at, body_path?, parent_id?, workflow_mode?}`).
- `req show`: `{schemaVersion:1, requirement:RequirementData, stages:["<stageId>"…], parent:"REQ-001"|null, children:["REQ-002"…]}`.
- `req split`: `{schemaVersion:1, parent:"REQ-001", children:[RequirementData…]}` (full child bodies).
- `req board`: `{schemaVersion:1, groups:{draft:[…], scheduled:[…], in_progress:[…], done:[…], blocked:[…], cancelled:[…], rejected:[…]}}` — all seven keys always present.
- `req next`: `{schemaVersion:1, requirement: RequirementData|null}` when the effective limit is 1 (including explicit `--limit 1`); when limit > 1 it appends `candidates: [RequirementData…]` (the original two keys kept verbatim, order `schemaVersion, requirement, candidates`).
- Failures (`process.exitCode = 1`, single JSON document on stdout):
  - `{schemaVersion:1, error:"no-init"}`
  - `{schemaVersion:1, error:"invalid-argument", field:"status"|"id"|"into"|"limit", value?:"…", allowed?:[...]}`
  - `{schemaVersion:1, error:"not_found", id:"REQ-001"}`
  - `{schemaVersion:1, error:"<RequirementErrorCode>", id:"REQ-001"}` (split path)

---

## 6. Exit codes and the error envelope

| Code | Meaning | How produced |
|---|---|---|
| **0** | Success (also for deliberate no-ops: noop set/claim/release/link/advance, `already-at-target`, empty result lists, `update` cancelled selection). | normal return |
| **1** | **Any failure**: validation rejection, missing prerequisite, gate refusal, not-found, health `ok=false`, lint problems, `setup --check` non-ok. | `process.exit(1)` (hard) or `process.exitCode = 1` (deferred) |
| **2** | **Concurrent-write conflict** on `flow.json` — the only structurally distinct non-zero code; signals "retryable". | `handleConcurrentConflict` → `console.error(common.concurrentConflict)` then `process.exit(2)` |
| **130** / **143** | SIGINT / SIGTERM | `installExitHooks` |
| commander's own | Unknown command, unknown option, missing required option/argument, `--help`, `--version` | commander calls `program.error()` → prints its own usage message to stderr and exits **1**; it does **not** throw, so `handleCliError` is never reached and no `cli error:` line is written. |

### 6.1 Exit-code style matters (observable via `cli done exit=`)

- **Deferred** (`process.exitCode = 1`, buffered output still flushes; REPL keeps living): all of `req *`, `lint *`, `roadmap *`, `init`, `setup --check`, `model set` build-timeout, `flow archive *`, `flow wizard` (non-TTY hint and general failure).
- **Hard** (`process.exit(1)`, immediate): everything else, including `flow health`, `flow advance`, `flow status`-family error paths.

### 6.2 Error envelope for humans

There is **no structured error object on the human path** — the envelope is a single localized line on **stderr**:

```
common.errorTmpl      →  "Error: {msg}"            (en)
common.errorNoInit    →  "Error: flow.json not initialized, please run openfeel init first"
common.concurrentConflict → "[concurrent conflict] flow.json was modified by another process (expected revision={expected}, on-disk={actual}); this change was not written, please retry."
```

Exit 1, stdout untouched (except for whatever the command already printed). Commands reuse `common.errorTmpl` for their own `{msg}` or emit a dedicated key (`config.set.invalidValue`, `flow.advance.blockingRevRefused`, `stage.set.noAnchorTmpl`, `migrate.error.aborted`, …). Commands **never** print stack traces on expected failures.

### 6.3 Refusal vs internal error — the key distinction

| | **Refusal (gate not met)** | **Internal error** |
|---|---|---|
| Cause | Domain rule: gate/validation/enum/not-found/conflict | Unexpected exception (bug, IO, corrupt state) |
| Mechanism | Command layer returns early after printing an i18n line (or calls `handleConcurrentConflict`) | Exception propagates out of the action |
| stderr | One (or a few) localized lines, no stack | `cli error: <message>` is written to the **runtime log** at `error` level, then the error is **rethrown** → Node prints `Error: <message>` **plus the stack trace**, process exits 1 |
| Exit | **1** (or **2** for concurrency) | **1** (uncaught exception; Node's default) |
| Runtime log | No `error` line | `[<iso>][ERROR][<pid>] cli error: <message>` |
| Retryable? | Usually not; **exit 2 is the retryable signal** | No |

Two specialized shared handlers implement the refusal vocabulary:
- `handleConcurrentConflict(err, lang)` → i18n concurrent line, `exit 2`.
- `handleAddStageError(err, lang)` (shared by `stage create` and `flow stage add`): concurrency → exit 2; `StageDirConflictError` → `common.stageDirConflictTmpl {stage, other}` + exit 1; other → `common.errorTmpl {msg}` + exit 1.

`flow advance`'s REV gate is the canonical *refusal that `--force` cannot override*: `--force` adds `forceRevRefused` but the command still exits 1. Similarly `flow archive`'s gates (`all-done`, no blocking open REV) reject with a structured, enumerable report.

---

## 7. Logging & observability contract

Four **independent** log surfaces. They must not be conflated.

| Surface | Path | Writer | Purpose |
|---|---|---|---|
| CLI runtime log | `~/.openfeel/cli/logs/openfeel-YYYY-MM-DD.log` | `runtime-log.ts` | Cross-project process diagnostics (argv, exit, errors) |
| Public/audit log | `<project>/.openfeel/log/YYYY/MM/DD/<date>-<user>-NNN.md` (+ `day_index.md`, `index.md`, `log.md`) | `public-logger.ts` | Team-level audit trail of milestone/state events |
| Pipeline audit | `<project>/.openfeel/flow.json` → `log[]` | `FlowManager.appendLog` | Machine-readable pipeline state audit |
| Agent metrics | `<project>/.openfeel/metrics.json` | `MetricsStore` | Per-agent duration/success aggregates |

Plus one deployment record: `~/.openfeel/update_infos.md` and `~/.openfeel/update_state.json` (consumed by `setup --check`).

### 7.1 Runtime log — exact format

**Destination resolution** (`resolveRuntimeLogConfig(env, argv)`):

| Setting | Rule | Default |
|---|---|---|
| enabled | disabled iff argv contains `--no-log` **or** `OPENFEEL_LOG === '0'` **or** `OPENFEEL_NO_LOG === '1'` | enabled |
| minLevel | `'debug'` iff argv contains `--debug` **or** `OPENFEEL_DEBUG === '1'`, else `'info'` | `info` |
| filePath | `--log-file <p>` / `--log-file=<p>` → `resolve(p)`; else non-empty `OPENFEEL_LOG_FILE` → `resolve(it)`; else `~/.openfeel/cli/logs/openfeel-<local YYYY-MM-DD>.log` | per-day |

**Line format** (byte-exact, one line per event, always terminated by `\n`, always UTF-8):

```
[<new Date().toISOString()>][<LEVEL>][<process.pid>] <message>
```

`LEVEL` is uppercase: `DEBUG` | `INFO` | `WARN` | `ERROR`. Example:

```
[2026-02-11T09:41:07.123Z][INFO][24812] cli start: flow advance --stage v1-stage-03 --to exec_running [project=C:\work\proj] [session=env:9f2c…]
[2026-02-11T09:41:07.460Z][INFO][24812] cli done exit=0 [duration_ms=337] [project=C:\work\proj] [session=env:9f2c…]
```

**Emitted messages** (the complete set today):

| Level | Message | Emitted by |
|---|---|---|
| `INFO` | `cli start: <argv joined with single spaces>` + meta suffix | `logCliStart(argv)` at `runCli()` start |
| `INFO` | `cli done exit=<code>` + ` [duration_ms=<n>]` + meta suffix | `logCliDone(code)` (one-shot) |
| `ERROR` | `cli error: <error message>` | `handleCliError` (rethrown path only) |
| `DEBUG` | `metrics skip (no baseline): stage=<s> phase=<p>` | `flow advance` metrics windowing |
| any | `runtimeLog(level, message)` — general API used by `flow.ts` (`import { runtimeLog }`) | |

**Meta suffix** (identical on start and done, appended in this order, bracketed `key=value` so paths with spaces are safe):

```
 [project=<process.cwd() absolute>] [session=<getSessionId()>]
```

**The three observability fields**

| Field | Meaning | Source | Caveat |
|---|---|---|---|
| `duration_ms` | Wall-clock milliseconds from **module-load time of `runtime-log.ts`** (`PROCESS_START_MS = Date.now()` at import) to the moment the `cli done` line is written. Covers module resolution/loading of the command plus the whole command execution; excludes Node bootstrap and anything earlier. Not reset by reinstalling the log config. | `Date.now() - PROCESS_START_MS` | Present **only** on the `cli done` line. |
| `project` | `process.cwd()` at the time of writing — the *invocation* directory, not a detected workspace root. | `process.cwd()` | Commands themselves also use `process.cwd()` as the project path, so they agree. |
| `session_id` | Correlated run identity, prefixed by provenance so automation vs. human is machine-distinguishable. | `getSessionId()` (§7.2) | Memoized per resolved `projectPath` for the process lifetime. |

**Write discipline**: `mkdirSync(dirname, {recursive:true})`; `appendFileSync(file, line, {encoding:'utf-8'})` inside an advisory lock at `~/.openfeel/locks/runtime-log.lock`; **any** failure (disk, permission, lock timeout) is swallowed — logging never aborts the CLI. Logging is **best-effort and non-transactional**; there is no fsync and no ordering guarantee against stdout.

**One-shot semantics**: `cliDoneLogged` is set **before** attempting the write, so exactly one `cli done` line is produced per process even when the log is disabled; the `exit` hook covers `process.exit()`, normal termination and uncaught exceptions, and does **not** double-write after the normal path.

**Library default = disabled**: `config` is `null` until `installRuntimeLog()` is called (only `bin/openfeel.js` calls it). Importing the module in-process (tests, embedding) is therefore a no-op. There is intentionally **no** `VITEST`/env guard.

**Rotation / retention**: **none**. One file per local day, never trimmed, never compressed, never deleted. `--log-file` may point anywhere (including an absolute file with a different name); with it, all days share one file.

**Not logged** (deliberate): stdout/stderr content, JSON payloads, i18n messages, user input from the REPL, and commander parse-time errors (they never reach `handleCliError`).

### 7.2 `session_id` derivation (three-tier, first hit wins)

1. **env** — `CLAUDE_CODE_SESSION_ID` (the only registered candidate). Value is `.trim()`ed and must be non-empty. Result id = `env:<value>`, `source='env'`. Side effect: best-effort write of `<project>/.openfeel/tmp/session.json` = `{ "session_id": "<value>", "source": "env", "started_at": "<ISO>" }` (skipped when the file already holds the same value; all failures silent).
2. **project** — read `<project>/.openfeel/tmp/session.json` → `session_id` (string, trimmed, non-empty). Result id = `project:<value>`, `source='project'`.
3. **proc** — `proc:<first 8 chars of randomUUID()>`, `source='proc'`. **Never persisted** (keeps the "single process" semantic; prevents an automated run from being frozen into a cross-process session).

No TTL, no rotation, no expiry logic — the id changes only when the env value changes. `resetSessionCache()` clears the memo (tests only).

### 7.3 Public audit log (`PublicLogger`)

- **Path**: `<project>/.openfeel/log/<yyyy>/<MM>/<dd>/<yyyy-MM-dd>-<username>-<NNN>.md`.
  - `<username>`: `.openfeel/.info.json` → `user`; fallback `unknown`.
  - `<NNN>`: 3-digit zero-padded, **daily-recomputed** as *max existing NNN for that user/day + 1*, reserved atomically via `reserveSequence` (O_EXCL) under `.openfeel/tmp/locks/log.lock` (so a concurrently reserved empty placeholder still consumes a number).
  - Future writes are **always** nested `yyyy/MM/dd/`. Legacy flat `log/yyyy-MM-dd/` directories are **never migrated, rewritten or deleted** — they are only read-scanned into the root index with a layout tag.
- **File content** (exact template):
  ```
  # <yyyy-MM-dd>-<username>-<NNN>

  - **时间**：<ISO 8601>
  - **操作者**：<username>
  - **事件类型**：<状态变更|审查事件|测试事件|里程碑>
  - **操作**：<action>
  - **关联操作**：<opId>          ← only when provided
  - **变更前**：<from>            ← only when provided
  - **变更后**：<to>              ← only when provided

  ## 补充信息                    ← only when extra has keys
  - **<key>**：<String(value)>
  ```
- **Index maintenance** (same critical section as the entry write):
  - `<day>/day_index.md`: header `# <date>` + `## 日志列表` + `| 文件 | 操作者 | 描述 |`, then appended rows `| [<file>](<file>) | <user> | <desc> |` (idempotent by filename).
  - `<project>/.openfeel/log/index.md`: `# 日志索引` / `## 日期索引` / `| 日期 | 摘要 |`; adds one row per day (`| [<date>](<yyyy>/<MM>/<dd>/day_index.md) | <desc> <nestedTag> |`) plus read-only legacy rows (`| [<name>](<name>/day_index.md) | … <legacyTag> |` or `| <name> | … |` when no `day_index.md`); each row added only if absent.
  - `<project>/.openfeel/log/log.md`: `# 最近日志` / `| 文件 | 用户 | 描述 |`; new rows inserted **at the top** (newest first), file **truncated to the 30 most recent data rows** — this is the only retention limit anywhere.
- **Failure policy**: any error → `console.warn(t('flow.log.writeFailedTmpl', {err}))` only; the pipeline is never blocked.
- **Event vocabulary** (arg → 事件类型): `logPhaseChange`→`状态变更`, `logReviewEvent`→`审查事件`, `logTestEvent`→`测试事件`, `logMilestone(title, extra)`→`里程碑` with `action = extra.action ?? 'milestone'` and all other extra fields merged.
- **Short description** for indexes (`getShortDesc`): `opId` prefix (if any) + one of `advance_phase`→`阶段推进` + `from → to` / `attempt_pass`→`执行通过` / `attempt_fail_retry`→`执行失败，重试中` / `attempt_fail_exhausted`→`执行失败，重试耗尽` / `auto_fix_review`→`自动修复审查` / `stage_completed`→`extra.title` or `阶段完成` / default → the raw action; joined by spaces, falling back to the event type.

### 7.4 Pipeline audit (`flow.json.log[]`)

Append-only array of `{ time: string, agent: string, action: string, detail: Record<string, unknown> }`. `time` is filled in by `appendLog`; the display layer normalizes legacy agent names (`normalizeAgentName`) and renders `time.substring(0,19).replace('T',' ')`. Observed actions include `register_stage`, `advance_stage_phase`, `reset_stage_phase`, `review_add`, `review_accept`, `archive_stage`, `archive_flow_version`, `requirement_*`. This array participates in `flow.json`'s optimistic `meta.revision` concurrency check; it is also **archived** by `flow archive <version>` (`log` count) — that is why `flow log`/`flow status` counts can drop after archiving.

### 7.5 Agent metrics (`metrics.json`)

`<project>/.openfeel/metrics.json`, atomic write, **no lock** (low concurrency, non-critical):

```json
{ "agents": { "openfeel-executor": { "agentName": "openfeel-executor", "totalRuns": 3, "successfulRuns": 3, "failedRuns": 0, "totalRetries": 0, "totalDurationMs": 42000, "avgDurationMs": 14000 } } }
```

`avgDurationMs = round(totalDurationMs / totalRuns)`. A "run" is a **phase window** (time between entering and exiting a phase), not pure agent execution time — this caveat is printed as `metrics.summary.caliberNote`.

### 7.6 Passive deployment hint (stderr, not a log)

`emitGlobalDeployCheck()` runs once per process (from `runCli` and once from `startRepl`). Gate `shouldRunDeployCheck` — output is **silenced** when any of: not a TTY; already warned this process; argv contains `--json` or `--quiet`; argv contains `--version|-v|--help|-h`; the first non-option token is one of `setup|update|init|migrate`; `CI` or `OPENFEEL_NO_UPDATE_CHECK` is truthy (`1`/`true`, case/space-insensitive — other values such as `CI=yes` are *not* recognized, the non-TTY check covers those). When the gate passes: `status === 'mismatch'` → `update.globalStaleWarnTmpl {deployed, cli}` on stderr; `missing` → `update.globalMissingWarnTmpl`; `ok`/`unknown` → silent. Exit code is **never** changed; all exceptions are swallowed.

---

## 8. `view` / board rendering

### 8.1 `view list [--op <id>]` (text only)

Data: review entries from `flow.json.reviews`, optionally filtered by exact `op`, **sorted by `filed_at` descending**. Empty (or flow.json not loaded) → `view.list.empty` (`No review entries`). Otherwise, per entry, exactly two lines:

```
<id> [<status>] <priority> — <title>
  <common.op>: <op>  <view.list.filedBy>: <filed_by normalized>  <view.list.filedAt>: <filed_at>
```

- `<status>` is the raw stored value (`open` | `resolved` | `closed`).
- `<priority>` raw (`high` | `medium` | `low`).
- Separator is an em dash `—` preceded by one space.
- `filed_by` passes through `normalizeAgentName` (legacy agent names → `openfeel-*`).
- No JSON, no flags besides `--op`. Errors → `common.errorTmpl`, exit 1.

### 8.2 `view accept <rev-id>` (text only)

Marks a review `closed` (via upsert + `review_accept` audit log) and prints `view.accept.okTmpl {id}`. Unknown id → `view.accept.errorNotFoundTmpl {id}` on stderr, **exit 1**. Exceptions → `common.errorTmpl`, exit 1. This is the only mutation in the `view` group; all other review mutation lives in `flow review *`.

### 8.3 `flow overview` (the board/progress view) — text

Fixed upward-drawing order; a reimplementation must keep section order and markers:

1. Banner box (42-wide): title padded to 38 + 14 spaces.
2. `Current Status` — stage phase, `stage.op` or `(none)`, retry count (suffix localized: `times` in English, `次` when the localized word is not `retry`).
3. `Stages Overview` — `Total stages (n):` then per stage `   <id>: phase=<phase> <bar> <done>/<total> <marker>` where bar = `█`×done + `░`×(total−done), `(no ops)` when total is 0, marker `← Current` for the current stage.
4. `Reviews` — `Open: n（Blocking b / Non-blocking c）`, `Resolved: n`, `Closed: n`, then per **open** review `     <🔴|🟡> [<↑|=|↓>] <id>: <title> (<op>)`.
5. `Bugs` — parsed from `.openfeel/bugs/index.md` (`open:`/`closed:` numbers) → `Open: n  Closed: n`; unreadable → `bugUnreadable`; missing → `bugUninitialized`.
6. `Recent Logs` — last 5 `flow.json.log` entries **reversed**: `   [<time 19>] <agent>: <action>`.
7. `Health` — `✅ n  ⚠️ m  ❌ k`, then `   ❌ <section>: <message>` per failing item.
8. Closing rule `════════════════════════════════════════════` (44).

### 8.4 `req board` — the requirement board

Text (7 groups always, in `REQ_STATUSES` order, empty groups included):

```
draft (0)
scheduled (2)
  - REQ-001 Add login (claimed by alice)
in_progress (1)
done (0)
blocked (0)
cancelled (0)
rejected (0)
```

Templates: `req.board.groupTmpl` = `{status} ({n})`; `req.board.itemTmpl` = `  - {id} {title}`; `req.board.ownedSuffixTmpl` = ` (claimed by {owner})` appended when `owner` is set. JSON: `{schemaVersion:1, groups:{…}}` (§5.13).

### 8.5 `flow status` / `stage status` / `flow recover` progress rendering

- `flow status` (plain) = 10-line summary: `OpenFeel Pipeline Status` header, `Global Status: <meta phase>`, `Current Stage: <stage> — Stage Phase: <phase>`, `Current Op: <stage.op>`, `Retry Count`, `Stages`, `Ops` (**draft ops excluded** from the count), `Pending Reviews`, `Total Logs`, `Last Updated`. Then `\nCurrent Active Stage: …` and `\nStage Duration:` per-stage lines.
- `stage status` (list) = `Found n stage(s)` then `  <icon> <stageId>  →  <status>` (two spaces around `→`), icons `✅`/`🔧`/`📋`/`  `.
- `flow recover` = box-less report: title, global status, phase, current op, stage status, optional blockedBy, numbered pending tasks, per-stage duration with `(completed|in progress)`, closing `═══════════════════════════`.

---

## 9. `lint`

### 9.1 `lint i18n`

Validates that the two i18n tables are key-complete and non-empty. Builds `zhMap` from `allDomains` of `i18n-data/zh-CN.ts` (value = `entry.zh`) and `enMap` from `i18n-data/en.ts` (value = `entry.en`), then detects four problem classes:

| Class | Condition | Message key / en template |
|---|---|---|
| empty zh | `entry.zh === ''` in the zh table | `lint.i18n.emptyZhTmpl` → `[empty zh-CN] {key}` |
| empty en | `entry.en === ''` in the en table | `lint.i18n.emptyEnTmpl` → `[empty en] {key}` |
| zh-only key | present in zhMap, absent in enMap | `lint.i18n.zhOnlyTmpl` → `[zh-CN only] {key}` |
| en-only key | present in enMap, absent in zhMap | `lint.i18n.enOnlyTmpl` → `[en only] {key}` |

- No problems → one line `lint.i18n.okTmpl` → `✅ {n} key(s) consistent`, exit 0.
- Problems → `lint.i18n.failTitleTmpl` → `❌ {m} problem(s)`, then each problem indented with two spaces, then `lint.i18n.consistentTmpl` → `({n} consistent / {total} total keys)`; **`process.exitCode = 1`**.
- `consistentCount` = keys present in both maps with non-empty values; `total` = `zhMap.size`.

### 9.2 `lint kb`

Scans `.openfeel/kb/*.md` (top level, `.md` only) for file references and reports references whose target no longer exists.

- Missing directory → `lint.kb.noDir` → `(.openfeel/kb/ directory does not exist)`, exit 0 (nothing to check).
- Otherwise prints `lint.kb.scanTmpl` → `Scanning file references in {n} kb file(s)...`.
- **Extraction** per line, two sources:
  - markdown links — `/\[[^\]]*\]\(([^)]+)\)/g` (group trimmed);
  - inline code — /`` `([^`]+)` ``/g (group trimmed).
- **Resolution** (`resolveRef`) — returns `null` (skipped, not counted) when: empty; starts with `https?:`, `mailto:`, `#`, `/`, `\`, `~`; contains any of `{}*<>(),\`; contains `..`; contains whitespace; has `/` but no known prefix from `src/ test/ docs/ scripts/ bin/ schemas/ .openfeel/ .opencode/ kb/ ./`. `kb/…` maps to `<project>/.openfeel/kb/…`; `./…` maps to `<kbDir>/…`; other prefixed paths map to `<project>/…`. Fragment `#…` and markdown `"title"` suffixes are stripped first. Without a separator: try `<kbDir>/<p>`; if it exists → that path; if the source was a **link**, still return `<kbDir>/<p>` (so a missing target is reported); if the source was inline **code**, also try `<project>/<p>` and only then give up (`null` — avoids false positives for bare filenames).
- Every non-null resolution increments the checked counter; a nonexistent target is recorded as stale.
- No stale → `lint.kb.okTmpl` → `✅ No stale references (checked {n} reference(s))`, exit 0.
- Stale → `lint.kb.staleTmpl` → `❌ Found {n} stale reference(s)`, then one line per entry via `lint.kb.staleItemTmpl` → `  {file} L{line}: "{ref}" → file not found`; **`process.exitCode = 1`**.

Neither subcommand writes anything.

---

## 10. Appendix

### A. Enumerations (single-source constants — never re-hardcode)

| Constant | Values | Defined in |
|---|---|---|
| `PIPELINE_PHASES` (15) | `plan_pending, plan_review, plan_passed, scheme_pending, scheme_review, scheme_passed, exec_running, review_pending, review_failed, review_passed, test_pending, test_failed, test_passed, archiving, done` | `core/pipeline-schema.ts` |
| `META_PHASES` | `active, paused, done` | `core/pipeline-schema.ts` |
| `REVIEW_TIERS` | `full, lean, skip` | `core/pipeline-schema.ts` |
| `TIER_PRUNED_PHASES` | full→`[]`, lean→`[scheme_review]`, skip→`[plan_review, scheme_review]` | `core/pipeline-schema.ts` |
| `MODE_DERIVED_TIER` | full→`full`, fast→`lean`, general→`full` | `core/flow-manager.ts` |
| `STAGE_STATUS_VALUES` | `planned, review_failed, review_passed, testing, archiving, done` | `core/flow-manager.ts` |
| `WORKFLOW_MODES` | `full, fast, general` (default `fast`) | `core/config.ts` |
| `REQ_STATUSES` (7) | `draft, scheduled, in_progress, done, blocked, cancelled, rejected` | `core/req/types.ts` |
| `REQ_PRIORITIES` | `P0, P1, P2` | `core/req/types.ts` |
| `REQ_ID_PATTERN` | `/^REQ-(\d{3,})$/` | `core/req/types.ts` |
| Review status | `open, resolved, closed` | flow.json data |
| Review priority | `high, medium, low` | flow.json data |
| `PHASE_PATH_MAX_DEPTH` | `8` | `core/flow-manager.ts` |
| `ARCHIVE_SCHEMA_VERSION` | `1` | `core/flow-archive/archive-file.ts` |
| Tool ids | `opencode` (enabled), `claude` | `core/update.ts` |
| KB categories | `architecture, patterns, troubleshooting, setup` | `core/workspace/knowledge.ts` |
| Config sources | `status.md, config.yaml, profile.yaml, builtin, requirement` | `core/flow-manager.ts` |
| public-log event types | `状态变更, 审查事件, 测试事件, 里程碑` | `core/public-logger.ts` |

### B. Filesystem layout touched by the CLI

```
<project>/
  .openfeel/
    flow.json                    # pipeline state, reviews, requirements, log[]  (meta.revision = optimistic lock)
    config.yaml                  # defaults: execution_mode | auto_advance | merge_mode | workflow_mode
    pipeline.yaml                # optional phases/transitions/checkpoint_mapping/phase_corrections/fast_transitions
    .info.json                   # { user, lang, ... } — source of public-log username
    metrics.json                 # agent aggregates
    plan/<series>/<stageDir>/{overview.md,status.md,ops/op-NNN.md,ops/deps.yaml}
    requirements/REQ-NNN.md      # human-readable requirement body (flow.json is authoritative)
    checkpoints/<stage>-<ts>-<phase>.json
    log/{yyyy}/{MM}/{dd}/{date}-{user}-{NNN}.md + day_index.md ; log/index.md ; log/log.md ; log/archive-<stage>.md
    log/{yyyy-MM-dd}/            # LEGACY flat layout — read-only, never migrated
    flow-archive/<version>.json  # flow.json version shards (lock: tmp/locks/flow-archive.lock)
    kb/{index.md,architecture.md,patterns.md,troubleshooting.md,setup.md}
    roadmap/v<version>.md
    bugs/index.md
    dev/{dev_core.md,current.md,decisions.md}
    tmp/{session.json,status.<stage>.bak,locks/*.lock}
    backup/                      # migrate rollback manifests
  opencode.jsonc
  AGENTS.md
  .opencode/{agents,skills}/...
~/.openfeel/
  cli/logs/openfeel-YYYY-MM-DD.log
  config.json ; update_state.json ; update_infos.md ; schemas/ ; backup/ ; locks/{runtime-log,log,...}.lock
~/.config/openfeel/profile.yaml
~/.config/opencode/{AGENTS.md,opencode.jsonc,agents/,skills/,openfeel/core.md(legacy)}
~/.claude/{CLAUDE.md,settings.json,agents/,skills/}
```

### C. Locking & atomicity constants

- Advisory file lock: `openSync(path,'wx')` + `{pid,time,token}`; stale reclaim by atomic rename after `staleMs`; release only when the token matches.
- `timeoutMs = 5000`, `staleMs = 3000`, `initialBackoffMs = 10`, `maxBackoffMs = 500`, backoff ×2 with ±20 % jitter.
- Project locks: `.openfeel/tmp/locks/{log,status-<stageDir>,flow,...}.lock`; global locks: `~/.openfeel/locks/*.lock`.
- `flow.json` uses **optimistic concurrency** on `meta.revision`: mismatch throws the concurrent-write error → CLI exit **2** (the retryable signal).
- Writes are atomic (`atomicWriteFileSync`); backups: `status.<stage>.bak`, `flow.json.bak`, `flow.json.v4.0.bak`, migrate `backup/` manifests.

### D. i18n resolution (affects every message)

`t(key, lang, vars)` looks up the `lang`-specific map (`zh` field for `zh-CN`, `en` field for `en`), substitutes `{name}` placeholders, and on a miss prints `[i18n] Missing key: "<key>" for lang="<lang>"` to stderr, retries `zh-CN`, then returns the key itself. `hasKey(key, lang)` is the warning-free probe used by `applyHelpI18n`. `getCliLang(project)` = `.info.json` `lang` > `~/.openfeel/config.json` `lang` > `zh-CN`; values outside `{zh-CN, en}` are ignored. `applyHelpI18n` rewrites `description()` for commands, `help.<cmdPath>` keys, `help.<cmdPath>.arg<name>` for arguments, and `help.<cmdPath>.<camelCaseFlag>` for options — **only when the key exists**, and it skips negated (`--no-*`) options.

---

## 11. Reproduction priority for a DSH tool surface

Ranked by how much of the product's behavior a reimplementation must own:

1. **`flow` read commands** — `status --json`, `current --json`, `overview --json`, `phases --json`, `mode --json`, `ops list --json`, `log`, `recover`, `health --json`. These are the agent-facing "what is happening now" surface; all are read-only, all have stable `schemaVersion:1` shapes.
2. **`flow advance` / `flow attempt` / `flow stage reset`** — the state machine. Unique-path BFS (depth 8), REV blocking that `--force` cannot override, tier pruning, multi-step partial-failure semantics, metrics windowing, `--dry-run`, `--quiet`. This is the hardest and most behavior-defining command.
3. **`req` group** — 11 coherent verbs over one entity with a frozen transition table, deterministic `next` ordering, zero-write read verbs (`list/show/board/next --json`), and a strict "command layer validates nothing, engine decides" split.
4. **`stage` group + `plan scheme`** — the status.md/ops file-level write path (probe-before-write, `.bak` before mutation, anchors, `--dry-run`).
5. **Exit-code + JSON-envelope contract** (§5, §6) — exit 0/1/2 semantics and "one JSON document, never mixed with prose" are what automation depends on; get these before any output cosmetics.
6. **Runtime log** (§7.1) — cheap to implement, and the `[iso][LEVEL][pid] message` + `duration_ms`/`project`/`session_id` triple is the whole cross-project diagnosability story.
7. **`view list` / `view accept` / `req board`** — the rendering layer (§8); small, text-only, and needed for human inspection.
8. **`lint i18n` / `lint kb`** — self-check tooling; useful but orthogonal to the product surface.
9. **`config`, `knowledge`, `model`, `instructions`, `migrate`, `archive`, `roadmap`, `project`, `init`, `setup`, `update`** — deployment/administration. Reproduce the flag surface and exit codes; their internal templates are large and rarely agent-driven.
