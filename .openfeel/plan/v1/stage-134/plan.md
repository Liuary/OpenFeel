# v1.6.1-stage-134 计划（REQ-068 / fast 模式）

> 来源：需求正文 `.openfeel/requirements/REQ-068.md`（**正文是判据源**，2026-11-25 已扩到 A68.1—A68.8）+ 本文件 §1.2 的取证命令（只读取证，不改源码）。
> 本文件是**执行前的拆解与判据**，不是进展报告；执行中变更按 §四「偏差回写」登记，判据编号只增不改。
> **本版 v3 = 计划审查 REJECT 修订版**（2026-11-25，按审查实测事实改 6 处）：**F1** 提示词预算改**渲染态**（`renderFeelPrompt`），新增渲染态预算测试；**F2** CI 语义纠正为「`on: [push, pull_request]` + publish job 仅 `push` 到 master 且版本变化才发，**tag/release 不触发**」；**F3** `release.mjs` 默认行为纠正为「默认只 version+build，`market`/`archive-commit`/`tag` 默认 `skipped`、各需 flag」；**F4** overview 按正文 A68.1—A68.8 / T1—T6 重排；**F5** 版本替换范围收窄到 `src/dsh/docs/scripts/test/package.json`；**F6** 风险补齐（打穿测试 / EN 预算 / 误 push 发版）。
> 角色：`executor-a`＝版本/文档/提示词/模板线（`package.json`、`dsh/package.json`、docs、README、`src/**`/`test/**` 注释、`dsh/lib/surface/prompt.js` + 4 份 `feel.md`、`src/core/templates.ts`）；`executor-c`＝脚本线（`scripts/release.mjs`）；`reviewer`＝独立取证；`Feel`＝状态写操作与派单。
> **不包含**：`git push` / 打 tag / 真实 `npm publish`（归人类，见 §四 R3）；不改 `flow.json` / `status.md` / `dist/**` / `docs/market/**`。
> **阶段 ID 口径**：本阶段为 `v1.6.1-stage-134`；**`v1.7.0-stage-133` 作为历史标识原样保留**（`flow.json` 禁手改，归档/CHANGELOG/示例里的引用一并保留）。

## 一、目标与判据

### 1.0 编号口径

- **正文现状（2026-11-25 更新）**：`REQ-068.md` 的 `## 目标与验收` 已从「只登记 A68.1」扩为 **A68.1—A68.8**（新增 **A68.7** 提示词版本分级、**A68.8** 文档同步）。正文仍是**唯一判据源**，下表按正文编号重排，不再另造派生号。
- **旧派生编号 → 正文编号映射**（上一版计划用过，留痕防误读）：旧「A68.2 = 全仓版本标注」→ 正文拆为 **A68.2（文档/发布说明）+ A68.3（源码注释/测试夹具）**；旧「A68.3 = release 脚本语义」→ 正文 **A68.4**；旧「A68.4 = 规则登记」→ 正文 **A68.5**；旧「A68.5 = 全量门禁」→ 正文 **A68.6**；旧「A68.6 = 发布说明/CHANGELOG」→ 并入正文 **A68.2 + A68.6**。
- **判据解释权在正文**：本计划只为每条正文判据给出**可复现命令**与**例外口径**，不新增需求外判据；只有取证发现正文未覆盖的**事实缺口**时才续号（作废写 `~~A68.k~~（作废：原因）`），并须经 `feel_req action=body` 回写正文（边界外，由 Feel 执行）。
- 「看起来对」不算通过：每条判据须能被第三者用 §1.2 的命令复现。

### 1.1 判据表（正文口径 A68.1—A68.8）

| 判据 | 要点（正文） | 取证 |
|------|------------------|------|
| **A68.1** | `package.json` / `dsh/package.json` 均 **1.6.1**，`requiresCli >=1.6.1`，`openfeel --version` = 1.6.1 | C1 |
| **A68.2** | `CHANGELOG.md` 顶部 `## [1.6.1]`；`docs/VERSIONS.md`、`docs/releases/v1.6.1.md`、`docs/commands.md` 中**不再出现 1.7.0**（`v1.7.0-stage-133` 历史标识除外）；`v1.6.1.md` 存在、`v1.7.0.md` 不存在；CHANGELOG 历史段（`## [1.6.0]` 及更早）逐字未动 | C2 / C6 |
| **A68.3** | 源码注释/测试夹具的 `v1.7.0` 统一为 `v1.6.1`：`grep -rn "1\.7\.0" src dsh docs scripts test package.json` 的**非 stage-id 命中为 0**；残余命中只能是 `v1.7.0-stage-133`（当前 7 行，见 T1）；`.openfeel/**` 与 CHANGELOG 历史段除外 | C2 |
| **A68.4** | `scripts/release.mjs` 与 CI 对齐：**默认只做版本校验 + build**（`publish`/`market`/`archive-commit`/`tag` 全 `skipped`）；`--with-market` / `--commit-archive` / `--tag` / **`--push`（新增）** 分别控制市场索引、归档提交、打 tag、推送 commit；`--publish` 仅人工兜底；**push 到 master 且版本与 npm 不同时由 CI publish job 自动发布（tag/release 不触发）** | C3 |
| **A68.5** | `.openfeel/dev/dev_core.md` 新增**带日期的动态规则**：远端 **push 到 master、版本变化时 CI 自动 `npm publish`**；不要手动 `npm publish`（tag/release 不触发，以 `ci.yml` 为准）；紧急兜底需显式 `--publish` 并记录原因；**同一条写进 `src/core/templates.ts` 的 `DEV_CORE_TEMPLATE_ZH/EN`**，让新项目 `init` 自带 | C4 |
| **A68.6** | `npm test`、`npm run build`、**dsh 四测**（contract/verify/guard/integration）、`lint i18n` 全绿；`node scripts/release.mjs --dry-run --skip-build` exit 0 | C5 |
| **A68.7** | 提示词写入**版本号分级规则**（默认补丁 `x.y.Z`；结构性/行为性才升 minor；破坏性才升 major；小改不跳级），落到 `dsh/lib/surface/prompt.js`（zh/en）+ **4 份副本 parity**；**渲染态**（`renderFeelPrompt`）中英均 **≤1200 字符 / ≤25 行**；parity **5/5**；**新增渲染态预算测试** | C7 |
| **A68.8** | `docs/commands.md` 与 `CHANGELOG` 的发布说明**同步该分级规则 + CI 发布流程**（push master → 自动发布，无需手动 publish） | C8 |

### 1.2 可复现命令（仓库根，Git Bash / pwsh 均可）

```bash
# C1（A68.1）
node -p "require('./package.json').version"                    # 1.6.1（dsh/package.json 同为 1.6.1）
node -p "require('./dsh/package.json').openfeel.requiresCli"   # >=1.6.1
node bin/openfeel.js --version                                 # 1.6.1（dist 运行期 require package.json，无需先 build）
npx vitest run test/core/release-metadata.test.ts              # lockstep / requiresCli 同源断言绿

# C2（A68.2 / A68.3）：范围 = src dsh docs scripts test package.json；非 stage-id 命中为 0
git grep -n "1\.7\.0" -- src dsh docs scripts test package.json ':!.openfeel'
#   ↑ 残余只允许 7 行 `v1.7.0-stage-133`（dsh/ACTION-GUIDE.md:21、dsh/ADAPTER.md:221、dsh/README.md:38、
#     dsh/test/verify.js:1259、test/scripts/release.test.ts:279/291/293）
git grep -nP "1\.7\.0(?!-stage-133)" -- src dsh docs scripts test package.json ':!.openfeel'   # 期望空
git grep -nP "1\.7\.0(?!-stage-133)" -- docs/VERSIONS.md docs/commands.md docs/releases   # 期望空（stage-id 溯源行按 A68.3 例外保留）
Get-ChildItem docs/releases/v1.6.1.md; Test-Path docs/releases/v1.7.0.md   # 存在 / False
Get-Content CHANGELOG.md -TotalCount 1                                      # ## [1.6.1]
git status --porcelain                                                      # 不含 dist/；.openfeel/** 只应出现本阶段计划与运行产物（checkpoints/log），不把「.openfeel 零改动」当判据

# C3（A68.4）：默认只 version+build；其余 flag 控制；--publish 仅兜底
node scripts/release.mjs --json
#   exit 0；steps: version=ok, build=ok, publish=skipped, market=skipped, archive-commit=skipped, tag=skipped
#   publish.reason 含 "publish skipped"；publish.publishMode='ci'；零真实 publish（单测注入 exec 计数 0）
node scripts/release.mjs --dry-run --skip-build --json
#   exit 0；六步 id 不变；market/archive-commit/tag=planned；publish 走双包 npm publish --dry-run（预检）
node scripts/release.mjs --with-market --dry-run --json        # market 步真跑（npm run market:index）
grep -n "opts.push\|'--push'\|git push" scripts/release.mjs    # --push 已接入 parseArgs + help + archive-commit 之后
npx vitest run test/scripts/release.test.ts                    # 现 13 条 it：13 条零改动绿 + --push 新用例绿

# C4（A68.5）：dev_core 规则 + 新项目模板
grep -n "CI" .openfeel/dev/dev_core.md                         # 命中 [+] 规则行（CI / master / publish）
grep -n "补丁\|minor\|major\|npm publish" src/core/templates.ts # DEV_CORE_TEMPLATE_ZH/EN 命中同一条
grep -n "CI" docs/VERSIONS.md                                  # §发布节奏 同义一条（一致性，非判据）

# C5（A68.6）：全量门禁 + 正文指定的 release 预演命令
npm run build && npx tsc --noEmit && npm test
cd dsh && node test/contract.js && node test/verify.js && node test/guard.js && node test/integration.js && cd ..   # 四测
node bin/openfeel.js lint i18n && node bin/openfeel.js lint fill && npm run market:index:check
node scripts/release.mjs --dry-run --skip-build                # exit 0

# C7（A68.7）：渲染态体积（renderFeelPrompt，非 FEEL_BODY 常量）+ 分级词 + parity + 新预算测试
node --input-type=module -e "import { renderFeelPrompt } from './dsh/lib/surface/prompt.js'; for (const l of ['zh-CN','en']) for (const d of [false,true]) { const s=renderFeelPrompt({language:l, feelMode:{value:d?'disabled':'enabled'}}); console.log(l, d?'disabled':'enabled', 'chars='+s.length, 'lines='+s.split('\n').length); }"
#   基线（2026-11-25 实测）：zh enabled 720/14、zh disabled 837/17、en enabled 1027/13、en disabled 1143/16
#   上限 1200 字符 / 25 行 → EN 余量 57 字符、ZH 余量 363 字符
grep -n "补丁" dsh/lib/surface/prompt.js && grep -n "minor" dsh/lib/surface/prompt.js && grep -n "major" dsh/lib/surface/prompt.js
npx vitest run test/cli/feel-prompt-parity.test.ts             # 5/5 绿（源 + 4 副本 + template-loader 6 块同哈希）
npx vitest run test/cli/feel-prompt-budget.test.ts             # 新建：渲染态 4 组 ≤1200 字符 / ≤25 行

# C8（A68.8）：文档同步分级规则 + CI 流程
grep -n "补丁\|minor\|major" docs/commands.md CHANGELOG.md
grep -n "CI\|npm publish\|tag" docs/commands.md CHANGELOG.md   # 含「push master → 自动 publish；tag/release 不触发」
```

### 1.3 纪律

- 版本号单点：`package.json.version` 是唯一权威，`dsh/package.json` 与之 lockstep、`requiresCli` 由其派生（`test/core/release-metadata.test.ts:59-72` 已锁）；判据只增不改（作废写 `~~A68.k~~（作废：原因）`，新增续号）。
- 发布触发条件**不改 CI**：以 `.github/workflows/ci.yml` 为事实源（`on: [push, pull_request]`；publish job `needs: build-and-test`、`if: github.ref == 'refs/heads/master'`、按 `npm view openfeel/openfeel-dsh version` 判定版本变化）——**push master 且版本变化才发，tag/release 不触发**；本阶段只改本地脚本语义与登记规则，不动 `.github/**`。
- **提示词单一源**：`dsh/lib/surface/prompt.js` 的 `FEEL_BODY_ZH` / `FEEL_BODY_EN` 是唯一源；4 份 `feel.md`（`src/core/templates-data/{claude,opencode}/agents/{zh-CN,en}/feel.md`）用 `<!-- feel-prompt-parity:begin/end -->` 逐字镜像；`src/core/template-loader.ts` 是 `build.js` 的**生成物**（6 块 = 3 常量 × 2 语言），**禁手改**——改完 4 份 `feel.md` 后 `npm run build` 重生成。
- **体积预算（渲染态，2026-11-25 实测）**：`renderFeelPrompt` 输出 zh enabled **720 字符/14 行**、zh disabled **837/17**、en enabled **1027/13**、en disabled **1143/16**；上限 **1200 字符 / 25 行** → **EN 补句 ≤50 字符**（en-disabled 1143 + 50 = 1193，留 7）、**ZH 补句 ≤60 字符**（zh-disabled 837 + 60 = 897，留余量）。正文 `FEEL_BODY_ZH` 598/11、`FEEL_BODY_EN` 804/10 只是中间量，**不能**单独当预算口径。
- **现有测试无体积断言**（`test/cli/` 下只有 `feel-prompt-parity.test.ts`）→ A68.7 的渲染态预算必须由 T5 **另建** `test/cli/feel-prompt-budget.test.ts` 断言（**不改** parity 的 5 条，保证正文「parity 5/5」逐字成立）。
- **版本号分级规则文本（T5 落地原文，executor 逐字复用）**：版本号默认按补丁 `x.y.Z` 推进；只有结构性/行为性变更才升 minor；破坏性变更才升 major；小改动不要升二级/一级。
- **版本替换范围（F5）**：只改 `src/`、`dsh/`、`docs/`、`scripts/`、`test/`、`package.json`（含 `package-lock.json`）；`.openfeel/**` 只改**本阶段新建/更新**的计划与需求正文里的「当前版本」表述（`plan/v1/stage-134/{plan,overview}.md`、`plan/reqs/REQ-068.plan.md`，需求正文经 `feel_req action=body` 由 Feel 回写）；`flow.json` / `status.md` / `log/**` / `kb/**` / `plan/v1/stage-133/**` / `dispatch.jsonl` **一律不动**。

## 二、任务拆解

### 2.0 单写者矩阵（严格串行，不并行）

| 文件 | 写者顺序 | 说明 |
|------|----------|------|
| `package.json`、`dsh/package.json`、`package-lock.json`、`docs/releases/v1.6.1.md`（重命名自 v1.7.0.md） | T1（executor-a） | 版本权威字段 + 发布说明 |
| `CHANGELOG.md`、`docs/VERSIONS.md`、`docs/commands.md`、`README*.md`、`docs/json-contract.md`、`dsh/*.md` | T1 → T2 → T6 | 三个任务都碰（T1 版本号、T2 发布语义、T6 分级/CI 文案），**必须串行** |
| `docs/releases/v1.6.1.md` | T1（重命名+版本标注）→ T6（补分级/CI 说明） | 串行 |
| `scripts/release.mjs` | 仅 T2（executor-c） | 提交点唯一（含新增 `--push`） |
| `.openfeel/dev/dev_core.md` | T3 → T5 | T3 写 CI 发布规则，T5 追写版本分级规则；同文件串行 |
| **`src/core/templates.ts`** | **仅 T3**（executor-a） | 正文 A68.5 明确要求 `DEV_CORE_TEMPLATE_ZH/EN` 带 CI 规则（新项目 `init` 自带）；T5 **不碰**该文件 |
| **`dsh/lib/surface/prompt.js`** | **仅 T5**（executor-a） | 提示词单一源（`FEEL_BODY_ZH`/`FEEL_BODY_EN`） |
| **4 份 `src/core/templates-data/{claude,opencode}/agents/{zh-CN,en}/feel.md`** | **仅 T5** | 与源逐字镜像（parity 5 处） |
| **`src/core/template-loader.ts`** | **T5 经 `npm run build` 重生成** | 生成物，**禁手改**；只许 build 写 |
| **`test/cli/feel-prompt-budget.test.ts`** | **T5 新建** | 渲染态体积断言；**不动** parity 测试的 5 条 |

### T1（= A68.1、A68.2、A68.3）版本号 1.7.0 → 1.6.1

- **事实（实测 2026-11-25）**：`git grep -c "1\.7\.0" -- src dsh docs scripts test package.json` = **55 文件**命中；其中 **7 行**是历史 stage id `v1.7.0-stage-133`（`dsh/ACTION-GUIDE.md:21`、`dsh/ADAPTER.md:221`、`dsh/README.md:38`、`dsh/test/verify.js:1259`、`test/scripts/release.test.ts:279/291/293`），**保留不改**。`package.json` 现为 1.7.0。
- **必改（权威版本）**：`package.json:3`、`dsh/package.json:3`/`:39`（`requiresCli` → `>=1.6.1`）、`package-lock.json` 对应版本字段（2 处）。
- **必改（当前版本标注 / 发布说明）**：`CHANGELOG.md` 顶部段标题（→ `## [1.6.1]`）与该段内版本引用（**历史段 `## [1.6.0]` 及更早逐字不动**）；`docs/VERSIONS.md`；`README.zh-CN.md`、`README.en.md`；`docs/commands.md` 适用版本快照与全文 `v1.7.0` 标注；`docs/json-contract.md`；`dsh/ADAPTER.md`、`dsh/ACTION-GUIDE.md`、`dsh/README.md`；`dsh/docs/compat/{stage,req,pipeline,persistence}.md` 的「`v1.7.0` 增量（现行契约…）」段；`test/fixtures/README.md`；`docs/releases/v1.7.0.md` **重命名为** `docs/releases/v1.6.1.md` 并改内部版本标注（`来源阶段：v1.7.0-stage-133` 与 `archive-v1.7.0-stage-133.md` 引用**保留**）。
- **必改（源码/测试注释 + 夹具）**：`src/**`、`test/**`、`dsh/lib/**`、`dsh/test/**` 中的 `v1.7.0 / REQ-0xx` 版本标注（纯注释/用例名，零行为变化）；**逐文件 `git diff` 复核**，不许整仓 `sed`。
- **替换规则（防打穿，F5+审查事实）**：只用边界式 `1\.7\.0(?!-stage-133)`（Git Bash：`perl -pi -e 's/1\.7\.0(?!-stage-133)/1.6.1/g'` 或 `git grep -l` 逐文件后人工确认）；**排除** `.openfeel/**`（除本阶段计划/需求正文的「当前版本」表述）、`dist/**`、`docs/market/index.json`、CHANGELOG 历史段、任何 `v1.7.0-stage-133`。
- **排除规则写明在任务卡**：给自己/executor 的替换范围 = `src dsh docs scripts test package.json`；`.openfeel/**` 只由 Feel 经 `feel_req action=body` 与本阶段计划文件更新；`flow.json`/`status.md`/`log/**`/`kb/**`/`plan/v1/stage-133/**` 不动。
- **验收命令**：`git grep -nP "1\.7\.0(?!-stage-133)" -- src dsh docs scripts test package.json ':!.openfeel'` → **空**；`git grep -n "1\.7\.0" -- ...` 残余仅 7 行 stage id；`git status --porcelain` 不含 `dist/`；改完先跑 `npx vitest run test/core/release-metadata.test.ts`（版本 lockstep 绿）。
- **负责/依赖/验收**：executor-a；无依赖；C1、C2、C6。

### T2（= A68.4）release 脚本「CI 自动发布」语义

- **事实（实测 `scripts/release.mjs`）**：六步 `version→build→publish→market→archive-commit→tag`；**默认**：`publish` → `status:'skipped'`（`reason` 含 `publish skipped`、`publishMode:'skipped'`），`market`/`archive-commit`/`tag` 全部 `skipped`，分别须 `--with-market`/`--commit-archive`/`--tag` 才执行；`--dry-run` 把 `market`/`archive-commit`/`tag` 标 `planned`（A61.1/A61.4 冻结）；`--publish` 是唯一真实开关（先 `npm whoami`）；**`--push` 不存在，需新增**。`test/scripts/release.test.ts` 现 **13 条 it**。
- **改 `scripts/release.mjs`（最小回归面）**：
  1. 默认 `publish`：`status` 仍 `skipped`、`publishMode` 由 `'skipped'` 改 **`'ci'`**，`reason` 改为「publish skipped（本地不发布：push 到 master 且 `package.json` 版本 ≠ npm 已发版本时，由 CI publish job 自动 `npm publish`；tag/release 不触发）」——**必须保留 `publish skipped` 文案子串**（`test/scripts/release.test.ts:144` 断言它）。
  2. `--dry-run` 保持双包 `npm publish --dry-run --access public` 作**包内容预检**（`publishMode:'dry-run'` 不变）。
  3. `--publish` 保留为**唯一真实开关**，help/文档标注「应急手动；标准路径 = push master → CI」（删它会打穿 **2 条**直接调用 `--publish` 的用例——`test/scripts/release.test.ts:121`、`:263`，且 CI 失败时失去重试路径）。
  4. **新增 `--push`**：`parseArgs`（`scripts/release.mjs:150-165` 一带）加 `opts.push`；作为 `archive-commit` 之后的收尾动作 `git push`（**不进六步 id**、不改六步 id）；`--dry-run` 下只 `planned` 不真推；help 与步骤说明各补一行。
  5. **不改** status 词表（`ok/failed/skipped/planned`）、不改六步 id、不改 `--dry-run` 的 planned 语义、不改默认 `market/archive-commit/tag = skipped`。
- **测试**：`npx vitest run test/scripts/release.test.ts` → **13 条既有用例零改动绿**（`publishMode:'ci'` 不违反任何断言：实测无 `publishMode==='skipped'` 断言，仅 :144 断言输出子串）；`--push` 新增 1—2 条（`--dry-run` 下 `planned` / 非 dry-run 时 `git push` 调用计数 1 且发生在 `archive-commit` 之后），**不删既有断言**。若确需改断言：只改口径不删断言并登记偏差。
- **文档语义（要写的准确口径，交给 T6 同步）**：「push 到 master 且版本与 npm 不同 → CI 自动发布；tag/release **不触发**；默认本地只做 version+build，market/archive-commit/tag 需各自 flag；`--push` 推送 commit；`--publish` 仅应急」。
- **负责/依赖/验收**：executor-c；依赖 T1（`docs/commands.md` 等文档同文件串行）；C3。

### T3（= A68.5）规则登记（+ 新项目模板）

- 写 `.openfeel/dev/dev_core.md` 一条**带日期** `[+]` 规则（项目动态规则文件，`[+]`/`[-]` 标记制）：「发布只认 push 到 master、版本变化 → CI publish job 自动 `npm publish`（`package.json` 版本 ≠ npm 已发版本即触发）；**tag/release 不触发**（以 `.github/workflows/ci.yml` 为准）；**禁止手动 `npm publish`**；不需要打 tag；`npm run release` 仅作本地预检；紧急兜底需显式 `--publish` 并**记录原因**」。
- **同一条写进 `src/core/templates.ts`** 的 `DEV_CORE_TEMPLATE_ZH` / `DEV_CORE_TEMPLATE_EN`（正文 A68.5 明确要求），让新项目 `init` 自带；模板里**不写死日期**（通用规则）。实测 `test/core/init.test.ts:272` 只断言 `dev_core.md` 存在、不断言内容 → 加条不破测。
- 同义一条写入 `docs/VERSIONS.md` §发布节奏（`:8-13`），与 `dev_core` 同源表述（防两套说法；这是**一致性**检查，不作硬判据）。
- **边界**：`.openfeel/dev/dev_core.md` **不在** guard 的 `PROTECTED_OPENFEEL_PATHS`（`dsh/lib/guard.js:766-787` 只保护 `dev/.preflight.json`/`sessions.json`/`guard-state.json`/`dispatch.jsonl`）；若相位门仍拒，由 Feel/人类落盘、executor 只给 patch 文本并按 §四 登记偏差。
- **负责/依赖/验收**：executor-a；依赖 T1（VERSIONS 同文件）；C4。

### T5（= A68.7）提示词版本分级规则 + 渲染态预算测试

- **目标**：把「版本号默认走补丁」的分级规则写进**提示词单一源**与 4 份副本，并用**渲染态**预算测试把体积钉死，避免再次大幅跳级或撑破 A10。
- **规则文本（逐字复用，不许改写口径）**：版本号默认按补丁 `x.y.Z` 推进；只有结构性/行为性变更才升 minor；破坏性变更才升 major；小改动不要升二级/一级。
- **落地（五处 + 一处新建，顺序固定）**：
  1. `dsh/lib/surface/prompt.js`：`FEEL_BODY_ZH` 与 `FEEL_BODY_EN` **各加一句**（中文 **≤60 字符**、英文 **≤50 字符**）；必须让 C7 的 grep 中英都命中分级词——中文含「补丁 / minor / major」，英文含「patch / minor / major」。**已验算的候选**：中文「版本号默认补丁位 +1（x.y.Z）；结构性变更才升 minor，破坏性才升 major；小改不跳级。」= **51 字符**（zh-disabled 837→889）；英文「Default patch bump; minor/major only if breaking.」= **49 字符**（en-disabled 1143→1193）。**不得改**「三个检查点」「兜底」段既有措辞——parity 首条用例断言 `三个检查点` / `Three checkpoints` / `feel_dispatch` 三个子串。
  2. 4 份 `feel.md`（`templates-data/{claude,opencode}/agents/{zh-CN,en}/feel.md`）的 `<!-- feel-prompt-parity:begin/end -->` 块**从源逐字复制**同步（勿手打、勿格式化）。
  3. `npm run build` 重生成 `src/core/template-loader.ts`（6 块同哈希）；**禁手改**该生成物。
  4. `.openfeel/dev/dev_core.md` 追写一条**带日期** `[+]` 版本分级规则（与 T3 同文件，串行在其后）；若相位门仍拒 → 交 patch 给 Feel/人类并按 §四 登记偏差。**不碰 `src/core/templates.ts`**（模板里的 CI 规则归 T3；正文 A68.7 未要求模板带分级条）。
  5. **新建** `test/cli/feel-prompt-budget.test.ts`：import `renderFeelPrompt`，对 `zh-CN`/`en` × `feelMode.value` `enabled`/`disabled` **四组**断言 `s.length <= 1200` 且 `s.split('\n').length <= 25`；断言**上限**而非精确长度（加字不必改测试）；另断言源正文命中分级词（zh：补丁/minor/major；en：patch/minor/major）。**不要**在 `feel-prompt-parity.test.ts` 里加第 6 条（否则正文 A68.7「parity 5/5」逐字不成立）。
- **预算纪律（硬约束）**：落地前先跑 C7 的渲染态测量；补句超限只压措辞，**不许抬 1200/25 预算、不许删既有检查点、不许改 A10**。实测余量：EN **57**、ZH 363；按 F1 口径 EN 补句 ≤50、ZH 补句 ≤60。若英文在 ≤50 内同时容纳 patch/minor/major 确实不可行 → **停手上报 lead/Feel**，由人类决定是否放宽（计划不得自行抬预算）。
- **负责/依赖/验收**：executor-a；依赖 T3（`dev_core.md` 同文件）；C7。

### T6（= A68.8）文档同步：分级规则 + CI 发布流程

- `docs/commands.md`：`release` / 版本相关节（`:1299-1325` 一带）补两句——**版本号分级规则**一句 + **「push 到 master 且版本变化 → CI publish job 自动 `npm publish`，无需手动 publish；tag/release 不触发；`--push` 推送 commit；`--publish` 仅应急」**一句。
- `CHANGELOG.md`：顶部 `## [1.6.1]` 段的发布说明同步同两句（分级 + CI），措辞与 T5 规则文本一致，**不新增历史段**；`docs/releases/v1.6.1.md` 补同样口径。
- **依赖/不变式**：必须排在 T2（同文件语义）、T5（规则文本定稿）之后 → 顺序 `T5 → T6`；只补语义，不改版本号（版本号归 T1）。
- **负责/依赖/验收**：executor-a；依赖 T1、T2、T5；C8。

### T4（= A68.6）验证与取证

- 先删 `dist/` 再 `npm run build`（避免旧产物掩盖）；`npx tsc --noEmit`；`npm test`（0 fail，用例数 ≥ 基线）；dsh **四测**（`contract.js` / `verify.js` / `guard.js` / `integration.js`）+ `lint i18n`/`lint fill`/`market:index:check`；`node scripts/release.mjs --dry-run --skip-build` 与 `node scripts/release.mjs --json` 各 exit 0；另跑 C7（渲染态四组体积 + parity 5/5 + 新预算测试）、C8（文档 grep）。产出「判据 → 命令 → 实际输出」取证清单；A68.3 的 7 行 stage-id 例外**逐行列出行号**。**判绿只认 reviewer 复跑**（不复用 executor 的证据文件）。
- **禁止**：本任务**不 push、不打 tag、不 `npm publish`**（`release --publish` 亦不跑）；要 push 须人类在计划落地并确认后另行操作。
- **负责/依赖**：reviewer（只读）+ executor 自测先行；依赖 T1、T2、T3、T5、T6 完成；覆盖 C1—C8 全部八条判据。

## 三、执行顺序（严格串行）

| 步 | 任务 | 做什么 | 中间态命令 | 期望 |
|----|------|--------|-----------|------|
| **S1** | T1 | 版本字段 + 文档/源码版本标注 + 发布说明重命名 + 溯源注释 | C1、C2 | 版本 1.6.1；非 stage-id 的 `1\.7\.0` 命中 0；残余仅 7 行 stage id |
| **S2** | T2 | `publishMode:'ci'` + 新增 `--push` + `--publish` 应急标注 + 发布语义文档 | C3 | 13 条既有 release 用例零改动绿；默认零真实 publish；market/archive-commit/tag 默认 skipped |
| **S3** | T3 | `dev_core.md` `[+]` CI 发布规则 + `templates.ts` 模板条 + `docs/VERSIONS.md` §发布节奏 | C4 | `dev_core`/模板各命中同义规则 |
| **S4** | T5 | 提示词分级规则（源 + 4 副本 + build 重生成）+ `dev_core` 追写 + 新建渲染态预算测试 | C7 | parity **5/5**；渲染态四组 ≤1200/≤25；EN 增量 ≤50、ZH 增量 ≤60 |
| **S5** | T6 | `docs/commands.md` + `CHANGELOG` + `docs/releases/v1.6.1.md` 同步分级规则与 CI 流程 | C8 | 各命中分级与 CI 两句 |
| **S6** | T4 | 全量门禁 + 判据取证 | C5、C6、C7、C8 | 全绿；八条判据逐条取证 |

> 顺序硬约束：`T1 → T2 → T3 → T5 → T6 → T4`。T5 必须晚于 T3（`dev_core.md` 同文件串行）；T6 必须晚于 T2（`docs/commands.md`/`CHANGELOG` 同文件）与 T5（规则文本定稿，防两处措辞分叉）。

中间态失败：**停手上报 Feel**，不得跳步、不得自行改判据（缺口要么补实现，要么走 §四 偏差登记）。

## 四、风险

| # | 风险 | 影响 | 缓解 |
|---|------|------|------|
| **R1** | **版本替换打穿测试/历史**：`dsh/test/**`、`test/**` 里 `v1.7.0` 文案与 stage id 混杂（`dsh/test/verify.js:1259`、`test/scripts/release.test.ts:279/291/293` 等），盲替换会改掉 stage id、归档路径或断言字面量 | 测试红 + 历史不可追溯，A68.2/A68.3 变成「改坏再补」 | 只用 `1\.7\.0(?!-stage-133)` 边界式替换；排除 `.openfeel/**`（除本阶段计划/需求正文）、`dist/**`、`docs/market/**`、CHANGELOG 历史段；逐文件 `git diff` 复核；A68.3 用 `git grep -P` 排除式验收，残余仅允许 7 行 stage id（T4 逐行列出） |
| **R2** | **release 脚本改动打穿既有 13 条用例**：改 status 词或 reason 文案会红；`publishMode` 由 `skipped`→`ci` 需确认无断言依赖（实测无 `=== 'skipped'` 断言，仅 :144 断言输出子串） | 门禁红、被迫改断言甚至删断言 | 冻结 status 词表（`ok/failed/skipped/planned`）、保留 `publish skipped` 子串、`--publish` 契约不变、默认 market/archive-commit/tag 仍 `skipped` → 13 条**零改动**绿；确需改只改口径不删断言并登记 |
| **R3** | **误 push 触发 CI 发版**：本地 1.7.0 提交尚未 push；一旦 push 到 master 且版本变化，CI **立即发布**（tag/release 不触发，但 push 会），中途 push 会先发 1.7.0 再发 1.6.1 | npm 出现错误版本（不可撤回），1.7.0 版本号被永久消耗 | **验证阶段（T4）禁止 push/tag/publish**；本阶段全程不 push；push 只在用户审阅计划/取证后明确确认、且 T1—T6 全部落地、`node scripts/release.mjs --dry-run --skip-build` 绿、`npm view openfeel version`=1.6.0 时由人类一次性执行；计划里不预设 push 步骤 |
| **R4** | **`--publish` 去留未定**：彻底禁手动（删开关）会打穿 **2 条**直接调用 `--publish` 的用例（`test/scripts/release.test.ts:121`、`:263`），且失去 CI 失败后的重试路径 | 发布链路单点故障无法补救 | 默认「**保留 + 文档标注应急**」；若要彻底删除需 lead 拍板并同批改用例（记入偏差） |
| **R5** | **规则文件写入被门禁拒**：`.openfeel/dev/` 虽不在 PROTECTED 名单，执行相位可能仍拒 | A68.5 取不到证 | executor 提供 patch 文本，Feel/人类落盘，并登记偏差 |
| **R6** | **EN 渲染态预算超限**：en-disabled 实测 **1143**，上限 1200 → 只剩 **57 字符**；写多句/带例子即超（zh-disabled 837 余量 363，但按 F1 亦只加 ≤60 保持紧凑） | 预算测试红或 A10 渲染超长回退 | 英文补句 **≤50 字符**（候选 49 字符那句）、中文 ≤60 字符；T5 落地前后各跑一次 C7 渲染态测量；超了只压措辞，**不许抬预算、不许删既有检查点**；需要展开去 `docs/commands.md`（T6）或 skill |
| **R7** | **parity 5 处副本哈希不一致**：只改 `prompt.js` 忘了 4 份 `feel.md`，或手改/格式化 `template-loader.ts` 生成物 | `feel-prompt-parity.test.ts` 至少 1 条红，提示词再次分叉 | 唯一做法：源改完 → **逐字复制**进 4 份 `feel.md` parity 块 → `npm run build` 重生成 → 跑完整 parity（5/5）；**禁手改生成物、禁顺手格式化** |
| **R8** | **模板未同步**：只改本项目 `.openfeel/dev/dev_core.md`、没改 `src/core/templates.ts` → 新项目 `init` 仍无 CI 发布规则 | 正文 A68.5「让新项目自带」落空，规则不可持续 | T3 必做；模板写通用规则（**不写死日期**）；`grep -n "CI\|npm publish" src/core/templates.ts` + `npx vitest run test/core/init.test.ts` 双证 |
| **R9** | **`--push` 是新增 flag**：正文 A68.4 要求，现状 `scripts/release.mjs` 无此开关（实测 `parseArgs` 只认 `--publish`/`--dry-run`/`--commit-archive`/`--tag`/`--with-market`/`--notes-only`/`--write-notes`/`--skip-build`） | 不做则 A68.4 不达标；做错（塞进六步 id 或改变 planned 语义）会打穿冻结契约与既有用例 | 作为 `archive-commit` 后的收尾动作、**不进六步 id**；`--dry-run` 下只 `planned`；既有 13 条零改动 + 新增用例 |
| **R10** | **判据编号曾错位**：上一版计划/overview 用旧映射（A68.1—A68.6 与 S1—S4），与正文 A68.1—A68.8 不同号 | 取证对错号、审查判「判据不明」 | 本版已按正文重排（§1.0 有映射表、overview 按 A68.1—A68.8 / T1—T6 重写）；执行一律以 §1.1 正文编号为准 |
| **R11** | **预算测试写死数字**：若断言精确长度（如 `toBe(1143)`），T5 每次微调措辞都要改测试 | 测试变脆、修复成本高 | `feel-prompt-budget.test.ts` 只断言 `<=1200` 与 `<=25`，不写死长度；基线数字只记在计划与本文件 §1.3 |

**偏差回写格式**（审查门会检查）：`YYYY-MM-DD | 任务 T# | 偏差事实（文件:行号 / 命令输出） | 处理（新增/取消任务、判据表述变化） | 影响（哪条 A 判据受影响、取证路径是否变化）`。纪律：① 判据只增不改；② 时间戳须晚于执行开始时间，否则 `REQ_PLAN_DEVIATION` 拦 `→done`；③ 无偏差保持空表，不得用来记「计划写过了」；④ 发现触发条件**停手上报 Feel**。

## 五、变更记录

- 2026-11-25 创建（planner）：REQ-068 → A68.1—A68.8 → T1—T6 → 严格串行 `S1(T1) → S2(T2) → S3(T3) → S4(T5) → S5(T6) → S6(T4)`；边界：`v1.7.0-stage-133` 历史标识保留、本阶段不 push/tag/publish、六步 id 与 status 词表冻结、`--publish` 保留为应急。
- **2026-11-25 v3（计划审查 REJECT 后按实测修订，6 项）**：
  - **F1**：A68.7 判据由「打印 `FEEL_BODY` 常量」改为**渲染态** `renderFeelPrompt`（zh enabled 720/14、zh disabled 837/17、en enabled 1027/13、en disabled 1143/16；上限 1200/25 → EN 补句 ≤50、ZH 补句 ≤60），并新增 `test/cli/feel-prompt-budget.test.ts` 渲染态断言；parity 仍 5/5、体积不进 parity 文件。
  - **F2**：CI 真实语义纠正——`ci.yml` 是 `on: [push, pull_request]`，publish job 仅 push 到 master 且版本与 npm 不同时执行，**tag/release 不触发**；计划中「tag/release 自动触发」表述全部删除，A68.5 文案同步。
  - **F3**：`release.mjs` 默认行为纠正——默认只 version+build，`market`/`archive-commit`/`tag` 默认 `skipped`、分别需 `--with-market`/`--commit-archive`/`--tag`；`--publish` 仅兜底；`--push` 新增；`test/scripts/release.test.ts` 实为 **13** 条 it（非 15）。
  - **F4**：overview 按正文 A68.1—A68.8 重排、任务 T1—T6、顺序 `T1→T2→T3→T5→T6→T4`（原 A68.1—A68.6 / S1—S4 编号错位已修）。
  - **F5**：版本替换范围收窄为 `src/dsh/docs/scripts/test/package.json`；`.openfeel/**` 只改本阶段计划/需求正文的「当前版本」表述；stage id 与 CHANGELOG 历史段保留；T1 写明排除规则与 `git grep -P` 命令。
  - **F6**：风险补 R1（替换打穿测试/历史，dsh/test 文案与 stage id 混杂）、R6（EN 渲染预算 57 字符）、R3（误 push 触发 CI 发版，验证阶段禁 push、push 只在用户确认后）、R11（预算测试不写死数字）；风险表按 13 条用例、7 行 stage-id 事实校准。
- 事实锚点（2026-11-25 实测）：范围文件内 55 文件命中 `1\.7\.0`；7 行 stage id 保留；CI `.github/workflows/ci.yml`（`on: [push, pull_request]`、publish `if: refs/heads/master` + 版本差判定）；`release.test.ts` 13 it；渲染基线见 §1.3。
