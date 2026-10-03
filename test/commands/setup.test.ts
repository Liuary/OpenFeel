/**
 * setup 命令测试（stage-50 op-005 T46，命令层覆盖补齐）
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const mockHome = vi.hoisted(() => ({ dir: '' }));
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => mockHome.dir };
});

import { Command } from 'commander';
import { registerSetupCommand } from '../../src/commands/setup.js';
import { getOpenfeelVersion } from '../../src/core/update-state.js';
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
    logMock = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    program = new Command();
    program.exitOverride();
    registerSetupCommand(program);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = prevExitCode;
    rmSync(homeDir, { recursive: true, force: true });
    mockHome.dir = '';
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
});
