# OpenFeel 工具链反馈（二）：流水线状态维护与 CLI 可维护性

> 提交背景：2026-09-29 ~ 09-30，Pantheogen 项目。本会话连续推进 **13 个阶段（v0.0.1 ~ v0.3.0-stage-12）**，全程使用 OpenFeel CLI 管理 `flow.json` / 计划目录 / 阶段状态。过程中暴露出**「状态一旦写错就修不回来」**这一类系统性问题，本文件逐条记录，供 OpenFeel 维护者参考。
> 关联：`docs/06-openfeel-tooling-feedback.md`（计划落地视角）、`docs/07-openfeel-permission-issue.md`（权限模型）。

---

## 一、核心结论（先说最重要的）

OpenFeel CLI 在**「创建」侧能力齐备**，但在**「纠正 / 清理」侧近乎空白**：

- 能创建阶段、创建 op、推进相位，但**不能删除阶段、不能删除 op、不能设置阶段依赖**；
- 一旦某次操作**多创建了条目**（本会话实际发生），**没有任何 CLI 手段可回收**，只能永久残留或**违规手改 `flow.json`**。

这导致一条硬性纪律——「禁止手动编辑 flow.json」——在**故障恢复场景下无解**。

---

## 二、问题清单（按严重度）

### 问题 1（高）：op 条目只增不减，孤儿条目无法回收

- **现象**：`openfeel plan scheme create` 每次调用都会向 `flow.json` 的 `stages[].ops` **追加**一个 op 条目。本会话方案官（openfeel-schemer）在 stage-10 一次多创建了 5 个（`op-006 ~ op-010`），生成的模板文件已删除，但 **`flow.json` 中 5 个条目永久残留**（`state=pending`）。
- **实测**：`openfeel flow repair --dry-run` 输出「未检测到需要修复的问题」——**不清理孤儿 op**；`openfeel flow stage` 只有 `add`；`openfeel plan scheme` 只有 `create`/`list`。**无任何删除子命令**。
- **后果**：流水线「操作数」虚高（本会话 stage-10 显示 10 个 op，实际有效 5 个）；后续 Agent 可能对不存在的 op 调度；审计链出现幽灵条目。
- **建议**：新增 `openfeel plan scheme remove <stage> <opId>`（带校验：文件不存在 / 无 checkpoint / 非 done 时可删）；`flow repair` 增加「孤儿 op 检测与清理」。

### 问题 2（高）：`flow.json` 手工编辑是唯一出路，与硬性纪律冲突

- **现象**：上一条的清理，以及阶段 `deps` 字段的设置，**都没有 CLI 途径**。
- **后果**：Agent 要么违反「禁止手动编辑 flow.json」的纪律，要么把错误结构永久留在项目里。本会话选择**保留并上报**，但这意味着**流水线状态永远不干净**。
- **建议**：为所有「结构字段」（ops、deps、review items）提供 CLI 增删改；或在 AGENTS.md 中明确「CLI 无能力时经用户授权可手工修正」的例外流程。

### 问题 3（高）：`plan stage add` 与 `plan scheme create` 的阶段注册语义不一致

- **现象**：
  - `openfeel plan stage add <id>`：**建目录 + 写 overview/status + 注册 flow.json**（phase=`plan_pending`）。
  - `openfeel plan scheme create <stage>`：**若阶段不存在则自动注册**（phase=`plan_pending`），并 `mkdir ops/`，**但不建 overview.md/status.md**。
- **后果**：若漏了 `plan stage add` 而先跑 `scheme create`，阶段会被「半注册」；此时 `flow advance --stage <id> --to scheme_pending` 报错：
  ```
  错误: 阶段 "<id>" 当前 phase 无法跳转到 "scheme_pending"
  当前阶段 phase: 未知
  ```
  错误信息**误导**（说「未知」，实际是 `plan_pending`，只是缺少合法的中间相位跳转）。
- **建议**：`scheme create` 不应隐式注册阶段；`flow advance` 报错时应回显**当前真实 phase** 与**合法目标列表**。

### 问题 4（中）：`flow attempt` 不回写 `pipeline.current.op`

- **现象**：连续执行 `flow attempt --op "stage.op-001" --result pass` … 直到 `op-005`，`flow current` 的 `current.op` **始终停在 `op-001`**。
- **后果**：每个阶段的执行方都要在报告里写「`current.op` 滞后」的偏差说明（本会话 10+ 次）；跨会话恢复时容易误判进度。
- **建议**：`flow attempt` 成功记录后同步推进 `current.op`；或提供 `flow current --set <opId>`。

### 问题 5（中）：`stage set` 同值写入报错，且留下 `.bak` 垃圾

- **现象**：`openfeel stage set <id> --status review_passed` 在 status.md 已是该值时**报错退出**，并在 `.openfeel/tmp/` 留下 `status.<id>.bak`。
- **后果**：幂等脚本（Agent 常写）会因「无变化」而失败；`.bak` 文件累积。
- **建议**：同值时返回成功（no-op）并输出提示；`.bak` 仅在真正变更时生成。

### 问题 6（中）：`openfeel config` 仅能设置 `auto_advance` 一个键

- **现象**：`openfeel config set defaults.execution_mode auto` → `无效的配置键 "defaults.execution_mode"，当前仅支持：auto_advance`。
- **后果**：`execution_mode` / `test_enabled` / `merge_mode` 只能**手改 `.openfeel/config.yaml`**（本会话不得不如此）；阶段级 `执行模式` / `自动推进` 字段**完全无 CLI**（`stage set` 仅支持 `--status`）。
- **建议**：把 `defaults.*` 全量键纳入 `config set/get`；`stage set` 增加 `--review-agent` / `--exec-mode` / `--auto-advance` 等选项。

### 问题 7（中）：`stage task` 在无任务行的 status.md 上直接报错

- **现象**：`plan stage add` 生成的 `status.md` **没有「当前任务」条目**（方案官也不一定会补）。此时 `openfeel stage task <id> 1 --done` → `错误：未找到「任务 1」`。
- **后果**：批量勾选任务（本会话多次）全部失败，只能靠 Agent 手改 status.md（又违反「status.md 须经 CLI」纪律）。
- **建议**：`stage task` 增加 `--add "描述"` 追加任务；或在 `plan stage add` 时支持 `--tasks` 初始化。

### 问题 8（低）：git 仓库存在时，每次 `flow advance` 打印「Git 脏区警告」框

- **现象**：
  ```
  [!] ╔════════════════════════════════════════╗
  [!] ║   ⚠  Git 脏区警告：存在未提交的变更    ║
  [!] ║  请确认 Executor 已完成 git commit     ║
  [!] ╚════════════════════════════════════════╝
  ```
  每个 `advance` 都打印，即使脏区是**正常的中间状态**（方案/归档产物本就未提交）。
- **建议**：加 `--quiet` / 仅在 `--to done` 时提示；或按「是否存在未提交的**源码**变更」判定而非全仓库。

### 问题 9（低）：`knowledge` CLI 无法解析自定义 `kb/index.md`

- **现象**：多次 `openfeel knowledge list --type patterns` 与既有 `kb/index.md`（无日期格式）不兼容；归档官反复记录「`kb-dedup.ts` 不存在 → 降级手工去重」。
- **建议**：文档化 `kb/index.md` 的**可解析格式规范**，或让 `knowledge` 容忍任意 Markdown 结构。

### 问题 10（低）：公共日志目录存在两套布局并存

- **现象**：`log/2026-09-28/2026-09-28-Liuary-001.md`（会话初期）与 `log/2026/09/28/2026-09-28-Liuary-001.md`（归档官后续创建）**同时存在**，索引各自维护。
- **建议**：统一为一种布局，并在 `openfeel init` 时固定；提供迁移命令。

### 问题 11（低）：`plan scheme create` 的文件名不符合自身约定

- **现象**：生成 `op-001_{中文标题}.md`（含空格/中文/甚至 `/`），而项目既有约定与 kb 记录均为 `op-NNN.md`；**标题含 `/` 时创建直接失败**（方案官实际踩到）。
- **后果**：op 文件路径在不同阶段不一致，归档/审查的路径引用易断链。
- **建议**：文件名固定为 `op-NNN.md`，标题写入文件**内容**而非文件名；或对标题做安全化（去除路径分隔符）。

---

## 三、改进建议汇总

| # | 问题 | 建议 | 优先级 |
|:--:|------|------|:--:|
| 1 | 孤儿 op 无法回收 | `plan scheme remove` + `flow repair` 清理孤儿 | 高 |
| 2 | 结构字段无 CLI，只能手改 | 提供 ops/deps/reviews 的增删改；或明确授权例外 | 高 |
| 3 | 阶段注册语义不一致 + 误导性报错 | `scheme create` 不隐式注册；报错回显真实 phase 与合法目标 | 高 |
| 4 | `current.op` 不回写 | `flow attempt` 同步推进指针 | 中 |
| 5 | `stage set` 同值报错 + `.bak` 垃圾 | 同值 no-op 返回成功；按需生成备份 | 中 |
| 6 | `config` 仅支持一个键 | 纳入全量 `defaults.*`；`stage set` 增加字段选项 | 中 |
| 7 | `stage task` 无任务行即报错 | 支持 `--add` / `plan stage add --tasks` | 中 |
| 8 | git 脏区警告噪声 | 加 `--quiet` 或按源码变更判定 | 低 |
| 9 | `knowledge` 不解析自定义 index | 规范格式或宽容解析 | 低 |
| 10 | 日志目录两套布局 | 统一布局 + 迁移命令 | 低 |
| 11 | op 文件名含中文/`/` | 固定为 `op-NNN.md` | 低 |

---

## 四、一句话总结

本会话跑了 13 个阶段，CLI 的**创建与推进**侧体验顺滑；但**只要写错一次（多建 5 个 op），就没有任何合法手段改回来**——`flow repair` 不管、CLI 无删除、手改被禁。建议优先补齐 **「删除与修正」** 能力（op remove / deps set / repair 覆盖孤儿）、**统一阶段注册语义**，并让 `stage set` / `config set` 覆盖 Agent 真正需要写的字段。

---

*本文档为 Feel 总统领的一手工具链反馈（第二轮），供 OpenFeel 项目维护者参考。*
