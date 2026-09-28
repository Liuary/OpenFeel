# 配置管理模块（config）

> 模块文档，由归档官在归档时维护。对应源码：`src/core/config.ts`。

## 职责

管理两层配置：项目级 `.openfeel/config.yaml` 与全局用户画像 `~/.config/openfeel/profile.yaml`，使用 YAML 解析 + Zod Schema 校验。

## 配置层级

| 层级 | 路径 | 内容 |
|------|------|------|
| 全局画像 | `~/.config/openfeel/profile.yaml` | `user`（name/lang）、`preferences`（auto_advance/review_mode/communication/confirm_threshold）、`history`（recent_projects） |
| 项目配置 | `.openfeel/config.yaml` | `meta`（version/project/tech_stack）、`defaults`（execution_mode/auto_advance/test_enabled/merge_mode）、`models`（default/agents/roles） |

优先级：项目配置覆盖全局默认，`readProfile()` 兜底默认值（zh-CN / disabled / full / concise / medium）。

**有效值级联（stage-42，口径权威）**：`builtin < profile.yaml < 项目 config.yaml defaults < 当前阶段 status.md`。解析器位于 `flow-manager`（`buildCascadeConfig` + 公开的 `resolveEffectiveConfig()`，详见 `manual/core/flow-manager.md`），命令出口为 `openfeel config effective [key]`。`config.ts` 侧只提供被级联复用的常量与读取函数：

- `DEFAULT_CONFIG`（导出，四键齐全：`execution_mode` / `auto_advance` / `test_enabled` / `merge_mode`）：级联最底层的 `builtin` 值来源，命令层不另写默认值。
- `DEFAULT_PROFILE`：画像是缺失时的安全降级画像。**v1.1.2-stage-47 起**：级联解析不再以 `readProfile()` 的返回值填充 `profileDefaults`，而是「画像文件真实存在 + 原始 YAML 显式声明 `preferences.auto_advance`」双条件判定（`config/BUG-003` 已修复 → 无画像环境来源落 `builtin`）；`DEFAULT_PROFILE` 仅作为 `readProfile()` 自身的异常安全兜底值保留。

**`meta.version` 语义**：为 OpenFeel 框架版本（非配置格式版本），与 package.json 同步。由 `config.ts` 的硬编码模板常量 `CONFIG_TEMPLATE_ZH/EN`（字面量，非插值）生成，版本升级须三处同步（项目实例 config.yaml + config.ts 双语言模板）。`flow.json meta.version='1.0'` 为内部格式，是独立字段不参与。

## 读写方法

| 方法 | 功能 |
|------|------|
| `readConfig(projectPath)` | 读取项目配置（yaml.parse + Zod 校验，缺失用默认值） |
| `writeDefaultConfig(projectPath, lang)` | 写入默认项目配置（**整体覆盖，无 `existsSync` 守卫、无备份**）。**契约（stage-47）**：调用方须先自行守卫——`init` 对已存在的 `config.yaml` 不再调用本函数（保留用户配置 + `skipped` 提示）；本函数不应被无守卫地用于既有用户配置 |
| `getConfigValue(projectPath, key)` / `setConfigValue(...)` | 读取 / 修改单个配置项 |
| `readProfile()` / `writeProfile(profile)` | 读取 / 写入全局用户画像（`readProfile` 异常安全：缺失/非法 YAML 回退 `DEFAULT_PROFILE`） |
| `CONFIG_TEMPLATE_ZH` / `CONFIG_TEMPLATE_EN` / `DEFAULT_CONFIG` / `DEFAULT_PROFILE` | 模板与默认值常量（`DEFAULT_CONFIG` 为级联 `builtin` 层权威值） |

> **写入安全（v1.1.0-stage-35）**：`writeProfile()` 与 `setGlobalConfig()`（`workspace/identity.ts`）为跨项目全局写入，均在 `global-config` 锁（`~/.openfeel/locks/global-config.lock`）内 + 原子写；`writeDefaultConfig()` / `setConfigValue()` / `ensureInfoJson()` 仅原子写（不加锁，低风险）。详见 `manual/core/fs.md`。

## 模型配置

`models.default` 为兜底模型，`models.agents` 按 Agent 名覆盖，`models.roles` 按角色覆盖。每个模型条目含 `provider`、`model_name`、可选 `base_url` 与 `api_key_env`。
