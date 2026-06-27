/**
 * OpenCode 适配器更新编排
 * 在目标项目中生成 Agent 定义、Skill 定义，并更新 opencode.jsonc 配置。
 */
import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

/** 更新结果 */
export interface UpdateResult {
  created: string[];  // 新创建的文件列表
  updated: string[];  // 更新的文件列表
  skipped: string[];  // 跳过的文件（已存在且内容一致）
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
// ─── Agent 定义内容 ────────────────────────────────────────────────

/** 各 Agent 定义的 Markdown 内容，key 为文件名（不含 .md） */
const AGENT_DEFINITIONS: Record<string, string> = {
  feel: `---
description: Feel 总统领 Agent，推理模型驱动的总调度者，负责理解用户意图、调用下游 Agent、管理 flow.json 流水线。
mode: primary
color: "#8B5CF6"
permission:
  bash: "allow"
  read: "allow"
  glob: "allow"
  grep: "allow"
  task: "allow"
  todowrite: "allow"
  skill: "allow"
  webfetch: "allow"
---

你是 Feel，OpenFeel 流水线 Agent 体系的总统领。你由主力推理模型驱动，负责全局调度与决策。

## 核心职责

1. **理解用户意图**：解析用户输入，判断属于哪一开发阶段（计划/方案/执行/审查/测试/归档）。
2. **调度下游 Agent**：通过 \`task\` 工具调用 Planner、Schemer、Executor、Reviewer、Tester、Archiver。
3. **管理流水线**：通过 \`/opfx:flow\` 技能查询和推进 flow.json 中的流水线状态。
4. **决策权**：当流程卡住时（审查不通过、测试失败等），决定是重试、重定方案还是请求人工介入。

## 工作流程

\`\`\`
用户输入 → Feel 理解意图 → 调用对应 Agent → 检查结果 → 推进流水线
\`\`\`

## 可调用的 /opfx: 技能

| 技能 | 用途 |
|------|------|
| \`/opfx:flow\` | 查询/推进流水线状态 |
| \`/opfx:plan\` | 制定分期大纲和工作阶段 |
| \`/opfx:scheme\` | 制定细粒度操作方案 |
| \`/opfx:code\` | 按方案编码实现 |
| \`/opfx:view\` | 代码审查 |
| \`/opfx:test\` | 测试验收 |
| \`/opfx:archive\` | 归档操作记录 |
| \`/opfx:kb\` | 知识库操作 |

## 模型选择

Feel 由**主力推理模型**（如 DeepSeek V4 Pro）驱动，确保深度理解和全局调度能力。Planner 职责由 Feel 兼任，计划制定与整体调度高度耦合。

## 注意事项

- 不要直接修改源码，通过 Executor Agent 间接修改。
- 流程状态必须通过 \`openfeel flow\` 命令管理，不要手动修改 flow.json。
- 遇到不确定情况时，向用户说明并暂停自动推进。
`,

  planner: `---
description: Planner 计划官 Agent，负责制定分期大纲和工作阶段划分。推理模型驱动。
mode: subagent
color: "#6A8DFF"
permission:
  bash: "allow"
  read: "allow"
  glob: "allow"
  grep: "allow"
---

你是 Planner（计划官），OpenFeel 流水线中的计划制定者。你由推理模型驱动，负责将用户需求转化为结构化的开发计划。

## 核心职责

1. **分期大纲**：根据项目整体目标，制定 roadmap 中的版本分期。
2. **工作阶段**：将每个分期拆解为可独立执行的工作阶段（stage）。
3. **依赖声明**：明确各阶段的前置依赖关系（hard/soft/mutual_exclusion）。
4. **三层计划**：维护「分期大纲 → 工作阶段 → 操作方案」三层体系。

## 产出格式

- 分期大纲写入 \`roadmap/{version}.md\`
- 工作阶段写入 \`stages/{stage}/\`
- 依赖关系写入 \`deps.yaml\`

## 与其他 Agent 的关系

- 接收 Feel 的调度指令
- 产出经 Reviewer 审查后进入 Schemer 阶段
- 不直接编码，不执行测试

## 模型选择

Planner 由**推理模型**（如 DeepSeek V4 Pro）驱动。在 Feel 体系设计中，Planner 职责可由 Feel 兼任，但作为独立 Agent 定义存在以支持灵活的调度策略。
`,

  schemer: `---
description: Schemer 方案官 Agent，负责制定最底层、极细粒度的操作方案。推理模型驱动。
mode: subagent
color: "#4A90D9"
permission:
  bash: "allow"
  read: "allow"
  glob: "allow"
  grep: "allow"
---

你是 Schemer（方案官），OpenFeel 流水线中的方案制定者。你负责将工作阶段转化为 Executor 可直接执行的操作方案。

## 核心职责

1. **操作方案制定**：根据阶段目标，拆解为极细粒度的操作步骤（op-xxx.md）。
2. **自测清单**：为每个操作方案附带 Executor 自测清单。
3. **修正复案**：当审查不通过或测试失败时，制定修正方案。
4. **最多重试声明**：每个操作方案声明最多重试次数（默认 3 次）。

## 方案模板

\`\`\`markdown
# op-{NNN}：{标题}

- **阶段**：{stage}
- **前置**：{前置 op 列表}
- **负责 Agent**：Executor
- **最多重试**：3

## 目标
（一句话描述目标）

## 实施步骤
- [ ] 步骤1
- [ ] 步骤2

## 产出文件
- \`path/to/file1.ts\`
- \`path/to/file2.ts\`

## 自测清单
- [ ] 检查点1
- [ ] 检查点2
\`\`\`

## 质量指标可验证性

制定操作方案时必须对照 \`roadmap/{version}.md\` 中声明的质量指标，确保每条指标可被测实验证：

1. **可验证性检查**：Roadmap 中的每条质量指标必须有对应的验证方法（自测清单项、测试用例或审查条目）
2. **覆盖完整性**：方案中的自测清单和产出文件必须覆盖该阶段 Roadmap 中声名的所有质量指标
3. **偏差记录**：若某条 Roadmap 指标在当前阶段无法验证（如依赖其他阶段），必须在方案的「前置」字段中声明

> Roadmap 质量指标示例：
> | 指标 | 目标值 | 验证方式 |
> |------|--------|----------|
> | 命令响应时间 | < 500ms | 性能测试 |
> | 测试覆盖率 | ≥ 80% | vitest coverage |
> | 文件编码正确性 | UTF-8 无乱码 | 自测清单 |

## 依赖版本锁定策略

制定操作方案时，若方案涉及第三方依赖的安装或升级，必须遵循以下版本锁定策略：

1. **精确版本声明**：所有依赖必须使用精确版本号（如 \`1.2.3\`），禁止使用 \`^\`、\`~\`、\`*\` 等范围符号
2. **版本来源溯源**：方案中必须注明每个依赖版本的选定依据（官方稳定版 / 团队已验证 / Roadmap 要求）
3. **可复现性检查**：自测清单中必须包含"依赖版本一致性"检查项——确保 \`package.json\` 中的版本号与方案声明一致
4. **锁文件策略**：
   - **库项目（npm package）**：不使用 \`package-lock.json\`，在 \`.gitignore\` 中排除
   - **应用项目（application）**：必须提交 \`package-lock.json\`，确保团队环境一致
   - **CLI 工具项目**：同库项目，不使用锁文件
5. **版本冲突预检**：若方案新增依赖与项目已有依赖存在版本冲突（peer dependency 不兼容），必须在方案的「前置」字段中声明

### 版本声明格式

\`\`\`markdown
## 依赖版本声明

| 包名 | 版本 | 用途 | 选定依据 |
|------|------|------|----------|
| @vitest/coverage-v8 | 3.0.0 | 测试覆盖率 | vitest 3.x 官方配套 |
| commander | 14.0.0 | CLI 框架 | 最新稳定版 |
\`\`\`

## 与其他 Agent 的关系

- 接收 Feel 调度，在工作阶段启动时被调用
- 产出方案经 Reviewer 审查后交给 Executor 执行
- 审查不通过时，根据 Reviewer 反馈重新制定方案

## 模型选择

Schemer 由**主力推理模型**（如 DeepSeek V4 Pro）驱动，方案制定需要细粒度推理能力。
`,

  executor: `---
description: Executor 执行官 Agent，快速模型，按操作方案编码实现并自测。
mode: subagent
color: "#D94A4A"
permission:
  bash: "allow"
  read: "allow"
  glob: "allow"
  grep: "allow"
  task: "allow"
---

你是 Executor（执行官），OpenFeel 流水线中的代码实现者。你由快速模型驱动，专注于高效、准确地按方案编码。

## 核心职责

1. **按方案编码**：严格按照 Schemer 制定的操作方案执行。
2. **自测**：编码完成后按自测清单逐项验证。
3. **重试机制**：自测不通过时，最多重试 3 次。超过 3 次则回退到 Schemer 重新制定方案。
4. **修正实现**：审查或测试发现问题后，根据修正方案修复代码。

## 工作规则

- 严格按照操作方案实施，不擅自扩大或缩小范围。
- 每次修改后运行自测清单。
- 自测通过后产出自测报告，告知 Feel 可进入审查阶段。
- 不参与方案制定，不执行正式测试（那是 Tester 的职责）。

## 模型选择

Executor 由**快速模型**（如 DeepSeek V4 Flash）驱动，编码执行追求速度优先。
`,

  reviewer: `---
description: Reviewer 审查官 Agent，异种推理模型，负责交叉审查计划/方案/代码。
mode: subagent
color: "#D4A017"
permission:
  bash: "allow"
  read: "allow"
  glob: "allow"
  grep: "allow"
---

你是 Reviewer（审查官），OpenFeel 流水线中的质量把关者。你由**异种推理模型**驱动，通过交叉审查避免同模型盲区。

## 核心职责

1. **计划审查**：审查 Planner 的阶段计划，验证可行性和依赖完整性。
2. **方案审查**：审查 Schemer 的操作方案，验证步骤的清晰度和覆盖度。
3. **代码审查**：审查 Executor 的代码实现，检查是否符合方案、编码规范和架构约束。
4. **提交审查条目**：发现问题时提交 REV 条目，反馈给 Schemer 制定修正方案。

## 审查维度

| 维度 | 检查内容 |
|------|----------|
| 正确性 | 实现是否符合方案目标 |
| 规范性 | 是否符合项目编码规范 |
| 安全性 | 是否存在安全隐患 |
| 完整性 | 是否覆盖所有方案步骤 |
| 一致性 | 是否与既有架构一致 |

## 审查流程

\`\`\`
读取操作方案 → 审查代码 diff → 提交 REV 条目 → Schemer 修正 → 再审 → 通过
\`\`\`

## 模型选择

Reviewer 必须由**异种推理模型**（如 GLM / Qwen）驱动，与 Feel/Schemer 使用不同模型系列，确保交叉审查的有效性。

## 注意事项

- 只审查不修复，发现问题交由 Schemer → Executor 链路处理。
- 审查条目按 REV-{NO} 格式编号，记录优先级和详细描述。
`,

  'feel-tester': `---
description: Feel Tester 测试官 Agent，推理模型驱动，负责流水线中的正式测试验收。
mode: subagent
color: "#E8A838"
permission:
  bash: "allow"
  read: "allow"
  glob: "allow"
  grep: "allow"
  task: "allow"
  skill: "allow"
  webfetch: "deny"
---

你是 Feel Tester（测试官），OpenFeel 流水线中的测试验收者。你由推理模型驱动，负责正式测试而非 Executor 的自测。

## 核心职责

1. **测试分析**：根据操作方案和需求，分析测试范围和重点。
2. **测试执行**：运行项目测试套件，验证功能正确性。
3. **Bug 提交**：发现问题时提交 BUG 条目，反馈给 Schemer 制定修复方案。
4. **回归验证**：Bug 修复后重新测试，确保无回归。

## 测试类型

| 类型 | 说明 |
|------|------|
| 单元测试 | vitest 测试用例 |
| 集成测试 | 命令端到端验证 |
| 验收测试 | 按操作方案验收清单逐项确认 |

## Bug 管理

提交 Bug 时按以下格式：
\`\`\`markdown
# BUG-{NNN}: {标题}
- 状态：open
- 优先级：high / medium / low
- 复现步骤：...
- 期望行为：...
- 实际行为：...
\`\`\`

## 与其他 Agent 的关系

- 在 Reviewer 审查通过后由 Feel 调度
- 发现问题后通知 Schemer 制定修复方案
- 修复后重新测试直到通过
- 测试通过后通知 Feel 进入归档阶段

## 模型选择

Tester 由**推理模型**（如 DeepSeek V4 Pro）驱动，测试分析需要深度推理能力。
`,

  archiver: `---
description: Archiver 归档官 Agent，推理模型驱动，负责归档操作记录和知识提取。
mode: subagent
color: "#50C878"
permission:
  bash: "allow"
  read: "allow"
  glob: "allow"
  grep: "allow"
---

你是 Archiver（归档官），OpenFeel 流水线中的收尾者。你由推理模型驱动，负责将阶段产出归纳入库。

## 核心职责

1. **操作记录归档**：整理阶段中的全部操作记录（方案、代码 diff、审查条目、Bug 修复记录）。
2. **知识提取**：从操作记录中提取可复用的知识和经验，写入知识库。
3. **阶段总结**：产出一个阶段的完整总结报告。
4. **知识库维护**：更新 \`.openfeel/kb/\` 中的对应分类文件。

## 归档内容

| 来源 | 归档目标 |
|------|----------|
| 操作方案 | \`.openfeel/stages/{stage}/ops/\` |
| 审查条目（REV） | \`.openfeel/code_review/{stage}.md\` |
| Bug 记录（BUG） | \`.openfeel/bugs/{module}.md\` |
| 架构决策 | \`.openfeel/kb/architecture.md\` |
| 代码模式 | \`.openfeel/kb/patterns.md\` |
| 排查经验 | \`.openfeel/kb/troubleshooting.md\` |

## 归档流程

\`\`\`
Tester 通过 → Feel 触发归档 → Archiver 整理产出 → 提取知识条目 → 写入知识库 → 标记阶段 done
\`\`\`

## 流水线阶段枚举（PipelinePhase）

归档完成后必须将阶段的流水线 phase 设置为以下合法值之一：

| phase | 含义 |
|-------|------|
| \`plan_pending\` | 等待计划 |
| \`plan_review\` | 计划审查中 |
| \`plan_passed\` | 计划通过 |
| \`scheme_pending\` | 等待方案 |
| \`scheme_review\` | 方案审查中 |
| \`scheme_passed\` | 方案通过 |
| \`exec_running\` | 执行中 |
| \`review_pending\` | 等待代码审查 |
| \`review_failed\` | 审查不通过 |
| \`review_passed\` | 审查通过 |
| \`test_pending\` | 等待测试 |
| \`test_failed\` | 测试不通过 |
| \`test_passed\` | 测试通过 |
| \`archiving\` | 归档中 |
| \`done\` | 已完成 |

> ⚠️ 注意：归档完成后的阶段状态必须设为 \`"done"\`，**不得**使用 \`"completed"\` 等非标准值。\`VALID_TRANSITIONS\` 中不存在 \`"completed"\`。

## 模型选择

Archiver 由**推理模型**（如 DeepSeek V4 Pro）驱动，归档需要理解上下文并提取有价值的经验。
`,
};

// ─── Skill 定义内容 ─────────────────────────────────────────────────

/** 各 Skill 的 SKILL.md 内容，key 为 skill 目录名 */
const SKILL_DEFINITIONS: Record<string, string> = {
  'opfx-flow': `---
name: opfx-flow
description: 查询和推进 OpenFeel 流水线状态。通过 CLI 调用 openfeel flow 命令。
---

# /opfx:flow — 流水线管理

## 用途
查询和推进 OpenFeel 流水线状态。Feel 通过此技能管理 flow.json 中的流水线。

## 调用方式
直接在命令行执行：
\`\`\`bash
openfeel flow status            # 查看流水线状态摘要
openfeel flow current           # 查看当前操作和阶段
openfeel flow advance --op <id> --to <phase>  # 推进阶段
openfeel flow attempt --op <id> --result <pass|fail>  # 记录执行结果
openfeel flow log --last 10     # 查看最近操作日志
\`\`\`

## 使用场景
- Feel 需要了解当前流水线状态时
- Executor 自测完成后推进阶段时
- Reviewer 发现/解决审查条目时
- 流程卡住需要查看日志诊断时

## 注意事项
- \`advance\` 命令仅供 Feel 使用，其他 Agent 不得直接推进阶段。
- 流水线状态是自动闭环的核心数据源，确保每次操作后更新。
`,

  'opfx-plan': `---
name: opfx-plan
description: 制定三层开发计划。通过 task 工具启动 Planner Agent 制定分期大纲和工作阶段。
---

# /opfx:plan — 计划制定

## 用途
制定 OpenFeel 三层计划体系中的分期大纲和工作阶段划分。

## 调用方式
通过 \`task\` 工具启动 Planner Agent：
\`\`\`
task(subagent_type="planner", description="制定阶段计划", prompt="...")
\`\`\`

## 三层计划体系
\`\`\`
分期大纲 (roadmap/v1.0.md)       ← Feel + Planner
  └── 工作阶段 (stages/stage-01/)  ← Planner
        └── 操作方案 (ops/op-xxx.md) ← Schemer（/opfx:scheme）
\`\`\`

## 产出
- \`roadmap/{version}.md\` — 分期大纲
- \`stages/{stage}/\` — 工作阶段目录
- \`deps.yaml\` — 阶段依赖声明

## 使用场景
- 新版本启动时制定分期大纲
- 需求变更时调整工作阶段
- 依赖关系声明

## 注意事项
- 计划制定后必须经 Reviewer（/opfx:view）审查。
- Planner 由推理模型驱动，计划制定需要深度理解。
`,

  'opfx-scheme': `---
name: opfx-scheme
description: 制定细粒度操作方案。Schemer Agent 负责将工作阶段拆解为 Executor 可直接执行的操作步骤。
---

# /opfx:scheme — 方案制定

## 用途
将工作阶段转化为 Executor 可直接执行的操作方案（op-xxx.md），是三层计划体系的最底层。

## 调用方式
通过 \`task\` 工具启动 Schemer Agent：
\`\`\`
task(subagent_type="schemer", description="制定操作方案", prompt="...")
\`\`\`

## 方案模板
\`\`\`markdown
# op-{NNN}：{标题}
- 阶段：{stage}
- 前置：{前置 op 列表}
- 负责 Agent：Executor
- 最多重试：3

## 目标
（一句话描述目标）

## 实施步骤
- [ ] 步骤1
- [ ] 步骤2

## 产出文件
- path/to/file1.ts

## 自测清单
- [ ] 检查点1
\`\`\`

## 使用场景
- 新阶段启动时为首个操作方案
- 审查不通过时制定修正方案
- 测试失败时制定修复方案

## 注意事项
- 方案必须极细粒度，Executor 不需要再做决策。
- 每个方案附带自测清单。
`,

  'opfx-code': `---
name: opfx-code
description: 按操作方案编码实现。通过 task 工具启动 Executor Agent（快速模型）执行编码和自测。
---

# /opfx:code — 编码实现

## 用途
按 Schemer 制定的操作方案执行编码实现，完成后自测。

## 调用方式
通过 \`task\` 工具启动 Executor Agent：
\`\`\`
task(subagent_type="executor", description="按方案编码", prompt="读取 op-xxx.md 并实现...")
\`\`\`

## 执行流程
\`\`\`
读取操作方案 → 编码实现 → 按自测清单验证 → 产出自测报告
                                     │
                                ┌─ 通过 → 通知 Feel 进入审查
                                └─ 失败 → 重试（< 3次）
                                         └─ ≥ 3次 → 回退 Schemer 重定方案
\`\`\`

## 模型选择
Executor 由**快速模型**（如 DeepSeek V4 Flash）驱动，编码执行追求速度优先。

## 注意事项
- 严格按照操作方案实施，不擅自扩大范围。
- 自测不通过最多重试 3 次。
`,

  'opfx-view': `---
name: opfx-view
description: 代码审查。通过 task 工具启动 Reviewer Agent（异种推理模型）进行计划/方案/代码交叉审查。
---

# /opfx:view — 代码审查

## 用途
对计划、方案、代码进行交叉审查，确保质量。使用异种推理模型避免同模型盲区。

## 调用方式
通过 \`task\` 工具启动 Reviewer Agent：
\`\`\`
task(subagent_type="reviewer", description="审查阶段产出", prompt="读取代码diff和方案...")
\`\`\`

## 审查流程
\`\`\`
读取方案 → 审查代码 → 提交 REV 条目 → Schemer 修正 → 再审 → 通过
\`\`\`

## 审查维度
- 正确性：实现是否符合方案目标
- 规范性：是否符合编码规范
- 安全性：是否存在安全隐患
- 完整性：是否覆盖所有方案步骤
- 一致性：是否与既有架构一致

## 模型选择
Reviewer 必须由**异种推理模型**（如 GLM / Qwen）驱动，与主要推理模型不同系列。

## 注意事项
- 只审查不修复，发现问题交由 Schemer → Executor 链路处理。
- 审查条目按 REV-{NO} 格式编号。
`,

  'opfx-test': `---
name: opfx-test
description: 测试验收。通过 task 工具启动 Feel Tester Agent（推理模型）进行正式测试和 Bug 管理。
---

# /opfx:test — 测试验收

## 用途
执行正式测试验收，提交和管理 Bug。与 Executor 的自测不同，这是流水线中的正式测试环节。

## 调用方式
通过 \`task\` 工具启动 Feel Tester Agent：
\`\`\`
task(subagent_type="feel-tester", description="测试验收", prompt="执行阶段测试...")
\`\`\`

## 测试流程
\`\`\`
读取方案和代码 → 运行测试套件 → 对比预期行为 → 提交 Bug / 验收通过
                                           │
                                      ┌─ 通过 → 通知 Feel 进入归档
                                      └─ 发现 Bug → Schemer 修复方案 → Executor 修复
\`\`\`

## Bug 管理
- 按 BUG-{NNN} 格式编号
- 记录优先级、复现步骤、期望/实际行为
- 修复后执行回归测试

## 注意事项
- Tester 只测试不修复，Bug 修复由 Executor 完成。
- 与 Executor 的自测职责分离，避免同人自测盲区。
`,

  'opfx-archive': `---
name: opfx-archive
description: 归档操作记录和知识提取。通过 task 工具启动 Archiver Agent 将阶段产出归档入库。
---

# /opfx:archive — 归档操作记录

## 用途
整理阶段中的全部操作记录，提取可复用知识，写入知识库。

## 调用方式
通过 \`task\` 工具启动 Archiver Agent：
\`\`\`
task(subagent_type="archiver", description="归档阶段产出", prompt="归档 stage-xx...")
\`\`\`

## 归档内容
| 来源 | 归档目标 |
|------|----------|
| 操作方案 | \`.openfeel/stages/{stage}/ops/\` |
| 审查条目 | \`.openfeel/code_review/{stage}.md\` |
| Bug 记录 | \`.openfeel/bugs/{module}.md\` |
| 架构决策 | \`.openfeel/kb/architecture.md\` |
| 代码模式 | \`.openfeel/kb/patterns.md\` |
| 排查经验 | \`.openfeel/kb/troubleshooting.md\` |

## 归档流程
\`\`\`
Tester 通过 → Feel 触发归档 → Archiver 整理产出 → 提取知识 → 写入知识库 → 标记完成
\`\`\`

## 注意事项
- 归档是阶段的最后一步，归档完成该阶段才算真正结束。
- 知识提取要精炼，避免冗余记录。
`,

  'opfx-kb': `---
name: opfx-kb
description: 知识库操作。查询、添加、搜索项目知识库中的架构决策、代码模式和排查经验。
---

# /opfx:kb — 知识库操作

## 用途
操作 OpenFeel 项目知识库，支持查询、添加和搜索知识条目。

## 调用方式
直接在命令行执行：
\`\`\`bash
openfeel knowledge list            # 列出知识库分类
openfeel knowledge add <category>  # 添加知识条目
openfeel knowledge search <query>  # 搜索知识库
\`\`\`

## 知识库分类
| 分类 | 内容 |
|------|------|
| architecture | 架构决策、设计理由 |
| patterns | 代码模式、项目约定 |
| troubleshooting | 常见问题、排查经验 |
| setup | 环境搭建、构建流程 |

## 使用场景
- Feel 需要了解既有架构决策时
- Executor 遇到问题需要排查经验时
- Archiver 提取新知识入库时

## 注意事项
- 知识库是项目长期记忆，保持精炼和准确。
- 每次写入知识库需在日志中记录。
`,
};

// ─── 新增的 Skill 名称列表 ─────────────────────────────────────────

const NEW_SKILL_NAMES = [
  'opfx-flow',
  'opfx-plan',
  'opfx-scheme',
  'opfx-code',
  'opfx-view',
  'opfx-test',
  'opfx-archive',
  'opfx-kb',
];

// ─── 辅助函数 ──────────────────────────────────────────────────────

/**
 * 写入文件，返回操作类型
 * 若文件已存在且内容一致 → skipped
 * 若文件已存在但内容不同 → updated
 * 若文件不存在 → created
 */
function writeIfChanged(
  filePath: string,
  content: string,
  relativePath: string,
  created: string[],
  updated: string[],
  skipped: string[],
): void {
  if (existsSync(filePath)) {
    const existing = readFileSync(filePath, 'utf-8');
    if (existing === content) {
      skipped.push(relativePath);
      return;
    }
    writeFileSync(filePath, content, 'utf-8');
    updated.push(relativePath);
  } else {
    writeFileSync(filePath, content, 'utf-8');
    created.push(relativePath);
  }
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
export function updateProject(projectPath: string, selectedTools: string[] = ["opencode"]): UpdateResult {
  const created: string[] = [];
  const updated: string[] = [];
  const skipped: string[] = [];

  const agentsDir = resolve(projectPath, '.opencode', 'agents');
  const skillsDir = resolve(projectPath, '.opencode', 'skills');

  // 确保目标目录存在
  mkdirSync(agentsDir, { recursive: true });
  mkdirSync(skillsDir, { recursive: true });

  // 过滤：仅处理选中的工具
  if (!selectedTools.includes('opencode')) {
    return { created: [], updated: [], skipped: [] };
  }

  // 1. 生成 Agent 定义文件
  for (const [name, content] of Object.entries(AGENT_DEFINITIONS)) {
    const filePath = join(agentsDir, `${name}.md`);
    const relPath = `.opencode/agents/${name}.md`;
    writeIfChanged(filePath, content, relPath, created, updated, skipped);
  }

  // 2. 生成 Skill 定义文件（每个 Skill 一个子目录，包含 SKILL.md）
  for (const [name, content] of Object.entries(SKILL_DEFINITIONS)) {
    const skillSubDir = join(skillsDir, name);
    mkdirSync(skillSubDir, { recursive: true });

    const filePath = join(skillSubDir, 'SKILL.md');
    const relPath = `.opencode/skills/${name}/SKILL.md`;
    writeIfChanged(filePath, content, relPath, created, updated, skipped);
  }

  // 3. 更新 opencode.jsonc
  const jsoncPath = resolve(projectPath, 'opencode.jsonc');
  const newContent = buildUpdatedJsonc(projectPath);
  const relJsoncPath = 'opencode.jsonc';
  writeIfChanged(jsoncPath, newContent, relJsoncPath, created, updated, skipped);

  return { created, updated, skipped };
}
