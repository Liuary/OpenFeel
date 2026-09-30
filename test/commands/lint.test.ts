/**
 * lint 命令测试（stage-50 op-002 T17/R1）
 * 断言 lint i18n / lint kb 发现问题时 process.exitCode = 1（对齐 flow health），正常时不设置。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Command } from 'commander';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// mock homedir：隔离 getCliLang 的全局配置读取
const mockHome = vi.hoisted(() => ({ dir: '' }));
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => mockHome.dir };
});

// 构造 zh-only 键（仅覆盖本文件的 lint 视图 allDomains，其余命名导出透传）
vi.mock('../../src/core/i18n-data/zh-CN.js', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  const domains = actual.allDomains as Array<{ name: string; domain: Record<string, unknown> }>;
  return {
    ...actual,
    allDomains: [...domains, { name: 'fake', domain: { only: { key: 'fake.onlyZh', zh: '仅中文', en: '' } } }],
  };
});

import { registerLintCommand } from '../../src/commands/lint.js';

describe('lint 命令（stage-50 op-002 T17/R1）', () => {
  let tmpDir: string;
  let program: Command;
  let logMock: ReturnType<typeof vi.fn>;
  let errorMock: ReturnType<typeof vi.fn>;
  let cwdMock: ReturnType<typeof vi.fn>;
  let prevExitCode: number | string | undefined;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-cmd-lint-'));
    mockHome.dir = tmpDir;
    prevExitCode = process.exitCode;
    logMock = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorMock = vi.spyOn(console, 'error').mockImplementation(() => {});
    cwdMock = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);

    program = new Command();
    program.exitOverride();
    registerLintCommand(program);
  });

  afterEach(() => {
    // 还原退出码，防泄漏到其他用例
    process.exitCode = prevExitCode;
    logMock.mockRestore();
    errorMock.mockRestore();
    cwdMock.mockRestore();
    rmSync(tmpDir, { recursive: true, force: true });
    mockHome.dir = '';
  });

  async function safeParse(args: string[]): Promise<void> {
    await program.parseAsync(args, { from: 'user' });
  }

  it('T17：lint i18n 键不对称 → process.exitCode = 1', async () => {
    await safeParse(['lint', 'i18n']);
    expect(process.exitCode).toBe(1);
  });

  it('T17：lint kb 含过期引用 → process.exitCode = 1', async () => {
    const kbDir = join(tmpDir, '.openfeel', 'kb');
    mkdirSync(kbDir, { recursive: true });
    writeFileSync(join(kbDir, 'patterns.md'), '见 [缺失](missing-file.md)\n', 'utf-8');
    process.exitCode = undefined;
    await safeParse(['lint', 'kb']);
    expect(process.exitCode).toBe(1);
  });

  it('T17：lint kb 无过期引用 → 不设置非 0 退出码', async () => {
    const kbDir = join(tmpDir, '.openfeel', 'kb');
    mkdirSync(kbDir, { recursive: true });
    writeFileSync(join(kbDir, 'patterns.md'), '无引用内容\n', 'utf-8');
    process.exitCode = undefined;
    await safeParse(['lint', 'kb']);
    expect(process.exitCode).toBeUndefined();
  });
});
