# v1.1.4-stage-62 计划 — 状态/相位单一事实源收敛（问题 4/5/7）

- **阶段**：`v1.1.4-stage-62`
- **依赖**：无
- **优先级**：**P0**（版本地基；stage-65 依赖其相位语义）
- **制定人**：openfeel-planner ｜ **制定时间**：2026-10-03
- **定位**：把 `status` 明确为 `phase` 的**粗粒度投影**（单一事实源 = `phase`），消除 `test_enabled=false` 触发的 `phase` 单向锁 `done` 确定性缺陷（`docs/08` 问题 12，本轮 6/6 复发）。
- **范围**：`src/core/flow-manager.ts`（映射/auto-repair/一致性）、`src/commands/stage.ts`（值域校验）、`src/core/config.ts`（`test_enabled` 移除）、`src/core/instruction-loader.ts`/`src/core/i18n-data/*`（文案）、对应测试。
- **边界**：不改 `pipeline.yaml` 转移表；不改 `flow phases` 自描述 5 键；不改 `advance` 合法路径/REV 检查；不新增依赖；不 `npm publish`/`git push`；不改 `flow.json`（由 Feel 推进）；**不新增 i18n 键**（复用既有 `stage.set.invalidValueTmpl` 等）。

## KB 检索（`openfeel-check-kb`）

- 已加载 `openfeel-check-kb`。**高度相关条目**：
  - `kb/troubleshooting.md #autoRepairInconsistency 导致测试阶段跳过`（v0.5.8 修复：`test_passed→testing`、`archiving→archiving`）→ **同一根因族**：本次是 `review_passed`（`testEnabled=false`）仍映射 `done` 的**未覆盖分支**，属该修复的**不完整补丁**。归档时须补沉/更新此条。
  - `kb/architecture.md [+]#test_enabled=false 跳过测试分路`（2026-06-27）→ **已漂移**：15 相位模型下 phase 图与 `test_enabled` 无关。归档时须 **supersede**。
  - `kb/patterns.md #--dry-run 全链路零写盘` → `autoRepairInconsistency` 的 `dryRun` 分支须保持零写盘（本次改动不得破坏）。
  - `kb/patterns.md #死导出/漂移 API 清理判据` → 支撑 `test_enabled` 移除而非保留。
- **无「status 为 phase 投影」专门条目** → 归档时由归档官补沉 architecture/patterns。

---

## 一、背景与实测证据（唯一事实基准）

| 事实 | 源码位置 | 结论 |
|------|----------|------|
| `advanceStagePhase` 已同步 `flow.json.status` | `flow-manager.ts:1308-1314` | 文档「advance 不改 status」**不成立** |
| `mapPhaseToStageStatus('review_passed',…,testEnabled=false)` → `'done'` | `flow-manager.ts:3797-3798` | 中间相位被投影为**终态**，是锁死触发源 |
| `autoRepairInconsistency`：`status==='done' && phase!=='done'` → 强制 `phase='done'` | `flow-manager.ts:2907-2914` | **单向锁**确认 |
| `flow advance` 入口在路径求解**之前**执行 auto-repair 并 `save()` | `commands/flow.ts:637-651` vs `:688` | 锁死后 `findPhasePath(done→test_pending)` = `no-path` |
| `stage set --status` **无值域校验** | `commands/stage.ts:376-377` | 接受相位值/任意值 |
| `checkCrossFileConsistency` 比对 `flow.json.status` vs status.md「状态」 | `flow-manager.ts:3354-3394` | 漂移噪声来源 |
| `reconcileStatusMd` 以 `mapPhaseToStageStatus(phase,…)` 为权威，**仅回写 status.md「状态」** | `flow-manager.ts:3126-3169` | flow.json 损坏时传播 |
| `.openfeel/pipeline.yaml:33` `review_passed: [test_pending]` | 恒定，与 test_enabled 无关 | phase 图不受 test_enabled 影响 |

**锁 `phase` 精确根因链**：`test_enabled=false` → `advance --to review_passed` 置 `flow.json.status='done'` → 下一步 `advance --to test_pending` 入口 auto-repair 把 `phase` 锁 `done` → 路径 `no-path` 报错。**确定性，6/6**。

---

## 二、目标语义（改后）

| 维度 | 改前 | 改后 |
|------|------|------|
| `status` 语义 | 由 `mapPhaseToStageStatus` 派生，但可被 `test_enabled` 提前投影为终态；auto-repair 可反向改 `phase` | **`status` = `phase` 的粗粒度投影，`phase` 为唯一事实源**；auto-repair **只允许 phase→status**，绝不 status→phase 前推 |
| `review_passed` 投影 | `testEnabled ? 'review_passed' : 'done'` | 恒 **`'review_passed'`**（中间相位不得投影为终态 `done`） |
| `test_enabled` | 参与 status 投影 | **移除**（D1 建议；见 §裁定） |
| auto-repair | `status=done → phase=done` 前推 | `status=done && phase≠done` → **修正 `status` 为 phase 投影**（撤销非法 done） |
| `stage set --status` | 任意值 | **值域校验**（粗粒度状态枚举） |

**保持不变的既有语义**：`test_passed→'testing'`、`archiving→'archiving'`、`done→'done'`、其它相位保持 `currentStatus`；`phase='done' && status≠'done'` → `status='done'`（合法方向）。

---

## 三、变更点清单（编号 T）

### T1 — `mapPhaseToStageStatus` 去除 `testEnabled`，杜绝中间相位投影为终态（`flow-manager.ts:3789-3811`）

- 删除 `testEnabled` 形参；`review_passed` 恒返回 `'review_passed'`。
- 保留 `review_failed→'review_failed'`、`test_passed→'testing'`、`archiving→'archiving'`、`done→'done'`，default→`currentStatus`。
- 同步更新两处调用点：`advanceStagePhase:1312-1313`、`reconcileStatusMd:3131-3137`（不再计算/传入 `testEnabled`）。
- **不变量**：任何**非 `done`** 相位都不得返回 `'done'`（回归断言）。

### T2 — `autoRepairInconsistency` 方向反转：phase 权威（`flow-manager.ts:2894-2926`）

- 分支 `status==='done' && phase!=='done'`：**不再**设 `phase='done'`；改为 `stage.status = mapPhaseToStageStatus(stage.phase as PipelinePhase, stage.status)`，`detail = 'status X → <投影> (以 phase 为权威，撤销非法 done)'`。
- 保留分支 `phase==='done' && status!=='done'` → `status='done'`。
- `dryRun` 分支保持**只报告不写内存**（遵守 patterns #--dry-run 零写盘）。
- **禁止**：任何由 `status` 前推 `phase` 的路径。

### T3 — `stage set --status` 值域校验（`commands/stage.ts:376-378`）

- 定义**单一来源**粗粒度状态域 `STAGE_STATUS_VALUES`（建议置 `flow-manager.ts` 导出，或 `commands/stage.ts` 与 flow-manager 共用）：由 `mapPhaseToStageStatus` 的全部可能返回值 ∪ 初始值组成 = `['planned','review_failed','review_passed','testing','archiving','done']`（schemer 落地前以 `rg "'coding'|status ="` 复核是否需并入 `'coding'`）。
- `--status` 加入 `allowed` 校验（复用既有 `stage.set.invalidValueTmpl`，**不新增 i18n 键**）；非法值 → exit 1 且**不写盘**、不生成 `.bak`。
- 向后兼容提示：若传入相位值（含 `_`），错误信息可提示「请传粗粒度状态」。

### T4 — `test_enabled` 移除（问题 5，D1 建议；`src/core/config.ts` 等）

- 从 `ConfigDefaultsSchema` 移除 `test_enabled` 字段；从 `DEFAULT_CONFIG` 移除；从 zh/en `CONFIG_TEMPLATE_*` 注释与默认行移除；从 `flow-manager.ts` 的 `EFFECTIVE_CONFIG_KEYS` 移除；`instruction-loader.ts` 的 `configParts`/输出去除该项。
- **向后兼容**：存量 `config.yaml` 中残留 `test_enabled` 行 → `buildCascadeConfig` 按「非受管扩展键」纳入但不使用（不报错、不崩溃）；`config set test_enabled …` → 报「无效键」（预期）。
- `rg test_enabled` 全仓清零（`test/**` 历史断言同步更新）。
- 若用户裁定保留 deprecated（D1 备选）：则仅从投影中剔除、schema 保留并 `console.warn` 弃用。

### T5 — `flow health` 一致性与 `--fix` 权威口径

- `checkCrossFileConsistency`/`reconcileStatusMd` 保持（投影修复后二者应自然一致）；`reconcileStatusMd` 的权威 = `mapPhaseToStageStatus(phase)`（phase 投影）。
- `--fix` 已批量遍历所有阶段（无需改）；补充文档说明「以 phase 投影为权威、仅回写 status.md『状态』字段、批量」。
- D3（暂不）使 `flow advance` 不回写 `status.md`——保持 `--fix` 为唯一回写入口。

### T6 — 测试面（复现-修复-回归）

| # | 用例 | 断言 |
|:-:|------|------|
| T6.1 | `mapPhaseToStageStatus` 全相位扫描 | 所有非 `done` 相位返回值 ≠ `'done'`；`review_passed` 恒 `'review_passed'` |
| T6.2 | 锁复现（核心） | `phase=review_passed, status=done`（旧损坏）→ `autoRepairInconsistency` 后 `status='review_passed'` **且 `phase` 仍 `review_passed`** |
| T6.3 | 端到端 | `test_enabled=false` 不复存在（T4）后，模拟 `advance --to review_passed` → `status` ≠ `done`；`advance --to test_pending` 成功 |
| T6.4 | 合法方向 | `phase=done, status='planned'` → `status='done'` |
| T6.5 | `stage set --status` | `--status review_pending`（相位值）→ exit 1 不写盘；`--status done` 合法 |
| T6.6 | dry-run 零写盘 | `autoRepairInconsistency(stage,{dryRun:true})` 不改内存/不写盘（回归） |

### T7 — 文档面

| # | 文件 | 改动 |
|:-:|------|------|
| T7.1 | `.openfeel/manual/core/flow-manager.md` | 明确 `status`=phase 投影、单一事实源；auto-repair 仅 phase→status；锁根因与修复 |
| T7.2 | `.openfeel/manual/core/config.md` | `test_enabled` 移除说明（或 deprecated） |
| T7.3 | `.openfeel/manual/cli/commands.md`、`docs/commands.md` | `stage set --status` 值域；`flow health --fix` 权威口径 |
| T7.4 | KB（归档官执行） | supersede `architecture #test_enabled`；更新 `troubleshooting #autoRepairInconsistency`（补 `review_passed` 分支根因） |

---

## 四、op 划分与执行顺序（**3 op**）

| op | 主题 | 覆盖 | 关键产出 | 依赖 |
|:--:|------|------|----------|------|
| **op-001** | 核心修复：映射 + auto-repair + 值域 + 测试 | T1+T2+T3+T6 | `flow-manager.ts`、`commands/stage.ts`；单测；`npm test`+`tsc` | — |
| **op-002** | `test_enabled` 移除 | T4 | `config.ts`/`templates`/`EFFECTIVE_CONFIG_KEYS`/`instruction-loader`/`i18n`；`rg` 清零；测试更新 | hard: op-001 |
| **op-003** | 文档 + KB 备注 + 门禁 | T5+T7 | manual/docs；全门禁实跑；阶段报告 | hard: op-002 |

**顺序：op-001 → op-002 → op-003。**

**边界声明**：不改转移表/`flow phases` 5 键/REV 检查；不新增依赖；不新增 i18n 键；不 `npm publish`/`git push`；不改 `flow.json`。

---

## 五、验收标准（阶段级）

1. **映射不变量**：`mapPhaseToStageStatus` 对任意非 `done` 相位返回值 ≠ `'done'`（穷举断言）。
2. **锁消失（决定性）**：`phase=review_passed, status=done` 场景经 auto-repair 后 `phase` **不变**、`status='review_passed'`；端到端 `test_pending` 可达。
3. **方向性**：仅存在 `status←phase` 修正，无 `phase←status` 前推（`rg` 复核 + 断言）。
4. **值域**：`stage set --status` 拒绝相位值/任意值（exit 1、零写盘）；接受粗粒度枚举。
5. **dry-run**：`autoRepairInconsistency` dry-run 零写盘（revision 不变）。
6. **`test_enabled` 清零**：`rg test_enabled src/ test/` = 0（或按 D1 备选保留为显式 deprecated no-op + 断言不使用）。
7. **测试**：`npm test` 全绿，`0 skipped / 0 failed`（新增用例后总数 > 1016，以实盘为准）。
8. **类型**：`npx tsc --noEmit` = 0。
9. **i18n**：`lint i18n` = **730**（复用既有键，不增不减）。
10. **KB**：`lint kb` = 0 过期。
11. **健康**：修复后 `flow health` 对 projection 不再产生跨文件一致性噪声（人工验证 fixture）。

---

## 六、风险与回滚

| # | 风险 | 影响 | 缓解 / 回滚 |
|:-:|------|------|-------------|
| R-1 | `status` 语义变更影响既有断言 | 高 | 先加 T6 回归锁定新语义；逐项核对 `mapPhaseToStageStatus`/`reconcileStatusMd`/`health` 相关用例 |
| R-2 | auto-repair 反向改动使旧测试期望失败 | 中 | 明确「phase 权威」为预期；更新受影响断言并留注释 |
| R-3 | `test_enabled` 移除破坏存量 config/模板断言 | 中 | 向后兼容（非受管键纳入）；`rg` 全量清单；不新增 i18n 键 |
| R-4 | dry-run 引入写盘回归 | 中 | T6.6 断言 revision/字节不变 |
| R-5 | `stage set --status` 值域过严阻断既有合法用法 | 低 | 枚举含全部 `mapPhaseToStageStatus` 返回值 + `planned`；错误文案提示粗粒度 |

**回滚**：改动集中于 `flow-manager.ts`/`stage.ts`/`config.ts` + 测试；`git revert <sha>` 即可；无数据迁移。

---

## 七、边界（不做）

1. 不改 `pipeline.yaml` 转移表、`flow phases` 5 键自描述。
2. 不改 `flow advance` 合法路径求解与 REV 阻塞检查（仅改其前置 auto-repair 方向）。
3. 不新增依赖、不新增 i18n 键、不动 CI workflow。
4. 不 `npm publish`、不 `git push`、不改 `flow.json`。
5. 不实现 `flow advance` 回写 `status.md`（留 D3；本阶段保持 `--fix` 唯一回写入口）。
6. 不创建除本阶段外的 op（op 由 openfeel-schemer 产出）。

---

## 八、裁定项（本阶段需明确）

| # | 议题 | **建议** | 依据 |
|:-:|------|----------|------|
| **D1** | `test_enabled` 移除 vs deprecated | **移除** | 15 相位模型下 phase 图与它无关；保留即误导（`kb #死导出/漂移 API 清理判据`） |
| **D3** | `advance` 是否回写 status.md | **暂不** | 避免 `advance` 耦合 status.md；`--fix` 批量对账为唯一回写入口 |
| **D-status** | 粗粒度状态枚举集 | `['planned','review_failed','review_passed','testing','archiving','done']`（落地前 `rg 'coding'` 复核） | 由 `mapPhaseToStageStatus` 返回值 ∪ 初始值派生 |

## 九、修订记录

| 时间 | 制定人 | 说明 |
|------|--------|------|
| 2026-10-03 | openfeel-planner | 初稿：T1~T7；3 op；验收 11 条；锁根因链；裁定 D1/D3/D-status |