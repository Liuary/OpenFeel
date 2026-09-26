# v1.1.1-stage-01 计划：全局化彻底化改造

- **stageId**：`v1.1.1-stage-01`
- **series**：`v1`
- **版本目标**：v1.1.1（全局化彻底化 + 约束/操作分离）

---

## 一、背景与已确认裁定

### 背景

v1.1.0 已完成 agent/skill/core.md 的全局部署（stage-37），但约束文件边界仍不清：

1. **项目级 init 仍部署 AGENTS.md**（`agents-md` 模板，含大量框架约束），与「框架约束应全局化」目标矛盾。
2. **core.md（工作区操作规范）与 AGENTS.md（行为约束）分离**，两者内容有重叠（如「用户身份/路径自校验」「流水线推进」「工具使用规范」散落两处），且 core.md 走 `instructions` 显式加载、AGENTS.md 走约定自动加载，双轨并存。
3. 本次做「全局化彻底化」：所有约束统一到**全局 AGENTS.md**，操作类提示词拆成**按需加载 skill**，项目级不再部署任何约束/agent/skill。

### 已确认裁定（8 条，不可推翻）

1. **移除 core.md，统一到全局 AGENTS.md**：`~/.config/opencode/AGENTS.md` 承载所有约束；core.md 内容（.openfeel/ 工作区操作规范）合并进 AGENTS.md 或拆到 skill。
2. **项目特有约束「可选化」但仍在 AGENTS.md**：版本管理/模块手册等项目特有约束不删除，仍放 AGENTS.md，但用声明语气标注「以下约束可根据项目情况由 Agent 自行裁定是否适用」——不强制。
3. **通用操作类提示词拆成 skill**：会话启动自检的操作步骤、Agent 工具使用规范等「操作类」内容，拆成可加载 skill（按需加载），不常驻 AGENTS.md。（REV-1901 修订：删除「.openfeel/ 目录结构」——目录结构本身属约束，见第 4 条）
4. **关键分界——目录结构语义 vs 操作细节**（REV-1901 修订，新增基准）：`.openfeel/` 目录结构本身（结构语义、公共/私域分区、用户身份约束、路径自校验规则）→ 约束 → 全局 AGENTS.md；操作细节（mkdir 哪些目录、创建哪些空文件、读 .info.json 取用户名等「怎么做」）→ skill。
5. **项目级不再部署约束/agent/skill**：不建项目 AGENTS.md、不建 .opencode/instructions/core.md、不放默认 agent/skill——收归全局。
6. **新增 `openfeel setup` 命令**：部署全局配置（AGENTS.md + agent + skill），不建立项目级 .openfeel/。
7. **`openfeel init` 拆掉全局部署**：只做项目初始化（.openfeel/ 工作区 + 项目 opencode.jsonc）。
8. **feel 空白项目自动搭建 .openfeel/**：feel 在空白项目（无 .openfeel/）启动时自动搭建完整工作区（目录 + config.yaml + flow.json + .info.json + dev/kb），不建 AGENTS.md；非 feel agent 不触发。（REV-1902 修订）实现路径：新增非交互轻量子命令 `openfeel init --workspace-only --non-interactive`，复用 init 既有 createWorkspace/writeDefaultConfig/FlowManager.initFlow 等工作区创建函数；feel.md 只需写「检测无 .openfeel/ 时运行 `openfeel init --workspace-only`」一句。

---

## 二、技术调研结论（第 4 节 4 点）

### 1. opencode 全局 AGENTS.md 加载机制

- KB 已实测（architecture.md #全局部署架构 op-000 实测表）：「**项目** AGENTS.md 自动加载」= **YES**（项目 opencode.jsonc 为 `{}` 时仍加载）。
- 「**全局** `~/.config/opencode/AGENTS.md` 自动加载」**未被实测**，是本次改造的核心前提假设，须 op-000 实测（隔离 HOME + 指令型探针，复用 stage-37 op-000 方法论）。
- 与全局 opencode.jsonc `instructions` 的关系：`instructions` 是显式加载（拼接+去重，`mergeConfigConcatArrays`），AGENTS.md 是约定自动加载，二者可并存。本次要**移除 core.md 的 instructions 引用**，改由全局 AGENTS.md 承载约束。
- **分叉预案**：若实测全局 AGENTS.md **自动加载** → 全局 opencode.jsonc 移除 `instructions`（或仅保留框架 agent 模型字段）；若**不自动加载** → 全局 opencode.jsonc 的 `instructions` 改为引用全局 AGENTS.md 绝对路径（复用现有 P2 机制，`getGlobalAgentsMdPath()`）。

### 2. core.md 内容拆分分类（约束类 vs 操作类）

| core.md 章节 | 归类 | 去向 |
|---|---|---|
| 设计原则（公共域/私域分区） | 约束 | 全局 AGENTS.md |
| 会话启动自检的操作步骤（mkdir 哪些目录、创建哪些空文件、读 .info.json 取用户名等「怎么做」） | 操作 | skill `openfeel-workspace`（REV-1901 修订：收窄为仅操作步骤） |
| Agent 工具使用规范（todowrite/question/task/skill 4 工具 + 优先级表） | 操作 | skill `openfeel-tool-usage` |
| 用户身份（.info.json）+ 路径自校验 | 约束（数据完整性） | 全局 AGENTS.md |
| 公共域各目录（dev/log/code_review/bugs/plan/tmp/kb）职责语义 + 写入规范 | 约束 | 全局 AGENTS.md |
| 计划目录「流水线推进」（flow 命令枚举 + phase 枚举） | 操作 | 复用现有 `openfeel-wizard`/`openfeel-health`，不新增 |
| 知识库「自动写入机制」流程 | 操作 | 复用现有 `openfeel-check-kb`，不新增 |
| 私域各目录（dev_last.md 模板 / note / log / code_review / bugs / tmp） | 约束 | 全局 AGENTS.md |
| 审查/追踪生命周期（状态流转模型） | 约束 | 全局 AGENTS.md |

结论：**约 70% 为约束（并入全局 AGENTS.md），约 30% 为操作（拆 skill 或复用现有 skill）**。

### 3. skill 拆分粒度

- 现有 14 个 skill 已覆盖大部分操作类内容（阶段状态、知识库、恢复、向导、Bug 等），**仅有 2 块无覆盖**：
  1. `openfeel-workspace`（新增）：仅「会话启动自检的操作步骤」（mkdir 哪些目录、创建哪些空文件、读 .info.json 取用户名等「怎么做」）；目录结构语义、公共/私域分区、用户身份约束、路径自校验规则保留在全局 AGENTS.md。（REV-1901 修订：范围收窄）
  2. `openfeel-tool-usage`（新增）：Agent 工具使用规范（4 工具准则 + 优先级表）。
- **已裁定**（REV-1903 修订）：`openfeel-tool-usage` **独立成 skill**，不并入 `openfeel-workspace`，工具使用规范不视为「约束」留在 AGENTS.md。
- 命名遵循现有 `openfeel-` 前缀约定（patterns.md #命名前缀统一）。

### 4. setup / update / init 职责

| 命令 | 现状（v1.1.0 后） | 目标（v1.1.1） |
|---|---|---|
| `init` | 项目初始化 + deployOpencode（全局 agent/skill/core.md + 项目 AGENTS.md + opencode.jsonc） | **只做项目初始化**（.openfeel/ 工作区 + 项目 opencode.jsonc），完全拆掉全局部署与项目 AGENTS.md |
| `setup` | 不存在 | **新增**：纯全局部署（全局 AGENTS.md + 9 agent + N skill + 全局 opencode.jsonc），不建立项目 .openfeel/，幂等（已存在不覆盖） |
| `update` | 全局部署（agent/skill/core.md）+ 项目 AGENTS.md + 项目 opencode.jsonc | **职责收敛**：全局资产增量更新（core.md → 全局 AGENTS.md）+ 项目 opencode.jsonc 更新；**拆除项目 AGENTS.md 部署逻辑** |

- setup 与 update 关系：setup = 首次全量部署（复用 `deployGlobalAsset`，幂等）；update = 增量升级（含 hash 追踪三态 + 控制区标记）。二者共用 `deployGlobalAsset`（stage-39 已抽取），不重复实现。
- **已裁定**（REV-1903 修订）：update **保留全局资产增量更新，仅拆项目 AGENTS.md 部署**（存量全局资产无升级通道，故不彻底拆全局部署）。

---

## 三、op 级任务清单

### op-000 技术调研实测（全局 AGENTS.md 加载机制）

- **任务**：用隔离 HOME + 指令型探针（复用 stage-37 op-000 方法论），实测 `~/.config/opencode/AGENTS.md` 是否被 opencode 自动加载；实测移除 core.md instructions 引用后约束是否仍生效；确认全局 AGENTS.md 与项目 AGENTS.md 并存时的优先级。
- **涉及文件**：0 个源码变更 + 1 个调研文档 `.openfeel/plan/v1/stage-01/op-000-findings.md`。
- **完成标准**：产出加载机制结论（自动加载 / 需 instructions 引用），作为 op-001/op-003 的分叉依据；**测出全局+项目 AGENTS.md 并存的合并语义（拼接/覆盖/节级）**，作为第五节兼容性策略的前提（REV-1904 修订）；`op-000-findings.md` 落盘。

### op-001 模板重构（core.md → 全局 AGENTS.md 模板 + 拆 skill）

- **任务**：
  1. 改造 `agents-md` 模板为「全局 AGENTS.md」：合并 core.md 约束类内容，移除 `{项目名称}` 占位符，新增「项目特有约束可选化」声明节（裁定 #2）。（REV-1912 修订）模板 L78 的 `~/.config/opencode/openfeel/core.md` 引用改为指向 `openfeel-tool-usage` skill。
  2. 删除/停用 `templates-data/opencode/instructions/{zh-CN,en}.md`（core.md 源）。
  3. 新增 skill 模板 `openfeel-workspace`（仅「会话启动自检的操作步骤」）、`openfeel-tool-usage`。
  4. 改造 build.js：AGENTS.md 注入、新 skill 注入、移除 instructions 注入、更新单源一致性断言（`validateSingleSourceConsistency`）。（REV-1907 修订）具体：build.js 步骤 8 移除 core.md 生成（`.opencode/instructions/core.md` 不再作为自举生成物）、删除 `.opencode/instructions/core.md`、移除 instructions 双源断言对（`CORE_INSTRUCTIONS_TEMPLATES ≡ OPENCODE_CONFIG_TEMPLATES[*].instructions`）、补充仓库自举过渡说明（.opencode/ 不再含 instructions/core.md）。
- **涉及文件**：`src/core/templates-data/agents-md/{zh-CN,en}.md`（改造）、`src/core/templates-data/opencode/instructions/{zh-CN,en}.md`（删）、`src/core/templates-data/opencode/skills/openfeel-workspace/SKILL.md`（新）、`src/core/templates-data/opencode/skills/openfeel-tool-usage/SKILL.md`（新）、`build.js`、`src/core/template-loader.ts`（生成段）。（REV-1909 修订：路径补 `src/core/` 前缀）
- **完成标准**：`npm run build` 通过；单源一致性断言与模板校验全绿；全局 AGENTS.md 模板含约束类 + 可选声明节；新 skill 可被 `listOpencodeSkillNames` 枚举。

### op-002 新增 setup 命令 + init 拆全局部署

- **任务**：
  1. 新增 `openfeel setup [--lang]`：部署全局 AGENTS.md + 9 agent + N skill + 全局 opencode.jsonc（复用 `deployGlobalAsset` + 全局锁 + 原子写，幂等）。
  2. `init.ts` 移除 `deployOpencode` 调用、移除 `promptOpencodeDeploy`、移除项目 AGENTS.md 部署（第 8 步）；`init` 仅保留 .openfeel/ 工作区 + 项目 opencode.jsonc。（REV-1905 修订）项目 opencode.jsonc 部署从 `deployOpencode` 抽出到 `initProject` 直接调用 `buildProjectOpencodeJsoncObj()`。
  3. `global-paths.ts` 新增 `getGlobalAgentsMdPath()`。
  4. `init.ts` 新增非交互轻量子命令 `openfeel init --workspace-only --non-interactive`：复用 createWorkspace/writeDefaultConfig/FlowManager.initFlow 等工作区创建函数，供 feel 空白项目自动搭建调用（REV-1902 修订）。
- **涉及文件**：`src/core/setup.ts`（新）、`src/commands/setup.ts`（新）、`src/core/init.ts`、`src/commands/init.ts`、`src/cli/index.ts`（注册 setup）、`src/core/global-paths.ts`。
- **完成标准**：`openfeel setup` 纯全局部署且不建项目 .openfeel/；`openfeel init` 不再部署任何 agent/skill/core.md/AGENTS.md；`openfeel init --workspace-only --non-interactive` 仅创建工作区（不建 AGENTS.md/opencode.jsonc）。

### op-003 update 职责收敛 + opencode-config 调整

- **任务**：
  1. `update.ts` 移除项目 AGENTS.md 部署逻辑（`agentsMdPath` 相关分支 + `AgentsMdLangConflictError` 相关路径），core.md 部署改为全局 AGENTS.md（`deployGlobalAsset(getGlobalAgentsMdPath(), ...)`）。
  2. `opencode-config.ts`：`buildGlobalOpencodeFrameworkObj()` 按 op-000 结论调整 `instructions`（移除或改指全局 AGENTS.md 绝对路径）。
  3. 更新 `getIncomingContent`（core.md → 全局 AGENTS.md 路由）。
  4. 存量全局 update_state.json 含 core.md key：迁移到全局 AGENTS.md key（复用 `remapLegacyKey`，新增 core.md → 全局 AGENTS.md 映射）（REV-1910 修订：state key remap 归属 op-003，非 migrate）。
- **涉及文件**：`src/core/update.ts`、`src/core/opencode-config.ts`、`src/commands/update.ts`。
- **完成标准**：`openfeel update` 不再写项目 AGENTS.md；全局资产部署目标为全局 AGENTS.md（非 core.md）。

### op-004 feel 空白项目自动搭建 + 兼容性过渡

- **任务**：
  1. `feel.md` 模板新增「空白项目自动搭建 .openfeel/」节：明确「非 feel agent 不触发」。（REV-1902 修订）实现路径简化为一句「检测无 .openfeel/ 时运行 `openfeel init --workspace-only`」，复用 op-002 新增的非交互轻量子命令，不重复实现工作区创建逻辑。
  2. `migrate.ts` 扩展：检测全局 `~/.config/opencode/openfeel/core.md`（旧资产）→ 提示清理（state key remap 已在 op-003 完成）；存量「项目 AGENTS.md」保留 + 提示（不强制删除）。（REV-1910 修订：migrate 措辞「迁移」→「清理」旧 core.md）
- **涉及文件**：`templates-data/opencode/agents/{zh-CN,en}/feel.md`、`src/core/migrate.ts`、`src/commands/migrate.ts`。
- **完成标准**：feel 在空白项目自动搭建工作区；存量全局 core.md 与项目 AGENTS.md 有明确过渡提示。

### op-005 测试 + 文档 + 版本收口

- **任务**：更新 init/setup/update 行为变更相关测试；版本号 1.1.1 全链路同步（package.json + flow.json meta + 模板「版本管理」节）；更新 manual/ 与 CHANGELOG；KB 沉淀（归档阶段执行）。
- **涉及文件**：`test/**`（约 4~6 个测试文件）、`package.json`、`.openfeel/manual/*`（core/init、core/update、cli/commands、cli/setup）、`CHANGELOG.md`。
- **完成标准**：全量测试通过（0 回归）；版本 1.1.1 收口；manual 反映新命令与职责边界。

---

## 四、依赖图

```
op-000（调研）
   │  hard
   ▼
op-001（模板重构）
   ├── hard ──► op-002（setup + init 拆全局部署）
   ├── hard ──► op-003（update 收敛 + opencode-config）
   │
op-002 ── hard ──► op-003（共用 deployGlobalAsset 语义）
op-002/003 ── hard ──► op-004（migrate 复用全局 AGENTS.md 部署 + 兼容过渡）
op-001/002/003/004 ── hard ──► op-005（测试收口）
```

- op-000 是所有后续 op 的前置（决定 AGENTS.md 加载策略，影响 op-001 模板形态与 op-003 instructions 调整）。
- op-002 与 op-003 均在 op-001 之后；op-003 依赖 op-002 的 `getGlobalAgentsMdPath` 与 setup 抽取的全局部署语义。
- op-004 依赖 op-002/003（migrate 复用全局 AGENTS.md 部署能力）；op-004 的 feel.md 改造与 op-001 模板层解耦，可并行，但建议串行以保证单一变更域。

---

## 五、兼容性策略

1. **存量项目已有「项目 AGENTS.md」**：不再部署也不删除（属用户项目约束）。全局 AGENTS.md 自动加载后，项目 AGENTS.md 仍叠加加载（项目覆盖全局同名节），内容重复但无害。op-004 提供提示（可手动删除项目 AGENTS.md），不强制。
2. **存量项目已有 `.opencode/instructions/core.md`**：属 legacy 布局，复用 stage-39 `detectLegacy` 判据 ③（`projectOpendirInstructions`），提示运行 `openfeel migrate` 清理。
3. **已有全局 `~/.config/opencode/openfeel/core.md`**：op-004 检测并提示清理；setup/update 时移除 core.md instructions 引用（op-003），core.md 文件标记 deprecated（或由 migrate 清理）。（REV-1910 修订：migrate 措辞「迁移」→「清理」）
4. **已有全局 opencode.jsonc 的 `instructions: [core.md 绝对路径]`**：op-003 深度合并时移除该引用（或按 op-000 结论改指全局 AGENTS.md），用户其他字段 passthrough 保留（patterns.md #JSONC 深度合并模式）。
5. **存量全局 update_state.json 含 core.md key**：迁移到全局 AGENTS.md key（复用 stage-39 `remapLegacyKey` 思路，新增 core.md → 全局 AGENTS.md 映射）——归属 op-003 执行（REV-1910 修订）。

---

## 六、测试策略

- **单元测试**：setup 全局部署（幂等、不建项目 .openfeel/）；init 不再部署 agent/skill/AGENTS.md；update 不再写项目 AGENTS.md；`getGlobalAgentsMdPath` 路径解析。
- **模板一致性测试**：build.js 单源一致性断言（`SKILL_DEFINITIONS ≡ OPENCODE_SKILL_DEFINITIONS` 等，新增 skill 后键集对齐）。
- **端到端（隔离 HOME）**：`openfeel setup` → `opencode run` 指令型探针回显验证全局 AGENTS.md 约束生效；`openfeel init` 空项目验证不产生 AGENTS.md / .opencode/；feel 空白项目自动搭建端到端验证（隔离 HOME 探针，验证 `openfeel init --workspace-only` 触发创建完整工作区且不建 AGENTS.md）（REV-1911 修订）。
- **回归**：migrate 兼容路径（存量 core.md / 项目 AGENTS.md 检测）；现有 591 测试全量通过无回归。

---

## 七、风险点与回滚

| 风险 | 影响 | 回滚/缓解 |
|---|---|---|
| 全局 AGENTS.md 不自动加载（op-000 证伪） | 约束失效 | 回退到 `instructions` 引用全局 AGENTS.md 绝对路径（P2 机制，已实测可靠） |
| 移除 core.md 导致存量项目约束缺失 | 行为退化 | 过渡期保留 core.md + migrate 提示；分阶段废弃而非一步删除 |
| 全局 AGENTS.md 与项目 AGENTS.md 内容冲突 | 规则歧义 | 项目覆盖全局（opencode 约定），风险低；提示用户清理项目 AGENTS.md |
| setup/init 职责拆分引入回归 | 既有 init 用户受影响 | 完整单测 + 隔离 HOME 端到端；保留 init 的 opencode.jsonc 部署路径不变 |
| 新增 skill 命名/前缀冲突 | skill 同名覆盖非确定 | 严格 `openfeel-` 前缀 + build 单源断言校验键集 |
| 工具使用规范移至按需 skill 的退化风险 | 多步骤/模糊需求时 Agent 未加载 `openfeel-tool-usage` skill，未用 todowrite/question | 全局 AGENTS.md 保留极简加载指引（「多步骤/模糊需求时必加载 `openfeel-tool-usage` skill」）（REV-1906 修订） |
| 约束/操作拆分导致约束真空（某约束误拆进 skill 或遗漏） | 约束失效或规则重复 | op-001 后全量比对 core.md 章节 → AGENTS.md/skill 覆盖关系，确保无遗漏/重复（REV-1908 修订） |

- **整体回滚**：本次为纯部署/模板层改造，无数据破坏性变更；核心资产（模板、skill）为幂等可重建，回滚 = 恢复 core.md instructions 引用 + 恢复 init 的 deployOpencode（git revert 对应 op 提交）。

---

## 八、知识库参考

- architecture.md #全局部署架构（opencode 配置合并语义实测：AGENTS.md 自动加载、core.md 实际加载、instructions 拼接去重）
- architecture.md #opencode 全局/项目 agent 与 skill 合并语义（全局/项目资产共存与同名覆盖语义）
- architecture.md #模板单源架构（templates-data/opencode 唯一权威源 + 双注入对象 + 单源断言）
- architecture.md #控制区标记增量更新架构（managed-region 四策略 + 三态 + update_infos）
- architecture.md #存量项目迁移架构（legacy 检测 + deployGlobalAsset 复用 + 回滚边界）
- patterns.md #JSONC 深度合并模式、#全局/项目双 state 路由模式、#控制区标记模式、#迁移命令模式、#回滚边界模式、#AGENTS.md 模板同步模式、#命名前缀统一与子串陷阱处理
- troubleshooting.md #opencode instructions 路径 ~ 不展开、#双层模板源发散、#migrate 中途失败排查

> 知识库已有「全局部署架构」「AGENTS.md 自动加载」等直接相关记录，本次改造是 stage-37~40 全局化的延续与彻底化，无与既有架构冲突之处。
