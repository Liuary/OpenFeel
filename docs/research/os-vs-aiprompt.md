# OpenSpec vs AI_Prompt：对比分析

> 撰写时间：2026-06-18
> 核心参考来源：AI_Prompt 项目源码与 .ai/ 工作区、OpenSpec v1.4.1 源码与文档

## 一、两个项目的定位

| 维度 | AI_Prompt | OpenSpec |
|------|-----------|----------|
| **是什么** | 跨 AI 工具的 Agent 开发治理框架 | AI 原生的规范驱动开发系统 |
| **解决什么问题** | 多个 AI Agent 在同一项目中如何不互相踩脚、保持一致、持久记忆 | 人类与 AI 在编码前如何就「要构建什么」达成一致 |
| **类比** | 软件工程中的 SDLC 流程管理（谁能做什么、怎么做、如何协作） | 软件工程中的需求规格系统（要构建什么、为何构建、如何分解） |
| **发布形态** | 模板仓库（deploy.py 部署到目标项目） | npm 包（openspec init 初始化到目标项目） |
| **工具覆盖** | 6 个 AI 工具适配器 | 30+ AI 工具适配器 |

AI_Prompt 处于「元层」：管理 AI Agent 本身的行为规范和工作方法。
OpenSpec 处于「应用层」：管理 AI Agent 开发软件时的需求-设计-任务流程。
两者互补——理想项目可同时使用两者：AI_Prompt 约束 Agent 怎么做，OpenSpec 告诉 Agent 做什么。

## 二、设计理念对比

### AI_Prompt 核心理念

| 原则 | 含义 |
|------|------|
| 约束优先于赋能 | 新能力是为了更高效地找到约束并遵守 |
| 文件系统是 single source of truth | 所有缓存层均可从 Markdown 文件重建 |
| 人工控制点不丢失 | 默认 manual 模式；自动闭环需用户明确开启 |
| 声明式优于程序式 | 一切配置以 YAML/Markdown 驱动 |
| 发现者与修复者分离 | Architect 提交审查问题但不得自行修复 |
| 公共域与私域分离 | 共享内容纳入版本管理，个人操作状态保持隔离 |

### OpenSpec 核心理念

| 原则 | 含义 |
|------|------|
| 流动而非僵化 | 无阶段门禁——依赖是赋能而非约束 |
| 迭代而非瀑布 | 在构建中学习，在行进中细化 |
| 简单而非复杂 | 几秒初始化，最小仪式感，渐进式严谨性 |
| 棕地优先 | 增量规范（ADDED/MODIFIED/REMOVED/RENAMED）是核心创新 |
| 行动而非阶段 | 随时创建、实施、更新或归档 |
| CLI 即 Agent API | openspec status --json 是 AI Agent 的机器可读入口 |

### 理念差异的本质

| 维度 | AI_Prompt | OpenSpec |
|------|-----------|----------|
| 对 AI 的定位 | AI 是需要严格管理的协作者（约束、审查、权限控制） | AI 是需要明确输入的协作者（规范、工件、指令） |
| 信任模型 | 不信任（审查点→验收→归档，层层把关） | 信任但有验证（AI 自己读指令、读状态、写工件） |
| 复杂度策略 | 结构化管理复杂度（分层、分区、分角色） | 简化复杂度（最小仪式感、渐进式严谨性） |
| 失败处理 | 状态机回退 + 暂停转人工（防御性） | 迭代细化 + 变更重做（适应性） |
| 团队规模感 | 隐含多人协作场景（冲突检测、进度同步、任务归属） | 隐含单人或人-AI 对（每个变更独立） |

## 三、Agent 角色 vs 工作流角色

| | AI_Prompt | OpenSpec |
|---|---|---|
| 角色定义 | 9 个 Agent（Architect/Code/AutoRunner/CodeWorker/ReviewWorker/TestWriter/Tester/Debug/Ask），每个有明确权限和调用链路 | 无 Agent 角色概念——依赖 AI 工具自身的 Agent 能力 |
| 分工边界 | 文件级权限控制（Architect 只读源码，CodeWorker 全域写） | 工件级职责（proposal 写 proposal.md，tasks 写 tasks.md） |
| 协作模式 | 人工/自动双轨 + 状态机驱动的 Agent 调度 | 人与 AI 通过 slash command 交互，AI 通过 CLI 获取指令 |
| 角色耦合 | Agent 间强耦合：Architect→AutoRunner→CodeWorker→ReviewWorker | Agent 间无耦合：每个 slash command 独立启动 AI Agent |

## 四、状态机 vs 依赖图

| | AI_Prompt | OpenSpec |
|---|---|---|
| 核心模型 | 13 状态线性流转 + 分支/回退 | DAG——proposal → specs/design → tasks |
| 状态检查 | 读取 status.md 文件 | CLI 检查文件系统存在性 |
| 推进方式 | 手动（用户触发）+ 自动（AutoRunner 闭环） | AI Agent 读取指令后自主推进 |
| 阻塞处理 | paused 状态 + 责任转交 user | BLOCKED 状态（依赖未满足） |
| 并行设计 | deps.yaml 声明阶段依赖，无依赖阶段可并行 worktree | 工件 graph 声明依赖，无依赖工件可并行创建 |

## 五、知识管理 vs 规范管理

| | AI_Prompt | OpenSpec |
|---|---|---|
| 存储内容 | 架构决策、代码模式、排查经验、环境配置 | 功能需求（SHALL/MUST）、场景（Given/When/Then）、技术设计 |
| 存储格式 | Markdown + Wikilink + 向量索引 | Markdown + YAML 元数据 + JSON |
| 检索方式 | 精确匹配→语义搜索回退 + 图谱遍历 | CLI 查询（openspec status + openspec instructions） |
| 更新机制 | 经验暂存→用户确认→自动归档 | 增量规范→归档合并 |
| 生命周期 | 持续积累（跨会话记忆） | 按变更生命周期（完成后归档） |

## 六、AI_Prompt 的独特优势

1. **Agent 角色体系**：9 个精心定义的 Agent，每个有明确权限和责任边界。OpenSpec 无 Agent 角色概念。
2. **状态机驱动**：13 状态 + 自动闭环 + 暂停/恢复机制。OpenSpec 只有 BLOCKED/READY/DONE。
3. **审查与 Bug 双链路**：REV 审查和 BUG 追踪的完整生命周期。OpenSpec 通过 verify 命令提供验证，但无正式审查/Bug 流程。
4. **知识库自动积累**：经验暂存→用户确认→自动归档闭环。OpenSpec 只存功能规范，不存开发经验。
5. **多人协作支持**：任务归属（current.md）、冲突检测（🔒 锁定）、进度同步（sync-status skill）。OpenSpec 聚焦单变更流程，无团队协作机制。
6. **约束 DSL**：结构化规则编译与校验，超越自然语言。OpenSpec 的约束通过 schema 验证，更偏数据格式。

## 七、OpenSpec 的独特优势

1. **增量规范模型**：ADDED/MODIFIED/REMOVED/RENAMED 使变更可追踪、可合并。AI_Prompt 缺乏细粒度增量跟踪。
2. **30+ 工具适配器**：远超 AI_Prompt 的 6 个，且维护活跃。
3. **工件依赖图**：proposal→specs/design→tasks 的 DAG 清晰解耦「为什么-什么-如何-怎么做」。
4. **CLI 即 Agent API**：openspec status --json 是机器可读标准化接口。AI_Prompt 的 Agent 主要通过读取 Markdown 文件获取指令。
5. **渐进式严谨性**：区分「何时需要完整规范」vs「何时精简就好」。AI_Prompt 约束体系全局均等。
6. **配置化工作流**：profile（core/custom）+ delivery（skills/commands）的分层配置。AI_Prompt 的 auto/manual 粒度较粗。
7. **npm 包分发**：标准化安装和升级。AI_Prompt 通过 deploy.py 复制文件，版本追踪较弱。
8. **社区基础**：npm 月度下载、Discord、GitHub Stars。AI_Prompt 目前为个人/小团队项目。

## 八、总结论

| 问题 | AI_Prompt 的回答 | OpenSpec 的回答 |
|------|-----------------|-----------------|
| AI 应该怎么做？ | 遵守约束、按角色分工、走状态机流程 | 收到规范后自行执行 |
| 怎么保证 AI 做好？ | 层层审查 + 验收 + 归档 | 规范作为契约，增量作为变更证明 |
| 怎么记住经验？ | 自动写入知识库 + 跨会话记忆 | 规范仓库存功能决策，变更历史存设计决策 |
| 怎么多人协作？ | 任务归属 + 冲突检测 + 进度同步 | 每个变更独立，workspace（beta）跨仓库协调 |
| 怎么适配多工具？ | 适配器层翻译为各工具原生格式 | CLI + 生成的技能文件适配各工具约定 |

两个项目共同勾勒出「AI 辅助软件工程」的完整图景：
- **治理层**（AI_Prompt）确保 AI Agent 是可控的、可审查的、可协作的、有记忆的。
- **规范层**（OpenSpec）确保 AI Agent 的输出是有据的、可追踪的、可迭代的、可归档的。

两者结合，才构成从「模糊需求」到「高质量代码」的完整可信链路。

关键差异类比：AI_Prompt ≈ ESLint + CI/CD Pipeline + Code Review Process + Wiki（控制怎么做）；OpenSpec ≈ PRD + Tech Design + Task Board + Changelog（控制做什么）。
