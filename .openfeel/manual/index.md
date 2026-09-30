# 项目模块手册

> 分级模块文档系统，由归档官在归档时维护更新。每次归档阶段，若涉及以下模块的变更，须同步更新对应文档。

## 模块树

- 核心引擎
  - [流水线管理](core/flow-manager.md)
  - [配置管理](core/config.md)
  - [项目初始化](core/init.md)
  - [适配器更新编排](core/update.md)
  - [增量更新状态](core/update-state.md)
  - [控制区标记](core/managed-region.md)
  - [增量更新记录](core/update-infos.md)
  - [部署覆盖前备份](core/backup.md)
  - [阶段路径映射](core/plan-path.md)
  - [并发保护工具](core/fs.md)
  - [模板加载](core/template-loader.md)
  - [构建管线](core/build.md)
  - [全局路径](core/global-paths.md)
  - [全局平台适配器配置合并（opencode）](core/opencode-config.md)
  - [存量迁移](core/migrate.md)
  - [模型配置核心](core/model-config.md)
  - [全局部署（setup）](core/setup.md)
  - [权限模型（Agent permission）](core/permission.md)
  - [REV 可信度声明与独立复核](core/code-review.md) — 代码审查可信度规范
- CLI 层
  - [命令体系](cli/commands.md)
  - [model 命令组](cli/model.md)
  - [setup 命令](cli/setup.md)
- Agent 体系
  - [Agent 设计](agents/feel.md)
- Skill 体系（按需加载，权威源 `src/core/templates-data/opencode/skills/{name}/SKILL.md`）
  - `openfeel-cli-usage` — CLI 命令/参数/phase/stageId 用法参考（**查询型**，与执行型 `openfeel-wizard` 互引划界；v1.1.2-stage-43 新增）

## 维护规则

| 模块 | 对应文档 | 归档时检查点 |
|------|----------|--------------|
| flow.json / 流水线推进 | `core/flow-manager.md` | 核心 API（含自描述访问器、`removeStage` 安全校验与**返回值契约 `purgeTarget`**、`resolveEffectiveConfig` 级联解析、`autoRepairInconsistency` 的 **dry-run 预览参数**、**`syncCurrentOp` 单一 owner**）、状态机/转移表/全局状态聚合判定、审计日志 action 集合变更、**事务顺序（副作用后置）**、**悬空依赖检测（`checkDanglingDeps`）**、**`transitionsDiff` 差异报告（T19）**、**纠正侧能力（`removeScheme` / `findOrphanOps` / `healthCheck` 第 8 项孤儿 warn / `ensureStageSkeleton` / op 命名 `op-NNN.md` + `extractTitle` 兼容回退 / `recordAttempt` 复用 `syncCurrentOp`，stage-51）** |
| config.yaml / profile.yaml | `core/config.md` | 配置层级、有效值级联（四级优先级与来源标注）、读写方法或默认值常量变更；**profile 读写语义**（`parseError` 标记 + 非法 YAML 不覆盖 + 子 Schema `.passthrough()` 未知键保全）；**全量 `defaults.*` 白名单（schema 驱动）+ 值类型归一（boolean）+ 枚举校验不写盘（R3/T36）** |
| init.ts / 项目初始化 | `core/init.md` | 初始化流程、API 或部署逻辑变更 |
| update.ts / 适配器更新编排 | `core/update.md` | 部署目标、合并逻辑、控制区三态、修正项变更 |
| update-state.ts / update_state.json | `core/update-state.md` | hash 追踪、冲突标记或 update_state.json 结构变更 |
| managed-region.ts / 控制区标记 | `core/managed-region.md` | 四策略、标记 token 或 parse/replace 语义变更 |
| update-infos.ts / update_infos.md | `core/update-infos.md` | 条目结构、路径二元组或读写 API 变更；**「条目只增不减」现状与人工清理建议（R2 保守默认，T25）** |
| backup.ts / 部署覆盖前备份 | `core/backup.md` | 备份根/分区结构、`manifest.json` 字段、`backupFileBeforeWrite` 签名或接入点清单（含「不覆盖故无接入」文件）、失败语义（`BackupError` / `skipped` / `note='backup_failed'`）、`BackupCommand` 枚举变更 |
| plan-path.ts / stageId↔目录映射 | `core/plan-path.md` | stageId 解析/校验/建议名、目录映射规则、`(series, stageDir)` 冲突检测或三级回退逻辑变更 |
| plan/scheme.ts / op 方案生成与兜底注册 | `core/flow-manager.md`（审计日志与兜底注册节） | 兜底注册路径、冲突检测（`validateStageId` + `findStageDirConflict`）或 `register_op` 审计日志变更；**stage-51 起含 op 命名 `op-NNN.md`、`ensureStageSkeleton` 补骨架、`removeScheme`** |
| fs/atomic-write.ts / file-lock.ts / sequence.ts | `core/fs.md` | 新增工具、并发机制、锁路径约定或接入范围变更 |
| template-loader.ts / 模板运行时加载 | `core/template-loader.md` | 模板源结构、加载 API 或注入对象变更 |
| build.js / 构建管线 | `core/build.md` | 源路径、构建步骤、校验断言或生成物标记变更；**发布元数据**（`files`/`engines`/`postinstall`）与主入口死导出清理也归此 |
| global-paths.ts / 全局路径解析 | `core/global-paths.md` | 全局路径函数、homedir 封装或新增路径；**`getHomedir()` 导出与「homedir 单点收敛」纪律（T27/U3-008）**；**全局 `config.json` 死映射清理指引与四步保护** |
| opencode-config.ts / 全局平台适配器配置合并（opencode 适配器） | `core/opencode-config.md` | 框架内容对象、parseJsonc/deepMergeJsonc 合并规则变更 |
| migrate.ts / 存量迁移 | `core/migrate.md` | legacy 判据、备份 manifest、state 拆分重键、回滚边界变更 |
| model-config.ts / 三层级模型配置 | `core/model-config.md` | 三层级落点、优先级链、校验规则或读写 API 变更 |
| commands/model.ts / model 命令组 | `cli/model.md` | 命令面（set/get/list + --scope）、非 TTY 守卫或翻译机制变更 |
| setup.ts / 全局部署 | `core/setup.md` | 全局部署目标、幂等语义或部署内容变更 |
| commands/setup.ts / setup 命令 | `cli/setup.md` | 命令面（--lang）或输出行为变更 |
| 命令注册 / i18n | `cli/commands.md` | 新增命令组或翻译机制变更、自描述集合边界（`advanceAccepted`）、结构化错误分流（`StageDirConflictError`）、**`--dry-run` 字节级不写盘语义 / `plan stage add --deps` 存在性校验 / `flow health` 悬空依赖节**；**`lint` 退出码门禁语义（R1/T17）/ 全量 `defaults.*` 配置读写（R3/T36）/ `view add` 弃用（R4/T37，下版本移除）/ `help.arguments` i18n 遍历（T38）/ `transitionsDiff`（T19）**；**纠正/清理侧命令面（`plan scheme remove` / `flow repair --prune-orphans` / `flow stage set --deps` / `flow review update·remove` / `stage set` 幂等与字段 / `stage task --add` / `plan stage add --tasks` / `flow advance --quiet` / `knowledge dedup`）与 op 命名 `op-NNN.md`，stage-51** |
| init.ts `--workspace-only` / 用户可见跳过提示 | `core/init.md` + `cli/commands.md` | `InitResult.skipped` 语义（备份失败 / **已存在不覆盖**）或跳过提示输出变更 |
| Agent 体系 / 调度模型 | `agents/feel.md` | Agent 数量、模型或调度规则变更；**审查会话健康探测与可疑产出处置**（事件 A） |
| 代码审查可信度 / REV 独立复核 | `core/code-review.md` | 可信度声明写法、**可疑会话产出的处置**（降级「待复核」）、取证纪律（异常即中止 / 不继承 / 命令行优先 / 三要素可复现） |
| agent 模板 permission / opencode 权限模型（opencode 适配器） | `core/permission.md` | 9 agent 白名单键集、合并/优先级语义、项目级收紧入口或受管区边界变更 |
| skill 体系 / CLI 用法参考 | `cli/commands.md`（命令面）+ `openfeel-cli-usage` skill 权威源 | **skill 数量（当前 17）**——既有计数口诀见 `test/core/{setup,update}.test.ts`（`9 agent + 17 skill + 1 = 27`；+ 项目 jsonc = 28），新增/改名 skill 须同步**全仓写死计数与白名单数组**；`--help` 文案与自描述命令输出键集是否一致；**快照声明**的版本号是否随版本更新 |

> 新增模块时在「模块树」中追加条目，并创建对应文档。
