/**
 * plan 命令集成测试
 * 测试 openfeel plan stage add|list 和 scheme create|list 的 CLI 行为
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Command, CommanderError } from 'commander';
import { registerPlanCommand } from '../../src/commands/plan.js';
import { initProject } from '../../src/core/init.js';
import { FlowManager } from '../../src/core/flow-manager.js';
import { existsSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('plan 命令', () => {
  let tmpDir: string;
  let program: Command;
  let logMock: ReturnType<typeof vi.fn>;
  let cwdMock: ReturnType<typeof vi.fn>;
  let exitMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-cmd-plan-test-'));
    // 初始化工作区
    await initProject(tmpDir);

    // mock console.log 捕获输出
    logMock = vi.spyOn(console, 'log').mockImplementation(() => {});
    // mock process.cwd() 指向临时目录
    cwdMock = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    // mock process.exit 防止退出
    exitMock = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);

    // 每次创建全新的 Commander 实例，启用 exit override
    program = new Command();
    program.exitOverride(); // 将 process.exit 转为抛出 CommanderError
    registerPlanCommand(program);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    logMock.mockRestore();
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

  // ── plan stage 子命令 ──

  it('plan stage add 应创建阶段目录和文件', async () => {
    await safeParse(['plan', 'stage', 'add', 'stage-01']);

    // 验证阶段目录存在
    const stageDir = join(tmpDir, '.openfeel', 'stages', 'stage-01');
    expect(existsSync(stageDir)).toBe(true);
    expect(existsSync(join(stageDir, 'overview.md'))).toBe(true);
    expect(existsSync(join(stageDir, 'status.md'))).toBe(true);

    // 验证 console.log 输出
    expect(logMock).toHaveBeenCalledWith('已创建阶段: stage-01');
  });

  it('plan stage list 应列出已创建阶段（空）', async () => {
    await safeParse(['plan', 'stage', 'list']);

    // stages 目录存在但为空时输出"暂无"
    expect(logMock).toHaveBeenCalledWith('暂无工作阶段');
  });

  it('plan stage add 后再 list 应列出阶段', async () => {
    // 先添加阶段
    await safeParse(['plan', 'stage', 'add', 'stage-01']);

    // 清除之前的 logMock 调用记录
    logMock.mockClear();

    // 再列出
    await safeParse(['plan', 'stage', 'list']);

    // 验证输出包含阶段信息
    const calls = logMock.mock.calls.map((c) => c[0] as string);
    const stageLine = calls.find((line) => line.includes('stage-01'));
    expect(stageLine).toBeDefined();
  });

  // ── plan scheme 子命令 ──

  it('plan scheme create 应创建操作方案', async () => {
    // 先创建阶段（scheme create 需要阶段存在）
    await safeParse(['plan', 'stage', 'add', 'stage-01']);
    logMock.mockClear();

    await safeParse(['plan', 'scheme', 'create', 'stage-01', '实现核心功能']);

    // 验证方案文件存在
    const opsDir = join(tmpDir, '.openfeel', 'stages', 'stage-01', 'ops');
    expect(existsSync(opsDir)).toBe(true);

    // 验证输出
    expect(logMock).toHaveBeenCalledWith(
      expect.stringContaining('已创建操作方案'),
    );
  });

  it('plan scheme list 应列出操作方案', async () => {
    // 先创建阶段和方案
    await safeParse(['plan', 'stage', 'add', 'stage-01']);
    await safeParse(['plan', 'scheme', 'create', 'stage-01', '实现核心功能']);
    logMock.mockClear();

    // 列出方案
    await safeParse(['plan', 'scheme', 'list']);

    // 验证输出包含方案信息
    const calls = logMock.mock.calls.map((c) => c[0] as string);
    const schemeLine = calls.find(
      (line) => line.includes('stage-01') && line.includes('实现核心功能'),
    );
    expect(schemeLine).toBeDefined();
  });

  it('plan scheme list 未创建方案时应提示暂无', async () => {
    // 先创建阶段（不创建方案）
    await safeParse(['plan', 'stage', 'add', 'stage-01']);
    logMock.mockClear();

    await safeParse(['plan', 'scheme', 'list']);

    expect(logMock).toHaveBeenCalledWith('暂无操作方案');
  });

  it('plan scheme create 应同步到 flow.json', async () => {
    // 先创建阶段
    await safeParse(['plan', 'stage', 'add', 'stage-01']);
    // 同时需要在 flow.json 中存在该 stage 条目才能同步
    // initProject 已创建空 stages，但需手动补 stage 条目
    const flowMgr = new FlowManager(tmpDir);
    const flowData = flowMgr.getData();
    if (flowData) {
      flowData.stages['stage-01'] = {
        name: 'stage-01',
        status: 'in_progress',
        deps: [],
        ops: {},
      };
      flowMgr.save();
    }

    logMock.mockClear();
    await safeParse(['plan', 'scheme', 'create', 'stage-01', '实现核心功能']);

    // 重新读取 flow.json 验证 op 已注册
    const flowPath = join(tmpDir, '.openfeel', 'flow.json');
    const flowContent = JSON.parse(readFileSync(flowPath, 'utf-8'));
    const ops = flowContent.stages['stage-01']?.ops;
    expect(ops).toBeDefined();
    // 应该有至少一个 op
    const opIds = Object.keys(ops);
    expect(opIds.length).toBeGreaterThan(0);
    // op 标题应包含"实现核心功能"
    const firstOp = Object.values(ops)[0] as Record<string, unknown>;
    expect(firstOp.title).toBe('实现核心功能');
  });
});
