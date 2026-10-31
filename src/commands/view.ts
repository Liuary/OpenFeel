/**
 * view 命令组注册
 * openfeel view list|accept  — 审查条目管理（openfeel-reviewer 操作）
 */
import { Command } from 'commander';
import { listReviews, acceptReview } from '../core/view/entry.js';
import { normalizeAgentName } from '../core/flow-manager.js';
import { t, getCliLang } from '../core/i18n.js';
import { withSchemaVersion, emitJson } from './shared/json-output.js';
import { failInternal } from './shared/errors.js';
import { enforcePreflightOrFail } from './shared/preflight-gate.js';

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
    .option('--json', t('help.view.list.json', getCliLang(process.cwd())))
    .action((options: { op?: string; json?: boolean }) => {
      const lang = getCliLang(process.cwd());
      try {
        const items = listReviews(process.cwd(), options.op);

        // JSON 分支须为首行纯 JSON 单文档（blocking 缺省 true / canAutoFix 缺省 false）
        if (options.json) {
          emitJson(withSchemaVersion({
            count: items.length,
            reviews: items.map((r) => ({
              id: r.id,
              op: r.op,
              status: r.status,
              priority: r.priority,
              title: r.title,
              filed_by: normalizeAgentName(r.filed_by),
              filed_at: r.filed_at,
              blocking: r.blocking !== false,
              canAutoFix: r.canAutoFix === true,
              autoFixDetail: r.autoFixDetail ?? null,
            })),
          }));
          return;
        }

        if (items.length === 0) {
          console.log(t('view.list.empty', lang));
          return;
        }

        for (const item of items) {
          console.log(`${item.id} [${item.status}] ${item.priority} — ${item.title}`);
          console.log(`  ${t('common.op', lang)}: ${item.op}  ${t('view.list.filedBy', lang)}: ${normalizeAgentName(item.filed_by)}  ${t('view.list.filedAt', lang)}: ${item.filed_at}`);
        }
      } catch (err) {
        // JSON 模式走 INTERNAL_ERROR / exit 3；人类模式逐字保持 exit 1
        if (options.json) {
          failInternal(err, { stderrLines: [t('common.errorTmpl', lang, { msg: err instanceof Error ? err.message : String(err) })] });
          return;
        }
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
      // v1.5.6-stage-114：REV 存在性只读预检先于门（REV-009：REV-999 必须报 not-found 而非 preflight；
      // `listReviews` 与 `acceptReview` 读同一份 flow.json → 不构成第二套真值）
      if (!listReviews(process.cwd()).some((r) => r.id === revId)) {
        console.error(t('view.accept.errorNotFoundTmpl', lang, { id: revId }));
        process.exit(1);
        return;
      }
      // v1.5.6-stage-114：写前 preflight（acceptReview 内 addReview / appendLog / save 写 flow.json，
      // 且可清掉 blocking open REV 从而绕过 done / 归档阻塞门 —— REV-007）
      if (!enforcePreflightOrFail(process.cwd(), lang)) return;
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
