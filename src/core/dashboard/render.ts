/**
 * 看板 HTML 渲染层（D-125-04：H1~H10 硬约束）
 *
 * 职责：把 `DashboardData` 服务端渲染成**单文件、零外链、零网络、零可执行脚本**的看板 HTML。
 *
 * 硬约束：
 * - H1/H2 单文件零外链：产物无 `src=` / `href=` / `<link>` / 远程 `<img>`，字体只走系统字体栈；
 * - H3 strict CSP 原文：`default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:`；
 * - H4/H5 零可执行脚本：产物唯一的 `<script>` 是 `id="openfeel-data" type="application/json"` 惰性数据块，
 *   内容 = `JSON.stringify` 后按 `escapeJsonForScript` 转义（`<` `>` `&` `U+2028` `U+2029` → `\uXXXX`）；
 * - H6 动态文本全量 `escapeHtml`（`&` `<` `>` `"` `'`）；HTML 属性值只取 `ATTR` 常量，零动态拼接；
 * - H7 `<meta charset="utf-8">` 是 `<head>` 的第一个子元素（`file://` 无 HTTP 头，缺失必 CJK 乱码）；
 * - H8 空数据：各区块出 `dashboard.html.empty` 空态节点，产物无 `undefined` / `NaN`，空 `<table>` 被空态替代；
 * - H9/H10 确定性：唯一时间字段取自 `data.generatedAt`，零 `Date` 调用 / 零随机 id / 零自增序号；
 * - 除注释外零 CJK 字面量：全部文案经 `t('dashboard.html.*', lang)`。
 *
 * 边界：只 import `src/core/**`（禁 `commands/` 与 `cli/`）；纯函数，零写盘、零控制台输出、零异常抛出。
 */
import { t } from '../i18n.js';
import { REQ_PRIORITIES, REQ_STATUSES, type RequirementStatus } from '../req/types.js';
import type { DashboardData, DashboardRequirementItem } from './aggregate.js';

/** 渲染语言（与 `t()` 的 lang 同域；未知值归一为 zh-CN） */
type Lang = 'zh-CN' | 'en';

/**
 * `<html lang>` 属性逐语言写成**字面量常量**（H6：属性值不拼接动态值）。
 */
const HTML_LANG_ATTR: Record<Lang, string> = {
  'zh-CN': '<html lang="zh-CN">',
  en: '<html lang="en">',
};

/**
 * 全部 `data-i18n` 属性字面量（H6）：属性值恒为源码常量，任何数据字段都无法进入属性值。
 * 节点文本仍由 `t('dashboard.html.…', lang)` 渲染（不只有属性、不只挂不渲染）。
 */
const ATTR = {
  title: 'data-i18n="dashboard.html.title"',
  kpiTotal: 'data-i18n="dashboard.html.kpi.total"',
  kpiDone: 'data-i18n="dashboard.html.kpi.done"',
  kpiActiveStages: 'data-i18n="dashboard.html.kpi.activeStages"',
  kpiBlockingReviews: 'data-i18n="dashboard.html.kpi.blockingReviews"',
  kpiArchived: 'data-i18n="dashboard.html.kpi.archived"',
  sectionRequirements: 'data-i18n="dashboard.html.section.requirements"',
  sectionStages: 'data-i18n="dashboard.html.section.stages"',
  sectionReleases: 'data-i18n="dashboard.html.section.releases"',
  sectionArchived: 'data-i18n="dashboard.html.section.archived"',
  sectionBlockingReviews: 'data-i18n="dashboard.html.section.blockingReviews"',
  sectionHealth: 'data-i18n="dashboard.html.section.health"',
  sectionMetrics: 'data-i18n="dashboard.html.section.metrics"',
  thRequirement: 'data-i18n="dashboard.html.th.requirement"',
  thStatus: 'data-i18n="dashboard.html.th.status"',
  thPriority: 'data-i18n="dashboard.html.th.priority"',
  thVersion: 'data-i18n="dashboard.html.th.version"',
  thOwner: 'data-i18n="dashboard.html.th.owner"',
  thPhase: 'data-i18n="dashboard.html.th.phase"',
  thOps: 'data-i18n="dashboard.html.th.ops"',
  thCount: 'data-i18n="dashboard.html.th.count"',
  thStage: 'data-i18n="dashboard.html.th.stage"',
  empty: 'data-i18n="dashboard.html.empty"',
  none: 'data-i18n="dashboard.html.none"',
  footerGeneratedAt: 'data-i18n="dashboard.html.footer.generatedAt"',
  footerGenerator: 'data-i18n="dashboard.html.footer.generator"',
  footerProjectRoot: 'data-i18n="dashboard.html.footer.projectRoot"',
  footerNote: 'data-i18n="dashboard.html.footer.note"',
} as const;

/** H3 strict CSP（原文逐字，T13 断言含 `script-src 'none'`） */
const CSP_META =
  `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:">`;

/** 内联样式：系统字体栈，零 Web 字体 / 零 CDN（H2）；零动态属性 */
const STYLE = `
:root{color-scheme:light dark}
*{box-sizing:border-box}
body{margin:0;padding:24px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,"Noto Sans",sans-serif;line-height:1.5;color:#1f2328;background:#f6f8fa}
.page-head h1{margin:0 0 4px;font-size:1.4rem}
.subtitle{margin:0;color:#57606a}
.subtitle code{margin-right:12px}
.card{background:#fff;border:1px solid #d0d7de;border-radius:8px;padding:16px;margin-top:16px}
.card h2{margin:0 0 12px;font-size:1.05rem}
.sub-title{margin:16px 0 8px;font-size:.95rem;color:#57606a}
.kpi-list{display:flex;flex-wrap:wrap;gap:16px;margin:0;padding:0;list-style:none}
.kpi{display:flex;flex-direction:column;min-width:150px}
.kpi-label{font-size:.8rem;color:#57606a;white-space:nowrap}
.kpi-value{font-size:1.5rem;font-weight:600}
.board{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px;align-items:start}
.lane{display:flex;flex-direction:column;min-width:0;border:1px solid #d8dee4;border-radius:6px;padding:10px;background:#fff}
.lane-head{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px;margin:0 0 8px;font-size:.9rem}
.lane-count{color:#57606a}
.lane-items{display:flex;flex-direction:column;gap:8px;margin:0;padding:0;list-style:none}
.lane-item{min-width:0;padding:6px 8px;border:1px solid #eaeef2;border-radius:6px;background:#fbfcfd}
.req-id{display:inline-block;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.76rem;color:#57606a}
.req-title{display:block;margin:2px 0 6px;font-size:.88rem;overflow-wrap:anywhere}
.chips{display:flex;flex-wrap:wrap;gap:6px}
.chip{display:inline-block;max-width:100%;padding:1px 8px;border:1px solid #eaeef2;border-radius:999px;background:#f6f8fa;font-size:.76rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;vertical-align:bottom}
.chip-label{margin-right:4px;color:#57606a}
table{width:100%;border-collapse:collapse;font-size:.85rem}
th,td{padding:4px 6px;text-align:left;vertical-align:top;border-bottom:1px solid #eaeef2}
.empty{margin:4px 0;color:#57606a;font-style:italic}
.ops-bar{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:1px;white-space:nowrap}
.ops-count{color:#57606a}
.mode code,.ref code{color:#57606a}
.prio{margin:0 6px;color:#57606a}
.tag{margin-right:6px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#57606a}
.reviews,.health,.metric-list,.foot-list{margin:0;padding:0;list-style:none}
.reviews li,.health li,.metric-list li{padding:4px 0;border-bottom:1px solid #eaeef2}
.page-foot{margin-top:24px;color:#57606a;font-size:.8rem}
.page-foot code{word-break:break-all}
`;

/**
 * HTML 文本转义（H6：`&` `<` `>` `"` `'` 五字符全转义；`&` 必须最先替换）。
 * 入参放宽为 `unknown`：损坏数据里的非字符串（number / null / object）不得让渲染抛异常
 * （H8「零异常」）；`null` / `undefined` → 空串，其余 `String()` 归一。
 */
function escapeHtml(value: unknown): string {
  // 用 replaceAll（字符串参数）而非 `/'/g` 正则：避免在源码里出现含引号的正则字面量，
  // 也让本文件的注释剥离/T24 CJK 扫描按普通字符串状态处理即可。
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * JSON 数据的脚本安全转义（H5）：`<` `>` `&` `U+2028` `U+2029` → `\uXXXX`（JSON 合法转义）。
 * 这样「标题里塞 `</script><script>alert(1)</script>`」不会提前闭合数据块。
 */
function escapeJsonForScript(json: string): string {
  return json
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/** 数值渲染：非有限值 → `0`（H8：产物不出现 `NaN` / `undefined`） */
function num(value: number): string {
  return Number.isFinite(value) ? String(value) : '0';
}

/** 可空数值渲染：缺失 / 非有限 → `-`（H8） */
function numOrDash(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '-';
}

/** 可选文本渲染：缺失 / 空白 → `-`，其余走 `escapeHtml`（H6） */
function textOrDash(value: string | null | undefined): string {
  if (typeof value !== 'string') {
    return '-';
  }
  const trimmed = value.trim();
  return trimmed === '' ? '-' : escapeHtml(trimmed);
}

/** 空态节点（H8）：渲染 `dashboard.html.empty` 译文 + `data-i18n` 属性 */
function emptyNode(lang: Lang): string {
  return `<p class="empty" ${ATTR.empty}>${escapeHtml(t('dashboard.html.empty', lang))}</p>`;
}

/**
 * 行内「无未完成项」标记（发布门用）：语义是**全部完成**而非**无数据**，
 * 故不能用 `dashboard.html.empty`（显示会误导）→ 独立 `dashboard.html.none` 键（zh/en 均为 `—`）。
 */
function noneInline(lang: Lang): string {
  return `<span class="none" ${ATTR.none}>${escapeHtml(t('dashboard.html.none', lang))}</span>`;
}

/** 需求优先级排序权（P0 > P1 > P2 > 未指定；单一来源 `REQ_PRIORITIES`） */
const PRIORITY_RANK: Record<string, number> = Object.fromEntries(
  REQ_PRIORITIES.map((priority, index) => [priority, index]),
);

/** 优先级排序权：未指定排在已指定之后 */
function priorityRank(item: DashboardRequirementItem): number {
  const priority = item.priority;
  if (typeof priority !== 'string') {
    return REQ_PRIORITIES.length;
  }
  return PRIORITY_RANK[priority] ?? REQ_PRIORITIES.length;
}

/** 需求行排序（列内 P0 > P1 > P2，同优先级按 ID 升序；确定性排序） */
function sortRequirements(items: DashboardRequirementItem[]): DashboardRequirementItem[] {
  return [...items].sort((left, right) => {
    const rankDiff = priorityRank(left) - priorityRank(right);
    if (rankDiff !== 0) {
      return rankDiff;
    }
    if (left.id === right.id) {
      return 0;
    }
    return left.id < right.id ? -1 : 1;
  });
}

/**
 * 十格文本进度条（无动态属性，遵守 H6；`opsDone/opsTotal` 数值仍以文本给出）：
 * `\u2588` 已完成 / `\u2591` 未完成，固定 10 格，纯文本（不写 style 宽度）。
 */
function progressBar(done: number, total: number): string {
  const safeTotal = Number.isFinite(total) && total > 0 ? Math.floor(total) : 0;
  if (safeTotal === 0) {
    return '\u2591'.repeat(10);
  }
  const safeDone = Number.isFinite(done) ? Math.min(Math.max(Math.floor(done), 0), safeTotal) : 0;
  const filled = Math.round((safeDone / safeTotal) * 10);
  return `${'\u2588'.repeat(filled)}${'\u2591'.repeat(10 - filled)}`;
}

function thRequirement(lang: Lang): string {
  return `<th ${ATTR.thRequirement}>${escapeHtml(t('dashboard.html.th.requirement', lang))}</th>`;
}

function thVersion(lang: Lang): string {
  return `<th ${ATTR.thVersion}>${escapeHtml(t('dashboard.html.th.version', lang))}</th>`;
}

/**
 * 块状条目内的元信息 chip：标签复用既有 `html.th.*` 译文（与表格表头共用，不另增键）。
 * 结构 = `<span class="chip"><span class="chip-label">标签</span>值</span>`。
 */
function chipPriority(value: string | undefined, lang: Lang): string {
  return `<span class="chip"><span class="chip-label" ${ATTR.thPriority}>${escapeHtml(t('dashboard.html.th.priority', lang))}</span>${textOrDash(value)}</span>`;
}

function chipVersion(value: string | undefined, lang: Lang): string {
  return `<span class="chip"><span class="chip-label" ${ATTR.thVersion}>${escapeHtml(t('dashboard.html.th.version', lang))}</span>${textOrDash(value)}</span>`;
}

function chipOwner(value: string | undefined, lang: Lang): string {
  return `<span class="chip"><span class="chip-label" ${ATTR.thOwner}>${escapeHtml(t('dashboard.html.th.owner', lang))}</span>${textOrDash(value)}</span>`;
}

function thPhase(lang: Lang): string {
  return `<th ${ATTR.thPhase}>${escapeHtml(t('dashboard.html.th.phase', lang))}</th>`;
}

function thOps(lang: Lang): string {
  return `<th ${ATTR.thOps}>${escapeHtml(t('dashboard.html.th.ops', lang))}</th>`;
}

function thCount(lang: Lang): string {
  return `<th ${ATTR.thCount}>${escapeHtml(t('dashboard.html.th.count', lang))}</th>`;
}

/** 阶段表首列：阶段 ID（与区块标题 `dashboard.html.section.stages` 分离，避免「阶段」顶替列名） */
function thStage(lang: Lang): string {
  return `<th ${ATTR.thStage}>${escapeHtml(t('dashboard.html.th.stage', lang))}</th>`;
}

/** ① 页头：文档标题 + 项目名 / 版本 / 宏观相位（数据字段，语言中性） */
function renderHeader(data: DashboardData, lang: Lang): string {
  const projectName = textOrDash(data.project?.name);
  const projectVersion = textOrDash(data.project?.version);
  const pipelinePhase = textOrDash(data.stages?.pipeline?.phase);
  return [
    '<header class="page-head">',
    `<h1 ${ATTR.title}>${escapeHtml(t('dashboard.html.title', lang))}</h1>`,
    `<p class="subtitle"><code>${projectName}</code><code>${projectVersion}</code><code>${pipelinePhase}</code></p>`,
    '</header>',
  ].join('\n');
}

/** ② KPI 条：需求总数 / 已完成 / 活跃阶段 / 阻塞 REV / 归档版本 */
function renderKpi(data: DashboardData, lang: Lang): string {
  const blockingReviews = Array.isArray(data.blockingReviews) ? data.blockingReviews : [];
  const archived = Array.isArray(data.releases?.archived) ? data.releases.archived : [];
  const items = [
    `<li class="kpi"><span class="kpi-label" ${ATTR.kpiTotal}>${escapeHtml(t('dashboard.html.kpi.total', lang))}</span><span class="kpi-value">${num(data.requirements.total)}</span></li>`,
    `<li class="kpi"><span class="kpi-label" ${ATTR.kpiDone}>${escapeHtml(t('dashboard.html.kpi.done', lang))}</span><span class="kpi-value">${num(data.requirements.counts?.done)}</span></li>`,
    `<li class="kpi"><span class="kpi-label" ${ATTR.kpiActiveStages}>${escapeHtml(t('dashboard.html.kpi.activeStages', lang))}</span><span class="kpi-value">${num(data.stages?.counts?.active)}</span></li>`,
    `<li class="kpi"><span class="kpi-label" ${ATTR.kpiBlockingReviews}>${escapeHtml(t('dashboard.html.kpi.blockingReviews', lang))}</span><span class="kpi-value">${num(blockingReviews.length)}</span></li>`,
    `<li class="kpi"><span class="kpi-label" ${ATTR.kpiArchived}>${escapeHtml(t('dashboard.html.kpi.archived', lang))}</span><span class="kpi-value">${num(archived.length)}</span></li>`,
  ];
  return `<section class="card kpi-strip" id="kpi">\n<ul class="kpi-list">\n${items.join('\n')}\n</ul>\n</section>`;
}

/** ② 需求看板单列（一个需求状态一列；列内 P0 > P1 > P2；块状条目流，列内不再放表格） */
function renderLane(status: RequirementStatus, rawItems: DashboardRequirementItem[], lang: Lang): string {
  const items = sortRequirements(Array.isArray(rawItems) ? rawItems : []);
  const head = [
    '<h3 class="lane-head">',
    `<span ${ATTR.thStatus}>${escapeHtml(t('dashboard.html.th.status', lang))}</span>`,
    ` <code class="lane-status">${escapeHtml(status)}</code>`,
    ` <span class="lane-count">${num(items.length)}</span>`,
    '</h3>',
  ].join('');
  const body = items.length === 0
    ? emptyNode(lang)
    : [
        '<ul class="lane-items">',
        ...items.map((item) => [
          '<li class="lane-item">',
          `<span class="req-id"><code>${escapeHtml(item.id)}</code></span>`,
          `<span class="req-title">${escapeHtml(item.title ?? '')}</span>`,
          '<span class="chips">',
          chipPriority(item.priority, lang),
          chipVersion(item.target_version, lang),
          chipOwner(item.owner, lang),
          '</span>',
          '</li>',
        ].join('')),
        '</ul>',
      ].join('\n');
  return `<div class="lane">\n${head}\n${body}\n</div>`;
}

/** ② 需求看板（7 列 = `REQ_STATUSES` 声明序；零需求整体出空态） */
function renderRequirements(data: DashboardData, lang: Lang): string {
  const block = data.requirements;
  const total = typeof block?.total === 'number' ? block.total : 0;
  const board = total === 0
    ? emptyNode(lang)
    : `<div class="board">\n${REQ_STATUSES.map((status) => renderLane(status, block.groups?.[status] ?? [], lang)).join('\n')}\n</div>`;
  return [
    '<section class="card" id="requirements">',
    `<h2 ${ATTR.sectionRequirements}>${escapeHtml(t('dashboard.html.section.requirements', lang))}</h2>`,
    board,
    '</section>',
  ].join('\n');
}

/** ③ 阶段表：阶段 ID / phase + 模式 / opsDone 进度条 / 关联需求 */
function renderStages(data: DashboardData, lang: Lang): string {
  const items = Array.isArray(data.stages?.items) ? data.stages.items : [];
  const body = items.length === 0
    ? emptyNode(lang)
    : [
        '<table class="stage-table">',
        '<thead><tr>',
        thStage(lang),
        thPhase(lang),
        thOps(lang),
        thRequirement(lang),
        '</tr></thead>',
        '<tbody>',
        ...items.map((item) => [
          '<tr>',
          `<td><code>${escapeHtml(item.id)}</code></td>`,
          `<td>${textOrDash(item.phase)} <span class="mode"><code>${textOrDash(item.workflowMode)}</code></span></td>`,
          `<td><code class="ops-bar">${progressBar(item.opsDone, item.opsTotal)}</code> <span class="ops-count">${num(item.opsDone)}/${num(item.opsTotal)}</span></td>`,
          `<td>${textOrDash(item.requirementId)}</td>`,
          '</tr>',
        ].join('')),
        '</tbody>',
        '</table>',
      ].join('\n');
  return [
    '<section class="card" id="stages">',
    `<h2 ${ATTR.sectionStages}>${escapeHtml(t('dashboard.html.section.stages', lang))}</h2>`,
    body,
    '</section>',
  ].join('\n');
}

/** 归档版本计数（`counts` 损坏 / 不可读 → `-`，H8） */
function archiveCountsText(counts: { stages: number; reviews: number; log: number } | null | undefined): string {
  if (counts === null || counts === undefined) {
    return '-';
  }
  return `stages=${num(counts.stages)} reviews=${num(counts.reviews)} log=${num(counts.log)}`;
}

/** ④ 版本发布门表 + 归档历史表（两块共用 `dashboard` 域的区块标题） */
function renderReleases(data: DashboardData, lang: Lang): string {
  const gates = Array.isArray(data.releases?.gates) ? data.releases.gates : [];
  const archived = Array.isArray(data.releases?.archived) ? data.releases.archived : [];

  const gatesBody = gates.length === 0
    ? emptyNode(lang)
    : [
        '<table class="gate-table">',
        '<thead><tr>',
        thVersion(lang),
        thCount(lang),
        thRequirement(lang),
        '</tr></thead>',
        '<tbody>',
        ...gates.map((gate) => {
          const unfinished = Array.isArray(gate.unfinished) ? gate.unfinished : [];
          return [
            '<tr>',
            `<td><code>${textOrDash(gate.version)}</code></td>`,
            `<td>done=${num(gate.counts?.done)} unfinished=${num(gate.counts?.unfinished)} other=${num(gate.counts?.other)} total=${num(gate.counts?.total)}</td>`,
            `<td>${unfinished.length === 0 ? noneInline(lang) : unfinished.map((id) => `<code>${escapeHtml(id)}</code>`).join(' ')}</td>`,
            '</tr>',
          ].join('');
        }),
        '</tbody>',
        '</table>',
      ].join('\n');

  const archivedBody = archived.length === 0
    ? emptyNode(lang)
    : [
        '<table class="archived-table">',
        '<thead><tr>',
        thVersion(lang),
        thCount(lang),
        '</tr></thead>',
        '<tbody>',
        ...archived.map((row) => [
          '<tr>',
          `<td><code>${textOrDash(row.version)}</code></td>`,
          `<td>${archiveCountsText(row.counts)}</td>`,
          '</tr>',
        ].join('')),
        '</tbody>',
        '</table>',
      ].join('\n');

  return [
    '<section class="card" id="releases">',
    `<h2 ${ATTR.sectionReleases}>${escapeHtml(t('dashboard.html.section.releases', lang))}</h2>`,
    gatesBody,
    `<h3 class="sub-title" ${ATTR.sectionArchived}>${escapeHtml(t('dashboard.html.section.archived', lang))}</h3>`,
    archivedBody,
    '</section>',
  ].join('\n');
}

/** ⑤ 阻塞审查（只含非 done 阶段的 open blocking REV） */
function renderBlockingReviews(data: DashboardData, lang: Lang): string {
  const reviews = Array.isArray(data.blockingReviews) ? data.blockingReviews : [];
  const body = reviews.length === 0
    ? emptyNode(lang)
    : [
        '<ul class="reviews">',
        ...reviews.map((review) => [
          '<li>',
          `<code>${escapeHtml(review.id)}</code>`,
          `<span class="prio">${textOrDash(review.priority)}</span>`,
          `${escapeHtml(review.title ?? '')}`,
          `<span class="ref"><code>${textOrDash(review.stage)}</code>/<code>${textOrDash(review.op)}</code></span>`,
          '</li>',
        ].join('')),
        '</ul>',
      ].join('\n');
  return [
    '<section class="card" id="blocking-reviews">',
    `<h2 ${ATTR.sectionBlockingReviews}>${escapeHtml(t('dashboard.html.section.blockingReviews', lang))}</h2>`,
    body,
    '</section>',
  ].join('\n');
}

/** ⑥ 流程健康项（快照：`health.ok=false` 不影响渲染与退出码） */
function renderHealth(data: DashboardData, lang: Lang): string {
  const items = Array.isArray(data.health?.items) ? data.health.items : [];
  const okText = data.health?.ok === true ? 'true' : 'false';
  const body = items.length === 0
    ? emptyNode(lang)
    : [
        '<ul class="health">',
        ...items.map((item) => [
          '<li>',
          `<span class="tag">${textOrDash(item.status)}</span>`,
          `${escapeHtml(item.message ?? '')}`,
          `<span class="ref"><code>${textOrDash(item.section)}</code></span>`,
          '</li>',
        ].join('')),
        '</ul>',
      ].join('\n');
  return [
    '<section class="card" id="health">',
    `<h2 ${ATTR.sectionHealth}>${escapeHtml(t('dashboard.html.section.health', lang))}</h2>`,
    `<p class="health-ok"><code>ok=${okText}</code></p>`,
    body,
    '</section>',
  ].join('\n');
}

/** ⑦ 指标明细（`getSummaryData()` 逐字；列名为数据字段名，语言中性） */
function renderMetrics(data: DashboardData, lang: Lang): string {
  const agents = Array.isArray(data.metrics?.agents) ? data.metrics.agents : [];
  const body = agents.length === 0
    ? emptyNode(lang)
    : [
        '<ul class="metric-list">',
        ...agents.map((agent) => [
          '<li>',
          `<code>${textOrDash(agent.agentName)}</code>`,
          `<span class="metric-values">totalRuns=${numOrDash(agent.totalRuns)} successfulRuns=${numOrDash(agent.successfulRuns)} failedRuns=${numOrDash(agent.failedRuns)} totalRetries=${numOrDash(agent.totalRetries)} avgDurationMs=${numOrDash(agent.avgDurationMs)} successRate=${numOrDash(agent.successRate)}</span>`,
          '</li>',
        ].join('')),
        '</ul>',
      ].join('\n');
  return [
    '<section class="card" id="metrics">',
    `<h2 ${ATTR.sectionMetrics}>${escapeHtml(t('dashboard.html.section.metrics', lang))}</h2>`,
    body,
    '</section>',
  ].join('\n');
}

/** ⑧ 页脚：生成时间（唯一时间字段）/ 生成器 / 项目根 / 说明 */
function renderFooter(data: DashboardData, lang: Lang): string {
  return [
    '<footer class="page-foot">',
    '<ul class="foot-list">',
    `<li><span ${ATTR.footerGeneratedAt}>${escapeHtml(t('dashboard.html.footer.generatedAt', lang))}</span>: <code>${textOrDash(data.generatedAt)}</code></li>`,
    `<li><span ${ATTR.footerGenerator}>${escapeHtml(t('dashboard.html.footer.generator', lang))}</span>: <code>${textOrDash(data.generator)}</code></li>`,
    `<li><span ${ATTR.footerProjectRoot}>${escapeHtml(t('dashboard.html.footer.projectRoot', lang))}</span>: <code>${textOrDash(data.project?.root)}</code></li>`,
    `<li><span ${ATTR.footerNote}>${escapeHtml(t('dashboard.html.footer.note', lang))}</span></li>`,
    '</ul>',
    '</footer>',
  ].join('\n');
}

/**
 * 渲染单文件看板 HTML（唯一公共面）。
 *
 * @param data 聚合层产出的 `DashboardData`（唯一时间字段 `generatedAt`）
 * @param options.lang HTML 文案语言（显式传入，禁依赖进程默认语言）
 * @returns 完整 HTML 文档字符串（确定性：同一 data + 同一 lang 逐字相同）
 */
export function renderDashboardHtml(data: DashboardData, options: { lang: 'zh-CN' | 'en' }): string {
  const lang: Lang = options.lang === 'en' ? 'en' : 'zh-CN';
  const document = [
    '<!doctype html>',
    HTML_LANG_ATTR[lang],
    '<head>',
    '<meta charset="utf-8">',
    CSP_META,
    `<title>${escapeHtml(t('dashboard.html.title', lang))}</title>`,
    `<style>${STYLE}</style>`,
    '</head>',
    '<body>',
    renderHeader(data, lang),
    '<main>',
    renderKpi(data, lang),
    renderRequirements(data, lang),
    renderStages(data, lang),
    renderReleases(data, lang),
    renderBlockingReviews(data, lang),
    renderHealth(data, lang),
    renderMetrics(data, lang),
    '</main>',
    renderFooter(data, lang),
    `<script id="openfeel-data" type="application/json">${escapeJsonForScript(JSON.stringify(data))}</script>`,
    '</body>',
    '</html>',
  ];
  return `${document.join('\n')}\n`;
}
