/**
 * model 命令注册
 * v1.6.3 / REQ-070：`openfeel model` 只剩 global / project 两层（default 层已移除）。
 * openfeel model set <agent> <model> [--scope global|project] [--build] [--force]
 * openfeel model get <agent> [--scope default|global|project]（default 恒为未显式设置）
 * openfeel model list [--scope default|global|project]（default 恒为未显式设置）
 */
import { Command } from 'commander';
import { execSync } from 'node:child_process';
import {
  setAgentModel, getAgentModel, listAgentModels,
  type ModelScope, type GetModelResult,
} from '../core/model-config.js';
import { t, getCliLang } from '../core/i18n.js';
import { withSchemaVersion, emitJson } from './shared/json-output.js';
import { failRefusal } from './shared/errors.js';

/** 合法 scope 集合（v1.6.3 / REQ-070：set 只接受 global / project；get/list 的 default 为只读「未显式设置」） */
const SCOPES: ModelScope[] = ['default', 'global', 'project'];

/** 构建超时上限（10 分钟；从常量声明便于调整，T41） */
const MODEL_BUILD_TIMEOUT_MS = 600000;

/** 校验 scope 参数合法性；非法抛错 */
function parseScope(raw: string): ModelScope {
  if (!(SCOPES as string[]).includes(raw)) {
    throw new Error(`非法 scope "${raw}"，应为 default|global|project`);
  }
  return raw as ModelScope;
}

/**
 * JSON 视图派生：provider/model 按生效值首个 `/` 切分，source 取生效层。
 * 指定 scope 且值非空 → source = 该 scope；未指定 → project > global 首个非空（v1.6.3：default 层已移除）。
 * @param r get/list 的结果条目
 * @param scope 用户显式指定的层级（未指定为 undefined）
 */
function toJsonModel(
  r: GetModelResult,
  scope: ModelScope | undefined,
): { provider: string | null; model: string | null; source: ModelScope | null } {
  const value = scope ? (r.byScope[scope] ?? null) : (r.effective ?? null);
  let provider: string | null = null;
  let model: string | null = null;
  if (value !== null) {
    const slash = value.indexOf('/');
    if (slash === -1) {
      // 无 `/` → provider 为 null，model 为原值
      model = value;
    } else {
      provider = value.slice(0, slash);
      model = value.slice(slash + 1);
    }
  }
  let source: ModelScope | null = null;
  if (scope) {
    source = value !== null ? scope : null;
  } else if (value !== null) {
    // 与非指定 scope 的 effective 链同源（v1.6.3 / REQ-070）：project > global（default 恒 null，保留判定以防回潮）
    source = r.byScope.default != null
      ? 'default'
      : r.byScope.project != null
        ? 'project'
        : r.byScope.global != null
          ? 'global'
          : null;
  }
  return { provider, model, source };
}

/** 打印 GetModelResult 的 byScope 展示 */
function printByScope(r: GetModelResult, scope: ModelScope | undefined, lang: string): void {
  if (scope) {
    const v = r.byScope[scope];
    console.log(t('model.get.byScope', lang, { scope, value: v ?? t('model.get.none', lang) }));
    return;
  }
  console.log(t('model.get.effective', lang, { value: r.effective ?? t('model.get.none', lang) }));
  for (const s of SCOPES) {
    console.log(t('model.get.byScope', lang, { scope: s, value: r.byScope[s] ?? t('model.get.none', lang) }));
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

      // v1.6.3 / REQ-070：default 层已移除——框架不再预设模型，写入面明确拒绝并提示改用两层
      if (scope === 'default') {
        console.error(t('model.set.defaultRemoved', lang));
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
          try {
            // 加超时，避免构建无限挂起（T41）
            execSync('npm run build', { stdio: 'inherit', timeout: MODEL_BUILD_TIMEOUT_MS });
          } catch (buildErr) {
            // 超时（ETIMEDOUT / SIGTERM）→ 明确文案 + 非 0 退出码；其余上抛给外层统一处理
            const isTimeout = (buildErr as { code?: string }).code === 'ETIMEDOUT'
              || (buildErr as { signal?: string }).signal === 'SIGTERM';
            if (isTimeout) {
              console.error(t('common.errorTmpl', lang, { msg: `build timeout (${MODEL_BUILD_TIMEOUT_MS / 60000}min)` }));
              process.exitCode = 1;
            } else {
              throw buildErr;
            }
          }
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
    .option('--json', t('help.model.get.json', getCliLang(process.cwd())))
    .action((agent: string, options: { scope?: string; json?: boolean }) => {
      const lang = getCliLang(process.cwd());
      let scope: ModelScope | undefined;
      try {
        scope = options.scope ? parseScope(options.scope) : undefined;
      } catch (err) {
        // 非法 scope：JSON envelope / 人类 stderr 单行 + exit 1（文案与既有逐字一致）
        failRefusal({
          code: 'INVALID_ARGUMENT',
          message: t('model.error.scope', lang, { message: (err as Error).message }),
          detail: { reason: 'invalid-scope', scope: options.scope },
        });
        return;
      }
      let result: GetModelResult;
      try {
        result = getAgentModel(agent, scope);
      } catch (err) {
        failRefusal({
          code: 'INVALID_ARGUMENT',
          message: t('model.get.failed', lang, { message: (err as Error).message }),
          detail: { reason: 'agent-not-found', agent },
        });
        return;
      }
      if (options.json) {
        const d = toJsonModel(result, scope);
        emitJson(withSchemaVersion({
          scope: scope ?? null,
          agent: result.agentId,
          provider: d.provider,
          model: d.model,
          source: d.source,
        }));
        return;
      }
      printByScope(result, scope, lang);
    });

  // ── list ──
  modelCmd
    .command('list')
    .description(t('help.model.list'))
    .option('--scope <scope>', t('help.model.list.scope'))
    .option('--json', t('help.model.list.json', getCliLang(process.cwd())))
    .action((options: { scope?: string; json?: boolean }) => {
      const lang = getCliLang(process.cwd());
      let scope: ModelScope | undefined;
      try {
        scope = options.scope ? parseScope(options.scope) : undefined;
      } catch (err) {
        failRefusal({
          code: 'INVALID_ARGUMENT',
          message: t('model.error.scope', lang, { message: (err as Error).message }),
          detail: { reason: 'invalid-scope', scope: options.scope },
        });
        return;
      }
      const results = listAgentModels(scope);
      if (options.json) {
        emitJson(withSchemaVersion({
          scope: scope ?? null,
          agents: results.map((r) => {
            const d = toJsonModel(r, scope);
            return { agent: r.agentId, provider: d.provider, model: d.model, source: d.source };
          }),
        }));
        return;
      }
      console.log(t('model.list.title', lang));
      for (const r of results) {
        const value = scope ? r.byScope[scope] : r.effective;
        console.log(`  ${r.agentId}: ${value ?? t('model.get.none', lang)}`);
      }
    });
}
