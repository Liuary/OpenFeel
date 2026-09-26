# 自测报告 — BUG-001（kb lint 过期引用修复）

- **执行时间**：2026-09-26 15:20
- **执行 Agent**：openfeel-executor
- **重试次数**：第 1 次
- **说明**：与历史 `.openfeel/tmp/op-BUG-001-fix-test-report.md`（v4.4 config 命令修复，另一 BUG）为不同报告，故文件名加后缀区分。

## 执行摘要
全部修复完成，`openfeel lint kb` 零过期引用（exit 0），`npm run build` 成功，`npm test` 全绿（597 passed）。

## 实施步骤完成情况
- [x] 步骤1：`openfeel lint kb` 复现，确认 3 个过期引用精确位置
- [x] 步骤2：修复 kb 3 处引用（patterns L579/L879、architecture L452）
- [x] 步骤3：修复 3 处非阻塞观察（templates.ts L3 注释、agents-md 模板 L289/L290、根 AGENTS.md L82）
- [x] 步骤4：`npm run build` 重生成 template-loader.ts 内联模板 + `.opencode/` 自举实例
- [x] 步骤5：`npm test` 全量 597 通过
- [x] 步骤6：grep 复验 src/、kb/ 无 `.opencode/instructions/core.md` 过时引用

## 自测清单验证
| 检查项 | 结果 | 备注 |
|--------|:--:|------|
| `openfeel lint kb` exit 0 且无 ❌ | ✅ | "✅ 未发现过期引用（共检查 123 个引用）" |
| `npm run build` 成功 | ✅ | 模板一致性校验 3/3、opencode 模板一致性 3/3、单源一致性通过 |
| `npm test` 全绿 | ✅ | 38 files / 597 tests passed |
| src/、kb/ 无 `.opencode/instructions/core.md` 过时引用 | ✅ | 仅剩 migrate.ts 3 处 legacy 判据/重映射的功能引用（非过时） |

## 修复明细
**kb 3 处过期引用**
1. `patterns.md` L579：清单第 4 项 `.opencode/instructions/core.md` → `~/.config/opencode/AGENTS.md`（新约束载体）
2. `patterns.md` L879：迁移模式适用场景目标 → `~/.config/opencode/AGENTS.md`（全局约束层）
3. `architecture.md` L452：`.opencode/agents|skills|instructions` 字面路径 → `.opencode/` 下的 agents/skills/instructions 旧目录描述（避免被解析为单一路径）

**非阻塞观察 3 处**
1. `src/core/templates.ts` L3：`dev_core.md、current.md、instructions/core.md` → `dev_core.md、current.md、decisions.md`
2. `src/core/templates-data/agents-md/zh-CN.md` L289 + `en.md` L290：「操作流程（→ Instructions）」→「操作流程（→ 全局 AGENTS.md）」
3. 项目根 `AGENTS.md` L82：`.opencode/instructions/core.md` → 全局 `~/.config/opencode/AGENTS.md`

**范围外一并清理（同类「→ Instructions」过时指向）**
- `.openfeel/kb/patterns.md` L85：kb 内与观察 2 同款过时指向，同步改为「操作流程（→ 全局 AGENTS.md）」
- `src/core/templates-data/opencode/ADAPTER.zh-CN.md` / `ADAPTER.en.md` L10：删除已不再部署的 `.opencode/instructions/core.md — 平台操作规范` 清单项（满足验证项 4「src/ 无过时引用」）

## 产出文件
- `.openfeel/kb/patterns.md`（L85/L579/L879）
- `.openfeel/kb/architecture.md`（L452）
- `src/core/templates.ts`（L3 注释）
- `src/core/templates-data/agents-md/zh-CN.md`、`en.md`（L289/L290）
- `src/core/templates-data/opencode/ADAPTER.zh-CN.md`、`ADAPTER.en.md`（删过期清单项）
- `AGENTS.md`（L82）
- 构建产物：`src/core/template-loader.ts`、`.opencode/ADAPTER.md` 等由 `npm run build` 重生成

## 前置校验结果
- 方案完整性：N/A（Feel 直接下发 BUG 修复指令，无独立 op 方案文件）
- Phase 合法性：通过（`openfeel flow health --quick` exit 0；当前 `v1.1.1-stage-01.phase=test_pending`，非 `exec_running`，因 Feel 明确指示执行故继续并记录偏差）
- 流转合法性：通过（健康检查全绿，phase 枚举合法）

## 偏差记录
- **phase 偏差**：当前阶段 `test_pending` 而非 `exec_running`；系测试验收阶段发现的 BUG 直接修复，Feel 已明确指示执行，属流程偏差非违规。
- **超范围（主动清理，同类问题）**：`.openfeel/kb/patterns.md` L85、`ADAPTER.zh-CN.md`/`ADAPTER.en.md` L10 不在任务枚举的 6 处内，但同属 core.md/Instructions 过时引用，为满足验证项 4（src/ 无过时引用）与一致性一并清理，均为最小一行改动。
- **未处理的同类残留（超出任务文件范围，报告待 Feel 决策）**：
  - 项目根 `opencode.jsonc` L6 `instructions` 数组仍含 `.opencode/instructions/core.md`（已删文件，属功能性死引用；不在「kb 文档 + 模板」许可范围内，未改）。
  - `.openfeel/adapters/README.md` L9 亦提及 core.md（非 kb/src，未改）。
- 未执行 git commit（按任务约束）。
