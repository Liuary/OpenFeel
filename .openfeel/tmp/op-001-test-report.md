# 自测报告 — v1.1.4-stage-65.op-001

- **执行时间**：2026-10-03 09:40
- **执行 Agent**：openfeel-executor
- **重试次数**：1（首次即通过全部自测）

## 执行摘要
全部实施步骤（T1.1~T1.6 / T2.1 / T6.1a/b / T6.2a/b/c）完成，自测清单 S1~S11 全通过；全量门禁全绿（`npm test` 1071 passed / 0 failed / 0 skipped；`tsc`=0；`lint i18n`=745；`lint kb`=0；`build` 成功且二次幂等；`--version`=1.1.3 未变）。

## 实施步骤完成情况
- [x] T1.1 新增导出接口 `RestoreDiffEntry` / `RestorePreview`（并列 `StatusReconcileItem`，类声明前）
- [x] T1.2 新增 private `resolveRestoreTarget`（复用旧安全校验，双键回退兼容）
- [x] T1.3 新增 private `buildRestoreData`（全量=快照本身；选择性=磁盘基底+单阶段替换+status 投影+current 协调）
- [x] T1.4 新增 private `computeRestoreDiffs`（哨兵 `(absent)`/`(removed)`）
- [x] T1.5 新增 public `previewRestore`（只读、零写盘、不加锁）
- [x] T1.6 `restoreCheckpoint(filename, options?)` 签名扩展 + dry-run 短路，全量分支逐字节保持
- [x] T2.1 `commands/flow.ts` 的 `checkpoint restore` 增 `--stage` / `--dry-run`，dry-run 不需 `--force`
- [x] T6.1a/b zh-CN/en 各新增 6 键（4 运行 + 2 help），句对对称
- [x] T6.2a `test/core/flow-manager.test.ts` 新增 5 用例（T6.1/T6.2/T6.3/S4/T6.8）
- [x] T6.2b `test/commands/flow.test.ts` 新增 3 用例（dry-run/selective/路径穿越）
- [x] T6.2c 目标测试全绿

## 自测清单验证
| 检查项 | 结果 | 备注 |
|--------|:--:|------|
| S1 全量 restore 逐字节一致 | ✅ | T6.3 用例：磁盘写入 JSON 与快照归一化 revision 后逐字段一致 |
| S2 `--stage A` 仅回退 A | ✅ | T6.1 用例：B/C 保留改动后磁盘值 |
| S3 current 指向该阶段时同步 op | ✅ | T6.1 断言 `pipeline.current={stage:A,op:op-001}`；非命中不动 |
| S4 status 按 phase 投影 | ✅ | S4 用例：test_passed→testing（非 done） |
| S5 dry-run 零写盘 | ✅ | T6.2 用例：flow.json 字节不变、`.bak` 未新写 |
| S6 差异清单正确（含哨兵） | ✅ | computeRestoreDiffs 实现 + T6.2 断言 from/to phase+status |
| S7 路径穿越/非法名/缺文件/坏内容拒绝 | ✅ | T6.8 用例 + 既有用例不回归 |
| S8 `--stage` 不存在 → stage-not-in-snapshot | ✅ | T6.8 用例：reason=stage-not-in-snapshot、restore=false |
| S9 乐观并发冲突仍拒绝并 warn | ✅ | 既有并发用例不回归 |
| S10 `lint i18n` = 745 | ✅ | 实测 745（+6，zh/en 对称） |
| S11 `tsc`=0；`npm test` 0 failed/0 skipped | ✅ | 见下 |

## 门禁实测
| 命令 | 结果 |
|------|------|
| `npx tsc --noEmit` | 0 |
| `npm test` | Test Files 61 passed；Tests 1071 passed / 0 failed / 0 skipped |
| `node bin/openfeel.js lint i18n` | ✅ 745 键一致（基线 739 + 6） |
| `node bin/openfeel.js lint kb` | ✅ 0 过期（检查 325 引用） |
| `npm run build` | 成功；二次 build 幂等（tracked 文件无变化） |
| `node bin/openfeel.js --version` | 1.1.3（本 op 不改版本，收口归 op-003） |
| 目标测试 `vitest run test/core/flow-manager.test.ts test/commands/flow.test.ts` | 2 files / 325 passed |

## 产出文件
- `src/core/flow-manager.ts`
- `src/commands/flow.ts`
- `src/core/i18n-data/zh-CN.ts`
- `src/core/i18n-data/en.ts`
- `test/core/flow-manager.test.ts`
- `test/commands/flow.test.ts`
- `.openfeel/plan/v1/stage-65/ops/op-001.md`（动作清单勾选 + 修正记录）

## 前置校验结果
- 方案完整性：通过（6 必填字段齐全）
- Phase 合法性：通过（phase=exec_running，current.op=op-001）
- 流转合法性：通过（`flow current` 确认 op-001 / v1.1.4-stage-65）
- i18n 基线：739（实测）；rg 确认 `restoreCheckpoint` 调用点仅 flow-manager.ts + flow.ts + 测试；`previewRestore` 改动前 0 命中

## 偏差记录
1. **T6.3 断言实现方式调整**（已在方案修正记录登记）：方案建议 `mgr.getData()` 与快照 `JSON.stringify` 比对，但 `load()` 会回填 op `id`（磁盘不存），必然不等；改为比对磁盘写入 JSON 与快照 JSON（归一化 revision）。
2. **i18n 插入位置偏移**：方案标注 zh-CN `:199-205`，实际 `checkpoint.restoreFailTmpl` 位于 `:205`，以实际位置插入，键名/值不变。
3. 无跳步违规；未触碰快照生产/清理、restore 安全校验（路径穿越/乐观并发/.bak）；未新增依赖；未 `push`/`publish`；未手改 flow.json。

## 移交
自测通过，**请 Feel 安排 openfeel-reviewer 审查**。
