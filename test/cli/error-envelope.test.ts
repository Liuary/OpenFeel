/**
 * 错误层测试（v1.2.2-stage-95 op-002）
 *
 * 覆盖：12 行 code→kind→exitCode 映射表逐行断言 / envelope 形态 / refusal 主场景 /
 *       Commander 用法错误 / 并发冲突 / internal 双模式（JSON + 非 JSON）/
 *       命令层 internal / zh-en code 一致 / 非 JSON 文案与退出码不变。
 * 隔离：临时项目 fixture + 进程内 parseAsync（必要时 setJsonMode(true)）；不触碰真实工作区。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// 隔离：homedir → 临时目录（防 initProject 写真实全局配置）
const mockHome = vi.hoisted(() => ({ dir: '' }));
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => mockHome.dir };
});

// 被动部署检测旁路（不读真实部署状态）
vi.mock('../../src/cli/deploy-check-output.js', () => ({ emitGlobalDeployCheck: vi.fn() }));

import { Command } from 'commander';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, openSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CLI_ERROR_CODES, CLI_ERROR_TABLE, getCliErrorSpec, isInternalCode } from '../../src/core/errors.js';
import { handleConcurrentConflict } from '../../src/commands/shared/errors.js';
import { resetJsonModeForTest, setJsonMode } from '../../src/commands/shared/json-output.js';
import { registerFlowCommand } from '../../src/commands/flow.js';
import { registerArchiveCommand } from '../../src/commands/archive.js';
import { FlowManager, type FlowData, isFlowConcurrentError } from '../../src/core/flow-manager.js';
import { withFileLock, projectLockPath } from '../../src/core/fs/file-lock.js';
import { initProject } from '../../src/core/init.js';
import { setConfigValue } from '../../src/core/config.js';
import { program as rootProgram, runCli } from '../../src/cli/index.js';

describe('错误层（stage-95 op-002）', () => {
  let tmpDir: string;
  let program: Command;
  let logMock: ReturnType<typeof vi.fn>;
  let errorMock: ReturnType<typeof vi.fn>;
  let warnMock: ReturnType<typeof vi.fn>;
  let exitMock: ReturnType<typeof vi.fn>;
  let cwdMock: ReturnType<typeof vi.fn>;
  let prevExitCode: number | string | undefined;
  let prevLog: string | undefined;

  beforeEach(async () => {
    mockHome.dir = mkdtempSync(join(tmpdir(), 'openfeel-err-home-'));
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-err-test-'));
    await initProject(tmpDir);
    // 与 flow.test 同基线：full 模式（快线裁剪会影响 test_passed→done 的可达性）
    setConfigValue(tmpDir, 'workflow_mode', 'full');

    logMock = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorMock = vi.spyOn(console, 'error').mockImplementation(() => {});
    warnMock = vi.spyOn(console, 'warn').mockImplementation(() => {});
    exitMock = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    cwdMock = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);

    prevExitCode = process.exitCode;
    process.exitCode = 0;
    prevLog = process.env.OPENFEEL_LOG;
    vi.stubEnv('OPENFEEL_LOG', '0');

    program = new Command();
    program.exitOverride();
    registerFlowCommand(program);
    registerArchiveCommand(program);
  });

  afterEach(() => {
    resetJsonModeForTest();
    process.exitCode = prevExitCode;
    vi.unstubAllEnvs();
    if (prevLog !== undefined) {
      process.env.OPENFEEL_LOG = prevLog;
    }
    rmSync(tmpDir, { recursive: true, force: true });
    rmSync(mockHome.dir, { recursive: true, force: true });
    logMock.mockRestore();
    errorMock.mockRestore();
    warnMock.mockRestore();
    exitMock.mockRestore();
    cwdMock.mockRestore();
    mockHome.dir = '';
  });

  /** 安全解析（吞掉 CommanderError，不中断测试） */
  async function safeParse(args: string[]): Promise<void> {
    try {
      await program.parseAsync(args, { from: 'user' });
    } catch (err) {
      if (!(err as { code?: string })?.code?.startsWith('commander.')) {
        throw err;
      }
    }
  }

  /** 写入固定 flow 数据（覆盖 initProject 默认内容） */
  function setFlowData(phase: FlowData['stages'][string]['phase'], reviews: FlowData['reviews'] = []): void {
    const mgr = new FlowManager(tmpDir);
    const data: FlowData = {
      meta: { version: '1.0', project: 'ErrTest', updated: '2026-01-01T00:00:00Z' },
      pipeline: { phase: 'active', current: { stage: 'v1.0.0-stage-01', op: '' }, retry: 0 },
      stages: {
        'v1.0.0-stage-01': { name: 'v1.0.0-stage-01', phase, status: 'planned', deps: [], ops: {} },
      },
      reviews,
      log: [],
    };
    mgr.setData(data);
    mgr.save();
  }

  /** 取最近一次 stdout 文档 */
  function lastDoc(): Record<string, unknown> {
    return JSON.parse(logMock.mock.calls[logMock.mock.calls.length - 1][0] as string) as Record<string, unknown>;
  }

  // ── 1：12 行映射表逐行断言 ──

  it('① 映射表：12 行、code 唯一、逐行 code/kind/exitCode 与契约 §3 一致', () => {
    const expected: Array<[string, string, number]> = [
      ['NO_INIT', 'refusal', 1],
      ['INVALID_ARGUMENT', 'refusal', 1],
      ['STAGE_NOT_FOUND', 'refusal', 1],
      ['PHASE_TRANSITION_ILLEGAL', 'refusal', 1],
      ['PHASE_PATH_NOT_FOUND', 'refusal', 1],
      ['BLOCKING_REVIEWS', 'refusal', 1],
      ['ARCHIVE_GATE_REJECTED', 'refusal', 1],
      ['ARCHIVE_WRITE_FAILED', 'internal', 3],
      ['PROJECT_NOT_FOUND', 'refusal', 1],
      ['FLOW_CONCURRENT_CONFLICT', 'refusal', 2],
      ['INTERNAL_ERROR', 'internal', 3],
      ['ARCHIVE_FAILED', 'refusal', 1],
    ];
    expect(CLI_ERROR_TABLE).toHaveLength(12);
    expect(new Set(CLI_ERROR_TABLE.map((r) => r.code)).size).toBe(12);
    expect(CLI_ERROR_TABLE.map((r) => [r.code, r.kind, r.exitCode])).toEqual(expected);
    // 码表键与 code 字段一致（防字符串漂移）
    for (const [key, spec] of Object.entries(CLI_ERROR_CODES)) {
      expect(spec.code).toBe(key);
      expect(getCliErrorSpec(spec.code)).toEqual(spec);
    }
    expect(isInternalCode('INTERNAL_ERROR')).toBe(true);
    expect(isInternalCode('ARCHIVE_WRITE_FAILED')).toBe(true);
    expect(isInternalCode('INVALID_ARGUMENT')).toBe(false);
  });

  // ── 2：envelope 形态 ──

  it('② envelope 形态：flow phases --mode bogus → INVALID_ARGUMENT/refusal/1，键序固定', async () => {
    setJsonMode(true);
    await safeParse(['flow', 'phases', '--json', '--mode', 'bogus']);

    expect(exitMock).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    expect(errorMock).not.toHaveBeenCalled();
    expect(logMock).toHaveBeenCalledTimes(1);
    const doc = lastDoc() as { schemaVersion: number; error: Record<string, unknown> };
    expect(Object.keys(doc)).toEqual(['schemaVersion', 'error']);
    expect(doc.schemaVersion).toBe(1);
    expect(Object.keys(doc.error)).toEqual(['code', 'kind', 'message', 'detail']);
    expect(doc.error.code).toBe('INVALID_ARGUMENT');
    expect(doc.error.kind).toBe('refusal');
    expect(typeof doc.error.message).toBe('string');
    expect(doc.error.detail).toEqual({ field: 'workflowMode', value: 'bogus', allowed: ['full', 'fast', 'general'] });
  });

  // ── 3：refusal 主场景 ──

  it('③a PHASE_TRANSITION_ILLEGAL：advance --to bogus → refusal/1', async () => {
    setFlowData('plan_pending');
    setJsonMode(true);
    await safeParse(['flow', 'advance', '--stage', 'v1.0.0-stage-01', '--to', 'bogus', '--json']);

    expect(exitMock).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    expect(logMock).toHaveBeenCalledTimes(1);
    expect(errorMock).not.toHaveBeenCalled();
    const doc = lastDoc() as { error: { code: string; kind: string; detail: Record<string, unknown> } };
    expect(doc.error.code).toBe('PHASE_TRANSITION_ILLEGAL');
    expect(doc.error.kind).toBe('refusal');
    expect(doc.error.detail.stage).toBe('v1.0.0-stage-01');
    expect(doc.error.detail.to).toBe('bogus');
    expect(Array.isArray(doc.error.detail.allowed)).toBe(true);
  });

  it('③b PHASE_PATH_NOT_FOUND：从 done 前进 → 无合法路径 refusal/1', async () => {
    setFlowData('done');
    setJsonMode(true);
    await safeParse(['flow', 'advance', '--stage', 'v1.0.0-stage-01', '--to', 'plan_pending', '--json']);

    expect(exitMock).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    expect(logMock).toHaveBeenCalledTimes(1);
    const doc = lastDoc() as { error: { code: string; kind: string; detail: Record<string, unknown> } };
    expect(doc.error.code).toBe('PHASE_PATH_NOT_FOUND');
    expect(doc.error.kind).toBe('refusal');
    expect(doc.error.detail.from).toBe('done');
    expect(doc.error.detail.to).toBe('plan_pending');
  });

  it('③c BLOCKING_REVIEWS：to done + blocking open REV → refusal/1', async () => {
    setFlowData('test_passed', [
      {
        id: 'REV-95-BLK', op: 'v1.0.0-stage-01.op-001', title: 'blocking', status: 'open', blocking: true,
        priority: 'high', filed_by: 'openfeel-reviewer', filed_at: '2026-01-01T00:00:00Z',
      },
    ]);
    setJsonMode(true);
    await safeParse(['flow', 'advance', '--stage', 'v1.0.0-stage-01', '--to', 'done', '--json']);

    expect(exitMock).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    expect(logMock).toHaveBeenCalledTimes(1);
    const doc = lastDoc() as { error: { code: string; kind: string; detail: Record<string, unknown> } };
    expect(doc.error.code).toBe('BLOCKING_REVIEWS');
    expect(doc.error.kind).toBe('refusal');
    expect(doc.error.detail).toEqual({ stage: 'v1.0.0-stage-01', to: 'done', reviews: ['REV-95-BLK'] });
  });

  it('③d STAGE_NOT_FOUND：flow phases --stage 未注册 → refusal/1', async () => {
    setFlowData('plan_pending');
    setJsonMode(true);
    await safeParse(['flow', 'phases', '--json', '--stage', 'v9.9.9-stage-99']);

    expect(exitMock).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    const doc = lastDoc() as { error: { code: string; kind: string; detail: Record<string, unknown> } };
    expect(doc.error.code).toBe('STAGE_NOT_FOUND');
    expect(doc.error.kind).toBe('refusal');
    expect(doc.error.detail).toEqual({ stage: 'v9.9.9-stage-99' });
  });

  it('③e NO_INIT：未初始化项目 advance → refusal/1', async () => {
    const emptyDir = mkdtempSync(join(tmpdir(), 'openfeel-err-empty-'));
    try {
      cwdMock.mockReturnValue(emptyDir);
      setJsonMode(true);
      await safeParse(['flow', 'advance', '--stage', 'v1.0.0-stage-01', '--to', 'bogus', '--json']);

      expect(exitMock).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
      const doc = lastDoc() as { error: { code: string; kind: string; detail: unknown } };
      expect(doc.error.code).toBe('NO_INIT');
      expect(doc.error.kind).toBe('refusal');
      expect(doc.error.detail).toBeNull();
    } finally {
      rmSync(emptyDir, { recursive: true, force: true });
    }
  });

  // ── 4：Commander 用法错误（实跑 runCli） ──

  it('④ 用法错误：runCli flow nope --json → INVALID_ARGUMENT/1、stdout 无人类文本', () => {
    const prevArgv = process.argv;
    process.argv = ['node', 'openfeel', 'flow', 'nope', '--json'];
    try {
      runCli();

      expect(exitMock).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
      // stdout 仅一个 envelope；Commander 错误文本被静默
      expect(logMock).toHaveBeenCalledTimes(1);
      const doc = lastDoc() as { schemaVersion: number; error: Record<string, unknown> };
      expect(Object.keys(doc)).toEqual(['schemaVersion', 'error']);
      expect(doc.error.code).toBe('INVALID_ARGUMENT');
      expect(doc.error.kind).toBe('refusal');
      expect((doc.error.detail as { commanderCode?: string }).commanderCode).toBeTruthy();
      expect(errorMock).not.toHaveBeenCalled();
    } finally {
      process.argv = prevArgv;
      process.exitCode = 0;
    }
  });

  // ── 5：并发冲突 ──

  it('⑤ 并发：JSON 模式 → FLOW_CONCURRENT_CONFLICT/refusal/exit 2', () => {
    setJsonMode(true);
    process.exitCode = 0;
    handleConcurrentConflict({ expectedRevision: 1, actualRevision: 2 }, 'zh-CN');

    expect(exitMock).toHaveBeenCalledWith(2);
    expect(process.exitCode).toBe(2);
    expect(errorMock).not.toHaveBeenCalled();
    expect(logMock).toHaveBeenCalledTimes(1);
    const doc = lastDoc() as { error: { code: string; kind: string; detail: unknown } };
    expect(doc.error.code).toBe('FLOW_CONCURRENT_CONFLICT');
    expect(doc.error.kind).toBe('refusal');
    expect(doc.error.detail).toEqual({ expectedRevision: 1, actualRevision: 2 });
  });

  // ── 6：internal 双模式（runCli 统一 catch） ──

  it('⑥ internal（JSON）：parse 抛错 → INTERNAL_ERROR/internal/exitCode 3，不调用 process.exit', () => {
    const prevArgv = process.argv;
    const parseSpy = vi.spyOn(rootProgram, 'parse').mockImplementation(() => {
      throw new Error('boom');
    });
    process.argv = ['node', 'openfeel', 'flow', 'status', '--json'];
    process.exitCode = 0;
    try {
      runCli();

      expect(exitMock).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(3);
      const doc = lastDoc() as { error: { code: string; kind: string; detail: Record<string, unknown> } };
      expect(doc.error.code).toBe('INTERNAL_ERROR');
      expect(doc.error.kind).toBe('internal');
      expect(doc.error.detail.message).toBe('boom');
    } finally {
      parseSpy.mockRestore();
      process.argv = prevArgv;
      process.exitCode = 0;
    }
  });

  it('⑥ internal（非 JSON）：parse 抛错 → stderr 含堆栈、exitCode 3，不调用 process.exit', () => {
    const prevArgv = process.argv;
    const parseSpy = vi.spyOn(rootProgram, 'parse').mockImplementation(() => {
      throw new Error('boom');
    });
    process.argv = ['node', 'openfeel', 'flow', 'status'];
    process.exitCode = 0;
    try {
      runCli();

      expect(exitMock).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(3);
      const errText = errorMock.mock.calls.map((c) => c[0] as string).join('\n');
      expect(errText).toContain('boom');
      expect(errText).toContain('Error'); // 含堆栈形态
    } finally {
      parseSpy.mockRestore();
      process.argv = prevArgv;
      process.exitCode = 0;
    }
  });

  // ── 7：命令层 internal（flow health --fix 写盘失败） ──

  it('⑦ 命令层 internal：health --fix 抛错 → INTERNAL_ERROR/3', async () => {
    setFlowData('plan_pending');
    const spy = vi.spyOn(FlowManager.prototype, 'reconcileStatusMd').mockImplementation(() => {
      throw new Error('disk full');
    });
    setJsonMode(true);
    try {
      await safeParse(['flow', 'health', '--fix', '--json']);

      expect(exitMock).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(3);
      const doc = lastDoc() as { error: { code: string; kind: string; detail: Record<string, unknown> } };
      expect(doc.error.code).toBe('INTERNAL_ERROR');
      expect(doc.error.kind).toBe('internal');
      expect(doc.error.detail.message).toBe('disk full');
    } finally {
      spy.mockRestore();
    }
  });

  // ── 8：zh/en code 一致、message 不同 ──

  it('⑧ zh/en：同一 refusal 的 code 相同、message 不同', async () => {
    const infoPath = join(tmpDir, '.openfeel', '.info.json');
    const messages: string[] = [];
    const codes: string[] = [];

    for (const lang of ['zh-CN', 'en']) {
      mkdirSync(join(tmpDir, '.openfeel'), { recursive: true });
      writeFileSync(infoPath, JSON.stringify({ user: 't', lang }), 'utf-8');
      logMock.mockClear();
      errorMock.mockClear();
      setJsonMode(true);
      await safeParse(['flow', 'phases', '--json', '--mode', 'bogus']);
      const doc = lastDoc() as { error: { code: string; kind: string; message: string } };
      codes.push(doc.error.code);
      messages.push(doc.error.message);
      expect(doc.error.kind).toBe('refusal');
    }

    expect(codes[0]).toBe(codes[1]);
    expect(messages[0]).not.toBe(messages[1]);
    expect(messages[0]).toContain('取值非法');
    expect(messages[1]).toContain('Invalid value');
  });

  // ── 9：非 JSON 不变 ──

  it('⑨ 非 JSON：同一 refusal → stderr 文案逐字、exit 1', async () => {
    setFlowData('plan_pending');
    setJsonMode(false);
    await safeParse(['flow', 'phases', '--mode', 'bogus']);

    expect(exitMock).toHaveBeenCalledWith(1);
    expect(process.exitCode).toBe(1);
    expect(logMock).not.toHaveBeenCalled();
    const errText = errorMock.mock.calls.map((c) => c[0] as string).join('\n');
    // 逐字保持既有 stage.set.invalidValueTmpl 文案
    expect(errText).toContain('取值非法');
    expect(errText).toContain('bogus');
    expect(errText).toContain('full, fast, general');
  });

  // ── ⑩ REV-95-008：文件锁等待超时归 INTERNAL_ERROR/internal/3 ──

  it('⑩a REV-95-008 单元级：锁等待超时抛普通 Error（非 FlowConcurrentModificationError）', () => {
    const lockPath = projectLockPath(tmpDir, 'probe');
    mkdirSync(join(tmpDir, '.openfeel', 'tmp', 'locks'), { recursive: true });
    // 预创建锁文件（O_EXCL 会 EEXIST）→ 等待窗口内无法获取
    const fd = openSync(lockPath, 'wx');
    closeSync(fd);

    let caught: unknown;
    try {
      withFileLock(lockPath, () => {}, { timeoutMs: 5, staleMs: 60000 });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain('获取文件锁超时');
    // 关键边界：锁超时不是并发冲突（不得归 FLOW_CONCURRENT_CONFLICT/2）
    expect(isFlowConcurrentError(caught)).toBe(false);
  });

  it('⑩b REV-95-008 命令级：archive <stage> --json 的 save 锁超时 → INTERNAL_ERROR/internal/3', async () => {
    setFlowData('plan_pending');
    // 模拟 mgr.save() 内 withFileLock 抛普通 Error（锁等待超时）
    const spy = vi.spyOn(FlowManager.prototype, 'save').mockImplementationOnce(() => {
      throw new Error('获取文件锁超时（5000ms）：flow.lock');
    });
    setJsonMode(true);
    try {
      await safeParse(['archive', 'v1.0.0-stage-01', '--json']);

      expect(exitMock).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(3);
      // stdout 恰一个 envelope（archivePath 写盘成功但不落入 stdout）
      expect(logMock).toHaveBeenCalledTimes(1);
      const doc = lastDoc() as {
        schemaVersion: number;
        error: { code: string; kind: string; message: string; detail: unknown };
      };
      expect(Object.keys(doc)).toEqual(['schemaVersion', 'error']);
      expect(doc.error.code).toBe('INTERNAL_ERROR');
      expect(doc.error.kind).toBe('internal');
      expect(doc.error.message).toContain('获取文件锁超时');
      expect(doc.error.detail).not.toBeNull();
    } finally {
      spy.mockRestore();
      resetJsonModeForTest();
    }
  });

  // ── ⑪ REV-95-009：并发冲突退出机制复核（仅登记，改造转 stage-98） ──

  it('⑪ REV-95-009：stdout 恰一个 envelope 且 process.exit(2)（与 failCli 置码返回语义等价）', () => {
    setJsonMode(true);
    process.exitCode = 0;

    handleConcurrentConflict({ expectedRevision: 3, actualRevision: 4 }, 'en');

    // stdout 恰一个 envelope 文档
    expect(logMock).toHaveBeenCalledTimes(1);
    expect(errorMock).not.toHaveBeenCalled();
    const doc = JSON.parse(logMock.mock.calls[0][0] as string) as {
      schemaVersion: number;
      error: { code: string; kind: string; detail: unknown };
    };
    expect(Object.keys(doc)).toEqual(['schemaVersion', 'error']);
    expect(doc.error.code).toBe('FLOW_CONCURRENT_CONFLICT');
    expect(doc.error.kind).toBe('refusal');
    expect(doc.error.detail).toEqual({ expectedRevision: 3, actualRevision: 4 });
    // 退出机制差异：handleConcurrentConflict 调 process.exit(2)（failCli 为置码后返回）
    // 机制差异已登记契约 §14.2，统一改造转 stage-98；本阶段不改实现。
    expect(exitMock).toHaveBeenCalledTimes(1);
    expect(exitMock).toHaveBeenCalledWith(2);
    expect(process.exitCode).toBe(2);
  });
});
