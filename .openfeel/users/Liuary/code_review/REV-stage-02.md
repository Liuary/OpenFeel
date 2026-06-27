# stage-02 代码审查报告

## REV-01: collectHardDeps 未去重导致 inDegree 计数错误与假循环检测
- **状态**：closed
- **优先级**：high
- **提出人**：ReviewWorker
- **提出时间**：2026-06-25 22:10

### 问题描述

src/core/artifact-graph/graph.ts 中 collectHardDeps() 方法未对收集到的依赖 ID 做去重处理。当同一 artifact 同时在 dependsOn 和 requires[type=hard] 中引用了相同的依赖 artifact 时，该依赖 ID 会在 hardDeps 数组中出现两次。

这会导致两个后果：

1. **inDegree 计数错误**：构造器中遍历 hardDeps 为每个依赖递增入度，重复条目使入度被多计。例如 dependsOn: ["a"] + requires: [{ artifact: "a", type: "hard" }] 会使入度从正确的 1 变为 2。

2. **getBuildOrder() 假循环检测**：Kahn BFS 算法基于入度表运行，入度被多计的节点永远无法达到 0，导致算法误判为"检测到循环依赖"，尽管实际依赖图中不存在循环。

getNextArtifacts() 和 getBlocked() 不受此影响，因为它们直接调用 collectHardDeps() 做逐项检查而非使用入度表。

**影响代码**：
- graph.ts 第 62-81 行 collectHardDeps()：返回值未去重
- graph.ts 第 40-55 行构造器：遍历 hardDeps 增计入度
- graph.ts 第 88-129 行 getBuildOrder()：使用被污染的入度表做拓扑排序

**修复建议**：在 collectHardDeps() 返回前对 hardDeps 做去重，如 return [...new Set(hardDeps)]。

### 处理记录
| 时间 | 操作者 | 说明 | Commit |
|------|--------|------|--------|
| 2026-06-25 22:15 | code-worker | 在 collectHardDeps() 返回前添加 `[...new Set(hardDeps)]` 去重 | - |

### 验收记录
| 时间 | 验收人 | 结论 | 备注 |
|------|--------|------|------|
| 2026-06-25 22:30 | review-worker | ✅ 通过 | graph.ts:81 已添加去重；构造器使用去重后结果计算 inDegree；getBuildOrder() 不再受重复依赖影响 |

---

## REV-02: Schema 验证未检查 artifact ID 唯一性
- **状态**：closed
- **优先级**：medium
- **提出人**：ReviewWorker
- **提出时间**：2026-06-25 22:10

### 问题描述

src/core/schema.ts 中 SchemaSchema 使用 z.array(ArtifactSchema) 定义 artifacts 列表，但未添加 ID 唯一性约束。若用户定义的 Schema YAML 中包含重复的 id 值，Zod 验证会通过，但 ArtifactGraph 构造器中的 Map.set() 会静默覆盖先前的定义，造成数据丢失且无任何错误提示。

虽然这是用户输入错误，但作为 Schema 引擎的核心入口，应在验证阶段尽早捕获此问题。

**影响代码**：
- schema.ts 第 31-36 行 SchemaSchema：缺少 .refine() 做唯一性检查
- graph.ts 第 35 行：this.artifacts.set(artifact.id, artifact) 静默覆盖

**修复建议**：在 SchemaSchema 上添加 .superRefine() 检查 artifacts 数组中 id 是否唯一。

### 处理记录
| 时间 | 操作者 | 说明 | Commit |
|------|--------|------|--------|
| 2026-06-25 22:15 | code-worker | 在 SchemaSchema 上添加 .superRefine() 检查 artifacts 数组 ID 唯一性，重复时给出明确错误信息；同时 export SchemaSchema 供测试使用 | - |

### 验收记录
| 时间 | 验收人 | 结论 | 备注 |
|------|--------|------|------|
| 2026-06-25 22:30 | review-worker | ✅ 通过 | schema.ts:36-51 已添加 `.superRefine()` 用 Set 检查唯一性；SchemaSchema 已 export；graph.test.ts:173-188 新增重复 ID 校验测试通过 |

---

## 审查摘要

| 项目 | 详情 |
|------|------|
| 审查阶段 | stage-02：核心 Schema 引擎 |
| 审查文件 | 11 个（6 源码 + 1 YAML + 1 测试 + 2 配置 + 1 索引） |
| 发现问题 | 2 个（high: 1, medium: 1） |
| 测试结果 | 75/75 通过（含新增 10 个 graph 测试） |

### 正面评价

- **类型安全**：全部使用 Zod z.infer 推导类型，无 any 滥用
- **核心算法**：Kahn 拓扑排序实现正确，循环检测逻辑准确
- **软硬依赖分离**：requires[type=soft] 不影响拓扑排序和就绪判断，设计合理
- **测试覆盖**：10 个测试覆盖拓扑排序、循环检测、就绪判断、阻塞状态、空 Schema、软硬依赖、不存在依赖、重复 ID 校验等场景
- **注释规范**：中文注释完整覆盖类、方法、关键逻辑分支
- **ESM 规范**：导入路径使用 .js 扩展名，符合 NodeNext 模块解析

### 低优先级风格建议（非阻塞）

1. graph.ts 第 179 行 _buildOrder 字段声明在方法之后，建议移至类顶部字段区域
2. graph.ts 总计 234 行，略超 200 行建议阈值；考虑到单一职责（ArtifactGraph 类），暂不建议拆分
3. graph.test.ts 第 106 行测试用例名称为英文，建议统一为中文

### 总体结论

**✅ 复审通过** — REV-01（去重）和 REV-02（唯一性校验）均验收通过，新增 1 个重复 ID 校验测试，构建与 75 个测试全部通过。

---

## 复审记录

| 轮次 | 时间 | 审查人 | 结论 |
|------|------|--------|------|
| 初审 | 2026-06-25 22:10 | review-worker | review_failed（2 个问题） |
| 复审 | 2026-06-25 22:30 | review-worker | review_passed（2 个问题均已修复验收） |
