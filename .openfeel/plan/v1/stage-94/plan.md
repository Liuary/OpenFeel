# v1.2.1-stage-94 计划 — 模型默认值与部署非破坏性（阶段表外补阶段 · 用户直接指令）

- **阶段**：`v1.2.1-stage-94`（版本计划八阶段表外新增；**用户 2026-10-15 直接指令裁定**，本阶段因它而生）
- **依赖**：**hard: `v1.2.1-stage-92`**（flow.json `deps=["v1.2.1-stage-92"]`；`.openfeel/plan/v1/v1.2.1/deps.yaml` **未含本阶段**——见 §七 双向偏差登记）。实质：92 已完成（归档提交 `3db367a`），本阶段在其冻结面上增量。
- **优先级**：P0 ｜ **制定人**：openfeel-planner ｜ **制定时间**：2026-10-15 ｜ **修订轮**：修订 0（初稿）
- **基线**：**HEAD `3db367a`**（「chore: 阶段归档 v1.2.1-stage-92」）。全表实测；行号 / 键值以该基线为准。
- **上游基线（stage-92 归档登记值；本会话已独立复跑——同时构成 REV-92-005 的闭合证据）**：`npm test` **71 文件 / 1695 用例** 0 skipped / 0 failed（**本会话实跑 exit 0**）；`npx tsc --noEmit` = **0**（实测）；`openfeel lint i18n` = **944**（实测）；`openfeel lint kb` = **0 过期**（实测，**612 引用**——较 stage-92 登记 599 增长，归档轮补沉所致）；`git status --porcelain src/` **空**（双生成物与源一致）；`--version` = **1.2.0**（本阶段不改，归 stage-93）；flow.json `revision 1163`；stages **17**（86~92 **done**、93/94 `plan_pending`；`v1.2.1-stage-94` deps=[92] + `workflow_mode: full`，**不在版本计划八阶段表内**）；本仓 `.openfeel/config.yaml defaults.workflow_mode: full` + `test_enabled: true`。
- **背景（用户直接指令原文要点，本阶段唯一需求源）**：
  1. **观察**：Claude Code 下 reviewer 实际未用 GLM（21 万条 subagent 响应全 `deepseek-flash`）。根因链 = `~/.claude/agents/openfeel-reviewer.md` 模板默认 `model: inherit`（随主会话模型）× `~/.claude/settings.json` 各档位全映射 deepseek-flash（cc-switch）→ **框架「reviewer=异种模型」设计只在 opencode 侧实现**（claude 侧从未生效）。
  2. **裁定①（模型默认值）**：除「自动接管用户默认模型（`inherit`）」者外，**全部自定义模型 → `deepseek-v4-flash`**（考虑很多用户是单一模型——框架模板不得假设用户具备异族供应商）。
  3. **裁定②（部署非破坏性）**：部署时**无则创建，有则不覆盖用户设定**（保护用户已填的模型等配置）；须防「升级 CLI 即覆盖用户模型」。
  4. **裁定③（本仓）**：reviewer 本地配置为 **GLM 5.3 flash**（已由主会话手工改 `~/.claude/agents/openfeel-reviewer.md`，实测 `model: ccs-claude-zhipu--glm-5.3-flash[1M]`），本阶段须使其**可被框架正当地持久保持 / 复现**（非「手工易被覆盖」）。
- **定位**：把上述三条裁定落为**可验证的机制事实**——① 框架模板默认值策略统一（opencode 侧显式模型归并为单一默认；claude 侧 `inherit` 维持）；② 部署语义从「frontmatter incoming 覆盖」改为「**用户主权键（`model`）不覆盖用户设定**」（键级「无则创建、有则不覆盖」）；③ 本仓 GLM 配置经 ② 获得正当持久，并以「文档化正当路径 + 本仓登记」满足复现。
- **与权威输入的一致性（显式登记）**：
  - **R-12**（`docs/claude-code-adapter-plan.md:262`「全 inherit 时 reviewer 与主会话同模型 ⇒ 交叉审查退化」）：本阶段**重新定性**——框架层不再硬编码异族（废止 opencode 侧 `zhipuai/glm-5.3-flash` 模板默认），缓解路径从「文档可选增强表」升级为「**用户主权键机制（可持久设置异族）+ 文档 + 本仓示范**」；退化本身在「单一模型用户」语境下**不是缺陷**（该用户无第二模型可选），在多模型用户处由本地配置解决。
  - **Q1 反转（kb supersede 先例）**：kb `troubleshooting.md:1090-1097`（`#Claude Code 2.1.300 subagent 可调 Task`）确立了「原行保留不删 + supersede 块 + 落地方登记」的纪律。本阶段含三项**结论反转**（① 模板硬编码 reviewer 异族 → 存量废止；② 「勿手改全局 agent frontmatter（会被 update 覆盖）」→ `model` 键限定化；③ R-12 缓解路径更新）——**本阶段产出 supersede 材料，kb 写入归归档轮**（承 v1.2.1 stage-90 先例）。
  - **决策 6 / 裁定 E（供应商中立）**：claude 侧 `inherit` 维持 —— 该裁定**未被推翻**（模板仍不硬编码本机 `ccs-claude-*` ID 类值，因该格式为用户本机专有）；opencode 侧的「显式默认」改值属用户新裁定，与「中立」表述的关系见 §二 不变量 7。
  - **v1.2.1/plan.md §七.7 边界**（「reviewer 模型档位为部署侧配置项，不属本版本代码变更范围」）：该边界针对**原八阶段**；本阶段由用户直接指令新增，**重开该议题**（§七 登记）。本计划不改版本计划文件（回写归主会话裁定）。
- **范围（文件级）**：
  - **模型默认值面**：`src/core/templates-data/opencode/agents/{zh-CN,en}/openfeel-{executor,explorer,utility,vision,reviewer}.md`（frontmatter `model:`，10 处）、`src/core/opencode-config.ts`（`buildGlobalOpencodeFrameworkObj()` 2 条目）、`src/core/config.ts`（`CONFIG_TEMPLATE_{ZH,EN}` 的 models 节示例）、`src/core/i18n-data/{zh-CN,en}.ts`（`model.set.example` 示例值，2 处）
  - **一致性文本面（逐处判类）**：`templates-data/agents-md/{zh-CN,en}.md`（vision 行 + 「勿手改」约束行）、`templates-data/claude/constraint/{zh-CN,en}.md`（vision 行）、`templates-data/skills/{openfeel-agent-model-check,openfeel-model-config,openfeel-model-check,openfeel-cli-usage}/SKILL.md`
  - **部署非破坏性面（核心源码）**：`src/core/update.ts`（`writeManagedFile` 含标记分支，`:2393`）、`src/core/managed-region.ts`（`mergeFrontmatter` 可选参数或并列函数）
  - **生成物**：`src/core/template-loader.ts` + `src/core/update.ts`（templates-data 有改动时同批 `npm run build`，**禁手改**）
  - **断言面**：`test/core/{model-config,opencode-config,update,managed-region,claude-adapter,templates}.test.ts`
  - `.openfeel/plan/v1/stage-94/ops/**`（末位 op 的 produces 清单）
- **边界**：
  1. **claude 侧 `model: inherit` 零改动**（裁定①：inherit 者维持自动接管）——20 份模板与 `claude-adapter.test.ts` 断言（`:39`/`:85`）**保持逐字**；若执行期出现「claude 侧也要显式」的解读 → **停下上报**，禁自行扩展。
  2. **用户主权键白名单 = `model` 单键**（裁定②最小集）：不扩展至 `tools`/`effort`/`color`/`description` 等框架键（升维将破坏「框架升级可传播」与既有断言 `update.test.ts:730`）；白名单可扩展性在实现中留口（Q2），但本阶段**只落 `model`**。
  3. **`openfeel model`（opencode 三层级）写入语义零改动**：`model-config.ts:218` 的 `mergeFrontmatter(split.frontmatter, { model })`（`--scope default` 写模板）**必须保持「覆盖」语义**——保护逻辑仅在**部署路径**（`update.ts` 的 `writeManagedFile`）生效；实现须防「误伤 `--scope default`」（断言锁定）。
  4. **相邻非破坏性面零触碰**（登记防重复改造）：`opencode.jsonc` 的 `mergeAgentDefaults`（REV-703「用户定义即不覆盖」已达标）、`claude-settings.ts`（仅注入自有键）、CLAUDE.md/AGENTS.md 受管区三态、`appended`/`malformed` 路径语义。
  5. **`deepseek-v4-flash` 字面值 = 用户裁定值；可用性 = 执行期前置实测（go/no-go）**（见 Q1）：kb `troubleshooting.md:311` 存「deepseek-v4-flash 已下线 → deepseek-flash」历史（2026-09-25），本机 cc-switch 清单（`~/.cc-switch/model-pricing.json` 实测）为 `deepseek-flash`/`deepseek-v4-pro`/`glm-5.x`（**无 v4-flash**）——**禁凭记忆断定可用或不可用**；实测不可用 → **上报用户确认回退形态**（候选：opencode 侧 `deepseek/deepseek-flash`、claude 侧 `ccs-claude-deepseek--deepseek-flash[1M]`），**禁静默择值**（承 kb #模型名错误导致 Agent 无法启动 的坑位纪律）。
  6. **`vision` 多模态例外门**：`openfeel-vision` 现用 `deepseek/deepseek-flash` 系因「支持多模态图像输入」（kb/skill 载明，`openfeel-agent-model-check/SKILL.md` 多处）。v4-flash 的多模态能力**未证**——执行前置实测；若不支持 → **vision 维持现值的例外处置须显式登记 + 上报**（Q4）。
  7. **不做**：不做 `openfeel model` 的 Claude 侧命令扩展（Q3 默认不做）；不改 `docs/**`（`claude-code-adapter-plan.md` / `v1.2.1-design.md`）与 `README*` / `CHANGELOG`（归 stage-93 文档轮，§七 登记交接口径）；不改 `.openfeel/models.template.yaml`（占位值，零改动结论；§三 T1.4 判类）；不直写 `flow.json`；不推进 phase（由 Feel 经 CLI 执行）；不 `npm publish` / 不 `git push`；提交精确 `git add`（禁 `-A`）；不新建 agent / skill / 命令（计数面零翻转：agent **10** / skills **22**）。
  8. **执行顺序建议（登记）**：**建议 94 先于 93**——93 为文档与版本收口轮（依赖 91/92），本阶段的模型默认值与部署语义变更**须被 93 的文档口径吸收**（README / CHANGELOG / cli-usage 快照 / GETTING_STARTED）；若主会话裁定 93 先行，则 93 收口后由本阶段补最小登记（登记为偏差，不阻塞）。

## KB 检索（`openfeel-check-kb`）

已加载 `.openfeel/kb/index.md` 分类摘要 + 相关分类正文（architecture **141.6KB** / patterns **424.7KB** / troubleshooting **143.3KB** / setup **7.0KB**，2026-10-15 更新）。**高度相关条目**：

- `kb/architecture.md #模型配置三层级架构：工具默认/全局/项目 + 优先级链 frontmatter>jsonc`（`:475`）→ **本阶段模型面的架构基础**：三层级落点（default 改 frontmatter 双语 + `opencode-config.ts` / global·project 改 jsonc）；**REV-1606 实测链「frontmatter > jsonc」**；`--scope default` 写后须 `npm run build`（双生成物）。T1 的「显式默认值」变更须沿此链的**全部落点**同步（§一 表 A 全枚举）。
- `kb/troubleshooting.md #模型名错误导致 Agent 无法启动（deepseek-v4-flash 已下线 → deepseek-flash）`（`:311`）→ **Q1 字面值风险的直接来源**：症状 Model not found；修复须**全链路**（agent 文件 + 模板源 + 生成段 + config 常量）。本阶段值变更的「全链路」面即表 A6 全枚举；字面值可用性**必测**。
- `kb/troubleshooting.md #opencode 模型解析优先级排查：frontmatter 覆盖 jsonc agent.model`（`:316`）→ 「只改 jsonc 会被 frontmatter 遮蔽」——**「用户主权键保护」的必要性旁证**（用户改 jsonc 不生效的既有坑 → 用户实际只能手改 frontmatter → 而手改会被部署覆盖 → 本阶段 T2 修的就是这个闭环缺口）。同条：skill 旧说已过时——T1.4 文本同步时**逐句判定**（承 kb #平台分节中立化的「原文搬家 vs 探针式改写」陷阱）。
- `kb/troubleshooting.md #Claude Code 2.1.300 subagent 可调 Task（Q1 反转）`（`:1099`）+ 其继承条 `#Claude Code 实机验证方法与行为事实`（`:1025`，supersede 块 `:1090`）→ **supersede 纪律范式**（原行保留不删 + supersede 块 + 适用边界 + 落地方登记）：本阶段三项结论反转的材料按此格式产出（T4.1）；且该条同时是 claude 侧「自定义模型 ID 可用」的**实机方法学**（隔离 `CLAUDE_CONFIG_DIR` + 命令/版本/环境三要素）。
- `kb/architecture.md #控制区标记模式（N1~N7）+ N3 hash 降级`（`:440-461`）→ **「区外归用户、区内归框架」契约**：本阶段 T2 实质是**修补契约缺口**——frontmatter 位于标记之外（用户区）却被 incoming 覆盖（违契约）；T2 后「frontmatter 的 `model` 键」归用户区，其余框架键维持框架区（浅合并）。
- `kb/patterns.md #部署型资产变更的多载体同步面清单`（`:3077`）→ 改 skill / 模板的同步面 = 源 → 双注入（`template-loader.ts` + `update.ts` 生成物）→ 部署实例；T1.4 / T2.4 的「逐处判类表」按此清单口径。
- `kb/troubleshooting.md #改 templates-data 源须同批重生成的「双生成物」`（`:1151`）+ `#build「双生成物」禁手改的段二分`（`:1236`）→ 同批 `npm run build` + `git status --porcelain src/` 断言。
- `kb/patterns.md #跨 harness × 语言模板对称纪律：提取式切片字节等值 + 节锚点插入 + 无裸主语`（`:3937`）→ agents-md / constraint / skill 文本同步的 zh/en 对称四律。
- `kb/patterns.md #零回归取证范式（补丁前/后归一化快照 diff 空）` + `kb/troubleshooting.md #零回归取证范式`（`:1220`）→ T2「非破坏性」的取证法（修改前/后归一化断言）；T1 的「未改面零回归」取证。
- `kb/patterns.md #值域扩展全枚举范式` / `#陈旧计数「全枚举」纪律`（`:3983`）→ 模型值 / 「勿手改」文本的引用点**双路扫描 + 逐处判类（零未判类）**——表 A6 为本阶段的枚举基线。
- `kb/troubleshooting.md #断言串与落文逐字核对纪律`（`:1138`）+ `#多源文案同步陷阱`（`:591`）→ 断言串与落文同批原子更新。
- `kb/patterns.md #未来功能/未落地能力写入 skill 与文档须标注「提供版本」`（`:3483`）→ 「多模态能力 / 自定义模型 ID 可用性」等未实测结论**禁虚述**（T3 实测留痕纪律；Q1/Q4 的处置）。
- `kb/patterns.md #双主题收官端到端验收范式（隔离脚本 + 本仓复核二分）`（`:4003`）→ T3 本仓实测的验收法（隔离语义验证 + 本仓真实部署二分）。
- `kb/troubleshooting.md #默认开启写真实用户目录的副作用防护（VITEST 继承 + OPENFEEL_LOG=0）`→ 隔离实测纪律（`OPENFEEL_LOG=0` + 隔离 HOME fixture）；本仓实测（T3.2）写真实 `~/.claude` 时依赖框架备份机制（`backupFileBeforeWrite`）并留痕。
- **无**「用户主权键 / 部署非破坏性 frontmatter / 模型默认值策略」既有条目 → **归档轮补沉**：architecture（用户主权键机制：键级「无则创建、有则不覆盖」+ 部署路径与 `--scope default` 的调用点区分）与 patterns（模型默认值统一范式 + 反转登记：模板硬编码异族废止）。

> ⚠️ 执行任务前，若知识库中有相关条目，务必参考。重复踩过的坑不可再犯。

---

## 一、实测清单（基线 HEAD `3db367a`；行号 / 键值以本基线为准）

### 表 A：模型默认值面

| # | 事实（实测） | 位置 | 结论 |
|:-:|------|------|------|
| A1 | **claude 侧模板全 `inherit`**：10 agents × 2 语言 = **20 份**，`model: inherit` 无一例外 | `templates-data/claude/agents/{zh-CN,en}/*.md`（`sed` 全量实测） | 裁定①「inherit 者维持」→ **20 份零改动**；断言面 `claude-adapter.test.ts:39`（全 10×2）与 `:85`（explorer）**保持逐字** |
| A2 | **opencode 侧显式 model = 5 agent**：`executor`/`explorer`/`utility`/`vision` = `deepseek/deepseek-flash`；`reviewer` = `zhipuai/glm-5.3-flash`；其余 5 个（`feel`/`planner`/`schemer`/`feel-tester`/`archiver`）**无 model 键**（随 opencode 默认） | 同上（opencode 侧，实测） | 「自定义模型 agent」= 这 5 个 → 值统一为裁定字面值（Q1）；「无 model 键」5 个维持（与 claude 侧 inherit 语义对应） |
| A3 | **`buildGlobalOpencodeFrameworkObj()`** = `{ $schema, default_agent:'feel', agent:{ 'openfeel-vision':{model:'deepseek/deepseek-flash'}, 'openfeel-reviewer':{model:'zhipuai/glm-5.3-flash'} } }`——2 条 agent.model；经 `mergeGlobalOpencodeJsonc` 注入全局 jsonc | `opencode-config.ts:15-26` | reviewer 条目 = **「模板硬编码异族」在 opencode 侧的第二落点**（T1 同批改） |
| A4 | **`mergeAgentDefaults`（REV-703）已是非破坏性**：仅当用户**完全未定义**该 agent key 时补入整条 `{ model }`；用户定义了即「不补、不覆盖内部字段」 | `opencode-config.ts:67-77`；单测 `opencode-config.test.ts:86-97`（用户 `user/custom` 被保留） | **jsonc 面无需本阶段改造**（登记，防重复）；本阶段改造面 = **agent frontmatter**（A5） |
| A5 | **frontmatter 覆盖缺口**：`mergeFrontmatter(existing, incoming) = {...existing, ...incoming}`（incoming 覆盖同名）；用户在含标记 agent 文件中改 `model` → 下次部署被模板值覆盖。**「用户字段保留」在既有测试中成立的前提 = 模板无该键**（planner 无 model） | `managed-region.ts:185-190`；`update.ts:2393`（部署调用点）；`update.test.ts:730-746`（planner 场景） | **本阶段核心缺口**（T2）；表 A2 的 5 个 agent（及 claude 侧全 10 个有 `model` 键者）用户改动**均会被覆盖** |
| A6 | **模型值引用点全枚举（双值双路扫描）**——`deepseek/deepseek-flash`（执行类）：templates-data opencode agents **8 处**（executor/explorer/utility/vision ×2 语言）+ `opencode-config.ts:20` + `config.ts:479/536`（CONFIG_TEMPLATE roles.fast ×2）+ i18n `model.set.example` ×2 + skills（`agent-model-check` 6 处 / `model-config` 3 处 / `model-check` 1 处）+ `agents-md/{zh-CN,en}:99` + `claude/constraint/{zh-CN,en}:101`；`zhipuai/glm-5.3-flash`（reviewer）：templates-data opencode agents **2 处** + `opencode-config.ts:21` + 测试 4 处（`model-config.test.ts:138`、`opencode-config.test.ts:39/90/97`）；生成物（`template-loader.ts` 30 处 / `update.ts`）自动重生成由 build 承担 | 实测（`rg` 双路） | T1.4 的**逐处判类基线**（改 / 不改 / 轻改） |
| A7 | **vision 多模态约束**：`openfeel-vision` 现用 `deepseek/deepseek-flash` 系因「支持多模态图像输入」（skill 载明「输入=Yes」「已内置多模态」）；`openfeel-agent-model-check/SKILL.md:35/42/110/114/119/130` 6 处引用 | `templates-data/skills/openfeel-agent-model-check/SKILL.md` | v4-flash 的多模态能力**未证** → **例外门**：实测不支持则 vision 维持现值（Q4），禁盲目随大流改 |
| A8 | **字面值可用性现状**：本机 cc-switch `model-pricing.json` 模型清单 = `deepseek-flash` / `deepseek-v4-pro` / `glm-5.1/5.2/5.3/5.3-flash/5.3-flashx/5v-turbo`（**无 `deepseek-v4-flash`**）；opencode `auth.json` provider = `deepseek` / `alibaba-cn` / `zhipuai`；本仓 `.openfeel/config.yaml` default = `deepseek/deepseek-v4-pro`（**v4 家族在位**）；kb `troubleshooting.md:311` 存「v4-flash 已下线」历史；`docs/claude-code-adapter-plan.md:75` 记 v4-flash 为「历史请求（未进当前清单）」 | 本会话实测 + kb + docs | **Q1**：模板字面值按裁定书写；**可用性实测 = 执行前置**（opencode 报错 `Did you mean` / cc-switch 清单）；不可用 → 上报（候选回退见边界 5） |
| A9 | **设计 / 版本侧口径**：设计 §1.2「reviewer 跑在 glm-5.3-flash（最贵单价档）→ **换模型是降本第一杠杆**」（`docs/v1.2.1-design.md:75`）；版本计划 §七.7 边界「reviewer 模型档位为部署侧配置项，**不属本版本代码变更范围**（用户决策）」（`plan/v1/v1.2.1/plan.md:208`） | docs + 版本计划实测 | 本阶段 = **该边界之外的用户直接指令补阶段**（§七 登记关系）；方向与设计「降本」一致（reviewer 单价 ↓） |
| A10 | **claude 侧模型解析链（skill 已载）**：`项目 .claude/agents > 用户 ~/.claude/agents`；frontmatter `model` **优先于** `inherit`；stage-69 实机确认**自定义模型 ID 可用**（`docs/claude-code-adapter-plan.md` 实施偏差表 #4） | `skills/openfeel-model-config/SKILL.md:66-68`；docs | 「复现」的正当路径素材（T3.3）：用户级 frontmatter 为正式配置位；项目级 `.claude/agents/` 覆盖为 Claude 原生能力（框架不触碰） |
| A11 | **`model-config.ts` 的 agent 清单注释陈旧**：注释与报错文案记「有显式 model 的 **4 个** agent（executor/utility/reviewer/vision）」，实测 frontmatter 显式者为 **5 个**（explorer 于 stage-89 加入，机制层已自动支持——`defaultScopeSources` 动态读文件） | `model-config.ts:10-13`（注释）/ `:310-329`（判定逻辑实测动态） | **注释 / 文案订正**（轻改，非功能）；`setAgentModel('default','explorer',…)` 实测可写（动态判定） |
| A12 | **claude 侧模型值格式不可硬编码**：cc-switch 完整 ID（`ccs-claude-<slug>--<model>[1M]`）为**用户本机专有**（slug 依赖本机 cc-switch 配置） | `docs/claude-code-adapter-plan.md:55-64`；本机 settings.json 实测 | claude 侧模板**维持 `inherit`** 的正当性之一（与决策 6 一致）；用户本机值只出现在**本地配置**（T3） |

### 表 B：部署非破坏性面

| # | 事实（实测） | 位置 | 结论 |
|:-:|------|------|------|
| B1 | **三态部署**（`writeManagedFile`）：① 不存在 → `created`（写 `frontmatter + 标记包裹正文`）；② 含标记（`region.status==='ok'`）→ **frontmatter 合并（incoming 覆盖）** + 正文区内替换 → 比对后 `updated` / `skipped`；③ 无标记 + hash 与 state 一致 → `updated`（adopt）；④ 无标记 + hash 不一致 → `appended`（**不触碰 frontmatter**）；⑤ malformed → `skipped` + anomaly | `update.ts:2331-2432`（`:2351` created / `:2390-2404` ok / `:2406-2426` none / `:2428-2431` malformed） | 缺口**仅在 ② 路径**（T2 改造点）；①③④⑤ 语义**逐字保留** |
| B2 | **写前备份**：目标存在且将实际改变内容时 `backupFileBeforeWrite`（备份失败 → skipped + anomaly，不覆盖） | `update.ts:2363-2388` | T2 后「model 被保留」不触发备份（无变化）；其余变更照常备份 ✅ |
| B3 | **部署入口全枚举（T2 作用面）**：`setup.ts:47/54/63/110/117/126`（AGENTS.md / opencode agents / skills / CLAUDE.md / claude agents / claude skills）+ `update.ts:2540/2548/2557/2620/2625/2633` + `migrate.ts:514/520/528`——**全部经 `deployGlobalAsset` → `writeManagedFile`**（单点；改一处全覆盖） | 实测 `rg` | T2 实现**单点化**（无需多入口改造）；migrate 天然继承 |
| B4 | **`mergeFrontmatter` 调用点恰 2 处**：① `update.ts:2393`（部署路径——**改造点**）；② `model-config.ts:218`（`--scope default` 写模板——**必须保持覆盖语义**） | 实测 `rg` | T2 实现形态（Q6）：`mergeFrontmatter(existing, incoming, preserveKeys?)` 可选参（②不传=现行为）或 update.ts 侧例外处理；**断言锁定 ② 不受影响** |
| B5 | **相邻面已达标（零触碰）**：opencode.jsonc `mergeAgentDefaults`（A4）；claude settings.json `mergeClaudeSettings`（仅注入 `agent`/`permissions.defaultMode`，用户键逐字保留——`claude-settings.ts:40-58`，单测 `setup.test.ts:255-275`）；CLAUDE.md 受管区（用户已有内容 → `appended` 不破坏，`update.test.ts:834-847`） | 实测 + 单测 | 登记防重复改造；T2 只补 frontmatter 缺口 |
| B6 | **状态记账现状**：`update_state.json` FileState = `{hash, status}`（**整文件 hash**，无键级基线）；**含标记分支不看 hash**（kb `architecture.md:456` N3：「hash 降级为『无标记文件归属兜底』」） | `update-state.ts:21-32/:207-216`；kb | **键级「用户偏离判定」无现成基线** → T2 语义定为**「键存在即保留」**（不依赖基线；Q2/Q6） |
| B7 | **本仓部署实况（陈旧态）**：`~/.claude/agents/` **9 份**（缺 `openfeel-explorer.md`；`openfeel-reviewer.md` 含 `.bak-20261015005602`）；`~/.config/opencode/agents/` 亦 **9 份**（同缺 explorer）——两 harness 部署均未随 stage-89~92 刷新；`~/.claude/agents/openfeel-reviewer.md` 实测 frontmatter = `model: ccs-claude-zhipu--glm-5.3-flash[1M]`（**含标记**） | 本会话实测（`ls` / `sed`） | ① T3.2 实测将**同时见证「无则创建」**（explorer 补齐）；② GLM 现状 = ② 路径的**待覆盖样本**（T2 后应保留） |
| B8 | **「勿手改」约束文本在位（将被限定化）**：`agents-md/{zh-CN,en}.md:111`（「勿手改全局 agent 文件 frontmatter：`openfeel update` 会覆盖 frontmatter 同名字段…」）+ `skills/openfeel-cli-usage/SKILL.md:188`（「…勿手改全局 agent frontmatter（会被 `update` 覆盖）」）；`claude/constraint` 无对应句（仅权限模型节，实测） | 实测 `rg` | T2.4：**限定化改写**（保留「框架字段仍会被覆盖」+ 增「`model` 键为用户主权配置，update 保留」）；zh/en ×2 + 生成物同批 |
| B9 | **`setup --check` 语义**：`deployment-check` 只比**版本**（`openfeel_version`；四态 ok/mismatch/missing/unknown），**不比内容 hash** | `deployment-check.ts:10-57` | 用户改 frontmatter **不影响** `setup --check` 判定（登记防误判「用户改动导致 check 报错」） |
| B10 | **动作分类与可见性**：`ManagedAction = created/updated/skipped/appended`；`update_infos.md` 条目（backed/appended/anomaly…）；cli 输出 `update.created/updated/skipped/…`（i18n） | `update.ts:43/:2324`；`i18n-data/zh-CN.ts:401-412` | T2 是否新增提示面（「model 被保留」）→ Q8：**默认不加**（文件级动作仍为 updated/skipped，用户经 git diff 可见）；若加则 i18n 新基线 > 944 |

### 表 C：本仓 reviewer 与运行链面

| # | 事实（实测） | 位置 | 结论 |
|:-:|------|------|------|
| C1 | **根因链完整**：`~/.claude/settings.json` env 各档位全映射 `ccs-claude-deepseek--deepseek-flash[1M]`（`ANTHROPIC_DEFAULT_{HAIKU,SONNET,OPUS,FABLE}_MODEL`），**无顶层 `model` 键**；`modelPicker.options` 4 项（含 `ccs-claude-zhipu--glm-5.3-flash[1M]`）；claude 侧模板全 `inherit` → reviewer 实际随主会话 = deepseek-flash（与「21 万条响应全 deepseek-flash」观察一致） | 本会话实测 | 观察得到**机制解释**（登记，供 T4 报告）；与 R-12 的重新定性（T4.1）同源 |
| C2 | **cc-switch stack 双 provider 在位**：`~/.cc-switch/live-state.json` claude `stack.members` = deepseek + zhipu（proxy 模式）——**GLM 本机可用** | 本会话实测 | 本仓 GLM 配置可实测（T3.2）；「单一模型用户」的风险不在本机（本阶段仍以通用性为设计目标） |
| C3 | **框架对 claude 侧模型的命令面 = 无**：`openfeel model` 三层级全落 opencode 侧（docs 决策 1「Claude 支持留待后续版本」）；claude 侧当前正当配置路径 = **手工编辑 `~/.claude/agents/*.md` 的 `model`**（skill 已述位置） | `model-config.ts` 全文；`docs/claude-code-adapter-plan.md:40` | T3.3 的复现路径成文以「手工编辑 + 部署保护」为**正当最小形态**；CLI 扩展 = Q3（默认不做） |
| C4 | **settings.json 注入面已非破坏**：`mergeClaudeSettings` 仅覆盖 `agent`/`permissions.defaultMode`，其余键（env/modelPicker/theme/apiKeyHelper/permissions.allow\|deny）逐字保留 | `claude-settings.ts:40-58`；`setup.test.ts:255-275`（用户键保留单测） | T3.2 本仓实测的**非回归断言点**（update 重注入后用户键逐字） |
| C5 | **本机 claude agents 现状 = 手工改动样本**：`openfeel-reviewer.md`（含标记 + GLM 值 + `.bak`）；其余 8 份 mtime 10-11 / planner·feel 10-13 | 本会话实测 | T3.1/T3.2 的**前置状态快照**（实测留痕；供「更新前后 diff」取证） |

### 表 D：承接 REV 台账（判据源实测）

| # | 条目 | 状态 / 优先级 | 去向 |
|:-:|------|:--:|------|
| D1 | **REV-92-001**（表 A3 pipeline.yaml 行数偏差 45→54） | `pending`（low） | 已由 stage-92 执行期落实（54 行订正）→ **本阶段提供闭合证据，转主会话登记 closed** |
| D2 | **REV-92-002**（est_ops 3→4 对账登记） | `pending`（low） | 已由 deps 说明② + 终局报告 §5.3 对账表落实 → **闭环证据提供，转主会话** |
| D3 | **REV-92-003**（op-001 §1.3 论证订正） | `pending`（medium） | 已订正落 `stage-92-tier-definition.md` B1（REV-92 摘要 §9）→ **闭环证据提供，转主会话登记** |
| D4 | **REV-92-004**（`getDefaultTransitions` tier 签名二选一） | `pending`（low） | 已选 (a)（零改动，实测 `flow-manager.ts:2212` 无 tier 参数）→ **闭环证据提供，转主会话** |
| D5 | **REV-92-005**（门禁五项未独立复跑） | `pending`（low） | **本阶段已具备独立复跑证据**：本会话 `npm test` **71/1695/0 failed**、`tsc`=0、`lint i18n`=944、`lint kb`=0、`git status --porcelain src/` 空 → **建议主会话登记 closed**（本 Agent 不改他人台账） |
| D6 | **REV-92-006**（skip 档 `findPhasePath` BFS 语义精度：报「深度超限」而非「无路径」） | `pending`（low） | **非本阶段面**（flow-manager BFS）→ **维持转 stage-93 收口轮 / 后续版本裁定**；本阶段零触碰 |
| D7 | **REV-91-011**（门禁五项未独立复跑，v1.2.1-stage-91） | `pending`（low） | 已在 stage-92 提供闭合证据；本阶段**再次旁证**（同批实测）——维持转主会话登记 |

- **判据源**：`.openfeel/users/Liuary/code_review/REV-92.md`（001~006，206 行全文实测）+ `REV-91.md`（011）+ 本会话门禁实测（表头基线）。

---

## 二、目标语义与不变量

| 维度 | 内容 |
|------|------|
| **模型默认值** | **opencode 侧**：5 个显式 model agent（executor/explorer/utility/vision/reviewer）的**框架模板默认**统一为裁定字面值 `deepseek/deepseek-v4-flash`（写法 = `{provider}/{model-id}`，provider ∈ auth.json；Q1）；`opencode-config.ts` 的 vision/reviewer 条目同批。**claude 侧**：20 份模板 `inherit` **零改动**（自动接管用户默认模型）。**判据**：裁定① + 表 A2/A12 |
| **部署非破坏性** | **键级语义**（用户主权键白名单 = `model`）：目标文件已存在且其 frontmatter **已有 `model` 键** → **保留用户值**（不写模板值）；**无 `model` 键** → 写模板值（「无则创建」）；文件不存在 → 写全文（现状 `created`）。**推论**：用户删除 `model` 行 + 重跑部署 = 回归模板默认（文档化）。**判据**：裁定② |
| **用户主权键边界** | 白名单**仅 `model`**（本阶段）；框架主权键（`name`/`description`/`tools`/`effort`/`color`/`permission` 等）维持 **incoming 覆盖**（浅合并，现状）；正文受管区（`<!-- openfeel:begin/end -->` 内）维持**无条件替换**。**判据**：kb `#控制区标记模式`（区外归用户）+ 既有断言 `update.test.ts:730` |
| **本仓 reviewer = GLM** | 经「部署非破坏性」获得**持久**（`update`/`setup --tools claude` 不覆盖）；**复现** = 文档化正当路径（用户级 `~/.claude/agents/<id>.md` 的 `model` 键为正式配置位，受部署保护）+ 本仓配置登记（值 / 落点 / 复现步骤）。**判据**：裁定③ + 表 C3/A10 |
| **R-12 重新定性** | 「全 inherit ⇒ 交叉审查退化」：① 框架**不再硬编码**异族（模板默认 = 单一通用值）；② 交叉审查（异族 reviewer）降级为**用户可选增强**（经用户主权键设置，受保护、可复现）；③ 单模型用户无退化概念（无第二模型可选）。**判据**：R-12 原文 + 裁定①② |
| **一致性文本** | 一切「默认值 / 示例值」类引用（skill / agents-md / constraint / config 模板 / i18n 示例）**同批同步**（逐处判类，零未判类）；「历史记录 / 报告 / D 类禁改面」**不改**。**判据**：表 A6 + kb `#部署型资产变更的多载体同步面清单` |

**不变量**：

1. **claude 侧 `inherit` 零改动**：20 份模板 + `claude-adapter.test.ts:39/:85` 断言逐字不变（`inherit` = 自动接管，属裁定①明示保留面）。
2. **`openfeel model` 写入语义零改动**：`--scope default`（`model-config.ts:218`）对模板 frontmatter 的**覆盖**语义不变；`--scope global/project`（jsonc）不变——保护逻辑**仅在部署路径**。
3. **框架主权键升级可传播**：`mergeFrontmatter` 对非白名单键维持 incoming 覆盖（浅合并 / `permission` 整体覆盖——既有 `managed-region.test.ts:167/178` 断言保持通过）。
4. **三态部署其余路径逐字**：`created` / `appended` / `malformed` / adopt 语义与既有断言（`update.test.ts:705-728`）不变；`conflicts` 恒空不变。
5. **零回归**：`full`/`fast`/`general` 转移表 / `flow phases` / `--json` 契约 / phase 枚举（15）/ `pipeline.yaml` 全零改动（本阶段不触 flow 面）；`--version` = 1.2.0（归 93）。
6. **双生成物同批**：`templates-data/**` 有改动 → 同批 `npm run build`；`git status --porcelain src/` ⊆ produces。
7. **供应商中立的边界（登记）**：opencode 侧「显式默认」`deepseek/deepseek-v4-flash` 与决策 6「模板默认 `inherit`」的关系——裁定①的用户表述「除 inherit 者外全部 → deepseek-v4-flash」**隐含授权**显式值收敛为单一默认；claude 侧因 ID 格式本机专有（A12）**仍不写显式**。此口径须在 T4.1 材料中**显式登记**（防「推翻决策 6」误判）。
8. **计数面零翻转**：agent 10 / skills 22 / 共享 skill 源数（22 目录）不因本阶段增删；若执行期出现新增/删除 → 全枚举翻转（禁静默）。
9. **平台不可控项禁虚述**：模型 ID 可用性 / 多模态能力等未实测结论须留痕（Q1/Q4），禁表述为「已支持」（kb `#未来功能…标注提供版本`）。
10. **提交与流程卫生**：精确 `git add`（禁 `-A`）；不直写 `flow.json`；不推进 phase；不 `npm publish` / 不 `git push`。

---

## 三、变更点清单（编号 T）

### T1 — 模型默认值统一（框架模板层）

**T1.1 opencode 侧显式默认值收敛（10 处 frontmatter + 2 条目）**
- 目标值 = **裁定字面值 `deepseek-v4-flash`**（完整写法 `deepseek/deepseek-v4-flash`；**可用性实测先行**——Q1；实测不可用 → 停下上报，禁静默择值）。
- 改动面（逐处列名）：`templates-data/opencode/agents/{zh-CN,en}/openfeel-executor.md`、`…/openfeel-explorer.md`、`…/openfeel-utility.md`、`…/openfeel-vision.md`（**受 A7 多模态例外门约束**）、`…/openfeel-reviewer.md`（值语义变更：异族 → 单一默认）；`opencode-config.ts` 的 `'openfeel-vision'` / `'openfeel-reviewer'` 两条目。
- **禁止**：改 `{zh-CN,en}` 之外新增语言 / 改 frontmatter 其他键 / 动「无 model 键」的 5 个 agent。

**T1.2 claude 侧零改动结论（显式登记）**
- 20 份模板 `model: inherit` 保持；`claude-adapter.test.ts:39/:85` 断言**不改写**；在计划 / 报告中**显式登记「claude 侧零内容变更」**（防审查误判「遗漏」——承 stage-92 边界 10 口径）。

**T1.3 可用性实测（执行前置；go/no-go）**
- 项：`deepseek-v4-flash` 在 **opencode 侧**（`{provider}/{model-id}` 语境的 provider 归属 + model-id 存在性）与 **claude 侧参考面**（cc-switch 清单；本阶段不改 claude 值，仅记录）的可用性；`vision` 的**多模态能力**（v4-flash 是否支持图像输入——kb/skill 口径「Input = Yes」核验）。
- 方法：opencode 侧以 `Model not found: … Did you mean:` 报错为权威（kb `#模型名查找方法`）；必要时隔离 fixture 派发最小任务实测（命令 + 版本 + 环境三要素留痕）。
- 处置：① 可用 → 按裁定落值；② 不可用 → **上报用户确认**（候选回退见边界 5；Q1）；③ vision 不可用（多模态）→ 例外处置（Q4）。

**T1.4 一致性文本同步（逐处判类表；零未判类）**
- **判类三档**：**[改]** = 作为「默认值 / 示例值」出现；**[轻改]** = 概念说明需增限定语；**[不改]** = 历史记录 / 报告 / D 类禁改面 / 用户配置模板占位。
- 候选清单（以表 A6 枚举为基线，方案期定稿逐处判类）：
  - `[改]` i18n `model.set.example`（zh/en 示例值）；`config.ts` `CONFIG_TEMPLATE_{ZH,EN}` 的 roles.fast 示例 + agents 注释示例；
  - `[轻改·待判]` `CONFIG_TEMPLATE` 的 `roles.cross_model`（异族示例 zhipu/glm-5.1）：**建议保留「异族」概念示例但在注释中标注「可选增强（框架默认不硬编码异族）」**——与裁定①「很多用户是单一模型」相容（示例不等于默认）；方案期定稿；
  - `[轻改·待判]` `agents-md/{zh-CN,en}:99` + `claude/constraint/{zh-CN,en}:101`（vision 行「多模态模型 (deepseek-flash)」→ 随 vision 终值同步；zh/en 对称）；
  - `[轻改]` skills 三份（`openfeel-agent-model-check` 6 处 / `openfeel-model-config` 3 处 / `openfeel-model-check` 1 处）：现用模型描述随 T1.1 终值同步；**且须增「用户主权键」提示**（与 T2.4 同批）；
  - `[不改]` `.openfeel/models.template.yaml`（占位值 `<填写>`；登记零改动结论）；`docs/**` / `README*`（归 93）；kb（历史条目）；测试内既有值断言（→ T1.5 单独判）；
  - `[轻改]` `model-config.ts:10-13` 注释 + `:335` 报错文案（「4 个」→「5 个」；A11）。

**T1.5 断言同批修订（判类：保留 / 改写 / 新增，零静默删除）**
- **改写**：`model-config.test.ts:138`（reviewer 条目期望值）；`opencode-config.test.ts:38/39/90/97`（框架对象期望值；`:86-95` 的「用户值保留」期望含 `openfeel-reviewer` 期望值同批）；`templates.test.ts` 的 skill 中立化断言面（`:130-135` 的 `REWRITE` 串表，如 `openfeel-model-config` 的 `'项目 agents frontmatter > 全局 agents frontmatter'`）若因 T1.4/T2.4 文本同步而触及 → **同批**判类修订（先 rg 反查再改）。
- **保留**：`claude-adapter.test.ts:39/:85`（inherit）；`managed-region.test.ts:167/178`（mergeFrontmatter 语义——若 T2 加可选参数，默认行为断言保持）；`update.test.ts:730-746`（框架字段覆盖 + 用户字段保留）。
- **新增**（T2.3 归属）：见 T2.3。

### T2 — 部署非破坏性语义（核心改造）

**T2.1 语义契约（先成文后落码）**
- 定义「用户主权键」表（本阶段 = `model`）+ 判定流程（现状 `region.status==='ok'` 分支内）：
  1. `existingFm.model` 存在 → 结果 frontmatter 的 `model` = **existing 值**（用户值）；
  2. `existingFm.model` 不存在 → `model` = incoming（模板）值（「无则创建」）；
  3. 其余键 = 现状（incoming 覆盖 + existing 独有 passthrough）。
- **边界情形成文**（防歧义）：① 用户值恰等于模板值 → 保留（无差异）；② incoming 无 `model` 键而 existing 有 → 保留（现状 passthrough，语义不变）；③ 文件为 `created`（无文件）→ 直写模板值（无「用户值」概念）；④ `appended` / `malformed` 路径不涉及（不触碰 frontmatter）。
- 契约文本落点（Q8）：计划 / 方案 + skill 文本（T2.4）；**不新增 CLI 提示面**（默认）。

**T2.2 实现面（单点化）**
- 形态（Q6 方案期定稿；二选一）：**(a) 推荐** —— `mergeFrontmatter(existing, incoming, preserveKeys?: readonly string[])`：`preserveKeys` 内含键时**不再用 incoming 覆盖**（保留 existing 值；existing 无该键则取 incoming）；默认不传 = 现行为（调用点 ② `model-config.ts:218` 不改）。**(b)** —— 部署路径（`update.ts:2393-2395`）在 `mergeFrontmatter` 之后**回写** `existingFm` 的白名单键值；不改 `managed-region` 签名。
- 调用点（B4）：部署路径传入 `['model']`（或 (b) 同义）；`model-config.ts` **不传**（`--scope default` 覆盖语义保持——不变量 2）。
- 覆盖：`setup` / `update` / `migrate` 三入口天然统一（B3 单点）。

**T2.3 测试（三类）**
- **新语义**：① claude 侧 agent：改 `model` → 再部署 → 保留（+ 正文随模板更新仍生效——验证「保留不阻碍正文更新」）；② opencode 侧 agent：同上；③ 删除 `model` 行 → 再部署 → 补写模板值（「无则创建」键级）；④ 未改 `model` 的文件：`existing` 有键 → 保留（语义 A：一律保留——文档化「框架默认值变更不自动传播到已部署环境」）。
- **零回归**：`--scope default`（`model-config`）写入仍覆盖模板（② 调用点断言）；`update.test.ts:730` 场景保持；`appended`/`malformed`/`created` 路径断言保持。
- **阴性**：白名单外键（如 `description`）用户篡改仍被覆盖（`update.test.ts:744` 同旨保持）。

**T2.4 契约文本限定化（「勿手改」→ 限定化）**
- 改动面：`agents-md/{zh-CN,en}.md:111` + `skills/openfeel-cli-usage/SKILL.md:188`（+ 双生成物）。
- 改写口径（建议稿，方案期定稿终稿）：保留「框架字段（`description`/`tools`/`permission` 等）仍会被 `update` 覆盖」；**新增一句**「**`model` 键为用户主权配置**：`update` **保留**你在 agent 文件 frontmatter 中设置的 `model` 值（无则补模板默认）」；zh/en 对称四律。
- 同步面：`openfeel-model-config` skill 的 Claude/opencode 节（「模型配置位置」处增「受部署保护」说明）——与 T1.4 的 skill 轻改**同批**（单一 owner 纪律：同一文件一次改完）。

**T2.5 可见性（默认最小）**
- **默认**：不新增 i18n 提示键 / 不新增 `update_infos` 条目类型（文件级动作维持 updated/skipped；用户经 git diff / 备份可见「model 未被改动」）。
- 备选（Q8，方案期定稿）：`update_infos` 增「preserved」类目或 TTY 一行提示；若采纳 → i18n 新基线 > 944 + 双份成对 + 接入消费点。

### T3 — 本仓 reviewer = GLM：正当持久与复现

**T3.1 隔离实测（语义验证）**
- 场景（隔离 HOME fixture + `OPENFEEL_LOG=0`）：① 部署（`setup --tools claude`）→ 手改某 agent `model` → 再部署 → **保留**；② 双 harness 同场景（opencode 侧经 `deployGlobalAsset` 同函数）；③ 删除 `model` 行 → 再部署 → 补写；④ 正文更新与 model 保留并存。
- 产出：实测记录（命令 + 版本 + 环境三要素）+ 前后对照。

**T3.2 本仓实测（真实环境；隔离优先、本仓复核二分）**
- 前置快照（表 C5）：`~/.claude/agents/` 9 份（缺 explorer）+ reviewer GLM 值 + `.bak`；`~/.config/opencode/agents/` 9 份。
- 动作：`openfeel update --tools claude`（**经 CLI，不手工**）；断言：① `openfeel-reviewer.md` 的 `model: ccs-claude-zhipu--glm-5.3-flash[1M]` **保留**（核心验收）；② `openfeel-explorer.md` **创建**（「无则创建」见证）；③ `~/.claude/settings.json` 用户键（env / modelPicker / theme / apiKeyHelper）逐字保留 + 注入键在位；④ `CLAUDE.md` 受管区语义不变；⑤ `update_state.json` 记账一致。
- 纪律：写真实用户目录前确认备份机制生效（B2）；**留痕**（前后 diff / 关键文件快照入报告）；若出现「GLM 被覆盖」→ **立即停下回滚（备份还原）并上报**（此为本阶段核心风险的终局判定）。
- **可选延伸（Q5）**：`openfeel update`（opencode 侧）实测——本机 `~/.config/opencode/agents` 同缺 explorer，可一并见证两 harness 的「无则创建」；是否执行由方案期定（副作用面 = 重写全局 opencode 资产，受非破坏性保护）。

**T3.3 复现路径成文（「正当」的载体）**
- 落点：`openfeel-model-config` skill（Claude 节）——明确「用户级 `~/.claude/agents/<id>.md` frontmatter `model` = 正式配置位；`openfeel update` **保留**该键（用户主权）」；`openfeel-agent-model-check` skill（Claude 节）——模型校验路径（`/model`、settings/env、网关）+ 自定义 ID 可用性实测法（kb `#Claude Code 实机验证方法`）。
- **本仓登记**：GLM 配置的值（`ccs-claude-zhipu--glm-5.3-flash[1M]`）/ 落点（`~/.claude/agents/openfeel-reviewer.md`）/ 复现步骤 / 生效验证法（派发 reviewer 实测）——入终局报告。
- 边界：**不做** `openfeel model` 的 Claude 侧命令扩展（Q3 默认不做——防命令面 / i18n / 测试面膨胀；若用户要求另行立项）。

### T4 — 一致性核验、反转登记与门禁收口（阶段末 op）

**T4.1 三项结论反转的 supersede 材料（原行保留不删 + 块格式，kb 写入归归档轮）**
1. **「模板硬编码 reviewer 异族」存量废止**：opencode 侧 reviewer 模板默认 `zhipuai/glm-5.3-flash` → `deepseek/deepseek-v4-flash`；材料须含「变更内容 / 理由（用户裁定 + 单一模型用户现实 + 降本）/ 适用边界（模板默认层；本地配置层仍支持异族）/ 落地方」。
2. **「勿手改全局 agent frontmatter（会被 update 覆盖）」限定化**：`model` 键除外（用户主权）；材料须含旧句 / 新句对照 + 生效范围（两 harness）。
3. **R-12 缓解路径更新**：文档可选增强表 → 用户主权键机制 + 本仓示范；材料须含「退化在单模型语境非缺陷」的定性。
- **kb / docs 写入归归档轮**（本阶段产出材料 + 触发归档动作登记）；对照先例 = kb `troubleshooting.md:1090-1097`。

**T4.2 一致性核验（静态）**
- 全枚举复核：模型值引用点（表 A6）逐处判类**零未判类**；「勿手改」文本两处（B8）+ 生成物同批；skill 引用完整性（T1.4/T2.4 改后的 skill 内提及值自洽）。
- 计数面：agent 10 / skills 22 非翻转核对（不变量 8）。
- **非翻转面阴性扫描**：`claude/agents/**` 20 份内容 diff 空（T1.2 零改动证据）；`docs/**` 零改动（除登记）。

**T4.3 门禁全量（阶段末）**
- `npm test`（**新基线登记**；起点 71 文件 / 1695 用例）/ `npx tsc --noEmit` = 0 / `lint i18n` = **实测新基线**（起点 944；新增键若有则逐键列名 + zh/en 双份 + 接入消费点）/ `lint kb` = 0 / `npm run build` ×2 幂等（`git status --porcelain src/` ⊆ produces）/ `--version` = **1.2.0**（不改，归 93）。

**T4.4 承接 REV 三分结论（表 D 汇总）**
- 处置 0（上游无本阶段面 pending REV）/ 台账保留 0 / 显式转后续或转主会话 **7**（REV-92-001~005 + REV-91-011 提供闭合证据转主会话登记；REV-92-006 维持转 93）→ **零灭失**成立。

**T4.5 收口**
- `ops/**` 精确 `git add`（禁 `-A`）；终局报告含**四表**（模型值对照 / 部署语义前后对照 / 本仓持久化实测 / 承接 REV 三分）+ 反转三项材料 + 本仓 GLM 登记；归档轮落点登记（kb 补沉 2 条 + manual 面〔`manual/core/model-config.md` 等按需〕+ supersede 材料去向）。
- **流程面移交**：`status.md` 更新经 `openfeel stage` CLI（executor 可能无 phase 推进权 → 移交主会话，登记不阻塞——承 REV-92 家族口径）。

---

## 四、开放问题（方案期 / 执行期定稿）

- **Q1 字面值可用性与回退（执行期前置，go/no-go）**。建议：按裁定字面值 `deepseek/deepseek-v4-flash` 先测（opencode 侧 `Did you mean` 权威）；**可用 → 落值**；**不可用 → 停下上报**（候选回退：① `deepseek/deepseek-flash`（本机现用、kb 历史结论）；② 用户更新环境后重试）。**禁静默择值**；处置与证据入报告。
- **Q2 用户主权键白名单边界**。建议：本阶段**仅 `model`**；「等配置」的扩展（如用户自定义 `effort`）留待用户明确后单独立项（防升维破坏框架升级传播）。执行期若发现强需求 → 登记不改。
- **Q3 `openfeel model` 是否扩展 Claude 侧**。建议：**不做**（默认）——持久由 T2 机制满足、复现由 T3.3 文档满足；若方案期论证「只读查询」形态成本可控（如 `model get --agent X --tools claude`）可评估，但**读写形态默认不做**（命令面 / i18n / 契约 / 文档全链路成本）。
- **Q4 vision 多模态例外处置**。建议：v4-flash 多模态实测；**支持 → 随 T1.1 统一**；**不支持 → vision 维持 `deepseek/deepseek-flash`** 并显式登记例外（T1.1 的 10 处中 vision 2 处例外化）+ skill 文本同步登记；上报用户确认。
- **Q5 T3.2 是否延伸 opencode 侧本仓实测**。建议：**执行**（成本低、双 harness 对称证据更完整；受非破坏性保护 + 备份机制），但先 claude 侧（核心验收）；opencode 侧如遇意外差异 → 登记。
- **Q6 T2 实现形态**。建议：**(a)** `mergeFrontmatter` 可选参（声明式、可测；默认值 = 现行为零回归）优于 (b) 调用点回写（隐式）；最终以 schemer 定稿为准（二者均须含「`--scope default` 不受影响」断言）。
- **Q7 执行顺序 94 vs 93**。建议：**94 → 93**（93 文档轮吸收本阶段变更）；若 93 先行 → 本阶段补最小登记（边界 8）。由主会话裁定（本计划不动 phase）。
- **Q8 非破坏性的可见性**。建议：**默认不加提示面**（最小改动；B10）；若用户要求「保留时可见」→ `update_infos` 条目 + i18n 键（新基线登记）。
- **Q9 `cross_model` 示例与「异族」概念文本的判类**。建议：`config.ts` CONFIG_TEMPLATE 的 `cross_model` **保留异族示例 + 注释标注「可选增强」**（示例 ≠ 默认；与裁定①相容）；`models.template.yaml` 零改动；skills 中的「异族（cross_model）」概念描述保留。方案期定稿逐处判类。
- **Q10 supersede 材料的落地时机**。建议：本阶段产出材料（T4.1）+ 归档轮写入 kb；若主会话认为须在 **stage-93 收官文档**同步口径（README/CHANGELOG 提及模型策略变更）→ 交接口径入 93 计划（本计划 §七 登记）。

## 五、验收要点（阶段级）

1. **模型默认值统一**：opencode 侧 5 agent（10 处 frontmatter）+ `opencode-config.ts` 2 条目的值 = 裁定终值（Q1 处置后），**逐处核对表**（处所 / 旧值 / 新值 / 判类）零未判类；`claude/agents/**` 20 份 **diff 空**（零改动证据）。
2. **可用性实测留痕**：v4-flash 与 vision 多模态的实测记录（命令 / 结果 / 裁定；不可用则含上报与回退登记）；**零「已支持」虚述**。
3. **部署非破坏性（隔离）**：四场景实测（改值保留 ×2 harness / 删行补写 / 正文更新并行）全绿；`--scope default` 覆盖语义回归断言绿；既有 `update.test.ts:730` 零回归。
4. **本仓持久化（真实）**：`update --tools claude` 后 —— ① reviewer GLM 值**保留**（核心）；② explorer **创建**；③ settings.json 用户键逐字 + 注入键在位；④ CLAUDE.md 受管区语义不变；前后 diff 入报告。
5. **复现路径成文**：model-config / agent-model-check skill 的「用户主权键 + 配置位置 + 校验路径」在位；本仓三要素（值 / 落点 / 复现步骤）登记。
6. **契约文本限定化**：「勿手改」两处改写 + zh/en 对称 + 生成物同批；「框架字段仍覆盖 / `model` 保留」表述一致（rg 反查零歧义）。
7. **反转材料齐备**：T4.1 三项（废止 / 限定化 / R-12 更新）成文，格式对齐 kb supersede 先例；kb 写入归归档轮登记。
8. **门禁**：`npm test` **0 skipped / 0 failed**（新基线逐项登记，起点 71 / 1695）；`tsc` = 0；`lint i18n` = 实测新基线（≥ 944，新增键逐条列名）；`lint kb` = 0；`build` ×2 幂等（`--porcelain` ⊆ produces）；`--version` = 1.2.0（不改）。
9. **承接**：表 D 三分结论零灭失；REV-92-001~005 / REV-91-011 闭合证据在位（转主会话）；REV-92-006 转 93 登记。
10. **收口**：`ops/**` 精确入管；终局报告四表 + 反转材料 + 本仓登记齐备；status.md 走 CLI（权限不足按 T4.5 移交）；归档轮落点（kb 2 条 + manual + supersede 去向）登记。

## 六、风险

| # | 风险 | 影响 | 缓解 |
|:-:|------|------|------|
| R-94-1 | **字面值不可用**（`deepseek-v4-flash` 在目标 harness 不存在——kb 存「已下线」历史 + 本机清单无此名） | **高** | Q1 执行前置实测（go/no-go）+ 权威判据 = 平台报错 `Did you mean` + **不可用即上报**（禁静默择值）+ 回退候选预登记 |
| R-94-2 | **保护逻辑误伤 `--scope default`**（`openfeel model set --scope default` 写不进模板 → 模型配置命令失效） | **高** | 不变量 2 + 调用点区分（B4）+ **专用断言**（`--scope default` 覆盖语义回归）+ 实现形态 (a)/(b) 二选一时附带该断言 |
| R-94-3 | **白名单升维失控**（顺手把 description/tools 也纳入保护 → 框架升级传播断裂） | 中 | 边界 2（仅 `model`）+ 阴性断言（`update.test.ts:744` 同旨保持）+ 审查聚焦「白名单恰为单键」 |
| R-94-4 | **「勿手改」文本反转引发文档矛盾**（agents-md / constraint / skill / 生成物不同批 → 多源口径不一） | 中 | T2.4 同批 + zh/en 对称四律 + rg 反查（kb #多源文案同步陷阱） |
| R-94-5 | **vision 多模态失效**（v4-flash 不支持图像输入而随大流改值） | **中高** | A7 例外门 + Q4 实测前置 + 不支持则维持现值 + skill 文本同步 |
| R-94-6 | **本仓实测写真实用户目录的副作用**（`~/.claude` 重写：CLAUDE.md / settings.json / agents 补齐） | 中 | 备份机制在位（B2）+ 前置快照（C5）+ 隔离优先二分（kb #双主题验收范式）+ 异常即停回滚 |
| R-94-7 | **断言改写遗漏**（model 值断言 4 处 / 「勿手改」串断言 / 新增场景缺失） | 中 | T1.5 判类表（保留 / 改写 / 新增，零静默删除）+ T2.3 三场景 + 全枚举复核（T4.2） |
| R-94-8 | **生成物漏 build**（改 templates-data 忘重生成 → 部署值仍旧） | 中 | 双生成物同批 `npm run build` + `--porcelain` 断言（kb 同族坑位） |
| R-94-9 | **与 93 收口口径错位**（93 文档先行 → README/CHANGELOG 未含本阶段变更） | 低 | 边界 8 顺序建议（94 → 93）+ §七 交接口径登记 |
| R-94-10 | **R-12 定性被误读为「框架放弃交叉审查」** | 低 | T4.1 材料明示三层（机制 / 文档 / 本仓示范）+ 「单模型语境非缺陷」定性 + 反查表述 |
| R-94-11 | **i18n 面遗漏**（示例值改后 zh/en 不同步 / 若加提示键漏登记） | 低 | 双份成对 + 消费点接入 + 新基线登记（> 944 逐键列名） |
| R-94-12 | **阶段末流程面权限拒绝**（executor 无 `openfeel stage` 权 → status.md 脱节） | 低 | T4.5 显式移交主会话（承 REV-92 家族）+ 终局报告登记不阻塞 |

**回滚**：源码层均可 `git revert` 对应提交；模型值变更 = 单行值（逐文件 revert + build 重生成）；部署语义变更 = 单函数（`mergeFrontmatter` 参数 / 调用点）——回滚即恢复「incoming 覆盖」现行为（**无数据格式破坏**：不触碰 `update_state.json` schema / `flow.json` / phase 枚举 / `--json` 既有键）；本仓 GLM 值在回滚后恢复「手工易被覆盖」状态（配置本身不丢——git/备份双保险）。

---

## 七、承接 REV 与处置表（REV-85-002 固化口径；判据源 = 上游台账文件）

- **判据源**：`.openfeel/users/Liuary/code_review/REV-92.md`（001~006）+ `REV-91.md`（011）+ 本会话门禁实测。

| 上游条目 | 优先级 | 去向 | 依据 |
|---------|:--:|------|------|
| **REV-92-001 / 002 / 003 / 004**（执行期已落实四条） | low ×3 + medium | **本阶段提供闭环证据 → 转主会话登记 closed** | REV-92 摘要 §9 实证（54 行订正 / deps 对账表 / 论证订正 / 选 a 零改动）；planner 不改他人台账 |
| **REV-92-005**（门禁五项未独立复跑） | low | **本阶段独立复跑完成 → 转主会话登记 closed** | 本会话实测：71/1695/0 failed、tsc 0、i18n 944、kb 0、src 空 |
| **REV-92-006**（BFS 语义精度） | low | **维持转 stage-93 收口轮 / 后续版本裁定** | 非本阶段面（flow-manager）；零触碰 |
| **REV-91-011**（门禁未独立复跑） | low | 再次旁证，维持转主会话登记 | 同 D5 证据 |

- **三分结论**：本阶段处置 **0**（无本阶段面 pending REV）／台账保留 **0**／显式转后续或转主会话 **7**（含 6 条提供闭环证据 + 1 条转 93）→ **零灭失**成立。
- **产出清单双向偏差登记（供 `deps.yaml` 后续同步与阶段对账；同步由主会话执行，本 Agent 不直改）**：

| 面 | 条目 | 说明 |
|----|------|------|
| **deps.yaml 缺登记**（本阶段不在 `deps.yaml`） | 建议主会话补登 `v1.2.1-stage-94` 条目（name / deps=[92] / priority=P0 / est_ops=3〔见 §八〕/ produces_core 见下行） | 依据 = flow.json 已注册（revision 1163）而 deps.yaml 未含（八阶段表外补阶段） |
| **产出增补面** | ① `src/core/templates-data/opencode/agents/{zh-CN,en}/openfeel-{executor,explorer,utility,vision,reviewer}.md` ② `src/core/opencode-config.ts` ③ `src/core/update.ts`〔**已在 deps 通用面，但本阶段为语义改造非重生成**〕④ `src/core/managed-region.ts`〔**deps 未含——建议补**〕⑤ `src/core/config.ts`〔轻改注释/示例〕⑥ `src/core/i18n-data/{zh-CN,en}.ts`〔示例值；若 Q8 加键则含新键〕⑦ `templates-data/agents-md/{zh-CN,en}.md` ⑧ `templates-data/claude/constraint/{zh-CN,en}.md`〔轻改〕⑨ `templates-data/skills/{openfeel-agent-model-check,openfeel-model-config,openfeel-model-check,openfeel-cli-usage}/SKILL.md` ⑩ `test/core/{model-config,opencode-config,update,managed-region,claude-adapter,templates}.test.ts` ⑪ `.openfeel/plan/v1/stage-94/ops/**` | ①~⑪ 见 §三；deps 侧若补登，`produces_core` 以此表为准 |
| **移除面 / 零改动面**（登记防误判） | `.openfeel/models.template.yaml`（占位，零改动）/ `docs/**` + `README*` + `CHANGELOG.md`（归 93）/ `src/core/init.ts` / `src/core/setup.ts`〔**调用方零改动**——单点化〕/ `build.js` / `package.json` / `.openfeel/pipeline.yaml` / `.openfeel/flow.json` / `.openfeel/config.yaml`〔本仓 models 节是否同步见 Q9 判类，默认零改动〕 | 按边界 4/7 隔离 |
| **交接口径 → stage-93** | 93 文档轮须吸收：① 模型默认值策略（opencode 显式默认统一 + claude inherit 维持）；② 部署非破坏性（用户主权键 `model`）；③ 反转三项口径（README / CHANGELOG / cli-usage 快照 / GETTING_STARTED 视情）；④ R-12 定性更新（若 docs 蓝本需补「实施偏差」行） | 建议 94 → 93（边界 8）；若 93 先行 → 本阶段补最小登记 |

## 八、op 拆分建议（供 openfeel-schemer 定稿；`est_ops = 3`〔无版本计划登记值——本阶段表外，`est_ops` 由本计划建议并请主会话对账〕）

| op | 内容 | 主要文件 | 依赖 |
|:--:|------|------|------|
| `op-001` | **T1 模型默认值统一**：可用性实测（Q1/Q4 前置）/ 10 处 frontmatter + `opencode-config.ts` 2 条目 / 一致性文本逐处判类 / 断言同批（改写 4 处 + 保留） | `templates-data/opencode/agents/{zh-CN,en}/openfeel-{executor,explorer,utility,vision,reviewer}.md`、`src/core/opencode-config.ts`、`src/core/config.ts`、`src/core/i18n-data/*.ts`、`templates-data/{agents-md,claude/constraint}/*`、`templates-data/skills/*`、`test/core/{model-config,opencode-config}.test.ts` | — |
| `op-002` | **T2 部署非破坏性 + T3 本仓持久化**：`mergeFrontmatter` 可选参（或调用点回写）/ 三场景测试 + `--scope default` 回归断言 / 「勿手改」文本限定化 / skill 复现路径成文 / **本仓双 harness 实测**（GLM 保留 + explorer 补齐 + settings 保留） | `src/core/update.ts`、`src/core/managed-region.ts`、`templates-data/agents-md/{zh-CN,en}.md`、`templates-data/skills/{openfeel-cli-usage,openfeel-model-config,openfeel-agent-model-check}/SKILL.md`、`test/core/{update,managed-region}.test.ts` | **hard: op-001**（同批 build / 模板文件去重——两 op 均改 templates-data，串行减少两次 build 的中间态） |
| `op-003` | **T4 一致性核验与门禁收口（阶段末 op）**：全枚举复核 / 计数非翻转 / 反转三项材料 / 门禁全量（新基线登记）/ 承接 REV 三分 / 四表报告 / ops 入管 / 流程面移交主会话 | `test/**`（收口断言）、`.openfeel/plan/v1/stage-94/ops/**`、`.openfeel/plan/v1/stage-94/status.md`（经 CLI，勿手改） | **hard: op-001 / op-002**（源码冻结后） |

- **文件冲突（`mutual_exclusion`）**：op-001 与 op-002 共有 `templates-data/**` 与**双生成物**（两次 build 的中间态）→ **恒串行**；op-003 为收口（恒末位）。
- **降级方案（2 op）**：若方案期判定「复现路径成文」可并入 op-001 的 skill 文本批次 → op-002 仅剩源码语义（op 数 = 2）；**取舍须在方案期显式登记**。
- **op 级依赖与文件清单由 openfeel-schemer 落 `ops/deps.yaml`**（hard / soft / mutual_exclusion，声明实际文件名）。

## 九、修订记录

| 时间 | 制定人 | 说明 |
|------|--------|------|
| 2026-10-15 | openfeel-planner | 初稿：依据用户直接指令四条（观察 + 裁定①②③）制定——裁定①（模型默认值：除 inherit 外统一 `deepseek-v4-flash`）/ 裁定②（部署非破坏性：无则创建、有则不覆盖用户设定）/ 裁定③（本仓 reviewer = GLM 正当持久复现）；权威输入 = `docs/claude-code-adapter-plan.md`（R-12 / §三 / 决策 6）+ kb 20 余条 + `plan/v1/v1.2.1/plan.md` §七.7 + 源码 / 运行时复核 **4 表 34 项**（模型默认值面 A1~A12、部署非破坏性面 B1~B10、本仓 reviewer 与运行链面 C1~C5、承接 REV 台账 D1~D7）；变更点 T1~T4；开放问题 Q1~Q10；风险 R-94-1~12；承接表（处置 0 / 保留 0 / 转出 7）；op 拆分建议 3 项（含 2 op 降级方案）。**只写本计划文档**（未改源码 / 未改 `deps.yaml` / 未直写 flow.json / 未推进 phase / 未写其它阶段文件；基线 HEAD `3db367a`，门禁 5 项本会话独立实测）。 |
