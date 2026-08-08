# 自测报告 — op-002

- **执行时间**：2026-08-08 10:45
- **执行 Agent**：Executor
- **重试次数**：1

## 执行摘要

init 集成全部完成：AGENTS.md `{项目名称}` 占位符替换、promptOpencodeDeploy 交互、deployOpencode 部署逻辑（27 文件）、initProject 流程重组、重启提醒（init + update）、4 个新增测试用例。构建与全部测试通过（399/399）。

## 实施步骤完成情况

- [x] 步骤1.1：initProject 步骤 8 中新增 `{项目名称}` 变量替换（`basename(projectPath)`）
- [x] 步骤2.1：新增 `promptOpencodeDeploy()`（promptLanguage 之后、writeLang 之前，Y/n 默认 Y，非交互返回 false）
- [x] 步骤3.1：init.ts 新增 template-loader 导入 + `basename` 导入
- [x] 步骤3.2：新增 `deployOpencode()`（导出供测试）+ `OpencodeDeployResult` 接口，6 类文件部署，不部署 package.json
- [x] 步骤4.1：InitResult 新增 `opencode?` 字段
- [x] 步骤4.2：1b 步骤插入 `deployOpencodeFlag`（语言选择之后）
- [x] 步骤4.3：7b 步骤插入 opencode 部署（kb/index.md 之后、AGENTS.md 之前）
- [x] 步骤4.4：return 新增 `opencode: opencodeResult`
- [x] 步骤4.5：步骤 10 重启提醒（created>0 且交互模式）
- [x] 步骤5.1：选择硬编码中英双语提示（方案推荐），跳过 i18n
- [x] 步骤6.1：新增 4 个测试用例（deployOpencode 直接调用，不依赖交互流程）
- [x] 步骤7.1：init 重启提醒实现确认
- [x] 步骤7.2：update.ts 新增重启提醒（updated 含 `.opencode/agents/` 前缀 + 交互模式）
- [x] 步骤8.1：npm run build 通过
- [x] 步骤8.2：npm test 通过（399/399）

## 自测清单验证

| 检查项 | 结果 | 备注 |
|--------|:--:|------|
| `npm run build` 成功 | ✅ | 退出码 0 |
| `npm test` 无回归 | ✅ | 399/399 通过（原 395 + 新增 4） |
| `{项目名称}` 变量替换：AGENTS.md 不含字面量 | ✅ | 含实际目录名 `opfx-init-verify-*` |
| deployOpencode 计数：首次 27 created | ✅ | 9 Agent + 14 Skill + instructions + jsonc + ADAPTER + .gitignore = 27 |
| 重复 init 返回 skipped | ✅ | 第二次 created=0，skipped=27 |
| 非交互模式跳过：CI 环境 `.opencode/` 不存在 | ✅ | `result.opencode` 为 undefined |
| opencode.jsonc 变量替换 | ✅ | 不含 `{项目名称}`，含目录名，14 个 skills |
| 交互确认部署（Y） | ✅ | 模拟 TTY 验证：部署 27 文件 + 重启提醒输出 |
| AGENTS.md 项目名已替换 | ✅ | 模拟 TTY 验证 |
| .opencode/agents/ 9 个文件 | ✅ | 实测 9 |
| .opencode/skills/ 14 个目录 | ✅ | 实测 14 |
| instructions/core.md 存在 | ✅ | 实测存在 |
| ADAPTER.zh-CN.md 存在 | ✅ | 实测存在 |
| .opencode/.gitignore 存在 | ✅ | 实测存在 |
| `.opencode/` 下无 package.json | ✅ | REV-001 验证通过 |
| 重启提醒已输出 | ✅ | 模拟 TTY：`opencode 配置已部署，请重启 opencode 以加载新配置。` |
| 拒绝部署（n）→ `.opencode/` 不存在 | ✅ | 模拟 TTY 输入 n 验证：opencode 字段 undefined |
| 重复 init → 已存在不覆盖，无重启提醒 | ✅ | created=0 不触发提醒 |
| `openfeel update` 正常工作 | ✅ | 实测不退化 |
| update 修改 agent 后输出重启提醒 | ✅ | 模拟 TTY：`opencode agent 配置已更新，请重启 opencode 以加载新配置。` |
| init → update 顺序无冲突（REV-003） | ✅ | 无异常（见偏差记录） |

## 产出文件

- `src/core/init.ts`（MODIFY）
- `src/core/update.ts`（MODIFY）
- `test/core/init.test.ts`（MODIFY）
- `src/core/template-loader.ts`（MODIFY，op-001 已完成 `listOpencodeSkillNames()` 导出，op-002 无新增修改）

## 前置校验结果

- 方案完整性：通过（6 项必填字段齐全）
- Phase 合法性：通过（stage-29 phase=exec_running）
- 流转合法性：通过（`openfeel flow health --quick` 正常退出）

## 偏差记录

- **已与 Feel 确认的已知限制（不修复）**：`updateProject()` 的 AGENTS.md 覆盖逻辑（既有代码）在 update 时用含 `{项目名称}` 占位符的模板内容覆盖 init 已替换项目名的 AGENTS.md，导致 update 后 AGENTS.md 恢复占位符。已通过 question 反馈，Feel 决策"仅记录偏差，不修复"。实测 init→update 流程无异常（无报错），仅 AGENTS.md 占位符恢复为已知行为。如需修复，建议另开 op 在 update.ts 各写 AGENTS.md 分支统一加 `{项目名称}` 替换。
- 测试 3（非交互模式）依赖 vitest 运行环境 stdout.isTTY=false，与 CI/CD 环境一致，测试可靠。
- 交互模式验证通过模拟 TTY（patch isTTY + stdin 管道）完成，覆盖 Y/n/重复 init/update 四条路径。
