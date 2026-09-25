# 适配器更新编排模块（update）

> 模块文档，由归档官在归档时维护。对应源码：`src/core/update.ts`。

## 职责

`openfeel update` 的编排层：在**全局** `~/.config/opencode/` 生成/更新 Agent 定义、Skill 定义、框架约束 core.md，深度合并全局 opencode.jsonc，写入项目最小 opencode.jsonc 覆盖，并维护 AGENTS.md 语言同步 + 控制区标记三态增量更新（`writeManagedFile`）+ 追加记录（`update_infos.md`）。

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

## 变更历史

| 阶段 | 变更 |
|------|------|
| stage-37 | 部署目标改全局 `~/.config/opencode/`；`$schema`/`skills`/`agent_manager_tool` 修正；全局 opencode.jsonc 深度合并；双 state 路由；legacy 提示（N8）；`parseJsonc` 迁移至 opencode-config.ts |
| stage-38 | `writeWithMergeDetection` → `writeManagedFile` 控制区三态（+appended 四分类）；新增 `composeManagedContent`/`pushAction`；接入 `managed-region` + `update-infos`；conflicts 恒空语义变化 |
| stage-39 | 最小侵入抽取 `deployGlobalAsset`（供 migrate 复用，等价 `writeManagedFile(..., {isGlobal:true})`，REV-1205）；`ManagedAction` 改 export；`SKILL_DEFINITIONS` 改 `export const`（build.js 生成模板同步，REV-1308） |
