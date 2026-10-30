/**
 * chore 命令测试（v1.4.0）
 *
 * 覆盖：开启 / 收口 / 状态 / 活跃阶段拒绝 / flow.json stages 数不变 / 日志留痕。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Command, CommanderError } from 'commander';
import { registerChoreCommand } from '../../src/commands/chore.js';
import { FlowManager, type FlowData, type MetaPhase, type PipelinePhase } from '../../src/core/flow-manager.js';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

function makeFlow(stagePhase: PipelinePhase | null): FlowData {
  return {
    meta: { version: '1.0', project: 'Test', updated: new Date().toISOString() },
    pipeline: { phase: 'active' as MetaPhase, current: { stage: '', op: '' }, retry: 0 },
    stages: stagePhase === null ? {} : {
      'v0.0.1-stage-01': {
        name: 'v0.0.1-stage-01',
        phase: stagePhase,
        status: stagePhase === 'done' ? 'done' : 'planned',
        deps: [],
        ops: {},
      },
    },
    reviews: [],
    log: [],
  };
}

describe('chore 命令（v1.4.0）', () => {
  let tmpDir: string;
  let program: Command;
  let logMock: ReturnType<typeof vi.fn>;
  let errorMock: ReturnType<typeof vi.fn>;
  let exitMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-chore-'));
    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    logMock = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorMock = vi.spyOn(console, 'error').mockImplementation(() => {});
    exitMock = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    program = new Command();
    program.exitOverride();
    registerChoreCommand(program);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  async function safeParse(args: string[]): Promise<void> {
    try {
      await program.parseAsync(args, { from: 'user' });
    } catch (err) {
      if (!(err instanceof CommanderError)) throw err;
    }
  }

  function seed(phase: PipelinePhase | null): void {
    FlowManager.initFlow(tmpDir);
    const mgr = new FlowManager(tmpDir);
    mgr.setData(makeFlow(phase));
    mgr.save();
  }

  const chorePath = () => join(tmpDir, '.openfeel', 'chore.json');

  it('无活跃阶段：开启 chore → 写窗口文件 + chore_start 日志；收口 → 删除 + chore_end；stages 数不变', async () => {
    seed('done');
    const flowBefore = JSON.parse(readFileSync(join(tmpDir, '.openfeel', 'flow.json'), 'utf-8')) as {
      stages: Record<string, unknown>;
      log: Array<{ action: string; detail: Record<string, unknown> }>;
    };
    const stageCountBefore = Object.keys(flowBefore.stages).length;

    await safeParse(['chore', '调整 UI 圆角']);
    expect(exitMock).not.toHaveBeenCalled();
    expect(existsSync(chorePath())).toBe(true);
    const chore = JSON.parse(readFileSync(chorePath(), 'utf-8')) as {
      id: string; note: string; expires_at: string; stage_count_at_start: number;
    };
    expect(chore.note).toBe('调整 UI 圆角');
    expect(chore.id.startsWith('CHORE-')).toBe(true);
    expect(chore.stage_count_at_start).toBe(stageCountBefore);

    const afterStart = JSON.parse(readFileSync(join(tmpDir, '.openfeel', 'flow.json'), 'utf-8')) as typeof flowBefore;
    expect(afterStart.log.some((l) => l.action === 'chore_start')).toBe(true);
    expect(Object.keys(afterStart.stages)).toHaveLength(stageCountBefore);

    await safeParse(['chore', '--end']);
    expect(existsSync(chorePath())).toBe(false);
    const afterEnd = JSON.parse(readFileSync(join(tmpDir, '.openfeel', 'flow.json'), 'utf-8')) as typeof flowBefore;
    expect(afterEnd.log.some((l) => l.action === 'chore_end')).toBe(true);
    expect(Object.keys(afterEnd.stages)).toHaveLength(stageCountBefore);
  });

  it('存在活跃阶段 → 拒绝开启（exit 1，提示走 fast/full）', async () => {
    seed('plan_pending');
    await safeParse(['chore', 'x']);
    expect(exitMock).toHaveBeenCalledWith(1);
    expect(errorMock.mock.calls.map((c) => String(c[0])).join('\n')).toContain('活跃阶段');
    expect(existsSync(chorePath())).toBe(false);
  });

  it('--status 只读：none / active / expired', async () => {
    seed('done');
    await safeParse(['chore', '--status']);
    expect(logMock.mock.calls.map((c) => String(c[0])).join('\n')).toContain('无 chore');

    await safeParse(['chore', 'x']);
    logMock.mockClear();
    await safeParse(['chore', '--status']);
    expect(logMock.mock.calls.map((c) => String(c[0])).join('\n')).toContain('chore 进行中');

    // 过期
    writeFileSync(chorePath(), JSON.stringify({
      id: 'CHORE-old', note: 'old', started_at: '2020-01-01T00:00:00.000Z',
      expires_at: '2020-01-01T00:01:00.000Z', stage_count_at_start: 1,
    }, null, 2) + '\n');
    logMock.mockClear();
    await safeParse(['chore', '--status']);
    expect(logMock.mock.calls.map((c) => String(c[0])).join('\n')).toContain('已过期');
  });
});
