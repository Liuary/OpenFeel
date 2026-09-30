/**
 * public-logger 单元测试 — 公共日志序号原子化 + 三级索引
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PublicLogger } from '../../src/core/public-logger.js';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('public-logger', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-public-logger-'));
    mkdirSync(join(tmpDir, '.openfeel'), { recursive: true });
    writeFileSync(join(tmpDir, '.openfeel', '.info.json'), JSON.stringify({ user: 'tester', lang: 'zh-CN' }), 'utf-8');
    PublicLogger.resetInstance();
  });

  afterEach(() => {
    PublicLogger.resetInstance();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('连续写日志序号递增为 001/002/003', () => {
    const logger = PublicLogger.getInstance(tmpDir);
    logger.logPhaseChange({ action: 'advance_phase', from: 'a', to: 'b' });
    logger.logPhaseChange({ action: 'advance_phase', from: 'b', to: 'c' });
    logger.logPhaseChange({ action: 'advance_phase', from: 'c', to: 'd' });

    const now = new Date();
    const yyyy = String(now.getFullYear());
    const MM = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const dayDir = join(tmpDir, '.openfeel', 'log', yyyy, MM, dd);
    const files = readdirSync(dayDir).filter((f) => f.endsWith('.md') && f !== 'day_index.md').sort();
    expect(files.some((f) => f.endsWith('-001.md'))).toBe(true);
    expect(files.some((f) => f.endsWith('-002.md'))).toBe(true);
    expect(files.some((f) => f.endsWith('-003.md'))).toBe(true);

    // 索引文件已更新且不含空占位
    expect(existsSync(join(dayDir, 'day_index.md'))).toBe(true);
    expect(existsSync(join(tmpDir, '.openfeel', 'log', 'index.md'))).toBe(true);
    expect(existsSync(join(tmpDir, '.openfeel', 'log', 'log.md'))).toBe(true);
    expect(readFileSync(join(tmpDir, '.openfeel', 'log', 'log.md'), 'utf-8')).toContain('-003.md');
  });

  it('T5：logMilestone 除 title 外还保留附加字段（durationMs 等）', () => {
    const logger = PublicLogger.getInstance(tmpDir);
    logger.logMilestone('里程碑X', { action: 'stage_completed', durationMs: 12, finalPhase: 'done' });

    const now = new Date();
    const yyyy = String(now.getFullYear());
    const MM = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const dayDir = join(tmpDir, '.openfeel', 'log', yyyy, MM, dd);
    const files = readdirSync(dayDir).filter((f) => f.endsWith('.md') && f !== 'day_index.md');
    expect(files).toHaveLength(1);
    const content = readFileSync(join(dayDir, files[0]), 'utf-8');
    expect(content).toContain('- **title**：里程碑X');
    expect(content).toContain('- **durationMs**：12');
    expect(content).toContain('- **finalPhase**：done');
  });

  it('T11：PublicLogger 按 projectPath 缓存单例（不同 projectPath → 不同实例）', () => {
    const tmpDir2 = mkdtempSync(join(tmpdir(), 'openfeel-public-logger-2-'));
    try {
      const a = PublicLogger.getInstance(tmpDir);
      const b = PublicLogger.getInstance(tmpDir);
      const c = PublicLogger.getInstance(tmpDir2);
      expect(a).toBe(b);
      expect(a).not.toBe(c);
    } finally {
      rmSync(tmpDir2, { recursive: true, force: true });
    }
  });
});
