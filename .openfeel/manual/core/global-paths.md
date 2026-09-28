# 全局路径模块（global-paths）

> 模块文档，由归档官在归档时维护。对应源码：`src/core/global-paths.ts`。

## 职责

集中解析「平台适配器」与 openfeel 的全局路径（基于用户主目录），作为 init/update 全局部署的路径基础。**仅此模块 import `node:os` 的 `homedir()`**（N4）：测试 mock `node:os` 一处即隔离全部全局路径。下表加粗标注的路径为 **opencode 适配器**版本（实现细节，保留）。

## 核心 API

| 函数 | 返回路径 |
|------|----------|
| `getOpencodeGlobalDir()` | `~/.config/opencode` |
| `getGlobalAgentsDir()` | `~/.config/opencode/agents` |
| `getGlobalSkillsDir()` | `~/.config/opencode/skills` |
| `getGlobalOpencodeJsoncPath()` | `~/.config/opencode/opencode.jsonc` |
| `getGlobalAgentsMdPath()` | `~/.config/opencode/AGENTS.md`（v1.1.1 框架约束唯一权威；opencode 适配器） |
| `getGlobalCoreMdPath()` | `~/.config/opencode/openfeel/core.md`（v1.1.1 起废弃，仅兼容检测/清理） |
| `getGlobalUpdateStatePath()` | `~/.openfeel/update_state.json` |
| `getGlobalUpdateInfosPath()` | `~/.openfeel/update_infos.md` |
| `getAuthJsonPath()` | `~/.local/share/opencode/auth.json` |

所有函数基于 `homedir()`（`node:os`）+ `join`（`node:path`）拼接，返回绝对路径（不含 `~` 字面量）。

## 设计要点

- **homedir 单点封装**：既有代码中 `homedir()` 分散于 4 处（config.ts / identity.ts / file-lock.ts / resolver.ts）；本模块集中平台适配器相关路径（当前：opencode 适配器），其余 4 处**默认不收纳**（D37-1：避免扩大范围、过度设计）。
- **update_infos.md 仅解析路径**：其读写逻辑属 stage-38，本阶段仅提供路径解析函数。

## 调用关系

```
src/core/init.ts（deployOpencode 全局部署）
src/core/update.ts（updateProject 全局部署 + 双 state）
src/core/update-state.ts（全局 state 读写）
  └─ src/core/global-paths.ts（路径基础）
```

## 变更历史

| 阶段 | 变更 |
|------|------|
| stage-37 | 初始创建，集中解析 opencode/opencode 全局路径（N4 homedir 单点封装）；op-001 落地，供 op-002/003/004 复用 |
| stage-40 | 新增 `getAuthJsonPath()`（`~/.local/share/opencode/auth.json`），供模型 provider 校验读取 auth.json 顶层 key（REV-1505） |
| v1.1.1 | 新增 `getGlobalAgentsMdPath()`（全局 AGENTS.md，框架约束唯一权威）；`getGlobalCoreMdPath()` 标记废弃（仅兼容检测/清理） |
