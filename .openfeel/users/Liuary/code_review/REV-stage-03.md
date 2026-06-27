# stage-03 代码审查

> 审查人：ReviewWorker Agent | 时间：2026-06-25 22:30
> 审查范围：src/core/config.ts, src/core/workspace/{structure,identity}.ts, src/core/init.ts, src/core/flow-manager.ts, src/commands/{init,flow}.ts, src/cli/index.ts, test/core/{flow-manager,init}.test.ts

## 审查摘要

| 统计 | 数量 |
|------|------|
| 审查文件 | 10 |
| 测试文件 | 2（65 测试全部通过） |
| 发现 high 问题 | 1 |
| 发现 medium 问题 | 3 |
| 发现 low 问题 | 4 |

---

## REV-001: advancePhase 日志的 from 字段错误（变更历史丢失）

- **状态**：resolved
- **优先级**：high
- **提出人**：ReviewWorker Agent
- **提出时间**：2026-06-25 22:30
- **文件**：src/core/flow-manager.ts（第 419-424 行）

### 问题描述

`advancePhase` 方法在执行 `this.data.pipeline.phase = to;`（第 394 行）之后才构造日志条目（第 419-424 行），此时 `from: this.data.pipeline.phase` 读取的已经是更新后的值 `to`，导致日志中的 `from` 和 `to` 始终相等，变更历史完全丢失。

### 处理记录
| 时间 | 操作者 | 说明 |
|------|--------|------|
| 2026-06-25 22:10 | CodeWorker | 在更新 phase 前保存 `fromPhase`；日志使用 `fromPhase` 作为 from 值；新增测试验证 `from` 和 `to` 不同 |

---

## REV-002: advancePhase 切换操作时未重置 pipeline.retry

- **状态**：resolved
- **优先级**：medium
- **提出人**：ReviewWorker Agent
- **提出时间**：2026-06-25 22:30
- **文件**：src/core/flow-manager.ts（第 378-425 行）

### 问题描述

`pipeline.retry` 的语义是"当前操作 (op) 的执行重试次数"。当 `advancePhase` 推进到一个新的 op（通过 `pipeline.current` 变更）时，`pipeline.retry` 应当重置为 0 以正确地跟踪新操作的执行次数。当前实现未做此重置。

### 处理记录
| 时间 | 操作者 | 说明 |
|------|--------|------|
| 2026-06-25 22:10 | CodeWorker | 在 advancePhase 中检测 pipeline.current 变更并重置 retry；新增 2 个测试（切换 op 重置、相同 op 不重置） |

---

## REV-003: CLI `flow review` 子命令未注册

- **状态**：resolved
- **优先级**：medium
- **提出人**：ReviewWorker Agent
- **提出时间**：2026-06-25 22:30
- **文件**：src/commands/flow.ts

### 问题描述

计划 4.4 节（Flow 命令）定义了以下审查相关子命令，但 CLI 未注册。

### 处理记录
| 时间 | 操作者 | 说明 |
|------|--------|------|
| 2026-06-25 22:10 | CodeWorker | 注册 review 子命令组，含 add（自动生成 REV ID）和 resolve 命令 |

---

## REV-004: CLI `flow retry` 子命令未注册

- **状态**：resolved
- **优先级**：medium
- **提出人**：ReviewWorker Agent
- **提出时间**：2026-06-25 22:30
- **文件**：src/commands/flow.ts

### 问题描述

计划 4.4 节定义了 `flow retry --op <id>` 命令，但 CLI 未注册。

### 处理记录
| 时间 | 操作者 | 说明 |
|------|--------|------|
| 2026-06-25 22:10 | CodeWorker | 注册 retry 命令，支持 --op 选项，输出当前尝试次数/最大尝试次数及状态 |

---

## REV-005: summary() 返回类型与计划不一致

- **状态**：pending
- **优先级**：low
- **提出人**：ReviewWorker Agent
- **提出时间**：2026-06-25 22:30
- **文件**：src/core/flow-manager.ts（第 310-337 行）

### 问题描述

计划 4.3 定义 API 为 `summary(): PipelineSummary`，注释为"人类可读摘要"。实现中：
- `summary(): string` — 返回中文字符串（人类可读）
- `getSummary(): PipelineSummary` — 返回结构化对象

功能上更合理（人类可读 = 字符串），但型构与计划声明不符。如果后续 Agent / CLI 依赖 `summary()` 返回结构化 `PipelineSummary` 对象，会出现运行时错误。

### 影响范围

- `src/commands/flow.ts` 中 `flow status` 调用了 `mgr.summary()` 并直接 `console.log`，期望返回 string —— 当前实现兼容
- 若未来有其他代码期望 `summary()` 返回 `PipelineSummary` 对象，可能出错

### 建议

保持当前实现（`summary(): string` + `getSummary(): PipelineSummary`），同步更新 plan.md 4.3 节的 API 声明以反映实际设计。

---

## REV-006: ValidationResult 类型未导出

- **状态**：resolved
- **优先级**：low
- **提出人**：ReviewWorker Agent
- **提出时间**：2026-06-25 22:30
- **文件**：src/core/flow-manager.ts（第 557-597 行）

### 问题描述

`validate()` 返回内联的 `{ valid: boolean; errors: string[] }`，未导出类型别名。

### 处理记录
| 时间 | 操作者 | 说明 |
|------|--------|------|
| 2026-06-25 22:10 | CodeWorker | 导出 `ValidationResult` 接口；`validate()` 返回类型改为 `ValidationResult` |

---

## REV-007: Op.id 字段与 flow.json 键名冗余

- **状态**：resolved
- **优先级**：low
- **提出人**：ReviewWorker Agent
- **提出时间**：2026-06-25 22:30
- **文件**：src/core/flow-manager.ts（第 42-49 行）

### 问题描述

Op 接口包含 `id: string` 字段，会被序列化写入磁盘，与 stages.{stageId}.ops 的键名冗余。

### 处理记录
| 时间 | 操作者 | 说明 |
|------|--------|------|
| 2026-06-25 22:10 | CodeWorker | save() 时去除 op 的 id 字段再序列化；load() 时从键名恢复 op.id；保留 id 作为运行时便利字段 |

---

## REV-008: getSummary() 方法缺少测试覆盖

- **状态**：resolved
- **优先级**：low
- **提出人**：ReviewWorker Agent
- **提出时间**：2026-06-25 22:30
- **文件**：test/core/flow-manager.test.ts

### 问题描述

`getSummary(): PipelineSummary` 方法未包含测试。

### 处理记录
| 时间 | 操作者 | 说明 |
|------|--------|------|
| 2026-06-25 22:10 | CodeWorker | 新增 describe('getSummary') 测试组（4 个用例）：未加载、正常值、无 current、多阶段计数 |

---

## 审查通过条件

- [x] 修复 REV-001（high）：advancePhase 日志的 from 字段 — **已修复**
- [x] 修复 REV-002（medium）：pipeline.retry 重置 — **已修复**
- [x] 实现 REV-003（medium）：flow review CLI — **已实现**
- [x] 实现 REV-004（medium）：flow retry CLI — **已实现**
- [ ] REV-005（low）：summary() 返回类型 — **设计确认项，不改代码**
- [x] 修复 REV-006（low）：ValidationResult 导出 — **已修复**
- [x] 修复 REV-007（low）：Op.id 序列化 — **已修复**
- [x] 修复 REV-008（low）：getSummary() 测试 — **已补充（+4 测试）**