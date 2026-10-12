---
name: openfeel-cli-usage
description: OpenFeel CLI 命令用法参考：命令清单与关键参数、15 个 phase 枚举与转移表、stageId 命名与目录映射约定、v1.1.2 新增能力（自描述/可纠错、--json 结构化输出、health --fix、scheme draft、knowledge dedup、纠正清理侧命令面）、v1.1.4 新增能力（checkpoint 选择性恢复 --stage/--dry-run、flow stage reset 精准复位、故障恢复路径）、v1.1.5 新增能力（setup --check [--json] 诊断 / 被动部署提示）、v1.1.6 新增能力（Claude Code 适配器 `--tools claude` / settings 注入）、v1.1.7 新增能力（双模式工作流 workflow_mode：flow mode 只读查询 / flow phases --mode 模式分节 / plan stage add --workflow-mode / stage set --workflow-mode / config set --sync-stages --stage）、v1.2.0 新增能力（需求流转命令组 `openfeel req`：需求 7 状态与 10 子命令 / 认领协议；flow.json 版本分片归档 `flow archive`：`<version>` / `list` / `show`）。当需要查询 CLI 命令、参数、phase、stageId、阶段命名时加载。
---

# OpenFeel CLI 用法参考

## 说明

- 定位：**查询型参考手册**（只读，不自执行）。回答「命令是什么、参数怎么给、phase/stageId 规则如何」。
- 边界：**执行型交互向导**请用 `openfeel-wizard` skill（跑 `openfeel flow wizard` 推进流水线）；本 skill 只承载静态知识查阅。
- 与 `openfeel-tool-usage` 协同：工具选择规范见该 skill；本 skill 补充 CLI 命令细节。
- 正文以**能力名**叙述；平台差异见 `### opencode 适配器` / `### Claude Code 适配器` 两小节。

> 本文档为 v1.2.0 快照；命令/参数细节以 `openfeel <cmd> --help`（本仓执行）实时输出为准（CLI 演进后本文档可能滞后）。
>
> ⚠️ **本仓自举**：本仓（openfeel 源码仓库）开发/执行时请用 `node bin/openfeel.js <cmd>`；安装后使用 `openfeel <cmd>`。

## 命令速查

| 命令 | 用途 | 关键参数 |
|------|------|----------|
| `openfeel init [path]` | 初始化项目工作区 | `--lang <zh-CN\|en>`、`--demo`、`--workspace-only`、`--non-interactive` |
| `openfeel setup` | 部署全局框架配置（不建项目 `.openfeel/`）；`--check` 只读诊断全局部署一致性 | `--lang <zh-CN\|en>`、`--check [--json]`、`--tools <list>` |
| `openfeel update [path]` | 部署适配文件到目标项目 | `--lang`、`--force`、`--tools <list>` |
| `openfeel migrate [path]` | Legacy 布局迁移（检测/备份/迁移/回滚） | `--dry-run`、`--remap-assignee`、`--clean-global-core-md`；`migrate rollback` |
| `openfeel flow ...` | 流水线状态管理 | 见下「flow 子命令」 |
| `openfeel flow checkpoint restore` | Checkpoint 恢复（全量 / 选择性 / 预览） | `<file> [--force] [--stage <id>] [--dry-run]`（无 `--stage`=全量覆盖，最后手段；`--stage`=按阶段回退；`--dry-run`=零写盘预览） |
| `openfeel flow stage reset` | 精准复位阶段 phase（`flow advance` 的对称复位，允许回退） | `<stageId> --to <phase> [--dry-run]`（受合法值域 + `to=done` 阻塞 REV 约束） |
| `openfeel plan stage add\|list` | 工作阶段管理 | `add <name> --deps <ids...> --tasks <items...> --exec-mode <manual\|auto> --auto-advance <enabled\|disabled> --workflow-mode <full\|fast>`（初值取 `config.yaml.defaults`；显式选项优先；`--workflow-mode` 覆盖 config 默认） |
| `openfeel plan scheme create\|publish\|rename\|list\|remove\|register` | 操作方案管理 | `create <stage> <title> [--draft]`、`publish <stage> <opId>`、`rename <stage> <opId> --title <text>`、`remove <stage> <opId> [--force] [--dry-run]`、`register <stage> [opId] [--dry-run]`（补注册 fileOrphans） |
| `openfeel stage status\|set\|task` | `status.md` 原子操作 | `set <id> --status/--exec-mode/--auto-advance/--review-agent/--workflow-mode`、`task <id> [no] --add/--done/--undone`（`stage create` 已弃用） |
| `openfeel config ...` | 配置管理 | `get\|set <key> <value> [--global]`（支持全量 `defaults.*`，且 `defaults.X ≡ X`）、`set ... --sync-stages [--stage <ids...>]`（批量写入已注册阶段 `status.md` 的 `自动推进`/`执行模式`/`工作流模式`；`--stage` 限定作用域，单独使用 / 与 `--global` 组合 → exit 1）、`get-lang\|set-lang`、`list-projects`、`effective [key]` |
| `openfeel model set\|get\|list` | 模型三层级配置 | `set <agent> <model>` |
| `openfeel lint i18n\|kb` | 健康检查（i18n 键一致性 / kb 过期引用） | 发现问题**非 0 退出** |
| `openfeel knowledge ...` | 知识库管理 | `list` / `add` / `search` / `index` / `dedup` |
| `openfeel archive <stage>` | 归档指定阶段（汇总产出、生成摘要、提取知识） | `<stage>` |
| `openfeel req ...` | 需求流转（需求管理命令组） | 见「v1.2.0 新增能力（stage-78~84）」节 |
| `openfeel view list\|accept` | 审查条目验收（`add` 已移除，改用 `flow review add`） | — |
| `openfeel project overview` | 项目结构概览 | `overview`（无 `list`/`info` 子命令） |
| `openfeel roadmap create\|show` | 分期大纲管理 | `create <version>`、`show [version]` |
| `openfeel instructions <artifactId>` | 为指定 artifact 生成结构化指令 | `--change <name>`、`--schema <name>`、`--json` |

**flow 子命令**：`status` / `current` / `overview` / `phases` / `mode`（`[--stage <id>] [--json]`，只读） / `stage`（`add` / `remove` / `set --deps` / **`reset <id> --to <phase> [--dry-run]`**）/ `metrics` / `advance`（`--stage <id> --to <phase>`、`--op`、`--force`、`--dry-run`、`--quiet`）/ `attempt` / `log` / `review` / `retry` / `repair` / `ops` / `migrate` / `checkpoint`（`list` / **`restore <file> [--force] [--stage <id>] [--dry-run]`**）/ `health` / `recover` / `wizard` / `archive`（`<version>` / `list` / `show`）。

**纠错/清理侧补充**：`flow review add|resolve|update|remove`；`flow ops list [--stage <id>] [--json]`（操作方案视图，draft 分组展示）；`flow repair [--prune-orphans]`（默认只报告，`--prune-orphans` 仅清键孤儿，单向不删文件）；`plan scheme register`（补注册**文件孤儿**：有 op 文件无注册键 → 写入 flow.json，`--dry-run` 零写盘；与 `flow repair --prune-orphans`（仅清键孤儿）对称）；**`flow stage reset <id> --to <phase>`**（`advance` 的**对称复位**：允许回退，受合法 phase 值域 + `to=done` 阻塞 REV 约束，`--dry-run` 零写盘）；**`flow checkpoint restore <file> --stage <id> [--dry-run]`**（按阶段选择性回退；`--dry-run` 差异预览零写盘）。

> 命令职责分层：`plan stage add`（完整，推荐）> `flow stage add`（仅注册 `flow.json`，不建目录）> `stage create`（已弃用）。

## v1.1.6 新增能力（stage-68~73）

- **多 harness 并存**：`openfeel setup` / `openfeel update` 新增 `--tools <逗号列表>`（如 `opencode,claude`）；非法值 **exit 1** 前置校验零写盘；默认仅 `opencode`。
- **Claude Code 适配器资产**：`--tools claude` 部署 `~/.claude/`——`CLAUDE.md`（全局约束，用户已有内容 append 不覆盖）、`agents/`（**9 个**，含 `feel`）、`skills/`（**18 个**共享源）、`settings.json`（注入 `"agent":"feel"` + `"permissions":{"defaultMode":"auto"}`，用户既有键逐字保留）；默认零触（不带 `--tools` 时 `~/.claude/` 零变化）。

## v1.1.7 新增能力（stage-74~76）

- **双模式工作流（`workflow_mode`）**：值域 `full | fast`（默认 `fast`）。三层载体：`config.yaml defaults.workflow_mode`（项目默认 / 记忆）→ `status.md「工作流模式」`（阶段覆盖，**读取权威**）→ `flow.json` 冗余字段（可选、**不参与级联**）；级联优先序 `status.md > config.yaml > builtin`（`profile.yaml` 不承载）。只读查询：`openfeel flow mode [--stage <id>] [--json]`（当前模式 + 四源 `source`）。
- **fast 快线转移表（并列）**：`transitions` 共 **9 条目**（8 条流转键 + `done` 终止项）：`plan_pending → plan_review`（**计划审查必经**）、`plan_review → plan_passed / plan_pending`、`plan_passed → exec_running`、`exec_running → review_pending`、`review_pending → review_failed / review_passed`、`review_failed → review_pending / exec_running`（回环）、`review_passed → archiving`、`archiving → done`、`done`（终态）。**`phases` / `advanceAccepted` 恒 15 项、模式无关**；fast 下 6 个相位不可达（`scheme_*` / `test_*`）。
- **模式命令面**：`plan stage add --workflow-mode <full|fast>`（值域派生、非法 exit 1 不建阶段）、`stage set <id> --workflow-mode <full|fast>`（缺失字段插入）、`flow phases [--mode <full|fast>] [--stage <id>]`（模式分节；`--json` 追加 `workflowMode`）、`config set ... --sync-stages [--stage <ids...>]`（同步字段含「工作流模式」）。
- **`config effective` 四键**：`auto_advance` / `execution_mode` / `merge_mode` / `workflow_mode`。

## v1.2.0 新增能力（stage-78~84）

- **flow.json 版本分片归档（`flow archive`）**：按版本号归档已收官历史（判据门：该版本全部阶段 done + 无 blocking open REV；归档文件落 `.openfeel/flow-archive/{version}.json`）。三个入口：`openfeel flow archive <version>`（执行归档；`--dry-run` 预览零写盘、`--json` 结构化输出）、`openfeel flow archive list`（列举已归档版本，只读）、`openfeel flow archive show <version>`（查看指定归档版本，只读）。**与顶层 `openfeel archive <stage>` 区分**：顶层命令是**阶段摘要归档**，`flow archive` 是 **flow.json 版本分片归档**，二者职责不同；常规命令不读 `.openfeel/flow-archive/**`（`flow health` 仅目录清单级对账）。
- **需求流转（`openfeel req`）**：需求层命令组（10 子命令：`add` / `list` / `show` / `claim` / `release` / `set` / `link` / `advance` / `board` / `next`）。需求 7 状态（`draft` / `scheduled` / `in_progress` / `done` / `blocked` / `cancelled` / `rejected`）；**需求进度由关联阶段 phase 聚合**（全部关联阶段 done → 需求自动 done）；认领协议 = `owner` + `claimed_at` 占用校验（无 TTL）。需求正文 `.openfeel/requirements/REQ-NNN.md` 为人读副本，**机读权威恒为 flow.json**。用法权威源见 `openfeel-req` skill；**v1.2.0 起提供**。

## v1.1.5 新增能力（stage-67）

- **主动诊断 `openfeel setup --check [--json]`**：只读检测全局部署版本（`~/.openfeel/update_state.json.openfeel_version`）与 CLI 版本一致性，**不执行部署**；一致退出 `0`，`mismatch`/`missing`/`unknown` 退出 `1`；`--json` 输出 `{schemaVersion,status,cliVersion,deployedVersion}`（`status` ∈ `ok|mismatch|missing|unknown`）。
- **被动部署提示**：任意命令 / REPL 在 TTY 下检测到全局部署漂移（`mismatch`）或缺失（`missing`）时，向 **stderr** 提示运行 `openfeel setup`；**每进程一次**；`--json`/`--quiet`/`--version`/`--help`、CI、`OPENFEEL_NO_UPDATE_CHECK` 及部署类命令（`setup`/`update`/`init`/`migrate`）静默；`unknown`（state 损坏）被动静默、仅 `--check` 显式报告；**不改退出码、不写盘**。

## 升级流程

### opencode 适配器

```bash
npm i -g openfeel@latest   # 1. 升级 CLI
openfeel setup             # 2. 重跑部署，刷新全局 AGENTS.md/agents/skills/opencode.jsonc
# 3. 重启 harness（opencode）以加载新的全局配置
```

仅 `npm i -g` 不会刷新全局资产，须重跑 `openfeel setup` 并重启 harness。`openfeel setup --check` 可诊断全局部署版本与 CLI 版本是否一致（一致退出 0，否则退出 1）。

### Claude Code 适配器

```bash
npm i -g openfeel@latest       # 1. 升级 CLI
openfeel setup --tools claude  # 2. 重跑部署（claude 目标）
```

- **`--tools` 由 v1.1.6 提供**：`openfeel setup --tools claude`；首次创建 `~/.claude/{agents,skills}` 后**重启会话或 `/reload-skills`** 使新 skill/agent 生效。
- 首次创建 `~/.claude/{agents,skills}` 后需**重启会话或 `/reload-skills`** 使新 skill/agent 生效。
- `CLAUDE.md` 于**下次会话**生效。

## v1.1.2 新增能力（stage-41~55）

> 以下为 v1.1.2 相对上版的增量能力（分组摘要，细节以 `<cmd> --help` 为准）。

- **A. 自描述与可纠错（stage-41）**：`flow phases [--json] [--mode <full|fast>] [--stage <id>]`（**6 键**：`schemaVersion`/`phases`/`transitions`/`advanceAccepted`/`transitionsDiff`/`workflowMode`（v1.1.7 追加）；既有五键语义逐字不变）、`flow stage remove [--force] [--dry-run] [--purge]`、stageId 校验/冲突检测（`validateStageId` / `suggestStageId` / `findStageDirConflict`）、`plan stage add --deps`。
- **B. 状态与口径（stage-42）**：`config effective [key]`（有效值 + 生效来源 `status.md > config.yaml > profile.yaml > builtin`）、`pipeline.phase` 全量 done 判定、审计日志 `register_stage` / `register_op`。
- **C. 部署与备份（stage-46）**：覆盖写前自动备份 `~/.openfeel/backup/{ts}/` + `update_infos.md`「备份」类条目（Agent 按 `feel.md` 检查规则核对）。
- **D. 纠正/清理侧命令面（stage-51/52，v1.1.4-stage-64 补 register）**：`plan scheme remove`（仅删 `flow.json` 注册键，不删 op 文件；done/checkpoint 保护）、`plan scheme register <stage> [opId] [--dry-run]`（对称补全：补注册 fileOrphans，`--dry-run` 零写盘；**`create` 序号基于「ops/ 文件 ∪ flow.json 注册」的最小未用正整数（空位回填），创建后对目标阶段未注册文件输出 stderr 告警并提示 `plan scheme register`**）、`plan scheme rename --title`（必填，空标题报错）、`plan scheme publish` + `create --draft`（draft→pending，空模板拒绝）、`flow stage set --deps`（覆盖写入；**不带 `--deps` 视为清空**）、`flow review update|remove`、`stage set`（**幂等**：同值 no-op + 同值不生成 `.bak`；`--exec-mode <manual\|auto>` / `--auto-advance <enabled\|disabled>` / `--review-agent <agent>`）、`stage task --add|--done|--undone`、`plan stage add --tasks`/`--exec-mode`/`--auto-advance`（显式覆盖 config 默认）、`flow repair --prune-orphans`、`flow health --fix [--dry-run]`（默认只报告；`--fix` **仅回写 status.md「状态」字段**；`--dry-run` 预览零写盘）、`flow ops list`、`flow advance --quiet` + `--to <远距 phase>`（存在唯一路径时自动逐步；`--dry-run` 展示完整路径）、`knowledge dedup`（检索相似条目，**只读建议，不修改 kb**）。`flow attempt` 对 **draft op 拒绝**。
- **E. 输出/门禁/约定（stage-50/52）**：`flow status/current/health/metrics/overview --json`（纯 JSON 单文档，含 `schemaVersion`）、`lint i18n`/`lint kb` **非 0 退出**（门禁语义，无逃生阀）、`config set/get` 支持**全量 `defaults.*`**（`defaults.` 前缀与 bare key 等价；`--sync-stages` 仅项目模式，适用键 `auto_advance`/`execution_mode`，其它键跳过报告；Schema 驱动键白名单 + 值类型归一 + 枚举校验，非法报错不写盘）、`view add` **已移除**（改用 `flow review add`）、`NO_COLOR` 环境变量 / `--no-color`。

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

**fast 快线转移表（`workflow_mode=fast`）** —— `transitions` 共 **9 条目**（8 条流转键 + `done` 终止项），快线链（可达相位序列）为 `plan_pending → plan_review → plan_passed → exec_running → review_pending → review_failed → review_passed → archiving → done`：

| phase | 合法目标 |
|-------|----------|
| `plan_pending` | `plan_review` |
| `plan_review` | `plan_passed`, `plan_pending` |
| `plan_passed` | `exec_running` |
| `exec_running` | `review_pending` |
| `review_pending` | `review_failed`, `review_passed` |
| `review_failed` | `review_pending`, `exec_running` |
| `review_passed` | `archiving` |
| `archiving` | `done` |
| `done` | （终态） |

> `phases` / `advanceAccepted` 恒 15 项（模式无关）；fast 下 `scheme_pending` / `scheme_review` / `scheme_passed` / `test_pending` / `test_failed` / `test_passed` 共 **6 项**不可达（无入边）。

- 转移表以**运行时** `.openfeel/pipeline.yaml` 为准；`openfeel flow phases` 查看当前生效值。（`--mode <full|fast>` 显式指定 / `--stage <id>` 按阶段派生；`--json` 追加 `workflowMode`）
- 推进：`openfeel flow advance --stage <id> --to <phase>`。**`advanceAccepted` = 内置 15 个 phase 的「推进白名单」**（`flow advance` 只接受这 15 个值），**不是**组合式条件键的替代品（旧文案曾误述，此处已更正）。**组合式条件差异**（如内置默认含 `review_passed|test_passed`，本仓 `pipeline.yaml` 未列）经 `--json.transitionsDiff.missing` **显式可见**（stage-50 裁定：**不补组合键**，改以 `transitionsDiff` 显式化）。
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
6. **故障恢复路径（v1.1.4-stage-65，顺序即优先级）**：
   ```
   ① flow health（诊断，只报告）
   ② flow stage reset <id> --to <phase>（精准复位单阶段）       ← 首选
   ③ checkpoint restore <file> --stage <id> --dry-run（预览）→ 去 --dry-run 执行（按阶段回退）
   ④ checkpoint restore <file>（无 --stage，全量覆盖）          ← 最后手段
   ⑤ flow health --fix（对账 status.md「状态」，仅该字段）
   ```
   **「全量 restore 为最后手段」**（多阶段并行时跨阶段连带回退）；`flow stage reset`/`checkpoint restore` 改写 `flow.json`，`flow health --fix` 仅回写 `status.md` 的「状态」字段。

## 权限模型要点

### opencode 适配器

- 9 个 agent 内联 `permission:` 白名单，均含 `external_directory: "allow"`（单一键，无读写粒度）。
- **合并语义**：agent `.md` frontmatter 与 `opencode.jsonc` 按权限键**深合并**，同名键以 agent `.md` 为准（配置文件无法覆盖已声明键）。
- **收紧入口**：项目根 `.opencode/agent/<name>.md` 覆盖全局同名 agent 并重写完整 `permission` 块；勿手改全局 agent frontmatter（会被 `update` 覆盖）。
- 详 `.openfeel/manual/core/permission.md`。

### Claude Code 适配器

- subagent 于 frontmatter 声明 `tools`（白名单，未列即不可用）、`disallowedTools`（黑名单）与 `permissionMode`。
- **无 `external_directory` 对等概念**。
- `settings.json` 由 `openfeel setup/update --tools claude` 注入（`agent:"feel"` + `permissions.defaultMode:"auto"`，用户键保留），**v1.1.6 起**。

## 与 openfeel-wizard 的区别

| 维度 | `openfeel-cli-usage`（本 skill） | `openfeel-wizard` |
|------|--------------------------------|-------------------|
| 定位 | 查询型**参考手册**（只读静态知识） | 执行型**交互向导**（跑 `openfeel flow wizard`） |
| 动作 | 回答「命令/参数/phase/stageId 是什么」 | 逐步选择并推进阶段 phase |
| 前置 | 无 | 需交互式 TTY（非 TTY 用 `flow advance --stage <id> --to <phase>`） |

> wizard skill 正文已交叉引用本 skill；二者正文互引，边界为「查手册 vs 跑向导」。
