# 方案审查 — v4.3-stage-03（英文内容产出 + 双语交互）

## 审查摘要

- **审查对象**：v4.3-stage-03 操作方案（op-001 ~ op-008 + deps.yaml）
- **审查时间**：2026-07-12
- **审查维度**：正确性 / 完整性 / 并行安全 / 向后兼容 / 术语一致性
- **交叉验证源码**：`template-loader.ts`、`identity.ts`、`build.js`、`init.ts`、`update.ts`、`commands/init.ts`、`commands/update.ts`、`templates.ts`

---

## REV-001：Batch 2 并行安全 — op-002 与 op-003 共享 build.js，deps.yaml 声明与事实不符

- **状态**：pending
- **优先级**：high
- **提出人**：Reviewer
- **提出时间**：2026-07-12 21:00
- **blocking**：true

### 问题描述

deps.yaml 中 op-002 和 op-003 的 `file` 列表均包含 `build.js`：

- op-002：`src/core/templates-data/agents-md/en.md` + `build.js`
- op-003：`src/core/templates-data/core-instructions/en.md` + `build.js`

但 deps.yaml Batch 2 的 reason 声称：

> 三者产出文件无交集（agents-md/en.md + core-instructions/en.md + init.ts），可并行。

**这与事实不符**——`build.js` 是两个 op 的交集文件。若 Batch 2 内 op-002/op-003 并行执行（双 worktree），后提交者会覆盖先提交者的 `build.js` 修改，导致 `generateAgentsMdTemplate()` 或 `generateTemplateFromCoreMd()` 之一的多语言化丢失。

### 影响范围

构建管线可靠性。如果并行执行导致某函数未多语言化，`npm run build` 后 `template-loader.ts` 中将缺少 `en` 键，后续所有英文模板加载失败。

### 建议修正

方案 A（推荐）：将 Batch 2 拆为两个子批次：
- Batch 2a：op-002 + op-004（op-002 改 build.js + agents-md/en.md，op-004 改 init.ts，无交集）
- Batch 2b：op-003（改 build.js + core-instructions/en.md，等 2a 的 build.js 提交后再执行）

方案 B：op-002 和 op-003 合并为单个 op（同文件修改不宜并行），将 build.js 的三个多语言化函数（`generateAgentDefinitions` + `generateAgentsMdTemplate` + `generateTemplateFromCoreMd`）放在同一个 op 中一次性完成。

### 处理记录

| 时间 | 操作者 | 说明 | Commit |
|------|--------|------|--------|

### 验收记录

| 时间 | 验收人 | 结论 | 备注 |
|------|--------|------|------|

---

## REV-002：op-004 遗漏 init.ts 中 AGENTS.md 模板加载与语言选择联动

- **状态**：pending
- **优先级**：high
- **提出人**：Reviewer
- **提出时间**：2026-07-12 21:00
- **blocking**：true

### 问题描述

op-004 在 `initProject` 流程中增加了语言选择步骤（选 en/zh-CN），并将选择结果写入 `.info.json` 的 `lang` 字段。但方案**未将选择结果连接到 AGENTS.md 模板加载**。

当前 `init.ts` 第 23 行硬编码导入 `AGENTS_MD_TEMPLATE`：

```ts
import { DEV_CORE_TEMPLATE, CURRENT_TEMPLATE, AGENTS_MD_TEMPLATE } from './templates.js';
```

第 122 行直接使用：

```ts
const agentsMdResult = writeTemplateIfMissing(agentsMdPath, AGENTS_MD_TEMPLATE);
```

`AGENTS_MD_TEMPLATE` 来自 `templates.ts` 的 re-export，始终是 `AGENTS_MD_TEMPLATES['zh-CN']`（中文模板）。

**后果**：用户在 `openfeel init` 中选择 English，`.info.json` 写入 `"lang": "en"`，但项目根目录生成的 `AGENTS.md` 仍是中文版。只有后续执行 `openfeel update` 才能部署正确语言的文件，用户体验断裂。

### 建议修正

op-004 应增加以下步骤：

1. 将 `init.ts` 的 `AGENTS_MD_TEMPLATE` 导入替换为从 `./template-loader.js` 导入 `loadTemplate`
2. 在语言选择步骤之后，使用 `loadTemplate(selectedLang, 'agents-md')` 替代硬编码 `AGENTS_MD_TEMPLATE`
3. `initProject` 函数签名可能需调整（或语言选择在函数内部完成，不影响签名）
4. 同步更新 `initProject` 产出文件列表中 `AGENTS.md` 的模板来源说明
5. 自测清单增加：选 en 时 AGENTS.md 内容为英文模板

### 处理记录

| 时间 | 操作者 | 说明 | Commit |
|------|--------|------|--------|

### 验收记录

| 时间 | 验收人 | 结论 | 备注 |
|------|--------|------|------|

---

## REV-003：op-001 validateAgentDefinitions 多语言适配描述过于简略

- **状态**：pending
- **优先级**：medium
- **提出人**：Reviewer
- **提出时间**：2026-07-12 21:00
- **blocking**：false

### 问题描述

op-001 Part D 步骤"修改 `validateAgentDefinitions()` 对应适配多语言结构"仅一句话，未描述具体实现方式。

当前 `validateAgentDefinitions()` 使用 `extractTemplatePairs()` 从 `AGENT_TEMPLATES` 对象中提取键值对，该方法基于正则匹配**最内层**的 `key: \`...\`` 模式。多语言化后数据结构变为：

```ts
{ 'zh-CN': { archiver: `...`, ... }, 'en': { archiver: `...`, ... } }
```

`extractTemplatePairs` 只会匹配到第一层嵌套的内容（zh-CN 内部），`en` 键的内容会被忽略。`validateAgentDefinitions` 需要遍历每个语言键，逐一校验与源目录的一致性。

### 建议修正

op-001 补充 `validateAgentDefinitions()` 的多语言适配说明：

1. 从 `AGENT_TEMPLATES` 中提取所有语言键（`Object.keys`）
2. 对每个语言键，提取其内层的 Agent 模板条目
3. 读取对应语言目录（如 `agents/en/`）下的源文件
4. 逐语言执行 `compareTemplatePairs` 校验
5. 同理，`validateAgentsMdTemplate` 和 `validateCoreInstruction` 也需适配（op-002/op-003 负责）

### 处理记录

| 时间 | 操作者 | 说明 | Commit |
|------|--------|------|--------|

### 验收记录

| 时间 | 验收人 | 结论 | 备注 |
|------|--------|------|------|

---

## REV-004：op-001 REV-013 修复中 loadTemplate 空值检查应在 B64 解码前

- **状态**：closed
- **优先级**：low
- **提出人**：Reviewer
- **提出时间**：2026-07-12 21:00
- **blocking**：false

### 问题描述

op-001 Part A REV-013 修复提出的代码为：

```ts
const raw = map[lang] ?? map['zh-CN'];
if (templateName === 'core-instructions') {
  return Buffer.from(raw, 'base64').toString('utf-8');
}
return raw;
```

若 `map[lang]` 和 `map['zh-CN']` 均为 `undefined`（极端情况），`raw` 为 `undefined`，`Buffer.from(undefined, 'base64')` 抛出 `TypeError`，错误信息为"The first argument must be of type string..."，不如原代码的 `Template not found: name=... (lang=...)` 信息有用。

### 建议修正

在 B64 解码前保留空值检查：

```ts
const raw = map[lang] ?? map['zh-CN'];
if (raw === undefined) throw new Error(
  `Template not found: name=${templateName} (lang=${lang})`
);
if (templateName === 'core-instructions') {
  return Buffer.from(raw, 'base64').toString('utf-8');
}
return raw;
```

### 处理记录

| 时间 | 操作者 | 说明 | Commit |
|------|--------|------|--------|

### 验收记录

| 时间 | 验收人 | 结论 | 备注 |
|------|--------|------|------|
| 2026-07-14 | Feel | ✅ 通过 | 代码已修复：template-loader.ts 第 2066-2069 行在 B64 解码前有空值检查 |

---

## REV-005：op-006 应显式标注 update.ts 中 B64 直解→loadTemplate 替换点

- **状态**：pending
- **优先级**：low
- **提出人**：Reviewer
- **提出时间**：2026-07-12 21:00
- **blocking**：false

### 问题描述

op-006 步骤 3 说"在 core instructions 部署环节，通过 `loadTemplate(lang, 'core-instructions')` 加载对应语言模板"，但未显式指出 `update.ts` 第 1242 行的现有代码：

```ts
const coreContent = Buffer.from(CORE_INSTRUCTIONS_TEMPLATE_B64, 'base64').toString('utf-8');
```

需替换为：

```ts
const coreContent = loadTemplate(lang, 'core-instructions');
```

同理，第 1246 行：

```ts
const lang = 'zh-CN'; // 后续阶段从 .info.json 读取
```

需替换为从参数获取 `lang` 值。

虽然步骤 3 的语义可推导出这些变更，但 Executor 容易遗漏 B64→loadTemplate 的转换点（尤其是 `CORE_INSTRUCTIONS_TEMPLATE_B64` 的导入可被移除这一事实）。

### 建议修正

在 op-006 步骤 3 中补充具体行号级替换说明：

1. 第 1242 行：`Buffer.from(CORE_INSTRUCTIONS_TEMPLATE_B64, 'base64').toString('utf-8')` → `loadTemplate(lang, 'core-instructions')`
2. 第 1246 行：`const lang = 'zh-CN'` → 使用函数参数
3. 导入变更：移除 `CORE_INSTRUCTIONS_TEMPLATE_B64` 导入，新增 `loadTemplate` 和 `getLang` 导入
4. 自测清单增加：`updateProject` 不再依赖 `CORE_INSTRUCTIONS_TEMPLATE_B64` 导入

### 处理记录

| 时间 | 操作者 | 说明 | Commit |
|------|--------|------|--------|

### 验收记录

| 时间 | 验收人 | 结论 | 备注 |
|------|--------|------|------|

---

## 审查总评

| 维度 | 结论 | 说明 |
|------|------|------|
| 正确性 | ✅ 基本通过 | build.js 多语言扩展路径可行；REV-011/012/013 修复逻辑正确 |
| 完整性 | ⚠️ 存在缺口 | op-004 未联动 init.ts 的 AGENTS.md 模板加载（REV-002） |
| 并行安全 | ❌ 不通过 | Batch 2 中 op-002/op-003 共享 build.js，与"无交集"声明矛盾（REV-001） |
| 向后兼容 | ✅ 通过 | ensureInfoJson 回退逻辑 + getLang 只读设计确保已有项目安全 |
| 术语一致性 | ✅ 通过 | 8 Agent 英译与 plan.md §4.3 术语表完全一致 |

### 统计

- 总计：5 条
- 阻塞：2 条（REV-001、REV-002）| 非阻塞：3 条（REV-003/004/005）
- pending：5 | fixing：0 | resolved：0 | closed：0
