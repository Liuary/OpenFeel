# v1.2.3-stage-99

## 目标

把 v1.2.2 收官遗留的 4 项仓库内转出项收口，并完成版本 **1.2.3** 全链路收尾（补丁版本，不新增功能）。

| 任务 | 转出项 | 交付 | 结果 |
|:--:|------|------|:--:|
| T1 | REV-95-009 | 并发 JSON 退出统一（`handleConcurrentConflict` JSON 分支 emit → `exitCode=2` → return；非 JSON 逐字不变；10 调用点显式返回） | ✅ |
| T2 | REV-98-003 第 6 项 | `--review-tier` help 文案三载体订正（缺省 = `full` 零裁剪；行为零 diff） | ✅ |
| T3 | REV-98-006① | 锁超时 E2E 钩子（`OPENFEEL_TEST_MODE=1` env seam + 新增 `test/cli/lock-timeout.test.ts`） | ✅ |
| T4 | REV-97-006 | `req show` / `req set --workflow-mode` 复用 `listLinkedStages`（内联过滤 0 残留） | ✅ |
| T5 | 版本收口 | 版本 **1.2.3** A/B/C/D/E + `CHANGELOG [1.2.3]` + 文档多载体 + 双生成物 | ✅ |
| T6 | 门禁 | 75 文件 / 1911 用例 0 failed、tsc 0、i18n 983、kb 0 过期 / 631 引用、build ×2 幂等、`--version` 1.2.3、A 类残留 0 | ✅ |

**外部项**：OUT-1（OpenFeel-DSH 适配器跟进）仅登记，待 Feel 单独委派，不作为本阶段完成判据。

## 依赖

无（上游 `v1.2.2-stage-98` 已 done / 已归档；flow.json `deps=[]`）。

## 操作方案

fast 快线（单阶段、无 op 分片）：计划 → 计划审查（单轮必经）→ 执行（T1→T2→T3→T4→T5→T6）→ 代码审查（单轮）→ 归档。阶段计划见 `plan.md`；门禁实测登记见 `.openfeel/tmp/stage-99/gate.md`。

## 归档结果

- **状态**：审查通过（REV-99-001~003 全 closed，0 blocking）；门禁全绿；**版本级收口成立**。
- **归档摘要**：`.openfeel/log/archive-v1.2.3-stage-99.md`
- **知识沉淀**：patterns +1（补丁版本转出项收口范式）/ troubleshooting +1（测试专用 env seam 的门控纪律）。
- **manual**：`index.md` / `cli/commands.md` / `core/fs.md` / `core/json-contract.md` 已同步。
- **phase**：保持 `archiving`，由 Feel 经 CLI 推进至 `done`（归档官不直写 flow.json）。
