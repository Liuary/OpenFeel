# OpenFeel — AI Agent 开发流程治理 CLI

[English](README.en.md) | [更新日志](CHANGELOG.md) | [npm](https://www.npmjs.com/package/openfeel) | [入门指南](docs/GETTING_STARTED.md)

> ⚠️ 下文示例命令 `openfeel <cmd>` 为**安装后的一般使用者用法**；若在**本仓库源码**中开发/执行，请改用 `node bin/openfeel.js <cmd>`（全局 `openfeel` 可能滞后于本仓——未随本仓库源码同步更新）。

OpenFeel 是一个 TypeScript CLI 工具，为 AI Agent 开发提供端到端的流程治理。

> **当前适配 harness**：opencode（默认）；框架面向多 harness 适配（其余适配器预留）。  
> **默认模型配置**：DeepSeek V4（主力推理） + GLM-5.3-flash（交叉审查） + DeepSeek-flash（多模态视觉）。  
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

## v1.1.2 新增能力

- **自描述**：`flow phases [--json]` 输出全部合法 phase 与转移表（JSON 顶层 5 键：`schemaVersion` / `phases` / `transitions` / `advanceAccepted` / `transitionsDiff`）。
- **阶段治理**：`flow stage remove` / `plan stage add --deps` / `stageId` 校验与目录冲突检测。
- **配置有效值**：`config effective` 输出有效值 + 生效来源（`status.md > config.yaml > profile.yaml > builtin`）。
- **结构化输出**：`flow status/current/health/metrics/overview --json`（纯 JSON + `schemaVersion`）。
- **纠正/清理侧命令面**：`plan scheme remove/rename/publish`、`flow ops list`、`flow health --fix`、`knowledge dedup`、`lint` 发现问题非 0 退出。
- **部署与备份**：部署覆盖前自动备份 `~/.openfeel/backup/{ts}/`；新增 skill `openfeel-cli-usage`（skill 16 → 17）。

## 命令参考

| 命令 | 用途 |
|------|------|
| `openfeel init [path]` | 初始化新项目，创建 `.openfeel/` 目录结构和平台适配器（当前：opencode） |
| `openfeel update` | 为已有项目增量部署平台适配器（适用于 `init` 之后再引入 OpenFeel 的项目） |
| `openfeel flow` | 流水线状态管理（status / phases / overview / current / advance / attempt / ops list / health [--fix] / checkpoint / migrate；status·current·health·metrics·overview 支持 --json） |
| `openfeel roadmap` | 分期大纲管理（create / show） |
| `openfeel plan` | 工作阶段与操作方案管理（stage add/list [--deps/--tasks]、scheme create [--draft] / publish / rename / remove / list） |
| `openfeel lint` | 质量门禁检查（i18n 键对称性 / kb 过期引用；**发现问题非 0 退出**，无逃生阀） |
| `openfeel config` | 配置管理（get / set[**全量 `defaults.*`**] / effective / get-lang / list-projects，支持 --global） |
| `openfeel knowledge` | 知识库管理（list / add / search / index / dedup） |
| `openfeel archive <stage>` | 阶段归档，汇总产出、生成摘要、提取知识 |
| `openfeel setup` | 纯全局部署（全局 AGENTS.md + agent + skill + 平台适配器配置），不建项目 `.openfeel/` |
| `openfeel migrate` | 存量旧布局项目迁移（检测 / 备份 / 回滚） |
| `openfeel model` | 三层级 agent 模型配置（set / get / list，`--scope`） |
| `openfeel stage` | 阶段状态（status / set / task / create［已弃用］） |
| `openfeel project` | 项目管理（overview） |
| `openfeel view` | 审查条目管理（list / accept；新增/修改/删除改用 `flow review add|update|remove`） |
| `openfeel instructions` | 生成结构化指令（artifact → XML/JSON） |

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
| Utility | 事务官 | 文件机械操作 |
| Vision | 视觉官 | 多模态视觉分析 |
| Archiver | 归档官 | 归档操作记录与知识提取 |

### 全局部署与工作区分层

框架资产（9 agent / 17 skill / 全局 `AGENTS.md` / 全局 `opencode.jsonc`）经 `openfeel setup` 部署到 `~/.config/opencode/`；**仓库自身不保留项目级 `.opencode/agents|skills`**（stage-55 起）。

工作区状态分两层：`current.md`（团队文件，跨用户整体进度，≤5 条 + 自动归档）与 `dev_last.md`（本地索引 + 主题目录，跨会话恢复）。框架资产部署覆盖前**自动备份**至 `~/.openfeel/backup/{ts}/`。

### 三层计划体系

```
Roadmap（分期大纲）
  └── Stage（工作阶段）
        └── Op（操作方案）—— 最细粒度执行单元
```

### flow.json — 流水线状态核心

`.openfeel/flow.json` 是项目流水线的唯一真相源，记录所有阶段、操作、审查条目和日志。Agent 通过读取它获取上下文，执行完毕后写回状态。

### 流水线命令与 Agent 分工

| 入口 | 用途 |
|------|------|
| `openfeel flow` | 流水线状态查询与推进 |
| `openfeel plan` | 制定分期大纲和工作阶段 |
| `openfeel plan scheme` | 制定细粒度操作方案 |
| `openfeel-executor` | 按方案编码实现 |
| `openfeel view` | 审查条目验收 |
| `openfeel-feel-tester` | 测试验收 |
| `openfeel archive` | 归档操作记录 |
| `openfeel knowledge` | 知识库操作 |

## 架构

```
CLI 层（Commander）
  ├── init / update / setup / migrate
  ├── stage / project / model
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
  ├── backup.ts — 覆盖写前备份（~/.openfeel/backup/{ts}/）
  ├── fs/ — 原子写 + 建议性文件锁
  └── workspace/ — 目录结构和知识库
```

> **框架资产全局部署**：9 agent / 17 skill / 全局 `AGENTS.md` / 全局 `opencode.jsonc` 经 `openfeel setup` 部署到 `~/.config/opencode/`；仓库自身不保留项目级 `.opencode/agents|skills`（stage-55 起）。

## 开发

```bash
npm install        # 安装依赖
npm run build      # 编译 TypeScript
npm test           # 运行测试（986 用例 / 59 个测试文件；Linux CI 跳过 1 个 Windows 专属用例）
```

## 致谢

本项目基于 [AI_Prompt](https://github.com/Liuary/AI_Prompt) 开发，参考了 [OpenSpec](https://github.com/Fission-AI/OpenSpec) 等工具的流程治理思路。

## 许可

[MIT](LICENSE)
