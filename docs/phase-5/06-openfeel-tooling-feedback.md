# OpenFeel CLI 工具链体验反馈（计划落地视角）

> 提交背景：2026-09-28 会话在 Pantheogen 项目执行「三阶段计划落地」——用 OpenFeel CLI 把正式计划落成 `flow.json` 阶段 + `.openfeel/plan/` 结构，并推进 `v0.0.1` 至方案阶段。以下是 Feel 总统领（主力推理模型驱动）在**把计划落地为流水线**过程中遇到的具体工具链问题，供 OpenFeel 项目维护者参考。
> 关联：本文档为 **CLI/工具链视角**，承接 `docs/04-openfeel-feedback.md`（Agent 与提示词框架视角）。

---

## 一、本次落地做了什么

| 步骤 | 命令 |
|------|------|
| 退役遗留阶段 | `openfeel flow advance --stage phase1 --to done --force` |
| 建分期大纲 | `openfeel roadmap create 0.0` |
| 建三个工作阶段 | `openfeel plan stage add v0.0.1-stage-01`（×3） |
| 推进阶段相位 | `openfeel flow advance --stage v0.0.1-stage-01 --to plan_review / plan_passed / scheme_pending` |
| 建操作方案 | `openfeel plan scheme create "v0.0.1-stage-01" "<title>"`（×4，由 schemer 执行） |

## 二、亮点（建议保留）

1. **`plan stage add` 一步成型**：自动创建 `plan/{series}/stage-NN/`（`overview.md` + `status.md`）并同步注册到 `flow.json`。
2. **`flow advance --dry-run` 实用**：预演合法性检查，避免误改状态机。
3. **自检闭环完整**：`flow health` / `flow repair --dry-run` 能给出可读诊断。
4. **`plan scheme create` 自动编号 + op 注册同步**，模板统一、幂等（已存在不覆盖）。

## 三、问题（按严重度排序）

### 问题 1（高）：缺「移除阶段」命令，遗留阶段只能 force 退役

- **现象**：项目残留一个错误阶段 `phase1`（`phase=plan_pending`），但 `openfeel flow stage` 只有 `add`，`openfeel stage` 只有 `status/set/task/create`，**没有 remove / delete**。
- **处置**：只能 `openfeel flow advance --stage phase1 --to done --force`，把它强推到 `done` 退役。
- **后果**：`flow.json` 永久残留一个 `done` 阶段与一条 `--force` 日志；`flow status` 仍显示「当前活跃阶段: phase1 (done)」直到推进新阶段。
- **建议**：新增 `openfeel flow stage remove <stageId>`，带安全校验（仅允许 `ops` 为空且非当前活跃阶段；或提供 `--force`）。

### 问题 2（高）：`--help` 不自描述 phase 枚举与合法转移，迫使 Agent 翻包源码

- **现象**：`openfeel flow advance --help` 仅写 `--to <phase>（如 exec_running）`，未列出合法 phase 与转移表；Agent 无从得知共有 15 个合法值。
- **处置**：只能读取全局安装包源码 `…/npm/node_modules/openfeel/dist/core/pipeline-schema.js` 才拿到 `PIPELINE_PHASES`。
- **后果**：**违反「工具自描述」原则**，Agent 被迫做计划外只读探查（本次已向用户说明）。
- **建议**：新增 `openfeel flow phases`（列出全部 phase + transitions），或在 `advance --help` 内联转移表。

### 问题 3（高）：stageId 命名 / 目录映射约定未文档化，与计划命名天然冲突

- **现象**：CLI 内部约定 `flow.json.stageId = {version}-stage-{NN}`、目录 `plan/{series}/stage-{NN}/`（`series = 主版本`，如 `v0`；同 series 下 `stage-NN` 不可重复）。但 `--help` 只举例 `v1.0.0-stage-30`，未说明推导规则与唯一性约束。
- **处置**：计划官按版本命名产出 `v0.0.1 / v0.0.2 / v0.0.3`，与 CLI 不兼容；Feel 需自行转换为 `v0.0.1-stage-01` 等。
- **建议**：文档化命名规范；或在 `plan stage add` 收到非法 id 时直接给出「建议名」。

### 问题 4（中）：`plan stage add` 不支持声明依赖（deps）

- **现象**：核心函数 `addStage(projectPath, name, deps)` 支持 `deps`，但 CLI `plan stage add <name>` **不暴露**该参数。
- **后果**：`flow.json.stages[].deps` 恒为空，计划里的 hard/soft 依赖无法落地；schemer 只能另写 `.openfeel/plan/v0/stage-01/deps.yaml` 手工补，而该文件**不被 flow 引擎读取**（与 flow.json 无关联）。
- **建议**：`openfeel plan stage add <name> --deps a,b`；或独立 `openfeel flow deps set <stage> --on <dep>`。

### 问题 5（中）：`auto_advance` 配置优先级两处口径冲突

- **现象**：全局画像 `~/.config/openfeel/profile.yaml` 的 `preferences.auto_advance=enabled` 与项目 `.openfeel/config.yaml` 的 `defaults.auto_advance=disabled` 冲突。AGENTS.md 说「`auto_advance` 优先取全局画像」，而 Feel 系统提示的「自动推进决策纪律」又说按「**项目的** `auto_advance`」判断是否需要询问用户。
- **后果**：Agent 无法判断本次应自动推进还是先询问用户。
- **建议**：统一口径；让 `openfeel config` 输出「**有效值 + 生效来源**」。

### 问题 6（中）：`flow status` 的 `current` 不回退，显示已 done 阶段为「活跃」

- **现象**：关闭 `phase1` 后，`flow status` 显示「当前活跃阶段: phase1 (done)」，`pipeline.current.stage` 仍指向 `phase1`，直到推进新阶段才更新。
- **后果**：多阶段场景下「当前阶段」具有误导性，Agent 必须自行遍历 `stages`。
- **建议**：`current` 指向 `done` / 失效阶段时，自动回退到首个非 `done` 阶段。

### 问题 7（中）：CLI 关键状态变更不写 `flow.json` 审计日志

- **现象**：`plan stage add`、`plan scheme create`（op 注册）等操作**不 append `flow.json` 的 `log`**；只有 `advance_stage_phase` 写了。
- **后果**：落地阶段、创建 op 等关键动作在流水线日志里查不到，审计链断裂，只能靠人工写公域日志补。
- **建议**：所有状态变更类 CLI 操作统一 `appendLog`（`agent='cli'`）。

### 问题 8（低）：非 git 仓库时 `flow advance` 打印 `fatal: not a git repository`

- **现象**：每次 `flow advance` 都输出 `fatal: not a git repository (or any of the parent directories): .git`（来自 `autoCommitOnDone`）。
- **建议**：检测到非 git 项目时静默跳过（可类比冲突检测的非 TTY 静默逻辑）。

### 问题 9（低）：`stage create` 与 `plan stage add` 职责重叠、易混

- **现象**：`openfeel stage create <stageId>` 只注册 `flow.json`（不建目录）；`openfeel plan stage add <name>` 既建目录又注册。两者命名接近、行为不同。
- **建议**：合并，或明确区分命名 / 帮助文本。

## 四、改进建议汇总

| # | 问题 | 建议 | 优先级 |
|:--:|------|------|:--:|
| 1 | 无移除阶段命令 | 新增 `flow stage remove`（带安全校验） | 高 |
| 2 | help 不含 phase / 转移 | 新增 `flow phases` 或内联转移表 | 高 |
| 3 | 命名约定未文档化 | 文档化 + 非法 id 给建议名 | 高 |
| 4 | 无 deps 声明 | `plan stage add --deps` 或 `flow deps set` | 中 |
| 5 | `auto_advance` 口径冲突 | 统一口径 + `config` 显示有效值来源 | 中 |
| 6 | `current` 不回退 | 失效时自动回退首个非 done | 中 |
| 7 | CLI 操作不写审计日志 | 状态变更类操作统一 append log | 中 |
| 8 | 非 git 噪声 | 静默跳过 | 低 |
| 9 | 命令职责重叠 | 合并 / 重命名 | 低 |

## 五、一句话总结

OpenFeel CLI 的「阶段 / 方案 / 推进」能力可用且设计合理（`dry-run`、`health`、自动同步是亮点），但在**「计划 → 流水线」的落地环节缺少自描述与纠错能力**：Agent 必须翻包源码才知道合法 phase 与目录约定，且无法删除误建阶段、无法声明依赖、关键操作不留审计日志。建议优先补齐两类能力——**自描述**（phases / 命名约定）与**可纠错**（remove / deps）。

---

*本文档为 Feel 总统领的一手工具链反馈，供 OpenFeel 项目维护者参考。*
