# OpenFeel v1.1.7 — 快速迭代模式（fast workflow mode）

> **版本**：v1.1.7（Z 级递增，功能版） | **创建日期**：2026-10-11 | **Planner**：openfeel-planner
> **规模判定**：**大规模**（4 阶段，跨 `src/core/{config,pipeline-schema,flow-manager}.ts` / `src/core/plan/stage.ts` / `src/commands/{config,flow,plan,stage}.ts` / `src/core/templates-data/**`（agents ×2 harness ×2 语言 + 中立共享 skills）/ `i18n-data` / `docs` / `manual` / 版本载体，含**流水线 phase 转移表架构级增量**与 **Agent 职责边界（调度链）调整**）→ 走独立 openfeel-planner → openfeel-reviewer 完整流程。
> **定位**：在现有完整流水线（full）之外，新增**快速迭代（fast）模式**——减负以加快迭代、降低 token 消耗，但**仍以 CLI 为核心**（状态机 / 骨架 / 审计链完整保留）。减负**只减 Agent 接力环节**，不裁剪任何落盘结构。
> **阶段计划**：`.openfeel/plan/v1/stage-74/plan.md` … `stage-77/plan.md`（共 4 份）。
> **路线图**：`.openfeel/roadmap/v1.1.7.md`。
> **依赖声明**：`.openfeel/plan/v1/v1.1.7/deps.yaml`（阶段级 hard 依赖 + op 级由 openfeel-schemer 细化）。
> **系列**：`v1`；`stageDir` 映射 `stage-74` ~ `stage-77`；阶段 ID 自 `v1.1.7-stage-74` 起（承接 v1.1.6 的 stage-73）。
> **当前基线**（实测，HEAD `6a2b04f`；统计类均标「登记值 / 复现命令」[REV-74-006 修订]）：CLI `1.1.6`；flow 注册阶段 **74** 个（**制定时点**，末位 `v1.1.6-stage-72`，全 done；复现：`node -e "console.log(Object.keys(require('./.openfeel/flow.json').stages).length)"`——修订复核时点 = **78**，含本版本已注册的 74~77）；`lint i18n` = **774**；`lint kb` = 0 过期（396 引用）；测试 **67 文件**（复现：`find test -name '*.test.ts'` 计数 67）/ **1206 用例**（**登记值**：stage-72 门禁；复现命令 `npm test`）；`config.yaml` 本项目 `defaults`：`execution_mode: auto`、`auto_advance: enabled`（另遗留 `test_enabled: true`，代码侧已移除、passthrough 容错）。

---

## 一、背景与需求来源

- **需求主题（用户已确认，范围冻结）**：OpenFeel 现仅有一条完整流水线（15 phase：`plan_pending → … → done`），每阶段须经 planner → **reviewer** → **schemer** → executor → reviewer → **tester** → archiver 多轮接力，成本高、迭代慢。本期新增 **fast 模式**：跳过 `plan_review / scheme_* / test_*`（**7 个 phase**），保留 **reviewer 单轮 + 失败回环**（质量底线，**不可跳**），并以「**骨架全量铺 + 标记驱动**」实现「减 Agent 接力、不减结构」。
- **用户裁定 A（双模式）**：`workflow_mode: full | fast`，**默认 fast**；作用域**阶段级**；记忆**项目级**（用户为项目选过一次后，后续新阶段默认沿用「最后一次选择」）。
- **用户裁定 B（快线 phase 链）**：**[需求变更 2026-10-11 修订]** fast 链 = `plan_pending → plan_review → plan_passed → exec_running → review_pending → [review_failed ↺] → review_passed → archiving → done`——**计划审查不跳过**（reviewer 单轮必过，与代码审查同级；原口径 `plan_pending → plan_passed` 直连**作废**）。据此 fast 跳过 **6 项**（`scheme_pending` / `scheme_review` / `scheme_passed` / `test_pending` / `test_failed` / `test_passed`）、保留 **9 个节点**、**8 条流转键 + `done` = 9 条目**（其余 6 个 phase 在 fast 下不可达）。保守减负：fast 跳过 schemer、tester 的调度；reviewer 单轮；archiver 轻量；planner 轻量。
- **用户裁定 C（骨架全量铺 + 标记驱动）**：`plan.md` / `ops/op-NNN.md` / `deps.yaml` / `status.md` **一律按全量铺**（CLI 机械操作，不耗 Agent）；**标记双读者**：① CLI / flow-manager 读标记选 phase 转移表；② Agent（Feel 调度 + 各 subagent）读标记自知是否被调度 / 是否轻量化产出。**允许单阶段切回 full**（覆盖 status.md 生效值）。
- **用户裁定 D（三层标记载体）**：`config.yaml defaults.workflow_mode`（项目默认 / 最后选择记忆）→ `status.md「工作流模式」`（阶段级生效值 / cascade 出口）→ `flow.json stages.{id}.workflow_mode`（可选冗余）。优先级 `status.md > config.yaml defaults > profile.yaml > 默认 fast`。
- **用户裁定 E（部署级默认自动推进变更，本轮新增需求）**：**部署后（新项目 / 新部署）默认 `auto_advance: enabled`，与 `workflow_mode` 无关（full 与 fast 均默认开启）** → 修改框架 `DEFAULT_CONFIG.auto_advance`：`disabled` → `enabled`。
- **用户裁定 F（命令面）**：`openfeel config set defaults.workflow_mode fast|full`（复用现有）；`openfeel config effective`（已存在，四键化后自动获益）；`openfeel plan stage add --workflow-mode <v>`（仿 `--exec-mode`）；`openfeel flow mode [--stage <id>]`（**新增·只读**：当前模式 + 来源）。
- **知识库检索（`openfeel-check-kb`）结果**：已加载。**高度相关条目**：
  - `kb/patterns.md #配置级联解析模式：单一 resolver + 四级优先级 + effective 展示出口` → `workflow_mode` **必须**接入 `buildCascadeConfig`/`resolveEffectiveConfig` 单一 resolver，`config effective` 与 `flow status --verbose` 两个出口自动同源；**禁止**另写第二套解析。
  - `kb/patterns.md #新建阶段骨架初值取 config 默认：resolveConfigDefaults 只读 defaults、不读 status.md` → `plan stage add --workflow-mode` 仿 `--exec-mode`：值域 schema 派生 + 非法值 exit 1 **且不建阶段**；隐式注册路径同样继承 config 默认。
  - `kb/patterns.md #CLI 自描述命令模式：phase 枚举与转移表复用运行时单一数据源` → `flow mode` 命令**禁止**硬编码转移表/模式值；经 `FlowManager` 只读访问器取，展示与校验**同源**，返回副本，`--json` 输出稳定结构。
  - `kb/troubleshooting.md #flow phases 自描述 phase 与 flow advance 接受集合不一致（第二信源残留）` → **双表是新增第二信源高危面**：fast 表的展示 / 校验 / 推进必须共用同一「表选择」函数；`flow phases --json` 须显式标注各模式表与其差异（存在视图 vs 推进白名单语义区分保留）。
  - `kb/patterns.md #defaults.X ≡ X 键归一 + 归一再校验` → `workflow_mode` 加入 `ConfigDefaultsSchema` 后，`config set defaults.workflow_mode` 与 bare 键**自动等价**，无需改命令层。
  - `kb/troubleshooting.md #配置键白名单须 schema 驱动 + 值类型归一` → 新键必须走 `ConfigDefaultsSchema` 白名单 + `getConfigFieldLegalValues` 派生值域（`full`/`fast`），非法值不写盘。
  - `kb/troubleshooting.md #writeDefaultConfig 无条件覆盖：npm test 静默改写真实 config.yaml` → 默认值翻转后，测试**必须**在隔离 HOME / fixture 中构造，**严禁**改写本仓真实 `config.yaml`。
  - `kb/patterns.md #CLI 国际化封装模式` → 新命令文案须双表成对 + `lint i18n` 新基线显式登记。
  - `kb/architecture.md #状态/相位单一事实源：status 为 phase 的粗粒度投影，phase 为唯一事实源` → `workflow_mode` 同理收敛单一事实源：**status.md 为阶段级生效值**，flow.json 冗余字段**不参与级联**。
  - `kb/patterns.md #平台无关化「描述泛化」原则` + `#多 harness 版本载体清单扩展` → Agent 模板改动须 **2 harness × 2 语言对称**（`opencode`/`claude` × `zh-CN`/`en`），关键串零回归断言。
  - **无**「双模式流水线 / fast 模式」条目 → 归档时补沉 architecture（双模式转移表选择）与 patterns（模式标记三层载体与记忆语义）。

## 二、源码核验结论（以源码为准，行号以 HEAD `6a2b04f` 为准）

> **行号约定**（[REV-74-006 修订]）：行号 = **定义/枚举项所在行**（修订轮已按源码逐条复核；初稿存在 1~7 行系统性偏移，本表已修正）。

| # | 事实 | 源码位置 | 结论 |
|:-:|------|----------|------|
| 1 | `PIPELINE_PHASES` 硬编码 15 项；`PipelinePhaseSchema` 为运行时校验 | `core/pipeline-schema.ts:14-20`（枚举项 **15-19**）[REV-74-006 修订] | **fast 链全部使用既有 phase → 枚举零新增**；`advanceAccepted` 白名单**语义不变**（fast 信息以新增字段承载）[REV-74-003] |
| 2 | 内置默认表 `getDefaultPipelineConfig()`（**无 mode 参数**，含组合键 `review_passed\|test_passed`） | `core/flow-manager.ts:3947`（`transitions` 体 3956-3974、组合键 3971）[REV-74-006 修订] | 增 mode 维度返回**双表**（**内置** full = 现状逐字；fast = 快线 **8 键 + `done`（9 条目）**；无参 = full）[需求变更 2026-10-11 修订]；**内置表 ≠ 本仓运行时表**（见 #20）[REV-74-004] |
| 3 | `loadPipelineConfig()`：`pipeline.yaml` 存在即**整体覆盖**，解析失败回退内置 | `core/flow-manager.ts:3927-3941`[REV-74-006 修订] | 语义保持（= **full 表覆盖**）；新增可选顶层键 `fast_transitions` |
| 4 | 转移表**唯一取表点** = `getValidTargets(fromPhase, mode)`（**mode 拟改必传**）；调用点 = `hasTransition`（1896→1902）/ `getAvailablePhases`（1910→1919）/ `findPhasePath`（1930→1956）/ `canAdvance`（2618→2642；**src 内无生产调用方，仅测试**）；**间接消费者** = `buildDownstreamPhases()`（2284，经 `getAvailablePhases()` 无参 → `current.stage`；`flow status --verbose` 触发）；**`advancePhase`（1791）已弃用且不读转移表**——旧「全部经它」表述作废 | `core/flow-manager.ts:1878 / 1896 / 1910 / 1930 / 2618`[REV-74-002 修订] | 表选择下沉到**单一函数**（stage → mode → 表）；**任何调用点不得使用默认 mode，必须显式传入由 stage 派生的 mode**；改一处即全链一致 |
| 5 | `getPipelineTransitions()` / `getDefaultTransitions()` 供 `flow phases` 自描述与差异报告 | `core/flow-manager.ts:1999 / 2009` | 增按 mode 取表（**无参 = full**，零回归既有测试）+ 同模式差异输出（`transitionsDiff` = 运行时 vs 内置**同 mode** 对比）[REV-74-003/004 修订] |
| 6 | `ConfigDefaultsSchema` 三键 + `.passthrough()` + 逐键 `.default()` | `core/config.ts:25-30`[REV-74-006 修订] | 新增 `workflow_mode: z.enum(['full','fast']).optional().default('fast')` |
| 7 | `DEFAULT_CONFIG`：`execution_mode:'manual'` / **`auto_advance:'disabled'`** / `merge_mode:'manual'` | `core/config.ts:164-168`[REV-74-006 修订] | **翻转 `auto_advance` → `'enabled'`**（裁定 E）+ 新增 `workflow_mode:'fast'` |
| 8 | `STAGE_FIELD_BY_CONFIG_KEY` = `{auto_advance:'自动推进', execution_mode:'执行模式'}` | `core/config.ts:69-72` | 追加 `workflow_mode: '工作流模式'` |
| 9 | `resolveConfigDefaults()` 只读 `defaults` 三键、逐键回退 `DEFAULT_CONFIG`、**不做级联** | `core/config.ts:193`（定义）[REV-74-006 修订] | 扩为**四键**（骨架初值来源） |
| 10 | `CONFIG_TEMPLATE_{ZH,EN}` 以 `DEFAULT_CONFIG.*` **插值**生成（含逐键注释） | `core/config.ts:417 / 470`（defaults 节插值 ZH 434-442 / EN 487-495）[REV-74-006 修订] | 模板增 `workflow_mode` 行 + `auto_advance` 注释与默认值同步 |
| 11 | `setConfigValue()` 用 `yaml.Document.setIn` **增量写**（保注释，不整文件重写） | `core/config.ts:561` | `workflow_mode` 复用零改动（`defaults.X ≡ X` 归一已就绪） |
| 12 | 级联 `buildCascadeConfig()` **无 stage 形参**：status.md 分支**硬编码** `this.data.pipeline.current.stage`（2170-2172）；profile 层**仅取 `preferences.auto_advance` 单值**；status.md 两条正则 2177-2178；`findStatusPath(stageId)` 2222-2224 | `core/flow-manager.ts:2116 / 2170-2189 / 2222-2224`[REV-74-001 修订] | 增 `工作流模式` 正则 + **带 stage 形参的解析路径**（读 `findStatusPath(stageId)` 指向的该阶段 status.md + config.yaml defaults + profile + builtin，同优先级；**不得**以无参形式复用当前阶段分支）；profile 层**不扩展**；声明 `config effective`（当前阶段域）与 `flow mode --stage`（任意阶段域）边界 |
| 13 | `EFFECTIVE_CONFIG_KEYS = ['execution_mode','auto_advance','merge_mode']`；`resolveEffectiveConfig()` 逐键四源判定 | `core/flow-manager.ts:172 / 2203-2219`[REV-74-006 修订] | 扩为**四键**（`config effective` 与 `flow status --verbose` 自动获益，零额外出口；**均为当前阶段域**） |
| 14 | `stage set <stageId> --status/--exec-mode/--auto-advance/--review-agent`：字段白名单 + `probeStatusField`（**`not-found` → exit 1 不写盘**） | `src/commands/stage.ts:357`（`set` 子命令；`probeStatusField` 定义于 242）[REV-74-006 修订] | 新增 `--workflow-mode`；**存量阶段字段缺失需「插入」语义**（否则自举阶段无法补字段） |
| 15 | `plan stage add`：`--exec-mode/--auto-advance` 值域经 `getConfigFieldLegalValues` 派生，非法 → exit 1 **且不建阶段** | `src/commands/plan.ts:26`（校验 47/55；overrides 92-97）[REV-74-006 修订] | 仿制 `--workflow-mode` + `StageSkeletonOverrides` 扩键 |
| 16 | `ensureStageSkeleton()`：status.md 骨架初值 = `overrides ?? resolveConfigDefaults`；幂等（已存在不覆盖） | `src/core/plan/stage.ts:103-188`（status.md 骨架段 143-185）[REV-74-006 修订] | 骨架增「**工作流模式**」行（置于「自动推进」之后） |
| 17 | wizard：非 TTY 守卫 + 无阶段时交互创建 + 多阶段选择 | `src/commands/flow.ts:1674`（wizard 命令；`getAvailablePhases(currentStage)` 调用于 1784）[REV-74-006 修订] | **模式首次选型**接入点（TTY 询问；非 TTY 落默认，不阻塞） |
| 18 | `flow phases [--json]`：`getPipelinePhases()` + `getPipelineTransitions()` + `transitionsDiff` + `advanceAccepted` | `src/commands/flow.ts:384-434`[REV-74-006 修订] | 模式解析契约（stage-74 登记 / stage-75 实施）：`--mode` 显式 → `--stage` → `current.stage` → 四源兜底 builtin `fast`；**`--json` 只增字段**（`workflowMode`），既有键语义逐字保留；`transitionsDiff` 同模式对比；登记兼容性测试 [REV-74-003/004 修订] |
| 19 | `syncConfigFieldToStages()`（`config set --sync-stages`）：字段缺失 → `skipped-no-field`；只读 flow.json 不写 | `core/flow-manager.ts:3455`（定义）[REV-74-006 修订] | `workflow_mode` 纳入；**缺失字段插入**扩展（与 #14 同口径） |
| 20 | 本仓 `.openfeel/pipeline.yaml` **存在**（自定 transitions，缺组合键 `review_passed\|test_passed`；`phase_corrections.completed/finished/archived`） | 实测（复现：`node bin/openfeel.js flow phases` → `transitionsDiff.missing`） | full 表继续由它覆盖（= **本仓运行时 full 表**，**≠ 内置表**，两条验收线）[REV-74-004]；本期**不增** `fast_transitions`（fast 用内置表，避免双维护） |
| 21 | 本仓 `.openfeel/config.yaml`：`auto_advance: enabled` / `execution_mode: auto` / **未设** `workflow_mode` / 遗留 `test_enabled: true` | 实测（复现：读 `.openfeel/config.yaml`） | 默认翻转对本仓**零影响**；`workflow_mode` 由 D-BOOT 显式补 `full`；`test_enabled` **代码侧已移除、存量文件可能遗留**（passthrough 容错）[REV-74-006] |
| 22 | 模板面 = `templates-data/opencode/agents/{zh-CN,en}/*.md`（9×2）+ `templates-data/claude/agents/{zh-CN,en}/*.md`（9×2）+ 中立共享 `templates-data/skills/**`（17）+ `templates-data/agents-md/{zh-CN,en}.md` + `templates-data/claude/constraint/{zh-CN,en}.md`；`template-loader.ts` 为 **build 生成段（禁手改）** | 实测 + `build.js` 8 步 | Agent 契约改动面 = **4 份 feel.md 对称** + subagent 模板 + skills；改后必须 `npm run build` 重生成 |
| 23 | 测试面 **67 文件**（复现：`find test -name '*.test.ts'` 计数 67）/ **1206 用例**（**登记值**：stage-72 门禁；复现命令 `npm test`）；已知翻转点：`test/core/config.test.ts`（T6.3/T6.4b/T6.5）、`test/core/plan/stage.test.ts`（T6.3 回退 disabled/manual）、`test/commands/config.test.ts`、`test/core/flow-manager.test.ts`、`test/core/init.test.ts` | `test/**` + stage-72 门禁记录 [REV-74-006 修订] | 默认值翻转须**逐点清单化**（stage-74 交付），全仓 `rg` 复核残留；**同时登记有意不改点**：`DEFAULT_PROFILE` / `ProfilePreferencesSchema`（stage-74 T7.8）[REV-74-005] |
| 24 | CLI 无 `flow mode` 子命令；`config effective` 输出三键；`flow phases` 输出结尾带「与内置默认差异」提示 | 实测（`flow --help` / `config effective` / `flow phases`） | 新增只读命令 + 四键输出（`--json` 稳定结构） |

## 三、关键裁定（本计划的决策基线）

| # | 议题 | **裁定** | 依据/备注 |
|:-:|------|----------|-----------|
| **A** | 模式语义 | `workflow_mode ∈ {full, fast}`；**阶段级**生效 + **项目级记忆**（显式选择时写 `config.yaml defaults.workflow_mode`） | 用户裁定 A/D |
| **B** | 默认值 | builtin 与新部署默认 **`fast`**；本仓自举期显式 **`full`**（裁定 L / D-BOOT） | 用户裁定 A + 自举风险 |
| **C** | 快线链 | **[需求变更 2026-10-11 修订]** fast 表 **9 条目（8 键 + `done`）**：`plan_pending:[plan_review]`、**`plan_review:[plan_passed, plan_pending]`**、`plan_passed:[exec_running]`、`exec_running:[review_pending]`、`review_pending:[review_failed,review_passed]`、`review_failed:[review_pending, exec_running]`、`review_passed:[archiving]`、`archiving:[done]`、`done:[]`（原「`plan_pending:[plan_passed]` 直连」**作废**——**fast 下计划审查不跳过**，reviewer 单轮必过、与代码审查同级；「单轮必过」口径 = 一轮审查即出结论：通过 → `plan_passed`；blocking → 退回 `plan_pending`〔与 full 表该键逐字一致〕） | 用户裁定 B（2026-10-11 变更）；**`review_failed` 出口含 `exec_running`**（不变，回环重试须可回执行修复）；审查如认为须严格单值可收紧为 `[review_pending]`（不影响其余裁定，见 Q3） |
| **D** | phase 枚举 | **零新增**；fast 沿用既有 15 phase 子集；`checkpoint_mapping` / `phase_corrections` **两模式共用** | 核验 #1 |
| **E** | 表选择单一权威 | 新增 `FlowManager` 内部解析：`resolveStageWorkflowMode(stageId) → { value, source }`（**带 stage 形参**读 `findStatusPath(stageId)` 的该阶段 status.md + config.yaml defaults + profile + builtin，同优先级；**不得**以无参形式复用 `buildCascadeConfig` 当前阶段分支）+ 单一取表函数 `getValidTargets(fromPhase, mode)`（**mode 必传**，四调用点全部显式传 stage 派生 mode；含间接消费者 `buildDownstreamPhases`）；**展示 / 校验 / 推进 / BFS 路径全部经它**；语义边界：`config effective` = 当前阶段域 / `flow mode --stage` = 任意阶段域 [REV-74-001/002 修订] | kb #CLI 自描述命令模式 + 第二信源教训 |
| **F** | `pipeline.yaml` 语义 | 保持现状 = **full 表覆盖**；新增**可选**顶层键 `fast_transitions`（缺失 → 内置快线表）；本仓**不增**该键 | 核验 #3/#20；存量自定义零影响 |
| **G** | 三层载体 | ① `config.yaml defaults.workflow_mode`（记忆）；② `status.md「工作流模式」`（阶段级生效值，cascade 出口）；③ `flow.json stages.{id}.workflow_mode` **可选冗余、不参与级联**（设置时写入；读取权威恒为 ①/②）；**profile 层不扩展**；`flow health` 增一致性校验（不一致 → warn，不 fail） | 用户裁定 D + kb「单一事实源」 |
| **H** | 存量阶段补字段 | `status.md` 缺「工作流模式」行时，`stage set --workflow-mode` 与 `config set ... --sync-stages` **插入**该行（「自动推进」后）；同值 no-op；逐条报告 `updated/inserted/noop` | 自举阶段（74~77 建于字段引入前）+ 存量阶段 |
| **I** | 骨架全量铺 | fast **不裁剪**任何落盘结构（`plan.md` / `ops/op-NNN.md` / `deps.yaml` / `status.md` 全量）；op 骨架由 **CLI 机械铺**（复用既有骨架原语，**不新增 Agent**），输入 = 阶段任务表 | 用户裁定 C |
| **J** | Agent 侧减负 | fast：跳过 **schemer / tester** 调度；reviewer **单轮**；archiver / planner **轻量**（产出边界与「不降质量底线」纪律归 stage-76 模板/skill 收口）；**[需求变更 2026-10-11 修订]** **计划审查（`plan_review`）必经**——fast 下 Feel **必须**调度 reviewer 做计划审查（单轮），`plan_review` 不再是 fast 不可达节点 | 用户裁定 B |
| **K** | 默认自动推进 | `DEFAULT_CONFIG.auto_advance: 'disabled' → 'enabled'`；**与 workflow_mode 无关**；`CONFIG_TEMPLATE_*`（新部署载体）随之；本仓 `config.yaml` 已 `enabled`（零影响） | 用户裁定 E |
| **L** | **D-BOOT（自举）** | 本仓 v1.1.7 的 4 个阶段 **74~77 以 `full` 运行**，落地序：① stage-74 实施期在 `.openfeel/config.yaml` 显式写 `defaults.workflow_mode: full`（自举基线，防 stage-75 起因「字段缺失 + builtin fast」漂移）；② stage-75 交付补字段能力后执行 `config set defaults.workflow_mode full --sync-stages` 补齐 74~77 status.md 字段；③ fast 的端到端有效性由 **stage-77 隔离临时项目集成验收**覆盖 | 自举期引入新模式再以新模式自跑 → 缺陷归因混淆；本仓属架构级高风险变更，需完整审计链（含 plan_review + tester） |
| **M** | 不做 | 不改 phase 枚举 / `checkpoint_mapping` / `phase_corrections`；不新增第三方依赖；不加 CI 步骤；不新增顶层命令组（仅 `flow mode` 子命令与既有命令选项）；不 `npm publish` / 不 `git push` / 不直写 `flow.json` | 边界 |

## 四、阶段概览、依赖图与执行顺序

| 阶段 | 名称 | 核心交付 | 依赖 | op 估 |
|------|------|----------|------|:--:|
| `v1.1.7-stage-74` | 双模式引擎 | `ConfigDefaultsSchema` + `DEFAULT_CONFIG`（含 `auto_advance` 翻转）+ `resolveConfigDefaults` 四键 + `STAGE_FIELD_BY_CONFIG_KEY` + full/fast **双表** + stage→mode 表选择单一权威（**带 stage 形参解析** + 访问器默认语义） + 级联「工作流模式」+ `EFFECTIVE_CONFIG_KEYS` 四键 + 测试（含翻转点清单 + 键集一致）；**`flow phases` 模式解析契约登记**（实施归 75）[REV-74-001/002/003 修订] | — | 3 |
| `v1.1.7-stage-75` | 模式命令面与交互 | `plan stage add --workflow-mode`；`stage set --workflow-mode`（含缺失字段插入）；`flow mode [--stage] [--json]`；wizard 首次选型 + 项目级记忆写入；`config set ... --sync-stages` 支持；**op 骨架机械铺入口**；**`flow phases` 模式分节（`--mode`/`--stage` 解析 + `--json` 仅增字段 + 兼容性测试 + `transitionsDiff` 同模式期望值）**[REV-74-003/004 修订]；i18n 新键 + 基线登记 | hard: 74 | 3 |
| `v1.1.7-stage-76` | 模板与 skill 模式感知 | `feel.md`×4 调度纪律（fast 跳过 schemer/tester、**planner 产出后必经计划审查 `plan_review`**、reviewer 单轮）+ subagent 模板模式感知 + skills（`openfeel-cli-usage` 快线链与新命令 / `openfeel-get-stage-status` 模式分支 / `openfeel-update-stage-status` / `openfeel-wizard` 选型）+ build 重生成 + 静态断言（opencode 关键串零回归）+ **T7 fast 快线表修订（必经 `plan_review`：引擎 `FAST_TRANSITIONS` 9 条目 + 文案 5 处 + stage-74 断言同步）[需求变更 2026-10-11 修订]** | hard: 74, 75 | 5（实拆 op-001~005，含 T7=op-005）[REV-76-009 修订] |
| `v1.1.7-stage-77` | 文档与版本收口 | README×3 + GETTING_STARTED + commands + manual（config / flow-manager / cli commands）+ CHANGELOG `[1.1.7]` + 版本 **1.1.7** 全链路（A/B/C/D/E）+ roadmap/plan 回填 + **fast 隔离端到端验收**（临时项目跑通快线链 + `--to scheme_pending` 拒绝 + 单阶段切回 full） | hard: 76 | 3 |

### 依赖图与执行顺序（**严格串行**）

```
stage-74 ──▶ stage-75 ──▶ stage-76 ──▶ stage-77
```

**执行顺序：74 → 75 → 76 → 77。**

**为何 4 阶段（而非 3）**：用户建议「① 引擎 ② 命令面 ③ 模板/skill/文档/版本收口」。本计划将 ③ **拆为 stage-76（模板与 skill 模式感知）与 stage-77（文档与版本收口）**，理由：
1. **契约 vs 收口性质不同**：模板与 skill 是 **Agent 行为契约**（决定 fast 下谁被调度、谁轻量化），属运行时语义的组成部分，须在冻结前经审查与测试；文档/版本收口是**终局包装**，必须最后执行（版本收口 op 须为最终 op，v1.1.6 同口径）。
2. **审查焦点分离**：模板改动风险 = 「Agent 误判模式 → 调度错链」；文档/版本风险 = 「载体遗漏 / 版本残留」。合并会稀释审查并放大 op 数（>5）。
3. **依赖闭合**：模板须引用 **已定稿**的命令面（`flow mode` 输出字段、`--workflow-mode` 语义）→ 必须晚于 stage-75；文档须引用已冻结的模板措辞 → 最末。

### stage-74 为何不与 stage-75 合并

配置字段（Schema/默认值/级联）与命令面（CLI 选项/交互/只读命令）虽相邻，但：
- **74 面** = 「值从哪来、表怎么选」——引擎语义，可用**纯单测**（fixture `pipeline.yaml`、隔离 HOME、四源级联）充分验证，无需 TTY；
- **75 面** = 「人如何选、如何记住」——命令面与交互（TTY 守卫、写盘副作用、i18n、`--json` 契约），验证依赖 CLI 实跑与提示词。
- 二者若合并，op 数将达 5~6 且混入「引擎正确性」与「交互副作用」两类风险，稀释审查（与 v1.1.6「settings 注入单列」同构理由）。

## 五、建议阶段注册表（供 Feel 经 CLI 执行；本计划**不推进 phase**）

| # | stageId | 名称 | deps | exec-mode | auto-advance |
|:-:|---------|------|------|:--:|:--:|
| 1 | `v1.1.7-stage-74` | 双模式引擎（配置字段 + phase 双表 + 级联 + 默认 auto_advance） | — | auto | enabled |
| 2 | `v1.1.7-stage-75` | 模式命令面与交互 | `v1.1.7-stage-74` | auto | enabled |
| 3 | `v1.1.7-stage-76` | 模板与 skill 模式感知 | `v1.1.7-stage-74` `v1.1.7-stage-75` | auto | enabled |
| 4 | `v1.1.7-stage-77` | 文档与版本收口（v1.1.7 收官） | `v1.1.7-stage-76` | auto | enabled |

- **注册命令**（Feel 执行）：`openfeel plan stage add <stageId> --deps <ids...> --tasks <items...> --exec-mode auto --auto-advance enabled`；随后 `openfeel flow advance --stage <stageId> --to plan_pending`。
- **review-agent**：全部 `openfeel-reviewer`。
- **op 级依赖**（`ops/deps.yaml`）由 openfeel-schemer 在各阶段产方案时落盘（hard / soft / mutual_exclusion，声明实际文件名）。
- **本计划已代 Feel 执行**：`plan stage add`（建目录 + 骨架 + 注册 flow.json）+ 各阶段 `plan.md` / `overview.md` 落盘；**phase 推进与其余 flow.json 变更仍由 Feel/CLI 执行**。

## 六、版本收口清单（1.1.6 → 1.1.7，A/B/C/D/E，归 stage-77）

> 依据 `kb/patterns.md #版本号全链路收口清单模式`；以**内容特征**判定，不以行号为准。

- **A 手工载体**：`package.json`（`version`）；`package-lock.json`（root 两处，**禁 `npm install` 重生成**）；`.openfeel/config.yaml`（`meta.version` **单行 edit，禁整文件重写**）；`src/core/config.ts`（`CONFIG_TEMPLATE_ZH` / `_EN` 各一处版本行）；`src/core/templates-data/agents-md/{zh-CN,en}.md`（「当前 v1.1.x」行）；`src/core/templates-data/claude/constraint/{zh-CN,en}.md`（同款版本行）。
- **B 生成段**：`src/core/template-loader.ts` 由 `npm run build` 从 A 类权威源 + 模板源重生成（**禁手改**）。
- **C 传播**：`CHANGELOG.md` 追加 `## [1.1.7]`（**显著登记默认行为变更：`auto_advance` 默认 `enabled`** + 新增 `workflow_mode` + 新命令）；`README*` 版本横幅与能力小节（fast 模式）；`docs/commands.md` 快照 + 新命令/新键；`docs/GETTING_STARTED.md` 快照 + 模式选择指引；`templates-data/skills/openfeel-cli-usage/SKILL.md`（权威源快照 v1.1.7 + fast 链与新命令）。
- **D 禁改**：`src/**` 历史批注（`v1.1.x-stage-*` 示例）、依赖自身版本、manual 变更历史、`test/**` 注释、`docs/phase-*/**`。
- **E 无载体**：`docs/design-philosophy.md` 等非版本型文档（仅当能力描述失实时按需改，非版本收口项）。
- **CLI `VERSION` 常量不存在**：`--version` 直读 `package.json`。

## 七、边界（不做）

1. 不新增第三方依赖；不改 `bin/openfeel.js` 安装链路；不改 CI workflow。
2. **不改 phase 枚举**（15 项）、`checkpoint_mapping`、`phase_corrections`；不改 `advanceAccepted` 白名单语义。
3. 不破坏既有 `--json` 契约（`flow phases` / `config effective` / `stage status` 等**只增字段不改既有字段语义**）。
4. 不新增顶层命令组；`flow mode` 为只读子命令（不写盘、不推进）。
5. **不实现 `fast` 专属新 Agent**；不减任何落盘结构（骨架全量铺）。
6. 不改 `test_enabled` 相关语义（**代码侧已于 v1.1.4 移除**；存量项目文件可能遗留该键——本仓 `.openfeel/config.yaml` 实测仍含 `test_enabled: true`，经 `passthrough` 容错被忽略、不受默认值翻转影响；fast 跳过测试由**转移表**实现）[REV-74-006 修订]。
7. 不 `npm publish`、不 `git push`；**不直写 `flow.json`**；不推进流水线 phase（由 Feel 经 CLI 执行）。
8. 不扩展 `profile.yaml` 模式层（模式记忆仅项目级 `config.yaml`）。

## 八、全局验收标准（版本级）

1. **门禁**：`npm test` 全绿（`0 skipped / 0 failed`）；`npx tsc --noEmit` = 0；`openfeel lint i18n` = 实测新基线（> **774**，各阶段显式登记）；`openfeel lint kb` = 0 过期；`npm run build` ×2 幂等（`git status --porcelain src/` 空）；`node bin/openfeel.js --version` == `1.1.7`。
2. **双表正确性**：`flow phases`（full 模式）逐字等于**内置现状表**；fast 模式输出快线 7 键；**展示 / 校验 / 推进 / BFS 同源**（同一 stage + mode 下 `flow phases` 所示键集 ⊇ `flow advance --to` 接受集，差异仅 `advanceAccepted` 语义标注）；同 (stage, mode) 下 `canAdvance` / `findPhasePath` / `getAvailablePhases` / `flow phases` 键集一致；`transitionsDiff` 为**同模式**对比（full → `missing=['review_passed|test_passed']`；fast 无覆盖 → 全空）[REV-74-002/004 修订]。
3. **快线链端到端**（隔离临时项目，[需求变更 2026-10-11 修订]）：`workflow_mode: fast` 下 `plan_pending → plan_review → plan_passed → exec_running → review_pending → review_failed → review_pending → review_passed → archiving → done` 全程 `advance` 成功（**`plan_review` 为必经节点**）；`--to scheme_pending` / `--to test_pending` **被拒绝**（exit 非 0，提示合法目标）；自 `plan_pending` 的 `--to plan_passed`（跳过计划审查）**被拒绝**；`plan_review → plan_pending`（退回）**可推进**。
4. **单阶段切换**：`stage set <id> --workflow-mode full` 后，同阶段 `plan_passed → scheme_pending` 可推进（full 链恢复）；`--workflow-mode` 非法值 → exit 1 且 status.md 不变（SHA256 断言）。
5. **默认自动推进（裁定 E）**：无 `config.yaml` 的**隔离 HOME** 项目（无 `profile.yaml`）`config effective auto_advance` → `enabled [builtin]`；非隔离环境复核时断言合法来源集 `{builtin, profile.yaml}`（profile 仅当画像**显式声明** `preferences.auto_advance` 时兜底）[REV-74-005 修订]；`openfeel init` 生成模板含 `auto_advance: enabled`；**本仓 `config.yaml` 零变化**（`git diff` 空）。
6. **模式记忆**：项目 `config set defaults.workflow_mode fast` → 新建阶段 status.md 初值「工作流模式：fast」；改 `full` → 后续新建阶段为 `full`；`flow mode` 输出的「来源」逐场景正确（`status.md` / `config.yaml` / `profile.yaml` / `builtin`）。
7. **存量兼容**：仅有 `execution_mode`/`auto_advance` 两行的旧 status.md → `stage set --workflow-mode` 成功**插入**该行且其余内容逐字保留（`.bak` 生成）；无 `workflow_mode` 的旧 `config.yaml` 与旧 `flow.json`（无冗余字段）→ 全命令零报错。
8. **自举基线**：本仓 `.openfeel/config.yaml` `defaults.workflow_mode: full` 在位；v1.1.7 四阶段 status.md 含「工作流模式：full」。
9. **Agent 侧对称**：`feel.md` 4 份（opencode/claude × zh-CN/en）模式纪律一致；opencode 既有关键串**零回归**（跨 harness diff 断言）；`template-loader.ts` 由 build 重生成（禁手改）。
10. **默认非回归**：full 模式下全部既有行为逐字不变（含 `flow advance` 拒绝集、`auto_advance` 本仓值、`pipeline.yaml` 覆盖语义）；访问器无参调用 = full（`getPipelineTransitions()` / `getDefaultTransitions()`，既有测试逐字绿）[REV-74-003 修订]；`plan stage add` 无 `--workflow-mode` 时初值 = `config.yaml defaults.workflow_mode`（本仓 = full）。

## 九、风险总览

| # | 风险 | 影响 | 缓解 |
|:-:|------|------|------|
| **R-1** | **双表 = 第二信源**：展示表与校验表不一致（kb 已有 `flow phases` vs `advance` 前车之鉴） | **高** | 表选择**单一函数**（裁定 E）；`flow phases` 增模式分节 + 两表差异；fixture 断言「展示键集 ⊇ advance 接受集」（验收 2） |
| **R-2** | `DEFAULT_CONFIG.auto_advance` 翻转的**回归面**（测试/模板/文档/builtin 来源） | **高** | stage-74 交付**翻转点清单**（源码 + 测试 + 文档全仓 `rg`）；隔离 HOME 断言；本仓 `config.yaml` 显式值不参与 |
| **R-3** | 项目级「记忆」写入 `config.yaml` 的副作用（静默改用户配置） | 中 | **仅用户显式选择时写**；非 TTY 不写；复用 `setConfigValue()`（`yaml.Document` 增量写、保注释）；写入即输出「已记忆」提示 |
| **R-4** | 存量 status.md 无「工作流模式」字段 → 行为回落链不清 | 中 | 裁定 H（插入语义）+ 级联口径文档化（缺失 → 回落 `config.yaml` → `builtin`） |
| **R-5** | **自举漂移**：stage-75 起「无字段 + builtin fast」使本仓阶段意外切到 fast | **高** | 裁定 L（D-BOOT）：stage-74 先写 `config.yaml` `full`；`--sync-stages` 补齐字段；验收 8 |
| **R-6** | Agent 模板改动致**调度错链**（fast 误触发/漏触发） | 中 | stage-76 静态断言（模式分支关键句存在性 + opencode 关键串零回归）+ 双 harness 对称 diff |
| **R-7** | `template-loader.ts` 手改 / 冗余树复活 | 中 | build 重生成 + `git status --porcelain src/` 干净断言（v1.1.6 既有口径） |
| **R-8** | i18n 新键遗漏/单语 → `lint i18n` 掉线 | 中 | 双表成对 + 各阶段显式登记新基线（> 774） |
| **R-9** | flow.json 冗余字段被误当权威（第二事实源） | 中 | 裁定 G：**不参与级联**；health 不一致仅 warn；文档明确「读取权威 = status.md」 |
| **R-10** | fast 下 op 骨架质量下降（无 schemer 细化）→ executor 执行偏差 | 中 | 骨架由 CLI 机械铺 + executor 以 `plan.md` 任务表为执行依据（stage-76 纪律明确）；reviewer 单轮仍拦截 |
| **R-11** | 用户口径「15 → 7」与实链节点数表述冲突引发误解（[需求变更 2026-10-11 修订] 后 = 「15 → 6 / 9 节点」） | 低 | 计划/文档统一口径：「跳过 6 项 / 保留 9 节点 / fast 表 9 条目（8 流转键 + `done`）」三数并列表述 |
| **R-12** | `fast_transitions` 与内置 fast 表双维护漂移 | 低 | 本期**本仓不启用**该键（仅 fixture 覆盖）；文档声明「缺失即用内置快线表」 |

**回滚**：按阶段 `git revert <sha>`；数据面无迁移（`workflow_mode` 缺省即回落），回滚仅需还原版本载体与默认值常量；`status.md` 新增行可保留（旧代码忽略未知行）。

## 十、开放问题（留待实施期定稿/用户确认）

- **Q1（需用户确认）**：本仓 v1.1.7 的 4 个阶段**全部以 `full` 运行**（裁定 L 推荐，稳定性/归因优先）vs 「74~75 full、76~77 fast（dogfood）」。**推荐前者**；如需切换，仅需 Feel 在推进 stage-76 前执行 `openfeel config set defaults.workflow_mode fast --sync-stages`（无需改计划）。
- **Q2**：`flow.json stages.{id}.workflow_mode` 冗余字段的**写入时机**细案（创建时 + `stage set --workflow-mode` + `--sync-stages`）→ stage-75 方案期定稿（仍**不参与级联**）。
- **Q3**：fast 表 `review_failed` 出口是否收紧为单值 `[review_pending]` → **stage-74 方案/审查期**裁定（默认含 `exec_running`，见裁定 C）。
- **Q4**：fast 下 planner / reviewer / archiver 的「轻量」**量化口径**（如 plan.md 章节裁剪、reviewer 单轮范围、archiver 归档清单精简）→ **stage-76 定稿**（须与用户确认后落模板，避免自造约束）。
- **Q5**：`flow mode` 输出的「来源」是否复用 `config effective` 的四源标注 → stage-75 定稿（默认复用同一枚举）。
- **Q6**：fast 模式下 `plan stage add --tasks` 是否直接触发 op 骨架机械铺（如 `--ops-from-tasks`）→ stage-75 方案期定稿（默认：提供显式选项，不做隐式副作用）。

## 十一、端到端验收（实现后，由用户/测试官执行）

1. **静态门禁**：见 §八.1。
2. **快线链实跑**（隔离临时项目）：`config set defaults.workflow_mode fast` → `plan stage add` → `flow advance` 全程走快线（含 **`plan_review` 必经**：`plan_pending → plan_review → plan_passed`）；跳过的 2 类 phase（`scheme_*` / `test_*`）`advance` 必须被拒；自 `plan_pending` 直跳 `plan_passed` 被拒。[需求变更 2026-10-11 修订]
3. **切回 full**：同项目 `stage set <id> --workflow-mode full` → `plan_passed → scheme_pending` 可推进；`flow mode --stage <id>` 显示 `full [来源: status.md]`。
4. **记忆**：新建第二个阶段 → 初值 = 最后一次选择值；`flow mode` 来源显示 `config.yaml`。
5. **默认开启自动推进**：全新隔离项目 `openfeel init` → 生成 `auto_advance: enabled`；`config effective` 来源 `config.yaml`。
6. **Agent 实机**（Claude Code + opencode 各一次）：fast 阶段中 Feel 不派发 schemer / tester；reviewer 单轮；archiver 轻量；文档/模板措辞与 CLI 输出一致。
7. **默认非回归**：本仓 `config.yaml` / `flow.json` 结构零意外变更；full 模式既有输出逐字不变。

## 十二、修订记录

| 时间 | 制定人 | 说明 |
|------|--------|------|
| 2026-10-11 | openfeel-planner | 初稿：4 阶段（74/75/76/77）；源码核验 24 项；裁定 A~M（含 D-BOOT 自举、快线表 7 键、`review_failed` 出口含 `exec_running`）；版本收口 1.1.6→1.1.7；全局验收 10 条；风险 R-1~R-12；开放问题 Q1~Q6；已用 CLI 建 4 阶段目录与 status.md 初值并注册 flow.json（未推进 phase、未直写 flow.json）。 |
| 2026-10-11 19:10 | openfeel-planner | **需求变更修订轮**（用户 2026-10-11 裁定：**fast 下计划审查不跳过**）：裁定 B/C/J 与验收 3、§十一.2、R-11 同步——fast 链改为 `plan_pending → plan_review → plan_passed → …`（跳过 **6 项** / **9 节点** / **8 流转键 + `done` = 9 条目**）；**stage-76 新增 T7**（引擎 `FAST_TRANSITIONS` + 文案 5 处 + stage-74 断言同步；口径校正：条目数 8 → **9**，任务书「8 → 10」为偏差）；stage-76 行与 deps 同步。**只改计划文档，未改源码、未直写 flow.json。** |
| 2026-10-11 16:22 | openfeel-planner | **REV-74 审查修订轮**（6 条全落实）：① 001 阶段级模式解析带 stage 形参 + `config effective`/`flow mode --stage` 阶段域边界；② 002 核验 #4/T3 读点清单修正（删 `advancePhase`、补 `canAdvance`/`buildDownstreamPhases`）+ mode 显式传递 + 键集一致断言；③ 003 访问器默认 mode（无参 = full）与 `flow phases` 解析契约 + `--json` 仅增字段 + 兼容性测试；④ 004 内置/运行时 full 表双线 + `transitionsDiff` 同模式；⑤ 005 验收 5 隔离 HOME + `DEFAULT_PROFILE`/`ProfilePreferencesSchema` 有意 disabled 登记；⑥ 006 行号逐条复核 + 统计标注复现命令 + `test_enabled` 措辞。详见 `.openfeel/plan/v1/stage-74/plan.md` §六。 |
