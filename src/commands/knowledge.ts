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
      const entries = listKnowledge(process.cwd(), options.type);

      if (entries.length === 0) {
        console.log('暂无知识条目');
        return;
      }

      // 表格输出：分类 | 标题 | 日期 | 状态
      const headers = ['分类', '标题', '日期', '状态'];
      const rows = entries.map((e) => [
        e.category,
        e.title,
        e.date,
        e.enabled ? '启用' : '禁用',
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
      try {
        // 校验分类
        if (!VALID_CATEGORIES.includes(category)) {
          console.error(`错误：无效分类 "${category}"，有效值：${VALID_CATEGORIES.join(', ')}`);
          process.exit(1);
        }

        let content = options.content;

        // 未提供 --content 时尝试读取 stdin（管道模式）
        if (!content) {
          if (!process.stdin.isTTY) {
            content = await readStdin();
          } else {
            console.error('错误：请使用 --content 提供内容，或通过管道提供内容。');
            process.exit(1);
          }
        }

        // 内容不能为空
        if (!content || content.trim().length === 0) {
          console.error('错误：内容不能为空。');
          process.exit(1);
        }

        addKnowledgeEntry(process.cwd(), category, title, content.trim());
        console.log(`✓ 已添加知识条目: [${category}] ${title}`);
      } catch (err) {
        console.error(`错误：${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  // -----------------------------------------------------------------------
  // knowledge search <query>
  // -----------------------------------------------------------------------
  knowledge
    .command('search')
    .description('搜索知识库')
    .argument('<query>', '搜索关键词')
    .action((query: string) => {
      const entries = searchKnowledge(process.cwd(), query);

      if (entries.length === 0) {
        console.log(`未找到与 "${query}" 相关的知识条目。`);
        return;
      }

      console.log(`找到 ${entries.length} 条匹配:\n`);

      for (const entry of entries) {
        const status = entry.enabled ? '启用' : '禁用';
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
      const idx = getKnowledgeIndex(process.cwd());

      console.log('=== 分类概览 ===\n');
      if (idx.categories.length === 0) {
        console.log('（无分类）');
      } else {
        for (const cat of idx.categories) {
          console.log(`  ${cat.name.padEnd(20)} ${cat.description}`);
        }
      }

      console.log('\n=== 最近更新 ===\n');
      if (idx.recentUpdates.length === 0) {
        console.log('暂无更新记录。');
      } else {
        const headers = ['日期', '分类', '标题'];
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
