# OpenFeel CLI 命令参考

> 生成时间：2026-06-26（持续更新）| 适用版本：**v1.5.6 快照** | 更新日期：2026-10-31
>
> 📌 本文件为**版本快照**，命令与参数细节**以 `openfeel <cmd> --help` 实时输出为准**（防文档-实现发散；与 `openfeel-cli-usage` skill 同口径）。
>
> ⚠️ 本文示例命令 `openfeel <cmd>` 为**安装后的一般使用者用法**；若在**本仓库源码**中开发/执行，请改用 `node bin/openfeel.js <cmd>`（全局 `openfeel` 可能滞后于本仓——未随本仓库源码同步更新）。

## 全局选项

| 选项 | 说明 |
|------|------|
| `-v, --version` | 输出版本号；`--version --json` / `-v --json` 输出 `{schemaVersion:1,version,node}`（三键，v1.2.2 起；纯文本逐字不变） |
| `-h, --help` | 显示命令帮助信息 |
| `--project <path>` | **v1.2.2 起**：以指定目录为项目上下文（语义等效 cwd；支持 `--project <path>` / `--project=<path>` 前置或后置；不传回退 `process.cwd()`） |
| `--no-color` | 禁用彩色输出（亦可通过 `NO_COLOR=1`；与编码解耦） |
| `--encoding <encoding>` | 输出编码（`utf8\|gbk\|auto`，默认 `auto`） |
| `--log-file <path>` | 运行日志文件路径（默认 `~/.openfeel/cli/logs/openfeel-YYYY-MM-DD.log`） |
| `--no-log` | 关闭运行日志（亦可通过 `OPENFEEL_LOG=0` / `OPENFEEL_NO_LOG=1`） |
| `--debug` | 记录 debug 级运行日志（默认仅 info/warn/error） |

**输出编码自适应（v1.1.3-stage-61）**：`auto` 在 Windows 非 TTY（管道/重定向）下**直通 UTF-8**（对齐 Node 默认与管道/CI 消费者）；TTY / POSIX 直通 UTF-8；**GBK 需显式** `--encoding gbk` / `OPENFEEL_ENCODING=gbk`；`--json` **恒 UTF-8**（覆盖显式 `--encoding` / `OPENFEEL_ENCODING` / auto）；不可编码字符降 `?` 且**不告警**；**仅支持 UTF-8 字符串语义**（非默认 encoding 的直接 write 不受支持）。

**运行日志（v1.1.2-stage-58）**：默认**开启**、恒 UTF-8、按日一文件（不自动清理）；`info`/`warn`/`error` 默认记录、`debug` 默认关；best-effort（写失败不阻塞 CLI）；与 `.openfeel/log/**`（工作区审计）、`flow.json.log[]`（状态审计）、`update_infos.md`（部署记录）四类日志**语义分离**；`error` 仅记「命令处理中抛出的异常」，commander 解析期错误（未知命令/选项/缺参）经 `program.error()` 直接退出、**不入日志**。

**全局 `--project` 边界（v1.2.2）**：`runCli` argv 预扫描后 `process.chdir` 单点注入；多值且不一致 → `INVALID_ARGUMENT`（exit 1），路径不存在或非目录 → `PROJECT_NOT_FOUND`（exit 1）；命令输出语言按**目标项目**解析，而 `--help` 语言按原始 cwd（`applyHelpI18n` 于 chdir 前执行）；`--log-file` 相对路径按**原始 cwd**；`knowledge dedup` 保留其本地 `--project <path>` 声明（语法零变化，经 `optsWithGlobals()` + 单点解析读取）；CLI 为单进程单命令，`chdir` 每进程至多一次。

**`--version --json`（v1.2.2）**：`--version --json` / `-v --json` 输出 `{schemaVersion:1,version,node}`（三键，exit 0）；纯文本 `--version` 逐字不变。该形态为顶层成功 JSON 形态，**单列，不计入 41 个成功出口、也不计入 42 个注册选项**。

## 错误封装（v1.2.2）

> 权威口径见 [json-contract.md](json-contract.md) §2~§4；源码单一来源 `src/core/errors.ts`。

### 新 envelope

```json
{
  "schemaVersion": 1,
  "error": {
    "code": "INVALID_ARGUMENT",
    "kind": "refusal",
    "message": "……",
    "detail": null
  }
}
```

- `code` 为语言无关常量（zh/en 一致），`message` 可本地化；`detail` 无值时恒 `null`（键恒在）。
- 适用：文本型失败路径迁移后的 JSON 模式输出。

### legacy 形态（零破坏保留）

```json
{
  "schemaVersion": 1,
  "error": "gate-rejected",
  "notDone": ["..."],
  "blockingOpen": ["..."],
  "errorKind": "refusal"
}
```

- `error` **恒为 `string`**，既有键序不变；仅允许在末尾追加顶层 `errorKind`（`refusal | internal`）。
- **判别唯一规则**：`typeof doc.error === 'string'` → legacy；否则（object）→ envelope。禁止以退出码 / 命令名 / 字段存在性做第二套判别。

### 并发退出机制（v1.2.3 起统一）

- JSON 模式：并发冲突输出单个 `FLOW_CONCURRENT_CONFLICT`（`kind=refusal`）envelope → 置 `process.exitCode = 2` → 返回（与 `failCli` 同机制，规避 Windows 管道 stdout 截断）；10 个调用点均在 handler 后显式 `return`，无通用错误分支二次输出。
- 非 JSON 模式：`console.error` 单行并发文案 + `process.exit(2)` 逐字不变。
- 退出码 0/1/2/3 语义与 envelope 形态零改动；`handleAddStageError` 的并发分流同样置码返回。

### 退出码

| 退出码 | 语义 | kind | 说明 |
|:--:|------|:--:|------|
| `0` | 成功 | — | 命令完成（含 `ok:false` 等成功文档 + 非 0 情形见契约 §5） |
| `1` | 预期拒绝 | `refusal` | 门禁拒绝、相位非法、非法参数 / 用法错误 |
| `2` | 并发写冲突 | `refusal` | 保留 `EXIT_CONCURRENT`；可重试 |
| `3` | 内部错误 | `internal` | **v1.2.2 新增**；既有 0/1/2 语义零改动 |

### `code → kind → exitCode`（13 行，与契约 §3 同源）

| code | kind | exitCode |
|------|------|:--:|
| `NO_INIT` | refusal | 1 |
| `INVALID_ARGUMENT` | refusal | 1 |
| `STAGE_NOT_FOUND` | refusal | 1 |
| `PHASE_TRANSITION_ILLEGAL` | refusal | 1 |
| `PHASE_PATH_NOT_FOUND` | refusal | 1 |
| `BLOCKING_REVIEWS` | refusal | 1 |
| `ARCHIVE_GATE_REJECTED` | refusal | 1 |
| `ARCHIVE_WRITE_FAILED` | internal | 3 |
| `PROJECT_NOT_FOUND` | refusal | 1 |
| `FLOW_CONCURRENT_CONFLICT` | refusal | 2 |
| `INTERNAL_ERROR` | internal | 3 |
| `ARCHIVE_FAILED` | refusal | 1 |
| `ARCHIVE_EXISTS` | refusal | 1（v1.2.4 A1：已有归档且未 `--force`；零写盘） |

### 迁移边界

`init` / `migrate` / `update` / `model` / `flow review` / `flow stage add` 等人类专用失败路径**不迁移**（保持人类文本与既有退出码）；`flow advance` 成功输出不 JSON 化，仅失败在 JSON 模式下输出 envelope；未注册 `--json` 的命令不接受该选项（Commander 报 unknown option）。

---

## preflight 写命令闸（v1.5.6）

> 源码单一来源：`src/commands/shared/preflight-gate.ts`（命令层薄封装）→ `src/core/preflight.ts`（判定）。**`src/core/preflight.ts` 本版零改动**；本版**零新增错误码、零 JSON 契约变更**。

**语义**：写状态前必须先读状态。`flow next` / `flow status` 把读取事实写入 `.openfeel/dev/.preflight.json`；写命令据此判定。

| 模式（`OPENFEEL_PREFLIGHT`） | 行为 |
|---|---|
| `off` | 永不拒绝、永不输出（**仍会读一次账本**再判模式，不是「不读盘」） |
| `warn`（默认） | 仅当 `stderr.isTTY` 时提示一行后放行；非 TTY（CI / 管道 / 测试）零输出 |
| `strict` | 账本缺失 / 过期（> 10 分钟）/ 非法 → 拒绝（退出码 1） |

**拒绝形态（统一出口，调用方置码后 `return`）**

- **JSON envelope**（`flow advance` / `flow health --fix` 注册了 `--json`）：`INVALID_ARGUMENT` + `detail: { reason: 'preflight-required', hint: 'openfeel flow next --json' }`；退出码 1。
- **人类**：单行 stderr（`flow.preflightRequiredTmpl`）+ `process.exitCode = 1`；**不调用 `process.exit`**，由调用方 `return`（保持其后 catch / 回滚路径可收敛）。
- **legacy 三键**（`flow archive`、`req split`）：顶层键集恒 `['schemaVersion','error','errorKind']`，`error = 'preflight-required'`，**不带 `hint`**；提示只走人类 stderr。
- **`--json` 注册面**：36 个门位中 **4 个**所属命令注册了 `--json` —— `flow advance`（envelope）/ `flow archive`（legacy 三键）/ `req split`（legacy 三键）/ `flow health --fix`（envelope；`--json` 是既有只读视图选项，`--fix --json` 在 strict 下同样输出 envelope）。其余 **32 个门位**对外形态是「人类 stderr + exit 1」；向它们传 `--json` 仍被 Commander 判 unknown option（exit 1），**不产生** envelope。

**接入面：34 个命令 / 36 个门位**（`stage task` 与 `plan scheme create` 各 2 个门位）

| 文件 | 命令（门位数） |
|---|---|
| `flow` | `stage add` · `stage remove` · `stage set` · `stage reset` · `advance` · `attempt` · `review add` · `review resolve` · `review update` · `review remove` · `archive` · `repair` · `checkpoint restore` · `migrate` · `health --fix` · `wizard`（16） |
| `stage` | `set` · `task`（`--add` 分支 + 主路径 = 2）· `create`（4） |
| `plan` | `stage add` · `scheme create`（常规 + `--from-tasks` = 2）· `scheme publish` · `scheme rename` · `scheme remove` · `scheme register`（7） |
| `req` | `add` · `claim` · `release` · `set` · `link` · `advance` · `split`（7） |
| `config` | `set --sync-stages`（仅同步分支）（1） |
| `view` | `accept`（1） |

**不在接入面（「全部状态写命令」的排除清单，与上表合计即全覆盖）**

| 排除项 | 理由 |
|---|---|
| `chore` | 写工作日志 / `chore.json`，不改 `flow.json.stages` 与阶段状态 |
| `dev sync` | 写 `dev_last*` / `.sync.json`（开发状态记录），不改阶段状态 |
| `config set` 的**非 `--sync-stages` 分支** | 只改 `config.yaml` 项目默认值，不写阶段状态 |
| `config set-lang` | 写全局语言配置（非项目状态） |
| 顶层 `archive <stage>` | 阶段摘要归档域（`core/archive/merge.ts` 写 flow.json），REQ-015 未列；与版本归档 `flow archive` 职责分离 |
| 顶层 `migrate` / `migrate rollback` | legacy 布局迁移逃生通道（另一域），`--dry-run` 已覆盖预览需求 |
| `init` / `update` / `setup` / `project` / `roadmap` / `knowledge` / `model` | 一次性引导 / 文档 / 全局部署类写面 |

**顺序约定**：`参数形状校验` → `NO_INIT / 存在性 / 值域` → **preflight 门** → `首个写盘`。即**非法参数先报错，preflight 后报**（如 `req claim REQ-XXX`、`stage set no-such-stage`、`flow review remove REV-999`、`flow archive bogus`、`plan scheme publish <stage> op-999`、`view accept REV-999`）。为消除遮蔽，`flow review update` / `view accept` / `plan scheme publish|rename|remove|register` 增加**门前只读预检**，且**真值源与判定序都与写函数逐条一致**：

| 命令 | 预检判定序（与写函数同源） |
|---|---|
| `flow review update` | `getReviewItems().some(id)` |
| `view accept` | `listReviews().some(id)` |
| `plan scheme publish` | ① 未注册 → not-found ② `state !== 'draft'` → not-draft ③ 模板不可读（`readOpTemplate`）→ not-found |
| `plan scheme rename` | ① 未注册 → not-found ② stageKey 不可归一（`parseStageId`，先于文件检查）→ not-found ③ 模板缺失 → file-missing |
| `plan scheme remove` | **只认 flow.json 注册键**（不读模板文件；文件存在但未注册 → not-found） |
| `plan scheme register` | 显式 `opId` 时：未注册 ∧ 模板不可读（`readOpTemplate`）→ not-found |

`flow stage reset` 采用「门后置到 `save()` 之前」（核心 `resetStagePhase` 的非法值判定全部在写盘前 `throw`）。

**`--dry-run` 免门（10 处）**：`flow stage remove` / `flow stage reset` / `flow advance` / `flow repair` / `flow migrate` / `flow checkpoint restore` / `flow health --fix` / `flow archive` / `plan scheme remove` / `plan scheme register`。理由：零写盘零收益，且须保住「`--dry-run` 试探 → `flow next` → 真执行」的正当路径。

**恢复通道豁免（2 处，禁止泛化）**：`flow repair` / `flow checkpoint restore` 在 `mgr.isLoaded() === false`（flow.json 损坏/不可读）时**静默放行**。理由：账本只在 `isLoaded()` 时写入 → 损坏态下 strict 会永久死锁，而这两个命令正是修复手段。状态可读时二者**仍受门**；其它命令一律不使用该豁免。

**零写盘保证**：strict 拒绝时，目标文件（`flow.json` / `status.md` / `config.yaml` / `ops/*.md` / 归档与 `.bak`）全部零写盘；`flow repair --backup` 的门在 `.bak` 复制**之前**，且 `--backup` 复制有两个安全前提 —— **`--dry-run` 下一律跳过**（预览模式不写任何文件），**`flow.json` 不可解析时也跳过**（否则会用损坏内容覆盖原本可用的 `.bak`，而 `repair()` 正是靠 `.bak` 恢复）；`config set --sync-stages` 的门在 `setConfigValue` **之前**（config.yaml / status.md / `flow.json.stages[*].workflow_mode` 三处均不落盘）。

**「读命令副作用」白名单（非门拒绝路径的既有写盘，登记备查）**

- `.openfeel/dev/.preflight.json`：`flow next` / `flow status` 记录账本（门只读账本，不刷新它）。
- `.openfeel/tmp/session.json`：`flow stage reset` 在**门后置路径**上会先调 `resetStagePhase` → `getSessionId` → `writeProjectSession`，**仅当环境存在 `CLAUDE_CODE_SESSION_ID`** 时写该会话文件（与 `flow.json` 无关的旁路状态）；属既有会话痕迹，不属状态写盘，未纳入本批次改动。

**legacy 错误值**：`preflight-required`（仅 `flow archive` / `req split` 的 `--json` 形态；判别仍是 `typeof doc.error === 'string'`）。

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
openfeel flow status [--verbose] [-n, --lines <n>] [--json]
```

**`--json`（v1.2.2）**：顶层 4 键固定序 `{schemaVersion,pipeline,stages,counts}`；`pipeline{phase,current{stage,op}}`；`counts{total,done,active}`；`stages[]` **10 键固定序** `id,phase,status,deps,ops,workflowMode,requirementId,reviewTier,effectiveReviewTier,opsSummary`——既有 5 键（`id,phase,status,deps,ops`）键序/类型/值逐字不变，新增 5 键仅追加于其后；`requirementId` 恒在、可空（`null`）；`opsSummary{total,byState}`（`total = ΣbyState`，`byState` 仅含观测到的状态）。人类输出不变。

### flow current

显示当前阶段和操作（phase + op + retry）。

```bash
openfeel flow current [--json]
```

`--json`（v1.2.2）：`{schemaVersion,stage,op,phase}`（均为 string，空态 `''`）。

### flow retry

查询指定操作的重试状态（只读）。

```bash
openfeel flow retry --op <stageId.opId> [--json]
```

`--json`（v1.2.4 A4）：`{schemaVersion,op,attempts,maxAttempts,exhausted,state}`；`attempts = getRetryCount(op)`、`exhausted = attempts >= maxAttempts`。未初始化 → `NO_INIT`；阶段不存在 → `STAGE_NOT_FOUND`；非法 opId / op 不存在 → `INVALID_ARGUMENT`（detail.reason）。

### flow phases

自描述全部合法 phase 与**运行时生效的**流转映射（数据源为 `.openfeel/pipeline.yaml`，缺省回退内置默认表）。

```bash
openfeel flow phases [--mode <full|fast|general>] [--stage <id>] [--json]
```

| 选项 | 说明 |
|------|------|
| `--json` | 以 JSON 输出 `{ schemaVersion, phases, transitions, advanceAccepted, transitionsDiff, workflowMode, reviewTier, displayReviewTier, effectiveReviewTier }`（**9 键**，v1.2.2-stage-96 末位追加 2 键、既有 7 键逐字保留；`phases` = 运行时**存在视图**；`advanceAccepted` = `flow advance` 的**推进白名单**，内置 15；`transitionsDiff` = 运行时转移表与内置默认转移表的**差异报告**，`missing` 列出内置默认有而运行时缺失的 source，使 `pipeline.yaml` 漂移**可见而非静默**；`workflowMode` = 本次展示所依据的工作流模式（v1.1.7 追加，**既有五键语义逐字不变**）；`reviewTier` = 展示档位兼容别名（**v1.2.1-stage-92 末位追加**）；`displayReviewTier` = 展示档位显式名（与 `reviewTier` 同值）；`effectiveReviewTier` = `flow advance` 缺省生效档位，**恒 `full`**） |
| `--mode <mode>` | 显式指定工作流模式（`full` / `fast` / `general`；缺省经 `--stage` / 当前阶段派生） |
| `--stage <id>` | 按指定阶段的模式展示转移表（缺省 = 当前阶段） |

示例：

```bash
openfeel flow phases
openfeel flow phases --json
```

### flow mode

显示当前阶段的工作流模式与来源（**只读**：不写盘、不推进）。

```bash
openfeel flow mode [--stage <id>] [--json]
```

| 选项 | 说明 |
|------|------|
| `--stage <id>` | 目标阶段（缺省 = 当前阶段） |
| `--json` | 以 JSON 输出 `{ schemaVersion, stage, mode, source, modes }`（`source` 五源枚举 `status.md` / `requirement` / `config.yaml` / `profile.yaml` / `builtin`；`modes` 含 `full` / `fast` / `general` 三表，供展示；`general` 为空表——无流水线） |

示例：

```bash
openfeel flow mode
openfeel flow mode --stage v1.1.7-stage-77 --json
```

### flow next

**v1.2.2-stage-96 新增（只读）**：输出当前阶段的调度决策（负责 Agent / 合法下一相位 / 建议命令 / 守卫 / 阻塞项），供适配器单点消费。

```bash
openfeel flow next [--json]
```

| 选项 | 说明 |
|------|------|
| `--json` | 12 键固定序 `{ schemaVersion, stage, phase, phaseLabel, responsibleAgent, workflowMode, reviewTier, effectiveReviewTier, legalNextPhases, suggestedCommand, guards, blockingReviews }` |

- **`responsibleAgent`**：与 `mapPhaseToAgent` 同源（`done → 'none'`）；无活跃阶段 → `'feel'`（显式约定）。
- **`legalNextPhases`**：`getAvailablePhases(stage)` 的**直接可达**目标（非多步 BFS）；顺序 = 转移表遍历序去重；每个元素均被 `flow advance` 接受。
- **`suggestedCommand`**：`openfeel flow advance --stage <stage> --to <legalNextPhases[0]>`；空集 → `null`。
- **`guards`**：本地化字符串数组，顺序固定 ①无活跃阶段 ②`auto_advance=disabled` ③blocking open REV 非空 ④无合法目标 ⑤展示档位 ≠ 生效档位；活跃且健康时 `[]`。
- **`blockingReviews`**：元素键序 `{id,title,priority,op}`；阶段域过滤（`r.op === stage || r.op.startsWith(stage + '.')` ∧ `blocking !== false` ∧ `open`）。
- **空态**：无活跃阶段 → 可空字段全 `null`、数组 `[]`、`responsibleAgent='feel'`；`phase`/`phaseLabel`/`workflowMode`/`reviewTier`/`effectiveReviewTier` 全 `null`。
- **只读**：不写盘、不改 phase、不 `save()`、不 `appendLog`；本版不支持 `--stage`。

### flow advance

推进流水线阶段。

```bash
openfeel flow advance --stage <stage-id> --to <phase> [--op <op-id>] [--review-tier <tier>] [--reason <text>] [--dry-run] [--force]
```

| 选项 | 说明 |
|------|------|
| `--stage <stage-id>` | 阶段 ID（**必填**，可用短名或完整名） |
| `--to <phase>` | 目标阶段（必填）。合法 phase 与转移表见 `openfeel flow phases` |
| `--op <op-id>` | 操作 ID（**可选**，仅用于日志/展示） |
| `--reason <text>` | 返工原因（v1.3.3）：仅当本步为 `review_passed → exec_running` 时写入审计键 `rework_reason`；其它推进忽略并提示 |
| `--review-tier <tier>` | 审查档位（`full` / `lean` / `skip`；**缺省 `full`**——未显式传时生效档位恒 `full`，展示值按模式派生（见 `flow phases --json.reviewTier` / `displayReviewTier`）；仅显式声明时裁剪审查关，**不可绕过 REV 阻塞检查**）。三档语义：`full` 零裁剪 / `lean` 裁 `scheme_review` / `skip` 裁 `plan_review` + `scheme_review`（代码审查关 / 测试关 / 归档关恒保留）。**裁剪只作用于入边 / 目标侧**——阶段恰停于被裁剪相位时保留出边、可向该档位下游推进；「**进入**被裁剪关」仍不可达。显式 `lean` / `skip` 打印一行非阻断警告；值域非法 → exit 1 零写盘。**注**：源码 help 文案已于 v1.2.3 订正为「缺省=full（零裁剪）」，与本节 / 契约 §12.3 一致 |
| `--dry-run` | 仅验证不修改（预览输出）；**字节级不写盘**（`revision`/phase 不变） |
| `--force` | 跳过非法 phase 与阶段跳跃检查（仍受 REV 闭环守卫约束，不可绕过） |
| `--json` | 错误封装开关（v1.2.2）：**仅失败时**在 JSON 模式下输出错误 envelope；成功仍输出人类文本，**不计入成功出口** |

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

### flow stage reset

**精准复位**阶段 phase（v1.1.4-stage-65）。允许**回退**（不受正向 `transitions` 限制），受**合法 phase 值域**与 `to=done` 的**阻塞 REV 检查**约束；写 `phase` 后按 `mapPhaseToStageStatus` 投影同步 `status`，审计 `reset_stage_phase`，不触发归档 commit、不写 checkpoint 快照。

```bash
openfeel flow stage reset <stageId> --to <phase> [--dry-run]
```

| 选项 | 说明 |
|------|------|
| `--to <phase>` | 目标 phase（**必填**，须为合法 phase，如 `review_pending` / `test_pending` / `done`；合法值见 `openfeel flow phases`） |
| `--dry-run` | 仅预览（零写盘），打印 `阶段: from → to`（含投影 `status`） |

> `flow advance` 是正向推进，`flow stage reset` 是其**对称复位**能力（可回退）；`to=done` 时同样受 blocking open REV 拦截。

**preflight（v1.5.6）**：`flow stage add` / `stage remove` / `stage set` / `stage reset` 全部受门；`stage remove` / `stage reset` 的 `--dry-run` 免门。`stage reset` 的门**后置到 `save()` 之前**（`resetStagePhase` 的阶段存在 / `--to` 值域 / REV 阻塞判定全部在写盘前 throw），故 `--to bogus` 仍先报非法值。详见 [preflight 写命令闸](#preflight-写命令闸v156)。

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
# 添加审查条目（op 级）
openfeel flow review add --op <op-id> --title <title> [--auto-fix] [--blocking <bool>]
# 添加审查条目（阶段级；v1.3.3，fast 无 op 场景）
openfeel flow review add --stage <stage-id> --title <title> [--blocking <bool>]

# 解决审查条目
openfeel flow review resolve <rev-id>
```

| 选项 | 说明 |
|------|------|
| `--op <op-id>` | 操作 ID（与 `--stage` 二选一，如 `stage-01.op-001`） |
| `--stage <stage-id>` | 阶段 ID（v1.3.3）：未提供 `--op` 时挂**阶段级 REV**（`op = stageId`，参与 blocking 门与归档摘要；不参与 `flow attempt` / `flow retry`） |
| `--title <title>` | 审查标题（可选；缺省为「说明: <op/stage>」） |
| `--auto-fix` | 标记为可自动修复（**必须同时提供 `--op`**） |
| `--blocking <bool>` | 是否为阻塞项（**默认 `true`**，REV 阻塞闭环核心语义） |

> `--op` 与 `--stage` 均未提供 → exit 1；`--auto-fix` 无 `--op` → exit 1。含点 stageId（如 `v0.0.1-stage-01`）在 `--stage` 路径下**不**走 `lastIndexOf('.')` 的 op 解析（v1.3.3 P0-2）。

### flow recover

**v1.2.2 新增 `--json`**：跨会话上下文恢复（流水线状态、阻塞原因、待处理任务）。

```bash
openfeel flow recover [--json]
```

`--json`：`{schemaVersion,initialized,phase,currentOp,stageStatus,blockedBy,pendingTasks,stageStats}`；未初始化 → `initialized:false` + `phase/currentOp/stageStatus/blockedBy:null` + `pendingTasks:[]` + `stageStats:{}`（exit 0，镜像人类）。

### flow checkpoint list

**v1.2.2 新增 `--json`**：列出所有（或指定阶段的）Checkpoint 快照。

```bash
openfeel flow checkpoint list [stage] [--json]
```

`--json`：`{schemaVersion,stage,checkpoints,count}`；`stage` 可空（`null` = 全部）；未初始化与空集合同形 `checkpoints:[]` + `count:0`（exit 0）。

### flow log

查看操作日志。

```bash
openfeel flow log [--last <n>] [--json]
```

| 选项 | 说明 |
|------|------|
| `--last <n>` | 显示最近 n 条日志（默认 10） |
| `--json` | v1.2.2：`{schemaVersion,count,entries[]{time,agent,action,detail}}`；`time` 原始 ISO（不截断）；空日志与未初始化同形 `entries:[]` + exit 0 |

### flow metrics

展示 Agent 性能指标；v1.5.6 起人类输出追加「流程健康」块（**代理指标**，`--json` 契约不变）。

```bash
openfeel flow metrics [--json]
```

| 选项 | 说明 |
|------|------|
| `--json` | `{schemaVersion,agents}`（顶层键集/键序**冻结**，v1.5.6 零变更） |

**流程健康（v1.5.6-stage-116，仅人类输出）**：不加监控、不告警、不写指标文件，只从已存在的两份账本（`flow.json.log` + `.openfeel/dev/.preflight.json`）推导三项：

```text
── 流程健康 ──
  resumed 比例: 0/17 (0.0%) · 另有 3 条不可判定
  plan_pending → plan_review 平均停留: 10m 35s (n=3)
  最近 preflight: 2026-10-31T12:13:31 @ 8h 19m 前（已过期）
```

> 上面三行是**构造输入算出的样例**（固定假时钟 + fixture），不是对某个真实仓库的断言。

| # | 指标 | 口径 |
|---|---|---|
| 1 | resumed 比例 | 窗口内 `action === 'advance_stage_phase'` 且 `detail.resumed` 为**布尔**的条目（分母）；分子为 `resumed === true`。`reset_stage_phase` **不计入**（返工 ≠ 推进恢复）。`labeled === 0` → 「无数据」，**不输出 `0.0%`**；**恒**外显「另有 N 条不可判定」 |
| 2 | `plan_pending → plan_review` 平均停留 | 逐 `plan_review` 事件配对：锚点复用 `src/core/phase-entered.ts` 的**唯一实现**（`advance` / `reset` / `register_stage` / `add_stage`）；`add_stage` 仅当 `detail.phase` 缺失或为 `plan_pending` 时算锚。行内**恒**带 `(n=…)` 或「无样本」，`n=1` 标「样本不足」 |
| 3 | 最近 preflight | 只读 `.openfeel/dev/.preflight.json`（1× `existsSync` + ≤1× `readFileSync`；**不调用** `recordPreflight`，绝不刷新账本）；>10 分钟标「已过期」；无记录 / 时间戳不可解析各有专门文案 |

**窗口**：`PROCESS_HEALTH_WINDOW = MAX_LOG_ENTRIES`（=200，全保留条目）。不设「最近 50 条」：那会让 n≈1，把「无样本」误当结论。

**局限（必读）**

- **token 无法直接测**：OpenFeel 不持有模型用量（无 API 账单、无 tokenizer 回调）⇒ 三项全是**代理指标**，只回答「流程行为是否变化」，**不回答「省了多少 token」**。
- **resumed 有结构性偏倚**：阶段出生即 `plan_pending`（写 `phase` 而非 `to`）⇒ 每个阶段第一条 advance 恒不可判定 ⇒ `unlabeled ≥ 阶段数`，故必须外显「另有 N 条不可判定」；`unlabeled` **不进口径**。
- **低 resumed 比例不能证明闸门有效**：单会话长跑里 `resumed=false` 是常态；`session_id` 为 `proc:` 前缀时整体省略（不可判定）。
- **dwell 是「入口摩擦」proxy**：只测「建阶段 → 计划过闸」的等待，不含方案/执行/审查耗时。
- **preflight 年龄只证明「读过状态」**：年龄小 ≠ 读的是当前 revision，也 ≠ 写命令必然合规（`warn` 模式仅提示）。
- **三项不能单点判「形式主义」**：需与 `flow log` 失败回环、REV 数量、`attempt_fail_*` 频次合看。
- **已评估、显式降级到 1.5.7**：`preflight` 拒绝次数 / `feel_next` 调用次数 / 主会话直写+自审占比——均需新增埋点或写盘计数器，违反本阶段「零运行时开销 / 不新增写盘」边界。

**零运行时开销**：`--json` 分支在健康块之前早返回 ⇒ **零新增 I/O**（不读账本、不写账本）；人类分支最多 1 次约 120B 的账本读取；单次 O(n)（n ≤ 200），无缓存 / 定时器 / 监听。

### flow health

流水线健康检查（`flow.json` / 跨文件一致性 / 僵尸状态 / `config.yaml` 等）。

```bash
openfeel flow health [--quick] [--json] [--fix] [--dry-run]
```

| 选项 | 说明 |
|------|------|
| `--quick` | 仅检查关键项（phase/current 合法性），跳过其余检查 |
| `--json` | JSON 单文档输出（`schemaVersion,ok,items,reconciled`；`items[]{name,status,detail}`；`reconciled` **恒在**，非 `--fix` 时为 `null`；`ok:false` 仍为成功文档 + exit 1） |
| `--fix` | 状态对账：以 phase 投影为权威，仅回写 `status.md` 的「状态」字段 |
| `--dry-run` | 与 `--fix` 组合，仅预览不写盘 |

**`--fix` 权威口径（v1.1.4-stage-62）**：权威值 = `mapPhaseToStageStatus(phase)`（`phase` 为单一事实源，`status` 是其**粗粒度投影**）；**仅回写 `status.md` 的「状态」行**（执行模式/自动推进/当前任务/状态记录等独立字段绝不触碰），**批量遍历全部阶段**；`--fix --dry-run` 零写盘；幂等（已一致不写）。`flow advance` **不回写** `status.md`，故 `--fix` 为**唯一批量对账/回写入口**（D3）。

- **preflight（v1.5.6）**：仅 `--fix` 真写路径受门；`--fix --dry-run` 免门。strict 拒绝时 `status.md` 零写盘。详见 [preflight 写命令闸](#preflight-写命令闸v156)。

### flow checkpoint restore

从 Checkpoint 快照恢复 `flow.json`（v1.1.4-stage-65）。**无 `--stage` 为全量覆盖**（需 `--force`，**最后手段**）；**`--stage <id>` 仅回退该阶段子树**（其它阶段与 `pipeline` 其余字段不动）；**`--dry-run` 只读差异预览**（零写盘）。

```bash
openfeel flow checkpoint restore <checkpoint-file> [--force] [--stage <id>] [--dry-run]
```

| 选项 | 说明 |
|------|------|
| `--force` | 确认恢复（覆盖 `flow.json`）；执行恢复时必填，`--dry-run` 不需要 |
| `--stage <id>` | 仅回退指定阶段子树（选择性恢复；缺省=全量覆盖） |
| `--dry-run` | 仅预览差异（列出 `阶段: fromPhase(fromStatus) → toPhase(toStatus)`），**零写盘**，不要求 `--force` |

- 快照文件名仅允许纯文件名（**拒绝路径分隔符 / `..`**，防路径穿越）；恢复前将当前 `flow.json` 备份为 `.bak`；乐观并发 `revision` 校验（磁盘被并发修改时拒绝）。
- 选择性恢复时子树 `status` 按 `phase` 投影（单一事实源），且**仅当 `pipeline.current.stage` 指向该阶段时**同步 `current.op`。
- **preflight（v1.5.6）**：受门；`--dry-run` 免门；**`flow.json` 不可读（`isLoaded() === false`）时豁免放行**（恢复通道，否则 strict 死锁）。详见 [preflight 写命令闸](#preflight-写命令闸v156)。

### flow repair / flow migrate / flow wizard

```bash
openfeel flow repair [--dry-run] [--backup] [--prune-orphans]
openfeel flow migrate [--dry-run] [--no-backup]
openfeel flow wizard
```

- `flow repair`：检测并修复 `flow.json` 常见问题（解析失败可从 `.bak` 恢复 / 重建）。
- `flow migrate`：把旧版（v4.0 全局 `phase`）迁移到新版（v4.1 阶段级 `phase`）。
- `flow wizard`：交互式推进（**非 TTY 直接拒绝**并给出指引，不渲染 ANSI）。
- **preflight（v1.5.6）**：三者均受门。`repair` / `migrate` 的 `--dry-run` 免门；`repair` 在 `flow.json` 不可读时**豁免放行**（恢复通道），且门在 `--backup` 复制 `.bak` **之前**（strict 拒绝时零写盘）；`wizard` 在交互循环前**一次**判定。详见 [preflight 写命令闸](#preflight-写命令闸v156)。

### 故障恢复路径

> **顺序即优先级**。`flow stage reset` / `checkpoint restore` 改写 `flow.json`；`flow health --fix` 仅回写 `status.md` 的「状态」字段。

```
① flow health（诊断，只报告）
② flow stage reset <id> --to <phase>（精准复位单阶段）       ← 首选
③ checkpoint restore <file> --stage <id> --dry-run（预览）→ 去 --dry-run 执行（按阶段回退）
④ checkpoint restore <file>（无 --stage，全量覆盖）          ← 最后手段
⑤ flow health --fix（对账 status.md「状态」，仅该字段）
```

### flow archive &lt;version&gt;

执行 flow.json 版本分片归档（v1.2.0-stage-78）。**判据门**：该版本**全部阶段 done** 且**无 blocking open REV**（不满足即拒绝，exit ≠ 0，**零写盘**；**不设 `--force`**）。归档落点 `.openfeel/flow-archive/{version}.json`；采用两步事务顺序保证一致性。

```bash
openfeel flow archive <version> [--dry-run] [--json]
```

| 选项 | 说明 |
|------|------|
| `--dry-run` | 仅预览（判据门照常校验；零写盘） |
| `--json` | 结构化输出。**成功（9 键）**：`{schemaVersion,version,stages,reviews,log,dryRun,eligible,unfinishedStages,blockingReviews}`（`eligible` 成功恒 `true`，两数组恒 `[]`）；**gate-rejected（9 键）**：`{schemaVersion,error(string),version,notDone,blockingOpen,eligible,unfinishedStages,blockingReviews,errorKind}`（`eligible` 恒 `false`；`unfinishedStages[]{id,phase}`；`blockingReviews[]{id,title,priority}`；legacy 五键序保留，三新键插在 `blockingOpen` 后、`errorKind` 前）。判据与门禁同源；`--dry-run` 零写盘 |

**与顶层 `openfeel archive <stage>` 区分**：顶层命令是**阶段摘要归档**，`flow archive` 是 **flow.json 版本分片归档**，二者职责不同；常规命令不读 `.openfeel/flow-archive/**`（`flow health` 仅目录清单级对账）。

- **preflight（v1.5.6）**：受门（判定在**判据门之后** → 夹具须本身 eligible）；`--dry-run` 免门；拒绝形态为 **legacy 三键** `{schemaVersion, error:'preflight-required', errorKind:'refusal'}`（无 `hint`）。详见 [preflight 写命令闸](#preflight-写命令闸v156)。

### flow archive list

列出已归档版本及计数（只读；引擎字典序）。

```bash
openfeel flow archive list
```

### flow archive show &lt;version&gt; [--json]

查看指定归档版本（只读；人类输出 = counts + 阶段概览）。

```bash
openfeel flow archive show <version> [--json]
```

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
openfeel roadmap show [version] [--json]
```

不传版本号时列出所有分期大纲。

**`roadmap show --json`（v1.2.4 A4）**：`{schemaVersion,version,milestones}`；`milestones[]{title,theme,stage,deliverable}` 由 `## 里程碑` 表格**表头驱动**解析（兼容 3/4 列历史格式，缺列 `null`）；不传版本 → `version:null,milestones:[]`（exit 0）；版本不存在 → `INVALID_ARGUMENT`/refusal/1；人类输出逐字不变。

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
openfeel plan stage add <name> [--deps <ids...>] [--tasks <items...>] [--exec-mode <manual|auto>] [--auto-advance <enabled|disabled>] [--workflow-mode <full|fast|general>]
```

| 参数/选项 | 说明 |
|------|------|
| `name` | 阶段 ID（如 `stage-01`、`v1.1.2-stage-41`） |
| `--deps <ids...>` | 依赖阶段 ID 列表（空格或逗号分隔，如 `--deps a b` 或 `--deps a,b`） |
| `--tasks <items...>` | 初始任务列表（生成到 `status.md`；不传保持 `> 待补充`） |
| `--exec-mode <manual\|auto>` | 执行模式，**显式覆盖 config 默认**（值域非法 → exit 1 且不建阶段） |
| `--auto-advance <enabled\|disabled>` | 自动推进，**显式覆盖 config 默认**（值域非法 → exit 1 且不建阶段） |
| `--workflow-mode <full\|fast>` | 工作流模式，**显式覆盖 config 默认**（值域非法 → exit 1 且不建阶段；骨架 `status.md` 在「自动推进」行后增「工作流模式」行，v1.1.7-stage-75） |

示例：

```bash
openfeel plan stage add stage-01
openfeel plan stage add v1.1.2-stage-41 --deps v1.1.2-stage-40
openfeel plan stage add v1.1.4-stage-63 --exec-mode auto --auto-advance enabled
openfeel plan stage add v1.1.7-stage-78 --workflow-mode full
```

创建 `plan/{series}/{stage-NN}/` 目录，包含 `overview.md`（含「## 依赖」）和 `status.md`，并写入 `flow.json.stages[fullStageId].deps`。非法 stageId 会报错并给出建议名。**阶段初值继承**：未显式传 `--exec-mode`/`--auto-advance` 时，新 `status.md` 的 `执行模式`/`自动推进` 取 `.openfeel/config.yaml` 的 `defaults`（缺失/非法逐键回退内置默认）；显式选项优先于 config 默认（v1.1.4-stage-63）。**工作流模式初值继承（v1.1.7-stage-75）**：同上口径——未显式传 `--workflow-mode` 时取 `config.yaml` 的 `defaults.workflow_mode`（缺失/非法回退内置默认 `fast`；本仓自举显式 `full`）；`flow.json` 同步写冗余字段（不参与级联，读取权威恒为 `status.md`）。

### 阶段创建入口关系

| 入口 | 层级 | 行为 | 定位 |
|------|------|------|------|
| `openfeel plan stage add <name>` | **完整层（推荐）** | 建目录（`overview.md` + `status.md`）+ 注册 `flow.json` | 唯一建目录入口 |
| `openfeel flow stage add <stageId>` | **注册层** | 仅注册 `flow.json`，不建目录 | 轻量注册 / 特殊场景 |
| `openfeel stage create <stageId>` | **注册层（已弃用）** | 与 `flow stage add` 等价（均走 `FlowManager.addStage`） | 兼容保留，建议迁移 |

- 三个入口均对非法 stageId 报错并给出建议名（`stage-NN` 或 `vX.Y.Z-stage-NN`）。
- `stage create` 已弃用：功能保留，TTY 下输出 `[deprecated]` 提示（非 TTY 静默），正式移除不早于 v1.2。

### 阶段 ID 归一化与 plan 目录映射（v1.3.3）

`flow.json` 的 stageId 是**权威键**，`plan/` 目录是**派生组织单位**。三个入口共享同一归一化（`parseStageId` / `normalizeStageId`），`plan stage add` 成功时会回显实际目录（可对账）。

**归一化规则**（输入 → `fullStageId`）：

| 输入形态 | 示例 | 归一化结果 | 说明 |
|------|------|------|------|
| 短名 | `stage-99` | `v1.0.0-stage-99` | 默认系列 `v1` + 默认版本 `v1.0.0` |
| 完整四级 | `v1.3.3-stage-104` | `v1.3.3-stage-104` | 原样保留 |
| 历史主版本 | `v4-stage-04` | `v4-stage-04` | 原样保留 |
| 非法 | `foo` / `v1` | 拒绝（exit 1） | 报错并给出建议名 |

**目录映射规则**（`stageId` → `.openfeel/plan/{series}/{stageDir}/`）：

| stageId | series | stageDir | 实际目录 |
|------|------|------|------|
| `v0.0.1-stage-1` | `v0` | `stage-1` | `.openfeel/plan/v0/stage-1/` |
| `v1.3.3-stage-104` | `v1` | `stage-104` | `.openfeel/plan/v1/stage-104/` |
| `stage-05`（短名） | `v1` | `stage-05` | `.openfeel/plan/v1/stage-05/` |

- `series` = 版本段首段（`MAJOR`）；`stageDir` = `stage-{NN}`（保留原始数字，含前导零）。
- 同一 `(series, stageDir)` 被两个不同 stageId 命中 → 阶段目录冲突（拒绝写入）。
- **目录占用（v1.5.7）**：目录按 `(series, stageDir)` 组织、版本前缀不进路径，归档阶段的残留目录会被同号的其它版本 stageId 命中。若 `status.md` 标题声明的**完整 stageId** 与请求不同，或该阶段已有归档日志（`.openfeel/log/archive-<stage>.md`）→ 拒绝（exit 1），提示占用目录、归属阶段与建议新编号。整版归档（`meta.archived_versions` 命中）只提示、不阻断；目录无 `status.md` 时按无法判定归属放行（兼容「先落目录、后注册」）。
- `plan stage add` 输出示例：`已创建阶段: v1.3.3-stage-104` + `已创建阶段: v1.3.3-stage-104（目录：.openfeel/plan/v1/stage-104/）`。
- **聚焦**（v1.3.3）：三个入口创建/注册成功后**原子设置** `pipeline.current.stage`，`flow next` 无需额外 `advance` 即可给出活跃阶段；`flow next` 在 current 为空时也会从 `stages` 只读派生（插入序首个非 done，不写盘）。

### plan stage list

列出所有工作阶段。

```bash
openfeel plan stage list [--json]
```

输出示例：

```
- stage-01  .openfeel/plan/v1/stage-01/
- stage-02  .openfeel/plan/v1/stage-02/
```

**`plan stage list --json`（v1.2.4 A2）**：`{schemaVersion,stages,count}`；`stages[]` 七键 `id,phase,status,deps,workflowMode,opsTotal,opsDone`，数据源为 **flow.json 注册阶段**（声明序）；空态 `stages:[]` + `count:0` + exit 0。JSON 为调度视图，人类输出保持计划目录清单（两种视图）。

### plan scheme create

创建操作方案。

```bash
openfeel plan scheme create <stage> [title] [--draft] [--from-tasks]
```

| 参数/选项 | 说明 |
|------|------|
| `stage` | 阶段名（如 stage-01） |
| `title` | 方案标题（**可选**；使用 `--from-tasks` 时省略——标题由任务行派生，二者互斥） |
| `--draft` | 创建为 draft（未发布态），须经 `plan scheme publish <stage> <opId>` 发布为执行态 |
| `--from-tasks` | 从阶段任务表**机械生成** `ops/op-NNN.md` 骨架 + `ops/deps.yaml` 占位（**不调用任何 Agent**；幂等前缀锚定——已铺任务跳过、`deps.yaml` 占位不覆盖；无待铺任务输出「无待铺任务」，v1.1.7-stage-75） |

示例：

```bash
openfeel plan scheme create stage-01 "实现核心功能"
```

在 `plan/v1/stage-01/ops/` 下创建 `op-001_实现核心功能.md`，按固定模板生成内容（目标、实施步骤、产出文件、自测清单、修正记录），并同步到 `flow.json`。

**序号与告警（v1.1.4-stage-64）**：新 op 序号取**「ops/ 目录文件 ∪ flow.json 注册键」的最小未用正整数**（空位回填——若注册键存在空洞则复用最小空洞，防止注册键与文件序列脱节导致的跳号）；创建后若目标阶段存在**未注册的 op 文件**（fileOrphans），向 stderr 输出告警并提示 `openfeel plan scheme register <stage>` 补注册（**告警不阻断创建**，正解为补注册而非覆盖既有文件）。

### plan scheme register

补注册 `ops/` 中**未注册的 op 文件**（fileOrphans：有 op 文件、`flow.json` 无对应注册键）。

```bash
openfeel plan scheme register <stage> [opId] [--dry-run]
```

| 参数/选项 | 说明 |
|------|------|
| `stage` | 阶段名（如 stage-01） |
| `opId` | 操作方案 ID（可选）；省略则补注册该阶段**全部** fileOrphans |
| `--dry-run` | 仅预览将注册的条目，**零写盘** |

示例：

```bash
# 预览该阶段全部待补注册项
openfeel plan scheme register stage-01 --dry-run

# 补注册指定 op
openfeel plan scheme register stage-01 op-002

# 补注册全部
openfeel plan scheme register stage-01
```

- **注册默认**：`state=pending`、`assignee=openfeel-executor`、`attempts=0`、`max_attempts=3`，`title` 取自文件内容首行（回退文件名），审计动作 `register_op`。
- **对称关系**：`plan scheme remove` 从 `flow.json` 删除注册键（不删文件）；`plan scheme register` 反向补全（不新写文件），两者构成对账闭环。与 `flow repair --prune-orphans`（仅清**键孤儿**）方向相反——文件孤儿的补注册出口为 `plan scheme register`。
- `opId` 已注册时报 no-op；`opId` 对应文件不存在时报错。

**preflight（v1.5.6）**：`plan stage add` / `plan scheme create`（常规 + `--from-tasks`）/ `publish` / `rename` / `remove` / `register` 全部受门；`scheme remove` / `scheme register` 的 `--dry-run` 免门。`publish` / `rename` / `remove` 与显式 `opId` 的 `register` 在门前做**只读存在性预检**（`flow.json` 注册键 / `ops/*.md`，与写函数同一真值源）→ `op-999` 报「未找到」而非 preflight；`plan scheme remove` 的「孤儿（无模板文件）可直接注销」能力保持不变。详见 [preflight 写命令闸](#preflight-写命令闸v156)。

### plan scheme list

列出操作方案。

```bash
openfeel plan scheme list [stage] [--json]
```

| 参数 | 说明 |
|------|------|
| `stage` | 阶段名（可选，不传则列出所有） |
| `--json` | v1.2.2：`{schemaVersion,stage,count,schemes[]{stage,opId,title,filePath,draft,fill}}`；`filePath` 为项目根相对路径；`draft` 为既有 opId 全局匹配口径（flow.json 全阶段 `state:'draft'`）；`fill` 经 `detectFillState`；`stage` 可空（`null` = 全部） |

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
openfeel view list [--op <id>] [--json]
```

| 选项 | 说明 |
|------|------|
| `--op <id>` | 按操作 ID 过滤 |
| `--json` | v1.2.2：`{schemaVersion,count,reviews[]}`；`reviews[]` 10 键 `id,op,status,priority,title,filed_by,filed_at,blocking,canAutoFix,autoFixDetail`；`blocking` 缺省 `true`（`!== false`）；`canAutoFix` 缺省 `false`；`autoFixDetail` 可空；空态 `reviews:[]`；内部异常 JSON `INTERNAL_ERROR`/3（人类 1） |

### view accept

验收审查条目。

```bash
openfeel view accept <rev-id>
```

| 参数 | 说明 |
|------|------|
| `rev-id` | 审查条目 ID（如 REV-001） |

- **preflight（v1.5.6，REV-007）**：受门。该命令把 REV 置 `closed`，可清掉 **blocking open REV** 从而绕过 `flow advance --to done` / `flow archive` 的阻塞门，故必须受门。门前做 REV 存在性**只读预检**（`listReviews()`）→ `REV-999` 报「未找到」而非 preflight；strict 拒绝时 `flow.json` 零写盘。详见 [preflight 写命令闸](#preflight-写命令闸v156)。

---

## archive — 阶段归档

Archiver Agent 使用此命令归档已完成阶段。

```bash
openfeel archive <stage> [--json] [--force]
```

| 参数/选项 | 说明 |
|------|------|
| `stage` | 阶段名称（如 stage-01） |
| `--json` | v1.2.2：`{schemaVersion,stage,archivePath,opsCount,reviewsCount,knowledgeExtracts}`；`archivePath` 为绝对路径；失败（阶段不存在 / 未初始化 / 写盘拒绝）→ `ARCHIVE_FAILED`/refusal/1；内部异常 → `INTERNAL_ERROR`/internal/3（人类保持 1） |
| `--force` | **v1.2.4 A1**：显式覆盖已存在的归档文件；缺省时目标文件已存在 → `ARCHIVE_EXISTS`/refusal/1，**零写盘**（归档内容哈希、`flow.json` revision、`log[]` 长度、KB 条目数均不变）。保护为**归档文件级**：短名/全名别名派生不同文件、互不触发 |

归档操作会汇总阶段产出、生成摘要、提取知识条目。（**阶段摘要归档**——与 `flow archive` 的 flow.json 版本分片归档职责不同。）

---

## req — 需求流转

需求管理命令组（v1.2.0-stage-81~83；**v1.2.1-stage-87 增 `split` / stage-90 增 `--workflow-mode` / stage-93 修复 done 门**）。需求是**排期与调度层**（需求 ≠ 计划）；需求进度由关联阶段 phase 聚合，实现仍走流水线。

| 子命令 | 用途 | 关键参数 |
|--------|------|----------|
| `req add <title>` | 创建需求（ID 自动分配） | `--target-version <version>`、`--priority <P0\|P1\|P2>`、`--workflow-mode <full\|fast\|general>` |
| `req list` | 列出需求 | `--status <status>`、`--target-version <version>`、`--owner <owner>`、`--json` |
| `req show <id>` | 查看需求详情 | `--json` |
| `req claim <id>` | 认领需求（占用校验） | `--owner <owner>` |
| `req release <id>` | 释放认领（未认领为 no-op 成功） | — |
| `req set <id>` | 更新需求字段（白名单） | `--status` / `--title` / `--target-version` / `--priority` / `--workflow-mode` |
| `req link` | 关联需求到阶段 / 解绑（二选一） | `--stage <stageId>`、`--requirement <id>`、`--unlink` |
| `req advance <id>` | 显式推进需求状态 | `--to <status>` |
| `req split <id>` | 拆分需求为若干子需求（**拆分即发布**：子需求入 `scheduled`） | `--into <title>`（**可重复**，至少一项）、`--json` |
| `req board` | 需求看板（7 组固定顺序） | `--target-version <version>`、`--json` |
| `req next` | 推荐下一个可接取需求 | `--owner <owner>`、`--json` |

- **退出码**：`0` 成功 ｜ `1` 校验 / 占用 / 存在性失败（经 `process.exitCode`；错误码 分流 `not_found` / `stage_not_found` / `already_claimed` / `invalid_field` / `invalid_status` / `general_mode_conflict`）｜ `2` 并发写冲突（共享单点）。
- **`--json` 契约**：**5 命令（4 读 + `split`）**——四读命令（`list` / `show` / `board` / `next`）成功 = stdout 纯 JSON 单文档（含 `schemaVersion`）；失败 = 纯 JSON 单文档含 `error` 码 + exit 1；stderr 零输出。`split`（写命令）= 成功 `{ schemaVersion, parent, children }`，同样遵循单文档契约。**`req list`（v1.2.2）**：`requirements[]` 元素**末位**追加 `linkedStages[]{id,phase}` / `progress{done,total}`（零关联 `[]` + `{0,0}`；既有字段顺序/值不变）。失败 envelope / legacy `errorKind` 判别见上「错误封装（v1.2.2）」。
- **`--workflow-mode`（v1.2.1-stage-90 起）**：值域 `full` / `fast` / `general`；**`general`（无流水线）仅需求级合法**——阶段级 / 部署级写入面拒绝（`general_mode_conflict` 亦在需求与阶段关联时触发：`general` 需求不接受阶段关联）。**done 门（v1.2.1-stage-93 修复）**：`general` 需求零关联阶段可**显式完成**（载体制对偶完成路径，判据字段直判）；非 `general` 需求仍须全部关联阶段 done，被拒时输出专用文案。
- **`--owner` 三级链**：`--owner` 参数 → `.openfeel/.info.json` 的 `user` → `git config user.name`。
- **preflight（v1.5.6）**：7 个写命令（`add` / `claim` / `release` / `set` / `link` / `advance` / `split`）全部受门。顺序约定：**ID 格式校验先于门**（`req claim REQ-XXX` 报非法 ID，不报 preflight）；`req split --json` 的拒绝形态为 legacy 三键 `{schemaVersion, error:'preflight-required', errorKind:'refusal'}`（无 `hint`）。详见 [preflight 写命令闸](#preflight-写命令闸v156)。
- 分工：引擎面 / 状态机语义（校验 / 流转 / 占用 / 关联唯一性 / done 门）见 [`core/req.md`](../.openfeel/manual/core/req.md)；命令面深入参考见 [`cli/req.md`](../.openfeel/manual/cli/req.md)。

---

## config — 配置管理

项目/全局配置读写与有效值查询。

### config effective

输出受管配置键的**有效值 + 生效来源**。

```bash
openfeel config effective [key] [--json]
```

| 参数 | 说明 |
|------|------|
| `key`（可选） | 单个受管键；省略时输出四键（`execution_mode` / `auto_advance` / `merge_mode` / `workflow_mode`） |
| `--json` | v1.2.2：无 key → `{schemaVersion,effective}`（`effective` 为受管键映射，键序 = `EFFECTIVE_CONFIG_KEYS`）；有 key → `{schemaVersion,key,value,source}`；未知 key → envelope `INVALID_ARGUMENT`（refusal/1） |

**来源优先级**：`status.md` > `config.yaml` > `profile.yaml` > `builtin`；未知 key → stderr + exit 1。

### config get / set

读取/写入项目 `config.yaml`（`--global` 时操作全局 `profile.yaml`）。

```bash
openfeel config get [key] [--global] [--all] [--json]
openfeel config set <key> <value> [--global] [--sync-stages] [--stage <ids...>]
```

**`config get --json`（v1.2.2 / v1.2.4 A5）**：项目 → `{schemaVersion,scope,key,value}`；项目 `--all` → `{schemaVersion,scope:"project",defaults}`（`defaults` 四键固定序 `execution_mode,auto_advance,merge_mode,workflow_mode`，取自 `resolveConfigDefaults`，**不再报 `key-required`**）；全局无 key → `{schemaVersion,scope,values}`（6 全局键固定序）；全局有 key → 同项目形态；项目无 key 且无 `--all` → envelope `INVALID_ARGUMENT`（refusal/1）；`--all`+`--global` → `all-global-conflict`；`--all`+key → `all-with-key`。`config set` 无 `--json`（写命令保持人类文本）。

- **支持全量 `defaults.*` 键**（schema 驱动）：`execution_mode` / `auto_advance` / `merge_mode` / `workflow_mode` 等受管配置键均可通过 `config set`/`get` 读写（与 `config effective` 覆盖范围一致）。**注意**：原布尔测试门禁键已于 v1.1.4-stage-62 移除，`config set` 该键将被判定为**无效键**（报错、不写盘）。
- **`defaults.X ≡ X`（v1.1.4-stage-63）**：项目模式下 `defaults.` 前缀与 bare key 等价（键归一，单一来源）；`--global` 的 profile 键域不同，不受影响。
- **`--sync-stages`（v1.1.4-stage-63）**：仅项目模式（与 `--global` 组合 → exit 1）；将值批量写入**所有已注册阶段** `status.md` 对应字段（适用键 `auto_advance` → `自动推进`、`execution_mode` → `执行模式`、`workflow_mode` → `工作流模式`）；**同值 no-op**；其它键（无阶段字段）跳过并报告。
- **`--stage <ids...>` 作用域限定（v1.1.7-stage-75）**：缺省 = 全量；空格/逗号分隔；**前置全量校验**（未注册 exit 1 零写盘）；单独 `--stage` 或与 `--global` 组合 → exit 1；`workflow_mode` 字段缺失走**插入**（锚点链「自动推进」→「执行模式」；锚点皆缺 = `skipped-no-anchor`，**退出码恒 0**）；done 阶段不过滤、正常处理。
- **值类型归一**：写入前按字段 Schema 归一值类型（枚举键按枚举校验；Schema 中若存在布尔键则 `true`/`false` 归一为布尔值），避免以字符串落盘破坏配置校验。当前受管四键均为枚举型。
- **枚举校验 + 不写盘**：非法取值（如 `execution_mode bogus`）以非 0 退出并报错，**不修改目标文件**（文件 hash 与 mtime 不变）。
- **preflight（v1.5.6，REV-004）**：仅 `--sync-stages` 同步分支受门（非同步分支只改 `config.yaml` 的项目默认值，不改阶段状态）。门插在 `setConfigValue` **之前** → strict 拒绝时 `config.yaml` / `status.md` / `flow.json`（`stages[*].workflow_mode`）**三处零写盘**。详见 [preflight 写命令闸](#preflight-写命令闸v156)。

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
openfeel knowledge list [--type <category>] [--json]
```

| 选项 | 说明 |
|------|------|
| `--type <category>` | 按分类过滤（architecture/patterns/troubleshooting/setup） |
| `--json` | v1.2.2：`{schemaVersion,entries[]{title,category,date,enabled},count}`（不含正文）；空态 `entries:[]` + exit 0 |

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
openfeel knowledge search <query> [--limit <n>] [--offset <n>] [--json]
```

`--json`（v1.2.2）：`{schemaVersion,query,limit,offset,results[]{title,category,date,enabled,content,summary}}`；`summary` 为内容前 100 字（超出加 `…`）；空态 `results:[]` + exit 0。

### knowledge index

显示知识库索引概览。

```bash
openfeel knowledge index [--json]
```

`--json`（v1.2.2）：`{schemaVersion,categories[]{name,description},recentUpdates[]{date,category,title}}`；`index.md` 缺失时为 4 分类缺省 + `recentUpdates:[]`。

### knowledge dedup

检索相似知识条目（**只读建议，不修改 kb**）。

```bash
openfeel knowledge dedup [content] [--project <path>] [--category <name>] [--threshold <n>] [--json]
```

| 选项 | 说明 |
|------|------|
| `content` | 待归档内容（省略时从标准输入读取） |
| `--project <path>` | 目标项目根路径（默认当前目录）；**保留本地声明**（v1.2.2 起与全局 `--project` 并行，语法不变） |
| `--category <name>` | 仅检查指定分类（architecture/patterns/troubleshooting/setup） |
| `--threshold <n>` | 相似度阈值 0~1（默认 0.8） |
| `--json` | v1.2.2：`{schemaVersion,threshold,categories,found,readOnly,matches[]{category,title,date,enabled,similarity,flagged}}`；恒 `readOnly:true`；无匹配 `found:false` + `matches:[]`；非法阈值 / 分类 → envelope refusal/1 |

---

## lint — 质量门禁检查

```bash
openfeel lint i18n [--json]   # i18n 键对称性校验（zh/en 三向比对 + 空值检测）
openfeel lint kb [--json]     # kb 过期引用检测（扫描 kb 文件中的路径引用是否存在）
openfeel lint req [--json]    # 需求正文命令名存在性（真实命令树 + 剥 openfeel 前缀）
```

**`lint i18n|kb --json`（v1.2.4 A4）**：`{schemaVersion,target,ok,issues}`；`target ∈ {i18n,kb}`；`issues[]{path,message}`（i18n = 语言源文件相对路径；kb = `.openfeel/kb/<file>`）；`ok = issues.length === 0`。`ok:false` 仍输出成功文档并保持既有 exit 1 门禁语义；结构化 issues 与人类行同源（人类输出逐字不变）。`lint kb` 无 KB 目录 → `ok:true,issues:[]`。

**`lint req --json`（v1.5.6 #41）**：`{schemaVersion,target,ok,issues,suspects,unknownCount,suspectCount}`（**恒 7 键**，`target:'req'`）；比其它 lint 出口多 `suspects` / `unknownCount` / `suspectCount` 三键——**A 类**（首 token 是根命令、解析在某处断裂，**且断点父命令未声明位置参数**，`unknown-command`）进 `issues`，驱动 `ok:false` + **exit 1**；**B 类**（`suspect-command-group`）进 `suspects`，`ok` 不受影响、**exit 0**（advisory），来源有两种：① 首 token 非根且尾 token 已注册（`op create`）；② **参数起点歧义**——父命令声明了位置参数而下一 token 又命中命令名（`archive create` / `knowledge search lint`）。反过来，带位置参数的合法写法直接通过（`stage set stage-01` / `config get workflow_mode` / `archive v1.2.0`）。`ok = issues.length === 0`（与 #38/#39 一致）。只扫 `.openfeel/requirements/*.md`（一层、不跟随符号链接）；抑制标记两档（`<!-- lint-req:ignore -->` 行内 / `ignore-start` … `ignore-end` 区间），**只用于正文按定义要引用错误命令名的场景**；未闭合区间只走 **stderr 警告**（不改退出码、不进 JSON），抑制行数只进人类输出。**不给近似纠错建议**（A 类只报「无法解析为命令路径 + 断点位置」）。详见 [json-contract.md](json-contract.md) §16。

**退出码（门禁语义，v1.1.2）**：发现问题时**非 0 退出**（对齐 `flow health`），使 CI/脚本可直接以其作为门禁；无问题 `exit 0`。`lint req` 仅 **A 类**（命令路径无法解析）非 0，**B 类**（疑似命令组 / 参数写成命令名）不改退出码，**未闭合区间**仅 stderr 警告、不改退出码。**未提供** `--warn-only`/`--no-fail` 逃生阀——若需忽略结果，请由调用方显式表达（如 `openfeel lint kb || true`）。

## stage — 阶段状态

```bash
openfeel stage status [stageId] [--json]  # 查看阶段状态
openfeel stage set <id> --status <v>    # 更新阶段状态（写入 status.md 字段；另支持 --exec-mode / --auto-advance / --workflow-mode / --review-agent）
openfeel stage create <stageId>         # 已弃用（注册层，与 `flow stage add` 等价；建议用 `plan stage add`）
```

**`stage status --json`（v1.2.2）**：有参 → `{schemaVersion,stageId,statusPath,fields,tasks,blockedBy}`（`fields` = 7 规范键 `execMode,autoAdvance,status,reviewAgent,previousReviewAgent,updatedAt,workflowMode` + `raw`；`tasks[]{number,done,description}`；`statusPath` 绝对路径；`blockedBy` 可空）；无参 → `{schemaVersion,stages[]{stageId,status,statusPath},count}`（空态 `stages:[]` + `count:0`，exit 0）；阶段未找到 → envelope `STAGE_NOT_FOUND`/refusal/1。

**`stage set --status` 值域（v1.1.4-stage-62）**：仅接受**粗粒度状态枚举** `planned` / `review_failed` / `review_passed` / `testing` / `archiving` / `done`（单一来源 `STAGE_STATUS_VALUES`，与 `status = phase` 投影的取值域一致）；传入**相位值**（如 `review_pending`）或**任意值** → **exit 1 且不写盘**（不生成 `.bak`）。

**`stage set --workflow-mode` 插入语义（v1.1.7-stage-75）**：目标 `status.md` 无「工作流模式」行时走**插入**（锚点链「自动推进」→「执行模式」；`.bak` + 原子写，其余内容逐字保留）；**锚点皆缺 → exit 1 不写盘、无 `.bak`**；`flow.json` 冗余字段仅在实际写入时同步（不参与级联）。

**preflight（v1.5.6）**：`stage set` / `stage task`（`--add` 分支与主路径**各一处**）/ `stage create` 全部受门。顺序约定：**阶段存在性 / 枚举值域 / general 载体制 / `--add` 互斥先于门** → `stage set no-such-stage` 报「阶段未找到」而非 preflight；strict 拒绝时 `status.md` 零写盘且不生成 `.bak`。详见 [preflight 写命令闸](#preflight-写命令闸v156)。

## model — 模型配置

三层级 agent 模型读写（`default` / `global` / `project`），非 TTY 下 `--scope default` 须 `--force`/`--build` 双重确认。

```bash
openfeel model set <agent> <model> [--scope default|global|project] [--build] [--force]
openfeel model get <agent> [--scope ...] [--json]
openfeel model list [--scope ...] [--json]
```

**`model list|get --json`（v1.2.4 A3）**：list `{schemaVersion,scope,agents:[{agent,provider,model,source}]}`；get `{schemaVersion,scope,agent,provider,model,source}`；`scope` 回显 `--scope`（未指定 `null`）；`provider`/`model` 按生效值首个 `/` 切分（无 `/` → `provider:null`）；`source` = 生效层（default > project > global），无值 `null`；非法 scope → `INVALID_ARGUMENT`/refusal/1。人类输出不变。

## setup — 全局部署

纯全局部署（全局 `AGENTS.md` + agent + skill + 全局平台适配器配置），不建立项目 `.openfeel/`，幂等。

```bash
openfeel setup [--lang <zh-CN|en>] [--tools <list>] [--dsh-profile <name>]   # 部署全局框架配置（幂等）
openfeel setup --check [--json]                       # 只读诊断：一致退出 0，否则退出 1
```

`--check` 只读，不执行部署；`--json` 输出 `{schemaVersion,status,cliVersion,deployedVersion}`。`status`（v1.3.4 起五态）：

| status | 含义 | 建议动作 |
|---|---|---|
| `ok` | 一致（有 DSH 部署时还要求宿主已加载同一适配器指纹） | 无 |
| `mismatch` | 磁盘部署版本 ≠ CLI 版本 | `openfeel setup`（+ 重启） |
| `restart-required` | **文件已新，但运行中的宿主仍加载旧适配器** | **完全退出并重启宿主**（重载后端无效），不要再跑 setup |
| `missing` | 未检测到全局部署 | `openfeel setup` |
| `unknown` | `update_state.json` 缺失/损坏，无法判定 | 重跑 `openfeel setup` |

`--tools claude` → 部署 `~/.claude/`（CLAUDE.md + 10 agents + 22 skills + `settings.json` 注入 `agent:"feel"` 与 `permissions.defaultMode:"auto"`，用户键逐字保留；用户主权键 `model` **无则创建、有则不覆盖**）；默认仅 opencode，`~/.claude` 零触。

`--tools dsh`（v1.3.0 起）→ 把 `openfeel` 包内的 `dsh/` 部署到 DSH profile：

- `DSH_HOME`（env）或 `~/.dsh` 下的 `profiles/<name>/package.json`；缺省部署**全部**已检测 profile，`--dsh-profile web` 可窄化。
- 写入 `dependencies["openfeel-dsh"] = "link:<openfeelRoot>/dsh"` + `dsh.profile.bundles += "openfeel-dsh"`；仅在依赖变化或链接无效时执行 `pnpm install --prefer-offline --no-frozen-lockfile`（允许更新过期 lockfile；写前备份、失败回滚 package.json、幂等重跑零备份/零 pnpm；失败时 lockfile/node_modules 可能保留部分更新，下次 setup 收敛）。
- DSH profile **不进入**全局 `update_state.json` 的 `files` 资产 hash；但 **v1.3.4 起**部署成功会刷新 `openfeel_version` 并写入 `adapters.dsh = { version, hash, deployed_at }`（`hash` = 适配器 `lib/**` 指纹），修复「dsh-only setup 后 `--check` 永远 mismatch」。
- **宿主加载指纹（v1.3.4）**：DSH 适配器在宿主启动时把自身 `lib/**` 指纹写入 `~/.openfeel/adapter-host-dsh.json`；`setup --check` 比对部署指纹与加载指纹，输出 `restart-required`（文件已新但宿主未重启）。
- 错误：预检 / 用法 / profile 类 → `INVALID_ARGUMENT` / exit 1（`detail.reason=dsh-*`）；备份 / pnpm install → `INTERNAL_ERROR` / exit 3。均零写盘或已回滚。
- 完成后重启 DSH 宿主（host module 不热加载）。`openfeel update --tools dsh` 不适用，会 exit 1 并指引本命令。

## dev — 开发状态记录（v1.5.0）

工作流瘦身后，`dev_last.md` 的简要状态由 CLI 维护；只有 Feel 写手写交接内容。

```bash
openfeel dev sync      # 立即写入简要状态块（dev_last AUTO 块 + .sync.json）
openfeel dev status    # 只读：是否到期（默认 30 分钟窗口）
```

- **受管块**：只替换 `dev_last.md` 内 `<!-- openfeel:auto:begin/end -->`，不触碰手写内容；无 `--json`（零 JSON 契约变更）。
- **自动同步**：`flow advance` 成功后，首次 / 超过 30 分钟 / 节点相位（`exec_running` / `review_passed` / `archiving` / `done`）自动同步（best-effort）。
- **状态归属**：`dev_last*` / `dev/current.md` / `status.md` / `flow.json` 只由 Feel 写；子 agent 不读不写。
- **日志**：不强制写日志；`flow.json.log` 由 CLI 维护，仅保留最近 200 条。

## chore — 微变更通道（v1.4.0）

给「单文件、无接口变化、可肉眼验证」的微变更一条 1 步通道（UI 微调 / 文案 / 静态资源）：

```bash
openfeel chore "<说明>"     # 开启写窗口（60 分钟；要求无活跃阶段）
openfeel chore --end        # 收口（幂等）
openfeel chore --status     # 只读状态（active / expired / none）
```

- **不创建阶段**：不写 `flow.json.stages`，只追加 `chore_start` / `chore_end` 日志与 `.openfeel/chore.json`（ephemeral，到期自动失效）。
- **写入效果（DSH 适配器）**：无活跃阶段时，chore 有效期内源码也可写；受保护路径（`.openfeel/flow.json`、`**/status.md`）仍拒绝。存在活跃阶段时 chore **不生效**（不绕过相位门）。
- **审计**：guard 放行写 `.openfeel/log/guard-audit.jsonl`（`reason=chore`）。
- **静态资源无需 chore**：`.css/.scss/.html/.svg/.png/.jpg/.jpeg/.webp` 与 `assets/**`、`public/**` 在任意相位/无阶段时直接可写（混合目标从严）。

## migrate — 存量迁移

存量旧布局项目迁移（检测 / 备份 / 迁移 / 回滚）；`--dry-run` 预览不写盘。

```bash
openfeel migrate [path] [--dry-run] [--remap-assignee] [--clean-global-core-md]
openfeel migrate rollback [--dry-run]     # 回滚最近一次迁移（读 manifest.json）
```

## project — 项目管理

```bash
openfeel project overview --json            # 实时扫描项目结构，输出结构化概览
```

**`project overview --json`（v1.2.2）**：`{schemaVersion,project,dirs,stats,entries,techStack}`；`project{name,version,description}`；`dirs.*` 子项目录不存在时 `null`（`bugs` 为 boolean）；恒 exit 0（无 `initialized` 键）。

> 注：`project` 组当前仅 `overview` 一个子命令（`list` / `info` 已不存在，v1.1.2-stage-56 由 `cli/BUG-007` 更正）。

## JSON 出口一览（v1.5.6 快照，新增 #41）

> 计数口径：**41 个成功出口 / 44 个注册选项**（44 = 42 个 `--json` 选项 + `chore --end` / `chore --status` 两个非 json 选项；v1.5.6 新增 #41 `lint req`）；`--version --json` **单列，不计入**（既非 Commander 选项、也非出口）。权威表见 [json-contract.md](json-contract.md) §5；`flow advance --json` 为错误模式开关（成功仍人类文本）。本仓收口基线：75 文件 / 21 阶段。

| # | 出口 | 命令面 | 顶层键序 |
|:-:|------|--------|----------|
| 1 | `flow status` | `flow status --json` | `schemaVersion,pipeline,stages,counts` |
| 2 | `flow overview` | `flow overview --json` | `schemaVersion,phase,current,summary,stages,reviews,health,logs`（未初始化：`schemaVersion,initialized`） |
| 3 | `flow current` | `flow current --json` | `schemaVersion,stage,op,phase` |
| 4 | `flow metrics` | `flow metrics --json` | `schemaVersion,agents` |
| 5 | `flow phases` | `flow phases --json` | `schemaVersion,phases,transitions,advanceAccepted,transitionsDiff,workflowMode,reviewTier,displayReviewTier,effectiveReviewTier` |
| 6 | `flow mode` | `flow mode --json` | `schemaVersion,stage,mode,source,modes` |
| 7 | `flow ops list` | `flow ops list --json` | `schemaVersion,ops` |
| 8 | `flow archive` | `flow archive <version> --json` | `schemaVersion,version,stages,reviews,log,dryRun,eligible,unfinishedStages,blockingReviews` |
| 9 | `flow archive list` | `flow archive list --json` | `schemaVersion,versions` |
| 10 | `flow archive show` | `flow archive show <version> --json` | `schemaVersion,version,stages,reviews,log,counts,archived_at` |
| 11 | `flow health` | `flow health --json` | `schemaVersion,ok,items,reconciled` |
| 12 | `req list` | `req list --json` | `schemaVersion,requirements`（元素末位 `linkedStages,progress`） |
| 13 | `req show` | `req show <id> --json` | `schemaVersion,requirement,stages,parent,children` |
| 14 | `req split` | `req split <id> --into ... --json` | `schemaVersion,parent,children` |
| 15 | `req board` | `req board --json` | `schemaVersion,groups` |
| 16 | `req next` | `req next --json` | `schemaVersion,requirement`（`candidates` 条件出现） |
| 17 | `instructions` | `instructions <artifactId> --json` | `schemaVersion,artifact,task,project_context,rules,dependencies,output,instruction,template,unlocks` |
| 18 | `setup --check` | `setup --check --json` | `schemaVersion,status,cliVersion,deployedVersion`（status 五态，v1.3.4 增 `restart-required`） |
| 19 | `flow next` | `flow next --json` | `schemaVersion,stage,phase,phaseLabel,responsibleAgent,workflowMode,reviewTier,effectiveReviewTier,legalNextPhases,suggestedCommand,guards,blockingReviews` |
| 20 | `stage status` | `stage status [<stageId>] --json` | `schemaVersion,stageId,statusPath,fields,tasks,blockedBy`；无参 `schemaVersion,stages,count` |
| 21 | `flow recover` | `flow recover --json` | `schemaVersion,initialized,phase,currentOp,stageStatus,blockedBy,pendingTasks,stageStats` |
| 22 | `flow checkpoint list` | `flow checkpoint list [stage] --json` | `schemaVersion,stage,checkpoints,count` |
| 23 | `knowledge search` | `knowledge search <query> --json` | `schemaVersion,query,limit,offset,results` |
| 24 | `knowledge list` | `knowledge list --json` | `schemaVersion,entries,count` |
| 25 | `knowledge index` | `knowledge index --json` | `schemaVersion,categories,recentUpdates` |
| 26 | `knowledge dedup` | `knowledge dedup [content] --json` | `schemaVersion,threshold,categories,found,readOnly,matches` |
| 27 | `config get` | `config get [key] [--global] [--all] --json` | `schemaVersion,scope,key,value`；项目 `--all`：`schemaVersion,scope,defaults`；全局无 key `schemaVersion,scope,values` |
| 28 | `config effective` | `config effective [key] --json` | `schemaVersion,effective`；有 key `schemaVersion,key,value,source` |
| 29 | `view list` | `view list --json` | `schemaVersion,count,reviews` |
| 30 | `plan scheme list` | `plan scheme list [stage] --json` | `schemaVersion,stage,count,schemes` |
| 31 | `flow log` | `flow log --json` | `schemaVersion,count,entries` |
| 32 | `project overview` | `project overview --json` | `schemaVersion,project,dirs,stats,entries,techStack` |
| 33 | `archive <stage>` | `archive <stage> --json [--force]` | `schemaVersion,stage,archivePath,opsCount,reviewsCount,knowledgeExtracts` |
| 34 | `plan stage list` | `plan stage list --json` | `schemaVersion,stages,count` |
| 35 | `model list` | `model list [--scope] --json` | `schemaVersion,scope,agents` |
| 36 | `model get` | `model get <agent> [--scope] --json` | `schemaVersion,scope,agent,provider,model,source` |
| 37 | `flow retry` | `flow retry --op <id> --json` | `schemaVersion,op,attempts,maxAttempts,exhausted,state` |
| 38 | `lint i18n` | `lint i18n --json` | `schemaVersion,target,ok,issues` |
| 39 | `lint kb` | `lint kb --json` | `schemaVersion,target,ok,issues` |
| 40 | `roadmap show` | `roadmap show [version] --json` | `schemaVersion,version,milestones` |
| 41 | `lint req` | `lint req --json` | `schemaVersion,target,ok,issues,suspects,unknownCount,suspectCount` |
| 单列 | `--version --json` | `--version --json` / `-v --json` | `schemaVersion,version,node`（**不计入 41 / 42**） |

> 说明：以上为 **v1.5.6 快照**（40 出口 → 41；新增 #41 `lint req`）的命令面概览；完整子命令 / 选项以 `openfeel <cmd> --help` 为准。

## update — 更新适配文件

更新平台适配文件（当前：OpenCode 适配器）——Agent 定义、Skill 文件、`AGENTS.md`，以及**全局 `opencode.jsonc` 的深度合并**（`instructions` 拼接去重 / `agent` 补缺 / 其他对象递归 / 标量覆盖；用户未知字段 passthrough）。部署覆盖既有框架资产前自动备份（`~/.openfeel/backup/{ts}/`）。

```bash
openfeel update [path] [--lang <zh-CN|en>] [--force] [--tools <list>]
```

| 参数 | 说明 |
|------|------|
| `path` | 目标项目路径，默认为当前目录 |
| `--tools <list>` | 部署目标工具（逗号分隔，如 `opencode,claude`）；与 `setup` 共用 `parseToolList`，非法值 exit 1；默认仅默认启用工具（不带 `--tools` 时 `~/.claude/` 零触）。**`dsh` 不适用于 update**：`--tools dsh` → exit 1（在 auto-init / 写盘前），请改用 `openfeel setup --tools dsh` |
