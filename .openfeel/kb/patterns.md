# 代码模式

> 使用 [+] / [-] 标记管理启用/禁用状态。只能标记禁用不能删除。

## [+] Phase Zod enum 硬化模式 (2026-06-27)

将动态 `string` 类型的 Phase 字段硬化为 Zod enum，在数据入口处即拒绝非法值：

```typescript
// 之前：动态 string，任意值均可写入
phase: z.string()

// 之后：Zod enum，非法值在 parse 阶段即报错
phase: z.enum(['plan_pending', 'plan_doing', ...])
```

**配套机制：**
- `fuzzyCorrectPhase(input: string): PipelinePhase` — 模糊修正用户输入为合法 Phase（去除首尾下划线、后缀匹配、别名映射）
- `validate()` 返回 `ValidationResult` 分离 errors 和 warnings，`valid` 仅基于 errors
- `extraCorrections` 映射表需严格审核语义正确性（如 `exec_pending` 不应映射为 `exec_running`）

## [+] ValidationResult errors/warnings 分离模式 (2026-06-27)

验证结果应区分"硬错误"和"自动修正的警告"：

```typescript
interface ValidationResult {
  valid: boolean;       // 仅基于 errors（不含 warnings）
  errors: string[];     // 无法自动修正的硬错误
  warnings: string[];   // 已自动修正的警告（不影响 valid）
}
```

**反模式：** `validate()` 在执行自动修正后仍将 WARN 计入 errors，导致 `valid=false` 而调用方需二次调用 validate() 才得到 true。

## [+] autoFixReview 前置条件校验模式 (2026-06-27)

任何绕过常规流程的快捷方法必须自行校验前置条件：

```typescript
addAutoFixReview(opId: string, fixedBy: string) {
  // 1. 前置条件校验
  if (this.data.pipeline.phase !== 'review_failed') {
    throw new Error('自动修正仅允许在 review_failed 状态下调用');
  }
  // 2. 参数格式校验
  if (!opId.includes('.')) {
    throw new Error('opId 格式无效，需包含 stage.op 形式');
  }
  // 3. 使用正规路径而非直接赋值（确保 checkpoints 更新）
  this.advancePhase(opId, 'exec_running');
}
```

**反模式：**
- 直接赋值 `pipeline.phase = 'exec_running'` 绕过 `advancePhase()`（checkpoints 不更新）
- 不校验 opId 格式（不含 `.` 时产生空 stage 引用）

## [+] dry-run 逻辑真值处理模式 (2026-06-27)

dry-run 方法必须在所有分支正确返回 `fixed` 布尔值：

```typescript
repair(dryRun: boolean): { fixed: boolean } {
  // 分支 1：文件不存在
  if (!exists) {
    if (dryRun) return { fixed: false };  // dry-run 不能报告"已修复"
    this.createDefault(); return { fixed: true };
  }
  // 分支 2：.bak 损坏
  if (bakCorrupted) return { fixed: false };
  // 分支 3：无 .bak（一切正常）
  if (!hasBak) return { fixed: false };
}
```

**反模式：** dry-run 时跳过操作却仍返回 `fixed: true`（误报）；正常状态返回 `fixed: false` 时命令层 `exit(1)`（正常当错误）。

## [+] 文档路径绝对路径规范 (2026-06-28)

v3.2 最终确定的文档写入路径规范：
- 所有写入路径使用**绝对路径形式**：`项目根目录下的 docs/phase-{N}/`
- 知识库写入路径：`architecture.md` / `patterns.md` / `troubleshooting.md` / `setup.md`
- 项目分析报告：`docs/phase-{N}/`
- 禁止写入知识库的内容：行为约束（→ AGENTS.md）、操作流程（→ Instructions）、工作区维护规则（→ dev_core.md）

## [+] Schemer op 级依赖声明 (2026-06-28)

Schemer 产出操作方案（op-NNN）时，自动生成 `deps.yaml` 声明各 op 的依赖关系，供 Feel 并行调度使用。依赖类型：
- `hard`: 前置 op 必须完成
- `soft`: 弱依赖，警告但可启动
- `mutual_exclusion`: 互斥，串行执行

## [+] 知识库搜索增强模式 (2026-06-28)

`search-kb` 技能支持 `--limit` 和 `--offset` 参数控制返回结果数量，支持正文匹配（非仅标题索引），提升大知识库场景下的检索效率。
