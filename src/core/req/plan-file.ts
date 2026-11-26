/**
 * 需求级计划文件原语 — `req plan` / `lint fill --fix-plan` 的**唯一生成器**
 *
 * 职责：把 `.openfeel/plan/reqs/REQ-NNN.plan.md` 的四节骨架**机械铺开**（内容一律从需求正文派生，
 * 不编造判据），并给出「已存在 → 拒绝覆盖」的稳定错误码。
 *
 * 单一来源纪律（阶段计划 §1.2 / REQ-064 §风险）：
 * - 路径只经 `src/core/plan/path.ts` 的 `getRequirementPlanRelPath` / `findRequirementPlanPath`；
 * - 写实性判据只经 `src/core/plan/filled.ts`（`isRequirementPlanFilled` / `isSectionFilled` / `extractSection`），
 *   本文件**不定义**任何占位字面量、字数阈值或第二套四节规则；
 * - 正文读取只经 `src/core/req/body-file.ts` 的 `getRequirementBodyPath`。
 *
 * 正交声明：路径全由 `projectPath` 参数传入，零全局路径依赖；唯一 IO 点 `atomicWriteFileSync`。
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { atomicWriteFileSync } from '../fs/atomic-write.js';
import { findRequirementPlanPath, getRequirementPlanRelPath } from '../plan/path.js';
import { extractSection, isRequirementPlanFilled, isSectionFilled } from '../plan/filled.js';
import { getRequirementBodyPath } from './body-file.js';
import type { RequirementData } from './types.js';

/**
 * 计划骨架六节（声明序即落盘序）。
 *
 * 前四节与 `filled.ts` 的必备三节同源（`偏差与回写` 为第四列）；`不做清单` / `允许改动`
 * 是 v1.6.5 / A74.4 新增的**范围纪律占位**——只保证小节存在，**不是写实判据**
 * （`isRequirementPlanFilled` 仍只查 目标 / 任务拆解 / 验收判据 三节）。
 */
export const REQUIREMENT_PLAN_SKELETON_SECTIONS = [
  '目标',
  '任务拆解',
  '验收判据',
  '不做清单',
  '允许改动',
  '偏差与回写',
] as const;

/** 空小节占位（**不是写实判据**；仅用于「需求正文未写实」时诚实留空，绝不冒充内容） */
const PLAN_PLACEHOLDER = '（待补充）';

/**
 * 计划文件错误码（命令层据此映射 exit 1 / legacy envelope；零业务校验）。
 * - `exists`：目标计划已存在且未 `--force` —— **零写盘**
 * - `invalid_field`：seed 非法（空 ID / 空标题）
 */
export type RequirementPlanFileErrorCode = 'exists' | 'invalid_field';

/** 计划文件失败（携稳定错误码；命令层只做映射） */
export class RequirementPlanFileError extends Error {
  readonly code: RequirementPlanFileErrorCode;
  /** 已存在的计划绝对路径（`exists` 时给出，便于文案指路） */
  readonly existingPath?: string;

  constructor(code: RequirementPlanFileErrorCode, message: string, existingPath?: string) {
    super(message);
    this.name = 'RequirementPlanFileError';
    this.code = code;
    if (existingPath !== undefined) {
      this.existingPath = existingPath;
    }
  }
}

/**
 * 计划骨架的输入种子。
 * `RequirementData` 结构上兼容（只取 id / title），因此命令层可直接传需求本体。
 */
export interface RequirementPlanSeed {
  /** 需求 ID（REQ-NNN） */
  id: string;
  /** 需求标题（正文 H1 的第二段；缺失时由 {@link readRequirementPlanTitle} 兜底） */
  title: string;
}

/** {@link writeRequirementPlanSkeleton} 选项 */
export interface WriteRequirementPlanOptions {
  /** 已存在时是否覆盖（缺省 false → 抛 `exists`） */
  force?: boolean;
  /** 变更记录时间（ISO 8601；测试可注入，缺省当前时间） */
  now?: string;
  /** 生成者署名（缺省 `req plan`） */
  by?: string;
}

/** {@link writeRequirementPlanSkeleton} 结果 */
export interface WriteRequirementPlanResult {
  /** POSIX 项目根相对路径（`.openfeel/plan/reqs/REQ-NNN.plan.md`） */
  path: string;
  /** 本次是否新建（写前不存在） */
  created: boolean;
  /** 本次是否覆盖了既有计划（写前存在且 `--force`） */
  overwritten: boolean;
  /** 落盘内容行数（`content.split(/\r?\n/).length`） */
  lines: number;
  /**
   * 写后自检：`isRequirementPlanFilled(content)`（复用 `filled.ts`，不新写第二份规则）。
   * `false` 只说明「需求正文摘要/验收尚未写实 → 骨架诚实留空」，不是写失败。
   */
  filled: boolean;
}

/** 从需求正文 H1 解析标题（`# REQ-001：标题` → `标题`；读不到 → `null`） */
export function readRequirementPlanTitle(projectPath: string, id: string): string | null {
  const bodyPath = getRequirementBodyPath(projectPath, id);
  if (!existsSync(bodyPath)) {
    return null;
  }
  let content: string;
  try {
    content = readFileSync(bodyPath, 'utf-8');
  } catch {
    return null;
  }
  const firstLine = content.split(/\r?\n/, 1)[0] ?? '';
  const m = firstLine.match(/^#\s+(REQ-\d+)\s*[：:]\s*(.+?)\s*$/);
  if (m === null || m[1] !== id) {
    return null;
  }
  return m[2];
}

/** 需求正文（读不到 → `''`；正文缺失时骨架诚实留空，不阻断生成） */
function readBodyMarkdown(projectPath: string, id: string): string {
  const bodyPath = getRequirementBodyPath(projectPath, id);
  if (!existsSync(bodyPath)) {
    return '';
  }
  try {
    return readFileSync(bodyPath, 'utf-8');
  } catch {
    return '';
  }
}

/** `## 摘要` 写实 → 原样作为计划「目标」；否则留空占位 */
function buildGoalSection(bodyMd: string, title: string): string {
  const summary = extractSection(bodyMd, '摘要');
  if (!isSectionFilled(summary).filled) {
    return PLAN_PLACEHOLDER;
  }
  return `- 交付「${title}」：\n\n${summary!.trim()}\n\n- 依据：需求正文 \`## 摘要\`（本计划由 \`req plan\` 机械派生，不另立判据）。`;
}

/** 判据行（与 `filled.ts` 的判据行前缀同义：`-` / `*` / `A\d` / `验收`） */
const CRITERIA_LINE_RE = /^(?:[-*]|A\d|验收)/;

/**
 * `## 目标与验收` 写实 → 逐条转成任务清单（判据 1:1 → 可勾任务）。
 * 这是**派生**而非编造：条目文本逐字来自需求正文。
 */
function buildTaskSection(bodyMd: string): string {
  const criteria = extractSection(bodyMd, '目标与验收');
  if (!isSectionFilled(criteria, { requireCriteria: true }).filled) {
    return PLAN_PLACEHOLDER;
  }
  const items = (criteria ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => CRITERIA_LINE_RE.test(line))
    .map((line) => `- [ ] ${line.replace(/^[-*]\s*/, '')}`);
  if (items.length === 0) {
    return PLAN_PLACEHOLDER;
  }
  return [
    '- [ ] 逐条落实下列判据并记录证据（命令与退出码）：',
    ...items,
  ].join('\n');
}

/** `## 目标与验收` 写实 → 原样作为计划「验收判据」（判据的唯一来源恒是需求正文） */
function buildCriteriaSection(bodyMd: string): string {
  const criteria = extractSection(bodyMd, '目标与验收');
  if (!isSectionFilled(criteria, { requireCriteria: true }).filled) {
    return PLAN_PLACEHOLDER;
  }
  return `${criteria!.trim()}\n\n- 验收取证：每条判据须附可复现命令与退出码；整体以 \`npx tsc --noEmit\` 与所属测试文件为准。`;
}

/** 偏差回写模板（格式写死，与需求级计划既有约定一致） */
function buildDeviationSection(): string {
  return [
    '- 执行中发现与本计划不符（行号错、机制不存在、任务需拆并）时，**必须**在本节追加一行，格式写死：',
    '  `- YYYY-MM-DD | 偏差事实（实测证据：文件:行号 / 命令输出） | 处理（新增/取消任务、判据变化） | 影响（验收取证路径是否变化）`',
    '- 本节不得用于记录「计划写过了」；无实际偏差时保持空模板。',
  ].join('\n');
}

/**
 * `## 不做清单` 占位（v1.6.5 / A74.4）：范围纪律小节，**不是写实判据**。
 * 写实由计划作者人工补；`isRequirementPlanFilled` 不查本节（防存量计划被误判为空壳）。
 */
function buildNotToDoSection(): string {
  return [
    '- （占位，不是写实判据）本计划**明确不做**的事（含被移出本批次的发散项）；防止范围在执行中膨胀。',
  ].join('\n');
}

/**
 * `## 允许改动` 占位（v1.6.5 / A74.4）：文件 / 目录白名单，**不是写实判据**。
 * 清单外文件属计划外改动，reviewer 直接打回（blocking REV）。
 */
function buildAllowedChangesSection(): string {
  return [
    '- （占位，不是写实判据）本计划允许改动的文件 / 目录白名单（逐条列出）；清单外文件属计划外改动，reviewer 直接打回。',
  ].join('\n');
}

/**
 * 生成需求级计划全文（纯读；零写盘）。
 *
 * 四节 + `## 变更记录`；内容一律从需求正文派生：
 * - `## 目标` ← `## 摘要`（未写实则占位）；
 * - `## 任务拆解` ← `## 目标与验收` 的判据行（逐条转可勾任务）；
 * - `## 验收判据` ← `## 目标与验收` 原文；
 * - `## 不做清单` / `## 允许改动` ← 范围纪律占位（v1.6.5 / A74.4，**不是写实判据**）；
 * - `## 偏差与回写` ← 固定回写格式模板。
 *
 * @param projectPath 项目根（相对路径按它解析）
 * @param seed 需求 ID / 标题
 * @param options `now`（变更记录时间）/ `by`（署名）
 */
export function buildRequirementPlanSkeleton(
  projectPath: string,
  seed: RequirementPlanSeed,
  options: Pick<WriteRequirementPlanOptions, 'now' | 'by'> = {},
): string {
  if (typeof seed.id !== 'string' || seed.id.trim() === '') {
    throw new RequirementPlanFileError('invalid_field', 'Requirement id is required');
  }
  const id = seed.id.trim();
  const title = typeof seed.title === 'string' && seed.title.trim() !== '' ? seed.title.trim() : id;
  const bodyMd = readBodyMarkdown(projectPath, id);
  const at = options.now !== undefined && options.now.trim() !== '' ? options.now.trim() : new Date().toISOString();
  const by = options.by !== undefined && options.by.trim() !== '' ? options.by.trim() : 'req plan';
  return [
    `# ${id} 计划：${title}`,
    '',
    '> 本文件由 `openfeel req plan` 依据需求正文机械生成（`lint fill --fix-plan` 同源）。**判据单点**：'
      + '`isRequirementPlanFilled`（`## 目标` / `## 任务拆解` / `## 验收判据` 三节写实）。',
    '',
    '## 目标',
    '',
    buildGoalSection(bodyMd, title),
    '',
    '## 任务拆解',
    '',
    buildTaskSection(bodyMd),
    '',
    '## 验收判据',
    '',
    buildCriteriaSection(bodyMd),
    '',
    '## 不做清单',
    '',
    buildNotToDoSection(),
    '',
    '## 允许改动',
    '',
    buildAllowedChangesSection(),
    '',
    '## 偏差与回写',
    '',
    buildDeviationSection(),
    '',
    '## 变更记录',
    '',
    `- ${at} 创建（${by}）`,
    '',
  ].join('\n');
}

/**
 * 写入需求级计划骨架（**唯一写入口**）。
 *
 * - 已存在且未 `force` → 抛 {@link RequirementPlanFileError} `exists`（**零写盘**）；
 * - `force` → 覆盖（`overwritten:true`，会冲掉手写内容，故只由显式 `--force` 触发）；
 * - 写后读回自检 `isRequirementPlanFilled`（结论进返回值 `filled`，不改变退出码）；
 * - 单次 `atomicWriteFileSync` 落盘（父目录按需 mkdir 幂等创建）。
 *
 * @param projectPath 项目根
 * @param seed 需求 ID / 标题
 * @param options `force` / `now` / `by`
 */
export function writeRequirementPlanSkeleton(
  projectPath: string,
  seed: RequirementPlanSeed,
  options: WriteRequirementPlanOptions = {},
): WriteRequirementPlanResult {
  const existingPath = findRequirementPlanPath(projectPath, seed.id);
  if (existingPath !== null && options.force !== true) {
    throw new RequirementPlanFileError(
      'exists',
      `Requirement plan already exists: ${existingPath}`,
      existingPath,
    );
  }
  const content = buildRequirementPlanSkeleton(projectPath, seed, options);
  // 路径单点：相对路径来自 `path.ts` 的 getRequirementPlanRelPath，绝对路径只由它 resolve 派生
  const relPath = getRequirementPlanRelPath(seed.id);
  const target = existingPath ?? resolve(projectPath, relPath);
  atomicWriteFileSync(target, content);
  const written = readFileSync(target, 'utf-8');
  return {
    path: relPath,
    created: existingPath === null,
    overwritten: existingPath !== null,
    lines: content.split(/\r?\n/).length,
    filled: isRequirementPlanFilled(written),
  };
}

/** 需求本体 → 计划种子（命令层便捷转换；只取两个字段，避免类型耦合） */
export function toRequirementPlanSeed(req: Pick<RequirementData, 'id' | 'title'>): RequirementPlanSeed {
  return { id: req.id, title: req.title };
}
