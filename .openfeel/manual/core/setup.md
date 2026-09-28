# setup 模块（setup）

> 模块文档，由归档官在归档时维护。对应源码：`src/core/setup.ts`。

## 职责

`openfeel setup` 命令核心：**纯全局部署** OpenFeel 框架配置——全局 `AGENTS.md` + 9 agent + 16 skill + 全局平台适配器配置（`opencode.jsonc`，当前适配器）。复用 `deployGlobalAsset`（受管区三态 + hash 兜底，幂等可重跑），**不建立项目 `.openfeel/`**。

## 核心 API

| 函数 | 功能 |
|------|------|
| `setupGlobalFramework(lang?)` | 纯全局部署（首次全量，幂等）；返回 `SetupResult`（created/updated/skipped/appended） |

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
| Skill 定义 | 16 | `~/.config/opencode/skills/{name}/SKILL.md` |
| 全局配置 | 1 | `~/.config/opencode/opencode.jsonc`（opencode 适配器；`mergeGlobalOpencodeJsonc` 深度合并 + 全局锁 + 原子写） |

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
