# op-003 自测报告（v1.2.2-stage-95）

- **执行者**：openfeel-executor
- **方案**：`.openfeel/plan/v1/stage-95/ops/op-003.md`（前置 op-001 / op-002 hard 已满足）
- **结论**：通过；可交回调用方安排 openfeel-reviewer 审查。

## 执行摘要

按 op-003 实现全局 `--project <path>`（预扫描 + 单点 chdir + 目录校验 + 错误封装 + 单点解析）与 `--version --json`（三键单文档）。落实 REV-95-003 四项边界：语言按目标项目、`--log-file` 按原始 cwd、`--project`/`--json` 预扫描成对防误判、单进程单命令前提（文件头/函数注释登记）。未改 bin、未改 phase 枚举/转移表、未新增依赖、未 commit。

## 实施步骤完成情况

- [x] 1. i18n 双表新增 4 键：`common.projectNotFoundTmpl` / `common.projectMissingValueTmpl` / `common.projectConflictTmpl` / `help.global.project`（zh/en 成对；en 无 CJK）。
- [x] 2. 新增 `src/cli/project-option.ts`：`extractProjectArgs` / `extractProjectArg` / `applyProjectOption` / `resolveProjectPathForCommand` / `resetProjectRootForTest`（复用 `scanArgv`，无第二套扫描）。
- [x] 3. `src/cli/index.ts`：根选项追加于 `--debug` 之后；runCli 顺序 `setJsonMode → version JSON 短路 → applyProjectOption → logCliStart → emitGlobalDeployCheck → parse → logCliDone`。
- [x] 4. `src/commands/knowledge.ts`：本地 `--project` 声明逐字保留；动作改 `command.optsWithGlobals()` + `resolveProjectPathForCommand`（禁用 `options.project`）。
- [x] 5. 测试：新增 `test/cli/project-option.test.ts`（13 例）；`test/cli/json-contract.test.ts` 增 `--version --json` / `-v --json` / 纯文本 3 例；`test/commands/knowledge.test.ts` 增同名双注册 1 例。

## 自测清单验证（实测值）

- `npx tsc --noEmit` → **0 错误**。
- `npx vitest run test/cli/project-option.test.ts test/cli/json-contract.test.ts test/commands/knowledge.test.ts` → **3 文件 / 45 用例全绿**。
- `npm test` → **74 文件：72 通过 / 2 失败；1779 用例：1730 通过 / 49 失败**。
  - 失败项集合 = `test/commands/req.test.ts` 48 + `test/commands/flow.test.ts` 1，均为 REQ-001 合法存在导致的真实工作区反守卫失败（与 op-002 交接一致，**无新增**；归 op-004 修复）。
- `npm run build` ×2 → dist 全量 JS sha256 聚合值两次一致：`7cd0fc2b6bce67ed5290b870f4ea1bc1b0e8c75480e9829c73a3259e2ccfdf92`（幂等）。
- `node bin/openfeel.js lint i18n` → **✅ 950 键一致**（946 + 4）。新增键逐名：`common.projectNotFoundTmpl`、`common.projectMissingValueTmpl`、`common.projectConflictTmpl`、`help.global.project`。
- `node bin/openfeel.js --version --json` → `{"schemaVersion":1,"version":"1.2.1","node":"v24.18.1"}`（键序恰为 `schemaVersion,version,node`）；`--version` → `1.2.1`（纯文本不变）。
- `--project` 六场景实跑（A 未初始化 / B 已初始化）：
  - 前置 `--project B flow status --json` → 读到 B 的 `pipeline/stages`，首键 `schemaVersion`，exit 0。
  - 后置 `flow status --json --project B`、等号 `--project=B` → 同上，exit 0。
  - 不存在路径 → `PROJECT_NOT_FOUND` / `detail.reason=not-found` / exit 1。
  - 文件路径 → `PROJECT_NOT_FOUND` / `detail.reason=not-directory` / exit 1。
  - 缺失值 `--project --json` → `INVALID_ARGUMENT` / exit 1。
  - 多值冲突 `--project A --project B` → `INVALID_ARGUMENT` / `detail.values=[A,B]` / exit 1；同值重复允许。
- 语言边界：B `.info.json lang=en`，从 A 执行 `--project B flow current` → 英文输出（Global Status/Stage/…）。
- `--log-file` 边界：从 A 执行 `--project B --log-file logs/x.log flow current` → 写入 `A/logs/x.log`，`B/logs` 不存在；日志 `[project=B]`。
- `--version --json` + 非法 `--project` → 仍输出版本三键文档、exit 0（版本短路先于项目校验）。
- `--help --json` → 帮助文本照常输出（不拦截）；根 `--help` 唯一增量 = 新增 `--project <path>` 行。
- `knowledge dedup --help` → 本地 `--project <path> 目标项目根路径（默认当前目录）` 逐字不变。

## 产出文件（与方案声明一致）

- 新增：`src/cli/project-option.ts`、`test/cli/project-option.test.ts`
- 修改：`src/cli/index.ts`、`src/commands/knowledge.ts`、`src/core/i18n-data/zh-CN.ts`、`src/core/i18n-data/en.ts`、`test/cli/json-contract.test.ts`、`test/commands/knowledge.test.ts`
- 方案一致性比对：**8/8 一致，无遗漏、无超范围**（工作区其余改动均属 op-001/op-002 及计划/状态文件）。

## 前置校验结果

- **方式**：方案完整性人工核对 + `openfeel flow health --quick`（CLI，exit 0）。
- **phase**：`exec_running`（合法）；`current.op = v1.2.2-stage-95.op-003`（与任务 op-id 匹配）；重试次数 0。
- **结论**：通过（0 errors；无 warnings）。
- **方案完整性**：`## 目标` / `## 实施步骤` / `## 产出文件` / `## 自测清单` / `- **阶段**` / `- **最多重试**` 齐备。

## 偏差记录

- 无跳步、无超范围源码改动。
- `npm run lint:i18n` 在 `package.json` 中不存在（仅有 build/test/test:coverage/dev）；以方案命令 `node bin/openfeel.js lint i18n` 等效执行并取得 950。
- `extractProjectArg` 按 op-003 正文实现为「取最后一个出现值」；计划 T3 行文曾写「取首个」。以 op-003（方案期裁定 D-95-12）为准；该函数不被生产路径消费（`applyProjectOption` 处理全部值）。

## 交接给 op-004

- 失败集 49（req 48 + flow 1）按原计划由 op-004 的测试隔离修复收口。
- `lint i18n` 基线 950 已达成；人类输出 diff 仅 `--help` 新增 `--project` 一行（有意增量）。
- 未 commit / 未 push / 未推进 phase。
