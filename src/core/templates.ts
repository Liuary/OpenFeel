/**
 * init 命令用模板文件
 * 提供 dev_core.md、current.md、decisions.md 的默认模板内容。
 */

/** 中文版 dev_core.md 模板 */
const DEV_CORE_TEMPLATE_ZH = `# 动态规则
> 使用 [+] / [-] 标记管理启用/禁用状态。只能标记禁用不能删除。
`;

/** 英文版 dev_core.md 模板 */
const DEV_CORE_TEMPLATE_EN = `# Dynamic Rules
> Use [+] / [-] markers to manage enabled/disabled status. Only disable, do not delete.
`;

/** 中文版 current.md 模板（团队文件 / 用户级视图：≤5 条近期记录 + 自动归档） */
const CURRENT_TEMPLATE_ZH = `# 当前进度

> 总进度：初始化完成，等待计划创建。

## 近期提交记录（最多 5 条，最新在上）

<!-- 示例：- **{yyyy-mm-dd HH:MM}** @{username}：{整体信息：做了什么、处于什么状态} -->

> 更早记录见 \`.openfeel/dev/current_archive/\`（每次提交自动归档最旧一条；本文件仅保留近期 5 份）。
`;

/** 英文版 current.md 模板（team file / user-level view: latest 5 records + auto archive） */
const CURRENT_TEMPLATE_EN = `# Current Progress

> Overall progress: Initialization complete, waiting for plan creation.

## Recent Submissions (max 5, newest first)

<!-- Example: - **{yyyy-mm-dd HH:MM}** @{username}: {overall information: what was done, current state} -->

> Earlier records: see \`.openfeel/dev/current_archive/\` (each submission auto-archives the oldest; this file keeps only the latest 5).
`;

/** 中文版 decisions.md 模板（ADR 轻量格式：决策+理由+日期+状态） */
const DECISIONS_TEMPLATE_ZH = `# 决策记录（ADR）

> 长期技术/架构决策（技术选型、架构方向、跨会话有效的设计取舍）以 ADR 轻量格式记录于此。
> 会话临时决策（流程调整、单次取舍）记录在 .openfeel/users/{username}/dev_last.md 的「决策历史」节，不写入本文件。
> 写入时机：Feel 做出长期技术/架构决策时，同步追加一条 ADR 记录。

## ADR 模板

### ADR-{NNN}：{决策标题}
- **日期**：{yyyy-mm-dd}
- **状态**：proposed / accepted / superseded / deprecated
- **决策**：{一句话描述采纳的决策内容}
- **理由**：{为什么这样决策，含备选方案及取舍分析}
`;

/** 英文版 decisions.md 模板（ADR 轻量格式） */
const DECISIONS_TEMPLATE_EN = `# Decision Log (ADR)

> Long-term technical/architecture decisions (technology selection, architecture direction, cross-session design trade-offs) are recorded here in lightweight ADR format.
> Session-scoped temporary decisions (process adjustments, one-off trade-offs) are recorded in the "Decision History" section of .openfeel/users/{username}/dev_last.md, not in this file.
> Write timing: When Feel makes a long-term technical/architecture decision, append an ADR entry synchronously.

## ADR Template

### ADR-{NNN}: {Decision Title}
- **Date**: {yyyy-mm-dd}
- **Status**: proposed / accepted / superseded / deprecated
- **Decision**: {one-sentence description of the adopted decision}
- **Rationale**: {why this decision, including alternatives and trade-off analysis}
`;

/**
 * 根据语言返回 dev_core.md 模板
 * @param lang 语言，'zh-CN' 或 'en'
 */
export function getDevCoreTemplate(lang: 'zh-CN' | 'en'): string {
  return lang === 'en' ? DEV_CORE_TEMPLATE_EN : DEV_CORE_TEMPLATE_ZH;
}

/**
 * 根据语言返回 current.md 模板
 * @param lang 语言，'zh-CN' 或 'en'
 */
export function getCurrentTemplate(lang: 'zh-CN' | 'en'): string {
  return lang === 'en' ? CURRENT_TEMPLATE_EN : CURRENT_TEMPLATE_ZH;
}

/**
 * 根据语言返回 decisions.md 模板
 * @param lang 语言，'zh-CN' 或 'en'
 */
export function getDecisionsTemplate(lang: 'zh-CN' | 'en'): string {
  return lang === 'en' ? DECISIONS_TEMPLATE_EN : DECISIONS_TEMPLATE_ZH;
}

// 向后兼容导出（默认中文）
export const DEV_CORE_TEMPLATE = DEV_CORE_TEMPLATE_ZH;
export const CURRENT_TEMPLATE = CURRENT_TEMPLATE_ZH;
export const DECISIONS_TEMPLATE = DECISIONS_TEMPLATE_ZH;

// 以下常量已由 template-loader.ts 统一管理，此处保留 re-export 以兼容现有消费方
export { AGENTS_MD_TEMPLATE } from './template-loader.js';
