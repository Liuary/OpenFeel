# v1.1.6-stage-71 计划 — 部署编排与命令面

- **阶段**：`v1.1.6-stage-71`
- **依赖**：**hard: `v1.1.6-stage-69` `v1.1.6-stage-70`**（Claude 内容源 + 中立共享 skills 就绪）
- **优先级**：P0（本版本部署接线核心）
- **制定人**：openfeel-planner ｜ **制定时间**：2026-10-10
- **定位**：把 Claude 内容接通到 `openfeel setup/update`：新增 Claude 全局路径函数、`setup/update` 双分支、`--tools` 命令面、i18n、以及 `CLAUDE_CONFIG_DIR` 越界备份 fallback（D-CFG）。**`settings.json` 注入不在此阶段**（归 stage-73）。
- **范围**：`src/core/global-paths.ts`、`src/core/setup.ts`、`src/core/update.ts`、`src/core/backup.ts`、`src/commands/{setup,update}.ts`、`src/core/i18n-data/{zh-CN,en}.ts`、`test/core/*`、`test/commands/*`、`test/core/deployment-integration.test.ts`。
- **边界**：**不写 `settings.json`**；不改默认行为（默认仅 opencode）；不改既有 `--json` 契约；不新增依赖；不改 CI workflow；不 `npm publish`/`git push`；不改 `flow.json`。

## KB 检索（`openfeel-check-kb`）

- 已加载。**高度相关条目**：
  - `kb/patterns.md #全局路径测试的单点 mock 隔离模式`（全仓仅 `global-paths.ts` import `homedir`）→ **新增 claude 路径函数自动纳入既有 `vi.mock('node:os')` 隔离**；但 `CLAUDE_CONFIG_DIR` 须**在函数体内读 env** 以保测试可注入。
  - `kb/patterns.md #写策略按资产归属二分`（CLAUDE.md 属框架资产 → 备份后覆盖；用户已有 CLAUDE.md → 受管区三态 append）。
  - `kb/patterns.md #控制区标记模式`（三态：不存在写/无标记 append/含标记替换区内；malformed 不写盘只记 anomaly）→ CLAUDE.md 复用 `deployGlobalAsset` **零改动**。
  - `kb/patterns.md #部署覆盖前自动备份机制` + `troubleshooting #「备份失败绝不覆盖」的失败路径语义分叉` → D-CFG 修 `computeBackupRel`，使 HOME 外路径可备份。
  - `kb/patterns.md #init/update 重启提醒对称输出模式`（`isTTY` 守卫、非交互静默）→ 重启提醒按 harness 组合输出，文案入 i18n。
  - `kb/patterns.md #破坏性命令安全校验清单` + `#CLI 退出码语义` → `--tools` 非法值报错 exit 1。
  - `kb/patterns.md #版本号全链路收口清单模式` → 本阶段不改版本号（归 stage-72）。
  - `troubleshooting #随包 postinstall 在用户端路径层级失效` → 不走 postinstall。

---

## 一、背景与实测证据（唯一事实基准）

| 事实 | 源码位置 | 结论 |
|------|----------|------|
| `global-paths.ts` 仅 `homedir` 单点，无 claude 路径 | `global-paths.ts:1-91` | 新增 5 函数（含 `getClaudeSettingsPath`）；`CLAUDE_CONFIG_DIR` 优先须在函数体内读 env |
| `computeBackupRel` HOME 越界抛 `BackupError` | `backup.ts:60-65` | **D-CFG**：新增 `global-external/<sha8>/…` fallback |
| `setupGlobalFramework(lang)` 无 tools 参数 | `setup.ts:29` | 签名扩 `(lang, tools=['opencode'])`；claude 分支 = CLAUDE.md + 9 agents + 17 skills（**不写 settings**） |
| `updateProject` 早退 `if (!selectedTools.includes('opencode')) return 空` | `update.ts:1613-1615` | 改「两工具都未选才返回空」；`doOpencode`/`doClaude` 对称分支 |
| `getIncomingContent` 仅 opencode 三分支 | `update.ts:1843-1871` | 追加 CLAUDE.md / claude agents / claude skills 三分支 |
| 重启提醒硬编码 opencode（`updated.some(startsWith getGlobalAgentsDir()) && isTTY`） | `update.ts:1727-1735` | 按 harness 组合输出；文案入 i18n 新键 |
| `supportedTools` claude 为注释 | `update.ts:58-68` | 转正式条目 `{ id:'claude', name:'Claude Code', …, enabled:false }` |
| `update <path>` 用 `supportedTools.map(t=>t.id)`（**不过滤 enabled**） | `commands/update.ts:43-45` | **高危 R-5** → 改 `filter(t=>t.enabled)` |
| `selectTools()` 非 TTY 已 `filter(t=>t.enabled)` | `update.ts:94` | 交互路径已正确 |
| i18n 基线 761 | `lint i18n` 实测 | 本阶段 +7 新键、修订 6 键 → **768** |
| CI env guard 4 路径 | `ci.yml:39/82` | 追加 `$HOME/.claude`（**归 stage-72**；本阶段测试须保证不写真实 `~/.claude`） |

---

## 二、目标语义

| 维度 | 改前 | 改后 |
|------|------|------|
| 部署工具 | 仅 opencode | opencode + **Claude（显式启用）** |
| `setup` 签名 | `setupGlobalFramework(lang)` | `setupGlobalFramework(lang, tools=['opencode'])` |
| `update` 早退 | 不含 opencode 即空 | **两工具都未选才空** |
| 命令面 | 无 `--tools` | `setup/update --tools <list>`（非法值 exit 1） |
| 备份 | HOME 内 | HOME 内 + **HOME 外 `global-external/<sha8>/…`（D-CFG）** |
| 默认行为 | — | **逐字不变**（claude `enabled:false` + `filter(t=>t.enabled)`） |

**不变量**：默认 `setup`/`update <path>` 后 `~/.claude/` 零变化；既有 `--json` 契约不变；`setup` 无参行为/输出/退出码不变。

---

## 三、变更点清单（编号 T）

### T1 — `global-paths.ts` 5 函数

```ts
/** Claude 全局配置根目录（尊重 CLAUDE_CONFIG_DIR；非空优先，须在函数体内读 env） */
export function getClaudeConfigDir(): string;        // env.CLAUDE_CONFIG_DIR?.trim() || join(homedir(), '.claude')
export function getClaudeAgentsDir(): string;        // <config>/agents
export function getClaudeSkillsDir(): string;        // <config>/skills
export function getClaudeMdPath(): string;           // <config>/CLAUDE.md
export function getClaudeSettingsPath(): string;     // <config>/settings.json（stage-73 消费）
```

- **`CLAUDE_CONFIG_DIR` 在函数体内读 env**（保测试可注入）；空字符串/空白 → 回落 `~/.claude`。
- 延续 `homedir` 单点约定（其余函数经 `getClaudeConfigDir`）。

### T2 — `setup.ts` 双分支

- 签名扩 `setupGlobalFramework(lang: 'zh-CN'|'en' = 'zh-CN', tools: string[] = ['opencode'])`。
- **opencode 分支原样保留**（AGENTS.md + 9 agents + 17 skills + opencode.jsonc 深合并）。
- **claude 分支**：`~/.claude/CLAUDE.md`（`loadClaudeConstraintTemplate`）+ 9 agents（`loadClaudeAgentTemplate`）+ 17 skills（复用 `SKILL_DEFINITIONS`）；复用 `deployGlobalAsset`；**不写 `settings.json`**。
- 幂等不变式：默认二次运行仍 27 skipped；双 harness 二次 = 53 skipped（数待实测）。

### T3 — `update.ts` 双分支

- 早退 `:1613-1615` 改「两工具都未选才返回空」。
- opencode 专属段用 `doOpencode` 包裹；新增 `doClaude` 对称分支（CLAUDE.md + claude agents + claude skills）。
- `getIncomingContent`（`:1843-1871`）追加 CLAUDE.md / claude agents / claude skills 三分支。
- 重启提醒（`:1727-1735`）按 harness 组合输出（含 Claude 首次创建/`/reload-skills` 提示）；**文案入 i18n**。
- **CLAUDE.md 走既有受管区三态**（`deployGlobalAsset` 零改动）：用户已有 CLAUDE.md（无标记）→ **末尾 append，不覆盖、不破坏**；含标记 → 仅替换区内；malformed → 不写盘只记 anomaly。

### T4 — `supportedTools` + 命令面（**R-5 守卫**）

- `update.ts:58-68`：claude 转正式条目 `{ id:'claude', name:'Claude Code', description: …, enabled:false }`（注释移除）。
- **`commands/update.ts:43-45`：`supportedTools.map(t=>t.id)` → `supportedTools.filter(t=>t.enabled).map(t=>t.id)`**（**高危修复**）。
- `commands/update.ts` + `commands/setup.ts`：新增 `--tools <list>`（逗号分隔；非法值报错 exit 1；setup 不加交互勾选）。
- `selectTools()` 交互勾选（`update` 无参数）保留，claude 默认不勾选。

### T5 — i18n（7 新键 + 6 修订 → 761→**768**）

- **新增 7 键**：`help.update.tools`、`help.setup.tools`、`update.toolsInvalidTmpl`、`update.nonInteractiveToolsTmpl`、`update.restartHarnessTmpl`、`setup.restartHarnessTmpl`、`update.claudeReloadHintTmpl`（替换硬编码 `core/update.ts:93/1730`、`commands/setup.ts:52`）。
- **修订 6 键**（含 opencode 措辞 → harness 中性）：`update.globalStaleWarnTmpl`/`update.globalMissingWarnTmpl`/`setup.checkMismatchTmpl`/`setup.checkMissingTmpl`/`help.setup`/`help.init.workspaceOnly`（**注意**：`check*` 属 v1.1.5 键，本次修订其「重启 harness（opencode）」措辞为中性）。
- 其余 12 个 opencode 语境键**不改**。
- **基线显式登记 768**（大计划 §八 + 本阶段 §五双处）。

### T6 — D-CFG：`computeBackupRel` fallback

- `backup.ts:60-65`：HOME 外路径（相对化含 `..` 或绝对）**不再抛错**，改为 `global-external/<sha8>/<规范化绝对路径尾段>`。
- `sha8` = `sha256(父目录或绝对路径)` 前 8 位（**具体口径由 scheme 定稿**，须避免跨盘符冒号/保留字符）。
- **仅改 1 函数 + 2 测试**（蓝本 §十 估计）；不影响 HOME 内既有行为（零回归）。

### T7 — 测试面

| 文件 | 用例 |
|------|------|
| `test/core/global-paths.test.ts` | claude 5 路径断言 + `CLAUDE_CONFIG_DIR` 三态（设/空/空白，保 env 恢复） |
| `test/core/setup.test.ts` | 默认 setup 不触 `~/.claude`；`['opencode','claude']` → 9 agents/17 skills/CLAUDE.md；二次 53 skipped（数待实测） |
| `test/core/update.test.ts` | `['claude']` 部署 26 文件（数待实测）；默认**零触** `~/.claude`；用户 CLAUDE.md 无标记→appended 且内容逐字保留；含标记→仅区内；malformed→skipped+anomaly |
| `test/commands/{setup,update}.test.ts` | `--tools` 各场景 + **默认行为逐字回归（R-5 守卫）** |
| `test/core/deployment-integration.test.ts` | 场景 E/F：claude 单装/双装后 `checkGlobalDeployment` ok |
| `test/core/backup.test.ts` | D-CFG：HOME 外路径 backup fallback；HOME 内零回归 |

> 全部测试以 `vi.mock('node:os')` 隔离 homedir；`CLAUDE_CONFIG_DIR` 经 `vi.stubEnv`/传入注入，**不得触碰真实 `~/.claude/`**。

### T8 — 门禁与阶段报告

- `npm test` 全绿 `0 skipped / 0 failed`；`tsc` = 0；`lint i18n` = **768**（显式登记）；`lint kb` = 0；`npm run build` ×2 幂等；默认路径回归（`~/.claude` 零变化）。

---

## 四、op 划分与执行顺序（**3~4 op**）

| op | 主题 | 覆盖 | 关键产出 | 依赖 |
|:--:|------|------|----------|------|
| **op-001** | global-paths 5 函数 + D-CFG | T1+T6 | `global-paths.ts`、`backup.ts`；测试 | hard: 69,70 |
| **op-002** | supportedTools + `--tools` 命令面 + **R-5 修复** | T4 | `update.ts`、`commands/{setup,update}.ts`；测试 | hard: op-001 |
| **op-003** | setup/update 双分支 + getIncomingContent + 重启提醒 + i18n | T2+T3+T5 | `setup.ts`、`update.ts`、i18n；测试 | hard: op-002 |
| **op-004** | 集成测试 + 门禁 + 报告 | T7+T8 | 集成测试；全门禁；阶段报告 | hard: op-003 |

**顺序：op-001 → op-002 → op-003 → op-004。**

**边界声明**：不写 `settings.json`（归 stage-73）；默认行为逐字不变；不改版本号；不改 CI；不改 `flow.json`。

---

## 五、验收标准（阶段级）

1. **路径**：claude 5 路径正确；`CLAUDE_CONFIG_DIR` 三态（设/空/空白）行为一致。
2. **默认非回归（R-5）**：`setup`/`update <path>` 后 `~/.claude/` 零变化；既有 `--json` 与无参行为不回归。
3. **Claude 部署**：`--tools claude` / `['opencode','claude']` → CLAUDE.md + 9 agents + 17 skills；CLAUDE.md 受管区三态正确；**不产生 `settings.json`**。
4. **D-CFG**：HOME 外路径备份 fallback 生效；HOME 内零回归。
5. **命令面**：`--tools` 非法值 exit 1；合法值正确部署。
6. **i18n**：`lint i18n` = **768（显式登记）**；7 新键双语成对；6 修订键中性。
7. **门禁**：`npm test` 全绿 `0 skipped`；`tsc` = 0；`lint kb` = 0；`npm run build` ×2 幂等。

---

## 六、风险与回滚

| # | 风险 | 影响 | 缓解 / 回滚 |
|:-:|------|------|-------------|
| R-5 | `update <path>` 默认把 claude 带入 | **高危** | `filter(t=>t.enabled)` + 回归测试（验收 2） |
| R-7 | `CLAUDE_CONFIG_DIR` 越界备份失败 | 中 | D-CFG fallback（T6） |
| R-新6 | `CLAUDE_CONFIG_DIR` 在模块加载期读 env 致测试不可注入 | 中 | **函数体内读 env**；`global-paths.test.ts` 三态 |
| R-新7 | 双分支后 opencode 段回归 | 高 | opencode 段**原样保留**；既有 setup/update 测试全绿 |
| R-新8 | `--tools` 非法值未拦截 | 低 | 校验 + exit 1 + 测试 |
| R-新9 | 测试误写真实 `~/.claude` | 高 | `vi.mock('node:os')` + `CLAUDE_CONFIG_DIR` 注入隔离 |

**回滚**：`git revert <sha>`；无数据迁移、无依赖树变动。

## 七、边界（不做）

1. **不写 `settings.json`、不建 `claude-settings.ts`**（归 stage-73）。
2. 默认行为逐字不变；不改既有 `--json` 契约。
3. 不改版本号（归 stage-72）；不改 CI workflow（env guard 归 stage-72）。
4. 不新增依赖；不 `npm publish`/`git push`；不改 `flow.json`。

## 八、交付给 stage-73 的集成契约

- **路径**：`getClaudeSettingsPath()`（尊重 `CLAUDE_CONFIG_DIR`）。
- **接线点**：`setupGlobalFramework(lang, tools)` 的 claude 分支、`updateProject` 的 `doClaude` 分支——stage-73 在此扩展「写 `settings.json`」。
- **备份**：`backupFileBeforeWrite` + D-CFG fallback 已就绪，可直接接入 settings 写入（**须在 lock 之外**，对齐既有 jsonc 备份口径）。
- **i18n 基线**：本阶段落 768；stage-73 追加 settings 键后**重新登记**。

## 九、修订记录

| 时间 | 制定人 | 说明 |
|------|--------|------|
| 2026-10-10 | openfeel-planner | 初稿：T1~T8；3~4 op；验收 7 条；i18n 761→768；**R-5 `filter(t=>t.enabled)` 高危修复**；D-CFG 纳入；settings 不在本阶段。 |
