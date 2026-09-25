---
name: openfeel-model-config
description: 查找和配置 Agent 模型。当 Agent 报 "Model not found" 或需要调整/新增 Agent 模型时使用。覆盖 opencode.jsonc 配置、模型名查找方法、多模态模型（openfeel-vision）特殊注意事项。
---

# Skill: openfeel-model-config

# Agent 模型查找与配置

## 何时使用

- Agent 调用时报 `Model not found: xxx`
- 需要为 Agent 更换或指定模型
- 新增 Agent 后需要配置其模型
- openfeel-vision / 多模态模型无法正常调用

## 配置位置

Agent 模型配置在 **`opencode.jsonc`**（项目根目录）中：

```jsonc
{
  "agent": {
    "openfeel-vision": {
      "model": "qwen3-vl-plus"   // 模型名格式：provider/model-id 或 model-id
    }
  }
}
```

> ⚠️ **配置修改后必须重启 opencode 才能生效**。运行中的会话使用启动时加载的配置。

> 💡 **推荐**：可用 `openfeel model set/get/list --scope default|global|project` 一键读写三层级模型（工具默认 / 全局 / 当前项目），无需手工定位文件。

## 查找可用模型名

当收到 `"Model not found: xxx. Did you mean: aaa, bbb?"` 错误时：
- 列出平台已安装的可用模型名在 `Did you mean:` 之后
- 从中选择一个作为新模型名
- 不建议凭记忆猜测模型名，以平台提示为准

## Agent 定义文件中的 model 字段

`.opencode/agents/<name>.md` 的 frontmatter `model:` 字段**是生效的，且优先于** `opencode.jsonc` 的 `agent.<name>.model`（stage-40 REV-1606 实测）。opencode 模型解析优先级链：

```
项目 agents frontmatter > 全局 agents frontmatter > 项目 opencode.jsonc agent.model > 全局 opencode.jsonc agent.model > opencode 默认
```

因此修改模型时以 frontmatter 为准（只改 jsonc 会被 frontmatter 遮蔽），建议两处同步保持一致：
1. 修改 `.opencode/agents/<name>.md` 的 frontmatter `model:`（模板源 `src/core/templates-data/opencode/agents/` 同步）
2. （可选，保持一致）同步修改 `opencode.jsonc` 的 `agent.<name>.model`

## 多模态（openfeel-vision）模型特殊规则

- Feel 的主力模型（DeepSeek V4 Pro）不支持图片输入
- 遇到图片输入时 Feel 会自动委托 openfeel-vision Agent
- openfeel-vision Agent 需要配置多模态模型（如 `qwen-vl-plus`、`qwen3-vl-plus`）
- 模型名不要随意添加前缀（如 `alibaba/`），以平台提示的可用名为准
- **模型引用格式**：`{auth.json中的key}/{模型ID}`，不是 `provider.name` 也不是 `provider.id`
- 读取 `~/.local/share/opencode/auth.json` 确认实际 provider key（常见：`alibaba-cn`、`deepseek`、`zhipuai`）
- `provider` 块中的 `name` 和 `id` 仅用于显示，不影响模型解析

## 项目 Agent 模型概览

| Agent | 模型类型 | 备注 |
|-------|---------|------|
| Feel（总统领） | 推理模型 | DeepSeek V4 Pro — 不支持多模态 |
| openfeel-planner | 推理模型 | — |
| openfeel-schemer | 推理模型 | — |
| openfeel-executor | 快速模型 (Flash) | — |
| openfeel-reviewer | 异种推理模型 (GLM) | — |
| openfeel-feel-tester | 推理模型 | — |
| 事务官 | 快速模型 (Flash) | — |
| openfeel-vision | 多模态模型 | 需配 qwen3-vl-plus |
| openfeel-archiver | 推理模型 | — |
