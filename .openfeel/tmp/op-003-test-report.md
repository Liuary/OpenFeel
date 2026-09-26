# 自测报告 — op-003

- **执行时间**：2026-09-26 16:05
- **执行 Agent**：openfeel-executor
- **重试次数**：1（含 1 次 TS 类型修复）

## 执行摘要

update 收敛完成：拆除项目 AGENTS.md 部署；全局约束部署改全局 AGENTS.md；opencode-config 按 op-000 结论移除 instructions 并清理废弃 core.md 引用；state key remap；migrate remapLegacyKey/部署路径切换。build 全绿，e2e 通过。

## 实施步骤完成情况

- [x] 步骤 1：update.ts 移除 AgentsMdLangConflictError + 项目 AGENTS.md 语言同步块 + projectLegacyAgentsDir
- [x] 步骤 2：core.md 部署改 getGlobalAgentsMdPath()（import 调整）
- [x] 步骤 3：全局 state core.md key → AGENTS.md key 一次性重映射（显式 globalState && 守卫）
- [x] 步骤 4：getIncomingContent 路由改 getGlobalAgentsMdPath()；删除项目 AGENTS.md 路由
- [x] 步骤 5：opencode-config buildGlobalOpencodeFrameworkObj 移除 instructions；mergeGlobalOpencodeJsonc 清理废弃 core.md 引用
- [x] 步骤 6：migrate remapLegacyKey 目标 + 全局部署路径切 AGENTS.md + import 调整
- [x] 步骤 7：commands/update.ts 移除 AgentsMdLangConflictError import/catch
- [x] 步骤 8：npm run build 通过

## 自测清单验证

| 检查项 | 结果 | 备注 |
|--------|:--:|------|
| update 不写项目 AGENTS.md | ✅ | e2e + 单测 |
| 全局部署目标为全局 AGENTS.md（非 core.md） | ✅ | e2e |
| buildGlobalOpencodeFrameworkObj 无 instructions（op-000 YES 分支） | ✅ | node 断言 |
| mergeGlobalOpencodeJsonc 清理 core.md 引用、保留 custom.md | ✅ | 单测 |
| getIncomingContent 路由（AGENTS.md→agents-md；'AGENTS.md'→''） | ✅ | |
| 存量 state core.md key → AGENTS.md key | ✅ | 隔离 HOME 实测 |
| remapLegacyKey('.opencode/instructions/core.md')==getGlobalAgentsMdPath() | ✅ | 经 stateSplit.movedToGlobal 断言 |
| migrate 全局部署目标为全局 AGENTS.md + key 一致 | ✅ | 单测 |
| tsc --noEmit 无错误 | ✅ | build 内含 |

## 产出文件

- `src/core/update.ts`、`src/core/opencode-config.ts`、`src/commands/update.ts`、`src/core/migrate.ts`

## 前置校验结果

- 方案完整性：通过
- Phase 合法性：通过
- 流转合法性：通过

## 偏差记录

- `mergeGlobalOpencodeJsonc` 因 TS 对索引访问的 narrowing 限制，改用局部变量 `instr`（1 次重试），语义不变。
- `pipeline.current.op` 为空但 Feel 显式指示，按指令继续。
