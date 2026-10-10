# Claude Code 适配方案（v1.1.6 立项蓝本）

> 文档版本：1.0
> 撰写日期：2026-10-10
> 撰写人：Claude Code Agent
> 适用范围：OpenFeel 新增 Claude Code 适配器（核心适配）；`§三 模型清单`同时作为后续 opencode 侧模型配置的对照表
> 状态：提案 — 供 v1.1.6 立项，实现由 opencode 侧流水线调度执行

---

## 〇、用途与来源

- 本文档是 Claude Code 适配的**完整技术方案与实施蓝本**：含目标产物结构、逐文件改动清单、frontmatter 映射表、部署编排设计、测试/CI 清单、阶段拆分与门禁。
- 事实来源：① 仓库 v1.1.5 源码核验（build.js / update.ts / setup.ts / global-paths.ts / templates-data 等，行号以 HEAD `2799266` 为准）；② Claude Code 官方文档（2026-10-10 核验）；③ 本机 cc-switch v4.0.3 实测（模型清单，见 §三）。
- 决策记录：用户 2026-10-10 裁定（见 §二）。

## 一、Context（为什么做）

- OpenFeel 是「AI Agent 开发流程治理 CLI」，当前**仅适配 opencode**：`openfeel setup/update` 把全局 AGENTS.md、9 个 agent、17 个 skills、opencode.jsonc 部署到 `~/.config/opencode/`。
- 框架自定位多 harness（`.openfeel/adapters/README.md` 中 `claude/`、`kilo/` 为预留占位；`src/core/update.ts:66` 已注释预留 claude 注册项），但代码层全部硬编码 opencode。
- 目标：新增 **Claude Code 适配器**——全局约束文件、8 个 subagent、17 个 skills 部署到 `~/.claude/`，与 opencode 并存；Claude 侧显式启用，不影响现状默认行为。

## 二、立项决策记录（2026-10-10 确认）

| # | 议题 | 裁定 |
|---|------|------|
| 1 | 适配范围 | **核心适配**：全局约束 + 8 subagent + 17 skills + setup/update 集成 + i18n/文档/测试；`openfeel model` 的 Claude 支持**留待后续版本** |
| 2 | 模板架构 | **共享中立源**：17 skills 迁为单一共享源（两 harness 共用，4 个 opencode 特化 skill 改写为中立表述）；**agents 与约束文件**每 harness 独立源 |
| 3 | 部署默认 | **Claude 显式启用**：默认仍仅 opencode；Claude 需 `--tools claude` 或交互勾选（`supportedTools` claude 条目 `enabled:false`） |
| 4 | 交付 | 本方案文档入仓；实现由 opencode 侧调度执行 |
| 5 | 模型来源 | **cc-switch 为权威源**（`~/.cc-switch/`）；**不反向查询 Claude Code 侧模型列表**；**不假定 DeepSeek 为默认聚合供应商**（其他用户可能用别的聚合供应商） |
| 6 | 框架模板模型字段 | **供应商中立**：模板默认 `model: inherit`；具体厂商模型 ID 只出现在「本机填写示例」（§三）与部署文档，不硬编码进框架默认值 |

## 三、模型清单与映射（cc-switch 中转）★

### 3.1 来源与方法

- 权威源 = **cc-switch**：`~/.cc-switch/cc-switch.db`（providers 表）+ cc-switch 实际写入 Claude Code 的 `~/.claude/settings.json` 结果。
- **不反向查询 Claude Code 的模型列表**（中转的 `/v1/models` 为空；Claude Code 的 modelPicker 只是 cc-switch 写入的镜像子集，不是权威清单）。
- 本机实测（2026-10-10）：cc-switch v4.0.3 对 `claude` 类型启用本地中转代理 `http://127.0.0.1:15721`；已配置 2 个提供商——**DeepSeek**（当前激活）与 **Zhipu GLM**。

### 3.2 模型 ID 规则（cc-switch → Claude Code）

```
ccs-claude-<provider-slug>--<model-id>[1M]
例：ccs-claude-deepseek--deepseek-flash[1M]   ccs-claude-zhipu--glm-5.3-flash[1M]
```

- `<provider-slug>` = cc-switch 提供商短名（本机：`deepseek` / `zhipu`）。**注意与 opencode auth.json 的 provider key 可能不同名**（opencode 侧是 `zhipuai`）。
- `[1M]` = 1M 上下文变体标记（无后缀 = 默认上下文）。
- **别名会漂移**：`haiku/sonnet/opus/fable` 由 cc-switch 按「当前激活提供商」动态写入 `ANTHROPIC_DEFAULT_*_MODEL` env（切到 Zhipu 时 sonnet/opus 会变成 glm 模型）。**要固定模型必须写完整 ID**。

### 3.3 本机可用模型（cc-switch 当前配置）

| 逻辑模型 | Claude Code 侧完整 ID | 备注 |
|---|---|---|
| deepseek-flash | `ccs-claude-deepseek--deepseek-flash` / `…-flash[1M]` | 无后缀变体当前占 haiku 槽位 |
| deepseek-v4-pro | `ccs-claude-deepseek--deepseek-v4-pro[1M]` | |
| glm-5.3-flash | `ccs-claude-zhipu--glm-5.3-flash[1M]` | |
| glm-5.3 | `ccs-claude-zhipu--glm-5.3[1M]` | |

（cc-switch modelPicker 中即为这 4 项 + 变体；历史请求还见 deepseek-v4.1-flash / deepseek-v4-flash / glm-5.2，未进当前清单。）

### 3.4 逐角色映射表（Claude Code 侧 / opencode 侧）

| 角色 | opencode 侧（现状/建议） | Claude Code 侧（本机填写值） |
|---|---|---|
| planner / schemer（深度规划） | 未显式（随会话默认，惯例 DeepSeek V4 Pro） | `ccs-claude-deepseek--deepseek-v4-pro[1M]`（或 `inherit`） |
| executor（执行实现） | `deepseek/deepseek-flash` | `ccs-claude-deepseek--deepseek-flash[1M]` |
| utility（轻量机械操作） | `deepseek/deepseek-flash` | `ccs-claude-deepseek--deepseek-flash[1M]` |
| vision（多模态视觉） | `deepseek/deepseek-flash` | `ccs-claude-deepseek--deepseek-flash[1M]` |
| reviewer（交叉审查） | `zhipuai/glm-5.3-flash` | `ccs-claude-zhipu--glm-5.3-flash[1M]` |
| feel-tester / archiver | 未显式（随默认） | `inherit`（或 v4-pro） |
| 主会话（feel 角色） | `default_agent: feel` | settings.json `model`（本机现为 deepseek-flash[1M]） |

### 3.5 填写位置与注意事项

- **写入位置**：Claude 侧 = subagent frontmatter `model:`（建议 reviewer/executor/utility/vision 显式，其余 `inherit`）；opencode 侧 = agent 模板 frontmatter 或全局 `opencode.jsonc` 的 `agent.<name>.model`（框架已管 vision/reviewer）。
- 框架**模板默认值用 `inherit`**（供应商中立，见决策 6）；§3.4 表作为「本机覆盖示例」写入部署文档/README，不作为模板硬编码。
- 本机观察：cc-switch settings 表另有 `common_config_opencode`（内容与 openfeel 全局 opencode.jsonc 镜像）——后续 opencode 侧配置时注意与 `openfeel setup` 的深合并不要互相覆盖。
- **验证项**（实现期首 op）：部署后派发一次 reviewer subagent，实测自定义模型 ID 在 Claude Code 中可用。

## 四、目标映射总览（资产级）

| 资产 | opencode（现状） | Claude Code（目标） | 说明 |
|---|---|---|---|
| 全局约束 | `~/.config/opencode/AGENTS.md` | `~/.claude/CLAUDE.md`（独立模板） | 唯一全局载体；用户已有 CLAUDE.md 时用受管区 append 保护 |
| 主 agent | `feel`（primary） | **不部署为 subagent**；编排纪律并入 CLAUDE.md | Claude 无 default_agent 概念 |
| 8 个 subagent | `~/.config/opencode/agents/*.md` | `~/.claude/agents/openfeel-*.md` | 独立模板源；frontmatter 结构化映射（§六） |
| 17 个 skills | `~/.config/opencode/skills/<n>/SKILL.md` | `~/.claude/skills/<n>/SKILL.md` | **共享中立源**（name+description 格式两平台兼容） |
| 平台配置 | 全局 opencode.jsonc 深合并 | **不写 settings.json** | 严格 JSON 且为用户高频占用文件；后续版本可议 opt-in |
| 项目级 | 项目根 opencode.jsonc（仅 $schema） | 无（治理在 `.openfeel/`） | init 不加 Claude 分支 |
| model 命令 | 三层 scope | 本期不做 | 后续版本 |

## 五、目标产物结构与构建管线

### 5.1 templates-data 新布局

```
src/core/templates-data/
├── skills/                          # 【迁移】共享中立源（17 个，两 harness 共用）
├── agents-md/{zh-CN,en}.md          # 【保持】opencode 全局约束源（不动，零回归）
├── opencode/{ADAPTER.*, agents/{zh-CN,en}/}   # 【保持】9 agents（feel + 8）
└── claude/                          # 【新增】Claude Code 独立源
    ├── constraint/{zh-CN,en}.md     #   CLAUDE.md 模板（§八）
    └── agents/{zh-CN,en}/*.md       #   8 个 subagent（§六/§七）
```

### 5.2 build.js 改动（关键点）

| 位置 | 改动 |
|---|---|
| `build.js:35` | `SKILLS_DIR` 重指向 `templates-data/skills/` |
| `:262-294`、`:825` | opencode skill 注入/校验改读共享源 |
| 新增（仿 `:213-255`/`:145-173`/`:745-810`） | `generateClaudeAgentTemplates` → `CLAUDE_AGENT_TEMPLATES` 锚点；`generateClaudeConstraintTemplate` → `CLAUDE_CONSTRAINT_TEMPLATES` 锚点；对应校验函数 |
| `:1019-1037`（单源一致性） | 追加：`listClaudeAgentIds == listAgentIds − {feel}`（键集）；冗余树断言扩为 `templates-data/opencode/skills` 必须不存在（防旧树复活，现 `:1028`） |
| `:1054-1070` | 主流程 6 步 → 8 步；追加 `validateClaudeTemplates()` |

### 5.3 template-loader.ts 新 API

`loadClaudeConstraintTemplate(lang)`、`loadClaudeAgentTemplate(lang, id)`、`listClaudeAgentIds(lang)`（8 个，无 feel）；语义沿 `loadAgentTemplate`（`:3753`，语言回退 zh-CN + 缺失抛错）。

## 六、8 个 Claude subagent frontmatter 映射

**推导规则**：`tools` 白名单 = opencode `permission:` 键集 ∪ **正文实际使用的工具**（已核验正文缺口：executor 用 edit/todowrite、planner/schemer 用 skill()、feel-tester/archiver 需编辑权限——**必须补齐，Claude 下白名单不列即不可用**）。**所有 8 个白名单一律不含 Task**（subagent 不互调；`task(explore)` 统一改「主会话经 Task 调度 Explore / [HANDOFF] 标记」，由主会话解析）。

| 源文件 | name | description 改写要点 | tools 白名单（粗体=补齐） | effort / color / model |
|---|---|---|---|---|
| openfeel-planner | `openfeel-planner` | 计划官：roadmap/plan.md/deps.yaml；只读 | Bash, Read, Glob, Grep, **Skill** | max / purple / inherit |
| openfeel-schemer | `openfeel-schemer` | 阶段拆解为 op-NNN 方案；只读 | Bash, Read, Glob, Grep, **Skill** | max / blue / inherit |
| openfeel-executor | `openfeel-executor` | 按 op 方案编码 + 自测 + commit | Bash, Read, Glob, Grep, **Edit, Write, TodoWrite** | medium / red / inherit |
| openfeel-reviewer | `openfeel-reviewer` | 交叉审查、提交 REV；只审不改 | Bash, Read, Glob, Grep | medium / yellow / inherit（可选异族增强） |
| openfeel-feel-tester | `openfeel-feel-tester` | 正式测试验收、BUG 记录 | Bash, Read, Glob, Grep, **Edit, Write, Skill** | medium / orange / inherit |
| openfeel-utility | `openfeel-utility` | 机械性文件操作/命令运行 | Bash, Read, Glob, Grep, Edit, Write | low / blue / inherit |
| openfeel-vision | `openfeel-vision` | 图像/截图结构化分析 | Bash(只读), Read, Glob, Grep | medium / cyan / inherit |
| openfeel-archiver | `openfeel-archiver` | 归档、kb 提取、manual 维护 | Bash, Read, Glob, Grep, **Edit, Write** | low / green / inherit |

- 丢弃 opencode 专有字段 `mode:`/`permission:`/`reasoning_effort:`；`effort` 直接同域映射（low/medium/max）；`color` hex→命名近邻。
- `model` 默认全 `inherit`（供应商中立，决策 6）；本机覆盖值见 §3.4。
- `external_directory` 在 Claude 无对等概念 → 正文加一句说明（跨目录读写受会话权限与 tools 白名单共同约束，不模拟）。

## 七、正文适配清单（8 个 agent）

统一替换规则：
- **R1** 工具名：`read/glob/grep/edit/write/todowrite/bash` → `Read/Glob/Grep/Edit/Write/TodoWrite/Bash`
- **R2** `task`/`task(explore)` → 「主会话经 Task 调度 Explore / `[HANDOFF: openfeel-x]`」
- **R3** `skill("openfeel-x")` → 「加载 `openfeel-x` skill」（Skill 工具语法待首 op 实测微调）
- **R4** `question` 工具 → 「返回主会话，由其向用户确认」
- **R5** 「Feel」→「主会话（Feel 角色）」，明确 subagent 不互调
- **R6** 「重启 opencode」→「Claude：agents/skills 热更新；首次创建目录需重启/`/reload-skills`；CLAUDE.md 下次会话生效」

关键逐文件点（zh/en 行号对齐）：reviewer `:96` `opencode --version`→`claude --version`、`:29-30` AGENTS.md 引用→`~/.claude/CLAUDE.md`；archiver `:21/:46` 与 utility `:40` 的 `.opencode/agents/*.md` 路径改平台口径；vision `:53` 无 write/task 权限表述改白名单口径；8 个文件「模型选择」节（vendor 模型）统一改为「由 Claude 侧模型决定（默认 inherit）」+ external_directory 说明。

## 八、CLAUDE.md 约束模板（≤ 约 650 行）

基于 `templates-data/agents-md/zh-CN.md`（507 行，约 85% 平台中立直接复用）+ feel.md 核心纪律蒸馏（约 130-160 行）：

| 节 | 改写要点 |
|---|---|
| 头注 `:3` | 部署说明改「Claude Code 适配器：`~/.claude/CLAUDE.md`（尊重 `CLAUDE_CONFIG_DIR`）」 |
| `:69-85` 工具约束 | 工具名改 Claude；「Feel」→「主会话（Feel 角色）」 |
| `:87-101` Agent 体系表 | 9 行 → 「8 subagents + 主会话」；调起方式列改「Claude subagent（Task 调度）」 |
| `:103-113` 权限模型节 | 整节重写：① subagent `tools`/`disallowedTools`/`permissionMode`；② 本期不写 settings.json；③ 生效时机（热更新/首次创建需重启）；④ 无 external_directory 对等概念 |
| feel.md 去向 | 直接操作白名单/委托边界/硬性纪律/流程不可跳过/Handoff/多模态自动委派/空白项目搭建/核心职责/健康探测/日志纪律/记忆加载/冲突检测/决策追加/子代理返回精简 → **压缩进 CLAUDE.md**；模型配置节（auth.json/opencode.jsonc）**删除**（替换为 2 行说明）；技能与命令表更新为 8 subagent |
| 其余（行为准则/编码风格/工作区结构/版本管理） | 整段复用 |

## 九、共享 skills 中立化改写要点

统一约定：正文以能力名叙述；平台差异以 `### opencode 适配器` / `### Claude Code 适配器` 两小节分列（**opencode 小节逐字保留原文，零回归**）。

| skill | 要点 |
|---|---|
| `openfeel-agent-model-check` | auth.json/opencode.jsonc/重启节 → 分节；Claude 节：无 auth.json，模型由 Claude 侧（/model、settings/env、网关）决定 |
| `openfeel-model-config` | 配置位置/优先级链/多模态规则 → 分节；Claude 链：项目 `.claude/agents` > 用户 `~/.claude/agents`，frontmatter `model` 优先于 inherit |
| `openfeel-model-check` | 平台识别表中 **`claude/claude.json` 是错误事实**（Claude Code 无此文件）→ 改为「Claude Code 无平台配置文件；全局约束 `~/.claude/CLAUDE.md`；本期不写 settings.json」；agents 目录扫描、角色回退表（feel 行）、`question`/Feel 措辞同步 |
| `openfeel-cli-usage` | 升级流程「重启 harness（opencode）」→ 分平台说明（`--tools`、Claude 重启/`/reload-skills` 语义）；权限模型节分节 |
| 轻改 3 个 | `openfeel-tool-usage`（工具名映射表）、`openfeel-workspace:32`（「全局 AGENTS.md」→「全局规则文件（Claude: CLAUDE.md）」）、`openfeel-check-kb:91`（skill 调用语法） |
| Feel 措辞 6 个 | 共 11 处 → 首次「主会话（Feel）」、其后「主会话」 |

## 十、部署编排设计

### 10.1 global-paths.ts（新增，homedir 单点保持）

`getClaudeConfigDir()`（**`CLAUDE_CONFIG_DIR` 非空优先**，须在函数体内读 env 以保测试可注入）、`getClaudeAgentsDir()`、`getClaudeSkillsDir()`、`getClaudeMdPath()`。

⚠️ 新发现：`backup.ts:60-65` 的 `computeBackupRel` 对 HOME 之外路径抛错 → `CLAUDE_CONFIG_DIR` 指到 HOME 外时既有文件更新将全部「备份失败→skipped+anomaly」（首次安装不受影响）。**建议纳入**：`global-external/<sha8>/…` fallback（改动局限 1 函数 + 2 测试）；否则文档限制「须位于 HOME 内」。（开放决策 D-CFG）

### 10.2 core/setup.ts

签名扩展 `setupGlobalFramework(lang, tools = ['opencode'])`；按 tools 门控：opencode 分支现状原样；claude 分支 = CLAUDE.md + 8 agents + 17 skills（复用 `deployGlobalAsset` 与共享 `SKILL_DEFINITIONS`），**不写 settings.json**。幂等不变式：默认二次运行仍 27 skipped；双 harness 二次 = 53 skipped。

### 10.3 core/update.ts

- 早退条件 `:1612-1615` 改「两工具都未选才返回空」；opencode 专属段用 `doOpencode` 包裹，新增 `doClaude` 对称分支。
- `getIncomingContent`（`:1843-1870`）追加 CLAUDE.md / claude agents / claude skills 三分支。
- 重启提醒（`:1727-1735`）按 harness 组合输出（含 Claude 首次创建/`/reload-skills` 提示）。
- **CLAUDE.md 走既有受管区三态**（`deployGlobalAsset` 零改动）：用户已有 CLAUDE.md（无标记）→ **末尾 append，不覆盖、不破坏**；含标记 → 仅替换区内。

### 10.4 supportedTools 与命令面

- `core/update.ts:66` 注释转正式条目：`{ id:'claude', name:'Claude Code', …, enabled:false }`。
- **回归守卫（高危点 R-5）**：`commands/update.ts:44` 现 `supportedTools.map(t=>t.id)` 会随新条目把 claude 带入默认部署 → **必须改 `filter(t=>t.enabled)`**。
- `commands/update.ts` + `commands/setup.ts` 新增 `--tools <list>`（非法值报错 exit 1；setup 不加交互勾选）。

### 10.5 deployment-check 与 i18n

- 单 `openfeel_version` 槽语义成立（任一 harness 部署都会刷新）；局限：mixed-tool 假 ok（升级后只跑默认 setup）→ 文档固定「按已启用 `--tools` 集合重跑」；可选追加 `deployed_tools?: string[]` 附加字段（不改判定/退出码，开放决策 D-STATE）。
- i18n：**新增 7 键**（`help.update.tools`、`help.setup.tools`、`update.toolsInvalidTmpl`、`update.nonInteractiveToolsTmpl`、`update.restartHarnessTmpl`、`setup.restartHarnessTmpl`、`update.claudeReloadHintTmpl`，替换硬编码 `core/update.ts:93/1730`、`commands/setup.ts:52`）→ 基线 **761 → 768**（双处登记）；**修订 6 个**含 opencode 措辞键（globalStale/globalMissing/checkMismatch/checkMissing/help.setup/help.init.workspaceOnly）为 harness 中性；其余 12 个 opencode 语境的键不改。

## 十一、测试与 CI 改动清单

> 测试基线（2026-10-10 实测）：64 文件 / 约 1140 用例；实现时以各阶段 `npm test` 实测登记为准。

| 文件 | 改动要点 |
|---|---|
| `test/core/global-paths.test.ts` | claude 4 路径断言 + `CLAUDE_CONFIG_DIR` 三态（设/空/空白，保 env 恢复） |
| `test/core/setup.test.ts` | 默认 setup 不触 `~/.claude`；`['opencode','claude']` → 8 agents/17 skills/CLAUDE.md；二次 53 skipped |
| `test/core/update.test.ts` | `['claude']` 部署 26 文件；默认**零触** `~/.claude`；用户 CLAUDE.md 无标记→appended 且内容逐字保留；含标记→仅区内；malformed→skipped+anomaly |
| `test/core/templates.test.ts` | `:11` SKILLS_DIR 改共享源；中立化断言（4 skill 双平台小节并存、opencode 关键串仍在小节内） |
| `test/core/template-loader.test.ts` | claude 8 id、不含 feel、zh/en 键集一致、frontmatter 必填；**负向门禁**：claude 模板不含 `mode:`/`permission:`/`reasoning_effort:`/`.opencode/` |
| 新增 `test/core/claude-adapter.test.ts` | 跨切面：任何路径不产生 settings.json；name==文件名；agents 数 == opencode − 1；CLAUDE.md ≤700 行软断言 |
| `test/commands/{setup,update}.test.ts` | `--tools` 各场景 + 默认行为逐字回归（R-5 守卫） |
| `test/core/deployment-integration.test.ts` | 场景 E/F：claude 单装/双装后 `checkGlobalDeployment` ok |
| `.github/workflows/ci.yml` | Env guard 快照追加 `"$HOME/.claude"`（防测试污染真实用户目录） |

预计新增 ~25-30 用例；`lint i18n` 新基线 **768** 双处登记。

## 十二、阶段拆分建议（v1.1.6，stage-68 起串行）

| 阶段 | 目标 | 主要交付 | 门禁 | 依赖 | op 估 |
|---|---|---|---|---|---|
| stage-68 | 模板管线多源化（**零内容变更**） | skills 迁 `templates-data/skills/`；build.js `:35/:262-294/:825/:1028`；测试路径同步 | build ×2 幂等；内容零 diff；lint i18n=761 | — | 2 |
| stage-69 | **Claude 内容适配（最重）** | `templates-data/claude/**`（8×2 agents + 约束×2）；build.js 注入/校验/单源断言；template-loader 3 API；模型 ID 可用性实测 | claude 模板静态门禁；build ×2；人工验证清单（8 agent 可识别） | 68 | 4-5 |
| stage-70 | 共享 skills 中立化 | 4 重写 + 3 轻改 + 6 个 Feel 措辞；中立化断言 | opencode 关键串零回归断言 | 68 | 2-3 |
| stage-71 | 部署编排与命令面 | global-paths 4 函数；setup/update 双分支；`--tools`；i18n 7 新键+6 修订（768）；D-CFG 若采纳；测试 | npm test 0 failed/skipped；tsc 0；默认路径回归 | 69,70 | 3-4 |
| stage-72 | 文档与版本收口 | README×3、GETTING_STARTED、commands、manual、CHANGELOG、版本 A/B/C/D/E、CI guard、roadmap/plan 归档 | 全门禁 + `--version`==1.1.6 + 环境零污染 | 71 | 2-3 |

（阶段注册/推进由 Feel 经 CLI 执行，不直写 flow.json。）

## 十三、风险与开放问题（摘要）

| # | 风险 | 缓解 |
|---|---|---|
| R-1/R-5 | skills 中立化改变 opencode 用户既有内容 / `update <path>` 默认把 claude 带入 | 双平台小节保原文；阴性断言；**filter(enabled) 修复 + 回归测试**（高危） |
| R-2/R-3 | CLAUDE.md ~650 行常驻全局上下文；feel 不部署 ⇒ 编排仅靠提示词 | 总量与 opencode 持平；feel 蒸馏 130-160 行；模板测试冻结核心纪律；文档说明 |
| R-4 | 首次创建 `~/.claude/agents|skills` 需重启/`/reload-skills`；CLAUDE.md 下次会话生效 | 专用 i18n 提示键 + 分平台升级文档 |
| R-6/R-7 | 单版本槽 mixed-tool 假 ok；CLAUDE_CONFIG_DIR 越界备份失败 | 文档口径 / 可选 deployed_tools?；D-CFG fallback |
| R-8/R-9 | Claude frontmatter/字段漂移；subagent 无 Task | 首 op 人工验证清单；仅用已核字段；白名单不含 Task + HANDOFF 改写 |
| R-12 | 全 inherit 时 reviewer 与主会话同模型 ⇒ 交叉审查退化 | 文档「可选增强表」（reviewer 指异族模型，如本机 `ccs-claude-zhipu--glm-5.3-flash[1M]`） |
| R-14 | 用户已有 CLAUDE.md 追加体量大；state 丢失时重复追加 | 标记机制 + 既有 >10 条追加警戒 + 复核规则进 CLAUDE.md |

开放问题：**Q1** subagent 是否可调 Task（stage-69 首 op 实测，定 task(explore) 改写终稿）；**Q2** `@import` 是否支持家目录路径（决定是否拆分短路由文件）；**Q3** `~/.claude/rules/` 作第二载体（备选，本期默认不用）；**Q4** D-CFG 纳入（建议是）/ D-STATE 可延后；**Q5** 仓库根 `claude/ADAPTER.md` 预留桩顺手更新（建议归档官处置）。

## 十四、验证方式（实现后的端到端验收）

1. **静态门禁**：`npm test`（0 failed/skipped）、`npx tsc --noEmit`、`openfeel lint i18n`（768）、`openfeel lint kb`、`npm run build` ×2 幂等且 `.opencode/**` 不复活、`--version`==1.1.6。
2. **默认非回归**：`openfeel setup` / `openfeel update <path>` 后 `~/.claude/` 零变化（R-5 守卫）。
3. **Claude 部署**：`openfeel setup --tools claude` → 断言 `~/.claude/CLAUDE.md`、`agents/` 8 文件、`skills/` 17 目录；预置无标记用户 CLAUDE.md 场景 → append 且用户内容逐字保留。
4. **Claude Code 实机**：重启会话（首次创建目录）→ 确认 8 个 subagent 出现在可用列表、skills 可 `/openfeel-*` 调用；**派发一次 reviewer subagent 实测 `model: ccs-claude-zhipu--glm-5.3-flash[1M]` 可用**（§3.5 验证项）；CLAUDE.md 约束下跑一轮最小流水线（flow status → 一个只读命令）。
5. **环境零污染**：CI env guard 五路径（含 `$HOME/.claude`）前后快照一致。

## 附：参考来源

- Claude Code 官方文档：claude-directory / memory / sub-agents / skills / settings / settings-reference / permissions / hooks / model-config（2026-10-10 核验）+ `CLAUDE_CONFIG_DIR` 语义（vercel-labs/skills#136）。
- 本机实测：`~/.cc-switch/cc-switch.db`（providers/proxy_config/settings）、`~/.claude/settings.json`、`~/.local/share/opencode/auth.json`、`~/.config/opencode/opencode.jsonc`。
- 仓库前置研究：`docs/agent-tool-compatibility-fix.md`（工具映射表/迁移检查清单）、`docs/research/*`（多 harness 方向）、`.openfeel/adapters/README.md`（适配器目录规范）。
