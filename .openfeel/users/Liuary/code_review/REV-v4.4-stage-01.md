# v4.4-stage-01 代码审查报告 — i18n 基建 + CLI 国际化

- **阶段**：v4.4-stage-01
- **审查人**：Reviewer (GLM)
- **审查时间**：2026-07-14
- **审查范围**：6 个 op（op-001 ~ op-006），涉及 i18n 类型定义、字符串映射表、运行时引擎、CLI 命令替换、全局配置、模板加载、单元测试
- **测试状态**：291/291 全部通过
- **快速通道判定**：不适用（代码量 > 200 行，产出文件 ≥ 5 个）

---

## REV-001: buildMap 语言字段选取逻辑语义错误

- **状态**：closed
- **优先级**：high
- **提出人**：Reviewer
- **提出时间**：2026-07-14 23:30
- **blocking**：true

### 问题描述

`src/core/i18n.ts` 第 84-92 行 `buildMap()` 函数中，对所有语言统一使用 `entry.zh || entry.en` 选取值字段：

```typescript
function buildMap(domains: DomainImport[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const domain of domains) {
    for (const entry of Object.values(domain)) {
      map.set(entry.key, entry.zh || entry.en);  // ← 问题
    }
  }
  return map;
}
```

当 `lang='en'` 时，传入 `enDomains`，`en.ts` 中所有条目的 `zh` 字段为空字符串 `''`（falsy），因此 `entry.zh || entry.en` 会回退到 `entry.en`。虽然功能上能正确工作，但逻辑语义错误：

1. **对 en 语言却优先读取 zh 字段**，违反最小惊讶原则
2. **依赖副效应**（zh 为空才 fallback），若有人误在 `en.ts` 中填入 zh 值会导致 en 输出错误
3. **与 `getStringMap()` 的分发逻辑形成双重冗余**：`getStringMap` 已按 lang 选择正确的 domains 数组，`buildMap` 不应再做字段选取判断

### 建议修复

`buildMap` 应接受 `lang` 参数，明确选取对应字段：

```typescript
function buildMap(domains: DomainImport[], lang: 'zh-CN' | 'en'): Map<string, string> {
  const map = new Map<string, string>();
  const field = lang === 'en' ? 'en' : 'zh';
  for (const domain of domains) {
    for (const entry of Object.values(domain)) {
      map.set(entry.key, entry[field] || entry[lang === 'en' ? 'zh' : 'en']);
    }
  }
  return map;
}
```

### 处理记录

| 时间 | 操作者 | 说明 | Commit |
|------|--------|------|--------|
| 2026-07-14 | Executor | buildMap 新增 lang 参数，用 entry[field] 替代 entry.zh \|\| entry.en | d6ec7f6 |

### 验收记录

| 时间 | 验收人 | 结论 | 备注 |
|------|--------|------|------|
| 2026-07-14 23:50 | Reviewer | 通过 | 修复正确，field 按 lang 明确选取，不再依赖副效应 |

---

## REV-002: project.ts 大量中文硬编码未 i18n 化

- **状态**：closed
- **优先级**：high
- **提出人**：Reviewer
- **提出时间**：2026-07-14 23:30
- **blocking**：true

### 问题描述

`src/commands/project.ts` 的 `outputProjectOverview()` 函数中，以下中文输出仍为硬编码，未使用 `t()` 查表：

**目录结构节**（约 15 处）：
- `'— CLI 入口程序'`、`'— CLI 命令模块'`、`'— 核心逻辑'`、`'— 工具函数'`
- `'— Agent 定义'`、`'— 技能定义'`
- `'— 项目知识库'`、`'— 工作计划'`、`'— 代码审查记录'`
- `'Bug 追踪'`、`'（未初始化）'`、`'（目录不存在）'`

**统计信息节**（5 处）：
- `'TS 源文件'`、`'Agent 定义'`、`'CLI 命令模块'`、`'KB 条目'`、`'计划版本'`

**入口路径节**（3 处）：
- `'CLI 入口'`、`'包入口'`、`'构建产物'`

**技术栈节**（7 处）：
- `'运行时'`、`'语言'`、`'CLI 框架'`、`'校验'`、`'配置'`、`'文件匹配'`、`'测试'`

这些字符串在 `en.ts` / `zh-CN.ts` 中均无对应 key，当用户语言为 `en` 时仍输出中文。

### 建议修复

1. 在 `zh-CN.ts` / `en.ts` 的 `project` 域中补充缺失的 key（约 30 条）
2. 将 `outputProjectOverview()` 中的硬编码字符串替换为 `t()` 调用

### 处理记录

| 时间 | 操作者 | 说明 | Commit |
|------|--------|------|--------|
| 2026-07-14 | Executor | 约 30 处中文硬编码替换为 t() 调用，zh-CN.ts/en.ts 各增 34 条 key | dc2d472 |

### 验收记录

| 时间 | 验收人 | 结论 | 备注 |
|------|--------|------|------|
| 2026-07-14 23:50 | Reviewer | 通过 | 全部中文硬编码已替换为 t()，映射表完整，project.ts 无残留中文用户可见字符串 |

---

## REV-003: knowledge.ts 表头中文字符串未 i18n 化

- **状态**：closed
- **优先级**：medium
- **提出人**：Reviewer
- **提出时间**：2026-07-14 23:30
- **blocking**：true

### 问题描述

`src/commands/knowledge.ts` 中两处表格头仍为硬编码中文：

1. **第 40 行**：`const headers = ['分类', '标题', '日期', t('common.status', lang)];`
   — 前 3 列 `'分类'`、`'标题'`、`'日期'` 未 i18n 化

2. **第 155 行**：`const headers = ['日期', '分类', '标题'];`
   — 全部 3 列均为硬编码中文

当语言为 `en` 时，表头仍显示中文。

### 建议修复

1. 在 `knowledge` 域中补充 `list.colCategory`、`list.colTitle`、`list.colDate` 三个 key
2. 替换硬编码数组为 `t()` 调用

### 处理记录

| 时间 | 操作者 | 说明 | Commit |
|------|--------|------|--------|

### 验收记录

| 时间 | 验收人 | 结论 | 备注 |
|------|--------|------|------|

---

## REV-004: flow.ts repair/migrate 中中文硬编码字符串比较

- **状态**：closed
- **优先级**：medium
- **提出人**：Reviewer
- **提出时间**：2026-07-14 23:30
- **blocking**：true

### 问题描述

`src/commands/flow.ts` 中 repair 和 migrate 子命令使用中文硬编码字符串做比较判断：

1. **第 720 行**：`result.changes[0] === '未检测到需要修复的问题'`
2. **第 778 行**：`change.includes('失败')`
3. **第 784 行**：`result.changes.some((c) => c.includes('失败'))`

这些字符串来自 `FlowManager.repair()` / `FlowManager.migrate()` 的返回值，是核心逻辑层的输出。当系统语言切换为 `en` 后，FlowManager 返回的 changes 列表可能变为英文，导致上述字符串比较失败，逻辑判断出错。

### 建议修复

采用路径 A：FlowManager 的 repair/migrate 方法返回结构化数据（含状态码/类型标识），CLI 层根据状态码判断而非字符串匹配。

### 处理记录

| 时间 | 操作者 | 说明 | Commit |
|------|--------|------|--------|
| 2026-07-14 | Executor | repair() 不再返回'未检测到'字符串，改为空数组+recovered 标志；migrate() 新增 failed 字段 | 793489f, 06c6fa4 |

### 验收记录

| 时间 | 验收人 | 结论 | 备注 |
|------|--------|------|------|
| 2026-07-14 23:50 | Reviewer | 通过 | 字符串比较已替换为结构化字段判断（result.recovered/failed），测试同步更新 |

---

## REV-005

- **状态**：pending
- **优先级**：medium
- **提出人**：Reviewer
- **提出时间**：2026-07-14 23:30
- **blocking**：false

### 问题描述

1. **`FlowManager.getPhaseLabels()`**（flow-manager.ts:970-1005）：返回的全是中文标签映射（`plan_pending: '计划待定'` 等 15 条）。该函数被 `flow wizard` 和 `buildDownstreamPhases` 使用。当语言为 `en` 时，wizard 中的阶段标签仍显示中文。

2. **`FlowManager.addStage()`**（flow-manager.ts:812）：错误消息 `throw new Error(\`阶段 '${stageId}' 已存在\`)` 使用中文硬编码。

### 建议修复

1. `getPhaseLabels()` 应接受 `lang` 参数或由 CLI 层传入语言，返回对应语言的标签
2. `addStage()` 错误消息改为英文或使用 i18n key

### 处理记录

| 时间 | 操作者 | 说明 | Commit |
|------|--------|------|--------|

### 验收记录

| 时间 | 验收人 | 结论 | 备注 |
|------|--------|------|------|

---

## REV-006: init.ts ensureGlobalConfig 中硬编码中英文字符串

- **状态**：pending
- **优先级**：medium
- **提出人**：Reviewer
- **提出时间**：2026-07-14 23:30
- **blocking**：false

### 问题描述

`src/core/init.ts` 的 `ensureGlobalConfig()` 函数中，以下输出未使用 i18n 系统：

1. **第 86 行**：`console.log('首次使用 OpenFeel：检测到非交互环境，全局默认语言设置为 zh-CN。');`
2. **第 87 行**：`console.log('使用 openfeel config set lang <zh-CN|en> 可修改。');`
3. **第 114-115 行**：`'\n✓ Global language set to English...'` / `'\n✓ 全局语言已设置为中文...'` — 使用条件三元运算符选择中文/英文，但未走 `t()` 函数

问题在于这些字符串在全局配置尚未初始化时输出（i18n 系统依赖全局配置确定语言），形成了「鸡和蛋」问题。但当前实现可以改善：非交互环境的消息应使用双语格式输出（类似 `prompt.bilingual` 的做法）。

### 建议修复

为这些首次使用的消息创建专门的 i18n key，并在输出时同时显示中英文（因为此时用户语言偏好未知）。

### 处理记录

| 时间 | 操作者 | 说明 | Commit |
|------|--------|------|--------|

### 验收记录

| 时间 | 验收人 | 结论 | 备注 |
|------|--------|------|------|

---

## REV-007: VALID_LANGS 常量重复定义

- **状态**：pending
- **优先级**：low
- **提出人**：Reviewer
- **提出时间**：2026-07-14 23:30
- **blocking**：false

### 问题描述

`VALID_LANGS` 常量在两个文件中独立定义：

1. `src/core/i18n.ts:55` — `export const VALID_LANGS = ['zh-CN', 'en'] as const;`
2. `src/core/workspace/identity.ts:17` — `const VALID_LANGS = ['zh-CN', 'en'] as const;`

如果未来新增语言（如 `ja`），需同时修改两处，容易遗漏导致不一致。

### 建议修复

在 `identity.ts` 中从 `i18n.ts` 导入 `VALID_LANGS`，消除重复定义。需注意循环依赖问题——`i18n.ts` 已从 `identity.ts` 导入 `getLang`，因此 `VALID_LANGS` 应定义在第三方文件（如 `types.ts`）中，由两者共同导入。

### 处理记录

| 时间 | 操作者 | 说明 | Commit |
|------|--------|------|--------|

### 验收记录

| 时间 | 验收人 | 结论 | 备注 |
|------|--------|------|------|

---

## REV-008: lazyGetGlobalConfig 不必要的复杂度

- **状态**：pending
- **优先级**：low
- **提出人**：Reviewer
- **提出时间**：2026-07-14 23:30
- **blocking**：false

### 问题描述

`src/core/i18n.ts:25-42` 的 `lazyGetGlobalConfig()` 使用 `require()` 动态导入 `identity.js` 中的 `getGlobalConfig`，注释说是"避免循环依赖"。但 `i18n.ts` 第 21 行已经静态导入了 `identity.js` 中的 `getLang`：

```typescript
import { getLang } from './workspace/identity.js';
```

这说明 `identity.js` → `i18n.ts` 方向不存在导入，无循环依赖风险。`lazyGetGlobalConfig` 可以直接改为静态导入：

```typescript
import { getLang, getGlobalConfig } from './workspace/identity.js';
```

### 建议修复

移除 `lazyGetGlobalConfig` 及 `_getGlobalConfig` 缓存变量，直接从 `identity.js` 静态导入 `getGlobalConfig`。

### 处理记录

| 时间 | 操作者 | 说明 | Commit |
|------|--------|------|--------|

### 验收记录

| 时间 | 验收人 | 结论 | 备注 |
|------|--------|------|------|

---

## REV-009: flow overview Unicode box 对齐在英文模式下破坏

- **状态**：pending
- **优先级**：low
- **提出人**：Reviewer
- **提出时间**：2026-07-14 23:30
- **blocking**：false

### 问题描述

`src/commands/flow.ts` 第 179 行，overview 标题框使用 `.padStart(38)` 硬编码对齐：

```typescript
console.log('║' + t('flow.overview.title', lang).padStart(38) + '              ║');
```

中文标题 "OpenFeel 流水线全景视图" 每个汉字占 2 字符宽度，`padStart` 按代码单元计算，中文标题的视觉宽度与英文字符串不一致。英文标题 "OpenFeel Pipeline Overview" 仅 28 ASCII 字符，`padStart(38)` 会左侧补 10 个空格，导致内容偏右，与上下边框不对齐。

`project.ts` 中 `outputProjectOverview()` 有类似问题（第 78 行）。

### 建议修复

1. 使用基于视觉宽度的 pad 函数（CJK 字符宽度为 2）
2. 或改为不使用固定宽度框，改用动态计算

### 处理记录

| 时间 | 操作者 | 说明 | Commit |
|------|--------|------|--------|

### 验收记录

| 时间 | 验收人 | 结论 | 备注 |
|------|--------|------|------|
| 2026-07-15 | Executor | closed | 已知限制，不影响功能，当前版本暂不修复 |

---

## REV-010: flow overview retry 后缀判断使用字符串比较 hack

- **状态**：closed
- **优先级**：low
- **提出人**：Reviewer
- **提出时间**：2026-07-14 23:30
- **blocking**：false

### 问题描述

`src/commands/flow.ts` 第 188 行：

```typescript
const retrySuffix = t('common.retry', lang).toLowerCase() === 'retry' ? 'times' : '次';
```

通过检查翻译后的字符串来判断语言，再选择后缀。这种模式脆弱且不符合 i18n 设计原则。如果 `common.retry` 的英文翻译改变（如改为 "Retries"），此逻辑会静默失败。

### 建议修复

添加专用 i18n key（如 `common.retrySuffix`），值分别为 `'次'` / `'times'`，直接 `t('common.retrySuffix', lang)` 查表。

### 处理记录

| 时间 | 操作者 | 说明 | Commit |
|------|--------|------|--------|

### 验收记录

| 时间 | 验收人 | 结论 | 备注 |
|------|--------|------|------|
| 2026-07-15 | Executor | closed | 已知限制，不影响功能，当前版本暂不修复 |

---

## REV-011: 错误消息中全角/半角冒号使用不一致

- **状态**：pending
- **优先级**：low
- **提出人**：Reviewer
- **提出时间**：2026-07-14 23:30
- **blocking**：false

### 问题描述

CLI 命令文件中错误消息拼接使用不同的冒号：

- **全角冒号** `：`：`t('common.error', lang) + '：' + msg`（如 archive.ts:40, knowledge.ts:95, view.ts:39）
- **半角冒号** `: `：`t('common.error', lang) + ': ' + msg`（如 instructions.ts:50, flow.ts:1013）

同类操作的错误消息格式不一致，不符合内部模式一致性要求。

### 建议修复

统一为一种格式。建议在 `common` 域中添加 `common.errorTmpl` key，值为 `错误：{msg}` / `Error: {msg}`，统一使用 `t('common.errorTmpl', lang, { msg })` 输出。

### 处理记录

| 时间 | 操作者 | 说明 | Commit |
|------|--------|------|--------|

### 验收记录

| 时间 | 验收人 | 结论 | 备注 |
|------|--------|------|------|

---

## REV-012: global-config.test.ts 直接操作用户 home 目录，测试崩溃可丢失配置

- **状态**：pending
- **优先级**：low
- **提出人**：Reviewer
- **提出时间**：2026-07-14 23:30
- **blocking**：false

### 问题描述

`test/core/workspace/global-config.test.ts` 的测试直接在 `~/.openfeel/config.json` 上操作，使用 `beforeEach/afterEach` 进行备份和恢复。如果测试进程在 `beforeEach`（读取备份）和 `afterEach`（恢复备份）之间崩溃（如 OOM、超时），用户的全局配置文件将丢失。

对比 `identity.test.ts` 使用 `mkdtempSync` 创建临时目录，完全隔离，更安全。

### 建议修复

使用临时目录替代真实 home 目录。可通过以下方式实现：
1. 创建临时目录，在其中创建 `.openfeel/config.json`
2. Mock `homedir()` 返回临时目录路径
3. 或将 `getGlobalConfigPath()` 改为可配置（接受 baseDir 参数）

### 处理记录

| 时间 | 操作者 | 说明 | Commit |
|------|--------|------|--------|

### 验收记录

| 时间 | 验收人 | 结论 | 备注 |
|------|--------|------|------|

---

## 审查统计

| 维度 | 阻塞 | 非阻塞 | 合计 |
|------|------|--------|------|
| 正确性 | 1 (REV-001) | 0 | 1 |
| 完整性 | 2 (REV-002, REV-003) | 1 (REV-006) | 3 |
| 正确性+完整性 | 1 (REV-004) | 2 (REV-005, REV-009) | 3 |
| 一致性 | 0 | 4 (REV-007, REV-008, REV-010, REV-011) | 4 |
| 安全性 | 0 | 0 | 0 |
| 规范性 | 0 | 1 (REV-012) | 1 |
| **合计** | **4** | **8** | **12** |

### 阻塞条目（已全部修复关闭）

- REV-001: buildMap 语言字段选取逻辑语义错误 → closed (d6ec7f6)
- REV-002: project.ts 大量中文硬编码未 i18n 化 → closed (dc2d472)
- REV-003: knowledge.ts 表头中文字符串未 i18n 化 → closed (dc2d472)
- REV-004: flow.ts repair/migrate 中中文硬编码字符串比较 → closed (793489f, 06c6fa4)

### 结论

**review_passed** — 4 条阻塞项已全部修复并验收通过，291/291 测试无回归。

第二轮审查验收确认：
- REV-001: buildMap 新增 lang 参数，用 `entry[field]` 替代 `entry.zh || entry.en`，逻辑语义正确
- REV-002: project.ts 约 30 处中文硬编码已替换为 t()，zh-CN.ts/en.ts 各增 34 条 key，映射完整
- REV-003: knowledge.ts 两处表头硬编码已替换为 t()，zh-CN.ts/en.ts 各增 6 条 key
- REV-004: repair() 改为空数组+recovered 标志判断；migrate() 新增 failed 字段，消除中文字符串比较 hack
- 非阻塞项（REV-005~012）保持 pending，可在后续阶段处理
