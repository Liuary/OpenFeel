# 自测报告 — op-005

- **执行时间**：2026-10-01 09:30
- **执行 Agent**：openfeel-executor
- **重试次数**：1

## 执行摘要
B3 `flow ops list` + B4 `draft` 两阶段（create --draft / publish）+ 窄兼容 5 条 + attempt 双层守卫全部落地，自测通过。

## 实施步骤完成情况
- [x] B3-1 `flow ops list [--stage] [--json]`（state + 填充度 empty/partial/filled + 空模板 warning + draft 分组）
- [x] B4-1 `createScheme(..., {draft})` → state='draft'；缺省 pending 不变；draft 留 `scheme_create` 日志
- [x] B4-2 `publishScheme`（空模板禁止发布；单一来源标记）
- [x] B4-3 `plan scheme create --draft` + `plan scheme publish`；`scheme list` 行尾追加 `[draft]`
- [x] B4-4 窄兼容 5 条（health 跳过 draft / advance·统计·归档不计入 / ops list 分组 / 存量零影响 / attempt 拒绝）
- [x] B4-5 `flow attempt` draft 双层守卫（命令层 exit 1 + 核心层 recordAttempt 兜底 + appendLog）

## 自测清单验证
| 检查项 | 结果 | 备注 |
|--------|:--:|------|
| ops list 显示 state/填充度/warning/--json | ✅ | 用例覆盖 |
| createScheme({draft})/publishScheme；缺省 pending 不变 | ✅ | plan.test 覆盖 |
| --draft / publish 可用；空模板发布 exit 1 | ✅ | plan.test 覆盖 |
| 窄兼容 5 条 | ✅ | health/syncCurrentOp/summary/ops list/attempt 各有用例 |
| attempt 双层守卫；正常 op 不变 | ✅ | flow + core 用例 |
| 空模板标记单一来源 | ✅ | rg：scheme.ts 用 EMPTY_TEMPLATE_MARKER；定义唯一于 flow-manager.ts |
| i18n 同键同序；lint i18n problems=0 退出码 0 | ✅ | 693 键一致 |
| build + test 全绿 | ✅ | flow 55 / plan 31 / flow-manager 全绿 |
| 测试隔离；config.yaml 三值零 diff | ✅ | auto/enabled/true |
| 未改真实 flow.json/pipeline.yaml/docs/manual；无新增依赖 | ✅ | — |

## 产出文件
- `src/core/flow-manager.ts`
- `src/core/plan/scheme.ts`
- `src/commands/flow.ts`
- `src/commands/plan.ts`
- `src/core/i18n-data/zh-CN.ts`
- `src/core/i18n-data/en.ts`
- `test/commands/flow.test.ts`
- `test/commands/plan.test.ts`
- `test/core/flow-manager.test.ts`

## 前置校验结果
- 方案完整性：通过
- Phase 合法性：通过
- 流转合法性：通过

## 偏差记录
- 方案 i18n 表列 11~12 键，实际新增 19 键。额外项：`help.flow.ops.list.json`、`help.flow.ops.list.stage`、`help.plan.scheme.create.draft`、`help.plan.scheme.publish.argstage/argopId`（help 机制按命令路径+选项/参数名查键，缺失会触发 missing-key 告警）；`flow.health.emptyTemplate/emptyTemplateDetail`（B4-4 第 1 条要求 healthCheck 新增空模板检查，该检查需 i18n 文案）。
- help 键命名：方案列 `help.flow.ops.stage`，实际子命令结构为 `flow ops list`，机制键为 `help.flow.ops.list.stage`（以机制为准）。
- 空模板定义置于 `flow-manager.ts`（而非 scheme.ts）以保持既有单向依赖（scheme→flow-manager），避免循环 import；scheme.ts/commands 均引用该常量，单一来源不破。
- `flow ops list` 填充度通过 `mgr.readOpTemplate` 直接读模板文件（与 `listSchemes().content` 等价），保证 full stageId↔文件定位可靠。
