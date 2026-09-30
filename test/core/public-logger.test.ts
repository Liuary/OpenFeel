/**
 * public-logger 单元测试 — 公共日志序号原子化 + 三级索引
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PublicLogger } from '../../src/core/public-logger.js';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// 隔离 HOME：getCliLang 回退到全局配置时不得触碰真实 ~/.openfeel/ 或 ~/.config/openfeel/
const mockHome = vi.hoisted(() => ({ dir: '' }));
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => mockHome.dir };
});

describe('public-logger', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-public-logger-'));
    mockHome.dir = tmpDir;
    mkdirSync(join(tmpDir, '.openfeel'), { recursive: true });
    writeFileSync(join(tmpDir, '.openfeel', '.info.json'), JSON.stringify({ user: 'tester', lang: 'zh-CN' }), 'utf-8');
    PublicLogger.resetInstance();
  });

  afterEach(() => {
    PublicLogger.resetInstance();
    rmSync(tmpDir, { recursive: true, force: true });
    mockHome.dir = '';
  });

  /** 当前日期分量 */
  function todayParts(): { yyyy: string; MM: string; dd: string; dateStr: string } {
    const now = new Date();
    const yyyy = String(now.getFullYear());
    const MM = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return { yyyy, MM, dd, dateStr: `${yyyy}-${MM}-${dd}` };
  }

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

  // ── stage-51 N10：日志布局（仅未来写入嵌套 + 索引共存） ──

  it('N10-1：未来写入固定嵌套 log/{yyyy}/{MM}/{dd}/，不新建扁平目录', () => {
    const logger = PublicLogger.getInstance(tmpDir);
    logger.logPhaseChange({ action: 'advance_phase', from: 'a', to: 'b' });

    const { yyyy, MM, dd, dateStr } = todayParts();
    const logRoot = join(tmpDir, '.openfeel', 'log');
    expect(existsSync(join(logRoot, yyyy, MM, dd))).toBe(true);
    // 不产生扁平目录
    expect(existsSync(join(logRoot, dateStr))).toBe(false);
  });

  it('N10-2：根索引同时反映嵌套 + 历史扁平两套布局（含布局标注）', () => {
    const { yyyy, MM, dd, dateStr } = todayParts();
    const logRoot = join(tmpDir, '.openfeel', 'log');
    // 嵌套当日 day_index
    mkdirSync(join(logRoot, yyyy, MM, dd), { recursive: true });
    writeFileSync(join(logRoot, yyyy, MM, dd, 'day_index.md'), '# nested\n', 'utf-8');
    // 历史扁平目录（含 day_index.md）
    mkdirSync(join(logRoot, dateStr), { recursive: true });
    writeFileSync(join(logRoot, dateStr, 'day_index.md'), '# legacy\n', 'utf-8');

    const logger = PublicLogger.getInstance(tmpDir);
    logger.logPhaseChange({ action: 'advance_phase', from: 'a', to: 'b' });

    const index = readFileSync(join(logRoot, 'index.md'), 'utf-8');
    expect(index).toContain(`${yyyy}/${MM}/${dd}/day_index.md`);
    expect(index).toContain(`${dateStr}/day_index.md`);
    expect(index).toContain('（嵌套）');
    expect(index).toContain('（历史扁平）');
  });

  it('N10-2：历史扁平目录无 day_index.md → 登记兜底条目且不补建', () => {
    const logRoot = join(tmpDir, '.openfeel', 'log');
    mkdirSync(join(logRoot, '2020-01-01'), { recursive: true });

    const logger = PublicLogger.getInstance(tmpDir);
    logger.logPhaseChange({ action: 'advance_phase', from: 'a', to: 'b' });

    const index = readFileSync(join(logRoot, 'index.md'), 'utf-8');
    expect(index).toContain('2020-01-01');
    expect(index).toContain('无 day_index.md');
    // 不为历史目录补建 day_index.md（A7：仅统一未来写入）
    expect(existsSync(join(logRoot, '2020-01-01', 'day_index.md'))).toBe(false);
  });

  it('N10-2：索引更新不改写历史目录（文件清单 + 内容不变）', () => {
    const logRoot = join(tmpDir, '.openfeel', 'log');
    const legacy = join(logRoot, '2020-02-02');
    mkdirSync(legacy, { recursive: true });
    writeFileSync(join(legacy, 'x.md'), 'content', 'utf-8');
    const snapshot = readdirSync(legacy).map((f) => `${f}:${readFileSync(join(legacy, f), 'utf-8')}`).join('|');

    const logger = PublicLogger.getInstance(tmpDir);
    logger.logPhaseChange({ action: 'advance_phase', from: 'a', to: 'b' });

    const after = readdirSync(legacy).map((f) => `${f}:${readFileSync(join(legacy, f), 'utf-8')}`).join('|');
    expect(after).toBe(snapshot);
  });
});
