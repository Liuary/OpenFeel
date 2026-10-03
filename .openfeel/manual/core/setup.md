# setup 模块（setup）

> 模块文档，由归档官在归档时维护。对应源码：`src/core/setup.ts`。

## 职责

`openfeel setup` 命令核心：**纯全局部署** OpenFeel 框架配置——全局 `AGENTS.md` + 9 agent + 17 skill + 全局平台适配器配置（`opencode.jsonc`，当前适配器）。复用 `deployGlobalAsset`（受管区三态 + hash 兜底，幂等可重跑），**不建立项目 `.openfeel/`**。全局部署会刷新全局 `update_state.json.openfeel_version`（**已部署版本事实源**），供 `setup --check` 与 CLI 被动提示比对。

## 核心 API

| 函数 | 功能 |
|------|------|
| `setupGlobalFramework(lang?)` | 纯全局部署（首次全量，幂等）；返回 `SetupResult`（created/updated/skipped/appended） |
| `checkGlobalDeployment(options?)` | 只读检测全局部署版本（`core/deployment-check.ts`）；返回 `DeployCheckResult`（四态 `ok`/`mismatch`/`missing`/`unknown`），供 `setup --check` 与 CLI 被动提示消费 |

## SetupResult

```typescript
interface SetupResult {
  created: string[];
  updated: string[];
  skipped: string[];
  appended: string[];
}
```

## 部署内容

| 类别 | 数量 | 目标路径 |
|------|:--:|------|
| 全局 AGENTS.md | 1 | `~/.config/opencode/AGENTS.md`（约束唯一权威，`loadTemplate(lang,'agents-md')`） |
| Agent 定义 | 9 | `~/.config/opencode/agents/{agent}.md` |
| Skill 定义 | 17 | `~/.config/opencode/skills/{name}/SKILL.md` |
| 全局配置 | 1 | `~/.config/opencode/opencode.jsonc`（opencode 适配器；`mergeGlobalOpencodeJsonc` 深度合并 + 全局锁 + 原子写） |

## 检测语义（四态）

`checkGlobalDeployment()` 读取全局 `update_state.json.openfeel_version`（**已部署版本事实源**），与当前 CLI 版本比对，返回四态：

| 状态 | 触发条件 | `setup --check` 退出码 | 被动提示 |
|------|----------|:--:|:--:|
| `ok` | 已部署版本 == CLI 版本 | 0 | 静默 |
| `mismatch` | 已部署版本 != CLI 版本（含部署版本 > CLI 的降级） | 1 | 提示 |
| `missing` | 全局 state 文件缺失（尚未 `setup`） | 1 | 提示 |
| `unknown` | 全局 state 存在但 Schema 非法 / 读取异常 | 1 | 静默 |

- **被动提示 vs `setup --check`**：被动提示走 stderr、每进程一次、不改退出码，`unknown` **静默**（避免 Schema 演进误报）；`setup --check` 为显式只读诊断，四态均**显式报告**并设置退出码。
- 被动提示门控：仅 TTY、非 `--json`/`--quiet`/`--version`/`--help`、非 CI、`OPENFEEL_NO_UPDATE_CHECK` 未设、且非部署类命令（`setup`/`update`/`init`/`migrate`）时触发。

## 升级流程

```bash
npm i -g openfeel@latest   # 1. 升级 CLI
openfeel setup             # 2. 重跑部署，刷新全局 AGENTS.md/agents/skills/opencode.jsonc
# 3. 重启 harness（opencode）以加载新的全局配置
```

仅 `npm i -g` 不会刷新全局资产，须重跑 `openfeel setup` 并重启 harness。`openfeel setup --check` 可诊断全局部署版本与 CLI 版本是否一致（一致退出 0，否则退出 1）。

## 设计要点

- **纯全局**：不接收项目路径，不建项目 `.openfeel/`/`AGENTS.md`/`opencode.jsonc`。
- **复用**：agent 用 `listAgentIds`/`loadAgentTemplate`；skill 用 `SKILL_DEFINITIONS`（update.ts 生成段）；均走 `deployGlobalAsset`。
- **幂等**：二次运行 created 为空，已存在内容一致即 skipped。
- **与 update 关系**：setup = 首次全量部署；update = 增量升级（含项目平台适配器配置文件 `opencode.jsonc` 更新）。二者共用 `deployGlobalAsset`。

## 调用关系

```
src/commands/setup.ts（openfeel setup [--lang]）
  └─ src/core/setup.ts（setupGlobalFramework）
       ├─ src/core/update.ts（deployGlobalAsset / SKILL_DEFINITIONS）
       ├─ src/core/template-loader.ts（loadTemplate / loadAgentTemplate）
       ├─ src/core/opencode-config.ts（mergeGlobalOpencodeJsonc）
       ├─ src/core/global-paths.ts（getGlobalAgentsMdPath 等）
       ├─ src/core/update-state.ts（全局 state）
       └─ src/core/fs/{atomic-write,file-lock}.ts
```

## 变更历史

| 阶段 | 变更 |
|------|------|
| v1.1.1 | 初始创建：新增 `setupGlobalFramework` 纯全局部署（全局 AGENTS.md + 9 agent + 16 skill + opencode.jsonc），不建项目 `.openfeel/` |
| v1.1.5 | 新增 `openfeel setup --check [--json]` 只读诊断；补四态检测语义与升级流程；更正 skill 计数（16 → 17） |
