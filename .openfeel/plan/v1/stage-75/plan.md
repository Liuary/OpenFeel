# v1.1.7-stage-75 计划 — 模式命令面与交互

- **阶段**：`v1.1.7-stage-75`
- **依赖**：**hard: `v1.1.7-stage-74`**（`workflow_mode` 配置键、四层级联、表选择访问器已就绪）
- **优先级**：P0（「人如何选模式 / 如何记住 / 如何查询」的唯一入口层）
- **制定人**：openfeel-planner ｜ **制定时间**：2026-10-11
- **定位**：把 stage-74 的引擎能力**暴露为命令面**——① 阶段创建时可指定模式（`plan stage add --workflow-mode`）；② 既有阶段可单阶段切换/切回（`stage set --workflow-mode`，含**缺失字段插入**）；③ 新增**只读**查询命令（`flow mode`：当前模式 + 来源）；④ wizard 首次**交互选型**并把选择写入**项目级记忆**（`config.yaml defaults.workflow_mode`）；⑤ `config set ... --sync-stages` 纳入新键；⑥ fast 下 **op 骨架机械铺**入口（全量骨架，不耗 Agent）。
- **范围**：`src/commands/plan.ts`、`src/commands/stage.ts`、`src/commands/flow.ts`、`src/commands/config.ts`（如涉值域提示）、`src/core/plan/stage.ts`、`src/core/flow-manager.ts`（`syncConfigFieldToStages` 插入语义 + 冗余字段写入）、`src/core/i18n-data/{zh-CN,en}.ts`；`test/commands/{plan,stage,flow,config}.test.ts`、`test/core/plan/stage.test.ts`、`test/core/flow-manager.test.ts`。
- **边界**：**不改**引擎语义（表选择 / 级联 / 默认值已在 stage-74 定稿）；不改 phase 枚举；不改 Agent 模板与 skills（stage-76）；**不新增顶层命令组**（`flow mode` 为既有 `flow` 组子命令）；`flow mode` **只读**（不写盘、不推进）；不破坏既有 `--json` 契约（只增字段）；不新增依赖；不直写 `flow.json`（冗余字段经 CLI 自身写入）。

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

## 一、背景与实测证据（行号以 HEAD `6a2b04f` 为准）

| 事实 | 位置 | 结论 |
|------|------|------|
| `plan stage add` 已有 `--exec-mode/--auto-advance`（值域派生 + exit 1 不建阶段） | `src/commands/plan.ts:26-59 / 86-95` | `--workflow-mode` 逐条仿制 |
| `ensureStageSkeleton()` 初值 = `overrides ?? resolveConfigDefaults`（幂等，已存在不覆盖） | `src/core/plan/stage.ts:141-190` | 骨架增「工作流模式」行 + `StageSkeletonOverrides` 扩键 |
| `stage set` 字段白名单 + `probeStatusField`（`not-found` → exit 1 不写盘） | `src/commands/stage.ts:357-430` | 新增 `--workflow-mode`；**存量阶段需「插入」语义**（裁定 H） |
| `syncConfigFieldToStages()`：字段缺失 → `skipped-no-field`；复用 `writeStatusField` + 按阶段锁；只读 flow.json | `core/flow-manager.ts:3447-3475` | `workflow_mode` 纳入 + 缺失插入扩展 |
| `flow` 命令组已有 `status/overview/current/metrics/phases/stage/advance/…/wizard` | `src/commands/flow.ts:36-2016` | `flow mode` 作为新子命令（**只读**）插于 `phases` 邻近位置 |
| `flow phases` 现有输出：阶段列表 + 流转映射 + `transitionsDiff` + `advanceAccepted` | `src/commands/flow.ts:384-437` | stage-74 已备 `mode` 形参访问器；本阶段补模式分节（如需） |
| wizard 非 TTY 守卫 + 交互创建/选择阶段 | `src/commands/flow.ts:1674-1780` | 模式首次选型接入点 |
| `flow.json` stage 结构：`{name, phase, status, deps, ops, stats}` | 实测 | 可选冗余字段 `workflow_mode`（不参与级联，裁定 G） |

---

## 二、目标语义（命令面契约）

| 命令 | 改前 | 改后 |
|------|------|------|
| `openfeel plan stage add <id> [--workflow-mode full\|fast]` | 无该选项 | 选项存在；非法值 → exit 1 **且不建阶段**；缺省 → `config.yaml defaults.workflow_mode`；骨架 status.md 含「**工作流模式**」行 |
| `openfeel stage set <id> --workflow-mode <v>` | 无该选项 | 设置/切换单阶段模式；**字段缺失 → 插入**（「自动推进」行后）；`.bak` 备份 + 同值 no-op；非法值 exit 1 不写盘 |
| `openfeel flow mode [--stage <id>] [--json]` | 命令不存在 | **新增只读**：当前模式 + 来源（四源枚举）+ 可选 `transitions`（当前模式表）；`--json` 稳定结构 |
| `openfeel config set defaults.workflow_mode <v> [--sync-stages]` | 键不存在 | 生效（stage-74 白名单）+ `--sync-stages` 批量写各阶段字段（含插入） |
| `openfeel config effective [workflow_mode]` | 三键 | 四键（stage-74 已就绪，本阶段仅验证 CLI 输出与登记） |
| wizard | 无模式选择 | 首次进入某阶段（无字段且项目未设值）时**TTY 询问一次**；选择写 `status.md` + `config.yaml`（记忆）；非 TTY → 默认 `fast`，**不阻塞** |

**不变量**：
1. `flow mode` **不写盘**（SHA256 断言：执行前后 `flow.json` / `config.yaml` / `status.md` 不变）。
2. 一切「写」均为**用户显式动作**（选项或 TTY 选择）；非 TTY 路径**静默使用默认**，不写记忆。
3. 记忆写入复用 `setConfigValue()`（`yaml.Document` 增量写、保注释）；**不覆盖**其它 `defaults` 键。
4. 既有 `--json` 契约**只增不改**（`flow phases` / `config effective` 字段语义不变）。
5. 冗余字段 `flow.json stages.{id}.workflow_mode` **不参与级联**；读取权威恒为 `status.md`/级联。

---

## 三、变更点清单（编号 T）

### T1 — `plan stage add --workflow-mode`（`src/commands/plan.ts` + `src/core/plan/stage.ts`）
- 选项声明 + 值域校验（`getConfigFieldLegalValues('workflow_mode')`，非法 → exit 1 **不建阶段**，复用 `stage.set.invalidValueTmpl` 口径）。
- `StageSkeletonOverrides` 扩 `workflowMode?`；`ensureStageSkeleton()` 初值 = `overrides?.workflowMode ?? configDefaults.workflow_mode`；status.md 骨架在「**自动推进**」行之后插入「- **工作流模式**：{v}」。
- **兼容**：既有调用方（`scheme.ts` 隐式注册路径）不传 override → 继承 config 默认（与 `--exec-mode` 同口径）。

### T2 — `stage set --workflow-mode`（`src/commands/stage.ts` + flow-manager 写侧）
- 字段白名单 job 追加（写入顺序：状态 → 执行模式 → 自动推进 → **工作流模式** → 当前责任 Agent）。
- **插入语义（裁定 H）**：`probeStatusField` 返回 `not-found` 时，若字段属**新受管键**（`workflow_mode`）→ 在「自动推进」行后**插入**该行（备份 `.bak` → 原子写），其余内容逐字保留；插入失败 → exit 1。
- 同值 no-op；非法值 exit 1 不写盘；多字段部分成功逐条报告（既有口径）。

### T3 — `flow mode` 只读命令（`src/commands/flow.ts`）
- `openfeel flow mode [--stage <id>] [--json]`：
  - 人类输出：`当前模式：fast  [来源: status.md]` +（可选）当前模式可达目标；
  - `--json`：`{ stage, mode, source, modes: { full: {...transitions}, fast: {...transitions} } }`（稳定结构；`source` 复用 `resolveEffectiveConfig` 枚举）。
- 经 `FlowManager` 只读访问器（`resolveStageWorkflowMode` / `getPipelineTransitions(mode)`）；**禁止**硬编码；返回副本。
- 非法 `--stage` → exit 1 + 建议名（复用 `validateStageId`/`suggestStageId` 口径）。
- 交叉引用：`flow advance --help` / `flow phases` 输出补指引「查看当前模式：`openfeel flow mode`」。

### T4 — wizard 首次选型与项目级记忆（`src/commands/flow.ts`）
- 触发条件：TTY + 选定 stage 的 `status.md` 无「工作流模式」字段 + 项目 `config.yaml` 未设 `defaults.workflow_mode`（= 首次）。
- 交互：`select`（`full` / `fast`，附一句定位说明）；选择后：写该 stage `status.md` 字段 + 写 `config.yaml defaults.workflow_mode`（**记忆**）+ 输出「已记忆：后续新阶段默认 {v}」。
- 非 TTY：跳过询问，按 builtin `fast` 继续（**不写盘**、不阻塞、不 exit 1）。
- 已设值：不再询问（幂等；如需改 → `stage set --workflow-mode`）。

### T5 — `--sync-stages` 与冗余字段（`src/core/flow-manager.ts`）
- `syncConfigFieldToStages()`：对 `workflow_mode` 复用插入语义（同 T2 单一实现，**禁止双实现**）；结果集扩 `inserted`；`skipped-no-field` 语义对**非受管键**保持。
- `flow.json stages.{id}.workflow_mode`（裁定 G，**可选冗余**）：在 `plan stage add`（初值）、`stage set --workflow-mode`、`--sync-stages` 三处**同步写入**；读取**不参与级联**；`flow health` 增一致性校验（不一致 → **warn**，不 fail）。

### T6 — op 骨架机械铺入口（裁定 I）
- fast（及 full）模式均需**全量骨架**：提供**显式** CLI 入口（如 `plan scheme create --from-tasks` 或 `plan stage add --ops-from-tasks`，方案期定稿），从**阶段任务表**机械生成 `ops/op-NNN.md` 骨架 + `ops/deps.yaml` 占位；**不调用任何 Agent**、不要求 schemer 在场。
- 默认**不做隐式副作用**（不自动在 `plan stage add` 时铺 op，见大计划 Q6）。

### T7 — i18n 与测试

| # | 用例 | 断言 |
|:-:|------|------|
| T7.1 | `--workflow-mode` 初值/非法 | `fast`/`full` 写入骨架；`bogus` → exit 1 且目录不存在；缺省 → config 默认 |
| T7.2 | 插入语义 | 旧版 status.md（仅两字段）→ 成功插入且其余内容**逐字保留**（diff 仅 1 行 + `.bak`） |
| T7.3 | 同值 no-op / 非法值不写盘 | SHA256 断言 |
| T7.4 | `flow mode` 只读 | 输出模式+来源正确；执行前后三文件 SHA256 不变；`--json` 结构稳定 |
| T7.5 | 四源来源标注 | fixture 四场景下 `source` 分别为 `status.md` / `config.yaml` / `profile.yaml` / `builtin` |
| T7.6 | wizard 交互 | TTY 模拟：首次询问 → 写两处 + 记忆提示；二次不询问；非 TTY → 不询问、不写盘、不 exit 1 |
| T7.7 | `--sync-stages` | 批量 updated/inserted/noop 分类正确；非法键仍 `skipped-no-field` |
| T7.8 | 冗余字段 | 三写入点同步；构造**不一致** fixture → `flow health` warn 且**不 fail**；无该字段的旧 flow.json 零报错 |
| T7.9 | 骨架机械铺 | 任务表 → `ops/op-NNN.md` + `ops/deps.yaml` 生成；**无 Agent 参与**（不产生 agent 调用/日志） |
| T7.10 | i18n | 新键双表成对 + 检索确认**无死键** + 新基线显式登记 |

> 全程隔离 HOME / fixture 项目；**严禁**改写本仓真实 `config.yaml` / `flow.json`。

### T8 — 门禁
`npm run build` ×2（幂等）→ `npm test`（0 skipped / 0 failed）→ `npx tsc --noEmit` = 0 → `lint i18n` 新基线登记 → `lint kb` = 0 → 既有 `--json` 契约回归（`flow phases` / `config effective` 字段逐字不变）。

---

## 四、验收要点（阶段级）

1. 三条命令面（`plan stage add --workflow-mode` / `stage set --workflow-mode` / `flow mode`）行为与 §二 契约表逐条一致。
2. 插入语义、只读保证、同值 no-op、非法值不写盘均有 SHA256/diff 级断言。
3. 项目级记忆写入正确且**不覆盖**其它 `defaults` 键；非 TTY 零写盘。
4. op 骨架机械铺可用且**不引入 Agent 调用**。
5. 门禁全绿；既有输出零回归。

## 五、风险

| # | 风险 | 缓解 |
|:-:|------|------|
| R-75-1 | 插入语义误删/误改 status.md | 「先探测后写」+ `.bak` + 逐字保留断言 |
| R-75-2 | 记忆写入静默改用户配置 | 仅显式动作触发 + 增量写 + 提示输出 |
| R-75-3 | 冗余字段被当权威 | 不参与级联 + health 仅 warn + 文档声明 |
| R-75-4 | wizard 改版影响既有推进流 | TTY/非 TTY 双路径测试 + 既有用例零回归 |

> 说明：op 级拆分（建议 op-001 T1/T2/T5、op-002 T3/T4、op-003 T6/T7/T8）由 openfeel-schemer 定稿并落 `ops/deps.yaml`。
