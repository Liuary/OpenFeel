/**
 * knowledge 命令组注册
 * openfeel knowledge list|add|search|index
 */
import { Command } from 'commander';
import {
  listKnowledge,
  addKnowledgeEntry,
  searchKnowledge,
  getKnowledgeIndex,
} from '../core/workspace/knowledge.js';
import type { KnowledgeEntry } from '../core/workspace/knowledge.js';
import { t, getCliLang } from '../core/i18n.js';

/** 有效分类列表 */
const VALID_CATEGORIES = ['architecture', 'patterns', 'troubleshooting', 'setup'];

export function registerKnowledgeCommand(program: Command): void {
  const knowledge = program
    .command('knowledge')
    .description('知识库管理');

  // -----------------------------------------------------------------------
  // knowledge list [--type <category>]
  // -----------------------------------------------------------------------
  knowledge
    .command('list')
    .description('列出知识条目')
    .option('--type <category>', '按分类过滤')
    .action((options: { type?: string }) => {
      const lang = getCliLang(process.cwd());
      const entries = listKnowledge(process.cwd(), options.type);

      if (entries.length === 0) {
        console.log(t('knowledge.list.empty', lang));
        return;
      }

      // 表格输出：分类 | 标题 | 日期 | 状态
      const headers = [
        t('knowledge.list.colCategory', lang),
        t('knowledge.list.colTitle', lang),
        t('knowledge.list.colDate', lang),
        t('common.status', lang),
      ];
      const rows = entries.map((e) => [
        e.category,
        e.title,
        e.date,
        e.enabled ? t('knowledge.list.enabled', lang) : t('knowledge.list.disabled', lang),
      ]);

      console.log(formatTable(rows, headers));
    });

  // -----------------------------------------------------------------------
  // knowledge add <category> <title> [--content "..."]
  // -----------------------------------------------------------------------
  knowledge
    .command('add')
    .description('添加知识条目')
    .argument('<category>', '分类（architecture | patterns | troubleshooting | setup）')
    .argument('<title>', '条目标题')
    .option('--content <text>', '条目内容（也可通过管道 stdin 传入）')
    .action(async (category: string, title: string, options: { content?: string }) => {
      const lang = getCliLang(process.cwd());
      try {
        // 校验分类
        if (!VALID_CATEGORIES.includes(category)) {
          console.error(t('knowledge.add.errorInvalidCategoryTmpl', lang, { category, valid: VALID_CATEGORIES.join(', ') }));
          process.exit(1);
        }

        let content = options.content;

        // 未提供 --content 时尝试读取 stdin（管道模式）
        if (!content) {
          if (!process.stdin.isTTY) {
            content = await readStdin();
          } else {
            console.error(t('knowledge.add.errorNoContent', lang));
            process.exit(1);
          }
        }

        // 内容不能为空
        if (!content || content.trim().length === 0) {
          console.error(t('knowledge.add.errorEmptyContent', lang));
          process.exit(1);
        }

        addKnowledgeEntry(process.cwd(), category, title, content.trim());
        console.log(t('knowledge.add.okTmpl', lang, { category, title }));
      } catch (err) {
        console.error(t('common.error', lang) + '：' + (err instanceof Error ? err.message : String(err)));
        process.exit(1);
      }
    });

  // -----------------------------------------------------------------------
  // knowledge search <query> [--limit <n>] [--offset <n>]
  // -----------------------------------------------------------------------
  knowledge
    .command('search')
    .description('搜索知识库')
    .argument('<query>', '搜索关键词')
    .option('--limit <n>', '返回结果数量上限（默认 10）', '10')
    .option('--offset <n>', '结果偏移量（默认 0）', '0')
    .action((query: string, options: { limit: string; offset: string }) => {
      const lang = getCliLang(process.cwd());
      const limit = Math.max(1, parseInt(options.limit, 10) || 10);
      const offset = Math.max(0, parseInt(options.offset, 10) || 0);
      const entries = searchKnowledge(process.cwd(), query, limit, offset);

      if (entries.length === 0) {
        console.log(t('knowledge.search.noResultsTmpl', lang, { query }));
        if (offset > 0) {
          console.log(t('knowledge.search.offsetOutOfBoundsTmpl', lang, { offset: String(offset) }));
        }
        return;
      }

      console.log(t('knowledge.search.foundTmpl', lang, { n: String(entries.length) }));

      for (const entry of entries) {
        const status = entry.enabled ? t('knowledge.list.enabled', lang) : t('knowledge.list.disabled', lang);
        console.log(`[${entry.category}] ${entry.title} (${entry.date}) [${status}]`);
        // 输出内容摘要（前 100 字）
        const summary = entry.content.length > 100
          ? entry.content.slice(0, 100) + '…'
          : entry.content;
        console.log(`  ${summary}`);
        console.log('');
      }
    });

  // -----------------------------------------------------------------------
  // knowledge index
  // -----------------------------------------------------------------------
  knowledge
    .command('index')
    .description('显示知识库索引概览')
    .action(() => {
      const lang = getCliLang(process.cwd());
      const idx = getKnowledgeIndex(process.cwd());

      console.log(t('knowledge.index.categoryOverview', lang));
      if (idx.categories.length === 0) {
        console.log(t('knowledge.index.noCategories', lang));
      } else {
        for (const cat of idx.categories) {
          console.log(`  ${cat.name.padEnd(20)} ${cat.description}`);
        }
      }

      console.log(`\n${t('knowledge.index.recentUpdates', lang)}\n`);
      if (idx.recentUpdates.length === 0) {
        console.log(t('knowledge.index.noUpdates', lang));
      } else {
        const headers = [
          t('knowledge.index.colDate', lang),
          t('knowledge.index.colCategory', lang),
          t('knowledge.index.colTitle', lang),
        ];
        const rows = idx.recentUpdates.map((u) => [u.date, u.category, u.title]);
        console.log(formatTable(rows, headers));
      }
    });
}

// ---------------------------------------------------------------------------
// 内部工具
// ---------------------------------------------------------------------------

/** 格式化文本表格 */
function formatTable(rows: string[][], headers: string[]): string {
  const allRows = [headers, ...rows];
  const colWidths = headers.map((_, ci) =>
    Math.max(...allRows.map((r) => (r[ci] ?? '').length)),
  );

  const headerRow = headers.map((h, i) => h.padEnd(colWidths[i])).join(' | ');
  const sep = colWidths.map((w) => '-'.repeat(w)).join('-+-');
  const dataRows = rows.map((r) =>
    r.map((c, i) => (c ?? '').padEnd(colWidths[i])).join(' | '),
  );

  return [headerRow, sep, ...dataRows].join('\n');
}

/** 从 stdin 读取全部内容 */
function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk: string) => {
      data += chunk;
    });
    process.stdin.on('end', () => {
      resolve(data.trim());
    });
    // 恢复 stdin（可能处于暂停状态）
    if (process.stdin.isPaused()) {
      process.stdin.resume();
    }
  });
}
