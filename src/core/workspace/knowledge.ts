/**
 * 知识库核心模块
 * 管理 .openfeel/kb/ 目录，包含知识条目的增删查改、索引维护和解析。
 */
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

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
    writeFileSync(indexPath, INDEX_TEMPLATE, 'utf-8');
    created.push('.openfeel/kb/index.md');
  }

  // 创建分类文件（不覆盖已有）
  for (const cat of CATEGORIES) {
    const filePath = resolve(kbDir, `${cat}.md`);
    if (!existsSync(filePath)) {
      writeFileSync(filePath, `# ${CATEGORY_TITLES[cat]} (${cat})\n`, 'utf-8');
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

  // 追加条目到分类文件
  const catPath = resolve(kbDir, `${category}.md`);
  const entryText = `\n## [+] ${title} (${today})\n\n${content}\n`;
  appendFileSync(catPath, entryText, 'utf-8');

  // 更新 index.md 的"最近更新"表格（在表头分隔行后插入新行）
  const indexPath = resolve(kbDir, 'index.md');
  let indexContent = readFileSync(indexPath, 'utf-8');
  const sepLine = '|------|------|------|';
  const sepIdx = indexContent.indexOf(sepLine);
  if (sepIdx !== -1) {
    const insertPos = sepIdx + sepLine.length;
    const newRow = `| ${today} | ${category} | ${title} |`;
    indexContent = indexContent.slice(0, insertPos) + '\n' + newRow + indexContent.slice(insertPos);
    writeFileSync(indexPath, indexContent, 'utf-8');
  }
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
 * 在 title 和 content 中进行不区分大小写的关键词搜索。
 */
export function searchKnowledge(projectPath: string, query: string): KnowledgeEntry[] {
  const entries = listKnowledge(projectPath);
  const q = query.toLowerCase();

  return entries.filter(
    (entry) =>
      entry.title.toLowerCase().includes(q) || entry.content.toLowerCase().includes(q),
  );
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

/**
 * 从 index.md 中解析分类概览表格
 */
function parseCategoriesTable(content: string): { name: string; description: string }[] {
  const section = content.match(/## 分类概览\n\n([\s\S]*?)(?=\n## |$)/);
  if (!section) {
    return [];
  }

  const rows = [...section[1].matchAll(/\| ([a-z_]+) \| ([^|]+) \|/g)];
  return rows.map((r) => ({ name: r[1].trim(), description: r[2].trim() }));
}

/**
 * 从 index.md 中解析最近更新表格
 */
function parseRecentUpdatesTable(content: string): { date: string; category: string; title: string }[] {
  const section = content.match(/## 最近更新\n\n([\s\S]*?)(?=\n## |$)/);
  if (!section) {
    return [];
  }

  const rows = [...section[1].matchAll(/\| (\d{4}-\d{2}-\d{2}) \| ([a-z_]+) \| ([^|]+) \|/g)];
  return rows.map((r) => ({ date: r[1], category: r[2].trim(), title: r[3].trim() }));
}
