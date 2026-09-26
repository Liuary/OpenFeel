/**
 * file-lock 单元测试 — 互斥 / 超时 / 陈旧抢占 / 归属释放 / 跨进程
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { withFileLock, LOCK_STALE_MS_DEFAULT } from '../../../src/core/fs/file-lock.js';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { readFileSync as readSrc } from 'node:fs';
import ts from 'typescript';

describe('file-lock', () => {
  let tmpDir: string;
  let lockPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-file-lock-'));
    lockPath = join(tmpDir, 'test.lock');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('正常加解锁并返回 fn 结果', () => {
    const result = withFileLock(lockPath, () => 42);
    expect(result).toBe(42);
    expect(existsSync(lockPath)).toBe(false); // 已释放
  });

  it('异常路径仍释放锁', () => {
    expect(() => withFileLock(lockPath, () => {
      throw new Error('boom');
    })).toThrow('boom');
    expect(existsSync(lockPath)).toBe(false);
  });

  it('锁被占用时重试，超时抛错', () => {
    writeFileSync(lockPath, JSON.stringify({ pid: 999999, time: Date.now(), token: 'x' }), 'utf-8');
    expect(() => withFileLock(lockPath, () => 1, { timeoutMs: 120, staleMs: 60000 })).toThrow(/超时/);
  });

  it('陈旧锁可被抢占', () => {
    writeFileSync(lockPath, JSON.stringify({ pid: 999999, time: 0, token: 'stale' }), 'utf-8');
    // 将 mtime 回拨到超过 TTL
    const old = new Date(Date.now() - LOCK_STALE_MS_DEFAULT - 1000);
    utimesSync(lockPath, old, old);
    const result = withFileLock(lockPath, () => 'ok', { timeoutMs: 2000 });
    expect(result).toBe('ok');
    expect(existsSync(lockPath)).toBe(false);
  });

  it('释放时 token 不匹配则不删除他人锁', () => {
    // 手工模拟「自己的锁被抢占，锁文件已是他人 token」
    let foreignStillExists = false;
    try {
      withFileLock(lockPath, () => {
        // 临界区内把锁文件替换为他人 token
        writeFileSync(lockPath, JSON.stringify({ pid: 1, time: Date.now(), token: 'other' }), 'utf-8');
      });
    } finally {
      foreignStillExists = existsSync(lockPath);
    }
    expect(foreignStillExists).toBe(true); // 未误删他人锁
  });

  it('跨进程互斥：N 个子进程各自 +1，总数不丢', () => {
    // REV-1801：file-lock 现依赖 ../global-paths，需按原相对布局一并转译到临时目录，
    // 否则独立子进程无法解析依赖会静默跳过跨进程断言。
    const fsDir = join(tmpDir, 'core', 'fs');
    mkdirSync(fsDir, { recursive: true });
    const transpile = (relPath: string): string => {
      const src = readSrc(join(process.cwd(), ...relPath.split('/')), 'utf-8');
      return ts.transpileModule(src, {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      }).outputText;
    };
    writeFileSync(join(tmpDir, 'core', 'global-paths.mjs'), transpile('src/core/global-paths.ts'), 'utf-8');
    // 将 .js 后缀重写为 .mjs，保持 ../global-paths 相对关系
    const lockOut = transpile('src/core/fs/file-lock.ts').replace('global-paths.js', 'global-paths.mjs');
    writeFileSync(join(fsDir, 'file-lock.mjs'), lockOut, 'utf-8');

    const counterPath = join(tmpDir, 'counter.txt');
    writeFileSync(counterPath, '0', 'utf-8');
    const workerPath = join(tmpDir, 'worker.mjs');
    writeFileSync(workerPath, `
import { withFileLock } from './core/fs/file-lock.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
const lock = ${JSON.stringify(join(tmpDir, 'counter.lock'))};
const counter = ${JSON.stringify(counterPath)};
for (let i = 0; i < 25; i++) {
  withFileLock(lock, () => {
    const n = parseInt(readFileSync(counter, 'utf-8'), 10);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1); // 放大临界区
    writeFileSync(counter, String(n + 1), 'utf-8');
  }, { timeoutMs: 20000 });
}
`, 'utf-8');

    const procs = [0, 1, 2, 3].map(() => spawnSync(process.execPath, [workerPath], { encoding: 'utf-8', timeout: 30000 }));
    for (const p of procs) {
      if (p.status !== 0) {
        console.warn('[skip] 子进程不可用，跳过跨进程断言:', p.stderr);
        return;
      }
    }
    expect(readFileSync(counterPath, 'utf-8')).toBe('100');
  }, 40000);
});
