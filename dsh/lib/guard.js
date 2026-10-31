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

import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';

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

/** 文档/笔记类扩展名（写门禁按产物类型分层：doc/note 不绑相位）。 */
export const DOC_EXTENSIONS = Object.freeze(['.md', '.mdx', '.txt', '.rst', '.adoc']);

/**
 * 静态展示资源扩展名（v1.4.0；与 doc 同层：任意相位可写，不要求活跃阶段）。
 * 依据：反馈 `openfeel-write-gate-friction-2026-10-30.md` —— UI 微调无执行语义。
 */
export const PRESENTATIONAL_EXTENSIONS = Object.freeze([
  '.css', '.scss', '.html', '.svg', '.png', '.jpg', '.jpeg', '.webp',
]);

/**
 * 源码扩展名（v1.4.0）：`assets/**` / `public/**` 的目录豁免**不得**覆盖这些扩展名，
 * 保证「源码仍严格要求 exec_running」这条底线（`assets/gen.ts` 仍是源码）。
 */
export const SOURCE_EXTENSIONS = Object.freeze([
  '.rs', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py',
  '.go', '.java', '.rb', '.c', '.cc', '.cpp', '.h', '.hpp', '.cs',
  '.php', '.swift', '.kt', '.kts', '.scala', '.sh', '.bash', '.ps1',
  '.lua', '.dart', '.ex', '.exs',
]);

/**
 * 是否为文档/笔记类目标（P0-4）：扩展名命中，或位于**工作区根级 `docs/`** 下。
 * v1.3.3 复核：`docs` 必须直接位于会话工作区下（`src/docs/x.ts` 不算文档，防源码借名绕过相位门）。
 * 仅用于「放行 doc/note」；源代码仍按 `exec_running` 严格判定。
 * @param {string} absolute 已归一化绝对路径
 * @param {string} cwd 已归一化工作区
 * @returns {boolean}
 */
function isDocPath(absolute, cwd) {
  if (DOC_EXTENSIONS.includes(extname(absolute).toLowerCase())) return true;
  const docsRoot = normalizeTarget(cwd, 'docs');
  return absolute === docsRoot
    || absolute.startsWith(`${docsRoot}\\`)
    || absolute.startsWith(`${docsRoot}/`);
}

/**
 * 是否为研究/方案产物（v1.5.2）：工作区根级 `docs/research/**`。
 *
 * 这类文件是**阶段交付物**而非随手笔记：即使 doc 层原本任意相位可写，
 * 无活跃阶段时也要求先建立阶段，防止以「只读调研」为由跳过流程。
 * @param {string} absolute 已归一化绝对路径
 * @param {string} cwd 已归一化工作区
 * @returns {boolean}
 */
function isResearchArtifactPath(absolute, cwd) {
  const root = normalizeTarget(cwd, 'docs/research');
  return absolute === root
    || absolute.startsWith(`${root}\\`)
    || absolute.startsWith(`${root}/`);
}

/**
 * 是否位于工作区内（bootstrap 例外边界；防 `..`/绝对路径写出工作区）。
 * @param {string} absolute 已归一化绝对路径
 * @param {string} cwd 已归一化工作区
 * @returns {boolean}
 */
function isUnderWorkspace(absolute, cwd) {
  return absolute === cwd || absolute.startsWith(`${cwd}\\`) || absolute.startsWith(`${cwd}/`);
}

/**
 * 是否为**静态展示资源**（v1.4.0；与 doc 同层豁免）。
 *
 * 命中条件（任一）：
 * - 扩展名 ∈ `PRESENTATIONAL_EXTENSIONS`（css/scss/html/svg/png/jpg/jpeg/webp）；
 * - 路径任一段为 `assets` 或 `public`（支持 `crates/cli/assets/index.html` 这类嵌套资产目录）。
 *
 * 源码扩展名（`.rs/.ts/.js/.py` 等）不在此列；混合目标仍按源码规则从严。
 * @param {string} absolute 已归一化绝对路径
 * @returns {boolean}
 */
export function isPresentationalAssetPath(absolute) {
  const ext = extname(absolute).toLowerCase();
  if (PRESENTATIONAL_EXTENSIONS.includes(ext)) return true;
  // 目录豁免不覆盖源码扩展名（`assets/gen.ts` 仍按源码门禁）。
  if (SOURCE_EXTENSIONS.includes(ext)) return false;
  const segments = absolute.split(/[\\/]/);
  return segments.includes('assets') || segments.includes('public');
}

/** doc + 静态展示资源合并豁免判据（v1.4.0）。 */
function isExemptPath(absolute, cwd) {
  return isDocPath(absolute, cwd) || isPresentationalAssetPath(absolute);
}

/**
 * 写入门禁审计（v1.4.0 / v1.5.2）：放行与拒绝都追加 JSONL 到 `.openfeel/log/guard-audit.jsonl`。
 * best-effort：任何写失败都吞掉，不影响判定结果。
 * @param {string} cwd 已归一化工作区
 * @param {{ event?: 'guard_allow'|'guard_deny', tool: string, reason: string, phase: string, paths: string[] }} event
 */
function recordGuardAudit(cwd, event) {
  try {
    const logDir = join(cwd, '.openfeel', 'log');
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true });
    }
    const entry = {
      time: new Date().toISOString(),
      event: event.event ?? 'guard_allow',
      tool: event.tool,
      reason: event.reason,
      phase: event.phase,
      paths: event.paths,
    };
    appendFileSync(join(logDir, 'guard-audit.jsonl'), `${JSON.stringify(entry)}\n`, 'utf-8');
  } catch {
    /* 审计写失败不阻塞放行 */
  }
}

/**
 * 读取 chore 写窗口（v1.4.0；`.openfeel/chore.json`）。
 * 仅当文件存在、JSON 合法且 `expires_at` 未过期时返回对象，否则 null。
 * @param {string} cwd 已归一化工作区
 * @returns {{ id?: string, note?: string, expires_at?: string } | null}
 */
function readActiveChore(cwd) {
  try {
    const chorePath = join(cwd, '.openfeel', 'chore.json');
    if (!existsSync(chorePath)) return null;
    const raw = JSON.parse(readFileSync(chorePath, 'utf-8'));
    if (typeof raw !== 'object' || raw === null) return null;
    const expiresAt = typeof raw.expires_at === 'string' ? Date.parse(raw.expires_at) : NaN;
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
    return raw;
  } catch {
    return null;
  }
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
 * 解析 apply_patch 的全部目标路径与变更类型。
 *
 * 只认 patch 头，避免正文里出现 `.openfeel/` 被误判。支持：
 * - `*** Update File:`, `*** Add File:`, `*** Delete File:`
 * - `*** Move to:`（要求同块 `*** Update File:` 源，否则拒绝）
 * - `--- a/path`, `+++ b/path`；忽略 `/dev/null`
 *
 * 返回 `entries`（路径 + kind）供 bootstrap 例外判定「是否纯新增」：
 * kind ∈ `add | update | delete | move`；同一路径出现多种 kind 时从严记 `update`。
 *
 * @param {string} patch
 * @returns {{ ok: true, paths: string[], entries: Array<{ path: string, kind: string }> } | { ok: false, reason: string }}
 */
export function parsePatchTargets(patch) {
  const paths = [];
  const kinds = new Map();
  const seen = new Set();
  const add = (raw, kind) => {
    const value = cleanPatchPath(raw);
    if (value === '' || value === '/dev/null') return;
    const prev = kinds.get(value);
    if (prev === undefined) {
      kinds.set(value, kind);
    } else if (prev !== kind) {
      kinds.set(value, 'update'); // 同路径混合 kind → 从严（bootstrap 例外不成立）
    }
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
      add(update[1], 'update');
      continue;
    }
    const addFile = /^\*\*\* Add File:\s*(.+?)\s*$/.exec(line);
    if (addFile !== null) {
      currentBlock = 'add';
      add(addFile[1], 'add');
      continue;
    }
    const deleteFile = /^\*\*\* Delete File:\s*(.+?)\s*$/.exec(line);
    if (deleteFile !== null) {
      currentBlock = 'delete';
      add(deleteFile[1], 'delete');
      continue;
    }
    const move = /^\*\*\* Move to:\s*(.+?)\s*$/.exec(line);
    if (move !== null) {
      if (currentBlock !== 'update') {
        return { ok: false, reason: '*** Move to: 缺少同块 *** Update File: 源路径' };
      }
      add(move[1], 'move');
      continue;
    }
    if (/^\*\*\* (?:Begin|End) Patch/.test(line)) {
      currentBlock = null;
      continue;
    }
    const diff = /^(?:---|\+\+\+) [ab]\/(.+?)\s*$/.exec(line);
    if (diff !== null) add(diff[1], 'update');
  }

  if (paths.length === 0) {
    return { ok: false, reason: '无法从 patch 头确定目标路径' };
  }
  return { ok: true, paths, entries: paths.map((path) => ({ path, kind: kinds.get(path) })) };
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
  /** bootstrap 例外提示去重（按工作区路径）。 */
  const bootstrapHinted = new Set();

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
    let patchEntries = null;
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
      patchEntries = parsed.entries;
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
    // doc + 静态展示资源合并豁免（v1.4.0）；混合目标须**全部**命中豁免才放行
    const allExempt = targets.every((target) => isExemptPath(target, normalizedCwd));

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
        // P0-1 bootstrap 例外：空工作区 + 全部为「新增文件」→ 放行（最高风险等级不成立）。
        // apply_patch 额外要求全部 block 为 `*** Add File:`（Update/Delete/Move/混合一律从严）。
        // `.openfeel/**` 不适用：流程产物仍要求先 init（B8）。
        const allNew = targets.every((target) => !existsSync(target));
        const anyInternal = targets.some((target) => isUnderOpenFeel(target, normalizedCwd));
        const allInside = targets.every((target) => isUnderWorkspace(target, normalizedCwd));
        const addOnly = patchEntries === null || patchEntries.every((entry) => entry.kind === 'add');
        if (allNew && addOnly && !anyInternal && allInside) {
          if (!bootstrapHinted.has(normalizedCwd)) {
            bootstrapHinted.add(normalizedCwd);
            process.stderr.write(
              `${t(
                'OpenFeel 写入门禁：[bootstrap] 工作区尚未初始化，已放行本次新增文件；建议稍后运行 `openfeel init` 补账本。',
                'OpenFeel write guard: [bootstrap] workspace not initialized; this new-file write was allowed. Run `openfeel init` later to record it.',
              )}\n`,
            );
          }
          return undefined;
        }
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
    // v1.5.2 入口闸：研究/方案产物（docs/research/**）是阶段交付物，无活跃阶段时不得写入；
    // chore 也不能绕过（在下方 chore 放行之前判定）。
    if (active.length === 0 && targets.some((target) => isResearchArtifactPath(target, normalizedCwd))) {
      recordGuardAudit(normalizedCwd, {
        event: 'guard_deny',
        tool: name,
        reason: 'research-needs-stage',
        phase: 'done',
        paths: targets,
      });
      return t(
        'OpenFeel 写入门禁：研究/方案产物（docs/research/**）要求有开启的阶段。请先按当前小版本开一个阶段（保持 exec_running），再 feel_req add → claim 建需求并写调研/方案。纯只读问答无需落盘。',
        'OpenFeel write guard: research/proposal artifacts (docs/research/**) require an open stage. Open a stage for the current minor version (keep it in exec_running), then feel_req add → claim before writing. Pure read-only Q&A needs no file.',
      );
    }
    if (active.length === 0) {
      if (allowGeneral && hasGeneralRequirement(flow.value)) return undefined;
      // v1.4.0 chore 通道：仅在**无活跃阶段**时生效；受保护路径已在上方拒绝。
      const chore = readActiveChore(normalizedCwd);
      if (chore !== null) {
        recordGuardAudit(normalizedCwd, { tool: name, reason: 'chore', phase: 'done', paths: targets });
        return undefined;
      }
      // P0-4/v1.4.0：doc/note 与静态展示资源不要求活跃阶段（收口后仍可写）；混合目标从严。
      if (allExempt) {
        recordGuardAudit(normalizedCwd, { tool: name, reason: 'doc-asset', phase: 'done', paths: targets });
        return undefined;
      }
      return t(
        'OpenFeel 写入门禁：无活跃阶段，不能修改源码/文档（当前没有开启的阶段）。默认按当前小版本开一个阶段并保持 exec_running（feel_stage add stage=<vX.Y.Z-stage-N>），再在该版本下建需求推进；需求完成不要求关闭阶段。',
        'OpenFeel write guard: no active stage (no open stage), so source/docs are read-only. Open a stage for the current minor version and keep it in exec_running (feel_stage add stage=<vX.Y.Z-stage-N>), then add requirements under that version; requirement completion does not require closing the stage.',
      );
    }

    if (active.some((stage) => stage.phase === 'exec_running')) return undefined;
    // P0-4/v1.4.0：非 exec 相位仍允许 doc/note 与静态展示资源（研究记录、设计文档、UI 资源等）；源码仍严格。
    if (allExempt) {
      const phases = active
        .map((stage) => `${stage.id ?? '(unknown)'}=${stage.phase ?? '(unknown)'}`)
        .join(', ');
      recordGuardAudit(normalizedCwd, { tool: name, reason: 'doc-asset', phase: phases, paths: targets });
      return undefined;
    }

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
