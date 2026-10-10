# OpenFeel v1.1.6 — Claude Code 适配器（多 harness 并存）

> **版本**：v1.1.6（Z 级递增，功能版） | **创建日期**：2026-10-10 | **Planner**：openfeel-planner
> **规模判定**：**大规模**（6 阶段，跨 `templates-data/**` / `build.js` / `core/template-loader` / `core/global-paths` / `core/setup` / `core/update` / `core/backup` / `commands/{setup,update}` / `i18n-data` / `docs` / 版本载体 多模块，含**架构级资产分层调整**与**命令面增量**）→ 走独立 openfeel-planner → openfeel-reviewer 完整流程。
> **定位**：新增 **Claude Code 适配器**——把全局约束文件（`CLAUDE.md`）、**9 个 agent**、17 个 skills 与 `settings.json` 注入部署到 `~/.claude/`，与现有 opencode 适配器**并存**；Claude 侧**显式启用**（`--tools claude` 或交互勾选），**不影响默认行为**（默认仍仅 opencode）。
> **技术蓝本**：`docs/claude-code-adapter-plan.md`（v1.0，266 行，含逐文件改动清单、frontmatter 映射、部署编排、测试/CI 清单、阶段拆分）。
> **阶段计划**：`.openfeel/plan/v1/stage-68/plan.md` … `stage-73/plan.md`（共 6 份）。
> **路线图**：`.openfeel/roadmap/v1.1.6.md`。
> **系列**：`v1`；`stageDir` 映射 `stage-68` ~ `stage-73`；阶段 ID 自 `v1.1.6-stage-68` 起（承接 v1.1.5 的 stage-67）。
> **当前基线**：CLI `1.1.5`；flow `pipeline.phase = done`（68 阶段全 done）；`lint i18n` = **761**；`lint kb` = 0。

---

## 一、背景与需求来源

- **需求主题（用户已确认）**：OpenFeel 当前**仅适配 opencode**（`openfeel setup/update` 把全局 `AGENTS.md`、9 个 agent、17 个 skill、`opencode.jsonc` 部署到 `~/.config/opencode/`）。本期新增 **Claude Code 适配器**：全局约束 `~/.claude/CLAUDE.md`、**9 个 agent**、17 个 skills、`settings.json` 注入部署到 `~/.claude/`，与 opencode **并存**；Claude 侧**显式启用**。
- **首要蓝本**：`docs/claude-code-adapter-plan.md`（本计划大量引用其行号与结论，**以源码/实测为准**）。
- **用户裁定（蓝本 §二，2026-10-10）**：① 核心适配范围；② 17 skills 迁为**单一中立共享源**，agents 与约束文件**每 harness 独立源**；③ Claude **默认不启用**（`--tools claude` 或交互勾选，`supportedTools` claude 条目 `enabled:false`）；④ **模型权威源 = cc-switch**、供应商中立、模板默认 `model: inherit`。
- **用户本次追加裁定（2026-10-10，改写原方案 §四关键裁定）**：
  1. **automod**：`"automod"` 确认为 **auto mode**，需注入 `permissions.defaultMode: "auto"`；**不加** `autoMode` 自定义规则。
  2. **默认 agent = `feel`**：部署 `~/.claude/agents/feel.md`（命名 `feel`）并在 `settings.json` 注入 `"agent": "feel"`（主会话以该命名 agent 身份启动，采用其 system prompt/tools/model）。
  3. **`settings.json` 注入为一等能力**：`~/.claude/settings.json` 注入作为 `openfeel setup/update --tools claude` 的正式能力——与 `CLAUDE.md` / agents / skills **一并部署**。
- **知识库检索（`openfeel-check-kb`）结果**：已加载。**高度相关条目**：
  - `kb/architecture.md #模板单源架构：templates-data/opencode 唯一权威源 + 双注入对象 + 单源一致性断言`（本期「skills 迁共享源」正是其延伸；**双注入对象不合并**、**冗余树断言**须同步扩展）。
  - `kb/architecture.md #全局部署架构：框架资产全局化 + 项目精简 + 双 state`（Claude 部署复用同一 `deployGlobalAsset` + 全局 state）。
  - `kb/architecture.md #仓库自身不再保留项目级部署资产`（Claude 侧同样**不产生项目级实例**）。
  - `kb/patterns.md #写策略按资产归属二分`（`settings.json` 属**用户高频占用资产** → 读-深合并-写回、备份后覆盖，**不整文件覆盖**）。
  - `kb/patterns.md #部署覆盖前自动备份机制`（`settings.json` 写入须接入既有备份，且受 `computeBackupRel` HOME 约束）。
  - `kb/patterns.md #JSONC 深度合并模式`（`settings.json` 为**严格 JSON**，须有独立深合并实现，不得复用 jsonc 剥注释/regex 逻辑）。
  - `kb/patterns.md #破坏性命令安全校验清单` + `#部署语境 vs 本仓语境命令口径二分`（`--tools` 非法值报错、文档口径）。
  - `kb/troubleshooting.md #双层模板源发散`（skills 迁移须与 build 注入/校验同步，防源发散）。
  - `kb/patterns.md #平台无关化「描述泛化」原则`（skills 中立化与 agent 正文改写的判定依据）。
  - **无**「Claude Code 适配器部署」条目 → 归档时补沉 architecture/patterns。

## 二、源码核验结论（以源码为准，行号以 HEAD `2799266` 为准）

| # | 事实 | 源码位置 | 结论 |
|:-:|------|----------|------|
| 1 | `supportedTools` 仅 opencode 一条 `enabled:true`，claude/cursor 为注释预留 | `core/update.ts:58-68` | 新增 claude 条目须**转正式对象**且 `enabled:false` |
| 2 | `update <path>` 走 `supportedTools.map(t => t.id)`（**不过滤 enabled**） | `commands/update.ts:43-45` | **高危 R-5**：新条目若被带入默认部署 → 违反「默认不启 Claude」；**必须改 `filter(t => t.enabled)`** |
| 3 | `selectTools()` 非 TTY 回退 `filter(t => t.enabled)` | `core/update.ts:94` | 交互路径天然排除 `enabled:false`；仅命令路径需修 |
| 4 | skills 权威源 = `templates-data/opencode/skills/`（17 个），`SKILLS_DIR` 与其同指 | `build.js:32-35`；目录实测 17 | 「迁共享源」= `SKILLS_DIR` 重指 `templates-data/skills/` + 3 处读点同步 |
| 5 | agents 权威源 = `templates-data/opencode/agents/{zh-CN,en}/`（各 9 个，含 feel） | 目录实测 9×2 | Claude 侧独立源 `templates-data/claude/agents/{zh-CN,en}/`（各 9，含 feel） |
| 6 | 全局约束权威源 = `templates-data/agents-md/{zh-CN,en}.md`（open 用） | `build.js:142-148` | Claude 侧独立源 `templates-data/claude/constraint/{zh-CN,en}.md` |
| 7 | build 主流程 6 步（agent/agents-md/skill/opencode-agent/opencode-skill/opencode-config 注入） | `build.js:1054-1059` | 追加 `generateClaudeAgentTemplates`/`generateClaudeConstraintTemplate` → 8 步 |
| 8 | 单源一致性校验 `validateSingleSourceConsistency` + 冗余树断言（`templates-data/agents`、`core-instructions`） | `build.js:1019-1036`（断言 `:1028`） | 追加 claude agents 键集断言；冗余树断言扩为含 `templates-data/opencode/skills` |
| 9 | `template-loader.ts` 有 `loadAgentTemplate`/`listAgentIds`（`:3753/:3770`）+ `loadOpencodeAgentTemplate`/`listOpencodeAgentIds`（`:7857/:7899`） | 三套 API 并存 | 新增 Claude 3 API：`loadClaudeConstraintTemplate`/`loadClaudeAgentTemplate`/`listClaudeAgentIds` |
| 10 | `global-paths.ts` **仅** `homedir` 单点，**无任何 claude 路径** | `global-paths.ts:1-91` | 新增 4~5 函数（含 `getClaudeSettingsPath`） |
| 11 | `computeBackupRel` 对 HOME 越界**抛 `BackupError`** | `core/backup.ts:60-65` | `CLAUDE_CONFIG_DIR` 指到 HOME 外时既有文件更新将「备份失败→skipped+anomaly」→ **D-CFG 纳入** `global-external/<sha8>/…` fallback |
| 12 | `setupGlobalFramework(lang)` 无 tools 参数 | `core/setup.ts:29` | 签名扩展 `(lang, tools=['opencode'])`；按 tools 门控分支 |
| 13 | `updateProject` 早退条件硬编码 opencode | `core/update.ts:1613-1615` | 改「两工具都未选才返回空」+ `doOpencode`/`doClaude` 对称分支 |
| 14 | `getIncomingContent` 仅 opencode 三分支 | `core/update.ts:1843-1871` | 追加 CLAUDE.md / claude agents / claude skills 分支 |
| 15 | 重启提醒仅一句硬编码 opencode（`updated.some(startsWith getGlobalAgentsDir()) && isTTY`） | `core/update.ts:1727-1735` | 按 harness 组合输出；文案入 i18n 新键 |
| 16 | `deployGlobalAsset` → `writeManagedFile`（受管区三态：不存在写 / 无标记 append / 含标记替换区内） | `core/update.ts:1561-1568` | CLAUDE.md 复用零改动即天然支持「已有 CLAUDE.md append 不覆盖」 |
| 17 | i18n 现基线 **761**（`lint i18n` 实测）；`setup.check*`/`update.*` 键双语 | `i18n-data/{zh-CN,en}.ts` | 新增键须双表成对 + 显式登记新基线 |
| 18 | 版本载体：`package.json` / `package-lock.json` root×2 / `config.yaml:5` / `config.ts` zh·en 模板（`:423/:476`）/ `agents-md/{zh-CN,en}.md:134` | 实测 | A 类收口清单见 §六 |
| 19 | CI env guard 快照 **4 路径** | `.github/workflows/ci.yml:39/82` | 追加 `$HOME/.claude` 防测试污染真实目录 |
| 20 | `.openfeel/adapters/README.md` 中 `claude/` 为预留占位；`core/update.ts:66` 注释预留 claude | 实测 | 文档与注释转正式条目 |

## 三、关键裁定（本计划的决策基线）

| # | 议题 | **裁定** | 相对蓝本的变更 |
|:-:|------|----------|----------------|
| **A** | 模板架构 | 17 skills 迁 **单一中立共享源** `templates-data/skills/`（两 harness 共用，4 个 opencode 特化 skill 改写为中立表述）；agents 与约束文件**每 harness 独立源** | 沿用蓝本 §二 |
| **B** | Claude agents 数 | **9 个**（含 `feel`）——`templates-data/claude/agents/` 含 `feel.md` + 8 个 `openfeel-*` | **反转蓝本 §四**（原「不部署主 agent」） |
| **C** | `settings.json` | **注入为一等能力**：作为 `setup/update --tools claude` 的正式交付，与 CLAUDE.md/agents/skills 一并部署 | **反转蓝本 §四**（原「不写 settings.json」） |
| **D** | 部署默认 | Claude **默认不启用**（`enabled:false`）；仅 `--tools claude` 或交互勾选 | 沿用蓝本 §二 |
| **E** | 模型权威源 | **cc-switch**（`~/.cc-switch/`）；供应商中立；模板默认 `model: inherit`，具体厂商 ID 仅入 README/示例 | 沿用蓝本 §二/§六 |
| **F** | automod 语义 | = **auto mode** → 注入 `permissions.defaultMode: "auto"`；**不加** `autoMode` 自定义规则 | 用户追加 |
| **G** | 默认 agent | 部署 `~/.claude/agents/feel.md`（name=`feel`）+ settings 注入 `"agent": "feel"` | 用户追加 |
| **H** | D-CFG | **纳入** `global-external/<sha8>/…` 备份 fallback（`computeBackupRel` + 2 测试） | 用户裁定 |
| **I** | D-STATE | **延后**（`update_state.json` 不增 `deployed_tools`） | 用户裁定 |
| **J** | Q3 `~/.claude/rules/` | **本期不用** | 用户裁定 |
| **K** | Q1（subagent 可否调 Task）/ Q2（`@import` 家目录） | **留待 stage-69 首个 op 实测后定稿**，计划列为验证项 | 用户裁定 |
| **L** | settings 阶段归属 | **单列 stage-73**（理由见 §四） | 本计划裁定 |
| **M** | automod 支持模型限制 | auto mode 官方要求受支持模型（Opus4.6+/Sonnet4.6+/Haiku5.5/Fable）；本机经 cc-switch 中转 deepseek，**可能判定不可用→回落 manual** → 列为 stage-73 实测验证项 | 风险项 |

## 四、阶段概览、依赖图与执行顺序

| 阶段 | 名称 | 核心交付 | 依赖 | op 估 |
|------|------|----------|------|:--:|
| `v1.1.6-stage-68` | 模板管线多源化（**零内容变更**） | skills 迁 `templates-data/skills/`；`build.js` 路径/校验/冗余树断言；测试路径同步 | — | 2 |
| `v1.1.6-stage-69` | **Claude 内容适配（最重）** | `templates-data/claude/**`（**9×2 agents + 约束×2**，含 `feel`）；`build.js` 注入/校验/单源断言；`template-loader` 3 API；模型 ID 可用性实测 | hard: 68 | 4–5 |
| `v1.1.6-stage-70` | 共享 skills 中立化 | 4 重写 + 3 轻改 + 6 个 Feel 措辞；中立化断言（opencode 关键串零回归） | hard: 68 | 2–3 |
| `v1.1.6-stage-71` | 部署编排与命令面 | `global-paths` 5 函数；`setup/update` 双分支；`--tools`；i18n 7 新键 + 6 修订（761→768）；**D-CFG**；测试 | hard: 69, 70 | 3–4 |
| `v1.1.6-stage-73` | **Claude 全局 `settings.json` 注入** | settings 模板（代码常量，JSON 无语言维度）+ 读-深合并-写回 + `permissions.defaultMode:"auto"` + `"agent":"feel"` + 备份/幂等/卸载语义 + 测试 + i18n | hard: 69, 71 | 2–3 |
| `v1.1.6-stage-72` | 文档与版本收口 | README×3、GETTING_STARTED、commands、manual、CHANGELOG、版本 **1.1.6**、CI guard、roadmap/plan 回填 | hard: 71, 73 | 2–3 |

### 依赖图与执行顺序（**以依赖为准，非编号顺序**）

```
               ┌──▶ stage-70 ─┐
stage-68 ──▶ stage-69 ──┼──────────────▶ stage-71 ──┬──▶ stage-73 ──▶ stage-72
                        └──────────────┘            │
                                    （69→71 直连）    └──────▶（72 也直连 71）
```

**执行顺序：68 → 69 → 70 → 71 → 73 → 72。**（阶段编号 72/73 与执行先后**不一致属预期**：`settings.json` 注入（73）必须早于「文档与版本收口」（72），否则 README/CHANGELOG 无法描述 settings 注入、且版本收口 op 将非最终 op。）

### 为何 settings 注入**单列 stage-73**（而非并入 71）

1. **机制内聚性**：`settings.json` 是**严格 JSON** 的用户高频占用文件，其「读-深合并-写回」是一套独立高风险机制（保留用户 `env`/`model`/`modelPicker`/`theme`/`apiKeyHelper` 等键、备份、幂等、卸载/回滚语义），与 `opencode.jsonc` 的 `mergeGlobalOpencodeJsonc` 同构但**不得复用**（jsonc 有剥注释/regex 逻辑，严格 JSON 不适用）。与 stage-71 的「路径函数/双分支/命令面/i18n 编排」面不同。
2. **审查焦点**：并入 71 会使其 op 数膨胀至 5~6、混淆「编排接线」与「危险写回」两类风险，稀释审查。单列后独立门禁（合并幂等、用户键逐字保留、默认路径零触 `~/.claude`、`--tools claude` 后 `agent`/`defaultMode` 断言）可被 openfeel-reviewer 专项覆盖。
3. **决策反转可追溯**：settings 注入**反转**了蓝本原「不写 settings.json」裁定，独立阶段便于向用户/审查官显式呈现该反转及其门禁。
4. **依赖闭合**：settings 写回天然依赖两端——**内容端**（`feel` agent 存在，stage-69）与**编排端**（`getClaudeSettingsPath`/setup/update 分支/备份，stage-71）；置于两者之后最自然。

> **settings 模板不引入 build.js 依赖**：`settings.json` 注入片段（`{ "agent": "feel", "permissions": { "defaultMode": "auto" } }`，均供应商中立）为**代码常量**（新模块 `src/core/claude-settings.ts`），**JSON 无语言维度**，故不经 `template-loader` 构建注入——避免 stage-73 与 stage-69 交叉改 `build.js`。

## 五、建议阶段注册表（供 Feel 经 CLI 执行；本计划**不注册/不推进**）

> Feel 逐条执行：`openfeel plan stage add <stageId> --deps <ids...> --exec-mode auto --auto-advance enabled`，随后 `openfeel flow advance --stage <stageId> --to plan_pending`。

| # | stageId | 名称（建议） | 描述（建议） | deps | exec-mode |
|:-:|---------|--------------|--------------|------|:--:|
| 1 | `v1.1.6-stage-68` | 模板管线多源化 | skills 迁 `templates-data/skills/`（零内容变更）+ build.js 路径/校验/冗余树断言 + 测试路径同步 | — | auto |
| 2 | `v1.1.6-stage-69` | Claude 内容适配 | `templates-data/claude/**`（9×2 agents 含 feel + 约束×2）+ build.js claude 注入/单源断言 + template-loader 3 API + 模型 ID 实测 | `v1.1.6-stage-68` | auto |
| 3 | `v1.1.6-stage-70` | 共享 skills 中立化 | 4 重写 + 3 轻改 + 6 Feel 措辞；opencode 关键串零回归断言 | `v1.1.6-stage-68` | auto |
| 4 | `v1.1.6-stage-71` | 部署编排与命令面 | global-paths 5 函数 + setup/update 双分支 + `--tools` + i18n 761→768 + D-CFG + 测试 | `v1.1.6-stage-69` `v1.1.6-stage-70` | auto |
| 5 | `v1.1.6-stage-73` | Claude 全局 settings 注入 | settings 深合并写回 + `permissions.defaultMode:"auto"` + `"agent":"feel"` + 备份/幂等/卸载 + 测试 + i18n | `v1.1.6-stage-69` `v1.1.6-stage-71` | auto |
| 6 | `v1.1.6-stage-72` | 文档与版本收口 | README×3 + GETTING_STARTED + commands + manual + CHANGELOG + 版本 1.1.6 + CI guard + roadmap/plan 回填 | `v1.1.6-stage-71` `v1.1.6-stage-73` | auto |

- **review-agent**：全部 `openfeel-reviewer`；**auto-advance**：全部 `enabled`（对齐 `config.yaml.defaults`）。
- **op 级依赖**（`ops/deps.yaml`）由 openfeel-schemer 在各阶段产方案时落盘（hard/soft/mutual_exclusion）。

## 六、版本收口清单（1.1.5 → 1.1.6，A/B/C/D/E，归 stage-72）

> 依据 `kb/patterns.md #版本号全链路收口清单模式`；以内容特征判定，不以行号为准。

- **A 手工载体**：`package.json`（version）；`package-lock.json`（root 两处，**禁 `npm install` 重生成**）；`.openfeel/config.yaml`（`meta.version` **单行 edit，禁整文件重写**）；`src/core/config.ts`（`CONFIG_TEMPLATE_ZH`/`_EN` 各一处）；`src/core/templates-data/agents-md/{zh-CN,en}.md`（「当前 v1.1.x」行）。
- **B 生成段**：`src/core/template-loader.ts` 由 `npm run build` 从 A 类权威源重生成（**禁手改**）。
- **C 传播**：`CHANGELOG.md` 追加 `## [1.1.6]`；`docs/commands.md` 快照标注同步 `v1.1.6`；`docs/claude-code-adapter-plan.md` 状态由「提案」更新为「已实现（v1.1.6）」。
- **D 禁改**：`src/**` 历史批注（`v1.1.x-stage-*` 示例）、依赖自身版本、manual 变更历史、`test/**` 注释。
- **E 无载体**：`README*` / `docs/**`。
- **CLI `VERSION` 常量不存在**：`--version` 直读 `package.json`；`release-metadata.test.ts` 已断言无 `VERSION` 导出。

## 七、边界（不做）

1. 不新增第三方依赖；**不复活 `postinstall`**；不改 `bin/openfeel.js` 安装链路。
2. **不改默认行为**：`openfeel setup` / `openfeel update <path>` 后 `~/.claude/` **零变化**（`enabled:false` + `filter(t=>t.enabled)` 守卫）。
3. 不改既有命令的 `--json` 契约；不破坏 `setup` 无参行为/输出/退出码。
4. **`openfeel model` 的 Claude 支持留待后续版本**（蓝本 §二）。
5. 不 `npm publish`、不 `git push`；**不直写 `flow.json`**；不注册/推进流水线（由 Feel 经 CLI 执行）。
6. 不改 CI workflow 的判定语义（仅 env guard 增路径快照）。
7. Q3（`~/.claude/rules/` 第二载体）本期不用；D-STATE 延后。

## 八、全局验收标准（版本级）

1. **门禁**：`npm test` 全绿 `0 skipped / 0 failed`；`npx tsc --noEmit` = 0；`openfeel lint i18n` = 实测新基线（**≥768**，stage-71 落 768、stage-73 追加后并显式登记）；`openfeel lint kb` = 0 过期；`npm run build` ×2 幂等且 `.opencode/**` 与冗余模板树**不复活**；`node bin/openfeel.js --version` == `1.1.6`。
2. **默认非回归（R-5 守卫，决定性）**：`openfeel setup` / `openfeel update <path>` 后 `~/.claude/` **零变化**（`supportedTools` claude `enabled:false` + `commands/update.ts` `filter(t=>t.enabled)`）。
3. **Claude 部署**：`openfeel setup --tools claude` → 断言 `~/.claude/CLAUDE.md`、`~/.claude/agents/` **9 文件**（含 `feel.md`）、`~/.claude/skills/` **17 目录**、`~/.claude/settings.json` 注入成功。
4. **settings 合并**：预置含用户键（`env`/`model`/`modelPicker`/`theme`/`apiKeyHelper`）的 `settings.json` → 部署后**用户键逐字保留**，且新增 `agent:"feel"` + `permissions.defaultMode:"auto"`；二次运行**幂等**（无变化 → skipped）；含标记/严格 JSON 解析失败 → 不写盘、记 anomaly。
5. **CLAUDE.md 受管区**：预置无标记用户 `CLAUDE.md` → **append 且用户内容逐字保留**；含标记 → 仅替换区内。
6. **D-CFG**：`CLAUDE_CONFIG_DIR` 指到 HOME 外时，更新既有文件走 `global-external/<sha8>/…` 备份 fallback（不再「备份失败→skipped」）。
7. **模型可用性**：部署后派发一次 **reviewer subagent** 实测自定义模型 ID（如 `ccs-claude-zhipu--glm-5.3-flash[1M]`）在 Claude Code 中可用；`feel` agent 主会话启动后 `AskUserQuestion`/`EnterPlanMode` 可用（tools 未收窄）。
8. **环境零污染**：CI env guard 五路径（含 `$HOME/.claude`）前后快照一致。
9. **版本**：`--version` == `package.json` == **1.1.6**；`CHANGELOG` 含 `[1.1.6]`；A 类载体 `1.1.5` 残留 **0**（历史批注除外）。

## 九、风险总览

| # | 风险 | 影响 | 缓解 |
|:-:|------|------|------|
| **R-1** | skills 中立化改变 opencode 用户既有内容 | 高 | 分平台双小节；**opencode 小节逐字保留**；零回归断言（stage-70） |
| **R-2** | CLAUDE.md 常驻上下文过大 | 中 | **已重估下调**：feel 纪律改放 `feel.md`，CLAUDE.md 仅承载中立全局约束（≈ agents-md 体量）；软断言 ≤ 阈值 |
| **R-3** | `feel` 未部署 ⇒ 编排仅靠提示词 | 中 | **已消除**：`feel` 部署为 agent（裁定 B/G）；模板测试冻结核心纪律 |
| **R-4** | 首次创建 `~/.claude/{agents,skills}` 需重启/`/reload-skills`；CLAUDE.md 下次会话生效 | 中 | 专用 i18n 提示键 + 分平台升级文档（stage-71/72） |
| **R-5** | `update <path>` 默认把 claude 带入 | **高危** | `commands/update.ts` **`filter(t=>t.enabled)`** + 回归测试（验收 2） |
| **R-6** | 单版本槽 mixed-tool 假 ok | 低 | 文档固定「按已启用 `--tools` 集合重跑」；D-STATE 延后已知边界登记 |
| **R-7** | `CLAUDE_CONFIG_DIR` 越界备份失败 | 中 | **D-CFG 纳入** fallback（stage-71） |
| **R-8/R-9** | Claude frontmatter/字段漂移；subagent 无 Task | 中 | stage-69 首 op 人工验证清单；仅用已核字段；白名单不含 Task + HANDOFF 改写；Q1/Q2 实测定稿 |
| **R-10** | settings.json 深合并破坏用户键 / 非幂等 | **高** | 严格 JSON 独立深合并模块；读-合并-写回；用户键保留断言；二次运行幂等断言（stage-73） |
| **R-11** | auto mode 受支持模型限制（本机 cc-switch 中转 deepseek 可能回落 manual） | 中 | stage-73 实测验证项；若不支持则以 `defaultMode` 尽力注入 + 文档说明兜底 |
| **R-12** | 全 `inherit` 时 reviewer 与主会话同模型 ⇒ 交叉审查退化 | 中 | 文档「可选增强表」（reviewer 指异族模型，如本机 `ccs-claude-zhipu--glm-5.3-flash[1M]`） |
| **R-13** | `feel` agent 设 `tools` 白名单收窄主会话工具集 | 中 | 验证清单：必要时 `feel` **不设 `tools`（继承）**；实测 `AskUserQuestion`/`EnterPlanMode` 可用 |
| **R-14** | 用户已有 CLAUDE.md 追加体量大；state 丢失时重复追加 | 低 | 标记机制 + 既有 >10 条追加警戒 + 复核规则进 CLAUDE.md |

**回滚**：按阶段 `git revert <sha>`；无数据迁移、无依赖树变动；版本回退仅需改回版本载体。`settings.json` 因备份机制可人工还原。

## 十、开放问题（留待实施期实测/定稿）

- **Q1**：subagent 是否可调用 Task 工具（决定 `task(explore)` 改写终稿）→ **stage-69 首个 op 实测定稿**。
- **Q2**：CLAUDE.md 的 `@import` 是否支持家目录路径（决定是否拆分短路由文件）→ **stage-69 实测**。
- **Q3**：`~/.claude/rules/` 作为第二载体 → **本期不用**（用户裁定）。
- **Q4**：D-CFG **纳入** / D-STATE **延后**（用户裁定）。
- **Q5**：仓库根 `claude/ADAPTER.md` 预留桩顺手更新（建议归档官处置）。
- **Q6（新增）**：`settings.json` 卸载/回滚语义（无独立 `uninstall` 命令时，是否仅文档说明「手动删除注入键」）→ **stage-73 定稿**。

## 十一、端到端验收（实现后，用户/测试官执行）

1. **静态门禁**：见 §八.1。
2. **默认非回归**：`openfeel setup` / `openfeel update <path>` 后 `~/.claude/` 零变化。
3. **Claude 部署**：`openfeel setup --tools claude` → CLAUDE.md + 9 agents + 17 skills + settings.json；预置无标记用户 CLAUDE.md → append 且逐字保留；预置用户键 settings → 逐字保留 + 注入键到位。
4. **Claude Code 实机**：重启会话（首次创建目录）→ 确认 **9 个 agent** 出现在可用列表、skills 可 `/openfeel-*` 调用、主会话以 `feel` 身份启动；**派发一次 reviewer subagent 实测自定义模型 ID 可用**；CLAUDE.md 约束下跑一轮最小流水线。
5. **环境零污染**：CI env guard 五路径前后快照一致。

## 十二、修订记录

| 时间 | 制定人 | 说明 |
|------|--------|------|
| 2026-10-10 | openfeel-planner | 初稿：6 阶段（68/69/70/71/73/72）；源码核验 20 项；裁定 A~M；版本收口 1.1.5→1.1.6；全局验收 9 条；风险 R-1~R-14；开放问题 Q1~Q6；**settings 注入单列 stage-73 并置于 stage-72 之前**；**未注册阶段 / 未直写 flow.json**（由 Feel 经 CLI 执行）。 |
