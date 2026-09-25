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
src/commands/migrate.ts     registerMigrateCommand
src/commands/model.ts       registerModelCommand
```

新增命令组：在 `src/commands/` 创建 `registerXxxCommand(program)` 模块，并在 `src/cli/index.ts` 末尾追加 import + register 调用。

## i18n 集成

- 翻译数据：`src/core/i18n-data/{zh-CN,en}.ts`，按域组织（common/flow/init/...）
- 核心函数：`t(key, lang, vars)` 按 key 取翻译；`getCliLang(projectPath)` 确定当前语言
- `applyHelpI18n(program)`：递归遍历 Commander 命令树，将 description / option 硬编码文本替换为当前语言翻译（`help.{命令}.{选项}` key 规则）

## 错误处理与退出码

`src/cli/index.ts` 提供统一 CLI 入口与错误处理（v1.1.0-stage-35 新增）：

- `runCli()`：包裹 `program.parse()`，捕获冒泡异常交给 `handleCliError()`；`bin/openfeel.js` 有参数模式改调 `runCli()`（REPL 分支不变）。
- `handleCliError(err)`：识别 `isFlowConcurrentError(err)`（flow.json 乐观并发冲突）→ 输出中文可重试提示后 `process.exit(EXIT_CONCURRENT)`；非并发错误原样 rethrow。
- `EXIT_CONCURRENT = 2`：并发冲突退出码，与通用错误 1 区分，供自动化识别「可重试」冲突。

| 场景 | 退出码 |
|------|:--:|
| 并发冲突（可重试） | `2` |
| 通用错误 | `1` |
| 成功 | `0` |

已包裹 `mgr.save()` 的 catch 块（`flow stage add`、`stage create`、`flow wizard`）在 catch 首部增加 `isFlowConcurrentError` 分支，保证同样提示与退出码 2。

## 关键命令示例

- `openfeel flow advance --stage <id> --to <phase> [--dry-run] [--force]` — 推进阶段（经 FlowManager 校验）；`--dry-run` 预览不修改，`--force` 跳过非法 phase 和阶段跳跃检查
- `openfeel flow wizard` — 交互式流水线向导，支持无阶段时自动引导创建首个阶段
- `openfeel flow health --quick` — 流水线健康检查
- `openfeel stage set <id> --status <v>` — 更新阶段状态
- `openfeel stage create <stageId>` — 创建新的工作阶段（复用 FlowManager.addStage，与 flow stage add 等价）
- `openfeel migrate [path] [--dry-run] [--remap-assignee]` — 存量旧布局项目迁移（检测/备份/迁移/回滚），`--dry-run` 预览不写盘，`--remap-assignee` 改写 flow.json 旧 assignee（默认仅报告）
- `openfeel migrate rollback [--dry-run]` — 回滚最近一次迁移（读 `.openfeel/backup/{latest}/manifest.json`），`--dry-run` 仅预览回滚计划
- `openfeel model set <agent> <model> [--scope default|global|project] [--build] [--force]` — 三层级 agent 模型读写，详见 [model 命令组](cli/model.md)
