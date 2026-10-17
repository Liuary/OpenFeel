# OpenFeel — AI Agent 开发流程治理 CLI

[English](README.en.md) | [更新日志](CHANGELOG.md) | [npm](https://www.npmjs.com/package/openfeel) | [入门指南](docs/GETTING_STARTED.md)

> ⚠️ 下文示例命令 `openfeel <cmd>` 为**安装后的一般使用者用法**；若在**本仓库源码**中开发/执行，请改用 `node bin/openfeel.js <cmd>`（全局 `openfeel` 可能滞后于本仓——未随本仓库源码同步更新）。

OpenFeel 是一个 TypeScript CLI 工具，为 AI Agent 开发提供端到端的流程治理。

> **当前适配 harness**：**opencode（默认）** ｜ **Claude Code**（`--tools claude`，v1.1.6 起）；框架面向多 harness 适配（其余适配器预留）。  
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

## Claude Code 适配器（v1.1.6 起）

> 与 opencode 适配器**并存**，**默认不启用**（须显式 `--tools claude`）。

- **启用**：`openfeel setup --tools claude`（或 `--tools opencode,claude` 双 harness）。
- **部署资产到 `~/.claude/`**：`CLAUDE.md`（全局约束，受管区三态，用户已有内容 append 不覆盖）、`agents/`（**10 个**，含 `feel`）、`skills/`（**22 个**共享源）、`settings.json`（注入 `"agent":"feel"` + `"permissions":{"defaultMode":"auto"}`，**用户既有键逐字保留**；**无则创建、有则不覆盖**——用户主权键 `model` 不被改写）。
- **升级**：`npm i -g openfeel@latest` → `openfeel setup --tools claude`；**首次创建 `~/.claude/{agents,skills}` 后须重启会话或 `/reload-skills`** 使新 skill/agent 生效；`CLAUDE.md` 于**下次会话**生效。仅 `npm i -g` 不刷新全局资产。
- **默认零触**：不带 `--tools` 时 `~/.claude/` **零变化**。

## 快速迭代模式（v1.1.7 起）

> 与完整流水线（full）**并存**；新部署默认 **fast**（`config.yaml defaults.workflow_mode`），可逐阶段覆盖与切回。

- **快线链**：`plan_pending → plan_review → plan_passed → exec_running → review_pending → review_passed → archiving → done`（跳过 6 项 `scheme_*` / `test_*`；**计划审查与代码审查保留单轮**，`review_failed` 可回环重试）。
- **选择与切换**：`openfeel plan stage add <name> --workflow-mode full|fast|general`（新建阶段）；`openfeel stage set <stage> --workflow-mode full|fast|general`（单阶段切回）；`openfeel config set defaults.workflow_mode full|fast|general`（项目默认记忆）。**`general` 仅需求级合法**（v1.2.1 起，见下「v1.2.1 新增能力」）。
- **查看（只读）**：`openfeel flow mode [--stage <id>] [--json]`（当前模式 + 来源）；`openfeel flow phases [--mode full|fast|general] [--stage <id>]`（按模式查看转移表）。
- **默认自动推进开启**：新部署默认 `auto_advance: enabled`（v1.1.7 起）；如需关闭：`openfeel config set auto_advance disabled`。

升级迁移提示见 [docs/GETTING_STARTED.md](docs/GETTING_STARTED.md)「工作流模式（full / fast）与自动推进」小节与 [CHANGELOG.md](CHANGELOG.md) `[1.1.7]`。

## v1.2.3 修复（补丁）

> 对应阶段：**stage-99**。本版为 v1.2.2 转出项收口，不新增功能；JSON 契约 33 成功出口 / 34 注册选项与退出码语义不变。本仓收口基线：**75 文件 / 1911 用例 / 21 阶段**。

- **并发 JSON 退出机制统一（REV-95-009）**：`handleConcurrentConflict` JSON 分支改为「输出 envelope → 置 `process.exitCode=2` → return」；非 JSON 分支逐字不变；10 个调用点无 fallthrough。
- **`--review-tier` help 文案订正（REV-98-003 第 6 项）**：源码 help 与 i18n zh/en 改为「缺省=full（零裁剪）」；缺省推进行为不变。
- **`req` 过滤单点化（REV-97-006）**：`req show` / `req set --workflow-mode` 复用 `listLinkedStages`；`req split` 与 core 引擎层 done 判定原语保留。
- **锁等待超时 E2E 测试钩子（REV-98-006①，test-only）**：仅 `OPENFEEL_TEST_MODE=1` 生效；生产默认 5000/3000ms 不变；E2E 断言 `INTERNAL_ERROR/internal/3`。

## v1.2.2 新增能力

> 对应阶段：**stage-95 ~ 98**。以下能力**v1.2.2 起提供**；JSON 契约单一权威见 docs/json-contract.md（33 个成功出口 / 34 个注册选项）。本仓收口基线：74 文件 / 1894 用例 / 21 阶段。

- **`openfeel flow next [--json]`（决策权威，只读）**：12 键固定序（`schemaVersion,stage,phase,phaseLabel,responsibleAgent,workflowMode,reviewTier,effectiveReviewTier,legalNextPhases,suggestedCommand,guards,blockingReviews`）；`responsibleAgent` 与 `mapPhaseToAgent` 同源；`legalNextPhases` 每个元素均被 `flow advance` 接受；零写盘。
- **全局 `--project <path>`**：任意命令前置/后置/`=` 形态；语义等效 cwd；语言按目标项目、`--log-file` 相对路径按原始 cwd；`knowledge dedup` 保留本地声明（语法兼容）。
- **读命令 `--json` 全量补全**：13 个命令面（`stage status` / `flow recover` / `flow checkpoint list` / `flow log` / `project overview` / `knowledge search|list|index|dedup` / `config get|effective` / `view list` / `plan scheme list`）+ `archive <stage> --json`；累计 **33 个成功出口 / 34 个注册选项**。
- **机器可读错误封装**：`{schemaVersion:1,error:{code,kind,message,detail}}`；退出码 **0 成功 / 1 预期拒绝 / 2 并发冲突 / 3 内部错误（新增）**；legacy `{error:'...'}` 保留 string 类型与键序、末尾追加 `errorKind`；12 行 `code→kind→exitCode` 映射表。
- **`--version --json`**：`{schemaVersion:1,version,node}`（三键；单列，不计入 33 出口/34 选项）。
- **`flow archive --dry-run --json` 判据明细 + `archive <stage> --json`**：`eligible` / `unfinishedStages` / `blockingReviews`；`archivePath` / 计数；`--dry-run` 零写盘。
- **`reviewTier` 消歧**：`flow phases --json` / `flow status.stages[]` / `flow next` 同时给出展示值 `reviewTier`/`displayReviewTier` 与生效值 `effectiveReviewTier`（恒 `full`）。**订正**：`flow advance` 未显式传 `--review-tier` 时生效档位恒 **`full`**（不是按模式派生）；按模式派生的是 `flow phases --json.reviewTier` 展示值。源码 help 文案订正转 v1.2.3。
- **兼容承诺**：既有 19 个成功出口字段零破坏（只增不改）；人类输出逐字不变；退出码 0/1/2 语义不变、3 仅新增；phase 枚举 15 项 / `advanceAccepted` / full-fast 行为不变；存量 `flow.json` 零迁移零注入；REQ-001 L80「2=内部错误或用法错误」登记为需求文本勘误（权威口径见契约 §2/§10）。

## v1.2.1 新增能力

> 对应阶段：**stage-86 ~ 93 + 94**（94 = 表外补阶段：模型默认值与部署非破坏性）。以下能力**v1.2.1 起提供**。

- **三模式架构（`full` / `fast` / `general`）**：`workflow_mode` 值域由 2 值扩为 3 值（默认仍 `fast`）。`general`（无流水线）**仅需求级合法**——阶段级 / 部署级写入面拒绝（`plan stage add` / `stage set` / `config set` 命令层显式门 + wizard 不提供选项）；模式解析链增「需求级」一层（`status.md > 需求级 > config.yaml > builtin`）；**升级不降级**。
- **需求接取与拆分（`openfeel req split`）**：**拆分即发布**——子需求一次入 `scheduled`；`parent_id` 仅溯源（**不入聚合 / 不入 done 门 / 不参与 `PATCH_WHITELIST`**）；并行接取（`claim` 互不阻塞）；**需求与版本解绑**（`target_version` 为纯展示 / 过滤 / 排序维度，非门）。`req` 命令组 **10 → 11 子命令**。
- **通用工作者直接调度（双口径）**：opencode 侧 = 嵌套 `task` 工具；Claude Code 侧 = Handoff 直发。通用模式下可承接任意 Agent **直接调度**的执行任务。
- **新 agent `openfeel-explorer`（只读）**：专职「调研 / 探索」路由——只读 4 工具（Read / Glob / Grep / Bash）；agent 数 **9 → 10**。
- **可观测性**：`metrics.json` 经 `recordRun` 接线；CLI 日志含 `duration_ms` / `project` / `session_id` 三字段；op 级时间戳；跨会话恢复标注（`resumed`）。
- **审查档位（`--review-tier <full|lean|skip>`）**：与工作流模式**分属两轴**——模式定基表，档位裁审查关（`full` 零裁剪 / `lean` 裁 `scheme_review` / `skip` 裁 `plan_review + scheme_review`；恒保留代码审查关 / 测试关 / 归档关）。缺省按模式派生（`full`→`full` / `fast`→`lean` / `general`→`full`）。`flow phases --json` 末位追加 `reviewTier`（既有 6 键逐字保留，**共 7 键**）。
- **并行编排契约 + 归档轻量化**。
- **模型默认值统一 + 部署非破坏性（用户主权键 `model`）**：部署（`setup` / `update`）对用户既有 `model` 键**无则创建、有则不覆盖**。

### 缺陷修复（v1.2.1）

- **`req/BUG-002`**：`general` 需求**完成路径**——`general` 恒零关联阶段（载体制双向门）而 done 门要求全部关联阶段 done，两者交叉曾致 `general` 需求**永远无法 `done`**。现开辟**载体制对偶完成路径**（判据 = 需求自身 `workflow_mode` 字段直判，与载体制门同源），`req advance --to done` / `req set --status done` 对零关联 `general` 需求**放行**；非 `general` 判定单源不变；done 门拒绝改用专用文案。
- **`cli/BUG-011`**：审查档位裁剪致**当前相位无跳转目标**。现**裁剪只作用于入边 / 目标侧**，被裁剪相位保留出边；「进入被裁剪关」仍不可达。
- **`templates/BUG-007`**：en 归档官指针悬空 → 改中文节名 + 补「具名 § 指针字面命中」断言。

## v1.2.0 新增能力

- **flow.json 版本分片归档（`flow archive`）**：三个入口——`openfeel flow archive <version>`（执行归档；判据门 = 该版本全部阶段 done 且无 blocking open REV，**不设 `--force`**）、`openfeel flow archive list`、`openfeel flow archive show <version> [--json]`；归档落点 `.openfeel/flow-archive/{version}.json`。**与顶层 `openfeel archive <stage>`（阶段摘要归档）区分**；常规命令不读归档。
- **需求流转（`openfeel req`）**：10 子命令（v1.2.1 起 11，+`split`）（`add` / `list` / `show` / `claim` / `release` / `set` / `link` / `advance` / `board` / `next`）+ 7 状态（`draft` / `scheduled` / `in_progress` / `done` / `blocked` / `cancelled` / `rejected`）；需求进度由关联阶段 phase 聚合（**全部关联阶段 done 时自动收口**）；认领协议 = `owner` + `claimed_at`（无 TTL）。用法权威源见 `openfeel-req` skill。
- **兼容**：旧 flow.json（无 `requirements` / `archived_versions`）零报错，升级**无需迁移**。

## v1.1.2 新增能力

- **自描述**：`flow phases [--json]` 输出全部合法 phase 与转移表（JSON 顶层 6 键：`schemaVersion` / `phases` / `transitions` / `advanceAccepted` / `transitionsDiff` / `workflowMode`（v1.1.7 追加，既有五键语义逐字不变）；v1.2.1 起 7 键，末位追加 `reviewTier`）。
- **阶段治理**：`flow stage remove` / `plan stage add --deps` / `stageId` 校验与目录冲突检测。
- **配置有效值**：`config effective` 输出有效值 + 生效来源（`status.md > config.yaml > profile.yaml > builtin`）。
- **结构化输出**：`flow status/current/health/metrics/overview --json`（纯 JSON + `schemaVersion`）。
- **纠正/清理侧命令面**：`plan scheme remove/rename/publish`、`flow ops list`、`flow health --fix`、`knowledge dedup`、`lint` 发现问题非 0 退出。
- **部署与备份**：部署覆盖前自动备份 `~/.openfeel/backup/{ts}/`；新增 skill `openfeel-cli-usage`（skill 16 → 17）。
- **输出编码自适应（stage-58 / stage-61 修正）**：`auto` 在 Windows 非 TTY（管道/重定向）下**直通 UTF-8**（管道/CI 友好）；TTY / POSIX 直通 UTF-8；**GBK 需 `--encoding gbk` / `OPENFEEL_ENCODING` 显式**；`--json` **恒 UTF-8**；不可编码字符降 `?` 不告警。
- **运行日志（stage-58）**：默认写入 `~/.openfeel/cli/logs/openfeel-YYYY-MM-DD.log`（UTF-8，按日一文件）；`--log-file <path>` 改路径，`--no-log` / `OPENFEEL_LOG=0` 关闭，`--debug` 记录 debug 级。

## 命令参考

| 命令 | 用途 |
|------|------|
| `openfeel init [path]` | 初始化新项目，创建 `.openfeel/` 目录结构和平台适配器（当前：opencode） |
| `openfeel update` | 为已有项目增量部署平台适配器（适用于 `init` 之后再引入 OpenFeel 的项目）；`--tools <list>` 显式启用 Claude Code 适配器 |
| `openfeel flow` | 流水线状态管理（status / phases / overview / current / advance / attempt / ops list / health [--fix] / checkpoint / migrate；status·current·health·metrics·overview 支持 --json） |
| `openfeel roadmap` | 分期大纲管理（create / show） |
| `openfeel plan` | 工作阶段与操作方案管理（stage add/list [--deps/--tasks]、scheme create [--draft] / publish / rename / remove / list） |
| `openfeel lint` | 质量门禁检查（i18n 键对称性 / kb 过期引用；**发现问题非 0 退出**，无逃生阀） |
| `openfeel config` | 配置管理（get / set[**全量 `defaults.*`**] / effective / get-lang / list-projects，支持 --global） |
| `openfeel knowledge` | 知识库管理（list / add / search / index / dedup） |
| `openfeel archive <stage>` | 阶段归档，汇总产出、生成摘要、提取知识（**阶段摘要归档**——与 `flow archive` 版本分片归档区分） |
| `openfeel flow archive` | flow.json 版本分片归档（`<version>` / `list` / `show`；与 `openfeel archive` 阶段摘要归档区分） |
| `openfeel req` | 需求流转（add / list / show / claim / release / set / link / advance / board / next） |
| `openfeel setup` | 纯全局部署（全局 AGENTS.md + agent + skill + 平台适配器配置），不建项目 `.openfeel/`；`--tools <list>` 显式启用 Claude Code 适配器 |
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
npm test           # 运行测试（1894 用例 / 74 个测试文件；Linux CI 跳过 1 个 Windows 专属用例）
```

## 致谢

本项目基于 [AI_Prompt](https://github.com/Liuary/AI_Prompt) 开发，参考了 [OpenSpec](https://github.com/Fission-AI/OpenSpec) 等工具的流程治理思路。

## 许可

[MIT](LICENSE)
