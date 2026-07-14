# 代码审查 — v4.3-stage-01（模板文件化重构 + 纪律强化）

## 审查摘要

- **审查对象**：v4.3-stage-01 操作方案（op-001 ~ op-008 + deps.yaml）
- **审查时间**：2026-07-10
- **审查维度**：正确性 / 完整性 / 一致性 / 规范性 / 安全性

---

## REV-001：op-007/008 前置依赖说明与实际风险不匹配

- **状态**：pending
- **优先级**：high
- **提出人**：Reviewer
- **提出时间**：2026-07-10 22:00
- **blocking**：true

### 问题描述

deps.yaml 中 op-007 和 op-008 对 op-005 的 hard 依赖理由是"防止 build.js 误将部分 agent 注入到 AGENT_DEFINITIONS"和"避免 build.js 读写竞态"。然而实际代码分析表明：

1. **"误注入"理由不成立**：当前 build.js `generateAgentDefinitions()` 的源目录是 `AGENTS_DIR`（即 `.opencode/agents/`），op-005 完成后才会将其改为 `templates-data/agents/zh-CN/`。也就是说，在 op-005 未完成前，build.js 仍然从 `.opencode/agents/` 读取。如果 op-007/op-008 在 op-005 之前或并行执行并向 `.opencode/agents/` 写入文件，build.js 反而会把这些文件纳入注入——这恰恰是需要在 op-005 完成后才能安全操作的原因。**但 deps.yaml 的理由描述为"防止误注入"，实际风险是"op-005 未改源前，新写入的 .opencode/agents/ 文件会被旧 build.js 意外纳入注入"**，理由不够准确。

2. **"读写竞态"理由不成立**：op-007/op-008 只写入 `.opencode/agents/` 目录，op-005 修改 build.js 和 template-loader.ts，两者操作完全不同的文件集，不存在读写竞态。真正的风险是上面第 1 点——build.js 源路径未切换前的意外读取。

3. **并行分组 batch-4 将 op-006/op-007/op-008 并行执行有风险**：op-006 修改 `update.ts` 和 `templates.ts`，op-007/op-008 写入 `.opencode/agents/`。虽然文件集无交集，但 op-006 完成后 `templates.ts` 变为 re-export，如果 op-007/op-008 在 op-006 运行 build.js 之前写入 `.opencode/agents/`，此时 build.js 的 `generateAgentDefinitions()` 源仍为旧路径，会意外读取这些文件。**正确做法：op-007/op-008 应在 op-005 且 op-006 均完成后执行（即依赖 op-006 而非 op-005）**，确保 build.js 已完整切换源路径且 `npm run build` 已验证通过。

### 建议修正

1. deps.yaml 中 op-007/op-008 的依赖改为：op-002 (hard) + op-006 (hard)
2. 并行分组调整：batch-4 只含 op-006；新增 batch-5 含 op-007/op-008
3. 修正依赖理由描述，准确反映"build.js 源路径未切换前的意外读取"风险

### 处理记录

| 时间 | 操作者 | 说明 | Commit |
|------|--------|------|--------|

### 验收记录

| 时间 | 验收人 | 结论 | 备注 |
|------|--------|------|------|

---

## REV-002：op-002 中 feel.md 日志纪律插入位置描述不精确

- **状态**：pending
- **优先级**：medium
- **blocking**：true

### 问题描述

op-002.md 第 25 行和第 35 行描述 feel.md 日志纪律的插入位置为：

> 「子 Agent 返回精简模式」节之后（`Feel 收到后检查状态...` 行后）

以及：

> 在「子 Agent 返回精简模式」节末尾（`Feel 收到后检查状态决定下一步...` 行）之后、「模型选择」节之前

但"子 Agent 返回精简模式"节的具体内容和行号未在方案中标注，且方案中"Feel 收到后检查状态..."的描述与实际 `.opencode/agents/feel.md` 中的文本不一定完全匹配（实际文件中需 grep 验证具体行）。方案要求 Executor 从 `update.ts` 的 `AGENT_DEFINITIONS` 常量中提取内容并定位插入点，但 `AGENT_DEFINITIONS` 中的模板字符串经过了 `escapeForTemplateString()` 转义处理，Executor 看到的是转义后的文本。

**关键问题**：op-002 要求"提取时直接融入纪律强化内容"，但插入位置的锚点文本（"Feel 收到后检查状态..."）可能因转义（如 `\``）导致文本匹配失败。方案未提供精确的行号或更鲁棒的定位方式。

### 建议修正

1. 在 op-002.md 中标注 `update.ts` 中 feel 模板的具体行号范围（grep 感知定位）
2. 使用 YAML frontmatter 中独有的标记（如 `## 模型选择` 节标题）作为后向锚点，在"模型选择"节之前插入，而非依赖模糊的中文文本描述
3. 自测清单第 10 项已验证位置正确性，但应补充：验证插入后 Markdown 层级结构无错位

### 处理记录

| 时间 | 操作者 | 说明 | Commit |
|------|--------|------|--------|

### 验收记录

| 时间 | 验收人 | 结论 | 备注 |
|------|--------|------|------|

---

## REV-003：op-005 兼容导出 `CORE_INSTRUCTIONS_TEMPLATE_B64` 格式与消费方不一致

- **状态**：pending
- **优先级**：high
- **blocking**：true

### 问题描述

op-005.md 第 88 行定义了兼容导出：

```typescript
export const CORE_INSTRUCTIONS_TEMPLATE_B64: string = CORE_INSTRUCTIONS_TEMPLATES['zh-CN'];
```

然而 `CORE_INSTRUCTIONS_TEMPLATES` 的 zh-CN 值（第 48-49 行）是 Base64 字符串，存储格式为 `'Base64EncodedString...'`。

但当前 `update.ts` 第 2116 行的消费方式是：

```typescript
const coreContent = Buffer.from(CORE_INSTRUCTIONS_TEMPLATE_B64, 'base64').toString('utf-8');
```

这意味着 `CORE_INSTRUCTIONS_TEMPLATE_B64` 必须是一个 **Base64 编码的字符串**，而不是 UTF-8 明文。op-005 的注入脚本（第 123-129 行）确实从 `templates-data/core-instructions/zh-CN.md` 读取 UTF-8 → Base64 编码后注入 `CORE_INSTRUCTIONS_TEMPLATES`，所以兼容导出返回的值是 Base64 字符串，逻辑正确。

**但问题在于**：op-004 将 `CORE_INSTRUCTIONS_TEMPLATE_B64` 解码为 UTF-8 写入 `zh-CN.md` 文件，而 op-005 又从这个 UTF-8 文件重新 Base64 编码注入。这个 decode→encode 往返在理论上是无损的，**但方案未提及 CRLF/LF 行尾归一化问题**。`safeReadFile` 在 Windows 上可能返回 CRLF，经 Base64 编码后与原 B64 值不同，导致 `validateCoreInstruction()` 校验失败。

当前 build.js 第 252-253 行已有归一化逻辑（`\r\n` → `\n`），但那是在 **解码后** 的文本上归一化。如果 op-005 的 `generateTemplateFromCoreMd()` 读取文件时未归一化，编码出的 B64 值就会与原值不同。

### 建议修正

1. op-005.md 在 `generateTemplateFromCoreMd()` 修改步骤中明确：读取 `zh-CN.md` 后须先执行行尾归一化（`.replace(/\r\n/g, '\n').replace(/\r/g, '\n')`），再进行 Base64 编码
2. op-004.md 自测清单第 5 项已提及 `\r\n` → `\n` 归一化，但 op-005 未同步提及，需补充

### 处理记录

| 时间 | 操作者 | 说明 | Commit |
|------|--------|------|--------|

### 验收记录

| 时间 | 验收人 | 结论 | 备注 |
|------|--------|------|------|

---

## REV-004：op-006 未处理 `update.ts` 中 `CORE_INSTRUCTIONS_TEMPLATE_B64` 导入路径变更

- **状态**：pending
- **优先级**：medium
- **blocking**：true

### 问题描述

当前 `update.ts` 第 10 行：

```typescript
import { CORE_INSTRUCTIONS_TEMPLATE_B64 } from './templates.js';
```

op-006 步骤 3 要求新增从 `template-loader.js` 的导入，并"同时移除从 `templates.ts` 导入 `CORE_INSTRUCTIONS_TEMPLATE_B64` 的旧 import 行"。但 `templates.ts` 经过 op-006 步骤 5 的改造后，已通过 re-export 从 `template-loader.js` 导出 `CORE_INSTRUCTIONS_TEMPLATE_B64`。

**问题**：op-006 步骤 3 和步骤 5 的执行顺序未明确。如果先执行步骤 3（改 import 来源），再执行步骤 5（改 templates.ts），那么中间状态 `update.ts` 从 `template-loader.js` 导入，但 `template-loader.ts` 尚未构建注入，且 `templates.ts` 尚未 re-export，测试会失败。

方案要求步骤 6 验证 `node build.js && npm test`，但未明确步骤 3 和 5 必须在同一原子操作中完成。此外，`templates.ts` re-export 后，`update.ts` 实际上可以从 `templates.js` 或 `template-loader.js` 两个路径获取 `CORE_INSTRUCTIONS_TEMPLATE_B64`，方案选择了直接从 `template-loader.js` 导入（更短路径），但这意味着 `templates.ts` 的 re-export 仅供外部消费者使用——**方案未说明 `templates.ts` 的 re-export 保留给谁使用**。

### 建议修正

1. op-006.md 明确步骤 3 和步骤 5 为原子操作，须在同一次文件修改中完成
2. 补充说明 `templates.ts` re-export 的目标消费者（如 `init.ts` 或其他外部模块）
3. 验证 `init.ts` 是否也导入了 `CORE_INSTRUCTIONS_TEMPLATE_B64` 或 `AGENTS_MD_TEMPLATE`，如果是，需在 op-006 中一并更新其导入路径

### 处理记录

| 时间 | 操作者 | 说明 | Commit |
|------|--------|------|--------|

### 验收记录

| 时间 | 验收人 | 结论 | 备注 |
|------|--------|------|------|

---

## REV-005：op-005 中 `AGENTS_MD_TEMPLATES` 存储格式与 `CORE_INSTRUCTIONS_TEMPLATES` 不一致

- **状态**：pending
- **优先级**：medium
- **blocking**：false

### 问题描述

op-005.md 中三个模板常量的存储格式不一致：

| 常量 | 存储格式 | 理由 |
|------|----------|------|
| `AGENT_TEMPLATES` | 模板字符串（反引号，需转义） | 含 Markdown 多行文本 |
| `CORE_INSTRUCTIONS_TEMPLATES` | Base64 字符串 | 继承原有 B64 编码方式 |
| `AGENTS_MD_TEMPLATES` | 模板字符串（反引号，需转义） | 含 Markdown 多行文本 |

`CORE_INSTRUCTIONS_TEMPLATES` 使用 Base64 而其他两个使用模板字符串，这在内部模式一致性上有偏差。虽然理由是"继承原有 B64 编码方式"，但模板文件化后，core-instructions 与 agents-md 本质上都是 Markdown 文本，存储格式应统一。

这不是功能缺陷，但在后续增加新语言模板时，三种不同的存储方式会增加维护复杂度。

### 建议修正

（非阻塞，供 Schemer 评估是否在后续阶段统一）

1. 考虑将 `CORE_INSTRUCTIONS_TEMPLATES` 也改为模板字符串存储，消除 B64 编解码开销和行尾归一化风险（见 REV-003）
2. 或者在 `loadTemplate()` API 层统一返回 UTF-8 明文，内部存储格式对调用方透明

### 处理记录

| 时间 | 操作者 | 说明 | Commit |
|------|--------|------|--------|

### 验收记录

| 时间 | 验收人 | 结论 | 备注 |
|------|--------|------|------|

---

## REV-006：op-005 `loadAgentTemplate` 语言回退逻辑不完整

- **状态**：pending
- **优先级**：medium
- **blocking**：true

### 问题描述

op-005.md 第 59-65 行：

```typescript
export function loadAgentTemplate(lang: string, agentId: string): string {
  const langData = AGENT_TEMPLATES[lang] || AGENT_TEMPLATES['zh-CN'];
  if (!langData) throw new Error(`Unsupported language: ${lang}`);
  const content = langData[agentId];
  if (content === undefined) throw new Error(`Agent template not found: ${agentId} (lang: ${lang})`);
  return content;
}
```

问题：

1. **回退后错误信息不准确**：当 `lang='en'` 且 zh-CN 存在时，回退到 zh-CN 数据，但如果 `agentId` 不存在，抛出的错误信息仍显示 `lang: en`，实际查找的是 zh-CN 数据。这会误导调试。

2. **回退静默掩盖问题**：当请求的语言不存在时静默回退到 zh-CN，调用方无法得知实际返回的是哪个语言的模板。对于模板文件化重构的首次实现（仅 zh-CN），这个回退可能掩盖未来添加新语言时的遗漏。

3. **`listAgentIds` 第 69-70 行同样有问题**：回退后 `langData` 一定不为 null（因为前面 `||` 已保证），所以 `if (!langData) return []` 永远不会执行，是死代码。

### 建议修正

1. 回退时记录 `console.warn` 或在返回值中附带实际语言信息
2. 修正错误信息为实际查找的语言：`Agent template not found: ${agentId} (lang: ${actualLang})`
3. 移除 `listAgentIds` 中的死代码分支
4. 或者：不在 API 层做语言回退，由调用方显式处理（更符合早返回原则）

### 处理记录

| 时间 | 操作者 | 说明 | Commit |
|------|--------|------|--------|

### 验收记录

| 时间 | 验收人 | 结论 | 备注 |
|------|--------|------|------|

---

## REV-007：op-002 提取的模板字符串转义处理方案不明确

- **状态**：pending
- **优先级**：medium
- **blocking**：true

### 问题描述

op-002.md 步骤 2 提到：

> 提取反引号内原始 Markdown 内容（注意模板字符串转义 — `\``→`` ` ``、`\\`→`\`、`\${`→`${`）

但方案未说明提取的工具或方法。Executor 需要从 `update.ts` 的 `AGENT_DEFINITIONS` 常量中手动提取 8 个模板字符串，这些字符串已经被 `escapeForTemplateString()` 转义（见 build.js 第 35-40 行）。反转义逻辑在 build.js 的 `unescapeTemplateString()` 中已有，但方案未引用或要求使用该函数。

**风险**：如果 Executor 手动提取时遗漏某个转义序列（特别是 `\${` → `${` 或 `\`` → `` ` ``），提取出的 `.md` 文件内容与原始模板不一致，后续 build.js 重新注入时会因 diff 不匹配导致校验失败。

### 建议修正

1. op-002.md 步骤 2 明确要求：使用 Node.js 脚本执行反转义，而非手动编辑
2. 提供反转义脚本示例：`console.log(unescapeTemplateString(extracted))`
3. 或者更安全的方式：直接从 `.opencode/agents/*.md` 读取（这些是 build.js 注入后部署的明文文件，已无转义），与 `AGENT_DEFINITIONS` 做交叉验证

### 处理记录

| 时间 | 操作者 | 说明 | Commit |
|------|--------|------|--------|

### 验收记录

| 时间 | 验收人 | 结论 | 备注 |
|------|--------|------|------|

---

## REV-008：op-007 声称 `.opencode/agents/` 目录"当前不存在"与实际不符

- **状态**：pending
- **优先级**：low
- **blocking**：false

### 问题描述

op-007.md 第 16 行：

> **首次创建**：`.opencode/agents/` 目录当前不存在，需先创建

但实际项目中 `.opencode/agents/` 目录已存在，且包含 8 个 `.md` 文件（archiver.md, executor.md, feel.md 等）。这是 build.js 注入流程的部署目标。

如果 op-007 步骤 2 试图创建已存在的目录（`mkdir -p`），不会报错但描述不准确。更关键的是，步骤 3 "将 `templates-data/agents/zh-CN/feel.md` 内容完整复制到 `.opencode/agents/feel.md`" 会**覆盖**现有的 `.opencode/agents/feel.md`，方案未说明这是预期行为（覆盖旧模板为新强化模板）还是意外行为。

### 建议修正

1. 修正 op-007.md 描述，承认目录已存在
2. 明确步骤 3 是覆盖操作，将旧版 feel.md 替换为含日志纪律强化的新版
3. op-008 同理修正

### 处理记录

| 时间 | 操作者 | 说明 | Commit |
|------|--------|------|--------|

### 验收记录

| 时间 | 验收人 | 结论 | 备注 |
|------|--------|------|------|

---

## REV-009：op-005 未考虑 `templates-data/` 目录在 git 中的管理策略

- **状态**：pending
- **优先级**：low
- **blocking**：false

### 问题描述

op-001 创建 `templates-data/` 目录结构并放置 `.gitkeep`，op-002/003/004 写入 `.md` 文件。但方案未说明：

1. `templates-data/` 下的 `.md` 文件是否应纳入 git 版本管理？这些文件是构建时的源文件（source of truth），理应纳入版本管理。
2. 但 `template-loader.ts` 中的 AUTO-GENERATED 段是构建产物，是否应通过 `.gitignore` 排除？方案未明确。
3. 如果 `template-loader.ts` 的 AUTO-GENERATED 段纳入版本管理，开发者 clone 后无需构建即可使用；但会导致每次构建后 git diff 显示大量变更。

### 建议修正

1. 在 op-005.md 或 plan.md 中明确 `templates-data/*.md` 纳入版本管理（作为源文件）
2. 明确 `template-loader.ts` 的 AUTO-GENERATED 段是否纳入版本管理
3. 参考现有 `update.ts` 中 AUTO-GENERATED 段的管理策略（当前是纳入版本管理的）

### 处理记录

| 时间 | 操作者 | 说明 | Commit |
|------|--------|------|--------|

### 验收记录

| 时间 | 验收人 | 结论 | 备注 |
|------|--------|------|------|

---

## REV-010：op-006 遗漏了 `init.ts` 可能对 templates.ts 导出的消费

- **状态**：pending
- **优先级**：high
- **blocking**：true

### 问题描述

op-006.md 步骤 5 将 `templates.ts` 改造为 re-export 模式，但方案中仅考虑了 `update.ts` 的消费方。实际项目中 `src/core/init.ts` 可能也导入了 `AGENTS_MD_TEMPLATE` 或 `DEV_CORE_TEMPLATE`/`CURRENT_TEMPLATE`。

如果 `init.ts` 导入了 `AGENTS_MD_TEMPLATE`，而 op-006 将 `templates.ts` 中的内联定义改为 re-export，那么 `init.ts` 的导入行为会间接受影响。虽然 re-export 在运行时行为等价，但：

1. op-006 未验证 `init.ts` 的导入是否受影响
2. 未在自测清单中包含 `init.ts` 相关测试的通过验证

### 建议修正

1. op-006 步骤 1 应增加：grep 搜索所有从 `templates.js` 导入的文件，列出全部消费方
2. 自测清单增加：`init.ts` 相关测试（如存在）全部通过
3. 产出文件列表中增加可能需要修改的其他文件

### 处理记录

| 时间 | 操作者 | 说明 | Commit |
|------|--------|------|--------|

### 验收记录

| 时间 | 验收人 | 结论 | 备注 |
|------|--------|------|------|

---

## 审查结论摘要

| REV | 标题 | 优先级 | blocking |
|-----|------|--------|----------|
| REV-001 | op-007/008 依赖链不完整，应依赖 op-006 而非 op-005 | high | **true** |
| REV-002 | feel.md 日志纪律插入位置锚点不精确 | medium | **true** |
| REV-003 | op-005 CRLF 归一化缺失导致 B64 往返不一致 | high | **true** |
| REV-004 | op-006 步骤 3/5 原子性和消费方不明确 | medium | **true** |
| REV-005 | 三种模板存储格式不一致（B64 vs 模板字符串） | medium | false |
| REV-006 | loadAgentTemplate 语言回退逻辑不完整，错误信息不准确 | medium | **true** |
| REV-007 | op-002 模板字符串反转义方案不明确 | medium | **true** |
| REV-008 | op-007 目录存在性描述与实际不符 | low | false |
| REV-009 | templates-data/ git 管理策略未明确 | low | false |
| REV-010 | op-006 遗漏 init.ts 等其他消费方验证 | high | **true** |

**统计**：
- 总计：10 条
- 阻塞：7 条 | 非阻塞：3 条
- high：3 | medium：4 | low：2（阻塞计数内）

**结论**：方案存在 7 个阻塞性问题，主要集中三个方面：
1. **依赖链和并行分组**（REV-001）：op-007/008 的 hard 依赖应从 op-005 改为 op-006，并行分组需调整
2. **技术细节缺失**（REV-002/003/006/007）：行尾归一化、反转义方法、API 回退逻辑等关键实现细节不够明确
3. **影响范围遗漏**（REV-004/010）：op-006 对 templates.ts 的改造可能影响 init.ts 等其他消费方，方案未覆盖

建议 Schemer 修正以上阻塞项后重新提交审查。

---

# 代码执行审查 — v4.3-stage-01（模板文件化重构 + 纪律强化）

## 审查摘要

- **审查对象**：v4.3-stage-01 代码执行产出（op-001 ~ op-008 实际代码）
- **审查时间**：2026-07-12
- **审查维度**：正确性 / 规范性 / 安全性 / 完整性 / 一致性
- **快速通道判定**：不满足（代码量 > 200 行、测试覆盖率未达 80%）

---

## REV-011：`loadAgentTemplate` 回退后错误信息中 lang 值不准确（方案 REV-006 遗留）

- **状态**：closed
- **优先级**：medium
- **提出人**：Reviewer
- **提出时间**：2026-07-12 10:00
- **blocking**：false

### 问题描述

`template-loader.ts` 第 1031-1041 行 `loadAgentTemplate` 函数：

```typescript
const langData = AGENT_TEMPLATES[lang] ?? AGENT_TEMPLATES['zh-CN'];
if (!langData) throw new Error(
  `Template language not found: lang=${lang} (zh-CN fallback also missing)`
);
const content = langData[agentId];
if (content === undefined) throw new Error(
  `Agent template not found: agentId=${agentId} (lang=${lang})`
);
```

当请求 `lang='fr'` 但 `AGENT_TEMPLATES['fr']` 不存在时，回退到 `zh-CN` 数据。后续 `agentId` 不存在时，错误信息显示 `lang=fr`，但实际查找的是 `zh-CN` 数据，误导调试。

同样，`listAgentIds` 第 1047-1050 行中 `if (!langData) return []` 是死代码——`??` 运算符已保证 `langData` 不会为 null/undefined（因为 `AGENT_TEMPLATES['zh-CN']` 存在）。

### 建议修正

1. 记录实际使用的语言：`const actualLang = AGENT_TEMPLATES[lang] ? lang : 'zh-CN';`，错误信息使用 `actualLang`
2. 移除 `listAgentIds` 中的死代码分支
3. 考虑在回退时添加 `console.warn` 提示（可选，不影响功能）

### 处理记录

| 时间 | 操作者 | 说明 | Commit |
|------|--------|------|--------|

### 验收记录

| 时间 | 验收人 | 结论 | 备注 |
|------|--------|------|------|
| 2026-07-14 | Feel | ✅ 通过 | 代码已修复：loadAgentTemplate 使用 actualLang 变量，listAgentIds 死代码已移除 |

---

## REV-012：`templates-data/` 下存在冗余的空子目录（`.gitkeep`）

- **状态**：closed
- **优先级**：low
- **提出人**：Reviewer
- **提出时间**：2026-07-12 10:00
- **blocking**：false

### 问题描述

`src/core/templates-data/` 目录结构中存在冗余的空子目录：

```
agents-md/
  zh-CN.md        ← 正确：AGENTS.md 模板文件
  zh-CN/
    .gitkeep      ← 冗余：op-001 创建的空目录，实际未使用
core-instructions/
  zh-CN.md        ← 正确：core instructions 模板文件
  zh-CN/
    .gitkeep      ← 冗余：同上
```

计划 op-001 要求创建 `agents-md/zh-CN/` 和 `core-instructions/zh-CN/` 目录，但 op-003 和 op-004 实际产出的是平级文件 `zh-CN.md`（而非子目录下的文件）。空子目录仅含 `.gitkeep`，在 stage-03 添加英文模板时会创建 `en.md` 平级文件而非子目录结构，因此这些 `.gitkeep` 子目录是冗余的。

不影响功能，但影响目录结构清晰度。

### 建议修正

1. 删除 `agents-md/zh-CN/` 和 `core-instructions/zh-CN/` 两个空子目录（含 `.gitkeep`）
2. 后续 stage-03 英文模板使用 `en.md` 平级文件

### 处理记录

| 时间 | 操作者 | 说明 | Commit |
|------|--------|------|--------|

### 验收记录

| 时间 | 验收人 | 结论 | 备注 |
|------|--------|------|------|
| 2026-07-14 | Feel | ✅ 通过 | 已确认 agents-md/zh-CN/ 和 core-instructions/zh-CN/ 空子目录已删除 |

---

## REV-013：`loadTemplate('zh-CN', 'core-instructions')` 返回 Base64 而非 UTF-8 明文，API 语义不一致

- **状态**：closed
- **优先级**：medium
- **提出人**：Reviewer
- **提出时间**：2026-07-12 10:00
- **blocking**：false

### 问题描述

`template-loader.ts` 第 1055-1064 行 `loadTemplate` 函数：

- `loadTemplate('zh-CN', 'agents-md')` 返回 UTF-8 明文（Markdown 字符串）
- `loadTemplate('zh-CN', 'core-instructions')` 返回 Base64 编码字符串

同一 API 的两个模板名返回不同格式，调用方需要知道 `core-instructions` 需要额外解码步骤，违反了接口一致性原则。

当前 `update.ts` 不使用 `loadTemplate` API（直接使用 `CORE_INSTRUCTIONS_TEMPLATE_B64` 兼容导出），所以暂时无实际影响。但 stage-03 新增消费方时，如果直接调用 `loadTemplate` 获取 core-instructions 内容而不解码，将得到乱码。

### 建议修正

（非阻塞，建议在 stage-03 开始前统一）

1. 选项 A：`loadTemplate` 对 `core-instructions` 返回解码后的 UTF-8 明文（推荐）
2. 选项 B：在 `TemplateName` 类型文档中明确标注 `core-instructions` 返回 Base64
3. 如果选 A，兼容导出 `CORE_INSTRUCTIONS_TEMPLATE_B64` 保持不变（供 update.ts 使用）

### 处理记录

| 时间 | 操作者 | 说明 | Commit |
|------|--------|------|--------|

### 验收记录

| 时间 | 验收人 | 结论 | 备注 |
|------|--------|------|------|
| 2026-07-14 | Feel | ✅ 通过 | 代码已修复：loadTemplate 对 core-instructions 返回 UTF-8 明文 |

---

## 代码执行审查结论摘要

| REV | 标题 | 优先级 | blocking | 状态 |
|-----|------|--------|----------|------|
| REV-011 | loadAgentTemplate 回退后错误信息 lang 值不准确 | medium | false | closed |
| REV-012 | templates-data/ 下冗余空子目录 | low | false | closed |
| REV-013 | loadTemplate API 对 core-instructions 返回 Base64 而非明文 | medium | false | closed |

**统计**：
- 总计：3 条（全部 closed）
- blocking：0 | 非阻塞：3
- closed：3 | pending：0

### 5 维度审查总结

| 维度 | 结论 | 说明 |
|------|------|------|
| **正确性** | ✅ 通过 | 模板提取与原内联内容完全一致；纪律强化（日志/自测报告）到位；构建管线 4/4 校验通过；updateProject() 功能正常；npm test 254/256（2 失败为既有的 .gitignore 问题，非本阶段引入） |
| **规范性** | ✅ 通过 | 代码注释中文；文件头有职责说明；早返回模式；const 优先；CRLF 归一化处理正确 |
| **安全性** | ✅ 通过 | B64 编码往返无损（build.js 步骤 1 明确 CRLF→LF 归一化）；模板字符串转义正确；无注入风险；无运行时 fs 读取依赖 |
| **完整性** | ✅ 通过 | 8 个 op 全部有对应产出；8 个 Agent 模板 + agents-md + core-instructions + template-loader + update.ts + templates.ts + build.js + feel.md + executor.md 同步完成 |
| **一致性** | ⚠️ 基本通过 | 外部一致性：templates.ts re-export 保持 init.ts 无需修改 ✅；内部模式一致性：CORE_INSTRUCTIONS_TEMPLATES 存 Base64 而 AGENTS_MD_TEMPLATES 存明文（REV-013），loadAgentTemplate 回退信息不准确（REV-011） |

### 方案审查遗留项在代码中的处理情况

| 方案 REV | 代码实现处理 | 状态 |
|----------|------------|------|
| REV-001（依赖链） | Executor 实际按串行顺序执行，依赖问题未触发 | ⚠️ 依赖描述仍不准确，但不影响已完成的代码 |
| REV-002（插入位置） | 日志纪律正确插入在「子 Agent 返回精简模式」之前 ✅ | ✅ 已正确处理 |
| REV-003（CRLF 归一化） | build.js `generateTemplateFromCoreMd()` 第 98 行已实现 CRLF→LF 归一化 | ✅ 已修复 |
| REV-004（原子性） | update.ts 改为从 template-loader 导入，templates.ts re-export，init.ts 保持原导入 | ✅ 已正确处理 |
| REV-005（存储格式不一致） | 保持 B64 + 模板字符串双格式 | ⚠️ 延期（REV-013 跟踪） |
| REV-006（回退逻辑） | 回退存在但错误信息不准确 | ⚠️ 未修（REV-011 跟踪） |
| REV-007（反转义） | 模板提取结果正确（8 个模板与 .opencode/agents/ 完全一致） | ✅ 已正确处理 |
| REV-008（目录描述） | 实际代码为覆盖写入，行为正确 | ✅ 已正确处理 |
| REV-009（git 管理） | templates-data/ 和 template-loader.ts 的 AUTO-GENERATED 段均纳入版本管理 | ✅ 已正确处理 |
| REV-010（init.ts 消费） | templates.ts re-export 保持 init.ts 导入路径不变 | ✅ 已正确处理 |

### 最终结论

**v4.3-stage-01 代码执行审查通过**。3 条 REV 均为非阻塞（medium×2, low×1），不阻塞流水线推进。

核心功能全部正确：
- 模板文件化提取完整、内容与原内联一致
- 纪律强化（日志/自测报告）到位
- 构建时内联管线正确运行，4/4 校验通过
- update.ts 重构后功能无回归
- 向后兼容性保持（templates.ts re-export、CORE_INSTRUCTIONS_TEMPLATE_B64 兼容导出）
- 无安全隐患
