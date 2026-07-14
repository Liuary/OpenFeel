# 自测报告 — op-006

- **执行时间**：2026-07-12 21:19
- **执行 Agent**：Executor
- **重试次数**：1

## 执行摘要
update 命令新增 --lang 参数，updateProject 函数签名增加 lang 参数，替换硬编码 zh-CN 和 B64 直解为 loadTemplate 调用。254/254 测试全通过。

## 实施步骤完成情况
- [x] 步骤1: 读取 commands/update.ts 和 core/update.ts
- [x] 步骤2: commands/update.ts 增加 --lang 选项 + 解析/校验逻辑 + getLang 回退
- [x] 步骤3a: update.ts 导入变更（移除 CORE_INSTRUCTIONS_TEMPLATE_B64，新增 loadTemplate）
- [x] 步骤3b: 删除 `const lang = 'zh-CN'` 硬编码 → 使用函数参数
- [x] 步骤3c: B64 直解替换为 loadTemplate(lang, 'core-instructions')
- [x] 步骤3d: Agent 部署使用 loadAgentTemplate(lang, agentId)
- [x] 步骤4: updateProject 签名增加 lang 参数（默认 'zh-CN'）
- [x] 步骤5: 命令帮助确认

## 自测清单验证
| 检查项 | 结果 | 备注 |
|--------|:--:|------|
| --lang en → lang=zh-CN 无问题 | ✅ | 代码确认 |
| --lang fr → 报错 | ✅ | 校验逻辑 |
| 无 --lang 时 getLang 回退 | ✅ | getLang(targetPath) |
| npm run build 通过 | ✅ | 4/4 |
| npm test 全量通过 | ✅ | 254/254 |
| update.ts 无 CORE_INSTRUCTIONS_TEMPLATE_B64 | ✅ | 导入已移除 |
| 无 `const lang = 'zh-CN'` 硬编码 | ✅ | 已替换为参数 |
| core-instructions 部署用 loadTemplate | ✅ | 代码确认 |

## 产出文件
- ✅ `src/commands/update.ts`（增加 --lang 选项 + 校验 + 传递）
- ✅ `src/core/update.ts`（导入变更 + lang 参数 + loadTemplate 替换 B64）

## 前置校验结果
- 方案完整性：通过
- Phase 合法性：通过（exec_running）
- 流转合法性：通过（CLI health --quick）

## 偏差记录
无偏差。
