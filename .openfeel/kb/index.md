# 知识库索引

> 项目知识库总索引，按分类组织。Agent 加载 `check-kb` 技能时自动读取本文件。

## 项目快速概览

| 维度 | 内容 |
|------|------|
| 定位 | AI Agent 开发流程治理 CLI 工具 |
| 语言 | TypeScript (Node.js ≥20) |
| 核心依赖 | Commander, Zod, YAML, fast-glob |
| 源文件 | 45 个 .ts 文件（src/） |
| Agent 数 | 9 个（feel/planner/schemer/executor/reviewer/tester/archiver/事务官/vision） |
| 模块入口 | src/index.ts → src/cli/index.ts |
| 关键目录 | src/core/（流水线核心）、src/commands/（CLI 命令）、.opencode/agents/（Agent 定义） |
| 最近更新 | 2026-08-07（v4.6 Vision Agent 落地） |

## 分类概览

| 分类 | 文件 | 条目数 | 最近更新 | 用途 |
|------|------|:--:|------|------|
| 架构决策 | [architecture.md](architecture.md) | 11 | 2026-08-07 | 技术选型、设计理由、并行策略、多语言模板管线、i18n基建、日志聚合、Vision视觉官 |
| 代码模式 | [patterns.md](patterns.md) | 27 | 2026-07-15 | 项目约定、最佳实践、反模式 |
| 排查经验 | [troubleshooting.md](troubleshooting.md) | 9 | 2026-07-09 | 常见 Bug、调试流程、已知坑位 |
| 环境配置 | [setup.md](setup.md) | 4 | 2026-07-06 | 环境搭建、构建流程、依赖管理、Agent 模型配置 |

## 各分类摘要

### architecture.md

| 条目 | 日期 | 摘要 |
|------|------|------|
| Worktree 并行批次策略 | 2026-06-27 | 按文件集冲突域划分并行安全组，三批次推进 |
| 模型配置三级体系 | 2026-06-27 | default/agents/roles 级联覆盖，Awareness 目的 |
| test_enabled 跳过测试链路 | 2026-06-27 | review_passed 直接转 done |
| Flow CLI 严格校验 | 2026-06-28 | 非法 phase 拒绝推进，--force 跳跃，--verbose 可视化 |
| 15→7 Agent 精简体系 | 2026-07-05 | 删除/合并/替代/划归 四类操作，7 Agent 职责边界 |
| Feel 调度 + CLI 推进模型 | 2026-07-05 | 废弃自动闭环，Feel 总统领通过 openfeel flow 推进 |
| 知识库自动化体系 | 2026-07-05 | 检索→去重→沉淀 三环闭环，check-kb 自包含语义检索 |
| 多语言模板数据管线 | 2026-07-12 | templates-data 源文件→build.js 构建时内联→template-loader 运行时按语言加载 |
| i18n 基础设施：TS常量导入+运行时查表 | 2026-07-14 | 不同于 template-loader 构建管线，i18n 采用 TS 常量直接导入的轻量方案，零构建脚本，与 template-loader 互补覆盖运行时输出+部署内容 |
| 公域日志批量聚合策略 | 2026-07-14 | advance_stage_phase 改为 endStage 时汇总里程碑，消除 85%+ 噪音 |
| 8→9 Agent 体系扩展：Vision 视觉官 | 2026-08-07 | v4.6 新增 Vision 视觉官（通用视觉分析），qwen-vl-plus 多模态模型，不参与流水线调度，按需被 Feel 和其他 Agent 调用 |

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
| op 文件命名规范 | 2026-07-02 | op-NNN.md 仅编号，中文标题入内部 # 行 |
| Executor 强制第一步读方案 | 2026-07-02 | prompt 硬化"read 方案文件完整内容" |
| deps.yaml 声明实际文件名 | 2026-07-02 | file 字段桥接命名断链，Feel 调度前 glob 校验 |
| KB 检索注入 Agent 模式 | 2026-07-05 | planner/schemer/executor 同位置对称注入 check-kb |
| Executor 前置校验三步模式 | 2026-07-05 | 方案完整性→Phase 合法性→操作合法性，双路兜底 |
| REV blocking 标记模式 | 2026-07-05 | 审查条目 blocking 字段区分阻塞/非阻塞，数据结构硬化 |
| CLI 原子管理模式 | 2026-07-05 | Agent 通过 CLI 命令操作数据文件，不直接 edit |
| 审查五维度体系 | 2026-07-05 | 正确性/规范性/安全性/完整性/一致性，一致性分内外子维度 |
| 跨平台行尾归一化模式 | 2026-07-12 | 构建管线中 CRLF→LF 归一化，防止 Base64 往返跨平台差异 |
| 统一门控 + 整节替换模式 | 2026-07-12 | 多输出共享同一条件时统一门控整节替换，优于逐条标注 |
| API 回退逻辑中的错误信息准确性 | 2026-07-12 | 回退后的错误信息应报告实际使用的值，含死代码清理 |
| 构建脚本多语言循环生成模式 | 2026-07-12 | 语言数组+循环遍历替代逐语言展开，新增语言零代码变更 |
| 双语 CLI 交互模式 | 2026-07-12 | init 选择→.info.json 持久化→update 读取，init 立即生效 |
| 向后兼容可选配置字段模式 | 2026-07-12 | 只读访问器+??默认值+不强制写入，兼容已有部署项目 |
| CLI 国际化封装模式 | 2026-07-14 | t() 函数 + {domain}.{module}.{name} 键命名 + {var} 模板插值，12 个功能域覆盖 |
| 语言配置三级回退链 | 2026-07-14 | getCliLang 实现用户级全局→项目级.info.json→默认zh-CN 的三级优先级解析 |
| REV 闭环双路兜底+--force不可绕过 | 2026-07-14 | flow-manager+命令层两层校验，--force 仅降级警告仍拒绝推进，流水线安全无后门 |
| 流水线节点触发日志骨架模式 | 2026-07-14 | 关键 phase 推进时自动创建私域日志骨架文件，Agent 仅需填充 |

### troubleshooting.md

| 条目 | 日期 | 摘要 |
|------|------|------|
| fuzzyCorrectPhase 正则尾部下划线 | 2026-06-27 | replace 后在末尾产生 `_`，需去首尾下划线 |
| 僵尸检测 filter 失效 | 2026-06-27 | startsWith(stageId) 与模块目录组织不匹配 |
| repair dry-run 误报 | 2026-06-27 | 文件不存在时返回 fixed=true，正常时 exit(1) |
| Schemer 产出路径不匹配 | 2026-06-27 | stages/ vs plan/ 路径不一致 |
| architect 审查模板未同步 | 2026-06-27 | Reviewer↔Tester 闭环在 Architect 审查场景下断裂 |
| 手动 edit status.md 频繁失败 | 2026-07-02 | 格式匹配脆弱 → 改为 CLI 原子操作 |
| Agent prompt CLI 命令引用应预验证 | 2026-07-05 | Schemer 引用未实现命令导致 Executor 前置校验断裂 |
| 流水线文件引用断裂连锁修复 | 2026-07-05 | 路径+命令+配置三层引用断裂的修复策略 |
| fast-glob 目录匹配 onlyDirectories | 2026-07-09 | 尾部斜杠模式不自动激活目录匹配，需显式声明选项 |

### setup.md

| 条目 | 日期 | 摘要 |
|------|------|------|
| 部署模板复用 | 2026-06-27 | models.template.yaml 一键配置 |
| npm 超时与网络预检 | 2026-06-27 | 60s 超时 + 5 种包管理器支持 |
| 构建与测试 | 2026-07-15 | npm install + npm test，298/298 通过（20 个测试文件） |

## 最近更新

| 日期 | 操作 | 描述 |
|------|------|------|
| 2026-07-15 | 归档 | v4.4-stage-03 归档：3 项配置优化（config命令组 get/set/list + AGENTS.md语言同步 + package.json模板要求），知识沉淀 2 条至 patterns（i18n域扩展模式 + Agent模板约束模式），BUG-001 修复，v4.4 全系列完成 |
| 2026-07-15 | 归档 | v4.4-stage-04 归档：5 项收尾修复（Node20 兼容 / kb 数据更新 / init 模板通用化 / 版本号 1.0.0 / v4.2 一致性），测试 291/291 全通过 |
| 2026-07-14 | 归档 | v4.4-stage-01/02 归档：i18n 基础设施落成（TS常量导入+12文件国际化，206 entries×2语言），日志修复+流水线安全增强（REV双路兜底+公域降噪+git钩子+日志骨架+自动推进询问），测试 291/291 全通过，知识沉淀 6 条至 architecture(2) + patterns(4) |
| 2026-07-12 | 归档 | v4.3 全系列归档：3 阶段全部完成，多语言模板管线落成（templates-data → build.js → template-loader），双语 CLI 交互（init 选择 → .info.json 持久化 → update 读取），知识沉淀 4 条至 architecture(1) + patterns(3) |
| 2026-07-12 | 归档 | v4.3-stage-01/02 归档：17 项 op 落地（模板文件化重构 + project.ts REV-004 修复），16 条 REV（13 closed + 3 非阻塞），知识沉淀 3 条至 patterns |
| 2026-07-09 | 归档 | v4.2-stage-01 归档：2 项 op 落地（kb/index.md 快速概览 + project overview CLI），4 条 REV（3 closed），知识沉淀 1 条至 troubleshooting |
| 2026-07-05 | 归档 | v4.0 全系列归档：4 阶段 39 项任务闭环，知识沉淀 10 条至 architecture(3) + patterns(5) + troubleshooting(2) |
| 2026-07-02 | 新增 | v4 经验沉淀：op命名规范 + Executor读文件 + deps校验 + status.md CLI |
| 2026-07-01 | 归档 | v3.0 / v3.1 / v3.2 全系列归档，知识沉淀到四个分类 |
| 2026-07-01 | 初始化 | 首次创建知识库分类文件，提取 v3 系列 19 条经验 |
