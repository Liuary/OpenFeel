# OpenFeel CLI 命令参考

> 生成时间：2026-06-26 | 适用版本：0.1.0

## 全局选项

| 选项 | 说明 |
|------|------|
| `-v, --version` | 输出版本号 |
| `-h, --help` | 显示命令帮助信息 |

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
├── stages/              # 工作阶段目录
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

### flow advance

推进流水线阶段。

```bash
openfeel flow advance --op <op-id> --to <phase>
```

| 选项 | 说明 |
|------|------|
| `--op <op-id>` | 操作 ID（必填） |
| `--to <phase>` | 目标阶段（必填） |

支持的阶段（phase）：`plan_pending`、`plan_review`、`plan_passed`、`scheme_pending`、`scheme_review`、`scheme_passed`、`exec_running`、`review_pending`、`review_failed`、`test_pending`、`bug_fixing`、`done`

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
openfeel flow review add --op <op-id> --title <title>

# 解决审查条目
openfeel flow review resolve <rev-id>
```

### flow log

查看操作日志。

```bash
openfeel flow log [--last <n>]
```

| 选项 | 说明 |
|------|------|
| `--last <n>` | 显示最近 n 条日志（默认 20） |

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

添加工作阶段。

```bash
openfeel plan stage add <name>
```

| 参数 | 说明 |
|------|------|
| `name` | 阶段名（如 stage-01） |

示例：

```bash
openfeel plan stage add stage-01
```

创建 `stages/stage-01/` 目录，包含 `overview.md` 和 `status.md`。

### plan stage list

列出所有工作阶段。

```bash
openfeel plan stage list
```

输出示例：

```
- stage-01  .openfeel/stages/stage-01/
- stage-02  .openfeel/stages/stage-02/
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

在 `stages/stage-01/ops/` 下创建 `op-001_实现核心功能.md`，按固定模板生成内容（目标、实施步骤、产出文件、自测清单、修正记录），并同步到 `flow.json`。

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

### view add

添加审查条目。

```bash
openfeel view add --op <id> --title <title> [--priority <high|medium|low>]
```

| 选项 | 说明 |
|------|------|
| `--op <id>` | 操作 ID（必填，如 stage-01.op-001） |
| `--title <title>` | 审查标题（必填） |
| `--priority <priority>` | 优先级（high/medium/low，默认 medium） |

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

## update — 更新适配文件

更新 OpenCode 适配文件（Agent 定义和 Skill 文件）。

```bash
openfeel update [path]
```

| 参数 | 说明 |
|------|------|
| `path` | 目标项目路径，默认为当前目录 |
