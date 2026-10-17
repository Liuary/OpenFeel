/**
 * OpenFeel × DSH — Feel 模式适配器入口
 *
 * 本插件是 **OpenFeel 的 DSH 适配版本**，不是独立实现：
 * 它把 OpenFeel 的 CLI 与 `.openfeel/` 工作区投影到 DeepSeek Harness，
 * 让 agent 与用户都能在 DSH 内使用 Feel 流程。
 *
 * 插件结构（与 OpenFeel 的适配器层约定一致）：
 *   lib/index.js            插件入口（name / inject / apply）
 *   lib/adapters/cli.js     CLI 执行器（进程、编码、退出码语义）
 *   lib/adapters/workspace.js  会话工作区 → OpenFeel 项目根
 *   lib/adapters/dashboard.js  状态快照与「下一步」决策
 *   lib/tools/index.js      13 个模型工具
 *   lib/surface/command.js  `/feel` 人类命令
 *   lib/surface/prompt.js   Feel 纪律系统提示段
 *
 * 设计约束：
 * - **零运行时依赖**：只用 Node 内置模块，因此不依赖任何 DSH 内部包即可加载。
 * - **单一权威**：所有状态变更与门禁判定都在 OpenFeel CLI 侧；本插件只做投影。
 * - **拒绝即信息**：CLI 的门禁拒绝原样透传给模型，附可操作的纠正建议。
 *
 * @module openfeel-dsh
 */

import { FeelCli } from './adapters/cli.js';
import { resolveWorkspace } from './adapters/workspace.js';
import { createFeelCommandHandler } from './surface/command.js';
import { FEEL_PROMPT_NAME, FEEL_PROMPT_ORDER, renderFeelPrompt } from './surface/prompt.js';
import { createTools } from './tools/index.js';

/** Loader 入口 id。 */
export const name = 'openfeel-dsh';

/**
 * 硬依赖的宿主服务。
 *
 * 刻意保持最小：`tools` / `commands` / `systemPrompt` 是插件的三个落点。
 * `skills` 等可选服务不在此列——缺失时插件仍然工作。
 */
export const inject = ['tools', 'commands', 'systemPrompt'];

/** 命令定义 id（与包名一致）。 */
const COMMAND_ID = '@openfeel/dsh/feel';

/**
 * 归一化插件配置。
 *
 * 配置缺失时给出**安全默认值**：
 * - `command: 'openfeel'`（走 PATH，安装后最常见）。
 * - `autoPrompt: true`（启用即注入纪律段落）。
 * - `log: false`（不写 `~/.openfeel/cli/logs/`，避免只读沙箱下失败）。
 *
 * @param {Record<string, any> | undefined} raw Loader 传入的配置。
 * @returns {{ command: string, commandPrefix: string[], timeoutMs: number, log: boolean, autoPrompt: boolean, language: string, cwd: string | undefined }}
 */
export function normalizeConfig(raw) {
  const source = typeof raw === 'object' && raw !== null ? raw : {};
  const commandPrefix = Array.isArray(source.commandPrefix)
    ? source.commandPrefix.filter((item) => typeof item === 'string')
    : [];
  const timeoutMs = Number.isFinite(source.timeoutMs) && source.timeoutMs > 0 ? Number(source.timeoutMs) : 120_000;
  return {
    command: typeof source.command === 'string' && source.command !== '' ? source.command : 'openfeel',
    commandPrefix,
    timeoutMs,
    log: source.log === true,
    autoPrompt: source.autoPrompt !== false,
    language: source.language === 'en' ? 'en' : 'zh-CN',
    cwd: typeof source.cwd === 'string' && source.cwd !== '' ? source.cwd : undefined,
  };
}

/**
 * 插件挂载。
 *
 * @param {object} ctx Cordis 上下文（插件私域）。
 * @param {Record<string, any>} [rawConfig] Loader 传入的配置。
 */
export function apply(ctx, rawConfig) {
  const config = normalizeConfig(rawConfig);
  const log = typeof ctx.logger === 'function'
    ? ctx.logger('openfeel-dsh')
    : {
      info: (...args) => console.log('[openfeel-dsh]', ...args),
      warn: (...args) => console.warn('[openfeel-dsh]', ...args),
      error: (...args) => console.error('[openfeel-dsh]', ...args),
      debug: () => {},
    };

  const cli = new FeelCli({
    command: config.command,
    commandPrefix: config.commandPrefix,
    timeoutMs: config.timeoutMs,
    log: config.log,
    cwd: config.cwd ?? process.cwd(),
  });

  /* ── 工具面 ─────────────────────────────────────────────── */

  const tools = createTools({ cli });
  for (const tool of tools) {
    ctx.tools.register(tool);
  }

  /* ── 人类命令面 ─────────────────────────────────────────── */

  ctx.commands.register({
    definitionId: COMMAND_ID,
    name: 'feel',
    description: 'Feel 模式（OpenFeel 流水线治理）：状态 / 需求看板 / 相位推进 / 健康检查',
    input: {
      hint: '[status|next|overview|board|recover|health|stage|req|claim|advance|archive|kb|config]',
      attachments: false,
    },
    handler: createFeelCommandHandler({ cli }),
  });

  /* ── 系统提示面 ─────────────────────────────────────────── */

  if (config.autoPrompt) {
    ctx.systemPrompt.section({
      name: FEEL_PROMPT_NAME,
      order: FEEL_PROMPT_ORDER,
      text: () => {
        // 每次装配时探测，使提示随工作区是否已初始化而准确。
        let projectRoot;
        let detected = false;
        try {
          const resolved = resolveWorkspace({}, { fallback: config.cwd ?? process.cwd() });
          projectRoot = resolved.projectRoot;
          detected = resolved.initialized;
        } catch {
          detected = false;
        }
        return renderFeelPrompt({ projectRoot, detected, language: config.language });
      },
    });
  }

  /* ── 启动自检（非阻断） ─────────────────────────────────── */

  void cli
    .probeVersion()
    .then((version) => {
      if (version === undefined) {
        log.warn(
          `未检测到 OpenFeel CLI（命令 "${config.command}"）。Feel 工具会返回可操作的安装指引；` +
            '安装后执行 npm install -g openfeel 即可，无需重启宿主。',
        );
        return;
      }
      log.info(`已就绪：OpenFeel CLI ${version}；注册 ${tools.length} 个工具、1 个 /feel 命令。`);
    })
    .catch(() => {
      /* 自检失败不影响挂载 */
    });

  log.debug?.(`Feel 适配器已挂载：command=${config.command} timeoutMs=${config.timeoutMs} autoPrompt=${config.autoPrompt}`);
}

export { FeelCli, resolveWorkspace };
