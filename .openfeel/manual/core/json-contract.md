# JSON 输出契约与错误封装（json-contract）

> 模块文档，由归档官在归档时维护。对应源码：`src/commands/shared/json-output.ts`、`src/core/errors.ts`、`src/commands/shared/errors.ts`、`src/cli/project-option.ts`。契约正文单一权威：`docs/json-contract.md`。**v1.2.2-stage-95 新建 / stage-96 扩展（`flow next` + 调度属性）/ stage-97 扩展至 33 成功出口 / stage-98 收官归档核对（33/34 计数三处对齐、无源码变更）/ v1.2.3-stage-99 并发 JSON 退出统一（REV-95-009）+ 锁超时 E2E 证据**。

## 职责

为全部 `--json` 输出提供**单文档 + 稳定首键 + 冻结键序**的机器契约，并为失败路径提供**稳定 `code` + `kind` + 退出码**的分类出口；同时以 `--project` 在进程入口单点锚定项目上下文。目标是让适配器不再解析人类文本、不再镜像领域逻辑。

## 分层结构

| 层 | 文件 | 核心 API / 内容 |
|----|------|------|
| 契约助手 | `src/commands/shared/json-output.ts` | `withSchemaVersion(doc)`（必须 `{ schemaVersion: 1, ...doc }`）、`emitJson(doc)`、`setJsonMode` / `isJsonMode`、`scanArgv` / `VALUE_OPTIONS` / `resolveJsonMode` / `resolveVersionFlag` |
| 错误码表 | `src/core/errors.ts` | `CliErrorKind = 'refusal' \| 'internal'`；12 行 `CLI_ERROR_CODES`（内嵌 `kind` + `exitCode`，单一来源）；`CliError` / `isCliError` |
| 错误出口 | `src/commands/shared/errors.ts` | `failCli`（JSON: envelope → `process.exitCode` → return；非 JSON: 本地化 stderr）、`failRefusal` / `failInternal`、`handleConcurrentConflict`（v1.2.3 起 JSON 分支同 `failCli` 机制：emit → exitCode=2 → return；非 JSON 保持 `process.exit(2)`） |
| 统一入口 | `src/cli/index.ts` | `runCli` 顺序：`setJsonMode` → `--version --json` 短路 → `applyProjectOption` → `logCliStart` → `emitGlobalDeployCheck` → `parse`；JSON 模式 `exitOverride`；统一 catch |
| 项目锚定 | `src/cli/project-option.ts` | `extractProjectArgs` / `applyProjectOption` / `resolveProjectPathForCommand`（原始 cwd 解析 → `statSync` → `chdir`） |

## 契约要点

1. **单文档**：`--json` 模式 stdout 恰一个 JSON 文档，不混人类文本（唯一例外：`flow advance --json` 成功保持人类文本）。
2. **首键**：`schemaVersion` 恒为运行时首键且值 `1`；构造序固定（类型签名不保证键序）。
3. **空值形态**：可选字段 `null`、集合 `[]`、映射 `{}`；禁止 `undefined`。
4. **33 个成功出口冻结**（v1.2.2-stage-97 起）：`flow` 15（status / next / recover / checkpoint list / log / overview / current / metrics / phases / mode / ops list / archive / archive list / archive show / health）+ `req` 5 + `instructions` 1 + `setup --check` 1 + `stage status` 1 + `knowledge` 4 + `config` 2 + `view list` 1 + `plan scheme list` 1 + `project overview` 1 + `archive <stage>` 1；只增不改、键序保留。注册 `--json` 选项 **34**（33 + `flow advance --json` 错误模式开关）。
5. **条件键二选一**：恒在键（缺省 `null`）或条件出现键（附依据）；`reconciled` / `warning` 恒在，`req next.candidates` 条件出现。
6. **有意变更全枚举**：C1 `instructions` 补首键；C1b/G-1 `flow archive show` 首键重定位；stage-97 #8 `flow archive` 判据三新键、#12 `req list` 末位两键。
7. **错误 envelope**：`{schemaVersion:1,error:{code,kind,message,detail}}`，`code` 语言无关、`message` 本地化、`detail` 可定位。
8. **legacy 双形态**：`{schemaVersion,error:'...'}` 保留 `error` 为 `string` 与键序，仅末尾追加 `errorKind`；判别规则 `typeof doc.error`。
9. **退出码**：`0` 成功 / `1` 预期拒绝（含用法错误）/ `2` 并发写冲突（`EXIT_CONCURRENT` 语义不变）/ `3` 内部错误（新增）；`kind` 为分类权威。
10. **`--project`**：语义等效 cwd；`--log-file` 相对路径按原始 cwd；命令输出语言按目标项目、`--help` 按原始 cwd；单进程单命令。
11. **读命令细则（§13）**：出口清单、空态 / no-init 双语义（读视图 0 + `initialized:false`；需项目命令 refusal 1）、字段形态（绝对/相对路径）、JSON 内部异常口径（内部异常 3 vs 人类 1 的登记边界）、成功分支判定读命令级 `options.json` 而错误 envelope 经 `isJsonMode()` 单点的例外。
12. **REV 边界（§14）**：锁等待超时归 `INTERNAL_ERROR`/internal/3（REV-95-008，含 `flow archive` save 异常 legacy 例外；**v1.2.3-stage-99 补 E2E 证据：test-only env seam + `test/cli/lock-timeout.test.ts`**）；**并发退出机制已于 v1.2.3-stage-99 统一（REV-95-009）**——JSON：emit → `process.exitCode=2` → return；非 JSON：`process.exit(2)` 逐字不变（§14.2 已同步）。

## 12 行 `code → kind → exitCode` 映射（摘要）

`NO_INIT` / `INVALID_ARGUMENT` / `STAGE_NOT_FOUND` / `PHASE_TRANSITION_ILLEGAL` / `PHASE_PATH_NOT_FOUND` / `BLOCKING_REVIEWS` / `ARCHIVE_GATE_REJECTED` / `PROJECT_NOT_FOUND` / `ARCHIVE_FAILED`（stage-97 启用）→ `refusal`/`1`；`FLOW_CONCURRENT_CONFLICT` → `refusal`/`2`；`ARCHIVE_WRITE_FAILED` / `INTERNAL_ERROR` → `internal`/`3`。完整表以 `src/core/errors.ts` 与 `docs/json-contract.md` §3 为准（逐行断言 `test/cli/error-envelope.test.ts`）。

## 不变量

- 既有出口（stage-97 前 **19** 个）**零删除 / 零重排 / 类型零改**；人类输出逐字不变（已登记增量除外）；`req list` / `flow archive` 仅末位/定锚追加。
- 退出码 `0/1/2` 语义零改动；`3` 仅用于原本未纳入语义表的内部错误路径。
- 错误码表**单一来源**；命令层禁硬编码字符串码。
- `--json` 模式检测与项目锚定均**单点**；命令层不得自建第二套 argv 解析。
- 存量 `flow.json` 零注入；不引入第三方依赖。

## 维护触发

| 变更 | 需同步 |
|------|--------|
| 新增 / 修改 `--json` 出口或字段 | `docs/json-contract.md` §5 冻结表 + `test/cli/json-contract.test.ts` + 本页出口计数 |
| 新增错误码 / 调整 kind 或退出码 | `src/core/errors.ts` 映射表 + 契约 §3 + `test/cli/error-envelope.test.ts` + `CHANGELOG` |
| 新增全局选项 / 预扫描取值选项 | `src/cli/index.ts` + `project-option.ts` / `json-output.ts` 的 `VALUE_OPTIONS` + help i18n 双键 + 本页 |
| legacy 载荷追加键 | 末尾追加（禁重排）+ 契约双形态段 + 相关失败载荷断言 |

## 变更历史

| 版本 | 阶段 | 变更 |
|------|------|------|
| v1.2.3 | stage-99 | **并发 JSON 退出统一（REV-95-009）**：`handleConcurrentConflict` JSON 分支 emit → `process.exitCode=2` → return；非 JSON 分支逐字不变；`handleAddStageError` `never → void` + 10 调用点显式返回；§14.1 补锁超时 E2E 证据（test-only env seam）；33/34 与退出码语义零改动 |
| v1.2.2 | stage-98 | 文档收口：33/34 计数与多载体同步核对；无源码变更。`--version --json`（三键）单列，不计入 33 出口 / 34 注册选项 |
| v1.2.2 | stage-95 | 新建：契约助手、18 出口冻结、错误层（12 行映射 / 退出码 0-3 / legacy `errorKind`）、`--version --json`、全局 `--project` |
| v1.2.2 | stage-96 | `flow next` 第 19 出口；`stages[]` 5 调度属性 / `phases` 2 档位键（§12）；注册选项 20 |
| v1.2.2 | stage-97 | 13 读命令面 + `archive <stage>` = 14 新出口（#20~#33）；`req list` / `flow archive` 增量；§13 读命令细则 + §14 REV 边界；**33 出口 / 34 注册选项** |
