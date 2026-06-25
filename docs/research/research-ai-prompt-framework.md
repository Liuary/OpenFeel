# AI_Prompt 项目研究文档

> 撰写时间：2026-05-12
> 文档性质：项目定位分析、竞品对比、发展预测

---

## 一、项目概述

### 1.1 项目是什么

AI_Prompt 是一个 **AI Agent 开发治理模板项目**——不是运行时代码框架，而是一套可部署到任意项目中的**约束体系 + 工作流规范 + Agent 角色定义 + Skill 定义 + 工作区约定**的综合方案。

它不等同于"一个 prompt 模板"或"一个 rules 文件"，而是一个覆盖 **计划→实现→审查→测试→Bug 修复→知识沉淀** 完整开发流程的治理系统。

### 1.2 核心思想

**核心理念**：AI 在软件开发中强大的同时很危险。它不是"不够聪明"，而是"不去想该不该做"。AI_Prompt 的核心思想不是在 AI 的能力上做加法（赋能），而是在 AI 的行为上做减法（约束）——用一套明确、可执行、可演进的规则体系，让 AI Agent **在可控范围内高效工作**。

与此相对，市面上大多数 Agent 框架（LangChain、CrewAI、AutoGen 等）在"赋能"——给 Agent 更多工具、更多能力、更长的记忆，但缺少对 Agent "不该做什么"的系统性约束。

**五大设计原则**：

| 原则 | 说明 | 如何体现 |
|------|------|----------|
| **约束优先于赋能** | 先定义边界，再谈能力 | AGENTS.md 六条核心约束优先于所有 Agent 定义 |
| **默认人工，可选自动** | 人保持控制权，需要时再开启自动闭环 | `status.md` 默认 `manual`，需显式切换 `auto` |
| **声明式替代程序式** | 用 Markdown/YAML 配置文件替代 Python/TS 代码 | 所有 Agent、Skill、规则均在 Markdown 中定义 |
| **公域私域分离** | 团队共享与个人工作区物理隔离 | `.ai/` 公域纳入 Git，`.ai/users/{name}/` 本地忽略 |
| **过程可追溯** | 每个决策、每次变更都有记录 | 日志、审查记录、Bug 修复记录、状态变更记录 |

### 1.3 三层约束体系

AI_Prompt 采用三层递进式约束体系，优先级从低到高：

```
┌────────────────────────────────────────────┐
│  第三层：动态规则 (.ai/dev/dev_core.md)       │
│  [+] / [-] 开关管理，频繁变动，项目级定制       │
│  高于 AGENTS.md，低于用户指令                  │
├────────────────────────────────────────────┤
│  第二层：流程约束 (Kilo/Instructions/...)      │
│  定义 .ai/ 工作区操作流程、状态机、审查/Bug 流转  │
│  覆盖 AGENTS.md 的通用约束                     │
├────────────────────────────────────────────┤
│  第一层：永久约束 (AGENTS.md)                  │
│  六条核心行为准则 + 编码规范 + 注释规范          │
│  基础层，适用于所有会话，跨工具通用               │
└────────────────────────────────────────────┘
```

约束体系与知识库严格分离：
- **约束体系**（AGENTS.md / Instructions / dev_core.md）：记录"应该怎么做"
- **知识库**（.ai/kb/）：记录"这个项目是什么样的"和"遇到问题怎么办"

### 1.4 项目结构

```
AI_Prompt/
├── AGENTS.md                          # 第一层：永久约束 + 编码规范
├── kilo.jsonc                         # Kilo 配置文件
├── deploy.py                          # 一键部署脚本
├── DEPLOY.md                          # 部署操作文档
├── README.md                          # 项目总览
│
├── Kilo/                              # 模板文件（部署时复制到目标项目）
│   ├── Instructions/
│   │   └── kilo_instructions_core.md  # 第二层：.ai 工作区操作规范
│   ├── agents/                        # Agent 角色定义（主 Agent + 子代办）
│   │   ├── architect.md               # 主 Agent：计划管理 + 代码审查
│   │   ├── code.md                    # 主 Agent：Bug 修复 + 审查处理
│   │   ├── ask.md                     # 主 Agent：只读分析
│   │   ├── auto-runner.md             # 子代办：自动闭环调度
│   │   ├── code-worker.md             # 子代办：自动闭环编码
│   │   ├── review-worker.md           # 子代办：自动闭环审查
│   │   ├── test-writer.md             # 子代办：自动编写测试
│   │   ├── tester.md                  # 子代办：测试与 Bug 管理
│   │   └── debug.md                   # 子代办：缺陷排查
│   └── skills/                        # 可复用能力单元
│       ├── bug-acceptance/
│       ├── get-bugs/
│       ├── check-kb/
│       ├── get-stage-status/
│       └── update-stage-status/
│
└── .ai/                               # AI 工作目录
    ├── .info.json                     # 用户身份（本地不纳入版本管理）
    ├── dev/                           # 核心规则与进度状态
    │   ├── dev_core.md                # 第三层：动态规则
    │   ├── current.md                 # 团队当前进度
    │   └── note/                      # 团队共享笔记
    ├── log/                           # 公共日志（团队级事件）
    ├── code_review/                   # 公共审查摘要
    ├── bugs/                          # 公共 Bug 摘要
    ├── plan/                          # 项目计划（大计划 + 阶段子目录）
    │   ├── plan.md                    # 大计划
    │   ├── plan_index.md              # 计划索引
    │   ├── plan_log.md                # 计划变更日志
    │   └── {stage}/                   # 阶段子目录
    │       └── status.md              # 子计划状态机
    ├── kb/                            # 知识库
    │   ├── index.md
    │   ├── architecture.md
    │   ├── patterns.md
    │   ├── troubleshooting.md
    │   └── setup.md
    └── users/{username}/              # 私域（本地不纳入版本管理）
        ├── dev_last.md                # 个人操作状态
        ├── log/                       # 个人日志
        ├── note/                      # 个人笔记
        ├── code_review/               # 个人审查记录
        ├── bugs/                      # 个人 Bug 追踪
        └── tmp/                       # 个人临时文件
```

### 1.5 九大 Agent 角色体系

AI_Prompt 定义了完整的 Agent 角色分工，按**人工流程**与**自动流程**双轨运行：

| 角色 | 类型 | 轨道 | 权限 | 职责 |
|------|------|------|------|------|
| **architect** | 主 Agent | 人工 | `.ai/` 目录读写，源码只读 | 计划管理 + 代码审查 + 审查验收 |
| **code** | 主 Agent | 人工 | 全项目读写 | Bug 修复 + 审查问题处理 |
| **ask** | 主 Agent | 人工 | 全项目只读 | 代码查阅 + 知识检索 + 方案分析 |
| **auto-runner** | 子代办 | 自动 | `.ai/` 目录读写，源码只读 | 在单个 worktree 中串行调度自动闭环 |
| **code-worker** | 子代办 | 自动 | 全项目读写（限定 worktree） | 自动闭环编码实现 + 审查修复 + Bug 修复 |
| **review-worker** | 子代办 | 自动 | `.ai/` 目录读写，源码只读 | 自动闭环代码审查 + 审查验收 |
| **test-writer** | 子代办 | 自动 | 仅测试文件 | 根据计划编写自动化测试 |
| **tester** | 子代办 | 双轨 | Bug 文件读写 | 测试执行 + Bug 提交 + 验收闭环 |
| **debug** | 子代办 | 双轨 | Bug 文件读写 | 缺陷排查 + 根因分析 |

**双轨隔离原则**：人工流程使用主 Agent（architect / code），自动流程使用 Worker 子代办（auto-runner → code-worker / review-worker），两套职责隔离，避免互抢控制权。

### 1.6 子计划状态机

自动闭环的核心是基于 `status.md` 的正式状态机：

```
planned → ready_for_code → coding → ready_for_review
                                   ↕ (审查不通过)
                              review_passed → test_writing → testing
                                                            ↕ (发现 Bug)
                                                        bug_fixing → done
```

每个状态都有明确的**当前责任 Agent**和**转换条件**。状态机通过 `get-stage-status` 和 `update-stage-status` 两个 Skill 进行读写。

### 1.7 项目愿景

AI_Prompt 的愿景分为三层：

1. **近期（当前阶段）**：作为 Kilo 的 Agent 治理模板，为单个工具提供可控的 AI 开发体验。
2. **中期（v2.0）**：成为跨工具的 Agent 治理框架，支持 Kilo、Cursor、Claude Code、GitHub Copilot 等主流 Agent 工具，提供统一的配置-运行-审计体系。
3. **远期（v3.0）**：发展成为 AI 辅助软件开发的**治理标准**，类似 ESLint 之于代码风格、Conventional Commits 之于提交规范——让 `.ai/` 工作区成为任何一个 AI 驱动的开发项目的标配。

---

## 二、市场相关项目对比

### 2.1 竞品分类图谱

按作用层和能力维度，将所有相关项目分类如下：

```
                        程序化（代码框架）
                              │
                    LangChain │  CrewAI
                    AutoGen   │  Semantic Kernel
                    Smolagents│  Pydantic AI
                              │
  ── 应用运行时层 ────────────┼────────── 开发工具治理层 ──
                              │
                    (AI_Prompt 的独特位置)
                              │
                    Cursor Rules    Claude Code CLAUDE.md
                    Copilot Instructions  Aider Conventions
                              │
                        声明式（配置文件）
```

AI_Prompt 明确位于**右下象限**——开发工具治理层 + 声明式配置——这是当前市场几乎无竞品的蓝海区域。

### 2.2 直接相关项目（开发工具治理层）

这些项目与 AI_Prompt 最接近，都是在工具层面提供 Agent 行为配置：

#### 2.2.1 Claude Code — CLAUDE.md / .claude/

| 维度 | Claude Code | AI_Prompt |
|------|------------|-----------|
| **定位** | Anthropic 官方 CLI Agent 工具 | 跨工具 Agent 治理模板套件 |
| **规则文件** | `CLAUDE.md`（项目根目录，单文件）| `AGENTS.md` + `Instructions/` + `.ai/dev/dev_core.md`（三层递进） |
| **Agent 角色** | 单 Agent，无角色分工 | 9 个预定义角色，人工/自动双轨 |
| **工作流** | 无显式工作流 | 完整状态机（planned→done），双轨调度 |
| **审查机制** | 无内建审查 | Architect 审查 + ReviewWorker 自动审查 |
| **Bug 追踪** | 无内建 | 完整的 Bug 提交-修复-验收闭环 |
| **知识库** | 无内建 | 结构化知识库（architecture/patterns/troubleshooting/setup） |
| **团队支持** | 弱（单机为主） | 公域/私域分离，支持多人协作 |
| **部署方式** | `claude` CLI 安装 | `deploy.py` 一键部署模板 |
| **GitHub Stars** | 123k | — |

**关键差异**：Claude Code 的 `CLAUDE.md` 是"一个文件放一些规则"，AI_Prompt 是"一套完整的治理系统"。

#### 2.2.2 Cursor — .cursorrules / .cursor/rules/

| 维度 | Cursor Rules | AI_Prompt |
|------|-------------|-----------|
| **定位** | IDE AI 编码助手的规则配置 | 跨工具 AI 开发治理框架 |
| **规则文件** | `.cursorrules`（单文件）或 `.cursor/rules/*.mdc`（多文件） | 三层约束体系（AGENTS.md + Instructions + dev_core.md） |
| **规则粒度** | 项目级 / 文件匹配模式 | 项目级 / 目录级 / 动态规则 |
| **Agent 角色** | 单一 Agent（Chat / Composer） | 9 个角色，明确职责分工 |
| **工作流** | 无 | 完整状态机 + 双轨 |
| **跨工具** | 仅 Cursor | 设计目标：Kilo/Cursor/Claude Code/Copilot/... |

**关键差异**：Cursor Rules 解决"在这个文件里 AI 该怎么干活"，AI_Prompt 解决"AI 在这个项目的整个生命周期该怎么干活"。

#### 2.2.3 GitHub Copilot — copilot-instructions.md / AGENTS.md

| 维度 | GitHub Copilot | AI_Prompt |
|------|---------------|-----------|
| **规则文件** | `.github/copilot-instructions.md`（仓库级）+ `.github/instructions/*.instructions.md`（路径级）| `AGENTS.md`（仓库级）+ `AGENTS.md`（子目录级）+ `dev_core.md`（动态规则） |
| **Agent 支持** | 支持 `AGENTS.md` 作为 Agent 指令文件 | `AGENTS.md` 是核心约束文件，是最早使用该文件名的项目之一 |
| **审查** | Copilot Code Review（使用自定义指令） | Architect 审查 + ReviewWorker 审查 + 审查条目生命周期 |
| **状态管理** | 无 | `status.md` 状态机（14 种状态） |
| **工作区** | 无 | `.ai/` 标准化工作区 |

**关键差异**：GitHub Copilot 的规则体系是最接近 AI_Prompt 的（都是声明式、多层级、支持 Agent），但它缺少工作流状态机、Agent 角色体系、Bug 追踪等深度治理能力。

#### 2.2.4 Aider — .aider.conf.yml / CONVENTIONS.md

| 维度 | Aider | AI_Prompt |
|------|-------|-----------|
| **定位** | AI 结对编程 CLI 工具 | 跨工具 AI 治理框架 |
| **配置方式** | `.aider.conf.yml`（YAML 配置）+ `CONVENTIONS.md`（编码约定） | Markdown 声明式约束 + YAML Agent 定义 |
| **Agent 角色** | 单 Agent（/architect 模式仅分离"设计"和"编码"） | 9 个预定义角色 |
| **工作流** | 无显式工作流 | 完整状态机 |
| **Git 集成** | 深度（自动 commit、自动管理变更） | 中度（通过 Agent 行为规范约束 Git 操作） |

#### 2.2.5 Cline — .clinerules

| 维度 | Cline | AI_Prompt |
|------|-------|-----------|
| **定位** | VS Code AI 编码助手 | 跨工具 AI 治理框架 |
| **规则文件** | `.clinerules`（单文件） | 三层约束体系 |
| **层级** | 项目级 + 语言级 | 项目级 + 目录级 + 动态规则 |
| **Agent 角色** | 单 Agent | 9 个角色 |

### 2.3 间接相关项目（应用运行时层）

这些项目是 AI Agent 的开发框架，侧重"赋能"而非"约束"，与 AI_Prompt 分处不同层次：

| 项目 | Stars | 定位 | 与 AI_Prompt 关系 |
|------|-------|------|-------------------|
| **LangChain / LangGraph** | 100k+ | LLM 应用开发框架 | 互补：AI_Prompt 约束 AI 怎么写代码，LangChain 让 AI 成为代码的一部分 |
| **CrewAI** | 25k+ | 多 Agent 协作框架 | 角色定义思路相似（Role/Goal/Backlog），但 CrewAI 是运行时框架 |
| **AutoGen** (Microsoft) | 37k+ | 多 Agent 对话框架 | 都有人机协作和 Agent 间通信，但 AutoGen 是程序化框架 |
| **Semantic Kernel** (Microsoft) | 23k+ | 企业级 AI 编排 SDK | 互补：SK 管 AI 能力集成，AI_Prompt 管 AI 行为边界 |
| **OpenAI Agents SDK** | 25k+ | 官方 Agent SDK | Guardrails 概念类似，但 Agents SDK 是运行时 API |
| **Smolagents** (Hugging Face) | 17k+ | 轻量 Agent 框架 | Code Agent 思路相似，但 Smolagents 是代码框架 |
| **Pydantic AI** | 8k+ | 类型安全 Agent 框架 | 结构化约束思路相似，但 Pydantic AI 在运行时 |

### 2.4 标准与规范类项目（参考生态位）

这些项目本质上都是"约定优于配置"的规范标准，与 AI_Prompt 的预期生态位类似：

| 标准/规范 | 解决的问题 | 生态位类比 |
|-----------|-----------|------------|
| **Conventional Commits** | 提交信息格式不统一 | AI_Prompt 之于 AI 开发过程 |
| **ESLint** | JS 代码风格不统一 | AI_Prompt 之于 AI Agent 行为 |
| **Keep a Changelog** | 变更日志格式混乱 | AI_Prompt 之于 AI 开发日志 |
| **EditorConfig** | 编辑器配置不一致 | AI_Prompt 之于 AI 工具配置 |
| **OpenAPI** | API 描述格式不统一 | AI_Prompt 之于 AI 计划/状态描述 |

AI_Prompt 的生态位就是要在 **AI Agent 开发治理**这个领域，做到 ESLint 之于代码风格、Conventional Commits 之于提交规范那样的地位。

### 2.5 综合对比矩阵

| 能力维度 | AI_Prompt | Claude Code | Cursor | Copilot | Aider | LangChain | CrewAI |
|----------|-----------|-------------|--------|---------|-------|-----------|--------|
| **多层级规则** | ✅ 三层 | ✅ 单文件 | ✅ 多文件 | ✅ 二级 | ⚠️ 单文件+YAML | ❌ | ❌ |
| **Agent 角色分工** | ✅ 9 角色 | ❌ 单 Agent | ❌ 单 Agent | ❌ 单 Agent | ⚠️ /architect | ✅ 自定义 | ✅ Role/Goal |
| **人工/自动双轨** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **形式化状态机** | ✅ 14 状态 | ❌ | ❌ | ❌ | ❌ | ⚠️ StateGraph | ✅ 部分 |
| **审查闭环** | ✅ | ❌ | ❌ | ⚠️ 注释 | ❌ | ❌ | ❌ |
| **Bug 追踪闭环** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **知识库** | ✅ 结构化 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **团队协作** | ✅ 公域/私域 | ⚠️ 共享 CLAUDE.md | ⚠️ 共享规则 | ✅ 组织级 | ⚠️ 单机 | ❌ | ⚠️ |
| **跨工具兼容** | 🎯 设计目标 | ❌ 仅 Claude | ❌ 仅 Cursor | ❌ 仅 Copilot | ❌ 仅 Aider | ✅ 框架通用 | ✅ 框架通用 |
| **部署方式** | `deploy.py` 一键 | CLI 安装 | IDE 安装 | GitHub 集成 | pip 安装 | pip 安装 | pip 安装 |
| **许可证** | 开源 | 闭源(免费) | 闭源(付费) | 闭源(付费) | 开源 | 开源 | 开源 |

---

## 三、差异性与定位分析

### 3.1 核心差异化优势

| 维度 | AI_Prompt 的做法 | 行业现状 | 差异化程度 |
|------|-----------------|----------|------------|
| **约束哲学** | 用三层约束做减法，先定义"不能做什么" | 几乎所有项目都在做加法（更多工具/能力） | ⭐⭐⭐⭐⭐ |
| **跨工具治理** | 一套配置多工具生效（AGENTS.md + .ai/） | 每个工具都有自己的规则格式，互不兼容 | ⭐⭐⭐⭐⭐ |
| **Agent 角色体系** | 预定义 9 个角色，权限分明，职责清晰 | 最多区分"设计/编码"两个阶段 | ⭐⭐⭐⭐ |
| **人工/自动双轨** | 默认人工控制，需要时启动自动闭环，互不干扰 | 要么纯人工，要么纯自动 | ⭐⭐⭐⭐ |
| **状态机驱动** | 14 种状态的形式化开发阶段机 | 无或极度简化的状态 | ⭐⭐⭐⭐⭐ |
| **工作区一体化** | 计划、日志、审查、Bug、知识库在同一套目录下 | 各自散落在不同工具中 | ⭐⭐⭐⭐ |
| **部署即用** | deploy.py 一键部署整套治理体系 | 需要手动逐个配置 | ⭐⭐⭐ |

### 3.2 当前短板

| 短板 | 说明 | 影响 |
|------|------|------|
| **单工具绑定** | 当前 Agent/Skill 定义绑定了 Kilo 格式（`.kilo/` 目录、`kilo.jsonc`） | 限制了"跨工具"愿景的落地 |
| **无运行时 CLI** | 只有 `deploy.py` 部署脚本，缺少 `ai-*` 系列的 CLI 工具（check、log、status 等） | 使用体验不够"产品化" |
| **Markdown 解析依赖 Agent** | 规则写在自然语言 Markdown 中，依赖 Agent 的理解一致性 | 无法自动校验和冲突检测 |
| **无可观测性** | 日志和状态分散在 Markdown 文件中，无聚合视图 | 团队管理者缺乏全局视角 |
| **生态为零** | 无社区贡献的规则模板、无第三方适配器 | 新用户上手成本高 |

### 3.3 与流行 Harness 的核心异同

这是前期讨论中提出的关键问题，此处给出形式化答案：

| 维度 | 流行 Harness（LangChain 等） | AI_Prompt |
|------|---------------------------|-----------|
| **作用层** | 应用运行时层（Application Runtime） | 开发工具治理层（Dev Tool Governance） |
| **核心哲学** | 赋能：给开发者 API，自由组合 Agent 能力 | 约束：给 Agent 划定行为边界 |
| **实现方式** | 程序化：`pip install` + Python/TS 代码 | 声明式：Markdown 配置文件 |
| **运行位置** | 用户的应用程序进程内 | AI 工具的工作目录中 |
| **生命周期** | 应用运行时加载 | 整个项目开发周期持续生效 |
| **解决的问题** | 如何让 AI *成为* 应用逻辑 | 如何让 AI *创建* 应用的过程受控 |
| **用户画像** | 应用开发者（写业务代码） | 项目管理者 / 全栈开发者（配置 AI 工作方式） |
| **两者关系** | 互补，可共存，不冲突 | |

---

## 四、发展预测

### 4.1 行业趋势

基于 2024-2026 年 AI 编程工具的爆发式增长（Claude Code 123k stars、Cursor 估值百亿、GitHub Copilot 数千万用户），以下趋势正在加速：

1. **Agent 工具多元化**：不会有一个垄断者。企业会同时用多种 Agent 工具（Claude Code 做复杂任务、Cursor 做日常编码、Copilot 做代码审查），**跨工具的治理需求**将在 2027 年前变得尖锐。

2. **从"AI 辅助编码"到"AI 辅助开发"**：AI 不再只是写代码片段，而是参与需求分析 → 设计 → 实现 → 审查 → 测试 → 部署的整个流程。**全流程治理**成为刚需。

3. **企业采纳面临合规压力**：金融、医疗、政府等行业对 AI 生成代码的**可追溯性、可审计性**要求在 2026-2028 年间成为硬性要求。

4. **Agent 行为标准可能出现**：类似 ESLint 统一了 JS 代码风格、Prettier 统一了格式化，AI Agent 的行为约束也需要一个**社区标准**。这个标准尚未出现，窗口期在 2026-2028 年。

5. **从"用 AI 写代码"到"管理 AI 写代码"**：随着 Agent 能力增强，人的角色从"编码者"转变为"监督者和管理者"，**Agent 治理工具**的需求将快速增长。

### 4.2 AI_Prompt 的发展阶段预测

#### 第一阶段（2026 Q3-Q4）：跨工具 MVP

```
目标：从 Kilo 专用 → 覆盖 3+ 主流工具
```

- 将 Agent/Skill 定义从 Kilo 专用格式中**解耦**，定义**通用描述格式**（YAML/JSON Schema）
- 提供适配器：Kilo Adapter、Claude Code Adapter、Cursor Adapter
- 发布 `ai-init` CLI 替代 deploy.py，支持 `ai-init --tool cursor`
- 将 `.ai/` 工作区作为独立标准，与具体工具解耦

**里程碑**：一个 `.ai/` 目录 + `AGENTS.md` 同时在 Kilo、Claude Code、Cursor 中生效

#### 第二阶段（2027 Q1-Q2）：治理平台化

```
目标：从静态配置文件 → 可操作的工具平台
```

- 发布 `ai-cli` 工具集：
  - `ai-status`：查看所有子计划状态
  - `ai-log`：聚合日志视图
  - `ai-review`：列出待处理审查条目
  - `ai-bugs`：列出待处理 Bug
  - `ai-check`：校验规则一致性
- 规则 DSL：从自然语言 Markdown → 半结构化 YAML（可静态分析、可冲突检测）
- 可观测面板：Agent 行为指标（审查通过率、Bug 平均修复时间、各阶段耗时）

**里程碑**：`ai-check` 可以检测到规则冲突和缺失

#### 第三阶段（2027 Q3-Q4）：生态化与标准化

```
目标：从单一项目 → 社区生态 + 开放标准
```

- **模板市场**：社区贡献的规则模板（startup-template、enterprise-template、open-source-template）
- **适配器生态**：第三方开发的工具适配器（JetBrains AI、Windsurf、Zed、Replit Agent...）
- **`.ai-spec` 标准提案**：将 `.ai/` 工作区规范形式化为开放标准（参考 OpenAPI、Conventional Commits 的发展路径）
- **CI/CD 集成**：GitHub Action `ai-governance-check` 检验 PR 是否遵循治理规则

**里程碑**：有 10+ 个工具的原生适配器，`.ai-spec` v1.0 草案发布

#### 第四阶段（2028+）：企业级治理平台

```
目标：从开发者工具 → 企业合规基础设施
```

- **合规审计**：每次 AI 代码修改的完整链路（谁→什么计划→谁审查→什么 Bug→验收结论）
- **策略即代码**：规则版本管理、规则 CI/CD、规则 A/B 测试
- **SaaS 平台**：托管版治理平台（团队管理、模板中心、指标分析）
- **认证体系**："AI-Ready" 项目认证

### 4.3 风险与挑战

| 风险 | 说明 | 应对 |
|------|------|------|
| **工具厂商自建** | Claude Code、Cursor 等可能自建类似的治理体系 | 先发优势 + 跨工具兼容是护城河 |
| **标准碎片化** | 如果各工具各自推出互不兼容的"规则标准" | 主动推动 `.ai-spec` 标准提案 |
| **Agent 能力跃迁** | 如果 AI 达到不需要约束也能完美工作的水平 | 约束体系的复杂度会降低，但治理需求（可追溯性、合规性）不会消失 |
| **用户教育成本** | 开发者习惯"直接写代码"，不愿接受约束体系 | 渐进式采用：从 AGENTS.md 单文件开始，逐步引入完整体系 |
| **维护成本** | 需要持续跟进各工具的格式变化 | 架构上保持适配器与核心体系解耦 |

### 4.4 机会窗口

当前（2026 Q2）是 AI_Prompt 概念的最佳入场时机，理由如下：

1. **AI 编程工具已过早期实验阶段**：Claude Code 123k stars、GitHub Copilot 数千万用户——用户基数足够大，但**治理需求尚未被满足**。
2. **多工具共存已成事实**：大型团队普遍同时使用 2-3 种 AI 编程工具，但**没有跨工具的治理方案**。
3. **企业合规需求即将爆发**：2025-2026 年多个国家出台 AI 生成代码的监管要求（EU AI Act 等），2027-2028 年将成为硬性合规要求。
4. **"Agent 行为标准"领域完全空白**：ESLint 诞生前也没有 JS 代码风格标准，但一旦出现就被广泛采纳。AI Agent 行为的标准化同理。
5. **GitHub 正在定义 AGENTS.md 标准**：GitHub Copilot 已将 `AGENTS.md` 作为官方支持的 Agent 指令文件格式。AI_Prompt 作为最早使用并系统化 `AGENTS.md` 的项目，有机会参与并影响这个标准的演进方向。

---

## 五、结论

### 5.1 定位一句话

AI_Prompt 是 **AI Agent 开发治理领域的 ESLint**——它解决的不是"AI 能做什么"，而是"AI 在开发中该怎么做"；它的差异化不在算法或模型层面，而在**流程、约束和治理**层面；它的终极愿景是让 `.ai/` 工作区和 `AGENTS.md` 成为任何 AI 驱动开发项目的标配，就像 `.gitignore` 之于版本管理。

### 5.2 当前状态

- **思想成熟度**：高——约束体系、状态机、双轨隔离、公域私域分离等概念均已实现并文档化
- **工程实现度**：中——Kilo 专用版本可用，`deploy.py` 可完成模板部署，但缺少跨工具适配和 CLI 工具
- **生态成熟度**：零——尚无社区贡献、第三方适配器或外部用户

### 5.3 下一步建议

1. **立刻做**：将 Agent/Skill 定义从 Kilo 专用格式中解耦，设计跨工具的通用配置格式。
2. **近期做**：实现 3 个工具的适配器（Claude Code、Cursor、Kilo 自身），发布 `ai-init` CLI。
3. **中期做**：发布规则 DSL 和 `ai-check` 校验工具，建立可观测性。
4. **长期做**：推动 `.ai-spec` 开放标准，建设社区生态。

---

> **免责声明**：本文档中的市场分析和预测基于 2026 年 5 月可获取的公开信息，实际发展可能受到技术突破、市场变化和监管政策的影响。
