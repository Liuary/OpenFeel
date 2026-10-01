# 自测报告 — op-007

- **执行时间**：2026-10-01 09:40
- **执行 Agent**：openfeel-executor
- **重试次数**：1

## 执行摘要
方案声明范围内的 `console.warn` 中文文案全部 i18n 化（命令层走 `t()`、core 有路径上下文走 `t()`、无上下文走 `[WARN]`+英文），自测通过。

## 实施步骤完成情况
- [x] L5-1 命令层 warn → `t()`：`flow.ts` Git 脏框图（4 键）、force-REV 拒绝、REV 阻塞列表（2 键）
- [x] L5-2 core warn 分流：
  - `flow-manager.ts`（`this.projectPath` → `t()`）：snapshotRestoreRefused / phaseAutoCorrectTmpl / advancePhaseDeprecated / phaseAutoCorrectShortTmpl / advancePhaseNoStageId / autoFixPhaseGuardTmpl
  - `config.ts`（`projectPath` → `t()`）：profile.parseErrorSkipTmpl / profile.writeFailSkipTmpl
  - `update-infos.ts`（无参数 → `[WARN]`+英文）
  - `workspace/identity.ts`（无 projectPath，且被 i18n.ts 依赖不可反向 import → `[WARN]`+英文）
- [x] L5-3 i18n 键：新增 15（zh/en 对称）

## 自测清单验证
| 检查项 | 结果 | 备注 |
|--------|:--:|------|
| 命令层 warn 全走 `t()`（含 Git 框式警告，外观保留） | ✅ | 4 键框式；zh 保留「Git 脏区警告」 |
| core warn 按分流规则处理（有上下文 t()；无上下文 [WARN]+英文，零 CJK） | ✅ | 逐处落实 |
| 告警触发条件/次数/退出码未改变 | ✅ | 仅改文案来源；既有用例守护 |
| 声明范围 `rg` 无裸中文 warn | ✅ | 5 文件 console.warn 均为 t()/[WARN]+英文 |
| i18n 同键同序；lint i18n problems=0 退出码 0 | ✅ | 717 键一致 |
| build + test 全绿；§六 翻转清单完成 | ✅ | 既有 warn 文本断言保持通过（zh 值保留关键子串） |
| 测试隔离；config.yaml 三值零 diff | ✅ | auto/enabled/true |
| 未改真实 flow.json/pipeline.yaml/docs/manual；无新增依赖 | ✅ | — |

## 产出文件
- `src/commands/flow.ts`
- `src/core/flow-manager.ts`
- `src/core/config.ts`
- `src/core/update-infos.ts`
- `src/core/workspace/identity.ts`
- `src/core/i18n-data/zh-CN.ts`
- `src/core/i18n-data/en.ts`
- `test/commands/flow.test.ts`
- `test/core/flow-manager.test.ts`

## 前置校验结果
- 方案完整性：通过
- Phase 合法性：通过
- 流转合法性：通过

## 偏差记录
- **方案与代码事实不符（需上报）**：方案 L5-1/L5-2 与 §八 影响文件清单将 op-007 范围限定为 5 个文件（`commands/flow.ts`、`core/flow-manager.ts`、`core/config.ts`、`core/update-infos.ts`、`core/workspace/identity.ts`）；但全量 `rg` 发现 **另有 11 处含 CJK 的 `console.warn`** 分布在方案未列出的 6 个文件：`core/migrate.ts:547`、`core/init.ts:311`、`core/plan/scheme.ts:143`、`core/public-logger.ts:166`、`core/setup.ts:82,95`、`core/update-state.ts:139`、`core/update.ts:1484,1601,1679,1692`。
  - 依「不得自行扩大范围」，本 op **未改**这 11 处；建议 Feel/op-010 决定是否纳入（否则 `rg "console\.warn\(.*\p{Han}" src/` 仍有残留，验收 5 的全局口径无法达成）。
- i18n 键新增 15（方案估 6~12）；无签名变更。
- 无上下文的 `update-infos.ts`/`identity.ts` 站点采用 `[WARN]`+英文（zh 下亦为英文中性短句，属方案明示取舍）。
