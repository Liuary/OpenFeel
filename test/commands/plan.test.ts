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
  let errorMock: ReturnType<typeof vi.fn>;
  let cwdMock: ReturnType<typeof vi.fn>;
  let exitMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-cmd-plan-test-'));
    // 初始化工作区
    await initProject(tmpDir);

    // mock console.log 捕获输出
    logMock = vi.spyOn(console, 'log').mockImplementation(() => {});
    // mock console.error 捕获错误输出
    errorMock = vi.spyOn(console, 'error').mockImplementation(() => {});
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

  // ── plan stage 子命令 ──

  it('plan stage add 应创建阶段目录和文件', async () => {
    await safeParse(['plan', 'stage', 'add', 'stage-01']);

    // 验证阶段目录存在
    const stageDir = join(tmpDir, '.openfeel', 'plan', 'v1', 'stage-01');
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
    const opsDir = join(tmpDir, '.openfeel', 'plan', 'v1', 'stage-01', 'ops');
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
      flowData.stages['v1.0.0-stage-01'] = {
        name: 'v1.0.0-stage-01',
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
    const ops = flowContent.stages['v1.0.0-stage-01']?.ops;
    expect(ops).toBeDefined();
    // 应该有至少一个 op
    const opIds = Object.keys(ops);
    expect(opIds.length).toBeGreaterThan(0);
    // op 标题应包含"实现核心功能"
    const firstOp = Object.values(ops)[0] as Record<string, unknown>;
    expect(firstOp.title).toBe('实现核心功能');
  });

  // ── stage-41：stageId 校验（op-002/op-005） ──

  it('plan stage add 非法 id → stderr 报「非法阶段 ID」+「建议名称」并 exit 1', async () => {
    await safeParse(['plan', 'stage', 'add', 'foo']);
    const errOut = errorMock.mock.calls.map((c) => c[0] as string).join('\n');
    expect(errOut).toContain('非法阶段 ID');
    expect(errOut).toContain('建议名称');
    expect(exitMock).toHaveBeenCalledWith(1);
  });

  it('plan stage add v1.1 → 建议名限定版本前缀（v1.1-stage-）', async () => {
    await safeParse(['plan', 'stage', 'add', 'v1.1']);
    const errOut = errorMock.mock.calls.map((c) => c[0] as string).join('\n');
    expect(errOut).toContain('建议名称：v1.1-stage-');
    expect(exitMock).toHaveBeenCalledWith(1);
  });

  // ── stage-41：plan stage add --deps（op-004） ──

  it('plan stage add --deps a,b（逗号分隔）落 flow.json', async () => {
    await safeParse(['plan', 'stage', 'add', 'stage-03', '--deps', 'a,b']);
    const flow = JSON.parse(readFileSync(join(tmpDir, '.openfeel', 'flow.json'), 'utf-8'));
    expect(flow.stages['v1.0.0-stage-03'].deps).toEqual(['a', 'b']);
  });

  it('plan stage add --deps a b（空格分隔）等价', async () => {
    await safeParse(['plan', 'stage', 'add', 'stage-04', '--deps', 'a', 'b']);
    const flow = JSON.parse(readFileSync(join(tmpDir, '.openfeel', 'flow.json'), 'utf-8'));
    expect(flow.stages['v1.0.0-stage-04'].deps).toEqual(['a', 'b']);
  });

  it('plan stage add 不传 --deps → deps 为空数组', async () => {
    await safeParse(['plan', 'stage', 'add', 'stage-05']);
    const flow = JSON.parse(readFileSync(join(tmpDir, '.openfeel', 'flow.json'), 'utf-8'));
    expect(flow.stages['v1.0.0-stage-05'].deps).toEqual([]);
  });

  // ── stage-41：(series, stageDir) 冲突（op-002） ──

  it('plan stage add (series, stageDir) 冲突 → 报错 + exit 1', async () => {
    const flowMgr = new FlowManager(tmpDir);
    flowMgr.addStage('v4-stage-04');
    flowMgr.save();

    errorMock.mockClear();
    await safeParse(['plan', 'stage', 'add', 'v4.0.0-stage-04']);

    const errOut = errorMock.mock.calls.map((c) => c[0] as string).join('\n');
    expect(errOut).toContain('阶段目录冲突');
    expect(exitMock).toHaveBeenCalledWith(1);
  });
});
