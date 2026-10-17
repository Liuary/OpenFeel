# op-003 自测报告（v1.2.2-stage-96）

## 执行摘要

严格按 `.openfeel/plan/v1/stage-96/ops/op-003.md` 完成阶段末收口：i18n 969 键逐键核验、19 成功出口 / 20 注册 `--json` 选项与契约 §5/§12 终校、三处档位一致与空态复核、人类输出零回归取证（受控 HEAD 代码 vs 新代码，`flow status --verbose` 入矩阵）、REV-96-001~007 闭环登记、承接 REV 三分 0/5/2 复核、全量门禁与性能实测。**未新增业务代码、未发现产品缺陷；仅产出报告与证据。** 结论：通过（请安排 openfeel-reviewer 审查）。

## 实施步骤完成情况

- [x] 0. 起点记录：HEAD `25ebc4e`、`git status --porcelain`、`flow.json` / `status.md` SHA256、门禁基线入 `gate.log`。
- [x] 1. i18n 收口：17 个 `flow.next.*` 键各有 1 处源码消费；`help.flow.next` / `help.flow.next.json` 由 `applyHelpI18n` 消费（测试冒烟 `test/commands/flow.test.ts:3993`）；`lint i18n` = **969 键一致**；op-002 仅改 `help.flow.phases.json` 文本、未增键（diff 核验）。
- [x] 2. 契约复核：`json-contract.test.ts` 27 用例通过；`flow next` 12 键、`status.stages[]` 10 键、`phases` 9 键键序与契约逐字一致；三处档位一致；空态 12 键 / 阶段缺失 / 未初始化三态实测；20 个注册 `--json` 选项；契约计数 19/20 无漂移。
- [x] 3. 人类输出零回归：重跑 baseline 矩阵到 `after/**`；`flow status` / `--verbose` / `phases` / `advance --help` 受控逐字 diff 空；`--help` 两处有意增量登记；失败路径 3 条与旧代码逐字一致；`flow next` 新命令三态登记。
- [x] 4. REV-96-001~005 闭环（含 006/007）：证据落 `final-report.md` §⑥。
- [x] 5. 承接 REV 处置登记：完整表 + 三分结论；`plan.md §七`（行 170/178-180/183）与 `op-003.md §5`（行 85/92-96）逐行一致。
- [x] 6. 全量门禁：test / tsc / build ×2 / i18n / kb / version / 实跑矩阵 / 性能，原始输出入 `gate.log`。
- [x] 7. 变更集审计：本 op 零新增白名单外变更；`flow.json` / `status.md` 字节前后一致；`users` / `src/cli` / package / README / CHANGELOG 零改动；无第三方依赖。
- [x] 8. 终局报告十小节齐全：`final-report.md`。

## 自测清单验证

- [x] i18n：19 键逐键有消费；969 一致；无死键 / 无多余键。
- [x] 契约：19 成功出口 / 20 注册选项；`#19` 与 §5 #19 一致；「18 个成功出口」仅存于 §1 不变量行。
- [x] 决策权威：`responsibleAgent` 与 `mapPhaseToAgent` 同源（`getResponsibleAgent` 委托）；`legalNextPhases` 全部被 `advance --dry-run` 接受；`blockingReviews` 阶段域正确（测试覆盖）；`guards` 顺序固定；空态 12 键齐全。
- [x] 零回归：`flow status` / `--verbose` / `phases` / `advance --help` 受控 diff 空；`--help` 两处差异已登记。
- [x] 只读：`flow next` 前后 `flow.json` SHA256 一致；测试断言 `save` 零调用（`flow.test.ts:3978`）。
- [x] 门禁：全部全绿并登记（见下）。
- [x] 越界：本 op 仅新增 `.openfeel/tmp/stage-96/**`；`flow.json` / `status.md` / `plan.md` / REV 文件零改动。
- [x] 报告：终局报告十小节齐全；三分结论明确；遗留可追溯。

## 门禁数值

| 项 | 实测 |
|----|------|
| `npm test` | 74 文件 / **1809 用例**，0 failed / 0 skipped |
| `npx tsc --noEmit` | 0 |
| `npm run build` ×2 | 幂等（dist SHA256 一致；src 无新增变更；template-loader/update diff 空） |
| `lint i18n` | 969 键一致 |
| `lint kb` | 0 过期 / 604 引用 |
| `--version` | 1.2.1 |
| `flow status --json` 性能 | 5 次中位数 **393ms**（< 1s） |

## 产出文件

- `.openfeel/tmp/stage-96/final-report.md`
- `.openfeel/tmp/stage-96/human-output-diff.md`
- `.openfeel/tmp/stage-96/gate.log`
- `.openfeel/tmp/stage-96/after/**`（快照、受控 HEAD 对照、失败路径、测试/门禁日志）
- `.openfeel/tmp/op-003-test-report.md`（本报告）

未修改 `docs/json-contract.md` 或 `test/**`（门禁未暴露缺口；D-96-17）。

## 前置校验结果

- **方式**：`openfeel flow health --quick`（退出 0，快速模式健康检查通过；无 errors / warnings）。
- **phase**：`exec_running`；`current.op = v1.2.2-stage-96.op-003`（与 op-id 匹配）。
- **结论**：通过。
- **方案完整性**：`## 目标` / `## 实施步骤` / `## 产出文件` / `## 自测清单` / `- **阶段**` / `- **最多重试**` 六项齐备。
- **流转合法性**：`exec_running` 属合法枚举；前置 op-001 / op-002 均 hard 已完成；本 op 恒阶段末位。

## 偏差记录

1. **无跳步违规**。
2. **op-003 §6「本仓 17 阶段」为陈旧值**：实测 `flow.json` 为 **21 stages**（`counts={total:21,done:18,active:3}`）。按实测登记，不作为缺陷（计划基线亦为 21 stages）。
3. **基线 vs 重跑的数据态差异**：baseline 于 op-001 第 0 步采集（当前操作 op-001、日志 504），本 op 重跑时数据已推进（op-003、日志 506），故 `flow status` / `--verbose` 存在数据态差异。为满足 D-96-18「逐字 diff 空」硬判据，追加**受控对照**：`git archive HEAD` 导出源码 → 临时目录构建 → 以本仓为 cwd 运行 HEAD 代码 → 与新代码同数据逐字 diff（四项均空）。差异逐条登记于 `human-output-diff.md` §3。
4. **既有变更集非本 op 引入**：`test/cli/output-encoding.test.ts`（op-002 已登记偏差）、`.openfeel/tmp/op-002-test-report.md`（op-002 产出）、`.openfeel/plan/v1/stage-96/plan.md`（planner 修订 1）、`flow.json` / `logs` / `metrics` / `checkpoints`（工作流数据）均在 op-003 开始前已存在；本 op 起点与终点的 `git status --porcelain` 对比仅新增本报告 `.openfeel/tmp/op-003-test-report.md`（executor 角色强制的自测报告，受版本跟踪，与 op-002 同名报告同范式）。`after/**` 等证据位于被忽略的 `.openfeel/tmp/stage-96/**`。
5. **证据文件扩展**：在允许的 `after/**` 下追加 `human-diff-raw.log`、`npm-test.log`、`check-json.log`、`status-now.json`、`head-*.out`、`fail-*`、`dist-hash-*.txt`、`same-source.log`，用于可复现取证。
6. **未 commit / push**（任务边界）；`ops/` 仍为未跟踪，阶段提交须精确 `git add .openfeel/plan/v1/stage-96/ops/`。

## 可审查移交

自测通过，未发现需修复的产品行为问题。请安排 **openfeel-reviewer** 审查；本 op 不推进 phase、不直写 `flow.json`、不手改 `status.md`。
