/**
 * roadmap 命令错误出口测试（stage-50 op-004 T41）
 * 注入 core 抛错 → 错误模板 + 非 0 退出码 + 无堆栈外泄。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const mockHome = vi.hoisted(() => ({ dir: '' }));
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => mockHome.dir };
});

vi.mock('../../src/core/plan/roadmap.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/plan/roadmap.js')>();
  return {
    ...actual,
    // 保留真实解析器（JSON 用例使用）；仅注入 create/show 的抛错路径
    createRoadmap: () => { throw new Error('boom'); },
    showRoadmap: () => { throw new Error('boom'); },
  };
});

import { Command } from 'commander';
import { registerRoadmapCommand } from '../../src/commands/roadmap.js';
import { setJsonMode, resetJsonModeForTest } from '../../src/commands/shared/json-output.js';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('roadmap 命令错误出口（stage-50 op-004 T41）', () => {
  let tmpDir: string;
  let program: Command;
  let errorMock: ReturnType<typeof vi.fn>;
  let prevExitCode: number | string | undefined;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-roadmap-err-'));
    mockHome.dir = tmpDir;
    prevExitCode = process.exitCode;
    process.exitCode = undefined;
    errorMock = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    program = new Command();
    program.exitOverride();
    registerRoadmapCommand(program);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = prevExitCode;
    rmSync(tmpDir, { recursive: true, force: true });
    mockHome.dir = '';
  });

  it('roadmap show 异常 → 错误模板 + 非 0 退出码 + 无堆栈外泄', async () => {
    try {
      await program.parseAsync(['roadmap', 'show', '1.0'], { from: 'user' });
    } catch {
      // 忽略
    }
    const err = errorMock.mock.calls.map((c) => c[0] as string).join('\n');
    expect(err).toContain('错误');
    expect(err).not.toContain('at ');
    expect(process.exitCode).toBe(1);
  });

  it('roadmap create 异常 → 非 0 退出码', async () => {
    try {
      await program.parseAsync(['roadmap', 'create', '1.0'], { from: 'user' });
    } catch {
      // 忽略
    }
    expect(process.exitCode).toBe(1);
  });

  // ── v1.2.4 A4：roadmap show --json ──

  function writeRoadmap(content: string): void {
    const dir = join(tmpDir, '.openfeel', 'roadmap');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'v1.9.0.md'), content, 'utf-8');
  }

  it('A4 JSON：里程碑键序 + 3 列表头兼容（theme:null）', async () => {
    writeRoadmap([
      '# 分期大纲 v1.9.0',
      '',
      '## 里程碑',
      '',
      '| 里程碑 | 阶段 | 交付物 |',
      '|--------|:--:|--------|',
      '| M1 | stage-1 | 交付一 |',
      '',
      '## 备注',
      '',
    ].join('\n'));

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await program.parseAsync(['roadmap', 'show', 'v1.9.0', '--json'], { from: 'user' });
    const doc = JSON.parse(logSpy.mock.calls.map((c) => c[0] as string).join('\n')) as Record<string, unknown>;

    expect(Object.keys(doc)).toEqual(['schemaVersion', 'version', 'milestones']);
    expect(doc.version).toBe('1.9.0');
    const milestones = doc.milestones as Array<Record<string, unknown>>;
    expect(Object.keys(milestones[0])).toEqual(['title', 'theme', 'stage', 'deliverable']);
    expect(milestones[0]).toEqual({ title: 'M1', theme: null, stage: 'stage-1', deliverable: '交付一' });
  });

  it('A4 JSON：不传版本 → null/[]；版本不存在 → INVALID_ARGUMENT/refusal/1', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await program.parseAsync(['roadmap', 'show', '--json'], { from: 'user' });
    const none = JSON.parse(logSpy.mock.calls.map((c) => c[0] as string).join('\n'));
    expect(none).toEqual({ schemaVersion: 1, version: null, milestones: [] });

    logSpy.mockClear();
    setJsonMode(true);
    try {
      await program.parseAsync(['roadmap', 'show', '9.9.9', '--json'], { from: 'user' });
    } finally {
      resetJsonModeForTest();
    }
    const fail = JSON.parse(logSpy.mock.calls.map((c) => c[0] as string).join('\n')) as Record<string, unknown>;
    expect(Object.keys(fail)).toEqual(['schemaVersion', 'error']);
    expect((fail.error as Record<string, unknown>).code).toBe('INVALID_ARGUMENT');
    expect((fail.error as Record<string, unknown>).kind).toBe('refusal');
    expect(process.exitCode).toBe(1);
  });
});
