# OpenFeel × DSH — Feel 模式适配器

> **这是 OpenFeel 的 DSH 适配版本，不是独立项目。**
> 它把 OpenFeel 的 CLI 与 `.openfeel/` 工作区投影到 DeepSeek Harness（DSH），
> 让 agent 与用户都能在 DSH 内使用 Feel 流程。**领域逻辑、门禁判定、持久化契约
> 全部留在 OpenFeel CLI 里**，适配器不做第二份实现。

- 适配器位置：**本目录** = OpenFeel 仓库的 `dsh/`（与 `claude/`、`kilo/`、`.opencode/` 同级的
  一等适配器）。`OpenFeel-DSH/plugin` 是指向本目录的目录联接。
- 权威契约：[`../docs/json-contract.md`](../docs/json-contract.md)（33 个成功 `--json` 出口冻结表）
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

作为 **DSH bundle** 安装（本地路径，适合开发）：

```powershell
# 方式 A：把本目录链接进 profile（推荐开发用；改动重启即生效）
#   在 C:\Users\Liuary\.dsh\profiles\web\package.json
#   dependencies 加入：  "openfeel-dsh": "link:C:/Users/Liuary/Dev/Mine/AI/OpenFeel-DSH/plugin"
#   dsh.profile.bundles 加入：  "openfeel-dsh"
#   然后：
pnpm install --prefer-offline

# 方式 B：经插件管理器安装（file: 拷贝，改代码后需重装）
#   plugin_manager install_bundle  →  file:C:\Users\Liuary\Dev\Mine\AI\OpenFeel-DSH\plugin
```

**前置条件**：已安装 OpenFeel CLI（`npm install -g openfeel`，`openfeel --version` 可用）。
适配器会自动在 PATH、npm 全局 bin、`node` 同目录下探测可执行文件——包括
Windows 上的 `openfeel.cmd` 垫片。

> ⚠️ **改完插件代码需重启 DSH 宿主**。Loader 按 URL 缓存 ESM 模块，重新
> enable bundle 不会重新导入已加载的模块代码。

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
        autoPrompt: true         # 是否注入 Feel 纪律系统提示段
        language: zh-CN          # 提示段语言：zh-CN | en
        cwd: null                # 兜底工作目录（默认取会话工作区）
```

`normalizeConfig` 对非法值做安全回落（如 `timeoutMs: -5` → `120000`）。

---

## 4. 工具面（13 个）

适配器在 DSH 工具注册表上注册 13 个工具，全部经 `openfeel` CLI 执行。

| 工具 | 覆盖的 CLI | 能力域 |
|---|---|---|
| `feel_status` | `flow next --json`（权威）→ 失败回退 `flow status --json` + `flow mode --json`（+`req list --json`） | **状态快照**：宏观相位、每阶段相位、模式与来源、合法下一相位、负责 Agent、审查档位、守卫、阻塞审查 |
| `feel_next` | 同上快照的派生决策（`flow next --json` 字段直出） | **该谁做**：负责 Agent、合法下一相位、建议命令、守卫、阻塞审查、推荐工具调用、`[HANDOFF: agent]` 标记 |
| `feel_flow` | `flow advance/current/overview/phases/mode/log/metrics/retry/repair/migrate/review_*` | 流水线推进与审查条目 |
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

段落正文每次装配时探测 `.openfeel/` 是否存在，因此提示会随工作区状态变化。

---

## 7. 验证

三套测试，全部本地可跑：

```powershell
cd plugin
node test/contract.js       # DSH 契约：schema 子集、无 type:null、参数契约（42 项）
node test/verify.js         # 行为：真实 CLI + 真实 .openfeel 副本（56 项）
node test/integration.js    # 真实注册表：真 cordis + 真 ToolRuntime 挂载（10 项）
```

- `contract.js` 用宿主 asar 提取出的**真实** `assertSupportedJsonSchema`。
- `verify.js` 对真实 OpenFeel 项目做只读校验，**所有写操作只打在 `os.tmpdir()` 副本上**，并断言原项目 `revision` 未被改动。
- `integration.js` 构造真实 Cordis 上下文 + 真实 `ToolRuntime`，调用适配器 `apply()`，断言 13 个工具真的完成注册与投影。

依赖提取：三套测试默认读 `%TEMP%\dsh-asar\dsh\node_modules\@deepseek-ai`（从宿主
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
│   ├── adapters/
│   │   ├── cli.js         # CLI 执行器：可执行文件解析、UTF-8/无色/无日志、退出码语义
│   │   ├── workspace.js   # 会话工作区 → OpenFeel 项目根（向上回溯 .openfeel/）
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
    └── integration.js     # 真实注册表挂载
```

> `OpenFeel-DSH/` 是集成工作区：`plugin/` 与 `docs/compat/` 都是指向本目录的**目录联接**，
> 因此两处的相对路径引用同时有效，而真实文件只有一份。

---

## 9. 已知限制

1. **改代码需重启宿主**：Loader 按 URL 缓存 ESM 模块；`set_bundle enable` 不会重新导入。
   用 `link:` 依赖可避免每次重装，但仍需重启。
2. **未初始化工作区**：会话工作区不含 `.openfeel/` 时（向上回溯也找不到），工具返回
   `refusal` 并提示 `openfeel init`。上溯会命中祖先目录的 `.openfeel/`（monorepo 友好），
   因此「家目录有 `.openfeel/`」时子目录会被视为同一项目。
3. **CLI 契约（v1.2.3）**：`flow next --json` 提供调度决策；`flow status --json` 的
   `stages[]` 已含 `workflowMode` / `requirementId` / `reviewTier` / `effectiveReviewTier` /
   `opsSummary`；`--json` 失败输出 envelope（`error.code` / `kind` / `detail`）为分类权威；
   `flow advance --json` 仅用于失败 envelope。详见
   [更新说明](<../docs/OPENFEEL-1.2.3-UPDATE.md>)。
4. **仍有 6 个命令面不支持 `--json`**（实测：传 `--json` 被 `INVALID_ARGUMENT` 拒绝）：
   `plan stage list`、`flow retry`、`model list|get`、`lint`、`roadmap show`。适配器对这些
   保留人类文本回显。当前有 **24 处 `--json` 调用 / 8 处文本回显**（含 `instructions` 的
   XML 默认形态）。缺口清单见
   [CLI 需求单 §复核结论](<../docs/CLI-REQUIREMENTS.md>)。
5. **超时**：默认单次 120s。超大 `flow.json`（数百 KB）的 `flow status` 可能接近上限。
6. **不替代 agent 委派**：`feel_next` 给出负责 Agent 与 `[HANDOFF: agent]` 标记，实际派发
   由 DSH 的 `subagent` / `workflow` 完成——DSH 没有 OpenFeel 的 `Task` 语义。
