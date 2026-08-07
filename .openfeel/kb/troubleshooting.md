# 常见问题

> 使用 [+] / [-] 标记管理启用/禁用状态。只能标记禁用不能删除。

## [+] fuzzyCorrectPhase 正则尾部下划线问题 (2026-06-27)

**现象：** 输入 `"plan_pending "`（末尾有空格）时，`replace(/[\s_-]+/g, '_')` 生成 `"plan_pending_"`（尾部下划线），导致枚举匹配失败。

**根因：** 正则替换将末尾空格转为下划线，但 Trim 在替换之后执行，尾部下划线残留。

**修复：** 在正则替换后增加 `.replace(/^_+|_+$/g, '')` 去除首尾下划线。

**见于：** REV-001, Bug #3

## [+] 僵尸检测 filter 失效 (2026-06-27)

**现象：** `checkZombieStates` 中 Bug 检测过滤 `bugFiles.filter(f => f.startsWith(stageId))` 几乎必然返回空数组，僵尸 Bug 检测从不触发。

**根因：** Bug 文件按**模块目录**组织（`{module}/BUG-001_xxx.md`），文件名不以 `stageId` 开头。过滤条件与目录结构不匹配。

**修复：** 代码块替换为注释，说明延迟到 flow.json 增加 bugs 数据结构后完善。

**见于：** REV-003, Bug #18

## [+] repair dry-run 误报"已修复" (2026-06-27)

**现象：**
1. 文件不存在时 dry-run 返回 `fixed: true`（实际未修复）
2. flow.json 正常时返回 `fixed: false` 却被 `exit(1)` 当错误处理

**根因：** 双重缺陷——dry-run 返回值逻辑与命令层对 false 的处理同时出错。

**修复：** 文件不存在时 dry-run 返回 `fixed: false`；命令层对 `fixed: false` 不 `exit(1)`，而是输出"未检测到需要修复的问题"。

**见于：** REV-004, Bug #???

## [+] Schemer 产出路径指向不存在的目录 (2026-06-27)

**现象：** `schemer.md` 产的出路径为 `.openfeel/stages/{stage}/ops/`，但实际计划体系使用 `.openfeel/plan/{stage}/`。

**根因：** 新建 Agent 文件时硬编码了不存在的路径，未与现有 plan 体系对齐。

**修复：** 统一为 `.openfeel/plan/{stage}/ops/op-NNN_{title}.md`

**见于：** REV-008

## [+] architect 审查模板未同步更新 (2026-06-27)

**现象：** `reviewer.md` 新增了 `Tester 标记：→Tester 重点关注` 字段，但 `architect.md` 的审查模板未同步更新。

**影响：** Architect 执行审查时无法通过此字段传递功能边界风险给 Tester，Reviewer↔Tester 闭环在 Architect 审查场景下断裂。

**修复：** `architect.md` 审查模板同步增加 Tester 标记字段。

**见于：** REV-013

## [+] 手动 edit status.md 频繁失败 — 格式匹配脆弱 (2026-07-02)

**现象**：Feel 调度完成后通过 `edit` 工具更新 `status.md` 的 checkbox 或状态字段时，频繁报错 "oldString not found"，即使肉眼看起来匹配。

**根因**：`edit` 工具对字符串匹配要求极其严格（空格/换行/编码/不可见字符），手动构造的 `oldString` 与文件实际内容常有细微差异。

**修复方向**：保留 status.md 作为人类可读快照，但读写操作改为通过 CLI 命令（`openfeel stage`）完成原子操作。与 flow.json 管理模式一致——Agent 不直接修改数据文件，通过 CLI 间接管理。

**见于**：v4-stage-01/02/03 阶段状态更新流程中反复出现。

## [+] Agent prompt 中 CLI 命令引用应预先验证存在性 (2026-07-05)

**现象**：Executor prompt 中写入了 `openfeel flow validate` 命令引用，但实际 CLI 中不存在 `validate` 子命令。Executor 按 prompt 执行时立即遇到"命令不存在"错误。

**根因**：方案制定阶段（Schemer）在编写 Agent prompt 修改时，引用了"理应存在"但实际未实现的 CLI 命令。prompt 中的 shell 命令没有经过存在性验证。

**影响**：REV-002（v4-stage-02）为 high 阻塞级，Executor 前置校验步骤 3a 完全不可用。

**修复原则**：
1. Schemer 在方案中引用 CLI 命令前，应执行 `openfeel flow --help` 确认命令存在
2. 若命令不存在，选择方案 B（用现有命令替代并注明限制）而非假设命令"稍后实现"
3. Reviewer 审查时应实测 prompt 中引用的 CLI 命令

**见于**：REV-002 (v4-stage-02)

> **更新于 2026-07-05**：REV-002 已通过替换为 `openfeel flow health --quick`（现有命令）+ 限制说明的方式修复。

## [+] fast-glob 目录匹配需显式声明 onlyDirectories (2026-07-09)

**现象**：使用 `fg.sync(['plan/*/'])` 匹配子目录时返回空数组，即使目标目录确实存在。实际有 8 个子目录，但输出 0。

**根因**：fast-glob 默认 `onlyDirectories: false`，仅返回文件条目。尾部斜杠 `plan/*/` 不会自动激活目录匹配模式，需**显式声明** `onlyDirectories: true`。

**修复**：
```typescript
// 错误：返回空数组
fg.sync(['plan/*/'], { cwd: openfeelDir })

// 正确：返回目录列表
fg.sync(['plan/*'], { cwd: openfeelDir, onlyDirectories: true })
```
同时移除尾部斜杠（`onlyDirectories: true` 时斜杠不是必需的匹配条件）。

**经验**：使用 fast-glob 匹配目录时，应始终检查是否需要 `onlyDirectories` 选项。若同时匹配文件和目录，使用 `{ onlyDirectories: false }` 或省略该选项，但模式中不要依赖尾部斜杠的隐式行为。

**见于**：REV-002 (v4.2-stage-01)

## [+] autoRepairInconsistency 干扰组合条件推进路径 (2026-08-07)

**现象**：使用组合终止条件（`test_passed|review_passed → archiving`）时，阶段在 `test_passed` 状态下被 `autoRepairInconsistency` 自动修复为 `done`，跳过了 `archiving` 阶段。

**根因**：`autoRepairInconsistency`（flow-manager.ts L2135）的修复逻辑之一为：`status=done 但 phase≠done → 同步 phase 为 done`。当阶段 status 已为 `done`（如因测试通过标记）而 phase 为 `test_passed` 时，该逻辑将 phase 强制同步为 `done`。这截断了组合条件中 `test_passed→archiving` 的合法路径——`archiving` 被跳过，归档流程无法执行。

**触发条件**：
1. 阶段的 `status` 字段已为 `done`（常见于快速通过场景：测试通过后 status 直接被标记为 done）
2. `phase` 字段为组合条件中的中间值（如 `test_passed`）
3. `autoRepairInconsistency` 被调用（如 `openfeel flow health`、`openfeel flow repair` 等触发一致性检查）

**影响范围**：非本次 v5.3 引入的 Bug——`autoRepairInconsistency` 设计时未考虑组合终止条件场景，属已知遗留项。不影响含 `|` 组合条件以外的常规单条件 transitions。

**临时规避**：在归档完成前避免调用 `autoRepairInconsistency`（即避免 `flow health` / `flow repair` 对 v5.3-stage-01 的检查），或手动恢复 phase 后推进。

**建议修复方向**：`autoRepairInconsistency` 在同步 phase 前检查当前 phase 是否在 transitions 中存在合法出边（通过 `getValidTargets`），若存在则不强制同步——仅对无合法出边的"真卡住"状态执行修复。

**见于**：v5.3-stage-01 归档阶段（Executor 发现，已记录为遗留项供后续修复）

> **更新于 2026-08-07**：**v5.8 已修复根因**——问题核心在 `mapPhaseToStageStatus`（flow-manager.ts:2758）：原实现将 `test_passed` 和 `archiving` 都映射为 `done` status，导致 `autoRepairInconsistency` 检测到 `status=done, phase≠done` 时强制同步 phase 为 done。修复方案：仅 `done` phase 映射为 `done` status；`test_passed` → `testing`，`archiving` → `archiving`。注意 `mapPhaseToStageStatus` 的返回值直接影响 `autoRepairInconsistency` 的触发条件，二者构成耦合——修改映射表时必须考虑兼容性。

## [+] 流水线文件引用断裂的连锁修复 (2026-07-05)

**现象**：v4-stage-02 审查中发现三处引用断裂形成连锁故障：
1. `flow.json` 路径写为根目录 → 实际在 `.openfeel/flow.json`
2. CLI `flow validate` 命令不存在 → 步骤 3a 不可用
3. `pipeline.yaml` 路径错误且文件缺失 → 手动兜底步骤 3b 不可用

三处分属不同层级（文件路径 + CLI 命令 + 配置文件），但共同导致 Executor 前置校验的「步骤 3」完全不可用。

**修复策略**：统一采用"降至现有能力 + 注明限制"原则：
- 路径修正为实际路径 `.openfeel/flow.json`
- 命令替换为现有 `flow health --quick`（注明校验范围差异）
- 不创建新文件，改为引用 FlowManager 内置 transitions 表

**教训**：Agent prompt 中的三层引用（路径/命令/配置文件）应视为一个整体校验单元，在方案阶段逐项验证存在性。

**见于**：REV-001/002/003 (v4-stage-02)
