# .openfeel 工作区操作规范

> 项目永久性行为约束与编码规范见项目根目录 `AGENTS.md`。本文件描述 `.openfeel/` 工作区的具体操作规则。

在每次对话启动时，检查项目路径下的 .openfeel 目录及其内容。该目录是确保开发一致性的唯一数据源，你必须维护其完整性和准确性。

在会话中应主动使用平台内置工具（如提问、TODO 列表），不得仅凭对话文本完成复杂任务。

## 会话启动自检

每次会话启动时，Agent 必须逐项检查以下目录和文件，缺失则自动创建：

**公共域目录**（如不存在则 `mkdir -p`）：
- `.openfeel/dev/note/`
- `.openfeel/log/`
- `.openfeel/code_review/`
- `.openfeel/bugs/`
- `.openfeel/plan/`
- `.openfeel/kb/`
- `.openfeel/tmp/`

**公共域文件**（如不存在则创建空文件）：
- `.openfeel/dev/dev_core.md`
- `.openfeel/dev/current.md`
- `.openfeel/dev/decisions.md`
- `.openfeel/kb/index.md`

**私域目录**（基于 `.openfeel/.info.json` 获取的 `{username}`）：
- `.openfeel/users/{username}/log/`
- `.openfeel/users/{username}/note/`
- `.openfeel/users/{username}/code_review/`
- `.openfeel/users/{username}/bugs/`
- `.openfeel/users/{username}/tmp/`

**私域文件**：
- `.openfeel/users/{username}/dev_last.md`

## 设计原则

.openfeel 目录分为**公共域**与**私域**两部分：
- 公共域：直接位于 `.openfeel/` 下，存放项目级共享内容（核心规则、计划、团队日志、知识库等），纳入版本管理。
- 私域：位于 `.openfeel/users/{username}/` 下，存放个人操作状态、日志、笔记、代码审查、Bug 追踪等，加入 `.gitignore` 不纳入版本管理。

所有用户（含单人项目）均遵循此分区结构。

## Agent 工具使用规范

所有 Agent（含 Feel、Planner、Schemer、Executor、Reviewer、Feel Tester、Archiver）在会话中应主动使用平台内置工具，不得仅凭对话文本完成复杂任务。

### 1. todowrite — 任务列表管理

**触发条件**（满足任一即使用）：
- 当前任务包含 3 个以上独立步骤
- 用户同时下达多个任务（编号或逗号分隔）
- 任务涉及跨文件修改，需追踪进度

**使用要求**：
- 开始执行前创建 todo 列表，每个步骤一条
- 同一时间只有一条 `in_progress`
- 完成后立即标记 `completed`（不等批处理）
- 中途发现的新步骤追加到列表末尾

**示例**：
```
用户："修复 flow.json 的三个 Bug，然后跑测试"
→ 创建 todo: [修复Bug1, 修复Bug2, 修复Bug3, 运行测试]
```

### 2. question — 向用户提问

**触发条件**（满足任一必须提问，禁止自行假设）：
- 需求存在歧义或多种合理解读
- 技术方案有 2 个以上同等合理的选择
- 操作可能产生不可逆后果（删除文件、覆盖配置、force push 等）
- 涉及架构决策或设计方向选择

**使用要求**：
- 选项以 "(Recommended)" 标记推荐方案
- 每个选项附带一句话说明其后果
- 简单确认型问题不超过 3 个选项
- 紧急或高风险操作必须包含"取消"选项

**禁止行为**：
- 需求模糊时自行假设后直接执行
- 多种方案时未经用户选择直接实施
- 以"可能""也许"开头但不提问直接动手

### 3. task — 子 Agent 调度

**触发条件**：
- 需并行探索多个代码区域（启动 2~3 个 explore agent）
- 复杂多步骤任务需委托给 general agent
- 复杂任务需委托给下游 Agent（通过 Feel 总统领调度）

**使用要求**：
- 并行任务用一条消息发出多个 task 调用
- 每个 task 的 prompt 必须包含：具体任务描述 + 期望返回的信息
- 明确告知子 Agent 是只读研究还是可写代码

### 4. skill — 技能加载

**触发条件**：
- 需要了解当前阶段状态 → `get-stage-status`
- 需要查阅项目知识库 → `check-kb`
- 需要获取 Bug 列表 → `get-bugs`

**使用要求**：
- 会话开始时加载 `check-kb` 获取项目背景
- 处理阶段任务前加载 `get-stage-status` 确认流程状态
- 不得跳过技能直接凭记忆操作

### 5. 工具使用优先级

| 场景 | 优先工具 | 禁止做法 |
|------|---------|----------|
| 多步骤任务 | `todowrite` | 凭记忆逐条执行 |
| 需求不明确 | `question` | 自行假设后动手 |
| 探索代码 | `task(explore)` | 手动逐个 grep/read |
| 获取状态 | `skill(get-stage-status)` | 凭记忆推断 |
| 批量文件操作 | `task(general)` | 串行逐个处理 |

## 用户身份

> .openfeel/.info.json

```json
{ "user": "username" }
```

每次对话启动时，Agent 首先读取此文件获取当前用户名。若文件不存在或 `user` 为空，则自动执行 `git config user.name` 获取 Git 用户名并写入。若无 Git 配置则选取默认用户名。此文件加入 `.gitignore` 不纳入版本管理。

### 路径自校验

大模型在构造 `.openfeel/users/{username}/` 路径时可能意外截断或修改用户名（如 `Alice` → `Alic`），导致文件读写失败。访问任何 `.openfeel/users/{username}/` 下的文件时，必须遵循以下自校验规则：

1. **访问失败立即校验**：`read`、`glob` 操作返回 "file not found" 或 "no such file" 时，不要直接报错。先执行 `read .openfeel/.info.json` 重新获取正确的 `username`。
2. **比对并修正**：将当前使用的 `username` 与 `.openfeel/.info.json` 中的值逐字符比对。若不一致，用正确值重建完整路径后重试。
3. **连续失败上报**：重试仍失败时，向用户报告「路径 `{失败的路径}` 不存在，已确认用户名为 `{正确用户名}`」，由用户确认后再操作。

此规则适用于所有 Agent（Feel / Planner / Schemer / Executor / Reviewer / Feel Tester / Archiver）。

---

## 公共域

### 开发目录

> .openfeel/dev

存放项目共享的核心规则与进度状态。

> .openfeel/dev/dev_core.md

存放长期有效规则。优先级：用户指令 > 本文件 > 会话临时提示。每条规则前带 `[+]`（启用）/ `[-]`（禁用），只能标记禁用不能删除，禁用超 10 条时提醒用户清理。

> .openfeel/dev/current.md

记录当前正在进行的工作，按 `@{username} 描述正在进行的工作` 范式维护各成员进度，顶部维护总进度状态。

> .openfeel/dev/note/dev_note.md

团队共享开发笔记，内容来源于成员个人笔记的归入提交（见私域 > 个人笔记）。简要描述，详情放入子文件并建立索引。

### 日志目录

> .openfeel/log

公共日志目录，**仅记录团队级重要事件**（满足任一即记录）：
- 公共域文件的创建或重要修改
- 跨成员协作关键操作（公共笔记归入、计划调整等）
- 计划里程碑达成或重大偏差
- 私域代码审查或 Bug 的严重问题（high 优先级，首次发现时上报详情）
- 影响多人的异常事件

日常操作（常规代码修改、个人计划推进、调试、个人笔记）记录在私域日志。

日志按年/月/日分层归档，日目录仅在当天有重要事件时创建。文件命名 `yyyy-mm-dd-{username}-NNN.md`，日目录含 `day_index.md`。根目录维护 `index.md`（日期索引）和 `log.md`（最近 30 条摘要，格式 `[文件名] {username}: 描述`，含跳转链接）。

### 代码审查目录

> .openfeel/code_review

公共代码审查目录，存放私域审查完成后的核心结论摘要。纳入版本管理，供团队查阅。

按计划阶段组织，与私域审查目录对应。根目录维护 `index.md`（按阶段分组索引，顶部统计各状态数量）。每个阶段的心得建议总结在 `{stage}.md` 中，具体的审查过程与每个提交点的详细审查内容则保存在私域 `code_review/REV-{stage}.md` 中。

### Bug 追踪目录

> .openfeel/bugs

公共 Bug 追踪目录，存放私域 Bug 关闭后的核心结论摘要。纳入版本管理，供团队查阅。

按模块组织，与私域 Bug 目录对应。根目录维护 `index.md`（按模块分组索引）。每个模块的 Bug 解决心得和根因分析归档在 `{module}.md` 中，具体的 Bug 报告、复现步骤和验收详情则保存在私域 `bugs/{module}/` 中。

### 计划目录

> .openfeel/plan

**自动计划化**：当用户提出包含以下特征的任务时，Agent 应主动在 `plan.md` 中创建对应条目或更新 `current.md`，无需等待用户手动触发：
- 涉及多步骤操作
- 需要跨会话跟踪进度
- 可能影响多个模块或文件

计划分两层：
- **大计划**（`plan.md`）：整体目标、技术架构、核心里程碑。更改须经团队沟通确认。
- **小计划**（`{stage}/` 子目录）：具体任务分解与实施步骤。日常修改和推进在此层进行。

若计划不存在则根据用户指令创建。大计划更改须用户确认，小计划调整可由 Agent 自主完成但须记录。

计划索引按大版本系列组织：`plan/index.md` 为顶层索引，`plan/v4/index.md`、`plan/v5/index.md` 等系列索引存放各期计划核心摘要。`plan_log.md` 记录最近 30 条变更摘要，格式 `{username}: 变更描述`，含跳转链接。

发生计划外操作或偏差时，必须先向用户说明并寻求确认，同时在日志中记录。

#### 流水线推进

各阶段状态由 `flow.json` 和 `status.md` 联合管理。Feel Agent 读取 flow.json 判断当前阶段和 phase，通过 `openfeel flow` 命令推进流水线：

- `openfeel flow status` — 查看当前流水线状态
- `openfeel flow advance` — 推进到下一阶段
- `openfeel flow repair` — 修复流水线状态

流水线 phase 枚举（flow.json PipelinePhase）：
plan_pending → plan_review → plan_passed → scheme_pending → scheme_review → scheme_passed → exec_running → review_pending → review_failed → review_passed → test_pending → test_failed → test_passed → archiving → done

人工流程为默认模式。Feel 根据 flow.json 状态调度下游 Agent（Planner / Schemer / Executor / Reviewer / Feel Tester / Archiver），不依赖旧式自动化调度。

状态为 done 或 paused 时，不得继续自动推进。遇到计划外变更或连续失败时，必须暂停并等待用户决策。

### 临时目录

> .openfeel/tmp

存放项目级临时文件（共享数据、构建产物等）。仅在用户指定时读取其中文件。

### 知识库

> .openfeel/kb

记录"这个项目是什么样的"和"遇到问题怎么办"，与约束体系（记录"应该怎么做"）分离。

```
.openfeel/kb/
├── index.md           # 总索引：分类概览、各文件摘要、最近更新
├── architecture.md    # 架构决策、设计理由、技术选型
├── patterns.md        # 代码模式、项目约定、最佳实践
├── troubleshooting.md # 常见问题、调试流程、已知坑位
└── setup.md           # 环境搭建、构建流程、依赖管理
```

分类数量不做硬性限制。`index.md` 维护清晰摘要供 Agent 快速定位。每个分类文件的 `[+]`/`[-]` 标记规则与 `dev_core.md` 一致。

**写入规范：**

| 类型 | 写入路径 |
|------|----------|
| 架构决策（如 OAuth2 + refresh token 方案） | `architecture.md` |
| 代码模式（如状态机统一用 Switch + Enum） | `patterns.md` |
| 排查经验（如构建报错时的处理步骤） | `troubleshooting.md` |
| 环境配置（如特殊编译流程） | `setup.md` |
| 项目分析报告（测试复盘、流程分析、问题总结） | 项目根目录下的 `docs/phase-{N}/` |
| 对体系的理解（与项目分析报告同目录） | 项目根目录下的 `docs/phase-{N}/` |

禁止写入知识库：行为约束（→ AGENTS.md）、操作流程（→ Instructions）、工作区维护规则（→ dev_core.md）。每次写入后在公共日志中记录。

#### 自动写入机制

**触发时机**：每次会话中，Agent 完成非平凡任务后（排除纯查询/对话类操作），应在覆盖写入 `dev_last.md` 时将本会话的**关键经验**暂存其中。

**经验暂存格式**（写入 `dev_last.md`）：
- `- [ ] \`{分类}\`：{经验描述}` — 待用户确认归入 kb/

**归档流程**：
1. Agent 在下一次会话启动时读取 `dev_last.md`，若发现有未归档的经验条目，提醒用户确认。
2. 用户确认后，Agent 将经验写入对应 kb/ 分类文件（`architecture.md` / `patterns.md` / `troubleshooting.md` / `setup.md`）。
3. 写入格式：每个经验条目以 `## [+] {标题} ({日期})` 开头，含描述和上下文。
4. 写入后更新 `kb/index.md` 的「最近更新」表格，并在公共日志 `.openfeel/log/` 中记录。
5. 最后将 `dev_last.md` 中的经验条目标记为 `[x]`（已归档）或删除。

**自动写入判断标准**（满足任一即写入）：
- 解决了一个此前未知的构建/环境问题
- 发现并记录了一个代码模式/最佳实践
- 做了一个影响后续开发的架构决策
- 遇到一个值得记录的坑位/排查经验

此流程确保 Agent 的经验不会随会话丢失，知识库随项目持续增长。

---

## 私域

> .openfeel/users/{username}/

私域目录，Agent 每次通过 `.openfeel/.info.json` 获取当前用户名确定对应路径。代码修改后须同步更新私域内相关文件（计划、日志、笔记等），保持与实际状态一致。

### 个人操作状态

> .openfeel/users/{username}/dev_last.md

记录上一次操作结束时的简要状态，对话末尾覆盖写入。下次启动时先读取以恢复上下文。若内容与当前对话矛盾则标记"可能过期"并向用户确认。

**模板**：
```markdown
# 上次操作状态
- 时间: yyyy-mm-dd HH:MM
- 阶段: {当前计划阶段}
- 操作: {一句话描述上次操作}
- 文件: {新增或修改的关键文件列表}
- 当前状态: {阶段进度，如 3/7 任务完成}

## 用户偏好
- 语言：{lang}
- 自动推进：{auto_advance}
- 审查模式：{review_mode}
- 沟通风格：{communication}
- 确认阈值：{confirm_threshold}

## 上下文快照
- 当前流水线阶段：{phase}
- 活跃阶段：{active_stages}
- 上次操作摘要：{一句话}

## 待续事项
- [ ] {未完成的任务}
- [ ] {阻塞项}

## 关键决策
- {本次会话中的重要架构或设计决策}

## 决策历史
（本会话新增的决策以 `- [x] {date}：{决策描述}` 格式追加于此）

## 经验暂存
- [ ] `architecture`：{待归档的架构决策}
- [ ] `patterns`：{待归档的代码模式}
- [ ] `troubleshooting`：{待归档的排查经验}
- [ ] `setup`：{待归档的环境配置}
```

此模板确保跨会话上下文恢复到足够执行下一个任务的程度，同时承载经验暂存功能，支撑知识库自动写入机制。**写入说明**：Feel 启动时从 `readProfile()` 读取全局偏好填充「用户偏好」；会话中做技术/架构决策时自动追加到「决策历史」；每次写入 dev_last.md 时更新「上下文快照」。

### 个人笔记

> .openfeel/users/{username}/note/

经验教训的**主要记录位置**。简要描述，详情放子文件并建索引。Agent 在每次对话中随机提醒用户是否需要归入公共笔记 `dev/note/dev_note.md`，归入后标注"已归入公共域"及跳转链接。

### 个人日志

> .openfeel/users/{username}/log/

日常操作的**主要记录位置**。结构与公域日志一致，命名格式 `yyyy-mm-dd-NNN.md`（无需用户名，因已在用户目录下）。

### 代码审查

> .openfeel/users/{username}/code_review/

管理开发阶段的代码评审问题（架构、规范、逻辑），按计划阶段组织。与 Bug 追踪分离。

**角色分工：**
- **Reviewer**：根据计划阶段审查代码，提交问题，验收修复结果。
- **Executor**：处理审查问题，修改代码并标记状态。

每个计划阶段的审查问题集中在 `REV-{plan_stage}.md`。条目模板：

```markdown
## REV-{NO}: {简要标题}
- **状态**：pending | fixing | resolved | closed
- **优先级**：high | medium | low
- **提出人**：Reviewer
- **提出时间**：yyyy-mm-dd HH:MM

### 问题描述
...

### 处理记录
| 时间 | 操作者 | 说明 | Commit |
|------|--------|------|--------|

### 验收记录
| 时间 | 验收人 | 结论 | 备注 |
|------|--------|------|------|
```

根目录维护 `index.md`（按阶段分组索引，顶部统计各状态数量）和 `log.md`（最近 30 条审查变更摘要）。

审查问题标记为 `pending` 时，若优先级为 `high`，须将问题详情（标题、描述、影响范围）写入公共日志，确保团队及时可见。条目 `closed` 时，核心结论写入 `.openfeel/code_review/{stage}.md`，并在公共日志简要记录。

### Bug 追踪

> .openfeel/users/{username}/bugs/

管理测试阶段发现的缺陷，按模块组织。与代码审查分离。

**角色分工：**
- **Tester**：提交 Bug 和最终验收。
- **Executor**：按模块分工修复，会话启动时通过 `load skill get-bugs` 获取负责模块的待处理 Bug。

Bug 按模块子目录组织，每个模块目录下 Bug 命名 `BUG-{NNN}_{简略标题}.md`（NNN 模块内递增）：

```
.openfeel/users/{username}/bugs/
├── index.md              # 按模块分组索引（### {模块名} @{负责Agent名}）
├── log.md                # 最近 30 条变更摘要
├── {module_a}/
│   ├── BUG-001_标题.md
│   └── BUG-002_标题.md
└── {module_b}/
    └── BUG-001_标题.md
```

Bug 标记为 `open` 时，若优先级为 `high`，须将缺陷详情（标题、描述、复现步骤、影响模块）写入公共日志，确保团队及时可见。条目 `closed` 时，核心结论写入 `.openfeel/bugs/{module}.md`，并在公共日志简要记录。

### 审查/追踪 生命周期

两者共用同一状态流转模型（仅起始状态名不同）：

```
pending/open  ──→  fixing  ──→  resolved  ──→  closed
      ↑                         │
      └────────── 验收不通过 ───┘
```

| 状态 | 代码审查 | Bug 追踪 | 操作者 |
|------|---------|---------|--------|
| 起始 | `pending` | `open` | Reviewer / Tester 提交 |
| 修复中 | `fixing` | `fixing` | Executor 承接 |
| 待验收 | `resolved` | `resolved` | Executor 完成 |
| 关闭 | `closed` | `closed` | Reviewer / Tester 验收通过 |

### 个人临时目录

> .openfeel/users/{username}/tmp/

存放当前用户的临时文件，与其他用户完全隔离。
