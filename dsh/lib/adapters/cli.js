/**
 * OpenFeel × DSH 适配器 — CLI 执行器
 *
 * 本适配器**不重新实现** OpenFeel 的领域逻辑。所有读写都经由真实
 * `openfeel` CLI 完成：插件只负责把 DSH 的 agent / 用户意图翻译成
 * CLI 调用，再把结构化结果翻译回工具结果。
 *
 * 为什么这样做：
 * - OpenFeel 的 `flow.json` 有 revision 乐观并发、锁、日志、跨文件对账等契约；
 *   绕过 CLI 直接写盘会破坏这些不变量。
 * - 门禁判定（phase 转移表、需求 done 门、REV 阻塞）是单一权威，必须在 CLI 侧。
 * - 插件因此可以保持**零运行时依赖**，并且天然跟随 CLI 升级。
 *
 * 项目定位：CLI 用 `process.cwd()` 解析项目根，因此这里用 `cwd`
 * 把每一次调用锚定到当前会话的工作区目录。
 */

import { spawn } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { delimiter, dirname, isAbsolute, join } from 'node:path';

/* ────────────────────────── 错误模型 ────────────────────────── */

/**
 * 适配器错误分类。
 * @typedef {'refusal'|'internal'|'usage'|'cli-missing'|'timeout'} FeelErrorKind
 */

/**
 * 适配器统一错误。
 *
 * `refusal` 是**预期结果**（门禁未过、状态不合法），调用方应据此纠正；
 * 其它分类是环境/参数故障。
 */
export class FeelError extends Error {
  /**
   * @param {string} message
   * @param {object} [options]
   * @param {FeelErrorKind} [options.kind]
   * @param {string} [options.code]
   * @param {Record<string, unknown>} [options.detail]
   * @param {unknown} [options.cause]
   */
  constructor(message, options = {}) {
    super(message);
    this.name = 'FeelError';
    this.kind = options.kind ?? 'refusal';
    this.code = options.code ?? 'FEEL_ERROR';
    this.detail = options.detail ?? {};
    if (options.cause !== undefined) this.cause = options.cause;
  }
}

/**
 * 抛出门禁/状态拒绝（预期结果）。
 * @param {string} message
 * @param {string} [code]
 * @param {Record<string, unknown>} [detail]
 * @returns {never}
 */
export function refuse(message, code = 'FEEL_REFUSED', detail) {
  throw new FeelError(message, { kind: 'refusal', code, detail });
}

/**
 * 抛出参数非法。
 * @param {string} message
 * @param {string} [code]
 * @returns {never}
 */
export function badUsage(message, code = 'FEEL_BAD_USAGE') {
  throw new FeelError(message, { kind: 'usage', code });
}

/**
 * 归一化任意错误为 FeelError。
 * @param {unknown} error
 * @param {string} [code]
 * @returns {FeelError}
 */
export function toFeelError(error, code = 'FEEL_INTERNAL') {
  if (error instanceof FeelError) return error;
  if (error instanceof Error) {
    return new FeelError(error.message, { kind: 'internal', code, cause: error });
  }
  return new FeelError(String(error), { kind: 'internal', code });
}

/* ────────────────────────── 执行器 ────────────────────────── */

/** 默认单次调用超时（毫秒）。CLI 冷启动约 0.3–1s，宽限到 120s 以容纳大 flow。 */
export const DEFAULT_TIMEOUT_MS = 120_000;

/**
 * CLI 调用结果。
 * @typedef {object} CliResult
 * @property {number} code 退出码。
 * @property {string} stdout 标准输出（已去尾随空白）。
 * @property {string} stderr 标准错误（已去尾随空白）。
 * @property {number} durationMs 耗时。
 * @property {string[]} argv 实际执行的参数。
 */

/**
 * OpenFeel CLI 执行器。
 */
export class FeelCli {
  /**
   * @param {object} [options]
   * @param {string} [options.command] 可执行文件名，默认 `openfeel`。
   * @param {string[]} [options.commandPrefix] 前缀参数（如 `[nodeScriptPath]`，用于源码运行）。
   * @param {string} [options.cwd] 默认工作目录（会话工作区）。
   * @param {number} [options.timeoutMs] 默认超时。
   * @param {boolean} [options.log] 是否让 CLI 写运行日志，默认 false。
   * @param {string} [options.encoding] 显式输出编码；默认 `utf8`。
   * @param {Record<string, string>} [options.env] 追加环境变量。
   */
  constructor(options = {}) {
    this.command = options.command ?? 'openfeel';
    this.commandPrefix = options.commandPrefix ?? [];
    this.cwd = options.cwd;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.log = options.log ?? false;
    this.encoding = options.encoding ?? 'utf8';
    this.env = options.env ?? {};
    /** 最近一次成功探测的 CLI 版本，避免重复探测。 */
    this.detectedVersion = undefined;
    /**
     * 已解析的可执行目标（惰性求值并缓存）。
     * @type {{ command: string, prefix: string[] } | undefined}
     */
    this.resolved = undefined;
    /** 解析失败的原因（用于给出可操作的诊断）。 */
    this.resolveError = undefined;
  }

  /**
   * 解析「到底该怎么启动 openfeel」。
   *
   * 为什么需要这一步：npm 的全局安装产物在 Windows 上是
   * `openfeel.cmd` / `openfeel.ps1` 这类**脚本垫片**，且 npm 全局 bin
   * 目录经常**不在**子进程继承的 PATH 里。直接 `spawn('openfeel')` 会
   * 以 ENOENT 失败，即使命令在用户 shell 里可用。
   *
   * 解析顺序：
   * 1. 显式配置且是**存在的文件** → 直接用（`.js` 用 node，`.cmd/.bat` 用 cmd）。
   * 2. PATH 各目录下按平台候选后缀查找可执行文件。
   * 3. `process.execPath` 同目录（即当前 Node 的安装目录——常见于
   *    DSH 打包运行时把 CLI 装在 node 旁边）；再试 npm 全局 prefix 的
   *    `bin` 目录与 `node_modules/openfeel` 的 bin。
   * 4. 都失败则请求失败，并**说明已尝试的目录**。
   *
   * @returns {{ command: string, prefix: string[] }}
   */
  resolve() {
    if (this.resolved !== undefined) return this.resolved;
    if (this.resolveError !== undefined) throw this.resolveError;

    const attempted = [];
    const isWindows = process.platform === 'win32';

    /** 把一个候选路径转成可 spawn 的 {command, prefix}。 */
    const toLauncher = (/** @type {string} */ filePath) => {
      const lower = filePath.toLowerCase();
      if (lower.endsWith('.js') || lower.endsWith('.mjs') || lower.endsWith('.cjs')) {
        return { command: process.execPath, prefix: [filePath] };
      }
      if (lower.endsWith('.cmd') || lower.endsWith('.bat')) {
        return { command: isWindows ? 'cmd' : filePath, prefix: isWindows ? ['/d', '/s', '/c', filePath] : [] };
      }
      return { command: filePath, prefix: [] };
    };

    /** 若路径指向前缀文件则展开垫片，否则原样返回。 */
    const expand = (/** @type {string} */ base) => {
      if (!isWindows) return [base];
      return [`${base}.cmd`, `${base}.exe`, `${base}.bat`, base];
    };

    // 1) 显式配置：可能是裸命令名，也可能是文件路径。
    if (this.command !== 'openfeel') {
      if (isAbsolute(this.command) && existsSync(this.command)) {
        const launcher = toLauncher(this.command);
        this.resolved = { command: launcher.command, prefix: [...launcher.prefix, ...this.commandPrefix] };
        return this.resolved;
      }
      if (!isAbsolute(this.command) && !this.command.includes('/') && !this.command.includes('\\')) {
        // 裸命令名：继续走 PATH 解析。
        attempted.push(`PATH（${this.command}）`);
      }
    }

    /** @type {string[]} */
    const searchRoots = [];
    for (const entry of (process.env.PATH ?? '').split(delimiter)) {
      if (entry !== '') searchRoots.push(entry);
    }
    const nodeDir = dirname(process.execPath);
    searchRoots.push(nodeDir);
    // npm 全局 prefix 的 bin：<prefix>/openfeel 与 <prefix>/bin/openfeel。
    searchRoots.push(nodeDir);
    searchRoots.push(join(nodeDir, 'bin'));
    searchRoots.push(join(nodeDir, 'node_modules', 'openfeel', 'bin'));

    const bareName = this.command === 'openfeel' ? 'openfeel' : this.command;
    for (const root of searchRoots) {
      for (const candidate of expand(join(root, bareName))) {
        if (!isFile(candidate)) continue;
        const launcher = toLauncher(candidate);
        this.resolved = { command: launcher.command, prefix: [...launcher.prefix, ...this.commandPrefix] };
        return this.resolved;
      }
    }

    attempted.push(`<node>/openfeel*（${nodeDir}）`);

    // 4) 全部失败：保留失败原因，交由调用方渲染成安装指引。
    this.resolveError = new FeelError(
      `找不到 OpenFeel CLI 可执行文件「${this.command}」。已尝试：${[...new Set(attempted)].join('、')}。\n` +
        '解决方式（任选其一）：\n' +
        '  1) 安装 CLI：npm install -g openfeel\n' +
        '  2) 在本适配器配置中把 openfeel.command 设为可执行文件绝对路径（如 C:\\\\Users\\\\<you>\\\\AppData\\\\Roaming\\\\npm\\\\openfeel.cmd）\n' +
        '  3) 若从源码运行，把 openfeel.command 设为 node、openfeel.commandPrefix 设为 [<repo>/bin/openfeel.js]',
      { kind: 'cli-missing', code: 'FEEL_CLI_NOT_FOUND' },
    );
    throw this.resolveError;
  }

  /**
   * 组装一次调用的完整 argv（**不含**可执行文件本身）。
   *
   * 恒注入的全局选项：
   * - `--no-color`：保证输出无 ANSI，便于解析。
   * - `--encoding utf8`：`--json` 恒为 UTF-8，显式固定避免平台差异。
   * - `--no-log`：默认不写 `~/.openfeel/cli/logs/`，以免在只读沙箱下失败。
   *
   * @param {string[]} args 子命令与业务参数。
   * @returns {string[]}
   */
  buildArgv(args) {
    const global = ['--no-color', '--encoding', this.encoding];
    if (!this.log) global.push('--no-log');
    return [...global, ...args];
  }

  /**
   * 执行一次 CLI 调用（不解析）。
   * @param {string[]} args
   * @param {object} [options]
   * @param {string} [options.cwd] 覆盖工作目录。
   * @param {number} [options.timeoutMs] 覆盖超时。
   * @param {AbortSignal} [options.signal] 取消信号。
   * @returns {Promise<CliResult>}
   */
  async run(args, options = {}) {
    const launcher = this.resolve();
    const argv = [...launcher.prefix, ...this.buildArgv(args)];
    const cwd = options.cwd ?? this.cwd;
    const timeoutMs = options.timeoutMs ?? this.timeoutMs;
    const startedAt = Date.now();

    /** @type {Record<string, string|undefined>} */
    const env = {
      ...process.env,
      // 无着色、无交互、固定编码。
      NO_COLOR: '1',
      FORCE_COLOR: '0',
      CI: process.env.CI ?? '1',
      // v1.5.5：适配器写命令恒 strict（必须先 feel_status/feel_next）；用户 shell 默认 warn。
      OPENFEEL_PREFLIGHT: 'strict',
      ...(this.log ? {} : { OPENFEEL_LOG: '0' }),
      ...this.env,
    };

    /** @type {CliResult} */
    const result = await new Promise((resolve, reject) => {
      /** @type {import('node:child_process').ChildProcessWithoutNullStreams} */
      let child;
      try {
        child = spawn(launcher.command, argv, {
          cwd,
          env,
          shell: false,
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (error) {
        reject(
          new FeelError(`无法启动 OpenFeel CLI（${launcher.command}）: ${messageOf(error)}`, {
            kind: 'cli-missing',
            code: 'FEEL_CLI_SPAWN_FAILED',
            cause: error,
          }),
        );
        return;
      }

      /** @type {Buffer[]} */
      const stdoutChunks = [];
      /** @type {Buffer[]} */
      const stderrChunks = [];
      let settled = false;
      /** @type {NodeJS.Timeout | undefined} */
      let timer;

      const finish = (/** @type {number} */ code) => {
        if (settled) return;
        settled = true;
        if (timer !== undefined) clearTimeout(timer);
        resolve({
          code,
          stdout: Buffer.concat(stdoutChunks).toString('utf8').replace(/\s+$/, ''),
          stderr: Buffer.concat(stderrChunks).toString('utf8').replace(/\s+$/, ''),
          durationMs: Date.now() - startedAt,
          argv,
        });
      };

      child.stdout.on('data', (/** @type {Buffer} */ chunk) => stdoutChunks.push(chunk));
      child.stderr.on('data', (/** @type {Buffer} */ chunk) => stderrChunks.push(chunk));

      child.on('error', (error) => {
        if (settled) return;
        settled = true;
        if (timer !== undefined) clearTimeout(timer);
        const missing = /** @type {{ code?: string }} */ (error).code === 'ENOENT';
        reject(
          new FeelError(
            missing
              ? `OpenFeel CLI 无法执行（${launcher.command}）：文件不存在或不可执行。请安装 npm install -g openfeel，或在本适配器配置中指定 openfeel.command。`
              : `OpenFeel CLI 执行失败: ${messageOf(error)}`,
            {
              kind: missing ? 'cli-missing' : 'internal',
              code: missing ? 'FEEL_CLI_NOT_FOUND' : 'FEEL_CLI_FAILED',
              cause: error,
            },
          ),
        );
      });

      child.on('close', (code) => finish(code ?? 1));

      timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try {
          child.kill('SIGKILL');
        } catch {
          /* ignore */
        }
        reject(
          new FeelError(
            `OpenFeel CLI 调用超时（${timeoutMs}ms）: openfeel ${args.join(' ')}。若项目规模较大，可在配置中提高 openfeel.timeoutMs。`,
            { kind: 'timeout', code: 'FEEL_CLI_TIMEOUT', detail: { args, timeoutMs } },
          ),
        );
      }, timeoutMs);

      if (options.signal !== undefined) {
        if (options.signal.aborted) {
          try {
            child.kill('SIGKILL');
          } catch {
            /* ignore */
          }
        } else {
          options.signal.addEventListener(
            'abort',
            () => {
              try {
                child.kill('SIGKILL');
              } catch {
                /* ignore */
              }
            },
            { once: true },
          );
        }
      }
    });

    return result;
  }

  /**
   * 执行并以 JSON 解析输出。
   *
   * `--json` 是 OpenFeel 的机器可读契约（单文档、`schemaVersion` 开头）。
   * 退出码非 0 时，把 stderr/stdout 归一化为 FeelError。
   *
   * @param {string[]} args 必须包含 `--json` 的调用参数。
   * @param {object} [options]
   * @returns {Promise<any>}
   */
  async json(args, options = {}) {
    const result = await this.run(args, options);
    if (result.code !== 0) throw this.errorFromResult(result, args);

    const text = result.stdout.trim();
    if (text === '') {
      return { schemaVersion: 1, ok: true, raw: '' };
    }
    try {
      return JSON.parse(text);
    } catch (error) {
      throw new FeelError(
        `OpenFeel CLI 返回了非 JSON 输出（命令: openfeel ${args.join(' ')}）: ${truncate(text, 400)}`,
        { kind: 'internal', code: 'FEEL_CLI_BAD_JSON', cause: error, detail: { args } },
      );
    }
  }

  /**
   * 执行并把人类可读输出原样返回。
   * @param {string[]} args
   * @param {object} [options]
   * @returns {Promise<{ text: string, durationMs: number, argv: string[] }>}
   */
  async text(args, options = {}) {
    const result = await this.run(args, options);
    if (result.code !== 0) throw this.errorFromResult(result, args);
    return { text: result.stdout, durationMs: result.durationMs, argv: result.argv };
  }

  /**
   * 执行写命令：成功返回人类可读输出，失败抛出归一化错误。
   *
   * 写命令的门禁拒绝（例如 phase 不合法、需求 done 门未过）是**预期结果**，
   * 以 `refusal` 分类抛出，让 agent 知道「这样做不对」而不是「系统坏了」。
   *
   * @param {string[]} args
   * @param {object} [options]
   * @returns {Promise<{ ok: true, text: string, durationMs: number }>}
   */
  async write(args, options = {}) {
    const result = await this.run(args, options);
    if (result.code !== 0) throw this.errorFromResult(result, args);
    return { ok: true, text: result.stdout, durationMs: result.durationMs };
  }

  /**
   * 探测 CLI 是否可用并返回版本号。
   * @param {object} [options]
   * @returns {Promise<string | undefined>} 不可用时返回 undefined。
   */
  async probeVersion(options = {}) {
    if (this.detectedVersion !== undefined) return this.detectedVersion;
    try {
      const result = await this.run(['--version'], { ...options, timeoutMs: 20_000 });
      if (result.code !== 0) return undefined;
      const version = result.stdout.trim().split(/\r?\n/).at(-1)?.trim();
      if (version !== undefined && version !== '') this.detectedVersion = version;
      return this.detectedVersion;
    } catch {
      return undefined;
    }
  }

  /**
   * 把一次失败的 CLI 调用归一化为错误。
   *
   * OpenFeel v1.2.2+ 在 `--json` 模式下把失败也输出为单文档 envelope：
   * `{ schemaVersion, error: { code, kind, message, detail } }`。
   * 适配器优先消费它（`kind` / `code` / `message` / `detail` 原样透传），
   * 仅当 stdout 不是 envelope 时回退到旧路径。
   *
   * 退出码语义（单一权威在 CLI，这里只做翻译）：
   * - `0` 成功。
   * - `2` **flow.json 乐观并发冲突**——唯一可重试信号，恒为 `refusal`。
   * - `3` **内部故障**，恒为 `internal`。
   * - `1` 其余失败：有 envelope 时按 `error.kind`；否则沿用「有无堆栈」启发式
   *   （门禁拒绝是本地化 stderr 一行、无堆栈；内部故障会打印堆栈）。
   *
   * @param {CliResult} result
   * @param {string[]} args
   * @returns {FeelError}
   */
  errorFromResult(result, args) {
    const combined = [result.stderr, result.stdout].filter((part) => part.trim() !== '').join('\n').trim();
    const text = combined === '' ? `openfeel ${args.join(' ')} 失败（退出码 ${result.code}）` : combined;
    const context = {
      args,
      exitCode: result.code,
      stdout: truncate(result.stdout, 2000),
      stderr: truncate(result.stderr, 2000),
    };

    // 1) 新 envelope：`error` 为对象（契约 §4.3 的唯一判别规则）。
    const doc = parseErrorDocument(result.stdout);
    const envelopeError = isRecord(doc?.error) ? doc.error : undefined;
    if (envelopeError !== undefined) {
      const kind = result.code === 2
        ? 'refusal'
        : result.code === 3
          ? 'internal'
          : (envelopeError.kind === 'internal' ? 'internal' : 'refusal');
      const code = typeof envelopeError.code === 'string' && envelopeError.code !== ''
        ? envelopeError.code
        : (kind === 'internal' ? 'FEEL_CLI_INTERNAL' : 'FEEL_CLI_REFUSED');
      const baseMessage = typeof envelopeError.message === 'string' && envelopeError.message !== ''
        ? envelopeError.message
        : text;

      /** @type {Record<string, unknown>} */
      const detail = { ...context };
      if (isRecord(envelopeError.detail)) {
        Object.assign(detail, envelopeError.detail);
      } else {
        detail.envelopeDetail = envelopeError.detail ?? null;
      }

      // 退出码 2 是唯一可重试信号：保留 envelope 的 code，并附加重试提示。
      const message = result.code === 2
        ? `${baseMessage}\n\n提示：这是 flow.json 的乐观并发冲突（退出码 2，可重试）。请先重新读取状态（feel_status / feel_verify action=recover）再重试本次操作。`
        : baseMessage;
      return new FeelError(message, { kind, code, detail });
    }

    // 2) legacy `{ error: '...' }`（如 flow archive gate-rejected）：仅 `errorKind` 可作权威信号。
    const legacyKind = isRecord(doc) && typeof doc.error === 'string'
      && (doc.errorKind === 'refusal' || doc.errorKind === 'internal')
      ? doc.errorKind
      : undefined;

    // 退出码 2：唯一可重试信号（flow.json revision CAS 冲突）。
    if (result.code === 2) {
      return new FeelError(
        `${text}\n\n提示：这是 flow.json 的乐观并发冲突（退出码 2，可重试）。请先重新读取状态（feel_status / feel_verify action=recover）再重试本次操作。`,
        {
          kind: 'refusal',
          code: 'FEEL_FLOW_CONCURRENT',
          detail: isRecord(doc) && typeof doc.error === 'string' ? { ...context, legacyError: doc.error } : context,
        },
      );
    }

    // 退出码 3：内部故障（v1.2.2+ 的稳定信号）。
    if (result.code === 3) {
      return new FeelError(text, {
        kind: 'internal',
        code: 'FEEL_CLI_INTERNAL',
        detail: isRecord(doc) && typeof doc.error === 'string' ? { ...context, legacyError: doc.error } : context,
      });
    }

    // 堆栈特征是「内部故障」的可靠标志；拒绝路径从不打印堆栈。
    const hasStack = /^\s+at\s+/m.test(text);
    const internalSignals = [
      /Cannot find module/i,
      /SyntaxError/i,
      /Unexpected token/i,
      /EACCES\b|EPERM\b|ENOSPC\b/,
      /\[ERROR\]\[/,
    ];
    const isInternal = legacyKind === 'internal'
      || (legacyKind === undefined && (hasStack || internalSignals.some((pattern) => pattern.test(text))));

    return new FeelError(text, {
      kind: isInternal ? 'internal' : 'refusal',
      code: isInternal ? 'FEEL_CLI_INTERNAL' : 'FEEL_CLI_REFUSED',
      detail: isRecord(doc) && typeof doc.error === 'string' ? { ...context, legacyError: doc.error } : context,
    });
  }
}

/**
 * 解析 stdout 里的错误 JSON 文档。
 *
 * 只接受单个 JSON 对象；空输出、人类文本、数组与非法 JSON 均返回 undefined，
 * 由调用方回退到 legacy / 启发式路径。
 *
 * @param {string} stdout
 * @returns {Record<string, any> | undefined}
 */
function parseErrorDocument(stdout) {
  const text = stdout.trim();
  if (text === '' || !text.startsWith('{')) return undefined;
  try {
    const doc = JSON.parse(text);
    return isRecord(doc) ? doc : undefined;
  } catch {
    return undefined;
  }
}

/**
 * 判定是否为普通对象（排除 null 与数组）。
 * @param {unknown} value
 * @returns {value is Record<string, any>}
 */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 截断长文本用于错误消息。
 * @param {string} text
 * @param {number} max
 * @returns {string}
 */
export function truncate(text, max) {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…（已截断，共 ${text.length} 字符）`;
}

/**
 * 取错误消息。
 * @param {unknown} error
 * @returns {string}
 */
function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * 判定是否为已存在的普通文件。
 * @param {string} path
 * @returns {boolean}
 */
function isFile(path) {
  try {
    return existsSync(path) && statSync(path).isFile();
  } catch {
    return false;
  }
}
