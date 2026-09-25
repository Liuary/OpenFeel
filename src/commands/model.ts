/**
 * model 命令注册
 * openfeel model set <agent> <model> [--scope default|global|project] [--build] [--force]
 * openfeel model get <agent> [--scope default|global|project]
 * openfeel model list [--scope default|global|project]
 */
import { Command } from 'commander';
import { execSync } from 'node:child_process';
import {
  setAgentModel, getAgentModel, listAgentModels, isFrameworkSourceReady,
  type ModelScope, type GetModelResult,
} from '../core/model-config.js';
import { t, getCliLang } from '../core/i18n.js';

/** 合法 scope 集合 */
const SCOPES: ModelScope[] = ['default', 'global', 'project'];

/** 校验 scope 参数合法性；非法抛错 */
function parseScope(raw: string): ModelScope {
  if (!(SCOPES as string[]).includes(raw)) {
    throw new Error(`非法 scope "${raw}"，应为 default|global|project`);
  }
  return raw as ModelScope;
}

/** 打印 GetModelResult 的 byScope 展示 */
function printByScope(r: GetModelResult, scope: ModelScope | undefined, lang: string): void {
  if (scope) {
    const v = r.byScope[scope];
    console.log(t('model.get.byScope', lang, { scope, value: v ?? t('model.get.none', lang) }));
    if (scope === 'default' && r.inconsistent) {
      console.log(t('model.get.inconsistent', lang));
    }
    return;
  }
  console.log(t('model.get.effective', lang, { value: r.effective ?? t('model.get.none', lang) }));
  for (const s of SCOPES) {
    console.log(t('model.get.byScope', lang, { scope: s, value: r.byScope[s] ?? t('model.get.none', lang) }));
  }
  if (r.inconsistent) {
    console.log(t('model.get.inconsistent', lang));
  }
  // REV-1701：default 层有显式框架默认值、且 project/global 也显式设置时，框架默认会遮蔽用户设置，给出提示
  if (r.byScope.default != null && r.effective === r.byScope.default
    && (r.byScope.project != null || r.byScope.global != null)) {
    console.log(t('model.get.shadowed', lang));
  }
}

/** 注册 model 命令组 */
export function registerModelCommand(program: Command): void {
  const modelCmd = program.command('model').description(t('help.model'));

  // ── set ──
  modelCmd
    .command('set <agent> <model>')
    .description(t('help.model.set'))
    .option('--scope <scope>', t('help.model.set.scope'), 'project')
    .option('--build', t('help.model.set.build'))
    .option('--force', t('help.model.set.force'))
    .action((agent: string, model: string, options: { scope: string; build?: boolean; force?: boolean }) => {
      const lang = getCliLang(process.cwd());
      let scope: ModelScope;
      try {
        scope = parseScope(options.scope);
      } catch (err) {
        console.error(t('model.error.scope', lang, { message: (err as Error).message }));
        process.exit(1);
      }

      // REV-1504：非 TTY 下 --scope default 须 --force 或 --build 双重确认
      if (scope === 'default' && !process.stdout.isTTY && !options.force && !options.build) {
        console.error(t('model.set.needConfirm', lang));
        process.exit(1);
      }
      // default 层仅源码仓有效，预判给出清晰提示（REV-1703：复用 core 层路径推导，不受 cwd 影响）
      if (scope === 'default' && !isFrameworkSourceReady()) {
        console.error(t('model.set.noSourceRepo', lang));
        process.exit(1);
      }

      try {
        // （REV-1604 修订）build 由 CLI 层读取并触发 npm run build，不再透传 setAgentModel
        const r = setAgentModel(scope, agent, model);
        console.log(t('model.set.ok', lang, { agentId: r.agentId, model: r.model, scope: r.scope }));
        for (const f of r.changedFiles) {
          console.log(`  ${f}`);
        }
        if (r.warning) {
          console.log(t('model.set.warning', lang, { warning: r.warning }));
        }
        if (r.needsBuild && !options.build) {
          console.log(t('model.set.needsBuild', lang));
        } else if (options.build) {
          console.log(t('model.set.buildTriggered', lang));
          execSync('npm run build', { stdio: 'inherit' });
        }
      } catch (err) {
        console.error(t('model.set.failed', lang, { message: (err as Error).message }));
        console.error(t('model.set.example', lang));
        process.exit(1);
      }
    });

  // ── get ──
  modelCmd
    .command('get <agent>')
    .description(t('help.model.get'))
    .option('--scope <scope>', t('help.model.get.scope'))
    .action((agent: string, options: { scope?: string }) => {
      const lang = getCliLang(process.cwd());
      let scope: ModelScope | undefined;
      try {
        scope = options.scope ? parseScope(options.scope) : undefined;
      } catch (err) {
        console.error(t('model.error.scope', lang, { message: (err as Error).message }));
        process.exit(1);
      }
      try {
        printByScope(getAgentModel(agent, scope), scope, lang);
      } catch (err) {
        console.error(t('model.get.failed', lang, { message: (err as Error).message }));
        process.exit(1);
      }
    });

  // ── list ──
  modelCmd
    .command('list')
    .description(t('help.model.list'))
    .option('--scope <scope>', t('help.model.list.scope'))
    .action((options: { scope?: string }) => {
      const lang = getCliLang(process.cwd());
      let scope: ModelScope | undefined;
      try {
        scope = options.scope ? parseScope(options.scope) : undefined;
      } catch (err) {
        console.error(t('model.error.scope', lang, { message: (err as Error).message }));
        process.exit(1);
      }
      console.log(t('model.list.title', lang));
      for (const r of listAgentModels(scope)) {
        const value = scope ? r.byScope[scope] : r.effective;
        console.log(`  ${r.agentId}: ${value ?? t('model.get.none', lang)}`);
      }
    });
}
