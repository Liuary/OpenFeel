# v4.1-stage-03 代码审查

## REV-001: migrate() dry-run 模式修改了 this.data 内存状态
- **状态**：closed
- **优先级**：medium
- **提出人**：Reviewer
- **提出时间**：2026-07-07 23:45

### 问题描述

`FlowManager.migrate()` 方法在 `dryRun=true` 时仍然直接修改了 `this.data` 的内存状态：
- 行 1839-1853：`stage.phase` 赋值不受 dryRun 守卫
- 行 1867-1869：`pipeline.phase` 更新不受 dryRun 守卫

仅备份（行 1827）和日志追加（行 1872）被 `!dryRun` 保护。

**与 repair() 的模式不一致**：`repair()` dry-run 修改的是从文件重新解析的局部 `flowData` 变量，不影响 `this.data`；而 `migrate()` 直接修改 `this.data`。

**潜在风险**：虽然当前 CLI handler 在 dry-run 后 return 不调用 `save()`（文件不会被写入），但如果未来复用 FlowManager 实例（如 wizard 先 preview 再执行），dry-run 的副作用会导致内存状态被污染。

**修复建议**：方案 A（推荐）— 在 dry-run 模式下深拷贝 `this.data`，对副本进行变更预览，不修改原始数据；方案 B — 将所有 `this.data` 变异操作包裹在 `if (!dryRun)` 守卫中，预览信息通过遍历 stages 预计算生成（不实际赋值）。

### 处理记录
| 时间 | 操作者 | 说明 | Commit |
|------|--------|------|--------|
| 2026-07-07 23:44 | Executor | 采用方案 A：dry-run 时深拷贝 `this.data` 到 `targetData`，所有变异操作在 `targetData` 上进行 | - |

### 验收记录
| 时间 | 验收人 | 结论 | 备注 |
|------|--------|------|------|
| 2026-07-07 23:50 | Reviewer (GLM) | ✅ 通过 | 方案A（深拷贝）实施正确，dry-run测试确认文件不变，与repair()模式一致 |

---

## REV-002: flow advance --stage 未使用 .requiredOption()
- **状态**：pending
- **优先级**：low
- **提出人**：Reviewer
- **提出时间**：2026-07-07 23:45

### 问题描述

方案 op-003 步骤 2 明确要求"将 `--stage <id>` 从 `.option()` 改为 `.requiredOption()`"，实际实现使用 `.option()` + 手动校验（flow.ts 行 324-331）。

**影响**：`openfeel flow advance --help` 输出中 `--stage <id>` 显示为普通选项（无 `<required>` 标记），降低了参数必选性的可发现性。功能上等效（手动校验提供更好的中文错误提示）。

**修复建议**：改为 `.requiredOption('--stage <id>', '阶段 ID（如 stage-03），必须指定')`，如需自定义中文错误提示，可在 Commander.js 的 `showHelpAfterError` 或全局错误处理中覆盖。

### 处理记录
| 时间 | 操作者 | 说明 | Commit |
|------|--------|------|--------|

### 验收记录
| 时间 | 验收人 | 结论 | 备注 |
|------|--------|------|------|
