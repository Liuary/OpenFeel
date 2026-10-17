# OpenFeel — AI Agent 开发流程治理 CLI

[English](README.en.md) | [更新日志](CHANGELOG.md) | [npm](https://www.npmjs.com/package/openfeel) | [入门指南](docs/GETTING_STARTED.md)

> ⚡ **当前适配 harness**：**opencode（默认）** ｜ **Claude Code**（`--tools claude`，v1.1.6 起） ｜ **默认模型**：DeepSeek V4（主力推理）+ GLM-5.3-flash（交叉审查）+ DeepSeek-flash（多模态视觉）

> ⚠️ 下文示例命令 `openfeel <cmd>` 为**安装后的一般使用者用法**；若在**本仓库源码**中开发/执行，请改用 `node bin/openfeel.js <cmd>`（全局 `openfeel` 可能滞后于本仓——未随本仓库源码同步更新）。

OpenFeel 是一个 TypeScript CLI 工具，为 AI Agent 开发提供端到端的流程治理。核心理念：**「提示词瘦身，流程入工具」** —— Agent 不靠读长文本理解流程，而是通过 `flow.json` 获取当前状态和下一步指令。

> 📦 **最新版本 v1.2.4**（DSH ACTION-GUIDE A1~A5 收口 · 补丁） — `archive <stage>` 覆盖保护（`ARCHIVE_EXISTS` + `--force` + 零写盘）+ 7 个新增 `--json` 命令面（`plan stage list` / `model list|get` / `flow retry` / `lint i18n|kb` / `roadmap show`）+ `config get --all`。**40 个成功出口 / 41 个注册选项**；退出码 0/1/2/3 语义不变。

> 📌 本项目基于 [AI_Prompt](https://github.com/Liuary/AI_Prompt) 开发，参考了 [OpenSpec](https://github.com/Fission-AI/OpenSpec) 等工具的设计思路。

---

## 快速开始

```bash
npm install -g openfeel        # 安装（Node ≥ 20）
openfeel init ./my-project     # 初始化新项目
openfeel update                # 已有项目？一键部署平台适配器
openfeel migrate               # 存量旧布局项目？一键迁移（检测/备份/回滚）
openfeel flow status           # 查看流水线
openfeel flow phases           # 查看合法 phase 与转移表
openfeel setup --tools claude  # 显式启用 Claude Code 适配器（可选）

npm install -g openfeel@latest # 更新到最新版本
```

> 💡 `init` 用于新项目首次部署，`update` 为已有项目增量更新（适用于 `init` 之后再引入 OpenFeel 的项目）。存量旧布局项目（opencode 适配器：项目内 `.opencode/agents|skills|instructions`）用 `openfeel migrate` 迁移到全局部署。框架资产（agents/skills/AGENTS.md）经 `openfeel setup` 全局部署，项目内不再生成 `.opencode/agents|skills`。

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

## v1.2.4 新增能力（补丁）

> 对应阶段：**stage-100**。本版收口 `dsh/ACTION-GUIDE.md` A1~A5；JSON 契约口径升级为 **40 成功出口 / 41 注册选项**，退出码 0/1/2/3 语义不变。本仓收口基线：**75 文件 / 1941 用例 / 21 阶段**。

- **A1 归档覆盖保护（数据安全）**：`openfeel archive <stage>` 目标归档文件已存在时拒绝覆盖（`ARCHIVE_EXISTS` / `refusal` / exit 1，**零写盘**：归档内容哈希、`flow.json` revision、`log[]` 长度、KB 条目数均不变）；显式 `--force` 才覆盖。保护为**归档文件级**（短名/全名别名派生不同文件、互不触发）。
- **A2 `plan stage list --json`（#34）**：`{schemaVersion,stages,count}`；`stages[]` 七键 `id,phase,status,deps,workflowMode,opsTotal,opsDone`（flow.json 注册阶段调度视图；人类输出保持计划目录清单）。
- **A3 `model list|get --json`（#35/#36）**：list `{schemaVersion,scope,agents:[{agent,provider,model,source}]}`；get 六键；`provider`/`model` 按首个 `/` 切分，`source` 取生效层（default > project > global）。
- **A4 三命令面（#37~#40）**：`flow retry --op <id> --json`（六键）、`lint i18n|kb --json`（`{target,ok,issues:[{path,message}]}`，`ok:false` 仍为成功文档 + exit 1）、`roadmap show [version] --json`（`version` + 表头驱动的 `milestones[{title,theme,stage,deliverable}]`，兼容 3/4 列）。
- **A5 `config get --all --json`**：项目模式一次取全量 `{scope:"project",defaults:{execution_mode,auto_advance,merge_mode,workflow_mode}}`，不再报 `key-required`；与 `--global` 或位置 key 组合 → `INVALID_ARGUMENT`。
- **契约**：错误码表 **13 行**（新增 `ARCHIVE_EXISTS`）；既有 33 个成功出口字段零破坏、人类输出逐字不变；`dsh/` 零改动。

## v1.2.3 修复（补丁）

> 对应阶段：**stage-99**。本版为 v1.2.2 转出项收口，不新增功能；JSON 契约 33 成功出口 / 34 注册选项与退出码语义不变。本仓收口基线：**75 文件 / 1911 用例 / 21 阶段**。

- **并发 JSON 退出机制统一（REV-95-009）**：`handleConcurrentConflict` JSON 分支改为「输出 `FLOW_CONCURRENT_CONFLICT` envelope → 置 `process.exitCode=2` → return」（与 `failCli` 同机制，规避 Windows 管道 stdout 截断）；非 JSON 分支 `console.error + process.exit(2)` 逐字不变；10 个调用点无 fallthrough。
- **`--review-tier` help 文案订正（REV-98-003 第 6 项）**：`flow advance --help` 与 i18n zh/en 由「缺省=按模式派生」改为「缺省=full（零裁剪）」；按模式派生的是 `flow phases --json.reviewTier` 展示值；缺省推进行为不变。
- **`req` 过滤单点化（REV-97-006）**：`req show` / `req set --workflow-mode` 复用 `listLinkedStages`；`req split` 与 core 引擎层 done 判定原语保留；行为零变化。
- **锁等待超时 E2E 测试钩子（REV-98-006①，test-only）**：仅 `OPENFEEL_TEST_MODE=1` 生效的 env seam 使超时路径可稳定断言 `INTERNAL_ERROR/internal/3`；生产默认 5000/3000ms 不变。

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

- **三模式架构（`full` / `fast` / `general`）**：`workflow_mode` 值域由 2 值扩为 3 值（默认仍 `fast`）。`general`（无流水线）**仅需求级合法**——阶段级 / 部署级写入面拒绝（`plan stage add` / `stage set` / `config set` 命令层显式门 + wizard 不提供选项）；模式解析链增「需求级」一层（`status.md > 需求级 > config.yaml > builtin`）；**升级不降级**（可 `general` → `fast` / `full`，反向无隐式动作）。
- **需求接取与拆分（`openfeel req split`）**：**拆分即发布**——子需求一次入 `scheduled`；`parent_id` 仅溯源（**不入聚合 / 不入 done 门 / 不参与 `PATCH_WHITELIST`**）；并行接取（`claim` 互不阻塞）；**需求与版本解绑**（`target_version` 为纯展示 / 过滤 / 排序维度，非门）。`req` 命令组 **10 → 11 子命令**（`split` = 首个 repeatable option、首个带 `--json` 的写命令）；`req advance --to done` 语义见下「缺陷修复」。
- **通用工作者直接调度（双口径）**：opencode 侧 = 嵌套 `task` 工具；Claude Code 侧 = Handoff 直发。通用模式下可承接任意 Agent **直接调度**的执行任务（不限于流水线 op）。
- **新 agent `openfeel-explorer`（只读）**：专职「调研 / 探索」路由——只读 4 工具（Read / Glob / Grep / Bash），不产出源码变更；agent 数 **9 → 10**。
- **可观测性**：`metrics.json` 经 `recordRun` 接线；CLI 日志含 `duration_ms` / `project` / `session_id` 三字段；op 级时间戳；跨会话恢复标注（`resumed`）。
- **审查档位（`--review-tier <full|lean|skip>`）**：与工作流模式**分属两轴**——模式定基表，档位裁审查关（`full` = 零裁剪 / `lean` 裁 `scheme_review` / `skip` 裁 `plan_review + scheme_review`；恒保留代码审查关 / 测试关 / 归档关）。缺省按模式派生（`full`→`full` / `fast`→`lean` / `general`→`full`）；显式 `lean` / `skip` 打印一行非阻断警告。`flow phases --json` 末位追加 `reviewTier`（既有 6 键逐字保留，**共 7 键**）。
- **并行编排契约 + 归档轻量化**：阶段并行互不阻塞；归档段与轻量化步骤分离。
- **模型默认值统一 + 部署非破坏性（用户主权键 `model`）**：opencode 侧显式默认收敛为 `deepseek/deepseek-flash`；部署（`setup` / `update`）对用户既有 `model` 键**无则创建、有则不覆盖**——不与用户既有值双写漂移。

### 缺陷修复（v1.2.1）

- **`req/BUG-002`**：`general` 需求**完成路径**——`general` 恒零关联阶段（载体制双向门）而 done 门要求全部关联阶段 done，两者交叉曾致 `general` 需求**永远无法 `done`**（死锁）。现开辟**载体制对偶完成路径**（判据 = 需求自身 `workflow_mode` 字段直判，与载体制门同源），`openfeel req advance --to done` / `req set --status done` 对零关联 `general` 需求**放行**；非 `general` 需求判定单源不变；done 门拒绝改用专用文案。
- **`cli/BUG-011`**：审查档位裁剪致**当前相位无跳转目标**——阶段恰停于被裁剪相位时该档位无可达目标。现**裁剪只作用于入边 / 目标侧**，被裁剪相位保留出边（可正常向该档位下游推进）；「进入被裁剪关」仍不可达。
- **`templates/BUG-007`**：en 归档官指针悬空（`§Archive Mechanical Checklist` → 目标节仅中文）→ 改中文节名，并补「具名 § 指针字面命中」断言防再犯。

## v1.2.0 新增能力

- **flow.json 版本分片归档（`flow archive`）**：三个入口——`openfeel flow archive <version>`（执行归档；判据门 = 该版本全部阶段 done 且无 blocking open REV，**不设 `--force`**）、`openfeel flow archive list`、`openfeel flow archive show <version> [--json]`；归档落点 `.openfeel/flow-archive/{version}.json`。**与顶层 `openfeel archive <stage>`（阶段摘要归档）区分**；常规命令不读归档。
- **需求流转（`openfeel req`）**：10 子命令（v1.2.1 起 11，+`split`）（`add` / `list` / `show` / `claim` / `release` / `set` / `link` / `advance` / `board` / `next`）+ 7 状态（`draft` / `scheduled` / `in_progress` / `done` / `blocked` / `cancelled` / `rejected`）；需求进度由关联阶段 phase 聚合（**全部关联阶段 done 时自动收口**）；认领协议 = `owner` + `claimed_at`（无 TTL）。用法权威源见 `openfeel-req` skill。
- **兼容**：旧 flow.json（无 `requirements` / `archived_versions`）零报错，升级**无需迁移**。

完整中文文档：[README.zh-CN.md](README.zh-CN.md)（详见其中的「Claude Code 适配器」小节）
