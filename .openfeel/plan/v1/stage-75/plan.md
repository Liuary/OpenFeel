# v1.1.7-stage-75 计划 — 模式命令面与交互

- **阶段**：`v1.1.7-stage-75`
- **依赖**：**hard: `v1.1.7-stage-74`**（`workflow_mode` 配置键、四层级联、表选择访问器已就绪）
- **优先级**：P0（「人如何选模式 / 如何记住 / 如何查询」的唯一入口层）
- **制定人**：openfeel-planner ｜ **制定时间**：2026-10-11
- **定位**：把 stage-74 的引擎能力**暴露为命令面**——① 阶段创建时可指定模式（`plan stage add --workflow-mode`）；② 既有阶段可单阶段切换/切回（`stage set --workflow-mode`，含**缺失字段插入**）；③ 新增**只读**查询命令（`flow mode`：当前模式 + 来源）；④ wizard 首次**交互选型**并把选择写入**项目级记忆**（`config.yaml defaults.workflow_mode`）；⑤ `config set ... --sync-stages` 纳入新键（含 **`--stage` 限定**）；⑥ fast 下 **op 骨架机械铺**入口（全量骨架，不耗 Agent）；⑦ **`flow phases` 模式分节**（`--mode`/`--stage` 解析链 + `--json` 增 `workflowMode` + `transitionsDiff` 同模式，消除 fast 下**静默错表**）[REV-75-001 修订]；⑧ **自举收尾动作**（裁定 L ②：`config set defaults.workflow_mode full --sync-stages --stage …` 补齐 74~77 status.md 字段并核验）[REV-75-002 修订]。
- **范围**：`src/commands/plan.ts`、`src/commands/stage.ts`、`src/commands/flow.ts`、**`src/commands/config.ts`**（`--sync-stages` 的 `inserted`/`skipped-no-anchor` 分支 + 汇总行 + `--stage` 限定 + 新 i18n 键）[REV-75-004 修订]、`src/core/plan/stage.ts`、`src/core/flow-manager.ts`（`syncConfigFieldToStages` 插入语义 + `--stage` 过滤 + 冗余字段写入）、`src/core/i18n-data/{zh-CN,en}.ts`；`test/commands/{plan,stage,flow,config}.test.ts`、`test/core/plan/stage.test.ts`、`test/core/flow-manager.test.ts`、`test/cli/output-encoding.test.ts`（E-2② 键数断言为既有更新点，见 T8）[REV-75-001 修订]。
- **边界**：**不改**引擎语义（表选择 / 级联 / 默认值已在 stage-74 定稿）；不改 phase 枚举；不改 Agent 模板与 skills（stage-76）；**不新增顶层命令组**（`flow mode` 为既有 `flow` 组子命令）；`flow mode` / `flow phases` **只读**（不写盘、不推进）；不破坏既有 `--json` 契约（只增字段；`flow phases` 既有五键在 full 场景逐字不变）[REV-75-001 修订]；`--sync-stages` 批量语义保持「逐阶段结果码 + 退出码恒 0」[REV-75-005 修订]；不新增依赖；不直写 `flow.json`（冗余字段经 CLI 自身写入）。

## KB 检索（`openfeel-check-kb`）

- 已加载。**高度相关条目**：
  - `kb/patterns.md #新建阶段骨架初值取 config 默认` → `plan stage add --workflow-mode` 与 `--exec-mode` 同构：值域 `getConfigFieldLegalValues('workflow_mode')` 派生、（非法 → exit 1 **且不建阶段**）、隐式注册路径同样继承 config 默认。
  - `kb/patterns.md #CLI 自描述命令模式：phase 枚举与转移表复用运行时单一数据源` → `flow mode` **禁止硬编码**模式/转移表；经 `FlowManager` 只读访问器取（stage-74 已备 `getPipelineTransitions(mode)` / `resolveStageWorkflowMode`），返回副本，`--json` 稳定结构。
  - `kb/patterns.md #配置级联解析模式` → `flow mode` 的「来源」必须复用 `resolveEffectiveConfig()` 的四源枚举（`status.md` / `config.yaml` / `profile.yaml` / `builtin`），**不得**自造来源判定。
  - `kb/patterns.md #CLI 国际化封装模式` + 死键教训（`lint i18n` 仅校验对称性、不校验引用）→ 新键**同批接入调用点**并检索引用；双表成对 + 新基线显式登记。
  - `kb/patterns.md #破坏性命令安全校验清单模式` → 选项/字段校验「先探测后写」：探测失败 exit 1 **不落盘**；多字段部分成功须逐条报告。
  - `kb/patterns.md #`defaults.X ≡ X` 键归一 + 归一再校验` → `config set defaults.workflow_mode` 免改命令层（stage-74 已就绪）；`--sync-stages` 经 `STAGE_FIELD_BY_CONFIG_KEY` 自动纳入。
  - `kb/troubleshooting.md #writeDefaultConfig 无条件覆盖` → 记忆写入测试**必须**在隔离 HOME/fixture 项目构造，**严禁**改写本仓 `config.yaml`。
  - **无**「模式选择命令 / 模式记忆写入」条目 → 归档时补沉 patterns。

---

## 一、背景与实测证据（行号以现 HEAD `5607905` 为准）[REV-75-007 修订]

| 事实 | 位置 | 结论 |
|------|------|------|
| `plan stage add` 已有 `--exec-mode/--auto-advance`（值域派生 + exit 1 不建阶段） | `src/commands/plan.ts:26`（定义）/ `31-32`（选项）/ `45-61`（值域校验）/ `91-98`（overrides）[REV-75-007 修订] | `--workflow-mode` 逐条仿制 |
| `ensureStageSkeleton()` 初值 = `overrides ?? resolveConfigDefaults`（幂等，已存在不覆盖） | `src/core/plan/stage.ts:103-188`（status.md 骨架 143-185；初值 148-151）[REV-75-007 修订] | 骨架增「工作流模式」行 + `StageSkeletonOverrides` 扩键 |
| `stage set` 字段白名单 + `probeStatusField`（`not-found` → exit 1 不写盘；`setStatusField` 定义 207，替换语义） | `src/commands/stage.ts:357-438`（`set` 子命令，jobs 375-394）/ `242-257`（`probeStatusField` 定义）[REV-75-007 修订] | 新增 `--workflow-mode`；**存量阶段需「插入」语义**（裁定 H）；插入须**新增**写函数（禁改替换语义）[REV-75-005 修订] |
| `syncConfigFieldToStages()`：字段缺失 → `skipped-no-field`；复用 `writeStatusField`（3500-3516，定向替换）+ 按阶段锁；只读 flow.json（无 save） | `core/flow-manager.ts:3528-3561` [REV-75-007 修订] | `workflow_mode` 纳入 + 缺失插入扩展 + `--stage` 过滤 |
| `flow` 命令组已有 `status/overview/current/metrics/phases/stage/advance/…/wizard` | `src/commands/flow.ts:36-2016` | `flow mode` 作为新子命令（**只读**）插于 `phases` 邻近位置 |
| `flow phases` 现有输出：阶段列表 + 流转映射 + `transitionsDiff` + `advanceAccepted`；**现状缺陷**：`:391`/`:393` 经默认形参 `mode='full'` 无参调用 → fast 阶段**静默输出 full 表** | `src/commands/flow.ts:384-434`（无参调用 391/393）[REV-75-007 修订] | stage-74 已备 `resolveStageWorkflowMode`（`flow-manager.ts:2276`）与 mode 形参访问器（2037/2048；注释 2035 明示「fast 供 stage-75 `flow phases` 模式分节消费」）→ 本阶段**必做**（T3-附）[REV-75-001 修订] |
| wizard 非 TTY 守卫（`nonTtyHint` + `process.exitCode = 1`）+ 交互创建/选择阶段 | `src/commands/flow.ts:1673-1859`（守卫 1679-1683）[REV-75-007 修订] | 模式首次选型接入点；**非 TTY 既有守卫保持不变**（T4）[REV-75-003 修订] |
| `flow.json` stage 结构：`{name, phase, status, deps, ops, stats}` | 实测 | 可选冗余字段 `workflow_mode`（不参与级联，裁定 G） |

---

## 二、目标语义（命令面契约）

| 命令 | 改前 | 改后 |
|------|------|------|
| `openfeel plan stage add <id> [--workflow-mode full\|fast]` | 无该选项 | 选项存在；非法值 → exit 1 **且不建阶段**；缺省 → `config.yaml defaults.workflow_mode`；骨架 status.md 含「**工作流模式**」行 |
| `openfeel stage set <id> --workflow-mode <v>` | 无该选项 | 设置/切换单阶段模式；**字段缺失 → 插入**（锚点链：「自动推进」→「执行模式」；皆缺 → exit 1 不写盘）；`.bak` 备份 + 同值 no-op；非法值 exit 1 不写盘 [REV-75-005 修订] |
| `openfeel flow mode [--stage <id>] [--json]` | 命令不存在 | **新增只读**：当前模式 + 来源（四源枚举）+ 可选 `transitions`（当前模式表）；`--json` 稳定结构 |
| `openfeel flow phases [--mode <full\|fast>] [--stage <id>] [--json]` | 固定 full 表（`:391`/`:393` 无参调用；fast 阶段**静默错表**） | **模式解析链**：`--mode` 显式（非法 → exit 1）→ `--stage`（非法 → exit 1 + 建议名）→ `current.stage` → 级联兜底 builtin；mode **显式传入**两访问器；人类输出增模式分节（模式 + 来源）；`--json` 增 `workflowMode`（既有五键语义逐字不变）；`transitionsDiff` **同模式**对比 [REV-75-001 修订] |
| `openfeel config set defaults.workflow_mode <v> [--sync-stages] [--stage <id...>]` | 键不存在 | 生效（stage-74 白名单）+ `--sync-stages` 批量写各阶段字段（含插入）+ **`--stage` 限定作用域**（缺省 = 全量现状；未注册 / 单独使用 / 与 `--global` 组合 → exit 1）；`inserted` 结果**命令层落地**（新 i18n 键 + 汇总行「同步 N / 插入 M / 跳过 K」）[REV-75-002/004 修订] |
| `openfeel config effective [workflow_mode]` | 三键 | 四键（stage-74 已就绪，本阶段仅验证 CLI 输出与登记） |
| wizard | 无模式选择 | 首次进入某阶段（无字段且项目未设值）时**TTY 询问一次**；选择写 `status.md` + `config.yaml`（记忆）；**非 TTY → 既有全局守卫保持**（`nonTtyHint` + exitCode 1；模式询问不可达、不写盘、**退出码不变**）[REV-75-003 修订] |
| `[T6 占位] openfeel plan scheme create --from-tasks` 或 `plan stage add --ops-from-tasks`（**入口名方案期定稿**） | 命令不存在 | **显式**入口：从阶段任务表机械生成 `ops/op-NNN.md` 骨架 + `ops/deps.yaml` 占位；不调用任何 Agent；Q6 默认 = 显式选项、**无隐式副作用** [REV-75-008 修订] |

**不变量**：
1. `flow mode` **不写盘**（SHA256 断言：执行前后 `flow.json` / `config.yaml` / `status.md` 不变）。
2. 一切「写」均为**用户显式动作**（选项或 TTY 选择）；**wizard 非 TTY 路径由既有全局守卫截断**（`nonTtyHint` + `process.exitCode = 1`）——模式询问不可达、零写盘、**退出码与 T39 断言均不变**（原「非 TTY 不 exit 1」表述作废）[REV-75-003 修订]。
3. 记忆写入复用 `setConfigValue()`（`yaml.Document` 增量写、保注释）；**不覆盖**其它 `defaults` 键。
4. 既有 `--json` 契约**只增不改**（`config effective` 字段语义不变；`flow phases` 既有五键在 **full 场景逐字不变**，fast 场景为**有意修正**：错表 → 对表）[REV-75-001 修订]。
5. 冗余字段 `flow.json stages.{id}.workflow_mode` **不参与级联**；读取权威恒为 `status.md`/级联。
6. `flow phases` 模式解析与 `flow mode` **同源**（同一 `resolveStageWorkflowMode`），展示 / 差异 / 查询三出口一致，**禁第二信源** [REV-75-001 修订]。
7. `--sync-stages` 批量语义：逐阶段结果码 + **退出码恒 0**；插入失败以 `skipped-no-anchor`（跳过类）表达，单阶段 `stage set` 路径为 fail-fast exit 1 [REV-75-005 修订]。

---

## 三、变更点清单（编号 T）

### T1 — `plan stage add --workflow-mode`（`src/commands/plan.ts` + `src/core/plan/stage.ts`）
- 选项声明 + 值域校验（`getConfigFieldLegalValues('workflow_mode')`，非法 → exit 1 **不建阶段**，复用 `stage.set.invalidValueTmpl` 口径）。
- `StageSkeletonOverrides` 扩 `workflowMode?`；`ensureStageSkeleton()` 初值 = `overrides?.workflowMode ?? configDefaults.workflow_mode`；status.md 骨架在「**自动推进**」行之后插入「- **工作流模式**：{v}」。
- **兼容**：既有调用方（`scheme.ts` 隐式注册路径）不传 override → 继承 config 默认（与 `--exec-mode` 同口径）。

### T2 — `stage set --workflow-mode`（`src/commands/stage.ts` + flow-manager 写侧）
- 字段白名单 job 追加（写入顺序：状态 → 执行模式 → 自动推进 → **工作流模式** → 当前责任 Agent）。
- **插入语义（裁定 H）**：`probeStatusField` 返回 `not-found` 时，若字段属**新受管键**（`workflow_mode`）→ **插入**该行（备份 `.bak` → 原子写），其余内容逐字保留；**其余字段（状态/执行模式/自动推进/责任 Agent）保持既有 `exit 1` 口径不变**（零回归，既有 N5 用例不改）[REV-75-005 修订]。
- **锚点链（REV-75-005 定义）**：优先在「自动推进」行后插入 → 该行缺失时**回退「执行模式」行后** → **两行皆缺 = 无锚点**：单阶段路径 exit 1 **不写盘**（探测先于写，无 `.bak`）。
- **写函数约束（REV-75-005）**：插入须**新增单一写函数**（原子写 + 按阶段锁 + 结果返回）；**禁改** `setStatusField`（`commands/stage.ts:207`）/ `writeStatusField`（`flow-manager.ts:3500`）的替换语义（禁双重语义）。落点由方案期定稿（候选：`FlowManager` 公共方法，或中立小模块；**禁落 `core/plan/stage.ts`**——其已 import `flow-manager`，会造成循环依赖）。
- 同值 no-op；非法值 exit 1 不写盘；多字段部分成功逐条报告（既有口径）。

### T3 — `flow mode` 只读命令（`src/commands/flow.ts`）
- `openfeel flow mode [--stage <id>] [--json]`：
  - 人类输出：`当前模式：fast  [来源: status.md]` +（可选）当前模式可达目标；
  - `--json`：`{ stage, mode, source, modes: { full: {...transitions}, fast: {...transitions} } }`（稳定结构；`source` 复用 `resolveEffectiveConfig` 枚举）。
- 经 `FlowManager` 只读访问器（`resolveStageWorkflowMode` / `getPipelineTransitions(mode)`）；**禁止**硬编码；返回副本。
- 非法 `--stage` → exit 1 + 建议名（复用 `validateStageId`/`suggestStageId` 口径）。
- 交叉引用：`flow advance --help` / `flow phases` 输出补指引「查看当前模式：`openfeel flow mode`」。
- **裁定登记（REV-74-014 B 收敛）**：`flow mode` 的「来源」经 `resolveStageWorkflowMode` 复用（四源枚举权威恒为单一），**不构成第二信源**；`pickCascadeSource` helper **暂不抽取**（无第三个四源消费点，避免无复用需求的抽象）[REV-75-006 修订]。

### T3-附 — `flow phases` 模式分节（`src/commands/flow.ts`）[REV-75-001 修订]
- 命令面：`flow phases [--mode <full|fast>] [--stage <id>] [--json]`。
- **模式解析链**（与 `flow mode` 同源、禁第二信源）：`--mode` 显式（值域 = `getConfigFieldLegalValues('workflow_mode')`；非法 → exit 1）→ `--stage`（格式非法/不存在 → exit 1 + 建议名，复用 `validateStageId`/`suggestStageId` 口径）→ `current.stage` → 级联兜底 builtin（`resolveStageWorkflowMode(stageId?)` 单点派生）。
- **显式消除无参调用**：`src/commands/flow.ts:391` / `:393` 改为 `mgr.getPipelineTransitions(derivedMode)` / `mgr.getDefaultTransitions(derivedMode)`；访问器无参默认 `= 'full'` **保留**（既有测试零回归），但 **src/ 内零无参调用残留**（T8 检索复核）。
- `transitionsDiff` **同模式**对比（runtime(mode) vs builtin(mode)）；人类输出在转移表前增**模式分节行**（模式 + 来源；文案键与 `flow mode` 共用，保证口径一致）。
- `--json` **只增字段**：追加 `workflowMode`（字符串）；既有五键（`phases` / `transitions` / `advanceAccepted` / `transitionsDiff` / `schemaVersion`）语义逐字不变。
- **有意变更登记**：fast 阶段 `flow phases` 输出由 full 表（错表）修正为 fast 表——属 **fix 非 break**；full 场景输出 **[REV-75-012 修订] 除新增 2 行（模式分节 + 指引）外其余逐字不变**。

### T4 — wizard 首次选型与项目级记忆（`src/commands/flow.ts`）
- 触发条件：TTY + 选定 stage 的 `status.md` 无「工作流模式」字段 + 项目 `config.yaml` 未设 `defaults.workflow_mode`（= 首次）。
- 交互：`select`（`full` / `fast`，附一句定位说明）；选择后：写该 stage `status.md` 字段 + 写 `config.yaml defaults.workflow_mode`（**记忆**）+ 输出「已记忆：后续新阶段默认 {v}」。
- **非 TTY 语义（裁定 a：保持既有全局守卫）**：`flow.ts:1679-1683` 不变——`nonTtyHint` + `process.exitCode = 1`；模式询问在非 TTY 下**不可达**；不写盘、**不改变既有退出码**；**T39 既有断言逐字不动**（修订原「不 exit 1」表述，消除与 T39 / R-75-4 的自相矛盾）[REV-75-003 修订]。
- 已设值：不再询问（幂等；如需改 → `stage set --workflow-mode`）。
- **可测性设计（TTY 交互模拟机制）**：
  - 「是否询问」判定抽为**纯函数**（输入：该 stage 有字段与否 / 项目记忆有值与否；输出：`prompt | skip`）→ 决策矩阵单测；
  - TTY 交互分支用 `Object.defineProperty(process.stdin|stdout, 'isTTY', { value: true, configurable: true })` + **`vi.mock('@inquirer/prompts')`**（wizard 为动态 `await import`，vitest 模块级 mock 同样拦截；mock 需提供 `select`/`input`）覆盖「首次询问 → 写两处 + 记忆提示」「二次不询问」；
  - 非 TTY 用例：断言既有守卫语义（exitCode=1）与**零写盘**（config.yaml / status.md SHA256 不变），与 T39 兼容共存。

### T5 — `--sync-stages`（作用域 + 插入结果）与冗余字段（`src/core/flow-manager.ts` + `src/commands/config.ts`）
- `syncConfigFieldToStages()`（`core/flow-manager.ts:3528-3561`）：
  - 对 `workflow_mode` 复用 T2 **同一插入实现**（**禁止双实现**）；结果集扩 `inserted`；**批量插入失败结果码 `skipped-no-anchor`**（锚点链缺失；计入「跳过」；**退出码恒 0 不变**）[REV-75-005 修订]；
  - `execution_mode` / `auto_advance` 字段缺失**保持 `skipped-no-field`**（零回归）；`merge_mode` 等非受管键保持 `skipped-no-field`；
  - **`--stage <id...>` 限定（裁定：采用限定方案，符合「只补 74~77」）**：仅同步列出的阶段；缺省 = 全量（现状不变）；入参经 `normalizeStageId` 归一 + **必须已注册**（未注册 → exit 1 **前置零写盘**，附建议名口径）；与 `--global` 组合 → exit 1；**单独 `--stage`（无 `--sync-stages`）→ exit 1**（防静默无效参数）[REV-75-002 修订]；
  - 引擎签名建议扩 `options?: { onlyStages?: string[] }`（方案期定稿）；支持空格/逗号两种写法（`--deps` 同款解析），变长参数建议置于命令末尾。
- **命令层落地（`src/commands/config.ts:269-288`，REV-75-004 必改）**：
  - `switch (r.result)` 显式增 **`inserted`** 分支（成功类输出）与 **`skipped-no-anchor`** 分支（报告类输出）；**禁止落入 `default:` 被当错误输出**；
  - 汇总行改「**同步 N / 插入 M / 跳过 K**」（跳过 = noop + 全部 skipped-*；退出码保持 0），落 **i18n 新键** `config.set.syncSummaryTmpl`；
  - 新 i18n 键（双表成对 + 同批接入调用点并检索引用，防死键）：`stage.set.insertedTmpl`、`stage.set.noAnchorTmpl`、`config.set.syncSummaryTmpl`。
- **done 阶段行为（登记为定义行为）**：**不做 phase 过滤**——`--stage` 显式列出 done 阶段时正常插入/更新并逐条报告；全量模式同样覆盖 done 阶段（现状语义）[REV-75-002 修订]。
- `flow.json stages.{id}.workflow_mode`（裁定 G，**可选冗余**）：在 `plan stage add`（初值）、`stage set --workflow-mode`、`--sync-stages` 三处**同步写入**；读取**不参与级联**；`flow health` 增一致性校验（不一致 → **warn**，不 fail）。

### T6 — op 骨架机械铺入口（裁定 I）
- fast（及 full）模式均需**全量骨架**：提供**显式** CLI 入口（如 `plan scheme create --from-tasks` 或 `plan stage add --ops-from-tasks`，方案期定稿），从**阶段任务表**机械生成 `ops/op-NNN.md` 骨架 + `ops/deps.yaml` 占位；**不调用任何 Agent**、不要求 schemer 在场。
- 默认**不做隐式副作用**（不自动在 `plan stage add` 时铺 op，见大计划 Q6）。

### T7 — i18n 与测试

| # | 用例 | 断言 |
|:-:|------|------|
| T7.1 | `--workflow-mode` 初值/非法 | `fast`/`full` 写入骨架；`bogus` → exit 1 且目录不存在；缺省 → config 默认 |
| T7.2 | 插入语义 | 旧版 status.md（仅两字段）→ 成功插入且其余内容**逐字保留**（diff 仅 1 行 + `.bak`）；**锚点回退**（无「自动推进」行 → 「执行模式」行后插入）；**无锚点 → exit 1 不写盘 + 无 `.bak`** [REV-75-005 修订] |
| T7.3 | 同值 no-op / 非法值不写盘 | SHA256 断言 |
| T7.4 | `flow mode` 只读 | 输出模式+来源正确；执行前后三文件 SHA256 不变；`--json` 结构稳定 |
| T7.5 | 来源标注（**[REV-75-011 修订]**：3 可达源 + profile 阴性边界） | fixture 三场景 `source` = `status.md` / `config.yaml` / `builtin`；**profile 阴性断言**：profile.yaml 仅含 `preferences.auto_advance` 或未知键时 `source !== 'profile.yaml'`（`workflow_mode` 在 profile 层不承载——`buildCascadeConfig` profile 分支只读 `preferences.auto_advance`；原「四场景含 profile.yaml」字面不可满足，偏差登记见 op-002 困难点 2） |
| T7.6 | wizard 交互 | **TTY 模拟机制**（`isTTY=true` 注入 + `vi.mock('@inquirer/prompts')`）：首次询问 → 写两处 + 记忆提示；二次不询问；**非 TTY → 既有守卫（exitCode=1 + nonTtyHint）+ 零写盘（SHA256）**；「是否询问」纯函数决策矩阵 [REV-75-003 修订] |
| T7.7 | `--sync-stages` | 批量 updated/**inserted**/noop 分类正确且输出走新 i18n 键（**不落 default 报错**）；`--stage` 限定仅写列出阶段 / 未注册 → exit 1 前置零写盘 / 单独 `--stage` → exit 1；**done 阶段**显式列入 → 正常处理并逐条报告；**重复执行幂等**（第二次全 noop、零写盘 SHA256）；锚点缺失 → `skipped-no-anchor` 计入跳过且**退出码 0**；非法键仍 `skipped-no-field` [REV-75-002/004/005 修订] |
| T7.8 | 冗余字段 | 三写入点同步；构造**不一致** fixture → `flow health` warn 且**不 fail**；无该字段的旧 flow.json 零报错 |
| T7.9 | 骨架机械铺 | 任务表 → `ops/op-NNN.md` + `ops/deps.yaml` 生成；**无 Agent 参与**（不产生 agent 调用/日志） |
| T7.10 | i18n | 新键双表成对 + 检索确认**无死键** + 新基线显式登记（含 T5 三新键）[REV-75-004 修订] |
| T7.11 | `flow phases` 模式分节 | ① `--mode fast` → fast 表 7 键 + `--json.workflowMode='fast'`；② `--stage <id>`（fixture 该 stage = fast）→ 派生 fast；③ 缺省 + fixture config full → full（既有基线）；④ 无任何来源 → builtin fast 兜底（隔离 fixture）；⑤ **兼容性**（[REV-75-012 修订]）：full 场景人类输出**除新增 2 行（模式分节 + 指引）外**其余逐字不变；`--json` 既有五键逐字不变 + 新增 `workflowMode`（只增）（fixture 基线 = config full）；⑥ `transitionsDiff` 同模式期望值：full（本仓式缺组合键 fixture）→ `missing=['review_passed\|test_passed']`、fast（无覆盖）→ 三数组全空；⑦ `--mode` 非法 / `--stage` 非法 → exit 1（+ 建议名）[REV-75-001 修订] |

> 全程隔离 HOME / fixture 项目；**严禁**改写本仓真实 `config.yaml` / `flow.json`。

### T8 — 门禁
`npm run build` ×2（幂等）→ `npm test`（0 skipped / 0 failed）→ `npx tsc --noEmit` = 0 → `lint i18n` 新基线登记 → `lint kb` = 0 → 既有 `--json` 契约回归（`config effective` 字段逐字不变）→ **检索复核：src/ 内 `getPipelineTransitions(` / `getDefaultTransitions(` 零无参调用残留**[REV-75-001 修订]。

**既有断言更新点清单（已实测核验）[REV-75-001/003 修订]**：
- **E-2②（`test/cli/output-encoding.test.ts:292`）**：`Object.keys(j).length` 断言 5 → **6**（追加 `workflowMode`；**有意更新**，语义 = 「只增字段」）；
- `test/commands/flow.test.ts` T19/B1-6 等键集断言为 `arrayContaining`（不断言精确键集）→ 追加字段**零破坏**（登记为已核证据，无需改）；
- 同文件 fixture 已置 `workflow_mode: full`（stage-74 R-FIX）→ 既有 full 基线用例零回归；
- **T39 保持**（非 TTY 守卫不变）；**N5**（`test/commands/stage.test.ts:134`，字段缺失 → exit 1）路径仅对新受管键 `workflow_mode` 改道插入，其它字段零变更。

### T9 — 自举收尾动作（裁定 L ②，D-BOOT）[REV-75-002 修订]
- **前置**：T2 / T5 交付并测试绿（本阶段 op 收尾执行）；先 `npm run build`（`node bin/openfeel.js` 走 dist，须反映新命令面）；命令统一 `node bin/openfeel.js` 口径（防 PATH 旧版污染）。
- **动作**（执行者：openfeel-executor）：
  `node bin/openfeel.js config set defaults.workflow_mode full --sync-stages --stage v1.1.7-stage-74 v1.1.7-stage-75 v1.1.7-stage-76 v1.1.7-stage-77`
  ——本仓 `config.yaml` 该键已在位（stage-74 落，同值幂等）；本动作是**唯一改写本仓真实 `.openfeel/plan/**/status.md` 的动作**（其余测试均在 fixture / 隔离 HOME）。
- **执行后核验（缺一不可）**：
  1. 74~77 四份 `status.md` 均含 `- **工作流模式**：full`，且**其余内容逐字保留**（diff 仅 +1 行/文件）；
  2. `node bin/openfeel.js config effective workflow_mode` → `full [status.md]`（当前阶段域 = stage-75；`config effective` 四键输出正常）；
  3. **[REV-75-010 修订]** `git status --porcelain` 相对 T9 **执行前快照零新增条目**（flow.json/bak 本已 `M`；`.openfeel/tmp/status.<stageId>.bak` 已被 gitignore）；`git diff .openfeel/flow.json` **结构增量 = 4 个 `stages.*.workflow_mode` + `meta.revision`（+1）+ `meta.updated`（时间戳），无其它变化**（`save()` 必然改写 meta 两项：`flow-manager.ts:531` / `:550`；原「flow.json 零变更」措辞作废——按字面执行会误判核验失败并错误阻塞阶段）；
  4. **重复执行同命令 → 全 noop、零写盘**（SHA256 不变）。
- 失败路径：任一核验不过 → 不进入归档；如实登记偏差（禁止手改 status.md 兜底）。

---

## 四、验收要点（阶段级）

1. 四条命令面（`plan stage add --workflow-mode` / `stage set --workflow-mode` / `flow mode` / `flow phases` 模式分节）行为与 §二 契约表逐条一致 [REV-75-001 修订]。
2. 插入语义（含锚点链与无锚点不写盘）、只读保证、同值 no-op、非法值不写盘均有 SHA256/diff 级断言。
3. 项目级记忆写入正确且**不覆盖**其它 `defaults` 键；**非 TTY 由既有守卫截断**（exitCode=1 + 零写盘，T39 保持）[REV-75-003 修订]。
4. op 骨架机械铺可用且**不引入 Agent 调用**。
5. `--sync-stages`：`--stage` 限定生效；`inserted` 命令层落地（不落 default 报错）；批量插入失败 `skipped-no-anchor` 且退出码 0；重复执行幂等 [REV-75-002/004/005 修订]。
6. **自举收尾（T9）四项核验全过**；本仓文件级变更 = 4 份 status.md 字段行（flow.json 内容另含 4 个冗余字段 + `meta.revision`/`meta.updated` 递增，见 §三 T9 核验 3）[REV-75-002 / REV-75-010 修订]。
7. 门禁全绿（含既有断言更新点：E-2② 键数 5→6 为**有意更新**，T39 / N5 保持）；既有输出零回归。

## 五、风险

| # | 风险 | 缓解 |
|:-:|------|------|
| R-75-1 | 插入语义误删/误改 status.md | 「先探测后写」+ `.bak` + 逐字保留断言 |
| R-75-2 | 记忆写入静默改用户配置 | 仅显式动作触发 + 增量写 + 提示输出 |
| R-75-3 | 冗余字段被当权威 | 不参与级联 + health 仅 warn + 文档声明 |
| R-75-4 | wizard 改版影响既有推进流 | TTY/非 TTY 双路径测试 + 既有用例零回归（**非 TTY 守卫与 T39 保持不动**；TTY 交互补 `vi.mock('@inquirer/prompts')` 模拟）[REV-75-003 修订] |
| R-75-5 | `flow phases` 模式解析成第二信源 / fast 仍出错表 | T3-附 与 `flow mode` 同源（`resolveStageWorkflowMode`）+ T7.11 解析链五场景 + T8 检索复核（src/ 零无参调用）[REV-75-001 修订] |
| R-75-6 | `--stage` 限定实现偏差（漏过滤 → 误写 done 阶段） | 前置已注册校验（fail-fast 零写盘）+ T7.7 用例 + T9 `git status` 清单核对 [REV-75-002 修订] |
| R-75-7 | 插入写函数误改既有替换语义 | 单一新函数 + T7.2 逐字保留断言 + `setStatusField`/`writeStatusField` 零改动复核 [REV-75-005 修订] |

> 说明：op 级拆分由 openfeel-schemer 定稿并落 `ops/deps.yaml`（**以 `ops/deps.yaml` 为准**）。定稿为 **4 op**（严格串行）：op-001（T1/T2 + 冗余写入点①②）→ op-002（T3/T3-附）→ op-003（T5 + 冗余写入点③ + health 第 10 项）→ op-004（T6/T4/T9/T8）。[REV-75-015 修订：原「建议 3-op」旧版作废]

## 六、修订记录

| 时间 | 修订人 | 说明 |
|------|--------|------|
| 2026-10-11 | openfeel-planner | 初稿：T1~T8 + 验收 5 条 + 风险 R-75-1~4；KB 检索 7 条；op 建议三分。 |
| 2026-10-11 | openfeel-planner | **REV-75 审查修订轮**（原判：不通过，4 blocking + 4 非阻塞；8 条全落实）：① REV-75-001 新增 **T3-附**（`flow phases` 模式分节：`--mode`/`--stage` 解析链 + `--json` 增 `workflowMode` + `transitionsDiff` 同模式 + 兼容性用例），§一 缺陷改写、§二 契约行、不变量 6、T7.11、T8 检索复核与既有断言更新点（E-2② 键数 5→6）；② REV-75-002 新增 **T9**（自举收尾动作 + 四项核验）、T5 增 `--stage <id...>` 限定（采纳限定方案）、T7.7 done 阶段与幂等用例；③ REV-75-003 T4/T7.6/不变量 2 改「既有守卫保持（exitCode=1，T39 不动）」+ TTY 模拟机制（`vi.mock('@inquirer/prompts')` + 纯函数决策）；④ REV-75-004 `src/commands/config.ts` 显式入范围/T5 + `deps.yaml` `produces_core` 补 `src/commands/config.ts`；⑤ REV-75-005 锚点链、`skipped-no-anchor` 批量结果码、新写函数约束（`setStatusField` 禁改）；⑥ REV-75-006 T3 裁定登记（来源复用不构成第二信源、`pickCascadeSource` 暂不抽取）；⑦ REV-75-007 行号基准 `6a2b04f`→`5607905` + 三处引用更正（含 `syncConfigFieldToStages` 3528-3561、`probeStatusField` 242-257 拆标）；⑧ REV-75-008 §二 补 T6 占位行（入口名方案期定稿）。**只改计划文档（plan/overview/status/deps），未改源码、未直写 flow.json。** |
| 2026-10-11 | openfeel-schemer | **方案审查修订轮（REV-75-009~014）之计划侧同步**：① [REV-75-010] §三 T9 核验 3（`:157`）+ §四.6 注：flow.json 内容增量 = 4 冗余字段 + `meta.revision`/`meta.updated`（`save()` 必然改写），porcelain 相对执行前快照零新增条目，「flow.json 零变更」作废；② [REV-75-011] T7.5 行（`:130`）改「3 可达源 + profile 阴性断言」；③ [REV-75-012] T3-附（`:93`）与 T7.11⑤（`:136`）改「除新增 2 行外其余逐字不变」。同步修订：ops/op-001~004 与 ops/deps.yaml（REV-75-009/010/011/012/013/014 逐条落实）、v1.1.7/deps.yaml `est_ops` 3→4（[REV-75-013]）。**只改方案/计划文档，未改源码、未直写 flow.json。** |
