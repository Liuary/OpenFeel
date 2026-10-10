# v1.1.6-stage-69 计划 — Claude 内容适配（最重阶段）

- **阶段**：`v1.1.6-stage-69`
- **依赖**：**hard: `v1.1.6-stage-68`**（skills 权威源已迁共享源；本阶段新建 Claude 独立源并对齐 build 管线）
- **优先级**：P0（本版本内容核心）
- **制定人**：openfeel-planner ｜ **制定时间**：2026-10-10
- **定位**：建立 **Claude Code 侧全部内容模板**（`templates-data/claude/**`：**9×2 agents（含 `feel`）+ 约束×2**），打通 `build.js` 注入/校验/单源断言与 `template-loader` 运行时 3 API；完成 frontmatter 结构化映射与正文平台适配；实机验证 Claude Code 的 frontmatter 字段、模型 ID 可用性、subagent 能力边界（Q1/Q2）。
- **范围**：**新增** `src/core/templates-data/claude/{constraint/{zh-CN,en}.md, agents/{zh-CN,en}/*.md}`；`build.js`（新增 2 生成函数 + 2 校验 + 单源断言 + 主流程 6→8 步）；`src/core/template-loader.ts`（build 生成段，新增 3 API）；`test/core/template-loader.test.ts`、`test/core/templates.test.ts`、**新增** `test/core/claude-adapter.test.ts`。
- **边界**：**不改 skill 正文**（归 stage-70）；**不写 `settings.json`**（归 stage-73）；不接部署编排（`setup/update/global-paths` 归 stage-71）；不新增依赖；不 `npm publish`/`git push`；不改 `flow.json`。

## KB 检索（`openfeel-check-kb`）

- 已加载。**高度相关条目**：
  - `kb/architecture.md #模板单源架构` + `#多语言模板数据管线`（`templates-data` 源文件 → build 构建时内联 → template-loader 运行时按语言加载）→ 新增 Claude 源须沿同一管线，语言回退 zh-CN、缺失抛错。
  - `kb/patterns.md #新增 Agent 全链路更新清单模式`（新增 agent 的 9 项更新清单 + frontmatter 规范 + 构建验证）→ Claude agent 模板沿用（frontmatter 五字段 Claude 版）。
  - `kb/patterns.md #平台无关化「描述泛化」原则与边界` → agent description/正文的平台口径处理判据。
  - `kb/troubleshooting.md #模板断言的保护边界（build 注入常量 vs 源文件直读）` → 断言须针对 build 注入常量，避免读到未注入源。
  - `kb/patterns.md #命名前缀统一与子串陷阱处理` → `openfeel-` 前缀 + `feel` 例外在 Claude 侧同样成立（`feel` 不带前缀）。
  - **无**「Claude Code agent frontmatter 映射」条目 → 归档时补沉 patterns。

---

## 一、背景与实测证据（唯一事实基准）

| 事实 | 源码位置 | 结论 |
|------|----------|------|
| opencode agent 模板源 = `templates-data/opencode/agents/{zh-CN,en}/`（各 9，含 `feel.md`） | 目录实测 9×2 | Claude 侧独立源 `templates-data/claude/agents/{zh-CN,en}/`（各 **9**，含 `feel.md`） |
| 全局约束源 = `templates-data/agents-md/{zh-CN,en}.md` | `build.js:142-148` | Claude 侧独立源 `templates-data/claude/constraint/{zh-CN,en}.md` |
| build 生成函数范式（`generateOpencodeAgentTemplates` → 锚点注入） | `build.js:213-255`（agent）、`:145-173`（agents-md）、`:745-810`（校验） | 新增 `generateClaudeAgentTemplates`/`generateClaudeConstraintTemplate` 仿此 |
| 注入对象锚点：`AGENT_TEMPLATES` / `OPENCODE_AGENT_TEMPLATES` | `template-loader.ts`、`update.ts` | 新增 `CLAUDE_AGENT_TEMPLATES` 锚点（注入 `template-loader.ts`） |
| 单源一致性断言 | `build.js:1019-1036` | 追加 `listClaudeAgentIds == listAgentIds`（**9**）键集断言 |
| `loadAgentTemplate`/`listAgentIds`（`:3753/:3770`）；`loadOpencodeAgentTemplate`/`listOpencodeAgentIds`（`:7857/:7899`） | `template-loader.ts` | 新增 `loadClaudeConstraintTemplate`/`loadClaudeAgentTemplate`/`listClaudeAgentIds` |
| 主流程 6 步 | `build.js:1054-1059` | **扩为 8 步**（追加 2 生成调用）+ 追加 `validateClaudeTemplates()`（`:1068-1070` 区） |
| opencode agent frontmatter 含 `mode:`/`permission:`/`reasoning_effort:` | `templates-data/opencode/agents/**` | Claude 侧**丢弃**这三类；改 `effort`/`color`/`model`（Claude 已核字段） |
| `feel.md` 承载编排纪律（直接操作白名单/委托边界/硬性纪律/Handoff/日志纪律/记忆加载等） | `templates-data/opencode/agents/zh-CN/feel.md` | Claude 侧 `feel.md` 承载同构纪律；CLAUDE.md **不再**蒸馏 feel 纪律（裁定 B 反转） |

---

## 二、目标产物结构

```
src/core/templates-data/
├── skills/                              # stage-68 共享中立源（本阶段只读消费）
├── agents-md/{zh-CN,en}.md              # opencode 约束源（不动）
├── opencode/{ADAPTER.*, agents/{zh-CN,en}/}   # opencode 9 agents（不动）
└── claude/                              # 【新增】Claude Code 独立源
    ├── constraint/{zh-CN,en}.md         #   CLAUDE.md 模板（§四）
    └── agents/{zh-CN,en}/*.md           #   9 个 agent（feel + 8 个 openfeel-*）
```

**约束模板（CLAUDE.md）定位**：以 `templates-data/agents-md/{zh-CN,en}.md`（507 行，约 85% 平台中立）为基底，改写平台特定节；**feel 纪律不再蒸馏进 CLAUDE.md**（改由 `feel.md` 承载），故 CLAUDE.md 目标 ≈ **≤ 约 560 行**（`agents-md` 体量 ± 平台适配），**R-2 随之重估下调**（软断言见 §三 T5b）。

---

## 三、变更点清单（编号 T）

### T1 — `feel` agent 模板（9 个之一，主会话身份）

- 新增 `templates-data/claude/agents/{zh-CN,en}/feel.md`：
  - `name: feel`；description 描述「主会话编排统领」。
  - **`tools` 处置（R-13）**：**默认不设 `tools`（继承）**，避免收窄主会话工具集（`AskUserQuestion`/`EnterPlanMode`）。**列为实机验证项**：若继承导致 Claude 侧主会话不可用关键工具，回退为显式白名单并补齐。
  - 正文 = opencode `feel.md` 编排纪律的平台适配版（直接操作白名单 / 委托边界 / 硬性纪律 / 流程不可跳过 / Handoff / 日志纪律 / 记忆加载 / 健康探测 / 冲突检测 / 决策追加 / 多模态自动委派 / 空白项目搭建）。
  - **模型配置节删除**（auth.json/opencode.jsonc 相关）→ 替换为「模型由 Claude 侧决定（默认 inherit）」+ `external_directory` 无对等概念说明。

### T2 — 8 个 `openfeel-*` agent 模板 + frontmatter 映射

推导规则：`tools` 白名单 = opencode `permission:` 键集 **∪** 正文实际使用的工具（**补齐缺口**：executor 用 Edit/Write/TodoWrite；planner/schemer 用 Skill；feel-tester/archiver 需编辑权限）；**所有 subagent 白名单一律不含 Task**（Q1 实测定稿；`task(explore)` 统一改「主会话经 Task 调度 Explore / `[HANDOFF]` 标记」）。

| 源文件 | `name` | tools 白名单（粗体=补齐） | effort | color | model |
|---|---|---|---|---|---|
| openfeel-planner | `openfeel-planner` | Bash, Read, Glob, Grep, **Skill** | max | purple | inherit |
| openfeel-schemer | `openfeel-schemer` | Bash, Read, Glob, Grep, **Skill** | max | blue | inherit |
| openfeel-executor | `openfeel-executor` | Bash, Read, Glob, Grep, **Edit, Write, TodoWrite** | medium | red | inherit |
| openfeel-reviewer | `openfeel-reviewer` | Bash, Read, Glob, Grep | medium | yellow | inherit |
| openfeel-feel-tester | `openfeel-feel-tester` | Bash, Read, Glob, Grep, **Edit, Write, Skill** | medium | orange | inherit |
| openfeel-utility | `openfeel-utility` | Bash, Read, Glob, Grep, Edit, Write | low | blue | inherit |
| openfeel-vision | `openfeel-vision` | Bash(只读), Read, Glob, Grep | medium | cyan | inherit |
| openfeel-archiver | `openfeel-archiver` | Bash, Read, Glob, Grep, **Edit, Write** | low | green | inherit |

- **丢弃** opencode 专有字段：`mode:` / `permission:` / `reasoning_effort:`。
- `effort` 同域映射（low/medium/max）；`color` hex→命名近邻。
- `model` 默认全 `inherit`（供应商中立，裁定 E）；本机覆盖示例见大计划（不入模板硬编码）。
- `external_directory` 无对等概念 → 正文加一句说明（跨目录读写受会话权限与 tools 白名单共同约束，不模拟）。

### T3 — 正文适配清单（9 个 agent）

统一替换规则：

- **R1** 工具名：`read/glob/grep/edit/write/todowrite/bash` → `Read/Glob/Grep/Edit/Write/TodoWrite/Bash`。
- **R2** `task`/`task(explore)` → 「主会话经 Task 调度 Explore / `[HANDOFF: openfeel-x]`」。
- **R3** `skill("openfeel-x")` → 「加载 `openfeel-x` skill」（Skill 工具语法待 Q2/首 op 实测微调）。
- **R4** `question` 工具 → 「返回主会话，由其向用户确认」。
- **R5** 「Feel」→「主会话（Feel 角色）」，明确 subagent 不互调。
- **R6** 「重启 opencode」→「Claude：agents/skills 热更新；首次创建目录需重启/`/reload-skills`；CLAUDE.md 下次会话生效」。

关键逐文件点（zh/en 行号对齐）：

- **reviewer**：`opencode --version` → `claude --version`；`AGENTS.md` 引用 → `~/.claude/CLAUDE.md`。
- **archiver / utility**：`.opencode/agents/*.md` 路径 → 平台口径（`~/.claude/agents/*.md`）。
- **vision**：无 write/task 权限表述 → 改白名单口径。
- **全部 9 个**「模型选择」节 → 「由 Claude 侧模型决定（默认 inherit）」+ `external_directory` 说明。

### T4 — 约束模板 `CLAUDE.md`（`constraint/{zh-CN,en}.md`）

| 节 | 改写要点 |
|---|---|
| 头注 | 部署说明改「Claude Code 适配器：`~/.claude/CLAUDE.md`（尊重 `CLAUDE_CONFIG_DIR`）」 |
| 工具约束节 | 工具名改 Claude；「Feel」→「主会话（Feel 角色）」 |
| Agent 体系表 | 9 行 → 「**9 agents（含主会话 feel）+ Task 调度**」；调起方式列改「Claude subagent（Task 调度）」 |
| 权限模型节 | 整节重写：① subagent `tools`/`disallowedTools`/`permissionMode`；② **本期由 stage-73 注入 `settings.json`**（`agent:"feel"` + `permissions.defaultMode:"auto"`）；③ 生效时机（热更新/首次创建需重启）；④ 无 `external_directory` 对等概念 |
| `feel` 纪律去向 | **不再蒸馏进 CLAUDE.md** → 由 `feel.md` 承载（裁定 B） |
| 其余（行为准则/编码风格/工作区结构/版本管理/模块手册/上下文预算） | 整段复用（约 85% 中立） |

- **目标体量**：CLAUDE.md ≈ ≤ 560 行（R-2 重估）；模板测试冻结核心纪律存在性软断言。

### T5 — `build.js` 注入/校验/单源断言

- **新增** `generateClaudeAgentTemplates()` → 注入 `CLAUDE_AGENT_TEMPLATES`（仿 `:213-255`），遍历 `templates-data/claude/agents/{zh-CN,en}/*.md`。
- **新增** `generateClaudeConstraintTemplate()` → 注入 `CLAUDE_CONSTRAINT_TEMPLATES`（仿 `:145-173`）。
- **新增** `validateClaudeTemplates()`：必填 frontmatter 字段（`name`/`description`）+ **阴性断言**（不含 `mode:`/`permission:`/`reasoning_effort:`/`.opencode/`）。
- **单源断言扩展**（`:1019-1036`）：追加 `listClaudeAgentIds(lang) == listAgentIds(lang)`（键集 **9**，**含 feel**，不再 −1）。
- **主流程 6→8 步**（`:1054-1059`）：追加两个生成调用；`:1068-1070` 追加 `validateClaudeTemplates()`。

### T6 — `template-loader.ts` 3 API（build 生成段）

```ts
export function loadClaudeConstraintTemplate(lang: string): string;
export function loadClaudeAgentTemplate(lang: string, agentId: string): string;
export function listClaudeAgentIds(lang: string): string[];   // 9 个（含 feel）
```

- 语义沿 `loadAgentTemplate`（语言回退 zh-CN + 缺失抛错）；**由 build 注入 `CLAUDE_AGENT_TEMPLATES`/`CLAUDE_CONSTRAINT_TEMPLATES` 生成段**，**禁手改**。

### T7 — 测试面

| # | 用例 | 断言 |
|:-:|------|------|
| T7.1 | `template-loader` claude | `listClaudeAgentIds` = **9**，含 `feel`；zh/en 键集一致；frontmatter 必填齐全 |
| T7.2 | 阴性门禁 | Claude agent 模板**不含** `mode:`/`permission:`/`reasoning_effort:`/`.opencode/` |
| T7.3 | 约束模板 | `loadClaudeConstraintTemplate` zh/en 可读；核心节存在（行为准则/编码风格/工作区结构/版本管理） |
| T7.4 | 单源断言 | `listClaudeAgentIds == listAgentIds`（键集） |
| T7.5 | `test/core/claude-adapter.test.ts`（**新增**） | `name == 文件名`；CLAUDE.md ≤ 阈值软断言；跨切面：任何路径不产生 `settings.json`（本阶段） |
| T7.6 | build ×2 | 幂等；`.opencode/**` 与冗余树不复活 |

### T8 — 模型 ID 可用性 + Q1/Q2 实机验证（首 op）

- 部署前置（临时隔离 HOME）后**派发一次 reviewer subagent**，实测 `model: ccs-claude-zhipu--glm-5.3-flash[1M]`（或本机等效自定义 ID）**在 Claude Code 中可用**。
- **Q1**：subagent 是否可调用 Task → 定稿 `task(explore)` 改写。
- **Q2**：CLAUDE.md `@import` 是否支持家目录路径 → 决定是否拆短路由文件。
- 产出「人工验证清单」附于阶段报告（8 agent 可识别、skills 可 `/openfeel-*` 调用）。

### T9 — 门禁与阶段报告

- `npm test` 全绿 `0 skipped / 0 failed`；`tsc` = 0；`lint i18n` = **761**（本阶段**不新增键**）；`lint kb` = 0；`npm run build` ×2 幂等；`.opencode/**` 与冗余树不复活。

---

## 四、op 划分与执行顺序（**4~5 op**）

| op | 主题 | 覆盖 | 关键产出 | 依赖 |
|:--:|------|------|----------|------|
| **op-001** | 内容源搭建：`feel` + 8 agent frontmatter/正文 + 约束模板 | T1+T2+T3+T4 | `templates-data/claude/**`（9×2 + 约束×2） | hard: stage-68 |
| **op-002** | build 注入/校验/单源断言 + 主流程 8 步 | T5 | `build.js` | hard: op-001 |
| **op-003** | template-loader 3 API（生成段） | T6 | `template-loader.ts` | hard: op-002 |
| **op-004** | 测试 + 阴性门禁 + 新增 claude-adapter 测试 | T7 | 测试；`test/core/claude-adapter.test.ts` | hard: op-003 |
| **op-005** | 模型 ID 实机验证 + Q1/Q2 定稿 + 门禁 + 报告 | T8+T9 | 验证清单；阶段报告 | hard: op-004 |

**顺序：op-001 → op-002 → op-003 → op-004 → op-005。**

**边界声明**：不改 skill 正文；不写 `settings.json`；不接部署编排；不新增依赖；不改 `flow.json`。

---

## 五、验收标准（阶段级）

1. **产物齐全**：`templates-data/claude/agents/{zh-CN,en}/` 各 **9**（含 `feel.md`）；`constraint/{zh-CN,en}.md` 各 1。
2. **frontmatter 合规**：Claude agent 仅含已核字段（`name`/`description`/`tools`?/`effort`/`color`/`model`）；**不含** `mode:`/`permission:`/`reasoning_effort:`。
3. **单源断言**：`listClaudeAgentIds == listAgentIds`（键集 9，含 feel）。
4. **构建**：`npm run build` ×2 幂等；`.opencode/**` 与 `templates-data/opencode/skills` 不复活。
5. **运行时 API**：`loadClaudeConstraintTemplate`/`loadClaudeAgentTemplate`/`listClaudeAgentIds` 可用，语言回退与缺失抛错语义正确。
6. **实机验证**：reviewer subagent 自定义模型 ID 可用；8 个 `openfeel-*` + `feel` 可识别；Q1/Q2 定稿留痕。
7. **门禁**：`npm test` 全绿 `0 skipped`；`tsc` = 0；`lint i18n` = 761；`lint kb` = 0。

---

## 六、风险与回滚

| # | 风险 | 影响 | 缓解 / 回滚 |
|:-:|------|------|-------------|
| R-8 | Claude frontmatter 字段漂移（未知字段静默丢弃） | 中 | 仅用已核字段；op-005 实机验证清单；阴性断言 |
| R-9 | subagent 无 Task 能力 | 中 | 白名单不含 Task + `[HANDOFF]` 改写；Q1 实测定稿 |
| R-13 | `feel` 设 `tools` 收窄主会话 | 中 | **默认不设 tools（继承）**；验证 `AskUserQuestion`/`EnterPlanMode` 可用 |
| R-2' | CLAUDE.md 体量反弹 | 低 | feel 纪律外置 `feel.md`；软断言 ≤ 阈值 |
| R-新1 | 单源断言仍按「opencode − 1」误判 | 中 | 断言改 `== listAgentIds`（9）；T7.4 |
| R-新2 | build 断言读到未注入源（保护边界） | 中 | 断言针对 build 注入常量（防源文件直读假绿） |

**回滚**：`git revert <sha>`；新增纯内容 + build 管线，无数据迁移。

## 七、边界（不做）

1. 不做 skills 中立化改写（归 stage-70）。
2. 不写 `settings.json`、不建 `claude-settings.ts`（归 stage-73）。
3. 不接 `setup/update/global-paths` 部署编排（归 stage-71）。
4. 不新增依赖；不改 CI；不 `npm publish`/`git push`；不改 `flow.json`。

## 八、交付给 stage-71/73 的集成契约

- **源与 API**：`templates-data/claude/**`（9×2 agents + 约束×2）；`loadClaudeConstraintTemplate(lang)`/`loadClaudeAgentTemplate(lang,id)`/`listClaudeAgentIds(lang)`（9，含 feel）。
- **注入锚点**：`CLAUDE_AGENT_TEMPLATES`、`CLAUDE_CONSTRAINT_TEMPLATES`（build 生成，禁手改）。
- **单源不变量**：Claude agents 键集 == opencode agents 键集（均 9）。
- **阴性不变量**：Claude agent 模板不含 opencode 专有字段。
- **`feel` 工具策略**：默认继承（不设 `tools`）；如需收窄须回归验证。

## 九、修订记录

| 时间 | 制定人 | 说明 |
|------|--------|------|
| 2026-10-10 | openfeel-planner | 初稿：T1~T9；4~5 op；验收 7 条；锁定「9 agent（含 feel）+ 约束 2 + build 8 步 + 单源断言 == 9 + 阴性门禁」；Q1/Q2/模型 ID 实机验证留 op-005。 |
