/**
 * 知识库去重模块
 * 归档前检索现有条目，相似度 > 80% 时执行更新而非新增，避免 kb/ 中产生重复条目。
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/** 知识库单条条目 */
export interface KbEntry {
  /** 标题（不含 [+] / [-] 前缀和日期） */
  title: string;
  /** 日期字符串，如 "2026-06-27" */
  date: string;
  /** 启禁标记：+ 表示启用，- 表示禁用 */
  status: '+' | '-';
  /** 条目的正文内容（不含标题行和状态标记，含代码块和空行） */
  content: string;
  /** 原始标题行（如 "## [+] 标题 (日期)"），用于重建条目 */
  rawLine: string;
}

/** 相似度计算结果 */
export interface SimilarityResult {
  /** 匹配到的现有条目 */
  entry: KbEntry;
  /** Jaccard 相似度（0.0 ~ 1.0） */
  similarity: number;
}

/** 相似度阈值，超过此值视为重复 */
const SIMILARITY_THRESHOLD = 0.8;

/** 知识库分类文件所在的基础目录 */
const KB_BASE_DIR = resolve('.openfeel/kb');

/** 分类名 → 文件名映射 */
const CATEGORY_FILES: Record<string, string> = {
  architecture: 'architecture.md',
  patterns: 'patterns.md',
  troubleshooting: 'troubleshooting.md',
  setup: 'setup.md',
};

/**
 * 读取知识库分类文件并解析为 KbEntry 列表。
 * 分类文件按 `## ` 开头的标题行分割条目，每条目以 `## [+/-] 标题 (日期)` 格式开头。
 *
 * @param filePath - 分类文件的绝对路径
 * @returns 解析出的条目列表，文件不存在时返回空数组
 */
function parseKbFile(filePath: string): KbEntry[] {
  if (!existsSync(filePath)) {
    return [];
  }

  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const entries: KbEntry[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // 匹配 ## [+] / ## [-] 开头的标题行
    const headerMatch = line.match(/^##\s+\[([+-])\]\s+(.+?)\s+\((\d{4}-\d{2}-\d{2})\)$/);
    if (headerMatch === null) {
      i++;
      continue;
    }

    const status = headerMatch[1] as '+' | '-';
    const title = headerMatch[2];
    const date = headerMatch[3];

    // 收集条目正文（从下一行到下一个 ## 或文件末尾）
    const bodyLines: string[] = [];
    let j = i + 1;
    while (j < lines.length && !lines[j].startsWith('## ')) {
      bodyLines.push(lines[j]);
      j++;
    }

    const entry: KbEntry = {
      title,
      date,
      status,
      content: bodyLines.join('\n').trim(),
      rawLine: line,
    };

    entries.push(entry);
    i = j; // 跳到下一个条目起始行
  }

  return entries;
}

/**
 * 对文本做词袋分词，用于 Jaccard 相似度计算。
 * 分词策略：按空白字符和常见标点切分，过滤空 token 和纯标点 token。
 * [+] / [-] 标记不参与相似度计算（避免禁用标记变化影响匹配）。
 *
 * @param text - 待分词的文本
 * @returns 去重后的 token 集合
 */
function tokenize(text: string): Set<string> {
  // 去除行首的 [+] / [-] 标记（如 "## [+]" 中的状态标记）
  const cleaned = text.replace(/^\[[+-]\](?!\s*\()/gm, '');
  // 按空白和标点切分，保留中英文词汇
  const tokens = cleaned
    .toLowerCase()
    .split(/[\s,，。.、；;：:！!？?（）()【】\[\]{}""''""\/\\|@#$%^&*+=~`<>]+/)
    .filter(t => t.length > 0 && /[\w\u4e00-\u9fff]/.test(t));
  return new Set(tokens);
}

/**
 * 计算两个词袋之间的 Jaccard 相似度。
 * 公式：|A∩B| / |A∪B|
 *
 * @param tokensA - 文本 A 的词袋
 * @param tokensB - 文本 B 的词袋
 * @returns 0.0 到 1.0 之间的相似度值
 */
function jaccardSimilarity(tokensA: Set<string>, tokensB: Set<string>): number {
  // 两个空文本时视为完全相同
  if (tokensA.size === 0 && tokensB.size === 0) {
    return 1.0;
  }

  // 计算交集大小
  let intersection = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) {
      intersection++;
    }
  }

  // 计算并集大小
  const union = tokensA.size + tokensB.size - intersection;

  if (union === 0) {
    return 0.0;
  }

  return intersection / union;
}

/**
 * 在指定分类中查找与新内容相似的现有条目。
 * 遍历分类文件中的所有条目，对每条条目计算 Jaccard 相似度。
 *
 * @param target - 新待归档的内容文本
 * @param category - 知识库分类名（architecture | patterns | troubleshooting | setup）
 * @returns 相似度 > 0 的条目列表，按相似度降序排列
 */
export function findSimilarEntries(target: string, category: string): SimilarityResult[] {
  const fileName = CATEGORY_FILES[category];
  if (fileName === undefined) {
    return [];
  }

  const filePath = resolve(KB_BASE_DIR, fileName);
  const existingEntries = parseKbFile(filePath);

  if (existingEntries.length === 0) {
    return [];
  }

  const targetTokens = tokenize(target);

  const results: SimilarityResult[] = [];
  for (const entry of existingEntries) {
    const entryTokens = tokenize(entry.content);
    const similarity = jaccardSimilarity(targetTokens, entryTokens);
    if (similarity > 0) {
      results.push({ entry, similarity });
    }
  }

  // 按相似度降序排列
  results.sort((a, b) => b.similarity - a.similarity);
  return results;
}

/**
 * 判断相似度是否达到更新阈值（> 0.8）。
 *
 * @param similarity - Jaccard 相似度值
 * @returns 相似度 > 0.8 时返回 true，否则返回 false
 */
export function shouldUpdate(similarity: number): boolean {
  return similarity > SIMILARITY_THRESHOLD;
}

/**
 * 合并新旧条目内容。
 * 保留原有 `[+]` / `[-]` 标记和日期信息，新内容以「更新于」块追加到条目末尾。
 *
 * @param existing - 已有的知识库条目
 * @param newContent - 新的待合并内容
 * @returns 合并后的条目（日期和标记来自原条目，内容为原文 + 更新块）
 */
export function mergeEntry(existing: KbEntry, newContent: string): KbEntry {
  const today = new Date().toISOString().slice(0, 10);
  const trimmedNew = newContent.trim();

  // 如果新内容与原内容完全一致，不做无意义追加
  if (trimmedNew === existing.content.trim()) {
    return { ...existing };
  }

  const updateNote = `\n\n> **更新于 ${today}**：${trimmedNew}`;

  return {
    ...existing,
    content: existing.content + updateNote,
  };
}
