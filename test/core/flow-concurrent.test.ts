/**
 * flow.json 跨进程并发测试 — 子进程冲突
 *
 * 依赖 dist 编译产物（`npm run build` 后）。dist 缺失或为陈旧版本时自动跳过，
 * 避免在未构建环境误报（同进程两实例用例已覆盖核心语义）。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { FlowManager } from '../../src/core/flow-manager.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(here, '../fixtures/flow-writer.mjs');
const distManagerPath = resolve(here, '../../dist/core/flow-manager.js');
// dist 存在且包含乐观并发实现时才运行（避免陈旧 dist 造成误报）
const hasFreshDist = existsSync(distManagerPath)
  && readFileSync(distManagerPath, 'utf-8').includes('FlowConcurrentModificationError');

/** 轮询等待文件出现 */
function waitForFile(path: string, timeoutMs: number): Promise<void> {
  return new Promise((res, rej) => {
    const deadline = Date.now() + timeoutMs;
    const timer = setInterval(() => {
      if (existsSync(path)) {
        clearInterval(timer);
        res();
      } else if (Date.now() > deadline) {
        clearInterval(timer);
        rej(new Error(`等待文件超时: ${path}`));
      }
    }, 20);
  });
}

describe('flow.json 跨进程并发', () => {
  let tmpDir: string;
  let child: ChildProcess | null = null;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-flow-concurrent-'));
  });

  afterEach(() => {
    // 清理仍存活的子进程，避免残留忙等进程阻塞测试退出
    if (child && child.exitCode === null) {
      child.kill();
    }
    child = null;
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it.skipIf(!hasFreshDist)('后保存者冲突退出码 2 且未覆盖磁盘内容', async () => {
    FlowManager.initFlow(tmpDir);
    const mgr = new FlowManager(tmpDir);
    mgr.save(); // 磁盘 revision → 1

    const sig = join(tmpDir, 'loaded.signal');
    const go = join(tmpDir, 'go.signal');
    child = spawn(process.execPath, [fixturePath, tmpDir, sig, go], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr?.on('data', (chunk) => { stderr += String(chunk); });

    // 等待子进程完成加载（其基线 revision=1）
    await waitForFile(sig, 10000);

    // 主进程再次 save → 磁盘 revision → 2
    mgr.save();
    const diskAfterMain = readFileSync(join(tmpDir, '.openfeel', 'flow.json'), 'utf-8');

    // 放行子进程（其基线 1 ≠ 磁盘 2 → 冲突）
    writeFileSync(go, 'go');
    const exitCode = await new Promise<number>((res) => {
      child!.on('exit', (code) => res(code ?? -1));
    });

    expect(exitCode).toBe(2);
    expect(stderr).toContain('CONCURRENT:');
    // 磁盘内容未被冲突写入者覆盖
    expect(readFileSync(join(tmpDir, '.openfeel', 'flow.json'), 'utf-8')).toBe(diskAfterMain);
  }, 20000);
});
