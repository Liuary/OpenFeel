# 自测报告 — op-006

- **执行时间**：2026-10-01 09:35
- **执行 Agent**：openfeel-executor
- **重试次数**：1

## 执行摘要
B6 `plan scheme rename`（flow.json 标题 + 文件首行同步、不改文件名）落地，自测通过。

## 实施步骤完成情况
- [x] B6-1 `renameScheme` + `RenameSchemeResult`（缺省/未命中/文件缺失/标题未变分流；首行替换或头部插入；审计日志 `scheme_rename`；先文件后 flow.json）
- [x] B6-2 `plan scheme rename <stage> <opId> --title`（空标题 exit 1；not-found/file-missing exit 1；unchanged no-op）

## 自测清单验证
| 检查项 | 结果 | 备注 |
|--------|:--:|------|
| 同步 flow.json 标题与文件首行；除首行外不变 | ✅ | plan.test 断言其余行逐字节相等 |
| 无首行模式 → 头部插入 | ✅ | scheme.test |
| 标题未变 → no-op；不存在/文件缺失 → 明确原因+退出码 | ✅ | 用例覆盖 |
| 不改文件名（含历史命名） | ✅ | scheme.test 历史命名用例 |
| 审计日志 `scheme_rename`（含 from/to） | ✅ | 用例断言 |
| `plan scheme list` 反映新标题 | ✅ | plan.test |
| i18n 同键同序；lint i18n problems=0 退出码 0 | ✅ | 702 键一致 |
| build + test 全绿；§六 翻转清单完成 | ✅ | scheme.test N8-3 翻转为包含 rename |
| 测试隔离；config.yaml 三值零 diff | ✅ | auto/enabled/true |
| 未改真实 flow.json/pipeline.yaml/docs/manual；无新增依赖 | ✅ | — |

## 产出文件
- `src/core/plan/scheme.ts`
- `src/commands/plan.ts`
- `src/core/i18n-data/zh-CN.ts`
- `src/core/i18n-data/en.ts`
- `test/commands/plan.test.ts`
- `test/core/plan/scheme.test.ts`

## 前置校验结果
- 方案完整性：通过
- Phase 合法性：通过
- 流转合法性：通过

## 偏差记录
- `RenameSchemeResult` 在方案定义的三字段外**新增可选 `path?`**：`fileMissingTmpl` 文案含 `{path}`，需回传模板路径。
- help 键新增 4 个（方案列 2 个）：额外 `help.plan.scheme.rename.argstage` / `argopId`（命令参数 help 机制所需）。
- 翻转：`test/core/plan/scheme.test.ts` N8-3「plan scheme 无 rename 子命令」→ 改为「含 rename，仍无 migrate」（方案 §六 翻转清单的落点实际在该文件而非 plan.test.ts）。
