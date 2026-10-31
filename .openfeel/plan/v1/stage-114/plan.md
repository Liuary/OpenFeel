# v1.5.6-stage-114 计划 — preflight 全覆盖（写命令统一 helper + warn/off 集成测试）

- **阶段**：`v1.5.6-stage-114`（工作流模式 **fast**；批次发布，全部门禁绿才发 1.5.6）
- **关联需求**：REQ-015（+ 计划审查 REV-001~009 的补录面）
- **基线**：v1.5.5（`src/core/preflight.ts` 已存在，4 个写命令已接门）
- **目标**：把「先读状态再写状态」从 4 个命令扩到**全部状态写命令**；拒绝形态收敛为单一出口；warn/off 行为不变且可测；**恢复通道（repair / checkpoint restore）保留状态不可读豁免**，避免 strict 死锁。
- **事实基线**：2026-10-31 逐文件 `read` + `grep` 核对（非推测）。行号为**核对当刻**值；执行期按 §11 纪律就地校正。
- **修订记录**：v3（第二次审查）——按 review-notes.md（9 blocking + 13 medium/low）逐条落实：门位 28→36、命令 27→34、新增 `view accept` / `flow health --fix` / `flow wizard` / `stage task --add` 分支门、legacy reject 去 `hint`、§3.4 改为「只读预检 + 精确遮蔽」。
- **与 stage-115 的顺序**：**stage-114 先落地**；stage-115 基于 114 的 docs 重定行号与计数基线（§8.3）。

---

## 0. 事实核对结果（先读这一节，再看设计）

### 0.1 核心层现状（`src/core/preflight.ts`，121 行）

| 符号 | 行 | 结论 |
|---|---|---|
| `PREFLIGHT_MAX_AGE_MS` | 15 | 10 分钟 |
| `getPreflightMode(env?)` | 38 | `off|warn|strict`，默认 `warn` |
| `recordPreflight(projectPath, now?)` | 44 | 写 `.openfeel/dev/.preflight.json`（best-effort，失败静默） |
| `readPreflight` | 75 | 损坏 → `null` |
| `checkPreflight` | 92 | `{ok, mode, reason, record, ageMs}` |
| `preflightGate(projectPath, message)` | 110 | `ok`/`off` → 放行；`warn` → **仅 `process.stderr.isTTY`** 时 `console.error` 后放行；`strict` → `ok:false` |

**结论**：`preflightGate` 已是「纯判定 + warn 提示」，缺的只是**拒绝出口**与**状态不可读豁免**。核心文件零改动（现有 6 条单测原样保留，§5.1）。

### 0.2 错误出口现状（`src/commands/shared/errors.ts`）

| 符号 | 行 | 契约 |
|---|---|---|
| `FailCliInput` | 31 | `{code, message, detail?, stderrLines?}` |
| `emitErrorEnvelope` | 43 | 仅 stdout envelope，**不退出、不改码** |
| `failCli` | 65 | JSON：envelope + `process.exitCode=spec.exitCode` + **返回**；非 JSON：逐行 stderr + **立即 `process.exit(spec.exitCode)`** |
| `getCliErrorSpec` 码表 | `src/core/errors.ts:26-42` | **13 个码**，无 `PREFLIGHT_REQUIRED`；`INVALID_ARGUMENT` = refusal / exit 1 |

四码约定：`0` 成功 / `1` 预期拒绝 / `2` 并发冲突 / `3` 内部故障。**preflight 拒绝沿用 `INVALID_ARGUMENT`**，不新增码。

### 0.3 JSON 模式与 `--json` 的真实注册面（修正 review-notes 二.7）

- `isJsonMode()`（`json-output.ts:42`）由 `runCli` 预扫描 argv 置位。
- **但有 4 个写命令真的注册了 `--json` 选项**：`flow advance`（`flow.ts:944`）、`flow archive`（`flow.ts:2079`）、`req split`（`req.ts:587`）、`flow health --fix`（`health` 子命令既有 `--json` 视图选项：`--fix --json` 在 strict 下同样输出 `INVALID_ARGUMENT` envelope，REV-015 实测确认）。
- 其余门位命令**未注册** `--json`：传 `--json` 会被 Commander 判 unknown option → `exitOverride` 抛出 → `runCli` 转 `INVALID_ARGUMENT` envelope + exit 1。**因此不得声称这些命令在 `--json` 下会输出 preflight envelope**（§2.5、§5.3 已按此改正）。
- legacy 形态（`{schemaVersion, error:<string>, errorKind}`，`errorKind` 恒末键）：`flow archive`（local `failJson`，`flow.ts:2086-2093`）、`req split`（`failJson`，`req.ts:39-42`）。
- `config set --global` 分支（`config.ts:292-327`）写 `~/.config/openfeel/profile.yaml`，**不在范围**（非项目状态）。

### 0.4 已接入 preflight 的 4 个调用点（差异点）

| # | 命令 | 文件:行 | 拒绝形态 | 退出码 |
|---|---|---|---|---|
| 1 | `flow advance` | `flow.ts:990-999` | `failCli` envelope `{reason:'preflight-required', hint:'openfeel flow next --json'}` | 1（**非 JSON 立即 exit**） |
| 2 | `plan stage add` | `plan.ts:133-138` | 裸 `console.error` + `exitCode=1` + return | 1（不 exit） |
| 3 | `req add` | `req.ts:125-130` | 同上 | 1 |
| 4 | `req claim` | `req.ts:311-316` | 同上；**位置在 ID 校验（305-309）之后**（v1.5.5 有意为之） | 1 |

### 0.5 写命令全量盘点

**在范围内**：§2 接入清单 —— **34 个命令 / 36 个门位**（`stage task` 与 `plan scheme create` 各占 2 个门位；含 4 个既有收敛门位）。

**排除（§10 逐条理由）**：`chore`(`chore.ts:57`)、`dev sync`(`dev.ts:20`)、`config set-lang`(`config.ts:102`)、`config set` 的**非同步分支**（`config.ts:403`）、顶层 `archive <stage>`(`archive.ts:14`)、顶层 `migrate` / `migrate rollback`(`migrate.ts:16/36`)、`init/update/setup/project/roadmap/knowledge/model`。

> 说明（修正 review-notes 二.15）：顶层 `archive <stage>` 确实**写 flow.json**（`core/archive/merge.ts` 的 `appendLog+save`），排除理由不是「不写状态」，而是 **REQ-015 未列 + 阶段摘要属归档域**（§10 已改写）。

### 0.6 REV-001~009 复核结果（含 4 处证据级修正）

| REV | 主张 | 核对结论 |
|---|---|---|
| 001 | dry-run 免门覆盖 8 个命令 | ✅ 行号全对：`flow.ts:742/889/941/1831/1917/2020/2078/2345`。**口径补全**：另有 `plan.ts:410/453` 两个既有条件式门 → 落 **10 个条件式门**（§4.3）。`migrate.ts:18/38`（顶层 legacy 迁移，另一域）排除。 |
| 002 | `flow repair` 漏接 + 状态不可读豁免 | ✅ 写盘 `flow.ts:1850`；`repair()` 起 `flow-manager.ts:3244`，显式处理「文件不存在 3249-3257 / 解析失败从 .bak 恢复 3271-3295」；账本只在 `mgr.isLoaded()` 时写（`flow.ts:61`）→ 死锁成立。**行号修正**：`--backup` 在 **1840-1847** 先写 `flow.json.bak`（1843），门必须在 **1839**（不是 1850），否则拒绝后仍留 `.bak`。 |
| 003 | `flow checkpoint restore` 漏接 + 同款豁免 | ✅ `restoreCheckpoint` 在 `flow.ts:2064`（核心 `flow-manager.ts:870`）；handler **无 `isLoaded()`**（2021-2065）；死锁成立。`--dry-run` 分支 2026-2057 提前 return。 |
| 004 | `config set --sync-stages` 漏接；**升级**：还写 `stages[id].workflow_mode` | ✅ 分支 `config.ts:417`→`syncConfigFieldToStages`（420）；`flow-manager.ts:4051-4054` 写 `stages[id].workflow_mode` 并置 dirty，**4057-4059 `save()`**。处置按 review-notes 一.3：门插在 **402**（`setConfigValue` 403 之前），`opts.syncStages` 条件式 → strict 拒绝时 **config.yaml 也零写盘**（优于计划的「部分写盘」方案）。 |
| 005 | `flow migrate` / `flow health --fix` / `flow wizard` 显式表态 | ✅ migrate：`isLoaded` 1922、`needsMigration` 1928、写点 1950/1965 → **受门（条件式）**，无死锁。health：写点 `reconcileStatusMd` 2363，`--fix` 才写 → **受门（`--fix` + 非 dry-run 条件式）**（按 REV-001 的 8 命令口径；见 §11 反驳记录）。wizard：写点 2599/2720，`isLoaded` 2543 → **受门（入口一次，无条件）**。 |
| 006 | `stage task --add` 门位不可达 | ✅ `--add` 分支 594-613，`appendStatusTask` **601** 写盘，**612 return**；原门位 634 到不了 → **改两处门：600（分支内）+ 634（主路径）**。 |
| 007 | 漏接 `view accept` | ✅ `view.ts:71-72` 命令、action 75、`acceptReview` **78**；核心 `core/view/entry.ts:239-274`，`:260 addReview/263 appendLog/271 save()`；可把 blocking open REV 置 closed 从而绕过 done/归档阻塞门 → **受门 + 只读预检**。 |
| 008 | legacy reject 新增顶层 `hint` 键违约 | ✅ 采纳：reject 载荷**只** `{ error: 'preflight-required' }` → 三键 `['schemaVersion','error','errorKind']`；提示只走人类 stderr；`docs/commands.md` 登记该值。 |
| 009 | §3.4 一律接受遮蔽与 §3.2 矛盾 | ✅ 采纳，改为「门前只读预检 + 精确遮蔽」：`review update` / `view accept` 用 `getReviewItems()`，`plan scheme publish/rename/remove/register` 用 `listSchemes()`（`core/plan/scheme.ts:890`），`flow stage reset` 用「核心校验先于门」（门后置到 `save()` 前，`resetStagePhase` 的 throw 全部在写盘前：`flow-manager.ts:1670-1678`）。仅保留 5 项真正只在单点内部的遮蔽（§3.4）。 |

---

## 1. 统一 helper 设计（P0，先做）

### 1.1 放哪一层：**命令层，不放进 `src/core/preflight.ts`**

`enforcePreflightOrFail` 的拒绝出口需要 `emitErrorEnvelope` / `isJsonMode`，两者都在命令层。已核实 `src/core` 现无任何 `from '../commands/` 依赖；反向依赖会造成 core → commands 层次反转。

- **新增文件**：`src/commands/shared/preflight-gate.ts`（唯一新增源文件）
- `src/core/preflight.ts` **零改动**（`preflightGate` 原样复用）

### 1.2 最终签名

```ts
// src/commands/shared/preflight-gate.ts
import { preflightGate } from '../../core/preflight.js';       // 唯一判定源
import { t } from '../../core/i18n.js';                        // 只用 t（避免 unused import 触发 eslint）
import { getCliErrorSpec } from '../../core/errors.js';        // exitCode 单一来源
import { emitErrorEnvelope } from './errors.js';
import { isJsonMode } from './json-output.js';

/** 当前 flow.json 是否可读（由调用方 `mgr.isLoaded()` 求值后传入） */
export type StateReadable = boolean;

export interface PreflightGuardOptions {
  /** 覆盖主文案（缺省 t('flow.preflightRequiredTmpl', lang)） */
  message?: string;
  /** 自定义拒绝输出（仅 legacy --json 命令：flow archive、req split） */
  reject?: (message: string) => void;
  /** 状态可读性；缺省 `true`（普通命令不传 = 视为可读 → 不触发豁免） */
  stateReadable?: StateReadable;
  /**
   * 状态不可读时放行（恢复通道豁免）。
   * **仅限 `flow repair` / `flow checkpoint restore`**（§4.4 硬约束）。
   */
  exemptWhenStateUnreadable?: boolean;
}

/**
 * 写命令统一 preflight 闸。
 * @returns true=放行；false=已输出拒绝并置 exitCode，**调用方必须立即 return**
 */
export function enforcePreflightOrFail(
  projectPath: string,
  lang: string,
  options?: PreflightGuardOptions,
): boolean;
```

### 1.3 实现骨架（豁免判定必须**先于**任何输出）

```ts
const stateReadable = options?.stateReadable ?? true;
// ① 恢复通道豁免：状态不可读 → 静默放行（否则账本永远写不出 → 死锁）
if (options?.exemptWhenStateUnreadable === true && !stateReadable) return true;

const message = options?.message ?? t('flow.preflightRequiredTmpl', lang);
const gate = preflightGate(projectPath, message);   // off → ok；warn → 仅 TTY 提示后 ok
if (gate.ok) return true;

const exitCode = getCliErrorSpec('INVALID_ARGUMENT').exitCode;  // 单一来源，不硬编码 1
if (options?.reject) { options.reject(gate.message); process.exitCode = exitCode; return false; }
if (isJsonMode()) {
  emitErrorEnvelope({
    code: 'INVALID_ARGUMENT',
    message: gate.message,
    detail: { reason: 'preflight-required', hint: 'openfeel flow next --json' },
  });
} else {
  console.error(gate.message);
}
process.exitCode = exitCode;
return false;
```

**为什么不调 `failCli`**：唯一理由是**非 JSON 分支会立即 `process.exit(1)`，调用点无法 `return` 收敛**（helpers 之后还有统一 catch/回滚路径）。统一「置码 + 返回」；外部可观测不变（exit 1 + 单行 stderr / 单文档 envelope）。

### 1.4 它**不需要**知道命令名

- 拒绝信封 `detail` 保持 `{reason, hint}` 两键（JSON 契约零变更）。
- `detail.command` 属契约变更，本批次不做（§10）。

### 1.5 调用点四种形态（36 处）

```ts
// ① 无条件（24 处）
if (!enforcePreflightOrFail(projectPath, lang)) return;

// ② dry-run 免门（8 处：不含 legacy 与豁免者）
if (!options.dryRun && !enforcePreflightOrFail(projectPath, lang)) return;

// ③ 恢复通道（2 处：flow repair / flow checkpoint restore；同时带 dry-run 免门）
if (!options.dryRun && !enforcePreflightOrFail(process.cwd(), lang, {
  stateReadable: mgr.isLoaded(),
  exemptWhenStateUnreadable: true,
})) return;

// ④ legacy reject（2 处：flow archive / req split；见 §1.6）
if (!options.dryRun && !enforcePreflightOrFail(process.cwd(), lang, { reject })) return;
```

> 36 = 24 无条件 + 8 条件式（其中 2 个另带豁免）+ 2 条件式 + 2 legacy（其中 archive 带 dry-run 条件）。
> 精确分桶见 §4.3 表与 §4.1 自查 grep。

### 1.6 legacy `reject`（**不得新增顶层键**，REV-008）

```ts
// flow archive：handler 内只有 options.json（flow.ts:2080），不要照抄 req.ts 的 asJson
const reject = (m: string): void => {
  if (options.json === true) failJson({ error: 'preflight-required' }); // 三键：schemaVersion/error/errorKind
  else console.error(m);
};
```
`req split` 同形，判据用其既有 `asJson`（`req.ts:590`）。`preflight-required` 作为 legacy 错误值登记进 `docs/commands.md` 的「legacy 形态」段；**不携带 hint**（提示只在人类 stderr）。

---

## 2. 接入清单（逐命令一行；行号为核对值）

> 「门位置」= **插在该行之前**，不改动既有校验顺序。
> 「形态」：`E` = envelope（仅当该命令注册了 `--json` 才可达，见 §0.3），`L` = legacy `failJson` 覆盖，`H` = 人类 stderr + exit 1。

### 2.1 `src/commands/flow.ts`（16 命令 / 16 门位，其中 1 个收敛）

| # | 真实命令 | `.command(` 行 | handler `.action(` 行 | 门位置（插在此行前） | 形态 | 备注 |
|---|---|---|---|---|---|---|
| 1 | `flow stage add <stageId>` | 709 | 712 | **727**（`try {`） | E(有 `--json`? 否→H) | 参数校验 716-721、`isLoaded` 723-726 在前 |
| 2 | `flow stage remove <stageId>` | 739 | 744 | **761**（`if (options.dryRun)`） | H | **条件式** |
| 3 | `flow stage set <stageId> --deps` | 818 | 821 | **865**（`try {`） | H | 悬空 deps 851-855、目标存在 859-863 在前 |
| 4 | `flow stage reset <stageId> --to` | 886 | 890 | **914**（no-op 早退 910-913 之后、`mgr.save()` 915 之前） | H | **条件式**；`--to`/阶段存在由核心 1670-1698 在写盘前 throw（REV-009） |
| 5 | `flow advance`（已接，**收敛**） | 935 | 946 | 990-999 原地替换 | **E**（`--json` 944） | **条件式改造**（REV-001）；即时 exit → 置码 return |
| 6 | `flow attempt --op --result` | 1349 | 1353 | **1376**（`const outcome`） | H | `--result` 值域 1361、draft 拒绝 1367 在前 |
| 7 | `flow review add` | 1555 | 1562 | **1581**（`addReviewEntry`） | H | 二选一/auto-fix 校验 1565-1576 在前；目标解析遮蔽见 §3.4 |
| 8 | `flow review resolve <rev-id>` | 1635 | 1638 | **1648**（`mgr.save()`，在 `ok` 分支内） | H | not-found 分支 1650-1653 在门前（REV-009） |
| 9 | `flow review update <rev-id>` | 1658 | 1663 | **1706**（`updateReview`），门前加 REV 只读预检（`mgr.getReviewItems()`） | H | 枚举/无字段校验 1674-1704 在前；`updateReview` 内 `save()`（`flow-manager.ts:2814`） |
| 10 | `flow review remove <rev-id>` | 1717 | 1719 | **1733**（`removeReview`） | H | REV 存在预检 1727-1732 已在门前；内 `save()`（2839） |
| 11 | `flow archive <version>`（版本归档） | 2075 | 2080 | **2157**（`splitForArchive`） | **L**（`--json` 2079） | **条件式**；判据门 2117-2155 在前 |
| 12 | `flow repair`（REV-002） | 1829 | 1834 | **1839**（`--backup` 注释，早于 1843 的 `.bak`） | H | **条件式 + 豁免** |
| 13 | `flow checkpoint restore`（REV-003） | 2015 | 2021 | **2064**（`restoreCheckpoint`） | H | **条件式 + 豁免**；`--force` 守卫 2060-2063 在前 |
| 14 | `flow migrate`（REV-005） | 1915 | 1919 | **1936**（`// --dry-run 输出迁移预览`） | H | **条件式**；`isLoaded` 1922、`needsMigration` 1928 在前 |
| 15 | `flow health --fix`（REV-005/001） | 2340 | 2346 | **2361**（`if (options.fix)`） | H | **条件式**：`options.fix && !options.dryRun`；写点 `reconcileStatusMd` 2363 |
| 16 | `flow wizard`（REV-005） | 2531 | 2533 | **2547**（`isLoaded` 守卫 2543-2546 之后、交互循环 2551 之前） | H | 无条件；写点 2599/2720；非 TTY 已在 2536-2540 早退 |

### 2.2 `src/commands/stage.ts`（3 命令 / 4 门位）

| # | 真实命令 | `.command(` 行 | handler `.action(` 行 | 门位置（插在此行前） | 形态 | 备注 |
|---|---|---|---|---|---|---|
| 17 | `stage set <stageId>` | 453 | 461 | **518**（`const applied`） | H | **REQ-015 验收项 4：阶段存在性 466-469 硬前置**；选项/枚举/general 471-515 在前 |
| 18 | `stage task --add <desc>` | 576 | 583 | **600**（`try {`；`appendStatusTask` 在 601） | H | **REV-006：`--add` 分支独立门**；互斥校验 596-599 在前；分支在 612 return |
| 19 | `stage task <taskNo> --done/--undone` | 576 | 583 | **634**（`// 写操作前备份`） | H | 主路径门；阶段存在/`taskNo` 校验 588-632 在前 |
| 20 | `stage create <stageId>` | 651 | 654 | **674**（`mgr.addStage`） | H | 弃用入口，纳入只为闭环 |

### 2.3 `src/commands/plan.ts`（6 命令 / 7 门位，其中 1 个收敛）

| # | 真实命令 | `.command(` 行 | handler `.action(` 行 | 门位置（插在此行前） | 形态 | 备注 |
|---|---|---|---|---|---|---|
| 21 | `plan stage add <name>`（已接，**收敛**） | 28 | 36 | 133-138 原地替换 | H | 校验链 40-130 在前 |
| 22 | `plan scheme create --from-tasks` | 220 | 226 | **238**（`createSchemesFromTasks`） | H | title 互斥 233-237 在前 |
| 23 | `plan scheme create <stage> <title>` | 220 | 226 | **271**（`createScheme`） | H | title 必填 265-269 在前 |
| 24 | `plan scheme publish` | 283 | 287 | **290**（`publishScheme`），门前加 op 只读预检（`listSchemes`） | H | 预检失败用既有 `plan.scheme.publish.notFoundTmpl`（同文案） |
| 25 | `plan scheme rename` | 312 | 317 | **326**（`renameScheme`），门前 `listSchemes` 预检 | H | 空标题 321-325 在前 |
| 26 | `plan scheme remove` | 405 | 411 | **414**（`removeScheme`），门前 `listSchemes` 预检 | H | **条件式**（`--dry-run` 410） |
| 27 | `plan scheme register` | 449 | 454 | **457**（`registerSchemes`），**显式 `opId` 时**加 `listSchemes` 预检 | H | **条件式**（`--dry-run` 453） |

### 2.4 `src/commands/req.ts` / `config.ts` / `view.ts`（9 命令 / 9 门位，其中 3 个收敛）

| # | 真实命令 | `.command(` 行 | handler `.action(` 行 | 门位置（插在此行前） | 形态 | 备注 |
|---|---|---|---|---|---|---|
| 28 | `req add <title>`（已接，**收敛**） | 111 | 116 | 125-130 原地替换 | H | 保持「NO_INIT 119-122 → 门」 |
| 29 | `req claim <id>`（已接，**收敛**） | 294 | 297 | 311-316 原地替换 | H | **位置不变**：ID 校验 305-309 仍在门前 |
| 30 | `req release <id>` | 352 | 354 | **367**（`releaseRequirement`） | H | ID 校验 362-366 在前 |
| 31 | `req set <id>` | 385 | 392 | **414**（`updateRequirement`） | H | ID 校验 400-404 + 无字段 406-412 在前 |
| 32 | `req link --stage …` | 464 | 469 | **496**（`linkRequirement`） | H | 互斥 477-484 + reqId 校验 489-495 在前 |
| 33 | `req advance <id> --to` | 534 | 537 | **553**（`advanceRequirement`） | H | ID 校验 545-549 在前 |
| 34 | `req split <id> --into` | 584 | 588 | **618**（`splitRequirement`） | **L**（`--json` 587） | `--into` 守卫 607-616 在前 |
| 35 | `config set <key> <value> --sync-stages`（REV-004） | `config.ts:264` | `config.ts:269` | **402**（`try {`；`setConfigValue` 在 403） | H | 条件式 `opts.syncStages &&`；门在最前 → config.yaml/status.md/flow.json **三处零写盘**；`--stage` 解析校验 357-400 在前 |
| 36 | `view accept <rev-id>`（REV-007） | `view.ts:71` | `75` | **78**（`acceptReview`），门前加 REV 只读预检（`listReviews`） | H | 预检失败用既有 `view.accept.errorNotFoundTmpl`（同文案） |

> **合计：34 个命令 / 36 个门位**：flow 16 / 16，stage 3 / 4，plan 6 / 7，req 7 / 7，config 1 / 1，view 1 / 1。
> 收敛门位 4 个（#5、#21、#28、#29）；条件式 10 个（#2、#4、#5、#11、#12、#13、#14、#15、#26、#27），其中 #12、#13 另带豁免。

### 2.5 行为变化声明（对外可观测，按 review-notes 二.7 修正）

1. **只有** `flow advance` / `flow archive` / `req split` 注册了 `--json`：拒绝形态分别为 envelope / legacy 三键 / legacy 三键。
2. 其余 31 个门位**未注册 `--json`**：对外行为是「人类 stderr 文案 + exit 1」，与今天一致（仅文案来源从各处裸 `console.error` 收敛到 helper 的同一 i18n 串）。传 `--json` 仍被 Commander 判 unknown option（exit 1），**不产生 preflight envelope**。
3. `flow advance` 非 JSON 拒绝从 `process.exit(1)` 改为「`exitCode=1` + return」：退出码与 stderr 文案不变。
4. `warn`（默认）零变化：仅 TTY 提示后放行；非 TTY（测试/CI/管道）零输出。
5. `off`：**不拒绝、不输出**；但 `preflightGate` 仍会先调 `checkPreflight`（读一次账本）再判 `off` —— 措辞不再说「完全不读账本」。
6. **`--dry-run`（10 命令）永不被门拒绝**（§4.3）。
7. **状态不可读时 `flow repair` / `flow checkpoint restore` 放行**（§4.4）；状态可读时二者仍受门。
8. `config set --sync-stages` 在 strict 拒绝时**三处均零写盘**（门在 `setConfigValue` 之前，REV-004 修正）。

---

## 3. 顺序约束（**参数校验先于 preflight**）

### 3.1 总规则

> **门只插在「首个写盘点」之前；门之前不得删除、移动、合并任何既有校验。**
> 即：`参数形状校验` → `NO_INIT / 存在性 / 值域` → **preflight 门** → `首个写盘`。

### 3.2 门前必须保留的既有校验（逐点）

| 命令 | 门前必须保留的校验 | 行 |
|---|---|---|
| `req claim` | 需求 ID 格式 | 305-309 |
| `stage set` | 阶段存在 + general 载体制 + 枚举值域 + 空 agent + 无选项 | 466-515 |
| `stage task --add` | 阶段存在；`--add` 与 `--done/--undone` 互斥 | 588-599 |
| `stage task` 主路径 | 阶段存在；taskNo 合法性 | 588-632 |
| `flow stage remove` | `isLoaded`；阶段存在（归一化） | 747-758 |
| `flow stage set` | `validateStageId`；`isLoaded`；悬空 deps；目标存在 | 825-863 |
| `flow stage reset` | `isLoaded`；`resetStagePhase` 的阶段存在/`--to` 值域/REV 阻塞（核心 throw 全在写盘前） | 893-896；`flow-manager.ts:1670-1698` |
| `flow attempt` | `isLoaded`；`--result` 值域；draft 拒绝 | 1356-1374 |
| `flow review add` | `--op`/`--stage` 二选一；`--auto-fix` 需 `--op` | 1565-1576 |
| `flow review resolve` | `isLoaded`；REV 不存在（`ok=false` 分支） | 1641-1653 |
| `flow review update` | priority/blocking 枚举；无字段守卫；**REV 只读预检** | 1674-1704 |
| `flow review remove` | REV 存在（先取标题） | 1727-1732 |
| `flow archive` | `isLoaded`；版本归一；版本存在性门；done/blocking 判据门 | 2094-2155 |
| `flow repair` | 无（首个写盘为 1843 的 `.bak`，门在 1839） | — |
| `flow checkpoint restore` | `--force` 必选；`--dry-run` 提前返回 | 2026-2063 |
| `flow migrate` | `isLoaded`；`needsMigration` 早返回 | 1922-1931 |
| `flow health --fix` | 无（`--fix` 即写；`--dry-run` 免门） | 2361 |
| `flow wizard` | 非 TTY 守卫；`isLoaded` | 2536-2546 |
| `config set --sync-stages` | key 白名单；值域；general 载体；`--stage` 解析/注册校验 | 334-400 |
| `plan scheme create` | `--from-tasks` 与 title 互斥；title 必填 | 233-237 / 265-269 |
| `plan scheme publish/rename/remove/register` | **op 只读预检**（`listSchemes`）；rename 空标题 | 287-325 / 411-457 |
| `req release/set/link/advance/split` | ID 校验；link 互斥；set 无字段；split `--into` | 362-366 / 400-412 / 477-495 / 545-549 / 597-616 |
| `view accept` | **REV 只读预检**（`listReviews`） | 75-77 |
| `plan stage add`（已接） | 全部 40-130 不动 | — |

### 3.3 顺序断言（测试必须覆盖，见 §5.3 —— 4 条全落）

| 序位断言 | 期望输出（**不是** preflight 文案） |
|---|---|
| `req claim REQ-XXX`（非法 ID）+ strict 无账本 | `req.invalidIdTmpl` |
| `stage set no-such-stage` + strict 无账本 | `stage.errorStageNotFoundTmpl`（REQ-015 验收项 4） |
| `flow review remove REV-999` + strict 无账本 | `flow.review.notFoundTmpl` |
| `flow archive bogus` + strict 无账本 | `flow.archive.invalidVersionTmpl` |

> 追加（REV-009 新增预检的可验证面）：`flow review update REV-999`、`view accept REV-999`、`plan scheme publish stage op-999`、`flow stage reset --to bogus` 四条同样必须报「不存在 / 非法值」而非 preflight。

### 3.4 「门遮蔽」策略（REV-009 修订：**只读预检优先，遮蔽最小化**）

**原则**：能在**同一真值源**上做只读预检的，一律前置到门前；只有「必须调用写函数才会产生」的状态判定才允许遮蔽。

**门前只读预检清单（新增）**：

| 命令 | 预检 API（既有真值源） | 预检失败文案（复用既有键） |
|---|---|---|
| `flow review update` | `mgr.getReviewItems().some(r => r.id === revId)` | `flow.review.notFoundTmpl` |
| `view accept` | `listReviews(process.cwd())`（`core/view/entry.js`） | `view.accept.errorNotFoundTmpl` |
| `plan scheme publish` | `listSchemes(projectPath, stage).some(s => s.opId === localOpId)` | `plan.scheme.publish.notFoundTmpl` |
| `plan scheme rename` | 同上 | `plan.scheme.rename.notFoundTmpl` |
| `plan scheme remove` | 同上 | `plan.scheme.remove.notFoundTmpl` |
| `plan scheme register` | 同上（**仅显式 `opId` 时**） | `plan.scheme.publish.notFoundTmpl`（handler 既有键） |
| `flow stage reset` | **不预检**：把门后置到 `mgr.save()` 之前，`resetStagePhase` 的阶段存在（1670）/`--to` 值域（1675）/REV 阻塞（1684-1694）全部在写盘前 throw | 既有 catch 文案逐字不变 |
| `flow review resolve` / `flow review remove` | 已由 not-found 分支前置 | 既有键 |

> 这些预检**不构成第二套真值**：它们读的是同一份 `flow.json` / 同一批 `ops/*.md`，判定口径与核心函数一致（引用的都是既有导出），不新增规则、不做归一化外的判断。

**仍接受的遮蔽（精确列表，仅 5 项）**：

| 命令 | 被遮蔽的判定 | 为什么必须遮蔽 |
|---|---|---|
| `flow review add` | op/stage 目标解析 + `invalidPriority` + `notLoaded`（`core/view/entry.ts:130-181`） | 目标解析支持 `--op`/`--stage` 双模式并与 REV ID 分配、写入同函数（T37 单点）；前置需复刻解析逻辑 |
| `plan scheme publish` | `not-draft` / `empty-template`（`core/plan/scheme.ts:735/746`） | 仅在写函数内判定的状态 |
| `plan scheme rename` | `title-unchanged`（`scheme.ts:830`，属成功 no-op） | 需读文件当前标题，属写函数内部状态 |
| `plan scheme remove` | `op-done` / `has-checkpoint`（`scheme.ts:569/573`） | 同属写函数内部状态 |
| `plan scheme create --from-tasks` | `STATUS_NOT_FOUND`（`core/plan/*` 内） | 读 status.md 的副作用与生成同函数 |

**收敛条件**：若评审要求连这 5 项也前置，必须先在不复制判定的前提下把核心函数拆出「只读判定」导出；属**超本批次**改动（§10）。

---

## 4. 零写盘保证

### 4.1 逐命令「首个写盘点」核对（门必须在其前）

| 命令 | 首个写盘点 | 行 | 门位置 | 结论 |
|---|---|---|---|---|
| `flow stage add` | `mgr.save()` | 729 | 727 | ✅ |
| `flow stage remove` | `mgr.save()` / `rmSync` | 798 / 800 | 761 | ✅（`--purge` 确认 787-794 在门后） |
| `flow stage set` | `mgr.setStageDeps`（内部 save） | 866 | 865 | ✅ |
| `flow stage reset` | `mgr.save()` | 915 | 914 | ✅（核心仅改内存；no-op 早退 910-913 在门前，属零写盘路径） |
| `flow advance` | `mgr.save()`（推进链内） | >999 | 990 | ✅ |
| `flow attempt` | `mgr.save()` | 1377 | 1376 | ✅ |
| `flow review add` | `addReviewEntry` 内 `save()` | `core/view/entry.ts` | 1581 | ✅ |
| `flow review resolve` | `mgr.save()` | 1648 | 1648 | ✅（门前仅内存 `review.status`，未落盘） |
| `flow review update` | `updateReview` 内 `save()` | `flow-manager.ts:2814` | 1706 | ✅ |
| `flow review remove` | `removeReview` 内 `save()` | `flow-manager.ts:2839` | 1733 | ✅ |
| `flow archive` | `writeArchiveFile` | 2190 | 2157 | ✅ |
| `flow repair` | **`flow.json.bak` 复制** | **1843**；`mgr.repair` 1850 | **1839** | ✅ 门在 `.bak` 之前 |
| `flow checkpoint restore` | `mgr.restoreCheckpoint` | 2064 | 2064 | ✅ |
| `flow migrate` | `mgr.migrate(false)`（内部 .bak+flow.json）/`save()` | 1950 / 1965 | 1936 | ✅（dry-run 走 `migrate(true)`，零写盘） |
| `flow health --fix` | `mgr.reconcileStatusMd` | 2363 | 2361 | ✅ |
| `flow wizard` | `mgr.addStage`+`save()` / 推进 save | 2598-2599 / 2720 | 2547 | ✅ |
| `stage set` | `insertStatusField` / `backupStatus` | 525 / 558 | 518 | ✅ |
| `stage task --add` | `appendStatusTask` | **601** | **600** | ✅（REV-006） |
| `stage task` 主路径 | `backupStatus` / `toggleTask` | 635 / 638 | 634 | ✅ |
| `stage create` | `mgr.save()` | 675 | 674 | ✅ |
| `plan stage add` | `addStage(...)` | 141 | 133 | ✅ |
| `plan scheme create` | `createSchemesFromTasks` / `createScheme` | 239 / 271 | 238 / 271 | ✅ |
| `plan scheme publish` | `publishScheme`（内 `save()` 751） | 290 | 290 | ✅ |
| `plan scheme rename` | `renameScheme`（内 `save()` 844） | 326 | 326 | ✅ |
| `plan scheme remove` | `removeScheme`（内 `save()` 589） | 414 | 414 | ✅ |
| `plan scheme register` | `registerSchemes`（内 `save()` 697） | 457 | 457 | ✅ |
| `config set --sync-stages` | `setConfigValue`（403, config.yaml）；`syncConfigFieldToStages`（420, status.md + flow.json 4051-4059） | 403 / 420 | **402** | ✅ 三项全在门后（REV-004 修正） |
| `req add` | `writeRequirementBodySkeleton` | 142 | 125 | ✅ |
| `req claim` | `mgr.save()` | 344 | 311 | ✅ |
| `req release` | `mgr.save()` | 377 | 367 | ✅ |
| `req set` | `mgr.save()` / `syncConfigFieldToStages` | 445 / 453 | 414 | ✅ |
| `req link` | `mgr.save()` / `syncConfigFieldToStages` | 514 / 521 | 496 | ✅ |
| `req advance` | `mgr.save()` | 576 | 553 | ✅ |
| `req split` | `writeRequirementBodySkeleton` | 635 | 618 | ✅ |
| `view accept` | `addReview`/`appendLog`/`save()` | `core/view/entry.ts:260/263/271` | 78 | ✅ |

**结论：34 个写命令 / 36 个门位，既有写盘全部在门后**；唯一的「门后置」是 `flow stage reset`（914，为满足 REV-009 的非法值优先，且核心写入仍在 915 的 save）。

**执行期自查（必须命中预期条数）**：

```bash
grep -n "options.dryRun && !enforcePreflightOrFail" src/commands/*.ts   # 期望 10 行
grep -rn "exemptWhenStateUnreadable: true" src/commands/*.ts           # 期望 2 行
```

- 10 行明细：`flow.ts` 7 行（stage remove / stage reset / advance / repair / restore / migrate / archive；`health` 为 `options.fix && !options.dryRun && …` 也匹配该子串）+ `health` 1 行 + `plan.ts` 2 行（scheme remove / register）= **10**。
- 2 行明细：`flow repair`、`flow checkpoint restore`。

### 4.2 唯一允许的写盘例外

`recordPreflight`（`core/preflight.ts:44`）写 `.openfeel/dev/.preflight.json` —— **读命令的副作用**；门只读账本，不刷新它。

### 4.3 `--dry-run` 免门（通用规则，**10 个门位**）

| # | 命令 | `--dry-run` 行 | 门 | 写法 |
|---|---|---|---|---|
| 2 | `flow stage remove` | 742 | 条件式 | `!options.dryRun &&` |
| 4 | `flow stage reset` | 889 | 条件式 | 同上 |
| 5 | `flow advance` | 941 | 条件式 | 同上（**收敛时必须同时改条件式**，否则「探查 → 刷新 → 真执行」仍断） |
| 12 | `flow repair` | 1831 | 条件式 + 豁免 | 同上 + `stateReadable` |
| 13 | `flow checkpoint restore` | 2020 | 条件式 + 豁免 | 同上（dry-run 分支 2026-2057 已 return，条件前缀冗余但显式保留供审计） |
| 14 | `flow migrate` | 1917 | 条件式 | `!options.dryRun &&` |
| 15 | `flow health` | 2345 | 条件式 | `options.fix && !options.dryRun &&` |
| 11 | `flow archive` | 2078 | 条件式 + legacy | `!options.dryRun &&` + `reject` |
| 26 | `plan scheme remove` | 410 | 条件式 | `!options.dryRun &&` |
| 27 | `plan scheme register` | 453 | 条件式 | 同上 |
| — | 顶层 `migrate` / `migrate rollback` | `migrate.ts:18/38` | **不接** | 另一域（§10） |

**决策**：dry-run 不受门 —— ① 零写盘零收益；② 保住「`--dry-run` 试探 → `flow next` → 真执行」的正当路径。
**必测**：strict + 删账本 + `--dry-run` → 成功且零写盘（§5.4 10 条、验收 §9.6）。

### 4.4 状态不可读豁免（REV-002/003；**硬约束，禁止泛化**）

**死锁证据链**：账本只在 `mgr.isLoaded()` 时写（`flow.ts:61`）→ flow.json 损坏时 `flow next/status` 写不出账本 → strict 下所有写命令永久拒绝 → 用户无法修复。而 `repair()`（3244）与 `restoreCheckpoint()`（870）在损坏状态下仍能工作。

**语义**：`exemptWhenStateUnreadable === true && stateReadable === false` → **静默放行**（零输出）。状态可读时二者仍受门。

**硬约束（三条）**：
1. 只有 `flow repair`（1839）与 `flow checkpoint restore`（2064）可传该参数；`grep` 命中必须恰为 2 行。
2. 必须同时传 `stateReadable: mgr.isLoaded()`；缺参时缺省 `true` → 豁免永不生效（默认安全）。
3. 其他命令不得以「可能是修复路径」申请豁免（`flow migrate` 有 `isLoaded`、`health`/`wizard` 有 `isLoaded`，均无死锁）。

### 4.5 `off` 语义（修正 review-notes 二.17）

`preflightGate` 先 `checkPreflight`（读一次 `.preflight.json`）再判 `mode`；`off` 的语义是**永不拒绝、永不输出**，不是「不读盘」。README/文档措辞按此写。

---

## 5. 测试清单

### 5.1 `test/core/preflight.test.ts`（**保留现有 6 条不动** + **新增 6 条**）

现有 6 条（原样保留，不改断言）：`record → read`、过期 → expired、缺失/损坏/invalid、`warn 非 TTY 放行 / off 放行`、模式默认与解析、strict 缺失拒绝/有记录放行。

新增：

| 用例名 | 断言 |
|---|---|
| `strict + invalid（at 非日期）→ 拒绝且 reason=invalid` | `preflightGate(...).ok === false` |
| `strict + at 在未来 → 放行（时钟偏移容忍）` | `checkPreflight(dir, now).ok === true` |
| `warn + stderr.isTTY=true → 恰好 1 行 stderr` | `console.error` 1 次且为文案 |
| `warn + stderr.isTTY=false → 零输出` | `console.error` 未调用 |
| `off 且账本缺失 → 放行且零输出` | `ok === true`，无 stderr |
| `warn 过期 → 放行（仅提示）` | `ok === true` |

> TTY 操控沿用 `test/core/backup.test.ts:152-163` 的 `getOwnPropertyDescriptor` + `defineProperty` 写法，afterEach 还原。

### 5.2 **新增** `test/commands/preflight-gate.test.ts`（helper 单元）

| 用例名 | 断言 |
|---|---|
| `strict 拒绝 → 置 exitCode=1 且返回 false（不调用 process.exit）` | `process.exit` 未调用；`process.exitCode === 1` |
| `strict 拒绝 + JSON 模式 → 单文档 envelope` | `error.code==='INVALID_ARGUMENT'`、`kind==='refusal'`、`detail.reason==='preflight-required'`；顶层键序 `schemaVersion`,`error` |
| `strict 拒绝 + 非 JSON → 字面文案进 stderr` | `console.error` 参数 === `t('flow.preflightRequiredTmpl', lang)` |
| `off → 放行且零输出（两种模式）` | 返回 true；无输出 |
| `warn + 非 TTY → 放行且零输出` | 同上 |
| `reject 覆盖 → 只调 reject、helper 不自输出` | stdout/stderr 空；exitCode=1 |
| `exemptWhenStateUnreadable + stateReadable=false → 放行且零输出` | 返回 true；strict 下也不输出、不置码 |
| `exemptWhenStateUnreadable + stateReadable=true → 仍拒绝` | 返回 false；exitCode=1；文案在 stderr |
| `exempt 传了但未传 stateReadable → 拒绝（缺省=可读）` | 返回 false（防默认逃生） |
| `放行路径不写任何文件` | 目录快照前后一致 |

### 5.3 命令级矩阵（每门位 ≥1 条；断言分两组）

**A 组（人类 stderr 路径，31 个门位）**：`vi.stubEnv('OPENFEEL_PREFLIGHT','strict')` + 不建账本 + 断言 ①`stderr` 含文案 ②`process.exitCode === 1` ③ 目标文件字节不变。
**B 组（legacy `--json`，2 个门位：#11 `flow archive`、#34 `req split`）**：`setJsonMode(true)` + 断言 ①stdout **单文档三键** `['schemaVersion','error','errorKind']`、`error === 'preflight-required'` ②`stderr` 为空 ③exitCode=1。
> `flow archive` 的 fixture 必须**本身 eligible**（门在判据门 2117-2155 之后），否则会先撞 gate-rejected。

| 文件 | 用例（一条一项） |
|---|---|
| `test/commands/flow.test.ts`（新 describe `preflight 写命令闸（v1.5.6-stage-114）`） | `flow stage add`；`flow stage remove`；`flow stage set --deps`；`flow stage reset`；`flow advance`（收敛回归）；`flow attempt`；`flow review add`；`flow review resolve`；`flow review update`；`flow review remove`；`flow archive`（B 组）；**`flow repair`（state 可读 → 拒）**；**`flow checkpoint restore --force`（state 可读 → 拒）**；**`flow migrate`**；**`flow health --fix`**；**`flow wizard`**（TTY 桩 + strict → 拒） |
| `test/commands/stage.test.ts` | `stage set`；**`stage task --add`**（REV-006 独立用例）；`stage task --done`；`stage create`；+ `stage set` 非法阶段序位断言 |
| `test/commands/plan.test.ts` | `plan stage add`（收敛回归）；`plan scheme create`（常规）；`plan scheme create --from-tasks`；`plan scheme publish`；`plan scheme rename`；`plan scheme remove`；`plan scheme register`；+ `publish op-999` / `reset --to bogus` 等序位断言（§3.3） |
| `test/commands/req.test.ts` | `req add`/`req claim`（收敛回归）；`req release`；`req set`；`req link`；`req advance`；`req split`（B 组）；+ `claim` 非法 ID、`flow archive bogus` 序位断言 |
| **`test/commands/config.test.ts`** | **`config set workflow_mode fast --sync-stages`**（strict → 拒）：config.yaml + status.md + flow.json 三者字节不变 |
| **`test/commands/view.test.ts`** | **`view accept REV-001`**（strict → 拒，flow.json 不变）；+ `view accept REV-999` 序位断言（报 notFound 而非 preflight） |
| `test/cli/json-contract.test.ts` | `flow archive --json` 在 strict 拒绝下仍三键单文档（与既有 no-init 同形） |

### 5.4 dry-run 免门矩阵（**10 条**）

统一用例名：**`strict 且无账本：--dry-run 放行且零写盘`**，逐命令各一条：`flow stage remove`、`flow stage reset`、`flow advance`、`flow repair`、`flow migrate`、`flow checkpoint restore`、`flow health --fix`、`flow archive`、`plan scheme remove`、`plan scheme register`。
断言：① `process.exitCode` 未置 1；② stderr 不含 preflight 文案；③ `flow.json` sha256 不变；④ `.openfeel/dev/.preflight.json` 仍不存在。
> 落点：8 条在 `test/commands/flow.test.ts`，2 条在 `test/commands/plan.test.ts`（**两个文件**，不是四个）。

### 5.5 状态不可读豁免矩阵（**4 条**）

| 用例名（建议原文） | 断言 |
|---|---|
| **`strict 且无账本：flow repair 在 state 不可读时放行`** | flow.json 写 `{bad` → exitCode 非 1、stderr 无 preflight 文案、repair 生效（从 `.bak` 恢复或重建） |
| **`strict 且无账本：flow repair 在 state 可读时仍被拒`** | flow.json 合法 → exitCode 1、含文案、flow.json 字节不变 |
| **`strict 且无账本：flow checkpoint restore --force 在 state 不可读时放行`** | 同上，快照覆盖成功 |
| **`strict 且无账本：flow checkpoint restore --force 在 state 可读时仍被拒`** | 同上，快照未生效、flow.json 字节不变 |

### 5.6 CLI 进程级冒烟（**新增** `test/cli/preflight-cli.test.ts`，spawn `BIN`）

> **必须显式传 env**（review-notes 三.14）：`spawnSync(node, [BIN, ...], { cwd, encoding: 'utf-8', env: { ...baseEnv, OPENFEEL_PREFLIGHT: '<mode>' } })`，**不得**用 `{ ...process.env }` 直传（会继承 `vitest.config.ts` 的 `off` 导致恒绿）。

| 用例名 | 断言 |
|---|---|
| `strict + 无账本 → exit 1 且 flow.json 字节不变` | status 1；sha256 前后一致 |
| `strict + 无账本 + --dry-run → status 0 且零写盘` | status 0、`r.stderr === ''`、sha256 不变 |
| `strict + 先 flow next → 写命令放行` | `flow next` 后 status 0 |
| `warn + 非 TTY → stderr 0 字节` | `r.stderr === ''` |
| `off + 无账本 → status 0 且零 stderr` | `r.stderr === ''` |
| `strict + flow.json 损坏 → flow repair 放行（恢复通道）` | temp 项目 → repair status 0 且文件恢复为合法 JSON |

> 参照 `test/cli/lock-timeout.test.ts:39` / `test/cli/output-encoding.test.ts:258` 的 `spawnSync(process.execPath, [BIN, ...])`（临时项目 fixture，**不碰真实仓库**）。

### 5.7 测试基建兜底（1 行）

`vitest.config.ts` 的 `test` 块加 `env: { OPENFEEL_PREFLIGHT: 'off' }`：防开发机/CI 导出 strict 时既有数百条命令测试集体失败；新用例一律 `vi.stubEnv` 覆盖。

---

## 6. i18n

- **零新增键**：复用 `flow.preflightRequiredTmpl`（`zh-CN.ts:416` / `en.ts:390` 已配对）。
- 序位断言复用既有键（`req.invalidIdTmpl`、`stage.errorStageNotFoundTmpl`、`flow.review.notFoundTmpl`、`flow.archive.invalidVersionTmpl`、`view.accept.errorNotFoundTmpl`、`plan.scheme.*.notFoundTmpl`）。
- legacy 错误值 `preflight-required` 是字符串载荷（非 i18n），登记进 `docs/commands.md` 的 legacy 段。
- `templates-data/skills/openfeel-cli-usage/SKILL.md:76-79` 改为「全部状态写命令 / dry-run 免门 / repair+restore 状态不可读豁免」；改后 `npm run build` 重新注入。
- 若要求「按命令提示」→ 单独立项新增键，本批次不做。

---

## 7. 命令名与实现差异（**本批次交付物**，REQ-015 正文留档）

| REQ/任务表写法 | 实际 CLI 入口 | 证据 |
|---|---|---|
| `stage deps` | **不存在**；承载点 = `flow stage set <stageId> --deps` | `flow.ts:818`；`plan.ts:31` |
| `stage reset` | **不存在**；实为 `flow stage reset <stageId> --to` | `flow.ts:886` |
| `stage remove` | **不存在**；实为 `flow stage remove <stageId>` | `flow.ts:739` |
| `op create` | 实为 `plan scheme create <stage> [title]` | `plan.ts:220` |
| `op publish` | 实为 `plan scheme publish <stage> <opId>` | `plan.ts:283` |
| `archive create`（被写成 `src/commands/archive.ts`） | 版本归档 = `flow archive <version>`（2075）；`archive.ts:14` 是**阶段摘要** | `flow.ts:2074-2079` |
| （未列）`plan scheme rename/remove/register` | 同类 op 写面，本批次接入 | `plan.ts:312/405/449` |
| （未列）`req release/set/link/advance/split` | 需求写面，本批次接入 | `req.ts:352/385/464/534/584` |
| （未列）`flow stage add` / `stage create` | 同级写入口 | `flow.ts:709` / `stage.ts:651` |
| **（REV 补录，非命令名差异）** `flow repair` / `flow checkpoint restore` / `flow migrate` / `flow health --fix` / `flow wizard` / `config set --sync-stages` / `view accept` | 由 REV-002/003/004/005/007 补录；REQ 正文无对应条目，需追加「REV 补录面」小表 | `flow.ts:1829/2015/1915/2340/2531`；`config.ts:264`；`view.ts:71` |

**回填规则**：发现新不符时，executor 在**当前 op 内**：① 追加 `REQ-015.md` 差异节一行；② 追加本表一行并标「发现于 stage-114 执行期」；③ 禁改 `flow.json`；④ 结果写进 exec 摘要，由 reviewer 确认两处同步。

---

## 8. 文档更新点与门禁

### 8.1 文档（本阶段必改）

| 文件 | 改动 |
|---|---|
| `CHANGELOG.md` | `## [1.5.6]`：34 命令 / 36 门位覆盖、统一 helper、legacy 三键新增 `preflight-required` 值、dry-run 免门（10）、repair/restore 状态不可读豁免（2）、`config set --sync-stages` 三处零写盘；声明零 JSON 契约变更 |
| `docs/commands.md` | 新增 `## preflight 写命令闸（v1.5.6）`：三模式、34 命令清单（+ 排除清单）、**`--json` 仅 4 个写命令注册**（`advance`/`archive`/`req split`/`health --fix`）、legacy 三键与 `preflight-required` 值、dry-run 免门（10）、豁免（2）、`off` 语义、门前预检判定序表；在 `flow repair` / `flow checkpoint restore`(392) / `flow migrate` / `flow health`(375) / `flow wizard` / `config get/set`(763) / `view accept`(686) / `req`(718) / `stage`(878) 各加一行 |
| `docs/VERSIONS.md` | 1.5.6 批次条目 |
| `src/core/templates-data/skills/openfeel-cli-usage/SKILL.md` | 76-79 行三段式更新；改后 `npm run build` |
| `docs/json-contract.md` | **不改**（无契约变更）；CHANGELOG 声明 |
| `dsh/README.md` / `dsh/ADAPTER.md` | 仅措辞；不改 `dsh/lib` 计数与 `dsh/package.json` |

> **版本号 lockstep**：`test/core/release-metadata.test.ts:59-68` 断言 dsh 与根版本一致。**bump 留给发布 op**（Feel ②），本阶段不动版本号。

### 8.2 门禁（全绿才可进 review/test 关）

```bash
npx tsc --noEmit
npx vitest run
npx eslint src test
npm run build
npm run build                       # 幂等第二次
node bin/openfeel.js lint i18n
node bin/openfeel.js lint kb
node dsh/test/verify.js
node dsh/test/contract.js           # 需本机 @deepseek-ai；不可用则记录跳过原因
node dsh/test/integration.js
```

### 8.3 与 stage-115 的落地顺序（review-notes 二.11）

1. **stage-114 先落地**（本批次全部门位 + 测试 + docs），stage-115 不得并行改 `docs/commands.md` 与 `template-loader.ts` 生成物。
2. stage-115 **基于 114 的 docs 与代码重定行号/计数基线**（本文行号在 114 合并后即失效；115 的计划必须重新 `grep -n "\.action("` 取值）。
3. 两阶段合并后**必须重跑**：`npm run build` ×2（`template-loader.ts` 由 `templates-data/**` 重新生成）与 `node bin/openfeel.js lint i18n`（两阶段都新增/改动 i18n 键面）。
4. 若 115 需要独占 `template-loader.ts`，以「114 先合、115 后合」为唯一顺序，禁止交叉提交。

---

## 9. 验收判据（可复制粘贴，Git Bash）

> 前置：`npm run build`。安全约束：非 dry-run 只用「天然不写盘」的输入（`REQ-999` 不存在 → 引擎 not_found；门先于引擎）；「真写路径零写盘」用 §9.2。

```bash
# 9.1 strict + 无账本 + 非 dry-run → 拒绝，flow.json 字节不变
BEFORE=$(git hash-object .openfeel/flow.json)
rm -f .openfeel/dev/.preflight.json
OPENFEEL_PREFLIGHT=strict node bin/openfeel.js req release REQ-999 2>/tmp/pf1.err
echo "exit=$?   # 期望 1"
grep -q "flow next" /tmp/pf1.err && echo "OK: 命中 preflight 文案" || echo "FAIL: 门可能失效"
AFTER=$(git hash-object .openfeel/flow.json)
[ "$BEFORE" = "$AFTER" ] && echo "OK: flow.json 未变" || echo "FAIL: flow.json 被写"
test ! -f .openfeel/dev/.preflight.json && echo "OK: 门未刷新账本"
```

```bash
# 9.2 真写路径零写盘（门失效才会新增 REV）
BEFORE=$(git hash-object .openfeel/flow.json)
OPENFEEL_PREFLIGHT=strict node bin/openfeel.js flow review add --stage v1.5.6-stage-114 --title PREFLIGHT-ACCEPTANCE
echo "exit=$?   # 期望 1"
AFTER=$(git hash-object .openfeel/flow.json)
[ "$BEFORE" = "$AFTER" ] && echo "OK: 零写盘" || echo "FAIL: 新增 REV（清理：flow review remove REV-xxx）"
```

```bash
# 9.3 warn + 非 TTY → 门静默放行（stderr 只有引擎 not_found）
OPENFEEL_PREFLIGHT=warn node bin/openfeel.js req release REQ-999 2>/tmp/pf3.err >/dev/null
grep -q "flow next" /tmp/pf3.err && echo "FAIL: warn 非 TTY 出现提示" || echo "OK: 零 preflight stderr"
```

```bash
# 9.4 off → 不拒绝不输出（仍会读一次账本）
OPENFEEL_PREFLIGHT=off node bin/openfeel.js req release REQ-999 2>/tmp/pf4.err >/dev/null
grep -q "flow next" /tmp/pf4.err && echo "FAIL: off 仍拒绝" || echo "OK: off 放行"
```

```bash
# 9.5 strict + 已读状态 → 放行
node bin/openfeel.js flow next --json >/dev/null
OPENFEEL_PREFLIGHT=strict node bin/openfeel.js req release REQ-999 2>/tmp/pf5.err >/dev/null
grep -q "flow next" /tmp/pf5.err && echo "FAIL: 有账本仍被拒" || echo "OK: 门放行"
```

```bash
# 9.6 dry-run 免门（strict + 无账本）
rm -f .openfeel/dev/.preflight.json
BEFORE=$(git hash-object .openfeel/flow.json)
OPENFEEL_PREFLIGHT=strict node bin/openfeel.js flow stage reset v1.5.6-stage-114 --to plan_pending --dry-run 2>/tmp/pf6.err
echo "exit=$?   # 期望 0"
grep -q "flow next" /tmp/pf6.err && echo "FAIL: dry-run 被门拦" || echo "OK: dry-run 免门"
AFTER=$(git hash-object .openfeel/flow.json); [ "$BEFORE" = "$AFTER" ] && echo "OK: 零写盘" || echo "FAIL: dry-run 写盘"
```

```bash
# 9.7 恢复通道豁免（临时副本，绝不碰真实仓库）
TMP=$(mktemp -d); cp -r .openfeel "$TMP/"
( cd "$TMP" && printf '{bad' > .openfeel/flow.json && rm -f .openfeel/dev/.preflight.json \
  && OPENFEEL_PREFLIGHT=strict node "$OLDPWD/bin/openfeel.js" flow repair; echo "repair_exit=$?  # 期望 0（state 不可读 → 豁免）" )
rm -rf "$TMP"
# 状态可读时同命令仍受门
TMP=$(mktemp -d); cp -r .openfeel "$TMP/"
( cd "$TMP" && rm -f .openfeel/dev/.preflight.json \
  && OPENFEEL_PREFLIGHT=strict node "$OLDPWD/bin/openfeel.js" flow repair; echo "repair_exit=$?  # 期望 1（受门）" )
rm -rf "$TMP"
```

```bash
# 9.8 结构自查（按命令名比对，不比行号 —— review-notes 二.12）
for c in "stage add" "stage remove" "stage set" "stage reset" "advance" "attempt" \
         "review add" "review resolve" "review update" "review remove" "archive" \
         "repair" "restore" "migrate" "health" "wizard" "scheme create" "scheme publish" \
         "scheme rename" "scheme remove" "scheme register" "release" "set" "link" "split" \
         "accept"; do
  grep -rq "\.command('${c%% *}" src/commands/*.ts || echo "MISSING: $c"
done
grep -rn "stage deps\|op publish\|op create\|archive create" src/commands/ \
  && echo "FAIL: 源码出现 REQ 旧命令名" || echo "OK: 无虚构命令名"
grep -n "options.dryRun && !enforcePreflightOrFail" src/commands/*.ts | wc -l   # 期望 10
grep -rn "exemptWhenStateUnreadable: true" src/commands/*.ts | wc -l           # 期望 2
```

```bash
# 9.9 门禁（同 §8.2），逐条贴结果到 exec 摘要
npx tsc --noEmit && npx vitest run && npx eslint src test && npm run build && npm run build \
 && node bin/openfeel.js lint i18n && node bin/openfeel.js lint kb && node dsh/test/verify.js
```

---

## 10. 风险与克制（**不做清单**）

| 不做 | 理由 |
|---|---|
| 不新增错误码（无 `PREFLIGHT_REQUIRED`） | 码表 13 行是契约；沿用 `INVALID_ARGUMENT` |
| 不改任何 `--json` 键集 / legacy 顶层键集 | legacy reject 只放 `error`（REV-008）；不放 `hint` |
| 不加 `detail.command` | 信封契约变更 |
| 不发即时 `process.exit` | 调用点无法 return 收敛 |
| 不改 `dsh/lib` 与适配器工具计数 | REQ-015 面在 CLI |
| 不动 `src/core/preflight.ts` | 判定已正确；豁免在命令层薄封装 |
| **豁免不得泛化**（只用 2 处） | 否则变成通用逃生门；§4.4 硬约束 + grep 自查 |
| **不给 `--dry-run` 加门（10 处）** | 零写盘零收益；保住「试探 → 刷新 → 真执行」路径 |
| **不接顶层 `migrate` / `migrate rollback`** | `migrate.ts:16/36`，另一域（legacy 布局迁移）；是**迁移/回滚逃生通道**，且 `--dry-run` 已覆盖预览需求 |
| **不接 `chore`、`dev sync`、`config set-lang`** | 均不改 `flow.json.stages`（chore 写工作日志、dev sync 写 status.md AUTO 块、set-lang 写语言配置）；Feel 已确认排除 |
| **不接顶层 `archive <stage>`** | `archive.ts:14`；它**确实写 flow.json**（`core/archive/merge.ts` appendLog+save），但属 REQ-015 未列的**阶段摘要归档域**，且与版本归档（`flow archive`）职责分离（裁定 O3）。**排除理由是 REQ 范围，而非"不写状态"**（修正 review-notes 二.15） |
| 不接其余引导/文档面：`init/update/setup/project/roadmap/knowledge/model` | 一次性引导 / 文档类写面 |
| 不把核心函数拆出「只读判定」导出 | 为消除 §3.4 剩余 5 项遮蔽而拆分核心 API 属超范围改动 |
| 不为 legacy JSON 新建统一出口 | 两处 `failJson` 已存在，复用 |
| 不改 `preflightGate` 的 TTY 判定 | warn 只在 `stderr.isTTY` 提示是「不破坏脚本」的关键 |

**范围蔓延护栏**：本批次只新增 1 个源文件、1 条测试配置默认、~36 行门调用、~55 条测试；超出「加门 + 预检 + 收敛出口 + 测试 + 文档」的改动一律拒绝。

---

## 11. op 拆分（已按 review-notes 二.10 去重）

| op | 内容（**不重复归属**） | 交付面 | 依赖 |
|---|---|---|---|
| **op-001** | helper（含 `stateReadable`/豁免）+ **4 个既有调用点收敛**（advance / plan stage add / req add / req claim）+ `vitest.config.ts` 默认 env + `preflight-gate.test.ts`（含 3 条豁免单测） | 新增 `src/commands/shared/preflight-gate.ts`；改 `flow.ts:990`、`plan.ts:133`、`req.ts:125/311` | — |
| **op-002** | `flow.ts` 阶段写面：`stage add` / `stage remove` / `stage set` / `stage reset`（门后置 914）（4 门位） | `flow.ts` | op-001 |
| **op-003** | `flow.ts` 执行/审查/归档面：`attempt`、`review add/resolve/update/remove`（含 3 处只读预检）、`archive`（legacy reject）（6 门位） | `flow.ts` | op-001 |
| **op-004** | `flow.ts` 恢复/迁移/诊断面：`repair`（条件式+豁免）、`checkpoint restore`（条件式+豁免）、`migrate`（条件式）、`health --fix`（条件式）、`wizard`（5 门位） | `flow.ts` | op-001 |
| **op-005** | `stage.ts`：`stage set`、`stage task`（**2 门位：--add 600 + 主路径 634**）、`stage create`（4 门位） | `stage.ts` | op-001 |
| **op-006** | `plan.ts`：`plan stage add` 收敛 + `scheme create`×2 / `publish` / `rename` / `remove`(条件式) / `register`(条件式)，含 4 处 `listSchemes` 预检（7 门位） | `plan.ts` | op-001 |
| **op-007** | `req.ts`：`release/set/link/advance/split`（5 门位；add/claim 已在 op-001） | `req.ts` | op-001 |
| **op-008** | `config.ts`（`--sync-stages` 402）+ `view.ts`（`accept` 预检 + 78）（2 门位） | `config.ts`、`view.ts` | op-001 |
| **op-009** | 测试矩阵（§5.3 A/B 组、§5.4 10 条、§5.5 4 条、§5.6 CLI）+ 文档（CHANGELOG / commands.md / VERSIONS / SKILL）+ 全门禁 + 与 stage-115 的合并顺序执行（§8.3） | 测试与文档 | op-002~008 |

**执行纪律**：
1. 每个 op 后**立即** `npx tsc --noEmit && npx vitest run test/commands`；
2. 门位行号以**改动前** `grep -n "\.action("` 重新确认（本文行号为 2026-10-31 基线）；
3. 禁止重排既有校验（§3.1）；禁止手改 `flow.json` / `status.md`；
4. 每个 op 结束跑 §4.1 的两条 grep（10 行 / 2 行，按 op 递增核对）；
5. op-009 的门禁结果与 §9 各条输出进 exec 摘要，供 reviewer 逐条核对。

---

## 12. 对审查建议的异议（附证据）

1. **`flow health --fix`：REV-005 的口述「免门/不做」与 REV-001 的「8 个 dry-run 命令必须条件式免门」冲突**。review-notes §四把 `flow health`(2345) 计入 8 个；本文因此**接门**（`options.fix && !options.dryRun`）。若 Feel 维持「health 不做」，删 1 行即可，门位计数回到 35/33、dry-run grep 回 9。
2. **`flow wizard` 接门**（而非不做）：它直接写 flow.json（2599/2720）且已有 `isLoaded` 守卫（2543），接门无死锁风险，且能封堵 strict 绕过；代价是交互向导在 strict 缺账本时首屏即拒（adapter 不调用 wizard，故实际影响为零）。
3. **`flow stage reset` 采用「门后置」而非 `PipelinePhaseSchema` 前置预检**：`resetStagePhase` 的阶段存在（1670）、`--to` 法性（1675）、REV 阻塞（1684-1694）**全部 throw 在任何写盘之前**，门放 914 已能保证「非法值先于门」；引入 `PipelinePhaseSchema` 预检会在命令层复制一套错误文案，反而成为第二套真值。
4. **`plan scheme register` 的预检只在显式 `opId` 时生效**：无 `opId` 时其语义是「补注册所有磁盘孤儿」，`listSchemes` 返回文件中已存在的项，预检反而会误判全部合法；该分支保留 `skipped` 结果判定（属写函数内部逻辑）。
