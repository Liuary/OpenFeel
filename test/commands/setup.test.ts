/**
 * setup 命令测试（stage-50 op-005 T46，命令层覆盖补齐）
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const mockHome = vi.hoisted(() => ({ dir: '' }));
const childState = vi.hoisted(() => ({ queue: [] as number[] }));
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => mockHome.dir };
});
vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(() => ({ status: childState.queue.shift() ?? 0, stdout: '', stderr: '' })),
}));

import { Command } from 'commander';
import { registerSetupCommand } from '../../src/commands/setup.js';
import { resetJsonModeForTest, setJsonMode } from '../../src/commands/shared/json-output.js';
import { getOpenfeelVersion } from '../../src/core/update-state.js';
import { resetBackupSetCache } from '../../src/core/backup.js';
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/** 在隔离 HOME 下写入全局 update_state.json（供 --check 检测） */
function writeGlobalState(homeDir: string, v: string): void {
  mkdirSync(join(homeDir, '.openfeel'), { recursive: true });
  writeFileSync(
    join(homeDir, '.openfeel', 'update_state.json'),
    JSON.stringify({ version: '1.0', last_update: '', openfeel_version: v, files: {} }, null, 2) + '\n',
    'utf-8',
  );
}

/** 写入一个 DSH profile package.json */
function writeDshProfile(dshHome: string, name: string, json: Record<string, unknown>): string {
  const dir = join(dshHome, 'profiles', name);
  mkdirSync(dir, { recursive: true });
  const pkg = join(dir, 'package.json');
  writeFileSync(pkg, `${JSON.stringify(json, null, 2)}\n`, 'utf-8');
  return pkg;
}

/** DSH profile 基础结构 */
function baseDshProfile(): Record<string, unknown> {
  return { name: 'dsh-profile', private: true, dependencies: {}, dsh: { profile: { bundles: [] } } };
}

describe('setup 命令（stage-50 op-005 T46）', () => {
  let homeDir: string;
  let program: Command;
  let logMock: ReturnType<typeof vi.fn>;
  let prevExitCode: number | string | undefined;

  beforeEach(() => {
    homeDir = mkdtempSync(join(tmpdir(), 'openfeel-cmd-setup-'));
    mockHome.dir = homeDir;
    prevExitCode = process.exitCode;
    process.exitCode = undefined;
    delete process.env.CLAUDE_CONFIG_DIR;
    delete process.env.DSH_HOME;
    childState.queue = [];
    resetJsonModeForTest();
    resetBackupSetCache();
    logMock = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    program = new Command();
    program.exitOverride();
    registerSetupCommand(program);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetJsonModeForTest();
    process.exitCode = prevExitCode;
    delete process.env.DSH_HOME;
    childState.queue = [];
    rmSync(homeDir, { recursive: true, force: true });
    mockHome.dir = '';
    delete process.env.CLAUDE_CONFIG_DIR;
  });

  it('基本路径：部署全局文件并输出完成（exit 0）', async () => {
    await program.parseAsync(['setup'], { from: 'user' });
    expect(logMock).toHaveBeenCalled();
    // 全局 AGENTS.md 落到 mock HOME
    expect(existsSync(join(homeDir, '.config', 'opencode', 'AGENTS.md'))).toBe(true);
    expect(process.exitCode).toBeUndefined();
  });

  // ── stage-67 op-002：setup --check [--json] 主动诊断 ─────────────────

  it('T5.11 --check 一致 → 退出 0，输出含已部署与 CLI 版本', async () => {
    writeGlobalState(homeDir, getOpenfeelVersion());
    await program.parseAsync(['setup', '--check'], { from: 'user' });
    const out = logMock.mock.calls.map((c) => String(c[0])).join('\n');
    expect(out).toContain(getOpenfeelVersion());
    expect(process.exitCode === 0 || process.exitCode === undefined).toBe(true);
  });

  it('T5.12a --check 不一致 → 退出 1，输出含 openfeel setup', async () => {
    writeGlobalState(homeDir, '1.0.0');
    await program.parseAsync(['setup', '--check'], { from: 'user' });
    expect(process.exitCode).toBe(1);
    const out = logMock.mock.calls.map((c) => String(c[0])).join('\n');
    expect(out).toContain('openfeel setup');
  });

  it('T5.12b --check 缺失 → 退出 1', async () => {
    await program.parseAsync(['setup', '--check'], { from: 'user' });
    expect(process.exitCode).toBe(1);
  });

  it('T5.12c --check unknown（state 损坏）→ 退出 1', async () => {
    mkdirSync(join(homeDir, '.openfeel'), { recursive: true });
    writeFileSync(join(homeDir, '.openfeel', 'update_state.json'), '{ not valid json', 'utf-8');
    await program.parseAsync(['setup', '--check'], { from: 'user' });
    expect(process.exitCode).toBe(1);
  });

  it('T5.13 --check --json 不一致 → 纯 JSON + 退出 1', async () => {
    writeGlobalState(homeDir, '1.0.0');
    await program.parseAsync(['setup', '--check', '--json'], { from: 'user' });
    expect(logMock).toHaveBeenCalledTimes(1);
    const doc = JSON.parse(String(logMock.mock.calls[0][0]));
    expect(doc).toEqual({
      schemaVersion: 1,
      status: 'mismatch',
      cliVersion: getOpenfeelVersion(),
      deployedVersion: '1.0.0',
    });
    expect(process.exitCode).toBe(1);
  });

  it('T5.13b --check --json 一致 → 退出 0', async () => {
    writeGlobalState(homeDir, getOpenfeelVersion());
    await program.parseAsync(['setup', '--check', '--json'], { from: 'user' });
    expect(logMock).toHaveBeenCalledTimes(1);
    const doc = JSON.parse(String(logMock.mock.calls[0][0]));
    expect(doc.status).toBe('ok');
    expect(process.exitCode === 0 || process.exitCode === undefined).toBe(true);
  });

  it('T5.14 --check 只读：state 字节/mtime 不变，且不产生全局部署文件', async () => {
    writeGlobalState(homeDir, '1.0.0');
    const p = join(homeDir, '.openfeel', 'update_state.json');
    const before = readFileSync(p, 'utf-8');
    const mtime = statSync(p).mtimeMs;
    await program.parseAsync(['setup', '--check'], { from: 'user' });
    expect(readFileSync(p, 'utf-8')).toBe(before);
    expect(statSync(p).mtimeMs).toBe(mtime);
    // 零部署：未生成全局 AGENTS.md
    expect(existsSync(join(homeDir, '.config', 'opencode', 'AGENTS.md'))).toBe(false);
  });

  it('T5.15 setup --lang en 无 --check → 仍部署（不短路）', async () => {
    await program.parseAsync(['setup', '--lang', 'en'], { from: 'user' });
    expect(existsSync(join(homeDir, '.config', 'opencode', 'AGENTS.md'))).toBe(true);
    expect(process.exitCode).toBeUndefined();
  });

  // ── stage-71/T4：setup --tools 命令面 ──

  it('stage-71/T4：setup --tools claude → 部署 CLAUDE.md，不触 opencode', async () => {
    await program.parseAsync(['setup', '--tools', 'claude'], { from: 'user' });
    expect(existsSync(join(homeDir, '.claude', 'CLAUDE.md'))).toBe(true);
    expect(existsSync(join(homeDir, '.config', 'opencode', 'AGENTS.md'))).toBe(false);
    expect(process.exitCode === 0 || process.exitCode === undefined).toBe(true);
  });

  it('stage-71/T4：setup --tools foo（非法）→ exit 1 且零写盘', async () => {
    const exitMock = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('__EXIT__');
    }) as never);
    let thrown: unknown;
    try {
      await program.parseAsync(['setup', '--tools', 'foo'], { from: 'user' });
    } catch (err) {
      thrown = err;
    }
    expect((thrown as Error)?.message).toBe('__EXIT__');
    expect(exitMock).toHaveBeenCalledWith(1);
    expect(existsSync(join(homeDir, '.config', 'opencode', 'AGENTS.md'))).toBe(false);
    expect(existsSync(join(homeDir, '.claude'))).toBe(false);
  });

  it('stage-71/T4：默认 setup 不触 ~/.claude 且输出 harness 重启文案', async () => {
    await program.parseAsync(['setup'], { from: 'user' });
    expect(existsSync(join(homeDir, '.claude'))).toBe(false);
    const out = logMock.mock.calls.map((c) => String(c[0])).join('\n');
    expect(out).toContain('opencode');
    expect(out).toContain('harness');
  });

  // ── v1.3.0-stage-101：setup --tools dsh ─────────────────────────────

  it('v1.3.0 setup --tools dsh：写入 link + bundles，纯 dsh 不写 update_state', async () => {
    const dshHome = join(homeDir, '.dsh');
    const pkg = writeDshProfile(dshHome, 'web', baseDshProfile());
    process.env.DSH_HOME = dshHome;
    childState.queue = [0, 0];

    await program.parseAsync(['setup', '--tools', 'dsh'], { from: 'user' });

    expect(process.exitCode === undefined || process.exitCode === 0).toBe(true);
    const json = JSON.parse(readFileSync(pkg, 'utf-8')) as {
      dependencies: Record<string, string>;
      dsh: { profile: { bundles: string[] } };
    };
    expect(json.dependencies['openfeel-dsh']).toMatch(/^link:/);
    expect(json.dsh.profile.bundles).toContain('openfeel-dsh');
    expect(existsSync(join(homeDir, '.openfeel', 'update_state.json'))).toBe(false);
    const out = logMock.mock.calls.map((c) => String(c[0])).join('\n');
    expect(out).toContain('DSH');
    expect(out).toContain('web');
  });

  it('v1.3.0 setup --tools dsh --dsh-profile web：只改指定 profile', async () => {
    const dshHome = join(homeDir, '.dsh');
    const web = writeDshProfile(dshHome, 'web', baseDshProfile());
    const desktop = writeDshProfile(dshHome, 'desktop', baseDshProfile());
    const desktopBefore = readFileSync(desktop, 'utf-8');
    process.env.DSH_HOME = dshHome;
    childState.queue = [0, 0];

    await program.parseAsync(['setup', '--tools', 'dsh', '--dsh-profile', 'web'], { from: 'user' });

    expect(JSON.parse(readFileSync(web, 'utf-8')).dependencies['openfeel-dsh']).toMatch(/^link:/);
    expect(readFileSync(desktop, 'utf-8')).toBe(desktopBefore);
  });

  it('v1.3.0 setup --tools dsh：无 profile → exit 1 零写盘', async () => {
    process.env.DSH_HOME = join(homeDir, '.dsh');
    mkdirSync(join(homeDir, '.dsh', 'profiles'), { recursive: true });
    const exitMock = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('__EXIT__');
    }) as never);
    let thrown: unknown;
    try {
      await program.parseAsync(['setup', '--tools', 'dsh'], { from: 'user' });
    } catch (err) {
      thrown = err;
    }
    expect((thrown as Error)?.message).toBe('__EXIT__');
    expect(exitMock).toHaveBeenCalledWith(1);
  });

  it('v1.3.0 setup --tools dsh --json：预检错误 → INVALID_ARGUMENT envelope', async () => {
    delete process.env.DSH_HOME; // 默认 ~/.dsh（mock HOME 下不存在）
    setJsonMode(true); // parseAsync 不经过 runCli 预扫描，需显式置位
    await program.parseAsync(['setup', '--tools', 'dsh', '--json'], { from: 'user' });
    expect(process.exitCode).toBe(1);
    const doc = JSON.parse(String(logMock.mock.calls[0]?.[0]));
    expect(doc.error.code).toBe('INVALID_ARGUMENT');
    expect(doc.error.kind).toBe('refusal');
    expect(doc.error.detail.reason).toBe('dsh-home-not-found');
  });

  it('v1.3.0 setup --tools dsh：pnpm install 失败 → INTERNAL_ERROR/3 且回滚', async () => {
    const dshHome = join(homeDir, '.dsh');
    const pkg = writeDshProfile(dshHome, 'web', baseDshProfile());
    const before = readFileSync(pkg, 'utf-8');
    process.env.DSH_HOME = dshHome;
    childState.queue = [0, 1]; // --version 0；install 1
    const exitMock = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('__EXIT__');
    }) as never);
    let thrown: unknown;
    try {
      await program.parseAsync(['setup', '--tools', 'dsh'], { from: 'user' });
    } catch (err) {
      thrown = err;
    }
    expect((thrown as Error)?.message).toBe('__EXIT__');
    expect(exitMock).toHaveBeenCalledWith(3);
    expect(readFileSync(pkg, 'utf-8')).toBe(before);
  });

  it('v1.3.0 默认 setup（不含 dsh）不触碰 DSH_HOME', async () => {
    const dshHome = join(homeDir, '.dsh');
    const pkg = writeDshProfile(dshHome, 'web', baseDshProfile());
    const before = readFileSync(pkg, 'utf-8');
    process.env.DSH_HOME = dshHome;
    await program.parseAsync(['setup'], { from: 'user' });
    expect(readFileSync(pkg, 'utf-8')).toBe(before);
  });

  it('v1.3.0 setup --check --tools dsh 早退：不写 DSH profile', async () => {
    const dshHome = join(homeDir, '.dsh');
    const pkg = writeDshProfile(dshHome, 'web', baseDshProfile());
    const before = readFileSync(pkg, 'utf-8');
    process.env.DSH_HOME = dshHome;
    await program.parseAsync(['setup', '--check', '--tools', 'dsh'], { from: 'user' });
    expect(readFileSync(pkg, 'utf-8')).toBe(before);
  });
});
