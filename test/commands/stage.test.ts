/**
 * stage 命令测试（stage-50 op-005 T46，命令层覆盖补齐）
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const mockHome = vi.hoisted(() => ({ dir: '' }));
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => mockHome.dir };
});

import { Command, CommanderError } from 'commander';
import { registerStageCommand } from '../../src/commands/stage.js';
import { FlowManager } from '../../src/core/flow-manager.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('stage 命令（stage-50 op-005 T46）', () => {
  let projDir: string;
  let program: Command;
  let errMock: ReturnType<typeof vi.fn>;
  let exitMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    projDir = mkdtempSync(join(tmpdir(), 'openfeel-cmd-stage-'));
    mockHome.dir = projDir;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    errMock = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'cwd').mockReturnValue(projDir);
    exitMock = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    program = new Command();
    program.exitOverride();
    registerStageCommand(program);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(projDir, { recursive: true, force: true });
    mockHome.dir = '';
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

  it('基本路径：stage create 合法 stageId → 写入 flow.json', async () => {
    FlowManager.initFlow(projDir);
    await safeParse(['stage', 'create', 'v1.0.0-stage-88']);
    const mgr = new FlowManager(projDir);
    expect(mgr.getData()!.stages['v1.0.0-stage-88']).toBeDefined();
    expect(exitMock).not.toHaveBeenCalled();
  });

  it('失败路径：stage create 非法 stageId → exit 1', async () => {
    FlowManager.initFlow(projDir);
    await safeParse(['stage', 'create', 'bad id']);
    expect(exitMock).toHaveBeenCalledWith(1);
    expect(errMock.mock.calls.map((c) => c[0] as string).join('\n')).toBeTruthy();
  });
});
