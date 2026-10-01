# OpenFeel 工具链反馈（三）：可编排性与可观测性

> 提交背景：2026-09-29 ~ 10-01，Pantheogen 项目。本会话完整跑完 **19 个阶段（v0.0.1 ~ v0.3.0.3-stage-19）**，涵盖四个开发周期与三期补充子版本，累计 CLI 调用**数百次**、跨 agent 委托**上百次**。本文档聚焦**「长时间、多阶段自动推进」场景下的 CLI 可编排性与可观测性缺口**，供 OpenFeel 维护者参考。
> 关联：`docs/06-openfeel-tooling-feedback.md`（计划落地视角）、`docs/07-openfeel-permission-issue.md`（权限模型）、`docs/08-openfeel-workflow-feedback.md`（状态维护与可维护性）。**本文只记新增项，不重复前作**。

---

## 一、本会话的规模（说明为何这些缺口重要）

| 指标 | 数值 |
|------|------|
| 完成阶段 | 19（全部 `done`） |
| 里程碑 | M1 ~ M17 |
| 相位推进 | 每阶段约 5~7 次 `flow advance`，累计 **上百次** |
| `stage set` 校正 | 单次批量修正 **11 个阶段**（逐条调用） |
| op 文件中文名改名 | **7 个阶段的方案官各自手工改名** |
| 委托下游 agent | 上百次（planner / schemer / executor / reviewer / archiver / utility） |

**核心结论**：单阶段使用时体验尚可；一旦进入「多阶段长链自动推进」，**缺少批量操作、缺少机器可读输出、缺少自愈能力**这三类缺口会持续放大——每一次推进都是多次人工拼接，且状态漂移只能靠人工发现。

---

## 二、新问题清单（按严重度）

### 问题 1（高）：CLI 无机器可读输出，且 Windows 控制台中文乱码

- **现象**：`openfeel flow status` / `flow health` / `current` 等的输出在 Windows PowerShell 下**中文大面积乱码**（GBK 控制台 vs UTF-8 输出），Agent 难以可靠解析；且**无 `--json` 等结构化输出**。
- **本会话的实际影响**：Feel 多次**放弃解析 CLI 输出**，改为直接 `read` 文件（`flow.json` / `status.md`）来确认状态——CLI 的「权威性」被绕过，容易与实际不符。
- **建议**：① 强制 UTF-8 输出（或提供 `--encoding`）；② 提供 `--json` 机器可读输出；③ 尊重 `NO_COLOR` / 提供 `--no-color`。

### 问题 2（高）：无「状态批量校正」能力，`flow health` 只报不改

- **现象**：`flow advance --stage <id> --to done` 后，该阶段 `status.md` 的 `状态` 字段**仍停留在 `review_passed`** → `flow health` 一次性报出 **11 条**「flow.json 状态 done vs status.md review_passed」不一致；CLI **没有 `--fix`**，只能**逐阶段** `flow stage set <id> --status done`（本会话连续 11 次调用）。
- **建议**：① `flow health --fix`（按 flow.json 权威反向同步 `status.md`）；② 或让 `flow advance` 在推进时**自动同步** `status.md` 的状态字段；③ 或提供 `flow sync` 批量对账命令。

### 问题 3（中）：正常中间态被误报为错误

- **现象**：`plan stage add <id>` 之后、首个 `plan scheme create` 之前，`flow health` 报 **「current 指向不存在的 op: <stage>.op-001」**——但这段窗口是**正常的建阶段流程**。
- **建议**：无 op 的阶段应视为 `pending`/`空阶段`（提示级），而非错误级。

### 问题 4（中）：Agent 任务中断后无恢复检测

- **现象**：本会话有一次方案官任务被中断——它用 CLI 建好了 5 个 op，但**内容未填充**（仍为 `## 实施步骤 - [ ] 待补充` 模板），且已注册进 `flow.json` 为 `pending`。
- **影响**：**无法通过 CLI 检测**「已注册但为空模板」的 op；靠人工读文件才发现并重新派发填充任务。
- **建议**：① `flow ops list [--stage <id>]` 展示 op 状态与**模板填充度**；② 对空模板 op 给 warning；③ `plan scheme create` 支持**先建后填**的显式两阶段（建为 `draft`，填充后转 `pending`）。

### 问题 5（中）：相位推进只能逐步调用，无路径预览/一次到位

- **现象**：一个阶段从 `plan_pending` 到 `exec_running` 需连续 5 次 `advance`（且顺序不可错）；本会话曾因**漏掉 `scheme_pending`** 触发报错。
- **说明**：CLI 的**拒绝是正确的**（并给出了合法目标列表，值得肯定），但缺少「一次到位 + 路径确认」的能力。
- **建议**：`flow advance --to <phase>` 支持**自动沿合法路径逐步推进**（并 `--dry-run` 打印路径），把「5 次人工拼接」降为 1 次意图表达。

### 问题 6（中）：op 元数据（标题）无更新命令

- **现象**：本会话 `v0.3.0.2-stage-16` 的 `flow.json` 中 `op-004`/`op-005` 标题**互补错位**（源自中断重派），CLI **无任何命令**可修正（`plan scheme` 仅有 `create`/`list`）。
- **处置**：只能登记为 `resolved`（cosmetic，op 文件为权威）——**状态永久不洁**。
- **建议**：`plan scheme rename <stage> <opId> --title "…"`。

### 问题 7（低，复发）：op 文件名含中文/空格，方案官每阶段都要手工改名

- **现象**：`plan scheme create` 生成 `op-NNN_{中文标题}.md`，与项目约定 `op-NNN.md` 不符。本会话 **7 个阶段的方案官各自手工改名**（且中文名在部分工具链下易断链）。
- **建议**：文件名固定 `op-NNN.md`，标题写入文件**内容首行**。（承接 `docs/08` 问题 11，此处以**复发统计**佐证其优先级应上调。）

### 问题 8（低，复发）：公共日志目录两套布局并存

- **现象**：`log/2026-09-28/` 与 `log/2026/10/01/` **同时存在**并被不同 agent 使用，索引各自维护。
- **建议**：统一布局并在 `openfeel init` 固化，提供迁移命令。（承接 `docs/08` 问题 10。）

---

## 三、建议汇总

| # | 问题 | 建议 | 优先级 |
|:--:|------|------|:--:|
| 1 | 无机器可读输出 / 控制台乱码 | UTF-8 + `--json` + `NO_COLOR` | 高 |
| 2 | 无批量状态校正 | `flow health --fix` / `flow advance` 自动同步 status.md | 高 |
| 3 | 正常中间态误报错误 | 无 op 阶段降为提示级 | 中 |
| 4 | 中断后无恢复检测 | `flow ops list` + 空模板 warning + draft→pending | 中 |
| 5 | 推进只能逐步调用 | `advance --to <phase>` 自动逐步 + `--dry-run` 路径预览 | 中 |
| 6 | op 标题不可改 | `plan scheme rename` | 中 |
| 7 | op 文件名含中文 | 固定 `op-NNN.md`（**复发，建议上调优先级**） | 低→中 |
| 8 | 日志目录双布局 | 统一 + 迁移（复发） | 低 |

---

## 四、一句话总结

本会话把流水线跑到了 **19 个阶段、4 个周期**，CLI 单点能力可靠、拒绝非法操作也很准确；但**「长链自动推进」缺三样东西**——**批量编排**（一次到位/批量校正）、**机器可读**（`--json`/UTF-8）、**自愈恢复**（`--fix`/空模板检测）。补齐这三样，OpenFeel 才能从「能支撑单阶段自动化」走到「能支撑整周期无人值守」。

---

*本文档为 Feel 总统领的第三轮工具链反馈，供 OpenFeel 项目维护者参考。*
