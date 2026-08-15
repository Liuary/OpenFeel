# Plan — stage-34: plan 目录多级化与路径统一

> **版本**：v1.0.0-stage-34
> **创建日期**：2026-08-15
> **Planner**：独立 Planner（推理模型 DeepSeek V4 Pro）
> **规模判定**：大规模（6 个 op、约 33 个文件变更、跨模块——init 管线 / plan 核心层 / flow-manager / 模板双层源 / skill 定义 / 测试断言）
> **来源**：用户调研发现 `openfeel init` 部署的 plan 目录仍为平铺，Feel 探查确认根因为「三处路径不一致」（init.ts / plan/stage.ts / flow-manager.ts 各写一套路径）

---

## 知识库参考

| 条目 | 路径 | 相关性 |
|------|------|--------|
| 计划目录按大版本系列分组模式 | kb/architecture.md #计划目录按大版本系列分组模式 | **高度相关**。v0.5.7 已确立 `plan/{series}/{stage}/` 多级结构，本 stage 是让三处代码路径对齐该设计 |
| Schemer 产出路径指向不存在的目录 | kb/troubleshooting.md #Schemer 产出路径指向不存在的目录 | **直接相关**。`stages/` vs `plan/` 不一致是已知历史坑，本 stage 正式收敛 |
| fast-glob 目录匹配需显式声明 onlyDirectories | kb/troubleshooting.md #fast-glob 目录匹配需显式声明 onlyDirectories | **必须遵循**。递归搜索 plan/ 下目录时须注意 onlyDirectories/尾部斜杠语义 |
| Git 重命名检测交叉匹配假象 | kb/troubleshooting.md #Git 重命名检测交叉匹配假象 | **必须遵循**。存量 stages/ 目录**不做批量 git mv**，避免交叉匹配误判 |
| WORKSPACE_DIRS 同步模式 | kb/patterns.md #WORKSPACE_DIRS 同步模式 | 参考。本 stage 不新增目录，structure.ts 无 WORKSPACE_DIRS 变更（仅 init.ts 注释修正） |
| 版本号重映射边界判定模式 | kb/patterns.md #版本号重映射边界判定模式 | **高度相关**。区分「目录名（组织单位）」与「stageId（权威标识）」的边界，是映射规则的核心依据 |
| 双层模板源发散 | kb/troubleshooting.md #双层模板源发散 | **必须遵循**。改双层模板须「按节锚点定点编辑、禁止整文件复制」，用 git diff 而非 PowerShell diff 验证 |
| 双语开发强制约束 | kb/patterns.md #双语开发强制约束 | 所有模板改动 zh-CN + en 同步，否则 build 一致性校验失败 |

---

## 背景与动机

用户在调研中发现：`openfeel init` 部署新项目时，plan 目录仍是**平铺**的一堆阶段（`plan/stage-01/`），而非 v0.5.7 已确立的「按大版本系列分组」多级目录。Feel 探查确认根因是**三处路径不一致**：

| 位置 | 现状 | 问题 |
|------|------|------|
| `src/core/init.ts:461` | `.openfeel/plan/stage-01/status.md` | init 示例阶段平铺 |
| `src/core/plan/stage.ts` + `scheme.ts` | `.openfeel/stages/{name}/` | `plan stage add` / `plan scheme create` 用 **stages/**（错误目录） |
| `src/core/flow-manager.ts:1380-1391`（findStatusPath） | 先 stages/ 再 plan/，均平铺 | 双路径回退，**不支持多级 plan/{series}/** |
| 设计目标（architecture.md） | `plan/v1/stage-XX/` | v0.5.7 确立的多级结构 |

佐证：`flow-manager.ts:2433-2444` 健康检查也是双路径回退；OpenFeel 自身 `.openfeel/stages/` 目录仍存有历史阶段（v0.4.6 ~ v1.0.0-stage-03），而当前活跃阶段（stage-29~33）在 `plan/v1/stage-{NN}/`，形成「新旧两套」并存。

**范围边界**：仅做「路径统一 + 多级化」。不合并 `plan stage add` 与 `stage create` 两个命令（冗余但属命令层重构，另立后续 stage）；不做存量目录物理迁移（避免 git mv 交叉匹配风险，见知识库）。

---

## 已确认决策（设计结论，不可更改）

### 决策 1：统一目标路径

阶段工作目录统一为 **`plan/{series}/{stage}/`** 多级结构，其中：
- `{series}` = 大版本系列 = **`v{MAJOR}`**（如 `v1`）
- `{stage}` = 阶段目录名 = **`stage-{NN}`**（不含版本前缀）

新项目首个系列 = `v1`（首个阶段部署到 `plan/v1/stage-01/`）。

### 决策 2：stage ID 三层映射规则

| 层 | 名称 | 示例 | 说明 |
|----|------|------|------|
| flow.json stageId | 权威标识（唯一键） | `v1.0.0-stage-34` | 全限定，含四级版本前缀 |
| CLI 可见 stage ID | 同 stageId | `v1.0.0-stage-34` | `stage status/set/create`、`flow advance --stage` 参数 |
| plan 目录 | `plan/{series}/stage-NN/` | `plan/v1/stage-34/` | 物理路径 |

**正向映射**（stageId → 目录，唯一权威工具 `src/core/plan/path.ts`）：
- stageId 格式 `{version}-stage-{NN}`，`{version}` = `vX.Y.Z.W`
- `series = '{version}'.split('.')[0]`（`v1.0.0`→`v1`，`v4`→`v4`）
- `stageDir = 'stage-' + NN`
- 兼容历史格式 `v4-stage-04`（version=`v4`→series=`v4`）
- 兼容短名 `stage-01`（无版本前缀）→ series 默认 `v1`（或从 flow.json `meta.version` 推断）

**反向映射**（目录 → stageId，供 `stage status` 列表）：目录名 `stage-33` 无法唯一还原版本前缀，须**回查 flow.json 的 stages 键**（匹配 `*-stage-33`）得到完整 stageId `v1.0.0-stage-33` 后展示。

### 决策 3：stages/ 目录处置

**废弃 stages/ 作为写入目标**（plan/stage.ts 与 plan/scheme.ts 不再写 stages/），**保留为只读兼容回退**（findStatusPath 最后一级兜底）：
- OpenFeel 自身历史 `.openfeel/stages/` **不迁移、不删除**，作为历史存档；
- 存量项目 status.md 仍在 stages/ 时，findStatusPath 兜底读取，保证不破坏。

### 决策 4：迁移/兼容策略

`findStatusPath` 改为**三级回退**：
1. `plan/{series}/stage-NN/status.md`（解析 stageId → 精确路径，首选）
2. `plan/**/stage-NN/status.md`（fast-glob 递归搜索，兼容 series 变化/旧平铺）
3. `stages/{stageId}/status.md`（历史遗留，只读兜底）

**不主动迁移存量数据**，仅统一「新写入路径 + 读取三级回退」，避免大规模文件移动风险。

### 决策 5：init 示例阶段

- 部署路径：`plan/v1/stage-01/status.md`（新项目 series 默认 v1）
- flow.json 注册：`v1.0.0-stage-01`（与权威 ID 格式一致）
- status.md 标题同步为 `v1.0.0-stage-01`

### 决策 6：CLI 参数兼容策略（`plan stage add` / `plan scheme create`）

接受**完整 stageId 为主，短名作别名**（与 path.ts 短名兼容逻辑一致）：
- 完整 stageId `v1.0.0-stage-01`：直接解析 series + stageDir；
- 短名别名 `stage-01`：series 默认 `v1`，stageDir = `stage-01`；
- 两者最终都注册完整 stageId `v1.0.0-stage-01` 到 flow.json；
- 文档中的短名示例（`plan stage add stage-01`）**保留不改**，仅确认语义一致。

---

## 工作阶段

### 概览

| op | 主题 | 变更目标 | 文件数 |
|----|------|----------|:--:|
| op-001 | 路径映射工具 | 新增 path.ts（stageId ↔ plan 目录双向映射唯一权威） | 2 |
| op-002 | flow-manager 读取统一 | findStatusPath 三级回退 + 健康检查同步（含死代码清理） | 2 |
| op-003 | plan 核心层写入迁移 | stage.ts/scheme.ts 从 stages/ 改写 plan/{series}/ | 5 |
| op-004 | 命令层 + init 统一 | commands/stage.ts 映射 + init 示例阶段多级化 | 3 |
| op-005 | 模板与 skill 文案统一 | 双层模板源 + skill 定义 + 部署实例路径引用（双语） | ~20 |
| op-006 | 文档与全量回归 | docs 两文件逐行修正 + build/test 收尾 | 2 |

### op-001：路径映射工具（新增 path.ts）

> **目标**：建立 stageId ↔ plan 目录双向映射的唯一权威工具，消除各处硬编码路径。
> **前置依赖**：无
> **规模**：2 文件（1 新增源码 + 1 新增测试）

| # | 任务 | 描述 | 涉及文件 |
|---|------|------|----------|
| 1 | 路径工具 | 新建 `src/core/plan/path.ts`，导出：`parseStageId(stageId): { series, stageDir }`（决策 2 正向映射，含历史格式与短名兼容）、`stageIdToPlanDir(stageId): string`、`planDirToStageId(projectPath, stageDir): string \| null`（回查 flow.json 反向映射）、`findStageStatusPath(projectPath, stageId): string \| null`（三级回退，供 flow-manager 与命令层复用） | NEW `src/core/plan/path.ts` |
| 2 | 单元测试 | 覆盖：`v1.0.0-stage-34`→`plan/v1/stage-34/`、`v4-stage-04`→`plan/v4/stage-04/`、`stage-01`（短名）→`plan/v1/stage-01/`、反向映射回查、三级回退优先级 | NEW `test/core/plan/path.test.ts` |

> **验证**：`npm test`（新增 path.test.ts 断言通过）。
> **注意**：path.ts 引用 fast-glob 递归搜索时遵循 troubleshooting #fast-glob onlyDirectories。

### op-002：flow-manager 读取路径统一

> **目标**：findStatusPath 改为三级回退（plan/{series}/ 精确 → plan 递归 → stages 兜底），健康检查三处同步。
> **前置依赖**：op-001（hard，复用 path.ts 的 findStageStatusPath）
> **规模**：2 文件

| # | 任务 | 描述 | 涉及文件 |
|---|------|------|----------|
| 1 | findStatusPath 重构 | 1380-1391 行的私有方法改为委托 `findStageStatusPath`（或内联三级回退），消除「stages 优先、plan 平铺回退」 | `src/core/flow-manager.ts` |
| 2 | checkCrossFileConsistency 同步 | 2426-2475 行：改为遍历 flow.json stages 键，用 path.ts 解析目录后检查 `plan/{series}/{stage}/status.md`，stages/ 仅作兜底 | `src/core/flow-manager.ts` |
| 3 | checkZombieStates 死代码清理 | 删除 flow-manager.ts:2484-2485 行未使用的 planDir/stagesDir 死代码（该方法不涉及 status.md 路径读取，无需接入 path.ts） | `src/core/flow-manager.ts` |
| 4 | 测试断言更新 | findStatusPath 相关测试（flow-manager.test.ts:1675 附近）从「stages 优先」改为「plan/{series}/ 优先」；deps.yaml 测试（2099-2109）确认 plan/ 路径不变 | `test/core/flow-manager.test.ts` |

> **验证**：`npm test`（flow-manager.test.ts 通过）。checkDepsYaml（2568 行）路径 `.openfeel/plan/deps.yaml` 本身正确（deps.yaml 在 plan/ 顶层），无需改，但需在审查中确认。

### op-003：plan 核心层写入迁移（stage.ts + scheme.ts）

> **目标**：`plan stage add` / `plan scheme create` 从 `.openfeel/stages/` 改写 `.openfeel/plan/{series}/`。
> **前置依赖**：op-001（hard，复用 stageIdToPlanDir）
> **规模**：5 文件

| # | 任务 | 描述 | 涉及文件 |
|---|------|------|----------|
| 1 | addStage/listStages 迁移 | `stage.ts` 中 `.openfeel/stages` 改为 `plan/{series}/`（series 从 stageId 解析，短名默认 v1）；Stage.path 字段返回值同步 | `src/core/plan/stage.ts` |
| 2 | createScheme/getScheme/listSchemes 迁移 | `scheme.ts` 中 `.openfeel/stages/{stage}/ops/` 改为 `plan/{series}/{stage}/ops/`；filePath 返回值同步 | `src/core/plan/scheme.ts` |
| 3 | 命令参数兼容 | `plan stage add <name>` / `plan scheme create <stage> <title>` 参数接受完整 stageId（`v1.0.0-stage-01`）或短名别名（`stage-01`，series 默认 v1），内部用 path.ts 解析；帮助文本与 i18n 同步说明两种形式 | `src/commands/plan.ts` |
| 4 | 测试断言更新 | stage.test.ts / scheme.test.ts / plan.test.ts 中 `.openfeel/stages/` 断言改为 `.openfeel/plan/v1/`；scheme.test.ts:224 测试描述文本 `stages 目录不存在时` 同步改为 `plan 目录不存在时` | `test/core/plan/stage.test.ts`、`test/core/plan/scheme.test.ts`、`test/commands/plan.test.ts` |

> **验证**：`npm test`（三个测试文件路径断言更新后通过）。

### op-004：命令层 + init 路径统一

> **目标**：`stage status/set/task` 的 stageId→目录映射修正；init 示例阶段多级化。
> **前置依赖**：op-001（hard）；op-002（soft，findStatusPath 定版后语义对齐）
> **规模**：3 文件

| # | 任务 | 描述 | 涉及文件 |
|---|------|------|----------|
| 1 | resolveStatusPath 映射修正 | `commands/stage.ts:38-57` 现在按 `**/{stageId}/status.md` 搜索，但 stageId `v1.0.0-stage-33` 对应目录 `stage-33` 匹配失败。改为用 path.ts 解析出 `stage-NN` 后再搜索 `**/stage-NN/status.md` | `src/commands/stage.ts` |
| 2 | listAllStages 反向映射 | `commands/stage.ts:111-147` 提取 stageId 从目录名 `stage-33` 改为回查 flow.json 得到完整 `v1.0.0-stage-33` | `src/commands/stage.ts` |
| 3 | init 示例阶段多级化 | `init.ts:457-461` 部署路径 `plan/stage-01/status.md` → `plan/v1/stage-01/status.md`；`init.ts:473` 注册 `stage-01` → `v1.0.0-stage-01`；status.md 标题同步；`init.ts:262` 注释「含 plan/, stages/」修正为「含 plan/」 | `src/core/init.ts` |
| 4 | init 测试断言新增 | init.test.ts **新增断言**：init 后存在 `plan/v1/stage-01/status.md` + flow.json 注册 `v1.0.0-stage-01` | `test/core/init.test.ts` |

> **验证**：`npm test`（init.test.ts + stage 命令冒烟）。i18n 键 `status.noStages` 文本「.openfeel/plan/ 中无 status.md」仍准确（plan/ 目录本身未变），无需改。

### op-005：模板源与部署实例路径引用统一（双语）

> **目标**：Agent 模板与 skill 定义中残留的 `stages/` 或平铺 `plan/{stage}/` 引用统一为 `plan/{series}/{stage}/`。
> **前置依赖**：op-002/003/004（soft，路径约定定版后对齐文案，无文件重叠）
> **规模**：约 20 文件（双层模板源各双语 + skill 定义 + 部署实例）
> **双语**：zh-CN + en 同步；⚠️ 按 troubleshooting #双层模板源发散「按节锚点定点编辑、禁止整文件复制」

| # | 任务 | 描述 | 涉及文件 |
|---|------|------|----------|
| 1 | feel.md 模板 | `.openfeel/plan/{stage}/ops/` → `.openfeel/plan/{series}/{stage}/ops/`（update 路径 AGENT_TEMPLATES + init 路径 OPENCODE_AGENT_TEMPLATES 双层） | `templates-data/agents/{zh-CN,en}/feel.md`、`templates-data/opencode/agents/{zh-CN,en}/feel.md` |
| 2 | planner.md 模板 | `.openfeel/plan/{stage}/plan.md`、`plan/{stage}/`、产出格式 `stages/{stage}/` 统一为多级路径（双层） | `templates-data/agents/{zh-CN,en}/planner.md`、`templates-data/opencode/agents/{zh-CN,en}/planner.md` |
| 3 | archiver.md 模板 | 归档内容表 `.openfeel/stages/{stage}/ops/` → `.openfeel/plan/{series}/{stage}/ops/`（双层） | `templates-data/agents/{zh-CN,en}/archiver.md`、`templates-data/opencode/agents/{zh-CN,en}/archiver.md` |
| 4 | skill 定义 | get-stage-status / update-stage-status 中 `.openfeel/plan/{stage}/status.md` → `.openfeel/plan/{series}/{stage}/status.md`，并补「stageId→目录」解析说明（init 路径 opencode/skills 源 + update 路径由 build 注入） | `templates-data/opencode/skills/get-stage-status/SKILL.md`、`templates-data/opencode/skills/update-stage-status/SKILL.md` |
| 5 | core 指令排查 | core-instructions/opencode/instructions 中 `.openfeel/plan/` 引用多为通用目录（自检清单/计划目录节），需排查是否含 stage 级子路径，若有则同步多级化 | `templates-data/core-instructions/{zh-CN,en}.md`、`templates-data/opencode/instructions/{zh-CN,en}.md` |
| 6 | 部署实例同步 | 将上述改动同步到 `.opencode/` 部署产物（与 zh-CN 模板源逐字符一致） | `.opencode/agents/{feel,planner,archiver}.md`、`.opencode/skills/{get-stage-status,update-stage-status}/SKILL.md`、`.opencode/instructions/core.md` |
| 7 | 构建产物重生成 | `npm run build` 重生成 template-loader.ts（AGENT/OPENCODE_AGENT/SKILL 块）与 update.ts（SKILL_DEFINITIONS 块），不手动编辑 AUTO-GENERATED 段 | `src/core/template-loader.ts`、`src/core/update.ts`（构建产物） |

> **验证**：`npm run build`（模板注入 + 一致性校验 validateAgentDefinitions / validateOpencodeTemplates / validateOpencodeSkillTemplates 通过）+ 用 `git diff --no-index` 核对双层一致性。
> **注意**：schemer.md / executor.md / reviewer.md 经排查无 stage 级路径引用（仅「work stages」概念词），不纳入本 op；Schemer 实施时须复核确认。

### op-006：文档同步 + 全量回归

> **目标**：docs 两文件逐行修正 + 全量回归收尾。
> **前置依赖**：op-003/004（hard，文档反映其输出）；op-005（soft）
> **规模**：2 文件 + 回归验证

| # | 任务 | 描述 | 涉及文件 |
|---|------|------|----------|
| 1 | commands.md 逐行修正 | docs/commands.md 中所有 `stages/` 路径引用**逐行确认并修改**：Line 46（目录结构图 `stages/` 行 → 移除或改 `plan/`）、Line 182（`创建 stages/stage-01/ 目录` → `创建 plan/v1/stage-01/ 目录`）、Line 195-196（`plan stage list` 示例 `.openfeel/stages/stage-01/` → `.openfeel/plan/v1/stage-01/`）、Line 218（`在 stages/stage-01/ops/ 下创建` → `在 plan/v1/stage-01/ops/ 下创建`）；参数示例行（174/179/209/215 短名 `stage-01`）按 REV-002 决策**保留不改** | `docs/commands.md` |
| 2 | GETTING_STARTED.md 确认 | docs/GETTING_STARTED.md 短名示例（Line 71 `plan stage add stage-01`、Line 74 `plan scheme create stage-01`）**示例保留，仅确认无需改**（短名别名合法）；⚠️ 注意 GBK 编码，若需改动须保留原编码 | `docs/GETTING_STARTED.md` |
| 3 | 全量回归 | `npm run build && npm test` 全量通过，确认无遗留 `.openfeel/stages` 写入路径（grep 全量扫描 src/ 断言） | — |

> **验证**：`npm run build && npm test`（全量无回归）。

---

## 约束与设计决策

| # | 约束 | 处理方式 |
|---|------|----------|
| 1 | 路径唯一权威 | 所有 stageId↔目录映射收敛到 path.ts，禁止各处硬编码 split/resolve 路径 |
| 2 | 模板部署三层结构 | 改 Agent/约束模板须改 templates-data 源（agents + opencode/agents 双层），否则 init/update 拿不到改动 |
| 3 | 双语硬性约束 | 模板改动 zh-CN + en 同步，否则 build 一致性校验失败 |
| 4 | 双层模板源发散规避 | 按节锚点定点编辑、禁止整文件复制；用 `git diff --no-index` 验证（非 PowerShell diff） |
| 5 | 存量数据不迁移 | stages/ 保留只读兜底，不做批量 git mv（规避 Git 重命名交叉匹配假象） |
| 6 | stageId 权威性 | flow.json stageId 是唯一权威标识，目录名是派生组织单位；反向映射须回查 flow.json |
| 7 | 不合并命令 | `plan stage add` 与 `stage create` 冗余不属本 stage，仅统一路径与 ID 处理 |
| 8 | 版本号待定 | 本 stage 发布版本号（1.0.8 → 1.0.9?）发布前由 Feel 与用户确认，不在计划中确定 |
| 9 | flow.json 不直写 | Planner 不直接操作 flow.json，推进由 Feel 执行 |

---

## 测试策略

| 验证点 | op | 方式 |
|--------|----|------|
| 路径映射正确性 | op-001 | path.test.ts 单元测试（正向/反向/历史格式/短名/三级回退） |
| findStatusPath 回退 | op-002 | flow-manager.test.ts 更新断言 |
| 写入路径迁移 | op-003 | stage/scheme/plan 三测试文件路径断言更新 |
| init 多级化 | op-004 | init.test.ts 断言 `plan/v1/stage-01/status.md` + flow.json 注册 `v1.0.0-stage-01` |
| 模板一致性 | op-005 | `npm run build` 三类一致性校验 + git diff 双层核对 |
| 全量回归 | op-006 | `npm run build && npm test`（现有 407 测试 + 新增 path 测试） |

> **关键确认**：现有测试硬编码 `.openfeel/stages/` 的断言集中在 stage.test.ts / scheme.test.ts / plan.test.ts / flow-manager.test.ts 四处，属「路径断言更新」；init.test.ts 属「测试断言新增」（补 `plan/v1/stage-01/status.md` 存在性 + flow.json 注册 `v1.0.0-stage-01`），均已在各 op 任务中覆盖，无遗漏。

---

## 执行顺序

```
op-001 (path.ts)          [无依赖 — 先导工具]
op-002 (flow-manager)     [hard 依赖 op-001]
op-003 (stage.ts/scheme.ts) [hard 依赖 op-001]
op-004 (commands/stage + init) [hard 依赖 op-001, soft 依赖 op-002]
op-005 (模板 + skill 文案) [soft 依赖 op-002/003/004 — 路径约定定版后对齐]
op-006 (文档 + 回归)       [hard 依赖 op-003/004, soft 依赖 op-005]
```

建议执行批次：
- **批次 1**：op-001（唯一先导，产出共享工具）
- **批次 2**（可并行）：op-002、op-003、op-004（文件冲突域互不相交，均 hard 依赖 op-001）
- **批次 3**：op-005（soft 依赖 op-002/003/004，路径约定定版后对齐文案）
- **批次 4**：op-006（文档 + 全量回归收尾）

> 文件冲突域分析：
> - op-002（flow-manager.ts + flow-manager.test.ts）、op-003（plan/stage.ts + plan/scheme.ts + 三测试）、op-004（commands/stage.ts + init.ts + init.test.ts）互不重叠 → 可并行
> - op-005（templates-data + .opencode 部署实例）与 op-002/003/004 无文件重叠，但语义上依赖路径约定定版
> - op-006（docs/commands.md）独立，但依赖 op-003/004 的输出稳定

---

## 预期产出

| 产出 | 路径 |
|------|------|
| 计划文档 | `.openfeel/plan/v1/stage-34/plan.md`（本文件） |
| 依赖声明 | `.openfeel/plan/v1/stage-34/deps.yaml` |
| 操作方案 | `.openfeel/plan/v1/stage-34/ops/op-{001..006}.md`（由 Schemer 细化） |
| 路径工具 | `src/core/plan/path.ts`（新增）+ `test/core/plan/path.test.ts`（新增） |
| flow-manager | `src/core/flow-manager.ts` + `test/core/flow-manager.test.ts` |
| plan 核心层 | `src/core/plan/stage.ts` + `src/core/plan/scheme.ts` + `src/commands/plan.ts` |
| 命令层 + init | `src/commands/stage.ts` + `src/core/init.ts` + `test/core/init.test.ts` |
| 模板与 skill | `templates-data/agents/{zh-CN,en}/{feel,planner,archiver}.md` + `templates-data/opencode/agents/{zh-CN,en}/{feel,planner,archiver}.md` + `templates-data/opencode/skills/{get-stage-status,update-stage-status}/SKILL.md` + `.opencode/` 部署实例 |
| 文档 | `docs/commands.md` + `docs/GETTING_STARTED.md` |

---

## 遗留风险

1. **反向映射歧义**：目录名 `stage-NN` 无法唯一还原版本前缀，须回查 flow.json 匹配 `*-stage-NN`。若同一 stage-NN 在多版本前缀重复出现（理论上不应发生），需约定「取当前 pipeline.current 或最新版本」——Schemer 须在 path.ts 中明确去歧义规则。
2. **双层模板源发散**：feel.md / core.md 两层已存在历史发散（stage-33 遗留），op-005 改这些文件须严格按节锚点编辑，避免整文件复制放大既有发散；验证须用 `git diff --no-index`。
3. **findStatusPath 性能**：三级回退引入 fast-glob 递归搜索（第 2 级），flow status 高频调用场景需注意性能；Schemer 须评估是否缓存或限制搜索深度，避免大 plan/ 目录下明显变慢。
4. **`plan stage add` 参数兼容**：已决策「完整 stageId 为主、短名作别名（series 默认 v1）」，短名示例保留不改；仍需在帮助文本/i18n 明确两种形式，并注意 GETTING_STARTED quickstart 的 `flow advance --stage stage-01`（Line 83）与 init 注册的 `v1.0.0-stage-01` 潜在不一致，Schemer 须确认是否需同步 quickstart 示例。
5. **init 示例 stage 的版本前缀**：`v1.0.0-stage-01` 硬编码进 init 管线，未来框架版本升级时该示例版本是否跟随需明确（建议标注为「示例阶段，版本前缀仅为演示，随 config.ts 版本常量联动」——Schemer 评估是否抽为常量）。
6. **i18n 键是否新增**：`plan stage add` 参数兼容（完整 stageId + 短名别名）可能需新增/修改 i18n 帮助文本键，须 zh-CN + en 对称，`npm run build` 的 i18n 对称校验会捕获遗漏。
