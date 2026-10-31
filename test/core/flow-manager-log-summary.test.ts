/**
 * 阶段日志摘要测试（v1.5.4）
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FlowManager } from '../../src/core/flow-manager.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('FlowManager.getStageLogSummary（v1.5.4）', () => {
  let dir: string;
  let mgr: FlowManager;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'openfeel-log-summary-'));
    FlowManager.initFlow(dir);
    mgr = new FlowManager(dir);
    mgr.addStage('v0.0.1-stage-01');
    mgr.save();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('派生最近转换 / 最近失败 / resume 次数 / 条目与字节', () => {
    mgr.appendLog({ time: '2026-01-01T00:00:00.000Z', agent: 'cli', action: 'advance_stage_phase', detail: { stageName: 'v0.0.1-stage-01', from: 'plan_pending', to: 'plan_review', resumed: true } });
    mgr.appendLog({ time: '2026-01-01T00:01:00.000Z', agent: 'cli', action: 'advance_stage_phase', detail: { stageName: 'v0.0.1-stage-01', from: 'plan_review', to: 'review_failed' } });
    mgr.appendLog({ time: '2026-01-01T00:02:00.000Z', agent: 'cli', action: 'advance_stage_phase', detail: { stageName: 'other-stage', from: 'exec_running', to: 'review_passed' } });

    const s = mgr.getStageLogSummary('v0.0.1-stage-01');
    expect(s.entries).toBe(2);
    expect(s.lastTransition).toEqual({ from: 'plan_review', to: 'review_failed', time: '2026-01-01T00:01:00.000Z' });
    expect(s.lastError).toEqual({ phase: 'review_failed', time: '2026-01-01T00:01:00.000Z' });
    expect(s.resumeCount).toBe(1);
    expect(s.bytes).toBeGreaterThan(0);
    expect(mgr.getLogStats().entries).toBe(4);
  });

  it('无该阶段日志 → 空摘要', () => {
    const s = mgr.getStageLogSummary('unknown');
    expect(s.entries).toBe(0);
    expect(s.lastTransition).toBeNull();
    expect(s.lastError).toBeNull();
    expect(s.resumeCount).toBe(0);
  });
});
