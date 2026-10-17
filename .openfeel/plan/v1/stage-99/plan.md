# v1.2.3-stage-99 计划 — v1.2.2 转出项收口与版本 1.2.3 收口（fast）

- **阶段**：`v1.2.3-stage-99`（单阶段；`workflowMode=fast`；`phase=plan_pending`）
- **依赖**：**无**（上游 `v1.2.2-stage-98` 已 done / 已归档；flow.json `deps=[]`）
- **优先级**：P0（补丁版本收口；范围锁定，不扩项）
- **制定人**：openfeel-planner ｜ **制定时间**：2026-10-17 ｜ **修订轮**：修订 0（初稿）
- **基线**：**HEAD `2ede21a`** + 当前工作区（`.openfeel/flow.json` 有未提交改动，属阶段创建导致）。CLI `1.2.2`；本仓测试基线 **74 文件 / 1894 用例**（v1.2.2 收口登记值）；`lint i18n` **983**；`lint kb` 0 过期 / 622 引用；flow.json `revision 1280` / `archived_versions` 11 / `requirements` 1（REQ-001 done）/ `reviews` 0。
- **定位**：把 v1.2.2 收官遗留的 4 项仓库内残差收口，并完成版本 **1.2.3** 全链路；**不新增功能**。
- **fast 纪律**：本计划为轻量计划（保留目标 / 任务表 / 依赖 / 验收 / 约束 / KB / 风险 / 承接），但仍**必经 openfeel-reviewer 单轮计划审查**（`plan_review` → `plan_passed`），不得跳过。

## 目标

1. **REV-95-009**：统一并发 JSON 退出机制（`handleConcurrentConflict` JSON 分支改为「输出 envelope → 置 `process.exitCode=2` → return」）；非 JSON 分支与退出码 2 语义零改动。
2. **REV-98-003 第 6 项**：订正 `flow advance --help --review-tier` 文案（缺省=`full` 零裁剪；按模式派生的是展示值）。
3. **REV-98-006①**：增加确定性测试钩子，使 `withFileLock` 超时路径可在 E2E 稳定断言 `INTERNAL_ERROR/internal/3`。
4. **REV-97-006**：`req show` 内联过滤改用 `listLinkedStages`；源码实测第二处为 `req set --workflow-mode`，一并单点化（`req split` 零改动）。
5. **版本 1.2.3 收口**：A/B/C/D/E 载体 + CHANGELOG + 文档多载体 + build 双生成物；`--version` = 1.2.3。

## KB 检索（`openfeel-check-kb`）

已加载 `.openfeel/kb/index.md`（architecture 55 / patterns 206 / troubleshooting 68 / setup 6，2026-10-17 更新）。**高度相关条目**：

- `kb/patterns.md #CLI 退出码语义`：门禁命令非 0 退出、不设逃生阀、用 `process.exitCode` 而非 `process.exit` 防 stdout 截断 → T1 直接依据。
- `kb/patterns.md #CLI --json 成功/失败同契约` + `#legacy 错误载荷与新增判据字段并存`：并发 JSON envelope 形态与 exit 2 不变，仅退出机制统一 → T1。
- `kb/architecture.md #CLI JSON 输出契约冻结与错误封装分层架构`：`failCli` 的 JSON 分支已是「emit → exitCode → return」；并发分支是唯一不一致点 → T1。
- `kb/troubleshooting.md #零回归取证范式（补丁前/后归一化快照 diff 空 + golden 内联 + 正控防假绿）`：T1/T4 零行为变更的取证方法。
- `kb/patterns.md #建议性文件锁模式` + `kb/architecture.md #跨进程并发保护架构`：`staleMs < timeoutMs` 是刻意设计，导致外部无法稳定触发超时 → T3 需要测试钩子。
- `kb/troubleshooting.md #环境变量覆盖型路径函数的「函数体内读 env」可测试性模式`：env seam 必须在函数体内读取，不得提为模块级常量 → T3。
- `kb/patterns.md #测试 cwd 隔离与反向守卫` + `#子进程测试未设 cwd 致真实仓库污染` + `#默认开启写真实用户目录的副作用防护`：E2E 必须隔离 HOME/USERPROFILE/OPENFEEL_LOG=0 → T3。
- `kb/architecture.md #需求聚合单点扩展架构`：`listLinkedStages` 为**命令层输出面 + 聚合投影**的唯一过滤单点；REV-97-006 登记了 `req show`/`req split` 的既有内联 → T4。
- `kb/patterns.md #版本号全链路收口清单模式：A 必改 / B 生成段 / C 传播 / D 禁改 / E 无载体` + `#多 harness 版本收口的 A 类载体清单扩展` + `#文档侧历史标记纳入版本收口禁改白名单`：T5 逐类核对；B 类双生成物；D 类白名单化；收口为最终任务组。
- `kb/patterns.md #版本号全链路收口清单模式`（更新版）：A 类 6 载体 / 8 文件 / 10 处（含 claude/constraint）；`package-lock.json` 禁 `npm install`；`config.yaml` 单行 edit。
- `kb/troubleshooting.md #断言串与落文逐字核对纪律` + `#多源文案同步陷阱`：T2 help 三载体与断言同批；粗体断串核对。
- `kb/troubleshooting.md #改 templates-data 源须同批重生成的「双生成物」` + `#build 双生成物段二分`：T2/T5 改 SKILL/agents-md/constraint 后必须同批 `npm run build`。
- `kb/patterns.md #REV/缺陷状态收口的分层口径：清账层 / 历史层 / 无法判定`：§七 承接表三分口径。

> 执行任务前，若知识库中有相关条目，务必参考。重复踩过的坑不可再犯。

## 一、源码实测基线（行号以 HEAD `2ede21a` + 当前工作区为准）

| # | 事实（实测） | 位置 | 结论 |
|:-:|------|------|------|
| A1 | `failCli` JSON 分支已为「emit → `process.exitCode=spec.exitCode` → return」；非 JSON 分支保持 `process.exit` | `src/commands/shared/errors.ts:65-78` | T1 的机制先例 |
| A2 | `handleConcurrentConflict` JSON 分支仍 `emitErrorEnvelope → process.exitCode=2 → process.exit(2)`；非 JSON 分支 `console.error → process.exit(2)`；返回类型 `never` | `src/commands/shared/errors.ts:129-152` | T1 唯一改造点 |
| A3 | `handleAddStageError` 调用 `handleConcurrentConflict` 后继续落入后续分支；返回类型 `never` | `src/commands/shared/errors.ts:160-174` | T1 须加 `return` 并把返回类型改 `void` |
| A4 | `handleConcurrentConflict` 直接调用点 8 处 + `handleAddStageError` 调用方 2 处，合计 **10 处**：`handleCliError`（后已有 return）、`flow stage remove` catch、`flow stage set --deps` catch、`flow stage reset` catch、`flow archive` save catch（后已有 return）、`flow wizard` catch、`req saveOrFail`、`handleAddStageError` 内部；`flow stage add` catch（`flow.ts:694`）、`stage create` catch（`stage.ts:679`）为 `handleAddStageError` 调用方，均为 action 内 catch 末语句、其后无代码，fallthrough 风险为零 | `src/cli/index.ts:224-227`；`src/commands/flow.ts:694/768/829/882/2041/2563`；`src/commands/stage.ts:679`；`src/commands/req.ts:87-96`；`src/commands/shared/errors.ts:163` | 逐点补 `return` / 核对既有 return；2 处 `handleAddStageError` 调用方无需追加语句 |
| A5 | `req saveOrFail` 在 handler 后 `return false`；7 个调用点全部为 `if (!saveOrFail(...)) { return; }` | `src/commands/req.ts:87-96` / `:138/:330/:363/:431/:501/:563/:628` | T1 无需改调用方逻辑，但注释需更新 |
| A6 | `--review-tier` help 字面量仍在 `flow.ts:899`；i18n zh 键 `:740`、en 键 `:707` 同款陈旧文案 | `src/commands/flow.ts:899`；`src/core/i18n-data/zh-CN.ts:740`；`src/core/i18n-data/en.ts:707` | T2 三载体同批 |
| A7 | `flow advance` 缺省生效档位 = `explicitTier ?? DEFAULT_EFFECTIVE_REVIEW_TIER`；常量恒 `full` | `src/commands/flow.ts:936-937`；`src/core/pipeline-schema.ts:79` | T2 只改文案，不改行为 |
| A8 | `withFileLock` 默认 `timeoutMs=5000` / `staleMs=3000`；`staleMs < timeoutMs` 使崩溃残留可在等待窗口内被抢占；超时抛普通 `Error` | `src/core/fs/file-lock.ts:31-37 / 122-169` | T3 钩子只改默认值解析，不改算法 |
| A9 | E2E 不可稳定触发超时的原因：预置锁在 3s 后被判定 stale 并抢占，5s 超时永不到达 | `src/core/fs/file-lock.ts:157-163`；REV-98-006① | T3 注入 `timeoutMs=200 / staleMs=60000` 即可稳定触发 |
| A10 | `listLinkedStages` 已存在并返回 `{id, phase}[]`（`data.stages` 键序）；`req list` 与 `computeRequirementAggregate` 已复用 | `src/core/req/aggregate.ts:53-57`；`src/commands/req.ts:191` | T4 单点已就绪 |
| A11 | `req show` 内联过滤：`Object.entries(data.stages ?? {}).filter(...).map(([k]) => k)` | `src/commands/req.ts:241-243` | T4 改为 `listLinkedStages(...).map(l => l.id)` |
| A12 | 第二处命令层内联过滤在 **`req set --workflow-mode`**：`.map(([k]) => normalizeStageId(k) ?? k)`；**`req split` 命令与 `splitRequirement` 引擎均无 `requirement_id` 过滤**。**函数级定位**：`req split` 无过滤；REV 所指另一处过滤实为 core 层 `allLinkedStagesDone`（`requirement-ops.ts:83-86`）内的 done 判定过滤，另见 `hasLinked`（`canCompleteRequirement:99` / `updateRequirement:305`），均保留、不受影响 | `src/commands/req.ts:436-438`；`src/core/req/requirement-ops.ts:83-86/99/165-205/305` | T4 改为 `listLinkedStages(...).map(l => normalizeStageId(l.id) ?? l.id)`；REV-97-006 标签「req split」按实测更正 |
| A13 | 版本载体现状：`package.json:3` / `package-lock.json:3,:9` / `.openfeel/config.yaml:7` / `src/core/config.ts:436,:493` / agents-md `:135`×2 / constraint `:138`×2 均为 `1.2.2` | 见 §T5 | T5 改 `1.2.3` |
| A14 | `docs/json-contract.md` §14.2 现文「仅登记 + 错误矩阵复核，不改实现；统一改造转 stage-98 评估」 | `docs/json-contract.md:319-323` | T5 改写为「已统一」并补 E2E 证据 |
| A15 | `openfeel-cli-usage` SKILL 快照为 v1.2.2；`:62` 订正条写「源码 help 文案订正转 v1.2.3」；`:74` 为 v1.2.1 历史节（D 类，不回溯改） | `src/core/templates-data/skills/openfeel-cli-usage/SKILL.md:15/:62/:74` | T5 更新快照与订正条；历史节保留 |

## 二、任务表（T1~T6）

> **依赖声明**：本阶段无阶段间依赖。阶段内建议顺序 **T1 → T2 → T3 → T4 → T5 → T6**；T1/T2 同文件不同区域（建议串行）；T3/T4 独立可顺序执行；T5 必须在全部代码改动之后；T6 只跑门禁与实测登记。

### T1 并发 JSON 退出机制统一（REV-95-009）

**文件**
- `src/commands/shared/errors.ts`：`handleConcurrentConflict`、`handleAddStageError`。
- `src/commands/flow.ts`：`flow stage add` catch 的 `handleAddStageError` 调用方（694）+ `handleConcurrentConflict` 调用点（768 / 829 / 882 / 2041 / 2563）。
- `src/commands/stage.ts`：`stage create` catch 的 `handleAddStageError` 调用方（679）。
- `src/commands/req.ts`：`saveOrFail` 注释（87-96）。
- `src/cli/index.ts`：`handleCliError` 既有 return 核对（224-227）。
- `test/cli/error-envelope.test.ts`：⑤ / ⑪ 改写 + 新增用例。
- `test/commands/flow.test.ts`：如需补 fallthrough 命令级用例。

**实施要点**
1. `handleConcurrentConflict(err, lang): void`：
   - JSON 分支：`emitErrorEnvelope(...)` → `process.exitCode = EXIT_CONCURRENT` → **return**（删除 `process.exit`）。
   - 非 JSON 分支：`console.error(...)` → `process.exit(EXIT_CONCURRENT)` **逐字不变**。
   - 更新头注：JSON 模式置码返回；非 JSON 模式即时退出。
2. `handleAddStageError(err, lang): void`：
   - 并发分支调用 `handleConcurrentConflict` 后**显式 return**；
   - 阶段目录冲突 / 其他错误分支维持既有 `process.exit(1)`；
   - 返回类型 `never` → `void`。
3. 所有调用点在 handler 后补 `return`：
   - `flow.ts:768`（stage remove catch）、`:829`（stage set catch）、`:882`（stage reset catch）、`:2563`（wizard catch）新增 `return;`；
   - `flow.ts:2041`、`cli/index.ts:225` 已有 return，核对并更新注释；
   - `req.ts:93` 之后是 `return false`，核对 7 个 `saveOrFail` 调用点均为早返回；
   - `flow.ts:694`（`flow stage add` catch）与 `stage.ts:679`（`stage create` catch）为 `handleAddStageError` 调用方；两处均为 action 内 catch 末语句、其后无代码，fallthrough 风险为零，只需核对 `handleAddStageError` 内部并发分支已显式 return。
4. 更新 `saveOrFail` 头注（「并发冲突 → 单点 exit 2（不返回）」→「JSON 置码返回 / 非 JSON exit 2」）。

**验收判据**
- [ ] JSON 模式并发：stdout 恰 1 个 `{schemaVersion:1,error:{code:'FLOW_CONCURRENT_CONFLICT',kind:'refusal',...}}`；`process.exit` **未被调用**；`process.exitCode === 2`；`console.error` 未输出通用文案。
- [ ] 非 JSON 模式并发：stderr 文案逐字不变；`process.exit(2)` 仍被调用。
- [ ] `flow stage add` / `stage create` 经 `handleAddStageError` 的 JSON 并发路径不落入通用 `errorTmpl` + exit 1。
- [ ] `flow stage set` / `flow stage remove` / `flow stage reset` / `flow wizard` 的 JSON 并发路径无二次输出。
- [ ] 10 个调用点逐点核对记录（8 个 `handleConcurrentConflict` 直接调用点 + 2 个 `handleAddStageError` 调用方；文件:行 + 是否有 return）。

### T2 `--review-tier` help 文案订正（REV-98-003 第 6 项）

**文件**
- `src/commands/flow.ts:899`（选项字面量）。
- `src/core/i18n-data/zh-CN.ts:740`、`src/core/i18n-data/en.ts:707`。
- `docs/commands.md:239`、`docs/GETTING_STARTED.md:246`（注记「转 v1.2.3」→「已于 v1.2.3 订正」）。
- `src/core/templates-data/skills/openfeel-cli-usage/SKILL.md:62`（订正条同步）。
- `src/core/template-loader.ts` + `src/core/update.ts`（build 重生成，T5 同批）。

**实施要点**
- 中文新文案建议：`审查档位（full / lean / skip；缺省=full（零裁剪）；仅显式声明时裁剪审查关，不可绕过 REV 阻塞检查）`。
- 英文新文案建议：`Review tier (full / lean / skip; default = full (zero pruning); the tier trims review gates only when declared explicitly, and cannot bypass the REV block check)`。
- 不改 `flow advance` 逻辑、不改 `DEFAULT_EFFECTIVE_REVIEW_TIER`、不改 `flow phases` 展示值。
- 历史节（README v1.2.1 节 / SKILL v1.2.1 节）不回溯改；由订正条 supersede。

**验收判据**
- [ ] `node bin/openfeel.js flow advance --help`（zh）含「缺省=full（零裁剪）」；不含「缺省=按模式派生」。
- [ ] 隔离 en 项目环境（`.openfeel/.info.json` 的 `lang: en` 或隔离全局配置）下 help 含「default = full (zero pruning)」；不含「derived from the workflow mode」。
- [ ] `flow advance` 未传 `--review-tier` 的推进行为与 T2 前逐字一致（既有回归用例）。
- [ ] `lint i18n` 键数仍为 983（或实测值），zh/en 对称。

### T3 锁等待超时 E2E 测试钩子（REV-98-006① / REV-95-008）

**文件**
- `src/core/fs/file-lock.ts`：新增测试专用默认值解析（函数体内读 env）。
- `test/core/fs/file-lock.test.ts`：gate / 合法值 / 非法值 / 显式 options 优先。
- 新增 `test/cli/lock-timeout.test.ts`：子进程 E2E（隔离 HOME + 预置锁 + env seam）。
- `docs/json-contract.md` §14.1、`.openfeel/manual/core/fs.md`：登记测试钩子（仅测试、非公开契约）。

**钩子规格（裁定 D-6）**
1. 门控：仅当 `process.env.OPENFEEL_TEST_MODE === '1'` 时读取以下变量；否则完全忽略。
2. 变量：
   - `OPENFEEL_TEST_LOCK_TIMEOUT_MS` → 覆盖 `timeoutMs` 默认值；
   - `OPENFEEL_TEST_LOCK_STALE_MS` → 覆盖 `staleMs` 默认值。
3. 解析：`Number(raw)` 且 `Number.isInteger(n) && n > 0` 才生效；非法/缺失 → 回落既有默认。
4. 优先级：调用点显式 `options.timeoutMs` / `options.staleMs` > env seam > 默认常量。
5. 读取位置：`withFileLock` **函数体内**（不得提为模块级常量，保证子进程/测试可注入；承 kb env 函数体内读模式）。
6. 生产影响：gate off 时零分支副作用；默认值 5000/3000ms 与算法逐字不变。

**E2E 用例（`test/cli/lock-timeout.test.ts`）**
- 前置：`dist` 存在（否则 `it.skipIf(!HAS_DIST)`；门禁先 build，收口要求 0 skipped）。
- fixture：临时项目 → `node bin/openfeel.js init --workspace-only --non-interactive` → `node bin/openfeel.js plan stage add v1.0.0-stage-01`（或等价 CLI 注册）。
- 预置锁：创建 `.openfeel/tmp/locks/flow.lock`（fresh mtime，内容任意合法 JSON）。
- 运行：`spawnSync(process.execPath, [BIN, 'archive', 'v1.0.0-stage-01', '--json'], { env: { ...隔离 env, OPENFEEL_LOG:'0', OPENFEEL_TEST_MODE:'1', OPENFEEL_TEST_LOCK_TIMEOUT_MS:'200', OPENFEEL_TEST_LOCK_STALE_MS:'60000' } })`。
- 断言：`status === 3`；stdout 可 `JSON.parse` 且为单文档；`Object.keys(doc)` = `['schemaVersion','error']`；`doc.error.code === 'INTERNAL_ERROR'`；`doc.error.kind === 'internal'`；`doc.error.message` 含「获取文件锁超时」；stderr 不含 envelope。
- 负向控制（单测层）：gate off 时同 env 不生效；`timeoutMs: 120 / staleMs: 60000` 的既有单测仍超时。
- 备选方案（不采用）：外部进程持续 touch mtime 使锁不过期——可行但依赖外部进程时序，确定性弱于 env seam。

**验收判据**
- [ ] gate off：`withFileLock` 默认值与行为逐字不变（单测 + 静态断言 env 读取受门控）。
- [ ] gate on + 合法值：`timeoutMs` / `staleMs` 按注入值生效。
- [ ] gate on + 非法值（0 / 负数 / 非整数 / 空串）：回落默认。
- [ ] 显式 `options` 覆盖 env seam。
- [ ] E2E 稳定通过（重复 3 次无抖动），并如实记录命令 / 版本 / 环境三要素。
- [ ] 生产路径（gate off）默认 5000/3000ms 不变。

### T4 `req` 内联过滤单点化（REV-97-006）

**文件**
- `src/commands/req.ts:241-243`（`req show`）、`:436-438`（`req set --workflow-mode`）。
- `test/commands/req.test.ts`：`req show --json.stages` 顺序/值；`req set --workflow-mode` 下发。
- `test/core/req.test.ts` 或新增静态断言：`src/commands/req.ts` 内联 `requirement_id` 过滤归零。

**实施要点**
1. `req show`：
   ```ts
   const stages = listLinkedStages(data, id).map((l) => l.id);
   ```
   保持 `data.stages` 键序、零聚合计算；输出 `stages` 仍为 `string[]`（不新增字段）。
2. `req set --workflow-mode`：
   ```ts
   const linked = listLinkedStages(data, id).map((l) => normalizeStageId(l.id) ?? l.id);
   ```
   保持既有的短名归一语义与 `onlyStages` 作用域；行为零变化。
3. `req split` 命令与 `splitRequirement` **零改动**（源码实测无 `requirement_id` 过滤）；core 引擎层 `allLinkedStagesDone` / `hasLinked` 等 done 判定原语**保留、不受影响**。
4. 头注/注释同步：`listLinkedStages` 为**命令层输出面 + 聚合投影**共用的唯一过滤单点；core 引擎层 done 判定原语不在本次单点范围。
5. REV-97-006 标签更正留痕：REV 原文写「req split」，基线 `87df0b7:src/commands/req.ts:426` 实际位于 `req set` 命令块；本阶段按实测落点并在承接表登记。

**验收判据**
- [ ] `req show --json.stages` 与 `listLinkedStages(data,id).map(l => l.id)` 同序同值；零关联为 `[]`。
- [ ] `req set --workflow-mode` 对关联阶段（含短名）下发结果与改动前一致（`syncConfigFieldToStages` 调用集合逐项相同）。
- [ ] `src/commands/req.ts` 中 `(s.requirement_id ?? null) ===` 内联表达式 **0 命中**；`listLinkedStages` 为**命令层输出面 + 聚合投影**的唯一过滤实现；core 引擎层 `allLinkedStagesDone` / `hasLinked` 保留、不受影响。
- [ ] `req split` / `splitRequirement` 零 diff；既有 `req` 测试全绿。

### T5 版本 1.2.3 收口（A/B/C/D/E）

> **收口纪律**：本任务组为阶段最终代码/文本改动；版本号写入后到阶段结束**不再引入业务代码改动**；T6 只做门禁与实测登记。

**A 类：手工载体（6 载体 / 8 文件 / 10 处）**
- `package.json:3`：`1.2.2` → `1.2.3`。
- `package-lock.json:3/:9`：`1.2.2` → `1.2.3`（**禁 `npm install` 重生成**；`:3211` 依赖自身版本禁改）。
- `.openfeel/config.yaml:7`：`1.2.2` → `1.2.3`（**单行 edit，禁整文件重写**）。
- `src/core/config.ts:436/:493`：`1.2.2` → `1.2.3`。
- `src/core/templates-data/agents-md/zh-CN.md:135` / `en.md:135`：`v1.2.2` → `v1.2.3`。
- `src/core/templates-data/claude/constraint/zh-CN.md:138` / `en.md:138`：`v1.2.2` → `v1.2.3`。

**B 类：双生成物**
- `templates-data/**` 改动（SKILL / agents-md / constraint）后，`npm run build` 重生成 `src/core/template-loader.ts` + `src/core/update.ts`；**禁手改**；build ×2 幂等；`git status --porcelain src/` 干净。

**C 类：传播载体**
- `CHANGELOG.md`：追加 `## [1.2.3] - 2026-10-17`。
  - Fixed：并发 JSON 退出统一（REV-95-009）；`--review-tier` help 文案（REV-98-003 第 6 项）；`req show` / `req set` 过滤单点化（REV-97-006）。
  - Changed：锁等待超时 E2E 测试钩子（test-only，非公开契约）；版本 1.2.3。
  - Compatibility：退出码 0/1/2 语义不变；33/34 JSON 契约不变；非 JSON 文案不变；存量 flow.json 零迁移。
- `README.md` / `README.zh-CN.md` / `README.en.md`：最新版本横幅/补丁节 → v1.2.3；测试计数按 T6 实测；v1.2.2 历史节保留。
- `docs/GETTING_STARTED.md:3` 快照 → v1.2.3；`:246` 注记改为「已于 v1.2.3 订正」；补丁速览。
- `docs/commands.md:3` 快照 → v1.2.3；`:239` 注记更新；错误封装节补并发退出统一说明。
- `docs/json-contract.md`：标题/口径 → v1.2.3；§14.1 补测试钩子与 E2E 证据；**§14.2 改为「已统一」**（JSON：emit → exitCode → return；非 JSON：`process.exit(2)` 不变）。
- `.openfeel/manual/**`：`index.md`（skill 快照版本）、`cli/commands.md`（版本快照 + 错误出口说明）、`core/json-contract.md`（v1.2.3 变更历史 + 不变量）、`core/fs.md`（测试钩子）、`core/req.md`（单点口径按需一行）。
- `src/core/templates-data/skills/openfeel-cli-usage/SKILL.md`：description / `:15` 快照行 / `:62` 订正条 / 新增 v1.2.3 修复条目。

**D 类：禁改 / 白名单**
- 历史阶段批注、依赖自身版本、`test/**` 注释、`docs/phase-*/**`、历史 REV / 计划 / 归档文件、`kb/**` 历史条目、`.openfeel/dev/**` 私域记忆。
- 历史文档节旧口径（README v1.2.1 节、SKILL v1.2.1 节）不回溯改；由 v1.2.3 订正条 supersede。
- 内容特征扫描（`rg "1\.2\.2|按模式派生|derived from the workflow mode"`）逐命中判 A/B/C/D/E；未判类 = 0。

**E 类：无载体**
- `docs/design-philosophy.md` 等非版本型文档；仅按需改。

**验收判据**
- [ ] A 类 10 处全部 `1.2.3`；`--version` 与 `--version --json` 的 `version` = `1.2.3`。
- [ ] B 类 build ×2 幂等；`git status --porcelain src/` 空（除 T5 明确纳入的源码改动）。
- [ ] C 类全部载体同步；`docs/json-contract.md` §14.2 已改为统一口径。
- [ ] D 类白名单逐条 file:line；未判类 0。
- [ ] 文档与 `--help` 实测一致（zh/en）。

### T6 门禁与验收

**命令**
- `npm run build` ×2；第二次运行后 `git status --porcelain src/` 无新增变化。
- `npm test`：0 failed / 0 skipped；登记实测文件数 / 用例数。
- `npx tsc --noEmit`：0。
- `node bin/openfeel.js lint i18n`：通过（登记键数）。
- `node bin/openfeel.js lint kb`：0 过期（登记引用数）。
- `node bin/openfeel.js --version`：`1.2.3`。
- E2E：`test/cli/lock-timeout.test.ts` 通过（dist 已构建，不得 skip）。

**零回归清单**
- [ ] 33 个成功 JSON 出口 / 34 个注册选项键集与键序不变（契约测试）。
- [ ] 退出码 0/1/2 语义不变；并发 JSON envelope 内容与 exit 2 不变。
- [ ] 非 JSON 并发 stderr 文案逐字不变。
- [ ] `req show` / `req set` / `req split` 人类与 JSON 输出不变。
- [ ] `flow advance` 缺省档位行为不变。
- [ ] 存量 `flow.json` 零迁移零注入（本阶段不触碰 flow.json；由 Feel 经 CLI 操作）。

## 三、依赖与执行顺序

- **阶段依赖**：无（flow.json `deps=[]`；上游 v1.2.2-stage-98 done/archived）。
- **阶段内任务依赖**：
  - T1 / T2 / T3 / T4 相互独立（文件域：错误层+调用点 / help+i18n / file-lock+测试 / req.ts+测试）。
  - **T5 硬依赖 T1~T4**：版本收口必须在全部代码/文案改动完成后执行。
  - **T6 硬依赖 T5**：门禁必须在版本写入与 build 之后执行。
- **建议执行序**：T1 → T2 → T3 → T4 → T5 → T6（单 executor 顺序执行；若并行，T5 仍须等待全部完成）。
- **op 级依赖**：由 openfeel-schemer 在 `stage-99/ops/deps.yaml` 细化；本计划仅给任务级顺序。

## 四、约束与红线

1. **范围锁定**：只做 T1~T4 四项转出项 + T5 版本收口；不新增功能、不加字段、不加配置键、不引第三方依赖。
2. **并发语义**：JSON 分支只改退出机制；envelope 形态、`kind=refusal`、exit 2、非 JSON 文案全部零改动。
3. **调用点纪律**：`handleConcurrentConflict` / `handleAddStageError` 后必须显式 return；禁止任何调用点落入通用错误分支。
4. **测试钩子**：仅 `OPENFEEL_TEST_MODE=1` 生效；不得新增公开 CLI 选项；不得改变生产默认值。
5. **req 单点（命令层输出面 + 聚合投影）**：`listLinkedStages` 为命令层输出面与聚合投影的唯一过滤实现；core 引擎层 `allLinkedStagesDone` / `hasLinked` 等 done 判定原语保留、不受影响；`req split` 零改动；输出键集/键序不变。
6. **help 文案**：只订正 help；`flow advance` 缺省行为不变；历史节不回溯改。
7. **版本收口**：T5 为最终任务组；版本写入后零业务代码改动；B 类双生成物禁手改；`package-lock.json` 禁 `npm install`；`config.yaml` 单行 edit。
8. **流程边界**：不直写 `flow.json`；不推进 phase；不 commit / push；不 `npm publish`；阶段注册/推进由 Feel 经 CLI 执行。
9. **外部项**：OUT-1 不在本阶段文件清单，不作为完成判据。

## 五、验收要点（fast 汇总）

| 项 | 判据 |
|----|------|
| T1 | JSON 并发：单 envelope + exitCode 2 + 不调 `process.exit`；非 JSON 逐字不变；8 调用点无 fallthrough |
| T2 | zh/en help 均为「缺省 full（零裁剪）」；行为不变；lint i18n 对称 |
| T3 | gate 语义单测全绿；E2E `INTERNAL_ERROR/internal/3` 稳定；生产默认不变 |
| T4 | `req show` / `req set` 行为零变化；内联过滤归零；`req split` 零 diff |
| T5 | A 类 10 处 = 1.2.3；B 类 build ×2 幂等；C 类文档同步；§14.2 已统一；`--version` = 1.2.3 |
| T6 | `npm test` 0 failed / 0 skipped；`tsc` 0；`lint i18n`；`lint kb` 0 过期；build ×2；零回归清单全过 |

## 六、风险与回滚

| # | 风险 | 影响 | 缓解 |
|:-:|------|------|------|
| R-1 | T1 返回类型改 `void` 后漏加 return → JSON 模式二次输出 / exit 1 | **高** | 8 调用点全枚举；handler 后显式 return；2 个 fallthrough 回归用例；静态 grep |
| R-2 | T3 env seam 泄漏为生产行为 | 中 | `OPENFEEL_TEST_MODE=1` 门控；非法值回落；显式 options 优先；文档标「非公开契约」 |
| R-3 | T5 收口遗漏载体 / 生成物漂移 | 中 | A 类 file:line + 内容扫描 + D 类白名单 + build ×2 + `--porcelain` |
| R-4 | REV-97-006 标签误导 | 中 | 计划写明实测落点 `req set`；`req split` 零 diff 验收 |
| R-5 | E2E 计时抖动 | 低 | timeout 200ms + stale 60000ms + fresh 锁；重复 3 次 |
| R-6 | 历史节旧文案误判 | 低 | D 类白名单显式登记 |

**回滚**：T1 恢复 `process.exit(2)`；T2 文案回退；T3 删除钩子与新增测试；T4 恢复内联 filter（纯等价）；T5 版本/文档回退。无数据格式破坏。

## 七、承接 REV 与遗留处置（三分）

| 来源 | 条目 | 处置 | 落点 |
|------|------|------|------|
| REV-95-009 | 并发 JSON 退出机制不一致 | **本阶段关闭（T1）** | `shared/errors.ts` + 调用点 + 测试 |
| REV-98-006① | 锁超时 E2E 不可稳定触发 | **本阶段关闭（T3）** | `file-lock.ts` 测试钩子 + E2E |
| REV-98-006② | DSH `errorFromResult` / `PHASE_AGENT` 镜像 | **转 OUT-1 外部项** | Feel 单独委派；不在本仓 stage 文件 |
| REV-98-003 第 6 项 | `--review-tier` 源码 help 陈旧 | **本阶段关闭（T2）** | `flow.ts` + i18n zh/en + 文档注记 |
| REV-97-006 | `req show` / 「req split」内联过滤 | **本阶段关闭（T4）**；实测第二处为 `req set --workflow-mode` | `req.ts` + 测试 |
| REV-95-008 | 锁超时归类 internal/3 | 已 closed（stage-97）；**本阶段补 E2E 证据** | `docs/json-contract.md` §14.1 |
| 其他 v1.2.2 REV | 95-001~007 / 96 / 97 其余 / 98-001~005 | 已 closed，无动作 | — |

> **OUT-1（仓库外）**：OpenFeel-DSH 适配器跟进——退役 `PHASE_AGENT` 镜像、消费 `flow next --json`、`errorFromResult` 透传 `kind`/`code`/`detail`、更新 DSH 测试并跑 verify。由 Feel 单独委派，**不纳入本阶段文件清单、不作为本阶段完成判据**。

## 八、修订记录

| 时间 | 制定人 | 说明 |
|------|--------|------|
| 2026-10-17 | openfeel-planner | 初稿：fast 轻量计划；T1~T6 任务表；源码实测 A1~A15；依赖/验收/约束/风险/承接齐备；OUT-1 外部项登记。**只写计划文档，未改源码、未直写 flow.json、未推进 phase。** |
