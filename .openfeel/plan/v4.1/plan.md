# OpenFeel v4.1 — 构建稳健性 + Agent 深化

> 基于 v4.0 部署审查反馈，补强模板同步链路，深化 Agent prompt 职责边界

## 一、背景

v4.0 将 Agent 从 15 个精简到 7 个，打通了核心流水线，但审查和实战反馈暴露了两类问题：

### 1.1 模板不同步（stage-01 解决）

`openfeel update` 部署的 core.md 是旧版（424 行），根因是 `src/core/templates.ts` 中的 Base64 模板为手动维护的静态快照，修改源文件（`.opencode/instructions/core.md`）不会自动同步。同理，Agent 模板和 Skill 模板也存在相同的断链风险。

### 1.2 Agent prompt 边界模糊（stage-02 解决）

7 个 Agent 提示词普遍偏薄（30-60 行），对自己「能做什么、不能做什么」的边界描述不足，实战中暴露四个问题：

1. **Feel 越界执行**：git rm、文件复制、Base64 编码等简单操作，Feel 直接用 bash 做了，因为走 Executor 流水线太笨重。但约束没说 Feel 能干什么。
2. **Executor 跳步**：Executor 收到"参考部署文件路径"后直接复制整个文件，跳过方案步骤，因为 prompt 没硬化执行纪律。
3. **杂活无人干**：文件操作、格式校验、批量文本替换等辅助任务，没有合适的轻量 Agent。
4. **Planner/Feel 模糊**：Feel 兼任 Planner，但小规模调整 vs 大规模规划的边界没有定义。

> 参见 kb/architecture.md #15→7 Agent 精简体系 — 当前 7 Agent 体系提供了基础骨架，但职责边界的精细度不足。

## 二、目标

| # | 目标 | 对应阶段 |
|:--:|------|:--:|
| 1 | 模板维护从"手动同步"改为"构建时自动生成"，消除人工遗漏风险 | stage-01 |
| 2 | 7 个 Agent prompt 扩充到 80-120 行，硬化职责边界和操作纪律 | stage-02 |
| 3 | 新增轻量事务官 Agent，承接文件操作、格式校验等辅助杂活 | stage-02 |

## 三、阶段划分

---

### v4.1-stage-01：构建脚本自动同步模板

> 参见 kb/patterns.md #CLI 原子管理模式 — 构建脚本应作为可信的单步自动化入口

**目标**：将 core.md / Agent / Skill 三类模板的同步从手动操作改为 `npm run build` 自动完成，消除部署版本漂移。

#### A. 构建脚本改造（P1）

| # | 任务 | 说明 |
|:--:|------|------|
| 1.1 | **core.md → templates.ts 自动编码** | 在 `build.js`（或等效构建入口）中增加步骤：读取 `.opencode/instructions/core.md` → Base64 编码 → 注入到 `src/core/templates.ts` 的 `CORE_INSTRUCTION` 常量。需处理编码一致性（UTF-8）、保留换行格式、注入位置精确匹配。 |
| 1.2 | **Agent 目录 → AGENT_DEFINITIONS 自动生成** | 读取 `.opencode/agents/*.md` → 解析 frontmatter（description/mode/color/permission）和正文 → 生成 `AGENT_DEFINITIONS` Map 写入 `src/core/update.ts`（或独立模板文件）。需处理：Agent 文件新增/删除时的增量更新、特殊字符转义。 |
| 1.3 | **Skill 目录 → SKILL_DEFINITIONS 自动生成** | 读取 `.opencode/skills/*/SKILL.md` → 生成 `SKILL_DEFINITIONS` Map 写入 `src/core/update.ts`（或独立模板文件）。需处理：Skill 的目录嵌套结构、load 路径解析。 |

#### B. 约束清理（P1）

| # | 任务 | 说明 |
|:--:|------|------|
| 1.4 | **移除 dev_core.md 的手动同步约束** | 搜索 `.openfeel/dev/dev_core.md` 中涉及"手动同步模板"或"模板更新后需手动执行 XX"的 `[+]` 条目，将相关条目标记为 `[-]` 禁用，并在日志中记录原因（"构建时自动同步已落地"）。 |
| 1.5 | **移除 AGENTS.md 中的手动同步提醒** | 检查 `AGENTS.md` 中是否有"修改 Agent 后需手动更新 templates.ts"类描述，如有则替换为"修改 Agent 后运行 `npm run build` 自动同步"。 |

#### C. 验证与完善（P1-P2，4 项）

| # | 任务 | 说明 |
|:--:|------|------|
| 1.6 | **构建产物一致性校验** | 在 `build.js` 末尾增加校验步骤：构建完成后自动对比模板注入值与源文件内容（解码 Base64 → 逐行对比），不一致时 `exit(1)` 并输出差异。CI 环境下必须有此步骤。 |
| 1.7 | **init 命令创建 AGENTS.md 模板** | `openfeel init` 应在目标项目根目录创建 `AGENTS.md` 空骨架文件（含 `## 行为准则` / `## 核心约束` 等标准章节标题，内容由用户填充），与 `opencode.jsonc` 的 `instructions` 字段引用保持一致。 |
| 1.8 | **子 Agent 返回精简模式** (P2) | 任务完成后仅输出摘要，完整报告写入私域日志。cache 命中率 95.5% 表明影响有限，P2。 |
| 1.9 | **init 创建完整可用的 pipeline** (P1) | `init` 产生的 flow.json 必须包含合法的 `pipeline.current`（如 `{ stage: "-", op: "init" }`），否则 Feel 首次调用 `flow advance` 时报"未初始化"。当前 `init` 只建骨架不填 current，导致零起点项目首步就卡住。 |

#### 修改文件范围

- **修改**：`build.js`（或等效构建脚本）
- **修改**：`src/core/templates.ts`（生成的注入点）
- **修改**：`src/core/update.ts`（Agent/Skill 模板 Map）
- **修改**：`.openfeel/dev/dev_core.md`（禁用手动同步约束）
- **修改**：`AGENTS.md`（移除手动同步提醒）
- **修改**：`src/commands/init.ts`（AGENTS.md 创建逻辑）
- **可能修改**：`src/core/flow-manager.ts`（子 Agent 精简返回配置）

#### 验证方式

| 验证项 | 方法 |
|--------|------|
| 构建同步 | 修改 core.md 后 `npm run build`，检查 templates.ts 中 Base64 值已更新 |
| Agent 同步 | 修改 feel.md 后 `npm run build`，检查 AGENT_DEFINITIONS 中 feel 条目已更新 |
| Skill 同步 | 修改 check-kb/SKILL.md 后 `npm run build`，检查 SKILL_DEFINITIONS 同步 |
| 一致性校验 | 源文件与模板不一致时，`npm run build` 报错 exit(1) |
| init 骨架 | `openfeel init test-project` 后确认 `AGENTS.md` 存在且含标准章节 |
| 无回归 | `npm test` 全部通过（225+/227） |

---

### v4.1-stage-02：Agent 特化 + 事务官

> 参见 kb/patterns.md #Executor 强制第一步读方案、#REV blocking 标记模式、#审查五维度体系 — stage-02 将这些已沉淀的模式硬化到 Agent prompt 中，从"知识库知道"升级为"Agent 必遵守"。

**目标**：将 7 个 Agent prompt 从当前 50-157 行扩充到 80-120 行（executor 从 157 行**重构**到 100-120 行），明确每个 Agent 的职责边界、操作白名单和禁止事项。同时新增事务官承接辅助杂活。

#### A. Agent 特化 — 7 个 Agent 逐个扩充（P1）

| # | Agent | 当前行数 | 目标行数 | 需补充内容 |
|:--:|:--|:--:|:--:|------|
| 2.1 | **feel.md** | 53 | 90-110 | **直接操作白名单**：列出 Feel 可以用 bash 直接执行的操作（git add/rm、文件复制/移动、mkdir、Base64 编码、diff 对比等简单原子操作），以及**必须委托 Executor 的边界**（任何 .ts 源码修改、跨文件重构、npm 依赖变更）。<br><br>**小改 vs 大规模规划的阈值**：单文件修改 ≤ 30 行 → Feel 自行处理；跨文件或 > 30 行 → 唤起 Planner 制定正式计划。此阈值明确 Feel 兼任 Planner 的职责划分。 |
| 2.2 | **planner.md** | 50 | 80-100 | **与 Feel 的职责划分**：明确何时被 Feel 作为独立子 Agent 唤起（大规模规划、多阶段计划），何时 Feel 自行处理（单阶段小调整）。<br><br>**计划粒度的判定标准**：涉及 ≥ 2 个阶段或 ≥ 5 个文件的变更为大规模规划，必须走 Planner → Reviewer 完整流程。<br><br>**拒绝条件**：当 Feel 请求的计划已存在且无重大偏离时，Planner 应拒绝重复制定并建议 Feel 补充现有计划。 |
| 2.3 | **executor.md** | 157 | 100-120 | **执行纪律硬化**（重构现有内容）：第一步必须 `read` 方案文件完整内容，逐 checkbox 执行，禁止"看到参考路径就直接复制"。<br><br>**允许接非编码小活**：事务官 溢出时（事务官 模型为 fast，无法胜任复杂判断），Feeler 可派非编码小活给 Executor（如格式批量替换、配置项整理、文档结构调整），但须在任务描述中显式声明 `type: utility`。<br><br>**违规后果**：跳步执行需记录到自测报告的「偏差记录」字段。 |
| 2.4 | **reviewer.md** | 86 | 90-110 | **快速通道触发条件**：明确三要素（代码量 < 200 行 + 自测全通过 + 覆盖率 ≥ 80%）的获取方式和判定逻辑。<br><br>**REV 模板规范**：标准化 REV 条目的 YAML frontmatter 格式（状态/优先级/提出人/时间/blocking），确保 schemer 可程序化解析。<br><br>**blocking 判定细则**：细化 blocking=true/false 的场景枚举（功能缺陷 → true；命名建议 → false；安全漏洞 → 无条件 true）。 |
| 2.5 | **feel-tester.md** | 72 | 90-110 | **快速验收条件**：与 Reviewer 快速通道对齐（三要素一致），但 Tester 的快速验收不依赖 Reviewer 的 FAST-PASS 标记——Tester 独立判断。<br><br>**Bug 模板规范**：标准化 BUG 条目的格式（YAML frontmatter + 复现步骤/期望行为/实际行为），明确优先级判据（high: 功能不可用或数据丢失；medium: 功能可用但不符预期；low: UI/文案/边缘场景）。<br><br>**回归验证流程**：Fix 后的最小回归集合定义（至少包含原始 Bug 复现步骤 + 关联模块冒烟测试）。 |
| 2.6 | **schemer.md** | 113 | 100-120 | **op 命名规范**：`op-NNN.md` 仅编号，中文标题放入内部 `# ` 行。编号在阶段内递增，不跨阶段复用。参见 kb/patterns.md #op 文件命名规范。<br><br>**deps.yaml 声明规范**：方案产出时同步生成/更新 `deps.yaml`，声明本方案产出的文件路径（`file` 字段），供 Feel 调度前 glob 校验。参见 kb/patterns.md #deps.yaml 声明实际文件名。<br><br>**修正方案规范**：审查不通过后的修正方案格式要求（引用 REV 编号、逐条回应、新增步骤前标 `[FIX]`）。 |
| 2.7 | **archiver.md** | 107 | 90-110 | **知识去重触发条件**：明确何时调用 `findSimilarEntries`（每次提取新知识条目前），何时可跳过（纯 Bug 记录归档、日志汇总类操作）。<br><br>**去重失败处理**：当 kb-dedup 模块不可用时的降级策略（手动读取分类文件 + 标题关键词匹配 + 标注"未去重，待人工复核"）。 |

> **executor.md 重构注意**：当前 157 行，目标 100-120 行。需压缩冗长的前置校验步骤描述（保留校验逻辑但精简重复叙述）、合并多处重复的"拒绝执行"反馈模板为引用式规范，同时新增执行纪律和非编码小活承接规则。

#### B. 新增 事务官（P1）

| # | 任务 | 说明 |
|:--:|------|------|
| 2.8 | **创建 `utility.md`** | 在 `.opencode/agents/utility.md` 中创建新 Agent 文件，含 frontmatter（description/mode:subagent/color/permission）和完整职责声明。 |
| 2.9 | **注册 事务官 到更新系统** | 将 utility.md 纳入 stage-01 的 Agent 模板自动同步范围（`src/core/update.ts` 的 `AGENT_DEFINITIONS`）。若 stage-01 与 stage-02 并行推进，则在 stage-01 的构建脚本中确保新 Agent 目录的 glob 模式已覆盖 `utility.md`。 |

**事务官 规格**：

| 属性 | 值 |
|:--|:--|
| 文件 | `.opencode/agents/utility.md` |
| 模型 | 快速模型（fast） |
| 权限 | bash + read + write + glob + grep |
| 调起方式 | Feel 通过 `task` 工具调起，传入简单文本指令（无需走 Schemer→Executor 完整流水线） |
| 职责范围 | 文件增删复制移动、格式转换（JSON↔YAML↔Markdown）、编码检查（UTF-8/换行符）、构建测试（npm run build / npm test）、批量文本替换（限定非 .ts 业务逻辑文件） |
| 明确禁止 | 不参与设计决策、不修改 `.ts` 业务逻辑源码、不修改 Agent prompt 文件（`.opencode/agents/*.md`）、不调用其他 Agent、不操作流水线状态（flow.json / status.md） |
| 与 Executor 分工 | 事务官 处理机械性文件操作（无判断逻辑）；Executor 处理含判断逻辑的编码任务。若 事务官 无法胜任（如需要理解业务逻辑上下文），由 Feel 升级派发给 Executor 并标注 `type: utility`。 |

#### C. Agent 目录结构调整（P2）

| # | 任务 | 说明 |
|:--:|------|------|
| 2.10 | **更新 AGENTS.md 的 Agent 职责边界表** | 将新增的 事务官 加入职责边界表，明确其在 8 个 Agent 体系中的位置和协作关系。 |
| 2.11 | **更新 Feel prompt 的 Agent 路由表** | feel.md 扩充后（2.1），其内部 Agent 路由决策表应新增 事务官 的路由规则：文件机械操作 → 事务官，编码任务 → Executor，设计决策 → Planner（或 Feel 自行处理）。 |

#### 修改文件范围

- **修改**：`.opencode/agents/feel.md`（扩充到 90-110 行）
- **修改**：`.opencode/agents/planner.md`（扩充到 80-100 行）
- **修改**：`.opencode/agents/executor.md`（重构到 100-120 行）
- **修改**：`.opencode/agents/reviewer.md`（扩充到 90-110 行）
- **修改**：`.opencode/agents/feel-tester.md`（扩充到 90-110 行）
- **修改**：`.opencode/agents/schemer.md`（扩充到 100-120 行）
- **修改**：`.opencode/agents/archiver.md`（扩充到 90-110 行）
- **新增**：`.opencode/agents/utility.md`（~60 行）
- **修改**：`AGENTS.md`（更新职责边界表）
- **可能修改**：`src/core/update.ts`（注册 事务官 模板）

#### 验证方式

| 验证项 | 方法 |
|--------|------|
| 行数达标 | 逐个 `wc -l` 检查 7 个 Agent 文件，确认在目标范围内（executor ≤ 120，其余 ≥ 80） |
| 新增内容齐全 | 逐条核对「需补充内容」列中的每个要求是否已在 prompt 中出现（grep 关键词 + 人工通读） |
| 事务官 可用 | `openfeel flow` 可识别 utility Agent，Feel 可成功 `task` 调起 |
| 白名单正确 | feel.md 的直接操作白名单项均可用 bash 一步完成（无依赖链） |
| 无回归 | `npm test` 全部通过（225+/227） |
| 构建同步 | `npm run build` 成功，templates.ts 中新/改 Agent 已同步 |

## 四、依赖关系

```
v4.1-stage-01 (构建脚本自动同步)
    │
    ├─(soft)── v4.1-stage-02 (Agent 特化 + 事务官)
    │
    └─(soft)── v4.1-stage-02
```

**依赖说明**：
- Stage-01 → Stage-02：**soft**。两者修改的文件集不重叠（stage-01 改构建脚本和 TS 源码，stage-02 改 Agent .md 文件）。Stage-01 先完成可确保 stage-02 的 Agent 变更通过构建自动同步到 templates.ts，但 stage-02 可先行启动（Agent 文件编辑不依赖构建脚本）。
- **互不阻塞**：两个阶段可并行推进，建议先完成 stage-01（工作量较小，约 8 项任务）再启动 stage-02（涉及 7 个 Agent 全面重写，需验证交互一致性）。

## 五、整体验证方式

| 阶段 | 验证方法 |
|------|----------|
| Stage-01 | 1. 修改任意源文件 → `npm run build` → templates.ts 已更新<br>2. 源文件与模板不一致时构建失败<br>3. `openfeel init` 产出完整 AGENTS.md |
| Stage-02 | 1. 7 个 Agent 行数在目标范围<br>2. 新增内容逐条可查<br>3. 事务官 可被 Feel 调起执行文件操作<br>4. Feel 直接操作白名单与委托边界明确<br>5. Executor 第一步强制读方案<br>6. `npm test` 无回归 |

## 六、质量指标

| 指标 | 目标 | 备注 |
|------|:--:|------|
| 阶段完成率 | 2/2 | 两个阶段全部闭环 |
| 测试通过率 | 225+/227 | 不引入新失败 |
| Agent prompt 覆盖率 | 7/7 达标 | 行数在目标范围内，新增内容逐条对应 |
| 新增 Agent | +1 (事务官) | 8 个 Agent 体系 |
| 构建自动同步 | 3 类模板全自动 | core.md / Agent / Skill |
| 模板同步断链风险 | 0 | 构建时校验自动捕获不一致 |
