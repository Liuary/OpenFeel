/**
 * migrate 命令层测试（stage-39 / op-001）
 * 断言 dry-run / 执行 / rollback --dry-run 的命令输出（隔离 HOME）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// mock homedir，避免命令执行污染真实全局目录（REV-1204③）
const mockHome = vi.hoisted(() => ({ dir: '' }));
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => mockHome.dir };
});

import { Command } from 'commander';
import { registerMigrateCommand } from '../../src/commands/migrate.js';
import { t } from '../../src/core/i18n.js';
import { mkdtempSync, rmSync, mkdirSync, readdirSync, statSync, copyFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const FIXTURE = resolve(process.cwd(), 'test', 'fixtures', 'legacy-project');

/** 递归复制目录 */
function copyDirSync(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true });
  for (const name of readdirSync(src)) {
    const s = join(src, name);
    const d = join(dest, name);
    if (statSync(s).isDirectory()) { copyDirSync(s, d); } else { copyFileSync(s, d); }
  }
}

describe('migrate 命令', () => {
  let homeDir: string;
  let proj: string;
  let logs: string[];
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    homeDir = mkdtempSync(join(tmpdir(), 'openfeel-cmd-home-'));
    mockHome.dir = homeDir;
    proj = mkdtempSync(join(tmpdir(), 'openfeel-cmd-proj-'));
    copyDirSync(FIXTURE, proj);
    logs = [];
    logSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => { logs.push(args.map(String).join(' ')); });
  });

  afterEach(() => {
    logSpy.mockRestore();
    rmSync(proj, { recursive: true, force: true });
    rmSync(homeDir, { recursive: true, force: true });
  });

  function makeCli(): Command {
    const cmd = new Command();
    cmd.exitOverride();
    registerMigrateCommand(cmd);
    return cmd;
  }

  it('migrate --dry-run 输出 DRY-RUN 标题与检测报告，且不写盘', async () => {
    const cmd = makeCli();
    await cmd.parseAsync(['node', 'openfeel', 'migrate', proj, '--dry-run']);
    const out = logs.join('\n');
    expect(out).toContain(t('migrate.detect.dryRunTitle', 'zh-CN'));
    expect(out).toContain(t('migrate.detect.title', 'zh-CN'));
    // 未写盘：framework 文件仍在
    expect(existsSync(join(proj, '.opencode', 'agents', 'planner.md'))).toBe(true);
  });

  it('migrate 执行输出迁移完成 + 备份目录', async () => {
    const cmd = makeCli();
    await cmd.parseAsync(['node', 'openfeel', 'migrate', proj]);
    const out = logs.join('\n');
    expect(out).toContain(t('migrate.legacy.done', 'zh-CN'));
    expect(existsSync(join(proj, '.opencode', 'agents', 'planner.md'))).toBe(false);
  });

  it('migrate rollback --dry-run 输出回滚预览列表，不写盘', async () => {
    // 先执行迁移
    const cli1 = makeCli();
    await cli1.parseAsync(['node', 'openfeel', 'migrate', proj]);
    logs = [];
    // rollback 以 cwd 为项目根
    const prevCwd = process.cwd();
    process.chdir(proj);
    try {
      const cmd = makeCli();
      await cmd.parseAsync(['node', 'openfeel', 'migrate', 'rollback', '--dry-run']);
    } finally {
      process.chdir(prevCwd);
    }
    const out = logs.join('\n');
    expect(out).toContain(t('migrate.rollback.dryRunTitle', 'zh-CN'));
    expect(out).toContain('planner.md');
    // dry-run 未恢复：framework 文件仍缺失
    expect(existsSync(join(proj, '.opencode', 'agents', 'planner.md'))).toBe(false);
  });

  it('T52：非项目根执行 rollback → wrongDir 文案 + exit 1（不静默指向 cwd）', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'openfeel-cmd-empty-'));
    const prevCwd = process.cwd();
    let thrown: unknown;
    const errLines: string[] = [];
    const errSpy = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { errLines.push(a.map(String).join(' ')); });
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`__EXIT__${code ?? 0}`);
    }) as never);
    process.chdir(empty);
    try {
      const cmd = makeCli();
      try {
        await cmd.parseAsync(['node', 'openfeel', 'migrate', 'rollback']);
      } catch (err) {
        thrown = err;
      }
    } finally {
      process.chdir(prevCwd);
      errSpy.mockRestore();
      exitSpy.mockRestore();
      rmSync(empty, { recursive: true, force: true });
    }
    expect((thrown as Error)?.message).toBe('__EXIT__1');
    expect(errLines.join('\n')).toContain(t('migrate.rollback.wrongDir', 'zh-CN'));
  });
});
