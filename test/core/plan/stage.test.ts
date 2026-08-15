/**
 * stage 单元测试
 * 测试 addStage 和 listStages 在临时目录中的行为
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { addStage, listStages } from '../../../src/core/plan/stage.js';
import { existsSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
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
