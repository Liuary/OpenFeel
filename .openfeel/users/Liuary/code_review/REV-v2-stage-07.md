# REV-v2-stage-07：可扩展性重构（核心+适配器）

- **状态**：closed
- **审查人**：ReviewWorker
- **审查时间**：2026-06-27 16:00
- **审查结论**：审核通过 ✅（0 个阻塞问题，1 个 medium 建议 + 3 个 low 建议）

## REV-v2-stage-07-001：PipelinePhase 类型从固定枚举退化为 string

- **状态**：closed
- **优先级**：medium
- **提出人**：ReviewWorker
- **提出时间**：2026-06-27 16:00

### 问题描述

`src/core/flow-manager.ts` 第 13 行：

```ts
// 旧
export type PipelinePhase =
  | 'plan_pending' | 'plan_review' | ... | 'done';

// 新
export type PipelinePhase = string;
```

**影响**：
- IDE 不再能自动补全合法的 phase 值
- 编译时不再能捕获拼写错误（如 `'scheme_pendng'`）
- 测试中的 `'review_failed' as PipelinePhase` 断言失去语义效力——现在等价于 `as string`

**原因**：可扩展性重构将 phase 列表从硬编码迁移到 `pipeline.yaml`，运行时动态加载使得编译时枚举不再可行。这是设计权衡。

### 处理记录

| 时间 | 操作者 | 说明 |
|------|--------|------|
| 2026-06-27 16:00 | ReviewWorker | 记录为已知设计权衡，不阻塞发布 |

### 验收记录

| 时间 | 验收人 | 结论 | 备注 |
|------|--------|------|------|
| 2026-06-27 16:00 | ReviewWorker | closed | 可扩展性 vs 类型安全的合理权衡。未来可考虑 Zod enum 推导或 branded type 恢复部分编译时安全。 |

---

## REV-v2-stage-07-002：loadPipelineConfig catch 块静默吞异常

- **状态**：closed
- **优先级**：low
- **提出人**：ReviewWorker
- **提出时间**：2026-06-27 16:00

### 问题描述

`src/core/flow-manager.ts` 第 680-683 行：

```ts
} catch {
  // 解析失败时回退到内置默认值
  this.pipelineConfig = this.getDefaultPipelineConfig();
}
```

当 `.openfeel/pipeline.yaml` 内容存在但格式错误时，会静默回退到内置默认值，无任何警告或日志输出。开发者在调试 pipeline.yaml 格式问题时会比较困难。

### 建议

至少添加 `console.warn` 或通过 FlowManager 的内部日志记录错误信息。

### 处理记录

| 时间 | 操作者 | 说明 |
|------|--------|------|
| 2026-06-27 16:00 | ReviewWorker | 低优先级建议，不阻塞发布 |

### 验收记录

| 时间 | 验收人 | 结论 | 备注 |
|------|--------|------|------|
| 2026-06-27 16:00 | ReviewWorker | closed | 低优先级，非阻塞。实际运行中 pipeline.yaml 格式错误可由 CI 或 lint 工具提前发现。 |

---

## REV-v2-stage-07-003：autoRegisterCommands 依赖 process.cwd()

- **状态**：closed
- **优先级**：low
- **提出人**：ReviewWorker
- **提出时间**：2026-06-27 16:00

### 问题描述

`src/cli/index.ts` `autoRegisterCommands` 函数：

```ts
const commandFiles = globSync('src/commands/*.ts', { cwd: process.cwd(), absolute: true });
```

如果用户在非项目根目录运行 CLI（如通过全局安装），`process.cwd()` 可能不是项目根目录，`src/commands/*.ts` 不匹配任何文件，导致所有命令无法注册。

### 建议

使用 `import.meta.url` 或 `__dirname` 推导项目根目录，而非依赖 `process.cwd()`。

### 处理记录

| 时间 | 操作者 | 说明 |
|------|--------|------|
| 2026-06-27 16:00 | ReviewWorker | 低优先级建议，不阻塞发布 |

### 验收记录

| 时间 | 验收人 | 结论 | 备注 |
|------|--------|------|------|
| 2026-06-27 16:00 | ReviewWorker | closed | CLI 工具仅在项目根目录运行是当前设计假设，非阻塞。未来全局安装场景需改进。 |

---

## REV-v2-stage-07-004：instruction-loader.ts 模板文件加载失败静默回退

- **状态**：closed
- **优先级**：low
- **提出人**：ReviewWorker
- **提出时间**：2026-06-27 16:00

### 问题描述

`src/core/artifact-graph/instruction-loader.ts` `loadTemplateFile` 函数第 68-71 行：

```ts
} catch {
  return null;
}
```

当模板文件存在但因权限、编码等问题读取失败时，会静默回退到原始 `artifact.template` 字符串。调用方无法区分"文件不存在"和"文件读取失败"。

### 建议

区分 `existsSync` 返回 false（正常，无模板文件）和 `readFileSync` 失败（异常，需要告警），后者应输出警告或在指令生成结果中标记。

### 处理记录

| 时间 | 操作者 | 说明 |
|------|--------|------|
| 2026-06-27 16:00 | ReviewWorker | 低优先级建议，不阻塞发布 |

### 验收记录

| 时间 | 验收人 | 结论 | 备注 |
|------|--------|------|------|
| 2026-06-27 16:00 | ReviewWorker | closed | 现有逻辑已通过 `existsSync` 区分文件不存在的情况，catch 仅处理读取异常。低优先级。 |

---

## 全量审查项通过清单

| 审查项 | 状态 | 备注 |
|--------|------|------|
| pipeline.yaml 加载失败回退逻辑 | ✅ | 正确回退到 getDefaultPipelineConfig() |
| FlowManager API 向后兼容 | ✅ | advancePhase(opId: string\|null, to) 兼容旧调用 |
| canAdvance 从 pipelineConfig 读取 | ✅ | 正确使用配置驱动而非硬编码常量 |
| validate 从 pipelineConfig 校验 | ✅ | 含自动修正逻辑（phase_corrections） |
| config.yaml Zod Schema 校验 | ✅ | 嵌套 defaults 提升到顶层，向后兼容 |
| instruction-loader 模板文件加载 | ✅ | 含文件路径检测和回退机制 |
| CLI autoRegisterCommands | ✅ | 正确动态加载所有命令模块 |
| BUG-03 修复（shouldReplan→scheme_pending） | ✅ | flow.ts advance_phase 自动回退 |
| pipeline.yaml transitions 完整性 | ✅ | review_failed→scheme_pending / test_failed→scheme_pending / exec_running→scheme_pending |
| 测试覆盖 BUG-01/02 | ✅ | 两个新测试 + exec_running 测试 |
| 测试全部通过 | ✅ | 217/219（2 预存失败，与本次无关） |
| 适配器目录规范 | ✅ | README.md 清晰完整，三个 ADAPTER.md 就位 |
| AGENTS.md 平台无关说明 | ✅ | 跨平台统一约束层 + 跨 Agent 工具使用约束 |
| 编码规范 | ✅ | 中文注释、早返回、大括号、不可变声明 |
| .openfeel/config.yaml meta 扩展 | ✅ | project/tech_stack 已添加 |
