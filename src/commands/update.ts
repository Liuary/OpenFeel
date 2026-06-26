/**
 * update 命令注册
 * openfeel update           — 交互式选择目标工具后部署
 * openfeel update [path]    — 部署全部支持的工具到指定路径
 */
import { Command } from 'commander';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { updateProject, supportedTools, selectTools } from '../core/update.js';

export function registerUpdateCommand(program: Command): void {
  program
    .command('update [path]')
    .description('部署 OpenFeel 适配文件到目标项目（无参数时交互式选择工具）')
    .action(async (path?: string) => {
      try {
        const targetPath = resolve(path ?? process.cwd());

        if (!existsSync(targetPath)) {
          console.error(`错误：路径不存在 — ${targetPath}`);
          process.exit(1);
        }

        // 无显式路径参数 → 交互式选择工具
        const selectedTools = path
          ? supportedTools.map((t) => t.id) // 有路径参数则全部部署
          : await selectTools();             // 无参数则交互选择

        if (selectedTools.length === 0) {
          console.log('未选择任何工具，已取消。');
          return;
        }

        console.log(`正在部署适配文件到: ${targetPath}`);
        console.log(`选定工具: ${selectedTools.join(', ')}\n`);

        const result = updateProject(targetPath, selectedTools);

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
          console.log('\n✓ 适配文件部署完成');
        }
      } catch (err) {
        console.error(`错误：部署失败 — ${(err as Error).message}`);
        process.exit(1);
      }
    });
}