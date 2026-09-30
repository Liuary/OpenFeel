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
import { resolve } from 'node:path';
import { findSimilarEntries } from '../utils/kb-dedup.js';

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
        console.error(t('common.errorTmpl', lang, { msg: err instanceof Error ? err.message : String(err) }));
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

  // -----------------------------------------------------------------------
  // knowledge dedup [content] [--project <path>] [--category <name>] [--threshold <n>]
  // -----------------------------------------------------------------------
  knowledge
    .command('dedup [content]')
    .description('检索相似知识条目（只读建议，不修改 kb）')
    .option('--project <path>', '目标项目根路径（默认当前目录）')
    .option('--category <name>', '仅检查指定分类（architecture|patterns|troubleshooting|setup）')
    .option('--threshold <n>', '相似度阈值 0~1（默认 0.8）')
    .action(async (content: string | undefined, options: { project?: string; category?: string; threshold?: string }) => {
      const lang = getCliLang(process.cwd());
      const projectPath = options.project ?? process.cwd();

      // 阈值校验（0~1）
      const threshold = options.threshold === undefined ? 0.8 : Number(options.threshold);
      if (options.threshold !== undefined && (Number.isNaN(threshold) || threshold < 0 || threshold > 1)) {
        console.error(t('knowledge.dedup.invalidThresholdTmpl', lang, { value: options.threshold }));
        process.exit(1);
        return;
      }

      // 分类校验
      let categories: string[];
      if (options.category !== undefined) {
        if (!VALID_CATEGORIES.includes(options.category)) {
          console.error(t('knowledge.dedup.invalidCategoryTmpl', lang, {
            value: options.category,
            allowed: VALID_CATEGORIES.join(' | '),
          }));
          process.exit(1);
          return;
        }
        categories = [options.category];
      } else {
        categories = [...VALID_CATEGORIES];
      }

      // 内容来源：位置参数 或 stdin（二者至少其一）
      let text = content;
      if (text === undefined && !process.stdin.isTTY) {
        text = await readStdin();
      }
      if (!text || text.trim().length === 0) {
        console.error(t('knowledge.dedup.noContentTmpl', lang));
        process.exit(1);
        return;
      }

      // 跨阶段契约：命令层只计算 basePath 并传参（禁自行解析路径规则）
      const basePath = resolve(projectPath, '.openfeel', 'kb');

      console.log(t('knowledge.dedup.title', lang));
      let found = false;
      for (const cat of categories) {
        const results = findSimilarEntries(text.trim(), cat, basePath);
        for (const r of results) {
          if (r.similarity <= 0) {
            continue;
          }
          found = true;
          const pct = (r.similarity * 100).toFixed(1);
          const flag = r.similarity > threshold ? ' ' + t('knowledge.dedup.suggestFlag', lang) : '';
          console.log(t('knowledge.dedup.itemTmpl', lang, { category: cat, title: r.entry.title, pct, flag }));
        }
      }
      if (!found) {
        console.log(t('knowledge.dedup.noneTmpl', lang, { threshold: String(threshold) }));
      }
      // 只读声明（固定行）
      console.log(t('knowledge.dedup.readOnlyNote', lang));
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
