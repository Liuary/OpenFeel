# CLI 命令体系（commands）

> 模块文档，由归档官在归档时维护。对应源码：`src/cli/index.ts` + `src/commands/*.ts`。

## 职责

基于 Commander 构建 OpenFeel CLI 入口，动态注册各命令组，并通过 i18n 机制翻译 help 文本。入口 `bin/openfeel.js`：无参数进入 REPL 交互模式，有参数走 CLI 模式。

## 命令注册

`src/cli/index.ts` 中每个命令组一个注册函数，统一 `import` + `register`：

```
src/commands/init.ts        registerInitCommand
src/commands/flow.ts        registerFlowCommand
src/commands/plan.ts        registerPlanCommand
src/commands/view.ts        registerViewCommand
src/commands/archive.ts     registerArchiveCommand
src/commands/roadmap.ts     registerRoadmapCommand
src/commands/instructions.ts registerInstructionsCommand
src/commands/update.ts      registerUpdateCommand
src/commands/knowledge.ts   registerKnowledgeCommand
src/commands/stage.ts       registerStageCommand
src/commands/project.ts     registerProjectCommand
src/commands/config.ts      registerConfigCommand
src/commands/lint.ts        registerLintCommand
```

新增命令组：在 `src/commands/` 创建 `registerXxxCommand(program)` 模块，并在 `src/cli/index.ts` 末尾追加 import + register 调用。

## i18n 集成

- 翻译数据：`src/core/i18n-data/{zh-CN,en}.ts`，按域组织（common/flow/init/...）
- 核心函数：`t(key, lang, vars)` 按 key 取翻译；`getCliLang(projectPath)` 确定当前语言
- `applyHelpI18n(program)`：递归遍历 Commander 命令树，将 description / option 硬编码文本替换为当前语言翻译（`help.{命令}.{选项}` key 规则）

## 关键命令示例

- `openfeel flow advance --stage <id> --to <phase>` — 推进阶段（经 FlowManager 校验）
- `openfeel flow health --quick` — 流水线健康检查
- `openfeel stage set <id> --status <v>` — 更新阶段状态
- `openfeel stage create <stageId>` — 创建新的工作阶段（复用 FlowManager.addStage，与 flow stage add 等价）
