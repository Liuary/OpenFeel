/**
 * OpenFeel × DSH 适配器 — 工作区解析
 *
 * OpenFeel CLI 以 `process.cwd()` 作为项目根。适配器的职责是把
 * **DSH 会话的工作区**翻译成 CLI 的 `cwd`，因此这里只做两件事：
 * 1. 从工具执行上下文取会话工作区（`exec.agent.session.header.cwd`）。
 * 2. 向上回溯定位 `.openfeel/` 根，并给出「是否已初始化 OpenFeel」的结论。
 */

import { existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { FeelError } from './cli.js';

/** `.openfeel` 目录名（与 OpenFeel 单一约定一致）。 */
export const OPENFEEL_DIR = '.openfeel';

/**
 * 从工具执行上下文解析会话工作区目录。
 *
 * @param {object} exec DSH 工具执行上下文。
 * @param {string} [fallback] 兜底目录（通常是插件进程的 cwd）。
 * @returns {string} 绝对路径。
 * @throws {FeelError} 无法确定工作区时。
 */
export function resolveSessionCwd(exec, fallback) {
  const fromSession = exec?.agent?.session?.header?.cwd;
  if (typeof fromSession === 'string' && fromSession !== '') {
    return resolve(fromSession);
  }
  if (typeof fallback === 'string' && fallback !== '') return resolve(fallback);
  const fromProcess = process.cwd();
  if (typeof fromProcess === 'string' && fromProcess !== '') return resolve(fromProcess);
  throw new FeelError('无法确定 OpenFeel 项目目录：当前会话没有工作区，且没有可用的兜底目录', {
    kind: 'usage',
    code: 'FEEL_NO_WORKSPACE',
  });
}

/**
 * 自 `from` 向上回溯，寻找包含 `.openfeel/` 的目录。
 *
 * @param {string} from 起始目录。
 * @returns {string | undefined} 找到的项目根（绝对路径）。
 */
export function findProjectRoot(from) {
  let current = resolve(from);
  for (let depth = 0; depth < 64; depth++) {
    if (isDirectory(join(current, OPENFEEL_DIR))) return current;
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
  return undefined;
}

/**
 * 解析「要操作哪个 OpenFeel 项目」。
 *
 * 语义：
 * - 显式 `projectPath` 优先（必须存在且含 `.openfeel/`）。
 * - 否则从会话工作区向上回溯。
 * - 两者都失败时，返回会话工作区并标记 `initialized: false`，
 *   由上层决定是提示 `openfeel init` 还是直接失败。
 *
 * @param {object} exec 工具执行上下文。
 * @param {object} [options]
 * @param {string} [options.projectPath] 显式项目路径（相对路径按会话工作区解析）。
 * @param {string} [options.fallback] 兜底目录。
 * @returns {{ projectRoot: string, sessionCwd: string, initialized: boolean, openfeelDir: string }}
 */
export function resolveWorkspace(exec, options = {}) {
  const sessionCwd = resolveSessionCwd(exec, options.fallback);

  if (options.projectPath !== undefined && options.projectPath !== '') {
    const explicit = resolve(sessionCwd, options.projectPath);
    if (!isDirectory(explicit)) {
      throw new FeelError(`指定的 OpenFeel 项目路径不存在或不是目录: ${explicit}`, {
        kind: 'usage',
        code: 'FEEL_PROJECT_NOT_FOUND',
        detail: { projectPath: explicit },
      });
    }
    const openfeelDir = join(explicit, OPENFEEL_DIR);
    if (!isDirectory(openfeelDir)) {
      throw new FeelError(
        `指定的目录不是 OpenFeel 项目（缺少 ${OPENFEEL_DIR}/）：${explicit}。请先在该目录运行 \`openfeel init\`，或省略 project 参数以使用当前会话工作区。`,
        { kind: 'usage', code: 'FEEL_NOT_A_PROJECT', detail: { projectPath: explicit } },
      );
    }
    return { projectRoot: explicit, sessionCwd, initialized: true, openfeelDir };
  }

  const found = findProjectRoot(sessionCwd);
  if (found !== undefined) {
    return { projectRoot: found, sessionCwd, initialized: true, openfeelDir: join(found, OPENFEEL_DIR) };
  }

  return {
    projectRoot: sessionCwd,
    sessionCwd,
    initialized: false,
    openfeelDir: join(sessionCwd, OPENFEEL_DIR),
  };
}

/**
 * 判定是否为已存在目录。
 * @param {string} path
 * @returns {boolean}
 */
export function isDirectory(path) {
  try {
    return existsSync(path) && statSync(path).isDirectory();
  } catch {
    return false;
  }
}
