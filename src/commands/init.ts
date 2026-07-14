/**
 * init 命令注册
 * openfeel init [path] [--demo] — 初始化项目工作区
 *
 * --demo 标志：在基础初始化之外，额外创建示例项目骨架
 */
import { Command } from 'commander';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { initProject, initDemo } from '../core/init.js';

export function registerInitCommand(program: Command): void {
  program
    .command('init [path]')
    .description('初始化项目工作区，创建 .openfeel/ 目录结构和配置文件')
    .option('--demo', '创建带示例骨架的项目（NumKit 风格）')
    .option('--lang <lang>', 'Agent 提示词语言（zh-CN 或 en），非交互环境默认 zh-CN')
    .action(async (path?: string, options?: { demo?: boolean; lang?: string }) => {
      const targetPath = resolve(path ?? process.cwd());

      // 校验路径是否存在
      if (!existsSync(targetPath)) {
        console.error(`错误：路径不存在 — ${targetPath}`);
        process.exit(1);
      }

      console.log(`正在初始化 OpenFeel 工作区: ${targetPath}\n`);

      const result = await initProject(targetPath, options?.lang);

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

      // --demo 标志：创建示例项目骨架
      if (options?.demo) {
        console.log('\n⚙ 创建示例项目骨架...\n');
        const demoResult = initDemo(targetPath);

        if (demoResult.created.length > 0) {
          console.log('已创建示例文件:');
          for (const item of demoResult.created) {
            console.log(`  + ${item}`);
          }
        }

        if (demoResult.skipped.length > 0) {
          console.log('已跳过（文件已存在）:');
          for (const item of demoResult.skipped) {
            console.log(`  - ${item}`);
          }
        }

        console.log('\n✅ 示例项目已创建，运行 npm install && npm test 开始');
      }
    });
}
