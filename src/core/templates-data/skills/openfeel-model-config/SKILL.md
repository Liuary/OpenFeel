---
name: openfeel-model-config
description: 查找和配置 Agent 模型。当 Agent 报 "Model not found" 或需要调整/新增 Agent 模型时使用。覆盖模型配置位置与优先级链（opencode 适配器 / Claude Code 适配器）、模型名查找方法、多模态模型（openfeel-vision）特殊注意事项。
---

# Skill: openfeel-model-config

# Agent 模型查找与配置

> 正文以**能力名**叙述；平台差异见 `### opencode 适配器` / `### Claude Code 适配器` 两小节。

## 何时使用

- Agent 调用时报 `Model not found: xxx`
- 需要为 Agent 更换或指定模型
- 新增 Agent 后需要配置其模型
- openfeel-vision / 多模态模型无法正常调用

## 配置位置

### opencode 适配器

Agent 模型配置在 **`opencode.jsonc`**（项目根目录）中：

```jsonc
{
  "agent": {
    "openfeel-vision": {
      "model": "{provider}/{model-id}"   // 示例占位（非框架默认）；模型名格式：provider/model-id 或 model-id
    }
  }
}
```

> ⚠️ **配置修改后必须重启 opencode 才能生效**。运行中的会话使用启动时加载的配置。

> 💡 **推荐**：可用 `openfeel model set/get/list --scope global|project` 一键读写两层级模型（全局 / 当前项目），无需手工定位文件。

### Claude Code 适配器

- Agent 模型配置在 Claude Code 侧的 `~/.claude/agents/*.md` frontmatter `model` 字段。
- 模型配置经 `/model`、`settings.json`/`env` 或网关（如 cc-switch）等途径确定。
- `settings.json`（本期由 stage-73 注入）仅作参考，模板默认 `model: inherit`。

## 查找可用模型名

当收到 `"Model not found: xxx. Did you mean: aaa, bbb?"` 错误时：
- 列出平台已安装的可用模型名在 `Did you mean:` 之后
- 从中选择一个作为新模型名
- 不建议凭记忆猜测模型名，以平台提示为准

## Agent 定义文件中的 model 字段

### opencode 适配器

模型生效链（v1.6.3 / REQ-070）为**两层配置 + 平台默认**：

```
项目 opencode.jsonc agent.model > 全局 opencode.jsonc agent.model > 平台默认
```

- 框架**不再提供 default 层**，部署的 agent `.md` 也**不带 frontmatter `model` 默认**——frontmatter 不构成来源，无需改模板源。
- 只有两处显式配置位，取第一个非空值；两层都未设置时走平台默认：
  1. 项目根 `opencode.jsonc` 的 `agent.<name>.model`（`--scope project`）
  2. `~/.config/opencode/opencode.jsonc` 的 `agent.<name>.model`（`--scope global`）
- 推荐 `openfeel model set <agent> <provider>/<model-id> --scope global|project`（避免手工定位与改错层）。

### Claude Code 适配器

Claude Code 模型解析优先级链：项目 `.claude/agents` > 用户 `~/.claude/agents`；frontmatter `model` **优先于** `inherit`。

**用户主权键（`model`）——正式配置位与部署保护**：

- 用户级 `~/.claude/agents/<name>.md` 的 frontmatter `model` 是 Claude 侧的**正式配置位**；
- `openfeel update`（含 `setup --tools claude`）**保留**该键的既有值（用户主权键机制：键级「无则创建、有则不覆盖」）——
  升级 CLI **不会**覆盖你设的模型；删掉该行再部署则回归模板默认（`inherit`）；
- 其余 frontmatter 字段（`description` / `tools` 等）仍由框架覆盖；正文自定义写在受管区外。
- opencode 侧同源同语义：`~/.config/opencode/agents/<name>.md` 的 `model` 同样受部署保护。

## 多模态（openfeel-vision）模型特殊规则

### opencode 适配器

- 主会话（Feel）的能力边界取决于平台/会话所选模型，框架不预设
- 遇到图片输入时主会话会自动委托 openfeel-vision Agent
- openfeel-vision Agent 须选支持图像输入的模型（由平台/会话或 global/project 配置决定；框架不预设）
- 模型名不要随意添加前缀（如 `alibaba/`），以平台提示的可用名为准
- **模型引用格式**：`{auth.json中的key}/{模型ID}`，不是 `provider.name` 也不是 `provider.id`
- 读取 `~/.local/share/opencode/auth.json` 确认实际 provider key（常见：`alibaba-cn`、`deepseek`、`zhipuai`）
- `provider` 块中的 `name` 和 `id` 仅用于显示，不影响模型解析

### Claude Code 适配器

- 多模态由 Claude 侧模型决定；`openfeel-vision` subagent 须选支持图像输入的模型。

## 项目 Agent 模型概览

| Agent | 模型类型（能力建议） | 备注 |
|-------|---------|------|
| 主会话（Feel） | 推理模型 | —（由平台/会话决定） |
| openfeel-planner | 推理模型 | — |
| openfeel-schemer | 推理模型 | — |
| openfeel-executor | 快速模型（由平台提供） | — |
| openfeel-reviewer | 推理模型（异族可选增强） | — |
| openfeel-feel-tester | 推理模型 | — |
| 事务官 | 快速模型（由平台提供） | — |
| openfeel-vision | 多模态模型 | 须选支持图像输入的模型（由平台/会话或 global/project 决定） |
| openfeel-archiver | 推理模型 | — |
