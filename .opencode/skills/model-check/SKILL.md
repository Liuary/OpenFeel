---
name: model-check
description: Feel 自检时检查所有 Agent 的模型配置状态，识别期望模型 vs 实际模型的差距，引导用户在目标工具中完成配置。首次配置后存储为部署模板，新项目可直接复用。
---

# 模型配置检查

## 触发时机

Feel Agent 在以下时机加载本 Skill：
- 会话启动自检（每次）
- 用户请求检查模型配置（按需）
- 新项目首次初始化后（`openfeel init`）

## 执行步骤

### 1. 识别当前平台

读取 `opencode.jsonc`（或对应平台的配置文件），确定当前适配器平台：

| 配置文件 | 平台 |
|----------|------|
| `opencode.jsonc` | OpenCode |
| `kilo/kilo.json` | Kilo |
| `claude/claude.json` | Claude |

若无平台配置文件，提示用户当前不在支持的平台中。

### 2. 扫描 Agent 定义

扫描 `.opencode/agents/`（或对应平台的 agents/ 目录）下所有 `.md` 文件，提取每个 Agent 的模型需求。

**提取规则（优先级从高到低）**：

| 优先级 | 来源 | 识别方式 |
|:--:|------|----------|
| 1 | YAML frontmatter `model` 字段 | 如 `model: fast`，直接提取 |
| 2 | 正文「模型选择」章节 | 搜索关键词：`主力推理模型` / `推理模型` / `快速模型` / `异种推理模型` |
| 3 | frontmatter `description` 字段 | 搜索上述关键词 |
| 4 | 角色回退表 | 按 Agent 文件名回退（见下方角色映射表） |

**角色映射回退表**（当 Agent 文件中无任何模型声明时使用）：

| Agent 文件 | 默认模型角色 |
|------------|-------------|
| `feel.md` | `primary_reasoning`（主力推理） |
| `planner.md` | `reasoning`（推理） |
| `architect.md` | `primary_reasoning`（主力推理） |
| `executor.md` | `fast`（快速） |
| `code.md` | `fast`（快速） |
| `code-worker.md` | `fast`（快速） |
| `reviewer.md` | `cross_model`（异种推理） |
| `review-worker.md` | `cross_model`（异种推理） |
| `tester.md` | `reasoning`（推理） |
| `test-writer.md` | `reasoning`（推理） |
| `archiver.md` | `reasoning`（推理） |
| `auto-runner.md` | `reasoning`（推理） |
| `debug.md` | `reasoning`（推理） |
| `ask.md` | `fast`（快速） |
| `schemer.md` | `reasoning`（推理） |
| `feel-tester.md` | `reasoning`（推理） |

### 3. 检查 config.yaml 模型配置

读取 `.openfeel/config.yaml`，检查 `models` 节是否存在。

**已配置状态**：
```yaml
models:
  default:           # 兜底配置（必填）
    provider: deepseek
    model_name: deepseek-v4-pro
    base_url: https://api.deepseek.com
    api_key_env: DEEPSEEK_API_KEY
  agents:            # Agent 级覆盖（可选）
    reviewer:
      provider: anthropic
      model_name: claude-sonnet-4-20250514
      base_url: https://api.anthropic.com
      api_key_env: ANTHROPIC_API_KEY
    executor:
      provider: deepseek
      model_name: deepseek-v4-flash
  roles:             # 角色级覆盖（可选）
    cross_model:
      provider: openai
      model_name: gpt-4o
```

**配置字段说明**：
- `provider`：模型供应商（deepseek / openai / anthropic / zhipu / qwen 等）
- `model_name`：具体模型 ID
- `base_url`：API endpoint
- `api_key_env`：环境变量名，存储 API Key

### 4. 交叉对比：期望 vs 实际

对每个 Agent，执行三级匹配（与 Architect Agent 定义的优先级一致）：

```
当前Agent → models.agents.{agent_id} 存在？
  ├─ 是 → 使用该配置  ✅
  └─ 否 → models.roles.{角色} 存在？
           ├─ 是 → 使用该配置  ✅
           └─ 否 → models.default 存在？
                    ├─ 是 → 使用默认配置  ⚠️（可能不满足角色要求）
                    └─ 否 → 无配置  ❌
```

输出对比结果表：

```markdown
| Agent | 角色要求 | 实际模型 | 配置来源 | 状态 |
|-------|----------|----------|----------|:--:|
| Feel | 主力推理 | deepseek-v4-pro | default | ⚠️ |
| Reviewer | **异种推理** | deepseek-v4-pro | default | ❌ 与主力相同！ |
| Executor | 快速 | deepseek-v4-pro | default | ⚠️ 未使用快速模型 |
```

### 5. 输出检查报告

按以下格式向用户展示：

```markdown
## 🔍 模型配置检查报告

**平台**：OpenCode
**配置文件**：.openfeel/config.yaml
**检查时间**：yyyy-mm-dd HH:MM

### 总览

- 已定义 Agent：{N} 个
- 有模型声明：{M} 个
- 模型配置已就绪：{K}/{N}
- 异种审查就绪：{是/否}

### Agent 模型匹配详情

| Agent | 角色要求 | 当前模型 | 来源 | 状态 |
|-------|----------|----------|------|:--:|
| ... | ... | ... | ... | ✅/⚠️/❌ |

### 关键问题

{列出所有 ❌ 和关键 ⚠️ 项}

### 下一步

{根据问题严重程度给出建议}
```

### 6. 引导用户配置

若检查发现以下任一问题，**必须**使用 `question` 工具引导用户：

| 触发条件 | 引导内容 |
|----------|----------|
| `models` 节不存在 | "未检测到模型配置。你需要为不同角色分配模型吗？" → 引导创建 |
| Reviewer 使用与主力相同模型 | "⚠️ Reviewer 当前与 Feel 使用相同模型，异种交叉审查的核心优势无法发挥。建议为 Reviewer 配置不同的模型系列。" |
| Executor 使用推理模型 | "⚠️ Executor 建议使用快速模型以节省成本。是否配置？" |
| 关键 Agent 无任何配置 | "以下 Agent 无模型配置：{列表}。请配置。" |

### 7. 写入配置

用户确认后，将模型配置写入 `.openfeel/config.yaml` 的 `models` 节。若 `models` 节已存在则更新，不存在则追加。

写入后执行格式校验（`python -m yaml.tool` 或等效检查），确保 YAML 合法。

### 8. 存储部署模板

配置完成后，自动将 `models` 节导出为独立模板文件 `.openfeel/models.template.yaml`：

```yaml
# OpenFeel 模型配置模板
# 部署新项目时，复制此文件内容到目标项目的 config.yaml models 节
# 或直接复制此文件到 .openfeel/ 并重命名为 config.yaml（需合并其他节）
#
# 最近配置时间：yyyy-mm-dd HH:MM
# 平台：OpenCode

models:
  default:
    provider: xxx
    model_name: xxx
    ...
  agents:
    reviewer:
      provider: xxx
      ...
  roles:
    cross_model:
      provider: xxx
      ...
```

此模板在下次 `openfeel init` 或新项目部署时自动检测并建议复用。

## 输出规范

- 状态图标：✅ 已满足、⚠️ 降级使用（可接受但非最优）、❌ 缺失或严重不匹配
- 报告语言：中文
- 每次检查后将结果摘要写入 `.openfeel/log/`（仅首次发现关键问题时）
