# CLI 运行日志（runtime-log）

> 模块文档，由归档官在归档时维护。对应源码：`src/core/runtime-log.ts` + `src/core/global-paths.ts#getCliLogsDir`（v1.1.2-stage-58 op-002）。

## 职责

把 CLI 进程的**命令 / 结果 / 错误**写入 `~/.openfeel/cli/logs/openfeel-YYYY-MM-DD.log`（**恒 UTF-8**），供跨项目诊断。**不记录 stdout 内容**（仅 argv + 状态 + 错误消息）。

## 核心 API

| 导出 | 签名 | 用途 |
|------|------|------|
| `RuntimeLogLevel` | `type` | `debug \| info \| warn \| error` |
| `RuntimeLogConfig` | `interface` | `{ enabled, minLevel, filePath }` |
| `InstallRuntimeLogOptions` | `interface` | install 注入（`env?/argv?`，供单测） |
| `getRuntimeLogPath` | `(date?) => string` | 当日日志路径（`~/.openfeel/cli/logs/openfeel-YYYY-MM-DD.log`） |
| `resolveRuntimeLogConfig` | `(env, argv) => RuntimeLogConfig` | 纯解析 |
| `installRuntimeLog` | `(opts?) => void` | 安装/刷新配置（**仅 `bin` 调用**） |
| `runtimeLog` | `(level, message) => void` | 写入（best-effort；**原语零改动**——后缀由调用层构造） |
| `logCliStart` | `(argv) => void` | **v1.2.1-stage-86 新增**：起始行（`cli start: <argv>` + `[project=…] [session=…]` 后缀；与 done 行对称） |
| `logCliDone` | `(exitCode) => void` | **v1.2.1-stage-86 新增**：完成行（`cli done exit=<n> [duration_ms=…]` + 后缀；**一次性旗标防双写**） |
| `installExitHooks` | `(proc?) => void` | **v1.2.1-stage-86 新增**：安装进程退出兜底（**仅 `bin` 调用**；`proc` 注入以便单测） |
| `resetDoneFlagForTest` | `() => void` | **v1.2.1-stage-86 新增**：重置 done 旗标（**测试用**——模块态隔离） |

## 落盘语义

| 维度 | 结论 |
|------|------|
| 路径 | `~/.openfeel/cli/logs/openfeel-YYYY-MM-DD.log`（按日一文件，**不自动清理**、无大小轮转/保留天数） |
| 编码 | **恒 UTF-8**（`appendFileSync(file, line, { encoding: 'utf-8' })`，与 console 输出编码**完全解耦**） |
| 行格式 | `[ISO时间][LEVEL][pid] message`（例 `[2026-10-02T01:23:45.678Z][INFO][12345] cli start: flow status`）。**v1.2.1-stage-86**：**前缀逐字不变** + 追加**方括号键值对后缀**（空格路径安全）——start/done 对称落 `[project=<cwd>] [session=<id>]`，done 行另落 `[duration_ms=<n>]` |
| 级别 | `info`/`warn`/`error` **默认记录**；`debug` **默认关**（`--debug` 或 `OPENFEEL_DEBUG=1` 开） |
| 开关 | 默认 **on**；`--no-log` / `OPENFEEL_LOG=0` / `OPENFEEL_NO_LOG=1` 关闭 |
| 路径覆盖 | `--log-file <path>` > `OPENFEEL_LOG_FILE` > 默认按日文件 |
| 并发 | `withFileLock(globalLockPath('runtime-log'), () => appendFileSync(...))`（跨进程安全；锁 `~/.openfeel/locks/runtime-log.lock`） |
| 失败语义 | **best-effort**：写日志任何异常（磁盘/权限/锁超时）均 try/catch 吞掉，**绝不中断 CLI** |

## 接入点

- `runCli()`：`program.parse()` 前 `logCliStart(process.argv.slice(2))`；正常返回后 `logCliDone(process.exitCode ?? 0)`。
- `handleCliError(err)`：记 `cli error: <message>`（error 级）——**零改动**（错误路径经 exit 兜底亦记 done）。
- `bin/openfeel.js`：`installOutputEncoding()` **之后**、`applyHelpI18n` **之前**调用 `installRuntimeLog()`；**紧接着**调用 `installExitHooks()`（单一咽喉纪律）。

## done 行必写加固（v1.2.1-stage-86）

原实现下 **578/5371 条 start 无 done**（约 10.8%），耗时永久丢失（进程被杀 / 中断 / 崩溃）。加固：

- `process.on('exit')` **单源兜底**——覆盖正常结束 / `process.exit` / 未捕获异常退出；写行**恒**由该钩子承担。
- `once('SIGINT')` → `process.exit(130)` / `once('SIGTERM')` → `process.exit(143)`——仅保**中断语义**，写行交 exit 钩子（避免双写）。
- **一次性旗标** `cliDoneLogged` 防双写，**置位先于写入**——即使日志被 `--no-log` / `OPENFEEL_LOG=0` 关闭也置位，保「done 事件已发生」语义。
- 钩子体内全 `try/catch` 吞（best-effort；不得影响进程退出）；`PROCESS_START_MS` 为**模块级常量**（`duration_ms` 口径 = 自本模块加载 ≈ 进程早段起算，含其后模块解析/加载 + 命令执行，**不含 node bootstrap**）。
- **有意变更**：`--help` / `--version` 由「不记 done」→「经 exit 兜底记 done」（见下 error 边界）。

## 会话标识（T2）

`[session=…]` 值经 `src/core/session.ts :: getSessionId()` 取——三级链 `env:` / `project:` / `proc:`（值前缀标明来源，机器可判人工 vs 自动化）。详见 `manual/core/session.md`。

## 四类日志边界（**语义严格分离，不得混用**）

| 日志 | 位置 | 语义 |
|------|------|------|
| **CLI 进程运行日志** | `~/.openfeel/cli/logs/*.log` | 本模块；**跨项目诊断**（命令/结果/错误） |
| 项目工作区审计日志 | `.openfeel/log/**` | `public-logger`；**团队级重要事件** |
| 流水线状态审计 | `flow.json.log[]` | **阶段推进/注册**等结构化事件 |
| 部署更新记录 | `update_infos.md` | **部署更新/备份**记录 |

**本模块不改动上述三类既有语义**。

## error 边界（REV-002）

`error` 级语义 = 「**命令处理中抛出的异常**」。以下**不入日志**：

- **commander 解析期错误**（未知命令 / 未知选项 / 缺参）：经 `program.error()` 直接 `process.exit(1)`，不抛异常、不经 `runCli` try/catch → **不入日志**。
- `--help` / `--version`：由 commander 输出后直接 exit → **v1.2.1-stage-86 起经 `exit` 兜底记 `cli done`**（旧口径「不记 done」= 有意变更，已在 op-002 报告/CHANGELOG〔归 stage-93〕登记）。

**裁定：仅注释 + 本文档化，不引入 `program.exitOverride()`**（避免过度设计；用户裁定仅要求记录 info/warn/error）。

## 安装与隔离

- **库侧默认 disabled**：模块内部 `config = null`，未调用 `installRuntimeLog` 时 `runtimeLog` 全 no-op（in-process 测试零写盘）。
- **单一咽喉安装**：仅 `bin/openfeel.js` 调用 `installRuntimeLog()`。
- **无 `VITEST` / env 守卫（REV-001/004 方案 b）**：与 `output-encoding` 隔离策略**统一**；install 仅由 `bin` 调用，守卫会被 spawn 子进程继承 → E2E 恒绿。测试以 `vi.mock('node:os')` 隔离 HOME；经 `bin` 的 spawn 测试传 `OPENFEEL_LOG=0` 降噪。
- **幂等**：`installRuntimeLog` 以最新 `env/argv` 重算配置（可重复调用）。

## 变更历史

| 阶段 | 变更 |
|------|------|
| v1.1.2-stage-58 | 初始创建：新增运行日志模块 + `getCliLogsDir()` + `--log-file`/`--no-log`/`--debug` 全局选项 + `runCli`/`handleCliError` 接入 |
| v1.2.1-stage-86 | 行格式向后兼容扩展（前缀不变 + `[project=…] [session=…]` 方括号键值对后缀；`runtimeLog` 原语零改动）+ `logCliStart`/`logCliDone` 薄封装 + **done 行必写加固**（`installExitHooks`：exit 单源 + SIGINT/SIGTERM 130/143 + 一次性旗标 + bin 单一咽喉）+ `--help`/`--version` 有意变更记 done；`[session=…]` 取 `core/session.ts` |
