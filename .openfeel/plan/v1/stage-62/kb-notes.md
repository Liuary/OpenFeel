# v1.1.4-stage-62 KB 变更备注（供归档官执行）

> **本文件仅为登记**，由 openfeel-executor 在 op-003（T5）产出，**不直接编辑 `.openfeel/kb/**`**。
> 实际 KB 写入由 **openfeel-archiver** 在归档阶段执行，并同步更新 `.openfeel/kb/index.md`。
> 语义来源：本阶段 plan.md（§变更点 T1~T7、§裁定 D1/D3/D-status）与 op-001/op-002 落地代码。

## 交付项 1 — **supersede** `kb/architecture.md #test_enabled=false 跳过测试分路`

- **目标**：`kb/architecture.md` 中标题含 `#test_enabled=false 跳过测试分路`（2026-06-27）的条目。
- **动作**：**追加式 supersede**（保留原文，追加 supersede 记录与替换说明；不删除原条目）。
- **原因**：`test_enabled` 已由 **op-002** 从代码全链移除（`ConfigDefaultsSchema` / `DEFAULT_CONFIG` / `EFFECTIVE_CONFIG_KEYS` / `instruction-loader` / 模板）。15 相位模型下 **phase 图与 `test_enabled` 无关**（`.openfeel/pipeline.yaml` 的 `review_passed: [test_pending]` 恒定）。
- **supersede 记录建议文案**：
  > [superseded 2026-10-03 / v1.1.4-stage-62] 本条目描述的 `test_enabled=false` 测试分路机制已移除：15 相位模型下 phase 图与 `test_enabled` 无关，保留即误导（`kb #死导出/漂移 API 清理判据`）。`test_enabled` 键已从 `ConfigDefaultsSchema`/`DEFAULT_CONFIG`/`EFFECTIVE_CONFIG_KEYS` 全链移除；存量 `config.yaml` 残留行按非受管扩展键读侧 passthrough 兼容。后续 phase 语义见交付项 3。

## 交付项 2 — **补沉** `kb/troubleshooting.md #autoRepairInconsistency 导致测试阶段跳过`

- **目标**：`kb/troubleshooting.md` 中标题含 `#autoRepairInconsistency 导致测试阶段跳过` 的条目（v0.5.8 修复：`test_passed→testing`、`archiving→archiving`）。
- **动作**：**补沉该修复的未覆盖分支根因**（追加段落，不删原文）——此前修复**不完整**。
- **根因（未覆盖分支）**：`mapPhaseToStageStatus('review_passed', …, testEnabled=false)` 曾被投影为终态 `'done'`（分支未覆盖），叠加 `autoRepairInconsistency` 的**反向** `status=done → phase=done` 前推，把中间相位 `review_passed` **锁死为 `done`**，截断 `review_passed → test_pending` 路径（`no-path`，确定性 6/6 复发）。
- **修复（v1.1.4-stage-62 / op-001）**：
  1. `mapPhaseToStageStatus` 去除 `testEnabled` 形参，`review_passed` 恒 `'review_passed'`（中间相位不再投影终态）；
  2. `autoRepairInconsistency` **方向反转**——`status==='done' && phase!=='done'` 改为修正 `status` 为 phase 投影（撤销非法 `done`），**禁止任何 `status→phase` 前推**。
- **补沉记录建议文案**：
  > [补沉 2026-10-03 / v1.1.4-stage-62] 补该条目未覆盖分支：`review_passed`（`test_enabled=false`）曾被投影为终态 `done`，触发 auto-repair 反向把 `phase` 锁 `done`。根因 = 映射分支覆盖不全 + auto-repair 方向错误（`status→phase`）。修复 = 映射去 `testEnabled`（`review_passed` 恒 `'review_passed'`）+ auto-repair 仅 `phase→status` 单向。

## 交付项 3 — **新增**两条架构/模式条目

1. **`kb/architecture.md` 新增**：**「`status` = `phase` 的粗粒度投影、单一事实源 = `phase`」**
   - 要点：`stage.status` 由 `mapPhaseToStageStatus(phase)` 派生，任何 `status` 可由 `phase` 重投影得到；对账/修正只允许 `phase → status` 单向；`flow.json` 损坏时以 `phase` 为准。
2. **`kb/patterns.md` 新增**：**「auto-repair 仅 `phase→status` 单向；`flow health --fix` 唯一批量回写入口」**
   - 要点：`autoRepairInconsistency` 只允许 `phase → status`（撤销非法 `status=done`），**绝不** `status → phase` 前推；`flow health --fix` 以 phase 投影为权威、**仅回写 `status.md`「状态」字段**、批量遍历全部阶段、`--dry-run` 零写盘；`flow advance` **不回写** `status.md`（D3），故 `--fix` 为唯一批量对账/回写入口。

## 备注

- 本阶段 **不改 `pipeline.yaml` 转移表**、不改 `flow phases` 自描述 5 键、不新增 i18n 键。
- 归档官执行时须同步更新 `.openfeel/kb/index.md`，并在公共日志记录该次 KB 写入。
