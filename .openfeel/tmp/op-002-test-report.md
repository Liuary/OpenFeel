# 自测报告 — op-002（v1.2.0-stage-83）

- **执行时间**：2026-10-12 23:15
- **执行 Agent**：openfeel-executor
- **重试次数**：1（首次通过）

## 执行摘要
`flow-manager.ts` 对称回写两热点最小追加（8+/0-），补丁前/后归一化快照 **diff 为空**（路径 ①③），文件尾追加段全绿。

## 实施步骤完成情况
- [x] 2.1 基线捕获（**先于补丁**）：临时测试 `test/core/__stage83-capture.test.ts` → `.openfeel/tmp/stage-83-baseline.json`（键 `advance` / `deprecatedAdvance`）
- [x] 2.2 import 追加（:38 `syncRequirementStatus`）
- [x] 2.3 `advanceStagePhase` done 分支接入（`endStage` 后 / `return true` 前）
- [x] 2.4 `resetStagePhase` 接入（**`appendLog` 审计块后、`const curStage` 前**——REV-83-013 主干约束；**不在** `if (normCur === key)` 之内）
- [x] 2.5 补丁后复跑 → `diff baseline after` → **空**（advance + deprecatedAdvance 逐字节一致）；临时测试与 after 快照清除
- [x] 2.6 段：T4.2-①~⑦（正向/反向矩阵、对称循环、回退目标、空集守卫、悬空、同事务故障注入）
- [x] 2.7 T4.3-① golden 等值 + 零注入 + 零审计 + 正控
- [x] 2.8 T4.3-③ deprecated 路径同 golden
- [x] 2.9 T4.4-core dry-run 零变更 + 形参锁定
- [x] 2.10 定向验证：tsc 0；`vitest run flow-manager.test.ts req.test.ts` 404 passed（当时计数）

## 自测清单验证
| 检查项 | 结果 | 备注 |
|--------|:--:|------|
| 2.1 基线先于补丁 + 两键 | ✅ | 证据文件在位 |
| 2.2 **补丁前后 diff 为空** | ✅ | `diff` → `DIFF_EMPTY_OK`（归一化排除 meta.revision/updated、log.time、stats 时间） |
| 2.3 T4.2-① 正向矩阵 7 例 | ✅ | 返回值恒 true 解耦断言 |
| 2.4 T4.2-② 反向矩阵 7 例 | ✅ | item 同时关联 stage-A/B（REV-83-014） |
| 2.5 T4.2-③ 对称循环 | ✅ | 审计条数逐次断言（done 2 条 / reopen 1 条） |
| 2.6 T4.2-④ 回退目标恒 in_progress | ✅ | 非 scheduled |
| 2.7 T4.2-⑤ 空集守卫 | ✅ | 零审计零注入 + 返回 true |
| 2.8 T4.2-⑥ 悬空关联 | ✅ | 不抛错零动作 |
| 2.9 T4.2-⑦ 同事务无中间态 | ✅ | `isFlowConcurrentError` + 磁盘同现断言 |
| 2.10 T4.3-① golden + 正控 | ✅ | 零注入 + `requirement_` 零命中 + 正控出现 auto_done |
| 2.11 T4.3-③ deprecated golden | ✅ | 同口径 |
| 2.12 T4.4-core dry-run + 形参锁定 | ✅ | `advanceStagePhase.length===3` / `resetStagePhase.length===2` |
| 2.13 热点区零删除 | ✅ | `git diff --numstat` = `8  0` |
| 2.14 临时文件清理 | ✅ | `git status` 无 `__stage83-capture.test.ts` 残留 |
| 2.15 类型与定向回归 | ✅ | tsc 0；0 failed |

## 产出文件
- `src/core/flow-manager.ts`（1 import + advance done 分支调用 + reset 调用；8+/0-）
- `test/core/flow-manager.test.ts`（尾追加段）
- `.openfeel/tmp/stage-83-baseline.json`（取证产物，保留）

## 前置校验结果
- 方案完整性：通过
- Phase 合法性：通过
- 流转合法性：通过

## 偏差记录
- **REV-83-013 落实（加固）**：复位接入点实测确认为 `appendLog` 审计块之后、`const curStage` **之前**（`syncCurrentOp` 实测在 `:1605`、位于 `if (normCur === key)` 内 → 若误插其内，非 current 阶段复位将不回写）。新增专测「**非 current 阶段的 reset 仍触发聚合回写**」（current 指向 stage-02，复位 stage-01 → 需求仍回退 + 审计 1 条）已通过。
- **T4.2-③ 复位目标偏离（语义）**：方案写 `resetStagePhase('stage-01','test_pending')`，实测 `mapPhaseToStageStatus('test_pending','done')` 走 default 分支返回 `currentStatus='done'`，致阶段复位后 `status` 仍为 `'done'`；此时再次 advance→done 因既有守卫 `prevStatus !== 'done'` **不成立**而不触发回写，第 ③ 步「audit A 第二条」不可达。为保持「双向对称」语义且**零改动既有控制流**（不变量 1），改用 `resetStagePhase('stage-01','review_failed')`（投影 status = `review_failed` ≠ done → 再 advance 仍重入 done 分支）。偏差仅限测试取值，实现零改动。
- `test/core/flow-manager.test.ts` 追加 `AUTO_DONE_PRECONDITION` + `REQ_STATUSES` 导入（后者为单源 7 状态值域，供矩阵行数据对齐）；既有 describe 零改动。
