# OpenFeel 用户入门指南

> 适用版本：**v1.5.5 快照** | 更新日期：2026-10-31 ｜ 命令细节以 `openfeel <cmd> --help` 实时输出为准
>
> ⚠️ 本文示例命令 `openfeel <cmd>` 为**安装后的一般使用者用法**；若在**本仓库源码**中开发/执行，请改用 `node bin/openfeel.js <cmd>`（全局 `openfeel` 可能命中旧版，请以 `openfeel --version` 实测为准）。

## 1. 简介

OpenFeel 是一款 **AI Agent 开发流程治理 CLI 工具**——通过三层计划（大计划/小计划/操作方案）与流水线阶段机（计划→方案→执行→审查→测试→归档），让多个 AI Agent 在统一规则下协作完成软件项目的规划、开发与验收。

## 2. 环境要求

| 依赖 | 最低版本 | 说明 |
|------|:--:|------|
| Node.js | ≥ 20 | 运行时环境（支持 ESM 与 `fetch` 等现代 API） |
| npm | ≥ 10 | 随 Node.js 安装，用于安装与发布 |

检查环境：

```bash
node --version
npm --version
```

## 3. 安装

```bash
npm install -g openfeel
```

安装完成后验证：

```bash
openfeel --version
openfeel --help
```

### 升级后为何需重跑 `setup`

升级流程：

```bash
npm i -g openfeel@latest   # 1. 升级 CLI
openfeel setup             # 2. 重跑部署，刷新全局 AGENTS.md/agents/skills/opencode.jsonc
# 3. 重启 harness（opencode）以加载新的全局配置

# Claude Code 适配器变体（可选，v1.1.6 起）
openfeel setup --tools claude   # 重跑 Claude 部署（~/.claude/）
# 首次创建 ~/.claude/{agents,skills} 后重启会话或 /reload-skills
```

仅 `npm i -g` 不会刷新全局资产，须重跑 `openfeel setup` 并重启 harness。`openfeel setup --check` 可诊断全局部署版本与 CLI 版本是否一致（一致退出 0，否则退出 1）。

### 启用 Claude Code 适配器（可选）

```bash
openfeel setup --tools claude   # 部署 ~/.claude/（与 opencode 并存，默认不启用）
```

- 部署资产到 `~/.claude/`：`CLAUDE.md`（全局约束，用户已有内容 append 不覆盖）、`agents/`（10 个，含 `feel`）、`skills/`（22 个共享源）、`settings.json`（注入 `"agent":"feel"` + `"permissions":{"defaultMode":"auto"}`，用户既有键逐字保留；**无则创建、有则不覆盖**——用户主权键 `model` 不被改写）。
- **升级后**：`npm i -g openfeel@latest` → `openfeel setup --tools claude`；首次创建 `~/.claude/{agents,skills}` 后须**重启会话或 `/reload-skills`**；`CLAUDE.md` 于下次会话生效。仅 `npm i -g` 不刷新全局资产。
- **默认零触**：不带 `--tools` 时 `~/.claude/` 零变化。

### 启用 DSH 适配器（可选，v1.3.0 起）

```bash
npm i -g openfeel@latest      # 单包，已含 dsh/
openfeel setup --tools dsh    # 写入 DSH profile 并部署（可 --dsh-profile web 窄化）
# 重启 DSH 宿主
```

- 写入 `<DSH_HOME>/profiles/<name>/package.json`：`dependencies["openfeel-dsh"] = "link:<openfeelRoot>/dsh"` + `dsh.profile.bundles += "openfeel-dsh"`；依赖变化或链接无效时才执行 `pnpm install`。
- 默认部署全部已检测 profile；`--dsh-profile <name>` 可只改一个。写前备份、幂等重跑、失败回滚；真实 `~/.dsh` 之外的测试请用临时 `DSH_HOME`。
- 与 opencode / Claude Code 并存，默认不部署；升级 CLI 后重启 DSH 即随 `link:` 更新。详见 [dsh/README.md](../dsh/README.md)。
- `openfeel update --tools dsh` 不适用（DSH 是全局部署）。

### 推荐用法：需求驱动 + 快速迭代（fast）

日常开发推荐先发布需求，再用 **fast** 阶段迭代（计划审查 + 代码审查各单轮，跳过 scheme/test）：

```bash
openfeel req add "接入 DSH 适配器" --workflow-mode fast
openfeel req claim REQ-NNN
openfeel plan stage add vX.Y.Z-stage-NN --workflow-mode fast
openfeel req link --stage vX.Y.Z-stage-NN --requirement REQ-NNN
openfeel flow next
```

- 大改动 / 架构变更用 `full`（完整六关）；零散任务可用需求级 `general`；不要默认推荐 `full`。
- 需求关联阶段后，全部阶段 done 时自动收口需求。

### 工作流模式（full / fast）与自动推进（v1.1.7 起）

自 v1.1.7 起支持两种工作流模式（**阶段级生效**，项目级默认记忆于 `config.yaml` 的 `defaults.workflow_mode`）：

- **full**：完整流水线（15 个 phase，含方案与测试环节）。
- **fast**（新部署默认）：快线链 `plan_pending → plan_review → plan_passed → exec_running → review_pending → review_passed → archiving → done`——跳过 6 项（`scheme_*` / `test_*`），**计划审查与代码审查保留单轮**（`review_failed` 可回环重试）。

> **v1.2.1 起**：模式值域扩为三值 `full / fast / general`；新增的 `general`（无流水线）**仅需求级合法**——阶段级 / 部署级写入面会拒绝。三模式选择与升级约束见下「**v1.2.1 能力速览**」。

选择与查看：

```bash
openfeel plan stage add stage-01 --workflow-mode fast   # 新建阶段时指定（写入项目默认记忆）
openfeel stage set stage-01 --workflow-mode full        # 单阶段切回完整流程
openfeel config set defaults.workflow_mode full         # 项目默认（后续新建阶段沿用）
openfeel flow mode [--stage stage-01] [--json]          # 查看当前模式与来源（只读）
openfeel flow phases --mode fast                        # 按指定模式查看转移表
```

> **默认自动推进开启（v1.1.7 起）**：新部署的 `config.yaml` 默认 `auto_advance: enabled`；如需关闭，执行 `openfeel config set auto_advance disabled`，或在创建阶段时显式传 `--auto-advance disabled`。

> **fast 模式修复（v1.3.3）**：① `plan stage add` 后自动聚焦活跃阶段（`flow next` 无需再 `advance`）；② fast 新增返工边 `review_passed → exec_running`（`flow advance --reason "<整改原因>"` 记审计），审查通过后发现问题可直接返工，不再需要 `reset` / `--force`；③ 无 op 的 fast 阶段可用 `flow review add --stage <id>` 挂阶段级 REV；④ 写入门禁按风险分层——空工作区的**新增文件**、`docs/**` 与文档类扩展在非执行相位也可写（源码仍要求 `exec_running`）；⑤ `execution_mode=auto` + `auto_advance=disabled` 的静默无效组合会在 `flow advance` / `flow next` 告警；⑥ `flow advance` 回显本次生效的审查档位。

> **分发链路修复（v1.3.4）**：升级 CLI 后请执行 `openfeel setup` 刷新部署标记，然后**完全退出并重启 harness**（重载后端不替换 host module）。若 `openfeel setup --check` 返回 `restart-required`，说明文件已新、宿主仍是旧模块——**重启宿主即可，不要重复 setup**。DSH 用户：`feel_flow action=review_add --stage <id>` 现已可用。

> **命令执行工具（v1.3.5）**：Agent 运行 shell 命令时，**Windows 下优先 `bash`（Git Bash），其次 `pwsh`（PowerShell 7）**；macOS / Linux 用 `bash`；默认不用 `cmd.exe`；同一任务内保持同一 shell，路径与转义按该 shell 书写。

> **微变更（v1.4.0）**：静态展示资源（`.css/.scss/.html/.svg/.png/.jpg/.jpeg/.webp`、`assets/**`、`public/**`）在任意相位可直接写；需要改源码的微调在**无活跃阶段**时用 `openfeel chore "<说明>"` 开启 60 分钟写窗口，`openfeel chore --end` 收口（不建阶段）。源码阶段门禁、`flow.json` / `status.md` 保护、混合目标从严均不变。

> **状态与记录（v1.5.0）**：只有 Feel 写状态；子 agent 不读写 `dev_last*` / `current.md` / `status.md` / `flow.json`。日志不强制（`flow.json.log` 由 CLI 维护，最近 200 条）。`dev_last.md` 的简要状态由 `openfeel dev sync` 维护：`flow advance` 在开始 / 转折 / 结束或每 30 分钟自动同步；`openfeel dev status` 可查看是否到期。

> **派发与恢复（v1.5.3）**：派发子 agent 用 `feel_next.dispatch`（goal/context/boundaries/returnFormat），子 agent 不读写状态文件、返回 ≤10 行；新会话用 `feel_status.recovery` 一次拿到 lastTransition + 交接摘要 + nextAction。发布采用批次制：小功能合并，完成全门禁后统一发布。

> **存量项目升级迁移（v1.1.7 起）**：若项目 `config.yaml` 未设置 `defaults.workflow_mode`（v1.1.7 之前创建的项目），升级后**新建阶段的骨架初值回落内置默认 `fast`**；既有阶段的 `status.md` 若无「工作流模式」字段，其模式解析同样按级联回落 `fast`（无感行为变更）。希望保持完整流程的存量项目，建议执行：
>
> ```bash
> openfeel config set defaults.workflow_mode full   # 项目级默认；新建与无字段阶段一并回落 full
> ```

### v1.2.0 升级说明（存量为零迁移）

v1.2.0 新增 `requirements`（需求）与 `archived_versions`（版本归档索引）字段。**存量项目零迁移**：

- 旧 `flow.json`（不含 `requirements` / `archived_versions`）在全部命令下**零报错**，缺失字段按回落语义处理，升级**无需任何迁移动作**。
- 版本归档按需执行：版本收官（该版本全部阶段 done 且无 blocking open REV）后，运行 `openfeel flow archive <version>`；建议先 `--dry-run` 预览（零写盘）。

## 4. 初始化项目

在项目根目录（或空目录）中初始化 OpenFeel 工作区：

```bash
openfeel init
```

也可以在指定目录初始化：

```bash
openfeel init ./my-agent-project
```

初始化会创建 `.openfeel/` **核心目录**（`plan/` / `kb/` / `dev/` / `log/`，含 `dev/note` 与 `dev/current_archive`）、流水线状态文件（`flow.json`）、配置（`config.yaml`）与开发/知识库模板。**v1.3.3 起目录惰性化**：`code_review/` / `bugs/` / `users/` / `tmp/` / `manual/` / `update_conflicts/` 在首次使用时按需创建，不再产生冷启动前置开销。

## 5. 基本工作流

### 5.1 查看流水线状态

```bash
openfeel flow status
```

输出当前所处的阶段（phase）：`plan_pending → plan_review → plan_passed → scheme_pending → scheme_review → scheme_passed → exec_running → review_pending → review_passed → test_pending → test_passed → archiving → done`（fast 工作流快线下为快线链，见「工作流模式」小节）。

### 5.2 创建计划

先创建分期大纲（版本），再添加工作阶段，最后为阶段创建操作方案：

```bash
# 创建分期大纲
openfeel roadmap create v1.0

# 添加工作阶段
openfeel plan stage add stage-01

# 为阶段创建操作方案（自动生成 op-001 模板）
openfeel plan scheme create stage-01 "实现核心功能"
```

### 5.3 推进阶段

操作方案经审查通过后，由 Feel 总统领（或人工）通过 `openfeel flow` 命令推进流水线：

```bash
# 推进到指定阶段
openfeel flow advance --stage v1.0.0-stage-01 --op v1.0.0-stage-01.op-001 --to exec_running

# 查看当前阶段与操作
openfeel flow current
```

### 5.4 常见辅助操作

```bash
# 查看计划阶段列表
openfeel plan stage list

# 查看知识库索引
openfeel knowledge index

# 项目健康检查（i18n 键一致性、kb 引用有效性）
openfeel lint
```

### 5.5 版本归档（flow archive）

版本收官（该版本**全部阶段 done** 且**无 blocking open REV**）后，可将已完成版本从活跃 `flow.json` 分片归档：

```bash
openfeel flow archive v1.1.7 --dry-run      # 预览（判据门照常校验；零写盘）
openfeel flow archive v1.1.7                # 执行归档（判据门；不设 --force）
openfeel flow archive list                  # 列举已归档版本（只读）
openfeel flow archive show v1.1.7 [--json]  # 查看指定归档版本（只读）
```

归档落点 `.openfeel/flow-archive/{version}.json`。**与顶层 `openfeel archive <stage>`（阶段摘要归档）区分**：二者职责不同——`flow archive` 是 flow.json 版本分片归档，`openfeel archive <stage>` 是阶段摘要归档；常规命令不读 `.openfeel/flow-archive/**`（`flow health` 仅目录清单级对账）。

### 5.6 需求流转（openfeel req）

需求是**排期与调度层**——**需求 ≠ 计划**，需求进度由关联阶段聚合，实现仍走流水线。最小闭环：

```bash
openfeel req add "支持多 harness" --target-version v1.3.0        # 新建需求（ID 自动分配）
openfeel req claim REQ-001 --owner feel                          # 认领（owner + claimed_at 占用校验）
openfeel req link --stage v1.2.0-stage-85 --requirement REQ-001  # 关联阶段
openfeel req board                                               # 看板视图（7 组固定顺序）
```

需求 7 状态（`draft` / `scheduled` / `in_progress` / `done` / `blocked` / `cancelled` / `rejected`）；**全部关联阶段 done 时需求自动收口**。用法权威源见 `openfeel-req` skill。

## v1.2.4 修复速览（补丁）

> 对应阶段 stage-100（DSH ACTION-GUIDE A1~A5 收口）。JSON 契约升级为 **40 成功出口 / 41 注册选项**；退出码 0/1/2/3 语义不变；本仓收口基线 **75 文件 / 21 阶段**。

- **A1 归档覆盖保护（数据安全，P1）**：`openfeel archive <stage>` 对已有归档默认拒绝（`ARCHIVE_EXISTS`/refusal/1，零写盘）；显式 `--force` 才覆盖。
- **A2~A4 新增 `--json`（P1/P2）**：`plan stage list`（#34）、`model list|get`（#35/#36）、`flow retry`（#37）、`lint i18n|kb`（#38/#39）、`roadmap show`（#40）。
- **A5 `config get --all --json`（P2）**：项目模式一次取全量 `defaults` 四键，不再报 `key-required`。
- **契约**：错误码表 13 行（新增 `ARCHIVE_EXISTS`）；既有出口与人类输出零回归。

## v1.2.3 修复速览

> 对应阶段 stage-99（补丁版本：v1.2.2 转出项收口）。不新增功能；33 成功出口 / 34 注册选项契约与退出码语义不变。本仓收口基线 **75 文件 / 1911 用例 / 21 阶段**。

- **并发 JSON 退出统一**：并发冲突在 JSON 模式输出单个 `FLOW_CONCURRENT_CONFLICT`（refusal）envelope 后置 `process.exitCode=2` 返回；非 JSON 模式 stderr 文案与 `process.exit(2)` 不变。
- **`--review-tier` help 订正**：`flow advance --help` 现为「缺省=full（零裁剪）」；`flow phases --json.reviewTier` 仍是按模式派生的展示值。
- **`req` 过滤单点化**：`req show` / `req set --workflow-mode` 复用 `listLinkedStages`，输出不变。
- **锁超时 E2E 测试钩子（test-only）**：仅 `OPENFEEL_TEST_MODE=1` 生效；生产默认不变；锁等待超时稳定归 `INTERNAL_ERROR/internal/3`。

## v1.2.2 能力速览

> 对应阶段 stage-95 ~ 98。以下能力**v1.2.2 起提供**；JSON 契约单一权威见 [json-contract.md](json-contract.md)（33 个成功出口 / 34 个注册选项；本仓收口基线 74 文件 / 1894 用例 / 21 阶段）。完整命令/参数细节以 `openfeel <cmd> --help` 实时输出为准。

**① 决策权威（`flow next`，只读）**——12 键固定序，适配器不再镜像 phase→agent 映射：

```bash
openfeel flow next --json
```

```json
{
  "schemaVersion": 1,
  "stage": "v1.2.2-stage-98",
  "phase": "exec_running",
  "responsibleAgent": "openfeel-executor",
  "legalNextPhases": ["review_pending"],
  "suggestedCommand": "openfeel flow advance --stage v1.2.2-stage-98 --to review_pending",
  "guards": []
}
```

（示例为截取；完整 12 键见契约 §12.1。`responsibleAgent` 与 `mapPhaseToAgent` 同源；`legalNextPhases` 每个元素均被 `flow advance` 接受。）

**② 多项目（全局 `--project`）**——语义等效 cwd，前置/后置/`=` 形态均可：

```bash
openfeel --project ../projB flow status --json
openfeel flow status --json --project ../projB
```

命令输出语言按**目标项目**解析；`--log-file` 相对路径按**原始 cwd** 解析；`--help` 语言在 chdir 前求值（按原始 cwd）。

**③ 读命令 JSON**——13 个命令面新增 `--json`，统一单文档 + `schemaVersion` 首键，可选字段缺省 `null`：

```bash
openfeel flow status --json
openfeel stage status v1.2.2-stage-98 --json
```

**④ 错误封装**——失败路径输出机器可读 envelope；退出码 0/1/2/3：

```json
{
  "schemaVersion": 1,
  "error": {
    "code": "PHASE_TRANSITION_ILLEGAL",
    "kind": "refusal",
    "message": "……",
    "detail": null
  }
}
```

退出码：`0` 成功 / `1` 预期拒绝 / `2` 并发冲突 / `3` 内部错误（v1.2.2 新增）。legacy 形态保留 `error` 为 string，仅在末尾追加 `errorKind`；判别唯一规则 `typeof doc.error === 'string'`。

**⑤ 档位语义订正（`--review-tier`）**——`flow advance` 未显式传 `--review-tier` 时**生效档位恒 `full`**；**展示值**按模式派生（`flow phases --json.reviewTier` / `displayReviewTier`）；`effectiveReviewTier` 三处（`flow next` / `flow status.stages[]` / `flow phases`）恒为 `full`。源码 help 文案已于 v1.2.3 订正为「缺省=full（零裁剪）」。

**⑥ 升级兼容**——存量 `flow.json` 零迁移零注入；既有 19 个成功出口字段零破坏（只增不改）；人类输出逐字不变；退出码 0/1/2 语义不变、3 仅新增。

## v1.2.1 能力速览

> 对应阶段 stage-86 ~ 93 + 94（94 = 表外补阶段）。完整命令/参数细节以 `openfeel <cmd> --help` 实时输出为准；能力名叙述权威源见 `openfeel-cli-usage` skill。

**① 需求接取与拆分（`req split`）**——拆分即发布（子需求一次入 `scheduled`）：

```bash
openfeel req add "重构日志层"
openfeel req split REQ-001 --into "抽取日志接口" --into "替换调用点"   # --into 可重复
openfeel req claim REQ-002 --owner alice                            # 并行接取：claim 互不阻塞
```

`parent_id` 仅溯源（不入聚合 / 不入 done 门）；`target_version` 为纯展示 / 过滤 / 排序维度（**需求与版本解绑**）。

**② 三模式选择（`--workflow-mode`）**——`full` / `fast` / `general`；**`general`（无流水线）仅需求级合法**：

```bash
openfeel req add "调研任务" --workflow-mode general   # 需求级：无流水线
openfeel req advance REQ-003 --to done               # general 需求可显式完成（载体制对偶完成路径）
openfeel stage set stage-01 --workflow-mode full     # 阶段级：仅 full / fast
```

**③ 审查档位（`--review-tier`）**——与工作流模式正交；`flow advance` 缺省**生效档位**恒 `full`（展示值按模式派生）：

```bash
openfeel flow advance --stage stage-01 --to plan_passed --review-tier skip
```

`full`（零裁剪）/ `lean`（裁 `scheme_review`）/ `skip`（裁 `plan_review` + `scheme_review`）；代码审查关 / 测试关 / 归档关恒保留；显式 `lean` / `skip` 打印一行非阻断警告。裁剪**只作用于入边 / 目标侧**——阶段恰停于被裁剪相位时仍可向其下游推进，「**进入**被裁剪关」仍不可达。

**④ 通用工作者与探索者**——通用模式下可**直接调度**任意 Agent 的执行任务；调研 / 探索类任务由只读 agent `openfeel-explorer` 承接（Read / Glob / Grep / Bash，不产出源码变更）。

**⑤ 升级指引**——存量 `flow.json` **零报错零迁移**；部署**非破坏性**：用户既有键**逐字保留**，用户主权键 `model` **无则创建、有则不覆盖**。升级：`npm i -g openfeel@latest` → `openfeel setup --tools claude`（`~/.claude` 面）或 `openfeel update <path>`（项目面）。

## 6. 命令速查表

| 命令 | 说明 |
|------|------|
| `openfeel init [path]` | 初始化项目工作区，创建 `.openfeel/` 目录结构与配置文件 |
| `openfeel flow` | 流水线状态管理（`status`/`current`/`advance`/`attempt`/`log`/`next` 等；`advance` 支持 `--review-tier <full|lean|skip>`） |
| `openfeel flow next [--json]` | 当前阶段调度决策（负责 Agent / 合法下一相位 / 建议命令 / 守卫 / 阻塞 REV；只读，**v1.2.2 起**） |
| `openfeel flow mode` | 查看当前阶段的工作流模式与来源（只读，支持 `--stage` / `--json`） |
| `openfeel plan` | 计划管理（`stage add/list`、`scheme create/list`） |
| `openfeel view` | 审查条目管理（`list`/`add`/`accept`） |
| `openfeel archive <stage>` | 归档指定阶段（汇总产出、生成摘要、提取知识）（**阶段摘要归档**；支持 `--json`，v1.2.2 起） |
| `openfeel flow archive` | flow.json 版本分片归档（`<version>` / `list` / `show`；与 `openfeel archive` 阶段摘要归档区分） |
| `openfeel req` | 需求流转（`add`/`list`/`show`/`claim`/`release`/`set`/`link`/`advance`/`split`/`board`/`next`，共 11 子命令） |
| `openfeel roadmap` | 分期大纲管理（`create`/`show`） |
| `openfeel instructions <artifactId>` | 生成结构化指令（XML 或 JSON） |
| `openfeel update [path] [--tools <list>]` | 部署 OpenFeel 适配文件到目标项目；`--tools dsh` 不适用（v1.3.0，请用 `setup`） |
| `openfeel setup [--check] [--tools <list>] [--dsh-profile <name>]` | 部署全局框架配置；`--check [--json]` 只读诊断全局部署与 CLI 版本一致性；`--tools dsh` 部署 DSH profile（v1.3.0） |
| `openfeel knowledge` | 知识库管理（`list`/`add`/`search`/`index`/`dedup`；读命令支持 `--json`） |
| `openfeel stage` | 工作阶段状态管理（status.md 原子操作；`status` 支持 `--json`） |
| `openfeel project` | 项目管理与概览（`overview` 支持 `--json`） |
| `openfeel config` | 配置管理（`get`/`set`，支持 `--global`；`get`/`effective` 支持 `--json`） |
| `openfeel lint` | 项目健康检查（i18n 键一致性、kb 引用有效性） |
| `openfeel -v, --version` | 输出版本号（`--version --json` / `-v --json` → `{schemaVersion:1,version,node}`，v1.2.2 起） |
| `openfeel -h, --help` | 显示命令帮助信息 |
| 全局选项 `--project <path>` | 以指定目录为项目上下文（语义等效 cwd；v1.2.2 起） |

## 相关文档

- [命令参考](commands.md) — CLI 命令详细用法
- 框架行为约束 — 由 `openfeel setup` 部署到全局（见 README）
- [文档索引](index.md) — 设计文档与研发分期归档
- [变更日志](../CHANGELOG.md) — 版本历史与重要变更
