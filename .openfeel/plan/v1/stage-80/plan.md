# v1.2.0-stage-80 计划 — 归档消费点适配与存量迁移（本仓自举）

- **阶段**：`v1.2.0-stage-80`（主题二 · 归档拆分收官阶段）
- **依赖**：**hard: v1.2.0-stage-78, v1.2.0-stage-79**（引擎 + 命令面就绪后方可适配消费点并执行真实迁移）
- **优先级**：P0（对既有系统的**侵入面**——deps 校验 / health / 恢复路径 + 本仓 78 阶段真实搬迁，回归风险最高）
- **制定人**：openfeel-planner ｜ **制定时间**：2026-10-11
- **定位**：把 stage-78/79 的归档能力**接入既有消费点并完成本仓自举迁移**——① 跨版本 stage deps 校验适配（`plan stage add --deps` 对已归档版本视为已满足，裁定 Q）；② `flow health` 归档一致性检查（裁定 R）；③ 恢复（checkpoint restore）与归档的关系落文案；④ **本仓 78 阶段一次性迁移**（9 个版本组；备份 + 判据门 + 回滚路径成文，裁定 S）；⑤ 端到端验证（归档后既有命令全绿 + flow.json 体积实测下降）。
- **范围**：`src/commands/plan.ts`、`src/core/flow-manager.ts`（health 检查项最小追加）、`src/commands/flow.ts`（`health` 输出）、`test/commands/plan.test.ts`、`test/core/flow-manager.test.ts`、`test/commands/flow.test.ts`；**`.openfeel/flow.json`（自举迁移产物，经 CLI 归档命令生成——非手改）**。
- **边界**：**不做**自动归档（裁定 W）；**不改** phase 枚举 / 转移表；**不改**顶层 `openfeel archive`；**不归档** `requirements`（裁定 W）；不删除归档文件（无 unarchive）；不新增第三方依赖；不 `npm publish` / 不 `git push`；不直写 `flow.json`（迁移经 `flow archive` CLI 执行）。

## KB 检索（`openfeel-check-kb`）

- 已加载。**高度相关条目**：
  - `kb/patterns.md #真实全局目录操作的安全程序：全量备份 + 判据门 + 回滚` → 本仓迁移四步：整文件备份（含 SHA256）→ 逐版本判据门（`--dry-run` 先行）→ 顺序执行 → 回滚路径预先成文。
  - `kb/patterns.md #「只报告型」与「修复型」命令的边界` → health 归档一致性检查**默认只报告**（warn，不改退出码）；不做自动修复命令（v1.2.0 范围外）。
  - `kb/troubleshooting.md #flow.json 内容增量核验必含 meta.revision/meta.updated` → 迁移前后核验须排除 `meta.revision` / `meta.updated` 再比对内容。
  - `kb/patterns.md #short name/full name stage 解析归一化` + `#阶段路径映射` → deps 版本前缀判定经 `parseStageId`，与 stage-78 `versionOfStageId` 同源。
  - `kb/patterns.md #跨阶段「契约先行」协同` → 消费 stage-78 的 `listArchiveVersions` / `getArchivedVersions`；禁第二套索引解析。
  - **无**「归档一致性 health 检查」既有条目 → 归档时补沉 patterns。

---

## 一、背景与实测证据（大计划 §二 表 A 摘引）

| 事实 | 位置 | 结论 |
|------|------|------|
| `plan stage add --deps` 校验 `deps ⊆ flow.json 已注册 stages`（未注册 → exit 1 零写盘） | `src/commands/plan.ts:85-99` | **适配点**：deps 版本前缀 ∈ `meta.archived_versions` → 视为已满足；未注册且未归档 → 仍拒绝 |
| `flow health`：`getHealthReport(quick)` + `--fix`（仅回写 status.md 状态） | `src/commands/flow.ts:1630-1670`；`src/core/flow-manager.ts` health 实现 | **适配点**：新增「归档一致性」warn 项（不改退出码、不参与 `--fix`） |
| `checkpoint restore`（含 `--stage`）为 flow.json 全量/子树快照恢复 | `src/commands/flow.ts:1543+`；`src/core/flow-manager.ts:601-670` | 恢复早于归档点的快照会带回归档阶段 → health warn + 文档路径（裁定 R） |
| 本仓 `flow.json`：78 阶段 / 9 版本组（`v1.0.0`×34 / `v1.1.0`×6 / `v1.1.1`×1 / `v1.1.2`×20 / `v1.1.3`×1 / `v1.1.4`×4 / `v1.1.5`×2 / `v1.1.6`×6 / `v1.1.7`×4）/ `current.stage = v1.1.7-stage-77` / `phase = done`（实测） | 迁移对象与初值；v1.2.0 八阶段中 78~80 已注册（**不属**被归档版本） |
| `.openfeel/flow.json.bak`（save 写前备份）+ `.openfeel/checkpoints/`（20 上限） | 实测 | 备份双保险的既有设施；迁移额外做**仓库外/独立目录全量备份**（kb 安全程序） |

---

## 二、目标语义与不变量

| 维度 | 内容 |
|------|------|
| deps 适配 | `--deps <stageId>`：已注册 → 现状；版本前缀 ∈ `archived_versions` → **视为已满足**（警告行提示「依赖已归档版本」可选）；其余 → exit 1 |
| health 检查项 | ① `archived_versions` 中某版本无对应归档文件 → warn；② flow.json 又含已归档版本阶段（如 restore 带回）→ warn；③ 归档目录有文件但索引缺失 → warn（不改退出码、不参与 `--fix`） |
| 迁移 | 按 9 组逐版本 `flow archive <version>`；`--dry-run` 先行；每步后 `flow health`；体积前后记录 |
| 恢复文案 | restore 早于归档点的快照 → 文档明示「需重新归档」；health 给出可读提示 |

**不变量**：

1. **既有命令零回归**：deps 正例（新建 v1.2.0 阶段）与负例（不存在阶段）行为不变；`flow health` 既有检查项与输出逐字不变（仅新增 warn 行；`--json` 仅增键）。
2. **迁移可回滚**：备份文件 + 回滚命令成文（`cp` 备份回 `flow.json` + 删 `flow-archive/` + 索引移除或整体还原备份）；迁移前工作区 clean 检查。
3. **迁移不动 v1.2.0 阶段**：78~80（及后续注册的 81~85）不属被归档版本，零影响。
4. **常规路径零触碰**：health 的新检查项**只读** `flow-archive/` 的**目录清单级**信息（`listArchiveVersions`）——不读归档文件内容（`readArchiveFile` 不经 health）。
5. **无新写盘点**：deps 适配为只读校验；health 为只读（`--fix` 不触归档）。

---

## 三、变更点清单（编号 T）

### T1 — 跨版本 deps 适配（`src/commands/plan.ts`）
- 校验逻辑扩展（`:85-99` 处）：`invalid = deps.filter(d => !registered.has(norm(d)) && !isArchivedVersionOf(d))`——`isArchivedVersionOf` 经 stage-78 core helper（`versionOfStageId` + `getArchivedVersions`，**禁第二套解析**）。
- 提示：依赖命中已归档版本时输出一行 info（i18n 键），不阻断。
- 负例保持：既未注册也未归档 → 现行为（exit 1 + 无效项列表）逐字不变。

### T2 — `flow health` 归档一致性检查（core + 命令层）
- core：health 实现处（`getHealthReport` 链路，方案期定位精确行）追加检查项（warn 级）：
  - a. `archived_versions` ↔ `listArchiveVersions` 双向对账（索引有文件缺 / 文件有索引缺）；
  - b. flow.json `stages` 中存在版本前缀 ∈ `archived_versions` 的阶段（restore 带回 / 重复归档残留）。
- 命令层：`flow health`（人类 + `--json`）输出新项；**不改退出码**；`--fix` 不处理归档项（只报告）。
- `--quick` 语义：归档项归入非 quick 集合（方案期定稿）。

### T3 — 恢复路径与文案（裁定 R）
- `checkpoint restore`（含 `--stage`）后若带回归档阶段：health 的 T2.b 即时报 warn；**不改 restore 行为**。
- 阶段内落文案（供 stage-85 docs 承接）：恢复分层（ADR-004）与归档的关系表（`flow health` → `stage reset` → `restore --stage` → 全量 restore → `health --fix`；归档后须补 `flow archive` 重新归档）。

### T4 — 本仓 78 阶段存量迁移（自举，裁定 S）
- **前置（执行前须用户确认）**：① 工作区 clean（`git status` 确认无未提交关键改动）；② 全量备份 `flow.json`（+ `.bak` 留存）至备份目录并记录 SHA256；③ 记录迁移前体积/revision/阶段数/log 条数。
- 执行：按 9 组顺序 `flow archive vX --dry-run` → `flow archive vX`（v1.0.0 起）→ 每步 `flow health`；全部完成后 `flow archive list` 复核 9 组。
- 核验：① 体积前后对比记录；② `git diff .openfeel/flow.json` 内容核验排除 `meta.revision`/`meta.updated`（kb 纪律）；③ 既有命令抽查（`flow status` / `overview` / `log` / `metrics`）全绿；④ v1.2.0 阶段（78~80）零影响。
- **回滚路径成文**：备份回填 + `rm -rf .openfeel/flow-archive/` + 备份中的 `archived_versions` 还原（或整体还原备份文件）→ `flow health` 复核。

### T5 — 端到端与常规路径零触碰验证程序
- 隔离临时项目：多版本 fixture 归档 → **重命名 `.openfeel/flow-archive/`** → 消费点清单全员（大计划 §三 裁定 P 附注；含 `flow status` / `overview` / `current` / `ops list` / `health` / `log` / `metrics` / `advance` 等）全命令绿 → 恢复目录名一致（验收 4 的可执行化）。
- 既有命令零破坏断言（`flow phases --json` / `flow mode --json` / `flow advance` 拒绝集逐字）。

### T6 — 测试与门禁
- `test/commands/plan.test.ts`：deps 正例（已归档视为满足）/ 负例（不存在仍拒绝）/ 归档文件缺失时索引判定。
- `test/core/flow-manager.test.ts` + `test/commands/flow.test.ts`：health 归档三项（对账缺失 / 重复阶段 / 索引缺）。
- 门禁：`npm run build` ×2 → `npm test` → `tsc` = 0 → `lint i18n` 新基线（显式登记）→ `lint kb` = 0。

---

## 四、验收要点（阶段级）

1. deps 适配正/负例全绿；`plan stage add` 其余行为逐字不变。
2. health 归档三项触发与恢复路径提示正确；退出码语义不变；`--json` 仅增键。
3. **迁移完成**：`flow archive list` = 9 组；flow.json 体积显著下降（记录数值）；既有命令全绿；回滚路径成文并有独立复核。
4. 常规路径零触碰验证程序通过（T5）。
5. 门禁全绿；v1.2.0 阶段（78~80）与 flow 生命周期零影响。

## 五、风险

| # | 风险 | 缓解 |
|:-:|------|------|
| R-80-1 | 真实迁移误操作（本仓唯一不可轻率回滚的动作面） | 裁定 S 四步程序（备份 + dry-run + 判据门 + 回滚成文）+ 执行前用户确认（开放问题 Q9） |
| R-80-2 | deps 适配破坏既有拒绝语义 | 负例逐字断言（T6）+ 既有 `plan.test.ts` 全绿 |
| R-80-3 | health 误报（正常态报 warn） | 双向对账 + 三项独立用例 + 本仓迁移后 `flow health` 零 warn 验收 |
| R-80-4 | restore 带回归档阶段未被发现 | T2.b 检查项 + 文档路径（T3） |

> 说明：op 级拆分建议——op-001（T1+T2 deps 与 health 适配）→ op-002（T3 文案 + T5 验证程序）→ op-003（T4 本仓迁移 + T6 门禁，**收口 op 为最终 op**）；由 openfeel-schemer 定稿并落 `ops/deps.yaml`。

## 六、修订记录

| 时间 | 制定人 | 说明 |
|------|--------|------|
| 2026-10-11 | openfeel-planner | 初稿（立项随批次落盘）：T1~T6；依据大计划 §三 裁定 Q/R/S/W 与 §二 表 A。**只写计划文档，未改源码、未动 flow.json。** |
| 2026-10-11 | openfeel-planner | REV 修订轮（v1.2.0-stage-78 plan_review 后续）：T5 常规路径零触碰清单升级为「消费点清单全员（大计划 §三 裁定 P 附注）」。**只改计划文档。** |
