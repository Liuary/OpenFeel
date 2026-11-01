/**
 * archive 命令注册
 * openfeel archive <stage>  — 阶段归档（openfeel-archiver 操作）
 */
import { Command } from 'commander';
import { archiveStage, ArchiveExistsError, InvalidSkillSlugError } from '../core/archive/merge.js';
import { join } from 'node:path';
import { t, getCliLang } from '../core/i18n.js';
import { withSchemaVersion, emitJson } from './shared/json-output.js';
import { failRefusal, failInternal } from './shared/errors.js';

export function registerArchiveCommand(program: Command): void {
  program
    .command('archive')
    .description('归档指定阶段（汇总产出、生成摘要、提取知识、生成发布说明与 skill）')
    .argument('<stage>', '阶段名称（如 stage-06）')
    .option('--json', t('help.archive.json', getCliLang(process.cwd())))
    .option('--force', t('help.archive.force', getCliLang(process.cwd())))
    .option('--skill <slug>', t('help.archive.skill', getCliLang(process.cwd())))
    .action((stage: string, options: { json?: boolean; force?: boolean; skill?: string }) => {
      const lang = getCliLang(process.cwd());
      const asJson = options.json === true;
      try {
        const result = archiveStage(process.cwd(), stage, {
          force: options.force === true,
          ...(options.skill !== undefined ? { skill: options.skill } : {}),
        });

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
          // v1.5.8：`generated` 为**追加键**（既有 6 键键序/语义零改动）
          emitJson(withSchemaVersion({
            stage,
            archivePath,
            opsCount: result.opsCount,
            reviewsCount: result.reviewsCount,
            knowledgeExtracts: result.knowledgeExtracts,
            generated: result.generated,
          }));
          return;
        }

        // 输出归档结果
        console.log(t('archive.okTmpl', lang, { stage }));
        console.log(`  ${t('archive.opsCount', lang)}: ${result.opsCount}`);
        console.log(`  ${t('archive.reviewsCount', lang)}: ${result.reviewsCount}`);
        console.log(`  ${t('archive.completedRequirements', lang)}: ${result.generated.requirements.length > 0 ? result.generated.requirements.join(', ') : t('archive.noneLabel', lang)}`);

        // 输出知识提取列表（如有）
        if (result.knowledgeExtracts.length > 0) {
          console.log(`  ${t('archive.knowledgeExtracts', lang)}:`);
          for (const entry of result.knowledgeExtracts) {
            console.log(`    - ${entry}`);
          }
        }

        // 输出归档文件路径
        console.log(`  ${t('archive.archivePath', lang)}: ${archivePath}`);

        // v1.5.8 生成物：发布说明草稿 + 按 harness 生成的 skill
        if (result.generated.releaseNotes) {
          console.log(`  ${t('archive.releaseNotes', lang)}: ${result.generated.releaseNotes}`);
        }
        for (const skillPath of result.generated.skills) {
          console.log(`  ${t('archive.generatedSkill', lang)}: ${skillPath}`);
        }
        if (options.skill !== undefined && result.generated.skills.length === 0) {
          console.log(`  ${t('archive.skillSkippedTmpl', lang, { skill: options.skill })}`);
        }
      } catch (err) {
        // v1.5.8：非法 skill slug → 预期拒绝（零写盘；JSON envelope INVALID_ARGUMENT / 人类 stderr + exit 1）
        if (err instanceof InvalidSkillSlugError) {
          failRefusal({
            code: 'INVALID_ARGUMENT',
            message: t('archive.errorInvalidSkillTmpl', lang, { skill: err.skill }),
            detail: { stage, skill: err.skill },
          });
          return;
        }
        // A1：已有归档且未显式 --force → 预期拒绝（JSON envelope / 人类 stderr 单行 + exit 1）
        // archiveStage 的检查先于任何写盘，此分支保证零写盘
        if (err instanceof ArchiveExistsError) {
          failRefusal({
            code: 'ARCHIVE_EXISTS',
            message: t('archive.errorArchiveExistsTmpl', lang, { stage, path: err.archivePath }),
            detail: { stage, archivePath: err.archivePath },
          });
          return;
        }
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
