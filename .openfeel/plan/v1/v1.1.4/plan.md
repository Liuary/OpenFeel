# OpenFeel v1.1.4 — 第四轮工具链反馈修复（状态一致性三处收口）

> **版本**：v1.1.4（W 级递增，功能版） | **创建日期**：2026-10-03 | **Planner**：openfeel-planner
> **规模判定**：**大规模**（4 阶段、跨 `flow-manager` / `plan` / `config` / `commands` 多模块，含命令面新增）→ 必须走独立 openfeel-planner → openfeel-reviewer 完整流程。
> **定位**：修复第四轮整周期无人值守反馈的 **7 个问题**，核心是 `phase`/`status` 单一事实源、创建值继承、op 注册一致、checkpoint 精准恢复。**不引入新架构层**。
> **阶段计划**：`.openfeel/plan/v1/stage-62/plan.md` ~ `stage-65/plan.md`。

---

## 一、背景与需求来源

- **主文档**：`godot/Pantheogen/docs/10-openfeel-autonomy-feedback.md`（第四轮，2026-10-02~03，整周期 6 阶段无人值守）。
- **关联**：`docs/08` 问题 12（`flow advance --to test_pending` 锁 `phase=done`，本轮 **6/6 复发**）、`docs/09`（可编排/可观测）。
- **用户确认**：本版本为**用户确认的新版本 v1.1.4**，目标是把 7 个问题全部修复，其中**问题 4 须修复锁 `phase` 故障的根因**。

## 二、阶段概览

| 阶段 | 名称 | 覆盖问题 | 依赖 | op 数（预估） |
|------|------|----------|------|:--:|
| `v1.1.4-stage-62` | 状态/相位单一事实源收敛 | 4 / 5 / 7 | 无 | 3 |
| `v1.1.4-stage-63` | 配置默认值解析与阶段创建继承 | 1 / 6 | 无 | 3 |
| `v1.1.4-stage-64` | op 注册一致性 | 2 | 无 | 3 |
| `v1.1.4-stage-65` | checkpoint 选择性恢复与阶段复位 | 3（+版本收口） | hard: stage-62 | 3 |

**执行顺序：62 → 63 → 64 → 65**（流水线串行；仅 65 对 62 有 hard 依赖）。

## 三、源码核验结论（文档推断 vs 源码实际，以源码为准）

> 依据用户要求，逐项核验 `src/**`。**「不一致」处以源码为唯一事实基准**。

| # | 文档推断 | 源码实际（位置） | 判定 |
|:--:|----------|------------------|:--:|
| **1** | `plan stage add` 初值取「创建瞬间 effective 值」（status.md > config > profile） | `ensureStageSkeleton` **硬编码** `执行模式: manual` / `自动推进: disabled`，从不读 effective/config（`src/core/plan/stage.ts:138-145`）；`addStage` 仅调它 + 注册（`:184-200`）。**无 `--auto-advance/--exec-mode` 参数** | **不一致**：根因更简单（硬编码而非继承） |
| **2** | `plan scheme create` op id 按「文件」递增，与注册脱节；无补注册 | `createScheme` 用 `reserveSequence({dir: opsDir, parse: /^op-(\d+)/})`，序号仅据目录**文件**（`src/core/plan/scheme.ts:249-261` + `src/core/fs/sequence.ts:54-70`）；无 `plan scheme register` / `flow repair --register-ops`（`repair` 仅 `--prune-orphans`，只删 `keyOrphans`，`src/core/flow-manager.ts:2820`） | **一致** |
| **3** | `checkpoint restore` 全量覆盖、无按阶段/`--dry-run`；无 `flow stage reset` | `restoreCheckpoint(filename)` 读整快照覆盖 flow.json（`flow-manager.ts:599-640`）；`commands/flow.ts:1416-1435` 仅 `--force`；全仓无 `flow stage reset` | **一致** |
| **4** | `flow advance` 只改 `phase` 不改 `status`；auto-repair 单向锁 `done` | **`advanceStagePhase` 会用 `mapPhaseToStageStatus` 同步 `flow.json.status`**（`flow-manager.ts:1308-1314`）——文档描述**不准确**。但：`mapPhaseToStageStatus('review_passed', …, testEnabled=false)` 返回 **`'done'`**（`:3797-3798`）；`autoRepairInconsistency` 在 `status==='done' && phase!=='done'` 时**强制 `phase='done'`**（`:2907-2914`）；`stage set --status` **无值域校验**（`src/commands/stage.ts:376-377`） | **部分不一致，但锁 `done` 根因成立**（见下） |
| **5** | `test_enabled:false` 与实际走 `test` 分支矛盾 | `test_enabled` **仅**影响 `mapPhaseToStageStatus` 的 `review_passed` 投影（→`'done'`），**不影响** phase 图（`pipeline.yaml:33` `review_passed: [test_pending]` 恒定） | **一致**（语义=「status 投影捷径」，非「跳过测试分路」） |
| **6** | `config set` 需去 `defaults.` 前缀；skill 称支持 `defaults.*` | `commands/config.ts:225-230` 白名单 = `Object.keys(ConfigDefaultsSchema.shape)` = bare keys；`defaults.execution_mode` 被拒；skill 文案不实 | **一致**（文档错误在 skill） |
| **7** | `flow health` 按粗 status 比对生噪声；`--fix` 仅回写 status.md 且会传播损坏 | `checkCrossFileConsistency` 比对 `flow.json.status` vs status.md「状态」（`:3354-3394`）；`reconcileStatusMd` 以 `mapPhaseToStageStatus(phase,…)` 为权威**仅回写 status.md「状态」**（`:3126-3169`）→ flow.json 损坏时传播 | **一致** |

### 锁 `phase=done` 精确根因链（问题 4 + 5 同源，`docs/08` 问题 12 的确定机制）

1. Pantheogen `.openfeel/config.yaml` 有效值 `test_enabled: false`；
2. `flow advance --stage X --to review_passed` → `advanceStagePhase` 令 `phase=review_passed`，并因 `testEnabled=false` 把 **`flow.json.status` 置为 `'done'`**；
3. 下一步 `flow advance --stage X --to test_pending`：**命令入口先跑 `autoRepairInconsistency`**（`commands/flow.ts:637-651`，早于路径求解 `:688`），见 `status='done' && phase='review_passed'` → **强制 `phase='done'` 并 `save()`**；
4. 随后 `findPhasePath(done → test_pending)` = `no-path` → 报错退出 → 阶段**锁死在 `done`**。
5. → 每一步 `--to test_pending` 必现，**6/6 复发 = 100% 确定性**。

> 文档对「误用 `stage set --status review_pending` 触发」的归因**未获源码支持**（`stage set` 只写 status.md，不写 `flow.json.status`）；真正触发源是 `test_enabled=false` 的投影。修复须同时处理 **映射（问题 5）** 与 **auto-repair 方向（问题 4）**，否则单独改一处仍会污染 `status`。

## 四、范围

- **核心**：`src/core/flow-manager.ts`、`src/core/plan/stage.ts`、`src/core/plan/scheme.ts`、`src/core/config.ts`、`src/core/fs/sequence.ts`、`src/commands/{flow,stage,plan,config}.ts`。
- **测试**：`test/core/*`、`test/commands/*` 新增/修改。
- **文案**：`src/core/i18n-data/{zh-CN,en}.ts`（尽量复用既有键，保 730 不增）。
- **模板/skill**：`src/core/templates-data/opencode/skills/openfeel-cli-usage/SKILL.md`（权威源）+ `npm run build` 传播。
- **文档**：`.openfeel/manual/**`、`docs/commands.md`、`README*`、`CHANGELOG.md`。
- **版本**：`.openfeel/plan/v1/v1.1.4/plan.md`、`.openfeel/roadmap/v1.1.4.md`、`plan/index.md`、`plan_log.md`。

## 五、版本收口清单（1.1.3 → 1.1.4，A/B/C/D/E，归 stage-65 op-final）

> 依据 `kb/patterns.md #版本号全链路收口清单模式`；以内容特征判定，不以行号为准。

- **A 手工载体**：`package.json:3`、`package-lock.json:3`/`:9`（root 两处，禁 `npm install` 重生成）、`.openfeel/config.yaml:7`（单行增量，禁整文件重写）、`src/core/config.ts`（zh/en `CONFIG_TEMPLATE_*` 各一处）、`src/core/templates-data/agents-md/{zh-CN,en}.md`（「当前 v1.1.x」行）。
- **B 生成段**：`src/core/template-loader.ts`（由 build 从 A 类权威源重生成，**禁手改**）。
- **C 传播**：`CHANGELOG.md` 追加 `## [1.1.4]`。
- **D 禁改**：`src/**` 历史批注（`v1.1.x-stage-*` 示例）、依赖自身版本、`manual` 变更历史、`test/**` 注释。
- **E 无载体**：`README*` / `docs/**`（`docs/commands.md:3` 快照标注同步为 `v1.1.4`）。
- **CLI `VERSION` 常量不存在**：`--version` 直读 `package.json`；`release-metadata.test.ts` 已断言无 `VERSION` 导出。

## 六、边界（不做）

1. 不新增第三方依赖；不改 `bin/openfeel.js` 安装链路；不改 `--json` 契约（新增命令的 `--json` 须与既有 `schemaVersion` 风格一致）。
2. 不破坏既有命令行为：`flow advance` 合法路径/REV 检查、`plan scheme remove/publish/rename`、`--dry-run` 零写盘语义、`flow phases` 自描述 5 键**保持不变**。
3. 不 `npm publish`、不 `git push`；不直写 `flow.json`（阶段注册/推进由 Feel 经 CLI 完成）。
4. 不主动删除 `flow.json` 既有数据；`test_enabled` 移除须**向后兼容**（存量 config 行不报错、不崩溃）。
5. 不改 CI workflow；不改 `.opencode/**`（构建产物）。

## 七、全局验收标准（版本级）

1. **门禁**：`npm test` 全绿（基线 **61 文件 / 1016 用例 / 0 skipped** → 因新增用例而增加，`0 failed`）；`npx tsc --noEmit` = **0**；`node bin/openfeel.js lint i18n` = **730 键**（不增不减，复用既有键）；`node bin/openfeel.js lint kb` = **0 过期**。
2. **锁 `phase` 消失（决定性）**：构造 `test_enabled=false` 场景，`advance --to review_passed` 后 `flow.json.status` **不得为 `done`**；随后 `advance --to test_pending` **不被锁**、正常进入 `test_pending`。
3. **auto-repair 方向**：预置 `phase=review_passed, status=done`（旧损坏）→ `autoRepairInconsistency` 将 `status` 修正为 `review_passed`（**不得**把 `phase` 前推为 `done`）。
4. **创建继承**：`config.yaml.defaults.auto_advance: enabled` 下 `plan stage add` 生成的 status.md = `自动推进: enabled`（非 `disabled`）。
5. **config 键等价**：`config set defaults.execution_mode auto` 与 `config set execution_mode auto` 等价成功；非法值/非法键仍报错不写盘。
6. **op 补注册**：预置 `op-001~004.md` 未注册 → `plan scheme register <stage>` 后 `flow.json` 注册 001~004；`create` 对未注册文件告警。
7. **checkpoint 精准**：多阶段快照下 `checkpoint restore <file> --stage A --force` 仅回退 A，其它阶段不动；`--dry-run` 零写盘并列出差异；`flow stage reset <id> --to <phase>` 生效且受 REV/done 约束。
8. **版本**：`node bin/openfeel.js --version` == `package.json.version` == **1.1.4**；`CHANGELOG` 含 `[1.1.4]`。
9. **构建**：`npm run build` 成功；`git status` 不复活已删除的 `.opencode/{agents,skills,ADAPTER.md}`。

## 八、风险总览

| # | 风险 | 影响 | 缓解 |
|:-:|------|------|------|
| R-1 | `status` 语义变更触及所有 `/^status/` 比对与既有 1016 用例 | 高 | 单一 owner（`mapPhaseToStageStatus`）+ 先加回归用例锁定新语义；逐项核对既有断言 |
| R-2 | 移除 `test_enabled` 破坏存量 config/测试 | 中 | 向后兼容：未知/残留键不报错；`rg` 全仓引用清单；保留可解析为 no-op |
| R-3 | op 序号「空位回填」与并发占号冲突 | 中 | 在既有 `scheme-{stageDir}` 锁内完成；`reserveSequence` O_EXCL 兜底 |
| R-4 | selective restore 与 `pipeline.current` 协调出错 | 中 | 仅回退 `stages[id]` 子树；`current` 若指向被回退阶段则同步；`--dry-run` 预览 |
| R-5 | `flow stage reset` 绕过正向转移造成非法状态 | 中 | 受合法 phase 值域 + REV 阻塞检查约束；留审计日志 |
| R-6 | 命令面新增导致 skill/docs 滞后 | 低 | `openfeel-cli-usage` 权威源同步 + build 传播 + `lint kb` 校验引用 |

**回滚**：按阶段 `git revert <sha>`；无数据迁移、无依赖树变动、无全局写操作。

## 九、裁定项（需用户/schemer 明确）

| # | 议题 | **建议结论** | 备选 | 归属 |
|:-:|------|--------------|------|:--:|
| **D1** | `test_enabled` 处置 | **移除**（15 相位模型下 phase 图与它无关，仅在 status 投影制造终态假象；移除即消除误导线） | 保留为 deprecated no-op（向后兼容更强，但字段仍误导） | stage-62 |
| **D2** | 存在未注册 op 文件时 `create` 行为 | **告警继续**（非破坏性；提示 `plan scheme register`） | 拒绝创建直至注册（更强一致性，但破坏既有工作流） | stage-64 |
| **D3** | `flow advance` 是否顺带回写 `status.md`「状态」 | **暂不**：保持 `--fix` 批量对账为唯一回写入口，避免 `advance` 耦合 status.md；仅增强文档与 `--fix` 权威口径 | `advance --to done` 自动回写 status.md（消除常见噪声，但扩大写面） | stage-62 |
| **D4** | `flow stage reset` 是否允许越过正向转移回退 | **允许回退**（这正是「精准复位」的用途），但受合法 phase 值域 + `to=done` 的 REV 阻塞检查约束 | 仅允许沿合法路径前进（则退回 `advance`，失去复位价值） | stage-65 |

## 十、修订记录

| 时间 | 制定人 | 说明 |
|------|--------|------|
| 2026-10-03 | openfeel-planner | 初稿：4 阶段（62~65）；源码核验表（3 项「不一致」已标注）；锁 `phase` 精确根因链；版本收口清单；全局验收 9 条；裁定 D1~D4 |
| 2026-10-03 | openfeel-archiver | **stage-62 归档复核**：实施与 §二/§三 描述一致（问题 4/5/7 根因链经实施证实；D1=移除、D3=暂不回写均落地）；**M18（状态/相位单一事实源）达成**；门禁 `npm test` 61 文件 / 1023 用例 0 skipped、`tsc` 0、`lint i18n` 730、`lint kb` 0；审查 passed（REV-001 medium / REV-002·003 low 非阻塞 open）；知识沉淀 4 条。stage-63~65 待推进（stage-65 hard 依赖 stage-62 已就绪）。未推进 flow 至 done（由 Feel 执行） |