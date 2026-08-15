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

**`meta.version` 语义**：为 OpenFeel 框架版本（非配置格式版本），与 package.json 同步。由 `config.ts` 的硬编码模板常量 `CONFIG_TEMPLATE_ZH/EN`（字面量，非插值）生成，版本升级须三处同步（项目实例 config.yaml + config.ts 双语言模板）。`flow.json meta.version='1.0'` 为内部格式，是独立字段不参与。

## 读写方法

| 方法 | 功能 |
|------|------|
| `readConfig(projectPath)` | 读取项目配置（yaml.parse + Zod 校验，缺失用默认值） |
| `writeDefaultConfig(projectPath, lang)` | 写入默认项目配置 |
| `getConfigValue(projectPath, key)` / `setConfigValue(...)` | 读取 / 修改单个配置项 |
| `readProfile()` / `writeProfile(profile)` | 读取 / 写入全局用户画像 |

## 模型配置

`models.default` 为兜底模型，`models.agents` 按 Agent 名覆盖，`models.roles` 按角色覆盖。每个模型条目含 `provider`、`model_name`、可选 `base_url` 与 `api_key_env`。
