# .ai 工作区操作规范

> 项目永久性行为约束与编码规范见项目根目录 `AGENTS.md`。本文件描述 `.ai/` 工作区的具体操作规则。

在每次对话启动时，检查项目路径下的 .ai 目录及其内容。该目录是确保开发一致性的唯一数据源，你必须维护其完整性和准确性。

## 会话启动自检

每次会话启动时，Agent 必须逐项检查以下目录和文件，缺失则自动创建：

**公共域目录**（如不存在则 `mkdir -p`）：
- `.ai/dev/note/`
- `.ai/log/`
- `.ai/code_review/`
- `.ai/bugs/`
- `.ai/plan/`
- `.ai/kb/`
- `.ai/tmp/`

**公共域文件**（如不存在则创建空文件）：
- `.ai/dev/dev_core.md`
- `.ai/dev/current.md`
- `.ai/kb/index.md`

**私域目录**（基于 `.ai/.info.json` 获取的 `{username}`）：
- `.ai/users/{username}/log/`
- `.ai/users/{username}/note/`
- `.ai/users/{username}/code_review/`
- `.ai/users/{username}/bugs/`
- `.ai/users/{username}/tmp/`

**私域文件**：
- `.ai/users/{username}/dev_last.md`

## 设计原则

.ai 目录分为**公共域**与**私域**两部分：
- 公共域：直接位于 `.ai/` 下，存放项目级共享内容（核心规则、计划、团队日志、知识库等），纳入版本管理。
- 私域：位于 `.ai/users/{username}/` 下，存放个人操作状态、日志、笔记、代码审查、Bug 追踪等，加入 `.gitignore` 不纳入版本管理。

所有用户（含单人项目）均遵循此分区结构。

## 用户身份

> .ai/.info.json

```json
{ "user": "username" }
```

每次对话启动时，Agent 首先读取此文件获取当前用户名。若文件不存在或 `user` 为空，则自动执行 `git config user.name` 获取 Git 用户名并写入。若无 Git 配置则选取默认用户名。此文件加入 `.gitignore` 不纳入版本管理。

### 路径自校验

大模型在构造 `.ai/users/{username}/` 路径时可能意外截断或修改用户名（如 `Alice` → `Alic`），导致文件读写失败。访问任何 `.ai/users/{username}/` 下的文件时，必须遵循以下自校验规则：

1. **访问失败立即校验**：`read`、`glob` 操作返回 "file not found" 或 "no such file" 时，不要直接报错。先执行 `read .ai/.info.json` 重新获取正确的 `username`。
2. **比对并修正**：将当前使用的 `username` 与 `.ai/.info.json` 中的值逐字符比对。若不一致，用正确值重建完整路径后重试。
3. **连续失败上报**：重试仍失败时，向用户报告「路径 `{失败的路径}` 不存在，已确认用户名为 `{正确用户名}`」，由用户确认后再操作。

此规则适用于所有 Agent（Architect / Code / Debug / Tester / Ask）。

---

## 公共域

### 开发目录

> .ai/dev

存放项目共享的核心规则与进度状态。

> .ai/dev/dev_core.md

存放长期有效规则。优先级：用户指令 > 本文件 > 会话临时提示。每条规则前带 `[+]`（启用）/ `[-]`（禁用），只能标记禁用不能删除，禁用超 10 条时提醒用户清理。

> .ai/dev/current.md

记录当前正在进行的工作，按 `@{username} 描述正在进行的工作` 范式维护各成员进度，顶部维护总进度状态。

> .ai/dev/note/dev_note.md

团队共享开发笔记，内容来源于成员个人笔记的归入提交（见私域 > 个人笔记）。简要描述，详情放入子文件并建立索引。

### 日志目录

> .ai/log

公共日志目录，**仅记录团队级重要事件**（满足任一即记录）：
- 公共域文件的创建或重要修改
- 跨成员协作关键操作（公共笔记归入、计划调整等）
- 计划里程碑达成或重大偏差
- 私域代码审查或 Bug 的严重问题（high 优先级，首次发现时上报详情）
- 影响多人的异常事件

日常操作（常规代码修改、个人计划推进、调试、个人笔记）记录在私域日志。

日志按年/月/日分层归档，日目录仅在当天有重要事件时创建。文件命名 `yyyy-mm-dd-{username}-NNN.md`，日目录含 `day_index.md`。根目录维护 `index.md`（日期索引）和 `log.md`（最近 30 条摘要，格式 `[文件名] {username}: 描述`，含跳转链接）。

### 代码审查目录

> .ai/code_review

公共代码审查目录，存放私域审查完成后的核心结论摘要。纳入版本管理，供团队查阅。

按计划阶段组织，与私域审查目录对应。根目录维护 `index.md`（按阶段分组索引，顶部统计各状态数量）。每个阶段的心得建议总结在 `{stage}.md` 中，而具体的审查过程与每个提交点的详细审查内容，则保存在私域 `code_review/REV-{stage}.md` 中。

### Bug 追踪目录

> .ai/bugs

公共 Bug 追踪目录，存放私域 Bug 关闭后的核心结论摘要。纳入版本管理，供团队查阅。

按模块组织，与私域 Bug 目录对应。根目录维护 `index.md`（按模块分组索引）。每个模块的 Bug 解决心得和根因分析归档在 `{module}.md` 中，具体的 Bug 报告、复现步骤和验收详情则保存在私域 `bugs/{module}/` 中。

### 计划目录

> .ai/plan

**自动计划化**：当用户提出包含以下特征的任务时，Agent 应主动在 `plan.md` 中创建对应条目或更新 `current.md`，无需等待用户手动触发：
- 涉及多步骤操作
- 需要跨会话跟踪进度
- 可能影响多个模块或文件

计划分两层：
- **大计划**（`plan.md`）：整体目标、技术架构、核心里程碑。更改须经团队沟通确认。
- **小计划**（`{stage}/` 子目录）：具体任务分解与实施步骤。日常修改和推进在此层进行。

若计划不存在则根据用户指令创建。大计划更改须用户确认，小计划调整可由 Agent 自主完成但须记录。

`plan_index.md` 存放各期计划核心摘要并索引至各期目录。`plan_log.md` 记录最近 30 条变更摘要，格式 `{username}: 变更描述`，含跳转链接。

发生计划外操作或偏差时，必须先向用户说明并寻求确认，同时在日志中记录。

#### 子计划状态与自动闭环

每个小计划阶段目录下必须维护 `status.md`，用于记录该阶段的执行状态和责任 Agent。人工流程为默认模式，只有用户明确开启自动闭环时，Agent 才能根据状态自动启动下游会话。

`status.md` 模板：

```markdown
# {stage} 状态

- **执行模式**：manual | auto  <!-- 初始值从 .ai/config.yaml defaults 读取，本文件可覆盖 -->
- **自动推进**：disabled | enabled  <!-- 初始值从 .ai/config.yaml defaults 读取，本文件可覆盖 -->
- **状态**：planned | ready_for_code | auto_running | coding | ready_for_review | review_failed | review_passed | ready_for_test | test_writing | testing | bug_found | bug_fixing | done | paused
- **当前责任 Agent**：architect | auto-runner | code | code-worker | review-worker | test-writer | tester | user
- **上一责任 Agent**：architect | auto-runner | code | code-worker | review-worker | test-writer | tester | user | none
- **更新时间**：yyyy-mm-dd HH:MM

## Worktree / Session

- **工作模式**：manual | worktree
- **分支名**：-
- **Session 名称**：-
- **合并状态**：not_started | pending_merge | merged | cleanup_ready | cleaned
- **清理策略**：manual | auto

## 当前任务
...

## 阻塞 / 暂停原因
...

## 状态记录
| 时间 | Agent | 状态变化 | 说明 |
|------|-------|----------|------|
```

### 级联优先级

工作流配置采用级联覆盖机制（高优先级覆盖低优先级）：

1. `.ai/config.yaml` `defaults` — 全局默认值，所有阶段通用
2. `.ai/plan/{stage}/status.md` — 阶段局部覆盖，可覆盖全局默认
3. 用户直接指令 — 最高优先级，覆盖所有配置

具体字段取值规则：
- `执行模式` / `自动推进`：先查 status.md，若未填则回退到 config.yaml defaults
- `test_enabled` / `merge_mode`：仅从 config.yaml 读取，status.md 不直接声明此字段
- `合并状态` / `清理策略`：merge_mode=auto 时自动推进，merge_mode=manual 时需人工确认

状态含义：
- `planned`：计划已创建，等待用户确认或细化。
- `ready_for_code`：可进入编码实现。
- `auto_running`：AutoRunner 已在单个 worktree 内接管该子计划闭环。
- `coding`：代码 Agent 或 CodeWorker 正在实现。
- `ready_for_review`：实现完成，等待 Architect 或 ReviewWorker 审查。
- `review_failed`：审查不通过，等待代码 Agent 或 CodeWorker 修改。
- `review_passed`：审查通过，可进入测试阶段。
- `ready_for_test`：等待测试编写或验收。
- `test_writing`：TestWriter Agent 正在补充测试代码。
- `testing`：Tester Agent 正在执行测试与验收。
- `bug_found`：测试发现 Bug，等待代码 Agent 或 CodeWorker 修复。
- `bug_fixing`：代码 Agent 或 CodeWorker 正在修复 Bug。
- `done`：子计划完成，自动流程停止。
- `paused`：流程暂停，必须等待用户决策。

自动推进规则：
- 默认值来自 `.ai/config.yaml` defaults 字段（部署模板默认为 `manual + disabled`，仓库自身为 `auto + enabled` 以支持自驱动）。仅当 `执行模式=auto` 且 `自动推进=enabled` 时，允许 Architect 启动 AutoRunner 或 Agent Manager worktree session。
- 自动流程采用"每个独立的子计划一个 worktree"：Architect 根据 `.ai/plan/deps.yaml` 判断阶段依赖，**无依赖的阶段可并行启动多个 AutoRunner worktree**；AutoRunner 在单个 worktree 内调度 CodeWorker / ReviewWorker / TestWriter / Tester / Debug，其中部分阶段允许内部并行（如审查和测试编写并行调度）。
- **并行安全规则**：
  - 并行 worktree 不得修改同一文件；若可能冲突，Architect 必须在 `deps.yaml` 中标记为 `mutual_exclusion` 使其串行
  - 先完成的 worktree 先合并，后完成的在合并前需 rebase 已合并分支
  - 并行 worktree 间通过 `task_claim.md` 的 🔒 锁定机制检测文件冲突
- 任一 Agent 遇到计划外架构变更、超过范围的修改、权限不明确、测试环境缺失、连续两次验收失败时，必须将状态改为 `paused`，`当前责任 Agent` 改为 `user`，并写明暂停原因。
- 状态为 `done`、`paused` 或 `当前责任 Agent=user` 时，不得继续自动推进。

允许的自动启动链路：
- Architect 可启动 AutoRunner（可并行启动多个，每个对应独立的无依赖子计划）。
- AutoRunner 可通过 `task` 调度 CodeWorker、ReviewWorker、TestWriter、Tester、Debug。
- 自动流程使用 `code-worker` / `review-worker`，人工流程使用主 `code` / `architect`，两者职责隔离。
- Code、CodeWorker、ReviewWorker、TestWriter、Tester 不得自行创建新的 Agent Manager worktree；只更新状态并将控制权交回 AutoRunner 或用户。
- Debug 不得启动其他 Agent。

自动流程中的 `status.md` 更新发生在 AutoRunner worktree 内。主工作区只有在用户将 worktree 改动 Apply/Merge 后才能看到最终状态；不要在主工作区同时手改同一子计划状态文件。

### 临时目录

> .ai/tmp

存放项目级临时文件（共享数据、构建产物等）。仅在用户指定时读取其中文件。

### 知识库

> .ai/kb

记录"这个项目是什么样的"和"遇到问题怎么办"，与约束体系（记录"应该怎么做"）分离。

```
.ai/kb/
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

禁止写入知识库：行为约束（→ AGENTS.md）、操作流程（→ Instructions）、工作区维护规则（→ dev_core.md）。每次写入后在公共日志中记录。

#### 自动写入机制

**触发时机**：每次会话中，Agent 完成非平凡任务后（排除纯查询/对话类操作），应在覆盖写入 `dev_last.md` 时将本会话的**关键经验**暂存其中。

**dev_last.md 经验暂存格式**：
```markdown
# 上次操作状态

- 时间: yyyy-mm-dd HH:MM
- 阶段: {当前阶段}
- 操作: {一句话描述}
- 文件: {新增/修改的文件}
- 当前状态: {阶段进度}

## 经验暂存
- [ ] `{分类}`：{经验描述}  ← 待用户确认归入 kb/
```

**归档流程**：
1. Agent 在下一次会话启动时读取 `dev_last.md`，若发现有未归档的经验条目，提醒用户确认。
2. 用户确认后，Agent 将经验写入对应 kb/ 分类文件（`architecture.md` / `patterns.md` / `troubleshooting.md` / `setup.md`）。
3. 写入格式：每个经验条目以 `## [+] {标题} ({日期})` 开头，含描述和上下文。
4. 写入后更新 `kb/index.md` 的「最近更新」表格，并在公共日志 `.ai/log/` 中记录。
5. 最后将 `dev_last.md` 中的经验条目标记为 `[x]`（已归档）或删除。

**自动写入判断标准**（满足任一即写入）：
- 解决了一个此前未知的构建/环境问题
- 发现并记录了一个代码模式/最佳实践
- 做了一个影响后续开发的架构决策
- 遇到一个值得记录的坑位/排查经验

此流程确保 Agent 的经验不会随会话丢失，知识库随项目持续增长。

---

## 私域

> .ai/users/{username}/

私域目录，Agent 每次通过 `.ai/.info.json` 获取当前用户名确定对应路径。代码修改后须同步更新私域内相关文件（计划、日志、笔记等），保持与实际状态一致。

### 个人操作状态

> .ai/users/{username}/dev_last.md

记录上一次操作结束时的简要状态，对话末尾覆盖写入。下次启动时先读取以恢复上下文。若内容与当前对话矛盾则标记"可能过期"并向用户确认。

**模板**：
```markdown
# 上次操作状态

- 时间: yyyy-mm-dd HH:MM
- 阶段: {当前计划阶段}
- 操作: {一句话描述上次操作}
- 文件: {新增或修改的关键文件列表}
- 当前状态: {阶段进度，如 3/7 任务完成}

## 待续事项
- [ ] {未完成的任务}
- [ ] {阻塞项}

## 关键决策
- {本次会话中的重要架构或设计决策}

## 经验暂存
- [ ] `architecture`：{待归档的架构决策}
- [ ] `patterns`：{待归档的代码模式}
- [ ] `troubleshooting`：{待归档的排查经验}
- [ ] `setup`：{待归档的环境配置}
```

此模板确保跨会话上下文恢复到足够执行下一个任务的程度，同时承载经验暂存功能，支撑知识库自动写入机制。

### 个人笔记

> .ai/users/{username}/note/

经验教训的**主要记录位置**。简要描述，详情放子文件并建索引。Agent 在每次对话中随机提醒用户是否需要归入公共笔记 `dev/note/dev_note.md`，归入后标注"已归入公共域"及跳转链接。

### 个人日志

> .ai/users/{username}/log/

日常操作的**主要记录位置**。结构与公域日志一致，命名格式 `yyyy-mm-dd-NNN.md`（无需用户名，因已在用户目录下）。

### 代码审查

> .ai/users/{username}/code_review/

管理开发阶段的代码评审问题（架构、规范、逻辑），按计划阶段组织。与 Bug 追踪分离。

**角色分工：**
- **Architect Agent**：根据计划阶段审查代码，提交问题，验收修复结果。
- **代码 Agent**：处理审查问题，修改代码并标记状态。

每个计划阶段的审查问题集中在 `REV-{plan_stage}.md`。条目模板：

```markdown
## REV-{NO}: {简要标题}
- **状态**：pending | fixing | resolved | closed
- **优先级**：high | medium | low
- **提出人**：Architect Agent
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

审查问题标记为 `pending` 时，若优先级为 `high`，须将问题详情（标题、描述、影响范围）写入公共日志，确保团队及时可见。条目 `closed` 时，核心结论写入 `.ai/code_review/{stage}.md`，并在公共日志简要记录。

### Bug 追踪

> .ai/users/{username}/bugs/

管理测试阶段发现的缺陷，按模块组织。与代码审查分离。

**角色分工：**
- **测试 Agent**：提交 Bug 和最终验收。
- **代码 Agent**：按模块分工修复，会话启动时通过 `load skill get-bugs` 获取负责模块的待处理 Bug。

Bug 按模块子目录组织，每个模块目录下 Bug 命名 `BUG-{NNN}_{简略标题}.md`（NNN 模块内递增）：

```
.ai/users/{username}/bugs/
├── index.md              # 按模块分组索引（### {模块名} @{负责Agent名}）
├── log.md                # 最近 30 条变更摘要
├── {module_a}/
│   ├── BUG-001_标题.md
│   └── BUG-002_标题.md
└── {module_b}/
    └── BUG-001_标题.md
```

Bug 文件的详细模板与操作流程由 `tester` Subagent 负责（见 `Kilo/agents/tester.md`）。

Bug 标记为 `open` 时，若优先级为 `high`，须将缺陷详情（标题、描述、复现步骤、影响模块）写入公共日志，确保团队及时可见。条目 `closed` 时，核心结论写入 `.ai/bugs/{module}.md`，并在公共日志简要记录。

### 审查/追踪 生命周期

两者共用同一状态流转模型（仅起始状态名不同）：

```
pending/open  ──→  fixing  ──→  resolved  ──→  closed
      ↑                         │
      └────────── 验收不通过 ───┘
```

| 状态 | 代码审查 | Bug 追踪 | 操作者 |
|------|---------|---------|--------|
| 起始 | `pending` | `open` | Architect/测试 Agent 提交 |
| 修复中 | `fixing` | `fixing` | 代码 Agent 承接 |
| 待验收 | `resolved` | `resolved` | 代码 Agent 完成 |
| 关闭 | `closed` | `closed` | Architect/测试 Agent 验收通过 |

### 个人临时目录

> .ai/users/{username}/tmp/

存放当前用户的临时文件，与其他用户完全隔离。
