# req 模块 Bug 归档

> 需求流转系统（`src/core/req/**` 引擎面 + `src/commands/req.ts` 命令面）缺陷归档；详细登记与复现见私域 `.openfeel/users/{username}/bugs/req/`。

## 条目

### BUG-001: `addRequirement` 对非数组 `requirements` 抛 TypeError（其余 8 个原语均宽容）

- **优先级**：low ｜ **状态**：**closed**（v1.2.0-stage-82 op-001 收口）｜ **来源**：v1.2.0-stage-81 发现 / stage-82 收口
- **模块**：`src/core/req/requirement-ops.ts` → `addRequirement`（唯一抛错原语）

#### 根因

`addRequirement` 写路径兜底为 `data.requirements ??= []` —— `??=` **仅在值为 `null`/`undefined` 时生效**；当 `requirements` 为**非数组真值**（字符串 / 数字 / 对象，模拟 `flow.json` 被手工改坏的损坏态）时兜底不触发，随后 `data.requirements.push(req)` 抛 `TypeError: data.requirements.push is not a function`。其余 8 个原语（get/getRequirement/list/nextId/update/claim/release/link）均以 `Array.isArray(...) ? ... : []` 内联守卫宽容处理 → **实现内部口径不对称**。

#### 触发条件与影响

- 仅在 `flow.json` 被手工改成非数组 `requirements` 时可达（引擎自身恒写数组；`load()` 不校验该字段形态），正常路径不可达、无数据丢失。
- 下游：stage-82 命令层 `req add` 直接消费 → 遇损坏态将抛未捕获 `TypeError`（非干净 exit 非 0 提示），违反「损坏数据不崩」边界。

#### 修复（v1.2.0-stage-82 op-001 步骤 1.1）

```ts
// 修复前：data.requirements ??= [];
data.requirements = Array.isArray(data.requirements) ? data.requirements : [];
```

**口径冻结（S-82-1）**：**重建空数组续建**（非 `invalid_field` 拒绝）——与其余 8 原语「非数组 ≡ 空集」宽容口径统一。**与 `REV-81-019` 为同一处缺陷，单点修复勿双改**。

#### 回归证据

- 引擎（`test/core/req.test.ts` T5.7 三变体）：`requirements = {}` / `'x'` / `123` → `addRequirement` **不抛错**、返回 `REQ-001`、`data.requirements` 为数组且含该条。
- 命令层（`test/commands/req.test.ts` T-A4）：fixture `requirements: {}` → `req add "x"` exit 0（无未捕获 TypeError）+ `requirements` 为数组含新需求。

#### 防再犯

同类「读写宽容口径」须**全原语一致**：读侧 8 原语用 `Array.isArray ? : []`，唯一写原语用 `??=`（仅覆盖 null/undefined）→ 写路径兜底应与读侧同口径（通用判据：容器型字段的所有入口守卫须收敛到同一谓词）。

> v1.2.0-stage-82 测试验收通过（**70 文件 / 1506 用例 0 skipped / 0 failed**）。**至此 Bug 追踪 23 条全部 closed**（open 0 / closed 23）。

### BUG-002: `workflow_mode: general` 需求恒无法进入 `done`（载体制约束 ⟂ 既有零关联 done 门）

- **优先级**：medium ｜ **状态**：**open**（v1.2.1-stage-90 正式测试验收提交，**非阻塞**）｜ **来源**：v1.2.1-stage-90
- **模块**：`src/core/req/requirement-ops.ts`（`allLinkedStagesDone` / `updateRequirement` 状态维度）+ `src/core/req/types.ts`（`workflow_mode?`）+ `src/commands/req.ts`（`--workflow-mode` / 需求侧载体门 + 文案映射）；语义涉及 `docs/v1.2.1-design.md` §7 与 `.openfeel/plan/v1/stage-90/plan.md` §二 / Q2。

#### 复现（隔离临时工程）

```
openfeel init --workspace-only --non-interactive .
openfeel req add "纯通用" --workflow-mode general      # → REQ-00N（general）
openfeel req advance REQ-00N --to in_progress          # exit 0
openfeel req advance REQ-00N --to done                 # ← 被拒，EXIT=1
openfeel req set REQ-00N --status done                 # ← 同样被拒
# 输出：REQ-00N 目标状态 done 被拒（当前 in_progress；合法目标：done, blocked, cancelled, rejected）
```

**代价对照**：同一隔离工程、同一时刻——把该需求 `req set --workflow-mode fast` 并关联一个 `phase='done'` 的阶段后，`req advance --to done` → **exit 0**。即唯一差异是「**是否有关联阶段**」，而非模式字段本身。

#### 根因（两条规则叠加成死锁）

1. **载体制约束（stage-90 新增）**：`general` ⟹ **零关联阶段**——`req set --workflow-mode general`（已有链接阶段 → `general_mode_conflict`，exit 1）与 `req link`（目标需求为 general → `general_mode_conflict`，exit 1）**双向拒绝**。
2. **done 门（既有「裁定 4」，stage-83 起）**：`allLinkedStagesDone(data, id)` 要求 `linked.length > 0 && linked.every((s) => s.phase === 'done')`，**零关联恒 `false`**；`updateRequirement` 状态维度据此拒绝 `done`。

两者交集 = 「general 需求恒 `linked.length === 0`」⟹ `allLinkedStagesDone` 恒 `false` ⟹ **`done` 恒不可达**（`req advance --to done` 与 `req set --status done` 同源拒绝；stage-90 未提供替代完成动作）。

**附带缺陷（同因）**：拒绝文案 `…（…；合法目标：done, blocked, cancelled, rejected）` **把 `done` 列为合法目标却又拒绝它**——`invalid_status` 文案取 `getAllowedNextStatuses(current).join(', ')`（**静态**合法集），未反映 done 门的**动态前置**（零关联拒绝）。用户无法据以判断原因。

#### 影响范围与严重度

- **触发条件**：任何以 `req add --workflow-mode general`（或 `req set --workflow-mode general` + 零关联阶段）创建的需求——**常规写路径可达**，无需手改数据。
- **影响面**：该类需求无法走完 7 状态生命周期终点；`req board` 的 `done` 桶恒不收纳（实测 `done（0）`）；工作可完成但系统内不可标记完成。与验收维度 2「`general` 需求全生命周期」不符。
- **严重度**：**中**——无数据丢失 / 无流水线阻塞 / **有绕行路径**（升级为 `fast` / `full` 并关联阶段后完成，或 `cancelled` / `rejected`）。

#### 建议处置（由 openfeel-schemer 裁定三选一）

1. `general` 需求**放开 done 门**（`allLinkedStagesDone` 对 general 放宽，或新增显式完成动作）；或
2. 明示「**仅可升级后完成**」并在 help / 模板 / 文案同步（含修正「合法目标含 done」的矛盾文案）；或
3. 判为**设计保留** → 转后续阶段（如需求归档轮）并登记。

**修复须同步 C2 动态断言口径**——本阶段计划 §二 不变量 3 明确「模式**不参与**聚合 / done 门 / 对账」（C2 动态断言锁死），故**不能**用「按模式改 done 门」的方式直接收敛；若放宽该 done 门，须以**显式 supersede**（见 kb/patterns.md #断言 supersede 范式）而非静默改写。**归档官不改源码**（边界），维持 `open`。

#### 承接去向（显式登记，不静默丢弃）

**→ `v1.2.1-stage-93`（收口轮）/ 后续裁定**。本阶段（stage-90）**非阻塞**、零污染本仓；已同步登记于 `.openfeel/code_review/v1.2.1-stage-90.md`（遗留节）、`.openfeel/kb/architecture.md #需求级模式属性架构`（已知缺口）、`manual/core/req.md`（已知缺口）与公共日志。

> v1.2.1-stage-90 测试验收通过（**24 项 23 过、1 非阻塞 BUG、0 阻塞**）；门禁 **71 文件 / 1674 用例 0 skipped / 0 failed**。**本阶段零代码修复**（语义面设计缺口，须 openfeel-schemer 裁定）。
