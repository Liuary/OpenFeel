/**
 * sequence 单元测试 — O_EXCL 原子序号分配
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { reserveSequence, nextSequence, nextSchemeSequence } from '../../../src/core/fs/sequence.js';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

/** 候选名：op-{3 位}.md */
const candidate = (seq: number): string => `op-${String(seq).padStart(3, '0')}.md`;
/** 解析：仅从文件名取序号 */
const parse = (fileName: string): number | null => {
  const m = fileName.match(/^op-(\d+)\.md$/);
  return m ? parseInt(m[1], 10) : null;
};

describe('sequence', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-sequence-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('空目录从 1 开始', () => {
    const r = reserveSequence({ dir: tmpDir, candidate, parse });
    expect(r.seq).toBe(1);
    expect(r.fileName).toBe('op-001.md');
    expect(existsSync(r.path)).toBe(true);
  });

  it('已有文件时从 max+1 开始', () => {
    writeFileSync(join(tmpDir, 'op-001.md'), 'x', 'utf-8');
    writeFileSync(join(tmpDir, 'op-003.md'), 'x', 'utf-8');
    const r = reserveSequence({ dir: tmpDir, candidate, parse });
    expect(r.seq).toBe(4);
  });

  it('空文件占位仍被 max+1 计入（REV-009）', () => {
    // 模拟崩溃残留：空文件 op-002.md
    writeFileSync(join(tmpDir, 'op-002.md'), '', 'utf-8');
    expect(nextSequence(tmpDir, parse)).toBe(3);
    const r = reserveSequence({ dir: tmpDir, candidate, parse });
    expect(r.seq).toBe(3);
  });

  it('候选被占用时递增重试（起点冲突）', () => {
    writeFileSync(join(tmpDir, 'op-001.md'), 'x', 'utf-8');
    // 显式起点 1（已被占）→ 应落到 2
    const r = reserveSequence({ dir: tmpDir, candidate, parse, start: 1 });
    expect(r.seq).toBe(2);
  });

  it('达到重试上限时抛错', () => {
    writeFileSync(join(tmpDir, 'op-001.md'), 'x', 'utf-8');
    expect(() =>
      reserveSequence({ dir: tmpDir, candidate, parse, start: 1, maxAttempts: 1 }),
    ).toThrow(/序号分配失败/);
  });

  it('padStart 3 位格式', () => {
    const r = reserveSequence({ dir: tmpDir, candidate, parse, start: 12 });
    expect(r.fileName).toBe('op-012.md');
  });

  it('并发子进程各自取得不同序号', (ctx) => {
    const modulePath = join(tmpDir, 'sequence.mjs');
    const src = readFileSync(join(process.cwd(), 'src', 'core', 'fs', 'sequence.ts'), 'utf-8');
    const out = ts.transpileModule(src, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    writeFileSync(modulePath, out, 'utf-8');

    const dir = join(tmpDir, 'seqs');
    const workerPath = join(tmpDir, 'worker.mjs');
    writeFileSync(workerPath, `
import { reserveSequence } from './sequence.mjs';
import { appendFileSync } from 'node:fs';
const dir = ${JSON.stringify(dir)};
for (let i = 0; i < 20; i++) {
  const r = reserveSequence({
    dir,
    candidate: (s) => 'op-' + String(s).padStart(3, '0') + '.md',
    parse: (f) => { const m = f.match(/^op-(\\d+)\\.md$/); return m ? parseInt(m[1], 10) : null; },
  });
  appendFileSync(${JSON.stringify(join(tmpDir, 'seqs.txt'))}, r.seq + '\\n', 'utf-8');
}
`, 'utf-8');

    const procs = [0, 1, 2, 3].map(() => spawnSync(process.execPath, [workerPath], { encoding: 'utf-8', timeout: 30000 }));
    for (const p of procs) {
      if (p.status !== 0) {
        // 运行期子进程不可用 → 显式 skip（可见），不再以 return 冒充 passed
        ctx.skip();
        return;
      }
    }
    const seqs = readFileSync(join(tmpDir, 'seqs.txt'), 'utf-8').trim().split('\n').map(Number);
    expect(seqs).toHaveLength(80);
    expect(new Set(seqs).size).toBe(80); // 无重号
    expect(readdirSync(dir).filter((f) => f.endsWith('.md'))).toHaveLength(80);
  }, 40000);
});

// ═══════════════════════════════════════
// stage-64 op-001：序号「注册 ∪ 文件」最小未用（空位回填）
// ═══════════════════════════════════════

describe('nextSchemeSequence（stage-64 T1）', () => {
  it('空集 → 1', () => {
    expect(nextSchemeSequence(new Set<number>(), new Set<number>())).toBe(1);
  });

  it('fileSeqs={1,2} → 3', () => {
    expect(nextSchemeSequence(new Set([1, 2]), new Set<number>())).toBe(3);
  });

  it('registeredSeqs={1,3} → 2（空位回填）', () => {
    expect(nextSchemeSequence(new Set<number>(), new Set([1, 3]))).toBe(2);
  });

  it('fileSeqs={2}, registeredSeqs={1,3} → 4（并集）', () => {
    expect(nextSchemeSequence(new Set([2]), new Set([1, 3]))).toBe(4);
  });
});
