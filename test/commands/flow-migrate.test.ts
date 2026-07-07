/**
 * flow migrate 命令单元测试
 * 测试旧版 flow.json（v4.0 全局 phase）到新版格式（v4.1 阶段级 phase）的迁移逻辑
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FlowManager, type FlowData, type PipelinePhase, type MetaPhase } from '../../src/core/flow-manager.js';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * 创建旧版格式的 FlowData（pipeline.phase 为 PipelinePhase 值，非 MetaPhase）
 */
function makeOldFormatFlowData(overrides?: Partial<FlowData>): FlowData {
  return {
    meta: { version: '1.0', project: 'TestProject', updated: '2026-01-01T00:00:00Z' },
    pipeline: {
      // 旧版：pipeline.phase 为 PipelinePhase 值（非 MetaPhase）
      phase: 'exec_running' as unknown as MetaPhase,
      current: { stage: 'stage-01', op: 'op-001' },
      retry: 0,
    },
    stages: {
      'stage-01': {
        name: '阶段1',
        // 无 phase 字段（旧格式），模拟旧版 stages 中无 phase 的情况
        phase: undefined as unknown as PipelinePhase,
        status: 'in_progress',
        deps: [],
        ops: {
          'op-001': {
            id: 'op-001',
            title: '测试操作',
            state: 'pending',
            assignee: 'executor',
            attempts: 0,
            max_attempts: 3,
            checkpoints: {
              plan: 'pending',
              scheme: 'pending',
              exec: { attempts: 0, self: 'pending' },
              review: 'pending',
              test: 'pending',
            },
          },
        },
      },
      'stage-02': {
        name: '阶段2',
        phase: undefined as unknown as PipelinePhase,
        status: 'planned',
        deps: [],
        ops: {},
      },
    },
    reviews: [],
    log: [],
    ...overrides,
  };
}

describe('flow migrate', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-migrate-test-'));
    // 创建 .openfeel/ 目录
    mkdirSync(join(tmpDir, '.openfeel'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  /**
   * 辅助函数：初始化一个只有旧格式数据的 FlowManager
   */
  function createManager(data?: FlowData): FlowManager {
    // 先创建 flow.json（initFlow 创建默认格式）
    FlowManager.initFlow(tmpDir);
    const mgr = new FlowManager(tmpDir);
    if (data) {
      mgr.setData(data);
    }
    return mgr;
  }

  // ── 测试用例 ──

  it('migrate 旧格式→新格式：旧 phase 下沉到 active stage', () => {
    const oldData = makeOldFormatFlowData({
      pipeline: {
        phase: 'exec_running' as unknown as MetaPhase,
        current: { stage: 'stage-01', op: 'op-001' },
        retry: 0,
      },
    });
    const mgr = createManager(oldData);

    // 确认是旧格式
    expect(mgr.needsMigration()).toBe(true);

    const result = mgr.migrate(false, true); // noBackup=true

    expect(result.migrated).toBe(true);
    // stage-01 作为 current.stage，phase 下沉为旧值
    const data = mgr.getData()!;
    expect(data.stages['stage-01'].phase).toBe('exec_running');
    // 全局 phase 变为 active（非 done）
    expect(data.pipeline.phase).toBe('active');
  });

  it('migrate 旧格式：所有已完成 stage 的 phase 设为 "done"', () => {
    const oldData = makeOldFormatFlowData();
    // 当前 stage 为 stage-01
    const mgr = createManager(oldData);

    const result = mgr.migrate(false, true);

    expect(result.migrated).toBe(true);
    const data = mgr.getData()!;
    // stage-01 作为 current.stage，收到旧 phase
    expect(data.stages['stage-01'].phase).toBe('exec_running');
    // stage-02 不是 current.stage，收到 "done"
    expect(data.stages['stage-02'].phase).toBe('done');
  });

  it('migrate 已是新格式 → 不修改', () => {
    const mgr = createManager();
    // 新格式：pipeline.phase 为 "active"（MetaPhase）
    const newFormatData: FlowData = {
      meta: { version: '1.0', project: 'TestProject', updated: '2026-01-01T00:00:00Z' },
      pipeline: {
        phase: 'active' as MetaPhase,
        current: { stage: 'stage-01', op: 'op-001' },
        retry: 0,
      },
      stages: {
        'stage-01': {
          name: '阶段1',
          phase: 'plan_pending' as PipelinePhase,
          status: 'in_progress',
          deps: [],
          ops: {},
        },
      },
      reviews: [],
      log: [],
    };
    mgr.setData(newFormatData);

    expect(mgr.needsMigration()).toBe(false);

    const result = mgr.migrate(false, true);

    // 不应迁移
    expect(result.migrated).toBe(false);
    expect(result.changes.some((c) => c.includes('无需迁移'))).toBe(true);
  });

  it('migrate 旧格式 done 边界：pipeline.phase="done" 既是 PipelinePhase 也是 MetaPhase，不计为旧格式', () => {
    // 'done' 同时存在于 PipelinePhase 和 MetaPhase 枚举中，
    // 因此 needsMigration() 会将其视为新版格式，不触发迁移
    const oldData = makeOldFormatFlowData({
      pipeline: {
        // 'done' 同时是 PipelinePhase 和 MetaPhase
        phase: 'done' as unknown as MetaPhase,
        current: { stage: 'stage-01', op: 'op-001' },
        retry: 0,
      },
      stages: {
        'stage-01': {
          name: '阶段1',
          phase: 'done' as PipelinePhase, // 已有 phase
          status: 'done',
          deps: [],
          ops: {},
        },
      },
    });
    const mgr = createManager(oldData);

    // 'done' 是合法 MetaPhase，不计为旧格式
    expect(mgr.needsMigration()).toBe(false);

    const result = mgr.migrate(false, true);
    // 不触发迁移
    expect(result.migrated).toBe(false);
  });

  it('migrate --dry-run → 输出预览，文件不变', () => {
    const oldData = makeOldFormatFlowData();
    // 先写入旧格式数据
    writeFileSync(join(tmpDir, '.openfeel', 'flow.json'), JSON.stringify(oldData, null, 2) + '\n', 'utf-8');
    const mgr = new FlowManager(tmpDir);

    // 读取文件内容作为基线
    const beforeContent = readFileSync(join(tmpDir, '.openfeel', 'flow.json'), 'utf-8');

    // dry-run 模式
    const result = mgr.migrate(true, true);

    expect(result.migrated).toBe(true);
    expect(result.changes.some((c) => c.includes('旧版'))).toBe(true);

    // 验证文件未被修改（dry-run）
    const afterContent = readFileSync(join(tmpDir, '.openfeel', 'flow.json'), 'utf-8');
    expect(afterContent).toBe(beforeContent);
  });

  it('migrate --no-backup → 不生成 .bak', () => {
    const oldData = makeOldFormatFlowData();
    const mgr = createManager(oldData);

    const bakPath = join(tmpDir, '.openfeel', 'flow.json.v4.0.bak');

    // 确保 .bak 文件不存在
    expect(existsSync(bakPath)).toBe(false);

    // noBackup=true 时不生成 .bak
    mgr.migrate(false, true);

    // 验证 .bak 文件未被创建
    expect(existsSync(bakPath)).toBe(false);
  });

  it('migrate 旧格式中 current.stage="-" → 旧 phase 下沉到第一个 stage', () => {
    const oldData = makeOldFormatFlowData({
      pipeline: {
        phase: 'plan_review' as unknown as MetaPhase,
        // current.stage 为 "-"
        current: { stage: '-', op: 'init' },
        retry: 0,
      },
    });
    const mgr = createManager(oldData);

    const result = mgr.migrate(false, true);

    expect(result.migrated).toBe(true);
    const data = mgr.getData()!;
    // current.stage 为 "-"，下沉到第一个 stage（stage-01）
    expect(data.stages['stage-01'].phase).toBe('plan_review');
    // stage-02 不是第一个，应设为 "done"
    expect(data.stages['stage-02'].phase).toBe('done');
  });
});
