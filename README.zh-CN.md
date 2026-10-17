# OpenFeel — AI Agent 开发流程治理 CLI

[English](README.en.md) | [更新日志](CHANGELOG.md) | [npm](https://www.npmjs.com/package/openfeel) | [入门指南](docs/GETTING_STARTED.md)

> 📚 版本能力概览：[docs/VERSIONS.md](docs/VERSIONS.md) ｜ 逐版本明细：[CHANGELOG.md](CHANGELOG.md)

> ⚠️ 下文示例命令 `openfeel <cmd>` 为**安装后的一般使用者用法**；若在**本仓库源码**中开发/执行，请改用 `node bin/openfeel.js <cmd>`（全局 `openfeel` 可能滞后于本仓——未随本仓库源码同步更新）。

OpenFeel 是一个 TypeScript CLI 工具，为 AI Agent 开发提供端到端的流程治理。

> **当前适配 harness**：**opencode（默认）** ｜ **Claude Code**（`--tools claude`，v1.1.6 起） ｜ **DSH**（`--tools dsh`，v1.3.0 起）；框架面向多 harness 适配（其余适配器预留）。  
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

## 升级 openfeel

```bash
npm i -g openfeel@latest   # 1. 升级 CLI
openfeel setup             # 2. 重跑部署，刷新全局 AGENTS.md/agents/skills/opencode.jsonc
# 3. 重启 harness（opencode）以加载新的全局配置
```

> 仅 `npm i -g` 不会刷新全局资产，须重跑 `openfeel setup` 并重启 harness。
> CLI 在检测到全局部署漂移或全局部署缺失时，也会向 stderr 打印被动提示。
> 若不确定是否需要升级，运行 `openfeel setup --check` 诊断全局部署版本与 CLI 版本是否一致。

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

## 推荐用法：需求驱动 + 快速迭代（fast）

> 日常开发默认推荐 **fast**：计划审查 + 代码审查各单轮，跳过方案/测试相位；大改动或架构变更再用 **full**。

```bash
openfeel req add "接入 DSH 适配器" --workflow-mode fast          # 1. 发布需求
openfeel req claim REQ-NNN                                       # 2. 认领
openfeel plan stage add vX.Y.Z-stage-NN --workflow-mode fast     # 3. 建 fast 阶段
openfeel req link --stage vX.Y.Z-stage-NN --requirement REQ-NNN  # 4. 关联
openfeel flow next                                               # 5. 按调度迭代
```

- **fast（默认推荐）**：日常迭代；保留计划审查与代码审查，跳过 scheme/test；
- **full**：大改动 / 架构变更，完整六关；
- **general**：无流水线的零散任务，仅需求级合法；
- 需求关联阶段后，全部关联阶段 done 时自动收口需求。

## Claude Code 适配器（v1.1.6 起）

> 与 opencode 适配器**并存**，**默认不启用**（须显式 `--tools claude`）。

- **启用**：`openfeel setup --tools claude`（或 `--tools opencode,claude` 双 harness）。
- **部署资产到 `~/.claude/`**：`CLAUDE.md`（全局约束，受管区三态，用户已有内容 append 不覆盖）、`agents/`（**10 个**，含 `feel`）、`skills/`（**22 个**共享源）、`settings.json`（注入 `"agent":"feel"` + `"permissions":{"defaultMode":"auto"}`，**用户既有键逐字保留**；**无则创建、有则不覆盖**——用户主权键 `model` 不被改写）。
- **升级**：`npm i -g openfeel@latest` → `openfeel setup --tools claude`；**首次创建 `~/.claude/{agents,skills}` 后须重启会话或 `/reload-skills`** 使新 skill/agent 生效；`CLAUDE.md` 于**下次会话**生效。仅 `npm i -g` 不刷新全局资产。
- **默认零触**：不带 `--tools` 时 `~/.claude/` **零变化**。

## DSH 适配器（v1.3.0 起）

> 与 opencode / Claude Code 适配器**并存**，默认不部署；适配器随 `openfeel` 单包分发。

```bash
npm i -g openfeel@latest      # 1. 安装/升级（单包，已含 dsh/）
openfeel setup --tools dsh    # 2. 部署到 DSH profile（默认全部；可 --dsh-profile web）
# 3. 重启 DSH 宿主
```

- 写入 `<DSH_HOME>/profiles/<name>/package.json`：`dependencies["openfeel-dsh"] = "link:<openfeelRoot>/dsh"` + `dsh.profile.bundles += "openfeel-dsh"`，并在需要时执行 `pnpm install`（依赖未变化且链接有效时跳过）。
- 前提：DSH `0.2.0-rc.2`、Node ≥ 20.17、存在 DSH profile、全局 `openfeel` 可用。
- 升级：`npm i -g openfeel@latest` → 重启 DSH；`link:` 指向同一路径，随包更新。
- 开发态可直接 `link:` 仓库 `dsh/`；详见 [dsh/README.md](dsh/README.md) 与 [dsh/ADAPTER.md](dsh/ADAPTER.md)。
- `openfeel update --tools dsh` 不适用（DSH 是全局部署）。

## 快速迭代模式（v1.1.7 起）

> 与完整流水线（full）**并存**；新部署默认 **fast**（`config.yaml defaults.workflow_mode`），可逐阶段覆盖与切回。

- **快线链**：`plan_pending → plan_review → plan_passed → exec_running → review_pending → review_passed → archiving → done`（跳过 6 项 `scheme_*` / `test_*`；**计划审查与代码审查保留单轮**，`review_failed` 可回环重试）。
- **选择与切换**：`openfeel plan stage add <name> --workflow-mode full|fast|general`（新建阶段）；`openfeel stage set <stage> --workflow-mode full|fast|general`（单阶段切回）；`openfeel config set defaults.workflow_mode full|fast|general`（项目默认记忆）。**`general` 仅需求级合法**（v1.2.1 起，见 [docs/VERSIONS.md](docs/VERSIONS.md)）。
- **查看（只读）**：`openfeel flow mode [--stage <id>] [--json]`（当前模式 + 来源）；`openfeel flow phases [--mode full|fast|general] [--stage <id>]`（按模式查看转移表）。
- **默认自动推进开启**：新部署默认 `auto_advance: enabled`（v1.1.7 起）；如需关闭：`openfeel config set auto_advance disabled`。

升级迁移提示见 [docs/GETTING_STARTED.md](docs/GETTING_STARTED.md)「工作流模式（full / fast）与自动推进」小节与 [CHANGELOG.md](CHANGELOG.md) `[1.1.7]`。

## 命令参考

| 命令 | 用途 |
|------|------|
| `openfeel init [path]` | 初始化新项目，创建 `.openfeel/` 目录结构和平台适配器（当前：opencode） |
| `openfeel update` | 为已有项目增量部署平台适配器（适用于 `init` 之后再引入 OpenFeel 的项目）；`--tools <list>` 显式启用 Claude Code 适配器；**`--tools dsh` 不适用**（请用 `setup`） |
| `openfeel flow` | 流水线状态管理（status / phases / overview / current / advance / attempt / ops list / health [--fix] / checkpoint / migrate；status·current·health·metrics·overview 支持 --json） |
| `openfeel roadmap` | 分期大纲管理（create / show） |
| `openfeel plan` | 工作阶段与操作方案管理（stage add/list [--deps/--tasks]、scheme create [--draft] / publish / rename / remove / list） |
| `openfeel lint` | 质量门禁检查（i18n 键对称性 / kb 过期引用；**发现问题非 0 退出**，无逃生阀） |
| `openfeel config` | 配置管理（get / set[**全量 `defaults.*`**] / effective / get-lang / list-projects，支持 --global） |
| `openfeel knowledge` | 知识库管理（list / add / search / index / dedup） |
| `openfeel archive <stage>` | 阶段归档，汇总产出、生成摘要、提取知识（**阶段摘要归档**——与 `flow archive` 版本分片归档区分） |
| `openfeel flow archive` | flow.json 版本分片归档（`<version>` / `list` / `show`；与 `openfeel archive` 阶段摘要归档区分） |
| `openfeel req` | 需求流转（add / list / show / claim / release / set / link / advance / board / next） |
| `openfeel setup` | 纯全局部署（全局 AGENTS.md + agent + skill + 平台适配器配置），不建项目 `.openfeel/`；`--tools <list>` 显式启用 Claude Code 适配器；**`--tools dsh`** 部署到 DSH profile（`--dsh-profile <name>` 窄化） |
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

框架资产（10 agent / 22 skill / 全局 `AGENTS.md` / 全局 `opencode.jsonc`）经 `openfeel setup` 部署到 `~/.config/opencode/`；**仓库自身不保留项目级 `.opencode/agents|skills`**（stage-55 起）。

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

> **框架资产全局部署**：10 agent / 22 skill / 全局 `AGENTS.md` / 全局 `opencode.jsonc` 经 `openfeel setup` 部署到 `~/.config/opencode/`；仓库自身不保留项目级 `.opencode/agents|skills`（stage-55 起）。

## 开发

```bash
npm install        # 安装依赖
npm run build      # 编译 TypeScript
npm test           # 运行测试（77 文件 / 1978 用例；Linux CI 跳过 1 个 Windows 专属用例）
```

## 致谢

本项目基于 [AI_Prompt](https://github.com/Liuary/AI_Prompt) 开发，参考了 [OpenSpec](https://github.com/Fission-AI/OpenSpec) 等工具的流程治理思路。

## 许可

[MIT](LICENSE)
