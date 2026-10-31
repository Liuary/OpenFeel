/**
 * dev 状态同步测试（v1.5.0）
 *
 * 覆盖：受管 AUTO 块幂等、手写内容保留、30 分钟 due、节点判定、缺失元数据。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  devLastPath,
  getDevStatus,
  isSyncNodePhase,
  readSyncMeta,
  syncDevStatus,
} from '../../src/core/dev-status.js';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

function seedProject(dir: string): void {
  mkdirSync(join(dir, '.openfeel', 'dev'), { recursive: true });
  writeFileSync(join(dir, '.openfeel', '.info.json'), JSON.stringify({ user: 'tester' }), 'utf-8');
  writeFileSync(join(dir, '.openfeel', 'flow.json'), JSON.stringify({
    meta: { version: '1.0', project: 'T', updated: '2026-10-31T00:00:00.000Z' },
    pipeline: { phase: 'active', current: { stage: '', op: '' }, retry: 0 },
    stages: { 'v0.0.1-stage-01': { name: 's1', phase: 'exec_running', status: 'planned', deps: [], ops: {}, requirement_id: 'REQ-001' } },
    reviews: [],
    log: [{ time: '2026-10-31T00:00:00.000Z', agent: 'cli', action: 'advance', detail: {} }],
  }, null, 2) + '\n', 'utf-8');
}

describe('dev-status（v1.5.0）', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'openfeel-dev-status-'));
    seedProject(dir);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('未同步 → due=true；sync 后写 AUTO 块 + .sync.json，due=false', () => {
    expect(getDevStatus(dir).due).toBe(true);
    const result = syncDevStatus(dir, { note: '开始阶段' });
    expect(existsSync(result.file)).toBe(true);
    expect(existsSync(join(dir, '.openfeel', 'dev', '.sync.json'))).toBe(true);
    const content = readFileSync(result.file, 'utf-8');
    expect(content).toContain('<!-- openfeel:auto:begin -->');
    expect(content).toContain('v0.0.1-stage-01');
    expect(content).toContain('`exec_running`');
    expect(content).toContain('REQ-001');
    expect(content).toContain('开始阶段');
    const meta = readSyncMeta(dir);
    expect(meta?.interval_minutes).toBe(30);
    expect(getDevStatus(dir).due).toBe(false);
  });

  it('重复 sync 只更新块（不重复），手写交接内容保留', () => {
    syncDevStatus(dir);
    const file = devLastPath(dir);
    const content = readFileSync(file, 'utf-8');
    const withHandoff = `${content}\n## 公共交接区\n\n- 手写摘要 A\n`;
    writeFileSync(file, withHandoff, 'utf-8');

    // 把阶段推进到 review_passed 再同步
    const flow = JSON.parse(readFileSync(join(dir, '.openfeel', 'flow.json'), 'utf-8')) as {
      stages: Record<string, { phase: string }>;
    };
    flow.stages['v0.0.1-stage-01'].phase = 'review_passed';
    writeFileSync(join(dir, '.openfeel', 'flow.json'), JSON.stringify(flow, null, 2) + '\n', 'utf-8');

    syncDevStatus(dir);
    const after = readFileSync(file, 'utf-8');
    expect(after.match(/openfeel:auto:begin/g)).toHaveLength(1);
    expect(after).toContain('`review_passed`');
    expect(after).toContain('手写摘要 A');
  });

  it('状态未变时重复 sync：changed=false 且不重写 dev_last（v1.5.3）', async () => {
    const first = syncDevStatus(dir);
    expect(first.changed).toBe(true);
    const file = devLastPath(dir);
    const before = readFileSync(file, 'utf-8');
    const beforeMtime = statSync(file).mtimeMs;
    await new Promise((resolve) => setTimeout(resolve, 20));
    const second = syncDevStatus(dir);
    expect(second.changed).toBe(false);
    expect(readFileSync(file, 'utf-8')).toBe(before);
    expect(statSync(file).mtimeMs).toBe(beforeMtime);
    expect(getDevStatus(dir).due).toBe(false);
  });

  it('超过 30 分钟 → due=true；30 分钟内 → false', () => {
    syncDevStatus(dir);
    const now = Date.now();
    expect(getDevStatus(dir, new Date(now + 29 * 60_000)).due).toBe(false);
    expect(getDevStatus(dir, new Date(now + 31 * 60_000)).due).toBe(true);
  });

  it('节点相位判定：exec_running / review_passed / archiving / done', () => {
    for (const phase of ['exec_running', 'review_passed', 'archiving', 'done']) {
      expect(isSyncNodePhase(phase), phase).toBe(true);
    }
    expect(isSyncNodePhase('plan_pending')).toBe(false);
    expect(isSyncNodePhase(null)).toBe(false);
  });

  it('.sync.json 损坏 → due=true（不抛）', () => {
    writeFileSync(join(dir, '.openfeel', 'dev', '.sync.json'), '{ bad json', 'utf-8');
    expect(getDevStatus(dir).due).toBe(true);
    expect(readSyncMeta(dir)).toBeNull();
  });
});
