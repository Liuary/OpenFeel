/**
 * archive 命令测试（v1.1.2-stage-52 op-010，L2）
 * 覆盖：参数解析 / 错误码 / i18n 输出。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Command, CommanderError } from 'commander';
import { registerArchiveCommand } from '../../src/commands/archive.js';
import { t } from '../../src/core/i18n.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const mockHome = vi.hoisted(() => ({ dir: '' }));
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => mockHome.dir };
});

describe('archive 命令（op-010 L2）', () => {
  let tmpDir: string;
  let program: Command;
  let logMock: ReturnType<typeof vi.fn>;
  let errorMock: ReturnType<typeof vi.fn>;
  let cwdMock: ReturnType<typeof vi.fn>;
  let exitMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-cmd-archive-'));
    mockHome.dir = tmpDir;
    logMock = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorMock = vi.spyOn(console, 'error').mockImplementation(() => {});
    cwdMock = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    exitMock = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    program = new Command();
    program.exitOverride();
    registerArchiveCommand(program);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    mockHome.dir = '';
    logMock.mockRestore();
    errorMock.mockRestore();
    cwdMock.mockRestore();
    exitMock.mockRestore();
  });

  async function safeParse(args: string[]): Promise<void> {
    try {
      await program.parseAsync(args, { from: 'user' });
    } catch (err) {
      if (!(err instanceof CommanderError)) {
        throw err;
      }
    }
  }

  it('缺 <stage> → commander 报错（非 0）', async () => {
    await expect(program.parseAsync(['archive'], { from: 'user' })).rejects.toBeInstanceOf(CommanderError);
  });

  it('阶段不存在 / flow.json 未初始化 → exit 1 + 归档失败文案', async () => {
    errorMock.mockClear();
    exitMock.mockClear();
    await safeParse(['archive', 'stage-01']);
    expect(exitMock).toHaveBeenCalledWith(1);
    expect(errorMock.mock.calls.map((c) => c[0] as string).join('\n')).toContain('归档失败');
  });

  it('i18n：archive 文案 en 无 CJK', () => {
    expect(/[\u4e00-\u9fff]/.test(t('archive.errorArchiveFailedTmpl', 'en', { stage: 's' }))).toBe(false);
    expect(/[\u4e00-\u9fff]/.test(t('help.archive.argstage', 'en'))).toBe(false);
  });
});
