# 问题总结与改进建议

> 基于 2026-06-27 OpenFeel 全 Agent 功能与边界测试发现。

---

## 一、发现的问题

### P1 — Flow CLI 校验不严格

**现象**：
```
> openfeel flow advance --to nonexistent_phase
[WARN] Phase 'nonexistent_phase' 自动修正为 '...'
✓ 已全局推进 → nonexistent_phase
```

对非法阶段名仅发出警告但**仍然执行推进**，导致 flow.json 可能进入不一致状态。

**影响**：中等。在自动闭环模式下可能导致状态机混乱。

**建议**：
- 非法阶段名应直接拒绝，返回错误码，不修改 flow.json
- 可考虑返回合法阶段名列表作为提示
- 同时检查 `--op` 参数与 `--to` 的一致性（某些阶段间跳转不应被允许）

---

### P2 — Flow CLI 阶段跳跃无保护

**现象**：
```
plan_pending →(直接跳) → review_pending  # 跳过了 scheme_pending 和 code_pending
```

系统允许跨阶段跳跃推进，没有校验阶段间是否应该经过中间状态。

**影响**：低。手动模式下 Feel 调度者会控制顺序，但自动模式下可能误操作。

**建议**：
- 定义合法的阶段跳转表（如 plan_pending 只能到 plan_passed）
- 非法跳转返回警告并要求 `--force` 参数显式确认

---

### P3 — flow.json.bak 备份文件

**现象**：`.openfeel/flow.json.bak` 文件在推进过程中产生，不清楚是备份机制还是异常产物。

**影响**：低。不影响功能，但可能与版本管理冲突。

**建议**：
- 明确备份策略：是每次修改前备份还是仅出错时备份？
- 考虑用 `.gitignore` 排除 `.bak` 文件
- 或在 flow.json 同目录下创建 `backups/` 子目录

---

### P4 — Stage 状态与 Flow 状态不同步

**现象**：
- `flow.json` 的 `pipeline.phase` 为 `test_pending`
- `stage-01/status.md` 已经是 `done`
- flow.json 的 `stages` 字段为空对象 `{}`

Flow 级别的阶段推进与 Stage 级别的状态更新似乎是两个独立系统，未自动联动。

**影响**：中等。两层状态不一致可能导致自动闭环逻辑判断错误。

**建议**：
- 当 stage 状态变为 done 时，自动更新 flow.json 的 stages 字段
- 或者在 flow advance 命令中增加 `--stage <id>` 参数关联 stage
- 确保 flow status 命令同时展示全局和 stage 级状态

---

### P5 — 知识库搜索仅返回标题

**现象**：
```
> openfeel knowledge search "UUID"
找到 1 条匹配:
[architecture] 零依赖 CLI 架构设计 (2026-06-27) [启用]
  **决策**：Task CLI 项目运行时零外部依赖...
```

搜索结果截断不完整（末尾 `…`），且只返回了一条，但 `knowledge list` 显示 10 条。

**影响**：低。当前知识库规模小，大规模时搜索效果未知。

**建议**：
- 搜索结果应支持分页或 `--limit` 参数
- 高亮匹配关键词
- 可能实现全文搜索而非仅标题匹配

---

### P6 — Executor 不会主动检查 Op 文件存在性

**现象**：在边界测试 #4 中，Executor 被要求执行不存在的 op-999，虽然最终确认了文件不存在，但这是因为它先读取了 ops 目录。如果任务描述中没有"检查 ops 目录"的指令，Executor 可能直接尝试编造实现。

**影响**：低。实际使用中 Schemer 不会生成不存在的 op。

**建议**：
- Executor 启动时增加内置的前置检查：验证 op 文件存在于指定路径
- 文件不存在时立即拒绝并报告，不进入编码流程

---

### P7 — Reviewer 和 Tester 的公共日志写入时机不一致

**现象**：
- Reviewer 发现 high REV 时写入了公共日志（`2026-06-27-Liuary-002.md`）
- Tester 发现 high BUG 时写入了公共日志
- 但正常审查通过和测试通过时未写入公共日志

这符合规范（"仅 high 优先级首次发现时上报详情"），但可能导致正常流程的审计链不完整。

**影响**：低。文档规范如此，但可考虑所有状态变更都写入日志。

**建议**：
- 考虑在 `flow.json` 的 log 数组中记录每次状态变更（目前已有此机制）
- 公共日志保持 high 优先级的规则，但 flow.json log 应记录全部变更

---

## 二、边界测试发现

### 缺陷发现-修复链路验证 ✅

```
编译时错误：status:'todo' ∉ TaskStatus
  → Reviewer 捕获（REV-001, high）
  → 修复 → 类型检查通过

运行时错误：generateId() 返回硬编码字符串
  → Tester 捕获（BUG-001, high）
  → 根因分析（import 被注释，函数体被替换）
  → 修复 → test_stage1.mjs 6/6 通过
```

**结论**：缺陷发现-修复链路运作正常，Reviewer 和 Tester 各自覆盖了编译时和运行时两个层面。

### Executor 职责边界验证 ✅

当操作方案不完整时，Executor 正确识别了 5 项缺失并拒绝执行：

| 缺失项 | 说明 |
|--------|------|
| 目标不明确 | 不知要实现什么 |
| 步骤残缺 | 步骤2 空白 |
| 产出未指定 | 不知文件路径 |
| 自测清单缺失 | 无法验证 |
| 技术细节缺失 | 无接口签名 |

**结论**：Executor 的"严格按方案执行"约束有效防止了模型幻觉导致的不当编码。

### 状态恢复验证 ✅

从 `bug_found` → 修复代码 → `npm run build` → `test_stage1.mjs` 通过 → `done`，整个恢复流程无需重跑全部 Agent，只需修复代码并重新验证。

**结论**：状态机的故障恢复设计合理，不需要从头开始。

---

## 三、改进建议

### 短期（可立即实施）

1. **Flow CLI 严格校验**：拒绝非法阶段名，返回明确错误
2. **flow.json 字段补全**：`stages` 字段应反映各 stage 状态
3. **增加 flow check 命令**：检查 flow.json 与各 status.md 的一致性
4. **Stage status.md 时间戳标准化**：当前部分条目缺少精确时间（如 `2026-06-27` 无时分）

### 中期（需设计讨论）

5. **Flow ↔ Stage 自动联动**：stage 状态变更时自动更新 flow.json
6. **全局仪表盘**：`openfeel flow dashboard` 命令展示所有 stage 的实时状态
7. **Executor 前置校验钩子**：编码前自动验证 op 文件存在性和完整性
8. **知识库全文搜索**：支持正文内容搜索，高亮匹配

### 长期（架构演进）

9. **并行 Worktree 支持**：当前 deps.yaml 已定义并行组，但 auto 模式下未实际测试
10. **跨会话上下文恢复**：Feel 重启后能否从 flow.json + status.md 准确恢复状态机位置
11. **多用户冲突检测**：两个用户同时修改不同 stage 的代码时，合并策略
12. **Agent 性能指标**：记录每个 Agent 的执行时间、成功率、重试次数，用于持续改进

---

## 四、经验教训

| # | 教训 | 分类 |
|---|------|------|
| 1 | 操作方案写得越细，Executor 出错的概率越低——op-003 直接给出了完整代码，Executor 复制即可 | patterns |
| 2 | 异种模型审查确实有效——Reviewer 发现了 Scheme 中人类容易忽略的细节（如 shebang 缺失） | architecture |
| 3 | `flow.json` 和 `status.md` 是双轨状态——需确保两者同步，否则自动闭环可能误判 | troubleshooting |
| 4 | 边界测试应覆盖编译时错误和运行时错误两种类型——Reviewer 擅长前者，Tester 擅长后者 | patterns |
| 5 | 零依赖约束在 CLI 工具中完全可行——Node.js 内置模块已覆盖所有需求 | architecture |
| 6 | 精确版本锁定（`5.7.3` 而非 `^5.7.3`）在应用项目中是正确的策略 | patterns |
| 7 | `npm run prebuild` 钩子在每次 build 前自动 typecheck，是简易但有效的质量门禁 | setup |
