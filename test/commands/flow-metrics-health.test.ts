/**
 * `flow metrics` 流程健康块 — 命令级测试（v1.5.6-stage-116）
 *
 * 独立文件（不并入 `flow.test.ts`）：避开与 stage-115 的重叠面，且本文件是
 * 「`flow metrics` 人类输出」的**唯一防线**（此前只有 `--json` 断言）。
 *
 * 纪律：
 * - 时间相关断言**必须** fake timers（`vi.useFakeTimers` / `vi.setSystemTime`），否则 flaky；
 * - 断言只引用 INV-*（不把写计划时刻的实测数字当期望）；
 * - 一律在临时目录里跑，绝不触碰真实工作区的 `.openfeel/`。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// homedir → 临时目录（initProject 首次使用会写全局配置；见 flow.test.ts N4 隔离）
const mockHome = vi.hoisted(() => ({ dir: '' }));
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => mockHome.dir };
});

// 避免真实 git 调用
vi.mock('node:child_process', () => ({
  execSync: vi.fn(() => ''),
  execFileSync: vi.fn(() => ''),
}));

// wizard 动态 import 的模块级 mock（本文件不跑 wizard，仅为与 flow.test.ts 同环境）
vi.mock('@inquirer/prompts', () => ({ select: vi.fn(), input: vi.fn() }));

// INV-10：readPreflight 的 spy —— 保留真实实现（人类分支照常读盘），只计数
const preflightSpy = vi.hoisted(() => ({ readPreflight: vi.fn() }));
vi.mock('../../src/core/preflight.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/preflight.js')>();
  return {
    ...actual,
    readPreflight: ((...args: Parameters<typeof actual.readPreflight>) => {
      preflightSpy.readPreflight(...args);
      return actual.readPreflight(...args);
    }) as typeof actual.readPreflight,
  };
});

import { Command, CommanderError } from 'commander';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { registerFlowCommand } from '../../src/commands/flow.js';
import { initProject } from '../../src/core/init.js';
import type { LogEntry } from '../../src/core/flow-manager.js';

/** 固定假时钟（2026-01-01T12:00:00Z） */
const FIXED_NOW = Date.parse('2026-01-01T12:00:00.000Z');
const T = (minute: number): string => new Date(Date.parse('2026-01-01T00:00:00.000Z') + minute * 60_000).toISOString();

function entry(action: string, time: string, detail: Record<string, unknown>): LogEntry {
  return { time, agent: 'test', action, detail };
}

describe('flow metrics — 流程健康块（stage-116）', () => {
  let tmpDir: string;
  let program: Command;
  let logMock: ReturnType<typeof vi.fn>;
  let originalIsTTY: boolean | undefined;

  /** flow.json 路径 / preflight 账本路径 */
  const flowPath = (): string => join(tmpDir, '.openfeel', 'flow.json');
  const ledgerPath = (): string => join(tmpDir, '.openfeel', 'dev', '.preflight.json');

  /** 写入受控日志（最小合法 FlowData；FlowManager 只在 load 时 JSON.parse） */
  function writeFlowLog(log: LogEntry[]): void {
    const flow = {
      meta: { version: '1.0', project: 'fixture', updated: '2026-01-01T00:00:00.000Z', revision: 1 },
      pipeline: { phase: 'active', current: { stage: '', op: '' }, retry: 0 },
      stages: {},
      reviews: [],
      log,
    };
    writeFileSync(flowPath(), JSON.stringify(flow, null, 2) + '\n');
  }

  /** 写入 preflight 账本 */
  function writeLedger(at: string): void {
    const devDir = join(tmpDir, '.openfeel', 'dev');
    writeFileSync(join(devDir, '.preflight.json'), `${JSON.stringify({ at, stage: null, phase: null, revision: null }, null, 2)}\n`);
  }

  async function safeParse(args: string[]): Promise<void> {
    try {
      await program.parseAsync(args, { from: 'user' });
    } catch (err) {
      if (!(err instanceof CommanderError)) { throw err; }
    }
  }

  /** 运行 flow metrics（人类），返回拼接后的 stdout */
  async function runHuman(): Promise<string> {
    logMock.mockClear();
    await safeParse(['flow', 'metrics']);
    return logMock.mock.calls.map((call) => String(call[0])).join('\n');
  }

  beforeEach(async () => {
    mockHome.dir = mkdtempSync(join(tmpdir(), 'openfeel-metrics-home-'));
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-metrics-test-'));
    await initProject(tmpDir);
    logMock = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    originalIsTTY = process.stdout.isTTY;
    Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });
    program = new Command();
    program.exitOverride();
    registerFlowCommand(program);
    preflightSpy.readPreflight.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    rmSync(tmpDir, { recursive: true, force: true });
    rmSync(mockHome.dir, { recursive: true, force: true });
    vi.restoreAllMocks();
    Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, configurable: true });
  });

  it('人类输出含「── 流程健康 ──」与三项标签（INV-2）', async () => {
    writeFlowLog([
      entry('register_stage', T(0), { stageName: 's1', deps: [] }),
      entry('advance_stage_phase', T(10), { stageName: 's1', from: 'plan_pending', to: 'plan_review', session_id: 'project:a', resumed: false }),
    ]);
    writeLedger(new Date(Date.now() - 90_000).toISOString());
    const out = await runHuman();
    expect(out).toContain('── 流程健康 ──');
    expect(out).toContain('resumed 比例');
    expect(out).toContain('plan_pending → plan_review 平均停留');
    expect(out).toContain('最近 preflight');
    // INV-4：恒含「另有 N 条不可判定」
    expect(out).toMatch(/另有 \d+ 条不可判定/);
    // INV-5：恒含 (n=…) 或「无样本」（n=1 另有「样本不足」后缀）
    expect(out).toMatch(/\(n=\d+|无样本/);
  });

  it('无 .preflight.json → 无记录文案，仍 exit 0（降级不抛）', async () => {
    writeFlowLog([]);
    expect(existsSync(ledgerPath())).toBe(false);
    const out = await runHuman();
    expect(out).toContain('最近 preflight: 无记录（未调用过 flow next / flow status）');
  });

  it('.preflight.json 损坏 → 不抛、无记录文案', async () => {
    writeFlowLog([]);
    writeFileSync(ledgerPath(), '{');
    const out = await runHuman();
    expect(out).toContain('最近 preflight: 无记录（未调用过 flow next / flow status）');
  });

  it('--json：顶层键集/键序恒 [schemaVersion, agents]（INV-1）', async () => {
    writeFlowLog([]);
    logMock.mockClear();
    await safeParse(['flow', 'metrics', '--json']);
    const raw = logMock.mock.calls.map((call) => String(call[0])).join('\n');
    const doc = JSON.parse(raw) as Record<string, unknown>;
    expect(Object.keys(doc)).toEqual(['schemaVersion', 'agents']);
    expect(Array.isArray(doc.agents)).toBe(true);
  });

  it('--json：账本字节不变 + readPreflight 未被调用（INV-9 / INV-10）', async () => {
    writeFlowLog([]);
    writeLedger(new Date(Date.now() - 60_000).toISOString());
    const ledgerBefore = readFileSync(ledgerPath());
    const flowBefore = readFileSync(flowPath());
    preflightSpy.readPreflight.mockClear();
    logMock.mockClear();
    await safeParse(['flow', 'metrics', '--json']);
    expect(readFileSync(ledgerPath()).equals(ledgerBefore)).toBe(true);
    expect(readFileSync(flowPath()).equals(flowBefore)).toBe(true);
    expect(preflightSpy.readPreflight).toHaveBeenCalledTimes(0);
  });

  it('人类输出零写盘：账本与 flow.json 字节不变（INV-9）', async () => {
    writeFlowLog([
      entry('register_stage', T(0), { stageName: 's1', deps: [] }),
      entry('advance_stage_phase', T(5), { stageName: 's1', from: 'plan_pending', to: 'plan_review', session_id: 'project:a', resumed: false }),
    ]);
    writeLedger(new Date(Date.now() - 30_000).toISOString());
    const ledgerBefore = readFileSync(ledgerPath());
    const flowBefore = readFileSync(flowPath());
    await runHuman();
    expect(readFileSync(ledgerPath()).equals(ledgerBefore)).toBe(true);
    expect(readFileSync(flowPath()).equals(flowBefore)).toBe(true);
    // 人类分支读取账本一次（读取次数不变：仍 ≤1/次）
    expect(preflightSpy.readPreflight).toHaveBeenCalledTimes(1);
  });

  it('flow.json 不可读 → 不出健康块、不抛', async () => {
    writeFileSync(flowPath(), '{ not json');
    writeLedger(new Date(Date.now() - 30_000).toISOString());
    const out = await runHuman();
    expect(out).not.toContain('流程健康');
    // 健康块在 isLoaded() 内 ⇒ 账本也不该被读
    expect(preflightSpy.readPreflight).toHaveBeenCalledTimes(0);
  });

  it('假时钟下 age 文案逐字（vi.useFakeTimers + setSystemTime）', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    writeFlowLog([]);
    writeLedger(new Date(FIXED_NOW - 90_000).toISOString());
    const out = await runHuman();
    expect(out).toContain('最近 preflight: 2026-01-01T11:58:30 @ 1m 30s 前（有效）');
  });

  it('3 条 advance + register/add_stage 锚 fixture → 分母与配对正确', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    writeFlowLog([
      entry('register_stage', T(0), { stageName: 's1', deps: [] }),
      entry('add_stage', T(1), { stageId: 's2', phase: 'plan_pending' }),
      entry('advance_stage_phase', T(5), { stageName: 's2', from: 'plan_pending', to: 'plan_review', session_id: 'project:b', resumed: true }),
      entry('advance_stage_phase', T(10), { stageName: 's1', from: 'plan_pending', to: 'plan_review', session_id: 'project:a' }),
      entry('advance_stage_phase', T(11), { stageName: 's1', from: 'plan_review', to: 'plan_passed', session_id: 'project:a', resumed: false }),
    ]);
    writeLedger(new Date(FIXED_NOW - 30_000).toISOString());
    const out = await runHuman();
    // resumed：3 条 advance，带布尔 2 条（1 true / 1 false），不可判定 1 条
    expect(out).toContain('resumed 比例: 1/2 (50.0%) · 另有 1 条不可判定');
    // dwell：s1 = register(T0) → T10 = 10m；s2 = add_stage(T1) → T5 = 4m ⇒ avg 7m，n=2
    expect(out).toContain('plan_pending → plan_review 平均停留: 7m (n=2)');
    expect(out).toContain('最近 preflight: 2026-01-01T11:59:30 @ 30s 前（有效）');
  });
});
