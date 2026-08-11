/**
 * OpenCode 适配器更新编排
 * 在目标项目中生成 Agent 定义、Skill 定义、instructions/core.md，并更新 opencode.jsonc 配置。
 *
 * 变更摘要 (v3-stage-04 第二轮):
 * - 新增 instructions/core.md 创建（从 init.ts 迁移至此，职责归位适配器层）
 */
import { writeFileSync, existsSync, readFileSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { loadAgentTemplate, listAgentIds, loadTemplate } from './template-loader.js';
import { recordProjectLang, getGlobalConfig, getLang } from './workspace/identity.js';
import { getCliLang } from './i18n.js';

// 新增：update_state.json hash 比对与冲突检测
import {
  hashContent,
  loadUpdateState,
  saveUpdateState,
  createUpdateState,
  updateFileHash,
  markFileConflict,
  getOpenfeelVersion,
  type UpdateState,
} from './update-state.js';

/** 更新结果 */
export interface UpdateResult {
  created: string[];  // 新创建的文件列表
  updated: string[];  // 更新的文件列表
  skipped: string[];  // 跳过的文件（已存在且内容一致）
  conflicts: string[];  // 冲突文件相对路径列表（用户手动修改，拒绝覆盖）
}

/** AGENTS.md 语言冲突错误（由命令层捕获处理） */
export class AgentsMdLangConflictError extends Error {
  constructor(
    public projectLang: string,
    public requestedLang: string,
  ) {
    super(`AGENTS.md language conflict: project=${projectLang}, requested=${requestedLang}`);
    this.name = 'AgentsMdLangConflictError';
  }
}

// ─── 支持的工具注册表 ──────────────────────────────────────────────

/** 支持的 AI 工具条目 */
export interface ToolEntry {
  id: string;        // 适配器 ID（如 opencode）
  name: string;      // 显示名称（如 OpenCode）
  description: string;
  enabled: boolean;  // 是否默认启用
}

/** 当前支持部署的 AI 工具列表 */
export const supportedTools: ToolEntry[] = [
  {
    id: 'opencode',
    name: 'OpenCode',
    description: 'OpenCode AI 编码助手 — 生成 Agent 定义和 /opfx:* 技能',
    enabled: true,
  },
  // 后续扩展：
  // { id: 'claude', name: 'Claude Code', description: 'Anthropic Claude Code CLI', enabled: false },
  // { id: 'cursor', name: 'Cursor', description: 'Cursor IDE', enabled: false },
];

/**
 * 交互式选择部署目标工具
 * 使用 @inquirer/prompts checkbox，上下键导航，空格选中，回车确认
 * @returns 用户选中的工具 ID 列表
 */
export async function selectTools(): Promise<string[]> {
  try {
    const { checkbox } = await import('@inquirer/prompts');
    const choices = supportedTools.map((t) => ({
      name: `${t.name} — ${t.description}`,
      value: t.id,
      checked: t.enabled,
    }));

    const selected = await checkbox({
      message: '选择要部署的 AI 工具（空格选中，回车确认）',
      choices,
      pageSize: 10,
    });

    return selected;
  } catch {
    // 交互不可用时（如非 TTY 环境），回退到全部启用项
    console.log('（非交互环境，使用默认工具列表）');
    return supportedTools.filter((t) => t.enabled).map((t) => t.id);
  }
}
// ─── Agent 定义由 template-loader.ts 统一管理 ──────────────────────────

// ─── Skill 定义内容 ─────────────────────────────────────────────────

// AUTO-GENERATED-BEGIN: SKILL_DEFINITIONS
const SKILL_DEFINITIONS: Record<string, string> = {
  'agent-model-check': `---
name: agent-model-check
description: Agent 模型检查与修复。当 Agent 报 "Model not found" 或需要排查模型配置时使用。涵盖 auth.json 校验、provider key 匹配、模型能力确认、Vision 多模态专项指南。
---

# Skill: agent-model-check

# Agent 模型检查与修复

## 何时使用

- Agent 调度时报 \`Model not found: xxx\`
- 需要验证某个 Agent 的模型是否可用
- 新增 Agent 后需确认模型配置正确
- 排查多模态（Vision）Agent 无法处理图片的问题

## 排查流程

### 第一步：确认报错信息

\`\`\`
Model not found: {provider_key}/{model_id}
\`\`\`

注意是否有 \`Did you mean: xxx\` 提示——如有，直接使用建议的模型名。

### 第二步：读取 auth.json 确认实际 provider key

\`\`\`bash
# Windows PowerShell / macOS / Linux
cat ~/.local/share/opencode/auth.json
\`\`\`

**关键点**：模型引用中的 provider 部分必须与 \`auth.json\` 中的 key 完全一致，而非 \`opencode.jsonc\` 中 \`provider.name\` 或 \`provider.id\`。

常见 provider key 示例：
- \`alibaba-cn\` — 阿里云中国区（DashScope）
- \`deepseek\` — DeepSeek
- \`anthropic\` — Anthropic
- \`openai\` — OpenAI
- \`zhipuai\` — 智谱 AI

### 第三步：确认模型是否支持目标能力

查阅 [Models.dev](https://models.dev) 确认模型属性：

| 能力需求 | 需确认的字段 | 示例 |
|----------|-------------|------|
| 视觉/图像分析 | Input = Yes | \`qwen3-vl-plus\` |
| 工具调用 | Tool Call = Yes | \`qwen3.7-plus\` |
| 结构化输出 | Structured = Yes | \`qwen3.7-flash\` |
| 推理/思考 | Reasoning = Yes | \`qwq-plus\` |

**常见陷阱**：
- \`qwen3.7-plus\` 是纯文本模型，不支持图像输入
- \`qwen3-vl-plus\` 是视觉模型，支持图像分析
- 模型名中的 \`vl\` 表示 Vision-Language

### 第四步：检查 opencode.jsonc 配置

\`\`\`jsonc
{
  "agent": {
    "vision": {
      "model": "{auth.json_key}/{model_id}"  // 格式：provider_key/model_id
    }
  }
}
\`\`\`

**配置规则**：
1. \`provider\` 块中的 \`name\` 和 \`id\` 仅用于显示，**不影响模型解析**
2. 模型引用格式严格为 \`{auth.json中的key}/{model_id}\`
3. 不要随意添加前缀（如 \`alibaba/\`、\`Alibaba(China)/\`）
4. 如果不需要自定义 provider 选项（如 baseURL），可以完全不写 \`provider\` 块

### 第五步：修改并重启

修改 \`opencode.jsonc\` 后**必须重启 opencode** 才能生效。运行中的会话使用启动时加载的配置。

### 第六步：验证

重启后调度目标 Agent 执行简单测试任务，确认无报错。

## 快速诊断清单

| 检查项 | 命令/操作 | 期望结果 |
|--------|----------|---------|
| auth.json 存在 | \`cat ~/.local/share/opencode/auth.json\` | 包含目标 provider 的 key |
| provider key 匹配 | 对比 auth.json key 与模型引用前缀 | 完全一致 |
| 模型支持目标能力 | 查阅 models.dev | Input/Tool Call 等字段 = Yes |
| opencode.jsonc 语法 | 检查 JSON 格式 | 无语法错误 |
| 重启生效 | 重启 opencode 后重新测试 | 无 Model not found 报错 |

## 多模态（Vision）Agent 专项

Vision Agent 必须配置多模态模型。Alibaba 系列视觉模型：

| 模型 ID | 完整引用（alibaba-cn） | 上下文 | 图像输入 |
|---------|----------------------|--------|---------|
| qwen3-vl-plus | \`alibaba-cn/qwen3-vl-plus\` | 262K | ✅ |
| qwen-vl-plus | \`alibaba-cn/qwen-vl-plus\` | 131K | ❌（旧版） |
| qwen-vl-max | \`alibaba-cn/qwen-vl-max\` | 131K | ❌（旧版） |

**推荐**：优先使用 \`qwen3-vl-plus\`，上下文最大且为最新视觉模型。

## 常见错误与修复

| 错误信息 | 原因 | 修复 |
|----------|------|------|
| \`Model not found: Alibaba(China)/xxx\` | 使用了自定义 provider name 而非 auth.json key | 改为 auth.json 中的实际 key |
| \`Model not found: alibaba/xxx\` | 内置 key 与实际注册的 key 不一致 | 检查 auth.json，使用实际 key |
| \`Model not found: xxx. Did you mean: yyy\` | 模型名拼写错误或不存在 | 使用 \`Did you mean\` 建议的名称 |
| Agent 调度成功但无法处理图片 | 配置了纯文本模型 | 改为带 \`vl\` 后缀的视觉模型 |
`,
  'bug-acceptance': `---
name: bug-acceptance
description: 标准化 Bug 验收流程，供测试 Agent 或代码 Agent（自测后自查）调用。
---

# Bug 验收

## 输入

- 模块名 和 Bug 编号（如 \`模块A/BUG-001\`）

## 执行步骤

### 1. 读取 Bug 文件

读取 \`.openfeel/users/{username}/bugs/{模块名}/{编号}_{标题}.md\`，提取以下关键信息：
- 期望行为（\`## 期望行为\`）
- 复现步骤（\`## 复现步骤\`）
- 修复记录中的 Commit（\`## 修复记录\` 表格）

### 2. 运行测试套件

执行项目测试命令，确认修复未引入回归问题。

- 若测试未通过 → 验收不通过，备注记录失败用例。
- 跳过后续步骤，直接写入验收记录。

### 3. 按复现步骤比对

逐条执行复现步骤，对比实际行为与期望行为：

- 每条步骤匹配 → 通过。
- 任何步骤行为不符 → 不通过，备注记录差异。

### 4. 写入验收记录

在 Bug 文件的 \`## 验收记录\` 表格中追加一行：

| 时间 | 验收人 | 结论 | 备注 |
|------|--------|------|------|
| {当前时间} | {username} | 通过 / 不通过 | {测试摘要或失败原因} |

### 5. 更新状态与索引

- **验收通过**：Bug 状态改为 \`closed\`。
- **验收不通过**：Bug 状态退回 \`fixing\`。
- 更新 \`.openfeel/users/{username}/bugs/index.md\` 中该 Bug 的状态。
- 更新 \`.openfeel/users/{username}/bugs/log.md\` 追加变更摘要。

### 6. 归入公共域

验收通过后，核心结论写入 \`.openfeel/bugs/{module}.md\`，并在公共日志简要记录。
`,
  'check-kb': `---
name: check-kb
description: 渐进式查阅 .openfeel/kb/ 项目知识库，按当前任务需求返回最相关的参考信息。精确匹配无结果时自动触发语义检索回退，避免一次加载全量内容。
---

# 查阅知识库

## 输入

无（自动按当前任务上下文推断阅读范围）

## 执行步骤

### 1. 读取总索引

读取 \`.openfeel/kb/index.md\`，获取所有分类文件的摘要和最近更新时间。

### 2. 匹配相关分类

根据当前任务特征，确定需要查阅的分类：

| 任务特征 | 优先查阅 |
|----------|----------|
| 新功能开发、架构变更 | \`architecture.md\` |
| 代码编写、重构 | \`patterns.md\` |
| 编译/运行报错 | \`troubleshooting.md\` |
| 环境搭建、依赖变更 | \`setup.md\` |
| 跨领域任务或不熟悉模块 | 全部 \`index.md\` 摘要 |

### 3. 提取相关条目

读取匹配的分类文件，提取与当前任务相关的 \`[+]\` 条目。不加载标记为 \`[-]\` 的已禁用条目。

### 4. 输出摘要

按以下格式输出：

\`\`\`
📁 知识库查阅结果（{分类}）

[index.md 中的分类摘要]

相关条目：
- [architecture] "登录流程使用 OAuth2..." — 与当前任务相关：是
- [troubleshooting] "Module not found 时运行 npm ci" — 与当前任务相关：否
\`\`\`

若无相关条目，输出：\`知识库中暂无与当前任务相关的记录。\`

### 5. 语义检索回退（自动）

当精确匹配未找到任何相关条目（无 \`[+]\` 条目或所有条目与当前任务无关）时，**本技能自行执行语义检索**，无需调用方另行加载 \`search-kb\`：

1. **索引就绪检查**：检查 \`.openfeel/tmp/vectors/index.json\` 是否存在
2. **索引缺失时**：输出以下提示后结束，不再继续回退：
   \`\`\`
   💡 精确匹配未找到相关条目，语义检索的向量索引尚未构建。

      运行以下命令构建索引后再重试：
      pip install sentence-transformers
      python scripts/build_kb_index.py
   \`\`\`
3. **索引就绪时**：从当前任务上下文中提取关键词和需求描述，构造查询文本，执行：
   \`\`\`
   python scripts/search_kb.py "<查询文本>" --top-k 10 --verbose
   \`\`\`
4. **解析并输出**：将检索结果格式化输出：

   \`\`\`
   💡 精确匹配未找到相关条目，已自动回退到语义检索。

   🔍 语义检索结果（共 {N} 条）

     #{1} [{分类}] {条目标题}
       文件: {分类}.md | 得分: {score}
       内容: {摘要}

     #{2} ...
   \`\`\`

5. **低分提示**：若所有结果得分均低于 0.3，追加提示：
   \`\`\`
   ⚠️ 所有语义检索结果得分均低于 0.3，建议优化查询词或确认知识库覆盖范围。
   \`\`\`

6. **索引过期提示**：检索完成后追加：
   \`\`\`
   💡 如需确保索引为最新，可运行: python scripts/build_kb_index.py --dry-run
   \`\`\`

> 注：语义检索是 \`check-kb\` 的内置回退能力。调用方只需 \`skill("check-kb")\` 一次，无需再手动调用 \`search-kb\`。

### 6. 强制检索标记

Skill 加载后，根据步骤 3 的匹配结果决定是否追加提示：

- **若步骤 3 找到 ≥1 条相关条目**：在返回内容末尾追加以下提示：
  > ⚠️ 执行任务前，若知识库中有相关条目，务必参考。重复踩过的坑不可再犯。
  此提示确保 Agent 不会跳过知识库查询直接编码。

- **若步骤 3 无相关条目**：不追加强制提示，静默返回（已在步骤 4 输出"知识库中暂无相关记录，可继续执行"）。
`,
  'get-bugs': `---
name: get-bugs
description: 获取当前模块下状态为 open 或 fixing 的 Bug 列表，供代码 Agent 会话启动或承接时使用。
---

# 获取当前 Bug

## 输入

无（自动从 \`.openfeel/users/{username}/bugs/index.md\` 和模块归属中提取）

## 执行步骤

### 1. 读取模块索引

读取 \`.openfeel/users/{username}/bugs/index.md\`，获取当前 Agent 负责模块下的所有 Bug 条目（编号、标题、状态、优先级）。

### 2. 筛选活跃 Bug

过滤出状态为 \`open\` 或 \`fixing\` 的 Bug。

### 3. 格式化输出

按优先级排序（high → medium → low），输出格式：

\`\`\`
模块 [模块名] 待处理 Bug：
  [BUG-001] (open, high) 登录页面崩溃
  [BUG-003] (fixing, medium) 用户列表排序异常

共 2 个：1 个待承接(open) / 1 个修复中(fixing)
\`\`\`

### 4. 无 Bug 时

输出：\`模块 [模块名] 当前无待处理 Bug。\`
`,
  'get-stage-status': `---
name: get-stage-status
description: 读取 .openfeel/plan/{stage}/status.md，判断当前子计划状态、责任 Agent、是否允许自动推进以及下一步建议。用于 Reviewer/Executor/Feel Tester 在处理阶段任务前确认流程状态。
---

# 获取子计划状态

## 输入

- 计划阶段名 \`{stage}\`（如 \`stage01\`、\`auth-login\`）
- 若用户未提供阶段名，先读取 \`.openfeel/plan/index.md\` 查找当前活跃阶段；仍不明确时询问用户

## 执行步骤

### 0. 读取全局配置

读取 \`.openfeel/config.yaml\`，解析 \`defaults\` 中的 \`execution_mode\`、\`auto_advance\`、\`test_enabled\`、\`merge_mode\`。

### 1. 定位状态文件

读取 \`.openfeel/plan/{stage}/status.md\`。

若文件不存在：
- 不要自行进入自动流程。
- 返回 \`missing_status\`，提示需要 Architect 先创建状态文件。

### 2. 提取字段

解析以下字段：

- \`执行模式\`
- \`自动推进\`
- \`状态\`
- \`当前责任 Agent\`
- \`上一责任 Agent\`
- \`更新时间\`
- \`当前任务\`
- \`阻塞 / 暂停原因\`
- \`前置依赖\`
- \`依赖状态\`

### 3. 依赖就绪检查

若 \`status.md\` 中存在 \`前置依赖\` 字段且不为 \`无\`：

1. 读取 \`.openfeel/plan/deps.yaml\`，查找当前阶段的 \`depends_on\` 列表。
2. 对每条依赖检查其阶段状态：
   - \`type: hard\` 且依赖阶段状态为 \`done\` → 已满足
   - \`type: hard\` 且依赖阶段状态非 \`done\` → 未满足，阻塞
   - \`type: soft\` 且依赖阶段状态为 \`done\` → 已满足
   - \`type: soft\` 且依赖阶段状态非 \`done\` → 弱阻塞（警告但可启动）
   - \`type: mutual_exclusion\` 且依赖阶段状态为 \`done\` → 已满足
   - \`type: mutual_exclusion\` 且依赖阶段状态非 \`done\` → 阻塞，必须等待
3. 综合判断 \`deps_satisfied\`：
   - 所有 \`hard\` 和 \`mutual_exclusion\` 依赖满足 → \`true\`
   - 任一 \`hard\` 或 \`mutual_exclusion\` 依赖未满足 → \`false\`
4. 若 \`deps.yaml\` 不存在，视为无依赖声明，\`deps_satisfied = true\`。

### 4. 并行候选检测

当 \`deps_satisfied = true\` 时：

1. 读取所有阶段的 \`status.md\`，筛选满足以下条件的阶段：
   - \`deps_satisfied = true\`（本 Skill 递归判断）
   - \`状态\` 为 \`ready_for_code\` 或 \`auto_running\`
   - \`自动推进\` 为 \`enabled\`（若 status.md 未填则回退到 config.yaml \`auto_advance\`）
2. 收集为 \`parallel_candidates\` 列表，供 Feel 批量调度执行。

### 5. 判断自动推进资格

**字段回退**：若 \`status.md\` 未填写 \`执行模式\` 或 \`自动推进\`，从 \`.openfeel/config.yaml\` \`defaults\` 中读取对应值。

**测试状态排除**：若 \`.openfeel/config.yaml\` 中 \`test_enabled=false\`，则以下测试链路状态视为已禁用，不参与自动推进：
  - \`ready_for_test\`、\`test_writing\`、\`testing\`、\`bug_found\`、\`bug_fixing\`
  - 当前处于上述任一状态时，建议直接切换至 \`done\`（跳过测试链路）
  - \`review_passed\` 在 \`test_enabled=false\` 时等价于 \`done\`

只有同时满足以下条件才返回 \`can_auto_continue = true\`：

- \`执行模式\` 为 \`auto\`
- \`自动推进\` 为 \`enabled\`
- \`状态\` 不是 \`done\` 或 \`paused\`
- \`当前责任 Agent\` 不是 \`user\`
- \`依赖状态\` 不为 \`blocked\`（所有 hard 依赖必须满足）

否则返回 \`can_auto_continue = false\`，并说明原因。

### 6. 输出格式

\`\`\`markdown
## 子计划状态

- 阶段：{stage}
- 执行模式：manual | auto
- 自动推进：disabled | enabled
- 状态：{status}
- 当前责任 Agent：{agent}
- 前置依赖：{依赖列表 或 无}
- 依赖就绪：true | false
- 可自动推进：true | false
- 阻塞原因：{reason 或 无}

## 并行候选
{若依赖就绪且可自动推进，列出同批次可并行启动的其他阶段}

## 下一步建议
{根据状态给出下一步，例如：启动 Code、等待用户、启动 Tester、停止流程；若存在并行候选则建议批量启动}
\`\`\`

## 状态到下一步映射

| 状态 | 下一步建议 |
|------|------------|
| \`planned\` | 等待用户确认或 Planner 细化计划 |
| \`ready_for_code\` | Planner 可启动 Executor |
| \`coding\` | Executor 正在开发 |
| \`ready_for_review\` | Executor 可启动 Reviewer 审查，或等待用户触发 |
| \`review_failed\` | Reviewer 可启动 Executor 修复审查问题 |
| \`review_passed\` | Feel 可推进到 ready_for_test |
| \`ready_for_test\` | Feel 可启动 Feel Tester |
| \`test_writing\` | Feel Tester 正在写测试 |
| \`testing\` | Feel Tester 正在测试 |
| \`bug_found\` | Feel Tester 可启动 Executor 修复 Bug |
| \`bug_fixing\` | Executor 正在修复 Bug |
| \`done\` | 流程完成，停止 |
| \`paused\` | 等待用户处理暂停原因 |
`,
  'health': `---
name: health
description: 加载流水线健康检查结果，供 Agent 判断 flow.json 与工作区状态是否一致。
---

# 流水线健康检查

## 输入

无

## 执行步骤

1. 运行 \`openfeel flow health --quick\` 检查关键项（phase/current 合法性）
2. 需要全面检查时运行 \`openfeel flow health\`（含跨文件一致性、僵尸状态、config.yaml）
3. 解析输出中的 ✅ / ⚠️ / ❌ 项

## 输出

健康检查摘要：通过项数、失败项列表及原因，失败时给出修复建议
`,
  'model-check': `---
name: model-check
description: Feel 自检时检查所有 Agent 的模型配置状态，识别期望模型 vs 实际模型的差距，引导用户在目标工具中完成配置。首次配置后存储为部署模板，新项目可直接复用。
---

# 模型配置检查

## 触发时机

Feel Agent 在以下时机加载本 Skill：
- 会话启动自检（每次）
- 用户请求检查模型配置（按需）
- 新项目首次初始化后（\`openfeel init\`）

## 执行步骤

### 1. 识别当前平台

读取 \`opencode.jsonc\`（或对应平台的配置文件），确定当前适配器平台：

| 配置文件 | 平台 |
|----------|------|
| \`opencode.jsonc\` | OpenCode |
| \`kilo/kilo.json\` | Kilo |
| \`claude/claude.json\` | Claude |

若无平台配置文件，提示用户当前不在支持的平台中。

### 2. 扫描 Agent 定义

扫描 \`.opencode/agents/\`（或对应平台的 agents/ 目录）下所有 \`.md\` 文件，提取每个 Agent 的模型需求。

**提取规则（优先级从高到低）**：

| 优先级 | 来源 | 识别方式 |
|:--:|------|----------|
| 1 | YAML frontmatter \`model\` 字段 | 如 \`model: fast\`，直接提取 |
| 2 | 正文「模型选择」章节 | 搜索关键词：\`主力推理模型\` / \`推理模型\` / \`快速模型\` / \`异种推理模型\` |
| 3 | frontmatter \`description\` 字段 | 搜索上述关键词 |
| 4 | 角色回退表 | 按 Agent 文件名回退（见下方角色映射表） |

**角色映射回退表**（当 Agent 文件中无任何模型声明时使用）：

| Agent 文件 | 默认模型角色 |
|------------|-------------|
| \`feel.md\` | \`primary_reasoning\`（主力推理） |
| \`planner.md\` | \`reasoning\`（推理） |
| \`executor.md\` | \`fast\`（快速） |
| \`reviewer.md\` | \`cross_model\`（异种推理） |
| \`archiver.md\` | \`reasoning\`（推理） |
| \`schemer.md\` | \`reasoning\`（推理） |
| \`feel-tester.md\` | \`reasoning\`（推理） |
| \`utility.md\` | \`fast\`（快速） |
| \`vision.md\` | \`multimodal\`（多模态） |

### 3. 检查 config.yaml 模型配置

读取 \`.openfeel/config.yaml\`，检查 \`models\` 节是否存在。

**已配置状态**：
\`\`\`yaml
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
\`\`\`

**配置字段说明**：
- \`provider\`：模型供应商（deepseek / openai / anthropic / zhipu / qwen 等）
- \`model_name\`：具体模型 ID
- \`base_url\`：API endpoint
- \`api_key_env\`：环境变量名，存储 API Key

### 4. 交叉对比：期望 vs 实际

对每个 Agent，执行三级匹配（与 Architect Agent 定义的优先级一致）：

\`\`\`
当前Agent → models.agents.{agent_id} 存在？
  ├─ 是 → 使用该配置  ✅
  └─ 否 → models.roles.{角色} 存在？
           ├─ 是 → 使用该配置  ✅
           └─ 否 → models.default 存在？
                    ├─ 是 → 使用默认配置  ⚠️（可能不满足角色要求）
                    └─ 否 → 无配置  ❌
\`\`\`

输出对比结果表：

\`\`\`markdown
| Agent | 角色要求 | 实际模型 | 配置来源 | 状态 |
|-------|----------|----------|----------|:--:|
| Feel | 主力推理 | deepseek-v4-pro | default | ⚠️ |
| Reviewer | **异种推理** | deepseek-v4-pro | default | ❌ 与主力相同！ |
| Executor | 快速 | deepseek-v4-pro | default | ⚠️ 未使用快速模型 |
\`\`\`

### 5. 输出检查报告

按以下格式向用户展示：

\`\`\`markdown
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
\`\`\`

### 6. 引导用户配置

若检查发现以下任一问题，**必须**使用 \`question\` 工具引导用户：

| 触发条件 | 引导内容 |
|----------|----------|
| \`models\` 节不存在 | "未检测到模型配置。你需要为不同角色分配模型吗？" → 引导创建 |
| Reviewer 使用与主力相同模型 | "⚠️ Reviewer 当前与 Feel 使用相同模型，异种交叉审查的核心优势无法发挥。建议为 Reviewer 配置不同的模型系列。" |
| Executor 使用推理模型 | "⚠️ Executor 建议使用快速模型以节省成本。是否配置？" |
| 关键 Agent 无任何配置 | "以下 Agent 无模型配置：{列表}。请配置。" |

### 7. 写入配置

用户确认后，将模型配置写入 \`.openfeel/config.yaml\` 的 \`models\` 节。若 \`models\` 节已存在则更新，不存在则追加。

写入后执行格式校验（\`python -m yaml.tool\` 或等效检查），确保 YAML 合法。

### 8. 存储部署模板

配置完成后，自动将 \`models\` 节导出为独立模板文件 \`.openfeel/models.template.yaml\`：

\`\`\`yaml
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
\`\`\`

此模板在下次 \`openfeel init\` 或新项目部署时自动检测并建议复用。

## 输出规范

- 状态图标：✅ 已满足、⚠️ 降级使用（可接受但非最优）、❌ 缺失或严重不匹配
- 报告语言：中文
- 每次检查后将结果摘要写入 \`.openfeel/log/\`（仅首次发现关键问题时）
`,
  'model-config': `---
name: model-config
description: 查找和配置 Agent 模型。当 Agent 报 "Model not found" 或需要调整/新增 Agent 模型时使用。覆盖 opencode.jsonc 配置、模型名查找方法、多模态模型（Vision）特殊注意事项。
---

# Skill: model-config

# Agent 模型查找与配置

## 何时使用

- Agent 调用时报 \`Model not found: xxx\`
- 需要为 Agent 更换或指定模型
- 新增 Agent 后需要配置其模型
- Vision / 多模态模型无法正常调用

## 配置位置

Agent 模型配置在 **\`opencode.jsonc\`**（项目根目录）中：

\`\`\`jsonc
{
  "agent": {
    "vision": {
      "model": "qwen3-vl-plus"   // 模型名格式：provider/model-id 或 model-id
    }
  }
}
\`\`\`

> ⚠️ **配置修改后必须重启 opencode 才能生效**。运行中的会话使用启动时加载的配置。

## 查找可用模型名

当收到 \`"Model not found: xxx. Did you mean: aaa, bbb?"\` 错误时：
- 列出平台已安装的可用模型名在 \`Did you mean:\` 之后
- 从中选择一个作为新模型名
- 不建议凭记忆猜测模型名，以平台提示为准

## Agent 定义文件中的 model 字段

\`.opencode/agents/<name>.md\` 中的 \`model\` 字段是声明性的（供 Agent 自述），**不直接控制平台模型分配**。实际的模型绑定由 \`opencode.jsonc\` 的 \`agent.<name>.model\` 控制。

因此修改模型需要两步：
1. 修改 \`opencode.jsonc\` 中的 \`agent.<name>.model\`
2. （可选）同步修改 \`.opencode/agents/<name>.md\` 和模板文件 \`src/core/templates-data/agents/\` 中的 \`model\` 字段，保持一致性

## 多模态（Vision）模型特殊规则

- Feel 的主力模型（DeepSeek V4 Pro）不支持图片输入
- 遇到图片输入时 Feel 会自动委托 Vision Agent
- Vision Agent 需要配置多模态模型（如 \`qwen-vl-plus\`、\`qwen3-vl-plus\`）
- 模型名不要随意添加前缀（如 \`alibaba/\`），以平台提示的可用名为准
- **模型引用格式**：\`{auth.json中的key}/{模型ID}\`，不是 \`provider.name\` 也不是 \`provider.id\`
- 读取 \`~/.local/share/opencode/auth.json\` 确认实际 provider key（常见：\`alibaba-cn\`、\`deepseek\`、\`zhipuai\`）
- \`provider\` 块中的 \`name\` 和 \`id\` 仅用于显示，不影响模型解析

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
`,
  'recover': `---
name: recover
description: 跨会话上下文恢复，供 Agent 在会话启动时重建流水线状态。
---

# 跨会话上下文恢复

## 输入

无

## 执行步骤

1. 运行 \`openfeel flow recover\` 获取全局状态、流水线阶段、当前操作、阻塞原因与待处理任务
2. 读取 \`.openfeel/users/{username}/dev_last.md\` 恢复上次操作状态与待续事项
3. 将两者合并为当前会话起点

## 输出

恢复摘要：流水线状态 + 阻塞项 + 待处理任务列表
`,
  'roadmap': `---
name: roadmap
description: 加载项目路线图，供 Agent 查看版本规划和里程碑。
---

# 路线图加载

## 输入

无（可传入版本号过滤，如 \`v5\`）

## 执行步骤

1. 运行 \`openfeel roadmap show\` 列出 \`.openfeel/roadmap/\` 下所有版本大纲，或读取指定 \`v{version}.md\`
2. 提取各版本「目标」「阶段划分」「里程碑」节
3. 对照 \`.openfeel/flow.json\` 中各阶段 phase 判断进度状态

## 输出

格式化路线图摘要：版本清单 + 各版本阶段进度
`,
  'search-kb': `---
name: search-kb
description: 语义检索 .openfeel/kb/ 项目知识库。当精确匹配无结果或任务描述模糊时，通过向量相似度搜索语义相关的知识条目。支持图谱遍历返回关联条目。
---

# 语义检索知识库

## 输入

- \`query\`（必需）：查询文本，描述当前任务需求、遇到的问题或想要查找的知识点。
- \`top_k\`（可选）：返回结果数量，默认 10。
- \`min_score\`（可选）：最低分数阈值，默认 0.1。分数低于此值的结果将被过滤。

## 前置条件

- 向量索引已构建（运行 \`python scripts/build_kb_index.py\`）
- 已安装 \`sentence-transformers\`（\`pip install sentence-transformers\`）
- 索引文件 \`.openfeel/tmp/vectors/index.json\` 存在
- （可选）图谱已构建（运行 \`python scripts/build_kb_index.py --graph\`），用于返回关联条目

## 执行步骤

### 1. 检查索引就绪

确认 \`.openfeel/tmp/vectors/index.json\` 文件存在。若不存在，拒绝执行并提示先运行 \`build_kb_index.py\`。

### 2. 执行语义检索

执行 \`python scripts/search_kb.py "<query>" --top-k <top_k> --min-score <min_score> --verbose\`。

### 3. 解析结果

输出格式化的检索结果摘要：

\`\`\`
🔍 语义检索结果（共 {N} 条）

  #{1} [architecture] OAuth2 登录流程设计
    文件: architecture.md | 得分: 0.87
    内容: 采用 Authorization Code Grant 流程...

  #{2} [patterns] 状态机模式使用约定
    文件: patterns.md | 得分: 0.72
    内容: 项目中所有状态流转统一使用 Switch + Enum...
\`\`\`

### 4. 图谱遍历（关联条目发现）

当查询命中条目后，若 \`.openfeel/tmp/graph.json\` 存在且命中条目在其中，按以下步骤执行图谱遍历：

#### 4.1 一度关联（直接关联）

读取 \`graph.json\`，查找命中条目的所有**直接引用**和**被直接引用**的条目：

\`\`\`
🔗 一度关联条目（直接关联）

  引用 → {N} 个条目：[[条目A]]、[[条目B]]
  被引用 ← {M} 个条目：[[条目C]]
\`\`\`

#### 4.2 二度关联（间接关联）

在一度关联的基础上，再展开一层，返回间接关联的条目：

\`\`\`
🔗🔗 二度关联条目（间接关联）

  引用 → [[条目D]]（经由 [[条目A]]）
  被引用 ← [[条目E]]（经由 [[条目C]]）
\`\`\`

二度关联按"经由哪个一度节点"分组展示，便于理解关联路径。

#### 4.3 遍历实现

执行 \`python scripts/kb_graph.py --from "<命中条目标题>" --depth 2\`，解析子图输出提取关联节点和边。

### 5. 智能解读

结合当前任务上下文解读检索结果：
- 标注与当前任务高度相关的条目
- 标注可能需要进一步查阅的条目
- 若所有结果得分均低于 0.3，建议用户优化查询词或确认知识库覆盖范围
- 若图谱返回的关联条目与检索结果重叠，合并去重并标注来源（语义匹配 / 图谱关联）

## 输出格式

\`\`\`
## 语义检索结果

查询: "{query}"
结果数: {N}

{格式化结果列表}

## 关联条目（图遍历）

{一度关联条目列表}

{二度关联条目列表}

### 解读
- 相关条目（得分 ≥ 0.5）: {count} 条，可直接参考
- 弱相关条目（0.3 ≤ 得分 < 0.5）: {count} 条，建议进一步确认
- 低相关条目（得分 < 0.3）: {count} 条，可能不适用
- 图关联条目（未被语义检索命中）: {count} 条
\`\`\`

## 参数扩展

新增可选参数：

- \`--with-graph\`：启用图谱遍历返回关联条目（默认启用，若 graph.json 不可用则静默跳过）
- \`--graph-depth\`：图谱遍历深度，1=一度关联，2=二度关联（默认: 2）

## 注意事项

- 向量索引是缓存层，文件系统始终是 single source of truth。若检索结果与预期不符，检查索引是否过期（运行 \`--dry-run\` 查看变更文件）
- 图谱链接亦是缓存层，Markdown 文件中 \`[[wikilink]]\` 是真实数据源；图谱可随时通过 \`python scripts/build_kb_index.py --graph\` 重建
- 语义检索适合模糊查询和探索性搜索，精确关键词匹配优先使用 \`check-kb\`
- 此技能是 \`check-kb\` 的回退方案——当 \`check-kb\` 精确匹配无结果时可自动调用
- 图遍历返回的关联条目仅基于已建立的 wikilink 链接，若条目未引用或被引用其他条目，图谱中不会出现对应关联
`,
  'sync-status': `---
name: sync-status
description: 聚合所有成员的任务进度视图，供任意 Agent 快速了解项目整体协作状态。
---

# Skill: sync-status

# 聚合任务进度

## 输入

无（自动从 \`.openfeel/dev/current.md\` 提取）

## 执行步骤

### 1. 读取进度文件

读取 \`.openfeel/dev/current.md\`，提取所有 \`@{username}\` 行。

### 2. 解析任务条目

对每行提取：
- **成员**：\`@{username}\` 后的用户名
- **模块**：\`[模块名]\` 或 \`[-]\`
- **状态**：\`进行中\` / \`阻塞\` / \`已完成\`
- **描述**：状态后的任务描述文本
- **锁定**：若有 \`🔒\` 标记，列出锁定的文件

### 3. 查漏补缺

- 对比 \`.openfeel/users/\` 下的所有用户目录，检查是否有成员在 \`current.md\` 中无记录
- 若有，标记为「未同步」

### 4. 格式化输出

按状态分组输出（进行中 → 阻塞 → 已完成 → 未同步），格式：

\`\`\`
📊 项目协作进度

🟢 进行中（N 人）
  @alice  [auth] 登录模块重构
    🔒 src/auth/login.py
  @bob    [db]   数据库迁移脚本编写
    🔒 migrations/v2.sql

🟡 阻塞（M 人）
  @charlie [api] 等待第三方 OAuth 审批

🔵 已完成（K 人）
  @dave [config] 环境变量模板补充

⚪ 未同步（L 人）
  @eve — 尚未在 current.md 中声明任务
\`\`\`

### 5. 偏离告警

若发现同一模块有 2 人同时标记为「进行中」且无 🔒 区分，输出告警：

\`\`\`
⚠️ 模块 [module_name] 多人同时活跃，请确认无冲突
\`\`\`

## 输出

格式化后的 Markdown 进度摘要，不含文件修改。

Base directory for this skill: file:///C:/Code/AI/AI_Prompt/.kilo/skills/sync-status
`,
  'update-stage-status': `---
name: update-stage-status
description: 标准化更新 .openfeel/plan/{stage}/status.md 的子计划状态、责任 Agent 和状态记录，避免各 Agent 随意改写状态文件。适用于自动闭环和人工流程中的阶段状态变更。
---

# 更新子计划状态

## 输入

- 计划阶段名 \`{stage}\`
- 新状态 \`{status}\`
- 当前责任 Agent \`{current_agent}\`
- 上一责任 Agent \`{previous_agent}\`
- 说明 \`{note}\`
- 是否保持自动推进 \`{keep_auto}\`（默认保持原值）

### 可选输入（Worktree / 并行 管理）

当阶段以 worktree 模式运行时，可额外传入以下字段：

- \`worktree_branch\`：worktree 分支名（如 \`auto-stage-02\`）
- \`parallel_batch\`：并行批次标识（如 \`batch-2026-05-15-001\`），同一批次并行启动的 worktree 共享此标识
- \`parallel_stages\`：同批次并行阶段列表（如 \`[stage-04]\`）
- \`merge_status\`：合并状态（\`not_started\` / \`pending_merge\` / \`merged\` / \`cleanup_ready\` / \`cleaned\`）
- \`depends_status\`：依赖状态（\`pending\` / \`satisfied\` / \`blocked\`），当依赖阶段完成时更新

## 执行步骤

### 0. 读取全局配置

读取 \`.openfeel/config.yaml\`，获取 \`defaults\` 中的 \`execution_mode\`、\`auto_advance\`、\`merge_mode\`。

### 1. 读取状态文件

读取 \`.openfeel/plan/{stage}/status.md\`。

若文件不存在且当前 Agent 为 Architect：
  1. 从 \`.openfeel/config.yaml\` \`defaults\` 读取 \`execution_mode\`、\`auto_advance\` 作为初始值
  2. 按模板创建 \`status.md\`，将 config 默认值写入对应字段
其他 Agent 不得自行创建，必须提示用户或 Architect 先初始化阶段状态。

### 2. 校验状态变更

允许的状态值：

\`\`\`text
planned | ready_for_code | coding | ready_for_review | review_failed | review_passed | ready_for_test | test_writing | testing | bug_found | bug_fixing | done | paused
\`\`\`

若新状态不在列表中，停止并说明错误。

### 3. 更新字段

**常规更新**（每次状态变更必须更新）：

- \`状态\`
- \`当前责任 Agent\`
- \`上一责任 Agent\`
- \`更新时间\`

**Worktree / 并行 更新**（仅在可选输入传入时更新，位于 \`## Worktree / Session\` 块）：

- \`分支名\` → \`worktree_branch\`（如 \`auto-stage-02\`）
- \`并行批次\` → \`parallel_batch\`
- \`并行阶段\` → \`parallel_stages\`
- \`合并状态\` → \`merge_status\`

**依赖状态更新**（位于文件顶部字段）：

- \`依赖状态\` → \`depends_status\`（当 Architect 检测到依赖阶段完成时更新，典型值：\`pending → satisfied\`）

除非用户明确要求，否则不得改变：

- \`执行模式\`
- \`自动推进\`
- \`前置依赖\`（由 Architect 在 Phase 3.5 中声明，运行时不应修改）

### 4. 追加状态记录

在 \`## 状态记录\` 表格末尾追加：

\`\`\`markdown
| yyyy-mm-dd HH:MM | {agent} | {旧状态} → {新状态} | {note} |
\`\`\`

### 5. 安全暂停规则

遇到以下情况必须将状态改为 \`paused\`，当前责任 Agent 改为 \`user\`：

- 计划外架构变更
- 需要修改范围超过原计划
- 权限不明确
- 测试环境缺失
- 连续两次验收失败
- 自动推进链路无法判断下一步

### 6. 合并状态处理

当子计划状态变为 \`done\` 或 \`review_passed\`（且 Reviewer 验收完毕）时，根据 \`.openfeel/config.yaml\` 中的 \`merge_mode\` 决定合并行为：

- **\`merge_mode=auto\`**：
  1. 将 \`合并状态\` 更新为 \`merged\`（实际合并由 Executor 执行 git 操作，Skill 仅更新状态字段）
  2. 将 \`合并状态\` 更新为 \`cleaned\`
  3. 在状态记录中注明"自动合并"
- **\`merge_mode=manual\`**：
  1. 将 \`合并状态\` 设为 \`pending_merge\`
  2. 输出提示：合并与清理需手动完成

### 7. 输出结果

输出更新摘要：

\`\`\`markdown
已更新 {stage}/status.md：
- 状态：{旧状态} → {新状态}
- 当前责任 Agent：{current_agent}
- 自动推进：保持 {enabled/disabled}
\`\`\`
`,
  'wizard': `---
name: wizard
description: 交互式流水线向导，供 Agent 在终端中逐步推进流水线阶段。
---

# 交互式流水线向导

## 输入

无

## 执行步骤

1. 运行 \`openfeel flow wizard\` 启动交互式向导
2. 按提示选择要推进的阶段和下一步 phase（基于当前阶段的可达 transitions）
3. 确认后执行推进，循环直至阶段 done 或退出

## 输出

向导推进结果：阶段 phase 变化（from → to），结束/退出提示

> 注：需交互式终端（TTY），非交互环境请改用 \`openfeel flow advance --stage <id> --to <phase>\`
`,
};
// AUTO-GENERATED-END: SKILL_DEFINITIONS

// ─── 新增的 Skill 名称列表 ─────────────────────────────────────────

const NEW_SKILL_NAMES = [
  'bug-acceptance',
  'check-kb',
  'get-bugs',
  'get-stage-status',
  'model-check',
  'search-kb',
  'sync-status',
  'update-stage-status',
];

// ─── 辅助函数 ──────────────────────────────────────────────────────

/**
 * 带冲突检测的写入函数（替代原 writeIfChanged）
 *
 * 三态逻辑：
 *  - 文件不存在 → created
 *  - 文件已存在 + hash 匹配 update_state 中记录 → 安全覆盖 → updated
 *  - 文件已存在 + hash 不匹配 → 拒绝覆盖 → conflicts
 *  - 文件已存在 + 不在 update_state 管理中 → 安全覆盖 → updated（降级）
 *  - 文件已存在 + update_state 不存在或损坏 → 安全覆盖 → updated（降级为旧行为）
 *
 * REV-001：此函数仅负责分类（created/updated/skipped/conflicts），
 * hash 的实际更新在 updateProject() 末尾统一处理，
 * 确保"冲突路径非冲突文件 hash 同步更新"。
 */
function writeWithMergeDetection(
  filePath: string,
  content: string,
  relativePath: string,
  updateState: UpdateState | null,
  created: string[],
  updated: string[],
  skipped: string[],
  conflicts: string[],
): void {
  if (!existsSync(filePath)) {
    // 文件不存在 → 新建
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, content, 'utf-8');
    created.push(relativePath);
    return;
  }

  const existing = readFileSync(filePath, 'utf-8');

  // 内容相同 → skip（快速路径：全文比对，避免 hash 计算）
  if (existing === content) {
    skipped.push(relativePath);
    return;
  }

  // 检查 update_state 中是否有该文件的记录
  const fileState = updateState?.files[relativePath];
  if (fileState) {
    // 有记录 → 比对 hash
    const currentHash = hashContent(existing);
    if (currentHash === fileState.hash) {
      // hash 一致 → 用户未修改 → 安全覆盖
      writeFileSync(filePath, content, 'utf-8');
      updated.push(relativePath);
      return;
    }
    // hash 不一致 → 用户已修改 → 冲突！
    conflicts.push(relativePath);
    return;
  }

  // 无记录（降级路径：update_state 损坏或旧版本）→ 安全覆盖
  writeFileSync(filePath, content, 'utf-8');
  updated.push(relativePath);
}

/**
 * 解析 JSONC 文本为 JavaScript 对象
 * 先规范化换行符，再去除行注释（跳过字符串内部），最后解析
 */
function parseJsonc(text: string): Record<string, unknown> {
  // 去除 \r 控制字符（避免 Windows CRLF 导致 JSON 解析报 "bad control character"）
  const normalized = text.replace(/\r/g, '');

  // 逐字符处理，去除行注释（跳过字符串内部，避免匹配到 https:// 等 URL 中的 //）
  let result = '';
  let inString = false;
  let inEscape = false;
  let i = 0;

  while (i < normalized.length) {
    const ch = normalized[i];
    const next = normalized[i + 1];

    // 处理转义字符
    if (inEscape) {
      result += ch;
      inEscape = false;
      i++;
      continue;
    }

    if (ch === '\\' && inString) {
      result += ch;
      inEscape = true;
      i++;
      continue;
    }

    // 字符串边界
    if (ch === '"') {
      inString = !inString;
      result += ch;
      i++;
      continue;
    }

    // 行注释：不在字符串内时遇到 //
    if (!inString && ch === '/' && next === '/') {
      // 跳过直到行尾
      i += 2; // 跳过 //
      while (i < normalized.length && normalized[i] !== '\n') {
        i++;
      }
      // 保留换行符
      if (i < normalized.length && normalized[i] === '\n') {
        result += '\n';
        i++;
      }
      continue;
    }

    result += ch;
    i++;
  }

  return JSON.parse(result);
}

/**
 * 获取 opencode.jsonc 更新后的完整内容
 * 读取现有文件（若存在），合并更新后生成新的 JSONC 文本
 */
function buildUpdatedJsonc(projectPath: string): string {
  const jsoncPath = resolve(projectPath, 'opencode.jsonc');
  let jsoncObj: Record<string, unknown>;
  let rawContent: string | undefined;

  if (existsSync(jsoncPath)) {
    // 已有文件 → 解析并合并，保留原始字符串用于后续补丁式更新
    rawContent = readFileSync(jsoncPath, 'utf-8');
    jsoncObj = parseJsonc(rawContent);
  } else {
    // 新文件 → 基础结构
    jsoncObj = {
      $schema: 'https://opencode.openfeel/config.json',
      default_agent: 'feel',
      instructions: ['AGENTS.md', '.opencode/instructions/core.md'],
      skills: {},
    };
  }

  // 更新 default_agent
  jsoncObj.default_agent = 'feel';

  // 确保 instructions 存在
  if (!jsoncObj.instructions) {
    jsoncObj.instructions = ['AGENTS.md', '.opencode/instructions/core.md'];
  }

  // 合并 skills：保留原有 skill，添加新的 /opfx:* skill
  const skills = (jsoncObj.skills as Record<string, string>) || {};
  for (const name of NEW_SKILL_NAMES) {
    skills[name] = `.opencode/skills/${name}`;
  }
  jsoncObj.skills = skills;

  // 格式化为 JSONC 输出：若有原始内容则基于它做补丁式替换，否则从头构建
  return formatJsonc(jsoncObj, rawContent);
}

/**
 * 将对象格式化为美观的 JSONC 字符串
 * 若提供了 originalContent，基于原始字符串做补丁式替换，
 * 仅更新 default_agent 和 skills，其余字段（含注释和未识别字段）原样保留。
 */
function formatJsonc(obj: Record<string, unknown>, originalContent?: string): string {
  // 有原始内容 → 补丁模式：仅替换需要更新的字段，保留注释和未知字段
  if (originalContent) {
    let result = originalContent;

    // 替换 "default_agent" 的值
    result = result.replace(
      /("default_agent"\s*:\s*)("[^"]*")/,
      `$1"${obj.default_agent}"`,
    );

    // 替换 "skills" 块
    const skills = obj.skills as Record<string, string>;
    result = replaceSkillsFieldInJsonc(result, skills);

    return result;
  }

  // 无原始内容 → 从头构建（新文件场景）
  return buildJsoncFromObject(obj);
}

/**
 * 在 JSONC 原始字符串中查找并替换 "skills" 字段的整个对象块
 * 使用括号计数来正确处理嵌套对象，并自动处理末尾逗号
 */
function replaceSkillsFieldInJsonc(content: string, skills: Record<string, string>): string {
  // 查找 "skills" 键及冒号
  const keyRegex = /("skills"\s*:\s*)\{/;
  const keyMatch = content.match(keyRegex);

  if (!keyMatch || keyMatch.index === undefined) {
    // skills 字段不存在于原始文件中，不需要替换
    return content;
  }

  const keyStart = keyMatch.index;
  const openBraceIdx = keyStart + keyMatch[0].length - 1; // { 的位置

  // 找到匹配的 }，处理字符串内的大括号
  let depth = 1;
  let closeBraceIdx = openBraceIdx;
  let inString = false;
  let inEscape = false;

  for (let i = openBraceIdx + 1; i < content.length && depth > 0; i++) {
    const ch = content[i];
    if (inEscape) { inEscape = false; continue; }
    if (ch === '\\' && inString) { inEscape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (!inString) {
      if (ch === '{') { depth++; }
      else if (ch === '}') { depth--; }
    }
    if (depth === 0) {
      closeBraceIdx = i;
      break;
    }
  }

  // 检查 } 后面是否有逗号：若 } 后紧跟（仅跳过空白）有逗号，则将逗号及其后空白纳入 endIdx
  let endIdx = closeBraceIdx + 1;
  let scanIdx = endIdx;
  while (scanIdx < content.length && /[ \t]/.test(content[scanIdx])) {
    scanIdx++;
  }
  if (scanIdx < content.length && content[scanIdx] === ',') {
    scanIdx++; // 跳过逗号
    // 跳过逗号后的空白（包括换行）
    while (scanIdx < content.length && /[\s\n\r]/.test(content[scanIdx])) {
      scanIdx++;
    }
    endIdx = scanIdx;
  }

  // 确定替换后是否需要末尾逗号：检查 skills 之后是否还有其他顶层字段
  let hasMoreFields = false;
  if (endIdx < content.length) {
    // 从 endIdx 找到内容末尾前最后一个 }（根对象闭合）
    const remaining = content.slice(endIdx);
    const rootCloseIdx = remaining.lastIndexOf('}');
    if (rootCloseIdx > 0) {
      const between = remaining.slice(0, rootCloseIdx);
      hasMoreFields = /[^\s]/.test(between);
    }
  }

  // 构建新的 skills 块内容
  const skillEntries = Object.entries(skills);
  const skillLines = skillEntries.map(([key, value], idx) => {
    const comma = idx < skillEntries.length - 1 ? ',' : '';
    return `    "${key}": "${value}"${comma}`;
  });

  const blockContent = skillLines.join('\n');
  const newBlock = `"skills": {\n${blockContent}\n  }${hasMoreFields ? ',' : ''}`;

  return content.slice(0, keyStart) + newBlock + content.slice(endIdx);
}

/**
 * 从对象从头构建 JSONC（无原始内容时的回退路径）
 */
function buildJsoncFromObject(obj: Record<string, unknown>): string {
  const skills = obj.skills as Record<string, string>;

  // 构建 skills 条目行
  const skillEntries = Object.entries(skills);
  const skillsLines = skillEntries.map(([key, value], index) => {
    const comma = index < skillEntries.length - 1 ? ',' : '';
    return `    "${key}": "${value}"${comma}`;
  });

  const instructions = obj.instructions as string[];
  const instructionLines = instructions.map((inst, index) => {
    const comma = index < instructions.length - 1 ? ',' : '';
    return `    "${inst}"${comma}`;
  });

  // 构建完整 JSONC
  const hasExperimental = typeof obj.experimental === 'object' && obj.experimental !== null;
  const lines: string[] = [
    '{',
    '  "$schema": "https://opencode.openfeel/config.json",',
    `  "default_agent": "${obj.default_agent}",`,
    '  "instructions": [',
    ...instructionLines,
    '  ],',
    '  "skills": {',
    ...skillsLines,
    hasExperimental ? '  },' : '  }',
  ];

  // 如果有 experimental 字段，保留它
  if (hasExperimental) {
    const exp = obj.experimental as Record<string, unknown>;
    const expEntries = Object.entries(exp);
    const expLines = expEntries.map(([key, value], index) => {
      const comma = index < expEntries.length - 1 ? ',' : '';
      const val = typeof value === 'string' ? `"${value}"` : String(value);
      return `    "${key}": ${val}${comma}`;
    });
    lines.push('  "experimental": {');
    lines.push(...expLines);
    lines.push('  }');
  }

  lines.push('}');
  lines.push(''); // 末尾换行符

  return lines.join('\n');
}

// ─── 主函数 ────────────────────────────────────────────────────────

/**
 * 更新项目中的 OpenCode 适配文件
 * 在目标项目中生成 Agent 定义、Skill 定义，并更新 opencode.jsonc 配置
 *
 * @param projectPath - 目标项目根路径
 * @returns 更新结果（created / updated / skipped 文件列表）
 */
export function updateProject(
  projectPath: string,
  selectedTools: string[] = ["opencode"],
  lang: 'zh-CN' | 'en' = 'zh-CN',
  options?: { force?: boolean; interactive?: boolean; lang?: 'zh-CN' | 'en' }
): UpdateResult {
  const created: string[] = [];
  const updated: string[] = [];
  const skipped: string[] = [];

  // ── 增量更新：加载 update_state.json ──
  const state = loadUpdateState(projectPath);
  const conflicts: string[] = [];

  const agentsDir = resolve(projectPath, '.opencode', 'agents');
  const skillsDir = resolve(projectPath, '.opencode', 'skills');

  // 确保目标目录存在
  mkdirSync(agentsDir, { recursive: true });
  mkdirSync(skillsDir, { recursive: true });

  // 过滤：仅处理选中的工具
  if (!selectedTools.includes('opencode')) {
    return { created: [], updated: [], skipped: [], conflicts: [] };
  }

  // ── AGENTS.md 语言同步逻辑 ──
  let agentsDirHasContent = false;
  try {
    agentsDirHasContent = existsSync(agentsDir) && readdirSync(agentsDir).length > 0;
  } catch {
    agentsDirHasContent = false;
  }

  const agentsMdPath = resolve(projectPath, 'AGENTS.md');
  const agentsMdExists = existsSync(agentsMdPath);

  if (!agentsDirHasContent && !agentsMdExists) {
    // 情况 1：首次部署 → 使用全局默认语言部署 AGENTS.md
    const globalConfig = getGlobalConfig();
    const deployLang = lang ?? globalConfig.lang ?? 'zh-CN';
    const agentsMdContent = loadTemplate(deployLang, 'agents-md');
    writeFileSync(agentsMdPath, agentsMdContent, 'utf-8');
    created.push('AGENTS.md');
  } else if (!agentsMdExists && options?.lang) {
    // 情况 2b：已有 agents 目录但 AGENTS.md 被手动删除 + --lang 指定
    // → 用指定语言重新创建 AGENTS.md
    const agentsMdContent = loadTemplate(options.lang, 'agents-md');
    writeFileSync(agentsMdPath, agentsMdContent, 'utf-8');
    created.push('AGENTS.md');
  } else if (agentsMdExists && options?.lang) {
    // 情况 2：已有项目 + --lang 参数指定了语言
    const projectLang = getLang(projectPath);
    const requestedLang = options.lang;

    if (requestedLang !== projectLang) {
      // 语言不同 → 提示确认
      if (options?.force) {
        // --force → 跳过确认，直接覆盖
        const agentsMdContent = loadTemplate(requestedLang, 'agents-md');
        writeFileSync(agentsMdPath, agentsMdContent, 'utf-8');
        updated.push('AGENTS.md');
      } else if (options?.interactive) {
        // 交互模式 → 输出冲突警告，跳过 AGENTS.md，继续执行后续框架更新
        console.warn(`[update] AGENTS.md language mismatch: project=${projectLang}, requested=${requestedLang}. Skipped. Use --force to override.`);
        skipped.push('AGENTS.md (language conflict)');
      } else {
        // 非交互模式 → 输出警告，不覆盖
        console.warn(`[update] AGENTS.md language mismatch: project=${projectLang}, requested=${requestedLang}. Skipped. Use --force to override.`);
        skipped.push('AGENTS.md');
      }
    } else {
      // 语言相同 → 比较内容，模板更新时传播部署
      const templateContent = loadTemplate(requestedLang, 'agents-md');
      const existingContent = readFileSync(agentsMdPath, 'utf-8');
      if (existingContent !== templateContent) {
        writeFileSync(agentsMdPath, templateContent, 'utf-8');
        updated.push('AGENTS.md');
      } else {
        skipped.push('AGENTS.md (language unchanged)');
      }
    }
  } else if (agentsMdExists) {
    // 情况 3：已有项目 + 无 --lang 参数 → 比较内容，模板更新时传播部署
    const templateContent = loadTemplate(lang, 'agents-md');
    const existingContent = readFileSync(agentsMdPath, 'utf-8');
    if (existingContent !== templateContent) {
      writeFileSync(agentsMdPath, templateContent, 'utf-8');
      updated.push('AGENTS.md');
    } else {
      skipped.push('AGENTS.md (use existing)');
    }
  }

  // 记录项目语言映射到全局配置
  // 使用 options?.lang（用户通过 --lang 显式指定的语言）优先，
  // 回退到 lang（getCliLang 三级回退结果）。确保记录的语言与实际部署语言一致。
  try {
    recordProjectLang(projectPath, options?.lang ?? lang);
  } catch {
    // 记录失败不影响主流程
  }

  // 0. 生成 instructions/core.md（适配器层核心指令，与 init 的核心层分离）
  const instructionsDir = resolve(projectPath, '.opencode', 'instructions');
  mkdirSync(instructionsDir, { recursive: true });
  const coreInstructionsPath = join(instructionsDir, 'core.md');
  const coreContent = loadTemplate(lang, 'core-instructions');
  writeWithMergeDetection(coreInstructionsPath, coreContent, '.opencode/instructions/core.md', state, created, updated, skipped, conflicts);

  // 1. 生成 Agent 定义文件（从 template-loader 加载模板，按语言选择）
  for (const name of listAgentIds(lang)) {
    const content = loadAgentTemplate(lang, name);
    const filePath = join(agentsDir, `${name}.md`);
    const relPath = `.opencode/agents/${name}.md`;
    writeWithMergeDetection(filePath, content, relPath, state, created, updated, skipped, conflicts);
  }

  // 2. 生成 Skill 定义文件（每个 Skill 一个子目录，包含 SKILL.md）
  for (const [name, content] of Object.entries(SKILL_DEFINITIONS)) {
    const skillSubDir = join(skillsDir, name);
    mkdirSync(skillSubDir, { recursive: true });

    const filePath = join(skillSubDir, 'SKILL.md');
    const relPath = `.opencode/skills/${name}/SKILL.md`;
    writeWithMergeDetection(filePath, content, relPath, state, created, updated, skipped, conflicts);
  }

  // 3. 更新 opencode.jsonc
  const jsoncPath = resolve(projectPath, 'opencode.jsonc');
  const newContent = buildUpdatedJsonc(projectPath);
  const relJsoncPath = 'opencode.jsonc';
  writeWithMergeDetection(jsoncPath, newContent, relJsoncPath, state, created, updated, skipped, conflicts);

  // 重启提醒（仅在 opencode agent 配置更新时，且为交互模式）
  if (updated.some(f => f.startsWith('.opencode/agents/')) && process.stdout.isTTY) {
    const lang = getCliLang(projectPath);
    console.log(
      lang === 'en'
        ? 'opencode agent configuration updated. Please restart opencode to load the new configuration.'
        : 'opencode agent 配置已更新，请重启 opencode 以加载新配置。'
    );
  }

  // ── 写入冲突标记文件 ──
  if (conflicts.length > 0) {
    const openfeelVersion = getOpenfeelVersion();
    for (const relPath of conflicts) {
      const absPath = resolve(projectPath, relPath);
      const currentContent = existsSync(absPath)
        ? readFileSync(absPath, 'utf-8')
        : '';
      // 获取 incoming 内容：从模板/构建产物中重新读取
      // 注意：由于 writeWithMergeDetection 未实际写入，需单独获取 incoming 内容
      const incomingContent = getIncomingContent(projectPath, relPath, lang);
      writeConflictFile(projectPath, relPath, currentContent, incomingContent, openfeelVersion);
    }
  }

  // ── REV-001：统一更新 update_state.json ──
  // 规则：
  // 1. 无论有无冲突，所有 created/updated 文件的 hash 都必须更新到 state
  // 2. 有冲突时，额外标记冲突文件
  // 3. 首次 update（state === null）→ 创建新 state

  const newState: UpdateState = state ?? createUpdateState(projectPath, {});

  // 更新所有非冲突文件的 hash（created 和 updated）
  for (const relPath of [...created, ...updated]) {
    const absPath = resolve(projectPath, relPath);
    if (existsSync(absPath)) {
      const content = readFileSync(absPath, 'utf-8');
      updateFileHash(newState, relPath, content);
    }
  }

  // 标记冲突文件
  for (const relPath of conflicts) {
    markFileConflict(newState, relPath);
  }

  // 更新时间戳
  newState.last_update = new Date().toISOString();

  // 持久化
  saveUpdateState(projectPath, newState);

  return { created, updated, skipped, conflicts };
}

/**
 * 写入冲突标记文件到 .openfeel/update_conflicts/{relativePath}
 * 格式：Git 风格冲突标记
 *
 * REV-006：update_conflicts/ 目录已加入 .gitignore，不纳入版本管理。
 */
function writeConflictFile(
  projectPath: string,
  relativePath: string,
  currentContent: string,
  incomingContent: string,
  openfeelVersion: string,
): void {
  const conflictsBase = resolve(projectPath, '.openfeel', 'update_conflicts');
  mkdirSync(conflictsBase, { recursive: true });

  const conflictPath = resolve(conflictsBase, relativePath);
  mkdirSync(dirname(conflictPath), { recursive: true });

  const conflictContent = [
    `<<<<<<< CURRENT (用户修改版)`,
    currentContent,
    `=======`,
    incomingContent,
    `>>>>>>> INCOMING (openfeel v${openfeelVersion} 更新)`,
  ].join('\n');

  writeFileSync(conflictPath, conflictContent, 'utf-8');
}

/**
 * 根据相对路径获取 incoming（openfeel 期望写入）内容
 * 与 updateProject() 中生成内容的逻辑一一对应：
 *  - .opencode/instructions/core.md → loadTemplate(lang, 'core-instructions')
 *  - .opencode/agents/{name}.md → loadAgentTemplate(lang, name)
 *  - .opencode/skills/{name}/SKILL.md → SKILL_DEFINITIONS[name]
 *  - opencode.jsonc → buildUpdatedJsonc(projectPath)
 *  - AGENTS.md → loadTemplate(lang, 'agents-md')
 */
function getIncomingContent(
  projectPath: string,
  relativePath: string,
  lang: 'zh-CN' | 'en',
): string {
  // instructions/core.md
  if (relativePath === '.opencode/instructions/core.md') {
    return loadTemplate(lang, 'core-instructions');
  }

  // Agent 定义文件
  const agentMatch = relativePath.match(/^\.opencode\/agents\/(.+)\.md$/);
  if (agentMatch) {
    const name = agentMatch[1];
    return loadAgentTemplate(lang, name);
  }

  // Skill 定义文件
  const skillMatch = relativePath.match(/^\.opencode\/skills\/(.+)\/SKILL\.md$/);
  if (skillMatch) {
    const name = skillMatch[1];
    return SKILL_DEFINITIONS[name] ?? '';
  }

  // opencode.jsonc
  if (relativePath === 'opencode.jsonc') {
    return buildUpdatedJsonc(projectPath);
  }

  // AGENTS.md
  if (relativePath === 'AGENTS.md') {
    return loadTemplate(lang, 'agents-md');
  }

  // 未知路径 → 空内容（不应发生）
  return '';
}
