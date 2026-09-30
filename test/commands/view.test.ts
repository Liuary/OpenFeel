/**
 * view 命令测试（stage-50 op-003 T37/R4 弃用行为最小断言）
 * 仅 1 用例：TTY 下 stderr 含 deprecated；非 TTY 静默（对齐 stage.create 惯例）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Command, CommanderError } from 'commander';
import { registerViewCommand } from '../../src/commands/view.js';
import { FlowManager } from '../../src/core/flow-manager.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// mock homedir：隔离全局配置读写，避免污染真实 ~/.config/openfeel
const mockHome = vi.hoisted(() => ({ dir: '' }));
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => mockHome.dir };
});

describe('view 命令（stage-50 op-003 T37/R4）', () => {
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

    // 构造含 stage-01.op-001 的 flow.json（供 addReviewEntry 校验通过）
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

  function stderr(): string {
    return errorMock.mock.calls.map((c) => c[0] as string).join('\n');
  }

  it('TTY 下 stderr 含 deprecated 文案；非 TTY 静默', async () => {
    const orig = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
    try {
      Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
      await safeParse(['view', 'add', '--op', 'stage-01.op-001', '--title', 'x']);
      expect(stderr()).toContain('deprecated');

      errorMock.mockClear();
      Object.defineProperty(process.stdout, 'isTTY', { value: undefined, configurable: true });
      await safeParse(['view', 'add', '--op', 'stage-01.op-001', '--title', 'y']);
      expect(stderr()).not.toContain('deprecated');
    } finally {
      if (orig) {
        Object.defineProperty(process.stdout, 'isTTY', orig);
      }
    }
  });
});
