/**
 * archive 命令测试（v1.1.2-stage-52 op-010，L2）
 * 覆盖：参数解析 / 错误码 / i18n 输出。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Command, CommanderError } from 'commander';
import { registerArchiveCommand } from '../../src/commands/archive.js';
import { registerFlowCommand } from '../../src/commands/flow.js';
import { archiveStage } from '../../src/core/archive/merge.js';
import { FlowManager, type FlowData } from '../../src/core/flow-manager.js';
import { t } from '../../src/core/i18n.js';
import { setJsonMode, resetJsonModeForTest } from '../../src/commands/shared/json-output.js';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
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
    process.exitCode = 0;
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
    expect(/[\u4e00-\u9fff]/.test(t('help.archive.json', 'en'))).toBe(false);
  });

  // ── stage-52/op-014：REV-009 archive 短名归一化 ──

  /** 构造阶段对象（含 ops） */
  function mkStageObj(name: string, opIds: string[]): Record<string, unknown> {
    const ops: Record<string, unknown> = {};
    for (const id of opIds) {
      ops[id] = {
        id, title: 't', state: 'pending', assignee: 'x', attempts: 0, max_attempts: 3,
        checkpoints: { plan: 'pending', scheme: 'pending', exec: { attempts: 0, self: 'pending' }, review: 'pending', test: 'pending' },
      };
    }
    return { name, phase: 'exec_running', status: 'done', deps: [], ops };
  }

  /** 构造审查条目（op 字段为 reviewOp） */
  function mkReview(id: string, reviewOp: string, status: 'closed' | 'resolved' | 'open'): Record<string, unknown> {
    return { id, op: reviewOp, status, priority: 'high', title: 'k', filed_by: 'r', filed_at: '2026-01-01T00:00:00Z' };
  }

  /** 写入 flow.json（注入数据；`requirements` 为 v1.5.8 需求汇总测试用，缺省空数组） */
  function setupFlow(
    stages: Record<string, unknown>,
    reviews: unknown[] = [],
    requirements: unknown[] = [],
  ): void {
    FlowManager.initFlow(tmpDir);
    const mgr = new FlowManager(tmpDir);
    mgr.setData({
      meta: { version: '1.0', project: 'Test', updated: new Date().toISOString() },
      pipeline: { phase: 'plan_pending', current: { stage: '', op: '' }, retry: 0 },
      stages,
      reviews,
      requirements,
      log: [],
    } as unknown as FlowData);
    mgr.save();
  }

  it('op-014/T1: archive 短名 → exit 0（此前「归档失败」exit 1）', async () => {
    setupFlow({ 'v1.0.0-stage-01': mkStageObj('v1.0.0-stage-01', ['op-001']) });
    errorMock.mockClear();
    exitMock.mockClear();
    logMock.mockClear();

    await safeParse(['archive', 'stage-01']);

    expect(exitMock).not.toHaveBeenCalled();
    const out = logMock.mock.calls.map((c) => c[0] as string).join('\n');
    expect(out).toContain('阶段已归档');
    expect(errorMock.mock.calls.map((c) => c[0] as string).join('\n')).not.toContain('归档失败');
  });

  it('op-014/T1: archiveStage 短名与全名返回同构结果', () => {
    setupFlow(
      { 'v1.0.0-stage-01': mkStageObj('v1.0.0-stage-01', ['op-001', 'op-002']) },
      [mkReview('REV-001', 'v1.0.0-stage-01.op-001', 'closed'), mkReview('REV-002', 'v1.0.0-stage-02.op-001', 'closed')],
    );

    const short = archiveStage(tmpDir, 'stage-01');
    const full = archiveStage(tmpDir, 'v1.0.0-stage-01');
    expect(short).not.toBeNull();
    expect(full).not.toBeNull();
    expect(short!.opsCount).toBe(2);
    expect(short!.reviewsCount).toBe(1);
    expect(full!.opsCount).toBe(short!.opsCount);
    expect(full!.reviewsCount).toBe(short!.reviewsCount);
    expect(full!.knowledgeExtracts).toEqual(short!.knowledgeExtracts);
  });

  it('op-014/T2: 双键并存 → archiveStage 归档全名键、短名键逐字节不变', () => {
    setupFlow({
      'stage-01': mkStageObj('stage-01', []),
      'v1.0.0-stage-01': mkStageObj('v1.0.0-stage-01', ['op-001', 'op-002']),
    });
    const before = new FlowManager(tmpDir).getData()!;
    const shortBefore = JSON.stringify(before.stages['stage-01']);

    const r = archiveStage(tmpDir, 'stage-01');
    expect(r).not.toBeNull();
    expect(r!.opsCount).toBe(2);

    const after = new FlowManager(tmpDir).getData()!;
    expect(JSON.stringify(after.stages['stage-01'])).toBe(shortBefore);
  });

  it('op-014/T2: 仅短名键 → 回退命中，审查条目双键归属计入', () => {
    setupFlow(
      { 'stage-01': mkStageObj('stage-01', ['op-001']) },
      [mkReview('REV-001', 'stage-01.op-001', 'resolved')],
    );
    const r = archiveStage(tmpDir, 'stage-01');
    expect(r).not.toBeNull();
    expect(r!.opsCount).toBe(1);
    expect(r!.reviewsCount).toBe(1);
  });

  it('op-014/T1: 不存在阶段短名/全名均返回 null（契约保持）', () => {
    setupFlow({ 'v1.0.0-stage-01': mkStageObj('v1.0.0-stage-01', ['op-001']) });
    expect(archiveStage(tmpDir, 'stage-99')).toBeNull();
    expect(archiveStage(tmpDir, 'v1.0.0-stage-99')).toBeNull();
  });

  // ── stage-97 op-003：archive <stage> --json（D-97-03-05） ──

  it('op-003: --json 成功 → 6 键 + 追加 generated / archivePath 绝对 / 计数 / knowledgeExtracts 数组', async () => {
    setupFlow(
      { 'v1.0.0-stage-01': mkStageObj('v1.0.0-stage-01', ['op-001', 'op-002']) },
      [mkReview('REV-001', 'v1.0.0-stage-01.op-001', 'closed')],
    );
    logMock.mockClear();
    errorMock.mockClear();

    await safeParse(['archive', 'stage-01', '--json']);

    expect(process.exitCode).toBe(0);
    expect(errorMock).not.toHaveBeenCalled();
    expect(logMock).toHaveBeenCalledTimes(1);
    const raw = logMock.mock.calls[0][0] as string;
    expect(raw).not.toMatch(/\u001b\[/);   // 无 ANSI
    const payload = JSON.parse(raw);
    expect(Object.keys(payload)).toEqual([
      'schemaVersion', 'stage', 'archivePath', 'opsCount', 'reviewsCount', 'knowledgeExtracts', 'generated',
    ]);
    expect(payload.schemaVersion).toBe(1);
    expect(payload.stage).toBe('stage-01');             // 用户输入原值
    expect(payload.archivePath).toBe(join(tmpDir, '.openfeel', 'log', 'archive-stage-01.md'));
    expect(payload.opsCount).toBe(2);
    expect(payload.reviewsCount).toBe(1);
    expect(Array.isArray(payload.knowledgeExtracts)).toBe(true);
    expect(payload.knowledgeExtracts).toContain('[REV-001] k');   // 已关闭审查 → 知识提取
    expect(payload.knowledgeExtracts.every((x: unknown) => typeof x === 'string')).toBe(true);
    // v1.5.8 生成物：无 --skill → skills 空；短名 stage-01 → 版本 v1.0.0
    expect(Object.keys(payload.generated)).toEqual(['releaseNotes', 'skills', 'requirements']);
    expect(payload.generated.releaseNotes).toBe(join('docs', 'releases', 'v1.0.0.md'));
    expect(payload.generated.skills).toEqual([]);
    expect(payload.generated.requirements).toEqual([]);

    // 空态：无审查条目 → knowledgeExtracts 为空数组（非 null / 非缺省）
    // v1.2.4 A1：同名归档文件已存在，须显式 --force 才允许覆盖
    setupFlow({ 'v1.0.0-stage-01': mkStageObj('v1.0.0-stage-01', ['op-001']) });
    logMock.mockClear();
    await safeParse(['archive', 'stage-01', '--json', '--force']);
    const empty = JSON.parse(logMock.mock.calls[0][0] as string);
    expect(empty.knowledgeExtracts).toEqual([]);
  });

  it('op-003: --json 失败（阶段不存在）→ ARCHIVE_FAILED / refusal / exit 1 纯 envelope', async () => {
    setupFlow({ 'v1.0.0-stage-01': mkStageObj('v1.0.0-stage-01', ['op-001']) });
    logMock.mockClear();
    errorMock.mockClear();
    setJsonMode(true);
    try {
      await safeParse(['archive', 'stage-99', '--json']);
    } finally {
      resetJsonModeForTest();
    }

    expect(process.exitCode).toBe(1);
    expect(errorMock).not.toHaveBeenCalled();
    expect(logMock).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(logMock.mock.calls[0][0] as string);
    expect(Object.keys(payload)).toEqual(['schemaVersion', 'error']);
    expect(payload.schemaVersion).toBe(1);
    expect(payload.error).toMatchObject({ code: 'ARCHIVE_FAILED', kind: 'refusal', detail: { stage: 'stage-99' } });
    expect(typeof payload.error.message).toBe('string');
  });

  it('op-003: --json 异常（save 抛错）→ INTERNAL_ERROR / internal / exit 3', async () => {
    setupFlow({ 'v1.0.0-stage-01': mkStageObj('v1.0.0-stage-01', ['op-001']) });
    const saveSpy = vi.spyOn(FlowManager.prototype, 'save').mockImplementationOnce(() => {
      throw new Error('boom');
    });
    logMock.mockClear();
    errorMock.mockClear();
    setJsonMode(true);
    try {
      await safeParse(['archive', 'stage-01', '--json']);
    } finally {
      resetJsonModeForTest();
      saveSpy.mockRestore();
    }

    expect(process.exitCode).toBe(3);
    expect(errorMock).not.toHaveBeenCalled();
    expect(logMock).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(logMock.mock.calls[0][0] as string);
    expect(payload.error).toMatchObject({ code: 'INTERNAL_ERROR', kind: 'internal' });
    expect(payload.error.detail).toMatchObject({ name: 'Error', message: 'boom' });
  });

  // ── v1.2.4 A1：归档覆盖保护 + --force（数据安全） ──

  /** 零写盘主判据快照：归档内容哈希 / flow.json revision / log[] 长度 / KB 条目数（mtime 仅辅助，不入断言） */
  function zeroWriteSnapshot(stageName: string): {
    archiveHash: string;
    revision: number | undefined;
    logLength: number;
    kbFiles: number;
    kbEntries: number;
  } {
    const archivePath = join(tmpDir, '.openfeel', 'log', `archive-${stageName}.md`);
    const mgr = new FlowManager(tmpDir);
    const data = mgr.getData()!;
    const kbDir = join(tmpDir, '.openfeel', 'kb');
    let kbFiles = 0;
    let kbEntries = 0;
    if (existsSync(kbDir)) {
      const files = readdirSync(kbDir).filter((f) => f.endsWith('.md'));
      kbFiles = files.length;
      for (const f of files) {
        const content = readFileSync(join(kbDir, f), 'utf-8');
        kbEntries += (content.match(/^## \[[+-]\]/gm) ?? []).length;
      }
    }
    return {
      archiveHash: createHash('sha256').update(readFileSync(archivePath)).digest('hex'),
      revision: data.meta.revision,
      logLength: data.log.length,
      kbFiles,
      kbEntries,
    };
  }

  it('A1: 人类模式已有归档 → 拒绝覆盖 + exit 1 + 零写盘', async () => {
    setupFlow(
      { 'v1.0.0-stage-01': mkStageObj('v1.0.0-stage-01', ['op-001']) },
      [mkReview('REV-001', 'v1.0.0-stage-01.op-001', 'closed')],
    );
    // 首次归档（建立 KB 条目与归档文件）
    await safeParse(['archive', 'stage-01', '--json']);
    expect(process.exitCode).toBe(0);
    const before = zeroWriteSnapshot('stage-01');

    logMock.mockClear();
    errorMock.mockClear();
    exitMock.mockClear();
    await safeParse(['archive', 'stage-01']);

    expect(exitMock).toHaveBeenCalledWith(1);
    const stderr = errorMock.mock.calls.map((c) => c[0] as string).join('\n');
    expect(stderr).toContain('已存在');
    expect(stderr).toContain('--force');
    // 主判据：内容哈希 / revision / log 长度 / KB 条目数全部不变
    expect(zeroWriteSnapshot('stage-01')).toEqual(before);
  });

  it('A1: --json 已有归档 → ARCHIVE_EXISTS/refusal/exit 1 + 零写盘', async () => {
    setupFlow(
      { 'v1.0.0-stage-01': mkStageObj('v1.0.0-stage-01', ['op-001']) },
      [mkReview('REV-001', 'v1.0.0-stage-01.op-001', 'closed')],
    );
    await safeParse(['archive', 'stage-01', '--json']);
    const before = zeroWriteSnapshot('stage-01');
    const archivePath = join(tmpDir, '.openfeel', 'log', 'archive-stage-01.md');

    logMock.mockClear();
    errorMock.mockClear();
    setJsonMode(true);
    try {
      await safeParse(['archive', 'stage-01', '--json']);
    } finally {
      resetJsonModeForTest();
    }

    expect(process.exitCode).toBe(1);
    expect(errorMock).not.toHaveBeenCalled();
    expect(logMock).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(logMock.mock.calls[0][0] as string);
    expect(Object.keys(payload)).toEqual(['schemaVersion', 'error']);
    expect(payload.error).toMatchObject({
      code: 'ARCHIVE_EXISTS',
      kind: 'refusal',
      detail: { stage: 'stage-01', archivePath },
    });
    expect(zeroWriteSnapshot('stage-01')).toEqual(before);
    process.exitCode = 0;
  });

  it('A1: --force 正控 → 真实覆盖（哈希变化 / revision 递增）+ #33 六键', async () => {
    setupFlow(
      { 'v1.0.0-stage-01': mkStageObj('v1.0.0-stage-01', ['op-001']) },
      [mkReview('REV-001', 'v1.0.0-stage-01.op-001', 'closed')],
    );
    await safeParse(['archive', 'stage-01', '--json']);
    const before = zeroWriteSnapshot('stage-01');

    logMock.mockClear();
    errorMock.mockClear();
    await safeParse(['archive', 'stage-01', '--json', '--force']);

    expect(process.exitCode).toBe(0);
    expect(errorMock).not.toHaveBeenCalled();
    expect(logMock).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(logMock.mock.calls[0][0] as string);
    expect(Object.keys(payload)).toEqual([
      'schemaVersion', 'stage', 'archivePath', 'opsCount', 'reviewsCount', 'knowledgeExtracts', 'generated',
    ]);
    const after = zeroWriteSnapshot('stage-01');
    expect(after.archiveHash).not.toBe(before.archiveHash);
    expect(after.revision).toBeGreaterThan(before.revision as number);
    expect(after.logLength).toBe(before.logLength + 1);
  });

  it('A1: 别名边界 → v1.2.0-stage-78 与 stage-78 派生不同文件、互不触发', async () => {
    setupFlow({
      'v1.2.0-stage-78': mkStageObj('v1.2.0-stage-78', []),
      'stage-78': mkStageObj('stage-78', []),
    });
    const fullPath = join(tmpDir, '.openfeel', 'log', 'archive-v1.2.0-stage-78.md');
    const shortPath = join(tmpDir, '.openfeel', 'log', 'archive-stage-78.md');

    // 全名归档后，短名归档不应被全名文件触发保护
    await safeParse(['archive', 'v1.2.0-stage-78', '--json']);
    expect(process.exitCode).toBe(0);
    await safeParse(['archive', 'stage-78', '--json']);
    expect(process.exitCode).toBe(0);
    expect(existsSync(fullPath)).toBe(true);
    expect(existsSync(shortPath)).toBe(true);
    expect(fullPath).not.toBe(shortPath);

    // 反向：再归档全名 → 仅保护全名目标文件
    logMock.mockClear();
    errorMock.mockClear();
    setJsonMode(true);
    try {
      await safeParse(['archive', 'v1.2.0-stage-78', '--json']);
    } finally {
      resetJsonModeForTest();
    }
    expect(process.exitCode).toBe(1);
    const payload = JSON.parse(logMock.mock.calls[0][0] as string);
    expect(payload.error.code).toBe('ARCHIVE_EXISTS');
    expect(payload.error.detail.archivePath).toBe(fullPath);
    expect(existsSync(shortPath)).toBe(true);
    process.exitCode = 0;
  });

  it('A1: i18n en 新键无 CJK', () => {
    expect(/[一-鿿]/.test(t('archive.errorArchiveExistsTmpl', 'en', { stage: 's', path: 'p' }))).toBe(false);
    expect(/[一-鿿]/.test(t('help.archive.force', 'en'))).toBe(false);
    // v1.5.8 新键
    expect(/[一-鿿]/.test(t('archive.errorInvalidSkillTmpl', 'en', { skill: 's' }))).toBe(false);
    expect(/[一-鿿]/.test(t('archive.completedRequirements', 'en'))).toBe(false);
    expect(/[一-鿿]/.test(t('archive.releaseNotes', 'en'))).toBe(false);
    expect(/[一-鿿]/.test(t('archive.generatedSkill', 'en'))).toBe(false);
    expect(/[一-鿿]/.test(t('archive.skillSkippedTmpl', 'en', { skill: 's' }))).toBe(false);
    expect(/[一-鿿]/.test(t('archive.noneLabel', 'en'))).toBe(false);
    expect(/[一-鿿]/.test(t('help.archive.skill', 'en'))).toBe(false);
    expect(/[一-鿿]/.test(t('help.archive.json', 'en'))).toBe(false);
  });

  // ── v1.5.8 / REQ-024：归档官增强（--skill / generated / 已完成需求） ──

  it('v1.5.8: 汇总该版本 done 需求到摘要与人类输出（未完成需求不入）', async () => {
    setupFlow(
      { 'v1.0.0-stage-01': mkStageObj('v1.0.0-stage-01', ['op-001']) },
      [],
      [
        {
          id: 'REQ-001', title: '已完成A', status: 'done', target_version: 'v1.0.0',
          priority: 'P1', created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-30T00:00:00Z',
        },
        {
          id: 'REQ-002', title: '未完成B', status: 'in_progress', target_version: 'v1.0.0',
          priority: 'P2', created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-31T00:00:00Z',
        },
      ],
    );
    logMock.mockClear();
    errorMock.mockClear();

    await safeParse(['archive', 'stage-01']);

    expect(errorMock).not.toHaveBeenCalled();
    const out = logMock.mock.calls.map((c) => c[0] as string).join('\n');
    expect(out).toContain('已完成需求');
    expect(out).toContain('REQ-001');
    expect(out).not.toContain('REQ-002');

    const summary = readFileSync(join(tmpDir, '.openfeel', 'log', 'archive-stage-01.md'), 'utf-8');
    expect(summary).toContain('## 已完成需求');
    expect(summary).toContain('已完成A');
    expect(summary).not.toContain('REQ-002');
  });

  it('v1.5.8: --skill 透传 → 人类输出生成物行 + 按 harness 各写一份 SKILL.md', async () => {
    setupFlow({ 'v1.0.0-stage-01': mkStageObj('v1.0.0-stage-01', ['op-001']) });
    mkdirSync(join(tmpDir, '.dsh'), { recursive: true });
    mkdirSync(join(tmpDir, '.claude'), { recursive: true });
    logMock.mockClear();
    errorMock.mockClear();
    exitMock.mockClear();

    await safeParse(['archive', 'stage-01', '--skill', 'openfeel-archive']);

    expect(exitMock).not.toHaveBeenCalled();
    const out = logMock.mock.calls.map((c) => c[0] as string).join('\n');
    expect(out).toContain('发布说明草稿');
    expect(out).toContain(join('.dsh', 'skills', 'openfeel-archive', 'SKILL.md'));
    expect(out).toContain(join('.claude', 'skills', 'openfeel-archive', 'SKILL.md'));
    expect(existsSync(join(tmpDir, '.dsh', 'skills', 'openfeel-archive', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(tmpDir, '.claude', 'skills', 'openfeel-archive', 'SKILL.md'))).toBe(true);
  });

  it('v1.5.8: --json --skill → generated 三键（既有键序前置不变）', async () => {
    setupFlow({ 'v1.0.0-stage-01': mkStageObj('v1.0.0-stage-01', ['op-001']) });
    mkdirSync(join(tmpDir, '.dsh'), { recursive: true });
    logMock.mockClear();
    errorMock.mockClear();

    await safeParse(['archive', 'stage-01', '--json', '--skill', 'openfeel-archive']);

    expect(process.exitCode).toBe(0);
    const payload = JSON.parse(logMock.mock.calls[0][0] as string);
    expect(Object.keys(payload)).toEqual([
      'schemaVersion', 'stage', 'archivePath', 'opsCount', 'reviewsCount', 'knowledgeExtracts', 'generated',
    ]);
    expect(payload.generated.releaseNotes).toBe(join('docs', 'releases', 'v1.0.0.md'));
    expect(payload.generated.skills).toEqual([join('.dsh', 'skills', 'openfeel-archive', 'SKILL.md')]);
    expect(payload.generated.requirements).toEqual([]);
    expect(existsSync(join(tmpDir, 'docs', 'releases', 'v1.0.0.md'))).toBe(true);
  });

  it('v1.5.8: 非法 slug 人类模式 → exit 1 + 文案 + 零写盘', async () => {
    setupFlow({ 'v1.0.0-stage-01': mkStageObj('v1.0.0-stage-01', ['op-001']) });
    logMock.mockClear();
    errorMock.mockClear();
    exitMock.mockClear();

    await safeParse(['archive', 'stage-01', '--skill', 'Bad Slug']);

    expect(exitMock).toHaveBeenCalledWith(1);
    const stderr = errorMock.mock.calls.map((c) => c[0] as string).join('\n');
    expect(stderr).toContain('非法 skill slug');
    // 零写盘：归档文件 / 发布说明 / skill 目录均不存在
    expect(existsSync(join(tmpDir, '.openfeel', 'log', 'archive-stage-01.md'))).toBe(false);
    expect(existsSync(join(tmpDir, 'docs', 'releases', 'v1.0.0.md'))).toBe(false);
    expect(existsSync(join(tmpDir, '.dsh'))).toBe(false);
  });

  it('v1.5.8: 非法 slug --json → INVALID_ARGUMENT/refusal/1 + detail', async () => {
    setupFlow({ 'v1.0.0-stage-01': mkStageObj('v1.0.0-stage-01', ['op-001']) });
    logMock.mockClear();
    errorMock.mockClear();
    setJsonMode(true);
    try {
      await safeParse(['archive', 'stage-01', '--json', '--skill', 'Bad_Slug']);
    } finally {
      resetJsonModeForTest();
    }

    expect(process.exitCode).toBe(1);
    expect(errorMock).not.toHaveBeenCalled();
    const payload = JSON.parse(logMock.mock.calls[0][0] as string);
    expect(Object.keys(payload)).toEqual(['schemaVersion', 'error']);
    expect(payload.error).toMatchObject({
      code: 'INVALID_ARGUMENT',
      kind: 'refusal',
      detail: { stage: 'stage-01', skill: 'Bad_Slug' },
    });
    expect(existsSync(join(tmpDir, '.openfeel', 'log', 'archive-stage-01.md'))).toBe(false);
    process.exitCode = 0;
  });
});

// ═══════════════════════════════════════════════
// v1.5.8 / REQ-030：flow archive 发布软门（未完成需求）
// ═══════════════════════════════════════════════

describe('flow archive 发布软门（REQ-030）', () => {
  let tmpDir: string;
  let program: Command;
  let logMock: ReturnType<typeof vi.fn>;
  let errorMock: ReturnType<typeof vi.fn>;
  let cwdMock: ReturnType<typeof vi.fn>;
  let exitMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-cmd-flow-archive-'));
    mockHome.dir = tmpDir;
    logMock = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorMock = vi.spyOn(console, 'error').mockImplementation(() => {});
    cwdMock = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    exitMock = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    process.exitCode = 0;
    program = new Command();
    program.exitOverride();
    registerFlowCommand(program);
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

  const flowPath = (): string => join(tmpDir, '.openfeel', 'flow.json');
  const archivePath = (v: string): string => join(tmpDir, '.openfeel', 'flow-archive', `${v}.json`);
  const stagesDir = (): string => join(tmpDir, '.openfeel', 'flow-archive');

  /** 构造阶段对象（含 1 个 op） */
  function mkStageObj(name: string, opIds: string[]): Record<string, unknown> {
    const ops: Record<string, unknown> = {};
    for (const id of opIds) {
      ops[id] = {
        id, title: 't', state: 'pending', assignee: 'x', attempts: 0, max_attempts: 3,
        checkpoints: { plan: 'pending', scheme: 'pending', exec: { attempts: 0, self: 'pending' }, review: 'pending', test: 'pending' },
      };
    }
    return { name, phase: 'done', status: 'done', deps: [], ops };
  }

  /** 可归档夹具：v1.0.0 阶段全 done + 终态需求 REQ-001 + 未完成需求 REQ-002 */
  function setupArchivable(): void {
    FlowManager.initFlow(tmpDir);
    const mgr = new FlowManager(tmpDir);
    mgr.setData({
      meta: { version: '1.0', project: 'Test', updated: new Date().toISOString() },
      pipeline: { phase: 'plan_pending', current: { stage: '', op: '' }, retry: 0 },
      stages: { 'v1.0.0-stage-01': mkStageObj('v1.0.0-stage-01', ['op-001']) },
      reviews: [],
      requirements: [
        {
          id: 'REQ-001', title: '已完成', status: 'done', target_version: 'v1.0.0',
          created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-02T00:00:00Z',
        },
        {
          id: 'REQ-002', title: '未完成', status: 'in_progress', target_version: 'v1.0.0',
          created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-02T00:00:00Z',
        },
      ],
      log: [],
    } as unknown as FlowData);
    mgr.save();
  }

  it('未完成需求缺省拒绝（零写盘）+ 提示 rollover / --allow-unfinished', async () => {
    setupArchivable();
    const before = readFileSync(flowPath(), 'utf-8');

    logMock.mockClear();
    errorMock.mockClear();
    await safeParse(['flow', 'archive', 'v1.0.0']);

    expect(process.exitCode).toBe(1);
    const stderr = errorMock.mock.calls.map((c) => c[0] as string).join('\n');
    expect(stderr).toContain('未完成需求');
    expect(stderr).toContain('REQ-002');
    expect(stderr).toContain('--allow-unfinished');
    expect(stderr).toContain('req rollover');
    // 零写盘：flow.json 逐字节不变 + 归档文件不存在
    expect(readFileSync(flowPath(), 'utf-8')).toBe(before);
    expect(existsSync(stagesDir())).toBe(false);
  });

  it('--json 缺省拒绝 → error=unfinished-requirements + unfinished/counts（零写盘）', async () => {
    setupArchivable();
    const before = readFileSync(flowPath(), 'utf-8');

    logMock.mockClear();
    await safeParse(['flow', 'archive', 'v1.0.0', '--json']);

    expect(process.exitCode).toBe(1);
    expect(logMock).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(logMock.mock.calls[0][0] as string);
    expect(payload.error).toBe('unfinished-requirements');
    expect(payload.version).toBe('v1.0.0');
    expect(payload.unfinished).toEqual(['REQ-002']);
    expect(payload.counts).toEqual({ done: 1, unfinished: 1, other: 0, total: 2 });
    expect(payload.errorKind).toBe('refusal');
    expect(readFileSync(flowPath(), 'utf-8')).toBe(before);
    expect(existsSync(stagesDir())).toBe(false);
  });

  it('--allow-unfinished 放行：终态需求搬入归档 + 从 flow.json 删除 + 人类输出需求数', async () => {
    setupArchivable();
    const before = readFileSync(flowPath(), 'utf-8');

    logMock.mockClear();
    errorMock.mockClear();
    await safeParse(['flow', 'archive', 'v1.0.0', '--allow-unfinished']);

    expect(process.exitCode).toBe(0);
    expect(existsSync(archivePath('v1.0.0'))).toBe(true);
    const file = JSON.parse(readFileSync(archivePath('v1.0.0'), 'utf-8'));
    expect(file.requirements.map((r: { id: string }) => r.id)).toEqual(['REQ-001']);
    expect(file.counts).toMatchObject({ requirements: 1 });

    const after = JSON.parse(readFileSync(flowPath(), 'utf-8')) as FlowData;
    expect(after.requirements?.map((r) => r.id)).toEqual(['REQ-002']);   // 未完成需求保留
    expect(after.log[after.log.length - 1].action).toBe('archive_flow_version');
    expect(after.log[after.log.length - 1].detail).toMatchObject({ requirements: 1 });
    expect(before).not.toBe(readFileSync(flowPath(), 'utf-8'));

    const out = logMock.mock.calls.map((c) => c[0] as string).join('\n');
    expect(out).toContain('需求：1 条');
    // 显式放行时人类模式给出警告（stderr）
    expect(errorMock.mock.calls.map((c) => c[0] as string).join('\n')).toContain('警告');
  });

  it('--json --allow-unfinished → 既有 9 键保持序 + 末尾追加 requirements', async () => {
    setupArchivable();

    logMock.mockClear();
    await safeParse(['flow', 'archive', 'v1.0.0', '--json', '--allow-unfinished']);

    expect(process.exitCode).toBe(0);
    expect(logMock).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(logMock.mock.calls[0][0] as string);
    expect(Object.keys(payload)).toEqual([
      'schemaVersion', 'version', 'stages', 'reviews', 'log', 'dryRun',
      'eligible', 'unfinishedStages', 'blockingReviews', 'requirements',
    ]);
    expect(payload).toMatchObject({
      schemaVersion: 1, version: 'v1.0.0', dryRun: false, eligible: true,
      unfinishedStages: [], blockingReviews: [], requirements: 1,
    });
  });
});
