/**
 * OpenCode 适配器更新编排
 * 增量部署全局资产（全局 AGENTS.md、agent、skill）并更新全局/项目 opencode.jsonc 配置。
 *
 * 变更摘要:
 * - v3-stage-04: 新增 instructions/core.md 创建（从 init.ts 迁移）
 * - v1.1.1: 拆除项目 AGENTS.md 部署；全局约束由 core.md 改为全局 AGENTS.md（收归 openfeel setup）
 */
import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join, basename, isAbsolute, relative } from 'node:path';
import { loadAgentTemplate, listAgentIds, loadTemplate, loadClaudeConstraintTemplate, loadClaudeAgentTemplate, listClaudeAgentIds } from './template-loader.js';
import { recordProjectLang } from './workspace/identity.js';
import { t, getCliLang } from './i18n.js';
import { getOpencodeGlobalDir, getGlobalAgentsDir, getGlobalSkillsDir, getGlobalCoreMdPath, getGlobalAgentsMdPath, getGlobalOpencodeJsoncPath, getGlobalUpdateStatePath, getClaudeAgentsDir, getClaudeSkillsDir, getClaudeMdPath, getClaudeSettingsPath } from './global-paths.js';
import { mergeGlobalOpencodeJsonc, buildProjectOpencodeJsoncObj } from './opencode-config.js';
import { applyClaudeSettings } from './claude-settings.js';
import { atomicWriteFileSync } from './fs/atomic-write.js';
import { withFileLock, globalLockPath } from './fs/file-lock.js';
import { detectFileType, normalize, splitFrontmatter, parseRegion, wrapRegion, replaceRegion, mergeFrontmatter, serializeFrontmatter } from './managed-region.js';
import { appendUpdateInfo } from './update-infos.js';
import { backupFileBeforeWrite, BackupError, notifyBackupIfTTY, type BackupCommand } from './backup.js';
import { readJsoncFile } from './fs/safe-read.js';

// 新增：update_state.json hash 比对与冲突检测（项目 state + 全局 state）
import {
  hashContent,
  loadUpdateState,
  saveUpdateState,
  createUpdateState,
  loadGlobalUpdateState,
  saveGlobalUpdateState,
  createGlobalUpdateState,
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
  conflicts: string[];  // 冲突文件相对路径列表（本阶段三态下恒空，保留兼容命令层输出）
  appended: string[];  // 追加的文件列表（无标记 → 末尾追加受管区，待会话启动复核；malformed 不追加，见 REV-1001）
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
    description: 'OpenCode AI 编码助手 — 生成 Agent 定义和 openfeel-* 技能',
    enabled: true,
  },
  {
    id: 'claude',
    name: 'Claude Code',
    description: 'Anthropic Claude Code CLI — 生成 CLAUDE.md、Claude subagent 定义与共享 openfeel-* 技能',
    enabled: false,
  },
  // 后续扩展：
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
    console.log(t('update.nonInteractiveToolsTmpl', getCliLang(process.cwd())));
    return supportedTools.filter((t) => t.enabled).map((t) => t.id);
  }
}

/**
 * 解析 `--tools` 逗号分隔列表。
 * @returns tools=合法 id（保序去重）；invalid=非法项。空串/纯空白视为非法（触发 exit 1）。
 */
export function parseToolList(raw: string): { tools: string[]; invalid: string[] } {
  if (raw.trim() === '') {
    return { tools: [], invalid: [''] };
  }
  const valid = new Set(supportedTools.map((t) => t.id));
  const tools: string[] = [];
  const invalid: string[] = [];
  for (const part of raw.split(',')) {
    const v = part.trim();
    if (v === '') { continue; }        // 忽略尾随/空段
    if (!valid.has(v)) { invalid.push(v); continue; }
    if (!tools.includes(v)) { tools.push(v); }
  }
  return { tools, invalid };
}
// ─── Agent 定义由 template-loader.ts 统一管理 ──────────────────────────

// ─── Skill 定义内容 ─────────────────────────────────────────────────

// AUTO-GENERATED-BEGIN: SKILL_DEFINITIONS
export const SKILL_DEFINITIONS: Record<string, string> = {
  'openfeel-agent-model-check': `---
name: openfeel-agent-model-check
description: Agent 模型检查与修复。当 Agent 报 "Model not found" 或需要排查模型配置时使用。涵盖 auth.json 校验（opencode 适配器）、provider key 匹配、模型能力确认、openfeel-vision 多模态专项指南、Claude Code 侧模型（\`/model\`、网关）。
---

# Skill: openfeel-agent-model-check

# Agent 模型检查与修复

> 正文以**能力名**叙述；平台差异见 \`### opencode 适配器\` / \`### Claude Code 适配器\` 两小节。

## 何时使用

- Agent 调度时报 \`Model not found: xxx\`
- 需要验证某个 Agent 的模型是否可用
- 新增 Agent 后需确认模型配置正确
- 排查多模态（openfeel-vision）Agent 无法处理图片的问题

## 排查流程

### 第一步：确认报错信息

\`\`\`
Model not found: {provider_key}/{model_id}
\`\`\`

注意是否有 \`Did you mean: xxx\` 提示——如有，直接使用建议的模型名。

### 第三步：确认模型是否支持目标能力

查阅 [Models.dev](https://models.dev) 确认模型属性：

| 能力需求 | 需确认的字段 | 示例 |
|----------|-------------|------|
| 视觉/图像分析 | Input = Yes | \`deepseek-flash\` |
| 工具调用 | Tool Call = Yes | \`qwen3.7-plus\` |
| 结构化输出 | Structured = Yes | \`qwen3.7-flash\` |
| 推理/思考 | Reasoning = Yes | \`qwq-plus\` |

**常见陷阱**：
- \`qwen3.7-plus\` 是纯文本模型，不支持图像输入
- \`deepseek-flash\` 支持多模态图像输入（openfeel-vision 现用模型）
- 备选视觉模型：\`qwen3-vl-plus\`（模型名中的 \`vl\` 表示 Vision-Language）

### 第六步：验证

重启后调度目标 Agent 执行简单测试任务，确认无报错。

## 平台适配

### opencode 适配器

#### 第二步：读取 auth.json 确认实际 provider key

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

#### 第四步：检查 opencode.jsonc 配置

\`\`\`jsonc
{
  "agent": {
    "openfeel-vision": {
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

#### 第五步：修改并重启

修改 \`opencode.jsonc\` 后**必须重启 opencode** 才能生效。运行中的会话使用启动时加载的配置。

### Claude Code 适配器

- Claude Code **无 \`auth.json\`**。
- 模型/provider 由 **Claude 侧**决定（\`/model\`、\`settings.json\`/\`env\`、网关如 cc-switch）。
- Claude Code **无 \`opencode.jsonc\`**，模型引用不进 jsonc。

## 快速诊断清单

| 检查项 | 命令/操作 | 期望结果 |
|--------|----------|---------|
| auth.json 存在 | \`cat ~/.local/share/opencode/auth.json\` | 包含目标 provider 的 key |
| provider key 匹配 | 对比 auth.json key 与模型引用前缀 | 完全一致 |
| 模型支持目标能力 | 查阅 models.dev | Input/Tool Call 等字段 = Yes |
| opencode.jsonc 语法 | 检查 JSON 格式 | 无语法错误 |
| 重启生效 | 重启 opencode 后重新测试 | 无 Model not found 报错 |
| 模型由 Claude 侧配置 | \`/model\` 或 settings/env | 模型可用 |

## 多模态（openfeel-vision）Agent 专项

openfeel-vision Agent 必须配置多模态模型。当前默认使用 \`deepseek/deepseek-flash\`（已支持多模态图像输入）：

| 模型 ID | 完整引用 | 上下文 | 图像输入 |
|---------|---------|--------|---------|
| deepseek-flash | \`deepseek/deepseek-flash\` | — | ✅ |
| qwen3-vl-plus | \`alibaba-cn/qwen3-vl-plus\` | 262K | ✅（备选） |
| qwen-vl-plus | \`alibaba-cn/qwen-vl-plus\` | 131K | ❌（旧版） |
| qwen-vl-max | \`alibaba-cn/qwen-vl-max\` | 131K | ❌（旧版） |

**推荐**：优先使用 \`deepseek-flash\`（已内置多模态）；如需更大上下文可备选 \`qwen3-vl-plus\`。

> **Claude Code 适配器**：多模态由 Claude 侧模型决定；\`openfeel-vision\` subagent 须选支持图像输入的模型。

## 常见错误与修复

| 错误信息 | 原因 | 修复 |
|----------|------|------|
| \`Model not found: Alibaba(China)/xxx\` | 使用了自定义 provider name 而非 auth.json key | 改为 auth.json 中的实际 key |
| \`Model not found: alibaba/xxx\` | 内置 key 与实际注册的 key 不一致 | 检查 auth.json，使用实际 key |
| \`Model not found: xxx. Did you mean: yyy\` | 模型名拼写错误或不存在 | 使用 \`Did you mean\` 建议的名称 |
| Agent 调度成功但无法处理图片 | 配置了纯文本模型 | 改为支持图像输入的模型（如 \`deepseek-flash\`） |

> **Claude Code 适配器**：以上排查针对 opencode 的 \`auth.json\`/\`opencode.jsonc\`；Claude 侧的模型解析以 \`/model\`、\`settings.json\`/\`env\` 或网关配置为准。
`,
  'openfeel-bug-acceptance': `---
name: openfeel-bug-acceptance
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
  'openfeel-check-kb': `---
name: openfeel-check-kb
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

当精确匹配未找到任何相关条目（无 \`[+]\` 条目或所有条目与当前任务无关）时，**本技能自行执行语义检索**，无需调用方另行加载 \`openfeel-search-kb\`：

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

> 注：语义检索是 \`openfeel-check-kb\` 的内置回退能力。调用方只需加载一次：
> - opencode 适配器：\`skill("openfeel-check-kb")\`；
> - Claude Code 适配器：以 \`Skill\` 工具加载 \`openfeel-check-kb\`（工具名映射见 \`openfeel-tool-usage\`）。
> 无需再手动调用 \`openfeel-search-kb\`。

### 6. 强制检索标记

Skill 加载后，根据步骤 3 的匹配结果决定是否追加提示：

- **若步骤 3 找到 ≥1 条相关条目**：在返回内容末尾追加以下提示：
  > ⚠️ 执行任务前，若知识库中有相关条目，务必参考。重复踩过的坑不可再犯。
  此提示确保 Agent 不会跳过知识库查询直接编码。

- **若步骤 3 无相关条目**：不追加强制提示，静默返回（已在步骤 4 输出"知识库中暂无相关记录，可继续执行"）。
`,
  'openfeel-cli-usage': `---
name: openfeel-cli-usage
description: OpenFeel CLI 命令用法参考：命令清单与关键参数、15 个 phase 枚举与转移表、stageId 命名与目录映射约定、v1.1.2 新增能力（自描述/可纠错、--json 结构化输出、health --fix、scheme draft、knowledge dedup、纠正清理侧命令面）、v1.1.4 新增能力（checkpoint 选择性恢复 --stage/--dry-run、flow stage reset 精准复位、故障恢复路径）、v1.1.5 新增能力（setup --check [--json] 诊断 / 被动部署提示）、v1.1.6 新增能力（Claude Code 适配器 \`--tools claude\` / settings 注入）、v1.1.7 新增能力（双模式工作流 workflow_mode：flow mode 只读查询 / flow phases --mode 模式分节 / plan stage add --workflow-mode / stage set --workflow-mode / config set --sync-stages --stage）、v1.2.0 新增能力（需求流转命令组 \`openfeel req\`：需求 7 状态与 10 子命令 / 认领协议；flow.json 版本分片归档 \`flow archive\`：\`<version>\` / \`list\` / \`show\`）。当需要查询 CLI 命令、参数、phase、stageId、阶段命名时加载。
---

# OpenFeel CLI 用法参考

## 说明

- 定位：**查询型参考手册**（只读，不自执行）。回答「命令是什么、参数怎么给、phase/stageId 规则如何」。
- 边界：**执行型交互向导**请用 \`openfeel-wizard\` skill（跑 \`openfeel flow wizard\` 推进流水线）；本 skill 只承载静态知识查阅。
- 与 \`openfeel-tool-usage\` 协同：工具选择规范见该 skill；本 skill 补充 CLI 命令细节。
- 正文以**能力名**叙述；平台差异见 \`### opencode 适配器\` / \`### Claude Code 适配器\` 两小节。

> 本文档为 v1.2.0 快照；命令/参数细节以 \`openfeel <cmd> --help\`（本仓执行）实时输出为准（CLI 演进后本文档可能滞后）。
>
> ⚠️ **本仓自举**：本仓（openfeel 源码仓库）开发/执行时请用 \`node bin/openfeel.js <cmd>\`；安装后使用 \`openfeel <cmd>\`。

## 命令速查

| 命令 | 用途 | 关键参数 |
|------|------|----------|
| \`openfeel init [path]\` | 初始化项目工作区 | \`--lang <zh-CN\\|en>\`、\`--demo\`、\`--workspace-only\`、\`--non-interactive\` |
| \`openfeel setup\` | 部署全局框架配置（不建项目 \`.openfeel/\`）；\`--check\` 只读诊断全局部署一致性 | \`--lang <zh-CN\\|en>\`、\`--check [--json]\`、\`--tools <list>\` |
| \`openfeel update [path]\` | 部署适配文件到目标项目 | \`--lang\`、\`--force\`、\`--tools <list>\` |
| \`openfeel migrate [path]\` | Legacy 布局迁移（检测/备份/迁移/回滚） | \`--dry-run\`、\`--remap-assignee\`、\`--clean-global-core-md\`；\`migrate rollback\` |
| \`openfeel flow ...\` | 流水线状态管理 | 见下「flow 子命令」 |
| \`openfeel flow checkpoint restore\` | Checkpoint 恢复（全量 / 选择性 / 预览） | \`<file> [--force] [--stage <id>] [--dry-run]\`（无 \`--stage\`=全量覆盖，最后手段；\`--stage\`=按阶段回退；\`--dry-run\`=零写盘预览） |
| \`openfeel flow stage reset\` | 精准复位阶段 phase（\`flow advance\` 的对称复位，允许回退） | \`<stageId> --to <phase> [--dry-run]\`（受合法值域 + \`to=done\` 阻塞 REV 约束） |
| \`openfeel plan stage add\\|list\` | 工作阶段管理 | \`add <name> --deps <ids...> --tasks <items...> --exec-mode <manual\\|auto> --auto-advance <enabled\\|disabled> --workflow-mode <full\\|fast>\`（初值取 \`config.yaml.defaults\`；显式选项优先；\`--workflow-mode\` 覆盖 config 默认） |
| \`openfeel plan scheme create\\|publish\\|rename\\|list\\|remove\\|register\` | 操作方案管理 | \`create <stage> <title> [--draft]\`、\`publish <stage> <opId>\`、\`rename <stage> <opId> --title <text>\`、\`remove <stage> <opId> [--force] [--dry-run]\`、\`register <stage> [opId] [--dry-run]\`（补注册 fileOrphans） |
| \`openfeel stage status\\|set\\|task\` | \`status.md\` 原子操作 | \`set <id> --status/--exec-mode/--auto-advance/--review-agent/--workflow-mode\`、\`task <id> [no] --add/--done/--undone\`（\`stage create\` 已弃用） |
| \`openfeel config ...\` | 配置管理 | \`get\\|set <key> <value> [--global]\`（支持全量 \`defaults.*\`，且 \`defaults.X ≡ X\`）、\`set ... --sync-stages [--stage <ids...>]\`（批量写入已注册阶段 \`status.md\` 的 \`自动推进\`/\`执行模式\`/\`工作流模式\`；\`--stage\` 限定作用域，单独使用 / 与 \`--global\` 组合 → exit 1）、\`get-lang\\|set-lang\`、\`list-projects\`、\`effective [key]\` |
| \`openfeel model set\\|get\\|list\` | 模型三层级配置 | \`set <agent> <model>\` |
| \`openfeel lint i18n\\|kb\` | 健康检查（i18n 键一致性 / kb 过期引用） | 发现问题**非 0 退出** |
| \`openfeel knowledge ...\` | 知识库管理 | \`list\` / \`add\` / \`search\` / \`index\` / \`dedup\` |
| \`openfeel archive <stage>\` | 归档指定阶段（汇总产出、生成摘要、提取知识） | \`<stage>\` |
| \`openfeel req ...\` | 需求流转（需求管理命令组） | 见「v1.2.0 新增能力（stage-78~84）」节 |
| \`openfeel view list\\|accept\` | 审查条目验收（\`add\` 已移除，改用 \`flow review add\`） | — |
| \`openfeel project overview\` | 项目结构概览 | \`overview\`（无 \`list\`/\`info\` 子命令） |
| \`openfeel roadmap create\\|show\` | 分期大纲管理 | \`create <version>\`、\`show [version]\` |
| \`openfeel instructions <artifactId>\` | 为指定 artifact 生成结构化指令 | \`--change <name>\`、\`--schema <name>\`、\`--json\` |

**flow 子命令**：\`status\` / \`current\` / \`overview\` / \`phases\` / \`mode\`（\`[--stage <id>] [--json]\`，只读） / \`stage\`（\`add\` / \`remove\` / \`set --deps\` / **\`reset <id> --to <phase> [--dry-run]\`**）/ \`metrics\` / \`advance\`（\`--stage <id> --to <phase>\`、\`--op\`、\`--force\`、\`--dry-run\`、\`--quiet\`）/ \`attempt\` / \`log\` / \`review\` / \`retry\` / \`repair\` / \`ops\` / \`migrate\` / \`checkpoint\`（\`list\` / **\`restore <file> [--force] [--stage <id>] [--dry-run]\`**）/ \`health\` / \`recover\` / \`wizard\` / \`archive\`（\`<version>\` / \`list\` / \`show\`）。

**纠错/清理侧补充**：\`flow review add|resolve|update|remove\`；\`flow ops list [--stage <id>] [--json]\`（操作方案视图，draft 分组展示）；\`flow repair [--prune-orphans]\`（默认只报告，\`--prune-orphans\` 仅清键孤儿，单向不删文件）；\`plan scheme register\`（补注册**文件孤儿**：有 op 文件无注册键 → 写入 flow.json，\`--dry-run\` 零写盘；与 \`flow repair --prune-orphans\`（仅清键孤儿）对称）；**\`flow stage reset <id> --to <phase>\`**（\`advance\` 的**对称复位**：允许回退，受合法 phase 值域 + \`to=done\` 阻塞 REV 约束，\`--dry-run\` 零写盘）；**\`flow checkpoint restore <file> --stage <id> [--dry-run]\`**（按阶段选择性回退；\`--dry-run\` 差异预览零写盘）。

> 命令职责分层：\`plan stage add\`（完整，推荐）> \`flow stage add\`（仅注册 \`flow.json\`，不建目录）> \`stage create\`（已弃用）。

## v1.2.0 新增能力（stage-78~84）

- **flow.json 版本分片归档（\`flow archive\`）**：按版本号归档已收官历史（判据门：该版本全部阶段 done + 无 blocking open REV；归档文件落 \`.openfeel/flow-archive/{version}.json\`）。三个入口：\`openfeel flow archive <version>\`（执行归档；\`--dry-run\` 预览零写盘、\`--json\` 结构化输出）、\`openfeel flow archive list\`（列举已归档版本，只读）、\`openfeel flow archive show <version>\`（查看指定归档版本，只读）。**与顶层 \`openfeel archive <stage>\` 区分**：顶层命令是**阶段摘要归档**，\`flow archive\` 是 **flow.json 版本分片归档**，二者职责不同；常规命令不读 \`.openfeel/flow-archive/**\`（\`flow health\` 仅目录清单级对账）。
- **需求流转（\`openfeel req\`）**：需求层命令组（10 子命令：\`add\` / \`list\` / \`show\` / \`claim\` / \`release\` / \`set\` / \`link\` / \`advance\` / \`board\` / \`next\`）。需求 7 状态（\`draft\` / \`scheduled\` / \`in_progress\` / \`done\` / \`blocked\` / \`cancelled\` / \`rejected\`）；**需求进度由关联阶段 phase 聚合**（全部关联阶段 done → 需求自动 done）；认领协议 = \`owner\` + \`claimed_at\` 占用校验（无 TTL）。需求正文 \`.openfeel/requirements/REQ-NNN.md\` 为人读副本，**机读权威恒为 flow.json**。用法权威源见 \`openfeel-req\` skill；**v1.2.0 起提供**。

## v1.1.7 新增能力（stage-74~76）

- **双模式工作流（\`workflow_mode\`）**：值域 \`full | fast\`（默认 \`fast\`）。三层载体：\`config.yaml defaults.workflow_mode\`（项目默认 / 记忆）→ \`status.md「工作流模式」\`（阶段覆盖，**读取权威**）→ \`flow.json\` 冗余字段（可选、**不参与级联**）；级联优先序 \`status.md > config.yaml > builtin\`（\`profile.yaml\` 不承载）。只读查询：\`openfeel flow mode [--stage <id>] [--json]\`（当前模式 + 四源 \`source\`）。
- **fast 快线转移表（并列）**：\`transitions\` 共 **9 条目**（8 条流转键 + \`done\` 终止项）：\`plan_pending → plan_review\`（**计划审查必经**）、\`plan_review → plan_passed / plan_pending\`、\`plan_passed → exec_running\`、\`exec_running → review_pending\`、\`review_pending → review_failed / review_passed\`、\`review_failed → review_pending / exec_running\`（回环）、\`review_passed → archiving\`、\`archiving → done\`、\`done\`（终态）。**\`phases\` / \`advanceAccepted\` 恒 15 项、模式无关**；fast 下 6 个相位不可达（\`scheme_*\` / \`test_*\`）。
- **模式命令面**：\`plan stage add --workflow-mode <full|fast>\`（值域派生、非法 exit 1 不建阶段）、\`stage set <id> --workflow-mode <full|fast>\`（缺失字段插入）、\`flow phases [--mode <full|fast>] [--stage <id>]\`（模式分节；\`--json\` 追加 \`workflowMode\`）、\`config set ... --sync-stages [--stage <ids...>]\`（同步字段含「工作流模式」）。
- **\`config effective\` 四键**：\`auto_advance\` / \`execution_mode\` / \`merge_mode\` / \`workflow_mode\`。

## v1.1.6 新增能力（stage-68~73）

- **多 harness 并存**：\`openfeel setup\` / \`openfeel update\` 新增 \`--tools <逗号列表>\`（如 \`opencode,claude\`）；非法值 **exit 1** 前置校验零写盘；默认仅 \`opencode\`。
- **Claude Code 适配器资产**：\`--tools claude\` 部署 \`~/.claude/\`——\`CLAUDE.md\`（全局约束，用户已有内容 append 不覆盖）、\`agents/\`（**9 个**，含 \`feel\`）、\`skills/\`（**18 个**共享源）、\`settings.json\`（注入 \`"agent":"feel"\` + \`"permissions":{"defaultMode":"auto"}\`，用户既有键逐字保留）；默认零触（不带 \`--tools\` 时 \`~/.claude/\` 零变化）。

## v1.1.5 新增能力（stage-67）

- **主动诊断 \`openfeel setup --check [--json]\`**：只读检测全局部署版本（\`~/.openfeel/update_state.json.openfeel_version\`）与 CLI 版本一致性，**不执行部署**；一致退出 \`0\`，\`mismatch\`/\`missing\`/\`unknown\` 退出 \`1\`；\`--json\` 输出 \`{schemaVersion,status,cliVersion,deployedVersion}\`（\`status\` ∈ \`ok|mismatch|missing|unknown\`）。
- **被动部署提示**：任意命令 / REPL 在 TTY 下检测到全局部署漂移（\`mismatch\`）或缺失（\`missing\`）时，向 **stderr** 提示运行 \`openfeel setup\`；**每进程一次**；\`--json\`/\`--quiet\`/\`--version\`/\`--help\`、CI、\`OPENFEEL_NO_UPDATE_CHECK\` 及部署类命令（\`setup\`/\`update\`/\`init\`/\`migrate\`）静默；\`unknown\`（state 损坏）被动静默、仅 \`--check\` 显式报告；**不改退出码、不写盘**。

## 升级流程

### opencode 适配器

\`\`\`bash
npm i -g openfeel@latest   # 1. 升级 CLI
openfeel setup             # 2. 重跑部署，刷新全局 AGENTS.md/agents/skills/opencode.jsonc
# 3. 重启 harness（opencode）以加载新的全局配置
\`\`\`

仅 \`npm i -g\` 不会刷新全局资产，须重跑 \`openfeel setup\` 并重启 harness。\`openfeel setup --check\` 可诊断全局部署版本与 CLI 版本是否一致（一致退出 0，否则退出 1）。

### Claude Code 适配器

\`\`\`bash
npm i -g openfeel@latest       # 1. 升级 CLI
openfeel setup --tools claude  # 2. 重跑部署（claude 目标）
\`\`\`

- **\`--tools\` 由 v1.1.6 提供**：\`openfeel setup --tools claude\`；首次创建 \`~/.claude/{agents,skills}\` 后**重启会话或 \`/reload-skills\`** 使新 skill/agent 生效。
- 首次创建 \`~/.claude/{agents,skills}\` 后需**重启会话或 \`/reload-skills\`** 使新 skill/agent 生效。
- \`CLAUDE.md\` 于**下次会话**生效。

## v1.1.2 新增能力（stage-41~55）

> 以下为 v1.1.2 相对上版的增量能力（分组摘要，细节以 \`<cmd> --help\` 为准）。

- **A. 自描述与可纠错（stage-41）**：\`flow phases [--json] [--mode <full|fast>] [--stage <id>]\`（**6 键**：\`schemaVersion\`/\`phases\`/\`transitions\`/\`advanceAccepted\`/\`transitionsDiff\`/\`workflowMode\`（v1.1.7 追加）；既有五键语义逐字不变）、\`flow stage remove [--force] [--dry-run] [--purge]\`、stageId 校验/冲突检测（\`validateStageId\` / \`suggestStageId\` / \`findStageDirConflict\`）、\`plan stage add --deps\`。
- **B. 状态与口径（stage-42）**：\`config effective [key]\`（有效值 + 生效来源 \`status.md > config.yaml > profile.yaml > builtin\`）、\`pipeline.phase\` 全量 done 判定、审计日志 \`register_stage\` / \`register_op\`。
- **C. 部署与备份（stage-46）**：覆盖写前自动备份 \`~/.openfeel/backup/{ts}/\` + \`update_infos.md\`「备份」类条目（Agent 按 \`feel.md\` 检查规则核对）。
- **D. 纠正/清理侧命令面（stage-51/52，v1.1.4-stage-64 补 register）**：\`plan scheme remove\`（仅删 \`flow.json\` 注册键，不删 op 文件；done/checkpoint 保护）、\`plan scheme register <stage> [opId] [--dry-run]\`（对称补全：补注册 fileOrphans，\`--dry-run\` 零写盘；**\`create\` 序号基于「ops/ 文件 ∪ flow.json 注册」的最小未用正整数（空位回填），创建后对目标阶段未注册文件输出 stderr 告警并提示 \`plan scheme register\`**）、\`plan scheme rename --title\`（必填，空标题报错）、\`plan scheme publish\` + \`create --draft\`（draft→pending，空模板拒绝）、\`flow stage set --deps\`（覆盖写入；**不带 \`--deps\` 视为清空**）、\`flow review update|remove\`、\`stage set\`（**幂等**：同值 no-op + 同值不生成 \`.bak\`；\`--exec-mode <manual\\|auto>\` / \`--auto-advance <enabled\\|disabled>\` / \`--review-agent <agent>\`）、\`stage task --add|--done|--undone\`、\`plan stage add --tasks\`/\`--exec-mode\`/\`--auto-advance\`（显式覆盖 config 默认）、\`flow repair --prune-orphans\`、\`flow health --fix [--dry-run]\`（默认只报告；\`--fix\` **仅回写 status.md「状态」字段**；\`--dry-run\` 预览零写盘）、\`flow ops list\`、\`flow advance --quiet\` + \`--to <远距 phase>\`（存在唯一路径时自动逐步；\`--dry-run\` 展示完整路径）、\`knowledge dedup\`（检索相似条目，**只读建议，不修改 kb**）。\`flow attempt\` 对 **draft op 拒绝**。
- **E. 输出/门禁/约定（stage-50/52）**：\`flow status/current/health/metrics/overview --json\`（纯 JSON 单文档，含 \`schemaVersion\`）、\`lint i18n\`/\`lint kb\` **非 0 退出**（门禁语义，无逃生阀）、\`config set/get\` 支持**全量 \`defaults.*\`**（\`defaults.\` 前缀与 bare key 等价；\`--sync-stages\` 仅项目模式，适用键 \`auto_advance\`/\`execution_mode\`，其它键跳过报告；Schema 驱动键白名单 + 值类型归一 + 枚举校验，非法报错不写盘）、\`view add\` **已移除**（改用 \`flow review add\`）、\`NO_COLOR\` 环境变量 / \`--no-color\`。

## phase 枚举与转移表

15 个 phase（\`plan_pending\` … \`done\`）：

\`\`\`
plan_pending → plan_review → plan_passed → scheme_pending → scheme_review
→ scheme_passed → exec_running → review_pending → review_passed → test_pending
→ test_passed → archiving → done
\`\`\`

| phase | 合法目标 |
|-------|----------|
| \`plan_pending\` | \`plan_review\`, \`plan_passed\` |
| \`plan_review\` | \`plan_passed\`, \`plan_pending\` |
| \`plan_passed\` | \`scheme_pending\` |
| \`scheme_pending\` | \`scheme_review\`, \`scheme_passed\` |
| \`scheme_review\` | \`scheme_passed\`, \`scheme_pending\` |
| \`scheme_passed\` | \`exec_running\` |
| \`exec_running\` | \`review_pending\`, \`scheme_pending\` |
| \`review_pending\` | \`review_failed\`, \`review_passed\` |
| \`review_failed\` | \`review_pending\`, \`scheme_pending\` |
| \`review_passed\` | \`test_pending\` |
| \`test_pending\` | \`test_failed\`, \`test_passed\` |
| \`test_failed\` | \`test_pending\`, \`scheme_pending\` |
| \`test_passed\` | \`archiving\` |
| \`archiving\` | \`done\` |
| \`done\` | （终态） |

**fast 快线转移表（\`workflow_mode=fast\`）** —— \`transitions\` 共 **9 条目**（8 条流转键 + \`done\` 终止项），快线链（可达相位序列）为 \`plan_pending → plan_review → plan_passed → exec_running → review_pending → review_failed → review_passed → archiving → done\`：

| phase | 合法目标 |
|-------|----------|
| \`plan_pending\` | \`plan_review\` |
| \`plan_review\` | \`plan_passed\`, \`plan_pending\` |
| \`plan_passed\` | \`exec_running\` |
| \`exec_running\` | \`review_pending\` |
| \`review_pending\` | \`review_failed\`, \`review_passed\` |
| \`review_failed\` | \`review_pending\`, \`exec_running\` |
| \`review_passed\` | \`archiving\` |
| \`archiving\` | \`done\` |
| \`done\` | （终态） |

> \`phases\` / \`advanceAccepted\` 恒 15 项（模式无关）；fast 下 \`scheme_pending\` / \`scheme_review\` / \`scheme_passed\` / \`test_pending\` / \`test_failed\` / \`test_passed\` 共 **6 项**不可达（无入边）。

- 转移表以**运行时** \`.openfeel/pipeline.yaml\` 为准；\`openfeel flow phases\` 查看当前生效值。（\`--mode <full|fast>\` 显式指定 / \`--stage <id>\` 按阶段派生；\`--json\` 追加 \`workflowMode\`）
- 推进：\`openfeel flow advance --stage <id> --to <phase>\`。**\`advanceAccepted\` = 内置 15 个 phase 的「推进白名单」**（\`flow advance\` 只接受这 15 个值），**不是**组合式条件键的替代品（旧文案曾误述，此处已更正）。**组合式条件差异**（如内置默认含 \`review_passed|test_passed\`，本仓 \`pipeline.yaml\` 未列）经 \`--json.transitionsDiff.missing\` **显式可见**（stage-50 裁定：**不补组合键**，改以 \`transitionsDiff\` 显式化）。
- 参考：\`.openfeel/manual/**\`（CLI/flow 模块文档）。

## stageId 命名与目录映射

| 格式 | 示例 | series / stageDir |
|------|------|-------------------|
| 完整四级 | \`v1.1.2-stage-43\` | \`v1\` / \`stage-43\` |
| 历史短版 | \`v4-stage-04\` | \`v4\` / \`stage-04\` |
| 短名 | \`stage-01\` | \`v1\`（默认）/ \`stage-01\` |

- \`series = v{MAJOR}\`；目录映射 \`.openfeel/plan/{series}/stage-{NN}/\`。
- 唯一性：\`(series, stageDir)\` 冲突（如 \`v4-stage-04\` 与 \`v4.0.0-stage-04\` 映射同目录）会被 \`findStageDirConflict\` 检出并阻止；非法输入由 \`validateStageId\` 报原因 + \`suggestStageId\` 给建议名（\`NN\` 限定在同 series 内 max+1）。
- 权威实现与三级回退：见 \`.openfeel/manual/core/plan-path.md\`。

## 典型场景

1. **落地新阶段**：\`openfeel plan stage add v1.1.2-stage-43\`（建目录 + 注册）→ \`openfeel flow advance --stage v1.1.2-stage-43 --to plan_pending\` 起步。
2. **声明依赖**：\`openfeel plan stage add v1.1.2-stage-43 --deps v1.1.2-stage-41 v1.1.2-stage-47\`（写入 \`overview.md\`「## 依赖」+ \`flow.json.stages[].deps\`）。
3. **纠错移除误建阶段**：\`openfeel flow stage remove v1.1.2-stage-43 --dry-run\` 预览 → 确认后 \`--force\`（必要时 \`--purge\` 删目录）。
4. **查询有效配置**：\`openfeel config effective auto_advance\`（来源优先级 \`status.md\` > \`config.yaml\` > \`profile.yaml\` > \`builtin\`）。
5. **部署前备份**：\`setup\`/\`update\`/\`init\`/\`migrate\` 覆盖写入前自动备份至 \`~/.openfeel/backup/{ts}/\`；\`update_infos.md\` 会新增「备份」类条目，Agent 须按 \`feel.md\` 检查规则核对（存在性 + 失败重跑）。
6. **故障恢复路径（v1.1.4-stage-65，顺序即优先级）**：
   \`\`\`
   ① flow health（诊断，只报告）
   ② flow stage reset <id> --to <phase>（精准复位单阶段）       ← 首选
   ③ checkpoint restore <file> --stage <id> --dry-run（预览）→ 去 --dry-run 执行（按阶段回退）
   ④ checkpoint restore <file>（无 --stage，全量覆盖）          ← 最后手段
   ⑤ flow health --fix（对账 status.md「状态」，仅该字段）
   \`\`\`
   **「全量 restore 为最后手段」**（多阶段并行时跨阶段连带回退）；\`flow stage reset\`/\`checkpoint restore\` 改写 \`flow.json\`，\`flow health --fix\` 仅回写 \`status.md\` 的「状态」字段。

## 权限模型要点

### opencode 适配器

- 9 个 agent 内联 \`permission:\` 白名单，均含 \`external_directory: "allow"\`（单一键，无读写粒度）。
- **合并语义**：agent \`.md\` frontmatter 与 \`opencode.jsonc\` 按权限键**深合并**，同名键以 agent \`.md\` 为准（配置文件无法覆盖已声明键）。
- **收紧入口**：项目根 \`.opencode/agent/<name>.md\` 覆盖全局同名 agent 并重写完整 \`permission\` 块；勿手改全局 agent frontmatter（会被 \`update\` 覆盖）。
- 详 \`.openfeel/manual/core/permission.md\`。

### Claude Code 适配器

- subagent 于 frontmatter 声明 \`tools\`（白名单，未列即不可用）、\`disallowedTools\`（黑名单）与 \`permissionMode\`。
- **无 \`external_directory\` 对等概念**。
- \`settings.json\` 由 \`openfeel setup/update --tools claude\` 注入（\`agent:"feel"\` + \`permissions.defaultMode:"auto"\`，用户键保留），**v1.1.6 起**。

## 与 openfeel-wizard 的区别

| 维度 | \`openfeel-cli-usage\`（本 skill） | \`openfeel-wizard\` |
|------|--------------------------------|-------------------|
| 定位 | 查询型**参考手册**（只读静态知识） | 执行型**交互向导**（跑 \`openfeel flow wizard\`） |
| 动作 | 回答「命令/参数/phase/stageId 是什么」 | 逐步选择并推进阶段 phase |
| 前置 | 无 | 需交互式 TTY（非 TTY 用 \`flow advance --stage <id> --to <phase>\`） |

> wizard skill 正文已交叉引用本 skill；二者正文互引，边界为「查手册 vs 跑向导」。
`,
  'openfeel-context-hygiene': `---
name: openfeel-context-hygiene
description: 上下文卫生——按需加载（索引先行）、工具结果治理、子会话返回精简、长任务分段，以及 harness 可控 / 不可控项的边界留痕。用于「上下文 / 按需加载 / 精简 / 裁减 / 上下文预算」相关判断。
---

# 上下文卫生（上下文治理指引）

## 输入

- 当前任务上下文预算压力信号（上下文接近上限 / 检索结果过载）
- 目标文件或目录（读取 / 检索范围）

## 执行步骤

### 1. 按需加载（索引先行）

严格按「索引 → 主题 → 详情」三层顺序取用信息，**禁止**开局整量读取：

1. **索引先行**：会话启动只读索引层——\`.openfeel/users/{username}/dev_last.md\`、流水线状态视图、\`.openfeel/kb/index.md\`。
2. **主题按需**：仅在索引摘要不足以决策时，读对应主题文件 \`dev_last/{english-name}.md\`。
3. **详情显式**：\`.openfeel/tmp/\` 文档、历史归档、\`docs/**\` 仅在**显式指定**时读取。
4. **不主动读归档**：常规调度不得读取 \`.openfeel/flow-archive/**\`（防上下文污染）；确需历史时用只读查询命令。

### 2. 工具结果治理

- **大文件分片**：读取长文件时用「偏移 + 条数」参数分段读取，先定位再精读；不整文件读取后仅用其中几行。
- **检索限定范围**：内容检索必须限定路径 / 文件类型，避免全仓扫描；先窄后宽。
- **不重复读**：同一文件在同一会话内不重复读取；已读结论写入工作记录或任务列表。
- **结果即用即弃**：中间产物（构建日志、测试输出长尾）只留结论与地址，全文落盘到 \`.openfeel/tmp/\`。

### 3. 子会话返回精简

下级 Agent / 子会话完成后返回**精简摘要（≤ 10 行）**：

\`- **Agent**：{name} / **状态**：{status} / **摘要**：{一句话} / **产出**：{文件} / **遗留**：{REV/BUG/无}\`

- 完整报告写入 \`.openfeel/users/{username}/log/\`，命名 \`op-{op_id}-report-{date}.md\`。
- 调用方收到后先看状态决定下一步；**需要详情时按需回读**完整报告，不要求下级把全文塞进返回。
- 同理，调用方派发子任务时应在描述中要求「返回精简摘要 + 完整报告落盘」。

### 4. 长任务分段习惯

- 任务启动即建任务列表（多步骤 / 跨文件）；每完成一项立即标记，避免把全部进度堆在结尾一次性输出。
- 长任务按「可独立验收的段」切分，每段收尾即验证并落档；段间以文件与日志交接，不依赖长对话记忆。
- 上下文接近上限时，先落档再续接（结论与地址入索引层，详情入主题 / 详情层）。

### 5. harness 可控 / 不可控项边界留痕

**可控项（本仓可写）**：
- 提示词 / 约束文件 / skill 内的按需加载与裁剪指引（即本 skill 第 1~4 条）——这是本仓**唯一**可施加作用的上下文治理面。

**不可控项（如实留痕，**不表述为「已具备该能力」**）**：
- **Claude Code 侧**：上下文自动压缩（auto-compact）为**宿主行为**，本仓 \`claude-settings.ts\` **不注入**相关键，无法从本仓控制其触发时机与裁剪策略。
- **opencode 侧**：compaction 为**平台配置项**，本仓 \`init.ts\` 仅写最小 \`$schema\` 覆盖，**不注入**相关键，配置权在用户侧。

> 表述纪律：对不可控项只做「能力归属 + 本仓不注入」的事实陈述，禁止写成「本仓已具备 / 已接管该能力」。承 kb \`#未来功能/未落地能力写入 skill 与文档须标注「提供版本」\` 的留痕纪律。

**与 stage-92 的分界**：会话卫生（子会话回收等）的平台能力核验归 **stage-92**（大计划 §十 Q8）；本阶段只落**指引**，不落实现、不虚构 harness 能力。

### 6. 双平台工具名对照（双平台分节）

#### opencode 适配器

| 用途 | 工具 | 关键参数 |
|------|------|----------|
| 读文件 | \`read\` | \`offset\` / \`limit\`（分片） |
| 内容检索 | \`grep\` | \`path\`（范围限定） |
| 文件匹配 | \`glob\` | \`path\` |

#### Claude Code 适配器

| 用途 | 工具 | 关键参数 |
|------|------|----------|
| 读文件 | \`Read\` | \`offset\` / \`limit\`（分片） |
| 内容检索 | \`Grep\` | \`path\`（范围限定） |
| 文件匹配 | \`Glob\` | \`path\` |

## 输出

- 上下文治理执行摘要：本次加载层级（索引 / 主题 / 详情）+ 治理动作（分片 / 限定 / 精简）
- 不可控项声明（如涉及）：能力归属 + 本仓不注入事实
`,
  'openfeel-delegation': `---
name: openfeel-delegation
description: 委托与流水线纪律——dispatch 双口径、委托边界与直接操作白名单、流程不可跳过、Handoff 委派、多模态自动委派、子任务上下文描述要求与能力降级。用于「委托 / 调度 / Handoff / 子 Agent / 流水线纪律」相关判断。
---

# 委托与流水线纪律

> ⚠️ **本仓自举**：本仓（openfeel 源码仓库）开发/执行时请用 \`node bin/openfeel.js <cmd>\`；安装后使用 \`openfeel <cmd>\`。

## 输入

- 待办任务描述（含可写边界）
- 当前阶段 phase 与流水线模式（\`openfeel flow status\` / \`openfeel flow mode\`）

## 执行步骤

### 1. dispatch 双口径（两条独立通道，禁混淆）

**口径 ①：直接调度通用工作者。** 任意 Agent（含 subagent）均可**直接**向通用工作者发调度请求，不经多级转介：

- 探索者 \`openfeel-explorer\`：只读探索代码区、定位问题。
- 执行者 \`openfeel-executor\`：实现 / 修改 / 自测。

**口径 ②：\`[HANDOFF: agent_name]\` 标记。** 返回结果中携带该标记时，由调用方解析并调度目标 Agent，附带原始上下文，完成后回传并记录调度事件。

> **通道能力以平台实际为准**：本 skill **不假定**任何具体工具名；调度经「平台提供的调度能力」或既有中介（见第 6 条降级）完成。

### 2. 委托边界（判据 + 直接操作白名单例外清单）

**必须委托**（任一命中即委托，禁止亲为）：

| 场景 | 委托目标 |
|------|----------|
| 制定计划、划分阶段 | \`openfeel-planner\` |
| 制定操作方案 | \`openfeel-schemer\` |
| 编码实现（源码修改 / 跨文件重构 / 依赖变更） | \`openfeel-executor\` |
| 代码审查 | \`openfeel-reviewer\` |
| 正式测试验收 | \`openfeel-feel-tester\` |
| 批量搜索 / 探索代码 | \`openfeel-explorer\`（或事务官） |
| 文件机械操作 | 事务官（\`openfeel-utility\`） |
| 归档沉淀知识 | \`openfeel-archiver\` |
| 视觉 / 多模态分析 | \`openfeel-vision\` |

**直接操作白名单**（完整例外清单，仅此范围内的操作可自行执行）：

- **文件操作**：\`git add\` / \`git rm\`、复制 \`cp\` / 移动 \`mv\`、\`mkdir\`、\`rm\`（非源码文件）、\`cat\` 读取
- **文本处理**：Base64 编解码、\`diff\` 对比、简单 \`sed\` 替换（**非** \`.ts\` 文件）
- **环境操作**：\`npm run build\`、\`npm test\`（仅验证，不改依赖）
- **明确禁止自行执行**：修改源码内容、跨文件重构、依赖变更（\`install\` / \`uninstall\`）

> 白名单原则：每个操作可由一条命令独立完成，无依赖链。

**路由规则**：文件机械操作 → 事务官；事务官无法胜任 → 升级执行者并标注 \`type: utility\`；设计决策 → 计划官。

**调度决策依据**：委托前用 \`openfeel flow status\` 查看各阶段 phase，以**活跃阶段**（\`phase != 'done'\`）的 phase 为调度依据，而非读取全局 \`pipeline.phase\`。

### 3. 流程不可跳过（硬性纪律）

- ❌ 计划阶段不委托计划官、自行写 \`plan.md\`
- ❌ 方案阶段不委托方案官、直接让执行者动手
- ❌ 审查阶段不委托审查官、自审自过
- ❌ 测试阶段不委托测试官、以 \`npm test\` 结果代替验收
- ❌ 归档阶段不委托归档官、自行更新 \`kb/\`

每个阶段的推进必须经对应 Agent 产出（即使产出是「通过，无修改」），确保审计链完整。

**审查不可跳过**：禁止以任何理由（改动小、风险低、build+test 全绿）跳过审查，禁止以强制参数绕过。审查不通过时的处置决策（重试 / 重新方案 / 暂停 / 人工介入）须落日志。

**审查修复必须走流程**：审查发现的 REV，即使是文档缩进、空行等白名单级改动，也须经「方案官 → 执行者」修复并由审查官验收闭环，不得直接修改。

**无方案委托仍须产出 op 文件**：跳过方案官直接委托执行者时，必须在委托描述中要求执行者**先创建最小 op 文件**（置于对应阶段 \`ops/\` 目录，含 \`# op-NNN\` 标题、变更目标、涉及文件列表）再编码——op 文件是审计链核心证据。

### 4. 多模态自动委派（硬性纪律）

主力模型可能不支持图片输入（平台报错如 \`this model does not support image input\`）。遇多模态输入时**必须尝试委派**，禁止跳过：

**场景 A：模型支持多模态但需深度视觉分析**
1. 将图片保存到 \`.openfeel/tmp/\`
2. 调度 \`openfeel-vision\`，在任务描述中提供图片本地路径
3. \`openfeel-vision\` 读取图片并分析

**场景 B：模型不支持多模态、平台报错拦截**
1. 先尝试查找平台是否在临时位置保留图片副本
2. 找到 → 按场景 A 处理
3. 未找到 → 告知用户平台限制，请其经 \`openfeel-vision\` 专用会话发送图片，或直接描述图片内容

**禁止行为**：
- ❌ 告知用户「我看不了图片」后等待用户手动操作（必须先尝试委派）
- ❌ 尝试用非视觉 Agent 分析图片

> 模型本身支持多模态时无需委派；本规则仅在模型无法处理图片时触发。

### 5. 子任务上下文描述要求

每次委派的任务描述必须包含：**任务描述**（要做什么、判据）+ **期望返回**（格式与粒度）+ **边界**（只读 / 可写；可写入的路径白名单）。缺任一项即视为描述不合格，须补齐后再发。

### 6. 能力不可用时的降级

直接调度能力不可用（平台未提供 / 权限受限）时，降级为**中介兜底**：请求上游 Agent 代为调度目标 Agent，并在请求中说明「本会话无直接调度能力，请中转」。降级路径须记入日志；能力恢复后回归口径 ①。

### 7. 审查会话健康探测与可疑产出处置

- **健康探测（首轮）**：要求审查官在首轮先做最小工具自检（执行版本查询命令 + 读一个已知文件并**回报内容**）。若自检失败、内容不符或工具结果异常 → 判定该会话**不可用**，立即中止并**重开会话**，不得沿用其后续产出。
- **可疑产出处置**：一旦判定某会话可疑，其已写出的 REV 条目 / 验收记录**自动降级为「待复核」**，不得被后续会话直接引用推进；须由新会话**独立复核关键结论后**方可据此推进，并追加「可信度声明」。

### 8. 模式调度纪律（fast 工作流快线）

- **质量底线不可跳**：审查官在 fast 下必跑两处——① \`plan_review\` 计划审查（**必经单轮**，通过 → \`plan_passed\`，问题退回 → \`plan_pending\`）；② 执行后代码审查（单轮）；\`review_failed\` 回环可重审或回执行修复；失败留痕照常。
- **轻量化**：计划官 / 归档官轻量产出（**不得**省略任务表 / 依赖 / 验收要点与状态记录 / 知识暂存判定）。
- **相位口径**：可达相位为快线链；**合法相位枚举 15 项不变**（fast 下 6 项不可达）——**可达 ≠ 合法**。
- **骨架全量不变**：fast 不裁剪任何落盘结构，仅减少 Agent 接力环节。
- **术语消歧**：流程模式称「**工作流快线**」；审查深度降级称「**快速通道 / fast track（FAST-PASS）**」——二者为不同机制，不得互相引用 / 混用。

## 输出

- 委派记录：目标 Agent、任务描述摘要、边界、期望返回
- 流程合规声明：本次委托链完整（计划 → 方案 → 执行 → 审查 → 测试 → 归档，或 fast 快线链）
`,
  'openfeel-get-bugs': `---
name: openfeel-get-bugs
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
  'openfeel-get-stage-status': `---
name: openfeel-get-stage-status
description: 读取 .openfeel/plan/{series}/{stage}/status.md，判断当前子计划状态、责任 Agent、是否允许自动推进以及下一步建议。用于 openfeel-reviewer/openfeel-executor/openfeel-feel-tester 在处理阶段任务前确认流程状态。
---

# 获取子计划状态

## 输入

- 计划阶段名 \`{stage}\`（如 \`stage01\`、\`auth-login\`）
- 阶段 ID \`{stage}\` 可为完整 \`vX.Y.Z.W-stage-NN\` 或短名 \`stage-NN\`，对应目录 \`plan/{series}/stage-NN/\`（\`{series}\` = 主版本系列，如 \`v1\`；短名默认 \`v1\`）
- 若用户未提供阶段名，先读取 \`.openfeel/plan/index.md\` 查找当前活跃阶段；仍不明确时询问用户

## 执行步骤

### 0. 读取全局配置

读取 \`.openfeel/config.yaml\`，解析 \`defaults\` 中的 \`execution_mode\`、\`auto_advance\`、\`merge_mode\`、\`workflow_mode\`（**三值**：\`full\` / \`fast\` / \`general\`）。

### 1. 定位状态文件

读取 \`.openfeel/plan/{series}/{stage}/status.md\`。

若文件不存在：
- 不要自行进入自动流程。
- 返回 \`missing_status\`，提示需要 Architect 先创建状态文件。

### 2. 提取字段

解析以下字段：

- \`执行模式\`
- \`自动推进\`
- \`工作流模式\`
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
2. 收集为 \`parallel_candidates\` 列表，供主会话（Feel）批量调度执行。

> 口径：**除直接调度通用工作者外，不调用其他 Agent**；需向用户确认的事项一律由调用方负责。

### 5. 判断自动推进资格

**字段回退**：若 \`status.md\` 未填写 \`执行模式\` 或 \`自动推进\`，从 \`.openfeel/config.yaml\` \`defaults\` 中读取对应值。

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
- 工作流模式：full | fast | general
- 状态：{status}
- 当前责任 Agent：{agent}
- 前置依赖：{依赖列表 或 无}
- 依赖就绪：true | false
- 可自动推进：true | false
- 阻塞原因：{reason 或 无}

## 并行候选
{若依赖就绪且可自动推进，列出同批次可并行启动的其他阶段}

## 下一步建议
{根据状态给出下一步，例如：启动 Code、等待用户、启动 openfeel-feel-tester、停止流程；若存在并行候选则建议批量启动}
\`\`\`

> **模式感知（fast）**：\`工作流模式\` 为 \`fast\` 时，「下一步建议」不指向方案 / 测试环节（快线链为 计划 → 计划审查 → 执行 → 代码审查 → 归档）；\`plan_pending\` 阶段下一步建议 = \`plan_review\`（必经，勿建议直接 \`plan_passed\`）；相位口径为「**可达 ≠ 合法**」——合法枚举仍 15 项（fast 下仅 6 项不可达），**不得**表述为相位缩减。

## 状态到下一步映射

| 状态 | 下一步建议 |
|------|------------|
| \`planned\` | 等待用户确认或 openfeel-planner 细化计划 |
| \`ready_for_code\` | openfeel-planner 可启动 openfeel-executor |
| \`coding\` | openfeel-executor 正在开发 |
| \`ready_for_review\` | openfeel-executor 可启动 openfeel-reviewer 审查，或等待用户触发 |
| \`review_failed\` | openfeel-reviewer 可启动 openfeel-executor 修复审查问题 |
| \`review_passed\` | 主会话可推进到 ready_for_test |
| \`ready_for_test\` | 主会话可启动 openfeel-feel-tester |
| \`test_writing\` | openfeel-feel-tester 正在写测试 |
| \`testing\` | openfeel-feel-tester 正在测试 |
| \`bug_found\` | openfeel-feel-tester 可启动 openfeel-executor 修复 Bug |
| \`bug_fixing\` | openfeel-executor 正在修复 Bug |
| \`done\` | 流程完成，停止 |
| \`paused\` | 等待用户处理暂停原因 |
`,
  'openfeel-health': `---
name: openfeel-health
description: 加载流水线健康检查结果，供 Agent 判断 flow.json 与工作区状态是否一致。
---

# 流水线健康检查

> ⚠️ **本仓自举**：本仓（openfeel 源码仓库）开发/执行时请用 \`node bin/openfeel.js <cmd>\`；安装后使用 \`openfeel <cmd>\`。

## 输入

无

## 执行步骤

1. 运行 \`openfeel flow health --quick\` 检查关键项（phase/current 合法性）
2. 需要全面检查时运行 \`openfeel flow health\`（含跨文件一致性、僵尸状态、config.yaml）
3. 解析输出中的 ✅ / ⚠️ / ❌ 项

## 输出

健康检查摘要：通过项数、失败项列表及原因，失败时给出修复建议
`,
  'openfeel-logging': `---
name: openfeel-logging
description: 日志记录纪律——公域 / 私域日志布局与命名、必录事件清单、条目格式、骨架文件机制与禁止事项。用于「日志 / 记录 / 落档 / 调度事件留痕」相关判断。
---

# 日志记录纪律

## 输入

- 待记录事件（类型 + 目标 Agent + 产出摘要 + 状态）

## 执行步骤

### 1. 布局与命名

| 域 | 路径 | 记录范围 | 命名 |
|------|------|----------|------|
| 公共域 | \`.openfeel/log/\` | **仅团队级重要事件** | \`yyyy-mm-dd-{username}-NNN.md\` |
| 私域 | \`.openfeel/users/{username}/log/\` | 日常操作（常规代码修改、个人计划推进、调试、个人笔记） | \`yyyy-mm-dd-NNN.md\`（无需用户名） |

- 公域日志按**年 / 月 / 日**分层归档，日目录仅在当天有重要事件时创建，日目录含 \`day_index.md\`。
- 公域根目录维护 \`index.md\`（日期索引）与 \`log.md\`（**最近 30 条**摘要，格式 \`[文件名] {username}: 描述\`，含跳转链接）。

**团队级重要事件**（满足任一即记公域日志）：公共域文件的创建或重要修改 / 跨成员协作关键操作（公共笔记归入、计划调整等）/ 计划里程碑达成或重大偏差 / 私域代码审查或 Bug 的 high 优先级问题（首次发现时上报详情）/ 影响多人的异常事件。

### 2. 必录事件清单（任一命中即记一条日志）

- 推进流水线状态（阶段 phase 变化）
- 修改阶段状态（责任 Agent / 状态字段变更）
- 委托任意下游 Agent（含调研类委托——**不受任务类型豁免**）：记录委托目标、op 编号、产出摘要
- 审查不通过时的处理决策（重试 / 重新方案 / 暂停 / 人工介入）
- 阶段 done 时的阶段性总结

### 3. 条目格式

\`\`\`markdown
| 时间 | 操作 | 目标 Agent | 产出 | 状态 |
|------|------|-----------|------|:--:|
\`\`\`

### 4. 骨架文件机制

关键操作（推进到 exec_running / review_pending / test_pending / archiving）时，流水线会自动在私域日志目录创建带日期前缀的骨架文件（fast 工作流快线下 \`test_pending\` 仍为合法相位、仅不可达（无入边），该相位骨架不再产生；其余骨架规则全量不变）。无需手动创建日志文件，看到骨架文件时填充内容即可。

### 5. 实时写入与公共笔记归入

每个阶段推进操作对应一条日志记录，**实时写入**而非事后补录；写入私域日志的同时更新公域 \`log.md\`（最近 30 条摘要）。

- 经验教训的主要记录位置是私域 \`note/\`；简要描述、详情放子文件并建索引。
- 提醒用户是否需归入公共笔记 \`.openfeel/dev/note/dev_note.md\`；**归入后标注「已归入公共域」并附跳转链接**。

### 6. 禁止事项

- 禁止「完成后仅对话告知，不做文件记录」
- 禁止「连续推进多阶段后才补录日志」
- 禁止「委托下游 Agent 后不记录调度事件」

> **边界声明**：目录存在性与骨架模板**形态**由 \`openfeel-workspace\` 承载（何时 mkdir 哪些目录、文件骨架长什么样）；本 skill 只写「何时记 / 记什么 / 格式 / 禁止」。

## 输出

日志写入记录：文件路径 + 条目数 + 是否同步更新公域 \`log.md\`
`,
  'openfeel-memory': `---
name: openfeel-memory
description: 记忆与落档纪律——记忆加载优先级、偏好合并、冲突检测与仲裁、update_infos 检查修复、决策追加、信息落档与会话结束写入、阶段结束检查。用于「记忆 / 偏好 / 决策记录 / 落档 / 会话结束写入」相关判断。
---

# 记忆与落档纪律

> ⚠️ **本仓自举**：本仓（openfeel 源码仓库）开发/执行时请用 \`node bin/openfeel.js <cmd>\`；安装后使用 \`openfeel <cmd>\`。

## 输入

- 会话启动信号（加载记忆）或会话结束信号（写入落档）
- \`.openfeel/update_state.json\` / \`~/.openfeel/update_infos.md\`（若存在）

## 执行步骤

### 1. 记忆加载优先级（启动时按序）

1. **全局偏好**：读取全局画像（\`readProfile()\`，src/core/config.ts）；文件不存在时用默认值。
2. **项目规则**：读取项目 \`.openfeel/dev/dev_core.md\`（\`[+]\` / \`[-]\` 标记规则；优先级高于全局约束）。
3. **项目记忆索引**：读取 \`.openfeel/users/{username}/dev_last.md\`（**索引**）——先取「用户偏好」「主题索引」「公共交接区」。
4. **按需主题文件**：仅在需要详情时读 \`dev_last/{english-name}.md\`（**文件名英文 kebab-case**，如 \`decisions.md\` / \`pending.md\`）；**旧格式**（无 \`## 主题索引\` 节）→ 触发**惰性迁移**（按英文命名映射拆分生成 \`dev_last/\` + 索引，原文保留，仅提示一次，不阻塞会话）。
5. **自动填充画像**：调用 \`ensureProfileDefaults(projectPath)\`——\`user.name\` 为空时从 \`.openfeel/.info.json\` 或 git config 取用户名，并更新 \`history.last_project\` / \`history.recent_projects\`（去重保留最近 5 个）。

### 2. 偏好合并（禁整文件覆盖）

- 语言偏好：全局画像 \`user.lang\` 优先。
- \`auto_advance\`：以项目 \`config.yaml\` 为准，全局画像 \`preferences.auto_advance\` 仅兜底（\`status.md\` 可局部覆盖）。
- 沟通风格 / 确认阈值：取全局画像 \`preferences.communication\` / \`preferences.confirm_threshold\`。
- 合并后的偏好写入索引「用户偏好」节：**先 Read → 合并 → 写回**，禁止整文件覆盖。

### 3. 冲突检测

启动时检查 \`.openfeel/update_state.json\`（不存在则静默跳过）：

1. 遍历 \`files\`，查找 \`status=conflict\` 条目。
2. 存在冲突时：TTY 交互环境输出冲突列表与解决指引（冲突文件保存在 \`.openfeel/update_conflicts/\`）；**非 TTY 环境（如 CI/CD）静默跳过**，不输出提示。
3. **不阻塞主体流程**——提示后照常进入主流程。

**冲突仲裁优先级**：用户明确指令 > 安全性 / 数据完整性 > 全局约束（全局规则文件）> 动态规则（\`dev_core.md\`）> 会话临时提示。冲突时须报告并向用户说明仲裁策略。

### 4. update_infos 检查与修复

启动时检查 \`~/.openfeel/update_infos.md\`（不存在则静默跳过）：

1. 遍历「追加」「异常」「备份」三类条目，按条目记录还原目标文件路径（绝对路径，或「相对路径 (项目: 根)」二元组）。
2. 逐条处理：
   - **异常条目**（未写入，待修复）：含 \`原因: backup_failed\` → 备份失败导致，**非标记问题、不会自愈** → 引导用户重跑 \`openfeel update\` / \`openfeel setup\` 重试部署，成功后勾选；其余（标记解析失败）→ 目标文件已含完整 begin/end 标记则**已自愈**，勾选清除该条目。
   - **追加条目**（无标记追加）：即使目标文件现已含标记，追加的受管区可能仍残留在标记区外造成**内容重复**——**不静默清除**，提示用户人工确认后勾选。
   - **备份条目**（部署覆盖前已存在 → 已备份）：检查备份文件是否存在——存在则提示「部署覆盖前已备份原文件至 \`{backupRel}\`，请检查」；缺失则提示「备份已丢失，请谨慎检查当前文件」。确认后勾选。**非 TTY 环境静默**。
3. 提示方式与「冲突检测」对称：TTY 输出待处理列表与确认引导；非 TTY 静默跳过。
4. 修复完成后提醒用户**重启会话**（全局 agent / 约束已变更，需重启加载）。
5. 全部条目勾选后可删除该文件或保留骨架。本流程不调用内部函数接口，仅按标记与条目状态判定。

### 5. 决策追加（\`dev_last/decisions.md\` 追加式）

做出技术 / 架构决策（选择方案、拒绝备选、调整设计方向、接受 trade-off）时，按 \`- [x] {date}：{决策描述}\` **追加**到 \`dev_last/decisions.md\`（不覆盖既有条目；索引仅在主题摘要变化时更新对应 ≤100 字摘要）。

- **归属区分**：长期决策（技术选型、架构方向、跨会话有效的设计取舍）另以 ADR 格式同步写入 \`.openfeel/dev/decisions.md\`；会话临时决策仅记 \`dev_last/decisions.md\`。
- **判断标准**（任一即记）：涉及新依赖引入或版本抉择 / 涉及架构模式选择 / 涉及用户偏好变更 / 涉及流程调整决策。
- **非决策不记录**：常规代码推进、Bug 修复选择、已确定方案中的细节填充。

### 6. 信息落档与会话结束写入

**关键操作必须落文件，不可仅存于对话中**：阶段状态 → CLI 命令；进度 → \`dev_last.md\`（索引 + 主题文件）；经验 → \`kb/\`；审查 / Bug → 私域目录。禁止「做完不记录」。

会话结束前更新 \`.openfeel/users/{username}/dev_last.md\`（索引）与 \`dev_last/*.md\`（主题文件）：

> **临界区（A9，一次进出）**：以下 ①~④ 的「读 → 合并 → 写回」须在 \`withFileLock(projectLockPath(cwd, 'dev-last-' + username), () => { … })\` 内完成（**含读取**；锁路径 \`.openfeel/tmp/locks/dev-last-{username}.lock\`；临界区内合并后用 \`atomicWriteFileSync\` 原子落盘；超时 / 陈旧沿用默认 5000 / 3000ms）；\`dist\` 不可用时退化为「读-合并-写」并标注「未加锁」。

1. 更新索引「用户偏好」（**不整文件覆盖**，Read → 合并 → 写回）。
2. 更新 / 新建主题文件（**文件名英文**；单条 >300 字或 >10 条时转 \`tmp/\` 文档并记地址）。
3. 刷新索引「主题索引」摘要（**≤5 活跃主题 × ≤5 条 × ≤100 字**）；新增主题致 >5 时先合并同类，无可合并则把最旧已完结主题移入「已收敛主题」（**不归档、不移动文件**）。
4. 更新「公共交接区」（**仅文档位置 + 核心摘要**）。
5. 若属跨用户整体进度，按规则更新 \`.openfeel/dev/current.md\` 并轮换归档（该文件属公共域，**不在本锁范围内**）。

### 7. 阶段结束检查清单

标记阶段 done 前逐项确认，全部通过方可推进：

- [ ] 审查已完成？（仅单文件、无跨文件影响的微小改动可跳过审查，须记录理由）
- [ ] 测试已通过？
- [ ] 状态已落档（\`flow.json\` / \`status.md\` / \`dev_last.md\`〔索引 + 主题文件〕）？

## 输出

- 记忆加载摘要：生效偏好（语言 / 自动推进 / 沟通风格 / 确认阈值）+ 活跃主题数
- 落档记录：写入或更新的文件路径清单
`,
  'openfeel-model-check': `---
name: openfeel-model-check
description: 主会话（Feel）自检时检查所有 Agent 的模型配置状态，识别期望模型 vs 实际模型的差距，引导用户在目标工具中完成配置。首次配置后存储为部署模板，新项目可直接复用。
---

# 模型配置检查

> ⚠️ **本仓自举**：本仓（openfeel 源码仓库）开发/执行时请用 \`node bin/openfeel.js <cmd>\`；安装后使用 \`openfeel <cmd>\`。

> 正文以**能力名**叙述；平台差异见 \`### opencode 适配器\` / \`### Claude Code 适配器\` 两小节。

## 触发时机

主会话在以下时机加载本 Skill：
- 会话启动自检（每次）
- 用户请求检查模型配置（按需）
- 新项目首次初始化后（\`openfeel init\`）

## 执行步骤

### 1. 识别当前平台

读取当前 harness 的平台配置文件，确定当前适配器平台（已知平台配置文件与 agents 目录差异见 \`## 平台适配\`）。

### 2. 扫描 Agent 定义

扫描 agents 目录（目录差异见 \`## 平台适配\`）下所有 \`.md\` 文件，提取每个 Agent 的模型需求。

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
| \`openfeel-planner.md\` | \`reasoning\`（推理） |
| \`openfeel-executor.md\` | \`fast\`（快速） |
| \`openfeel-reviewer.md\` | \`cross_model\`（异种推理） |
| \`openfeel-archiver.md\` | \`reasoning\`（推理） |
| \`openfeel-schemer.md\` | \`reasoning\`（推理） |
| \`openfeel-feel-tester.md\` | \`reasoning\`（推理） |
| \`openfeel-utility.md\` | \`fast\`（快速） |
| \`openfeel-vision.md\` | \`multimodal\`（多模态） |

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
    openfeel-reviewer:
      provider: anthropic
      model_name: claude-sonnet-4-20250514
      base_url: https://api.anthropic.com
      api_key_env: ANTHROPIC_API_KEY
    openfeel-executor:
      provider: deepseek
      model_name: deepseek-flash
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
| 主会话 | 主力推理 | deepseek-v4-pro | default | ⚠️ |
| openfeel-reviewer | **异种推理** | deepseek-v4-pro | default | ❌ 与主力相同！ |
| openfeel-executor | 快速 | deepseek-v4-pro | default | ⚠️ 未使用快速模型 |
\`\`\`

### 5. 输出检查报告

按以下格式向用户展示：

\`\`\`markdown
## 🔍 模型配置检查报告

**平台**：当前 harness（opencode 适配器 / Claude Code 适配器）
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

若检查发现以下任一问题，**必须**使用向用户提问工具（opencode 适配器：\`question\`；Claude Code 适配器：\`AskUserQuestion\`）引导用户：

| 触发条件 | 引导内容 |
|----------|----------|
| \`models\` 节不存在 | "未检测到模型配置。你需要为不同角色分配模型吗？" → 引导创建 |
| openfeel-reviewer 使用与主力相同模型 | "⚠️ openfeel-reviewer 当前与主会话使用相同模型，异种交叉审查的核心优势无法发挥。建议为 openfeel-reviewer 配置不同的模型系列。" |
| openfeel-executor 使用推理模型 | "⚠️ openfeel-executor 建议使用快速模型以节省成本。是否配置？" |
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
# 平台：当前 harness（opencode 适配器 / Claude Code 适配器）

models:
  default:
    provider: xxx
    model_name: xxx
    ...
  agents:
    openfeel-reviewer:
      provider: xxx
      ...
  roles:
    cross_model:
      provider: xxx
      ...
\`\`\`

此模板在下次 \`openfeel init\` 或新项目部署时自动检测并建议复用。

## 平台适配

### opencode 适配器

读取 \`opencode.jsonc\`（或对应平台的配置文件），确定当前适配器平台：

| 配置文件 | 平台 |
|----------|------|
| \`opencode.jsonc\` | OpenCode（当前适配器） |
| \`kilo/kilo.json\` | Kilo |

若无平台配置文件，提示用户当前不在支持的平台中。

扫描 \`.opencode/agents/\`（或对应平台的 agents/ 目录）下所有 \`.md\` 文件，提取每个 Agent 的模型需求。

- 报告/模板中的平台标签：\`**平台**：OpenCode（当前适配器）\`（原文标签，正文已改为中性表述「当前 harness（opencode 适配器 / Claude Code 适配器）」）。
- 向用户提问使用 \`question\` 工具。

### Claude Code 适配器

- Claude Code **无平台配置文件**（原平台识别表中指向 Claude 的错误配置行已删除）。
- 全局约束：\`~/.claude/CLAUDE.md\`；本期由 **stage-73** 注入 \`settings.json\`。
- agents 目录：\`~/.claude/agents/\`。
- 报告平台标签：\`Claude Code 适配器\`。
- 向用户提问使用 \`AskUserQuestion\` 工具。

## 输出规范

- 状态图标：✅ 已满足、⚠️ 降级使用（可接受但非最优）、❌ 缺失或严重不匹配
- 报告语言：中文
- 每次检查后将结果摘要写入 \`.openfeel/log/\`（仅首次发现关键问题时）
`,
  'openfeel-model-config': `---
name: openfeel-model-config
description: 查找和配置 Agent 模型。当 Agent 报 "Model not found" 或需要调整/新增 Agent 模型时使用。覆盖模型配置位置与优先级链（opencode 适配器 / Claude Code 适配器）、模型名查找方法、多模态模型（openfeel-vision）特殊注意事项。
---

# Skill: openfeel-model-config

# Agent 模型查找与配置

> 正文以**能力名**叙述；平台差异见 \`### opencode 适配器\` / \`### Claude Code 适配器\` 两小节。

## 何时使用

- Agent 调用时报 \`Model not found: xxx\`
- 需要为 Agent 更换或指定模型
- 新增 Agent 后需要配置其模型
- openfeel-vision / 多模态模型无法正常调用

## 配置位置

### opencode 适配器

Agent 模型配置在 **\`opencode.jsonc\`**（项目根目录）中：

\`\`\`jsonc
{
  "agent": {
    "openfeel-vision": {
      "model": "deepseek/deepseek-flash"   // 模型名格式：provider/model-id 或 model-id
    }
  }
}
\`\`\`

> ⚠️ **配置修改后必须重启 opencode 才能生效**。运行中的会话使用启动时加载的配置。

> 💡 **推荐**：可用 \`openfeel model set/get/list --scope default|global|project\` 一键读写三层级模型（工具默认 / 全局 / 当前项目），无需手工定位文件。

### Claude Code 适配器

- Agent 模型配置在 Claude Code 侧的 \`~/.claude/agents/*.md\` frontmatter \`model\` 字段。
- 模型配置经 \`/model\`、\`settings.json\`/\`env\` 或网关（如 cc-switch）等途径确定。
- \`settings.json\`（本期由 stage-73 注入）仅作参考，模板默认 \`model: inherit\`。

## 查找可用模型名

当收到 \`"Model not found: xxx. Did you mean: aaa, bbb?"\` 错误时：
- 列出平台已安装的可用模型名在 \`Did you mean:\` 之后
- 从中选择一个作为新模型名
- 不建议凭记忆猜测模型名，以平台提示为准

## Agent 定义文件中的 model 字段

### opencode 适配器

\`.opencode/agents/<name>.md\` 的 frontmatter \`model:\` 字段**是生效的，且优先于** \`opencode.jsonc\` 的 \`agent.<name>.model\`（stage-40 REV-1606 实测）。opencode 模型解析优先级链：

\`\`\`
项目 agents frontmatter > 全局 agents frontmatter > 项目 opencode.jsonc agent.model > 全局 opencode.jsonc agent.model > opencode 默认
\`\`\`

因此修改模型时以 frontmatter 为准（只改 jsonc 会被 frontmatter 遮蔽），建议两处同步保持一致：
1. 修改 \`.opencode/agents/<name>.md\` 的 frontmatter \`model:\`（模板源 \`src/core/templates-data/opencode/agents/\` 同步）
2. （可选，保持一致）同步修改 \`opencode.jsonc\` 的 \`agent.<name>.model\`

### Claude Code 适配器

Claude Code 模型解析优先级链：项目 \`.claude/agents\` > 用户 \`~/.claude/agents\`；frontmatter \`model\` **优先于** \`inherit\`。

## 多模态（openfeel-vision）模型特殊规则

### opencode 适配器

- 主会话（Feel）的主力模型（DeepSeek V4 Pro）不支持图片输入
- 遇到图片输入时主会话会自动委托 openfeel-vision Agent
- openfeel-vision Agent 需要配置多模态模型（现用 \`deepseek-flash\`，备选 \`qwen3-vl-plus\`）
- 模型名不要随意添加前缀（如 \`alibaba/\`），以平台提示的可用名为准
- **模型引用格式**：\`{auth.json中的key}/{模型ID}\`，不是 \`provider.name\` 也不是 \`provider.id\`
- 读取 \`~/.local/share/opencode/auth.json\` 确认实际 provider key（常见：\`alibaba-cn\`、\`deepseek\`、\`zhipuai\`）
- \`provider\` 块中的 \`name\` 和 \`id\` 仅用于显示，不影响模型解析

### Claude Code 适配器

- 多模态由 Claude 侧模型决定；\`openfeel-vision\` subagent 须选支持图像输入的模型。

## 项目 Agent 模型概览

| Agent | 模型类型 | 备注 |
|-------|---------|------|
| 主会话（Feel） | 推理模型 | DeepSeek V4 Pro — 不支持多模态 |
| openfeel-planner | 推理模型 | — |
| openfeel-schemer | 推理模型 | — |
| openfeel-executor | 快速模型 (Flash) | — |
| openfeel-reviewer | 异种推理模型 (GLM) | — |
| openfeel-feel-tester | 推理模型 | — |
| 事务官 | 快速模型 (Flash) | — |
| openfeel-vision | 多模态模型 | 需配 deepseek-flash |
| openfeel-archiver | 推理模型 | — |
`,
  'openfeel-recover': `---
name: openfeel-recover
description: 跨会话上下文恢复，供 Agent 在会话启动时重建流水线状态。
---

# 跨会话上下文恢复

> ⚠️ **本仓自举**：本仓（openfeel 源码仓库）开发/执行时请用 \`node bin/openfeel.js <cmd>\`；安装后使用 \`openfeel <cmd>\`。

## 输入

无

## 执行步骤

1. 运行 \`openfeel flow recover\` 获取全局状态、流水线阶段、当前操作、阻塞原因与待处理任务
2. 读取**索引** \`.openfeel/users/{username}/dev_last.md\`（「用户偏好」「主题索引」「公共交接区」）→ **按需**再读主题文件（**文件名英文，如 \`decisions.md\`/\`pending.md\`**）恢复详情；**旧格式**（无 \`## 主题索引\` 节）→ 触发惰性迁移（按英文命名映射拆分生成 \`dev_last/\` + 索引，原文保留）
3. 将两者合并为当前会话起点

> **模式感知**：恢复后按当前阶段 \`status.md「工作流模式」\` 确认流程模式（\`flow recover\` 输出不含模式字段；fast 工作流快线下按快线链继续）。

> **加锁提示（A9）**：恢复流程为**只读**，无需加锁；仅**会话末尾写入**走 \`withFileLock\` 临界区（见 agents-md「并发写加锁协议」）。

> **记忆与落档**：记忆加载 / 决策追加 / 信息落档见 \`openfeel-memory\`；本 skill 只负责流水线状态恢复。

## 输出

恢复摘要：流水线状态 + 阻塞项 + 待处理任务列表
`,
  'openfeel-req': `---
name: openfeel-req
description: OpenFeel 需求流转用法参考：需求（requirement）四层模型与 7 状态生命周期、req 命令组 11 个子命令（add/list/show/claim/release/set/link/advance/board/next/split）与参数、认领协议、REQ-NNN 正文与人读副本语义（机读权威恒为 flow.json）、与计划（plan.md）的关系、与 workflow_mode 的关系（需求携带模式属性、经单点解析作用于关联阶段）。当需要创建/查询/认领/关联/推进需求，或要理解 REQ-NNN 状态与阶段聚合关系时加载。
---

# OpenFeel 需求流转（openfeel req）用法参考

## 说明

- 定位：**查询型参考手册**（只读，不自执行）。回答「需求是什么、状态怎么流转、\`req\` 命令怎么用」。
- 提供版本：**v1.2.0 起提供**（\`openfeel req\` 命令组）；命令/参数细节以 \`openfeel req --help\`（本仓执行）实时输出为准（CLI 演进后本文档可能滞后）。
- 本仓自举：本仓（openfeel 源码仓库）开发/执行时请用 \`node bin/openfeel.js req <cmd>\`；安装后使用 \`openfeel req <cmd>\`。
- 相关 skill：\`openfeel-cli-usage\`（全量命令速查）；本 skill 只承载需求流转专项。

## 四层模型与需求定位

需求层位于**「版本 → 需求 REQ-NNN → 计划 stage → 方案 op」**四层模型的第二层：**需求 = 排期与调度层**（回答「做什么、何时做」）；**计划 = 对某项明确需求的具体实现**。需求不等于计划——接取需求后仍按既有规划阈值走流水线（\`plan.md\` 头部标注「关联需求：REQ-NNN」）。

## 需求生命周期（7 状态）

\`\`\`
draft ─→ scheduled ─→ in_progress ─→ done
  │          │            │
  └──────────┴────────────┴──→ blocked / cancelled / rejected
\`\`\`

| 状态 | 语义 |
|------|------|
| \`draft\` | 草稿（\`req add\` 新建初值） |
| \`scheduled\` | 已排期（可被 \`req next\` 推荐接取） |
| \`in_progress\` | 进行中（认领后推进；**内部进度由关联阶段的 15-phase 聚合**） |
| \`done\` | 完成（**全部关联阶段 done 时自动收口**——前置集限定 \`scheduled\` / \`in_progress\`；\`req advance --to done\` 亦须此门） |
| \`blocked\` | 阻塞（可回到 \`scheduled\` / \`in_progress\`） |
| \`cancelled\` | 已取消（终态） |
| \`rejected\` | 已拒绝（终态） |

- **投影方向单一**：需求状态是关联阶段 phase 的聚合投影（方向：阶段 phase → 需求状态）；不得由需求状态前推阶段 phase。
- 合法显式流转由引擎流转表判定（\`req advance --to <status>\` / \`req set --status <status>\`）；终态（\`done\` / \`cancelled\` / \`rejected\`）不可再流转。

## 子命令（11 个）

| 子命令 | 用途 | 关键参数 |
|--------|------|----------|
| \`req add <title>\` | 创建需求（ID 自动分配 REQ-NNN，max+1 不回收；正文骨架铺到 \`.openfeel/requirements/REQ-NNN.md\`） | \`--target-version <version>\`、\`--priority <P0\\|P1\\|P2>\` |
| \`req list\` | 列出需求（可按状态 / 版本 / 认领人过滤） | \`--status <status>\`、\`--target-version <version>\`、\`--owner <owner>\`、\`--json\` |
| \`req show <id>\` | 查看需求详情（关联阶段为原始只读枚举）（含父需求 / 子需求） | \`--json\` |
| \`req claim <id>\` | 认领需求（占用校验；已被他人认领则拒绝） | \`--owner <owner>\`（缺省 \`.openfeel/.info.json\` user → git config user.name） |
| \`req release <id>\` | 释放认领（未认领为 no-op 成功） | — |
| \`req set <id>\` | 更新需求字段（白名单；状态流转合法性由引擎判定） | \`--status\`、\`--title\`、\`--target-version\`、\`--priority\` |
| \`req link\` | 关联需求到阶段 / 解绑 | \`--stage <stageId>\`、\`--requirement <id>\`、\`--unlink\`（与 \`--requirement\` 二选一） |
| \`req advance <id>\` | 显式推进需求状态（合法目标由引擎流转表判定；done 须全部关联阶段 done） | \`--to <status>\` |
| \`req board\` | 需求看板（按状态分组；7 组固定顺序） | \`--target-version <version>\`、\`--json\` |
| \`req next\` | 推荐下一个可接取需求（\`scheduled\` 且未认领；按预估版本升序） | \`--owner <owner>\`（含该认领人已认领的 scheduled 需求）、\`--limit <n>\`（缺省 1；大于 1 时 \`--json\` 追加 \`candidates\`）、\`--json\` |
| \`req split <id>\` | 拆分需求为若干子需求（**拆分即发布**：子需求入 \`scheduled\` 候选池；父子仅溯源、不参与聚合） | \`--into <title>\`（可重复；至少一项）、\`--json\` |

> \`--json\` 输出为纯 JSON 单文档（含 \`schemaVersion\`，脚本消费口径）；命令细节以 \`openfeel req <sub> --help\` 为准。

## 认领协议

- **轻量原子**：\`owner\` + \`claimed_at\` 两字段；\`req claim\` 做**占用校验**（已被他人认领 → 拒绝，exit 非 0 零写盘）；**无 TTL / 无心跳**（单机场景足够）。
- 认领人缺省解析：\`.openfeel/.info.json\` 的 \`user\` → \`git config user.name\`。
- 释放：\`req release <id>\`（未认领为 no-op 成功）；终态需求不可认领。

## REQ-NNN 正文与权威源

- 正文文件：\`.openfeel/requirements/REQ-NNN.md\`（\`openfeel req\` 机械铺骨架，**人读副本**）。
- **机读权威恒为 \`.openfeel/flow.json\` 的 \`requirements\` 条目**；正文与 flow.json 不一致时**以 flow.json 为准**（正文内状态为创建时快照，不追写）。
- \`stages[*].requirement_id\` 记录需求↔阶段关联（单值可空；存量阶段缺省 = \`null\`）；关联关系以 flow.json 为准。

## 与计划（plan.md）的关系

- 需求 = 排期与调度层；**具体实现仍由计划承载**——阶段 \`plan.md\` 头部标注「关联需求：REQ-NNN」。
- 需求状态流转（认领 / 关联 / 推进）经 \`openfeel req\` CLI 执行；planner 只读不写（不直写 flow.json）。

## 与 workflow_mode 的关系

需求**携带**模式属性（需求级 \`workflow_mode\`，值域 \`full\` / \`fast\` / \`general\`）；模式经**单点解析**作用于其关联阶段（显式下发后阶段字段为投影）；三种模式（规划 / 快速 / 通用）下需求纪律一致，\`workflow_mode\` 不影响需求状态机与命令行为。

## 需求与版本解绑

- 需求**不绑版本**：\`target_version\` 为**可选**字段，且**不作任何门**（不影响创建 / 认领 / 关联 / 状态流转 / done 判定）。
- **版本号仅在发布时推进**：日常需求动作（拆分 / 接取 / 推进）不触动版本号；版本推进属发布动作。

## 并行接取

- 拆分 → 子需求各自独立（独立 ID / 正文 / 认领 / 阶段关联），可**并行接取**：占用校验按需求粒度（\`req claim\`），子需求之间互不阻塞。
- **接取制为默认调度**：需求由 feel 发布、Agent 接取（\`req next\` → \`req claim\`）。
`,
  'openfeel-roadmap': `---
name: openfeel-roadmap
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
  'openfeel-search-kb': `---
name: openfeel-search-kb
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
- 语义检索适合模糊查询和探索性搜索，精确关键词匹配优先使用 \`openfeel-check-kb\`
- 此技能是 \`openfeel-check-kb\` 的回退方案——当 \`openfeel-check-kb\` 精确匹配无结果时可自动调用
- 图遍历返回的关联条目仅基于已建立的 wikilink 链接，若条目未引用或被引用其他条目，图谱中不会出现对应关联
`,
  'openfeel-sync-status': `---
name: openfeel-sync-status
description: 聚合所有成员的任务进度视图（各用户 dev_last 索引主题 + flow.json 阶段状态），供任意 Agent 快速了解项目整体协作状态。
---

# Skill: openfeel-sync-status

# 聚合任务进度

## 输入

无（**自动**：各用户 \`.openfeel/users/*/dev_last.md\` 索引「主题索引」+ \`flow.json\` 阶段状态 \`stages[].phase/status\`）

## 执行步骤

### 1. 读取进度来源

读取 \`.openfeel/users/*/dev_last.md\` 的「主题索引」摘要 + \`flow.json\` 的 active stages；**按用户聚合**展示。

### 2. 解析条目

对每个用户提取：
- **成员**：用户目录名（\`.openfeel/users/{username}/\`）
- **主题**：\`dev_last.md\`「主题索引」中的显示主题名（附英文文件名 \`dev_last/{english-name}.md\`）
- **摘要**：各主题下 ≤5 条核心摘要（≤100 字）
- **阶段**：\`flow.json\` 中与该用户相关的阶段 \`phase\` / \`status\`

### 3. 查漏补缺

- 对比 **\`flow.json\` active stages** 与各用户 \`dev_last\` 索引覆盖的 stage，检查是否存在**无任何用户索引覆盖的活跃阶段**
- 若有，标记为「未同步」

### 4. 格式化输出

按阶段/用户分组输出，格式：

\`\`\`
📊 项目协作进度

🟢 {stage-id} [{phase}]
  {username}
    - {主题显示名}（\`dev_last/{english-name}.md\`）：{摘要（≤100 字）}

🟡 阻塞
  {username} — {阻塞原因（若 dev_last 索引标注）}

⚪ 未同步
  {username} — 尚无主题索引条目
  {stage-id} — 无用户索引覆盖
\`\`\`

### 5. 偏离告警

若同一 stage 在 \`flow.json\` 标记为活跃，但**所有用户索引均未覆盖**，输出告警：

\`\`\`
⚠️ 阶段 {stage_id} 处于活跃状态但无用户索引覆盖，请确认存在负责成员
\`\`\`

## 输出

格式化后的 Markdown 进度摘要，不含文件修改。
`,
  'openfeel-tool-usage': `---
name: openfeel-tool-usage
description: Agent 工具使用规范（todowrite/question/task/skill 四工具触发条件、使用要求、禁止行为 + 优先级表）。
---

# Agent 工具使用规范

## 输入

无

## 执行步骤

### 1. todowrite — 任务列表管理
触发条件（任一即用）：多个独立步骤（多文件改动、需跨会话跟踪等） / 多任务下达 / 跨文件修改。使用要求：执行前创建、单条 in_progress、完成即标 completed、新步骤追加末尾。

### 2. question — 向用户提问
触发条件（任一必问）：需求歧义 / 多个同等合理方案 / 不可逆后果 / 架构决策。使用要求：(Recommended) 标记、选项附后果、≤3 选项、高风险含"取消"。禁止：模糊时自行假设、多方案不选直接实施。

### 3. task — 子 Agent 调度
触发条件：并行探索多代码区 / 复杂多步委托 general / 下游 Agent（经主会话（Feel）） / 直接调度通用工作者（执行者 openfeel-executor；任意 Agent 均可直发，不经多级转介）。使用要求：并行一条消息多 task、prompt 含任务描述+期望返回、明确只读/可写。

### 4. skill — 技能加载
触发条件：查阶段状态→openfeel-get-stage-status / 查知识库→openfeel-check-kb / 取 Bug→openfeel-get-bugs。使用要求：会话开始载 check-kb、处理阶段任务前载 get-stage-status、不凭记忆跳过。

### 5. 工具使用优先级
| 场景 | 优先工具 | 禁止做法 |
|------|---------|----------|
| 多步骤任务 | todowrite | 凭记忆逐条执行 |
| 需求不明确 | question | 自行假设后动手 |
| 探索代码 | task(explore) | 手动逐个 grep/read |
| 获取状态 | skill(openfeel-get-stage-status) | 凭记忆推断 |
| 批量文件操作 | task(general) | 串行逐个处理 |
| 通用执行任务 | task(openfeel-executor) | 自行串行处理 |

### 6. 规模阈值与轻量决策边界

按改动**波及面**（是否跨文件、是否跨阶段 / 跨模块）选择档位：

| 规模 | 处理方式 | 流程 |
|------|----------|------|
| 微小改动（单文件、无跨文件影响） | 调用方自行处理（兼任 openfeel-planner） | 直接编码，无需正式计划 |
| 跨文件改动 | 唤起 openfeel-planner 制定正式计划 | 调用方 → openfeel-planner → openfeel-executor |
| 多阶段规模化改动（跨模块或需求边界不清） | 大规模规划，必须走完整流程 | 调用方 → openfeel-planner → openfeel-schemer → openfeel-executor → openfeel-reviewer |

**轻量决策边界**：轻量决策指对话式选型——调用方与用户澄清并敲定技术方向或设计取舍，产出的是「结论」而非「正式计划文档」，不产出 plan.md；此类决策由调用方直接处理，无需委托 openfeel-planner。仅当需要**产出正式计划文档**（plan.md，含阶段划分、任务表、约束表）或该变更明显为跨模块 / 跨阶段性质时，才委托 openfeel-planner。

### 7. 委托纪律

委托边界、dispatch 双口径、流程不可跳过、Handoff 与多模态委派、子任务上下文描述要求见 \`openfeel-delegation\`。

## 工具名映射（跨 harness）

本 skill 的四种核心工具（\`todowrite\`/\`question\`/\`task\`/\`skill\`）在各 harness 的等价工具名见下表；**不改变**既有触发条件/使用要求/优先级表语义。

| opencode（小写） | Claude Code | 说明 |
|------|------|------|
| \`bash\` | \`Bash\` | 命令执行 |
| \`read\` | \`Read\` | 读文件 |
| \`write\` | \`Write\` | 写文件 |
| \`edit\` | \`Edit\` | 编辑文件 |
| \`glob\` | \`Glob\` | 文件匹配 |
| \`grep\` | \`Grep\` | 内容检索 |
| \`todowrite\` | \`TodoWrite\` | 任务列表 |
| \`skill\` | \`Skill\` | 技能加载 |
| \`task\` | \`Task\` | 子 Agent 调度 |
| \`question\` | \`AskUserQuestion\` | 向用户提问 |
`,
  'openfeel-update-stage-status': `---
name: openfeel-update-stage-status
description: 标准化更新 .openfeel/plan/{series}/{stage}/status.md 的子计划状态、责任 Agent 和状态记录，避免各 Agent 随意改写状态文件。适用于自动闭环和人工流程中的阶段状态变更。
---

# 更新子计划状态

## 输入

- 计划阶段名 \`{stage}\`
- 阶段 ID \`{stage}\` 可为完整 \`vX.Y.Z.W-stage-NN\` 或短名 \`stage-NN\`，对应目录 \`plan/{series}/stage-NN/\`（\`{series}\` = 主版本系列，如 \`v1\`；短名默认 \`v1\`）
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

读取 \`.openfeel/config.yaml\`，获取 \`defaults\` 中的 \`execution_mode\`、\`auto_advance\`、\`merge_mode\`、\`workflow_mode\`。

### 1. 读取状态文件

读取 \`.openfeel/plan/{series}/{stage}/status.md\`。

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
- \`工作流模式\`（模式字段**不由**状态更新覆盖）
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

当子计划状态变为 \`done\` 或 \`review_passed\`（且 openfeel-reviewer 验收完毕）时，根据 \`.openfeel/config.yaml\` 中的 \`merge_mode\` 决定合并行为：

- **\`merge_mode=auto\`**：
  1. 将 \`合并状态\` 更新为 \`merged\`（实际合并由 openfeel-executor 执行 git 操作，Skill 仅更新状态字段）
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
  'openfeel-wizard': `---
name: openfeel-wizard
description: 交互式流水线向导，供 Agent 在终端中逐步推进流水线阶段。
---

# 交互式流水线向导

## 输入

无

## 执行步骤

1. 运行 \`openfeel flow wizard\` 启动交互式向导
2. 按提示选择要推进的阶段和下一步 phase（基于当前阶段的可达 transitions）
3. 确认后执行推进，循环直至阶段 done 或退出

> **模式选型**：首次运行时向导会询问工作流模式（\`full\` / \`fast\`），写入 \`config.yaml defaults.workflow_mode\`（项目级记忆）；非 TTY 环境沿用既有守卫、不询问。（阶段合法子集：不含需求级 \`general\`；\`general\` 仅需求级合法）

## 输出

向导推进结果：阶段 phase 变化（from → to），结束/退出提示

> 注：需交互式终端（TTY），非交互环境请改用 \`openfeel flow advance --stage <id> --to <phase>\`
>
> ⚠️ **本仓自举**：本仓（openfeel 源码仓库）开发/执行时请用 \`node bin/openfeel.js <cmd>\`；安装后使用 \`openfeel <cmd>\`。
>
> 静态命令/参数/phase/stageId 参考见 \`openfeel-cli-usage\` skill（本 skill 负责交互式执行推进）。
`,
  'openfeel-workspace': `---
name: openfeel-workspace
description: 会话启动时检查并补齐 .openfeel/ 工作区目录结构与空文件的标准化操作步骤（mkdir 哪些目录、创建哪些空文件、读 .info.json 取用户名），并给出目录语义（公共域 / 私域）与骨架模板。
---

# 工作区启动自检

## 输入

无（自动按 .openfeel/.info.json 与 ~/.openfeel/update_infos.md 推断）

## 执行步骤

### 1. 读取用户名
读 \`.openfeel/.info.json\` 的 \`user\` 字段；缺失则 \`git config user.name\`。

### 2. 检查公共域目录（缺失则 mkdir -p）
\`.openfeel/dev/note/\`、\`.openfeel/dev/current_archive/\`、\`.openfeel/log/\`、\`.openfeel/code_review/\`、\`.openfeel/bugs/\`、\`.openfeel/plan/\`、\`.openfeel/kb/\`、\`.openfeel/tmp/\`

### 3. 检查公共域文件（缺失则创建空文件）
\`.openfeel/dev/dev_core.md\`、\`.openfeel/dev/current.md\`、\`.openfeel/dev/decisions.md\`、\`.openfeel/kb/index.md\`

### 4. 检查私域目录（基于 {username}）
\`.openfeel/users/{username}/log/\`、\`note/\`、\`code_review/\`、\`bugs/\`、\`tmp/\`、\`dev_last/\`（主题记录目录；**主题文件名英文**，如 \`pending.md\`/\`decisions.md\`）

### 5. 检查私域文件
\`.openfeel/users/{username}/dev_last.md\`（**索引**；同名目录 \`dev_last/\` 存主题文件，**文件名英文**）

### 6. 增量更新复核
检查 \`~/.openfeel/update_infos.md\`，若存在未修复条目（追加/异常），提醒用户重启会话，并按 \`openfeel-memory\` 的 update_infos 检查修复流程处理；本 Agent 不自行修改该文件。

## 目录语义（公共域 / 私域）

\`.openfeel/\` 分为**公共域**与**私域**两部分：

- **公共域**：直接位于 \`.openfeel/\` 下，存放项目级共享内容（核心规则、计划、团队日志、知识库等），**纳入版本管理**。
- **私域**：位于 \`.openfeel/users/{username}/\` 下，存放个人操作状态、日志、笔记、代码审查、Bug 追踪等，**加入 \`.gitignore\` 不纳入版本管理**。

所有用户（含单人项目）均遵循此分区结构。Agent 每次通过 \`.openfeel/.info.json\` 获取当前用户名确定私域路径；代码修改后须同步更新私域内相关文件，保持与实际状态一致。

### 设计目的与分层原则

> **两条设计目的（一切格式规则的推导总纲）**：
> ① **保存核心信息便于恢复**——任何时刻打开索引（\`dev/current.md\` / \`users/{username}/dev_last.md\`）即可在有限上下文内恢复到可继续工作的程度。
> ② **避免无关信息污染上下文**——索引层只放「结论与位置」，细节下沉到主题文件 / \`tmp/\` 文档；索引不承载过程性明细。

**分层原则**：

| 层 | 载体 | 粒度上限 | 读者 |
|----|------|----------|------|
| 索引层 | \`.openfeel/dev/current.md\`、\`.openfeel/users/{username}/dev_last.md\` | 条数硬限 + 字数硬限 | 用户 / 会话启动 |
| 主题层 | \`.openfeel/users/{username}/dev_last/{english-name}.md\` | ≤10 条、≤300 字/条 | 按需读取 |
| 详情层 | \`.openfeel/users/{username}/tmp/\` 文档 | 不限（仅记**地址**） | 显式指定时读取 |

> **路径自校验**：构造 \`.openfeel/users/{username}/\` 路径可能意外截断用户名（如 \`Alice\` → \`Alic\`）。访问失败（file not found）时不要直接报错：先重读 \`.openfeel/.info.json\` 取正确 \`username\`，逐字符比对后重建路径重试；连续失败则向用户报告「路径 \`{失败路径}\` 不存在，已确认用户名为 \`{正确用户名}\`」后操作。

### 公共域目录职责与命名

| 路径 | 职责 | 命名约定 |
|------|------|----------|
| \`.openfeel/.info.json\` | 用户身份（\`{ "user": "username" }\`；缺失则由 \`git config user.name\` 补齐） | 加入 \`.gitignore\` |
| \`.openfeel/dev/\` | 项目共享的核心规则与进度状态 | — |
| \`dev/dev_core.md\` | 长期有效规则；每条形如 \`[+]\` / \`[-]\` 前缀，**只标禁用不删除** | — |
| \`dev/current.md\` | **团队文件（用户级视图）**：跨用户操作与整体信息；**仅个人提交时更新**（一次提交 = 一条记录）；只写整体信息、**禁止** agent 细节；仅保留近期 5 条 | — |
| \`dev/current_archive/\` | 轮换出的旧记录（**只增不删**，公共域纳版本管理） | \`current-{yyyy-mm-dd}-{NNN}.md\`（同日 NNN 递增） |
| \`dev/note/dev_note.md\` | 团队共享开发笔记（来源 = 成员个人笔记的归入） | — |
| \`log/\` | 公共日志：**仅团队级重要事件**；按年 / 月 / 日分层，日目录仅当天有事件时创建 | \`yyyy-mm-dd-{username}-NNN.md\`；日目录 \`day_index.md\`；根 \`index.md\` + \`log.md\`（最近 30 条） |
| \`code_review/\` | 私域审查完成后的核心结论摘要（按计划阶段组织） | 阶段文件 \`{stage}.md\`；根 \`index.md\`（按阶段分组 + 状态统计） |
| \`bugs/\` | 私域 Bug 关闭后的结论摘要（按模块组织） | 模块文件 \`{module}.md\`；根 \`index.md\`（按模块分组） |
| \`plan/\` | 计划目录：大计划 \`plan.md\` + 小计划 \`{stage}/\` 子目录；按大版本系列组织 | \`plan/index.md\` 顶层索引；\`{version}/index.md\` 系列索引；\`plan_log.md\`（最近 30 条） |
| \`kb/\` | 知识库（「项目是什么样的」+「遇到问题怎么办」） | \`index.md\` / \`architecture.md\` / \`patterns.md\` / \`troubleshooting.md\` / \`setup.md\` |
| \`tmp/\` | 项目级临时文件（共享数据、构建产物） | 仅在用户指定时读取 |

### 私域目录职责与命名（\`.openfeel/users/{username}/\`）

| 路径 | 职责 | 命名约定 |
|------|------|----------|
| \`dev_last.md\`（索引）+ \`dev_last/\`（主题文件） | 本地状态恢复与操作记录；**超期文件不做归档** | 主题文件**文件名一律英文 kebab-case**（如 \`pending.md\` / \`decisions.md\`） |
| \`log/\` | 个人日志（日常操作的主要记录位置） | \`yyyy-mm-dd-NNN.md\`（无需用户名） |
| \`note/\` | 个人笔记（经验教训的**主要记录位置**） | 简要描述 + 子文件索引 |
| \`code_review/\` | 开发阶段代码评审问题（架构 / 规范 / 逻辑），按计划阶段组织 | \`REV-{plan_stage}.md\`；根 \`index.md\` + \`log.md\`（最近 30 条） |
| \`bugs/\` | 测试阶段缺陷追踪，按模块组织 | \`{module}/BUG-{NNN}_{简略标题}.md\`（NNN 模块内递增）；根 \`index.md\` + \`log.md\`（最近 30 条） |
| \`tmp/\` | 当前用户临时文件（与其他用户完全隔离） | — |

> **记录纪律边界**：何时记 / 记什么 / 格式 / 禁止 → \`openfeel-logging\`；记忆加载 / 偏好合并 / 决策追加 / 落档写入 → \`openfeel-memory\`；本 skill 只承载**目录存在性、目录语义与骨架模板形态**。

## 骨架模板

### 1. \`dev/current.md\` 骨架（+ 归档命名）

\`\`\`markdown
# 当前进度

> {一句话整体进度}（整体信息，用户级视图）

## 近期提交记录（最多 5 条，最新在上）

- **{yyyy-mm-dd HH:MM}** @{username}：{整体信息：做了什么、处于什么状态（不写 agent 细节、不写逐条流水）}
- **{yyyy-mm-dd HH:MM}** @{username}：{…}

> 更早记录见 \`.openfeel/dev/current_archive/\`（每次提交自动归档最旧一条；本文件仅保留近期 5 份）。
\`\`\`

- 归档文件名 \`current-{yyyy-mm-dd}-{NNN}.md\`；内容 = 被移出的记录行 + \`>\` 元信息行（原日期、移出时间）。
- 记录内**保留单行内联 \`@{username}\`**（跨用户场景标识提交者，行内标识 ≠ 分节）。

### 2. \`dev_last.md\` 索引骨架 + 主题文件骨架

索引（\`dev_last.md\`）：

\`\`\`markdown
# dev_last — 索引（{username}）

> 本文件为**索引**：只列主题与核心摘要。详情在 \`dev_last/{english-name}.md\`（每主题 ≤10 条、每条 ≤300 字）；超量详情写入 \`.openfeel/users/{username}/tmp/\`，并在主题文件记录其地址。超期文件**不做归档**。

## 用户偏好
- 语言：{lang} ｜ 自动推进：{auto_advance} ｜ 审查模式：{review_mode}
- 沟通风格：{communication} ｜ 确认阈值：{confirm_threshold}

## 主题索引（最多 5 个）

> 每条：\`**{显示主题名（可中文）}**（\`dev_last/{english-name}.md\`）\` + ≤5 条摘要（每条 ≤100 字）。文件名一律英文。

- **待续事项**（\`dev_last/pending.md\`）
  - {近期工作核心内容，≤100 字}
- **决策记录**（\`dev_last/decisions.md\`）
  - {…}

## 已收敛主题（不计入上方 5 个上限；仅一行，文件就地保留）

- **{显示主题名}**（\`dev_last/{english-name}.md\`，收敛于 {yyyy-mm-dd}）：{≤100 字摘要}

## 公共交接区（跨会话传递信息）

> 仅列**交接文档位置 + 核心摘要**，不描述细节。

- 交接文档：\`{路径（可为 dev_last/{english-name}.md 或 tmp 文档）}\`
- 核心摘要：{一句话}
\`\`\`

主题文件（\`dev_last/{english-name}.md\`，**文件名英文**）：

\`\`\`markdown
# 主题：{显示主题名（可中文）}

> 详情记录：近期 ≤10 条、每条 ≤300 字。超出则写入 \`tmp/\` 文档并在此记录地址。超期记录不归档。

- **{yyyy-mm-dd}** {近期工作核心内容（≤300 字）}

> 超量详情：\`{tmp 文档路径}\`（如 \`.openfeel/users/{username}/tmp/{file}.md\`）
> 超期记录：**不归档**（就地保留或由用户手动清理）。
\`\`\`

- 主题文件名映射：待续事项 → \`dev_last/pending.md\`、决策记录 → \`dev_last/decisions.md\`、流水线状态 → \`dev_last/pipeline-state.md\`、上次操作 → \`dev_last/last-operation.md\`、经验暂存 → \`dev_last/experience.md\`（新主题同理，英文 kebab-case）。
- 主题数 >5 时：**优先合并同类主题**；无可合并则把最旧且已完结主题降为一行摘要移入「已收敛主题」（\`dev_last/archive/\` **不存在**，不迁移、不归档）。

### 3. \`REV-{NO}\` 条目模板

\`\`\`markdown
## REV-{NO}: {简要标题}
- **状态**：pending | fixing | resolved | closed
- **优先级**：high | medium | low
- **提出人**：openfeel-reviewer
- **提出时间**：yyyy-mm-dd HH:MM

### 问题描述
...

### 处理记录
| 时间 | 操作者 | 说明 | Commit |
|------|--------|------|--------|

### 验收记录
| 时间 | 验收人 | 结论 | 备注 |
|------|--------|------|------|
\`\`\`

- 按计划阶段集中在 \`code_review/REV-{plan_stage}.md\`；根目录维护 \`index.md\`（按阶段分组索引 + 各状态数量统计）与 \`log.md\`（最近 30 条审查变更摘要）。

### 4. Bug 目录结构 + 命名 + 审查 / 追踪生命周期

\`\`\`
.openfeel/users/{username}/bugs/
├── index.md              # 按模块分组索引（### {模块名} @{负责Agent名}）
├── log.md                # 最近 30 条变更摘要
├── {module_a}/
│   ├── BUG-001_标题.md
│   └── BUG-002_标题.md
└── {module_b}/
    └── BUG-001_标题.md
\`\`\`

代码审查与 Bug 追踪**共用同一状态流转模型**（仅起始状态名不同）：

\`\`\`
pending/open  ──→  fixing  ──→  resolved  ──→  closed
      ↑                         │
      └────────── 验收不通过 ───┘
\`\`\`

| 状态 | 代码审查 | Bug 追踪 | 操作者 |
|------|---------|---------|--------|
| 起始 | \`pending\` | \`open\` | openfeel-reviewer / openfeel-feel-tester 提交 |
| 修复中 | \`fixing\` | \`fixing\` | openfeel-executor 承接 |
| 待验收 | \`resolved\` | \`resolved\` | openfeel-executor 完成 |
| 关闭 | \`closed\` | \`closed\` | openfeel-reviewer / openfeel-feel-tester 验收通过 |

- 条目 \`closed\` 时：审查结论写入 \`.openfeel/code_review/{stage}.md\`，Bug 结论写入 \`.openfeel/bugs/{module}.md\`，并在公共日志简要记录。

## 输出

工作区自检结果：补齐的目录 / 文件清单 + 用户名 + 未修复条目提示

> 本 skill 承载操作步骤、目录语义与骨架模板；全局约束见全局规则文件（opencode 适配器：\`~/.config/opencode/AGENTS.md\`；Claude Code 适配器：\`~/.claude/CLAUDE.md\`）。
`,
};
// AUTO-GENERATED-END: SKILL_DEFINITIONS

// ─── 辅助函数 ──────────────────────────────────────────────────────

/** 写全文时的受管内容组合：frontmatter 序列化 + 正文标记包裹 */
function composeManagedContent(content: string, type: 'markdown' | 'gitignore'): string {
  const split = type === 'markdown' ? splitFrontmatter(content) : null;
  if (split) {
    return serializeFrontmatter(split.frontmatter) + wrapRegion(split.body, type);
  }
  return wrapRegion(content, type);
}

/** writeManagedFile 结果动作 */
export type ManagedAction = 'created' | 'updated' | 'skipped' | 'appended';

/**
 * 受管文件写入（控制区优先 + hash 兜底 三态）。
 * 分派依据 detectFileType；jsonc 不走本函数（调用方走深度合并）。
 * target 供 update_infos 路径记录：全局资产 { isGlobal: true }，项目资产 { isGlobal: false, projectRoot }。
 */
function writeManagedFile(
  filePath: string,
  content: string,
  stateKey: string,
  updateState: UpdateState | null,
  target: { isGlobal: boolean; projectRoot?: string },
  command: BackupCommand,
): ManagedAction {
  const type = detectFileType(filePath);
  if (type === null || type === 'jsonc') {
    // 无策略 / JSONC：不应到达（jsonc 由 updateProject 单独走深度合并）
    throw new Error(`writeManagedFile: 不支持的类型 ${filePath}`);
  }

  // 拆 incoming 的 frontmatter + 正文（gitignore 无 frontmatter，body=content）
  const incomingSplit = type === 'markdown' ? splitFrontmatter(content) : null;
  const incomingFm = incomingSplit?.frontmatter ?? null;
  const incomingBody = incomingSplit?.body ?? content;

  // 不存在 → created（写全文：frontmatter + 标记包裹正文）
  if (!existsSync(filePath)) {
    atomicWriteFileSync(filePath, composeManagedContent(content, type));
    return 'created';
  }

  const existing = readFileSync(filePath, 'utf-8');
  const existingSplit = type === 'markdown' ? splitFrontmatter(existing) : null;
  const existingFm = existingSplit?.frontmatter ?? null;
  const existingBody = existingSplit?.body ?? existing;

  const region = parseRegion(existingBody, type);

  // 写前备份（B3）：目标已存在且本次将实际改变内容时调用；备份失败 → 'skipped'（不覆盖）
  const runPreWriteBackup = (): 'ok' | 'skipped' => {
    try {
      const backup = backupFileBeforeWrite(filePath, {
        command,
        projectPath: target.isGlobal ? undefined : target.projectRoot,
      });
      if (backup) {
        appendUpdateInfo('backed', target.isGlobal
          ? { absolutePath: filePath, backupRel: backup.backupRel, command }
          : { projectRoot: target.projectRoot, relativePath: stateKey, backupRel: backup.backupRel, command });
        notifyBackupIfTTY(backup.backupRel); // B6：仅 TTY
      }
      return 'ok';
    } catch (err) {
      if (err instanceof BackupError) {
        // 备份失败 → 记可区分异常（REV-004）并跳过该文件写入，返回既有 'skipped'
        appendUpdateInfo('anomaly', target.isGlobal
          ? { absolutePath: filePath, note: 'backup_failed' }
          : { projectRoot: target.projectRoot, relativePath: stateKey, note: 'backup_failed' });
        console.warn(t('update.fileWriteSkipTmpl', getCliLang(target.projectRoot ?? process.cwd()), { err: err.message }));
        return 'skipped';
      }
      throw err;
    }
  };

  if (region.status === 'ok') {
    // 含标记：frontmatter 合并 + 正文区内替换，全文比对（REV-901 skip 判定）
    // incoming 无 frontmatter（如 core.md/AGENTS.md 模板）时保留用户已有 frontmatter，避免写入丢失（REV-1101）
    const newFm = existingFm && incomingFm ? mergeFrontmatter(existingFm, incomingFm) : (existingFm ?? incomingFm);
    const newBody = replaceRegion(existingBody, incomingBody, type);
    const newContent = newFm ? serializeFrontmatter(newFm) + newBody : newBody;
    if (newContent === normalize(existing)) {
      return 'skipped';
    }
    if (runPreWriteBackup() === 'skipped') {
      return 'skipped';
    }
    atomicWriteFileSync(filePath, newContent);
    return 'updated';
  }

  if (region.status === 'none') {
    // 无标记：hash 兜底（N3）
    const fileState = updateState?.files[stateKey];
    if (fileState && hashContent(existing) === fileState.hash) {
      // adopt：存量框架文件未改 → 直接写带标记的新框架内容（等价 created 记为 updated）
      if (runPreWriteBackup() === 'skipped') {
        return 'skipped';
      }
      atomicWriteFileSync(filePath, composeManagedContent(content, type));
      return 'updated';
    }
    // 追加受管区（标记包裹正文，不触碰 frontmatter），并记录待会话启动复核
    const appendedRegion = wrapRegion(incomingBody, type);
    const sep = existing.endsWith('\n') ? '' : '\n';
    if (runPreWriteBackup() === 'skipped') {
      return 'skipped';
    }
    atomicWriteFileSync(filePath, `${existing}${sep}${appendedRegion}`);
    appendUpdateInfo('appended', target.isGlobal ? { absolutePath: filePath } : { projectRoot: target.projectRoot, relativePath: stateKey });
    return 'appended';
  }

  // malformed（>1 对 / 不成对）：不追加、不写盘，仅记录异常条目待人工修复标记；
  // 修复后下次 update 走 ok（区内替换）/ none（hash 兜底）正常路径，杜绝重复追加死循环（REV-1001 修订）
  appendUpdateInfo('anomaly', target.isGlobal ? { absolutePath: filePath } : { projectRoot: target.projectRoot, relativePath: stateKey });
  return 'skipped';
}

/**
 * 写单个全局资产文件（REV-1205 最小侵入抽取，供 migrate 复用）。
 * 等价 writeManagedFile(filePath, content, filePath, state, { isGlobal: true })，
 * 即 stateKey = 绝对路径、target 为全局资产。
 * @returns 动作分类，供调用方报告。
 */
export function deployGlobalAsset(
  filePath: string,
  content: string,
  state: UpdateState,
  command: BackupCommand,
): ManagedAction {
  return writeManagedFile(filePath, content, filePath, state, { isGlobal: true }, command);
}

/** 将 writeManagedFile 的动作分发到对应结果数组 */
function pushAction(
  action: ManagedAction,
  stateKey: string,
  created: string[],
  updated: string[],
  skipped: string[],
  appended: string[],
): void {
  switch (action) {
    case 'created': created.push(stateKey); break;
    case 'updated': updated.push(stateKey); break;
    case 'skipped': skipped.push(stateKey); break;
    case 'appended': appended.push(stateKey); break;
  }
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
  const appended: string[] = [];

  // ── 增量更新：加载项目 state（AGENTS.md / 项目 opencode.jsonc）与全局 state（框架资产）──
  const state = loadUpdateState(projectPath);
  const globalState = loadGlobalUpdateState();
  const conflicts: string[] = [];

  // 过滤：仅处理选中的工具（两工具都未选才早退）
  const wantOpencode = selectedTools.includes('opencode');
  const wantClaude = selectedTools.includes('claude');
  if (!wantOpencode && !wantClaude) {
    return { created: [], updated: [], skipped: [], conflicts: [], appended: [] };
  }

  // N8：检测项目内遗留 .opencode/{agents,skills,instructions}，只提示不迁移
  const legacyDirs = ['agents', 'skills', 'instructions']
    .filter((d) => existsSync(resolve(projectPath, '.opencode', d)));
  if (legacyDirs.length > 0) {
    console.warn(t('update.legacyLayoutWarnTmpl', getCliLang(projectPath), { dirs: legacyDirs.join(',') }));
  }

  // 记录项目语言映射到全局配置
  // 使用 options?.lang（用户通过 --lang 显式指定的语言）优先，
  // 回退到 lang（getCliLang 三级回退结果）。确保记录的语言与实际部署语言一致。
  try {
    recordProjectLang(projectPath, options?.lang ?? lang);
  } catch {
    // 记录失败不影响主流程
  }

  // 全局 state 可写实例：首次 null → 降级重建（后续全量写入全局资产，防静默不部署）
  const newGlobalState: UpdateState = globalState ?? createGlobalUpdateState({});

  // v1.1.1：存量全局 state 的 core.md key → 全局 AGENTS.md key（一次性重映射）
  // 说明：在 newGlobalState 创建后执行（newGlobalState = globalState ?? createGlobalUpdateState({})；
  // 非 null 时二者同引用，故直接改 globalState 即改 newGlobalState）。
  const staleCoreKey = getGlobalCoreMdPath();
  if (globalState && globalState.files[staleCoreKey] && !globalState.files[getGlobalAgentsMdPath()]) {
    globalState.files[getGlobalAgentsMdPath()] = globalState.files[staleCoreKey];
    delete globalState.files[staleCoreKey];
  }

  // opencode 分支（步骤 0~4）——原样保留
  if (wantOpencode) {
    // 全局部署目标（D1）
    const agentsDir = getGlobalAgentsDir();
    const skillsDir = getGlobalSkillsDir();

    // 确保全局目标目录存在
    mkdirSync(agentsDir, { recursive: true });
    mkdirSync(skillsDir, { recursive: true });

    // 0. 生成全局框架约束 AGENTS.md（~/.config/opencode/AGENTS.md）
    const agentsMdPath = getGlobalAgentsMdPath();
    const agentsMdContent = loadTemplate(lang, 'agents-md');
    {
      const action = deployGlobalAsset(agentsMdPath, agentsMdContent, newGlobalState, 'update');
      pushAction(action, agentsMdPath, created, updated, skipped, appended);
    }

    // 1. 生成 Agent 定义文件到全局 agents 目录（绝对路径作 state key）
    for (const name of listAgentIds(lang)) {
      const content = loadAgentTemplate(lang, name);
      const filePath = join(agentsDir, `${name}.md`);
      const action = deployGlobalAsset(filePath, content, newGlobalState, 'update');
      pushAction(action, filePath, created, updated, skipped, appended);
    }

    // 2. 生成 Skill 定义文件到全局 skills 目录（每个 Skill 一个子目录，包含 SKILL.md）
    for (const [name, content] of Object.entries(SKILL_DEFINITIONS)) {
      const skillSubDir = join(skillsDir, name);
      mkdirSync(skillSubDir, { recursive: true });
      const filePath = join(skillSubDir, 'SKILL.md');
      const action = deployGlobalAsset(filePath, content, newGlobalState, 'update');
      pushAction(action, filePath, created, updated, skipped, appended);
    }

    // 3. 全局 opencode.jsonc：深度合并（保留用户字段），加全局锁 + 原子写
    const globalJsoncPath = getGlobalOpencodeJsoncPath();
    try {
      // 写前备份（B3）：备份须在 jsonc 锁之外（之前）完成，避免 backup 锁与 jsonc 锁嵌套
      const globalJsoncBackup = backupFileBeforeWrite(globalJsoncPath, { command: 'update' });
      if (globalJsoncBackup) {
        appendUpdateInfo('backed', { absolutePath: globalJsoncPath, backupRel: globalJsoncBackup.backupRel, command: 'update' });
        notifyBackupIfTTY(globalJsoncBackup.backupRel);
      }
      // REV-1805：read-merge-write 全部置于锁内，消除与 model-config 锁内读写的 TOCTOU 竞态
      const globalJsoncNew = withFileLock(globalLockPath('global-opencode-jsonc'), () => {
        // 安全读取（T50）：目录占位/不可读 → null，跳过合并与写入，按空配置继续
        const current = readJsoncFile(globalJsoncPath);
        if (current === null) {
          return null;
        }
        let merged: string;
        // 合并可能因块注释 parse 失败抛异常（parseJsonc 边界）：降级为「跳过合并、保留原文件」并告警
        try {
          merged = mergeGlobalOpencodeJsonc(current);
        } catch (err) {
          console.warn(t('update.globalJsoncParseSkipTmpl', getCliLang(projectPath), { err: (err as Error).message }));
          merged = current;
        }
        atomicWriteFileSync(globalJsoncPath, merged);
        return merged;
      });
      if (globalJsoncNew !== null) {
        updateFileHash(newGlobalState, globalJsoncPath, globalJsoncNew);
      }
    } catch (err) {
      if (err instanceof BackupError) {
        // 备份失败（REV-011-A）：跳过全局 jsonc 写入、记 anomaly、继续其余步骤（对齐 B3 幂等语义）
        appendUpdateInfo('anomaly', { absolutePath: globalJsoncPath, note: 'backup_failed' });
        console.warn(t('update.globalJsoncWriteSkipTmpl', getCliLang(projectPath), { err: err.message }));
      } else {
        throw err; // 非备份错误照旧上抛（锁超时等不回退）
      }
    }

    // 4. 项目 opencode.jsonc：不存在则写最小 { $schema }；已存在则保留（旧非法字段清理属 stage-39）
    const projectJsoncPath = resolve(projectPath, 'opencode.jsonc');
    if (!existsSync(projectJsoncPath)) {
      atomicWriteFileSync(projectJsoncPath, JSON.stringify(buildProjectOpencodeJsoncObj(), null, 2) + '\n');
      created.push('opencode.jsonc');
    } else {
      skipped.push('opencode.jsonc (use existing)');
    }
  }

  // claude 分支：CLAUDE.md + 9 agent + 18 共享 skill + settings.json（stage-73）
  if (wantClaude) {
    const claudeAgentsDir = getClaudeAgentsDir();
    const claudeSkillsDir = getClaudeSkillsDir();
    mkdirSync(claudeAgentsDir, { recursive: true });
    mkdirSync(claudeSkillsDir, { recursive: true });

    // 1c. CLAUDE.md（受管区三态复用 deployGlobalAsset；用户已有 → append 不覆盖）
    const claudeMd = getClaudeMdPath();
    pushAction(deployGlobalAsset(claudeMd, loadClaudeConstraintTemplate(lang), newGlobalState, 'update'), claudeMd, created, updated, skipped, appended);

    // 2c. 9 agents（含 feel）
    for (const name of listClaudeAgentIds(lang)) {
      const p = join(claudeAgentsDir, `${name}.md`);
      pushAction(deployGlobalAsset(p, loadClaudeAgentTemplate(lang, name), newGlobalState, 'update'), p, created, updated, skipped, appended);
    }

    // 3c. 18 共享 skills
    for (const [name, content] of Object.entries(SKILL_DEFINITIONS)) {
      const dir = join(claudeSkillsDir, name);
      mkdirSync(dir, { recursive: true });
      const p = join(dir, 'SKILL.md');
      pushAction(deployGlobalAsset(p, content, newGlobalState, 'update'), p, created, updated, skipped, appended);
    }
    // 4c. settings.json（与 setup 对称，共享 applyClaudeSettings，杜绝双实现漂移）
    const settingsPath = getClaudeSettingsPath();
    pushAction(
      applyClaudeSettings(newGlobalState, 'update', getCliLang(projectPath)),
      settingsPath,
      created, updated, skipped, appended,
    );
  }

  // 重启提醒（按 harness 组合；isTTY 守卫、非交互静默）
  if (process.stdout.isTTY) {
    const reminderLang = getCliLang(projectPath);
    const opencodeChanged = updated.some((f) => f.startsWith(getGlobalAgentsDir()));
    const claudeChanged = [...created, ...updated, ...appended].some(
      (f) => f.startsWith(getClaudeAgentsDir()) || f.startsWith(getClaudeSkillsDir())
        || f === getClaudeMdPath() || f === getClaudeSettingsPath(),
    );
    const harnesses: string[] = [];
    if (opencodeChanged) { harnesses.push('opencode'); }
    if (claudeChanged) { harnesses.push('Claude Code'); }
    if (harnesses.length > 0) {
      console.log(t('update.restartHarnessTmpl', reminderLang, { harness: harnesses.join(' / ') }));
      if (claudeChanged) { console.log(t('update.claudeReloadHintTmpl', reminderLang)); }
    }
  }

  // ── 写入冲突标记文件 ──
  if (conflicts.length > 0) {
    const openfeelVersion = getOpenfeelVersion();
    for (const conflictPath of conflicts) {
      // 全局冲突（绝对路径）写 ~/.openfeel/update_conflicts/；项目冲突写项目 .openfeel/update_conflicts/
      if (isAbsolute(conflictPath)) {
        const currentContent = existsSync(conflictPath) ? readFileSync(conflictPath, 'utf-8') : '';
        const incomingContent = getIncomingContent(conflictPath, lang);
        const relFromGlobal = relative(getOpencodeGlobalDir(), conflictPath);
        // 全局冲突根目录 ~/.openfeel/update_conflicts/（与项目 .openfeel/update_conflicts/ 对称）
        const globalConflictsBase = resolve(dirname(getGlobalUpdateStatePath()), 'update_conflicts');
        writeConflictFile(projectPath, relFromGlobal, currentContent, incomingContent, openfeelVersion, globalConflictsBase);
      } else {
        const absPath = resolve(projectPath, conflictPath);
        const currentContent = existsSync(absPath) ? readFileSync(absPath, 'utf-8') : '';
        // 获取 incoming 内容：冲突未实际写入，需单独获取
        const incomingContent = getIncomingContent(conflictPath, lang);
        writeConflictFile(projectPath, conflictPath, currentContent, incomingContent, openfeelVersion);
      }
    }
  }

  // ── REV-001：统一更新双 update_state.json ──
  // 规则：
  // 1. 无论有无冲突，所有 created/updated 文件的 hash 都必须更新到 state
  // 2. 有冲突时，额外标记冲突文件
  // 3. 首次 update（state === null）→ 创建新 state
  const newState: UpdateState = state ?? createUpdateState(projectPath, {});

  // 更新非冲突文件 hash：项目资产（相对路径）→ 项目 state；全局资产（绝对路径）→ 全局 state
  // appended 追加后同样记录 clean + 新 hash（D38-1：追加即建区，下次走区内替换而非误判无记录）
  for (const p of [...created, ...updated, ...appended]) {
    if (isAbsolute(p)) {
      if (existsSync(p)) {
        updateFileHash(newGlobalState, p, readFileSync(p, 'utf-8'));
      }
    } else {
      const absPath = resolve(projectPath, p);
      if (existsSync(absPath)) {
        updateFileHash(newState, p, readFileSync(absPath, 'utf-8'));
      }
    }
  }

  // 标记冲突文件（按绝对/相对路由到对应 state）
  for (const p of conflicts) {
    if (isAbsolute(p)) {
      markFileConflict(newGlobalState, p);
    } else {
      markFileConflict(newState, p);
    }
  }

  // 更新时间戳
  newState.last_update = new Date().toISOString();
  newGlobalState.last_update = new Date().toISOString();
  // stage-66/D-A：部署完成即刷新「已部署版本」事实源（既有 state 与首次创建均覆盖）
  newGlobalState.openfeel_version = getOpenfeelVersion();

  // 持久化双 state
  saveUpdateState(projectPath, newState);
  saveGlobalUpdateState(newGlobalState);

  return { created, updated, skipped, conflicts, appended };
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
  conflictsBase?: string,
): void {
  // 全局冲突传全局 base（~/.openfeel），项目冲突默认项目 .openfeel/update_conflicts
  const base = conflictsBase ?? resolve(projectPath, '.openfeel', 'update_conflicts');
  mkdirSync(base, { recursive: true });

  const conflictPath = resolve(base, relativePath);
  mkdirSync(dirname(conflictPath), { recursive: true });

  const conflictContent = [
    `<<<<<<< CURRENT (用户修改版)`,
    currentContent,
    `=======`,
    incomingContent,
    `>>>>>>> INCOMING (openfeel v${openfeelVersion} 更新)`,
  ].join('\n');

  atomicWriteFileSync(conflictPath, conflictContent);
}

/**
 * 根据路径获取 incoming（openfeel 期望写入）内容
 * relativePath 现为全局绝对路径（框架资产）或项目相对路径（opencode.jsonc）：
 *  - getGlobalAgentsMdPath() → loadTemplate(lang, 'agents-md')
 *  - getGlobalAgentsDir()/{name}.md → loadAgentTemplate(lang, name)
 *  - getGlobalSkillsDir()/{name}/SKILL.md → SKILL_DEFINITIONS[name]
 *  - opencode.jsonc → buildProjectOpencodeJsoncObj()
 */
function getIncomingContent(
  relativePath: string,
  lang: 'zh-CN' | 'en',
): string {
  // 全局框架约束 AGENTS.md（v1.1.1：约束唯一权威）
  if (relativePath === getGlobalAgentsMdPath()) {
    return loadTemplate(lang, 'agents-md');
  }

  // 全局 agent：位于 getGlobalAgentsDir() 下的 {name}.md
  if (relativePath.startsWith(getGlobalAgentsDir())) {
    const name = basename(relativePath, '.md');
    return loadAgentTemplate(lang, name);
  }

  // 全局 skill：位于 getGlobalSkillsDir() 下的 {name}/SKILL.md（跨平台 basename 匹配）
  if (relativePath.startsWith(getGlobalSkillsDir()) && basename(relativePath) === 'SKILL.md') {
    const name = basename(dirname(relativePath));
    return SKILL_DEFINITIONS[name] ?? '';
  }

  // Claude 全局约束 CLAUDE.md
  if (relativePath === getClaudeMdPath()) {
    return loadClaudeConstraintTemplate(lang);
  }
  // Claude agent：位于 getClaudeAgentsDir() 下的 {name}.md
  if (relativePath.startsWith(getClaudeAgentsDir())) {
    return loadClaudeAgentTemplate(lang, basename(relativePath, '.md'));
  }
  // Claude skill：位于 getClaudeSkillsDir() 下的 {name}/SKILL.md
  if (relativePath.startsWith(getClaudeSkillsDir()) && basename(relativePath) === 'SKILL.md') {
    return SKILL_DEFINITIONS[basename(dirname(relativePath))] ?? '';
  }

  // 项目 opencode.jsonc
  if (relativePath === 'opencode.jsonc') {
    return JSON.stringify(buildProjectOpencodeJsoncObj(), null, 2) + '\n';
  }

  // 未知路径 → 空内容（不应发生）
  return '';
}
