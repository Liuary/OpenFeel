/**
 * safe-read 单元测试（stage-50 op-005 T50）
 * 覆盖 readJsoncFile 的不存在 / 正常 / 目录占位（不可读）三种情形。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readJsoncFile } from '../../../src/core/fs/safe-read.js';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('readJsoncFile（stage-50 op-005 T50）', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-safe-read-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('文件不存在 → 返回 "{}"（调用方可新建默认配置）', () => {
    expect(readJsoncFile(join(tmpDir, 'nope.jsonc'))).toBe('{}\n');
  });

  it('普通文件 → 返回内容', () => {
    const p = join(tmpDir, 'x.jsonc');
    writeFileSync(p, '{ "a": 1 }\n', 'utf-8');
    expect(readJsoncFile(p)).toBe('{ "a": 1 }\n');
  });

  it('目录占位（不可读）→ null（调用方跳过，避免 EISDIR 二次抛错）', () => {
    const p = join(tmpDir, 'dir.jsonc');
    mkdirSync(p, { recursive: true });
    expect(readJsoncFile(p)).toBeNull();
  });
});
