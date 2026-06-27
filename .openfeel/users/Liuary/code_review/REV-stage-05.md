# stage-05 代码审查

> 审查时间：2026-06-25 23:15 | 审查人：ReviewWorker (Liuary)
> 阶段状态：**审核通过 ✅**（无阻塞问题，2 个非阻塞 REV 条目）

## 审查结论

stage-05「指令生成系统」实现正确，23/23 测试全部通过。核心功能：XML 格式指令生成、JSON 备选输出、依赖状态解析、XML 特殊字符转义、Fallback 分步指导生成、项目上下文注入均工作正常。以下为非阻塞改进建议。

---

## REV-001: generateInstructions 中 FlowManager 初始化结果未使用

- **状态**：pending
- **优先级**：medium
- **提出人**：ReviewWorker
- **提出时间**：2026-06-25 23:15

### 问题描述

`instruction-loader.ts` 第 248-255 行：

```typescript
const flowPath = resolve(projectPath, '.openfeel', 'flow.json');
if (!existsSync(flowPath)) {
  // flow.json 不存在时仅警告，不阻断指令生成
}
const flowManager = new FlowManager(projectPath);
const flowInitialized = flowManager.isLoaded();
```

- `flowManager` 实例化后会从磁盘读取 `flow.json`（产生 I/O 开销）
- `flowInitialized` 变量被赋值后**从未在任何地方使用**
- 流水线状态（当前 phase、重试次数、审查条目数等）未注入到生成的指令中
- `generateInstructionsJson` 方法中完全没有 FlowManager 相关逻辑，与 XML 方法不一致

**影响**：无功能影响，但造成不必要的磁盘 I/O 和死代码。若设计意图是注入流水线状态到指令中，则属于功能缺失；若无需注入，则此代码块应移除。

### 建议

1. 如果流水线状态应注入到 `<project_context>` 块中，请补充 `flowInitialized` 的使用逻辑
2. 如果无需注入，请移除第 248-255 行的 FlowManager 初始化代码
3. 确保 `generateInstructionsJson` 与 `generateInstructions` 的处理逻辑一致

### 处理记录
| 时间 | 操作者 | 说明 | Commit |
|------|--------|------|--------|

### 验收记录
| 时间 | 验收人 | 结论 | 备注 |
|------|--------|------|------|

---

## REV-002: collectHardDepIds 与 ArtifactGraph.collectHardDeps 逻辑重复

- **状态**：pending
- **优先级**：low
- **提出人**：ReviewWorker
- **提出时间**：2026-06-25 23:15

### 问题描述

`instruction-loader.ts` 第 178-196 行的 `collectHardDepIds` 函数与 `graph.ts` 第 62-82 行的 `ArtifactGraph.collectHardDeps` 私有方法逻辑完全一致：

```typescript
// instruction-loader.ts (独立函数)
function collectHardDepIds(artifact: Artifact): string[] {
  const hardDeps: string[] = [];
  if (artifact.dependsOn) { hardDeps.push(...artifact.dependsOn); }
  if (artifact.requires) {
    for (const dep of artifact.requires) {
      if (dep.type !== 'soft') { hardDeps.push(dep.artifact); }
    }
  }
  return [...new Set(hardDeps)];
}
```

两处实现相同的依赖过滤规则（dependsOn 全 hard + requires 按 type 过滤 + Set 去重），违反 DRY 原则。未来若依赖规则变更（例如引入新的依赖类型），需要同时修改两处。

### 建议

1. 将 `ArtifactGraph.collectHardDeps` 改为公开静态方法或导出为独立工具函数
2. `instruction-loader.ts` 直接复用，移除重复实现

### 处理记录
| 时间 | 操作者 | 说明 | Commit |
|------|--------|------|--------|

### 验收记录
| 时间 | 验收人 | 结论 | 备注 |
|------|--------|------|------|

---

## 附：审查通过理由

| 检查项 | 结果 | 说明 |
|--------|------|------|
| XML 格式严格遵循标记结构 | ✅ | `<?xml>` 声明、`<artifact>` 根元素、子标签闭合 |
| 项目上下文注入（config.yaml） | ✅ | 执行模式、自动推进、测试启用、合并模式均注入 |
| 依赖状态解析（ArtifactGraph） | ✅ | hard/soft 依赖正确区分，done/pending 状态正确 |
| XML 特殊字符转义 | ✅ | `&` `"` `'` `<` `>` 五种字符均转义 |
| Fallback 指导生成 | ✅ | 无 instruction 字段时自动生成 5 步分步指导 |
| Commander 命令注册模式 | ✅ | 与 plan.ts 一致的 Commander 子命令模式 |
| CLI 注册 | ✅ | cli/index.ts 第 36 行正确注册 |
| 参数验证 | ✅ | requiredOption --change，argument <artifactId> |
| 错误处理 | ✅ | try-catch + process.exit(1) |
| 测试覆盖 | ✅ | 23 tests: XML/JSON 格式、标签、依赖状态、转义、边界条件 |
