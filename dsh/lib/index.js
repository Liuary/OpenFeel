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

import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FeelCli } from './adapters/cli.js';
import { resolveWorkspace } from './adapters/workspace.js';
import { writeHostMarker } from './adapters/host-state.js';
import { setGuardRuntimeIdentity, writeGuardState } from './adapters/guard-state.js';
import { touchSession } from './adapters/session-cwd-registry.js';
import { createOpenFeelGuard, resolveShellGate } from './guard.js';
import { createFeelCommandHandler } from './surface/command.js';
import { FEEL_PROMPT_NAME, FEEL_PROMPT_ORDER, renderBootstrapPrompt, renderFeelPrompt } from './surface/prompt.js';
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
 * @returns {{ command: string, commandPrefix: string[], timeoutMs: number, log: boolean, autoPrompt: boolean, activation: 'auto'|'always'|'off', language: string, cwd: string | undefined, enforce: 'off'|'project'|'always', mutatingTools: string[], allowGeneral: boolean, shellGate: 'strict'|'warn'|'off'|undefined }}
 */
export function normalizeConfig(raw) {
  const source = typeof raw === 'object' && raw !== null ? raw : {};
  const commandPrefix = Array.isArray(source.commandPrefix)
    ? source.commandPrefix.filter((item) => typeof item === 'string')
    : [];
  const timeoutMs = Number.isFinite(source.timeoutMs) && source.timeoutMs > 0 ? Number(source.timeoutMs) : 120_000;
  const activation = source.activation === 'always' || source.activation === 'off' ? source.activation : 'auto';
  const enforce = source.enforce === 'off' || source.enforce === 'project' || source.enforce === 'always'
    ? source.enforce
    : 'always';
  // v1.5.11 D-126-02：默认列表必须与 `guard.js` 的 `DEFAULT_MUTATING_TOOLS` **逐项同步**，
  // 否则 profile 传空数组会回落到旧列表（pwsh/bash 不受守）。`shell`/`execute_command`/`exec`
  // 本宿主不存在，只是跨宿主防御条目。
  const mutatingTools = Array.isArray(source.mutatingTools)
    ? source.mutatingTools.filter((item) => typeof item === 'string' && item !== '')
    : ['edit', 'write', 'apply_patch', 'str_replace_editor', 'bash', 'pwsh', 'shell', 'execute_command', 'exec'];
  // shell 门禁档位（v1.5.11 D-126-02）：`strict` / `warn` / `off` 透传；未设 = 默认组合
  // （1/2 类拒、4 类告警）。运行时 `OPENFEEL_SHELL_GATE` 优先（见 guard.js）。
  const shellGate = source.shellGate === 'strict' || source.shellGate === 'warn' || source.shellGate === 'off'
    ? source.shellGate
    : undefined;
  return {
    command: typeof source.command === 'string' && source.command !== '' ? source.command : 'openfeel',
    commandPrefix,
    timeoutMs,
    log: source.log === true,
    autoPrompt: source.autoPrompt !== false,
    activation,
    language: source.language === 'en' ? 'en' : 'zh-CN',
    cwd: typeof source.cwd === 'string' && source.cwd !== '' ? source.cwd : undefined,
    enforce,
    mutatingTools,
    allowGeneral: source.allowGeneral !== false,
    shellGate,
  };
}

/**
 * 取当前正在装配提示的会话 Agent。
 *
 * 提示装配期没有直接的 agent/cwd 入参，只能经 `agents.currentInitiator()`
 * 沿进程内的驱动链反查——`dsh-tool-goal` 用的是同一手法。
 * `agents` 未挂载或调用失败时返回 `undefined`（提示段据此放弃注入）。
 *
 * @param {object} ctx 插件上下文。
 * @returns {object | undefined} 发起当前装配的 Agent。
 */
function currentAgent(ctx) {
  try {
    const agents = typeof ctx.get === 'function' ? ctx.get('agents') : undefined;
    if (agents === undefined || typeof agents.currentInitiator !== 'function') return undefined;
    return agents.currentInitiator();
  } catch {
    return undefined;
  }
}

/**
 * 插件挂载。
 *
 * @param {object} ctx Cordis 上下文（插件私域）。
 * @param {Record<string, any>} [rawConfig] Loader 传入的配置。
 */
export function apply(ctx, rawConfig) {
  const config = normalizeConfig(rawConfig);

  /** 本宿主加载标记（D-126-04 自证三键的来源之一：started_at / loaded_hash 同源同值）。 */
  let hostMarker = null;
  // v1.3.4：记录「本宿主实际加载的适配器指纹」，供 `openfeel setup --check` 区分
  // 「文件旧」与「文件已新但宿主未重启」。best-effort：失败不影响挂载。
  try {
    const adapterRoot = dirname(dirname(fileURLToPath(import.meta.url)));
    let adapterVersion = '0.0.0';
    try {
      const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));
      if (typeof pkg.version === 'string' && pkg.version !== '') adapterVersion = pkg.version;
    } catch {
      /* package.json 不可读时保持占位版本 */
    }
    hostMarker = writeHostMarker({ adapterRoot, version: adapterVersion });
  } catch {
    /* 标记写入失败 → CLI check 会提示 restart-required，可操作，不阻塞 */
  }
  // v1.5.12 / stage-127 D1：登记**当前进程**的运行时身份（pid / marker 的 started_at+loaded_hash）。
  // guard-state 写入时用它在 seed 之后覆盖旧身份；旧工作区文件的身份一律剥离，
  // 因此重启后首条判定即可自证可信（不再因旧 hostStartedAt 恒 stale）。
  setGuardRuntimeIdentity({
    pid: process.pid,
    hostStartedAt: hostMarker?.started_at ?? new Date().toISOString(),
    loaded_hash: hostMarker?.loaded_hash ?? '',
  });
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

  /* ── 写入门禁 ───────────────────────────────────────────── */

  if (config.enforce !== 'off') {
    if (typeof ctx.tools.guard !== 'function') {
      log.warn('当前 DSH 不支持 ctx.tools.guard；写入门禁未启用（仍可用 feel_* 工具）');
    } else {
      const registerGuard = () => ctx.tools.guard(createOpenFeelGuard({
        enforce: config.enforce,
        mutatingTools: config.mutatingTools,
        allowGeneral: config.allowGeneral,
        language: config.language,
        cwd: config.cwd,
        shellGate: config.shellGate,
      }));
      if (typeof ctx.effect === 'function') {
        ctx.effect(registerGuard);
      } else {
        const dispose = registerGuard();
        if (typeof ctx.on === 'function' && typeof dispose === 'function') ctx.on('dispose', dispose);
      }
    }
  }

  /* ── 门禁自检状态（v1.5.11 D-126-04） ──────────────────── */

  // 注册段写一次：registered / enforce / shellGate / cwd / cwdSource / degraded /
  // resolvedAt + 自证三键（hostStartedAt / loaded_hash / pid，与宿主标记同源同值）。
  // 启动期还不知道会话 cwd：profile 未配 cwd 时写 `null` → **固定落
  // `os.tmpdir()/openfeel-guard/guard-state.json`**，绝不用 `process.cwd()`
  // （那会把宿主启动目录误当会话工作区，正是原 bug 的形态）。
  const gate = resolveShellGate(
    typeof process.env.OPENFEEL_SHELL_GATE === 'string' && process.env.OPENFEEL_SHELL_GATE.trim() !== ''
      ? process.env.OPENFEEL_SHELL_GATE
      : config.shellGate,
  );
  const guardRegistered = config.enforce !== 'off' && typeof ctx.tools.guard === 'function';
  writeGuardState(config.cwd ?? null, {
    registered: guardRegistered,
    enforce: config.enforce,
    shellGate: gate.label,
    cwd: config.cwd ?? null,
    cwdSource: config.cwd === undefined ? 'unresolved' : 'config',
    degraded: config.cwd === undefined,
    resolvedAt: new Date().toISOString(),
    hostStartedAt: hostMarker?.started_at ?? new Date().toISOString(),
    loaded_hash: hostMarker?.loaded_hash ?? '',
    pid: process.pid,
  });

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

  if (config.autoPrompt && config.activation !== 'off') {
    ctx.systemPrompt.section({
      name: FEEL_PROMPT_NAME,
      order: FEEL_PROMPT_ORDER,
      // 注意：PromptSection.text 的签名是 `(context: AssembleContext) => string`，
      // 而 `AssembleContext = { scope?, signal? }` —— **不含 cwd**。
      // 因此必须经 `agents.currentInitiator()` 反查会话，否则只能用宿主进程 cwd，
      // 会把「宿主启动目录」误当会话工作区。
      text: () => {
        const agent = currentAgent(ctx);
        const sessionCwd = agent?.session?.header?.cwd;
        // v1.5.11 D-126-01 登记点 ①：提示装配时把会话 cwd 写进登记表，供门禁在
        // `agent.session.header.cwd` 缺失时兜底（第 3 环）。只有 sessionId 与 cwd
        // 都非空才写 —— 写入点本身不产生「当前 agent ≈ 所有会话」的误记。
        touchSession(agent?.session?.id, sessionCwd);
        // 拿不到会话且没有显式 cwd 配置 → 不注入（宁可不打扰，也不给错的项目）。
        if ((typeof sessionCwd !== 'string' || sessionCwd === '') && config.cwd === undefined) return '';

        let resolved;
        try {
          resolved = resolveWorkspace(agent === undefined ? {} : { agent }, { fallback: config.cwd });
        } catch {
          return '';
        }
        // 不回溯：只按会话工作区本身判定。
        // - 已初始化 → 完整 Feel 纪律；
        // - 未初始化 + activation=always → 完整提示（detected:false）；
        // - 未初始化 + activation=auto → 短 bootstrap；
        // - activation=off → 外层不注册 section。
        if (resolved.initialized) {
          return renderFeelPrompt({ projectRoot: resolved.projectRoot, detected: true, language: config.language });
        }
        if (config.activation === 'always') {
          return renderFeelPrompt({ projectRoot: resolved.projectRoot, detected: false, language: config.language });
        }
        return renderBootstrapPrompt({
          projectRoot: resolved.projectRoot,
          language: config.language,
          enforce: config.enforce,
        });
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
