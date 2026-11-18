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

  // v1.5.24 / REQ-047：AUTO 块的「状态更新于」语义 + 旧标签迁移
  it('AUTO 块用「状态更新于」；状态未变时不重写文件', () => {
    const first = syncDevStatus(dir);
    expect(first.changed).toBe(true);
    const content = readFileSync(first.file, 'utf-8');
    expect(content).toContain('- 状态更新于：');
    expect(content).not.toContain('- 同步时间：');
    const second = syncDevStatus(dir);
    expect(second.changed).toBe(false);
    expect(readFileSync(first.file, 'utf-8')).toBe(content);
  });

  it('旧「同步时间」标签会被迁移一次（随后恢复 skip）', () => {
    const first = syncDevStatus(dir);
    const file = devLastPath(dir);
    writeFileSync(file, readFileSync(file, 'utf-8').replace('- 状态更新于：', '- 同步时间：'), 'utf-8');
    const migrated = syncDevStatus(dir);
    expect(migrated.changed).toBe(true);
    const content = readFileSync(file, 'utf-8');
    expect(content).toContain('- 状态更新于：');
    expect(content).not.toContain('- 同步时间：');
    expect(syncDevStatus(dir).changed).toBe(false);
    expect(first.changed).toBe(true);
  });

  // v1.5.24 / REQ-048：状态类文件自动维护
  it('current.md 也吃 AUTO 块（不残留旧内容）；块外手写内容保留', () => {
    mkdirSync(join(dir, '.openfeel', 'dev'), { recursive: true });
    writeFileSync(
      join(dir, '.openfeel', 'dev', 'current.md'),
      '# 当前进度\n\n> 上古内容 v1.0.0\n\n## 近期提交记录\n\n- 手写 A\n',
      'utf-8',
    );
    syncDevStatus(dir);
    const content = readFileSync(join(dir, '.openfeel', 'dev', 'current.md'), 'utf-8');
    expect(content).toContain('<!-- openfeel:auto:begin -->');
    expect(content).toContain('v0.0.1-stage-01');
    expect(content).toContain('- 手写 A');
    // 再同步一次：状态没变 → 两个文件都不重写
    const before = readFileSync(join(dir, '.openfeel', 'dev', 'current.md'), 'utf-8');
    expect(syncDevStatus(dir).changed).toBe(false);
    expect(readFileSync(join(dir, '.openfeel', 'dev', 'current.md'), 'utf-8')).toBe(before);
  });

  it('多需求阶段：AUTO 块列出全部需求与完成度', () => {
    // 覆盖 flow.json：一个阶段挂两个需求，其一 done
    const flowPath = join(dir, '.openfeel', 'flow.json');
    const flow = JSON.parse(readFileSync(flowPath, 'utf-8')) as Record<string, unknown>;
    const stages = flow.stages as Record<string, Record<string, unknown>>;
    const key = Object.keys(stages)[0];
    stages[key].requirements = [{ id: 'REQ-001' }, { id: 'REQ-002' }];
    delete stages[key].requirement_id;
    flow.requirements = [
      { id: 'REQ-001', status: 'done' },
      { id: 'REQ-002', status: 'in_progress' },
    ];
    writeFileSync(flowPath, JSON.stringify(flow, null, 2) + '\n', 'utf-8');
    const result = syncDevStatus(dir);
    const content = readFileSync(result.file, 'utf-8');
    expect(content).toContain('REQ-001');
    expect(content).toContain('REQ-002');
    expect(content).toContain('1/2 完成');
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
