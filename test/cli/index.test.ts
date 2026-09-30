/**
 * cli/index applyHelpI18n 测试（stage-50 op-004 T38）
 * 断言 walkCmd 遍历 command.arguments，en 下 argument 描述为英文（无 CJK）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Command } from 'commander';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const mockHome = vi.hoisted(() => ({ dir: '' }));
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => mockHome.dir };
});

import { applyHelpI18n } from '../../src/cli/index.js';
import { registerStageCommand } from '../../src/commands/stage.js';

describe('applyHelpI18n（stage-50 op-004 T38）', () => {
  let tmpDir: string;
  let cwdMock: ReturnType<typeof vi.fn>;
  let warnMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-cli-i18n-'));
    mkdirSync(join(tmpDir, '.openfeel'), { recursive: true });
    writeFileSync(join(tmpDir, '.openfeel', '.info.json'), JSON.stringify({ user: 't', lang: 'en' }), 'utf-8');
    mockHome.dir = tmpDir;
    cwdMock = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    warnMock = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    cwdMock.mockRestore();
    warnMock.mockRestore();
    rmSync(tmpDir, { recursive: true, force: true });
    mockHome.dir = '';
  });

  it('T38：walkCmd 遍历 arguments，en 下 stage create 的 argument 描述为英文（无 CJK）', () => {
    const program = new Command();
    program.name('openfeel').description('x');
    registerStageCommand(program);
    applyHelpI18n(program);

    const stage = program.commands.find((c) => c.name() === 'stage');
    expect(stage).toBeDefined();
    const create = stage!.commands.find((c) => c.name() === 'create');
    expect(create).toBeDefined();
    const arg = create!.registeredArguments[0];
    expect(arg.name()).toBe('stageId');
    expect(arg.description).toBeTruthy();
    expect(arg.description).not.toMatch(/[\u4e00-\u9fff]/);
    expect(arg.description).toContain('Stage ID');
  });
});
