# v1.2.1-stage-87 计划 — 需求接取制度与拆分（主题一）

- **阶段**：`v1.2.1-stage-87`（七主题之一 · 需求接取制度与拆分）
- **依赖**：**hard: `v1.2.1-stage-86`**（大计划 §四 依赖图 + `deps.yaml`）。实质 = **顺序 + 度量前置**（设计 §9 S2 依赖 S1）；功能面无代码级依赖——本阶段在 v1.2.0 需求系统（引擎 + 命令面 + 聚合）之上增量，86 的埋点/日志供本阶段验收做可观测性登记。
- **优先级**：P0
- **制定人**：openfeel-planner ｜ **制定时间**：2026-10-15 ｜ **修订轮**：初稿
- **基线**：**HEAD `4c18dbc`**（stage-86 归档提交「chore: 阶段归档 v1.2.1-stage-86」；op 收口 `7a56fa3`。全表实测；文中行号均以该基线为准）
- **上游基线（stage-86 归档登记值）**：测试 **71 文件 / 1591 用例** 0 skipped / 0 failed；`npx tsc --noEmit` = 0；`openfeel lint i18n` = **912**；`lint kb` = 0（545 引用）；build ×2 幂等；`--version` = **1.2.0**（本阶段不改版本，归 stage-93）。
- **定位**：把「需求接取制度」从机制层（v1.2.0 已有 `claim`/`release` + 占用校验）升级为**完整工作模式**（设计 §2.3/§2.4/§3；大计划附录 A「stage-87」）——① **拆分一等动作**（`req split` + `parent_id?` 可选字段 + 父子展示）；② **并行接取就绪**（接取视图增强 + 两子需求并行 claim 断言；机制层零改动）；③ **版本解绑语义**（需求不绑版本、版本号仅发布时推进——核验 + 断言 + skill 落文）。**设计原文**：拆分即「拆解为可独立执行/并行的子需求并**发布**」（§3.2）、「鼓励拆分需求并行执行」（§3.3）、「复用并强化 v1.2.0 已建的 `openfeel req`」（§3.4）。
- **范围**：`src/core/req/{types,requirement-ops,body-file}.ts` / `src/commands/req.ts` / `src/core/i18n-data/{zh-CN,en}.ts` / `src/core/templates-data/skills/openfeel-req/SKILL.md`（最小追加）/ `src/core/template-loader.ts` + `src/core/update.ts`（build 双生成物重生成，禁手改）/ `test/core/req.test.ts` / `test/commands/req.test.ts`。
- **边界**：
  1. **父子关系仅溯源**：不做需求树状态聚合（父不聚合子）；聚合 done 判定单源恒为 `allLinkedStagesDone`，**禁第二份 `.every(` 表达式**（承 REV-83-002 纪律；`aggregate.ts` 既有零命中断言 `test/core/req.test.ts:918-921` 同口径延伸至本阶段新增代码）。
  2. **`requirements` 不归档**（裁定 M 维持 v1.2.0 裁定 W；跨版本需求切分问题不在本版回答）。
  3. **`claim`/`release`/状态流转表/done 门零改动**——「接取制为默认调度」是工作模式强化，机制层（占用校验 / `owner`+`claimed_at` / 终态门）原样复用（核验 B3）。
  4. **`workflow_mode` 零触碰（supersede 显式记录）**：本版本将 **supersede `kb/architecture.md #需求层正交边界架构`** 中「需求与 `workflow_mode` 解耦」的断言（大计划裁定 D——需求级模式属性）——**落点 = stage-90**（`RequirementData.workflow_mode?` 字段 + 6 禁止串断言**显式改写**〔禁删除〕）+ **归档轮**（kb supersede 记录〔追加式，五要素〕+ ADR）；**本阶段正交断言（两处 `NEEDLES` 6 串：`test/core/req.test.ts:616-648` / `:899-916`）保持通过、零改写**，新增 `parent_id`/`req split` 不引入任何禁止串。**stage-90 supersede 承接面（补登记，REV-87-003）**：除 kb 条目 / `RequirementData.workflow_mode?` 字段 / 6 禁止串断言外，**并入** `src/core/templates-data/skills/openfeel-req/SKILL.md:3` description 末「与 `workflow_mode` 正交」表述 + `:74-76`「## 与 workflow_mode 正交」节——三者**同批**改写（skill 属双生成物，须同批 `npm run build`）。
  5. 不做「通知 feel」Handoff 通道与调度机制（归 stage-88）；不做需求级模式属性（归 90）；不做并行编排契约与组合转移复用（归 92）。
  6. 不改 phase 枚举（15）/ `checkpoint_mapping` / `advanceAccepted` 语义；不改 `flow.json` 既有结构（`FlowData.requirements?` 顶层可选 + `StageData.requirement_id?` 零变化——`src/core/flow-manager.ts:112/:129`）。
  7. 本阶段**不改版本号**（`--version` 保持 1.2.0，收口归 stage-93）；manual 更新归归档轮（归档官）；README / docs / CHANGELOG / cli-usage skill 快照归 stage-93。
  8. 命令面纪律：`--json` 成功/失败同契约（stdout 纯单文档 + `schemaVersion:1` + 失败含 `error` 码、stderr 零输出）+ help 键双规（新增键加入 `EXPECTED` 双向断言，37 → N **显式计数**）；既有 10 子命令 human/`--json` 输出**逐字零回归**。**零回归口径（REV-87-001 定稿）**：`--json` 成功/失败同契约对 11 子命令逐字零回归；human 逐字零回归范围 = `add`/`list`/`claim`/`release`/`set`/`link`/`advance` 7 个 + `board`（无 owner 条目）+ `next`（缺省或 `--limit 1`）；**有意增量（登记制，非回归）** = `show` 恒追加 2 行 / `board` owner 非空时后缀 / `next --limit > 1` 多行 / 新增 `split` 子命令。
  9. 不新增第三方依赖；不 `npm publish`、不 `git push`；**不直写 `flow.json`**；不推进 phase（由 Feel 经 CLI 执行）；提交精确 `git add`（禁 `-A`——kb #方案层 ops 产出的审计链完整性）。

## KB 检索（`openfeel-check-kb`）

已加载 `.openfeel/kb/index.md`（architecture 43 / patterns 183 / troubleshooting 63 / setup 6）。**高度相关条目**：

- `kb/architecture.md #需求流转四层模型架构`（需求 = 排期与调度层 + 阶段 phase 聚合投影）→ 本阶段 = 在该模型内扩展**拆分层**（父子溯源）；四层模型与「工序单一事实源 = 阶段 phase」不变。
- `kb/architecture.md #需求层正交边界架构`（6 禁止串 + 静态断言）→ **本版将 supersede 其「需求与 workflow_mode 解耦」断言（裁定 D）；落点 stage-90 + 归档轮；本阶段零改写（显式记录，见头部边界 4）**。
- `kb/architecture.md #需求命令面架构（引擎单点 + 命令层零业务逻辑）` → `req split` 落法：引擎新增原语 + 命令薄层（解析 → 原语 → 错误码映射 → 单次 `save()`）。
- `kb/architecture.md #双层状态聚合架构（单源委托 allLinkedStagesDone + 空集守卫）` → `parent_id` 不入聚合判定；`.every(` 零命中纪律。
- `kb/patterns.md #需求引擎不变量模式`（ID max+1 不回收 / 认领占用 / 状态流转单点表 / done 门空集守卫）→ split 原语同款纪律：子需求顺序分配 ID、批量构造事务性（全成或零变更）、审计内嵌。
- `kb/patterns.md #CLI --json 成功/失败同契约` + `#help 键命名双规与防死键双向断言` + `#CLI 退出码语义` → `req split` 契约纪律；`EXPECTED` 扩集。
- `kb/patterns.md #顶层可选字段「读侧宽容不注入」模式` + `kb/troubleshooting.md #可选字段「读侧补齐」的序列化副作用` → `parent_id?` 不 load 补齐；存量 flow.json `load→save` 零注入（字节级断言）。
- `kb/patterns.md #审计日志 action 命名与双轨语义模式` → split 审计 action 命名 `requirement_split`（对齐 `requirement_*` 族：add/claim/release/update/status/link/auto_done/auto_reopen）。
- `kb/patterns.md #supersede 历史决策的追加式记录模式`（保留原行 + 追加注记块五要素）→ supersede 记录形态；**执行归归档轮**。
- `kb/patterns.md #CLI 用法 skill 化模式`（权威源单文件 + build 双注入 + 快照声明）+ `kb/troubleshooting.md #改 templates-data 源须同批重生成「双生成物」` → `openfeel-req` skill 最小追加 + 同批 `npm run build`。
- `kb/troubleshooting.md #flow.json 内容增量核验必含 meta.revision/meta.updated` → 写命令验收核验点口径。
- `kb/patterns.md #零回归取证范式（补丁前/后归一化快照 diff 空 + golden 内联 + 正控防假绿）` → 既有 10 子命令输出逐字取证。
- `kb/patterns.md #跨阶段承接 REV 与处置表`（子条款，REV-85-002 固化）→ §七。
- **无**「需求拆分父子模型 / 并行接取视图 / 版本解绑」既有条目 → 归档轮补沉（patterns：拆分父子模型〔顺序 ID + 事务性 + 仅溯源〕、接取视图增强范式；architecture：需求拆分语义扩展）。

## 一、背景与实测证据（基线 HEAD `4c18dbc`）

| # | 事实（实测复核） | 位置 | 结论 |
|:-:|------|------|------|
| B1 | `RequirementData` **10 字段**（`id`/`title`/`status`/`target_version?`/`priority?`/`owner?`/`claimed_at?`/`created_at`/`updated_at`/`body_path?`）——**无 parent_id**；文件头「正交声明：零 import（叶子模块）；不依赖归档层 / 不引用工作流模式字段」 | `src/core/req/types.ts:22-43` | 拆分须新增**可选** `parent_id?`（读侧宽容）；正交声明行保持 |
| B2 | `openfeel req` **10 子命令**（add/list/show/claim/release/set/link/advance/board/next）；命令层零业务逻辑（解析 → 引擎原语 → 错误码→文案映射 → `process.exitCode`） | `src/commands/req.ts:90-575` | 新增 `split` = 引擎原语 + 命令注册两处；既有 10 子命令零改动（新增非破坏） |
| B3 | 认领协议在位：`claimRequirement` 占用校验（他人占用 → `already_claimed` exit 1 **零写盘**，无 `--force`；同 owner 幂等；终态拒绝）+ `releaseRequirement`（无占用者 no-op 成功）；`--owner` 三级链（`.info.json` → git → 哨兵拒绝） | `src/core/req/requirement-ops.ts:117-142`；`commands/req.ts:264-274` | 「并行接取」**机制层已具备**（占用校验 per-需求）；本阶段 = 视图增强 + 并行 claim 断言，**机制零改动** |
| B4 | `PATCH_WHITELIST` **4 键**（status/title/target_version/priority）；白名单外键 → `invalid_field` | `requirement-ops.ts:177` | `parent_id` 建议**不进白名单**（父子经 split 建立、不提供改绑——方案期定稿，Q4 附议） |
| B5 | done 判定单源：`allLinkedStagesDone`（含空集守卫）；聚合 `computeRequirementAggregate` done 分支直委托之；`aggregate.ts` 静态断言「`.every(` 零命中 + 委托 `allLinkedStagesDone(`」 | `requirement-ops.ts:76-79`；`aggregate.ts:40-56`；`test/core/req.test.ts:918-921` | `parent_id` **不得入聚合判定**（裁定 F）；本阶段新增代码同口径断言（R-87-1） |
| B6 | 正交断言两处：① req 三文件（`types.ts`/`requirement-ops.ts`/`body-file.ts`）② `aggregate.ts`；各含 `NEEDLES` **6 串**（`workflow_mode`/`PIPELINE_PHASES`/`getValidTargets`/`flow-archive`/`process.cwd`/`homedir`）+ 清单锁定 + 正控 + 全内容（含注释）零命中 | `test/core/req.test.ts:616-648` / `:899-916` | 本阶段新增代码保持 6 串零命中；**断言零改写**（supersede 归 stage-90） |
| B7 | 正文骨架 `renderRequirementBodySkeleton`：六 H2 章节（状态/摘要/目标与验收/预估版本/关联阶段/变更记录）；`target_version` 缺省渲染「（未指定）」；断言方式 = `toContain` 章节 + **`^## ` 计数 = 6** | `body-file.ts:32-66`；`test/core/req.test.ts:511-560` | 父需求展示落骨架（建议增 `## 父需求` 节——沿「恒渲染（无）」先例）；**`^## ` 计数断言须同批 6 → 7 修订**（§六 R-87-3） |
| B8 | ID 分配 `nextRequirementId` = max+1 不回收（异常 id 跳过不崩）；`addRequirement` 恒 `status: 'draft'`（REV-81-005）+ 唯一抛错原语（构造期契约违反抛错）；`requirements` 非数组 → 容器化重建（BUG-001 单点） | `requirement-ops.ts:59-68 / 88-114` | split 批量创建须**顺序分配**（第 N 子 = max+1+N）且**全成或零变更**；子需求初始状态显式裁定（建议 `scheduled`——拆分即发布，Q11） |
| B9 | `req next` 排序**冻结**（target_version 升序〔未指定恒最后〕→ created_at → id）；候选 = `scheduled` ∧（未认领 ∨ `owner === --owner`）——已认领者天然移出候选池；`req board` 7 组固定顺序（恒含空组，域外脏状态不渲染） | `commands/req.ts:526-574 / 492-524` | 「顺序并行接取」现状已可用；增强须保排序/分组/只读（零 save/零 appendLog）语义零变 |
| B10 | help 键**双向逐键断言**：`EXPECTED` **37 键**（① 正向 zh/en `hasKey` ② 反向命令树生成键 ⊆ 期望 ③ 集合大小相等 ④ `applyHelpI18n` 生效）；help 键双规（arg 取参数名逐字 / option 取 camelCase） | `test/commands/req.test.ts:950-1005` | 新增命令/参数 help 键须加入 `EXPECTED`（37 → N **显式计数**）；未登记键即红 |
| B11 | i18n 结构：`help` 域含 37 个 `help.req.*` 键；`req` 域 42 键（消息）；域注册在 `src/core/i18n.ts:28/34`（`req as zhReq/enReq`）——新增键落 `i18n-data` 两文件即可，**不改 `i18n.ts`** | 实测 | 新 help 键 + 新消息键双表成对；`lint i18n` 912 → **新基线显式登记** |
| B12 | 测试面：`test/core/req.test.ts` 1002 行（T5.1~T5.7 + 聚合段）；`test/commands/req.test.ts` 1040 行（T-A/T-B/T-C 段含 37 键 + T-C4「顶层命令组 17 个」零破坏断言） | 实测 | 新增用例落点；T-C4 不受本阶段影响（req 子命令扩展 ≠ 顶层命令组扩展） |
| B13 | skill `openfeel-req`（18 skills 之一，中立共享源）：`:11` 提供版本「v1.2.0 起」+ 快照声明；`:45/:53` 命令表（`req list`/`req next` 行含 `--target-version`） | `src/core/templates-data/skills/openfeel-req/SKILL.md` | 最小追加：`req split` 行 + 版本解绑口径行；**同批 `npm run build`**（双生成物） |
| B14 | 上游账目：stage-86 归档（`4c18dbc`）；`REV-86.md` 台账 **8 closed + 2 pending low**（REV-86-009 测试覆盖瑕疵 / REV-86-010 session 写盘守卫）；本仓 flow.json `requirements` 字段缺省（0 条） | 实测 + `.openfeel/users/Liuary/code_review/REV-86.md` | 承接表 §七（2 条均显式转后续，本阶段处置 0、零灭失）；本阶段以 `full` 运行（大计划裁定 B） |
| B15 | 门禁基线（stage-86 归档登记）：71 文件 / 1591 用例 0 skipped / 0 failed；`tsc` 0；`lint i18n` 912；`lint kb` 0（545 引用）；build ×2 幂等 | 大计划 §八 + kb index 里程碑 | 本阶段新增用例与 i18n 键 → 门禁显式登记**新基线** |
| B16 | 设计语义原文：§2.3「需求为核心，流水线与版本解绑」（版本号仅发布时推进 / 不绑版本）；§2.4「需求接取制度（feel 发布 → Agent 接取；feel 中介）」；§3.1 主流程「feel 拆分需求（需求转规划）→ 发布子需求」；§3.3「鼓励拆分需求并行执行」；§3.4「复用并强化 v1.2.0 的 `openfeel req`」（强化点三条：版本解绑 / 接取制默认 / 拆分一等动作） | `docs/v1.2.1-design.md:133-182` | 本阶段设计权威（用户定稿） |

---

## 二、目标语义与不变量

| 维度 | 内容 |
|------|------|
| 拆分 | `req split <id>` → 子需求 N 条（`parent_id` = 父；各自独立 ID / 正文 / 认领 / 阶段关联）；**拆分即发布**（子需求入 `scheduled` 候选池——Q11 建议，方案期定稿）；父需求**零副作用**（状态不变，由 feel 显式流转） |
| 父子展示 | `req show` 父行 + 子列表（人读）；`--json` 追加 `parent` / `children` 键（**只增不改**）；正文骨架增父需求节 |
| 并行接取 | 两子需求两 owner 并行 claim **互不阻塞**（占用校验 per-需求，机制零改动）；接取视图增强（`req next`/`req board`——范围 Q10 方案期定稿） |
| 版本解绑 | `target_version` 维持**可选**且**不作任何门**（核验清单 T3）；「版本号仅发布时推进」契约落 skill `openfeel-req` + 显式断言 |
| 语义冻结源 | 设计 §2.3/§2.4/§3（用户定稿）；v1.2.0 需求系统既有语义（10 子命令 / 7 状态 / 聚合单源）原样保留 |

**不变量**：

1. **聚合单源**：done 判定恒经 `allLinkedStagesDone`；`parent_id` 不入聚合（禁父聚合子 / 禁第二份 `.every(` 表达式——承 REV-83-002 + 大计划风险 R-9）。
2. **可选字段 + 读侧宽容**：`parent_id?` 不 load 补齐；存量 flow.json（含无 `requirements` 字段者）`load→save` **零注入**（字节级断言——kb #顶层可选字段模式 / #读侧补齐副作用）。
3. **正交边界保持**：`src/core/req/**` 6 禁止串零命中（两处断言**零改写**）；**workflow_mode 解耦的 supersede 归 stage-90**（本阶段显式记录、不执行——大计划裁定 D）。
4. **机制层零改动**：`claim` / `release` / `ALLOWED_TRANSITIONS` / done 门 / `link` 行为逐字不变；「接取制为默认调度」= 工作模式（skill 落文）+ 视图，不改协议。
5. **契约纪律**：`--json` 只增不改 + `schemaVersion:1` + 失败同契约；help 键双规 + `EXPECTED` 显式计数；退出码 0/1/2 语义不变。
6. **build 双生成物**：`templates-data` 源（skill）改动须同批 `npm run build`（`template-loader.ts` + `update.ts` 禁手改；幂等断言照跑）。
7. **零回归 + 有意变更显式登记**：既有断言（37 键 / 骨架 `^## ` 计数 / 正交 / T-C4）**同批扩展而非弱化**；有意变更逐条登记（如骨架 `^## ` 计数 6→7、`EXPECTED` 37→N）；`--version` 保持 1.2.0。
8. **提交卫生**：精确 `git add`（禁 `-A`）；不 push / 不 publish / 不直写 flow.json。

---

## 三、变更点清单（编号 T）

### T1 — 拆分一等动作（`req split` + `parent_id?` + 父子展示）

- **引擎面**：
  - `types.ts`：`RequirementData` 增**可选** `parent_id?: string`（注释：拆分来源父需求 ID；**仅溯源、不参与聚合**）。
  - `requirement-ops.ts`：新增 `splitRequirement(data, parentId, children)` 原语（形态 Q4 方案期定稿）：
    - 门：父不存在 → `not_found`；父**终态**（done/cancelled/rejected）→ `invalid_status`（与 claim/link 同款终态门）；子项校验失败 → `invalid_field`（对齐 `addRequirement` 口径：空标题 / 非法 priority / 空 target_version）；**全失败路径零变更零审计**。
    - 构造：子需求逐条经**顺序分配**（第 N 子 = `nextRequirementId` 当前 max+1+N）；`parent_id = parentId`；`created_at`/`updated_at` 同批；初始状态**建议 `scheduled`**（拆分即发布——Q11；替代口径 draft 两段式见 §四）。
    - 事务性：**纯内存一次性完成**（全部子项构造成功才并入 `data.requirements`）；审计一条 `requirement_split`（`{parentId, children: [ids]}`——命名对齐 `requirement_*` 族）。
    - 返回子需求**本体列表**（供命令层逐条铺正文，对齐 `addRequirement` 返回本体先例；禁浅副本路径）。
  - `body-file.ts`：骨架增 `## 父需求` 节（建议沿 `target_version` 先例**恒渲染**：有 → `REQ-NNN`；无 → `（无）`）——**`^## ` 计数断言须同批 6 → 7**。
- **命令面**（`commands/req.ts`）：
  - `req split <id>`（参数形态 Q4：建议 `--into <title>`（repeatable，最少 1 项）——方案期定稿）；`--json` 同契约；子需求逐条 `writeRequirementBodySkeleton` → **单次 `save()`**（正文写失败 → 不 save，flow.json 零变更——对齐 `req add` 先例）；输出子需求 ID 列表 + 正文路径。
  - `req show`：人读增「父需求:」/「子需求:」行；`--json` 载荷追加 `parent`（`string | null`）与 `children`（`string[]`）键——**只增不改**（既有三键逐字）。
- **i18n**：`help.req.split` + `split.*` 参数键（`argid`/`into`/`json`）+ `req` 域消息键（`split.doneTmpl`/`split.childTmpl`/错误码文案如有）；`show` 域增 `parentTmpl`/`childrenTmpl`（人读）。
- **单测**：core（split 各门 / 顺序 ID / 事务性〔中途校验失败零变更〕/ 父终态拒绝 / 审计单条 / `parent_id` 读侧宽容与零注入 / 骨架父行 + `^## ` 7）；commands（实跑 / `--json` 契约 / 失败分流零写盘 / help 键登记）。
- **边界**：不做多层聚合/级联/重绑（改 `parent_id`）/环检测——子项 ID 恒为新 max+1，`child.parent_id → parent` 方向固定，**结构上无环**（断言说明即可）。

### T2 — 并行接取就绪（视图增强 + 断言）

- **建议主形态**（方案期定稿；大计划原文「board/next 增强，方案期定稿范围」）：
  - ① `req next --limit <n>`（n ≥ 1 校验；缺省 **1 = 逐字零回归**）；`--json` 缺省保持 `{schemaVersion, requirement}` 逐字、`--limit >1` 时**追加** `candidates`（数组）键——只增不改。
  - ② `req board` 条目行增 owner 后缀（人读可读性；`--json` groups **不变**——元素本为完整 `RequirementData`，已含 `owner`/`parent_id`）。
  - 候选（方案期裁定是否纳入）：`req next` 未认领优先微调 / board 父子缩进 / 组合过滤。
- **断言与取证**：
  - 两子需求两 owner **并行 claim 互不阻塞**（隔离临时项目；同进程顺序模拟 = 语义层验证——真并发同毫秒的 `exit 2`〔跨进程锁 + revision 乐观锁〕为既有语义、非回归，验收口径须写明）。
  - 占用校验零回归（既有用例）；`req next` 排序冻结与 board 7 组/恒含空组语义零变；**只读命令零写盘**（不 save / 不 appendLog）。
- **边界**：不新增调度命令（Handoff/派发归 stage-88）；不改 claim 协议；不动 `flow.json` 并发机制。

### T3 — 版本解绑语义（核验 + 落文 + 断言）

- **核验清单**（源码事实枚举——`target_version` 全消费点，**无一处作为门**）：`types.ts:30`（可选字段）；`requirement-ops.ts:46-55`（过滤）/`:98-109`（add 构造期仅空串拒绝）/`:204-232`（update 值校验）；`commands/req.ts:113/168/228/362/508/548`（传递/展示/过滤/排序）；`body-file.ts:33-34`（渲染「（未指定）」）。状态流转表 / claim / link / done 门**均无版本条件**。
- **落文**（skill `openfeel-req` 最小追加，功能性规则行——受单写者纪律约束不做重写，收编归 stage-91）：
  - 命令表增 `req split` 行；
  - 新增/追加「需求与版本解绑」一行：需求**不绑版本**（`target_version` 可选、非门）；**版本号仅在发布时推进**（日常需求不推进版本号）；
  - 并行接取一行（拆分 → 子需求并行接取；接取制为默认调度语义一行）。
  - **同批 `npm run build`**（双生成物重生成）。
- **断言**：新增显式用例「**无 `target_version` 全生命周期可用**」（add → claim → link → advance done → 聚合 `requirement_auto_done`；防未来引入版本门）；既有「可选字段缺省不写键」断言（`test/core/req.test.ts:125`）保持。
- **登记（不本阶段改）**：`docs/commands.md` / `manual/{core,cli}/req.md` / README / CHANGELOG 的同步归 stage-93 与归档轮（口径清单在计划内登记，防遗漏）。

### T4 — 门禁与零回归（与阶段末 op 同批；承 v1.2.0 / stage-86 口径）

- **门禁**：`npm run build` ×2 幂等（`git status --porcelain src/` 口径 = 变更行 ⊆ 本阶段 `produces` 清单，直搬「空」口径不可达——承 stage-86 说明⑤）→ `npm test`（**新基线显式登记**：71+ 文件 / 1591+ 用例，0 skipped / 0 failed）→ `npx tsc --noEmit` = 0 → `openfeel lint i18n` **新基线**（> 912）→ `lint kb` = 0 → 实跑验收（§五）。
- **零回归断言**：既有 10 子命令 human/`--json` 输出逐字（kb #零回归取证范式）；`EXPECTED` 扩集（37 → N 显式计数 + 双向断言）；正交断言（两处 6 串）**零改写**；`aggregate.ts` `.every(` 零命中保持；`--version` = 1.2.0。
- **有意变更登记**（计划/验收/CHANGELOG〔93〕三处口径）：骨架 `^## ` 计数 6 → 7；`EXPECTED` 37 → N；（如有）`req next` / `board` 人读输出增量。

---

## 四、开放问题建议（Q4 附议 + Q10~Q12 —— 本计划给建议，方案期定稿）

### Q4：`req split` 命令形态与字段名（大计划 §十 原题）

- **命令形态建议**：`req split <id> --into <title> [--into <title>...]`（repeatable option，最少 1 项）。
  - 理由：① Commander repeatable option 原生支持（reducer 累积）；② `--into` 语义直白 =「拆成哪些子需求」；③ 与既有 `req *` 风格一致（显式 option）。
  - 落选形态：variadic 位置参数（Commander 支持有限、与既有风格不一）；交互式（非 TTY 不可用，CLI 一致性差——破坏「脚本可编排」）；`--count N` 自动标题（语义不达意）。
- **字段名建议**：`parent_id`。理由：与既有命名族（`requirement_id` / `stage_id` 风格）一致；语义 =「结构关系」（父持续存在），优于 `split_from`（动作来源，暗示一次性事件）；若未来需要「拆分动作溯源」可另加字段（本版不做——YAGNI）。
- **附议事项**（方案期一并定稿）：
  - `parent_id` **不进** `PATCH_WHITELIST`（不改绑；`req set` 白名单外拒绝——既有语义复用）；
  - 子项可携带 `--priority` / `--target-version`？——建议**支持**（透传子项构造；不传则缺省不写键——零注入口径）；或首版仅 title（最小面）。方案期定稿；
  - 拆分门：非终态父均可拆（含 `blocked`——状态不构成拆分障碍）；终态拒绝。

### Q10：并行接取视图增强的范围（next / board）

- **建议**：主形态 = `req next --limit <n>` + `req board` owner 后缀（见 T2）；候选增强按「小面优先」原则方案期裁定。
- **零回归红线**：`req next` 排序冻结不变；board 7 组恒含空组不变；只读命令零写盘；`--json` 只增键。

### Q11：子需求初始状态（`scheduled` vs `draft`）

- **建议 `scheduled`**（拆分即发布）：设计 §3.2 原文「拆解为可独立执行/并行的子需求并**发布**」；`req next` 候选池即可接取，达成「并行接取就绪」。
- **替代口径 `draft`**（两段式：split + feel 逐条 `advance`）：更保守，但与设计原文「拆分并发布」不合、且给 feel 增加 N 次额外动作。
- **约束**：无论选何者，`req add` 恒 `draft`（REV-81-005）断言**零改动**——split 为独立原语，不共享 add 的初始状态逻辑（若选 draft，则在原语/命令层显式声明）。
- 方案期裁定后，计划/方案/断言三处口径一致。

### Q12：父子展示范围（show-only vs list/board 也加）

- **建议**：主面 = `req show`（父行 + 子列表；`--json` 只增）+ 正文骨架父行；`req list`/`req board` 条目**不动**（避免输出漂移面扩大；board 的 `--json` 元素已含 `parent_id` 字段，机器消费者零缺口）。方案期可裁定 board 是否加缩进。

---

## 五、验收要点（阶段级）

1. **拆分（T1）**：隔离临时项目 `req split` 实跑——父子关系正确（`parent_id` / 子独立 ID〔顺序分配〕/ 独立正文〔含父需求节〕）；子需求**独立可用**（claim / link / advance 全生命周期动作各自成立）；`--json` 契约（成功 `schemaVersion:1` / 失败纯单文档 + exit 1）；失败分流零写盘（父终态 / 父不存在 / 空标题）；存量 flow.json `load→save` **零注入**（字节级断言）。
2. **并行接取（T2）**：两子需求两 owner **并行 claim 互不阻塞**（语义层口径——顺序模拟可复现；真并发 `exit 2` 属既有并发语义）；占用校验零回归；视图增强生效且 `req next` 排序 / board 7 组语义零变；只读命令零写盘。
3. **版本解绑（T3）**：无 `target_version` 全生命周期用例通过；`target_version` 全消费点核验表登记；skill `openfeel-req` 落文在位（split 行 / 解绑口径行）；「版本号仅发布时推进」口径成文（skill + 计划 + 93 收口清单登记）。
4. **零回归**：既有 10 子命令 human/`--json` 逐字；`EXPECTED` 扩集双向断言绿；正交断言零改写且 6 串零命中；聚合单源（`.every(` 零命中 + 委托）保持；`--version` = 1.2.0。
5. **门禁（T4）**：`npm test` **0 skipped / 0 failed**（新基线登记）；`tsc` 0；`lint i18n` 新基线登记；`lint kb` 0；build ×2 幂等（`--porcelain` 口径见 T4）。

## 六、风险

| # | 风险 | 影响 | 缓解 |
|:-:|------|------|------|
| R-87-1 | **父子关系误入聚合判定**（`parent_id` 被用于 done / 聚合 / 父子级联状态） | 高 | 裁定 F：仅溯源；聚合单源断言（禁第二份 `.every(`）+ 本阶段新增代码同口径；审查显式核对 `aggregate.ts` 零改动 |
| R-87-2 | **split 事务半成品**（多子需求创建中途失败 → 部分写入 / 审计半数） | 中 | 引擎面纯内存**全成或零变更**（校验先行）；命令层单次 `save()`；失败路径零写盘用例 |
| R-87-3 | **既有断言漂移**（骨架 `^## ` 计数 6→7 / `EXPECTED` 37→N / 正交断言） | 中 | 断言**同批扩展**（禁弱化）；有意变更三处登记（计划/验收/93 CHANGELOG）；审查核对 diff 仅「增量」 |
| R-87-4 | **「新建恒 draft」语义被 split 破坏**（REV-81-005 既有断言） | 中 | split 独立原语、不共享 add 初始状态路径；`req add` 恒 draft 断言零改动；子需求初始状态显式裁定（Q11） |
| R-87-5 | **skill 改造未同批 build**（双生成物遗漏 / 手改生成物） | 中 | 同批 `npm run build` + `--porcelain` 断言（kb #双生成物）；生成物 **禁手改** |
| R-87-6 | **版本解绑口径失守**（后续实现把 `target_version` 变为必填/门） | 中 | 显式全生命周期断言（无版本全程可用）+ 消费点核验表 + skill 口径落文 |
| R-87-7 | **supersede 越界执行**（本阶段误改正交断言 / 提前移植 workflow_mode） | 中 | 头部边界 4 + 不变量 3 显式声明；stage-90 独立 op 承接改写；归档轮承接 kb supersede 记录；本阶段审查核对 `test/core/req.test.ts` 正交段 diff 为空 |

**回滚**：`parent_id` 为可选字段（缺省即回落，读侧宽容）；`req split` 为新增命令（删除注册即回落）；skill 回滚以源文件 + build 重生成。无数据格式破坏。

## 七、承接 REV 与处置表（REV-85-002 固化口径；REV-86-001 判据源更正）

- **判据源**：上游 pending REV 权威台账 = `.openfeel/users/Liuary/code_review/REV-86.md`（**非** `flow.json.reviews`——该字段为 CLI `ReviewItem[]` 台账）。
- **实测**：REV-86-001~008 **closed**；pending **2 条**（均 low / 非阻塞）：
  - **REV-86-009**（T4.4 用例未命中 `computeResumed`「旧条目缺 `session_id`」分支）——主题 = 可观测性测试覆盖，非本阶段面 → **显式转后续**（建议并入 v1.2.1 收官轮〔93〕承接处置或 v1.3.0 台账）。
  - **REV-86-010**（session env 命中向进程 cwd 写 `.openfeel/tmp/session.json` 守卫缺位）——上游归档轮已登记「留后续版本」→ **显式转后续**（v1.3.0）。
- **三分结论**：本阶段处置 **0** / 显式转后续 **2** / 台账保留·销账 **0** → **零灭失**成立（判据 = 上游台账逐条去向）。
- `deps.yaml`（`.openfeel/plan/v1/v1.2.1/deps.yaml`）`v1.2.1-stage-87.notes` 已含来源与边界声明（实测在位）；本计划**不代改 deps.yaml**。

## 八、op 拆分建议（供 openfeel-schemer 定稿；`est_ops = 3`）

| op | 内容 | 文件（实际名） | 依赖 |
|:--:|------|------|------|
| `op-001` | T1 拆分一等动作：`parent_id?` 字段 + `splitRequirement` 原语（顺序 ID / 事务性 / 终态门 / `requirement_split` 审计）+ `req split` 命令 + `req show` 父子展示 + 正文骨架父行 + i18n + 单测 | `src/core/req/types.ts` / `src/core/req/requirement-ops.ts` / `src/core/req/body-file.ts` / `src/commands/req.ts` / `src/core/i18n-data/{zh-CN,en}.ts` / `test/core/req.test.ts` / `test/commands/req.test.ts` | — |
| `op-002` | T2 并行接取就绪：`req next --limit` + `req board` owner 后缀（形态方案期定稿）+ 并行 claim 断言 + i18n + 单测 | `src/commands/req.ts` / `src/core/i18n-data/{zh-CN,en}.ts` / `test/commands/req.test.ts` | soft: op-001（同文件区，命令面串行更稳） |
| `op-003` | T3 版本解绑核验 + 断言 + skill `openfeel-req` 最小追加 + build 双生成物重生成 + **T4 门禁**（阶段末 op；门禁全绿后交审查） | `src/core/templates-data/skills/openfeel-req/SKILL.md` / `src/core/template-loader.ts` / `src/core/update.ts`（build 生成）/ `test/core/req.test.ts`（断言）+ 门禁全量 | hard: op-001, op-002 |

> op 级依赖与文件清单由 openfeel-schemer 落 `ops/deps.yaml`（hard / soft / mutual_exclusion，声明实际文件名）。

## 九、修订记录

| 时间 | 制定人 | 说明 |
|------|--------|------|
| 2026-10-15 | openfeel-planner | 初稿：依据大计划 `.openfeel/plan/v1/v1.2.1/plan.md`（附录 A「stage-87 需求接取制度与拆分」+ §二 表 B + §三 裁定 B/F/M/O）+ 设计 §2.3/§2.4/§3 + `deps.yaml` stage-87 notes；源码复核 B1~B16（12 处行号实测 + 断言面清点 + 上游 REV 台账）；T1~T4；**Q4 附议 / Q10~Q12 方案建议**（§四）；风险 R-87-1~7；承接表（2 条显式转后续）；op 拆分建议（3 op）。**只写计划文档，未改源码、未直写 flow.json、未推进 phase、未改 deps.yaml、未写其它阶段文件。** |
| 2026-10-15 | openfeel-executor（op-003 §3.5；方案期定稿文本） | REV 吸收：边界 8 增列零回归口径（REV-87-001）；边界 4 补登 skill `openfeel-req` 的 stage-90 supersede 承接面（REV-87-003）。 |
