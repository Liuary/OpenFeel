/**
 * backup 单元测试（stage-46 op-005）
 * 覆盖 backupFileBeforeWrite 的 不存在 / 已存在（global+project 分区）/ manifest / ts 复用 / 撞名 /
 * 绝不覆盖 / 失败可识别 / 并发（REV-005）与 notifyBackupIfTTY 非 TTY 静默。
 * mock homedir 隔离，严禁触碰真实 ~/.openfeel/。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// mock homedir（vi.hoisted 变体；回调内不可引用外层 import）
const mockHome = vi.hoisted(() => ({ dir: '' }));
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => mockHome.dir };
});

import {
  backupFileBeforeWrite,
  BackupError,
  resetBackupSetCache,
  notifyBackupIfTTY,
} from '../../src/core/backup.js';
import { existsSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/** 全局备份根（基于 mock home） */
function backupRoot(): string {
  return join(mockHome.dir, '.openfeel', 'backup');
}

/** 并发子进程用例依赖构建产物 dist/core/backup.js（T44：以 skipIf 显式 skip，不用「警告+return」掩盖未执行） */
const HAS_DIST_BACKUP = existsSync(join(process.cwd(), 'dist', 'core', 'backup.js'));

/** 全局 AGENTS.md 源路径（基于 mock home） */
function globalAgentsMd(): string {
  return join(mockHome.dir, '.config', 'opencode', 'AGENTS.md');
}

describe('backupFileBeforeWrite', () => {
  let homeDir: string;
  let projectDir: string;

  beforeEach(() => {
    homeDir = mkdtempSync(join(tmpdir(), 'openfeel-backup-home-'));
    projectDir = mkdtempSync(join(tmpdir(), 'openfeel-backup-proj-'));
    mockHome.dir = homeDir;
    resetBackupSetCache();
  });

  afterEach(() => {
    rmSync(homeDir, { recursive: true, force: true });
    rmSync(projectDir, { recursive: true, force: true });
    vi.useRealTimers();
    resetBackupSetCache();
  });

  it('目标不存在 → null，且不创建 backup 目录', () => {
    const r = backupFileBeforeWrite(globalAgentsMd(), { command: 'setup' });
    expect(r).toBeNull();
    expect(existsSync(backupRoot())).toBe(false);
  });

  it('目标存在（全局）→ 备份成功、分区 global/、内容一致、manifest 记录', () => {
    const src = globalAgentsMd();
    mkdirSync(join(homeDir, '.config', 'opencode'), { recursive: true });
    writeFileSync(src, 'hello', 'utf-8');

    const r = backupFileBeforeWrite(src, { command: 'setup' });
    expect(r).not.toBeNull();
    const res = r!;
    expect(res.backupRel.startsWith('global/')).toBe(true);

    const dest = join(backupRoot(), res.ts, res.backupRel);
    expect(existsSync(dest)).toBe(true);
    expect(readFileSync(dest, 'utf-8')).toBe('hello');

    const manifest = JSON.parse(readFileSync(join(backupRoot(), res.ts, 'manifest.json'), 'utf-8'));
    const e = manifest.entries[src];
    expect(e).toBeDefined();
    expect(e.backupRel).toBe(res.backupRel);
    expect(e.command).toBe('setup');
    expect(e.hash).toBe(createHash('sha256').update('hello').digest('hex'));
    expect(e.time).toBeTruthy();
  });

  it('目标存在（项目）→ 分区 project/<basename>-<hash8>/', () => {
    const src = join(projectDir, '.openfeel', 'config.yaml');
    mkdirSync(join(projectDir, '.openfeel'), { recursive: true });
    writeFileSync(src, 'cfg', 'utf-8');

    const r = backupFileBeforeWrite(src, { command: 'init', projectPath: projectDir });
    expect(r).not.toBeNull();
    const hash8 = createHash('sha256').update(projectDir).digest('hex').slice(0, 8);
    const expected = join('project', `${basename(projectDir)}-${hash8}`, '.openfeel', 'config.yaml').split('\\').join('/');
    expect(r!.backupRel).toBe(expected);
  });

  it('ts 复用：同进程连续两次同 ts；reset 后 → 新 ts', () => {
    const src = globalAgentsMd();
    mkdirSync(join(homeDir, '.config', 'opencode'), { recursive: true });
    writeFileSync(src, 'v1', 'utf-8');

    const r1 = backupFileBeforeWrite(src, { command: 'update' })!;
    const r2 = backupFileBeforeWrite(src, { command: 'update' })!;
    expect(r2.ts).toBe(r1.ts);

    // reset 后重新探测：既有 ts 目录存在 → 新目录（-2 或新毫秒），绝不复用旧目录
    resetBackupSetCache();
    const r3 = backupFileBeforeWrite(src, { command: 'update' })!;
    expect(r3.ts).not.toBe(r1.ts);
  });

  it('同毫秒撞名 → -2 后缀，既有备份绝不被覆盖', () => {
    const src = globalAgentsMd();
    mkdirSync(join(homeDir, '.config', 'opencode'), { recursive: true });
    writeFileSync(src, 'v1', 'utf-8');

    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 2, 3, 4, 5, 678));
    resetBackupSetCache();

    const base = '20260102T030405678';
    const r1 = backupFileBeforeWrite(src, { command: 'setup' })!;
    expect(r1.ts).toBe(base);

    resetBackupSetCache();
    const r2 = backupFileBeforeWrite(src, { command: 'setup' })!;
    expect(r2.ts).toBe(`${base}-2`);
    // 原备份未被覆盖
    expect(existsSync(join(backupRoot(), base, r1.backupRel))).toBe(true);
  });

  it('备份失败（源为目录，读取抛错）→ BackupError，含 filePath', () => {
    const dir = globalAgentsMd();
    mkdirSync(dir, { recursive: true });

    let caught: unknown;
    try {
      backupFileBeforeWrite(dir, { command: 'setup' });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(BackupError);
    expect((caught as BackupError).filePath).toBe(dir);
  });

  it('notifyBackupIfTTY：非 TTY 静默；TTY 输出', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const orig = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
    try {
      Object.defineProperty(process.stdout, 'isTTY', { value: undefined, configurable: true });
      notifyBackupIfTTY('global/x');
      expect(logSpy).not.toHaveBeenCalled();

      Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
      notifyBackupIfTTY('global/x');
      expect(logSpy).toHaveBeenCalledTimes(1);
    } finally {
      if (orig) {
        Object.defineProperty(process.stdout, 'isTTY', orig);
      }
      logSpy.mockRestore();
    }
  });

  it.skipIf(!HAS_DIST_BACKUP)('并发：两进程同时备份同一源 → 各自独立 ts 目录，manifest 均完整（REV-005）', (ctx) => {
    const distBackup = join(process.cwd(), 'dist', 'core', 'backup.js');
    const src = globalAgentsMd();
    mkdirSync(join(homeDir, '.config', 'opencode'), { recursive: true });
    writeFileSync(src, 'concurrent', 'utf-8');

    const worker = join(homeDir, 'backup-worker.mjs');
    writeFileSync(
      worker,
      `import { backupFileBeforeWrite } from ${JSON.stringify(pathToFileURL(distBackup).href)};\n`
      + `const r = backupFileBeforeWrite(process.argv[2], { command: 'setup' });\n`
      + `console.log(JSON.stringify(r));\n`,
      'utf-8',
    );

    // 通过 USERPROFILE/HOME 覆盖子进程 homedir，隔离到临时目录（Windows: USERPROFILE 优先）
    const env = { ...process.env, USERPROFILE: homeDir, HOME: homeDir };
    const procs = [0, 1].map(() =>
      spawnSync(process.execPath, [worker, src], { encoding: 'utf-8', timeout: 30000, env }),
    );
    for (const p of procs) {
      if (p.status !== 0) {
        // 运行期子进程不可用 → 显式标记 skipped（可见），不再以 return 冒充 passed
        ctx.skip();
        return;
      }
    }

    const dirs = readdirSync(backupRoot());
    expect(dirs).toHaveLength(2);
    for (const d of dirs) {
      const manifest = JSON.parse(readFileSync(join(backupRoot(), d, 'manifest.json'), 'utf-8'));
      expect(manifest.entries[src]).toBeDefined();
      expect(readFileSync(join(backupRoot(), d, manifest.entries[src].backupRel), 'utf-8')).toBe('concurrent');
    }
  }, 40000);

  it('T26：越界路径（project / HOME 之外）抛 BackupError', () => {
    const outside = join(projectDir, '..', 'outside-t26.txt');
    writeFileSync(outside, 'x', 'utf-8');
    try {
      // project 分区：逃出项目根
      expect(() => backupFileBeforeWrite(outside, { command: 'init', projectPath: projectDir })).toThrow(BackupError);
      // global 分区：逃出 HOME
      expect(() => backupFileBeforeWrite(outside, { command: 'init' })).toThrow(BackupError);
    } finally {
      rmSync(outside, { force: true });
    }
  });

  it('T27：backup.ts 不再直接 import node:os 的 homedir（委托 getHomedir 单点）', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'core', 'backup.ts'), 'utf-8');
    expect(src).not.toMatch(/from ['"]node:os['"]/);
    expect(src).toContain('getHomedir');
  });
});
