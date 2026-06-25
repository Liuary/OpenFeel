/**
 * update 命令注册
 * openfeel update [path] — 更新 OpenCode 适配文件
 */
import { Command } from 'commander';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { updateProject } from '../core/update.js';

export function registerUpdateCommand(program: Command): void {
  program
    .command('update [path]')
    .description('更新 OpenCode 适配文件（Agent 定义和 Skill 文件）')
    .action((path?: string) => {
      try {
        const targetPath = resolve(path ?? process.cwd());

        if (!existsSync(targetPath)) {
          console.error(`错误：路径不存在 — ${targetPath}`);
          process.exit(1);
        }

        console.log(`正在更新 OpenCode 适配文件: ${targetPath}\n`);

        const result = updateProject(targetPath);

        if (result.created.length > 0) {
          console.log('已创建:');
          for (const item of result.created) {
            console.log(`  + ${item}`);
          }
        }

        if (result.updated.length > 0) {
          console.log('已更新:');
          for (const item of result.updated) {
            console.log(`  ~ ${item}`);
          }
        }

        if (result.skipped.length > 0) {
          console.log('已跳过（内容一致）:');
          for (const item of result.skipped) {
            console.log(`  - ${item}`);
          }
        }

        if (result.created.length === 0 && result.updated.length === 0) {
          console.log('所有适配文件已是最新状态，无需变更。');
        } else {
          console.log('\n✓ OpenCode 适配文件更新完成');
        }
      } catch (err) {
        console.error(`错误：更新失败 — ${(err as Error).message}`);
        process.exit(1);
      }
    });
}
