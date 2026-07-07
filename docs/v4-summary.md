# OpenFeel v4.0 + v4.1 改进总结

> 从"能用"到"好用"，两轮迭代的实战记录。

---

## 一、v4.0：减法先行

v4.0 的核心命题是 **精简**。v3.x 的 15 个 Agent 体系在实战中暴露出职责重叠、调度链过长的问题。

### 1.1 15→7 Agent

| 砍掉的 | 原因 |
|:--|:--|
| auto-runner | Feel 直接读 flow.json 调度，不需要中间层 |
| code-worker / review-worker | 与主 Agent 职责重叠 |
| ask | 简单问答 Feel 自行处理 |
| debug / test-writer | Executor 自测 + Tester 正式测试已覆盖 |
| architect | Reviewer 统一审查所有层级 |
| code / tester | 合并到 executor / feel-tester |

最终保留 7 个：总统领(Feel)、计划官(Planner)、方案官(Schemer)、执行官(Executor)、审查官(Reviewer)、测试官(Feel Tester)、归档官(Archiver)。

### 1.2 core.md 精简

从 424 行压缩到 342 行。去掉的内容：
- AutoRunner/worktree 自动闭环机制
- 冗长的状态枚举和级联优先级说明
- Worktree/Session 模板

替换为 Feel 调度 + flow.json PipelinePhase 推进模型。

### 1.3 12 项能力增强

来自四期改进建议，按优先级分 3 批落地：

| 优先级 | 改进 | 效果 |
|:--|:--|:--|
| 🔴 | KB 检索增强 Agent 决策 | 制定方案前自动加载知识库，知识从"只写"变"读写" |
| 🔴 | Executor 前置校验 | 编码前验证 op 完整性 + phase 合法性，不完整拒绝执行 |
| 🟡 | 模式一致性审查 | Reviewer 新增"内部模式一致性"维度 |
| 🟡 | 方案一致性回写 | 编码后自动比对方案 vs 实际产出 |
| 🟡 | REV blocking 标记 | 方案级问题标记为非阻塞，不中断流水线 |
| 🟡 | 流水线可视化 | `flow overview` 一次性展示全状态 |
| 🟢 | 6 项体验优化 | 耗时统计/快速通道/审计链/上下文恢复/性能指标/知识去重 |

### 1.4 CLI 原子化管理

status.md 的读写从"手动 edit"改为 CLI 命令（`openfeel stage status/set/task`），消除了格式匹配脆弱导致的编辑失败。与 flow.json 管理模式一致。

### 1.5 审查效果

SiteGen 实战测试验证了前置审查的价值：

| 审查层 | 发现 HIGH | 修复成本 |
|:--|:--|:--|
| plan_review | 4 | 改文档，分钟级 |
| scheme_review | 5 | 改方案，分钟级 |
| code_review | 0 | 如存在需改代码，小时级 |

**全部 9 个 HIGH 问题在编码前拦截，零上线问题。**

---

## 二、v4.1：完善补丁

v4.1 的驱动力来自两个源头：v4.0 开发中自己踩的坑，以及 SiteGen 9 阶段端到端测试的真实反馈。

### 2.1 构建自动同步（stage-01）

**问题**：`openfeel update` 部署的是硬编码在源码中的旧版模板，修改 core.md/Agent 不会自动同步。

**修复**：构建脚本自动从源文件生成模板（Base64 编码注入、Agent/Skill 定义提取），构建时校验一致性，不一致则 `exit(1)`。

### 2.2 Agent 特化（stage-02）

**问题**：Agent prompt 普遍只有 30-60 行，"能做什么不能做什么"的边界描述不足。实战暴露的问题：
- Feel 越界执行但不自知
- Executor 看到参考路径直接复制，跳步执行
- Schemer 回避困难决策推给 Executor

**修复**：7 个 Agent prompt 扩充到 80-120 行，明确写入：
- **直接操作白名单**：Feel 可以直接 bash 的 4 类操作
- **委托边界**：什么必须走 Executor、什么可派事务官、审查修复必须走流程
- **执行纪律**：Executor 第一步强制 read 方案、逐 checkbox 执行
- **决策纪律**：Schemer 不回避困难点、显式备选方案
- **唤起阈值**：Planner 的大/中/小规模判定标准

### 2.3 事务官（stage-02）

**问题**：git rm、文件复制、格式校验等小活，Feel 不想开销 Executor，又没人可派。

**新增**：事务官（Utility Agent），快速模型，bash+read+write。处理文件操作、格式转换、构建测试。与 Executor 明确分工：机械操作→事务官，编码判断→Executor。

最终 Agent 体系扩展到 8 个。

### 2.4 flow.json 多阶段状态机（stage-03）

**这是 SiteGen 实测暴露的最大瓶颈。**

**问题**：flow.json 的 `pipeline.phase` 是全局单值，无法表达"stage-03 编码时 stage-04 在计划"的并行状态。SiteGen 9 阶段开发中，Feel 手动编辑 flow.json 15+ 次，远超 CLI 使用次数。

**修复**：

```diff
- { "pipeline": { "phase": "exec_running" } }  // 全局唯一
+ {
+   "pipeline": { "phase": "active" },
+   "stages": {
+     "stage-03": { "phase": "exec_running" },
+     "stage-04": { "phase": "plan_pending" }
+   }
+ }
```

每个阶段独立 phase，PipelineMeta 降级为 active/paused/done 三个宏观状态。新增 `flow migrate` 命令自动转换旧格式。

### 2.5 Agent 去语言特化（stage-04）

**问题**：Agent 描述中硬编码了 `.ts`/`npm`/`vitest` 等工具名。框架不限于 TypeScript 项目。

**原则**：职责特化 ≠ 语言特化。Agent 只做"一类事情"但可以处理"多种项目"。

```diff
- 修改 .ts 源码          → 修改源码
- 运行 npm test          → 运行项目测试命令
- vitest 测试用例        → 测试框架测试用例
- @vitest/coverage-v8    → 测试覆盖率工具（例如在 Node.js 项目中常用 vitest）
```

### 2.6 信息落档

**问题**：改了文件但没建目录、执行完了没更新 status.md——会话外看不到痕迹。

**新增约束**：关键操作必须落文件，不可仅存于对话中。禁止"做完不记录"。

---

## 三、模型分工落地

v4.0 设计了模型分工但未落地——所有 Agent 实际跑在同一模型上。

v4.1 修复了 Agent frontmatter 的 model 字段（格式为 `provider/model-name`）：

| Agent | 模型 | 用途 |
|:--|:--|:--|
| Feel/Planner/Schemer/Tester/Archiver | deepseek-v4-pro | 默认推理 |
| Executor / 事务官 | deepseek-v4-flash | 快速执行 |
| Reviewer | zhipuai/glm-5.1 | 异种交叉审查 |

---

## 四、关键数据

| 指标 | v4.0 | v4.1 |
|:--|:--|:--|
| Agent 数量 | 7 | 8 |
| 测试通过 | 225/227 | 254/256 |
| 版本阶段数 | 4 | 4 |
| 任务总数 | 39 | 31 |
| SiteGen 验证 | — | 9阶段/534测试/84%覆盖 |

---

## 五、设计原则沉淀

| 原则 | 体现 |
|:--|:--|
| 减法优先于加法 | 15→7 Agent，先砍再优 |
| 数据优先于直觉 | cache 命中率实测 95.5%，不凭猜测优化 |
| 外化优先于记忆 | 状态落文件，不靠上下文窗口 |
| 原子操作优先于手工编辑 | CLI 管 status.md/flow.json |
| 职责特化 ≠ 语言特化 | Agent 只做一类事，不做一种语言 |
| 信息落档优先于口头汇报 | 做完必须记录，不可"只说不写" |
