# op-002 自测报告（v1.2.2-stage-96）

## 执行摘要

按 `ops/op-002.md` 完成 T3（`flow status --json.stages[]` 追加 5 个调度属性）+ T4（`flow phases --json` 末位追加 2 个档位消歧键）+ 契约 §5/§6/§12 同步 + 测试同步。既有键序零改、人类输出零改。全量门禁通过（74 文件 / 1809 用例，0 failed）。

## 实施步骤完成情况

- [x] 0. 前置核对：op-001 已落地（`DEFAULT_EFFECTIVE_REVIEW_TIER` / `getResponsibleAgent` / `flow next` 12 键正常）；基线键序从 `.openfeel/tmp/stage-96/baseline/*.out` 提取（与改造前实测一致）。
- [x] 1. 新增 `summarizeOpStates`（total / byState 仅观测态、无零值键、空态 `{total:0,byState:{}}`）。
- [x] 2. `buildStatusJson` stages map 追加 5 字段，固定 10 键序；既有 5 键与顶层 4 键零改；不缓存。
- [x] 3. `flow phases --json` 末位追加 `displayReviewTier` / `effectiveReviewTier`，既有 7 键逐字保留；人类分支零改动。
- [x] 4. `help.flow.phases.json` zh/en 文案补两键名，**不增键**（i18n 969）。
- [x] 5. `docs/json-contract.md` §5 #1/#5、§6.11/§6.12、§12.2/§12.3（并补 §12.4 三处一致）。
- [x] 6. `test/commands/flow.test.ts`：T7.11⑤ 7→9 键、T90.5 7→9、T92.6 追加 display/effective；新增 6 项用例（10 键序 / 空态 / fast 同源 / byState 零值键 / phases 消歧 / 人类输出零回归）。
- [x] 7. `test/cli/json-contract.test.ts`：#1 扩展 stages[] 10 键 + 值；#5 扩展 9 键 + fast 语义。
- [x] 8. 定向测试 / tsc / build ×2 / i18n / 全量 npm test / 耗时实测均完成（见 `stage-96/op-002-report.md`）。

## 自测清单验证

- [x] 键序：`stages[]` 10 键精确序；`flow phases --json` 9 键精确序；`flow status --json` 顶层 4 键不变（实跑 + 断言双证）。
- [x] 语义：`workflowMode` 与 `flow mode --stage` 同源（测试交叉断言）；`reviewTier = MODE_DERIVED_TIER[workflowMode]`；`effectiveReviewTier` 恒 `full`；`opsSummary` 与 `ops` 同源、空态正确、无零值键（含空串 state 用例）。
- [x] 只增不改：既有 5 字段 / 7 键类型与顺序由精确 `toEqual` 断言冻结；`git diff` 确认改造仅在 JSON 对象末位追加。
- [x] 人类输出：`flow phases` 与基线逐字 diff 空；`flow status` / `--verbose` 仅数据态差异，标签序列一致，无新字段泄漏。
- [x] 契约：§5 #1/#5、§6.11/§6.12、§12.2/§12.3 与实测一致；无「7 键」陈旧描述残留。
- [x] 门禁：tsc 0 / 定向 203 全绿 / 全量 1809 全绿 / i18n 969 / build ×2 幂等 / 无构建产物入 src。

## 产出文件

- `src/commands/flow.ts`
- `src/core/i18n-data/zh-CN.ts`
- `src/core/i18n-data/en.ts`
- `docs/json-contract.md`
- `test/commands/flow.test.ts`
- `test/cli/json-contract.test.ts`
- `test/cli/output-encoding.test.ts`（偏差 1）
- `.openfeel/tmp/stage-96/op-002-report.md`
- `.openfeel/tmp/op-002-test-report.md`

## 前置校验结果

- **方式**：`openfeel flow health --quick`
- **phase**：`exec_running`；`current.op = op-002`（与 op-id 匹配）
- **结论**：通过（退出码 0；无 errors / warnings）
- **方案完整性**：`## 目标` / `## 实施步骤` / `## 产出文件` / `## 自测清单` / `- **阶段**` / `- **最多重试**` 六项齐备。

## 偏差记录

1. **追加文件 `test/cli/output-encoding.test.ts`**（未列于 op 产出文件）：全量 `npm test` 发现 E-2② 断言 `flow phases --json` 顶层 7 键。该断言是本次有意增量（末位追加 2 键）的必然受影响面，仅更新既有期望值 7→9 并补 `displayReviewTier`/`effectiveReviewTier` 断言，不改业务语义。属「既有断言更新（只改期望）」的同类处置。
2. **基线键序文件缺失**：`baseline/` 下无 `flow-status-json.keys.txt` / `flow-phases-json.keys.txt`，按 op 步骤 0 的兜底条款，从同目录 `flow-status-json.out` / `flow-phases-json.out` 快照提取键序（与改造前实跑一致）。
3. **行号漂移**：op-002 引用的 `flow.ts:455-461` / `:2551-2557` 在 op-001 后漂移为 `:560-566` / `:2654-2660`，已按内容特征（`options.json` 分支 / `buildStatusJson`）定位。
4. **`git status --porcelain src/` 非空**：op-001 与 op-002 源码改动均在工作区（本 op 不得 commit），故不可能为空；以「构建未产生 src 内新文件/产物、dist 未被跟踪」作为等价判定。
5. 未 commit / push，未改 flow.json、未推进 phase。
