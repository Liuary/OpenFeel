# op-001 判定表 — 平台能力核验（T1）

> 阶段：v1.2.1-stage-88（通用工作者直接调度 · 主题二） ｜ 执行 Agent：openfeel-executor
> 执行时间：2026-10-15 03:38 ~ 04:05 ｜ 基线 HEAD：`a207a309df120a6fe1c5f7bbdcf48a443137a22f`
> 本 op 为**纯核验 op**（零 `src/` 改动）；本报告随 op-003 的精确 `git add` 纳入版本管理。

## 结论速览（供 op-002 / op-003 直接引用）

- **opencode 侧嵌套 task：no-go（默认配置下）** —— 静态 permission 非 deny，但行为级三要素之①「子 agent 成功调起下一级会话」**失败**：平台默认 `subagent_depth = 1` 直接拦截。
- **补充发现（重要）：能力实际可用**——隔离配置仅增设 `"subagent_depth": 3`，同一探针**完整跑通二级嵌套链路**（3 个嵌套会话 ID 实证、零 depth 报错）。
- **降级红线：触发**（按计划 1.8 判据「其余一律 no-go」）。降级条件 ①「保留 permission 扩展为未来能力留门」由本 op 由**实测证据**支撑（非推测留门）。
- **Claude 侧 Q1：推翻（不成立，有行为级证据）** —— Claude Code 2.1.300 下，`tools` 白名单含 `Task` 的 subagent **可以**派发下一级 subagent（`spawnDepth: 2` 实证）。运行时该工具名为 `Agent`；阴性对照证明 `Task` 为唯一使能项。
- **Handoff 通道证据等级**：① 静态在位 = **已实测**（4 份 feel 模板，file:line 见 §8）；② 行为级 = **未实测（未触发）**，归主会话（Feel）在 op-003 补录。

---

## §1 三要素头（命令 + 版本 + 环境）

| 项 | 实测值 |
|------|--------|
| 采集命令 | `opencode --version` / `claude --version` / `uname -a` / `node --version` |
| opencode 版本 | **1.18.35** |
| Claude 版本 | **2.1.300 (Claude Code)** |
| Node | v24.18.1 |
| OS / Shell | `MINGW64_NT-10.0-26300 LiuarySZ 3.6.9-b4195d69.x86_64 2026-06-06 17:49 UTC x86_64 Msys` ｜ Git Bash `5.3.15(1)-release`（宿主 PowerShell 会话内的 POSIX 子壳） |
| 隔离路径 | `%TEMP%\openfeel-oc-verify\`（含 `home` / `home-ctrl` / `claude-home` / `scratch*`）——**用后整体删除** |
| 真实 HOME | `/c/Users/Liuary`（`USERPROFILE=C:\Users\Liuary`） |

> 与方案期「背景锚点」一致：opencode 1.18.35、claude 2.1.300，`debug paths` / `debug agent` / `run [message..] --agent <name>` / `run --format json` 子命令均实测在位。

## §2 基线快照与零污染对照面（1.1）

采集命令：`cd ~/.config/opencode/agents && sha256sum *.md | sort`

| # | 文件 | sha256（执行前 = 执行后） |
|---|------|--------------------------|
| 1 | `feel.md` | `a30dac9474ad1969cb379354c0a8fefc18646ce2cc98adb83a54c9279421eaed` |
| 2 | `openfeel-archiver.md` | `636631f1f86cbf784f4f165b195b2d6dd68299ba74bb21e7cd8723129db84c22` |
| 3 | `openfeel-executor.md` | `0330451fc1bf34a6fbfecfe7bbd5109b9e36168171a6b89ebadfd0d8cc6a138d` |
| 4 | `openfeel-feel-tester.md` | `36cca631a5f91080c36cd2fe44b2a08701c0bfc9f64003da618476934f96ea6e` |
| 5 | `openfeel-planner.md` | `b7090b109e7c3c7eff10c469a1b331e596977e15fddfa43fb61428d312736a88` |
| 6 | `openfeel-reviewer.md` | `7dfa7c3ef948323d8f7548db5ae87c5ac17651ef8d90cb1dc7f4d436d42ac673` |
| 7 | `openfeel-schemer.md` | `057aa40fc0478b8c2f18464bc392732cd9117ff62570c8b8e3c26969d9f93b17` |
| 8 | `openfeel-utility.md` | `c28bd0084f4d6067018ca736f608127148b3c816325ada3fa47e5e7ad8f55ad5` |
| 9 | `openfeel-vision.md` | `324199ab5d08c0f47d8ff51cdb2f44b59dec4549903bb75fc9eb8dea83b1fff9` |

- 文件数：**9**（执行前 / 执行后一致）
- `~/.config/opencode/agents` 目录 mtime：`2026-10-13 22:49:20.281060400 +0800`（前后一致）
- `~/.config/opencode` 目录 mtime：`2026-10-13 22:49:20.336993600 +0800`（前后一致）
- max file mtime：`feel.md` `2026-10-13 22:49:20.256269700`（前后一致）
- `~/.openfeel/` 文件数：**111**（前后一致）；max mtime：`2026-10-15 03:38:57.678532600`（前后一致）
- 认证文件：`~/.local/share/opencode/auth.json`（284 B，mtime `2026-08-09 19:42:06.789130500`，**未回写**）；键名 `deepseek` / `alibaba-cn` / `zhipuai`（**仅记录键名，未打印任何 token / 凭证明文**）

## §3 隔离 HOME 双设与生效断言（1.2）

采集命令：`export HOME=...; export USERPROFILE=...; opencode debug paths`

```
home       C:\Users\Liuary\AppData\Local\Temp\openfeel-oc-verify\home
data       C:\Users\Liuary\AppData\Local\Temp\openfeel-oc-verify\home\.local\share\opencode
bin        C:\Users\Liuary\AppData\Local\Temp\openfeel-oc-verify\home\.cache\opencode\bin
log        C:\Users\Liuary\AppData\Local\Temp\openfeel-oc-verify\home\.local\share\opencode\log
repos      C:\Users\Liuary\AppData\Local\Temp\openfeel-oc-verify\home\.local\share\opencode\repos
cache      C:\Users\Liuary\AppData\Local\Temp\openfeel-oc-verify\home\.cache\opencode
config     C:\Users\Liuary\AppData\Local\Temp\openfeel-oc-verify\home\.config\opencode
state      C:\Users\Liuary\AppData\Local\Temp\openfeel-oc-verify\home\.local\state\opencode
tmp        C:\Users\Liuary\AppData\Local\Temp\opencode
```

**断言结论：隔离生效**。`home` / `data` / `config` / `state` 四路径**全部**指向隔离目录；**无** `config dir mismatch`；无任一路径指向真实 HOME。（`tmp` 为固定共享路径，与 config/state 无关，非断言项。）未使用 `setx`，仅当前 shell 会话内导出（子进程继承）。

## §4 fixture 取源方式（1.3）

- **取源方式 = op-002 之前的手工副本**（本 op 先于 op-002 执行）。
- 来源：仓库源副本 `src/core/templates-data/opencode/agents/zh-CN/*.md`（方案期背景锚点确认实际部署位为 zh-CN 基线：部署 `feel.md` 31063 B ≈ 源 31036 B）。
- 改造：在**隔离目录内**对 6 份 subagent 手工插入 `  task: "allow"`（紧跟既有 `grep: "allow"` 行之后）；`feel` / `openfeel-executor` / `openfeel-feel-tester` 原样复制。
- **仓库内 `src/core/templates-data` 零改动**：本 op 全程 `git status --porcelain src/` 输出为空（已实测）。
- 认证副本 `auth.json` 复制入隔离 `data` 目录（284 B）；**未复制 `opencode.db`（20 GB）**——隔离环境不复用真实会话库。
- 另建阴性对照组 `home-ctrl`：**未改造**模板（无 `task` 键），用于静态/行为对照。

## §5 静态 ruleset 复核与工具局限登记（1.4）

采集命令：`opencode debug agent openfeel-planner`（另抽 `openfeel-schemer` / `openfeel-reviewer`）

| 组 | ruleset 中 `task` permission 条目 | effective tools 中 `task` |
|---|---|---|
| 隔离 fixture（含 `task: "allow"`） | `{ "permission": "task", "action": "allow", "pattern": "*" }` **在位，值非 deny** | `true` |
| 阴性对照（无 `task` 键） | **无 task permission 条目**（落到顶层通配 `*`） | `true` |

- planner / schemer / reviewer 三份**均**出现显式 `task: allow` 条目（`openfeel-schemer` / `openfeel-reviewer` 同款，见 `ruleset-planner-task.txt`）。
- **工具局限登记（硬性）**：`debug agent` **对 `ask` 自动放行、仅强制 `deny`** → **不可**据此判 allow / ask。
- **本 op 追加登记（方案期未预见）**：`debug agent` 输出的 `tools` 段中 `task: true` 在**对照组同样为 true** → 该字段是「工具是否注册」而非「是否授权」，**不可**作为授权判据。两组唯一可辨识差异是 `permission` 数组中的显式 `task` 条目。**此发现印证「静态证据不足以定案」——必须由 §6 行为级判别裁决。**

## §6 行为级判别（1.5，权威判据）

### 6.1 探针 A —— `--agent <subagent>` 直驱（失败，方法学否定）

命令：`opencode run --agent openfeel-planner --format json "<探针 prompt>"`

原始输出首行：

```
!  agent "openfeel-planner" is a subagent, not a primary agent. Falling back to default agent
```

- **方法学结论**：opencode 中 subagent **不能**作为 primary 运行，`--agent <subagent>` 会**静默回退到默认 agent**（`feel`）。该次运行实际由 `feel` 执行，仅证明了 **1 级**调度（feel → executor），**不构成嵌套证据**。本项**主动排除**，不计入判定。

### 6.2 探针 B —— 二级嵌套（默认配置；判定依据）

命令：`opencode run --format json "<要求 feel 派发 planner，并要求 planner 派发 executor>"`（非 TTY；**未使用 `--auto`**）

顶部会话实际 tool_use：

```
tool=task | subagent_type=openfeel-planner | status=completed
  parentSessionId=ses_ec40eeb40ffedw0EJaXv9uFksH | childSessionId=ses_ec40edec9ffe575kiKJLMxFKxQ
  model={"modelID":"deepseek-v4-pro","providerID":"deepseek"}
```

planner 回传的 `task_result`（逐字）：

```
Subagent depth limit reached (1). Increase "subagent_depth" to allow nested subagents.
```

**三要素判定（默认配置）**：

| # | 判定要素 | 结果 | 依据 |
|---|---------|:----:|------|
| ① | 子 agent 是否成功**调起下一级会话** | **❌ 失败** | `Subagent depth limit reached (1)`；planner 内**未**创建 executor 子会话 |
| ② | 目标 agent 是否**被正确指定** | **✅ 达成** | 探针指定的 `openfeel-executor` 被平台正确解析（已进入深度校验环节）；planner 会话 `ses_ec40edec9ffe575kiKJLMxFKxQ` 以 `deepseek-v4-pro`（planner 模型）运行 |
| ③ | 结果是否**回传父会话** | **✅ 达成**（回传的是**错误对象**，非嵌套执行结果） | 错误信息经 planner → feel 逐级回传并最终输出 |

> REV-88-007 观察 3 已吸收：Q13 四项观察结果**直接作为②的达成依据**，避免「Q13 未决 ⇒ 机械 no-go」误判。

**Q13 四项观察**：

| 观察项 | 实测结果 |
|--------|---------|
| 是否创建子会话 | ✅ feel → planner 子会话创建成功（`ses_ec40edec9ffe575kiKJLMxFKxQ`）；planner → executor 子会话**被深度限制拦截，未创建** |
| permission 是否继承 | 无法观察（在深度校验处即被拦截，未进入子会话构建）；planner 子会话正确继承其自身 agent 定义（模型 `deepseek-v4-pro`） |
| **递归深度限制或挂起** | **存在硬限制：默认 `subagent_depth = 1`；无挂起**（错误即时返回）——正对应计划 Q13「若存在深度限制 → 如实标注，属可接受结果」 |
| 目标指定方式 | 经 `task` 工具的 `subagent_type` 字段**按名称**指定 |

### 6.3 探针 C —— 补充：深度提升后能力验证（方案外加测；判定不影响）

在**隔离配置**（`%TEMP%\...\home\.config\opencode\opencode.jsonc`）中仅增设一行 `"subagent_depth": 3`，重跑同一探针：

- 顶层返回：`nested-task-probe-4`（探针字符串**逐字回传**）
- 顶级 tool_use：`task | subagent_type=openfeel-planner | status=completed`，child `ses_ec407f320ffeXRpB0CnTd8mI1Y`
- **日志中出现的会话 ID 共 3 个**（三级会话链实证）：
  - `ses_ec408013affebI89iH5uJffKJN`（顶层 feel 会话）
  - `ses_ec407f320ffeXRpB0CnTd8mI1Y`（planner 子会话）
  - `ses_ec407ed65ffe5YI5cPxpsINOAL`（**executor 孙会话**）
- `depth limit` 报错出现次数：**0**

**结论**：permission `task: "allow"` 扩展**是必要且有效的**；唯一阻塞项是平台默认深度阈值 `subagent_depth`。默认配置下 **no-go** 成立；深度 ≥ 2 时 **go**。此证据使降级条件 ①「为未来平台能力留门」由推测升级为**实测支撑**。

> 说明：探针 C 为方案外**加测**，用于强化 §9 的降级依据与 §10 的复核触发条件，**不参与 1.8 的 go/no-go 判据**（判据锚定默认配置）。

## §7 零污染核对（1.6，逐项）

采集：删除隔离目录 `%TEMP%\openfeel-oc-verify\`（整体）后，于真实 HOME 重跑 §2 对照面。

| 核对项 | 执行前 | 执行后 | 结论 |
|--------|--------|--------|:----:|
| `~/.config/opencode/agents` 文件数 | 9 | 9 | ✅ |
| 9 文件 sha256 逐项 | （§2 表） | **完全相同**（`diff` 空） | ✅ |
| `agents` 目录 mtime | `2026-10-13 22:49:20.281060400` | 同 | ✅ |
| `~/.config/opencode` 目录 mtime | `2026-10-13 22:49:20.336993600` | 同 | ✅ |
| max file mtime（`feel.md`） | `2026-10-13 22:49:20.256269700` | 同 | ✅ |
| `~/.openfeel/` 文件数 | 111 | 111 | ✅ |
| `~/.openfeel/` max mtime | `2026-10-15 03:38:57.678532600` | 同 | ✅ |
| `auth.json` mtime / 内容 | `2026-08-09 19:42:06.789130500` | 同（未回写） | ✅ |
| 隔离目录 `%TEMP%\openfeel-oc-verify\` | 存在 | **已删除** | ✅ |
| 真实全局目录写操作 | — | **零次**（全程仅读） | ✅ |
| 认证文件外传 / 打印 | — | **零次**（仅记录键名与 mtime） | ✅ |

**零污染断言成立。**

## §8 Claude 侧 Q1 复核 + Handoff 通道证据分级（1.7）

### 8.1 Q1 复核 —— 结论：**推翻**（有行为级证据）

隔离方式：`CLAUDE_CONFIG_DIR=%TEMP%\openfeel-oc-verify\claude-home`（铺放 agents 9 份 + `CLAUDE.md` + `settings.json` + 探针 fixture）；**未隔离 HOME**（`~/.claude.json` 认证仍在位，故可正常派发，非「未实测（环境限制）」）。`claude --version` = 2.1.300。

**探针组（三组对照）**：

| 组 | subagent `tools` 白名单 | 实测结果 | 关键证据 |
|---|---|---------|---------|
| **q1-probe**（正向） | `Bash, Read, Task` | **成功派发下一级** | 转录 `agent-a1c88a595fe7c7fd9.meta.json`: `{"agentType":"q1-probe","spawnDepth":1}`；`agent-a06ba84648f7400a5.meta.json`: `{"agentType":"openfeel-executor","parentAgentId":"a1c88a595fe7c7fd9","spawnDepth":**2**}` |
| **q1-ctrl**（阴性①） | `Read`（无 `Task`） | **Task 不可用**，未派发 | 自报可用工具 = `Read`、`SubagentHandback` |
| **q1-ctrl2**（阴性②，隔离 `Task` 使能项） | `Read, Bash`（无 `Task`） | **Task 不可用**，未派发 | 自报可用工具 = `Read`、`Bash`、`SubagentHandback` |

- q1-probe 转录中的实际调用（逐字）：
  `TOOL_USE: Agent {"subagent_type":"openfeel-executor", "prompt":"Output exactly the string: q1-nested-probe ...", "run_in_background":false}`
- 对照组证明 **`tools` 白名单真实生效**（未列出即不可用）→ q1-probe 的派发能力**只能**归因于白名单中的 `Task`。

**结论（三态之一：推翻）**：

> **Q1「subagent 不可调 Task」在 Claude Code 2.1.300 下已不成立。** `tools` 白名单显式含 `Task` 的 subagent **可以**派发下一级 subagent，平台侧生成 `spawnDepth: 2` 的子代理并正确设置 `parentAgentId`。
> **重要细节**：运行时该工具名为 **`Agent`**（非 `Task`）；白名单令牌 `Task` 仍能授予该工具。故「subagent 不调用 Task」类表述的**事实面**需按 2.1.300 重述。

**残留风险（须一并登记）**：本次未区分「`Task` 是官方别名」与「`Task` 为可接受的旧令牌」；亦未测深度上限（仅观测到 2 级成功）。二者均留待后续阶段复核。

> **本 op 零模板改动**：Q1 结论仅入报告，**不改 claude 侧任何 `tools` 白名单**——op-002 边界（Q15 裁定「不加 Task」）在本阶段**继续有效**，本 op 不越界。该结论供 op-003 终局报告 §1 登记为「平台事实订正项」，其模板落法归后续阶段。

### 8.2 Handoff 通道证据分级（硬性）

**① 静态在位 —— 已实测**（本 op 完成）。4 份 feel 模板逐份核对：

| 模板 | 节标题 | `[HANDOFF: {agent_name}]` 解析行 | 4 步列表 | 「可用 Handoff 目标」表 |
|------|:----:|:----:|:----:|:----:|
| `opencode/agents/zh-CN/feel.md` | `### Handoff 委派机制` **:109** | **:111** | :113-116 | **:118-124** |
| `opencode/agents/en/feel.md` | `### Handoff Delegation Mechanism` **:109** | **:111** | :113-116 | **:118-124** |
| `claude/agents/zh-CN/feel.md` | `### Handoff 委派机制` **:100** | **:102** | :104-107 | **:109-115** |
| `claude/agents/en/feel.md` | `### Handoff Delegation Mechanism` **:100** | **:102** | :104-107 | **:109-115** |

- 4 步机制逐份在位：解析标记 → 用 task/Task 工具调度目标 → 结果回传 → 记录日志；目标表各 4 行在位。
- **行号订正（吸收 REV-88-007 观察 2）**：op-001 原记 opencode zh `:109-121` 与 op-002 记 `:109-124` 不一致；实测 opencode 侧完整区间 = **`:109-124`**（**op-002 口径更准**），claude 侧 = `:100-115`。执行期以内容特征为准。

**② 行为级 —— 未实测（未触发）**（**预留条目**）

| 项 | 状态 |
|---|---|
| 链路「子 agent 返回 `[HANDOFF: openfeel-executor]` → 主会话同轮解析并派发 → 结果回传」 | **未实测（未触发）** |
| 三要素取证（触发 / 解析 / 派发） | 归**主会话（Feel）**在 op-003 终局报告 §1 补录 |
| 本 op 界限 | 仅预留条目 + 静态核验；**未自造任何链路证据**（降级红线） |

> 旁证（非链路证据）：§8.1 的 q1-probe 转录证明「子代理 → 派发下一级」在 Claude 2.1.300 **机制上可达**，但其触发源是主会话显式 prompt 而非 `[HANDOFF: ...]` 标记解析，**不构成** ② 的证据，仅登记为背景。

## §9 判定表与降级触发（1.8）

| 判据项 | 实测 | 通过？ |
|--------|------|:----:|
| 1.4 静态 ruleset 含 `task` 且非 deny | 显式 `task: allow` 在位 | ✅ |
| 1.5 行为级三要素① 调起下一级会话 | **默认配置下失败**（depth 1） | ❌ |
| 1.5 行为级三要素② 目标正确指定 | 达成 | ✅ |
| 1.5 行为级三要素③ 结果回传 | 达成（回传错误对象） | ✅ |

> **go = 静态非 deny ∧ 行为级三要素齐备；其余一律 no-go（含「未实测」）。**

### 判定：**no-go**（默认配置）→ **降级红线触发**

| # | 降级条件 | 执行情况 |
|---|---------|---------|
| ① | opencode 侧**保留** permission 扩展（零成本、为未来平台能力留门） | **保留**（op-002 §2.1 照常落地）。**留门依据已由 §6.3 实测强化**：仅增设 `subagent_depth` 即跑通二级嵌套——非推测性留门 |
| ② | 两 harness **统一以 Handoff 直发为主通道** | op-002 §2.2 节文本**不点具体通道工具**（Q3 相容性），go / no-go 两分支下均成立；本 op 不产出文案（归 op-002） |
| ③ | 模板文案**如实**（不把「可直接 `task` 调起」写成既成事实） | 由 op-002 §2.2 冻结文本保证（零 harness 主语 + 不点通道工具）；本 op 提供口径依据 |
| ④ | 本报告 + 阶段报告**双处留痕** | 本报告 §9（此处）✅；阶段报告 = op-003 终局报告 §1/§2（待落） |

### 对 op-002 的口径传递

- **文案口径**：采 **no-go 分支**——`## 调度与 Handoff` 节**不得**出现 `task` / `Task` 能力声明，**不得**把「可直接 `task` 调起」写成既成事实。op-002 §2.2 冻结文本（已通过 Q3 相容性裁定）**原文适用，无需改动**。
- **降级红线**：**已触发**，op-002 须按上表 ①~④ 逐条留痕（其中 ①②③ 为其自身实现约束）。
- **额外提示（本 op 新增）**：§8.1 的 Q1 推翻结论**不进入** op-002 文案面（Q15 裁定「claude `tools` 白名单不加 `Task`」在本阶段继续有效）；仅作为 op-003 终局报告的「平台事实订正登记项」。

## §10 残留风险

1. **平台能力未知面（默认配置下）**：嵌套 task 被 `subagent_depth = 1` 拦截。该阈值是**全局配置项**，本阶段**不修改**（属部署层，超出本阶段 range）。阈值提升后的完整语义（更深层级、并发、permission 继承、子会话成本）**未验证**。
2. **触发复核条件（建议）**：① opencode 升级改版默认 `subagent_depth`；② 项目决定在部署层固化 `subagent_depth ≥ 2`；③ 需要 openfeel-schemer 直调 openfeel-executor 类链路时（当前以 Handoff 直发为统一通道，无阻塞）。
3. **Claude 侧计时风险**：Q1 推翻基于 2.1.300 单版本实测；工具名 `Agent` / 白名单令牌 `Task` 的官方映射关系未文档化确认，跨版本可能漂移。
4. **`subagent_depth` 键位未文档化**：本次为实测可用（隔离配置生效，3 级会话链），但该键名来自平台错误提示，非公开 schema；后续版本可能改名。
5. **子会话成本**：嵌套派发会产生多级会话与模型调用（本次 3 级链路 token 成本已发生）；推广前需评估成本面（留待后续阶段）。

## §11 归档建议（KB 补沉，归归档轮）

- 新增候选条目：`kb/patterns.md #opencode 嵌套 task 行为级实测方法（默认 depth 1 拦截 + subagent_depth 提升验证 + debug agent 的 tools 段非授权判据）`
- 新增候选条目：`kb/troubleshooting.md #Claude Code subagent 可调 Task（2.1.300 实测推翻：白名单含 Task → 运行时 Agent 工具 → spawnDepth 2）`
- 既有条目复核：`#隔离 HOME 实测 opencode 行为的方法`（四步法本次全程有效）；`#Claude Code 实机验证方法`（本 op 显示**仅隔离 `CLAUDE_CONFIG_DIR` 即可保留认证**，无需复制认证 → 可作为该条目的补充路径）

---

### 自测清单逐项结论（对应 op-001 自测清单）

| # | 检查点 | 结果 | 留痕位置 |
|---|--------|:----:|---------|
| 1.1 | 三要素齐备 + 基线 sha256 清单 | ✅ | §1 / §2 |
| 1.2 | 双设后四路径全隔离；无 mismatch | ✅ | §3 |
| 1.3 | fixture 就位；仓库 `templates-data` 零改动 | ✅ | §4（`git status --porcelain src/` 空） |
| 1.4 | 静态输出在报告 + 「ask 放行、仅判 deny」局限已登记 | ✅ | §5（另追加「tools 段非授权判据」） |
| 1.5 | 行为级三要素逐条判定 + go/no-go 明确 + 未以静态冒充行为 | ✅ | §6 / §9 |
| 1.6 | 真实全局逐项一致 + 隔离目录已删 | ✅ | §7 |
| 1.7 | Q1 三态明确 + Handoff 证据等级 + ② 条目预留 | ✅ | §8 |
| 1.8 | 降级触发与否明示 + 四条件留痕 | ✅ | §9 |
| 1.9 | 未在真实全局目录做写操作；认证未外传 / 未打印 | ✅ | §7 |

> **偏差记录**：本 op 新增两项方案外内容并已留痕——① §6.3 深度提升补充加测（强化降级依据，不参与判据）；② §8.1 Q1 结论为「推翻」而非方案预置的「成立 / 未实测（环境限制）」两态（**如实登记，未按预期强行归档**）。两项均未改动 `src/**`、未推进 phase、未改版本号。
