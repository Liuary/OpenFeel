/**
 * 命令层共享错误处理测试（stage-50 op-004 T38 / T42）
 * 断言并发冲突与 addStage 失败均为单点处理（i18n 文案 + 统一退出码）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { handleAddStageError, handleConcurrentConflict } from '../../src/commands/shared/errors.js';
import { StageDirConflictError, FlowConcurrentModificationError } from '../../src/core/flow-manager.js';
import { setJsonMode } from '../../src/commands/shared/json-output.js';

describe('shared error handlers（stage-50 op-004 T38/T42）', () => {
  let errorMock: ReturnType<typeof vi.fn>;
  let exitMock: ReturnType<typeof vi.fn>;
  let prevExitCode: number | string | undefined;

  beforeEach(() => {
    setJsonMode(false);
    prevExitCode = process.exitCode;
    errorMock = vi.spyOn(console, 'error').mockImplementation(() => {});
    exitMock = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`__EXIT__${code ?? 0}`);
    }) as never);
  });

  afterEach(() => {
    setJsonMode(false);
    errorMock.mockRestore();
    exitMock.mockRestore();
    process.exitCode = prevExitCode;
  });

  function stderr(): string {
    return errorMock.mock.calls.map((c) => c[0] as string).join('\n');
  }

  it('T38：并发冲突走单点——退出码 2 + 唯一 i18n 文案（含 revision 信息）', () => {
    expect(() => handleConcurrentConflict({ expectedRevision: 1, actualRevision: 2 }, 'zh-CN')).toThrow('__EXIT__2');
    expect(exitMock).toHaveBeenCalledWith(2);
    const msg = stderr();
    expect(msg).toContain('并发冲突');
    expect(msg).toContain('revision=1');
    expect(msg).toContain('磁盘=2');
  });

  it('T42：handleAddStageError 分流——目录冲突 exit 1、其他错误 exit 1', () => {
    // 阶段目录冲突
    expect(() => handleAddStageError(new StageDirConflictError('A', 'B'), 'zh-CN')).toThrow('__EXIT__1');
    expect(exitMock).toHaveBeenCalledWith(1);
    expect(stderr()).toContain('A');

    errorMock.mockClear();
    // 其他错误
    expect(() => handleAddStageError(new Error('boom'), 'zh-CN')).toThrow('__EXIT__1');
    expect(stderr()).toContain('boom');
  });

  it('T42：addStage 并发冲突经 handleAddStageError 收敛到 exit 2', () => {
    expect(() => handleAddStageError(new FlowConcurrentModificationError(3, 4), 'zh-CN')).toThrow('__EXIT__2');
    expect(exitMock).toHaveBeenCalledWith(2);
  });

  it('stage-95 op-002：JSON 模式并发 → FLOW_CONCURRENT_CONFLICT envelope（refusal）+ exit 2', () => {
    setJsonMode(true);
    const logMock = vi.spyOn(console, 'log').mockImplementation(() => {});
    const prevLogExitCode = process.exitCode;
    try {
      expect(() => handleConcurrentConflict({ expectedRevision: 1, actualRevision: 2 }, 'zh-CN')).toThrow('__EXIT__2');
      expect(exitMock).toHaveBeenCalledWith(2);
      expect(process.exitCode).toBe(2);
      // 人类文案不走 stderr（stdout 单文档）
      expect(errorMock).not.toHaveBeenCalled();
      expect(logMock).toHaveBeenCalledTimes(1);
      const doc = JSON.parse(logMock.mock.calls[0][0] as string) as {
        schemaVersion: number;
        error: { code: string; kind: string; message: string; detail: unknown };
      };
      expect(Object.keys(doc)).toEqual(['schemaVersion', 'error']);
      expect(Object.keys(doc.error)).toEqual(['code', 'kind', 'message', 'detail']);
      expect(doc.error.code).toBe('FLOW_CONCURRENT_CONFLICT');
      expect(doc.error.kind).toBe('refusal');
      expect(doc.error.detail).toEqual({ expectedRevision: 1, actualRevision: 2 });
    } finally {
      logMock.mockRestore();
      setJsonMode(false);
      process.exitCode = prevLogExitCode;
    }
  });
});
