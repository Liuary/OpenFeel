# v1.6.3-stage-136 计划（REQ-070 / fast 模式）

> 来源：需求正文 `.openfeel/requirements/REQ-070.md`（**判据源**，A70.1—A70.7）。本文件是执行前拆解与判据；判据编号只增不改，执行中变更按 §四 登记。
> **A70.7 落盘状态**：本次计划审查（REJECT 5 blocking + 4 major）后新增；需求正文由 Feel 经 `feel_req body` 同批补入（需求正文是 guard 保护路径，planner 不直写）。正文未补前 A70.7 以本文件 §1.1 为准，补入后两者必须逐字一致。
> 角色：`executor-a`＝T1/T2/T3/T6/T7 与 S7 门禁执行（模板、适配器、core、dsh 工具面、文档与版本）；`executor-b`＝T4/T5（skills 文案、测试；`templates.test.ts:151` 钉死串与 T4 **同批**改）；`reviewer`＝**独立复跑 C1—C7 并复核 A70.6 证据**；`Feel`＝状态写操作与派单。
> **不包含**：`git push` / tag / 真实 `npm publish`（归人类）；不改 `flow.json` / `status.md` / `dist/**`；不改提示词（`renderFeelPrompt` 与 4 份 feel.md 零改动，A70 未要求）。

## 一、目标与判据

### 1.0 事实锚点（2026-11-25 实测）

- **模板**：`templates-data/opencode/agents/{zh-CN,en}/` 共 20 份，其中 **10 份**（executor / explorer / reviewer / utility / vision × 双语）frontmatter **第 4 行** `model: deepseek/deepseek-flash`（`Select-String '^model:'` 实测 10 条）；feel / planner / schemer / feel-tester / archiver 无 `model:`。
- **正文举例**：同 20 份中 **8 份**含「（如 DeepSeek V4 Pro）」/「(such as DeepSeek V4 Pro)」：planner（zh:62 / en:68）、schemer（zh:86 / en:90）、archiver（zh:87 / en:91）、feel-tester（zh:63 / en:70）。
- **残留厂商名**：`templates-data/agents-md/{zh-CN:103,en:103}`、`templates-data/claude/constraint/{zh-CN:105,en:105}` 的 vision 行仍写「多模态模型 (deepseek-flash)」/「Multimodal model (deepseek-flash)」。
- **框架注入**：`src/core/opencode-config.ts:15-26` `buildGlobalOpencodeFrameworkObj()` 的 `agent: { 'openfeel-vision': { model }, 'openfeel-reviewer': { model } }`；消费方 `mergeGlobalOpencodeJsonc`（`:109-124`）经 `setup.ts:114` / `update.ts` / `migrate.ts:544` 写入用户 `opencode.jsonc`。
- **default 层实现**：`src/core/model-config.ts` 读 `readFrontmatterModel:194-205` / `readOpencodeConfigAgentModel:230-240`，写 `writeFrontmatterModel:208-221` / `writeOpencodeConfigAgentModel:247-260`，编排 `defaultScopeSources:310-315` / `getDefaultScopeValue:322-329`；`setAgentModel` 的 default 分支 `:352-365`；生效链 `getAgentModel:392-409` 为 `default > project > global`。CLI：`src/commands/model.ts:115-124`（needConfirm / noSourceRepo）、`:87-91`（shadowed 提示）、`:10` 导入 `isFrameworkSourceReady`。
- **基线实测**：`node bin/openfeel.js model get openfeel-executor --scope default --json` → `model: "deepseek-flash", source: "default"`（exit 0）；不带 scope 时同一结果。改后两者应为 `model: null, source: null`（exit 0）。
- **生成链路（build.js 实测）**：管线 `generateAgentDefinitions → generateAgentsMdTemplate → generateSkillDefinitions → generateOpencodeAgentTemplates → generateOpencodeSkillTemplates → generateOpencodeConfigTemplates → generateClaudeAgentTemplates → generateClaudeConstraintTemplate → npx tsc → validate*`。写 **`template-loader.ts` 的 6 个锚点**（`AGENT_TEMPLATES` / `AGENTS_MD_TEMPLATES` / `OPENCODE_AGENT_TEMPLATES` / `OPENCODE_SKILL_DEFINITIONS` / `CLAUDE_AGENT_TEMPLATES` / `CLAUDE_CONSTRAINT_TEMPLATES`）与 **`update.ts` 的 `SKILL_DEFINITIONS`**；末尾 `validateSingleSourceConsistency()` 断言 `AGENT_TEMPLATES` 与 `OPENCODE_AGENT_TEMPLATES` 内容逐字节一致、skills 两侧一致、Claude 键集一致——**只改一侧漏 build 会让 build 自己 exit 1**（三重校验：源↔注入、双侧注入、锚点存在）。`templates-migration.test.ts:50` 只逐字节锁 skills 两侧。
- **版本**：root / dsh `package.json` = `1.6.2`、dsh `openfeel.requiresCli = ">=1.6.2"`、`--version` = 1.6.2 → 目标 **1.6.3**；`package-lock.json` 根 `version` 两处（`:3`/`:9`）。
- **dsh 工具面**：`dsh/lib/tools/index.js:1937` description「三层级：default / global / project」、`:1941` 示例模型 `deepseek/deepseek-flash`、`:1942` `scope: stringEnum(['default','global','project'])`。`dsh/test/contract.js:184-190` 只查 enum 非空/去重（`:245`/`:263` 取 `enum[0]` 作合法值，`global` 顶替 `default` 无碍）；`dsh/test/verify.js:1759-1760`（scope 为 null 或字符串）、`:1810`（`scope:'project'`）均不依赖 `default`。
- **文档表层**：`dsh/docs/compat/commands.md:293-305`（三行 scope 枚举 + default 守卫 + `default > project > global`）；`dsh/ADAPTER.md:18`（现为 `≥1.6.0`，已落后于 1.6.2）、`:205`（`## v1.6.1` **历史小节**基线行）；`dsh/ACTION-GUIDE.md:223`（历史设计记录，附旧行号 L1142/L1151）；`dsh/docs/compat/kb-skills.md:707`（断言 `--scope default` 故意不传白名单）；`docs/json-contract.md:175`/`:429`（`source` 链 default > project > global）；`README.zh-CN.md:149` / `README.en.md:149`「三层级」；`docs/commands.md:1110`/`:1115`/`:1120`；`docs/VERSIONS.md:20`（English v1.6.2 bullet 最新）/`:60`（中文 `## v1.6.2` 段）。
- **约束锚**：`templates.test.ts` 的 `AGENT_SIZE_TARGETS`（40 条）与 `claude-adapter.test.ts:150-153`（agents-md / constraint 4 份）**只设字节上限**：实测 opencode/zh planner 3980 B ≤ 5355、agents-md zh 12646 B ≤ 18287、en 15184 B ≤ 21371、constraint zh 12707 B ≤ 18408、en 15319 B ≤ 21528 → T7 的改写字数变化（先缩后略增）**不会触顶，无需改常量**。`openfeel-cli-usage/SKILL.md` frontmatter `description` 定长 **2766**（`templates.test.ts:569`）→ T4 **不动该 frontmatter**。
- **既有钉死串**：`templates.test.ts:148-154` 的 `OPENCODE_STRINGS['openfeel-model-config']` 含 ``openfeel model set/get/list --scope default|global|project``——T4 把该行改成 `--scope global|project` 后，**同批**改此断言（不得删用例）。
- **静态断言**：`update.test.ts:842-849`（stage-94 阴性）断言 `model-config.ts` 含 `mergeFrontmatter(split.frontmatter, { model })` 且不含 `USER_SOVEREIGN_KEYS`；T3 删除 `writeFrontmatterModel` 后必红 → T5 同批重写。

### 1.1 判据表

| 判据 | 要点 | 取证 |
|------|------|------|
| **A70.1** | 10 份 opencode agent 模板 frontmatter 零 `model:` 行；注入副本同步零 | C1 |
| **A70.2** | `opencode-config.ts` 无框架 agent model 注入；`buildGlobalOpencodeFrameworkObj()` 只剩 `$schema` / `default_agent` | C2 |
| **A70.3** | `get --scope default` 返回 unset；`set --scope default` exit 1 并提示 global/project；生效链改 `project > global > 平台默认`；global/project 行为不变 | C3 |
| **A70.4** | 4 个 skill 不再把 deepseek 系列当默认/主力/异种；`cli-usage` 正文不再称「三层级」；必需串零回归（含 `templates.test.ts:151` 改为 `--scope global|project`） | C4 |
| **A70.5** | README×2 / `docs/commands.md` / `docs/json-contract.md` / `docs/VERSIONS.md`（中英）/ `CHANGELOG` / `dsh/ADAPTER.md` / `dsh/lib/tools/index.js` / `dsh/docs/compat/commands.md` 同批；版本 1.6.3 lockstep | C5 |
| **A70.6** | `npm test`、`tsc --noEmit`、`npm run build`（两遍幂等）、dsh 四测、`lint i18n`、`release --dry-run` 全绿；**executor-a 执行 + reviewer 独立复核**（S7） | C6 |
| **A70.7** | `agents-md/{zh-CN,en}.md` 与 `claude/constraint/{zh-CN,en}.md` 的 vision 行改「多模态模型（由平台提供）」/「Multimodal model (platform-provided)」；opencode agent 正文 8 处「（如 DeepSeek V4 Pro）」→「（例如你选择的模型）」（en `(e.g., the model you choose)`）；注入副本同步 | C7 |

### 1.2 可复现命令（仓库根，pwsh）

```powershell
# C1（A70.1）—— 顺序固定：源 → npm run build → 注入副本（build 重生成 template-loader.ts/update.ts；手改注入段一律无效）
Get-ChildItem src/core/templates-data/opencode/agents -Recurse -Filter *.md | Select-String -Pattern '^model:'   # 0 行
npm run build                                                                                                    # exit 0（含 npx tsc + 三重一致性校验）
Select-String -Path src/core/template-loader.ts -Pattern '^model: deepseek'                                      # 0 行（注入副本）
# C2（A70.2）
Select-String -Path src/core/opencode-config.ts -Pattern 'openfeel-vision|openfeel-reviewer|model:'               # 0 行
npx vitest run test/core/opencode-config.test.ts                                                                  # 绿
# C3（A70.3）—— 期望 default:null/source:null、set default exit 1、生效值取 project/global
node bin/openfeel.js model get openfeel-executor --scope default --json
node bin/openfeel.js model set openfeel-executor deepseek/x --scope default; $LASTEXITCODE                         # 1
npx vitest run test/core/model-config.test.ts test/commands/model.test.ts                                          # 绿
# C4（A70.4）：负向零命中 + 正向「不预设/按需」
Get-ChildItem src/core/templates-data/skills -Recurse -Filter SKILL.md | Select-String -Pattern 'deepseek-v4-pro|当前默认使用|显式默认收敛为|主力推理模型|异种推理'   # 0 行
Get-ChildItem src/core/templates-data/skills -Recurse -Filter SKILL.md | Select-String -Pattern '不预设|按平台|会话所选'  # ≥3 文件
Select-String -Path src/core/templates-data/skills/openfeel-cli-usage/SKILL.md -Pattern '三层级|default > project > global'   # 0 行
npx vitest run test/core/templates.test.ts test/core/templates-migration.test.ts                                   # 绿（含注入副本逐字节 + 改后的 OPENCODE_STRINGS）
# C5（A70.5）
node -p "require('./package.json').version + ' / ' + require('./dsh/package.json').version + ' / ' + require('./dsh/package.json').openfeel.requiresCli + ' / ' + require('./package-lock.json').version"; node bin/openfeel.js --version
Get-Content CHANGELOG.md -TotalCount 2; Select-String -Path docs/VERSIONS.md -Pattern '^## v1\.6\.3'                # 命中（中文段 + 英文 bullet v1.6.3）
Select-String -Path dsh/ADAPTER.md -Pattern 'requiresCli\D*1\.6\.3|^## v1\.6\.3'                                   # ≥2 命中（:18 + 新增 v1.6.3 小节）
Select-String -Path dsh/lib/tools/index.js -Pattern "stringEnum\(\['default'"                                      # 0 行（scope 枚举去 default）
Select-String -Path dsh/docs/compat/commands.md -Pattern 'default\\\|global\\\|project|default > project > global'  # 0 行
Select-String -Path README.zh-CN.md,README.en.md,docs/commands.md,docs/json-contract.md -Pattern '三层级|Three-tier agent model|default > project > global'   # 0 行
# C6（A70.6）全量门禁 + 发布预演（不 push / 不 publish）—— S7 由 executor-a 跑、reviewer 独立复跑
npx tsc --noEmit; npm test; npm run build; npm run build                                    # 第二遍 build 无 diff
cd dsh; node test/contract.js; node test/verify.js; node test/guard.js; node test/integration.js; cd ..
node bin/openfeel.js lint i18n; node scripts/release.mjs --dry-run --skip-build              # exit 0
# C7（A70.7）—— 源侧零残留 + 正向新文案 + 注入副本（T7 收尾先 npm run build）
Get-ChildItem src/core/templates-data -Recurse -Filter *.md | Select-String -Pattern 'DeepSeek V4 Pro|多模态模型 \(deepseek-flash\)|Multimodal model \(deepseek-flash\)'   # 0 行
Get-ChildItem src/core/templates-data -Recurse -Filter *.md | Select-String -Pattern '例如你选择的模型|the model you choose'                                                # 8 行
Get-ChildItem src/core/templates-data -Recurse -Filter *.md | Select-String -Pattern '多模态模型（由平台提供）|Multimodal model \(platform-provided\)'                     # 4 行
Select-String -Path src/core/template-loader.ts -Pattern 'DeepSeek V4 Pro|多模态模型 \(deepseek-flash\)|Multimodal model \(deepseek-flash\)'                               # 0 行
npx vitest run test/core/templates.test.ts test/core/templates-migration.test.ts test/core/claude-adapter.test.ts                                                        # 绿
```

## 二、任务拆解

### 2.0 单写者矩阵（严格串行）

| 文件 | 写者 | 说明 |
|------|------|------|
| `templates-data/opencode/agents/{zh-CN,en}/*.md`（10 份 **frontmatter**） | **仅 T1** | 只删 `model:` 行（`:4`）；正文一行不动 |
| 同 8 份 **正文**举例（planner / schemer / archiver / feel-tester × 双语）+ `templates-data/agents-md/*.md` + `templates-data/claude/constraint/*.md` | **仅 T7** | 严格在 T1 之后；同一文件不同行，禁止混进 T1 |
| `src/core/opencode-config.ts` | **仅 T2** | 只动 `buildGlobalOpencodeFrameworkObj`；`parseJsonc` / `deepMergeJsonc` / `mergeGlobalOpencodeJsonc` 逻辑不动 |
| `src/core/model-config.ts`、`src/commands/model.ts`、`src/core/i18n-data/{zh-CN,en}.ts`、`template-loader.ts`/`update.ts` 注入段（仅由 build 生成） | **仅 T3** | 注入段禁止手改 |
| `templates-data/skills/{openfeel-model-check,openfeel-model-config,openfeel-agent-model-check,openfeel-cli-usage}/SKILL.md` | **仅 T4** | 文案；`cli-usage` frontmatter 定长 2766 不动 |
| `test/core/model-config.test.ts`、`test/core/opencode-config.test.ts`、`test/commands/model.test.ts`、`test/cli/json-contract.test.ts`、`test/core/update.test.ts`、`test/core/templates.test.ts` | **仅 T5** | 重定基线 + 新增锁定断言；`templates.test.ts:151` 与 T4 同批（同一写者 executor-b） |
| `README.zh-CN.md`、`README.en.md`、`docs/commands.md`、`docs/json-contract.md`、`docs/VERSIONS.md`、`CHANGELOG.md`、`dsh/ADAPTER.md`、`dsh/lib/tools/index.js`、`dsh/docs/compat/commands.md`、`package.json`、`dsh/package.json`、`package-lock.json`(:3/:9) | **仅 T6** | 文档、dsh 工具面与版本同批 |

### T1（= A70.1）模板去 model
- 10 份逐份删除 frontmatter 第 4 行 `model: deepseek/deepseek-flash`；其余 frontmatter 键不动。**本任务只改 frontmatter**：正文举例（「（如 DeepSeek V4 Pro）」）由 T7 单独提交，T1 的 diff 里不得出现正文行。
- **S1 收尾立即 `npm run build`**，再取 C1：build 会重生成 `template-loader.ts`（`AGENT_TEMPLATES` / `AGENTS_MD_TEMPLATES` / `OPENCODE_AGENT_TEMPLATES` / `OPENCODE_SKILL_DEFINITIONS` / `CLAUDE_AGENT_TEMPLATES` / `CLAUDE_CONSTRAINT_TEMPLATES`）与 `update.ts`（`SKILL_DEFINITIONS`），并重跑 `npx tsc` 与三重一致性校验；**注入副本零 `model:` 只能在 build 之后验**。
- **负责/依赖/验收**：executor-a；无依赖；C1（含 `npm run build` exit 0）。

### T7（= A70.7）残留预设面去厂商名（正文与约束层）
- `templates-data/agents-md/zh-CN.md:103`、`claude/constraint/zh-CN.md:105`：`多模态模型 (deepseek-flash)` → `多模态模型（由平台提供）`。
- `templates-data/agents-md/en.md:103`、`claude/constraint/en.md:105`：`Multimodal model (deepseek-flash)` → `Multimodal model (platform-provided)`。
- opencode agent 正文 8 处：`（如 DeepSeek V4 Pro）` → `（例如你选择的模型）`；en `(such as DeepSeek V4 Pro)` → `(e.g., the model you choose)`。位置：planner（zh:62 / en:68）、schemer（zh:86 / en:90）、archiver（zh:87 / en:91）、feel-tester（zh:63 / en:70）；保留前置角色词（推理模型 / 主力推理模型）与整句结构，**只换括注**。
- **不做**：不改 `claude/agents/*/openfeel-vision.md` 的「Claude 侧多模态模型」（无厂商名）、不改 `opencode/agents/*/openfeel-vision.md` 的「由多模态模型驱动」（能力事实）、不动任何 frontmatter。
- **写者/顺序**：executor-a；**严格在 T1 之后**（同 8 份文件，T1 只收 frontmatter）；T7 收尾 `npm run build` 后取 C7。测试侧锁定断言由 T5（executor-b）同批加，`templates.test.ts:151` 的 skill 钉死串走 T4/T5 那批，与本任务无文件交集。
- **字节上限**：`AGENT_SIZE_TARGETS` 与 `claude-adapter.test.ts:150-153` 只设上限且余量充足（§1.0），**不改常量**；改后若意外触顶，停手上报而不是放宽上限。
- **负责/依赖/验收**：executor-a；依赖 T1；C7。

### T2（= A70.2）opencode-config 去注入
- `buildGlobalOpencodeFrameworkObj()` 返回 `{ $schema: 'https://opencode.ai/config.json', default_agent: 'feel' }`：删除整个 `agent` 键；函数注释改为「框架不注入任何 agent 默认（v1.6.3 / REQ-070）：模型由平台/会话或用户 global/project 配置决定」。
- **保留** `mergeAgentDefaults` 与 `deepMergeJsonc` 的 `key === 'agent'` 分支：用户 `opencode.jsonc` 既有 agent 条目原样透传的语义不变（`test/core/opencode-config.test.ts:84-97` 该用例继续有效）。
- **负责/依赖/验收**：executor-a；依赖 T1、T7；C2。

### T3（= A70.3）model-config 两层语义
- `model-config.ts` 头注释重写：两层（global / project）+ 平台默认；default 层已移除。
- 删除：`resolveFrameworkRoot` / `agentsTemplatesDir` / `agentTemplatePath` / `opencodeConfigTsPath` / `isFrameworkSourceReady` / `readFrontmatterModel` / `writeFrontmatterModel` / `readOpencodeConfigAgentModel` / `writeOpencodeConfigAgentModel` / `defaultScopeSources` / `getDefaultScopeValue`，以及 `ModelConfigOptions.frameworkRoot` 与不再使用的 import（`splitFrontmatter`/`mergeFrontmatter`/`serializeFrontmatter`、`fileURLToPath`）。
- `setAgentModel`：`scope === 'default'` → 立即 `throw new Error('default 层已移除（v1.6.3 / REQ-070）：框架不再预设模型，请改用 --scope global（本机全局）或 --scope project（当前项目）')`；global / project 分支零改动（含加锁与 update_state hash 回写）。
- `getAgentModel`：`byScope = { project, global, default: null }`（**保留 default 键**，`test/core/model-config.test.ts:236-240` 与 JSON 契约依赖它）；`effective = scope ? byScope[scope] : (project ?? global ?? undefined)`；`inconsistent: false`（字段保留不删）。
- `commands/model.ts`：set action 在 `parseScope` 后**先**判 default → `console.error(t('model.set.defaultRemoved'))` + `process.exit(1)`；删除 needConfirm / noSourceRepo 分支与 `isFrameworkSourceReady` 导入；get/list 的 `--scope default` 仍合法（渲染 `model.get.none`「未显式设置，走平台默认」）；`printByScope` 的 shadowed / inconsistent 分支保留（恒不触发，零 churn）。
- i18n：新增 `model.set.defaultRemoved`（zh-CN.ts / en.ts **同批**，`lint i18n` 门）；`model.set.needConfirm`/`noSourceRepo` 键保留不删（避免键面抖动）。改完 `npm run build` 重生成注入段。
- **负责/依赖/验收**：executor-a；依赖 T1、T7、T2；C3。

### T4（= A70.4）skills 文案去预设
- `openfeel-model-check/SKILL.md`：`:57-77` 示例 YAML 的 `deepseek-v4-pro` / `deepseek-flash` 换占位（`sample-provider` / `sample-model-id`）并注明「示例值，非框架默认」；`:80` provider 枚举保留（事实）；`:102-107` 对比表把「主力推理 / 异种推理 / 快速」期望列改为「由用户/平台决定」，实际模型列写 `—`（未预设）。
- `openfeel-model-config/SKILL.md`：`:29` 示例值改 `{provider}/{model-id}`；`:37` 改「两层」并把钉死串改成 **`openfeel model set/get/list --scope global|project`**（后面紧跟「一键读写两层级模型（全局 / 当前项目）」）；`:56-64` 保留 opencode 优先级链原文（`templates.test.ts:151` 钉死串 `项目 agents frontmatter > 全局 agents frontmatter`）并补一句「框架部署的 agent 模板不带 `model` 键，故 default 来源不存在」；`:82-84`、`:96-106` 删「现用 deepseek-flash / DeepSeek V4 Pro / 需配 deepseek-flash」。
- `openfeel-agent-model-check/SKILL.md`：`:35`/`:42`/`:118-127`/`:138` 改「须选支持图像输入的模型（由平台/会话或 global/project 配置决定）」；候选表（`:120-127`）保留但删「当前默认使用 / 推荐」措辞。**必需串零回归**：`~/.local/share/opencode/auth.json`、`opencode.jsonc`、`必须重启 opencode`。
- `openfeel-cli-usage/SKILL.md`：正文三处——`:34`「模型三层级配置」→「模型两层配置（global / project）」；`:300`「`source` = default > project > global」→「`source` = 生效层（v1.6.3 起 project > global > 平台默认，default 层已移除）」；`:323`「opencode 侧显式默认收敛为 `deepseek/deepseek-flash`」→「框架不预设任何模型（v1.6.3 / REQ-070）：opencode 侧不再注入 agent model，模型由平台/会话或用户 `--scope global|project` 决定」。**frontmatter 零改动**（定长 2766）。
- **同批测试（executor-b 一并做，避免中间态红）**：`templates.test.ts:151` 的 ``openfeel model set/get/list --scope default|global|project`` 改为 **`openfeel model set/get/list --scope global|project`**；用例保留、只换串（不得删）。
- 收尾 `npm run build` 重生成两处注入副本；C4 负向 0 行。
- **负责/依赖/验收**：executor-b；依赖 T1（可并行 T7）；C4。

### T5（= A70.6 前半）测试重定基线
- `test/core/model-config.test.ts`：default 层 describe 整段重写（set default 抛「已移除」/ `get --scope default` 的 `byScope.default === null` / 生效链 `project > global` / 两 scope 都空时 `effective === undefined`）；删除 `setupFrameworkTmp`+`copyDirSync` 与 `frameworkRoot` 传参；global/project/幂等用例保留。
- `test/core/opencode-config.test.ts`：`:35-40` 改为「不含 `agent` 键」；`:84-97` 字面 overlay 用例保留。
- `test/commands/model.test.ts`：`:54-59` 改断言新文案（含 `default` 且 exit 1）；`:138-170` 的 `source=default` → `source=project`，并新增「`get --scope default --json` → `model:null,source:null`」；T41 `--build` 用例保留。
- `test/cli/json-contract.test.ts:1121-1128`：`eff.source` 改 `'project'`（同段注释同步改）。
- `test/core/update.test.ts:762-827`：三条 stage-94 用例重定基线——模板无 `model` 键 ⇒ 部署**不写** model（阴性断言），用户手工插入的 `model` 行仍保留（「无则创建」退化为「不创建」）。
- `test/core/update.test.ts:842-849`：该用例静态断言 `model-config.ts` 含 `mergeFrontmatter(split.frontmatter, { model })`，T3 删除写 helper 后必红 → **同批重写为阴性**（断言 `model-config.ts` 不含 `writeFrontmatterModel` / 不含 `mergeFrontmatter(split.frontmatter, { model })` / 不含 `USER_SOVEREIGN_KEYS`，并把用例意图注释改为「default 层写入路径已移除，用户主权键保护只在部署白名单面成立」）；不准静默删除用例。
- `test/core/templates.test.ts`：① T4 同批换 `OPENCODE_STRINGS:151` 串（见 T4）；② 新增锁定断言——10 份 opencode agent 模板零 `^model:`、`OPENCODE_AGENT_TEMPLATES` 注入副本同步零；③ 新增 A70.7 断言——`agents-md` ×2 + `constraint` ×2 含新文案且零 `deepseek-flash`/`DeepSeek V4 Pro`，8 份 agent 正文含「例如你选择的模型」/`the model you choose` 且零 `DeepSeek V4 Pro`，注入副本 `AGENTS_MD_TEMPLATES` / `CLAUDE_CONSTRAINT_TEMPLATES` 同步。
- **负责/依赖/验收**：executor-b；依赖 T1—T4、T7；C1—C4、C7。

### T6（= A70.5）文档、dsh 工具面与版本 1.6.3
- `README.zh-CN.md:12` / `README.en.md:10` 追加一句「v1.6.3 起 opencode agent 模板不再带 `model`，约束层与 agent 正文不再点名厂商模型，`openfeel model` 只剩 global / project 两层」；`:149` 命令表「三层级」→「两层级（global / project）」（en `Two-tier agent model config (global / project)`）。
- `docs/commands.md:1107-1120`：标题段改「两层级」；删 default 层与 `--scope default` 确认说明（`:1110`），补「`set --scope default` 明确拒绝（exit 1），`get --scope default` 返回未显式设置（null）」；`:1115` 命令示例 scope 改 `global|project`；`:1120` 的 `source` 说明改 `project > global > 平台默认`；`:1112` 的 v1.6.2 说明后追加 v1.6.3 一句。
- `docs/json-contract.md:175`/`:429`：`source` 链改 `project > global > 平台默认`（default 层移除说明一句）。
- `docs/VERSIONS.md`：顶部（`:60` 前）新增 `## v1.6.3 — 彻底不预设模型：移除 opencode agent 默认、框架注入与厂商名残留`；**English highlights 区（`:20` 前）新增 v1.6.3 bullet**（No preset models, part 2: agent frontmatter/constraint/agent bodies no longer name a vendor model…）。
- `CHANGELOG.md` 顶部新增 `## [1.6.3]`（历史段逐字不动）。
- `dsh/lib/tools/index.js`：`:1937` description「三层级：default / global / project」→「两层级：global / project」；`:1941` 示例模型改通用占位（如 `provider/model-id`）；`:1942` `scope: stringEnum(['global','project'], '层级，缺省 project。')`。改完跑 dsh 四测（`contract.js` 只查 enum 非空去重）。
- `dsh/docs/compat/commands.md:293-305`：三行 scope 枚举改 `<global\|project>`；`:301-305` 重写——删 `--scope default` 守卫两条，`model set` 写明「`--scope default` → 已移除，exit 1」；解析链改 `project > global`（`Effective` 打印仍含 default 层 `(none)`）；Writes 段删 default → framework source 一条。
- `dsh/ADAPTER.md`：`:18` `openfeel.requiresCli`（≥1.6.0）→ **`≥1.6.3`**；**不改 `:205`**（`## v1.6.1` 历史小节基线行），改为在 v1.6.1 节之后新增 `## v1.6.3：两层级模型与适配器收窄`（一句话：`requiresCli ≥1.6.3`；`feel_model` 去 default 层；`model set --scope default` 拒绝）。理由见 R7。
- 版本：root / dsh `1.6.3`、dsh `requiresCli = ">=1.6.3"`、`package-lock.json:3`/`:9` 同步（不跑 `npm install`，不动 lock 其余内容）；`docs/releases/v1.6.3.md` 建议补（与 v1.6.1/v1.6.2 对齐，非硬门）。
- **负责/依赖/验收**：executor-a；依赖 T1—T5、T7；C5。

### S7（= A70.6 全量门禁与复核；§三 第 7 步）
- **executor-a**：在干净工作树跑完 C6 全部命令，逐条留存 `exit code` 与关键输出（`npm test` 0 failed / build 两遍无 diff / dsh 四测全过 / `lint i18n` / `release --dry-run` exit 0），对照 A70.1—A70.7 逐条贴取证。
- **reviewer 独立复核**：换独立 shell 会话与独立 `HOME`/临时目录复跑 C6，并抽样复跑 C1/C3/C4/C7 的负向命令；核对「判据↔证据」一一对应，确认无手改注入段、无放宽上限、无用例被删。任一红 → 停手上报 Feel（不改判据、不自行放宽）。
- **负责/依赖/验收**：executor-a 执行 + reviewer 复核；依赖 T1—T6、T7；C6。

## 三、执行顺序（严格串行）

| 步 | 任务 | 中间态命令 | 期望 |
|----|------|-----------|------|
| **S1** | T1 模板去 model | C1（**源 → `npm run build` → 注入副本断言**） | 10 份零 `model:`；build exit 0；`template-loader.ts` 注入副本零 |
| **S1b** | T7 正文/约束层去厂商名 | `npm run build` → C7 | 源侧 0 残留；8 + 4 处新文案；注入副本同步 |
| **S2** | T2 去注入 | C2 | `agent` 键消失；用户条目透传不变 |
| **S3** | T3 两层语义 | C3 + `npm run build` | default unset、set default 拒绝、生效链 project > global |
| **S4** | T4 skills 文案（含 `templates.test.ts:151` 同批） | C4 + `npm run build` | 负向 0 行；注入副本逐字节一致；templates.test.ts 绿 |
| **S5** | T5 测试 | C1—C4 + C7 | `npm test` 0 failed |
| **S6** | T6 文档 / dsh 工具面 / 版本 | C5 | 1.6.3 lockstep；文档与工具面无「三层级 / 框架默认」误述 |
| **S7** | 全量门禁与复核 | C6 | 全绿 + A70.1—A70.7 逐条取证（executor-a 执行、reviewer 复核） |

> 硬约束：`T1 → T7 → T2 → T3 → T4 → T5 → T6 → S7`（T7 与 T1 同 8 份文件必须先后；T3 依赖模板与注入都已消失才能把 default 判空；T5 断言对象是改后实现与模板；T6 发布说明依赖定稿）。中间态失败**停手上报 Feel**，不跳步、不改判据。
> **build 纪律**：凡改 `templates-data/**` 的任务（T1 / T4 / T7）收尾必跑 `npm run build`；注入段（`template-loader.ts` / `update.ts` 的 AUTO-GENERATED 区）**只读**，build 的 `validateSingleSourceConsistency()` 会拒绝单侧漂移。

## 四、风险

| # | 风险 | 影响 | 缓解 |
|---|------|------|------|
| **R1** | **default 层移除打穿既有 model 用例**：`model-config.test.ts`（5 条）、`model.test.ts`（get 生效值 / set default 文案）、`json-contract.test.ts:1121-1128`、`update.test.ts`（stage-94 三条 + `:842-849` 静态断言）均断言 default 层/旧实现 | 测试红或被迫放宽断言 | 逐文件**重定基线**而非删用例（§T5 清单）；`byScope.default` 键与 `inconsistent` 字段保留，契约键序不变 |
| **R2** | **opencode 用户配置兼容**：删框架注入后，老用户 `opencode.jsonc` 里已有的 `agent.*.model` 必须原样保留（deepMerge 不得清理） | 用户已配模型被抹掉 | 只删 overlay 内容，不动 `mergeAgentDefaults` / `deepMergeJsonc` / `mergeGlobalOpencodeJsonc`；`opencode-config.test.ts:84-97` 与 `update.test.ts:229-266` 用户 agent 透传用例必须继续绿；不写迁移删除逻辑 |
| **R3** | **注入副本漂移**：手改 `templates-data` 漏 build，或反向手改注入段 | 源↔注入不一致；`build.js` 三重校验 exit 1；`templates-migration.test.ts:50` 逐字节红 | T1/T4/T7 各自收尾 `npm run build`；S1 的注入副本断言**必须在 build 之后**取；注入段只读 |
| **R4** | **skill frontmatter 字符数**：`cli-usage` description 定长 2766（`templates.test.ts:569`），改一字即红 | 假红/真截断 | T4 只改 `cli-usage` **正文**（`:34`/`:300`/`:323`），frontmatter 与第 3 行零改动；`templates.test.ts:151` 钉死串与 T4 同批换串 |
| **R5** | **残留预设面（本阶段已扩到 A70.7，其余登记）**：agents-md/constraint 的 vision 行与 8 处 `DeepSeek V4 Pro` 已由 T7 覆盖；**仍不动/登记**的：`dsh/ACTION-GUIDE.md:223`（历史设计记录，含旧行号 L1142/L1151）、`dsh/docs/compat/kb-skills.md:707`（历史 compat 快照；`--scope default` 写入路径已删，该句过期）、`CHANGELOG.md:657`（历史段逐字不动）、`opencode/agents/*/openfeel-vision.md`「由多模态模型驱动」（能力事实，不含厂商名） | 判据外观感/历史失真 | T7 只改 A70.7 列明面；登记项**不改**（历史文档不篡改），如人类要求再新增判据（只增不改） |
| **R6** | **DSH 工具面收窄**：`feel_model.scope` 去 `default` 后，调用方传 `default` 会被 schema 拒（此前可透传到 CLI） | 旧调用失败 | 属 A70.3 语义（default 层已移除）；`contract.js` 只查 enum 非空去重、`verify.js` 不依赖 default；改完跑 dsh 四测；`dsh/docs/compat/commands.md` 同步 |
| **R7** | **版本收口实测偏差（与审查意见不符）**：审查称 `dsh/ADAPTER.md:18/:205`「requiresCli 1.6.1→1.6.3」；实测 `:18` 是 `≥1.6.0`，`:205` 是 `## v1.6.1` **历史小节**的基线行 | 若照抄会篡改历史 | `:18` 抬到 `≥1.6.3`；`:205` 不动，改为新增 `## v1.6.3` 小节（见 T6）；本偏差登记于此，如审阅坚持改历史小节，由人类裁决（判据只增） |

**偏差回写格式**：`YYYY-MM-DD | 任务 T# | 偏差事实（文件:行号 / 命令输出） | 处理（新增/取消任务、判据表述变化） | 影响（A70.x 取证路径是否变化）`。纪律：① 判据只增不改；② 时间戳须晚于执行开始；③ 无偏差保持空表；④ 触发条件不明停手上报 Feel。

## 五、变更记录
- 2026-11-25 创建（planner）：REQ-070 → A70.1—A70.6 → T1—T6 → 严格串行 `S1→S7`。关键设计（执行按此）：移除框架默认后 `model get --scope default` 返回 unset（`model:null,source:null`）、`set --scope default` **明确拒绝**并提示 global/project、解析优先级改 **project > global > 平台默认**、`openfeel model` 只读展示实际 `opencode.jsonc` 配置；`byScope.default` 键与 `inconsistent` 字段保留以稳住 JSON 契约。
- 事实校准（实测）：10 份模板中 5 份/语言带 `model:`（非 10 份全带）；`model get --scope default --json` 现状 `deepseek-flash`/`source:default`；注入副本由 `build.js` 生成、`templates-migration.test.ts:50` 逐字节锁死；`cli-usage` description 定长 2766；版本现状 1.6.2 lockstep 完好。
- **2026-11-25T23:10:00+08:00（planner 修订，响应计划审查 REJECT：5 blocking + 4 major）**：
  1. 新增 **A70.7 → T7**（agents-md ×2 + claude constraint ×2 的 vision 行改「多模态模型（由平台提供）」/「Multimodal model (platform-provided)」；opencode agent 正文 8 处「（如 DeepSeek V4 Pro）」→「（例如你选择的模型）」/`(e.g., the model you choose)`），顺序 **T1 → T7**（同一批文件），各自 `npm run build` 后取证，C7 给命令与期望行数。
  2. 删除 T1「正文零改动」硬约束，T1 只删 10 份 frontmatter `model:` 行；正文改动全部归 T7。
  3. **S1 收尾立即 `npm run build`，再做注入副本断言**（C1 顺序固定为源 → build → 注入副本）；写明 build 重生成 `template-loader.ts` 6 个锚点与 `update.ts` `SKILL_DEFINITIONS`，并自带三重一致性校验。
  4. `templates.test.ts:151` 的 `--scope default|global|project` 与 T4 **同批**改为 `--scope global|project`（用例保留、不得删）。
  5. 测试清单补 `update.test.ts:842-849`（静态断言 `mergeFrontmatter(split.frontmatter, { model })`）；T3 删 helper 后由 T5 同批重写为阴性断言。
  6. §二 新增 **S7** 任务条：A70.6 由 executor-a 执行 C6、reviewer 独立复核（§三 S7 同步）。
  7. 三层级残留：**纳入** `dsh/lib/tools/index.js:1937/:1941/:1942`、`dsh/docs/compat/commands.md:293-305`（T6；工具 scope 枚举去 `default`、compat 文档改两层级）、`openfeel-cli-usage/SKILL.md:34`（T4 正文改「两层」）、`README×2:149`、`docs/commands.md:1110/1115/1120`、`docs/json-contract.md:175/429`（T6）；**登记不改** `dsh/ACTION-GUIDE.md:223`、`dsh/docs/compat/kb-skills.md:707`（历史文档，见 R5）。
  8. 版本收口补 `dsh/ADAPTER.md:18`（`≥1.6.3`）与 `docs/VERSIONS.md:20` 前的 English v1.6.3 bullet；**实测偏差**：`:18` 实为 `≥1.6.0`（非 1.6.1）、`:205` 是 v1.6.1 历史小节 → 不改历史，新增 `## v1.6.3` 小节（R7）。
