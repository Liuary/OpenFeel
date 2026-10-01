/**
 * view 命令测试（A4 后：list / accept 保留；add 已移除）
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Command, CommanderError } from 'commander';
import { registerViewCommand } from '../../src/commands/view.js';
import { FlowManager } from '../../src/core/flow-manager.js';
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
    rmSync(tmpDir, { recursive: true, force: true });
    mockHome.dir = '';
    logMock.mockRestore();
    errorMock.mockRestore();
    cwdMock.mockRestore();
    exitMock.mockRestore();
  });

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
});
