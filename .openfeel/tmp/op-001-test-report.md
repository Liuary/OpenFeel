# 自测报告 — op-001

- **执行时间**：2026-10-11 18:05
- **执行 Agent**：openfeel-executor
- **重试次数**：1

## 执行摘要
全部实施步骤完成，自测清单 10 项全绿（tsc 0 / 4 测试文件 387 用例全绿 / lint i18n 778 / 插入语义 fixture 三态验证）。

## 实施步骤完成情况
- [x] T1：`plan stage add --workflow-mode`（选项 + action 签名 + schema 派生值域校验 + overrides）；`StageSkeletonOverrides.workflowMode`；骨架 status.md 在「自动推进」行后增「工作流模式」行；`addStage` 冗余写入点①（仅新建）
- [x] T2：`stage set --workflow-mode`（选项 + job + 插入分支改造）；`FlowManager.insertStatusField` 公共方法（三态 + 锚点链 + escapeRegex + 原子写 + 按阶段锁 + 按需 .bak）；`StageData.workflow_mode?`；`syncWorkflowModeRedundancy` 私有 helper（冗余写入点②）
- [x] i18n：3 新键（`stage.set.insertedTmpl` / `stage.set.noAnchorTmpl` / `help.stage.set.workflowMode`）+ `stage.set.noOptionTmpl` 文本更新（双表成对）
- [x] 测试：U1（骨架/初值 4 用例）/ U2（冗余写入 3 用例）/ U3（T7.1a-c）/ U4（T7.2a-d + T7.3 ×2）/ U6（insertStatusField 顶层 describe 6 用例）

## 自测清单验证
| 检查项 | 结果 | 备注 |
|--------|:--:|------|
| `npx tsc --noEmit` → 0 | ✅ | 无输出 |
| 4 测试文件全绿 | ✅ | 4 files / 387 passed / 0 failed / 0 skipped |
| fixture `plan stage add stage-01 --workflow-mode fast` | ✅ | status.md 含 `- **工作流模式**：fast`；flow.json `v1.0.0-stage-01.workflow_mode == "fast"` |
| fixture `--workflow-mode bogus` | ✅ | exit 1 + `字段 工作流模式 的取值非法：bogus（允许：full, fast）`；阶段目录未创建 |
| fixture 旧版 status.md 插入 | ✅ | `diff` 仅 +1 行（`4a5`）；位置紧跟「自动推进」后；`.openfeel/tmp/status.stage-05.bak` 存在 |
| fixture 无锚点 | ✅ | exit 1 + stderr 含「插入锚点」；无 `.bak`；SHA256 不变 |
| fixture 同值重复 | ✅ | 输出「已是目标值」；SHA256 不变；无新 `.bak` |
| fixture 仅「执行模式」锚点回退 | ✅ | 插入于「执行模式」行后 |
| fixture CRLF status.md | ✅ | 插入行保留 `\r\n`（od 复核） |
| `lint i18n` → 778 | ✅ | 775 + 3 |
| `setStatusField`/`writeStatusField` 语义零改动 | ✅ | `git diff` 复核：仅新增函数/分支，两函数本体无 -/+ 行 |
| `--version` → 1.1.6 | ✅ | 本 op 不改版本 |

## 产出文件
- `src/core/plan/stage.ts`
- `src/commands/plan.ts`
- `src/core/flow-manager.ts`
- `src/commands/stage.ts`
- `src/core/i18n-data/zh-CN.ts` / `src/core/i18n-data/en.ts`
- `test/core/plan/stage.test.ts` / `test/commands/plan.test.ts` / `test/commands/stage.test.ts` / `test/core/flow-manager.test.ts`

## 前置校验结果
- 方案完整性：通过（6 项必填字段齐备）
- Phase 合法性：通过（stage `v1.1.7-stage-75`.phase = `exec_running`；pipeline.phase=`active` 为既有枚举值）
- 流转合法性：通过（`openfeel flow health --quick` exit 0，全项 ✅）

## 偏差记录
1. **[已修复] 误在仓根执行 fixture 命令**：首次 fixture 验证未 `cd` 到隔离目录，导致 `plan stage add stage-01` 在仓根执行 → `FlowManager.save()` 将 `.openfeel/flow.json` revision 869→870。已用「save 前 `.bak`（= 污染前 flow.json）+ exec_running checkpoint（= 污染前 `.bak`）」精确还原为 revision 869 / 868，复核 `git status` 无新增条目、`flow.json` 无 `workflow_mode` 残留。后续 fixture 全部改用 `cd "$FW"` + Windows 路径。
2. 骨架插入行置于「自动推进」行后（与 `ensureStageSkeleton` 一致）；`insertStatusField` 锚点链采用「先全文找『自动推进』，未命中再找『执行模式』」两步匹配——若用 D3 字面合并正则，骨架文件（「执行模式」行在前）会错插到「执行模式」后，与骨架布局不一致。按 D3 文字语义（「自动推进」后 → 回退「执行模式」后）实现，属口径澄清而非范围扩展。
3. D1 落点 `FlowManager.insertStatusField` 未依赖 `this.data`（仅用 `this.projectPath`），与方案一致。
