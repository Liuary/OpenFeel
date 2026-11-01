# Preflight 账本与写命令闸（preflight）

> 模块文档，由归档官在归档时维护。对应源码：`src/core/preflight.ts` + `src/commands/shared/preflight-gate.ts`。**v1.5.5-stage-113 新建 / v1.5.6-stage-114 全覆盖 / v1.5.8-stage-122 面扩展**。

## 职责

把「先读状态、再写状态」从提示词约定变成**可校验事实**：读命令（`flow next` / `flow status` / `req list` 等 `--json` 早返回路径）在读取时写账本，写命令在 strict 模式下要求账本在 **10 分钟内**；把拒绝出口收敛到单一 helper，避免 30+ 命令各写一份判定。

## 判定源（`src/core/preflight.ts`，v1.5.5 起零改动）

| 导出 | 说明 |
|------|------|
| `PREFLIGHT_MAX_AGE_MS` | `10 * 60_000`（唯一阈值，**禁止他处重算**） |
| `preflightPath(projectPath)` | `.openfeel/dev/.preflight.json`（不纳入版本管理，已 gitignore） |
| `getPreflightMode(env?)` | `OPENFEEL_PREFLIGHT=off\|strict`，其余（含缺省）= `warn` |
| `recordPreflight(projectPath, now?)` | 读命令副作用：写 `{at,stage,phase,revision}`（取首个非 done 阶段与 flow revision）；**任何写失败静默降级**（只读盘 / CI / 权限） |
| `readPreflight(projectPath)` | 只读账本；缺失 / `at` 不可解析 → `null`（损坏与「从未读过」在 `check` 层区分） |
| `checkPreflight(projectPath, now?)` | `{ok,mode,reason,record,ageMs}`；`reason ∈ ok \| missing \| expired \| invalid` |
| `preflightGate(projectPath, message)` | `off` 放行；`warn` 仅 TTY 提示后放行；`strict` 拒绝 |

## 写命令闸（`src/commands/shared/preflight-gate.ts`，v1.5.6）

`enforcePreflightOrFail(projectPath, lang, options?)` —— **命令层** helper（依赖 `emitErrorEnvelope` / `isJsonMode`，不得下沉 `src/core`）：

- **拒绝出口**：JSON 模式 `emitErrorEnvelope`（`INVALID_ARGUMENT` + `detail.reason='preflight-required'` + `hint`）；人类模式单行 stderr；legacy 命令（`flow archive` / `req split`）走调用方自带三键出口；退出码单一来源 `getCliErrorSpec('INVALID_ARGUMENT').exitCode`。
- **只置 `process.exitCode` 并返回 `false`，不调用 `process.exit`**——调用方必须立即 `return`，保证其后 catch / 回滚仍收敛。
- **覆盖范围（v1.5.6）**：34 个命令 / 36 个门位（`flow` 16 / `stage` 4 / `plan` 7 / `req` 7 / `config set --sync-stages` / `view accept`）；v1.5.8 扩到 `req review` / `req verify` / `req rollover` / `stage verify`。
- **顺序约定**：参数校验（ID / 阶段 / REV / op / `--to`）**先于** preflight；`--dry-run` 免门 10 处（`flow stage remove|reset` / `advance` / `repair` / `migrate` / `checkpoint restore` / `health --fix` / `archive` / `plan scheme remove|register`）。
- **恢复通道豁免 2 处**：`flow repair` / `flow checkpoint restore` 在 `flow.json` 不可读（`mgr.isLoaded() === false`）时静默放行——否则账本写不出 → strict 永久死锁；**禁止泛化**到其它命令（`exemptWhenStateUnreadable` 仅这两个调用点传 true）。
- **零写盘**：strict 拒绝时 `flow.json` / `status.md` / `config.yaml` / 归档与 `.bak` 全部不落盘（含 `repair --backup` / `config set --sync-stages`）。

## 观测与消费

- **流程健康（v1.5.6）**：`flow metrics` 人类输出「最近 preflight 年龄」**只读**账本（绝不 `recordPreflight`，否则指标在测自己）；适配器 `feel_status` / `feel_next` 的 `observability` 复制顶层 `preflight` 的 `ageMs` / `ok`（禁重算），且账本在 snapshot **之前**读取。
- **适配器默认 strict**：DSH 调用 CLI 时以 `OPENFEEL_PREFLIGHT=strict` 运行；用户 shell 默认 `warn`。
- **测试夹具**：`vitest.config.ts` 默认 `OPENFEEL_PREFLIGHT=off`（防开发机 / CI 导出 strict 时既有用例集体失败）；命令级矩阵与真实进程冒烟见 `test/commands/preflight-gate.test.ts` / `test/cli/preflight-cli.test.ts`。

## 变更历史

| 版本 | 变更 |
|------|------|
| v1.5.5-stage-113 | **新建账本**：`preflight.ts` 记录 / 读取 / 检查；`flow next` / `flow status` 写入；首批写命令（4 个）接入 |
| v1.5.6-stage-114 | **全覆盖**：新增命令层 helper `enforcePreflightOrFail`，34 命令 / 36 门位统一收敛；dry-run 免门 10 处、恢复通道豁免 2 处、参数错误先报、strict 零写盘；`src/core/preflight.ts` 零改动 |
| v1.5.6-stage-116 | **观测**：`flow metrics` 流程健康三项（resumed / dwell / preflight 年龄）+ 适配器 `observability`（读次序先于 snapshot，零新增 I/O） |
| v1.5.8-stage-122 | **面扩展**：`req review` / `req verify` / `req rollover` / `stage verify` 纳门（ID / 版本形态校验仍先于门） |
