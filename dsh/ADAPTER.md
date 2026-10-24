# DSH 适配器

> ✅ 已实现（OpenFeel v1.3.2 / DSH 0.2.0-rc.2+；硬门禁依赖 `ctx.tools.guard`，缺失时降级为提示）。

- **安装（推荐，单包）**：`npm i -g openfeel@latest` → `openfeel setup --tools dsh`
  （写入 DSH profile 的 `link:<openfeelRoot>/dsh` 依赖与 `dsh.profile.bundles`，按需 `pnpm install`），
  然后**重启 DSH 宿主**。适配器随 `openfeel` 包分发，不需要单独发布 `openfeel-dsh`。
- **开发态**：把本目录作为 DSH bundle 装进 profile —— `package.json` 的 `dependencies` 加
  `"openfeel-dsh": "link:<repo>/dsh"`，`dsh.profile.bundles` 加 `"openfeel-dsh"`，然后
  `pnpm install`。**改代码后需重启 DSH 宿主**（Loader 按 URL 缓存 ESM 模块）。
- **安装（另一种）**：经 DSH 插件管理器 `install_bundle` 装 `link:<repo>/dsh`；`file:` 会拷贝，
  改代码后须重装。
- **落点**：`ctx.tools`（13 个 `feel_*` 工具）、`ctx.commands`（`/feel`）、
  `ctx.systemPrompt`（`<feel_mode>` 纪律段）。不写任何领域状态。
- **契约**：CLI 的 `--json` 出口以 [`docs/json-contract.md`](https://github.com/Liuary/OpenFeel/blob/master/docs/json-contract.md) 为**单一权威**
  （v1.3.0 起仍 40 个成功出口）；本适配器只消费、不重实现。
- **升级**：`npm i -g openfeel@latest` → 重启 DSH。适配器版本要求见 `package.json`
  的 `openfeel.requiresCli`（≥1.3.2）。

## 设计边界

OpenFeel 采用「核心层 + 适配器层」架构（`claude/`、`kilo/`、`.opencode/`、`dsh/`）。本适配器：

- **不拥有**领域状态：`flow.json` 的 revision 乐观并发、文件锁、相位转移表、需求 done 门、
  REV 阻塞门、版本归档判据，全部由 `openfeel` CLI 执行。
- **不镜像** Agent 编制：负责 Agent 由 `openfeel flow next --json.responsibleAgent` 权威给出；
  适配器不维护 `PHASE_AGENT_MAP` 副本。
- **不解析**中文文本：优先消费 `--json`；失败读 `error.kind` / `error.code` / `error.detail`。
- **不 shadow** 既有能力：DSH 已有的 `subagent` / `workflow` / `todo_write` 照常使用；
  `feel_next` 只给「该谁做」，实际派发交给 DSH。
- **写入门禁**（v1.3.2）：用 DSH `ctx.tools.guard()` 同步拒绝 `edit` / `write` / `apply_patch` /
  `str_replace_editor`；`.openfeel/**` 流程产物任意阶段可写（flow.json / `status.md` 除外），
  `.openfeel/` 外源码要求 `exec_running`。`pwsh` / `bash` 默认不守，是显式逃生通道；
  `enforce=always`（默认）对非 OpenFeel 工作区也拦截，可用 `project` / `off` opt-out。

## 目录

| 路径 | 内容 |
|---|---|
| `lib/guard.js` | 写入门禁：`enforce`、`.openfeel/**` 产物区、`exec_running`、apply_patch 目标解析 |
| [`ACTION-GUIDE.md`](ACTION-GUIDE.md) | **给 OpenFeel 本体的操作指南**：剩余 5 项待办、验收标准、边界约定 |
| `lib/index.js` | 插件入口（`name` / `inject` / `apply` / `normalizeConfig`） |
| `lib/adapters/cli.js` | CLI 执行器：可执行文件解析、UTF-8/无色/无日志、退出码与 envelope 语义 |
| `lib/adapters/workspace.js` | 会话工作区 → OpenFeel 项目根 |
| `lib/adapters/dashboard.js` | 状态快照（消费 `flow next --json`）+ 「下一步」决策 |
| `lib/tools/index.js` | 13 个工具与 CLI argv 翻译 |
| `lib/tools/shared.js` | 输出封装、参数编译、渲染 |
| `lib/surface/command.js` | `/feel` 人类命令 |
| `lib/surface/prompt.js` | `<feel_mode>` 系统提示段 |
| `test/` | 契约 / 行为 / 门禁 / 真实注册表 四套验证（42 + 83 + 36 + 10 = 171 断言） |
| `docs/compat/` | OpenFeel v1.2.1 逆向兼容性契约（6 份；仅供回归参照，权威以 [docs/json-contract.md](https://github.com/Liuary/OpenFeel/blob/master/docs/json-contract.md) 为准） |

## 验证

```bash
cd dsh
node test/contract.js      # 42 — DSH schema 契约（真实 assertSupportedJsonSchema）
node test/verify.js        # 83 — 行为（真实 CLI + 真实 .openfeel 副本）
node test/guard.js         # 36 — 写入门禁（fake ToolExecution + 临时工作区）
node test/integration.js   # 10 — 真实 cordis + 真实 ToolRuntime 挂载
```

## 发布说明

v1.3.0 起，本目录的运行文件（`lib/`、`cordis.patch.yml`、`package.json`、`README.md`、
`ADAPTER.md`、`docs/`）**已包含**在根 `openfeel` 的 `package.json` `files` 内，随
`npm publish openfeel` 分发；不单独发布 `openfeel-dsh` 包。仍不包含 `dsh/test/`。
对 `tsc`（`src/**/*.ts`）、`vitest`（`test/**/*.test.ts`）、`build.js`
（`src/core/templates-data/**`）均无影响。

详细说明见 [README.md](README.md)。
