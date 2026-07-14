# OpenFeel — AI Agent 开发流程治理 CLI

OpenFeel is a TypeScript CLI tool that provides end-to-end process governance for AI Agent development.

## 解决什么问题 / What Problem Does It Solve

在 AI Agent 项目开发中，常见的痛点：
- **流程混乱**：Agent 之间的调度靠"口口相传"，缺乏统一协调机制
- **状态不可追踪**：不知道当前谁在干什么、进展如何、卡在哪里
- **产出不可管理**：方案、代码、审查、测试散落各处，没有统一入口
- **经验无法沉淀**：每次会话结束经验就丢失，下次从头再来

In AI Agent project development, common pain points include:
- **Chaotic process**: Agent scheduling relies on "word of mouth" without a unified coordination mechanism
- **Untrackable state**: No one knows who is doing what, how far along things are, or where they are stuck
- **Unmanageable outputs**: Schemes, code, reviews, and tests are scattered everywhere without a unified entry point
- **Non-accumulated experience**: Experience is lost after each session, starting from scratch every time

OpenFeel 将"提示词瘦身，流程入工具"——Agent 不靠读长文本理解流程，而是通过 `flow.json` 获取当前状态和下一步指令，实现开发流水线的自动化治理。

OpenFeel embodies "slim prompts, process in tools" — Agents do not understand workflows by reading long texts, but instead obtain current state and next instructions via `flow.json`, enabling automated governance of the development pipeline.

## 安装 / Installation

### 中文

```bash
npm install -g openfeel
```

要求：Node >= 20

### English

```bash
npm install -g openfeel
```

Requires: Node >= 20

## 快速开始 / Quick Start

### 中文

```bash
# 1. 初始化项目工作区
openfeel init ./my-project

# 2. 创建分期大纲
openfeel roadmap create v1.0

# 3. 添加工作阶段
openfeel plan stage add stage-01

# 4. 创建操作方案
openfeel plan scheme create stage-01 "实现核心功能"

# 5. 查看流水线状态
openfeel flow status
```

### English

```bash
# 1. Initialize project workspace
openfeel init ./my-project

# 2. Create a version roadmap
openfeel roadmap create v1.0

# 3. Add a work stage
openfeel plan stage add stage-01

# 4. Create an operation scheme
openfeel plan scheme create stage-01 "Implement core features"

# 5. View pipeline status
openfeel flow status
```

## 命令参考 / Command Reference

### 中文

| 命令 | 用途 |
|------|------|
| `openfeel init [path]` | 初始化项目工作区，创建 `.openfeel/` 目录结构和配置文件 |
| `openfeel flow` | 流水线状态管理（status/current/advance/attempt/review/log） |
| `openfeel roadmap` | 分期大纲管理（create/show） |
| `openfeel plan` | 工作阶段与操作方案管理（stage add/list、scheme create/list） |
| `openfeel instructions` | 为指定 artifact 生成结构化 XML/JSON 指令 |
| `openfeel view` | 审查条目管理（list/add/accept） |
| `openfeel archive <stage>` | 阶段归档，汇总产出、生成摘要、提取知识 |
| `openfeel knowledge` | 知识库管理（list/add/search/index） |
| `openfeel update` | 更新 OpenCode 适配文件（Agent 定义和 Skill 文件） |

### English

| Command | Purpose |
|---------|---------|
| `openfeel init [path]` | Initialize project workspace, create `.openfeel/` directory structure and config files |
| `openfeel flow` | Pipeline state management (status/current/advance/attempt/review/log) |
| `openfeel roadmap` | Version roadmap management (create/show) |
| `openfeel plan` | Work stage and operation scheme management (stage add/list, scheme create/list) |
| `openfeel instructions` | Generate structured XML/JSON instructions for specified artifact |
| `openfeel view` | Review item management (list/add/accept) |
| `openfeel archive <stage>` | Stage archiving, consolidate outputs, generate summary, extract knowledge |
| `openfeel knowledge` | Knowledge base management (list/add/search/index) |
| `openfeel update` | Update OpenCode adapter files (Agent definitions and Skill files) |

详细命令参数和示例见：[docs/commands.md](docs/commands.md)

## 核心概念 / Core Concepts

### Feel Agent（总统领 / Orchestrator）

Feel 是整个流程的调度中心（总统领），负责接收用户意图并调度下游 Agent 执行具体任务。

Feel is the command center (Orchestrator) of the entire workflow, responsible for receiving user intent and dispatching downstream Agents to execute specific tasks.

### 三层计划体系 / Three-Tier Planning

```
Roadmap（分期大纲）
  └── Stage（工作阶段）
        └── Op（操作方案）—— 最细粒度执行单元
```

### flow.json — 流水线状态核心 / Pipeline State Core

`.openfeel/flow.json` 是项目流水线的唯一真相源，记录所有阶段、操作、审查条目和日志。Agent 通过读取它获取上下文，执行完毕后写回状态。

`.openfeel/flow.json` is the single source of truth for the project pipeline, recording all stages, operations, review items, and logs. Agents read it for context and write back state after execution.

### /opfx:* 技能映射 / Skill Mapping

| Skill | 用途 / Purpose |
|-------|----------------|
| `/opfx:flow` | 流水线状态查询 / Pipeline status query |
| `/opfx:plan` | 计划制定 / Plan formulation |
| `/opfx:scheme` | 方案制定 / Scheme formulation |
| `/opfx:code` | 编码执行 / Code execution |
| `/opfx:view` | 代码审查 / Code review |
| `/opfx:test` | 测试验收 / Test acceptance |
| `/opfx:archive` | 阶段归档 / Stage archiving |
| `/opfx:kb` | 知识库操作 / Knowledge base operations |

## 架构 / Architecture

```
CLI 层（Commander）
  ├── init / update
  ├── flow         ← FlowManager（状态机核心 / State machine core）
  ├── roadmap      ← Roadmap 模块
  ├── plan         ← Stage / Scheme 模块
  ├── instructions ← 指令生成器 / Instruction generator
  ├── view         ← 审查条目模块 / Review item module
  ├── archive      ← 归档模块 / Archiving module
  └── knowledge    ← 知识库模块 / Knowledge base module

Core 层
  ├── FlowManager — 流水线状态读写、推进、重试、日志 / Pipeline state read/write, advance, retry, log
  ├── config — 配置文件读写 / Config file read/write
  ├── schema — Zod Schema 验证引擎 / Zod Schema validation engine
  ├── plan/ — 三层计划 / Three-tier planning (roadmap / stage / scheme)
  ├── artifact-graph/ — 依赖图与指令生成 / Dependency graph & instruction generation
  ├── view/ — 审查条目 CRUD / Review item CRUD
  ├── archive/ — 归档合并 / Archive consolidation
  └── workspace/ — 目录结构和知识库 / Directory structure & knowledge base
```

## 开发 / Development

### 中文

```bash
# 安装依赖
npm install

# 编译 TypeScript
npm run build

# 运行测试
npm test
```

### English

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run build

# Run tests
npm test
```

## 许可 / License

MIT
