# 知识库索引

> 项目知识库总索引，按分类组织。Agent 加载 `check-kb` 技能时自动读取本文件。

## 分类概览

| 分类 | 文件 | 条目数 | 最近更新 | 用途 |
|------|------|:--:|------|------|
| 架构决策 | [architecture.md](architecture.md) | 4 | 2026-07-01 | 技术选型、设计理由、并行策略 |
| 代码模式 | [patterns.md](patterns.md) | 7 | 2026-07-01 | 项目约定、最佳实践、反模式 |
| 排查经验 | [troubleshooting.md](troubleshooting.md) | 5 | 2026-07-01 | 常见 Bug、调试流程、已知坑位 |
| 环境配置 | [setup.md](setup.md) | 3 | 2026-07-01 | 环境搭建、构建流程、依赖管理 |

## 各分类摘要

### architecture.md

| 条目 | 日期 | 摘要 |
|------|------|------|
| Worktree 并行批次策略 | 2026-06-27 | 按文件集冲突域划分并行安全组，三批次推进 |
| 模型配置三级体系 | 2026-06-27 | default/agents/roles 级联覆盖，Awareness 目的 |
| test_enabled 跳过测试链路 | 2026-06-27 | review_passed 直接转 done |
| Flow CLI 严格校验 | 2026-06-28 | 非法 phase 拒绝推进，--force 跳跃，--verbose 可视化 |

### patterns.md

| 条目 | 日期 | 摘要 |
|------|------|------|
| Phase Zod enum 硬化 | 2026-06-27 | 动态 string → Zod enum，fuzzyCorrect 模糊修正 |
| ValidationResult errors/warnings 分离 | 2026-06-27 | valid 仅基于 errors，warnings 不影响有效性 |
| autoFixReview 前置条件校验 | 2026-06-27 | 快捷方法须自行校验 phase + opId + 使用正规路径 |
| dry-run 真值处理 | 2026-06-27 | 全部分支正确返回 fixed，命令层不误报 |
| 文档路径绝对路径规范 | 2026-06-28 | "项目根目录下的 docs/phase-{N}/" 绝对路径格式 |
| Schemer op 级依赖声明 | 2026-06-28 | 自动生成 deps.yaml，hard/soft/mutual_exclusion |
| 知识库搜索增强 | 2026-06-28 | --limit/--offset 参数，正文匹配 |

### troubleshooting.md

| 条目 | 日期 | 摘要 |
|------|------|------|
| fuzzyCorrectPhase 正则尾部下划线 | 2026-06-27 | replace 后在末尾产生 `_`，需去首尾下划线 |
| 僵尸检测 filter 失效 | 2026-06-27 | startsWith(stageId) 与模块目录组织不匹配 |
| repair dry-run 误报 | 2026-06-27 | 文件不存在时返回 fixed=true，正常时 exit(1) |
| Schemer 产出路径不匹配 | 2026-06-27 | stages/ vs plan/ 路径不一致 |
| architect 审查模板未同步 | 2026-06-27 | Reviewer↔Tester 闭环在 Architect 审查场景下断裂 |

### setup.md

| 条目 | 日期 | 摘要 |
|------|------|------|
| 部署模板复用 | 2026-06-27 | models.template.yaml 一键配置 |
| npm 超时与网络预检 | 2026-06-27 | 60s 超时 + 5 种包管理器支持 |
| 构建与测试 | 2026-06-28 | npm install + npm test，225/227 通过 |

## 最近更新

| 日期 | 操作 | 描述 |
|------|------|------|
| 2026-07-01 | 归档 | v3.0 / v3.1 / v3.2 全系列归档，知识沉淀到四个分类 |
| 2026-07-01 | 初始化 | 首次创建知识库分类文件，提取 v3 系列 19 条经验 |
