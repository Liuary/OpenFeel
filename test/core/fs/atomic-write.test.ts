/**
 * atomic-write 单元测试 — 唯一名 temp + rename 原子写
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  atomicWriteFileSync,
  atomicWriteJson,
  buildTempName,
} from '../../../src/core/fs/atomic-write.js';
import {
  existsSync,
  readFileSync,
  readdirSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('atomic-write', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-atomic-write-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('应创建新文件并写入内容', () => {
    const target = join(tmpDir, 'new.txt');
    atomicWriteFileSync(target, 'hello');
    expect(readFileSync(target, 'utf-8')).toBe('hello');
  });

  it('应覆盖已有文件', () => {
    const target = join(tmpDir, 'exist.txt');
    writeFileSync(target, 'old', 'utf-8');
    atomicWriteFileSync(target, 'new');
    expect(readFileSync(target, 'utf-8')).toBe('new');
  });

  it('父目录不存在时自动创建', () => {
    const target = join(tmpDir, 'a', 'b', 'c.txt');
    atomicWriteFileSync(target, 'x');
    expect(existsSync(target)).toBe(true);
  });

  it('写入失败时不留半成品临时文件', () => {
    // 目标路径为已存在目录 → rename 必失败
    const target = join(tmpDir, 'dir-target');
    mkdirSync(target, { recursive: true });
    expect(() => atomicWriteFileSync(target, 'x')).toThrow();
    // 目录内不应残留 .tmp 文件
    const leftovers = readdirSync(tmpDir).filter((f) => f.endsWith('.tmp'));
    expect(leftovers).toEqual([]);
  });

  it('temp 名唯一且匹配约定格式', () => {
    const target = join(tmpDir, 'u.txt');
    const a = buildTempName(target);
    const b = buildTempName(target);
    expect(a).not.toBe(b);
    expect(a.startsWith(join(tmpDir, '.u.txt.'))).toBe(true);
    expect(a.endsWith('.tmp')).toBe(true);
  });

  it('CRLF 内容原样保留（不做行尾归一化）', () => {
    const target = join(tmpDir, 'crlf.txt');
    const content = 'line1\r\nline2\r\n';
    atomicWriteFileSync(target, content);
    expect(readFileSync(target, 'utf-8')).toBe(content);
  });

  it('backup=true 时 .bak 保存旧内容，目标为新内容（S5 语义）', () => {
    const target = join(tmpDir, 'flow.json');
    writeFileSync(target, 'v1', 'utf-8');
    atomicWriteFileSync(target, 'v2', { backup: true });
    expect(readFileSync(target, 'utf-8')).toBe('v2');
    expect(readFileSync(target + '.bak', 'utf-8')).toBe('v1');

    // 连续第二次写：.bak 应更新为 v2（上一个已落盘版本），目标为 v3
    atomicWriteFileSync(target, 'v3', { backup: true });
    expect(readFileSync(target, 'utf-8')).toBe('v3');
    expect(readFileSync(target + '.bak', 'utf-8')).toBe('v2');
  });

  it('atomicWriteJson 输出缩进 2 + 末尾换行', () => {
    const target = join(tmpDir, 'data.json');
    atomicWriteJson(target, { a: 1 });
    expect(readFileSync(target, 'utf-8')).toBe('{\n  "a": 1\n}\n');
  });
});
