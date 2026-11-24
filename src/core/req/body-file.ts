/**
 * 需求正文文件原语 — 正文路径单点与骨架机械铺
 *
 * 职责：`.openfeel/requirements/REQ-NNN.md` 正文文件（人读副本）的路径派生与骨架写入。
 * 正交声明：路径全由 `projectPath` 参数传入，零全局路径依赖；不依赖归档层 / 不引用工作流模式字段。
 * 唯一 IO 点：骨架经 `atomicWriteFileSync` 落盘（目录按需 mkdir 幂等创建）。
 */
import { isAbsolute, join } from 'node:path';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { atomicWriteFileSync } from '../fs/atomic-write.js';
import type { RequirementData } from './types.js';

/**
 * 正文**元信息小节**（v1.6.0-stage-132 / T2）：由骨架机械维护 / 引擎追加，**禁止**经 `req body` 覆盖。
 * 业务小节（`摘要` / `目标与验收` / `问题` / `初步规划` / 自定义）才允许写入。
 */
export const PROTECTED_BODY_SECTIONS = ['状态', '预估版本', '父需求', '关联阶段', '变更记录'] as const;

/** 建议的业务小节（仅用于文案与文档；非法判定只看 {@link PROTECTED_BODY_SECTIONS} 与名称形态）。 */
export const EDITABLE_BODY_SECTIONS = ['摘要', '目标与验收', '问题', '初步规划'] as const;

/** 正文更新错误码（命令层据此映射 exit 1 / JSON legacy envelope） */
export type RequirementBodyUpdateErrorCode =
  | 'protected_section'  // 元信息小节不可写
  | 'empty_text'         // 正文为空（--text / --file 均为空）
  | 'invalid_field'      // 小节名非法 / --file 不可读 / 参数互斥
  | 'section_not_found'; // 小节不存在且禁止自动创建（内部 API 兜底）

/** 正文更新失败（携稳定错误码；命令层只做映射，零校验） */
export class RequirementBodyUpdateError extends Error {
  readonly code: RequirementBodyUpdateErrorCode;

  constructor(code: RequirementBodyUpdateErrorCode, message: string) {
    super(message);
    this.name = 'RequirementBodyUpdateError';
    this.code = code;
  }
}

/** {@link updateRequirementBody} 选项 */
export interface UpdateRequirementBodyOptions {
  /** `## ` 小节名（业务小节；元信息小节会被拒） */
  section: string;
  /** 小节正文（Markdown）；与 `file` 二选一 */
  text?: string;
  /** 从文件读取小节正文（相对路径按 projectPath 解析）；与 `text` 二选一 */
  file?: string;
  /** 追加到已有小节末尾（缺省替换整节） */
  append?: boolean;
  /** 替换整节（缺省；与 append 互斥） */
  replace?: boolean;
  /** 小节缺失时是否自动创建（缺省 false；`req body` 传 true） */
  createSectionIfMissing?: boolean;
  /** 变更记录署名（缺省 `cli`） */
  by?: string;
  /** 变更记录时间（ISO 8601；测试可注入，缺省当前时间） */
  now?: string;
}

/** {@link updateRequirementBody} 变更摘要 */
export interface UpdateRequirementBodyResult {
  /** 正文相对路径（POSIX，与 `req.body_path` 同口径） */
  path: string;
  /** 实际写入的小节名（原文标题） */
  section: string;
  /** 写入正文的行数 */
  lines: number;
  /** 是否新建了小节 */
  created: boolean;
}

/** 扫描出的正文小节范围（字符偏移；只用于**就地替换**，判定仍走 `filled.ts`） */
interface BodySectionSpan {
  name: string;
  level: 1 | 2;
  /** 标题行起始字符偏移 */
  headingStart: number;
  /** 标题行之后（下一行首）字符偏移 */
  contentStart: number;
  /** 下一个同级/更高级标题的起始偏移（无则文末） */
  contentEnd: number;
}

/** 标题行（与 `filled.ts` 的 `HEADING_RE` 同形：`###+` 属于小节正文，`#`/`##` 终止当前小节） */
const BODY_HEADING_RE = /^ {0,3}(#{1,2})[ \t]+(.*?)[ \t]*#*[ \t]*$/;

/** 小节名归一化（与 `filled.ts` 的 `normalizeSectionName` 同语义：忽略大小写与所有空白） */
function normalizeBodySectionName(name: string): string {
  return name.trim().replace(/\s+/g, '').toLowerCase();
}

/**
 * 扫描正文小节范围（纯函数；零 IO）。
 * 偏移按原始字符串计，保证「只替换目标节、其余字节不变」（含 CRLF 文件也只在目标区间内改写）。
 */
function scanBodySections(md: string): BodySectionSpan[] {
  const headings: Array<{ name: string; level: 1 | 2; headingStart: number; contentStart: number }> = [];
  let offset = 0;
  for (const rawLine of md.split('\n')) {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    const match = BODY_HEADING_RE.exec(line);
    if (match !== null) {
      const level = match[1].length === 1 ? 1 : 2;
      headings.push({
        name: match[2].trim(),
        level,
        headingStart: offset,
        contentStart: Math.min(offset + rawLine.length + 1, md.length),
      });
    }
    offset += rawLine.length + 1;
  }
  const spans: BodySectionSpan[] = [];
  for (let i = 0; i < headings.length; i += 1) {
    const heading = headings[i];
    if (heading.level !== 2) { continue; }   // 一级标题只作为终止边界
    const next = headings[i + 1];
    spans.push({
      name: heading.name,
      level: 2,
      headingStart: heading.headingStart,
      contentStart: heading.contentStart,
      contentEnd: next !== undefined ? next.headingStart : md.length,
    });
  }
  return spans;
}

/**
 * 解析正文小节（`## 标题` → 去首尾空白后的正文）。
 * 与 `filled.ts` 的 `parseMarkdownSections` 同语义，但这里额外保留范围供**就地替换**使用；
 * 写实性判定（占位/字数/判据行）一律复用 `filled.ts`，本文件不复制任何占位规则。
 */
export function parseBodySections(md: string): Array<{ name: string; body: string }> {
  return scanBodySections(md).map((span) => ({
    name: span.name,
    body: md.slice(span.contentStart, span.contentEnd).trim(),
  }));
}

/** 查找小节范围（名称宽容比较；命中第一个） */
function findBodySection(md: string, name: string): BodySectionSpan | undefined {
  const target = normalizeBodySectionName(name);
  return scanBodySections(md).find((span) => normalizeBodySectionName(span.name) === target);
}

/** 业务小节名是否合法（非空 / 无换行 / 不以 # 开头 / 长度上限） */
function isValidSectionName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed !== '' && trimmed.length <= 100 && !/[\r\n]/.test(trimmed) && !trimmed.startsWith('#');
}

/** 是否元信息小节（受保护，禁止写入） */
export function isProtectedBodySection(name: string): boolean {
  const target = normalizeBodySectionName(name);
  return PROTECTED_BODY_SECTIONS.some((section) => normalizeBodySectionName(section) === target);
}

/** 计算「`## 标题` + 正文」区块（保持骨架的空白约定：标题后空行、正文后空行） */
function buildSectionBlock(body: string, isLast: boolean): string {
  return isLast ? `\n${body}\n` : `\n${body}\n\n`;
}

/** 在文末追加新区块（缺尾部换行时补齐，不制造连续空行） */
function appendSectionAtEnd(md: string, block: string): string {
  const prefix = md === '' || md.endsWith('\n\n') ? '' : (md.endsWith('\n') ? '\n' : '\n\n');
  return `${md}${prefix}${block}`;
}

/** 写入业务小节（replace/append）；返回更新后的全文与是否新建 */
function applyBodySectionUpdate(
  md: string,
  name: string,
  body: string,
  append: boolean,
  createSectionIfMissing: boolean,
): { md: string; created: boolean } {
  const span = findBodySection(md, name);
  if (span === undefined) {
    if (!createSectionIfMissing) {
      throw new RequirementBodyUpdateError('section_not_found', `Section not found: ${name}`);
    }
    // 新业务小节插在 `## 变更记录`（元信息）之前；无该节则追加到文末
    const changeLog = findBodySection(md, '变更记录');
    const block = `## ${name.trim()}\n\n${body}\n\n`;
    if (changeLog !== undefined) {
      return { md: md.slice(0, changeLog.headingStart) + block + md.slice(changeLog.headingStart), created: true };
    }
    return { md: appendSectionAtEnd(md, block), created: true };
  }
  const current = md.slice(span.contentStart, span.contentEnd).trim();
  const nextBody = append && current !== '' ? `${current}\n\n${body}` : body;
  const block = buildSectionBlock(nextBody, span.contentEnd === md.length);
  return { md: md.slice(0, span.contentStart) + block + md.slice(span.contentEnd), created: false };
}

/** 在 `## 变更记录` 末尾追加一行（该节受保护：只追加、不覆盖） */
function appendBodyChangeLog(md: string, line: string): string {
  const span = findBodySection(md, '变更记录');
  if (span === undefined) {
    return appendSectionAtEnd(md, `## 变更记录\n\n${line}\n\n`);
  }
  const current = md.slice(span.contentStart, span.contentEnd).trim();
  const nextBody = current === '' ? line : `${current}\n${line}`;
  const block = buildSectionBlock(nextBody, span.contentEnd === md.length);
  return md.slice(0, span.contentStart) + block + md.slice(span.contentEnd);
}

/** 读取 `--file` 正文（相对路径按 projectPath 解析；不可读 → invalid_field） */
function readBodyTextFile(projectPath: string, file: string): string {
  const absolute = isAbsolute(file) ? file : join(projectPath, file);
  try {
    return readFileSync(absolute, 'utf-8');
  } catch {
    throw new RequirementBodyUpdateError('invalid_field', `Body file is not readable: ${absolute}`);
  }
}

/**
 * 需求正文**唯一更新入口**（v1.6.0-stage-132 / T2）。
 *
 * - 只写业务小节：`摘要` / `目标与验收` / `问题` / `初步规划` / 自定义小节；
 *   元信息小节（{@link PROTECTED_BODY_SECTIONS}）与头部说明行**永不被覆盖**；
 * - `append` 追加到小节末尾，缺省（`replace`）替换整节；
 * - 每次写入在 `## 变更记录` 追加 `- <ISO> body:<section> 更新（<by>）`；
 * - 单次 `atomicWriteFileSync` 落盘（目标区间之外字节不变）；
 * - 正文文件缺失时按骨架渲染后写入（不覆盖既有文件）。
 */
export function updateRequirementBody(
  projectPath: string,
  req: RequirementData,
  options: UpdateRequirementBodyOptions,
): UpdateRequirementBodyResult {
  const section = typeof options.section === 'string' ? options.section.trim() : '';
  if (!isValidSectionName(section)) {
    throw new RequirementBodyUpdateError('invalid_field', 'Invalid section name');
  }
  if (isProtectedBodySection(section)) {
    throw new RequirementBodyUpdateError('protected_section', `Protected section: ${section}`);
  }
  if (options.append === true && options.replace === true) {
    throw new RequirementBodyUpdateError('invalid_field', 'append and replace are mutually exclusive');
  }
  if (options.text !== undefined && options.file !== undefined) {
    throw new RequirementBodyUpdateError('invalid_field', 'text and file are mutually exclusive');
  }
  const raw = options.text !== undefined
    ? options.text
    : (options.file !== undefined ? readBodyTextFile(projectPath, options.file) : '');
  const body = raw.trim();
  if (body === '') {
    throw new RequirementBodyUpdateError('empty_text', 'Section body is empty');
  }

  const filePath = getRequirementBodyPath(projectPath, req.id);
  mkdirSync(getRequirementsDir(projectPath), { recursive: true });
  const base = existsSync(filePath) ? readFileSync(filePath, 'utf-8') : renderRequirementBodySkeleton(req);

  const updated = applyBodySectionUpdate(base, section, body, options.append === true, options.createSectionIfMissing === true);
  const by = options.by !== undefined && options.by.trim() !== '' ? options.by.trim() : 'cli';
  const at = options.now !== undefined && options.now.trim() !== '' ? options.now.trim() : new Date().toISOString();
  const withLog = appendBodyChangeLog(updated.md, `- ${at} body:${section} 更新（${by}）`);
  atomicWriteFileSync(filePath, withLog);

  return {
    path: getRequirementBodyRelPath(req.id),
    section,
    lines: body.split(/\r?\n/).length,
    created: updated.created,
  };
}

/** 需求正文目录：{projectPath}/.openfeel/requirements（**不纳入 WORKSPACE_DIRS**，按需 mkdir 幂等创建——与归档目录同口径） */
export function getRequirementsDir(projectPath: string): string {
  return join(projectPath, '.openfeel', 'requirements');
}

/** 正文**存储**相对路径（恒 POSIX 正斜杠，跨平台一致；禁 path.join——Windows 产反斜杠） */
export function getRequirementBodyRelPath(id: string): string {
  return `.openfeel/requirements/${id}.md`;
}

/** 正文**文件系统**路径（单点；FS 访问用原生分隔符） */
export function getRequirementBodyPath(projectPath: string, id: string): string {
  return join(getRequirementsDir(projectPath), `${id}.md`);
}

/**
 * 渲染需求正文骨架（裁定 6 模板逐字）。
 * 状态取当前值（参数化：req add 恒 draft；req split 子需求初值 scheduled）；`target_version` 缺省渲染为 `（未指定）`。
 */
function renderRequirementBodySkeleton(req: RequirementData): string {
  const targetVersion = req.target_version !== undefined && req.target_version !== ''
    ? req.target_version
    : '（未指定）';
  return [
    `# ${req.id}：${req.title}`,
    '',
    '> 本文件为需求正文（人读副本，由 openfeel req 机械铺骨架）。**机读权威恒为 `.openfeel/flow.json` 的 `requirements` 条目**；两者不一致时以 flow.json 为准。下方状态为创建时快照，不追写实时状态。',
    '',
    '## 状态',
    '',
    `${req.status}（创建时快照；以 flow.json 为准）`,
    '',
    '## 摘要',
    '',
    '（待补充）',
    '',
    '## 目标与验收',
    '',
    '（待补充）',
    '',
    '## 预估版本',
    '',
    targetVersion,
    '',
    '## 父需求',
    '',
    req.parent_id ?? '（无）',
    '',
    '## 关联阶段',
    '',
    '（以 flow.json 的 `stages[*].requirements[]` 为准——阶段可挂多个需求；旧单值 `requirement_id` 仅兼容读取；此处可人工补充说明）',
    '',
    '## 变更记录',
    '',
    `- ${req.created_at} 创建（${req.id}，初始状态 ${req.status}）`,
    '',
  ].join('\n');
}

/**
 * 机械铺需求正文骨架（人读副本）。
 * - mkdir 幂等；atomicWriteFileSync（backup 缺省 false）
 * - 目标文件已存在 → **no-op 不覆盖**（保留人工补充内容）
 * - 恒将 req.body_path 设为本函数单点派生的 POSIX 相对路径（传入须为 addRequirement 返回的本体）
 * @returns 目标文件的绝对路径
 */
export function writeRequirementBodySkeleton(projectPath: string, req: RequirementData): string {
  const dir = getRequirementsDir(projectPath);
  mkdirSync(dir, { recursive: true });                       // 幂等
  const filePath = getRequirementBodyPath(projectPath, req.id);
  req.body_path = getRequirementBodyRelPath(req.id);         // 单点赋值（no-op 路径亦保证一致）
  if (existsSync(filePath)) { return filePath; }             // 已存在 → 不覆盖
  atomicWriteFileSync(filePath, renderRequirementBodySkeleton(req));
  return filePath;
}
