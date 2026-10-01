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
| `runtimeLog` | `(level, message) => void` | 写入（best-effort） |

## 落盘语义

| 维度 | 结论 |
|------|------|
| 路径 | `~/.openfeel/cli/logs/openfeel-YYYY-MM-DD.log`（按日一文件，**不自动清理**、无大小轮转/保留天数） |
| 编码 | **恒 UTF-8**（`appendFileSync(file, line, { encoding: 'utf-8' })`，与 console 输出编码**完全解耦**） |
| 行格式 | `[ISO时间][LEVEL][pid] message`（例 `[2026-10-02T01:23:45.678Z][INFO][12345] cli start: flow status`） |
| 级别 | `info`/`warn`/`error` **默认记录**；`debug` **默认关**（`--debug` 或 `OPENFEEL_DEBUG=1` 开） |
| 开关 | 默认 **on**；`--no-log` / `OPENFEEL_LOG=0` / `OPENFEEL_NO_LOG=1` 关闭 |
| 路径覆盖 | `--log-file <path>` > `OPENFEEL_LOG_FILE` > 默认按日文件 |
| 并发 | `withFileLock(globalLockPath('runtime-log'), () => appendFileSync(...))`（跨进程安全；锁 `~/.openfeel/locks/runtime-log.lock`） |
| 失败语义 | **best-effort**：写日志任何异常（磁盘/权限/锁超时）均 try/catch 吞掉，**绝不中断 CLI** |

## 接入点

- `runCli()`：`program.parse()` 前记 `cli start: <argv>`；正常返回后记 `cli done exit=<exitCode>`。
- `handleCliError(err)`：记 `cli error: <message>`（error 级）。
- `bin/openfeel.js`：在 `installOutputEncoding()` **之后**、`applyHelpI18n` **之前**调用 `installRuntimeLog()`。

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
- `--help` / `--version`：由 commander 输出后直接 exit → 不记 `cli done`。

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
