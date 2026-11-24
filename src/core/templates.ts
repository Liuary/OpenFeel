/**
 * init 命令用模板文件
 * 提供 dev_core.md、current.md、decisions.md 的默认模板内容。
 */

/** 中文版 dev_core.md 模板 */
const DEV_CORE_TEMPLATE_ZH = `# 动态规则
> 使用 [+] / [-] 标记管理启用/禁用状态。只能标记禁用不能删除。

## [+] 发布只走 CI 自动发布

远端 **push 到 master、且 \`package.json\` 版本与 npm 已发版本不同** 时，CI 的 publish job 自动 \`npm publish\`（事实源：\`.github/workflows/ci.yml\`）。

- **不要手动 \`npm publish\`**：本地 \`npm run release\` 默认只做版本一致性校验 + build（预检用 \`--dry-run\`）。
- **tag / release 不触发发布** —— 以 CI 的 \`refs/heads/master\` 条件为准，不需要打 tag。
- 推送 commit 用 \`npm run release -- --push\`（默认不 push；\`--dry-run --push\` 只标 planned）。
- **紧急兜底**：只有 CI 失败时才用 \`npm run release -- --publish\`，并在提交信息 / 日志里写明原因。
`;

/** 英文版 dev_core.md 模板 */
const DEV_CORE_TEMPLATE_EN = `# Dynamic Rules
> Use [+] / [-] markers to manage enabled/disabled status. Only disable, do not delete.

## [+] Publishing goes through CI only

When a push to master carries a \`package.json\` version that differs from the published npm version, the CI publish job runs \`npm publish\` (source of truth: \`.github/workflows/ci.yml\`).

- **Do not run \`npm publish\` manually**: local \`npm run release\` only validates versions + builds (use \`--dry-run\` to preview).
- **Tags / releases do not trigger publishing** — CI keys off \`refs/heads/master\`; no tag is needed.
- Push commits with \`npm run release -- --push\` (no push by default; \`--dry-run --push\` only marks it planned).
- **Emergency fallback only**: \`npm run release -- --publish\`, and record the reason in the commit message / log.
`;

/** 中文版 current.md 模板（团队文件；v1.5.24 起 AUTO 块由 CLI 维护） */
const CURRENT_TEMPLATE_ZH = `# 当前进度

<!-- openfeel:auto:begin -->
<!-- openfeel:auto:end -->

## 近期提交记录（最多 5 条，最新在上）

<!-- 示例：- **{yyyy-mm-dd HH:MM}** @{username}：{整体信息：做了什么、处于什么状态} -->

> 上方「自动状态」块由 \`openfeel dev sync\` 维护（勿手改）；本节由人按需补记。
> 跨会话恢复请看 \`.openfeel/users/{username}/dev_last.md\` 的 \`## 交接摘要\`。更早记录见 \`.openfeel/dev/current_archive/\`。
`;

/** 英文版 current.md 模板（team file; since v1.5.24 the AUTO block is maintained by the CLI） */
const CURRENT_TEMPLATE_EN = `# Current Progress

<!-- openfeel:auto:begin -->
<!-- openfeel:auto:end -->

## Recent Submissions (max 5, newest first)

<!-- Example: - **{yyyy-mm-dd HH:MM}** @{username}: {overall information: what was done, current state} -->

> The auto-status block above is maintained by \`openfeel dev sync\` (do not hand-edit); fill this section manually.
> For cross-session recovery read \`## 交接摘要\` in \`.openfeel/users/{username}/dev_last.md\`.
> Earlier records: \`.openfeel/dev/current_archive/\`.
`;

/** 中文版 decisions.md 模板（ADR 轻量格式：决策+理由+日期+状态） */
const DECISIONS_TEMPLATE_ZH = `# 决策记录（ADR）

> 长期技术/架构决策（技术选型、架构方向、跨会话有效的设计取舍）以 ADR 轻量格式记录于此。
> 会话临时决策（流程调整、单次取舍）记录在 .openfeel/users/{username}/dev_last/decisions.md（主题文件「决策记录」），不写入本文件。
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
> Session-scoped temporary decisions (process adjustments, one-off trade-offs) are recorded in .openfeel/users/{username}/dev_last/decisions.md (topic file "Decision Log"), not in this file.
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
