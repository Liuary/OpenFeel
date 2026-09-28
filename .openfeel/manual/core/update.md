# 适配器更新编排模块（update）

> 模块文档，由归档官在归档时维护。对应源码：`src/core/update.ts`。

## 职责

`openfeel update` 的编排层：在**全局**配置目录（opencode 适配器：`~/.config/opencode/`）生成/更新 Agent 定义、Skill 定义、全局 `AGENTS.md`，深度合并全局平台适配器配置（`opencode.jsonc`），写入项目平台适配器配置文件（`opencode.jsonc`）覆盖，并维护控制区标记三态增量更新（`writeManagedFile`）+ 追加记录（`update_infos.md`）。

> **v1.1.1 收敛**：update 不再部署**项目 AGENTS.md**（存量项目 AGENTS.md 属用户项目约束，保留不动）；全局约束部署目标由 core.md 改为全局 `AGENTS.md`（`getGlobalAgentsMdPath()`）；存量全局 state 的 core.md key 一次性重映射到全局 AGENTS.md key。

## 核心 API

| 函数 | 功能 |
|------|------|
| `updateProject(projectPath, selectedTools?, lang?, options?)` | 主更新流程：全局框架资产部署（含全局 AGENTS.md）→ 全局平台适配器配置（opencode.jsonc）深度合并 → 项目平台适配器配置文件（opencode.jsonc）最小覆盖 → 双 state 持久化 |
| `deployGlobalAsset(filePath, content, state, command)` | 全局资产部署（受管区三态，等价 `writeManagedFile(..., { isGlobal: true }, command)`），供 setup/migrate 复用；**stage-46 起 `command: BackupCommand` 成必填参数**（覆盖前备份来源标记），9 处调用点（setup×3 / update×3 / migrate×3）均须传入 |
| `selectTools()` | 交互式选择部署目标工具（`@inquirer/prompts` checkbox，非 TTY 回退默认） |
| `supportedTools` | 支持的 AI 工具注册表（当前仅 opencode；作为平台适配器预留扩展点保留） |

## 全局部署流程（v1.1.1）

```
1. 加载双 state：loadUpdateState(projectPath) + loadGlobalUpdateState()
2. legacy 检测（N8）：项目内 .opencode/{agents,skills,instructions} → 提示 migrate（不迁移）
3. 记录项目语言映射 recordProjectLang
4. newGlobalState + 存量 core.md key → 全局 AGENTS.md key 一次性重映射
5. 全局 AGENTS.md → getGlobalAgentsMdPath()（绝对路径作 state key）
6. agents → getGlobalAgentsDir()/{name}.md
7. skills → getGlobalSkillsDir()/{name}/SKILL.md
8. 全局平台适配器配置（opencode.jsonc）：mergeGlobalOpencodeJsonc（解析→深度合并→清理废弃 core.md 引用→序列化），加锁+原子写
9. 项目平台适配器配置文件（opencode.jsonc）：不存在则写最小 { $schema }（已存在保留）
10. 双 state 持久化：saveUpdateState + saveGlobalUpdateState
```

## 关键修正（stage-37）

| 项 | 修正 |
|----|------|
| `$schema` URL | `https://opencode.openfeel/config.json` → `https://opencode.ai/config.json`（拼写错误） |
| `skills` 字段 | 不再生成 `{name:path}` 映射；全局 skill 走自动发现，全局平台适配器配置（opencode.jsonc）省略 `skills` 字段（N6） |
| `agent_manager_tool` | 移除（op-000 实测 schema 未定义 + 静默丢弃，N3） |
| 深度合并 | `buildUpdatedJsonc`/`replaceSkillsFieldInJsonc`/`buildJsoncFromObject` → 统一 `mergeGlobalOpencodeJsonc`（保留用户字段） |

## 控制区标记三态（writeManagedFile）

stage-38 用「控制区标记」替换 stage-32 的 `writeWithMergeDetection`（hash 四态）。`writeManagedFile` 按 `detectFileType` 分派：

| 文件存在？ | 含标记？ | hash 匹配？ | 动作 | 结果 |
|:--:|:--:|:--:|:--|:--:|
| ❌ | — | — | 写全文（frontmatter 结构化 + 正文标记包裹） | `created` |
| ✅ | ✅ | — | frontmatter 合并 + 区内替换 → 全文比对 | `skipped` / `updated` |
| ✅ | ❌ | ✅ | adopt 写带标记新框架内容 | `updated` |
| ✅ | ❌ | ❌/无记录 | 末尾追加受管区 + 写 update_infos.md | `appended` |
| ✅ | malformed | — | 不写盘，仅记 anomaly 条目 | `skipped` |

- 标记型文件（markdown 正文 / .gitignore）走三态；frontmatter / JSONC 结构化型文件恒走合并不进入三态（N1）。
- 无标记追加「追加即建区」（N2）；hash 降级为「无标记文件归属兜底」（N3），不再作为含标记文件拒写依据。
- `UpdateResult` 新增 `appended: string[]`（与 created/updated/skipped/conflicts 并列）；`conflicts` 本阶段恒空（语义变化）。
- 追加/异常动作内联写 `~/.openfeel/update_infos.md`（见 `core/update-infos.md`），路径二元组（绝对路径 / 项目根+相对路径）。
- **覆盖前备份（stage-46）**：`updated`/adopt/`appended` 三分支及全局 `opencode.jsonc` 覆盖写前，经 `backupFileBeforeWrite` 备份原件到 `~/.openfeel/backup/{ts}/` 并记 `backed` 条目；备份失败 → 返回既有 `'skipped'` + `note='backup_failed'` 异常，不覆盖。详见 `core/backup.md`。**`writeManagedFile` 的 `command: BackupCommand` 为形参**（供 backed 条目记录来源命令）。

## 变更历史

| 阶段 | 变更 |
|------|------|
| stage-37 | 部署目标改全局 `~/.config/opencode/`；`$schema`/`skills`/`agent_manager_tool` 修正；全局 opencode.jsonc 深度合并；双 state 路由；legacy 提示（N8）；`parseJsonc` 迁移至 opencode-config.ts |
| stage-38 | `writeWithMergeDetection` → `writeManagedFile` 控制区三态（+appended 四分类）；新增 `composeManagedContent`/`pushAction`；接入 `managed-region` + `update-infos`；conflicts 恒空语义变化 |
| stage-39 | 最小侵入抽取 `deployGlobalAsset`（供 migrate 复用，等价 `writeManagedFile(..., {isGlobal:true})`，REV-1205）；`ManagedAction` 改 export；`SKILL_DEFINITIONS` 改 `export const`（build.js 生成模板同步，REV-1308） |
| v1.1.1 | 拆除项目 AGENTS.md 部署（含 `AgentsMdLangConflictError`）与 `getIncomingContent` 的项目 AGENTS.md 路由；全局约束改部署 `getGlobalAgentsMdPath()`（core.md 退役）；存量全局 state core.md key → AGENTS.md key 一次性重映射 |
