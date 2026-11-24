# v1.7.0-stage-133 计划（REQ-061 ~ REQ-067 / fast 模式）

> 来源：需求正文 `.openfeel/requirements/REQ-061.md`~`REQ-067.md`（**正文里的 `A6x.1..A6x.5` 是唯一判据源**）+ 本节引用的源码行号（只读取证）。
> 本文件是**执行前的拆解与判据**，不是进展报告。执行中变更按 §六 的偏差格式回写，判据编号只增不改。
> 角色约定：`executor-a`＝CLI 线（`src/**` + `test/**`）；`executor-b`＝DSH 线（`dsh/**`）；`executor-c`＝发布/脚本线（`scripts/**` + `package.json`）；`reviewer`＝独立取证（非作者）；`Feel`＝状态写操作与派单。
> 本计划**不包含**：版本归档、真实 npm 发版（`npm publish` 真实执行由人类在发版窗口完成，见 §六 R2）。
>
> **修订记录（2026-11-24，针对独立审查 6 blocking + 4 major）**：REV-P01…REV-P10 逐条落点见 §七；本轮**只改判据/任务/矩阵与测试清单，不改需求正文**，13 步执行顺序（A1→A2→B3→B4→B5→B6→C7→C8→C9→D10→D11→D12→E13）不变。

---

## 一、目标与判据

### 1.0 判据编号口径（可追溯性）（2026-11-24 修订，REV-P05）

**判据编号 = 需求正文原编号。** 7 份正文各登记了 `A6x.1`…`A6x.4/5`（REQ-064 到 `A64.5`），本阶段**逐条沿用正文编号，不重排、不合并、不改义、不互换**，共 **29 条**（4+4+4+5+4+4+4）：

- 「正文原文」列改为**引用正文判据编号**（`A6x.k`）并摘引原文短语；**不再声称逐字全文引用**（原稿「各需求正文只登记一条 A1」「逐字引用」与事实不符，已作废——REV-P05）。
- 子判据只增不改：作废写 `~~A6x.k~~（作废：原因）`；新增判据续号 `A6x.k+1`，**不得占用正文已用编号**。
- 每条判据必须能被第三者用命令复现；"看起来对"不算通过。
- **旧编号作废清单（仅追溯用，勿再引用）**：原 `A61.1`=版本一致性 / `A61.2`=六步链 / `A61.3`=双包 / `A61.4`=失败早停；原 `A62.2`=test 夹具 / `A62.3`=src 两态；原 `A63.2`=正向链 / `A63.3`=回退 / `A63.4`=旧直连；原 `A64.4`=`--from`+`--fix-plan`；原 `A65.2`=复用 / `A65.3`=四类债 / `A65.4`=同源；原 `A66.2`=按 dispatchId 关联 / `A66.3`=幂等 / `A66.4`=四指标；原 `A67.2`=`cmd /c` / `A67.3`=内联 payload / `A67.4`=审计。这些旧编号的语义已按正文重排到 1.1 表。

### 1.1 需求 → 判据映射（正文原编号）

| 需求 | 判据 | 正文判据 | 验收命令（仓库根执行） | 通过条件 |
|------|------|----------|------------------------|----------|
| **REQ-061** 发布链路一条命令 | **A61.1** 干净工作树跑通六步链 | A61.1 | `npm run release -- --dry-run --json` | exit 0；`steps.map(s=>s.id)` = `['version','build','publish','market','archive-commit','tag']`，六步全 `status:'ok'`（`--dry-run` 下 publish 子步为 `npm publish --dry-run`，不真发）；`git status --porcelain` 执行前后均为空（`--dry-run` 零写盘）；单测注入 `version` 或 `build` 失败 → `exitCode:1` 且 `publish/market/archive-commit/tag` 全 `skipped`（「不进入后续步骤」） |
| | **A61.2** whoami 早停 + 真实发布只认 `--publish` | A61.2 | `npm run release -- --publish --json`（分认证成功/失败两态） | **无 `--publish`**：零**真实** publish——`exec` 记录里不存在不带 `--dry-run` 的 `npm publish`（给了 `--dry-run` 则子步为 `npm publish --dry-run`；既无 `--dry-run` 又无 `--publish` 时 publish 步骤 `skipped`）；**有 `--publish` 且 `npm whoami` 失败**：exit 1、早停（publish/market/archive-commit/tag `skipped`）、文案含 `npm login` 指引、stdout/stderr **不含 token 形态**（断言 `/\b_[A-Za-z0-9]{20,}\b/`、`/npm_[A-Za-z0-9]{20,}/` 零命中）；**有 `--publish` 且认证通过**才真发 |
| | **A61.3** CHANGELOG 草稿 + `--notes-only` + 人工确认 | A61.3 | `npm run release -- 1.7.0 --notes-only --json` | 草稿内容含 `## [1.7.0]` 段、REQ 标题（来自 `flow-archive/<version>.json`）与 REV 结论（来自 stage 摘要）；`--notes-only` **只生成不发布**且 `CHANGELOG.md` 字节不变（`git status --porcelain` 空）；只有人工确认后的显式开关 `--write-notes`（须与 `--notes-only` 同用）才写 `docs/releases/<version>.md`（已存在不覆盖；`--dry-run` 下仍不写盘），人工确认后**合并进 `CHANGELOG.md`**——脚本永不改 `CHANGELOG.md`；单测断言「无 `--write-notes` → 零写盘」 |
| | **A61.4** 归档产物白名单提交 | A61.4 | 同上 `--dry-run --json` ＋ 单测 | `steps['archive-commit'].paths` ⊇ `.openfeel/log/archive-*.md`、`.openfeel/flow-archive/`、`.openfeel/checkpoints/`、`docs/releases/<version>.md`、`CHANGELOG.md`、`docs/VERSIONS.md`；清单单点常量 `ARCHIVE_ARTIFACTS`（`grep -c` 只 1 处定义）；`--dry-run` 不真 commit |
| **REQ-062** 文档类写白名单 + GateOverride 审计 | **A62.1** 审后文档/夹具放行、src 仍拒（两态） | A62.1 | `cd dsh && node test/guard.js`（新用例 `A62.1`） | `docs/research/x.md`、根 `README.md`、根 `CHANGELOG.md`、`test/fixtures/legacy-project/**`、`test/fixtures/factories.ts`、`dsh/test/fixtures/**` 在 `review_passed`/`test_passed` **两态**均 `allow`（`reason:'doc-asset-phase'`）；`src/core/flow-manager.ts`、`src/x.md`、`src/assets/logo.svg` 两态均 `deny`（`reason:'phase'`）；`test/core/req.test.ts` **仍拒**（夹具 ≠ 测试代码）；`exec_running` 下全放行（回归） |
| | **A62.2** 三处 `--force` 统一写 `gate_overrides[]`+`reason`+`by`+`from/to` | A62.2 | `npx vitest run test/core/flow-manager.test.ts -t "GateOverride"` ＋ `node bin/openfeel.js flow stage reset <s> --to exec_running --force` | `detail.gate_override` 键集 **含 `from`/`to`**：`{gate_overrides, gate_missing, by, reason, from, to, at}`（REV-P06）；`flow advance --force`、`flow stage reset --force` 与各门 `allowGateOverride` 三处写出的键集**逐字相同**；`grep -rn "gate_overrides" src/` 只命中 `src/core/flow/gate-override.ts`（构造）+ 两个写入口 |
| | **A62.3** `reset --to <后置相> --force` 不再无审计 | A62.3 | `node bin/openfeel.js flow stage reset <s> --to exec_running --force`（构造用例，独立于 A62.2） | exit 0 且 `flow.json.log` **末条**含 `gate_overrides`（非空数组）+ `from`/`to` + `by` + `reason` + `at`；无 `--force` 时同命令被拒（exit 1，零伪造审计）；单测 `resetStagePhaseAudit` 断言「放行 ⇒ 必有 override 条目」 |
| | **A62.4** GateOverride 类型定义 + 单测，既有门不变 | A62.4 | `npx vitest run test/core/flow-manager.test.ts -t "GateOverride"` | `src/core/flow/gate-override.ts` 导出 `GateOverride` 类型与 `buildGateOverrideAudit()`；单测覆盖「有 missing / 无 missing」两态；既有 done 门三态（`T027.1`）与 blocking REV 判据用例**零改动**通过 |
| **REQ-063** 需求审查相位 + req JSON 错误码 | **A63.1** `review_pending` 状态域 + 合法链 + 回退 + 旧直连移除 | A63.1 | `node bin/openfeel.js req advance REQ-R --to review_pending --json` → `--to done --json` → `--to in_progress`；再在 `in_progress` 态 `--to done`（含 `--force`） | `REQ_STATUSES`（`src/core/req/types.ts:11`）含 `review_pending`；`getAllowedNextStatuses('in_progress')` 含 `review_pending` 而**不含** `done`；`review_pending` 含 `done`/`in_progress`；`in_progress → done` 直连 exit 1 且文案含 `review_pending`；`--force` 跳链 → exit 0 且 `flow.json.log` 末条 `detail.gate_override.gate_overrides=['req_review']` |
| | **A63.2** 缺审/缺验 → exit 1 + 稳定两码 | A63.2 | `node bin/openfeel.js req advance REQ-R --to done --json`（分三态：缺 review / 缺 verify / 两者 pass） | 缺 review → exit 1、stdout 恰一个 JSON、`error.code==='REQ_REVIEW_REQUIRED'`；缺 verify → exit 1、`error.code==='REQ_VERIFY_REQUIRED'`；`review.result==='pass'` 且 `verification.result==='pass'` → exit 0（**不再期望「无审验第二跳 exit 0」**——REV-P02）。内部实现：`requirementDoneBlocker` 三值（`stage_phase`/`review`/`verification`）与判定顺序**语义不变**，仅在命令层把 `review`/`verification` 码化 |
| | **A63.3** 三命令 `--json` + 三码进契约表 | A63.3 | `req claim/advance/complete --json`（成功/失败各一次）；`npx vitest run test/cli/error-envelope.test.ts` | 三命令 `--json` 均「stdout 恰一个 JSON 文档」；`REQ_BODY_GATE`/`REQ_PLAN_GATE`/`REQ_PLAN_DEVIATION` 进 `src/core/errors.ts` **且**进 error-envelope 契约表（`test/cli/error-envelope.test.ts`） |
| | **A63.4** 既有门语义不变 + JSON 形状向后兼容 + 计数同批 | A63.4 | `npx vitest run test/core/req-lifecycle.test.ts test/core/flow-manager.test.ts`；`node bin/openfeel.js req board --json`；`node bin/openfeel.js lint req --json`；`node bin/openfeel.js dashboard --json` | 既有 done 门三态与 flow-manager done 门穷举用例**零改动通过**；`req board --json` 分组键＝旧键 **+ `review_pending`**（新增不替换）；`lint req`/`dashboard` 键集只增不改；出口计数三处同批（§1.2） |
| **REQ-064** `req plan` + `--from` + `lint fill --fix-plan` + `--text` 多行 | **A64.1** 生成固定路径 + 四节写实 + 拒绝覆盖 | A64.1 | 临时工程内 `node bin/openfeel.js req plan REQ-099 --json`；`node bin/openfeel.js req plan REQ-061`（本阶段计划已存在）；`... --force --json` | `path` 恰为 `.openfeel/plan/reqs/REQ-099.plan.md`（POSIX 相对路径）；生成内容含 `## 目标`/`## 任务拆解`/`## 验收判据`/`## 偏差与回写` 且 `isRequirementPlanFilled(content)===true`（复用 `src/core/plan/filled.ts`，**不新写第二份规则**）；已存在 → exit 1、文案含 `--force`、**字节不变**；`--force` → exit 0 且 `replaced:true` |
| | **A64.2** `--from` 一次导入多节 + 元信息受保护 + 每节写变更记录 | A64.2 | `node bin/openfeel.js req body REQ-099 --from draft.md --json` | 一次调用写多小节（`sections:['摘要','目标与验收',...]`，`calls:1`）；按 `##` 分节；`## 状态`/`## 预估版本`/`## 父需求`/`## 变更记录` 等元信息小节**不被覆盖**（`PROTECTED_BODY_SECTIONS` 拒绝或跳过并报告）；每个写入小节在 `## 变更记录` 各追加 1 条 |
| | **A64.3** `--fix-plan` 只补缺失、不覆盖、不编内容 + `--json` created/skipped | A64.3 | `node bin/openfeel.js lint fill --fix-plan --json` | 只为「计划文件不存在」的需求生成骨架；已有计划（含空壳）进 `skipped[]`、字节不变；`--json` 含 `created[]`/`skipped[]`；`lint fill` **仍恒 exit 0**（advisory 语义不变，回归 `C16`） |
| | **A64.4** `--text` 多行保真 + adapter 走安全通道 + 多行/CRLF/`###` 用例 | A64.4 | `node bin/openfeel.js req body REQ-099 --section 摘要 --text <多行md> --json`；`cd dsh && node test/verify.js`（`A64.4` 用例） | 文件内字节与输入**逐字相等**（含空行、`###` 子标题、行首 `- ` / `1. ` 等列表行、Windows `\r\n`）；`lines` 与 `body.split(/\r?\n/).length` 一致；adapter 的 `feel_req action=body text=` **不再把多行文本塞进 argv**，改走临时文件（`--file`）或等价安全通道（见 §二 R4b） |
| | **A64.5** 三命令单测（幂等/保护小节/缺文件）+ 既有不回归 | A64.5 | `npx vitest run test/commands/req-plan.test.ts test/commands/req-body.test.ts test/commands/lint.test.ts` | 三命令各有单测：幂等（重复 `--from`/重复 `--fix-plan`）、保护小节（元信息拒写）、缺文件（`--from missing.md` → exit 1 且零写盘）；既有 `req body`/`req add`/`lint` 用例零失败 |
| **REQ-065** 测试夹具工厂 + dashboard 流程债 | **A65.1** 工厂存在且 ≥3 文件复用（**含 dsh verify 夹具路径**） | A65.1 | `npx vitest run test/fixtures/factories.test.ts`；`grep -rl "makeFilledRequirement\|makeRequirementPlan" test/ dsh/test/`；`cd dsh && node test/verify.js` | 两个具名导出可 import，产物直接喂 `applyStatusChange` 可过正文门/计划门；`grep` **≥3 个文件命中**；`test/core/req.test.ts`、`test/core/flow-manager.test.ts`、`test/commands/req.test.ts` 已改用工厂；**`dsh/test/verify.js` 真正 import 同一份共享 helper**（`test/fixtures/req-input.js`，零依赖纯 ESM）构造 `req add --summary/--goal/--acceptance` 参数——不是注释声明（REV-P07） |
| | **A65.2** dashboard「流程债」段（四类）+ human/`--json` 双出口 | A65.2 | `node bin/openfeel.js dashboard --json`；`node bin/openfeel.js dashboard` | `flowDebt` 恰 4 键：`emptyBody`（空壳正文数）/`missingPlan`（缺计划数）/`unstamped`（未盖章需求数）/`devStale`（dev 同步过期状态），各含 `count` 与 `items[]`；human 输出有同名面板分区（四组计数 + 各前 5 条） |
| | **A65.3** 计数与 `lint fill --json` 同源 | A65.3 | `node bin/openfeel.js dashboard --json` ＋ `node bin/openfeel.js lint fill --json` | `flowDebt.emptyBody.count` / `missingPlan.count` 与 `lint fill` 同值（单点 `lintRequirementBodies`）；`grep -rn "isSectionFilled\|isRequirementPlanFilled" src/core/dashboard/` 零命中（禁第二份统计） |
| | **A65.4** 新测覆盖 debt 段与工厂 + 既有 2682 用例不回归 | A65.4 | `npx vitest run test/commands/dashboard.test.ts test/fixtures/factories.test.ts`；`npm test` | 新增用例覆盖四类债与工厂；`lint fill` 仍恒 exit 0（`C16` 逐字保留）；`npm test` 0 fail 且用例数 ≥ 2682 |
| **REQ-066** DSH 派发闭环 + 遵守率 | **A66.1** `finish` 写 `closing` 四键（按 dispatchId 关联、重复幂等） | A66.1 | `cd dsh && node test/verify.js`（`A66.1`） | `feel_dispatch action=finish` 后该行 `closing` 恰 4 键：`status∈{done,failed}`、`artifacts[]`、`durationMs`、`summary`；按 `dispatchId` **原地补写**（行数/行序不变、其余行字节不变）；重复 finish → `ok:true, changed:false`，`ts`/`closing` 不二次改写 |
| | **A66.2** `feel_status.dispatch` 增 `open[]`+`closedRatio`，`missingRoles` 依 closing | A66.2 | `cd dsh && node test/verify.js`（`A66.2`）；`feel_status()` | `feel_status.dispatch` 含 `open[]`（未完成派发：有记录无 `closing` 或 `closing.status!=='done'`）与 `closedRatio`（`= 已 closing 且 done 的条数 / total`，`total===0` → `null`）；`missingRoles` **只在没有 `closing.status==='done'` 记录的角色上出现**（旧口径「有 record 即算」作废）；既有 `required/total/sincePhase/records` 键保留 |
| | **A66.3** 遵守率四指标出口 | A66.3 | `feel_verify action=adherence`（**选定出口，不新增 `openfeel verify` CLI 子命令**）；`cd dsh && node test/verify.js`（`A66.3`） | 输出 `{main_write_ratio, subagent_per_req, sync_gap, violation_rate}`，每键 `{value, definition}`；`definition` 复述 v1.6.0 审计口径（分子/分母 + 样本窗口）；样本不足 → `value:null` 且不抛错；`dsh/test/contract.js` 工具数不变（action 不是新工具） |
| | **A66.4** 有单测与文档、零外部依赖 | A66.4 | `cd dsh && node test/verify.js && node test/contract.js && node test/guard.js`；`git diff dsh/package.json` | `verify.js` 覆盖 A66.1—A66.3 各一例；`dsh/ADAPTER.md` 写 `finish` 契约 + 四指标定义 + `open[]`/`closedRatio` 口径；`dsh/package.json` **零新增依赖**（现无 `dependencies` 段） |
| **REQ-067** guard wrapper 静态分类 | **A67.1** wrapper 内容命中 → class 1/2 拒绝并审计 | A67.1 | `cd dsh && node test/guard.js`（`A67.1` 组） | `pwsh -File write-openfeel.ps1`（内含 `openfeel req body`）→ `deny`（class 1）；`pwsh -File set-content-src.cmd` / `.ps1`（含 `Set-Content .openfeel/flow.json` 或写 `src/**`）→ `deny`（class 1/2）；内联 `bash -c "…"`、`node -e "…"` 命中同样 deny（既有内联面回归到本判据）；拒绝时 `.openfeel/log/guard-audit.jsonl` 增行 `event:'guard_deny'` + `kind:'class1'|'class2'` |
| | **A67.2** 普通 wrapper 不受影响（回归） | A67.2 | 同上（`A67.2` 组） | `readonly.ps1`、`build.ps1`（无 openfeel 写、无受保护路径）→ `allow` 且**不写 deny 审计**；`node -e "console.log(1)"` → `allow`（不误杀）；既有非 wrapper 用例零失败 |
| | **A67.3** 不可读脚本 → class 4 warn + 审计含 wrapper 与目标路径 | A67.3 | 同上（`A67.3` 组） | 脚本不可读 / 超 `MAX_SCRIPT_BYTES` / 编码不明（`bin.dat`、GBK）→ 决策 `warn`（`SHELL_GATE_UNDECIDABLE`）**且必须写审计**：`kind:'undecidable'`、`detail.wrapper`（如 `'pwsh -File'`/`'cmd /c'`）、`detail.scriptPath`（解析后的绝对路径）、`detail.reason` 非空；`strict` 档下同例仍 `deny` |
| | **A67.4** ≥6 条 guard 用例（含编码混淆） | A67.4 | 同上（`A67.4` 计数断言） | 新增 **≥6 条**独立用例：`.ps1` / `.cmd` / `bash -c` / `node -e` / **编码混淆（UTF-16LE+BOM 的 `.ps1` 应解码后命中 deny；GBK 的 `.cmd` 落入 undecidable）** / 普通脚本（allow）；fixture 落在 `dsh/test/fixtures/wrapper/`，用例数与 fixture 数有断言，不靠人工数 |

### 1.2 判据纪律

- 判据单点：写实性判据只认 `src/core/plan/filled.ts`（`isRequirementPlanFilled`）；在办需求/空壳枚举只认 `src/core/plan/body-lint.ts`（`lintRequirementBodies`）；wrapper 分类只认 `dsh/lib/guard.js` 的 `classifyShellCommand`；done 门判据只认 `requirementDoneBlocker`（`src/core/req/requirement-ops.ts:217-232`）。任何第二份表达式都视为缺陷（reviewer 用 `grep` 断言）。
- 失败错误码是契约：`req claim/advance/complete` 的 `--json` 通道（REQ-063）落地后，历史「gate 码只能靠 human 文案取证」的妥协**必须同一版本消除**——`REQ_BODY_GATE`/`REQ_PLAN_GATE`/`REQ_PLAN_DEVIATION` + `REQ_REVIEW_REQUIRED`/`REQ_VERIFY_REQUIRED` 进 `src/core/errors.ts` 与 `test/cli/error-envelope.test.ts`。**不设 `REQ_REVIEW_GATE`**（作废：正文只认 A63.2 的两码，REV-P02）。
- **JSON 出口计数锁（2026-11-24 修订，REV-P09，二选一已写死）**：
  - **选择 A（采用）：`release` 不登记 CLI `--json` 出口。** 理由：`npm run release` 是 `package.json` 启动的独立脚本（`scripts/release.mjs`），**不是 `openfeel` CLI 子命令**；其 `--json` 是脚本自有的机器可读输出，由 `test/scripts/release.test.ts` 锁形状，不进 `docs/json-contract.md` 的 CLI 出口表、也不进 `test/cli/json-contract.test.ts`。
  - 基线 **46 成功 / 47 注册**（`docs/json-contract.md:3`、`test/commands/knowledge.test.ts:384-401`）；本阶段实际新增 5 个 CLI 出口：`req claim`(#47)/`req advance`(#48)/`req complete`(#49)/`req plan`(#50)/`lint adherence`(#51) → 目标 **51 成功 / 52 注册**（实测，见 §八 偏差登记）。
  - 三处必须同批：`docs/json-contract.md:3`（头行计数）＋ `test/commands/knowledge.test.ts:384-401`（计数锁）＋ `test/cli/json-contract.test.ts`（形状锁）。**发布脚本 `npm run release` 不登记出口**（它不是 CLI 子命令，形状锁只在 `test/scripts/release.test.ts`，**不涉及 51/52**）。
  - 若执行期实测 `release` 确被做成 CLI 子命令（发现即停手上报 Feel），才另行计入并同批改三处——选择 A 默认不变。

---

## 二、任务拆解

> 每个任务都可按 `goal / context / boundaries / returnFormat` 四段直接粘贴派发；派发必须带本节「验收命令」与 §一 对应判据编号。
> 单写者：同一文件同一波次只允许一个 executor 写（见 2.0，**严格串行**）。

### 2.0 单写者矩阵（严格串行；2026-11-24 修订，REV-P10）

| 文件 | 写者顺序 | 说明 |
|------|----------|------|
| `scripts/release.mjs`（新）、`package.json`（scripts） | 仅 R1（A1 → A2 → E13） | 新增文件，零冲突 |
| `dsh/lib/guard.js` | R2（B3：相位/白名单层 `:2929-2943`）→ R7（D12：wrapper 分类段 `:1498-1620`） | **同文件串行，不得并行**；R2 的改动区是**命令分类/相位判定区 `:2929-2943`**（**不是** `:279-449`——那里是 `CODE_DIRECTORIES`/`isCodeDirectoryPath`/`isExemptPath`，R2 明确不改）；R7 只碰 wrapper 段 |
| `dsh/test/guard.js` | R2（A62.1 三组）→ R6（台账受保护回归）→ R7（A67.1—A67.4 组） | **同一个测试文件被三个任务写 ⇒ 必须登记为串行资源**，按 R2 → R6 → R7 顺序合入（REV-P10） |
| `src/core/flow-manager.ts` | R2（B4 审计 helper 接线） | 提交点唯一 |
| `src/core/req/types.ts` | R3（B5 状态域） | 提交点唯一 |
| `src/core/req/requirement-ops.ts` | R3（B5 流转表 + B6 done 门码化） | 同文件串行 |
| `src/commands/req.ts` | R3（B6 `--json`）→ R4（C7 `req plan` / `--from` / `--text`） | 串行 |
| `src/core/req/body-file.ts` | R4（R4b：`--text` 多行保真） | 提交点唯一 |
| `src/commands/lint.ts` | R4（C7 `--fix-plan`） | 提交点唯一 |
| `test/fixtures/req-input.js`（新，共享 helper）、`test/fixtures/factories.ts`（新） | R5（C8 先建）→ R5（C9 复用） | 先建后用；`req-input.js` 同时被 `dsh/test/verify.js` import |
| `src/core/dashboard/aggregate.ts`、`render.ts`、`src/commands/dashboard.ts` | 仅 R5（C9） | 提交点唯一 |
| `dsh/lib/adapters/dispatch-ledger.js`、`dsh/lib/adapters/adherence.js`（新）、`dsh/lib/tools/index.js` | 仅 R6（D10 → D11） | 同文件串行 |
| `dsh/test/verify.js` | R5（A64.4/A65.1 共享 helper 接入）→ R6（A66.1—A66.4） | 串行 |
| `src/core/i18n-data/zh-CN.ts` + `en.ts` | **全阶段共享**：各任务只在所属域末尾**追加**键块，不重排既有条目 | 所有 executor 均需遵守 |

**严格串行**：同一波次只派一个 executor，按 §三 的 13 步顺序推进（`A1 → A2 → B3 → B4 → B5 → B6 → C7 → C8 → C9 → D10 → D11 → D12 → E13`）。若某任务内部需要两人（如 R2 的 guard 与 flow-manager），拆成**两个先后派单**（B3 完成后才派 B4），不并行（原稿 §2.0 的「可并行组」与 §三「严格串行」自相矛盾，已删除——REV-P10）。

### R1（= A61.1、A61.2、A61.3、A61.4、E13）发布一条命令 + CHANGELOG

- **做什么**：新增 `npm run release` 脚本，把「版本一致性校验 → build → 双包 publish → `market:index` → 归档产物提交 → tag/push」串成一条命令；**默认不真发**（真实发布只认 `--publish`）、`npm whoami` 失败**早停并打印 `npm login` 指引（绝不打印 token）**；`--dry-run` 本地演练；`--notes-only` 生成 CHANGELOG 草稿、人工确认才写入。收口步 E13 做文档对账与全量回归。
- **涉及文件**：
  - 新建 `scripts/release.mjs`：`parseArgs(argv)`（**开关闭集**：`--dry-run`/`--publish`/`--notes-only`/`--write-notes`/`--tag`/`--with-market`/`--json`）、`STEPS`（`version`/`build`/`publish`/`market`/`archive-commit`/`tag`）、`checkVersionConsistency({pkgVersion, dshVersion, changelogHead, versionsDocHead})`、`generateChangelogDraft(projectPath, version)`（读 `.openfeel/flow-archive/**` 的 REQ 标题 + stage 摘要 REV 结论拼 Keep-a-Changelog 段）、`runRelease({argv, cwd, exec})`（`exec` 注入，便于单测；返回 `{steps:[{id,status,cmd,substeps,paths?}], ok, exitCode}`）。
  - **默认安全语义（REV-P04，按正文 A61.1/A61.2/A61.3）**：① 无 `--publish` → 零**真实** publish：给了 `--dry-run` 则子步为 `npm publish --dry-run`；既无 `--dry-run` 又无 `--publish` 时 `status:'skipped'`（`cmd` 仅作说明书）；② 有 `--publish` → `publish` 首子步 `npm whoami`，失败 `exit 1` 且后续全 `skipped`，文案打印 `npm login` 指引并**对输出做 token 形态脱敏断言**（单测断言 stdout/stderr 无 `_…`/`npm_…` 令牌）；③ `--notes-only` → 只产出草稿（打印或写临时文件），`CHANGELOG.md` 字节不变；只有 `--write-notes` 才落 `docs/releases/<version>.md`（脚本永不改 `CHANGELOG.md`）；④ `--dry-run` 与 `--publish` 互斥（同时给 → `INVALID_ARGUMENT` exit 1）。
  - 改 `package.json`：`scripts` 增 `"release": "node scripts/release.mjs"`（现只有 `build`/`test`/`test:coverage`/`dev`/`market:index`/`market:index:check`）。
  - 版本一致性校验的三源：根 `package.json.version`（1.6.0）、`dsh/package.json.version`（1.6.0）、`CHANGELOG.md` 首段 `## [x.y.z]`、`docs/VERSIONS.md` 首个版本小节；不一致 → `VERSION_MISMATCH` 且 exit 1，且后续步骤全 `skipped`。
  - 归档产物提交的 `git add` 清单（单点常量 `ARCHIVE_ARTIFACTS`）：`.openfeel/log/archive-*.md`、`.openfeel/flow-archive/`、`.openfeel/checkpoints/`、`docs/releases/<version>.md`（产出锚点 `src/core/archive/merge.ts:439-441`）、`CHANGELOG.md`、`docs/VERSIONS.md`。
  - 发版提交发生在 `done` 相位：guard 的 `git commit` 相位白名单是 `['exec_running','review_passed','test_passed','archiving']`（`dsh/lib/guard.js:2292`）——因此**脚本由人类在外部终端执行**，agent 只交付脚本与 `--dry-run` 证据（见 §六 R2）。
  - E13：改 `docs/commands.md`、`docs/json-contract.md`、`docs/VERSIONS.md`、`CHANGELOG.md`、`docs/GETTING_STARTED.md`、`dsh/ADAPTER.md`、`dsh/README.md`。
  - 测试：新建 `test/scripts/release.test.ts`（注入 `exec` 的单测）、`test/commands/release.test.ts`（`--dry-run`/`--notes-only` 人类输出），改 `test/core/release-metadata.test.ts`（版本一致性断言同源）。**`release` 不登记 CLI `--json` 出口**（§1.2 选择 A，REV-P09）⇒ 不改 `test/cli/json-contract.test.ts` 的计数。
- **负责角色**：executor-c（脚本线）。**依赖**：无。
- **验收命令**：`npm run release -- --dry-run --json`；`npm run release -- 1.7.0 --notes-only --json`；`npx vitest run test/scripts/release.test.ts`。
- **风险注**：**不新增生产后门**——注入式 fail 只存在于 `runRelease()` 的 `exec` 参数（单测内使用），CLI 不暴露 `--fail-at`；**真实 publish 的唯一开关是 `--publish`**。

### R2（= A62.1、A62.2、A62.3、A62.4）文档类写白名单 + GateOverride 审计统一

- **做什么**：`review_passed`/`test_passed` 下放行「文档/注释/测试夹具」类写入（`docs/**`、根级 `*.md`、`test/fixtures/**`、`dsh/test/fixtures/**`），`src/**` 仍拒；并把 `flow advance --force` / `flow stage reset --force` / 各门 `allowGateOverride` 收敛为同一 GateOverride 审计 schema（**含 `from`/`to`**）。
- **涉及文件**：
  - 改 `dsh/lib/guard.js`：新增 `DOC_WRITE_PHASES = ['exec_running','review_passed','test_passed']` 与 `isFixturePath(absolute, cwd)`（只认根级 `test/fixtures/**` 与 `dsh/test/fixtures/**`，**不含** `test/core/**`、`test/commands/**`）；改**命令分类/相位判定区 `:2929-2943`**（`active.some(phase==='exec_running')` → 先判 `DOC_WRITE_PHASES` 内是否全部为 doc/fixture 目标）；**不改** `CODE_DIRECTORIES`（`:279`）、`isCodeDirectoryPath`（`:348`）、`isExemptPath`（`:445`）——豁免在相位层做；审计 `reason` 新增 `'doc-asset-phase'`。
  - 改 `src/core/flow-manager.ts`：helper 接线点 `advanceStagePhase`（`:1931-2051` 的 `gate_overrides`/`gate_missing` 组装）与 `resetStagePhase`（`:2358-2436`）。
  - 新建 `src/core/flow/gate-override.ts`：导出 `GateOverride` 类型 + `buildGateOverrideAudit({gates, missing, by, reason, from, to})` → `{gate_overrides, gate_missing, by, reason, from, to, at}`（**`from`/`to` 为必填字段**，REV-P06）。
  - 改 `src/commands/flow.ts`：`:947`/`:959`（stage reset `--force`）、`:1302`/`:1348-1349`（advance `--force`）改调同一 helper；`--force` 文案统一为「留痕放行」。
  - 改 `src/core/i18n-data/{zh-CN,en}.ts`（新增白名单拒绝/放行文案与 `--force` 统一文案）。
  - 测试：`dsh/test/guard.js`（新用例 `A62.1` 三组）、`test/core/flow-manager.test.ts`（`A62.2` 键集相同 + `A62.3` reset 审计独立用例）、`test/commands/flow.test.ts`（reset/advance 两命令审计形状）、`test/cli/error-envelope.test.ts`。
- **负责角色**：executor-b（guard）+ executor-a（flow-manager/flow.ts 审计）——**拆两个先后派单**（B3 → B4），写点不重叠但不并行。
- **依赖**：无（R7 依赖本任务的 guard 改动落地）。
- **验收命令**：`cd dsh && node test/guard.js`；`npx vitest run test/core/flow-manager.test.ts -t "GateOverride"`；`node bin/openfeel.js flow stage reset <s> --to exec_running --force`。

### R3（= A63.1、A63.2、A63.3、A63.4）需求审查相位 + `req` JSON 错误码

- **做什么**：需求生命周期加 `review_pending`（`in_progress → review_pending → done`，可回退；旧直连移除、`--force` 留痕）；给 `req claim/advance/complete` 补 `--json` 与错误码；`review_pending` 下 `--to done` 缺审/缺验分别返回稳定两码。
- **涉及文件**：
  - 改 `src/core/req/types.ts:11`：`REQ_STATUSES` 插入 `'review_pending'`（`in_progress` 之后、`done` 之前）。
  - 改 `src/core/req/requirement-ops.ts`：`ALLOWED_TRANSITIONS`（`:830-836`）改 `in_progress: ['review_pending','blocked','cancelled','rejected']`、新增 `review_pending: ['done','in_progress','blocked','cancelled','rejected']`；`RequirementGateCode`（`:51`）扩 `'review_required' | 'verification_required'`；`applyStatusChange`（`:860-898`）在 `:878` 只把 done 门失败**码化**——`requirementDoneBlocker(...)` 返回 `'review'`/`'verification'` 时分别返回新码，返回 `'stage_phase'` 时仍 `invalid_status`（**`requirementDoneBlocker` 的三值语义与判定顺序一字不改**，REV-P02）；新增 `--force` 跳链留痕（`allowReviewSkip`）→ 审计 `gate_override.gate_overrides=['req_review']`，**复用 R2 的 `buildGateOverrideAudit`**（含 `from`/`to`）。
  - 改 `src/commands/req.ts`：`claim`（`:552`）、`advance`（`:828`）、`complete`（`:1022`）各增 `--json` 与 `--force`；失败统一 envelope，`review`→`REQ_REVIEW_REQUIRED`、`verification`→`REQ_VERIFY_REQUIRED`（单点映射，与 §1.2 码表一致）。
  - 改 `src/core/errors.ts` + `src/commands/shared/errors.ts`：登记 `REQ_BODY_GATE`/`REQ_PLAN_GATE`/`REQ_PLAN_DEVIATION`/`REQ_REVIEW_REQUIRED`/`REQ_VERIFY_REQUIRED`（**无 `REQ_REVIEW_GATE`**，REV-P02；消除 REV-016 的「无 `--json` 出口」妥协）。
  - 受影响面（穷举，逐个核对）：`src/commands/req.ts` 的 `list --status` 取值、`board` 分组（`:1360`）、`next`（`:1396`）、`release-check`（`:1475`）；`src/core/dashboard/aggregate.ts`（需求状态计数）；`src/commands/lint.ts` 的 `lint req` 状态分组；`src/core/flow-manager.ts` 的聚合收口（`requirement_auto_complete`）与 `describeStageDoneGate`（`:1936-1955`，**不改**）。
  - 改 `src/core/i18n-data/{zh-CN,en}.ts`；`docs/commands.md`、`docs/json-contract.md`（新出口 #47—#49 + 码表）、`test/commands/knowledge.test.ts:384-401`、`test/cli/json-contract.test.ts`、`test/cli/error-envelope.test.ts`。
  - 测试：`test/core/req.test.ts`、`test/core/req-lifecycle.test.ts`（流转表穷举）、`test/commands/req.test.ts`（`--json` 三命令 + A63.2 两码三态）、`test/commands/dashboard.test.ts`（状态计数新增一档）、`test/commands/req-board.test.ts`（分组键只增不改）。
- **负责角色**：executor-a。**依赖**：R2 的 B4（复用 GateOverride helper）。
- **验收命令**：`node bin/openfeel.js req advance <fixture> --to review_pending`；`node bin/openfeel.js req advance <fixture> --to done --json`（缺审/缺验 → exit 1 + 两码之一）。

### R4（= A64.1、A64.2、A64.3、A64.4、A64.5）`req plan` + `req body --from` + `lint fill --fix-plan` + `--text` 多行保真

> **2026-11-24 修订（REV-P01）**：原计划把 A64.4/A64.5 只覆盖到 `--from`/`--fix-plan`，正文的「`--text` 多行截断修复 + adapter 走临时文件」零覆盖；本轮拆成 **R4a**（C7 原有三件事）与 **R4b**（多行保真 + adapter 通道），**同属步 C7**（13 步顺序不变）。

- **做什么**：需求级计划从「照模板手写」变成一条命令生成；正文整份一次导入；`lint fill` 批量补齐缺计划；**并修掉 `--text` 多行截断**（正文 A64.4），adapter 侧改走临时文件。
- **涉及文件（R4a）**：
  - 新建 `src/core/req/plan-skeleton.ts`：`buildRequirementPlanSkeleton(req, stageId?)` 生成四节（`## 目标`/`## 任务拆解`/`## 验收判据`/`## 偏差与回写`）+ `## 变更记录`；写实判据复用 `isRequirementPlanFilled`（`src/core/plan/filled.ts`）。
  - 改 `src/commands/req.ts`：在 `body`（`:1595`）旁注册 `req plan <id> [--force] [--json]`；`body` 增 `--from <file>`（按 `##` 切节后逐节写入，**复用** `writeRequirementBodySection`，一次调用算一次变更记录条目）。
  - 改 `src/commands/lint.ts`：`fill`（`:179`）增 `--fix-plan`（对 `report.fill.missingPlan` 批量生成骨架，**仍 advisory exit 0**；`--json` 增 `created[]`/`skipped[]`）。
  - 改 `src/core/i18n-data/*`、`docs/commands.md`、`docs/json-contract.md`（`req plan` = 出口 #50）。
  - 测试：`test/commands/req-plan.test.ts`（新）、`test/commands/req-body.test.ts`（`--from`）、`test/commands/lint.test.ts`（`--fix-plan` advisory + created/skipped）。
- **涉及文件（R4b，A64.4）**：
  - 改 `src/core/req/body-file.ts`：`updateRequirementBody` 的 `const body = raw.trim()`（`:250`）改为**只拒绝全空白、不做首尾裁剪**（保留空行与缩进），并按输入原样落盘（CRLF 保真：不把 `\r\n` 归一成 `\n`，`lines` 计数与 `body.split(/\r?\n/).length` 同源）；`--text` 的 `###` 子标题、行首列表符、`---` 分隔线、空行全部原样保留。
  - 改 `dsh/lib/tools/index.js`（`feel_req` 的 `body` 分支 `:1151-1192`）：`text` 存在时**不再 `pushOption(argv,'--text',text)`**（`:1178`），改为 `writeFileSync(tempFile, text)` 后 `--file <temp>`，`finally` 清理；临时文件落 `os.tmpdir()`（不落工作区，避免 guard/污染）。根因取证：adapter 侧 `optionalArg`（`dsh/lib/tools/shared.js:304`）与引擎侧 `raw.trim()`（`src/core/req/body-file.ts:250`）是两处已知裁剪点。
  - 测试：`test/commands/req-body.test.ts` 增三例——① 多行（含空行与 `###` 子标题）字节级相等；② CRLF 输入保真；③ `--text` 只有空白 → `empty_text` exit 1 零写盘；`dsh/test/verify.js` 增 `A64.4` 用例（`feel_req action=body text=` 多行 → 写出的 Markdown 多行不丢）。
- **负责角色**：executor-a（R4a：`src/**`）+ executor-a（R4b：`src/core/req/body-file.ts`）→ executor-b（R4b 的 adapter 段 `dsh/lib/tools/index.js`，**先 R4a 后 R4b，串行派单**）。**依赖**：R3（同 `src/commands/req.ts` 串行）。
- **验收命令**：`node bin/openfeel.js req plan REQ-061`（应 exit 1，本阶段计划已存在）；`node bin/openfeel.js lint fill --fix-plan --json`；`node bin/openfeel.js req body <id> --section 摘要 --text <多行md> --json`；`cd dsh && node test/verify.js`（`A64.4`）。

### R5（= A65.1、A65.2、A65.3、A65.4）测试夹具工厂 + dashboard 流程债面板

- **做什么**：把「写实需求 + 计划」固化成**真正共享**的测试工厂（含 `dsh/test/verify.js` 路径）；把四类流程债汇总到 dashboard。
- **涉及文件（C8）**：
  - 新建 `test/fixtures/req-input.js`（**纯 ESM、零依赖、无 TS**）：导出 `makeFilledBodyInput()` → `{summary, goal, acceptance}` 与 `makeRequirementPlanInput()` → 四节 Markdown 字符串。这是**字段口径的唯一实现**，`test/fixtures/factories.ts` 与 `dsh/test/verify.js` 都 import 它（`../../test/fixtures/req-input.js`）——**不是注释声明**（REV-P07）。
  - 新建 `test/fixtures/factories.ts`：`makeFilledRequirement(overrides?)`、`makeRequirementPlan(overrides?)`、`makeEmptyRequirement()`（负例）、`makeStageWithPhase(phase)`；内部复用 `req-input.js` 的字段口径。
  - 改（复用）：`test/core/req.test.ts`、`test/core/flow-manager.test.ts`、`test/commands/req.test.ts` 三处改用工厂（≥3 个文件）；`dsh/test/verify.js` 改为 import `req-input.js` 构造 `req add --summary/--goal/--acceptance` 参数（行为不变，只是口径共享）。
  - 新建 `test/fixtures/README.md`：写明「口径单点在 `req-input.js`」与两栈如何共用。
  - 测试：`test/fixtures/factories.test.ts`（新）。
- **涉及文件（C9）**：
  - 改 `src/core/dashboard/aggregate.ts`：`collectDashboardData` 增 `flowDebt:{emptyBody,missingPlan,unstamped,devStale}`，数据源单点＝`lintRequirementBodies`（`src/core/plan/body-lint.ts`）+ `getDevStatus`（`src/core/dev-status.ts`）；`unstamped` = `req.plan === undefined` 且非终态。
  - 改 `src/core/dashboard/render.ts`：新增「流程债」面板分区（四组计数 + 各前 5 条）；改 `src/commands/dashboard.ts` 人类摘要（3 行 → 4 行，保留绝对路径）。
  - 改 `src/core/i18n-data/*`；测试：`test/commands/dashboard.test.ts`（`flowDebt` 四键 + 与 `lint fill` 同值）、`test/core/lint-req.test.ts`（`C16` advisory 回归）。
- **负责角色**：executor-a（dashboard）+ executor-b（夹具）；**先后派单**（C8 → C9），不并行。**依赖**：C9 依赖 C8 的工厂做夹具。
  - **注意**：C8 写 `test/**`，在 `review_passed` 相位需 R2 的 `test/fixtures/**` 白名单——因此 **C8 必须在 R2 的 B3 之后**执行。
- **验收命令**：`node bin/openfeel.js dashboard --json`（`flowDebt` 四键）；`grep -rl "makeFilledRequirement" test/`（≥3）；`cd dsh && node test/verify.js`。

### R6（= A66.1、A66.2、A66.3、A66.4）`feel_dispatch finish` + 派发视图 + 遵守率指标

- **做什么**：派发台账从「只记开始」补成闭环（finish 写产物/耗时/失败），`feel_status.dispatch` 补 `open[]`/`closedRatio` 并让 `missingRoles` 依据 `closing` 计算；实现可量化遵守率并通过 **`feel_verify action=adherence`** 出口暴露。
- **涉及文件（D10 → A66.1/A66.2）**：
  - 改 `dsh/lib/adapters/dispatch-ledger.js`：`normalizeRecord`（`:80`）增 `closing?`；新增 `finishDispatch(projectPath, {dispatchId, status, artifacts, durationMs, summary, now})`（按 `dispatchId` **原地补写**，幂等：已 `closing` 且内容相同 → `changed:false`；不改变行序/行数；沿用 `writeDispatches`（`:159`）的 temp+rename）；`summarizeDispatch`（`:250`）透出 `closing`；`dispatchSummary`（`:277`）增 `open[]`（`closing` 缺失或 `status!=='done'`）与 `closedRatio`（`done` 数 / `total`，`total===0` → `null`），`missingRoles` **只按 `closing.status==='done'` 的记录**判断（旧口径作废）。
  - 改 `dsh/lib/tools/index.js`：`feel_dispatch`（`:1946-1960`，`action` 枚举在 `:1951`）增 `finish`（参数 `dispatchId/status/artifacts/durationMs/summary`）；`feel_status`（`:525`）的 `dispatch` 段直接消费新形状（`open[]`/`closedRatio` 进 `feel_status.dispatch`，不另开顶层键）。
  - 改 `dsh/ADAPTER.md`：`finish` 契约 + `open[]`/`closedRatio`/`missingRoles` 口径。
  - 测试：`dsh/test/verify.js`（`A66.1`—`A66.2`）、`dsh/test/contract.js`（工具数不变，多一个 action 不应改计数）、`dsh/test/guard.js`（台账仍受保护回归——**R6 在 `dsh/test/guard.js` 的串行顺位第二**）。
- **涉及文件（D11 → A66.3/A66.4）**：
  - 新建 `dsh/lib/adapters/adherence.js`：`computeAdherence({dispatches, sessions, toolCalls})` → `{main_write_ratio, subagent_per_req, sync_gap, violation_rate}`（每键 `{value, definition}`；样本不足 → `value:null`）。
  - 改 `dsh/lib/tools/index.js`：`feel_verify`（`:1646`，`action` 枚举 `:1650`）增 `adherence`（**选定出口**：不新增 `openfeel verify` CLI 子命令、不新增 CLI `--json` 出口，REV-P03）；`feel_verify` 的 `adherence` 结果与 `feel_status.adherence`（可选只读镜像）同源。
  - 改 `dsh/ADAPTER.md`（四指标定义 + 出口说明）；改 `dsh/test/verify.js`（`A66.3`—`A66.4`）。
- **负责角色**：executor-b。**依赖**：无（但 `dsh/test/guard.js` 与 `dsh/test/verify.js` 按 §2.0 串行）。
- **验收命令**：`cd dsh && node test/verify.js && node test/contract.js && node test/guard.js`。

### R7（= A67.1、A67.2、A67.3、A67.4）guard wrapper 静态分类

- **做什么**：封掉 `pwsh -File`、`cmd /c x.cmd`、`bash -c`、`node -e` 的包装绕过面：包装执行时静态读取脚本内容并按其内容分类；不可判定也留审计（**含 wrapper 与目标路径**）。
- **涉及文件**：
  - 改 `dsh/lib/guard.js`（**只动 wrapper 段 `:1498-1620`**，R2 改过的 `:2929-2943` 不动）：
    - 现网已有：`matchInlineInterpreter`（`:1506`，`node -e`/`python -c`）、`extractWrapperPayload`（`:1538`，`bash -c`/`pwsh -Command`）、`payloadIsUnresolvable`（`:1562`）、`isOpenFeelWriteInvocation`（`:1572`）、`matchOpenFeelWrite`（`:1620`）、`WRAPPER_MAX_DEPTH=4`（`:1250`）。
    - 新增：`WRAPPER_SCRIPT_FLAGS`（`pwsh -File`/`-f`、`cmd /c`/`/k`）+ `resolveWrapperScript(statement, baseDir)`（读 `.ps1/.cmd/.bat/.sh`，限 `MAX_SCRIPT_BYTES`）→ `{wrapper, scriptPath, content} | {undecidable, wrapper, scriptPath, reason}`；解码顺序：UTF-8 → UTF-16LE/BE（BOM）→ `TextDecoder('gbk', {fatal:true})` → 仍不可解即 `undecidable`（**不新增外部依赖**，`dsh/package.json` 现无 `dependencies`）。
    - `classifyScriptContent(content, {baseDir, depth})` 复用同一 `classifyShellCommand`（按行/语句切分后递归，`depth+1`，命中上限即 `undecidable`）。
    - 分类出口：命中 openfeel 写动词 → class 1；可解析目标（含受保护路径）→ class 2；脚本不可读/超限/编码不明 → 第 4 类 `SHELL_GATE_UNDECIDABLE='warn'`（`:91`）**但必须写审计**：`kind:'undecidable'` + `detail:{wrapper, scriptPath, reason}`（**A67.3 的字段契约**，REV-P08）。
  - 注意 `SOURCE_EXTENSIONS` 已含 `.ps1`（`:264`）——脚本文件本身作为**写入目标**已是 class 2；本任务补的是「作为**执行载体**」的读取面。
  - 改 `src/core/i18n-data/*`（新文案）；改 `dsh/ADAPTER.md`（四类口径 + 编码/大小限制）；改 `dsh/test/guard.js`（新用例组，**串行顺位第三**）与 `dsh/test/fixtures/wrapper/` fixture：`write-openfeel.ps1`、`set-content-src.cmd`、`readonly.ps1`、`build.ps1`、`utf16-openfeel.ps1`（UTF-16LE+BOM）、`gbk-write.cmd`（GBK）、`bin.dat`（二进制/超限）。
  - 测试：`dsh/test/guard.js`（≥6 条新用例，`A67.4` 计数断言）、`dsh/test/guard-isolation.js`（回归）。
- **负责角色**：executor-b。**依赖**：R2（同文件串行）。
- **验收命令**：`cd dsh && node test/guard.js && node test/guard-isolation.js`。

---

## 三、执行顺序

> 严格按 `A1 → A2 → B3 → B4 → B5 → B6 → C7 → C8 → C9 → D10 → D11 → D12 → E13` 串行推进（**不设并行组**，REV-P10）；R1 的两步在开篇执行，**E13 是 R1 的收口步**，按顺序在末尾执行（R1 的交付跨首尾两段）。

| 步 | 所属 | 做什么 | 可验证中间态：命令 | 期望 |
|----|------|--------|----------------------|------|
| **A1** | R1 | `scripts/release.mjs` 骨架 + `package.json.release` + 六步链前四步 dry-run 实现（version/build/publish/market）+ `--publish` 开关与 whoami 早停（不打印 token）+ `--notes-only` 草稿 | `npm run release -- --dry-run --json` | exit 0；`steps` 6 项，`version/build/publish/market` = `ok`，`archive-commit/tag` = `planned`；无 `--publish` 时零真实 publish；`--notes-only` 不改 `CHANGELOG.md` |
| **A2** | R1 | 归档产物提交 + tag 段实现与 `--tag`；`generateChangelogDraft` 的 REQ/REV 拼装与人工确认写盘开关 | 同上 + `npm run release -- 1.7.0 --notes-only --json` | 6 步全 `ok`；`archive-commit.paths` 含 `.openfeel/log/`/`.openfeel/flow-archive/`/`.openfeel/checkpoints/`/`docs/releases/1.7.0.md`/`CHANGELOG.md`/`docs/VERSIONS.md`；草稿含 `## [1.7.0]` + REQ 标题 + REV 结论 |
| **B3** | R2 | guard 相位白名单：`DOC_WRITE_PHASES` + `isFixturePath`（改 `:2929-2943`，不动 `:279`/`:348`/`:445`） | `cd dsh && node test/guard.js` | `A62.1` 三组绿（两态）；既有用例零失败 |
| **B4** | R2 | `src/core/flow/gate-override.ts`（含 `from`/`to`）+ 两处写入口接线 | `npx vitest run test/core/flow-manager.test.ts -t "GateOverride"` ＋ `npx vitest run test/commands/flow.test.ts` | `A62.2` 键集相同（含 `from`/`to`）、`A62.3`/`A62.4` 绿；`grep -rn "gate_missing" src/` 只命中 helper + 2 处调用 |
| **B5** | R3 | `review_pending` 状态域 + 流转表 + 回退 + 旧直连移除（`--force` 留痕复用 B4 helper） | `node bin/openfeel.js req advance <fixture> --to review_pending` | exit 0；`req advance <fixture> --to done`（`in_progress` 态）exit 1（`A63.1`） |
| **B6** | R3 | `req claim/advance/complete --json` + 五个新错误码（含两码）+ 出口计数对齐 | `node bin/openfeel.js req advance <fixture> --to done --json` | exit 1；stdout 恰一个 JSON，`error.code ∈ {REQ_REVIEW_REQUIRED, REQ_VERIFY_REQUIRED}`（`A63.2`）；`test/commands/knowledge.test.ts` 计数 51 成功 / 52 注册（含 #51 lint adherence；发布脚本不登记出口）与新出口同批绿（`A63.4`） |
| **C7** | R4 | **R4a**：`req plan` / `req body --from` / `lint fill --fix-plan`；**R4b**：`--text` 多行保真 + adapter 临时文件通道 | `node bin/openfeel.js req plan REQ-061`；`node bin/openfeel.js req body <id> --section 摘要 --text <多行md> --json` | `req plan REQ-061` exit 1（已存在）；`lint fill --fix-plan --json` exit 0 且有 `created[]`/`skipped[]`（A64.1—A64.3）；`--text` 字节保真（A64.4）；三命令单测绿（A64.5） |
| **C8** | R5 | `test/fixtures/req-input.js` + `factories.ts` + 3 处复用 + `dsh/test/verify.js` 共享 helper | `npx vitest run test/fixtures/factories.test.ts`；`cd dsh && node test/verify.js` | 绿；`grep -rl "makeFilledRequirement" test/ dsh/test/` ≥3（A65.1） |
| **C9** | R5 | dashboard `flowDebt` 四键 + HTML 面板 | `node bin/openfeel.js dashboard --json` | `flowDebt` 恰 4 键，`count` 与 `lint fill --json` 同值（A65.2/A65.3） |
| **D10** | R6 | `finishDispatch` + `feel_dispatch action=finish` + `feel_status.dispatch` 的 `open[]`/`closedRatio`/`missingRoles` | `cd dsh && node test/verify.js` | `A66.1`/`A66.2` 绿；台账行数不变、`closing` 四键 |
| **D11** | R6 | `adherence.js` + `feel_verify action=adherence` | `cd dsh && node test/verify.js`（`A66.3`/`A66.4`） | 四键齐全、`definition` 非空；空台账 → `value:null` 不报错；工具数不变 |
| **D12** | R7 | wrapper 静态分类（`-File` / `cmd /c` / 内联复核 / 编码混淆） | `cd dsh && node test/guard.js` | `A67.1`—`A67.4` 绿（≥6 新用例）；`readonly.ps1` → `allow`；不可读/GBK → `warn` + 审计含 `wrapper`/`scriptPath` |
| **E13** | R1 | 文档对账（`docs/commands.md`/`docs/json-contract.md`/`docs/VERSIONS.md`/`CHANGELOG.md`/`dsh/ADAPTER.md`/`dsh/README.md`）+ CHANGELOG 版本段落盘 + 全量回归 | `npm test`；`npm run build`；`cd dsh && node test/contract.js && node test/verify.js && node test/guard.js && node test/preflight.js`；`node bin/openfeel.js lint i18n` | 全部 exit 0；`npm test` 0 fail 且用例数 ≥ 基线（v1.6.0 收口 2400+）；`npm run release -- --dry-run` 仍 exit 0 |

中间态失败的处理：**停手上报 Feel**，不得跳步或改判据（缺口要么补实现，要么走 §六 偏差登记 + `--force` 留痕）。

---

## 四、门禁与安全

1. **本阶段硬门（执行期必须满足）**
   - 正文门：`REQ-061`~`REQ-067` 的 `## 摘要` 与 `## 目标与验收` 均已写实（现状满足；改动正文只能经 `feel_req action=body`）。
   - 计划门：本文件（阶段 `plan.md`）写实 + 7 份需求级计划 `.openfeel/plan/reqs/REQ-061.plan.md`~`REQ-067.plan.md` 存在且四节写实 → 否则 `flow advance --to exec_running` 被 `STAGE_PLAN_GATE` 拒绝（`src/core/flow-manager.ts` 计划门）。
   - 账本门：`.openfeel/dev/` 与 `.openfeel/dev/current.md` 与状态写操作同步（写成功出口自动触发 `maybeSyncDevStatus`；`archiving→done` 前 `due` 必须为 false，否则 `DEV_SYNC_STALE`）。
   - 派发门：每个 executor/reviewer 动作都必须先 `feel_dispatch action=record`（`.openfeel/dev/dispatch.jsonl` 受 guard 保护，只能经工具写）；主会话不直写仓库。
2. **`--force` 留痕口径（本阶段统一，唯一 schema）**
   - 写入口只有两个：`flow advance`（`src/commands/flow.ts:1348-1349`）与 `flow stage reset`（`:947`/`:959`）；需求侧 `req advance/claim/complete --force` 经 `buildGateOverrideAudit()` 写**同一形状**的 `detail.gate_override`。
   - `detail.gate_override = {gate_overrides:[...], gate_missing:{...}, by, reason, from, to, at}`（**`from`/`to` 必填**，A62.2）；`gate_overrides` 取值闭集 `'plan' | 'dev_sync' | 'req_review' | 'req_body' | 'req_plan'`。
   - `--force` **不是绕过**：跳相位合法性 ≠ 跳门；门放行只认显式 `allowGateOverride`（`flow-manager.ts:1955`/`:1984`/`:2406`），且必须同时写 `gate_missing` 快照。
   - 单阶段 `--force` >10 次触发 §六 R6 的评估规则（由 Feel 提请用户裁定），不自动放宽。
3. **哪些改动影响 guard（必须先想清楚再动）**
   - `dsh/lib/guard.js` 的 `CODE_DIRECTORIES`（`:279`）、`isCodeDirectoryPath`（`:348`）、`isExemptPath`（`:445`）、相位判定（`:2929-2943`）：**R2 只改相位层（`:2929-2943`）**，不收放目录语义；`src/**` 的 `*.md`/`*.svg` 仍按源码门禁（`:436` 的既有纪律）。
   - `PROTECTED_OPENFEEL_PATHS`（`:674`）/`PROTECTED_WORKSPACE_PATHS`（`:706`）：本阶段**不新增**可写路径；`.openfeel/flow.json`、`status.md`、`requirements/*.md`、`dev/**` 保持只读给 agent。
   - wrapper 分类（R7）只改「读脚本内容」这一层，不改 `SHELL_GATE_DECIDABLE='deny'` / `SHELL_GATE_UNDECIDABLE='warn'` 的档位语义；`strict` 档位下 `undecidable` 仍拒。
   - 任何让「done 相位可写源码」的变化都是**越界**（那会打穿本阶段的发布脚本安全边界，见 §六 R2）。

---

## 五、测试计划

### 5.1 必跑命令（每步后至少跑所属文件，收口跑全量）

```
npm test
npm run build
cd dsh && node test/contract.js && node test/verify.js && node test/guard.js && node test/preflight.js
node bin/openfeel.js lint i18n
node bin/openfeel.js lint fill
npm run release -- --dry-run --json
```

### 5.2 新增/修改用例清单

| 文件 | 用例名 | 断言要点 | 判据 |
|------|--------|----------|------|
| `test/scripts/release.test.ts`（新） | `六步顺序固定：version→build→publish→market→archive-commit→tag` | `steps.map(id)` 逐字相等；干净工作树零写盘 | A61.1 |
| | `任一检查失败 → exit 1 且 publish/后续全 skipped` | 注入 `version`/`build` 失败 | A61.1 |
| | `无 --publish 零真实 publish；--publish + whoami 失败早停` | `exec` 记录里无「不带 `--dry-run` 的 `npm publish`」；文案含 `npm login`；无 token 形态 | A61.2 |
| | `whoami 失败时 stdout/stderr 不含 token（脱敏断言）` | `/\b_[A-Za-z0-9]{20,}\b/`、`/npm_[A-Za-z0-9]{20,}/` 零命中 | A61.2 |
| | `--notes-only 只生成草稿，CHANGELOG.md 字节不变` | 写前写后 sha256 相同 | A61.3 |
| | `--write-notes 才落盘（写 docs/releases/<version>.md）；草稿含 REQ 标题 + REV 结论` | `## [1.7.0]` + 内容断言 | A61.3 |
| | `ARCHIVE_ARTIFACTS 三类产物齐备、单点定义` | paths ⊇ 三类；`grep -c` 1 处定义 | A61.4 |
| `test/core/release-metadata.test.ts`（改） | `版本三源与 release 脚本共用同一校验函数` | 无第二份版本规则 | A61.1 |
| `test/commands/release.test.ts`（新） | `--dry-run / --notes-only 人类输出稳定` | stdout 行数 + 路径提示 | A61.1/A61.3 |
| `dsh/test/guard.js`（改） | `A62.1 review_passed/test_passed 放行 docs/**、根级 md、test/fixtures/**` | 两态 `allow` + `reason:'doc-asset-phase'` | A62.1 |
| | `A62.1 负例：src/** 两态均 deny；test/core/** 仍拒` | `reason:'phase'`；夹具 ≠ 测试代码 | A62.1 |
| | `A62 回归：exec_running 语义不变` | 既有用例零改动 | A62.1 |
| | `A67.1 pwsh -File 读 .ps1 内容 → class1 deny；cmd /c → class1/2 deny` | 审计 `guard_deny` | A67.1 |
| | `A67.2 普通脚本 allow：readonly.ps1/build.ps1/node -e 只读` | 不写 deny 审计 | A67.2 |
| | `A67.3 不可读/超限/GBK → warn + 审计 kind=undecidable` | `detail.wrapper` + `detail.scriptPath` + `detail.reason` 非空 | A67.3 |
| | `A67.4 新增用例 ≥6 条（含 UTF-16LE+BOM 命中、GBK undecidable）` | 计数断言 + fixture 清单断言 | A67.4 |
| `test/core/flow-manager.test.ts`（改） | `GateOverride：advance 与 reset 键集逐字相同（含 from/to）` | `{gate_overrides,gate_missing,by,reason,from,to,at}` | A62.2 |
| | `A62.3 reset --to 后置相 --force 必有 override 条目` | log 末条断言 | A62.3 |
| | `GateOverride 类型与两态单测；--force 不绕过 blocking REV` | 门语义不变 | A62.4 |
| `test/commands/flow.test.ts`（改） | `recover 文案：--force 为留痕放行，非绕过` | 文案断言 | A62.4 |
| `test/core/req.test.ts`（改） | `review_pending：in_progress→review_pending→done 合法` | 两跳 | A63.1 |
| | `review_pending → in_progress 回退合法` | 回退 | A63.1 |
| | `in_progress → done 直连 → 文案含 review_pending` | 旧直连移除 | A63.1 |
| | `--force 跳链 → gate_override.gate_overrides=['req_review']` | 留痕 | A63.1 |
| | `done 门三态（T027.1）与 canCompleteRequirement 零改动` | 既有用例原样 | A63.4 |
| `test/commands/req.test.ts`（改） | `req claim/advance/complete --json 成功与失败形状` | 恰一个 JSON 文档 | A63.3 |
| | `A63.2 三态：缺 review → REQ_REVIEW_REQUIRED；缺 verify → REQ_VERIFY_REQUIRED；两者 pass → exit 0` | envelope 两码 + exit 码 | A63.2 |
| `test/commands/req-board.test.ts`（改） | `req board --json 分组键 = 旧键 + review_pending（只增不改）` | 键集断言 | A63.4 |
| `test/commands/req-plan.test.ts`（新） | `req plan 生成四节且 isRequirementPlanFilled=true` | 单点判据 | A64.1 |
| | `已存在 → exit 1 零写盘；--force → replaced:true` | 字节级零写盘 | A64.1 |
| `test/commands/req-body.test.ts`（改） | `--from 一次写多节，每节一条变更记录` | `sections` 长度 + 变更记录数 | A64.2 |
| | `--from 元信息小节受保护（状态/预估版本/父需求/变更记录）` | 拒写或跳过并报告 | A64.2 |
| | `--text 多行保真（空行 + ### 子标题 + 列表行）` | 文件字节 == 输入字节 | A64.4 |
| | `--text CRLF 保真` | `\r\n` 不被归一 | A64.4 |
| | `--from missing.md → exit 1 零写盘` | 缺文件用例 | A64.5 |
| `test/commands/lint.test.ts`（改） | `--fix-plan 补骨架且 exit 0（advisory）；created[]/skipped[] 正确` | 已有计划进 skipped、字节不变 | A64.3 |
| | `--fix-plan 幂等：重复跑 → created[] 空` | 二次调用 | A64.5 |
| `test/fixtures/factories.test.ts`（新） | `工厂产物直接过正文门/计划门` | `applyStatusChange` 直测 | A65.1 |
| | `共享 helper：factories.ts 与 dsh/test/verify.js 同一字段口径` | 同一 `req-input.js` 导出被两栈 import | A65.1 |
| `test/commands/dashboard.test.ts`（改） | `flowDebt 恰 4 键，count 与 lint fill 同值` | 同源单点 | A65.2/A65.3 |
| | `lint fill 仍恒 exit 0` | `C16` 回归 | A65.4 |
| `dsh/test/verify.js`（改） | `A64.4 feel_req action=body text= 多行不丢行` | 写出 Markdown 行数/内容断言 | A64.4 |
| | `A65.1 夹具口径与 test/fixtures/req-input.js 同源` | import 断言（无 TS 依赖） | A65.1 |
| | `A66.1 finish 写 closing 四键 + dispatchId 原地补写` | 键集 + 行数/其余行字节 | A66.1 |
| | `A66.1 重复 finish 幂等（changed:false）` | 二次调用 | A66.1 |
| | `A66.2 open[] 与 closedRatio；missingRoles 依 closing` | 未闭环角色才出现 | A66.2 |
| | `A66.3 feel_verify action=adherence 四键 + definition + 空台账 null` | 形状 + 不抛错 | A66.3 |
| `dsh/test/contract.js`（改） | `工具数与 action 枚举同步（finish/adherence 不新增工具）` | 计数不变 | A66.4 |
| `test/cli/error-envelope.test.ts`（改） | `五个新码进 envelope 契约表` | `REQ_BODY_GATE`/`REQ_PLAN_GATE`/`REQ_PLAN_DEVIATION`/`REQ_REVIEW_REQUIRED`/`REQ_VERIFY_REQUIRED`（**无 `REQ_REVIEW_GATE`**） | A63.3 |
| `test/cli/json-contract.test.ts`（改） | `#47—#51 新出口形状锁（含 #51 lint adherence --json）` | 逐出口；**`release` 不在表内**（REV-P09） | A63.4/A64.1 |
| `test/commands/knowledge.test.ts`（改） | `计数锁：成功 51 / 注册 52` | 与文档同批（发布脚本 `release` 不登记出口） | A63.4 |

### 5.3 反守卫纪律

- `test/commands/req.test.ts` 的 `afterEach` 会比对真实 `.openfeel/requirements/` 快照 → 所有写入类用例必须 `vi.spyOn(process,'cwd')` 指向 `mkdtempSync` 临时目录。
- 任何用例不得写真实 `.openfeel/flow.json` / `status.md` / `dev/**`；断言失败信息的取证走临时工程。

---

## 六、风险与回写

| # | 风险 | 影响 | 缓解 |
|---|------|------|------|
| **R1** | **guard 白名单放松过头**：把 `test/**` 整体（含 `test/core/*.ts`）当夹具放行，等于在 `review_passed` 放开测试代码改写 | A62.1 变成「测试也能在审后改」，审查面被打穿 | 白名单只认 `test/fixtures/**` 与 `dsh/test/fixtures/**`；用例 `A62.1` 必须含「`test/core/**` 仍拒」两态断言；reviewer 用 `grep -n "isFixturePath" dsh/lib/guard.js` 确认无第二个豁免入口 |
| **R2** | **release 脚本越权 commit**：`done` 相位下 agent 用 `node scripts/release.mjs` 提交归档产物，绕开「done 后不能 commit」的原意 | 状态机被打穿、审计失真 | 脚本**只由人类在外部终端执行**；本阶段判据只以 `--dry-run`/`--notes-only` + 注入式单测取证；agent 侧不新增任何 `git commit` 放行路径（guard `:2292` 白名单不改） |
| **R3** | **需求相位打穿状态机**：加 `review_pending` 时顺手放宽 `blocked→done` 或保留 `in_progress→done` 的 `--force` 隐式路径 | A63.1 名存实亡，`req` 的合法目标表出现两条路 | 流转表是单点（`requirement-ops.ts:830-836`）；用例穷举所有 `from→to` 组合；`--force` 只经统一 helper 留痕，不写第二条 `ALLOWED_TRANSITIONS` |
| **R4** | **release 误发版**：`--dry-run` 与真实执行只差一个 flag，`npm publish` 一旦跑真就不可撤回（`dsh` 包还依赖 CLI 版本） | 版本号被消耗、registry 出现半成品 | **默认不真发**：唯一真实发布开关是 `--publish`（正文 A61.2），且必须先过 `npm whoami`；`--dry-run` 与 `--publish` 互斥；单测断言「无 `--publish` → 零**真实** `npm publish`（不带 `--dry-run` 的调用计数为 0）」 |
| **R5** | **JSON 出口计数锁漂移**：`req` 三命令 + `req plan` 同时改计数，文档/测试/形状锁三处易漏 | `input` 计数锁红、CI 阻塞 | 同一波次内三处同批提交（`docs/json-contract.md` 头行 + `test/commands/knowledge.test.ts:384-401` + `test/cli/json-contract.test.ts`）；先对齐 46/47 基线再加编号 → 51/52；**`release` 明确不进 CLI 出口表**（REV-P09） |
| **R6** | **wrapper 分类误杀**：读脚本内容后把 `readonly.ps1`、`build.ps1` 等正常脚本判成写操作 | agent 日常操作被 deny，用户被迫 `off` 档位（等于关掉门禁） | 分类只认「openfeel 写动词 / 可解析写目标 / 受保护路径」三类，命中前先走 `matchOpenFeelWrite`（`:1620`）与 `decideForTargets` 同源判定；不新增启发式；`A67.2` 保留「只读 `node -e` 与 `readonly.ps1` 放行」反例 |
| **R7** | **dev 账本与 checklist 长期未同步**：本阶段 7 需求 + 13 步，`maybeSyncDevStatus` 只在写成功出口触发 | 收口时 `DEV_SYNC_STALE` 拦在 `archiving→done` | 每次 `feel_flow advance` / `feel_stage set` 后跑 `feel_dev({action:'sync'})`；E13 前显式 `feel_dev status` 确认 `due=false` |
| **R8** | **两套写实判据**：`req plan` 生成骨架时另写一份「四节齐全」判定，与 `filled.ts` 分叉 | A64.1 与计划门互相打架 | 只 import `isRequirementPlanFilled`；reviewer `grep -rn "isRequirementPlanFilled" src/` 命中 ≤2 处（定义 + 计划门/命令层各一） |
| **R9** | **`--text` 多行修复变成静默降级**：修完仍把多行塞进 argv，或 adapter 临时文件残留 | A64.4 名存实亡、临时目录污染 | 用例做**字节级相等**断言（不是「包含」）；adapter 侧 `finally` 清理临时文件；reviewer `grep -n "pushOption(argv, '--text'" dsh/lib/tools/index.js` 应零命中（正文 text 走 `--file`） |

### 偏差回写格式（审查门会检查）

执行中发现与本计划不符（行号错、机制不存在、任务需拆并），**必须**在对应需求计划的 `## 偏差与回写` 追加一行，并在本节末尾同步一行：

```
- YYYY-MM-DD | 步/任务 R#-X# | 偏差事实（实测证据：文件:行号 / 命令输出） | 处理（新增/取消任务、判据变化） | 影响（哪条 A 判据受影响、取证路径是否变化）
```

纪律：① 判据变化只能「只增不改」——作废旧项写 `~~A6x.k~~（作废：原因）`，新判据续号（不得占用正文已用编号）；② 时间戳必须**晚于**执行开始时间（`req.plan.recorded_at` 盖章时刻），否则 `REQ_PLAN_DEVIATION` 拦 `→done`；③ 本节不得用于记录「计划写过了」，无偏差保持空表；④ executor 发现触发条件**停手上报 Feel**，不得自行改判据。

---

## 七、变更记录

- 2026-11-24 创建（planner-v17）：REQ-061~067 → 28 条子判据（**旧编号，已在本日修订中按正文原编号作废**；现行 29 条见 §1.0/§1.1）→ 7 个增量 R1~R7 → 13 步执行序（A1…E13）；锁定单写者矩阵、四类必需命令（`npm test`/`npm run build`/`dsh/test/*`/`lint i18n`）与 `--force` 统一审计口径。
- **2026-11-24 修订（planner-v17 / REV-P01…P10，针对独立审查 6 blocking + 4 major）**：
  - **REV-P05**：§1.0/§1.1 按需求正文原编号重排为 **29 条**（A61.1—A67.4/5），删除「各正文只登记一条 A1」「逐字引用」错误表述；旧编号作废清单可追溯。
  - **REV-P04**：REQ-061 按 A61.2（默认不真发、真实发布只认 `--publish` + whoami 认证、打印 `npm login` 不打印 token）与 A61.3（`--notes-only` 草稿、人工确认才写入）重写；删除「无 `--dry-run` 即 whoami 再 publish」及 `--yes-publish`/`--confirm` 口径。
  - **REV-P06**：REQ-062 的 GateOverride schema 增 **`from`/`to`**（A62.2）；A62.3 `reset --to 后置相 --force` 独立判据与用例。
  - **REV-P02**：REQ-063 按正文改为 `REQ_REVIEW_REQUIRED`/`REQ_VERIFY_REQUIRED` **两码**、缺审验 exit 1、仅命令层码化（`requirementDoneBlocker` 语义不变）；删除自造的 `REQ_REVIEW_GATE` 与「done 门一字不改/第二跳 exit 0」表述。
  - **REV-P01**：REQ-064 新增 **R4b**（`--text` 多行保真 + `dsh` adapter 临时文件通道 + 多行/CRLF/含 `###` 用例），A64.4/A64.5 判据与测试落地（仍属步 C7）。
  - **REV-P07**：REQ-065 的 A65.1 改为**真正共享工厂**（`test/fixtures/req-input.js` 纯 ESM 零依赖，`factories.ts` 与 `dsh/test/verify.js` 同时 import），不再只写注释。
  - **REV-P03**：REQ-066 补 A66.2（`feel_status.dispatch.open[]`/`closedRatio`、`missingRoles` 依 `closing`）与 A66.3（**选定 `feel_verify action=adherence`**，字段四键 + `definition`），任务落 D10/D11。
  - **REV-P08**：REQ-067 按正文重排 A67.1—A67.4；A67.3 审计补 `wrapper`/`scriptPath` 字段与断言；A67.4 ≥6 用例含 **UTF-16LE+BOM / GBK** 编码混淆 fixture。
  - **REV-P09**：release 出口计数**写死选择 A**——`release` 不登记 CLI `--json` 出口，目标 **50 成功 / 51 注册**，文档/计数测试/形状锁三处同批，`release` 形状锁只在 `test/scripts/release.test.ts`。
  - **REV-P10**：单写者矩阵修正 R2 的 guard 改动区为 **命令分类/相位判定区 `:2929-2943`**（不是 `:279-449`）；新增 `dsh/test/guard.js`（R2→R6→R7）与 `dsh/test/verify.js`（R5→R6）串行登记；删除 §2.0 并行组，与 §三 统一为**严格串行**。

---

## 八、执行期偏差登记表（2026-11-25 回写）

> 本表是 v1.7.0 执行期偏差的**汇总登记**，只登记实测偏差与判据**表述**修订；**不改源码/测试**（「已修」指执行期已在源码内修正并复查通过，本表只记录事实与取证路径变化）。
> 并入声明：本表**取代** §六「偏差回写格式」中「在本节末尾同步一行」的做法——后续偏差一律登记到本表，并按需求归口同步到对应需求计划的 `## 偏差与回写`（已同步：REQ-061 ← R1；REQ-066 ← R3/R6）。
> 列口径：`日期 | 任务 | 偏差（实测证据） | 处理 | 影响`。**判据编号一律不变**——凡口径变化只改「表述/取证路径」，作废的是旧表述而非编号。

| 日期 | 任务 | 偏差（实测证据） | 处理 | 影响 |
|---|---|---|---|---|
| 2026-11-25 | R1 / A1、A2（A61.1、A61.3） | ① `release --dry-run` 下 `market`/`archive-commit`/`tag` 初实现记为 `skipped`，与 A61.1「六步全 `ok`」字面冲突（dry-run 下这三步是「将要执行」而非「不执行」）；② `--notes-only` 初版直接写文件，违背「只生成不发布/零写盘」 | ① 已修：三步改标 `planned` 并给出将执行 `cmd` 与展开后的 `paths`（`scripts/release.mjs:731`/`:755`/`:799`；`STEPS` 单点 `:56`）；**A61.1 表述由「六步全 ok」改为「六步均 `planned`/`ok` 且各给路径」**；② 已修：`--notes-only` 默认**只输出 stdout**，落盘须显式 `--write-notes`（`:815-828`，已存在不覆盖） | A61.1 取证从「六步 `status==='ok'`」改为「六步 `status ∈ {planned, ok}` + 每步有 `cmd`/`paths`」；A61.3 零写盘取证从「`CHANGELOG.md` 字节不变」细化为「默认零写盘（只 stdout），仅 `--write-notes` 落 `docs/releases/<version>.md`」；编号 A61.1/A61.3 不变 |
| 2026-11-25 | R3 / B6（A66.3、§1.2） | JSON 出口实测 **51 成功 / 52 注册**（`test/commands/knowledge.test.ts:384` 计数锁；`src/commands/lint.ts:253` 新增 `lint adherence --json`），计划写的 **50/51 作废** | 采纳实测 51/52，三处同批（`docs/json-contract.md` 头行 + `test/commands/knowledge.test.ts:384` + `test/cli/json-contract.test.ts` 形状锁）；**A66.3「不新增 CLI `--json` 出口」改为「`lint adherence --json` 即 `feel_verify action=adherence` 的 CLI 出口」**（同一个数据源，`src/commands/lint.ts:14`/`:250`） | §1.2 与 §五 5.2 的「50 成功 / 51 注册」全部作废为 **51 / 52**；`release` 仍不进 CLI 出口表（不受影响）；A66.3 的取证从「只能经 tool」变为「`lint adherence --json` 可直接取证」 |
| 2026-11-25 | R3 / B5、B6（A63.4、A62.4） | 既有 done 门用例无法「零改动」保留：`in_progress → done` 直连已移除（A63.1），用例必须换夹具状态（`in_progress` → `review_pending`）才到得了同一断言点 | 已修：**只换夹具状态，断言行逐字不变**；`T027.1`（`test/core/req.test.ts:1833`）的期望码由旧的单一 `invalid_status` 口径改为门码化后的 **`review_required` / `verification_required`** | A63.4/A62.4 的「零改动通过」口径收紧为「**仅夹具状态字段变化、断言行零改动**」；`T027.1` 取证键从 `error.code==='invalid_status'` 改为 `error.code ∈ {review_required, verification_required}`（三态：缺审 / 缺验 / 齐全放行不变） |
| 2026-11-25 | R4 / C7（A64.1、A64.3） | 计划模块落地在 **`src/core/req/plan-file.ts`**（导出 `writeRequirementPlanSkeleton`/`toRequirementPlanSeed`/`RequirementPlanFileError`），阶段计划写的是 `src/core/plan/plan-skeleton.ts`；`req plan --json` 实测字段为 `created`/`overwritten`，覆盖时末位追加 `replaced` | 已修：以 `src/core/req/plan-file.ts` 为**单点**（`src/commands/req.ts:34`、`src/commands/lint.ts:42` 均 import 它；`lint fill --fix-plan` 不在此拼内容，`:501`）；JSON 形状按实测 `{created, overwritten, (replaced)}`（`src/commands/req.ts:1788`/`:1828-1837`，`replaced` 仅在覆盖时出现） | A64.1 文件锚点由 `src/core/plan/plan-skeleton.ts` 改为 `src/core/req/plan-file.ts`（**目录 + 文件名都变**）；A64.1/A64.3 的 JSON 取证由「`replaced:true` 必现」改为「`created`/`overwritten` 必现、覆盖时追加 `replaced:true`」；A64.1 的 `path`/四节/拒绝覆盖语义不变 |
| 2026-11-25 | R5 / C8、C9（A65.1、A65.2） | 夹具落地为 **`test/fixtures/requirement-input.js`** + **`test/fixtures/requirements.ts`**（计划写 `req-input.js` / `factories.ts`）；dashboard 的 `flowDebt` 以**第 11 键末位追加**进 `--json` 顶层（`src/core/dashboard/aggregate.ts:193-194` 注释与位置均写明「既有 10 键键序零改动」） | 已修：共享口径单点在 `test/fixtures/requirement-input.js`，`requirements.ts` 与其同源，`dsh/test/verify.js` import 同一文件（真正共享，非注释声明）；`flowDebt` 追加在既有顶层键之后 | A65.1 的 `grep` 取证路径由 `req-input.js`/`factories.ts` 改为 `requirement-input.js`/`requirements.ts`（≥3 文件阈值不变）；A65.2/A65.3 键集断言新增「顶层第 11 键 = `flowDebt`」，其内四类债键（`emptyBody`/`missingPlan`/`unstamped`/`devStale`）与同源要求不变 |
| 2026-11-25 | R6 / D10、D11（A66.1—A66.3） | ① `closedAt` 落**台账行顶层**而非 `closing` 内；② `open[]` 按 **stage** 作用域、`missingRoles` 按 **stage+phase** 组合作用域；③ `main_write_ratio` 初版把只读调用也计入分子 | ① 已修并写死（`dsh/lib/adapters/dispatch-ledger.js:111`/`:128`/`:337`/`:391`；文件头 `:10`/`:82` 明示 A66.1 不许第 5 键混进 `closing`）；② 作用域收紧到当前 stage（`missingRoles` 再叠 phase）；③ 已修：分子只计**写操作** | A66.1 的「恰 4 键」判据扩展为「行 = 既有字段 + `closing`（恰 4 键）+ 顶层 `closedAt`」，断言**不得**把 `closedAt` 算进 `closing`；A66.2 的 `open[]`/`missingRoles` 取证从「全台账」改为「当前 stage（`missingRoles` 叠 phase）」；A66.3 的 `main_write_ratio` 分子口径写死为「写操作」 |
| 2026-11-25 | R7 / D12（A67.1—A67.4） | wrapper 解析初版漏四种形态：**位置参数**（`pwsh script.ps1`）、**`-File:`** 带冒号形式、**`cmd` 前置**写法、**`source`/`.` 引入**；`node` 若普遍读脚本会误伤——实测只有 `scripts/**` 需要读内容；GBK 编码稳定落 `undecidable`；`cmd copy` 的目标语义初版判错 | 已修：补齐四种解析面；`node` **仅 `scripts/**` 读内容**（其余 node 调用不读、仍走内联判定）；GBK 一律 `undecidable`；`cmd copy` 按实际目标语义解析 | A67.1 解析面由「`-File` / `cmd /c` 两种 + 内联」扩为「四种 + 内联」（`A67.4` 用例数只增，≥6 仍成立）；A67.2 误杀面新增「非 `scripts/**` 的 node 调用不得因读内容被判 deny」；A67.3 的 GBK 例固定期望 `warn` + 审计含 `wrapper`/`scriptPath`；`cmd copy` 修正后不得判成写操作 |
| 2026-11-25 | R2 / B3（A62.1） | `archiving` **未**纳入 docs 白名单（`DOC_WRITE_PHASES` 实测只有 `review_passed`/`test_passed`，`dsh/lib/guard.js:476`），而 §二 R2 写的是含 `exec_running` 的三元组；`test/**` 只有 `test/fixtures/**` 放行 | 判定**符合 A62.1 原意**，不回改：A62.1 只要求 `review_passed`/`test_passed` 两态放行，`archiving` 不在判据内；`test/**` 仅 `test/fixtures/**`（+ `dsh/test/fixtures/**`）放行，`test/core/**`/`test/commands/**` 仍拒（`isFixturePath` `:488`/`:524`） | A62.1 取证只需两态（`review_passed`/`test_passed`），**`archiving` 不做放行断言、也不记为缺陷**；§二 R2 的 `DOC_WRITE_PHASES` 三元组表述作废为二元组（`exec_running` 的全放行由既有相位语义覆盖，不经白名单）；`A62.1` 的「`test/core/**` 仍拒」断言不变 |
