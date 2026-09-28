# 知识库索引

> 项目知识库总索引，按分类组织。Agent 加载 `check-kb` 技能时自动读取本文件。

## 项目快速概览

| 维度 | 内容 |
|------|------|
| 定位 | AI Agent 开发流程治理 CLI 工具 |
| 语言 | TypeScript (Node.js ≥20) |
| 核心依赖 | Commander, Zod, YAML, fast-glob |
| 源文件 | 61 个 .ts 文件（src/） |
| Agent 数 | 9 个（feel + 8 个 openfeel-* 前缀：planner/schemer/executor/reviewer/feel-tester/utility/vision/archiver） |
| 模块入口 | src/index.ts → src/cli/index.ts |
| 关键目录 | src/core/（流水线核心）、src/commands/（CLI 命令）、.opencode/agents/（Agent 定义，自举实例由 build 生成）、src/core/templates-data/opencode/（模板唯一权威源）、.openfeel/manual/（模块文档系统） |
| 最近更新 | 2026-09-29（stage-45 归档：平台强限定内容「描述泛化」——源码注释/命令文案/i18n 双语 7 键 + 模板权威源（`agents-md`/`feel`/3 skill）+ 规则/文档/手册 24 文件（含**用户点名处 `AGENTS.md:82`**）+ 1 条泛化锁断言，全部为描述泛化、**零行为变更**（`global-paths.ts` 8/8 全注释行 + build 幂等零 diff + worktree 命令输出逐字一致）；4 op，659/659 测试全绿（40 文件）、`lint i18n` 529 键；REV-001（low）closed、三段审查零阻塞；Bug：`templates/BUG-002`（medium 非阻塞，归 stage-47）；知识沉淀 3 条至 patterns(2) + troubleshooting(1)） |

## 分类概览

| 分类 | 文件 | 条目数 | 最近更新 | 用途 |
|------|------|:--:|------|------|
| 架构决策 | [architecture.md](architecture.md) | 25 | 2026-09-29 | 技术选型、设计理由、并行策略、多语言模板管线、i18n基建、日志聚合、Vision视觉官、CLI质量门禁、模块文档系统、计划目录分组、config meta.version 语义、跨进程并发保护架构、opencode agent/skill 合并语义、模板单源架构、全局部署架构、控制区标记增量更新架构、存量项目迁移架构、模型配置三层级架构、全局约束架构、全局宏观状态聚合语义、opencode 权限合并求值语义 |
| 代码模式 | [patterns.md](patterns.md) | 88 | 2026-09-29 | 项目约定、最佳实践、反模式、YAML增量、审查子维度扩展、全局用户画像、记忆生命周期、归档git提交、提示词审计、agents-md同步、Handoff委派、约束迁移、Checkpoint快照、组合终止条件、lint子命令组、i18n校验、kb健康检测、skill对齐、部署传播内容哈希比对、版本号语义、推理深度分档、模板同步、WORKSPACE_DIRS同步、审查纪律嵌入Prompt、写盘降级、passthrough保留、路径规范化、版本号重映射全链路同步、AGENTS.md变量替换、init/update重启提醒、update增量哈希追踪三态判定、任务类型路由、轻量决策边界、decisions.md 决策存储、stageId三格式解析、点号分隔符锚定、乐观并发校验、原子写、建议性文件锁、命名前缀统一与子串陷阱处理、P5 读取兼容、JSONC 深度合并、全局/项目双 state 路由、控制区标记模式、malformed降级防死循环、迁移命令模式、回滚边界模式、模型配置命令模式、约束/操作分离、纯全局部署命令、CLI自描述命令模式、破坏性命令安全校验清单、配置级联解析、审计日志双轨命名、测试 cwd 隔离与反向守卫、隔离 HOME 实测法、平台无关化描述泛化原则、零行为变更验证方法 |
| 排查经验 | [troubleshooting.md](troubleshooting.md) | 29 | 2026-09-29 | 常见 Bug、调试流程、已知坑位、autoRepairInconsistency 干扰组合条件、npm publish 404/403 诊断链、update_state.json 降级风险排查、双层模板源发散、stages→plan 收敛、并发写入竞态排查、模型名错误导致 Agent 无法启动、opencode instructions 路径 ~ 不展开、agent_manager_tool schema 未定义静默丢弃、malformed 标记死循环排查、migrate 中途失败排查、opencode 模型解析优先级排查、全局 AGENTS.md 加载排查、flow phases 与 advance 校验集不一致、i18n 死键未接入、kb-dedup CRLF 去重失效、writeDefaultConfig 静默覆写真实配置、文档根因须实测复核、多源文案同步陷阱 |
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
| 模板单源架构：templates-data/opencode 唯一权威源 + 双注入对象 + 单源一致性断言 | 2026-09-25 | 三对双层模板源收敛为单源；删除 agents/core-instructions 冗余树；双注入对象不合并（消费方不同）仅加单源一致性断言；.opencode/ 降级为构建产物（步骤8 自举重生成 + 生成物标记）；行尾归一 LF |
| 全局部署架构：框架资产全局化 + 项目精简 + 双 state | 2026-09-25 | D1/P2 全量落地；框架资产（9 agent/14 skill/core.md/opencode.jsonc）部署到 ~/.config/opencode/；项目精简为 .openfeel/ + AGENTS.md + opencode.jsonc；框架约束走 instructions（绝对路径）；全局/项目双 update_state；opencode 配置合并语义实测结论（instructions 拼接+去重、~ 加载层展开、core.md 实际加载、AGENTS.md 自动加载、agent_manager_tool 静默丢弃） |
| 控制区标记增量更新架构：managed-region 四策略 + 三态 + update_infos 双资产路径 | 2026-09-25 | D3 全量落地；四策略（markdown begin/end、gitignore、frontmatter 结构化合并、jsonc 深合并）；部署三态（不存在写/无标记追加+记录/含标记覆盖区内）+ malformed 不写盘只记 anomaly；hash 降级为归属兜底；update_infos 双资产路径（绝对路径 / 项目根+相对路径）+ 加锁原子写 |
| 存量项目迁移架构：legacy 布局检测 + 备份回滚 + 全局部署迁移 | 2026-09-25 | `openfeel migrate` 命令；legacy 五条判据（①/② 框架同源判定保证幂等）；备份 `.openfeel/backup/{ts}/` + manifest.json + globalStateKeys 精确回滚；复用 deployGlobalAsset 全局部署；state 拆分重键；回滚边界=全局资产幂等不还原、仅还原项目文件 + 全局 state 新增条目 |
| 模型配置三层级架构：工具默认/全局/项目 + 优先级链 frontmatter>jsonc | 2026-09-25 | `openfeel model` 命令组 + `model-config.ts` 内部 API；三层级落点（default 改 frontmatter 双语 + opencode-config.ts / global·project 改 jsonc）；REV-1606 实测优先级链 frontmatter>jsonc（推翻计划初期相反假设）；provider 硬校验 + model-id 软校验；default 层多源不一致以 frontmatter 为准 |
| 全局约束架构：约束统一全局 AGENTS.md + 约束/操作分离 + 项目级去约束化 | 2026-09-26 | 移除 core.md 约束统一全局 AGENTS.md；约束常驻 AGENTS.md vs 操作拆 skill；项目级去约束化（init/update 不再生成/部署项目 AGENTS.md）；op-000 实测全局 AGENTS.md 自动加载 YES/并存拼接/移除 instructions 仍生效 |

| 全局宏观状态聚合语义：全量 done 判定 + 空集守卫 + 不迁移历史 | 2026-09-29 | `pipeline.phase` 为派生宏观状态，由全部阶段聚合（`length > 0 && every(done)`，空集守卫防 vacuous truth）；单阶段 done 不改变全局；current 不回退属设计行为；不迁移历史（可由 stages 推导 + advance 自愈）；含 status/verbose/current/overview/wizard/validate/migrate 消费方核验清单 |

| opencode agent permission 合并求值语义：findLast + 按键深合并 + 平台默认 ask | 2026-09-29 | 规则列表 `findLast`（最后匹配者胜）+ `permission` 字段通配匹配；顺序=内置默认 → 配置文件 → agent `.md` → 自动追加内部目录 allow；按权限键深合并、**同名键 `.md` 优先**（唯一项目级收紧入口=项目 `.opencode/agent/<name>.md`）；`external_directory` 默认 `ask`；`write` 非授权键、`edit` 才是；单值/对象形式等价。仅对 1.18.33 有效 |

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
| kb-dedup 去重检索对 CRLF 行尾静默失效 | 2026-09-29 | parseKbFile 的标题正则 $ 锚点在 CRLF 下失配（patterns.md 80 个标题仅解析 2 条），去重静默降级；排查=比对 CRLF 计数与命中数；避免=解析前 \r\n 归一 + 降级时改手动关键词匹配 |

| writeDefaultConfig 无条件覆盖：npm test 静默改写真实 config.yaml | 2026-09-29 | 实现层无 existsSync/备份整体覆写 + 测试层 init.test.ts 未 mock cwd → npm test 覆写仓库三值（hash 5229455D→23F76595）；诊断＝git log 该文件 + hash 前后比对 + 单文件复现；避免＝测试隔离 + 反向守卫 + 覆写前备份合并 |

| 需求/文档记载的根因判断须实测复核（opencode 权限「顶层 permission 不生效」误判） | 2026-09-29 | 需求文档 §二.2「`external_directory` 不继承顶层 `allow`」在 1.18.33 上**不成立**（顶层 `*:allow` 经 `findLast` + 通配生效）；§二.1 属过度概括；§五镜像方案无效；排查=隔离实测 + 行为级判别器 + 对照组，冲突时停下上报并如实记录「未复现」，转审查/归档勘误 |

| 多源文案同步陷阱：模板权威源与仓库根手维护文件双份同句易只改一处 | 2026-09-29 | `templates-data/agents-md/*`（setup 部署源，用户可见度最高）与仓库根 `AGENTS.md`（手工维护）语义同句但无单一源约束；`build.js` 不写根 AGENTS.md → 改一处不触发任何失败（`templates/BUG-002`）；排查 `rg "关键句" src/core/templates-data AGENTS.md` 双源比对；避免=同批核对两侧/加一致性断言/文案变更收尾必做全仓 rg |

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
