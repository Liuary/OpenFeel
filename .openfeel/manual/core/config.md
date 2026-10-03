# 配置管理模块（config）

> 模块文档，由归档官在归档时维护。对应源码：`src/core/config.ts`。

## 职责

管理两层配置：项目级 `.openfeel/config.yaml` 与全局用户画像 `~/.config/openfeel/profile.yaml`，使用 YAML 解析 + Zod Schema 校验。

## 配置层级

| 层级 | 路径 | 内容 |
|------|------|------|
| 全局画像 | `~/.config/openfeel/profile.yaml` | `user`（name/lang）、`preferences`（auto_advance/review_mode/communication/confirm_threshold）、`history`（recent_projects） |
| 项目配置 | `.openfeel/config.yaml` | `meta`（version/project/tech_stack）、`defaults`（execution_mode/auto_advance/merge_mode）、`models`（default/agents/roles） |

优先级：项目配置覆盖全局默认，`readProfile()` 兜底默认值（zh-CN / disabled / full / concise / medium）。

**有效值级联（stage-42，口径权威）**：`builtin < profile.yaml < 项目 config.yaml defaults < 当前阶段 status.md`。解析器位于 `flow-manager`（`buildCascadeConfig` + 公开的 `resolveEffectiveConfig()`，详见 `manual/core/flow-manager.md`），命令出口为 `openfeel config effective [key]`。`config.ts` 侧只提供被级联复用的常量与读取函数：

- `DEFAULT_CONFIG`（导出，**三键齐全**：`execution_mode` / `auto_advance` / `merge_mode`）：级联最底层的 `builtin` 值来源，命令层不另写默认值。
- `DEFAULT_PROFILE`：画像是缺失时的安全降级画像。**v1.1.2-stage-47 起**：级联解析不再以 `readProfile()` 的返回值填充 `profileDefaults`，而是「画像文件真实存在 + 原始 YAML 显式声明 `preferences.auto_advance`」双条件判定（`config/BUG-003` 已修复 → 无画像环境来源落 `builtin`）；`DEFAULT_PROFILE` 仅作为 `readProfile()` 自身的异常安全兜底值保留。

**布尔测试门禁键移除（v1.1.4-stage-62）**：原布尔测试门禁配置键（键名见 `CHANGELOG.md` 与 v1.1.4 迁移记录）已移除——15 相位模型下 phase 图与该键无关，保留即误导。存量 `.openfeel/config.yaml` 中的残留行按**非受管扩展键**兼容：`ConfigDefaultsSchema` 的 `.passthrough()` 在**读侧原样保留**（不报错、不崩溃、不参与级联）；对该键执行 `config set` 会被判定为**无效键**并报错（预期）。受管配置键收敛为 `execution_mode` / `auto_advance` / `merge_mode` 三个。

**键名归一（v1.1.4-stage-63）**：`normalizeConfigKey(key)` 剥离 `defaults.` 前缀（`defaults.execution_mode → execution_mode`），使 **`defaults.X ≡ X`**（单一来源，`config.ts`）；供 `commands/config.ts` 的 `config set/get` 与 `resolveConfigDefaults` 共用。仅剥离一次前缀，`defaults.` 单独出现归一为空串（由白名单拒绝）；`--global` 的 profile 键域不同，**不受影响**。

**子 Schema 未知键保全（v1.1.2-stage-48）**：`ProfileUserSchema` / `ProfilePreferencesSchema` / `ProfileHistorySchema` 三个子 Schema 均补 `.passthrough()`（顶层 `ProfileSchema` 早已 `.passthrough()`）——使 `user.*` / `preferences.*` / `history.*` 下的**用户自定义扩展键**在 `readProfile()` → `writeProfile()` 往返中**不被 Zod 剥离**。仅影响序列化往返（保全），不改变读取语义（默认值合并不变）。

**`meta.version` 语义**：为 OpenFeel 框架版本（非配置格式版本），与 package.json 同步。由 `config.ts` 的硬编码模板常量 `CONFIG_TEMPLATE_ZH/EN`（字面量，非插值）生成，版本升级须三处同步（项目实例 config.yaml + config.ts 双语言模板）。`flow.json meta.version='1.0'` 为内部格式，是独立字段不参与。

## 读写方法

| 方法 | 功能 |
|------|------|
| `readConfig(projectPath)` | 读取项目配置（yaml.parse + Zod 校验，缺失用默认值） |
| `writeDefaultConfig(projectPath, lang)` | 写入默认项目配置（**整体覆盖，无 `existsSync` 守卫、无备份**）。**契约（stage-47）**：调用方须先自行守卫——`init` 对已存在的 `config.yaml` 不再调用本函数（保留用户配置 + `skipped` 提示）；本函数不应被无守卫地用于既有用户配置 |
| `getConfigValue(projectPath, key)` / `setConfigValue(...)` | 读取 / 修改单个配置项。**v1.1.2-stage-50 起**：`setConfigValue` 写入前**按字段 Schema 归一值类型**（boolean 键把 `"true"`/`"false"` 解析为布尔，逐层解包后 `instanceof z.ZodBoolean`；**zod v4 无 `_def.typeName`**）——归一是白名单扩至全量 `defaults.*` 的前提（否则 boolean 键首次可达即 `ZodError` 崩溃） |
| `normalizeConfigKey(key)` | **v1.1.4-stage-63 新增**：配置键名归一（剥离 `defaults.` 前缀），使 `defaults.X ≡ X`（单一来源）。`config set/get`（项目模式）入口先归一再走既有白名单/枚举校验 |
| `resolveConfigDefaults(projectPath)` | **v1.1.4-stage-63 新增**：读项目 `config.yaml` 的 `defaults` 块作**骨架初值**（逐键经 `ConfigDefaultsSchema` 校验，缺失/非法逐键回退 `DEFAULT_CONFIG`）；**不读 status.md、不做 effective 合并**（区别于 `buildCascadeConfig`）。供 `ensureStageSkeleton` 取新阶段 `执行模式`/`自动推进` 初值 |
| `STAGE_FIELD_BY_CONFIG_KEY` | **v1.1.4-stage-63 新增**：受管配置键 → 阶段 `status.md` 字段名映射（单一来源）：`auto_advance → 自动推进`、`execution_mode → 执行模式`；无阶段字段的键（`merge_mode`）不在此表，`--sync-stages` 时按 `skipped-no-field` 跳过报告 |
| `readProfile()` / `writeProfile(profile)` | 读取 / 写入全局用户画像（`readProfile` 异常安全：缺失/非法 YAML 回退 `DEFAULT_PROFILE`）。**v1.1.2-stage-48 起**：返回类型为 `Profile & { parseError?: string }`——解析/校验失败（YAML 语法错误、顶层非对象/空文件）时**标记 `parseError`**；非法态下 `ensureProfileDefaults` **跳过写回** + `console.warn`（含路径与原因），`config set --global` 直接报错 `exit 1`（**不覆盖**用户文件） |
| `CONFIG_TEMPLATE_ZH` / `CONFIG_TEMPLATE_EN` / `DEFAULT_CONFIG` / `DEFAULT_PROFILE` | 模板与默认值常量（`DEFAULT_CONFIG` 为级联 `builtin` 层权威值） |

> **写入安全（v1.1.0-stage-35）**：`writeProfile()` 与 `setGlobalConfig()`（`workspace/identity.ts`）为跨项目全局写入，均在 `global-config` 锁（`~/.openfeel/locks/global-config.lock`）内 + 原子写；`writeDefaultConfig()` / `setConfigValue()` / `ensureInfoJson()` 仅原子写（不加锁，低风险）。详见 `manual/core/fs.md`。

## 健壮性补强（v1.1.2-stage-50）

| 项 | 变更 |
|----|------|
| `readProfile()` 深拷贝（T28） | 缺失/异常分支返回**结构化深拷贝**而非浅拷贝，避免调用方原位修改污染模块级 `DEFAULT_PROFILE`（同进程后续读取被污染） |
| `recent_projects` 去重（T32） | 去重比较**大小写不敏感**（`c:\x` 与 `C:\x` 视为同一项），修复 Windows 盘符大小写不归一导致的重复条目 |
| `config set/get` 全量 `defaults.*`（R3/T36） | 键白名单**由 `ConfigDefaultsSchema` 驱动**（不硬编码），与 `config effective` 覆盖范围一致；写入值经类型归一 + 枚举校验；**枚举非法报错且不写盘**（hash + mtime 不变） |
| `config set --sync-stages`（v1.1.4-stage-63） | 仅项目模式；`FlowManager.syncConfigFieldToStages(configKey, value)` 对**所有已注册阶段**的 status.md 定向写入目标键对应字段（复用 `writeStatusField` 定向写 + 按阶段锁）：**同值 no-op**、字段/文件缺失跳过报告、其它键按 `skipped-no-field` 跳过；**只读** `flow.json` 阶段枚举、**不写 `flow.json`** |
| 级联逐键 Zod 校验（T29） | `buildCascadeConfig`（`flow-manager`）不再自行 `parseYaml` 绕过 Zod——按 `ConfigDefaultsSchema` **逐键校验**（非法跳过 + warn），使 `config effective` 与 `config get` 口径一致 |
| 读路径 parseError 提示（T33） | `config get --global` 在画像非法时于 stderr 输出 `parseError` 警告（读写路径对称，避免「误判未设置」） |


## 模型配置

`models.default` 为兜底模型，`models.agents` 按 Agent 名覆盖，`models.roles` 按角色覆盖。每个模型条目含 `provider`、`model_name`、可选 `base_url` 与 `api_key_env`。
