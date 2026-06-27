# v2-stage-04 韧性路径验证报告

> 验证时间：2026-06-27 14:15-14:35
> 验证人：AutoRunner Agent (Liuary)
> 状态：✅ 完成（3/3 操作已验证，发现 3 项问题）

---

## 一、验证环境

| 项目 | 值 |
|------|-----|
| CLI 版本 | `openfeel 0.1.0` (Node.js v20.11.1) |
| 测试目录 | `.openfeel/tmp/stage-04-test/` |
| 测试 flow.json | 含 1 阶段、1 操作、max_attempts=3 |
| 状态机源码 | `src/core/flow-manager.ts` — VALID_TRANSITIONS |

---

## 二、操作 1：review_failed → scheme_pending 全链路

### 2.1 预期路径（设计描述）

```
review_failed → scheme_pending → Schemer 重定方案 → Executor 修正
```

### 2.2 实际测试结果

| 步骤 | 命令 | 结果 |
|------|------|------|
| plan_pending → plan_passed | `flow advance --to plan_passed` | ✅ 成功 |
| plan_passed → scheme_pending → scheme_passed | `flow advance --to scheme_pending/passed` | ✅ 成功 |
| scheme_passed → exec_running | `flow advance --to exec_running` | ✅ 成功 |
| exec_running → review_pending | `flow advance --to review_pending` | ✅ 成功 |
| review_pending → review_failed | `flow advance --to review_failed` | ✅ 成功 |
| **review_failed → scheme_pending** | `flow advance --to scheme_pending` | ❌ **被阻断** |
| review_failed → review_pending | `flow advance --to review_pending` | ✅ 成功（当前合法路径） |

### 2.3 结论

**`review_failed → scheme_pending` 路径不可达。**

- `canAdvance()` 校验失败：`VALID_TRANSITIONS[review_failed] = ['review_pending']`，不包含 `scheme_pending`
- CLI 输出：`错误：无法从当前阶段推进到 "scheme_pending"（不合法或 op 不存在）`
- 当前合法路径：`review_failed → review_pending`（重回审查，不触发重定方案）
- **设计意图 vs 实现差异**：计划中描述的 `review_failed → scheme_pending`（失败后触发 Schemer 重定方案）在当前状态机中不存在

---

## 三、操作 2：test_failed → scheme_pending 全链路

### 3.1 预期路径（设计描述）

```
test_failed → scheme_pending → Schemer 重定方案 → Executor 修复 → Tester 再测
```

### 3.2 实际测试结果

| 步骤 | 命令 | 结果 |
|------|------|------|
| review_pending → review_passed | `flow advance --to review_passed` | ✅ 成功 |
| review_passed → test_pending | `flow advance --to test_pending` | ✅ 成功 |
| test_pending → test_failed | `flow advance --to test_failed` | ✅ 成功 |
| **test_failed → scheme_pending** | `flow advance --to scheme_pending` | ❌ **被阻断** |
| test_failed → test_pending | `flow advance --to test_pending` | ✅ 成功（当前合法路径） |

### 3.3 结论

**`test_failed → scheme_pending` 路径不可达。**

- `canAdvance()` 校验失败：`VALID_TRANSITIONS[test_failed] = ['test_pending']`，不包含 `scheme_pending`
- CLI 输出：`错误：无法从当前阶段推进到 "scheme_pending"（不合法或 op 不存在）`
- 当前合法路径：`test_failed → test_pending`（重回测试，不触发重定方案）
- **设计意图 vs 实现差异**：计划中描述的 `test_failed → scheme_pending`（失败后触发 Schemer 重定方案）在当前状态机中不存在

---

## 四、操作 3：3 次重试上限

### 4.1 预期行为（设计描述）

> 第 3 次失败后正确回退到 Schemer，不陷入死循环

### 4.2 实际测试结果

| 尝试 | 命令 | attempts | op.state | pipeline.retry | recordAttempt 返回值 |
|------|------|----------|----------|----------------|---------------------|
| 第 1 次 fail | `flow attempt --result fail` | 0→1 | pending | 0→1 | `shouldRetry=true` |
| 第 2 次 fail | `flow attempt --result fail` | 1→2 | pending | 1→2 | `shouldRetry=true` |
| 第 3 次 fail | `flow attempt --result fail` | 2→3 | **failed** | 2→3 | `shouldReplan=true` |

### 4.3 重试计数器分析

- **✅ retry 计数器正确递增**：0 → 1 → 2 → 3
- **✅ max_attempts=3 正确生效**：第 3 次失败后 `op.state = 'failed'`
- **✅ `shouldReplan=true` 正确返回**：`recordAttempt()` 在重试耗尽后返回 `{ shouldRetry: false, shouldReplan: true }`
- **✅ 状态不陷入死循环**：op 状态变更为 `failed`，retry 计数器停在 3
- **❌ 未自动回退到 Schemer**：

### 4.4 CLI 行为分析

CLI 仅在控制台输出提示文字：
```
✗ test-stage.op-001 重试耗尽，需要重新规划
```

但**未执行任何自动状态转换**：
1. `flow attempt` 命令只调用 `recordAttempt()` 并打印消息，未调用 `advancePhase()` 跳转到 `scheme_pending`
2. 即使尝试手动 `flow advance --to scheme_pending`，也会被 `canAdvance()` 阻断，因为 `VALID_TRANSITIONS[exec_running] = ['review_pending']`，不包含 `scheme_pending`

### 4.5 死循环风险评估

当前实现**不会陷入死循环**：
- `op.attempts` 达到 `max_attempts` 后，`op.state` 变为 `failed`
- `recordAttempt()` 返回 `shouldRetry=false`
- 后续 `flow attempt --result fail` 再次调用仍会返回 `shouldRetry=false`（attempts=3, max=3，条件 `3 < 3` 为 false）
- 但 CLI 没有后续链路告诉用户下一步该做什么

### 4.6 日志验证

日志完整记录了重试过程（从 `.openfeel/tmp/stage-04-test-retry/flow.json`）：
```
[06:32:02] executor — attempt_fail_retry   { attempts: 1, maxAttempts: 3 }
[06:32:03] executor — attempt_fail_retry   { attempts: 2, maxAttempts: 3 }
[06:32:04] executor — attempt_fail_exhausted { attempts: 3, maxAttempts: 3 }
```

---

## 五、根因分析

### 5.1 状态机设计：VALID_TRANSITIONS 不完整

`src/core/flow-manager.ts` 第 129-145 行定义的 `VALID_TRANSITIONS` 缺少以下三个转换：

```diff
  review_pending: ['review_failed', 'review_passed'],
- review_failed: ['review_pending'],
+ review_failed: ['review_pending', 'scheme_pending'],
  review_passed: ['test_pending'],
  test_pending: ['test_failed', 'test_passed'],
- test_failed: ['test_pending'],
+ test_failed: ['test_pending', 'scheme_pending'],
+ exec_running: ['review_pending', 'scheme_pending'],
```

### 5.2 CLI 命令：缺少自动推进逻辑

`src/commands/flow.ts` 第 101-112 行 `flow attempt` 命令：
- `shouldReplan=true` 时仅打印提示文字
- 未调用 `mgr.advancePhase(opId, 'scheme_pending')` 进行自动回退
- 未建议用户运行 `flow advance --to scheme_pending`

### 5.3 状态机与操作方案的生命周期脱节

`flow attempt` 命令基于 `op.attempts` 判断重试，但 VALID_TRANSITIONS 的控制粒度是 `PipelinePhase`（流水线阶段）而非操作（Op）。`shouldReplan` 的语义是"当前操作方案需要重新规划"，应触发阶段回退到 `scheme_pending`，但状态机未提供此路径。

---

## 六、问题清单

| # | 问题 | 严重程度 | 影响 |
|---|------|---------|------|
| BUG-01 | `VALID_TRANSITIONS` 缺少 `review_failed → scheme_pending` | 🔴 High | 审查失败后无法自动触发 Schemer 重定方案 |
| BUG-02 | `VALID_TRANSITIONS` 缺少 `test_failed → scheme_pending` | 🔴 High | 测试失败后无法自动触发 Schemer 重定方案 |
| BUG-03 | `flow attempt --result fail` 在 `shouldReplan=true` 时不自动推进到 `scheme_pending` | 🟡 Medium | 重试耗尽后需手动操作，自动化闭环断裂 |

---

## 七、总结

### 7.1 已验证项

| 验证项 | 结果 |
|--------|------|
| review_failed 后能否回到 review_pending（当前合法路径） | ✅ 通过 |
| test_failed 后能否回到 test_pending（当前合法路径） | ✅ 通过 |
| 3 次重试后 retry 计数器正确停止 | ✅ 通过 |
| 3 次重试后 `shouldReplan=true` 正确返回 | ✅ 通过 |
| 3 次重试后不陷入死循环 | ✅ 通过 |
| 重试日志完整记录 | ✅ 通过 |

### 7.2 未通过项

| 验证项 | 结果 |
|--------|------|
| review_failed → scheme_pending 路径可达 | ❌ 不可达 |
| test_failed → scheme_pending 路径可达 | ❌ 不可达 |
| 重试耗尽后自动回退到 Schemer | ❌ 未实现 |

### 7.3 核心结论

OpenFeel v1.0 的**失败回退机制存在但路径不完整**：
1. 失败状态（review_failed / test_failed）只能回到上一级（review_pending / test_pending），不能回到 scheme_pending 触发重新规划
2. 重试计数器正确实现了 3 次上限，但 `shouldReplan` 信号未连接到状态机推进逻辑
3. 当前设计中，"重定方案"这一关键自愈能力在整个自动化链路中是**断裂的**
