/**
 * stage 单元测试
 * 测试 addStage 和 listStages 在临时目录中的行为
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { addStage, listStages, ensureStageSkeleton } from '../../../src/core/plan/stage.js';
import { FlowManager } from '../../../src/core/flow-manager.js';
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('stage', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-stage-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('addStage', () => {
    it('应创建 stage-01 目录、overview.md、status.md', () => {
      addStage(tmpDir, 'stage-01');

      const stageDir = join(tmpDir, '.openfeel', 'plan', 'v1', 'stage-01');
      expect(existsSync(stageDir)).toBe(true);
      expect(existsSync(join(stageDir, 'overview.md'))).toBe(true);
      expect(existsSync(join(stageDir, 'status.md'))).toBe(true);
    });

    it('overview.md 应包含阶段名标题', () => {
      addStage(tmpDir, 'stage-01');

      const overviewPath = join(tmpDir, '.openfeel', 'plan', 'v1', 'stage-01', 'overview.md');
      const content = readFileSync(overviewPath, 'utf-8');
      expect(content).toContain('# v1.0.0-stage-01');
      expect(content).toContain('## 目标');
      expect(content).toContain('## 依赖');
      expect(content).toContain('## 操作方案');
    });

    it('带 deps 参数时 overview.md 应包含依赖信息', () => {
      addStage(tmpDir, 'stage-01', ['stage-00']);

      const overviewPath = join(tmpDir, '.openfeel', 'plan', 'v1', 'stage-01', 'overview.md');
      const content = readFileSync(overviewPath, 'utf-8');
      expect(content).toContain('- stage-00');
    });

    it('debs 为空数组时 overview.md 应显示"无"', () => {
      addStage(tmpDir, 'stage-01', []);

      const overviewPath = join(tmpDir, '.openfeel', 'plan', 'v1', 'stage-01', 'overview.md');
      const content = readFileSync(overviewPath, 'utf-8');
      // deps 为空时，依赖部分应显示"无"
      expect(content).toContain('无');
    });

    it('status.md 应包含标准骨架字段', () => {
      addStage(tmpDir, 'stage-01');

      const statusPath = join(tmpDir, '.openfeel', 'plan', 'v1', 'stage-01', 'status.md');
      const content = readFileSync(statusPath, 'utf-8');

      expect(content).toContain('执行模式');
      expect(content).toContain('自动推进');
      expect(content).toContain('工作流模式');
      expect(content).toContain('planned');
      expect(content).toContain('当前责任 Agent');
    });

    it('重复调用 addStage 不覆盖已有文件', () => {
      addStage(tmpDir, 'stage-01');

      const overviewPath = join(tmpDir, '.openfeel', 'plan', 'v1', 'stage-01', 'overview.md');
      const originalContent = readFileSync(overviewPath, 'utf-8');

      // 第二次调用 — 不应覆盖
      addStage(tmpDir, 'stage-01');

      const contentAfter = readFileSync(overviewPath, 'utf-8');
      expect(contentAfter).toBe(originalContent);
    });
  });

  describe('addStage deps 落点（stage-41 op-004）', () => {
    it('deps 写入 overview.md 与 flow.json.stages[full].deps', () => {
      FlowManager.initFlow(tmpDir);
      addStage(tmpDir, 'stage-01', ['v1.0.0-stage-00']);

      const overviewContent = readFileSync(
        join(tmpDir, '.openfeel', 'plan', 'v1', 'stage-01', 'overview.md'),
        'utf-8',
      );
      expect(overviewContent).toContain('- v1.0.0-stage-00');

      const flow = JSON.parse(readFileSync(join(tmpDir, '.openfeel', 'flow.json'), 'utf-8'));
      expect(flow.stages['v1.0.0-stage-01'].deps).toEqual(['v1.0.0-stage-00']);
    });

    it('不传 deps → overview 显示「无」且 flow.json.deps 为空数组', () => {
      FlowManager.initFlow(tmpDir);
      addStage(tmpDir, 'stage-02');

      const overviewContent = readFileSync(
        join(tmpDir, '.openfeel', 'plan', 'v1', 'stage-02', 'overview.md'),
        'utf-8',
      );
      expect(overviewContent).toContain('无');

      const flow = JSON.parse(readFileSync(join(tmpDir, '.openfeel', 'flow.json'), 'utf-8'));
      expect(flow.stages['v1.0.0-stage-02'].deps).toEqual([]);
    });

    it('addStage 应在 flow.json 末条写 register_stage 审计日志（P7，agent=cli）', () => {
      FlowManager.initFlow(tmpDir);
      addStage(tmpDir, 'stage-01', ['dep-a']);

      const flow = JSON.parse(readFileSync(join(tmpDir, '.openfeel', 'flow.json'), 'utf-8'));
      expect(flow.stages['v1.0.0-stage-01']).toBeDefined();
      const last = flow.log[flow.log.length - 1];
      expect(last.action).toBe('register_stage');
      expect(last.agent).toBe('cli');
      expect(last.detail.deps).toEqual(['dep-a']);
    });
  });

  describe('ensureStageSkeleton（stage-51 op-003 N3）', () => {
    it('N3-1：首次调用补建目录 + overview.md + status.md 并返回 true', () => {
      const created = ensureStageSkeleton(tmpDir, 'stage-05');
      expect(created).toBe(true);
      const stageDir = join(tmpDir, '.openfeel', 'plan', 'v1', 'stage-05');
      expect(existsSync(join(stageDir, 'overview.md'))).toBe(true);
      expect(existsSync(join(stageDir, 'status.md'))).toBe(true);
    });

    it('N3-1 幂等：已存在时不覆盖且返回 false', () => {
      ensureStageSkeleton(tmpDir, 'stage-06');
      const statusPath = join(tmpDir, '.openfeel', 'plan', 'v1', 'stage-06', 'status.md');
      writeFileSync(statusPath, 'CUSTOM CONTENT', 'utf-8');

      const created = ensureStageSkeleton(tmpDir, 'stage-06');
      expect(created).toBe(false);
      expect(readFileSync(statusPath, 'utf-8')).toBe('CUSTOM CONTENT');
    });

    it('N3-1：deps 写入 overview.md「依赖」段', () => {
      ensureStageSkeleton(tmpDir, 'stage-07', ['stage-01']);
      const overview = readFileSync(join(tmpDir, '.openfeel', 'plan', 'v1', 'stage-07', 'overview.md'), 'utf-8');
      expect(overview).toContain('- stage-01');
    });

    it('N3-1：非法阶段名抛错', () => {
      expect(() => ensureStageSkeleton(tmpDir, 'foo')).toThrow();
    });

    it('N3-1：addStage 与 ensureStageSkeleton 骨架文本一致（共用实现）', () => {
      FlowManager.initFlow(tmpDir);
      ensureStageSkeleton(tmpDir, 'stage-08');
      addStage(tmpDir, 'stage-09');

      const overview8 = readFileSync(join(tmpDir, '.openfeel', 'plan', 'v1', 'stage-08', 'overview.md'), 'utf-8')
        .replace('v1.0.0-stage-08', 'STAGE');
      const overview9 = readFileSync(join(tmpDir, '.openfeel', 'plan', 'v1', 'stage-09', 'overview.md'), 'utf-8')
        .replace('v1.0.0-stage-09', 'STAGE');
      expect(overview8).toBe(overview9);

      const status8 = readFileSync(join(tmpDir, '.openfeel', 'plan', 'v1', 'stage-08', 'status.md'), 'utf-8')
        .replace('v1.0.0-stage-08', 'STAGE').replace(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/g, 'TS');
      const status9 = readFileSync(join(tmpDir, '.openfeel', 'plan', 'v1', 'stage-09', 'status.md'), 'utf-8')
        .replace('v1.0.0-stage-09', 'STAGE').replace(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/g, 'TS');
      expect(status8).toBe(status9);
    });
  });

  // ── v1.1.4-stage-63 op-002：骨架初值取 config 默认 + overrides ──

  describe('骨架初值取 config 默认（stage-63 op-002）', () => {
    const configPath = (): string => join(tmpDir, '.openfeel', 'config.yaml');
    const statusPath = (stage: string): string => join(tmpDir, '.openfeel', 'plan', 'v1', stage, 'status.md');

    it('T6.1：defaults.auto_advance=enabled / execution_mode=auto → 新建骨架继承', () => {
      mkdirSync(join(tmpDir, '.openfeel'), { recursive: true });
      writeFileSync(configPath(), 'defaults:\n  auto_advance: enabled\n  execution_mode: auto\n', 'utf-8');

      addStage(tmpDir, 'stage-10');

      const content = readFileSync(statusPath('stage-10'), 'utf-8');
      expect(content).toContain('- **自动推进**：enabled');
      expect(content).toContain('- **执行模式**：auto');
      // config 未设 workflow_mode → 回退 DEFAULT_CONFIG（fast）
      expect(content).toContain('- **工作流模式**：fast');
    });

    it('T6.2：overrides 显式优先于 config 默认', () => {
      mkdirSync(join(tmpDir, '.openfeel'), { recursive: true });
      writeFileSync(configPath(), 'defaults:\n  auto_advance: enabled\n  execution_mode: auto\n  workflow_mode: full\n', 'utf-8');

      addStage(tmpDir, 'stage-11', undefined, undefined, { autoAdvance: 'disabled', executionMode: 'manual', workflowMode: 'fast' });

      const content = readFileSync(statusPath('stage-11'), 'utf-8');
      expect(content).toContain('- **自动推进**：disabled');
      expect(content).toContain('- **执行模式**：manual');
      // overrides 显式优先于 config 默认（full）
      expect(content).toContain('- **工作流模式**：fast');
    });

    it('T6.3：无 config.yaml → 回退 DEFAULT_CONFIG（enabled/manual/fast）', () => {
      addStage(tmpDir, 'stage-12');

      const content = readFileSync(statusPath('stage-12'), 'utf-8');
      expect(content).toContain('- **自动推进**：enabled');
      expect(content).toContain('- **执行模式**：manual');
      expect(content).toContain('- **工作流模式**：fast');
    });

    it('T6.4：config defaults.workflow_mode=full → 新建骨架继承 full', () => {
      mkdirSync(join(tmpDir, '.openfeel'), { recursive: true });
      writeFileSync(configPath(), 'defaults:\n  workflow_mode: full\n', 'utf-8');

      addStage(tmpDir, 'stage-13');

      const content = readFileSync(statusPath('stage-13'), 'utf-8');
      expect(content).toContain('- **工作流模式**：full');
    });
  });

  // ── v1.1.7-stage-75 op-001：冗余字段写入点① ──

  describe('addStage 冗余字段写入（stage-75 op-001）', () => {
    const flowPath = (): string => join(tmpDir, '.openfeel', 'flow.json');

    it('新建阶段写 flow.json.stages[full].workflow_mode（overrides 显式值）', () => {
      FlowManager.initFlow(tmpDir);
      addStage(tmpDir, 'stage-20', undefined, undefined, { workflowMode: 'fast' });

      const flow = JSON.parse(readFileSync(flowPath(), 'utf-8'));
      expect(flow.stages['v1.0.0-stage-20'].workflow_mode).toBe('fast');
    });

    it('新建阶段缺省取 config defaults.workflow_mode', () => {
      FlowManager.initFlow(tmpDir);
      mkdirSync(join(tmpDir, '.openfeel'), { recursive: true });
      writeFileSync(join(tmpDir, '.openfeel', 'config.yaml'), 'defaults:\n  workflow_mode: full\n', 'utf-8');

      addStage(tmpDir, 'stage-21');

      const flow = JSON.parse(readFileSync(flowPath(), 'utf-8'));
      expect(flow.stages['v1.0.0-stage-21'].workflow_mode).toBe('full');
    });

    it('重复 addStage（已存在阶段）不改写既有冗余字段', () => {
      FlowManager.initFlow(tmpDir);
      addStage(tmpDir, 'stage-22', undefined, undefined, { workflowMode: 'fast' });

      // 模拟权威值漂移：冗余字段被改为 full 后重复 addStage（默认 fast）不应覆盖
      const flow0 = JSON.parse(readFileSync(flowPath(), 'utf-8'));
      flow0.stages['v1.0.0-stage-22'].workflow_mode = 'full';
      writeFileSync(flowPath(), JSON.stringify(flow0, null, 2), 'utf-8');

      addStage(tmpDir, 'stage-22');

      const flow = JSON.parse(readFileSync(flowPath(), 'utf-8'));
      expect(flow.stages['v1.0.0-stage-22'].workflow_mode).toBe('full');
    });
  });

  describe('listStages', () => {
    it('目录不存在时应返回空数组', () => {
      const stages = listStages(tmpDir);
      expect(stages).toEqual([]);
    });

    it('应返回正确的阶段列表', () => {
      addStage(tmpDir, 'stage-01');
      addStage(tmpDir, 'stage-02');

      const stages = listStages(tmpDir);
      expect(stages).toHaveLength(2);

      const names = stages.map((s) => s.name);
      expect(names).toContain('stage-01');
      expect(names).toContain('stage-02');

      // 应包含 overview 内容
      expect(stages[0].overview).toContain('# v1.0.0-stage-01');
    });

    it('只列出子目录，忽略文件', () => {
      // TODO: 测试 stages 目录下的文件被忽略
      const stages = listStages(tmpDir);
      expect(stages).toEqual([]);
    });
  });
});
