/**
 * flow-archive 单元测试 — 归档文件 schema / 版本分组 / 切分 / IO 原语 / 幂等 / 边界
 * 全程 fixture tmpDir 隔离（mkdtempSync + afterEach 清理）；严禁触碰真实 .openfeel/ 与本仓 flow.json
 * （本模块全部 API 显式接收 projectPath，无 cwd / homedir 依赖）。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  versionOfStageId,
  groupStagesByVersion,
  listArchivableCandidates,
  splitForArchive,
  listBlockingOpenRevsForVersion,
} from '../../src/core/flow-archive/grouping.js';
import {
  writeArchiveFile,
  readArchiveFile,
  listArchiveVersions,
  addArchivedVersion,
  getArchivedVersions,
  getArchiveDir,
  getArchiveFilePath,
  isValidArchiveVersion,
  normalizeArchiveVersion,
  applyArchivePipelineDisposition,
} from '../../src/core/flow-archive/archive-ops.js';
import {
  ARCHIVE_SCHEMA_VERSION,
  type ArchiveFile,
} from '../../src/core/flow-archive/archive-file.js';
import { FlowManager } from '../../src/core/flow-manager.js';
import type { FlowData, StageData, ReviewItem, LogEntry } from '../../src/core/flow-manager.js';

let tmpDir: string;
beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-flow-archive-'));
});
afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

/** 构造 StageData 最小样本 */
function makeStage(phase: StageData['phase'] = 'done'): StageData {
  return { name: '样本阶段', phase, status: 'done', deps: [], ops: {} };
}

/** 构造 FlowData 最小样本（可覆盖顶层键） */
function makeData(overrides: Partial<FlowData> = {}): FlowData {
  return {
    meta: { version: '1.0', project: 'test', updated: '', revision: 1 },
    pipeline: { phase: 'active', current: { stage: '-', op: '-' }, retry: 0 },
    stages: {},
    reviews: [],
    log: [],
    ...overrides,
  };
}

/** 构造 LogEntry 最小样本 */
function makeLog(stageName?: unknown): LogEntry {
  const detail: Record<string, unknown> = {};
  if (stageName !== undefined) {
    detail.stageName = stageName;
  }
  return { time: '2026-10-11T00:00:00.000Z', agent: 'test', action: 'advance_stage_phase', detail };
}

/** 审查条目自增序号（保证 id 唯一） */
let reviewSeq = 0;

/** 构造 ReviewItem 最小样本（共享 fixture 助手，REV-78-008） */
function makeReview(op: string): ReviewItem {
  reviewSeq += 1;
  return {
    id: `REV-TEST-${reviewSeq}`,
    op,
    status: 'closed',
    priority: 'low',
    title: 't',
    filed_by: 'test',
    filed_at: '',
  };
}

// ═══════════════════════════════════════════════
// T4.1 分组
// ═══════════════════════════════════════════════

describe('versionOfStageId', () => {
  it('完整格式：剥离 -{stageDir} 后缀得到版本前缀', () => {
    expect(versionOfStageId('v1.1.7-stage-73')).toBe('v1.1.7');
    expect(versionOfStageId('v1.0.0-stage-34')).toBe('v1.0.0');
  });

  it('历史格式（仅主版本）：v4-stage-04 → v4', () => {
    expect(versionOfStageId('v4-stage-04')).toBe('v4');
  });

  it('短名 stageId（D2 已登记边界）：经 parseStageId 归一化为 v1.0.0', () => {
    expect(versionOfStageId('stage-01')).toBe('v1.0.0');
  });

  it('不可解析：返回 null', () => {
    expect(versionOfStageId('foo')).toBeNull();
    expect(versionOfStageId('v1')).toBeNull();
    expect(versionOfStageId('')).toBeNull();
  });
});

describe('groupStagesByVersion', () => {
  it('多版本混排：按版本分组且各列表保持插入顺序', () => {
    const stages: Record<string, StageData> = {
      'v1.0.0-stage-01': makeStage(),
      'v1.1.2-stage-40': makeStage(),
      'v1.1.7-stage-73': makeStage(),
      'v1.0.0-stage-34': makeStage(),
      'v1.1.2-stage-41': makeStage(),
    };
    const groups = groupStagesByVersion(stages);
    expect([...groups.keys()]).toEqual(['v1.0.0', 'v1.1.2', 'v1.1.7']);
    expect(groups.get('v1.0.0')).toEqual(['v1.0.0-stage-01', 'v1.0.0-stage-34']);
    expect(groups.get('v1.1.2')).toEqual(['v1.1.2-stage-40', 'v1.1.2-stage-41']);
    expect(groups.get('v1.1.7')).toEqual(['v1.1.7-stage-73']);
  });

  it('非法 stageId 跳过：不崩且不产生分组', () => {
    const groups = groupStagesByVersion({
      foo: makeStage(),
      'v1.1.7-stage-73': makeStage(),
    });
    expect([...groups.keys()]).toEqual(['v1.1.7']);
  });

  it('空对象 → 空 Map', () => {
    expect(groupStagesByVersion({}).size).toBe(0);
  });
});

describe('listArchivableCandidates', () => {
  it('全 done 版本 → allDone 为 true', () => {
    const data = makeData({
      stages: { 'v1.1.7-stage-73': makeStage('done'), 'v1.1.7-stage-74': makeStage('done') },
    });
    const candidates = listArchivableCandidates(data);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toEqual({
      version: 'v1.1.7',
      stages: ['v1.1.7-stage-73', 'v1.1.7-stage-74'],
      allDone: true,
    });
  });

  it('含非 done 阶段 → allDone 为 false', () => {
    const data = makeData({
      stages: { 'v1.1.7-stage-73': makeStage('done'), 'v1.1.7-stage-74': makeStage('plan_pending') },
    });
    expect(listArchivableCandidates(data)[0].allDone).toBe(false);
  });

  it('空 stages → 空候选列表（空集守卫）', () => {
    expect(listArchivableCandidates(makeData())).toEqual([]);
  });
});

// ═══════════════════════════════════════════════
// T4.2 切分无损（双向断言）
// ═══════════════════════════════════════════════

describe('splitForArchive（切分无损双向断言）', () => {
  it('stages 切分：命中版本全搬，其余保留，并集 = 原集', () => {
    const data = makeData({
      stages: {
        'v1.0.0-stage-01': makeStage(),
        'v1.1.7-stage-73': makeStage(),
        'v1.1.7-stage-74': makeStage(),
        'v4-stage-04': makeStage(),
      },
    });
    const { archive, remainder } = splitForArchive(data, 'v1.1.7');

    expect(Object.keys(archive.stages)).toEqual(['v1.1.7-stage-73', 'v1.1.7-stage-74']);
    expect(Object.keys(remainder.stages)).toEqual(['v1.0.0-stage-01', 'v4-stage-04']);
    // 双向断言：并集 = 原集（无漏无重）
    expect(new Set([...Object.keys(archive.stages), ...Object.keys(remainder.stages)]))
      .toEqual(new Set(Object.keys(data.stages)));
    expect(archive.counts.stages).toBe(2);
  });

  it('reviews 切分：按 op 前缀命中（含纯 stageId / 锚定剥离 opId），保序 + 并集断言', () => {
    const data = makeData({
      reviews: [
        makeReview('v1.1.7-stage-73.op-001'),
        makeReview('v1.1.7-stage-73'),
        makeReview('v1.0.0-stage-34.op-002'),
        makeReview('foo'),
        makeReview('stage-99.op-001'),
      ],
    });
    const { archive, remainder } = splitForArchive(data, 'v1.1.7');

    expect(archive.reviews).toHaveLength(2);
    expect(archive.reviews.map((r) => r.op)).toEqual(['v1.1.7-stage-73.op-001', 'v1.1.7-stage-73']);
    expect(remainder.reviews).toHaveLength(3);
    expect(remainder.reviews.map((r) => r.op)).toEqual([
      'v1.0.0-stage-34.op-002',
      'foo',
      'stage-99.op-001',
    ]);
    // 双向断言：条数守恒 + 并集 = 原集（内容比对）
    expect(archive.reviews.length + remainder.reviews.length).toBe(data.reviews.length);
    expect(new Set([...archive.reviews.map((r) => r.id), ...remainder.reviews.map((r) => r.id)]))
      .toEqual(new Set(data.reviews.map((r) => r.id)));
    expect([...archive.reviews, ...remainder.reviews].length).toBe(5);
    expect(archive.counts.reviews).toBe(2);
  });

  it('log 切分：唯一读 detail.stageName；无 stageName / 非字符串 / 仅 detail.stageId 一律保留', () => {
    const hit = makeLog('v1.1.7-stage-73');
    const otherVersion = makeLog('v1.0.0-stage-34');
    const noStageName = makeLog();
    const nonString = makeLog(123);
    const onlyStageId: LogEntry = {
      time: '2026-10-11T00:00:00.000Z',
      agent: 'test',
      action: 'advance_op_phase',
      detail: { stageId: 'v1.1.7-stage-73', opId: 'op-001' },
    };
    const data = makeData({ log: [hit, otherVersion, noStageName, nonString, onlyStageId] });

    const { archive, remainder } = splitForArchive(data, 'v1.1.7');

    expect(archive.log).toHaveLength(1);
    expect(archive.log).toEqual([hit]);
    expect(remainder.log).toHaveLength(4);
    expect(remainder.log[0]).toBe(otherVersion);
    expect(remainder.log[1]).toBe(noStageName);
    expect(remainder.log[2]).toBe(nonString);
    expect(remainder.log[3]).toBe(onlyStageId);
    // 双向断言：并集 = 原集（长度守恒 + 内容集合等同）
    expect(archive.log.length + remainder.log.length).toBe(data.log.length);
    expect(new Set([...archive.log, ...remainder.log])).toEqual(new Set(data.log));
    expect(archive.counts.log).toBe(1);
  });

  it('counts 三段分别等于 archive 各段实际长度', () => {
    const data = makeData({
      stages: { 'v1.1.7-stage-73': makeStage() },
      reviews: [makeReview('v1.1.7-stage-73.op-001'), makeReview('v1.0.0-stage-34.op-002')],
      log: [makeLog('v1.1.7-stage-73'), makeLog()],
    });
    const { archive } = splitForArchive(data, 'v1.1.7');
    expect(archive.counts.stages).toBe(Object.keys(archive.stages).length);
    expect(archive.counts.reviews).toBe(archive.reviews.length);
    expect(archive.counts.log).toBe(archive.log.length);
    expect(archive.counts).toEqual({ stages: 1, reviews: 1, log: 1 });
  });

  it('保序：archive / remainder 内条目相对顺序与原数组一致', () => {
    const data = makeData({
      log: [
        makeLog('v1.1.7-stage-73'),
        makeLog('v1.0.0-stage-34'),
        makeLog('v1.1.7-stage-74'),
        makeLog('v1.1.7-stage-75'),
        makeLog('v1.0.0-stage-35'),
      ],
      reviews: [
        makeReview('v1.1.7-stage-73.op-001'),
        makeReview('v1.0.0-stage-01.op-001'),
        makeReview('v1.1.7-stage-74.op-001'),
      ],
    });
    const { archive, remainder } = splitForArchive(data, 'v1.1.7');

    expect(archive.log.map((e) => e.detail['stageName']))
      .toEqual(['v1.1.7-stage-73', 'v1.1.7-stage-74', 'v1.1.7-stage-75']);
    expect(remainder.log.map((e) => e.detail['stageName']))
      .toEqual(['v1.0.0-stage-34', 'v1.0.0-stage-35']);
    expect(archive.reviews.map((r) => r.op)).toEqual(['v1.1.7-stage-73.op-001', 'v1.1.7-stage-74.op-001']);
    expect(remainder.reviews.map((r) => r.op)).toEqual(['v1.0.0-stage-01.op-001']);
  });
});

// ═══════════════════════════════════════════════
// T3 / T4.3 IO 原语与幂等
// ═══════════════════════════════════════════════

/** 构造 ArchiveFile 最小样本 */
function makeArchiveFile(version: string, overrides: Partial<ArchiveFile> = {}): ArchiveFile {
  return {
    schemaVersion: ARCHIVE_SCHEMA_VERSION,
    version,
    archived_at: '2026-10-11T00:00:00.000Z',
    stages: {},
    reviews: [],
    log: [],
    counts: { stages: 0, reviews: 0, log: 0 },
    ...overrides,
  };
}

describe('archive-ops（IO 原语与幂等）', () => {
  it('写盘与读回：逐字段一致，路径与序列化格式对齐 save()', () => {
    const f = makeArchiveFile('v1.1.7', {
      stages: { 'v1.1.7-stage-73': makeStage() },
      reviews: [makeReview('v1.1.7-stage-73.op-001')],
      log: [makeLog('v1.1.7-stage-73')],
      counts: { stages: 1, reviews: 1, log: 1 },
    });
    writeArchiveFile(tmpDir, f);

    const p = join(tmpDir, '.openfeel', 'flow-archive', 'v1.1.7.json');
    expect(existsSync(p)).toBe(true);
    expect(getArchiveFilePath(tmpDir, 'v1.1.7')).toBe(p);
    expect(getArchiveDir(tmpDir)).toBe(join(tmpDir, '.openfeel', 'flow-archive'));
    // 序列化格式与 FlowManager.save() 一致：缩进 2 + 末尾换行
    expect(readFileSync(p, 'utf-8')).toBe(JSON.stringify(f, null, 2) + '\n');
    expect(readArchiveFile(tmpDir, 'v1.1.7')).toEqual(f);
  });

  it('覆盖幂等（T4.3）：同版本写 ×2 字节一致，且无 .bak', () => {
    const f = makeArchiveFile('v1.1.7', {
      stages: { 'v1.1.7-stage-73': makeStage() },
      counts: { stages: 1, reviews: 0, log: 0 },
    });
    const p = getArchiveFilePath(tmpDir, 'v1.1.7');
    writeArchiveFile(tmpDir, f);
    const first = readFileSync(p, 'utf-8');
    writeArchiveFile(tmpDir, f);
    const second = readFileSync(p, 'utf-8');

    expect(second).toBe(first);
    expect(existsSync(`${p}.bak`)).toBe(false); // backup:false
  });

  it('覆盖写新内容生效', () => {
    const p = getArchiveFilePath(tmpDir, 'v1.1.7');
    writeArchiveFile(tmpDir, makeArchiveFile('v1.1.7', { counts: { stages: 0, reviews: 0, log: 0 } }));
    expect(readArchiveFile(tmpDir, 'v1.1.7')).toEqual(
      makeArchiveFile('v1.1.7', { counts: { stages: 0, reviews: 0, log: 0 } }),
    );

    const f2 = makeArchiveFile('v1.1.7', {
      stages: { 'v1.1.7-stage-73': makeStage(), 'v1.1.7-stage-74': makeStage() },
      counts: { stages: 2, reviews: 0, log: 0 },
    });
    writeArchiveFile(tmpDir, f2);
    expect(readArchiveFile(tmpDir, 'v1.1.7')).toEqual(f2);
    expect(existsSync(p)).toBe(true);
  });

  it('锁行为：归档锁临界区结束即释放，且从不嵌套 flow 锁', () => {
    writeArchiveFile(tmpDir, makeArchiveFile('v1.1.7'));

    expect(existsSync(join(tmpDir, '.openfeel', 'tmp', 'locks', 'flow-archive.lock'))).toBe(false);
    expect(existsSync(join(tmpDir, '.openfeel', 'tmp', 'locks', 'flow.lock'))).toBe(false);
  });

  it('listArchiveVersions：目录缺失 → []；合法文件字典序；非法文件名被过滤', () => {
    expect(listArchiveVersions(tmpDir)).toEqual([]);

    writeArchiveFile(tmpDir, makeArchiveFile('v1.1.7'));
    writeArchiveFile(tmpDir, makeArchiveFile('v1.0.0'));
    expect(listArchiveVersions(tmpDir)).toEqual(['v1.0.0', 'v1.1.7']);

    // 手工放入非法文件名（非版本形态 / 非 .json 后缀）→ 均被过滤
    const dir = getArchiveDir(tmpDir);
    writeFileSync(join(dir, 'foo.json'), '{}', 'utf-8');
    writeFileSync(join(dir, 'v1.1.7.txt'), '{}', 'utf-8');
    expect(listArchiveVersions(tmpDir)).toEqual(['v1.0.0', 'v1.1.7']);
  });

  it('readArchiveFile 宽容：缺失 / 损坏 / 缺 counts 回填 / 未知键保留', () => {
    // 不存在 → null
    expect(readArchiveFile(tmpDir, 'v1.1.7')).toBeNull();

    // 损坏（JSON 解析失败）→ null
    mkdirSync(getArchiveDir(tmpDir), { recursive: true });
    const p = getArchiveFilePath(tmpDir, 'v1.1.7');
    writeFileSync(p, '{not json', 'utf-8');
    expect(readArchiveFile(tmpDir, 'v1.1.7')).toBeNull();

    // 合法 JSON 但非对象 → null（契约：缺失/损坏/非法 → null）
    writeFileSync(p, '[1,2,3]', 'utf-8');
    expect(readArchiveFile(tmpDir, 'v1.1.7')).toBeNull();
    writeFileSync(p, 'null', 'utf-8');
    expect(readArchiveFile(tmpDir, 'v1.1.7')).toBeNull();

    // 缺 counts → 按实际长度回填；未知键保留
    const raw = {
      schemaVersion: 1,
      version: 'v1.1.7',
      archived_at: '',
      stages: { a: 1 },
      reviews: [],
      log: [],
      extra: 'x',
    };
    writeFileSync(p, JSON.stringify(raw), 'utf-8');
    const read = readArchiveFile(tmpDir, 'v1.1.7');
    expect(read?.counts).toEqual({ stages: 1, reviews: 0, log: 0 });
    expect((read as unknown as Record<string, unknown>)['extra']).toBe('x');
  });

  it('非法版本防御（D9）：写侧抛错零写盘，读侧不抛返回 null', () => {
    expect(() => writeArchiveFile(tmpDir, makeArchiveFile('../../evil'))).toThrow();
    expect(existsSync(join(tmpDir, '.openfeel', 'flow-archive', '..', '..', 'evil.json'))).toBe(false);
    expect(existsSync(join(tmpDir, 'evil.json'))).toBe(false);
    expect(existsSync(join(tmpDir, '..', 'evil.json'))).toBe(false);
    expect(listArchiveVersions(tmpDir)).toEqual([]);

    expect(readArchiveFile(tmpDir, '../../x')).toBeNull();
    expect(readArchiveFile(tmpDir, '')).toBeNull();
  });

  it('索引管理（T4.3）：幂等去重 / 副本 / meta 缺失防御', () => {
    const data = makeData();
    expect(getArchivedVersions(data)).toEqual([]);

    expect(addArchivedVersion(data, 'v1.1.7')).toBe(true);
    expect(getArchivedVersions(data)).toEqual(['v1.1.7']);

    // 幂等：重复登记 no-op
    expect(addArchivedVersion(data, 'v1.1.7')).toBe(false);
    expect(getArchivedVersions(data)).toHaveLength(1);

    // 按追加序
    expect(addArchivedVersion(data, 'v1.1.6')).toBe(true);
    expect(getArchivedVersions(data)).toEqual(['v1.1.7', 'v1.1.6']);
    expect(data.meta.archived_versions).toEqual(['v1.1.7', 'v1.1.6']);

    // 返回副本：修改返回值不影响内存
    const snapshot = getArchivedVersions(data);
    snapshot.push('v9.9.9');
    expect(getArchivedVersions(data)).toEqual(['v1.1.7', 'v1.1.6']);

    // meta 缺失防御：读取 [] 且追加不抛
    const broken = makeData();
    delete (broken as unknown as { meta?: unknown }).meta;
    expect(getArchivedVersions(broken)).toEqual([]);
    expect(() => addArchivedVersion(broken, 'v1.1.7')).not.toThrow();
    expect(getArchivedVersions(broken)).toEqual(['v1.1.7']);
  });

  it('load 不注入 archived_versions（REV-78-015 翻转）：getArchivedVersions 承担「缺失恒等 []」，save 后磁盘不新增该键', () => {
    const flowDir = join(tmpDir, '.openfeel');
    mkdirSync(flowDir, { recursive: true });
    const flowPath = join(flowDir, 'flow.json');
    const raw = {
      meta: { version: '1.0', project: 'test', updated: '', revision: 3 },
      pipeline: { phase: 'active', current: { stage: '-', op: '-' }, retry: 0 },
      stages: {},
      reviews: [],
      log: [],
    };
    const text = JSON.stringify(raw, null, 2) + '\n';
    writeFileSync(flowPath, text, 'utf-8');

    const mgr = new FlowManager(tmpDir);
    // 读侧补齐已移除：load 不注入该键（原 REV-78-006 行为翻转）
    expect(mgr.getData()?.meta.archived_versions).toBeUndefined();
    // 「缺失恒等 []」语义由 getArchivedVersions 承担（读侧宽容）
    expect(getArchivedVersions(mgr.getData()!)).toEqual([]);
    // load 不写盘：磁盘文件逐字节未变
    expect(readFileSync(flowPath, 'utf-8')).toBe(text);

    // load→save 后磁盘不新增该键（序列化副作用已消除）；同时 revision 递增证明写盘确实发生
    mgr.save();
    const after = readFileSync(flowPath, 'utf-8');
    expect(after).not.toContain('archived_versions');
    expect((JSON.parse(after) as FlowData).meta.revision).toBe(4);
  });
});

// ═══════════════════════════════════════════════
// T4.4 边界
// ═══════════════════════════════════════════════

describe('边界（T4.4）', () => {
  it('空 log + 空 reviews：三段切分不抛错且 remainder 全空', () => {
    const data = makeData({ stages: { 'v1.7.0-stage-01': makeStage('done') } });
    const { archive, remainder } = splitForArchive(data, 'v1.7.0');

    expect(Object.keys(archive.stages)).toEqual(['v1.7.0-stage-01']);
    expect(archive.reviews).toEqual([]);
    expect(archive.log).toEqual([]);
    expect(archive.counts).toEqual({ stages: 1, reviews: 0, log: 0 });
    expect(remainder.stages).toEqual({});
    expect(remainder.reviews).toEqual([]);
    expect(remainder.log).toEqual([]);
  });

  it('空 stages（版本在 stages 中不存在）：archive.stages 空但 log 仍命中', () => {
    const data = makeData({ log: [makeLog('v1.1.7-stage-73')] });
    const { archive } = splitForArchive(data, 'v1.1.7');

    expect(archive.stages).toEqual({});
    expect(archive.log).toHaveLength(1);
    expect(archive.counts).toEqual({ stages: 0, reviews: 0, log: 1 });
  });

  it('单阶段版本：counts.stages = 1 且 allDone 为 true', () => {
    const data = makeData({ stages: { 'v1.1.7-stage-77': makeStage('done') } });
    const { archive } = splitForArchive(data, 'v1.1.7');

    expect(archive.counts.stages).toBe(1);
    expect(listArchivableCandidates(data)).toEqual([
      { version: 'v1.1.7', stages: ['v1.1.7-stage-77'], allDone: true },
    ]);
  });

  it('版本不存在（完全无命中）：archive 全空不抛错，remainder = 全量', () => {
    const data = makeData({
      stages: { 'v1.0.0-stage-01': makeStage(), 'v1.1.7-stage-73': makeStage() },
      reviews: [makeReview('v1.1.7-stage-73.op-001')],
      log: [makeLog('v1.1.7-stage-73'), makeLog()],
    });
    const { archive, remainder } = splitForArchive(data, 'v9.9.9');

    expect(archive.stages).toEqual({});
    expect(archive.reviews).toEqual([]);
    expect(archive.log).toEqual([]);
    expect(archive.counts).toEqual({ stages: 0, reviews: 0, log: 0 });

    expect(new Set(Object.keys(remainder.stages))).toEqual(new Set(Object.keys(data.stages)));
    expect(remainder.stages).toEqual(data.stages);
    expect(remainder.reviews).toEqual(data.reviews);
    expect(remainder.log).toEqual(data.log);
  });

  it('写盘后损坏：readArchiveFile 返回 null 不崩溃（R-78-2 缓解）', () => {
    writeArchiveFile(tmpDir, makeArchiveFile('v1.1.7'));

    const p = getArchiveFilePath(tmpDir, 'v1.1.7');
    writeFileSync(p, '{broken', 'utf-8');
    expect(readArchiveFile(tmpDir, 'v1.1.7')).toBeNull();

    // 修复后仍可读（读侧宽容不倒置文件状态）
    writeArchiveFile(tmpDir, makeArchiveFile('v1.1.7'));
    expect(readArchiveFile(tmpDir, 'v1.1.7')).toEqual(makeArchiveFile('v1.1.7'));
  });

  it('幂等重归档端到端（内存 + 磁盘）：切分 ×2 一致 + 写 ×2 读回一致 + 无重复文件', () => {
    const data = makeData({
      stages: { 'v1.1.7-stage-73': makeStage(), 'v1.0.0-stage-01': makeStage() },
      reviews: [makeReview('v1.1.7-stage-73.op-001')],
      log: [makeLog('v1.1.7-stage-73'), makeLog()],
    });
    const first = splitForArchive(data, 'v1.1.7');
    const second = splitForArchive(data, 'v1.1.7');
    expect(second.archive).toEqual(first.archive);
    expect(second.remainder).toEqual(first.remainder);

    const file: ArchiveFile = {
      schemaVersion: ARCHIVE_SCHEMA_VERSION,
      archived_at: '2026-10-11T00:00:00.000Z',
      ...first.archive,
    };
    writeArchiveFile(tmpDir, file);
    writeArchiveFile(tmpDir, file);

    expect(readArchiveFile(tmpDir, 'v1.1.7')).toEqual(file);
    expect(listArchiveVersions(tmpDir)).toEqual(['v1.1.7']);
  });
});

// ═══════════════════════════════════════════════
// T4.5 隔离正向断言
// ═══════════════════════════════════════════════

describe('隔离（T4.5）', () => {
  it('源码零全局路径依赖：三份源文件均不含 process.cwd / homedir', () => {
    const readSrc = (f: string): string =>
      readFileSync(new URL(`../../src/core/flow-archive/${f}`, import.meta.url), 'utf-8');

    for (const f of ['archive-file.ts', 'grouping.ts', 'archive-ops.ts']) {
      expect(readSrc(f)).not.toMatch(/process\.cwd|homedir/);
    }
  });
});

// ═══════════════════════════════════════════════
// 命令面 helper（stage-79 op-001）
// ═══════════════════════════════════════════════

/** 构造可配置 status/blocking 的 ReviewItem（未传 blocking 则不写该键，模拟缺省） */
function makeRev(op: string, opts: { status?: ReviewItem['status']; blocking?: boolean } = {}): ReviewItem {
  reviewSeq += 1;
  const item: ReviewItem = {
    id: `REV-TEST-${reviewSeq}`,
    op,
    status: opts.status ?? 'open',
    priority: 'high',
    title: '标题',
    filed_by: 'test',
    filed_at: '',
  };
  if (opts.blocking !== undefined) {
    item.blocking = opts.blocking;
  }
  return item;
}

describe('命令面 helper（stage-79 op-001）', () => {
  describe('normalizeArchiveVersion', () => {
    it('前缀兼容（去 v 再加 v，canonical 恒带 v）', () => {
      expect(normalizeArchiveVersion('v1.1.7')).toBe('v1.1.7');
      expect(normalizeArchiveVersion('1.1.7')).toBe('v1.1.7');
      expect(normalizeArchiveVersion('1.1')).toBe('v1.1');
      expect(normalizeArchiveVersion(' 1.1.7 ')).toBe('v1.1.7');
    });

    it('非法输入 → null（空串 / 仅 v / 双 v / 非版本形态 / 路径穿越）', () => {
      expect(normalizeArchiveVersion('vv1.1.7')).toBeNull();
      expect(normalizeArchiveVersion('')).toBeNull();
      expect(normalizeArchiveVersion('v')).toBeNull();
      expect(normalizeArchiveVersion('abc')).toBeNull();
      expect(normalizeArchiveVersion('../x')).toBeNull();
    });
  });

  describe('isValidArchiveVersion', () => {
    it('带 v 前缀的版本形态合法；空串 / 缺 v / 非版本形态非法', () => {
      expect(isValidArchiveVersion('v1.1.7')).toBe(true);
      expect(isValidArchiveVersion('v4')).toBe(true);
      expect(isValidArchiveVersion('')).toBe(false);
      expect(isValidArchiveVersion('1.1.7')).toBe(false);
      expect(isValidArchiveVersion('vabc')).toBe(false);
    });
  });

  describe('listBlockingOpenRevsForVersion', () => {
    it('blocking 缺省（undefined）= 阻塞且 open → 命中', () => {
      const hit = makeRev('v1.1.7-stage-73.op-001', { status: 'open' });
      const data = makeData({ reviews: [hit] });
      expect(listBlockingOpenRevsForVersion(data, 'v1.1.7').map((r) => r.id)).toEqual([hit.id]);
    });

    it('blocking:false + open → 不命中；blocking:true + closed → 不命中；其它版本 → 不命中', () => {
      const nonBlocking = makeRev('v1.1.7-stage-73.op-001', { status: 'open', blocking: false });
      const closedBlocking = makeRev('v1.1.7-stage-73.op-002', { status: 'closed', blocking: true });
      const otherVersion = makeRev('v1.0.0-stage-01.op-001', { status: 'open' });
      const data = makeData({ reviews: [nonBlocking, closedBlocking, otherVersion] });
      expect(listBlockingOpenRevsForVersion(data, 'v1.1.7')).toEqual([]);
    });

    it('纯 stageId op（无 .op-NNN 锚定）同样按版本作用域解析', () => {
      const hit = makeRev('v1.1.7-stage-73', { status: 'open' });
      const data = makeData({ reviews: [hit] });
      expect(listBlockingOpenRevsForVersion(data, 'v1.1.7').map((r) => r.id)).toEqual([hit.id]);
    });

    it('返回新数组副本：push 不影响 data.reviews', () => {
      const data = makeData({ reviews: [makeRev('v1.1.7-stage-73.op-001', { status: 'open' })] });
      const result = listBlockingOpenRevsForVersion(data, 'v1.1.7');
      result.push(makeRev('v1.1.7-stage-73.op-002'));
      expect(data.reviews).toHaveLength(1);
    });
  });

  describe('applyArchivePipelineDisposition', () => {
    it('current 属该版本 → 置空且 currentCleared=true；op 同清', () => {
      const data = makeData({
        stages: { 'v1.1.7-stage-73': makeStage('done') },
      });
      data.pipeline.current = { stage: 'v1.1.7-stage-73', op: 'op-001' };
      const disposed = applyArchivePipelineDisposition(data, 'v1.1.7');
      expect(disposed.currentCleared).toBe(true);
      expect(data.pipeline.current).toEqual({ stage: '', op: '' });
    });

    it('current 属其它版本 → 不变且 currentCleared=false', () => {
      const data = makeData({ stages: { 'v1.1.7-stage-73': makeStage('done') } });
      data.pipeline.current = { stage: 'v1.0.0-stage-01', op: 'op-001' };
      const disposed = applyArchivePipelineDisposition(data, 'v1.1.7');
      expect(disposed.currentCleared).toBe(false);
      expect(data.pipeline.current).toEqual({ stage: 'v1.0.0-stage-01', op: 'op-001' });
    });

    it('phase 重算三态：空集 → active / 全 done → done / 混合 → active', () => {
      const empty = makeData({ stages: {} });
      expect(applyArchivePipelineDisposition(empty, 'v1.1.7').phase).toBe('active');

      const allDone = makeData({ stages: { 'v1.1.7-stage-74': makeStage('done') } });
      expect(applyArchivePipelineDisposition(allDone, 'v1.1.7').phase).toBe('done');

      const mixed = makeData({
        stages: { 'v1.1.7-stage-74': makeStage('done'), 'v1.1.7-stage-75': makeStage('exec_running') },
      });
      expect(applyArchivePipelineDisposition(mixed, 'v1.1.7').phase).toBe('active');
    });
  });
});
