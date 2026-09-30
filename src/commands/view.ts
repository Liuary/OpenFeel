/**
 * view 命令组注册
 * openfeel view list|add|accept  — 审查条目管理（openfeel-reviewer 操作）
 */
import { Command } from 'commander';
import { addReviewEntry, listReviews, acceptReview } from '../core/view/entry.js';
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

  // view add --op <id> --title "..." [--priority high|medium|low]（已弃用；请改用 flow review add）
  view
    .command('add')
    // N2-4：弃用文案单键化——此处为字面默认值，zh/en 两模式均由 help.view.add 统一覆盖
    .description('添加审查条目（已弃用；请改用 openfeel flow review add）')
    .requiredOption('--op <id>', '操作 ID（如 stage-01.op-001）')
    .requiredOption('--title <title>', '审查标题')
    .option('--priority <priority>', '优先级（high/medium/low，默认 medium）', 'medium')
    .action((options: { op: string; title: string; priority: string }) => {
      const lang = getCliLang(process.cwd());
      // 弃用提示：仅 TTY 输出到 stderr，非 TTY 静默（对齐 stage.create / init·update 惯例，R4）
      if (process.stdout.isTTY) { console.error(t('view.add.deprecated', lang)); }

      // 单点实现：与 flow review add 共用 addReviewEntry（T37/R4），不再维护第二套校验与 ID 生成
      const result = addReviewEntry(process.cwd(), {
        opId: options.op,
        title: options.title,
        priority: options.priority,
        filedBy: 'cli',
      });

      if (result.error) {
        // 错误路径：按错误码分流 i18n 文案
        switch (result.error.code) {
          case 'notLoaded':
            console.error(t('common.errorNoInit', lang));
            break;
          case 'invalidPriority':
            console.error(t('view.add.errorInvalidPriorityTmpl', lang, { priority: result.error.priority }));
            break;
          case 'invalidOpId':
            console.error(t('common.invalidOpId', lang));
            break;
          case 'stageNotFound':
            console.error(t('flow.review.errorStageNotFoundTmpl', lang, { opId: result.error.opId, stage: result.error.stage }));
            break;
          case 'opNotFound':
            console.error(t('flow.review.errorOpNotFoundTmpl', lang, { opId: result.error.opId, op: result.error.op, stage: result.error.stage }));
            break;
        }
        process.exit(1);
        return;
      }

      const review = result.review!;
      console.log(t('view.add.okTmpl', lang, { id: review.id, op: review.op, title: review.title }));
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
