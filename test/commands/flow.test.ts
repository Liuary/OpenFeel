/**
 * flow 根命令集成测试（v1.1.2-stage-41）
 * 覆盖 flow phases（默认 / --json）与 flow stage remove（--dry-run / 非 TTY --purge 拒绝 / deps 引用）
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Command, CommanderError } from 'commander';
import { registerFlowCommand } from '../../src/commands/flow.js';
import { initProject } from '../../src/core/init.js';
import { FlowManager } from '../../src/core/flow-manager.js';
import { mkdtempSync, rmSync, readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('flow 命令（stage-41）', () => {
  let tmpDir: string;
  let program: Command;
  let logMock: ReturnType<typeof vi.fn>;
  let errorMock: ReturnType<typeof vi.fn>;
  let cwdMock: ReturnType<typeof vi.fn>;
  let exitMock: ReturnType<typeof vi.fn>;
  /** 原始 isTTY 值（测试中强制非 TTY，结束后恢复） */
  let originalIsTTY: boolean | undefined;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-cmd-flow-test-'));
    // 初始化工作区（temp 项目无 pipeline.yaml → 走默认 15 phase 配置）
    await initProject(tmpDir);

    logMock = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorMock = vi.spyOn(console, 'error').mockImplementation(() => {});
    cwdMock = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    exitMock = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);

    // 强制非 TTY：覆盖「非 TTY 拒绝 --purge」分支，避免测试环境为交互终端时进入 confirm
    originalIsTTY = process.stdout.isTTY;
    Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });

    program = new Command();
    program.exitOverride();
    registerFlowCommand(program);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    logMock.mockRestore();
    errorMock.mockRestore();
    cwdMock.mockRestore();
    exitMock.mockRestore();
    Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, configurable: true });
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

  // ── flow phases ──

  it('flow phases 默认输出含全部 15 个 phase 与转移表', async () => {
    await safeParse(['flow', 'phases']);

    const phaseLines = logMock.mock.calls
      .map((c) => c[0] as string)
      .filter((line) => line.startsWith('  - '));
    expect(phaseLines).toHaveLength(15);

    const out = logMock.mock.calls.map((c) => c[0] as string).join('\n');
    expect(out).toContain('- plan_pending');
    expect(out).toContain('- done');
    expect(out).toContain('plan_pending → [plan_review, plan_passed]');
  });

  it('flow phases --json 可 JSON.parse，顶层键为 phases / transitions', async () => {
    await safeParse(['flow', 'phases', '--json']);

    const raw = logMock.mock.calls[0][0] as string;
    const obj = JSON.parse(raw) as { phases: string[]; transitions: Record<string, string[]> };
    expect(Object.keys(obj)).toEqual(['phases', 'transitions']);
    expect(obj.phases).toHaveLength(15);
    expect(obj.transitions['plan_pending']).toEqual(['plan_review', 'plan_passed']);
  });

  // ── flow stage remove ──

  it('flow stage remove --dry-run 不修改 flow.json', async () => {
    const mgr = new FlowManager(tmpDir);
    mgr.addStage('v1.1.2-stage-80');
    mgr.addStage('v1.1.2-stage-81'); // current = stage-81，使 stage-80 非活跃
    mgr.save();

    const flowPath = join(tmpDir, '.openfeel', 'flow.json');
    const before = readFileSync(flowPath, 'utf-8');

    await safeParse(['flow', 'stage', 'remove', 'v1.1.2-stage-80', '--dry-run']);

    expect(readFileSync(flowPath, 'utf-8')).toBe(before);
    const out = logMock.mock.calls.map((c) => c[0] as string).join('\n');
    expect(out).toContain('Dry-run');
    expect(exitMock).not.toHaveBeenCalled();
  });

  it('flow stage remove --dry-run 被引用时 exit 1 且输出引用者', async () => {
    const mgr = new FlowManager(tmpDir);
    mgr.addStage('v1.1.2-stage-81');
    mgr.addStage('v1.1.2-stage-82');
    // stage-82 依赖 stage-81；current 此时为 stage-82
    mgr.getData()!.stages['v1.1.2-stage-82'].deps = ['v1.1.2-stage-81'];
    mgr.save();

    await safeParse(['flow', 'stage', 'remove', 'v1.1.2-stage-81', '--dry-run']);

    expect(exitMock).toHaveBeenCalledWith(1);
    const out = logMock.mock.calls.map((c) => c[0] as string).join('\n');
    expect(out).toContain('v1.1.2-stage-82');
  });

  it('flow stage remove --purge（非 TTY，无 --force）→ exit 1 且目录保留', async () => {
    const mgr = new FlowManager(tmpDir);
    mgr.addStage('v1.1.2-stage-83');
    mgr.save();

    const stageDir = join(tmpDir, '.openfeel', 'plan', 'v1', 'stage-83');
    mkdirSync(stageDir, { recursive: true });
    writeFileSync(join(stageDir, 'status.md'), 'x', 'utf-8');

    await safeParse(['flow', 'stage', 'remove', 'v1.1.2-stage-83', '--purge']);

    expect(exitMock).toHaveBeenCalledWith(1);
    expect(existsSync(stageDir)).toBe(true);
    expect(errorMock).toHaveBeenCalled();
  });
});
