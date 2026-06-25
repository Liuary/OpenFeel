/**
 * roadmap 单元测试
 * 测试 createRoadmap 和 showRoadmap 在临时目录中的行为
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoadmap, showRoadmap } from '../../../src/core/plan/roadmap.js';
import { existsSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('roadmap', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-roadmap-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('createRoadmap', () => {
    it('应创建 v1.0.md 文件并包含版本标题', () => {
      createRoadmap(tmpDir, '1.0');

      const filePath = join(tmpDir, '.openfeel', 'roadmap', 'v1.0.md');
      expect(existsSync(filePath)).toBe(true);

      const content = readFileSync(filePath, 'utf-8');
      expect(content).toContain('# 分期大纲 v1.0');
      expect(content).toContain('## 目标');
      expect(content).toContain('## 阶段划分');
      expect(content).toContain('## 里程碑');
    });

    it('重复创建同一版本时应提示已存在（不覆盖）', () => {
      createRoadmap(tmpDir, '1.0');

      const filePath = join(tmpDir, '.openfeel', 'roadmap', 'v1.0.md');
      const originalContent = readFileSync(filePath, 'utf-8');

      // 第二次创建 — 不应覆盖已有内容
      createRoadmap(tmpDir, '1.0');

      const contentAfter = readFileSync(filePath, 'utf-8');
      expect(contentAfter).toBe(originalContent);
    });
  });

  describe('showRoadmap', () => {
    it('目录不存在时应返回提示信息', () => {
      // 不创建任何 roadmap，直接查询
      const result = showRoadmap(tmpDir);
      expect(result).toContain('暂无');
    });

    it('不传版本时应列出所有 v*.md 文件', () => {
      createRoadmap(tmpDir, '1.0');
      createRoadmap(tmpDir, '2.0');

      const result = showRoadmap(tmpDir);
      expect(result).toContain('v1.0.md');
      expect(result).toContain('v2.0.md');
    });

    it('传版本时应返回文件内容', () => {
      createRoadmap(tmpDir, '1.0');

      const result = showRoadmap(tmpDir, '1.0');
      expect(result).toContain('# 分期大纲 v1.0');
      expect(result).toContain('## 目标');
    });

    it('不存在的版本应报错退出', () => {
      // showRoadmap 对不存在的版本会调用 process.exit(1)
      // 这里用一个包装函数捕获错误
      const mockExit = vi.spyOn(process, 'exit').mockImplementation((code?: string | number | null | undefined) => {
        throw new Error(`process.exit(${code})`);
      });

      createRoadmap(tmpDir, '1.0');

      expect(() => {
        showRoadmap(tmpDir, '999.0');
      }).toThrow('process.exit(1)');

      mockExit.mockRestore();
    });
  });
});
