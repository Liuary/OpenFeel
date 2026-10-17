/**
 * DSH profile 部署核心测试（v1.3.0-stage-101）
 *
 * 覆盖：home 解析 / profile 发现与选择 / 合并纯函数 / 非法输入零写盘 /
 * 锁外备份 + 锁内重读 / pnpm 延迟预检 / install 回滚 / 多 profile fail-fast /
 * 错误映射（不新增 CLI 错误码）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const mockHome = vi.hoisted(() => ({ dir: '' }));
const backupState = vi.hoisted(() => ({ fail: false }));
const childState = vi.hoisted(() => ({
  queue: [] as Array<{ status?: number | null; stdout?: string; stderr?: string; error?: { code?: string } }>,
}));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => mockHome.dir };
});

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(() => childState.queue.shift() ?? { status: 0, stdout: '', stderr: '' }),
}));

vi.mock('../../src/core/backup.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/backup.js')>();
  return {
    ...actual,
    backupFileBeforeWrite: (path: string, options: unknown) => {
      if (backupState.fail) throw new actual.BackupError(path, new Error('boom'));
      return actual.backupFileBeforeWrite(path, options as never);
    },
    notifyBackupIfTTY: () => {},
  };
});

import { resetBackupSetCache } from '../../src/core/backup.js';
import { spawnSync } from 'node:child_process';
import {
  applyDshDeployment,
  buildDshProfileMerge,
  DshProfileError,
  dshErrorToCli,
  getDshAdapterDir,
  getOpenfeelRootDir,
  isLinkValid,
  listDshProfiles,
  planDshDeployment,
  readDshProfilePackage,
  resolveDshHome,
  selectDshProfiles,
  toLinkSpec,
  type ProfileJson,
} from '../../src/core/dsh-profile.js';

const ADAPTER_DIR = resolve(process.cwd(), 'dsh');

/** 构造 profile 目录 + package.json */
function createProfile(home: string, name: string, json: Record<string, unknown>): { dir: string; pkg: string } {
  const dir = join(home, 'profiles', name);
  mkdirSync(dir, { recursive: true });
  const pkg = join(dir, 'package.json');
  writeFileSync(pkg, `${JSON.stringify(json, null, 2)}\n`, 'utf-8');
  return { dir, pkg };
}

/** 基础 profile JSON */
function baseProfile(): Record<string, unknown> {
  return {
    name: 'dsh-profile-web',
    private: true,
    dependencies: {},
    dsh: { profile: { bundles: [], patchReload: 'live' } },
  };
}

/** 创建 node_modules/openfeel-dsh → adapterDir 链接 */
function linkAdapter(profileDir: string): void {
  const nodeModules = join(profileDir, 'node_modules');
  mkdirSync(nodeModules, { recursive: true });
  const target = join(nodeModules, 'openfeel-dsh');
  if (existsSync(target)) return;
  symlinkSync(ADAPTER_DIR, target, process.platform === 'win32' ? 'junction' : 'dir');
}

/** 读取 profile package.json */
function readJson(pkg: string): ProfileJson {
  return JSON.parse(readFileSync(pkg, 'utf-8')) as ProfileJson;
}

describe('DSH profile 部署核心', () => {
  let home: string;
  let dshHome: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'openfeel-dsh-profile-'));
    dshHome = join(home, '.dsh');
    mockHome.dir = home;
    backupState.fail = false;
    childState.queue = [];
    resetBackupSetCache();
    delete process.env.DSH_HOME;
  });

  afterEach(() => {
    delete process.env.DSH_HOME;
    rmSync(home, { recursive: true, force: true });
    mockHome.dir = '';
    vi.clearAllMocks();
  });

  it('resolveDshHome：DSH_HOME 优先并绝对化，否则 <home>/.dsh', () => {
    process.env.DSH_HOME = 'relative/dsh-home';
    expect(resolveDshHome()).toBe(resolve('relative/dsh-home'));
    delete process.env.DSH_HOME;
    expect(resolveDshHome()).toBe(join(home, '.dsh'));
  });

  it('listDshProfiles：只收含 package.json 的目录并按 name 排序', () => {
    createProfile(dshHome, 'web', baseProfile());
    createProfile(dshHome, 'desktop', baseProfile());
    mkdirSync(join(dshHome, 'profiles', 'no-package'), { recursive: true });
    expect(listDshProfiles(dshHome).map((p) => p.name)).toEqual(['desktop', 'web']);
  });

  it('listDshProfiles：缺目录 / 空集给内部错误码', () => {
    expect(() => listDshProfiles(join(home, 'missing'))).toThrowError(/DSH profiles directory not found/);
    mkdirSync(join(dshHome, 'profiles'), { recursive: true });
    expect(() => listDshProfiles(dshHome)).toThrowError(/No recognizable DSH profile/);
  });

  it('selectDshProfiles：缺省全部、按名称精确、未知报错', () => {
    const profiles = [
      { name: 'web', path: join(dshHome, 'profiles', 'web'), packagePath: join(dshHome, 'profiles', 'web', 'package.json') },
      { name: 'desktop', path: join(dshHome, 'profiles', 'desktop'), packagePath: join(dshHome, 'profiles', 'desktop', 'package.json') },
    ];
    expect(selectDshProfiles(profiles)).toHaveLength(2);
    expect(selectDshProfiles(profiles, 'web').map((p) => p.name)).toEqual(['web']);
    try {
      selectDshProfiles(profiles, 'nope');
      throw new Error('应当抛出');
    } catch (error) {
      expect((error as DshProfileError).code).toBe('DSH_PROFILE_UNKNOWN');
    }
  });

  it('buildDshProfileMerge：新增 dependency + bundle，保留未知字段，二次幂等', () => {
    const first = buildDshProfileMerge({ name: 'web', dsh: { profile: { patchReload: 'live' } } }, ADAPTER_DIR);
    expect(first.changed).toBe(true);
    expect(first.changes).toEqual(['dependency', 'bundle']);
    expect(first.next.dependencies?.['openfeel-dsh']).toBe(toLinkSpec(ADAPTER_DIR));
    expect(first.next.dsh?.profile?.bundles).toEqual(['openfeel-dsh']);
    expect(first.next.dsh?.profile?.patchReload).toBe('live');

    const second = buildDshProfileMerge(first.next, ADAPTER_DIR);
    expect(second.changed).toBe(false);
    expect(second.changes).toEqual([]);
  });

  it('buildDshProfileMerge：重复 bundle 去重、非 DSH / 结构非法报错', () => {
    const merged = buildDshProfileMerge(
      { dependencies: { 'openfeel-dsh': 'link:C:/x/dsh' }, dsh: { profile: { bundles: ['openfeel-dsh'] } } },
      'C:\\x\\dsh',
    );
    expect(merged.changed).toBe(false);
    expect(merged.next.dsh?.profile?.bundles).toEqual(['openfeel-dsh']);

    expect(() => buildDshProfileMerge({}, ADAPTER_DIR)).toThrowError(/DSH_PROFILE_NOT_DSH/);
    expect(() => buildDshProfileMerge({ dsh: { profile: { bundles: 'x' } } } as unknown as ProfileJson, ADAPTER_DIR))
      .toThrowError(/DSH_PROFILE_INVALID_SHAPE/);
  });

  it('planDshDeployment：非法 JSON 抛 INVALID_JSON 且文件字节不变', () => {
    const dir = join(dshHome, 'profiles', 'web');
    mkdirSync(dir, { recursive: true });
    const pkg = join(dir, 'package.json');
    writeFileSync(pkg, '{ invalid', 'utf-8');
    expect(() => planDshDeployment({ dshHome, adapterDir: ADAPTER_DIR })).toThrowError(/not valid JSON/);
    expect(readFileSync(pkg, 'utf-8')).toBe('{ invalid');
  });

  it('planDshDeployment：无 dsh 对象 / dependencies 类型非法 → 对应错误码', () => {
    createProfile(dshHome, 'web', { name: 'web' });
    try {
      planDshDeployment({ dshHome, adapterDir: ADAPTER_DIR });
      throw new Error('应当抛出');
    } catch (error) {
      expect((error as DshProfileError).code).toBe('DSH_PROFILE_NOT_DSH');
    }
    rmSync(join(dshHome, 'profiles', 'web'), { recursive: true, force: true });
    createProfile(dshHome, 'web', { dsh: { profile: {} }, dependencies: [] });
    try {
      planDshDeployment({ dshHome, adapterDir: ADAPTER_DIR });
      throw new Error('应当抛出');
    } catch (error) {
      expect((error as DshProfileError).code).toBe('DSH_PROFILE_INVALID_SHAPE');
    }
  });

  it('getDshAdapterDir：缺失 / name 不符 → DSH_ADAPTER_MISSING', () => {
    expect(getOpenfeelRootDir()).toBe(process.cwd());
    expect(() => getDshAdapterDir(join(home, 'nope'))).toThrowError(/DSH adapter not found/);

    const fakeRoot = join(home, 'fake-openfeel');
    mkdirSync(join(fakeRoot, 'dsh'), { recursive: true });
    writeFileSync(join(fakeRoot, 'dsh', 'package.json'), JSON.stringify({ name: 'other' }), 'utf-8');
    expect(() => getDshAdapterDir(fakeRoot)).toThrowError(/name mismatch/);
  });

  it('toLinkSpec：反斜杠转正斜杠', () => {
    expect(toLinkSpec('C:\\a b\\dsh')).toBe('link:C:/a b/dsh');
  });

  it('unchanged + link 有效 → skipped，无备份、无 pnpm 预检/install', () => {
    const { dir, pkg } = createProfile(dshHome, 'web', {
      ...baseProfile(),
      dependencies: { 'openfeel-dsh': toLinkSpec(ADAPTER_DIR) },
      dsh: { profile: { bundles: ['openfeel-dsh'] } },
    });
    linkAdapter(dir);
    expect(isLinkValid(dir, ADAPTER_DIR)).toBe(true);

    const results = applyDshDeployment(planDshDeployment({ dshHome, adapterDir: ADAPTER_DIR }));
    expect(results).toEqual([{ name: 'web', path: pkg, action: 'skipped', install: 'skipped' }]);
    expect(spawnSync).not.toHaveBeenCalled();
    expect(existsSync(join(home, '.openfeel', 'backup'))).toBe(false);
  });

  it('changed → 锁外备份 + 锁内写 + 安装成功', () => {
    const { pkg } = createProfile(dshHome, 'web', baseProfile());
    childState.queue = [{ status: 0 }, { status: 0 }];
    const results = applyDshDeployment(planDshDeployment({ dshHome, adapterDir: ADAPTER_DIR }));
    expect(results[0]?.action).toBe('updated');
    expect(results[0]?.install).toBe('installed');
    const json = readJson(pkg);
    expect(json.dependencies?.['openfeel-dsh']).toBe(toLinkSpec(ADAPTER_DIR));
    expect(json.dsh?.profile?.bundles).toContain('openfeel-dsh');
    expect(spawnSync).toHaveBeenCalledTimes(2);
    expect(spawnSync).toHaveBeenNthCalledWith(
      2,
      'pnpm',
      ['install', '--prefer-offline', '--no-frozen-lockfile'],
      expect.objectContaining({ cwd: join(dshHome, 'profiles', 'web') }),
    );
    expect(existsSync(join(home, '.openfeel', 'backup'))).toBe(true);
  });

  it('install 失败 → 回滚到锁内重读原文', () => {
    const { pkg } = createProfile(dshHome, 'web', baseProfile());
    const original = readFileSync(pkg, 'utf-8');
    childState.queue = [{ status: 0 }, { status: 1, stdout: 'boom' }];
    try {
      applyDshDeployment(planDshDeployment({ dshHome, adapterDir: ADAPTER_DIR }));
      throw new Error('应当抛出');
    } catch (error) {
      expect((error as DshProfileError).code).toBe('DSH_PNPM_INSTALL_FAILED');
      expect((error as DshProfileError).detail.path).toBe(join(dshHome, 'profiles', 'web'));
    }
    expect(readFileSync(pkg, 'utf-8')).toBe(original);
  });

  it('备份失败 → 该 profile 零写盘', () => {
    const { pkg } = createProfile(dshHome, 'web', baseProfile());
    const original = readFileSync(pkg, 'utf-8');
    backupState.fail = true;
    try {
      applyDshDeployment(planDshDeployment({ dshHome, adapterDir: ADAPTER_DIR }));
      throw new Error('应当抛出');
    } catch (error) {
      expect((error as DshProfileError).code).toBe('DSH_BACKUP_FAILED');
    }
    expect(readFileSync(pkg, 'utf-8')).toBe(original);
  });

  it('pnpm 缺失：changed 时写前失败且零写盘；unchanged 不预检', () => {
    const { pkg } = createProfile(dshHome, 'web', baseProfile());
    const original = readFileSync(pkg, 'utf-8');
    childState.queue = [{ status: 1 }];
    try {
      applyDshDeployment(planDshDeployment({ dshHome, adapterDir: ADAPTER_DIR }));
      throw new Error('应当抛出');
    } catch (error) {
      expect((error as DshProfileError).code).toBe('DSH_PNPM_MISSING');
    }
    expect(readFileSync(pkg, 'utf-8')).toBe(original);
  });

  it('多 profile fail-fast：第二个失败时第一个保持、completed 可诊断', () => {
    const web = createProfile(dshHome, 'web', baseProfile());
    const desktop = createProfile(dshHome, 'desktop', baseProfile());
    const webOriginal = readFileSync(web.pkg, 'utf-8');
    // listDshProfiles 按 name 排序：desktop → web；desktop 成功后 web install 失败
    childState.queue = [{ status: 0 }, { status: 0 }, { status: 0 }, { status: 1 }];
    try {
      applyDshDeployment(planDshDeployment({ dshHome, adapterDir: ADAPTER_DIR }));
      throw new Error('应当抛出');
    } catch (error) {
      const err = error as DshProfileError;
      expect(err.code).toBe('DSH_PNPM_INSTALL_FAILED');
      expect(Array.isArray(err.detail.completed)).toBe(true);
      expect(err.detail.completed).toEqual(['desktop']);
    }
    expect(readJson(desktop.pkg).dependencies?.['openfeel-dsh']).toBe(toLinkSpec(ADAPTER_DIR));
    expect(readFileSync(web.pkg, 'utf-8')).toBe(webOriginal);
  });

  it('dshErrorToCli：预检类 → INVALID_ARGUMENT/1，备份安装类 → INTERNAL_ERROR/3', () => {
    const cases: Array<[DshProfileError, string, string]> = [
      [new DshProfileError('DSH_HOME_NOT_FOUND'), 'INVALID_ARGUMENT', 'dsh-home-not-found'],
      [new DshProfileError('DSH_PNPM_MISSING'), 'INVALID_ARGUMENT', 'dsh-pnpm-missing'],
      [new DshProfileError('DSH_BACKUP_FAILED'), 'INTERNAL_ERROR', 'dsh-backup-failed'],
      [new DshProfileError('DSH_PNPM_INSTALL_FAILED'), 'INTERNAL_ERROR', 'dsh-pnpm-install-failed'],
    ];
    for (const [error, code, reason] of cases) {
      const mapped = dshErrorToCli(error);
      expect(mapped.code).toBe(code);
      expect(mapped.detail.reason).toBe(reason);
    }
  });

  it('readDshProfilePackage：返回完整 JSON 并保留未知字段', () => {
    const { dir, pkg } = createProfile(dshHome, 'web', { ...baseProfile(), extra: { keep: true } });
    const json = readDshProfilePackage({
      name: 'web',
      path: dir,
      packagePath: pkg,
    });
    expect((json as Record<string, unknown>).extra).toEqual({ keep: true });
  });
});
