# 自测报告 — op-004

- **执行时间**：2026-10-11 18:30
- **执行 Agent**：openfeel-executor
- **重试次数**：1

## 执行摘要
全部实施步骤完成；T6/T4 交付并测试绿，T9 自举四项核验通过（含 REV-75-010 修订口径），T8 全门禁绿（67 文件 / 1291 用例 / 0 failed / 0 skipped / lint i18n 796 / kb 0 / version 1.1.6）。

## 实施步骤完成情况
- [x] T6：`createSchemesFromTasks`（任务正则解析 → 编号排序去重 → `任务{N}：` 前缀锚定判重 → 复用 `createScheme` 逐条铺 → `ops/deps.yaml` 占位仅缺失时写）返回 `{created, createdTitles, skippedTaskNos, depsPlaceholderCreated}`；`plan scheme create` 命令层：`[title]` 可选化 + `--from-tasks` + 互斥/缺 title 校验 + `STATUS_NOT_FOUND` 映射 + 既有路径逐字不变
- [x] T4：`shouldPromptWorkflowMode`（导出纯函数，4 态矩阵）+ `hasExplicitProjectDefault`（裸 YAML 读 `defaults` 键，规避 schema `.default()` 填充）+ wizard 主循环插入段（在 `stagePhase` 之前）：询问 → `insertStatusField`（exists 跳过 / no-anchor 警告不阻断）→ `setConfigValue` 记忆 → 「已记忆」输出；**非 TTY 守卫逐字未动**
- [x] T9：自举命令执行 + 四项核验（详见下）
- [x] T8：全门禁 + 检索复核 + 死键复核
- [x] i18n：9 新键（T6 五键 + T4 四键，双表成对）
- [x] 测试：T7.9a~c（scheme 3 用例）/ T7.9d（plan 3 用例）/ T7.6a~d（flow 4 用例）

## T9 四项核验
| 核验 | 口径 | 结果 |
|------|------|:--:|
| 1 | 74~77 `status.md` 均含 `- **工作流模式**：full`；相对**执行前快照**每份 +1 行 | ✅ |
| 2 | `config effective workflow_mode` → `full    [来源: status.md]`（四键输出正常） | ✅ |
| 3 | porcelain 无未预期条目（新增恰 3 条 status.md；flow.json/bak 本已 M；无新增 untracked）；`flow.json` 增量 = 4 个 `stages.*.workflow_mode` + `meta.revision` 869→870 + `meta.updated` + **4 条 `log[].config_sync_stage`**，其余逐字不变 | ✅ |
| 4 | 重复执行同命令 → 全 noop（`同步 0 / 插入 0 / 跳过 4`）；flow.json 与 4 份 status.md SHA256 不变 | ✅ |

## 门禁收口（T8）
| 项 | 实测 |
|----|------|
| `npm test` | **67 文件 / 1291 passed / 0 failed / 0 skipped**（基线 1239 → +52） |
| `npx tsc --noEmit` | exit 0 |
| `npm run build` ×2 | 幂等（`src` 树 SHA256 前后一致；porcelain 仅本 op 的 9 个有意文件） |
| `lint i18n` | **796**（775 + 21：+3/+8/+1/+9） |
| `lint kb` | 0（408 引用无过期） |
| `--version` | 1.1.6 |
| `rg -n "getPipelineTransitions\(\)\|getDefaultTransitions\(\)" src/` | **0** |
| 死键复核 | `syncSummaryTmpl` / `insertedTmpl` / `noAnchorTmpl` / `modeRememberedTmpl` / `fromTasks*` / `titleRequiredTmpl` 均有调用点 |
| `flow phases --json` | 6 键（既有五键 + `workflowMode`），`advanceAccepted` 15 |
| `config effective` | 四键 + 来源，格式逐字不变 |

## 产出文件
- `src/core/plan/scheme.ts` / `src/commands/plan.ts` / `src/commands/flow.ts`
- `src/core/i18n-data/zh-CN.ts` / `src/core/i18n-data/en.ts`
- `test/core/plan/scheme.test.ts` / `test/commands/plan.test.ts` / `test/commands/flow.test.ts`
- `.openfeel/plan/v1/stage-{74,75,76,77}/status.md`（T9 经 CLI 写入，本阶段唯一触碰本仓真实文件的动作）

## 前置校验结果
- 方案完整性：通过
- Phase 合法性：通过
- 流转合法性：通过

## 偏差记录
1. **[执行事故，已完全修复]** 本次执行初期在**仓根**误跑 `plan stage add stage-01 --workflow-mode fast`（未先 `cd` 到隔离 fixture），触发 `FlowManager.save()`：flow.json revision 869→870、`.bak` 被覆盖。已用「污染前 `.bak`（= 污染前 flow.json）+ exec_running checkpoint（= 污染前 `.bak`）」精确还原（869/868），复核 `git status` 无新增条目、flow.json 无 `workflow_mode` 残留、无新 stage 键、无新文件。后续全部 fixture 改用 `cd "$FW"` + Windows 路径。
2. **T9 核验 1 口径**：`stage-75/status.md` 相对 HEAD 为 5/2（主会话在本 op 之前的 plan/status 改动），T9 自身仍仅 +1 行；故核验 1 以「执行前快照」为基线。已回写 op-004 修正记录第 2 条。
3. **T9 核验 3 口径**：op 字面「porcelain 零新增条目」不可满足（T9 必然把 3 份原本 clean 的 status.md 变为 `M`）；实际可验证不变量 = 「无未预期条目」。另内容增量还含 4 条 `config_sync_stage` 审计日志（op-003 步骤 2 明确要求 appendLog）。已回写 op-003 / op-004 修正记录。
4. **i18n 键预算收敛**：op 规定本 op 恰 5（T6）+ 4（T4）= 9 键；`ops/deps.yaml` 占位提示未另立键，而是纳入 `plan.scheme.fromTasks.okTmpl` / `.emptyTmpl` 的静态文案，保持键基数 796。
5. `plan scheme create --from-tasks` 零 Agent 调用（无 agent 日志/进程），`plan stage add` 无任何隐式铺行为（Q6）。
