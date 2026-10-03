# v1.1.4-stage-65 计划 — checkpoint 选择性恢复与阶段复位（问题 3）+ 版本收口

- **阶段**：`v1.1.4-stage-65`
- **依赖**：**hard: `v1.1.4-stage-62`**（`flow stage reset` 须基于 stage-62 确立的「phase 唯一事实源 + auto-repair 仅 phase→status」语义；否则复位后仍可能被旧 auto-repair 锁 `done`）
- **优先级**：P1（版本收官阶段）
- **制定人**：openfeel-planner ｜ **制定时间**：2026-10-03
- **定位**：把 `checkpoint restore` 从「全量快照覆盖」升级为「**按阶段选择性、可预览、可精准复位**」的一等恢复手段；并完成 **v1.1.4 版本收口**。
- **范围**：`src/core/flow-manager.ts`（`restoreCheckpoint`/selective/`resetStagePhase`）、`src/commands/flow.ts`（`checkpoint restore` 选项、新增 `flow stage reset`）、docs/skill、版本载体、测试。
- **边界**：默认（无 `--stage`）`restore` 保持**全量覆盖**（向后兼容）；`flow stage reset` 受合法 phase 值域 + `to=done` 的 REV 阻塞检查约束；不改既有 checkpoint 快照写入/清理；不新增依赖；不 `npm publish`/`git push`；不改 `flow.json`（由 Feel 推进）。

## KB 检索（`openfeel-check-kb`）

- 已加载 `openfeel-check-kb`。**高度相关条目**：
  - `kb/patterns.md #Checkpoint 快照自动保存 + 限制周期规则`（快照命名/`--force`/`.bak`/20 上限）→ selective restore 复用同目录同命名，**不改快照生产**。
  - `kb/patterns.md #--dry-run 全链路零写盘（所有写盘点）` → `restore --dry-run`/`stage reset --dry-run` 须 revision/字节零变更；auto-repair 不得抢先写盘。
  - `kb/patterns.md #版本号全链路收口清单模式（A/B/C/D/E）` → 版本 `1.1.4` 逐类核对。
  - `kb/patterns.md #纠正/清理侧命令面（对称原理）` → `flow stage reset` 是 `flow advance` 的对称复位能力。
  - `kb/troubleshooting.md #autoRepairInconsistency 导致测试阶段跳过` → 复位后走 stage-62 新 auto-repair，不再锁 `done`。
- **无「按阶段选择性恢复」条目** → 归档时补沉 patterns。

---

## 一、背景与实测证据（唯一事实基准）

| 事实 | 源码位置 | 结论 |
|------|----------|------|
| `restoreCheckpoint(filename)` 读整快照覆盖 flow.json，写前 `.bak` | `flow-manager.ts:599-640` | **全量**，无粒度 |
| `commands/flow.ts:1416-1435` restore 仅 `--force` | 无 `--stage`/`--dry-run` | 无差异预览 |
| 全仓无 `flow stage reset` | `rg` | 缺精准复位命令 |
| `flow checkpoint` 快照生产（`saveCheckpoint`，20 上限） | `flow-manager.ts:527-569` | **不改** |
| `flow advance --dry-run`/`health --fix --dry-run` 已有 | `flow.ts:753-767`、`:1444` | dry-run 口径可参照 |
| `advanceStagePhase` 的 REV 阻塞检查（`to=done`） | `flow-manager.ts:1248-1264` | `reset` 到 done 须复用 |

> 本会话 6 次锁 `phase` 均靠 `checkpoint restore <file> --force` 恢复，**全量回退**在多阶段并行时有跨阶段连带回退风险，且恢复前无 diff。

---

## 二、目标语义

| 维度 | 改前 | 改后 |
|------|------|------|
| `checkpoint restore` | 全量覆盖 | 无 `--stage` → 全量（不变）；`--stage <id>` → **仅回退该阶段子树** |
| 差异预览 | 无 | `--dry-run` 列出将变更的阶段/相位，**零写盘** |
| 精准复位 | 无 | `flow stage reset <id> --to <phase> [--dry-run]` |
| 恢复路径文档 | 隐含 | 正式化为「checkpoint restore / stage reset / flow health --fix」组合 |

**不变量**：快照生成/清理/命名不变；`restore` 安全校验（路径穿越拒绝、乐观并发 revision 校验、`.bak`）不变。

---

## 三、变更点清单（编号 T）

### T1 — `restoreCheckpoint` 支持 `--stage` 选择性回退（`flow-manager.ts:599-640`）

- 签名扩展为 `restoreCheckpoint(filename, options?: { stage?: string; dryRun?: boolean })`。
- `stage` 指定时：
  - 仅在快照的 `stages[stageId]` 子树存在时回退该键（不存在 → 报错）；
  - **只替换 `flow.json.stages[stageId]`**，其它阶段与 `pipeline` 其余字段不动；
  - 若 `pipeline.current.stage === stage`，按 stage-62 的 phase 投影同步 `pipeline.current`/`status`（协调）；否则不动；
  - revision 仍重定基为 `diskRevision + 1`，保留乐观并发校验与 `.bak`。
- 不指定 `stage` → 现行为（全量覆盖）**逐字节保持**。

### T2 — `--dry-run` 差异预览（`flow-manager.ts` + `commands/flow.ts:1416`）

- 计算差异清单：对比快照与磁盘，列出 `{ stage, fromPhase→toPhase, fromStatus→toStatus }`（全量模式列所有变更阶段；`--stage` 仅列该阶段）。
- `--dry-run` **零写盘**（不 `atomicWrite`、不改内存 revision、不写 `.bak`）；命令层输出 `schemaVersion` 风格的确定性文本。
- 复用 `kb #--dry-run 全链路零写盘` 口径。

### T3 — 新增 `flow stage reset <id> --to <phase> [--dry-run]`（`flow-manager.ts` + `commands/flow.ts`）

- 新增 `resetStagePhase(stageName, to, { dryRun })`：
  - 校验 `to` 为合法 `PipelinePhase`（复用 `PipelinePhaseSchema`）；
  - 允许**回退**（不受 `transitions` 正向限制）；`--dry-run` 仅报告；
  - `to === 'done'` 复用 REV 阻塞检查（`flow-manager.ts:1248-1264` 同语义）；
  - 写入 `phase` 后，按 stage-62 的 `mapPhaseToStageStatus` **同步 `status`**（phase 权威）；
  - 留审计日志（`action: 'reset_stage_phase'`）；**不**触发归档 commit（区别于 `advance`）。
- 命令注册：`flow stage reset <stageId>` 与 `--to`、`--dry-run`（`commands/flow.ts`）。

### T4 — 故障恢复路径文档化（问题 3「价值肯定」）

| # | 文件 | 改动 |
|:-:|------|------|
| T4.1 | `.openfeel/manual/cli/commands.md`、`.openfeel/manual/core/flow-manager.md` | 恢复路径：`flow health` 诊断 → `flow stage reset`（精准）→ `checkpoint restore --stage --dry-run`（回退）→ `flow health --fix`（对账）；明确「全量 restore 为最后手段」 |
| T4.2 | `templates-data/opencode/skills/openfeel-cli-usage/SKILL.md`（权威源） | 新增 `flow stage reset`、`checkpoint restore --stage/--dry-run` |
| T4.3 | `docs/commands.md` | 同步 |

### T5 — 版本收口 1.1.3 → 1.1.4（A/B/C/D/E）

> 见大计划 §五清单。要点：`package.json`、`package-lock.json`（root 2 处，禁 `npm install`）、`.openfeel/config.yaml:7`（单行增量）、`config.ts` zh/en 模板、`templates-data/agents-md/{zh-CN,en}.md`；`npm run build` 传播生成段；`CHANGELOG.md` 追加 `## [1.1.4]`；`docs/commands.md:3` 快照版本。

### T6 — 测试面

| # | 用例 | 断言 |
|:-:|------|------|
| T6.1 | 多阶段快照 + `restore --stage A` | 仅 A 回退；B/C 与 pipeline 其余字段逐字节不变 |
| T6.2 | `restore --dry-run` | 零写盘（flow.json revision/字节不变），差异清单正确 |
| T6.3 | `restore`（无 `--stage`） | 全量覆盖行为回归（与改前一致） |
| T6.4 | `flow stage reset <id> --to review_pending`（回退） | phase 回退成功、status 按投影同步 |
| T6.5 | `stage reset --to done` + blocking REV | 拒绝（exit 1） |
| T6.6 | `stage reset --dry-run` | 零写盘 |
| T6.7 | 复位后 `advance --to test_pending` | 不被 auto-repair 锁（与 stage-62 协同回归） |
| T6.8 | 路径穿越/非法快照名 | 仍拒绝（回归） |

### T7 — 门禁与阶段报告

- 全门禁实跑：`npm test`、`tsc`、`lint i18n`、`lint kb`、`npm run build`、`--version`。
- 复核 `roadmap/v1.1.4.md`、`plan/v1/v1.1.4/plan.md` 版本值一致；阶段报告。

---

## 四、op 划分与执行顺序（**3 op**）

| op | 主题 | 覆盖 | 关键产出 | 依赖 |
|:--:|------|------|----------|------|
| **op-001** | selective restore + dry-run | T1+T2+T6.1~T6.3 | `flow-manager.ts`/`commands/flow.ts`；测试 | hard: stage-62 |
| **op-002** | `flow stage reset` | T3+T6.4~T6.8 | `flow-manager.ts`/`commands/flow.ts`；测试 | hard: op-001 |
| **op-003** | 文档 + skill + 版本收口 + 门禁 + 报告 | T4+T5+T7 | manual/docs/skill；版本载体；build；全门禁；阶段报告 | hard: op-002 |

**顺序：op-001 → op-002 → op-003。**

**边界声明**：默认 `restore` 全量不变；不改快照生产/清理；`reset` 受值域 + REV 约束；不新增依赖；不 `npm publish`/`git push`；不改 `flow.json`。

---

## 五、验收标准（阶段级）

1. **选择性**：`restore --stage A` 仅回退 A 子树，其它阶段字节不变。
2. **预览**：`restore --dry-run` / `stage reset --dry-run` 零写盘且差异正确。
3. **兼容**：无 `--stage` 的 `restore` 与改前行为一致。
4. **复位**：`flow stage reset` 可回退/前进至合法 phase，`to=done` 受 REV 阻塞；status 按投影同步。
5. **协同**：复位后推进不被 auto-repair 锁 `done`（stage-62 协同）。
6. **文档**：恢复路径三件套（reset / restore --stage / health --fix）文档化；skill 与新命令面一致。
7. **版本**：`--version` == `package.json` == **1.1.4**；`CHANGELOG` 含 `[1.1.4]`；全链路 A 类载体同步。
8. **门禁**：`npm test` 全绿 `0 skipped / 0 failed`；`tsc` = 0；`lint i18n` 以实际为准（复用键则不增）；`lint kb` = 0；`npm run build` 成功、`.opencode/**` 不复活。

---

## 六、风险与回滚

| # | 风险 | 影响 | 缓解 / 回滚 |
|:-:|------|------|-------------|
| R-1 | selective restore 遗漏 `pipeline.current` 协调 → 悬空 | 中 | 仅当 current 指向该阶段时同步；T6.1 全字节比对；`--dry-run` 预览 |
| R-2 | `stage reset` 绕过正向转移产生非法状态 | 中 | 值域校验 + `to=done` REV 检查 + 审计日志 |
| R-3 | dry-run 因 auto-repair 抢先写盘 | 中 | 复用 patterns 口径：dry-run 分支在任何 `save()` 前 | 
| R-4 | 版本收口遗漏载体（package-lock/config.ts/agents-md） | 低 | 依 KB A/B/C/D/E 清单逐条；CI `--version` 门禁 |
| R-5 | `.openfeel/config.yaml` 非 UTF-8 展示被整文件重写损坏 | 中 | 仅单行 `edit`，禁 `write` |
| R-6 | 与 stage-62 对 `flow-manager.ts` 改动冲突 | 中 | hard 依赖保证串行；schemer 协调 |

**回滚**：`git revert <sha>`；无数据迁移；版本回退仅需改回版本载体。

---

## 七、边界（不做）

1. 不改 checkpoint 快照生成/命名/清理（20 上限）。
2. 不改 `restore` 的安全校验（路径穿越/乐观并发/`.bak`）。
3. 不新增依赖；不动 CI workflow；不 `npm publish`/`git push`；不改 `flow.json`。
4. 不把 `--dry-run` 设为默认；`reset` 不触发归档 commit。
5. 不创建除本阶段外的 op。

---

## 八、裁定项（本阶段需明确）

| # | 议题 | **建议** | 依据 |
|:-:|------|----------|------|
| **D4** | `stage reset` 是否允许回退 | **允许**（精准复位用途），受值域 + `to=done` REV 约束 | 问题 3 建议③ |
| **D-restore** | `--stage` 与全量的默认 | 无 `--stage` = 全量（向后兼容）；`--stage` = 选择性 | 既有调用不变 |
| **D-commit** | `reset` 是否归档 commit | **否**（仅 `advance` 至 done 触发） | reset 是修复而非里程碑推进 |

## 九、修订记录

| 时间 | 制定人 | 说明 |
|------|--------|------|
| 2026-10-03 | openfeel-planner | 初稿：T1~T7；3 op；验收 8 条；版本收口归 op-003；裁定 D4/D-restore/D-commit |