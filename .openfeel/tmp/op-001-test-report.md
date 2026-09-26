# 自测报告 — op-001

- **执行时间**：2026-09-26 15:10
- **执行 Agent**：openfeel-executor
- **重试次数**：1

## 执行摘要

模板重构完成：agents-md → 全局 AGENTS.md 约束层（含工作区结构节 + 项目特有约束可选化）；core.md 源删除；新增 2 skill；build.js 移除 core-instructions 全链路；`npm run build` 全绿。

## 实施步骤完成情况

- [x] 步骤 1：改造 agents-md/{zh-CN,en}.md（移除 {项目名称}；合并 core.md 约束类；新增工作区结构节；L78 引用改指 skill；版本声明文案改 setup）
- [x] 步骤 2：删除 templates-data/opencode/instructions/{zh-CN,en}.md + 目录
- [x] 步骤 3：新增 openfeel-workspace / openfeel-tool-usage 两个 SKILL.md
- [x] 步骤 4：build.js 移除 core-instructions 注入/校验/自举生成/双源断言（4a-4h）
- [x] 步骤 5：template-loader.ts 删除 CORE_INSTRUCTIONS_TEMPLATES 生成段 + 简化 loadTemplate + 移除兼容导出
- [x] 步骤 6：update.ts×2 + migrate.ts×1 调用点 core-instructions → agents-md
- [x] 步骤 7：templates.ts 移除 CORE_INSTRUCTIONS_TEMPLATE_B64 re-export
- [x] 步骤 8：`npm run build` 通过

## 自测清单验证

| 检查项 | 结果 | 备注 |
|--------|:--:|------|
| npm run build 通过 | ✅ | 3/3 + 3/3 + 两对单源断言 |
| grep core-instructions src/ build.js 无残留引用 | ✅ | 仅余注释与 legacy-tree 断言 |
| grep CORE_INSTRUCTIONS_TEMPLATE src/ 无残留 | ✅ | |
| AGENTS.md 含可选化节 + 工作区结构节 + 极简加载指引 | ✅ | |
| 模板无 {项目名称}；L78 改指 openfeel-tool-usage | ✅ | |
| core.md 章节覆盖比对（REV-1908 无遗漏/重复） | ✅ | 逐节映射：约束→AGENTS.md，操作→skill |
| listOpencodeSkillNames() == 16 | ✅ | 新增 2 skill |
| .opencode/instructions/ 已删除 | ✅ | build 不再生成 |

## 产出文件

- `src/core/templates-data/agents-md/{zh-CN,en}.md`（改造）
- `src/core/templates-data/opencode/skills/{openfeel-workspace,openfeel-tool-usage}/SKILL.md`（新增）
- `src/core/template-loader.ts`、`src/core/templates.ts`、`src/core/update.ts`、`src/core/migrate.ts`、`build.js`

## 前置校验结果

- 方案完整性：通过
- Phase 合法性：通过
- 流转合法性：通过

## 偏差记录

无（过渡态 core-instructions 调用点已按方案切到 agents-md，路径函数切换归 op-003）。
