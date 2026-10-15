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
| `selectTools()` | 交互式选择部署目标工具（`@inquirer/prompts` checkbox，非 TTY 回退默认；非 TTY 消息走 `update.nonInteractiveToolsTmpl`） |
| `supportedTools` | 支持的 AI 工具注册表：opencode `enabled:true` + **claude `enabled:false`**（v1.1.6-stage-71）；`enabled` 是「默认启用工具集」的**唯一数据源** |
| `parseToolList(raw)` | 解析 `--tools` 逗号列表（v1.1.6-stage-71）：保序去重、返回 `{tools, invalid}`；空串/纯空白 → invalid（触发 exit 1）；setup/update 共用同一实现 |

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

## 多 harness 双分支（v1.1.6-stage-71）

`updateProject` 由「不含 opencode 即早退」改为「**两工具都未选才返回空**」，并分 `wantOpencode` / `wantClaude` 对称分支：

- **opencode 分支**：步骤 0~4（AGENTS.md / agents / skills / 全局 jsonc / 项目 jsonc）整体包入 `if (wantOpencode)`——**语句逐字保留**（仅缩进 +2，零回归）；`legacyDirs` 警告、`recordProjectLang`、全局 state、`staleCoreKey` 重映射保持在外。
- **claude 分支**（`if (wantClaude)`）：`~/.claude/CLAUDE.md`（`loadClaudeConstraintTemplate`，走受管区三态）+ **10 agents**（`loadClaudeAgentTemplate`；v1.2.1-stage-89 由 9 翻转）+ 18 共享 skills（`SKILL_DEFINITIONS`）；复用 `deployGlobalAsset`；**step 4c** 经 `applyClaudeSettings` 写 `~/.claude/settings.json`（严格 JSON 读-深合并-写回，v1.1.6-stage-73）。
- **`getIncomingContent`**：追加 CLAUDE.md / claude agent（`getClaudeAgentsDir()` 下 `{name}.md`）/ claude skill（`getClaudeSkillsDir()` 下 `{name}/SKILL.md`）三分支，与 opencode 分支模式对称；**无 settings 分支**（settings 不入 conflicts）。
- **重启提醒**：按 harness 组合输出（`update.restartHarnessTmpl` + `update.claudeReloadHintTmpl`），`isTTY` 守卫、非交互静默；仅 opencode 时**逐字**与改前一致；`claudeChanged` 判定源含 `getClaudeSettingsPath()`（仅 settings 变化也触发提醒）。

> **R-5 默认守卫**：`commands/update.ts` 默认工具选择由 `supportedTools.map(t=>t.id)` 改 `filter(t=>t.enabled).map(t=>t.id)`——默认 `update <path>` **仅部署默认启用工具**，`~/.claude` 零触（`kb/patterns.md #工具注册表 enabled 门控的默认守卫`）。

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
- **含标记分支的 frontmatter 合并（`region.status === 'ok'`）经 `mergeFrontmatter(existingFm, incomingFm, USER_SOVEREIGN_KEYS)`**（v1.2.1-stage-94）：用户主权键 **`model`** 已有则**保留用户值**（「无则创建、有则不覆盖」），其余框架字段维持 incoming 覆盖。**仅此分支**传白名单；`created` / `appended` / `malformed` / adopt 四路径**不触碰 frontmatter**（语义逐字）。详见 kb/architecture.md #部署非破坏性语义架构。
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
| v1.1.6-stage-71 | 多 harness 双分支（`wantOpencode`/`wantClaude`；早退改「两工具都未选才空」）；claude 分支 = CLAUDE.md + 9 agents + 17 共享 skills；`getIncomingContent` 补三分支；重启提醒按 harness 组合参数化（i18n）；`supportedTools` claude 正式条目 `enabled:false` + `parseToolList`；**R-5**：`update <path>` 默认改 `filter(t=>t.enabled)` |
| v1.1.6-stage-73 | claude 分支 step 4c 接入 `applyClaudeSettings`（`settings.json` 严格 JSON 读-深合并-写回，共享单实现防漂移）；重启提醒 `claudeChanged` 追加 `f === getClaudeSettingsPath()`；settings **不入 conflicts**（`getIncomingContent` 不加分支）；`update([claude])` 二次 skipped 27 → **28** |
| v1.2.1-stage-94 | **部署非破坏性（用户主权键）**：`writeManagedFile` 含标记分支调 `mergeFrontmatter(existingFm, incomingFm, USER_SOVEREIGN_KEYS)`——`model` 键已有即保留用户值（「无则创建、有则不覆盖」）；其余路径零改动；`setup` / `migrate` 经 `deployGlobalAsset` **单点继承**（调用方零改动）；`--scope default`（`model-config.ts`）不受影响。同批注入文案：「勿手改 frontmatter」**限定化**（`model` 主权、其余框架键仍覆盖）+ Claude 侧「模型校验路径 / 用户主权配置位」节。详见 kb/architecture.md #部署非破坏性语义架构 |
