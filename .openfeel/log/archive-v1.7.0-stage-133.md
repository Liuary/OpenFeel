# 归档摘要 — v1.7.0-stage-133

- **归档时间**：2026-11-24T18:12:00.060Z
- **阶段名称**：v1.7.0-stage-133
- **版本**：v1.7.0
- **阶段状态**：done
- **依赖阶段**：无
- **关联需求**：REQ-061, REQ-062, REQ-063, REQ-064, REQ-065, REQ-066, REQ-067

## 已完成需求

| ID | 标题 | 优先级 | 更新时间 |
|----|------|--------|----------|
| REQ-061 | 发布链路一条命令：release 脚本 + 归档产物提交 + CHANGELOG 生成 | P0 | 2026-11-24T18:11:04.943Z |
| REQ-062 | 文档类变更写白名单 + 统一 GateOverride 审计 | P0 | 2026-11-24T18:11:08.041Z |
| REQ-063 | 需求审查相位 + req 命令 JSON 错误码 | P0 | 2026-11-24T18:11:10.853Z |
| REQ-064 | req plan 生成 + req body --from + lint fill 计划骨架 | P1 | 2026-11-24T18:11:13.641Z |
| REQ-065 | 测试夹具工厂 + dashboard 流程债面板 | P1 | 2026-11-24T18:11:20.368Z |
| REQ-066 | DSH 派发闭环（finish）+ 遵守率指标 | P1 | 2026-11-24T18:11:22.624Z |
| REQ-067 | guard wrapper 加固：脚本内容静态分类 | P0 | 2026-11-24T18:11:25.720Z |

## 审查 / 验证

### 需求审查与验证

| ID | 审查 | 审查者 | 验证 | 种类 | 验证者 | 验证说明 |
|----|------|--------|------|------|--------|----------|
| REQ-061 | pass | code-reviewer-v17 | pass | test | code-reviewer-v17 | 发布链路一条命令可用，默认预演零副作用，认证缺失早停；归档白名单含 7 项。（证据：test/scripts/release.test.ts 10 passed；node scripts/release.mjs --dry-run --skip-build exit 0（market/archive-commit/tag planned+paths，零 git 动作）；npm test 2677 passed） |
| REQ-062 | pass | code-reviewer-v17 | pass | test | code-reviewer-v17 | 文档类白名单与统一 GateOverride 审计均有两态/三入口取证。（证据：dsh/test/guard.js 193/193（A62.1 两态 5 条）；test/core/flow-manager.test.ts + test/commands/flow.test.ts 三入口审计用例通过；npm test 2677 passed） |
| REQ-063 | pass | code-reviewer-v17 | pass | test | code-reviewer-v17 | review_pending 与 JSON 错误码落地，done 门语义保持。（证据：test/core/req.test.ts + test/commands/req.test.ts 状态机矩阵/两码/--json 形态通过；test/cli/error-envelope.test.ts 20 行；出口 51/52 三处一致；npm test 2677 passed） |
| REQ-064 | pass | code-reviewer-v17 | pass | test | code-reviewer-v17 | req plan / body --from / lint fill --fix-plan / 多行修复均有取证。（证据：test/commands/req-plan.test.ts + test/core/plan/req-plan.test.ts + test/commands/req-body.test.ts 通过；dsh verify 136/136（多行 --text 经 adapter 临时文件）；npm test 2677 passed） |
| REQ-065 | pass | code-reviewer-v17 | pass | test | code-reviewer-v17 | 夹具工厂与 dashboard 流程债同源可复现。（证据：test/fixtures/factories.test.ts + test/commands/dashboard.test.ts 30 passed；真实仓 flowDebt.emptyBody=48=lint fill empty、missingPlan=0=0；npm test 2677 passed） |
| REQ-066 | pass | code-reviewer-v17 | pass | test | code-reviewer-v17 | 派发闭环已实际使用（d-0002~d-0012 全部 finish），closedRatio 可从 0 到 1。（证据：test/core/adherence.test.ts + test/commands/lint.test.ts 通过；真实仓 lint adherence --json 输出四指标（main_write_ratio 只计写、sync_gap、violation_rate）；dsh verify 136/136） |
| REQ-067 | pass | code-reviewer-v17 | pass | test | code-reviewer-v17 | wrapper 绕过面收敛，仍存绕过面已如实登记。（证据：dsh/test/guard.js 193/193（A67 用例 20 条 + 2 check）；node test/preflight.js 10/10；node test/contract.js 54/54；npm test 2677 passed） |

### 阶段验证

- 阶段验证：test / pass（by code-reviewer-v17，2026-11-24T18:11:46.682Z）：v1.7.0 十三项优化全部落地：发布链路、文档白名单与 GateOverride、需求审查相位与 JSON 码、req plan/body --from、夹具工厂与 dashboard 流程债、派发闭环与遵守率、guard wrapper 加固；偏差已回写 plan §八。（证据：npm test 106 文件/2677 passed；npx tsc --noEmit 0；npm run build 0（模板一致性 3/3）；dsh contract 54·verify 136·guard 193·preflight 10 全 exit 0；lint i18n 1339 键；node scripts/release.mjs --dry-run --skip-build exit 0；openfeel --version 1.7.0；独立复审 APPROVE（0 未闭环 blocking））

## 操作产出

| ID | 标题 | 状态 | 尝试次数 |
|----|------|------|----------|
| (无) | - | - | - |

## 审查记录

| ID | 标题 | 状态 | 优先级 |
|----|------|------|--------|
| REV-001 | [blocking] 计划审查 REJECT：6 blocking + 4 major（REV-P01..P10 已修订） | resolved | medium |
