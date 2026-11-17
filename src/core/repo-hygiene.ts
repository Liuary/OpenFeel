/**
 * 仓库卫生（v1.5.23 / REQ-041）—— 运行态文件不进索引
 *
 * 背景（六期反馈 C / #4）：
 *  - `.openfeel/dev/.sync.json` 每次 `flow advance` 都写，却不在 `.gitignore`；
 *    阶段归档的 `git add -A` 会把它带进提交，每个版本都夹一条无意义变更。
 *  - `.gitignore` 对**已跟踪**文件无效：早期提交进索引的运行态文件必须显式
 *    `git rm --cached` 才能移出（门禁曾把这类纯索引操作一起拒掉，见 #2）。
 *
 * 本模块只做三件事，且都是幂等的：
 *  ① 保证 `.gitignore` 覆盖运行态文件（缺哪条补哪条，不重排既有内容）；
 *  ② 列出「仍被跟踪的运行态文件」；
 *  ③ 把它们从索引移除（**不删工作区文件**）。
 *
 * 边界：不碰用户手写的 ignore 规则；不处理 `current_archive/**` 这类历史内容
 * （它们是否入库属于项目取舍，需要人拍板）；不写 `.openfeel/dev/*` 内容本身。
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { atomicWriteFileSync } from './fs/atomic-write.js';

/**
 * 运行态文件清单（CLI 自动维护、逐次变更、不应入库）。
 * 顺序 = 写入 `.gitignore` 的顺序；已存在的行不会重复追加。
 */
export const RUNTIME_STATE_ENTRIES: readonly string[] = [
  '.openfeel/dev/.preflight.json',
  '.openfeel/dev/sessions.json',
  '.openfeel/dev/guard-state.json',
  '.openfeel/dev/.sync.json',
  '.openfeel/log/guard-audit.jsonl',
];

/** `.gitignore` 追加块的表头（仅在确有缺项时写入一次） */
const GITIGNORE_HEADER = '# openfeel：运行态文件（CLI 自动维护，逐次变更；v1.5.23 起默认不入库）';

export interface GitignoreEnsureResult {
  /** `.gitignore` 绝对路径 */
  file: string;
  /** 本次补进去的条目（已存在的不计） */
  added: string[];
}

/**
 * 保证项目 `.gitignore` 覆盖全部运行态条目。
 * 只追加、不改既有行；文件不存在时新建。`dryRun` 只计算缺项、零写盘。
 */
export function ensureRuntimeIgnoreEntries(
  projectPath: string,
  options: { dryRun?: boolean } = {},
): GitignoreEnsureResult {
  const file = join(projectPath, '.gitignore');
  const existing = existsSync(file) ? readFileSync(file, 'utf-8') : '';
  const existingLines = new Set(existing.split(/\r?\n/).map((line) => line.trim()));
  const added = RUNTIME_STATE_ENTRIES.filter((entry) => !existingLines.has(entry));
  if (added.length === 0 || options.dryRun === true) {
    return { file, added };
  }
  const separator = existing === '' ? '' : (existing.endsWith('\n') ? '' : '\n');
  const block = `${existing === '' ? '' : '\n'}${GITIGNORE_HEADER}\n${added.join('\n')}\n`;
  atomicWriteFileSync(file, existing + separator + block);
  return { file, added };
}

/** 是否为 git 仓库（`git rev-parse --is-inside-work-tree`） */
export function isGitRepository(projectPath: string): boolean {
  return runGit(projectPath, ['rev-parse', '--is-inside-work-tree']) === 'true';
}

/**
 * 仍被 git 跟踪的运行态文件（工作区相对路径，POSIX 分隔符）。
 * 非 git 仓库 / git 不可用 → 空数组（调用方据此走降级路径）。
 */
export function listTrackedRuntimeFiles(projectPath: string): string[] {
  const out = runGit(projectPath, ['ls-files', '--', ...RUNTIME_STATE_ENTRIES]);
  if (out === null || out === '') return [];
  return out.split('\n').map((line) => line.trim()).filter((line) => line !== '');
}

export interface UntrackResult {
  /** 仍被跟踪、本次（或 dry-run 下将会）移出索引的文件 */
  files: string[];
  /** 是否只预演（未实际改索引） */
  dryRun: boolean;
  /** 是否真的执行了 `git rm --cached` */
  applied: boolean;
}

/**
 * 把运行态文件移出 git 索引（保留工作区文件）。
 * `dryRun=true` 只列出将处理项，零写盘。
 */
export function untrackRuntimeFiles(projectPath: string, options: { dryRun?: boolean } = {}): UntrackResult {
  const dryRun = options.dryRun === true;
  const files = listTrackedRuntimeFiles(projectPath);
  if (files.length === 0) {
    return { files: [], dryRun, applied: false };
  }
  if (dryRun) {
    return { files, dryRun, applied: false };
  }
  const ok = runGit(projectPath, ['rm', '--cached', '--quiet', '--', ...files]);
  if (ok === null) {
    // git 不可用 → 不回滚已列出的文件，交由调用方提示人工处理
    return { files, dryRun, applied: false };
  }
  return { files, dryRun, applied: true };
}

/** 执行 git 并返回 stdout（去尾空白）；非 git / 失败 → null */
function runGit(projectPath: string, args: string[]): string | null {
  try {
    const out = execFileSync('git', args, {
      cwd: projectPath,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return String(out).trim();
  } catch {
    return null;
  }
}
