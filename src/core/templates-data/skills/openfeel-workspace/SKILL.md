---
name: openfeel-workspace
description: 会话启动时检查并补齐 .openfeel/ 工作区目录结构与空文件的标准化操作步骤（mkdir 哪些目录、创建哪些空文件、读 .info.json 取用户名），并给出目录语义（公共域 / 私域）与骨架模板。
---

# 工作区启动自检

## 输入

无（自动按 .openfeel/.info.json 与 ~/.openfeel/update_infos.md 推断）

## 执行步骤

### 1. 读取用户名
读 `.openfeel/.info.json` 的 `user` 字段；缺失则 `git config user.name`。

### 2. 检查公共域目录（缺失则 mkdir -p）
`.openfeel/dev/note/`、`.openfeel/dev/current_archive/`、`.openfeel/log/`、`.openfeel/code_review/`、`.openfeel/bugs/`、`.openfeel/plan/`、`.openfeel/kb/`、`.openfeel/tmp/`

### 3. 检查公共域文件（缺失则创建空文件）
`.openfeel/dev/dev_core.md`、`.openfeel/dev/decisions.md`、`.openfeel/kb/index.md`（`dev/current.md` 自 v1.5.0 起为**可选**，不再强制维护）

### 4. 检查私域目录（基于 {username}）
`.openfeel/users/{username}/log/`、`note/`、`code_review/`、`bugs/`、`tmp/`、`dev_last/`（主题记录目录；**主题文件名英文**，如 `pending.md`/`decisions.md`）

### 5. 检查私域文件
`.openfeel/users/{username}/dev_last.md`（**索引**；同名目录 `dev_last/` 存主题文件，**文件名英文**）。v1.5.0 起其「自动状态」块由 CLI 维护；**只有 Feel 写**，子 agent 不读不写。

### 6. 增量更新复核
检查 `~/.openfeel/update_infos.md`，若存在未修复条目（追加/异常），提醒用户重启会话，并按 `openfeel-memory` 的 update_infos 检查修复流程处理；本 Agent 不自行修改该文件。

## 目录语义（公共域 / 私域）

`.openfeel/` 分为**公共域**与**私域**两部分：

- **公共域**：直接位于 `.openfeel/` 下，存放项目级共享内容（核心规则、计划、团队日志、知识库等），**纳入版本管理**。
- **私域**：位于 `.openfeel/users/{username}/` 下，存放个人操作状态、日志、笔记、代码审查、Bug 追踪等，**加入 `.gitignore` 不纳入版本管理**。

所有用户（含单人项目）均遵循此分区结构。Agent 每次通过 `.openfeel/.info.json` 获取当前用户名确定私域路径；代码修改后须同步更新私域内相关文件，保持与实际状态一致。

### 设计目的与分层原则

> **两条设计目的（一切格式规则的推导总纲）**：
> ① **保存核心信息便于恢复**——任何时刻打开索引（`dev/current.md` / `users/{username}/dev_last.md`）即可在有限上下文内恢复到可继续工作的程度。
> ② **避免无关信息污染上下文**——索引层只放「结论与位置」，细节下沉到主题文件 / `tmp/` 文档；索引不承载过程性明细。

**分层原则**：

| 层 | 载体 | 粒度上限 | 读者 |
|----|------|----------|------|
| 索引层 | `.openfeel/dev/current.md`、`.openfeel/users/{username}/dev_last.md` | 条数硬限 + 字数硬限 | 用户 / 会话启动 |
| 主题层 | `.openfeel/users/{username}/dev_last/{english-name}.md` | ≤10 条、≤300 字/条 | 按需读取 |
| 详情层 | `.openfeel/users/{username}/tmp/` 文档 | 不限（仅记**地址**） | 显式指定时读取 |

> **路径自校验**：构造 `.openfeel/users/{username}/` 路径可能意外截断用户名（如 `Alice` → `Alic`）。访问失败（file not found）时不要直接报错：先重读 `.openfeel/.info.json` 取正确 `username`，逐字符比对后重建路径重试；连续失败则向用户报告「路径 `{失败路径}` 不存在，已确认用户名为 `{正确用户名}`」后操作。

### 公共域目录职责与命名

| 路径 | 职责 | 命名约定 |
|------|------|----------|
| `.openfeel/.info.json` | 用户身份（`{ "user": "username" }`；缺失则由 `git config user.name` 补齐） | 加入 `.gitignore` |
| `.openfeel/dev/` | 项目共享的核心规则与进度状态 | — |
| `dev/dev_core.md` | 长期有效规则；每条形如 `[+]` / `[-]` 前缀，**只标禁用不删除** | — |
| `dev/current.md` | **可选**（v1.5.0 起不再强制维护）；如维护则只写整体信息、禁止 agent 细节、仅保留近期 5 条 | — |
| `dev/current_archive/` | 轮换出的旧记录（**只增不删**，公共域纳版本管理） | `current-{yyyy-mm-dd}-{NNN}.md`（同日 NNN 递增） |
| `dev/note/dev_note.md` | 团队共享开发笔记（来源 = 成员个人笔记的归入） | — |
| `log/` | 公共日志：**仅团队级重要事件**；按年 / 月 / 日分层，日目录仅当天有事件时创建 | `yyyy-mm-dd-{username}-NNN.md`；日目录 `day_index.md`；根 `index.md` + `log.md`（最近 30 条） |
| `code_review/` | 私域审查完成后的核心结论摘要（按计划阶段组织） | 阶段文件 `{stage}.md`；根 `index.md`（按阶段分组 + 状态统计） |
| `bugs/` | 私域 Bug 关闭后的结论摘要（按模块组织） | 模块文件 `{module}.md`；根 `index.md`（按模块分组） |
| `plan/` | 计划目录：大计划 `plan.md` + 小计划 `{stage}/` 子目录；按大版本系列组织 | `plan/index.md` 顶层索引；`{version}/index.md` 系列索引；`plan_log.md`（最近 30 条） |
| `kb/` | 知识库（「项目是什么样的」+「遇到问题怎么办」） | `index.md` / `architecture.md` / `patterns.md` / `troubleshooting.md` / `setup.md` |
| `tmp/` | 项目级临时文件（共享数据、构建产物） | 仅在用户指定时读取 |

### 私域目录职责与命名（`.openfeel/users/{username}/`）

| 路径 | 职责 | 命名约定 |
|------|------|----------|
| `dev_last.md`（索引）+ `dev_last/`（主题文件） | 本地状态恢复与操作记录；**v1.5.0：自动状态块由 CLI 维护，手写仅交接摘要；只有 Feel 写**；**超期文件不做归档** | 主题文件**文件名一律英文 kebab-case**（如 `pending.md` / `decisions.md`） |
| `log/` | 个人日志**默认不写**（仅跨会话/公共事件，≤3 行） | `yyyy-mm-dd-NNN.md`（无需用户名） |
| `note/` | 个人笔记（经验教训的**主要记录位置**） | 简要描述 + 子文件索引 |
| `code_review/` | 开发阶段代码评审问题（架构 / 规范 / 逻辑），按计划阶段组织 | `REV-{plan_stage}.md`；根 `index.md` + `log.md`（最近 30 条） |
| `bugs/` | 测试阶段缺陷追踪，按模块组织 | `{module}/BUG-{NNN}_{简略标题}.md`（NNN 模块内递增）；根 `index.md` + `log.md`（最近 30 条） |
| `tmp/` | 当前用户临时文件（与其他用户完全隔离） | — |

> **记录纪律边界**：何时记 / 记什么 / 格式 / 禁止 → `openfeel-logging`；记忆加载 / 偏好合并 / 决策追加 / 落档写入 → `openfeel-memory`；本 skill 只承载**目录存在性、目录语义与骨架模板形态**。

## 骨架模板

### 1. `dev/current.md` 骨架（+ 归档命名）

```markdown
# 当前进度

> {一句话整体进度}（整体信息，用户级视图）

## 近期提交记录（最多 5 条，最新在上）

- **{yyyy-mm-dd HH:MM}** @{username}：{整体信息：做了什么、处于什么状态（不写 agent 细节、不写逐条流水）}
- **{yyyy-mm-dd HH:MM}** @{username}：{…}

> 更早记录见 `.openfeel/dev/current_archive/`（每次提交自动归档最旧一条；本文件仅保留近期 5 份）。
```

- 归档文件名 `current-{yyyy-mm-dd}-{NNN}.md`；内容 = 被移出的记录行 + `>` 元信息行（原日期、移出时间）。
- 记录内**保留单行内联 `@{username}`**（跨用户场景标识提交者，行内标识 ≠ 分节）。

### 2. `dev_last.md` 索引骨架 + 主题文件骨架

索引（`dev_last.md`）：

```markdown
# dev_last — 索引（{username}）

> 本文件为**索引**：只列主题与核心摘要。详情在 `dev_last/{english-name}.md`（每主题 ≤10 条、每条 ≤300 字）；超量详情写入 `.openfeel/users/{username}/tmp/`，并在主题文件记录其地址。超期文件**不做归档**。

## 用户偏好
- 语言：{lang} ｜ 自动推进：{auto_advance} ｜ 审查模式：{review_mode}
- 沟通风格：{communication} ｜ 确认阈值：{confirm_threshold}

## 主题索引（最多 5 个）

> 每条：`**{显示主题名（可中文）}**（`dev_last/{english-name}.md`）` + ≤5 条摘要（每条 ≤100 字）。文件名一律英文。

- **待续事项**（`dev_last/pending.md`）
  - {近期工作核心内容，≤100 字}
- **决策记录**（`dev_last/decisions.md`）
  - {…}

## 已收敛主题（不计入上方 5 个上限；仅一行，文件就地保留）

- **{显示主题名}**（`dev_last/{english-name}.md`，收敛于 {yyyy-mm-dd}）：{≤100 字摘要}

## 公共交接区（跨会话传递信息）

> 仅列**交接文档位置 + 核心摘要**，不描述细节。

- 交接文档：`{路径（可为 dev_last/{english-name}.md 或 tmp 文档）}`
- 核心摘要：{一句话}
```

主题文件（`dev_last/{english-name}.md`，**文件名英文**）：

```markdown
# 主题：{显示主题名（可中文）}

> 详情记录：近期 ≤10 条、每条 ≤300 字。超出则写入 `tmp/` 文档并在此记录地址。超期记录不归档。

- **{yyyy-mm-dd}** {近期工作核心内容（≤300 字）}

> 超量详情：`{tmp 文档路径}`（如 `.openfeel/users/{username}/tmp/{file}.md`）
> 超期记录：**不归档**（就地保留或由用户手动清理）。
```

- 主题文件名映射：待续事项 → `dev_last/pending.md`、决策记录 → `dev_last/decisions.md`、流水线状态 → `dev_last/pipeline-state.md`、上次操作 → `dev_last/last-operation.md`、经验暂存 → `dev_last/experience.md`（新主题同理，英文 kebab-case）。
- 主题数 >5 时：**优先合并同类主题**；无可合并则把最旧且已完结主题降为一行摘要移入「已收敛主题」（`dev_last/archive/` **不存在**，不迁移、不归档）。

### 3. `REV-{NO}` 条目模板

```markdown
## REV-{NO}: {简要标题}
- **状态**：pending | fixing | resolved | closed
- **优先级**：high | medium | low
- **提出人**：openfeel-reviewer
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

- 按计划阶段集中在 `code_review/REV-{plan_stage}.md`；根目录维护 `index.md`（按阶段分组索引 + 各状态数量统计）与 `log.md`（最近 30 条审查变更摘要）。

### 4. Bug 目录结构 + 命名 + 审查 / 追踪生命周期

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

代码审查与 Bug 追踪**共用同一状态流转模型**（仅起始状态名不同）：

```
pending/open  ──→  fixing  ──→  resolved  ──→  closed
      ↑                         │
      └────────── 验收不通过 ───┘
```

| 状态 | 代码审查 | Bug 追踪 | 操作者 |
|------|---------|---------|--------|
| 起始 | `pending` | `open` | openfeel-reviewer / openfeel-feel-tester 提交 |
| 修复中 | `fixing` | `fixing` | openfeel-executor 承接 |
| 待验收 | `resolved` | `resolved` | openfeel-executor 完成 |
| 关闭 | `closed` | `closed` | openfeel-reviewer / openfeel-feel-tester 验收通过 |

- 条目 `closed` 时：审查结论写入 `.openfeel/code_review/{stage}.md`，Bug 结论写入 `.openfeel/bugs/{module}.md`，并在公共日志简要记录。

## 输出

工作区自检结果：补齐的目录 / 文件清单 + 用户名 + 未修复条目提示

> 本 skill 承载操作步骤、目录语义与骨架模板；全局约束见全局规则文件（opencode 适配器：`~/.config/opencode/AGENTS.md`；Claude Code 适配器：`~/.claude/CLAUDE.md`）。
