# v1.3.3-stage-104 计划 — 修复 fast 模式 13 项非预期拒绝（P0/P1/P2 全量）

- **阶段**：`v1.3.3-stage-104`（v1.3.3 唯一阶段，full 模式）
- **依赖**：无（版本独立；v1.3.2 已归档）
- **优先级**：P0（阻塞 fast 工作流的**结构性缺陷**，不是体验瑕疵）
- **关联需求**：REQ-005（`.openfeel/requirements/REQ-005.md`）
- **制定人**：openfeel-planner ｜ **制定时间**：2026-10-30 ｜ **修订轮**：修订 1（计划审查吸收，见文末「计划审查记录」）
- **输入证据**：
  - `OpenFeelHarness/docs/feedback/openfeel-feedback-2026-10-30.md`（12 次拒绝 + 13 条问题表 + 附录 A 最小复现脚本）
  - `OpenFeelHarness/docs/research/openfeel-friction-log.md`（摩擦清单 #1~#12）
- **基线**：HEAD `d8234f9`（v1.3.2 归档后）；版本 1.3.2；测试 77 文件 / 1978 用例（documented，执行期复测为准）；`lint i18n` 1013；`lint kb` 0 过期；dsh 4 套测试 42+83+36+10=171 断言。**执行期以实测重新登记基线（REV 纪律：不沿用旧快照）**。
- **定位**：反馈文档的结论是「流程实体挂载点按 full 模式枚举，fast 与空白项目出现结构性空洞」。本阶段**不做**实体体系大重构（op → change），而是把**已实证让用户被拒的 13 个点**逐个修到「文档里的验证标准」成立，并保留既有 full 语义零回归。
- **验证总判据**：反馈文档附录 A 最小复现脚本**全流程走通**——写 `docs/x.md` 成功，全程不需要 `reset`、`--force`、手工 `op create`；同时 `npm test` / `tsc` / `build ×2` / `lint i18n` / `lint kb` / dsh 4 套测试全绿。

## 一、问题 → 修复 → 验收 总表

> 验收口径逐条取自反馈文档「验证」小节；括号内为本次实现的判定点。

### P0（阻塞）

| ID | 现状（实测复现点） | 修法 | 验收 |
|---|---|---|---|
| P0-1 | `dsh/lib/guard.js` 无 `.openfeel/` 时 `enforce=always` 拒绝一切写文件（`guard.js:309-318`） | **bootstrap 例外**：无 `.openfeel/` 且目标全部为「新增文件」（`!existsSync`；`apply_patch` 须全部为 `*** Add File:`，混合/Update/Delete/Move 一律按非新增从严）→ 放行；一次性提示补账本；对已存在文件仍拒绝 | 空目录 `write` 新文件成功；同名已存在文件仍被拒；空目录 `apply_patch` Update 仍拒 |
| P0-2 | `flow review add` 的 `--op` 为 `requiredOption`（`src/commands/flow.ts:1444`），core 要求 `dotIdx !== -1` 且 op 存在（`src/core/view/entry.ts:139-154`）；fast 无 scheme → 无 op | `--op` 改可选，新增 `--stage <id>`；缺省 `--op` 时解析 stage（`--stage` ?? `pipeline.current.stage`），存在即挂 **stage 级 REV**（`ReviewItem.stage` 显式字段 + `op = stageId` 兼容展示）；**归属单点**：新增 `reviewStageOf()`，`listStageBlockingOpenReviews`、`archive/merge.ts:89-99`（当前 `lastIndexOf('.')` 会把 stage 级 REV 解析错）、retry/attempt 展示统一消费；`--auto-fix` 仍强制 `--op` | fast 0-op 阶段 `review add --stage <id>` 成功，`flow status --json` 可见，归档摘要包含该 REV |
| P0-3 | fast 表 `review_passed: ['archiving']`（`flow-manager.ts:496-506`）；写门禁只认 `exec_running` | fast 表 `review_passed: ['archiving', 'exec_running']`（返工边）+ `advance --reason <text>` 记录整改原因到日志；**必须处理 BFS 多义**：新增该边后 `review_pending → exec_running` 在深度 2 出现两条等价路径（经 `review_failed` / 经 `review_passed`），`findPhasePath` 会在 `:2112-2114` 判 ambiguous → 补**同深度 tie-break**：`review_pending → exec_running` 优先经 `review_failed`（保持修复前行为），并补用例；full 表**不动** | `review_passed` 下 `advance --to exec_running` 合法（可带 `--reason`），随后可写源码；`review_pending → exec_running` 行为与修复前一致 |
| P0-4 | 写门禁一刀切：无活跃阶段 / 非 `exec_running` 时连 `docs/**`、笔记都拒（`guard.js:331-348`） | **产物分类**：`docs/**`（任意层级名为 `docs` 的目录）与文档类扩展（`.md/.mdx/.txt/.rst/.adoc`）为 doc/note → 无活跃阶段或非 exec 也放行；**混合目标从严**：任一目标非 doc 即按源码规则 | 全部阶段 done 时写 `docs/x.md` 成功；写 `src/x.ts` 仍拒；doc+src 混合写被拒 |

### P1（结构性）

| ID | 现状 | 修法 | 验收 |
|---|---|---|---|
| P1-1 | `addStage` 只 `registerStage`，不写 `pipeline.current.stage`（`src/core/plan/stage.ts:206-230`）→ `flow next` 报无活跃阶段 | `addStage` 注册后**原子聚焦**该阶段（`current = {stage, op: ''}`）；`flow next` 在 `current.stage` 为空时从 stages **只读派生**活跃阶段 | `plan stage add` 后 `flow next` 直接给出该阶段，无需 advance |
| P1-2 | ① `flow next` 与 `status.md` 责任 Agent 两处真源；② `stages[].deps` 出现 `[循环引用]`（`stringifySafe` 把**重复引用**误判为环，`dsh/lib/tools/shared.js:195-214`） | ① `status.md` 作为**派生视图**：骨架责任 Agent 取 `mapPhaseToAgent(plan_pending)`；`advanceStagePhase` 同事务回写「状态/当前责任 Agent/上一责任 Agent/更新时间」（缺失文件跳过）；**仅 CLI 派生写、禁止 Agent 反向写**（守卫已禁手改）；② 序列化器改为**祖先栈**判环（重复引用正常复制） | 同一 phase 下 `flow next` 与 status.md 责任 Agent 一致；多阶段 JSON 中 deps 无 `[循环引用]`、内容正确 |
| P1-3 | `resolveSchema` 只搜 `.openfeel/schemas`、`~/.openfeel/schemas`、`node_modules/openfeel/schemas`（`resolver.ts:21-28`），包根 `schemas/` 未搜；`--change` 为 `requiredOption`（`instructions.ts:20`） | resolver 增「包内置」回退（`new URL('../../../schemas', import.meta.url)`，src/dist 同一相对层级）；`--change` 可选，缺省 `default`；找不到 schema 时错误信息给出下一步命令 | `openfeel instructions proposal`（**注：命令是 `instructions`，不是 `plan instructions`**；dsh `feel_plan action=instructions` 亦委托此命令）可用；省略 `--change` 也可用 |
| P1-4 | `execution_mode` × `auto_advance` 依赖关系只在注释，无校验（`.openfeel/config.yaml:15-31`） | `flow advance` 读生效配置，组合不一致（manual+enabled 或 auto+disabled）→ `[WARN]` 单行告警，不阻塞 | 组合不一致时 advance 输出告警；一致时零噪声 |
| P1-5 | 展示档位 `reviewTier=lean`（模式派生）≠ 生效 `effectiveReviewTier=full`（advance 缺省 full），缺省路径无回显（`flow.ts:204-250`、`906-941`） | `flow advance` 成功输出追加「审查档位：<tier>（缺省 full / 显式声明）」；`flow next/status --json` 追加 `reviewTierSource`（`mode-derived` / `explicit` / `default`），既有键序不变 | advance 输出可见生效档位；JSON 三键可解释差异 |

### P2（体验/口径）

| ID | 现状 | 修法 | 验收 |
|---|---|---|---|
| P2-1 | `autoCommitOnDone` 非 git 仓库统一静默「跳过 commit」（`flow-manager.ts:1721-1734`） | 区分「非 git 仓库」→ 显式 `[WARN] 无版本兜底`；「无变更」保持跳过提示 | 非 git 临时项目 advance 到 done 出现告警 |
| P2-2 | `stage-99` → `v1.0.0-stage-99` 归一化规则未文档化 | `docs/commands.md` + README 增「阶段 ID 归一化规则」表（短名/全名/历史名 → fullStageId） | 文档可查，且与 `parseStageId` 实现逐条一致 |
| P2-3 | `v0.0.1-stage-1` → 目录 `v0/stage-1`，不可对账 | 同上文档增「stageId ↔ plan 目录」映射表（`plan/{series}/{stageDir}`，series = MAJOR）；`plan stage add` 成功输出回显实际目录 | 文档 + 命令输出均能对账 |
| P2-4 | `init` 固定造目录 + 7 文件（`src/core/workspace/structure.ts:18-36` 实为 **10 个 `.openfeel/` 子目录 + dev 下 2 个子目录**；反馈口径「11 目录」近似） | 目录**惰性化**：init 只建必需目录（`.openfeel`、`plan`、`dev`、`kb`、`log`；dev 下 `note`/`current_archive` 保留）；`code_review`/`bugs`/`users`/`tmp`/`manual`/`update_conflicts` 首次使用时 `mkdir -p`（写路径逐点补漏）；文件集不变（config/flow/.info/dev×3/kb index） | 新项目 init 目录数下降且首轮 `write`/`advance`/`knowledge add`/`archive` 无缺目录失败 |

## 二、执行切分（scheme 阶段落 op）

| op | 覆盖 | 主要文件 | 依赖 |
|---|---|---|---|
| op-001 | P0-1 / P0-4 / P2-1 门禁风险分层 | `dsh/lib/guard.js`、`dsh/lib/adapters/dashboard.js`（如涉及）、`dsh/test/guard.js`、`dsh/ADAPTER.md`、`src/core/flow-manager.ts`（commit 告警） | 无 |
| op-002 | P0-2 / P0-3 审查挂载点与返工边 | `src/commands/flow.ts`、`src/core/view/entry.ts`、`src/core/flow-manager.ts`（含 `findPhasePath` tie-break）、`src/core/archive/merge.ts`（REV 归属）、`src/core/i18n-data/{zh-CN,en}.ts`、`test/**` | 无 |
| op-003 | P1-1 / P1-2 聚焦与单一真源 | `src/core/plan/stage.ts`、`src/core/flow-manager.ts`、`src/core/view/entry.ts`、`dsh/lib/tools/shared.js`、`dsh/lib/adapters/dashboard.js`、`test/**` | 无 |
| op-004 | P1-3 / P1-4 / P1-5 模板/配置/档位 | `src/core/artifact-graph/resolver.ts`、`src/commands/instructions.ts`、`src/commands/flow.ts`、`src/core/config.ts`、`src/core/i18n-data/*`、`test/**` | 无 |
| op-005 | P2-2 / P2-3 / P2-4 体验口径 | `src/core/init.ts`、`src/core/workspace/structure.ts`、`docs/commands.md`、`README*.md`、`test/**` | 无 |
| op-006 | 版本 1.3.3 收口（**最终 op**） | A 类版本载体 + `build` 双生成物 + CHANGELOG + README×3 + docs + 归档材料 + 门禁 | op-001..005 |

- op-001..005 **文件集互不重叠**（仅 `src/core/flow-manager.ts` 与 `src/commands/flow.ts` 有跨 op 触点：op-001 的 commit 告警、op-002/003/004 的 advance/next/status），执行序 **op-001 → op-002 → op-003 → op-004 → op-005 → op-006**，恒串行，避免同文件并发。
- 每个 op 完成后**局部门禁**（相关测试文件 + `tsc`）；op-006 做全量门禁，收口 op 之后零代码改动。

## 三、验收与复现（附录 A 全流程）

在隔离临时目录（`$env:TEMP/of-repro-<ts>`，非本仓）执行：

1. 空目录直接 `write` 新文件 → **成功**（P0-1）。
2. `openfeel init --workspace-only --non-interactive`
3. `openfeel req add --title S0 --workflow-mode fast` → `claim` → `stage add v0.0.1-stage-01`（short/full 均可）
4. `plan stage add` 后 `flow next` → **直接有活跃阶段**（P1-1）。
5. `advance --to plan_passed --review-tier skip` → `exec_running` → `review_pending`
6. `flow review add --stage v0.0.1-stage-01 --title x` → **成功**（P0-2）；`flow status --json` 见该 REV（**默认 blocking=true**）
7. `advance --to review_passed` → `flow review resolve REV-001`（**阻断门：不 resolve 则步骤 9 的 done 必被拒**，见反证分支）→ `advance --to exec_running --reason 整改`（返工边，P0-3）→ 写源码成功
8. `advance --to review_pending` → `review_passed` → `archiving` → `done`
9. 写 `docs/x.md` → **成功**（P0-4）
10. 全程不出现 `reset` / `--force` / 手工 `op create`；非 git 仓库归档出现显式告警（P2-1）

> 反证分支（单独建一个临时项目，避免污染主流程）：步骤 6 建 REV 后**不 resolve** 直接 `advance --to done` → 必须被 `BLOCKING_REVIEWS` 拒绝；另含：空仓覆盖已存在文件、无阶段写 `src/**`、`review add` 既无 `--op` 也无 `--stage`、空仓 `apply_patch` Update。

## 四、边界与禁止

1. **不重构实体体系**（op → change、findings 生命周期、policy 化）：属反馈「架构建议 1/4」的长期方向，本阶段只做**最小挂载点下沉**（REV 可挂 stage），并以「转出项」列入归档记录。
2. **不改 full 转移表**（P0-3 只动 fast 表）；**15 项合法相位枚举不变**；general 无流水线语义不变。
3. **不手改** `flow.json` / `status.md`；一切经 `openfeel flow/stage/req`。
4. **不 `--force`**；blocking REV 门不可绕过。
5. **dsh 适配器**改动须保持 4 套测试全绿且 `node --check` 通过；适配器与 CLI 的 JSON 契约只增不改。
6. **不 push / 不 npm publish**（用户裁定：本地完成门禁与归档；发布另行确认）。
7. 版本号写入后零代码改动；CHANGELOG 追加 `[1.3.3]`，历史节不改。

## 五、风险与回退

| 风险 | 影响 | 缓解 |
|---|---|---|
| 写门禁放宽（P0-1/P0-4）被误用为绕过 | 源码在非 exec 相位被改 | 只放行「新增文件」与 doc/note；源码/已存在文件仍拒；README/ADAPTER 明示边界 |
| status.md 回写引入双写竞争 | status.md 损坏 | 复用既有 `writeStatusField`（按阶段锁 + 原子写）；缺失文件跳过；失败不阻塞 advance |
| 序列化器改判环 | 真环仍须防 | 祖先栈实现 + 真环（自引用）用例 + 重复引用用例双测 |
| fast 返工边扩大状态空间 | **已知**：`review_pending → exec_running` 出现两条同深度路径 → `findPhasePath` ambiguous | 实测确认（计划审查 B2）→ op-002 增同深度 tie-break（优先经 `review_failed`，保持修复前行为）+ 专项用例；`review_passed → exec_running` 单跳直达不受影响 |
| stage 级 REV 归属解析 | 归档摘要 / 状态视图错归 | op-002 增 `reviewStageOf()` 单点（显式 `stage` 字段优先），`merge.ts` / `listStageBlockingOpenReviews` 统一消费 + 用例 |
| init 惰性化漏建目录 | 首轮写失败 | 全量扫描 `mkdirSync` 写路径 + 新项目 E2E 冒烟（`write`/`advance`/`knowledge add`/`archive`） |

## 六、收口门禁（op-006，全量）

- `npm test`：0 failed / 0 skipped（基线 + 本阶段新增用例）
- `tsc --noEmit`（或 `npm run typecheck`，以 package.json 为准）：0
- `npm run build` **×2** 幂等（`template-loader.ts` / `update.ts` 双生成物 hash 一致）
- `lint i18n`：键数更新后 0 不一致；`lint kb`：0 过期
- dsh 4 套测试：`node --test dsh/test/*.js`（42/83/36/10 断言不回退）+ `node --check` 全部 js
- `--version` = 1.3.3；A 类版本载体全部 1.3.3（`package.json`/`package-lock.json`/`.openfeel/config.yaml`/`config.ts`/agents-md×2/constraint×2）
- 附录 A 脚本 PASS；反证 4 项仍拒绝
- 阶段 `done` 后：`flow archive` 阶段归档 + `flow archive v1.3.3` 版本归档（判据：本版本全部阶段 done ∧ 0 blocking open REV）

## 七、计划审查记录（修订 1）

- **审查方式**：独立审查官只读审查计划 + 抽查代码；结论 **pass-with-nonblocking**（方向与根因定位核实无误）。
- **blocking 吸收（B1~B4）**：
  - B1 验收脚本自相矛盾：REV 默认 blocking，未 resolve 直接 done 必被拒 → 已插入 `flow review resolve`，反证分支独立。
  - B2 返工边引入 `review_pending → exec_running` 同深度双路径 → `findPhasePath` ambiguous → 已登记为已知风险 + op-002 增 tie-break 与用例。
  - B3 stage 级 REV 归属：`archive/merge.ts:89-99` 用 `lastIndexOf('.')` 会错解 → 已并入 op-002，增 `reviewStageOf()` 单点。
  - B4 验收命令写错：`plan instructions` 不存在，正确命令为 `openfeel instructions` → 已订正。
- **非阻塞吸收（L1/L2/L3/L4/L5/L6）**：apply_patch 新增判定按块类型（L1）；混合 doc+src 从严（L2）；status.md「仅 CLI 派生写、禁 Agent 写」措辞显式（L3）；init 目录清单按 `structure.ts:18-36` 实为 10+2 订正（L4）；输出契约只增不乱、既有成功行不变，并以 json-contract 用例锁定（L5）；help/ADAPTER 注明 stage 级 REV 不参与 op 重试（L6）。
- **REV 登记说明**：计划审查发现**无法**按标准流程登记为 flow REV——`flow review add` 当前强制 `--op`，而本阶段尚无可挂载 op（这正是 P0-2 的缺陷本身）。因此审查结论落于本节与 `status.md` 状态记录；op-002 完成后补登 REV 留痕。
- **二次限时独立审查（fail → 已修）**：同一脚本缺口（B1）被独立复现；另收 5 条非阻塞并已落文：①`--stage` 路径必须**绕过**

  `lastIndexOf('.')` 的 op 解析（stage id 自身含点，`entry.ts:139-144`）；②`flow next` 派生多活跃阶段时 tie-break = **优先 `pipeline.current.stage`（若仍活跃），否则按 stages 插入序取首个非 done**；③status.md 派生写**仅限受管字段**（状态 / 当前责任 Agent / 上一责任 Agent / 更新时间）且仅 CLI 写；④P1-4 告警同时出现在 `flow next`（guards 末位，仅组合不一致时）与 `flow advance`；⑤fast 下 `--review-tier skip` 的 reachability 依赖边收缩（`plan_pending → plan_review → plan_passed` 裁成 `plan_pending → plan_passed`），验收脚本照旧成立。

## 八、执行结果（2026-10-30）

- **计划审查 B1~B4 / L1~L6 全部吸收**；方案审查 Blocking 0，非阻塞 5 条已落文（文件集串行、op-006 顺序重排、复现脚本补 7 条命令级断言、ADAPTER/转出项归属、guard 顺序与 tie-break 前置）。
- **13 项全部落地**：P0-1/4（guard）、P0-2/3（REV 挂 stage + 返工边 + tie-break + 归档归属）、P1-1/2（原子聚焦 + 派生写 + 序列化）、P1-3/4/5（schema / 组合告警 / 档位回显）、P2-1~4（git 告警 / ID 文档 / 目录回显 / init 惰性）。
- **验收**：附录 A CLI 复现 **22/22 PASS** + 写入门禁复现 **9/9 PASS**；全量门禁 `npm test` **78 文件 / 1998 用例 0 failed / 0 skipped**、`tsc` 0、`build ×2` 幂等、`lint i18n` **1025**、`lint kb` 0/649、dsh **181** 断言、`--version` **1.3.3**。详见 `.openfeel/tmp/stage-104-gates.md` / `stage-104-repro.md`。
- **转出项**：op→change 实体化、findings 独立生命周期、status.md 完全只读化、写门禁更细风险分层（见 gates 文档）。
