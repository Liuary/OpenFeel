/**
 * plan 命令组注册
 * openfeel plan stage add|list + scheme create|list
 */
import { Command } from 'commander';
import { addStage, listStages } from '../core/plan/stage.js';
import { createScheme, listSchemes } from '../core/plan/scheme.js';
import { t, getCliLang } from '../core/i18n.js';

export function registerPlanCommand(program: Command): void {
  const plan = program
    .command('plan')
    .description('计划管理');

  // ── plan stage 子命令组 ──
  const stageCmd = plan
    .command('stage')
    .description('工作阶段管理');

  // plan stage add <name>
  stageCmd
    .command('add')
    .description('添加工作阶段')
    .argument('<name>', '阶段名（如 stage-01）')
    .action((name: string) => {
      const projectPath = process.cwd();
      const lang = getCliLang(projectPath);
      addStage(projectPath, name);
      console.log(t('plan.stage.createdTmpl', lang, { name }));
    });

  // plan stage list
  stageCmd
    .command('list')
    .description('列出所有工作阶段')
    .action(() => {
      const projectPath = process.cwd();
      const lang = getCliLang(projectPath);
      const stages = listStages(projectPath);

      if (stages.length === 0) {
        console.log(t('plan.stage.empty', lang));
        return;
      }

      for (const stage of stages) {
        console.log(`- ${stage.name}  ${stage.path}`);
      }
    });

  // ── plan scheme 子命令组 ──
  const schemeCmd = plan
    .command('scheme')
    .description('操作方案管理');

  // plan scheme create <stage> <title>
  schemeCmd
    .command('create')
    .description('创建操作方案')
    .argument('<stage>', '阶段名（如 stage-01）')
    .argument('<title>', '方案标题')
    .action((stage: string, title: string) => {
      const projectPath = process.cwd();
      const lang = getCliLang(projectPath);
      const opId = createScheme(projectPath, stage, title);
      console.log(t('plan.scheme.createdTmpl', lang, { opId, stage }));
    });

  // plan scheme list [stage]
  schemeCmd
    .command('list')
    .description('列出操作方案（可选按阶段过滤）')
    .argument('[stage]', '阶段名（可选）')
    .action((stage?: string) => {
      const projectPath = process.cwd();
      const lang = getCliLang(projectPath);
      const schemes = listSchemes(projectPath, stage);

      if (schemes.length === 0) {
        console.log(t('plan.scheme.empty', lang));
        return;
      }

      for (const scheme of schemes) {
        console.log(`[${scheme.stage}] ${scheme.opId} — ${scheme.title}`);
      }
    });
}
