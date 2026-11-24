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

  // ── v1.2.4 A4：lint --json（结构化 issues 与人类输出同源） ──

  it('A4 JSON：lint i18n → target/ok/issues 键序，ok:false + exit 1', async () => {
    logMock.mockClear();
    process.exitCode = undefined;
    await safeParse(['lint', 'i18n', '--json']);

    const raw = logMock.mock.calls.map((c) => c[0] as string).join('\n');
    const doc = JSON.parse(raw) as Record<string, unknown>;
    expect(Object.keys(doc)).toEqual(['schemaVersion', 'target', 'ok', 'issues']);
    expect(doc.target).toBe('i18n');
    // 本文件 mock 注入 zh-only 键 → ok:false，问题路径为中文源文件
    expect(doc.ok).toBe(false);
    const issues = doc.issues as Array<Record<string, unknown>>;
    expect(Object.keys(issues[0])).toEqual(['path', 'message']);
    expect(issues.some((i) => String(i.message).includes('fake.onlyZh'))).toBe(true);
    expect(issues.every((i) => i.path === 'src/core/i18n-data/zh-CN.ts')).toBe(true);
    expect(process.exitCode).toBe(1);
  });

  it('A4 JSON：lint kb 无目录 → ok:true / issues:[] / exit 0', async () => {
    logMock.mockClear();
    process.exitCode = undefined;
    await safeParse(['lint', 'kb', '--json']);

    const raw = logMock.mock.calls.map((c) => c[0] as string).join('\n');
    const doc = JSON.parse(raw) as Record<string, unknown>;
    expect(Object.keys(doc)).toEqual(['schemaVersion', 'target', 'ok', 'issues']);
    expect(doc).toMatchObject({ target: 'kb', ok: true, issues: [] });
    expect(process.exitCode).toBeUndefined();
  });

  it('A4 JSON：lint kb 过期引用 → issues path/message + exit 1', async () => {
    const kbDir = join(tmpDir, '.openfeel', 'kb');
    mkdirSync(kbDir, { recursive: true });
    writeFileSync(join(kbDir, 'patterns.md'), '见 [缺失](missing-file.md)\n', 'utf-8');
    logMock.mockClear();
    process.exitCode = undefined;

    await safeParse(['lint', 'kb', '--json']);

    const raw = logMock.mock.calls.map((c) => c[0] as string).join('\n');
    const doc = JSON.parse(raw) as Record<string, unknown>;
    expect(doc).toMatchObject({ target: 'kb', ok: false });
    const issues = doc.issues as Array<Record<string, unknown>>;
    expect(Object.keys(issues[0])).toEqual(['path', 'message']);
    expect(issues[0].path).toBe('.openfeel/kb/patterns.md');
    expect(String(issues[0].message)).toContain('missing-file.md');
    expect(process.exitCode).toBe(1);
  });

  it('A4 基线：lint kb 人类输出逐字不变（无 schemaVersion）', async () => {
    const kbDir = join(tmpDir, '.openfeel', 'kb');
    mkdirSync(kbDir, { recursive: true });
    writeFileSync(join(kbDir, 'patterns.md'), '无引用内容\n', 'utf-8');
    logMock.mockClear();
    process.exitCode = undefined;
    await safeParse(['lint', 'kb']);
    const out = logMock.mock.calls.map((c) => c[0] as string).join('\n');
    expect(out).toContain('扫描 1 个 kb 文件中的文件引用');
    expect(out).not.toContain('schemaVersion');
  });

  // ── v1.6.0-stage-132 T3：lint fill（空壳清单，advisory，恒 exit 0） ──

  /** 空壳需求正文（骨架形态：两节都是 `（待补充）`） */
  function shellRequirementBody(id: string): string {
    return [
      `# ${id}：空壳需求`,
      '',
      '## 摘要',
      '',
      '（待补充）',
      '',
      '## 目标与验收',
      '',
      '（待补充）',
      '',
    ].join('\n');
  }

  /** 空壳阶段 overview（`## 目标` / `## 操作方案` 都是占位） */
  const SHELL_OVERVIEW = ['## 目标', '', '（待补充）', '', '## 操作方案', '', '（待补充）', ''].join('\n');

  /** 执行 `lint fill --json` 并把 stdout 解析为单文档 */
  async function runFillJson(): Promise<Record<string, unknown>> {
    logMock.mockClear();
    process.exitCode = undefined;
    await safeParse(['lint', 'fill', '--json']);
    const raw = logMock.mock.calls.map((c) => String(c[0])).join('\n');
    return JSON.parse(raw) as Record<string, unknown>;
  }

  it('T3 JSON：全绿 → 七键固定序 + exit 0（fill 是 advisory）', async () => {
    const doc = await runFillJson();
    expect(Object.keys(doc)).toEqual([
      'schemaVersion', 'target', 'ok', 'checked', 'empty', 'missingPlan', 'stageDocs',
    ]);
    expect(doc).toMatchObject({
      target: 'fill',
      ok: true,
      checked: 0,
      empty: [],
      missingPlan: [],
      stageDocs: { overviewEmpty: [], planEmpty: [] },
    });
    // ★ 与 i18n/kb/req 三个目标不同：fill 恒 exit 0
    expect(process.exitCode).toBeUndefined();
  });

  it('T3 JSON：空壳需求 + 缺计划 + 空 overview → ok:false，但 exit 仍为 0', async () => {
    const reqDir = join(tmpDir, '.openfeel', 'requirements');
    mkdirSync(reqDir, { recursive: true });
    writeFileSync(join(reqDir, 'REQ-001.md'), shellRequirementBody('REQ-001'), 'utf-8');
    const stageDir = join(tmpDir, '.openfeel', 'plan', 'v1', 'stage-01');
    mkdirSync(stageDir, { recursive: true });
    writeFileSync(join(stageDir, 'overview.md'), SHELL_OVERVIEW, 'utf-8');

    const doc = await runFillJson();
    expect(doc.ok).toBe(false);
    expect(doc.checked).toBe(1);
    expect(doc.empty).toEqual([
      { id: 'REQ-001', emptySections: ['摘要', '目标与验收'] },
    ]);
    expect(doc.missingPlan).toEqual([{ id: 'REQ-001' }]);
    expect(doc.stageDocs).toEqual({ overviewEmpty: [{ stageId: 'stage-01' }], planEmpty: [] });
    // 仍有空壳也不设置非 0 退出码（存量 48 条不能让 lint 恒红）
    expect(process.exitCode).toBeUndefined();
  });

  it('T3 人类：全绿输出 `fill: OK`；非全绿分组列出（每组最多 20 条 + 总数）', async () => {
    logMock.mockClear();
    process.exitCode = undefined;
    await safeParse(['lint', 'fill']);
    let out = logMock.mock.calls.map((c) => String(c[0])).join('\n');
    expect(out).toContain('fill: OK');
    expect(process.exitCode).toBeUndefined();

    // 25 条空壳需求 → 组头带总数 25，明细仅前 20 条，超出部分以「其余 5 条」收口
    const reqDir = join(tmpDir, '.openfeel', 'requirements');
    mkdirSync(reqDir, { recursive: true });
    for (let i = 1; i <= 25; i += 1) {
      const id = `REQ-${String(i).padStart(3, '0')}`;
      writeFileSync(join(reqDir, `${id}.md`), shellRequirementBody(id), 'utf-8');
    }

    logMock.mockClear();
    process.exitCode = undefined;
    await safeParse(['lint', 'fill']);
    out = logMock.mock.calls.map((c) => String(c[0])).join('\n');
    expect(out).toContain('fill: 发现 50 项（已检查 25 个需求文件）');
    expect(out).toContain('空壳需求（25）:');
    expect(out).toContain('缺需求级计划（25）:');
    expect(out).toContain('REQ-001（摘要、目标与验收）');
    expect(out).toContain('REQ-020');
    expect(out).not.toContain('REQ-021');
    expect(out).toContain('…其余 5 条');
    expect(process.exitCode).toBeUndefined();
  });
});
