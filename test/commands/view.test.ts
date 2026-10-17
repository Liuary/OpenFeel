/**
 * view 命令测试（A4 后：list / accept 保留；add 已移除）
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Command, CommanderError } from 'commander';
import { registerViewCommand } from '../../src/commands/view.js';
import { FlowManager } from '../../src/core/flow-manager.js';
import { setJsonMode, resetJsonModeForTest } from '../../src/commands/shared/json-output.js';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// mock homedir：隔离全局配置读写，避免污染真实 ~/.config/openfeel
const mockHome = vi.hoisted(() => ({ dir: '' }));
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => mockHome.dir };
});

describe('view 命令（A4：list / accept 保留，add 已移除）', () => {
  let tmpDir: string;
  let program: Command;
  let logMock: ReturnType<typeof vi.fn>;
  let errorMock: ReturnType<typeof vi.fn>;
  let cwdMock: ReturnType<typeof vi.fn>;
  let exitMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-cmd-view-'));
    mockHome.dir = tmpDir;
    logMock = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorMock = vi.spyOn(console, 'error').mockImplementation(() => {});
    cwdMock = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    exitMock = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);

    // 构造含 stage-01.op-001 + 一条 open REV-001 的 flow.json
    FlowManager.initFlow(tmpDir);
    const mgr = new FlowManager(tmpDir);
    const data = mgr.getData()!;
    data.stages['stage-01'] = {
      name: 'stage-01', phase: 'exec_running', status: 'planned', deps: [],
      ops: {
        'op-001': {
          id: 'op-001', title: 't', state: 'pending', assignee: 'x', attempts: 0, max_attempts: 3,
          checkpoints: { plan: 'pending', scheme: 'pending', exec: { attempts: 0, self: 'pending' }, review: 'pending', test: 'pending' },
        },
      },
    };
    data.reviews.push({
      id: 'REV-001', op: 'stage-01.op-001', status: 'open', priority: 'medium',
      title: '测试审查', filed_by: 'openfeel-reviewer', filed_at: '2026-01-01T00:00:00Z',
    });
    mgr.save();

    program = new Command();
    program.exitOverride();
    registerViewCommand(program);
  });

  afterEach(() => {
    // JSON 失败路径置位的退出码须复位（进程级状态）
    process.exitCode = undefined;
    rmSync(tmpDir, { recursive: true, force: true });
    mockHome.dir = '';
    logMock.mockRestore();
    errorMock.mockRestore();
    cwdMock.mockRestore();
    exitMock.mockRestore();
  });

  /** 追加一条可定制的审查条目（filed_at 固定，便于快照稳定） */
  function addReview(overrides: Record<string, unknown>): void {
    const mgr = new FlowManager(tmpDir);
    mgr.getData()!.reviews.push({
      id: 'REV-002', op: 'stage-01.op-001', status: 'open', priority: 'high',
      title: '第二条', filed_by: 'openfeel-reviewer', filed_at: '2026-01-02T00:00:00Z',
      ...overrides,
    } as never);
    mgr.save();
  }

  /** 执行一次成功 JSON 命令并解析单文档（schemaVersion 首键=1、无 ANSI、无 stderr） */
  async function jsonDoc(args: string[]): Promise<Record<string, any>> {
    logMock.mockClear();
    errorMock.mockClear();
    await safeParse(args);
    const raw = logMock.mock.calls.map((c) => c[0] as string).join('\n');
    expect(raw.trim().length).toBeGreaterThan(0);
    expect(raw).not.toMatch(/\x1b\[/);
    expect(errorMock).not.toHaveBeenCalled();
    const doc = JSON.parse(raw) as Record<string, any>;
    expect(Object.keys(doc)[0]).toBe('schemaVersion');
    expect(doc.schemaVersion).toBe(1);
    return doc;
  }

  /** 安全解析命令，捕获 CommanderError 不使测试中断 */
  async function safeParse(args: string[]): Promise<void> {
    try {
      await program.parseAsync(args, { from: 'user' });
    } catch (err) {
      if (!(err instanceof CommanderError)) {
        throw err;
      }
    }
  }

  it('view 组仅含 list / accept（无 add）', () => {
    const view = program.commands.find((c) => c.name() === 'view');
    expect(view).toBeDefined();
    expect(view!.commands.map((c) => c.name()).sort()).toEqual(['accept', 'list']);
  });

  it('view list 列出审查条目（含 normalizeAgentName 生效）', async () => {
    logMock.mockClear();
    await safeParse(['view', 'list']);
    const out = logMock.mock.calls.map((c) => c[0] as string).join('\n');
    expect(out).toContain('REV-001');
    expect(out).toContain('openfeel-reviewer');
  });

  it('view list --op 过滤生效', async () => {
    logMock.mockClear();
    await safeParse(['view', 'list', '--op', 'stage-01.op-001']);
    expect(logMock.mock.calls.map((c) => c[0] as string).join('\n')).toContain('REV-001');

    logMock.mockClear();
    await safeParse(['view', 'list', '--op', 'stage-99.op-999']);
    expect(logMock.mock.calls.map((c) => c[0] as string).join('\n')).toContain('暂无审查条目');
  });

  it('view accept <rev-id> 标记 closed', async () => {
    await safeParse(['view', 'accept', 'REV-001']);
    expect(exitMock).not.toHaveBeenCalled();
    const flow = JSON.parse(readFileSync(join(tmpDir, '.openfeel', 'flow.json'), 'utf-8'));
    expect(flow.reviews.find((r: { id: string }) => r.id === 'REV-001').status).toBe('closed');
  });

  it('view accept 未命中 → exit 1', async () => {
    exitMock.mockClear();
    await safeParse(['view', 'accept', 'REV-999']);
    expect(exitMock).toHaveBeenCalledWith(1);
  });

  // ── stage-97 op-002：view list JSON 契约 ──

  it('op-002 JSON：view list 键序 + blocking 缺省 true + canAutoFix/autoFixDetail 缺省', async () => {
    const doc = await jsonDoc(['view', 'list', '--json']);

    expect(Object.keys(doc)).toEqual(['schemaVersion', 'count', 'reviews']);
    expect(doc.count).toBe(1);
    const reviews = doc.reviews as Array<Record<string, unknown>>;
    expect(Object.keys(reviews[0])).toEqual([
      'id', 'op', 'status', 'priority', 'title',
      'filed_by', 'filed_at', 'blocking', 'canAutoFix', 'autoFixDetail',
    ]);
    expect(reviews[0].id).toBe('REV-001');
    expect(reviews[0].blocking).toBe(true);
    expect(reviews[0].canAutoFix).toBe(false);
    expect(reviews[0].autoFixDetail).toBeNull();
  });

  it('op-002 JSON：view list blocking:false / canAutoFix:true / autoFixDetail 值', async () => {
    addReview({ blocking: false, canAutoFix: true, autoFixDetail: '直接修' });

    const doc = await jsonDoc(['view', 'list', '--json']);

    const reviews = doc.reviews as Array<Record<string, unknown>>;
    expect(doc.count).toBe(2);
    // filed_at 降序：REV-002（2026-01-02）在前
    expect(reviews[0].id).toBe('REV-002');
    expect(reviews[0].blocking).toBe(false);
    expect(reviews[0].canAutoFix).toBe(true);
    expect(reviews[0].autoFixDetail).toBe('直接修');
  });

  it('op-002 JSON：view list --op 过滤 / 空态 → count:0 + reviews:[]', async () => {
    const hit = await jsonDoc(['view', 'list', '--op', 'stage-01.op-001', '--json']);
    expect(hit.count).toBe(1);

    const miss = await jsonDoc(['view', 'list', '--op', 'stage-99.op-999', '--json']);
    expect(miss.count).toBe(0);
    expect(miss.reviews).toEqual([]);
    expect(exitMock).not.toHaveBeenCalled();
  });

  it('op-002 JSON：view list 内部异常 → INTERNAL_ERROR / exit 3', async () => {
    const spy = vi.spyOn(FlowManager.prototype, 'getReviewItems').mockImplementation(() => {
      throw new Error('boom');
    });
    try {
      logMock.mockClear();
      errorMock.mockClear();
      setJsonMode(true);
      try {
        await safeParse(['view', 'list', '--json']);
      } finally {
        resetJsonModeForTest();
      }

      const raw = logMock.mock.calls.map((c) => c[0] as string).join('\n');
      const doc = JSON.parse(raw) as Record<string, any>;
      expect(Object.keys(doc)[0]).toBe('schemaVersion');
      expect(doc.error.code).toBe('INTERNAL_ERROR');
      expect(doc.error.kind).toBe('internal');
      expect(process.exitCode).toBe(3);
      expect(errorMock).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('op-002 基线：view list 人类输出逐字不变', async () => {
    await safeParse(['view', 'list']);
    const out = logMock.mock.calls.map((c) => c[0] as string).join('\n');
    expect(out).toMatchInlineSnapshot(`
      "REV-001 [open] medium — 测试审查
        操作: stage-01.op-001  提交人: openfeel-reviewer  时间: 2026-01-01T00:00:00Z"
    `);
  });

  it('op-002 基线：view list 内部异常 人类路径 exit 1 逐字不变', async () => {
    const spy = vi.spyOn(FlowManager.prototype, 'getReviewItems').mockImplementation(() => {
      throw new Error('boom');
    });
    try {
      await safeParse(['view', 'list']);
      expect(errorMock.mock.calls.map((c) => c[0] as string).join('\n')).toMatchInlineSnapshot(`"错误：boom"`);
      expect(exitMock).toHaveBeenCalledWith(1);
    } finally {
      spy.mockRestore();
    }
  });
});
