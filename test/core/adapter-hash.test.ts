/**
 * 适配器指纹 parity 测试（v1.3.4）
 *
 * 关键约束：CLI 侧（src/core/adapter-hash.ts）与 DSH 适配器侧
 * （dsh/lib/adapters/host-state.js）必须逐字节同算法，否则 `setup --check`
 * 会在「宿主已重启」时误报 restart-required。
 */
import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { hashAdapterFiles } from '../../src/core/adapter-hash.js';
import { hashLoadedAdapter, readHostMarker, writeHostMarker } from '../../dsh/lib/adapters/host-state.js';

const ROOT_DSH = fileURLToPath(new URL('../../dsh', import.meta.url));

describe('适配器指纹（v1.3.4）', () => {
  it('TS / DSH 两侧对真实 dsh/ 目录算法一致', () => {
    const tsHash = hashAdapterFiles(ROOT_DSH);
    const jsHash = hashLoadedAdapter(ROOT_DSH);
    expect(tsHash).toMatch(/^[0-9a-f]{64}$/);
    expect(jsHash).toBe(tsHash);
  });

  it('内容/文件集变化 → 指纹变化；行尾归一（CRLF ≡ LF）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'openfeel-adapter-hash-'));
    try {
      mkdirSync(join(dir, 'lib'), { recursive: true });
      writeFileSync(join(dir, 'lib', 'a.js'), 'export const a = 1;\n', 'utf-8');
      const lfHash = hashAdapterFiles(dir);
      expect(hashLoadedAdapter(dir)).toBe(lfHash);
      // CRLF 与 LF 归一后应一致
      writeFileSync(join(dir, 'lib', 'a.js'), 'export const a = 1;\r\n', 'utf-8');
      expect(hashAdapterFiles(dir)).toBe(lfHash);
      // 新增文件 → 指纹变化
      writeFileSync(join(dir, 'lib', 'b.js'), 'export const b = 2;\n', 'utf-8');
      expect(hashAdapterFiles(dir)).not.toBe(lfHash);
      expect(hashLoadedAdapter(dir)).toBe(hashAdapterFiles(dir));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('host marker 写入/读取 roundtrip（路径可注入）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'openfeel-adapter-marker-'));
    try {
      mkdirSync(join(dir, 'lib'), { recursive: true });
      writeFileSync(join(dir, 'lib', 'a.js'), 'x\n', 'utf-8');
      const markerPath = join(dir, 'host.json');
      const marker = writeHostMarker({ adapterRoot: dir, version: '9.9.9', markerPath });
      expect(marker).not.toBeNull();
      const read = readHostMarker(markerPath);
      expect(read?.loaded_hash).toBe(hashLoadedAdapter(dir));
      expect(read?.version).toBe('9.9.9');
      expect(read?.adapter).toBe('dsh');
      expect(typeof read?.started_at).toBe('string');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
