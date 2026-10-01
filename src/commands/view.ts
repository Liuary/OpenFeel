/**
 * view 命令组注册
 * openfeel view list|accept  — 审查条目管理（openfeel-reviewer 操作）
 */
import { Command } from 'commander';
import { listReviews, acceptReview } from '../core/view/entry.js';
import { normalizeAgentName } from '../core/flow-manager.js';
import { t, getCliLang } from '../core/i18n.js';

export function registerViewCommand(program: Command): void {
  const view = program
    .command('view')
    .description('审查条目管理')
    // N2-3：审查条目管理的唯一入口指引（本组不新增 update/remove，避免第二套实现）
    .addHelpText('after', '\n' + t('help.view.note', getCliLang(process.cwd())) + '\n');

  // view list [--op <id>] — 列出审查条目
  view
    .command('list')
    .description('列出审查条目')
    .option('--op <id>', '按操作 ID 过滤')
    .action((options: { op?: string }) => {
      const lang = getCliLang(process.cwd());
      try {
        const items = listReviews(process.cwd(), options.op);

        if (items.length === 0) {
          console.log(t('view.list.empty', lang));
          return;
        }

        for (const item of items) {
          console.log(`${item.id} [${item.status}] ${item.priority} — ${item.title}`);
          console.log(`  ${t('common.op', lang)}: ${item.op}  ${t('view.list.filedBy', lang)}: ${normalizeAgentName(item.filed_by)}  ${t('view.list.filedAt', lang)}: ${item.filed_at}`);
        }
      } catch (err) {
        console.error(t('common.errorTmpl', lang, { msg: err instanceof Error ? err.message : String(err) }));
        process.exit(1);
      }
    });

  // view accept <rev-id>
  view
    .command('accept')
    .description('验收审查条目（标记为 closed）')
    .argument('<rev-id>', '审查条目 ID（如 REV-001）')
    .action((revId: string) => {
      const lang = getCliLang(process.cwd());
      try {
        const review = acceptReview(process.cwd(), revId);

        if (review) {
          console.log(t('view.accept.okTmpl', lang, { id: review.id }));
        } else {
          console.error(t('view.accept.errorNotFoundTmpl', lang, { id: revId }));
          process.exit(1);
        }
      } catch (err) {
        console.error(t('common.errorTmpl', lang, { msg: err instanceof Error ? err.message : String(err) }));
        process.exit(1);
      }
    });
}
