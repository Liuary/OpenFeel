/**
 * path 单元测试 — stageId ↔ plan 目录双向映射
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  parseStageId,
  stageIdToPlanDir,
  normalizeStageId,
  planDirToStageId,
  findStageStatusPath,
  DEFAULT_SERIES,
} from '../../../src/core/plan/path.js';
import { FlowManager } from '../../../src/core/flow-manager.js';
import { mkdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('parseStageId', () => {
  it('完整格式 v1.0.0-stage-34', () => {
    expect(parseStageId('v1.0.0-stage-34')).toEqual({
      series: 'v1', stageDir: 'stage-34', fullStageId: 'v1.0.0-stage-34',
    });
  });
  it('历史格式 v4-stage-04（保留前导零）', () => {
    expect(parseStageId('v4-stage-04')).toEqual({
      series: 'v4', stageDir: 'stage-04', fullStageId: 'v4-stage-04',
    });
  });
  it('短名 stage-01（默认 series v1，补齐完整版本）', () => {
    expect(parseStageId('stage-01')).toEqual({
      series: DEFAULT_SERIES, stageDir: 'stage-01', fullStageId: 'v1.0.0-stage-01',
    });
  });
  it('无法解析返回 null', () => {
    expect(parseStageId('foo')).toBeNull();
    expect(parseStageId('v1')).toBeNull();
    expect(parseStageId('')).toBeNull();
  });
});

describe('stageIdToPlanDir', () => {
  it('完整/历史/短名映射', () => {
    expect(stageIdToPlanDir('v1.0.0-stage-34')).toBe('plan/v1/stage-34/');
    expect(stageIdToPlanDir('v4-stage-04')).toBe('plan/v4/stage-04/');
    expect(stageIdToPlanDir('stage-01')).toBe('plan/v1/stage-01/');
  });
  it('无法解析返回 null', () => {
    expect(stageIdToPlanDir('nope')).toBeNull();
  });
});

describe('normalizeStageId', () => {
  it('短名补齐完整版本前缀', () => {
    expect(normalizeStageId('stage-01')).toBe('v1.0.0-stage-01');
  });
  it('完整/历史格式原样返回', () => {
    expect(normalizeStageId('v1.0.0-stage-01')).toBe('v1.0.0-stage-01');
    expect(normalizeStageId('v4-stage-04')).toBe('v4-stage-04');
  });
});

describe('planDirToStageId（反向映射回查 flow.json）', () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-path-test-')); });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it('单匹配返回唯一 stageId', () => {
    FlowManager.initFlow(tmpDir);
    const mgr = new FlowManager(tmpDir);
    mgr.addStage('v1.0.0-stage-33');
    mgr.save();
    expect(planDirToStageId(tmpDir, 'stage-33')).toBe('v1.0.0-stage-33');
  });

  it('无匹配返回 null', () => {
    FlowManager.initFlow(tmpDir);
    expect(planDirToStageId(tmpDir, 'stage-99')).toBeNull();
  });

  it('flow.json 不存在返回 null', () => {
    expect(planDirToStageId(tmpDir, 'stage-33')).toBeNull();
  });

  it('多匹配时优先 pipeline.current.stage（REV-007）', () => {
    FlowManager.initFlow(tmpDir);
    const mgr = new FlowManager(tmpDir);
    mgr.addStage('v0.9-stage-33');
    mgr.addStage('v1.0.0-stage-33');
    // 将 current.stage 设为字典序较小的匹配项，验证 current 优先于字典序
    const flowData = mgr.getData();
    if (flowData) {
      flowData.pipeline.current.stage = 'v0.9-stage-33';
      mgr.save();
    }
    expect(planDirToStageId(tmpDir, 'stage-33')).toBe('v0.9-stage-33');
  });

  it('多匹配且 current 不在匹配集中时取版本字典序最新（REV-007）', () => {
    FlowManager.initFlow(tmpDir);
    const mgr = new FlowManager(tmpDir);
    mgr.addStage('v0.9-stage-33');
    mgr.addStage('v1.0.0-stage-33');
    // current.stage 指向不匹配的 stage-34，应回退到字典序最新 v1.0.0-stage-33
    const flowData = mgr.getData();
    if (flowData) {
      flowData.pipeline.current.stage = 'v1.0.0-stage-34';
      mgr.save();
    }
    expect(planDirToStageId(tmpDir, 'stage-33')).toBe('v1.0.0-stage-33');
  });
});

describe('findStageStatusPath（三级回退）', () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-path-test-')); });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it('第 1 级：plan/{series}/stage-NN/ 精确命中', () => {
    const dir = join(tmpDir, '.openfeel', 'plan', 'v1', 'stage-34');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'status.md'), 'x', 'utf-8');
    expect(findStageStatusPath(tmpDir, 'v1.0.0-stage-34')).toBe(join(dir, 'status.md'));
  });

  it('第 2 级：旧平铺 plan/stage-01/ 递归命中', () => {
    const dir = join(tmpDir, '.openfeel', 'plan', 'stage-01');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'status.md'), 'x', 'utf-8');
    expect(findStageStatusPath(tmpDir, 'stage-01')).toBe(join(dir, 'status.md'));
  });

  it('第 3 级：stages/{stageId}/ 历史兜底命中', () => {
    const dir = join(tmpDir, '.openfeel', 'stages', 'v1.0.0-stage-03');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'status.md'), 'x', 'utf-8');
    expect(findStageStatusPath(tmpDir, 'v1.0.0-stage-03')).toBe(join(dir, 'status.md'));
  });

  it('三级均未命中返回 null', () => {
    expect(findStageStatusPath(tmpDir, 'v9.9.9-stage-99')).toBeNull();
  });
});
