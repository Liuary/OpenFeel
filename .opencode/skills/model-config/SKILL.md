---
name: model-config
description: 查找和配置 Agent 模型。当 Agent 报 "Model not found" 或需要调整/新增 Agent 模型时使用。覆盖 opencode.jsonc 配置、模型名查找方法、多模态模型（Vision）特殊注意事项。
---

# Skill: model-config

# Agent 模型查找与配置

## 何时使用

- Agent 调用时报 `Model not found: xxx`
- 需要为 Agent 更换或指定模型
- 新增 Agent 后需要配置其模型
- Vision / 多模态模型无法正常调用

## 配置位置

Agent 模型配置在 **`opencode.jsonc`**（项目根目录）中：

```jsonc
{
  "agent": {
    "vision": {
      "model": "qwen3-vl-plus"   // 模型名格式：provider/model-id 或 model-id
    }
  }
}
```

> ⚠️ **配置修改后必须重启 opencode 才能生效**。运行中的会话使用启动时加载的配置。

## 查找可用模型名

当收到 `"Model not found: xxx. Did you mean: aaa, bbb?"` 错误时：
- 列出平台已安装的可用模型名在 `Did you mean:` 之后
- 从中选择一个作为新模型名
- 不建议凭记忆猜测模型名，以平台提示为准

## Agent 定义文件中的 model 字段

`.opencode/agents/<name>.md` 中的 `model` 字段是声明性的（供 Agent 自述），**不直接控制平台模型分配**。实际的模型绑定由 `opencode.jsonc` 的 `agent.<name>.model` 控制。

因此修改模型需要两步：
1. 修改 `opencode.jsonc` 中的 `agent.<name>.model`
2. （可选）同步修改 `.opencode/agents/<name>.md` 和模板文件 `src/core/templates-data/agents/` 中的 `model` 字段，保持一致性

## 多模态（Vision）模型特殊规则

- Feel 的主力模型（DeepSeek V4 Pro）不支持图片输入
- 遇到图片输入时 Feel 会自动委托 Vision Agent
- Vision Agent 需要配置多模态模型（如 `qwen-vl-plus`、`qwen3-vl-plus`）
- 模型名不要随意添加前缀（如 `alibaba/`），以平台提示的可用名为准

## 项目 Agent 模型概览

| Agent | 模型类型 | 备注 |
|-------|---------|------|
| Feel（总统领） | 推理模型 | DeepSeek V4 Pro — 不支持多模态 |
| Planner | 推理模型 | — |
| Schemer | 推理模型 | — |
| Executor | 快速模型 (Flash) | — |
| Reviewer | 异种推理模型 (GLM) | — |
| Feel Tester | 推理模型 | — |
| 事务官 | 快速模型 (Flash) | — |
| Vision | 多模态模型 | 需配 qwen3-vl-plus |
| Archiver | 推理模型 | — |
