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
