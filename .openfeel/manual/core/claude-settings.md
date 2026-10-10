# Claude 全局 settings.json 注入模块（claude-settings）

> 模块文档，由归档官在归档时维护。对应源码：`src/core/claude-settings.ts`（v1.1.6-stage-73 新建）。

## 职责

把 `~/.claude/settings.json` 注入作为 `openfeel setup/update --tools claude` 的**正式能力**（与 CLAUDE.md/agents/skills 一并部署）：向用户既有 `settings.json` 注入框架自有键 `agent: 'feel'`（裁定 G：默认 agent）与 `permissions.defaultMode: 'auto'`（裁定 F：automod = auto mode），同时**逐字保留用户既有键**（`env`/`model`/`modelPicker`/`theme`/`apiKeyHelper` 等）。

> `settings.json` 为**严格 JSON**（无注释、无受管区标记），与 opencode 的 `opencode.jsonc` 是两种格式 → **独立实现深合并**，**不复用** `opencode-config.ts`（jsonc 剥注释/passthrough）与 `managed-region.ts`（标记三态）。

## 核心 API

| 函数 | 功能 |
|------|------|
| `buildClaudeSettingsFragment()` | 返回注入片段 `{ agent:'feel', permissions:{ defaultMode:'auto' } }`（JSON 无语言维度 → 代码常量） |
| `mergeClaudeSettings(currentRaw)` | 严格 JSON「读-深合并-写回」：`JSON.parse`（失败抛 `ClaudeSettingsParseError`，顶层非对象同抛）→ 框架自有键原位覆盖 + `permissions` 深合并（保留用户 `allow`/`deny` 等）+ 其余键 `{...base}` 逐字保留 → `JSON.stringify(obj, null, 2) + '\n'`（依赖 JS 插入序保**字节幂等**） |
| `applyClaudeSettings(state, command, lang)` | **单一共享函数**（setup/update 共用，杜绝双实现漂移）：① lock 之外写前备份 → ② lock 内 read→merge→atomicWrite → 返回 `'created'`/`'updated'`/`'skipped'` |
| `ClaudeSettingsParseError` | 非严格 JSON / 顶层非对象抛出（调用方捕获 → 跳过写入 + anomaly） |

## 写策略（用户高频占用文件：读-深合并-写回）

`settings.json` 属**用户高频占用**资产 → 既非「框架资产备份后覆盖」（会丢用户键），也非「用户资产不覆盖」（无法注入），而是**读-深合并-写回**：

1. **写前备份（lock 之外）**：`backupFileBeforeWrite(settingsPath, {command})`（目标存在才备份）→ `appendUpdateInfo('backed')` + `notifyBackupIfTTY`；置于 `global-claude-settings` 锁**之外**（避免与 backup 锁嵌套）。
2. **锁内 read → merge → atomicWrite**：`withFileLock(globalLockPath('global-claude-settings'), …)`，读取也在锁内（消 TOCTOU）；写回走 `atomicWriteFileSync`。
3. **失败跳过 + anomaly**：备份失败（`BackupError`）→ `skipped` + `anomaly(backup_failed)`；严格 JSON 解析失败 → **不写盘** + `anomaly(parse_failed)` + `skipped`（**有意分歧于 jsonc 的「回写原文静默」**）；读取失败 → `anomaly(read_failed)`；非 BackupError/ParseError 照旧上抛。
4. **幂等**：`existed && merged === raw` → `skipped`（文件字节不变）；成功 → `updateFileHash(state, settingsPath, merged)`（全局 state，绝对路径 key）。
5. **默认零触**：仅 `--tools claude` 分支接线；默认 `setup`/`update <path>` 后 `~/.claude` 零变化。
6. **不入 conflicts**：`getIncomingContent` **无 settings 分支**（深合并语义 ≠ 受管区三态，不做 Git 冲突标记）。

## 框架自有键 vs 用户键（D-SET 定稿）

- **框架自有键** = `agent`、`permissions.defaultMode`（可被覆盖，**备份保护**）。
- 用户已设 `agent` 时 → **框架自有键覆盖（原位赋值）**（`--tools claude` 为显式 opt-in；备份使原值可人工还原）。
- 用户 `permissions` 下其它子键（`allow`/`deny` 等）→ **深合并保留**，仅补 `defaultMode`。
- 用户 `permissions` 为**非对象**（如字符串）→ 以 `{defaultMode:'auto'}` 替换该键（D-SET2 边界，备份保护）。

## 卸载 / 回滚（Q6，不新增命令）

本期**不新增 `uninstall` 命令**（框架对 opencode 亦无，保持一致）。回滚路径：① **备份还原**（`~/.openfeel/backup/{ts}/global/.claude/settings.json`；`CLAUDE_CONFIG_DIR` 越界时为 `…/global-external/<sha8>/…`）；② **手动删键**（删除 `agent` 与 `permissions.defaultMode`，用户其余键保留）。纯 `uninstall` 命令列入后续版本。

## 调用关系

```
src/core/setup.ts（claude 分支 step 4c）──┐
src/core/update.ts（doClaude 分支 step 4c）┘─→ applyClaudeSettings(state, command, lang)
  └─ src/core/claude-settings.ts
       ├─ src/core/backup.ts（backupFileBeforeWrite / notifyBackupIfTTY / BackupError）
       ├─ src/core/update-infos.ts（appendUpdateInfo backed/anomaly）
       ├─ src/core/global-paths.ts（getClaudeSettingsPath）
       ├─ src/core/update-state.ts（updateFileHash）
       ├─ src/core/fs/{atomic-write,file-lock}.ts
       └─ src/core/i18n.ts（claudeSettingsMergedTmpl 等 6 键，setup/update 域各 3）
```

## 变更历史

| 阶段 | 变更 |
|------|------|
| v1.1.6-stage-73 | 初始创建：新增 `claude-settings.ts`（`buildClaudeSettingsFragment` / `mergeClaudeSettings` / `applyClaudeSettings` / `ClaudeSettingsParseError`）；setup/update claude 分支接线（写前备份 + anomaly + 幂等 + hash）；settings 不入 conflicts；i18n 6 新键（768→774）；Q6 卸载/回滚文档；**反转蓝本 §四**（原「settings.json 不注入」裁定） |
