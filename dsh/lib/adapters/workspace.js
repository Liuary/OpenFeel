/**
 * OpenFeel × DSH 适配器 — 工作区解析
 *
 * **语义与 OpenFeel CLI 严格一致：cwd 即项目根，不向上回溯。**
 *
 * 为什么明确禁止回溯（实测依据）：
 * - `openfeel flow status --json` 在 `%TEMP%\...\a\b\c`（祖先含 `~/.openfeel/`）返回
 *   **空态**而非该祖先的项目数据 ⇒ CLI 只认 `process.cwd()`，从不回溯。
 * - `~/.openfeel/` 是 `openfeel setup` 建立的**跨项目全局家目录**（`config.json` /
 *   `cli/` / `locks/` / `secrets/`），**不含** `flow.json` 或 `config.yaml`。
 *
 * 若适配器自行回溯，就会把「全局家目录」误判成「项目」——这正是曾经出现
 * 「在任意目录开会话都显示『当前项目 C:\Users\Liuary』」的根因。
 *
 * 因此本模块只做三件事：
 * 1. 从工具执行上下文取会话工作区（`exec.agent.session.header.cwd`）。
 * 2. 判定**该目录本身**是否为 OpenFeel 项目工作区（以 `flow.json` / `config.yaml` 为标记）。
 * 3. 区分「不是项目」与「这是全局家目录」两种失败，给出可操作的诊断。
 *
 * 若将来需要 monorepo（子目录里工作），那属于 **OpenFeel 的能力**——应由 CLI 提供
 * `openfeel project resolve --json` 供各适配器消费，而不是每个 harness 各写一套回溯。
 */

import { existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { FeelError } from './cli.js';

/** `.openfeel` 目录名（与 OpenFeel 单一约定一致）。 */
export const OPENFEEL_DIR = '.openfeel';

/**
 * 项目工作区的标记文件（任一存在即视为项目）。
 *
 * - `flow.json`：`openfeel init` 必然创建，是核心数据存储。
 * - `config.yaml`：同为 `init` 产物（`flow.json` 被手工删除时的兜底判据）。
 *
 * 全局家目录 `~/.openfeel/` 两者皆无，因此不会被误判。
 */
export const PROJECT_MARKERS = /** @type {const} */ (['flow.json', 'config.yaml']);

/**
 * 从工具执行上下文解析会话工作区目录。
 *
 * @param {object} exec DSH 工具执行上下文（`{ agent }` 亦可）。
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
 * 判定某个目录**本身**是否为 OpenFeel 项目工作区（不回溯）。
 *
 * @param {string} dir 待判定目录（绝对路径）。
 * @returns {boolean}
 */
export function isProjectWorkspace(dir) {
  const openfeelDir = join(dir, OPENFEEL_DIR);
  if (!isDirectory(openfeelDir)) return false;
  return PROJECT_MARKERS.some((marker) => existsSync(join(openfeelDir, marker)));
}

/**
 * 判定某个目录的 `.openfeel/` 是否为「全局家目录」形态（存在但无项目标记）。
 *
 * @param {string} dir 待判定目录。
 * @returns {boolean}
 */
export function isGlobalHomeLike(dir) {
  const openfeelDir = join(dir, OPENFEEL_DIR);
  if (!isDirectory(openfeelDir)) return false;
  return !PROJECT_MARKERS.some((marker) => existsSync(join(openfeelDir, marker)));
}

/**
 * 解析「要操作哪个 OpenFeel 项目」。
 *
 * 语义（与 CLI 对齐，**不回溯**）：
 * - 显式 `projectPath` 优先：必须是项目工作区，否则报错（相对路径按会话工作区解析）。
 * - 否则以**会话工作区本身**为项目根候选。
 * - 候选不是项目时返回 `initialized: false`，由上层决定提示 `openfeel init` 还是不注入提示。
 *
 * @param {object} exec 工具执行上下文（或 `{ agent }`）。
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
    if (!isProjectWorkspace(explicit)) {
      // 区分「压根没有 .openfeel/」与「有 .openfeel/ 但那是全局家目录形态」。
      const isGlobalHome = isGlobalHomeLike(explicit);
      throw new FeelError(
        isGlobalHome
          ? `指定的目录含 ${OPENFEEL_DIR}/ 但那是 OpenFeel 的**全局配置目录**（无 flow.json / config.yaml），不是项目工作区：${explicit}。`
            + '请把 project 指向真正的项目根（含 .openfeel/flow.json），或省略该参数以使用当前会话工作区。'
          : `指定的目录不是 OpenFeel 项目（缺少 ${OPENFEEL_DIR}/ 或 ${OPENFEEL_DIR}/flow.json）：${explicit}。`
            + '请先在该目录运行 `openfeel init`，或省略 project 参数以使用当前会话工作区。',
        { kind: 'usage', code: 'FEEL_NOT_A_PROJECT', detail: { projectPath: explicit, isGlobalHome } },
      );
    }
    return { projectRoot: explicit, sessionCwd, initialized: true, openfeelDir: join(explicit, OPENFEEL_DIR) };
  }

  // 不回溯：会话工作区**本身**即项目根候选。
  const initialized = isProjectWorkspace(sessionCwd);
  return {
    projectRoot: sessionCwd,
    sessionCwd,
    initialized,
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
