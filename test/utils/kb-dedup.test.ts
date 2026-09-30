/**
 * kb-dedup 单元测试（T8）
 * 覆盖 findSimilarEntries 的 basePath 参数化与「调用时解析 cwd」（无模块加载期固化）
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { findSimilarEntries } from '../../src/utils/kb-dedup.js';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/** 在指定项目目录下写入 .openfeel/kb/patterns.md，返回 kb 目录绝对路径 */
function writeKb(projectDir: string, body: string): string {
  const kbDir = join(projectDir, '.openfeel', 'kb');
  mkdirSync(kbDir, { recursive: true });
  writeFileSync(join(kbDir, 'patterns.md'), body, 'utf-8');
  return kbDir;
}

const BODY = '## [+] 缓存命中率策略 (2026-01-01)\n\n使用 LRU 缓存提升命中率，记录 benchmark 数据。\n';
const TARGET = 'LRU 缓存提升命中率 benchmark';

describe('kb-dedup', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-kbdedup-'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('① 传入 basePath 时命中目标知识库', () => {
    const kbDir = writeKb(tmpDir, BODY);
    const res = findSimilarEntries(TARGET, 'patterns', kbDir);
    expect(res.length).toBeGreaterThan(0);
    expect(res[0].entry.title).toBe('缓存命中率策略');
    expect(res[0].similarity).toBeGreaterThan(0);
  });

  it('② 不传 basePath 时按 cwd 解析', () => {
    writeKb(tmpDir, BODY);
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    try {
      const res = findSimilarEntries(TARGET, 'patterns');
      expect(res.length).toBeGreaterThan(0);
    } finally {
      cwdSpy.mockRestore();
    }
  });

  it('③ 模块加载后切换 cwd，默认分支跟随新 cwd（证明无加载期固化）', () => {
    const dirA = mkdtempSync(join(tmpdir(), 'openfeel-kbdedup-a-'));
    const dirB = mkdtempSync(join(tmpdir(), 'openfeel-kbdedup-b-'));
    try {
      writeKb(dirA, BODY);
      // dirB 无任何 kb 文件
      const spy = vi.spyOn(process, 'cwd').mockReturnValue(dirA);
      expect(findSimilarEntries(TARGET, 'patterns').length).toBeGreaterThan(0);
      // 加载后切换 cwd → 默认分支跟随新 cwd（若固化则仍命中 dirA）
      spy.mockReturnValue(dirB);
      expect(findSimilarEntries(TARGET, 'patterns')).toEqual([]);
    } finally {
      rmSync(dirA, { recursive: true, force: true });
      rmSync(dirB, { recursive: true, force: true });
    }
  });

  it('未知分类返回空数组', () => {
    const kbDir = writeKb(tmpDir, BODY);
    expect(findSimilarEntries(TARGET, 'nope', kbDir)).toEqual([]);
  });
});
