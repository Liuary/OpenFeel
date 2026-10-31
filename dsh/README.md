# OpenFeel × DSH — Feel 模式适配器

> **这是 OpenFeel 的 DSH 适配版本，不是独立项目。**
> 它把 OpenFeel 的 CLI 与 `.openfeel/` 工作区投影到 DeepSeek Harness（DSH），
> 让 agent 与用户都能在 DSH 内使用 Feel 流程。**领域逻辑、门禁判定、持久化契约
> 全部留在 OpenFeel CLI 里**，适配器不做第二份实现。

- 适配器位置：**本目录** = OpenFeel 仓库的 `dsh/`（与 `claude/`、`kilo/`、`.opencode/` 同级的
  一等适配器）。`OpenFeel-DSH/plugin` 是指向本目录的目录联接。
- 权威契约：[`docs/json-contract.md`](https://github.com/Liuary/OpenFeel/blob/master/docs/json-contract.md)（40 个成功 `--json` 出口冻结表）
- 宿主：DSH `0.2.0-rc.2`，profile `web` / `desktop`

---

## 1. 设计原则

| 原则 | 含义 |
|---|---|
| **单一权威** | 相位转移、需求 done 门、REV 阻塞门、版本归档判据、`flow.json` revision CAS —— 全部由 `openfeel` CLI 执行。适配器只翻译意图与结果。 |
| **零运行时依赖** | 只用 Node 内置模块，因此不依赖任何 DSH 内部包即可被 Loader 加载。 |
| **拒绝即信息** | CLI 的门禁拒绝原样透传给模型，并附可操作的纠正建议。适配器不吞错、不猜门禁。 |
| **不碰用户数据** | 不手改 `flow.json` / `status.md`；不读 `.openfeel/flow-archive/**`。 |

为什么不做实现层适配：`flow.json` 有乐观并发（`meta.revision` CAS）、文件锁、
跨文件对账等不变量；直接写盘会破坏它们。绕开 CLI 的第二个实现迟早与主体漂移。

---

## 2. 安装

**方式 0（推荐，单包）**：适配器已随 `openfeel` npm 包分发（`openfeel` ≥ 1.3.0），无需单独安装本目录：

```bash
npm i -g openfeel@latest     # 1. 安装/升级（包内已含 dsh/）
openfeel setup --tools dsh   # 2. 写入 DSH profile + 按需 pnpm install（可 --dsh-profile web）
# 3. 重启 DSH 宿主
```

`setup --tools dsh` 会写入 `<DSH_HOME>/profiles/<name>/package.json` 的
`dependencies["openfeel-dsh"] = "link:<openfeelRoot>/dsh"` 与 `dsh.profile.bundles`；
写前备份、幂等重跑、失败回滚。`openfeel update --tools dsh` 不适用（DSH 是全局部署）。

**方式 A（开发态）**：把本目录链接进 profile（改动重启即生效）：

```powershell
#   在 %USERPROFILE%\.dsh\profiles\web\package.json
#   dependencies 加入：  "openfeel-dsh": "link:<repo>/dsh"
#   dsh.profile.bundles 加入：  "openfeel-dsh"
#   然后：
pnpm install --prefer-offline

# 方式 B：经插件管理器安装（file: 拷贝，改代码后需重装）
#   plugin_manager install_bundle  →  file:<repo>\dsh
```

**前置条件**：已安装 OpenFeel CLI（`npm install -g openfeel`，`openfeel --version` 可用）。
适配器会自动在 PATH、npm 全局 bin、`node` 同目录下探测可执行文件——包括
Windows 上的 `openfeel.cmd` 垫片。

> ⚠️ **改完插件代码需重启 DSH 宿主**。Loader 按 URL 缓存 ESM 模块，重新
> enable bundle 不会重新导入已加载的模块代码。
>
> **v1.3.4**：适配器在宿主启动时把「已加载适配器指纹」写入
> `~/.openfeel/adapter-host-dsh.json`；`openfeel setup --check` 据此区分
> **文件旧**（`mismatch`，重跑 `setup`）与**文件已新但宿主未重启**（`restart-required`，只需完全重启宿主）。
> 看到 `restart-required` 时**不要**再重复 `setup`（那会形成死循环）。

---

## 3. 配置

```yaml
- insert:
    - id: openfeel-feel
      name: 'openfeel-dsh'
      config:
        command: openfeel        # CLI 可执行文件；也可填绝对路径
        commandPrefix: []        # 从源码跑时：[node, <repo>/bin/openfeel.js]
        timeoutMs: 120000        # 单次调用超时
        log: false               # 是否写 ~/.openfeel/cli/logs/（默认关闭，只读沙箱更安全）
        autoPrompt: true         # 是否注入系统提示段
        language: zh-CN          # 提示段语言：zh-CN | en
        cwd: null                # 兜底工作目录（默认取会话工作区）
        activation: auto         # auto=项目→完整纪律/非项目→bootstrap；always=完整纪律；off=不注入
        enforce: always          # always=所有工作区守门禁；project=仅项目；off=完全不注册 guard
        allowGeneral: true       # general 需求 in_progress 且无阶段时放行源码写入
        # mutatingTools 默认 [edit, write, apply_patch, str_replace_editor]；pwsh 默认不守
```

`normalizeConfig` 对非法值做安全回落（如 `timeoutMs: -5` → `120000`）。

---

## 4. 工具面（13 个）

适配器在 DSH 工具注册表上注册 13 个工具，全部经 `openfeel` CLI 执行。

| 工具 | 覆盖的 CLI | 能力域 |
|---|---|---|
| `feel_status` | `flow next --json`（权威）→ 失败回退 `flow status --json` + `flow mode --json`（+`req list --json`） | **状态快照**：宏观相位、每阶段相位、模式与来源、合法下一相位、负责 Agent、审查档位、守卫、阻塞审查 |
| `feel_next` | 同上快照的派生决策（`flow next --json` 字段直出） | **该谁做**：负责 Agent、合法下一相位、建议命令、守卫、阻塞审查、推荐工具调用、`[HANDOFF: agent]` 标记 |
| `feel_flow` | `flow advance/current/overview/phases/mode/log/metrics/retry/repair/migrate/review_*` | 流水线推进与审查条目（`review_add` 的 `op` / `stage` 二选一，v1.3.4） |
| `feel_stage` | `plan stage add/list`、`stage status/set/task`、`flow stage set/reset/remove` | 阶段与 `status.md` |
| `feel_op` | `flow ops list`、`plan scheme create/publish/rename/remove/register`、`flow attempt/retry` | 操作方案与执行结果 |
| `feel_req` | `req add/list/show/board/next/claim/release/set/link/advance/split` | 需求分发（7 状态） |
| `feel_checkpoint` | `flow checkpoint list/restore` | 检查点快照与选择性回退 |
| `feel_archive` | `flow archive <version>/list/show`、`archive <stage>` | 版本分片归档 + 阶段摘要归档 |
| `feel_kb` | `knowledge list/add/search/index/dedup` | 知识库（4 个固定分类） |
| `feel_verify` | `flow health`、`lint i18n/kb`、`flow recover`、`project overview`、`config get/set/effective` | 健康检查与配置 |
| `feel_review` | `view list/accept` | REV 条目视图 |
| `feel_plan` | `plan stage list`、`plan scheme list`、`roadmap create/show`、`instructions` | 计划与路线图 |
| `feel_model` | `model list/get/set` | Agent 模型意识配置 |

### 输出契约

所有工具返回统一封装：

```json
{
  "ok": true,
  "action": "advance",
  "summary": "v1.2.3-stage-99 已推进到 done。",
  "details": "{ …CLI 结构化数据的 JSON 文本… }",
  "next": { "tool": "feel_next", "arguments": "{}", "why": "…" }
}
```

**为什么结构化数据是字符串**：DSH 强制的 JSON Schema 子集不接受无类型节点，而
provider 桥接层会把「只有 description、没有 type」的节点转成 `type: null`，API 随即
以 `schema must be a JSON Schema of 'type: "object"', got 'type: null'` 拒绝整个工具。
把载荷序列化成 `details: string` 是跨 provider 稳定的唯一写法。

### 错误分类（v1.2.3 契约）

`--json` 失败时 CLI 输出单文档 envelope：

```json
{ "schemaVersion": 1, "error": { "code": "PHASE_TRANSITION_ILLEGAL", "kind": "refusal", "message": "…", "detail": { "from": "done", "to": "exec_running" } } }
```

`errorFromResult` 的判定顺序：

1. stdout 是可解析 JSON 且 `error` 为**对象** → 透传 `error.code` / `error.kind` / `error.message` / `error.detail`。
2. 退出码 `2` → `refusal`（flow.json 乐观并发冲突，唯一可重试信号）。
3. 退出码 `3` → `internal`。
4. 退出码 `1` 且无 envelope → 按 `kind`（若 legacy `errorKind` 存在）或「有无堆栈」启发式兜底。
5. legacy `{ "error": "..." }`（`error` 为字符串）与无 JSON 的人类输出保持兼容。

### 参数 schema

模拟器直连 `ctx.tools.register()`（不经 `defineTool`），而注册表**既不编译也不校验**
`parameters`，会原样投影给模型。因此作者侧沿用属性级 `required: true`，在交出前由
`compileParameters()` 统一转成裸 JSON Schema（根 `type: 'object'` + 对象级 `required` 数组）。

---

## 5. 命令面 `/feel`

面向人的轻量入口，直接回显 OpenFeel 原生可读输出：

```
/feel                      帮助
/feel status               流水线状态
/feel next                 下一步该谁做
/feel overview             全状态视图
/feel board                需求看板（7 组）
/feel recover              跨会话上下文恢复
/feel health [--fix]       健康检查
/feel stage [<id>]         阶段状态
/feel req <REQ-NNN>        需求详情
/feel claim <REQ-NNN>      认领需求
/feel advance <stage> <phase>  推进相位
/feel archive list         已归档版本
/feel kb <query>           知识库检索
/feel config               有效配置与来源
```

写操作一律交给 CLI：门禁拒绝原因原样回显。

---

## 6. 系统提示面

启用 `autoPrompt` 时注入 `<feel_mode>` 段落，教会 agent **OpenFeel 的纪律**而非重复工具说明：

- 角色 = 调度者不是执行者；15 相位各有负责 Agent。
- **调度目标是活跃阶段**：`pipeline.phase` 只是宏观态，取 `phase != done` 的阶段。
- 禁止手改 `flow.json` / `status.md`。
- 门禁拒绝是预期结果，不得用 `force` 绕过（`--force` 也不能绕过 blocking REV 门与归档判据）。
- 退出码 `2` = 并发冲突，可重试；`3` = 内部故障；`--json` 失败 envelope 是分类权威（见 §4「错误分类」）。
- `auto_advance=disabled` 时推进前必须询问用户。
- 三种模式（full / fast / general）与需求 7 状态流转。
- **命令执行工具（v1.3.5）**：Windows 优先 `bash`（Git Bash），其次 `pwsh`（PowerShell 7）；macOS / Linux 用 `bash`；默认不用 `cmd.exe`；同一任务保持同一 shell。
- **状态与记录（v1.5.0）**：只有 Feel 写状态；子 agent 不读不写 `dev_last*` / `current.md` / `status.md` / `flow.json`；日志不强制（`flow.json.log` 最近 200 条）；`feel_next` / `feel_status` 返回 `statusSync`（`due` / `lastSync` / `intervalMinutes`=30），到期只提示更新交接摘要 + `openfeel dev sync`。
- **流程入口闸（v1.5.2）**：`feel_status` / `feel_next` 在无活跃阶段时返回 `workflowGate`；无阶段写 `docs/research/**` 被拒（chore 不能绕过，拒绝写 `guard-audit.jsonl`）；提示段要求先 `feel_status`、不得以「调研/只读」为由跳过阶段。
- **派发/恢复（v1.5.3）**：`feel_next.dispatch`（goal/context/boundaries/returnFormat；子 agent 禁读状态文件、返回 ≤10 行）；`feel_status.recovery`（lastTransition / handoff / nextAction）；提示段新增派发契约节。
- **快照与空转（v1.5.4）**：`feel_status`/`feel_next` 返回 `revision` / `snapshotAt` / `stale`；`plan_pending` 停留 >10 分钟时提示空转。
- **preflight（v1.5.5）**：适配器 CLI 调用默认 `OPENFEEL_PREFLIGHT=strict`；`feel_status`/`feel_next` 返回 `preflight`；写命令要求 10 分钟内读过状态。提示段禁止 shell 写状态命令。

段落正文每次装配时探测 `.openfeel/` 是否存在，因此提示会随工作区状态变化。

`activation`：

- `auto`（默认）：已初始化 → 完整 `<feel_mode>`；未初始化 → 短 bootstrap（只读可进行；写文件按 `enforce` 说明）。
- `always`：所有工作区都注入完整 `<feel_mode>`（未初始化时 `detected:false`，不会误报已初始化）。
- `off`：不注入任何提示（写入门禁仍可独立开启）。

---

## 6.5 写入门禁（v1.4.0）

适配器在 `apply()` 中用 DSH 的 `ctx.tools.guard()` 注册同步守卫（`dsh/lib/guard.js`）：

- **只守** `edit` / `write` / `apply_patch` / `str_replace_editor`。`feel_*`、`pwsh`、`read`、`todo_write` 等不受影响。
- `.openfeel/**` 是**流程产物区**：plan / scheme / review 产物在任意阶段可写；但 `.openfeel/flow.json` 与 `.openfeel/**/status.md` **始终拒绝**（用 `feel_*`）。受保护路径按**会话工作区 `<cwd>`** 判定；执行阶段仍可编辑其他项目的 `.openfeel/`（不做跨项目全局保护）。
- **风险分层（v1.3.3 / v1.4.0）**——源码（`src/**` 等）仍要求存在 `exec_running` 阶段；以下两类在无活跃阶段或非 `exec_running` 相位也放行，**混合目标从严**（任一源码 → 按源码规则）：
  - **doc/note**：`docs/**` 与 `.md/.mdx/.txt/.rst/.adoc`；
  - **静态展示资源（v1.4.0）**：`.css/.scss/.html/.svg/.png/.jpg/.jpeg/.webp`，以及路径含 `assets/` 或 `public/`（支持 `crates/cli/assets/index.html` 这类嵌套资产目录；**源码扩展名不因目录豁免**，如 `assets/gen.ts` 仍按源码门禁）。
- **审计（v1.4.0）**：doc/静态资源豁免放行与 chore 放行时，追加 JSONL 到 `.openfeel/log/guard-audit.jsonl`（`time/tool/reason/phase/paths`），best-effort 不影响放行。
- **chore 写窗口（v1.4.0）**：`openfeel chore "<说明>"` 在**无活跃阶段**时开启 60 分钟写窗口（源码也可写），`openfeel chore --end` 收口；不写 `flow.json.stages`，只留 `chore_start` / `chore_end` 日志。存在活跃阶段时 chore 不生效（不绕过相位门）。
- **bootstrap 例外（v1.3.3）**：无 `.openfeel/` 时，全部目标为**新增文件**（`apply_patch` 须全部 `*** Add File:`）→ 放行并提示补账本；已存在文件、`.openfeel/**`、Update/Delete/Move 仍拒绝（`enforce=always` 下）。`project`/`off` 放行。
- `apply_patch` 解析所有 patch 头（`*** Update/Add/Delete File:`、`*** Move to:`、`---/+++`）；全部目标在 `.openfeel/**` 才内部放行，混合/无头保守拒绝。
- `enforce=off` **完全不注册 guard**（连 flow.json/status.md 也不拦）。
- `ctx.tools.guard` 缺失时记警告并降级；`ctx.effect` 负责 disposer，避免 HMR 累积。

**逃生通道**：`pwsh` / `bash` 默认不守，仍可直接写盘；`enforce=always` 对非 OpenFeel 工作区较激进，可用 `project` / `off` opt-out。

---

## 7. 验证

四套测试，全部本地可跑：

```powershell
cd plugin
node test/contract.js       # DSH 契约：schema 子集、无 type:null、参数契约（42 项）
node test/verify.js         # 行为：真实 CLI + 真实 .openfeel 副本（96 项）
node test/guard.js          # 写入门禁：fake ToolExecution + 临时工作区（58 项）
node test/integration.js    # 真实注册表：真 cordis + 真 ToolRuntime 挂载（10 项）
```

- `contract.js` 用宿主 asar 提取出的**真实** `assertSupportedJsonSchema`。
- `verify.js` 对真实 OpenFeel 项目做只读校验，**所有写操作只打在 `os.tmpdir()` 副本上**，并断言原项目 `revision` 未被改动。
- `guard.js` 覆盖 `off/project/always`、`.openfeel/**` 产物、`exec_running`、general 需求、apply_patch 混合/无头/Move 同块、受保护路径、bootstrap 文案等 36 条。
- `integration.js` 构造真实 Cordis 上下文 + 真实 `ToolRuntime`，调用适配器 `apply()`，断言 13 个工具真的完成注册与投影。

依赖提取：`contract.js` / `integration.js` 默认读 `%TEMP%\dsh-asar\dsh\node_modules\@deepseek-ai`（从宿主
`app.asar` 解出的包）。缺失时 `contract.js` / `integration.js` 会跳过并说明。

---

## 8. 目录结构

```
dsh/                               # OpenFeel 仓库内的一等适配器目录
├── ADAPTER.md             # 适配器说明（对齐 claude/ADAPTER.md、kilo/ADAPTER.md）
├── package.json           # dsh.bundle.patch 声明 → Loader 可挂载
├── cordis.patch.yml       # 一行 insert：id=openfeel-feel, name=openfeel-dsh
├── lib/
│   ├── index.js           # 插件入口：name / inject / apply / normalizeConfig
│   ├── guard.js           # 写入门禁：enforce / .openfeel 产物区 / exec_running
│   ├── adapters/
│   │   ├── cli.js         # CLI 执行器：可执行文件解析、UTF-8/无色/无日志、退出码语义
│   │   ├── workspace.js   # 会话工作区 = 项目根（与 CLI 一致，**不回溯**）
│   │   └── dashboard.js   # 状态快照 + 「下一步」决策（消费 flow next/status，无相位→Agent 本地镜像）
│   ├── tools/
│   │   ├── index.js       # 13 个工具定义与 CLI argv 翻译
│   │   └── shared.js      # 输出封装、参数编译、渲染
│   └── surface/
│       ├── command.js     # /feel 命令
│       └── prompt.js      # <feel_mode> 系统提示段
├── docs/compat/           # OpenFeel v1.2.1 逆向兼容性契约（6 份，仅供回归参照）
└── test/
    ├── contract.js        # DSH schema 契约
    ├── verify.js          # 行为验证（真实 CLI）
    ├── guard.js           # 写入门禁矩阵（fake ToolExecution）
    └── integration.js     # 真实注册表挂载
```

> `OpenFeel-DSH/` 是集成工作区：`plugin/` 与 `docs/compat/` 都是指向本目录的**目录联接**，
> 因此两处的相对路径引用同时有效，而真实文件只有一份。

---

## 9. 已知限制

1. **改代码需重启宿主**：Loader 按 URL 缓存 ESM 模块；`set_bundle enable` 不会重新导入。
   用 `link:` 依赖可避免每次重装，但仍需重启。
2. **项目解析与 CLI 一致，不回溯**：会话工作区**本身**即项目根（`openfeel flow status`
   在深层子目录返回空态可证 CLI 从不回溯）。判定项目以 `.openfeel/flow.json` 或
   `config.yaml` 为标记；`~/.openfeel/`（`openfeel setup` 的**全局家目录**）不含这些标记，
   因此不会被误判为项目。未命中项目时工具返回 `refusal` 并提示 `openfeel init`，
   提示段注入**短 bootstrap**（`activation=auto`）而非完整 Feel 纪律；`enforce=always` 时写文件也会被门禁拒绝。
   > 若需要 monorepo（子目录里工作），那应作为 OpenFeel CLI 的能力
   > （如 `openfeel project resolve --json`）由各适配器共享，而不是每个 harness 各写一套回溯。
3. **CLI 契约（v1.3.0）**：`flow next --json` 提供调度决策；`flow status --json` 的
   `stages[]` 已含 `workflowMode` / `requirementId` / `reviewTier` / `effectiveReviewTier` /
   `opsSummary`；`--json` 失败输出 envelope（`error.code` / `kind` / `detail`）为分类权威；
   `flow advance --json` 仅用于失败 envelope。v1.2.4 起共 **40 个成功 `--json` 出口**，
   适配器消费其中 **32 处**。详见 [操作指南](https://github.com/Liuary/OpenFeel/blob/master/dsh/ACTION-GUIDE.md) 与
   [更新说明](https://github.com/Liuary/OpenFeel/blob/master/docs/dsh-cli-requirements-supplement-1.2.3.md)。
4. **读命令已全面结构化**：v1.2.4 补齐了 `plan stage list` / `model list|get` / `flow retry` /
   `lint` / `roadmap show` / `config get --all`，适配器文本回显降到 **1 处**
   （仅 `instructions` 的 XML 默认形态）。`--json` 调用点 **32** 处。
5. **`stage_summary` 默认拒绝覆盖**：v1.2.4 起 `archive <stage>` 对已存在的归档文件返回
   `ARCHIVE_EXISTS`（refusal）且零写盘；确需覆盖须传 `force=true`，会冲掉人工整理的摘要。
6. **超时**：默认单次 120s。超大 `flow.json`（数百 KB）的 `flow status` 可能接近上限。
7. **不替代 agent 委派**：`feel_next` 给出负责 Agent 与 `[HANDOFF: agent]` 标记，实际派发
   由 DSH 的 `subagent` / `workflow` 完成——DSH 没有 OpenFeel 的 `Task` 语义。
8. **硬门禁只覆盖文件修改工具**：`edit` / `write` / `apply_patch` / `str_replace_editor`；
   `pwsh` / `bash` 默认不守，仍可直接写盘（显式逃生通道）。若需要 shell 级策略，属于后续
   `guardShell` 的独立设计。
9. **默认 `enforce=always` 较激进**：所有工作区（含非 OpenFeel）都会拦截文件写入，直到
   `openfeel init` 或用户把 profile 的 `enforce` 改为 `project` / `off`。适合“OpenFeel 必须启用”
   的机器；普通试用建议 `project`。
