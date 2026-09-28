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
- CLI 层
  - [命令体系](cli/commands.md)
  - [model 命令组](cli/model.md)
  - [setup 命令](cli/setup.md)
- Agent 体系
  - [Agent 设计](agents/feel.md)

## 维护规则

| 模块 | 对应文档 | 归档时检查点 |
|------|----------|--------------|
| flow.json / 流水线推进 | `core/flow-manager.md` | 核心 API（含自描述访问器、`removeStage` 安全校验、`resolveEffectiveConfig` 级联解析）、状态机/转移表/全局状态聚合判定、审计日志 action 集合变更 |
| config.yaml / profile.yaml | `core/config.md` | 配置层级、有效值级联（四级优先级与来源标注）、读写方法或默认值常量变更 |
| init.ts / 项目初始化 | `core/init.md` | 初始化流程、API 或部署逻辑变更 |
| update.ts / 适配器更新编排 | `core/update.md` | 部署目标、合并逻辑、控制区三态、修正项变更 |
| update-state.ts / update_state.json | `core/update-state.md` | hash 追踪、冲突标记或 update_state.json 结构变更 |
| managed-region.ts / 控制区标记 | `core/managed-region.md` | 四策略、标记 token 或 parse/replace 语义变更 |
| update-infos.ts / update_infos.md | `core/update-infos.md` | 条目结构、路径二元组或读写 API 变更 |
| backup.ts / 部署覆盖前备份 | `core/backup.md` | 备份根/分区结构、`manifest.json` 字段、`backupFileBeforeWrite` 签名或接入点清单、失败语义（`BackupError` / `skipped` / `note='backup_failed'`）、`BackupCommand` 枚举变更 |
| plan-path.ts / stageId↔目录映射 | `core/plan-path.md` | stageId 解析/校验/建议名、目录映射规则、`(series, stageDir)` 冲突检测或三级回退逻辑变更 |
| plan/scheme.ts / op 方案生成与兜底注册 | `core/flow-manager.md`（审计日志与兜底注册节） | 兜底注册路径、冲突检测（`validateStageId` + `findStageDirConflict`）或 `register_op` 审计日志变更 |
| fs/atomic-write.ts / file-lock.ts / sequence.ts | `core/fs.md` | 新增工具、并发机制、锁路径约定或接入范围变更 |
| template-loader.ts / 模板运行时加载 | `core/template-loader.md` | 模板源结构、加载 API 或注入对象变更 |
| build.js / 构建管线 | `core/build.md` | 源路径、构建步骤、校验断言或生成物标记变更 |
| global-paths.ts / 全局路径解析 | `core/global-paths.md` | 全局路径函数、homedir 封装或新增路径 |
| opencode-config.ts / 全局平台适配器配置合并（opencode 适配器） | `core/opencode-config.md` | 框架内容对象、parseJsonc/deepMergeJsonc 合并规则变更 |
| migrate.ts / 存量迁移 | `core/migrate.md` | legacy 判据、备份 manifest、state 拆分重键、回滚边界变更 |
| model-config.ts / 三层级模型配置 | `core/model-config.md` | 三层级落点、优先级链、校验规则或读写 API 变更 |
| commands/model.ts / model 命令组 | `cli/model.md` | 命令面（set/get/list + --scope）、非 TTY 守卫或翻译机制变更 |
| setup.ts / 全局部署 | `core/setup.md` | 全局部署目标、幂等语义或部署内容变更 |
| commands/setup.ts / setup 命令 | `cli/setup.md` | 命令面（--lang）或输出行为变更 |
| 命令注册 / i18n | `cli/commands.md` | 新增命令组或翻译机制变更 |
| Agent 体系 / 调度模型 | `agents/feel.md` | Agent 数量、模型或调度规则变更 |
| agent 模板 permission / opencode 权限模型（opencode 适配器） | `core/permission.md` | 9 agent 白名单键集、合并/优先级语义、项目级收紧入口或受管区边界变更 |

> 新增模块时在「模块树」中追加条目，并创建对应文档。
