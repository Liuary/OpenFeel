# 全局部署一致性检测（deployment-check）

> 模块文档，由归档官在归档时维护。对应源码：`src/core/deployment-check.ts`（核心检测 + 门控）+ `src/cli/deploy-check-output.ts`（CLI 运行期适配器）。

## 职责

只读检测全局部署版本（`~/.openfeel/update_state.json.openfeel_version`，**已部署版本事实源**，由 `setup`/`update` 每次全局部署刷新）与当前 CLI 版本是否一致，并提供「是否输出被动部署提示」的纯函数门控策略。为 `setup --check`（主动诊断）与 CLI 运行期被动提示两个出口提供**单一事实源**。

- **只读、不加锁、不写盘**；异常静默归 `unknown`，不抛。
- 本模块由 **v1.1.5-stage-66 创建**（检测核心 + 门控），**stage-67 接入 CLI**（薄适配器 + `runCli`/`startRepl` 接入 + `setup --check`）。

## 核心 API

| 函数 | 功能 |
|------|------|
| `checkGlobalDeployment({ currentVersion? })` | 只读四态检测，返回 `DeployCheckResult`（`status` / `cliVersion` / `deployedVersion`）；`currentVersion` 仅测试注入用，缺省 `getOpenfeelVersion()` |
| `shouldRunDeployCheck({ argv, isTTY, env, alreadyWarned })` | 纯函数门控，`true` = 允许被动提示，`false` = 静默；无 IO、可纯测 |
| `emitGlobalDeployCheck(options?)` | （`src/cli/deploy-check-output.ts`）运行期适配器：组装上下文 → 门控 → 检测 → **仅 stderr** 渲染 `mismatch`/`missing`；异常全捕获静默；每进程一次；不改退出码、不写盘 |

## DeployCheckResult（四态）

| 状态 | 触发条件 | `setup --check` 退出码 | 被动提示 |
|------|----------|:--:|:--:|
| `ok` | 已部署版本 == CLI 版本 | 0 | 静默 |
| `mismatch` | 已部署版本 != CLI 版本（含**降级**：部署版本 > CLI） | 1 | 提示 |
| `missing` | 全局 state 文件缺失（`existsSync` 判定，尚未 `setup`） | 1 | 提示 |
| `unknown` | state 存在但 Schema 非法/解析失败/读取异常（权限/占用/EISDIR） | 1 | 静默 |

- **`missing` 与 `unknown` 必须分离**：`loadGlobalUpdateState()` 对「文件缺失」与「Schema 非法/解析失败」**均返回 `null`**，故检测层先用 `existsSync` 判缺失 → `missing`；存在但 load 为 `null` → `unknown`。
- `unknown` **被动静默**（避免 Schema 演进误报），仅 `setup --check` 显式报告。

## 门控矩阵（`shouldRunDeployCheck`）

返回 `false`（静默）的任一条件：

- 非 TTY（`!isTTY`）；`alreadyWarned`（每进程一次）；
- `argv` 含 `--json` / `--quiet`（保护可消费输出契约）；
- `argv` 含 `--version`/`-v`/`--help`/`-h`；
- **首个非选项 token**（`argv.find(a => !a.startsWith('-'))`）∈ `{setup, update, init, migrate}`（避免「提示用户去做他正在做的事」）；
- `CI` / `OPENFEEL_NO_UPDATE_CHECK` 为真值（`isTruthyEnv`：仅识别 `'1'`/`'true'`，大小写与首尾空白不敏感；其它值由 `!isTTY` 兜底，REV-003）。

## 接入点（stage-67）

| 接入点 | 位置 | 说明 |
|--------|------|------|
| `runCli()` | `src/cli/index.ts` | `program.parse()` **之前**调用 `emitGlobalDeployCheck()` |
| `startRepl()` | `src/cli/repl.ts` | `console.log(welcome)` **之后**调用一次（`warned` 置位，REPL 内命令不再触发） |

> ⚠️ **不**在 `cli/index.ts` 顶层注册 commander `preAction`/`postAction` 钩子——否则全部 `test/**` 的 `program.parseAsync` 都会触发检测，污染测试面。

## 调用关系

```
src/cli/index.ts（runCli）/ src/cli/repl.ts（startRepl）
  └─ src/cli/deploy-check-output.ts（emitGlobalDeployCheck）
       ├─ src/core/deployment-check.ts（shouldRunDeployCheck 门控 → checkGlobalDeployment 检测）
       ├─ src/core/i18n.ts（t / getCliLang）
       └─ → process.stderr.write（update.globalStaleWarnTmpl / update.globalMissingWarnTmpl）

src/commands/setup.ts（setup --check）
  └─ src/core/deployment-check.ts（checkGlobalDeployment）→ stdout 四态报告 / --json
```

## 测试隔离

凡触碰全局路径的测试一律 `vi.mock('node:os')`（`{ ...actual, homedir: () => mockHome.dir }`）+ `mkdtempSync` 隔离 HOME；适配器 `check`/`warned` 可注入打桩。子进程用例 mock 不生效，须双设 `USERPROFILE`+`HOME`。**绝不触碰真实 `~/.openfeel/`**（检测前后字节 + mtime 不变核验）。

## 变更历史

| 阶段 | 变更 |
|------|------|
| v1.1.5-stage-66 | 初始创建：`checkGlobalDeployment` 四态检测 + `shouldRunDeployCheck` 门控纯函数（只读、不写盘、不加锁） |
| v1.1.5-stage-67 | 接入 CLI：新增 `src/cli/deploy-check-output.ts` 薄适配器 + `runCli`/`startRepl` 接入（stderr、每进程一次、不改退出码）+ `setup --check [--json]` 主动诊断消费同一检测核心 |