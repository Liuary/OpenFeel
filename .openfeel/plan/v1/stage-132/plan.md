# v1.6.0-stage-132 计划（REQ-055 ~ REQ-060 / full 模式）

> 来源：`overview.md`（阶段目标与事故映射）+ `.openfeel/tmp/stage-132/research/{req-body,plan-gate,dsh-dispatch,dev-ledger,prompt-adherence}.md`（只读输入，行号为证据）。
> 本文件是**执行前的拆解与判据**，不是进展报告；执行中变更按 §9 回写、§10 记录。
> 已锁定的用户裁定（不得改写）：① 门禁强度＝**硬门禁 + 允许 `--force` + 审计留痕**；② 主会话约束＝**只做派发台账 + 强提示，不做 guard 硬拦截**；③ 存量空壳正文＝**只拦下一次状态流转 + lint 列出**，不批量回填、不阻塞归档。

---

## 一、目标与判据

### 1.1 需求 → 判据映射

| 需求 | 判据 | 验收命令（在仓库根执行） | 通过条件 |
|------|------|--------------------------|----------|
| **REQ-055** 正文写实 | **A1** 正文可结构化写入 | `node bin/openfeel.js req body REQ-055 --section 摘要 --text "<≥40字>"` | exit 0；`## 摘要` 小节被替换，`## 目标与验收` 及其余 6 节**字节不变**（`git diff` 只含该节） |
| | **A2** 未写实不得流转（**2026-11-24 修订**，REV-016） | 对空壳需求 `node bin/openfeel.js req advance REQ-0NN --to scheduled\|in_progress\|done` | exit 1，**human 文案含 `req body` 修复指引** + **零写盘**（flow.json revision 不变）；~~`error.code='REQ_BODY_GATE'`、`error.detail.reason='body_empty'`、`detail.emptySections=['摘要','目标与验收']`~~ **不可取证**（该命令无 `--json` 出口，见 §十一 注）；`--force` 放行且写 `body_waiver` + `requirement_body_forced` 审计（A2b） |
| | **A2b** force 有审计 | 同一命令加 `--force` | exit 0；`flow.json.log` 末条 `action='requirement_body_forced'`，且该需求带 `body_waiver={at,by,reason}`；**再次**流转不再拦 |
| | **A2c** 认领**不**校验正文（**2026-11-24 修订**，REV-016） | 对空壳需求 `node bin/openfeel.js req claim REQ-0NN --owner t` | **exit 0**：`claim` **不校验正文**（认领≠开工，保证 `req add --claim` 原子成功），执行 `claimRequirement:484-497` 只写 `owner`/`claimed_at`；正文门首拦在 `→in_progress`（见 A2）；~~exit 1 `REQ_BODY_GATE`、`body_waiver` + `requirement_body_forced{gate:'claim'}`、同 owner 幂等不被拦~~ 不再适用（无门可放行，claim 不产生 `body_waiver`） |
| | **A3** lint 可枚举 | `node bin/openfeel.js lint req --json` | exit 0（advisory）；`fill.emptyBody` 列出全部空壳（含固定样本 `REQ-001`），`fill.emptyPlan` 列出无需求级计划的在办需求 |
| **REQ-056** 执行前有计划 | **A4** 无计划/占位计划不得进 exec | 阶段 `plan.md` 缺失**或为占位空壳**、或某在办需求无 `.openfeel/plan/reqs/REQ-NNN.plan.md` 时 `node bin/openfeel.js flow advance --stage v1.6.0-stage-NNN --to exec_running` | exit 1，`error.code='STAGE_PLAN_GATE'`，`detail={stagePlanMissing:bool, stagePlanUnfilled:bool, requirementsMissingPlan:[...], requirementsUnfilledPlan:[...]}`；revision 不变 |
| | **A4b** 占位计划被拒 | 把阶段 `plan.md` 写成只含 `- [ ] 待补充` / `（待补充）` 的 6 行壳，再执行 A4 命令 | exit 1 `STAGE_PLAN_GATE` 且 `detail.stagePlanUnfilled=true`（证明门是"存在**且写实**"，不是只查存在） |
| | **A5** 偏差回写可校验（挂 `→done`；**2026-11-24 修订**） | ① exec 后修改该需求计划文件；② `req review`+`req verify` 记 pass（**done 门先行**，否则返回 `invalid_status`）；③ `node bin/openfeel.js req advance REQ-0NN --to done` | ③ **退出码 1 + human 文案（`plan_deviation`）**；~~exit 1 `REQ_PLAN_DEVIATION`（`detail.reason='plan_deviation'`）~~ 该命令**无 `--json` 出口**，不登记 `errors.ts`（与 §1.2 / §十一 修订注一致）；补写 `## 偏差与回写` 实内容后 exit 0；`flow.json` 中 `requirements[].plan.sha256` 与 `sha256sum` 前 12 位一致 |
| | **A6** 计划门 force 留痕 | `flow advance --to exec_running --force` | exit 0；`flow.json.log` 末条 `detail.gate_overrides=['plan']` + `detail.gate_missing` 快照 |
| **REQ-057** 只调度 | **A7** 派发台账成立 | `feel_dispatch({stage, phase, targetAgent, role, goal, files, returnFormat})`；然后 `feel_status` | `.openfeel/dev/dispatch.jsonl` 增 1 行（字段齐全，`dispatchId` 唯一）；`feel_status.dispatch.records` ≥1；用 `write` 工具直写该文件 → guard `deny`；工具计数断言 13 → **15**；`feel_next().dispatch.goal` 不含 `<一句话目标` |
| **REQ-058** 模式收紧（**需求级**） | **A8** general 需求的强制链成立（**2026-11-24 修订**，REV-016） | ① `node bin/openfeel.js flow phases --mode general --json`；② 无阶段 general 需求缺计划时 `node bin/openfeel.js req advance REQ-0NN --to in_progress`；③ 补计划后同命令；④ `req review`+`req verify` 后 `req advance --to done` | ① `transitions` **仍为空**（阶段级语义不变，回归保护）；② exit 1 + 文案**明确指出** `.openfeel/plan/reqs/REQ-NNN.plan.md`（~~`error.code='REQ_PLAN_GATE'`~~ 无 `--json` 出口，不可取证），`--force` → 放行 + `plan_waiver` + `requirement_plan_forced` 审计；③ exit 0；④ 缺 `## 偏差与回写` 证据时 exit 1 + `plan deviation` 文案（~~`REQ_PLAN_DEVIATION`~~ 同②不可取证），补后 exit 0 |
| | **A8b** fast 阶段达标 | `node bin/openfeel.js flow advance --stage <无 plan.md 的 fast 阶段> --to exec_running` | exit 1 `STAGE_PLAN_GATE`（`fast` 表本就含 `plan_review`+`review`，补 T5 的说明门即达标，**不改表**） |
| **REQ-059** 账本持续更新 | **A9** 写操作后自动同步（**可 CLI 复现**） | `feel_stage action=set ...` / `feel_req action=advance ...` 后读 `.openfeel/dev/.sync.json.last_sync`；再 `feel_dev({action:'sync'})` | 时间戳前进且 `due=false`；`feel_dev` exit 0；`.openfeel/dev/current.md` 的 AUTO 块随写操作更新（不再等 `flow advance`） |
| | **A9b** `DEV_SYNC_STALE` 门（**仅单测可复现**，REV-009） | 单测：`test/core/flow-manager.test.ts` 注入 `syncDevStatus` 抛错（或把 `.openfeel/dev/` chmod 只读）后 `advanceStagePhase('...','done')` | 抛 `DEV_SYNC_STALE`；`allowGateOverride` 放行且 `detail.gate_overrides` 含 `'dev_sync'`。**正常路径不可 CLI 自然复现**（写出口已自动同步 ⇒ `due` 恒 false），故该门以单测 + 代码审查取证，A9 不冒充其证据 |
| **REQ-060** 提示词改造 | **A10** 提示词瘦身 + 每轮提醒 + 动作型 next | `node -e "import('./dsh/lib/surface/prompt.js').then(m=>{const s=m.renderFeelPrompt({language:'zh-CN',feelMode:{value:'enabled'}});console.log(s.length,s.split('\n').length)})"`（`renderFeelPrompt(options={})` 见 `prompt.js:28`；选项键以 `dsh/lib/index.js:252-290` 的实际装配为准） | ≤1200 字符且 ≤25 行；`dsh/test/verify.js` 提示段断言通过；`feel_status` 返回 `nextAction.kind ∈ {dispatch,command,idle}` |
| 阶段级 | **A11** 全量回归 | `npm test`；`npm run build`；`cd dsh && node test/contract.js && node test/verify.js && node test/guard.js && node test/integration.js && node test/preflight.js`；`node bin/openfeel.js lint i18n`；`node bin/openfeel.js lint req` | 全部 exit 0；`npm test` 0 fail 且用例数不低于基线 2400+ |
| 阶段级 | **A12** 文档一致 | 人工对照 `docs/commands.md`、`docs/json-contract.md`、`dsh/ADAPTER.md`、`dsh/README.md`、`docs/VERSIONS.md` | `req body`（含 `--json` **出口 #46**，基线先对齐到 45/46）/ `feel_dispatch` / `feel_dev` / general 需求链 / lint 新键 五处均有对等描述，无过时口径 |

### 1.2 判据纪律

- A 编号**只增不改**；作废写 `~~A7~~（作废：原因）`。
- 每条判据必须能被第三者用命令复现；"看起来对"不算通过。
- 失败的错误码是**契约**：`REQ_BODY_GATE`、`REQ_PLAN_GATE`、`REQ_PLAN_DEVIATION`、`STAGE_PLAN_GATE`、`DEV_SYNC_STALE`，均写入 §2 对应任务的 error code 映射，并进 `test/cli/error-envelope.test.ts`。**（2026-11-24 修订，REV-016）** 其中 `REQ_BODY_GATE` / `REQ_PLAN_GATE` / `REQ_PLAN_DEVIATION` **不登记** `src/core/errors.ts`（`req claim/advance/complete` 无 `--json` 出口，无 envelope 通道），判据改为 **human 文案 + exit 1 + 零写盘**；只有 `STAGE_PLAN_GATE` / `DEV_SYNC_STALE` 进 error-envelope 契约（详见 §十一 注）。

---

## 二、任务拆解

> 角色：`executor-a`＝CLI 线（`src/**` + `test/**`）；`executor-b`＝DSH 线（`dsh/**` + `docs/research/**`）；`Feel`＝状态写操作与派单；`reviewer`＝独立取证。
> 每个任务都按 `goal / context / boundaries / returnFormat` 四段可粘贴派发；派发时必须附 §4 判据单点与目标任务的验收命令。

### T1 判据单点模块（`filled.ts`）

- **做什么**：新建唯一"写实性"判定模块，并把既有占位常量迁入以消除两套标准；**两种正则语义必须分开保留**。
- **涉及文件**：新建 `src/core/plan/filled.ts`；改 `src/core/flow-manager.ts`（删本地 `:5231` 常量与 `:5239` 私有正则，改为从 `filled.ts` import；`isTemplateEmpty`/`detectFillState`（`:5242-5260`）实现体逐字不变，仍对**整段** `.test()`）；新建 `test/core/plan/filled.test.ts`。
- **API（§4 契约，逐字实现）**：`PLACEHOLDER_LITERALS`、`EMPTY_TEMPLATE_MARKER`、`EMPTY_TEMPLATE_LINE_LITERAL_RE`（**多行字面量语义，原样搬运**）、`PLACEHOLDER_LINE_RE`（**逐行 `m` 语义，新写**）、`MIN_FILLED_CHARS=40`、`extractSection`、`isSectionFilled`、`isRequirementBodyFilled`、`isRequirementPlanFilled`、`isStageOverviewFilled`、`isStagePlanFilled`。
- **两种正则的分工（REV-004 纠偏）**：
  - `EMPTY_TEMPLATE_LINE_LITERAL_RE = /(?:^|\n)[ \t]*-\s*\[\s*\]\s*待补充[ \t]*(?=\r?\n|$)/` —— 与现网 `flow-manager.ts:5239` **逐字相同**（原为正则对象字面量、非 `m` 模式），供 `isTemplateEmpty` 对整段内容做 `.test()`。**不得**改写成 `^…$`（那会退化为仅匹配首行/整串，`plan.ts:489`、`flow.ts:1557` 的 `fill` 语义会变）。
  - `PLACEHOLDER_LINE_RE = /^[ \t]*-\s*\[\s*\]\s*待补充[ \t]*$/m` —— **新写**，只用于"逐行过滤"场景（`isSectionFilled` 第 2 步逐行调用 `.test(line)`）；因按单行判定，`m` 语义与上者等价但实现独立。
  - 迁移断言（T1 必测）：① `isTemplateEmpty('前文 - [ ] 待补充 后文') === false`（BUG-005 不回归）；② `isTemplateEmpty('- [ ] 待补充\r\n') === true`（CRLF）；③ `isTemplateEmpty('  - [ ] 待补充  \n') === true`（缩进+尾空格）；④ `detectFillState` 三态输出与迁移前逐字相同；⑤ `plan.ts:489` / `flow.ts:1557` 的 `--json fill` 字段在既有夹具上不变。
- **负责角色**：executor-a。**依赖**：无。
- **验收**：`npx vitest run test/core/plan/filled.test.ts` 绿；`grep -c "EMPTY_TEMPLATE_MARKER =" src/` 只 1 处命中（`filled.ts`）；`grep -n "EMPTY_TEMPLATE_LINE_LITERAL_RE" src/` 命中 `filled.ts`（定义）+ `flow-manager.ts`（使用）；`npm test -- test/core/flow-manager.test.ts` 中 `T4.2`/`B3`/`B4` 组零改动通过。

### T2 `req body` 原语与命令

- **做什么**：给需求正文加**唯一更新入口**（当前零更新入口，`body-file.ts:79-87` 是"存在即 no-op"，是 48/54 空壳的结构性根因）。
- **涉及文件**：改 `src/core/req/body-file.ts`（新增 `parseBodySections(md)` 按 `## <标题>` 切节、`writeRequirementBodySection(projectPath, req, section, text, {replace})`：读→定位节→替换→`atomicWriteFileSync`；`writeRequirementBodySkeleton` 的 no-op 语义**保持**）；改 `src/core/req/types.ts`（`body_checked_at?`、`body_waiver?: {at,by,reason}` 三个可选字段，仿 `:134` `body_path?`）；改 `src/commands/req.ts`（在第 18 个子命令之后注册 `req body <id> --section <摘要|目标与验收> (--text <t>|--file <p>|--stdin) [--replace]`）；改 `src/core/i18n-data/zh-CN.ts` + `en.ts`（`help.req.body.*`、`req.body.*` 中英同批）。
- **`--json`（必须支持，与全仓契约一致）**：`req body` 注册 `--json`，成功出口形状 `withSchemaVersion({target:'req.body', ok, id, section, path, replaced, chars})`，失败走既有错误 envelope。
- **计数锁基线（REV-007 纠偏）**：现网因「`dev clean` 未登记」导致文档 **43/44** 与测试 **45/44** 漂移；**真实基线 = 注册 46 / 成功 45，出口止于 #45**。因此本任务分两步：
  1. **先对齐基线**：`docs/json-contract.md:3`（43 成功 → **45**）、`:104`/`:182-188` 对齐说明、`test/commands/knowledge.test.ts:384-401`（45/44 → **46/45**），并**补 #44（`dev clean`）/ #45 两行**出口条目（缺的就是它）。
  2. **再加新出口**：`req body` = **出口 #46** → 计数 **注册 47 / 成功 46**；`test/cli/json-contract.test.ts` 新增 `#46` 出口锁（不是 #42）。
  - 全部三处（doc 三行 + knowledge 计数 + json-contract 编号）必须与上一步同批提交，否则 `input` 计数锁红。
- **错误码**：需求不存在 → `not_found`；小节已写实且无 `--replace` → `body_section_not_empty`（exit 1）；小节名非法 → `invalid_field`。
- **负责角色**：executor-a。**依赖**：T1。**验收**：A1 命令；`test/commands/req.test.ts` 新用例绿；`node bin/openfeel.js lint i18n` exit 0。

### T3 空壳检测与 `lint req` 扩展

- **做什么**：把空壳变成可枚举清单（advisory，不改退出码——48 条存量不能让 lint 恒红）。
- **涉及文件**：新建 `src/core/req/body-lint.ts`（`lintRequirementBodies(projectPath, data, lang)` → `{emptyBody:[{id,emptySections}], emptyPlan:[{id}], missingBodyFile:[id]}`，`emptyPlan` 用 `findRequirementPlanPath(projectPath, id)` 全局解析；正文路径复用 `getRequirementBodyPath`，禁第二套派生）；改 `src/commands/lint.ts`（`:108-145` 的 `lint req` 输出加 `fill` 块，`withSchemaVersion({target:'req',ok,issues,suspects,unknownCount,suspectCount,fill})`）；改 `src/core/i18n-data/*`。
- **约束**：`fill` **不驱动 exit 1**（`:141-144` 的 A 类判定不动）；必须同批改 `test/commands/lint-req.test.ts:266`（C9 七键形状 → 八键）与 `docs/json-contract.md` #41 说明（该出口已有"多 3 键"先例 `json-contract.md:172`）。
- **负责角色**：executor-a。**依赖**：T1、T2。**验收**：A3；`test/core/req/body-lint.test.ts`、`test/commands/lint-req.test.ts` 绿。

### T4 需求正文门（claim / 流转）

- **做什么**：未写实不得 claim/启动/推进；硬门 + `--force` + 审计。
- **错误返回通道（REV-002 方案 A，写死）**：`applyStatusChange`（`requirement-ops.ts:529`）当前返回 `boolean`，唯一调用点 `:593` 把 `false` 一律映射 `invalid_status`，新码无通道。**改签名**为 `RequirementGateCode | null`（`null`=成功；`'invalid_status' | 'body_empty' | 'plan_missing' | 'plan_deviation'`），`:593` 改为 `const gate = applyStatusChange(...); if (gate) return { ok:false, code: gate };`。
  - **影响面（穷举）**：① `applyStatusChange` 内部 5 处 `return false` → 分别改为 `return 'invalid_status'`（`:530/:531/:534` 域/流转非法、`:536` done 门不满足）与新增门的码；② `:593` 单点映射；③ `updateRequirement`/`advanceRequirement`（`:626-628`）/`completeRequirement` 的返回类型 `RequirementOpResult` **不变**（仍 `{ok:false, code}`）；④ **既有行为不退化**：done 门不满足仍返回 `invalid_status`（`test/core/req.test.ts` 的 `T027.1`（`:1722`）与命令层文案零改动）；⑤ 命令层错误码映射表补三项 → envelope `REQ_BODY_GATE` / `REQ_PLAN_GATE` / `REQ_PLAN_DEVIATION`。
- **claim 门（REV-003，写死）**：`claimRequirement`（`:484-497`）**不经过** `applyStatusChange`、只写 `owner/claimed_at`，必须在函数内**直接调用同一谓词** `isRequirementBodyFilled`（不新写判据）：
  - 插入点：`:489`（终态拒绝）与 `:490`（他人占用）之后、`:491`（同 owner 幂等）**之后**、`:492`（`req.owner = name`）**之前**——即幂等重认领不被拦，首次占用才判。
  - 不满足 → `{ ok:false, code:'body_empty' }`（零变更零审计，与 `:490` 同风格）。
  - `--force`（`req claim --force`）→ 写 `req.body_waiver={at,by,reason:'claim-force'}` + `appendRequirementLog(data,'requirement_body_forced',{id,by,gate:'claim'})` 后照常占用。
  - 新用例 **A2c**（见 §1.1）。
- **涉及文件**：改 `src/core/req/requirement-ops.ts`（`RequirementErrorCode` `:20-27` 加 `'body_empty'`；新增 `requirementBodyBlocker(data, req, targetStatus): 'body_empty' | null`；`applyStatusChange` 签名与 `:593` 映射；`claimRequirement` 内嵌 claim 门；**`requirementDoneBlocker` `:196-211` 与 `RequirementDoneBlocker` `:184` 一字不改**）；改 `src/commands/req.ts`（`:116-126` `doneGateMessage` 同族新增 `bodyGateMessage`；`claim`/`advance`/`complete` 增加 `--force` 选项并在 force 时写 `req.body_waiver` + 审计）；改 `src/core/i18n-data/*`；改 `test/core/req.test.ts`、`test/commands/req.test.ts`。
- **门触发集合（写死）**：`targetStatus ∈ {scheduled, in_progress, done}`，且 `req.body_waiver === undefined`。**排除** `draft/blocked/cancelled/rejected`；**不按模式分支**——`workflow_mode === 'general'` 与零关联阶段的需求**同样生效**（不能因为无阶段就跳过正文门）；**不进入** `requirementDoneBlocker`，因此 `describeStageDoneGate`（`flow-manager.ts:1936-1955`）与归档判据**完全不受影响**（满足"不阻塞归档"）。
- **判据唯一性**：`isRequirementBodyFilled` 只在 `body-lint.ts` 定义；调用点恰为 `requirementBodyBlocker`（T4）、`claimRequirement`（T4）、`lintRequirementBodies`（T3）。reviewer 用 `grep -rn "isRequirementBodyFilled" src/` 断言命中 ≤3 处。
- **负责角色**：executor-a。**依赖**：T3（复用 `isRequirementBodyFilled`）。**验收**：A2、A2b；`test/core/req.test.ts` 的 `T027.1 done 门三态`（`:1722`）与 `test/core/flow-manager.test.ts:5453` 的 done 门穷举**逐字不变**通过（证明没把 body 混进 done 门）。

### T5 阶段计划门（`exec_running` 前进）

- **做什么**：进入 `exec_running` 前，阶段 `plan.md` 与每个在办需求的 `REQ-NNN.plan.md` 必须存在且写实；硬门 + `--force` + 审计。
- **涉及文件**：
  - 改 `src/core/plan/path.ts`：新增 `findStagePlanPath(projectPath, stageId)`（**照抄** `findStageStatusPath` `:434-465` 的三级回退 series/stageDir 归一）与 `findRequirementPlanPath(projectPath, reqId)`（**全局单一位置** `.openfeel/plan/reqs/REQ-NNN.plan.md`，不随阶段/版本漂移——`rollover` 后计划仍在；目录按需 mkdir，`getRequirementPlanRelPath(id)` 同为 POSIX 相对路径单点）。
  - 改 `src/core/flow-manager.ts`：新增 `describeStagePlanGate(stageName): StagePlanGate`（**与 `describeStageDoneGate` `:1936-1955` 同形**：`{stagePlanMissing:boolean, stagePlanUnfilled:boolean, requirementsMissingPlan:string[], requirementsUnfilledPlan:string[]}`，需求侧用 `findRequirementPlanPath` 全局解析、用 `isRequirementPlanFilled` 判写实；阶段侧用 `findStagePlanPath` + `isStagePlanFilled`）+ `formatStagePlanGate`；插入点＝**`advanceStagePhase` 的 `:1844`（done 门之后）与 `:1846`（写盘）之间**，条件 `targetPhase === 'exec_running' && fromPhase !== 'exec_running'`；`opts` 增 `allowGateOverride?: boolean`；`appendLog` 的 `detail`（`:1888-1898`）追加 `...(forced ? {gate_overrides:['plan'], gate_missing:gate} : {})`；`resetStagePhase`（`:2044-2122`）对 `to==='exec_running'` 复检同一谓词（否则复位是绕过口）。
  - 改 `src/commands/flow.ts`：`:1259-1276` 旁新增同谓词镜像（`--json` 失败 `error.code='STAGE_PLAN_GATE'`，`detail` 同上）；`:1304` 调 `advanceStagePhase` 时传 `allowGateOverride: options.force === true`；`:3013`（wizard）**不传**（交互可重试）。
  - 改 `src/core/i18n-data/*`；改 `test/core/flow-manager.test.ts`、`test/commands/flow.test.ts`。
- **写实判据（REV-008）**：门是「存在**且写实**」——阶段 `plan.md` 缺失 → `stagePlanMissing`；存在但 `isStagePlanFilled` 为假 → `stagePlanUnfilled`；需求计划同理分 `requirementsMissingPlan` / `requirementsUnfilledPlan`。判据函数全部来自 `filled.ts`，门内**不写**第二份字数/占位规则。
- **复位路径（REV-005 + 裁定①，写死）**：`flow stage reset <stage> --to exec_running`（`flow.ts:941-947` → `resetStagePhase` `flow-manager.ts:2044`）**补 `--force`**，与 exec 门同一口径：`--force` → 传 `allowGateOverride:true`、审计落 `flow.json.log` 的 `reset_stage_phase` 条目 `detail.gate_overrides=['plan']` + `detail.gate_missing` 快照；**不加 `--force` → 拒绝**（零写盘）并提示两条出路（补计划文件 / 加 `--force`）。三处改动面：`resetStagePhase` 签名加 `opts?:{allowGateOverride?:boolean}`、`flow.ts:941-947` 加 `--force` 选项并透传、`appendLog` 同一 `gate_overrides` 字段。
- **为什么必须挂在核心层**：`--force` 在 `flow.ts:1134` 直接跳过 `findPhasePath` 路径校验，命令层镜像可被绕过；只有 `advanceStagePhase` 是**唯一阶段相位写入口**（`flow.ts:1304` 与 `:3013` 都委托它）。
- **审计落点**：`flow.json.log`（`appendLog`，保留 200 条）+ `flow.json` 内 `stages[*]` 不变；**不新建状态文件**。
- **负责角色**：executor-a。**依赖**：T1、T2。**验收**：A4、A4b、A6；`test/core/flow-manager.test.ts` 新用例绿。

### T6 计划偏差回写（可校验证据）

- **做什么**：执行后计划被改动，必须留下可机器校验的偏差记录。
- **挂载点（REV-001 纠偏）**：需求状态域只有 `draft/scheduled/in_progress/done/blocked/cancelled/rejected`（`requirement-ops.ts:512-518`），**没有 `review_pending`**。因此偏差门挂在 **`targetStatus === 'done'`**，与计划门同谓词族；顺序＝正文门 → 计划门 → **done 门（review+verify，`canCompleteRequirement`）** → **偏差门**。即 review/verify **必须先记录为 pass**，否则先得到 `invalid_status`（既有行为不变）；两者都 pass 后再判偏差证据。
- **涉及文件**：改 `src/core/req/types.ts`（`RequirementData.plan?: {path:string, sha256:string, recorded_at:string, deviations?:number}`，仿 `verification?` `:142`；`path` 恒为 `.openfeel/plan/reqs/REQ-NNN.plan.md` 的 POSIX 相对路径）；改 `src/core/flow-manager.ts`（T5 的门**通过时**对每个在办需求按 `findRequirementPlanPath` 盖章 `req.plan={path,sha256(前12位),recorded_at}`——只在放行路径写，拒绝路径零写盘）；改 `src/core/req/requirement-ops.ts`（`RequirementErrorCode` 加 `'plan_deviation'`；`applyStatusChange` 在 `to==='done'` **且** done 门已通过之后调用 `planDeviationBlocker(req)`：用 `findRequirementPlanPath` 重算 `sha256` 前 12 位比对 `req.plan.sha256`，不等且计划文件 `## 偏差与回写` 未写实 → 返回 `'plan_deviation'`；`req.plan.recorded_at` 缺失（从未过 exec 门）→ 同样 `'plan_deviation'`）；改 `src/commands/req.ts`（文案 + `--force` 写 `req.plan.deviations += 1` + `appendRequirementLog('requirement_plan_deviation_forced')`）；改 `src/core/i18n-data/*`。
- **负责角色**：executor-a。**依赖**：T5。**验收**：A5；用例 `偏差：done 前改计划未回写 → plan_deviation 且零写盘`、`补 ## 偏差与回写 → 放行`、`done 门先于偏差门：缺 review → invalid_status`。

### T7 general 需求的强制链（需求生命周期，**不改阶段表**）

- **为什么阶段表不改（纠偏记录）**：`general` 在**写入面**就被拒绝用于阶段（`src/commands/stage.ts:559-561`、`src/commands/plan.ts:75-77`，config 注释「仅需求级合法」），所以给阶段加 `GENERAL_TRANSITIONS` **没有消费者、是死代码**，反而不满足 REQ-058。`resolveTransitionsForMode`（`flow-manager.ts:2757-2769`）的 `general → raw={}` **保留**，`flow phases --mode general` 空表语义不变，`test/core/flow-manager.test.ts:5857/5887/6202`、`test/commands/flow.test.ts:3730/3743/3750/3769/3787` **零改动**。`fast` 阶段表已含 `plan_review` + `review`，补上 T5 的计划门即达标，同样不改表。
- **做什么**：把 plan → exec → review 的强制链落在**需求生命周期**上（general 无阶段时这是执行前唯一可挂点）。
- **涉及文件**：
  - 改 `src/core/req/requirement-ops.ts`：`RequirementErrorCode` 加 `'plan_missing'`；新增 `requirementPlanBlocker(data, req, targetStatus): 'plan_missing' | 'plan_deviation' | null`。
    - 适用对象＝**没有阶段门兜底的需求**（裁定②，三种组合写死）：① `workflow_mode==='general'`（有/无阶段均适用）；② `fast`/`full` 且关联阶段数 === 0；③ 有阶段的 `full`/`fast` → **本门返回 null**（交给 T5 阶段 exec 门），避免双判与重复文案。
    - `targetStatus === 'in_progress'`（含 claim/start）：`findRequirementPlanPath` 不存在或 `isRequirementPlanFilled` 为假 → `plan_missing`。
    - `targetStatus === 'done'`：计划存在性（同上）＋复用 T6 的偏差谓词——`req.plan.recorded_at` 缺失或 `sha256` 与当前计划不一致且 `## 偏差与回写` 未写实 → `plan_deviation`（保证 done 前的"计划回写证据"）。
    - **`requirementDoneBlocker` `:196-211` 与 done 的 review+verify 判据一字不改**——本门是**在其之前**的独立前置检查。
  - 改 `src/commands/req.ts`：`:116-126` 同族新增 `planGateMessage`；`claim`/`advance`/`complete` 复用 T4 已加的 `--force`，force 写 `req.plan_waiver={at,by,reason}` + `appendRequirementLog('requirement_plan_forced')`。
  - 改 `src/core/i18n-data/*`；改 `test/core/req.test.ts`、`test/commands/req.test.ts`。
- **与 T4 的关系**：正文门（T4）与计划门（本任务）**都按需求判定、都覆盖 general/零阶段**，顺序＝正文 → 计划 → review/verify；两者都**不进入** `requirementDoneBlocker`。
- **`RequirementErrorCode` 演进**：冻结联合 7 值 → **10 值**（本阶段新增 `body_empty`(T4) / `plan_deviation`(T6) / `plan_missing`(T7)），含义须写进 `requirement-ops.ts:20-27` 注释，并补各调用点 `failCode` 映射；三者对应 envelope 码 `REQ_BODY_GATE` / `REQ_PLAN_DEVIATION` / `REQ_PLAN_GATE`。
- **负责角色**：executor-a。**依赖**：T6（复用 sha256/偏差谓词与 `--force` 通道；同文件 `requirement-ops.ts` 串行）。**验收**：A8、A8b。

### T8 开发账本自动同步

- **做什么**：`dev/` 与 `dev_last.md` 在需求/阶段写操作后**自动**同步；`statusSync.due` 从"只提示"变成"服务端自动执行 + 到 done 前硬门"。
- **涉及文件**：改 `src/core/dev-status.ts`（新增 `maybeSyncDevStatus(projectPath): {synced:boolean, due:boolean, error?:string}`：`due||isSyncNodePhase` 时调 `syncDevStatus`，**异常不再吞**——返回 `error`，由调用方输出一行 stderr）；改 `src/commands/flow.ts`（`:1391-1400` 改为调 `maybeSyncDevStatus`，失败 `console.warn`）；改 `src/commands/stage.ts`（`stage set`/`stage task`/`stage verify` 成功出口各调一次）；改 `src/commands/req.ts`（`advance`/`complete`/`review`/`verify`/`body` 成功出口各调一次）；改 `src/core/flow-manager.ts`（`advanceStagePhase` 在 `:1844` 后新增 `devSyncStale` 检查：`targetPhase==='done' && fromPhase!=='done'` 且 `getDevStatus().due===true` → 抛 `DEV_SYNC_STALE`；**顺序保证：门之前必须先跑一次 `maybeSyncDevStatus`**——`advanceStagePhase` 入口先同步、再判 `due`，正常路径（同步成功）不会触发该门，只有同步失败/落盘不可写才会拦；`describeStageDoneGate` `:1936-1955` **不动**；同一 `allowGateOverride` 放行并在 `detail.gate_overrides` 追加 `'dev_sync'`）；改 `src/core/i18n-data/*`。
- **为什么不会误拦**：自动同步挂在**所有写成功出口**（`stage set` / `req advance` / `flow advance`），因此到达 `archiving→done` 时 `due` 必已被刷新为 false；该门只在"同步本身失败"时生效，且失败原因会被 `error` 带回（不再是静默 try/catch）。
- **成本控制**：`blockChanged()`（`dev-status.ts:244-256`）已保证状态未变不重写；自动同步只在**写成功出口**调用，读命令不调。
- **可验证性（REV-009）**：`DEV_SYNC_STALE` **无法用正常 CLI 序列自然复现**（同步成功即 `due=false`）。T8 必须交付**构造法单测**：① 注入/mock 让 `syncDevStatus` 抛错后再 `advanceStagePhase('…','done')`；② 或把临时工作区 `.openfeel/dev/` 置只读再触发 done。判据 A9b 只认这两条路径，**不得**以"理论上会拦"充数。
- **负责角色**：executor-a。**依赖**：T7（同文件串行）。**验收**：A9（自动同步，可 CLI 复现）+ A9b（门，单测复现）；`test/core/dev-status.test.ts` 新增"自动触发"用例；补 `src/commands/flow.ts:1393-1400` 的零覆盖缺口。

### T9 DSH 工具面：派发台账 + `feel_dev` + `feel_req body`

- **做什么**：把"派发"变成有记录的动作；把提示里的死指令换成可执行工具；给正文写入开一条适配器通道。
- **涉及文件**：
  - 新建 `dsh/lib/adapters/dispatch-ledger.js`（读写 `.openfeel/dev/dispatch.jsonl`，仿 `sessions.js:121-163` 的原子 temp+rename；行 schema 见 §5.4；24h prune、上限 200 行）。
  - 新建 `dsh/lib/adapters/next-action.js`（`deriveNextAction(snapshot)` 纯函数 → `{kind, tool, goal, prompt, reason}`；`kind ∈ dispatch|command|idle`）。
  - 改 `dsh/lib/tools/index.js`（**唯一写者**）：`feel_dispatch` 定义 + 入 `:1668` 数组；`feel_dev`（`action: sync|status` → `cli.write(['dev','sync'])` / `cli.json(['dev','status'])`）；`feel_req` 的 `parameters.action` 枚举 `:868` 加 `body`、参数 `:869-896` 加 `section/text/file/force`、`execute` switch `:904-1146` 加 `body` 走 `cli.write`；`feel_status` 增 `dispatch:{required,records,missing}` 段与 `nextAction` 字段（**保留** `next` 字符串键以不破坏既有断言，内容改动作型文案）；`feel_next` 的 `dispatch` 用真实 stage/phase/agent 填充（配合 `dispatch.js`）。
  - 改 `dsh/lib/adapters/dispatch.js`（`:12-35` 用真实 `snapshot.focus`/目标 agent 填 `goal`/`boundaries.write`，去掉 `<一句话目标…>` 占位）。
  - 改 `dsh/lib/guard.js`（`PROTECTED_OPENFEEL_PATHS` `:674-692` 加一条 **`{match:'file', segments:['dev','dispatch.jsonl'], hint:…}`**——名单真实结构是 `{match:'file'|'dir'|'md', segments, hint}`，**不是** `{path,kind}`，仿 `:687`（`dev/guard-state.json`）与 `:688`（`log/guard-audit.jsonl`）；匹配实现 `matchProtectedEntries` `:765-780`/`matchProtectedPath` `:793-816` 无需改。审计记录 `:481-497` 增 `origin`/`delegationDepth` 字段——**读取方式未验证**（研究仅确认 DSH `SessionHeader` 有 `origin?:'subagent'`/`delegationDepth`，适配器现只读 `session.header.cwd`）；T9 第一步做 20 行 spike，不可读则省略这两个字段并记入 `ADAPTER.md`，**不得**因此改审计 schema 版本。`PROTECTED_HINTS.requirements` `:749-752` 文案改为"用 `feel_req action=body`"）。**不加角色门**（用户裁定 ②）。
  - 改 `dsh/test/contract.js`（`:126-128` 13→15）、`dsh/test/verify.js`（`:232-234` size 13→15 + 新行为断言）、`dsh/test/integration.js`（`:25-39` `EXPECTED_TOOLS`、`:229` 计数）、`dsh/test/guard.js`（新用例）。
- **负责角色**：executor-b。**依赖**：T2（`feel_req body` 需 `req body` 已存在）。**验收**：A7；`cd dsh && node test/contract.js && node test/verify.js && node test/guard.js && node test/integration.js` 全 exit 0。

### T10 DSH 提示词重写 + 运行时提醒

- **做什么**：把 5008 字符/79 行/13 节的提示压到 ≤1200 字符/≤25 行，并让"该派发"出现在决策点。
- **涉及文件**：
  - 改 `dsh/lib/surface/prompt.js`（`renderChinese` `:152-239` 与 `renderEnglish` `:246-326` 按 §5.1/§5.2 重写；`FEEL_PROMPT_NAME`/`FEEL_PROMPT_ORDER` `:14/:17` 不变；Free Mode 附录 `:43-71` 压到 ≤120 字符）。
  - 同源副本同步（否则再次分叉，`prompt-adherence.md` §4 T1 代价）：`src/core/template-loader.ts`（`:151`、`:1104`）、`src/core/templates-data/claude/agents/*/feel.md`（`:141`）、`src/core/templates-data/opencode/agents/*/feel.md`（`:132`）。
  - 改 `dsh/lib/index.js`（**唯一写者**）：`:244-292` 装配函数内注入每轮提醒（首选 `ctx.tools.post-execute` + `additionalContexts`，范式 `dsh-repeat-tool-reminder/src/index.ts:221-226`；**第 1 步先做 30 行 spike 验证该 API 在适配器侧可用**，结果写入 `dsh/ADAPTER.md` 表格；不可用则降级 §5.3）。
- **负责角色**：executor-b。**依赖**：T9（`next-action.js`/`tools/index.js` 已就位；`dsh/lib/index.js` 本任务独立写者）。**验收**：A10；`node dsh/test/verify.js` 提示段断言（`:246-260`、`:851-894`）更新后通过。

### T11 研究结论落 `docs/research/`

- **做什么**：把五份调研摘要转成可长期引用的研究文档（REQ-060 "研究结论写入 `docs/research/`"）。
- **涉及文件**：新建 `docs/research/req-body-gate-2026-11-24.md`、`plan-gate-2026-11-24.md`、`dsh-dispatch-2026-11-24.md`、`dev-ledger-2026-11-24.md`、`prompt-adherence-2026-11-24.md`（各含 `## 结论` + `## 证据（文件:行号）` + `## 未验证项`）。
- **负责角色**：executor-b。**依赖**：无（与 CLI 线并行，**新文件零冲突**）。**验收**：5 份文件存在；每份 ≥40 行且含 ≥5 条 `文件:行号` 证据。

### T12 本阶段自身写实（REQ-055 首个验收样本）

- **做什么**：给本阶段 6 个需求补写正文、给 6 个需求建计划文件、补 `overview.md` 的 `## 关联需求` 与 `## 验收`（现只列 4 条，缺 REQ-059/060）。
- **怎么执行（命令即验收）**：
  1. 正文走**新命令的 DSH 通道**（`.openfeel/requirements/*.md` 是 guard 受保护路径，agent 工具直写会被拒；shell 跑 openfeel 写命令亦被拒 `guard.js:3398-3399`）——逐条两次调用：
     `feel_req action=body id=REQ-055 section=摘要 text="<≤200 字，说明问题、现状证据、交付物>"`
     `feel_req action=body id=REQ-055 section=目标与验收 text="- A1 …\n- A2 …（≥2 条带命令的判据）"`
     （REQ-055…REQ-060 共 12 次调用；也可先落 `.openfeel/tmp/stage-132/draft/REQ-055.摘要.md` 再 `feel_req action=body ... file=...`。）
  2. 需求级计划文件用 `write` 工具直写（`.openfeel/plan/**` 不受保护，可用 `mkdir -p` 建新目录）：**全局固定路径** `.openfeel/plan/reqs/REQ-NNN.plan.md`（不随阶段/版本漂移，`rollover` 后仍在），小节固定 `## 目标` / `## 任务拆解` / `## 验收判据` / `## 偏差与回写`。
  3. `overview.md` 用 `edit` 补 `## 关联需求` 两条与 `## 验收` 的 E6/E7。
- **负责角色**：Feel（唯一允许写状态的一方）。**依赖**：T3（lint 取证）、T9（`feel_req body` 通道）。**验收**：A1（对 REQ-055 实测）+ A3 中本阶段 6 条不再出现在 `fill.emptyBody`；A4 中本阶段 6 条不再出现在 `requirementsMissingPlan`。

### T13 文档与 i18n 全量对账

- **做什么**：让文档与实现一致（A12），并确保 i18n 键集对等。
- **涉及文件**：`docs/commands.md`（`req body` 含 `--json` / `flow advance` 新门 / general **需求级**强制链与"阶段表为何不变"）、`docs/json-contract.md`（`req body` 第 **46** 出口 + `lint req` 新 `fill` 键；`:3`、`:104`、`:182-188` 三处计数与对齐说明；补登 #44/#45、新增 #46 说明）、`docs/VERSIONS.md`、`docs/GETTING_STARTED.md`、`dsh/ADAPTER.md`（工具数 13→15、门禁分层、post-execute 可用性表）、`dsh/README.md`（`:137-139/:148/:298/:320`）、`src/core/templates-data/skills/openfeel-delegation/SKILL.md`（`:17-28` 派发信封）。**不动** `dsh/docs/compat/*.md` 六份（`dsh-dispatch.md` §7：它们是冻结在 v1.2.1 的 CLI 逆向规格）。
- **负责角色**：executor-b。**依赖**：T1–T12 全部代码就绪。**验收**：A11 的 `lint i18n` exit 0 + A12 人工对照五项。

### T14 独立审查与取证

- **做什么**：逐条复现 A1–A12（含 A2b/A2c/A4b/A8b/A9b），重点抽查"绕过面"：force 路径是否留痕（`flow advance` 与 `flow stage reset` 两处 `gate_overrides`）、`resetStagePhase` 是否与 exec 门同口径、命令层镜像是否与核心层同判据、`grep` 断言是否有第二份写实判定、`applyStatusChange` 返回码是否单点、`claimRequirement` 是否真的调了同一谓词。
- **禁止**：只读代码不看命令输出；不得以"计划里写过了"作为证据；A9b 只认构造法单测，不接受"理论上会拦"。
- **负责角色**：reviewer（独立，非 T1–T13 作者）。**依赖**：T13。**产出**：`.openfeel/plan/v1/stage-132/review.md`（每条 A 附命令 + 输出片段 + 结论），blocking 项开 REV。
- **验收**：A1–A12（含 5 条 b/c 细分）全部有命令级或单测级证据；无 blocking open REV。

---

## 三、门禁设计（函数 / 插入点 / force / 审计）

| 门 | 谓词单点（禁第二份） | 核心层插入点 | 命令层镜像与文案 | `--force` 语义 | 审计落点 |
|----|----------------------|--------------|------------------|----------------|----------|
| 正文写实（claim） | `isRequirementBodyFilled()` + `claimRequirement` 内嵌调用 | `requirement-ops.ts:484-497`，插在 `:491`（同 owner 幂等）之后、`:492`（`req.owner = name`）之前；**不经** `applyStatusChange` | `req.ts` claim 分支同名文案；`error.code='REQ_BODY_GATE'` | `req claim --force` → 写 `body_waiver` + `gate:'claim'` | `appendRequirementLog('requirement_body_forced')` |
| 正文写实（流转） | `requirementBodyBlocker()`（`requirement-ops.ts`） | `applyStatusChange:529-542`，在 `:536`（done 门）之前 | `req.ts:116-126` 新增 `bodyGateMessage`；`error.code='REQ_BODY_GATE'` | `req advance/complete --force` → 写 `body_waiver` | `appendRequirementLog('requirement_body_forced')` → `flow.json.log` |
| 执行前有计划（存在**且**写实） | `describeStagePlanGate()`（`flow-manager.ts`，仿 `:1936-1955`） | `advanceStagePhase` **`:1844` 之后、`:1846` 之前**；条件 `target==='exec_running' && from!=='exec_running'` | `flow.ts:1259-1276` 旁镜；`error.code='STAGE_PLAN_GATE'` | `advanceStagePhase(..., {allowGateOverride:true})`（`flow.ts:1304` 传 `--force`） | `appendLog` detail `:1888-1898` 增 `gate_overrides/gate_missing` |
| 相位复位绕过 | 同上（复用同一函数） | `flow stage reset <stage> --to exec_running`（`flow.ts:941-947`）→ `resetStagePhase:2044-2122` 复检同一谓词；`resetStagePhase` 加 `opts.allowGateOverride` | 同文案 + 两条出路提示（补计划 / 加 `--force`） | **有 `--force`**（裁定①）：`--force` → `allowGateOverride:true`，`gate_overrides:['plan']` + `gate_missing` 落 `reset_stage_phase` 条目；不加 → 拒绝（零写盘） | `appendLog` 的 `reset_stage_phase` `detail.gate_overrides/gate_missing`（与 exec 门同口径） |
| 需求级计划（无阶段兜底） | `requirementPlanBlocker()`（`requirement-ops.ts`） | `applyStatusChange` 内判 `in_progress` 前置。**适用面（裁定②，写死三种组合）**：① `general` 需求（有/无阶段均适用）；② `fast`/`full` 且**关联阶段数 === 0**；③ 有阶段的 `full`/`fast` 需求**不在此门**（由 T5 的阶段 exec 门覆盖），但若其关联阶段尚未进 `exec_running`，`in_progress` 仍由既有 `stage_phase` 类约束把关——**本门不重复判** | `req.ts:116-126` 新增 `planGateMessage`；`error.code='REQ_PLAN_GATE'` | `req claim/advance/complete --force` → 写 `plan_waiver` | `appendRequirementLog('requirement_plan_forced')` |
| 计划偏差 | `planDeviationBlocker()`（`requirement-ops.ts`） | `applyStatusChange` 中 `to==='done'` **且 done 门已通过之后**（review/verify 先行） | `error.code='REQ_PLAN_DEVIATION'` | `req advance --force` → `plan.deviations += 1` | `appendRequirementLog('requirement_plan_deviation_forced')` |
| 账本陈旧 | `getDevStatus().due`（`dev-status.ts:143-164`）；**先** `maybeSyncDevStatus()` 再判 | `advanceStagePhase` 入口先同步；`:1844` 后判 `due`，条件 `target==='done' && from!=='done'` | `error.code='DEV_SYNC_STALE'` | 同一 `allowGateOverride`，`gate_overrides` 加 `'dev_sync'` | 同上 |
| 模式（**不改阶段表**） | `resolveTransitionsForMode:2757-2769` 的 `general → {}` **保留** | 需求生命周期（见上两行）；阶段级 general 在写入面即被拒（`stage.ts:559-561`、`plan.ts:75-77`），无表可改 | `flow.ts:1147-1156` general 文案**保持**（防御拒绝仍是正确的） | 不适用 | 无 |

三条硬约束的解释：

1. **核心层挂载优先于命令层**：`--force` 在 `flow.ts:1134` 跳过 `findPhasePath`，wizard（`:3013`）另走一条路；只有 `advanceStagePhase` 覆盖两条路径（`flow-manager.ts:1782` 是唯一相位写入口）。命令层镜像只负责 `--json` 的 `error.code`/`detail` 形状，**不承担拦截**。
2. **`--force` 不是绕过而是留痕放行**：`allowGateOverride` 只由命令层显式传入（`flow advance` 与 `flow stage reset` 各一处）；核心层放行时**必须**同时写 `gate_overrides` 与 `gate_missing` 快照，保证 `flow.json.log` 里能回答"是谁在什么缺项下推进/复位的"。`resetStagePhase` 只在显式 `allowGateOverride` 时放行，**无隐式放行**。
3. **门不进 done/归档判据**：`describeStageDoneGate`（`:1936-1955`）、`requirementDoneBlocker`（`:196-211`，review + verify 两条判据保持）、`archive create` 判据**一字不改**；正文与计划债因此在归档通道上永远可达（必要时 force），满足用户裁定 ③。需求级的 `in_progress`/`done` 前置门（T4/T7）是**独立前置检查**，不参与这三处谓词。

---

## 四、判据单点（写实性的唯一标准）

### 4.1 模块与算法（`src/core/plan/filled.ts`，唯一实现）

```
PLACEHOLDER_LITERALS = ['（待补充）','(待补充)','（未指定）','(未指定)','待补充','TBD','TODO','FIXME']
EMPTY_TEMPLATE_MARKER = '- [ ] 待补充'                       // 从 flow-manager.ts:5231 迁入（单一来源）
// ① 整段字面量语义（原样搬运，非 m 模式，供 isTemplateEmpty 对整段 .test()）
EMPTY_TEMPLATE_LINE_LITERAL_RE = /(?:^|\n)[ \t]*-\s*\[\s*\]\s*待补充[ \t]*(?=\r?\n|$)/
// ② 逐行语义（新写，仅用于 isSectionFilled 的逐行过滤）
PLACEHOLDER_LINE_RE = /^[ \t]*-\s*\[\s*\]\s*待补充[ \t]*$/m
MIN_FILLED_CHARS = 40
```

`isSectionFilled(text)` 判定链（顺序固定，返回 `{filled, reason?, chars}`）：
1. 取 `## <heading>` 到下一个**同级或更高级**标题之间的原文；找不到标题 → `{filled:false, reason:'missing-section'}`。
2. 逐行过滤：单行命中 `PLACEHOLDER_LINE_RE` → 删；单行（去 `（）()`/`：`后）**等于** `PLACEHOLDER_LITERALS` 之一 → 删；HTML 注释 `<!-- ... -->`（跨行合并）→ 删。
3. 计剩余非空白字符数 `chars`；`chars < MIN_FILLED_CHARS` → `{filled:false, reason: chars===0?'empty':'too-short', chars}`。
4. 需求正文 `## 目标与验收` 额外要求：剩余行中至少 1 行以 `-`/`*`/`A\d`/`验收` 开头 → 否则 `reason:'no-criteria'`。

**禁止项（reviewer 可 grep 断言）**：任何 `includes('待补充')` / `indexOf('待补充')`（子串判定会误伤正文引用该字面，`flow-manager.ts:5236-5239` 已记载同类事故）；任何在 `filled.ts` 之外新增的占位字面量常量。

### 4.2 三类对象的必备小节与判据

| 对象 | 文件 | 必备小节 | 判据 |
|------|------|----------|------|
| 需求正文 | `.openfeel/requirements/REQ-NNN.md` | `## 摘要`、`## 目标与验收` | 两节 `isSectionFilled` 全 true；否则 `emptySections` 列出 |
| 需求级计划 | `.openfeel/plan/reqs/REQ-NNN.plan.md`（**全局固定**，不随阶段/版本漂移） | `## 目标`、`## 任务拆解`、`## 验收判据`、`## 偏差与回写` | 前三节全 true（`isRequirementPlanFilled`）；`## 偏差与回写` 只在偏差发生时要求写实（T6/T7 的 `plan_deviation` 判据） |
| 阶段计划 | `.openfeel/plan/{series}/{stageDir}/plan.md` | **不强制标题**（现网 `stage-131` 用「一、二、三」中文序号） | 仅 `isStagePlanFilled`：整文件 `chars ≥ 2×MIN_FILLED_CHARS` 且不含"整份文件只有占位行"；避免因标题体裁误杀 |
| 阶段 overview | `.openfeel/plan/{series}/{stageDir}/overview.md` | `## 目标`、`## 操作方案`（骨架 `stage.ts:124-144` 只有目标/依赖/操作方案，**无验收节**，不得按验收判） | 两节 true；仅用于 `lint` advisory，**不进任何门** |

### 4.3 单一来源强制

- `flow-manager.ts:5231` 的 `EMPTY_TEMPLATE_MARKER`、`:5239` 的**整段字面量正则**（原样搬运为 `EMPTY_TEMPLATE_LINE_LITERAL_RE`）改为 import 自 `filled.ts`；`isTemplateEmpty`/`detectFillState`（`:5242-5260`）实现体与行为**逐字不变**（`plan.ts:489`、`flow.ts:1557` 的 `fill` 字段因此不变）。`PLACEHOLDER_LINE_RE` 是**新写**的逐行实现，**不得**被 `isTemplateEmpty` 使用（两者语义不同：前者按单行、后者按整段，混用会重现 REV-004 的误判）。
- 测试断言：`expect(FLOW_EMPTY_MARKER).toBe(EMPTY_TEMPLATE_MARKER)`；两个消费方（`body-lint.ts`、`flow-manager.ts` 计划门）都从 `filled.ts` 取谓词。
- 阶段级不得另立标准：`overview` 判据只复用 `isStageOverviewFilled`，**禁止**在 `lint plan` 里另写一套字数/占位规则。

---

## 五、DSH 改造

### 5.1 提示词新结构（`dsh/lib/surface/prompt.js`，中英双语同构）

| 节 | 内容骨架 | 字符预算 | 行数预算 |
|----|----------|----------|----------|
| §1 身份 + 唯一硬规则 | "你是调度者。任何写文件/写代码的动作由子 agent 完成，你只派发与裁决。" | ≤140 | ≤4 |
| §2 每轮 3 个检查点（可判定句） | ① 本轮第一条工具调用必须是 `feel_status`；② 任何写文件前必须已成功调用过 `subagent`/`workflow`（本会话内）；③ 阶段/需求流转后必须 `feel_dev sync` | ≤260 | ≤7 |
| §3 三条禁令（三段式：条件 → 必须动作 → 违反形态） | 手改 `flow.json`/`status.md` → 用 `feel_flow`/`feel_stage` → 被拒 `PROTECTED_PATH`；跳过需求正文 → 先 `feel_req body` → 被拒 `REQ_BODY_GATE`；无计划开工 → 先写 `.openfeel/plan/reqs/REQ-NNN.plan.md` → 被拒 `STAGE_PLAN_GATE`/`REQ_PLAN_GATE` | ≤300 | ≤8 |
| §4 状态写唯一通道 | 仅列 `feel_flow/feel_stage/feel_req/feel_dev/feel_dispatch` 五个 + "禁止 shell 跑 openfeel 写命令" | ≤180 | ≤4 |
| §5 收尾 | 交接摘要 ≤5 行；`feel_dev sync`；不自行归档 | ≤120 | ≤2 |
| Free Mode 附录（`feelMode==='disabled'` 时拼入） | 一行声明 + 一行边界（保留现有 `prompt.js:43-71` 的语义，压到 ≤120 字符） | **≤120** | ≤2 |
| 合计 | 正文 ≤1000 + Free Mode ≤120 = **≤1120** | 上限 **1200（余量 80）** | **≤25** |

**预算口径（REV-009）**：1200 是**渲染后总数**（含 Free Mode 附录）；正文额度 1000、Free Mode 120、余量 **80**（不是 200）。`renderFeelPrompt({feelMode:{value:'disabled'}})` 也必须 ≤1200。

移出内容去向：workflow 模式表 → `feel_flow action=phases`；preflight/退出码/shell 档位/版本号/`vX.Y.Z` 标注 → **删**（属运维或噪声，`prompt-adherence.md` S5/S6）；dispatch 模板 → `feel_next().dispatch`；细化纪律 → `src/core/templates-data/skills/openfeel-delegation/SKILL.md`（渐进披露）。

### 5.2 副本同步（否则重演分叉）

`dsh/lib/surface/prompt.js` 为**源**；`src/core/template-loader.ts`（`:151`、`:1104`）、`src/core/templates-data/claude/agents/*/feel.md`（`:141`）、`src/core/templates-data/opencode/agents/*/feel.md`（`:132`）四份副本逐字镜像。校验方式：`filled.ts` 不适用这一层，T10 自检脚本比对四份副本的正文块 `sha256` 一致（脚本放 `test/cli/feel-prompt-parity.test.ts`，断言 5 处文本块 sha256 相等）。

### 5.3 每轮 reminder 的注入点（含未验证项与降级）

| 优先级 | 机制 | 证据 | 状态 |
|--------|------|------|------|
| 首选 | `ctx.tools.post-execute` → `additionalContexts`（每次工具结果后附 1 行：`阶段X/相位Y｜下一步：subagent(goal=…)`） | `dsh-tools/src/events.ts`；范式 `dsh-repeat-tool-reminder/src/index.ts:221-226` | **未验证**：适配器侧能否注册（`dsh/lib/index.js` 目前只用 `ctx.tools.guard`）。T10 第 1 步做 30 行 spike，结论写 `dsh/ADAPTER.md` |
| 降级 1 | `ctx.systemPrompt.context({name,order,text})`（动态 user 快照，逐请求刷新，不吃 system 前缀缓存） | `dsh-system-prompt/src/index.ts:179-190`（已确认存在），`dsh-tool-subagent/src/index.ts:380-382` 先例 | 可用即落地 |
| 降级 2 | 只在 `feel_*` 返回体增加一行 `nextLine`（零新 API，覆盖率低） | `dsh/lib/tools/shared.js:242` 渲染处 | 兜底 |

频率控制：只在**写类工具之后**与**每 N=5 步**注入一次，避免固定 token 开销（`prompt-adherence.md` §4 T2 代价）。

### 5.4 `feel_dispatch` 数据形态

`.openfeel/dev/dispatch.jsonl` 每行一条（UTF-8，LF）：

```json
{"dispatchId":"d-0001","ts":"2026-11-24T04:31:52.000Z","leadSessionId":"<session.id>","origin":"root","stage":"v1.6.0-stage-132","phase":"exec_running","targetAgent":"executor-a-cli","role":"executor","taskId":"T5","goal":"<一句话任务，含验收命令>","files":["src/core/plan/path.ts"],"returnFormat":"≤10 行：结论/改动文件/验证/阻塞","dispatchDepth":1}
```

- 读写：适配器进程内 fs 直写（仿 `sessions.js`），**该文件进 `PROTECTED_OPENFEEL_PATHS`**，agent 工具写 → `deny`（仿 `log/guard-audit.jsonl` `:688`）。
- 去重/清理：同 `leadSessionId+taskId+goal` 在 5 分钟内视为重复（返回既有 `dispatchId`）；保留 24h / 上限 200 行。
- 暴露：`feel_status.dispatch = {required, records, missing}`（`required` 恒 true——提示级，**不做硬拦**，用户裁定 ②）。

### 5.5 `feel_dev` 工具面

`{action: 'sync'|'status'}` → `sync` 走 `cli.write(['dev','sync'])`，`status` 走 `cli.json(['dev','status'])`；返回 `{ok, lastSync, due, changed, wrote:['users/<u>/dev_last.md','dev/current.md']}`。计数 13→15 需同批改三处断言（`dsh-dispatch.md` §3）。

### 5.6 `feel_status.next` 动作化

`next` 字符串保留（不破坏既有断言），内容改为动作型；新增 `nextAction` 对象：
- `{kind:'dispatch', tool:'subagent', goal:'…', prompt:'<可直接粘贴的四段式>', reason:'phase=exec_running 且需求 REQ-055 无计划'}`；
- `{kind:'command', tool:'feel_req', args:{action:'body', …}}`；
- `{kind:'idle'}`。
实现：`dsh/lib/adapters/next-action.js` 纯函数（`dsh-dispatch.md` §4.1 的 `computeWorkflowGate` 范式），由 T9 接入 `tools/index.js:386-390`。

---

## 六、执行顺序与并行

### 6.1 单写者约束（同一轮内不得双写）

| 文件 | 写入顺序 |
|------|----------|
| `src/core/flow-manager.ts` | T1 → T5 → T6 → T8 |
| `src/commands/req.ts` | T2 → T4 → T7 → T8 |
| `src/commands/flow.ts` | T5 → T8 |
| `src/core/req/requirement-ops.ts` | T4 → T6 → T7 |
| `src/core/plan/path.ts`、`src/core/req/body-file.ts` | 仅 T5 / 仅 T2 |
| `docs/json-contract.md` | T2（**计数三行** `:3/:104/:182-188` 与 #44/#45/#46 条目，须与测试计数同批）→ T13（叙述性章节） |
| `docs/commands.md`、`dsh/*.md` | 仅 T13（单一写者） |
| `src/core/pipeline-schema.ts` | **本阶段无任务改动**（general 阶段表不改） |
| `dsh/lib/tools/index.js`、`dsh/lib/guard.js`、`dsh/lib/adapters/dispatch*.js` | 仅 T9 |
| `dsh/lib/index.js`、`dsh/lib/surface/prompt.js` | 仅 T10 |
| `src/core/i18n-data/zh-CN.ts` + `en.ts`（各 1465 行） | **全阶段共享**：各任务只在所属域末尾**追加**键块（运行时 `req.*` 域起 `:1332`、止 `:1464`；`help.req.*` 在 `:1089-1179`），不重排既有条目 |

### 6.2 波次

| 波次 | CLI 线（A） | DSH 线（B） | 并行关系 |
|------|-------------|-------------|----------|
| W1 | T1 | T11（研究文档，新文件） | 全程并行 |
| W2 | T2（依赖 T1） | T9 step1（ledger + `feel_dispatch` + guard 保护路径） | 并行，写点不重叠 |
| W3 | T3（依赖 T1,T2）＋ T5（依赖 T1,T2） | T9 step2（`feel_dev` + `feel_req body`，依赖 T2） | 三条并行：T3 写 `body-lint.ts`/`lint.ts`，T5 写 `path.ts`/`flow-manager.ts` |
| W4 | T4（依赖 T3）＋ T6（依赖 T5） | T10（提示词 + reminder） | 并行：T4 改 `requirement-ops.ts`/`req.ts` 与 T6 的 `flow-manager.ts` 不重叠 |
| W5 | T7（依赖 T6：general/零阶段需求的生命周期门） | — | 同 `requirement-ops.ts` 串行 |
| W6 | T8（依赖 T7：req.ts 串行 + flow-manager 串行） | — | 关键路径尾段 |
| W7 | T12（依赖 T3、T9；Feel 亲自执行） | — | 可与 W6 并行（T12 只写 `.openfeel/**`，另在 `plan/reqs/` 新建目录） |
| W8 | T13 → T14 | — | 收口 |

### 6.3 关键路径

`T1 → T2 → T5 → T6 → T7 → T8 → T13 → T14`（7 跳）；DSH 线 `T9 → T10` 全程在关键路径旁并行，`T12` 位于 `T9 step2` 之后。每步可验证中间态：T1（vitest 绿）、T2（A1 单次命令 + `--json` 46 出口）、T5（A4 拒绝 + A6 force 留痕）、T6（A5）、T7（A8：`flow phases --mode general` **仍空**、general 需求 `in_progress` 缺计划被拒）、T8（A9 时间戳前进）。

---

## 七、测试计划

### 7.1 必跑命令（A11）

```
npm test
npm run build
cd dsh && node test/contract.js && node test/verify.js && node test/guard.js && node test/integration.js && node test/preflight.js
node bin/openfeel.js lint i18n
node bin/openfeel.js lint req
```

### 7.2 新增用例清单

| 文件 | 用例名 | 断言要点 |
|------|--------|----------|
| `test/core/plan/filled.test.ts`（新） | `判据单点：整行占位不误伤正文引用（cli/BUG-005 回归）` | 正文含行内 `（待补充）` 字样 → `filled:true` |
| | `MIN_FILLED_CHARS 边界 39/40` | 39 字 false、40 字 true |
| | `extractSection 到下一个同级标题为止` | 不吞下级 `###` |
| | `目标与验收 缺判据行 → reason=no-criteria` | 40 字散文但无 `-`/`A1` 行 → false |
| | `EMPTY_TEMPLATE_MARKER 单一来源` | 与 `flow-manager` 导出值相等 |
| `test/core/req.test.ts`（扩，T5.5 组 `:610-673`） | `req body：替换单节且其余 6 节逐字不变` | `git diff` 范围 |
| | `req body：已写实小节无 --replace → body_section_not_empty` | exit 1、零写盘 |
| | `req body：--stdin/--file/--text 三态等价` | 三者输出字节相同 |
| | `正文门：draft→scheduled 空壳 → body_empty` | `requirementBodyBlocker` 直测 |
| | `正文门（claim）：空壳 → body_empty 且 owner/claimed_at 零变更` | A2c；`--force` 后 `gate:'claim'` 审计 |
| | `正文门：body_waiver 后不再拦` | 二次流转放行 |
| | `偏差门在 done 门之后：缺 review/verify → invalid_status（不是 plan_deviation）` | 顺序不可颠倒（REV-001） |
| | `done 门三态不变（body 未进 requirementDoneBlocker）` | `T027.1`（`:1722`）原样通过 |
| | `T058.1 general 需求缺计划 → REQ_PLAN_GATE` | 组合①：`general`，`requirementPlanBlocker` 直测；**不改** T90.1 空表断言 |
| | `T058.2 general 需求 plan_waiver 后放行 + 审计` | `requirement_plan_forced` |
| | `T058.3 零关联阶段的 fast/full 需求同样受门` | 组合②：`workflow_mode='fast'` 且 `linkedStages=0` → `plan_missing` |
| | `T058.3b 有阶段的 full 需求不被本门重复判` | 组合③：有关联阶段且 `full` → 本门返回 null（由 T5 阶段门负责） |
| | `T058.4 general 需求 done 前缺计划回写证据 → plan_deviation` | 复用 T6 偏差谓词 |
| `test/core/req/body-lint.test.ts`（新） | `骨架正文 → 两节命中 emptyBody` | 固定样本 |
| | `body_path 指向缺失文件 → missingBodyFile` | 只读检查 |
| | `需求级计划缺失 → emptyPlan` | 在办需求枚举 |
| `test/core/flow-manager.test.ts`（扩） | `T056.1 exec_running 门：无 stage plan.md → STAGE_PLAN_GATE` | 零写盘、revision 不变 |
| | `T056.2 在办需求缺 REQ plan → 拒绝并列出 id` | `requirementsMissingPlan` |
| | `T056.3 force → 放行且 log.gate_overrides=['plan']` | 审计条目 |
| | `T056.4 resetStagePhase(to exec_running) 同口径` | **两态**：无 `--force` → 拒绝且零写盘（`reset_stage_phase` 不入 log）；`--force` → 放行且 `detail.gate_overrides=['plan']` |
| | `T056.6 flow stage reset --to exec_running 命令层` | `--force` 透传 `allowGateOverride`；不加时 exit 1 `STAGE_PLAN_GATE` + 两条出路提示 |
| | `T056.5 阶段 plan.md 为占位空壳 → stagePlanUnfilled=true` | A4b（存在≠写实） |
| | `T059.1 done 前 due=true → DEV_SYNC_STALE` | 独立于 done 三态 |
| | `T059.2 同步失败 → 返回 error 且不静默` | `maybeSyncDevStatus` 单测 |
| | `T059.3 正常路径：done 前自动同步后 due=false → 不触发门` | 顺序保证 |
| | `T059.4 构造法：注入 sync 失败 → DEV_SYNC_STALE` | A9b（唯一可复现路径） |
| `test/commands/req.test.ts`（扩） | `req body 人类输出 + 失败 envelope` | `logMock/errorMock` |
| | `req body --json 成功出口形状` | `target/ok/id/section/path/replaced/chars` |
| | `req advance --force → requirement_body_forced` | `flow.json.log` 末条 |
| | `req advance --to review：改计划未回写 → REQ_PLAN_DEVIATION` | A5 |
| `test/commands/knowledge.test.ts`（改计数锁） | `注册 --json 选项 47 / 成功出口 46` | 替换 `:384-401` 的 45/44（先对齐基线 46/45，再加 `req body`） |
| `test/cli/json-contract.test.ts`（扩） | `#44/#45 补登 + #45 req body 出口形状` | 新增出口锁（**#45 = `req body`**、**#46 = `lint fill`**，非 #42；见 §十一 T2/T13 行） |
| `test/commands/flow.test.ts`（扩，**不翻新** general 空表） | `T90.1 空表四访问器保持`（`:3730/:3743/:3750/:3769/:3787` 原样通过） | 阶段级语义不变 |
| | `--force 透传 allowGateOverride` | 只有 `flow advance` 传 |
| `test/commands/lint-req.test.ts`（扩） | `C9 --json 八键形状（含 fill）` 替换 `:266` | 形状锁 |
| | `C16 fill 不驱动 exit 1` | 48 条存量 → exit 0 |
| `test/core/dev-status.test.ts`（扩） | `stage set 后自动 sync` | `.sync.json` 前进 |
| | `req advance 后自动 sync` | 同上 |
| `test/cli/error-envelope.test.ts`（扩） | 五新码 envelope | `REQ_BODY_GATE`/`REQ_PLAN_GATE`/`REQ_PLAN_DEVIATION`/`STAGE_PLAN_GATE`/`DEV_SYNC_STALE` |
| `test/cli/feel-prompt-parity.test.ts`（新） | 5 处提示文本 sha256 相等 | 防副本分叉 |
| `dsh/test/guard.js`（扩） | `dev/dispatch.jsonl 受保护：工具写 → deny` | 仿 `:584` |
| | `openfeel dev sync 仍放行` | `:820-836` 原样 |
| `dsh/test/verify.js`（扩） | `feel_dispatch 写一行 JSONL + dispatchId 唯一` | A7 |
| | `feel_status.dispatch.records ≥1` | A7 |
| | `feel_req action=body 走 cli.write` | 通道正确 |
| | `提示段 ≤1200 字符 / ≤25 行` | A10 |
| `dsh/test/contract.js` / `integration.js` | 工具数 13 → **15** | `:126-128`、`:25-39/:229` |
| `dsh/test/verify.js` | `nextAction.kind` 三态 | A10 |

> **§7.2 修订（2026-11-24）**：① 原用例 `guard-audit 记录 origin/delegationDepth` **已删除**——guard 审计**不记录** `origin`/`dispatchDepth` 键（默认值未落地），该项**未交付，见 §十一 T9 行**（保留为「未验证」，不计入 A7 证据）；② JSON 出口编号按实际口径：`req body` = **#45**、`lint fill` = **#46**（成功/注册总数仍 46/47，见 §十一 T2/T13 行）。

### 7.3 反守卫纪律（新写测试必须遵守）

`test/commands/req.test.ts:110-113` 的 afterEach 会比对**真实** `.openfeel/requirements/` 快照逐字不变 ⇒ 所有写入类用例必须 `vi.spyOn(process,'cwd')` 指向 `mkdtempSync` 临时目录；T12 是本阶段唯一允许改真实正文的动作，且不经测试执行。

---

## 八、迁移与兼容

1. **`general` 语义变更：只动需求级，阶段级一字不改**。
   - **谁受影响**：带 `workflow_mode: general` 的**需求**（含零关联阶段者）——`in_progress` 前必须有写实的 `.openfeel/plan/reqs/REQ-NNN.plan.md`，`done` 前必须有计划回写证据。旧 general 需求首次流转会被 `REQ_PLAN_GATE` 拦：补计划（推荐）或 `req advance --force`（写 `plan_waiver` + 审计）。
   - **谁不受影响**：阶段级 general 空表（`resolveTransitionsForMode` 的 `{}` 保留）；T90.1 / T90.7 等既有断言**零改动**；`fast` 阶段表不动（已含 `plan_review`+`review`，补 T5 即达标）。
   - 必须同步的文档：`docs/commands.md`（写清"general 仅需求级合法 + 需求级强制链"）、`docs/VERSIONS.md`。`prompt.js` 里"三种工作流模式"整节删除（迁到 `feel_flow action=phases`），避免文内两套口径。
2. **旧阶段无需求级计划**：门只拦 `→exec_running` 的**跨越**；已处于 `exec_running`/`review_*`/`archiving` 的阶段完全不受影响（`fromPhase !== 'exec_running'` 条件）。`lint req` 输出 `fill.emptyPlan` 仅 advisory。存量 117 个阶段中 10 个无 `plan.md`（含本阶段）→ 本阶段由 T12 自补，其余按需。
3. **存量 48 份空壳正文**：不批量回填；`lint req` 列举；首次状态流转由 A2 门拦截，用户可选择补正文或 `--force`（写 `body_waiver` + 审计）。归档通道不受影响（§3 约束 3）。
4. **`pipeline.yaml` 覆盖线**：`transitions`（full）与 `fast_transitions` **均不变**；**不新增 `general_transitions`**（阶段级 general 无消费者）；`PipelineConfigSchema.parse` 失败仍是硬错（`flow-manager.ts:5087-5113` 现状）。
5. **需求级计划位置**：`.openfeel/plan/reqs/REQ-NNN.plan.md` 为**全局固定路径**（`getRequirementPlanRelPath(id)` 单点派生 POSIX 相对路径）；`rollover` 只改 `target_version`，计划文件与 `recorded_at` 不动，因此顺延后计划仍可校验。旧仓首次使用时会新建 `plan/reqs/` 目录（`mkdir` 幂等）。
6. **DSH 配置**：`dsh/cordis.patch.yml` **不新增键**（无角色门 ⇒ 无新开关），因此不需要人类改受保护配置——这是用户裁定 ②的直接结果。
7. **CLI 版本面**：`dsh/package.json` 的 `openfeel.requiresCli` 需从 `>=1.5.25` 抬到 `>=1.6.0`（`req body`、`feel_req body` 与五个新错误码是硬依赖）；根 `package.json.files` 已含 `dsh/lib`，无需改。

---

## 九、风险与回写规则

### 9.1 风险

| # | 风险 | 影响 | 缓解 |
|---|------|------|------|
| R1 | **改源码不生效**：`feel_*` 走全局安装的 openfeel v1.5.25（`dsh/lib/adapters/cli.js:157-229`） | T12 与 A7/A9 取证失真 | 每次 CLI 线合并后 `npm run build` + `npm i -g .`（或把 `openfeel.command` 指向 `bin/openfeel.js`），在 T13 里显式记录所用路径 |
| R2 | **门禁自锁**：T5 上线后本阶段若仍缺 `plan.md`（本文件即为其一）→ 自身无法推进 | 阻塞后续 | 本计划合入即满足 stage plan；T12 补 6 份需求级计划；必要时 `--force`（留痕） |
| R3 | **general 门错层**（把强制链写成阶段转移表） | REQ-058 表面"改了"实际死代码 | 已纠偏：阶段级 general 在写入面即被拒（`stage.ts:559-561`、`plan.ts:75-77`），强制链只落需求生命周期（T7），阶段表与 T90.x 断言零改动 |
| R4 | **`post-execute` 不可用** | A10 半失效 | 降级 1（`systemPrompt.context`，已证存在）；T10 spike 先行，不阻塞 |
| R5 | **dev sync 静默失败造成"永远 due 又永远拦"** | 归档卡死 | T8 强制 `maybeSyncDevStatus` 返回 `error` 并 stderr 可见；done 门留 `--force` |
| R6 | **两层实现漂移**（CLI 核心谓词 vs 命令层文案 / DSH 提示） | 判据分裂 | 判据单点在 `src/core/plan/filled.ts`；reviewer 用 grep 断言无第二份表达式 |
| R7 | **存量 force 滥用** | 审计被稀释 | `gate_overrides` 计数若单阶段 >10 次，触发 §9.2 规则 4 |

### 9.2 偏差回写规则（触发条件 → 动作 → 更新章节）

| # | 触发条件 | 回写动作 | 更新章节 | 谁决定 |
|---|----------|----------|----------|--------|
| 1 | 某任务实测发现调研结论错误（行号不符/机制不存在） | 在对应任务追加"实测修正"小步，判据不变 | §2 该任务 + §3 门禁表 | executor → Feel |
| 2 | 新增失败无法在 30 分钟内定位 | 拆任务、改依赖与波次 | §2、§6 | Feel 决定，planner 落笔 |
| 3 | `post-execute` 不可用 | 启用降级路径，缩减 T10 范围 | §5.3、§2 T10 | executor-b → Feel |
| 4 | 单阶段 `--force` 次数 >10 | 评估是否批量回填正文/补计划，调整迁移口径 | §8 | Feel（需用户确认） |
| 5 | general 需求门拦到存量需求（数量超预期） | 评估是否给 `created_at` 早于本版本的 general 需求一次性 `plan_waiver`，并调整迁移口径 | §8.1、§7.2 | Feel（需用户确认） |
| 6 | 用户裁定变化（门禁强度/主会话约束/存量处置） | 立即停止相关任务，重写对应章节与判据（作废旧 A 用 `~~`） | §1、§3、§8 | 用户 |

回写纪律：**只改本文件**；A 编号只增不改；每次回写在 §10 追加一行；executor 发现触发条件时**停手报告**，不得自行改判据。

---

## 十、变更记录

| 日期 | 章节 | 变更 | 影响任务 | 触发人 |
|------|------|------|----------|--------|
| 2026-11-24 | 全文 | 创建：6 条需求 → 12 条判据 → 14 个任务 → 8 波次；锁定用户三条裁定 | T1–T14 | planner |
| 2026-11-24 | §1 A8/A8b、§2 T7、§3 门禁表、§4.2、§6、§7.2、§8.1/§8.4、§9 R3/规则 5 | **载体纠偏**：REQ-058 从"阶段转移表"改为**需求生命周期门**（阶段级 general 在写入面即被拒，`GENERAL_TRANSITIONS`/`general_transitions` 删除；`pipeline-schema.ts` 不再改动；T90.x 断言零改动）；新增错误码 `REQ_PLAN_GATE` | T7（重写）、T5、T6、T13 | lead（决策） |
| 2026-11-24 | §2 T5、T6、T12、§4.2、§8.5 | 需求级计划路径改为**全局固定** `.openfeel/plan/reqs/REQ-NNN.plan.md`（不随阶段/版本漂移，`rollover` 后计划仍在）；`findRequirementPlanPath(projectPath, reqId)` 去掉 stage 参数 | T5、T6、T12 | lead（决策） |
| 2026-11-24 | §1 A12、§2 T2、T13、§7.2 | `req body` **支持 `--json`**（**出口 #46**）：先把漂移基线对齐（文档 43→45 成功、测试 45/44→46/45，补登 #44/#45），再新增 #46（注册 47 / 成功 46）+ `json-contract.md` 三处 + `test/cli/json-contract.test.ts` | T2、T13 | lead（决策） |
| 2026-11-24 | §2 T8、§9 R5 | 账本硬门保留，**门之前必先 `maybeSyncDevStatus()`**：正常路径同步成功即不触发，只有同步失败才拦（失败原因经 `error` 可见，不再静默） | T8 | lead（决策） |
| 2026-11-24 | §2 T4、T7 | REQ-055 的 claim/start 正文门对 **general / 零关联阶段需求同样生效**（不按模式/阶段数分支） | T4、T7 | lead（决策） |
| 2026-11-24 | §1 A5/A8、§2 T6、§3 表 | **REV-001**：偏差门从 `review_pending`（不存在的需求状态）改挂 **`→done`**，顺序＝正文 → 计划 → done 门（review/verify）→ 偏差门；A5 改 `req advance --to done` 并声明 review/verify 先行 | T6、T7 | reviewer |
| 2026-11-24 | §2 T4、§3 表 | **REV-002**：`applyStatusChange` 返回型由 `boolean` 改为 `RequirementGateCode \| null`，`:593` 单点映射；既有 done 门行为仍返回 `invalid_status`（影响面 5 处穷举） | T4 | reviewer |
| 2026-11-24 | §1 A2c、§2 T4、§3 表、§7.2 | **REV-003**：`claimRequirement:484-497` 内嵌同一谓词（插在 `:491` 幂等之后、`:492` 赋值之前），新增 A2c 与 claim force 审计；删除"第一步先实测确认" | T4 | reviewer |
| 2026-11-24 | §2 T1、§4.1、§4.3 | **REV-004**：拆成 `EMPTY_TEMPLATE_LINE_LITERAL_RE`（原样搬运整段语义）+ `PLACEHOLDER_LINE_RE`（新写逐行 `m`）；列出 5 条迁移断言（BUG-005 / CRLF / 缩进 / detectFillState / fill 字段） | T1 | reviewer |
| 2026-11-24 | §2 T5、§3 表 | **REV-005**：`flow stage reset` 与 `resetStagePhase` 均无 `--force` → 先记为"复位不可 force"并给替代路径；**已被下一行裁定①取代** | T5 | reviewer |
| 2026-11-24 | 全文（T2/T3/T4/T5/T6/T7/T8/T13、§6.1） | **REV-006**：i18n 路径统一改为 `src/core/i18n-data/zh-CN.ts`/`en.ts`（1465 行），锚点更正为 `help.req :1089-1179`、`req.* :1332-1464` | T2–T8、T13 | reviewer |
| 2026-11-24 | §1 A12、§2 T2、T13、§6.1、§7.2 | **REV-007**：计数锁基线更正为「真实 45 成功 / 46 注册、止于 #45」；先对齐（文档 43→45、测试 45/44→46/45、补 #44/#45），再加 `req body` = #46（注册 47 / 成功 46） | T2、T13 | reviewer |
| 2026-11-24 | §1 A4/A4b、§2 T5、§3 表、§7.2 | **REV-008**：计划门补写实判据 `stagePlanUnfilled`/`requirementsUnfilledPlan`（`isStagePlanFilled`/`isRequirementPlanFilled`），新增 A4b 占位计划用例 | T5 | reviewer |
| 2026-11-24 | §1 A9/A9b、§2 T8、T9、§5.1、§7.2 | **REV-009**：A9b 降为**构造法单测**（注入 sync 失败/只读 dev 目录）；提示词预算含 Free Mode ≤120、余量 80；guard 名单结构改为 `{match,segments,hint}`；`origin/delegationDepth` 标「未验证」 | T8、T9、T10 | reviewer |
| 2026-11-24 | §2 T5「复位路径」、§3 表「相位复位绕过」行、§7.2 | **裁定①**：`flow stage reset <stage> --to exec_running` **补 `--force`** → `allowGateOverride:true`，审计与 exec 门同一 `gate_overrides:['plan']` 口径；不加 force 则拒绝并提示两条出路；用例改拒绝/force 两态（`T056.4`/`T056.6`） | T5、T7 | lead（决策） |
| 2026-11-24 | §2 T7、§3 表「需求级计划」行、§7.2 | **裁定②**：`requirementPlanBlocker` 适用面写死三种组合（general / 零阶段 fast·full / 有阶段 full·fast 不判），补 `T058.3`、`T058.3b` | T7 | lead（决策） |
| 2026-11-24 | §1.1 A2/A2c/A8、§1.2 | **REV-016 判据修订**：`req claim/advance/complete` 无 `--json` 出口 ⇒ 三条 gate 码以 **human 文案 + exit 1 + 零写盘** 为判据；A2c 改为「claim **不**校验正文」（认领≠开工，正文门首拦 `in_progress`）；A8 补 `--force` → `plan_waiver` + 审计 | T4、T7 | reviewer |
| 2026-11-24 | §十一 | 偏差表**修正 2 行 + 追加 7 行**：T6 更正为 `applyStatusChange` 已返回 `RequirementGateCode \| null`；T9 更正为 guard 审计**无** `origin/dispatchDepth` 键（默认值未落地，§7.2 用例未交付）；追加 T4/T7（claim 语义）、T5（路径跨越门）、T3（`emptyPlan` 在办口径）、T8（`flow advance` 单次 sync）、T6（聚合收口审计）、T1（`PLACEHOLDER_LINE_RE` 超集）、T2/T13（实际编号 #45/#46） | T1–T3、T5–T8、T13 | reviewer |

---

## 十一、执行期偏差登记（2026-11-24）

> 登记规则：只记录执行事实与处理方式；§1–§8 的既有判据文字（A 编号、通过条件）与任务清单一字不改。判据不变者只改取证路径；影响判据者在本表「影响」列标明，是否改判据由 review 裁定（本表**不新增/不删除任务**）。

| 日期 | 任务 | 偏差 | 处理 | 影响 |
|------|------|------|------|------|
| 2026-11-24 | T1 | 测试文件计划写 `test/core/filled.test.ts`，实际落 `test/core/plan/filled.test.ts` | **已修正**：按实际路径 `test/core/plan/filled.test.ts` 落盘，实现与计划文本现已一致 | A1/A3 取证命令不变；T1 自验收的 vitest 路径按 `test/core/plan/filled.test.ts` 执行，判据无变化 |
| 2026-11-24 | T3 | 模块路径：计划 §2 T3 写 `src/core/req/body-lint.ts`，实现落在 `src/core/plan/body-lint.ts`（与判据单点 `filled.ts` 同目录） | 以实际路径为准，计划文字不改（记录为准），后续引用与评审 grep 一律用 `src/core/plan/body-lint.ts` | A3 判据与 `lint req --json` 输出形状不变；§2 T4「`isRequirementBodyFilled` 命中 ≤3 处」的 grep 改按新路径核对 |
| 2026-11-24 | T3 | lint 语义：`lint fill` 恒 exit 0（advisory），`ok:false` 只出现在 `--json` 体；`missingBodyFile` 未实现（需要 flow.json 需求清单，不在判据单点范围） | 接受为实施口径：`fill` 不驱动退出码；`missingBodyFile` 记为未交付，不新增任务补偿 | A3 仍成立（exit 0 + `fill.emptyBody`/`fill.emptyPlan` 枚举）；`fill` 实际为 2 键而非 3 键，§7.2 的 C9 形状锁与 `missingBodyFile` 用例按实际键数断言/不适用 |
| 2026-11-24 | T5 | 路径函数归属：`getRequirementPlanRelPath`/`findRequirementPlanPath` 原计划由 op-001/T1 交付，实际在 T5 新增（单点定义仍在 `src/core/plan/path.ts`）；附带 `src/core/errors.ts` 新码登记、`test/cli/error-envelope.test.ts` 契约表扩一行、`entry.test.ts` auto-fix 夹具补计划文件（断言未改） | 按实际归属验收（T5 交付，单点仍在 `path.ts`），T1 交付清单相应收缩 | A4/A6 取证路径不变；A5 的 sha256 比对单点仍是 `getRequirementPlanRelPath`（`path.ts`），T1 自有验收不受影响 |
| 2026-11-24 | T5 | 在办需求范围：门按**全局扫描** `scheduled/in_progress ∧ 未 waiver`（不限于本阶段关联），与 T3 `emptyPlan` 口径一致 | 保留全局口径——与 `lint req` 同一份「在办」定义，避免两套标准 | A4 的 `requirementsMissingPlan` 可能含他阶段需求 ⇒ 取证须按全局清单核对；A4 通过条件本身不变 |
| 2026-11-24 | T5 | **已知边界（待裁定）**：`--force` 直接跳到 `review_pending` 等后置相位时，`targetPhase !== 'exec_running'` ⇒ 计划门不触发且无审计 | 记录为「已知边界」，由 T14 review 判定是否扩大触发条件（扩条件=改判据，本表不代行） | A4/A6 只在 `→exec_running` 成立；该路径是**未审计的绕过面**，A6「force 必留痕」在此路径暂不成立，是否 blocking 由 review 裁定 |
| 2026-11-24 | T6 | 偏差门落点（**2026-11-24 修订**，REV-016）：`applyStatusChange` **已改为**返回 `RequirementGateCode \| null`（与 REV-002 一致；本行原记「返回 `boolean` **未改**（REV-002 的签名改造未落地）」**为错记，已更正删除**）；偏差门放在 `updateRequirement` 的 `→done` 前置（advance/complete/set 全覆盖）。未盖章历史需求：放行 + `console.warn` + 独立日志条目 `requirement_plan_unstamped`（不塞进 done 门 detail） | 以实际实现取证：一个前置点覆盖三入口；未盖章需求不拦，靠 warn + 独立日志留痕；签名与 REV-002 一致，**不再登记为偏差** | A5 仍成立（`→done` 前改计划未回写 → exit 1 `plan_deviation` 文案）；签名实现与 REV-002 一致（REV-016），评审按 `RequirementGateCode \| null` 取证；`requirementDoneBlocker` 与 done 三态断言零改动（既有断言保住） |
| 2026-11-24 | T4 / T7 | 错误码通道：`req claim/advance/complete` 无 `--json`，`body_empty`/`plan_missing` 走 i18n 文案，**未进** `src/core/errors.ts` 与 error-envelope 契约 | 判据以 **human 文案 + 退出码 1** 为准（与 T6 `plan_deviation` 先例一致）；是否补 `--json` 由 review 裁定 | A2/A2c/A8② 的 exit 1 与文案可复现，但 `error.code='REQ_BODY_GATE'`/`'REQ_PLAN_GATE'` 在 CLI 层**不可取证** ⇒ §1.2「五码进 `error-envelope.test.ts`」该两项暂不成立，需 review 裁定取证方式 |
| 2026-11-24 | T7 | claim 不挂计划门：claim ≠ 开工，挂上会破坏既有 claim 用例；计划门只在 `→in_progress` | 保留分工：claim ~~只受 T4 正文门~~ **两个需求级门都不在 claim 上**（**2026-11-24 修订**，REV-016：claim 不再校验正文），计划门挂 `→in_progress` | A8② 命令仍是 `req advance REQ-0NN --to in_progress`，不受影响；~~A2c（claim 正文门）仍成立~~ A2c 已随 REV-016 改为「claim 放行」（见下表 T4/T7 行） |
| 2026-11-24 | T9 | DSH 工具面（**2026-11-24 修订**，REV-017）：`feel_dev.status` 用 `cli.text(['dev','status'])`（该子命令无 `--json`）+ 读 `.sync.json`；`feel_status.dispatch` 增 `records`（与 §5.4 的 `missing` 字段合并为 `missingRoles`）；guard 审计**没有** `origin`/`dispatchDepth` 键（本行原记「默认 `root`/`1`」**默认值未落地，已更正**），该项保留为「**未验证**」 | 按实际实现登记：status 走文本输出 + 本地 `.sync.json`；键名以 `missingRoles` 为准；guard 审计**不写** `origin/dispatchDepth`（不虚构默认值），`ADAPTER.md` 标注未验证 | A7 的 `dispatch.records ≥ 1` 仍成立；`dispatch.missing` 实际键名为 `missingRoles`（§5.4/§7.2 断言按实际键名）；审计 `origin/dispatchDepth` **键未落地** ⇒ §7.2 的「`guard-audit 记录 origin/delegationDepth`」用例**未交付**，A7 不含该项，保留为未验证（REV-017） |
| 2026-11-24 | T10 | 提醒档位：`post-execute.additionalContexts` 需 `UserMessage` 类型，适配器解析不到 `@deepseek-ai/dsh-llm` ⇒ 走**降级 1** `ctx.systemPrompt.context`（证据 `.openfeel/tmp/stage-132/spike.md`）；提示词实测 zh 700/817、en 1038/1154 字符；`feel.md` 用 parity 标记块镜像，**未删**平台专属内容 | 采用 §5.3 已批准的降级 1；副本按 parity 标记块镜像（非整份逐字相同） | A10 提示段仍成立（zh 700 / en 1038 均 ≤1200 且 ≤25 行）；提醒段以**降级 1** 取证，`post-execute` 首选项不成立；`test/cli/feel-prompt-parity.test.ts` 的「5 处正文块 sha256 相等」须按 parity 块口径断言 |
| 2026-11-24 | T4 / T7 | `claim` **不再校验正文**（REV-016）：正文门只在 `→in_progress` 首拦；`req add --claim`/`--start` 内部**显式传 `projectPath`**（不依赖 cwd 推导），以保证认领原子成功 | 以 §1.1 A2c 修订为口径：claim 只写 `owner`/`claimed_at`，零校验零审计；计划门仍只挂 `→in_progress`（本表 T7「claim 不挂计划门」行继续有效） | 本表「T4/T7 无 `--json` 通道」的取证方式由 §十一 修订注定论（human 文案 + exit 1）；A2c 由「被拒」改「放行」，A2/A8 不变（REV-016） |
| 2026-11-24 | T5 | 计划门触发条件改为「相位路径**跨越** `exec_running`」（原条件 `targetPhase==='exec_running' && fromPhase!=='exec_running'` 可被 `--force` 单跳绕过） | 按「路径跨越」判定：`--force` 跳到 `review_pending` 等后置相位时，只要路径跨越 `exec_running` 即触发门，并按同一 `gate_overrides:['plan']` + `gate_missing` 留痕 | 本表「T5 已知边界（待裁定）」的**未审计绕过面关闭**；A4/A6 覆盖面扩大（A6「force 必留痕」在跨相位路径上成立），判据结构不变（REV-014） |
| 2026-11-24 | T3 | `emptyPlan` 只统计**在办**需求（`scheduled`/`in_progress`），`emptyBody` 仍**全量**；`lint fill` 仍 advisory，不驱动 exit 1 | 接受为实施口径：`emptyPlan` 枚举规模小于原文口径（与 T5 阶段门同一份「在办」定义），`emptyBody` 保持全量以便观察存量 | A3 仍成立（exit 0 + `fill.emptyBody`/`fill.emptyPlan` 枚举）；`fill.emptyPlan` 若出现 `done`/`draft` 需求即为缺陷（REV-017） |
| 2026-11-24 | T8 | `flow advance` 出口**去重**：`maybeSyncDevStatus` 在该命令内**恰好执行一次**（不再由 `advanceStagePhase` 与命令层各调一次） | 保留去重实现：同一命令只落一次账本写盘，`blockChanged()` 语义不变 | A9「写操作后自动同步」仍成立；「各出口各调一次」在 `flow advance` 上收敛为一次，不重复写盘（REV-019） |
| 2026-11-24 | T6 | 聚合自动收口（需求随关联阶段全部 done 自动 `→done`）**绕过** `updateRequirement` 前置，偏差门不覆盖该旁路；新增独立审计条目 `requirement_auto_complete`（**behavior 不变**） | 不以改判据方式拦聚合收口：旁路只加审计留痕，自动收口行为保持原样 | A5 的取证范围限定为显式 `req advance/complete/set →done`；聚合收口路径以 `requirement_auto_complete` 审计可追溯，A5 通过条件不变（REV-016） |
| 2026-11-24 | T1 | `PLACEHOLDER_LINE_RE` 实现比 §4.1 的字面**更宽**（超集：额外覆盖空小节 / 零信息量内容），登记为**有意扩展** | 判据按实现（超集）取证，§4.1 字面保持不改；不新增第二份规则 | `isSectionFilled` 的拒绝面略大于 §4.1 字面描述，A1–A3 通过条件不变；reviewer 复现以实现为准（REV-013） |
| 2026-11-24 | T2 / T13 | JSON 出口**实际编号**与计划字面不同：`req body` = **#45**、`lint fill` = **#46**，成功/注册 = **46/47**（REV-007 字面的「`req body` = #46、注册 47 / 成功 46」以实际编号为准） | 文档与测试按实际编号对齐（`docs/json-contract.md`、`test/commands/knowledge.test.ts`、`test/cli/json-contract.test.ts` 同批）；计划字面不改 | A12 的「`req body` 出口编号」按 **#45** 核对、`lint fill` 按 **#46**；计数锁总数 46/47 不变（REV-007 口径以实际编号为准） |
| 2026-11-24 | T9 / T10 | 正文门上线后 `dsh/test/verify.js` 夹具（`draft→scheduled→in_progress`）被 `REQ_BODY` 拒绝（exit 1）；且提示词要求 `feel_req add claim=true start=true` 一步到位，空正文必然失败 | 新增 `req add --summary <md>`（写入 `## 摘要`）与 `feel_req add` 的 `summary/problem/goal/acceptance/plan` 五参数；夹具改为 `add(summary+goal+acceptance)` 后流转，并保留「缺 summary → start 被拦」负例；提示词改为「建需求必须带 summary+goal+acceptance」；`dsh/ADAPTER.md` 字数表按实测 720/837、1027/1143 更新 | A1/A2/A10 判据不变；适配器可用性从「一步到位」修正为「带 summary+goal+acceptance 方可流转」；四测 contract 53 / verify 131 / guard 180 / preflight 10 全绿（REV-015 补证） |

> **§十一 修订注（2026-11-24，REV-016）**：三条 gate 错误码 `REQ_BODY_GATE` / `REQ_PLAN_GATE` / `REQ_PLAN_DEVIATION` **不登记** `src/core/errors.ts`——`req claim/advance/complete` 无 `--json` 出口，envelope 无通道；判据以 **human 文案 + exit 1 + 零写盘** 为准，`--force` 以 `body_waiver`/`plan_waiver` + `requirement_body_forced`/`requirement_plan_forced` 审计为放行证据；若未来补 `--json` 再登记。因此 §1.2 的「五码进 `error-envelope.test.ts`」只对 `STAGE_PLAN_GATE`/`DEV_SYNC_STALE` 成立。
> 原「待 review 裁定」项处置：① T5 `--force` 跳后置相位的绕过面 → **已关闭**（修订为路径跨越，REV-014）；② T4/T7 无 `--json` 时错误码取证方式 → **已定**（human 文案 + exit 1，REV-016）；③ T10 parity 块镜像下 parity 断言口径 → 仍待 T14 按 parity 块口径取证（本表事实不改）。

---

> 计划审查：待 `reviewer` 独立审查（本轮计划含 5 条用户裁定〔门禁强度 / 主会话约束 / 存量处置 / 复位 force / 计划门适用面〕与 5 处未验证项，不得 self-review 通过）。
> 本计划**不包含**：版本归档与发布（需用户明确确认，`feel_archive` 判据不可 force）。
