# OpenFeel — AI Agent 开发流程治理 CLI

[English](README.en.md) | [更新日志](CHANGELOG.md) | [入门指南](docs/GETTING_STARTED.md)

OpenFeel 是一个 TypeScript CLI 工具，为 AI Agent 开发提供端到端的流程治理。

> **支持平台**：目前仅支持 [opencode](https://opencode.ai)。  
> **默认模型配置**：DeepSeek V4（主力推理） + GLM-5.1（交叉审查） + Alibaba-CN qwen3-vl-plus（多模态视觉）。  
> 首次 `openfeel init` 时会自动检测用户已注册的模型并引导配置。

## 解决什么问题

在 AI Agent 项目开发中，常见的痛点：
- **流程混乱**：Agent 之间的调度靠"口口相传"，缺乏统一协调机制
- **状态不可追踪**：不知道当前谁在干什么、进展如何、卡在哪里
- **产出不可管理**：方案、代码、审查、测试散落各处，没有统一入口
- **经验无法沉淀**：每次会话结束经验就丢失，下次从头再来

OpenFeel 将「提示词瘦身，流程入工具」——Agent 不靠读长文本理解流程，而是通过 `flow.json` 获取当前状态和下一步指令，实现开发流水线的自动化治理。

## 安装

```bash
npm install -g openfeel        # 安装
npm install -g openfeel@latest # 更新到最新版本
```

要求：Node.js ≥ 20

## 快速开始

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

## 命令参考

| 命令 | 用途 |
|------|------|
| `openfeel init [path]` | 初始化新项目，创建 `.openfeel/` 目录结构和平台适配器（opencode） |
| `openfeel update` | 为已有项目增量部署平台适配器（适用于 `init` 之后再引入 OpenFeel 的项目） |
| `openfeel flow` | 流水线状态管理（status / current / advance / overview） |
| `openfeel roadmap` | 分期大纲管理（create / show） |
| `openfeel plan` | 工作阶段与操作方案管理（stage add/list、scheme create/list） |
| `openfeel lint` | 质量门禁检查（i18n 键对称性 / kb 过期引用） |
| `openfeel config` | 配置管理（get / set / list，支持 --global） |
| `openfeel knowledge` | 知识库管理（list / search） |
| `openfeel archive <stage>` | 阶段归档，汇总产出、生成摘要、提取知识 |
| `openfeel update` | 更新 Agent 定义和 Skill 文件到目标平台 |

详细参数见：[docs/commands.md](docs/commands.md)

## 核心概念

### Feel Agent（总统领）

Feel 是整个流程的调度中心，负责接收用户意图并调度下游 Agent 执行具体任务。

### 9 Agent 体系

| Agent | 角色 | 说明 |
|-------|------|------|
| Feel | 总统领 | 全局调度与决策 |
| Planner | 计划官 | 制定分期大纲和工作阶段 |
| Schemer | 方案官 | 制定细粒度操作方案 |
| Executor | 执行官 | 按方案编码实现 |
| Reviewer | 审查官 | 交叉审查代码 |
| Feel Tester | 测试官 | 正式测试验收 |
| 事务官 | 事务官 | 文件机械操作 |
| Vision | 视觉官 | 多模态视觉分析 |
| Archiver | 归档官 | 归档操作记录与知识提取 |

### 三层计划体系

```
Roadmap（分期大纲）
  └── Stage（工作阶段）
        └── Op（操作方案）—— 最细粒度执行单元
```

### flow.json — 流水线状态核心

`.openfeel/flow.json` 是项目流水线的唯一真相源，记录所有阶段、操作、审查条目和日志。Agent 通过读取它获取上下文，执行完毕后写回状态。

### /opfx: 技能映射

| Skill | 用途 |
|-------|------|
| `/opfx:flow` | 流水线状态查询与推进 |
| `/opfx:plan` | 制定分期大纲和工作阶段 |
| `/opfx:scheme` | 制定细粒度操作方案 |
| `/opfx:code` | 按方案编码实现 |
| `/opfx:view` | 代码审查 |
| `/opfx:test` | 测试验收 |
| `/opfx:archive` | 归档操作记录 |
| `/opfx:kb` | 知识库操作 |

## 架构

```
CLI 层（Commander）
  ├── init / update
  ├── flow         ← FlowManager（状态机核心）
  ├── roadmap      ← Roadmap 模块
  ├── plan         ← Stage / Scheme 模块
  ├── lint         ← 质量门禁（i18n + kb）
  ├── config       ← 配置管理
  ├── knowledge    ← 知识库模块
  ├── archive      ← 归档模块
  └── view         ← 审查条目模块

Core 层
  ├── FlowManager — 流水线状态读写、推进、重试、日志
  ├── config — 配置文件读写（含全局 profile）
  ├── schema — Zod Schema 验证引擎
  ├── plan/ — 三层计划（roadmap / stage / scheme）
  ├── artifact-graph/ — 依赖图与指令生成
  ├── view/ — 审查条目 CRUD
  ├── archive/ — 归档合并
  └── workspace/ — 目录结构和知识库
```

## 开发

```bash
npm install        # 安装依赖
npm run build      # 编译 TypeScript
npm test           # 运行测试（395 用例）
```

## 致谢

本项目基于 [AI_Prompt](https://github.com/Liuary/AI_Prompt) 开发，参考了 [OpenSpec](https://github.com/Fission-AI/OpenSpec) 等工具的流程治理思路。

## 许可

[MIT](LICENSE)
