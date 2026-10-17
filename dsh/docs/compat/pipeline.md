# OpenFeel — Pipeline State Machine (Behavioral Specification)

Exact behavioral specification of the OpenFeel pipeline state machine: phase vocabulary, transition
tables (full / fast / general), review tiers, gates, config cascade, stage-id parsing, and the
invariants a reimplementation must preserve.

All identifiers, constants and user-visible strings below are copied verbatim from source.

**Source of truth (read-only analysis):**

| File | Role |
| --- | --- |
| `src/core/pipeline-schema.ts` | `PIPELINE_PHASES`, `META_PHASES`, `REVIEW_TIERS`, `TIER_PRUNED_PHASES`, `TRANSITION_OR_SEPARATOR`, `parseTransitionKey`, `transitionKeyMatches`, `PipelineConfigSchema`, `FastTransitionsSchema` |
| `src/core/flow-manager.ts` | `FAST_TRANSITIONS`, `MODE_DERIVED_TIER`, `pruneTransitionsByTier`, `resolveTransitionsForMode`, `advanceStagePhase`, `resetStagePhase`, `findPhasePath`, `mapPhaseToStageStatus`, `save`, config cascade |
| `src/core/config.ts` | `WORKFLOW_MODES`, `DEFAULT_CONFIG`, `ConfigDefaultsSchema`, `STAGE_FIELD_BY_CONFIG_KEY`, `resolveConfigDefaults` |
| `src/commands/flow.ts` | `flow phases`, `flow mode`, `flow advance`, `flow stage reset`, `flow archive` command surface |
| `src/core/plan/path.ts` | `parseStageId`, `normalizeStageId`, `isArchivedVersionOf`, `findStageDirConflict` |
| `.openfeel/pipeline.yaml` | The project's concrete runtime transition table |

---

## 1. Phase vocabulary

### 1.1 `PIPELINE_PHASES` — 15 phase values, in canonical order

```ts
export const PIPELINE_PHASES = [
  'plan_pending', 'plan_review', 'plan_passed',
  'scheme_pending', 'scheme_review', 'scheme_passed',
  'exec_running', 'review_pending', 'review_failed',
  'review_passed', 'test_pending', 'test_failed',
  'test_passed', 'archiving', 'done',
] as const;
```

`PipelinePhaseSchema = z.enum(PIPELINE_PHASES)`. This is the **advance whitelist** (`advanceAccepted`
in `flow phases --json`) and is **never shrunk by tier pruning** — pruning only edits transition
tables, never the `PipelinePhase` value domain.

### 1.2 `META_PHASES` — 3 global macro states

```ts
export const META_PHASES = ['active', 'paused', 'done'] as const;
```

`flow.json.pipeline.phase` is a **MetaPhase**, not a PipelinePhase. It is recomputed
unconditionally on every phase transition:

```ts
const allDone = Object.keys(this.data.stages).length > 0
  && Object.values(this.data.stages).every((s) => s.phase === 'done');
this.data.pipeline.phase = (allDone ? 'done' : 'active') as MetaPhase;
```

Notes a reimplementation must preserve:

- **Non-empty guard**: `[].every(...)` is vacuously `true`, so a project with zero stages must
  **not** be set to `done`.
- `paused` is a **soft state**: any advance overwrites it to `active`/`done`. There is no hard-pause
  write path in the transition code.
- `fuzzyCorrectMetaPhase` maps `input.trim().toLowerCase()` — if it is a MetaPhase value it is
  returned, **every other value (including any PipelinePhase value) maps to `'active'`**.
- `needsMigration()` = `pipeline.phase ∈ PIPELINE_PHASES ∧ pipeline.phase ∉ META_PHASES`
  (legacy v4.0 global-phase format).

### 1.3 Phase semantics, owning agent, checkpoint prefix

`mapPhaseToAgent` derives the agent from `phase.split('_')[0]`; `getCheckpointFromPhase` derives the
checkpoint field from `pipelineConfig.checkpoint_mapping[prefix]`.

| # | Phase | Meaning | Owner agent (`mapPhaseToAgent`) | `checkpoint_mapping` prefix |
| --- | --- | --- | --- | --- |
| 1 | `plan_pending` | Plan awaited / being revised | `openfeel-planner` | `plan` |
| 2 | `plan_review` | Plan under review | `openfeel-planner` | `plan` |
| 3 | `plan_passed` | Plan approved | `openfeel-planner` | `plan` |
| 4 | `scheme_pending` | Op scheme awaited / being re-planned | `openfeel-schemer` | `scheme` |
| 5 | `scheme_review` | Scheme under review | `openfeel-schemer` | `scheme` |
| 6 | `scheme_passed` | Scheme approved | `openfeel-schemer` | `scheme` |
| 7 | `exec_running` | Execution in progress | `openfeel-executor` | `exec` |
| 8 | `review_pending` | Code review awaited | `openfeel-reviewer` | `review` |
| 9 | `review_failed` | Code review rejected | `openfeel-reviewer` | `review` |
| 10 | `review_passed` | Code review approved | `openfeel-reviewer` | `review` |
| 11 | `test_pending` | Test awaited | `openfeel-feel-tester` | `test` |
| 12 | `test_failed` | Test rejected | `openfeel-feel-tester` | `test` |
| 13 | `test_passed` | Test approved | `openfeel-feel-tester` | `test` |
| 14 | `archiving` | Archiving in progress | `openfeel-archiver` | `archiving` → `archive` |
| 15 | `done` | Stage complete (terminal) | `none` | — (prefix `done` unmapped) |

Built-in `checkpoint_mapping` (see §2.3) contains **both** `archiving: 'archiving'` and
`archive: 'archive'`; the project `.openfeel/pipeline.yaml` contains **only** `archive: 'archive'`.
Consequence: with the shipped `pipeline.yaml`, `getCheckpointFromPhase('archiving')` looks up
`checkpoint_mapping['archiving']`, which is `undefined` → `null` → no checkpoint update for
`archiving`.

### 1.4 Phase display labels (`getPhaseLabels`)

Built-in labels are keyed by phase; any runtime `pipeline.yaml` phase not in the built-in map gets
the fallback `phase.replace(/_/g, ' ')`.

| Phase | zh-CN | en |
| --- | --- | --- |
| `plan_pending` | 计划待定 | Plan Pending |
| `plan_review` | 计划审查中 | Plan Reviewing |
| `plan_passed` | 计划已通过 | Plan Passed |
| `scheme_pending` | 方案待定 | Scheme Pending |
| `scheme_review` | 方案审查中 | Scheme Reviewing |
| `scheme_passed` | 方案已通过 | Scheme Passed |
| `exec_running` | 执行中 | Executing |
| `review_pending` | 审查待定 | Review Pending |
| `review_failed` | 审查未通过 | Review Failed |
| `review_passed` | 审查已通过 | Review Passed |
| `test_pending` | 测试待定 | Test Pending |
| `test_failed` | 测试未通过 | Test Failed |
| `test_passed` | 测试已通过 | Test Passed |
| `archiving` | 归档中 | Archiving |
| `done` | 已完成 | Completed |

The iteration order of the returned map is **`pipelineConfig.phases` order**, not the built-in order.

---

## 2. FULL mode transition table

### 2.1 Runtime table — `.openfeel/pipeline.yaml` (in effect for this repository)

```yaml
transitions:
  plan_pending: [plan_review, plan_passed]
  plan_review: [plan_passed, plan_pending]
  plan_passed: [scheme_pending]
  scheme_pending: [scheme_review, scheme_passed]
  scheme_review: [scheme_passed, scheme_pending]
  scheme_passed: [exec_running]
  exec_running: [review_pending, scheme_pending]       # 允许回退到重定方案
  review_pending: [review_failed, review_passed]
  review_failed: [review_pending, scheme_pending]      # 审查失败后可重定方案
  review_passed: [test_pending]
  test_pending: [test_failed, test_passed]
  test_failed: [test_pending, scheme_pending]          # 测试失败后可重定方案
  test_passed: [archiving]
  archiving: [done]
  done: []
```

Full mode is the **only** mode whose table is read from `pipeline.yaml`. `fast` and `general` are
not affected by `transitions:`.

### 2.2 Built-in default FULL table — `getDefaultPipelineConfig('full').transitions`

```ts
{
  plan_pending: ['plan_review', 'plan_passed'],
  plan_review: ['plan_passed', 'plan_pending'],
  plan_passed: ['scheme_pending'],
  scheme_pending: ['scheme_review', 'scheme_passed'],
  scheme_review: ['scheme_passed', 'scheme_pending'],
  scheme_passed: ['exec_running'],
  exec_running: ['review_pending', 'scheme_pending'],       // BUG 修复：增加 scheme_pending
  review_pending: ['review_failed', 'review_passed'],
  review_failed: ['review_pending', 'scheme_pending'],      // BUG 修复：增加 scheme_pending
  review_passed: ['test_pending'],
  test_pending: ['test_failed', 'test_passed'],
  test_failed: ['test_pending', 'scheme_pending'],          // BUG 修复：增加 scheme_pending
  test_passed: ['archiving'],
  // 组合条件示例：审查通过 或 测试通过 任一即可推进到 archiving（多 Agent 并行场景，任一完成即推进）
  'review_passed|test_passed': ['archiving'],
  archiving: ['done'],
  done: [],
}
```

**Observable drift (must be reproduced, not "fixed"):** the built-in table has **16 keys**, the
shipped `pipeline.yaml` has **15**. The combo key `'review_passed|test_passed'` is **absent from
`pipeline.yaml`**, so with this repository's runtime config:

- `review_passed` has exactly one legal target: `['test_pending']` (no direct `archiving` shortcut).
- `test_passed` has exactly one legal target: `['archiving']` (the plain key already covers it).
- `openfeel flow phases --json` reports
  `transitionsDiff.missing === ['review_passed|test_passed']` (see §7.3).

With the **built-in** table instead, `review_passed` resolves to `['test_pending', 'archiving']`
because the OR-key also matches it (see §2.4).

### 2.3 Built-in `pipeline.yaml` side tables

```ts
checkpoint_mapping: {
  plan: 'plan',
  scheme: 'scheme',
  exec: 'exec',
  review: 'review',
  test: 'test',
  archiving: 'archiving',   // 主用：使 archiving 阶段更新 checkpoint（T12）
  archive: 'archive',       // 历史键，兼容自定义 pipeline 中 phase 名为 archive 的场景
},
phase_corrections: {
  completed: 'done',
  finished: 'done',
  archived: 'done',
  pending: 'plan_pending',
},
```

The shipped `pipeline.yaml` `phase_corrections` is identical; its `checkpoint_mapping` omits
`archiving:` (see §1.3).

`PipelineConfigSchema`:

```ts
export const PipelineConfigSchema = z.object({
  phases: z.array(z.string()),
  transitions: z.record(z.string(), z.array(z.string())),
  checkpoint_mapping: z.record(z.string(), z.string()),
  phase_corrections: z.record(z.string(), z.string()).default({}),
});
```

`phase_corrections` is the only key with a default. Any other missing/invalid key fails the whole
`PipelineConfigSchema.parse` → `loadPipelineConfig` catch → **entire runtime config falls back to the
built-in FULL defaults** (and `fastTransitions` stays `null`).

### 2.4 The `|` OR-key form

```ts
export const TRANSITION_OR_SEPARATOR = '|';

export function parseTransitionKey(key: string): string[] {
  return key
    .split(TRANSITION_OR_SEPARATOR)
    .map((c) => c.trim())
    .filter(Boolean);
}

export function transitionKeyMatches(key: string, phase: string): boolean {
  return parseTransitionKey(key).includes(phase);
}
```

Resolution — `getValidTargets(fromPhase, mode, tier)`:

```ts
const transitions = this.resolveTransitionsForMode(mode, tier);
const result = new Set<string>();
for (const [key, targets] of Object.entries(transitions)) {
  if (transitionKeyMatches(key, fromPhase)) {
    for (const target of targets) {
      result.add(target);
    }
  }
}
return [...result];
```

Semantics a reimplementation must match:

1. **All matching keys contribute** (union), not just the first. With the built-in full table,
   `fromPhase = 'review_passed'` matches both `review_passed` and `review_passed|test_passed` →
   `['test_pending', 'archiving']`; `fromPhase = 'test_passed'` matches both `test_passed` and the
   OR-key → `['archiving']` (deduped).
2. Order = first appearance while iterating `Object.entries(transitions)` (insertion order), then
   target array order. `Set` preserves insertion order, duplicates collapse.
3. Keys are trimmed and empty segments dropped: `'a| |b'` → `['a', 'b']`; `'|'` → `[]` → matches
   nothing.
4. Matching is **exact string equality** on the parsed segment — no prefix/fuzzy matching.
5. A key that matches nothing is legal and simply inert (e.g. a `scheme_review` key in `general`
   mode).

---

## 3. FAST mode transition table

### 3.1 Built-in fast table — `FAST_TRANSITIONS`

```ts
const FAST_TRANSITIONS: Record<string, string[]> = {
  plan_pending: ['plan_review'],
  plan_review: ['plan_passed', 'plan_pending'],
  plan_passed: ['exec_running'],
  exec_running: ['review_pending'],
  review_pending: ['review_failed', 'review_passed'],
  review_failed: ['review_pending', 'exec_running'],
  review_passed: ['archiving'],
  archiving: ['done'],
  done: [],
};
```

9 entries = **8 flow keys + `done`** (source comment: "8 条流转键 + `done` 终止项（共 9 条目）").
Single source: only `getDefaultPipelineConfig('fast')` / `resolveTransitionsForMode('fast')` consume
it; it must not be duplicated in the command or template layer.

### 3.2 Phases skipped in fast mode

Fast keeps **9** phases and skips **6**:

| Retained (9) | Skipped (6) |
| --- | --- |
| `plan_pending`, `plan_review`, `plan_passed`, `exec_running`, `review_pending`, `review_failed`, `review_passed`, `archiving`, `done` | `scheme_pending`, `scheme_review`, `scheme_passed`, `test_pending`, `test_failed`, `test_passed` |

Fast shortcuts relative to full:

- `plan_passed → exec_running` (skips the whole scheme leg).
- `review_passed → archiving` (skips the whole test leg).
- `exec_running` has **no** `scheme_pending` fallback; the only exit is `review_pending`.
- **`plan_review` is mandatory in fast mode**: `plan_pending → plan_review → plan_passed`;
  `plan_review` can reject back to `plan_pending`.
- Code review is single-round-ish but still mandatory: `exec_running → review_pending` is the only
  exit from `exec_running`.

### 3.3 `review_failed` looping rule

`review_failed: ['review_pending', 'exec_running']`

Two exits, both legal:

| Target | Meaning |
| --- | --- |
| `review_pending` | **Re-review loop** — fixes were trivial / reviewer re-checks; re-enter review. |
| `exec_running` | **Back-to-execution loop** — return to the executor to repair. This slot occupies the position that the full table gives to `scheme_pending` ("对应 full 表 scheme_pending 位"), because fast mode has no scheme leg. |

In FULL mode the corresponding pair is `review_failed: ['review_pending', 'scheme_pending']`.

`review_passed → archiving` in fast, so nothing between review and archive; `test_*` phases are
unreachable in fast mode (no inbound edge targets them).

### 3.4 Optional runtime override — `fast_transitions`

`fast_transitions` is an **optional top-level key** in `pipeline.yaml`, parsed by an **independent**
schema so a bad value cannot fail the whole pipeline config:

```ts
export const FastTransitionsSchema = z.record(z.string(), z.array(z.string()));
```

`loadPipelineConfig` logic, verbatim in effect:

```ts
const fastRaw = (parsed as Record<string, unknown> | null)?.['fast_transitions'];
if (fastRaw !== undefined) {
  const fastParsed = FastTransitionsSchema.safeParse(fastRaw);
  if (fastParsed.success) {
    // [REV-74-009 修订] 空对象 {} 等同缺失（空表使 fast 全链不可推进，无合法用途）→ 回落内置快线表
    this.fastTransitions = Object.keys(fastParsed.data).length > 0 ? fastParsed.data : null;
  } else {
    this.fastTransitions = null;
    console.warn(t('flow.manager.fastTransitionsInvalid', getCliLang(this.projectPath)));
  }
}
```

Rules:

| `fast_transitions` value | Result |
| --- | --- |
| key absent | `fastTransitions = null` → built-in `FAST_TRANSITIONS` |
| `{}` (empty object) | **treated as absent** → built-in `FAST_TRANSITIONS` (not an empty table) |
| non-empty object of `string → string[]` | used verbatim as the fast table |
| any other type (string, array, values not arrays) | `fastTransitions = null` + warn; **whole pipeline config still loads** |

Warning string (zh-CN): `[WARN] pipeline.yaml 的 fast_transitions 类型非法，已忽略并使用内置快线表`
(en: `[WARN] pipeline.yaml fast_transitions has invalid type; ignored, using built-in fast table`).

Note the deliberate asymmetry: `fast_transitions: {}` can **not** express "fast mode has no
pipeline". That state is expressible only via `mode === 'general'`.

---

## 4. GENERAL mode

### 4.1 What it means

`WORKFLOW_MODES` has **3** values:

```ts
// 3 值（stage-90）：general = 无流水线 / 按需调度通用工作者 / 仅需求级合法
export const WORKFLOW_MODES = ['full', 'fast', 'general'] as const;
```

- **No pipeline**: `resolveTransitionsForMode('general')` returns **`{}`** — an empty table. This is
  "mode semantics itself", *not* a "missing config fallback". (The source explicitly distinguishes
  this from `fast_transitions: {}`)
- Work is dispatched **on demand** to general workers (`openfeel-executor`, `openfeel-explorer`)
  instead of being driven through the phase state machine.
- `phases` remains the full 15 built-in phases — general adds no new phase and removes none.
- General may be **explicitly upgraded** to `fast` / `full`; there is **no automatic downgrade**.

### 4.2 Where it is legal (requirement level only)

Three writers **reject** `general` before any disk write:

| Writer | Location | Message key |
| --- | --- | --- |
| `openfeel stage set <id> --workflow-mode general` | `commands/stage.ts` | `common.generalOnlyRequirement` |
| `openfeel plan stage add --workflow-mode general` | `commands/plan.ts` | `common.generalOnlyRequirement` |
| `openfeel config set defaults.workflow_mode general` (deployment level) | `commands/config.ts` | `common.generalOnlyRequirement` |

Exact string (`common.generalOnlyRequirement`):

> `general（通用模式）仅限需求级——阶段级 / 部署级不支持；阶段请使用 fast / full。`

en: `general (General Mode) is valid at the requirement level only — not supported at stage / deployment level; use fast / full for stages.`

The interactive `flow wizard` does not offer `general` at all (choices are only `full` / `fast`).

Requirement-side carrier rules (`core/req/requirement-ops.ts`, `D-90-4`):

- `req add|set --workflow-mode general` is legal **only if the requirement has no linked stages**;
  otherwise `general_mode_conflict`.
  - `{id} 已关联阶段——general（无流水线）仅限无关联阶段的需求（可先解绑阶段，或改走 fast / full）`
- A `general` requirement **does not accept stage linking**.
  - `{id} 工作流模式为 general（无流水线）——不接受阶段关联`
- `general` participates in the requirement `done` gate via the carrier duality: a `general`
  requirement with zero linked stages may be completed explicitly, bypassing the
  "all linked stages done" gate.
  - Non-general rejection: `{id} 目标状态 done 被拒（当前 {current}）——done 须全部关联阶段 done；零关联阶段的需求可设 general 模式显式完成`
- Defensive fallback: `general` **with** linked stages is treated as data corruption → falls back to
  the strict "all linked stages done" rule (no exemption).

### 4.3 Transitions and gates in general mode

| Aspect | Behavior |
| --- | --- |
| `getPipelineTransitions('general')` | `{}` (empty object, after tier pruning — pruning an empty table yields an empty table) |
| `getAvailablePhases(...)` | `[]` |
| `getValidTargets(any, 'general')` | `[]` |
| `hasTransition(...)` / `canAdvance(...)` | always `false` |
| `findPhasePath(stage, to, tier)` | `{ path: [], reason: 'no-path' }` (start ≠ target and BFS expands nothing) |
| `MODE_DERIVED_TIER.general` | `'full'` — "general（无流水线）恒全量语义，不特判" |
| `flow phases --mode general` | prints `phases` (15) + `transitions: {}` + `reviewTier: "full"` + `workflowMode: "general"` |

`flow advance` in general mode (defensive path; normal write paths never create a general stage):

```
错误: 阶段 "{stage}" 的工作流模式为 general（无流水线）——无合法跳转目标；如需推进请先显式升级为 fast / full。
```

followed by the standard jump diagnostics block (see §6.4) and `exit 1`.

**Surprising bypass:** `--force` skips the entire `findPhasePath` step (`phasePath = [options.to]`),
so `flow advance --force` **does** move a general-mode stage. The only unbypassable check is the
blocking-REV gate on `to === 'done'`.

---

## 5. Review tiers (`full` / `lean` / `skip`)

```ts
export const REVIEW_TIERS = ['full', 'lean', 'skip'] as const;

/**
 * 各档位裁剪的审查关相位（**单源常量**）。
 * 消费点唯一 = flow-manager 的 pruneTransitionsByTier（禁第二份裁剪谱）。
 */
export const TIER_PRUNED_PHASES: Record<ReviewTier, readonly PipelinePhase[]> = {
  full: [],
  lean: ['scheme_review'],
  skip: ['plan_review', 'scheme_review'],
};
```

Semantics = **review-gate pruning spectrum** relative to the workflow-mode base table:

| Tier | Prunes | Description (source wording) |
| --- | --- | --- |
| `full` | *(nothing)* | 全量 = 零裁剪 |
| `lean` | `scheme_review` | 精简 = 裁 plan/scheme 两道中的 scheme_review |
| `skip` | `plan_review`, `scheme_review` | 免审 = 裁 plan_review + scheme_review |

**Always retained in all three tiers:** `review_pending` (code review = audit-chain backbone), the
test gate, the archive gate. Naming discipline in source comments: the word "快线" (fast line) is
forbidden for tiers to avoid collision with `workflow_mode=fast`.

### 5.1 The exact pruning rule

```ts
private pruneTransitionsByTier(table: Record<string, string[]>, tier: ReviewTier): Record<string, string[]> {
  if (tier === 'full') {
    return Object.fromEntries(Object.entries(table).map(([k, v]) => [k, [...v]]));
  }
  const pruned = TIER_PRUNED_PHASES[tier];
  const isPruned = (p: string): boolean => pruned.includes(p as PipelinePhase);

  const result: Record<string, string[]> = {};
  for (const [key, targets] of Object.entries(table)) {
    const keyConds = parseTransitionKey(key);
    // ② 目标侧过滤被裁剪相位（裁剪只作用于入边 / 目标侧——被裁剪相位作源键时保留，其出边可推进）
    let filtered = targets.filter((t) => !isPruned(t));
    // ③ 边收缩回退：过滤后为空且原 targets 非空 → 并入被删目标的 targets（过滤被裁剪项与自身后去重）
    if (filtered.length === 0 && targets.length > 0) {
      const merged = new Set<string>();
      for (const dropped of targets) {
        if (!isPruned(dropped)) {
          continue;
        }
        for (const cascaded of table[dropped] ?? []) {
          if (!isPruned(cascaded) && !keyConds.includes(cascaded)) {
            merged.add(cascaded);
          }
        }
      }
      filtered = [...merged];
    }
    result[key] = filtered;
  }
  return result;
}
```

Formal statement:

1. `tier === 'full'` → deep copy, **zero pruning** (this is why every legacy call site is
   byte-identical). Never mutate the input (`FAST_TRANSITIONS` / `pipelineConfig` must stay clean).
2. **Targets are filtered on the inbound/target side.** The pruned phase is a *value* only.
3. **Keys are never deleted.** A pruned phase kept as a *source key* keeps its outbound edges, so a
   stage **already sitting in** a pruned gate can still move forward. Only *entering* a pruned gate
   is removed.
4. **Edge contraction fallback**: if filtering empties a non-empty target list, the targets of the
   dropped (pruned) target are spliced in, filtered again for pruned values **and for the key's own
   conditions** (`!keyConds.includes(cascaded)`), then deduped via `Set`.
   - The `keyConds` exclusion prevents a **self-loop**: contracting `plan_review → ['plan_passed',
     'plan_pending']` into `plan_pending`'s edge would otherwise reintroduce `plan_pending →
     plan_pending`.
5. **Registered boundary:** a *combined* key that itself contains a pruned phase (e.g.
   `'scheme_review|x'`) is not deleted; only rule ② applies to its targets. Neither the built-in
   full/fast tables nor this repo's runtime table contain such a key (the only OR-key,
   `'review_passed|test_passed'`, contains no pruned phase).
6. Pruning is applied to the **whole table**, including rows for pruned phases (their targets are
   filtered too — e.g. `scheme_review: ['scheme_passed','scheme_pending']` stays intact because
   neither target is pruned).

### 5.2 FULL base table, `lean`

Only one edge disappears; nothing else changes:

| from | full targets | lean targets |
| --- | --- | --- |
| `plan_pending` | `[plan_review, plan_passed]` | `[plan_review, plan_passed]` |
| `plan_review` | `[plan_passed, plan_pending]` | `[plan_passed, plan_pending]` |
| `plan_passed` | `[scheme_pending]` | `[scheme_pending]` |
| `scheme_pending` | `[scheme_review, scheme_passed]` | **`[scheme_passed]`** |
| `scheme_review` | `[scheme_passed, scheme_pending]` | `[scheme_passed, scheme_pending]` (kept: source key) |
| `scheme_passed` | `[exec_running]` | `[exec_running]` |
| `exec_running` | `[review_pending, scheme_pending]` | `[review_pending, scheme_pending]` |
| `review_pending` | `[review_failed, review_passed]` | `[review_failed, review_passed]` |
| `review_failed` | `[review_pending, scheme_pending]` | `[review_pending, scheme_pending]` |
| `review_passed` | `[test_pending]` | `[test_pending]` |
| `test_pending` | `[test_failed, test_passed]` | `[test_failed, test_passed]` |
| `test_failed` | `[test_pending, scheme_pending]` | `[test_pending, scheme_pending]` |
| `test_passed` | `[archiving]` | `[archiving]` |
| `archiving` | `[done]` | `[done]` |
| `done` | `[]` | `[]` |

### 5.3 FULL base table, `skip`

Two edges disappear; **no contraction occurs** (both affected rows retain a non-pruned target):

| from | full targets | skip targets |
| --- | --- | --- |
| `plan_pending` | `[plan_review, plan_passed]` | **`[plan_passed]`** |
| `plan_review` | `[plan_passed, plan_pending]` | `[plan_passed, plan_pending]` (kept: source key) |
| `plan_passed` | `[scheme_pending]` | `[scheme_pending]` |
| `scheme_pending` | `[scheme_review, scheme_passed]` | **`[scheme_passed]`** |
| `scheme_review` | `[scheme_passed, scheme_pending]` | `[scheme_passed, scheme_pending]` (kept: source key) |
| all others | — | unchanged |

### 5.4 FAST base table, `lean` → **identical to fast**

`TIER_PRUNED_PHASES.lean` = `['scheme_review']`, which appears **nowhere** in `FAST_TRANSITIONS`
(neither as key nor as target). Result: fast+lean ≡ fast, byte-identical target arrays.

### 5.5 FAST base table, `skip` → one contraction

`skip` prunes `plan_review` + `scheme_review`. `scheme_review` is absent from the fast table;
`plan_review` is the **sole target** of `plan_pending` → filtering empties it → **contraction fires**:

- dropped = `plan_review`; `table['plan_review']` = `['plan_passed', 'plan_pending']`
- `keyConds` = `['plan_pending']` → `plan_pending` excluded (self-loop guard), `plan_passed` accepted
- result: `plan_pending: ['plan_passed']`

| from | fast targets | fast+skip targets |
| --- | --- | --- |
| `plan_pending` | `[plan_review]` | **`[plan_passed]`** (contracted) |
| `plan_review` | `[plan_passed, plan_pending]` | `[plan_passed, plan_pending]` (kept: source key) |
| `plan_passed` | `[exec_running]` | `[exec_running]` |
| `exec_running` | `[review_pending]` | `[review_pending]` |
| `review_pending` | `[review_failed, review_passed]` | `[review_failed, review_passed]` |
| `review_failed` | `[review_pending, exec_running]` | `[review_pending, exec_running]` |
| `review_passed` | `[archiving]` | `[archiving]` |
| `archiving` | `[done]` | `[done]` |
| `done` | `[]` | `[]` |

This is the canonical worked example in the source: `['plan_review']` → contract → `plan_pending →
['plan_passed']`, guaranteeing that pruning fast's base table by `plan_review` does not strand
`plan_pending` with an empty target set.

### 5.6 Tier derivation from mode

```ts
/**
 * 工作流模式 → 派生的审查档位（**单源常量**；stage-92 D-92-3）。
 * 仅用于「展示 / 提示」（`flow phases` 档位分节行与 `--json.reviewTier`）；**不参与推进语义**
 * （`flow advance` 的有效档位 = 显式声明 ?? full，缺省恒零裁剪 ⟹ 既有流程零回归）。
 * general（无流水线）恒全量语义，不特判。
 */
export const MODE_DERIVED_TIER: Record<WorkflowMode, ReviewTier> = {
  full: 'full',
  fast: 'lean',
  general: 'full',
};
```

**Two distinct tier variables — do not conflate:**

| Context | Value | Effect |
| --- | --- | --- |
| `flow phases` display line + `--json.reviewTier` | `MODE_DERIVED_TIER[derivedMode]` | **Display only.** `full→full`, `fast→lean`, `general→full`. |
| `flow advance` effective tier | `explicitTier ?? 'full'` | **Actual pruning.** `--review-tier` unspecified ⇒ **`full` (zero pruning)**, *not* the mode-derived tier. |

Source comment: "生效档位：显式声明 ?? full（**不传 = 零裁剪**；派生档仅用于 `flow phases` 展示与提示，不改变推进语义）".

Additional quirk: `flow phases` calls `mgr.getPipelineTransitions(derivedMode)` with the **default
tier `'full'`**, so the printed/JSON `transitions` object is **never tier-pruned**, even when
`reviewTier` says `lean`. A reimplementation must show the raw mode table alongside an unpruned
`reviewTier` label to match byte-for-byte.

Every other internal call site also defaults to `tier = 'full'`: `getAvailablePhases`,
`findPhasePath`, `hasTransition`, `canAdvance`, `getPipelineTransitions`, `getDefaultTransitions`,
`buildDownstreamPhases`, `flow wizard`. Only `flow advance` ever passes a non-`full` tier.

---

## 6. Gates — every condition that can block a transition

### 6.1 Core layer: `advanceStagePhase`

Signature: `advanceStagePhase(stageName, phase, triggeredBy?, opts?: { reviewTier?: ReviewTier }): boolean`.

| # | Condition | Behavior / exact message |
| --- | --- | --- |
| C1 | `this.data === null` | returns `false` (silent) |
| C2 | stage not found after normalization + double-key fallback | throws `阶段 '${stageName}' 不存在` |
| C3 | `PipelinePhaseSchema.safeParse(phase)` fails, fuzzy correction succeeds | `console.warn` → `[WARN] advanceStagePhase: Phase '{phase}' 自动修正为 '{corrected}'` (`flow.manager.phaseAutoCorrectTmpl`), then proceeds |
| C4 | same, fuzzy correction fails | throws `非法 phase '${phase}'，模糊修正失败` |
| C5 | `targetPhase === 'done'` and ≥1 blocking open REV | throws (see below) |

**C5 — the only unbypassable gate in the core.** Predicate, verbatim:

```ts
const stageReviews = this.data!.reviews.filter(
  (r) => r.op.startsWith(key + '.') || r.op === key,
);
const blockingOpen = stageReviews.filter(
  (r) => r.blocking !== false && r.status === 'open',
);
```

- A REV belongs to the stage iff `r.op === stageKey` **or** `r.op` starts with `stageKey + '.'`
  (the `.` separator prevents `v1.0.0-stage-1` from matching `v1.0.0-stage-10`).
- "Blocking" is `blocking !== false` → **`undefined` counts as blocking**; only `blocking === false`
  is non-blocking.
- Only `status === 'open'` blocks; `resolved` / `closed` do not.
- `--force` **cannot** bypass it. There is no force parameter in this function.

Exact thrown message:

```
无法推进到 done：存在 {N} 个未解决的阻塞 REV：
  {id}: {title} (priority={priority})
  {id}: {title} (priority={priority})
```

(with a leading newline before the first REV line; two leading spaces per entry)

**There is no op-state gate anywhere in `advanceStagePhase`.** Advancing never inspects
`stages[..].ops[..].state`; a stage may be advanced with every op still `pending`/`draft`/`failed`.
The only op-count gate in the codebase is `checkRemovable` (§6.6).

### 6.2 Core layer: `resetStagePhase`

`resetStagePhase(stageName, to, options: { dryRun?: boolean }): ResetStageResult`

| # | Condition | Behavior / exact message |
| --- | --- | --- |
| R1 | `!this.data` | throws `flow.json 未加载` |
| R2 | stage not found | throws `阶段 '${stageName}' 不存在` |
| R3 | `to` is not a valid `PipelinePhase` | throws `非法 phase '${to}'` — **no fuzzy correction** on this path |
| R4 | `to === 'done'` with blocking open REV | throws `无法复位到 done：存在 {N} 个未解决的阻塞 REV：\n{list}` — `--force` **不可绕过** |
| R5 | no effective change (`from === to && status === projectedStatus`) | no-op, returns `{ changed: false, ... }` |
| R6 | `dryRun` | returns projected result, writes nothing |

`reset` **bypasses the transition table entirely** (forward and backward jumps allowed), **does not
write a checkpoint**, **does not trigger the archive git commit**, and writes audit action
`reset_stage_phase`.

### 6.3 Command layer: `flow advance` — pre-transition gates, in exact evaluation order

| Order | Gate | Failure behavior / exact string |
| --- | --- | --- |
| 1 | `--stage` missing | `错误：--stage 参数必须指定阶段 ID（如 stage-03）。如果是新项目，请先运行 openfeel stage create <id> 创建阶段。` → exit 1 |
| 2 | `--review-tier` not in `REVIEW_TIERS` | `字段 审查档位 的取值非法：{value}（允许：full, lean, skip）` → exit 1, **zero writes** (checked before any read/path resolve/autoRepair) |
| 3 | `!mgr.isLoaded()` | `错误：flow.json 未初始化，请先运行 openfeel init` → exit 1 |
| 4 | `autoRepairInconsistency(stage, {dryRun})` fixed something | prints `检测到阶段数据不一致，已自动修复: {detail}` (or `检测到阶段数据不一致，正式执行将自动修复: {detail}` for dry-run), then `save()` when not dry-run |
| 5 | `validate()` returns warnings | each `[WARN] {w}` to stderr, then `（非标准 phase 已自动修正，继续推进）` |
| 6 | `validate()` returns `valid === false` | `错误：flow.json 格式不合法` + `  - {err}` per error → exit 1 |
| 7 | `--force` absent + `options.to` fails `PipelinePhaseSchema` | `错误: '{phase}' 不是合法的 PipelinePhase。` / `合法值: [{15 phases}]` / `使用 --force 强制执行（自动模糊修正）` → exit 1 |
| 8 | `--force` absent + `findPhasePath(stage, to, effTier)` returns `ambiguous` | `存在多条等价路径，已拒绝；请逐步显式指定 --to` → then §6.4 block → exit 1 |
| 9 | same, `depth-exceeded` | `路径深度超过上限（8），已拒绝（目标可能不可达：目标相位在当前档位下被裁剪或无可达入边）` → then §6.4 → exit 1 |
| 10 | same, `no-path` **and** stage mode is `general` | `错误: 阶段 "{stage}" 的工作流模式为 general（无流水线）——无合法跳转目标；如需推进请先显式升级为 fast / full。` → then §6.4 → exit 1 |
| 11 | same, `no-path` | `无法从 {from} 到达 {to}；当前可达目标：{targets}` (`{targets}` = `[a, b]`, or `(无)` when empty) → then §6.4 → exit 1 |
| 12 | same, `already-at-target` | no-op success: `已在目标阶段：{stage} → {to}（无操作）`, **return (exit 0)** |
| 13 | `to === 'done'` and current phase ∈ `['exec_running','review_pending']` | warning only: `[!] 跳过审查阶段直接标记 done，确认继续` |
| 14 | explicitTier ∈ `lean`/`skip` | warning only: `[!] 审查档位『{tier}』：本次推进免除审查关 {gates}（代码审查关恒保留）` |
| 15 | `to === 'done'` and blocking open REV | if `--force`: `[!] --force 已指定，但 REV 安全检查不可绕过。拒绝推进。` (warn); then `错误：blocking REV 未解决前禁止推进到 done。` + `请先解决上述 REV 或通过 flow review resolve 标记为非阻塞。` → exit 1 |
| 16 | `--dry-run` | prints preview, **return** (no writes, no metrics, no save) |
| 17 | runtime failure inside a step of a multi-step path | `已完成到 {done}；失败于 {failed}；剩余路径：{remaining}` + `错误：{msg}` → exit 1 (**no rollback** of completed steps) |
| 18 | after each step of a multi-step path, blocking open REV appears | `存在阻塞中的审查条目，已停止推进：{revs}；剩余路径：{remaining}` → exit 1 |

Before step 15, the command prints the offending REVs:

```
[!] 检测到 {n} 个未解决的阻塞 REV：
    {id}: {title} (priority={priority})
```

(4 leading spaces per entry). `assertNoBlockingOpenRev` uses the same predicate as the core:
`r.op === stage || r.op.startsWith(stage + '.')`, `r.blocking !== false`, `r.status === 'open'`.

### 6.4 The shared "phase jump" diagnostic block

Printed after gates 8/9/10/11, always before `exit 1`:

```
错误: 阶段 "{stage}" 当前 phase 无法跳转到 "{to}"
当前阶段 phase: {phase}
合法跳转目标: [{a, b}]
使用 --force 强制执行
```

Line 3 variants:

- non-empty targets → `合法跳转目标: [{targets}]`
- empty targets → `当前 phase 无合法跳转目标`

### 6.5 `--force` semantics (exact scope)

| Check | `--force` |
| --- | --- |
| Gate 2 (`--review-tier` domain) | **not** bypassed (runs before force is consulted) |
| Gate 7 (illegal target phase) | **skipped** (falls into `advancePhase`'s fuzzy correction instead) |
| Gates 8–12 (path/jump legality) | **skipped** — `phasePath = [options.to]`, single step, no `findPhasePath` |
| Gate 13/14 warnings | still printed |
| Gate 15 (blocking REV on `done`) | **NOT bypassed** (only adds the `forceRevRefused` warning) |
| Multi-step loop + per-step REV recheck (17/18) | n/a (single step) |
| Transition-table legality in `advanceStagePhase` | never checked anyway |

### 6.6 Other gates in the pipeline area

**`checkRemovable` / `flow stage remove <stageId>`** — the only gate that looks at ops:

| Order | Condition | Exact reason string |
| --- | --- | --- |
| 1 | `!this.data` | `流水线数据未加载` |
| 2 | stage not found | `阶段不存在：'{stageKey}'` |
| 3 | `opCount > 0` | `阶段 '{stageKey}' 仍有 {opCount} 个未归档的 op；如需强制移除此阶段，请加 --force` |
| 4 | `isCurrent` | `阶段 '{stageKey}' 是当前活跃阶段；如需强制移除，请加 --force（将自动回退 current）` |
| 5 | referenced by other stages' `deps` | `阶段 '{stageKey}' 被其它阶段依赖：{refs}；如需强制移除（将产生悬空依赖），请加 --force` |

All five are bypassable with `--force` (except "stage not found"). `--purge` additionally deletes
`plan/{series}/{stageDir}/` **only after `save()` succeeds** — the directory deletion happens in the
command layer, never in `removeStage`.

**`flow archive <version>` judge gate** (version sharding; not a transition but blocks the
version-level "done" closure):

| Condition | Exact string |
| --- | --- |
| version not active (absent or already archived) | `版本 {version} 未注册于活跃 flow.json（不存在或已归档）；拒绝归档（零写盘）` (`flow.archive.versionNotActiveTmpl`) |
| any stage in the version not `done` | `版本 {version} 存在未完成阶段（{n} 个）：` + `  - {id} [{phase}]` per stage |
| any blocking open REV in the version | `版本 {version} 存在阻塞 open 审查（{n} 条）：` + `  - {id}: {title} (priority={priority})` |
| either of the above | `归档判据未满足，拒绝执行（零写盘）` → exit 1, **zero writes** |
| invalid version string | `flow.archive.invalidVersionTmpl` → exit 1, zero writes |

`--json` failure payloads: `{schemaVersion:1, error:'no-init'}`,
`{...error:'invalid-version', input}`, `{...error:'version-not-active', version}`,
`{...error:'gate-rejected', version, notDone, blockingOpen}`, `{...error:'archive-write-failed', version}`.

**`flow attempt --op <id> --result <pass|fail>`** — draft ops are refused at both layers:

- Command layer: `flow.attempt.draftRefusedTmpl` =
  `{opId} 处于 draft（未发布），无法记录执行结果；请先运行 openfeel plan scheme publish {stage} {opId}` → exit 1.
- Core `recordAttempt`: writes audit `attempt_refused_draft` and returns
  `{ shouldRetry: false, shouldReplan: false }` (does **not** throw, does **not** change state).

---

## 7. `mapPhaseToStageStatus` — full mapping table

```ts
export const STAGE_STATUS_VALUES = ['planned', 'review_failed', 'review_passed', 'testing', 'archiving', 'done'] as const;

export function mapPhaseToStageStatus(
  phase: PipelinePhase,
  currentStatus: string,
): string {
  switch (phase) {
    case 'review_failed':
      return 'review_failed';
    case 'review_passed':
      return 'review_passed';
    case 'test_passed':
      // status=done 是 phase=done 的专属状态：test_passed 映射为中间状态 testing，
      // 避免 autoRepairInconsistency 在 flow advance 时把 phase 误修正为 done，截断 test_passed→archiving 路径
      return 'testing';
    case 'archiving':
      // 归档阶段映射为中间状态 archiving，避免被 autoRepairInconsistency 误修正为 done
      return 'archiving';
    case 'done':
      return 'done';
    default:
      // 其他阶段保持 stage 当前状态不变
      return currentStatus;
  }
}
```

| `phase` | → `status` |
| --- | --- |
| `plan_pending` | `currentStatus` (unchanged) |
| `plan_review` | `currentStatus` (unchanged) |
| `plan_passed` | `currentStatus` (unchanged) |
| `scheme_pending` | `currentStatus` (unchanged) |
| `scheme_review` | `currentStatus` (unchanged) |
| `scheme_passed` | `currentStatus` (unchanged) |
| `exec_running` | `currentStatus` (unchanged) |
| `review_pending` | `currentStatus` (unchanged) |
| `review_failed` | **`review_failed`** |
| `review_passed` | **`review_passed`** |
| `test_pending` | `currentStatus` (unchanged) |
| `test_failed` | `currentStatus` (unchanged) |
| `test_passed` | **`testing`** ← **not** `done` |
| `archiving` | **`archiving`** |
| `done` | **`done`** |

Invariants:

- `status` is a **coarse projection** of `phase`; `phase` is the single source of truth.
- `test_passed → 'testing'` (a "middle" state) is deliberate: mapping it to `done` would let
  `autoRepairInconsistency` rewrite `phase` to `done` and truncate the `test_passed → archiving`
  path.
- `review_passed` **always** maps to `'review_passed'`; intermediate phases never project to a
  terminal state.
- The projected value domain ∪ the initial value `'planned'` = `STAGE_STATUS_VALUES`, which is the
  write domain for `stage set --status`. Free-form/historical status strings are readable
  (`default:` returns them) but not writable through `stage set`.
- New stages start at `phase: 'plan_pending'`, `status: 'planned'` (`addStage`).
- `autoRepairInconsistency` reconciles only the two terminal mismatches:
  - `status === 'done' && phase !== 'done'` → `status = mapPhaseToStageStatus(phase, status)`
    (detail: `status {old} → {new} (以 phase 为权威，撤销非法 done)`)
  - `phase === 'done' && status !== 'done'` → `status = 'done'`
    (detail: `status {old} → done (与 phase 同步)`)

---

## 8. Config cascade — precedence and the four managed keys

### 8.1 The four managed keys

`EFFECTIVE_CONFIG_KEYS` and `DEFAULT_CONFIG`:

```ts
const EFFECTIVE_CONFIG_KEYS = ['execution_mode', 'auto_advance', 'merge_mode', 'workflow_mode'] as const;

export const DEFAULT_CONFIG: Config = {
  execution_mode: 'manual',
  auto_advance: 'enabled',   // 裁定 E：部署级默认自动推进开启（与 workflow_mode 无关）
  merge_mode: 'manual',
  workflow_mode: 'fast',     // 裁定 B：新建默认 fast
};
```

`ConfigDefaultsSchema` (per-key `.default()` **must** stay in sync with `DEFAULT_CONFIG`):

```ts
export const ConfigDefaultsSchema = z.object({
  execution_mode: z.enum(['manual', 'auto']).optional().default('manual'),
  auto_advance: z.enum(['disabled', 'enabled']).optional().default('enabled'),
  merge_mode: z.enum(['manual', 'auto']).optional().default('manual'),
  workflow_mode: z.enum(WORKFLOW_MODES).optional().default('fast'),
}).passthrough();
```

| Key | Domain | Default | status.md carrier field | Regex used to read it |
| --- | --- | --- | --- | --- |
| `execution_mode` | `manual` \| `auto` | `manual` | `执行模式` | `/\*\*执行模式\*\*[：:]\s*(manual\|auto)/` |
| `auto_advance` | `disabled` \| `enabled` | `enabled` | `自动推进` | `/\*\*自动推进\*\*[：:]\s*(disabled\|enabled)/` |
| `merge_mode` | `manual` \| `auto` | `manual` | **none** (not in `STAGE_FIELD_BY_CONFIG_KEY`) | never read from status.md |
| `workflow_mode` | `full` \| `fast` \| `general` | `fast` | `工作流模式` | ``new RegExp(`\\*\\*工作流模式\\*\\*[：:]\\s*(${WORKFLOW_MODES.join('\|')})`)`` |

`STAGE_FIELD_BY_CONFIG_KEY`:

```ts
export const STAGE_FIELD_BY_CONFIG_KEY: Record<string, string> = {
  auto_advance: '自动推进',
  execution_mode: '执行模式',
  workflow_mode: '工作流模式',
};
```

`merge_mode` is intentionally absent — batch sync (`config set --sync-stages`) reports it as
`skipped-no-field` (D-config ruling). `[：:]` accepts both full-width and half-width colons.

`getConfigFieldLegalValues(key)` derives the legal-value list from the schema:
`ZodEnum → [...options]`, `ZodBoolean → ['true','false']`, otherwise `null`. The depth-limited
`unwrapSchema` loop peels up to 8 `ZodDefault`/`ZodOptional`/`ZodNullable` layers.

### 8.2 Precedence order

**Four-layer cascade (`buildCascadeConfig`)** — lowest to highest:

```
profile.yaml (preferences)  <  config.yaml (defaults)  <  status.md (stage overrides)
              ↑                          ↑                          ↑
         lowest priority           middle priority          highest priority
```

`effective = { ...profileDefaults, ...configDefaults, ...statusOverrides }` (later write wins).

`resolveEffectiveConfig()` maps each key to `{ value, source }` with `source ∈
'status.md' | 'requirement' | 'config.yaml' | 'profile.yaml' | 'builtin'`:

```
status.md > config.yaml > profile.yaml > builtin
```

**But `workflow_mode` has a five-layer chain** via `resolveStageWorkflowMode(stageId?)`, which
`resolveEffectiveConfig` delegates to (single point of layer judgement — a second layer ordering is
forbidden):

```
status.md  >  requirement  >  config.yaml  >  profile.yaml  >  builtin
   (A)            (B)              (C)             (D)            (E)
```

| Layer | Source | Detail |
| --- | --- | --- |
| A | `status.md` | `findStageStatusPath(projectPath, stageId)` (3-level fallback), regex on `**工作流模式**` |
| B | `requirement` | `stages[normalize(stageId)].requirement_id` → `data.requirements.find(r => r.id === ...)` → `reqRec.workflow_mode`, accepted only if `WORKFLOW_MODES.includes(...)`; missing/dangling/illegal → falls through silently |
| C | `config.yaml` | `.openfeel/config.yaml` → `defaults.workflow_mode`, per-key `ConfigDefaultsSchema.shape[key].safeParse` |
| D | `profile.yaml` | **Intentionally does not carry `workflow_mode`** — branch kept for symmetry, never produced in practice (REV-74-005) |
| E | `builtin` | `DEFAULT_CONFIG.workflow_mode` = `'fast'` |

Because `resolveEffectiveConfig()` delegates `workflow_mode` to this function with **no argument**,
its result is scoped to the **current stage** (`pipeline.current.stage`); the other three keys are
resolved through the plain 3-layer cascade with no stage scoping and no requirement layer.

**`profile.yaml` only supplies `auto_advance`**, and only when the file exists **and** the raw YAML
**explicitly declares** `preferences.auto_advance ∈ {'enabled','disabled'}`. Otherwise that layer is
empty and the key falls to `builtin`. (`ProfileSchema.preferences.review_mode` /
`communication` / `confirm_threshold` do **not** participate in this cascade.)

**No stage-level or requirement-level carrier exists for `execution_mode`, `auto_advance`,
`merge_mode`** other than status.md's `执行模式` / `自动推进` (merge_mode has none at all).

### 8.3 Per-key validation and degradation

`buildCascadeConfig`, config.yaml layer:

```ts
for (const [key, value] of Object.entries(defaults)) {
  const fieldSchema = ConfigDefaultsSchema.shape[key as keyof typeof ConfigDefaultsSchema.shape];
  if (!fieldSchema) {
    // 非受管扩展键：保持原行为纳入
    configDefaults[key] = String(value);
    continue;
  }
  const parsed = fieldSchema.safeParse(value);
  if (parsed.success) {
    configDefaults[key] = String(value);
  } else {
    const reason = parsed.error?.issues[0]?.message ?? 'invalid';
    console.warn(t('config.effective.invalidValueSkipped', lang, { key, reason }));
  }
}
```

- **Unmanaged extension keys pass through** as `String(value)`.
- **Invalid managed values are skipped with a warning** and the key falls through to the next layer
  — they do not throw and do not abort the read. Warning text
  (`config.effective.invalidValueSkipped`): `配置项 {key} 取值非法，已跳过：{reason}`.
- A YAML parse failure yields an empty layer (`catch {}`), not an error.
- Missing `defaults` block or missing file → empty layer.

### 8.4 Skeleton initialisation — `resolveConfigDefaults(projectPath)`

Separate path, used to seed `status.md` skeleton values at stage creation:

- Reads **only** `.openfeel/config.yaml` `defaults` — **no status.md, no profile.yaml, no
  requirement layer, no effective merge**.
- Starts from `DEFAULT_CONFIG`, then per key:
  `ConfigDefaultsSchema.shape[key].safeParse(defaults[key])` → accept only when
  `parsed.success && typeof parsed.data === 'string'`.
- Because every field carries `.default()`, `safeParse(undefined)` succeeds and yields the schema
  default, which equals `DEFAULT_CONFIG[key]` — so absent keys are silently equal to builtin.
- YAML/read errors → keep all four defaults.

`normalizeConfigKey(key)` strips **one** `defaults.` prefix (`defaults.X` ≡ `X`); a bare `defaults.`
normalises to `''` and is rejected by the whitelist.

### 8.5 `flow.json`'s `workflow_mode` field

`StageData.workflow_mode?: WorkflowMode` is an **optional redundant field that does NOT participate
in the cascade** — the read authority is always status.md → requirement → config.yaml → builtin
(ruling G). It must never be used to resolve mode.

---

## 9. Stage-id parsing and the `archived_versions` prefix rule

Constants:

```ts
export const DEFAULT_SERIES = 'v1';
export const DEFAULT_STAGE_VERSION = 'v1.0.0';
```

### 9.1 `parseStageId(stageId): ParsedStageId | null`

```ts
// 完整/历史格式：{version}-stage-{NN}，version 可为 v1.0.0（四级）或 v4（仅主版本）
const full = stageId.match(/^(v\d+(?:\.\d+)*)-stage-(\d+)$/);
if (full) {
  const version = full[1];          // v1.0.0 或 v4
  const stageDir = `stage-${full[2]}`;
  const series = version.split('.')[0]; // v1 或 v4
  return { series, stageDir, fullStageId: stageId };
}

// 短名格式：stage-{NN}
const short = stageId.match(/^stage-(\d+)$/);
if (short) {
  const stageDir = `stage-${short[1]}`;
  return {
    series: DEFAULT_SERIES,
    stageDir,
    fullStageId: `${DEFAULT_STAGE_VERSION}-${stageDir}`,
  };
}

return null;
```

| Input | `series` | `stageDir` | `fullStageId` |
| --- | --- | --- | --- |
| `v1.0.0-stage-34` | `v1` | `stage-34` | `v1.0.0-stage-34` |
| `v4-stage-04` | `v4` | `stage-04` | `v4-stage-04` |
| `stage-01` | `v1` | `stage-01` | `v1.0.0-stage-01` |
| `foo`, `v1`, `''`, `stage-`, `v1.0.0-stage-01-x` | — | — | `null` |

Rules:

- **Leading zeros preserved**: `stage-04` stays `stage-04` (no `parseInt` on the `NN` capture).
  `stage-4` and `stage-04` are **different** `stageDir` values.
- `series` = first dot-segment of the version: `v1.0.0 → v1`, `v4 → v4`. Depth is unlimited
  (`v1.2.3.4` is accepted).
- `normalizeStageId(x)` = `parseStageId(x)?.fullStageId ?? null`.
- `stageIdToPlanDir(x)` = `` `plan/${series}/${stageDir}/` `` or `null`.
- **Directory convention**: `.openfeel/plan/{series}/stage-{NN}/` — `{series}` is the major-version
  series (`v{MAJOR}`), `{stage}` is `stage-{NN}` without the version prefix. `flow.json` stageId is
  the authoritative identity (unique key); the directory name is a derived organisational unit.

### 9.2 Double-key fallback (applies to every stage lookup)

```ts
const normalized = normalizeStageId(stageName) ?? stageName;
const key = this.data.stages[normalized] ? normalized : stageName;
```

The normalised (full) id is preferred; if it is not a key, the **raw input** is used. This is
repeated in `advanceStagePhase`, `resetStagePhase`, `findPhasePath`, `resolveCurrentPhase`,
`resolveStageWorkflowMode`, `checkRemovable`, `removeStage`, `autoRepairInconsistency` and the CLI
layer (`stageArg = normalizeStageId(options.stage) ?? options.stage`). Legacy data keyed by short
names must keep working.

### 9.3 `validateStageId`

```ts
if (!input || !input.trim()) {
  return { ok: false, reason: '阶段 ID 不能为空' };
}
if (!parseStageId(input)) {
  return { ok: false, reason: `非法阶段 ID：「${input}」（应为 stage-NN 或 vX.Y.Z-stage-NN）` };
}
return { ok: true };
```

CLI user-facing form (`common.stageIdInvalidTmpl` + `common.stageIdSuggestTmpl`):

```
{input} → 非法阶段 ID（应为 stage-NN 或 vX.Y.Z-stage-NN）
建议名称：{suggest}
```

`suggestStageId(projectPath, input)`: if `input` matches `/^(v\d+(?:\.\d+)*)$/`, that version is used;
otherwise `DEFAULT_STAGE_VERSION` (`v1.0.0`). `NN` = `max(used) + 1` over **that series only**,
collected from `flow.json.stages` keys ∪ `.openfeel/plan/{series}/stage-NN/` directory names, output
as `` `${version}-stage-${String(nextSeq).padStart(2, '0')}` `` (empty set → `1` → `01`).

### 9.4 Directory conflict

`findStageDirConflict(projectPath, stageId)` returns the *other* registered stageId that maps to the
same `(series, stageDir)` pair (e.g. `v4-stage-04` conflicts with `v4.0.0-stage-04`). `addStage`
throws:

```
阶段目录冲突：'{stage}' 与 '{other}' 映射同一 (series, stageDir)，请改用其它 stage-NN
```

(`StageDirConflictError`; `name = 'StageDirConflictError'`; exposed as `.stage` / `.other`.)

### 9.5 `archived_versions` prefix rule — `isArchivedVersionOf`

```ts
export function isArchivedVersionOf(
  stageId: string,
  archivedVersions: readonly string[] | undefined,
): boolean {
  const parsed = parseStageId(stageId);
  // 短名输入经 parseStageId 归一化（fullStageId ≠ 原输入）→ 恒 false（REV-80-001）
  if (!parsed || parsed.fullStageId !== stageId) {
    return false;
  }
  // 版本段派生：剥离 `-{stageDir}` 后缀（与 versionOfStageId 同源技术）
  const suffix = `-${parsed.stageDir}`;
  if (!parsed.fullStageId.endsWith(suffix)) {
    return false;
  }
  const version = parsed.fullStageId.slice(0, -suffix.length);
  return Array.isArray(archivedVersions) ? archivedVersions.includes(version) : false;
}
```

Rule: **explicit version prefix (full-id form) ∧ version segment ∈ `archivedVersions` → `true`;
everything else `false`.**

Three consequences a reimplementation is likely to get wrong:

1. **Short names are always `false`.** `stage-04` normalises to `v1.0.0-stage-04`, which is *not*
   equal to the input, so the `parsed.fullStageId !== stageId` guard rejects it. A short name must
   never be judged "archived" off the `DEFAULT_STAGE_VERSION` normalisation.
2. **The caller must pass the ORIGINAL input**, never a normalised product — passing
   `v1.0.0-stage-04` when the user typed `stage-04` changes the answer.
3. **Version segment derivation is suffix stripping**: `v1.1.7-stage-12` minus `-stage-12` =
   `v1.1.7`. `archivedVersions` comes from `flow.json.meta.archived_versions`; a missing field (or a
   non-array) is treated as `[]` → `false`. No `flow-archive/*` import is permitted here (would form
   a dependency cycle), which is why the derivation is re-implemented locally.

`planDirToStageId(projectPath, stageDir)` is the reverse map. Disambiguation when multiple stageIds
match `*-stage-{NN}`: (1) prefer `pipeline.current.stage` if it is in the match set; (2) otherwise
`matches.slice().sort().at(-1)` (lexicographically latest version prefix).

### 9.6 `findStageStatusPath` — 3-level fallback

1. Exact: `.openfeel/plan/{series}/{stageDir}/status.md`
2. Recursive: `fast-glob.sync('**/{stageDir}/status.md', { cwd: .openfeel/plan, onlyFiles: true, caseSensitiveMatch: true })` — first match
3. Legacy: `.openfeel/stages/{stageId}/status.md`

Returns an absolute path or `null`.

---

## 10. Invariants a reimplementation must preserve

### 10.1 Revision bumping and atomic write ordering (`save()`)

Exact order:

1. `if (!this.data) return;`
2. `this.data.meta ??= { version: '1.0', project: '', updated: '', revision: 0 };` (`??=` only fills a
   fully-missing `meta`, never overwrites existing fields)
3. `this.data.meta.updated = new Date().toISOString();`
4. Build a serialisable deep copy via `JSON.parse(JSON.stringify(this.data))` and **delete every
   `op.id`** — `op.id` is a runtime convenience field reconstructed from the `stages.{id}.ops` key on
   load; it is **never persisted**.
5. Acquire the project flow lock: `withFileLock(projectLockPath(this.projectPath, 'flow'), ...)`.
6. **Inside the lock**, read the on-disk revision (`readDiskRevision()`: missing file / corrupt /
   non-integer / absent → `0`).
7. If `diskRevision !== this.loadedRevision` → throw
   `FlowConcurrentModificationError(expected, actual)` with message
   `flow.json 并发冲突：期望 revision={expected}，磁盘为 {actual}（已被其它进程修改）`
   (`name = 'FlowConcurrentModificationError'`; surfaced by the CLI as **exit code 2**).
8. `nextRevision = this.loadedRevision + 1`; set `serializable.meta.revision = nextRevision`.
9. `atomicWriteFileSync(this.filePath, JSON.stringify(serializable, null, 2) + '\n', { backup: true })`
   — **always** write a `.bak` of the previous version (the `.bak` is not re-overwritten after a
   successful write, so it always holds exactly the previous version). Trailing newline is part of
   the contract.
10. Only **after** a successful write: sync memory (`this.data.meta.revision = nextRevision`) and the
    load baseline (`this.loadedRevision = nextRevision`) so consecutive `save()` on the same instance
    does not self-conflict.
11. On any throw: `console.error('[ERROR] flow.json 保存失败: {msg}')` then rethrow.

Consequences:

- **The core never saves.** `advanceStagePhase` / `resetStagePhase` / `recordAttempt` mutate memory
  only; the **command layer** calls `save()`.
- Revision is strictly monotonic per instance: `loadedRevision → loadedRevision + 1`, and memory
  follows only on success.
- `setData()` (test-only injection) re-syncs `loadedRevision` from disk.

### 10.2 `advanceStagePhase` side-effect ordering (exact)

```
1.  resolve + normalise stage key (double-key fallback); throw if missing
2.  validate target phase (Schema → fuzzyCorrectPhase fallback)
3.  if target === 'done': blocking-REV gate (throw)         ← BEFORE any mutation
4.  capture fromPhase = stage.phase
5.  stage.phase = targetPhase
6.  saveCheckpoint(key, targetPhase)                        ← best-effort, never blocks
7.  if targetPhase ∈ {exec_running, review_pending, test_pending, archiving}: createLogSkeleton(key, targetPhase)
8.  syncCurrentOp(key)                                      ← single owner of pipeline.current
9.  pipeline.phase = (allDone && stages non-empty) ? 'done' : 'active'
10. resumed = computeResumed(this.data.log, key, fromPhase, sessionId)   ← BEFORE appendLog
11. appendLog({ action: 'advance_stage_phase', detail: {...} })
12. stage.status = mapPhaseToStageStatus(targetPhase, prevStatus)
13. if (!stage.stats || !stage.stats.start_time) startStage(key)
14. if (targetPhase === 'done' && prevStatus !== 'done'):
        endStage(key); syncRequirementStatus(this.data, key); return true
    return false
```

- Return value `true` ⇒ "this transition made the stage `done`"; the **caller must `save()` and then
  call `autoCommitOnDone(stageName)`** — the git commit must happen **after** `save()`, otherwise the
  commit would not contain the phase change.
- `saveCheckpoint` and `createLogSkeleton` are both `try-catch` best-effort: a failure must never
  block the transition.
- Step 10 must precede step 11: the resume scan walks the log **backwards** for the most recent
  `advance_stage_phase` / `reset_stage_phase` entry with `detail.stageName === stageKey &&
  detail.to === exitedPhase`. Writing the new entry first would make it scan itself.

### 10.3 Log appending

```ts
appendLog(entry: LogEntry): void {
  const logEntry: LogEntry = { ...entry, time: entry.time || new Date().toISOString() };
  this.data.log.push(logEntry);
}
```

- `time` is filled **only if falsy**; callers pass `time: ''` and rely on this.
- Append-only; entries are never mutated or removed by the transition code (only `flow archive`
  removes log segments, and it does so by replacing the whole array).
- `advance_stage_phase` detail, exact key set:

  ```ts
  {
    stageName: key,          // always the normalised/full stageId
    from: fromPhase,
    to: targetPhase,
    session_id: sessionId,   // always present
    ...(resumed === null ? {} : { resumed }),   // only when decidable
    ...(opts?.reviewTier === undefined ? {} : { review_tier: opts.reviewTier }),  // ONLY when explicitly declared
  }
  ```

  `review_tier` and `resumed` are **conditional**: omitting them keeps legacy entries byte-identical.
  `resumed` is only computed when the session id starts with `env:` or `project:`; `proc:` ids and
  entries without a trustworthy `session_id` yield `null` (field omitted, never guessed).
- `reset_stage_phase` detail: `{ stageName, from, to, session_id, ...(resumed ? {resumed} : {}) }` —
  no `review_tier`.
- `agent` = the `triggeredBy` argument, default `'flow-manager'`; the CLI passes `'cli'`. The
  hard-coded `'flow-manager'` must not be used for CLI-driven entries.

### 10.4 Checkpoints

- Directory: `.openfeel/checkpoints/`; filename `{stageId}-{yyyyMMddTHHmmss}-{phase}.json`.
- Timestamp format `yyyyMMdd'T'HHmmss` (local time, via `formatCheckpointTimestamp`).
- Retention: `CHECKPOINT_MAX_KEEP = 20` **per stageId**; oldest removed past the cap.
- Serialised with the same `op.id` stripping as `save()`; written atomically **without** the global
  lock (avoids putting a long serialisation in the critical section).
- `listCheckpoints` sorts ascending (lexicographic on the timestamped filename) and matches both the
  normalised key prefix and the raw short-name prefix (legacy snapshots).
- Snapshots are **not** written by `resetStagePhase`.

### 10.5 Log skeletons

`SKELETON_PHASES = ['exec_running', 'review_pending', 'test_pending', 'archiving']` — entering any of
these phases auto-creates the stage's log file skeleton (`createLogSkeleton`). The list is exactly
these four; `review_failed` / `review_passed` / `test_failed` / `test_passed` / `scheme_*` /
`plan_*` do not trigger it.

### 10.6 `pipeline.current` single ownership and `pipeline.retry`

- `syncCurrentOp(stageName)` is the **only** function allowed to set `pipeline.current` during
  transitions. It points at the **first** op (in `stages[key].ops` insertion order) whose state is
  `pending` or `executing`, else sets `op` to `''` — it **never** leaves a stale op pointer.
  It performs no I/O and does not touch `pipeline.phase` / `pipeline.retry`.
- `pipeline.retry` is **op-level retry accounting**, not a phase-transition backoff:
  - `recordAttempt(pass)` → `attempts += 1`, `state = 'done'`, `attempted_at = completed_at = now`,
    `pipeline.retry = 0`.
  - `recordAttempt(fail)` with `attempts < max_attempts` → `state = 'pending'`, `attempted_at = now`,
    `completed_at` untouched, `pipeline.retry += 1`, returns `{shouldRetry: true, shouldReplan: false}`.
  - `recordAttempt(fail)` with `attempts >= max_attempts` → `state = 'failed'`, both timestamps set,
    `pipeline.retry += 1`, returns `{shouldRetry: false, shouldReplan: true}`.
  - Legacy `advancePhase(opId, ...)` resets `pipeline.retry = 0` when the current stage/op pointer
    changes.
- `flow attempt --result fail` with `shouldReplan === true` auto-advances to `scheme_pending`
  (`mgr.advancePhase(options.op, 'scheme_pending')` then `save()`), regardless of workflow mode —
  this is a known hard-coded full-mode target inside the fast-mode code path.
- **No automatic phase-level backoff exists**: `review_failed` / `test_failed` looping is purely the
  transition table's outbound edges (§2.1, §3.3). Nothing counts how many times a stage has entered
  `review_failed`, and nothing expires those edges.

### 10.7 Transition legality lives in the command layer

`advanceStagePhase` validates only the **phase enum** (plus the `done` REV gate). It **never**
consults the transition table. All table-based legality is enforced by the command layer through
`findPhasePath` (§6.3 gate 8–12), which is **skipped entirely by `--force`**. Therefore:

- `flow stage reset --to <any valid phase>` can jump anywhere in either direction.
- `flow advance --force --to <any valid phase>` can jump anywhere.
- Only these two paths consult the table: `flow advance` (without `--force`) and the read-only
  queries (`flow phases`, `flow mode`, `flow status --verbose`, `flow wizard`).

`findPhasePath` = BFS over `getValidTargets`, depth cap `PHASE_PATH_MAX_DEPTH = 8`:

- start === target → `{ path: [], reason: 'already-at-target' }`
- multiple shortest-depth paths → `{ path: [], reason: 'ambiguous' }` (**refuse, never guess**)
- depth exhausted → `{ path: [], reason: 'depth-exceeded' }`
- exhausted queue → `{ path: [], reason: 'no-path' }`
- unique shortest path → `{ path: [...targets excluding start], reason: 'ok' }`
- Pure read-only: no disk write, no memory mutation. Mode is resolved **once** outside the BFS (same
  table for the whole search).

### 10.8 Tier and table-purity invariants

- `pruneTransitionsByTier` must return **new objects and new arrays**; `FAST_TRANSITIONS` and
  `pipelineConfig` must never be mutated. `getPipelineTransitions` and `getDefaultTransitions` return
  fresh deep-ish copies for the same reason.
- `getPipelinePhases()` returns a **copy** of `pipelineConfig.phases`.
- The 15-value `PipelinePhase` domain is never modified by pruning, by mode, or by config.
- `resolveTransitionsForMode` is the **single point** of table selection (validation, advance, path
  finding and display all go through it); `pruneTransitionsByTier` is the **single point** of pruning.
  A reimplementation must not add a second ordering or a second pruning spectrum.

### 10.9 Reading/parsing invariants

- `flow.json` load: `stage.ops ??= {}`, `stage.deps ??= []`, and `op.id = opKey` for every op (guarded
  by `typeof === 'object' && !Array.isArray`). A parse failure yields `data = null` and
  `loadedRevision = 0` — it must **not** throw.
- `pipeline.yaml` load: absent file → built-in full defaults; any `PipelineConfigSchema.parse` failure
  → built-in full defaults (silent, whole-file fallback); `fast_transitions` is parsed **independently**
  and never fails the whole config.
- `meta.archived_versions` is **not** backfilled on load; readers derive `?? []`.
- `requirements` is **not** backfilled on load; `getRequirements()` derives `?? []`.
- `validate()` **mutates** in-memory data while reporting (`stage.phase = 'plan_pending'`, fuzzy
  corrections, `pipeline.phase` correction) — these are warnings, not errors, and they are not saved
  by `validate()` itself.
- `fuzzyCorrectPhase` precedence: `phase_corrections` exact map → normalise
  (`trim().toLowerCase().replace(/[\s_-]+/g, '_').replace(/^_|_$/g, '')`) → exact enum →
  unique **prefix** (`p.startsWith(normalized + '_')`) → underscore-stripped equality → unique
  **contains** → unique **suffix** (`p.endsWith('_' + normalized) || p.endsWith(normalized)`) →
  hard-coded `extraCorrections` map → `null`. Multi-hit prefix/contains/suffix all return `null`
  (they do **not** pick the first). `extraCorrections` (after normalisation) includes
  `planned→plan_pending`, `planning→plan_pending`, `plan_done→plan_passed`, `plans_passed→plan_passed`,
  `scheme_planned→scheme_pending`, `scheme_done→scheme_passed`, `exec→exec_running`,
  `exec_pending→scheme_passed`, `running→exec_running`, `review→review_pending`,
  `review_done→review_passed`, `reviews_passed→review_passed`, `testing→test_pending`,
  `test→test_pending`, `test_done→test_passed`, `archive→archiving`, `archived→done`,
  `finished→done`, `completed→done`, `complete→done`, `end→done`.

---

## 11. CLI read-only vs writing surface (pipeline area)

### 11.1 `flow phases` — read-only

Options: `--json`, `--mode <full|fast|general>`, `--stage <id>`.

Evaluation order: ① `--mode` domain check against `getConfigFieldLegalValues('workflow_mode')`
(illegal → `字段 工作流模式 的取值非法：{value}（允许：full, fast, general）`, exit 1); ② `--stage`
format check then existence check (`known = flow.json stage keys ∪ findStageStatusPath(...)`, both
missing → stage-id error + suggestion, exit 1); ③ mode derivation =
`explicitMode ?? mgr.resolveStageWorkflowMode(stageArg).value`; ④ table = `getPipelineTransitions(derivedMode)`
(tier defaults to `full`); ⑤ diff vs `getDefaultTransitions(derivedMode)`.

**Human-readable output, exact sequence:**

```
OpenFeel 流水线 phase 自描述
合法 phase 列表: {N}
  - {phase}
  ...
(blank)
当前模式：{mode}  [来源: {source | --mode}]
提示：查看模式来源与切换：openfeel flow mode [--stage <id>]
审查档位：{tier}（模式派生自 {mode}）
提示：审查档位仅裁剪审查关（全量 / 精简 / 免审）；显式声明：openfeel flow advance --review-tier <tier>
phase 流转映射（from → [to...]）:
  {key} → [{t1, t2}]
  ...
(blank)
[检测到运行时转移表与内置默认存在差异：{detail}]      ← only when a diff exists
[提示：运行时 pipeline.yaml 含内置 15 个 phase 之外的 phase（{phases}）；…]   ← only when custom phases exist
提示：`openfeel flow advance --stage <id> --to <phase>` 推进
```

Diff `detail` = `; `-joined fragments:
`缺失键 {keys}` / `新增键 {keys}` / `目标集不同 {keys}`.

Diff computation (`transitionsDiff`):

```ts
const missingKeys = Object.keys(defaults).filter((k) => !(k in transitions));
const extraKeys = Object.keys(transitions).filter((k) => !(k in defaults));
const changedKeys = Object.keys(defaults).filter(
  (k) => k in transitions && JSON.stringify(defaults[k]) !== JSON.stringify(transitions[k]),
);
const transitionsDiff = { missing: missingKeys, extra: extraKeys, changed: changedKeys };
```

Array comparison is `JSON.stringify` ⇒ **order-sensitive** (`['a','b']` ≠ `['b','a']` → `changed`).

### 11.2 `flow phases --json` — exactly 7 keys, in this order

```ts
console.log(JSON.stringify({ schemaVersion: 1, phases, transitions, advanceAccepted: [...PIPELINE_PHASES], transitionsDiff, workflowMode: derivedMode, reviewTier: MODE_DERIVED_TIER[derivedMode] }, null, 2));
```

| # | Key | Value |
| --- | --- | --- |
| 1 | `schemaVersion` | `1` |
| 2 | `phases` | `mgr.getPipelinePhases()` — **runtime** `pipeline.yaml` phases (may include custom phases) |
| 3 | `transitions` | `getPipelineTransitions(derivedMode)` — unpruned (tier = `full`) |
| 4 | `advanceAccepted` | `[...PIPELINE_PHASES]` — the **built-in 15**, i.e. `flow advance`'s whitelist |
| 5 | `transitionsDiff` | `{ missing: string[], extra: string[], changed: string[] }` |
| 6 | `workflowMode` | the mode this display is based on |
| 7 | `reviewTier` | `MODE_DERIVED_TIER[workflowMode]` — **display only**, never the effective advance tier |

`phases` vs `advanceAccepted` are deliberately distinct: `phases` is the runtime existence view
(custom phases allowed); `advanceAccepted` is the fixed 15-phase whitelist. Custom phases are shown
but rejected by `flow advance` (the `flow.phases.customPhaseNote` hint says so).

### 11.3 `flow mode` — read-only

Options: `--stage <id>`, `--json`.

`--json` payload: `{ schemaVersion: 1, stage, mode, source, modes: { full, fast, general } }` where
each `modes[x]` = `getPipelineTransitions(x)` (unpruned) and `stage` is `''` when unset. No
`isLoaded()` guard on the JSON path — it stays a single pure JSON document even when uninitialised.
The human-readable path prints `流水线未初始化（flow.json 不存在）` (`common.noInit`) when `!isLoaded()`.
No `save()`, no `appendLog`, no file writes at all.

Human lines:

```
当前模式：{mode}  [来源: {source}]
可达目标（{stage} · {phase}）：{targets}      ← only when stage && phase known
```

### 11.4 `flow advance` — writing

See §6.3/§6.5. Side effects, in order: optional `autoRepairInconsistency` + `save()`; per step
`advanceStagePhase(...)` → `save()` → optional `autoCommitOnDone`; optional `MetricsStore.save()`
once at the end; optional dirty-git warning box when `--to done || archivedAny` and not `--quiet`.

- `--quiet` silences non-error output (success line and git box), never errors.
- Multi-step (path length > 1) prints `已推进：{stage} {from} → {to}` per step; a single step prints
  only the final `✓ 已推进: {stage} → {to}`.
- Metrics: one `recordRun` per exited phase using `PHASE_AGENT_MAP[exitedPhase]`; skipped (with a
  `runtimeLog('debug', ...)` trace) when no baseline timestamp is found — a `0` value is never
  recorded.

### 11.5 `flow stage reset` — writing

`flow stage reset <stageId> --to <phase> [--dry-run]`. Writes one `reset_stage_phase` audit entry,
`save()`, and **nothing else** (no checkpoint, no archive commit).

```
─── 复位预览（未写盘）───
  {stage}: {from} → {to}（status → {status}）
```
```
✓ 已复位阶段 {stage}: {from} → {to}
```
```
阶段 {stage} 已处于 {phase}，无需复位
```

Errors surface as `错误：{msg}` (`common.errorTmpl`) → exit 1; `isFlowConcurrentError` → exit 2.

### 11.6 `flow wizard` — writing, TTY only

- Non-TTY: `flow.wizard.nonTtyHint` = `当前环境非交互式；请改用 flow advance 等非交互命令` to stderr,
  `process.exitCode = 1`, no interaction.
- Interactive; calls `getAvailablePhases(currentStage)` with the **default tier `full`** — the wizard
  never offers a tier choice, and `general` is not offered as a workflow mode (choices are only
  `full` / `fast`).
- First-run mode selection: asks once when the stage has no `工作流模式` field **and** the project has
  no explicit `defaults.workflow_mode`; writes the stage field into `status.md`
  (`insertStatusField`, `no-anchor` → warning, not fatal) **and** remembers it via
  `setConfigValue(cwd, 'workflow_mode', chosen)` (incremental write, comments preserved).
- Advances via `advanceStagePhase(currentStage, targetPhase, 'cli')` then `save()` then
  `autoCommitOnDone` when it returned `true`.

---

## 12. Quick-reference constants

| Constant | Value |
| --- | --- |
| `PIPELINE_PHASES.length` | `15` |
| `META_PHASES` | `['active','paused','done']` |
| `REVIEW_TIERS` | `['full','lean','skip']` |
| `TIER_PRUNED_PHASES` | `{ full: [], lean: ['scheme_review'], skip: ['plan_review','scheme_review'] }` |
| `MODE_DERIVED_TIER` | `{ full: 'full', fast: 'lean', general: 'full' }` |
| `TRANSITION_OR_SEPARATOR` | `'\|'` |
| `FAST_TRANSITIONS` entry count | `9` (8 flow keys + `done`) |
| Built-in FULL transition count | `16` (15 phase keys + 1 OR-key) |
| Shipped `pipeline.yaml` transition count | `15` (no OR-key) |
| `PHASE_PATH_MAX_DEPTH` | `8` |
| `CHECKPOINT_MAX_KEEP` | `20` |
| `STAGE_STATUS_VALUES` | `['planned','review_failed','review_passed','testing','archiving','done']` |
| `EFFECTIVE_CONFIG_KEYS` | `['execution_mode','auto_advance','merge_mode','workflow_mode']` |
| `DEFAULT_CONFIG` | `{ execution_mode:'manual', auto_advance:'enabled', merge_mode:'manual', workflow_mode:'fast' }` |
| `DEFAULT_SERIES` / `DEFAULT_STAGE_VERSION` | `'v1'` / `'v1.0.0'` |
| `SKELETON_PHASES` | `['exec_running','review_pending','test_pending','archiving']` |
| `flow phases --json` key count | `7` |

---

## 13. Top reimplementation hazards (summary)

1. **Mode-derived tier ≠ effective advance tier.** `fast` derives `lean` for *display*, but
   `flow advance` without `--review-tier` uses **`full`** (zero pruning). Wiring the derived tier into
   advance silently changes behavior.
2. **Pruning acts on inbound edges only.** A pruned phase keeps its outbound edges, so a stage
   already sitting in `plan_review` can still advance. Deleting the key would be wrong.
3. **Edge contraction is mandatory**, including the `!keyConds.includes(cascaded)` self-loop guard
   (`fast` + `skip` ⇒ `plan_pending → ['plan_passed']`). Filtering without contraction strands
   `plan_pending`.
4. **`test_passed` maps to `testing`, not `done`.** Mapping it to `done` lets
   `autoRepairInconsistency` rewrite the phase and truncate `test_passed → archiving`.
5. **The built-in full table has an extra OR-key the shipped `pipeline.yaml` lacks**
   (`'review_passed|test_passed'`). All matching keys contribute (union), so with the built-in table
   `review_passed` has two targets, with the runtime table only one. `transitionsDiff.missing`
   exposes the difference.
6. **`transitionsDiff.changed` is order-sensitive** (`JSON.stringify` comparison).
7. **No op-state gate on advance.** Advancing never requires ops to be `done`; the only op-count gate
   is `flow stage remove` (`checkRemovable`).
8. **`blocking !== false` means blocking.** Undefined must be treated as blocking, and `--force` can
   never bypass the `done` gate.
9. **`fast_transitions: {}` means "use the built-in fast table"**, not "empty pipeline". Only
   `mode === 'general'` expresses an empty table.
10. **`general` is a stage-level illegal value** (rejected by `stage set`, `plan stage add`,
    `config set`) but reachable via requirement `workflow_mode`; `--force` on `flow advance` does
    move a general-mode stage.
11. **A pruned/empty table yields `no-path`, and a general table additionally triggers the dedicated
    `generalNoPipeline` message** — the ordering of that branch matters.
12. **`isArchivedVersionOf` is always `false` for short names** and requires the *original* input.
13. **`save()` writes the `.bak` unconditionally and bumps revision only after the atomic write
    succeeds**; the core never saves.
14. **`op.id` must be stripped on every serialisation** (`save()` and `saveCheckpoint`), and
    `review_tier` / `resumed` log keys must be omitted unless explicitly present.
15. **The `done` git commit must happen after `save()`**, driven by the `true` return of
    `advanceStagePhase`.
16. **`flow phases` shows the unpruned table even when it reports `reviewTier: "lean"`.**
