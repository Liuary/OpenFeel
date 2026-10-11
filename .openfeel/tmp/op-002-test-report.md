# 自测报告 — op-002

- **执行时间**：2026-10-11 18:10
- **执行 Agent**：openfeel-executor
- **重试次数**：1

## 执行摘要
全部实施步骤完成，自测清单全绿（tsc 0 / build 成功 / flow.test.ts 87 用例 + output-encoding 22 用例全绿 / lint i18n 786 / src 内零无参访问器调用）。

## 实施步骤完成情况
- [x] T3：`flow mode [--stage] [--json]` 只读命令（`--stage` 格式 + 存在性校验、缺省回退 `current.stage`、单点 `resolveStageWorkflowMode`、`modes` 双表、human 模式行 + 可达目标行、`--json` 稳定 5 键、不写盘）
- [x] T3-附：`flow phases` 增 `--mode` / `--stage`（值域校验 → 存在性校验 → 单点派生 `derivedMode` → **显式传 mode** 消除 `:391/:393` 无参调用 → `transitionsDiff` 同模式对比 → `--json` 末位追加 `workflowMode` → 人类输出新增模式分节行 + 指引行）
- [x] `flow advance --help --to` 描述追加「查看当前模式：openfeel flow mode」
- [x] i18n：8 新键（`flow.mode.lineTmpl` / `flow.mode.targetsLabel` / `flow.phases.modeHint` / `help.flow.mode{,.stage,.json}` / `help.flow.phases.{mode,stage}`）+ `help.flow.phases.json` 枚举追加 `workflowMode`（双表成对）
- [x] 测试：T7.11①~⑦ + T7.4 + T7.5①~④（10 用例）；E-2② 5 → 6

## 自测清单验证
| 检查项 | 结果 | 备注 |
|--------|:--:|------|
| `npx tsc --noEmit` → 0 | ✅ | |
| `npm run build` | ✅ | dist 反映新命令面 |
| `test/commands/flow.test.ts` + `test/cli/output-encoding.test.ts` | ✅ | 87 + 22 全绿（0 failed / 0 skipped） |
| fixture `flow mode` | ✅ | `当前模式：fast  [来源: config.yaml]` |
| fixture `flow mode --stage <status.md=full>` | ✅ | `full [来源: status.md]`；flow.json / config.yaml / status.md SHA256 前后不变 |
| fixture `flow mode --json` | ✅ | 键 = `{schemaVersion, stage, mode, source, modes}`；`modes.full` / `modes.fast` 为对象 |
| fixture `flow phases` | ✅ | 转移表前含模式分节行 + 指引行；`--mode fast` → fast 表 7 流转键 + `[来源: --mode]` |
| fixture `flow phases --json` | ✅ | 含 `workflowMode`，键序 6 键（既有五键逐字不变） |
| fixture 非法 `--mode bogus` / `--stage bogus-!!` | ✅ | 均 exit 1（值域文案 / 建议名） |
| `rg -n "getPipelineTransitions\(\)\|getDefaultTransitions\(\)" src/` | ✅ | **0 命中** |
| `lint i18n` → 786 | ✅ | 778 + 8 |
| `--version` → 1.1.6 | ✅ | 本 op 不改版本 |

## 产出文件
- `src/commands/flow.ts`
- `src/core/i18n-data/zh-CN.ts` / `src/core/i18n-data/en.ts`
- `test/commands/flow.test.ts` / `test/cli/output-encoding.test.ts`

## 前置校验结果
- 方案完整性：通过
- Phase 合法性：通过
- 流转合法性：通过（`flow health --quick` exit 0）

## 偏差记录
1. **D2 缺省 `key` 取值**：fixture `init` 将 `pipeline.current.stage` 置为占位符 `"-"`，故 `flow mode --json` 输出 `stage: "-"`（非 `""`）。实现严格按 D2「`key = getData()?.pipeline?.current?.stage`」，未对占位符做特判（不属方案范围）。
2. **E-2② 断言放宽**：该用例 `runBin` 的 `cwd = REPO_ROOT`，故 `workflowMode` 取本仓 `config.yaml` 派生值（`full`）。按「只增字段」语义断言键数 6 + 值 ∈ `{full, fast}`，不硬编码具体模式值。
3. **人类输出「只增不改」**：T7.11⑤ 以「新增行恰 2 条（模式分节 + 指引）+ 既有行仍在」表达（D8 解读，plan.md 已同步为登记口径）。
