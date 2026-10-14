# Agent 体系设计（agents）

> 模块文档，由归档官在归档时维护。对应源码：`src/core/templates-data/opencode/agents/{zh-CN,en}/*.md`（**唯一权威源**）+ 全局部署副本 `~/.config/opencode/agents/*.md`（opencode 适配器，由 `openfeel setup` 部署）。**stage-55 起仓库自身不再保留项目级 `.opencode/agents/` 副本**（自举实例与 `build.js` 步骤 8 一并移除）。

## 职责

定义 OpenFeel 10 Agent 协作体系：角色分工、驱动模型、调起方式与调度规则。Agent prompt 由 Feel 总统领统一调度，按流水线阶段串行推进。

## 10 Agent 体系

| Agent | 角色 | 驱动模型 | 调起方式 | 思考深度 |
|-------|------|----------|----------|:--:|
| Feel | 总统领 | 主力推理模型 | primary | medium |
| Planner | 计划官 | 推理模型 | subagent | high |
| Schemer | 方案官 | 主力推理模型 | subagent | high |
| Explorer | 探索者（**只读**） | 快速模型 (Flash) | subagent | medium |
| Executor | 执行官 | 快速模型 (Flash) | subagent | low |
| Reviewer | 审查官 | 异种推理模型 (GLM) | subagent | medium |
| Feel Tester | 测试官 | 推理模型 | subagent | medium |
| 事务官 | 事务官 | 快速模型 (Flash) | subagent | low |
| Vision | 视觉官 | 多模态模型 (deepseek-flash) | subagent | low |
| Archiver | 归档官 | 推理模型 | subagent | low |

## 调度模型

- **流程**：用户输入 → Feel 理解意图 → 按阶段调对应 Agent（Planner→Schemer→Executor→Reviewer→Feel Tester→Archiver）→ 检查结果 → 推进流水线
- **硬性纪律**：Feel 不得跳过任何 Agent，禁止亲为下游职责（编码、审查、测试等）
- **写入约束**：Planner 与 Archiver 对 flow.json 的操作必须通过 Feel + CLI 间接完成
- **跨 Agent 协作**：`[HANDOFF: agent]` 标记可触发委派（如 Executor → Vision 分析截图）
- **先探后执行**（v1.2.1-stage-89）：需先理解现状 → 先派**只读探索者** `openfeel-explorer`（只读、可并行、便宜）；产出结论 → 再派执行者落地

## 直接调度与 Handoff（v1.2.1-stage-88）

> 落点（权威源）：`templates-data/{opencode,claude}/agents/{zh-CN,en}/openfeel-*.md`「调度与 Handoff」/「Dispatch and Handoff」节（6 subagent × 2 harness × 2 语言 = 24 份）+ opencode `permission.task = "allow"` ×12 + `feel.md`×4 目标表增行。

- **统一语义**：「**调度请求直发，不经多级转介**」——任意 Agent 均可直接调度**通用工作者**（`openfeel-executor` 执行者 / `openfeel-explorer` 只读探索者，v1.2.1-stage-89 分类学两成员齐备）。**「通用工作者」= 执行者 / 探索者**（设计 §2.2 分类学）；`openfeel-feel-tester`（测试官）**不属该分类**，可被直接调度但须并列表述。**与需求接取制度（stage-87）是两套机制**——本机制针对通用工作者，需求仍由 feel 中介。
- **双口径通道（按 harness）**：**opencode 侧** = 嵌套 `task`（子 agent frontmatter `permission.task = "allow"`；实际可达性受平台 `subagent_depth` 阈值约束，默认 `1` 拦截二级嵌套）；**Claude 侧** = **Handoff 直发中介**（`[HANDOFF: {agent_name}]` 直发 + 主会话即到即派，复用既有原语，零新增基础设施）。
- **能力探测先行**：通道选择判据 `go` = 静态非 deny **∧** 行为级三要素齐备（调起下一级 / 目标正确指定 / 结果回传）；其余（含未实测）一律 `no-go` → 两 harness 统一 Handoff 直发。**未实测不得声称实测**（保守默认留痕，不虚构平台能力）。模板新增节**不点具体通道工具** → go/no-go 两分支下均成立。
- **平台事实（v1.2.1-stage-88 实测）**：opencode 嵌套 task **默认配置下 no-go**（`subagent_depth = 1` 拦截；提升 depth 即跑通，permission 扩展必要有效）；Claude Code **2.1.300** 下 `tools` 白名单含 `Task` 的 subagent **可**派发下一级（`spawnDepth: 2`，运行时工具名 `Agent`）——**原 Q1「subagent 不可调 Task」已 supersede**（见 kb/troubleshooting.md）；本仓 **claude 侧 `tools` 白名单仍不加 `Task`**（能力决策已由 v1.2.1-stage-89 收口，见下）。
- **对称纪律（跨 harness × 语言）**：节锚点插入（禁行号）｜同语言跨 harness **提取式切片逐字等值**｜**零 harness 主语**（新节不含 `Feel`/`主会话`、无替换位）｜按 harness 替换主语仅适用既有文本。

## 只读探索者与能力决策（v1.2.1-stage-89）

> 落点（权威源）：`src/core/templates-data/{opencode,claude}/agents/{zh-CN,en}/openfeel-explorer.md`（**新建 4 份**）+ 路由表 4 份（`agents-md/{zh-CN,en}.md:17` / `claude/constraint/{zh-CN,en}.md:17` 第 2 列）+ 24 份「调度与 Handoff」节尾行注记 + 4 份 `feel.md` 表末行。

- **职责**：只读通用工作者——读代码 / 查资料 / 定位问题 / 数据探查，输出结构化结论（结论 + 证据 `file:line` + 不确定性），**无任何副作用**；**不落「调度与 Handoff」节**（只读定位，调度语义由「先探后执行」注记承载）。
- **工具集（硬性，三处一致 + 精确相等断言）**：opencode `permission` **恰 5 键** `bash / read / glob / grep / external_directory`（**无 `task` / `edit`**）；claude `tools` **恰 4 项** `Bash, Read, Glob, Grep`（**无 `Task` / `Skill` / `TodoWrite` / `Edit` / `Write`**）。断言用排序后 `toEqual`（**比 `toContain` 更强**——拦「顺手多授一键」）。
- **路由替代**：调研 / 探索类任务由「内置 `general` / `Explore`（**非框架资产**：无模板 / 无权限 / 无断言保护）」改为 **`openfeel-explorer`**（模型可控 / 有框架纪律 / 可审计）；路由替换**不产生断链**。
- **能力决策：`Task` 不启用（两 harness 均不加）**——① opencode 默认 `subagent_depth=1` 拦截；② Claude 侧仅**单版本**实测、深度上限未测、`Task`→`Agent` 映射未文档化；③ **单边启用将造成两 harness 语义分叉**，与「统一语义 + 双口径」架构相悖。**可逆面（单点已界定）**：启用 = 4 文件 `tools` 白名单 + 断言 + 文案**同批**；残留风险须**未来启用前重新实测**（kb `#平台能力实测先行的 go/no-go 决策范式`：**能力可用 ≠ 必须启用**）。
- **对称纪律**：新增 4 份模板键集两 harness **同名同数**（build `assertKeySetsEqual`）；正文**无裸主语**（`Feel` / `主会话` 零出现）。

## 三模式感知与需求携带模式（v1.2.1-stage-90）

> 落点（权威源）：`src/core/templates-data/{opencode,claude}/agents/{zh-CN,en}/{feel,openfeel-planner}.md`（8 文件）+ `skills/openfeel-req/SKILL.md`；断言 `test/core/templates.test.ts`。

- **模板面 supersede（15 处，禁静默删除）**：① `feel.md` 需求节**正交注记 ×4** → 「**模式注记**：需求**携带**模式属性（需求级 `workflow_mode`，经单点解析作用于其关联阶段）；三种模式下需求纪律一致。」（同语言跨 harness 逐字同文）；② `openfeel-planner.md` 需求感知节 **正交 bullet ×4** → 「与「工作流模式感知」的**关系**：需求携带模式属性…三种模式下需求感知口径一致。」；③ `skills/openfeel-req/SKILL.md`「与 `workflow_mode` **正交**」→「与 `workflow_mode` 的**关系**」（description / 节标题 / 正文）；④ `feel.md` 模式节 ×4：`两种模式：` → **`三种模式：`** + 新增 general 条目（**无流水线** / 按需调度通用工作者 / **仅需求级合法** / 可显式升级、不自动降级），full / fast 两条目**逐字保留**。
- **旧串零残留门**：7 条旧串 × `templates-data/**`（64 文件）全内容扫描 = **0 命中**（`templates.test.ts` S90-2）；`templates.test.ts` needle 4 处显式替换（`'正交注记'`→`'模式注记'` 等）+ 新增 `describe('stage-90：三模式文案（supersede）')` 5 用例。
- **对称纪律**：改写保同语言跨 harness **逐字同文**（切片 `===`）、**零裸主语**（禁 `Feel` / `主会话` / `main session`）、改写外**零改动**（`numstat`：feel 3/2、planner 1/1、SKILL 3/3）、按节锚点定位（禁行号）。
- **权威源 → 生成物**：改 `templates-data/**` 后同批 `npm run build` 重生成 `template-loader.ts` + `update.ts`（**禁手改**）。
- **`general` 的运行时语义**：见 `manual/core/flow-manager.md`「需求级模式与载体制约束」节；agent 侧只承载**语义说明**，判定一律在引擎单点。

## 审查会话健康探测与可疑产出处置（v1.1.2-stage-48 事件 A）

> 落点（权威源）：`src/core/templates-data/opencode/agents/{zh-CN,en}/feel.md`「审查会话健康探测与可疑产出处置」节 + `.../openfeel-reviewer.md`「工具调用异常与独立取证纪律」节；配套规范见 `manual/core/code-review.md`。

- **健康探测（唤起审查官首轮执行）**：要求 openfeel-reviewer 在首轮先做**最小工具自检**——执行 `rg --version` 并读取一个已知文件（如 `package.json` 首行）**回报内容**。若自检失败、内容不符或工具结果异常 → 判定该会话**不可用**，立即中止并**重开会话**，不得沿用其后续产出。
- **可疑产出处置（REV-48-005）**：一旦判定某会话可疑，其已写出的 **REV 条目 / 验收记录自动降级为「待复核」**，**不得**被后续会话或 Feel 直接引用推进；须由新会话**独立复核关键结论后**方可据此推进（并追加「可信度声明」）。
- **审查纪律四条**（写进 reviewer 模板，随会话自动加载）：① 工具异常即中止并如实报告（不得臆造/续写）；② 可疑历史结论不得继承；③ 命令行取证优先于 `read`/`glob`；④ 结论须「命令 + 版本 + 环境」三要素可第三方复现。

## 任务类型路由（非编码任务一等公民）

| 任务类型 | 处理路径 |
|----------|----------|
| 调研/探索（读代码、查资料、定位问题） | Feel → research（`openfeel-explorer` 只读探索者），只读探索不产出源码变更 |
| 编码实现（新增/修改源码） | 完整流水线（Planner → Schemer → Executor → Reviewer → Tester） |
| 选型讨论（敲定技术方案/设计取舍） | Feel + `question` 工具，对话式决策产出结论不产出 plan.md |

非编码任务不强制创建计划或推进流水线，flow.json 不必为所有任务空转。

## 轻量决策边界

对话式选型（Feel 与用户通过 `question` 工具敲定技术方向/设计取舍，产出结论不产出 plan.md）由 Feel 直接处理，不委托 Planner；仅当需要**产出正式计划文档**（plan.md，含阶段划分、任务表、约束表）或达规模阈值时才委托 Planner。消除「要么全亲为、要么全委托」的极端。

## 决策归属区分

长期决策（技术选型、架构方向、跨会话有效的设计取舍）以 ADR 格式同步写入 `.openfeel/dev/decisions.md`；会话临时决策（流程调整、单次取舍）仅记录在 `dev_last/decisions.md`（主题文件「决策记录」；A10 英文文件名）。

## 记忆/状态文件结构（v1.1.2-stage-53）

> 落点（权威源）：`src/core/templates-data/agents-md/{zh-CN,en}.md` 工作区结构节 + `.../opencode/agents/{zh-CN,en}/feel.md` 记忆加载与会话写入节；对应 skill：`openfeel-workspace` / `openfeel-recover` / `openfeel-sync-status`。

- **两条设计目的**（总纲）：① **保存核心信息便于恢复**（打开索引即可在有限上下文内恢复工作）；② **避免无关信息污染上下文**（索引只放结论与位置，细节下沉）。
- **三层分层**：索引层（`dev/current.md`、`dev_last.md`）→ 主题层（`dev_last/{english-name}.md`，≤10 条 × ≤300 字）→ 详情层（`users/{username}/tmp/`，仅记地址）。
- **`dev/current.md` = 团队文件**：仅**个人提交时**更新、只描述整体信息、**无 agent 细节、无 `## @成员` 段**，仅留近期 **5** 条；旧记录自动归档 `.openfeel/dev/current_archive/`（公共域、纳入版本管理）。
- **`users/{username}/dev_last.md` = 本地文件（索引）**：会话末尾**更新**（非整文件覆盖）；「用户偏好 / 主题索引（活跃 ≤5）/ 已收敛主题 / 公共交接区」；主题文件写入遵守 **R1~R6**（R2 超量转 `tmp/` 记地址、R3 超期**不归档**、R4 主题超限**就地收敛**、R6 **加锁**：`withFileLock` + `.openfeel/tmp/locks/dev-last-{username}.lock`，索引与全部主题共用一把锁、**读写均在临界区内**）。
- **主题文件命名**：一律**英文 kebab-case**（`pending`/`decisions`/`pipeline-state`/`last-operation`/`experience`），索引显示名可中文并给出路径。

## 思考深度配置

各 Agent frontmatter 含 `reasoning_effort` 字段（high/medium/low）：规划/方案类用 high，调度/审查/测试用 medium，执行/机械/归档/视觉用 low。**权威源**（`templates-data/opencode/agents/**`）改动经 `npm run build` 传播后，由 `openfeel setup` 部署到全局 `~/.config/opencode/agents/`（opencode 适配器）；**仓库自身不再保留项目级 `.opencode/agents/` 副本**（stage-55 起）。
