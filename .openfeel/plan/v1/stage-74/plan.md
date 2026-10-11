# v1.1.7-stage-74 计划 — 双模式引擎（配置字段 + phase 双表 + 级联 + 默认 auto_advance）

- **阶段**：`v1.1.7-stage-74`
- **依赖**：**无**（承 v1.1.6 基线：CLI 1.1.6 / i18n 774 / lint kb 0 / 测试 **67 文件**+**1206 用例**（**登记值**：stage-72 门禁；复现命令 `npm test`；文件数复现：`find test -name '*.test.ts'` 计数 67）/ flow 注册阶段 **74** 个（**制定时点**；复现：`node -e "console.log(Object.keys(require('./.openfeel/flow.json').stages).length)"`；**修订复核时点 = 78**，含 v1.1.7 四阶段注册））[REV-74-006 修订]
- **优先级**：P0（本版本唯一引擎面阶段：表与标记的**唯一权威**在此建立）
- **制定人**：openfeel-planner ｜ **制定时间**：2026-10-11
- **定位**：为「快速迭代模式」建立**引擎底座**——① 新增配置键 `workflow_mode`（`full|fast`，**默认 fast**，四层级联）；② 把 phase 转移表扩为 **full / fast 双表**并按 **stage 的 workflow_mode** 选表；③ **表选择单一权威**（展示 / 校验 / 推进 / BFS 路径同源，杜绝第二信源）；④ 依裁定 E 翻转 `DEFAULT_CONFIG.auto_advance` 为 `enabled`（**部署级默认自动推进开启**）。
- **范围**：`src/core/config.ts`、`src/core/pipeline-schema.ts`（如需类型/常量，**不改 15 枚举**）、`src/core/flow-manager.ts`、`test/core/config.test.ts`、`test/core/flow-manager.test.ts`、`test/core/plan/stage.test.ts`（翻转点）、`test/core/init.test.ts`（翻转点）、`test/commands/config.test.ts`（翻转点）；`.openfeel/config.yaml`（自举基线单行）。
- **边界**：**不改 phase 枚举**（15 项）/ `checkpoint_mapping` / `phase_corrections`；**不做命令面**（`flow mode` / `--workflow-mode` / wizard 归 stage-75）；**不改 Agent 模板与 skills**（归 stage-76）；不改 `advanceAccepted` 语义；不新增依赖；不 `npm publish` / 不 `git push`；不直写 `flow.json`。

## KB 检索（`openfeel-check-kb`）

- 已加载。**高度相关条目**：
  - `kb/patterns.md #配置级联解析模式：单一 resolver + 四级优先级 + effective 展示出口` → `workflow_mode` 必须进 `buildCascadeConfig` / `resolveEffectiveConfig`，**禁止**第二套解析；`config effective` 与 `flow status --verbose` 自动同源。
  - `kb/patterns.md #新建阶段骨架初值取 config 默认：resolveConfigDefaults 只读 defaults、不读 status.md` → 四键扩展；`resolveConfigDefaults` 仍**不做级联**（与 `buildCascadeConfig` 硬边界保持）。
  - `kb/troubleshooting.md #writeDefaultConfig 无条件覆盖：npm test 静默改写真实 config.yaml` → 默认值翻转的测试**必须**在 fixture / 隔离 HOME 构造，**严禁**触碰本仓真实 `config.yaml`。
  - `kb/troubleshooting.md #flow phases 自描述 phase 与 flow advance 接受集合不一致（第二信源残留）` → 双表是第二信源高危面；表选择必须**单点**。
  - `kb/troubleshooting.md #配置键白名单须 schema 驱动 + 值类型归一` → 新键走 `ConfigDefaultsSchema` 白名单与 `getConfigFieldLegalValues` 值域派生。
  - `kb/patterns.md #流水线 transitions 组合条件 | 运算符模式` → fast 表**不使用**组合键（单键 7 条），full 表组合键逐字保留。
  - `kb/architecture.md #状态/相位单一事实源` + `#config.yaml meta.version 语义` → 冗余载体不参与级联；本阶段不写 flow.json 冗余字段。
  - **无**「双模式转移表选择」条目 → 归档时补沉 architecture。

---

## 一、背景与实测证据（唯一事实基准，行号以 HEAD `6a2b04f` 为准）

> **行号约定**（[REV-74-006 修订]）：行号 = **定义/枚举项所在行**（修订轮已按源码逐条复核；方案期由 openfeel-schemer 再核一遍）。**统计类事实**均标注「登记值 / 复现命令」。

| 事实 | 位置 | 结论 |
|------|------|------|
| `PIPELINE_PHASES` 15 项硬编码 | `core/pipeline-schema.ts:14-20`（枚举项 **15-19**）[REV-74-006 修订] | fast 链**全部使用既有 phase** → 枚举零新增 |
| 内置默认表 `getDefaultPipelineConfig()`（**无 mode 参数**，含 `review_passed\|test_passed` 组合键） | `core/flow-manager.ts:3947`（`transitions` 体 **3956-3974**、组合键 **3971**）[REV-74-006 修订] | 增 mode 维度返回**双表**；**内置** full 表**逐字等于现状**（**单测对象**；无参调用 = full）；**≠ 本仓运行时表**（本仓被 `pipeline.yaml` 覆盖，见下行） |
| `loadPipelineConfig()` 单表覆盖语义 | `core/flow-manager.ts:3927-3941`[REV-74-006 修订] | 保持；新增**可选** `fast_transitions`（缺失 → 内置快线表） |
| 转移表**唯一取表点** = `getValidTargets(fromPhase, mode)`（私有，`mode` 拟改**必传**）；调用点 = `hasTransition`（1896→1902）/ `getAvailablePhases`（1910→1919）/ `findPhasePath`（1930→1956）/ `canAdvance`（2618→2642；**src 内无生产调用方，仅测试**）；**间接消费者** = `buildDownstreamPhases()`（2284，经 `getAvailablePhases()` 无参 → `current.stage`；`flow status --verbose` 触发）。**`advancePhase`（1791）已弃用且不读转移表**（委托 `advanceStagePhase`）——旧「全经它」表述作废 | `core/flow-manager.ts:1878 / 1896 / 1910 / 1930 / 2618`[REV-74-002 修订] | 表选择下沉**单一函数**，改一处全链一致；**任何调用点不得使用默认 mode，必须显式传入由 stage 派生的 mode** |
| `ConfigDefaultsSchema` 三键 + `.passthrough()` + 逐键 `.default()` | `core/config.ts:25-30`[REV-74-006 修订] | 增 `workflow_mode`（默认 **fast**） |
| `DEFAULT_CONFIG.auto_advance = 'disabled'` | `core/config.ts:164-168`[REV-74-006 修订] | **翻转 `enabled`**（裁定 E） |
| `STAGE_FIELD_BY_CONFIG_KEY` 两键 | `core/config.ts:69-72` | 追加 `workflow_mode → 工作流模式` |
| `resolveConfigDefaults()` 三键、逐键回退、不级联 | `core/config.ts:193`（定义）[REV-74-006 修订] | 扩四键 |
| `CONFIG_TEMPLATE_{ZH,EN}` 以 `DEFAULT_CONFIG.*` 插值 | `core/config.ts:417 / 470`（defaults 节插值 ZH 434-442 / EN 487-495）[REV-74-006 修订] | 模板增 `workflow_mode` 行 + `auto_advance` 注释同步 |
| 级联 `buildCascadeConfig()` **无 stage 形参**：status.md 分支**硬编码** `this.data.pipeline.current.stage`（2170-2172）；`findStatusPath(stageId)` 位于 2222-2224；`resolveEffectiveConfig()` 2203-2219 | `core/flow-manager.ts:2116 / 2170-2189 / 2222-2224`[REV-74-001 修订] | **新增带 stage 形参的解析路径**（读 `findStatusPath(stageId)` 指向的该阶段 status.md + config.yaml defaults + profile + builtin，同优先级）；**不得**以无参形式复用当前阶段分支；声明 `config effective`（当前阶段域）与 `flow mode --stage`（任意阶段域）语义边界 |
| 级联 profile 层**仅** `preferences.auto_advance` 单值；status.md 执行模式/自动推进两条正则（2177-2178） | `core/flow-manager.ts:2116 / 2177-2178`[REV-74-006 修订] | 增「工作流模式」正则；**profile 层不扩展**；`DEFAULT_PROFILE`（`config.ts:245-254`）与 `ProfilePreferencesSchema`（`config.ts:105-110`）的 `auto_advance` **有意保持 disabled** [REV-74-005 修订] |
| `getPipelineTransitions()` / `getDefaultTransitions()` 供 `flow phases` | `core/flow-manager.ts:1999 / 2009` | 增按 mode 取表：**无参 = full**（零回归既有测试 3405/3416/3439/3447/3776-3796）+ 同模式差异输出 [REV-74-003/004 修订] |
| `EFFECTIVE_CONFIG_KEYS` 三键 | `core/flow-manager.ts:172 / 2203-2219`[REV-74-006 修订] | 扩四键 |
| 本仓 `.openfeel/pipeline.yaml` 存在（自定 full 表：**缺组合键** `review_passed\|test_passed`；`phase_corrections.completed/finished/archived`） | 实测（复现：`node bin/openfeel.js flow phases` → `transitionsDiff.missing`） | full 由它覆盖（= **本仓运行时 full 表**）；本阶段**不增** `fast_transitions`（fast 用内置表）[REV-74-004 修订] |
| 本仓 `config.yaml`：`auto_advance: enabled` / `execution_mode: auto` / 未设 `workflow_mode` / **遗留 `test_enabled: true`** | 实测（复现：读 `.openfeel/config.yaml`） | 默认翻转零影响；`workflow_mode` 由自举基线显式补 `full`；`test_enabled` **代码侧已移除、存量文件可能遗留**（passthrough 容错）[REV-74-006 修订] |
| 测试翻转点（已知） | `test/core/config.test.ts`（T6.3/T6.4b/T6.5）、`test/core/plan/stage.test.ts`（T6.3）、`test/commands/config.test.ts`、`test/core/flow-manager.test.ts`、`test/core/init.test.ts` | 逐点清单化（T7.8） |

---

## 二、目标语义

| 维度 | 改前 | 改后 |
|------|------|------|
| 配置键 | `execution_mode` / `auto_advance` / `merge_mode` | **+ `workflow_mode`（`full`\|`fast`，默认 `fast`）** |
| `auto_advance` builtin 默认 | `disabled` | **`enabled`**（新部署默认开启；**与模式无关**） |
| phase 转移表 | 单表（内置 + `pipeline.yaml` 覆盖） | **双表**：full（现状逐字）/ fast（快线 7 键）；按 **stage 模式**选择 |
| 表选择 | 无（全局一张表） | `resolveStageWorkflowMode(stageId)`（**带 stage 形参独立解析**，见 T3）→ 表；**展示/校验/推进/路径同源**；阶段域边界：`config effective` = 当前阶段域 / `flow mode --stage` = 任意阶段域 [REV-74-001 修订] |
| 访问器默认 | 无 mode 概念 | `getDefaultPipelineConfig(mode = 'full')` / `getPipelineTransitions(mode = 'full')` / `getDefaultTransitions(mode = 'full')` **无参 = full**；`getValidTargets(fromPhase, mode)` **mode 必传** [REV-74-002/003 修订] |
| `flow phases` 契约 | 单表展示 | mode 解析 = `--mode` 显式 → `--stage` → `current.stage` →（无阶段）四源兜底 builtin `fast`；`--json` **只增字段**（`workflowMode`），`advanceAccepted` 语义不变；`transitionsDiff` = **同模式**运行时 vs 内置（CLI 实施归 stage-75，契约在此登记）[REV-74-003/004 修订] |
| 级联 | 三键（`status.md > config.yaml > profile.yaml > builtin`） | **四键**（同一解析器，零新增出口） |
| 骨架初值来源 | `resolveConfigDefaults()` 三键 | 四键（`plan stage add` 无显式选项时取 `config.yaml defaults.workflow_mode`） |

**fast 表（裁定 C，7 键）**：

```
plan_pending:   [plan_passed]
plan_passed:    [exec_running]
exec_running:   [review_pending]
review_pending: [review_failed, review_passed]
review_failed:  [review_pending, exec_running]     # 失败回环：重审 或 回执行修复
review_passed:  [archiving]
archiving:      [done]
done:           []
```

**不变量**：
1. **内置 full 表逐字不变**（`getDefaultPipelineConfig('full')` = 现状，含组合键 `review_passed|test_passed`）——**单测对象**；**本仓运行时 full 表 = `.openfeel/pipeline.yaml` 覆盖后的表**（实测缺组合键），二者为**两条独立验收线**、不得混同；`pipeline.yaml` 解析失败回退内置语义不变。[REV-74-004 修订]
2. **phase 枚举 15 项不变**；`advanceAccepted` 白名单**语义不变**（fast 分节信息以**新增字段**承载、不改既有字段）[REV-74-003 修订]。
3. **单一事实源**：阶段级生效值唯一承载 = `status.md`；`config.yaml` 为项目默认/记忆；**本阶段不写 flow.json 冗余字段**。
4. **本仓行为零漂移**：`auto_advance` 已显式 `enabled`；`workflow_mode` 由本阶段写 `full`（裁定 L，见 T6）。
5. builtin 默认 = `fast`；**本仓**由 `config.yaml` 显式 `full` 覆盖（防自举漂移）。

---

## 三、变更点清单（编号 T）

### T1 — 配置键 `workflow_mode`（`src/core/config.ts`）
- `ConfigDefaultsSchema`：`workflow_mode: z.enum(['full', 'fast']).optional().default('fast')`；**同批 `auto_advance` 逐键默认 `disabled → enabled`**（与 `DEFAULT_CONFIG` 同键值 = 单一权威；否则 `resolveConfigDefaults` 缺失键路径取 schema 旧默认）[REV-74-011 修订]。
- `DEFAULT_CONFIG`：`workflow_mode: 'fast'`；**同时** `auto_advance: 'enabled'`（裁定 E）。
- `Config` 接口：`defaults` 与扁平兼容字段各增 `workflow_mode?: 'full' | 'fast'`。
- `ResolvedConfigDefaults`：扩四键；`resolveConfigDefaults()` 逐键 `safeParse` 回退 `DEFAULT_CONFIG`。
- `CONFIG_TEMPLATE_{ZH,EN}`：`defaults` 节增 `workflow_mode`（含中文注释：`full=完整链路（含计划审查/方案/测试）`、`fast=快速迭代（跳过上述环节，保留审查单轮）`）；`auto_advance` 注释与插值随 `DEFAULT_CONFIG` 自动变为 `enabled`（**核对文案措辞**，勿留「默认关闭」旧话术）。
- `STAGE_FIELD_BY_CONFIG_KEY`：追加 `workflow_mode: '工作流模式'`（`--sync-stages` 与 `stage set` 共用）。

### T2 — phase 双表（`src/core/flow-manager.ts`）
- `getDefaultPipelineConfig(mode: WorkflowMode = 'full')`：`'full'` 返回现状逐字；`'fast'` 返回快线 7 键（`phases` 列表**两模式同用** 15 项，避免自描述断层）；`checkpoint_mapping` / `phase_corrections` 共用；**无参 = full**（零回归既有消费点）[REV-74-003 修订]。
- 新增 `FAST_TRANSITIONS` 常量（或 `getDefaultPipelineConfig` 内分支，方案期定稿）——**单一来源**，禁止在命令层复制。
- `loadPipelineConfig()`：解析 `pipeline.yaml` 后，`fast_transitions`（可选顶层键，类型 `Record<string, string[]>`）存入独立字段；缺失 → 内置快线表。**`transitions` 语义不变**（= full 覆盖）。
- 运行时访问器取表：`getPipelineTransitions('full')` = `transitions`；`getPipelineTransitions('fast')` = `fast_transitions ?? 内置快线表`；`getDefaultTransitions(mode)` 恒取**内置**表（无参 = full）。
- `WorkflowMode` 类型统一定义于 `config.ts`（或 `pipeline-schema.ts`，方案期定稿）并导出复用。

### T3 — 表选择单一权威（裁定 E）[REV-74-001/002/003 修订]
- 新增内部方法 `resolveStageWorkflowMode(stageId?: string): { value: WorkflowMode; source: ConfigSource }`：
  - **带 stage 形参的解析路径**：读 `findStatusPath(stageId)`（`core/flow-manager.ts:2222-2224`）指向的**该阶段** status.md「工作流模式」→ `.openfeel/config.yaml` defaults → profile.yaml（该键 profile 层**不扩展**，实际不产出）→ builtin `fast`（同优先级）。
  - **不得复用** `buildCascadeConfig()` 的**当前阶段分支**（2116 起；status.md 分支硬编码 `this.data.pipeline.current.stage`，2170-2172）——被操作 stage ≠ `current.stage` 时（`flow advance --stage B` / `stage set B --workflow-mode` / `flow mode --stage B` / `flow phases --stage B`）会取错阶段。
  - 实现路径（**方案期定稿，二者择一并留证**）：**路径 A（推荐）** = `buildCascadeConfig(stageId?)` 增**可选**形参（缺省 = `current.stage`，既有两出口零回归）→ `resolveStageWorkflowMode` 委托之并提取 `workflow_mode`；**路径 B** = 独立解析 + 提取无 stage 语义的共享 helper。共同硬约束：**status.md 读取必须以传入 `stageId` 为准**；`stageId` 缺省 = `current.stage`；无 stage / 无值 → builtin `fast`。
  - **语义边界（成文）**：`config effective` / `flow status --verbose` = **当前阶段域**；表选择 / `flow mode --stage`（stage-75）= **任意阶段域**。两域共享四源优先级与键域，差异在 status.md 来源。
  - 静态约束：`buildCascadeConfig()` 无参调用**仅允许**出现在既有两出口（`resolveEffectiveConfig()` 2203、`verboseSummary()` 2100）；新增消费点一律显式传 stage。
- `getValidTargets(fromPhase, mode: WorkflowMode)`：**唯一取表点**；`mode` **拟改必传**（私有方法，编译期强制）；四个调用点全部显式传入由 stage 派生的 mode：

  | 调用点 | 位置 | stage 来源 |
  |--------|------|-----------|
  | `hasTransition(to, stageName?)` | 1896→1902 | `stageName ?? current.stage` |
  | `getAvailablePhases(stageName?)` | 1910→1919 | `stageName ?? current.stage`（**间接：`buildDownstreamPhases()` 2284 无参调用 → current.stage**） |
  | `findPhasePath(stageName, to)` | 1930→1956 | `stageName` |
  | `canAdvance(opId, to)` | 2618→2642 | `opId` 解析出的 stage（src 内无生产调用方，仅测试；仍为 mode 透传必改点） |

  - **`advancePhase`（1791）已弃用且不读转移表**，**不**在调用点清单内（旧表述作废）。
  - **禁止**任何调用点使用默认 mode；**禁止**在命令层或模板层出现第二份转移表。
- `getPipelineTransitions(mode: WorkflowMode = 'full')` / `getDefaultTransitions(mode: WorkflowMode = 'full')`：**无参 = full**——零回归既有测试（`test/core/flow-manager.test.ts:3405/3416/3439/3447/3776-3796` 无参调用断言键集）；按 mode 返回副本（供 `flow phases`，stage-75 消费）。
- **T3-附：`flow phases` 模式解析契约（stage-75 实施；本阶段登记）**：
  - mode 解析：`--mode full|fast`（显式，最高优先）→ `--stage <id>`（该阶段模式）→ `current.stage`（当前阶段模式）→ 无阶段/解析失败 → 四源兜底（config.yaml defaults → profile → builtin `fast`）；**core 访问器无参仍 = full**（零回归既有单测）。
  - `--json`：既有键（`phases` / `transitions` / `advanceAccepted` / `schemaVersion` / `transitionsDiff`）**逐字保留**；模式信息以**新增字段**（`workflowMode: { value, source }`）承载；`advanceAccepted` = 内置 15 推进白名单，**语义不变**；两表并列如需输出以**新键**承载（如 `transitionsFast`）、**不得改既有字段语义**。
  - `transitionsDiff`：**同模式对比**（`getPipelineTransitions(mode)` vs `getDefaultTransitions(mode)`）；本仓期望值：full → `missing=['review_passed|test_passed']`；fast（无 `fast_transitions`）→ 全空。
  - **登记 `--json` 兼容性测试**（stage-75）：full 场景既有键值与快照逐字不回归 + 新字段存在性断言。

### T4 — 级联与四键（`src/core/flow-manager.ts`）[REV-74-001 修订]
- `buildCascadeConfig()`：status.md 增 `工作流模式` 正则（`(full|fast)`）→ `statusOverrides['workflow_mode']`；`configDefaults` 由 `ConfigDefaultsSchema` 白名单自动纳入；profile 层**不扩展**（仍仅 `auto_advance`）。
- **stage 形参化**（与 T3 同一处实现，按 T3 路径 A/B 择一）：status.md 分支改读 `findStatusPath(stageId ?? this.data.pipeline.current.stage)`；**缺省行为逐字不变**（当前阶段域），仅显式传参的调用点进入任意阶段域。
- `EFFECTIVE_CONFIG_KEYS`：扩为 `['execution_mode','auto_advance','merge_mode','workflow_mode']`。
- `flow status --verbose` 级联表与 `config effective` 自动获益（同一 resolver，两个出口）——**均为当前阶段域**（语义边界见 T3）。

### T5 — `pipeline.yaml` 可选 `fast_transitions`（裁定 F）
- 解析容错：类型非法（非对象 / 值非数组）→ 忽略该键并告警（不 fail 整体配置）。
- 本仓 `.openfeel/pipeline.yaml` **不新增**该键（结论已登记大计划裁定 F）。

### T6 — 自举基线（裁定 L，`.openfeel/config.yaml` **单行 edit / CLI set**）
- `openfeel config set defaults.workflow_mode full`（或等价单行 edit；**禁整文件重写**）→ 防 stage-75 起因「status.md 无字段 + builtin fast」使本仓阶段漂移。

### T7 — 测试面

| # | 用例 | 断言 |
|:-:|------|------|
| T7.1 | 内置双表逐字 | `getDefaultPipelineConfig('full')` 深等于**内置**现状（含组合键；**单测对象 = 内置表 ≠ 本仓运行时表**）[REV-74-004 修订]；`'fast'` 深等于 7 键快线表；无参调用 = full |
| T7.2 | 表选择（**含 stage ≠ current.stage**） | fixture：stage A `status.md` full、stage B fast（**current.stage = A**）→ `getAvailablePhases(B)` / `findPhasePath(B, …)` / `canAdvance('B.op-001', …)` 全部按 **B 的 fast 表**解析 [REV-74-001/002 修订]；无字段 → `config.yaml`；无 config → builtin fast |
| T7.3 | fast 拒绝集 | fast 阶段 `--to plan_review` / `scheme_pending` / `test_pending` 校验失败；`review_failed → exec_running` 通过 |
| T7.4 | 四源级联 | status.md > config.yaml > profile.yaml > builtin 四场景（fixture / 隔离 HOME）；`resolveEffectiveConfig().workflow_mode` 来源标注逐场景正确 |
| T7.5 | 默认值翻转（**隔离 HOME**） | 无 `config.yaml` **且隔离 HOME（无 profile.yaml）**：`resolveConfigDefaults()` 四键 = `manual / enabled / manual / fast`；`config effective auto_advance` → `enabled [builtin]`；非隔离环境复核时断言合法来源集 `{builtin, profile.yaml}` [REV-74-005 修订] |
| T7.6 | 模板 | `CONFIG_TEMPLATE_{ZH,EN}` 含 `workflow_mode` 行与 `auto_advance: enabled`；无「默认关闭」残留话术 |
| T7.7 | `pipeline.yaml` 覆盖（**运行时线**） | 自定义 `fast_transitions` 生效；非法类型 → 告警 + 回退内置快线表；无该键 → 内置；**本仓运行时 full 表非回归**（复刻本仓 pipeline.yaml：`getPipelineTransitions('full')` 缺组合键）[REV-74-004 修订] |
| T7.8 | 翻转点回归 | 逐点更新 `test/core/config.test.ts`（T6.3/T6.4b/T6.5）、`test/core/plan/stage.test.ts`（T6.3）、`test/commands/config.test.ts`、`test/commands/plan.test.ts`（T6.8：`--auto-advance` 覆盖语义随默认翻转对齐——`initProject` 默认已 `enabled`，用例改 `--auto-advance disabled` 构成真实覆盖）[REV-74-013 修订]、`test/core/flow-manager.test.ts`、`test/core/init.test.ts`；全仓检索 `auto_advance` 复核残留假设；**显式登记有意不改点**：`DEFAULT_PROFILE`（`config.ts:245-254`）与 `ProfilePreferencesSchema`（`config.ts:105-110`）的 `auto_advance` **保持 `disabled`**（画像 = 用户个人偏好层，与部署级 builtin 解耦；仅画像**显式声明**时兜底）[REV-74-005 修订] |
| T7.9 | 本仓零影响 | 本仓显式值下 `config effective` 逐字不变（除新增第四行）；`git diff .openfeel/config.yaml` 仅新增 `workflow_mode` 行 |
| T7.10 | **同 (stage, mode) 键集一致** | 同 (stage, mode) 下 `canAdvance` / `findPhasePath` / `getAvailablePhases` / `getPipelineTransitions(mode)`（= `flow phases` 同源数据入口）四者键集一致（逐 phase 逐 target 双向断言）；CLI 层 `flow phases` 参与的四者一致性用例实施归 stage-75 [REV-74-002 修订] |
| T7.11 | **访问器默认零回归 + 契约登记** | `getPipelineTransitions()` / `getDefaultTransitions()` 无参 = full（既有测试 3405/3416/3439/3447/3776-3796 逐字绿）；`getValidTargets` mode 必传（编译期）；`flow phases` 解析与 `--json` 新增字段契约（T3-附）登记在案、实施归 stage-75 [REV-74-003 修订] |
| T7.12 | **`transitionsDiff` 期望值（同模式）** | fixture：full → `missing=['review_passed\|test_passed']`（复刻本仓）；fast 无覆盖 → 全空；自定义 `fast_transitions` → `extra/changed` 命中（core 层以 `getPipelineTransitions(mode)` vs `getDefaultTransitions(mode)` 之差断言；CLI 级 `flow phases --mode` 用例登记 stage-75）[REV-74-004 修订] |

> 全程 `vi.mock('node:os')` + 隔离 HOME / fixture；**严禁**改写本仓真实 `config.yaml` / `profile.yaml`。

### T8 — 门禁
`npm run build` ×2（幂等，`git status --porcelain src/` 空）→ `npm test`（0 skipped / 0 failed）→ `npx tsc --noEmit` = 0 → `openfeel lint i18n` 新基线（显式登记；预期不变 774，若新增键则同步登记）→ `openfeel lint kb` = 0 → `node bin/openfeel.js --version` = 1.1.6（版本收口归 stage-77）。

---

## 四、验收要点（阶段级）

1. 双表与表选择全部用例绿；**内置 full 表逐字非回归**（`getDefaultPipelineConfig('full')`，单测对象）+ **本仓运行时 full 表（`pipeline.yaml` 覆盖线）行为非回归**（含 `flow advance` 拒绝集与覆盖语义）[REV-74-004 修订]；同 (stage, mode) 下 `canAdvance` / `findPhasePath` / `getAvailablePhases` / `getPipelineTransitions(mode)` 键集一致 [REV-74-002 修订]。
2. 四层级联四场景来源标注正确；`config effective` 输出四键。
3. `auto_advance` builtin 默认 `enabled` 生效于：`resolveConfigDefaults` / `config effective`（**该命令无 `--json` 选项**——`config effective [key]` 仅人类输出；验收证据取其四键/单键输出）[REV-74-015 修订] / `CONFIG_TEMPLATE_*`；本仓 `config.yaml` 零意外变更；**验收在隔离 HOME 下执行**（无 `profile.yaml` 干扰）；非隔离环境复核时断言合法来源集 `{builtin, profile.yaml}` 并复述优先级 [REV-74-005 修订]。
4. 本仓 `config.yaml` `defaults.workflow_mode: full` 在位（自举基线）。
5. 门禁全绿；无第二份转移表（检索复核）；**任何 `getValidTargets` 调用点均显式传入 stage 派生 mode**（检索复核：无默认 mode 调用）[REV-74-002 修订]。
6. **阶段域边界**：被操作 stage ≠ `pipeline.current.stage` 时（`canAdvance` / `getAvailablePhases(B)` / `findPhasePath(B)`）模式解析取 B；`config effective` 保持当前阶段域（边界成文）[REV-74-001 修订]。
7. **访问器默认零回归 + `flow phases` 契约登记**：`getPipelineTransitions()` / `getDefaultTransitions()` 无参 = full（既有测试逐字绿）；`flow phases` mode 解析与 `--json` 新增字段契约（T3-附）已在计划登记 [REV-74-003 修订]。

## 五、风险

| # | 风险 | 缓解 |
|:-:|------|------|
| R-74-1 | 双表引入第二信源 | T3 单点取表（mode 必传 + 显式 stage 派生）+ T7.10 四者键集一致 + 检索复核 + stage-75 展示层复用同一访问器 [REV-74-002 修订] |
| R-74-2 | 默认值翻转回归面广 | T7.8 逐点清单 + 全仓检索 |
| R-74-3 | 自举漂移（builtin fast 影响本仓） | T6 + 验收 4 |
| R-74-4 | `fast_transitions` 与内置表漂移 | 本仓不启用该键（T5）；文档声明缺失即内置 |

> 说明：op 级拆分（建议 op-001 配置面 T1/T6、op-002 双表与表选择 T2/T3/T5、op-003 级联 T4 + 测试门禁 T7/T8）由 openfeel-schemer 定稿并落 `ops/deps.yaml`。（REV-74 修订后 T3 含 stage-75 契约登记，仍归 op-002。）

## 六、修订记录（REV-74 审查修订轮）

| 时间 | 修订人 | 说明 |
|------|--------|------|
| 2026-10-11 16:22 | openfeel-planner | **REV-74 审查修订轮**（原判：不通过，3 blocking + 3 非阻塞；6 条全落实）：① REV-74-001 T3/T4 改「带 stage 形参解析路径 + 阶段域边界」；② REV-74-002 修正核验 #4/T3 读点清单（删 `advancePhase`、补 `canAdvance`/`buildDownstreamPhases`）+ 强制 mode 显式传递 + T7.10；③ REV-74-003 定义访问器默认 mode 与 `flow phases` 解析契约 + `--json` 只增字段 + 兼容性测试登记（T3-附/T7.11）；④ REV-74-004 区分内置 full 表与本仓运行时 full 表两条验收线 + `transitionsDiff` 同模式期望值（不变量 1/T7.1/T7.7/T7.12/验收 1）；⑤ REV-74-005 验收 3/T7.5 隔离 HOME + T7.8 登记 `DEFAULT_PROFILE`/`ProfilePreferencesSchema` 有意保持 disabled；⑥ REV-74-006 行号逐条复核 + 统计标注「登记值/复现命令」+ `test_enabled` 措辞。**只改计划文档，未改源码、未动 flow.json。** |
| 2026-10-11 | openfeel-planner | **REV-74 补登记轮（4 条）**：① [REV-74-011] `ConfigDefaultsSchema.auto_advance` 逐键默认翻转（实施期必要变更）补登记至 `ops/op-001.md` T1（第 8 处）+ 计划 T1 + F12 翻转点；② [REV-74-013] `test/commands/plan.test.ts`（T6.8）翻转点补漏登记至 T7.8；③ [REV-74-015] 验收 3 修正：`config effective` 无 `--json` 选项，验收证据改为该命令人类输出；④ [REV-74-007 遗留] 消解：`v1.1.7/deps.yaml` stage-75 `produces_core` 补 `src/core/flow-manager.ts`（与 `stage-75/plan.md:8` 范围一致），`ops/op-003.md` / `ops/deps.yaml` 同步「已消解」。**只改计划/op/deps 文档，未改源码、未动 flow.json。** |
