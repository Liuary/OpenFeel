# 自测报告 — op-002

- **执行时间**：2026-10-11 02:05
- **执行 Agent**：openfeel-executor
- **重试次数**：1（首次通过）
- **Commit**：`7287355` — op-002: supportedTools 正式化 + R-5 守卫 + update --tools 命令面 (v1.1.6-stage-71, T4)

## 执行摘要
全部步骤完成，自测通过。`claude` 转 `supportedTools` 正式条目（`enabled:false`）；新增导出 `parseToolList`；**R-5 高危修复**（`commands/update.ts` `filter(t=>t.enabled).map(t=>t.id)`）+ `--tools <list>`（非法值 exit 1，校验前置 fail-fast）。`tsc`=0；全量 `npm test` 66 files / 1172 tests passed / 0 failed。

## 实施步骤完成情况
- [x] T4.1：`core/update.ts` `supportedTools` claude 转正式条目 `enabled:false`（注释移除，cursor 注释保留）
- [x] T4.2：`core/update.ts` 新增导出 `parseToolList`（`selectTools` 之后）
- [x] T4.3：`commands/update.ts` import + `--tools` 选项 + action 签名 + R-5 filter + 校验前置
- [x] T7c：`test/commands/update.test.ts` 新增 R-5 守卫 / `--tools opencode` / 非法值 exit 1 / 空串 exit 1
- [x] T7d：`test/core/update.test.ts` 新增 `supportedTools` 断言 + 默认零触 `~/.claude`

## 自测清单验证
| 检查项 | 结果 | 备注 |
|--------|:--:|------|
| S1 `supportedTools` 含 claude `enabled:false`，opencode `enabled:true` | ✅ | T4 断言用例通过 |
| S2 原 `map(t=>t.id)` 已消失；`filter(t=>t.enabled).map(t=>t.id)` 存在 | ✅ | `rg` 仅命中 filter 版本（update.ts:57） |
| S3 `parseToolList` 保序去重；空串→invalid；非法项入 invalid | ✅ | 逻辑与命令用例覆盖 |
| S4 `--tools foo` → exit 1 且零写盘；`update <path>` 默认不触 `~/.claude` | ✅ | 命令层用例通过 |
| S5 既有 update 命令/核心测试全绿（默认零回归） | ✅ | 48 passed；全量 1172 passed |
| S6 `npx tsc --noEmit` = 0 | ✅ | exit 0 |

## 产出文件
- `src/core/update.ts`
- `src/commands/update.ts`
- `test/core/update.test.ts`
- `test/commands/update.test.ts`

## 前置校验结果
- 方案完整性：通过
- Phase 合法性：通过（`exec_running`；`current.op` 空，见偏差）
- 流转合法性：通过（health --quick 退出码 0）

## 门禁命令结果
- `npx tsc --noEmit` → 0
- `npx vitest run test/commands/update.test.ts test/core/update.test.ts` → 2 files / 48 tests passed
- `npm test` → 66 files / 1172 tests passed / 0 failed

## 偏差记录
- **i18n 键缺失告警（预期）**：`help.update.tools` 与 `update.toolsInvalidTmpl` 由 op-003 落地；op-002 阶段 `t()` 返回键名并打印 `[i18n] Missing key` 告警。属方案预期（op-002 明确「允许暂以键名渲染，不得断言 help 描述文本」），未在测试中断言文本。
- **`--tools` 校验前置落点**：方案 T4.3 片段将校验块列于「工具选择段」位置，但要求「校验置于路径存在性检查之前」。实现取方案意图：校验块置于 `try` 顶部（`existsSync(targetPath)` 之前），`selectedTools` 计算留在原位复用 `toolsParsed`，满足 fail-fast 与「非法值零写盘」。
- **commit 与 op 边界「不 commit」冲突**：同 op-001，依 Feel 明确指令执行 commit，未 push、未 commit `docs/**`/`.openfeel/**`。
- **`setup --tools` 未做**：按方案边界归 op-003（编译顺序约束），本 op 未改 `setupGlobalFramework` 签名。
