# v1.2.2-stage-95 归档摘要 — JSON 输出契约与错误封装基础设施

- **阶段**：`v1.2.2-stage-95`（v1.2.2 四阶段之一 · 基础设施；工作流模式 full）
- **归档人**：openfeel-archiver ｜ **归档时间**：2026-10-17 ｜ **上游**：`v1.2.1-stage-94`（done）
- **关联需求**：REQ-001（CLI 机器可读契约与调度决策下沉（DSH 适配器需求））
- **阶段定位**：为 v1.2.2 全版本提供唯一契约助手与错误出口；本阶段不改任何既有命令的人类输出与业务判定。
- **归档结论**：测试通过（必验 8/8，Bug 0）；审查通过（REV-95-001~007 闭环，008/009 非阻塞转 stage-97）；门禁全绿。**阶段可置 done（phase 推进由 Feel 执行）**。

## 一、阶段目标

1. 冻结 18 个既有 `--json` 成功出口契约：stdout 单文档、`schemaVersion:1` 运行时首键、键序/键集不增删不改类型；条件键按「恒在键 / 条件出现键」二选一登记。
2. 新增统一错误层：稳定 `code` + `kind ∈ {refusal,internal}`；退出码 **0 成功 / 1 预期拒绝 / 2 并发冲突（语义零改动）/ 3 内部错误（新增）**；legacy `{error:'...'}` 载荷保留 `string` 类型与键序，仅末尾追加 `errorKind`；12 行 `code → kind → exitCode` 映射表单一权威。
3. 新增两个独立入口能力：`--version --json`（`{schemaVersion,version,node}`）与全局 `--project <path>`（argv 预扫描 + `process.chdir` 单点注入）。
4. 零回归：人类输出逐字不变（已登记增量除外）；既有 18 出口零删除 / 零重排 / 类型零改；存量 `flow.json` 零注入。

## 二、op 与执行序

执行序恒为 **op-001 → op-002 → op-003 → op-004**（hard 依赖 + 文件互斥；`ops/deps.yaml` 声明共享文件：flow.ts / index.ts / instructions.ts / i18n-data / 相关测试）。

| op | 主题 | 核心交付 | 结果 |
|:--:|------|----------|:--:|
| op-001 | JSON 契约助手、18 出口冻结审计与契约正文 | `json-output.ts`（`withSchemaVersion` / `emitJson` / JSON 模式单点 / argv 扫描）、`instructions` 首键、`flow archive show` 首键重定位（G-1）、条件键 `null` 占位、`docs/json-contract.md`、契约测试 | done |
| op-002 | 错误层与 `runCli` 统一入口 | `src/core/errors.ts`（12 行码表内嵌 kind/exitCode）、`failCli/failRefusal/failInternal`、JSON/非 JSON 统一 catch（exit 3）、Commander 用法错误 → `INVALID_ARGUMENT/1`、`flow advance` 本地 `--json`、legacy 末尾 `errorKind`（`archive-write-failed → internal/3`） | done |
| op-003 | 全局 `--project` 与 `--version --json` | `project-option.ts`（提取 / 校验 / chdir）、根选项、`knowledge dedup` 保留本地声明 + `resolveProjectPathForCommand` 单点、`--log-file` 原始 cwd、预扫描成对防误判、version JSON 短路 | done |
| op-004 | i18n 收口、零回归取证与阶段门禁（阶段末 op） | i18n 恰 5 新键、人类输出 25 条基线 diff、C1~C6 同步核对、门禁全量、测试隔离修复（反守卫基线化） | done |

## 三、变更文件

**新增（7）**：`src/core/errors.ts`、`src/commands/shared/json-output.ts`、`src/cli/project-option.ts`、`docs/json-contract.md`、`test/cli/json-contract.test.ts`、`test/cli/error-envelope.test.ts`、`test/cli/project-option.test.ts`。

**修改（15；`git diff --stat HEAD` = +737 / −129）**：`src/cli/index.ts`、`src/commands/flow.ts`、`src/commands/instructions.ts`、`src/commands/knowledge.ts`、`src/commands/req.ts`、`src/commands/setup.ts`、`src/commands/shared/errors.ts`、`src/core/i18n-data/{zh-CN,en}.ts`、`test/cli/index.test.ts`、`test/commands/{flow,instructions,knowledge,req,shared-errors}.test.ts`。

> `test/commands/req.test.ts` / `flow.test.ts` 的修改含 op-004 测试隔离修复：真实工作区存在合法 `REQ-001` 时，5 处「需求目录不存在」反守卫改为递归快照等价断言；删除 1 处被 `REAL_FLOW_RAW` 字节断言严格覆盖的 `not.toContain('"requirements"')`。产品行为零改动。

## 四、门禁实测值

| 门禁 | 实测值 | 结论 |
|------|--------|:--:|
| `npm test` | **74 文件 / 1779 用例 / 1779 passed / 0 failed / 0 skipped**（exit 0） | PASS |
| `npx tsc --noEmit` | 0 错误（exit 0） | PASS |
| `lint i18n` | **950 键一致**（新增 5 键 zh/en 成对） | PASS |
| `lint kb` | **0 过期 / 624 引用**（阶段门禁值；归档轮复跑 **0 过期 / 604 引用**） | PASS |
| `npm run build` ×2 | 两次 exit 0；`dist/**` 排序 sha256 汇总均为 `68b4cddad18f283f2bca4c49ba283007822c0f3792985307b50fe42a9b5bd0f0`（幂等） | PASS |
| `--version` | `1.2.1`（版本收口归 stage-98） | PASS |
| 新增契约测试 | json-contract 24 + error-envelope 14 + project-option 13 = **51/51** | PASS |
| 人类输出零回归 | stderr / 退出码空 diff；stdout 20/25 逐字一致，5 条差异 = 3 条运行态数据漂移 + 2 条已登记有意增量（`--help` 的 `--project` 行、`flow advance --help` 的 `--json` 行） | PASS |

## 五、审查轮次与 REV 闭环

| 轮次 | 结论 | 条目与处置 |
|------|:--:|------|
| 计划审查（首轮） | 退回 `plan_pending` | REV-95-001（退出码语义冲突，blocking）/ 002（legacy 双形态 + 映射表缺失，blocking）/ 003（`--project` 四项边界）/ 004（首键构造序与条件键豁免判据） |
| 计划审查（复审） | 通过 `plan_passed` | 001~004 全 closed（用户裁定 R-cp-1 退出码 0/1/2/3、R-cp-2 legacy `errorKind`；扩展优先原则 C1~C6 落地）；新开 REV-95-005（两处审计表旧口径，low） |
| 方案审查 | 通过 `scheme_passed` | REV-95-006（`mutual_exclusions` 遗漏，medium → resolved：串行执行未受影响，纪律转 stage-96+）/ 007（三项执行期防待，low → resolved） |
| 代码审查 | 通过 `review_passed` | 001~004 closed 复核；005 维持 open（roadmap 旧口径 → stage-98）；006/007 resolved；新开 008（文件锁超时归 `INTERNAL_ERROR/3`，low）/ 009（并发 JSON 分支 `process.exit(2)`，low） |
| 正式验收 | 通过 `test_passed` | 必验 8/8；Bug 数 0；非阻塞观察 4 项（en 文案内嵌中文标签属本阶段前既有；`--version --project` 组合差异建议 stage-98 文档说明；status.md 滞后由归档同步；roadmap 旧口径转 stage-98） |

## 六、REV 三分表（承接确认）

| REV | 级别 | 处置 | 落点 |
|-----|:--:|------|------|
| REV-95-001~004 | blocking×2 / non-blocking×2 | **本阶段闭环**（计划/代码/测试三层证据） | stage-95 |
| REV-95-005 | low | **转出**：roadmap P1-2 行旧口径「收敛为全局选项」 | **本阶段已修正**（见 §八）；其余载体核对归 stage-98 |
| REV-95-006 | medium | resolved（串行执行未受影响） | 纪律转 stage-96+ 方案期 |
| REV-95-007 | low | resolved（三项落实；7.1 并发分支残留转 009） | stage-95 |
| REV-95-008 | low | **转出**：文件锁等待超时归 `INTERNAL_ERROR/internal/3` 的契约边界登记 | stage-97（契约 §8 补一行；如需专用码再评估） |
| REV-95-009 | low | **转出**：`handleConcurrentConflict` JSON 分支 `process.exit(2)` 与 `failCli` 机制统一 | stage-97（接入更多并发 JSON 路径时改造或登记即时退出形态） |

## 七、验收结果

- 必验 8/8：门禁独立复跑、18 出口（18/18）、错误封装（16/16 断言）、`--version --json`、`--project`（12/12）、扩展优先 / 零回归、测试质量（反守卫未弱化）、REV 意见。
- **Bug 数 0**；阻塞项 0；4 项非阻塞观察均不改变本期契约。
- 关键实证：`instructions` 与 `flow archive show` 首键重定位为已登记有意变更（C1 / C1b-G-1）；legacy `error` 恒 `string`、`errorKind` 恒末键；并发冲突 `kind:'refusal'` + exit 2；内部错误 exit 3（JSON / 非 JSON 双模式）。

## 八、计划回填与文档同步

- `.openfeel/plan/v1/v1.2.2/plan.md`：新增「阶段执行进度（归档回填）」表；M49 = done（2026-10-17）。
- `.openfeel/roadmap/v1.2.2.md`：进度表 M49/stage-95 = **done**；**P1-2 关键裁定行修正**为「保留本地声明，全局同名选项并行提供（`optsWithGlobals` 单点读取）」（REV-95-005 收口）。
- manual：`cli/commands.md`（全局 `--project` / `--version --json` / 错误封装 / 退出码 0-3）、新增 `core/json-contract.md`、`index.md` 模块树与维护规则。
- 知识库：architecture 2 条、patterns 2 条、troubleshooting 1 条（去重最高相似度 < 9%，均新增）。

## 九、遗留项

1. **REV-95-005 收口**：roadmap L31 旧口径已在本归档轮修正；`docs/commands.md` / manual 多载体 / `openfeel-cli-usage` skill 快照 / README×3 / CHANGELOG 的 C1~C6 同步清单仍归 **stage-98**（同版本内收口，不得让既有消费者静默失效）。
2. **REV-95-008 / 009** 转 **stage-97**（非阻塞；契约边界登记与并发错误出口机制统一）。
3. 观测项：`--version --project <非法>` 与 `--version --json --project <非法>` 行为差异未入契约，建议 stage-98 文档顺带说明。
4. `--version` 仍为 1.2.1（版本收口归 stage-98）；本阶段不引入第三方依赖、不改 CI。

## 十、承接声明

- 本阶段为 **v1.2.2 地基**：stage-96（`flow next` / `stages[]` 调度属性）、stage-97（读命令 `--json` 全量补全 + `archive <stage> --json`）复用 `json-output.ts` / `core/errors.ts` / `failCli` / 契约冻结表与 12 行映射表。
- 既有 18 出口契约、退出码 0/1/2 语义、legacy `error` 字符串载荷、人类输出与 phase 枚举均保持兼容；新增能力均为扩展。
- 阶段最终 `phase=done` 由 Feel 经 CLI 推进；归档官未改源码 / 测试 / flow.json，未 commit / push。
