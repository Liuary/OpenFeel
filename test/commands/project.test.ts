/**
 * project 命令测试（v1.1.2-stage-52 op-010，L2）
 * 覆盖：overview 正常输出 / help 可渲染 / i18n。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Command, CommanderError } from 'commander';
import { registerProjectCommand } from '../../src/commands/project.js';
import { t } from '../../src/core/i18n.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const mockHome = vi.hoisted(() => ({ dir: '' }));
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => mockHome.dir };
});

describe('project 命令（op-010 L2）', () => {
  let tmpDir: string;
  let program: Command;
  let logMock: ReturnType<typeof vi.fn>;
  let errorMock: ReturnType<typeof vi.fn>;
  let cwdMock: ReturnType<typeof vi.fn>;
  let exitMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-cmd-project-'));
    mockHome.dir = tmpDir;
    logMock = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorMock = vi.spyOn(console, 'error').mockImplementation(() => {});
    cwdMock = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    exitMock = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    program = new Command();
    program.exitOverride();
    registerProjectCommand(program);
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

  it('project overview 正常输出（exit 0，含标题）', async () => {
    await safeParse(['project', 'overview']);
    expect(exitMock).not.toHaveBeenCalled();
    expect(logMock.mock.calls.map((c) => c[0] as string).join('\n')).toContain('OpenFeel');
  });

  it('project 子命令含 overview（help 可渲染）', () => {
    const project = program.commands.find((c) => c.name() === 'project');
    expect(project).toBeDefined();
    expect(project!.commands.map((c) => c.name())).toContain('overview');
  });

  it('i18n：project 文案 en 无 CJK', () => {
    expect(/[\u4e00-\u9fff]/.test(t('project.overview.title', 'en'))).toBe(false);
    expect(/[\u4e00-\u9fff]/.test(t('help.project.overview', 'en'))).toBe(false);
  });
});
