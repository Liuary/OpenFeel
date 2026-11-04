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

  // ── v1.5.11 / D-126-03：TTL 收窄 + --source ──────────────────────────

  type StartLog = { action: string; detail: Record<string, unknown> };

  function startLogs(): StartLog[] {
    const flow = JSON.parse(readFileSync(join(tmpDir, '.openfeel', 'flow.json'), 'utf-8')) as { log: StartLog[] };
    return flow.log.filter((entry) => entry.action === 'chore_start');
  }

  it('默认 TTL = 30 分钟（expires_at - started_at === 30min）', async () => {
    seed('done');
    await safeParse(['chore', '默认窗口']);
    expect(exitMock).not.toHaveBeenCalled();
    const chore = JSON.parse(readFileSync(chorePath(), 'utf-8')) as { started_at: string; expires_at: string };
    expect(Date.parse(chore.expires_at) - Date.parse(chore.started_at)).toBe(30 * 60_000);
    const logs = startLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].detail.source_allowed).toBe(false);
  });

  it('--ttl-min 10 / 30 → 生效；窗口只能改短', async () => {
    seed('done');
    await safeParse(['chore', '十分钟', '--ttl-min', '10']);
    const ten = JSON.parse(readFileSync(chorePath(), 'utf-8')) as { started_at: string; expires_at: string };
    expect(Date.parse(ten.expires_at) - Date.parse(ten.started_at)).toBe(10 * 60_000);

    await safeParse(['chore', '--end']);
    await safeParse(['chore', '三十分钟', '--ttl-min', '30']);
    const thirty = JSON.parse(readFileSync(chorePath(), 'utf-8')) as { started_at: string; expires_at: string };
    expect(Date.parse(thirty.expires_at) - Date.parse(thirty.started_at)).toBe(30 * 60_000);
  });

  it('--ttl-min 越界/非法（31/999/0/-1/1.5/abc）→ exit 1 且零写盘', async () => {
    seed('done');
    for (const bad of ['31', '999', '0', '-1', '1.5', 'abc']) {
      exitMock.mockClear();
      errorMock.mockClear();
      await safeParse(['chore', '不应开启', '--ttl-min', bad]);
      expect(exitMock).toHaveBeenCalledWith(1);
      expect(errorMock.mock.calls.length).toBeGreaterThan(0);
      expect(existsSync(chorePath())).toBe(false);
      expect(startLogs()).toHaveLength(0);
    }
  });

  it('--source → chore.json.source_allowed === true，日志 detail 同值', async () => {
    seed('done');
    await safeParse(['chore', '行为调整', '--source']);
    expect(exitMock).not.toHaveBeenCalled();
    const chore = JSON.parse(readFileSync(chorePath(), 'utf-8')) as { source_allowed?: boolean };
    expect(chore.source_allowed).toBe(true);
    const logs = startLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].detail.source_allowed).toBe(true);
  });

  it('无 --source → 不写 source_allowed 字段（旧记录同样视为未授权）', async () => {
    seed('done');
    await safeParse(['chore', '只改文案']);
    const chore = JSON.parse(readFileSync(chorePath(), 'utf-8')) as { source_allowed?: boolean };
    expect(chore.source_allowed).toBeUndefined();
    expect(startLogs()[0].detail.source_allowed).toBe(false);
  });

  it('--status 标注是否允许源码与剩余分钟', async () => {
    seed('done');
    await safeParse(['chore', '仅文档']);
    logMock.mockClear();
    await safeParse(['chore', '--status']);
    const deniedStatus = logMock.mock.calls.map((c) => String(c[0])).join('\n');
    expect(deniedStatus).toContain('源码写入：不允许');
    expect(deniedStatus).toMatch(/剩余 \d+ 分钟/);

    await safeParse(['chore', '--end']);
    await safeParse(['chore', '--source', '源码窗口']);
    logMock.mockClear();
    await safeParse(['chore', '--status']);
    expect(logMock.mock.calls.map((c) => String(c[0])).join('\n')).toContain('源码写入：允许（');
  });
});
