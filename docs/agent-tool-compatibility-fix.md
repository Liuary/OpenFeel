# Agent 工具兼容性问题根因分析与修正方案

> 文档版本：1.0
> 撰写日期：2026-06-25
> 撰写人：Architect Agent
> 适用范围：OpenFeel 项目（从 AI_Prompt / Kilo 平台迁移至 OpenCode 平台）

---

## 目录

1. [根因分析](#1-根因分析)
   - 1.1 [AI_Prompt (Kilo) 与 OpenCode 工具集差异对比](#11-ai_prompt-kilo-与-opencode-工具集差异对比)
   - 1.2 [agent_manager 工具不存在的原因](#12-agent_manager-工具不存在的原因)
   - 1.3 [edit/write 权限模型失效的原因](#13-editwrite-权限模型失效的原因)
   - 1.4 [工具集差异对自动闭环流程的影响](#14-工具集差异对自动闭环流程的影响)
2. [修正方案（给 AI_Prompt 项目的建议）](#2-修正方案给-ai_prompt-项目的建议)
   - 2.1 [工具无关的 Agent 定义设计](#21-工具无关的-agent-定义设计)
   - 2.2 [适配器层职责定义](#22-适配器层职责定义)
   - 2.3 [通用工具抽象层设计](#23-通用工具抽象层设计)
   - 2.4 [跨平台权限模型统一方案](#24-跨平台权限模型统一方案)
3. [对 OpenFeel 的即时修正清单](#3-对-openfeel-的即时修正清单)
   - 3.1 [逐文件修正明细](#31-逐文件修正明细)
   - 3.2 [优先级汇总](#32-优先级汇总)
4. [附录](#4-附录)
   - 4.1 [Kilo vs OpenCode 工具集完整对比表](#41-kilo-vs-opencode-工具集完整对比表)
   - 4.2 [AI_Prompt 类似问题检查清单](#42-ai_prompt-类似问题检查清单)

---

## 1. 根因分析

### 1.1 AI_Prompt (Kilo) 与 OpenCode 工具集差异对比

OpenFeel 项目最初基于 **AI_Prompt 模板**（目标平台为 Kilo）搭建，其 Agent 定义文件（`.opencode/agents/*.md`）、指令文件（`.opencode/instructions/core.md`）和技能定义（`.opencode/skills/*/SKILL.md`）均从 AI_Prompt 仓库的 `Kilo/` 模板目录直接迁移而来。迁移过程中未对平台工具集差异做适配转换，导致多处引用不存在的工具。

两个平台的可用工具集对比如下：

| 工具类别 | Kilo 工具名 | OpenCode 工具名 | 功能对比 |
|----------|------------|----------------|---------|
| **文件写入** | `edit`、`write` | **无对应工具** | Kilo 提供原生文件编辑/写入工具；OpenCode 无此工具，需通过 `bash` 调用系统命令（如 `Set-Content`、`Out-File`）间接实现 |
| **文件读取** | `read`、`cat` | `read` | 两个平台均有，功能等价 |
| **内容搜索** | `grep`、`rg` | `grep` | 两个平台均有，功能等价 |
| **文件匹配** | `glob` | `glob` | 两个平台均有，功能等价 |
| **命令执行** | `bash`、`shell` | `bash` | 两个平台均有，Kilo 在 Linux/macOS 上运行 bash，OpenCode 在 Windows 上运行 PowerShell |
| **URL 获取** | `webfetch` | `webfetch` | 两个平台均有，功能等价 |
| **子任务调度** | `task` | `task`（待验证） | Kilo 用于启动子 Agent；OpenCode 等效机制待确认 |
| **Agent 管理** | `agent_manager` | **无对应工具**（实验性） | Kilo 核心工具，用于创建/管理 git worktree 和多 Agent 会话；OpenCode 的 `opencode.jsonc` 中有 `experimental.agent_manager_tool: true` 实验性开关，但实际 API 与 Kilo 不兼容 |
| **任务管理** | `todowrite`、`todoread` | **无对应工具** | Kilo 任务/TODO 管理工具；OpenCode 无此概念 |
| **技能加载** | `skill` + `load skill` 语法 | `skill`（配置文件声明） | Kilo 通过工具调用 `load skill <name>`；OpenCode 通过 `opencode.jsonc` 的 `skills` 字段声明 |
| **网络搜索** | `websearch` | **无对应工具** | Kilo 专有；OpenCode 无此工具 |

### 1.2 agent_manager 工具不存在的原因

`agent_manager` 是 Kilo 平台的核心基础设施工具，它承担以下职责：

1. **Git Worktree 管理**：创建隔离的 worktree 分支用于自动闭环流程，避免多个 Agent 并行开发时互相干扰。
2. **多 Agent 会话编排**：在单个 worktree 内串行调度 CodeWorker → ReviewWorker → TestWriter → Tester → Debug，并对多个无依赖阶段并行启动 worktree。
3. **合并与清理**：自动执行 `git merge` + `git worktree remove` + `git push`。

**为什么 Kilo 中有而 OpenCode 中没有**：

- Kilo 定位为"Agent Manager"平台——它是一个能管理多个 AI Agent 会话的宿主环境。`agent_manager` 是其操作系统级的能力，本质上是一个进程/会话编排器。
- OpenCode 定位为"AI 编码助手"——它更侧重于单会话内的代码生成、文件操作和命令执行。worktree 管理和跨会话编排不是其核心能力域。
- OpenCode 的 `opencode.jsonc` 中虽有 `"experimental": { "agent_manager_tool": true }`，但这仅是一个实验性功能开关，其 API 语义、调用格式与 Kilo 的 `agent_manager` 完全不同，且不具备生产可用性。

**影响范围**：`architect.md` 是整个自动闭环系统的唯一入口。其第 196-247 行的「自动闭环」章节完全依赖 `agent_manager` 工具来启动并行 worktree、调度 AutoRunner 和合并分支。该工具不可用意味着**整个自动闭环系统无法运转**，所有阶段必须走人工流程。

### 1.3 edit/write 权限模型失效的原因

Kilo 的权限模型基于 YAML 前页（Frontmatter）中的 `permission` 块，其核心是 `edit` 权限声明：

```yaml
permission:
  edit:
    ".openfeel/plan/**": "allow"
    ".openfeel/dev/**": "allow"
    "*": "deny"
  bash: "allow"
  read: "allow"
  # ...
```

这个权限模型的运行前提是：
1. **存在原生 `edit`/`write` 工具**：Kilo 运行时会根据 YAML 权限声明，在 Agent 调用 `edit`/`write` 工具时进行访问控制检查。
2. **工具调用被平台拦截**：当 Agent 尝试 `edit` 一个被 `deny` 的文件时，Kilo 平台层会直接拒绝调用。

**为什么在 OpenCode 中无效**：

1. **OpenCode 无 `edit`/`write` 工具**：OpenCode 中不存在名为 `edit` 或 `write` 的工具。Agent 实际上无法通过调用 `edit` 来修改文件。文件修改需要通过 `bash` 工具执行系统命令（如 PowerShell 的 `Set-Content`）来间接完成。
2. **YAML 权限声明无人解析**：OpenCode 并不理解 Kilo 的 YAML `permission` 块语义。即使 Agent 尝试修改文件，OpenCode 也不会检查 YAML 中的 `edit` 规则。权限声明变成了"死代码"——写了但没人执行。
3. **正文中的指导失效**：6 个 Agent 文件的正文中包含"你可以用 write/edit 工具直接修改..."的指导性语句。在 OpenCode 中，Agent 读到这条指令后会尝试调用不存在的工具，导致工具调用失败或产生意外行为。

**重要例外**：`instructions/core.md` 第 57 行同样引用了 `read`、`write`、`edit`、`glob`：
```markdown
1. **访问失败立即校验**：`read`、`write`、`edit`、`glob` 操作返回 "file not found"...
```
这里的 `edit` 和 `write` 同样引用了不存在的工具名。

### 1.4 工具集差异对自动闭环流程的具体影响

以下是各缺失/不兼容工具对自动闭环流程的具体影响链路：

```
自动闭环入口：architect.md
  │
  ├─ [agent_manager 不可用] → 无法创建 worktree
  │   ├─ 无法并行启动多个 AutoRunner
  │   ├─ 无法串行调度 CodeWorker/ReviewWorker/TestWriter/Tester
  │   └─ 自动合并与清理流程失效
  │
  ├─ [edit/write 不可用] → 所有 Agent 无法直接写入文件
  │   ├─ architect 无法编辑 plan/、dev/、log/ 等 .openfeel/ 文档
  │   ├─ CodeWorker 无法修改源码
  │   ├─ TestWriter 无法创建测试文件
  │   ├─ Tester/Debug 无法写入 Bug 文件
  │   └─ 所有"用 write/edit 工具直接修改"的指导失效
  │
  ├─ [todoread 不可用] → tester.md 权限声明中存在无效条目
  │   └─ 影响轻微（仅 YAML 声明，正文未引用）
  │
  ├─ [webfetch 未声明] → 所有 Agent 的 YAML 缺少 webfetch 权限
  │   └─ 如果 OpenCode 严格校验 YAML 权限，Agent 无法使用 webfetch
  │
  └─ [task / skill 待验证] → 子 Agent 调度和技能加载机制可能不兼容
      ├─ `load skill` 语法可能需要改为 OpenCode 的 skills 配置方式
      └─ `task` 工具的调用格式可能与 Kilo 不同
```

**总结**：当前 OpenFeel 的自动闭环系统处于**完全不可用**状态。核心阻塞项是 `agent_manager`（无法创建隔离的自动运行环境）和 `edit`/`write`（Agent 无法执行最基本的文件操作）。

---

## 2. 修正方案（给 AI_Prompt 项目的建议）

### 2.1 工具无关的 Agent 定义设计

当前 AI_Prompt 的 Agent 定义文件过度绑定 Kilo 平台，体现在两个层面：

**语法层面**：YAML Frontmatter 中的 `permission` 块直接使用了 Kilo 的工具名作为 key（`edit`、`bash`、`read`、`glob`、`grep`、`task`、`agent_manager`、`todowrite`、`skill`）。

**语义层面**：正文中频繁使用 "用 write/edit 工具"、"调用 `agent_manager` 工具" 等平台特定表述。

**建议方案**：将 Agent 定义拆分为 **通用定义层** + **平台适配层**。

```
AI_Prompt 仓库结构（建议）:
├── agents/                    # 通用 Agent 定义（工具无关）
│   ├── architect.agent.yaml
│   ├── code.agent.yaml
│   ├── auto-runner.agent.yaml
│   └── ...
├── adapters/                  # 平台适配器
│   ├── kilo/
│   │   ├── agent-templates/   # 从通用定义生成 Kilo 格式的 Agent 文件
│   │   └── tool-mapping.yaml  # 工具名映射
│   ├── opencode/
│   │   ├── agent-templates/
│   │   └── tool-mapping.yaml
│   ├── claude-code/
│   │   └── ...
│   └── cursor/
│       └── ...
└── schemas/
    └── agent.schema.yaml      # 通用 Agent 定义的 JSON Schema
```

**通用 Agent 定义的核心原则**：

1. **使用抽象能力名而非具体工具名**：不在定义中写 "用 edit 工具修改文件"，而是写 "修改文件"。由适配器层根据目标平台翻译为具体工具调用（Kilo → `edit`，OpenCode → `bash: Set-Content`，Claude Code → `Write`）。

2. **权限声明使用文件路径匹配而非工具名**：不在 YAML 中声明 `edit: { ".openfeel/plan/**": "allow" }`，而是声明 `can_write: [".openfeel/plan/**", ".openfeel/dev/**"]`、`can_read: ["src/**"]`。适配器层将其翻译为各平台的权限格式。

3. **流程描述使用平台中立的状态机**：不在正文中写 "使用 `agent_manager` 工具以 `worktree` 模式启动"，而是写 "为子计划创建隔离的执行环境，在其中调度子任务"。适配器层在 Kilo 上翻译为 `agent_manager` 调用，在 OpenCode 上翻译为手动 `git worktree` 命令序列，在 Claude Code 上可能不需要隔离环境。

### 2.2 适配器层职责定义

适配器层是连接通用 Agent 定义与具体平台的桥梁，职责如下：

| 职责 | 说明 | 输入 | 输出 |
|------|------|------|------|
| **工具名映射** | 将抽象能力名翻译为平台原生工具名 | `抽象能力: file_write` | `Kilo: edit`, `OpenCode: bash` |
| **权限声明翻译** | 将通用权限模型翻译为平台原生权限格式 | `can_write: [".openfeel/**"]` | Kilo YAML `permission.edit` 块, OpenCode 的对应格式 |
| **指令模板渲染** | 将平台中立的指令模板注入平台特定的工具使用说明 | 通用 Agent 定义 | 完整的特定平台 Agent 文件（含正确工具名和调用格式） |
| **工具调用适配** | 提供平台特定的工具调用示例和最佳实践 | 抽象任务描述 | 平台特定的工具调用模式 |
| **能力降级处理** | 当目标平台不支持的抽象能力时，提供替代方案 | `agent_manager` 在 OpenCode 中不可用 | 生成手动 git worktree 命令序列作为替代 |

**适配器实现的最低可行方案**：对于 OpenFeel 这样的迁移场景，适配器可以是一个简单的 Python/Node.js 脚本，读取通用定义 + 工具映射表，输出目标平台的 Agent 文件。

### 2.3 通用工具抽象层设计

基于对 AI_Prompt 9 个 Agent 的职责分析，提取以下通用工具抽象层：

```yaml
# 通用工具抽象层定义
abstract_tools:
  file_read:          # 读取文件内容
    description: "读取指定路径的文件内容"
    kilo: "read"      # 或 cat
    opencode: "read"
    claude_code: "Read"
    cursor: "read_file"

  file_write:         # 创建或覆写文件
    description: "创建新文件或完全覆写已有文件"
    kilo: "write"
    opencode: "bash: Set-Content -Encoding UTF8"  # 间接实现
    claude_code: "Write"
    cursor: "write_to_file"

  file_edit:          # 对已有文件进行局部编辑
    description: "对已有文件进行精确的局部修改（替换、插入、删除行）"
    kilo: "edit"
    opencode: "（无原生工具，需通过 bash + sed/PowerShell 或 read+分析+write 模式实现）"
    claude_code: "Edit"
    cursor: "replace_in_file"

  file_search_pattern: # 按通配符匹配文件路径
    description: "按 glob 模式查找文件"
    kilo: "glob"
    opencode: "glob"
    claude_code: "Glob"
    cursor: "search_file"

  content_search_regex: # 按正则搜索文件内容
    description: "在文件内容中搜索匹配正则的行"
    kilo: "grep"      # 或 rg
    opencode: "grep"
    claude_code: "Grep"
    cursor: "search_content"

  shell_execute:      # 执行系统命令
    description: "在终端中执行命令并获取输出"
    kilo: "bash"
    opencode: "bash"  # PowerShell on Windows
    claude_code: "Bash"
    cursor: "run_command"

  web_fetch:          # 获取 URL 内容
    description: "获取 HTTP/HTTPS URL 的响应内容"
    kilo: "webfetch"
    opencode: "webfetch"
    claude_code: "WebFetch"
    cursor: "web_fetch"

  task_dispatch:      # 调度子任务/子 Agent
    description: "启动子 Agent 或子任务处理特定工作"
    kilo: "task"
    opencode: "task"  # 待验证具体语义
    claude_code: "Task"
    cursor: "（无直接等效，需通过 / 命令间接实现）"

  agent_orchestrate:  # 多 Agent 会话编排
    description: "创建隔离的 Agent 执行环境，管理 Agent 生命周期"
    kilo: "agent_manager"
    opencode: "（无原生支持，需降级为手动 git worktree 操作）"
    claude_code: "（无原生支持）"
    cursor: "（无原生支持）"

  knowledge_load:     # 加载技能/知识单元
    description: "加载预定义的技能或知识模块"
    kilo: "skill" + "load skill <name>" 语法
    opencode: "skill（通过 opencode.jsonc 配置）"
    claude_code: "（通过 CLAUDE.md 中的指令或 slash commands）"
    cursor: "（通过 .cursorrules 或 slash commands）"
```

### 2.4 跨平台权限模型统一方案

当前 Kilo 的 YAML 权限模型与工具名强绑定。建议重新设计为**工具无关的声明式权限模型**：

```yaml
# 建议的通用权限声明格式
permissions:
  # 文件系统权限
  filesystem:
    read:
      - "src/**"
      - ".openfeel/**"
      - "*.md"
    write:
      - ".openfeel/plan/**"      # 允许写入计划文件
      - ".openfeel/users/**/bugs/**"  # 允许写入 Bug 记录
      - "**/*test*.*"      # 允许写入测试文件
    deny_write:
      - "src/**"           # 明确禁止修改源码
      - "*.config.*"       # 禁止修改配置文件

  # 网络权限
  network:
    http_fetch: true       # 允许 HTTP 请求
    external_access: false # 禁止访问外部 API

  # 命令执行权限
  shell:
    allowed: true
    restricted_commands:   # 受限命令列表
      - "rm -rf"
      - "git push --force"

  # Agent 间通信权限
  agent_comms:
    can_dispatch_subagent: true     # 可以调度子 Agent
    can_create_worktree: false       # 可以创建隔离环境
    max_parallel_subagents: 3        # 最大并行子 Agent 数

  # 平台特定扩展
  platform_extensions:
    kilo:
      # Kilo 特有的权限细化
    opencode:
      # OpenCode 特有的权限细化
```

**适配器翻译逻辑**：

1. 读取通用权限声明。
2. 查找目标平台的工具-权限映射表。
3. 将 `filesystem.write` 翻译为 Kilo 的 `edit: { pattern: "allow/deny" }` 格式，或 OpenCode 的等效约束。
4. 将 `agent_comms.can_create_worktree` 翻译为 Kilo 的 `agent_manager: "allow/deny"`，在 OpenCode 中则完全移除（因为无等效工具）。
5. 生成完整的平台原生 Agent 定义文件。

---

## 3. 对 OpenFeel 的即时修正清单

以下修正清单按文件分组，标注每处需修改的行号、当前内容、修正内容和优先级。

**优先级定义**：
- **P0（阻塞）**：不修正则 Agent 完全无法工作，或核心流程断裂
- **P1（重要）**：不修正则部分功能失效或产生误导
- **P2（改善）**：不修正不影响功能但存在冗余或误导信息

### 3.1 逐文件修正明细

---

#### 文件 1：`.opencode/agents/architect.md`

| # | 行号 | 问题 | 当前内容 | 修正内容 | 优先级 |
|---|------|------|----------|----------|--------|
| 1 | 6-13 | `edit` 权限块引用不存在的工具 | `permission: edit: ...` | 移除 `edit` 权限块（或替换为 OpenCode 等效声明）。OpenCode 中文件写入通过 `bash` 实现，权限控制不在此层 | P0 |
| 2 | 19 | `agent_manager` 工具不存在 | `agent_manager: "allow"` | 删除此行。在 OpenCode 中无可用的 agent_manager 等效工具 | P0 |
| 3 | 20 | `todowrite` 工具不存在 | `todowrite: "allow"` | 删除此行。OpenCode 无此工具 | P1 |
| 4 | 28-30 | 正文引用 `write/edit` 工具 | `> **编辑权限**：你可以用 write/edit 工具直接修改...` / `- **不能修改源码**：你的 `edit` 权限仅限于...` | 改为：`> **编辑权限**：你可以通过 `bash` 工具（Set-Content 等 PowerShell 命令）修改 `.openfeel/` 目录下的文档...` / `- **不能修改源码**：你的文件修改权限仅限于 `.openfeel/` 目录下的文档文件。` | P0 |
| 5 | 196-247 | 整个「自动闭环」章节依赖 `agent_manager` | 包含 `agent_manager` 工具调用、worktree 创建、并行启动等 | 重写此章节：`agent_manager` 不可用的替代方案——改为人工流程触发 + 状态更新，删除 worktree 并行启动相关内容。保留状态机逻辑但移除工具调用示例。第 204 行的 JSON 示例需删除或替换为"手动执行 git worktree 命令"的 bash 示例 | P0 |
| 6 | 237 | 正文引用 `load skill` | `调用 `load skill update-stage-status`` | 验证 OpenCode 是否支持 `load skill` 语法。如不支持，改为直接说明技能执行步骤或通过 opencode.jsonc 的 skills 配置引用 | P1 |
| 7 | 缺少 | `webfetch` 未在 YAML 中声明 | 无 | 添加 `webfetch: "allow"`（如果 OpenCode 需要 YAML 权限声明） | P2 |

---

#### 文件 2：`.opencode/agents/tester.md`

| # | 行号 | 问题 | 当前内容 | 修正内容 | 优先级 |
|---|------|------|----------|----------|--------|
| 1 | 5-7 | `edit` 权限块引用不存在的工具 | `permission: edit: ...` | 移除 `edit` 权限块或替换为 OpenCode 等效声明 | P0 |
| 2 | 13 | `todowrite` 工具不存在 | `todowrite: "allow"` | 删除此行 | P1 |
| 3 | 15 | `todoread` 工具不存在 | `todoread: "allow"` | 删除此行。OpenCode 无此工具 | P1 |
| 4 | 37 | 正文引用 `write/edit` 工具 | `> **编辑权限**：你可以用 write/edit 工具直接修改...` | 改为：`> **编辑权限**：你可以通过 `bash` 工具修改 `.openfeel/users/{username}/bugs/` 下的 Bug 文件...` | P0 |
| 5 | 缺少 | `webfetch` 未在 YAML 中声明 | 无 | 添加 `webfetch: "allow"`（如 OpenCode 需要） | P2 |

---

#### 文件 3：`.opencode/agents/auto-runner.md`

| # | 行号 | 问题 | 当前内容 | 修正内容 | 优先级 |
|---|------|------|----------|----------|--------|
| 1 | 6-14 | `edit` 权限块引用不存在的工具 | `permission: edit: ...` | 移除 `edit` 权限块 | P0 |
| 2 | 20 | `todowrite` 工具不存在 | `todowrite: "allow"` | 删除此行 | P1 |
| 3 | 28, 140 | 正文引用 `write/edit` 工具 | `> **编辑权限**：你可以用 write/edit 工具直接修改...` / `并行 worker 不得通过 `edit` 修改同一文件` | 第 28 行改为通过 `bash` 修改文件的指导。第 140 行改为 `并行 worker 不得通过 `bash` 修改同一文件` | P0 |
| 4 | 缺少 | `webfetch` 未在 YAML 中声明 | 无 | 添加 `webfetch: "allow"` | P2 |

---

#### 文件 4：`.opencode/agents/code.md`

| # | 行号 | 问题 | 当前内容 | 修正内容 | 优先级 |
|---|------|------|----------|----------|--------|
| 1 | 6-12 | `edit` 权限块引用不存在的工具 | `permission: edit: ...` | 移除 `edit` 权限块 | P0 |
| 2 | 18 | `todowrite` 工具不存在 | `todowrite: "allow"` | 删除此行 | P1 |
| 3 | 缺少 | `webfetch` 未在 YAML 中声明 | 无 | 添加 `webfetch: "allow"` | P2 |

---

#### 文件 5：`.opencode/agents/code-worker.md`

| # | 行号 | 问题 | 当前内容 | 修正内容 | 优先级 |
|---|------|------|----------|----------|--------|
| 1 | 6-12 | `edit` 权限块引用不存在的工具 | `permission: edit: ...` | 移除 `edit` 权限块 | P0 |
| 2 | 18 | `todowrite` 工具不存在 | `todowrite: "allow"` | 删除此行 | P1 |
| 3 | 缺少 | `webfetch` 未在 YAML 中声明 | 无 | 添加 `webfetch: "allow"` | P2 |

---

#### 文件 6：`.opencode/agents/review-worker.md`

| # | 行号 | 问题 | 当前内容 | 修正内容 | 优先级 |
|---|------|------|----------|----------|--------|
| 1 | 6-13 | `edit` 权限块引用不存在的工具 | `permission: edit: ...` | 移除 `edit` 权限块 | P0 |
| 2 | 19 | `todowrite` 工具不存在 | `todowrite: "allow"` | 删除此行 | P1 |
| 3 | 27 | 正文引用 `write/edit` 工具 | `> **编辑权限**：你可以用 write/edit 工具直接修改...` | 改为通过 `bash` 修改文件的指导 | P0 |
| 4 | 缺少 | `webfetch` 未在 YAML 中声明 | 无 | 添加 `webfetch: "allow"` | P2 |

---

#### 文件 7：`.opencode/agents/debug.md`

| # | 行号 | 问题 | 当前内容 | 修正内容 | 优先级 |
|---|------|------|----------|----------|--------|
| 1 | 6-8 | `edit` 权限块引用不存在的工具 | `permission: edit: ...` | 移除 `edit` 权限块 | P0 |
| 2 | 14 | `todowrite` 工具不存在 | `todowrite: "allow"` | 删除此行 | P1 |
| 3 | 22 | 正文引用 `write/edit` 工具 | `> **编辑权限**：你可以用 write/edit 工具直接修改...` | 改为通过 `bash` 修改文件的指导 | P0 |
| 4 | 缺少 | `webfetch` 未在 YAML 中声明 | 无 | 添加 `webfetch: "allow"` | P2 |

---

#### 文件 8：`.opencode/agents/test-writer.md`

| # | 行号 | 问题 | 当前内容 | 修正内容 | 优先级 |
|---|------|------|----------|----------|--------|
| 1 | 6-16 | `edit` 权限块引用不存在的工具 | `permission: edit: ...` | 移除 `edit` 权限块 | P0 |
| 2 | 22 | `todowrite` 工具不存在 | `todowrite: "allow"` | 删除此行 | P1 |
| 3 | 32 | 正文引用 `write/edit` 工具 | `> **编辑权限**：你可以用 write/edit 工具直接修改测试文件...` | 改为通过 `bash` 修改测试文件的指导 | P0 |
| 4 | 缺少 | `webfetch` 未在 YAML 中声明 | 无 | 添加 `webfetch: "allow"` | P2 |

---

#### 文件 9：`.opencode/agents/ask.md`

| # | 行号 | 问题 | 当前内容 | 修正内容 | 优先级 |
|---|------|------|----------|----------|--------|
| 1 | 6-7 | `edit` 权限块引用不存在的工具 | `permission: edit: { "*": "deny" }` | 移除 `edit` 权限块（ask Agent 不应有编辑权限，`*: deny` 本身语义正确但工具不存在） | P0 |
| 2 | 13 | `todowrite` 工具不存在 | `todowrite: "allow"` | 删除此行 | P1 |
| 3 | 缺少 | `webfetch` 未在 YAML 中声明 | 无 | 添加 `webfetch: "allow"`（Ask Agent 需要查阅在线文档） | P2 |

---

#### 文件 10：`.opencode/instructions/core.md`

| # | 行号 | 问题 | 当前内容 | 修正内容 | 优先级 |
|---|------|------|----------|----------|--------|
| 1 | 57 | 引用不存在的 `write`/`edit` 工具名 | `` `read`、`write`、`edit`、`glob` 操作返回 "file not found"...`` | 移除 `write` 和 `edit`，改为 `read`、`glob` 操作返回 "file not found"。或增加说明：OpenCode 中没有 write/edit 工具，文件修改通过 bash 实现 | P1 |

---

#### 文件 11：`opencode.jsonc`

| # | 行号 | 问题 | 当前内容 | 修正内容 | 优先级 |
|---|------|------|----------|----------|--------|
| 1 | 17 | 实验性 `agent_manager_tool` 开关 | `"agent_manager_tool": true` | 评估 OpenCode 该实验功能的实际可用性。如果不可用，移除或设为 false，避免 Agent 误以为该工具可用 | P1 |

---

### 3.2 优先级汇总

| 优先级 | 涉及文件数 | 修改点数 | 描述 |
|--------|-----------|---------|------|
| **P0（阻塞）** | 10 个文件 | 18 处 | `edit`/`write` YAML 权限块移除（9 文件）+ 正文编辑指导改写（6 文件）+ `agent_manager` YAML 移除（1 文件）+ `agent_manager` 自动闭环章节重写（1 文件） |
| **P1（重要）** | 11 个文件 | 13 处 | `todowrite` 移除（9 文件）+ `todoread` 移除（1 文件）+ core.md 工具名修正（1 文件）+ opencode.jsonc 开关评估（1 文件）+ `load skill` 语法验证（1 文件） |
| **P2（改善）** | 9 个文件 | 9 处 | 所有 Agent 文件 YAML 中添加 `webfetch: "allow"` 声明 |

**修正顺序建议**：先执行 P0 修正（使 Agent 的基本文件操作和核心工作流可用），再执行 P1（清理无效引用和修复误导性指导），最后执行 P2（完善缺失的权限声明）。

---

## 4. 附录

### 4.1 Kilo vs OpenCode 工具集完整对比表

| 工具名 | Kilo (AI_Prompt) | OpenCode (当前环境) | OpenFeel 9 个 Agent YAML 中的声明情况 | 正文引用情况 |
|--------|-------------------|---------------------|--------------------------------------|-------------|
| `read` | ✅ 原生支持 | ✅ 原生支持 | 9/9 文件已声明 | 大量引用 |
| `bash` | ✅ 原生支持 | ✅ 原生支持（PowerShell） | 9/9 文件已声明 | 大量引用 |
| `glob` | ✅ 原生支持 | ✅ 原生支持 | 9/9 文件已声明 | 大量引用 |
| `grep` | ✅ 原生支持 | ✅ 原生支持 | 9/9 文件已声明 | 大量引用 |
| `webfetch` | ✅ 原生支持 | ✅ 原生支持 | **0/9 文件声明（缺失）** | 无引用 |
| `edit` | ✅ 原生支持 | ❌ 不存在 | **9/9 文件已声明（工具不存在）** | 6 文件正文引用 |
| `write` | ✅ 原生支持 | ❌ 不存在 | 含于 `edit` 概念中 | 6 文件正文引用 |
| `task` | ✅ 原生支持 | ⚠️ 待验证 | 9/9 文件已声明 | 大量引用 |
| `skill` | ✅ 原生支持 | ⚠️ 格式不同（`load skill` vs 配置文件声明） | 9/9 文件已声明 | 38 处 `load skill` 引用 |
| `agent_manager` | ✅ 核心工具 | ❌ 不存在（实验性开关） | 1/9 文件声明（architect.md） | 1 文件正文引用（关键流程） |
| `todowrite` | ✅ 原生支持 | ❌ 不存在 | **9/9 文件已声明（工具不存在）** | 无引用 |
| `todoread` | ✅ 原生支持 | ❌ 不存在 | 1/9 文件声明（tester.md） | 无引用 |
| `websearch` | ✅ 原生支持 | ❌ 不存在 | 0/9 文件声明 | 无引用 |

### 4.2 AI_Prompt 类似问题检查清单

以下检查清单供 AI_Prompt 项目在迁移到其他平台（Claude Code、Cursor、GitHub Copilot 等）时使用，用于提前发现工具兼容性问题。OpenFeel 项目当前已命中的所有问题均已标记 ✅。

#### 通用检查项

- [x] ✅ **是否存在 `edit`/`write` 工具？** — 如不存在，Agent 无法直接编辑文件；需通过 shell 工具间接实现。影响所有 Agent。
- [x] ✅ **是否存在 `agent_manager` 工具？** — 如不存在，自动闭环的 worktree 创建、并行调度和自动合并全部失效。影响 architect Agent。
- [x] ✅ **是否存在 `todowrite`/`todoread` 工具？** — 如不存在，YAML 中的声明是冗余的。影响所有 Agent 的 YAML 块。
- [x] ✅ **YAML `permission` 块是否被目标平台解析？** — 如不解析，整个权限声明体系都是死代码。影响所有 Agent。
- [x] ✅ **`webfetch` 是否在 YAML 中声明？** — 工具存在但 Agent 无权限声明，可能导致调用被拒。影响所有 Agent。
- [ ] **`task` 工具的 API 是否与 Kilo 兼容？** — 子 Agent 调度的调用格式、参数名和返回值可能不同。影响所有 Agent 的协作链路。
- [ ] **`load skill` 语法是否被目标平台支持？** — 如不支持，所有技能调用指令（get-stage-status、update-stage-status、get-bugs、check-kb 等）需要改写。影响所有 Agent 的会话启动流程。
- [ ] **`websearch` 是否被使用？** — 检查 Agent 正文中是否有"搜索"相关指令依赖此工具。

#### 特定 Agent 检查项

| Agent | 检查项 | OpenFeel 状态 |
|-------|--------|--------------|
| **architect.md** | `agent_manager` 章节是否需要完全重写？ | ✅ 需要重写（第 196-247 行） |
| **architect.md** | 自动合并逻辑（`git merge` + `git worktree remove`）是否在目标平台可执行？ | ⚠️ 需验证（依赖 git 环境） |
| **architect.md** | `Plan Mode 迁移`（`.kilo/plans/` → `.openfeel/plan/`）是否仍然需要？ | ⚠️ OpenCode 不存在 `.kilo/`，此章节应移除 |
| **tester.md** | `todoread` 是否在正文中使用？ | ✅ 仅 YAML 声明，可安全移除 |
| **auto-runner.md** | 调度逻辑（调用 CodeWorker/ReviewWorker 等）是否依赖 `agent_manager`？ | ⚠️ auto-runner 通过 `task` 调度，但 auto-runner 本身是靠 architect 通过 `agent_manager` 启动的 |
| **code.md** | 自动闭环逻辑是否需要修改？ | ✅ 包含自动闭环章节（第 102-128 行），调用 `agent_manager` 的部分需调整 |

#### 文件级检查项

| 文件 | 检查项 | OpenFeel 状态 |
|------|--------|--------------|
| `AGENTS.md` | 是否包含平台特定工具名或路径？ | ⚠️ 第 7 行提到 `.kilo/` 路径，在 OpenCode 中不存在 |
| `instructions/core.md` | 是否包含平台特定工具名？ | ✅ 第 57 行引用 `edit`/`write` |
| `opencode.jsonc`（或 `kilo.jsonc`） | 配置文件格式是否与目标平台匹配？ | ✅ 已改为 `opencode.jsonc` 格式 |
| `.openfeel/config.yaml` | 文件内容是否因编码问题损坏？ | ✅ 当前文件出现乱码，需修复编码后重新写入 |
| `skills/*/SKILL.md` | 技能定义中是否包含平台特定工具调用？ | ⚠️ 需逐技能检查 `bash` 命令是否与 PowerShell 兼容 |

---

> **文档结束**。本分析基于 2026-06-25 对 OpenFeel 项目 `.opencode/` 目录下 9 个 Agent 定义文件、1 个指令文件、7 个技能文件以及项目配置文件的完整审查。
