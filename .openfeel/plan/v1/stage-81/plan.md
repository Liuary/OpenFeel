# v1.2.0-stage-81 计划 — 需求核心引擎（requirements 数据模型与写事务）

- **阶段**：`v1.2.0-stage-81`（主题一 · 需求流转首阶段）
- **依赖**：**hard: v1.2.0-stage-80**（主题二归档先行收官；本阶段在**已收缩的 flow.json** 上开发）
- **优先级**：P0（需求层底座：数据模型 / 写事务 / CRUD 与认领原语 / ID 分配 / 正文文件原语的**唯一权威**在此建立）
- **制定人**：openfeel-planner ｜ **制定时间**：2026-10-11
- **定位**：为「需求流转系统」建立**引擎面**——① `RequirementData` / `RequirementStatus`（7 值域）与常量单一来源；② `FlowData.requirements`（顶层可选，**读侧宽容**——不 load 补齐，对齐 REV-78-015 方向）+ `StageData.requirement_id`（单值可空）；③ 需求 CRUD 与认领原语（add/get/list/update/claim/release，**全部经 `save()`**）；④ ID 分配（`REQ-NNN`，max+1 不回收）；⑤ 正文文件原语（`.openfeel/requirements/REQ-NNN.md` 骨架机械铺）。
- **范围**：新建 `src/core/req/`（`types.ts` / `requirement-ops.ts` / `body-file.ts`）+ `src/core/flow-manager.ts`（`FlowData`/`StageData` 字段最小追加；**不** load 补齐——读侧宽容）+ `test/core/req.test.ts` + `test/core/flow-manager.test.ts`（字段兼容）。
- **边界**：**不做命令面**（`openfeel req` 归 stage-82）；**不做**聚合判定与回写（归 stage-83）；不改 phase 枚举 / 转移表；**不 import / 读取 `workflow_mode`**（裁定 J 正交）；**不 import / 不读 `flow-archive/**`；本版不归档 `requirements`**（REV-81-006）；不新增第三方依赖；不 `npm publish` / 不 `git push`；不直写 `flow.json`（测试 fixture 除外）。

## KB 检索（`openfeel-check-kb`）

- 已加载。**高度相关条目**：
  - `kb/architecture.md #状态/相位单一事实源：status 为 phase 的粗粒度投影` → 需求状态是「显式字段 + 阶段 phase 聚合」的**投影**；本阶段只建**显式字段与写事务**，聚合方向（phase → 需求）归 stage-83。
  - `kb/patterns.md #flow.json 乐观并发校验模式` + `#原子写模式` → 需求写入零自造路径：全部经 `save()`（锁 + revision + `.bak`）。
  - `kb/patterns.md #op frontmatter 状态为文档副本、权威源 flow.json` → `REQ-NNN.md` 正文为**人读副本**；权威恒为 flow.json（骨架不写实时状态真值，防双写）。
  - `kb/patterns.md #两阶段状态 draft/publish 的窄兼容设计：扩取值域` → 7 值域逐一回答各路径（list 过滤 / board 分组 / next 筛选 / 聚合 / health——本阶段先定值域与常量，消费面归 82/83）。
  - `kb/patterns.md #全局状态文件多类条目扩展与短前缀读侧分类` → `requirements` 读侧宽容（缺失 → `[]`）；`StageData.requirement_id` 缺失 ≡ `null`。
  - `kb/troubleshooting.md #writeDefaultConfig 无条件覆盖` → 测试全程 fixture tmpDir / 隔离 HOME，**严禁**触碰本仓真实 `flow.json` 与 `config.yaml`。
  - **无**「需求流转系统」既有条目 → 归档时补沉 architecture（四层模型与需求聚合投影）。

---

## 一、背景与实测证据（大计划 §二 表 B 摘引；双锚「符号名 @ 行号」，行号钉 HEAD `3be254c`，漂移时以符号名为准——REV-81-002）

| 事实 | 位置（符号名 @ 行号） | 结论 |
|------|------|------|
| `FlowData` 顶层 5 键；`reviews: ReviewItem[]` 顶层数组先例 | `FlowData` @ `src/core/flow-manager.ts:107-120`（`reviews` @ 118；`archived_versions` @ 114） | `requirements: RequirementData[]` 同构新增（**顶层可选字段读侧宽容**——不 load 补齐，见 §二 不变量 2 与 T2） |
| `StageData` 无需求字段 | `StageData` @ `src/core/flow-manager.ts:93-104` | 新增 `requirement_id?: string \| null` |
| `load()` 存量容错补齐 `ops`/`deps` | `load()` @ `src/core/flow-manager.ts:504-533`（补齐 519-520） | `requirements` **不随 load 补齐**——顶层可选字段读侧宽容（对齐 REV-78-015 方向；裁定 (a) 见 T2） |
| `save()` 锁 + 乐观并发 + `.bak` + 原子写；序列化前剔除运行时字段（`op.id`） | `save()` @ `src/core/flow-manager.ts:536+` | 需求写入复用；如有运行时便利字段须同范式剔除 |
| `registerStage()` 幂等早返回 + 实际新增才 `appendLog` | `registerStage()` @ `src/core/flow-manager.ts:1097+` | `addRequirement` 同范式（审计在 appendLog 之前判定） |
| `getReviewItems()` 防御式返回副本 | `getReviewItems()` @ `src/core/flow-manager.ts:977` | 需求查询 API 同范式 |
| `parseStageId` / `normalizeStageId` | `parseStageId` @ `src/core/plan/path.ts:41-63` / `normalizeStageId` @ `:83-86`（两处零漂移） | `req link` 阶段归一化（归 82 命令面；本阶段原语接受已归一 stageId） |
| 本仓 `flow.json`：**8 阶段**（`v1.2.0-stage-78`~`85`；stage-80 自举迁移后）；无 `requirements` 字段；`meta.archived_versions` **9 项** | 实测（复现：`node -e "console.log(Object.keys(require('./.openfeel/flow.json').stages).length)"` → `8`；`node -e "console.log(require('./.openfeel/flow.json').meta.archived_versions.length)"` → `9`） | 向后兼容基线：缺省即回落；存量 78 阶段已迁出（`flow-archive/v1.0.0…v1.1.7.json` ×9，`requirement_id` 随历史冻结于归档） |

---

## 二、目标语义与不变量

| 维度 | 内容 |
|------|------|
| 类型 | `RequirementStatus = "draft" \| "scheduled" \| "in_progress" \| "done" \| "blocked" \| "cancelled" \| "rejected"`（7 值）；`RequirementData`（id/title/status/target_version?/priority?/owner?/claimed_at?/created_at/updated_at/body_path?） |
| 常量 | `REQ_STATUSES` / `REQ_PRIORITIES`（值域**单一来源**，命令层派生校验；裁定 B/F 与大计划 §三 表 B 裁定 F） |
| 存储 | `FlowData.requirements`（顶层可选，**读侧宽容**：`getRequirements(data)` 派生 `?? []`；不 load 补齐）；`StageData.requirement_id`（可空） |
| ID | `REQ-NNN` 三位补零；max+1 不回收；格式 `/^REQ-\d{3,}$/` |
| 正文 | `.openfeel/requirements/REQ-NNN.md` 骨架（标题/状态/摘要/目标与验收/预估版本/关联阶段/变更记录——**方案期定稿章节**，开放问题）；目录 `mkdirSync(recursive)` 幂等 |

**不变量**：

1. **全部写入经 `save()`**：本阶段不新增任何独立写盘点；`requirement-ops` 全部为**内存操作 + 返回结果**（save 由调用方 / 命令层）。
2. **零既有行为变更**：无 `requirements` 字段 / 无 `requirement_id` 的存量数据全路径零报错；既有 **68** 文件测试逐字绿（实测复现：`find test -name '*.test.ts' | wc -l` → `68`）。
3. **正交**：`src/core/req/**` 不 import / 读取 `workflow_mode`、转移表、phase 语义，**不 import / 不读 `flow-archive/**`**（本版**不归档 `requirements`**——其归档口径留后续版本，大计划裁定 W/§七.5；`rg` 复核零命中，T5.6 固化）。
4. **ID 稳定**：并发场景由 `save()` 乐观校验兜底（后写者冲突）；单进程内 max+1 单调。
5. **正文非权威**：骨架文件**不写入**实时 status 真值（或仅写创建时快照并注明「以 flow.json 为准」——方案期定稿），避免第二事实源。

---

## 三、变更点清单（编号 T）

### T1 — 类型与常量（`src/core/req/types.ts`，新建）
- `RequirementStatus` 联合类型 + `REQ_STATUSES`（`as const`）+ `REQ_PRIORITIES = ["P0","P1","P2"] as const`。
- `RequirementData` 接口（字段注释中文；`body_path` 存相对路径）。
- 常量导出供 stage-82 命令层值域校验派生（**禁命令层硬编码**，核验 B13/B20 范式）。

### T2 — `FlowData` / `StageData` 扩展与读侧宽容（`src/core/flow-manager.ts`）
- `FlowData.requirements?: RequirementData[]`（可选声明；**不** `load()` 补齐——**裁定 (a)：顶层可选字段读侧宽容**，对齐 REV-78-015 方向〔stage-79 已按此移除 `archived_versions` 的 load 补齐，语义由 `getArchivedVersions` 自防御承担〕：读侧 `getRequirements(data)` 派生 `data.requirements ?? []`、写侧 `addRequirement` 内先 `??= []` 再 push。**理由**：避免「任意 load→save 向存量 flow.json 注入 `requirements: []`」的序列化副作用（kb troubleshooting 已载；不采纳方案 (b)）。逐条登记见 §六 修订记录 REV-81-003。
- `StageData.requirement_id?: string | null`。
- `save()`：如有需求侧运行时便利字段，剔除逻辑与 `op.id` 同范式（当前设计无；断言防回归）。
- **不改** 既有方法签名与语义。

### T3 — 需求 CRUD 与认领原语（`src/core/req/requirement-ops.ts`，新建）
- `nextRequirementId(data): string`（max+1，三位补零；异常 id 跳过不崩）。
- `getRequirements(data): RequirementData[]`（读侧宽容派生 `data.requirements ?? []`——不依赖 load 补齐；存储口径见 T2）。
- `addRequirement(data, { title, targetVersion?, priority? }): RequirementData`（幂等语义 = 不查重标题，每次新建；**新建即 `status: 'draft'`**；`created_at`/`updated_at` 写入；审计 `requirement_add`；内先 `data.requirements ??= []` 再 push——读侧宽容写路径；**无 `source` 字段**——REV-81-005：删 `source?` 对齐 `RequirementData` 字段表，未来来源/事由信息随开放问题 Q4-schema 一并裁定）。
- `getRequirement(data, id): RequirementData | null` / `listRequirements(data, filter?: { status?, version?, owner? }): RequirementData[]`（**返回副本**，核验 B8 范式）。
- `claimRequirement(data, id, owner): { ok: true } | { ok: false; code: "not_found" \| "already_claimed" \| "invalid_status" }`（占用校验：`owner` 非空且 ≠ owner → `already_claimed`；**不写盘**由命令层处置，裁定 E）。
- `releaseRequirement(data, id): ...`（无占用者 → no-op 语义方案期定稿）；`updateRequirement(data, id, patch): ...`（status/title/target_version/priority 白名单）。
- 全部纯内存 + `appendLog`（审计条目：`requirement_*`）；幂等早返回 / 冲突路径**均不写盘**。

### T4 — 正文文件原语（`src/core/req/body-file.ts`，新建）
- `getRequirementsDir(projectPath)` / `getRequirementBodyPath(projectPath, id)`（单点）。
- `writeRequirementBodySkeleton(projectPath, req): string`——mkdir 幂等 + `atomicWriteFileSync`；已存在 → 默认 no-op（不覆盖人工补充内容；方案期定稿覆写策略）。
- 骨架章节按裁定 K（大计划 §三 表 B）：标题 / 状态（注明权威源）/ 摘要 / 目标与验收 / 预估版本 / 关联阶段 / 变更记录。

### T5 — 测试（`test/core/req.test.ts` 新建 + `test/core/flow-manager.test.ts` 追加）
- T5.1 ID 分配：空 / 连续 / 空洞（REQ-001、REQ-003 存在 → 下一个 REQ-004）/ 异常 id 容错。
- T5.2 CRUD：add/get/list（三种 filter）/update 白名单与非法键拒绝。
- T5.3 认领：claim 成功 / 二次他人 claim 拒绝（`already_claimed`，数据零变更）/ release 后可再 claim。
- T5.4 兼容与宽容：无 `requirements` 字段 → 读侧 `getRequirements` 返回 `[]`；无 `requirement_id` → 读侧 null；**纯 load→save（未写需求）→ 不注入 `requirements` 字段**（方案 (a) 防序列化副作用断言）；`addRequirement` 后 save → 字段存在且 revision +1。
- T5.5 正文骨架：目录幂等 / 已存在不覆盖 / 路径单点。
- T5.6 正交断言：`rg` 静态检查（`src/core/req/**` 无 `workflow_mode` / `PIPELINE_PHASES` / `getValidTargets` / **`flow-archive`** 引用——含不 import / 不读 `flow-archive/**`；本版不归档 `requirements`）——以测试断言形式固化。
- 全程 fixture tmpDir。

### T6 — 门禁
`npm run build` ×2 → `npm test`（0 skipped / 0 failed；**68 文件**基线〔实测 `find test -name '*.test.ts' | wc -l`〕）→ `tsc` = 0 → `lint i18n` = **829**（本阶段不新增键，预期不变；复现：`OPENFEEL_LOG=0 node bin/openfeel.js lint i18n` → 「✅ 829 键一致」；注：按行首引号键正则统计得 806 系偏差口径〔漏计 23 个无引号键〕，一律以 lint 门禁口径为准——REV-81-001）→ `lint kb` = 0。

### 承接上游 pending REV（REV-80 pending 13 条；REV-80-004 惯例）

> 来源：`users/Liuary/code_review/REV-80.md`（2026-10-12 归档轮处置后）；全条 **非阻塞**、**本阶段（stage-81）零动作**——仅承接登记防灭失；`deps.yaml` stage-81 `notes` 留索引行。

| REV | 摘要 | 处置 | 动作 / 落点 |
|-----|------|------|-------------|
| REV-80-009 [medium] | T7 降级路由不可达 | **归 stage-80 修复方案（已落地，待台账闭合）** | stage-80 op-004 循环重构（遍历集 `onlyStages ∪ keys` 去重）已实施（kb patterns 实证 v1.2.0-stage-80）；REV-80.md 状态行复闭合归 stage-80 轮 |
| REV-80-010 [low] | helper 内联判据正则复制 `parseStageId` 全名分支 | 保留 pending（源码层） | `path.ts::isArchivedVersionOf` 改进建议（经 `parseStageId` 派生全名性）；建议随 v1.2.0 收口（stage-85 轮）/ 归档引擎后续修复——本阶段不触碰归档面 |
| REV-80-011 [low] | `flow health` 块结束锚点偏 2 行 | **并入 REV-80-020 → planner** | `stage-80/plan.md` 文档层（行号校正） |
| REV-80-012 [low] | 归档 health 项 section 常量未定稿 | 保留 pending（op 方案层） | `stage-80/ops` 文档；建议随 v1.2.0 收口轮 |
| REV-80-013 [low] | 「版本粒度放行」固化用例缺失 | 保留 pending（用例层） | 与 010 同源；建议随 v1.2.0 收口轮 |
| REV-80-014 [low] | `flow health --fix` 未登 plan.md（op 级新增写动作） | **并入 REV-80-020 → planner** | `stage-80/plan.md` §二 补登记迁移收尾写动作 |
| REV-80-015 [low] | off-set 运行 `appendLog` 只压内存不落盘 | 保留 pending（边界登记） | 纯 off-set 跳过 `appendLog` 或明确边界；建议随收口轮 |
| REV-80-016 [low] | 行号锚点微漂移（stage-80 op 文档） | **并入 REV-80-020 → planner** | 归档轮校正或「双锚以符号名为准」口径（与本阶段 §一 同口径） |
| REV-80-017 [low] | 迁移命令 Windows 便携性（bash 循环无 PowerShell 等价） | 保留 pending（历史程序文档） | 迁移已执行完毕（stage-80 闭环）；补注为可选收口项 |
| REV-80-018 [low] | 基线数值快照口径不一 | 保留 pending（文档层） | 建议随收口轮统一注快照时点 |
| REV-80-020 [low] | REV-80-011/014/016 仅部分落实（计划文档层） | **→ planner（归档官已移交）** | `stage-80/plan.md` 三处文档校正；建议随 v1.2.0 收口（stage-85）处置 |
| REV-80-023 [low] | 提交卫生 + `archive-health.ts` untracked + 状态陈旧 | **→ 主会话（Feel）**（归档官已移交） | 精确 `git add`（禁 `-A`）；`pipeline.current.op` / `status.md` 经 CLI 对账；随阶段 done 收敛 |
| REV-80-029 [low] | 028「由 a 项兜底」不成立 + 注释待补 | **→ stage-85 收口**（归档官处置） | 报告层措辞已修正；`archive-health.ts` 代码注释补登记移交 executor；随 stage-85 轮 |

### 开放问题（stage-81 方案期定稿；REV-81-008）

1. **Q4-schema（承大计划 §十 Q4）**：`reason` 字段是否入 `RequirementData`（`req set --status blocked` 事由的 schema 侧）→ **方案期定稿**；本阶段仅登记（`source?` 已按 REV-81-005 删除，未来来源/事由信息与本条一并裁定）。
2. 正文骨架章节定稿与「已存在文件」覆写策略（T4；章节清单见裁定 K）。
3. `releaseRequirement` 无占用者路径的 no-op 语义（T3）。
4. 骨架是否写入创建时状态快照及「以 flow.json 为准」注记形态（§二 不变量 5）。


---

## 四、验收要点（阶段级）

1. T5 六组单测全绿；存量兼容（无字段）零报错。
2. **零既有行为变更**：`src/core/flow-manager.ts` 改动为字段声明 + 读侧宽容级；既有测试逐字绿（**68 文件**）。
3. 正交断言（T5.6）通过；契约与 `.openfeel/plan/v1/v1.2.0/deps.yaml` `downstream_contracts` 中 **`name = "src/core/req/ :: 需求原语（stage-81 交付，stage-82/83 消费）"`** 条目一致（**按 name 引用，免序号漂移**——REV-81-007；stage-82/83 直接消费，禁第二套实现）。
4. 正文骨架落盘示例可读、含「权威源 = flow.json」注记。
5. 门禁全绿。

## 五、风险

| # | 风险 | 缓解 |
|:-:|------|------|
| R-81-1 | 需求字段破坏既有 flow.json 读写 | 顶层可选字段读侧宽容（`getRequirements` 派生 `?? []`；不 load 补齐）+ T5.4 兼容断言 + 全量既有测试（68 文件） |
| R-81-2 | ID 分配并发同号 | `save()` 乐观并发校验兜底（exit 2）；单机低频（大计划 R-10） |
| R-81-3 | 正文骨架被误当权威 | 骨架注记「以 flow.json 为准」（T4）+ kb 权威源纪律 |
| R-81-4 | 需求层误耦合 workflow_mode / 归档面 | T5.6 静态正交断言（裁定 J + REV-81-006：`flow-archive` 零 import/零读） |

> 说明：op 级拆分建议——op-001（T1+T2 类型与存储）→ op-002（T3+T4 原语）→ op-003（T5/T6 测试与门禁）；由 openfeel-schemer 定稿并落 `ops/deps.yaml`。

## 六、修订记录

| 时间 | 制定人 | 说明 |
|------|--------|------|
| 2026-10-11 | openfeel-planner | 初稿（立项随批次落盘）：T1~T6；依据大计划 §三 表 B 裁定 A/B/C/D/E/F/J/K/L 与 §二 表 B。**只写计划文档，未改源码、未动 flow.json。** |
| 2026-10-12 | openfeel-planner | **计划审查 REV 修订轮（REV-81-001~008 落实）**：001 基线刷新三处——flow.json **8 阶段**/`archived_versions` **9 项**（stage-80 迁移后）、测试 **68 文件**、`lint i18n` **829**（复现命令在文；806 系行首引号键偏差口径）；002 行号改「符号名 @ 行号」双锚并重钉 HEAD `3be254c`（原 `84951ce`）；003 采纳**方案 (a) 读侧宽容**（不 load 补齐，对齐 REV-78-015；`getRequirements` 派生 + `addRequirement` 内 `??= []`），§一/§二/T2 措辞更正、`deps.yaml` 契约同步；004 新增「承接上游 pending REV」表（REV-80 pending 13 条逐条处置/移交）；005 T3 删 `source?` + 显式**新建即 `status:'draft'`**；006 补 `flow-archive` 边界声明（不 import/不读、本版不归档 `requirements`）并纳入 T5.6 断言；007 §四.3 改按 `name` 引用 `downstream_contracts`；008 新增「开放问题」小节登记 Q4-schema（`reason`）。**只改计划文档，未改源码、未直写 flow.json、未推进 phase。** |
