# 知识库索引

> 项目知识库总索引，按分类组织。Agent 加载 `check-kb` 技能时自动读取本文件。

## 项目快速概览

| 维度 | 内容 |
|------|------|
| 定位 | AI Agent 开发流程治理 CLI 工具 |
| 语言 | TypeScript (Node.js ≥20) |
| 核心依赖 | Commander, Zod, YAML, fast-glob |
| 源文件 | 63 个 .ts 文件（src/） |
| Agent 数 | 9 个（feel + 8 个 openfeel-* 前缀：planner/schemer/executor/reviewer/feel-tester/utility/vision/archiver） |
| 模块入口 | src/index.ts → src/cli/index.ts |
| 关键目录 | src/core/（流水线核心）、src/commands/（CLI 命令）、.opencode/agents/（Agent 定义，自举实例由 build 生成；**stage-55 起仓库不再保留项目级 .opencode 部署实例**）、src/core/templates-data/opencode/（模板唯一权威源）、.openfeel/manual/（模块文档系统） |
| 最近更新 | 2026-10-01（**stage-54 归档**）：**收尾 — 遗留缺陷清理（发布前清账）**（3 op：`740a79d`/`8fd49af`/`35278b4`）。交付 **E1 `cli/BUG-005`** 空模板检测由纯子串改**整行锚定**（`EMPTY_TEMPLATE_LINE_RE` + `scheme.ts` 复用单一来源）→ `publish` 误拒 / `health`·`ops list` 误报消除、仓库空模板告警**归零**；**E2 `cli/BUG-006`** en blocking REV 拒绝文案 i18n（+2 键）；**E3 `cli/BUG-003`** `flow phases --help` 补 `transitionsDiff`（**JSON 契约未变**）；**E6** 全仓 REV pending **分层统计**（总 270 / 清账层 38 / 历史层 88 / 无法判定 3）+ 清账层收口 closed 31 / 维持 pending 7；`bugs/index.md` 统计修正。门禁：`npm test` **59 文件 / 987 用例 0 skipped**、`tsc` 0、build 幂等、`lint i18n` **726 键**、`lint kb` 0 过期（265 引用）、`flow health` **空模板告警归零**；环境零污染。审查三段零阻塞（**REV-001 medium blocking / REV-002 low 全 closed**）；测试官端到端 + 分层独立复算全通过；`cli/BUG-005`/`cli/BUG-006`/`templates/BUG-003` **关闭**、新登记 `templates/BUG-005`（low）；知识沉淀 **4 条**（patterns 2 + troubleshooting 2，含 1 条更新）。**M10 收尾清账 done，stage-55 为发布前最后前置** |
| 上一里程碑 | 2026-10-01（**stage-53 归档**）：**current.md / dev_last.md 职能与格式重构**（5 op；`627805e`/`3792b77`/`ae0d6e2`/`4377822`/`27ce06e`）——两条设计目的（保存核心信息便于恢复 / 避免无关信息污染上下文）+ 索引/主题/详情三层分层；`current.md` 团队文件新格式（≤5 条 + 自动归档 `current_archive/`）；`dev_last.md` 索引 + 同名主题目录（R1~R6 含 R4 就地收敛 + R6 加锁）；用户裁定 A5/A6/A9/A10 全落地；存量迁移零丢失（current 82→14、dev_last 53→34 + 5 英文主题）；**59 文件 / 949 用例全绿**、`lint i18n` 724 键、`lint kb` 0 过期；新登记 `templates/BUG-004`（low，就地修正） |

## 分类概览

| 分类 | 文件 | 条目数 | 最近更新 | 用途 |
|------|------|:--:|------|------|
| 架构决策 | [architecture.md](architecture.md) | 28 | 2026-10-01 | 技术选型、设计理由、并行策略、多语言模板管线、i18n基建、日志聚合、Vision视觉官、CLI质量门禁、模块文档系统、计划目录分组、config meta.version 语义、跨进程并发保护架构、opencode agent/skill 合并语义、模板单源架构、全局部署架构、控制区标记增量更新架构、存量项目迁移架构、模型配置三层级架构、全局约束架构、全局宏观状态聚合语义、opencode 权限合并求值语义、上下文预算治理架构、团队文件 vs 本地文件职能三分 |
| 代码模式 | [patterns.md](patterns.md) | 123 | 2026-10-01 | 项目约定、最佳实践、反模式、YAML增量、审查子维度扩展、全局用户画像、记忆生命周期、归档git提交、提示词审计、agents-md同步、Handoff委派、约束迁移、Checkpoint快照、组合终止条件、lint子命令组、i18n校验、kb健康检测、skill对齐、部署传播内容哈希比对、版本号语义、推理深度分档、模板同步、WORKSPACE_DIRS同步、审查纪律嵌入Prompt、写盘降级、passthrough保留、路径规范化、版本号重映射全链路同步、AGENTS.md变量替换、init/update重启提醒、update增量哈希追踪三态判定、任务类型路由、轻量决策边界、decisions.md 决策存储、stageId三格式解析、点号分隔符锚定、乐观并发校验、原子写、建议性文件锁、命名前缀统一与子串陷阱处理、P5 读取兼容、JSONC 深度合并、全局/项目双 state 路由、控制区标记模式、malformed降级防死循环、迁移命令模式、回滚边界模式、模型配置命令模式、约束/操作分离、纯全局部署命令、CLI自描述命令模式、破坏性命令安全校验清单、配置级联解析、审计日志双轨命名、测试 cwd 隔离与反向守卫、隔离 HOME 实测法、平台无关化描述泛化原则、零行为变更验证方法、部署覆盖前自动备份机制、全局状态文件多类条目与短前缀读侧分类、全局路径单点 mock 隔离、写策略按资产归属二分（用户资产不覆盖 vs 框架资产备份后覆盖）、存在视图 vs 推进白名单、事务顺序（先落盘后副作用）、CLI用法 skill 化（权威源单文件 + build 双注入 + 自举 + 快照声明）、版本号全链路收口清单（A/B/C/D/E 五类）、测试隔离的「干净机器」验证法、环境哈希守卫（CI 层）、整仓全量审查的单元划分与覆盖矩阵（MECE）、全量审查发现分类与流转裁定、审查结论独立复核（blocking 逐条复现 + 随机抽验）、`--dry-run` 字节级不写盘（含连带写盘点）、死导出/漂移 API 清理判据、部署语境 vs 本仓语境命令口径二分、全量审查批量清理方法论（主题分批 + T 编号化 + 裁定回写）、跨阶段「契约先行」协同（单一 owner + 事前接口约束）、CLI 退出码语义（非 0 退出 + 无逃生阀 + process.exitCode）、命令面收敛与弃用策略（单入口 + TTY 提示 + 下版本删除登记）、索引+主题文件分层记录模式、就地收敛而非归档、`null` 语义分歧登记为已知边界、REV/缺陷状态收口的分层口径 |
| 排查经验 | [troubleshooting.md](troubleshooting.md) | 41 | 2026-10-01 | 常见 Bug、调试流程、已知坑位、autoRepairInconsistency 干扰组合条件、npm publish 404/403 诊断链、update_state.json 降级风险排查、双层模板源发散、stages→plan 收敛、并发写入竞态排查、模型名错误导致 Agent 无法启动、opencode instructions 路径 ~ 不展开、agent_manager_tool schema 未定义静默丢弃、malformed 标记死循环排查、migrate 中途失败排查、opencode 模型解析优先级排查、全局 AGENTS.md 加载排查、flow phases 与 advance 校验集不一致、i18n 死键未接入、kb-dedup CRLF 去重失效、writeDefaultConfig 静默覆写真实配置、文档根因须实测复核、多源文案同步陷阱、备份失败 fail-fast 语义分叉、保存/恢复伪隔离直写真实全局目录（隔离审计四步法）、**PATH 全局旧版 CLI 环境污染（门禁口径）**、**版本级两类伪信号（审查幻觉 + 验收污染基线）**、真实环境一次性数据清理规范、随包 postinstall 在用户端路径层级失效（rootDir 假设 + 静默跳过）、配置键白名单须 schema 驱动 + 值类型归一（避免字符串 `"true"` 写入破坏配置）、prompt 级协议 vs 代码级强制边界、新增输出键/契约的同步面清单 |
| 环境配置 | [setup.md](setup.md) | 6 | 2026-09-25 | 环境搭建、构建流程、依赖管理、Agent 模型配置（frontmatter 优先级已勘误）、npm pack 发布验证、CI/CD npm 自动发布 |

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
| 跨进程并发保护架构：原子写 + 建议性文件锁 + 序号原子化三层底座 | 2026-09-12 | `src/core/fs/` 三零依赖工具；同目录 temp+fsync+rename、O_EXCL 锁+退避+rename 抢占、O_EXCL 占号；TTL=3000ms 基于实测 P99≈8.14ms；仅接入高风险写入点 |
| opencode 全局/项目 agent 与 skill 合并语义（源码验证） | 2026-09-12 | agent 按名 mergeDeep（项目覆盖同名、异名全局保留、项目不屏蔽全局）；skill 并集合并但同名覆盖非确定（须名唯一）；default_agent 合并后注册表解析。stage-37 全局部署关键前提 |
| 模板单源架构：templates-data/opencode 唯一权威源 + 双注入对象 + 单源一致性断言 | 2026-09-25 | 三对双层模板源收敛为单源；删除 agents/core-instructions 冗余树；双注入对象不合并（消费方不同）仅加单源一致性断言；.opencode/ 降级为构建产物（步骤8 自举重生成 + 生成物标记）；行尾归一 LF；**【supersede｜2026-10-01｜v1.1.2-stage-55】仓库自身不再保留项目级 .opencode 部署实例（详见 architecture.md N1 supersede）** |
| 全局部署架构：框架资产全局化 + 项目精简 + 双 state | 2026-09-25 | D1/P2 全量落地；框架资产（9 agent/14 skill/core.md/opencode.jsonc）部署到 ~/.config/opencode/；项目精简为 .openfeel/ + AGENTS.md + opencode.jsonc；框架约束走 instructions（绝对路径）；全局/项目双 update_state；opencode 配置合并语义实测结论（instructions 拼接+去重、~ 加载层展开、core.md 实际加载、AGENTS.md 自动加载、agent_manager_tool 静默丢弃） |
| 控制区标记增量更新架构：managed-region 四策略 + 三态 + update_infos 双资产路径 | 2026-09-25 | D3 全量落地；四策略（markdown begin/end、gitignore、frontmatter 结构化合并、jsonc 深合并）；部署三态（不存在写/无标记追加+记录/含标记覆盖区内）+ malformed 不写盘只记 anomaly；hash 降级为归属兜底；update_infos 双资产路径（绝对路径 / 项目根+相对路径）+ 加锁原子写 |
| 存量项目迁移架构：legacy 布局检测 + 备份回滚 + 全局部署迁移 | 2026-09-25 | `openfeel migrate` 命令；legacy 五条判据（①/② 框架同源判定保证幂等）；备份 `.openfeel/backup/{ts}/` + manifest.json + globalStateKeys 精确回滚；复用 deployGlobalAsset 全局部署；state 拆分重键；回滚边界=全局资产幂等不还原、仅还原项目文件 + 全局 state 新增条目 |
| 模型配置三层级架构：工具默认/全局/项目 + 优先级链 frontmatter>jsonc | 2026-09-25 | `openfeel model` 命令组 + `model-config.ts` 内部 API；三层级落点（default 改 frontmatter 双语 + opencode-config.ts / global·project 改 jsonc）；REV-1606 实测优先级链 frontmatter>jsonc（推翻计划初期相反假设）；provider 硬校验 + model-id 软校验；default 层多源不一致以 frontmatter 为准 |
| 全局约束架构：约束统一全局 AGENTS.md + 约束/操作分离 + 项目级去约束化 | 2026-09-26 | 移除 core.md 约束统一全局 AGENTS.md；约束常驻 AGENTS.md vs 操作拆 skill；项目级去约束化（init/update 不再生成/部署项目 AGENTS.md）；op-000 实测全局 AGENTS.md 自动加载 YES/并存拼接/移除 instructions 仍生效 |

| 全局宏观状态聚合语义：全量 done 判定 + 空集守卫 + 不迁移历史 | 2026-09-29 | `pipeline.phase` 为派生宏观状态，由全部阶段聚合（`length > 0 && every(done)`，空集守卫防 vacuous truth）；单阶段 done 不改变全局；current 不回退属设计行为；不迁移历史（可由 stages 推导 + advance 自愈）；含 status/verbose/current/overview/wizard/validate/migrate 消费方核验清单 |

| opencode agent permission 合并求值语义：findLast + 按键深合并 + 平台默认 ask | 2026-09-29 | 规则列表 `findLast`（最后匹配者胜）+ `permission` 字段通配匹配；顺序=内置默认 → 配置文件 → agent `.md` → 自动追加内部目录 allow；按权限键深合并、**同名键 `.md` 优先**（唯一项目级收紧入口=项目 `.opencode/agent/<name>.md`）；`external_directory` 默认 `ask`；`write` 非授权键、`edit` 才是；单值/对象形式等价。仅对 1.18.33 有效 |

| 纠正侧能力对称原则：创建侧齐备 → 补齐纠正/清理侧 CLI（可维护性架构） | 2026-10-01 | 声明式状态文件 + 禁止手改 + 全由 CLI 写入的治理体系，须为每种可写结构提供对称的增/删/改/查命令面；能力三分类 删除（`plan scheme remove`）/ 修正（`flow stage set --deps`、`flow review update\|remove`）/ 对账（`flow repair` op↔文件 + `flow health` 孤儿 warn）；配套 对账先于清理 / 单一语义（`ensureStageSkeleton` 消除半注册）/ 单一 owner（`syncCurrentOp`）/ 不做历史迁移 |
| 上下文预算治理架构：两条设计目的 + 索引层/主题层/详情层三层分层 | 2026-10-01 | 「保存核心信息便于恢复 / 避免无关信息污染上下文」两条总纲 + 三层分层（索引层条数/字数硬限、主题层 ≤10 条×≤300 字、详情层 `tmp/` 仅记地址）；current 归档至 `current_archive/`、dev_last 超期不归档；判据「恢复性优先，细节下沉但地址必留」 |
| 团队文件 vs 本地文件的职能三分：跨用户操作 / 本地恢复 / 交接传递 | 2026-10-01 | `current.md`=团队文件（公共域、仅个人提交时更新、整体信息、≤5 条 + 自动归档）；`dev_last.md`=本地文件（私域、会话末尾更新非覆盖、索引+主题、含公共交接区仅列位置+摘要）；判据「这条信息给谁看」；实证 current 82→14 行、遗留清单移私域 |
| 仓库自身不再保留项目级部署资产（supersede N1） | 2026-10-01 | **v1.1.2-stage-55**：删除根 `AGENTS.md`/`opencode.jsonc`/`.opencode/{agents,skills,ADAPTER.md}` 与 `build.js` 步骤 8（防复活），改由全局 `openfeel setup` 部署（17 skill / 9 agent / 全局 `AGENTS.md`）；**适用边界：目标项目 `.opencode/` 语义不受影响**。详见 architecture.md N1 supersede |

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
| flow.json 乐观并发校验模式 | 2026-09-12 | meta.revision 单调递增 + 锁内比对 loadedRevision → 冲突抛 FlowConcurrentModificationError（不写盘）；命令层退出码 2；restoreCheckpoint 冲突返回 false；repair 不校验但写时递增 |
| 原子写模式 | 2026-09-12 | 同目录唯一名 temp + fsync + rename；内容零改写；backup:true 写前复制 .bak、写后不覆盖；跨平台 temp 须同目录、Windows rename/unlink 容错 |
| 建议性文件锁模式 | 2026-09-12 | O_EXCL 独占创建 + 指数退避（±20% 抖动）+ 陈旧锁 rename 原子抢占 + token 归属校验释放；Atomics.wait 同步睡眠；锁不嵌套 |
| 命名前缀统一与子串陷阱处理模式 | 2026-09-25 | openfeel- 前缀 + feel 例外 + 最长优先替换 + 词边界 + 负向断言防二次前缀化；技术术语（Vision-Language）误伤教训；CLI 子命令与 skill 同名词区分；伪阳性清单 |
| P5 读取兼容模式 | 2026-09-25 | normalizeAgentName 归一化（toLowerCase + 幂等）+ 写入新名读取兼容旧名；接入点 = 所有展示 agent 名的路径；不迁移历史 flow.json |
| JSONC 深度合并模式 | 2026-09-25 | parseJsonc 剥离 // 行注释（块注释失败降级）+ deepMergeJsonc 五类字段规则（instructions 拼接去重/agent 补缺/skills 保留/对象递归/标量覆盖）；用户未知字段 passthrough |
| 全局/项目双 state 路由模式 | 2026-09-25 | isAbsolute 分流：绝对路径→全局 ~/.openfeel/update_state.json、相对路径→项目 .openfeel/update_state.json；全局 state 加锁+原子写、项目 state 仅原子写；冲突文件按绝对/相对路由到对应 update_conflicts |
| 控制区标记模式：`<!-- openfeel:begin/end -->` 包裹受管内容 + 三态判定 | 2026-09-25 | 成对标记包裹受管内容；三态判定（不存在写/含标记替换区内/无标记 hash 兜底 adopt 或追加）；整行精确匹配区分 generated 单行信号；frontmatter 浅合并；行尾归一化幂等 |
| malformed 降级防死循环模式：异常标记不写盘只记异常条目 | 2026-09-25 | 标记解析失败（多对/不成对）不写盘、不追加、不覆盖，仅写 update_infos.md 异常条目待人工修复；anomaly 按路径去重；结果 skipped |
| 迁移命令模式：detect→backup→deploy→split→clean→report + rollback + --dry-run | 2026-09-25 | `openfeel migrate` 六步可回滚流程；--dry-run 不写盘；rollback 按 manifest 逆向恢复；任一步异常中止输出「可 rollback 回滚」提示；框架同源判定保证幂等 |
| 回滚边界模式：全局资产幂等不还原，仅还原 manifest 记录 | 2026-09-25 | 全局框架资产幂等可重建不还原；仅还原项目文件（manifest.entries 逆向）+ 全局 state 新增条目（manifest.globalStateKeys 精确删）；--remap-assignee 时 flow.json 须入 manifest |
| 模型配置命令模式：model set/get/list + --scope + 校验 + 非 TTY 守卫 | 2026-09-25 | openfeel model 命令组（set/get/list + --scope default\|global\|project，默认 project）；非 TTY 下 --scope default 须 --force/--build 双重确认；isFrameworkSourceReady 复用 core 层路径推导；build 由 CLI 层触发；校验三段式错误提示；遮蔽提示（REV-1701）；内部 API 纯函数化 |
| 约束/操作分离模式：目录结构语义决定归属（约束→AGENTS.md，操作→skill） | 2026-09-26 | 按内容性质决定归属：行为约束→全局 AGENTS.md（常驻自动加载），操作步骤→skill（按需加载）；移除 core.md 只留全局 AGENTS.md 消除约束两处存放；项目级去约束化 |
| 纯全局部署命令模式：setup 只部署全局资产，不建项目 .openfeel/ | 2026-09-26 | openfeel setup（纯全局）与 openfeel init（项目初始化）职责分离；setup 幂等复用 deployGlobalAsset；init 拆 --workspace-only --non-interactive 供 Feel 空白项目自动搭工作区 |
| CLI 自描述命令模式：phase 枚举与转移表复用运行时单一数据源 | 2026-09-29 | 自描述命令经 FlowManager 只读访问器（getPipelinePhases/getPipelineTransitions）读运行时 pipelineConfig，缺省回退默认表；展示与校验（hasTransition/getValidTargets）同读 transitions 杜绝第二信源；命令层禁硬编码 PIPELINE_PHASES；--json 稳定结构；局限=phase 合法性判定未收敛 |
| 破坏性命令安全校验清单模式：默认拒绝 + 显式越权 + 可预览 + 可审计 | 2026-09-29 | 九项清单：存在性/子项非空/被引用（deps 归一化 + Array.isArray 守卫）/当前活跃/指针兜底/--force 留痕/--dry-run 复用只读校验/--purge 双重确认/审计快照；校验抽单个只读方法供 remove 与 dry-run 共用 |

| 配置级联解析模式：单一 resolver + 四级优先级 + effective 展示出口 | 2026-09-29 | `status.md > config.yaml > profile.yaml > builtin` 单一 resolver（buildCascadeConfig 浅合并 + resolveEffectiveConfig 同源标注）；`config effective` 与 `flow status --verbose` 同为该 resolver 的出口，无第二信源；文案与实现须同批修改；BUG-003 已知残留（无画像文件时来源误标 profile.yaml） |
| 审计日志 action 命名与双轨语义模式 | 2026-09-29 | add_stage（flow-manager，仅注册层）vs register_stage（cli，完整层）+ register_op；幂等早返回/冲突抛错须在 appendLog 之前；日志先于 save 属设计；审计查询须同时识别两种 action |
| 测试 cwd 隔离模式：spyOn process.cwd + 模块期 REAL_CWD 反向守卫 | 2026-09-29 | 命令层测试须 mock `process.cwd`（前提＝被测代码运行时调用）+ 模块顶层捕获 REAL_CWD 断言真实工作区逐字不变；零断言高危用例必须补正向断言；致败实验证明守卫有效；writeDefaultConfig 无 existsSync 守卫须一并核对 |

| 隔离 HOME 实测 opencode 行为的方法：双设 HOME/USERPROFILE + debug paths 断言 + 零污染核对 | 2026-09-29 | 四步法（双设环境变量 → `debug paths` 断言 home/config 全隔离 → fixture + `debug agent`/`run` 读 effective 值 → 清理与「文件数 + mtime」零污染核对）；`debug agent --tool` 对 ask 自动放行、只能判 deny，ask 必须用 `opencode run`（非 TTY 自动拒绝）；凭证只入隔离目录用后删除 |

| 平台无关化「描述泛化」原则与边界：只改描述 + 适配器细节保留标注 + B 类清单 | 2026-09-29 | 判定原则「断言平台唯一→泛化；说明具体用法/路径/命令→保留并标注（opencode 适配器）」；统一泛化词典；B 类保留清单（`opencode.jsonc`/`$schema`/opencode 字段/适配器目录本体及其操作指令/`supportedTools`/历史归档/fixture）；零行为变更边界；实证 `archiver:21,46`+`utility:40` 归类修正（操作指令泛化即失真） |
| 零行为变更改造的验证方法：diff 归因 + build 幂等 + 命令输出对比 | 2026-09-29 | 三证法：① `git diff --numstat` 改动行 = 注释行（`global-paths.ts` 8/8）+ 逐行确认常量/控制流零改动；② `npm run build` 后 `git status` 对 src/.opencode/templates-data 零输出（生成物非手改 + build 可复现）；③ pre-commit worktree 对比真实命令 stdout 逐字一致（仅 `--help` 文案允许变）。反模式：仅凭「测试全绿」宣称零行为变更 |

| 部署覆盖前自动备份机制：写前备份 + HOME 相对分区 + manifest + 单锁临界区 + 绝不覆盖既有备份 | 2026-09-29 | `~/.openfeel/backup/{ts}/`（`global/<HOME相对>` + `project/<basename>-<hash8>/<项目相对>` + `manifest.json`）；接入点判据＝「目标已存在且本次将被写入/覆盖」（created/no-op skipped/malformed 不备份）；`{ts}` 探测+mkdir+副本+manifest 读改写全程单锁临界区（消 TOCTOU）；撞名 `-2/-3` 绝不覆盖；失败语义＝`BackupError` 跳过写入（复用 `skipped`）+ `anomaly(note='backup_failed')`；jsonc 备份置于 jsonc 锁外（不嵌套）；不做 restore / 不做自动清理（范围裁定） |

| 全局状态文件多类条目扩展与短前缀读侧分类：向后兼容的读侧改造 | 2026-09-29 | `update_infos.md` 第三类 `backed`；成因优先复用既有 kind + `note` 哨兵（不新开第四 kind）；新字段沿用「必填 + 显式 null」；尾部可选段 + `[^（）]*` 阻断贪婪使旧行兼容；**读写必须同批改**（读侧原硬编码 `startsWith` → 不同步会把新节误归前一类）→ 改 `SECTION_PREFIXES` 短前缀与 `SECTION_TITLES` 紧邻维护 + 迁移约束注释；backed 不去重（保留审计轨迹）、anomaly 按路径去重 |

| 全局路径测试的单点 mock 隔离模式：`vi.mock('node:os')` 一处覆盖全部全局路径 | 2026-09-29 | 前提＝全仓仅 `global-paths.ts` import `homedir`（收敛约定 N4）→ 新全局路径函数自动纳入既有隔离；子进程用例 mock 不生效，须双设 `USERPROFILE`+`HOME`；与 stage-42 `process.cwd` spy + `REAL_CWD` 反向守卫互补（全局路径 vs 项目工作区双保险）；实施前 `rg "process\.cwd|homedir"` 排除模块加载期捕获。**更新（stage-47）**：补反例 `identity.test.ts` 保存/恢复伪隔离 + 「mtime + hash 双比对」审计法 |

| 写策略按资产归属二分：用户资产「不覆盖」vs 框架资产「备份后覆盖」 | 2026-09-29 | 先判归属再定策略：**用户资产**（用户会编辑的项目配置，如 `.openfeel/config.yaml`）→ 已存在即**不覆盖** + `skipped` 可见提示；**框架资产**（唯一权威源、可幂等重建，如全局 `AGENTS.md`/`opencode.jsonc`）→ **备份后覆盖**。三条要求：①「备份后覆盖」是覆盖的前置，改「不覆盖」须同批删除备份接入（否则产生误导性 `backed` 条目）；② 不覆盖须给用户可见理由，禁止静默；③ 守卫责任上移到调用点（`writeDefaultConfig` 契约注释）。取舍：模板演进能力下降为有意选择 |

| CLI 自描述集合的「存在视图 vs 推进白名单」区分：差异显式化而非强行收敛 | 2026-09-29 | `flow phases` 的 `phases`＝运行时**存在视图**（可含自定义 `gate`）；`--json.advanceAccepted`＝`PIPELINE_PHASES` 内置 15 的**推进白名单**；人类输出追加 `flow.phases.customPhaseNote` 边界说明。不收敛 `advance` 校验（波及 `PipelinePhase` 类型与模糊修正链）。判别：语义角色不同→显式化；角色相同（转移表展示 vs 校验）→必须同源。验证：`phases`=16 / `advanceAccepted`=15 且 `--to gate` 被拒 |

| 事务顺序模式：先落盘状态、后执行不可逆副作用 | 2026-09-29 | core 只做内存注销 + **计算**待删目标（返回 `{ purgeTarget }`），副作用由命令层在 `save()` 成功后执行（`removeStage → save() → rmSync(purgeTarget)`）；审计日志记**意图**（`detail.purgeTarget`）而非已发生事实（原 `detail.purged`）；契约变更须同步唯一调用方 + 翻转既有测试。判据：不可逆副作用一律后置；等价检查＝「若下一步失败，磁盘与状态会否自相矛盾」 |

| CLI 用法 skill 化模式：权威源单文件 + build 双注入 + 自举 + 「以 `--help` 为准」快照声明 | 2026-09-29 | 新增 skill = 新增文档载体、零代码改动：唯一权威源 `templates-data/opencode/skills/{name}/SKILL.md`（**扁平单文件、中文单语、无 `{lang}`**）+ `description` 含查询触发词 + build 步骤 4/6 双注入 + 步骤 8 自举（**新增目录自动纳入，`build.js` 零改动**）；**快照声明**「本文档为 vX.Y.Z 快照，命令细节以 `openfeel <cmd> --help` 为准」防文档-实现发散；与执行型 `openfeel-wizard` 互引划界；翻转清单须含**白名单数组** `expectedSkills`（14 处） |

| 版本号全链路收口清单模式：A 必改 / B 生成段 / C 传播 / D 禁改 / E 无载体 | 2026-09-29 | 五类核对：**A** 手工载体（`package.json` / `config.yaml` 单行改 / `config.ts` 模板 zh·en / `agents-md/{zh-CN,en}` 权威源 / 仓库根 `AGENTS.md` 手工副本漂移 / `package-lock.json` root 两行）；**B** 生成段由 build 重生成（禁手改）；**C** 全局传播（隔离 HOME）+ `CHANGELOG` 追加；**D** 禁改＝历史沿革注释 + 依赖自身版本（**按内容特征判定，不看行号**）；**E** 无载体（README/docs）。`package-lock.json` **禁 `npm install` 重生成**（避免依赖树 diff）；收口放版本最后阶段 + 独立 op 复核清单 |
| 测试全局路径隔离模式（禁用保存/恢复伪隔离） | 2026-09-29 | 凡触碰全局路径的测试一律 `vi.mock('node:os')`（N4 单点，`vi.hoisted` + `beforeEach` mkdtemp + `afterEach` 删，保留 `...actual`）；禁止保存/恢复伪隔离；反例汇总 `init`/`identity`/`flow`/`plan` 四处 |
| REV 可信度声明与独立复核 | 2026-09-29 | 保留原文 + 追加可信度声明 + 独立复核；可疑产出降级「待复核」禁止继承推进；四条取证纪律（异常即中止 / 不继承 / 命令行优先 / 三要素可复现）；stage-48 已上溯为 agent 模板前置规则 |
| 测试隔离的「干净机器」验证法：模拟首次使用 + 对照实验证明 mock 是唯一屏障 | 2026-09-29 | 本机未触发时两步：① 临时移出真实全局文件使 `isFirstUse()` 为 true → 隔离运行断言未重建 + try/finally 复原；② 对照实验（仅移除 mock 块）证明 mock 是唯一有效屏障（排除假通过） |
| 环境哈希守卫（CI 层）：前后快照 + ABSENT→ABSENT 不误报 + 只比 hash 不比 mtime | 2026-09-29 | 三目录（存在性 + 清单 + 逐文件 sha256）被测命令前后 diff；ABSENT→ABSENT 通过、只比 sha256（防 touch 误报）、可捕获内容变/新增/删目录；快照点紧贴被测命令；本地抽脚本演练 6 场景 |
| 整仓全量审查的单元划分与覆盖矩阵方法 | 2026-09-30 | 实测 `src/**/*.ts` 全 62 文件，纵切单元（U1/U2/U3/U4/U8）+ 横切单元（U5/U6/U7），「全量映射自检表」验证 18+23+7+2+12=62 全覆盖无重复；横切与纵切互相引用、同文件切分边界；计划审查先核 MECE（部署链路无归属即 blocking） |
| 全量审查的发现分类与流转裁定 | 2026-09-30 | 四类流转（blocking 当阶段修 / non-blocking 补丁阶段按「内部模式一致性」分批 / 文档归归档官 / 历史只读）；跨单元重复合并（M1~M5）；跨单元矛盾显式裁定（U4 全量 vs U6 抽查，以全量为准）；设计取舍与低收益项明确不修附理由 |
| 全量审查的结论复核纪律 | 2026-09-30 | blocking 逐条隔离 fixture 独立复现（不继承单元结论）+ 非阻塞随机抽验；结论附「命令+版本+环境」三要素；REV 可信度声明原文保留不删；U8 过程偏差（遗漏隔离 env 写真实 update_state.json）如实留痕 + 整改要求 |
| `--dry-run` 必须字节级不写盘 | 2026-09-30 | 契约＝内容/mtime/revision 全不变；陷阱＝dry-run 分支前的 autoRepair/save()/checkpoint/appendLog 先写盘；修法＝核心方法增 `{dryRun}` 只算不赋值 + 命令层仅非 dry-run 才 save() + 预览专用文案键 + 回归断言 |
| 死导出/漂移 API 的清理判据 | 2026-09-30 | 三判据（全仓零引用 + 值与真实状态漂移 + 经 exports 对外暴露）齐备即 blocking；处置删除而非同步（同步引入无人使用的公共 API 承诺）；一行删除 + dist 重建 + CHANGELOG Fixed + 回归断言，不升主版本 |
| 部署语境 vs 本仓语境的命令口径二分 | 2026-09-30 | 判据＝产物落点是否在用户项目之外：部署到用户全局→`openfeel <cmd>`；本仓执行→`node bin/openfeel.js <cmd>`；agent/agents-md/skill 三者须同口径；部署型 skill 需二态则文首统一声明；修复链改权威源 + build |
| 全量审查批量清理方法论 | 2026-09-30 | 按「同类机制内部模式不一致」分批（A~F）；每条给阶段内唯一 T 编号 + 来源/证据/影响/修法/优先级五列双向可追溯；用户裁定单独编号（R1~R6）回写 op + `deps.yaml` 后才实施；收口零空格子（有证据或显式不修/归档/登记留痕）；1 批 1 op、同热区串行 |
| 跨阶段「契约先行」协同 | 2026-09-30 | 先落地阶段定义单一 owner；接口形态写到**函数签名级**（`findSimilarEntries(target, category, basePath?)`）；`deps.yaml` `downstream_contracts` 事前硬约束；收口 `rg` 验证「定义 1 处 + 调用 ≥2 处」；形态写不成签名级即未收敛，不进下游复用 |
| CLI 退出码语义 | 2026-09-30 | 门禁命令发现问题**非 0 退出**（静默通过最危险）；**不设逃生阀**（忽略应由调用方 `\|\| true` 显式表达）；用 `process.exitCode = 1` 而非 `process.exit(1)`（防 stdout 截断）；退出码对齐 并发 2 / 通用 1 / 成功 0；行为变更须 CHANGELOG + docs/manual/README 同步 + 双证据验证 |
| 命令面收敛与弃用策略 | 2026-09-30 | 保留语义更完整方，弃用方收敛单点函数 + ID 单点分配；弃用提示仅 TTY stderr（非 TTY 静默）；CHANGELOG Deprecated 写「下版本移除」+ 登记项清单成文；陷阱＝`help.<path>` 域键覆盖 `.description()`，须与 desc 键同批改 |

| 孤儿检测与安全清理模式：键孤儿 vs 文件孤儿二分 + 默认只报告 + 显式 --prune（单向） | 2026-10-01 | 声明↔实体漂移须二分检测（键孤儿可清 / 文件孤儿永不自动删）；`flow repair` 默认只报告零写盘，`--prune-orphans` 仅清键孤儿，`findOrphanOps` 单实现供 repair/health 共用；health 孤儿 warn 不改退出码；`plan scheme remove` done/checkpoint 保护 + 只删键不删文件 |
| 幂等写入模式：同值 no-op 成功 + 按需备份（先探测后写） | 2026-10-01 | 写前纯读探测三态 not-found/unchanged/will-change；unchanged → exit 0 + no-op 提示 + 不生成 `.bak`；备份从「无条件」后置到「确认变更后」；「字段缺失」与「值未变」语义分离（旧实现混判致幂等脚本误失败） |
| 「未来写入统一 + 历史共存」渐进收敛策略：不迁移历史 + 索引兜底可检索 | 2026-10-01 | 两套布局并存时只统一未来写入（单一实现 + 注释约定 + 全仓 rg 无第二处），不迁移/不改写历史目录；索引同时反映两套布局 + 布局标注 + 历史兜底条目（不为历史目录补建 day_index）；`migrate --dry-run` 明确无迁移项；目标是「未来一致性」而非「历史纯净」 |
| 暴露内部模块为 CLI 子命令的判据：零引用 + 下游真实需求 → 接线（只读）而非删除 | 2026-10-01 | 零引用 ≠ 死代码；对下游有价值则暴露为 CLI 子命令（随包分发，`npm pack` 实证）；命令层只传参、核心层单一解析（`--project` 注入 basePath）；只读建议不自动改写数据；模板引用同步 + build |
| 索引 + 主题文件的分层记录模式：≤5 主题 / ≤5 条×100 字 / ≤10 条×300 字 / 超量转 tmp 记地址 | 2026-10-01 | 单文件状态改「索引 + 同名主题目录」；硬约束逼出下沉；英文 kebab-case 文件名 + 索引显示名可中文并给路径唯一对应；超量外置 `tmp/` 只记地址；超期不归档；超限就地收敛；实证 dev_last 53→34 行 + 5 主题 |
| 就地收敛而非归档：尊重「超期不归档」约束的主题上限策略 | 2026-10-01 | 主题数 >5 时优先合并同类；无可合并则最旧已完结主题降为「已收敛主题」一行摘要（≤100 字 + 路径 + 日期），文件就地保留不迁移不归档；边界区分 内容外置（R2，允许）≠ 索引收敛（R4）≠ 文件归档（❌）；判据「索引收敛 + 文件原地保留」 |
| 短名/全名 stage 解析归一化的统一范式：调用点归一化 + 双键回退 + 闭包式全量扫描 | 2026-10-01 | 唯一来源 `normalizeStageId`；`const key = normalizeStageId(input) ?? input` + `stages[key] ?? stages[raw]` 双键回退；命令层归一化供文案/防御、核心层出口归一化一次覆盖多消费点；禁止自写解析；凡 `stages[...]` 索引点/`startsWith(stageId)` 前缀比较且入参可能为短名即须归一化（数据派生点除外）；stage-52 实证 10 处收口 |
| CLI --json 结构化输出约定：顶层对象 + schemaVersion + 纯 JSON 单文档 | 2026-10-01 | 各命令输出自身领域对象 + `schemaVersion:1`，不强行同构；既有键只追加不改；无 ANSI/提示行、与人类输出互斥；文案入 i18n；B9 实证 PowerShell 直接管道捕获 gb2312 失真属消费端（建议重定向文件 / `JSON.parse` / pwsh 7 设 UTF-8） |
| 「只报告型」与「修复型」命令的边界：默认零写盘 + 显式 --fix 仅回写可对账字段 | 2026-10-01 | `health` 默认只报告、显式 `--fix` 才回写；以 flow.json 为权威**仅回写 status.md「状态」字段**（同语义派生），执行模式/自动推进/任务/记录等独立字段绝不触碰；`--fix --dry-run` 预览零写盘 + 幂等；不做 advance 自动同步（批量校正覆盖存量） |
| 两阶段状态 draft/publish 的窄兼容设计：扩取值域 + 未发布隔离 | 2026-10-01 | 新增 `draft` 状态扩取值域向后兼容；未发布隔离（health 不报空模板 / advance·统计·归档不计入 / ops list 分组 / **attempt 拒绝**双层守卫）；`publish` 校验非空转 `pending`；每新增状态须逐一回答各路径如何对待 |
| 多步推进的 REV 阻塞复检：论证等价为主 + 每步复检加固 | 2026-10-01 | `addAutoFixReview` 恒置 `status='resolved'` 且仅由 `addReviewEntry` 调用、advance 路径不建 review → 多步不会带入新 blocking（论证等价）；仍把命令层检查抽 `assertNoBlockingOpenRev` 每步复检加固（防实现细节漂移）；保护正确性依赖实现细节时「论证 + 低成本复检」双落地 |
| `null` 语义分歧作为已知边界：同源数据 + 不同消费语义 → 登记而非扩契约 | 2026-10-01 | `readOpTemplate` 返回 `null` 时 health「跳过不报」vs ops list「判 filled 静默乐观」；实测**同源**（同 `opsMap`/同 `readOpTemplate`，短名 HIT）→ 推翻「检测来源分叉」，真实缺口 = `null` 语义分歧（同向漏检）；A9 登记为已知边界（注释 + manual + 断言锁定短名路径），**不扩展** `detectFillState`/`--json` 契约 |
| REV/缺陷状态收口的分层口径：清账层 / 历史层 / 无法判定 + 脚本实时重跑 | 2026-10-01 | 计数三坑＝编号格式混合（`REV-U2-001` 等被 `^## (REV-\d+):` 漏计）/ 状态行冒号双形 / 时点漂移；分层＝清账层（当前版本 pending，全覆盖含非连续编号）/ 历史层（仅登记）/ 无法判定（单列附原始行，不得丢弃）；判据＝固化可复现脚本 + 分层定义 + 实时重跑，分歧先查口径再查结论 |

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
| 并发写入竞态排查 | 2026-09-12 | 无锁 RMW 丢失更新、max+1 重号、.bak 被新内容覆盖、裸 writeFileSync 半写、Windows rename/unlink 容错；排查动作：共享写点加锁+原子写、parse 仅解析文件名、.bak 写前复制、并发子进程验证 |
| 模型名错误导致 Agent 无法启动 | 2026-09-25 | deepseek-v4-flash 已下线 → deepseek-flash；症状 Model not found；修复须全链路（agent 文件 + 模板源 + 生成段 + config 常量），改后重启 opencode |
| opencode instructions 路径 ~ 不展开 | 2026-09-25 | debug config 输出保留字面 ~/...（展示层不展开），但加载层实际展开可加载；仍采用绝对路径（配置值层可读、跨平台无歧义）；指令型探针验证文件是否加载进 agent 上下文 |
| agent_manager_tool schema 未定义静默丢弃 | 2026-09-25 | experimental.agent_manager_tool 现行 schema 未定义，debug config 输出空且无报错 exit 0；静默丢弃比报错更危险；实测确认后移除该字段 + 删模板 experimental 块 |
| malformed 标记死循环排查：多对/不成对标记的降级策略 | 2026-09-25 | malformed 状态无法定位唯一受管区，追加/替换会每次重触发判定形成死循环；修复为不写盘+记 anomaly 去重；手动修复成单对完整标记后自动走正常路径；none 与 malformed 降级路径不同 |
| migrate 中途失败排查：异常路径提示 + manifest 回填 + rollback 清理 | 2026-09-25 | 全局部署中途异常致「半迁移」；修复=命令层 try-catch 输出「可 rollback 回滚」+ manifest.globalStateKeys 纳入 finally 回填 + splitUpdateState 复用全局 state；关键中间态须写入幂等可读 manifest |
| opencode 模型解析优先级排查：frontmatter 覆盖 jsonc agent.model | 2026-09-25 | frontmatter 覆盖 opencode.jsonc agent.model（与「jsonc 更权威」直觉相反）；REV-1606 实测优先级链「项目 agents frontmatter > 全局 frontmatter > 项目 jsonc > 全局 jsonc > 默认」；只改 jsonc 会被 frontmatter 遮蔽；skill L43 旧说「声明性」已过时 |
| opencode 全局 AGENTS.md 加载排查：自动加载 YES / 并存拼接 / 移除 instructions 仍生效 | 2026-09-26 | 实测全局 AGENTS.md 自动加载 YES（项目 opencode.jsonc 为 {} 时仍加载）、全局+项目并存拼接不覆盖、移除 instructions 后约束仍生效；指令型探针验证加载；隔离 HOME 不污染真实配置 |
| flow phases 自描述 phase 与 flow advance 接受集合不一致（第二信源残留） | 2026-09-29 | 转移表已同源但 phase 合法性判定仍硬编码 PIPELINE_PHASES；自定义 pipeline.yaml 新增 phase 时自描述宣称可达而 advance 拒绝；排查=对比两集合 + rg PIPELINE_PHASES 使用点；避免=补边界说明或收敛校验源 |
| 新增 i18n 键已定义却未接入（死键） | 2026-09-29 | lint i18n 只查 zh/en 对称性不查引用；common.stageDirConflictTmpl 零引用致 en 下仍输出中文；排查=提取新增键逐键 rg；避免=同提交内接入调用点 + rg 引用兜底 |
| kb-dedup 去重检索对 CRLF 行尾静默失效 | 2026-09-29 | parseKbFile 的标题正则 $ 锚点在 CRLF 下失配（patterns.md 80 个标题仅解析 2 条），去重静默降级；排查=比对 CRLF 计数与命中数；避免=解析前 \r\n 归一 + 降级时改手动关键词匹配（**更新于 2026-10-01**：`openfeel knowledge dedup` 亦受影响；归档绕过法 = LF 归一副本 + `--project` 隔离运行） |

| writeDefaultConfig 无条件覆盖：npm test 静默改写真实 config.yaml | 2026-09-29 | 实现层无 existsSync/备份整体覆写 + 测试层 init.test.ts 未 mock cwd → npm test 覆写仓库三值（hash 5229455D→23F76595）；诊断＝git log 该文件 + hash 前后比对 + 单文件复现；避免＝测试隔离 + 反向守卫 + 覆写前备份合并 |

| 需求/文档记载的根因判断须实测复核（opencode 权限「顶层 permission 不生效」误判） | 2026-09-29 | 需求文档 §二.2「`external_directory` 不继承顶层 `allow`」在 1.18.33 上**不成立**（顶层 `*:allow` 经 `findLast` + 通配生效）；§二.1 属过度概括；§五镜像方案无效；排查=隔离实测 + 行为级判别器 + 对照组，冲突时停下上报并如实记录「未复现」，转审查/归档勘误 |

| 多源文案同步陷阱：模板权威源与仓库根手维护文件双份同句易只改一处 | 2026-09-29 | `templates-data/agents-md/*`（setup 部署源，用户可见度最高）与仓库根 `AGENTS.md`（手工维护）语义同句但无单一源约束；`build.js` 不写根 AGENTS.md → 改一处不触发任何失败（`templates/BUG-002`）；排查 `rg "关键句" src/core/templates-data AGENTS.md` 双源比对；避免=同批核对两侧/加一致性断言/文案变更收尾必做全仓 rg |

| 「备份失败绝不覆盖」的失败路径语义分叉：受管文件跳过继续 vs jsonc 直写整体中止 | 2026-09-29 | 同一需求两条链路行为不一致：`writeManagedFile`/`init` 备份失败→跳过该文件 + `anomaly(note='backup_failed')` + 命令继续（exit 0）；全局 `opencode.jsonc` 三处直写→`BackupError` 上抛中止（exit 1）。根因＝**方案伪代码缺口**（非实现偏差）。可裁定为非阻塞 fail-fast（数据无损 / state 自愈 / 失败响亮）；唯一实质偏差＝「部分部署 + exit 1」。排查＝per-file 比对错误处理 + 同一故障注入（备份根构造为文件→ENOTDIR）分别跑两链路；对齐 A（补 try/catch 统一口径）或 B（文档化为有意设计），禁止直接改成静默半完成。**更新（stage-47）**：已按混合裁定落地——`setup`/`update` 取 A（仅捕获 `BackupError` → anomaly + 跳过 jsonc 写 + 继续），`migrate` 取 B（保留 fail-fast + 文档化） |

| 测试以「保存/恢复」代替 homedir mock：直写真实全局目录的伪隔离（隔离审计四步法） | 2026-09-29 | `identity.test.ts` 未 mock `node:os`，以「读原内容 → afterEach 写回」操作真实 `~/.openfeel/config.json` → `npm test` 改写其 mtime 而哈希不变、**无任何告警**（`config/BUG-004`）。**审计四步**：① 记真实对象 mtime + SHA256 基线；② 跑全量 `npm test` 复测（**哈希不变但 mtime 变化**＝被写过又还原，铁证）；③ 二分定位（`npx vitest run test/core/<子目录>` 缩到单文件）；④ 反证（`USERPROFILE`+`HOME` 重定向后不再触碰 → 走了未 mock 的 `os.homedir()`）。避免：必须 `vi.mock('node:os')`；保存/恢复**不是**隔离手段；把「mtime + hash 双比对」列为验收固定项；历史残留 455 条死映射单独评估清理 |

| 裸跑 `openfeel` 命中 PATH 全局旧版 CLI：门禁数字与行为口径被环境污染 | 2026-09-29 | `openfeel lint i18n` 在审查会话输出 **502**、执行会话 **531** → 一度误判 executor 报告「数字错误」。根因＝裸跑 `openfeel` 命中 PATH 上全局 npm 旧版（`AppData\Roaming\npm\openfeel.ps1`，v1.1.1，旧 i18n 键集 502），本仓 `node bin/openfeel.js` 为 v1.1.2（531）。**诊断**：`Get-Command openfeel` / `openfeel --version` / `node bin/openfeel.js --version` 三行比对。**后果**：数字口径错误 + 行为口径错误（旧版缺新命令/校验/键 → 假阴性/假阳性）且**静默无报错**。**避免**：仓库门禁统一 `node bin/openfeel.js`；引用数字注明命令与版本；不一致时先比二进制；误判如实改写并撤销连带结论（stage-47「微瑕」已撤销） |

| 长版本多阶段流水线的两类「伪信号」：审查会话幻觉 与 验收动作自身污染基线（v1.1.2 复盘） | 2026-09-29 | **类一 审查幻觉**（v1.1.2 两轮自认）：未经实测的断言措辞确凿、无命令证据（行号漂移 / 清单遗漏 / 二进制误判）。防线＝断言必附可复现命令 + 可信度声明 + **新会话独立复核** + 原文保留不删、追加复核结论 + 审查官显式自我更正。**类二 验收污染基线**（真实事故）：`npm test` 覆写仓库真实 `config.yaml`（stage-42 REV-011）与真实 `~/.openfeel/config.json` 的 mtime（`config/BUG-004`）。铁律＝**验收命令本身也是被测对象**（跑前记 SHA-256 + mtime 基线，跑后比对；保存/恢复≠隔离）；防线＝测试隔离 + 反向守卫用例 + 隔离 HOME 端到端。判决：**门禁可信度优先于门禁数字**（命令 + 版本 + 环境三要素齐备方可采信） |
| 真实环境一次性数据清理规范：末段匹配 + 计数断言 + 四步保护 | 2026-09-29 | `~/.openfeel/config.json` 死映射清理：键为绝对路径、前缀在末段 → 必须末段匹配（字面前缀 0 命中会假性通过）；断言删除数恰为预期 + 剩余为 0；四步保护（隔离副本试跑 → 时间戳备份 → 执行 → 复核可还原）；解析失败中止不写盘 |
| 随包 postinstall 在用户端路径层级失效 | 2026-09-30 | 包内脚本假设 `rootDir=resolve(__dirname,'..')`，用户端依赖提升后目标多一层 → 「文件不存在，跳过」×2 + EXIT=0 静默；`engines` 与依赖要求不符放行崩溃区间；避免＝删除随包 postinstall（就地改写第三方包反模式）+ engines 收紧，包内 `.npmrc` engine-strict 对消费者无效 |
| 配置键白名单须 schema 驱动 + 值类型归一 | 2026-09-30 | 白名单硬编码单键时 boolean 键被拦截不可达→掩盖「字符串原样写入」缺陷；扩全量 `defaults.*` 后首次可达 → `z.boolean().parse("true")` 崩溃。修法：白名单从 Schema 取 keys + 写入前按字段 schema 归一（逐层解包 `instanceof z.ZodBoolean`，**zod v4 无 `_def.typeName`**）+ 枚举非法报错**不写盘**（hash/mtime 不变）；`set/get/effective` 三口径一致；归一是扩白名单前置条件 |
| prompt 级协议 vs 代码级强制：自动归档/就地收敛/加锁无运行时强制 | 2026-10-01 | 规则只写 agent 模板/skill（prompt 层）时源码 `src/**` 无实现，可靠性依赖模型遵循、失败静默；识别用 `rg 关键词 src/**`（仅命中 templates-data 即属 prompt 协议）；缓解＝显式声明边界 + 关键规则落代码护栏（并发 fixture）+ 文本断言守护 + 人工复核点 |
| 空模板检测纯子串匹配误报：正文引用占位标记即被误判未填充 | 2026-10-01 | `content.includes('- [ ] 待补充')` 纯子串判定（`isTemplateEmpty`/`detectFillState`/`publishScheme` 三处）→ 正文引用即命中：publish 误拒（exit 1）+ ops list 显示 (empty) + health 误报（本仓 op-005）；排查 `rg "EMPTY_TEMPLATE_MARKER|待补充"`；修法＝整行/列表项结构匹配 + 回归断言（`cli/BUG-005`）。**更新（stage-54 op-001）**：**已修复**——整行锚定正则 + `scheme.ts` 复用单一来源，仓库空模板告警归零；判据升级＝占位符/标记类检测**默认整行锚定** |
| 即席实测误在仓库 cwd 执行真实命令：fixture 前须显式断言 cwd | 2026-10-01 | 误在仓库根跑 `openfeel archive` → flow.json 被写（+1 日志 / rev 441）+ 误产物；即时回滚经独立核验无数据损坏；裁定：误跑=违反隔离硬要求（整改：`Push-Location` + 断言 cwd + 事故留痕）、回滚=合规应急；建议用 `git checkout`/`.bak` 恢复减少手工编辑 |
| 同类缺陷须一次全量扫描而非逐个暴露：stage 解析归一化三轮修复教训 | 2026-10-01 | stage-52 归一化分三轮（op-012/013/014，共 10 处）每轮「又发现一处」；同族缺陷按点状报告逐个修必留尾；可操作＝先界定缺陷类判据 → `rg` 全量枚举候选点 → 同批修复 + 「无第 N+1 处」独立扫描收口；判据：收到同族报告默认扫描整个类，收口以全量扫描无残留为准 |
| 新增输出键/契约的同步面清单：i18n help + docs + manual + kb + 部署型 skill 模板 | 2026-10-01 | 同族三次（`cli/BUG-003` stage-48 / stage-52 observation / `cli/BUG-003` 复发 + `templates/BUG-005`）；根因＝同步面多载体且无单一源/一致性断言（`lint i18n` 只查对称性、build 只传播不校验内容）；排查＝取真实键集合对每个载体 `rg`；避免＝按清单逐项收口（**部署型 skill 模板最易漏**）+ 关键键名全仓 `rg` |

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
| 2026-10-01 | 归档 | **stage-54 归档（收尾 — 遗留缺陷清理·发布前清账）**：3 op（`740a79d`/`8fd49af`/`35278b4`）。**E1** `cli/BUG-005` 空模板检测由**纯子串**改**整行锚定**（`EMPTY_TEMPLATE_LINE_RE` + `scheme.ts` 复用单一来源）→ `publish` 误拒 / `health`·`ops list` 误报消除、仓库空模板告警**归零**；**E2** `cli/BUG-006` en blocking REV 拒绝文案 i18n（`flow.advance.blockingRevRefused`/`blockingRevHint`）；**E3** `cli/BUG-003` `flow phases --help` 补 `transitionsDiff`（**JSON 契约未变**）；**E6** 全仓 REV pending **分层统计**（总 270 / 清账层 38 / 历史层 88 / 无法判定 3）+ 清账层收口 **closed 31 / 维持 pending 7**；`bugs/index.md` 统计修正。门禁：`npm test` **59 文件 / 987 用例（0 skipped）**、`tsc` 0、build 幂等、`lint i18n` **726 键**、`lint kb` 0 过期（265 引用）、`flow health` 空模板 0；环境零污染。审查三段零阻塞（**REV-001 medium blocking / REV-002 low 全 closed**）；测试官端到端 + 分层独立复算 + 污染零 diff 全通过；`cli/BUG-005`/`cli/BUG-006`/`templates/BUG-003` **关闭**、新登记 `templates/BUG-005`（low）；知识沉淀 **4 条**（patterns 2 新增 + troubleshooting 2，含 1 条更新） |
| 2026-10-01 | 归档 | **stage-52 归档（反馈 09 可编排性/可观测性 + 遗留清账 + 约束体系精简）**：14 op（主链 11 + 修复轮 op-012/013/014；commits `c6d89f6`~`facf825`/`6abd4fb`/`820855b`/`9e56c45`）。交付 **B1~B9**（`--json`×6 含 `schemaVersion` / `health --fix` 仅「状态」字段 / `ops list` 填充度 / `draft` 两阶段窄兼容 / `advance --to` 自动逐步 + 每步 REV 复检 / `scheme rename` / `NO_COLOR` / **L8 `kb-dedup` CRLF 修复**〔2→105 / 0→31〕）+ **A4 移除 `view add`**（破坏性 + CHANGELOG `Removed`）+ **C1~C4 约束精简**（14→17 Skill）+ **stage 归一化闭包 10 处收口**（无第 11 处）。门禁：`npm test` **59 文件 / 979 用例 0 skipped**、`tsc` 0、build 幂等、`lint i18n` **724 键**、`lint kb` 0 过期；环境零污染。审查三段零阻塞（**REV-005~009 全 closed**）；测试官 14 项抽验全通过；新登记 `cli/BUG-005`（medium）/ `cli/BUG-006`（low）；知识沉淀 **8 条**（patterns 5 + troubleshooting 3）。**v1.1.2 十三阶段全部闭环**（stage-52 补齐） |
| 2026-10-01 | 归档 | **stage-53 归档（current.md / dev_last.md 职能与格式重构）**：5 op（commits `627805e`/`3792b77`/`ae0d6e2`/`4377822`/`27ce06e`），D1~D10 全落地。交付：**两条设计目的**（保存核心信息便于恢复 / 避免无关信息污染上下文）+ **三层分层**（索引/主题/详情）；`current.md` 新格式（团队文件、仅个人提交时更新、整体信息、无 agent 细节与 @成员段、≤5 条 + 旧记录归档 `current_archive/`）；`dev_last.md` 索引 + 同名主题目录（活跃主题 ≤5、索引 ≤5×100 字、主题 ≤10×300 字、超量转 `tmp/` 记地址、**超期不归档**、R1~R6 含 R4 就地收敛与 R6 加锁）；用户裁定 **A5/A6/A9/A10** 全落地（A5 内联 `@{username}`、A6 sync-status 改写保留 17 skill、**A9 加锁** `withFileLock`+`dev-last-{username}.lock` 读写均在锁内、A10 主题文件英文名）；**存量迁移零丢失**（归档全文超集、current 82→14、dev_last 53→34 + 5 主题、`DEV_SUB_DIRS` +`current_archive`）。门禁：`npm test` **59 文件 / 949 用例 0 skipped**、`tsc` 0、build 幂等、`lint i18n` 724 键、`lint kb` 0 过期。审查 REV-003 closed、三段零阻塞；测试官端到端 + 机检 + 并发（含无锁对照）+ 迁移零丢失全通过；新登记 `templates/BUG-004`（low，统计行陈旧，**归档官就地修正并留痕**）；知识沉淀 **5 条**（architecture 2 新增 + patterns 2 新增 + troubleshooting 1 新增）。**v1.1.2 十三阶段全部闭环**，全局产物须用户运行 `openfeel setup` 生效 |
| 2026-10-01 | 归档 | **stage-51 归档 + 本轮（反馈 08 全量处置）收尾（流水线状态维护与 CLI 可维护性）**：补齐「**纠正/清理侧**」CLI 能力 **N1~N11**（3 批次 H1~H3），9 op（commits `a008f69`/`5ebd114`/`4fb86dd`/`3f46514`/`5d4ea6b`/`b59705a`/`b538bdc`/`1aba277`/`34385a4`）；**用户裁定全部落地**（**A2** 孤儿 op 默认只报告 + `--prune-orphans` 显式清理 + health warn｜**A5** op 文件名固定 `op-NNN.md`（标题入内容）+ **不做迁移命令** + `extractTitle` 兼容回退｜**A6 `kb-dedup` 暴露为 `openfeel knowledge dedup` 子命令并随包分发**（只读建议，`dist/utils/kb-dedup.js` 实证随包）｜**A7** 日志**仅统一未来写入** + 不新增历史迁移 + 索引共存说明）；关键实现：`plan scheme remove` + `findOrphanOps` 对账/health warn（N1）/ `flow stage set --deps` + `flow review update|remove`（N2）/ 抽 `ensureStageSkeleton` 消除「半注册」（N3）/ `recordAttempt` 复用 `syncCurrentOp` 单一 owner（N4）/ `stage set` 三态幂等 + 字段白名单 + `stage task --add`/`plan stage add --tasks`（N5~N7）/ `extractTitle` 新旧命名兼容回退（N8）/ knowledge 宽容解析 + `openfeel knowledge dedup`（N9）/ 日志未来写入统一 + `advance --quiet` 降噪（N10/N11）；**56 文件 / 869 用例全绿（0 skipped）**、`tsc` 0、build 幂等、`lint i18n` **649 键** exit 0、`lint kb` 0 过期（242 引用）、`npm pack` 263 文件含 `dist/utils/kb-dedup.js` 且无 `scripts` 目录；环境零污染（四路径 hash+mtime 双快照零 diff，仓库 `config.yaml` 三值不变）；审查**零阻塞零新增 REV**（REV-004 **closed**）；`cli/BUG-004` **关闭**（en `--help` Arguments 段 CJK 零命中，运行时 33 命令）；知识沉淀 **5 条**（architecture 1 新增 + patterns 4 新增 + troubleshooting 1 更新）；**v1.1.2 十一阶段（41~51）全部闭环**，`npm publish` 待用户决定 |
| 2026-09-30 | 归档 | **stage-50 归档（全量审查 non-blocking 集中清理·第二批）**：承接 stage-49 总报告 §五 流转裁定，**T1~T57 编号化清单**（6 批次 A~F：内部模式一致性 / 门禁与 CI 失效面 / 死代码与配置面 / i18n 与命令体验 / 测试质量与覆盖 / 模板与文档口径），7 op（commits `feae65e`/`b2cbad3`/`d546e0b`/`a4d70bd`/`bcb5353`/`f50960f`/`def6a33`）；**用户裁定 R1~R6 全落地**（R1 `lint` 非 0 退出〔无逃生阀〕/ R3 `config set/get` 扩全量 `defaults.*`〔schema 驱动 + 枚举校验不写盘 + 值类型归一〕/ R4 审查条目收敛单入口〔`view add` deprecated，下版本删除〕/ R2 `update_infos` 保守默认 / R5 覆盖补 4 项 / R6 coverage 报告不阻断）；关键实现 **`syncCurrentOp` 单一 owner**（T1，供 stage-51 N4）/ **`kb-dedup` `basePath` 参数化**（T8，供 stage-51 N9）/ lint 退出码（T17）/ `transitionsDiff`（T19）/ 死代码删除（T22，`utils/path.ts`）/ config 白名单 schema 驱动（T36）/ 双入口收敛（T37）/ 部署型 skill 双口径（T53，5 skill）；**54 文件 / 790 用例全绿（0 skipped）**、`tsc` 0、build 幂等、`lint i18n` 560 键 exit 0、`lint kb` 0 过期（237 引用）exit 0；环境零污染；`templates/BUG-003` 关闭；新登记 `cli/BUG-004`（low，en argument 描述仍中文）；知识沉淀 5 条（patterns 4 + troubleshooting 1）；REV-002/003 已修正、REV-004（low）归下版本 |
| 2026-09-30 | 归档 | **stage-49 归档 + 本轮收尾（整仓全量审查 + blocking 修复）**：8 单元 MECE 覆盖 `src/**/*.ts` 全 **62** 文件；原始发现 **73** 条 → 去重 **68** 条，**blocking 4 条全部独立复现成立并修复闭环**（B1 `flow advance --dry-run` 写盘 → `autoRepairInconsistency({dryRun})` 预览模式 + `flow.advance.autoRepairPreview` 预览专用键；B2 `plan stage add --deps` 悬空依赖 → 命令层 `normalizeStageId` 归一化校验 exit 1 + `flow health` `checkDanglingDeps` warn；B3 删随包 `postinstall` + 删补丁脚本 `patch-inquirer.js` + `engines >=20.17.0`；B4 删 `src/index.ts` `VERSION` 死导出 + dist 重建），commits `3f023e3`/`1a8546a`；**41 文件 / 716 用例全绿**、`tsc` 0、build 幂等、`lint i18n` 533 键、`lint kb` 0 过期；离线安装实测（`npm pack` 259 文件）、真实环境零污染；REV-001~007 全 closed（exec_review 零阻塞、零新增 REV）；~40 条 non-blocking 裁定流入后续补丁阶段；知识沉淀 7 条（patterns 6 新增 + troubleshooting 1 新增）；文档类修复（`docs/commands.md` / README×3）由归档官落地 |
| 2026-09-29 | 归档 | **stage-48 归档（v1.1.2 事件加固 + 遗留问题修复）**：三大过程事件机制加固——事件 A（reviewer 模板双语四条纪律 + `feel.md` 健康探测 + H12 可疑产出降级）、事件 B（两测试补 `vi.mock('node:os')` + 「干净机器模拟 + 对照实验」+ CI 环境哈希守卫 6 场景）、事件 C（执行型口径统一 `node bin/openfeel.js` + CI 版本门禁双 job）；遗留 13 项全部落地（含 **455 条死映射 455→0** 与 `profile.yaml` 健壮性）；7 op，**41 文件 / 706 用例全绿**、`tsc` 0、build 幂等、`lint i18n` 531 键、`lint kb` 0 过期；REV-001~008 closed；知识 4 条（patterns 2 + troubleshooting 1 + 1 批注）；新登记 `templates/BUG-003`（low 非阻塞，建议并入 stage-49） |
| 2026-09-29 | 归档 | **stage-43 归档 + v1.1.2 版本级收尾**（CLI 文档 skill 化与版本收口）：① **新增 `openfeel-cli-usage` skill**（权威源 `templates-data/opencode/skills/openfeel-cli-usage/SKILL.md`，扁平单文件中文单语 + `description` 含查询触发词 + **快照声明**「以 `openfeel <cmd> --help` 实时为准」+ 15 phase 枚举与转移表 + stageId 约定 + 与 `openfeel-wizard` 边界互引；build **双注入**（`update.ts` / `template-loader.ts`）+ **自举** .opencode/skills/，`build.js` 零改动）+ skill 计数同步 **14 处**（含 `expectedSkills` 白名单）；② **版本 1.1.2 全链路收口**：A1~A8（含 `agents-md/{zh-CN,en}` 权威源、仓库根 `AGENTS.md` 漂移 v1.1.0→1.1.2、`package-lock.json` root **手工同步两行**零依赖树变动）+ B 生成段经 build 重生成（幂等）+ C `CHANGELOG.md` `[1.1.2] - 2026-09-29` + 全局传播 + D/E 未误改；③ `docs/commands.md` 新增 `## config` 节 + `AGENTS.md` 命令清单 4 条 + skill 指向 + wizard 交叉引用；④ **`config/BUG-004` 修复**：`identity.test.ts` N4 单点 `vi.mock('node:os')` + 删 `savedConfig` 伪隔离 + 只读隔离守护用例（真实 `~/.openfeel/config.json` mtime+SHA-256 前后不变）；⑤ `REV-44` 归属闭环（REV-001/003 归归档官、REV-002 本阶段落地）。实现 commit `cbc606f`，5 op，**41 文件 / 694 用例全绿**、`tsc` 0、`npm run build` 幂等、`lint i18n` **531 键**、`lint kb` **0 过期引用（归档后 224 引用；阶段内 195）**；REV-001~006 全 closed（**blocking：REV-004** `REV-44` 三项 pending 归属遗漏，最后阶段不落地即永久丢失）；**REV-006 终裁**：`lint i18n` 502 系 **PATH 全局旧版 CLI** 输出（环境污染），531 为本仓真实键数，连带撤销 stage-47「微瑕」判定；Bug：`config/BUG-004` **closed**（测试官外部独立进程比对）+ 新登记 `cli/BUG-003`（low，非阻塞，归下一版本）；知识沉淀 **4 条新增**（patterns：CLI 用法 skill 化模式 / 版本号全链路收口清单；troubleshooting：PATH 全局旧版环境污染 / 版本级两类伪信号）；manual 更新 `index.md`（skill 体系登记）+ `cli/commands.md`；**v1.1.2 七阶段（41/42/44/45/46/47/43）全部闭环，`npm publish` 就绪** |
| 2026-09-29 | 归档 | stage-47 归档（v1.1.2 已登记缺陷集中清理）：**`config/BUG-002`（high）语义修复** —— `init` 对已存在 `.openfeel/config.yaml` **不再覆盖**（`configExisted` 分支仅 `skipped.push` 提示 + 命令层 `init.skipped` zh/en 可见提示），**删除 stage-46 的 `config.yaml` 备份接入块**（保留 `package.json` 备份块），`writeDefaultConfig` 增调用方守卫契约注释；`config/BUG-003` 画像层改「文件真实存在 + 原始 YAML 显式声明 `preferences.auto_advance`」双条件（来源落 `builtin`）；`cli/BUG-001` `flow phases` 增边界说明 + `--json.advanceAccepted`（内置 15）使「存在视图 vs 推进白名单」**可编程消费**；`cli/BUG-002` 新增 `StageDirConflictError` + 三入口 i18n 分流（死键消除）；`archive/BUG-001` `merge.ts:85` `Array.isArray` 守卫；`save()` `meta ??=` 守卫；**`removeStage` 事务顺序**（不再删目录，返回 `purgeTarget` 由命令层在 `save()` 成功后 `rmSync`；日志 `detail.purged` → `detail.purgeTarget`）；jsonc 备份失败 **A/B 分流**（setup/update 跳过继续 + `anomaly(backup_failed)`；migrate 有意 fail-fast + 文档化）；`agents-md:112` 泛化（build 幂等）；`architecture.md` 中退役 `core.md` 路径改为历史语境（`lint kb` 归零）+ 计划文本「三处/四处」残留清理；实现 commit `2fb38fa` + `0ebb17c`；7 op，**41 文件 / 693 用例全绿**（685+8）、`tsc` 0、`npm run build` 幂等、`lint i18n` 531 键、`lint kb` **0 过期引用（178 引用）**；5 REV 全 closed（含 2 条 blocking：REV-001 并行组修正、REV-002 BUG-002 修复指令补全），代码审查零阻塞（唯一微瑕：报告 `lint i18n` 键数 531 vs 实测 502）；**Bug 6 条 closed**（cli/BUG-001、cli/BUG-002、archive/BUG-001、config/BUG-002、config/BUG-003、templates/BUG-002，测试官隔离端到端验收）+ `config/BUG-001` 复核维持 closed + **新登记 `config/BUG-004`**（medium，`identity.test.ts` 保存/恢复伪隔离，非阻塞，**裁定归 stage-43**，含 455 条历史死映射观察）；知识沉淀 7 条（patterns 新增 3：写策略按资产归属二分 / 存在视图 vs 推进白名单 / 事务顺序；troubleshooting 新增 1：保存/恢复伪隔离 + 隔离审计四步法；另有 9 处既有条目「更新于」批注消除过时结论）；manual 更新 `core/{init,flow-manager,config,backup}.md` + `cli/commands.md` + `index.md`（维护规则） |
| 2026-09-29 | 归档 | stage-46 归档（v1.1.2 部署覆盖前自动备份 + 全局状态文件提示）：新增 `src/core/backup.ts`（`~/.openfeel/backup/{ts}/` 分区 + `manifest.json` + 单锁临界区 + 撞名绝不覆盖 + 备份失败绝不覆盖）+ `update_infos.md` 第三类 `backed`（短前缀读侧分类、旧行兼容）+ 四链路接入（`writeManagedFile` 三改写分支 / 全局 `opencode.jsonc` 三处 / `init` 的 `config.yaml` 与 `package.json`）+ `deployGlobalAsset` 破坏性签名变更（增 `command`，9 处调用点全改，tsc 兜底）+ `feel.md`（zh/en）启动检查规则扩为三类（含 `backupRel` 存在性检查与 `backup_failed` 分派）+ 备份断言测试；5 op，**685/685 测试全绿（41 文件）**、`tsc` exit 0、`npm run build` 幂等、`lint i18n` 502 键；审查 REV-001~010 closed、**REV-011（low，非阻塞）**＝jsonc 直写 fail-fast 与 B3「其余文件继续」语义分叉 → **裁定归属 stage-47**；Bug：本阶段 0 新增，`config/BUG-002` **仅缓解**（覆盖前备份 + 失败不覆盖，保持 open，语义修复归 stage-47）；知识沉淀 4 条至 patterns(3) + troubleshooting(1)；manual 新增 `core/backup.md` + 更新 `update-infos.md`/`update.md`/`global-paths.md` + `index.md` 维护规则补 backup 行 |
| 2026-09-29 | 归档 | stage-45 归档（v1.1.2 平台强限定内容「描述泛化」）：源码注释/命令文案/i18n 双语 7 键 + 模板权威源（`agents-md:3`、`feel.md:156`、3 skill 标注）+ 规则/文档/手册 24 文件（含用户点名处 `AGENTS.md:82`）+ 1 条泛化锁断言；**零行为变更**（`global-paths.ts` 8/8 全注释行、build 后零 diff、worktree 命令输出逐字一致，仅 4 个 `--help` 文案变化）；4 op，659/659 测试全绿（40 文件）、`lint i18n` 529 键；REV-001（low）closed、计划/方案/代码三段审查零阻塞；Bug：`templates/BUG-002`（medium 非阻塞，模板源 `agents-md:112` 权限落点行未泛化，归 stage-47）；知识沉淀 3 条至 patterns(2) + troubleshooting(1)；manual 由 op-003 同步 17 文件，归档官复核无需改动 |
| 2026-09-29 | 归档 | stage-44 归档（v1.1.2 权限模型修正）：9 agent × zh-CN/en 共 18 个权威源模板补 `external_directory: "allow"`（单值，隔离实测裁定）+ `openfeel-utility` 的 `write` → `edit`（实测 `write` 非授权键）+ 覆盖/合并语义文档化（根 AGENTS.md + agents-md 双语 + 新建 `manual/core/permission.md`）+ 权限断言测试（+6 例）+ build 重生成自举与生成段（零手改，二次 build 幂等）；5 op，658/658 测试全绿（40 文件）、`lint i18n` 529 键、`npm run build` 模板一致性 3/3；REV-001/002 closed、REV-003（low，归档处置）闭环；0 Bug；知识沉淀 3 条至 architecture(1) + patterns(1) + troubleshooting(1)。**实测（opencode 1.18.33）推翻需求原文 §二.2**：顶层 `permission: "allow"` 会覆盖 `external_directory`（`findLast` + `*` 通配），且 `write` 非授权键、`external_directory` 平台默认 `ask`、同名键 agent `.md` 优先（唯一项目级收紧入口=项目 `.opencode/agent/<name>.md`）；需求文档已追加「勘误与实测补充」节 |
| 2026-09-29 | 归档 | stage-42 归档（v1.1.2 配置口径与流水线状态正确性）：`auto_advance` 四级级联（status.md > 项目 config.yaml > 全局画像兜底 > builtin）+ `openfeel config effective`（有效值 + 生效来源，单一 resolver 无第二信源）+ `pipeline.phase` 全量 done 判定（空集守卫）+ 审计日志 register_stage/register_op 与 plan/scheme.ts 兜底冲突检测；5 op（含 REV-011 修复 op-005），652/652 测试全绿（40 文件）、`lint i18n` 529 键、`npm run build` 模板一致性 3/3；REV-001~004/010/011 全部 closed（REV-011 为 blocking，修复后 hash 前后不变 + 致败实验实证守卫有效）；Bug：config/BUG-002（high，init 无条件覆盖 config.yaml，实现层归 stage-46 REV-001）、config/BUG-003（medium，无 profile 时来源应标 builtin）；审查文件两处「可疑待重验」标注如实保留；知识沉淀 5 条至 architecture(1) + patterns(3) + troubleshooting(1)；manual 更新 core/flow-manager.md + core/config.md + cli/commands.md + manual/index.md |
| 2026-09-29 | 归档 | stage-41 归档（v1.1.2 CLI 自描述与可纠错能力）：新增 `openfeel flow phases`（phase 枚举 + 运行时转移表，展示与校验同源）+ `openfeel flow stage remove`（ops/current/deps 三道校验 + `--force`/`--dry-run`/`--purge` + current 兜底 + 审计快照）+ `plan stage add --deps` + stageId 校验/建议名/`(series, stageDir)` 冲突检测 + 三入口分层（`stage create` deprecated）；631/631 测试通过（39 文件）、`lint i18n` 525 键；REV-001~007 closed、REV-008/009 low 跟踪、3 个 low 非阻塞 Bug 登记（cli×2 + archive×1）；知识沉淀 5 条至 patterns(2) + troubleshooting(3)；manual 更新 core/flow-manager.md + core/plan-path.md + manual/index.md |

| 2026-09-26 | 归档 | stage-01 归档（v1.1.1 全局化彻底化改造）：移除 core.md 约束统一全局 AGENTS.md + 约束/操作分离（新增 openfeel-workspace/openfeel-tool-usage 2 skill）+ openfeel setup 纯全局部署 + init 拆 workspace-only + update 拆项目 AGENTS.md + migrate 清理 core.md（--clean-global-core-md），REV-2101 已修复，597/597 测试通过，BUG-001 已 closed，知识沉淀 4 条至 architecture(1) + patterns(2) + troubleshooting(1)，manual 新增 cli/setup.md + core/setup.md + 更新 init/update/migrate/index |
| 2026-09-25 | 归档 | stage-40 归档（v1.1.0 收官）：模型配置接口（`openfeel model` 命令组 + `model-config.ts` 内部 API 三层级读写 default/global/project），2 新增源码 + 2 修改源码 + 2 测试文件，REV-1606 优先级链实测勘误（frontmatter>jsonc）+ REV-1701~1704 已修复，591/591 测试通过，0 Bug，知识沉淀 3 条至 architecture(1) + patterns(1) + troubleshooting(1) + 修正 setup.md/skill 优先级矛盾；manual 新增 core/model-config.md + cli/model.md + 更新 global-paths.md。**v1.1.0 六阶段（35~40）全部闭环** |
| 2026-09-25 | 归档 | stage-39 归档：存量迁移与兼容收尾（`openfeel migrate` 命令 detectLegacy/备份/全局部署/state 拆分重键/清理/assignee/rollback + --dry-run + 存量读取兼容 P5/isLegacyFrameworkKey + 版本 1.1.0 收口），4 op（migrate 命令 + 存量读取兼容 + 文档/版本收口 + 全量回归），新增 migrate.ts + commands/migrate.ts，REV-1401~1405（1402/1404/1405 已修复，1401/1403 方案文档滞后已同步），569/569 测试通过，0 Bug，知识沉淀 4 条至 architecture(1 新增) + patterns(2 新增) + troubleshooting(1 新增) |
| 2026-09-25 | 归档 | stage-38 归档：控制区标记增量更新（managed-region 四策略 + 三态部署 + update_infos 双资产路径 + 会话启动修复规则 feel.md/core 双语），4 op（managed-region 工具 + 三态接入 writeManagedFile + 会话启动修复 + 测试），新增 managed-region.ts + update-infos.ts，writeWithMergeDetection → writeManagedFile，REV-1101~1104 已修复，545/545 测试通过，0 Bug，知识沉淀 4 条至 architecture(1 新增) + patterns(2 新增) + troubleshooting(1 新增) |
| 2026-09-25 | 归档 | stage-37 归档：全局部署架构（框架资产部署到 ~/.config/opencode/ + 项目精简 + 双 state + JSONC 深度合并 + 框架约束走 instructions 绝对路径 + schema/$schema/agent_manager_tool 修正），6 op（op-000 实测验证 + 全局路径模块 + init/update 改造 + P2 落地 + 测试改造），新增 global-paths.ts + opencode-config.ts，REV-801/802 已清理，493/493 测试通过，0 Bug，知识沉淀 5 条至 architecture(1 新增) + patterns(2 新增) + troubleshooting(2 新增) |
| 2026-09-12 | 归档 | stage-35 归档：并发保护基础设施（原子写 + 建议性文件锁 + 序号原子化三工具 + 高风险写入接入 + flow.json 乐观并发校验 meta.revision + .bak 语义修复），3 新增源码 + 13 修改源码 + 6 测试文件，457/457 测试通过（0 skipped），4 non-blocking REV 全闭合，0 Bug，知识沉淀 6 条至 architecture(2 新增) + patterns(3 新增) + troubleshooting(1 新增) |
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
