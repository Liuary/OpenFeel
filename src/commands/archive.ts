/**
 * archive 命令注册
 * openfeel archive <stage>  — 阶段归档（openfeel-archiver 操作）
 */
import { Command } from 'commander';
import { archiveStage } from '../core/archive/merge.js';
import { join } from 'node:path';
import { t, getCliLang } from '../core/i18n.js';
import { withSchemaVersion, emitJson } from './shared/json-output.js';
import { failRefusal, failInternal } from './shared/errors.js';

export function registerArchiveCommand(program: Command): void {
  program
    .command('archive')
    .description('归档指定阶段（汇总产出、生成摘要、提取知识）')
    .argument('<stage>', '阶段名称（如 stage-06）')
    .option('--json', t('help.archive.json', getCliLang(process.cwd())))
    .action((stage: string, options: { json?: boolean }) => {
      const lang = getCliLang(process.cwd());
      const asJson = options.json === true;
      try {
        const result = archiveStage(process.cwd(), stage);

        if (!result) {
          // 业务拒绝（阶段不存在 / 未初始化）：JSON envelope ARCHIVE_FAILED / refusal / 1
          if (asJson) {
            failRefusal({
              code: 'ARCHIVE_FAILED',
              message: t('archive.errorArchiveFailedTmpl', lang, { stage }),
              detail: { stage },
            });
            return;
          }
          console.error(t('archive.errorArchiveFailedTmpl', lang, { stage }));
          process.exit(1);
        }

        const archivePath = join(process.cwd(), '.openfeel', 'log', `archive-${stage}.md`);
        if (asJson) {
          // 成功 6 键（D-97-03-05）：stage 为输入原值；archivePath 与人类输出同源
          emitJson(withSchemaVersion({
            stage,
            archivePath,
            opsCount: result.opsCount,
            reviewsCount: result.reviewsCount,
            knowledgeExtracts: result.knowledgeExtracts,
          }));
          return;
        }

        // 输出归档结果
        console.log(t('archive.okTmpl', lang, { stage }));
        console.log(`  ${t('archive.opsCount', lang)}: ${result.opsCount}`);
        console.log(`  ${t('archive.reviewsCount', lang)}: ${result.reviewsCount}`);

        // 输出知识提取列表（如有）
        if (result.knowledgeExtracts.length > 0) {
          console.log(`  ${t('archive.knowledgeExtracts', lang)}:`);
          for (const entry of result.knowledgeExtracts) {
            console.log(`    - ${entry}`);
          }
        }

        // 输出归档文件路径
        console.log(`  ${t('archive.archivePath', lang)}: ${archivePath}`);
      } catch (err) {
        // 异常：JSON → INTERNAL_ERROR / internal / 3；人类保持既有 exit 1 文案
        if (asJson) {
          const msg = err instanceof Error ? err.message : String(err);
          failInternal(err, { stderrLines: [t('common.errorTmpl', lang, { msg })] });
          return;
        }
        console.error(t('common.errorTmpl', lang, { msg: err instanceof Error ? err.message : String(err) }));
        process.exit(1);
      }
    });
}
