# 知识库索引

> 项目知识库总索引，按分类组织。Agent 加载 `check-kb` 技能时自动读取本文件。

## 项目快速概览

| 维度 | 内容 |
|------|------|
| 定位 | AI Agent 开发流程治理 CLI 工具 |
| 语言 | TypeScript (Node.js ≥20) |
| 核心依赖 | Commander, Zod, YAML, fast-glob |
| 源文件 | 48 个 .ts 文件（src/） |
| Agent 数 | 9 个（feel/planner/schemer/executor/reviewer/tester/archiver/事务官/vision） |
| 模块入口 | src/index.ts → src/cli/index.ts |
| 关键目录 | src/core/（流水线核心）、src/commands/（CLI 命令）、.opencode/agents/（Agent 定义）、.openfeel/manual/（模块文档系统） |
| 最近更新 | 2026-08-15（stage-34 归档：plan 目录多级化与路径统一，4 条知识沉淀至 architecture(更新) + patterns(2 新增) + troubleshooting(更新)） |

## 分类概览

| 分类 | 文件 | 条目数 | 最近更新 | 用途 |
|------|------|:--:|------|------|
| 架构决策 | [architecture.md](architecture.md) | 15 | 2026-08-15 | 技术选型、设计理由、并行策略、多语言模板管线、i18n基建、日志聚合、Vision视觉官、CLI质量门禁、模块文档系统、计划目录分组、config meta.version 语义 |
| 代码模式 | [patterns.md](patterns.md) | 66 | 2026-08-15 | 项目约定、最佳实践、反模式、YAML增量、审查子维度扩展、全局用户画像、记忆生命周期、归档git提交、提示词审计、agents-md同步、Handoff委派、约束迁移、Checkpoint快照、组合终止条件、lint子命令组、i18n校验、kb健康检测、skill对齐、部署传播内容哈希比对、版本号语义、推理深度分档、模板同步、WORKSPACE_DIRS同步、审查纪律嵌入Prompt、写盘降级、passthrough保留、路径规范化、版本号重映射全链路同步、AGENTS.md变量替换、init/update重启提醒、update增量哈希追踪三态判定、任务类型路由、轻量决策边界、decisions.md 决策存储、stageId三格式解析、点号分隔符锚定 |
| 排查经验 | [troubleshooting.md](troubleshooting.md) | 15 | 2026-08-15 | 常见 Bug、调试流程、已知坑位、autoRepairInconsistency 干扰组合条件、npm publish 404/403 诊断链、update_state.json 降级风险排查、双层模板源发散、stages→plan 收敛 |
| 环境配置 | [setup.md](setup.md) | 6 | 2026-08-08 | 环境搭建、构建流程、依赖管理、Agent 模型配置、npm pack 发布验证、CI/CD npm 自动发布 |

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
| 8→9 Agent 体系扩展：Vision 视觉官 | 2026-08-07 | v0.4.6 新增 Vision 视觉官（通用视觉分析），qwen-vl-plus 多模态模型，不参与流水线调度，按需被 Feel 和其他 Agent 调用 |
| CLI 质量门禁体系：lint 子命令组 | 2026-08-07 | v0.5.4 引入 `openfeel lint` 命令组，子命令 i18n（422 键对称性校验）和 kb（过期引用检测），为 CI/CD 集成质量门禁奠定基础 |
| 分级模块文档系统：manual + 树图索引 | 2026-08-07 | v0.5.6 建立 .openfeel/manual/ 分级模块文档系统（index.md 树图 + core/cli/agents 模块文档），归档官同步维护，与 kb/ 知识库互补 |
| 计划目录按大版本系列分组模式 | 2026-08-07 | v0.5.7 将 .openfeel/plan/ 从平铺目录重构为按大版本系列分组（v4/、v5/），系列索引 + 顶层指针二级导航，git mv 保留历史，全链路引用同步 |
| config.yaml meta.version 语义：OpenFeel 框架版本 | 2026-08-15 | meta.version = 框架版本（非配置格式版本），由 config.ts 双语言模板常量硬编码，版本升级须三处同步，flow.json meta.version 为内部格式不参与 |

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
| 新增 Agent 全链路更新清单模式 | 2026-08-07 | 新增 Agent 时的 9 项文件更新清单 + Agent 模板规范要点（frontmatter五字段/权限顺序/颜色选型/正文结构/部署同步）+ 构建验证流程 |
| YAML Document API 增量修改模式 | 2026-08-07 | 使用 yaml 库 parseDocument()+setIn() 原地增量修改 config.yaml，保留注释与结构，结合 Zod 局部校验 |
| 过度设计审查子维度扩展模式 | 2026-08-07 | 在 Reviewer 审查维度规范性下新增过度设计子维度，中英双语模板同步 |
| 全局跨项目用户画像 YAML 配置模式 | 2026-08-07 | ~/.config/{tool}/profile.yaml 约定路径 + Zod Schema 校验 + 深度合并默认值 + 异常安全 |
| Agent 记忆生命周期三层模式 | 2026-08-07 | Agent prompt 中的记忆加载 → 决策追加 → 会话结束写入三段式，两层记忆（全局画像 + 项目卡片） |
| 跨 Agent Handoff 委派原语模式 | 2026-08-07 | Prompt 级 `[HANDOFF: agent_name]` 标记实现轻量 Agent 间委派，Feel 自动解析调度，零 CLI 新增 |
| 约束文件→指令文件迁移模式 | 2026-08-07 | 规范四步迁移法（复制→双语同步→[-]禁用→引用更新），保留审计链 |
| Checkpoint 快照自动保存 + 生命周期管理模式 | 2026-08-07 | phase 推进自动保存 flow.json 快照，毫秒级时间戳 + 自动清理 + CLI list/restore |
| 流水线 transitions 组合条件 `\|` 运算符模式 | 2026-08-07 | transitions key 支持 `\|` 组合 source phase，多 Agent 并行任一完成即触发推进 |
| CLI lint 子命令组扩展与 `--fix` 自动修复模式 | 2026-08-07 | 父命令组注册 + 子命令独立实现 + 共享 --fix 约定，新增校验仅需追加一个子命令 |
| i18n 键对称性校验模式 | 2026-08-07 | 三向比对（zhOnly/enOnly/共享键数）+ 空值检测，422 键全量一致性校验 |
| kb 过期引用检测与 CLI-Agent skill 映射全量对齐模式 | 2026-08-07 | 扫描 kb 文件路径引用验证存在性 + CLI 12 命令组全量 skill 映射，4 个新 skill 落地 |
| 部署传播内容哈希比对模式 | 2026-08-07 | openfeel update 部署 AGENTS.md 时用内容比对替代仅语言判断，确保模板更新能传播到存量项目 |
| 版本号语义管理与递增规范模式 | 2026-08-07 | AGENTS.md 写入主.次.修订语义，feel.md 默认递增修订号，Feel 审慎推进版本 |
| Agent 推理深度分档配置模式 | 2026-08-07 | 9 Agent frontmatter 统一新增 reasoning_effort 三档（high/medium/low），中英模板同步传播 |
| AGENTS.md 模板同步模式 | 2026-08-07 | AGENTS.md 新增节时，templates-data agents-md zh-CN/en 模板必须同步更新 |
| WORKSPACE_DIRS 同步模式 | 2026-08-07 | 新增 .openfeel/ 子目录时，结构定义中的 WORKSPACE_DIRS 数组必须同步追加 |
| 审查硬性纪律嵌入 Agent Prompt 模式 | 2026-08-07 | 在 Feel 和 Executor prompt 中硬编码审查合规约束（禁止跳过审查/禁止自行推进/标准移交语），中英双语 6 文件同步插入，与代码层 REV 双路兜底形成互补 |
| 版本号重映射边界判定模式 | 2026-08-07 | 项目级版本重映射时区分"目录名"（组织单位，保留原名）与"版本号引用"（文本，需重映射），practically applied on v0.5.11 plan/v5/ 系列目录名不变但 stageId/标题 v0 化 |
| kb 条目与规则升级同步时点模式 | 2026-08-07 | 规则升级在 exec 阶段实施，kb 同步在 archiving 阶段执行，审查时需识别"待归档同步"条目避免误判为缺陷 |
| AGENTS.md 模板变量替换模式 | 2026-08-08 | init 阶段将 `{项目名称}` 占位符替换为 `basename(projectPath)`，实现模板个性化部署，替换在 writeTemplateIfMissing 之前执行 |
| init/update 重启提醒对称输出模式 | 2026-08-08 | init 部署 opencode 后和 update 更新 agent 文件后均输出重启提醒，两端均检查 isTTY 实现非交互模式静默跳过 |
| CLI 错误诊断增强模式 | 2026-08-09 | 校验失败时三层诊断：错误原因 + 当前状态 + 可用操作/合法目标，含 stage create 引导和合法跳转列表 |
| CLI --dry-run 安全预览模式 | 2026-08-09 | 状态变更命令新增 --dry-run 选项，校验全量通过后在 save() 前截断，--force 组合时先警告再预览不写盘 |
| CLI 向导空状态交互式兜底模式 | 2026-08-09 | wizard 检测到 stages 为空时不静默退出，交互式询问创建首个阶段，创建后 continue 自动进入主循环 |
| update 增量部署哈希追踪 + 冲突标记三态模式 | 2026-08-11 | writeWithMergeDetection 四态判定（created/updated/skipped/conflicts）+ update_state.json 元数据追踪 + 冲突文件 Git 风格标记 + 降级策略 |
| 任务类型路由 + 轻量决策边界模式 | 2026-08-15 | 非编码任务一等公民（调研→research / 编码→流水线 / 选型→Feel+question），轻量决策边界三层统一定义，flow.json 不必空转 |
| 长期决策独立持久存储模式（decisions.md ADR） | 2026-08-15 | 长期决策→decisions.md（ADR 格式）与临时决策→dev_last.md 分离，templates.ts + init.ts + core.md 三处联动框架化 |
| stageId 三格式解析 + plan 目录双向映射模式 | 2026-08-15 | 完整/历史/短名三格式统一解析 + path.ts 唯一权威 + 反向映射回查 flow.json 去歧义 |
| 点号分隔符锚定解析模式（opId 含版本号点号） | 2026-08-15 | 复合 ID 切分用锚定正则 `/^(.+)\.(op-\d+)$/` 而非 split，避免完整 stageId 版本号点号干扰 |

### troubleshooting.md

| 条目 | 日期 | 摘要 |
|------|------|------|
| autoRepairInconsistency 干扰组合条件推进路径 | 2026-08-07 | status=done 强制同步 phase 为 done 截断 test_passed→archiving；v0.5.8 已修复根因：mapPhaseToStageStatus 仅 done→done |
| fuzzyCorrectPhase 正则尾部下划线 | 2026-06-27 | replace 后在末尾产生 `_`，需去首尾下划线 |
| 僵尸检测 filter 失效 | 2026-06-27 | startsWith(stageId) 与模块目录组织不匹配 |
| repair dry-run 误报 | 2026-06-27 | 文件不存在时返回 fixed=true，正常时 exit(1) |
| Schemer 产出路径不匹配 | 2026-06-27 | stages/ vs plan/ 路径不一致 |
| architect 审查模板未同步 | 2026-06-27 | Reviewer↔Tester 闭环在 Architect 审查场景下断裂 |
| 手动 edit status.md 频繁失败 | 2026-07-02 | 格式匹配脆弱 → 改为 CLI 原子操作 |
| Agent prompt CLI 命令引用应预验证 | 2026-07-05 | Schemer 引用未实现命令导致 Executor 前置校验断裂 |
| 流水线文件引用断裂连锁修复 | 2026-07-05 | 路径+命令+配置三层引用断裂的修复策略 |
| fast-glob 目录匹配 onlyDirectories | 2026-07-09 | 尾部斜杠模式不自动激活目录匹配，需显式声明选项 |
| Git 重命名检测交叉匹配假象 | 2026-08-07 | git mv 批量移动相似内容目录时，git diff 重命名标注不可轻信，应以实际文件内容（标题/时间戳）为准 |
| update_state.json 降级风险排查 | 2026-08-11 | Schema 不匹配或文件丢失导致 loadUpdateState → null，降级为全量覆盖；诊断方法 + 预防措施 + 设计原理说明 |
| 双层模板源发散：init 与 update 部署内容不一致 | 2026-08-15 | agents + opencode/agents 两层模板源已发散（feel.md 21 行差、core.md Vision 差异），build 独立校验不报错，按节锚点定点编辑规避，遗留待后续 stage 收敛 |
| npm publish 404/403 诊断链 | 2026-08-08 | secret 名字不匹配致 404 + automation token 与包级 2FA 冲突致 403；npm 404 实为认证失败，legacy token 已弃用改 Granular token + Bypass 2FA |

### setup.md

| 条目 | 日期 | 摘要 |
|------|------|------|
| 部署模板复用 | 2026-06-27 | models.template.yaml 一键配置 |
| npm 超时与网络预检 | 2026-06-27 | 60s 超时 + 5 种包管理器支持 |
| 构建与测试 | 2026-07-15 | npm install + npm test，298/298 通过（20 个测试文件） |
| CI/CD npm 自动发布配置 | 2026-08-08 | Granular token（Read and write + Bypass 2FA）+ workflow 正确写法 + 排查清单 |

## 最近更新

| 日期 | 操作 | 描述 |
|------|------|------|
| 2026-08-15 | 归档 | stage-34 归档：plan 目录多级化与路径统一（path.ts 新模块 + 三级回退 + 写入迁移 + init 多级化 + 模板/skill 双语同步），6 op / 33 文件变更，0 REV，425/425 测试通过，0 Bug，知识沉淀 4 条至 architecture(更新) + patterns(2 新增) + troubleshooting(更新) |
| 2026-08-15 | 归档 | stage-33 归档：Pantheogen 反馈 3 项规则改动（日志纪律解耦 + 任务类型路由 + 轻量决策边界）+ decisions.md 框架化 + 版本 1.0.8 全链路同步，5 op / 29 源码文件变更，0 REV，407/407 测试通过，0 Bug，知识沉淀 4 条至 architecture(1) + patterns(2) + troubleshooting(1) |
| 2026-08-11 | 归档 | stage-32 归档：openfeel update 增量更新 + 冲突标记机制（update-state.ts 新模块 + writeWithMergeDetection 三态逻辑 + 冲突文件写入），1 文件新增 + 2 文件变更，406/406 测试通过，443 i18n 键，3 non-blocking REV，知识沉淀 2 条至 patterns(1) + troubleshooting(1) |
| 2026-08-09 | 归档 | stage-31 归档：Pantheogen CLI 体验优化 4 项（--stage 缺失提示引导 + wizard 无阶段交互式创建 + 跳转失败增强诊断 + advance --dry-run 预览），3 文件变更，399/399 测试通过，441 i18n 键对称，1 non-blocking REV（特殊字符校验），知识沉淀 3 条至 patterns |
| 2026-08-09 | 归档 | stage-30 归档：Pantheogen 兼容性 Bug 修复（flow-manager load() 类型守卫 + 正则兼容非粗体 + stage create 子命令），3 op / 4 文件变更，399/399 测试通过，1 non-blocking REV，知识沉淀 3 条至 patterns(2) + troubleshooting(1) |
| 2026-08-08 | 归档 | stage-29 归档：init 增强（AGENTS.md 项目名称替换 + opencode 适配器部署），2 op（模板数据源化 + init 集成），~50 文件模板数据源 + 构建管线 + 部署逻辑 + 4 测试，399/399 全通过，3 non-blocking REV，知识沉淀 2 条至 patterns（变量替换 + 重启提醒） |
| 2026-08-08 | 归档 | npm 自动发布排查经验沉淀：GitHub Actions CI 发布失败（404 secret 名字不匹配 + 403 2FA 与 automation token 冲突），定位需用 Granular token + Bypass 2FA，知识沉淀 2 条至 troubleshooting(1) + setup(1) |
| 2026-08-07 | 归档 | v1.0.0 正式版三阶段全部归档：stage-01（质量加固：lint零错误，395测试，3缺陷修复）+ stage-02（发布工程：版本统一v1.0.0，npm pack 193文件验证，CI/CD GitHub Actions）+ stage-03（文档完善：CHANGELOG.md + GETTING_STARTED.md），知识沉淀 2 条至 patterns(1) + setup(1)，Agent 数 9，源文件 46 |
| 2026-08-07 | 版本统一 | op-003 版本号统一（v1.0.0-stage-02）：flow.json 25 个 stageId 从 v0.x.x 体系重映射为 v1.0.0-stage-04~28（v0.4.2→04 起按 flow.json 顺序编号），同步更新 plan/index.md 对照表、plan_log.md、dev/current.md |
| 2026-08-07 | 归档 | v0.5.11-stage-01 归档完成：目录归位 + 版本重映射 + 四级版本号 v0 体系（plan 目录 v5.8~v5.10 归入 v5/ 系列 + flow.json 25 stageId v0 化 + AGENTS.md 四级版本号规则落地），1 op 完成，3 REV（low, non-blocking）审查通过，知识沉淀 2 条至 patterns（版本号重映射边界判定、kb 同步时点）+ 1 条至 troubleshooting（git 重命名交叉匹配假象），Agent 数 9，源文件 46 |
| 2026-08-07 | 归档 | v0.5.10-stage-01 归档完成：profile 自动填充 + 异常安全（ensureProfileDefaults + 3 项健壮性修复：写盘降级 + passthrough 保留 + 路径规范化），2 op 完成，3 REV 全部 closed，知识沉淀 3 条至 patterns（写盘降级、passthrough 保留、路径规范化），Agent 数 9，源文件 46 |
| 2026-08-07 | 归档 | v0.5.9-stage-01 归档完成：审查纪律强化（feel.md 新增「审查不可跳过（硬性纪律）」节 + executor.md 新增「审查移交（硬性纪律）」节），中英双语 6 文件同步插入，知识沉淀 1 条至 patterns（审查硬性纪律嵌入 Agent Prompt 模式），Agent 数 9，源文件 46 |
| 2026-08-07 | 归档 | v0.5.8-stage-01 归档完成：三项缺陷修复（autoCommitOnDone mapPhaseToStageStatus 映射修正 + AGENTS.md 模板补版本管理节 + init 创建 manual/ 目录），知识沉淀 2 条至 patterns（模板同步、WORKSPACE_DIRS同步）+ 1 条更新至 troubleshooting（autoRepairInconsistency 根因修复），Agent 数 9，源文件 46。v5 全系列 8 期 19 项任务全部闭环 |
| 2026-08-07 | 归档 | v0.5.7-stage-01 归档完成：计划目录按大版本分组重构（v4/v5/系列收纳 + 系列索引+顶层指针）+ reasoning_effort 分档调整（Planner/Schemer→max, Executor/Vision→medium），知识沉淀 2 条至 architecture(1) + patterns(1，更新)，Agent 数 9，源文件 46。v5 全系列 7 期 16 项任务全部闭环 |
| 2026-08-07 | 归档 | v0.5.6-stage-01 归档完成：版本管理规范（AGENTS.md 主.次.修订语义 + feel.md 默认递增修订号）+ 模块文档系统 .openfeel/manual/（4 模块 + 树图索引）+ 9 Agent reasoning_effort 思考深度分档配置，知识沉淀 3 条至 architecture(1) + patterns(2)，Agent 数 9，源文件 46 |
| 2026-08-07 | 归档 | v0.5.5-stage-01 归档完成：缺陷修复（AGENTS.md 部署传播内容哈希比对 + autoCommitOnDone save 前移到 commit 前时序修正），知识沉淀 1 条至 patterns（部署传播哈希比对模式）+ 1 条更新（autoCommit 时序修正），Agent 数 9，源文件 46。v5 全系列最终闭环 |
| 2026-08-07 | 归档 | v0.5.4-stage-01 归档完成：lint 质量门禁（i18n 422键校验 + kb 过期引用检测）+ CLI-Agent skill 全量对齐（4新skill：roadmap/health/recover/wizard），知识沉淀 4 条至 architecture(1) + patterns(3)，Agent 数 9，源文件 46 |
| 2026-08-07 | 归档 | v0.5.3-stage-01 归档完成：Checkpoint 快照（phase 推进自动保存 + list/restore CLI，毫秒级时间戳 + 自动清理 20 个限制）+ 组合终止条件（transitions `\|` 运算符，多 Agent 并行任一完成即推进），知识沉淀 2 条至 patterns（Checkpoint 快照模式、组合终止条件模式）+ 1 条至 troubleshooting（autoRepairInconsistency 干扰组合条件，遗留项），Agent 数 9，源文件 45 |
| 2026-08-07 | 归档 | v0.5.2-stage-01 归档完成：规范迁移（dev_core.md 工具规范→core.md，[-] 标记 + 中英双语同步）+ Handoff 委派原语（feel.md 委派机制 + 4 个 Agent Handoff 声明，15 文件双语同步），知识沉淀 2 条至 patterns（Handoff 委派、约束迁移），Agent 数 9，源文件 45 |
| 2026-08-07 | 归档 | v0.5.1-stage-01 归档完成：工具链内化（flow advance --to done 自动 git commit）+ 一致性治理（feel.md 编号修复 + AGENTS.md 模板补齐 4 节），知识沉淀 3 条至 patterns（归档自动 git commit、Agent 提示词编号审计、AGENTS.md 四节同步），Agent 数 9，源文件 45 |
| 2026-08-07 | 归档 | v0.5.0-stage-01 归档完成：框架级记忆体系落成（全局 profile ~/.config/openfeel/profile.yaml + dev_last.md 7 节模板 + CLI config --global 标志），知识沉淀 2 条至 patterns（全局用户画像配置模式、Agent 记忆生命周期三层模式），Agent 数 9，源文件 45 |
| 2026-08-07 | 归档 | v0.4.7 归档完成：部署版过期修复（Feel +38行 / Executor +26行）+ dev_core.md 重复规则清理，制定 v0.4.8~v0.5.1 路线图（8 项 4 期），Agent 数 9，源文件 45 |
| 2026-08-07 | 归档 | v0.4.6 全版本归档完成：stage-01（Vision Agent 全链路落地，9 ops + 3 REV 闭环）+ stage-02（CLI config get/set 命令 + AGENTS.md 过度设计规则增强 + Reviewer 审查维度扩展 + Vision 模板去硬编码），知识沉淀 2 条至 patterns（YAML 增量修改、审查子维度扩展），Agent 数 9，源文件 45 |
| 2026-08-07 | 归档 | v0.4.6-stage-01 归档：Vision Agent 全链路落地（9 ops + 3 REV 闭环），知识沉淀 1 条至 patterns（新增 Agent 全链路更新清单模式），测试 298/298 全通过 |
| 2026-07-15 | 归档 | v0.4.4-stage-03 归档：3 项配置优化（config命令组 get/set/list + AGENTS.md语言同步 + package.json模板要求），知识沉淀 2 条至 patterns（i18n域扩展模式 + Agent模板约束模式），BUG-001 修复，v0.4.4 全系列完成 |
| 2026-07-15 | 归档 | v0.4.4-stage-04 归档：5 项收尾修复（Node20 兼容 / kb 数据更新 / init 模板通用化 / 版本号 1.0.0 / v0.4.2 一致性），测试 291/291 全通过 |
| 2026-07-14 | 归档 | v0.4.4-stage-01/02 归档：i18n 基础设施落成（TS常量导入+12文件国际化，206 entries×2语言），日志修复+流水线安全增强（REV双路兜底+公域降噪+git钩子+日志骨架+自动推进询问），测试 291/291 全通过，知识沉淀 6 条至 architecture(2) + patterns(4) |
| 2026-07-12 | 归档 | v0.4.3 全系列归档：3 阶段全部完成，多语言模板管线落成（templates-data → build.js → template-loader），双语 CLI 交互（init 选择 → .info.json 持久化 → update 读取），知识沉淀 4 条至 architecture(1) + patterns(3) |
| 2026-07-12 | 归档 | v0.4.3-stage-01/02 归档：17 项 op 落地（模板文件化重构 + project.ts REV-004 修复），16 条 REV（13 closed + 3 非阻塞），知识沉淀 3 条至 patterns |
| 2026-07-09 | 归档 | v0.4.2-stage-01 归档：2 项 op 落地（kb/index.md 快速概览 + project overview CLI），4 条 REV（3 closed），知识沉淀 1 条至 troubleshooting |
| 2026-07-05 | 归档 | v0.4.0 全系列归档：4 阶段 39 项任务闭环，知识沉淀 10 条至 architecture(3) + patterns(5) + troubleshooting(2) |
| 2026-07-02 | 新增 | v4 经验沉淀：op命名规范 + Executor读文件 + deps校验 + status.md CLI |
| 2026-07-01 | 归档 | v3.0 / v3.1 / v3.2 全系列归档，知识沉淀到四个分类 |
| 2026-07-01 | 初始化 | 首次创建知识库分类文件，提取 v3 系列 19 条经验 |
