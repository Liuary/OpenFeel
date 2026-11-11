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

**方式 B：经插件管理器安装（file: 拷贝，改代码后需重装）**
#   plugin_manager install_bundle  →  file:<repo>\dsh
```

**方式 C（无 npm 包，git 源）**：经 DSH 官方「发现」页的索引安装，索引指向本仓 `dsh/` 的固定 commit：

```
# 1. 插件页 → 实验性插件 旁的「更多」→ 打开「自定义插件市场」
# 2. 已安装 旁的「发现」→「添加索引源」→ 填：
#      https://liuary.github.io/OpenFeel/market/index.json
# 3. 卡片上点「安装」，确认框会显示 git 仓库 + commit + 目录
```

DSH 装成的依赖形如 `git+https://github.com/Liuary/OpenFeel.git#<commit>&path:/dsh`。
索引生成/校验见 [`docs/market/README.md`](../docs/market/README.md)（`npm run market:index`）。

> **渠道上限（重要）**：git 源条目只能进**官方发现页**。社区市场
> （awesome-dsh-plugin / dshmarket / 1024Store / dshbase / DSH Community Market）一律要求 npm 包身份，
> 不会收录 `source.type=git` 的条目。要进社区市场，仍需把 `dsh/` 作为独立 npm 包发布（去掉 `private: true`）。
> 现状选择是「不发布独立包」，因为适配器与 CLI 的版本必须同步（`openfeel.requiresCli`）。
> 详见 [`docs/research/dsh-plugin-market-landscape.md`](../docs/research/dsh-plugin-market-landscape.md)。


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
        # mutatingTools 默认 [edit, write, apply_patch, str_replace_editor, bash, pwsh, shell, execute_command, exec]
        # （bash / pwsh 默认受守；shell / execute_command / exec 本宿主不存在，仅作跨宿主防御）
        # shellGate 可选（只影响 shell 分支；env OPENFEEL_SHELL_GATE 优先）：strict | warn | off
        # shellGate: strict
```

`normalizeConfig` 对非法值做安全回落（如 `timeoutMs: -5` → `120000`）。

---

## 4. 工具面（13 个）

适配器在 DSH 工具注册表上注册 13 个工具，全部经 `openfeel` CLI 执行。

| 工具 | 覆盖的 CLI | 能力域 |
|---|---|---|
| `feel_status` | `flow next --json`（权威）→ 失败回退 `flow status --json` + `flow mode --json`（+`req list --json`） | **状态快照**：宏观相位、每阶段相位、模式与来源、合法下一相位、负责 Agent、审查档位、守卫、阻塞审查。默认 **compact**（去 `mode.transitionsByMode` / `recovery.handoff` / `observability`，按需用 `feel_flow action=phases|mode` 现取）；`detail: "full"` 返回完整快照（v1.5.7） |
| `feel_next` | 同上快照的派生决策（`flow next --json` 字段直出） | **该谁做**：负责 Agent、合法下一相位、建议命令、守卫、阻塞审查、推荐工具调用、`[HANDOFF: agent]` 标记 |
| `feel_flow` | `flow advance/current/overview/phases/mode/log/metrics/retry/repair/migrate/review_*` | 流水线推进与审查条目（`review_add` 的 `op` / `stage` 二选一，v1.3.4） |
| `feel_stage` | `plan stage add/list`、`stage status/set/task`、`flow stage set/reset/remove` | 阶段与 `status.md` |
| `feel_op` | `flow ops list`、`plan scheme create/publish/rename/remove/register`、`flow attempt/retry` | 操作方案与执行结果 |
| `feel_req` | `req add/list/show/board/next/claim/release/set/link/advance/split/review/verify/release-check/rollover` | 需求分发（7 状态；发布门 + 顺延，v1.5.8 / REQ-030） |
| `feel_checkpoint` | `flow checkpoint list/restore` | 检查点快照与选择性回退 |
| `feel_archive` | `flow archive <version>/list/show`、`archive <stage>` | 版本分片归档（`allow_unfinished` 显式放行发布软门）+ 阶段摘要归档 |
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
- **观测摘要（v1.5.6）**：`feel_status`/`feel_next` 返回 `observability`（`stale` + `preflightAgeMs`/`preflightOk` 复制副本 + `statusSync` 三键 + 一句摘要）；健康账本**先于 snapshot** 读取（读取次数不变、零新增 I/O），年龄反映「上一次读状态 → 现在」。两者均只增字段，既有键不变。
- **多会话收束 P0（v1.5.8 / REQ-029）**：`feel_status`/`feel_next` 返回 `sessions`（`[{id, cwd, lastSeen, stage}]`，来自 `.openfeel/dev/sessions.json`，缺失 → `[]`）；每次 `feel_*` 执行 upsert 一条会话心跳（失败静默）。该文件为运行时状态（不入库），与 CLI `src/core/dev/sessions.ts` 同格式；CLI 自动提交在检测到并发会话时跳过。
- **feel_mode 开关（v1.5.17）**：`feel_status`/`feel_next` 返回 `feelMode`（`{value, source}`，`source ∈ config.yaml / profile.yaml / builtin`）。`disabled` 时系统提示注入「自由模式」节（不强制建需求/阶段、`preflight` 降级为提示），`workflowGate` 的 `no-active-stage` 分支替换为 `feel-mode-off`（`required:false`，**无标题文案**）；`guard-*` 自检、状态机 / `done` 门 / 归档判据 / 写入门禁保持不变。层级：项目 `.openfeel/config.yaml` 的 `defaults.feel_mode` > 全局 `~/.config/openfeel/profile.yaml` 的 `preferences.feel_mode` > `builtin=enabled`；适配器每轮现读（即时生效），解析实现是 CLI `src/core/config.ts:resolveFeelMode` 的镜像（`lib/adapters/feel-mode.js`，两侧同矩阵测试）。

段落正文每次装配时探测 `.openfeel/` 是否存在，因此提示会随工作区状态变化。

`activation`：

- `auto`（默认）：已初始化 → 完整 `<feel_mode>`；未初始化 → 短 bootstrap（只读可进行；写文件按 `enforce` 说明）。
- `always`：所有工作区都注入完整 `<feel_mode>`（未初始化时 `detected:false`，不会误报已初始化）。
- `off`：不注入任何提示（写入门禁仍可独立开启）。

---

## 6.5 写入门禁（v1.4.0）

适配器在 `apply()` 中用 DSH 的 `ctx.tools.guard()` 注册同步守卫（`dsh/lib/guard.js`）：

- **文件工具与 shell 都受守（v1.5.11）**：文件工具 `edit` / `write` / `apply_patch` / `str_replace_editor`；shell `bash` / `pwsh`（`shell` / `execute_command` / `exec` 在本宿主不存在，仅预置为跨宿主防御条目）。`feel_*`、`read`、`todo_write` 等不受影响。
- `.openfeel/**` 是**流程产物区**：plan / scheme / review 产物在任意阶段可写；但 `.openfeel/flow.json` 与 `.openfeel/**/status.md` **始终拒绝**（用 `feel_*`）。受保护路径按**会话工作区 `<cwd>`** 判定；执行阶段仍可编辑其他项目的 `.openfeel/`（不做跨项目全局保护）。
- **风险分层（v1.3.3 / v1.4.0）**——源码（`src/**` 等）仍要求存在 `exec_running` 阶段；以下两类在无活跃阶段或非 `exec_running` 相位也放行，**混合目标从严**（任一源码 → 按源码规则）：
  - **doc/note**：`docs/**` 与 `.md/.mdx/.txt/.rst/.adoc`；
  - **静态展示资源（v1.4.0）**：`.css/.scss/.html/.svg/.png/.jpg/.jpeg/.webp`，以及路径含 `assets/` 或 `public/`（支持 `crates/cli/assets/index.html` 这类嵌套资产目录；**源码扩展名不因目录豁免**，如 `assets/gen.ts` 仍按源码门禁）。
- **审计（v1.4.0）**：doc/静态资源豁免放行与 chore 放行时，追加 JSONL 到 `.openfeel/log/guard-audit.jsonl`（`time/tool/reason/phase/paths`），best-effort 不影响放行。
- **shell 四类判定（v1.5.11 / D-126-02）**：`bash` / `pwsh` 默认受守，按命令文本分四类——
  1. **硬拒**：受保护路径（`flow.json` / `status.md` / `chore.json` / `config.yaml` / `.preflight.json` / `guard-state.json` / `pipeline.yaml` / `flow-archive/**` 等）、用 shell 跑 `openfeel` 写子命令（`flow` / `stage` / `req` / `chore` 等，应改用 `feel_*`），以及编码与间接执行形态（`-EncodedCommand` / `iex` / `bash -c` / `node -e` / `python -c`）。
  2. **按目标判定**：能静态解析出目标路径的源码写与 git 工作区写（`checkout` / `restore` / `reset --hard|--merge` / `stash pop|apply` / `clean` / `apply` / `commit`）→ 按相位拒（源码要求 `exec_running`；`git commit` 仅在 `exec_running|review_passed|test_passed|archiving` 放行，其它整树 git 写仍只认 `exec_running`，且 `.openfeel/**` 有未提交改动时拒）。
  3. **构建产物豁免**：`dist/**`、`build/**`、`out/**`、`target/**`、`.next/**`、`*.tsbuildinfo`；`npx vitest` / `npm run build` / `cargo build` / `tsc -b` / `git status` 等只读或产物命令不误杀。
  4. **不可判定 → 默认告警放行 + 审计留痕**（`kind=undecidable`）；要更严设 `OPENFEEL_SHELL_GATE=strict`。
  相对路径按 `workdir ?? guard cwd` 解析；档位见下方「shell 判定档位」。
- **chore 写窗口（v1.5.11 收窄）**：`openfeel chore "<说明>"` **只允许人类在外部终端**开启（agent 经 shell 跑 `openfeel chore` 属写子命令 → 硬拒；`.openfeel/chore.json` 也是受保护路径）。窗口上限 **30 分钟**（`--ttl-min 1..30` 只能改短，越界 / 非整数 exit 1 且零写盘）；**源码写入必须显式 `--source`**——缺省窗口只放行 doc / 静态资源，旧 `chore.json` 无 `source_allowed: true` 一律视为未授权。`openfeel chore --end` 收口；不写 `flow.json.stages`，只留 `chore_start` / `chore_end` 日志。存在活跃阶段时 chore 不生效（不绕过相位门）。
- **bootstrap 例外（v1.3.3）**：无 `.openfeel/` 时，全部目标为**新增文件**（`apply_patch` 须全部 `*** Add File:`）→ 放行并提示补账本；已存在文件、`.openfeel/**`、Update/Delete/Move 仍拒绝（`enforce=always` 下）。`project`/`off` 放行。
- `apply_patch` 解析所有 patch 头（`*** Update/Add/Delete File:`、`*** Move to:`、`---/+++`）；全部目标在 `.openfeel/**` 才内部放行，混合/无头保守拒绝。
- `enforce=off` **完全不注册 guard**（连 flow.json/status.md 也不拦）。
- `ctx.tools.guard` 缺失时记警告并降级；`ctx.effect` 负责 disposer，避免 HMR 累积。

**shell 判定档位（`OPENFEEL_SHELL_GATE`；只影响 shell 分支，文件工具不受影响）**：缺省 = 「第 1/2 类拒 + 第 4 类告警」；`strict` = 第 4 类也拒；`warn` = 第 1/2/4 类全部降级为告警放行（仍写审计）；`off` = shell 完全不解析（`edit` / `write` 等仍受守）。profile 的 `shellGate:` 同值，环境变量优先（排障逃生阀）。`enforce=always` 对非 OpenFeel 工作区较激进，可用 `project` / `off` opt-out。

---

## 7. 验证

四套测试，全部本地可跑：

```powershell
cd plugin
node test/contract.js       # DSH 契约：schema 子集、无 type:null、参数契约（46 项）
node test/verify.js         # 行为：真实 CLI + 真实 .openfeel 副本（112 项）
node test/guard.js          # 写入门禁：fake ToolExecution + 临时工作区（138 项）
node test/integration.js    # 真实注册表：真 cordis + 真 ToolRuntime 挂载（10 项）
```

- `contract.js` 用宿主 asar 提取出的**真实** `assertSupportedJsonSchema`。
- `verify.js` 对真实 OpenFeel 项目做只读校验，**所有写操作只打在 `os.tmpdir()` 副本上**，并断言原项目 `revision` 未被改动。
  **前置条件**：当前项目必须至少有 1 个已注册阶段（`flow.json` 的 `stages` 非空）。版本归档（`flow archive <version>`）会把阶段从 `flow.json` 移出，归档后 `stages = 0` 时脚本会在 `[2] 只读工具 — 真实项目快照` 报「需要至少一个阶段用于适配器验证」并退出 1——这是**前置条件不满足**，不是适配器缺陷。此时先 `openfeel plan stage add <临时阶段>`（或切到有活跃阶段的工作区）再跑；CI 不执行本脚本（CI 只跑 `node --check dsh/lib/**` 与 `npm test`），不影响发布门禁。
- `guard.js` 覆盖 `off/project/always`、`.openfeel/**` 产物、`exec_running`、general 需求、apply_patch 混合/无头/Move 同块、受保护路径、bootstrap 文案、shell 四类判定与 `OPENFEEL_SHELL_GATE` 三档等 138 条。
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
8. **写入门禁覆盖文件工具 + shell（v1.5.11）**：`edit` / `write` / `apply_patch` / `str_replace_editor`
   与 `bash` / `pwsh` 都受守；shell 按四类判定（见 §6.5）——第 1/2 类拒、第 3 类构建产物豁免、
   第 4 类默认告警，可用 `OPENFEEL_SHELL_GATE=strict` 收紧、`=warn|off` 放宽（只影响 shell 分支）。
9. **默认 `enforce=always` 较激进**：所有工作区（含非 OpenFeel）都会拦截文件写入，直到
   `openfeel init` 或用户把 profile 的 `enforce` 改为 `project` / `off`。适合“OpenFeel 必须启用”
   的机器；普通试用建议 `project`。
- **需求导向（v1.5.7）**：阶段 = 版本容器，长期保持 `exec_running`、容纳多个需求；提示段 / `workflowGate` / 写入门禁文案统一为「无开启阶段才开阶段；不要每完成需求就推进/关闭阶段；归档/发布需用户确认」。需求完成门同步解耦（零关联可完成；关联阶段进入 `exec_running` 及之后即可完成）。
