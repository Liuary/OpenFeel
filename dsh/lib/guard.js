/**
 * OpenFeel × DSH — 写入门禁
 *
 * 用 DSH 的 `ctx.tools.guard()` 在工具执行前做**同步拒绝**。守卫只读
 * `.openfeel/flow.json`，不写任何状态；所有状态变更仍由 OpenFeel CLI 负责。
 *
 * 规则（与 `.openfeel/plan/v1/stage-103/plan.md` 一致）：
 * - 只守文件修改工具（默认 edit/write/apply_patch/str_replace_editor）；
 * - `.openfeel/**` 是流程产物区，任意阶段可写；但 flow.json / status.md 始终拒绝；
 * - `.openfeel/` 外的源码/文档要求存在 `exec_running` 阶段（或 general 需求例外）；
 * - 无 `.openfeel/` 时：`always` 拒绝全部写文件，`project`/`off` 放行；
 * - `apply_patch` 解析所有 patch 头目标，混合/无头时保守拒绝。
 *
 * @module openfeel-dsh/guard
 */

import { readFileSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

import { isProjectWorkspace, OPENFEEL_DIR } from './adapters/workspace.js';

/** 默认受守卫的文件修改工具。 */
export const DEFAULT_MUTATING_TOOLS = Object.freeze([
  'edit',
  'write',
  'apply_patch',
  'str_replace_editor',
]);

/**
 * 大小写不敏感文件系统：Windows + 默认 macOS（APFS/HFS+）。
 * 在这两类平台上把路径统一小写，防止 `.OPENFEEL/FLOW.JSON` 绕过。
 * 导出以允许在任意平台测试该分支（platform 可注入）。
 *
 * @param {string} value
 * @param {NodeJS.Platform} [platform]
 * @returns {string}
 */
export function normalizeForComparison(value, platform = process.platform) {
  return platform === 'win32' || platform === 'darwin' ? value.toLowerCase() : value;
}

/** flow.json 读取缓存（path → { mtimeMs, size, value }）。 */
const flowCache = new Map();

/**
 * 归一化路径：绝对化 + Windows 小写。
 * @param {string} cwd
 * @param {string} target
 * @returns {string}
 */
function normalizeTarget(cwd, target) {
  const absolute = resolve(cwd, target);
  return normalizeForComparison(absolute);
}

/**
 * 去引号并去空白（patch 头里的路径可能带引号/空格）。
 * @param {string} raw
 * @returns {string}
 */
function cleanPatchPath(raw) {
  let value = String(raw).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1).trim();
  }
  return value;
}

/**
 * 是否为 `.openfeel/` 下的路径（含目录本身）。
 * @param {string} absolute 已归一化
 * @param {string} cwd 归一化后的工作区
 * @returns {boolean}
 */
function isUnderOpenFeel(absolute, cwd) {
  const root = normalizeTarget(cwd, OPENFEEL_DIR);
  return absolute === root || absolute.startsWith(`${root}\\`) || absolute.startsWith(`${root}/`);
}

/**
 * 是否为受保护路径（flow.json / `.openfeel/**\/status.md`）。
 * @param {string} absolute 已归一化
 * @param {string} cwd 归一化后的工作区
 * @returns {boolean}
 */
function isProtectedPath(absolute, cwd) {
  const flow = normalizeTarget(cwd, join(OPENFEEL_DIR, 'flow.json'));
  if (absolute === flow) return true;
  return isUnderOpenFeel(absolute, cwd) && basename(absolute).toLowerCase() === 'status.md';
}

/**
 * 从工具参数提取目标路径（edit/write/str_replace_editor）。
 * @param {unknown} args
 * @returns {string[]}
 */
function extractArgumentPaths(args) {
  if (typeof args !== 'object' || args === null) return [];
  const out = [];
  for (const key of ['path', 'file_path', 'filePath', 'target_file', 'targetFile']) {
    const value = /** @type {Record<string, unknown>} */ (args)[key];
    if (typeof value === 'string' && value.trim() !== '') out.push(value.trim());
  }
  return out;
}

/**
 * 从 apply_patch 参数提取 patch 文本。
 * @param {unknown} args
 * @returns {string | undefined}
 */
function extractPatchText(args) {
  if (typeof args !== 'object' || args === null) return undefined;
  for (const key of ['patch', 'input', 'diff', 'content']) {
    const value = /** @type {Record<string, unknown>} */ (args)[key];
    if (typeof value === 'string' && value.trim() !== '') return value;
  }
  return undefined;
}

/**
 * 解析 apply_patch 的全部目标路径。
 *
 * 只认 patch 头，避免正文里出现 `.openfeel/` 被误判。支持：
 * - `*** Update File:`, `*** Add File:`, `*** Delete File:`
 * - `*** Move to:`（要求同块 `*** Update File:` 源，否则拒绝）
 * - `--- a/path`, `+++ b/path`；忽略 `/dev/null`
 *
 * @param {string} patch
 * @returns {{ ok: true, paths: string[] } | { ok: false, reason: string }}
 */
export function parsePatchTargets(patch) {
  const paths = [];
  const seen = new Set();
  const add = (raw) => {
    const value = cleanPatchPath(raw);
    if (value === '' || value === '/dev/null') return;
    if (seen.has(value)) return;
    seen.add(value);
    paths.push(value);
  };

  // 按块跟踪：*** Move to: 必须位于同一块 *** Update File: 之后。
  let currentBlock = null;
  for (const line of patch.split(/\r?\n/)) {
    const update = /^\*\*\* Update File:\s*(.+?)\s*$/.exec(line);
    if (update !== null) {
      currentBlock = 'update';
      add(update[1]);
      continue;
    }
    const addFile = /^\*\*\* Add File:\s*(.+?)\s*$/.exec(line);
    if (addFile !== null) {
      currentBlock = 'add';
      add(addFile[1]);
      continue;
    }
    const deleteFile = /^\*\*\* Delete File:\s*(.+?)\s*$/.exec(line);
    if (deleteFile !== null) {
      currentBlock = 'delete';
      add(deleteFile[1]);
      continue;
    }
    const move = /^\*\*\* Move to:\s*(.+?)\s*$/.exec(line);
    if (move !== null) {
      if (currentBlock !== 'update') {
        return { ok: false, reason: '*** Move to: 缺少同块 *** Update File: 源路径' };
      }
      add(move[1]);
      continue;
    }
    if (/^\*\*\* (?:Begin|End) Patch/.test(line)) {
      currentBlock = null;
      continue;
    }
    const diff = /^(?:---|\+\+\+) [ab]\/(.+?)\s*$/.exec(line);
    if (diff !== null) add(diff[1]);
  }

  if (paths.length === 0) {
    return { ok: false, reason: '无法从 patch 头确定目标路径' };
  }
  return { ok: true, paths };
}

/**
 * 读取 flow.json（同步、按 mtime/size 缓存）。
 * @param {string} cwd
 * @returns {{ ok: true, value: any } | { ok: false, reason: string }}
 */
function readFlow(cwd) {
  const path = join(cwd, OPENFEEL_DIR, 'flow.json');
  try {
    const stat = statSync(path);
    const cached = flowCache.get(path);
    if (cached !== undefined && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
      return { ok: true, value: cached.value };
    }
    const value = JSON.parse(readFileSync(path, 'utf8'));
    flowCache.set(path, { mtimeMs: stat.mtimeMs, size: stat.size, value });
    return { ok: true, value };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 是否存在 general 模式的 in_progress 需求（允许无阶段直接改）。
 * @param {any} flow
 * @returns {boolean}
 */
function hasGeneralRequirement(flow) {
  const requirements = flow?.requirements;
  if (!Array.isArray(requirements)) return false;
  return requirements.some((requirement) => requirement
    && requirement.status === 'in_progress'
    && requirement.workflow_mode === 'general');
}

/** 活跃阶段（phase !== done）。 */
function activeStages(flow) {
  const stages = flow?.stages;
  if (typeof stages !== 'object' || stages === null) return [];
  return Object.entries(stages)
    .filter(([, stage]) => stage && stage.phase !== 'done')
    .map(([id, stage]) => ({ ...stage, id }));
}

/**
 * 生成守卫。
 *
 * @param {object} options
 * @param {'off'|'project'|'always'} [options.enforce]
 * @param {string[]} [options.mutatingTools]
 * @param {boolean} [options.allowGeneral]
 * @param {'zh-CN'|'en'} [options.language]
 * @param {string} [options.cwd] 无会话时的兜底目录（通常为 config.cwd）
 * @returns {(execution: { name?: string, arguments?: unknown, agent?: { session?: { header?: { cwd?: string } } } }) => string | undefined}
 */
export function createOpenFeelGuard(options = {}) {
  const enforce = options.enforce === 'off' || options.enforce === 'project' || options.enforce === 'always'
    ? options.enforce
    : 'always';
  const mutating = new Set(Array.isArray(options.mutatingTools) && options.mutatingTools.length > 0
    ? options.mutatingTools
    : DEFAULT_MUTATING_TOOLS);
  const allowGeneral = options.allowGeneral !== false;
  const english = options.language === 'en';
  const fallbackCwd = typeof options.cwd === 'string' && options.cwd !== '' ? options.cwd : undefined;

  const t = (zh, en) => (english ? en : zh);

  if (enforce === 'off') {
    // 完全关闭：连 flow.json/status.md 也不拦。
    return () => undefined;
  }

  return (execution) => {
    const name = execution?.name;
    if (typeof name !== 'string' || !mutating.has(name)) return undefined;

    const sessionCwd = execution?.agent?.session?.header?.cwd;
    const cwd = typeof sessionCwd === 'string' && sessionCwd !== '' ? sessionCwd : fallbackCwd;
    if (typeof cwd !== 'string' || cwd === '') return undefined;
    const resolvedCwd = resolve(cwd);
    const normalizedCwd = normalizeForComparison(resolvedCwd);

    let rawTargets;
    if (name === 'apply_patch') {
      const patch = extractPatchText(execution?.arguments);
      if (patch === undefined) {
        return t(
          'OpenFeel 写入门禁：apply_patch 缺少 patch 文本，无法确定目标；请改用 write/edit，或提供标准 patch 头。',
          'OpenFeel write guard: apply_patch has no patch text, so targets are unknown. Use write/edit, or provide standard patch headers.',
        );
      }
      const parsed = parsePatchTargets(patch);
      if (!parsed.ok) {
        return t(
          `OpenFeel 写入门禁：${parsed.reason}。请改用 write/edit，或提供 *** Update File: 等标准头。`,
          `OpenFeel write guard: ${parsed.reason}. Use write/edit, or provide standard *** Update File: headers.`,
        );
      }
      rawTargets = parsed.paths;
    } else {
      rawTargets = extractArgumentPaths(execution?.arguments);
      if (rawTargets.length === 0) {
        return t(
          'OpenFeel 写入门禁：无法确定目标路径；请提供 path / file_path。',
          'OpenFeel write guard: cannot determine the target path; provide path / file_path.',
        );
      }
    }

    const targets = rawTargets.map((target) => normalizeTarget(resolvedCwd, target));

    // 受保护路径：guard 启用时始终拒绝（enforce=off 已提前返回）。
    if (targets.some((target) => isProtectedPath(target, normalizedCwd))) {
      return t(
        'OpenFeel 写入门禁：禁止手改 `.openfeel/flow.json` 或 `.openfeel/**/status.md`。请改用 feel_flow / feel_stage 等 CLI 工具。',
        'OpenFeel write guard: never hand-edit `.openfeel/flow.json` or `.openfeel/**/status.md`. Use feel_flow / feel_stage instead.',
      );
    }

    const initialized = isProjectWorkspace(resolvedCwd);
    if (!initialized) {
      if (enforce === 'always') {
        return t(
          'OpenFeel 写入门禁：当前工作区尚未初始化 OpenFeel（无 `.openfeel/`）。请先运行 `openfeel init` 并建立需求/阶段；或让用户把 profile 的 `enforce` 改为 `project` / `off`。',
          'OpenFeel write guard: this workspace is not OpenFeel-initialized (no `.openfeel/`). Run `openfeel init` and create a requirement/stage first; or ask the user to set `enforce` to `project` / `off`.',
        );
      }
      return undefined;
    }

    const allInternal = targets.every((target) => isUnderOpenFeel(target, normalizedCwd));
    if (allInternal) return undefined;

    const flow = readFlow(resolvedCwd);
    if (!flow.ok) {
      return t(
        `OpenFeel 写入门禁：无法读取 .openfeel/flow.json（${flow.reason}）。请运行 feel_verify action=health。`,
        `OpenFeel write guard: cannot read .openfeel/flow.json (${flow.reason}). Run feel_verify action=health.`,
      );
    }

    const active = activeStages(flow.value);
    if (active.length === 0) {
      if (allowGeneral && hasGeneralRequirement(flow.value)) return undefined;
      return t(
        'OpenFeel 写入门禁：当前无活跃阶段，不能修改源码/文档。请先 feel_req add → claim → feel_stage add 建立阶段。',
        'OpenFeel write guard: no active stage, so source/docs are read-only. Create a stage via feel_req add → claim → feel_stage add.',
      );
    }

    if (active.some((stage) => stage.phase === 'exec_running')) return undefined;

    const summary = active
      .map((stage) => `${stage.id ?? '(unknown)'}=${stage.phase ?? '(unknown)'}`)
      .join(', ');
    return t(
      `OpenFeel 写入门禁：活跃阶段当前不在 exec_running（${summary}），不能修改源码/文档。请先 feel_flow action=advance 推进到 exec_running。`,
      `OpenFeel write guard: active stage(s) are not in exec_running (${summary}), so source/docs are read-only. Advance to exec_running with feel_flow action=advance.`,
    );
  };
}

/**
 * 测试用：清空 flow.json 缓存。
 */
export function clearGuardCache() {
  flowCache.clear();
}
