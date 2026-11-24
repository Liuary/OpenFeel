/**
 * 写实性判据（**唯一实现**） — 正文 / 计划 / overview 是否「写实」的单点来源
 *
 * **判据唯一实现，不得在别处复制字面量**：
 * - 占位字面量、空模板标记、字数阈值只在本模块定义；
 * - `flow-manager.ts`（模板填充度）、`body-lint.ts`（空壳枚举，后续任务）、
 *   阶段计划门（后续任务）都从这里 import，禁止在调用方另写一套占位/字数规则。
 *
 * **两种正则语义必须分开保留**（plan §2 T1 / REV-004 纠偏）：
 * - {@link EMPTY_TEMPLATE_LINE_LITERAL_RE}：**整段字面量语义**（非 `m`），供
 *   `isTemplateEmpty` 对整段内容做 `.test()`；字面量与迁移前 `flow-manager.ts` 逐字相同。
 * - {@link PLACEHOLDER_LINE_RE}：**逐行语义**（`m`），仅供 `isSectionFilled` 逐行过滤。
 *   两者**不得混用**：把整段版换成逐行版会让 `plan.ts` / `flow.ts` 的 `--json fill`
 *   字段退化（那是 BUG-005 同族事故）。
 *
 * 本模块为纯函数模块：**零 IO、零全局路径依赖、零副作用**，可被任意层安全复用。
 */

/** 判为「写实」所需的最小非空白字符数（plan §4.1）。 */
export const MIN_FILLED_CHARS = 40;
/*
 * 阈值依据：40 个非空白字符 ≈ 一句可复述的实质结论；低于它通常仍是
 * 「标题 + 占位符」或「一句话口号」，无法支撑审查/验收。需求正文 A1 的
 * `--text` 判据（≥40 字）与本阈值同口径，避免正文写入与写实判定两套标准。
 */

/**
 * 占位字面量（**整行相等**比较用，禁止子串判定）。
 * 中文全/半角括号、拉丁标签的大写形式都在 {@link isPlaceholderLiteral} 里归一化。
 */
export const PLACEHOLDER_LITERALS = [
  '（待补充）', '(待补充)', '（未指定）', '(未指定)', '待补充', 'TBD', 'TODO', 'FIXME',
] as const;

/**
 * 空模板标记（**单一来源**）：`flow-manager.ts` 判空、scheme 模板、healthCheck 共用。
 * 原定义在 `flow-manager.ts`（约 :5231），迁移至此后由该文件 re-export，行为零变化。
 */
export const EMPTY_TEMPLATE_MARKER = '- [ ] 待补充';

/**
 * 空模板标记的**整段字面量**正则（与迁移前 `flow-manager.ts:5239` **逐字相同**）：
 * 行首可含缩进（`[ \t]*`）、`-` 与 `[ ]` 之间允许空白、行尾允许空白并容忍 CRLF；
 * 仅当标记**独占一行**（含缩进）时判为未填充——避免正文**行内引用**该字面导致误报
 * （cli/BUG-005，stage-54 E1）。**已知边界**：代码围栏（```）内的独占行仍判为 empty。
 *
 * 注意：这是**整段**语义（非 `m` 模式），供 `isTemplateEmpty` 对整段内容 `.test()`；
 * 不得改写成 `^…$` 形式（会退化为仅匹配首行/整串）。
 */
export const EMPTY_TEMPLATE_LINE_LITERAL_RE = /(?:^|\n)[ \t]*-\s*\[\s*\]\s*待补充[ \t]*(?=\r?\n|$)/;

/**
 * 占位行**逐行**正则（`m` 语义，**新写**，仅用于 `isSectionFilled` 的逐行过滤）：
 * - `- [ ] 待补充`（含 `- 待补充` 无勾选框形态、`> 待补充` 引用形态）
 * - `（待补充）` / `(待补充)`（可带列表符号或引用符号）
 * - `待补充` / `TBD` / `TODO` / `FIXME` 独占一行（可带 `：`）
 * - 空行 / 纯空白行（「空小节」的逐行形态）
 *
 * 与整段版的分工：按**单行**判定，故 `m` 与上者等价而实现独立；二者**不得互换**。
 * 只做「整行占位」判定，绝不使用子串匹配（`includes` / `indexOf` 会误伤正文引用）。
 */
export const PLACEHOLDER_LINE_RE =
  /^(?:[ \t]*|[ \t]*(?:[-*+][ \t]*)?(?:>[ \t]*)?(?:\[[ \t]*\][ \t]*)?(?:[（(][ \t]*)?(?:待补充|TBD|TODO|FIXME)(?:[ \t]*[)）])?(?:[ \t]*[：:])?[ \t]*)$/m;

/** 需求正文必备小节（plan §4.2）。 */
export const REQUIREMENT_BODY_SECTIONS = ['摘要', '目标与验收'] as const;

/** 需求正文中额外要求「至少一条判据行」的小节（plan §4.1 步骤 4）。 */
export const REQUIREMENT_BODY_CRITERIA_SECTIONS = ['目标与验收'] as const;

/** 需求级计划必备小节（plan §4.2；`偏差与回写` 只在偏差发生时另行判定）。 */
export const REQUIREMENT_PLAN_SECTIONS = ['目标', '任务拆解', '验收判据'] as const;

/** 需求级计划「偏差回写」小节名（T6/T7 的 `plan_deviation` 判据用）。 */
export const REQUIREMENT_PLAN_DEVIATION_SECTION = '偏差与回写';

/** 阶段 overview 必备小节（plan §4.2；骨架只有目标/依赖/操作方案，无验收节）。 */
export const STAGE_OVERVIEW_SECTIONS = ['目标', '操作方案'] as const;

/** 阶段计划的最小信息量：`2 × MIN_FILLED_CHARS`（plan §4.2，阶段计划体裁自由、只用总量兜底）。 */
export const STAGE_PLAN_MIN_CHARS = MIN_FILLED_CHARS * 2;

/** 判据行前缀（需求正文 `## 目标与验收` 至少命中一条）。 */
const CRITERIA_LINE_RE = /^(?:[-*]|A\d|验收)/;

/** Markdown 标题行（`#{1,2}` 为同级/更高级，`###+` 属于当前小节正文）。 */
const HEADING_RE = /^ {0,3}(#{1,2})[ \t]+(.*?)[ \t]*#*[ \t]*$/;

/** 小节省略原因（稳定字符串，供上层映射错误码/文案）。 */
export type SectionFillReason = 'missing-section' | 'empty' | 'too-short' | 'no-criteria';

/** 单小节写实判定结果。 */
export interface SectionFillVerdict {
  filled: boolean;
  /** 未写实原因；`filled=true` 时缺省 */
  reason?: SectionFillReason;
  /** 过滤占位/注释后的非空白字符数 */
  chars: number;
}

/** `isSectionFilled` 的附加判据。 */
export interface SectionFillOptions {
  /** 追加要求：剩余行中至少 1 行以 `-` / `*` / `A\d` / `验收` 开头（仅需求正文 `目标与验收`） */
  requireCriteria?: boolean;
}

/** 解析出的 Markdown 小节。 */
export interface MarkdownSection {
  /** 原始标题文本（已 trim，未归一化） */
  name: string;
  /** 该 `## 标题` 到下一个同级/更高级标题之间的原文（已 trim 首尾空白） */
  body: string;
}

/**
 * 小节名归一化：忽略大小写与所有空白（「大小写/空格宽容」）。
 * 仅用于比较，不改变返回对象里的原始标题。
 */
function normalizeSectionName(name: string): string {
  return name.trim().replace(/\s+/g, '').toLowerCase();
}

/**
 * 占位字面量归一化：去首尾空白 → 去尾随冒号 → 去包裹的中/英文括号 → 大写。
 */
function normalizeLiteral(value: string): string {
  let normalized = value.trim();
  normalized = normalized.replace(/[：:]\s*$/, '').trim();
  normalized = normalized.replace(/^[（(]+/, '').replace(/[)）]+$/, '').trim();
  return normalized.toUpperCase();
}

/**
 * 是否等于某个占位字面量（**整行相等**，非子串）。
 * 两侧都做 {@link normalizeLiteral} 归一化，所以 `（待补充）`、`待补充：`、`tbd` 均可命中。
 */
function isPlaceholderLiteral(line: string): boolean {
  const normalized = normalizeLiteral(line);
  return PLACEHOLDER_LITERALS.some((literal) => normalizeLiteral(literal) === normalized);
}

/**
 * 逐行过滤占位行与 HTML 注释（`<!-- ... -->` 可跨行），返回保留的原始行。
 * 只做整行占位判定（`PLACEHOLDER_LINE_RE` + 字面量相等），不做子串匹配。
 */
function filterPlaceholderLines(body: string): string[] {
  const withoutComments = body.replace(/<!--[\s\S]*?-->/g, '');
  const kept: string[] = [];
  for (const line of withoutComments.split(/\r?\n/)) {
    if (PLACEHOLDER_LINE_RE.test(line)) { continue; }
    if (isPlaceholderLiteral(line)) { continue; }
    kept.push(line);
  }
  return kept;
}

/** 保留行的非空白字符数。 */
function countContentChars(lines: readonly string[]): number {
  return lines.join('\n').replace(/\s+/g, '').length;
}

/**
 * 按 `## 标题` 切分 Markdown（**唯一实现**）。
 *
 * - 只把 `##` 视为小节标题；`###` 及更深标题属于当前小节正文；
 * - `#`（一级标题）是更高级标题，遇到时终止当前小节；
 * - 名称比较对大小写与空白宽容（见 {@link normalizeSectionName}）。
 *
 * 纯函数：不读写文件、不依赖 cwd。
 */
export function parseMarkdownSections(md: string): MarkdownSection[] {
  const sections: MarkdownSection[] = [];
  let current: { name: string; lines: string[] } | null = null;
  const flush = (): void => {
    if (current !== null) {
      sections.push({ name: current.name, body: current.lines.join('\n').trim() });
      current = null;
    }
  };
  for (const line of md.split(/\r?\n/)) {
    const heading = HEADING_RE.exec(line);
    if (heading !== null) {
      flush();
      if (heading[1].length === 2) {
        current = { name: heading[2].trim(), lines: [] };
      }
      continue;
    }
    if (current !== null) { current.lines.push(line); }
  }
  flush();
  return sections;
}

/**
 * 取出指定小节的正文（`## <name>` 到下一个同级/更高级标题之间）。
 * @returns 小节正文；找不到标题返回 `null`（交由 {@link isSectionFilled} 判为 `missing-section`）
 */
export function extractSection(md: string, name: string): string | null {
  const target = normalizeSectionName(name);
  const hit = parseMarkdownSections(md).find((section) => normalizeSectionName(section.name) === target);
  return hit !== undefined ? hit.body : null;
}

/**
 * 单小节写实判定（判定链顺序固定，见 plan §4.1）：
 * 1. `body === null`（标题缺失）→ `missing-section`；
 * 2. 逐行删除占位行 / 占位字面量行 / HTML 注释；
 * 3. 剩余非空白字符数 `chars`：`0 → empty`，`< MIN_FILLED_CHARS → too-short`；
 * 4. `requireCriteria` 时要求至少一条判据行，否则 `no-criteria`。
 *
 * @param body 小节正文（`parseMarkdownSections` / `extractSection` 的 `body`）；`null` 表示标题缺失
 */
export function isSectionFilled(
  body: string | null | undefined,
  options: SectionFillOptions = {},
): SectionFillVerdict {
  if (body === null || body === undefined) {
    return { filled: false, reason: 'missing-section', chars: 0 };
  }
  const kept = filterPlaceholderLines(body);
  const chars = countContentChars(kept);
  if (chars === 0) {
    return { filled: false, reason: 'empty', chars };
  }
  if (chars < MIN_FILLED_CHARS) {
    return { filled: false, reason: 'too-short', chars };
  }
  if (options.requireCriteria === true) {
    const hasCriteria = kept.some((line) => CRITERIA_LINE_RE.test(line.trim()));
    if (!hasCriteria) {
      return { filled: false, reason: 'no-criteria', chars };
    }
  }
  return { filled: true, chars };
}

/**
 * 列出「未写实」的小节名（保持 `required` 的声明顺序）。
 * 供 `lint req` 的 `emptySections` 与门禁错误明细复用，避免调用方各写一遍循环。
 *
 * @param criteriaSections 这些小节额外要求至少一条判据行（如需求正文的 `目标与验收`）
 */
export function findEmptySections(
  md: string,
  required: readonly string[],
  criteriaSections: readonly string[] = [],
): string[] {
  return required.filter((name) => {
    const verdict = isSectionFilled(extractSection(md, name), {
      requireCriteria: criteriaSections.includes(name),
    });
    return !verdict.filled;
  });
}

/**
 * 需求正文是否写实（plan §4.2）：`## 摘要` 与 `## 目标与验收` 均写实。
 * `## 目标与验收` 额外要求至少一条判据行（`-` / `*` / `A\d` / `验收` 开头）。
 */
export function isRequirementBodyFilled(md: string): boolean {
  return findEmptySections(
    md,
    REQUIREMENT_BODY_SECTIONS,
    REQUIREMENT_BODY_CRITERIA_SECTIONS,
  ).length === 0;
}

/**
 * 需求级计划是否写实（plan §4.2）：`## 目标` / `## 任务拆解` / `## 验收判据` 三节均写实。
 * `## 偏差与回写` 只在「计划被执行改动」时由 T6/T7 的 `plan_deviation` 判据另行要求。
 */
export function isRequirementPlanFilled(md: string): boolean {
  return findEmptySections(md, REQUIREMENT_PLAN_SECTIONS).length === 0;
}

/**
 * 阶段计划是否写实（plan §4.2）：**不强制标题体裁**（现网存在「一、二、三」中文序号写法）。
 * 判据只有总量：删除占位行/注释后，**标题行以外**的非空白字符数 ≥ {@link STAGE_PLAN_MIN_CHARS}。
 * 标题行不计入信息量，避免「只剩标题 + 占位」的壳靠长标题混过。
 */
export function isStagePlanFilled(md: string): boolean {
  const contentLines = filterPlaceholderLines(md)
    .filter((line) => HEADING_RE.exec(line) === null);
  return countContentChars(contentLines) >= STAGE_PLAN_MIN_CHARS;
}

/**
 * 阶段 overview 是否写实（plan §4.2）：`## 目标` 与 `## 操作方案` 均写实。
 * 仅用于 `lint` advisory，**不进任何门**（骨架无验收节，不得按验收判）。
 */
export function isStageOverviewFilled(md: string): boolean {
  return findEmptySections(md, STAGE_OVERVIEW_SECTIONS).length === 0;
}

/**
 * `## 目标` 非占位（便捷判定，等价于对单节调用 {@link isSectionFilled}）。
 * 需要 overview 全量判据时用 {@link isStageOverviewFilled}。
 */
export function isOverviewFilled(md: string): boolean {
  return isSectionFilled(extractSection(md, '目标')).filled;
}
