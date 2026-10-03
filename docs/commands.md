# OpenFeel CLI 命令参考

> 生成时间：2026-06-26（持续更新）| 适用版本：**v1.1.3 快照** | 更新日期：2026-10-02
>
> 📌 本文件为**版本快照**，命令与参数细节**以 `openfeel <cmd> --help` 实时输出为准**（防文档-实现发散；与 `openfeel-cli-usage` skill 同口径）。
>
> ⚠️ 本文示例命令 `openfeel <cmd>` 为**安装后的一般使用者用法**；若在**本仓库源码**中开发/执行，请改用 `node bin/openfeel.js <cmd>`（全局 `openfeel` 可能滞后于本仓——未随本仓库源码同步更新）。

## 全局选项

| 选项 | 说明 |
|------|------|
| `-v, --version` | 输出版本号 |
| `-h, --help` | 显示命令帮助信息 |
| `--no-color` | 禁用彩色输出（亦可通过 `NO_COLOR=1`；与编码解耦） |
| `--encoding <encoding>` | 输出编码（`utf8\|gbk\|auto`，默认 `auto`） |
| `--log-file <path>` | 运行日志文件路径（默认 `~/.openfeel/cli/logs/openfeel-YYYY-MM-DD.log`） |
| `--no-log` | 关闭运行日志（亦可通过 `OPENFEEL_LOG=0` / `OPENFEEL_NO_LOG=1`） |
| `--debug` | 记录 debug 级运行日志（默认仅 info/warn/error） |

**输出编码自适应（v1.1.3-stage-61）**：`auto` 在 Windows 非 TTY（管道/重定向）下**直通 UTF-8**（对齐 Node 默认与管道/CI 消费者）；TTY / POSIX 直通 UTF-8；**GBK 需显式** `--encoding gbk` / `OPENFEEL_ENCODING=gbk`；`--json` **恒 UTF-8**（覆盖显式 `--encoding` / `OPENFEEL_ENCODING` / auto）；不可编码字符降 `?` 且**不告警**；**仅支持 UTF-8 字符串语义**（非默认 encoding 的直接 write 不受支持）。

**运行日志（v1.1.2-stage-58）**：默认**开启**、恒 UTF-8、按日一文件（不自动清理）；`info`/`warn`/`error` 默认记录、`debug` 默认关；best-effort（写失败不阻塞 CLI）；与 `.openfeel/log/**`（工作区审计）、`flow.json.log[]`（状态审计）、`update_infos.md`（部署记录）四类日志**语义分离**；`error` 仅记「命令处理中抛出的异常」，commander 解析期错误（未知命令/选项/缺参）经 `program.error()` 直接退出、**不入日志**。

---

## init — 初始化项目工作区

初始化 OpenFeel 项目工作区，创建 `.openfeel/` 目录结构、配置文件和流水线状态文件。

### 用法

```bash
openfeel init [path]
```

| 参数 | 说明 |
|------|------|
| `path` | 目标项目路径，默认为当前目录 |

### 示例

```bash
# 在当前目录初始化
openfeel init

# 在指定目录初始化
openfeel init ./my-agent-project
```

### 创建的目录和文件

```
.openfeel/
├── config.yaml          # 项目配置
├── flow.json            # 流水线状态核心
├── .info.json           # 用户身份信息
├── roadmap/             # 分期大纲目录
├── plan/                # 计划目录（plan/{series}/stage-{NN}/ 多级结构）
├── kb/                  # 知识库目录
├── dev/                 # 开发记录目录
├── log/                 # 日志目录
├── code_review/         # 代码审查目录
├── bugs/                # Bug 追踪目录
└── tmp/                 # 临时文件目录
```

---

## flow — 流水线状态管理

流水线状态是 OpenFeel 的核心，所有 Agent 通过 `flow.json` 协调工作。

### flow status

显示流水线状态摘要。

```bash
openfeel flow status
```

### flow current

显示当前阶段和操作（phase + op + retry）。

```bash
openfeel flow current
```

### flow phases

自描述全部合法 phase 与**运行时生效的**流转映射（数据源为 `.openfeel/pipeline.yaml`，缺省回退内置默认表）。

```bash
openfeel flow phases [--json]
```

| 选项 | 说明 |
|------|------|
| `--json` | 以 JSON 输出 `{ schemaVersion, phases, transitions, advanceAccepted, transitionsDiff }`，供自动化解析（`phases` = 运行时**存在视图**；`advanceAccepted` = `flow advance` 的**推进白名单**，内置 15；`transitionsDiff` = 运行时转移表与内置默认转移表的**差异报告**，`missing` 列出内置默认有而运行时缺失的 source，使 `pipeline.yaml` 漂移**可见而非静默**） |

示例：

```bash
openfeel flow phases
openfeel flow phases --json
```

### flow advance

推进流水线阶段。

```bash
openfeel flow advance --stage <stage-id> --to <phase> [--op <op-id>] [--dry-run] [--force]
```

| 选项 | 说明 |
|------|------|
| `--stage <stage-id>` | 阶段 ID（**必填**，可用短名或完整名） |
| `--to <phase>` | 目标阶段（必填）。合法 phase 与转移表见 `openfeel flow phases` |
| `--op <op-id>` | 操作 ID（**可选**，仅用于日志/展示） |
| `--dry-run` | 仅验证不修改（预览输出）；**字节级不写盘**（`revision`/phase 不变） |
| `--force` | 跳过非法 phase 与阶段跳跃检查（仍受 REV 闭环守卫约束，不可绕过） |

支持的阶段（phase）：`plan_pending`、`plan_review`、`plan_passed`、`scheme_pending`、`scheme_review`、`scheme_passed`、`exec_running`、`review_pending`、`review_failed`、`review_passed`、`test_pending`、`test_failed`、`test_passed`、`archiving`、`done`（以运行时 `pipeline.yaml` 为准，用 `openfeel flow phases` 查看）

### flow stage add

新增流水线阶段（**注册层**：仅注册 `flow.json`，不创建 `plan/` 目录；通常应使用 `openfeel plan stage add`）。

```bash
openfeel flow stage add <stageId>
```

### flow stage remove

移除流水线阶段（安全校验；默认仅注销 `flow.json` 注册，不删除 `plan/{series}/{stageDir}/` 目录）。

```bash
openfeel flow stage remove <stageId> [--force] [--dry-run] [--purge]
```

| 选项 | 说明 |
|------|------|
| `--force` | 越过安全校验（`ops` 非空 / 当前活跃阶段 / 被其它阶段 `deps` 引用） |
| `--dry-run` | 仅预览（复用安全校验，呈现引用者），不写盘 |
| `--purge` | 同时删除 `plan/{series}/{stageDir}/` 目录；TTY 下二次确认，非 TTY 须配 `--force` |

默认拒绝条件：阶段仍有未归档 `op`、为当前活跃阶段、被其它阶段 `deps` 引用。移除当前阶段后 `pipeline.current.stage` 自动回退首个非 `done` 阶段（无则清空），并写入 `remove_stage` 审计日志。

> 建议先 `--dry-run` 预览；`--force` 移除被依赖阶段**不会**清理引用方 `deps` 中的悬空项（保留 + 日志 `referencing`/`snapshot` 使失真可审计）。

### flow attempt

记录执行结果。

```bash
openfeel flow attempt --op <op-id> --result <pass|fail>
```

| 选项 | 说明 |
|------|------|
| `--op <op-id>` | 操作 ID（必填） |
| `--result <pass\|fail>` | 执行结果（pass 通过 / fail 失败） |

### flow review

审查条目管理。

```bash
# 添加审查条目
openfeel flow review add --op <op-id> --title <title> [--auto-fix] [--blocking <bool>]

# 解决审查条目
openfeel flow review resolve <rev-id>
```

| 选项 | 说明 |
|------|------|
| `--op <op-id>` | 操作 ID（必填，如 `stage-01.op-001`） |
| `--title <title>` | 审查标题（必填） |
| `--auto-fix` | 标记为可自动修复 |
| `--blocking <bool>` | 是否为阻塞项（**默认 `true`**，REV 阻塞闭环核心语义） |

### flow log

查看操作日志。

```bash
openfeel flow log [--last <n>]
```

| 选项 | 说明 |
|------|------|
| `--last <n>` | 显示最近 n 条日志（默认 20） |

### flow health

流水线健康检查（`flow.json` / 跨文件一致性 / 僵尸状态 / `config.yaml` 等）。

```bash
openfeel flow health [--quick] [--json] [--fix] [--dry-run]
```

| 选项 | 说明 |
|------|------|
| `--quick` | 仅检查关键项（phase/current 合法性），跳过其余检查 |
| `--json` | JSON 单文档输出（`schemaVersion:1`；`--fix` 时追加 `reconciled`） |
| `--fix` | 状态对账：以 phase 投影为权威，仅回写 `status.md` 的「状态」字段 |
| `--dry-run` | 与 `--fix` 组合，仅预览不写盘 |

**`--fix` 权威口径（v1.1.4-stage-62）**：权威值 = `mapPhaseToStageStatus(phase)`（`phase` 为单一事实源，`status` 是其**粗粒度投影**）；**仅回写 `status.md` 的「状态」行**（执行模式/自动推进/当前任务/状态记录等独立字段绝不触碰），**批量遍历全部阶段**；`--fix --dry-run` 零写盘；幂等（已一致不写）。`flow advance` **不回写** `status.md`，故 `--fix` 为**唯一批量对账/回写入口**（D3）。

---

## roadmap — 分期大纲管理

### roadmap create

创建分期大纲（版本号如 1.0、2.0）。

```bash
openfeel roadmap create <version>
```

### roadmap show

显示分期大纲内容。

```bash
openfeel roadmap show [version]
```

不传版本号时列出所有分期大纲。

### 示例

```bash
openfeel roadmap create v1.0
openfeel roadmap show v1.0
```

---

## plan — 工作阶段与操作方案管理

Plan 命令管理三层计划体系中的工作阶段（Stage）和操作方案（Op/Scheme）。

### plan stage add

添加工作阶段（**完整入口（推荐）**：创建目录 + `overview.md`/`status.md` + 注册 `flow.json`；仅需注册请用 `openfeel flow stage add`）。

```bash
openfeel plan stage add <name> [--deps <ids...>] [--tasks <items...>] [--exec-mode <manual|auto>] [--auto-advance <enabled|disabled>]
```

| 参数/选项 | 说明 |
|------|------|
| `name` | 阶段 ID（如 `stage-01`、`v1.1.2-stage-41`） |
| `--deps <ids...>` | 依赖阶段 ID 列表（空格或逗号分隔，如 `--deps a b` 或 `--deps a,b`） |
| `--tasks <items...>` | 初始任务列表（生成到 `status.md`；不传保持 `> 待补充`） |
| `--exec-mode <manual\|auto>` | 执行模式，**显式覆盖 config 默认**（值域非法 → exit 1 且不建阶段） |
| `--auto-advance <enabled\|disabled>` | 自动推进，**显式覆盖 config 默认**（值域非法 → exit 1 且不建阶段） |

示例：

```bash
openfeel plan stage add stage-01
openfeel plan stage add v1.1.2-stage-41 --deps v1.1.2-stage-40
openfeel plan stage add v1.1.4-stage-63 --exec-mode auto --auto-advance enabled
```

创建 `plan/{series}/{stage-NN}/` 目录，包含 `overview.md`（含「## 依赖」）和 `status.md`，并写入 `flow.json.stages[fullStageId].deps`。非法 stageId 会报错并给出建议名。**阶段初值继承**：未显式传 `--exec-mode`/`--auto-advance` 时，新 `status.md` 的 `执行模式`/`自动推进` 取 `.openfeel/config.yaml` 的 `defaults`（缺失/非法逐键回退内置默认）；显式选项优先于 config 默认（v1.1.4-stage-63）。

### 阶段创建入口关系

| 入口 | 层级 | 行为 | 定位 |
|------|------|------|------|
| `openfeel plan stage add <name>` | **完整层（推荐）** | 建目录（`overview.md` + `status.md`）+ 注册 `flow.json` | 唯一建目录入口 |
| `openfeel flow stage add <stageId>` | **注册层** | 仅注册 `flow.json`，不建目录 | 轻量注册 / 特殊场景 |
| `openfeel stage create <stageId>` | **注册层（已弃用）** | 与 `flow stage add` 等价（均走 `FlowManager.addStage`） | 兼容保留，建议迁移 |

- 三个入口均对非法 stageId 报错并给出建议名（`stage-NN` 或 `vX.Y.Z-stage-NN`）。
- `stage create` 已弃用：功能保留，TTY 下输出 `[deprecated]` 提示（非 TTY 静默），正式移除不早于 v1.2。

### plan stage list

列出所有工作阶段。

```bash
openfeel plan stage list
```

输出示例：

```
- stage-01  .openfeel/plan/v1/stage-01/
- stage-02  .openfeel/plan/v1/stage-02/
```

### plan scheme create

创建操作方案。

```bash
openfeel plan scheme create <stage> <title>
```

| 参数 | 说明 |
|------|------|
| `stage` | 阶段名（如 stage-01） |
| `title` | 方案标题 |

示例：

```bash
openfeel plan scheme create stage-01 "实现核心功能"
```

在 `plan/v1/stage-01/ops/` 下创建 `op-001_实现核心功能.md`，按固定模板生成内容（目标、实施步骤、产出文件、自测清单、修正记录），并同步到 `flow.json`。

### plan scheme list

列出操作方案。

```bash
openfeel plan scheme list [stage]
```

| 参数 | 说明 |
|------|------|
| `stage` | 阶段名（可选，不传则列出所有） |

---

## instructions — 生成结构化指令

为指定 artifact 生成结构化 XML/JSON 指令。

```bash
openfeel instructions <artifactId> --change <name> [--json] [--schema <name>]
```

| 参数/选项 | 说明 |
|-----------|------|
| `artifactId` | 目标 artifact ID（如 proposal、implementation） |
| `--change <name>` | 变更名称（必填，如 feat-login） |
| `--json` | 输出 JSON 格式（默认 XML） |
| `--schema <name>` | Schema 名称（默认 spec-driven） |

示例：

```bash
# 生成 XML 指令
openfeel instructions proposal --change feat-auth

# 生成 JSON 指令
openfeel instructions implementation --change feat-auth --json
```

---

## view — 审查条目管理

Reviewer Agent 使用此命令管理审查条目。

### view list

列出审查条目。

```bash
openfeel view list [--op <id>]
```

| 选项 | 说明 |
|------|------|
| `--op <id>` | 按操作 ID 过滤 |

### view accept

验收审查条目。

```bash
openfeel view accept <rev-id>
```

| 参数 | 说明 |
|------|------|
| `rev-id` | 审查条目 ID（如 REV-001） |

---

## archive — 阶段归档

Archiver Agent 使用此命令归档已完成阶段。

```bash
openfeel archive <stage>
```

| 参数 | 说明 |
|------|------|
| `stage` | 阶段名称（如 stage-01） |

归档操作会汇总阶段产出、生成摘要、提取知识条目。

---

## config — 配置管理

项目/全局配置读写与有效值查询。

### config effective

输出受管配置键的**有效值 + 生效来源**。

```bash
openfeel config effective [key]
```

| 参数 | 说明 |
|------|------|
| `key`（可选） | 单个受管键；省略时输出三键（`execution_mode` / `auto_advance` / `merge_mode`） |

**来源优先级**：`status.md` > `config.yaml` > `profile.yaml` > `builtin`；未知 key → stderr + exit 1。

### config get / set

读取/写入项目 `config.yaml`（`--global` 时操作全局 `profile.yaml`）。

```bash
openfeel config get [key] [--global]
openfeel config set <key> <value> [--global] [--sync-stages]
```

- **支持全量 `defaults.*` 键**（schema 驱动）：`execution_mode` / `auto_advance` / `merge_mode` 等受管配置键均可通过 `config set`/`get` 读写（与 `config effective` 覆盖范围一致）。**注意**：原布尔测试门禁键已于 v1.1.4-stage-62 移除，`config set` 该键将被判定为**无效键**（报错、不写盘）。
- **`defaults.X ≡ X`（v1.1.4-stage-63）**：项目模式下 `defaults.` 前缀与 bare key 等价（键归一，单一来源）；`--global` 的 profile 键域不同，不受影响。
- **`--sync-stages`（v1.1.4-stage-63）**：仅项目模式（与 `--global` 组合 → exit 1）；将值批量写入**所有已注册阶段** `status.md` 对应字段（适用键 `auto_advance` → `自动推进`、`execution_mode` → `执行模式`）；**同值 no-op**；其它键（无阶段字段）跳过并报告。
- **值类型归一**：写入前按字段 Schema 归一值类型（枚举键按枚举校验；Schema 中若存在布尔键则 `true`/`false` 归一为布尔值），避免以字符串落盘破坏配置校验。当前受管三键均为枚举型。
- **枚举校验 + 不写盘**：非法取值（如 `execution_mode bogus`）以非 0 退出并报错，**不修改目标文件**（文件 hash 与 mtime 不变）。

### config get-lang / set-lang

读取/修改全局默认语言。

```bash
openfeel config get-lang
openfeel config set-lang <zh-CN|en>
```

### config list-projects

列出所有已记录的项目路径→语言映射。

```bash
openfeel config list-projects
```

---

## knowledge — 知识库管理

### knowledge list

列出知识条目。

```bash
openfeel knowledge list [--type <category>]
```

| 选项 | 说明 |
|------|------|
| `--type <category>` | 按分类过滤（architecture/patterns/troubleshooting/setup） |

### knowledge add

添加知识条目。

```bash
openfeel knowledge add <category> <title> [--content <text>]
```

| 参数/选项 | 说明 |
|-----------|------|
| `category` | 分类（architecture/patterns/troubleshooting/setup） |
| `title` | 条目标题 |
| `--content <text>` | 条目内容（也可通过管道 stdin 传入） |

### knowledge search

搜索知识库。

```bash
openfeel knowledge search <query>
```

### knowledge index

显示知识库索引概览。

```bash
openfeel knowledge index
```

---

## lint — 质量门禁检查

```bash
openfeel lint i18n [--fix]   # i18n 键对称性校验（zh/en 三向比对 + 空值检测）
openfeel lint kb [--fix]     # kb 过期引用检测（扫描 kb 文件中的路径引用是否存在）
```

**退出码（门禁语义，v1.1.2）**：发现问题时**非 0 退出**（对齐 `flow health`），使 CI/脚本可直接以其作为门禁；无问题 `exit 0`。**未提供** `--warn-only`/`--no-fail` 逃生阀——若需忽略结果，请由调用方显式表达（如 `openfeel lint kb || true`）。

## stage — 阶段状态

```bash
openfeel stage status <id>              # 查看阶段状态
openfeel stage set <id> --status <v>    # 更新阶段状态（写入 status.md 字段）
openfeel stage create <stageId>         # 已弃用（注册层，与 `flow stage add` 等价；建议用 `plan stage add`）
```

**`stage set --status` 值域（v1.1.4-stage-62）**：仅接受**粗粒度状态枚举** `planned` / `review_failed` / `review_passed` / `testing` / `archiving` / `done`（单一来源 `STAGE_STATUS_VALUES`，与 `status = phase` 投影的取值域一致）；传入**相位值**（如 `review_pending`）或**任意值** → **exit 1 且不写盘**（不生成 `.bak`）。

## model — 模型配置

三层级 agent 模型读写（`default` / `global` / `project`），非 TTY 下 `--scope default` 须 `--force`/`--build` 双重确认。

```bash
openfeel model set <agent> <model> [--scope default|global|project] [--build] [--force]
openfeel model get <agent> [--scope ...]
openfeel model list
```

## setup — 全局部署

纯全局部署（全局 `AGENTS.md` + agent + skill + 全局平台适配器配置），不建立项目 `.openfeel/`，幂等。

```bash
openfeel setup [--lang <zh-CN|en>]
```

## migrate — 存量迁移

存量旧布局项目迁移（检测 / 备份 / 迁移 / 回滚）；`--dry-run` 预览不写盘。

```bash
openfeel migrate [path] [--dry-run] [--remap-assignee] [--clean-global-core-md]
openfeel migrate rollback [--dry-run]     # 回滚最近一次迁移（读 manifest.json）
```

## project — 项目管理

```bash
openfeel project overview                   # 实时扫描项目结构，输出结构化概览
```

> 注：`project` 组当前仅 `overview` 一个子命令（`list` / `info` 已不存在，v1.1.2-stage-56 由 `cli/BUG-007` 更正）。

> 说明：以上为 v1.1.2 快照的命令面概览；完整子命令 / 选项以 `openfeel <cmd> --help` 为准。

## update — 更新适配文件

更新平台适配文件（当前：OpenCode 适配器）——Agent 定义、Skill 文件、`AGENTS.md`，以及**全局 `opencode.jsonc` 的深度合并**（`instructions` 拼接去重 / `agent` 补缺 / 其他对象递归 / 标量覆盖；用户未知字段 passthrough）。部署覆盖既有框架资产前自动备份（`~/.openfeel/backup/{ts}/`）。

```bash
openfeel update [path]
```

| 参数 | 说明 |
|------|------|
| `path` | 目标项目路径，默认为当前目录 |
