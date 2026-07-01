# 计划变更日志

| 时间 | 操作者 | 变更描述 |
|------|--------|----------|
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
