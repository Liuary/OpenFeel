/**
 * OpenFeel × DSH — 写入门禁
 *
 * 用 DSH 的 `ctx.tools.guard()` 在工具执行前做**同步拒绝**。守卫只读
 * `.openfeel/flow.json`，不写流程状态；唯一写盘的是自检证据
 * （`guard-state.json` / `guard-audit.jsonl`），所有流程状态变更仍由 OpenFeel CLI 负责。
 *
 * 规则（与 `.openfeel/plan/v1/stage-103/plan.md`、`stage-126/plan.md` 一致）：
 * - 守文件修改工具（默认 edit/write/apply_patch/str_replace_editor）**与 shell 工具**
 *   （`bash` / `pwsh`，v1.5.11 D-126-02：`pwsh -Command 'Set-Content src/x.ts'` 曾是
 *   零守卫绕过面）。shell 命令按「1 类硬拒 / 2 类按目标路径判 / 3 类产物豁免 /
 *   4 类目标不可判定」四类判定，2 类复用与文件工具完全相同的 `decideForTargets`；
 *   **op-005：未识别命令不再当 `none` 静默放行**，改判第 4 类 `undecidable`
 *   （审计 `kind` 区分 `none` 与 `undecidable`）。注意口径：第 4 类**默认仍是
 *   `warn` 放行 + 留痕**，只有 `OPENFEEL_SHELL_GATE=strict` 才拒 —— 是
 *   「不再静默」，不是「默认拒绝」，别把这一行读成默认拒绝；
 * - cwd 解析链（D-126-01）：`OPENFEEL_GUARD_CWD` → `agent.session.header.cwd` →
 *   `config.cwd` → 会话登记表 `[sessionId]` → `process.cwd()`（**仅当含 `.openfeel/`**）
 *   → **fail-closed 拒绝**。**没有** `registry-last` 进程级标量（多项目会串味）；
 * - 每次判定都写 `guard-state.json.lastDecision`（D-126-04）：cwd 不可解析时固定落
 *   `os.tmpdir()/openfeel-guard/`，审计同理 —— 最需要证据的时候绝不静默；
 *   **op-005：状态带进程内 HMAC**，缺 `pid` 或验签失败一律 `stale`；
 * - 路径归一化（op-005 / P0-2）：尾点 / 尾空格 / ADS（`flow.json::$DATA`）/ 8.3 短名 /
 *   大小写都在比较前归一，双路径（write 与 shell）同名同判；
 * - `.openfeel/**` 是流程产物区，任意阶段可写；但受保护名单
 *   （`PROTECTED_OPENFEEL_PATHS`：flow.json / flow.json.bak / pipeline.yaml / config.yaml /
 *   metrics.json / status.md / chore.json / dev 账本 / flow-archive / checkpoints /
 *   requirements/*.md / log/guard-audit.jsonl）始终拒绝（D-126-05，防 agent 手写状态自提权）；
 *   `.openfeel/` 之外另有 `PROTECTED_WORKSPACE_PATHS`（`dsh/cordis.patch.yml` 的门禁开关行）；
 * - `.openfeel/` 外的源码/文档要求存在 `exec_running` 阶段（或 general 需求例外）；
 *   **代码目录**（`CODE_DIRECTORIES`）内任何扩展名都不享受 doc/asset 豁免（D-126-06）；
 * - 判定顺序：受保护路径 → 未初始化/bootstrap → 内部路径早返回 → 研究闸 →
 *   无阶段/chore/doc-asset → 相位判定；
 * - 无 `.openfeel/` 时：`always` 拒绝全部写文件，`project`/`off` 放行；
 * - `apply_patch` 解析所有 patch 头目标，混合/无头时保守拒绝。
 *
 * @module openfeel-dsh/guard
 */

import { execFileSync } from 'node:child_process';
import {
  appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync, statSync,
} from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';

import { globalGuardAuditPath, writeGuardState } from './adapters/guard-state.js';
import { lookupSessionCwd } from './adapters/session-cwd-registry.js';
import { isProjectWorkspace, OPENFEEL_DIR } from './adapters/workspace.js';

/**
 * 默认受守卫的工具。
 *
 * `bash` / `pwsh` 是 v1.5.11 D-126-02 补上的头号绕过面（本宿主真实存在，
 * 参数为 `command` + `workdir`）。
 *
 * **跨宿主防御条目**：`shell` / `execute_command` / `exec`（以及上面的
 * `apply_patch`）在本宿主**不存在**，保留在默认列表里只是为了让「换到别的
 * DSH 宿主后被注册」时不至于静默放行 —— 不要为它们写实现，也不要以为它们
 * 已经在本宿主生效。真正的 shell 分支只认 `SHELL_TOOLS`。
 *
 * 两处必须同步：本常量与 `dsh/lib/index.js` 的 `normalizeConfig` 默认列表；
 * 只改一处会让 profile 传空数组时回落到旧列表（D-126-02）。
 */
export const DEFAULT_MUTATING_TOOLS = Object.freeze([
  'edit',
  'write',
  'apply_patch',
  'str_replace_editor',
  'bash',
  'pwsh',
  'shell',
  'execute_command',
  'exec',
]);

/**
 * 需要解析命令文本的 shell 工具（v1.5.11 D-126-02）。
 *
 * 只列**本宿主真实存在**的工具名：`bash` / `pwsh`。跨宿主防御条目
 * （`shell`/`execute_command`/`exec`）刻意不在这里 —— 它们没有已知的参数形状，
 * 不写实现；若真被注册，会走文件工具分支（无可提取路径 → 拒绝），而不是放行。
 */
export const SHELL_TOOLS = Object.freeze(['bash', 'pwsh']);
const SHELL_TOOL_SET = new Set(SHELL_TOOLS);

/**
 * `OPENFEEL_SHELL_GATE` 的默认组合（D-126-02）：用两个常量表达，
 * **不是**单一开关 —— 1/2 类（可判定）默认拒，4 类（目标不可判定）默认告警。
 */
export const SHELL_GATE_DECIDABLE = 'deny';
export const SHELL_GATE_UNDECIDABLE = 'warn';

/**
 * 解析 shell 门禁档位。
 *
 * | 取值 | 第 1 类（受保护 / openfeel 写子命令） | 第 2 类（可解析目标） | 第 4 类（不可判定） |
 * |---|---|---|---|
 * | 默认（未设） | 拒 | 拒（`decideForTargets` 正常判定） | 告警放行（审计 + stderr） |
 * | `strict` | 拒 | 拒 | 拒 |
 * | `warn` | 告警放行 | 告警放行 | 告警放行 |
 * | `off` | 放行 | 放行 | 放行（**shell 完全不解析**） |
 *
 * `off` / `warn` **只作用于 shell 分支**，`write`/`edit` 等文件工具不受影响。
 *
 * @param {unknown} raw
 * @returns {{ mode: 'default'|'strict'|'warn'|'off', decidable: 'deny'|'warn'|'allow', undecidable: 'deny'|'warn'|'allow' }}
 */
export function resolveShellGate(raw) {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (value === 'strict') return { mode: 'strict', decidable: 'deny', undecidable: 'deny', label: 'strict' };
  if (value === 'warn') return { mode: 'warn', decidable: 'warn', undecidable: 'warn', label: 'warn' };
  if (value === 'off') return { mode: 'off', decidable: 'allow', undecidable: 'allow', label: 'off' };
  return {
    mode: 'default',
    decidable: SHELL_GATE_DECIDABLE,
    undecidable: SHELL_GATE_UNDECIDABLE,
    label: 'default(1/2=deny,4=warn)',
  };
}

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

/**
 * 已报警过的降级来源（`source + cwd` 去重）。
 *
 * 计划要求「非 agent-session 来源每次命中都打一行 stderr」；长会话里同一来源
 * 会命中成百上千次，逐次打会把终端刷满，所以按「来源 + 目录」去重一次：
 * 首次即暴露、后续不噪音。`OPENFEEL_GUARD_CWD` / `config` / 登记表 / `process`
 * 都属降级路径，必须让用户看见。
 */
const degradedWarned = new Set();

/**
 * cwd 解析链（v1.5.11 D-126-01）。
 *
 * 顺序（取第一个可用值并记下来源）：
 * 0. `OPENFEEL_GUARD_CWD` → `env`（**逃生阀**，不是常规路径；宿主升级拿掉
 *    `agent.session.header.cwd` 时救急，不必改 profile + 重启）
 * 1. `execution.agent.session.header.cwd` → `agent-session`（实测唯一稳定链路）
 * 2. `config.cwd`（profile 的 `cwd:`）→ `config`
 * 3. 会话登记表 `[sessionId]` → `registry`（**只在 agent 存在但 header.cwd 为空时命中**）
 * 4. `process.cwd()` → `process`，**仅当该目录本身含 `.openfeel/`**
 *    （否则就是把宿主启动目录当会话工作区 —— 原 bug 的形态）
 * 5. 全部失败 → `{ cwd: null, source: 'unresolved' }`（调用方 fail-closed 拒绝）
 *
 * **为什么没有 `registry-last`**：进程级「最近一次 cwd」在多窗口/多项目时会
 * 跨项目串味（按别的项目的 flow 放行），比静默放行更危险（plan P1-4）。
 *
 * @param {{ agent?: { session?: { id?: string, header?: { cwd?: string } } } } | undefined} execution
 * @param {{ cwd?: string }} [options]
 * @returns {{ cwd: string | null, source: 'env'|'agent-session'|'config'|'registry'|'process'|'unresolved', degraded: boolean }}
 */
export function resolveGuardCwd(execution, options = {}) {
  const envCwd = process.env.OPENFEEL_GUARD_CWD;
  if (typeof envCwd === 'string' && envCwd.trim() !== '') {
    return { cwd: resolve(envCwd.trim()), source: 'env', degraded: true };
  }

  const sessionCwd = execution?.agent?.session?.header?.cwd;
  if (typeof sessionCwd === 'string' && sessionCwd.trim() !== '') {
    return { cwd: resolve(sessionCwd.trim()), source: 'agent-session', degraded: false };
  }

  const configCwd = options.cwd;
  if (typeof configCwd === 'string' && configCwd.trim() !== '') {
    return { cwd: resolve(configCwd.trim()), source: 'config', degraded: true };
  }

  const sessionId = execution?.agent?.session?.id;
  const registryCwd = lookupSessionCwd(sessionId);
  if (typeof registryCwd === 'string' && registryCwd !== '') {
    return { cwd: resolve(registryCwd), source: 'registry', degraded: true };
  }

  const processCwd = process.cwd();
  if (typeof processCwd === 'string' && processCwd !== '' && isProjectWorkspace(processCwd)) {
    return { cwd: resolve(processCwd), source: 'process', degraded: true };
  }

  return { cwd: null, source: 'unresolved', degraded: true };
}

/**
 * 降级来源必须出声（P1-4）：非 `agent-session` 每次命中打一行 stderr（按来源+目录去重）。
 * @param {{ cwd: string | null, source: string }} resolution
 */
function warnDegradedSource(resolution) {
  if (resolution.source === 'agent-session' || resolution.cwd === null) return;
  const key = `${resolution.source}\u0000${resolution.cwd}`;
  if (degradedWarned.has(key)) return;
  degradedWarned.add(key);
  const extra = resolution.source === 'process'
    ? '（最弱一环：宿主启动目录，仅因它本身含 .openfeel/ 才采用）'
    : '';
  process.stderr.write(`[openfeel-guard] cwdSource=${resolution.source}（非会话直读，可能是降级路径）${extra}\n`);
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
 * 代码目录（D-126-06）：这些**工作区根级**目录内的任何文件都按源码门禁。
 *
 * 为什么：`src/x.md`、`src/x.css`、`src/assets/logo.svg` 同样是仓库内容
 * （可被 import / 被脚本读取 / 被打包），而且 `src/*.md` 正是上一轮
 * 「门禁失效」假象的来源。豁免只应给「人读产物」（docs/、根级 README 等），
 * **不给代码目录里的任何文件** —— 所以判定顺序必须是「先判目录，再判扩展名」。
 *
 * 只看工作区根级目录段（`docs/src-notes.md`、`docs/src/a.md` 不算代码目录）；
 * 判据只用路径段，不做子串匹配，避免 `src-notes.md` 这类误伤。
 */
export const CODE_DIRECTORIES = Object.freeze(['src', 'test', 'scripts', 'dsh', 'bin']);

/** 工作区**根级**人读文件前缀（D-126-06）：README / CHANGELOG / LICENSE（可无扩展名）。 */
const ROOT_DOC_FILE_PREFIXES = Object.freeze(['readme', 'changelog', 'license']);

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
 * 工作区相对路径段（已归一化、已小写）。工作区外返回 null。
 * @param {string} absolute 已归一化绝对路径
 * @param {string} cwd 已归一化工作区
 * @returns {string[] | null}
 */
function workspaceRelativeSegments(absolute, cwd) {
  if (absolute === cwd) return [];
  if (!isUnderWorkspace(absolute, cwd)) return null;
  return absolute.slice(cwd.length + 1).split(/[\\/]+/).filter(Boolean);
}

/**
 * 是否位于**代码目录**内（D-126-06）。
 *
 * 工作区根级目录段命中 `CODE_DIRECTORIES` 即 true；工作区外沿用既有扩展名语义
 * （本 op 不扩大改动面）。`src/x.md` / `src/x.css` / `src/assets/logo.svg` → true；
 * `docs/src-notes.md`（文件名不是目录段）→ false。
 * @param {string} absolute 已归一化绝对路径
 * @param {string} cwd 已归一化工作区
 * @returns {boolean}
 */
export function isCodeDirectoryPath(absolute, cwd) {
  const segments = workspaceRelativeSegments(absolute, cwd);
  if (segments === null) return false;
  return segments.length > 1 && CODE_DIRECTORIES.includes(segments[0]);
}

/**
 * 构建/测试产物（v1.5.11 D-126-02 第 3 类）：写这些目标**不触发拒绝**。
 *
 * 目的：保证 `npx vitest` / `npm run build` / `cargo build` / `tsc -b` /
 * `npm install` 这类日常命令不被误杀（它们会写 `dist/`、`target/`、
 * `node_modules/` 等）。匹配按**工作区根级**路径段（`dist/**` 就是根级 `dist/`），
 * 不做任意层级匹配 —— 否则 `src/build/x.ts` 会借名豁免。
 *
 * 口径：**全部**目标命中豁免才放行，混合目标从严（走 `decideForTargets`）。
 */
export const BUILD_ARTIFACT_GLOBS = Object.freeze([
  'dist/**',
  'build/**',
  'out/**',
  'target/**',
  '.next/**',
  'node_modules/**',
  'coverage/**',
  '.openfeel/tmp/**',
  '.cache/**',
  '*.tsbuildinfo',
  'pnpm-lock.yaml',
  'package-lock.json',
]);

const BUILD_ARTIFACT_DIRS = new Set(['dist', 'build', 'out', 'target', '.next', 'node_modules', 'coverage', '.cache']);
const BUILD_ARTIFACT_FILES = new Set(['pnpm-lock.yaml', 'package-lock.json']);

/**
 * 是否为构建/测试产物目标（第 3 类）。
 * @param {string} absolute 已归一化绝对路径
 * @param {string} cwd 已归一化工作区
 * @returns {boolean}
 */
export function isBuildArtifactPath(absolute, cwd) {
  const segments = workspaceRelativeSegments(absolute, cwd);
  if (segments === null || segments.length === 0) return false;
  const base = segments[segments.length - 1].toLowerCase();
  if (BUILD_ARTIFACT_FILES.has(base)) return true;
  if (base.endsWith('.tsbuildinfo')) return true;
  if (segments.length > 1 && segments[0] === '.openfeel' && segments[1] === 'tmp') return true;
  return segments.length > 1 && BUILD_ARTIFACT_DIRS.has(segments[0].toLowerCase());
}

/**
 * 是否为工作区**根级**人读文件（`README*` / `CHANGELOG*` / `LICENSE*`，D-126-06）。
 * 只认根级：`src/README.md` 仍按源码门禁。
 * @param {string} absolute 已归一化绝对路径
 * @param {string} cwd 已归一化工作区
 * @returns {boolean}
 */
function isRootDocFile(absolute, cwd) {
  const segments = workspaceRelativeSegments(absolute, cwd);
  if (segments === null || segments.length !== 1) return false;
  const name = segments[0].toLowerCase();
  return ROOT_DOC_FILE_PREFIXES.some((prefix) => name.startsWith(prefix));
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

/**
 * doc + 静态展示资源合并豁免判据（v1.4.0 / v1.5.11 D-126-06）。
 *
 * 顺序（必须保持）：**先判代码目录，再判扩展名**。
 * - 代码目录内任何扩展名一律不豁免（含 `.md`/`.css`/`.png`/`assets/**`）；
 * - 工作区根级 `README*`/`CHANGELOG*`/`LICENSE*` 豁免（根级 `LICENSE` 可无扩展名）；
 * - 其它位置沿用既有 `isDocPath` / `isPresentationalAssetPath`（`docs/**`、
 *   任意 `assets/` / `public/`、doc/展示资源扩展名），保持既有放行语义。
 *
 * @param {string} absolute 已归一化绝对路径
 * @param {string} cwd 已归一化工作区
 * @returns {boolean}
 */
export function isExemptPath(absolute, cwd) {
  if (isCodeDirectoryPath(absolute, cwd)) return false;
  if (isRootDocFile(absolute, cwd)) return true;
  return isDocPath(absolute, cwd) || isPresentationalAssetPath(absolute);
}

/**
 * 审计里的命令片段（v1.5.11 D-126-02）：折叠空白并截断到 200 字符。
 * @param {unknown} command
 * @param {number} [limit]
 * @returns {string | undefined}
 */
function truncateCommand(command, limit = 200) {
  if (typeof command !== 'string') return undefined;
  const value = command.replace(/\s+/g, ' ').trim();
  if (value === '') return undefined;
  return value.length <= limit ? value : `${value.slice(0, limit - 1)}…`;
}

/**
 * 写入门禁审计（v1.4.0 / v1.5.2 / v1.5.11）：放行、拒绝、告警都追加 JSONL。
 *
 * 落点（D-126-04）：工作区 `.openfeel/log/guard-audit.jsonl`；**cwd 为 null 时
 * 固定落全局** `os.tmpdir()/openfeel-guard/guard-audit.jsonl`，**绝不静默丢弃**
 * —— 那恰好是最需要证据的时刻。写失败也出声（stderr）。
 *
 * 每行必须带 `cwdSource`（验收 14）与 `decision`（allow|deny|warn）；shell 行
 * 额外带 `command`（截断 ≤200 字符），否则「门禁是否真的拦过」无法自证。
 *
 * @param {string | null} cwd 已归一化工作区（null = 不可解析）
 * @param {{ event?: 'guard_allow'|'guard_deny'|'guard_shell_unresolved'|'guard_shell_downgraded', decision?: 'allow'|'deny'|'warn', tool: string, reason: string, phase: string, paths: string[], cwdSource?: string, command?: string }} event
 */
function recordGuardAudit(cwd, event) {
  const entry = {
    time: new Date().toISOString(),
    event: event.event ?? 'guard_allow',
    decision: event.decision ?? 'allow',
    tool: event.tool,
    reason: event.reason,
    phase: event.phase,
    paths: event.paths,
    // 每行都要能回答「用哪个 cwd 判的」（验收 14）。
    cwdSource: typeof event.cwdSource === 'string' && event.cwdSource !== '' ? event.cwdSource : 'agent-session',
  };
  const command = truncateCommand(event.command);
  if (command !== undefined) entry.command = command;
  // op-005 / P0-1：shell 行必须能区分「确认只读（none）」与「无法判定（undecidable）」，
  // 否则审计会把一次静默放行记成「没有写」。
  if (typeof event.kind === 'string' && event.kind !== '') entry.kind = event.kind;

  const hasWorkspace = typeof cwd === 'string' && cwd !== '';
  const file = hasWorkspace ? join(cwd, '.openfeel', 'log', 'guard-audit.jsonl') : globalGuardAuditPath();
  try {
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, `${JSON.stringify(entry)}\n`, 'utf-8');
    if (!hasWorkspace) {
      // 全局落点是兜底：必须让人知道证据换了地方（不能让「证据还在」变成静默）。
      process.stderr.write(`[guard] audit-unavailable：工作区不可解析，审计已落全局 ${file}\n`);
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[guard] audit-unavailable：${file}（${reason}）\n`);
    process.stderr.write(
      `[guard]   at=${entry.time} tool=${entry.tool} reason=${entry.reason} cwdSource=${entry.cwdSource}\n`,
    );
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
 * Win32 文件名字面归一化（op-005 / P0-2）。
 *
 * Windows 上**同一个文件有多种写法**，逐字比较会被一个字符破掉：
 * - 每段尾点 / 尾空格被文件系统忽略：`.openfeel/flow.json.` ≡ `flow.json`；
 * - 备用数据流（ADS）：`flow.json::$DATA` / `flow.json:stream` 指向同一个文件；
 * - 8.3 短名：`FLOW~1.JSO` ≡ `flow.json`（字面归一化做不到，只能靠 realpath 反查）。
 *
 * 本函数只做**字面**归一化（去尾点/尾空格、按第一个 `:` 截断 ADS），
 * 短名/大小写由 `tryRealPath` 反查。
 *
 * **盘符冒号不能误截**：只对「非盘符」的 `:` 生效（`C:\x` 的 `C:` 保留）。
 *
 * @param {string} absolute 绝对路径（未归一化）
 * @returns {string}
 */
export function canonicalizeWin32Path(absolute) {
  const text = String(absolute);
  // 长路径前缀（\\?\C:\… / \\.\C:\…）原样保留，只归一化剩余部分。
  const longPrefix = /^[\\/]{2}[?.][\\/]/.exec(text);
  const prefix = longPrefix === null ? '' : longPrefix[0];
  const body = prefix === '' ? text : text.slice(prefix.length);
  const drive = /^([A-Za-z]:)(?:[\\/]|$)/.exec(body);
  const root = drive === null ? '' : `${drive[1]}\\`;
  const rest = drive === null ? body.replace(/^[\\/]+/, '') : body.slice(drive[0].length);
  const segments = rest.split(/[\\/]+/).filter((segment) => segment !== '');
  const cleaned = segments
    .map((segment) => {
      // ADS / file:stream → 取第一个 `:` 之前的部分（盘符已在上面剥离）。
      const colon = segment.indexOf(':');
      const cut = colon === -1 ? segment : segment.slice(0, colon);
      // 尾点 / 尾空格被 Win32 忽略（`nul` 之类的设备名不在此处理）。
      return cut.replace(/[. ]+$/, '');
    })
    .filter((segment) => segment !== '');
  return `${prefix}${root}${cleaned.join('\\')}`;
}

/**
 * 用 `realpathSync.native` 反查真实名（大小写 + 8.3 短名 + 尾点/尾空格 + 链接）。
 * @param {string} absolute
 * @returns {string | null}
 */
function tryRealPath(absolute) {
  try {
    return realpathSync.native(absolute);
  } catch {
    return null;
  }
}

/**
 * 目标不存在时的反查：父目录 realpath + 自身 basename（写新文件时父目录已存在）。
 * basename 也做 Win32 字面归一（否则 `flow.json.` 会把尾点带进结果）。
 * @param {string} absolute
 * @returns {string | null}
 */
function tryRealPathParent(absolute) {
  try {
    const parent = dirname(absolute);
    if (parent === absolute) return null;
    const realParent = realpathSync.native(parent);
    const name = process.platform === 'win32' ? canonicalizeWin32Path(basename(absolute)) : basename(absolute);
    return join(realParent, name);
  } catch {
    return null;
  }
}

/**
 * 归一化路径：绝对化 + Win32 文件名字面归一化 + realpath 反查 + 大小写归一化。
 *
 * 为什么三者都要（op-005 / P0-2）：受保护名单按**字符串**比对，只要有任意一种
 * 等价写法不被归一，`.openfeel/flow.json.` / `flow.json::$DATA` / `FLOW~1.JSO`
 * 就能在不触碰名单的情况下覆盖 `flow.json`（门禁双路径 ALLOW）。
 *
 * **所有**路径（cwd / baseDir / 写入目标 / patch 目标）都必须走这里，否则两侧
 * 归一化口径不一致，前缀比较（`isUnderWorkspace` 等）会失效。
 *
 * @param {string} cwd
 * @param {string} target
 * @returns {string}
 */
function normalizeTarget(cwd, target) {
  const absolute = resolve(cwd, String(target ?? ''));
  const literal = process.platform === 'win32' ? canonicalizeWin32Path(absolute) : absolute;
  // 顺序：原样 realpath → 字面归一后 realpath（去尾点/ADS/短名）→ 父目录 + 归一 basename。
  const real = tryRealPath(absolute) ?? tryRealPath(literal) ?? tryRealPathParent(absolute);
  return normalizeForComparison(real ?? literal);
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
 * D-126-05 受保护路径（相对 `.openfeel/` 的路径段；比对前已由 `normalizeTarget`
 * 做大小写归一化，防 `.OPENFEEL/CHORE.JSON` 绕过）。
 *
 * 为什么要先于 `allInternal` 早返回判定：早返回让 `.openfeel/**` 任意相位可写，
 * 于是 agent 能手写 `chore.json`（自开写窗口，`expires_at` 填未来）、
 * `.preflight.json`（伪造「10 分钟内读过状态」）、`guard-state.json` / 归档 /
 * 快照 / 需求人读副本（与 flow.json 漂移，要等 health 才发现）。
 *
 * **边界（不要"顺手"加豁免）**：guard **只拦 agent 的工具调用**（write/edit/shell）；
 * 适配器与 CLI 自己用 `fs` 直写（`recordGuardAudit` 的 `appendFileSync`、CLI 写
 * `flow.json` / preflight / `chore.json` / 归档、之后的 `guard-state.json` /
 * `sessions.json`）**不经过 guard**，因此不受影响。给它们加豁免开关等于把自提权通道还回去。
 *
 * `.openfeel/log/` **不做整目录保护**（其它日志文件仍可写，避免打断工作流）；
 * 只单独保护审计证据 `guard-audit.jsonl` —— 否则 agent 可截断/伪造审计把证据抹掉。
 *
 * `match`：`file` = 精确文件；`dir` = 目录前缀（含自身）；`md` = `requirements/*.md`（单层）。
 */
export const PROTECTED_OPENFEEL_PATHS = Object.freeze([
  { match: 'file', segments: Object.freeze(['flow.json']), hint: 'state' },
  { match: 'file', segments: Object.freeze(['flow.json.bak']), hint: 'state' },
  // op-005 / P0-3：状态机转移表与工作流配置。两者不在名单时，`.openfeel/**` 的
  // `allInternal` 早返回会让**任意相位、任意工具**改写它们 —— 「把转移表改成
  // plan_pending→done 合法」「把 workflow_mode 改成 general」都是自提权通道。
  { match: 'file', segments: Object.freeze(['pipeline.yaml']), hint: 'pipeline-config' },
  { match: 'file', segments: Object.freeze(['config.yaml']), hint: 'pipeline-config' },
  // metrics.json 是 CLI 维护的运行期指标；手改会与 flow.json 记账漂移。
  { match: 'file', segments: Object.freeze(['metrics.json']), hint: 'metrics' },
  { match: 'file', segments: Object.freeze(['chore.json']), hint: 'chore' },
  { match: 'file', segments: Object.freeze(['dev', '.preflight.json']), hint: 'preflight' },
  { match: 'file', segments: Object.freeze(['dev', 'sessions.json']), hint: 'sessions' },
  { match: 'file', segments: Object.freeze(['dev', 'guard-state.json']), hint: 'guard-state' },
  { match: 'file', segments: Object.freeze(['log', 'guard-audit.jsonl']), hint: 'audit' },
  { match: 'dir', segments: Object.freeze(['flow-archive']), hint: 'flow-archive' },
  { match: 'dir', segments: Object.freeze(['checkpoints']), hint: 'checkpoints' },
  { match: 'md', segments: Object.freeze(['requirements']), hint: 'requirements' },
]);

/**
 * 受保护的工作区相对路径（`.openfeel/` 之外；op-005 / P2）。
 *
 * `dsh/cordis.patch.yml` 里的 `enforce` / `shellGate` 是**门禁自身的开关**：
 * agent 在 exec 期把它改成 `enforce: off` 或 `shellGate: off`，宿主重启后门禁即失效。
 * 这类「关掉守卫」的配置必须与人开的写窗口同权（只有人类能改）。
 *
 * 取舍：本列表**只收门禁开关文件**，不整目录保护 `dsh/**`（那会把正常开发也锁死）。
 */
export const PROTECTED_WORKSPACE_PATHS = Object.freeze([
  { match: 'file', segments: Object.freeze(['dsh', 'cordis.patch.yml']), hint: 'adapter-config' },
]);

/** 受保护路径的归属与拒绝指引（服务端拒绝文案；文案即修复路径）。 */
const PROTECTED_HINTS = Object.freeze({
  state: {
    zh: '`.openfeel/flow.json`（含 `.bak`）与 `.openfeel/**/status.md` 是流水线权威状态：请改用 feel_flow / feel_stage 等 CLI 工具。',
    en: '`.openfeel/flow.json` (and `.bak`) plus `.openfeel/**/status.md` are authoritative pipeline state: use feel_flow / feel_stage instead.',
  },
  chore: {
    zh: '`.openfeel/chore.json` 是 chore 写窗口，只能由**人类**在外部终端开启/收口：`openfeel chore "<说明>"` / `openfeel chore --end`；agent 不能自行开窗。',
    en: '`.openfeel/chore.json` is the chore write window and can only be opened/closed by a human from an external terminal: `openfeel chore "<note>"` / `openfeel chore --end`; the agent cannot open it.',
  },
  preflight: {
    zh: '`.openfeel/dev/.preflight.json` 由 feel_status / feel_next 自动记录：请勿手写。',
    en: '`.openfeel/dev/.preflight.json` is recorded automatically by feel_status / feel_next: do not hand-write it.',
  },
  sessions: {
    zh: '`.openfeel/dev/sessions.json` 由 feel_* 自动心跳维护：请勿手写。',
    en: '`.openfeel/dev/sessions.json` is maintained by feel_* heartbeats: do not hand-write it.',
  },
  'guard-state': {
    zh: '`.openfeel/dev/guard-state.json` 是门禁自检状态，由 guard 自动写入；请看 feel_status 的 guard 段。',
    en: '`.openfeel/dev/guard-state.json` is guard self-check state written by the guard itself; read the guard section of feel_status.',
  },
  'pipeline-config': {
    zh: '`.openfeel/pipeline.yaml`（状态机转移表）与 `.openfeel/config.yaml`（workflow_mode / auto_advance / test_enabled）是流程**规则**本身：改它们等于改判定标准（例如把 plan_pending→done 变合法）。请由人类直接修改并在改后重启会话。',
    en: '`.openfeel/pipeline.yaml` (state machine transitions) and `.openfeel/config.yaml` (workflow_mode / auto_advance / test_enabled) are the pipeline rules themselves: editing them rewrites the criteria (e.g. making plan_pending→done legal). Only a human may edit them, then restart the session.',
  },
  metrics: {
    zh: '`.openfeel/metrics.json` 由 CLI 维护（agent 运行指标）：请勿手写。',
    en: '`.openfeel/metrics.json` is maintained by the CLI (agent run metrics): do not hand-write it.',
  },
  'adapter-config': {
    zh: '`dsh/cordis.patch.yml` 的 `enforce` / `shellGate` 是**门禁自身的开关**（改成 off 重启即失效）：请由人类在外部终端修改。',
    en: 'The `enforce` / `shellGate` rows of `dsh/cordis.patch.yml` are the gate\'s own switches (setting them to off disables the guard after a restart): only a human may edit this file from an external terminal.',
  },
  'flow-archive': {
    zh: '`.openfeel/flow-archive/**` 是版本归档：请用 feel_archive action=create / show。',
    en: '`.openfeel/flow-archive/**` is version archive data: use feel_archive action=create / show.',
  },
  checkpoints: {
    zh: '`.openfeel/checkpoints/**` 是相位快照：请用 feel_checkpoint（读/恢复）。',
    en: '`.openfeel/checkpoints/**` is checkpoint data: use feel_checkpoint.',
  },
  requirements: {
    zh: '`.openfeel/requirements/*.md` 是 CLI 生成的人读副本：请用 feel_req action=add|set|claim 等维护。',
    en: '`.openfeel/requirements/*.md` is a human-readable copy generated by the CLI: use feel_req action=add|set|claim.',
  },
  audit: {
    zh: '`.openfeel/log/guard-audit.jsonl` 是门禁审计证据，由 guard 自动追加：请勿手写或截断。',
    en: '`.openfeel/log/guard-audit.jsonl` is guard audit evidence appended by the guard: do not hand-write or truncate it.',
  },
});

/**
 * 按「路径段 + 匹配模式」比对一组受保护条目。
 * @param {string[]} segments 已归一化（小写）的路径段
 * @param {ReadonlyArray<{ match: string, segments: readonly string[], hint: string }>} entries
 * @returns {{ hint: string } | null}
 */
function matchProtectedEntries(segments, entries) {
  for (const entry of entries) {
    const lengthOk = entry.match === 'file'
      ? segments.length === entry.segments.length
      : segments.length >= entry.segments.length;
    if (!lengthOk) continue;
    if (!entry.segments.every((segment, index) => segments[index] === segment)) continue;
    if (entry.match === 'md') {
      // `requirements/*.md`：只匹配一层，且扩展名必须是 `.md`。
      if (segments.length !== entry.segments.length + 1) continue;
      if (extname(segments[segments.length - 1]).toLowerCase() !== '.md') continue;
    }
    return { hint: entry.hint };
  }
  return null;
}

/**
 * 匹配受保护路径，命中返回归属 `{ hint }`，否则 null。
 *
 * 比较对象是**归一化后**的绝对路径（`normalizeTarget` 已做尾点/尾空格/ADS/短名/
 * 大小写归一），所以 `.openfeel/flow.json.`、`flow.json::$DATA`、`FLOW~1.JSO`
 * 与 `flow.json` 得到同一结论（op-005 / P0-2）。
 *
 * @param {string} absolute 已归一化绝对路径
 * @param {string} cwd 已归一化工作区
 * @returns {{ hint: string } | null}
 */
function matchProtectedPath(absolute, cwd) {
  const root = normalizeTarget(cwd, OPENFEEL_DIR);
  if (absolute === root || absolute.startsWith(`${root}\\`) || absolute.startsWith(`${root}/`)) {
    const segments = absolute === root
      ? []
      : absolute.slice(root.length).split(/[\\/]+/).filter(Boolean);
    // 既有语义（v1.4.0 起）：`.openfeel/**/status.md` 任意层级始终拒绝。
    if (segments.length > 0 && segments[segments.length - 1] === 'status.md') return { hint: 'state' };
    const hit = matchProtectedEntries(segments, PROTECTED_OPENFEEL_PATHS);
    if (hit !== null) return hit;
    // op-005：目标若是受保护文件的**父目录**（`rm -rf .openfeel`、
    // `robocopy src .openfeel /MIR`、`prettier --write .openfeel`），
    // 目录级写会连受保护文件一起覆盖/删除 → 同样拒绝。
    const contains = matchProtectedAncestor(segments, PROTECTED_OPENFEEL_PATHS);
    if (contains !== null) return contains;
  }
  // `.openfeel/` 之外的门禁开关文件（`dsh/cordis.patch.yml`）。
  const relative = workspaceRelativeSegments(absolute, cwd);
  if (relative !== null && relative.length > 0) {
    return matchProtectedEntries(relative, PROTECTED_WORKSPACE_PATHS)
      ?? matchProtectedAncestor(relative, PROTECTED_WORKSPACE_PATHS);
  }
  return null;
}

/**
 * 目标是否为某受保护条目的**祖先目录**（op-005）。
 *
 * 受保护名单是文件名级别的：`rm -rf .openfeel` / `prettier --write .openfeel`
 * 这类「目录级写」不命中任何条目，却会把 flow.json 一起覆盖 —— 所以把
 * 「目标段是受保护条目段的前缀」也算命中（`.openfeel` 自身 = 空前缀）。
 *
 * 注意 `.openfeel/log` 这种「只保护单文件」的目录也会因此被拒：
 * 代价只是 agent 不能 `rm -rf .openfeel/log`（CLI / guard 自己写日志不经过 guard）。
 *
 * @param {string[]} segments
 * @param {ReadonlyArray<{ match: string, segments: readonly string[], hint: string }>} entries
 * @returns {{ hint: string } | null}
 */
function matchProtectedAncestor(segments, entries) {
  for (const entry of entries) {
    if (segments.length >= entry.segments.length) continue;
    if (segments.every((segment, index) => entry.segments[index] === segment)) return { hint: entry.hint };
  }
  return null;
}

/**
 * 受保护路径拒绝文案：按归属给出对应 CLI（文案即修复路径）。
 * @param {Array<{ hint: string }>} hits
 * @param {(zh: string, en: string) => string} t
 * @returns {string}
 */
function protectedDenialMessage(hits, t) {
  const hints = [...new Set(hits.map((hit) => hit.hint))];
  const lines = hints.map((hint) => {
    const entry = PROTECTED_HINTS[hint] ?? PROTECTED_HINTS.state;
    return `- ${t(entry.zh, entry.en)}`;
  });
  return t(
    `OpenFeel 写入门禁：禁止手改 OpenFeel 受保护的流程文件。\n${lines.join('\n')}`,
    `OpenFeel write guard: never hand-edit protected OpenFeel pipeline files.\n${lines.join('\n')}`,
  );
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

/* ──────────────────────────────────────────────────────────────────────────
 * shell 命令解析（v1.5.11 D-126-02）
 *
 * 目标（可验收）：`bash` / `pwsh` 纳入守卫，命令文本按四类判定，且**不误杀**
 * 日常构建/测试命令。判定不复用任何「宽松启发式」：
 * - 第 1 类（任何相位硬拒）：受保护路径、shell 跑 openfeel 写子命令、
 *   编码/间接执行形态（`-EncodedCommand` / `iex` / `bash -c` / `node -e` …）；
 * - 第 2 类（按目标路径判）：重定向、`tee`、PowerShell 写 cmdlet、POSIX
 *   `rm/del/mv/cp/touch/mkdir`、`sed -i`、`patch`、以及全部 git 工作区写；
 *   一旦目标可判定，就交给 `decideForTargets()`（与文件工具**同一份**判定）；
 * - 第 3 类（产物豁免）：`dist|build|out|target|.next|node_modules|coverage|
 *   .openfeel/tmp|.cache|*.tsbuildinfo|pnpm-lock.yaml|package-lock.json`；
 * - 第 4 类（目标不可判定）：默认 `warn`（审计 + stderr 放行），`strict` 下拒。
 *
 * **第 4 类的书面口径（也要写进 ADAPTER.md）**：第 4 类**只防误写、不防蓄意**。
 * 编码/嵌套执行形态已在第 1 类堵死；能走到第 4 类的只剩「目标来自运行时数据」，
 * 默认告警，要更严就设 `OPENFEEL_SHELL_GATE=strict`。
 *
 * **变量口径**：只有「同一命令内一次字面量赋值得到完整目标路径」才算第 2 类
 * （`$f='src/x.ts'; Set-Content $f`）；任何拼接/派生/跨语句取值
 * （`$d='src'; Set-Content "$d/x.ts"`、`Join-Path`、管道/文件/env）一律第 4 类 ——
 * 明确**不做**字符串求值/拼接推导，避免「看起来能算」的半成品解析。
 * ────────────────────────────────────────────────────────────────────────── */

/** 重定向里的「不是文件」目标（丢弃，不算写入）。 */
const SHELL_NULL_TARGETS = new Set(['/dev/null', 'nul', '$null', '/dev/stdout', '/dev/stderr', 'con']);

/** 包装命令：跳过它们（与其 flag/`VAR=` 赋值）之后才是真正的命令名。 */
const SHELL_WRAPPER_COMMANDS = new Set(['sudo', 'env', 'nohup', 'time', 'command', 'exec', 'builtin', 'doas']);

/** POSIX 写命令 → 目标位置（bash 分支）。 */
const POSIX_WRITE_SPECS = new Map([
  ['rm', 'all'],
  ['del', 'all'],
  ['erase', 'all'],
  ['rmdir', 'all'],
  ['rd', 'all'],
  ['mv', 'all'],
  ['move', 'all'],
  ['cp', 'dest'],
  ['copy', 'dest'],
  // op-005 / P0-1：Windows 目录复制命令（Git Bash / cmd 下都可用）。
  // `dest2` = 第二个位置参数是目标（`robocopy src dst /MIR`、`xcopy src dst /E`）。
  ['robocopy', 'dest2'],
  ['xcopy', 'dest2'],
  ['touch', 'all'],
  ['mkdir', 'all'],
  ['md', 'all'],
  ['tee', 'all'],
  ['sed', 'sed'],
  ['patch', 'patch'],
]);

/**
 * PowerShell 写 cmdlet（含常用别名）→ 目标位置（pwsh 分支）。
 * `dest`：最后一个位置参数是目标（`Copy-Item src dest`）；`first`：第一个位置参数；
 * `all`：全部位置参数（`Remove-Item a b`、`mv`/`rm` 的源也是被删改目标）。
 */
const PS_WRITE_SPECS = new Map([
  ['set-content', 'first'],
  ['sc', 'first'],
  ['add-content', 'first'],
  ['ac', 'first'],
  ['clear-content', 'first'],
  ['clc', 'first'],
  ['out-file', 'first'],
  ['tee-object', 'first'],
  ['tee', 'first'],
  ['new-item', 'first'],
  ['ni', 'first'],
  ['set-item', 'first'],
  ['si', 'first'],
  ['rename-item', 'first'],
  ['rni', 'first'],
  ['remove-item', 'all'],
  ['ri', 'all'],
  ['rm', 'all'],
  ['del', 'all'],
  ['erase', 'all'],
  ['rmdir', 'all'],
  ['rd', 'all'],
  ['copy-item', 'dest'],
  ['cpi', 'dest'],
  ['cp', 'dest'],
  ['copy', 'dest'],
  ['robocopy', 'dest2'],
  ['xcopy', 'dest2'],
  ['move-item', 'all'],
  ['mi', 'all'],
  ['mv', 'all'],
  ['move', 'all'],
  ['mkdir', 'all'],
  ['md', 'all'],
  // P2：pwsh 下也能跑的 POSIX 写命令（`touch` / `sed -i`），避免换 shell 就绕过去。
  ['touch', 'all'],
  ['sed', 'sed'],
]);

/** PowerShell 里表示「目标路径」的具名参数。 */
const PS_PATH_PARAMS = new Set(['path', 'filepath', 'literalpath', 'destination', 'target', 'outputfile']);
/** PowerShell 里表示「只读源路径」的具名参数（`Copy-Item -Path src -Destination dst`）。 */
const PS_SOURCE_PARAMS = new Set(['path', 'filepath', 'literalpath']);
/** PowerShell 开关参数（不消费下一个 token）。 */
const PS_SWITCH_PARAMS = new Set([
  'force', 'recurse', 'whatif', 'confirm', 'verbose', 'debug', 'passthru', 'nonewline',
  'asbytestream', 'append', 'wait', 'usetransaction', 'container', 'hidden', 'readonly',
  'system', 'update', 'raw', 'noenumerate', 'unique', 'follow', 'preserve', 'stream',
]);

/** shell 跑 openfeel 时的写动词（第 1 类）。 */
const OPENFEEL_WRITE_VERBS = new Set(['flow', 'stage', 'req', 'chore']);

/** 只读白名单（放行）—— D-126-02 逐条列出。 */
const OPENFEEL_READONLY_VERBS = new Set([
  'status', 'next', 'current', 'overview', 'phases', 'mode', 'log', 'metrics',
  'health', 'recover', 'retry', 'list', 'show', 'board', 'help', 'version',
]);

/* ── op-005 / P0-1：默认 fail-closed 所需的正面证据表 ─────────────────────
 *
 * 规则变更：**无法判定「这条命令不写」→ 第 4 类（undecidable，默认 warn）**，
 * 不再把未识别命令当 `kind='none'` 静默放行（旧口径的审计还会记成「没有写」）。
 * 于是「确认只读」必须有正面证据 —— 命中下面这些表之一才允许 `no-write`。
 *
 * 反例（实测绕过，全部必须落到 undecidable 或写类）：
 * `[IO.File]::WriteAllText(...)`、`iwr -OutFile`、`curl.exe -o`、`certutil -urlcache`、
 * `robocopy`/`xcopy`、`npx prettier --write src`、`gofmt -w`、`node scripts/gen.js`、
 * `python -c "pathlib…write_text"`、`$c='Set-Content'; & $c …`。
 * ─────────────────────────────────────────────────────────────────────── */

/**
 * 已知**只读**程序（确认无文件副作用）。
 *
 * 收录口径：只读文件 / 只向 stdout 输出 / 只查环境。写命令一律走
 * `POSIX_WRITE_SPECS` / `PS_WRITE_SPECS` / 专门解析器，**别往这里加**。
 * 拿不准就不要加 —— 落到 undecidable 只是多一条 warning，加错就是放行。
 */
const READONLY_PROGRAMS = new Set([
  // 文件/文本读取
  'ls', 'dir', 'cat', 'head', 'tail', 'grep', 'egrep', 'fgrep', 'rg', 'wc', 'file', 'stat',
  'pwd', 'cd', 'pushd', 'popd', 'which', 'where', 'whereis', 'whoami', 'hostname', 'date',
  'env', 'printenv', 'uname', 'id', 'echo', 'printf', 'true', 'false', 'test', '[', ']',
  'basename', 'dirname', 'realpath', 'readlink', 'diff', 'cmp', 'md5sum', 'sha1sum',
  'sha256sum', 'sha512sum', 'xxd', 'od', 'hexdump', 'jq', 'sort', 'uniq', 'nl', 'less',
  'more', 'clear', 'sleep', 'seq', 'tree', 'du', 'df', 'ps', 'kill', 'nproc', 'arch',
  'uptime', 'exit', 'export', 'unset', 'shift', 'type', 'alias', 'cd',
  // PowerShell 只读 cmdlet / 常用别名
  'get-content', 'gc', 'type', 'get-childitem', 'gci', 'get-item', 'gi',
  'select-string', 'sls', 'get-command', 'gcm', 'get-help', 'help', 'get-member', 'gm',
  'get-process', 'gps', 'get-service', 'gsv', 'get-date', 'get-location', 'gl',
  'get-host', 'get-variable', 'gv', 'get-itemproperty', 'gp', 'test-path',
  'resolve-path', 'split-path', 'join-path', 'convert-path', 'measure-object',
  'select-object', 'where-object', 'foreach-object', 'sort-object', 'group-object',
  'format-table', 'ft', 'format-list', 'fl', 'format-wide', 'fw', 'out-string', 'out-host',
  'write-host', 'write-output', 'write', 'echo', 'start-sleep', 'compare-object',
  'convertto-json', 'convertfrom-json', 'get-filehash', 'get-acl', 'select', 'where', '%', '?',
  // openfeel：写子命令已在上游 `matchOpenFeelWrite` 拦掉，能走到这里的都是只读动词
  'openfeel',
]);

/**
 * 已知**构建/测试**工具：只写产物目录（第 3 类），无源码副作用，不解析目标。
 *
 * 只收「写的是 dist/build/target/node_modules 这类产物」的构建器与测试器。
 * 写源码的工具（`cargo fmt`、`gofmt`、`black`、`ruff format`）**不在此列**，
 * 它们走 formatter 写解析器。
 */
const BUILD_TOOL_PROGRAMS = new Set([
  'vitest', 'jest', 'mocha', 'ava', 'tap', 'playwright', 'cypress',
  'tsc', 'vite', 'webpack', 'rollup', 'esbuild', 'next', 'nuxt', 'turbo', 'nx', 'parcel',
  'tsup', 'node-gyp', 'msbuild', 'gradle', 'gradlew', 'mvn', 'mvnw', 'make', 'cmake',
  'ninja', 'meson', 'bazel', 'bazelisk', 'pytest', 'mypy', 'cargo', 'go', 'dotnet',
]);

/** 需要再按子命令收窄的构建工具（`cargo fmt` 会改源码，不能整命令放行）。 */
const BUILD_TOOL_SUBCOMMANDS = new Map([
  ['cargo', new Set(['build', 'test', 'check', 'clippy', 'bench', 'doc', 'fetch', 'metadata', 'tree', 'locate-project', 'version'])],
  ['go', new Set(['build', 'test', 'vet', 'version', 'env', 'list', 'doc'])],
  ['dotnet', new Set(['build', 'test', 'restore', 'publish', 'pack'])],
]);

/** 会**就地改源码**的格式化/修复工具：`--write` / `--fix` / `-w` / `-i` 才是写。 */
const FORMATTER_TOOLS = new Set([
  'prettier', 'eslint', 'gofmt', 'goimports', 'rustfmt', 'biome', 'stylelint', 'black',
  'isort', 'autopep8', 'clang-format', 'golines', 'swiftformat', 'dprint', 'standard',
  'oxlint', 'oxfmt', 'yapf', 'rubocop', 'php-cs-fixer', 'prettierd', 'markdownlint',
]);

/** 下载器：只有带「输出到文件」参数才算写（`curl url` = 只读）。 */
const DOWNLOAD_TOOLS = new Set([
  'curl', 'wget', 'iwr', 'invoke-webrequest', 'invoke-restmethod', 'irm',
  'start-bitstransfer', 'aria2c',
]);

/** 会执行**外部脚本/程序**、目标静态不可判的解释器（`node x.js` / `python x.py`）。 */
const SCRIPT_INTERPRETER_TOOLS = new Set([
  'node', 'python', 'python2', 'python3', 'py', 'perl', 'ruby', 'php', 'deno', 'bun',
  'osascript', 'wscript', 'cscript',
]);

/** npx/dl x 之类「跑一个包」的前置命令。 */
const PACKAGE_RUNNERS = new Set(['npx', 'pnpx', 'bunx', 'dlx']);

/**
 * **硬拒**的间接执行形态（第 1 类）：内容不可见 / 不可可靠判定，一律拒绝。
 *
 * - `-EncodedCommand` / `-EncodedArguments`：base64 编码，看得到也读不出；
 * - `iex` / `Invoke-Expression`：拼接后执行，静态不可判；
 * - `eval`：同上；
 * - `cmd /c|/k`：同族形态（`cmd /c "echo x > src/x.ts"` 会让引号内重定向逃过扫描）；
 * - **.NET 静态写方法**（op-005 / P0-1，op-006 改**正面判定**见下）；
 * - **`New-Object` 写对象**：`New-Object System.IO.StreamWriter('src/x.ts')`；
 * - **`Add-Type` 动态编译**：编译后的代码可任意写盘（`-AssemblyName` 纯加载除外）。
 *
 * 检测在「引号内容被掩码」的文本上做，避免 `git commit -m "…bash -c…"` 被消息文本误杀。
 */
const HARD_INDIRECT_PATTERNS = Object.freeze([
  [/-EncodedCommand\b/i, '-EncodedCommand'],
  [/-EncodedArguments\b/i, '-EncodedArguments'],
  [/(?:^|\s)-(?:enc|ec)\b/i, '-EncodedCommand'],
  [/\b(?:iex|Invoke-Expression)\b/i, 'Invoke-Expression'],
  [/(?:^|[|&]\s*)eval\s/i, 'eval'],
  [/(?:^|[|&]\s*)(?:cmd(?:\.exe)?\s+\/[ck]\b)/i, 'cmd /c'],
  [/\bNew-Object\s+(?:System\.)?IO\.(?:StreamWriter|FileStream|BinaryWriter|DirectoryInfo|FileInfo)\b/i, 'New-Object 写对象'],
  [/\bAdd-Type\b/i, 'Add-Type 动态编译'],
]);

/**
 * 可能写盘的 `.NET` 静态类型（op-006 / P1-2：**正向判定**）。
 *
 * 旧实现是**方法名黑名单**（只列 `WriteAllText|Copy|Move|…`），于是
 * `WriteAllTextAsync` / `AppendAllTextAsync` / `[IO.File]::Open('x','Create')`
 * 全部漏到第 4 类（默认 warn = 放行）—— 与 P0-1 同形态。
 *
 * 现在反过来：**类型可写** 且 **方法不在只读白名单** → 一律第 1 类。
 * 只列「能写文件」的类型，`[Math]::Floor` / `[IO.Path]::Combine` 这类纯函数
 * 不在此列，不会被误杀。
 */
const DOTNET_WRITE_TYPE_RE = /\[\s*(?:System\.)?(?:IO\.(?:File|FileInfo|Directory|DirectoryInfo|StreamWriter|FileStream|BinaryWriter|BinaryReader)|IO\.Compression\.[A-Za-z.]+)\s*\]\s*::\s*([A-Za-z_][A-Za-z0-9_]*)/gi;

/** 可写类型上的**只读**方法（不在表里 → 按写处理）。 */
const DOTNET_READ_METHODS = new Set([
  'readalltext', 'readalllines', 'readallbytes', 'readlines', 'openread', 'opentext',
  'exists', 'getfiles', 'getdirectories', 'getlastwritetime', 'getlastwritetimeutc',
  'getcreationtime', 'getcreationtimeutc', 'getlength', 'getattributes', 'getfullpath',
  'combine', 'getfilename', 'getdirectoryname', 'getextension', 'gettemppath',
  'getpathroot', 'ispathrooted', 'enumeratefiles', 'enumeratedirectories',
]);

/**
 * 解释器内联代码（op-002b）：**先扫 payload 里的写 API** —— 纯只读诊断
 * （`node -e "console.log(1)"`）不该被拦，这也是 agent 日常读 JSON 的常用手段。
 */
const INLINE_INTERPRETER_PATTERNS = Object.freeze([
  [/\bnode(?:\.exe)?\s+(?:-e\b|--eval\b|-p\b|--print\b)\s*/i, 'node -e'],
  [/\bpython[0-9.]*(?:\.exe)?\s+-c\s*/i, 'python -c'],
  [/\bperl(?:\.exe)?\s+-[a-zA-Z]*e\s*/i, 'perl -e'],
  [/\bruby(?:\.exe)?\s+-[a-zA-Z]*e\s*/i, 'ruby -e'],
  [/\bphp(?:\.exe)?\s+-r\s*/i, 'php -r'],
]);

/** 内联 payload 里出现这些写 API → 视为「间接执行含写操作」。 */
const INDIRECT_WRITE_PATTERNS = Object.freeze([
  /\bwriteFileSync\b/, /\bappendFileSync\b/, /\bwriteFile\b/, /\bcreateWriteStream\b/,
  /\bcopyFileSync\b/, /\brenameSync\b/, /\bunlinkSync\b/, /\brmSync\b/,
  /\bmkdirSync\b/, /\brmdirSync\b/, /\btruncateSync\b/, /\bchmodSync\b/,
  /\bopenSync\b[^)]*['"][wa]/, /\bfs\.promises\b[\s\S]{0,80}?\b(?:writeFile|appendFile|rm|mkdir|unlink|rename|copyFile)\b/,
  /\bSet-Content\b/i, /\bOut-File\b/i, /\bAdd-Content\b/i, /\bNew-Item\b/i,
  /\bRemove-Item\b/i, /\bCopy-Item\b/i, /\bMove-Item\b/i, /\bSet-Item\b/i,
  // Python / Ruby / PHP 的同义写法（同一判定口径，别让换语言就绕过去）
  /\bopen\s*\([^)]{0,120}?['"][wa]/, /\bos\.remove\b/, /\bshutil\b/, /\bFile\.write\b/,
  // op-005 / P1-5：**间接写 API**。命中即第 1 类 —— 否则
  // `node -e "child_process.execSync('openfeel chore --source x')"` 会被判只读放行。
  /\bchild_process\b/i, /\bexecSync\b/, /\bexecFileSync\b/, /\bspawnSync\b/, /\bspawn\s*\(/,
  /\bexecFile\b/, /\bpathlib\b/, /\bwrite_text\b/, /\bwrite_bytes\b/,
  /\burlretrieve\b/, /\bos\.system\b/, /\bos\.popen\b/, /\bsubprocess\b/,
  /\bDeno\.(?:writeTextFile|writeFile|create|mkdir|remove|rename|copyFile)\b/,
  /\bBun\.(?:write|file)\b/,
]);

/** 递归深度上限（防构造 `bash -c 'bash -c …'` 无限套娃）。 */
const WRAPPER_MAX_DEPTH = 4;

/**
 * 同一命令内「一次字面量赋值」：`$f='src/x.ts'` / `F=src/x.ts` / `export F=x`。
 * 值里出现 `$` 或反引号（插值/子表达式）即不算纯字面量。
 */
const LITERAL_VAR_ASSIGN_RE = /^\s*(?:(?:export|local|set)\s+)?(?:\$([A-Za-z_][A-Za-z0-9_]*)|([A-Za-z_][A-Za-z0-9_]*))\s*=\s*(?:'([^']*)'|"([^"]*)"|([^\s;&|]+))\s*;?\s*$/;

/**
 * 把 shell 文本切成句子（引号感知；`;`、换行、`&&`、`||` 都是边界）。
 * @param {string} command
 * @returns {string[]}
 */
function splitShellStatements(command) {
  const out = [];
  let current = '';
  let quote = null;
  for (let index = 0; index < command.length; index += 1) {
    const ch = command[index];
    if (quote !== null) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '`' && command[index + 1] === 'n') { current += '\n'; index += 1; continue; }
    if (ch === '"' || ch === "'") { quote = ch; current += ch; continue; }
    if (ch === '\n' || ch === '\r' || ch === ';') { out.push(current); current = ''; continue; }
    if ((ch === '&' && command[index + 1] === '&') || (ch === '|' && command[index + 1] === '|')) {
      out.push(current);
      current = '';
      index += 1;
      continue;
    }
    current += ch;
  }
  out.push(current);
  return out.map((statement) => statement.replace(/[`^]+\s*$/, '').trim()).filter((statement) => statement !== '');
}

/**
 * 把引号内容掩码成 `_` / 空格（用于 indirect 检测，避免提交信息等文本误杀）。
 * **保持长度不变**：调用方可以按同一 offset 回到原文取参数。
 * @param {string} text
 * @returns {string}
 */
function maskQuoted(text) {
  let out = '';
  let quote = null;
  for (let index = 0; index < text.length; index += 1) {
    const ch = text[index];
    if (quote !== null) {
      if (ch === quote) { quote = null; out += '_'; continue; }
      out += ' ';
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; out += '_'; continue; }
    out += ch;
  }
  return out;
}

/**
 * 还原「命令位置」上的引号程序名（`"bash" -c …` / `x | "bash" -c …`）——
 * 否则加一对引号就能绕过第 1 类的间接执行检测。
 * @param {string} text
 * @returns {string}
 */
function unquoteProgramNames(text) {
  // 前缀集合含 `.` / `&`：`& "openfeel" chore …`、`. "script.ps1"` 也算命令位置
  // （op-005 / P1-1：引号程序名曾是 openfeel 写命令检测的绕过面）。
  return text.replace(/(^|[|&;(.]\s*)(["'])([^"'\n]+)\2(?=\s)/g, (_all, prefix, _quote, program) => `${prefix}${program}`);
}

/**
 * 切 token：去引号；`|` 单独成 token（用于识别管道后的命令位置）。
 * @param {string} text
 * @returns {string[]}
 */
function tokenizeShell(text) {
  const tokens = [];
  let current = '';
  let quote = null;
  let has = false;
  for (let index = 0; index < text.length; index += 1) {
    const ch = text[index];
    if (quote !== null) {
      if (ch === quote) { quote = null; continue; }
      current += ch;
      has = true;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; has = true; continue; }
    if (ch === '|') {
      if (has) { tokens.push(current); current = ''; has = false; }
      tokens.push('|');
      continue;
    }
    if (ch === '`' && text[index + 1] !== undefined && !/\s/.test(text[index + 1])) { continue; }
    if (/\s/.test(ch)) {
      if (has) { tokens.push(current); current = ''; has = false; }
      continue;
    }
    current += ch;
    has = true;
  }
  if (has) tokens.push(current);
  return tokens;
}

/**
 * 扫重定向（引号感知）：`>` `>>` `2>` `&>`；`2>&1` / `>&2` 跳过；返回目标与
 * 「去掉重定向片段」的文本（供命令识别，避免把 `>` 误当参数）。
 * @param {string} statement
 * @returns {{ targets: string[], cleaned: string }}
 */
function scanShellRedirections(statement) {
  const targets = [];
  let cleaned = '';
  let quote = null;
  let index = 0;
  while (index < statement.length) {
    const ch = statement[index];
    if (quote !== null) {
      if (ch === quote) quote = null;
      cleaned += ch;
      index += 1;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; cleaned += ch; index += 1; continue; }
    const digitOp = ch >= '0' && ch <= '9' && statement[index + 1] === '>';
    const ampOp = ch === '&' && statement[index + 1] === '>';
    if (ch === '>' || digitOp || ampOp) {
      let cursor = index;
      if (digitOp) cursor += 1;
      if (statement[cursor] === '&') cursor += 1;
      if (statement[cursor] !== '>') { cleaned += ch; index += 1; continue; }
      cursor += 1;
      if (statement[cursor] === '>') cursor += 1;
      while (cursor < statement.length && /\s/.test(statement[cursor])) cursor += 1;
      if (cursor >= statement.length) { index = cursor; break; }
      if (statement[cursor] === '&') { index = cursor + 1; continue; } // 2>&1 / >&2
      let target = '';
      if (statement[cursor] === '"' || statement[cursor] === "'") {
        const opener = statement[cursor];
        cursor += 1;
        while (cursor < statement.length && statement[cursor] !== opener) { target += statement[cursor]; cursor += 1; }
        cursor += 1;
      } else {
        while (cursor < statement.length && !/[\s;&|<>]/.test(statement[cursor])) { target += statement[cursor]; cursor += 1; }
      }
      if (target !== '' && !SHELL_NULL_TARGETS.has(target.toLowerCase())) targets.push(target);
      index = cursor;
      continue;
    }
    cleaned += ch;
    index += 1;
  }
  return { targets, cleaned };
}

/**
 * 命令名归一化（取 basename、去 `.exe`、小写）。
 * @param {string} token
 * @returns {string}
 */
function commandNameOf(token) {
  const base = String(token).replace(/\\/g, '/').split('/').pop() ?? '';
  const lower = base.toLowerCase();
  return lower.endsWith('.exe') ? lower.slice(0, -4) : lower;
}

/**
 * 收集「同一命令内一次字面量赋值」的变量（第 2 类用）。
 * @param {string[]} statements
 * @returns {Map<string, string>}
 */
function collectLiteralAssignments(statements) {
  const vars = new Map();
  for (const statement of statements) {
    const match = LITERAL_VAR_ASSIGN_RE.exec(statement);
    if (match === null) continue;
    const name = (match[1] ?? match[2] ?? '').toLowerCase();
    const value = match[3] ?? match[4] ?? match[5] ?? '';
    if (name === '' || value === '') continue;
    if (/[`$]/.test(value)) continue; // 插值/子表达式 → 不是纯字面量
    vars.set(name, value);
  }
  return vars;
}

/**
 * 解析一个目标 token：纯字面量 → 可直接判定（第 2 类）；
 * `$var` / `${var}` 且同命令内有字面量赋值 → 解析成字面量；
 * 其余（拼接、派生、`Join-Path`、管道/文件/env 取值）→ 第 4 类。
 * @param {string} raw
 * @param {Map<string, string>} vars
 * @returns {{ ok: boolean, value: string }}
 */
function resolveShellToken(raw, vars) {
  const text = String(raw).trim();
  if (text === '') return { ok: false, value: text };
  if (!/[$`]/.test(text)) return { ok: true, value: text };
  const exact = /^\$(?:\{([A-Za-z_][A-Za-z0-9_]*)\}|([A-Za-z_][A-Za-z0-9_]*))$/.exec(text);
  if (exact !== null) {
    const key = (exact[1] ?? exact[2]).toLowerCase();
    if (vars.has(key)) return { ok: true, value: vars.get(key) };
  }
  return { ok: false, value: text };
}

/**
 * `.NET` 静态写方法（op-006 / P1-2 正面判定）：可写类型 + 方法不在只读白名单 → 命中。
 * @param {string} text 掩码后的命令文本
 * @returns {string | null}
 */
function matchDotNetStaticWrite(text) {
  DOTNET_WRITE_TYPE_RE.lastIndex = 0;
  let match;
  while ((match = DOTNET_WRITE_TYPE_RE.exec(text)) !== null) {
    const method = match[1].toLowerCase();
    if (DOTNET_READ_METHODS.has(method)) continue;
    return `.NET 静态写方法 ${match[1]}`;
  }
  return null;
}

/**
 * 匹配编码/间接执行形态（第 1 类）。
 * @param {string} statement
 * @returns {string | null} 命中的形态标签
 */
function matchHardIndirect(statement) {
  // 原文掩码（无消息文本误杀）+ 程序名去引号后再掩码（防 `"bash" -c …` 绕过）
  for (const text of [maskQuoted(statement), maskQuoted(unquoteProgramNames(statement))]) {
    for (const [pattern, tag] of HARD_INDIRECT_PATTERNS) {
      if (!pattern.test(text)) continue;
      // `Add-Type -AssemblyName X` 只是加载程序集（不编译、不落盘），放行；
      // 其余 `Add-Type`（`-TypeDefinition` / `-MemberDefinition` / `-OutputAssembly`）算动态编译。
      if (tag === 'Add-Type 动态编译' && /^Add-Type\s+-AssemblyName\s+\S+\s*$/i.test(text.trim())) continue;
      return tag;
    }
    // .NET 静态写方法：**正向**判定（可写类型 + 方法不在只读白名单）。
    const dotnet = matchDotNetStaticWrite(text);
    if (dotnet !== null) return dotnet;
  }
  return null;
}

/**
 * 匹配内联解释器调用（`node -e …` / `python -c …`），返回标签与 **payload 原文**。
 *
 * 用「掩码定位置、原文取 payload」：既不被 `git commit -m "node -e …"` 误杀，
 * 又能拿到真实代码去扫写 API。
 * @param {string} statement
 * @returns {{ tag: string, payload: string } | null}
 */
function matchInlineInterpreter(statement) {
  const masked = maskQuoted(statement);
  for (const [pattern, tag] of INLINE_INTERPRETER_PATTERNS) {
    const match = pattern.exec(masked);
    if (match === null) continue;
    const payload = statement.slice(match.index + match[0].length).trim();
    return { tag, payload };
  }
  return null;
}

/**
 * payload 里是否出现写 API（op-002b）：命中 → 第 1/2 类拒绝；未命中 → 只读诊断放行。
 * @param {string} payload
 * @returns {string | null} 命中的写 API 标签
 */
function findWriteApi(payload) {
  for (const pattern of INDIRECT_WRITE_PATTERNS) {
    const match = pattern.exec(payload);
    if (match !== null) return match[0].slice(0, 40);
  }
  return null;
}

/**
 * 取出 `-c` / `-Command` 包装器的内层命令（op-002b 第 2 条：递归解析）。
 *
 * 用 token 而不是原文 offset：tokenizer 已去引号，`"bash" -c "…"`（程序名/命令都加引号）
 * 同样能识别，且 payload 可重新拼成可解析的命令串。
 * @param {string} statement
 * @returns {{ payload: string, shell: 'bash'|'pwsh' } | null}
 */
function extractWrapperPayload(statement) {
  const tokens = tokenizeShell(statement);
  for (let index = 0; index < tokens.length; index += 1) {
    const name = commandNameOf(tokens[index]);
    const isPosix = /^(?:bash|sh|zsh|dash|fish|ksh)$/.test(name);
    const isPowerShell = /^(?:powershell|pwsh)$/.test(name);
    if (!isPosix && !isPowerShell) continue;
    for (let cursor = index + 1; cursor < tokens.length && tokens[cursor] !== '|'; cursor += 1) {
      const flag = tokens[cursor];
      const matched = isPosix ? /^-[a-zA-Z]*c$/i.test(flag) : /^-(?:c|command|commandwithargs)$/i.test(flag);
      if (!matched) continue;
      const payloadTokens = [];
      for (let rest = cursor + 1; rest < tokens.length && tokens[rest] !== '|'; rest += 1) payloadTokens.push(tokens[rest]);
      return { payload: payloadTokens.join(' ').trim(), shell: isPosix ? 'bash' : 'pwsh' };
    }
  }
  return null;
}

/**
 * 包装器 payload 的首个 token 是变量/子表达式（`bash -c "$CMD"`）→ 内层命令不可判定。
 * @param {string} payload
 * @returns {boolean}
 */
function payloadIsUnresolvable(payload) {
  const first = String(payload).trim().split(/\s+/)[0] ?? '';
  return /[$`]/.test(first);
}

/**
 * 判断 shell 命令里的 `openfeel …` 是否是写子命令（第 1 类）。
 * @param {string[]} args `openfeel` 之后的 token
 * @returns {boolean}
 */
function isOpenFeelWriteInvocation(args) {
  const value = args.filter((token) => token !== '' && token !== '|');
  if (value.length === 0) return false;
  const verbIndex = value.findIndex((token) => !token.startsWith('-'));
  if (verbIndex === -1) return false;
  const verb = value[verbIndex].toLowerCase();
  if (!OPENFEEL_WRITE_VERBS.has(verb)) return false;
  const rest = value.slice(verbIndex + 1);
  // chore：`--status` / `--end` 放行（只读 / 收口）；带说明或 `--ttl-min` 视为开启 → 拒。
  if (verb === 'chore') {
    if (value.some((token) => ['--status', '--end', '--help', '-h'].includes(token))) return false;
    const hasArgument = rest.some((token) => !token.startsWith('-'));
    const hasTtl = value.some((token) => token === '--ttl-min' || token.startsWith('--ttl-min='));
    return hasArgument || hasTtl;
  }
  const nonFlags = [];
  for (let index = 0; index < value.length; index += 1) {
    if (!value[index].startsWith('-')) nonFlags.push(value[index].toLowerCase());
  }
  const sub = nonFlags[1];
  if (sub === undefined) return false;
  if (OPENFEEL_READONLY_VERBS.has(sub)) return false;
  // 只读特例：`checkpoint list` / `plan stage list` / `plan scheme list` / `review list`
  if (verb === 'flow' && sub === 'checkpoint') return nonFlags[2] !== 'list';
  if (verb === 'flow' && sub === 'plan') {
    return !((nonFlags[2] === 'stage' || nonFlags[2] === 'scheme') && nonFlags[3] === 'list');
  }
  if (verb === 'flow' && sub === 'review') return nonFlags[2] !== 'list';
  return true;
}

/**
 * 找到 shell 命令里的 openfeel 写调用（第 1 类），返回可读片段或 null。
 *
 * op-005 / P1-1 加固 —— 旧实现只在「引号未掩码的原文」上找 `openfeel`，于是：
 * - `& "openfeel" chore --source x`、`'openfeel' chore …`（引号程序名）→ ALLOW；
 * - `node bin/openfeel.js chore --source x`、`node ./dist/cli.js …` → ALLOW；
 * - `Start-Process openfeel …` → ALLOW。
 * 三条都能让 agent 给自己开 `--source` 写窗口。
 *
 * 现在：先 `unquoteProgramNames` 把命令位置上的引号程序名还原，再掩码参数文本
 * （避免 `git commit -m "openfeel chore"` 被消息误杀）；并额外识别
 * `node <cli/index/bin 路径>`、`Start-Process openfeel`、以及
 * **任何同时含 `chore` 与 `--source` 的命令**（chore 是纯人类通道）。
 *
 * @param {string} statement
 * @returns {string | null}
 */
function matchOpenFeelWrite(statement) {
  const unquoted = unquoteProgramNames(statement);
  const masked = maskQuoted(unquoted);
  const snippet = truncateCommand(statement, 160) ?? 'openfeel';

  // ① 兜底（chore 纯人类通道）：`chore` + `--source` 不论怎么写都拒。
  const flat = tokenizeShell(masked).map((token) => commandNameOf(token));
  if (flat.includes('chore') && tokenizeShell(masked).some((token) => token.startsWith('--source'))) return snippet;

  // ② 程序位置上的 openfeel（含 `& "openfeel"` 已由 unquoteProgramNames 还原）
  const pattern = /\bopenfeel(?:\.cmd|\.exe)?\b/gi;
  let match;
  while ((match = pattern.exec(masked)) !== null) {
    const start = match.index + match[0].length;
    const pipeAt = masked.indexOf('|', start);
    const argsText = unquoted.slice(start, pipeAt === -1 ? undefined : pipeAt);
    if (isOpenFeelWriteInvocation(tokenizeShell(argsText))) return snippet;
  }

  // ③ `node <cli 路径>` / `Start-Process openfeel`（这里用**去引号**文本取参数：
  //    `-ArgumentList 'chore --source x'` 的实参在引号里，掩码后取不到）。
  const tokens = tokenizeShell(unquoted);
  for (let index = 0; index < tokens.length; index += 1) {
    const name = commandNameOf(tokens[index]);
    if (name === 'node' && index + 1 < tokens.length) {
      const script = tokens[index + 1];
      if (/openfeel|(?:^|[\\/])(?:cli|index)\.(?:js|mjs|cjs|ts)$|[\\/]bin[\\/]/i.test(script)
        && isOpenFeelWriteInvocation(tokens.slice(index + 2))) {
        return snippet;
      }
    }
    if (name === 'start-process') {
      let cursor = index + 1;
      while (cursor < tokens.length && tokens[cursor].startsWith('-')) cursor += 1;
      const program = commandNameOf(tokens[cursor] ?? '');
      // `-ArgumentList 'chore --source x'` 的实参是一个带空格的 token → 再拆开
      const startArgs = tokens.slice(cursor + 1).flatMap((token) => token.split(/\s+/).filter(Boolean));
      if (/openfeel/.test(program) && isOpenFeelWriteInvocation(startArgs)) return snippet;
    }
  }
  return null;
}

/**
 * 读取 patch 文件里的目标（`patch -i x.diff` / `git apply x.diff` / `patch < x.diff`）。
 * @param {string | undefined} file
 * @param {string} baseDir 已归一化命令基准目录
 * @returns {{ targets: string[], undecidable?: boolean, detail?: string }}
 */
function readPatchTargets(file, baseDir) {
  if (typeof file !== 'string' || file === '') {
    return { targets: [], undecidable: true, detail: '无法确定 patch 文件' };
  }
  try {
    const parsed = parsePatchTargets(readFileSync(resolve(baseDir, file), 'utf8'));
    if (!parsed.ok) return { targets: [], undecidable: true, detail: parsed.reason };
    return { targets: parsed.paths };
  } catch {
    return { targets: [], undecidable: true, detail: `无法读取 patch 文件 ${file}` };
  }
}

/**
 * 解析 PowerShell 写 cmdlet 的目标（pwsh 分支）。
 * @param {string} command 已小写的命令名
 * @param {string[]} tokens
 * @param {number} start
 * @returns {{ targets: string[], undecidable?: boolean, detail?: string } | null}
 */
function parsePowerShellWrite(command, tokens, start) {
  const spec = PS_WRITE_SPECS.get(command);
  if (spec === undefined) return null;
  // P2：`sed -i` 在 pwsh 分支也要按 -i 判定（不是「只有源」的 dest 语义）。
  if (spec === 'sed') {
    const sedArgs = [];
    for (let index = start + 1; index < tokens.length && tokens[index] !== '|'; index += 1) sedArgs.push(tokens[index]);
    return parseSedTargets(sedArgs);
  }
  const namedTargets = [];
  const positionals = [];
  let index = start + 1;
  while (index < tokens.length && tokens[index] !== '|') {
    const token = tokens[index];
    if (token.startsWith('-') && token.length > 1) {
      const colon = token.indexOf(':');
      const name = (colon === -1 ? token.slice(1) : token.slice(1, colon)).toLowerCase();
      let value = colon === -1 ? undefined : token.slice(colon + 1);
      if (PS_PATH_PARAMS.has(name)) {
        if (value === undefined) {
          value = tokens[index + 1];
          index += 1;
        }
        const isSource = spec === 'dest' && PS_SOURCE_PARAMS.has(name);
        if (!isSource && value !== undefined && value !== '|' && value !== '') namedTargets.push(value);
      } else if (!PS_SWITCH_PARAMS.has(name) && value === undefined) {
        // 未知参数：保守地当作「带一个值」，避免把参数值误当目标路径
        index += 1;
      }
      index += 1;
      continue;
    }
    positionals.push(token);
    index += 1;
  }
  const targets = [...namedTargets];
  if (spec === 'first') {
    if (positionals.length > 0) targets.push(positionals[0]);
  } else if (spec === 'all') {
    targets.push(...positionals);
  } else if (spec === 'dest2') {
    // `robocopy src dst [files...]` / `xcopy src dst /E`：第二个位置参数才是目标。
    if (positionals.length >= 2) targets.push(positionals[1]);
    else return { targets, undecidable: true, detail: `${command} 缺少目标（只有源）` };
  } else if (positionals.length >= 2) {
    targets.push(positionals[positionals.length - 1]);
  } else if (positionals.length === 1) {
    return { targets, undecidable: true, detail: `${command} 缺少目标（只有源）` };
  }
  return { targets };
}

/**
 * 解析 POSIX 写命令的目标（bash 分支）。
 * @param {string} command 已小写的命令名
 * @param {string[]} tokens
 * @param {number} start
 * @param {string} baseDir
 * @returns {{ targets: string[], undecidable?: boolean, detail?: string } | null}
 */
function parsePosixWrite(command, tokens, start, baseDir) {
  const spec = POSIX_WRITE_SPECS.get(command);
  if (spec === undefined) return null;
  const args = [];
  for (let index = start + 1; index < tokens.length && tokens[index] !== '|'; index += 1) args.push(tokens[index]);

  if (spec === 'sed') return parseSedTargets(args);
  if (spec === 'patch') {
    let patchFile;
    for (let index = 0; index < args.length; index += 1) {
      const arg = args[index];
      if (arg === '<' || arg === '-i' || arg === '--input') { patchFile = args[index + 1]; break; }
      if (arg.startsWith('-i') && arg.length > 2) { patchFile = arg.slice(2); break; }
      if (!arg.startsWith('-')) { patchFile = arg; break; }
    }
    return readPatchTargets(patchFile, baseDir);
  }

  const positionals = [];
  let endOfFlags = false;
  for (const arg of args) {
    if (!endOfFlags && arg === '--') { endOfFlags = true; continue; }
    if (!endOfFlags && arg.startsWith('-') && arg !== '-') continue;
    positionals.push(arg);
  }
  if (spec === 'dest') {
    if (positionals.length >= 2) return { targets: [positionals[positionals.length - 1]] };
    if (positionals.length === 1) return { targets: [], undecidable: true, detail: `${command} 缺少目标` };
    return { targets: [] };
  }
  if (spec === 'dest2') {
    if (positionals.length >= 2) return { targets: [positionals[1]] };
    return { targets: [], undecidable: true, detail: `${command} 缺少目标（只有源）` };
  }
  return { targets: positionals };
}

/**
 * `sed -i` 的目标（只在 `-i`/`--in-place` 时才算写入）。
 * @param {string[]} args
 * @returns {{ targets: string[], undecidable?: boolean, detail?: string }}
 */
function parseSedTargets(args) {
  const inPlace = args.some((arg) => arg === '--in-place' || /^-[a-zA-Z]*i/.test(arg));
  if (!inPlace) return { targets: [] };
  const rest = [];
  let scriptSeen = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '-e' || arg === '--expression' || arg === '-f' || arg === '--file') {
      index += 1;
      scriptSeen = true;
      continue;
    }
    if (arg.startsWith('-')) continue;
    if (!scriptSeen) { scriptSeen = true; continue; }
    rest.push(arg);
  }
  if (rest.length === 0) return { targets: [], undecidable: true, detail: 'sed -i 的目标无法确定' };
  return { targets: rest };
}

/* ── op-005 / P0-1：未识别命令不再静默放行 ────────────────────────────────
 *
 * 下面的解析器承担「写明」与「确认只读」两条正面证据；两条都不成立时由
 * `analyzeShellStatement` 记入第 4 类（undecidable），**绝不**再返回 no-write。
 * ─────────────────────────────────────────────────────────────────────── */

/** 带「输出到文件」语义的下载器参数（值可能是下一个 token 或 `:`/`=` 后粘连）。 */
const DOWNLOAD_OUTPUT_FLAGS = new Set(['-o', '-outfile', '--output', '--output-document', '--out']);
/** 下载器的「文件名来自 URL」参数 → 目标不可判定（大写 `-O` / `--remote-name`）。 */

/** certutil 的落盘动作（`-urlcache` 下载、`-decode`/`-encode` 转换）。 */
const CERTUTIL_WRITE_FLAGS = new Set(['-urlcache', '-decode', '-decodehex', '-encode']);

/** 通用的「写」长参数（任何程序带上都代表就地改写）。 */
const GENERIC_WRITE_FLAGS = new Set(['--write', '--fix', '--write-changes', '--in-place']);

/** 取值型 flag：其后的 token 是参数值而不是目标路径。 */
const VALUE_FLAGS = new Set([
  '--config', '-c', '--ignore-path', '--ignore-pattern', '--parser', '--plugin', '--ext',
  '--rules', '--rule', '--max-warnings', '--stdin-filename', '--cache-location',
  '--print-width', '--tab-width', '--log-level', '--cache', '--format', '--output',
]);

/** `npm run <script>` 里视为「构建/测试」的脚本名。 */
const BUILD_SCRIPTS = new Set([
  'build', 'test', 'lint', 'typecheck', 'type-check', 'check', 'compile', 'bundle',
  'package', 'coverage', 'format:check', 'test:unit', 'test:integration', 'ci',
]);

/** .NET 静态**只读**调用（op-006 起由 `DOTNET_READ_METHODS` 正面白名单承担）。 */

/**
 * 收集位置参数（跳过 flag 与 `--`），可选跳过取值型 flag 的值。
 * @param {string[]} args
 * @param {Set<string>} [valueFlags]
 * @returns {string[]}
 */
function positionalArgs(args, valueFlags = new Set()) {
  const out = [];
  let endOfFlags = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!endOfFlags && arg === '--') { endOfFlags = true; continue; }
    if (!endOfFlags && arg.startsWith('-') && arg !== '-') {
      if (valueFlags.has(arg.toLowerCase())) index += 1;
      continue;
    }
    out.push(arg);
  }
  return out;
}

/**
 * 格式化/修复工具的写目标（op-005 / P0-1：`prettier --write src`、`eslint --fix`、`gofmt -w`）。
 *
 * 只有在**确实要求就地改写**时才返回非 null：`--write` / `--fix` / `--write-changes`
 * 对任何程序生效；`-w` / `-i` / `--in-place` 只对已知 formatter 生效
 * （否则 `grep -i` / `-w` 会被误判成写）。
 *
 * @param {string} name 程序名（已小写、去 .exe）
 * @param {string[]} args
 * @returns {{ targets: string[], undecidable?: boolean, detail?: string } | null}
 */
function parseFormatterWrite(name, args) {
  const lower = args.map((arg) => arg.toLowerCase());
  const genericWrite = lower.some((arg) => GENERIC_WRITE_FLAGS.has(arg));
  const formatter = FORMATTER_TOOLS.has(name);
  const shortWrite = formatter && lower.some((arg) => arg === '-w' || arg === '-i'
    || (/^-[a-z]*[wi]$/.test(arg) && arg.length <= 4));
  if (!genericWrite && !shortWrite) return null;
  const targets = positionalArgs(args, VALUE_FLAGS);
  if (targets.length === 0) {
    return { targets: [], undecidable: true, detail: `${name} 的就地改写目标未给出（可能作用于整树）` };
  }
  return { targets };
}

/**
 * 下载器的落盘目标（`curl -o x` / `iwr -OutFile x` / `wget -O x`）。
 *
 * 没有输出参数 → null（下载到 stdout，只读）。注意 `-O` 在**两个工具里含义相反**：
 * curl 的 `-O` 是「文件名来自 URL」（目标不可判定），wget 的 `-O` 是「输出到文件」
 * （下一个 token 是目标）。
 *
 * @param {string} name 程序名（已小写、去 .exe）
 * @param {string[]} args
 * @returns {{ targets: string[], undecidable?: boolean, detail?: string } | null}
 */
function parseDownloadWrite(name, args) {
  const wgetLike = name === 'wget';
  for (let index = 0; index < args.length; index += 1) {
    const raw = args[index];
    const lower = raw.toLowerCase();
    const colon = lower.indexOf(':');
    const head = colon === -1 ? lower : lower.slice(0, colon);
    // wget 的 -O <file>：输出到文件
    if (wgetLike && raw === '-O') {
      const value = args[index + 1];
      if (typeof value !== 'string' || value === '') return { targets: [], undecidable: true, detail: 'wget -O 缺少输出路径' };
      return { targets: [value] };
    }
    // curl / iwr 的「文件名来自 URL」形态 → 第 4 类
    if (!wgetLike && (raw === '-O' || lower === '--remote-name' || lower === '--remote-name-all' || /^-[a-z]*O$/.test(raw))) {
      return { targets: [], undecidable: true, detail: `${raw} 的文件名来自 URL` };
    }
    if (DOWNLOAD_OUTPUT_FLAGS.has(head)) {
      const attachedValue = colon === -1 ? (lower !== head ? raw.slice(head.length) : '') : raw.slice(colon + 1);
      const value = attachedValue !== '' ? attachedValue : args[index + 1];
      if (typeof value !== 'string' || value === '' || value.startsWith('-')) {
        return { targets: [], undecidable: true, detail: `${raw} 缺少输出路径` };
      }
      return { targets: [value] };
    }
    // 短参数粘连：`-sSLo out.txt` / `-oout.txt`
    const combined = /^-([a-zA-Z]*)o$/.exec(raw);
    if (combined !== null && raw.length > 2) {
      const value = args[index + 1];
      if (typeof value !== 'string' || value === '') return { targets: [], undecidable: true, detail: `${raw} 缺少输出路径` };
      return { targets: [value] };
    }
    const attachedShort = /^-([a-zA-Z]*)o(.+)$/.exec(raw);
    if (attachedShort !== null) return { targets: [attachedShort[2]] };
  }
  return null;
}

/**
 * certutil 的落盘目标（`certutil -urlcache -split -f <url> <out>`）。
 * @param {string[]} args
 * @returns {{ targets: string[], undecidable?: boolean, detail?: string } | null}
 */
function parseCertutilWrite(args) {
  const lower = args.map((arg) => arg.toLowerCase());
  if (!lower.some((arg) => CERTUTIL_WRITE_FLAGS.has(arg))) return null;
  const positionals = positionalArgs(args);
  if (positionals.length === 0) {
    return { targets: [], undecidable: true, detail: 'certutil 的落盘目标不可判定' };
  }
  return { targets: [positionals[positionals.length - 1]] };
}

/**
 * 包管理器 / 包运行器（`npx` / `npm` / `pnpm` / `yarn`）分类。
 *
 * 放行口径（op-005 / P0-1）：**只**放行「已知构建/测试工具」与已知构建脚本；
 * `npx <任意>` 一律第 4 类（可执行任意包，静态不可判）。
 *
 * @param {string} name 已小写程序名
 * @param {string[]} args
 * @returns {{ kind: 'readonly'|'build'|'unknown', detail?: string }}
 */
function classifyPackageRunner(name, args) {
  const tokens = args.filter((token) => token !== '');
  let index = 0;
  while (index < tokens.length && tokens[index].startsWith('-')) {
    if (tokens[index] === '-p' || tokens[index] === '--package') index += 2;
    else index += 1;
  }
  const sub = (tokens[index] ?? '').toLowerCase();
  const rest = tokens.slice(index + 1);
  if (PACKAGE_RUNNERS.has(name)) {
    if (sub === '') return { kind: 'unknown', detail: `${name} 未指定要运行的程序` };
    if (BUILD_TOOL_PROGRAMS.has(sub) || FORMATTER_TOOLS.has(sub) || READONLY_PROGRAMS.has(sub)) return { kind: 'build' };
    return { kind: 'unknown', detail: `${name} ${sub} 会执行任意包，目标不可判定` };
  }
  if (sub === '' || sub === '--version' || sub === '-v' || sub === '-h' || sub === '--help') return { kind: 'readonly' };
  if (['install', 'i', 'ci', 'add', 'update', 'up', 'prune', 'dedupe'].includes(sub)) return { kind: 'build' };
  if (sub === 'test' || sub === 't') return { kind: 'build' };
  if (sub === 'run' || sub === 'run-script' || sub === 'rum') {
    const script = (rest.find((token) => !token.startsWith('-')) ?? '').toLowerCase();
    if (BUILD_SCRIPTS.has(script)) return { kind: 'build' };
    return { kind: 'unknown', detail: `${name} run ${script || '?'} 的脚本内容静态不可判` };
  }
  if (sub === 'exec' || sub === 'x' || sub === 'dlx') {
    const tool = (rest.find((token) => !token.startsWith('-')) ?? '').toLowerCase();
    if (tool !== '' && (BUILD_TOOL_PROGRAMS.has(tool) || FORMATTER_TOOLS.has(tool))) return { kind: 'build' };
    return { kind: 'unknown', detail: `${name} ${sub} ${tool || '?'} 会执行任意程序` };
  }
  return { kind: 'unknown', detail: `${name} ${sub} 无法确证` };
}

/**
 * 脚本解释器（`node x.js` / `python x.py` / `bun x`）分类。
 *
 * `-e` / `-c` 的内联形态已由 `matchInlineInterpreter` 处理；到这里只可能是
 * 「跑一个脚本文件」——脚本内容不可见 → 默认第 4 类（**不**一刀切放行）。
 *
 * @param {string} name
 * @param {string[]} args
 * @returns {{ kind: 'readonly'|'unknown', detail?: string }}
 */
function classifyScriptInterpreter(name, args) {
  const tokens = args.filter((token) => token !== '');
  const positionals = tokens.filter((token) => !token.startsWith('-'));
  if (positionals.length > 0) {
    return { kind: 'unknown', detail: `${name} 执行的脚本 ${positionals[0]} 内容不可见` };
  }
  const versionOnly = tokens.every((token) => ['--version', '-v', '-V', '--help', '-h'].includes(token));
  if (tokens.length > 0 && versionOnly) return { kind: 'readonly' };
  return { kind: 'unknown', detail: `${name} 参数无法判定` };
}

/**
 * 构建/测试工具的子命令收窄（`cargo fmt` 会改源码，不能整命令放行）。
 * @param {string} name
 * @param {string[]} args
 * @returns {{ kind: 'build'|'unknown', detail?: string }}
 */
function classifyBuildTool(name, args) {
  if (name === 'tsc') {
    // `tsc file.ts` 会就地生成 `file.js`；只有 `-b`/`-p`/`--noEmit` 才是纯产物。
    const safe = args.some((arg) => ['-b', '--build', '-p', '--project', '--noEmit', '--version', '-v', '--help', '-h'].includes(arg));
    const positional = args.some((arg) => !arg.startsWith('-'));
    if (!positional || safe) return { kind: 'build' };
    return { kind: 'unknown', detail: 'tsc <文件> 会就地生成 .js' };
  }
  const subs = BUILD_TOOL_SUBCOMMANDS.get(name);
  if (subs === undefined) return { kind: 'build' };
  const first = args.find((arg) => !arg.startsWith('-'));
  if (first === undefined) return { kind: 'build' };
  if (subs.has(first.toLowerCase())) return { kind: 'build' };
  return { kind: 'unknown', detail: `${name} ${first} 不确认只写产物` };
}

/** git 里表示「整个工作树」的路径参数（`.` / `:/` / `*` 等）。 */
const WHOLE_TREE_GIT_TARGETS = new Set(['.', './', './*', ':/', ':(top)', '*', '**', '.\\']);

/**
 * 确认只读（不写工作区）的 git 子命令（v1.5.12 / stage-127 op-004 / P1-3）。
 *
 * 旧实现把所有未命中写分支的子命令都当 `readonly` —— `git -c 'alias.zz=commit -a -m pwn' zz`
 * 因此得到 `kind:'none'`，任意相位放行（真展开成 commit 提交了源码）。未知子命令现在
 * 落第 4 类（`undecidable`，默认告警 + strict 拒），只保留下面这张正面白名单。
 * 注意：`bisect` / `submodule` / `worktree` / `lfs` / `add` / `push` / `init` / `clone`
 * 都会改工作区或仓库状态，**不在**白名单里。
 */
const GIT_READONLY_SUBCOMMANDS = new Set([
  // 查询类
  'status', 'log', 'diff', 'show', 'branch', 'fetch', 'remote', 'rev-parse', 'rev-list',
  'ls-files', 'ls-tree', 'ls-remote', 'cat-file', 'hash-object', 'grep', 'blame', 'describe',
  'shortlog', 'tag', 'show-ref', 'for-each-ref', 'merge-base', 'name-rev', 'reflog',
  'symbolic-ref', 'whatchanged', 'count-objects', 'fsck', 'help', 'version', 'var',
  'diff-tree', 'diff-index', 'diff-files', 'check-ignore', 'check-attr', 'cherry', 'notes',
  'verify-commit', 'verify-tag', 'range-diff',
  // 只动 index / refs / 对象库，**不覆盖工作区**（沿用旧行为，避免严格档误杀日常流程）
  'add', 'update-index', 'read-tree', 'write-tree', 'commit-tree', 'update-ref', 'pack-refs',
  'gc', 'prune', 'maintenance', 'repack', 'rerere', 'replace', 'push',
]);

/**
 * `-c` / `--config-env` / `git config` 的**安全键白名单**（v1.5.12 / stage-127 op-006）。
 *
 * 旧实现是黑名单（只拦 alias.* / core.hooksPath / core.fsmonitor），于是
 * `git -c diff.external="sh run-me.sh" diff` / `core.pager` / `core.editor` /
 * `gpg.program` / `include.path` 这类「外部执行面」全漏。黑名单永远补不完 ——
 * 改成白名单：只放行确定不会执行外部程序、也不改写仓库归属的键，**其余（含未来新增）
 * 一律第 1 类硬拒**。
 *
 * 精确键：`user.name` / `user.email` / `core.quotepath` / `core.autocrlf` / `core.safecrlf`
 * 前缀键：`color.*` / `i18n.*`
 */
const SAFE_GIT_CONFIG_KEYS = new Set([
  'user.name', 'user.email', 'core.quotepath', 'core.autocrlf', 'core.safecrlf',
]);
const SAFE_GIT_CONFIG_PREFIXES = ['color.', 'i18n.'];

/**
 * 允许出现在命令位置的 `GIT_*` 环境变量（v1.5.12 / stage-127 op-006）。
 *
 * 只允许「身份/时间戳」类：写进提交对象的作者/提交者信息，不触发外部程序、不改仓库。
 * `GIT_DIR` / `GIT_WORK_TREE` / `GIT_INDEX_FILE`（仓库归属）、`GIT_EXTERNAL_DIFF`、
 * `GIT_CONFIG_GLOBAL`、`GIT_PAGER`、`GIT_SSH_COMMAND`、`GIT_ASKPASS` … **一律不放行**。
 */
const SAFE_GIT_ENV_VARS = new Set([
  'GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_AUTHOR_DATE',
  'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL', 'GIT_COMMITTER_DATE',
]);

/**
 * 该 git 配置键是否在安全白名单内（大小写不敏感）。
 * @param {string} key
 * @returns {boolean}
 */
function isSafeGitConfigKey(key) {
  const k = String(key).trim().toLowerCase();
  if (k === '') return false;
  if (SAFE_GIT_CONFIG_KEYS.has(k)) return true;
  return SAFE_GIT_CONFIG_PREFIXES.some((prefix) => k.startsWith(prefix));
}

/**
 * `-c` / `--config-env` / `git config <key>` 的键安全判定（v1.5.12 / stage-127 op-006）。
 *
 * 白名单之外一律返回拒绝理由：未列入安全白名单的配置键**可触发外部程序执行**
 * （`diff.external` / `core.pager` / `core.editor` / `gpg.program` / `include.path`
 * / `alias.*` …），静态无法判定。
 * @param {string} value `-c` 的值（`key=value` / `key`），或 `git config` 的第一个位置参数
 * @returns {string | null}
 */
function gitUnsafeConfigDetail(value) {
  if (typeof value !== 'string') return 'git 配置缺少键名';
  const key = value.replace(/^=/, '').split('=')[0].trim();
  if (key === '') return 'git 配置缺少键名';
  if (isSafeGitConfigKey(key)) return null;
  return `git 配置键 ${key.toLowerCase()} 不在安全白名单（未列入白名单的配置键可触发外部程序执行或改写仓库）`;
}

/**
 * 扫命令位置的 `VAR=value` 前缀里的非白名单 `GIT_*`（v1.5.12 / stage-127 op-006）。
 *
 * 非白名单 `GIT_*` 与 `-c` 是同一类外部执行面（`GIT_EXTERNAL_DIFF` / `GIT_CONFIG_GLOBAL`
 * / `GIT_PAGER` / `GIT_SSH_COMMAND` / `GIT_ASKPASS` …），一律第 1 类硬拒；
 * `GIT_DIR` / `GIT_WORK_TREE` / `GIT_INDEX_FILE` 额外说明「无法校验仓库归属」。
 * @param {string[]} prefixTokens 命令位置上的赋值前缀 token
 * @returns {string | null}
 */
function findUnsafeGitEnv(prefixTokens) {
  for (const token of prefixTokens) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(String(token));
    if (match === null) continue;
    const name = match[1].toUpperCase();
    if (!name.startsWith('GIT_')) continue;
    if (SAFE_GIT_ENV_VARS.has(name)) continue;
    if (name === 'GIT_DIR' || name === 'GIT_WORK_TREE' || name === 'GIT_INDEX_FILE') {
      return `${name} 改写 git 仓库归属，无法校验仓库归属，一律拒绝`;
    }
    return `${name} 不在安全白名单（git 环境变量可触发外部程序执行）`;
  }
  return null;
}

/**
 * 该 git 路径参数是否覆盖整个工作树（op-005 / P1-2）。
 * @param {string} token
 * @returns {boolean}
 */
function coversWholeTree(token) {
  return WHOLE_TREE_GIT_TARGETS.has(String(token).toLowerCase());
}

/**
 * git 子命令分类（第 2 类；`status|log|diff|branch|fetch` 等永远放行）。
 *
 * 整树写（`reset --hard`/`--merge`、`stash`（含 `push`）、`clean`、`commit`、
 * `checkout/switch 分支`、`merge/rebase/pull/…`）需要特定相位：
 * - 默认要求 `exec_running`（否则「非 exec 相位用 git 还原/丢弃源码」绕过一切文件门禁）；
 * - `commit` 额外允许 `review_passed` / `test_passed` / `archiving`（op-005 / P1-4：
 *   发版提交发生在 archiving；v1.5.13 / stage-128：审完即可提交、测完即可提交）；
 *   只放宽 `commit` 的 `phases`，写侧相位门槛（`decideForTargets`）仍只认 `exec_running`；
 * - 进入整树写前还有一道 `.openfeel/**` 无差异检查（op-005 / P1-2），见 `openfeelTreeDirty`。
 * @param {string[]} tokens
 * @param {number} start
 * @param {string} baseDir
 * @returns {{ kind: 'readonly' } | { kind: 'targets', targets: string[] } | { kind: 'whole-tree', detail: string, phases?: string[], gitSubcommand?: string, repoOverride?: boolean, gitConfig?: boolean } | { kind: 'unsafe', detail: string } | { kind: 'undecidable', detail: string }}
 */
function classifyGitCommand(tokens, start, baseDir) {
  let index = start + 1;
  let subcommand;
  // v1.5.12 / stage-127 C.4：git 全局选项解析。
  // **大小写敏感**：`-c`（config）与 `-C`（repo）是不同选项，必须先判 `-C` 再判 `-c`，
  // 否则 `-C/path` 会被 `-c` 前缀吞掉。分离值形式吞值 `+2`，附着形式（`-cV` / `-c=V`
  // / `--config-env=V` / `-C=…`）值已在本 token 内，只能 `+1`（再 `+2` 会把 `commit`
  // 当值吞掉 → 判成 `kind:'none'` 任意相位放行）。
  let repoOverride = false;
  /** 是否出现 `-c` / `--config-env`（v1.5.12 / stage-127 op-004 / P1-1）。 */
  let gitConfig = false;
  while (index < tokens.length && tokens[index] !== '|') {
    const token = tokens[index];
    // 仓库改写：`-C` / `--git-dir` / `--work-tree`（精确与附着两种形式）。
    if (token === '-C' || token === '--git-dir' || token === '--work-tree') {
      repoOverride = true;
      index += 2;
      continue;
    }
    if (
      token.startsWith('-C=')
      || (token.startsWith('-C') && token.length > 2)
      || token.startsWith('--git-dir=')
      || token.startsWith('--work-tree=')
    ) {
      repoOverride = true;
      index += 1;
      continue;
    }
    // config 类：吞值后继续；记录出现过 `-c`（书账分支要求没有），并把
    // **安全键白名单之外**的键判为外部执行面（op-006：黑名单永远补不完）。
    if (token === '-c' || token === '--config-env') {
      gitConfig = true;
      const unsafe = gitUnsafeConfigDetail(tokens[index + 1]);
      if (unsafe !== null) return { kind: 'unsafe', detail: unsafe };
      index += 2;
      continue;
    }
    if (token.startsWith('-c=') || (token.startsWith('-c') && token.length > 2) || token.startsWith('--config-env=')) {
      gitConfig = true;
      const value = token.startsWith('--config-env=') ? token.slice('--config-env='.length) : token.slice(2);
      const unsafe = gitUnsafeConfigDetail(value);
      if (unsafe !== null) return { kind: 'unsafe', detail: unsafe };
      index += 1;
      continue;
    }
    if (token.startsWith('-')) { index += 1; continue; }
    subcommand = token.toLowerCase();
    break;
  }
  if (subcommand === undefined) return { kind: 'readonly' };
  const rest = [];
  for (let cursor = index + 1; cursor < tokens.length && tokens[cursor] !== '|'; cursor += 1) rest.push(tokens[cursor]);
  const positionals = rest.filter((token) => !token.startsWith('-') && token !== '--');
  const dashdash = rest.indexOf('--');
  const pathsAfterDashDash = dashdash === -1 ? [] : rest.slice(dashdash + 1).filter((token) => !token.startsWith('-'));

  switch (subcommand) {
    case 'checkout':
    case 'switch': {
      if (rest.some((token) => ['-b', '-B', '--orphan', '-c', '--create'].includes(token))) return { kind: 'readonly' };
      if (dashdash !== -1) {
        // op-005 / P1-2：`git checkout -- .` 是**整树**写（旧实现按「目标 = 当前目录」
        // 处理 → exec_running 下放行，连 `.openfeel/**` 一起覆盖）。
        if (pathsAfterDashDash.length === 0 || pathsAfterDashDash.some(coversWholeTree)) {
          return { kind: 'whole-tree', detail: `git ${subcommand} --` };
        }
        return { kind: 'targets', targets: pathsAfterDashDash };
      }
      if (positionals.length === 0) return { kind: 'readonly' };
      if (positionals.some(coversWholeTree)) return { kind: 'whole-tree', detail: `git ${subcommand} .` };
      // `git checkout <path>`（无 `--`）= 还原该路径；分支名 → 整树切换
      if (positionals.length === 1 && /[\\/.]/.test(positionals[0])) {
        return { kind: 'targets', targets: [positionals[0]] };
      }
      return { kind: 'whole-tree', detail: `git ${subcommand} ${positionals[0]}` };
    }
    case 'restore': {
      if (positionals.length === 0 || positionals.some(coversWholeTree)) return { kind: 'whole-tree', detail: 'git restore' };
      return { kind: 'targets', targets: positionals };
    }
    case 'reset': {
      if (rest.includes('--hard') || rest.includes('--merge')) return { kind: 'whole-tree', detail: 'git reset --hard / --merge' };
      return { kind: 'readonly' };
    }
    case 'stash': {
      // op-005 / P1-3：`git stash`（无 action）/ `push` 会**丢弃工作区改动**，
      // 旧的 `readonly` 判定等于给了一条整树覆盖后门；只有 list/show 是真只读。
      const action = (positionals[0] ?? '').toLowerCase();
      if (action === 'list' || action === 'show') return { kind: 'readonly' };
      // op-006 / P1-1：`stash -u` 会把未跟踪文件也收走 → 需要未跟踪检查。
      const destroysUntracked = rest.some((token) => ['-u', '--include-untracked', '-a', '--all'].includes(token));
      return { kind: 'whole-tree', detail: `git stash ${action || 'push'}`, destroysUntracked };
    }
    case 'clean':
      // op-006 / P1-1：`git clean` 删的是未跟踪文件（`-x` 连 ignored 一起删），
      // 而 `.openfeel/**` 的证据大多是未跟踪 / 被忽略的 → 必须把这些也当「差异」。
      return {
        kind: 'whole-tree',
        detail: 'git clean',
        destroysUntracked: true,
        // `-fdx` / `-fdX` / 组合短参数：连 .gitignore 忽略的文件一起删。
        purgesIgnored: rest.some((token) => /^-[a-zA-Z]*[xX]/.test(token)),
      };
    case 'apply': {
      if (rest.some((token) => ['--check', '--stat', '--numstat', '--summary', '--name-only', '--name-status', '--verbose', '-v'].includes(token))) {
        return { kind: 'readonly' };
      }
      const parsed = readPatchTargets(positionals[0], baseDir);
      if (parsed.undecidable === true) return { kind: 'undecidable', detail: parsed.detail ?? 'git apply' };
      return { kind: 'targets', targets: parsed.targets };
    }
    case 'commit':
      // op-005 / P1-4：发版提交发生在 `archiving`，只认 exec_running 会误杀。
      // `commit` **不覆盖工作区**（它是把当前状态记进版本库），所以 P1-2 的
      // 「`.openfeel/**` 必须干净」不能套在它身上 —— 否则「先提交 .openfeel」
      // 的修复动作本身会被拒（死锁）。
      // v1.5.12 / stage-127 C.1/C.4：`gitSubcommand` 与 `repoOverride` 供
      // 「无阶段纯书账」分支判定（字段白名单必须两处一并透传，见
      // `analyzeShellStatement` / `classifyShellCommand`）。
      // v1.5.13 / stage-128：审完即可提交（`review_passed`）/ 测完即可提交（`test_passed`），
      // `done` 仍拒（工作已收口，落地走归档提交）。**只放宽 commit**：写侧相位
      // （`decideForTargets`）与 `checkout`/`reset --hard`/`stash`/`clean` 一律不动。
      return {
        kind: 'whole-tree',
        detail: 'git commit',
        phases: ['exec_running', 'review_passed', 'test_passed', 'archiving'],
        preservesWorktree: true,
        gitSubcommand: 'commit',
        repoOverride,
        gitConfig,
      };
    case 'merge':
    case 'rebase':
    case 'pull':
    case 'cherry-pick':
    case 'revert':
    case 'am':
      return { kind: 'whole-tree', detail: `git ${subcommand}` };
    case 'rm':
    case 'mv':
      return positionals.length > 0
        ? { kind: 'targets', targets: positionals }
        : { kind: 'undecidable', detail: `git ${subcommand}` };
    case 'config': {
      // v1.5.12 / stage-127 op-006：持久化配置与 `-c` 是同一类外部执行面
      // （`diff.external` / `core.pager` / `alias.*` / `include.path` …）。只读用法
      // （`--get*` / `--list` / `git config <key>` 单参数读值）照旧放行；
      // **安全键白名单之外**的键写入硬拒（`--unset*` / `--remove-section`
      // 只会减少攻击面，直接放行）。
      const readOnly = rest.some((token) => [
        '--get', '--get-all', '--get-regexp', '--get-urlmatch', '--list', '-l', '--show-origin',
        '--show-scope', '--name-only', '--null', '-z', '--help', '-h', '--type', '--bool', '--int',
      ].includes(token));
      const removing = rest.some((token) => token === '--unset' || token === '--unset-all' || token === '--remove-section');
      const writing = positionals.length >= 2
        || rest.some((token) => ['--add', '--replace-all', '--edit', '-e', '--rename-section'].includes(token));
      const unsafe = readOnly || removing || !writing ? null : gitUnsafeConfigDetail(positionals[0]);
      if (unsafe !== null) return { kind: 'unsafe', detail: `git config：${unsafe}` };
      return { kind: 'readonly' };
    }
    default:
      // v1.5.12 / stage-127 op-004 / P1-3：**未知子命令不再当只读** ——
      // `git -c 'alias.zz=…' zz` / 未来新增写子命令都曾因此「任意相位放行」。
      // 正面白名单之外一律落第 4 类（默认告警 + strict 拒）。
      if (GIT_READONLY_SUBCOMMANDS.has(subcommand)) return { kind: 'readonly' };
      return { kind: 'undecidable', detail: `git ${subcommand} 不在只读白名单（写入意图无法判定）` };
  }
}

/**
 * 分析一句命令：抽出写入目标 / 整树写标记 / 「未识别命令」。
 *
 * op-005 / P0-1 核心改动：**每个命令位置上的程序都必须拿到正面证据** ——
 * 命中写解析器（产出目标）或命中只读/构建/包管理器白名单。两者都不成立时记
 * `undecidable = true`（第 4 类），**不再**静默按「没有写」放行。
 *
 * @param {string} statement
 * @param {'bash'|'pwsh'} shell
 * @param {string} baseDir
 * @returns {{ targets: string[], wholeTree?: string, wholeTreePhases?: string[], wholeTreeGitSubcommand?: string, wholeTreeRepoOverride?: boolean, wholeTreeGitConfig?: boolean, blockedGit?: string, undecidable: boolean, detail: string }}
 */
function analyzeShellStatement(statement, shell, baseDir, vars = new Map()) {
  const redirections = scanShellRedirections(statement);
  const tokens = tokenizeShell(redirections.cleaned).filter((token) => token !== '');
  const targets = [...redirections.targets];
  let undecidable = false;
  let detail = '';

  /** 记一条「无法确证不写」的证据（第 4 类）。 */
  const noteUnknown = (descriptor) => {
    undecidable = true;
    if (detail === '') detail = descriptor;
  };

  // 命令替换（`echo $(touch x)` / 反引号）的内层命令不进入解析器 → 第 4 类。
  // 叠加在正常分析之上（不提前返回）：`git commit -m "…$(…)"` 仍按整树写判。
  // 反引号用掩码文本判断，避免提交信息里的反引号被误当命令替换。
  // v1.5.12 / stage-127 op-004（P0）：**进程替换** `<(...)` / `>(...)` 同样会真执行内层
  // 命令（`git commit -m x < <(rm -rf src)`），而且不进 tokenizer → 也记第 4 类。
  // 引号内是字面量（bash 不展开），所以用掩码文本判，避免提交信息被误杀。
  const maskedForSubstitution = maskQuoted(statement);
  if (
    /\$\(/.test(statement)
    || maskedForSubstitution.includes('`')
    || /<\(|>\(/.test(maskedForSubstitution)
  ) {
    noteUnknown('命令替换 / 进程替换（$() / 反引号 / <() / >()）的内层命令无法解析');
  }

  for (let index = 0; index < tokens.length; index += 1) {
    // 纯变量赋值语句（`$c='Set-Content'` / `F=src/x.ts`）本身不写盘，跳过；
    // 后续 `& $c …` 会单独落到第 4 类（不静默放行）。
    if (LITERAL_VAR_ASSIGN_RE.test(tokens.join(' '))) continue;
    const isCommandStart = index === 0 || tokens[index - 1] === '|' || tokens[index - 1] === '&';
    if (!isCommandStart) continue;
    let cursor = index;
    // v1.5.12 / stage-127 op-004（P1-4）：命令位置的 `VAR=value` 环境赋值前缀。
    // 不剥离的话 `GIT_DIR=../other/.git GIT_WORK_TREE=../other git commit` 会把
    // `GIT_DIR=…` 当成「未识别命令」→ 第 4 类默认 warn 放行（真把提交写进别的仓库）。
    while (cursor < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[cursor])) cursor += 1;
    while (cursor < tokens.length && SHELL_WRAPPER_COMMANDS.has(commandNameOf(tokens[cursor]))) {
      cursor += 1;
      while (cursor < tokens.length && (tokens[cursor].startsWith('-') || /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[cursor]))) cursor += 1;
    }
    if (cursor >= tokens.length || tokens[cursor] === '|') continue;
    /** 命令位置的赋值前缀（`VAR=value`，含 wrapper 之后的），op-006 用它判 `GIT_*` 白名单。 */
    const prefixTokens = tokens.slice(index, cursor);
    let name = commandNameOf(tokens[cursor]);
    // `&` / `.` 调用运算符（op-005 / P0-1）：被调用者是字面量就按它判，
    // 是**同命令内一次字面量赋值**（`$c='Set-Content'; & $c …`）→ 解析成该程序再判
    // （与「目标变量」同一口径）；其余变量/子表达式 → 第 4 类
    // （旧实现直接 continue = 静默放行）。
    if (name === '&' || name === '.') {
      const callee = tokens[cursor + 1];
      let resolvedCallee = null;
      if (callee !== undefined && callee !== '|') {
        const resolved = resolveShellToken(callee, vars);
        if (resolved.ok) resolvedCallee = resolved.value;
      }
      if (resolvedCallee === null) {
        noteUnknown(`${name} 调用运算符的被调用者不可判定`);
        continue;
      }
      cursor += 1;
      name = commandNameOf(resolvedCallee);
    }
    const args = [];
    for (let rest = cursor + 1; rest < tokens.length && tokens[rest] !== '|'; rest += 1) args.push(tokens[rest]);

    if (name === 'git') {
      // v1.5.12 / stage-127 op-006：**先判执行面，再判子命令** —— 非白名单 `GIT_*`
      // 环境前缀（GIT_EXTERNAL_DIFF / GIT_CONFIG_GLOBAL / GIT_PAGER / GIT_SSH_COMMAND /
      // GIT_ASKPASS / GIT_DIR …）可触发外部程序或改写仓库归属，一律第 1 类硬拒。
      const unsafeEnv = findUnsafeGitEnv(prefixTokens);
      if (unsafeEnv !== null) return { targets, blockedGit: unsafeEnv, undecidable, detail };
      const git = classifyGitCommand(tokens, cursor, baseDir);
      // v1.5.12 / stage-127 op-004/op-006：`-c` / `--config-env` 的键不在安全白名单
      // 即外部执行面（内容不可见）→ 交回第 1 类硬拒（只读子命令也先过这一关）。
      if (git.kind === 'unsafe') return { targets, blockedGit: git.detail, undecidable, detail };
      if (git.kind === 'whole-tree') {
        return {
          targets,
          wholeTree: git.detail,
          wholeTreePhases: git.phases,
          wholeTreePreservesWorktree: git.preservesWorktree,
          wholeTreeDestroysUntracked: git.destroysUntracked === true,
          wholeTreePurgesIgnored: git.purgesIgnored === true,
          // v1.5.12 / stage-127 C.1：**新增字段必须同时改这两处白名单**
          // （这里 + `classifyShellCommand` 的 whole-tree 重建），否则字段丢失
          // 会让「无阶段纯书账」放行条件恒不成立。
          wholeTreeGitSubcommand: git.gitSubcommand,
          wholeTreeRepoOverride: git.repoOverride === true,
          wholeTreeGitConfig: git.gitConfig === true,
          undecidable,
          detail,
        };
      }
      if (git.kind === 'targets') targets.push(...git.targets);
      else if (git.kind === 'undecidable') noteUnknown(git.detail ?? 'git');
      continue;
    }

    // `Start-Process <程序> …`：被启动的程序本身不可判 → 第 4 类。
    if (name === 'start-process') {
      const started = positionalArgs(args).find((token) => !token.startsWith('-'));
      if (started === undefined) noteUnknown('Start-Process 未给出要启动的程序');
      else noteUnknown(`Start-Process ${commandNameOf(started)} 的目标不可判定`);
      continue;
    }

    if (DOWNLOAD_TOOLS.has(name)) {
      const download = parseDownloadWrite(name, args);
      if (download === null) continue; // 无输出参数 = 下载到 stdout
      targets.push(...download.targets);
      if (download.undecidable === true) noteUnknown(download.detail ?? name);
      continue;
    }

    if (name === 'certutil') {
      const cert = parseCertutilWrite(args);
      if (cert === null) continue; // `certutil -hashfile` 等只读用法
      targets.push(...cert.targets);
      if (cert.undecidable === true) noteUnknown(cert.detail ?? name);
      continue;
    }

    const formatter = parseFormatterWrite(name, args);
    if (formatter !== null) {
      targets.push(...formatter.targets);
      if (formatter.undecidable === true) noteUnknown(formatter.detail ?? name);
      continue;
    }
    // op-006 / P2：formatter 没带写标志（`prettier --check` / `eslint src` / `gofmt -l`）
    // = 纯检查，确认只读；否则 strict 档会把这类日常命令当第 4 类误拒。
    if (FORMATTER_TOOLS.has(name)) continue;

    // 写命令解析：**两个分支都跑并合并**（op-005）。
    // 只看本 shell 的 spec 会漏：pwsh 分支把 `rm -rf .openfeel` 里的 `-rf` 当
    // 「未知具名参数」消费掉下一个 token（保守规则），结果 targets 为空 →
    // 误判成「没有写」。合并 POSIX spec 后目标仍能取到；两类 spec 是保守并集
    // （多出来的目标只会更严，不会更松）。
    const parsed = [];
    if (shell === 'pwsh') {
      parsed.push(parsePowerShellWrite(name, tokens, cursor), parsePosixWrite(name, tokens, cursor, baseDir));
    } else {
      parsed.push(parsePosixWrite(name, tokens, cursor, baseDir), parsePowerShellWrite(name, tokens, cursor));
    }
    const writes = parsed.filter((entry) => entry !== null);
    if (writes.length > 0) {
      for (const write of writes) {
        targets.push(...write.targets);
        if (write.undecidable === true) noteUnknown(write.detail ?? name);
      }
      continue;
    }

    if (PACKAGE_RUNNERS.has(name) || ['npm', 'pnpm', 'yarn'].includes(name)) {
      const runner = classifyPackageRunner(name, args);
      if (runner.kind === 'unknown') noteUnknown(runner.detail ?? name);
      continue;
    }

    if (SCRIPT_INTERPRETER_TOOLS.has(name) || /^python[0-9.]*$/.test(name)) {
      const interpreter = classifyScriptInterpreter(name, args);
      if (interpreter.kind === 'unknown') noteUnknown(interpreter.detail ?? name);
      continue;
    }

    // `.NET` 静态调用：**写方法已在 `matchDotNetStaticWrite` 里正面硬拒**；
    // 走到这里的只剩非可写类型 / 只读方法（`[Math]::Floor`、`[IO.Path]::Combine`、
    // `[IO.File]::ReadAllText`）→ 只读，不制造第 4 类噪音。
    if (/^\[[^\]]*\]\s*::/.test(tokens[cursor])) continue;

    if (READONLY_PROGRAMS.has(name)) continue;

    if (BUILD_TOOL_PROGRAMS.has(name)) {
      const build = classifyBuildTool(name, args);
      if (build.kind === 'unknown') noteUnknown(build.detail ?? name);
      continue;
    }

    // 未识别命令：**默认 fail-closed**（第 4 类），不再当作「没有写」静默放行。
    noteUnknown(`未识别的命令 ${name}`);
  }
  return { targets, undecidable, detail };
}

/**
 * 分类一条 shell 命令（四类判定；不读 flow，不判定相位）。
 *
 * op-002b 精化：
 * - `-EncodedCommand` / `iex` / `Invoke-Expression` / `eval` / `cmd /c` → 第 1 类硬拒（内容不可见）；
 * - `node -e` / `python -c` / `perl -e` / `ruby -e` / `php -r` → **先扫 payload**：
 *   含写 API 才拒，纯只读诊断（`node -e "console.log(…)"`）放行且不审计（`readonly-interpreter`）；
 * - `bash|sh -c` / `powershell|pwsh -Command` → **递归解析内层命令**（同一判定器），
 *   内层可判定按内层判；内层为空/不可判定 → 第 4 类（`undecidable`）。
 *
 * @param {{ command: string, baseDir: string, shell: 'bash'|'pwsh', depth?: number }} input
 * @returns {{ kind: 'indirect'|'openfeel-write'|'whole-tree'|'targets'|'undecidable'|'none'|'readonly-interpreter', detail: string, targets: string[], undecidable: boolean, phases?: string[], gitSubcommand?: string, repoOverride?: boolean, gitConfig?: boolean }}
 */
export function classifyShellCommand({ command, baseDir, shell, depth = 0 }) {
  const statements = splitShellStatements(command);
  // 同一命令内的字面量赋值（变量间接：只有「一次字面量赋值得到完整路径」才算第 2 类）
  const vars = collectLiteralAssignments(statements);

  const targets = [];
  let undecidable = false;
  let detail = '';
  let readonlyInterpreter = false;

  /** 记录一个目标（字面量 → 绝对路径；变量/派生 → 第 4 类）。 */
  const pushTarget = (raw) => {
    const resolved = resolveShellToken(raw, vars);
    if (!resolved.ok) {
      // ADS 形态（`.openfeel/flow.json::$DATA`）：`$` 是流名，不是变量插值。
      // 截断到第一个非盘符 `:` 后路径是确定的 → 按第 2 类判（不再告警放行）。
      const prefix = adsPathPrefix(resolved.value);
      const retry = prefix === null ? null : resolveShellToken(prefix, vars);
      if (retry !== null && retry.ok) {
        targets.push(normalizeTarget(baseDir, retry.value));
        return;
      }
      undecidable = true;
      detail = detail || raw;
      return;
    }
    targets.push(normalizeTarget(baseDir, resolved.value));
  };

  for (const statement of statements) {
    // 第 1 类：内容不可见的形态 → 硬拒
    const hard = matchHardIndirect(statement);
    if (hard !== null) return { kind: 'indirect', detail: hard, targets: [], undecidable: false };

    // 第 1 类：shell 跑 openfeel 写子命令
    const openfeel = matchOpenFeelWrite(statement);
    if (openfeel !== null) return { kind: 'openfeel-write', detail: openfeel, targets: [], undecidable: false };

    // 解释器内联：先扫 payload 写 API（只读诊断放行）
    const inline = matchInlineInterpreter(statement);
    if (inline !== null) {
      const writeApi = findWriteApi(inline.payload);
      if (writeApi !== null) {
        return { kind: 'indirect', detail: `${inline.tag} 含写操作 ${writeApi}`, targets: [], undecidable: false };
      }
      // payload 只读，但**重定向**仍是写入形态（`node -e "console.log(1)" > src/x.ts`）
      for (const raw of scanShellRedirections(statement).targets) pushTarget(raw);
      readonlyInterpreter = true;
      continue;
    }

    // `-c` / `-Command` 包装器：递归解析内层命令
    if (depth < WRAPPER_MAX_DEPTH) {
      const wrapper = extractWrapperPayload(statement);
      if (wrapper !== null) {
        // 外层重定向同样算写入（`bash -c 'git status' > src/x.ts`）
        for (const raw of scanShellRedirections(statement).targets) pushTarget(raw);
        if (wrapper.payload === '' || payloadIsUnresolvable(wrapper.payload)) {
          undecidable = true;
          detail = detail || '`-c` / `-Command` 的内层命令为空或来自变量';
          continue;
        }
        const nested = classifyShellCommand({
          command: wrapper.payload,
          baseDir,
          shell: wrapper.shell,
          depth: depth + 1,
        });
        if (nested.kind === 'indirect' || nested.kind === 'openfeel-write' || nested.kind === 'whole-tree') return nested;
        targets.push(...nested.targets);
        if (nested.undecidable) {
          undecidable = true;
          detail = detail || nested.detail || '内层命令目标不可判定';
        }
        continue;
      }
    }

    // 命令替换 / 反引号的内层命令在 `analyzeShellStatement` 里**叠加**判定为第 4 类
    // （不和 git 整树写等更强结论二选一）。
    const analysis = analyzeShellStatement(statement, shell, baseDir, vars);
    // v1.5.12 / stage-127 op-004（P1-1/P1-3）：git 危险配置（`-c alias.*` /
    // `core.fsmonitor` / `core.hooksPath`）内容不可见 → 第 1 类硬拒。
    if (analysis.blockedGit !== undefined) {
      return { kind: 'indirect', detail: analysis.blockedGit, targets: [], undecidable: false };
    }
    if (analysis.wholeTree !== undefined) {
      return {
        kind: 'whole-tree',
        detail: analysis.wholeTree,
        phases: analysis.wholeTreePhases,
        preservesWorktree: analysis.wholeTreePreservesWorktree === true,
        destroysUntracked: analysis.wholeTreeDestroysUntracked === true,
        purgesIgnored: analysis.wholeTreePurgesIgnored === true,
        // v1.5.12 / stage-127 C.1：与 `analyzeShellStatement` 的 whole-tree 返回
        // **必须同时改**（字段白名单重建会丢字段 → 放行条件恒不成立）。
        gitSubcommand: analysis.wholeTreeGitSubcommand,
        repoOverride: analysis.wholeTreeRepoOverride === true,
        gitConfig: analysis.wholeTreeGitConfig === true,
        targets: [],
        // v1.5.12 / stage-127 C.1（v4-P0①）：这里**原先写死 false**，让
        // 「undecidable !== true」在 whole-tree 分支成为死条件 ——
        // 实测 `git commit -m "$(rm -rf src)"` 得到 undecidable:false。
        // 必须保留 analyzeShellStatement 算出的 `$(` / 反引号 / wrapper 不可判结论。
        // **不得改回 false**（测试钉死：classifyShellCommand('git commit -m "$(x)").undecidable === true）。
        undecidable: analysis.undecidable === true,
      };
    }
    for (const raw of analysis.targets) pushTarget(raw);
    if (analysis.undecidable) {
      undecidable = true;
      detail = detail || analysis.detail;
    }
  }

  if (targets.length === 0) {
    // 只有只读解释器调用 → 放行且不审计（日常诊断噪音为零）
    if (readonlyInterpreter && !undecidable) {
      return { kind: 'readonly-interpreter', detail, targets, undecidable };
    }
    // 第 4 类（op-005 / P0-1）：**没有正面证据**证明「这条命令不写」→ undecidable，
    // 不再返回 `none` 静默放行。审计的 `kind` 因此能区分 no-write 与 undecidable。
    if (undecidable) return { kind: 'undecidable', detail: detail || '命令写入意图无法判定', targets, undecidable };
    return { kind: 'none', detail, targets, undecidable };
  }
  return { kind: 'targets', targets, undecidable, detail };
}

/**
 * Win32 备用数据流（ADS）形态的路径前缀（op-005 / P0-2 配套）。
 *
 * `flow.json::$DATA` / `flow.json:stream` 里的 `$` 是**流名**而不是变量插值，
 * 但 `resolveShellToken` 看到 `$` 就判不可判定 → 会落到第 4 类告警放行。
 * 截断到第一个「非盘符」`:` 之后，路径部分是确定的字面量，可按第 2 类判。
 *
 * @param {string} raw
 * @returns {string | null}
 */
function adsPathPrefix(raw) {
  const text = String(raw);
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== ':') continue;
    // 盘符（`C:\…`）不算 ADS 分隔符。
    if (index === 1 && /[A-Za-z]/.test(text[0]) && /[\\/]/.test(text[2] ?? '')) continue;
    const prefix = text.slice(0, index);
    if (prefix === '' || /[$`]/.test(prefix)) return null;
    return prefix;
  }
  return null;
}

/**
 * 从 shell 工具参数提取命令与工作目录。
 *
 * 真机 `bash` / `pwsh` 的参数是 `command` + `workdir`；`script` / `cmd` 兼容其它宿主。
 * 相对路径的基准是 **`workdir ?? guard cwd`**（`baseDir = resolve(guardCwd, workdir ?? '.')`），
 * 否则在子目录里跑 shell 会把目标解析到错误的项目根（误放/误拒）。
 * @param {unknown} args
 * @returns {{ command: string | undefined, workdir: string | undefined }}
 */
export function extractShellCommand(args) {
  if (typeof args !== 'object' || args === null) return { command: undefined, workdir: undefined };
  const record = /** @type {Record<string, unknown>} */ (args);
  let command;
  for (const key of ['command', 'script', 'cmd']) {
    const value = record[key];
    if (typeof value === 'string' && value.trim() !== '') { command = value; break; }
  }
  const rawWorkdir = record.workdir;
  const workdir = typeof rawWorkdir === 'string' && rawWorkdir.trim() !== '' ? rawWorkdir.trim() : undefined;
  return { command, workdir };
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
 * 活跃阶段相位摘要（审计/拒绝文案用）：`v1-stage=plan_review, v2-stage=exec_running`。
 * @param {Array<{ id?: string, phase?: string }>} active
 * @returns {string}
 */
function formatActivePhases(active) {
  return active
    .map((stage) => `${stage.id ?? '(unknown)'}=${stage.phase ?? '(unknown)'}`)
    .join(', ');
}

/**
 * 统一的目标判定（v1.5.11 D-126-02；plan §3.1⑤ 的纯重构）。
 *
 * 文件工具分支（`write`/`edit`/`str_replace_editor`/`apply_patch`）与 shell 分支
 * 共用**这一份**判定，保证「经 shell 绕道」与「直接写文件」得到完全相同的结论：
 * 受保护路径 → 未初始化/bootstrap → 内部路径早返回 → 研究闸 → 无阶段/chore/
 * doc-asset → 相位判定，逐行语义与重构前一致（零复制、零漂移）。
 *
 * 判定顺序里「受保护路径」必须在 `allInternal` 早返回与相位判定之前 —— 否则
 * `.openfeel/**` 任意相位可写会让 agent 手写 `chore.json` / `.preflight.json` 自提权。
 *
 * @param {{ t: (zh: string, en: string) => string, enforce: 'off'|'project'|'always', allowGeneral: boolean, bootstrapHinted: Set<string> }} context
 * @param {{ name: string, targets: string[], patchEntries?: Array<{ path: string, kind: string }> | null, resolvedCwd: string, normalizedCwd: string, cwdSource: string, audit?: boolean }} request
 * @returns {{ decision: 'allow'|'deny', reason: string, message?: string }}
 */
function decideForTargets(context, request) {
  const { t, enforce, allowGeneral, bootstrapHinted } = context;
  const { name, targets, resolvedCwd, normalizedCwd, cwdSource } = request;
  const patchEntries = request.patchEntries ?? null;
  const recordAudit = (event) => {
    if (request.audit === false) return;
    recordGuardAudit(normalizedCwd, {
      tool: name,
      cwdSource,
      paths: targets,
      ...event,
    });
  };

  // 受保护路径（D-126-05）：guard 启用时始终拒绝（enforce=off 已提前返回）。
  // 位置要求见函数注释；这里是唯一入口，文件工具与 shell 都经过它。
  const protectedHits = targets
    .map((target) => matchProtectedPath(target, normalizedCwd))
    .filter((hit) => hit !== null);
  if (protectedHits.length > 0) {
    return { decision: 'deny', reason: 'protected', message: protectedDenialMessage(protectedHits, t) };
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
        return { decision: 'allow', reason: 'bootstrap' };
      }
      return {
        decision: 'deny',
        reason: 'not-initialized',
        message: t(
          'OpenFeel 写入门禁：当前工作区尚未初始化 OpenFeel（无 `.openfeel/`）。请先运行 `openfeel init` 并建立需求/阶段；或让用户把 profile 的 `enforce` 改为 `project` / `off`。',
          'OpenFeel write guard: this workspace is not OpenFeel-initialized (no `.openfeel/`). Run `openfeel init` and create a requirement/stage first; or ask the user to set `enforce` to `project` / `off`.',
        ),
      };
    }
    return { decision: 'allow', reason: 'not-initialized' };
  }

  const allInternal = targets.every((target) => isUnderOpenFeel(target, normalizedCwd));
  if (allInternal) return { decision: 'allow', reason: 'internal' };

  const flow = readFlow(resolvedCwd);
  if (!flow.ok) {
    return {
      decision: 'deny',
      reason: 'flow-unreadable',
      message: t(
        `OpenFeel 写入门禁：无法读取 .openfeel/flow.json（${flow.reason}）。请运行 feel_verify action=health。`,
        `OpenFeel write guard: cannot read .openfeel/flow.json (${flow.reason}). Run feel_verify action=health.`,
      ),
    };
  }

  const active = activeStages(flow.value);
  // v1.5.2 入口闸：研究/方案产物（docs/research/**）是阶段交付物，无活跃阶段时不得写入；
  // chore 也不能绕过（在下方 chore 放行之前判定）。
  if (active.length === 0 && targets.some((target) => isResearchArtifactPath(target, normalizedCwd))) {
    recordAudit({ event: 'guard_deny', reason: 'research-needs-stage', phase: 'done' });
    return {
      decision: 'deny',
      reason: 'research-needs-stage',
      message: t(
        'OpenFeel 写入门禁：研究/方案产物（docs/research/**）要求有开启的阶段。请先按当前小版本开一个阶段（保持 exec_running），再 feel_req add → claim 建需求并写调研/方案。纯只读问答无需落盘。',
        'OpenFeel write guard: research/proposal artifacts (docs/research/**) require an open stage. Open a stage for the current minor version (keep it in exec_running), then feel_req add → claim before writing. Pure read-only Q&A needs no file.',
      ),
    };
  }
  if (active.length === 0) {
    if (allowGeneral && hasGeneralRequirement(flow.value)) return { decision: 'allow', reason: 'general' };
    // v1.4.0 chore 通道：仅在**无活跃阶段**时生效；受保护路径已在上方拒绝。
    // v1.5.11 / D-126-03 收窄：chore 窗口**默认不放行源码**（doc/asset 本来就不需要
    // chore）。只有人类以 `openfeel chore --source "<说明>"` 开启、且 chore.json 写了
    // `source_allowed: true` 时才放行源码；旧记录缺该字段一律视为未授权。
    const activeChore = readActiveChore(normalizedCwd);
    if (activeChore !== null) {
      const sourceAllowed = activeChore.source_allowed === true;
      if (sourceAllowed || targets.every((target) => isExemptPath(target, normalizedCwd))) {
        recordAudit({ reason: 'chore', phase: 'done' });
        return { decision: 'allow', reason: 'chore' };
      }
      recordAudit({ event: 'guard_deny', reason: 'chore-source', phase: 'done' });
      return {
        decision: 'deny',
        reason: 'chore-source',
        message: t(
          'OpenFeel 写入门禁：当前 chore 窗口未授予源码写入（默认只放行 doc/静态资源）。需要改源码时，请由人类在外部终端执行 `openfeel chore --source "<说明>"` 开启窗口；或按当前小版本开一个阶段并保持 exec_running。',
          'OpenFeel write guard: this chore window does not allow source writes (the default window covers docs/static assets only). To change source, ask the human to run `openfeel chore --source "<note>"` from an external terminal, or open a stage for the current minor version and keep it in exec_running.',
        ),
      };
    }
    // P0-4/v1.4.0：doc/note 与静态展示资源不要求活跃阶段（收口后仍可写）；混合目标从严。
    if (targets.every((target) => isExemptPath(target, normalizedCwd))) {
      recordAudit({ reason: 'doc-asset', phase: 'done' });
      return { decision: 'allow', reason: 'doc-asset' };
    }
    return {
      decision: 'deny',
      reason: 'no-stage',
      message: t(
        'OpenFeel 写入门禁：无活跃阶段，不能修改源码/文档（当前没有开启的阶段）。默认按当前小版本开一个阶段并保持 exec_running（feel_stage add stage=<vX.Y.Z-stage-N>），再在该版本下建需求推进；需求完成不要求关闭阶段。只改 doc/静态资源的微变更可由人类在外部终端 `openfeel chore "<说明>"` 开启；改源码必须由人类用 `openfeel chore --source "<说明>"`。',
        'OpenFeel write guard: no active stage (no open stage), so source/docs are read-only. Open a stage for the current minor version and keep it in exec_running (feel_stage add stage=<vX.Y.Z-stage-N>), then add requirements under that version; requirement completion does not require closing the stage. For docs/static-asset-only micro-changes the human can run `openfeel chore "<note>"` from an external terminal; source changes require `openfeel chore --source "<note>"`.',
      ),
    };
  }

  if (active.some((stage) => stage.phase === 'exec_running')) return { decision: 'allow', reason: 'exec-running' };
  // P0-4/v1.4.0：非 exec 相位仍允许 doc/note 与静态展示资源（研究记录、设计文档、UI 资源等）；源码仍严格。
  if (targets.every((target) => isExemptPath(target, normalizedCwd))) {
    recordAudit({ reason: 'doc-asset', phase: formatActivePhases(active) });
    return { decision: 'allow', reason: 'doc-asset' };
  }

  return {
    decision: 'deny',
    reason: 'phase',
    message: t(
      `OpenFeel 写入门禁：活跃阶段当前不在 exec_running（${formatActivePhases(active)}），不能修改源码/文档。请先 feel_flow action=advance 推进到 exec_running。`,
      `OpenFeel write guard: active stage(s) are not in exec_running (${formatActivePhases(active)}), so source/docs are read-only. Advance to exec_running with feel_flow action=advance.`,
    ),
  };
}

/**
 * 整树写（git `reset --hard` / `stash pop` / `clean` / `commit` …）是否被允许：
 * **必须**存在 `exec_running` 阶段（与文件工具的源码写门槛一致）。
 * 未初始化工作区沿用 `enforce` 语义（`always` 下 fail-closed）。
 * @param {string} resolvedCwd
 * @param {'off'|'project'|'always'} enforce
 * @param {string[]} [phases] 放行的相位（缺省 `['exec_running']`；`git commit` 额外允许
 *   `review_passed` / `test_passed` / `archiving`）
 * @returns {boolean}
 */
function allowsWholeTreeWrite(resolvedCwd, enforce, phases = ['exec_running']) {
  if (!isProjectWorkspace(resolvedCwd)) return enforce !== 'always';
  const flow = readFlow(resolvedCwd);
  if (!flow.ok) return false;
  const allowed = new Set(phases);
  return activeStages(flow.value).some((stage) => allowed.has(stage.phase));
}

/**
 * `.openfeel/**` 是否有未提交差异（op-005 / P1-2；op-006 / P1-1 补未跟踪）。
 *
 * 整树 git 写（`checkout -- .` / `reset --hard` / `stash pop` / `clean -fdx`）
 * 会把 `.openfeel/flow.json`、`chore.json`、`guard-audit.jsonl` 一起覆盖，
 * 「受保护路径任意相位硬拒」就形同虚设。执行整树写前要求该目录干净。
 *
 * **未跟踪文件**（op-006）：`git diff` 系列看不到它们，而 `checkpoints/`、
 * 新 plan 目录、`chore.json` 恰恰常常是未跟踪的 —— `git clean -fdx` 会直接删掉。
 * 所以对**会删未跟踪文件**的整树写（`git clean`、`stash -u`）追加
 * `git ls-files --others --exclude-standard -- .openfeel`：非空即 dirty。
 * 带了 `-x`/`-X`（连 ignored 一起删）时还要看**证据文件是否存在**：
 * `log/guard-audit.jsonl` 与 `chore.json` 本身被 .gitignore 忽略，
 * `git ls-files --exclude-standard` 看不见它们，但 `clean -fdx` 会删掉。
 * `checkout`/`reset` **不动**未跟踪文件，不套这两条（否则会把正常工作流误拒）。
 *
 * 返回 `true` = 有差异（拒绝）；`false` = 干净；`null` = 无法判定
 * （不是 git 仓库 / 无 HEAD / git 不可用 → 按「无证据」放行，保持旧行为）。
 *
 * @param {string} resolvedCwd
 * @param {{ includeUntracked?: boolean, includeIgnoredEvidence?: boolean }} [options]
 * @returns {boolean | null}
 */
function openfeelTreeDirty(resolvedCwd, options = {}) {
  const run = (args, capture = false) => {
    try {
      const stdout = execFileSync('git', args, {
        cwd: resolvedCwd,
        stdio: capture ? ['ignore', 'pipe', 'ignore'] : 'ignore',
        encoding: 'utf8',
        timeout: 5000,
        windowsHide: true,
      });
      return { status: 0, stdout: typeof stdout === 'string' ? stdout : '' };
    } catch (error) {
      const status = error !== null && typeof error === 'object' && Number.isInteger(error.status)
        ? error.status
        : null;
      return { status, stdout: '' };
    }
  };
  // 先确认「是 git 仓库且有 HEAD」：非仓库目录里 `git diff` 会退化成
  // `--no-index` 模式并以 1 退出（会被误读成「有差异」）。
  if (run(['rev-parse', '--git-dir']).status !== 0) return null;
  if (run(['rev-parse', '--verify', '--quiet', 'HEAD']).status !== 0) return null;
  const head = run(['diff', '--quiet', 'HEAD', '--', OPENFEEL_DIR]).status;
  if (head === 1) return true;
  if (head !== 0) return null;
  const cached = run(['diff', '--cached', '--quiet', '--', OPENFEEL_DIR]).status;
  if (cached === 1) return true;
  if (cached !== 0) return null;
  if (options.includeUntracked === true) {
    // 未跟踪且**未被 .gitignore 忽略**的 `.openfeel/**`（checkpoints / 新 plan /
    // 手写 chore.json 等）会被 `git clean` 删掉 → 同样算 dirty。
    const others = run(['ls-files', '--others', '--exclude-standard', '--', OPENFEEL_DIR], true);
    if (others.status !== 0) return null;
    if (others.stdout.trim() !== '') return true;
  }
  if (options.includeIgnoredEvidence === true) {
    // `clean -x` 连 ignored 一起删：审计证据与 chore 窗口是「被忽略但绝不能删」的
    // 两类文件，直接看存在性（`git ls-files` 默认看不见它们）。
    for (const relative of [join('log', 'guard-audit.jsonl'), 'chore.json']) {
      if (existsSync(join(resolvedCwd, OPENFEEL_DIR, relative))) return true;
    }
  }
  return false;
}

/**
 * 「单条纯书账 commit」的**命令文本**硬条件（v1.5.12 / stage-127 C.2）。
 *
 * **必须对原始 command 判定，不得先 `maskQuoted`**：
 * - 单语句（`;` / `&&` / `||` / 换行都被 `splitShellStatements` 切开）；
 * - 无重定向（`git commit -m x > src/x.ts` 会真写源码）；
 * - 原始字符串不含 `$(` 与反引号 —— 双引号内的 `$()` 在 bash 里是**真替换、会真执行**，
 *   不能因为它在引号里就放过。**已知代价**：单引号内的 `$(` / 反引号也会被误拒
 *   （`git commit -m 'fix $(x)'`）—— 接受，改用双引号或去掉即可；绝不为了少误拒
 *   而漏检真执行形态。
 * - 裸 `;` / `|` / `&`：在**掩码后**的文本上判（引号内的 `"a; b"` 不拆语句，属正向边界）。
 * - v1.5.12 / stage-127 op-004（P0）：**进程替换** `<(...)` / `>(...)` 会真执行内层命令
 *   （`git commit -m x < <(rm -rf src)` 七条件全过且真建了文件）；输入重定向 `< file`
 *   同样不是纯书账需要的东西，只放行 `< /dev/null`。两者都按掩码文本判（引号内是字面量）。
 * @param {string} command
 * @returns {boolean}
 */
function isSingleSimpleCommit(command) {
  const text = String(command);
  if (splitShellStatements(text).length !== 1) return false;
  if (scanShellRedirections(text).targets.length !== 0) return false;
  if (/\$\(/.test(text)) return false;
  if (text.includes('`')) return false;
  const masked = maskQuoted(text);
  if (/[;|&]/.test(masked)) return false;
  if (hasUnsafeInputRedirect(masked)) return false;
  return true;
}

/**
 * 掩码文本里是否有「进程替换 / 非 `/dev/null` 输入重定向」（v1.5.12 / stage-127 op-004 P0）。
 *
 * 覆盖：`<(...)` / `>(...)`、`<<` 与 `<<<`（heredoc / herestring）、`< file`、`0<file`、
 * `2< file`。只放行 `</dev/null`（Git Bash 下的空设备）。掩码已把引号内容变成空格，
 * 所以 `git commit -m "a < b"` 不会被误拒。
 * @param {string} masked
 * @returns {boolean}
 */
function hasUnsafeInputRedirect(masked) {
  for (let index = 0; index < masked.length; index += 1) {
    if (masked[index] !== '<') continue;
    const next = masked[index + 1];
    if (next === '(' || next === '<') return true; // 进程替换 / heredoc-herestring
    let cursor = index + 1;
    while (cursor < masked.length && /\s/.test(masked[cursor])) cursor += 1;
    let target = '';
    while (cursor < masked.length && !/[\s;&|<>]/.test(masked[cursor])) {
      target += masked[cursor];
      cursor += 1;
    }
    if (target === '') return true; // `<&3` / 悬空重定向
    if (target.toLowerCase() !== '/dev/null') return true;
    index = cursor - 1;
  }
  return false;
}

/**
 * 是否为**直接** git 调用（v1.5.12 / stage-127 C.2 / v4-P0③）。
 *
 * 以 `git` 开头（`/^git(\s|$)/`）且没有 `bash -c` / `pwsh -Command` 之类外层 wrapper。
 * **凡来自 nested wrapper 的分类结果一律不放行**：内层语句分隔 / 替换藏在 wrapper
 * 字符串里，无法用同一条 `isSingleSimpleCommit` 判定。
 * @param {string} command
 * @returns {boolean}
 */
function isDirectGitInvocation(command) {
  const text = String(command).trim();
  if (!/^git(\s|$)/.test(text)) return false;
  return extractWrapperPayload(text) === null;
}

/**
 * 「纯书账」待提交路径集（v1.5.12 / stage-127 C.3）。
 *
 * 用 `git status --porcelain=v1 -z --untracked-files=all` 而不是 `git diff HEAD`：
 * - porcelain 的 `X` 位能看见 **staged-only**（`git add src/x.ts` 后
 *   `git restore -W -s HEAD src/x.ts` 可让 worktree 干净、`diff HEAD` 看不到）；
 * - `??` 覆盖未跟踪；`X`/`Y` 两个位置全覆盖。
 * `-z` 关闭引号 + `core.quotePath=false` 双保险。
 *
 * v1.5.12 / stage-127 op-004（P1-2 / P2-1）：
 * - `R`/`C` 条目的**新旧路径都参与** offender 判定。只取新路径时
 *   `git mv src/a.ts .openfeel/a.ts` 会被判纯书账放行，而 HEAD 里 `src/a.ts` 被删。
 * - 判定必须对**实际生效仓库**做：`workdir` 可能指向被外层 `.gitignore` 忽略的嵌套
 *   仓库（外层判干净、实际提交进 nested）。生效仓库根 ≠ 项目工作区 → 拒绝。
 *
 * @param {string} resolvedCwd 会话工作区（项目根）
 * @param {string} baseDir shell 的相对路径基准（`resolvedCwd + workdir`）
 * @returns {{ ok: true, offenders: string[] } | { ok: false, offenders: string[], repoMismatch?: boolean, repoRoot?: string } | null}
 *   `null` = 无法判定（非仓库 / 无 HEAD / status 失败）→ 调用方拒绝。
 */
function inspectCommitBookkeeping(resolvedCwd, baseDir = resolvedCwd) {
  const run = (args, capture = false) => {
    try {
      const stdout = execFileSync('git', args, {
        cwd: resolvedCwd,
        stdio: capture ? ['ignore', 'pipe', 'ignore'] : 'ignore',
        encoding: 'utf8',
        timeout: 5000,
        windowsHide: true,
      });
      return { status: 0, stdout: typeof stdout === 'string' ? stdout : '' };
    } catch (error) {
      const status = error !== null && typeof error === 'object' && Number.isInteger(error.status)
        ? error.status
        : null;
      return { status, stdout: '' };
    }
  };
  /** 某个目录实际生效的仓库根（跟随 workdir / 嵌套仓库）。 */
  const toplevelOf = (dir) => {
    const result = run(['-C', dir, 'rev-parse', '--show-toplevel'], true);
    if (result.status !== 0) return null;
    const text = result.stdout.trim();
    if (text === '') return null;
    return normalizeTarget(dir, text);
  };
  const repoRoot = toplevelOf(baseDir);
  if (repoRoot === null) return null;
  const projectRoot = normalizeTarget(resolvedCwd, '.');
  if (repoRoot !== projectRoot) {
    // workdir 落在另一个仓库（常见：被外层 .gitignore 忽略的嵌套仓库）→ 不书账。
    return { ok: false, offenders: [], repoMismatch: true, repoRoot };
  }
  // 非仓库目录里 `git status` 会失败（不同于 `git diff` 退化成 --no-index）→ null。
  if (run(['rev-parse', '--git-dir']).status !== 0) return null;
  if (run(['rev-parse', '--verify', '--quiet', 'HEAD']).status !== 0) return null;
  const status = run(['-c', 'core.quotePath=false', 'status', '--porcelain=v1', '-z', '--untracked-files=all'], true);
  if (status.status !== 0) return null;

  const entries = status.stdout.split('\0');
  const paths = [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (entry === '') continue;
    // `XY <path>`：`-z` 下没有引号，但格式异常一律按「不可判定」拒绝。
    if (entry.length < 4) return null;
    const xy = entry.slice(0, 2);
    const path = entry.slice(3);
    if (path === '') return null;
    // `R`/`C`：下一项是**原路径**；新旧路径**都算**（旧路径可能正是被搬走的源码）。
    if (xy[0] === 'R' || xy[0] === 'C') {
      const original = entries[index + 1];
      index += 1;
      if (typeof original === 'string' && original !== '') paths.push(original);
    }
    paths.push(path);
  }
  // 空集合 = 交给 git 报 nothing to commit（不是放行写源码的理由）。
  const offenders = paths.filter((path) => path !== OPENFEEL_DIR && !path.startsWith(`${OPENFEEL_DIR}/`));
  return { ok: offenders.length === 0, offenders };
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
 * @param {'strict'|'warn'|'off'} [options.shellGate]
 *   shell 门禁档位。缺省读 `OPENFEEL_SHELL_GATE`（环境变量优先，作逃生阀）；两者都没有 =
 *   默认组合（1/2 类拒、4 类告警）。**只影响 shell 分支**，不影响文件工具。
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
  // shell 门禁档位在**创建时**读一次（换档需要重建 guard / 重启宿主）。
  const shellGate = resolveShellGate(
    typeof process.env.OPENFEEL_SHELL_GATE === 'string' && process.env.OPENFEEL_SHELL_GATE.trim() !== ''
      ? process.env.OPENFEEL_SHELL_GATE
      : options.shellGate,
  );

  const t = (zh, en) => (english ? en : zh);
  /** bootstrap 例外提示去重（按工作区路径）。 */
  const bootstrapHinted = new Set();
  const guardContext = { t, enforce, allowGeneral, bootstrapHinted };

  if (enforce === 'off') {
    // 完全关闭：连 flow.json/status.md 也不拦（D-126-01 的 cwd 链同样不启用）。
    return () => undefined;
  }

  return (execution) => {
    const name = execution?.name;
    if (typeof name !== 'string' || !mutating.has(name)) return undefined;

    const isShell = SHELL_TOOL_SET.has(name);
    // `OPENFEEL_SHELL_GATE=off` **只关 shell 分支**：完全不解析命令；
    // `write` / `edit` / `str_replace_editor` 仍然走完整门禁。
    if (isShell && shellGate.mode === 'off') return undefined;

    // ── cwd 解析链（D-126-01）：env → agent-session → config → registry → process → fail-closed
    const resolution = resolveGuardCwd(execution, { cwd: fallbackCwd });
    const cwdSource = resolution.source;
    const resolvedCwd = resolution.cwd;
    // 与写入目标**同一套**归一化（P0-2）：短名/尾点/ADS 归一后再做前缀比较。
    const normalizedCwd = resolvedCwd === null ? null : normalizeTarget(resolvedCwd, '.');
    const degraded = resolution.degraded;
    const shellCommand = isShell ? extractShellCommand(execution?.arguments).command : undefined;

    /** 判定结论落盘（D-126-04）：每次放行/拒绝/告警都更新 lastDecision。 */
    const recordDecision = (decision, { reason, paths = [], command = shellCommand }) => {
      const at = new Date().toISOString();
      const lastDecision = {
        at,
        tool: name,
        decision,
        reason,
        paths,
        cwd: resolvedCwd,
        cwdSource,
        ...(truncateCommand(command) !== undefined ? { command: truncateCommand(command) } : {}),
      };
      writeGuardState(resolvedCwd, {
        registered: true,
        enforce,
        shellGate: shellGate.label,
        cwd: resolvedCwd,
        cwdSource,
        degraded,
        resolvedAt: at,
        pid: process.pid,
        lastDecision,
      }, { at, tool: name, reason, decision, cwdSource });
    };

    // 全链失败 → fail-closed：证据固定落全局目录（绝不用 process.cwd()，绝不静默）
    if (resolvedCwd === null || normalizedCwd === null) {
      const message = t(
        'OpenFeel 写入门禁：无法确定会话工作区（cwd 解析失败），已按 fail-closed 拒绝本次写入。修复（任一）：① profile 的 cordis.patch.yml 给 openfeel-feel 配 cwd: "<项目绝对路径>"；② 设环境变量 OPENFEEL_GUARD_CWD 后重启；③ 重启会话让提示装配登记 cwd。诊断：feel_status 的 guard 段（.openfeel/dev/guard-state.json）。',
        'OpenFeel write guard: cannot resolve the session workspace (cwd resolution failed); refusing this write (fail-closed). Fix one of: (1) set cwd: "<absolute project path>" for openfeel-feel in cordis.patch.yml; (2) set OPENFEEL_GUARD_CWD and restart; (3) restart the session so the prompt assembly records the cwd. Diagnose: the guard section of feel_status.',
      );
      writeGuardState(null, {
        registered: true,
        enforce,
        shellGate: shellGate.label,
        cwd: null,
        cwdSource: 'unresolved',
        degraded: true,
        hostCwd: process.cwd(),
        resolvedAt: new Date().toISOString(),
        pid: process.pid,
        lastDecision: {
          at: new Date().toISOString(),
          tool: name,
          decision: 'deny',
          reason: 'cwd-unresolved',
          paths: [],
          cwd: null,
          cwdSource: 'unresolved',
          ...(truncateCommand(shellCommand) !== undefined ? { command: truncateCommand(shellCommand) } : {}),
        },
      }, { at: new Date().toISOString(), tool: name, reason: 'cwd-unresolved', decision: 'deny', cwdSource: 'unresolved' });
      recordGuardAudit(null, {
        event: 'guard_deny',
        decision: 'deny',
        tool: name,
        reason: 'cwd-unresolved',
        phase: '',
        paths: [],
        cwdSource: 'unresolved',
        command: shellCommand,
      });
      return message;
    }

    warnDegradedSource(resolution);

    /* ── shell 分支（v1.5.11 D-126-02） ────────────────────────────────── */

    if (isShell) {
      const { command, workdir } = extractShellCommand(execution?.arguments);
      if (command === undefined) {
        recordDecision('deny', { reason: 'shell-no-command' });
        return t(
          'OpenFeel 写入门禁：shell 工具缺少 `command` 文本，无法判断是否会写文件；请提供 command（不要用其它字段绕过门禁）。',
          'OpenFeel write guard: the shell tool has no `command` text, so the write intent cannot be judged. Provide command; do not use other fields to bypass the gate.',
        );
      }
      // 相对路径基准：`baseDir = resolve(guardCwd, workdir ?? '.')`（验收 17）；
      // 与目标同样走 normalizeTarget（否则两侧口径不同会让前缀比较失效）。
      const baseDir = normalizeTarget(resolvedCwd, workdir ?? '.');

      const phaseSummary = () => {
        const flow = readFlow(resolvedCwd);
        if (!flow.ok) return '';
        const active = activeStages(flow.value);
        return active.length === 0 ? 'done' : formatActivePhases(active);
      };
      // 先分类：审计的 `kind` 要能区分 `no-write`（确认只读）与 `undecidable`
      // （无法判定，op-005 / P0-1）。
      const classification = classifyShellCommand({ command, baseDir, shell: name });
      const recordShellAudit = (event) => recordGuardAudit(normalizedCwd, {
        tool: name,
        cwdSource,
        command,
        phase: phaseSummary(),
        kind: classification.kind,
        ...event,
      });
      const warnLine = (zh, en) => process.stderr.write(`${t(zh, en)}\n`);
      const allowShell = (reason, paths) => {
        recordShellAudit({ event: 'guard_allow', decision: 'allow', reason, paths });
        recordDecision('allow', { reason, paths });
        return undefined;
      };
      /** 第 1/2 类统一出口：默认拒；`OPENFEEL_SHELL_GATE=warn` 时降级为告警放行。 */
      const denyDecidable = (reason, message, paths) => {
        if (shellGate.decidable === 'deny') {
          recordShellAudit({ event: 'guard_deny', decision: 'deny', reason, paths });
          recordDecision('deny', { reason, paths });
          return message;
        }
        recordShellAudit({ event: 'guard_shell_downgraded', decision: 'warn', reason, paths });
        recordDecision('warn', { reason, paths });
        warnLine(
          `[guard] OpenFeel 写入门禁：OPENFEEL_SHELL_GATE=warn，shell 判定「${reason}」已降级为告警放行。`,
          `[guard] OpenFeel write guard: OPENFEEL_SHELL_GATE=warn; shell decision "${reason}" was downgraded to a warning.`,
        );
        return undefined;
      };
      /** 第 4 类：默认告警放行 + 审计 + stderr 一行；`strict` 下拒绝。 */
      const undecidableShell = (detail, paths) => {
        const reason = 'shell-undecidable';
        if (shellGate.undecidable === 'deny') {
          recordShellAudit({ event: 'guard_deny', decision: 'deny', reason, paths });
          recordDecision('deny', { reason, paths });
          return t(
            `OpenFeel 写入门禁：无法静态判定 shell 命令的写入目标（${detail}）。OPENFEEL_SHELL_GATE=strict 下第 4 类也拒绝 —— 请改用 write/edit，或把目标写成字面量路径。`,
            `OpenFeel write guard: cannot statically resolve the write target of this shell command (${detail}). Under OPENFEEL_SHELL_GATE=strict class 4 is denied too: use write/edit, or spell the target as a literal path.`,
          );
        }
        recordShellAudit({ event: 'guard_shell_unresolved', decision: 'warn', reason, paths });
        recordDecision('warn', { reason, paths });
        warnLine(
          `[guard] OpenFeel 写入门禁：无法静态判定 shell 命令的写入目标（${detail}），已按默认策略告警放行（第 4 类只防误写、不防蓄意）。`,
          `[guard] OpenFeel write guard: cannot statically resolve the shell write target (${detail}); allowed with a warning (class 4 guards mistakes, not intent).`,
        );
        return undefined;
      };

      // 第 1 类：编码/间接执行形态（含「内联解释器 payload 里有写 API」）
      if (classification.kind === 'indirect') {
        return denyDecidable('shell-indirect-exec', t(
          `OpenFeel 写入门禁：禁止用 shell 嵌套解释器或编码执行（${classification.detail}）。这类形态无法静态判定写入目标，一律拒绝 —— 请直接把命令写在 shell 工具里；若只是只读诊断（如 node -e "console.log(...)"），去掉写操作即放行。`,
          `OpenFeel write guard: nested interpreters / encoded execution (${classification.detail}) are not allowed from the shell — their write target cannot be judged. Put the command directly in the shell tool; a read-only one-liner (e.g. node -e "console.log(...)") is allowed once the write call is removed.`,
        ), []);
      }
      // 第 1 类：shell 跑 openfeel 写子命令
      if (classification.kind === 'openfeel-write') {
        return denyDecidable('shell-openfeel-write', t(
          `OpenFeel 写入门禁：禁止用 shell 跑 openfeel 写命令（${classification.detail}）。请改用 feel_flow / feel_stage / feel_req 等工具；chore 写窗口是纯人类通道，只能由用户在外部终端执行 \`openfeel chore "<说明>"\` 开启。`,
          `OpenFeel write guard: running openfeel write commands via the shell is not allowed (${classification.detail}). Use feel_flow / feel_stage / feel_req instead; the chore write window is human-only and must be opened by the user in an external terminal with \`openfeel chore "<note>"\`.`,
        ), []);
      }
      // 第 2 类：git 整树工作区写（需要相位 + `.openfeel/**` 无差异，见 P1-2 / P1-4）
      if (classification.kind === 'whole-tree') {
        if (!allowsWholeTreeWrite(resolvedCwd, enforce, classification.phases)) {
          // v1.5.12 / stage-127 §3-C（C.5/C.6）+ op-004 复审修正：无 `exec_running` /
          // `review_passed` / `test_passed` / `archiving` 阶段时，只给「单条、直接、纯
          // `.openfeel/**` 书账」的 `git commit` 开一道窄口。**条件缺一不可**（漏一条即变后门，见 plan R8）：
          // ① 无上述四相位阶段 —— 上面 `allowsWholeTreeWrite` 已保证（v1.5.13 / stage-128
          //    把 `review_passed` / `test_passed` 并入白名单后，二者不再走这道窄口，窄口只剩
          //    `plan_*` / `scheme_*` / `review_pending` / `review_failed` / `test_pending` /
          //    `test_failed` / `done` 七类）；
          // ② 是项目工作区且 flow.json 可读（fail-closed：非项目 / flow 读不出
          //    不等于「无阶段」，不能一律当书账）；
          // ③ 单条简单 commit（对**原始命令**判：无多语句/重定向/`$(`/反引号/进程替换）；
          // ④ 直接 git 调用（无 `bash -c` / `pwsh -Command` 等 wrapper payload）；
          // ⑤ 分类结果可判定（`undecidable !== true`，C.1 修好后才是真条件）；
          // ⑥ 待提交路径（含 R/C 旧路径）全部落在 `.openfeel/` 下，且实际生效仓库
          //    就是项目工作区自身（workdir 嵌套仓库不放行）；
          // ⑦ 无 `-C` / `--git-dir` / `--work-tree` / `GIT_DIR` 等仓库改写；
          // ⑧ 无 `-c` / `--config-env`（hooks / fsmonitor / alias 是外部执行面）。
          const flow = readFlow(resolvedCwd);
          const canBeBookkeeping = classification.gitSubcommand === 'commit'
            && classification.repoOverride !== true
            && classification.gitConfig !== true
            && classification.undecidable !== true
            && isSingleSimpleCommit(command)
            && isDirectGitInvocation(command)
            && isProjectWorkspace(resolvedCwd) === true
            && flow.ok === true;
          const scope = canBeBookkeeping ? inspectCommitBookkeeping(resolvedCwd, baseDir) : null;
          if (scope !== null && scope.ok === true) return allowShell('git-commit-bookkeeping', []);
          // v1.5.13 / stage-128：文案按子命令分叉，相位串从 `classification.phases`
          // 派生（单一真值，防数组与文案两处漂移）。**必须保留**「git 工作区写」字样
          // （既有断言 `/git 工作区写/`），非 commit 的通用文案逐字保留（stash/clean/
          // reset --hard 仍在文案里提示 advance 到 exec_running，不能谎报四相位可用）。
          const allowedPhaseList = (classification.phases ?? ['exec_running']).join(' / ');
          let denyMessage = classification.gitSubcommand === 'commit'
            ? t(
              `OpenFeel 写入门禁：禁止在当前阶段用 shell 做 git 工作区写（${classification.detail}）—— git commit 只允许活跃阶段处于 ${allowedPhaseList} 之一；plan_* / scheme_* / review_pending / review_failed / test_pending / test_failed / done 一律拒绝（done 表示工作已收口，请走归档提交）。只读查询（git status / log / diff）不受影响。`,
              `OpenFeel write guard: git worktree writes via the shell (${classification.detail}) are blocked in this phase — git commit is only allowed when an active stage is in ${allowedPhaseList}; plan_* / scheme_* / review_pending / review_failed / test_pending / test_failed / done are always refused (done means the work is closed — commit through the archive flow). Read-only git status / log / diff are unaffected.`,
            )
            : t(
              `OpenFeel 写入门禁：禁止在没有 exec_running 阶段时用 shell 做 git 工作区写（${classification.detail}）—— 它会整树覆盖/丢弃源码或把状态直接写进仓库，等同绕过文件门禁。请先 feel_flow action=advance 推进到 exec_running；只读查询（git status / log / diff）不受影响。`,
              `OpenFeel write guard: git worktree writes via the shell (${classification.detail}) are blocked without an exec_running stage — they overwrite/discard sources across the whole tree or write repo state, bypassing the file gate. Advance to exec_running with feel_flow action=advance; read-only git status / log / diff are unaffected.`,
            );
          if (scope !== null && scope.repoMismatch === true) {
            denyMessage += `\n${t(
              `待提交仓库根（${scope.repoRoot}）不是项目工作区（${normalizeTarget(resolvedCwd, '.')}）：workdir 指向了另一个仓库（常见于被外层 .gitignore 忽略的嵌套仓库），纯书账只对项目自身的仓库生效。`,
              `The repository root for this commit (${scope.repoRoot}) is not the project workspace (${normalizeTarget(resolvedCwd, '.')}): the workdir points at another repository (often a nested repo ignored by the outer .gitignore). Bookkeeping commits only apply to the project's own repository.`,
            )}`;
          } else if (scope !== null && scope.ok === false) {
            // 安全阀文案（追加行）：点名前 5 条外部路径。
            const shown = scope.offenders.slice(0, 5).join(', ');
            denyMessage += `\n${t(
              `本次待提交路径含 .openfeel/ 之外的条目：${shown}；该命令仅在提交纯书账时放行。`,
              `Pending paths include entries outside .openfeel/: ${shown}; this command is only allowed for pure bookkeeping commits.`,
            )}`;
          } else if (classification.gitSubcommand === 'commit' && classification.repoOverride === true) {
            denyMessage += `\n${t(
              '该 commit 带 -C / --git-dir / --work-tree（或 GIT_DIR / GIT_WORK_TREE / GIT_INDEX_FILE），无法校验仓库归属，一律拒绝。',
              'This commit carries -C / --git-dir / --work-tree (or GIT_DIR / GIT_WORK_TREE / GIT_INDEX_FILE), so the repository it targets cannot be verified; it is refused.',
            )}`;
          } else if (classification.gitSubcommand === 'commit' && classification.gitConfig === true) {
            denyMessage += `\n${t(
              '该 commit 带 -c / --config-env（可改写 hooks / fsmonitor / 别名），无法证明只提交书账，一律拒绝。',
              'This commit carries -c / --config-env (which can redirect hooks, fsmonitor or aliases), so a pure bookkeeping commit cannot be proven; it is refused.',
            )}`;
          }
          return denyDecidable('shell-git-whole-tree', denyMessage, []);
        }
        // op-005 / P1-2：整树写会覆盖受保护路径所在的 `.openfeel/**`（flow.json /
        // chore.json / guard-audit…），「受保护路径任意相位硬拒」在主相位会被它绕过。
        // 要求工作区的 `.openfeel/**` 无未提交差异；有差异先让人提交/还原。
        // `git commit` 例外（它不覆盖工作区，见 classifyGitCommand）。
        if (classification.preservesWorktree !== true
          && openfeelTreeDirty(resolvedCwd, {
            includeUntracked: classification.destroysUntracked === true,
            includeIgnoredEvidence: classification.purgesIgnored === true,
          }) === true) {
          return denyDecidable('shell-git-whole-tree-dirty', t(
            `OpenFeel 写入门禁：\`.openfeel/**\` 还有未提交的改动（或会被本条命令删掉的未跟踪/被忽略文件，如审计 \`log/guard-audit.jsonl\` 与 \`chore.json\`），整树 git 写（${classification.detail}）会连流程状态/证据一起覆盖或删除。请先 \`git add -A .openfeel && git commit\`（或还原这些改动、删掉多余未跟踪文件）再执行。`,
            `OpenFeel write guard: \`.openfeel/**\` has uncommitted changes (or untracked/ignored files this command would delete, e.g. the audit log \`log/guard-audit.jsonl\` and \`chore.json\`), so this whole-tree git write (${classification.detail}) would overwrite/delete pipeline state or evidence. Commit or restore those changes first (\`git add -A .openfeel && git commit\`).`,
          ), []);
        }
        return allowShell('git-worktree-write', []);
      }
      // 没有任何写入形态：不误杀构建/测试命令（`npx vitest` / `npm run build` / `cargo build` / `tsc -b`）
      if (classification.kind === 'none') return allowShell('shell-no-write', []);
      // 第 4 类（op-005 / P0-1）：**无法判定「不写」**—— 未识别命令、`& $var`、
      // 目标不可判等都落这里；默认告警放行 + 审计（`kind: undecidable`），strict 拒。
      if (classification.kind === 'undecidable') return undecidableShell(classification.detail, []);
      // 只读解释器（`node -e "console.log(…)"`）：放行且**不写审计**（op-002b：
      // 日常诊断零噪音）；lastDecision 仍更新，便于确认「门禁跑过了」。
      if (classification.kind === 'readonly-interpreter') {
        recordDecision('allow', { reason: 'shell-readonly-interpreter' });
        return undefined;
      }

      const shellPaths = classification.targets;
      // 第 1 类（写入目标维度）：受保护路径，文案与文件工具完全一致
      const protectedHits = shellPaths
        .map((target) => matchProtectedPath(target, normalizedCwd))
        .filter((hit) => hit !== null);
      if (protectedHits.length > 0) {
        return denyDecidable('shell-protected', protectedDenialMessage(protectedHits, t), shellPaths);
      }
      // 第 3 类：构建/测试产物豁免；必须**全部**命中才放行，混合目标从严
      const decidableTargets = shellPaths.filter((target) => !isBuildArtifactPath(target, normalizedCwd));
      if (decidableTargets.length === 0) {
        if (classification.undecidable) return undecidableShell(classification.detail, shellPaths);
        return allowShell('shell-build-artifact', shellPaths);
      }
      // 第 2 类：复用与文件工具完全相同的判定（相位 / doc-asset / 研究闸 / chore）
      const decided = decideForTargets(guardContext, {
        name,
        targets: decidableTargets,
        resolvedCwd,
        normalizedCwd,
        cwdSource,
        audit: false,
      });
      if (decided.decision === 'deny') return denyDecidable(decided.reason, decided.message, decidableTargets);
      if (classification.undecidable) return undecidableShell(classification.detail, shellPaths);
      return allowShell(decided.reason, decidableTargets);
    }

    /* ── 文件工具分支（write / edit / str_replace_editor / apply_patch） ── */

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
    // 判定体已抽成 `decideForTargets()`（plan §3.1⑤ 的纯重构）：文件分支与 shell 分支
    // 共用同一份 —— 受保护路径 → bootstrap → 内部早返回 → 研究闸 → 无阶段/chore/
    // doc-asset → 相位判定，逐行语义不变。
    const decision = decideForTargets(guardContext, {
      name,
      targets,
      patchEntries,
      resolvedCwd,
      normalizedCwd,
      cwdSource,
    });
    if (decision.decision === 'allow') {
      recordDecision('allow', { reason: decision.reason, paths: targets });
      return undefined;
    }
    recordDecision('deny', { reason: decision.reason, paths: targets });
    return decision.message;
  };
}

/**
 * 测试用：清空 flow.json 缓存。
 */
export function clearGuardCache() {
  flowCache.clear();
}
