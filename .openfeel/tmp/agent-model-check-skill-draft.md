# Skill: agent-model-check

# Agent 模型检查与修复

## 何时使用

- Agent 调度时报 `Model not found: xxx`
- 需要验证某个 Agent 的模型是否可用
- 新增 Agent 后需确认模型配置正确
- 排查多模态（Vision）Agent 无法处理图片的问题

## 排查流程

### 第一步：确认报错信息

```
Model not found: {provider_key}/{model_id}
```

注意是否有 `Did you mean: xxx` 提示——如有，直接使用建议的模型名。

### 第二步：读取 auth.json 确认实际 provider key

```bash
# Windows PowerShell
cat ~/.local/share/opencode/auth.json

# macOS / Linux
cat ~/.local/share/opencode/auth.json
```

**关键点**：模型引用中的 provider 部分必须与 `auth.json` 中的 key 完全一致，而非 `opencode.jsonc` 中 `provider.name` 或 `provider.id`。

常见 provider key 示例：
- `alibaba-cn` — 阿里云中国区（DashScope）
- `deepseek` — DeepSeek
- `anthropic` — Anthropic
- `openai` — OpenAI
- `zhipuai` — 智谱 AI

### 第三步：确认模型是否支持目标能力

查阅 [Models.dev](https://models.dev) 确认模型属性：

| 能力需求 | 需确认的字段 | 示例 |
|----------|-------------|------|
| 视觉/图像分析 | Input = Yes | `qwen3-vl-plus` |
| 工具调用 | Tool Call = Yes | `qwen3.7-plus` |
| 结构化输出 | Structured = Yes | `qwen3.7-flash` |
| 推理/思考 | Reasoning = Yes | `qwq-plus` |

**常见陷阱**：
- `qwen3.7-plus` 是纯文本模型，不支持图像输入
- `qwen3-vl-plus` 是视觉模型，支持图像分析
- 模型名中的 `vl` 表示 Vision-Language

### 第四步：检查 opencode.jsonc 配置

```jsonc
{
  "agent": {
    "vision": {
      "model": "{auth.json_key}/{model_id}"  // 格式：provider_key/model_id
    }
  }
}
```

**配置规则**：
1. `provider` 块中的 `name` 和 `id` 仅用于显示，**不影响模型解析**
2. 模型引用格式严格为 `{auth.json中的key}/{model_id}`
3. 不要随意添加前缀（如 `alibaba/`、`Alibaba(China)/`）
4. 如果不需要自定义 provider 选项（如 baseURL），可以完全不写 `provider` 块

### 第五步：修改并重启

修改 `opencode.jsonc` 后**必须重启 opencode** 才能生效。运行中的会话使用启动时加载的配置。

### 第六步：验证

重启后调度目标 Agent 执行简单测试任务，确认无报错。

## 快速诊断清单

| 检查项 | 命令/操作 | 期望结果 |
|--------|----------|---------|
| auth.json 存在 | `cat ~/.local/share/opencode/auth.json` | 包含目标 provider 的 key |
| provider key 匹配 | 对比 auth.json key 与模型引用前缀 | 完全一致 |
| 模型支持目标能力 | 查阅 models.dev | Input/Tool Call 等字段 = Yes |
| opencode.jsonc 语法 | 检查 JSON 格式 | 无语法错误 |
| 重启生效 | 重启 opencode 后重新测试 | 无 Model not found 报错 |

## 多模态（Vision）Agent 专项

Vision Agent 必须配置多模态模型。Alibaba 系列视觉模型：

| 模型 ID | 完整引用（alibaba-cn） | 上下文 | 图像输入 |
|---------|----------------------|--------|---------|
| qwen3-vl-plus | `alibaba-cn/qwen3-vl-plus` | 262K | ✅ |
| qwen-vl-plus | `alibaba-cn/qwen-vl-plus` | 131K | ❌（旧版） |
| qwen-vl-max | `alibaba-cn/qwen-vl-max` | 131K | ❌（旧版） |

**推荐**：优先使用 `qwen3-vl-plus`，上下文最大且为最新视觉模型。

## 常见错误与修复

| 错误信息 | 原因 | 修复 |
|----------|------|------|
| `Model not found: Alibaba(China)/xxx` | 使用了自定义 provider name 而非 auth.json key | 改为 auth.json 中的实际 key |
| `Model not found: alibaba/xxx` | 内置 key 与实际注册的 key 不一致 | 检查 auth.json，使用实际 key |
| `Model not found: xxx. Did you mean: yyy` | 模型名拼写错误或不存在 | 使用 `Did you mean` 建议的名称 |
| Agent 调度成功但无法处理图片 | 配置了纯文本模型 | 改为带 `vl` 后缀的视觉模型 |
