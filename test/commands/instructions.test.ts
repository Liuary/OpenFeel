/**
 * instructions 命令测试（v1.1.2-stage-52 op-010，L2）
 * 覆盖：--json 纯 JSON / 非法 artifactId 退出码 / i18n。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Command, CommanderError } from 'commander';
import { registerInstructionsCommand } from '../../src/commands/instructions.js';
import { t } from '../../src/core/i18n.js';
import { setJsonMode, resetJsonModeForTest } from '../../src/commands/shared/json-output.js';
import { mkdtempSync, rmSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const mockHome = vi.hoisted(() => ({ dir: '' }));
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => mockHome.dir };
});

const REPO_SCHEMA = fileURLToPath(new URL('../../schemas/spec-driven/schema.yaml', import.meta.url));

describe('instructions 命令（op-010 L2）', () => {
  let tmpDir: string;
  let program: Command;
  let logMock: ReturnType<typeof vi.fn>;
  let errorMock: ReturnType<typeof vi.fn>;
  let cwdMock: ReturnType<typeof vi.fn>;
  let exitMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-cmd-instr-'));
    mockHome.dir = tmpDir;
    logMock = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorMock = vi.spyOn(console, 'error').mockImplementation(() => {});
    cwdMock = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    exitMock = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    program = new Command();
    program.exitOverride();
    registerInstructionsCommand(program);
    // 复制仓库 schema 到临时项目（隔离；避免依赖全局/包内 schema）
    const destDir = join(tmpDir, '.openfeel', 'schemas', 'spec-driven');
    mkdirSync(destDir, { recursive: true });
    copyFileSync(REPO_SCHEMA, join(destDir, 'schema.yaml'));
  });

  afterEach(() => {
    resetJsonModeForTest();
    process.exitCode = 0;
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

  it('缺 --change → commander 报错（requiredOption）', async () => {
    await expect(program.parseAsync(['instructions', 'proposal'], { from: 'user' }))
      .rejects.toBeInstanceOf(CommanderError);
  });

  it('--json 输出纯 JSON 单文档（含 artifact 结构）', async () => {
    await safeParse(['instructions', 'proposal', '--change', 'feat-x', '--json']);
    expect(exitMock).not.toHaveBeenCalled();
    const raw = logMock.mock.calls.map((c) => c[0] as string).join('\n');
    const obj = JSON.parse(raw) as { artifact: { id: string } };
    expect(obj.artifact.id).toBe('proposal');
    // C1（stage-95 op-001）：schemaVersion 首键 + 既有 9 键相对顺序不变
    expect(Object.keys(obj)).toEqual([
      'schemaVersion', 'artifact', 'task', 'project_context', 'rules',
      'dependencies', 'output', 'instruction', 'template', 'unlocks',
    ]);
    expect((obj as { schemaVersion?: number }).schemaVersion).toBe(1);
  });

  it('非法 artifactId → exit 1 + 错误', async () => {
    errorMock.mockClear();
    exitMock.mockClear();
    await safeParse(['instructions', 'nope', '--change', 'feat-x', '--json']);
    expect(exitMock).toHaveBeenCalledWith(1);
    expect(errorMock.mock.calls.map((c) => c[0] as string).join('\n')).toContain('nope');
  });

  it('stage-95 op-002：JSON 模式非法 artifactId → INVALID_ARGUMENT envelope + exit 1', async () => {
    logMock.mockClear();
    errorMock.mockClear();
    exitMock.mockClear();
    process.exitCode = 0;
    setJsonMode(true);
    try {
      await safeParse(['instructions', 'nope', '--change', 'feat-x', '--json']);

      // JSON 模式：不调用 process.exit，仅置退出码
      expect(exitMock).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
      expect(logMock).toHaveBeenCalledTimes(1);
      const doc = JSON.parse(logMock.mock.calls[0][0] as string) as {
        schemaVersion: number;
        error: { code: string; kind: string; message: string; detail: unknown };
      };
      expect(Object.keys(doc)).toEqual(['schemaVersion', 'error']);
      expect(Object.keys(doc.error)).toEqual(['code', 'kind', 'message', 'detail']);
      expect(doc.error.code).toBe('INVALID_ARGUMENT');
      expect(doc.error.kind).toBe('refusal');
      expect(doc.error.detail).toEqual({ artifactId: 'nope', change: 'feat-x' });
      // 人类文案不走 stderr（stdout 单文档）
      expect(errorMock).not.toHaveBeenCalled();
    } finally {
      resetJsonModeForTest();
      process.exitCode = 0;
    }
  });

  it('i18n：instructions 错误/参数文案 en 无 CJK', () => {
    expect(/[\u4e00-\u9fff]/.test(t('common.errorTmpl', 'en', { msg: 'x' }))).toBe(false);
    expect(/[\u4e00-\u9fff]/.test(t('help.instructions.argartifactId', 'en'))).toBe(false);
  });
});
