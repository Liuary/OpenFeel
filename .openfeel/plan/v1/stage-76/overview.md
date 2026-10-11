# v1.1.7-stage-76

## 目标

实现「标记双读者」第 ② 位读者——Agent 读 `status.md「工作流模式」`自知是否被调度/是否轻量化：`feel.md`×4（2 harness × 2 语言）调度纪律（fast 跳过 schemer/tester、**planner 产出后必经计划审查（`plan_review`）**、reviewer 单轮〔计划审查 + 代码审查〕、planner/archiver 轻量）[需求变更 2026-10-11 修订][REV-76-006 修订] + subagent 模板模式感知（6 类 × 4 = 24 份）[REV-76-006 修订] + 中立共享 skills 收口（cli-usage 就地订正 L33/L43/L86）[REV-76-003 修订] + 全局约束层模式注记（`agents-md` / `claude/constraint` ×4）[REV-76-001 修订] + build 重生成（生成物 2 份：`template-loader.ts` + `update.ts`，禁手改）[REV-76-002 修订] + 静态断言（4 份对称、24 份对称、full 关键串零回归、无「fast 跳过骨架」表述、fast transitions **9 条目含 `done`** 口径）[REV-76-004 修订] + **fast 快线表修订（T7：`plan_pending → plan_review` 必经 + 文案 5 处 + stage-74 断言同步）[需求变更 2026-10-11 修订]**。

## 依赖

- v1.1.7-stage-74
- v1.1.7-stage-75

## 操作方案

> 详见 `.openfeel/plan/v1/stage-76/plan.md`（T1~T7；执行序：**T7**→T1→T2→T3→T6→T4→T5 [需求变更 2026-10-11 修订]）；op 级拆分由 openfeel-schemer 定稿并落 `ops/deps.yaml`。
> 已定稿 op（方案层，落 `ops/deps.yaml`）：op-005 T7（执行序最前）→ op-001 `feel.md`×4 + 全局约束层（T1/T6）→ op-002 subagent 模板 ×24（T2）→ op-003 skills 收口 + build 重生成（T3/T4-build）→ op-004 静态断言 + 门禁（T4/T5）[REV-76-009 修订]。
> 注：fast 轻量化量化口径（Q4）**已于 2026-10-11 经用户确认**——底线句 + 保守（不写硬性数量上限）；`[Q4]` 追加句直接落文（见 `ops/op-002.md`）[REV-76-009 修订]。
> **[需求变更 2026-10-11 修订]** T7（fast 表必经 `plan_review`：引擎 `FAST_TRANSITIONS` 9 条目 + 文案 + 测试）**已裁定独立成 op-005、执行序最前**（方案层定稿并落 `ops/deps.yaml`）；T7-e 协同清单已由 op-005 步骤 5 吸收 [REV-76-009 修订]。
