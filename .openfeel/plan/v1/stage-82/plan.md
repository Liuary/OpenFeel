# v1.2.0-stage-82 计划 — 需求命令面（openfeel req 顶层命令组）

- **阶段**：`v1.2.0-stage-82`（主题一 · 需求流转第二阶段）
- **依赖**：**hard: v1.2.0-stage-81**（消费 `src/core/req/` 全部原语；契约见大计划 §既有 `downstream_contracts` 第 2 条）
- **优先级**：P0（把需求引擎暴露为 Agent/人可操作的命令面——用户诉求「Agent 接取后流转需求状态」的直接落点）
- **制定人**：openfeel-planner ｜ **制定时间**：2026-10-11
- **定位**：新增**顶层命令组** `openfeel req`（10 子命令：`add` / `list` / `show` / `claim` / `release` / `set` / `link` / `advance` / `board` / `next`）——命令层**零业务逻辑**（解析 / 校验 / ID / 写入单点在 core，核验 B16 范式）；`--json` 沿用 `schemaVersion:1`；退出码语义（并发 2 / 通用 1）。
- **范围**：新建 `src/commands/req.ts`；`src/cli/index.ts` **两行注册**（import + register，核验 B11）；`src/core/i18n-data/{zh-CN,en}.ts`（新键双表 + help 域）；`test/commands/req.test.ts` 新建；`src/core/req/requirement-ops.ts` 小幅补丁（如命令层所需的错误码细化，同阶段内完成）。
- **边界**：**不做**聚合判定与自动回写（归 stage-83；本阶段 `req advance --to done` 走**显式校验**：全部关联阶段 done 才可，不设 `--force`——裁定 M）；**不做** Agent 模板 / skill（归 stage-84）；不改既有命令输出；不新增第三方依赖；不 `npm publish` / 不 `git push`；不直写 `flow.json`。

## KB 检索（`openfeel-check-kb`）

- 已加载。**高度相关条目**：
  - `kb/patterns.md #CLI --json 结构化输出约定：顶层对象 + schemaVersion + 纯 JSON 单文档` → 全部子命令 `--json` 纯单文档；与人类输出互斥。
  - `kb/patterns.md #破坏性命令安全校验清单模式：默认拒绝 + 显式越权 + 可预览 + 可审计` → `claim` 占用校验 / `link` 存在性校验 / `advance` 目标值域校验：非法即 exit 1 零写盘。
  - `kb/patterns.md #命令面收敛与弃用策略` + `#短名/全名 stage 解析归一化` → `link --stage` 经 `normalizeStageId` 归一（核验 B18），**禁自写解析**；`req` 为**新命令组**（非弃用面）。
  - `kb/patterns.md #CLI 退出码语义：非 0 退出 + process.exitCode + 无逃生阀` → 值域/占用/存在性失败 exit 1；并发冲突复用 `handleConcurrentConflict`（exit 2）。
  - `kb/patterns.md #CLI 国际化封装模式` + `#部署型资产变更的多载体同步面清单` → 新键双表 + `help.req.*` 域键；文案入 i18n。
  - `kb/patterns.md #两阶段状态 draft/publish 的窄兼容设计` → 7 状态在 `list --status` / `board` 分组 / `next` 筛选各自路径显式处理（逐一回答）。
  - **无**「req 命令面」既有条目 → 归档时补沉 patterns（需求命令面与生命周期）。

---

## 一、背景与实测证据（大计划 §二 表 B 摘引）

| 事实 | 位置 | 结论 |
|------|------|------|
| 命令注册唯一入口：16 命令组 import（59-74）+ register（76-91） | `src/cli/index.ts:59-74` / `:76-91` | `registerReqCommand` 两行接入 |
| 命令组范式（子命令 + `common.errorTmpl` + `process.exitCode = 1`） | `src/commands/roadmap.ts:9-46` | `src/commands/req.ts` 同范式 |
| `plan stage add` 值域校验（schema/常量派生、非法 exit 1 零副作用） | `src/commands/plan.ts:46-71` | `req set --status/--priority` 同范式（值域取 stage-81 `REQ_STATUSES`/`REQ_PRIORITIES`） |
| `flow mode` 只读 + `--json` 范式；REQ 类 ID 非法 → exit 1 防 typo | `src/commands/flow.ts:481-530`（`--json` 于 524） | `req show/board` 同范式 |
| `flow review add` 单点实现（`addReviewEntry`），命令层只呈现 | `src/commands/flow.ts:1173-1230` | `req` 全部子命令单点在 core |
| `flow phases --json` 含 `schemaVersion:1` | `src/commands/flow.ts:447` | `req --json` 沿用 |
| 并发冲突统一处理 | `src/commands/shared/errors.ts:19-28` | 写命令捕获后 exit 2 |
| i18n 双文件基线 796 | `src/core/i18n-data/{zh-CN,en}.ts` | 新键显式登记（本阶段为 i18n 主要增量面） |

---

## 二、目标语义与不变量

| 子命令 | 语义（要点） |
|--------|------|
| `req add <title> [--target-version] [--priority] [--source]` | 创建需求（ID 自动）+ 正文骨架铺 |
| `req list [--status] [--version] [--owner] [--json]` | 过滤列表（7 状态值域校验） |
| `req show <REQ-NNN> [--json]` | 详情（含关联阶段聚合摘要——**只算不写**，stage-83 前为原始阶段列表） |
| `req claim <REQ-NNN> [--owner <name>]` | 认领（占用校验；缺省 owner = 当前用户，方案期定稿） |
| `req release <REQ-NNN>` | 释放（清 owner/claimed_at） |
| `req set <REQ-NNN> [--status/--title/--target-version/--priority]` | 字段更新（白名单 + 值域校验） |
| `req link <REQ-NNN> --stage <stageId> [--unlink]` | 关联/解除（stage 归一 + 存在性校验 + 单值替换语义） |
| `req advance <REQ-NNN> --to <status>` | 显式推进（合法目标校验；`--to done` 需全部关联阶段 done，裁定 M） |
| `req board [--version] [--json]` | 状态分组视图 |
| `req next [--owner] [--json]` | 推荐下一个可接取需求（筛选 + 排序；开放问题 Q5） |

**不变量**：

1. **命令层零业务逻辑**：解析 / 校验 / 错误码 / 写入全在 core；命令层仅呈现（核验 B16）。
2. **退出码**：成功 0；校验/占用/存在性失败 1；并发冲突 2（复用既有单点）；`--json` 不改变退出码语义。
3. **`--json` 契约**：纯 JSON 单文档 + `schemaVersion:1`；无 ANSI/提示行；人类输出与 `--json` 互斥。
4. **写路径唯一**：全部写命令经 core 原语 → `save()`；不新增写盘点。
5. **既有命令零破坏**：`src/cli/index.ts` 仅两行新增；`openfeel --help` 新增 `req` 一节；其余命令输出逐字不变。

---

## 三、变更点清单（编号 T）

### T1 — 命令组骨架与读命令（`src/commands/req.ts` 新建 + `src/cli/index.ts` 注册）
- `registerReqCommand(program)`：`program.command('req').description(...)`；子命令注册 + `getCliLang` + `t()` 文案。
- `add` / `list` / `show`（含 `--json`；`show` 输出关联阶段与「聚合摘要（只读）」占位——stage-83 接管真实聚合）。
- REQ ID 校验辅助（格式 + 存在性 → exit 1 模板）；阶段 ID 归一（`normalizeStageId`，核验 B18）。

### T2 — 写命令：claim / release / set
- `claim`：core 返回码分流（`not_found` / `already_claimed` / `invalid_status` → exit 1 各文案；成功 → 提示 + `claimed_at`）；`--owner` 缺省 = `git config user.name` 或 `Liuary` 约定（方案期定稿）。
- `release`：解除占用（未占用 → 提示 + exit 0 或 1，方案期定稿）。
- `set`：值域校验（`REQ_STATUSES`/`REQ_PRIORITIES` 派生）+ 白名单字段；无字段传入 → 用法提示（exit 1）。
- 三者成功后统一 `mgr.save()`（捕获并发 → exit 2）。

### T3 — `link` / `advance` / `board` / `next`
- `link`：`--stage` 归一 + 存在性（已注册或有 status.md，核验 B14 范式）；`--unlink` 解除；单值替换语义（原关联被替换时输出提示）；目标阶段已被他需求关联 → 提示（是否允许覆盖：**方案期定稿**，默认允许并提示）。
- `advance`：合法目标校验（值域 + 显式推进合法性——`draft→scheduled`、`scheduled→in_progress`、非终态→`blocked/cancelled/rejected`；`--to done` 需全部关联阶段 done，裁定 M）；非法 → exit 1 列合法目标。
- `board`：按状态分组（7 状态固定顺序含空组显示策略：方案期定稿）+ `--version` 过滤 + `--json` 稳定结构。
- `next`：筛选（`status=scheduled` + `owner` 空）+ 排序（`target_version` 升序 → 创建时间）——开放问题 Q5；不做 DAG。

### T4 — i18n 双表 + help 域
- 新键前缀 `req.*` + `help.req.*`（含 10 子命令描述与选项）；双表成对；`lint i18n` 新基线显式登记。
- 术语统一：「需求 / requirement」「认领 / claim」「关联 / link」（消歧与 board/next 措辞）。

### T5 — 测试（`test/commands/req.test.ts` 新建 + core 补丁用例）
- T5.1 只读命令：`list/show/board/next` 各过滤条件 + `--json` 纯单文档（含空态）。
- T5.2 写命令：`add`（写入 + 正文骨架 + 审计）；`claim` 占用四态；`release`；`set` 值域非法 exit 1 零写盘。
- T5.3 `link`：归一（短名/全名）、不存在 stage exit 1、`--unlink`、替换提示。
- T5.4 `advance`：合法/非法目标；`--to done` 未全 done → exit 1；全 done → 成功。
- T5.5 退出码矩阵：0 / 1 / 2（并发构造）三态断言。
- T5.6 既有命令零破坏：`openfeel --help` 仅新增 req 节；`flow status --json` 等逐字不变。
- 全程 `vi.mock('node:os')` / fixture tmpDir + `REAL_CWD` 反向守卫（kb 测试 cwd 隔离范式）。

### T6 — 门禁
`npm run build` ×2 → `npm test`（0 skipped / 0 failed）→ `tsc` = 0 → `lint i18n` 新基线（显式登记）→ `lint kb` = 0。

---

## 四、验收要点（阶段级）

1. 10 子命令全量可用；`--json` 契约与退出码矩阵全绿。
2. 命令层零业务逻辑（检索复核：`src/commands/req.ts` 无阶段表/ID 分配直写）。
3. i18n 双表成对 + 新基线登记；`--help` 完整体现 10 子命令。
4. 既有命令零破坏（T5.6）。
5. 门禁全绿。

## 五、风险

| # | 风险 | 缓解 |
|:-:|------|------|
| R-82-1 | `--json` 契约遗漏 / 提示行混入 | T5.1 纯单文档断言（含空态） |
| R-82-2 | claim 占用校验被绕过（并发双写） | core 校验 + `save()` 乐观并发兜底（exit 2）；T5.2 四态 |
| R-82-3 | `advance --to done` 与 stage-83 聚合语义冲突 | 本阶段严格校验（裁定 M）；stage-83 接管自动回写时复用同一校验函数 |
| R-82-4 | link 单值替换语义歧义 | 替换提示 + 方案期定稿覆盖策略；验收含替换用例 |
| R-82-5 | `next` 排序口径主观 | 开放问题 Q5 定稿后冻结 + 断言 |

> 说明：op 级拆分建议——op-001（T1 骨架 + 读命令）→ op-002（T2+T3 写命令与 link/advance）→ op-003（T4 i18n + T5/T6 测试门禁）；由 openfeel-schemer 定稿并落 `ops/deps.yaml`。

## 六、修订记录

| 时间 | 制定人 | 说明 |
|------|--------|------|
| 2026-10-11 | openfeel-planner | 初稿（立项随批次落盘）：T1~T6；依据大计划 §三 表 B 裁定 E/F/G/M 与 §二 表 B。**只写计划文档，未改源码、未动 flow.json。** |
