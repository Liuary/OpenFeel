# 自测报告 — op-004（单一取表点接入与既有测试对齐 + 全门禁，T3 + T7 + T8）

- **执行时间**：2026-10-11 17:20
- **执行 Agent**：openfeel-executor
- **重试次数**：2（首跑全量 22 红点〔core 13 + CLI 9〕→ R-FIX 对齐；随后 T9 因 helper 作用域 ReferenceError → 提至模块级）

## 执行摘要
`getValidTargets(fromPhase, mode)` mode 必传 + 四调用点显式 stage 派生 mode + R-FIX 既有测试对齐 + T7.2/T7.3/T7.10/T7.11 新增；T8 全门禁绿（67 文件 / 1239 用例 / 0 failed / 0 skipped）。

## 实施步骤完成情况
- [x] T3-1 `getValidTargets` 签名 mode 必传 + 表源 `resolveTransitionsForMode(mode)`
- [x] T3-2 `hasTransition` 传 `resolveStageWorkflowMode(stageName).value`
- [x] T3-3 `getAvailablePhases` 同
- [x] T3-4 `findPhasePath` BFS 外解析一次（`resolveStageWorkflowMode(key)`）
- [x] T3-5 `canAdvance` 传 `resolveStageWorkflowMode(parts.stageId).value`
- [x] T3-6 `buildDownstreamPhases` 注释（间接消费者声明）
- [x] T3-2 R-FIX core 7 处 + CLI 文件级 beforeEach
- [x] 新增 describe「单一取表点（stage-74 op-004）」T7.2a~e / T7.3a~b / T7.10 / T7.11
- [x] T3-附 契约登记（gate-report §五；deps.yaml 已预置，核对一致）
- [x] T8 全门禁 + 检索复核 5 条 + 报告 2 份

## 自测清单验证
| 检查项 | 结果 | 备注 |
|--------|:--:|------|
| `npx tsc --noEmit` | ✅ | 0（4 调用点均已显式传 mode） |
| `vitest run flow-manager.test.ts` | ✅ | 292 passed |
| `vitest run commands/flow.test.ts` | ✅ | R-FIX 生效全绿 |
| `npm test` | ✅ | 67 文件 / 1239 用例 / 0 failed / 0 skipped |
| `npm run build` ×2 | ✅ | 幂等；`git status --porcelain src/` 两次逐字相同 |
| `lint i18n` / `lint kb` | ✅ | 775 / 0 |
| `flow phases --json` | ✅ | 既有键逐字 + `transitionsDiff.missing=['review_passed\|test_passed']` |
| `config effective` | ✅ | 四键 |
| 检索复核 5 条 | ✅ | #3 为 phase 枚举串误命中（转移表副本 = 0） |
| `git diff pipeline.yaml` 空 / `config.yaml` 仅 1 行 | ✅ | — |
| `--version` | ✅ | 1.1.6 |
| 报告 2 份 | ✅ | gate / selftest |

## 产出文件
- `src/core/flow-manager.ts`、`test/core/flow-manager.test.ts`、`test/commands/flow.test.ts`
- `.openfeel/tmp/stage-74-gate-report.md`、`.openfeel/tmp/stage-74-selftest-report.md`

## 前置校验结果
- 通过（health exit 0）

## 偏差记录
- 详见 `stage-74-selftest-report.md` §三（5 条）。op-004 相关：R-FIX 实际落点 7 core + 1 CLI；检索 #3 误命中说明。
- 跳步违规：无。
