# 项目初始化模块（init）

> 模块文档，由归档官在归档时维护。对应源码：`src/core/init.ts`。

## 职责

项目初始化编排，协调创建 `.openfeel/` 工作区目录（含 `.openfeel/dev/current_archive/` 归档目录，见 `DEV_SUB_DIRS`）、写入配置、初始化 `flow.json`、确保身份文件、生成模板文件（`dev_core.md`、`current.md`、`decisions.md`、`kb/index.md`）、写项目平台适配器配置文件（`opencode.jsonc`），并提供示例项目骨架（`--demo`）与仅工作区（`--workspace-only`）轻量模式。

> **v1.1.1 收敛**：全局约束/agent/skill 部署已从 init 拆除，收归 `openfeel setup`（见 `core/setup.md`）。init 只做项目初始化，不再产生项目 `AGENTS.md`、不部署任何全局资产。

## 核心 API

| 函数 | 功能 |
|------|------|
| `initProject(projectPath, cliLang?)` | 主初始化流程：确保全局配置 → 语言选择 → `initWorkspaceCore` → 写项目平台适配器配置文件（`opencode.jsonc`） → package.json vitest 检测 |
| `initWorkspaceOnly(projectPath, lang?)` | 非交互轻量子命令（`--workspace-only`）：仅创建工作区，不写平台适配器配置文件（`opencode.jsonc`）/`AGENTS.md`，供 Feel 空白项目自动搭建 |
| `initWorkspaceCore(projectPath, lang)` | 内部函数：创建工作区（目录 + config.yaml + flow.json + .info.json + dev/kb 模板），被 initProject/initWorkspaceOnly 复用；**`.openfeel/config.yaml` 已存在时不覆盖**（入 `skipped`，见下节） |
| `initDemo(projectPath, lang)` | 创建示例项目骨架（TS 项目 + vitest 配置 + 示例测试 + 示例阶段） |
| `writeTemplateIfMissing(filePath, content)` | 底层工具：仅在目标不存在时写入，返回 `{ created: boolean }` |
| `ensureGlobalConfig()` | 首次使用时的全局配置引导（语言选择），交互模式中英双语提示 |

## 类型定义

```typescript
/** 初始化结果 */
interface InitResult {
  created: string[];   // 创建的目录/文件列表
  updated: string[];   // 更新的文件列表
  skipped: string[];   // 因备份失败或「已存在不覆盖」而跳过的文件（stage-46 引入，stage-47 扩展语义）
}

/** 示例骨架结果 */
interface DemoResult {
  created: string[];
  skipped: string[];
}
```

## 初始化流程（initProject）

```
步骤 0: ensureGlobalConfig() — 首次使用引导
步骤 1: 语言选择（CLI --lang > 交互式 > 全局默认）
步骤 2: initWorkspaceCore() — 创建工作区
          （createWorkspace → config.yaml 不存在则 writeDefaultConfig（已存在则入 skipped，不覆盖）
           → FlowManager.initFlow → ensureInfoJson → writeLang
           → dev_core/current/decisions → kb/index）
步骤 3: 写项目平台适配器配置文件（opencode.jsonc）（最小 { $schema }，不存在则写）
步骤 4: 检测 package.json → 添加 @vitest/coverage-v8（如有 vitest）
```

## workspace-only 子命令（v1.1.1）

`openfeel init --workspace-only [--non-interactive]`：调用 `initWorkspaceOnly`，仅执行 `initWorkspaceCore`，**不写** 项目平台适配器配置文件（`opencode.jsonc`）/`AGENTS.md`、不检测 package.json、不做语言交互（`--lang` 或默认 zh-CN）。供 Feel 在空白项目（无 `.openfeel/`）启动时自动搭建工作区。

## 用户配置不覆盖语义（v1.1.2-stage-47，`config/BUG-002` 语义修复）

`initWorkspaceCore` 对**已存在**的 `.openfeel/config.yaml` **不覆盖**（保留用户配置），仅 `skipped.push('.openfeel/config.yaml (已存在，保留用户配置)')`；命令层 `commands/init.ts` 汇总 `InitResult.skipped` 输出用户可见提示（i18n `init.skipped`，zh/en）。文件不存在时才 `writeDefaultConfig`（`created.push`）。

- **与备份机制的关系**：「备份后覆盖」是覆盖的前置，而非覆盖的替代——`config.yaml` 不再覆盖后，其 stage-46 备份接入点（`backupFileBeforeWrite` / `appendUpdateInfo('backed')` / `notifyBackupIfTTY`）**已删除**，避免产生无覆盖事实的误导性 `backed` 条目。该文件的备份范围表条目见 `manual/core/backup.md`。
- **`package.json` 不受影响**：init 仍会注入 `@vitest/coverage-v8`，其覆盖前备份块保留（`backupFileBeforeWrite(pkgPath, …)`，import 全在用）。
- **调用方契约**：`writeDefaultConfig`（`src/core/config.ts`）注释声明「整体覆盖，调用方须先自行守卫」，本函数不做「是否存在」判定。
- **取舍**：`init` 不再把模板新增字段带给存量项目（用户可编辑文件优先保护）；如需补全缺失键应另立「合并写入」能力，而非回退为整体覆盖。

## v1.1.1 拆除的部署能力（收归 openfeel setup）

原 `deployOpencode` / `promptOpencodeDeploy` / `writeGlobalFileIfMissing` 已删除；全局 AGENTS.md + 9 agent + 17 skill + 全局平台适配器配置（`opencode.jsonc`）由 `openfeel setup` 纯全局部署（见 `core/setup.md`）。`InitResult` 同步移除 `opencode` 字段。

## 语言回退

- `initProject` 语言选择优先级：CLI `--lang` 参数 > 交互式选择 > 全局默认语言
- 非交互模式（CI/CD）默认 `zh-CN`

## 变更历史

| 阶段 | 变更 |
|------|------|
| stage-04 | 新增 `initDemo()` 支持 `--demo` 标志 |
| stage-29 | 新增 `promptOpencodeDeploy()` + `deployOpencode()` + AGENTS.md `{项目名称}` 替换 + 重启提醒；`InitResult` 扩展 `opencode` 字段 |
| stage-33 | 新增 decisions.md 生成步（6b 步，`getDecisionsTemplate`） |
| stage-34 | 示例阶段多级化：`plan/stage-01/status.md` → `plan/v1/stage-01/status.md` |
| stage-36 | agent/skill 命名加 `openfeel-` 前缀（`feel` 保留）；模板源收敛为 `templates-data/opencode/` 单源 |
| stage-37 | 全局部署（D1）：`deployOpencode` 部署目标改全局 `~/.config/opencode/` |
| v1.1.1 | 拆除 `deployOpencode`/`promptOpencodeDeploy`/`writeGlobalFileIfMissing` 与项目 AGENTS.md 骨架；新增 `initWorkspaceCore`/`initWorkspaceOnly`（`--workspace-only`）；`InitResult` 移除 `opencode`；全局部署收归 `openfeel setup` |
| v1.1.2-stage-46 | `InitResult` 扩展 `skipped`；`config.yaml` / `package.json` 覆盖前接入备份（`backupFileBeforeWrite` + `backed` 条目；备份失败绝不覆盖） |
| v1.1.2-stage-47 | **`config.yaml` 语义修复：已存在则不覆盖**（仅 `skipped.push` 提示，命令层新增 `init.skipped` 用户可见输出）；删除 stage-46 的 `config.yaml` 备份接入块（`package.json` 备份块保留）；`writeDefaultConfig` 增调用方守卫契约注释 |
| v1.1.2-stage-53 | `DEV_SUB_DIRS` 增 `current_archive`（`createWorkspace` 自动创建 `.openfeel/dev/current_archive/`，供 `current.md` 旧记录轮换归档）；`CURRENT_TEMPLATE_ZH/EN` 改为**团队文件新骨架**（「近期提交记录（最多 5 条，最新在上）」+ `current_archive/` 指引；**移除**「团队成员进度」「@{username} 描述正在进行的工作」）；`DECISIONS_TEMPLATE` 引用改 `dev_last/decisions.md`（主题文件）。**私域 `dev_last/` 不新增源码目录常量**（随用随建，由 workspace skill 覆盖） |
