/**
 * dev 状态同步测试（v1.5.0）
 *
 * 覆盖：受管 AUTO 块幂等、手写内容保留、30 分钟 due、节点判定、缺失元数据。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  devLastPath,
  getDevStatus,
  isSyncNodePhase,
  maybeSyncDevStatus,
  readSyncMeta,
  syncDevStatus,
} from '../../src/core/dev-status.js';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Command } from 'commander';
import { registerReqCommand } from '../../src/commands/req.js';
import { registerStageCommand } from '../../src/commands/stage.js';

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

  // v1.5.24 审查修订：写入健壮性
  it('插入锚点跳过代码围栏内的 ## 标题', () => {
    mkdirSync(join(dir, '.openfeel', 'dev'), { recursive: true });
    writeFileSync(
      join(dir, '.openfeel', 'dev', 'current.md'),
      '# 当前进度\n\n```md\n## 这是代码块里的标题\n```\n\n## 近期提交记录\n\n- 手写 A\n',
      'utf-8',
    );
    syncDevStatus(dir);
    const content = readFileSync(join(dir, '.openfeel', 'dev', 'current.md'), 'utf-8');
    const blockAt = content.indexOf('<!-- openfeel:auto:begin -->');
    const fenceEnd = content.indexOf('```', content.indexOf('```md') + 3);
    // 自动块必须在代码块**之后**插入，不能插进 ``` 里
    expect(blockAt).toBeGreaterThan(fenceEnd);
    expect(content).toContain('- 手写 A');
  });

  it('标记残缺（只有 begin）→ 不写文件、不截断内容', () => {
    mkdirSync(join(dir, '.openfeel', 'dev'), { recursive: true });
    const broken = '# 当前进度\n\n<!-- openfeel:auto:begin -->\n## 手工残留\n\n用户内容\n';
    writeFileSync(join(dir, '.openfeel', 'dev', 'current.md'), broken, 'utf-8');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      syncDevStatus(dir);
      // dev_last 仍会写；current.md 必须保持原样（不重复 begin、不丢用户内容）
      expect(readFileSync(join(dir, '.openfeel', 'dev', 'current.md'), 'utf-8')).toBe(broken);
    } finally {
      warn.mockRestore();
    }
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

  // ═══════════════════════════════════════════════════════════════════════════
  // v1.6.0 / REQ-059 T8：maybeSyncDevStatus 三态（写成功出口与 done 门前共用）
  // ═══════════════════════════════════════════════════════════════════════════

  it('T059.2a due=true → 真的同步：synced=true、due=false、.sync.json 落盘', () => {
    expect(getDevStatus(dir).due).toBe(true);
    const syncMeta = join(dir, '.openfeel', 'dev', '.sync.json');
    expect(existsSync(syncMeta)).toBe(false);

    const attempt = maybeSyncDevStatus(dir);

    expect(attempt).toEqual({ synced: true, due: false });
    expect(existsSync(syncMeta)).toBe(true);
    expect(readSyncMeta(dir)).not.toBeNull();
    expect(getDevStatus(dir).due).toBe(false);
    expect(existsSync(devLastPath(dir))).toBe(true);
  });

  it('T059.2b due=false 且非节点相位 → 不动（synced=false，文件逐字不变）', async () => {
    // 活跃阶段置非节点相位（plan_pending）：due=false 时不应触发同步
    const flowPath = join(dir, '.openfeel', 'flow.json');
    const flow = JSON.parse(readFileSync(flowPath, 'utf-8')) as { stages: Record<string, { phase: string }> };
    flow.stages['v0.0.1-stage-01'].phase = 'plan_pending';
    writeFileSync(flowPath, JSON.stringify(flow, null, 2) + '\n', 'utf-8');

    // 先同步一次（due=true 触发），得到新鲜账本
    expect(maybeSyncDevStatus(dir)).toEqual({ synced: true, due: false });
    const syncMeta = join(dir, '.openfeel', 'dev', '.sync.json');
    const beforeMeta = readFileSync(syncMeta, 'utf-8');
    const devLast = devLastPath(dir);
    const beforeDevLast = readFileSync(devLast, 'utf-8');
    await new Promise((resolve) => setTimeout(resolve, 20));

    const attempt = maybeSyncDevStatus(dir);

    expect(attempt).toEqual({ synced: false, due: false });
    expect(readFileSync(syncMeta, 'utf-8')).toBe(beforeMeta);       // .sync.json 未重写
    expect(readFileSync(devLast, 'utf-8')).toBe(beforeDevLast);      // AUTO 块未重写
  });

  it('T059.2c 同步失败 → synced=false、due=true、error 非空（不再静默吞掉）', () => {
    // 构造法：把 .sync.json 变成**目录** → writeFileSync 必失败（跨平台确定性失败）
    mkdirSync(join(dir, '.openfeel', 'dev', '.sync.json'), { recursive: true });
    expect(getDevStatus(dir).due).toBe(true);

    const attempt = maybeSyncDevStatus(dir);

    expect(attempt.synced).toBe(false);
    expect(attempt.due).toBe(true);
    expect(typeof attempt.error).toBe('string');
    expect((attempt.error ?? '').length).toBeGreaterThan(0);
  });

  it('T059.2d 写成功出口接线：req advance 成功后自动同步（.sync.json 前进且 due=false）', async () => {
    // 夹具：draft 需求（正文空壳 → 用 --force 留痕放行，验证的是「成功出口自动同步」）
    const flowPath = join(dir, '.openfeel', 'flow.json');
    const flow = JSON.parse(readFileSync(flowPath, 'utf-8')) as Record<string, unknown>;
    flow.requirements = [{ id: 'REQ-001', title: 'T8', status: 'draft', created_at: '', updated_at: '' }];
    writeFileSync(flowPath, JSON.stringify(flow, null, 2) + '\n', 'utf-8');
    const syncMeta = join(dir, '.openfeel', 'dev', '.sync.json');
    expect(existsSync(syncMeta)).toBe(false);

    const program = new Command();
    program.exitOverride();
    registerReqCommand(program);
    const cwdMock = vi.spyOn(process, 'cwd').mockReturnValue(dir);
    const logMock = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorMock = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await program.parseAsync(['req', 'advance', 'REQ-001', '--to', 'scheduled', '--force'], { from: 'user' });
    } finally {
      cwdMock.mockRestore();
      logMock.mockRestore();
      errorMock.mockRestore();
    }

    // 写出口真的同步了：元数据落盘、due=false、最近操作反映本次流转
    expect(existsSync(syncMeta)).toBe(true);
    expect(getDevStatus(dir).due).toBe(false);
    const onDisk = JSON.parse(readFileSync(flowPath, 'utf-8')) as { requirements: Array<{ id: string; status: string }> };
    expect(onDisk.requirements[0].status).toBe('scheduled');
  });

  it('T059.2e 写成功出口接线：stage set 成功后自动同步（.sync.json 落盘且 due=false）', async () => {
    // 夹具：最小 status.md（与 test/commands/stage.test.ts 同形）
    const stageDir = join(dir, '.openfeel', 'plan', 'v1', 'stage-91');
    mkdirSync(stageDir, { recursive: true });
    writeFileSync(join(stageDir, 'status.md'), [
      '# v1.0.0-stage-91 状态',
      '',
      '- **执行模式**：manual',
      '- **自动推进**：disabled',
      '- **状态**：planned',
      '- **当前责任 Agent**：user',
      '- **上一责任 Agent**：none',
      '',
      '## 当前任务',
      '',
      '> 待补充',
      '',
      '## 阻塞 / 暂停原因',
      '',
      '无',
      '',
    ].join('\n'), 'utf-8');
    const syncMeta = join(dir, '.openfeel', 'dev', '.sync.json');
    expect(existsSync(syncMeta)).toBe(false);

    const program = new Command();
    program.exitOverride();
    registerStageCommand(program);
    const cwdMock = vi.spyOn(process, 'cwd').mockReturnValue(dir);
    const logMock = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorMock = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitMock = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    try {
      await program.parseAsync(['stage', 'set', 'stage-91', '--status', 'testing'], { from: 'user' });
    } finally {
      cwdMock.mockRestore();
      logMock.mockRestore();
      errorMock.mockRestore();
      exitMock.mockRestore();
    }

    expect(existsSync(syncMeta)).toBe(true);
    expect(getDevStatus(dir).due).toBe(false);
    // 写操作本身也生效（出口同步是附加动作，不替代写入）
    expect(readFileSync(join(stageDir, 'status.md'), 'utf-8')).toContain('- **状态**：testing');
  });
});
