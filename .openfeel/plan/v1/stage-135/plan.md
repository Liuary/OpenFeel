# v1.6.2-stage-135 计划（REQ-069 / fast 模式）

> 来源：需求正文 `.openfeel/requirements/REQ-069.md`（**判据源**，A69.1—A69.7）。本文件是**执行前的拆解与判据**；执行中变更按 §四 登记，判据编号只增不改。
> 角色：`executor-a`＝T1/T3/T4（模板、规则、文档与版本）；`executor-b`＝T2（测试）；`reviewer`＝独立复跑取证；`Feel`＝状态写操作与派单。
> **不包含**：`git push` / tag / 真实 `npm publish`（归人类）；不改 `flow.json` / `status.md` / `dist/**` / `docs/market/**`；**不改提示词**（R4）。

## 一、目标与判据

### 1.0 事实锚点（2026-11-25 实测）

- **模板**：`src/core/config.ts` 的 `CONFIG_TEMPLATE_ZH` `:536-596`（models 段 `:573-595`）、`CONFIG_TEMPLATE_EN` `:599-663`（models 段 `:640-662`）；行号随删除漂移，执行时以 grep 现查为准。
- **只读兼容（一律保留）**：`ModelsSchema` `:105-109`、`ConfigSchema.models: ModelsSchema.optional()` `:115`、`readConfig` 的 `models: null` 删除预处理 `:527-529`。
- **models 不生效**：实际模型由平台/会话决定（DSH 所选、Claude 的 sonnet 等），config.yaml 的 `models` 仅 Awareness；默认模板替用户预设模型属特化，须移除。
- **测试现状**：`test/core/config.test.ts:452-483`、`:741-771`、`test/core/init.test.ts:81-100` 均**未断言** models / deepseek-\*；全仓对 `models` 的测试命中仅 `config.test.ts:153-160`（`models: null` 兼容用例）→ A69.4 的「删/改旧断言」实测 **0 处**，改为**新增**断言（T2）。
- **版本**：root/dsh `package.json` = `1.6.1`、`requiresCli = >=1.6.1`、`openfeel --version` = `1.6.1` → 目标 **1.6.2**。`package-lock.json:3` 与 `:9`（`packages[""].version`）实测同为 `1.6.1`——**无 1.5.22 漂移**（旧记载作废）。
- **提示词余量**：`renderFeelPrompt` 实测 zh 776/893、en 1078/**1194**（上限 1200 字符/25 行）→ EN 余 **6** 字符；A69 未要求提示词变更，本阶段不加任何模型句子（R4）。`README.zh-CN.md:12-13`、`README.en.md:10-11` 的旧「默认模型配置 / init 自动检测模型」属误述，由 T4 更正（R5）。

### 1.1 判据表（正文口径）

| 判据 | 要点 | 取证 |
|------|------|------|
| **A69.1** | ZH/EN 两段模板删除 `models:` 段，改注释「不预设模型：Agent 使用平台/会话所选模型（DSH/Claude 等）；如需 Awareness 记录可自行添加 models 段（不生效）」 | C1 |
| **A69.2** | `openfeel init` 在临时项目生成的 `.openfeel/config.yaml` 不含 `model_name:`/`provider:`（夹具断言） | C2 |
| **A69.3** | 旧项目 config 含 `models` 仍可解析；models 保持可选、无默认值 | C3 |
| **A69.4** | 无「默认模板含 deepseek-v4-pro/deepseek-flash/glm-5.1」断言残留；新增「默认模板无 models」断言；`npm test` 0 failed | C4 |
| **A69.5** | `dev_core.md` 新增 `## [+] 不预设模型 (2026-11-25)`；`templates.ts` 的 `DEV_CORE_TEMPLATE_ZH/EN` 同义条 | C5 |
| **A69.6** | docs/README 的 config 说明改「不预设模型」；`CHANGELOG` 顶部 `## [1.6.2]`；root/dsh 1.6.2（`requiresCli >=1.6.2`）；`--version` = 1.6.2 | C6 |
| **A69.7** | `npm test`、`npm run build`、dsh 四测、`lint i18n`、`release --dry-run` 全绿；push master 后 CI 自动发布 1.6.2（人类执行） | C7 |

### 1.2 可复现命令（仓库根）

```powershell
# C1（A69.1）：模板段 0 行模型痕迹 + 新注释
Select-String -Path src/core/config.ts -Pattern 'deepseek-v4-pro|deepseek-flash|glm-5\.1|^\s*models:\s*$|^\s{2}default:\s*$'   # 0 行
Select-String -Path src/core/config.ts -Pattern '不预设模型|presets no model'                                                # ZH、EN 各 1
# C2 / C3（A69.2 / A69.3）：夹具断言
npx vitest run test/core/config.test.ts test/core/init.test.ts
#   含「ZH/EN 模板不含 models」「init 产物无 model_name/provider」「存量 config 含 models 可解析」
# C4（A69.4）全量测试
npm test                                                                  # 0 failed
# C5（A69.5）规则登记
Select-String -Path .openfeel/dev/dev_core.md -Pattern '不预设模型'         # 1 行（带 2026-11-25）
Select-String -Path src/core/templates.ts -Pattern '不预设模型' -CaseSensitive      # ZH 条 1 行
Select-String -Path src/core/templates.ts -Pattern 'presets no model' -CaseSensitive  # EN 条 1 行（短语钉死）
# C6（A69.6）版本与文档
node -p "require('./package.json').version + ' / ' + require('./dsh/package.json').openfeel.requiresCli + ' / ' + require('./package-lock.json').version + ' / ' + require('./package-lock.json').packages[''].version"; node bin/openfeel.js --version; Get-Content CHANGELOG.md -TotalCount 2   # 1.6.2 / >=1.6.2 / 1.6.2 / 1.6.2、1.6.2、## [1.6.2]
Select-String -Path README.zh-CN.md,README.en.md,docs/commands.md,docs/GETTING_STARTED.md -Pattern '不预设模型|presets no model'
Select-String -Path README.en.md -Pattern 'presets no model' -CaseSensitive   # ≥1 行（英文短语钉死）
# 负向取证（A69.6 旧误述，改后须 0 行）——能命中实测：改前 README.zh-CN.md:12-13、README.en.md:10-11（共 4 行），docs/GETTING_STARTED.md 0 行
grep -nE 'DeepSeek V4|Default Model Config|自动检测.*模型|auto-detects registered models' README.zh-CN.md README.en.md docs/GETTING_STARTED.md   # 改后 0 行
# 等价 PowerShell 取证（本机 pwsh 无 grep，实测 `grep` 不在 PATH，评审用这条）
Select-String -Path README.zh-CN.md,README.en.md,docs/GETTING_STARTED.md -Pattern 'DeepSeek V4|Default Model Config|自动检测.*模型|auto-detects registered models'   # 改后 0 行
# 断言：上面负向命令输出为空（0 行），且 README.zh-CN.md / README.en.md 对应行不再含「默认模型配置」/「Default Model Config」表述
# C7（A69.7）全量门禁 + 发布预演（不 push / 不 publish）
npm run build && npx tsc --noEmit && npm test
cd dsh; node test/contract.js; node test/verify.js; node test/guard.js; node test/integration.js; cd ..
node bin/openfeel.js lint i18n && node bin/openfeel.js lint fill && npm run market:index:check
node scripts/release.mjs --dry-run --skip-build                            # exit 0
```

## 二、任务拆解

### 2.0 单写者矩阵（严格串行）

| 文件 | 写者 | 说明 |
|------|------|------|
| `src/core/config.ts`（两段模板字符串） | **仅 T1** | Schema / `readConfig` / `writeDefaultConfig` 函数体不动 |
| `test/core/config.test.ts`、`test/core/init.test.ts` | **仅 T2** | 新增断言，不删既有 |
| `.openfeel/dev/dev_core.md`、`src/core/templates.ts` | **仅 T3** | 规则登记（本项目 + 新项目模板），追加不覆盖 |
| `README*.md`、`docs/commands.md`、`docs/GETTING_STARTED.md`、`CHANGELOG.md`、`package.json`、`dsh/package.json` | **仅 T4** | 文档与版本同批，避免中间态版本不一致 |

纪律：版本单点（`package.json.version` 唯一权威，`dsh/package.json` lockstep、`requiresCli` 派生，`test/core/release-metadata.test.ts:59-72` 已锁，`CHANGELOG` 三处一致）；测试**只增不删**；ZH/EN 与两份 README **双语同批**；models **只读兼容**（不删 Schema、不改 `readConfig`、不给默认值）。

### T1（= A69.1）模板去 models

- ZH（`:573-595`）删除 `# ---- 模型配置 ----` + `models:` 段，逐字替换为三行注释：`# ---- 模型配置 ----` / `# 本模板不预设模型：Agent 使用平台/会话所选模型（DSH / Claude 等）。` / `# 如需 Awareness 记录可自行添加 models 段（仅记录、不生效）。`；EN（`:640-662`）同义替换为 `# ---- Model Configuration ----` / `# This template presets no model: Agents use the model chosen by the platform/session (DSH / Claude, etc.).` / `# Add a models section yourself if you want an Awareness record (documentation only, not applied).`
- **禁止**：改 `ModelsSchema`、`ConfigSchema.models`、`readConfig`（:527-529）、模板内 `meta.version`（`1.5.6` 与包版本无关，不属本阶段）。改完 C1 期望 0 行。**负责/依赖/验收**：executor-a；无依赖；C1。

### T2（= A69.2 / A69.3 / A69.4 前半）测试

- `config.test.ts` 的 `describe('writeDefaultConfig 模板（stage-74 op-001 T7.6）')`（`:741`）**新增 3 条 it**：① ZH 模板不含 `models:`/`model_name:`/`provider:`/`deepseek-v4-pro`/`deepseek-flash`/`glm-5.1` 且含「不预设模型」；② EN 同上（含 `presets no model`）；③ 含 models 的旧配置 `readConfig` 可解析、`models.default` 字段可读（与 `:153` 的 null 用例并存）。
- `init.test.ts`「应创建 config.yaml 并包含正确默认值」（`:81-91`）**追加**：生成内容不含 `model_name:`/`provider:`；`readConfig(tmpDir).models === undefined`。
- **零删除**：实测无「默认模板含 deepseek-v4-pro」断言可删；若执行时另有命中，只改口径不删断言并登记偏差。**负责/依赖/验收**：executor-b；依赖 T1；C2、C3。

### T3（= A69.5）规则登记

- `.openfeel/dev/dev_core.md` 末尾追加（同既有格式）`## [+] 不预设模型 (2026-11-25)`：默认配置模板不预设任何模型（`provider` / `model_name`）；Agent 使用平台/会话所选模型（DSH 所选、Claude 的 sonnet 等）；`config.yaml` 的 `models` 段仅 Awareness、**不生效**，可自行添加、保留读兼容；`init` 生成的新配置不含模型默认值。
- `src/core/templates.ts` 的 `DEV_CORE_TEMPLATE_ZH`（`:7-18`）/`DEV_CORE_TEMPLATE_EN`（`:21-32`）各追加同义条，**不写死日期**（实测两段模板当前**均无**本规则条，属新增）。**措辞钉死（原文，逐字）**：
  - ZH 条必须含短语 **「不预设模型」**：`## [+] 不预设模型` / `默认配置模板不预设任何模型（provider / model_name）；Agent 使用平台/会话所选模型（DSH 所选、Claude 的 sonnet 等）。config.yaml 的 models 段仅 Awareness、不生效，可自行添加，保留读兼容；init 生成的新配置不含模型默认值。`
  - EN 条必须含小写短语 **`presets no model`**（不可只写 `no default model` / `does not preset` 之类同义改写）：`## [+] Presets no model by default` / `The default config template presets no model (provider / model_name); agents use the model chosen by the platform/session (DSH selection, Claude's sonnet, etc.). The models section in config.yaml is Awareness only and not applied - add it yourself if needed; read compatibility is kept. Configs generated by init carry no model defaults.`
- **边界**：`.openfeel/dev/dev_core.md` 不在 `PROTECTED_OPENFEEL_PATHS`；若相位门仍拒，executor 给 patch，Feel/人类落盘并登记偏差。
- **负责/依赖/验收**：executor-a；依赖 T1；C5。

### T4（= A69.6）文档与版本 1.6.2

- 文档改「不预设模型」（**双语同批**）：`README.zh-CN.md:12-13`、`README.en.md:10-11` 整段替换旧两句（旧文实测：zh `**默认模型配置**：DeepSeek V4（主力推理） + GLM-5.3-flash（交叉审查） + DeepSeek-flash（多模态视觉）。` + `首次 openfeel init 时会自动检测用户已注册的模型并引导配置。`；en `**Default Model Config**: DeepSeek V4 (primary reasoning) + GLM-5.3-flash (cross-review) + DeepSeek-flash (multimodal vision).` + `` `openfeel init` auto-detects registered models and guides configuration. ``）。**替换原文（逐字，C6 按此取证）**：
  - `README.zh-CN.md:12-13`（必须含「不预设模型」）：

    ```
    > **模型选择**：`openfeel init` 不预设模型——Agent 使用平台/会话所选模型（DSH / Claude 等）；`config.yaml` 的 `models` 段可选、仅 Awareness 记录、不生效。
    ```

  - `README.en.md:10-11`（**必须含小写短语 `presets no model`**，不得改写为 `no default model` / `does not preset` 等）：

    ```
    > **Model selection**: `openfeel init` presets no model - agents use the model chosen by the platform/session (DSH / Claude, etc.); the optional `models` section in `config.yaml` is Awareness only and not applied.
    ```

- `docs/commands.md` 补一句：优先落 `## model — 模型配置`（`:1108-1118`），次选 `config get / set` 节（`:964-981`；`:960` 属 `config effective` 的来源优先级，勿误插）——实测该文件 config 节当前**无任何 models 表述**，故为纯新增；`docs/GETTING_STARTED.md:152` init 说明补一句。中文句含「不预设模型」，同一段落英文（若有）含 `presets no model`。
- `CHANGELOG.md` 顶部**新增** `## [1.6.2]` 段（一行摘要 + REQ-069），`## [1.6.1]` 及更早历史段逐字不动。
- 版本：`package.json` 1.6.2；`dsh/package.json` 1.6.2 且 `requiresCli = ">=1.6.2"`；`docs/releases/v1.6.2.md` 可选（一致性，非判据）。`package-lock.json` 实测 `:3` / `:9` 已是 `1.6.1`（无漂移）→ **同批同步为 `1.6.2`（仅这两行，`packages[""].version`）**；不跑 `npm install`、不改 lock 其余内容；**不动** `docs/market/**`、`dist/**`。
- **负责/依赖/验收**：executor-a；依赖 T1—T3；C6。

### T5（= A69.7）全量验证与取证

- 先删 `dist/` 再 `npm run build`；`npx tsc --noEmit`；`npm test`；dsh 四测；`lint i18n`/`lint fill`/`market:index:check`；`release --dry-run --skip-build` exit 0。产出「判据 → 命令 → 实际输出」清单；**判绿只认 reviewer 复跑**。**禁止**：不 push、不打 tag、不 publish（A69.7 的 CI 自动发布由人类在 T5 全绿后执行，计划不预设 push 步骤）。**负责/依赖**：reviewer（只读）+ executor 自测；依赖 T1—T4。

## 三、执行顺序（严格串行）

| 步 | 任务 | 中间态命令 | 期望 |
|----|------|-----------|------|
| **S1** | T1 模板去 models | C1 | 模板内 0 行模型痕迹；Schema/readConfig 未动 |
| **S2** | T2 测试新增 | C2、C3 | `config.test.ts` + `init.test.ts` 绿 |
| **S3** | T3 规则登记 | C5 | dev_core 1 条 + 模板 ZH/EN 各 1 条 |
| **S4** | T4 文档与版本 | C6 | 1.6.2 lockstep + 文档无旧误述 |
| **S5** | T5 全量验证 | C4、C7 | 全绿 + 七条判据逐条取证 |

> 硬约束：`T1 → T2 → T3 → T4 → T5`（T2 断言对象是改后模板；T4 发布说明依赖 T1—T3 定稿；T5 依赖全部），**不得并行**。中间态失败：**停手上报 Feel**，不得跳步、不得自行改判据。
## 四、风险

| # | 风险 | 影响 | 缓解 |
|---|------|------|------|
| **R1** | **旧项目兼容被误伤**：顺手删 `ModelsSchema`/`ConfigSchema.models`/`readConfig` 的 `models: null` 预处理 | 存量含 models 项目解析失败，A69.3 反向破约 | 只改两段模板字符串；Schema 与 readConfig 零改动；C3 正/反向用例双证；旧配置只读不迁移 |
| **R2** | **测试断言分散且旧断言不存在**：A69.4 假设有「含 deepseek-v4-pro」用例可删，实测 0 处；照字面执行会空改或误删兼容用例 | 覆盖缺失或兼容用例被删 | 以 §1.0 实测为准：**只新增**（config.test.ts 3 条 + init.test.ts 2 条断言）；`npm test` 兜底；发现其它命中只改口径 + 登记偏差 |
| **R3** | **版本 lockstep 断裂**：漏改 `dsh/package.json`/`requiresCli`/CHANGELOG/`package-lock.json` 的 root version | `release-metadata.test.ts` 红、`release --dry-run` 版本校验失败、CI 不发版 | T4 同批改三处 + lock `:3`/`:9` 两行；C6 逐条验；不跑 `npm install`、不改 lock 其余内容 |
| **R4** | **EN 提示词无余量**：en-disabled 1194/1200（余 6 字符），加句即撑破预算测试 | 预算测试红 / 提示词分叉 | **本阶段不改提示词**（源 + 4 份 feel.md + template-loader 零改动），规则只落 dev_core/模板/文档 |
| **R5** | **文档误述残留 / 双语不同步**：README 旧句与事实相反，只改中文漏英文 | A69.6 不达标 | T4 中英同批；C6 双向（正向：`不预设模型` + 小写 `presets no model`；负向：`grep -nE 'DeepSeek V4|Default Model Config|自动检测.*模型|auto-detects registered models' README.zh-CN.md README.en.md docs/GETTING_STARTED.md` 改后 0 行） |

**偏差回写格式**：`YYYY-MM-DD | 任务 T# | 偏差事实（文件:行号 / 命令输出） | 处理（新增/取消任务、判据表述变化） | 影响（A69.x 取证路径是否变化）`。纪律：① 判据只增不改；② 时间戳须晚于执行开始，否则 `REQ_PLAN_DEVIATION` 拦 `→done`；③ 无偏差保持空表；④ 触发条件不明停手上报 Feel。

## 五、变更记录

- 2026-11-25 创建（planner）：REQ-069 → A69.1—A69.7 → T1—T5 → 严格串行 `S1→S2→S3→S4→S5`；边界：只改模板不动 Schema/readConfig、不改提示词、不 push/tag/publish、不碰 `package-lock.json`（后经实测修正：lock root version `:3`/`:9` 需同批同步，见下条）。事实校准（实测）：现有测试**无**「默认模板含 deepseek-v4-pro」断言（A69.4 改为新增断言）；`renderFeelPrompt` en-disabled 1194/1200（余 6，故不加提示词句）；版本现状 1.6.1 lockstep 完好。
- 2026-11-25 修正（planner，plan_review 反馈 3 处）：①A69.6 负向取证改用能命中的 `grep -nE 'DeepSeek V4|Default Model Config|自动检测.*模型|auto-detects registered models'`（覆盖三文件；改前实测 4 行命中，改后 0 行；R5 同步）；②`package-lock.json:3` / `:9` 实测 `1.6.1`（**非 1.5.22 漂移**，旧记载作废）→ T4 两行同步 `1.6.2`，R3 与 overview 同步删除「不碰 lock / 既有漂移」；③C5/C6 英文措辞钉死：`templates.ts` EN 条与 `README.en.md` 必须含小写 `presets no model`（中文对应「不预设模型」），T3/T4 写出替换原文，C5/C6 增 `-CaseSensitive` 短语校验。附带实测：本机 pwsh **无 `grep`**（`grep` 不在 PATH），§1.2 保留原命令并补 `Select-String` 等价行（改前实测 4 行命中）；`docs/commands.md` 的 config 节实测**无 models 表述**，补句锚点细化为 `## model — 模型配置`（`:1108-1118`）。
