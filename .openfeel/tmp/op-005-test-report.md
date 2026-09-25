# 自测报告 — op-005

- **执行时间**：2026-09-25
- **执行 Agent**：openfeel-executor
- **重试次数**：1

## 执行摘要
init/update/commands-init 三测试改造为隔离 HOME（vi.hoisted + vi.mock node:os），断言全局路径/项目精简/不写 instructions/schema/合并/legacy/双 state；全量 493 测试通过。

## 实施步骤完成情况
- [x] 步骤 1：test/core/init.test.ts 改造（mock homedir + 全局路径 + created 26 + 项目精简）
- [x] 步骤 2：test/commands/init.test.ts 改造（mock homedir + 无 .opencode/）
- [x] 步骤 3：test/core/update.test.ts 改造（全局路径 + schema + 合并保留 + legacy + 不写 instructions + 双 state）
- [x] 步骤 4：schema 校验断言（无 skills 映射 / 无 agent_manager_tool / $schema 正确）
- [x] 步骤 5：global-paths / opencode-config 测试回归全绿

## 自测清单验证
| 检查项 | 结果 | 备注 |
|--------|:--:|------|
| 三测试文件加 mock homedir | ✅ | vi.hoisted 变体 |
| 全局断言用 mockHome.dir，隔离无污染 | ✅ | 真实 ~/.config/opencode 与 ~/.openfeel 已核验未变 |
| init：created 26、项目无 .opencode/ | ✅ | |
| update：全局部署 + $schema opencode.ai + 无 skills/agent_manager_tool + 项目无 instructions/skills | ✅ | |
| 合并保留：用户字段保留/ default_agent 覆盖/ instructions 拼接去重/ 注释去除 | ✅ | |
| legacy：输出 migrate 提示且不迁移 | ✅ | |
| 双 state 断言 | ✅ | |
| opencode-instance.test.ts 未改动 | ✅ | |
| `npm run build && npm test` 全绿 + lint | ✅ | 493 passed / 30 files |

## 产出文件
- `test/core/init.test.ts`、`test/commands/init.test.ts`、`test/core/update.test.ts`

## 前置校验结果
- 方案完整性：通过 / Phase 合法性：通过 / 流转合法性：通过

## 偏差记录
- 计数断言按实际行为取 26（24 全局 + 项目 jsonc + AGENTS.md；全局 jsonc 不计入列表）；既有污染缺陷（未 mock homedir）已修复。
