# 自测报告 — op-002

- **执行时间**：2026-10-02 02:02
- **执行 Agent**：openfeel-executor
- **重试次数**：1（首次门禁手动运行暴露真实日志写入，改用隔离后通过）

## 执行摘要
op-002（B+E）全部完成：新增运行日志模块并接入 CLI；`npm test` 全绿 61 文件 / 1018 用例 / 0 skipped。

## 实施步骤完成情况
- [x] B-1：`global-paths.ts` 新增 `getCliLogsDir()`（`~/.openfeel/cli/logs`）
- [x] B-2/B-3：新建 `src/core/runtime-log.ts`（导出 API 与 §三一致；无 `process.env.VITEST` 分支）
- [x] B-4：`src/cli/index.ts` 注册 `--log-file`/`--no-log`/`--debug`
- [x] B-5：`bin/openfeel.js` 安装 `installRuntimeLog()`（在 `installOutputEncoding()` 后、`applyHelpI18n` 前）
- [x] B-6：`runCli` 记 start/done；`handleCliError` 记 error（REV-002 边界注释）；不记 stdout
- [x] B-8：边界文档并入 op-003 F-1（本 op 仅 B-6 代码注释）
- [x] E-2：`output-encoding.test.ts` 追加 3 组 spawn（正控 + 旁路回归 + 基线）
- [x] E-3：新建 `test/core/runtime-log.test.ts`（8 用例，mock homedir 隔离）
- [x] E-4：`repl.test.ts:25` 加 `OPENFEEL_LOG:'0'`
- [x] i18n `global.logFile`/`global.noLog`/`global.debug` 双语 → 730 键

## 自测清单验证
| 检查项 | 结果 | 备注 |
|--------|:--:|------|
| `getCliLogsDir()` | ✅ | 返回 `~/.openfeel/cli/logs` |
| runtime-log 导出 API 一致；无 VITEST | ✅ | `rg` 零命中 |
| 模块内默认 `config=null` | ✅ | 未安装 no-op 用例通过 |
| 行格式/UTF-8/withFileLock | ✅ | 正则 + 中文 UTF-8 断言 |
| 注册 3 选项 | ✅ | `--help` 含 log-file/no-log/debug |
| runCli/handleCliError 接入 | ✅ | 不记 stdout |
| runtime-log.test 覆盖 §5.1 | ✅ | 8 用例 |
| E-2 三组（正控含 fatal 抛错） | ✅ | 均实跑未 skip |
| repl.test 加 OPENFEEL_LOG:0 | ✅ | |
| i18n 730 exit 0 | ✅ | |
| tsc 0；build 不复活；npm test 全绿 | ✅ | 61 文件 / 1018 |
| 未改 flow.json；无新增依赖；无额外 op 文件 | ✅ | |

## 产出文件
- `src/core/global-paths.ts`
- `src/core/runtime-log.ts`（新建）
- `src/cli/index.ts`
- `bin/openfeel.js`
- `src/core/i18n-data/zh-CN.ts` / `en.ts`
- `test/core/runtime-log.test.ts`（新建）
- `test/cli/output-encoding.test.ts`
- `test/cli/repl.test.ts`

## 前置校验结果
- 方案完整性：通过
- Phase 合法性：通过（stage phase=exec_running；current.op=op-002 匹配）
- 流转合法性：通过

## 门禁实测
| 门禁 | 结果 |
|------|------|
| `npx tsc --noEmit` | 0 |
| `npm run build` | 成功，`.opencode/**` 未复活 |
| 定向 vitest（runtime-log + output-encoding + repl） | 33 通过 |
| `node bin/openfeel.js lint i18n` | 730 键 exit 0 |
| `node bin/openfeel.js lint kb` | 0 过期 exit 0 |
| `npm test` | 61 文件 / 1018 / 0 skipped |
| 日志 E2E（隔离 HOME，不设 OPENFEEL_LOG=0） | 生成 `openfeel-2026-10-02.log`，含 `[INFO][pid]`，UTF-8 |
| `flow phases --json` | 5 键 |
| `rg process.env.VITEST src/core/runtime-log.ts` | 零命中 |

## 偏差记录
1. **真实日志目录污染与清理（重要）**：op-002 门禁手动运行 `node bin/openfeel.js lint i18n`/`lint kb`/`--help` 时未设 `OPENFEEL_LOG=0`，因日志**默认开启**写入了真实 `~/.openfeel/cli/logs/openfeel-2026-10-02.log`（仅含本会话 3 条 dev 命令）。已删除该文件及空目录 `~/.openfeel/cli/`，恢复原始状态；后续门禁一律 `OPENFEEL_LOG=0`。**测试侧隔离完好**：`rg` 核查确认仅 `repl.test.ts` 与 `output-encoding.test.ts` 经 bin 的 spawn 均带 `OPENFEEL_LOG:'0'`（其余 spawn 不经 bin）；全量 `npm test` 后真实目录不存在（已验证）。
2. **E-2 cwd 口径**：按方案 §5.2 声明采用 `cwd=REPO_ROOT`（与 plan「临时目录」偏差，方案已声明等效）。
3. **git 提交范围**：仅提交 op-002 产出；CLI 产生的 `.openfeel/log/**` 审计条目与 `flow.json`/`checkpoints` 未纳入提交。
