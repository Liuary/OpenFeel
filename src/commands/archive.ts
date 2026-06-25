/**
 * archive 命令注册
 * openfeel archive <stage>  — 阶段归档（Archiver 操作）
 */
import { Command } from 'commander';
import { archiveStage } from '../core/archive/merge.js';
import { join } from 'node:path';

export function registerArchiveCommand(program: Command): void {
  program
    .command('archive')
    .description('归档指定阶段（汇总产出、生成摘要、提取知识）')
    .argument('<stage>', '阶段名称（如 stage-06）')
    .action((stage: string) => {
      try {
        const result = archiveStage(process.cwd(), stage);

        if (!result) {
          console.error(`错误：归档失败，请确认阶段 "${stage}" 存在且 flow.json 已初始化。`);
          process.exit(1);
        }

        // 输出归档结果
        console.log(`✓ 阶段已归档: ${stage}`);
        console.log(`  操作数: ${result.opsCount}`);
        console.log(`  审查条目数: ${result.reviewsCount}`);

        // 输出知识提取列表（如有）
        if (result.knowledgeExtracts.length > 0) {
          console.log('  知识提取:');
          for (const entry of result.knowledgeExtracts) {
            console.log(`    - ${entry}`);
          }
        }

        // 输出归档文件路径
        const archivePath = join(process.cwd(), '.openfeel', 'log', `archive-${stage}.md`);
        console.log(`  归档文件: ${archivePath}`);
      } catch (err) {
        console.error(`错误：${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });
}
