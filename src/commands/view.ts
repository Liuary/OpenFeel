/**
 * view 命令组注册
 * openfeel view list|add|accept  — 审查条目管理（Reviewer 操作）
 */
import { Command } from 'commander';
import { createReviewEntry, listReviews, acceptReview } from '../core/view/entry.js';

export function registerViewCommand(program: Command): void {
  const view = program
    .command('view')
    .description('审查条目管理');

  // view list [--op <id>] — 列出审查条目
  view
    .command('list')
    .description('列出审查条目')
    .option('--op <id>', '按操作 ID 过滤')
    .action((options: { op?: string }) => {
      try {
        const items = listReviews(process.cwd(), options.op);

        if (items.length === 0) {
          console.log('暂无审查条目');
          return;
        }

        for (const item of items) {
          console.log(`${item.id} [${item.status}] ${item.priority} — ${item.title}`);
          console.log(`  操作: ${item.op}  提交人: ${item.filed_by}  时间: ${item.filed_at}`);
        }
      } catch (err) {
        console.error(`错误：${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  // view add --op <id> --title "..." [--priority high|medium|low]
  view
    .command('add')
    .description('添加审查条目')
    .requiredOption('--op <id>', '操作 ID（如 stage-01.op-001）')
    .requiredOption('--title <title>', '审查标题')
    .option('--priority <priority>', '优先级（high/medium/low，默认 medium）', 'medium')
    .action((options: { op: string; title: string; priority: string }) => {
      try {
        // 校验 priority 值有效性
        const validPriorities = ['high', 'medium', 'low'];
        if (!validPriorities.includes(options.priority)) {
          console.error(`错误：无效的优先级 "${options.priority}"，可选值：high / medium / low`);
          process.exit(1);
        }

        const review = createReviewEntry(
          process.cwd(),
          options.op,
          options.title,
          options.priority as 'high' | 'medium' | 'low',
        );

        console.log(`✓ 审查条目已添加: ${review.id} (${review.op}) — ${review.title}`);
      } catch (err) {
        console.error(`错误：${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  // view accept <rev-id>
  view
    .command('accept')
    .description('验收审查条目（标记为 closed）')
    .argument('<rev-id>', '审查条目 ID（如 REV-001）')
    .action((revId: string) => {
      try {
        const review = acceptReview(process.cwd(), revId);

        if (review) {
          console.log(`✓ 审查条目已验收: ${review.id} → closed`);
        } else {
          console.error(`错误：未找到审查条目 ${revId}`);
          process.exit(1);
        }
      } catch (err) {
        console.error(`错误：${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });
}
