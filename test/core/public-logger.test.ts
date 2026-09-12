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
});
