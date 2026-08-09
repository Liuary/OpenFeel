# 计划变更日志

| 时间 | 操作者 | 变更描述 |
|------|--------|----------|
| 2026-08-09 | Archiver | **归档**：v1.0.0-stage-30 归档完成。Pantheogen 兼容性 Bug 修复 3 项（flow-manager load() 类型守卫 + 正则兼容非粗体 + stage create 子命令），4 文件变更，399/399 测试通过，1 non-blocking REV，知识沉淀 3 条至 patterns(2) + troubleshooting(1)。 |
| 2026-08-09 | Planner | **新建**：v1.0.0-stage-30 计划制定（Pantheogen 兼容性 Bug 修复）。3 项 op：flow-manager load() ops 类型守卫 + repair() ops 修复 / stage setStatusField 正则兼容非粗体 / stage create 子命令。3 文件变更，小规模。 |
| 2026-08-07 | Archiver | **归档**：v1.0.0 正式版三阶段全部归档完成（stage-01 质量加固 + stage-02 发布工程 + stage-03 文档完善），28 阶段全部闭环。知识沉淀 2 条至 patterns(1) + setup(1)。正式版发布就绪。 |
| 2026-08-07 | Executor | **op-003 版本号统一**：flow.json 25 个 stageId 从 v0.x.x 体系重映射为 v1.0.0-stage-04 ~ v1.0.0-stage-28（v0.4.2→04 起按 flow.json 顺序编号，经 Feel 确认锚点1 为准），同步更新 plan/index.md 对照表、kb/index.md、dev/current.md。v1.0.0-stage-01/02/03 为 v1.0.0 新阶段保留不变。 |
| 2026-08-07 | Planner | **v1.0 发布计划制定**：3 阶段 6 项任务。stage-01（质量加固：lint 全量 + 测试覆盖率，2 项）→ stage-02（发布工程：版本统一 + npm 准备 + CI/CD，3 项）→ stage-03（文档完善：CHANGELOG + 入门指南，1 项）。s01 无依赖先行，s02 hard 依赖 s01，s03 hard 依赖 s01 + soft 依赖 s02。功能冻结定位，无核心代码变更。 |
| 2026-08-07 | Archiver | **归档**：v5.7-stage-01 归档完成。计划目录按大版本分组重构（v4/v5/系列收纳 + 系列索引+顶层指针）+ reasoning_effort 调整（Planner/Schemer→max, Executor/Vision→medium），中英双语 12 文件同步。自测五维全通过。知识沉淀 2 条至 architecture(1) + patterns(1，更新)。v5 全系列 7 期 16 项任务全部闭环。 |
| 2026-08-07 | Archiver | **归档**：v5.2-stage-01 归档完成。规范迁移（dev_core.md→core.md）+ Handoff 委派原语（feel.md 委派机制 + 4 Agent Handoff 声明），15 文件双语同步，npm test 无回归。知识沉淀 2 条至 patterns（Handoff 委派、约束迁移）。v5 路线图进度 3/5 期。 |
| 2026-07-14 | Planner | **v4.4 正式计划制定**：3 阶段 14 项任务。stage-01（i18n 基建 + CLI 国际化，6 项）→ 构建时内联 i18n 机制 + 全局语言配置 + 首次使用检测 + 命令输出国际化。stage-02（日志修复 + 流水线安全，5 项）→ REV 闭环 + git commit + 日志强制落档 + 日志体系三处断裂修复。stage-03（配置优化 + 提示词完善，3 项）→ config 命令 + 项目语言映射 + update AGENTS.md 同步 + package.json 模板规范化。s01 与 s02 并行无 hard 依赖，s03 hard 依赖 s01。~20 文件变更，走完整流水线。 |
| 2026-07-12 | Archiver | **归档**：v4.3 全系列归档完成。v4.3-stage-03（英文内容产出 + 双语交互）8 项 op 全部落地（英文 Agent 模板 8 个 + AGENTS.md/code-instructions 英文版 + init 双语选择 + lang 配置存储 + update --lang 参数 + README 双语化 + 测试覆盖），审查 5 条 REV（2 blocking resolved）。知识沉淀 4 条至 kb/（architecture 1 + patterns 3）。v4.3 三阶段累计 17 项 op、21 条 REV 全部闭环，多语言模板管线正式落成。 |
| 2026-07-12 | Archiver | **归档**：v4.3-stage-01（模板文件化重构 + 纪律强化，8 op / 13 REV / 3 非阻塞）和 v4.3-stage-02（REV-004 修复 project.ts，1 op / 5 REV closed）归档完成。知识沉淀 3 条至 patterns。v4.3 进度 2/3。 |
| 2026-07-09 | Planner | **v4.3 计划创建**：3 阶段 15 项任务。Part A 审计遗留修复（日志纪律/自测报告/REV-004）+ Part B 中英双语支持（模板文件化重构 + 8 英文 Agent 模板 + init/update 双语交互 + README 双语化）。~33 文件变更，走完整流水线。 |
| 2026-07-08 | Planner | **v4.2 计划评估：不建议实施**。创建 architecture-index 提案可行性分析，结论为当前项目规模（38 TS 文件）下索引维护成本超过收益。推荐替代方案：增强 kb/index.md 的项目概览能力（零新增文件，5 分钟工作量）。条件性实施计划已就位，待用户决策。 |
| 2026-07-05 | Liuary | **v4.1 计划扩展为双阶段**：新增 v4.1-stage-02（Agent 特化 + Utility Agent）。v4.1 从单阶段模板同步升级为「构建稳健性 + Agent 深化」双阶段计划。stage-01 细化到 8 项子任务，stage-02 覆盖 7 个 Agent 扩充 + 新增 Utility Agent + 配套目录调整共 11 项。两阶段为 soft 依赖可并行。 |
| 2026-07-01 | Liuary | **v4-stage-01 范围扩大**：11→20 项任务。15→7 Agent 全面对齐部署项目（feel/planner/schemer/executor/reviewer/feel-tester/archiver）。移除 9 个 Agent（新增 debug/test-writer/architect/code/tester），重写 4 个 + 精简 3 个 + 配套更新 3 个 + 后调 1 个。后续阶段（stage-02/03/04）概要同步调整。 |
| 2026-07-01 | Liuary | **v4.0 计划创建**：4 阶段 27 项任务。减法（移除 4 Agent + 精简 core.md）+ 加法（12 项改进建议按优先级分三批落地）。基于四期改进建议 suggestions.md 和工程改造需求。 |
| 2026-07-01 | Liuary | **归档**：v3.0 / v3.1 / v3.2 全系列归档。plan_index 移入历史计划，知识沉淀 19 条至 kb/（architecture 4、patterns 7、troubleshooting 5、setup 3），审查归档 4 阶段摘要至 code_review/ |
| 2026-06-28 | Liuary | v3.2 补丁完成：文档路径绝对路径化、flow status --verbose 可视化、Schemer 自动生成 deps.yaml。测试 225/227 通过。 |
| 2026-06-28 | Liuary | v3.1 补丁完成：文档写入路径规范、Flow CLI 严格校验(/--force)、Flow↔Stage 同步(/--stage)、知识库搜索增强(/--limit/--offset)。测试 225/227 通过。 |
| 2026-06-27 | Liuary | v3.0 四阶段全部实现完成：P0 鲁棒性 + 模型落地，P1 轻量修正 + health + 并行，P2 wizard + demo + 边界 + KB + 安全。测试 217/219 通过。 |
| 2026-06-27 | Liuary | v3.0 计划制定：4 阶段 21 项任务，基于二期 NumKit 测试审查驱动。P0 消缺 → P1 提效 → P2 体验，3 批次推进（batch-1 并行 stage-01/02） |
| 2026-06-24 | Liuary | v3 架构：流水线 Agent（Feel/Schemer/Executor/Reviewer/Tester/Archiver）+ flow.json + FlowManager + 模型分工（推理/快速/异种） |
| 2026-06-24 | Liuary | v2 架构：feel Agent 链 + 三层计划体系 |
| 2026-06-24 | Liuary | 全局替换 .openfeel/ → .openfeel/ 工作区命名 |
| 2026-06-27 | Liuary | v2.0 全阶段闭环完成：7/7 阶段 done，59 文件变更，217/219 测试通过 |
| 2026-06-27 | Liuary | v2.0 计划确认通过：7 阶段 28 项改进 |
| 2026-06-27 | Liuary | v2.0 计划第二轮更新：融入统一结构（.openfeel/→.openfeel/）、核心+适配器分层、交互式 CLI；总改进 28 项 7 阶段 |
| 2026-06-27 | Liuary | v2.0 计划更新：新增 stage-07 可扩展性重构（pipeline 数据化/config 通用化/指令参数化/CLI 自动发现），总改进项 25 |
| 2026-06-27 | Liuary | v2.0 计划起草（6 阶段 21 项改进），Agent 工具使用规范写入 dev_core.md |
| 2026-06-27 | Liuary | v1.0 计划归档至 v1/ 子目录；创建 v2/ 目录，启动二期计划制定 |
| 2026-06-27 | Liuary | 一期部署复盘完成：产出 deploy-review + blueprint-test-project 归档于 .openfeel/docs/ |
| 2026-06-24 | Liuary | 创建 OpenFeel v1.0 开发计划（9 阶段） |
