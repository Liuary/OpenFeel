/**
 * roadmap 命令组注册
 * openfeel roadmap create <version> | show [version]
 */
import { Command } from 'commander';
import { createRoadmap, showRoadmap } from '../core/plan/roadmap.js';

export function registerRoadmapCommand(program: Command): void {
  const roadmap = program
    .command('roadmap')
    .description('分期大纲管理');

  // roadmap create <version>
  roadmap
    .command('create')
    .description('创建分期大纲（版本号如 1.0、2.0）')
    .argument('<version>', '版本号')
    .action((version: string) => {
      const projectPath = process.cwd();
      createRoadmap(projectPath, version);
    });

  // roadmap show [version]
  roadmap
    .command('show')
    .description('显示分期大纲内容（不传版本则列出所有）')
    .argument('[version]', '版本号（可选）')
    .action((version?: string) => {
      const projectPath = process.cwd();
      const output = showRoadmap(projectPath, version);
      console.log(output);
    });
}
