# REV-v2-stage-02：CLI Bug 修复 + 增强

- **审查结论**：通过（review_passed）
- **审查人**：review-worker
- **审查时间**：2026-06-27 14:13

---

## 审查覆盖

| 操作 | 状态 | 说明 |
|------|------|------|
| op-001 plan stage add 同步到 flow.json | ✅ 通过 | registerStage() 幂等空安全，addStage() 正确调用 + save |
| op-002 scheme create 自动注册 stage | ✅ 通过 | syncToFlowJson() stage 不存在时自动创建，结构与 registerStage 一致 |
| op-003 archiver phase 枚举 | ✅ 通过 | 15 个合法 phase 全部列出，明确警告禁用 "completed" |
| op-004 validate() 增强 | ✅ 通过 | 检测非标准 phase，4 个已知值正确修正，修正后添加 errors 警告 |
| op-005 advance opId 可选 | ✅ 通过 | advancePhase 支持 null opId，CLI --op 改为可选，全局推进正确跳过校验 |
| op-006 schemer 质量指标 | ✅ 通过 | 质量指标可验证性章节完整，引用 roadmap 路径正确，位置不影响模板结构 |

## 审查详情

### op-001 验证
- `FlowManager.registerStage()` (L394-412)：空数据返回、已注册跳过、结构 `{name, status: 'planned', deps, ops: {}}` ✅
- `addStage()` (L99-104)：`isLoaded()` 判断、`registerStage()` + `save()`、`deps ?? []` ✅

### op-002 验证
- `syncToFlowJson()` (L101-151)：flow.json 不存在跳过、stage 不存在自动创建、try-catch 保护 ✅
- stage entry 结构对比 `registerStage()`：`{name, status, deps: [], ops}` vs `{name, status, deps, ops}` — 一致 ✅

### op-003 验证
- archiver 模板 L404-426：15 个 phase 完整（plan_pending ~ done）✅
- 警告文本："归档完成后的阶段状态必须设为 `"done"`，**不得**使用 `"completed"`" ✅
- 表格格式 `| phase | 含义 |` 正确 ✅

### op-004 验证
- `validate()` L636-653：`validPhases.includes()` 检测、`phaseCorrections` 映射 `{completed→done, finished→done, archived→done, pending→plan_pending}` ✅
- 修正后 `errors.push()` 含原值和修正值 ✅
- 未知非标准值也报错 ✅

### op-005 验证
- `advancePhase(opId: string | null, to: PipelinePhase)` L421：类型正确 ✅
- 全局推进（opId null）：跳过 op 查找/校验但仍更新 phase + 日志 ✅
- 向后兼容：`openfeel flow advance --op stage-01.op-001 --to exec_running` 仍有效 ✅
- CLI `--op` 从 `requiredOption` 改为 `option` ✅
- `PipelinePhase` 类型正确导入 ✅

### op-006 验证
- schemer 模板 L207-221：`## 质量指标可验证性` 章节，引用 `roadmap/{version}.md` ✅
- 三条规则：可验证性检查、覆盖完整性、偏差记录 ✅
- 示例表格：`| 指标 | 目标值 | 验证方式 |` ✅
- 位置在方案模板代码块之后，不影响结构 ✅

## 提醒项（非阻塞）

### REV-002-01：schemer 模板拼写错误

- **状态**：pending
- **优先级**：low
- **描述**：`src/core/update.ts` 第213行 schemer Agent 定义中，`"覆盖该阶段 Roadmap 中声名的所有质量指标"` 存在拼写错误，`"声名"` 应为 `"声明"`。
- **影响**：仅影响文档可读性，不影响功能。

### REV-002-02：syncToFlowJson 与 registerStage stage entry 代码重复

- **状态**：pending
- **优先级**：low
- **描述**：`src/core/plan/scheme.ts` `syncToFlowJson()` L122-128 和 `src/core/flow-manager.ts` `registerStage()` L406-411 中存在 stage entry 创建的代码逻辑重复。两处都创建 `{name, status: 'planned', deps, ops: {}}` 结构，仅 deps 默认值略有不同。
- **影响**：无功能影响，后续若 stage entry 结构变更需同步修改两处。
- **建议**：可考虑 `syncToFlowJson()` 内部调用 `flowMgr.registerStage()` 而非直接操作 `flowData.stages`。

---

## 拒绝项

无。所有 6 个操作全部达标。
