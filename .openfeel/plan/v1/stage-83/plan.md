# v1.2.0-stage-83 计划 — 需求聚合判定与对账（对称回写）

- **阶段**：`v1.2.0-stage-83`（主题一 · 需求流转收官阶段）
- **依赖**：**hard: v1.2.0-stage-81, v1.2.0-stage-82**（引擎 + 命令面就绪；聚合回写接入既有推进热点）
- **优先级**：P0（**回归风险最高面**：触碰 `advanceStagePhase` / `resetStagePhase` 既有推进路径；「阶段推进 → 需求自动 done」的端到端语义在此闭环）
- **制定人**：openfeel-planner ｜ **制定时间**：2026-10-11（修订轮 2026-10-12，见 §六）
- **定位**：把「需求状态 = 阶段 phase 聚合投影」落地——① `computeRequirementAggregate` 独立投影纯函数（done 判定**委托 `allLinkedStagesDone` 单一原语**——REV-83-002）；② `advanceStagePhase` done 分支与 `resetStagePhase` **对称回写**（纯内存，同事务）；③ 存量兼容（`requirement_id` 缺省 / `requirements` 缺失）；④ `flow health` 需求对账 warn 项（**Q6 定稿：落地**——REV-83-006）；⑤ 端到端聚合单测。
- **范围**：新建 `src/core/req/aggregate.ts`；`src/core/flow-manager.ts`（done 分支 + reset 分支最小追加）+ `src/commands/flow.ts`（health 需求对账落地）+ `src/core/i18n-data/{zh-CN,en}.ts`（对账文案新键双表）；`test/core/req.test.ts`、`test/core/flow-manager.test.ts`、`test/commands/flow.test.ts`。
- **边界**：**不改** `mapPhaseToStageStatus`（核验 B10）；**不改** `ALLOWED_TRANSITIONS` 显式流转表（`requirement-ops.ts:145-151`——投影回写为独立维度，前置集裁定见 §二）；**不改** 既有控制流与返回值（`endStage` / `return true` / `autoCommitOnDone` 语义逐字不变）；**不新增写盘点**（回写 = 内存 + 既有单次 `save()`）；不做需求归档（大计划 §七.5）；不新增第三方依赖；不 `npm publish` / 不 `git push`；不直写 `flow.json`。

## KB 检索（`openfeel-check-kb`）

- 已加载。**高度相关条目**：
  - `kb/architecture.md #状态/相位单一事实源：status 为 phase 的粗粒度投影，phase 为唯一事实源` + `#auto-repair 仅 phase→status 单向` → 聚合**方向单一**（phase → 需求状态）；**绝不**由需求状态前推阶段 phase；投影可重算 = 漂移自愈。
  - `kb/patterns.md #事务顺序模式：先落盘状态、后执行不可逆副作用` → 回写在 `advanceStagePhase` **内存阶段**完成；命令层既有 `save()` 即同事务；`autoCommitOnDone` 顺序不变。
  - `kb/patterns.md #`--dry-run` 必须字节级不写盘` → `flow advance --dry-run` 路径**不得**触发聚合回写（内存重算须跳过或只算不赋值——方案期定稿并断言）。
  - `kb/patterns.md #REV/缺陷状态收口的分层口径` → health 需求对账为「只报告」层（warn，不改退出码）；不做自动修复。
  - `kb/patterns.md #需求引擎不变量模式：ID max+1 不回收 + 认领占用 + 状态流转单点表 + done 门空集守卫` → done 判定单源的心理模型（空集守卫为既有不变量之一；聚合 done 分支**委托** `allLinkedStagesDone`——REV-83-002）。
  - `kb/troubleshooting.md #autoRepairInconsistency 干扰组合条件推进路径`（教训：映射分支更新须穷举断言「非 done 相位不投影 done」）→ 聚合判定须穷举 15 phase 的投影结果断言。
  - **无**「需求聚合回写」整条既有条目 → 归档时补沉 architecture（需求聚合投影 + done 判定单源委托）。

---

## 一、背景与实测证据（大计划 §二 表 B 摘引；基线 = **HEAD `33185a3`**，全表「符号名 @ 行号」双锚——REV-83-002/003）

| 事实 | 位置 | 结论 |
|------|------|------|
| `advanceStagePhase()` @ `:1420`：done 分支阻塞 REV 检查 `:1452-1467` → 写 phase `:1473` → checkpoint `:1476` → `syncCurrentOp` `:1490` → 宏观 done 判定（**空集守卫** `:1495-1497`）→ `appendLog` `:1501-1506` → status 投影 `:1511-1514` → `targetPhase === "done"` 时 `endStage` + `return true` `:1522-1527` | `src/core/flow-manager.ts:1420-1529` | 回写追加点：`endStage` 之后、`return true` 之前（纯内存；不改返回值）。`advanceStagePhase` **无 `dryRun` 形参**——dry-run 由命令层截断（`flow.ts:916-930` return，早于调用循环 `:941`） |
| `resetStagePhase()` @ `:1544`（**含 `dryRun` 形参**——签名 `:1544`、JSDoc `:1541`；审计 `reset_stage_phase` `:1594-1599`；不触发归档 commit、不写 checkpoint——JSDoc `:1538`） | `src/core/flow-manager.ts:1544-1614` | 回写追加点：phase + status 写入 `:1590-1591` 之后（同样纯内存；`dryRun`/no-op 早退 `:1585-1587` 不可达） |
| `mapPhaseToStageStatus()` @ `:4369`（default 分支返回 currentStatus） | `src/core/flow-manager.ts:4369` | **不改**；需求聚合为独立函数 |
| `appendLog()` 单点 @ `:2688` | `src/core/flow-manager.ts:2688` | 审计：`requirement_auto_done` / `requirement_auto_reopen`（方案期定稿命名） |
| `getReviewItems()` 副本范式 @ `:982`；`FlowData.requirements`（stage-81 交付，可选字段） | `src/core/flow-manager.ts:982` / stage-81 交付 | 聚合函数消费 `stages` + `requirements`，输出投影 |
| **`allLinkedStagesDone(data, requirementId)` @ `:76`**：`linked.length > 0 && linked.every(phase === 'done')`——**含空集守卫**、零关联恒 `false`，被 `applyStatusChange` 的 `to === 'done'` 门消费 @ `:168`（`req advance --to done` 唯一显式门） | `src/core/req/requirement-ops.ts:76-79`（消费点 `:168`） | **done 判定唯一原语**：T1 聚合 done 分支**复用/委托**该原语，禁第二份表达式（REV-83-002） |
| 本仓 `flow.json` **8 阶段**（`v1.2.0-stage-78`~`85`；stage-80 自举迁移后）——全部 `requirement_id` 缺省、`requirements` 缺省（实测：`node -e "console.log(Object.keys(require('./.openfeel/flow.json').stages).length)"` → `8`） | 实测（HEAD `33185a3`） | 「无 `requirement_id` 阶段推进逐字不变」为**第一回归断言**（REV-83-003：原「78 阶段」错标） |
| 既有测试面：`test/core/flow-manager.test.ts`（含推进路径大量用例）、`test/commands/flow.test.ts` | 实测 **70 文件**（`find test -name '*.test.ts' \| wc -l` → 70） | 回写改动须全绿 |

---

## 二、目标语义与不变量

| 维度 | 内容 |
|------|------|
| 投影函数 | `computeRequirementAggregate(stages, requirementId): { stageIds; stageCount; doneCount; aggregate: "scheduled" \| "in_progress" \| "done" }`——done 判定**委托 `allLinkedStagesDone`**（含空集守卫，REV-83-002）；关联零阶段 → `aggregate = null`（语义方案期定稿；**禁误报 done**——空集守卫口径同源） |
| 回写规则（正向；**auto-done 前置集裁定**——REV-83-004） | 聚合 `done` ∧ status ∈ **`{scheduled, in_progress}`** → 需求 `done`；**前置集外（`draft` / `blocked` / 终态）→ 零动作、零审计**。裁定理由：`draft` = 未排期/未确认、`blocked` = 有意阻塞——静默 auto-done 会掩盖人工环节；且显式流转表 `draft→done` / `blocked→done` 均不合法。done 判定与 `applyStatusChange` 门**同源**（`allLinkedStagesDone`） |
| 回写规则（对称回退；**聚合视图表述**——REV-83-005） | reset 路径**重算聚合**：`聚合 ≠ done ∧ status === done` → 回退 `in_progress`（不做 `done→scheduled` 细粒度回退；方案期可再裁）。与「从哪个 phase 回退」事件无关 |
| 触发点（REV-83-005 明写） | ① `advanceStagePhase` **仅** `targetPhase === 'done'` 分支触发聚合回写（追加于 `endStage` `:1523` 后 / `return true` `:1526` 前）；**非 done 推进不触发**——`scheduled→in_progress` 由 `req advance` 显式驱动（`ALLOWED_TRANSITIONS` `requirement-ops.ts:145-151`）；回写 = 里程碑触发。② `resetStagePhase` 全复位路径触发（`:1590-1591` 写入后；`dryRun`/no-op 早退 `:1585-1587` 不可达）。③ scoped 到**被操作阶段**的 `requirement_id`（无关联 → 零动作） |
| 审计 | 状态实际变化才 `appendLog`（`detail: { requirementId, from, to, triggerStage }`；单点 `:2688`） |
| health（**Q6 定稿：落地**——REV-83-006） | 需求对账 warn：悬空 `requirement_id`（指向不存在需求）/ `done` 漂移（**前置集内** ∧ 聚合 done ∧ status ≠ done——与回写前置集同口径；`draft`/`blocked` + 聚合 done 属**设计豁免**不报）——**不改退出码、不参与 `--fix`**（与裁定 R 同范式） |

**不变量**：

1. **既有控制流零变更**：`endStage` / `return true` / `autoCommitOnDone` / 阻塞 REV 检查顺序与语义逐字不变；回写为**追加**语句。
2. **无 `requirement_id` 阶段零行为差异**：同 phase 推进序列下，flow.json 输出（除 `meta.revision`/`meta.updated`）逐字节一致。
3. **单事务**：聚合回写与 phase 变更在**同一次 `save()`** 落盘；不出现「阶段 done 而需求未回写」的可观测中间态（除 save 失败整体回滚语义）。
4. **`--dry-run` 零回写（双路径）**：`flow advance --dry-run`（命令层 `flow.ts:916-930` 截断）+ `flow stage reset --dry-run`（引擎早退 `:1585-1587`）均不写内存、不写盘（含聚合）——REV-83-007。
5. **投影函数纯**：无 IO、无 `this` 依赖；给定输入相同输出（可单测穷举 15 phase）。
6. **正交**：聚合不读 `workflow_mode`（裁定 J）。
7. **done 判定单源**（REV-83-002）：`allLinkedStagesDone`（`requirement-ops.ts:76-79`，含空集守卫）为唯一 done 判定原语；两消费点（`applyStatusChange` `:168` / `computeRequirementAggregate`）**同源**——禁第二份 `length > 0 && every(done)` 表达式；「两处同源」断言入 T4.5。
8. **对称回退按聚合视图**（REV-83-005）：回退条件 = `重算聚合 ≠ done ∧ status === done`（不绑定事件）；仅此命中才回退 + 审计。

---

## 三、变更点清单（编号 T）

### T1 — 聚合投影函数（`src/core/req/aggregate.ts`，新建）
- `computeRequirementAggregate(stages: Record<string, StageData>, requirementId: string)`：收集关联阶段（`requirement_id === requirementId`）→ 计数 + 粗粒度聚合（`scheduled` / `in_progress` / `done`）。**done 分支复用/委托 `allLinkedStagesDone`（REV-83-002）**——实现二选一（方案期定稿，**禁第二份 done 表达式**）：① 直接委托 `allLinkedStagesDone(data, id)`（`data` 形参来源与契约 `(stages, requirementId)` 形态的取舍一并定稿）；② 抽出 stages 级核心谓词（`allLinkedStagesDone` 变薄壳委托、行为逐字不变），两消费点（`:168` / 聚合）消费同一核心。
- `resolveRequirementStatusForStage(data, stageId): { requirementId; target: RequirementStatus } | null`：单阶段 → 该需求的目标状态（供 T2 消费的纯函数）。
- 穷举断言：15 phase × {部分 done / 全 done / 空关联} 投影表（troubleshooting 教训范式）。

> 命名注：T2 回写入口统一取 **deps 契约名 `syncRequirementStatus(data, stageId): string[]`**（`deps.yaml` 下游契约「需求原语」条；原草案名 `applyRequirementAggregate` 作废——命名单点）。

### T2 — 对称回写接入（`src/core/flow-manager.ts`）
- 回写入口 `syncRequirementStatus(data, stageId): string[]`（纯内存；done 判定同源 `allLinkedStagesDone`；返回受影响需求 ID 列表供测试/日志）。
- `advanceStagePhase`：**仅** `targetPhase === "done"` 分支内（`endStage` `:1523` 后 / `return true` `:1526` 前）调用——纯内存；前置集 `{scheduled, in_progress}` 命中且状态变化 → `appendLog(requirement_auto_done)`；**非 done 推进不触发**（明写裁定——REV-83-005）。`syncCurrentOp` / 宏观 `pipeline.phase` / `return true` 语义零触碰。
- `resetStagePhase`：全复位路径 phase + status 写入（`:1590-1591`）后调用同一入口——**重算聚合视图**：`聚合 ≠ done ∧ status === done` → 回退 `in_progress` + `appendLog(requirement_auto_reopen)`。
- **dry-run 裁定（已实测核验，写入定稿）**：`advanceStagePhase` 无 `dryRun` 形参（`:1420` 签名）；`flow advance --dry-run` 于命令层 `flow.ts:916-930` return（早于调用循环 `:941`）→ 聚合回写不可达；`resetStagePhase` 含 `{ dryRun }`（`:1544`；JSDoc `:1541`），`:1585-1587` 早退 → 聚合回写不可达。两命令 dry-run 后 flow.json 字节不变（T4.4 断言——REV-83-007）。

### T3 — 存量兼容与 health 需求对账（**Q6 定稿：落地**——warn 级、不改退出码、不参与 `--fix`，与裁定 R 同范式）
- 兼容断言：无 `requirements` 字段的旧 flow.json 全路径零报错；`requirement_id` 缺省零动作（T2 早返回）。
- health 需求对账：悬空 `requirement_id` → warn；`done` 漂移（**前置集内** ∧ 聚合 done ∧ status ≠ done）→ warn；前置集外（`draft`/`blocked` + 聚合 done）**不报**（设计豁免——REV-83-004 同口径）；**不改退出码、不参与 `--fix`**。
- 落点：`src/commands/flow.ts` health action 合并 items（消费方形态对齐 `archive-health.ts` 先例）；文案新键入 i18n 双表（`flow.health.req*`，基线登记见 T5）。
- 需求层 health 项与 stage-80 归档 health 项**互不耦合**（各自独立检查函数）。
- Q6 定稿记录于本阶段；大计划 §开放问题 Q6 行随 stage-85 文档收口轮同步标记。

### T4 — 测试
- T4.1 投影穷举：15 phase 全表 + 多阶段需求（2/3 done）+ 空关联。
- T4.2 端到端（core 级）：`advanceStagePhase` 序列推进单阶段需求至全 done → 需求自动 `done` + 审计；`resetStagePhase` 回退 → 重算聚合 ≠ done → 回退 `in_progress`。**auto-done 前置集矩阵**（REV-83-004）：{draft, scheduled, in_progress, blocked, done, cancelled, rejected} × 聚合 {done, 非 done} 穷举——仅 `{scheduled, in_progress}` × 聚合 done 回写；其余零动作零审计。
- T4.3 **零回归（三路径同断言口径——REV-83-007）**：① 无 `requirement_id` 阶段推进序列的 flow.json 输出（排除 `meta.revision`/`meta.updated`）逐字节一致（fixture 快照对比）；② `flow wizard` 推进路径（`flow.ts:2221` 调用 `advanceStagePhase`）；③ deprecated `advancePhase`（`flow-manager.ts:1901` 委托 `advanceStagePhase`）。
- T4.4 dry-run 零回写断言（**双路径**——REV-83-007）：`flow advance --dry-run` + `flow stage reset --dry-run`（`flow.ts:740` → 引擎早退 `flow-manager.ts:1585-1587`）后 flow.json 字节不变（含需求字段）。
- T4.5 显式与聚合一致性（**两处同源断言**——REV-83-002）：全部 fixture 下 `computeRequirementAggregate(...).aggregate === 'done'` ⟺ `allLinkedStagesDone(data, reqId)`（空关联 / 单阶段 / 多阶段部分 done / 全 done 四组）；`req advance --to done` 门（`:168`）与聚合回写共用该原语。
- T4.6 health 对账（**落地**）：悬空 / 漂移两场景 warn + 前置集外（`draft`/`blocked`）不报（设计豁免）+ 退出码不变断言。
- 全程 fixture tmpDir / 隔离 HOME。

### T5 — 门禁
`npm run build` ×2 → `npm test`（0 skipped / 0 failed）→ `tsc` = 0 → `lint i18n` **入口基线 = 908**（实测：`OPENFEEL_LOG=0 node bin/openfeel.js lint i18n` → 「✅ 908 键一致」；health 对账新键显式登记新基线——REV-83-008）→ `lint kb` = 0。

### 承接 REV 与处置表（REV-82-015~023 / REV-81-016~020 / REV-80-029；REV-83-001）

> 复发背景：REV-80-004 / REV-81-004 / REV-82-004 / 本条为**第 4 次**同类「承接零交代」（REV-83-001）→ 本表为 stage-83 承接基线（归档轮据此核验零灭失）。来源：`users/Liuary/code_review/{REV-82.md,REV-81.md,REV-80.md}` 归档收口表。**本阶段触碰面**：`src/core/flow-manager.ts`（推进/复位两热点）、`src/core/req/**`、`src/commands/flow.ts`（health 对账落点）。

| 条目 | 摘要 | 处置 | 落点 / 依据 |
|------|------|------|------------|
| REV-82-015 [low] | stage-82/plan.md §一锚点微漂移 2 处 | **移交 stage-85 收口** | 文档层订正（`:24` / `:487` 两锚）；stage-83 不改 stage-82 文档 |
| REV-82-016 [medium] | `list --status` 值域守卫缺 `undefined` 前置判定 | **台账保留**（已落实核验：守卫在位 `src/commands/req.ts:153`） | 销账随 stage-85 收口轮；本阶段不改 `src/commands/req.ts` |
| REV-82-017 [low] | `--json` 错误码风格混用（引擎 snake / 命令层 kebab） | **台账保留**（登记可接受裁量：`stage-82/ops/deps.yaml:215`——下游引用以该形态为准） | 销账随 stage-85 收口轮 |
| REV-82-018 [low] | `link --stage` 短名归一硬钉 `v1.0.0` | **台账保留**（已落实核验：help 文案注明「短名按 v1.0.0 系列解析」`i18n-data/zh-CN.ts:920`） | 同上 |
| REV-82-019 [low] | `requirements` 创建归属措辞张力 | **台账保留**（已落实核验：消解句 `stage-82/ops/deps.yaml:217`） | 同上 |
| REV-82-020 [low] | KB 锚点引用文字不精确 | **台账保留**（已落实核验：全称锚点 `stage-82/ops/op-001.md:25`） | 同上 |
| REV-82-021 [low] | 消息键分组（`req.invalidIdTmpl` 散键） | **台账保留**（登记接受差异：`stage-82/ops/deps.yaml:219`） | 同上 |
| REV-82-022 [low] | `src/core/i18n.ts` 超范围产出未登记 | **台账保留**（归档轮已补登 op 产出清单 + 验收 pass 登记接受；运行时域注册在位 `src/core/i18n.ts:28,34`） | 同上 |
| REV-82-023 [low] | `req next` 硬编码 `'scheduled'` | **台账保留**（接受裁量 S-82-3〔`stage-82/ops/deps.yaml:122`〕；现状 `src/commands/req.ts:542`） | 同上 |
| REV-81-016 [low] | `applyStatusChange` 越域 `req.status` 缺守卫（功能已闭环） | **台账保留**（守卫在位 `requirement-ops.ts:165-167` + 用例 `test/core/req.test.ts:389`） | stage-83 若触碰 `requirement-ops.ts`（仅限 T1 委托改造），**禁改该段**（防双改） |
| REV-81-017 [low] | 正交断言写法偏离（`src.includes(n) === false`） | **移交 stage-85 收口** | `test/core/req.test.ts:638` 断言改写；本阶段仅**追加**聚合用例段、不动既有断言段 |
| REV-81-018 [low] | 校验风格 add/update 不对称 | **台账保留**（登记接受差异：注释 `requirement-ops.ts:86`） | 销账随 stage-85 收口轮 |
| REV-81-019 [low] | `addRequirement` 非数组守卫缺失 | **台账保留**（已随 `req/BUG-001` 单点修复：`requirement-ops.ts:100` `Array.isArray` 守卫） | 与 `req/BUG-001` 同处——勿双改 |
| REV-81-020 [low] | `writeRequirementBodySkeleton` 无条件改写 `body_path` | **台账保留**（命令层规避已落实：直传本体 `src/commands/req.ts:119`；防御性补丁未采纳已登记） | 销账随 stage-85 收口轮 |
| REV-80-029 [low] | 短名兜底陈述不实 + 代码注释登记缺失 | **移交 stage-85 收口**（报告层措辞已修正；`archive-health.ts` 注释补登记移交 executor） | stage-83 不改 `archive-health.ts`（零触碰） |

> 核验口径：上表 15 条 = REV-83-001 指认全集（`REV-82.md` 015~023 ×9 / `REV-81.md` 016~020 ×5 / `REV-80.md` 029 ×1）；本阶段触碰面内既有实现（REV-81-016 / 018 / 019 / 020 段）执行期**零改动**核验（除本表明列动作）；归档轮按本表逐条核验零灭失。

---

## 四、验收要点（阶段级）

1. T4 六组用例全绿；**T4.3 零回归为门禁级断言**（三路径：无 `requirement_id` / `flow wizard` / deprecated `advancePhase`——逐字节一致）。
2. 「阶段推进 → 需求自动 done」与「reset → 重算聚合回退」端到端通过；**auto-done 前置集 `{scheduled, in_progress}` 穷举矩阵断言**（前置集外零动作零审计——REV-83-004）；审计条目齐全。
3. `--dry-run` 零回写（`flow advance` + `flow stage reset` **双路径**）；单事务语义（无中间态）经故障注入（save 冲突）验证。
4. 聚合函数纯（无 IO）；**done 判定与 `req advance --to done` 门同源**（`allLinkedStagesDone` @ `requirement-ops.ts:76-79`，两消费点 `:168` / 聚合函数——**「两处同源」断言**，REV-83-002）——单一判定源。
5. 门禁全绿（含 i18n 入口基线 **908** + health 新键新基线登记）。
6. **承接闭环**（REV-83-001）：承接表 15 条逐条落点可核（本阶段动作仅限表列；其余零动作核验）。

## 五、风险

| # | 风险 | 缓解 |
|:-:|------|------|
| R-83-1 | **推进路径回归**（既有 **8 阶段**（`v1.2.0-stage-78`~`85`）语义被扰动） | 追加式实现 + T4.3 三路径逐字节断言（无 `requirement_id` / `flow wizard` / deprecated `advancePhase`）+ 既有推进用例全绿 |
| R-83-2 | 聚合与显式推进**双 done 判定源**漂移 | done 判定**委托 `allLinkedStagesDone`**（含空集守卫单点——REV-83-002）+ T4.5「两处同源」断言 + 单一回写入口（`syncRequirementStatus`） |
| R-83-3 | dry-run 误回写 | T4.4 **双路径**字节断言（`flow advance` / `flow stage reset`；kb `--dry-run` 纪律——REV-83-007） |
| R-83-4 | 15 phase 投影漏分支（autoRepair 类教训） | T4.1 穷举表断言 |
| R-83-5 | auto-done 越权（`draft`/`blocked` 静默完成，掩盖未确认/阻塞语义——REV-83-004） | 前置集裁定 `{scheduled, in_progress}` + T4.2 穷举矩阵 + health 漂移判据同口径 |
| R-83-6 | 承接灭失（同类**第 5 次**复发——REV-83-001） | 「承接 REV 与处置表」为核验基线 + 归档轮逐条核验零灭失 |

> 说明：op 级拆分建议——op-001（T1+T2 投影与回写）→ op-002（T3 对账落点 + T4/T5 测试门禁与 i18n 基线）；由 openfeel-schemer 定稿并落 `ops/deps.yaml`。

## 六、修订记录

| 时间 | 制定人 | 说明 |
|------|--------|------|
| 2026-10-11 | openfeel-planner | 初稿（立项随批次落盘）：T1~T5；依据大计划 §三 表 B 裁定 B/H/I/J/M 与 §二 表 B。**只写计划文档，未改源码、未动 flow.json。** |
| 2026-10-12 | openfeel-planner | **计划审查 REV 修订轮（REV-83-001~008 落实）**——REV-83-001：新增「承接 REV 与处置表」（15 条：`REV-82.md` 015~023 / `REV-81.md` 016~020 / `REV-80.md` 029 逐条处置 + 防灭失核验口径）；`deps.yaml` stage-83 `notes` 同步承接声明。 |
| 2026-10-12 | openfeel-planner | REV-83-002：done 判定单源——`computeRequirementAggregate` done 分支**复用/委托** `allLinkedStagesDone`（`requirement-ops.ts:76-79`，含空集守卫，消费点 `:168`）；§一 补该原语行；§二 不变量 7 + T4.5「两处同源」断言 + §四.4；`deps.yaml` 下游契约同步。 |
| 2026-10-12 | openfeel-planner | REV-83-003：§一 基线改钉 **HEAD `33185a3`** + 全表「符号名 @ 行号」双锚（`advanceStagePhase @ :1420` / `resetStagePhase @ :1544` / 空集守卫 `:1495` / `appendLog @ :2688` / `getReviewItems @ :982` / `mapPhaseToStageStatus @ :4369`）；「78 阶段」→「**8 阶段**」（§一 + R-83-1）；测试面 67 → **70 文件**（实测）。 |
| 2026-10-12 | openfeel-planner | REV-83-004：**auto-done 前置集显式裁定 = `{scheduled, in_progress}`**（`draft`/`blocked`/终态零动作零审计 + 裁定理由）；§二 回写规则行 + T4.2 穷举矩阵 + R-83-5 + §四.2。 |
| 2026-10-12 | openfeel-planner | REV-83-005：触发点明写——`advanceStagePhase` **仅 done 分支**触发（非 done 推进不触发；`scheduled→in_progress` 由 `req advance` 显式）；对称回退改「重算聚合 ≠ done ∧ status === done → 回退」**聚合视图**表述；T2 / §二 同步。 |
| 2026-10-12 | openfeel-planner | REV-83-006：**Q6 定稿（落地，warn 级、不改退出码）**；`deps.yaml` stage-83 `produces_core` 补 `src/commands/flow.ts` + `src/core/i18n-data/{zh-CN,en}.ts`；§范围 / T3 / §二 health 行同步。 |
| 2026-10-12 | openfeel-planner | REV-83-007：T4.4 增 `flow stage reset --dry-run` 零回写断言（`flow.ts:740` → `flow-manager.ts:1585-1587`）；T4.3 回归矩阵补 `flow wizard`（`flow.ts:2221`）/ deprecated `advancePhase`（`flow-manager.ts:1901`）两路径；`advanceStagePhase` 无 `dryRun` 形参已核验（`:1420`）。 |
| 2026-10-12 | openfeel-planner | REV-83-008：T5 i18n 入口基线锚定 **908**（实测复现在文）；`deps.yaml` i18n 下游条目同步（含 stage-83 入口基线）。 |
| 2026-10-12 | openfeel-planner | **复审非阻塞 REV-83-009~011 落实**——REV-83-009（**用户裁定：维持 auto-done 前置集 `{scheduled, in_progress}`**）：同步大计划裁定 M（`v1.2.0/plan.md:154`）/ 裁定 H（`:149`）文字与本计划 §二 回写口径一致（advance 仅 done 分支触发 / `scheduled → in_progress` 由 `req advance` 显式驱动 / reset 聚合视图回退）；REV-83-010：`deps.yaml` invariants 残留「存量 78 阶段」→「存量 8 阶段」（注明迁移前历史口径）；REV-83-011：`deps.yaml` 需求原语契约补 `stageIds` + 「零关联 → `aggregate = null`」+ 首参形态与委托 `allLinkedStagesDone(data, …)` 对齐（方案期定稿）。本轮只改计划文档（本文件 + 大计划 + `v1.2.0/deps.yaml`）；未改源码、未直写 flow.json、未推进 phase。 |

> 修订轮闭环：本轮只改计划文档（`stage-83/plan.md` + `v1.2.0/deps.yaml`）；未改源码、未直写 flow.json、未推进 phase。
