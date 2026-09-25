# 自测报告 — op-004（重生成 + 测试断言同步 + 自举收尾）

- **执行时间**：2026-09-25 14:11
- **执行 Agent**：Executor
- **重试次数**：1

## 执行摘要
`npm run build` 重生成 template-loader/update 生成段；build.js 新增步骤 8 从权威源重生成 `.opencode/` 25 文件并插入生成物标记；测试断言二分同步 + 新增 13 用例；全量回归 **build ✅ / 470 tests 全绿**。

## 实施步骤完成情况
- [x] 步骤 1：`npm run build` 重生成 `template-loader.ts`（AGENT_TEMPLATES/OPENCODE_*/CORE_INSTRUCTIONS/OPENCODE_CONFIG）与 `update.ts`（SKILL_DEFINITIONS），键带新名
- [x] 步骤 2：build.js 新增 `regenerateOpencodeInstance()`（tsc 后、validate 前）+ `insertGeneratedMark()`；「清空旧名 → 全量重写」策略；`mkdirSync` 导入补充。未降级为独立脚本（Windows 下 dynamic import 正常）
- [x] 步骤 3：同步 8 个测试文件断言 + 新增 3 组用例（normalizeAgentName、读取兼容、命名前缀完整性）+ 新增 `opencode-instance.test.ts`（标记/前缀/无 CRLF）
- [x] 步骤 4：本报告与 log 报告含重启提醒
- [x] 步骤 5：`npm run build && npm test` 全绿；`openfeel lint i18n` 443 键一致（退出 0）；`openfeel lint kb` 退出 0（3 条过期引用属警告）

## 自测清单验证
| 检查项 | 结果 | 备注 |
|--------|:--:|------|
| npm run build 通过（单源/三对一致性） | ✅ | |
| `.opencode/` 25 文件均含 openfeel:generated 标记 | ✅ | 测试断言 |
| frontmatter 标记位于闭合 `---` 之后 | ✅ | 测试断言 |
| `.opencode/agents/` 8 前缀 + feel；skills 14 前缀 | ✅ | |
| `.opencode/` 无旧名残留 | ✅ | 测试断言 |
| npm test 全绿 | ✅ | 470/470（28 文件） |
| 伪阳性 5 类未误改 | ✅ | `<utility>`/`type: utility`/`flow-manager`/CLI 子命令/项目名 |
| openfeel lint i18n / kb | ✅ | 退出码 0 |
| 收尾重启提醒 | ✅ | 见 log 报告 |
| `.opencode/node_modules` 未重生成/标记 | ✅ | 步骤 8 仅处理 agents/skills/instructions/ADAPTER |

## 产出文件
- `src/core/template-loader.ts`、`src/core/update.ts`（生成段）
- `build.js`（步骤 8 + `insertGeneratedMark`）
- `.opencode/**`（25 文件重生成 + 标记）
- 测试：`update`/`flow-manager`/`template-loader`/`metrics`/`view/entry`/`archive/merge`/`init`/`flow-migrate`（断言同步）+ 新增 `test/core/opencode-instance.test.ts`
- `package.json`：未改（无需降级）

## 前置校验结果
- 方案完整性：通过
- Phase 合法性：通过（附 phase 偏差说明）
- 流转合法性：通过

## 偏差记录
- **跳步违规**：无
- 方案列 11 个测试文件，实际需改 **8** 个：`roadmap.test.ts`（仅 roadmap 计划特性）、`artifact-graph/instruction-loader.test.ts`（仅 `<utility>` XML 伪阳性）、`flow-concurrent.test.ts`（仅 `revision` 子串）无真实旧名，未改。新增 `opencode-instance.test.ts` 承载标记/CRLF 断言
- 附带修复：`config.ts` L350/L407 `deepseek-v4-flash`→`deepseek-flash`；`update.ts` 生成段 L632 由 build 自动重生成（源 .md 已修复）；`template-loader.ts` 生成段 9 处随 build 清除。`src/` 下 `deepseek-v4-flash` 清零
