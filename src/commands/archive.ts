/**
 * archive 命令注册
 * openfeel archive <stage>  — 阶段归档（Archiver 操作）
 */
import { Command } from 'commander';
import { archiveStage } from '../core/archive/merge.js';
import { join } from 'node:path';
import { t, getCliLang } from '../core/i18n.js';

export function registerArchiveCommand(program: Command): void {
  program
    .command('archive')
    .description('归档指定阶段（汇总产出、生成摘要、提取知识）')
    .argument('<stage>', '阶段名称（如 stage-06）')
    .action((stage: string) => {
      const lang = getCliLang(process.cwd());
      try {
        const result = archiveStage(process.cwd(), stage);

        if (!result) {
          console.error(t('archive.errorArchiveFailedTmpl', lang, { stage }));
          process.exit(1);
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
        const archivePath = join(process.cwd(), '.openfeel', 'log', `archive-${stage}.md`);
        console.log(`  ${t('archive.archivePath', lang)}: ${archivePath}`);
      } catch (err) {
        console.error(t('common.errorTmpl', lang, { msg: err instanceof Error ? err.message : String(err) }));
        process.exit(1);
      }
    });
}
