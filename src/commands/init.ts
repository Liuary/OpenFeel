/**
 * init 命令注册
 * openfeel init [path] — 初始化项目工作区
 */
import { Command } from 'commander';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { initProject } from '../core/init.js';

export function registerInitCommand(program: Command): void {
  program
    .command('init [path]')
    .description('初始化项目工作区，创建 .openfeel/ 目录结构和配置文件')
    .action((path?: string) => {
      const targetPath = resolve(path ?? process.cwd());

      // 校验路径是否存在
      if (!existsSync(targetPath)) {
        console.error(`错误：路径不存在 — ${targetPath}`);
        process.exit(1);
      }

      console.log(`正在初始化 OpenFeel 工作区: ${targetPath}\n`);

      const result = initProject(targetPath);

      // 输出创建的目录
      if (result.created.length > 0) {
        console.log('已创建:');
        for (const item of result.created) {
          console.log(`  + ${item}`);
        }
      }

      // 输出更新的文件
      if (result.updated.length > 0) {
        console.log('已更新:');
        for (const item of result.updated) {
          console.log(`  ~ ${item}`);
        }
      }

      if (result.created.length === 0 && result.updated.length === 0) {
        console.log('工作区已是最新状态，无需变更。');
      } else {
        console.log('\n✓ OpenFeel 工作区初始化完成');
      }
    });
}
