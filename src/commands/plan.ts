/**
 * plan 命令组注册
 * openfeel plan stage add|list + scheme create|list
 */
import { Command } from 'commander';
import { addStage, listStages } from '../core/plan/stage.js';
import { createScheme, listSchemes } from '../core/plan/scheme.js';
import { validateStageId, suggestStageId } from '../core/plan/path.js';
import { t, getCliLang } from '../core/i18n.js';
import { StageDirConflictError } from '../core/flow-manager.js';

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
    .description('添加工作阶段（完整入口：建目录 + overview/status + 注册 flow.json；仅注册请用 openfeel flow stage add）')
    .argument('<name>', '阶段 ID（如 stage-01 或 v1.0.0-stage-01）')
    .option('--deps <ids...>', '依赖阶段 ID 列表（空格或逗号分隔，如 --deps a b 或 --deps a,b）')
    .action((name: string, options: { deps?: string[] }) => {
      const projectPath = process.cwd();
      const lang = getCliLang(projectPath);
      // 非法 stageId 统一报错 + 建议名（op-002 校验底座）
      const v = validateStageId(name);
      if (!v.ok) {
        console.error(t('common.stageIdInvalidTmpl', lang, { input: name }));
        console.error(t('common.stageIdSuggestTmpl', lang, { suggest: suggestStageId(projectPath, name) }));
        process.exit(1);
      }
      // 兼容 --deps a,b 与 --deps a b：逐项按逗号再切分、去空
      const deps = (options.deps ?? [])
        .flatMap((d) => d.split(','))
        .map((s) => s.trim())
        .filter(Boolean);
      try {
        addStage(projectPath, name, deps.length > 0 ? deps : undefined);
      } catch (err: unknown) {
        // 阶段目录冲突：按类型分流走 i18n 模板（cli/BUG-002 死键消除）
        if (err instanceof StageDirConflictError) {
          console.error(t('common.stageDirConflictTmpl', lang, { stage: err.stage, other: err.other }));
          process.exit(1);
        }
        // 阶段目录冲突等错误：命令层统一展示并退出码 1
        const msg = err instanceof Error ? err.message : String(err);
        console.error(t('common.errorTmpl', lang, { msg }));
        process.exit(1);
      }
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
    .argument('<stage>', '阶段 ID（如 stage-01 或 v1.0.0-stage-01）')
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
