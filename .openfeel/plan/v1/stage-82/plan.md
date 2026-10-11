# v1.2.0-stage-82 计划 — 需求命令面（openfeel req 顶层命令组）

- **阶段**：`v1.2.0-stage-82`（主题一 · 需求流转第二阶段）
- **依赖**：**hard: v1.2.0-stage-81**（消费 `src/core/req/` 全部原语；契约见大计划 §既有 `downstream_contracts` 第 2 条〔按 name 引用，免序号漂移——REV-81-007〕）
- **优先级**：P0（把需求引擎暴露为 Agent/人可操作的命令面——用户诉求「Agent 接取后流转需求状态」的直接落点）
- **制定人**：openfeel-planner ｜ **制定时间**：2026-10-11 ｜ **锚点基线**：HEAD `c5f1d53`（2026-10-12 复核；行号漂移以符号名为准——REV-82-014）
- **定位**：新增**顶层命令组** `openfeel req`（10 子命令：`add` / `list` / `show` / `claim` / `release` / `set` / `link` / `advance` / `board` / `next`）——命令层**零业务逻辑**（解析 / 校验 / ID / 写入单点在 core，核验 B16）；**命令层零校验**（流转合法性 / 占用 / 关联唯一性 / 写命令字段校验一律由引擎单点判定，命令层仅错误码→文案映射；读命令过滤值域仅取 core 常量防 typo——REV-82-003/006）；`--json` 沿用 `schemaVersion:1`；退出码语义（并发 2 / 通用 1）。
- **范围**：新建 `src/commands/req.ts`；`src/cli/index.ts` **两行注册**（import + register，核验 B11）；`src/core/i18n-data/{zh-CN,en}.ts`（新键双表 + help 域）；新建 `test/commands/req.test.ts` + `test/core/req.test.ts` 追加承接用例段（REV-82-004）；`src/core/req/requirement-ops.ts` 小幅补丁（**新增导出 `getAllowedNextStatuses(status)`**〔REV-82-003〕+ `addRequirement` 非数组守卫收口〔`req/BUG-001` = REV-81-019 同处，见「承接 REV 与处置表」〕，同阶段内完成）。
- **边界**：**不做**聚合判定与自动回写（归 stage-83；`src/commands/req.ts` 禁算 done/进度——REV-82-013；本阶段 `req advance --to done` 走**引擎显式校验**：全部关联阶段 done 才可，不设 `--force`——裁定 M）；**不做** Agent 模板 / skill（归 stage-84）；不改既有命令输出；不新增第三方依赖；不 `npm publish` / 不 `git push`；不直写 `flow.json`。

## KB 检索（`openfeel-check-kb`）

- 已加载。**高度相关条目**：
  - `kb/patterns.md #CLI --json 结构化输出约定：顶层对象 + schemaVersion + 纯 JSON 单文档` → 全部子命令 `--json` 纯单文档（**成功与失败同契约**——REV-82-007）；与人类输出互斥。
  - `kb/patterns.md #破坏性命令安全校验清单模式：默认拒绝 + 显式越权 + 可预览 + 可审计` → `claim` 占用 / `link` 关联唯一性 / `advance` 目标合法性：**校验单点在引擎**（命令层零校验——REV-82-003/006），失败即 exit 1 零写盘。
  - `kb/patterns.md #命令面收敛与弃用策略` + `#短名/全名 stage 解析归一化` → `link --stage` 经 `normalizeStageId` 归一（核验 B18），**禁自写解析**；`req` 为**新命令组**（非弃用面）。
  - `kb/patterns.md #CLI 退出码语义：非 0 退出 + process.exitCode + 无逃生阀` → 值域/占用/存在性失败 exit 1；并发冲突复用 `handleConcurrentConflict`（exit 2）。
  - `kb/patterns.md #CLI 国际化封装模式` + `#部署型资产变更的多载体同步面清单` → 新键双表 + `help.req.*` 域键；文案入 i18n。
  - `kb/patterns.md #两阶段状态 draft/publish 的窄兼容设计` → 7 状态在 `list --status` / `board` 分组 / `next` 筛选各自路径显式处理（逐一回答）。
  - **无**「req 命令面」既有条目 → 归档时补沉 patterns（需求命令面与生命周期）。

---

## 一、背景与实测证据（大计划 §二 表 B 摘引 + stage-81 引擎契约复验）

> 锚点口径：**符号名 @ 行号**双锚 + 钉 HEAD **`c5f1d53`**（2026-10-12 复核实测；漂移以符号名为准——REV-82-014）。

| 事实 | 符号 @ 行号（HEAD `c5f1d53`） | 结论 |
|------|------|------|
| 命令注册唯一入口：16 命令组 import / register 段 | `src/cli/index.ts :: import @ :59-74` / `register @ :76-91` | `registerReqCommand` 两行接入 |
| 命令组范式（子命令 + `common.errorTmpl` + `process.exitCode = 1`） | `src/commands/roadmap.ts :: registerRoadmapCommand @ :9-46` | `src/commands/req.ts` 同范式 |
| `plan stage add` 值域校验（schema/常量派生、非法 exit 1 零副作用） | `src/commands/plan.ts :: plan stage add 值域校验块 @ :46-71` | 值域派生范式参照；**流转合法性不照搬**（`set`/`advance` 零命令层校验——REV-82-003） |
| `flow mode` 只读 + `--json` 范式；REQ 类 ID 非法 → exit 1 防 typo | `src/commands/flow.ts :: flow mode action @ :481-530`（`--json` @ :528） | `req show/board` 同范式 |
| `flow review add` 命令层单点调用（引擎单点在 `addReviewEntry`） | `src/commands/flow.ts :: flow review add 调用 @ :1195-1199` | `req` 全部子命令单点在 core |
| `flow phases --json` 含 `schemaVersion:1` | `src/commands/flow.ts :: flow phases --json 分支 @ :448-451`（`schemaVersion` @ :451） | `req --json` 沿用 |
| 并发冲突统一处理 | `src/commands/shared/errors.ts :: handleConcurrentConflict @ :19-28` | 写命令捕获后 exit 2 |
| 非业务冲突通用模板（exit 1） | `src/commands/shared/errors.ts :: common.errorTmpl 分支 @ :47-49` | `req add` 抛错路径经此（分流矩阵见 §二 不变量 2） |
| 引擎：`addRequirement` **唯一抛错原语**（空 title / 非法 priority / 空 target_version） | `src/core/req/requirement-ops.ts :: addRequirement @ :87-112`（抛错 @ :92/:94/:97；写路径兜底 @ :98） | `req add` 抛错分流（REV-82-002）；`:98` 即 `req/BUG-001` 缺陷点 |
| 引擎：`linkRequirement` 重绑硬拒 + `null` 解绑 | `requirement-ops.ts :: linkRequirement @ :245-265`（`already_linked` @ :254；解绑 @ :260-264） | `req link` **不设覆盖**；解绑 = `--unlink`（REV-82-001） |
| 引擎：流转表**模块私有未导出** | `requirement-ops.ts :: ALLOWED_TRANSITIONS @ :143-149`（`blocked` 出口 @ :147） | 「列合法目标」须**新增导出** `getAllowedNextStatuses`（REV-82-003） |
| 引擎：`claimRequirement` 返回码含 `invalid_field`（owner 空串） | `requirement-ops.ts :: claimRequirement @ :115-128`（`:117`） | claim 错误码四态（REV-82-009） |
| 引擎：`releaseRequirement` 无占用 = no-op 成功 | `requirement-ops.ts :: releaseRequirement @ :131-140`（`:134`） | `req release` 恒 exit 0（REV-82-010） |
| 引擎：字段更新与显式推进**同单点**（含 done 门） | `requirement-ops.ts :: updateRequirement @ :173-233` / `advanceRequirement @ :236-238` / `applyStatusChange @ :152-164`（done 门 @ :158） | `set`/`advance` 共享单点；命令层零第二份 |
| help 域键生成器（arg 键 = `arg` + 参数名逐字 / option 键 = camelCase；`hasKey` 未命中 → 死键静默） | `src/cli/index.ts :: applyHelpI18n @ :96-175`（arg @ :124-131；option @ :134-146） | T4 区分登记（REV-82-011） |
| 全局 `-v, --version` 已被占用 | `src/cli/index.ts :: program.version @ :23` | 子命令**零 `--version`**，全组统一 `--target-version`（REV-82-008） |
| i18n 双文件基线 **829**（复现：`OPENFEEL_LOG=0 node bin/openfeel.js lint i18n` → 「✅ 829 键一致」） | `src/core/i18n-data/{zh-CN,en}.ts` | 新键显式登记（本阶段为 i18n 主要增量面） |

---

## 二、目标语义与不变量

| 子命令 | 语义（要点） |
|--------|------|
| `req add <title> [--target-version] [--priority]` | 创建需求（ID 自动）+ 正文骨架铺；非法入参 → 引擎**抛错** → 通用模板 exit 1（唯一抛错分流——REV-82-002） |
| `req list [--status] [--target-version] [--owner] [--json]` | 过滤列表（`--status` 值域派生自 core `REQ_STATUSES` 单一来源，非法 exit 1 防 typo） |
| `req show <REQ-NNN> [--json]` | 详情（关联阶段**仅原始只读枚举**；**禁**在命令层计算 done/进度/聚合摘要——归 stage-83，REV-82-013） |
| `req claim <REQ-NNN> [--owner <name>]` | 认领（占用校验由引擎单点）；`--owner` 缺省链 = `.openfeel/.info.json` 的 `user` → `git config user.name` → 两者皆无则**拒绝**并提示显式 `--owner`（**禁硬编码用户名**——REV-82-012） |
| `req release <REQ-NNN>` | 释放（清 owner/claimed_at；未占用 = no-op 成功，**恒 exit 0**——REV-82-010） |
| `req set <REQ-NNN> [--status/--title/--target-version/--priority]` | 字段更新（白名单 / 值域 / 流转**全部透传引擎**；命令层零校验、仅错误码映射——REV-82-003） |
| `req link --stage <stageId> (--requirement <REQ-NNN> \| --unlink)` | 关联/解绑（两选项互斥且必居其一）；关联唯一性由引擎硬拒（阶段已属他需求 → `already_linked` → exit 1 零写盘 + 提示「须先解绑」；**无覆盖/替换语义**——REV-82-001） |
| `req advance <REQ-NNN> --to <status>` | 显式推进（合法目标 + done 门由引擎单点判定；非法 → exit 1 且「列合法目标」取自引擎导出 `getAllowedNextStatuses`，命令层零硬编码——REV-82-003；裁定 M） |
| `req board [--target-version] [--json]` | 状态分组视图 |
| `req next [--owner] [--json]` | 推荐下一个可接取需求（筛选 + 排序；开放问题 Q5） |

**不变量**：

1. **命令层零业务逻辑**：解析 / 校验 / 错误码 / 写入全在 core；命令层仅呈现（核验 B16）。**零第二份流转表 / 零值域硬编码**——流转合法性一律引擎单点；「列合法目标」经 core 导出 `getAllowedNextStatuses` 消费；凡引值域必取 core 常量（`REQ_STATUSES` / `REQ_PRIORITIES`，REV-82-003）。
2. **退出码**：成功 0；校验/占用/存在性失败 1；并发冲突 2（复用既有单点）；`--json` 不改变退出码语义。**失败分流矩阵**（REV-82-002）：`add` 非法入参 = 引擎抛错 → 命令层捕获经通用模板（`shared/errors.ts:47-49`）exit 1；**其余全部原语** = `RequirementOpResult` 错误码 → 逐码映射 i18n 文案 exit 1。两条路径**显式分流**，不得混用。
3. **`--json` 契约**：纯 JSON 单文档 + `schemaVersion:1`；无 ANSI/提示行；人类输出与 `--json` 互斥；**失败路径同契约**——错误亦为**纯 JSON 单文档**（错误对象，形态方案期定稿）+ exit 非 0 + 无 ANSI/提示行（对齐 REV-79-003——REV-82-007）。
4. **写路径唯一**：全部写命令经 core 原语 → `save()`；不新增写盘点。
5. **既有命令零破坏**：`src/cli/index.ts` 仅两行新增；`openfeel --help` 新增 `req` 一节；其余命令输出逐字不变。

---

## 三、变更点清单（编号 T）

### T1 — 命令组骨架与读命令（`src/commands/req.ts` 新建 + `src/cli/index.ts` 注册）
- `registerReqCommand(program)`：`program.command('req').description(...)`；子命令注册 + `getCliLang` + `t()` 文案。
- `add` / `list` / `show`（含 `--json`；`show` 输出关联阶段**原始只读枚举**——**禁止**在 `src/commands/req.ts` 计算 done/进度/聚合摘要（归 stage-83，REV-82-013））。
- REQ ID 校验辅助（格式 + 存在性 → exit 1 模板）；阶段 ID 归一（`normalizeStageId`，核验 B18）。

### T2 — 写命令：claim / release / set
- `claim`：引擎返回码分流（`not_found` / `already_claimed` / `invalid_status` / `invalid_field`〔owner 空串——REV-82-009〕→ exit 1 各文案；同 owner 幂等 `{ok:true,changed:false}` → exit 0；成功 → 提示 + `claimed_at`）；`--owner` 缺省链 = `.openfeel/.info.json` 的 `user` → `git config user.name` → 皆无 → 拒绝并提示显式 `--owner`（**禁硬编码用户名**——REV-82-012）。
- `release`：引擎口径落地——未占用 = `{ok:true,changed:false}` no-op 成功 → 提示 + **exit 0**（REV-82-010）；成功解除 → 提示 + exit 0。
- `set`：命令层**零校验**——白名单 / 值域 / 流转全由引擎 `updateRequirement` 判定（`:167` 白名单 / `:196-201` 值域），错误码 `invalid_field` / `invalid_status` 逐码映射（REV-82-003）；无字段传入 → 用法提示（exit 1；argument-shape 校验，非业务校验）。
- 三者成功后统一 `mgr.save()`（捕获并发 → exit 2）。

### T3 — `link` / `advance` / `board` / `next`
- `link`：命令形态 `req link --stage <stageId> --requirement <REQ-NNN>` ｜ `req link --stage <stageId> --unlink`（互斥且必居其一——argument-shape 校验）。
  - 关联：`--stage` 仅经 `normalizeStageId` 归一（核验 B18；**禁自写解析**）；**存在性以引擎为唯一门**（`stage_not_found` = 未注册于 `flow.json` `data.stages`；命令层**不**叠加「已注册或有 status.md」宽口径——REV-82-006）；阶段已被他需求关联 → `already_linked` → **exit 1 零写盘** + 提示「须先 `req link --stage <id> --unlink` 解绑」（**不设覆盖/替换**——REV-82-001）；同值 → 幂等 exit 0。
  - 解绑：映射引擎 `linkRequirement(data, stageId, null)`（`:260-264`）；未关联 = no-op 成功 exit 0。
  - 错误码（`stage_not_found` / `not_found` / `invalid_status` / `already_linked`）→ i18n 文案映射 exit 1。
- `advance`：**命令层零校验**（合法目标 + done 门均在引擎单点 `updateRequirement`/`applyStatusChange`——REV-82-003）；非法 → `invalid_status` → exit 1，**「列合法目标」取自引擎新增导出 `getAllowedNextStatuses(current)`**（`requirement-ops.ts` 小幅补丁口，`plan.md:8`），禁命令层硬编码枚举。合法目标全表（引擎 `ALLOWED_TRANSITIONS @ :143-149`）：

| 当前状态 | 合法目标（引擎全表口径） |
|----------|--------------------------|
| `draft` | `scheduled` / `blocked` / `cancelled` / `rejected` |
| `scheduled` | `in_progress` / `blocked` / `cancelled` / `rejected` |
| `in_progress` | `done`（须全部关联阶段 done，`:158`）/ `blocked` / `cancelled` / `rejected` |
| `blocked` | `scheduled` / `in_progress` / `cancelled` / `rejected`（**回流两出口补全**——REV-82-003） |
| `done` / `cancelled` / `rejected` | ∅（终态） |

- `board`：按状态分组（7 状态固定顺序含空组显示策略：方案期定稿）+ `--target-version` 过滤 + `--json` 稳定结构。
- `next`：筛选（`status=scheduled` + `owner` 空）+ 排序（`target_version` 升序 → 创建时间）——开放问题 Q5；不做 DAG。

### T4 — i18n 双表 + help 域
- 新键前缀 `req.*` + `help.req.*`（含 10 子命令描述与选项）；双表成对；`lint i18n` 新基线显式登记（**入口基线 = 829**；复现 `OPENFEEL_LOG=0 node bin/openfeel.js lint i18n` → 「✅ 829 键一致」——REV-82-005）。
- help 域键名**区分登记**（生成器 `cli/index.ts :: applyHelpI18n @ :96-175`；**未命中 `hasKey` 即死键静默**——REV-82-011）：
  - **arg 键 = `help.<cmdPath>.arg<参数名逐字>`**——**非 camelCase**，参数名照抄 `arg.name()`（如位置参数声明为 `<id>` / `<title>` → `help.req.show.argid` / `help.req.add.argtitle`；位置参数一律取短 token 命名，避免键名含 `-` 等特殊符号）；
  - **option 键 = `help.<cmdPath>.<长名 camelCase>`**（如 `--target-version` → `targetVersion`、`--stage` → `stage`、`--unlink` → `unlink`、`--owner` → `owner`）；
  - 注册后**逐键断言覆盖**（防死键——`hasKey` 静默特性使写错键无告警）。
- 术语统一：「需求 / requirement」「认领 / claim」「关联 / link」（消歧与 board/next 措辞）。

### T5 — 测试（`test/commands/req.test.ts` 新建 + `test/core/req.test.ts` 追加承接用例段）
- T5.1 只读命令：`list/show/board/next` 各过滤条件 + `--json` 纯单文档（含空态）+ **失败路径**（纯 JSON 单文档 + exit 非 0 + 无 ANSI/提示行——REV-82-007）。
- T5.2 写命令与**分流矩阵**：`add`（写入 + 正文骨架 + 审计）；**`add` 抛错路径**（空 title / 非法 priority / 空 target_version → 通用模板 exit 1，与错误码路径显式分流——REV-82-002）；`claim` **四码**（`not_found` / `already_claimed` / `invalid_status` / `invalid_field`〔owner 空串〕）+ 同 owner 幂等（REV-82-009）；`release`（未占用 → no-op exit 0——REV-82-010）；`set` 非法 → `invalid_field` / `invalid_status` exit 1 零写盘。
- T5.3 `link`：归一（短名/全名）、`stage_not_found` exit 1、`--unlink` 解绑、`already_linked` 硬拒（exit 1 零写盘 + 「先解绑」提示）、同值幂等 exit 0（REV-82-001/006）。
- T5.4 `advance`：合法/非法目标（**含 `blocked → scheduled` / `blocked → in_progress` 补全出口**）；`--to done` 未全 done → exit 1；全 done → 成功；「列合法目标」输出断言 = 引擎 `getAllowedNextStatuses` 派生（不硬编码，REV-82-003）。
- T5.5 退出码矩阵：0 / 1 / 2（并发构造）三态断言。
- T5.6 既有命令零破坏：`openfeel --help` 仅新增 req 节；`flow status --json` 等逐字不变。
- T5.7 承接回归（`test/core/req.test.ts` 追加段）：`addRequirement` 非数组写路径用例（`req/BUG-001` = REV-81-019）——含命令层「损坏数据不崩」回归（禁未捕获 TypeError；修复口径方案期裁定）；REV-81-016（越域 status）源码守卫与用例均已闭环（`:155-157` / `:388-394`），本阶段仅登记核验。
- 全程 `vi.mock('node:os')` / fixture tmpDir + `REAL_CWD` 反向守卫（kb 测试 cwd 隔离范式）。

### T6 — 门禁
`npm run build` ×2 → `npm test`（0 skipped / 0 failed）→ `tsc` = 0 → `lint i18n` 新基线（显式登记；**入口基线 = 829**——REV-82-005）→ `lint kb` = 0。

### 承接 REV 与处置表（REV-81-016~020 + `req/BUG-001` + REV-80 移交项；REV-82-004）

> 复发背景：REV-80-004 / REV-81-004 / 本条为**第 3 次**同类「承接零交代」→ 本表为本阶段承接基线（归档轮据此核验零灭失）。来源：`users/Liuary/code_review/REV-81.md`（归档收口表）+ `bugs/req/BUG-001_*.md`（open）。**本阶段为唯一收口窗口**（已声明改 `requirement-ops.ts`——`plan.md:8`）。

| 条目 | 摘要 | 本阶段处置 | 动作 / 落点 |
|------|------|-----------|-------------|
| **`req/BUG-001` [low，open]** | `addRequirement` 非数组守卫缺失（`??=` 不替换非数组真值 → `push` 抛 TypeError；其余 8 原语均宽容） | **本阶段补丁收口（含用例）** | `requirement-ops.ts :: addRequirement @ :98` 改 `Array.isArray` 守卫（与其余原语口径统一）+ `test/core/req.test.ts` 追加回归用例（T5.7）；修复口径（重建空数组续建 vs `invalid_field` 拒绝）方案期裁定——二者均禁 TypeError 崩溃；验收后由测试官回归关闭 |
| REV-81-019 [low] | 与 `req/BUG-001` **同一处**（写侧非数组守卫） | **与 BUG-001 合并收口** | 同上（单点修复，勿双改） |
| REV-81-016 [low] | `applyStatusChange` 越域 `req.status` 缺守卫 | **已闭环，本阶段零代码动作（登记核验）** | 源码守卫在位（`requirement-ops.ts :: :155-157`）；用例在位（`test/core/req.test.ts :: REV-81-016 用例 @ :388-394`）；台账闭合随 v1.2.0 收口轮 |
| REV-81-017 [low] | 正交断言写法（`src.includes(n) === false`）偏离 op-003 步骤 1.4（`not.toMatch`） | **移交 stage-85 收口轮** | `test/core/req.test.ts :: :638` 断言改写；语义等价、无功能风险；本阶段仅向该文件**追加** T5.7 用例段，不动既有断言段 |
| REV-81-018 [low] | 同字段校验风格 add/update 不对称（`title` add 严格 / update 宽松；`target_version` 反之） | **本阶段方案期裁定** | 默认建议**登记为接受差异**（构造期 fail-fast 抛错 vs 运行期错误码二分，与 REV-82-002 分流矩阵同口径）并在 `requirement-ops.ts` 注释登记；若方案期另裁统一 → 随同阶段补丁落地 |
| REV-81-020 [low] | `writeRequirementBodySkeleton` 无条件改写 `body_path`（误传浅副本 → 静默不落库） | **本阶段命令层规避（默认零防御改动）** | `req add` **严格直传 `addRequirement` 返回本体**（禁经浅副本——`:111`）；用例断言 `body_path` 落库（T5.2）；若方案期采纳轻量防御 → 登记 `src/core/req/body-file.ts` 触碰面 |
| REV-80 移交项（020 / 023 / 029） | 020 → planner（`stage-80/plan.md` 文档校正）；023 → 主会话（提交卫生 / 状态对账）；029 → stage-85（`archive-health.ts` 注释） | **本阶段零动作（防二次灭失登记）** | 去向经 stage-81 承接表（`stage-81/plan.md` §三「承接上游 pending REV」）转移登记；本阶段仅确认未灭失、不认领 |

---

## 四、验收要点（阶段级）

1. 10 子命令全量可用；`--json` 契约（含失败路径）与退出码矩阵全绿。
2. 命令层零业务逻辑 + **零流转表 / 零值域硬编码**（检索复核：`src/commands/req.ts` 无状态转移枚举、无 ID 分配直写、无 done/进度聚合计算）。
3. i18n 双表成对（arg/option 键名区分登记 + 逐键断言）+ 新基线登记（入口 829）；`--help` 完整体现 10 子命令。
4. 既有命令零破坏（T5.6）。
5. 门禁全绿。
6. **承接闭环**：承接表逐条落点可核（`req/BUG-001` 收口含用例；REV-81-016 核验登记）。

## 五、风险

| # | 风险 | 缓解 |
|:-:|------|------|
| R-82-1 | `--json` 契约遗漏 / 提示行混入（成功与失败两路径） | T5.1 纯单文档断言（含空态与失败路径——REV-82-007） |
| R-82-2 | claim 占用校验被绕过（并发双写） | 引擎校验 + `save()` 乐观并发兜底（exit 2）；T5.2 四码 |
| R-82-3 | `advance --to done` 与 stage-83 聚合语义冲突 | 本阶段走引擎严格校验（裁定 M）；stage-83 接管自动回写时**复用同一引擎单点**（零第二套） |
| R-82-4 | `link` 覆盖/替换语义歧义 | **已消解**——与引擎硬拒对齐（不设覆盖；须先 `--unlink`，REV-82-001）；T5.3 硬拒/解绑/幂等三态断言 |
| R-82-5 | `next` 排序口径主观 | 开放问题 Q5 定稿后冻结 + 断言 |
| R-82-6 | `getAllowedNextStatuses` 为 stage-81 冻结面的**新增导出** | 单一读点（命令层仅此一处消费）；已冻结为**方案 ①**（REV-82-003），不采 (b) 直导出 `ALLOWED_TRANSITIONS`（第二读点漂移风险） |
| R-82-7 | `--owner` 缺省链在无 git / 无 `.info.json` 环境取不到值 | 三级链末端**拒绝并提示显式 `--owner`**（禁硬编码——REV-82-012）；用例覆盖显式路径 |

> 说明：op 级拆分建议——op-001（T1 骨架 + 读命令）→ op-002（T2+T3 写命令与 link/advance）→ op-003（T4 i18n + T5/T6 测试门禁，含 T5.7 承接回归）；由 openfeel-schemer 定稿并落 `ops/deps.yaml`。

## 六、修订记录

| 时间 | 制定人 | 说明 |
|------|--------|------|
| 2026-10-11 | openfeel-planner | 初稿（立项随批次落盘）：T1~T6；依据大计划 §三 表 B 裁定 E/F/G/M 与 §二 表 B。**只写计划文档，未改源码、未动 flow.json。** |
| 2026-10-12 | openfeel-planner | **计划审查 REV 修订轮（REV-82-001~014 落实）**：001 `link` 改引擎一致口径——`already_linked` 硬拒 → exit 1 零写盘 + 提示须先解绑；命令形态 `req link --stage <stageId> [--requirement <REQ-NNN>\|--unlink]`；**删**「单值替换/默认允许覆盖」（§二 / T3 / §五 R-82-4 / T5.3 同步）；002 **删** `add --source` + 登记「`add` 抛错（经 `shared/errors.ts:47-49` 通用模板 exit 1）vs 其余 `RequirementOpResult` 错误码」**分流矩阵**（§二 不变量 2 + T5.2）；003 采纳**方案 ①**（命令层零校验；引擎**新增导出 `getAllowedNextStatuses(status)`**〔`plan.md:8` 补丁口〕；`set`/`advance` 零第二份流转表）+ **补全** `blocked → scheduled` / `blocked → in_progress`（T3 全表）并同步**大计划裁定 M**；004 新增「承接 REV 与处置表」（REV-81-016~020 + `req/BUG-001` + REV-80 移交 3 项；BUG-001 本阶段补丁收口含用例，T5.7）；005 i18n 基线全量改 **829**（§一 / T4 / T6；实测 `lint i18n` 复现在文；`deps.yaml` i18n 条目同步标注入口基线）；006 `link` 存在性**以引擎为唯一门**（删「或 status.md」宽口径，命令层仅归一 + 文案映射）；007 `--json` **失败路径契约**入不变量 3（纯 JSON 单文档 + exit 非 0 + 无 ANSI/提示行，对齐 REV-79-003）+ T5.1 断言；008 全组统一 **`--target-version`**（`list`/`board` 原 `--version` 更名；零 `--version` 子选项，对齐 REV-81-012 与全局 `-v, --version`）；009 `claim` 四态补 **`invalid_field`**（owner 空串）+ T5.2 四码断言；010 `release` 未占用恒 **exit 0**（引擎 no-op 成功 `:134`）；011 T4 **区分登记** help 键名（arg = `arg` + 参数名逐字、option = camelCase；防死键断言）；012 `--owner` 缺省链改 `.info.json user` → `git config user.name` → **拒绝并提示**（删硬编码 `Liuary`）；013 T1/§二 明写 `show` **禁算** done/进度（仅原始只读枚举，归 stage-83）；014 §一 全面改「**符号名 @ 行号**」双锚 + 钉 HEAD **`c5f1d53`**，修正全部漂移（`advanceStagePhase` 调用 @ :941；`addReviewEntry` 调用 @ :1195-1199；`flow mode --json` @ :528；`flow phases --json` @ :448-451）。**只改计划文档，未改源码、未直写 flow.json、未推进 phase。** |
