/**
 * `lint req` 命令层测试（v1.5.6-stage-115 op-002 / op-003）
 *
 * 树来源纪律（REV 修正）：直接 import **生产同源**的 `program as rootProgram`
 * （`src/cli/index.ts` 已在模块顶层注册全部 19 组命令）——**不得**用
 * `new Command()` + 仅 `registerLintCommand`（那样树只有 lint 组，`stage deps` 会被误判）。
 *
 * 用例归属：C1~C9 / C11 / C13 / C14（fixture 级）= op-002；
 * C10（全部真实正文 exit 0）与 C12（反向 7A/3B）= op-003 验收（依赖正文改正）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CommanderError } from 'commander';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// mock homedir：隔离 getCliLang 的全局配置读取（否则宿主 ~/.config/openfeel 可注入语言）
const mockHome = vi.hoisted(() => ({ dir: '' }));
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => mockHome.dir };
});

import { program as rootProgram } from '../../src/cli/index.js';
import { lintRequirements, toCommandTree } from '../../src/core/lint-req.js';

/** 真实工作区（C10/C12 用；与 cwd mock 分离） */
const REAL_CWD = process.cwd();
const REAL_REQ_DIR = join(REAL_CWD, '.openfeel', 'requirements');

describe('lint req 命令层（stage-115）', () => {
  let tmpDir: string;
  let logMock: ReturnType<typeof vi.fn>;
  let errorMock: ReturnType<typeof vi.fn>;
  let cwdMock: ReturnType<typeof vi.fn>;
  let prevExitCode: number | string | undefined;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-cmd-lint-req-'));
    mockHome.dir = mkdtempSync(join(tmpdir(), 'openfeel-cmd-lint-req-home-'));
    prevExitCode = process.exitCode;
    process.exitCode = 0;
    logMock = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorMock = vi.spyOn(console, 'error').mockImplementation(() => {});
    cwdMock = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
  });

  afterEach(() => {
    process.exitCode = prevExitCode;
    logMock.mockRestore();
    errorMock.mockRestore();
    cwdMock.mockRestore();
    rmSync(tmpDir, { recursive: true, force: true });
    rmSync(mockHome.dir, { recursive: true, force: true });
    mockHome.dir = '';
  });

  // ── 夹具与执行助手 ──

  /** 写入 `.openfeel/requirements/<name>`（默认覆盖式写） */
  function writeReq(name: string, content: string): void {
    const dir = join(tmpDir, '.openfeel', 'requirements');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, name), content, 'utf-8');
  }

  /** 清空需求目录（模拟「无需求文件」） */
  function removeReqDir(): void {
    rmSync(join(tmpDir, '.openfeel', 'requirements'), { recursive: true, force: true });
  }

  async function safeParse(args: string[]): Promise<void> {
    try {
      await rootProgram.parseAsync(args, { from: 'user' });
    } catch (err) {
      if (!(err instanceof CommanderError)) {
        throw err;
      }
    }
  }

  /** 执行 `lint req --json` 并把 stdout 解析为单文档 */
  async function runJson(): Promise<Record<string, unknown>> {
    logMock.mockClear();
    errorMock.mockClear();
    process.exitCode = 0;
    await safeParse(['lint', 'req', '--json']);
    const raw = logMock.mock.calls.map((c) => String(c[0])).join('\n');
    return JSON.parse(raw) as Record<string, unknown>;
  }

  /** 执行 `lint req`（人类输出）并返回 stdout 文本 */
  async function runHuman(): Promise<string> {
    logMock.mockClear();
    errorMock.mockClear();
    process.exitCode = 0;
    await safeParse(['lint', 'req']);
    return logMock.mock.calls.map((c) => String(c[0])).join('\n');
  }

  /** 执行 `lint req` 并返回 stderr 文本 */
  async function runStderr(): Promise<string> {
    errorMock.mockClear();
    await safeParse(['lint', 'req']);
    return errorMock.mock.calls.map((c) => String(c[0])).join('\n');
  }

  const JSON_KEYS = [
    'schemaVersion', 'target', 'ok', 'issues', 'suspects', 'unknownCount', 'suspectCount',
  ];

  // ── op-002：fixture 级 ──

  it('C1：目录缺失 / 空目录 → ok:true、issues:[]、suspects:[] + exit 0', async () => {
    removeReqDir();
    const missing = await runJson();
    expect(Object.keys(missing)).toEqual(JSON_KEYS);
    expect(missing).toMatchObject({
      target: 'req', ok: true, issues: [], suspects: [], unknownCount: 0, suspectCount: 0,
    });
    expect(process.exitCode).toBe(0);

    mkdirSync(join(tmpDir, '.openfeel', 'requirements'), { recursive: true });
    const empty = await runJson();
    expect(empty).toMatchObject({ ok: true, issues: [], suspects: [] });
    expect(process.exitCode).toBe(0);
  });

  it('C2：真缺陷 6 例（4 A + 2 B，逐条按类落键）', async () => {
    const cases: Array<{ span: string; kind: 'A' | 'B' }> = [
      { span: 'stage deps', kind: 'A' },
      { span: 'stage reset', kind: 'A' },
      { span: 'stage remove', kind: 'A' },
      // ★ REV-020：`archive <stage>` 声明位置参数 → 「参数写成命令名」降级为 B 类
      { span: 'archive create', kind: 'B' },
      { span: 'op create', kind: 'B' },
      { span: 'op publish', kind: 'B' },
    ];
    for (const c of cases) {
      writeReq('REQ-901.md', `执行 \`${c.span}\` 即可。\n`);
      const d = await runJson();
      const issues = d.issues as Array<Record<string, unknown>>;
      const suspects = d.suspects as Array<Record<string, unknown>>;
      if (c.kind === 'A') {
        expect(issues, c.span).toHaveLength(1);
        expect(suspects, c.span).toHaveLength(0);
        expect(String(issues[0].message), c.span).toContain(c.span);
        expect(d.ok, c.span).toBe(false);
        expect(process.exitCode, c.span).toBe(1);
      } else {
        expect(issues, c.span).toHaveLength(0);
        expect(suspects, c.span).toHaveLength(1);
        expect(String(suspects[0].message), c.span).toContain(c.span);
        expect(d.ok, c.span).toBe(true);
        expect(process.exitCode, c.span).toBe(0);
      }
    }
  });

  it('C3：A 类进 issues → ok:false、issues 1、suspects 空、unknownCount 1、exit 1', async () => {
    writeReq('REQ-902.md', '用 `stage deps` 写依赖。\n');
    const d = await runJson();
    const issues = d.issues as Array<Record<string, unknown>>;
    expect(d.ok).toBe(false);
    expect(issues).toHaveLength(1);
    expect(d.suspects).toEqual([]);
    expect(d.unknownCount).toBe(1);
    expect(d.suspectCount).toBe(0);
    expect(Object.keys(issues[0])).toEqual(['path', 'message']);
    expect(issues[0].path).toBe('.openfeel/requirements/REQ-902.md');
    // message 含 span 与断点；措辞为「无法解析为命令路径」；且不含任何近似纠错建议
    const msg = String(issues[0].message);
    expect(msg).toContain('stage deps');
    expect(msg).toContain('无法解析为命令路径');
    expect(msg).toContain('断在 `stage`');
    expect(msg).not.toMatch(/你是不是想写|did you mean/);
    expect(process.exitCode).toBe(1);
  });

  it('C4：B 类进 suspects → ok:true、issues:[]、suspects 2、exit 0；成功态人类输出也展示 suspects', async () => {
    writeReq('REQ-903.md', '用 `op create` 建方案，再 `op publish`。\n');
    const d = await runJson();
    expect(d.ok).toBe(true);
    expect(d.issues).toEqual([]);
    expect(d.suspects).toHaveLength(2);
    expect(d.suspectCount).toBe(2);
    expect(process.exitCode).toBe(0);

    // 成功态：首行 ✅ + 逐条 suspects 行（否则「✅ 未发现…」会盖住低置信提示）
    const text = await runHuman();
    expect(text).toContain('✅');
    expect(text).toContain('op create');
    expect(text).toContain('op publish');
    expect(process.exitCode).toBe(0);
  });

  it('C5：零误报 4 例（plan scheme / stage / flow review / openfeel config get）', async () => {
    writeReq(
      'REQ-904.md',
      '`plan scheme` / `stage` / `flow review` / `openfeel config get`\n',
    );
    const d = await runJson();
    expect(d.ok).toBe(true);
    expect(d.issues).toEqual([]);
    expect(d.suspects).toEqual([]);
    expect(process.exitCode).toBe(0);
  });

  it('C6：行内标记 → exit 0 且首行含「抑制 1 行」', async () => {
    writeReq('REQ-905.md', '`stage deps` <!-- lint-req:ignore -->\n');
    const text = await runHuman();
    expect(text).toContain('抑制 1 行');
    expect(process.exitCode).toBe(0);
  });

  it('C7：区间标记 → exit 0（区间内 A 类全跳过）', async () => {
    writeReq(
      'REQ-906.md',
      [
        '<!-- lint-req:ignore-start -->',
        '`stage deps`',
        '`archive create`',
        '<!-- lint-req:ignore-end -->',
        '',
      ].join('\n'),
    );
    const d = await runJson();
    expect(d.ok).toBe(true);
    expect(d.issues).toEqual([]);
    expect(process.exitCode).toBe(0);
  });

  it('C8：未闭合区间 → exit 0 + stderr 含未闭合警告 + 首行抑制行数 > 0（REV-011）', async () => {
    writeReq(
      'REQ-907.md',
      [
        '<!-- lint-req:ignore-start -->',
        '`stage deps`',
        '无 end 直到文件末尾',
        '',
      ].join('\n'),
    );
    const text = await runHuman();
    expect(text).toContain('抑制');
    expect(text).not.toContain('抑制 0 行');
    expect(process.exitCode).toBe(0);

    const err = await runStderr();
    expect(err).toContain('区间标记未闭合');
    expect(err).toContain('REQ-907.md');
    expect(process.exitCode).toBe(0);

    // ★ REV-020 low#4：`--json` + 未闭合区间 → stdout 恰一个 7 键文档、stderr 一行警告、exit 0
    process.exitCode = 0;
    const d = await runJson();
    expect(Object.keys(d)).toEqual(JSON_KEYS);
    expect(d).toMatchObject({
      target: 'req', ok: true, issues: [], suspects: [], unknownCount: 0, suspectCount: 0,
    });
    const jsonErr = errorMock.mock.calls.map((c) => String(c[0])).join('\n');
    expect(jsonErr).toContain('区间标记未闭合');
    expect(jsonErr.trim().split('\n')).toHaveLength(1);
    expect(process.exitCode).toBe(0);
  });

  it('C9：--json 七键形状（键序 / 元素两键 / 无 suppressed/unclosed 键）', async () => {
    removeReqDir();
    const empty = await runJson();
    expect(Object.keys(empty)).toEqual(JSON_KEYS);
    expect(empty).toMatchObject({
      schemaVersion: 1, target: 'req', ok: true, issues: [], suspects: [],
      unknownCount: 0, suspectCount: 0,
    });
    expect(empty).not.toHaveProperty('suppressed');
    expect(empty).not.toHaveProperty('unclosed');

    writeReq('REQ-908.md', '`stage deps` 与 `op create`\n');
    const d = await runJson();
    expect(Object.keys(d)).toEqual(JSON_KEYS);
    expect(d.target).toBe('req');
    expect(d.ok).toBe(false);
    const issues = d.issues as Array<Record<string, unknown>>;
    const suspects = d.suspects as Array<Record<string, unknown>>;
    expect(Object.keys(issues[0])).toEqual(['path', 'message']);
    expect(Object.keys(suspects[0])).toEqual(['path', 'message']);
    expect(typeof d.unknownCount).toBe('number');
    expect(typeof d.suspectCount).toBe('number');
    // 抑制统计与未闭合警告不进 JSON
    expect(Object.keys(d)).toHaveLength(7);
    process.exitCode = 0;
  });

  it('C11：A+B 混合不串键（issues 1 / suspects 1 / ok:false / exit 1）', async () => {
    writeReq('REQ-909.md', '`stage deps` 与 `op create`\n');
    const d = await runJson();
    expect(d.ok).toBe(false);
    expect(d.issues).toHaveLength(1);
    expect(d.suspects).toHaveLength(1);
    expect(d.unknownCount).toBe(1);
    expect(d.suspectCount).toBe(1);
    expect(process.exitCode).toBe(1);
  });

  it('C13：退化边界（flwo stage set → suspects 且 exit 0；stagee deps → 完全静默；值位拼错子命令 → 静默锁定）', async () => {
    writeReq('REQ-910.md', '`flwo stage set`\n');
    const typo = await runJson();
    expect(typo.issues).toEqual([]);
    expect(typo.suspects).toHaveLength(1);
    expect(typo.suspectCount).toBe(1);
    expect(process.exitCode).toBe(0);

    writeReq('REQ-910.md', '`stagee deps`\n');
    const silent = await runJson();
    expect(silent.issues).toEqual([]);
    expect(silent.suspects).toEqual([]);
    expect(process.exitCode).toBe(0);

    // ★ low-3：带参数 + 子命令节点（`flow.archive` 1 参数 2 子命令 / `migrate` 1 参数 1 子命令）
    // 的**值位拼写错误** → 判为参数值、静默通过；这是刻意取舍（见 §16.2 已知边界），此处锁住行为。
    writeReq('REQ-910.md', '`flow archive lst`\n');
    const archiveTypo = await runJson();
    expect(archiveTypo.issues).toEqual([]);
    expect(archiveTypo.suspects).toEqual([]);
    expect(archiveTypo.ok).toBe(true);
    expect(process.exitCode).toBe(0);

    writeReq('REQ-910.md', '`migrate rollbak`\n');
    const migrateTypo = await runJson();
    expect(migrateTypo.issues).toEqual([]);
    expect(migrateTypo.suspects).toEqual([]);
    expect(migrateTypo.ok).toBe(true);
    expect(process.exitCode).toBe(0);
  });

  it('C14：空文件 / 同行双候选（两硬 A → 2 条 issues；A+B → 两键各一）', async () => {
    writeReq('REQ-911.md', '');
    const empty = await runJson();
    expect(empty.ok).toBe(true);
    expect(empty.issues).toEqual([]);
    expect(empty.suspects).toEqual([]);

    // REV-020：`archive create` 属参数歧义 → B；这里用两个硬 A（stage deps / stage remove）
    writeReq('REQ-911.md', '`stage deps` 与 `stage remove`\n');
    const twoA = await runJson();
    expect(twoA.issues).toHaveLength(2);
    expect(twoA.suspects).toEqual([]);
    expect(process.exitCode).toBe(1);

    writeReq('REQ-911.md', '`stage deps` 与 `op create`\n');
    const mixed = await runJson();
    expect(mixed.issues).toHaveLength(1);
    expect(mixed.suspects).toHaveLength(1);
    process.exitCode = 0;
  });

  it('C15：REV-020 参数起点 11 条期望行为表（CLI 端到端：ok / 分类 / exit）', async () => {
    const rows: Array<{ span: string; want: 'pass' | 'A' | 'B'; exit: number }> = [
      { span: 'openfeel stage set stage-01 --workflow-mode full', want: 'pass', exit: 0 },
      { span: 'openfeel config set-lang en', want: 'pass', exit: 0 },
      { span: 'openfeel config get workflow_mode', want: 'pass', exit: 0 },
      { span: 'openfeel model get openfeel-executor', want: 'pass', exit: 0 },
      { span: 'openfeel req add lint-check', want: 'pass', exit: 0 },
      { span: 'openfeel archive create', want: 'B', exit: 0 },
      { span: 'openfeel knowledge search lint', want: 'B', exit: 0 },
      { span: 'stage deps', want: 'A', exit: 1 },
      { span: 'flow config_sync_stage', want: 'A', exit: 1 },
      { span: 'flow review_add', want: 'A', exit: 1 },
      { span: 'flow stats --json', want: 'A', exit: 1 },
    ];
    for (const row of rows) {
      writeReq('REQ-912.md', `\`${row.span}\`\n`);
      const d = await runJson();
      const issues = d.issues as Array<Record<string, unknown>>;
      const suspects = d.suspects as Array<Record<string, unknown>>;
      expect(Object.keys(d), row.span).toEqual(JSON_KEYS);
      if (row.want === 'pass') {
        expect(issues, row.span).toEqual([]);
        expect(suspects, row.span).toEqual([]);
        expect(d.ok, row.span).toBe(true);
      } else if (row.want === 'A') {
        expect(issues, row.span).toHaveLength(1);
        expect(suspects, row.span).toEqual([]);
        expect(String(issues[0].message), row.span).toContain('无法解析为命令路径');
        expect(d.ok, row.span).toBe(false);
      } else {
        expect(issues, row.span).toEqual([]);
        expect(suspects, row.span).toHaveLength(1);
        expect(String(suspects[0].message), row.span).toContain('疑似把参数写成命令名');
        expect(d.ok, row.span).toBe(true);
      }
      expect(process.exitCode, row.span).toBe(row.exit);
      process.exitCode = 0;
    }
  });

  // ── op-003 验收（REV-012：依赖正文改正，故不放 op-002） ──

  it('C10：全部真实正文 exit 0（不 mock cwd 到 tmp；份数取实测，不硬编码；suspects 只记录不断言）', async () => {
    // 反守卫：真实工作区的「份数」用 core 直接算（不经 cwd mock），只断言 > 0
    const realReport = lintRequirements(REAL_CWD, toCommandTree(rootProgram), 'zh-CN');
    expect(realReport.files).toBeGreaterThan(0);

    cwdMock.mockReturnValue(REAL_CWD);
    const d = await runJson();
    expect(d.ok).toBe(true);
    expect(d.issues).toEqual([]);
    expect(d.unknownCount).toBe(0);
    // B 类为 advisory：今后正文出现 `npm run lint` 之类外部工具引用不应让本用例变红，
    // 故只记录 suspectCount 并断言其为 number（不断言 0）。
    expect(typeof d.suspectCount).toBe('number');
    expect(process.exitCode).toBe(0);
  });

  it('C12：反向用例 —— 去掉 REQ-017 全部行尾标记 → 7A/6B（5 唯一硬 A 名）；原文件 0/0', async () => {
    const original = readFileSync(join(REAL_REQ_DIR, 'REQ-017.md'), 'utf-8');
    // 正控：原文件（带标记）→ 0/0
    expect(original).toContain('<!-- lint-req:ignore -->');
    writeReq('REQ-017.md', original);
    const before = await runJson();
    expect(before.unknownCount).toBe(0);
    expect(before.suspectCount).toBe(0);
    expect(process.exitCode).toBe(0);

    // 反向：删掉全部行内标记 → 标记失效就必须全量报出（否则标记没起作用）。
    // 数值是 REQ-017 **自身示例行**的快照（正文改动会同时改变候选与来数，届时同步更新本断言）：
    // A = step deps/reset（L11）+ flow review_add / flow stats --json（目标 2 示例行）；
    // B = op create（L11）+ archive create ×3（REV-020 后归 B）。
    writeReq('REQ-017.md', original.replace(/<!-- lint-req:ignore -->/g, ''));
    const after = await runJson();
    expect(after.unknownCount).toBe(4);
    expect(after.suspectCount).toBe(4);
    expect(after.ok).toBe(false);
    const issues = after.issues as Array<Record<string, unknown>>;
    const spans = new Set(issues.map((i) => /`([^`]+)`/.exec(String(i.message))?.[1]));
    expect([...spans].sort()).toEqual([
      'flow review_add', 'flow stats --json', 'stage deps', 'stage reset',
    ]);
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
  });
});
