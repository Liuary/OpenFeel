# 适配器更新编排模块（update）

> 模块文档，由归档官在归档时维护。对应源码：`src/core/update.ts`。

## 职责

`openfeel update` 的编排层：在**全局** `~/.config/opencode/` 生成/更新 Agent 定义、Skill 定义、框架约束 core.md，深度合并全局 opencode.jsonc，写入项目最小 opencode.jsonc 覆盖，并维护 AGENTS.md 语言同步 + 增量更新冲突检测。

## 核心 API

| 函数 | 功能 |
|------|------|
| `updateProject(projectPath, selectedTools?, lang?, options?)` | 主更新流程：AGENTS.md 语言同步 → 全局框架资产部署 → 全局 opencode.jsonc 深度合并 → 项目 opencode.jsonc 最小覆盖 → 双 state 持久化 |
| `selectTools()` | 交互式选择部署目标工具（`@inquirer/prompts` checkbox，非 TTY 回退默认） |
| `supportedTools` | 支持的 AI 工具注册表（当前仅 opencode） |

## 全局部署流程（stage-37 D1）

```
1. 加载双 state：loadUpdateState(projectPath) + loadGlobalUpdateState()
2. legacy 检测（N8）：项目内 .opencode/{agents,skills,instructions} → 提示 migrate（不迁移）
3. AGENTS.md 语言同步（项目级，逻辑不变）
4. core.md → getGlobalCoreMdPath()（绝对路径作 state key）
5. agents → getGlobalAgentsDir()/{name}.md
6. skills → getGlobalSkillsDir()/{name}/SKILL.md
7. 全局 opencode.jsonc：mergeGlobalOpencodeJsonc（解析→深度合并→序列化），加锁+原子写
8. 项目 opencode.jsonc：不存在则写最小 { $schema }（已存在保留，旧非法字段清理属 stage-39）
9. 冲突标记：绝对路径→~/.openfeel/update_conflicts/，相对路径→项目 .openfeel/update_conflicts/
10. 双 state 持久化：saveUpdateState + saveGlobalUpdateState
```

## 关键修正（stage-37）

| 项 | 修正 |
|----|------|
| `$schema` URL | `https://opencode.openfeel/config.json` → `https://opencode.ai/config.json`（拼写错误） |
| `skills` 字段 | 不再生成 `{name:path}` 映射；全局 skill 走自动发现，全局 opencode.jsonc 省略 `skills` 字段（N6） |
| `agent_manager_tool` | 移除（op-000 实测 schema 未定义 + 静默丢弃，N3） |
| 深度合并 | `buildUpdatedJsonc`/`replaceSkillsFieldInJsonc`/`buildJsoncFromObject` → 统一 `mergeGlobalOpencodeJsonc`（保留用户字段） |

## 冲突标记（writeWithMergeDetection）

三态逻辑（stage-32 建立，stage-37 扩展全局）：文件不存在 → created；已存在 + hash 匹配 → 安全覆盖 updated；已存在 + hash 不匹配 → conflicts。全局资产 key 用绝对路径，项目资产用相对路径，按 `isAbsolute` 路由到对应 state。

## 变更历史

| 阶段 | 变更 |
|------|------|
| stage-37 | 部署目标改全局 `~/.config/opencode/`；`$schema`/`skills`/`agent_manager_tool` 修正；全局 opencode.jsonc 深度合并；双 state 路由；legacy 提示（N8）；`parseJsonc` 迁移至 opencode-config.ts |
