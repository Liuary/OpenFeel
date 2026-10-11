# 归档摘要 — v1.2.0-stage-81

- **归档时间**：2026-10-12
- **阶段名称**：v1.2.0-stage-81（需求核心引擎 — **主题一「需求流转系统」首阶段 / 引擎面**）
- **阶段状态**：archiving → done
- **依赖阶段**：hard `v1.2.0-stage-80`（主题二归档主题收官；本阶段在**已收缩的 flow.json**（8 阶段）上开发）；下游 = `v1.2.0-stage-82`（需求命令面，消费本阶段冻结契约）
- **归档人**：openfeel-archiver

## 阶段目标

为「需求流转系统」建立**引擎面**（**唯一权威**在此建立）：① `RequirementData`（**10 字段**）/ `RequirementStatus`（7 值域）类型与常量单一来源；② `FlowData.requirements`（顶层可选，**读侧宽容**——不 load 补齐，对齐 REV-78-015 方向）+ `StageData.requirement_id`（单值可空）；③ 需求 CRUD 与认领原语（add/get/list/update/claim/release/advance/link，**全部纯内存、经 `save()` 落盘**）；④ ID 分配（`REQ-NNN`，max+1 不回收）；⑤ 正文文件原语（`.openfeel/requirements/REQ-NNN.md` 骨架机械铺）；⑥ 正交边界（`src/core/req/**` 对归档层 / 工作流模式零耦合）。

## 操作产出

| ID | 标题 | 状态 | Commit |
|----|------|------|--------|
| op-001 | 需求类型与存储字段（`src/core/req/types.ts` 新建 + `flow-manager.ts` 最小字段追加；T1 + T2） | done | —（未提交） |
| op-002 | 需求 CRUD/认领原语 + 正文文件原语（`requirement-ops.ts` / `body-file.ts` 新建；T3 + T4） | done | —（未提交） |
| op-003 | 正交断言与全门禁（T5.6 + T6；**阶段收口 op**，含自测报告） | done | —（未提交） |

> 注：executor 按 `ops/deps.yaml`「不 commit」约定，产出停留工作区（HEAD `3be254c`）；执行序 = `op-001 → op-002 → op-003`（严格按 `execution_order`）。方案审查（scheme_review）首轮 **fail（1 blocking REV-81-009 + 6 非阻塞）** → 修订后 pass。

## 改动文件

- **`src/core/req/types.ts`**（**新建**，43 行）：需求层类型与常量**单一来源**（叶子模块、零 import）——`REQ_STATUSES`（7 值 `draft`/`scheduled`/`in_progress`/`done`/`blocked`/`cancelled`/`rejected`）+ `RequirementStatus`（自常量派生）+ `REQ_PRIORITIES`（`P0`/`P1`/`P2`）+ `REQ_ID_PATTERN`（`/^REQ-(\d{3,})$/`，含数字捕获组、非全局标志）+ `RequirementData`（**10 字段**：`id`/`title`/`status`/`target_version?`/`priority?`/`owner?`/`claimed_at?`/`created_at`/`updated_at`/`body_path?`；**无 `source`、无 `reason`**）。
- **`src/core/req/requirement-ops.ts`**（**新建**，265 行）：需求原语单点（纯内存、零写盘、审计内嵌）——读取 `getRequirements`（读侧宽容 `?? []` + 数组/元素浅副本）/ `getRequirement` / `listRequirements`（三 filter，`target_version` 命名统一）；ID `nextRequirementId`（max+1、异常 id 跳过、`REQ-999 → REQ-1000`）；写路径 `addRequirement`（新建恒 `draft`，**唯一抛错原语**）/ `claimRequirement`（占用校验 `already_claimed`、同 owner 幂等）/ `releaseRequirement`（无占用 no-op 成功）/ `updateRequirement`（patch 白名单、raw find 改本体、`updated_at` 单次赋值）/ `advanceRequirement`（委托 update，零第二套）/ `linkRequirement`（终态与重绑拒绝、`null` 解绑）；共用谓词 `isTerminalRequirementStatus` / `allLinkedStagesDone`（done 门，**零关联拒绝**）；状态流转**单点表** `ALLOWED_TRANSITIONS`；错误码 `RequirementErrorCode`（6 值）+ `RequirementOpResult`。
- **`src/core/req/body-file.ts`**（**新建**，83 行）：正文路径单点 + 骨架机械铺——`getRequirementsDir` / `getRequirementBodyRelPath`（POSIX 存储路径）/ `getRequirementBodyPath`（FS 路径）；`writeRequirementBodySkeleton`（mkdir 幂等 + `atomicWriteFileSync` + 已存在 **no-op 不覆盖** + `body_path` 单点赋值 + 恒返回绝对路径；7 章节骨架含「机读权威恒为 flow.json」注记）。
- **`src/core/flow-manager.ts`**（**最小追加**）：`StageData.requirement_id?: string | null` + `FlowData.requirements?: RequirementData[]` 字段声明 + `import type`；**`load()` 不补齐 `requirements`（读侧宽容，REV-81-003）**、`save()` 零改动（净变更 = 1 import type + 2 字段声明 + 注释）。
- **测试**：`test/core/req.test.ts`（**新建**，642 行；T5.1~T5.5 + 集成 + T5.6 正交断言）+ `test/core/flow-manager.test.ts`（追加「需求字段兼容」describe：存量兼容 / load→save 不注入 / 往返保留）。
- **方案层**：`.openfeel/plan/v1/stage-81/ops/{deps.yaml,op-001~003.md}`（随阶段纳入版本管理）。
- **报告**：`.openfeel/tmp/stage-81-selftest-report.md`（工作区，不入版本管理）。

## 关键不变量（T2 设计裁定与实测）

| 不变量 | 内容 | 实证 |
|--------|------|------|
| **读侧宽容（不注入）** | `requirements` 为顶层可选字段，`load()` **不**补齐；读侧 `getRequirements` 派生 `data.requirements ?? []`、写侧 `addRequirement` 内 `??= []` 兜底 | 纯 `load→save`（未写需求）→ 读盘 `'requirements' in parsed === false`（REV-81-003，对齐 REV-78-015） |
| **正交边界** | `src/core/req/**` 对 `workflow_mode` / `PIPELINE_PHASES` / `getValidTargets` / `flow-archive` / `process.cwd` / `homedir` **6 禁止串零命中**（含文件头注释全内容）；不 import / 不读归档层；**本版不归档 `requirements`**（REV-81-006） | T5.6 静态串断言 + 正控三断言 + `NEEDLES.length === 6`；`rg` 命令行复核零命中 |
| **零既有行为变更** | `flow-manager.ts` 改动为字段声明 + type import 级；既有 68 文件测试逐字绿 | 全门禁 69 文件 / 1476 用例 0 skipped / 0 failed |
| **ID 稳定** | `REQ-NNN` max+1 不回收、异常 id 跳过不崩；并发由 `save()` 乐观校验兜底 | T5.1 六例（空 / 连续 / 空洞 / 异常 / `REQ-999→REQ-1000` / 缺失） |
| **正文非权威** | `REQ-NNN.md` 为**人读副本**，骨架注记「机读权威恒为 flow.json」，不追写实时状态 | T5.5 内容断言（`# REQ-001：` + 注记 + `## 状态` 含 `draft` + 六章节） |

## 审查记录

### 计划审查轮（plan_review，2026-10-12，结论 pass：0 阻塞 + 8 非阻塞）

| ID | 标题 | 状态 | 优先级 |
|----|------|------|--------|
| REV-81-001 | 实测基线过期三处（flow.json 阶段数 / 68 文件 / i18n 806→829） | pending（计划期修正已落实，台账 pending） | medium |
| REV-81-002 | 行号仅单锚且钉过期基线（违双锚纪律） | pending（计划期修正已落实） | low |
| REV-81-003 | `requirements` 用 `load()` 补齐与 REV-78-015 口径相反 | pending（计划期采纳方案 (a) 读侧宽容） | medium |
| REV-81-004 | 承接 REV-80 pending 零交代 | pending（计划期新增「承接」表） | medium |
| REV-81-005 | `addRequirement` 入参与字段表不齐 + `status` 初值未定 | pending（计划期删 `source?` + 显式 `status:'draft'`） | low |
| REV-81-006 | 与归档层正交边界未声明、T5.6 未覆盖 | pending（计划期补边界 + 纳入断言） | low |
| REV-81-007 | §四.3 错引 `downstream_contracts` 序号 | pending（计划期改按 `name` 引用） | low |
| REV-81-008 | 大计划 Q4 定向方案期定稿未登记 | pending（计划期登记开放问题） | low |

> 说明：001~008 的计划文档层修正均在「计划审查 REV 修订轮」（plan.md §六 2026-10-12 行）落实；台账状态保留 pending（未逐条走验收流程），随 v1.2.0 收口（stage-85）处置。

### 方案审查轮（scheme_review，2026-10-12，结论 fail：1 阻塞 + 6 非阻塞 → 修订 → pass）

| ID | 标题 | 状态 | 优先级 |
|----|------|------|--------|
| REV-81-009 | 文件头正交声明注释与 T5.6/rg 零命中自相矛盾 | **closed** | high（**blocking**） |
| REV-81-010 | `RequirementData` 记「9 字段」实为 10 字段 | closed | medium |
| REV-81-011 | `updateRequirement` 未指明 raw 查找（静默丢更新） | closed | medium |
| REV-81-012 | 命名不一致（`targetVersion`/`target_version`/`version`） | closed | low |
| REV-81-013 | `updated_at` 刷新语义双处冲突 | closed | low |
| REV-81-014 | op-001 3.3 `revision` 断言基线未定义 | closed | low |
| REV-81-015 | `addRequirement` 抛错 vs 其余返回错误码风格不对称 | closed | low |

### 方案审查复审（修订验收，2026-10-12，结论 pass：009~015 全闭合 + 新增 1 条）

| ID | 标题 | 状态 | 优先级 |
|----|------|------|--------|
| REV-81-016 | `applyStatusChange` 对越域 `req.status` 缺守卫（域外值 → `.includes` 抛 TypeError） | pending（转 stage-82 / 收口轮） | low |

### 代码审查轮（code_review，2026-10-12，结论 pass：0 阻塞 + 4 非阻塞）

| ID | 标题 | 状态 | 优先级 |
|----|------|------|--------|
| REV-81-017 | 正交断言写法偏离 op-003 步骤 1.4（未回登方案修正记录） | pending（转 stage-82 / 收口轮） | low |
| REV-81-018 | 同字段校验风格在 add/update 不对称 | pending（转 stage-82 / 收口轮） | low |
| REV-81-019 | 读侧容错非数组，写侧 `addRequirement` 未守卫非数组（**与 `req/BUG-001` 同一处**） | pending（**合并转 stage-82 / 收口轮**，随 `req/BUG-001` 一并修复） | low |
| REV-81-020 | `writeRequirementBodySkeleton` 无条件改写 `body_path`（误传浅副本则静默不落库） | pending（转 stage-82 / 收口轮） | low |

> 结论：**passed（全 20 条：closed 7 / pending 13，0 blocking 遗留）**。REV-81-009（方案轮 blocking）经修订轮闭合。归档官处置：计划轮 **001~008** 计划文档层已落实、台账保留 pending；**016 / 017 / 018 / 020** 保留 pending（源码/方案层，转 stage-82 或 v1.2.0 收口轮）；**019** 与 `req/BUG-001`（同一处 `addRequirement` 非数组守卫）**合并**，随 Bug 一并处置。承接 REV-80 移交项：**REV-80-020**（planner，plan.md 文档层）、**REV-80-023**（主会话，提交卫生/状态对账）、**REV-80-029**（stage-85，代码注释登记）——均随 v1.2.0 收口（stage-85）处置（详见 `REV-80.md`）。

## 缺陷记录

| ID | 标题 | 状态 | 优先级 |
|----|------|------|--------|
| BUG-001 | `addRequirement` 对非数组 `requirements` 抛 TypeError（其余 8 个原语均宽容） | open（**非阻塞**，合并 REV-81-019，转 stage-82 / 收口轮） | low |

> 测试官正式验收 **通过**（阶段级全部验收要点独立复现）；新发现 1 条 **非阻塞** Bug（`req/BUG-001`，low）——仅在 `flow.json` 被手工改坏（`requirements` 为非数组真值）时可达、无数据丢失；写路径兜底 `??=` 仅覆盖 `null`/`undefined`，与其余 8 个原语的 `Array.isArray` 守卫口径不一致。**无阻塞 Bug。**

## 门禁

- `npm test` **69 文件 / 1476 用例 0 skipped / 0 failed**（stage-80 基线 68 文件 / 1408 用例 → 本阶段 +1 文件 `req.test.ts` + 68 用例）
- `npx tsc --noEmit` → exit 0
- `node bin/openfeel.js lint i18n` → **829**（本阶段不新增键，逐字不变；基线 829）
- `node bin/openfeel.js lint kb` → **0**（过期引用）
- `npm run build` ×2 → 幂等（二次 build 前后 `git status --porcelain src/` 逐字不变，生成物零复活）
- **正交静态面**：`rg "workflow_mode|flow-archive|PIPELINE_PHASES|getValidTargets|process\.cwd|homedir" src/core/req/` → **零命中**（6 串口径）
- **真实工作区零触碰**：`'requirements' in .openfeel/flow.json` → `false`；`.openfeel/requirements/` **不存在**（本阶段无命令面，不真实建目录）
- **存量兼容**：本仓 `flow.json` 无 `requirements` 键、阶段无 `requirement_id` → `flow status` / `flow health` exit 0
- HEAD 恒 `3be254c`（零 commit）

## 知识沉淀

| 分类 | 标题 | 动作 |
|------|------|------|
| architecture | 需求流转四层模型架构：需求层为「排期与调度层」（显式字段 + 阶段 phase 聚合投影） | 新增 |
| architecture | 需求层正交边界架构：`src/core/req/**` 对归档层 / 工作流模式零耦合 + 静态串断言固化 | 新增 |
| patterns | 顶层可选字段「读侧宽容不注入」模式：不 load 补齐，读侧派生 + 写侧兜底 | 新增 |
| patterns | 需求引擎不变量模式：ID max+1 不回收 + 认领占用 + 状态流转单点表 + done 门空集守卫 | 新增 |

> 去重（`node bin/openfeel.js knowledge dedup`）：architecture 候选（四层模型）最高 **3.3%**、（正交边界）最高 **0.9%**；patterns 候选（读侧宽容）最高 **4.5%**、（需求不变量）最高 **3.6%**，均 ≪ 80% → 4 条均判**新增**。kb 分类计数：architecture 38→**40**、patterns 168→**170**。troubleshooting（59）本阶段**无新增条目**（无新排查经验；读侧宽容序列化副作用已有既有条目覆盖）。

## manual 更新

- **`core/req.md`**（**新建**）：新模块 `src/core/req/` 文档——三文件职责（types / requirement-ops / body-file）+ `RequirementData` 10 字段表 + 7 值域 / 3 优先级常量 + **9 原语** API 表 + 状态流转单点表 + done 门 + 错误码 + 正文骨架；**读侧宽容**（不 load 补齐）与**正交边界**说明；变更历史增 stage-81 行。
- **`core/flow-manager.md`**：`FlowData.requirements?` / `StageData.requirement_id?` 字段说明（顶层可选、读侧宽容、不 load 补齐）；数据位置节补 `requirements` 段。
- **`index.md`**：模块树增「需求核心引擎（req）」条目 + 维护规则表增 req 行。

## 遗留与下游

- ★ **flow 状态推进**：`v1.2.0-stage-81` → `done`（**由主会话** Feel 经 `openfeel flow advance --stage v1.2.0-stage-81 --to done` 执行；archiver 不直写 flow.json）。`archive_stage` 由该 advance 补记。
- **REV 遗留（13 条 pending 非阻塞）**：计划轮 **001~008**（计划文档层已落实、台账待收口）；方案·代码轮 **016 / 017 / 018 / 020**（源码/方案层，转 stage-82 或 v1.2.0 收口轮）；**019 与 `req/BUG-001` 合并**（同一处 `addRequirement` 非数组守卫）。承接 REV-80 移交项 **020 / 023 / 029**。**0 blocking 遗留**。
- **Bug 遗留**：`req/BUG-001`（low，open，非阻塞）→ 转 stage-82 / v1.2.0 收口轮修复（`addRequirement` 写路径改为 `Array.isArray` 守卫，与其余 8 原语口径统一）。
- **下游契约**：`src/core/req/**` 全部导出（类型 + 9 原语 + 正文原语）登记于 `ops/deps.yaml` `downstream_contracts`（按 `name` 引用），交 stage-82（命令面消费：值域常量派生校验 + `save()` 统一落盘 + `addRequirement` throw 捕获）+ stage-83（聚合消费 `allLinkedStagesDone` 单一口径谓词）。**禁第二套实现。**
- **兼容承诺**：`requirements` 顶层可选字段读侧宽容（缺失 ≡ `[]`）、`requirement_id` 缺省 ≡ `null`；存量 `flow.json` 无字段全路径零报错；load→save **不注入** `requirements` 键。
- **未 commit / 未 push / 未 publish / 未改版本**（版本保持 1.1.7，版本收口归 stage-85）。

> 归档方式：手工生成摘要（沿用先例，未运行 `openfeel archive <stage>` CLI 以避免其副作用）。
