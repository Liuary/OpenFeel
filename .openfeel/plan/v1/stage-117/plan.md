# v1.5.6-stage-117 计划 — 发布收口（fast 模式）

- **阶段**：`v1.5.6-stage-117`（fast；`plan_pending` → 唯一合法下一相位 `plan_review`）
- **前置**：stage-114/115/116 均 `done`（dry-run 已确认）；24 条 REV 全 `closed`，blocking open = 0
- **基线**：HEAD `d63c7ba`；`--version` 1.5.5；测试 91 文件（`Get-ChildItem test -Recurse -Filter *.test.ts` 实测 91）；`lint i18n` 1058；`lint kb` 0 过期（649 引用）；`lint req` ok（166 候选 / 17 文件 / 抑制 31 行）；已发布 npm `1.5.5`；分支 `master`
- **范围**：只做「版本载体 + 文档快照 + 归档 + 发布」，**零行为变更**（无源码逻辑改动、无 i18n 键新增、无 JSON 契约变更）

## 0. 事实核对（与任务书出入，已逐条验证）

| 项 | 任务书说法 | 实测 | 处置 |
|---|---|---|---|
| `CHANGELOG.md` | 最新节 `[1.5.5]` | **已有 `## [1.5.6] - 2026-10-31`（:7）**，Added/Changed/Fixed 覆盖 114/115/116 | 只补 `[stage-117]` 版本收口条目（+1 建议项） |
| `docs/VERSIONS.md` | 最新 v1.5.5 | **已有 EN `v1.5.6`（:19）与中文 `## v1.5.6`（:39）** | 仅核对，不改 |
| `docs/GETTING_STARTED.md` | 需同步 | **:3 已是「v1.5.6 快照」**；`dsh/README.md:199`、`dsh/ADAPTER.md:16/54`、cli-usage `SKILL.md:15/74` 亦已就绪 | 仅核对，不改 |
| `package.json` / `dsh/package.json` | 1.5.5 | 均为 1.5.5；`requiresCli: ">=1.5.5"` | 改 |
| `release-metadata.test.ts` | :59-68 | 实测 **:59-69**：`dshPkg.version === rootPkg.version`（:66）、`private===true`（:67）、`requiresCli === '>='+version`（:68） | 无需改测试，bump 需 lockstep |
| 发布触发 | — | `.github/workflows/ci.yml`：**push / pull_request 触发**；`publish` job 仅 `refs/heads/master` 且「本地版本 ≠ npm 远端版本」时执行 `npm publish --access public` | **CI 发布，禁止本地 publish** |
| 版本归档 | `feel_archive create` | 底层 `openfeel flow archive <version>`：判据 = 该版本**无 notDone** ∧ `listBlockingOpenRevsForVersion` 为空集；写 `.openfeel/flow-archive/v1.5.6.json` 并移除 flow.json 阶段 | 按此形态执行 |
| `.openfeel/manual/**` | 「manual 快照同步」 | 仓内确有 35 个 tracked 文件；`cli/commands.md:5` 声明 **v1.2.4 快照**、`index.md:45` 声明 cli-usage「快照已更新至 v1.2.4」——自 v1.2.4 起历次 bump 均未更新 | **不动**（见 §7 开放问题） |

## 1. 改动清单（逐文件逐处）

### A 类：版本载体（源，8 文件 / 11 处）

| # | 文件:行 | before → after |
|---|---|---|
| A1 | `package.json:3` | `"version": "1.5.5",` → `"version": "1.5.6",` |
| A2 | `dsh/package.json:3` | `"version": "1.5.5",` → `"version": "1.5.6",` |
| A3 | `dsh/package.json:35` | `"requiresCli": ">=1.5.5"` → `"requiresCli": ">=1.5.6"` |
| A4 | `package-lock.json:3` | 根 `"version": "1.5.5"` → `1.5.6` |
| A5 | `package-lock.json:9` | `packages[""]` 的 `"version": "1.5.5"` → `1.5.6` |
| A6 | `src/core/config.ts:471` | `CONFIG_TEMPLATE_ZH` 的 `  version: 1.5.5` → `1.5.6` |
| A7 | `src/core/config.ts:528` | `CONFIG_TEMPLATE_EN` 的 `  version: 1.5.5` → `1.5.6` |
| A8 | `src/core/templates-data/agents-md/en.md:139` | `currently v1.5.5` → `currently v1.5.6` |
| A9 | `src/core/templates-data/agents-md/zh-CN.md:139` | `当前 v1.5.5` → `当前 v1.5.6` |
| A10 | `src/core/templates-data/claude/constraint/en.md:142` | `currently v1.5.5` → `currently v1.5.6` |
| A11 | `src/core/templates-data/claude/constraint/zh-CN.md:142` | `当前 v1.5.5` → `当前 v1.5.6` |

**禁改**（同文件内非载体）：`package-lock.json:1055`（`@jridgewell/sourcemap-codec` 的 `"1.5.5"`）与 `:2845`（`"^1.5.5"`）是**第三方包**，不是本包版本。

### B 类：生成物（1 文件 / 4 行，**只能由 `npm run build` 产生**）

| # | 文件:行 | 期望 diff |
|---|---|---|
| B1 | `src/core/template-loader.ts:2033`（AGENTS_MD_TEMPLATES/EN）、`:2198`（同段/CN）、`:8383`（CLAUDE_CONSTRAINT_TEMPLATES/EN）、`:8551`（同段/CN） | 4 行 `v1.5.5` → `v1.5.6`，**无其它 diff** |
| B2 | `src/core/update.ts` | **无 diff**（SKILL 源未改；:441/:524 是 v1.5.5 历史节，保留） |

依据：`build.js` 只重写三处 `AUTO-GENERATED-*` 锚点；`src/core/templates.ts` 无生成锚点（不随 build 变）。禁手改生成物；若手改会被下次 build 覆盖。

### C 类：文档（2 文件 / 3 处）

| # | 文件:行 | 变更 |
|---|---|---|
| C1 | `README.md:13` | 📦 行整行重写为 v1.5.6 批次摘要：`最新版本 v1.5.6`（批次：preflight 写命令全覆盖 + 需求正文命令名校验 + 流程健康观测）— ① 34 命令 / 36 门位统一 preflight 闸，`--dry-run` 免门、恢复通道条件豁免、strict 拒绝零写盘；② 新增 `openfeel lint req`（JSON 出口 #41）；③ `flow metrics` 流程健康三指标 + 适配器 `observability`（JSON 契约零变更）。批次发布。 |
| C2 | `CHANGELOG.md:9`（**建议**） | intro 加粗批次名补「+ 流程健康观测」（与 `[1.5.4]`/`[1.5.5]` 的「列全批次能力」同构；Added 已逐条覆盖，跳过不影响门禁） |
| C3 | `CHANGELOG.md:24-25`（`### Changed` 首行） | 插入一行（含行内反引号，无表格分隔符）：`- [stage-117] **版本 1.5.6 收口**：package.json / dsh/package.json lockstep（version + requiresCli）、package-lock.json 两处、.openfeel/config.yaml 的 meta.version、src/core/config.ts 双模板与 templates-data（agents-md / claude constraint）的「当前版本」快照同步；npm run build 重生成 template-loader.ts（生成物禁手改）；README 最新版本行升为 v1.5.6。无行为变更。` |

### D 类：配置（1 处）

| # | 文件:行 | before → after |
|---|---|---|
| D1 | `.openfeel/config.yaml:7` | `  version: 1.5.5` → `  version: 1.5.6`（CI env guard 快照 `./.openfeel/config.yaml`，改动须在 commit 内、不得由测试写入） |

### 已就绪、仅核对（0 改动）

`docs/VERSIONS.md:19/39`、`docs/GETTING_STARTED.md:3`、`dsh/README.md:199`、`dsh/ADAPTER.md:16/54`、`src/core/templates-data/skills/openfeel-cli-usage/SKILL.md:15/74`。

## 2. 执行顺序与回滚点

1. **A1~A11 + D1**（源/配置）→ 回滚：`git checkout -- package.json dsh/package.json package-lock.json src/core/config.ts src/core/templates-data .openfeel/config.yaml`
2. **`npm run build`** → 检查 `git diff --stat src/core/template-loader.ts src/core/update.ts` 恰为 B 类预期（1 文件 4 行）。回滚：`git checkout -- src/core/template-loader.ts src/core/update.ts` 后重跑 build；**禁止**在这两个文件里落手工编辑。
3. **C1~C3**（文档）→ 回滚：`git checkout -- README.md CHANGELOG.md`
4. **门禁全跑**（§3）→ 任一失败：修当前失败项后整轮重跑；不得跳项、不得先 commit 再修。
5. **commit #1**：`chore: v1.5.6 版本收口（bump + 文档 + 门禁）`（把当时已产生的 `.openfeel/dev/.sync.json` / `.openfeel/metrics.json` / `flow.json.bak` 一并纳入，保持工作区干净）。回滚：`git reset --soft HEAD~1`（未 push 前）。
6. **阶段归档**（前置：相位已到 `review_passed`，即 fast 单轮代码审查通过、blocking REV 全闭合）：`node bin/openfeel.js archive v1.5.6-stage-117` → `.openfeel/log/archive-v1.5.6-stage-117.md`（首次不传 `--force`；`ARCHIVE_EXISTS` 即已有归档，**先查原因**）。**不得手改 flow.json/status.md**；相位推进用 `feel_flow action=advance stage=v1.5.6-stage-117 to=archiving` → `to=done`（`to=done` 受 blocking REV 门）。commit #2：`chore: 阶段归档 v1.5.6-stage-117`。
7. **版本归档**（§4）→ commit #3：`chore: v1.5.6 版本分片归档 + 门禁收口`。
8. **push + CI publish**（§5）→ 成功后 **记录发布结果**：改 `.openfeel/dev/current.md` 状态行（`已 push（<sha>）；npm 1.5.6 已发布（CI publish）`）+ 近期提交记录首行 → commit #4：`chore: 记录 v1.5.6 发布结果` → 再次 push（CI `changed=false`，不会重复发布）。

## 3. 门禁（逐条，期望值）

| # | 命令 | 期望 |
|---|---|---|
| G1 | `npx tsc --noEmit` | 0 error |
| G2 | `npx eslint src test dsh` | 33 error（HEAD 既有基线）；**新增行 0**——改动行仅 `config.ts:471/528` 与 `template-loader.ts:2033/2198/8383/8551`，须不在 error 行集内（执行期确认：以 `npx eslint src test dsh --format json` 的文件/行集比对） |
| G3 | `npx vitest run` | **91 文件 / 2201 用例**全绿，0 failed / 0 skipped（`vitest.config.ts` 默认 `OPENFEEL_PREFLIGHT=off`） |
| G4 | `npm run build` ×2 | 第二次跑完 `git status --porcelain` 与第一次后一致（幂等；dist 已 gitignore） |
| G5 | `node bin/openfeel.js lint i18n` | **1058** 键一致（零新增键） |
| G6 | `node bin/openfeel.js lint kb` | 0 过期（649 引用） |
| G7 | `node bin/openfeel.js lint req` | ok（166 候选 / 17 文件 / 抑制 31 行） |
| G8 | `node dsh/test/verify.js` | **100/100** |
| G9 | `node bin/openfeel.js --version` | `1.5.6`（读根 `package.json`；`bin/openfeel.js` 经 `dist/` 加载，G4 已构建） |
| G10 | lockstep | `node -p "const a=require('./package.json').version,b=require('./dsh/package.json'); a+' / '+b.version+' / '+b.openfeel.requiresCli"` → `1.5.6 / 1.5.6 / >=1.5.6` |

## 4. 归档判据自检（**判据不满足不硬来**）

1. 三阶段 + 本阶段全 done：`node bin/openfeel.js flow status --json` → `stages[*].phase` 全 `done`；或 `node bin/openfeel.js flow archive 1.5.6 --dry-run` **不报**「存在未完成阶段」。
2. blocking open REV = 0：同一 `--dry-run` 输出不出现「阻塞审查」段；旁证 `feel_review action=list` 过滤 `status=open ∧ blocking!==false` 为空集。
3. 实跑：`feel_archive action=create version=1.5.6`（或 `node bin/openfeel.js flow archive 1.5.6`）→ 预期「归档完成：阶段 4 / 审查 24 / 日志 N」。
4. 落盘核对：`.openfeel/flow-archive/v1.5.6.json` 存在；`node bin/openfeel.js flow archive list` 末行为 `v1.5.6`；`flow.json.meta.archived_versions` 含 `v1.5.6`；`flow.json.stages` 不再含 `v1.5.6-stage-*`；`pipeline.current` 清空、`pipeline.phase` 按空集守卫回落 `active`（**正常现象**，此后 `feel_status` 无活跃阶段）；`node bin/openfeel.js flow health` 的「归档一致性」为 pass。
5. **回退路径**：判据不满足 → 停在 `archiving` 相位，不动 flow.json（`--dry-run` 零写盘已确认拒绝）；若归档已写入但需撤销 → 先 `feel_checkpoint action=list/restore`（或 `node bin/openfeel.js flow checkpoint restore <file> --force`）把 flow.json 回到归档前快照（`meta.archived_versions` 随之复原），**再**删除 `.openfeel/flow-archive/v1.5.6.json`（顺序反了会留下索引↔目录不一致），最后 `node bin/openfeel.js flow health` 的「归档一致性」须 pass；**禁止**手改 flow.json / status.md。

## 5. 发布（CI，本地不 publish）

1. push 前硬门：`git status --porcelain` 输出为空（含 `.openfeel/dev/.sync.json`、`metrics.json`、`flow.json.bak` 均已入库）；`git log --oneline -1` 为 commit #3。
2. `git push origin master` → GitHub Actions `CI`（`push` 触发，Node 20.x/22.x 双矩阵：adapter `node --check` → `npm ci` → build → 版本一致性 guard → `lint i18n` → 测试 → env guard）→ 通过后 `publish` job 自动 `npm publish --access public`（`OPENFEEL_AUTO_NPM`）。
3. 验证：`npm view openfeel version` → `1.5.6`；`npm view openfeel@1.5.6 dist.tarball` 与 CI run 时间对得上；`npm view openfeel@1.5.6 dependencies` 与 `package.json` 一致。
4. 失败处置：CI 任一步失败 → 读 run 日志修（不重复 publish）；`npm view openfeel@1.5.6` 已存在且**非本次产物**（内容/时间不符）→ 停下报告 Feel，由 Feel 决定升 1.5.7 还是核查该版本来源；**禁止**为绕过「版本已存在」而重复 `npm publish` 同一 1.5.6。

## 6. 风险与机检

| 风险 | 机检（期望空集，除白名单） |
|---|---|
| 版本载体漏改 | `git grep -nE '"(version|requiresCli)": "(>=)?1\.5\.5"'` → 空；`git grep -n 'version: 1\.5\.5'` → 空；`git grep -n '当前 v1\.5\.5\|currently v1\.5\.5'` → 空（原 4 源 + 4 生成物共 8 处） |
| `1.5.5` 残留误判 | `git grep -n '1\.5\.5'` 的**白名单**：`package-lock.json:1055/2845`（第三方）、`CHANGELOG.md` [1.5.5] 节、`docs/VERSIONS.md` v1.5.5 节、`SKILL.md:86` 与生成物中 `## v1.5.5（stage-113）`、`dsh/{README.md:198,ADAPTER.md:53,lib/**,test/verify.js}`、`src/commands/{flow,plan,req}.ts` 与 `src/core/{preflight,process-health}.ts` 注释、`test/**` 的用例名/历史断言 |
| lockstep 漏改 | G10 + `release-metadata.test.ts:59-69`（在 G3 内） |
| 生成物手改 | `git diff` 中 `template-loader.ts` 仅 4 行、`update.ts` 无 diff；改动只经 build 产生 |
| `npm publish` 版本已存在 | 见 §5.4；CI publish job 自带「本地 ≠ 远端」前置，重复 push 不会重复发布 |
| 测试外写盘 | CI env guard 比对 `.openfeel/config.yaml` 与 `~/.openfeel` 等五路径；本阶段唯一配置改动 D1 必须在 commit 内 |

## 7. 开放问题（需 Feel 决策）

1. **`manual` 落点**：`.openfeel/manual/`（35 tracked 文件）声明停在 v1.2.4；本阶段按既例**不动**（只改版本号会让 58KB 手册虚标 v1.5.6）。若要同步，应作为独立文档批次（1.5.7）。
2. **`docs/commands.md:3`**「适用版本 v1.3.4 快照」同类陈旧声明；本阶段不动（超范围）。
3. **cli-usage SKILL 描述尾部**（`SKILL.md:3`）只列了 preflight 全覆盖 / `lint req`，未列 stage-116 流程健康（正文章节已覆盖）；补则触发 `update.ts` 重生成，属可选一致性项，默认不做。

**执行期确认**：G2 的 33 error 精确基线（未在计划期跑 eslint）；G3 的 2201 用例数（计划期只核实了 91 文件）；G8 的 100/100（未在计划期跑 verify）。依据：任务书给定这三项为 stage-116 收口实测值，且本阶段零逻辑改动。
