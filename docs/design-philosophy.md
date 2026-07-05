# OpenFeel 开发思路

> 从 v1.0 到 v4.1 的设计决策演变记录。不是"怎么做"，而是"为什么这么做"。

## 一、这个项目解决什么问题

AI 编程 Agent 的瓶颈不在单次代码生成质量，而在**多步骤协作**。一个复杂任务需要"理解需求→制定计划→编写代码→审查→测试→归档"，单 Agent 从头做到尾会丢上下文、重复犯错、无法交叉验证。

OpenFeel 的核心命题是：**让多个特化 Agent 在流水线中接力**，每个只做自己最擅长的事，通过状态机衔接。

这不是一个"代码生成工具"，而是一个**开发流程治理框架**。

## 二、核心理念

### 2.1 模型分工

不同任务需要不同大脑：

```
推理模型 (deepseek-v4-pro)   → Feel、Planner、Schemer、Reviewer、Tester、Archiver
快速模型 (deepseek-v4-flash) → Executor、事务官
异种模型 (待引入)            → Reviewer（交叉审查去盲区）
```

**实战验证**：v4.0 全流程中，Executor 的快速模型承担了 70% 以上的文件操作和编码任务，推理模型只在决策节点介入。模型分工将昂贵的推理 Token 开销集中在关键环节。

### 2.2 减法优先

v3.0 有 15 个 Agent，v4.0 砍到 7 个。不是越多越好：

| 砍掉的 | 原因 |
|:--|:--|
| auto-runner | Feel 直接读 flow.json 调度，不需要中间层 |
| code-worker / review-worker | 与主 Agent 职责重叠，合并后路径更短 |
| ask | Feel 自行回答简单问题 |
| debug / test-writer | Executor 自测 + Tester 正式测试已覆盖 |
| architect | Reviewer 统一审查所有层级 |

**教训**：多 Agent 不是目的，清晰的职责边界才是。每增加一个 Agent，就多一层调度开销和一个可能出错的地方。

### 2.3 状态外化

Agent 不应该靠"记住"来维持上下文。所有状态落在文件上：

```
flow.json   → 流水线位置（当前阶段、phase）
status.md   → 阶段进度（任务 checkbox、阻塞原因）
kb/         → 长期知识（架构决策、代码模式、排查经验）
```

**关键决策**：v4.0 将 status.md 的读写从"手工 edit"改为 CLI 原子操作（`openfeel stage set/task`），消除了格式匹配脆弱导致的编辑失败。

### 2.4 Feel 作为调度中心

Feel 不是"最聪明的 Agent"，而是**上下文最完整的 Agent**。它不写代码，只做三件事：
1. 读 flow.json 知道当前在哪
2. 判断该调谁
3. 检查结果决定下一步

Planner 职责由 Feel 兼任——计划与实际调度高度耦合，分开反而增加信息传递损耗。

## 三、关键架构决策

### 3.1 两层模板体系

`openfeel update` 部署的 Agent/Skill/core.md 来自源码中硬编码的模板（`src/core/templates.ts`、`src/core/update.ts`），而非读取项目文件系统。

**设计理由**：部署到用户项目的是"发布版"适配层，不应受当前开发分支的修改影响。但代价是源文件修改后必须手动同步模板。

**v4.1 改进**：构建脚本自动从源文件生成模板，消除手动同步遗漏。

### 3.2 PipelinePhase 枚举

```
plan_pending → plan_review → plan_passed 
→ scheme_pending → scheme_review → scheme_passed
→ exec_running → review_pending → review_failed → review_passed
→ test_pending → test_failed → test_passed
→ archiving → done
```

15 个 phase 覆盖完整生命周期。v3.0 从动态 string 硬化为 Zod enum，v4.0 加入 REV blocking 机制允许非阻塞审查条目不中断流水线。

### 3.3 三层计划体系

```
分期大纲 (roadmap/v1.0.md)     → 版本级目标
工作阶段 (stages/stage-01/)    → 可独立交付的单元
操作方案 (ops/op-001.md)       → Executor 直接执行的清单
```

每一层向下细化，Executor 收到的指令不应包含任何需要"判断"的内容——这就是 Schemer 存在的价值。

### 3.4 公共域与私域分离

```
.openfeel/           → 公共域（纳入 git）：计划、知识库、审查摘要
.openfeel/users/     → 私域（gitignore）：个人日志、笔记、开发状态
```

**设计理由**：团队共享知识 vs 个人操作痕迹，从一开始就分开，避免 git 冲突和隐私泄露。

## 四、实战教训

### 4.1 命名断链

**现象**：Schemer 产出文件名 `op-001_删除9个旧Agent.md`，Feel 拼接路径 `op-001.md`，找不到文件。Executor 跳步不读方案，直接复制部署参考完事。

**根因**：三个 Agent 各用各的命名约定，没有统一的映射。

**修复**：Schemer 文件名规范为 `op-NNN.md`（仅编号），deps.yaml 增加 `file` 字段。

### 4.2 不要提前优化

**现象**：担心"频繁调用子 Agent 会破坏 KV Cache"，讨论子 Agent 返回精简模式。

**实测数据**：v4.0 全流程 cache 命中率 95.5%。系统提示词占总输入 95%，始终命中缓存。子 Agent 返回的对话增量占比极小。

**教训**：技术决策优先基于实测数据而非推测。凭直觉的"优化"往往对着空气挥拳。

### 4.3 模板必须自动同步

**现象**：修改 core.md（424→342 行）后，`openfeel update` 部署的仍是旧版。因为模板是手写的 Base64 字符串，源文件改动不会自动传播。

**修复**：`src/core/templates.ts` 更新模板 + 写入 `dev_core.md` 约束。v4.1 计划构建脚本自动生成。

### 4.4 约束要说清楚能做什么，不能含糊

v4 实战中 Feel 频繁直接用 bash 做 git rm、文件复制等操作——因为走 Executor 太重。但 AGENTS.md 说"Feel 不直接修改源码"，边界模糊。

**v4.1 方案**：feel.md 明确直接操作白名单，同时新增事务官处理辅助杂活。

## 五、设计原则

| 原则 | 体现 |
|:--|:--|
| **数据优先于直觉** | cache 命中率实测 95.5%，不凭猜测优化 |
| **减法优先于加法** | 15→7 Agent，先砍再优 |
| **外化优先于记忆** | 状态落文件，不靠上下文窗口 |
| **原子操作优先于手工编辑** | CLI 管 status.md，不再 edit 匹配 |
| **大框架扩展，细节简洁** | 管道可插拔，但单个模块不超一层抽象 |
| **Agent 特化，不通用** | 每个 Agent 只做一件事，边界清晰 |

## 六、版本演变

| 版本 | 主题 | 核心变化 |
|:--|:--|:--|
| v1.0 | 搭建骨架 | CLI + flow.json + 6 Agent 链 |
| v2.0 | 架构统一 | 公共/私域分离、适配器模式 |
| v3.0 | 生产加固 | Phase 硬化、模型配置、效率优化 |
| v4.0 | 精简增强 | 15→7 Agent、审查体系、CLI 管理、12 项改进 |
| v4.1 | 构建稳健性 | 模板自动同步、Agent 特化、事务官 |
