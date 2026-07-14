/**
 * update 命令注册
 * openfeel update           — 交互式选择目标工具后部署
 * openfeel update [path]    — 部署全部支持的工具到指定路径
 */
import { Command } from 'commander';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { updateProject, supportedTools, selectTools } from '../core/update.js';
import { t, getCliLang } from '../core/i18n.js';

export function registerUpdateCommand(program: Command): void {
  program
    .command('update [path]')
    .description('部署 OpenFeel 适配文件到目标项目（无参数时交互式选择工具）')
    .option('--lang <lang>', 'Agent prompt language (zh-CN or en)')
    .action(async (path?: string, options?: { lang?: string }) => {
      const targetPath = resolve(path ?? process.cwd());
      const lang = getCliLang(targetPath);
      try {

        if (!existsSync(targetPath)) {
          console.error(t('update.errorPathNotExistTmpl', lang, { path: targetPath }));
          process.exit(1);
        }

        const selectedTools = path
          ? supportedTools.map((t) => t.id) // 有路径参数则全部部署
          : await selectTools();             // 无参数则交互选择

        if (selectedTools.length === 0) {
          console.log(t('update.cancelled', lang));
          return;
        }

        console.log(t('update.deployingTmpl', lang, { path: targetPath }));
        console.log(t('update.selectedToolsTmpl', lang, { tools: selectedTools.join(', ') }));

        const result = updateProject(targetPath, selectedTools, lang);

        if (result.created.length > 0) {
          console.log(t('update.created', lang));
          for (const item of result.created) {
            console.log(`  + ${item}`);
          }
        }

        if (result.updated.length > 0) {
          console.log(t('update.updated', lang));
          for (const item of result.updated) {
            console.log(`  ~ ${item}`);
          }
        }

        if (result.skipped.length > 0) {
          console.log(t('update.skipped', lang));
          for (const item of result.skipped) {
            console.log(`  - ${item}`);
          }
        }

        if (result.created.length === 0 && result.updated.length === 0) {
          console.log(t('update.alreadyUpToDate', lang));
        } else {
          console.log(t('update.complete', lang));
        }
      } catch (err) {
        console.error(t('update.errorDeployFailedTmpl', lang, { message: (err as Error).message }));
        process.exit(1);
      }
    });
}