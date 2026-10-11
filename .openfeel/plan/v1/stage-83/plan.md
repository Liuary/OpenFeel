# v1.2.0-stage-83 计划 — 需求聚合判定与对账（对称回写）

- **阶段**：`v1.2.0-stage-83`（主题一 · 需求流转收官阶段）
- **依赖**：**hard: v1.2.0-stage-81, v1.2.0-stage-82**（引擎 + 命令面就绪；聚合回写接入既有推进热点）
- **优先级**：P0（**回归风险最高面**：触碰 `advanceStagePhase` / `resetStagePhase` 既有推进路径；「阶段推进 → 需求自动 done」的端到端语义在此闭环）
- **制定人**：openfeel-planner ｜ **制定时间**：2026-10-11
- **定位**：把「需求状态 = 阶段 phase 聚合投影」落地——① `computeRequirementAggregate` 独立投影纯函数；② `advanceStagePhase` done 分支与 `resetStagePhase` **对称回写**（纯内存，同事务）；③ 存量兼容（`requirement_id` 缺省 / `requirements` 缺失）；④（可选）`flow health` 需求对账 warn 项；⑤ 端到端聚合单测。
- **范围**：新建 `src/core/req/aggregate.ts`；`src/core/flow-manager.ts`（done 分支 + reset 分支最小追加）+ `src/commands/flow.ts`（如 health 对账落地）；`test/core/req.test.ts`、`test/core/flow-manager.test.ts`、`test/commands/flow.test.ts`。
- **边界**：**不改** `mapPhaseToStageStatus`（核验 B10）；**不改** 既有控制流与返回值（`endStage` / `return true` / `autoCommitOnDone` 语义逐字不变）；**不新增写盘点**（回写 = 内存 + 既有单次 `save()`）；不做需求归档（大计划 §七.5）；不新增第三方依赖；不 `npm publish` / 不 `git push`；不直写 `flow.json`。

## KB 检索（`openfeel-check-kb`）

- 已加载。**高度相关条目**：
  - `kb/architecture.md #状态/相位单一事实源：status 为 phase 的粗粒度投影，phase 为唯一事实源` + `#auto-repair 仅 phase→status 单向` → 聚合**方向单一**（phase → 需求状态）；**绝不**由需求状态前推阶段 phase；投影可重算 = 漂移自愈。
  - `kb/patterns.md #事务顺序模式：先落盘状态、后执行不可逆副作用` → 回写在 `advanceStagePhase` **内存阶段**完成；命令层既有 `save()` 即同事务；`autoCommitOnDone` 顺序不变。
  - `kb/patterns.md #`--dry-run` 必须字节级不写盘` → `flow advance --dry-run` 路径**不得**触发聚合回写（内存重算须跳过或只算不赋值——方案期定稿并断言）。
  - `kb/patterns.md #REV/缺陷状态收口的分层口径` → health 需求对账为「只报告」层（warn，不改退出码）；不做自动修复。
  - `kb/troubleshooting.md #autoRepairInconsistency 干扰组合条件推进路径`（教训：映射分支更新须穷举断言「非 done 相位不投影 done」）→ 聚合判定须穷举 15 phase 的投影结果断言。
  - **无**「需求聚合回写」既有条目 → 归档时补沉 architecture（需求聚合投影）。

---

## 一、背景与实测证据（大计划 §二 表 B 摘引；行号以 HEAD `84951ce` 为准）

| 事实 | 位置 | 结论 |
|------|------|------|
| `advanceStagePhase()`：done 分支阻塞 REV 检查（1440-1455）→ 写 phase（1461）→ checkpoint（1464）→ `syncCurrentOp`（1478）→ 宏观 done 判定（1484-1486）→ `appendLog`（1489-1494）→ status 投影（1501-1502）→ `targetPhase === "done"` 时 `endStage` + `return true`（1510-1514） | `src/core/flow-manager.ts:1408-1517` | 回写追加点：`endStage` 之后、`return true` 之前（纯内存；不改返回值） |
| `resetStagePhase()` 对称复位（审计 `reset_stage_phase`；不触发归档 commit） | `src/core/flow-manager.ts:1532+` | 回写追加点：phase 写入 + status 投影之后（同样纯内存） |
| `mapPhaseToStageStatus()`（default 分支返回 currentStatus） | `src/core/flow-manager.ts:4324` | **不改**；需求聚合为独立函数 |
| `appendLog()` 单点 | `src/core/flow-manager.ts:2676` | 审计：`requirement_auto_done` / `requirement_auto_reopen`（方案期定稿命名） |
| `getReviewItems()` 副本范式；`FlowData.requirements`（stage-81） | `src/core/flow-manager.ts:970-977` / stage-81 交付 | 聚合函数消费 `stages` + `requirements`，输出投影 |
| 本仓 78 阶段 `requirement_id` 缺省（实测） | 实测 | 「无 requirement_id 阶段推进逐字不变」为**第一回归断言** |
| 既有测试面：`test/core/flow-manager.test.ts`（含推进路径大量用例）、`test/commands/flow.test.ts` | 实测 67 文件 | 回写改动须全绿 |

---

## 二、目标语义与不变量

| 维度 | 内容 |
|------|------|
| 投影函数 | `computeRequirementAggregate(stages, requirementId): { stageIds; stageCount; doneCount; aggregate: "scheduled" \| "in_progress" \| "done" }`（关联零阶段 → `aggregate = null` 或 `scheduled` 语义方案期定稿） |
| 回写规则 | 全部关联阶段 `done` → 需求 `done`（status ∉ {`done`,`cancelled`,`rejected`} 时）；任一阶段非 `plan_pending` 且 status === `scheduled` → `in_progress`；阶段从 done 回退且 status === `done` → 回退 `in_progress`（对称） |
| 触发点 | `advanceStagePhase`（`targetPhase === "done"` 分支）+ `resetStagePhase`（任何回退）；scoped 到**被操作阶段**的 `requirement_id`（无关联 → 零动作） |
| 审计 | 状态实际变化才 `appendLog`（`detail: { requirementId, from, to, triggerStage }`） |
| health（可选） | 需求对账 warn：悬空 `requirement_id`（指向不存在需求）/ `done` 漂移（聚合应为 done 而 status 非 done）——开放问题 Q6 |

**不变量**：

1. **既有控制流零变更**：`endStage` / `return true` / `autoCommitOnDone` / 阻塞 REV 检查顺序与语义逐字不变；回写为**追加**语句。
2. **无 `requirement_id` 阶段零行为差异**：同 phase 推进序列下，flow.json 输出（除 `meta.revision`/`meta.updated`）逐字节一致。
3. **单事务**：聚合回写与 phase 变更在**同一次 `save()`** 落盘；不出现「阶段 done 而需求未回写」的可观测中间态（除 save 失败整体回滚语义）。
4. **`--dry-run` 零回写**：`flow advance --dry-run` 不写内存、不写盘（含聚合）。
5. **投影函数纯**：无 IO、无 `this` 依赖；给定输入相同输出（可单测穷举 15 phase）。
6. **正交**：聚合不读 `workflow_mode`（裁定 J）。

---

## 三、变更点清单（编号 T）

### T1 — 聚合投影函数（`src/core/req/aggregate.ts`，新建）
- `computeRequirementAggregate(stages: Record<string, StageData>, requirementId: string)`：收集关联阶段（`requirement_id === requirementId`）→ 计数 + 粗粒度聚合（`scheduled` / `in_progress` / `done`）。
- `resolveRequirementStatusForStage(data, stageId): { requirementId; target: RequirementStatus } | null`：单阶段 → 该需求的目标状态（供 T2 消费的纯函数）。
- 穷举断言：15 phase × {部分 done / 全 done / 空关联} 投影表（troubleshooting 教训范式）。

### T2 — 对称回写接入（`src/core/flow-manager.ts`）
- `advanceStagePhase`：`targetPhase === "done"` 分支内（`endStage` 后）调用 `applyRequirementAggregate(data, key)`——**纯内存**；状态变化 → `appendLog(requirement_auto_done)`。
- `resetStagePhase`：phase 写入后调用同一 `applyRequirementAggregate(data, key)`（done → in_progress 回退路径）。
- **dry-run 分支**：`advanceStagePhase` 无 dryRun 形参（dry-run 在命令层截断——核验 `--dry-run` 实现路径）；若命令层 dry-run 在 save 前截断，则回写仅入内存且不 save（**方案期核实并断言**：dry-run 后 flow.json 字节不变，含需求字段）。
- `syncCurrentOp` / 宏观 `pipeline.phase` / `return true` 语义零触碰。

### T3 — 存量兼容与 health 对账（可选，开放问题 Q6）
- 兼容断言：无 `requirements` 字段的旧 flow.json 全路径零报错；`requirement_id` 缺省零动作（T2 早返回）。
- health 需求对账（若落地）：悬空 `requirement_id` → warn；`done` 漂移 → warn；**不改退出码、不参与 `--fix`**。
- 需求层 health 项与 stage-80 归档 health 项**互不耦合**（各自独立检查函数）。

### T4 — 测试
- T4.1 投影穷举：15 phase 全表 + 多阶段需求（2/3 done）+ 空关联。
- T4.2 端到端（core 级）：`advanceStagePhase` 序列推进单阶段需求至全 done → 需求自动 `done` + 审计；`resetStagePhase` 回退 → 需求回退。
- T4.3 **零回归**：无 `requirement_id` 阶段推进序列的 flow.json 输出（排除 `meta.revision`/`meta.updated`）逐字节一致（fixture 快照对比）。
- T4.4 dry-run 零回写断言（`flow advance --dry-run` 后 flow.json 字节不变）。
- T4.5 显式与聚合一致性：`req advance --to done` 校验函数与聚合判定共用（stage-82 T3 复用）。
- T4.6 health 对账（若落地）：悬空 / 漂移两场景 warn。
- 全程 fixture tmpDir / 隔离 HOME。

### T5 — 门禁
`npm run build` ×2 → `npm test`（0 skipped / 0 failed）→ `tsc` = 0 → `lint i18n` 新基线（health 项文案如需；显式登记）→ `lint kb` = 0。

---

## 四、验收要点（阶段级）

1. T4 六组用例全绿；**T4.3 零回归为门禁级断言**（无 `requirement_id` 场景逐字节一致）。
2. 「阶段推进 → 需求自动 done」与「reset → 需求回退」端到端通过；审计条目齐全。
3. `--dry-run` 零回写；单事务语义（无中间态）经故障注入（save 冲突）验证。
4. 聚合函数纯（无 IO）且与 `req advance --to done` 校验共用（单一判定源）。
5. 门禁全绿。

## 五、风险

| # | 风险 | 缓解 |
|:-:|------|------|
| R-83-1 | **推进路径回归**（既有 78 阶段语义被扰动） | 追加式实现 + T4.3 逐字节断言 + 既有推进用例全绿 |
| R-83-2 | 聚合与显式推进双判定源漂移 | 判定函数单一来源（T1 纯函数供两处消费） |
| R-83-3 | dry-run 误回写 | T4.4 字节断言（kb `--dry-run` 纪律） |
| R-83-4 | 15 phase 投影漏分支（autoRepair 类教训） | T4.1 穷举表断言 |

> 说明：op 级拆分建议——op-001（T1+T2 投影与回写）→ op-002（T3 对账 + T4/T5 测试门禁）；由 openfeel-schemer 定稿并落 `ops/deps.yaml`。

## 六、修订记录

| 时间 | 制定人 | 说明 |
|------|--------|------|
| 2026-10-11 | openfeel-planner | 初稿（立项随批次落盘）：T1~T5；依据大计划 §三 表 B 裁定 B/H/I/J/M 与 §二 表 B。**只写计划文档，未改源码、未动 flow.json。** |
