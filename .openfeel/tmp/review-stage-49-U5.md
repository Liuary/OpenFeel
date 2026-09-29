# REV-v1.1.2-stage-49-U5：测试体系审查报告（隔离纪律与断言质量）

- **单元**：U5（横切：`test/**` 全量 41 文件 + 测试基础设施）| **对应 op**：op-005
- **审查人**：openfeel-reviewer（异种模型 GLM 交叉审查）| **时间**：2026-09-29 23:00~23:40
- **配套单元报告**：`.openfeel/tmp/review-stage-49-U5.md`（同内容副本）

## 一、范围与取证方法

| 项 | 值 |
|----|-----|
| 范围 | `test/**/*.test.ts` 41 文件（全量逐一）、`vitest.config.ts`、`scripts/patch-inquirer.js`、`test/fixtures/flow-writer.mjs`、`.github/workflows/ci.yml` 测试相关段 |
| 环境 | Windows win32 / node v24.18.1 / npm 11.16.0 / vitest ^3.0.0 / commit `20670b8` |
| 基线 | `git log -1` → `20670b8 chore: 阶段归档 v1.1.2-stage-48`；测试文件实测 41（`Get-ChildItem test -Recurse -Filter *.ts`） |
| 端到端 | `npm test` 完整运行 1 次（41 文件 / **706 用例全通过**，14.92s），与 REV-49-005 修正后的基线（41/706）一致 |
| 污染审计 | 运行前后对 `~/.openfeel/`、`~/.config/opencode/`、`~/.config/openfeel/`、仓库 `.openfeel/config.yaml` 做 **SHA-256 + mtime 双快照**（快照脚本临时目录留档）：3694 个文件，**前后 0 diff** |
| 并发声明 | 审查期间 U1/U2/U3/U6 单元并行（git status 可见其 tmp 产物）；本单元 `npm test` 仅跑 1 次未复跑；git status 前后无测试引入的新变化（仅流水线自身文件与他单元产物） |

## 二、隔离核对表（41 文件全量）

判定依据为代码实测（非推断）。隔离手段分类：**A=完全隔离**（`vi.mock('node:os')` 单点 N4）；**B=完全隔离**（mkdtemp 显式路径参数，不涉 homedir）；**C=纯内存/纯函数**（无 fs 全局依赖）；**D=只读守卫**（只读仓库产物）；**E=环境依赖（只读真实环境）⚠️**；**S=子进程隔离**。

| # | 测试文件 | 涉及的真实路径 | 隔离手段 | 风险 |
|---|----------|----------------|:--:|------|
| 1 | `test/commands/config.test.ts` | （经 mock）~/.config/openfeel、项目 config.yaml | A + spyOn cwd/exit | 完全隔离 |
| 2 | `test/commands/flow.test.ts` | （经 mock）~/.openfeel/config.json | A + spyOn cwd + isTTY 还原 | 完全隔离 |
| 3 | `test/commands/flow-migrate.test.ts` | 无（临时 flow.json） | B | 完全隔离 |
| 4 | `test/commands/init.test.ts` | （经 mock）全局部署目标 | A + vi.mock(backup.js) | 完全隔离 |
| 5 | `test/commands/migrate.test.ts` | （经 mock）全局迁移目标 | A | 完全隔离 |
| 6 | `test/commands/model.test.ts` | 仓库根 `opencode.jsonc`（list/get project scope 读 cwd） | B(chdir+还原) + **E(读 cwd)** | 环境依赖（弱断言不翻车）⚠️ |
| 7 | `test/commands/plan.test.ts` | （经 mock）~/.openfeel/config.json | A + spyOn cwd | 完全隔离 |
| 8 | `test/core/archive/merge.test.ts` | 无（临时目录 flow.json） | B | 完全隔离 |
| 9 | `test/core/artifact-graph/graph.test.ts` | 无 | C | 无需隔离 |
| 10 | `test/core/artifact-graph/instruction-loader.test.ts` | 无（内存 Schema） | C | 无需隔离 |
| 11 | `test/core/backup.test.ts` | （经 mock）~/.openfeel/backup | A + **S**（子进程 USERPROFILE+HOME 双变量重定向）+ resetBackupSetCache | 完全隔离（最完备） |
| 12 | `test/core/config.test.ts` | （经 mock）profile.yaml | A + mkdtemp | 完全隔离 |
| 13 | `test/core/flow-concurrent.test.ts` | 无（临时目录 + dist 子进程） | B + S(spawn)；`it.skipIf(!hasFreshDist)` 条件跳过 | 完全隔离（有条件跳过，报告可见） |
| 14 | `test/core/flow-manager.test.ts` | （经 mock）profile.yaml（buildCascadeConfig 只读） | A | 完全隔离 |
| 15 | `test/core/fs/atomic-write.test.ts` | 无 | B | 完全隔离 |
| 16 | `test/core/fs/file-lock.test.ts` | 无（显式 lockPath） | B + S(spawnSync) | 完全隔离 |
| 17 | `test/core/fs/sequence.test.ts` | 无 | B + S(spawnSync) | 完全隔离 |
| 18 | `test/core/global-paths.test.ts` | （经 mock）全部全局路径 | A（vi.hoisted） | 完全隔离 |
| 19 | `test/core/i18n.test.ts` | **仓库 `.openfeel/.info.json` + 真实 `~/.openfeel/config.json`**（`getCliLang('.')`） | **E** | 环境依赖（只读，用户切 en 即翻转）⚠️ |
| 20 | `test/core/init.test.ts` | （经 mock）全局部署目标 | A + vi.mock(backup.js) | 完全隔离 |
| 21 | `test/core/managed-region.test.ts` | 无（文件头声明纯函数） | C | 无需隔离 |
| 22 | `test/core/metrics.test.ts` | 无（显式 dataDir） | B + resetInstance | 完全隔离 |
| 23 | `test/core/migrate.test.ts` | （经 mock）全局迁移目标 | A | 完全隔离 |
| 24 | `test/core/model-config.test.ts` | （经 mock）opencode.jsonc | A | 完全隔离 |
| 25 | `test/core/opencode-config.test.ts` | （经 mock）opencode.jsonc | A | 完全隔离 |
| 26 | `test/core/opencode-instance.test.ts` | 仓库 `.opencode/`（只读构建产物） | D | 只读守卫（依赖 build 先行） |
| 27 | `test/core/plan/path.test.ts` | 无 | B（部分纯函数） | 完全隔离 |
| 28 | `test/core/plan/roadmap.test.ts` | 无 | B + spyOn exit 还原 | 完全隔离 |
| 29 | `test/core/plan/scheme.test.ts` | 无 | B | 完全隔离 |
| 30 | `test/core/plan/stage.test.ts` | 无 | B | 完全隔离 |
| 31 | `test/core/public-logger.test.ts` | 无（显式 projectPath） | B + resetInstance | 完全隔离 |
| 32 | `test/core/schema.test.ts` | 无 | B（loadSchema）+ C | 完全隔离 |
| 33 | `test/core/setup.test.ts` | （经 mock）全局部署目标 | A + vi.mock(backup.js) | 完全隔离 |
| 34 | `test/core/template-loader.test.ts` | 仓库 `templates-data/`（只读） | D | 只读守卫 |
| 35 | `test/core/update-infos.test.ts` | （经 mock）update_infos.md | A | 完全隔离 |
| 36 | `test/core/update-state.test.ts` | 无（仅 project 级函数；Global 函数未测，见 §五 F4 关联） | B | 完全隔离 |
| 37 | `test/core/update.test.ts` | （经 mock）全局部署 + backup | A + vi.mock(backup.js) | 完全隔离 |
| 38 | `test/core/view/entry.test.ts` | 无 | B | 完全隔离 |
| 39 | `test/core/workspace/global-config.test.ts` | （经 mock）~/.openfeel/config.json | A | 完全隔离 |
| 40 | `test/core/workspace/identity.test.ts` | （经 mock）config.json；**另含反向守卫用例**（`vi.importActual` 记录真实 mtime+SHA 前后比对） | A + 反向守卫 | 完全隔离（守卫仅覆盖本文件） |
| 41 | `test/core/workspace/knowledge.test.ts` | 无 | B | 完全隔离 |

**汇总**：完全隔离 36（A=18、B=15、C=3 归并计数口径见表）、只读守卫 2、环境依赖 2、子进程隔离并入 A/B 统计；**无隔离 = 0，伪隔离 = 0**。

## 三、必查项逐项结论

### 1. 隔离纪律 ✅（核心结论：达标）
- 全仓唯一 homedir 消费点为 `src/core/global-paths.ts`（N4 收口，kb/patterns.md #2356 模式）→ 18 文件 `vi.mock('node:os')`（`vi.hoisted` + `importOriginal` 保留 `tmpdir`），一处 mock 覆盖全部全局路径。
- 隐式全局路径触达点逐一排查（`rg homedir|getGlobal|globalLockPath` src/ 全集）：`update-state.ts:128/149`（Global 函数——测试未调用，无风险）、`flow-manager.ts:1598`（buildCascadeConfig 只读真实 profile——**只读**，经 mock 家目录隔离的测试不受影响）、`i18n.ts:146`（见 F1）。
- 例外 2 处见 F1/F2（环境依赖，只读、非污染）。
- **端到端实证**：`npm test` 前后真实环境 3694 文件 **SHA-256 与 mtime 双零 diff**——「保存/恢复」伪隔离（改 mtime 后还原）也不存在。

### 2. 伪隔离反例沉淀核查 ✅
- `rg "savedConfig|savedYaml|saveGlobal(?!UpdateState)" test/ -g "*.ts"` → **零命中**。
- kb/troubleshooting.md:641（反例：identity.test.ts 保存/恢复直写真实 `~/.openfeel/config.json`，`config/BUG-004`）与 kb/patterns.md:2356（禁用伪隔离模式）描述与实测一致：identity.test.ts 已 N4 单点 mock + 私域反向守卫用例（identity.test.ts:148-181，`vi.importActual('node:os')` 绕过本文件 mock 记录真实 mtime+SHA）。
- kb 条目「审计四步法」中「mtime+hash 双比对」要求，本报告 §一 快照已按此执行。

### 3. 断言质量 ✅（抽查 10 文件，超 ≥8 要求）
| 文件 | 结论 |
|------|------|
| `commands/flow.test.ts` | **高**：15 phase 计数+转移表内容+advanceAccepted 白名单、dry-run 字节级前后一致、`save()` 注入失败验证无中间态（事务性，stage-47/REV-009） |
| `commands/config.test.ts` | **高**：级联 4 键+来源标注正则（`auto_advance.*config.yaml`），项目优先于画像的矩阵验证 |
| `commands/model.test.ts` | set 路径断言到位（exitCode+i18n 键）；**get 用例孤立弱断言**（仅 `stdout` truthy，F2） |
| `core/config.test.ts` | **高**：YAML 逐字段、静默降级断言 `warnSpy` 被调用（非仅 not.toThrow） |
| `core/backup.test.ts` | **高**：global/ 分区前缀、manifest.entries 精确断言、内容一致性、并发双 ts 目录 |
| `core/update.test.ts` | **高**：三态（conflicts/appended/updated 精确断言）、state hash 同步、skipped 精确计数 28、用户区内容保留 |
| `core/workspace/identity.test.ts` | **高**：语义断言 + 反向守卫 |
| `core/global-paths.test.ts` | **高**：10 函数逐一精确路径断言 |
| `core/i18n.test.ts` | 断言精确（zh/en 全等字符串、插值逐字符）；隔离见 F1 |
| `core/template-loader.test.ts` | `toBeTruthy` 均伴随 `toContain` 语义断言，无孤立弱断言 |
- 快照测试（toMatchSnapshot）：**零使用**；`toMatchSnapshot` 全仓 0 命中。
- 弱断言全量扫描（`toBeDefined/toBeTruthy/not.toThrow` 共 60 处命中）复核后：绝大多数为组合断言的中间步骤；孤立弱断言仅 F2 一处。

### 4. 覆盖缺口（对照 src 62 文件）
见 §五 F4/F6 与覆盖缺口清单（§六）。关键量化：41 测试文件直接覆盖 src 模块 28 个；经间接引用覆盖（flow-manager→pipeline-schema、instruction-loader→resolver/state/index、init→structure、template-loader→templates）4 个；**零引用+零测试 2 个**（utils/path.ts、utils/kb-dedup.ts）；命令层 10/16 无直接测试。

### 5. 测试基础设施
- `vitest.config.ts`：node 环境、include 正确；**无 setupFiles**（隔离全靠各文件自觉——现状达标但新增测试无强制约束）、无 timeout/maxConcurrency 定制（默认值工作正常，全量 14.92s）。
- `scripts/patch-inquirer.js`：修 @inquirer/core 在 Node 20 的 styleText 兼容（node_modules 补丁，幂等标记）；挂载于 `package.json` `postinstall`，CI `npm ci` 后自动执行。风险低（仅 dev 依赖交互组件）。
- 条件/静默跳过：`it.skipIf(!hasFreshDist)`（flow-concurrent:55，vitest 报告可见 skipped，可接受）；**backup.test.ts:169/192 静默 return**（无 dist 时用例标记 passed 而断言未执行，F3）。`.skip/.todo/.only` 显式跳过：**0 处**。
- 依赖执行顺序：opencode-instance.test.ts 依赖 build 产物（文件头已声明）；flow-concurrent/backup 并发用例依赖 dist——CI 先 build 后 test 满足；本地先 test 会红/静默跳过（脆弱性观察项）。

### 6. 与门禁的衔接（ci.yml:29-59）
- CI `npm test` 与本地同范围（仅 reporter 差异）+ node 20/22 双矩阵 ✅。
- 环境守卫覆盖三全局目录，`npm ci → build → 版本门禁 → lint i18n → snapshot → test → guard` 链完整 ✅。
- 缺口（详见 F5）：① 守卫**仅 hash 无 mtime**——伪隔离（写后还原）在 CI 不可见（与 kb/patterns.md:2639 的有意取舍一致，本地审计须补 mtime，本次已执行）；② 守卫**不含仓库 `.openfeel/config.yaml`**（stage-42 REV-011 事故类目标不在 CI 守卫内）；③ **无 coverage 门槛**（`@vitest/coverage-v8` 已装但无 script/阈值）。

### 7. U8 交叉引用（必写项）
- 交叉点文件（update/setup/migrate/backup/managed-region/update-state/update-infos/fs\*.test.ts + commands/init/migrate）：U5 判定——隔离全部达标（A 类 mock 或 B 类显式路径，backup 为 A+S 双重）；断言质量达语义级（§3 表格）。**实现分支 ↔ 测试断言对应**（writeManagedFile 五分支、migrate 事务边界、backup 锁作用域、managed-region 三态）归 **U8**（op-008），U5 不重复判定。
- 交 U8/U7 复核项：`utils/path.ts`、`utils/kb-dedup.ts` 零引用死代码嫌疑（F4）；`update-state.ts` Global 函数（loadGlobalUpdateState/saveGlobalUpdateState）无任何测试（现调用方 update.ts 走 U8 实现审查）。
- 交 U7 复核项：CI 守卫缺口（F5）；coverage script 缺失。

## 四、REV 条目

### REV-49-021: i18n.test.ts `getCliLang('.')` 环境依赖测试
- **状态**：pending | **优先级**：medium | **提出人**：openfeel-reviewer | **提出时间**：2026-09-29 23:40 | **blocking**: false
- **问题描述**：`test/core/i18n.test.ts:60-62` 以 `getCliLang('.')` 断言返回 zh-CN。该调用读取①仓库根 `.openfeel/.info.json`（lang: zh-CN）②真实 `~/.openfeel/config.json`（lang: zh-CN）——测试结果绑定两个真实环境状态。任一合法变更（用户 `config set-lang en`）都会使测试翻转失败；反之测试通过不能证明隔离正确。
- **证据**：`rg -n "getCliLang" test/core/i18n.test.ts` → :61；`src/core/i18n.ts:141-160`（优先级链）；`Get-Content .openfeel/.info.json` → `lang: zh-CN`；`~/.openfeel/config.json` → `lang: zh-CN`（均为当前实测值）。
- **建议**：改用 mkdtemp + 写 fixture `.info.json` 传显式 projectPath；全局分支用 `vi.mock('node:os')` 隔离后测试。归属：后续补丁阶段（schemer 制定方案）。
- **处理记录** / **验收记录**：（空）

### REV-49-022: backup.test.ts 静默跳过使「全绿」掩盖断言未执行
- **状态**：pending | **优先级**：medium | **提出人**：openfeel-reviewer | **提出时间**：2026-09-29 23:40 | **blocking**: false
- **问题描述**：`test/core/backup.test.ts:168-171`（dist/core/backup.js 不存在）与 `:192-195`（子进程失败）用 `console.warn + return` 跳过并发断言，vitest 将用例标记 **passed** 而非 skipped——「测试全绿但断言未执行」的盲区。CI 先 build 不触发；本地无 dist 或子进程异常时静默通过。对比：flow-concurrent.test.ts:55 用 `it.skipIf` 可见跳过（正确范式）。
- **证据**：`test/core/backup.test.ts:166-195` 原文（`console.warn('[skip] ...'); return;`）；`test/core/flow-concurrent.test.ts:19-20,55`（hasFreshDist + it.skipIf 对照）。
- **建议**：改为 `it.skipIf(...)` 显式跳过（或 describe 顶层守卫），使 skipped 状态可见。归属：后续补丁阶段。
- **处理记录** / **验收记录**：（空）

### REV-49-023: CI 环境守卫不含仓库 config.yaml 且无 coverage 门槛
- **状态**：pending | **优先级**：medium | **提出人**：openfeel-reviewer | **提出时间**：2026-09-29 23:40 | **blocking**: false
- **问题描述**：`.github/workflows/ci.yml:29-59` 环境守卫仅覆盖 3 个全局目录且仅比 SHA-256（无 mtime，伪隔离不可见——kb/patterns.md:2639 已知取舍，须注记为盲区）；stage-42 REV-011 事故类目标（仓库内 `.openfeel/config.yaml` 等工作区文件）不在守卫范围；`@vitest/coverage-v8` 已在 devDependencies 但无 coverage script/阈值，覆盖缺口无门禁兜底。
- **证据**：ci.yml:29-59 原文（3 目录 + sha256sum + diff）；`package.json` scripts 无 coverage 项；`rg "vitest.*coverage" package.json` → devDependencies 命中。
- **建议**：① 守卫增加仓库 `.openfeel/config.yaml`（CI checkout 中存在）快照比对；② 在 CI 或本地验收脚本注记「hash-only 盲区，本地审计须 mtime+hash 双比对」；③ 增加 `npm run test:coverage` 与阈值（初值可宽松）。归属：U7 交叉 + 后续补丁阶段。
- **处理记录** / **验收记录**：（空）

### REV-49-024: utils/path.ts 与 utils/kb-dedup.ts 零引用+零测试（死代码嫌疑）
- **状态**：pending | **优先级**：low | **提出人**：openfeel-reviewer | **提出时间**：2026-09-29 23:40 | **blocking**: false
- **问题描述**：`src/utils/path.ts` 全仓（src/test/build.js）零 import、零测试；`src/utils/kb-dedup.ts` 无任何实际 import（仅在 template-loader.ts 模板**文案**中被提及，作为给 Agent 的指令），同样零测试。plan.md 覆盖矩阵将二者分别归 U8/U1，但其「基础设施/归档去重」定位与实际零引用矛盾。kb-dedup 文案承诺的「模块不可用降级」路径无实现证据。
- **证据**：`rg -ln "utils/path" . -g "*.ts" -g "*.js" -g "*.mjs" --glob "!node_modules" --glob "!dist"` → 零命中（exit 1）；`rg -n "kb-dedup" src/ -l` → 仅 `src/core/template-loader.ts`（:492,512,1843 等均为模板字符串内容）。
- **建议**：交 op-008/U8 与 op-007/U7 复核裁定：删除，或补充调用方与测试。U5 仅登记覆盖缺口。归属：后续阶段裁定。
- **处理记录** / **验收记录**：（空）

### REV-49-025: model.test.ts get 用例孤立弱断言
- **状态**：pending | **优先级**：low | **提出人**：openfeel-reviewer | **提出时间**：2026-09-29 23:40 | **blocking**: false
- **问题描述**：`test/commands/model.test.ts:85-89` `get --scope project` 仅断言 `exitCode===0` 与 `stdout` truthy，未验证输出内容（agent 名/model 值），无法捕获输出回归。同文件 :79-82 的 list 用例断言充分，反衬此处为遗漏。另 list/get 在仓库 cwd 读取仓库根 opencode.jsonc（弱耦合，仓库文件变更可能影响输出但不影响当前断言）。
- **证据**：`test/commands/model.test.ts:85-89` 原文；仓库根 `opencode.jsonc` 存在（`Test-Path` → True）。
- **建议**：断言 stdout 含被查询 agent 名与 model 值；cwd 用 chdir+还原或 spyOn 隔离到临时项目。归属：后续补丁阶段。
- **处理记录** / **验收记录**：（空）

### REV-49-026: 命令层 10/16 与 cli/repl 零直接测试（覆盖缺口登记）
- **状态**：pending | **优先级**：low | **提出人**：openfeel-reviewer | **提出时间**：2026-09-29 23:40 | **blocking**: false
- **问题描述**：commands/ 16 个命令中 10 个无直接测试文件（archive、instructions、knowledge、lint、project、roadmap、setup、stage、update、view）；其中 setup/update/archive/plan/roadmap/stage 的 core 层有充分测试，但 CLI 封装（参数解析、exit 码、i18n 输出）未测。`cli/repl.ts`（REPL 交互入口）与 `cli/index.ts`（bin 汇总 dispatch）零测试。
- **证据**：`Get-ChildItem src/commands -Filter *.ts`（16）vs `Get-ChildItem test/commands -Filter *.test.ts`（6）；`rg -l "repl|cli/index" test/` → 零命中。
- **建议**：按风险排序补测试（stage/update/setup 命令层优先）；repl 可先补 smoke 测试。归属：后续阶段规划。
- **处理记录** / **验收记录**：（空）

## 五、发现清单汇总（blocking 判定）

| # | 位置 | 类型 | blocking | 修复归属建议 |
|---|------|------|:--:|------|
| REV-49-021 | test/core/i18n.test.ts:60-62 | 环境依赖测试（只读） | false | schemer→后续补丁 |
| REV-49-022 | test/core/backup.test.ts:168-171,192-195 | 静默跳过盲区 | false | schemer→后续补丁 |
| REV-49-023 | .github/workflows/ci.yml:29-59 | 守卫缺口 | false | U7 交叉→后续补丁 |
| REV-49-024 | src/utils/path.ts、src/utils/kb-dedup.ts | 零引用零测试 | false | U8/U7 复核→裁定 |
| REV-49-025 | test/commands/model.test.ts:85-89 | 弱断言 | false | schemer→后续补丁 |
| REV-49-026 | test/commands/**、test/cli/** | 覆盖缺口 | false | 后续阶段规划 |
| 观察项-1 | vitest.config.ts | 无 setupFiles/timeout 定制 | — | 现状无风险，暂不动 |
| 观察项-2 | test/core/public-logger.test.ts | 仅 1 用例 | — | 覆盖薄但核心路径已测 |
| 观察项-3 | opencode-instance.test.ts / flow-concurrent | 依赖 build 产物 | — | CI 满足；本地先 build 后 test |

**无 blocking 项**：核心隔离纪律达标 + 端到端双零 diff + 706 用例全绿 + 无伪隔离残留。

## 六、覆盖缺口清单（风险分级）

| 模块 | 状态 | 风险 |
|------|------|:--:|
| `src/utils/path.ts` | 零引用 + 零测试 | **medium**（死代码嫌疑，交 U8/U7） |
| `src/utils/kb-dedup.ts` | 零实际 import + 零测试 | **medium**（同上） |
| `src/cli/repl.ts` | 零测试 | low |
| `src/cli/index.ts` | 零直接测试（dispatch） | low |
| `src/commands/{archive,instructions,knowledge,lint,project,roadmap,setup,stage,update,view}.ts` | 命令层零直接测试 | low-medium（core 层部分覆盖） |
| `src/core/artifact-graph/{resolver,state,index}.ts` | 经 instruction-loader.test 间接 | low |
| `src/core/workspace/structure.ts` | 经 init.test 间接 | low |
| `src/core/pipeline-schema.ts` | 经 flow-manager.test 间接（198 用例） | low |
| `src/core/templates.ts` | 经 template-loader.test 间接 | low |
| `src/core/i18n-data/**` | lint i18n 门禁（531 键）+ i18n.test | low |
| `src/core/update-state.ts` Global 函数 | loadGlobalUpdateState/saveGlobalUpdateState 无测试 | medium（交 U8） |

## 七、覆盖度与局限

- 已覆盖：41/41 测试文件隔离核对（100%）；断言质量抽查 10 文件；端到端污染审计（hash+mtime 双维度，3694 文件）；伪隔离反例搜索；CI 衔接；基础设施；覆盖缺口定位。
- 局限：① 未运行 coverage 工具（无覆盖率数字，缺口清单为引用链分析结果）；② flow-manager.test.ts 198 用例与 update.test.ts 39 用例为抽样深读而非逐行（其隔离与关键断言已确认）；③ `npm test` 单次运行（并发纪律），未复验 flaky；④ mtime 审计窗口仅覆盖本次测试运行时段，此前历史污染不在本报告范围；⑤ Windows 本机环境（CI 为 ubuntu，路径语义差异如 USERPROFILE 优先级已由 backup.test.ts:185 注释覆盖）。
