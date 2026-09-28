# Changelog

本项目的全部重要变更记录在本文档中，格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。

## [1.1.2] - 2026-09-29

### Added
- `openfeel flow phases [--json]`：自描述全部合法 phase 与运行时转移表（`--json` 含 `phases`/`transitions`/`advanceAccepted`）
- `openfeel flow stage remove <stageId>`：安全移除阶段（ops 非空 / 当前活跃 / 被依赖时默认拒绝；`--force` 越过、`--dry-run` 预览、`--purge` 删目录）
- `openfeel plan stage add <name> --deps <ids...>`：CLI 暴露依赖声明（写入 `flow.json.stages[].deps` + `overview.md`）
- `openfeel config effective [key]`：输出配置有效值 + 生效来源（`status.md > config.yaml > profile.yaml > builtin`）
- stageId 校验与冲突检测：`validateStageId` / `suggestStageId` / `findStageDirConflict`（`(series, stageDir)` 冲突阻止 + 建议名）
- 部署覆盖前自动备份：全局根 `~/.openfeel/backup/{ts}/` + `update_infos.md` 新增「备份」类条目 + `feel.md` 检查规则
- 新增 skill `openfeel-cli-usage`（CLI 命令/参数/phase/stageId 用法按需加载参考；skill 总数 16 → 17）

### Changed
- `auto_advance` 口径统一为「项目 `config.yaml` 优先、全局画像兜底」三级有效链
- `pipeline.phase` 改为全量 done 判定（所有阶段均 done 时置 `done`）
- 命令职责分层：`plan stage add`（完整入口）> `flow stage add`（仅注册）> `stage create`（弃用，运行时提示）
- 成功注册阶段 / 操作补审计日志（`register_stage` / `register_op`）
- 9 个 agent 模板补 `external_directory: "allow"`（opencode 适配器）；`openfeel-utility` 的 `write` 改回 `edit`
- 平台强限定描述泛化（去「唯一 harness」表述，零行为变更）
- 文档/手册与 CLI 同步（`docs/commands.md` 新增 `## config` 节等）
- 版本号 1.1.0 → 1.1.2 全链路同步（`package.json` / `config.yaml` / `config.ts` 模板 / agents-md 模板 / `AGENTS.md` / `package-lock.json` / `CHANGELOG`）

### Fixed
- `config/BUG-004`：`identity.test.ts` 直写真实 `~/.openfeel/config.json` 的测试隔离缺口——改为 N4 单点 mock + 新增隔离守护用例（真实文件 mtime/SHA-256 前后不变）
- 已登记缺陷集中清理：`cli/BUG-001`、`cli/BUG-002`（stageId 冲突 i18n）、`archive/BUG-001`、`config/BUG-002`（`config.yaml` 覆盖语义）、`config/BUG-003`、`templates/BUG-002`

## [1.1.1] - 2026-09-26

### Added
- `openfeel setup` 命令：纯全局部署（全局 AGENTS.md + 9 agent + 16 skill + 全局 opencode.jsonc），不建立项目 `.openfeel/`，幂等可重跑
- `openfeel init --workspace-only --non-interactive`：非交互轻量子命令，仅创建 `.openfeel/` 工作区（不建 AGENTS.md/opencode.jsonc），供 Feel 空白项目自动搭建
- 新增 skill：`openfeel-workspace`（会话启动自检操作步骤）、`openfeel-tool-usage`（Agent 工具使用规范）；skill 总数 14 → 16
- `openfeel migrate --clean-global-core-md`：显式删除已废弃的全局 core.md（默认仅提示不删）
- `detectDeprecatedCompat`：检测全局旧 core.md / 存量项目 AGENTS.md 并提示

### Changed
- 全局化彻底化：所有约束统一到全局 `~/.config/opencode/AGENTS.md`（移除 core.md）；op-000 实测全局 AGENTS.md 自动加载 = YES，故全局 opencode.jsonc 移除 `instructions` 字段
- 约束/操作分离：core.md 约束类并入全局 AGENTS.md，操作类拆为按需加载 skill（`openfeel-workspace` / `openfeel-tool-usage`）
- AGENTS.md 模板改为「全局行为约束」（移除 `{项目名称}` 占位符；新增「项目特有约束（可选化）」声明节 + 「.openfeel 工作区结构（约束）」节）
- init 收敛：拆除全局 agent/skill/core.md 部署与项目 AGENTS.md 骨架，仅做项目初始化（.openfeel/ 工作区 + 项目 opencode.jsonc）
- update 收敛：拆除项目 AGENTS.md 部署；全局资产部署目标由 core.md 改为全局 AGENTS.md；存量全局 state 的 core.md key 一次性重映射
- migrate：`remapLegacyKey` 目标与全局部署路径改全局 AGENTS.md
- 版本号 1.1.0 → 1.1.1 全链路同步（package.json / agents-md 模板 / CHANGELOG）

## [1.1.0] - 2026-09-25

### Added
- 并发保护基础设施：统一原子写（唯一名 temp + fsync + rename）、跨进程文件锁（O_EXCL + 指数退避 + 陈旧锁抢占）、序号分配原子化，覆盖 flow.json/公共日志/status.md/update_state.json 等高风险写入点
- 全局部署架构：框架资产（9 agent / 14 skill / core.md / opencode.jsonc）从项目内嵌升级为全局安装 `~/.config/opencode/` + 项目精简（项目仅 .openfeel/ + AGENTS.md + opencode.jsonc）；全局/项目双 update_state
- 控制区标记增量更新：`<!-- openfeel:begin/end -->` 受管区 + 部署三态（不存在写 / 无标记追加 + 记录 update_infos.md / 含标记覆盖区内）
- `openfeel migrate` 命令：存量旧布局项目一键迁移（检测/备份/迁移/回滚 + --dry-run + --remap-assignee），项目自定义资产保留

### Changed
- 模板单源收敛：templates-data/ 为唯一权威源，仓库 .opencode/ 降级为构建产物
- 命名前缀统一：8 agent + 14 skill 加 `openfeel-` 前缀（feel 保留）；`/opfx:` 混合命名空间按真实类型引用并清零
- 版本号 1.0.9 → 1.1.0 全链路同步（package.json / config.yaml / config.ts / agents-md 模板 / AGENTS.md / CHANGELOG）

## [1.0.9] - 2026-08-15

### Added
- 路径映射权威工具：新增 `src/core/plan/path.ts`（stageId ↔ plan 目录双向映射唯一权威，含历史格式与短名兼容，findStatusPath 三级回退），init 示例阶段多级化部署到 `plan/v1/stage-01/`

### Changed
- plan 目录多级化与路径统一：阶段工作目录统一为 `plan/{series}/{stage}/`（series = v{MAJOR}），`plan stage add` / `plan scheme create` 从 `.openfeel/stages/` 迁移写入；findStatusPath 三级回退（plan 精确 → plan 递归 → stages 只读兜底）；命令层 stageId 映射修正、模板与 skill 文案同步、docs 文档路径引用统一
- 版本号 1.0.8 → 1.0.9 全链路同步（package.json / config.yaml / config.ts / CHANGELOG）

## [1.0.8] - 2026-08-15

### Added
- 任务类型路由：AGENTS.md 新增「任务类型路由」节，非编码任务（调研/探索、选型讨论）成为一等公民，flow.json 不必为所有任务空转
- decisions.md 纳入框架标准：新增 `.openfeel/dev/decisions.md`（ADR 轻量格式，决策+理由+日期+状态），init 自动生成，core.md 会话自检纳入

### Changed
- Feel 日志纪律解耦：「必须记录的事件」改为「委托任意下游 Agent（含 general / explore / utility 等调研类）都须落公域日志」，删除「委托 Executor / 事务官」的排他性表述，明确不受任务类型豁免
- 轻量决策边界：Feel / Planner / AGENTS 三层统一定义——对话式选型（产出结论不产出 plan.md）由 Feel 直接处理，仅产出正式计划文档或达规模阈值才委托 Planner
- 版本号 1.0.7 → 1.0.8 全链路同步（package.json / config.yaml / config.ts / AGENTS 版本声明）

## [1.0.0] - 2026-08-07

### Added
- GitHub Actions CI/CD 工作流（`.github/workflows/ci.yml`）：push/PR 触发，Node.js 20.x/22.x 双版本矩阵，`npm ci` → `npm run build` → `npm test`
- `CHANGELOG.md` 项目变更日志（本文档）与 `docs/GETTING_STARTED.md` 用户入门指南
- `openfeel lint` 质量门禁落地（i18n 422 键对称性校验 + kb 过期引用检测），为 CI 集成提供前置检查

### Changed
- 版本号统一为 v1.0.0：flow.json 25 个 stageId 从 v0.x.x 体系重映射为 v1.0.0-stage-04 ~ v1.0.0-stage-28，同步更新 plan/index.md 对照表、kb/index.md、dev/current.md
- npm 发布工程准备：package.json 元数据完善（bin/exports 入口、files 白名单、publishConfig）

## [0.5.0] - 2026-08-07

### Added
- 框架级记忆体系：全局用户画像 `~/.config/openfeel/profile.yaml` + `dev_last.md` 生命周期模板 + `openfeel config --global` 标志
- 跨 Agent Handoff 委派原语（`[HANDOFF: agent_name]` 标记）、Checkpoint 快照自动保存与组合终止条件（transitions `|` 运算符）
- `openfeel lint` 质量门禁命令组（i18n 键对称性 + kb 引用检测）与 4 个新 skill 落地（roadmap/health/recover/wizard）

### Changed
- 版本管理规范（主.次.修订语义）与计划目录按大版本系列分组重构（v4/、v5/）；规范迁移 dev_core.md → core.md

### Fixed
- 缺陷修复系列：autoCommitOnDone 时序修正、AGENTS.md 模板补齐版本管理节、init 创建 manual/ 目录、部署传播内容哈希比对

## [0.4.0] - 2026-07-15

### Changed
- 15→7 Agent 精简体系（删除/合并/替代/划归四类操作）；废弃自动闭环，改为 Feel 总统领调度 + CLI 推进模型

### Added
- 知识库自动化体系：检索→去重→沉淀三环闭环，check-kb 技能自包含语义检索
- i18n 基础设施（12 功能域，206 entries × 2 语言）、多语言模板数据管线与双语 CLI 交互（init 选择 → .info.json 持久化 → update 读取）
- Vision 视觉官（8→9 Agent 扩展，qwen-vl-plus 多模态模型）与分级模块文档系统 `.openfeel/manual/`

### Fixed
- 流水线安全增强：REV 闭环双路兜底（flow-manager + 命令层，--force 不可绕过）、公域日志批量聚合降噪 85%+、git 钩子 + 日志骨架

## [0.3.0] - 2026-06-28

### Added
- 流水线 Agent 体系 v3 架构：Feel/Schemer/Executor/Reviewer/Tester/Archiver 六角色 + flow.json + FlowManager + 模型分工（推理/快速/异种）
- 交互式 wizard、demo、知识库与边界处理等体验增强（v3.0 四阶段 21 项任务闭环，测试 217/219 通过）
- Schemer 自动生成 deps.yaml 依赖声明（hard/soft/mutual_exclusion 三档）

### Changed
- Flow CLI 严格校验（非法 phase 拒绝推进，新增 --force/--verbose）、文档路径绝对化与知识库搜索增强（--limit/--offset）

### Fixed
- v3.1/v3.2 补丁系列 + 生产加固验证（5 项目全流水线测试，DateKit 终验零 Bug）

## [0.2.0] - 2026-06-27

### Added
- v2 架构：feel Agent 链 + 三层计划体系（大计划/小计划/操作方案）
- 统一工作区结构（.openfeel/ 命名）+ 核心+适配器分层 + 交互式 CLI

### Changed
- v2.0 七阶段 28 项改进全部闭环（59 文件变更，217/219 测试通过）
- 计划扩展：新增 stage-07 可扩展性重构（pipeline 数据化 / config 通用化 / 指令参数化 / CLI 自动发现）

### Fixed
- 一期部署复盘：deploy-review 对比分析与 blueprint-test-project 蓝图归档至 .openfeel/docs/

## [0.1.0] - 2026-06-24

### Added
- OpenFeel 项目创立，制定 v1.0 开发计划（9 阶段）
- 一期核心流水线搭建（Agent 工作区目录结构 + 状态文件体系）

### Changed
- 工作区命名全局替换为 `.openfeel/`，确立公共域 + 私域分区原则

### Fixed
- 一期部署验证：首个测试项目端到端跑通，产出部署对比分析报告
