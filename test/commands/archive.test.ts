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
});
