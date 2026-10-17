/**
 * 文档结构回归（v1.3.0-stage-101）
 *
 * 防回退：README 只保留索引，版本能力概览唯一收敛到 `docs/VERSIONS.md`；
 * DSH 安装节与「需求 + fast」推荐用法在三语 README 中同步存在。
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const READMES = ['README.md', 'README.zh-CN.md', 'README.en.md'];

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf-8');
}

describe('文档结构（v1.3.0）', () => {
  it('三份 README 均索引 VERSIONS / CHANGELOG', () => {
    for (const file of READMES) {
      const text = read(file);
      expect(text).toContain('docs/VERSIONS.md');
      expect(text).toContain('CHANGELOG.md');
    }
  });

  it('三份 README 均含推荐用法（req add + fast）', () => {
    for (const file of READMES) {
      const text = read(file);
      expect(text).toContain('req add');
      expect(text.toLowerCase()).toContain('fast');
    }
  });

  it('三份 README 均含 DSH 单包安装与 dsh/README.md 链接', () => {
    for (const file of READMES) {
      const text = read(file);
      expect(text).toContain('setup --tools dsh');
      expect(text).toContain('dsh/README.md');
    }
  });

  it('三份 README 已迁出版本能力章节', () => {
    expect(read('README.md')).not.toContain('## v1.2.4 新增能力');
    expect(read('README.zh-CN.md')).not.toContain('## v1.2.4 新增能力');
    expect(read('README.en.md')).not.toContain("## What's New in v1.2.4");
  });

  it('VERSIONS 单一文件存在且含 v1.3.0；不存在 VERSIONS.en.md', () => {
    expect(existsSync(join(ROOT, 'docs', 'VERSIONS.md'))).toBe(true);
    expect(existsSync(join(ROOT, 'docs', 'VERSIONS.en.md'))).toBe(false);
    expect(read('docs/VERSIONS.md')).toContain('v1.3.0');
  });

  it('CHANGELOG 含 [1.3.0]；docs/index 登记 VERSIONS', () => {
    expect(read('CHANGELOG.md')).toContain('## [1.3.0]');
    expect(read('docs/index.md')).toContain('VERSIONS.md');
  });

  it('三份 README 顶部 harness 行含 DSH', () => {
    for (const file of READMES) {
      const firstLines = read(file).split(/\r?\n/).slice(0, 12).join('\n');
      expect(firstLines).toContain('DSH');
    }
  });
});
