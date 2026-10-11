# 自测报告 — op-002

- **执行时间**：2026-10-12 13:42
- **执行 Agent**：openfeel-executor
- **重试次数**：1

## 执行摘要

op-002 全部 8 项步骤完成，自测 15 项全通过；5 个写命令（claim/release/set/link/advance）落地，分流矩阵、`--owner` 缺省链、link 引擎一致口径、advance/set 零校验 + 引擎派生 targets、退出码 0/1/2 全绿。

## 实施步骤完成情况

- [x] 2.1 i18n 双表 op-002 段（21 消息键 + 18 help 键）
- [x] 2.2 `claim <id> [--owner]`（四码分流 + `--owner` 缺省链 + 同 owner 幂等）
- [x] 2.3 `release <id>`（未占用 no-op 恒 exit 0）
- [x] 2.4 `set <id>`（零校验 + 无字段 argument-shape 守卫 + targets 引擎派生）
- [x] 2.5 `link --stage (--requirement | --unlink)`（互斥守卫 + 仅一次归一 + already_linked 硬拒）
- [x] 2.6 `advance <id> --to`（零校验 + done 门 + 不设 --force）
- [x] 2.7 命令测试段 B（T-B1~T-B11）
- [x] 2.8 步骤自测（写命令全无 `--json`）

## 自测清单验证

| 检查项 | 结果 | 备注 |
|--------|:--:|------|
| 2.1 T-B1 claim 成功 | ✅ | owner / claimed_at + 审计 + revision +1 |
| 2.2 T-B2 claim 四码 | ✅ | not_found / already_claimed（零变更零审计）/ invalid_field（`--owner ""`）/ invalid_status |
| 2.3 T-B3 claim 幂等 | ✅ | exit 0 + 无审计 + revision 不变 |
| 2.4 T-B4 `--owner` 缺省链四路径 | ✅ | info 命中 / git 命中（`execSync` 桩）/ 哨兵拒绝 / 显式不读链 |
| 2.5 T-B5 release | ✅ | 解除 + 审计；未占用 no-op exit 0 revision 不变 |
| 2.6 T-B6 set | ✅ | 多字段 / 合法流转 / 无字段 / 非法值 / 非法流转 / 同值 no-op |
| 2.7 T-B7 零校验证据 | ✅ | `--status foo` / `--to foo` 的 targets 逐字 = `getAllowedNextStatuses(当前).join(', ')` |
| 2.8 T-B8 link | ✅ | 两径归一 + unlink + already_linked + stage_not_found + not_found + invalid_status + 互斥 + 幂等 |
| 2.9 T-B9 advance | ✅ | 全表（含 blocked 两出口）+ done 门两态 + 同值 + 终态拒绝 |
| 2.10 T-B10 退出码 0/1/2 | ✅ | 并发经 `FlowManager.prototype.save` mock 构造 → exit(2) + 文案 + 零写盘 |
| 2.11 T-B11 写命令无 --json | ✅ | commander 未知选项 `CommanderError`；无 JSON 输出 |
| 2.12 只读/零写盘纪律 | ✅ | 各失败路径 flow.json 逐字节不变 |
| 2.13 tsc / 定向回归 | ✅ | tsc = 0；`vitest run test/commands/req.test.ts` 全通过 |
| 2.14 i18n 双表成对 | ✅ | `lint i18n` = 897（829 + 29 + 39） |
| 2.15 键清单落点自查 | ✅ | arg 键 `argid`（非 camelCase）与清单逐字一致 |

## 产出文件

- `src/commands/req.ts`（追加 claim/release/set/link/advance + `failCode`/`saveOrFail` helpers）
- `src/core/i18n-data/zh-CN.ts` / `src/core/i18n-data/en.ts`（+21 消息键 + 18 help 键）
- `test/commands/req.test.ts`（追加测试段 B）

## 前置校验结果

- 方案完整性：通过
- Phase 合法性：通过（`exec_running`；op-002 由 op-001 串行推进）
- 流转合法性：通过（`flow health --quick` 退出 0）

## 偏差记录

- **REV-82-018 落实**：`help.req.link.stage` 文案注明「短名按 v1.0.0 系列解析」（zh/en 双侧）。
- `saveOrFail` 内并发分支改 `if/else`（非「if 后继续」）——避免测试 mock 下 `process.exit` 返回后误走通用错误模板；生产语义等价（`handleConcurrentConflict` 恒 exit 2）。
- 无跳步违规。
