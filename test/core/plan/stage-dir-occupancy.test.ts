/**
 * 阶段目录占用检查（v1.5.7）
 *
 * 背景：plan 目录按 (series, stageDir) 组织，版本前缀不参与路径。
 * v1.1.1-stage-01 归档后目录残留，`plan stage add v1.3.0-stage-01` 曾静默接管该目录。
 * 本用例锁定三类阻断信号（目录归属他人 / 未知产物 / 该阶段已归档）与整版归档提示。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { addStage } from '../../../src/core/plan/stage.js';
import { FlowManager, StageDirOccupiedError } from '../../../src/core/flow-manager.js';
import { inspectStageDirOccupancy, suggestStageIdForExisting } from '../../../src/core/plan/path.js';

describe('阶段目录占用检查（v1.5.7）', () => {
  let tmpDir: string;

  /** .openfeel/plan/{series}/{stageDir} 绝对路径 */
  function stagePath(series: string, stageDir: string): string {
    return join(tmpDir, '.openfeel', 'plan', series, stageDir);
  }

  /** 造一个「属于 owner 的既有阶段目录」 */
  function makeOwnedDir(series: string, stageDir: string, owner: string): void {
    mkdirSync(stagePath(series, stageDir), { recursive: true });
    writeFileSync(join(stagePath(series, stageDir), 'status.md'), `# ${owner} 状态\n`, 'utf-8');
    writeFileSync(join(stagePath(series, stageDir), 'overview.md'), '# 旧阶段\n', 'utf-8');
  }

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-occupy-'));
    FlowManager.initFlow(tmpDir);
    // 归档提示经 console.log 输出，统一静音（断言用例自行读取 mock.calls）
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('回归：目录属于旧版同号阶段 → addStage 拒绝（v1.3.0-stage-01 撞 v1.1.1-stage-01）', () => {
    makeOwnedDir('v1', 'stage-01', 'v1.1.1-stage-01');

    expect(() => addStage(tmpDir, 'v1.3.0-stage-01')).toThrow(StageDirOccupiedError);

    const occ = inspectStageDirOccupancy(tmpDir, 'v1.3.0-stage-01');
    expect(occ).not.toBeNull();
    expect(occ!.ownerStageId).toBe('v1.1.1-stage-01');
    expect(occ!.dirRel).toBe('.openfeel/plan/v1/stage-01');
    expect(occ!.blockers).toEqual([{ kind: 'dir-owned-by-other', ownerStageId: 'v1.1.1-stage-01' }]);
    // 拒绝发生在建骨架 / 注册之前（零写盘：旧 status.md 逐字未改）
    expect(readFileSync(join(stagePath('v1', 'stage-01'), 'status.md'), 'utf-8')).toBe('# v1.1.1-stage-01 状态\n');
    const mgr = new FlowManager(tmpDir);
    expect(mgr.getData()!.stages['v1.3.0-stage-01']).toBeUndefined();
  });

  it('单阶段归档日志 + 其它 series 同号 → 不误伤（完整名只查 archive-<fullId>.md）', () => {
    mkdirSync(join(tmpDir, '.openfeel', 'log'), { recursive: true });
    writeFileSync(join(tmpDir, '.openfeel', 'log', 'archive-stage-01.md'), 'x\n', 'utf-8');

    expect(() => addStage(tmpDir, 'v2.0.0-stage-01')).not.toThrow();
    expect(inspectStageDirOccupancy(tmpDir, 'v2.0.0-stage-01')!.blockers).toEqual([]);
  });

  it('建议名沿用请求版本与 series（v4 不会串到 v1.0.0）', () => {
    expect(suggestStageIdForExisting(tmpDir, 'v4.0.0-stage-04')).toMatch(/^v4\.0\.0-stage-\d{2,}$/);
    expect(suggestStageIdForExisting(tmpDir, 'v1.3.0-stage-01')).toMatch(/^v1\.3\.0-stage-\d{2,}$/);
    // 短名沿用默认版本前缀
    expect(suggestStageIdForExisting(tmpDir, 'stage-01')).toMatch(/^v1\.0\.0-stage-\d{2,}$/);
  });

  it('目录非空但无 status.md（无法证明归属）→ 放行（兼容「先落目录、后注册」）', () => {
    mkdirSync(stagePath('v1', 'stage-02'), { recursive: true });
    writeFileSync(join(stagePath('v1', 'stage-02'), 'plan.md'), 'x\n', 'utf-8');

    expect(() => addStage(tmpDir, 'stage-02')).not.toThrow();
    expect(inspectStageDirOccupancy(tmpDir, 'stage-02')!.blockers).toEqual([]);
  });

  it('单阶段归档日志存在（目录已删）→ 拒绝', () => {
    mkdirSync(join(tmpDir, '.openfeel', 'log'), { recursive: true });
    writeFileSync(join(tmpDir, '.openfeel', 'log', 'archive-stage-03.md'), 'x\n', 'utf-8');

    expect(() => addStage(tmpDir, 'stage-03')).toThrow(StageDirOccupiedError);
    expect(inspectStageDirOccupancy(tmpDir, 'stage-03')!.blockers).toEqual([{ kind: 'stage-archived' }]);
  });

  it('整版归档但目录干净 → 放行 + 输出归档提示（不阻断）', () => {
    const mgr = new FlowManager(tmpDir);
    mgr.getData()!.meta.archived_versions = ['v1.0.0'];
    mgr.save();

    expect(() => addStage(tmpDir, 'v1.0.0-stage-04')).not.toThrow();
    expect(existsSync(stagePath('v1', 'stage-04'))).toBe(true);

    const out = vi.mocked(console.log).mock.calls.map((c) => String(c[0])).join('\n');
    expect(vi.mocked(console.log).mock.calls.length).toBe(1);
    expect(out).toContain('v1.0.0');
  });

  it('幂等：已注册阶段重复 addStage（目录同属本阶段）→ 不拒绝', () => {
    addStage(tmpDir, 'stage-05');
    expect(() => addStage(tmpDir, 'stage-05')).not.toThrow();
  });

  it('flow stage add（仅注册路径）在目录被旧阶段占用时 → 拒绝', () => {
    makeOwnedDir('v1', 'stage-06', 'v1.1.1-stage-06');
    const mgr = new FlowManager(tmpDir);
    expect(() => mgr.addStage('v1.3.0-stage-06')).toThrow(StageDirOccupiedError);
  });
});
