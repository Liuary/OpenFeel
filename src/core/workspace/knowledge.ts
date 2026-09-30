/**
 * 知识库核心模块
 * 管理 .openfeel/kb/ 目录，包含知识条目的增删查改、索引维护和解析。
 */
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { atomicWriteFileSync } from '../fs/atomic-write.js';
import { withFileLock, projectLockPath } from '../fs/file-lock.js';

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

/** 知识条目 */
export interface KnowledgeEntry {
  title: string;
  category: string;
  date: string; // YYYY-MM-DD
  content: string;
  enabled: boolean; // true = [+], false = [-]
}

/** 知识库索引 */
export interface KnowledgeIndex {
  categories: { name: string; description: string }[];
  recentUpdates: { date: string; category: string; title: string }[];
}

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

/** 4 个标准分类 */
const CATEGORIES = ['architecture', 'patterns', 'troubleshooting', 'setup'] as const;

/** 分类中文标题映射 */
const CATEGORY_TITLES: Record<string, string> = {
  architecture: '架构决策',
  patterns: '代码模式',
  troubleshooting: '常见问题',
  setup: '环境搭建',
};

/** index.md 模板 */
const INDEX_TEMPLATE = `# 知识库索引
> 项目知识库总索引

## 分类概览

| 分类 | 描述 |
|------|------|
| architecture | 架构决策、设计理由、技术选型 |
| patterns | 代码模式、项目约定、最佳实践 |
| troubleshooting | 常见问题、调试流程、已知坑位 |
| setup | 环境搭建、构建流程、依赖管理 |

## 最近更新

| 日期 | 分类 | 标题 |
|------|------|------|
`;

// ---------------------------------------------------------------------------
// 公开 API
// ---------------------------------------------------------------------------

/**
 * 初始化知识库目录结构
 * 在 .openfeel/kb/ 下创建 index.md 和 4 个分类文件。
 * 已存在的文件不覆盖（幂等）。
 * @returns 创建的文件路径列表
 */
export function initKnowledgeBase(projectPath: string): string[] {
  const kbDir = resolve(projectPath, '.openfeel', 'kb');
  const created: string[] = [];

  // 确保 kb 目录存在
  if (!existsSync(kbDir)) {
    mkdirSync(kbDir, { recursive: true });
    created.push('.openfeel/kb/');
  }

  // 创建 index.md（不覆盖已有）
  const indexPath = resolve(kbDir, 'index.md');
  if (!existsSync(indexPath)) {
    atomicWriteFileSync(indexPath, INDEX_TEMPLATE);
    created.push('.openfeel/kb/index.md');
  }

  // 创建分类文件（不覆盖已有）
  for (const cat of CATEGORIES) {
    const filePath = resolve(kbDir, `${cat}.md`);
    if (!existsSync(filePath)) {
      atomicWriteFileSync(filePath, `# ${CATEGORY_TITLES[cat]} (${cat})\n`);
      created.push(`.openfeel/kb/${cat}.md`);
    }
  }

  return created;
}

/**
 * 添加知识条目
 * 向分类文件追加条目，并同步更新 index.md 的"最近更新"表格。
 * 若 kb 目录不存在则自动初始化。
 * @throws {Error} 传入无效分类时抛出
 */
export function addKnowledgeEntry(
  projectPath: string,
  category: string,
  title: string,
  content: string,
): void {
  // 校验分类有效性
  if (!CATEGORIES.includes(category as (typeof CATEGORIES)[number])) {
    throw new Error(`无效分类 "${category}"，有效值：${CATEGORIES.join(', ')}`);
  }

  const kbDir = resolve(projectPath, '.openfeel', 'kb');

  // 自动初始化
  if (!existsSync(kbDir)) {
    initKnowledgeBase(projectPath);
  }

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  // 标题净化（T34）：'|' 转义避免污染 index.md 表格；换行折叠为空格避免破坏条目头/表格行
  const entryTitle = title.replace(/\|/g, '\\|').replace(/\s*[\r\n]+\s*/g, ' ').trim();
  const catPath = resolve(kbDir, `${category}.md`);
  const indexPath = resolve(kbDir, 'index.md');
  const entryText = `\n## [+] ${entryTitle} (${today})\n\n${content}\n`;

  const lockPath = projectLockPath(projectPath, 'kb');
  withFileLock(lockPath, () => {
    // 分类文件：读 → 拼接 → 原子写（替代 appendFileSync，避免半写）
    const catContent = existsSync(catPath) ? readFileSync(catPath, 'utf-8') : '';
    atomicWriteFileSync(catPath, catContent + entryText);

    // index.md：读 → 插入行 → 原子写
    if (!existsSync(indexPath)) {
      return; // index.md 不存在时跳过（与既有行为一致）
    }
    const indexContent = readFileSync(indexPath, 'utf-8');
    // N9-1：段头/列数宽容——定位「最近更新」段，并按实际表头列数生成分隔行（缺省 3 列，保持既有行为）
    const section = extractSection(indexContent, ['最近更新', 'Recent Updates']);
    if (section === null) {
      return; // 无「最近更新」段 → 不修改（与既有降级一致）
    }
    const { headers } = parseMarkdownTable(section.body);
    const cols = headers.length > 0 ? headers.length : 3;
    const sepLine = '|' + '------|'.repeat(cols);
    const cells = [today, category, entryTitle];
    while (cells.length < cols) {
      cells.push('');
    }
    const newRow = `| ${cells.slice(0, cols).join(' | ')} |`;

    const sepInBody = section.body.match(/^\|[\s:|-]+\|\s*$/m);
    if (sepInBody && sepInBody.index !== undefined) {
      // 已有分隔行：在其后插入数据行
      const insertPos = section.start + sepInBody.index + sepInBody[0].length;
      atomicWriteFileSync(indexPath, indexContent.slice(0, insertPos) + '\n' + newRow + indexContent.slice(insertPos));
      return;
    }
    // 无分隔行：按表头列数生成分隔行 + 数据行，插入到表头行之后
    const headerLine = section.body.split('\n').map((l) => l.trim()).find((l) => l.startsWith('|'));
    if (!headerLine) {
      return; // 无表头 → 不修改（降级）
    }
    const headerOffset = section.body.indexOf(headerLine);
    const insertPos = section.start + headerOffset + headerLine.length;
    atomicWriteFileSync(indexPath, indexContent.slice(0, insertPos) + '\n' + sepLine + '\n' + newRow + indexContent.slice(insertPos));
  });
}

/**
 * 列出知识条目
 * @param category 可选分类过滤；不传则返回所有分类的条目
 */
export function listKnowledge(projectPath: string, category?: string): KnowledgeEntry[] {
  const kbDir = resolve(projectPath, '.openfeel', 'kb');

  if (!existsSync(kbDir)) {
    return [];
  }

  const targetCategories = category ? [category] : [...CATEGORIES];
  const entries: KnowledgeEntry[] = [];

  for (const cat of targetCategories) {
    const filePath = resolve(kbDir, `${cat}.md`);
    if (!existsSync(filePath)) {
      continue;
    }
    const fileContent = readFileSync(filePath, 'utf-8');
    const parsed = parseEntryFile(fileContent, cat);
    entries.push(...parsed);
  }

  return entries;
}

/**
 * 全文搜索知识条目
 * 在 title 和 content 中进行不区分大小写的关键词搜索，并对匹配关键词用 ** 包裹高亮。
 * @param projectPath 项目路径
 * @param query 搜索关键词
 * @param limit 返回结果数量上限（默认 10）
 * @param offset 结果偏移量（默认 0）
 */
export function searchKnowledge(
  projectPath: string,
  query: string,
  limit: number = 10,
  offset: number = 0,
): KnowledgeEntry[] {
  const entries = listKnowledge(projectPath);
  const q = query.toLowerCase();

  const matched = entries.filter(
    (entry) =>
      entry.title.toLowerCase().includes(q) || entry.content.toLowerCase().includes(q),
  );

  // 对匹配结果高亮关键词（标题和内容摘要中用 ** 包裹）
  const highlighted = matched.map((entry) => highlightEntry(entry, q));

  // 分页截取
  return highlighted.slice(offset, offset + limit);
}

/**
 * 获取知识库索引
 * 从 index.md 解析分类概览和最近更新信息。
 * 若 kb 目录或 index.md 不存在，返回默认值（空结构）。
 */
export function getKnowledgeIndex(projectPath: string): KnowledgeIndex {
  const kbDir = resolve(projectPath, '.openfeel', 'kb');
  const indexPath = resolve(kbDir, 'index.md');

  // kb 目录或 index.md 不存在 → 返回默认值
  if (!existsSync(indexPath)) {
    return {
      categories: CATEGORIES.map((name) => ({
        name,
        description: CATEGORY_TITLES[name],
      })),
      recentUpdates: [],
    };
  }

  const content = readFileSync(indexPath, 'utf-8');

  return {
    categories: parseCategoriesTable(content),
    recentUpdates: parseRecentUpdatesTable(content),
  };
}

// ---------------------------------------------------------------------------
// 内部解析函数
// ---------------------------------------------------------------------------

/**
 * 高亮条目中的匹配关键词（不区分大小写）
 * 在标题和内容摘要中用 ** 包裹匹配词
 */
function highlightEntry(entry: KnowledgeEntry, query: string): KnowledgeEntry {
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escapedQuery})`, 'gi');

  return {
    ...entry,
    title: entry.title.replace(regex, '**$1**'),
    content: entry.content.replace(regex, '**$1**'),
  };
}

/**
 * 解析分类文件的条目
 * 条目头格式：## [+/-] Title (YYYY-MM-DD)
 * 条目内容为标题行之后到下一个 ## 或文件末尾之间的文本。
 */
function parseEntryFile(fileContent: string, category: string): KnowledgeEntry[] {
  const entries: KnowledgeEntry[] = [];
  const headerRegex = /^## (\[[+-]\]) (.+?) \((\d{4}-\d{2}-\d{2})\)$/gm;

  // 记录所有 ## 行的位置，用于判断条目内容的结束边界
  const headingStarts = [...fileContent.matchAll(/^## /gm)].map((m) => m.index);

  for (const match of fileContent.matchAll(headerRegex)) {
    const contentStart = match.index + match[0].length + 1; // +1 跳过标题行末尾的换行
    // 查找下一个 ## 标题行（跳过自身的标题）
    const nextHeading = headingStarts.find((idx) => idx > match.index);
    const contentEnd = nextHeading !== undefined ? nextHeading : fileContent.length;
    const content = fileContent.slice(contentStart, contentEnd).trim();

    entries.push({
      title: match[2].trim(),
      category,
      date: match[3],
      content,
      enabled: match[1] === '[+]',
    });
  }

  return entries;
}

/** 转义正则特殊字符 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 段落截取结果（body 为段头行之后到下一个 `^## ` 或文末；start 为 body 在原文中的起始偏移） */
interface Section {
  body: string;
  start: number;
}

/**
 * 段头宽容匹配（N9-1）：容忍前后空白与中英别名，截取「段头行 → 下一个 `^## ` 行或文末」。
 * @param content 全文
 * @param aliases 段头别名（如 ['分类概览', 'Categories', 'Category Overview']）
 * @returns 段落（body + 绝对起始偏移）；未命中返回 null
 */
function extractSection(content: string, aliases: string[]): Section | null {
  const aliasGroup = aliases.map((a) => escapeRegex(a)).join('|');
  const headerRegex = new RegExp(`^##\\s*(?:${aliasGroup})\\s*$`, 'im');
  const m = headerRegex.exec(content);
  if (!m || m.index === undefined) {
    return null;
  }
  const start = m.index + m[0].length;
  const rest = content.slice(start);
  const next = rest.search(/\n##\s/);
  return { body: next === -1 ? rest : rest.slice(0, next), start };
}

/** 将 markdown 表格文本解析为「表头 + 数据行」 */
function parseMarkdownTable(section: string): { headers: string[]; rows: string[][] } {
  const lines = section
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('|'));
  if (lines.length < 1) {
    return { headers: [], rows: [] };
  }
  const cells = (line: string): string[] =>
    line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

  const headers = cells(lines[0]);
  const rows: string[][] = [];
  for (let i = 1; i < lines.length; i++) {
    const cs = cells(lines[i]);
    // 跳过分隔行（--- / :--- 等）
    if (cs.every((c) => c === '' || /^:?-{2,}:?$/.test(c))) {
      continue;
    }
    rows.push(cs);
  }
  return { headers, rows };
}

/** 按表头别名定位列索引（先精确后包含匹配）；未命中返回 -1 */
function colIndex(headers: string[], aliases: string[]): number {
  const lower = headers.map((h) => h.toLowerCase());
  const aliasLower = aliases.map((a) => a.toLowerCase());
  for (let i = 0; i < lower.length; i++) {
    if (aliasLower.includes(lower[i])) {
      return i;
    }
  }
  for (let i = 0; i < lower.length; i++) {
    if (aliasLower.some((a) => lower[i].includes(a))) {
      return i;
    }
  }
  return -1;
}

/**
 * 从 index.md 中解析分类概览表格（N9-1：段头/表头/列数宽容）。
 * 无法识别表头 → 返回空数组（降级不抛错）。
 */
function parseCategoriesTable(content: string): { name: string; description: string }[] {
  const section = extractSection(content, ['分类概览', 'Categories', 'Category Overview']);
  if (section === null) {
    return [];
  }
  const { headers, rows } = parseMarkdownTable(section.body);
  if (headers.length === 0) {
    return [];
  }
  const nameIdx = colIndex(headers, ['分类', '名称', 'category', 'name']);
  const descIdx = colIndex(headers, ['描述', '说明', 'description']);
  if (nameIdx === -1) {
    return [];
  }
  return rows
    .map((r) => ({
      name: (r[nameIdx] ?? '').trim(),
      description: descIdx === -1 ? '' : (r[descIdx] ?? '').trim(),
    }))
    .filter((c) => c.name.length > 0);
}

/**
 * 从 index.md 中解析最近更新表格（N9-1：段头/表头/列数宽容）。
 * 无法识别表头 → 返回空数组（降级不抛错）。
 */
function parseRecentUpdatesTable(content: string): { date: string; category: string; title: string }[] {
  const section = extractSection(content, ['最近更新', 'Recent Updates']);
  if (section === null) {
    return [];
  }
  const { headers, rows } = parseMarkdownTable(section.body);
  if (headers.length === 0) {
    return [];
  }
  const dateIdx = colIndex(headers, ['日期', 'date']);
  const catIdx = colIndex(headers, ['分类', 'category']);
  const titleIdx = colIndex(headers, ['标题', 'title']);
  return rows.map((r) => ({
    date: dateIdx === -1 ? '' : (r[dateIdx] ?? '').trim(),
    category: catIdx === -1 ? '' : (r[catIdx] ?? '').trim(),
    title: titleIdx === -1 ? '' : (r[titleIdx] ?? '').trim(),
  }));
}
