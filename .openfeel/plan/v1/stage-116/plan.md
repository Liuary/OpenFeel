# v1.5.6-stage-116 计划 — 零运行时开销的「流程健康」代理指标（`flow metrics` 人类块 + 适配器 `observability`）

- **阶段**：`v1.5.6-stage-116`（工作流模式 **fast**；批次发布，全部门禁绿才发 1.5.6）
- **关联需求**：REQ-016（`.openfeel/requirements/REQ-016.md`）
- **目标**：给 v1.5.5 的 preflight 闸门加**可观测性自检**——不加监控、不告警、不写指标文件，只用**已存在的两份账本**（`flow.json.log` + `.openfeel/dev/.preflight.json`）推导三项代理指标，让「闸门是不是形式主义」在 1.5.7 有据可判。
- **事实基线（写计划时刻 `2026-10-31T20:33+08:00`）**：逐文件 `read` + `grep` 核对（非推测）；**行号 = 写计划时刻的行号**。⚠ stage-115 **尚未完成**（`review_pending` → 期间又 `advance` 到 `exec_running`），其改动**未提交**，行号会在 115 提交前后各位移一次 ⇒ 见 §12.1。
- **当前基线（执行期以 115 提交后实测为准）**：`lint i18n` **1057** / 成功出口 **41** / 注册 `--json` 选项 **42** / vitest **88 文件 2155 用例** / dsh `verify.js` **96/96**。
- **前置约束（硬，已机读化）**：`v1.5.6-stage-116.deps = ["v1.5.6-stage-115"]`（`flow.json:78-80`，由 `feel_stage action=deps` 落盘）⇒ 顺序由 `deps` 声明；但 **`deps` 不阻塞 `flow advance`**，「115 已 `done` 且改动已提交」仍是执行纪律（§12.1）。
- **两条 blocking REV 已并入本版**：REV-022（适配器 observability 在自测）→ §0.5 / §3.2；REV-023（dwell 另造第二套更弱口径）→ §0.3 / §2.1。落实节号见 §12.2。

---

## 0. 事实核对结果（先读这一节）

### 0.0 现状快照（**写计划时刻** `2026-10-31T20:33+08:00`，仅作记录，**不作断言**）

| 记录项 | 写计划时刻实测 | 用途 |
|---|---|---|
| `advance_stage_phase` 条目 | **20** | 记录 |
| 其中带 `resumed` 布尔 | **17**（全部 `false`） | 记录 |
| 缺 `resumed` 字段 | **3** | 记录（结构性偏倚，§0.4） |
| `to === 'plan_review'` 的 advance | **3** | 记录 |
| `to === 'plan_pending'` 的 advance | **0** | 记录 |
| `register_stage` / `add_stage` | **3** / **0** | 记录 |
| `.preflight.json.at` | `2026-10-31T12:32:09.034Z` | **= 本轮 `feel_status` 时刻** ⇒ REV-022 实证 |

> ⛔ **这些数字不得写进任何断言**（§8：全部改为不变量）。日志随每次推进变化，硬编码期望会逼执行者「为对数字改代码」。需要量级示例时，唯一允许的写法是 §2.3 的**可达样例**（固定假时钟 + 固定 fixture，不引用真实日志计数）。

### 0.1 `flow metrics` 现状（`src/commands/flow.ts`，写计划时刻行号）

| 符号 | 行 | 结论 |
|---|---|---|
| `flow.command('metrics')` | 509-511 | description `'展示 Agent 性能指标'` |
| `.option('--json')` | 512 | 只此一个选项 |
| `--json` 早返回 | 518-521 | `console.log(JSON.stringify({ schemaVersion: 1, ...store.getSummaryData() }, null, 2)); return;` ⇒ **JSON 分支在 FlowManager 构造之前就 return** |
| 人类输出 | 522 | `console.log(store.summary(lang));` |
| v1.5.4 观测块 | 523-534 | `const mgr = new FlowManager(process.cwd())`（**仅非 JSON 分支**）+ `mgr.isLoaded()` 守卫；块头 `'── Observability ──'` / `'── 观测指标 ──'` |
| **本阶段插入点** | **534 之后、535 `});` 之前** | 同一 `if (mgr.isLoaded())` 内，`data` 已就绪（527 `const data = mgr.getData();`） |

**既有范式（照抄模板）**：`flow log` 阶段摘要（`flow.ts:1539-1554`）= 人类输出块 + 内联 `en ? … : …` + **零 i18n 键** + 块头 `── … ──` ⇒ 沿用，**不新增 i18n 键 ⇒ `lint i18n` 恒 1057**。

### 0.2 日志真实结构与 action 名（`src/core/flow-manager.ts`）

| 事实 | 出处 | 值 |
|---|---|---|
| `LogEntry` | `:97-102` | `{ time, agent, action, detail: Record<string, unknown> }` |
| 保留上限 | `:105` | `export const MAX_LOG_ENTRIES = 200` |
| `appendLog` | `:2931-2943` | `time` 空时填 `new Date().toISOString()` |
| **推进条目** | `:1608-1618` | `action: 'advance_stage_phase'`；`detail = { stageName, from, to, session_id, ...(resumed===null?{}:{resumed}), review_tier?, rework_reason? }` |
| **resumed 三态** | `:1601-1606` + `:1487-1509` | `true` 异会话 / `false` 同会话 / **`null` ⇒ 字段省略**；仅 `env:`/`project:` 前缀可信，`proc:` ⇒ null |
| **复位条目** | `:1710-1711` | `action: 'reset_stage_phase'`（**同样带 `resumed`，`to` 可为 `plan_pending`**） |
| **注册条目** | `:1188` | `action: 'register_stage'`；`detail = { stageName, deps }` |
| **新增阶段条目** | `:1801-1806` | `action: 'add_stage'`；`detail = { stageId, phase: initialPhase }` ⚠ **键是 `stageId`，不是 `stageName`**；`agent: 'flow-manager'` |
| `add_stage` 调用点 | `flow.ts:731`（`flow stage add`）、`flow.ts:2659`（wizard）、`stage.ts:683`（`stage create`） | 三处均走 `mgr.addStage` ⇒ **只写 `add_stage`，无 `register_stage`** |
| fast 转移表 | `:520-523` | `plan_pending: ['plan_review']`；`plan_review: ['plan_passed', 'plan_pending']`（返工边） |
| 日志体积 | `:2989-2992` | `getLogStats()`（v1.5.4；只读，复用不改） |
| 阶段日志摘要 | `:2950-2986` | `getStageLogSummary()` 含 `resumeCount`（**只数 `resumed === true`**，无分母）；本阶段**不改它** |

### 0.3 ⚠ 关键修正 1（**REV-023**）：dwell 必须**复用** `findPhaseEnteredAtMs`，不另造口径

> **执行期口径更正（落地后回写，Feel 记录）**：实现最终拆成两个函数——`findPhaseEntry(...)` 是**唯一回扫实现**（含 `includeAddStage` 参数与 `add_stage` 锚），`findPhaseEnteredAtMs(...)` 是**只取时间戳的薄封装**；dwell 走 `findPhaseEntry`。
> REV-023 的意图（单一实现、不造第二套口径）**完全成立**；本节及后文凡写「`findPhaseEnteredAtMs` 唯一实现 / dwell 调它」处，均按此口径理解。冻结 legacy 等价性测试覆盖薄封装（`includeAddStage:false`），`findPhaseEntry` 另有脏条目降级用例。

仓内**已有权威口径**：

```ts
// src/commands/flow.ts:2851-2870（当前为文件内私有函数）
function findPhaseEnteredAtMs(mgr, stageArg, fromPhase, logLenBefore): number | null
// 回扫 [0, logLenBefore)；匹配 advance_stage_phase **与** reset_stage_phase 的 detail.to === fromPhase；
// fromPhase === 'plan_pending' 时兜底 register_stage；无基线 → null（不记 0 值）
```

上一版设计（`start = max(register_stage, advance.to='plan_pending' < end)` 且 `end = 首个 plan_review`）有**三处硬伤**，已核实，**撤销**：

1. **锚点不全**：`plan stage add` / `stage create` 只写 `add_stage`（`detail.stageId`），无 `register_stage` ⇒ 这类阶段**永远无锚、整段漏采**。仓内 `test/commands/flow.test.ts:3573-3581` M4 已固化「`add_stage` 非 `register_stage` → 无基线」。
2. **漏 `reset_stage_phase(to='plan_pending')`**：复位回 `plan_pending` 后重新过闸的轮次完全没有锚。
3. **自相矛盾**：`end` 取**首个** `plan_review`，而任何 `advance.to='plan_pending'` 必然发生在至少一次 `plan_review` **之后** ⇒ `time < end` **恒不成立**，该锚项在合法日志里**不可达**；且多周期阶段只采第一轮，返工轮永不入库。

**裁定（本版采用）：下沉 + 复用同一实现**

- 提取到 **`src/core/phase-entered.ts`**（新文件）：
  `export function findPhaseEnteredAtMs(log: LogEntry[], stageArg: string, fromPhase: string, logLenBefore: number, options?: { includeAddStage?: boolean }): number | null`
  - `flow.ts:1257` 改为引用同一实现（调用点由 `mgr` 改为 `mgr.getData()?.log ?? []`，**纯提取、行为零变更**）；删除 `flow.ts:2845-2870` 本地副本。
  - `options.includeAddStage` **默认 `false`** ⇒ 保住 flow.ts T1 duration 与 `metrics.json` 既有契约（M4 用例仍绿）。
  - `add_stage` 分支：`detail.stageId === stageArg` **且**（`detail.phase` 缺失 或 `=== 'plan_pending'`）；`initialPhase ≠ plan_pending` 的 `add_stage` **排除**（§7.1 局限 + 测试固化）。
- `process-health.ts` 的 dwell **显式传 `{ includeAddStage: true }`** ⇒ **只有一份真值**。
- **停留按每个 `plan_review` 事件逐个配对**：对第 `i` 条 `advance_stage_phase` 且 `detail.to === 'plan_review'`，`start = findPhaseEnteredAtMs(log, stageName, 'plan_pending', i, { includeAddStage: true })`，`dwell = Date.parse(log[i].time) − start`。返工轮自然各自成样本。
- **等价性测试（REV-023 硬要求）**：本版是「复用」，仍要求一条**冻结 legacy 参考实现**的等价性测试（test 文件内保留旧算法副本逐条比对），用例名见 §6.1 #7。

### 0.4 ⚠ 关键修正 2（**结构性偏倚**，不是「旧代码路径」）：`resumed` 缺字段

`resumed` 是三态字段（`true` / `false` / **缺失 = 不可判定**）。**缺失是结构性的**：

> `computeResumed` 回扫「更早一条 `detail.to === 退出相位`」的条目；而**阶段出生即 `plan_pending`**（`register_stage` / `add_stage` 写 `phase: initialPhase`，不是 `to: plan_pending`）⇒ **每个阶段的第一条 advance 恒不可判定** ⇒ `unlabeled ≥ 阶段数`。

- 分母 `labeled` = `typeof detail.resumed === 'boolean'` 的 **advance** 条目数
- 分子 `resumedTrue` = `detail.resumed === true` 的条目数
- `unlabeled` = advance 总数 − labeled，**不进分母**，但**必须在人类输出外显**（`另有 N 条不可判定`），否则读者会把「不可判定」当成「同会话」
- **排除项（R4，冻结）**：`reset_stage_phase` **不计入** resumed 比例——`resumed` 衡量「stage 生命周期内的**推进**是否跨会话恢复」，`reset` 是**返工**语义，混进来指标就没意义
- `labeled === 0` → 输出「无数据」，**绝不输出 `0.0%`**

### 0.5 preflight 账本 + ⚠ **REV-022 自测陷阱**

| 符号 | 行（`src/core/preflight.ts`） | 结论 |
|---|---|---|
| `PREFLIGHT_MAX_AGE_MS` | 15 | `10 * 60_000` |
| `preflightPath` | 34-36 | `.openfeel/dev/.preflight.json` |
| `PreflightRecord` | 19-24 | `{ at, stage, phase, revision }` |
| `readPreflight(projectPath)` | 75-90 | 缺失 / 损坏 / `at` 非 string → `null`；**不抛**。✅ 只读入口 |
| `recordPreflight(...)` | 44-73 | **会写盘** ⇒ 本阶段**严禁调用** |

**REV-022（已实证）**：`readSnapshot` 并发跑 `flow status --json` / `flow next --json`（`dashboard.js:131-135`），而这两条命令在 `--json` 早返回**之前**就写账本：

- `flow status`：`flow.ts:62` `if (mgr.isLoaded()) recordPreflight(process.cwd());` ← **早于** `:64` 的 `if (options.json)`
- `flow next`：`flow.ts:197` `recordPreflight(process.cwd());`（在 `--json` 输出之前）

⇒ 若在 `await readSnapshot(...)` **之后**才 `readPreflightInfo`，读到的是**本次调用刚写的**账本 ⇒ `age ≈ 0`、`ok === true`、summary 恒「0s 前（有效）」——**指标在测自己**。实测佐证：本轮 `.preflight.json.at = 12:32:09.034Z` = 本轮 `feel_status` 时刻。

**修正见 §3.2**：`readPreflightInfo` 必须移到 `await readSnapshot(...)` **之前**（读取次数不变，仍零新增 I/O）。

### 0.6 适配器侧（`dsh/`）

| 符号 | 行 | 结论 |
|---|---|---|
| `readPreflightInfo(projectRoot, now)` | `dsh/lib/adapters/preflight.js:16-30` | `{ ok, at: string\|null, ageMs: number\|null, mode: string }`；**不抛**；已由 `tools/index.js:19` 引入 |
| `readStatusSync(projectRoot, now)` | `dsh/lib/adapters/dev-status.js:19-40` | **三键** `{ due, lastSync, intervalMinutes }`；损坏 → `due:true`；**不抛** |
| `readSnapshot` 组装 | `dsh/lib/adapters/dashboard.js:123-263` | 含 `stale: next === undefined`（**:196**）；**不含** `statusSync` / `preflight` / `observability` |
| `planNextStep` 返回点 | `dashboard.js:374` / `:419` | 各自 `statusSync: snapshot.statusSync ?? null`（因 `:392` 的 hint 消费 `statusSync.due`） |
| **statusSync / preflight 挂载点** | `dsh/lib/tools/index.js:160-163`（feel_status）、`:197-203`（feel_next） | `snapshot.statusSync = readStatusSync(...)` / `snapshot.preflight = readPreflightInfo(...)`；`plan.preflight`（:203）、`plan.recovery`（:205）、`plan.dispatch`（:206） |
| `recovery` 范式 | `tools/index.js:199,205` | **只在 tools/index.js 挂到 plan**，`dashboard.js` 不参与 ⇒ `observability` 照此 |
| verify.js | `dsh/test/verify.js` | 96 条 `check`；`:16,18,21` **直接 import 磁盘源码**（`../lib/...`）⇒ **不加载宿主 bundle** |
| 适配器指纹 | `src/core/adapter-hash.ts:40-65` | 遍历 `dsh/lib/**`；新增文件 ⇒ 指纹变（影响运行中宿主与 `setup --check`，**不影响 verify.js**） |

---

## 1. 范围

### 1.1 做

1. `src/core/phase-entered.ts`（**新文件**）：从 `flow.ts` 提取 `findPhaseEnteredAtMs`（唯一实现，`add_stage` 可选）。
2. `src/core/process-health.ts`（**新文件**）：三项指标纯函数 + 文案（零 I/O），dwell 复用 §0.3 实现。
3. `src/commands/flow.ts`：`flow metrics` 人类输出追加「流程健康」块；`:1257` 改用共享实现并删 `:2845-2870` 本地副本；`--json` 分支零改动。
4. `dsh/lib/adapters/observability.js`（**新文件**）+ `tools/index.js` 两处挂载（**顺序修正见 §3.2**）。
5. 测试：core（含等价性）+ 命令级（fake timers / spy）+ `verify.js` 4 条。
6. 文档：`docs/commands.md`、`CHANGELOG.md`、`docs/VERSIONS.md`、SKILL 源 + `npm run build`、`dsh/ADAPTER.md`、`dsh/README.md`。

### 1.2 明确不做（硬边界）

- ❌ 实时监控 / 告警 / 阈值触发；不新增命令/子命令/JSON 出口。
- ❌ 不改 `flow log` 契约（`getStageLogSummary` / `resumeCount` 语义与文案冻结）。
- ❌ 不动相位机、REV 语义、归档判据；`src/core/preflight.ts` **零改动**。
- ❌ 不新增写盘指标文件；**不调用 `recordPreflight`**。
- ❌ 不改 `flow metrics --json` 键集/键序/类型（`schemaVersion,agents`）。
- ❌ 不改 `MetricsStore`（`src/core/metrics.ts`）的既有行为；**也不把 `process-health` 塞进 `metrics.ts`**（该文件是 Agent 性能指标，职责不同）。
- ❌ **REQ-016 摘要里的三项动机指标显式留待 1.5.7**：`preflight` 拒绝次数、`feel_next` 调用次数、主会话直写/自审占比——它们**都需要新增埋点或写盘计数器**（拒绝次数要写盘、调用次数要 hook 适配器入口、直写率要对比 shell 审计），**违反本阶段「零运行时开销 / 不新增写盘」边界** ⇒ 本阶段不做，**在 CHANGELOG / `docs/commands.md` 用一行写明「已评估、显式降级到 1.5.7」**（避免被当成漏做）。

---

## 2. 设计 A：CLI「流程健康」块

### 2.1 新文件（纯函数，零 I/O）

**`src/core/phase-entered.ts`**

```ts
import type { LogEntry } from './flow-manager.js';

/**
 * 求「进入 fromPhase 的那次转换」的时间戳（统一口径；原 flow.ts 私有实现去重下沉）。
 * 回扫 [0, logLenBefore)；匹配 advance_stage_phase / reset_stage_phase 的 detail.to === fromPhase；
 * fromPhase === 'plan_pending' 时兜底 register_stage（includeAddStage 时另含 add_stage）。
 * @param options.includeAddStage 默认 false —— 保住 flow.ts T1 duration 与 metrics.json 既有契约（M4）。
 * @returns 毫秒时间戳；无基线 / 时间不可解析 → null（不记 0 值）
 */
export function findPhaseEnteredAtMs(
  log: LogEntry[],
  stageArg: string,
  fromPhase: string,
  logLenBefore: number,
  options?: { includeAddStage?: boolean },
): number | null;
```

**`src/core/process-health.ts`**

```ts
import { MAX_LOG_ENTRIES, type LogEntry } from './flow-manager.js';
import { findPhaseEnteredAtMs } from './phase-entered.js';
import type { PreflightRecord } from './preflight.js';

/** 窗口 = 全保留条目（不设 50，R3 裁定） */
export const PROCESS_HEALTH_WINDOW = MAX_LOG_ENTRIES;

export interface ResumedRatio {
  window: number;        // 实际参与计算的条目数
  advance: number;       // window 内 advance_stage_phase 条目
  labeled: number;       // 其中 resumed 为布尔（分母）
  resumedTrue: number;   // 其中 resumed === true（分子）
  unlabeled: number;     // advance - labeled（结构性不可判定，§0.4）
  ratio: number | null;  // labeled === 0 → null（不除零，不输出 0.0%）
}

export interface PlanDwellSample {
  stage: string;
  startAt: string;
  endAt: string;
  ms: number;
  anchor: 'advance' | 'reset' | 'register' | 'add';
}
export interface PlanDwell {
  events: number;         // to === 'plan_review' 的 advance 事件总数
  samples: number;        // 成功配对
  skipped: number;        // 无锚 / 时间不可解析 / 倒序
  avgMs: number | null;   // samples === 0 → null
  last: PlanDwellSample | null;
}

export interface PreflightAge { at: string | null; ageMs: number | null; ok: boolean }
export interface ProcessHealth { resumed: ResumedRatio; dwell: PlanDwell; preflight: PreflightAge }

export function computeResumedRatio(log: LogEntry[], window?: number): ResumedRatio;
export function computePlanDwell(log: LogEntry[], window?: number): PlanDwell;
export function describePreflight(record: PreflightRecord | null, nowMs: number, maxAgeMs?: number): PreflightAge;
export function computeProcessHealth(input: { log: LogEntry[]; preflight: PreflightRecord | null; nowMs?: number; window?: number }): ProcessHealth;
export function formatProcessHealth(health: ProcessHealth, lang: string): string[]; // 含块头
export function formatDuration(ms: number): string;
```

**实现约束**

- 全部**总函数**：非法时间戳 / 倒序 / 缺字段 ⇒ 跳过该样本，**绝不抛**。
- `log` 取 `log.slice(-window)`（默认 `PROCESS_HEALTH_WINDOW`）。
- resumed 只认推进条目，**显式排除**（R4）：

  ```ts
  // reset_stage_phase 是返工语义，混入会让「恢复率」失去含义（R4 冻结）
  if (entry.action !== 'advance_stage_phase') continue;
  ```

  该排除**不进 `skipped`**（`skipped` 只服务 dwell 配对失败计数）。
- dwell **不自己扫锚**，逐事件调 `findPhaseEnteredAtMs(..., { includeAddStage: true })`（§0.3）。
- `formatDuration(ms)`：`<60s`→`{s}s`；`<60m`→`{m}m {s}s`（`s===0`→`{m}m`）；`<24h`→`{h}h {m}m`（`m===0`→`{h}h`）；否则 `{d}d {h}h`；全 `Math.floor`；`ms<0`→`0s`。

### 2.2 口径（三项）

**窗口（R3，冻结）**：**不设 50**，取**全部保留条目**（`flow.json.log` 上限 = `MAX_LOG_ENTRIES = 200`）⇒ `PROCESS_HEALTH_WINDOW = MAX_LOG_ENTRIES`。输出**恒带样本量**；`labeled === 0` / `samples === 0` 输出「无数据 / 无样本」，**绝不输出 `0.0%`**（「没测到」≠「测到为零」）。

| # | 指标 | 数据来源（真实路由） | 口径 |
|---|---|---|---|
| 1 | **resumed 比例** | `log[]` 中 `action === 'advance_stage_phase'`；取 `detail.resumed` | `resumedTrue / labeled`；`labeled` 只计 `typeof resumed === 'boolean'`；`unlabeled` 外显（§0.4）；`labeled===0` → **无数据**；`reset` **排除**（R4） |
| 2 | **`plan_pending → plan_review` 平均停留** | `log[]` 中 `advance_stage_phase` 且 `detail.to === 'plan_review'`（每事件一样本）+ `findPhaseEnteredAtMs(..., {includeAddStage:true})` | 逐事件配对（§0.3）；`anchor ∈ {advance,reset,register,add}`；输出恒带 `(n=…)`；`samples===0` → **无样本**；`samples===1` → 标「样本不足」；`skipped` 仅存结构体 |
| 3 | **最近 preflight** | `.openfeel/dev/.preflight.json` → `readPreflight(cwd)` | 展示 `at` + `ageMs`；`ageMs > 600000` → `已过期`；`record===null` → **无记录**；`at` 不可解析 → 单列降级文案 |

### 2.3 人类输出（`--json` 不受影响）

块头沿用 v1.5.4 / `flow log`（`flow.ts:1546`）风格。行格式（**逐字规定**）：

- `resumed 比例: {true}/{labeled} ({p}%) · 另有 {unlabeled} 条不可判定` ｜ 无数据：`resumed 比例: 无数据（窗口内无带 resumed 标注的推进） · 另有 {unlabeled} 条不可判定`
- `plan_pending → plan_review 平均停留: {dur} (n={samples})` ｜ n=1：`(n=1，样本不足)` ｜ 0：`无样本（窗口内无配对）`
- `最近 preflight: {at} @ {dur} 前（有效|已过期）` ｜ 无记录/不可解析见下表

**有数据（zh，逐字；`at`/`dur` 由固定假时钟 + fixture 决定，见 §6.2 / §10.3）**

```
── 流程健康 ──
  resumed 比例: 0/17 (0.0%) · 另有 3 条不可判定
  plan_pending → plan_review 平均停留: 10m 35s (n=3)
  最近 preflight: 2026-10-31T12:13:31 @ 8h 19m 前（已过期）
```

> ⚠ **样例里的 `0/17`、`10m 35s`、`n=3` 是「构造输入算出来的结果」**（`ResumedRatio`/`PlanDwell` 由 fixture 直接给定），**不是对真实日志的断言**。唯一会逐字断言这些字符的地方是 `formatProcessHealth` 的纯函数用例（§6.1 #15-#17，输入是测试自己构造的结构体），与仓内日志无关。集成/命令级断言一律走 INV-*（§8）。
>
> 该样例**可达**：REV-022 修正后，`preflight` 年龄 = 「上一次读状态 → 现在」；若上次读状态在 8 小时前，就得到「8h 19m 前（已过期）」。**不要**再写成「0s 前（有效）」——那是自测 bug 的表现。

**无数据（zh，逐字）**

```
── 流程健康 ──
  resumed 比例: 无数据（窗口内无带 resumed 标注的推进） · 另有 0 条不可判定
  plan_pending → plan_review 平均停留: 无样本（窗口内无配对）
  最近 preflight: 无记录（未调用过 flow next / flow status）
```

**有/无数据（en，逐字）**

```
── Process health ──
  resumed ratio: 0/17 (0.0%) · 3 unlabelled
  plan_pending → plan_review avg dwell: 10m 35s (n=3)
  last preflight: 2026-10-31T12:13:31 @ 8h 19m ago (expired)
```
```
── Process health ──
  resumed ratio: no data (no advance entry carries resumed in window) · 0 unlabelled
  plan_pending → plan_review avg dwell: no sample (no pair in window)
  last preflight: none (flow next / flow status has not run)
```

**单项降级（逐字）**

| 情形 | zh | en |
|---|---|---|
| `samples === 1` | `… 平均停留: 11m 37s (n=1，样本不足)` | `… avg dwell: 11m 37s (n=1, insufficient sample)` |
| `at` 不可解析 | `最近 preflight: {at}（时间戳不可解析）` | `last preflight: {at} (unparsable timestamp)` |
| 有效 | `… @ 1m 30s 前（有效）` | `… @ 1m 30s ago (fresh)` |
| 已过期 | `… @ 8h 19m 前（已过期）` | `… @ 8h 19m ago (expired)` |

> `at` 显示**原始 ISO（截到秒，UTC，不本地化）**，与 `flow log` 的 `entry.time.substring(0,19)` 惯例一致（`flow.ts:1531`）。

### 2.4 接线（`src/commands/flow.ts`，`:534` 之后、`:535` 之前）

```ts
// v1.5.6：流程健康（人类输出；--json 键集/键序零变更；零写盘；不自测）
const health = computeProcessHealth({
  log: data?.log ?? [],
  preflight: readPreflight(process.cwd()),   // 只读账本，绝不 recordPreflight
  nowMs: Date.now(),
});
console.log('');
for (const line of formatProcessHealth(health, lang)) console.log(line);
```

- 在 `if (mgr.isLoaded())` 内 ⇒ `flow.json` 不可读时整块不输出（不降级成误导性的「三项全无」）。
- `lang` 复用 `:514`；新增 import：`computeProcessHealth, formatProcessHealth` from `../core/process-health.js`、`readPreflight` from `../core/preflight.js`。
- **零 i18n 键**（内联 `en ?`，同 `:1545-1553` 范式）⇒ `lint i18n` 恒 1057。

---

## 3. 设计 B：适配器 `observability`

### 3.1 字段形状（`feel_status` / `feel_next` 同形，**只增不改**）

**裁定（R2 + 复审补强）**：`preflight` 收成**两个标量**，`statusSync` **原样三键嵌套**（含 `intervalMinutes`，与 `dev-status.js:19-40` 完全一致）——否则同一 payload 两种形状，「消费者不用记两套」不成立。

```jsonc
"observability": {
  "schemaVersion": 1,
  "stale": false,                 // boolean；复用 snapshot.stale
  "preflightAgeMs": 28860000,     // number | null；**直接复制** preflight.ageMs
  "preflightOk": false,           // boolean；**直接复制** preflight.ok，禁止重算
  "statusSync": { "due": true, "lastSync": "...Z" | null, "intervalMinutes": 30 },  // 三键原样；异常 → null
  "summary": "preflight 8h 0m 前（已过期） · 状态记录已到期 · 快照=权威"
}
```

- **只复制、不重算**：`preflightOk` 必须 `=== preflight.ok`（`preflight.js:26` 用 `PREFLIGHT_MAX_AGE_MS` 算出）；JS 侧重算 10 分钟常量必然与核心常量漂移。
- `preflightAgeMs` / `preflightOk` 是**便利副本**，与顶层 `preflight`（`readPreflightInfo` 结果）**同源同一次读取、零新增 I/O**；**权威仍是顶层 `preflight`**（含 `at` / `mode`）。
- **不复制对象**：`observability` 内**不得**出现嵌套 `preflight` 对象。

**降级规则（不抛）**

| 缺失项 | 降级 |
|---|---|
| 账本缺失 / 损坏 / `at` 不可解析 | `preflightAgeMs = null`、`preflightOk = false`（顶层 `preflight.at` 仍保留，权威不丢） |
| `statusSync` 为空 / 抛 | `statusSync = null`；`summary` 写 `状态同步: 不可用` |
| `stale` 缺失 | `stale = false`（不谎报降级） |
| builder 内部任何意外 | 调用点 `try/catch` → 完整降级对象（`preflightAgeMs:null`、`preflightOk:false`、`statusSync:null`、`summary:'观测数据不可用'`）——**顶层 `observability` 恒为对象，绝不为 null** |

### 3.2 组装点（**含 REV-022 顺序修正**）

新建 `dsh/lib/adapters/observability.js`：

```js
/** 纯函数：无 I/O、无异常、无副作用；只从入参复制，不重算任何阈值 */
export function buildObservability({ preflight, statusSync, stale } = {}) { ... }
```

**唯一组装点 `dsh/lib/tools/index.js`，两处；且 `readPreflightInfo` 必须早于 `readSnapshot`**：

| 工具 | 位置（当前行） | 内容 |
|---|---|---|
| `feel_status` | `:154` 之前 + `:163` 之后 | `const preflight = readPreflightInfo(resolved.cwd);`（**先读**）→ `const snapshot = await readSnapshot(cli, …)` → `snapshot.preflight = preflight;`（**不再重读**）→ `snapshot.observability = safeObservability(snapshot);` |
| `feel_next` | `:195` 之前 + `:203` 之后 | 同上；另加 `plan.observability = snapshot.observability;`（与 `:205 plan.recovery` 同范式） |

`safeObservability(snapshot)` = `buildObservability({ preflight: snapshot.preflight, statusSync: snapshot.statusSync, stale: snapshot.stale })` 外包 `try/catch`。

**为什么必须在 `readSnapshot` 之前（REV-022）**

- `readSnapshot` 内部并发跑 `flow status --json` / `flow next --json`（`dashboard.js:131-135`），二者都在 `--json` 返回**之前**写账本（`flow.ts:62`、`flow.ts:197`）。
- 若之后才读 ⇒ 读到本次刚写的账本 ⇒ `age≈0` / `ok=true` / summary 恒「0s 前（有效）」⇒ **指标在测自己**。
- 提前读**不增加读取次数**（仍 1 次/工具），**零新增 I/O**；`readPreflightInfo` 已由 `tools/index.js:19` 引入，**复用既有 import 行**。
- `readStatusSync` 位置不变（不受 CLI 影响）。

**为什么 `dashboard.js` 零改动**：`readSnapshot` 拿不到 `preflight` / `statusSync`（都在 tools 层挂载），在其中组装必须新增 I/O；`planNextStep` 复制 `statusSync` 只为 `:392` 的 hint 服务，而 `observability` 无 hint 消费方；`recovery` 已是「只在 tools 层挂 plan」的先例。

### 3.3 契约口径

- `feel_status` / `feel_next` **只增不改**：既有 `statusSync` / `preflight` / `recovery` / `dispatch` / `stale` / `revision` / `snapshotAt` 全部保留、键序不变（新键尾部追加）。
- `observability` 不复制对象（无嵌套 `preflight`）；两个标量为便利副本，权威仍是顶层 `preflight`。
- **新增的可观测后果**：`feel_status` / `feel_next` 更早读账本 ⇒ 年龄反映「上一次读状态 → 现在」，**不再被本次调用刷成 ~0**。这是预期语义，不是抖动。

---

## 4. 零运行时开销边界（硬约束）

| 维度 | 结论 |
|---|---|
| **新增写盘** | **零**。不调用 `recordPreflight`（会写账本）、不写任何指标文件。⚠ 读账本**绝不能顺带刷新账本** |
| **不得自测**（REV-022） | 适配器读账本必须发生在「会写账本的 CLI 调用」**之前**（§3.2）；否则指标自指 |
| **新增读盘（CLI）** | 最多 1 次：`flow metrics` 人类分支 `readPreflight(cwd)`（1×`existsSync` + ≤1×`readFileSync`，约 120B）；`--json` 在 `:518-521` 早返回，**零新增 I/O** |
| **新增读盘（适配器）** | **零**。`buildObservability` 纯函数；`readPreflightInfo` 调用次数不变（1 次/工具），仅**提前位置** |
| **热路径** | `flow-manager.ts` 逐字不动；`flow.ts` 仅**纯提取** `findPhaseEnteredAtMs`（同名同算法，`includeAddStage` 默认 false ⇒ T1 duration 零变更，M4 固化） |
| **计算** | 单次遍历 ≤200 条，O(n)；无缓存 / 定时器 / 监听 |
| **文件边界** | 只读：`.openfeel/flow.json`（既有 `getData()`）、`.openfeel/dev/.preflight.json`（唯一新增读点）、`.openfeel/dev/.sync.json`（既有） |

---

## 5. 文件清单

### 5.1 新增

| 文件 | 说明 |
|---|---|
| `src/core/phase-entered.ts` | `findPhaseEnteredAtMs` 唯一实现（§0.3） |
| `src/core/process-health.ts` | 三项指标纯函数 + 文案（§2.1） |
| `test/core/phase-entered.test.ts` | 等价性 + `add_stage` + `initialPhase` 排除（§6.1 #7-#9） |
| `test/core/process-health.test.ts` | core 单测（§6.1） |
| `test/commands/flow-metrics-health.test.ts` | 命令级（§6.2；独立文件，避开 115 冲突面） |
| `dsh/lib/adapters/observability.js` | `buildObservability` 纯函数（§3.2） |

### 5.2 修改

| 文件 | 改动 | 风险 |
|---|---|---|
| `src/commands/flow.ts` | `:534` 后插块 + 2 import；`:1257` 改共享实现（`mgr.getData()?.log ?? []`）；删 `:2845-2870` | 中：`:1257` 在 advance 路径，但为**纯提取**，M3/M4 固化 |
| `dsh/lib/tools/index.js` | 两处：`readPreflightInfo` 提前 + `observability` 挂载（`observability.js` 1 条 import） | 中：顺序是关键（REV-022） |
| `dsh/test/verify.js` | 4 条新 `check`（96 → **100**）+ 1 import | 低 |
| `docs/commands.md` | 新增 `### flow metrics`（插在 `:446` `### flow log` 后、`:447` `### flow health` 前）；`:1092` 契约行**不改** | 低 |
| `CHANGELOG.md` | 既有 `## [1.5.6]`（`:7`）内追加 `[stage-116]`；**不新建版本标题** | 低 |
| `docs/VERSIONS.md` | `:19` en 概览一句 + `:39-49` zh 节 bullet + 兼容性行 | 低 |
| `src/core/templates-data/skills/openfeel-cli-usage/SKILL.md` | `:74` 标题改 `（stage-114 / stage-115 / stage-116）` + 1 bullet；`:58` 口径「41 成功出口 / 42 注册 `--json` 选项」**沿用 CHANGELOG 既有写法**（不改、不引第三种口径） | 低 |
| `dsh/ADAPTER.md` / `dsh/README.md` | 各 1 行（`observability` + 「读取先于 snapshot」） | 低 |

### 5.3 生成物（**禁手改**）

`npm run build` 从 `templates-data/` 注入 ⇒ 重写 `src/core/update.ts`（`SKILL_DEFINITIONS`）与 `src/core/template-loader.ts`（`OPENCODE_SKILL_DEFINITIONS`）；build 自带一致性校验（`build.js:1317`）。

### 5.4 明确不改

`src/core/preflight.ts`、`src/core/dev-status.ts`、`src/core/metrics.ts`、`src/core/flow-manager.ts`、`src/core/flow-archive/**`、`dsh/lib/adapters/dashboard.js`、`dsh/lib/adapters/preflight.js`、`dsh/lib/adapters/dev-status.js`、`.openfeel/flow.json`、`.openfeel/dev/**`、`docs/json-contract.md`。

---

## 6. 测试计划

### 6.1 `test/core/process-health.test.ts` + `test/core/phase-entered.test.ts`

| # | 用例名 | 断言要点 |
|---|---|---|
| 1 | `computeResumedRatio：true/false/缺失三态 → 分母只计布尔` | `labeled=3, resumedTrue=1, unlabeled=2, ratio≈1/3` |
| 2 | `computeResumedRatio：全缺失 → ratio=null 且 labeled=0（不除零）` | `ratio===null`；格式化后**不含 `%`** |
| 3 | `computeResumedRatio：只数 advance，reset 不入分母/分子/skipped（R4）` | 混入 `reset_stage_phase(+resumed:true)` 后三项计数全不变 |
| 4 | `computeResumedRatio：窗口截断（>window 的旧条目不计入）` | `window=2` 只看尾部 |
| 5 | `computePlanDwell：register_stage 锚 + 逐 plan_review 事件配对` | 2 阶段 2 事件 ⇒ `samples=2`、`anchor='register'` |
| 6 | `computePlanDwell：返工轮 —— plan_review→plan_pending→plan_review 各成样本` | 2 个 end、2 个 start（第二个 anchor ∈ {advance,reset}）；`samples=2` |
| 7 | **`findPhaseEnteredAtMs：与冻结 legacy 参考实现逐条等价（includeAddStage:false）`** | test 内保留**旧算法副本**，在多组合规 fixture（register / reset / 多周期 / 无基线）上逐条 `toBe` 相等（**REV-023 硬要求**） |
| 8 | `findPhaseEnteredAtMs：includeAddStage:true 采 add_stage（detail.stageId）` | `add_stage` 阶段有锚；`:false` 时无（M4 语义保持） |
| 9 | `findPhaseEnteredAtMs：add_stage.phase !== plan_pending → 排除` | `initialPhase='exec_running'` 的 add_stage 不贡献锚（§7.1 有测试固化） |
| 10 | `computePlanDwell：只有 register 无 plan_review → 无样本` | `samples=0`、`avgMs===null`、`events=0` |
| 11 | `computePlanDwell：时间戳非法/倒序 → 跳过且不抛` | `skipped>0`、`avgMs` 只由合法样本决定 |
| 12 | `describePreflight：record=null → {at:null,ageMs:null,ok:false}` | 逐字段相等 |
| 13 | `describePreflight：at 不可解析 → ageMs=null、ok=false（保留 at）` | 不抛 |
| 14 | `describePreflight：600000ms 边界 ok=true；600001ms → false` | 阈值精确 |
| 15 | `formatProcessHealth(zh)：有数据文案逐字（含「另有 N 条不可判定」）` | `toEqual([...])` §2.3 四行 |
| 16 | `formatProcessHealth(zh)：三项全空文案逐字` | §2.3「无数据」四行 |
| 17 | `formatProcessHealth(en)：有/无数据逐字` | §2.3 en 两份 |
| 18 | `formatDuration：45s / 10m 53s / 8h 19m / 2d 3h / 负数` | 逐字 |
| 19 | `PROCESS_HEALTH_WINDOW === MAX_LOG_ENTRIES`（INV-14） | 同源常量，非字面量 |
| 20 | `computeProcessHealth：空 log + null preflight 不抛且全降级` | 总函数性 |

### 6.2 `test/commands/flow-metrics-health.test.ts`

沿用 `test/commands/flow.test.ts:9-108` 的 harness（`mockHome` + `vi.mock('node:os')` + `cwdMock` + `logMock` + `safeParse`）。

| # | 用例名 | 要点 |
|---|---|---|
| 1 | `flow metrics（人类）含「── 流程健康 ──」与三项标签` | `logMock` 拼接后含 `流程健康` / `resumed 比例` / `平均停留` / `最近 preflight` |
| 2 | `flow metrics（人类）：无 .preflight.json → 无记录文案，仍 exit 0` | 降级不抛 |
| 3 | `flow metrics（人类）：.preflight.json 损坏 → 不抛、无记录文案` | 写入 `'{'` |
| 4 | **`flow metrics --json：顶层键集/键序恒 ['schemaVersion','agents']`** | 契约（INV-1） |
| 5 | **`flow metrics --json：账本字节不变 + readPreflight 未被调用`** | 两条牙齿：①前后 `readFileSync` 字节比对（抓误写，INV-9）②`vi.mock('../../src/core/preflight.js')` 的 spy 断言 `readPreflight` 调用数 0（抓误读，INV-10） |
| 6 | `flow metrics（人类）：零写盘 —— 账本与 flow.json 字节不变` | 前后字节比对 |
| 7 | `flow metrics（人类）：flow.json 不可读 → 不出块、不抛` | `isLoaded()===false` |
| 8 | **`flow metrics（人类）：假时钟下 age 文案逐字（vi.useFakeTimers + vi.setSystemTime）`** | ⚠ 必须 `vi.useFakeTimers()` + `vi.setSystemTime(FIXED)`；账本 `at = FIXED − 90_000` ⇒ 期望 `@ 1m 30s 前（有效）`；`afterEach` `vi.useRealTimers()`（否则 flaky） |
| 9 | `flow metrics（人类）：3 advance + register/add_stage 锚 fixture → 分母与配对正确` | 见 §10.3（假时钟，不引用真实日志） |

### 6.3 `dsh/test/verify.js`（96 → 100，按 115 提交后实测顺延）

| # | check 名 | 断言 |
|---|---|---|
| 97 | `'observability 组合摘要（v1.5.6）'` | `feel_status` / `feel_next` 均有 `observability` 对象；形状：`typeof stale==='boolean'`、`preflightAgeMs===null\|\|typeof==='number'`、`typeof preflightOk==='boolean'`、`statusSync===null\|\|三键齐（due/lastSync/intervalMinutes）`、`summary` 非空串；**反向**：`observability.preflight === undefined`；既有键仍在（`stale`/`preflight`/`statusSync`/`recovery`/`dispatch`） |
| 98 | `'observability 复制不重算（v1.5.6）'` | `observability.preflightAgeMs === data.preflight.ageMs` **且** `observability.preflightOk === data.preflight.ok`（禁重算）；`observability.statusSync` 与顶层 `statusSync` `toEqual` 全等（三键） |
| 99 | **`'observability preflight 在 snapshot 之前读取（REV-022）'`** | 在**副本**工作区写旧账本 `at = now − 8h` → `feel_status({project: copy})` → 断言 `observability.preflightAgeMs >= 7h` **且** `preflightOk === false`。若读取发生在 `readSnapshot` 之后，`flow status --json` 会把账本刷成 now ⇒ `age≈0` ⇒ 本断言必失败。（**不写原项目**） |
| 100 | `'observability 纯函数降级（缺失数据不抛，v1.5.6）'` | `buildObservability({})` ⇒ 对象、`preflightAgeMs===null`、`preflightOk===false`、`statusSync===null`、`stale===false`、`summary` 非空 |

> `dsh/test/contract.js` / `integration.js` 需本机 `@deepseek-ai` 运行时，CI 不一定跑；本阶段只要求 `verify.js`。

---

## 7. 文档

### 7.1 必须写入的局限（核心交付）

1. **token 无法直接测**：OpenFeel 不持有模型用量（无 API 账单、无 tokenizer 回调）⇒ 全是**代理指标**，只回答「流程行为是否变化」，不回答「省了多少 token」。
2. **resumed 的**结构性**偏倚**（不是历史遗留）：`computeResumed` 回扫「更早一条 `to === 退出相位`」，而**阶段出生即 `plan_pending`**（`register_stage` / `add_stage` 写 `phase` 而非 `to`）⇒ **每阶段第一条 advance 恒不可判定** ⇒ `unlabeled ≥ 阶段数`。输出必须外显「另有 N 条不可判定」；`unlabeled` **不进口径**。
3. **resumed 的误读风险**：分母只含带布尔标注的条目；`resumed=false` 在**单会话长跑**里是常态 ⇒ 低比例**不能**证明闸门有效；`session_id` 为 `proc:` 前缀 ⇒ `null`（整体省略）。
4. **`reset_stage_phase` 排除**（R4）：`resumed` 衡量「**推进**是否跨会话恢复」，`reset` 属**返工**语义；混入会让指标失去含义。**执行期不得当漏采补上**。
5. **窗口 = 全保留条目，`n` 必须外显**：`MAX_LOG_ENTRIES=200` ⇒ 更早配对永久丢失；0 样本输出「无数据/无样本」而**非 `0.0%`**——「没测到」≠「测到为零」。这也是不采纳「最近 50 条」的原因（样本会掉到 n≈1）。
6. **dwell 的锚点覆盖与排除**：锚来自 `findPhaseEnteredAtMs`（advance / reset / `register_stage` / `add_stage`）；**`add_stage` 且 `detail.phase !== 'plan_pending'` 的阶段被排除**（`initialPhase` 不是 `plan_pending` ⇒ 不存在「`plan_pending` 停留」这回事），该排除有测试固化（§6.1 #9）。
7. **dwell 是「入口摩擦」proxy**：只测「建阶段 → 计划过闸」的等待，不含方案/执行/审查耗时。
8. **preflight 年龄只证明「读过状态」**：年龄小 ≠ 读的是当前 revision（实测 `revision` 为 `null`），也 ≠ 写命令必然合规（`warn` 模式仅提示）。**REV-022 修正后**，年龄反映「上一次读状态 → 现在」，不再被本次调用刷新。
9. **REQ-016 三项动机指标显式留待 1.5.7**：`preflight` 拒绝次数 / `feel_next` 调用次数 / 主会话直写+自审占比——**均需新增埋点或写盘计数器，违反本阶段零开销边界**，已评估并显式降级。
10. **三项指标都不能单点判「形式主义」**：需与 `flow log` 失败回环、REV 数量、`attempt_fail_*` 频次合看。

### 7.2 文档改动点

| 文件 | 位置 | 内容 |
|---|---|---|
| `docs/commands.md` | 新增 `### flow metrics`（`:446` 后） | 用法 + 选项表（只有 `--json`）+ §2.3 样例（zh 有/无数据）+ 三项口径 + §7.1 局限摘要 + 「键集恒 `schemaVersion,agents`，健康块仅人类输出」 |
| `docs/commands.md` | `:1092` 契约表 | **不改** |
| `docs/json-contract.md` | `:108` | **不改** |
| `CHANGELOG.md` | `## [1.5.6]`（`:7`）内追加 | `### Added`：`[stage-116]` 三项（含 REV-023 锚点口径统一 / REV-022 读取次序修正 / resumed 结构偏倚外显）；`### Changed`：适配器 `observability`（只增不改、复制不重算）；写 **「无 JSON 契约变更（41 成功出口 / 42 注册 `--json` 选项不变）」** + 「三项动机指标降级到 1.5.7」 |
| `docs/VERSIONS.md` | `:19` + `:39-49` | en 一句 + zh bullet；兼容性行补「`flow metrics --json` 键集不变；适配器只增字段」 |
| `SKILL.md`（源） | `:74` 标题 + bullet | `## v1.5.6（stage-114 / stage-115 / stage-116）` + `flow metrics` 人类块与 `observability` 一行 |
| `dsh/ADAPTER.md` / `dsh/README.md` | v1.5.5 bullet 后 | `observability`（preflight 年龄 + `statusSync.due` + `stale`）+ 「读取先于 snapshot」 |

`CHANGELOG` 版本标题**已存在** ⇒ 只追加、不新建；`package.json` / `dsh/package.json` 版本（1.5.5）本阶段**不动**。

---

## 8. 不变量清单（**替代全部硬编码期望**）

> 断言**只准**引用 INV-*；任何「等于 20 / 17 / 10m 35s / 0/17」之类的具体数字**不得**进测试。实测值只出现在 §0.0「记录项」。

| ID | 不变量 | 断言位置 |
|---|---|---|
| INV-1 | `flow metrics --json` 顶层键集/键序恒 `['schemaVersion','agents']` | `json-contract.test.ts:325`（既有）+ §6.2 #4 |
| INV-2 | 人类输出恒含块头 + 三行标签（zh/en 各一套） | §6.2 #1 |
| INV-3 | resumed 行恒为 `{n}/{d}` 或「无数据」；`labeled===0` 时**不含 `%`** | §6.1 #2、§6.2 #1 |
| INV-4 | resumed 行**恒**含「另有 {unlabeled} 条不可判定」（含 `0`） | §6.1 #15、§6.2 #1 |
| INV-5 | dwell 行恒含 `(n=…)` 或「无样本」；`n===1` 标「样本不足」 | §6.1 #5/#10/#15 |
| INV-6 | preflight 行恒含 `前（有效）`/`前（已过期）`/`无记录`/`时间戳不可解析` 之一 | §6.1 #12-#16 |
| INV-7 | `observability` 形状：5 键、`statusSync` 三键或 `null`、**无嵌套 `preflight`** | §6.3 #97 |
| INV-8 | `preflightAgeMs === preflight.ageMs`、`preflightOk === preflight.ok`（**复制不重算**） | §6.3 #98 |
| INV-9 | `--json` 调用的账本**字节不变**（零写） | §6.2 #5/#6 |
| INV-10 | `--json` 路径**不调用** `readPreflight`（spy 计数 0） | §6.2 #5 |
| INV-11 | `reset_stage_phase` 不入 resumed 分母/分子/`skipped`（R4） | §6.1 #3 |
| INV-12 | `readPreflightInfo` 调用次序先于 `readSnapshot`（旧账本可得大 age） | §6.3 #99 |
| INV-13 | 既有适配器键 `statusSync`/`preflight`/`recovery`/`dispatch`/`stale` 全在且形态不变 | §6.3 #97 |
| INV-14 | `PROCESS_HEALTH_WINDOW === MAX_LOG_ENTRIES`（同源常量，非字面量 200） | §6.1 #19 |
| INV-15 | T1 duration 与 `metrics.json` 契约零变更（`includeAddStage` 默认 false） | `flow.test.ts` M3/M4 保持绿 |
| INV-16 | `dsh/lib/adapters/dashboard.js` 未被修改 | 交付前 `git diff --stat` |
| INV-17 | 成功出口 41 / 注册 `--json` 选项 42 不变；`lint i18n` = 115 提交后基线（新增 0 键） | 门禁 |

---

## 9. 执行批次（fast 模式不建 ops）

> 实测 `v1.5.6-stage-114.ops = {}`、`v1.5.6-stage-115.ops = {}`（`flow.json:51,65`）——fast 跳过 `scheme_*`，不注册 op。本阶段同口径不建 ops。

| 批次 | 内容 | 出口判据 |
|---|---|---|
| **A**（共享实现提取） | `src/core/phase-entered.ts` + `flow.ts` 改引用/删副本 + `test/core/phase-entered.test.ts` | `flow.test.ts` M3/M4 仍绿（INV-15）；等价性用例绿 |
| **B**（core 纯函数） | `src/core/process-health.ts` + `test/core/process-health.test.ts` | 该文件全绿；`npx tsc --noEmit` 干净 |
| **C**（CLI 接线） | `flow.ts` 健康块 + `test/commands/flow-metrics-health.test.ts` | 该文件全绿 + `json-contract #4` 绿 |
| **D**（适配器 + 文档） | `observability.js` + `tools/index.js` 两处（**次序**）+ `verify.js` 4 条 + 文档 + `build` ×2 | `verify.js` **100/100**；build 产物 `git diff` 为空 |

依赖：A → B → C → D 串行（B 依赖 A 的导出；D 的文档依赖 C 定稿文案）。**A 必须先做**：它决定 dwell 口径，返工成本最高。

---

## 10. 验收命令（可复制）

### 10.1 门禁

```bash
npx tsc --noEmit
npx vitest run
npx eslint .
node build.js && node build.js          # ×2，第二次 git diff 应为空
node bin/openfeel.js lint i18n          # 条数 == 115 提交后基线、ok、exit 0
node bin/openfeel.js lint kb
cd dsh && node test/verify.js           # 期望「通过 100 / 100」
```

### 10.2 人类 / JSON 对照（**按不变量判读，不对具体数字**）

```bash
node bin/openfeel.js flow metrics
# 判读：① 有块头「── 流程健康 ──」 ② 三行齐 ③ resumed 行带「另有 N 条不可判定」
#       ④ 停留行带 (n=…) 或「无样本」 ⑤ preflight 行带「前（有效/已过期）」或「无记录」
#       ⚠ preflight 年龄应反映「上一次读状态」，**不应恒为 0s**（若恒 0s ⇒ REV-022 未修好）

node bin/openfeel.js flow metrics --json \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(Object.keys(JSON.parse(s)).join(",")))'
# 期望：schemaVersion,agents

sha1sum .openfeel/dev/.preflight.json
node bin/openfeel.js flow metrics --json >/dev/null
sha1sum .openfeel/dev/.preflight.json    # 期望与上一条**相同**（INV-9）

npx vitest run test/cli/json-contract.test.ts -t "#4 flow metrics"
```

### 10.3 最小 fixture 口径验证（固定假时钟 + 3 条 advance + 1 个 preflight）

```bash
set -e
TMP=$(mktemp -d); mkdir -p "$TMP/.openfeel/dev"
cp .openfeel/flow.json "$TMP/.openfeel/flow.json"     # 复用真实 schema
node --input-type=module -e '
import { readFileSync, writeFileSync } from "node:fs";
const p = process.argv[1];
const flow = JSON.parse(readFileSync(p, "utf-8"));
const T0 = Date.parse("2026-01-01T00:00:00.000Z");
const at = (s) => new Date(T0 + s * 1000).toISOString();
flow.log = [
  { time: at(0),   agent: "cli",          action: "register_stage",      detail: { stageName: "s1", deps: [] } },
  { time: at(600), agent: "cli",          action: "advance_stage_phase", detail: { stageName: "s1", from: "plan_pending", to: "plan_review", session_id: "project:a" } },
  { time: at(660), agent: "cli",          action: "advance_stage_phase", detail: { stageName: "s1", from: "plan_review", to: "plan_passed", session_id: "project:a", resumed: false } },
  { time: at(10),  agent: "flow-manager", action: "add_stage",           detail: { stageId: "s2", phase: "plan_pending" } },
  { time: at(300), agent: "cli",          action: "advance_stage_phase", detail: { stageName: "s2", from: "plan_pending", to: "plan_review", session_id: "project:b", resumed: true } },
].sort((a, b) => a.time.localeCompare(b.time));
writeFileSync(p, JSON.stringify(flow, null, 2) + "\n");
const pre = { at: new Date(Date.now() - 90_000).toISOString(), stage: null, phase: null, revision: null };
writeFileSync(p.replace("flow.json", "dev/.preflight.json"), JSON.stringify(pre, null, 2) + "\n");
' "$TMP/.openfeel/flow.json"
(cd "$TMP" && node "C:/Users/Liuary/Dev/Mine/AI/OpenFeel/bin/openfeel.js" flow metrics)
```

**期望（不变量形式，不写死数字）**

- resumed 行 = `{true}/{labeled}`：fixture 中带布尔 2 条、`true` 1 条 ⇒ `1/2`；**且含**「另有 N 条不可判定」（N = 3 − 2 = 1）
- dwell 行 = `(n=2)`：s1 = register→600s；**s2 = add_stage→290s**（同时验证 REV-023 的 `add_stage` 锚点）
- preflight 行后缀 = `1m 30s 前（有效）`

---

## 11. 风险与局限（执行/审查必读）

1. **口径修正 vs REQ 原文**：REQ 写「相邻 advance 时间差」，实测 `to: plan_pending` 的 advance 为 0 且该锚不可达（§0.3）⇒ 采用 `findPhaseEnteredAtMs` 统一口径。**必须在 CHANGELOG / `docs/commands.md` 写明修正理由**，否则下一版会被当回归。
2. **REV-022 回归风险最高**：`readPreflightInfo` 的位置是**一行之差**，错了指标就自测，且**测试可能仍绿**（age 小 → 文案仍合法）。⇒ INV-12 的旧账本断言（§6.3 #99）**必须**存在，它是唯一能抓住顺序错误的手段。
3. **REV-023 的第二真值风险**：任何人「顺手」在 `process-health.ts` 里再写一版锚点回扫，口径会重新分裂。⇒ 唯一实现放 `phase-entered.ts`，dwell 只调用它；等价性用例（§6.1 #7）是守门人。
4. **`flow.ts:1257` 属推进热路径**：改动仅「换 import + 传 `log`」，行为零变更，由 M3/M4 与等价性用例双保险；若执行期发现任何 T1 duration 差异 ⇒ **回退该行**（保留 mgr 重载），**不得**放开 `includeAddStage` 默认值。
5. **`resumed` 结构偏倚**：见 §7.1 第 2 条。低比例**不可**解读为「闸门无效」。
6. **窗口 200 ⇒ n 周期性塌到 0**：「无样本」是**正常态**，不是故障。
7. **`--json` 零变更的强保证来自位置**：健康块必须在 `:518-521` 早返回**之后**；误插到 `store.load()` 附近会同时污染 JSON 与 I/O（INV-1 / INV-9 / INV-10 三重守）。
8. **`flow metrics` 人类输出无既有测试**：当前只有 `--json` 断言（`flow.test.ts:1028`）⇒ §6.2 是**唯一防线**，含 fake timers 用例。

### 发布注意（**不要当缺陷去修**）

- 新增 `dsh/lib/adapters/observability.js` 会改变 `hashAdapterFiles(dsh)`（`src/core/adapter-hash.ts:40-65` 遍历 `dsh/lib/**`）⇒ 运行中宿主的适配器指纹 ≠ 磁盘 ⇒ `openfeel setup --check` 报 **`restart-required`** 属**预期行为**（v1.3.4 语义）。
- 处理：`openfeel setup --tools dsh` 重新部署 → **完全退出并重启宿主**。**不要**改指纹算法、伪造 host marker 或跳过校验。
- ⚠ **`dsh/test/verify.js` 失败 ≠ 需要重启**：`verify.js:16,18,21` **直接 import 磁盘源码**（`../lib/...`），**不加载宿主 bundle** ⇒ 它跑的就是磁盘上的新代码，**失败就是真失败**（逻辑/断言问题）。`restart-required` 只影响**运行中宿主**与 `setup --check`。执行期**不得**把 verify 失败误判为「需重启宿主」而放过。

---

## 12. 落地顺序 / 裁定记录 / 待确认

### 12.1 落地顺序（硬）

- **必须排在 stage-115 之后**（`deps` 已声明，§0）。115 正在改：`src/commands/lint.ts`、`src/core/i18n-data/{zh-CN,en}.ts`、`src/core/{template-loader,update}.ts`、`docs/{commands,VERSIONS,json-contract}.md`、`CHANGELOG.md`、`dsh/test/verify.js`、`test/cli/json-contract.test.ts`、`test/commands/knowledge.test.ts`、`src/core/templates-data/skills/openfeel-cli-usage/SKILL.md`、**`dsh/ADAPTER.md`**，另有新增 `src/core/lint-req.ts` 与 `test/{core,commands}/lint-req.test.ts` ⇒ **与本阶段文档 ×4 + `verify.js` + 契约测试 + `ADAPTER.md` 全部重叠**。
- **开工前置检查（两条都要满足）**：① `v1.5.6-stage-115.phase === 'done'`；② 115 改动**已提交**（当前仍是脏工作区）——否则「以提交后工作区为准」不成立。
- ⚠ **以 115 提交后工作区重新定位**：`flow.ts:508-535` / `:1257` / `:2845-2870`；`dsh/test/verify.js` 的 **96 条**基线（当前实测 96，按提交后 `grep -c 'await check('` 重定，§6.3 断言编号顺延）；`lint i18n` 基线（新增 0 键，当前 1057）；`docs/VERSIONS.md:19`、`:39-49`、`CHANGELOG.md:7`；`test/cli/json-contract.test.ts:325`；`dsh/ADAPTER.md` / `README.md` 的 v1.5.x 段。
- 核对不到 → 记「待执行期确认」，**不得按本文件行号盲写**。

### 12.2 两条 blocking REV 落实表

| REV | 严重度 | 裁定 | 落实节号 |
|---|---|---|---|
| **REV-022** 适配器 observability 在自测 | high / blocking | `readPreflightInfo` 移到 `await readSnapshot` **之前**（读取次数不变、零新增 I/O）；示例改**可达值**（旧账本 → 已过期）；`verify.js` 加 INV-12 旧账本断言锁次序 | **§0.5**（陷阱实证）、**§3.1**（可达语义）、**§3.2**（顺序修正表）、**§6.3 #99**（断言）、**§11 第 2 条**（回归风险） |
| **REV-023** dwell 另造更弱口径 | high / blocking | **下沉并复用** `findPhaseEnteredAtMs`（→ `src/core/phase-entered.ts`，`flow.ts` 改引用同一实现）；补 `add_stage`（`detail.stageId` + `phase` 校验）与已有 `reset_stage_phase` 锚；停留**逐 `plan_review` 事件配对**；**加冻结 legacy 参考实现的等价性测试**；`initialPhase ≠ plan_pending` 的 `add_stage` 排除并固化 | **§0.3**（三处硬伤 + 裁定）、**§2.1**（签名/类型/调用）、**§6.1 #5-#9**（含等价性 #7）、**§7.1 第 6 条**（局限）、**§11 第 3 条** |

### 12.3 裁定记录（已冻结）

| # | 议题 | 裁定 | 落点 |
|---|---|---|---|
| R1 | 顺序约束 | `stage-116.deps = ["v1.5.6-stage-115"]`（`flow.json:78-80`）；`deps` 不阻塞 advance ⇒ 纪律仍靠 §12.1 | §0 抬头、§12.1 |
| R2 | `observability` 形状 | **部分平铺**：`preflight` → `preflightAgeMs` / `preflightOk` 两标量（**复制不重算**）；`statusSync` **原样三键嵌套**（含 `intervalMinutes`）；无嵌套 `preflight` | §3.1 / §3.2 / §3.3、§6.3 #97-98 |
| R3 | 窗口 N | **不设 50**，取全保留条目（`PROCESS_HEALTH_WINDOW = MAX_LOG_ENTRIES`）；输出恒带 `n=`；0 样本输出「无数据/无样本」，不输出 `0.0%` | §2.2、§7.1 第 5 条 |
| R4 | `reset_stage_phase` | **不计入** resumed 比例（返工 ≠ 推进恢复）；排除项写进局限，执行期不得补上 | §0.4、§2.1、§7.1 第 4 条 |
| R5 | 断言形态（复审） | **删除全部硬编码期望**，实测值只作 §0.0 记录项；断言只引用 INV-1..INV-17 | §0.0、§8 |

### 12.4 仍待执行期确认（仅此一项）

- **Q5｜命令级测试文件归属**：默认新建 `test/commands/flow-metrics-health.test.ts`（避开 115 的 `flow.test.ts` 冲突面）；若并入 `flow.test.ts` 的 metrics describe 会增加合并冲突。**默认按新建文件执行，不阻塞开工**。

---

## 13. 自查清单（执行者交付前逐项打勾）

- [ ] 人类输出含 `── 流程健康 ──` 三行；`--json` 键集 `schemaVersion,agents` 未变（INV-1）
- [ ] 健康块位于 `:518-521` 早返回**之后**（`--json` 零新增 I/O）
- [ ] **`--json` 前后账本字节不变**（INV-9）**且** spy 断言 `readPreflight` 调用数 0（INV-10）
- [ ] **`dsh/lib/tools/index.js` 中 `readPreflightInfo` 位于 `await readSnapshot` 之前**（INV-12，REV-022）
- [ ] `observability` = `{schemaVersion,stale,preflightAgeMs,preflightOk,statusSync,summary}`；`statusSync` 三键；无嵌套 `preflight`（INV-7）
- [ ] `preflightOk === preflight.ok`、`preflightAgeMs === preflight.ageMs`（复制不重算，INV-8）
- [ ] dwell 只调 `findPhaseEnteredAtMs`，**无第二份锚点回扫**；等价性用例绿（REV-023）
- [ ] `add_stage`（`detail.stageId`）可作为锚；`initialPhase ≠ plan_pending` 被排除且有测试
- [ ] `resumed` 分母 = 布尔标注数；行内恒有「另有 N 条不可判定」（INV-4）
- [ ] `reset_stage_phase` 显式排除（代码 `continue`），不入分母/分子/`skipped`（INV-11，R4）
- [ ] `PROCESS_HEALTH_WINDOW === MAX_LOG_ENTRIES`（INV-14，非字面量）
- [ ] 0 样本输出「无数据/无样本」，**未输出 `0.0%`**（INV-3）
- [ ] 命令级用例使用 `vi.useFakeTimers()` + `vi.setSystemTime()` 且 `afterEach` 复位
- [ ] `flow.test.ts` M3/M4 仍绿（T1 duration 零变更，INV-15）
- [ ] `dsh/lib/adapters/dashboard.js` 未被修改（INV-16）
- [ ] 既有键 `statusSync`/`preflight`/`recovery`/`dispatch`/`stale` 全在（INV-13）
- [ ] `verify.js` 100/100；`vitest` 全绿；`tsc`/`eslint` 干净；`build` ×2 幂等（INV-17）
- [ ] `lint i18n` 条数 = 115 提交后基线（新增 0）；`lint kb` ok
- [ ] 文档写明「token 无法直接测」+ §7.1 十条局限（含结构偏倚、reset 排除、add_stage 排除、三项降级到 1.5.7）
- [ ] CHANGELOG 只追加 `[stage-116]`，未新建版本标题；版本号未动
- [ ] SKILL 只改 `templates-data/` 源文件，生成物由 `npm run build` 产出
- [ ] 「发布注意」已写入交付说明：`restart-required` 属预期；**verify 失败不等于需重启**
- [ ] 测试中**无**硬编码日志计数/时长（全部 INV-*）
