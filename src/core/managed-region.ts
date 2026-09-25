/**
 * 控制区标记工具
 * 按文件类型提供受管区（managed region）的识别 / 包裹 / 替换原语，
 * 供 openfeel update 三态部署使用：控制区标记包裹受管内容，更新只覆盖区内，
 * 区外用户内容天然保留（D3 落地）。
 *
 * 四策略：
 *  - markdown：<!-- openfeel:begin --> … <!-- openfeel:end -->
 *  - gitignore：# openfeel:begin … # openfeel:end
 *  - frontmatter：无标记，结构化字段合并（框架字段覆盖 + 用户字段 passthrough）
 *  - jsonc：无标记，深度合并（复用 opencode-config.ts，本模块仅分派）
 *
 * 与 openfeel:generated（单行整文件声明，构建产物）不冲突、不统一（N6）：
 * generated 是单行信号，begin/end 是成对区间，两者 token 与形态均不同。
 */
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

/** 受管文件类型（jsonc 仅作分派标记，合并逻辑在 opencode-config） */
export type ManagedFileType = 'markdown' | 'gitignore' | 'jsonc';

/** 标记 token（按类型） */
const MARKERS: Record<'markdown' | 'gitignore', { begin: string; end: string }> = {
  markdown: { begin: '<!-- openfeel:begin -->', end: '<!-- openfeel:end -->' },
  gitignore: { begin: '# openfeel:begin', end: '# openfeel:end' },
};

/** 控制区解析状态 */
export interface RegionParse {
  /** ok=恰好 1 对完整标记；none=无标记；malformed=begin/end 数量不等或 >1 对 */
  status: 'ok' | 'none' | 'malformed';
  /** 区内内容（status=ok 时；trim 后正文） */
  regionContent?: string;
}

/** 检测文件类型（.gitignore→gitignore；.jsonc→jsonc；其余→markdown；无法识别→null） */
export function detectFileType(filePath: string): ManagedFileType | null {
  const base = filePath.split(/[\\/]/).pop() ?? '';
  if (base === '.gitignore') return 'gitignore';
  if (base.endsWith('.jsonc')) return 'jsonc';
  if (base.endsWith('.md')) return 'markdown';
  return null;
}

/** 行尾归一化（CRLF / CR → LF，见 kb 行尾归一化模式）；导出供 update.ts skip 判定归一化比对（REV-1006） */
export function normalize(content: string): string {
  return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/** 取某类型的 begin/end 标记 token */
function markers(type: 'markdown' | 'gitignore'): { begin: string; end: string } {
  return MARKERS[type];
}

/**
 * 解析控制区：精确整行匹配 begin/end，计数判定 ok/none/malformed。
 * CRLF 归一化后匹配；>1 对或数量不等 → malformed（REV-908）。
 */
export function parseRegion(existing: string, type: 'markdown' | 'gitignore'): RegionParse {
  const { begin, end } = markers(type);
  const lines = normalize(existing).split('\n');
  let beginIndex = -1;
  let endIndex = -1;
  let beginCount = 0;
  let endCount = 0;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === begin) {
      if (beginIndex === -1) {
        beginIndex = i;
      }
      beginCount++;
    }
    if (trimmed === end) {
      endIndex = i;
      endCount++;
    }
  }
  if (beginCount === 0 && endCount === 0) {
    return { status: 'none' };
  }
  if (beginCount === 1 && endCount === 1 && beginIndex < endIndex) {
    return { status: 'ok', regionContent: lines.slice(beginIndex + 1, endIndex).join('\n').trim() };
  }
  return { status: 'malformed' };
}

/** 是否含完整成对标记（等价 parseRegion().status === 'ok'） */
export function hasRegion(existing: string, type: 'markdown' | 'gitignore'): boolean {
  return parseRegion(existing, type).status === 'ok';
}

/** 提取区内内容（trim 后正文）；无标记或异常 → null */
export function extractRegion(existing: string, type: 'markdown' | 'gitignore'): string | null {
  const r = parseRegion(existing, type);
  return r.status === 'ok' ? (r.regionContent ?? '') : null;
}

/**
 * 包裹内容为受管区（正文 trim 后包裹，输出末尾单换行）。
 * 产出格式：`{begin}\n{content}\n{end}\n`
 */
export function wrapRegion(content: string, type: 'markdown' | 'gitignore'): string {
  const { begin, end } = markers(type);
  return `${begin}\n${content.trim()}\n${end}\n`;
}

/**
 * 替换区内内容（保留区外，含标记行本身）；异常状态抛错由调用方决定降级。
 * 输出：begin 行之前的区外前缀 + 新包裹正文 + end 行之后的区外后缀。
 *
 * 区外逐字符保留（含原文件末尾换行），使 `replaceRegion(x, extractRegion(x))` 与
 * 归一化后的 x 完全一致，支撑 op-002 的 skip 判定（REV-901）。
 */
export function replaceRegion(existing: string, incoming: string, type: 'markdown' | 'gitignore'): string {
  // 防误用：先 parseRegion 判态，非 ok（none / malformed）直接抛错，避免调用方误删用户内容（REV-1007 修订）
  if (parseRegion(existing, type).status !== 'ok') {
    throw new Error('managed-region: replaceRegion 要求恰好一对完整标记（parseRegion status=ok）');
  }
  const { begin, end } = markers(type);
  const lines = normalize(existing).split('\n');
  let beginIndex = -1;
  let endIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t === begin && beginIndex === -1) {
      beginIndex = i;
    }
    if (t === end) {
      endIndex = i;
    }
  }
  // parseRegion 已保证 begin/end 存在且 begin 在前；此处为防御性兜底
  if (beginIndex === -1 || endIndex === -1 || beginIndex >= endIndex) {
    throw new Error('managed-region: replaceRegion 要求恰好一对完整标记');
  }
  // 前缀：begin 行之前的整行（原样保留），join 后补回被 split 去掉的行尾换行
  const prefixLines = lines.slice(0, beginIndex);
  const prefix = prefixLines.length > 0 ? prefixLines.join('\n') + '\n' : '';
  // 后缀：end 行之后的整行（原样保留，含原文件末尾换行，若有）
  const suffixLines = lines.slice(endIndex + 1);
  const suffix = suffixLines.join('\n');
  const wrapped = `${begin}\n${incoming.trim()}\n${end}`;
  // end 后存在后续行（含仅末尾空行）才补换行分隔；文件以 end 结尾且无尾换行时不追加，保证与 normalize 一致（REV-1102）
  return suffixLines.length > 0 ? prefix + wrapped + '\n' + suffix : prefix + wrapped;
}

/** frontmatter 与正文分割结果 */
export interface FrontmatterSplit {
  frontmatter: Record<string, unknown>; // 解析后的字段对象
  body: string;                          // frontmatter 之后的正文（原样，含首尾换行）
}

/**
 * 分割 YAML frontmatter 与正文。
 * 仅当文件以 `---\n` 开头且存在闭合 `---\n` 时返回解析结果；否则返回 null。
 * 解析失败（YAML 语法错误）→ 返回 null（调用方按「无 frontmatter」处理，降级不中断）。
 */
export function splitFrontmatter(content: string): FrontmatterSplit | null {
  const text = normalize(content);
  if (!text.startsWith('---\n')) {
    return null;
  }
  const end = text.indexOf('\n---\n', 3); // 从 3 开始：空 frontmatter（`---\n---\n`）的闭合 `\n` 在 index 3（REV-1005 修订）
  if (end === -1) {
    return null;
  }
  const fmRaw = text.slice(4, end);
  try {
    // 空 frontmatter（`---\n---\n`）：parseYaml('') 返回 null，需特判为空对象
    const parsed = fmRaw.trim() === '' ? {} : parseYaml(fmRaw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    return { frontmatter: parsed as Record<string, unknown>, body: text.slice(end + 5) }; // end+5 跳过 '\n---\n'
  } catch {
    // YAML 语法错误：视为无 frontmatter，降级不中断
    return null;
  }
}

/**
 * 合并 frontmatter（REV-904：字段级白名单，浅合并）。
 * incoming（框架模板字段）覆盖同名 existing 字段；existing 独有字段 passthrough 保留。
 */
export function mergeFrontmatter(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  return { ...existing, ...incoming };
}

/** 序列化 frontmatter 为 `---\n{...}\n---\n`（yaml.stringify 输出，显式保证末尾换行） */
export function serializeFrontmatter(frontmatter: Record<string, unknown>): string {
  // 显式保证 yaml 末尾换行，避免 stringify 无尾换行时与闭合 `---` 粘连（REV-1008 修订）
  const yaml = stringifyYaml(frontmatter);
  const body = yaml.endsWith('\n') ? yaml : yaml + '\n';
  return `---\n${body}---\n`;
}
