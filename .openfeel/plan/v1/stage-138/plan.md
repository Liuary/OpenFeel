# v1.6.5-stage-138 计划（REQ-072 / REQ-073 / REQ-074 / fast 模式）

> 来源：`.openfeel/requirements/REQ-072.md`（A72.1—A72.6）、`REQ-073.md`（A73.1—A73.7）、`REQ-074.md`（A74.1—A74.7）。本文件是执行前拆解与判据；判据编号只增不改，执行中变更按 §八 登记。
> 角色：`executor`＝R1—R4（R4 含全量门禁 C8 与发布窗口）；`reviewer`＝独立复跑 C1—C10 与 diff 复核；`Feel`＝状态写操作与派单。
> **不包含**：`git push` / tag / `npm publish`（人类执行，push master 后 CI 发布 1.6.5）；不改 `flow.json` / `status.md` / `dist/**`；不改 guard 对真实发布/提交的拒绝语义（A72.6）；不做 models 专用迁移（A73 是通用删除入口）；**不实现** dashboard/metrics 采集、批次锁 `BATCH_LOCKED`、`<24h` 硬门（A74.5 明确登记为后续需求）；不拆 1.6.6（A74.7）。
> **生效时机（硬约束）**：`dsh/lib/guard.js` 与 `dsh/lib/tools/index.js` 由宿主启动时加载，改文件后**当前会话仍跑旧代码**（`dsh/lib/adapters/guard-state.js:383-395`）。guard/工具验收**一律以新进程测试**（`node dsh/test/*.js`）为准。提示词段落与 agent 模板同理（宿主启动时读取），以 `vitest` + 重新生成的 `src/core/template-loader.ts` 为准，不把会话内表现当证据。

## 一、目标与判据

### 1.0 事实锚点（2026-11-27 实测）

- **版本账（为什么本阶段必须加「克制机制」）**：1.6.0—1.6.4 = **5 个版本 / 17 个 REQ / 约 50.1 小时**（`archived_at` 2026-11-24T13:43 → 2026-11-26T15:51；逐版 6/8/1/1/1 条需求）。**1.6.2 与 1.6.3 归档相隔 32 秒**（18:14:06 / 18:14:38）且同属「不预设模型」主题，本应合并为 1 版 —— **5 版 → 3 版**才是该批次的正确形状。根因三条：① 批次规则只写在 `docs/VERSIONS.md:8-14`（「小功能与补丁合并到同一批次」「批次开始时锁定范围」），**未进入提示词**；② 版本在开发期写死（阶段名 `v1.6.x-stage-NN`、`target_version`、CHANGELOG 段先于发布落盘）；③ 发布前没有任何门禁检查「本批次是否还有同批项 / 是否距上次发布过近」。
- **提示词预算实测与目标值（2026-11-27 逐字量过）**：现状 `renderFeelPrompt()` 四组渲染态 = zh/en × enabled/disabled → **776 / 893 / 1078 / 1194 字符**，16 / 19 / 15 / 18 行（上限 1200 / 25，`test/cli/feel-prompt-budget.test.ts:20-21`）；源正文 `FEEL_BODY_ZH=654`、`FEEL_BODY_EN=855`（`dsh/lib/surface/prompt.js:31-60`），**en-disabled 只剩 6 字符**。目标值：① zh 版本句 54→80 字符（替换为「版本纪律」一行），正文 654→680（+26），渲染 **802 / 919**（16/19 行不变）；② EN 四处同改——版本句 49→114（+65）、checkpoint 1 `:53` 209→173（−36）、checkpoint 2 `:54` 135→109（−26）、checkpoint 3 `:55` 166→155（−11），正文 855→847（**−8**），渲染 en-enabled **1070**、en-disabled **1186/1200**（余量 14 字符，15/18 行），且英文版本句含第 4 条 `no back-to-back patches` 与 `patch/minor/major` 三档。四组全部 ≤1200/25。（逐字候选见 §二 R3；executor 可等义改写，**上限与行数不变**，改后必须重新逐组打印。）
- **提示词同源**：单一源 `FEEL_BODY_ZH` / `FEEL_BODY_EN`；5 处副本 = `src/core/template-loader.ts`（build.js 生成，3 常量 × 2 语言 = 6 块）+ 4 份 `feel.md`（claude/opencode × zh-CN/en），`test/cli/feel-prompt-parity.test.ts:30-36` 按 sha256 逐块比对。`template-loader.ts` **不手改**，改完副本后 `npm run build` 重新生成。
- **release 参数面**：`scripts/release.mjs:153-200` 参数是**闭集**（`--skip-build`/`--publish`/`--dry-run`/`--commit-archive`/`--tag`/`--push`/`--notes-only`/`--write-notes`/`--with-market`/`--json`/`-h`）；六步链 `STEPS`（`:68`）与 `--json` 形状被 `test/scripts/release.test.ts` 冻结（`steps[].id` 逐字等于数组；现有 20 个 `it`）；`--dry-run` 与 `--publish` 互斥（`:602`）；版本一致性三处比对 `checkVersionConsistency`（`:213-241`，root/dsh/CHANGELOG）；`--notes-only` 默认零写盘。A74.2 的 `--bump/--confirm/--confirm-twice/--reason` 必须**只增不改**：`STEPS` 顺序、既有 `--json` 键与**20 个旧用例**都不动，新键追加在末位。**`--confirm` 只约束 `--bump`**：`--publish`/`--push` 保持现状（`docs/VERSIONS.md:11` 的 `npm run release -- --publish` 兜底不改）。
- **批次清单数据源（按版本过滤）**：机读权威 `.openfeel/flow.json` 的 `requirements[]` 与 `stages[]`。候选 REQ **不是** `status='done'` 全量（当前 17 条 done 全是旧 `target_version`：v1.2.2—v1.5.6），而是 `status==='done'` **且**（`target_version === 当前发布版本` **或** 关联本版本阶段：`flow.json.stages` 中 `id` 以 `<version>-stage-` 开头的阶段，其 `requirements[].id`，当前 = REQ-072/073/074）。「上个版本」基线 = `.openfeel/flow-archive/*.json` 中**按 semver 不大于当前版本的最新一版**（v1.6.4）的 `archived_at`（结构见 v1.6.4：`{version,stages,reviews,log,requirements,counts,schemaVersion,archived_at}`）。**不能按文件 mtime 选基线** —— 仓库里存在 `v1.7.0.json`（mtime 更新），按 mtime 会选错。`--dry-run` 不跑 git（A74.2 零 git）→ 改动文件数置 `null` 并注明；真实模式用「上个版本归档提交」取数（见 R3/R4 的 `git rev-list` + `git diff --name-only` 命令），不依赖 tag。
- **guard × release 参数（REQ-072 与 REQ-074 的交叉约束）**：A72.1 白名单是**闭合集** `{--dry-run, --skip-build}`（既有断言 `dsh/test/guard.js:3197-3235`），且放行必须**绑定项目根**（realpath 位于含 `.openfeel/` 的项目根下、相对路径恰为 `scripts/release.mjs`；TEMP 同名脚本拒绝）；A74.2 新增的 `--bump/--reason/--confirm/--confirm-twice` **不进白名单**（guard.js 单写者 = R2，A72.1 判据冻结）。因此本批次所有带新参数的预演一律走 `npm run release -- ...`（既有 class4 warn 路径），`node scripts/release.mjs --dry-run --bump patch` 仍 class1 拒绝 —— **登记为已知边界**，不在本版扩白名单。
- **config 命令面**：`src/commands/config.ts` 现有 get-lang/set-lang/list-projects/`get`(:139-268)/`set`(:271-474)/`effective`(:478-518)；`set` 用 `ConfigDefaultsSchema.shape` 做键白名单(:341)、`getConfigFieldLegalValues` 做值校验(:351)，`defaults.` 归一在 `normalizeConfigKey`(:212-215)。**无任何删除入口**。
- **写盘单点**：`setConfigValue`（`src/core/config.ts:664-690`）＝`parseDocument` → `doc.setIn(['defaults', key])` → `atomicWriteFileSync`（注释/键序保留）；`readConfig`(:510-533)；`ConfigSchema` 三层全 `optional`(:112-116，删空不破 schema)；`resolveConfigDefaults`(:223+) 逐键回退 `DEFAULT_CONFIG`；仓储内**无 `deleteIn` 用例**（yaml ^2.9 提供，需新增）。
- **为什么必须走 CLI**：`.openfeel/config.yaml` 是 guard 保护路径（`dsh/lib/guard.js:773`），agent 的 write/edit 直写被拒 —— 这正是「只能让人类手改」的现状。
- **JSON 口径**：`--json` 是进程级预扫描单点（`src/commands/shared/json-output.ts:119-173`），子命令必须显式 `.option('--json')`；`config set` 无 `--json`（`docs/commands.md:973`），unset **故意例外**（A73.2 要 `removed` 机读位）。
- **仓库自带样本**：`.openfeel/config.yaml:34-56` 仍有 `models:`（default/roles），`defaults` 五键 + `test_enabled`(:26，非 schema 键，passthrough 保留) → A73.4 的首个真实清理对象；删前 `git status` 须干净以便回退。
- **guard 链路**：`matchWrapperScriptTarget` node 分支 `:1856-1868`（`inspect:false`）→ `nodeScriptNeedsInspection` `:1981-1985`（`scripts/**` 必读）→ `resolveWrapperScript` `:2003-2031`（`highRisk:true` `:2026`）→ 内容分类 `:3108-3249`（嵌套写→class1 `:3189-3197`、highRisk 不可判定→class1 `:3212-3230`、普通不可判定→class4 `:3231-3241`）→ 审计 kind `:3976-3980` → class4 出口 `undecidableShell` `:4012-4039`（默认 warn+审计，strict deny）→ class1 wrapper 拒 `:4043-4049`。
- **既有断言不可改**：`dsh/test/guard.js:3197-3235`（A67.5）断言 `node scripts/release.mjs --publish` deny 且 `detail.reason='node-script-high-risk-undecidable'` → 白名单只加「放行分支」，deny 保持原路径（不做前置短路）。
- **测试口径**：`dsh/test/contract.js:127` 断言 `tools.length===15`、`:447-454` 断言 feel_verify `action` 枚举含 `adherence`（**不新增工具，只扩 action**）；`dsh/test/verify.js:1628/1649/1743/1806` 是 feel_verify 各 action 的既有出口。
- **模板面**：`DEV_CORE_TEMPLATE_ZH/EN`（`src/core/templates.ts:7-40`）与仓库 `.openfeel/dev/dev_core.md` 现有 `## [+]` 段（发布只走 CI / 不预设模型）；reviewer 模板 4 份（`src/core/templates-data/{claude,opencode}/agents/{zh-CN,en}/openfeel-reviewer.md`，审查维度在 `:28`）；planner 模板 4 份（计划结构定义）；需求计划骨架 `src/core/req/plan-file.ts:24`（四节：目标/任务拆解/验收判据/偏差与回写）；`test/core/plan/req-plan.test.ts:80/173` **只断言小节存在**、不排斥新增节 → 加两节不破测试。
- **flaky 现场**：`test/core/migrate.test.ts:8-13` 已 `vi.mock('node:os')`、`:86-96` 每测试临时 HOME；目标用例 `:262-269`（全局 `opencode.jsonc` parse 失败降级保留原文件）。全局写路径 `src/core/migrate.ts:539-560`＝`getGlobalOpencodeJsoncPath` + `backupFileBeforeWrite` + `withFileLock(globalLockPath('global-opencode-jsonc'))`（默认 5000ms / stale 3000ms，见 `kb/patterns.md:2035`）。「保存原内容再写回」不是隔离（`kb/troubleshooting.md:656` 已裁定无效）。

### 1.1 判据表（A72.1—A72.6 / A73.1—A73.7 / A74.1—A74.7）

| 判据 | 要求 | 取证 |
|---|---|---|
| **A72.1** | wrapper 目标为仓库 `scripts/release.mjs`、argv ⊆ {`--dry-run`,`--skip-build`}（≥1）且不含 `--publish`/`--commit-archive`/`--tag`/`--push` → class4 warn 放行 + 审计 `detail.reason='release-dry-run-allowlisted'`；含任一真实发布/提交参数（或未知参数）仍 class1 拒绝 | C1 |
| **A72.2** | 新增 ≥5 条 guard 用例（dry-run 放行、skip-build 放行、--publish 拒绝、--commit-archive 拒绝、TEMP 同名脚本拒绝 + 负向：无 flag/未知 flag/路径变体/组合语句），`dsh/test/guard.js` 全绿 | C1 |
| **A72.3** | `migrate.test` 涉及全局 `opencode.jsonc` 的用例 `vi.mock('node:os')` 令 `homedir()` 指向每测试临时目录，并显式隔离 `HOME`/`USERPROFILE`/`CLAUDE_CONFIG_DIR`；断言**真实**全局 `opencode.jsonc` 前后哈希不变（零真实写入）；根因复现不出只登记「未复现」 | C2 |
| **A72.4** | 全量 `npm test` 连续 3 次 0 failed；首跑 flaky 名单（RPC timeout / migrate 全局配置用例）登记在 §七 | C2、C8 |
| **A72.5** | 版本 1.6.5（root/dsh lockstep、`requiresCli >=1.6.5`），版本字段 4 处 + 文档/契约引用 5 处（共 9 处，见 C7）同批；push master 后 CI 发布，不手动 publish | C7 |
| **A72.6** | 不改既有 guard 对真实发布/提交的拒绝语义；不改测试断言之外的业务行为（`npm run release` 的 class4 现状也不动） | C1 + diff 复核 |
| **A73.1** | `openfeel config unset <key>` 可删 `defaults.X` 与顶层段（如 `models`）；同一 YAML Document `deleteIn` 后原子写回，保留注释、其它键序与其它配置 | C3 |
| **A73.2** | 键不存在 → exit 1 + 明确提示；`--json` = `{schemaVersion,key,removed,path}`（不存在时 `removed=false` + `reason`） | C3 |
| **A73.3** | 删 `defaults.X` 后 `config effective X` 回落 status.md/profile/builtin 并打印来源；5 键 schema 不破 | C4 |
| **A73.4** | 删 `models` 后 `readConfig` 无该段、`lint`/`init` 等命令不受影响；当前仓库用该命令清理旧 `models:` 段（首个样本） | C4 |
| **A73.5** | DSH `feel_verify action=config_unset`（参数 key）走同一 CLI；工具数不变（15），只扩 action 枚举 | C5 |
| **A73.6** | 测试：unset 幂等/不存在/defaults 回落/注释保留/`--json` 形态；`npm test`、`tsc`、`build`、dsh 五测、`lint i18n` 全绿 | C6、C8 |
| **A73.7** | 版本 1.6.5（patch、lockstep、`requiresCli >=1.6.5`），push 后 CI 发布；不改 guard 规则、不改「人类可手改」表述 | C7 |
| **A74.1** | feel_mode 提示词新增「版本纪律」检查点（中文 ≤120 字符；英文压缩既有句子腾预算，渲染态 ≤1200 字符 / ≤25 行，四组全绿）：版本只在发布时定；一次发布=一个批次；新想法进 backlog；同批不连发 patch。parity 5/5 一致，budget 测试同步到新关键词 | C9 |
| **A74.2** | `scripts/release.mjs` 新增 `--bump patch\|minor\|major`（目标版本 = 从上次发布基线递增；当前版本已等于目标 → 打印 no-op、exit 0、零写盘；minor/major 需 `--reason`；开发阶段不改版本）；真实 bump 前打印本批次清单（只含 `target_version===当前发布版本` 或关联该版本阶段的 done REQ，**排除旧 done**）；**只有 bump 要 `--confirm`**（publish/push 语义不变）；距上次发布 <24h 再发 patch 给明确 warn 且真实 bump 额外要求 `--confirm-twice`（本批次距 v1.6.4 归档不足 24h，发布窗口实测会触发，故 R4 bump 必带）；`--dry-run` 零写盘、零 git | C10 |
| **A74.3** | `.openfeel/dev/dev_core.md` 与 `src/core/templates.ts` 的 `DEV_CORE_TEMPLATE_ZH/EN` 新增「版本与范围纪律」：版本是发布信号不是开发里程碑；一批次一版本；同批需求拆阶段；新想法进 backlog（draft + 下一版本 target）；小改动不单独发版 | C9 |
| **A74.4** | reviewer 4 份模板（`src/core/templates-data/{claude,opencode}/agents/{zh-CN,en}/openfeel-reviewer.md`）增加「过度设计」5 条判据（不必要抽象 / 新依赖 / 兼容层 / IO 分支 / REQ 外公开契约）与「计划外改动」（未在 plan/REQ 允许改动清单内的文件 → `feel_flow action=review_add` blocking REV + `auto_fix` 处置建议，不得只口头）；planner 4 份模板 + `src/core/req/plan-file.ts` 加 `## 不做清单` 与 `## 允许改动` 两节，计划评审检查 scope creep；C9 grep 覆盖 zh+en × planner+reviewer | C9 |
| **A74.5** | 指标定义写入 `docs/VERSIONS.md`（`releasesLast7d` / `medianIntervalHours` / `reqsPerVersion` / `patchPerMinor` / `outOfBatchRatio`）；R3 同批写 §发布节奏（批次规则），R4 只写 v1.6.5 段；dashboard/metrics 实现、批次锁、`<24h` 硬门**登记为后续需求，本版不实现** | C9 + diff 复核 |
| **A74.6** | `docs/commands.md` 的 release 段同步 `--bump/--confirm/--confirm-twice/--reason` 与批次清单/24h warn（`--publish`/`--push` 不加 confirm、`docs/VERSIONS:11` 兜底命令不改）；`CHANGELOG`、`docs/VERSIONS`（v1.6.5 段）、`docs/releases/v1.6.5.md` 同批 | C10 |
| **A74.7** | 1.6.5 **一次性**发布：本批次含 REQ-072 + REQ-073 + REQ-074；发布后本会话不再逐项升版 | C10 + 复核 |

### 1.2 可复现命令（仓库根，pwsh）

```powershell
# C1（A72.1/A72.2/A72.6）—— 新进程跑 guard 测试 + 源码/用例面断言 + 既有断言仍在
cd dsh; node test/guard.js; cd ..
Select-String -Path dsh/lib/guard.js -Pattern 'release-dry-run-allowlisted|RELEASE_DRY_RUN_SAFE|RELEASE_PUBLISH_FLAGS'   # ≥3
Select-String -Path dsh/test/guard.js -Pattern 'release-dry-run-allowlisted|--commit-archive|--skip-build'              # ≥3（新用例）
Select-String -Path dsh/test/guard.js -Pattern 'tmpdir|TEMP 同名|release-dry-run-allowlisted'                              # TEMP 同名脚本负向用例（项目根绑定）
Select-String -Path dsh/test/guard.js -Pattern "node-script-high-risk-undecidable"                                       # 既有断言保留（A72.6）
# C2（A72.3/A72.4）—— 隔离 + 稳定性；真实 HOME 全局 jsonc 前后哈希必须一致
$userHome = if ($env:USERPROFILE) { $env:USERPROFILE } else { $env:HOME }
$g = Join-Path $userHome '.config/opencode/opencode.jsonc'; $before = (Get-FileHash $g -ErrorAction SilentlyContinue).Hash
1..10 | ForEach-Object { npx vitest run test/core/migrate.test.ts --silent; if ($LASTEXITCODE -ne 0) { "migrate FAIL #$_" } }
$after = (Get-FileHash $g -ErrorAction SilentlyContinue).Hash; "$before" -eq "$after"    # True（零真实写入）
1..3 | ForEach-Object { npm test -- --reporter=dot; "npm test run $_ exit=$LASTEXITCODE" }
# C3（A73.1/A73.2）—— 临时项目 + 隔离 HOME；注释/键序保留；幂等 removed=false + exit 1；非法路径零写盘
$proj = Join-Path $env:TEMP ("of-a73-" + [guid]::NewGuid().ToString('N').Substring(0,8)); $ah = Join-Path $env:TEMP ("of-a73-home-" + [guid]::NewGuid().ToString('N').Substring(0,8))
New-Item -ItemType Directory -Force (Join-Path $proj '.openfeel'), $ah | Out-Null; $env:USERPROFILE = $ah; $env:HOME = $ah
@('# 顶注保留','meta:','  version: 1.5.9','defaults:','  execution_mode: auto   # 行内注释保留','  feel_mode: enabled','models:','  default: { provider: deepseek, model_name: x }') | Set-Content -Encoding utf8 (Join-Path $proj '.openfeel/config.yaml')
node bin/openfeel.js config unset models --project $proj --json | Tee-Object -Variable o1 | Out-Null
$j1 = $o1 -join "`n" | ConvertFrom-Json; (($j1.PSObject.Properties.Name) -join ',') -eq 'schemaVersion,key,removed,path'; ($j1.removed -eq $true)
$txt = Get-Content (Join-Path $proj '.openfeel/config.yaml') -Raw; ($txt -match '顶注保留') -and ($txt -match '行内注释保留') -and ($txt -notmatch '(?m)^models:')
node bin/openfeel.js config unset models --project $proj --json | Out-Null; $LASTEXITCODE -eq 1
node bin/openfeel.js config unset defaults.feel_mode --project $proj --json | Out-Null; $LASTEXITCODE -eq 0
node bin/openfeel.js config unset __proto__ --project $proj; $LASTEXITCODE -eq 1
# C4（A73.3/A73.4）—— defaults 回落 + 5 键 schema + 仓库首个样本（真实清理）
$e = node bin/openfeel.js config effective feel_mode --project $proj --json | ConvertFrom-Json; "$($e.value)/$($e.source)"
node bin/openfeel.js config get --all --project $proj --json | ConvertFrom-Json | ForEach-Object { $_.defaults.PSObject.Properties.Name -join ',' }
git status --porcelain .openfeel/config.yaml; node bin/openfeel.js config unset models --json
Select-String -Path .openfeel/config.yaml -Pattern '^models:'                                       # 0 行
node bin/openfeel.js config get --all --json | ConvertFrom-Json | ForEach-Object { $_.defaults.feel_mode }   # 五键与值不变
# C5（A73.5）/ C6（A73.6）—— 工具计数不变 + 新 action；单测矩阵与 lint
cd dsh; node test/contract.js; node test/verify.js; cd ..
Select-String -Path dsh/lib/tools/index.js -Pattern "config_unset"          # ≥2（枚举 + case）
npx tsc --noEmit; npx vitest run test/commands/config.test.ts test/core/config.test.ts test/cli/json-contract.test.ts test/core/templates.test.ts; node bin/openfeel.js lint i18n
# C7（A72.5/A73.7/A74.7）—— 版本字段 4 处 + 文档/契约引用 5 处 = 9 处逐条命中；先 bump 再验
# 4 个字段：① package.json version ② dsh/package.json version ③ package-lock.json 顶层 version ④ package-lock.json packages[""].version
node -p "require('./package.json').version+'/'+require('./dsh/package.json').version+'/'+require('./dsh/package.json').openfeel.requiresCli+':'+require('./package-lock.json').version+'/'+require('./package-lock.json').packages[''].version"   # 1.6.5/1.6.5/>=1.6.5:1.6.5/1.6.5
Get-Content CHANGELOG.md -TotalCount 1; Select-String -Path package-lock.json -Pattern '"version": "1\.6\.5"'   # CHANGELOG 首行 + lock 2 行命中
Select-String -Path docs/VERSIONS.md -Pattern 'v1\.6\.5'   # ≥2（英文 highlight + 中文段）
Select-String -Path dsh/ADAPTER.md -Pattern 'requiresCli.*1\.6\.5|^## v1\.6\.5'; Test-Path docs/releases/v1.6.5.md
# 版本字段只有 4 处（脚本写）；「九处」= 4 字段 + requiresCli + CHANGELOG + VERSIONS×2 + ADAPTER，不要写成「脚本写 9 处」
# C8（A72.4/A73.6）—— 全量门禁（executor 跑，reviewer 独立复跑）
npx tsc --noEmit; npm test; npm run build; npm run build
cd dsh; node test/contract.js; node test/verify.js; node test/guard.js; node test/preflight.js; node test/integration.js; cd ..
node bin/openfeel.js lint i18n; npm run release -- --dry-run --skip-build
# C9（A74.1/A74.3/A74.4/A74.5）—— 提示词预算/parity + 模板两节（zh+en × planner+reviewer）+ 指标定义；四组渲染逐组打印
npx vitest run test/cli/feel-prompt-budget.test.ts test/cli/feel-prompt-parity.test.ts test/core/templates.test.ts test/core/plan/req-plan.test.ts
node --input-type=module -e "import {renderFeelPrompt} from './dsh/lib/surface/prompt.js'; for (const l of ['zh-CN','en']) for (const v of ['enabled','disabled']) { const t=renderFeelPrompt({language:l, feelMode:{value:v}}); console.log(l,v,t.length,t.split('\n').length) }"   # 目标 802/919/1070/1186，16/19/15/18
Select-String -Path dsh/lib/surface/prompt.js -Pattern '一次发布|one batch|backlog|back-to-back|连发'      # ≥4
Select-String -Path src/core/templates-data/claude/agents/zh-CN/openfeel-reviewer.md,src/core/templates-data/claude/agents/en/openfeel-reviewer.md,src/core/templates-data/opencode/agents/zh-CN/openfeel-reviewer.md,src/core/templates-data/opencode/agents/en/openfeel-reviewer.md -Pattern '不必要抽象|兼容层|计划外改动|Unnecessary abstraction|compat layer|out-of-plan'   # 每文件 ≥3
Select-String -Path src/core/templates-data/claude/agents/zh-CN/openfeel-planner.md,src/core/templates-data/claude/agents/en/openfeel-planner.md,src/core/templates-data/opencode/agents/zh-CN/openfeel-planner.md,src/core/templates-data/opencode/agents/en/openfeel-planner.md -Pattern '不做清单|允许改动|Not-to-do|Allowed changes'   # 每文件 ≥2（计划模板两节）
Select-String -Path src/core/templates.ts -Pattern '版本与范围纪律|Version and scope discipline'          # 2
Select-String -Path src/core/req/plan-file.ts -Pattern '不做清单|允许改动'                               # 2
Select-String -Path docs/VERSIONS.md -Pattern 'releasesLast7d|medianIntervalHours|reqsPerVersion|patchPerMinor|outOfBatchRatio'   # 5
Select-String -Path docs/VERSIONS.md -Pattern '发布节奏|不允许连发|back-to-back'                          # ≥1（R3 写的节奏段）
# C10（A74.2/A74.6/A74.7）—— release 新参数/批次清单/confirm/幂等/24h；文档同批；一次性发布
npx vitest run test/scripts/release.test.ts                              # 既有 20 个 it 必须原样绿（不得改旧用例）
$vf = 'package.json','dsh/package.json','package-lock.json'
$before = (Get-FileHash $vf | ForEach-Object Hash) -join '|'
npm run release -- --help                                                 # 新 flag 出现在帮助（走 npm，class4 warn）
npm run release -- --dry-run --bump patch                                 # 预演：打印 old→new 与本批次清单，files=null，零写盘
npm run release -- --bump patch                                           # 无 --confirm → exit 1，三文件哈希不变
npm run release -- --bump minor                                           # minor 无 --reason → exit 1
npm run release -- --bump patch --confirm                                 # <24h 且缺 --confirm-twice → exit 1 零写盘（本批次距 v1.6.4 <24h）
$gate = (Get-FileHash $vf | ForEach-Object Hash) -join '|'; "$before" -eq "$gate"                     # True（三次失败都零写盘）
npm run release -- --bump patch --confirm --confirm-twice                 # 真 bump 到 1.6.5（R4 发布窗口；<24h 必带第二个确认）
$bumped = (Get-FileHash $vf | ForEach-Object Hash) -join '|'
npm run release -- --bump patch --confirm                                 # 幂等：打印 no-op（already 1.6.5），零写盘
$after = (Get-FileHash $vf | ForEach-Object Hash) -join '|'; "$bumped" -eq "$after"                  # True（no-op 零写盘）
npm run release -- --bump patch --confirm-twice                            # 无 --confirm → exit 1（两个确认各管各的）
Select-String -Path docs/commands.md -Pattern '--bump|--confirm|--reason|本批次清单|confirm-twice'         # ≥5
node bin/openfeel.js req release-check v1.6.5; Test-Path docs/releases/v1.6.5.md
Get-Content CHANGELOG.md -TotalCount 1
# 批次清单正确性：夹具含 17 条旧 done（target_version ≤ v1.5.6）+ 3 条本轮 done（v1.6.5）→ 只输出 REQ-072/073/074
npx vitest run test/scripts/release.test.ts -t 'batch'                   # 含「陈旧 done 不混入」fixture
```

## 二、任务拆解

### 2.0 单写者矩阵

| 文件 | 写者 | 说明 |
|---|---|---|
| `src/core/config.ts`（新增 `unsetConfigValue`，紧邻 `setConfigValue`）、`src/commands/config.ts`（新增 `unset` 子命令）、`src/core/i18n-data/{zh-CN,en}.ts`、`dsh/lib/tools/index.js`、`test/commands/config.test.ts`、`test/core/config.test.ts`、`test/cli/json-contract.test.ts`、`dsh/test/verify.js` | **仅 R1** | 工具数保持 15；`set` 的既有行为/键白名单/`--sync-stages` 零改动 |
| `dsh/lib/guard.js`（白名单判定 + classify 插入，绑定项目根）、`dsh/test/guard.js`（≥5 新用例）、`test/core/migrate.test.ts`（mock homedir + CLAUDE_CONFIG_DIR 隔离） | **仅 R2** | 不得改 `:3207-3217` 既有断言；不得动 `npm run` 分类 |
| `dsh/lib/surface/prompt.js`、4 份 `feel.md` 副本、`src/core/template-loader.ts`（只经 `npm run build` 生成）、`test/cli/feel-prompt-budget.test.ts`、`.openfeel/dev/dev_core.md`、`src/core/templates.ts`、4 份 `openfeel-reviewer.md`、4 份 `openfeel-planner.md`、`src/core/req/plan-file.ts`、`test/core/plan/req-plan.test.ts`、`test/core/templates.test.ts`、`scripts/release.mjs`、`test/scripts/release.test.ts`、`docs/VERSIONS.md`（**只写「§发布节奏」段与「发布指标定义」新节**） | **仅 R3** | 提示词与模板同源：`template-loader.ts` 由 `npm run build` 生成、**禁手改**；`docs/VERSIONS.md` 与 R4 分节**严格串行**（R3 只写 §发布节奏 + 指标定义节，R4 只写 v1.6.5 段与顶部 highlight，禁互改） |
| `docs/commands.md`（config unset 段 + release 段）、`dsh/docs/compat/commands.md`、`dsh/ADAPTER.md`（feel_verify 行 + 同源计数 + `:18` + 文末新节）、`dsh/README.md`、`dsh/ACTION-GUIDE.md`、`CHANGELOG.md`、`docs/VERSIONS.md`（v1.6.5 段 + 顶部 highlight）、`docs/releases/v1.6.5.md`、`package.json`、`dsh/package.json`（含 `requiresCli`）、`package-lock.json` | **仅 R4** | 在 R1—R3 全部落地且测试数字冻结后写；**版本字段只有 4 处**（root `version`、dsh `version`、lock 顶层 `version`、lock `packages[""].version`），由 `npm run release -- --bump patch --confirm --confirm-twice` 生成；`requiresCli` 与文档面手工；改动文件数用 `git rev-list -1 HEAD -- <上个版本归档 json>` + `git diff --name-only "$base"`（不依赖 tag）；禁照抄本计划数字 |
| **不改** | — | `README×2`、发布 deny 语义、`.openfeel/{flow.json,status.md}`、`dist/**`、`docs/GETTING_STARTED.md`、`.openfeel/users/**` |

### R1（=A73.1—A73.6）config unset 原语 + CLI + feel_verify

- **原语**：`unsetConfigValue(projectPath, key)` → `{removed, path, reason?}`。键解析：`defaults.X`→`['defaults',X]`（X 为单段非空键名，**不限 schema**——`test_enabled` 这类退役键同样要能删，仅路径语法非法才拒绝）；`defaults`→`['defaults']`；无点→`[key]`（顶层段，`meta`/`models`/passthrough 键均可，**以 `doc.hasIn` 为准**）。文件缺失 → `removed:false, reason:'config-missing'`。`hasIn` 校验 → `deleteIn` → `parseYaml(doc.toString())` 再 `ConfigSchema.safeParse` 复验（失败抛错、零写盘）→ `atomicWriteFileSync`（空文档不删文件）。
- **CLI**：`config unset <key>` + `.option('--json')`。成功人类一行（`t('config.unset.valueOk')`）、JSON `{schemaVersion,key,removed:true,path}`；不存在：人类 stderr + `process.exit(1)`，JSON 同形 `{schemaVersion,key,removed:false,path,reason}` 后 `process.exitCode=1` 并 return（不 `process.exit`，防管道截断）。非法路径（`defaults.` / `a..b` / `__proto__`/`constructor`/`prototype`）→ `failRefusal INVALID_ARGUMENT`；`--global` → exit 1 + 明确「不覆盖 profile 键域」（登记遗留）。
- **i18n**：`config.unset.{valueOk,notFound,invalidKey,profileUnsupported}` + `help.config.unset`，zh/en 双侧同批（`lint i18n` 查键一致）。
- **工具**：`feel_verify` 的 `action` 枚举追加 `'config_unset'`（复用 `key`），case 走 `cli.json(['config','unset',key,'--json'])`，summary 回 `removed`；工具数保持 15（`contract.js:127` 不改）。
- **测试**：`test/commands/config.test.ts` 6 例（defaults.X / 顶层 models / 幂等第二次 exit 1 / 注释与键序保留 / `--json` 键序 / 非法路径零写盘）；`test/core/config.test.ts` 单测原语；`test/cli/json-contract.test.ts` 增契约用例（编号顺延）；`dsh/test/verify.js` 增 `config_unset`（临时项目，`data.removed===true`）。**仓库首个样本**（A73.4）：`git status` 干净下 `node bin/openfeel.js config unset models --json`，删后 `Select-String '^models:'` 零命中、五键与注释不动。

### R2（=A72.1—A72.4、A72.6）guard dry-run 白名单 + flaky 隔离

- **白名单（必须绑定项目根）**：新增 `RELEASE_DRY_RUN_SAFE_FLAGS={'--dry-run','--skip-build'}` / `RELEASE_PUBLISH_FLAGS={'--publish','--commit-archive','--tag','--push'}` 与 `isReleaseDryRunAllowlisted(statement, scriptInvocation, baseDir)`，判定顺序：① `wrapper==='node'`；② `real = tryRealPath(scriptInvocation.scriptPath)`（guard 既有 `:675`，**只认真实路径**，符链接/大小写/8.3 由它归位；抛错→false）；③ `basename(real)==='release.mjs'`；④ 从 `dirname(real)` 向上找**最近一个含 `.openfeel/` 的目录**作为 projectRoot（到盘符根为止，找不到→false）；⑤ `normalizePathForCompare(real) === normalizePathForCompare(join(projectRoot,'scripts','release.mjs'))`（guard 既有 `:702`）。任何一步不成立 → false（落回原 highRisk class1 拒绝）。**TEMP 里的同名 `release.mjs` 因没有含 `.openfeel/` 的祖先而必然 false**；仓外复制件同理。脚本后续 token **全部** ∈ SAFE（≥1 个），任一 token ∈ PUBLISH 或未知 → false（闭合集合，`--with-market`/`--bump` 等一律不放行）。
- **插入点**：`classifyShellCommand` wrapper 分支内、**重定向扫描之后**（`guard.js:3170-3171` 后、`:3172` 不可判定判定前）→ 命中则 `undecidable=true; detail=…; wrapper={wrapper:'node',scriptPath,class:'class4',reason:'release-dry-run-allowlisted'}; continue;`（**必须 `continue`**：同命令多语句时提前 `return` 会跳过后续语句判定 = 后门）。走 class4 出口（默认 warn+审计；`strict` 仍 deny）。发布参数不命中 → 落回原内容分类（`dsh/test/guard.js:3207-3217` 断言零改动）。
- **用例**（`dsh/test/guard.js`，插在 A67.5 后约 `:3236`）：① `--dry-run` 放行 + 审计 `guard_shell_unresolved/warn/undecidable` + `detail.reason='release-dry-run-allowlisted'` + `basename(scriptPath)='release.mjs'`；② `--dry-run --skip-build` 放行（strict 下仍 deny）；③ `--publish` deny（保持既有 reason）；④ `--commit-archive` deny；⑤ 负向：无 flag / `--with-market` / `other/release.mjs` / `release.sh` / `--dry-run && --publish` 组合语句；⑥ **TEMP 同名脚本仍拒绝**：把 `release.mjs` 复制到 `os.tmpdir()`（无 `.openfeel/` 祖先）后 `node <tmp>/release.mjs --dry-run` → deny（`reason='node-script-high-risk-undecidable'`，不得出现 `release-dry-run-allowlisted`）。
- **flaky（A72.3）**：先复现（migrate 单跑 ×10 + 全量 ×3，记录首跑失败名）；加固以**隔离真实 homedir** 为交付物：① `vi.mock('node:os')` 让 `homedir()` 返回每测试临时目录，并显式 `process.env.HOME`/`USERPROFILE`/`CLAUDE_CONFIG_DIR` 指向同一 tmp（覆盖 `global-paths.ts:102-104` 的 env 分支），`afterEach` 恢复；② 断言**真实文件**（修复前的真实 HOME 全局 `opencode.jsonc`）前后 `Get-FileHash`/sha256 不变，而不只是「断言没写」；③ 若定位到 `withFileLock(globalLockPath('global-opencode-jsonc'))`（`migrate.ts:556`）或 Windows `atomicWriteFileSync` 争用 → 该用例改走 per-test 独立 global lock 目录或直接断言 `mergeGlobalOpencodeJsonc`，**不放宽生产 5000/3000 默认值**。禁止「保存-恢复真实文件」（`kb/troubleshooting.md:656`）。**根因复现不出时只登记「未复现」，不得声称已解决**；A72.4 以连续 3 次 0 failed 为准。

### R3（=A74.1—A74.5）克制机制：提示词版本纪律 + release 批次门 + 模板判据

- **A74.1 提示词（先量后写）**：`FEEL_BODY_ZH` 把现有版本句（`prompt.js:39`，54 字符）替换为一行「版本纪律」：
  `版本纪律：版本只在发布时动；一次发布=一个批次（同批需求拆阶段不拆版本）；新想法进 backlog；同批不连发补丁；结构性才 minor、破坏性才 major。`
  （80 字符 ≤120，含 `补丁/minor/major`、`批次`、`backlog`、`连发`）。`FEEL_BODY_EN` 四处同改（docstring 同步）：① 版本句（`:57`）→ `Version: release-only; one batch; ideas→backlog; no back-to-back patches; patch, minor structural, major breaking.`（49→114，**第 4 条 `no back-to-back patches` 与 `patch` 档位必须保留**）；② checkpoint 1（`:53`）→ `1. No stage/requirement → \`feel_stage action=add\`, \`feel_req action=add\` **with \`summary\`+\`goal\`+\`acceptance\`** (else \`start\` → \`REQ_BODY_GATE\`); denied = \`no active stage\`.`（209→173，−36）；③ checkpoint 2（`:54`）→ `2. No plan (\`.openfeel/plan/reqs/REQ-NNN.plan.md\`) → body+plan first; else \`REQ_PLAN_GATE\`/\`STAGE_PLAN_GATE\`.`（135→109，−26）；④ checkpoint 3（`:55`）→ `3. Before executing → dispatch a subagent (planner / executor / reviewer), log with \`feel_dispatch\`; main session gets ≤10 lines; direct edits = violation.`（166→155，−11）。**实测结果：EN 正文 855→847（−8），渲染 en-enabled 1078→1070、en-disabled 1194→1186/1200（15/18 行，余量 14）；zh 正文 654→680（+26），渲染 776→802 / 893→919（16/19 行）。** 允许等义改写，但四组必须 ≤1200 字符 / ≤25 行；**不许抬上限、不许删检查点、不许删第 4 条、不许丢 `patch/minor/major` 档位**。四份 `feel.md` 副本同批镜像（parity 5/5），`template-loader.ts` 由 `npm run build` 重新生成（禁手改）。`test/cli/feel-prompt-budget.test.ts` 保留 `patch/minor/major`（zh 的 `补丁/minor/major`）断言并**新增纪律关键词断言**：zh 含 `批次`+`backlog`+`连发`、en 含 `one batch`+`backlog`+`back-to-back`（或统一 `/back-to-back|连发/` 正则，zh/en 各断言一次），防止纪律句被静默删掉。
- **A74.2 release 脚本（`scripts/release.mjs`，只增不改）**：`parseArgs` 增 `--bump <patch|minor|major>`、`--confirm`、`--confirm-twice`、`--reason <text>`（值消费；`--bump` 与 `--publish`/`--push`/`--commit-archive`/`--tag`/`--notes-only` 互斥 → `INVALID_ARGUMENT` exit 1）。**既有 20 个 `it`（`test/scripts/release.test.ts`，1 个 `describe`）零改动**；新用例只追加（实测是 20 条，不是 6 条；评审口径按实测修正）。
  - **bump 模式（独立模式，不进六步链）**：`STEPS` 与 `steps[].id` 不变；目标版本 = `inc(lastRelease.version, kind)`，`lastRelease` 取「发布基线」（见下），**不取当前 `package.json`**；原子写 `package.json`、`dsh/package.json`、`package-lock.json` 的 **4 个版本字段**（root `version`、dsh `version`、lock 顶层 `version`、lock `packages[""].version`，实测即这 4 处）。**幂等**：`current === target` → 打印 `no-op: already <target>（0 文件写入）`、exit 0、**零写盘**（所以 1.6.5 已 bump 后再跑 `--bump patch` 是 no-op，不是 1.6.6）；`current > target` → exit 1 并提示基线过期。**minor/major 必须 `--reason`**（缺 → exit 1 零写盘）；**只有 `--bump` 要求 `--confirm`**（缺 → exit 1 零写盘、三文件哈希不变）；`--publish`/`--push` **保持既有语义，不加 `--confirm`**（`docs/VERSIONS.md:11` 的 `npm run release -- --publish` 兜底命令不改、不加参数）。`--dry-run` 只打印 `old → new` 与将写文件清单、零写盘。`requiresCli` / CHANGELOG / docs 不动（归 R4）。
  - **本批次清单（按版本过滤，绝不全量 done）**：`buildBatchSummary({cwd, targetVersion, readText, fileExists, readFlow})`：`reqs = flow.json.requirements.filter(r => r.status==='done' && (r.target_version === targetVersion || r.id ∈ 该版本阶段的 requirements[]))`；该版本阶段 = `flow.json.stages` 中 `id` 以 `<targetVersion>-stage-` 开头的阶段（当前即 `v1.6.5-stage-138`，其 `requirements[]` = REQ-072/073/074）。**`status==='done'` 不是充分条件**：仓库现有 17 条 `done` 全是旧 `target_version`（v1.2.2—v1.5.6），必须被过滤掉。基线 `lastRelease` 取 `flow-archive/*.json` 中 **semver 小于等于当前版本的最新一版**（`v1.6.4`，不按 mtime，防 `v1.7.0.json` 干扰）；输出去重后的 REQ ID、阶段 ID、改动文件数。**R4 的 bump 前必须先把 REQ-072/073/074 推进到 `done`**（`review.result=pass` + `verification.result=pass` 后 `feel_req advance --to done`），否则清单为空。flow.json 缺失/解析失败 → 降级 `{reqs:[],stages:[],files:null,reason:'flow-unavailable'}` + warn，不阻断。`--dry-run` 不跑任何 git（files 置 `null` + 注记）；真实模式：`base = git rev-list -1 HEAD -- .openfeel/flow-archive/<lastRelease.version>.json`，然后 `git diff --name-only "$base"`（工作区 vs 该归档提交，含未提交改动）；若 R4 的改动已 commit 则用 `git diff --name-only "$base..HEAD"`；两条路径都再并上 `git status --porcelain` 去重（**不依赖 git tag**）。
  - **24h warn / 额外确认**：`warnRecentRelease({now, lastReleaseAt, kind})` —— `lastReleaseAt` 来源优先级：① `.openfeel/release/last.json` 的 `at`（存在则读；**本版不创建该文件**，避免新增写盘面）→ ② `lastRelease.archived_at`（`flow-archive`）；都拿不到 → 不输出 warn（不造假）。命中 `now - lastReleaseAt < 24h` 且 `kind==='patch'` 时：人类块打印含小时数的明确 warn + `--json.batch.warn`，且**真实 bump 额外要求 `--confirm-twice`**（与 `--confirm` 分开：`--confirm` = 我确认要改版本，`--confirm-twice` = 我确认距上次发布不足 24h 仍连发；缺 → exit 1 零写盘）。**不是硬门**（<24h 硬门本版不做，A74.5；`--confirm-twice` 可放行）；`--dry-run` 只打印 warn、不要求。
  - **输出**：人类块在真实动作前打印「本批次：REQ-(n) / 阶段(n) / 改动文件(n)」；`--json` 末位追加两个新键：`batch{version,reqs,stages,files,warn}` 与 `bump{from,to,kind,reason,files,written}`（既有键序不变）。
- **A74.3 规则文本**：`.openfeel/dev/dev_core.md` 追加 `## [+] 版本与范围纪律（2026-11-27）`；`DEV_CORE_TEMPLATE_ZH`（`src/core/templates.ts:7-22`）与 `_EN`（`:25-40`）同义各加一节：版本是发布信号不是开发里程碑 / 一批次一版本 / 同批需求拆阶段 / 新想法进 backlog（draft + 下一版本 target）/ 小改动不单独发版。
- **A74.4 审查与计划模板**：模板真实落点是 `src/core/templates-data/{claude,opencode}/agents/{zh-CN,en}/openfeel-{reviewer,planner}.md`（**8 份**：reviewer 4 + planner 4；`opencode/` 与 `claude/` 各 zh-CN/en）。① **reviewer 4 份**的「审查维度 / Review Dimensions」下加「过度设计」5 条判据（**不必要抽象 / 新依赖 / 兼容层 / IO 分支 / REQ 外公开契约**）与「计划外改动」（改动文件不在 `## 允许改动` 或 REQ 范围 → 打回；fast 单轮同样适用）；**计划外改动必须落 blocking REV**：reviewer 用 `feel_flow action=review_add`（`blocking=true`，`auto_fix` 写明处置建议：回退 / 移出本批次 / 补进允许改动清单并说明理由），不得只在审查正文口头指出。② **planner 4 份**的计划产出结构加 `## 不做清单` 与 `## 允许改动` 两节（写在「轻量口径」清单里，与「风险」并列）。模板是**可改源码**（`templates-data` 是源，`template-loader.ts` 由 `npm run build` 重新生成，禁手改）；若评审后续要求模板禁改，按「偏差与回写」登记为偏离而不是静默跳过。③ 需求计划骨架 `src/core/req/plan-file.ts:24` 的 `REQUIREMENT_PLAN_SKELETON_SECTIONS` 增两节（**占位、不是写实判据**：`isRequirementPlanFilled` 仍只查目标/任务拆解/验收判据三节），`test/core/plan/req-plan.test.ts:80/173` 同步断言两节存在。④ C9 的 grep 必须**同时覆盖 zh+en × planner+reviewer**（reviewer 4 文件各 ≥3 命中、planner 4 文件各 ≥2 命中，见 C9）。**本文件 §五/§六 即示范**。
- **A74.5 指标定义**：`docs/VERSIONS.md` 新增「发布指标定义（v1.6.5 / A74.5）」节，逐条给公式与口径：`releasesLast7d`（近 7 天发布次数）、`medianIntervalHours`（相邻发布间隔中位数）、`reqsPerVersion`（每版 done 需求数）、`patchPerMinor`（patch 数 / minor 数）、`outOfBatchRatio`（批次外改动占比）；**同批更新 §发布节奏**（写入「同批不连发 patch / one batch per release」的机制化表述，与提示词一致）；并显式写「采集/展示（dashboard/metrics）、批次锁 `BATCH_LOCKED`、`<24h` 硬门 = 后续需求，本版不实现」，与既有 `flow metrics`（进程健康）划清边界。**只写定义，不写代码。**

### R4（=A72.5 / A73.7 / A74.6 / A74.7）文档 + 版本 + 发布窗口验证

- **文档面（A74.6/A73 文档、同源计数先跑后写）**：`docs/commands.md` config 章增 `config unset`（用法/退出码/JSON 契约表新增行）与 release 段增 `--bump/--confirm/--confirm-twice/--reason`、本批次清单、24h warn（明写 `--publish`/`--push` 不加 confirm、`docs/VERSIONS:11` 兜底命令不改）；`dsh/docs/compat/commands.md`（`:231` 表 + `:236-240` 行为段 + `:410` 写目标表）；`dsh/ADAPTER.md`（feel_verify 行补 `config_unset`、`:291-302` 计数、`:18` 版本、文末 `## v1.6.5`）；`dsh/README.md:306/:310-313/:319`、`dsh/ACTION-GUIDE.md:79` 按实测刷新 contract/verify/guard/preflight 数字并标 `2026-11-27` 实测（**三文件一次改完，禁照抄本计划数字**）。
- **前置：把本批次三条需求置 `done`**（R4 bump 前必做，否则批次清单为空）：此时阶段已推进到 `exec_running` 及之后（`advance` 的 `done` 门要求关联阶段 ≥ `exec_running`）；REQ-072/073/074 各自记录 `review.result=pass` 与 `verification.result=pass`（`feel_req action=review` / `verify`，`by` 为独立审查/验证者），再 `feel_req action=advance --to done`；阶段本身仍保持在 `exec_running`（版本容器，不因需求 done 而关闭）。
- **版本（发布窗口，只此一次）**：① `npm run release -- --dry-run --bump patch` 预演（打印 `old → new` + 本批次清单 + 24h warn，零写盘、零 git）→ ② `npm run release -- --bump patch --confirm --confirm-twice` 写 **4 个版本字段**（**必须走 `npm run`**：`node scripts/release.mjs` 被 guard class1 拒绝，新参数也不在白名单；本批次距 v1.6.4 归档 2026-11-26T15:51 **不足 24h**，所以必须带 `--confirm-twice` —— 这正是 A74 要暴露的「连发 patch」自证）→ ③ 手工 `dsh/package.json` 的 `requiresCli >=1.6.5` + `CHANGELOG.md:1` + `docs/VERSIONS.md` 顶部 highlight 与 `## v1.6.5` + `docs/releases/v1.6.5.md`（仿 v1.6.4）→ ④ `npm run release -- --dry-run --skip-build` 通过（版本一致性三处比对）。**bump 幂等**：重跑 `--bump patch` 时目标仍是 1.6.5 → 打印 no-op、零写盘（`--confirm` 不必再给）。
- **验证**：C7 的 4 个版本字段 + 5 处文档/契约引用逐条命中；C8 全量门禁（executor 跑、reviewer 独立复跑）；`node bin/openfeel.js req release-check v1.6.5` 三桶；push master 后 CI 发布（人类执行，不手动 publish、不打 tag）。**改动文件数**：`$base = git rev-list -1 HEAD -- .openfeel/flow-archive/v1.6.4.json`，再 `git diff --name-only "$base"`（已提交则 `"$base..HEAD"`）取上个版本归档提交以来的改动（不依赖 git tag）；R4 未提交改动由 `git status --porcelain` 补并去重，写进 release 输出与文档时必须注明取数命令。

## 三、串行顺序

`R1 → C3/C4/C5/C6 → R2 → C1/C2 → R3 → C9 → R4 → C7/C8/C10（executor）→ reviewer 独立复跑 C1—C10`。

- R1 先：改动面小、无运行期依赖，且 A73.4 会把仓库 `models:` 段真实删掉（影响后续 lint/init 断言），越早暴露越好。
- R2 次：`src/**` 与 `dsh/lib/guard.js` 文件集不相交、技术上可并行；默认不并行 —— 测试计数要进同一批文档（R4）、dsh 五测全量串跑、flaky 归因更难。若 lead 要求并行：按 §2.0 白名单双写者、禁交叉写，R4 必须等两者 done 后再落数字。
- R3 在 R4 前：R4 的版本 bump 与文档要引用 R3 的 `--bump` 与提示词/模板实测数字；`docs/VERSIONS.md` 同文件分节**严格串行**——R3 写「§发布节奏」+「指标定义」两节，R4 写 v1.6.5 段与顶部 highlight（禁互改、不同时写）。
- **版本号在整个 R1—R3 期间保持 1.6.4 不变**（A74.2「开发阶段不改版本」的自我示范）；R4 的 bump 是唯一写版本入口，且在 C8 全绿、三条需求 done 之后执行。

## 四、风险

- **提示词预算/同源分叉**：EN 现状只剩 6 字符余量，任何「顺手加一句」都会破 1200 → 改动必须四组实测 + parity 5/5 + build 重新生成；目标值已定（en-disabled 1186/1200，余量 14），改后逐组打印比对；只改 `prompt.js` 忘改 4 份 `feel.md`（或反之）会红；手改 `template-loader.ts` 会被判为分叉起点。
- **release.mjs 回归**：`STEPS`/`steps[].id`/既有 `--json` 键序与**既有 20 个 it**被 `test/scripts/release.test.ts` 冻结，**不改旧用例**；`--bump` 必须独立模式（与 `--publish/--push/--notes-only` 互斥），否则版本一致性三处比对会在 bump 后立刻失败；`--confirm` 只加给 bump（publish/push 语义与 `docs/VERSIONS:11` 兜底命令都不动）；部分写盘（root 成功、dsh 失败）无法事务回滚 → 先算好再写、失败显式 exit 1 并由 `git status` 兜底。
- **批次清单选错基线/混入旧 done**：仓库现有 **17 条 `status=done` 全是旧 target_version（v1.2.2—v1.5.6）**，绝不能按 `status=done` 全量取；必须 `target_version === 当前发布版本` 或「关联 `v1.6.5-stage-*` 阶段」双条件过滤，并加「陈旧 done 不混入」fixture；基线按 semver 选（仓库有 `v1.7.0.json`，不按 mtime）；flow.json 不可读时降级为 `null`，不得因此阻断发布。
- **24h warn 数据来源/确认口径**：`lastReleaseAt` 优先 `.openfeel/release/last.json`，缺失回退 `flow-archive` 的 `archived_at`，都拿不到就不 warn（宁可漏报不可造假）；<24h 再发 patch = warn + 真实 bump 额外要 `--confirm-twice`（与 `--confirm` 分开），**不做**硬门（A74.5 已登记后续）。
- **guard × 新参数**：`node scripts/release.mjs --bump` 被 class1 拒（highRisk 不可判定）、`--bump`/`--confirm-twice` 不在 A72.1 白名单 → 本批次一律用 `npm run release -- ...`（class4 warn）；这是**已知边界**，不改 guard、不扩白名单（guard.js 单写者 R2，A72.1 冻结）。
- **过度设计自证**：本版最容易犯的错就是给「克制机制」再堆一个机制 → REQ-074 不新增 CLI/工具/JSON 出口、不做 dashboard/metrics 采集、不做 `BATCH_LOCKED`、不做 `<24h` 硬门；reviewer 按 A74.4 的 5 条判据审本批次自身的 diff。
- **删配置打穿 schema / 删错段**：`ConfigSchema` 三层全 optional(:112-116) + 删后 `ConfigSchema.safeParse` 复验（失败零写盘）+ 只删 `doc.hasIn` 命中的路径 + `test_enabled`(:26，passthrough) 不被误伤用例；仓库样本删前 `git status` 干净，异常可 `git checkout -- .openfeel/config.yaml` 回退。
- **guard 放行误伤真实发布 / 白名单变后门**：白名单是**闭合集合**（只两个 safe flag，其余 token 不放行）+ **realpath 绑定「含 `.openfeel/` 的项目根」且相对路径恰为 `scripts/release.mjs`**（TEMP/仓外同名脚本必拒）+ `continue` 不提前 `return`（防多语句后门）+ 既有 `--publish` 断言零改动 + 负向用例（组合语句/未知 flag/路径变体/TEMP 同名）+ strict 仍 deny；`npm run release` 分类不动（A72.6）。
- **并发测试仍 flaky**：不承诺「根因已消除」；交付物是「mock homedir + HOME/USERPROFILE/CLAUDE_CONFIG_DIR 隔离 + **真实全局 jsonc 哈希不变** + 连续 3 次 `npm test` 0 failed」；根因复现不出 → 登记「未复现」，不声称解决；**不用** `--no-file-parallelism` 或放宽超时掩盖。
- **生效时机误判**：guard/tools/提示词/agent 模板都要新进程或重启宿主才生效；把「会话里 dry-run 仍被拦」当回归、或把「测试绿」当会话已切换都会误判 —— 验收只用新进程测试 + 重启后的真实预演。

## 五、不做清单（**只约束 REQ-074 自身**；REQ-072/REQ-073 的交付不在此列）

- **不做** dashboard/metrics 采集与展示（`releasesLast7d` 等 5 项只写定义，实现登记后续需求）。
- **不做** 批次锁 `BATCH_LOCKED`（阶段开始时锁定范围、越界拒绝写）。
- **不做** `<24h` 硬门（只 warn + `--confirm-twice` 额外确认；硬门登记后续）。
- **REQ-074 不新增** CLI 子命令 / DSH 工具 / JSON 出口（工具仍 15；`feel_verify` 只扩 action）。**注意**：REQ-073 的 `config unset` 子命令与 `--json`（`{schemaVersion,key,removed,path}`）、REQ-072 的 guard 白名单属**各自需求**的交付，允许，不被本条拦。
- **不做** `--bump` 自动改 CHANGELOG/VERSIONS/release notes/`requiresCli`（文档面归 R4 人工+脚本，避免脚本写文档的过度设计）。
- **不做** guard 白名单扩容（`--bump`/`--reason`/`--confirm`/`--confirm-twice` 一律不进 A72.1 闭合集，走 `npm run release -- ...`）。
- **不做** models 专用迁移、不改 `.openfeel/config.yaml` 的键语义、不改「人类可手改」表述。
- **不做** `git push` / tag / `npm publish`（人类执行）；不拆 1.6.6（一次性发布）。

## 六、允许改动（文件白名单；白名单外一律打回）

- R1：`src/core/config.ts`、`src/commands/config.ts`、`src/core/i18n-data/{zh-CN,en}.ts`、`dsh/lib/tools/index.js`、`test/commands/config.test.ts`、`test/core/config.test.ts`、`test/cli/json-contract.test.ts`、`dsh/test/verify.js`、`.openfeel/config.yaml`（仅经 `config unset` 删 `models:` 段）。
- R2：`dsh/lib/guard.js`、`dsh/test/guard.js`、`test/core/migrate.test.ts`。
- R3：`dsh/lib/surface/prompt.js`、`src/core/templates-data/{claude,opencode}/agents/{zh-CN,en}/feel.md`、`src/core/templates-data/{claude,opencode}/agents/{zh-CN,en}/openfeel-reviewer.md`、`src/core/templates-data/{claude,opencode}/agents/{zh-CN,en}/openfeel-planner.md`、`src/core/template-loader.ts`（仅 build 生成）、`test/cli/feel-prompt-budget.test.ts`、`.openfeel/dev/dev_core.md`、`src/core/templates.ts`、`src/core/req/plan-file.ts`、`test/core/plan/req-plan.test.ts`、`test/core/templates.test.ts`、`scripts/release.mjs`、`test/scripts/release.test.ts`、`docs/VERSIONS.md`（仅「§发布节奏」与「发布指标定义」两节）。
- R4：`docs/commands.md`、`dsh/docs/compat/commands.md`、`dsh/ADAPTER.md`、`dsh/README.md`、`dsh/ACTION-GUIDE.md`、`CHANGELOG.md`、`docs/VERSIONS.md`（仅 v1.6.5 段 + 顶部 highlight）、`docs/releases/v1.6.5.md`、`package.json`、`dsh/package.json`、`package-lock.json`。
- 白名单外文件（含 `flow.json`/`status.md`/`dist/**`/`README×2`）一律视为计划外改动 → reviewer 直接打回（A74.4）。

## 七、执行期证据（2026-11-27 实测；executor 记录 + planner 复核标注）

> 本节只登记**实测**，不改判据；与计划不符处一律标「未达 / 未复现」，不宣称已解决。标「planner 复核」的是本机新进程复跑或直读结果（2026-11-27 01:57），其余为 executor 执行期记录。

### E1 全量 `npm test` ×4（A72.4）

| run | 条件 | exit | 结果 |
|---|---|---|---|
| 1 | `npm test` | 1 | 4 failed + `onTaskUpdate` timeout |
| 2 | `npm test` | 1 | `update` 两处 5000ms 超时 |
| 3 | `npm test` | 0 | **2732 passed**（唯一满绿） |
| 4 | 与 dsh 五测并发 | 1 | 2732 passed + 2 个 RPC timeout |

- 失败形态全在 **runner 层并发/超时**（`onTaskUpdate` / `update` 5000ms / RPC timeout），**无断言失败**；单独复跑对应用例不复现。
- **A72.4「连续 3 次 0 failed」未达目标**（4 次中仅 1 次满绿）：登记为**未达**，判据不因此放宽；**不用**放宽超时、`--no-file-parallelism`、串行化开关、跳过用例等手段掩盖。
- 处置口径：**全量测试与 dsh 五测串行排队（一次只跑一个）**，run4 的并发条件即失败因素之一；根因**未复现**，不写「已消除」。

### E2 migrate/update 隔离（A72.3）

- 真实 **4 个全局配置文件** sha256 **全程不变**（执行前后逐一对比）→ 零真实写入已取证；`npx vitest run test/core/migrate.test.ts` **单跑 ×10 全绿**。
- 根因**未复现**：并发条件下未能稳定重现 → 只登记「未复现」，不写「已修复」；「保存原内容再写回」仍不作为隔离手段（`kb/troubleshooting.md:656`）。

### E3 guard（A72.1 / A72.2 / A72.6）

- `cd dsh; node test/guard.js` → **通过 198 / 198**（planner 复核：2026-11-27 01:57 新进程）；含 `A72.1：TEMP 下的同名 release.mjs --dry-run 仍拒绝（realpath 无含 .openfeel/ 的项目根）`，A67.5 既有 `node-script-high-risk-undecidable` 断言未改。

### E4 config unset（A73.1—A73.4）

- 首次 `config unset models --json` → `removed:true`；第二次 → `not_found` + exit 1；`defaults` 五键、注释与键序保留。
- 仓库 `.openfeel/config.yaml` 的 `models:` 段已删（planner 复核：`^models:` 命中 **0 行**）。

### E5 模板尺寸上调（A74.4，预期内变更）

- `test/core/templates.test.ts:919/929/939/949` 四份 reviewer 的 `baseline` 与 `ceiling` 同步上调（`ceiling = 新基线`）：`6731→7168`（claude/en）、`5719→6685`（claude/zh-CN）、`6214→7317`（opencode/en）、`5818→6841`（opencode/zh-CN）。
- 原因：A74.4 在 4 份 reviewer 模板新增「过度设计 5 判据」与「计划外改动」两节 —— **属预期变更**，非尺寸漂移。planner 复核：四份文件实测字节恰为 `7168 / 6685 / 7317 / 6841`，`npx vitest run test/core/templates.test.ts` → **64 passed**（1 file）。
- 约束不变：此后 reviewer 模板不得再增长，要加内容先等量删减。

### E6 未复核项（如实标注）

- E1 的 4 次 run 明细与 E4 的 JSON 字段形态为 executor 记录，planner 未复跑全量；C8 全量门禁与 diff 复核由 reviewer 独立复跑（串行、一次一个），不以本节替代独立取证。

### E7 R4 串行全量验证（A72.4 复测）

- **R4 串行验证**：`npm test` 连续 3 次 **2732 passed / 0 failed**（本轮零 flaky）；此前 E1 的 1/4 满绿发生在与 dsh 五测**并发**条件下（run4），本轮改为串行排队（一次只跑一个）后 3/3 满绿，不改 A72.4 判据、不掩盖根因未复现的事实。

## 八、变更记录

- 2026-11-27 创建（planner，依据 REQ-072/REQ-073）：R1 config unset 原语+CLI+tool、R2 guard 白名单+flaky 隔离、R3 发布批次规则+文档+同源计数、R4 版本与全量门禁；严格串行 R1→R2→R3→R4。关键决策：① unset 明确支持 `defaults.X` 与顶层段，`--json` 是 `config set` 的**故意例外**；② guard 白名单只加放行分支、`continue` 不 `return`、deny 走原路径（保 A67.5 断言）；③ flaky 以「显式 HOME + 零真实写入断言」为交付物，不伪称根因已消除；④ guard/tools 以新进程测试为验收，不把会话内行为当证据。
- 2026-11-27 修订（planner，并入 REQ-074）：R3 改为 REQ-074（提示词版本纪律 + release `--bump/--confirm/--confirm-twice/--reason` + 批次清单 + 24h warn + dev_core/DEV_CORE + reviewer 5 判据 + 计划模板两节 + 指标定义），原 R3 文档/计数并入 R4；新增 §五 不做清单、§六 允许改动；新增 C9/C10；补版本账事实（1.6.0—1.6.4 = 5 版/17 REQ/50.1h，1.6.2+1.6.3 同题拆两版，5→3）与提示词预算实测（en-disabled 1194/1200）。关键决策：⑤ 版本只在 R4 发布窗口 bump（R1—R3 保持 1.6.4）；⑥ 新 release 参数走 `npm run`（class4 warn），不扩 guard 白名单；⑦ 批次基线按 semver 选（防 `v1.7.0.json` 干扰），flow.json 不可读时降级不阻断；⑧ `--bump` 独立模式、与六步链互斥，避免版本一致性三处比对自相矛盾。
- 2026-11-27 修订（planner，计划审查 REJECT：4 blocking + 6 major 逐条修复）：①（B1）`--confirm` **只加给 `--bump`**，`--publish`/`--push` 语义与 `docs/VERSIONS:11` 兜底命令不动，既有 `release.test.ts` **20 个 it 零改动**（评审写 6 条、实测 20 条，按实测执行，追加用例不改旧用例）；②（B2）guard 白名单**绑定项目根**：realpath + 最近含 `.openfeel/` 的项目根 + 相对路径恰为 `scripts/release.mjs`（新增 `tryRealPath`/`normalizePathForCompare` 复用），补 TEMP 同名脚本仍拒的用例 ⑥；③（B3）批次清单**按 `target_version===当前发布版本` 或关联该版本阶段过滤**（现有 17 条旧 done 必须排除），R4 bump 前先把 REQ-072/073/074 置 done，加「陈旧 done 不混入」fixture；④（B4）EN 补第 4 条 `no back-to-back patches`（并保留 `patch` 档位），重压 cp1（−36）/cp2（−26）/cp3（−11），版本句 49→114（+65），正文 855→847（−8），渲染 en 1070/1186（15/18 行，余量 14），zh 802/919（16/19 行）；budget 断言加 `back-to-back|连发`，全表数字统一为此版；⑤（M1）A74.4 落点改为真实模板 `src/core/templates-data/{claude,opencode}/agents/{zh-CN,en}/openfeel-{reviewer,planner}.md`，C9 grep zh+en × planner+reviewer，计划外改动必须落 blocking REV（`review_add` + `auto_fix`）；⑥（M2）C10 加 bump 幂等 no-op、三文件 `Get-FileHash` 零写盘断言、<24h 额外确认 `--confirm-twice`（与 `--confirm` 分开）、24h 数据来源写清（`.openfeel/release/last.json` → `archived_at`，都无则不 warn）；⑦（M3）A72.3 改 mock homedir + `CLAUDE_CONFIG_DIR` 隔离 + 真实文件哈希，根因未复现只登记不宣称解决；⑧（M4）docs 单写者：R3 写 `docs/VERSIONS.md` §发布节奏 + 指标定义，R4 写 v1.6.5 段，严格串行；⑨（M5）版本字段实测 **4 处**（root/dsh/lock 顶层/lock `packages[""]`），改动文件数用 `git rev-list -1 HEAD -- 归档文件` + `git diff --name-only`（不依赖 tag）；⑩（M6）§五 不做清单**只约束 REQ-074**（REQ-073 的 config unset/--json 允许）。
- 首跑 flaky 名单（A72.4 要求登记，执行时填实测）：RPC timeout / migrate 全局 `opencode.jsonc` 用例 —— 复跑结果与处置见 C2 输出。
- 2026-11-27 修订（planner，执行期证据回写）：新增 **§七 执行期证据**（E1 全量 `npm test` ×4 → **A72.4「连续 3 次 0 failed」未达**，仅 1/4 满绿（2732 passed），失败全在 runner 层并发/超时（`onTaskUpdate` / `update` 5000ms / RPC），根因未复现，**不放宽超时、不禁并行**掩盖；E2 真实 4 个全局文件 sha256 全程不变 + migrate 单跑 ×10 全绿；E3 guard **198/198**；E4 config unset `removed:true` / 二次 `not_found` / 五键保留；E5 四份 reviewer `ceiling` 上调 `7168/6685/7317/6841` 属 A74.4 新增两节的**预期**），原「七、变更记录」顺延为 **§八**，文首交叉引用同步。关键决策：⑪「连续 3 次」是**未达目标**——登记事实、不改判据、不伪造处置；⑫ 全量测试与 dsh 五测**串行排队（一次一个）**，并发是失败因素之一而非被掩盖项。
