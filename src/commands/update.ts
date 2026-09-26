/**
 * update 命令注册
 * openfeel update           — 交互式选择目标工具后部署
 * openfeel update [path]    — 部署全部支持的工具到指定路径
 */
import { Command } from 'commander';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { updateProject, supportedTools, selectTools } from '../core/update.js';
import { initProject } from '../core/init.js';
import { t, getCliLang } from '../core/i18n.js';

export function registerUpdateCommand(program: Command): void {
  program
    .command('update [path]')
    .description('部署 OpenFeel 适配文件到目标项目（无参数时交互式选择工具）')
    .option('--lang <lang>', 'Agent prompt language (zh-CN or en)')
    .option('--force', '跳过 AGENTS.md 覆盖确认，直接覆盖')
    .action(async (path?: string, options?: { lang?: string; force?: boolean }) => {
      const targetPath = resolve(path ?? process.cwd());
      const lang = getCliLang(targetPath);
      const force = options?.force ?? false;
      try {

        if (!existsSync(targetPath)) {
          console.error(t('update.errorPathNotExistTmpl', lang, { path: targetPath }));
          process.exit(1);
        }

        // 若项目尚未 init（无 .openfeel/ 目录），自动初始化
        const openfeelDir = resolve(targetPath, '.openfeel');
        if (!existsSync(openfeelDir)) {
          console.log(t('update.autoInitTmpl', lang, { path: targetPath }));
          const initResult = await initProject(targetPath, options?.lang);
          if (initResult.created.length > 0) {
            console.log(t('update.autoInitCreated', lang));
            for (const item of initResult.created) {
              console.log(`  + ${item}`);
            }
          }
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

        const result = updateProject(targetPath, selectedTools, lang, {
          force,
          interactive: true,  // 命令层是交互模式
          lang: options?.lang as 'zh-CN' | 'en' | undefined, // 传递 --lang 参数
        });

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

        // 冲突文件报告
        if (result.conflicts && result.conflicts.length > 0) {
          console.log(t('update.conflictsTitle', lang));
          for (const item of result.conflicts) {
            console.log(`  ⚠ ${item}`);
          }
          console.log(t('update.conflictsHint', lang));
        }

        // 追加文件报告（无控制区标记，已追加到末尾，待会话启动复核）
        if (result.appended && result.appended.length > 0) {
          console.log(t('update.appendedTitle', lang, { n: String(result.appended.length) }));
          for (const item of result.appended) {
            console.log(`  ⚠ ${item}`);
          }
          console.log(t('update.appendedHint', lang));
          // REV-911：大量追加警告（state 损坏/丢失触发全量追加时提示）
          if (result.appended.length > 10) {
            console.warn(t('update.appendedManyWarning', lang, { n: String(result.appended.length) }));
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