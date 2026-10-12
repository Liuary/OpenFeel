# 归档摘要 — v1.2.0-stage-83

- **归档时间**：2026-10-12
- **阶段名称**：v1.2.0-stage-83（需求聚合判定与对账 — **主题一「需求流转系统」收官阶段**）
- **阶段状态**：archiving → done
- **依赖阶段**：hard `v1.2.0-stage-81`（需求核心引擎）+ `v1.2.0-stage-82`（需求命令面，均已归档冻结面）；下游 = `v1.2.0-stage-84`（Agent/skill 契约，消费本阶段聚合回写语义）
- **归档人**：openfeel-archiver

## 阶段目标

把「需求状态 = 关联阶段 phase 聚合投影」落地——需求层与工序层的**双向对称回写**闭环：① 新建 `src/core/req/aggregate.ts`（`computeRequirementAggregate` 独立投影纯函数，done 判定**委托既有单一原语 `allLinkedStagesDone`**〔REV-83-002〕；`resolveRequirementStatusForStage`；`syncRequirementStatus` 对称回写入口；`AUTO_DONE_PRECONDITION` 前置集单点常量）；② `advanceStagePhase` done 分支与 `resetStagePhase` **对称回写**（纯内存、同事务，复用既有单次 `save()`，**不新增写盘点**）；③ 存量兼容（`requirement_id` 缺省 / `requirements` 缺失零行为差异）；④ `flow health` 需求对账 warn 项（悬空关联 / done 漂移）；⑤ 端到端聚合单测 + **零回归取证**（补丁前/后归一化快照 diff 为空 + golden 内联 + 正控）。

## 操作产出

| ID | 标题 | 状态 | Commit |
|----|------|------|--------|
| op-001 | 聚合投影与对称回写入口（新建 `src/core/req/aggregate.ts`；done 判定单源委托；`syncRequirementStatus` 契约冻结；段 A/B/C 测试） | done | —（未提交） |
| op-002 | flow-manager 对称回写接入与零回归取证（advance done 分支 / reset 聚合视图回退两热点；补丁前基线→复跑 diff 空；T4.2 矩阵 / golden / deprecated / dry-run） | done | —（未提交） |
| op-003 | health 需求对账与门禁收口（`requirementHealthItems` + `flow.ts` 三处合并 + i18n 双表 +3 键 + T5 全门禁；**阶段收口 op**） | done | —（未提交） |

> 注：executor 按 `ops/deps.yaml`「不 commit」约定，产出停留工作区（HEAD `33185a3`，**本阶段未 commit**）；执行序 = `op-001 → op-002 → op-003`（严格串行）。审查：plan_review **fail（2 blocking + 6 非阻塞）→ 修订 → pass** / scheme_review（pass）/ code_review（pass）。验收 **通过、0 Bug**。

## 改动文件

- **`src/core/req/aggregate.ts`**（**新建**）：文件头中文注释 + 常量/类型/四函数 + 两个 section 常量：
  - `AUTO_DONE_PRECONDITION: readonly RequirementStatus[] = ['scheduled', 'in_progress']`（**前置集单点**——回写守卫与 health 漂移判据**同口径**，禁第二份列表）。
  - `RequirementAggregateValue`（`'scheduled' | 'in_progress' | 'done' | null`）+ `RequirementAggregate`（`stageIds` / `stageCount` / `doneCount` / `aggregate`）。
  - `computeRequirementAggregate(data, requirementId)`：收集关联阶段 → 计数 + 粗粒度聚合；**done 分支直委托 `allLinkedStagesDone(data, id)`**（含空集守卫，禁第二份 `length > 0 && every(done)` 表达式）；**零关联 → `aggregate = null`**（空集守卫禁误报 done）。
  - `resolveRequirementStatusForStage(data, stageId)`：单阶段 → 目标状态纯函数（无关联 / 阶段不存在 / 空串 → `null` 早返回）。
  - `syncRequirementStatus(data, stageId): string[]`：**对称回写入口**（纯内存、声明式不绑定事件）；全程只读 `data.requirements`，**禁 `??=` / 注入**；`appendAggregateLog` 写 `requirement_auto_done` / `requirement_auto_reopen`（`agent: 'cli'`，与需求原语审计同形）。
  - `requirementHealthItems({ data, lang })`：需求对账只读纯函数（悬空关联 / done 漂移；**warn-only 恒无 fail**；对齐 `archive-health.ts` a/b 项先例）。
- **`src/core/flow-manager.ts`**（**最小追加，8+/0-**）：1 行 import（`syncRequirementStatus`）+ `advanceStagePhase` done 分支调用（`endStage` 后 / `return true` 前）+ `resetStagePhase` 调用（`appendLog` 审计块后 / `const curStage` 前；**不在** `if (normCur === key)` 守卫之内——REV-83-013）；**零删除行、零控制流改动、零新增写盘点**。
- **`src/commands/flow.ts`**：1 行 import（`requirementHealthItems`）+ health action **三处合并**（① items 构造〔`--quick` 跳过 / 未加载跳过〕 ② `--json` 合并 ③ 人类输出循环）；**退出码 / `--fix` / `--quick` 语义零改动**。
- **`src/core/i18n-data/{zh-CN,en}.ts`**：`flow` 域新增 **3 键**（`flow.health.reqLinksPassTmpl` / `reqDanglingTmpl` / `reqDriftTmpl`，双表成对）；i18n 基线 **908 → 911**。
- **测试**：`test/core/req.test.ts`（文件尾追加段 A 聚合投影 T4.1 / 段 B 回写入口 7×2 矩阵 / 段 C 正交与单源静态断言 / 段 D 对账项单测）+ `test/core/flow-manager.test.ts`（尾追加段：T4.2-①~⑦ / golden T4.3-①③ / dry-run T4.4-core）+ `test/commands/flow.test.ts`（命令级段：T4.4 双路径 / T4.6 六组 / T4.3-② wizard + 正控 + REAL_CWD 反守卫）；**既有断言段零改动**（仅 import 行归并）。
- **方案层**：`.openfeel/plan/v1/stage-83/ops/{deps.yaml,op-001~003.md}`；**取证/报告**：`.openfeel/tmp/stage-83-baseline.json`（补丁前基线，保留）/ `.openfeel/tmp/{op-002,op-003}-test-report.md` / `.openfeel/tmp/stage-83-selftest-report.md`（工作区，不入版本管理）。

## 关键不变量（设计裁定与实测）

| 不变量 | 内容 | 实证 |
|--------|------|------|
| **done 判定单源** | `allLinkedStagesDone`（`requirement-ops.ts:76-79`，含空集守卫）为**唯一 done 判定原语**；两消费点（`applyStatusChange` 门 `:168` / `computeRequirementAggregate`）**同源**；`aggregate.ts` 禁第二份 `.every(` 表达式 | 段 C 静态（`toContain('allLinkedStagesDone(')` + `.every(` 零命中）+ 段 A T4.5 动态同源四组（REV-83-002） |
| **对称回写（聚合视图）** | `advanceStagePhase` **仅 done 分支**触发（`聚合 done ∧ status ∈ 前置集 → done`）；`resetStagePhase` 全复位路径**重算聚合**（`聚合 ≠ done ∧ status === done → in_progress`，不绑定事件、不做 `done→scheduled` 细粒度回退）；对称循环 advance↔reset 双向 + 审计逐次 | T4.2-③（reset→`review_failed` 使再 advance 重入 done 分支，双向对称）；T4.2-④ 回退目标恒 `in_progress`（S-83-5）；REV-83-005 |
| **auto-done 前置集** | 聚合 done ∧ status ∈ **`{scheduled, in_progress}`** → 需求 `done`；**前置集外（`draft`/`blocked`/终态）→ 零动作零审计**（设计豁免，避掩盖未排期/有意阻塞语义）；与显式流转表 `draft→done`/`blocked→done` 不合法一致 | T4.2-① 正向 7×2 穷举 + 段 D 漂移同口径；REV-83-004 / REV-83-009（用户裁定维持） |
| **空集守卫** | 零关联阶段 **不参与 done 判定**（`aggregate = null`，禁误报 done） | T4.2-⑤（零关联 → 零审计零注入 + 返回 `true` 不变）；T4.2-⑥ 悬空关联（零动作、不抛错） |
| **零回归（无 `requirement_id` 阶段逐字不变）** | 补丁前/后归一化快照 **diff 为空**（排除 `meta.revision`/`meta.updated`/log.time/stats 时间）；三路径同口径：① 无关联阶段推进 ② `flow wizard` ③ deprecated `advancePhase` | op-002 步骤 2.1→2.5「diff → `DIFF_EMPTY_OK`」+ golden 内联 `GOLDEN_ADVANCE`/`GOLDEN_DEPRECATED` + 正控（加关联即出现 `requirement_auto_done`） |
| **`--dry-run` 零回写（双路径）** | `flow advance --dry-run`（命令层 `flow.ts:916-930` 截断）+ `flow stage reset --dry-run`（引擎早退 `flow-manager.ts:1585-1587`）均不写内存、不写盘（含聚合）；`advanceStagePhase` **无 `dryRun` 形参**（`.length===3`）/ `resetStagePhase.length===2` | T4.4-core + op-003 T4.4 命令级双路径字节断言 + 正控；REV-83-007 |
| **同事务（无中间态）** | 回写与 phase 变更同一次 `save()` 落盘；并发冲突（`FlowConcurrentModificationError`）下磁盘**无半写**（phase 与需求状态恒同现） | T4.2-⑦ 双 manager 故障注入；不变量 3 |
| **health 对账 warn-only** | 悬空 `requirement_id` / `done` 漂移（前置集内 ∧ 聚合 done ∧ status ≠ done）→ warn；**不改退出码、不参与 `--fix`、`--quick` 跳过**；前置集外（`draft`/`blocked`）设计豁免不报 | op-003 T4.6-①~⑥（含退出码 `ok===true` 不变、`--fix` payload 无需求修复项）；REV-83-006（Q6 定稿：落地） |
| **正交** | `aggregate.ts` 对 flow-manager 仅 `import type`（防运行时环）；禁用串六串零命中 | 段 C 静态（`NEEDLES.length === 6` + 正控防假绿） |

## 审查记录

### 计划审查轮（plan_review，2026-10-12，首轮 fail：2 blocking + 6 非阻塞 → 修订 → pass）

| ID | 标题 | 状态 | 优先级 |
|----|------|------|--------|
| REV-83-001 | 承接 REV/Bug 零交代（**第 4 次复发**，唯一收口窗口） | **closed** | high（**blocking**） |
| REV-83-002 | 单一判定源未落到既有 `allLinkedStagesDone` → 双 done 判定风险 | **closed** | high（**blocking**） |
| REV-83-003 | §一 基线错标 `84951ce` + 「78 阶段」事实错误（应为 8） | closed | medium |
| REV-83-004 | 回写状态守卫过宽（`draft`/`blocked` 静默 auto-done） | closed | medium |
| REV-83-005 | `in_progress` 上推规则与触发点不自洽 | closed | medium |
| REV-83-006 | `deps.yaml` `produces_core` 缺 `src/commands/flow.ts` + i18n 双表 | closed | medium |
| REV-83-007 | `flow stage reset --dry-run` 断言缺失 + 回归面遗漏 | closed | low |
| REV-83-008 | i18n 入口基线未锚定，实测 908（deps 仍记 829） | closed | low |

### 计划审查复审（修订验收，2026-10-12，结论 pass：001~008 全闭合 + 新增 3 条）

| ID | 标题 | 状态 | 优先级 |
|----|------|------|--------|
| REV-83-009 | auto-done 前置集含 `scheduled` 与大计划裁定 M 不一致（**用户裁定：维持 `{scheduled, in_progress}` + 同步大计划/plan**） | pending（已落实，台账保留） | medium |
| REV-83-010 | `deps.yaml` 残留「存量 78 阶段」（应为 8） | pending（已落实：改 8 + 注明历史口径） | low |
| REV-83-011 | `deps.yaml` 契约返回类型/形参滞后于 plan 定稿（补 `stageIds` + 零关联 `null`） | pending（已落实：契约同步 + 形参对齐） | low |

### 方案审查轮（scheme_review，2026-10-12，结论 pass：0 阻塞 + 4 非阻塞）

| ID | 标题 | 状态 | 优先级 |
|----|------|------|--------|
| REV-83-012 | op-003 跨阶段依赖 `v1.2.0-stage-80` 标 hard，`deps.yaml` 标 soft | pending（已落实：改 soft + 口径统一） | low |
| REV-83-013 | op-002 reset 接入点行号漂移 + **守卫内误插潜伏风险**（`syncCurrentOp` 实测 `:1605` 在 `if (normCur === key)` 内） | pending（已落实：主干约束 + 「非 current 阶段 reset 仍回写」专测） | medium |
| REV-83-014 | op-002 T4.2-② 反向矩阵 fixture 未明写需求双阶段关联 | pending（已落实：明写双 `requirement_id`） | low |
| REV-83-015 | deps.yaml `invariants` 实为 14 条（口径记 13） | pending（**未决**：本次范围未改 deps.yaml，转收口轮） | low |

### 代码审查轮（code_review，2026-10-12，结论 pass：0 阻塞 + 3 非阻塞）

| ID | 标题 | 状态 | 优先级 |
|----|------|------|--------|
| REV-83-016 | 复位到「默认分支相位」后再次推进**不回写** → 需求遗留漂移（**非自愈**，非本补丁引入） | pending（**转 stage-84/85 登记**残留路径） | medium |
| REV-83-017 | `aggregate.ts:127` 列表读取未复用既有 `getRequirements()` → 轻量重复 | pending（可选，转收口轮） | low |
| REV-83-018 | 静态禁令 `.every(` 覆盖**全文件**，偏脆（未来合法引入会误判） | pending（当前成立，转收口轮） | low |

> 结论：**passed（全 18 条：closed 8 / pending 10，0 blocking 遗留）**。REV-83-001/002（计划轮 blocking）经修订轮闭合。归档官处置：**REV-83-016 转 stage-84/85 登记**（复位路径残留漂移）；**REV-83-015/017/018**（文档/风格/可选项）转 v1.2.0 收口轮（stage-85）；**REV-83-009~014** 均已落实核验，台账保留随收口轮销账。

## 缺陷记录

| ID | 标题 | 状态 | 优先级 |
|----|------|------|--------|
| — | 本阶段**无新增 Bug** | — | — |

> 测试官正式验收 **通过（0 Bug）**。承接自 stage-81/82 的 `req/BUG-001` 已于 stage-82 op-001 单点收口（**closed**），本阶段零 Bug 引入。

## 门禁

- `npm test` **70 文件 / 1547 用例 0 skipped / 0 failed**（stage-82 基线 70 文件 / 1506 用例 → 本阶段 +41 用例，文件数不变）
- `npx tsc --noEmit` → exit 0
- `OPENFEEL_LOG=0 node bin/openfeel.js lint i18n` → **911**（入口基线 908 + 新键 **3**〔`flow.health.req*`〕，双表成对；实测吻合无漂移）
- `OPENFEEL_LOG=0 node bin/openfeel.js lint kb` → **0**（过期引用；共检查 **494** 引用）
- `npm run build` ×2 → 幂等（第二次后 `git status` 对生成物零 diff）
- **真实工作区零触碰**：真实 `.openfeel/flow.json` 无 `requirements` 键；新增 REAL_CWD 反守卫断言（`test/commands/flow.test.ts` 模块级 `REAL_CWD`/`REAL_FLOW_PATH`/`REAL_FLOW_RAW`）；测试全程 fixture `tmpDir` + 隔离 HOME + `process.cwd` spy
- HEAD 恒 `33185a3`（零 commit）

## 知识沉淀

| 分类 | 标题 | 动作 |
|------|------|------|
| architecture | 双层状态聚合架构：需求 done 判定单源委托 `allLinkedStagesDone`（空集守卫 + 同源断言） | 新增 |
| patterns | 对称回写模式：advance done ↔ reset 聚合视图重算（不绑定事件）+ 插入点守卫纪律 | 新增 |
| patterns | auto-done 前置集显式裁定 `{scheduled, in_progress}`：单点常量 + health 漂移判据同口径 + 空集守卫 | 新增 |
| troubleshooting | 零回归取证范式：补丁前/后归一化快照 diff 为空 + golden 内联常量 + 正控防假绿 | 新增 |

> 去重（`node bin/openfeel.js knowledge dedup`）：architecture 候选（①双层状态聚合）最高 **5.0%**；patterns 候选（②对称回写）最高 **3.1%**、（③前置集）最高 **2.3%**；troubleshooting 候选（④零回归取证）最高 **1.0%**，均 ≪ 80% → 4 条均判**新增**。kb 分类计数：architecture 41→**42**、patterns 173→**175**、troubleshooting 59→**60**。

## manual 更新

- **`core/req.md`**（补聚合/回写节）：新增「聚合投影与对称回写（v1.2.0-stage-83）」节——`aggregate.ts` 四函数 + `AUTO_DONE_PRECONDITION` 单点；done 判定单源委托；对称回写两热点（advance done 分支 / reset 聚合视图）；`--dry-run` 双路径零回写；health 需求对账 warn-only；变更历史增 stage-83 行。
- **`core/flow-manager.md`**：需求字段节补「聚合回写接入（stage-83）」——`advanceStagePhase` done 分支 / `resetStagePhase` 两热点最小追加（纯内存、同事务、零新增写盘点、零控制流改动）；数据位置/审计 action 相应补充。
- **`index.md`**：模块树「需求核心引擎（req）」条目补聚合回写；维护规则 req 行补聚合/回写检查项。

## 遗留与下游

- ★ **flow 状态推进**：`v1.2.0-stage-83` → `done`（**由主会话** Feel 经 `openfeel flow advance --stage v1.2.0-stage-83 --to done` 执行；archiver 不直写 flow.json）。`archive_stage` 由该 advance 补记。
- **REV 遗留（10 条 pending 非阻塞，0 blocking）**：计划复审 **009~011**（均已落实）/ 方案轮 **012~015**（012~014 落实、**015 未决**）/ 代码轮 **016~018**。**REV-83-016 转 stage-84/85 登记**（复位到默认分支相位后再次推进不回写的残留漂移路径）；**015/017/018** 转 v1.2.0 收口轮（stage-85）。**0 blocking 遗留**。
- **Bug 遗留**：无。
- **下游契约**：`src/core/req/aggregate.ts` 导出（`computeRequirementAggregate` / `AUTO_DONE_PRECONDITION` / `requirementHealthItems`）+ `flow-manager.ts` 对称回写语义交 stage-84（Agent/skill 契约）与 stage-85（文档/版本收口）；`flow health` 新增「需求对账」/「需求漂移」两个 section（warn-only）。
- **兼容承诺**：存量 `flow.json` 无 `requirements` 键 / 阶段无 `requirement_id` → 全路径零报错、**零行为差异**（补丁前/后快照 diff 为空）；health 需求项恒 warn-only（不改退出码）。
- **未 commit / 未 push / 未 publish / 未改版本**（版本保持 1.1.7，版本收口归 stage-85）。

> 归档方式：手工生成摘要（沿用先例，未运行 `openfeel archive <stage>` CLI 以避免其副作用）。
