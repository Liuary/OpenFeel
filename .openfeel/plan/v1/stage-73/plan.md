# v1.1.6-stage-73 计划 — Claude 全局 `settings.json` 注入

- **阶段**：`v1.1.6-stage-73`
- **依赖**：**hard: `v1.1.6-stage-69` `v1.1.6-stage-71`**（`feel` agent 已可部署 + Claude 部署接线与 `getClaudeSettingsPath`/备份已就绪）
- **优先级**：P0（本版本三大反向裁定之一：settings 注入为一等能力）
- **制定人**：openfeel-planner ｜ **制定时间**：2026-10-10
- **定位**：把 `~/.claude/settings.json` 注入作为 `openfeel setup/update --tools claude` 的**正式能力**——与 CLAUDE.md/agents/skills **一并部署**。注入 `permissions.defaultMode: "auto"`（= 裁定 F：automod = auto mode）与 `agent: "feel"`（= 裁定 G：默认 agent），同时**逐字保留用户既有键**（`env`/`model`/`modelPicker`/`theme`/`apiKeyHelper` 等）。**反转蓝本 §四原「不写 settings.json」裁定。**
- **范围**：**新增** `src/core/claude-settings.ts`；`src/core/setup.ts`、`src/core/update.ts`（claude 分支内接入 settings 写回）；`test/core/claude-settings.test.ts`（**新增**）、`test/core/setup.test.ts`、`test/core/update.test.ts`；`src/core/i18n-data/{zh-CN,en}.ts`。
- **边界**：不新增顶层命令、不做 `uninstall`（Q6）；不联网；不新增依赖；不改默认行为（默认不触 `~/.claude`）；不改既有 `--json` 契约；不 `npm publish`/`git push`；不改 `flow.json`。

## KB 检索（`openfeel-check-kb`）

- 已加载。**高度相关条目**：
  - `kb/patterns.md #JSONC 深度合并模式` → **不可复用**：`settings.json` 为**严格 JSON（无注释、无标记）**，jsonc 实现含剥注释/regex 逻辑与「保留用户未知字段」的 `passthrough` 语义；须**独立实现**深合并。
  - `kb/patterns.md #写策略按资产归属二分` → settings 属**用户高频占用资产** → **读-深合并-写回**（保留用户键），非整文件覆盖。
  - `kb/patterns.md #部署覆盖前自动备份机制` → settings 写入前置 `backupFileBeforeWrite`（**lock 之外**，对齐既有 jsonc 备份口径）+ `appendUpdateInfo('backed')`。
  - `kb/patterns.md #事务顺序（先落盘后副作用）` + `#原子写模式` → 写回用 `atomicWriteFileSync`；异常不破坏用户文件。
  - `kb/troubleshooting.md #「备份失败绝不覆盖」的失败路径语义分叉` → 备份失败 → 跳过写入 + `anomaly(backup_failed)`，与 jsonc 口径一致。
  - `kb/patterns.md #全局/项目双 state 路由模式` → settings hash 记入全局 state（绝对路径 key）。
  - **无**「Claude settings.json 深合并」条目 → 归档时补沉 patterns。

---

## 一、背景与实测证据（唯一事实基准）

| 事实 | 位置 | 结论 |
|------|------|------|
| `settings.json` 为**严格 JSON**（用户高频占用） | 蓝本 §四/§十 + 本机实测 | 读-深合并-写回；不得整文件覆盖 |
| 本机 `~/.claude/settings.json` 含用户键（`env`/`model`/`modelPicker`/`theme`/`apiKeyHelper` 等） | 蓝本 §十 | 合并后用户键**逐字保留** |
| `getClaudeSettingsPath()`（尊重 `CLAUDE_CONFIG_DIR`） | stage-71 交付 | 本阶段消费 |
| `deployGlobalAsset` 受管区三态 **不适用于** settings | `update.ts:1561-1568` | 严格 JSON 无 `<!-- -->` 标记 → **独立深合并路径**，不复用受管区 |
| `mergeGlobalOpencodeJsonc` 实现 | `opencode-config.ts` | **仅作结构参考，不可直接复用** |
| `backupFileBeforeWrite` + D-CFG fallback | `backup.ts`（stage-71 后） | settings 写入接备份；`CLAUDE_CONFIG_DIR` 越界已可备份 |
| 现有卸载能力 | 全仓无 `uninstall` | Q6：本期**不新增**卸载命令，仅文档说明手动移除注入键 |

---

## 二、目标语义

| 维度 | 改前 | 改后 |
|------|------|------|
| settings 注入 | 无（显式不写） | `--tools claude` 部署时**读-深合并-写回** `~/.claude/settings.json` |
| 注入键 | — | `agent: "feel"`（裁定 G）；`permissions.defaultMode: "auto"`（裁定 F） |
| 用户键 | — | `env`/`model`/`modelPicker`/`theme`/`apiKeyHelper` 等**逐字保留** |
| 幂等 | — | 二次运行合并后无变化 → **skipped** |
| 默认行为 | — | 默认 `setup`/`update` **零触** `~/.claude/settings.json` |

**不变量**：严格 JSON 解析失败/含非法结构 → **不写盘**、记 anomaly；备份失败 → 跳过写入 + anomaly；默认路径零变化。

**框架自有键 vs 用户键**：框架自有键 = `agent`、`permissions.defaultMode`（可被覆盖，**备份保护**）；其余键（含 `permissions` 下其它子键）**保留/深合并**。

---

## 三、变更点清单（编号 T）

### T1 — 新增 `src/core/claude-settings.ts`

```ts
/** settings.json 注入片段（供应商中立；JSON 无语言维度，故为代码常量，不经 build 注入） */
export function buildClaudeSettingsFragment(): { agent: string; permissions: { defaultMode: string } };
// => { agent: 'feel', permissions: { defaultMode: 'auto' } }

/**
 * 严格 JSON 深合并：在用户既有 settings 上并入框架片段，保留用户未知键。
 * - 对象递归深合并；标量以「框架自有键」覆盖，其余用户标量不动；
 * - 解析失败（非严格 JSON）→ 抛错/返回哨兵，由调用方跳过写入。
 */
export function mergeClaudeSettings(currentRaw: string): string;
```

- **`mergeClaudeSettings` 语义**：
  - `JSON.parse`（**严格**，不接受注释/trailing comma）；失败 → 抛 `ClaudeSettingsParseError`（调用方捕获→跳过+anomaly）。
  - `agent` 设为 `'feel'`；`permissions` 深合并加入 `defaultMode: 'auto'`（保留用户 `permissions` 下其它子键）。
  - 其余键（`env`/`model`/`modelPicker`/`theme`/`apiKeyHelper` 及任意未知键）**逐字保留**。
  - 输出稳定序列化（`JSON.stringify(obj, null, 2) + '\n'`），**保证二次运行无变化 → 幂等**。
- **不复用** `opencode-config.ts` / `managed-region.ts`。

### T2 — 接线 `setup.ts` claude 分支

- 在 CLAUDE.md/agents/skills 之后：settings 写回。
  - `backupFileBeforeWrite(settingsPath, { command:'setup' })`（**lock 之外**）→ 有备份则 `appendUpdateInfo('backed')` + TTY 通知。
  - `withFileLock(globalLockPath('global-claude-settings'), () => { read → merge → atomicWriteFileSync })`。
  - 备份失败（`BackupError`）→ 跳过写入 + `anomaly(backup_failed)` + 告警（对齐 jsonc 口径）。
  - 合并结果**无变化** → 计 `skipped`（幂等）。
  - 成功 → `updateFileHash(globalState, settingsPath, merged)`。
- **默认分支（不含 claude）**：不触 settings（零回归）。

### T3 — 接线 `update.ts` `doClaude` 分支

- 与 T2 对称：settings 写回逻辑抽为**单一共享函数**（`applyClaudeSettings(state, command)`），setup/update 共用，避免双实现漂移。
- `getIncomingContent`：settings **不入冲突分支**（深合并语义 ≠ 受管区三态；不做 Git 冲突标记）。

### T4 — 卸载/回滚语义（Q6 定稿）

- **本期不新增 `uninstall` 命令**（框架对 opencode 亦无卸载命令，保持一致）。
- 语义：① 备份机制可人工还原（`~/.openfeel/backup/{ts}/…`）；② 文档说明「手动删除注入键 `agent`/`permissions.defaultMode` 即可还原」；③ **纯 uninstall 命令立项后续版本**（大计划 §十 Q6 留痕）。

### T5 — i18n（新增 settings 相关键）

- 建议新增键（实施时定稿）：`setup.claudeSettingsMergedTmpl`、`update.claudeSettingsMergedTmpl`、`update.claudeSettingsParseSkipTmpl`、（可选）`update.claudeSettingsBackupSkipTmpl`。
- **追加后重登记 i18n 新基线**（在 stage-71 的 768 基础上 +N，实测为准）；须双表成对。

### T6 — 测试面

| # | 用例 | 断言 |
|:-:|------|------|
| T6.1 | 空/不存在 settings → `--tools claude` | 生成 `{agent:'feel',permissions:{defaultMode:'auto'}}` |
| T6.2 | 预置用户键（`env`/`model`/`modelPicker`/`theme`/`apiKeyHelper`） | 部署后用户键**逐字保留** + 注入键到位 |
| T6.3 | 幂等 | 二次运行合并后无变化 → `skipped`；文件字节不变 |
| T6.4 | 严格 JSON 校验 | 含注释/trailing comma 的输入 → **不写盘** + anomaly（`skipped`） |
| T6.5 | 默认非回归 | 默认 `setup`/`update <path>` → **零触** `~/.claude/settings.json` |
| T6.6 | 备份 | 预置 settings → 写入前生成备份 + `backed` 条目；备份失败 → 跳过 + anomaly |
| T6.7 | `CLAUDE_CONFIG_DIR` 越界 | 路径在 HOME 外时仍可备份写回（D-CFG 联动） |
| T6.8 | `agent`/`defaultMode` 断言 | `--tools claude` 后 JSON 解析得 `agent==='feel'` 且 `permissions.defaultMode==='auto'` |

> 全部以 `vi.mock('node:os')` + `CLAUDE_CONFIG_DIR` 注入隔离；**不得触碰真实 `~/.claude/`**。

### T7 — auto mode 模型支持实测（R-11）

- **验证项**：auto mode 官方要求受支持模型（Opus4.6+/Sonnet4.6+/Haiku5.5/Fable）；本机经 cc-switch 中转 deepseek，**可能判定不可用→回落 manual**。
- **处置**：如实记录实测结论（可用 / 回落 manual）；若回落，则以「`defaultMode` 尽力注入 + 文档说明兜底」为可接受结果，**不因此阻断阶段**（门禁不含此项，作验证清单记录）。

### T8 — 门禁与阶段报告

- `npm test` 全绿 `0 skipped / 0 failed`；`tsc` = 0；`lint i18n` = 新基线（768 + N，**显式登记**）；`lint kb` = 0；`npm run build` ×2 幂等；默认路径 `~/.claude` 零变化。

---

## 四、op 划分与执行顺序（**2~3 op**）

| op | 主题 | 覆盖 | 关键产出 | 依赖 |
|:--:|------|------|----------|------|
| **op-001** | `claude-settings.ts`（片段 + 严格 JSON 深合并）+ 单测 | T1+T6.1~T6.4 | 新模块；测试 | hard: 69,71 |
| **op-002** | setup/update 接线 + 备份 + i18n | T2+T3+T5+T6.5~T6.8 | `setup.ts`/`update.ts`；i18n；测试 | hard: op-001 |
| **op-003** | 卸载语义文档 + auto mode 实测 + 门禁 + 报告 | T4+T7+T8 | 文档说明；验证清单；阶段报告 | hard: op-002 |

**顺序：op-001 → op-002 → op-003。**

**边界声明**：不新增顶层命令；默认行为不变；不改既有 `--json`；不改版本号；不改 `flow.json`。

---

## 五、验收标准（阶段级）

1. **合并幂等**：二次运行无变化 → skipped，文件字节不变（T6.3）。
2. **用户键逐字保留**：`env`/`model`/`modelPicker`/`theme`/`apiKeyHelper` 等原样（T6.2）。
3. **默认路径零触**：默认 `setup`/`update <path>` 后 `~/.claude/` 零变化（T6.5）。
4. **注入断言**：`--tools claude` 后 `agent`/`defaultMode` 到位（T6.8）。
5. **严格 JSON**：非法输入不写盘 + anomaly（T6.4）。
6. **备份**：写入前备份 + `backed` 条目；备份失败跳过 + anomaly（T6.6）；越界可备份（T6.7）。
7. **门禁**：`npm test` 全绿 `0 skipped`；`tsc` = 0；`lint i18n` = 新基线（显式登记）；`lint kb` = 0；`npm run build` ×2 幂等。

---

## 六、风险与回滚

| # | 风险 | 影响 | 缓解 / 回滚 |
|:-:|------|------|-------------|
| R-10 | 深合并破坏用户键 / 非幂等 | **高** | 独立严格 JSON 深合并模块；用户键保留 + 幂等断言（T6.2/T6.3） |
| R-11 | auto mode 受支持模型限制（本机可能回落 manual） | 中 | T7 实测记录；不阻断门禁；文档兜底 |
| R-新10 | 入库键与用户键冲突（用户已设 `agent`） | 中 | 框架自有键覆盖 + **备份保护**；方案期定稿冲突策略（见 §八 D-SET） |
| R-新11 | setup/update 双实现漂移 | 中 | 抽**单一共享函数** `applyClaudeSettings`（T3） |
| R-新12 | settings 写入污染默认路径 | 高 | 仅 claude 分支接入；T6.5 零触断言 |

**回滚**：`git revert <sha>`；备份可人工还原；无数据迁移、无依赖树变动。

## 七、边界（不做）

1. **不新增顶层命令**（无 `settings`/`uninstall` 子命令）。
2. 不联网；不改默认行为；不改既有 `--json` 契约。
3. 不改版本号（归 stage-72）；不改 CI；不新增依赖；不改 `flow.json`。
4. 不复用 `opencode-config.ts`/`managed-region.ts` 的 jsonc/标记逻辑。

## 八、待方案期定稿的子决策

| # | 议题 | 建议 |
|:-:|------|------|
| **D-SET** | 用户已设 `agent` 与框架 `agent:'feel'` 冲突时 | **框架自有键覆盖**（`--tools claude` 为显式 opt-in，备份保护）；或 skip+warn（保守）。scheme 定稿 |
| **D-SET2** | `permissions` 下用户已有同键（如 `allow`/`deny`） | **深合并保留**，仅补 `defaultMode` |
| **D-SET3** | 序列化键序/缩进稳定性 | 固定 `null,2` + 键序稳定，保证二次运行字节幂等 |

## 九、修订记录

| 时间 | 制定人 | 说明 |
|------|--------|------|
| 2026-10-10 | openfeel-planner | 初稿：T1~T8；2~3 op；验收 7 条；锁定「严格 JSON 读-深合并-写回 + 用户键逐字保留 + 幂等 + 备份/卸载语义」；反转蓝本 §四。 |
