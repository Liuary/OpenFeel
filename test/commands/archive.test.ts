/**
 * archive 命令测试（v1.1.2-stage-52 op-010，L2）
 * 覆盖：参数解析 / 错误码 / i18n 输出。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Command, CommanderError } from 'commander';
import { registerArchiveCommand } from '../../src/commands/archive.js';
import { archiveStage } from '../../src/core/archive/merge.js';
import { FlowManager, type FlowData } from '../../src/core/flow-manager.js';
import { t } from '../../src/core/i18n.js';
import { setJsonMode, resetJsonModeForTest } from '../../src/commands/shared/json-output.js';
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync } from 'node:fs';
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

  /** 写入 flow.json（注入数据） */
  function setupFlow(stages: Record<string, unknown>, reviews: unknown[] = []): void {
    FlowManager.initFlow(tmpDir);
    const mgr = new FlowManager(tmpDir);
    mgr.setData({
      meta: { version: '1.0', project: 'Test', updated: new Date().toISOString() },
      pipeline: { phase: 'plan_pending', current: { stage: '', op: '' }, retry: 0 },
      stages,
      reviews,
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

  it('op-003: --json 成功 → 6 键固定序 / archivePath 绝对 / 计数 / knowledgeExtracts 数组', async () => {
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
      'schemaVersion', 'stage', 'archivePath', 'opsCount', 'reviewsCount', 'knowledgeExtracts',
    ]);
    expect(payload.schemaVersion).toBe(1);
    expect(payload.stage).toBe('stage-01');             // 用户输入原值
    expect(payload.archivePath).toBe(join(tmpDir, '.openfeel', 'log', 'archive-stage-01.md'));
    expect(payload.opsCount).toBe(2);
    expect(payload.reviewsCount).toBe(1);
    expect(Array.isArray(payload.knowledgeExtracts)).toBe(true);
    expect(payload.knowledgeExtracts).toContain('[REV-001] k');   // 已关闭审查 → 知识提取
    expect(payload.knowledgeExtracts.every((x: unknown) => typeof x === 'string')).toBe(true);

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
      'schemaVersion', 'stage', 'archivePath', 'opsCount', 'reviewsCount', 'knowledgeExtracts',
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
  });
});
