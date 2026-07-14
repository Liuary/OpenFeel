# 代码审查 — v4.4-stage-02（日志修复 + 流水线安全增强）

- **审查人**：Reviewer (GLM)
- **审查时间**：2026-07-14 23:50
- **审查范围**：op-001 ~ op-006 共 6 个 op 的代码产出
- **测试结果**：npm test 291/291 全部通过

---

## REV-001: logMilestone 的 title 参数未传递到日志内容中

- **状态**：resolved
- **优先级**：medium
- **提出人**：Reviewer
- **提出时间**：2026-07-14 23:50
- **blocking**：true

### 问题描述

`public-logger.ts` 第 101-103 行：

```ts
logMilestone(title: string, event: MilestoneEvent): void {
    this.writeLog('里程碑', { ...event, action: event.action } as LogEventDetail);
}
```

`title` 参数被接收但从未使用。调用方 `flow-manager.ts:566` 传入 `'阶段 xxx 完成'` 这样的标题，但日志内容中只记录 `action: 'stage_completed'`，丢失了人可读的标题信息。`buildLogContent` 只使用 `eventType` 和 `detail.action`，`title` 完全被忽略。

### 影响

里程碑日志条目缺乏可读标题，与 `logPhaseChange` 等方法的信息密度不对等。用户查看日志时无法快速识别里程碑内容。

### 建议修复

将 `title` 映射到 `detail.extra.title` 或作为 `detail.action` 的替代展示字段，确保日志内容包含标题信息。

### 处理记录

| 时间 | 操作者 | 说明 | Commit |
|------|--------|------|--------|
| 2026-07-14 23:37 | Executor | 将 title 参数传递到 extra.title 字段；getShortDesc 对 stage_completed 优先使用 extra.title | |

### 验收记录

| 时间 | 验收人 | 结论 | 备注 |
|------|--------|------|------|

---

## REV-002: flow.ts advance 命令未传递 triggeredBy 参数

- **状态**：pending
- **优先级**：medium
- **提出人**：Reviewer
- **提出时间**：2026-07-14 23:50
- **blocking**：false

### 问题描述

`flow.ts:447` 调用 `mgr.advanceStagePhase(options.stage, options.to)` 时，未传递第三个参数 `triggeredBy`。而 `advanceStagePhase` 已支持 `triggeredBy?: string` 参数，默认值 `'flow-manager'`。

这意味着通过 CLI `openfeel flow advance` 触发的推进，日志 `agent` 字段始终记录为 `'flow-manager'`，而非 `'cli-user'` 或 `'feel'` 等更具语义的触发者标识，降低了日志的可追溯性。

### 影响

日志 agent 字段丢失实际触发者信息，但功能不受影响（REV 闭环检查等核心逻辑正确）。

### 建议修复

在 `flow.ts` 调用时传递 `triggeredBy: 'cli'`（或从命令行选项中获取），让日志准确区分 CLI 触发 vs API 触发。

### 处理记录

| 时间 | 操作者 | 说明 | Commit |
|------|--------|------|--------|

### 验收记录

| 时间 | 验收人 | 结论 | 备注 |
|------|--------|------|------|

---

## REV-003: getUsername / formatDateStr 与 PublicLogger.loadUsername / formatDate 重复实现

- **状态**：pending
- **优先级**：low
- **提出人**：Reviewer
- **提出时间**：2026-07-14 23:50
- **blocking**：false

### 问题描述

`FlowManager` 新增的 `getUsername()` 和 `formatDateStr()` 方法与 `PublicLogger` 中已有的 `loadUsername()` 和 `formatDate()` 功能完全相同：

| FlowManager | PublicLogger | 功能 |
|-------------|-------------|------|
| `getUsername()` | `loadUsername()` | 从 .info.json 读取 username |
| `formatDateStr()` | `formatDate()` | 格式化 Date 为 yyyy-mm-dd |
| `computeSkeletonNnn()` | `computeNextNnn()` | 计算当日递增序号 |

三组方法逻辑一致但各自独立实现，违反 DRY 原则。特别是 `getUsername` 和 `loadUsername` 的实现代码几乎逐行相同。

### 影响

维护负担增加，未来修改需要同步两处。当前不影响功能。

### 建议修复

1. 将 `formatDate` / `formatDateStr` 抽取为共享工具函数（如 `src/core/utils.ts`）
2. `computeSkeletonNnn` / `computeNextNnn` 的序号计算逻辑可提取公共方法
3. `getUsername` 可复用 `PublicLogger` 实例或抽取为独立工具

### 处理记录

| 时间 | 操作者 | 说明 | Commit |
|------|--------|------|--------|

### 验收记录

| 时间 | 验收人 | 结论 | 备注 |
|------|--------|------|------|

---

## REV-004: createLogSkeleton 私域日志文件命名缺少 username 前缀

- **状态**：pending
- **优先级**：medium
- **提出人**：Reviewer
- **提出时间**：2026-07-14 23:50
- **blocking**：false

### 问题描述

`createLogSkeleton` 生成的文件名格式为 `{date}-{NNN}.md`（如 `2026-07-14-001.md`），而公共日志 `PublicLogger` 的文件名格式为 `{date}-{username}-{NNN}.md`（如 `2026-07-14-Liuary-001.md`）。

虽然私域日志已在 `users/{username}/log/` 路径下，username 冗余度较低，但与 `.opencode/instructions/core.md` 中定义的私域日志命名规范 `yyyy-mm-dd-NNN.md`（无需用户名）一致，因此命名本身合规。

但需注意：`computeSkeletonNnn` 的序号计算与用户手动创建的日志文件共享同一序号空间，可能产生冲突。例如用户已手动创建 `2026-07-14-001.md`，骨架文件会计算为 `2026-07-14-002.md`，这是正确行为。但若用户在骨架创建后又手动创建同名文件，则 `existsSync` 幂等检查会跳过，不会覆盖——这也是正确的。

**结论**：命名规范合规，序号竞争处理正确，此项为观察记录，无需修复。

### 处理记录

| 时间 | 操作者 | 说明 | Commit |
|------|--------|------|--------|

### 验收记录

| 时间 | 验收人 | 结论 | 备注 |
|------|--------|------|------|

---

## 审查维度总结

| 维度 | 结论 | 详情 |
|------|------|------|
| **正确性** | ✅ 基本正确 | REV 闭环双路兜底（命令层 + FlowManager 层）正确实现，--force 不可绕过；日志骨架创建幂等性正确；公域日志降噪（取消逐条 logPhaseChange，改用 endStage 批量 logMilestone）正确 |
| **规范性** | ✅ 符合 | 中文注释、早返回模式、大括号使用等均符合 AGENTS.md 编码规范 |
| **安全性** | ✅ 安全 | --force 不可绕过 REV 阻塞检查；git 脏区检查作为安全网存在；无注入或越权风险 |
| **完整性** | ✅ 完整 | 6 个 op 全部覆盖；中英文模板同步一致；.opencode/agents 与 templates-data 同步；npm test 291/291 通过 |
| **一致性** | ⚠️ 轻微问题 | `logMilestone` 与 `logPhaseChange` 签名风格不一致（title 参数被忽略）；`getUsername`/`formatDateStr` 与 PublicLogger 重复实现 |

### 关键检查点验证

| 检查点 | 结果 |
|--------|------|
| REV 闭环：blocking REV 阻塞 done，--force 不可绕过 | ✅ 双路兜底（flow.ts L423-443 + flow-manager.ts L822-838），--force 时显式拒绝 |
| 日志 agent 字段记录触发者 | ⚠️ advanceStagePhase 支持 triggeredBy，但 flow.ts CLI 调用未传递（REV-002） |
| 公域日志降噪 | ✅ advanceStagePhase 中注释掉逐条 logPhaseChange，endStage 使用 logMilestone |
| 中英文模板同步 | ✅ zh-CN / en 的 executor.md 和 feel.md 内容一一对应 |
| 日志骨架创建 | ✅ 关键 phase 自动创建，幂等性正确 |
| 回归测试 | ✅ 291/291 通过 |
