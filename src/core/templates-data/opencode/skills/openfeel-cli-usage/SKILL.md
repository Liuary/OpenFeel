---
name: openfeel-cli-usage
description: OpenFeel CLI 命令用法参考：命令清单与关键参数、15 个 phase 枚举与转移表、stageId 命名与目录映射约定、本版本新增能力（flow phases、flow stage remove、plan stage add --deps、config effective、部署备份）。当需要查询 CLI 命令、参数、phase、stageId、阶段命名时加载。
---

# OpenFeel CLI 用法参考

## 说明

- 定位：**查询型参考手册**（只读，不自执行）。回答「命令是什么、参数怎么给、phase/stageId 规则如何」。
- 边界：**执行型交互向导**请用 `openfeel-wizard` skill（跑 `openfeel flow wizard` 推进流水线）；本 skill 只承载静态知识查阅。
- 与 `openfeel-tool-usage` 协同：工具选择规范见该 skill；本 skill 补充 CLI 命令细节。

> 本文档为 v1.1.2 快照；命令/参数细节以 `openfeel <cmd> --help`（本仓执行）实时输出为准（CLI 演进后本文档可能滞后）。
>
> ⚠️ **本仓自举**：本仓（openfeel 源码仓库）开发/执行时请用 `node bin/openfeel.js <cmd>`；安装后使用 `openfeel <cmd>`。

## 命令速查

| 命令 | 用途 | 关键参数 |
|------|------|----------|
| `openfeel init [path]` | 初始化项目工作区 | `--lang <zh-CN\|en>`、`--demo`、`--workspace-only`、`--non-interactive` |
| `openfeel setup` | 部署全局框架配置（不建项目 `.openfeel/`） | `--lang <zh-CN\|en>` |
| `openfeel update [path]` | 部署适配文件到目标项目 | `--lang`、`--force` |
| `openfeel migrate [path]` | Legacy 布局迁移（检测/备份/迁移/回滚） | `--dry-run`、`--remap-assignee`、`--clean-global-core-md`；`migrate rollback` |
| `openfeel flow ...` | 流水线状态管理 | 见下「flow 子命令」 |
| `openfeel plan stage add\|list` | 工作阶段管理 | `add <name> --deps <ids...>` |
| `openfeel plan scheme create\|list` | 操作方案管理 | `create <stage> <title>` |
| `openfeel stage status\|set\|task` | `status.md` 原子操作 | `set <id> --status <v>`、`task <id> <no>`（`stage create` 已弃用） |
| `openfeel config ...` | 配置管理 | `get\|set [--global]`、`get-lang\|set-lang`、`list-projects`、`effective [key]` |
| `openfeel model set\|get\|list` | 模型三层级配置 | `set <agent> <model>` |
| `openfeel lint i18n\|kb` | 健康检查（i18n 键一致性 / kb 过期引用） | — |
| `openfeel knowledge ...` | 知识库管理 | `list` 等 |
| `openfeel archive <stage>` | 归档指定阶段（汇总产出、生成摘要、提取知识） | `<stage>` |
| `openfeel view list\|accept` | 审查条目管理（`add` 已移除，改用 `flow review add`） | — |
| `openfeel project ...` | 项目管理与概览 | `list` 等 |
| `openfeel roadmap create\|show` | 分期大纲管理 | `create <version>`、`show [version]` |
| `openfeel instructions <artifactId>` | 为指定 artifact 生成结构化指令 | `--json` |

**flow 子命令**：`status` / `current` / `overview` / `phases` / `stage` / `metrics` / `advance`（`--stage <id> --to <phase>`、`--op`、`--force`、`--dry-run`）/ `attempt` / `log` / `review` / `retry` / `repair` / `checkpoint` / `health` / `recover` / `wizard`。

**本版本（v1.1.2）新增**：

| 命令 | 说明 |
|------|------|
| `openfeel flow phases [--json]` | 自描述全部合法 phase 与运行时转移表；`--json` 输出 `{ phases, transitions, advanceAccepted }` |
| `openfeel flow stage remove <stageId> [--force] [--dry-run] [--purge]` | 移除阶段。安全校验：`ops` 非空 / 当前活跃阶段 / 被其它阶段依赖时默认拒绝；`--force` 越过；`--dry-run` 仅预览；`--purge` 于 `save()` 成功后删除 `plan/{series}/{stageDir}/` 目录 |
| `openfeel plan stage add <name> [--deps <ids...>]` | **完整入口**：建目录 + `overview.md`/`status.md` + 注册 `flow.json`；`--deps` 支持空格或逗号分隔 |
| `openfeel config effective [key]` | 输出配置**有效值 + 来源**；省略 key 时输出四键（`execution_mode` / `auto_advance` / `test_enabled` / `merge_mode`） |

> 命令职责分层：`plan stage add`（完整，推荐）> `flow stage add`（仅注册 `flow.json`，不建目录）> `stage create`（已弃用）。

## phase 枚举与转移表

15 个 phase（`plan_pending` … `done`）：

```
plan_pending → plan_review → plan_passed → scheme_pending → scheme_review
→ scheme_passed → exec_running → review_pending → review_passed → test_pending
→ test_passed → archiving → done
```

| phase | 合法目标 |
|-------|----------|
| `plan_pending` | `plan_review`, `plan_passed` |
| `plan_review` | `plan_passed`, `plan_pending` |
| `plan_passed` | `scheme_pending` |
| `scheme_pending` | `scheme_review`, `scheme_passed` |
| `scheme_review` | `scheme_passed`, `scheme_pending` |
| `scheme_passed` | `exec_running` |
| `exec_running` | `review_pending`, `scheme_pending` |
| `review_pending` | `review_failed`, `review_passed` |
| `review_failed` | `review_pending`, `scheme_pending` |
| `review_passed` | `test_pending` |
| `test_pending` | `test_failed`, `test_passed` |
| `test_failed` | `test_pending`, `scheme_pending` |
| `test_passed` | `archiving` |
| `archiving` | `done` |
| `done` | （终态） |

- 转移表以**运行时** `.openfeel/pipeline.yaml` 为准；`openfeel flow phases` 查看当前生效值。
- 推进：`openfeel flow advance --stage <id> --to <phase>`（组合条件路径另见 `advanceAccepted`）。
- 参考：`.openfeel/manual/**`（CLI/flow 模块文档）。

## stageId 命名与目录映射

| 格式 | 示例 | series / stageDir |
|------|------|-------------------|
| 完整四级 | `v1.1.2-stage-43` | `v1` / `stage-43` |
| 历史短版 | `v4-stage-04` | `v4` / `stage-04` |
| 短名 | `stage-01` | `v1`（默认）/ `stage-01` |

- `series = v{MAJOR}`；目录映射 `.openfeel/plan/{series}/stage-{NN}/`。
- 唯一性：`(series, stageDir)` 冲突（如 `v4-stage-04` 与 `v4.0.0-stage-04` 映射同目录）会被 `findStageDirConflict` 检出并阻止；非法输入由 `validateStageId` 报原因 + `suggestStageId` 给建议名（`NN` 限定在同 series 内 max+1）。
- 权威实现与三级回退：见 `.openfeel/manual/core/plan-path.md`。

## 典型场景

1. **落地新阶段**：`openfeel plan stage add v1.1.2-stage-43`（建目录 + 注册）→ `openfeel flow advance --stage v1.1.2-stage-43 --to plan_pending` 起步。
2. **声明依赖**：`openfeel plan stage add v1.1.2-stage-43 --deps v1.1.2-stage-41 v1.1.2-stage-47`（写入 `overview.md`「## 依赖」+ `flow.json.stages[].deps`）。
3. **纠错移除误建阶段**：`openfeel flow stage remove v1.1.2-stage-43 --dry-run` 预览 → 确认后 `--force`（必要时 `--purge` 删目录）。
4. **查询有效配置**：`openfeel config effective auto_advance`（来源优先级 `status.md` > `config.yaml` > `profile.yaml` > `builtin`）。
5. **部署前备份**：`setup`/`update`/`init`/`migrate` 覆盖写入前自动备份至 `~/.openfeel/backup/{ts}/`；`update_infos.md` 会新增「备份」类条目，Agent 须按 `feel.md` 检查规则核对（存在性 + 失败重跑）。

## 权限模型要点

- 9 个 agent 内联 `permission:` 白名单，均含 `external_directory: "allow"`（单一键，无读写粒度）。
- **合并语义**：agent `.md` frontmatter 与 `opencode.jsonc` 按权限键**深合并**，同名键以 agent `.md` 为准（配置文件无法覆盖已声明键）。
- **收紧入口**：项目根 `.opencode/agent/<name>.md` 覆盖全局同名 agent 并重写完整 `permission` 块；勿手改全局 agent frontmatter（会被 `update` 覆盖）。
- 详 `.openfeel/manual/core/permission.md`。

## 与 openfeel-wizard 的区别

| 维度 | `openfeel-cli-usage`（本 skill） | `openfeel-wizard` |
|------|--------------------------------|-------------------|
| 定位 | 查询型**参考手册**（只读静态知识） | 执行型**交互向导**（跑 `openfeel flow wizard`） |
| 动作 | 回答「命令/参数/phase/stageId 是什么」 | 逐步选择并推进阶段 phase |
| 前置 | 无 | 需交互式 TTY（非 TTY 用 `flow advance --stage <id> --to <phase>`） |

> wizard skill 正文已交叉引用本 skill；二者正文互引，边界为「查手册 vs 跑向导」。
