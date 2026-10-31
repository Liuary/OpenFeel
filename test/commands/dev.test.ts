/**
 * dev 命令测试（v1.5.0）
 *
 * 覆盖：sync 写 AUTO 块 + 元数据；status 只读输出；未初始化拒绝。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Command, CommanderError } from 'commander';
import { registerDevCommand } from '../../src/commands/dev.js';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('dev 命令（v1.5.0）', () => {
  let dir: string;
  let program: Command;
  let logMock: ReturnType<typeof vi.fn>;
  let errorMock: ReturnType<typeof vi.fn>;
  let exitMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'openfeel-dev-cmd-'));
    vi.spyOn(process, 'cwd').mockReturnValue(dir);
    logMock = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorMock = vi.spyOn(console, 'error').mockImplementation(() => {});
    exitMock = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    program = new Command();
    program.exitOverride();
    registerDevCommand(program);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  async function safeParse(args: string[]): Promise<void> {
    try {
      await program.parseAsync(args, { from: 'user' });
    } catch (err) {
      if (!(err instanceof CommanderError)) throw err;
    }
  }

  function seed(): void {
    mkdirSync(join(dir, '.openfeel'), { recursive: true });
    writeFileSync(join(dir, '.openfeel', '.info.json'), JSON.stringify({ user: 'tester' }), 'utf-8');
    writeFileSync(join(dir, '.openfeel', 'flow.json'), JSON.stringify({
      meta: { version: '1.0', project: 'T', updated: '2026-10-31T00:00:00.000Z' },
      pipeline: { phase: 'active', current: { stage: '', op: '' }, retry: 0 },
      stages: {}, reviews: [], log: [],
    }, null, 2) + '\n', 'utf-8');
  }

  it('dev sync → 写 AUTO 块与 .sync.json，输出同步路径', async () => {
    seed();
    await safeParse(['dev', 'sync']);
    expect(exitMock).not.toHaveBeenCalled();
    const file = join(dir, '.openfeel', 'users', 'tester', 'dev_last.md');
    expect(existsSync(file)).toBe(true);
    expect(readFileSync(file, 'utf-8')).toContain('<!-- openfeel:auto:begin -->');
    expect(existsSync(join(dir, '.openfeel', 'dev', '.sync.json'))).toBe(true);
    expect(logMock.mock.calls.map((c) => String(c[0])).join('\n')).toContain('状态已同步');
  });

  it('dev status → 只读显示阶段与上次同步', async () => {
    seed();
    await safeParse(['dev', 'status']);
    const out = logMock.mock.calls.map((c) => String(c[0])).join('\n');
    expect(out).toContain('活跃阶段');
    expect(out).toContain('上次同步');
    expect(out).toContain('30');
  });

  it('未初始化 → exit 1', async () => {
    await safeParse(['dev', 'sync']);
    expect(exitMock).toHaveBeenCalledWith(1);
    expect(errorMock.mock.calls.map((c) => String(c[0])).join('\n')).toContain('未初始化');
  });
});
