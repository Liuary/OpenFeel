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
src/commands/setup.ts       registerSetupCommand
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

**结构化错误分流（stage-47）**：`plan stage add` / `flow stage add` / `stage create` 三入口在通用 `common.errorTmpl` 之前增加 `err instanceof StageDirConflictError` 分支 → 用 `common.stageDirConflictTmpl`（zh/en 对称）渲染冲突信息（含 `stage` / `other`），杜绝「核心层抛中文错误绕过 `t()`」的死键问题（`cli/BUG-002`）。

## 关键命令示例

> ⚠️ 本仓执行一律用 `node bin/openfeel.js <cmd>`；全局 `openfeel` 可能命中旧版（如 1.1.1）。安装后的一般使用者用法 `openfeel <cmd>`（查询型）见 `manual/index` / skill 说明。

- `node bin/openfeel.js flow advance --stage <id> --to <phase> [--dry-run] [--force]` — 推进阶段（经 FlowManager 校验）；`--dry-run` 预览不修改，`--force` 跳过非法 phase 和阶段跳跃检查
- `node bin/openfeel.js flow phases [--json]` — 自描述全部合法 phase 与运行时流转映射（数据源 `.openfeel/pipeline.yaml`，缺省回退默认表）；运行时含内置 15 之外的 phase 时追加**边界说明**，`--json` 结构为 `{ phases, transitions, advanceAccepted }`（`advanceAccepted` = 内置 15，即 `flow advance` 的推进白名单；`phases` 为存在视图）
- `node bin/openfeel.js flow stage add <stageId>` — 注册层：仅注册 flow.json，不建目录（通常应使用 `node bin/openfeel.js plan stage add`）
- `node bin/openfeel.js flow stage remove <stageId> [--force] [--dry-run] [--purge]` — 移除阶段（安全校验：ops 非空 / 当前活跃 / 被 deps 引用；默认仅注销 flow.json，`--purge` 删目录且**在 `save()` 成功后**执行，避免「目录已删、注册仍在」中间态）
- `node bin/openfeel.js flow wizard` — 交互式流水线向导，支持无阶段时自动引导创建首个阶段
- `node bin/openfeel.js flow health --quick` — 流水线健康检查
- `node bin/openfeel.js stage set <id> --status <v>` — 更新阶段状态
- `node bin/openfeel.js plan stage add <name> [--deps <ids...>]` — 完整入口（推荐）：建目录 + overview/status + 注册 flow.json + 依赖落点
- `node bin/openfeel.js stage create <stageId>` — 已弃用（注册层，与 `flow stage add` 等价；建议改用 `plan stage add` / `flow stage add`）
- `node bin/openfeel.js migrate [path] [--dry-run] [--remap-assignee] [--clean-global-core-md]` — 存量旧布局项目迁移（检测/备份/迁移/回滚），`--dry-run` 预览不写盘，`--remap-assignee` 改写 flow.json 旧 assignee（默认仅报告），`--clean-global-core-md` 删除已废弃的全局 core.md（默认仅提示不删）
- `node bin/openfeel.js migrate rollback [--dry-run]` — 回滚最近一次迁移（读 `.openfeel/backup/{latest}/manifest.json`），`--dry-run` 仅预览回滚计划
- `node bin/openfeel.js setup [--lang <zh-CN|en>]` — 纯全局部署（全局 AGENTS.md + agent + skill + 全局平台适配器配置（opencode.jsonc）），不建立项目 `.openfeel/`，幂等（详见 [setup 命令](cli/setup.md)）
- `node bin/openfeel.js init [path] [--workspace-only] [--non-interactive]` — 项目初始化；`--workspace-only` 仅创建 `.openfeel/` 工作区（不建全局规则/平台适配器配置（AGENTS.md/opencode.jsonc）），供 Feel 空白项目自动搭建；**已存在的 `.openfeel/config.yaml` 不覆盖**（保留用户配置，`InitResult.skipped` 经 `init.skipped` 输出用户可见提示，stage-47）
- `node bin/openfeel.js model set <agent> <model> [--scope default|global|project] [--build] [--force]` — 三层级 agent 模型读写，详见 [model 命令组](cli/model.md)
- `node bin/openfeel.js config effective [key]` — 输出四个受管配置键的有效值 + 生效来源（`status.md > config.yaml > profile.yaml > builtin`）；复用 `FlowManager.resolveEffectiveConfig()` 单一权威，与 `flow status --verbose` 级联表同源；未知 key → stderr + exit 1（不静默）
- `node bin/openfeel.js config get [key] [--global]` / `node bin/openfeel.js config set <key> <value> [--global]` — 原始值读写（不经级联解析）；`config get-lang` / `set-lang <lang>` / `list-projects` 为全局语言子命令

## 相关 skill

- **`openfeel-cli-usage`**（CLI 用法参考，**查询型**）：命令清单与关键参数、15 个 phase 枚举与转移表、stageId 三格式与目录映射约定、典型场景、权限要点；含**快照声明**「本文档为 v1.1.2 快照，命令/参数细节以 `node bin/openfeel.js <cmd> --help` 实时输出为准」（防文档-实现发散）。与 `openfeel-wizard`（**执行型**交互向导）职责分离、正文互引。
  - 权威源：`src/core/templates-data/opencode/skills/openfeel-cli-usage/SKILL.md`（**扁平单文件、中文单语**）；经 `npm run build` 双注入（`update.ts` 的 `SKILL_DEFINITIONS` / `template-loader.ts` 的 `OPENCODE_SKILL_DEFINITIONS`）并自举 `.opencode/skills/**`；部署至 `~/.config/opencode/skills/`（**生成物禁手改**）。skill 总数 **17**。
  - 维护触发：新增/修改 CLI 命令、phase 枚举或 stageId 约定时，须同批更新该 skill 权威源 + 跑 build（详见 `manual/index.md` 维护规则「skill 体系」行）。
