# 模型配置核心模块（model-config）

> 模块文档，由归档官在归档时维护。对应源码：`src/core/model-config.ts`。

## 职责

本模块属 **opencode 适配器实现**（下文 `opencode` / `opencode.jsonc` / `auth.json` 均为该适配器细节）。提供「工具默认 / 全局 / 当前项目」三层级 agent 模型的读写与校验，供 CLI（`openfeel model`）与内部 API（「Model not found」报错时自动修复）共用。纯函数实现，不直接 console 输出，返回结构化结果。

## 核心 API

| 函数 | 说明 |
|------|------|
| `setAgentModel(scope, agentId, model, opts?)` | 写指定 scope 的 agent model，返回 `SetModelResult`（changedFiles / needsBuild / warning） |
| `getAgentModel(agentId, scope?, opts?)` | 读 agent model，返回 `GetModelResult`（effective / byScope / inconsistent） |
| `listAgentModels(scope?, opts?)` | 列出全部 9 个 agent 的模型 |
| `validateModel(model)` | 校验模型名格式 + provider（对照 auth.json），返回 `ModelValidation` |
| `readAuthProviders()` | 读取 auth.json 顶层 provider key 集合，缺文件/解析失败返回 null |
| `isFrameworkSourceReady(opts?)` | 判断框架源码是否就位（default scope 预判，复用 core 层路径推导） |

类型：`ModelScope = 'default' | 'global' | 'project'`。

## 三层级落点

| scope | 落点 | 写盘方式 |
|-------|------|----------|
| `default` | 有显式 model 的 4 agent（executor/utility/reviewer/vision）→ `templates-data/opencode/agents/{zh-CN,en}/*.md` frontmatter（双语）；vision/reviewer 额外改 `opencode-config.ts`；无显式 model 的 5 agent 报错提示改用 global/project | managed-region frontmatter 读写 + opencode-config 结构化定位 |
| `global` | `~/.config/opencode/opencode.jsonc` `agent.<name>.model` | parseJsonc + 文件锁 + 原子写 |
| `project` | 项目根 `opencode.jsonc` `agent.<name>.model` | parseJsonc + 原子写（不加锁） |

## 解析优先级（REV-1606 实测勘误）

```
项目 agents frontmatter > 全局 agents frontmatter >
项目 opencode.jsonc agent.model > 全局 opencode.jsonc agent.model > 平台默认（当前：opencode）
```

frontmatter 覆盖 opencode.jsonc（与直觉相反）。`getAgentModel` effective 解析为 `default > project > global`；default 层多源（frontmatter + opencode-config.ts）不一致时以 frontmatter 为准，置 `inconsistent`。

## 关键数据结构

```ts
interface SetModelResult { ok: boolean; scope: ModelScope; agentId: string; model: string; changedFiles: string[]; needsBuild?: boolean; warning?: string; }
interface GetModelResult { agentId: string; effective?: string; byScope: Partial<Record<ModelScope, string | null>>; inconsistent?: boolean; }
interface ModelConfigOptions { projectPath?: string; frameworkRoot?: string; }  // 测试隔离注入
```

## 变更历史

| 阶段 | 变更 |
|------|------|
| stage-40 | 初始创建。三层级读写 + 校验 + auth.json provider 读取；REV-1606 修正优先级链（frontmatter > jsonc）；REV-1501~1507/1601~1606/1701~1704 落地 |
