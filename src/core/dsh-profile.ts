/**
 * DSH profile 部署（v1.3.0-stage-101）
 *
 * 职责：把 `<openfeelRoot>/dsh` 以 `link:` 依赖写进 DSH profile 的 `package.json`、
 * 追加 `dsh.profile.bundles`、按需执行 `pnpm install`。领域状态仍归 OpenFeel CLI，
 * 本模块只做安装编排。
 *
 * 边界：
 * - 不 import `node:os` 的 `homedir`（统一经 `global-paths.getHomedir()`，测试单点 mock）。
 * - 写前备份 / 锁序遵循既有约定：备份与 `appendUpdateInfo` 在 profile 锁**外**，
 *   锁内只做「重读 → 合并 → 按需预检 → 原子写」。
 * - 错误码 `DSH_*` 仅内部使用；命令层映射到既有 `INVALID_ARGUMENT` / `INTERNAL_ERROR`，
 *   不新增 CLI 稳定错误码。
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';

import { atomicWriteFileSync } from './fs/atomic-write.js';
import { globalLockPath, withFileLock } from './fs/file-lock.js';
import { getHomedir } from './global-paths.js';
import { backupFileBeforeWrite, notifyBackupIfTTY, BackupError } from './backup.js';
import { appendUpdateInfo } from './update-infos.js';

/** profile 依赖名（与 `dsh/package.json` 的 name 一致） */
export const DSH_ADAPTER_PACKAGE = 'openfeel-dsh';

/** DSH profile 部署内部错误码（不进入 CLI 稳定错误码表） */
export type DshProfileErrorCode =
  | 'DSH_HOME_NOT_FOUND'
  | 'DSH_PROFILE_NOT_FOUND'
  | 'DSH_PROFILE_UNKNOWN'
  | 'DSH_PROFILE_INVALID_JSON'
  | 'DSH_PROFILE_NOT_DSH'
  | 'DSH_PROFILE_INVALID_SHAPE'
  | 'DSH_ADAPTER_MISSING'
  | 'DSH_PNPM_MISSING'
  | 'DSH_BACKUP_FAILED'
  | 'DSH_PNPM_INSTALL_FAILED';

/** 内部错误 → CLI 稳定错误码的 reason 映射（命令层 detail.reason） */
const ERROR_REASON: Record<DshProfileErrorCode, string> = {
  DSH_HOME_NOT_FOUND: 'dsh-home-not-found',
  DSH_PROFILE_NOT_FOUND: 'dsh-profile-not-found',
  DSH_PROFILE_UNKNOWN: 'dsh-profile-unknown',
  DSH_PROFILE_INVALID_JSON: 'dsh-profile-invalid-json',
  DSH_PROFILE_NOT_DSH: 'dsh-profile-not-dsh',
  DSH_PROFILE_INVALID_SHAPE: 'dsh-profile-invalid-shape',
  DSH_ADAPTER_MISSING: 'dsh-adapter-missing',
  DSH_PNPM_MISSING: 'dsh-pnpm-missing',
  DSH_BACKUP_FAILED: 'dsh-backup-failed',
  DSH_PNPM_INSTALL_FAILED: 'dsh-pnpm-install-failed',
};

/** 内部错误 */
export class DshProfileError extends Error {
  readonly code: DshProfileErrorCode;
  readonly detail: Record<string, unknown>;

  constructor(code: DshProfileErrorCode, detail: Record<string, unknown> = {}, message?: string) {
    super(message ?? `DSH profile error: ${code}`);
    this.name = 'DshProfileError';
    this.code = code;
    this.detail = detail;
  }
}

/** profile 的 package.json 语义结构（保留未知字段） */
export interface ProfileJson {
  dependencies?: Record<string, string>;
  dsh?: {
    profile?: { bundles?: string[]; [key: string]: unknown };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/** 单个 DSH profile */
export interface DshProfile {
  name: string;
  /** profile 目录绝对路径 */
  path: string;
  /** profile package.json 绝对路径 */
  packagePath: string;
}

/** 部署预检结果（零写盘） */
export interface DshProfilePlan {
  home: string;
  adapterDir: string;
  profiles: DshProfile[];
}

/** 单个 profile 的部署结果 */
export interface DshProfileResult {
  name: string;
  path: string;
  action: 'updated' | 'skipped';
  backupRel?: string;
  install: 'installed' | 'skipped';
}

/** 预检可注入参数（测试用；生产仅 `dshProfile`） */
export interface DshPlanOptions {
  dshProfile?: string;
  dshHome?: string;
  adapterDir?: string;
  openfeelRoot?: string;
}

/** 纯函数：普通对象判定 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 是否为目录 */
function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** 正斜杠路径（pnpm link spec / 输出） */
function toPosix(path: string): string {
  return path.replace(/\\/g, '/');
}

/** 锁文件安全名 */
function safeLockName(name: string): string {
  return name.replace(/[^A-Za-z0-9_.-]/g, '-');
}

/** 读取文件文本 */
function readText(path: string): string {
  return readFileSync(path, 'utf-8');
}

/** 错误消息归一 */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 解析 profile package.json 文本（严格 JSON） */
function parseProfileJson(text: string, path: string): ProfileJson {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new DshProfileError(
      'DSH_PROFILE_INVALID_JSON',
      { path, err: messageOf(error) },
      `DSH profile package.json is not valid JSON: ${path}`,
    );
  }
  if (!isRecord(parsed)) {
    throw new DshProfileError(
      'DSH_PROFILE_INVALID_SHAPE',
      { path, field: 'root' },
      `DSH profile package.json is not an object: ${path}`,
    );
  }
  return parsed as ProfileJson;
}

/** 解析 DSH_HOME（env 优先，绝对化） */
export function resolveDshHome(): string {
  const fromEnv = process.env.DSH_HOME?.trim();
  if (fromEnv !== undefined && fromEnv !== '') {
    return resolve(fromEnv);
  }
  return join(getHomedir(), '.dsh');
}

/** 列出 `<dshHome>/profiles` 下含 package.json 的 profile（按 name 排序） */
export function listDshProfiles(dshHome: string): DshProfile[] {
  const profilesDir = join(dshHome, 'profiles');
  if (!isDirectory(profilesDir)) {
    throw new DshProfileError(
      'DSH_HOME_NOT_FOUND',
      { dir: profilesDir },
      `DSH profiles directory not found: ${profilesDir}`,
    );
  }

  const profiles: DshProfile[] = [];
  for (const entry of readdirSync(profilesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const profilePath = join(profilesDir, entry.name);
    const packagePath = join(profilePath, 'package.json');
    if (!existsSync(packagePath)) continue;
    profiles.push({ name: entry.name, path: profilePath, packagePath });
  }
  profiles.sort((a, b) => a.name.localeCompare(b.name));

  if (profiles.length === 0) {
    throw new DshProfileError(
      'DSH_PROFILE_NOT_FOUND',
      { dir: profilesDir },
      `No recognizable DSH profile under: ${profilesDir}`,
    );
  }
  return profiles;
}

/** 按名称选择 profile；未指定则返回全部 */
export function selectDshProfiles(profiles: DshProfile[], requested?: string): DshProfile[] {
  const name = requested?.trim();
  if (name === undefined || name === '') return profiles;
  const matched = profiles.filter((profile) => profile.name === name);
  if (matched.length === 0) {
    throw new DshProfileError(
      'DSH_PROFILE_UNKNOWN',
      { name, available: profiles.map((profile) => profile.name) },
      `DSH profile not found: ${name}`,
    );
  }
  return matched;
}

/** 读取并校验 profile package.json（严格 JSON + `dsh` 配置） */
export function readDshProfilePackage(profile: DshProfile): ProfileJson {
  const json = parseProfileJson(readText(profile.packagePath), profile.packagePath);
  if (!isRecord(json.dsh)) {
    throw new DshProfileError(
      'DSH_PROFILE_NOT_DSH',
      { path: profile.packagePath },
      `Not a DSH profile (missing dsh config): ${profile.packagePath}`,
    );
  }
  return json;
}

/** 纯函数：计算 profile package.json 的目标状态 */
export function buildDshProfileMerge(
  json: ProfileJson,
  adapterDir: string,
): { next: ProfileJson; changed: boolean; changes: Array<'dependency' | 'bundle'> } {
  if (!isRecord(json)) {
    throw new DshProfileError('DSH_PROFILE_INVALID_SHAPE', { field: 'root' });
  }

  const next = structuredClone(json) as ProfileJson;
  const changes: Array<'dependency' | 'bundle'> = [];

  if (!isRecord(next.dsh)) {
    throw new DshProfileError('DSH_PROFILE_NOT_DSH', {});
  }
  const dsh = next.dsh;

  if (dsh.profile === undefined) {
    dsh.profile = {};
  } else if (!isRecord(dsh.profile)) {
    throw new DshProfileError('DSH_PROFILE_INVALID_SHAPE', { field: 'dsh.profile' });
  }
  const profile = dsh.profile as { bundles?: string[]; [key: string]: unknown };

  if (profile.bundles === undefined) {
    profile.bundles = [];
  } else if (!Array.isArray(profile.bundles) || profile.bundles.some((item) => typeof item !== 'string')) {
    throw new DshProfileError('DSH_PROFILE_INVALID_SHAPE', { field: 'dsh.profile.bundles' });
  }

  if (next.dependencies === undefined) {
    next.dependencies = {};
  } else if (!isRecord(next.dependencies)) {
    throw new DshProfileError('DSH_PROFILE_INVALID_SHAPE', { field: 'dependencies' });
  }
  const dependencies = next.dependencies as Record<string, string>;

  const linkSpec = toLinkSpec(adapterDir);
  if (dependencies[DSH_ADAPTER_PACKAGE] !== linkSpec) {
    dependencies[DSH_ADAPTER_PACKAGE] = linkSpec;
    changes.push('dependency');
  }

  const bundles = profile.bundles as string[];
  if (!bundles.includes(DSH_ADAPTER_PACKAGE)) {
    bundles.push(DSH_ADAPTER_PACKAGE);
    changes.push('bundle');
  }

  return { next, changed: changes.length > 0, changes };
}

/** `link:` 依赖 spec（正斜杠） */
export function toLinkSpec(adapterDir: string): string {
  return `link:${toPosix(adapterDir)}`;
}

/** 当前 OpenFeel 包根（src/core 与 dist/core 均指向包根） */
export function getOpenfeelRootDir(): string {
  const require = createRequire(import.meta.url);
  return dirname(require.resolve('../../package.json'));
}

/** 适配器目录（校验 dsh/package.json 的 name） */
export function getDshAdapterDir(rootDir: string = getOpenfeelRootDir()): string {
  const adapterDir = join(rootDir, 'dsh');
  const packagePath = join(adapterDir, 'package.json');
  if (!existsSync(packagePath)) {
    throw new DshProfileError(
      'DSH_ADAPTER_MISSING',
      { path: packagePath },
      `DSH adapter not found: ${packagePath}`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readText(packagePath));
  } catch {
    throw new DshProfileError(
      'DSH_ADAPTER_MISSING',
      { path: packagePath },
      `DSH adapter package.json is not valid JSON: ${packagePath}`,
    );
  }
  if (!isRecord(parsed) || parsed.name !== DSH_ADAPTER_PACKAGE) {
    throw new DshProfileError(
      'DSH_ADAPTER_MISSING',
      { path: packagePath },
      `DSH adapter package name mismatch: ${packagePath}`,
    );
  }
  return adapterDir;
}

/** profile 的 node_modules/openfeel-dsh 是否已指向适配器目录 */
export function isLinkValid(profileDir: string, adapterDir: string): boolean {
  const target = join(profileDir, 'node_modules', DSH_ADAPTER_PACKAGE);
  try {
    // Windows junction 用 realpathSync 不会解析到目标；native 版本才会。
    const realpath = process.platform === 'win32' ? realpathSync.native : realpathSync;
    const actual = realpath(target);
    const expected = realpath(adapterDir);
    if (process.platform === 'win32') {
      return actual.toLowerCase() === expected.toLowerCase();
    }
    return actual === expected;
  } catch {
    return false;
  }
}

/** 预检：home → profiles → 逐个结构校验 → adapter；不预检 pnpm，零写盘 */
export function planDshDeployment(options: DshPlanOptions = {}): DshProfilePlan {
  const home = options.dshHome ?? resolveDshHome();
  const profiles = selectDshProfiles(listDshProfiles(home), options.dshProfile);
  const adapterDir = options.adapterDir ?? getDshAdapterDir(options.openfeelRoot);
  for (const profile of profiles) {
    const json = readDshProfilePackage(profile);
    // 纯结构校验（不写盘）：dependencies / dsh.profile.bundles 类型错误在预检阶段暴露
    try {
      buildDshProfileMerge(json, adapterDir);
    } catch (error) {
      if (error instanceof DshProfileError) {
        if (error.detail.path === undefined) error.detail.path = profile.packagePath;
        throw error;
      }
      throw error;
    }
  }
  return { home, adapterDir, profiles };
}

/** 预检 pnpm 是否可用（仅在需要 install 时调用） */
export function resolvePnpmCommand(profileDir?: string): void {
  const result = spawnSync('pnpm', ['--version'], {
    shell: process.platform === 'win32',
    encoding: 'utf8',
    timeout: 30_000,
  });
  if (result.error !== undefined || result.status !== 0) {
    throw new DshProfileError(
      'DSH_PNPM_MISSING',
      {
        command: 'pnpm',
        ...(profileDir === undefined ? {} : { path: profileDir }),
        err: result.error === undefined ? `exit ${result.status}` : messageOf(result.error),
      },
      'pnpm not found',
    );
  }
}

/** 在 profile 目录执行 pnpm install --prefer-offline */
export function runPnpmInstall(profileDir: string): void {
  const result = spawnSync('pnpm', ['install', '--prefer-offline'], {
    cwd: profileDir,
    shell: process.platform === 'win32',
    encoding: 'utf8',
    timeout: 180_000,
    env: { ...process.env, CI: '1' },
  });
  if (result.error === undefined && result.status === 0) return;

  const stdoutTail = (result.stdout ?? '').slice(-2000);
  const stderrTail = (result.stderr ?? '').slice(-2000);
  throw new DshProfileError(
    'DSH_PNPM_INSTALL_FAILED',
    {
      path: profileDir,
      stdoutTail,
      stderrTail,
      manualCommand: `cd ${profileDir} && pnpm install`,
      err: result.error === undefined ? `exit ${result.status}` : messageOf(result.error),
    },
    `pnpm install failed: ${profileDir}`,
  );
}

/**
 * 执行部署（锁外备份 → 锁内重读/合并/按需预检/写 → 解锁后 install）。
 * fail-fast：任一 profile 失败即停止，已完成项写入 detail.completed。
 */
export function applyDshDeployment(plan: DshProfilePlan): DshProfileResult[] {
  const results: DshProfileResult[] = [];
  const completed: string[] = [];

  for (const profile of plan.profiles) {
    let lockedOriginalText: string | undefined;
    let wrote = false;
    let backupRel: string | undefined;

    try {
      const preJson = parseProfileJson(readText(profile.packagePath), profile.packagePath);
      const preMerge = buildDshProfileMerge(preJson, plan.adapterDir);
      const needsInstall = preMerge.changed || !isLinkValid(profile.path, plan.adapterDir);

      if (!needsInstall) {
        results.push({ name: profile.name, path: profile.packagePath, action: 'skipped', install: 'skipped' });
        completed.push(profile.name);
        continue;
      }

      // 锁外备份（任何可能写入的路径都先备份，覆盖 changed 竞态）
      let backup;
      try {
        backup = backupFileBeforeWrite(profile.packagePath, { command: 'setup' });
      } catch (error) {
        throw new DshProfileError(
          'DSH_BACKUP_FAILED',
          { profile: profile.name, path: profile.packagePath, err: messageOf(error), completed: [...completed] },
          `DSH profile backup failed: ${profile.packagePath}`,
        );
      }
      if (backup !== null) {
        backupRel = backup.backupRel;
        appendUpdateInfo('backed', {
          absolutePath: profile.packagePath,
          backupRel: backup.backupRel,
          command: 'setup',
        });
        notifyBackupIfTTY(backup.backupRel);
      }

      // 锁内重读 → 合并 → 按需 pnpm 预检 → 原子写
      const locked = withFileLock(globalLockPath(`dsh-profile-${safeLockName(profile.name)}`), () => {
        const text = readText(profile.packagePath);
        const json = parseProfileJson(text, profile.packagePath);
        const merge = buildDshProfileMerge(json, plan.adapterDir);
        const install = merge.changed || !isLinkValid(profile.path, plan.adapterDir);
        if (install) resolvePnpmCommand(profile.path);
        if (merge.changed) {
          atomicWriteFileSync(profile.packagePath, `${JSON.stringify(merge.next, null, 2)}\n`);
        }
        return { text, changed: merge.changed, install };
      });

      lockedOriginalText = locked.text;
      wrote = locked.changed;
      if (locked.install) {
        try {
          runPnpmInstall(profile.path);
        } catch (error) {
          let rollbackError: string | undefined;
          if (wrote && lockedOriginalText !== undefined) {
            try {
              atomicWriteFileSync(profile.packagePath, lockedOriginalText);
            } catch (rollbackErr) {
              rollbackError = messageOf(rollbackErr);
            }
          }
          appendUpdateInfo('anomaly', {
            absolutePath: profile.packagePath,
            note: 'dsh_install_failed_rolled_back',
          });
          throw new DshProfileError(
            'DSH_PNPM_INSTALL_FAILED',
            {
              ...(error instanceof DshProfileError ? error.detail : {}),
              profile: profile.name,
              path: profile.path,
              completed: [...completed],
              ...(rollbackError === undefined ? {} : { rollbackError }),
            },
            error instanceof Error ? error.message : String(error),
          );
        }
      }

      results.push({
        name: profile.name,
        path: profile.packagePath,
        action: locked.changed ? 'updated' : 'skipped',
        ...(backupRel === undefined ? {} : { backupRel }),
        install: locked.install ? 'installed' : 'skipped',
      });
      completed.push(profile.name);
    } catch (error) {
      if (error instanceof DshProfileError) {
        if (error.detail.completed === undefined) {
          error.detail.completed = [...completed];
        }
        throw error;
      }
      throw new DshProfileError(
        'DSH_PNPM_INSTALL_FAILED',
        { profile: profile.name, path: profile.path, err: messageOf(error), completed: [...completed] },
        messageOf(error),
      );
    }
  }

  return results;
}

/** 内部错误 → 命令层稳定错误码 + detail.reason（纯函数） */
export function dshErrorToCli(err: DshProfileError): {
  code: 'INVALID_ARGUMENT' | 'INTERNAL_ERROR';
  detail: Record<string, unknown>;
} {
  const internal = err.code === 'DSH_BACKUP_FAILED' || err.code === 'DSH_PNPM_INSTALL_FAILED';
  return {
    code: internal ? 'INTERNAL_ERROR' : 'INVALID_ARGUMENT',
    detail: { reason: ERROR_REASON[err.code], ...err.detail },
  };
}

/** 备份错误类型再导出（命令层测试/诊断用） */
export { BackupError };
