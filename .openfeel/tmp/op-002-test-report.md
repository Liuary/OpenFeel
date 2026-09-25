# 自测报告 — op-002（agent 重命名 + P5 读取兼容）

- **执行时间**：2026-09-25 14:11
- **执行 Agent**：Executor
- **重试次数**：1

## 执行摘要
8 个 agent（feel 除外）全链路加 `openfeel-` 前缀：`git mv` 16 文件、运行时映射新名、新增 `normalizeAgentName`、6 接入点读取兼容、全库引用同步、两处 jsonc 同步；`npm run build` 通过。

## 实施步骤完成情况
- [x] 步骤 1：`git mv` 16 个 agent 文件（8×2 语言），feel.md 不变
- [x] 步骤 2：`mapPhaseToAgent` 返回新名；新增模块级 `normalizeAgentName` + `LEGACY_AGENT_NAME_MAP`（含 `toLowerCase()` 归一，REV-304）
- [x] 步骤 3：写入点改新名（flow-manager ×3、archive/merge、view/entry ×3、plan/scheme ×2、init ×2）
- [x] 步骤 4：全库引用同步（agents 18 + agents-md 2 + instructions 2 + skills 5 + ADAPTER 2 + AGENTS.md）
- [x] 步骤 5：`opencode.jsonc` ×2 —— `agent.openfeel-vision` / `agent.openfeel-reviewer`
- [x] 步骤 6：P5 读取兼容 6 接入点（flow.ts ×4、metrics.ts ×1、view.ts ×1）

## 自测清单验证
| 检查项 | 结果 | 备注 |
|--------|:--:|------|
| listOpencodeAgentIds 返回 9 项（8 带前缀 + feel） | ✅ | 新增测试断言 |
| normalizeAgentName 大小写/幂等/保留值 | ✅ | 新增单测（4 case） |
| mapPhaseToAgent('exec_running')→openfeel-executor | ✅ | 既有测试已同步 |
| 全库 grep 无裸旧名残留 | ✅ | 唯一谓词参见下方偏差 |
| 无 openfeel-openfeel 二次前缀 | ✅ | grep 0 命中 |
| 旧 flow.json（assignee: planner）可读、展示新名 | ✅ | 新增读取兼容 fixture 测试 |
| opencode.jsonc default_agent=feel、agent.* 带前缀 | ✅ | |
| npm run build 通过 | ✅ | |

## 产出文件
- `src/core/templates-data/opencode/agents/{zh-CN,en}/`（16 重命名 + 正文）
- `src/core/flow-manager.ts`、`archive/merge.ts`、`view/entry.ts`、`plan/scheme.ts`、`init.ts`
- `agents-md/{zh-CN,en}.md`、`opencode/instructions/{zh-CN,en}.md`、`opencode/skills/*/SKILL.md`（agent 名引用）、`opencode/ADAPTER.*.md`
- 根 `AGENTS.md`、根 `opencode.jsonc`、`templates-data/opencode/opencode.jsonc`
- `commands/flow.ts`、`core/metrics.ts`、`commands/view.ts`、`core/config.ts`、`core/archive/merge.ts`（注释）

## 前置校验结果
- 方案完整性：通过
- Phase 合法性：通过（附 phase 偏差说明，同 op-001）
- 流转合法性：通过

## 偏差记录
- **跳步违规**：无
- 方案替换集外**额外替换**：裸大写 `Tester`（= Feel Tester 简写）→ `openfeel-feel-tester`（模板/指令/AGENTS.md），以保持命名一致
- 保留伪阳性：`type: utility` / `task_type: utility` / `<utility>` XML 未改（已保护）
- 保留人类可读 UI：`flow.ts` 固定宽度警告框内 `Executor` 未改（保持框对齐，非功能标识符）
- `src/commands/flow.ts` L520 为唯一残留大写 `Executor` 文案
