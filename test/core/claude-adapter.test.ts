/**
 * Claude 适配器跨切面断言（stage-69 T7.5b）
 *
 * 职责：对 Claude Code 独立内容源（templates-data/claude/**）做源文件级 + 跨切面断言：
 *  ① name == 文件名（9×2）；
 *  ② frontmatter `model: inherit`（供应商中立，裁定 E）；
 *  ③ CLAUDE.md 体量软上限 ≤ 700 行（防体量反弹，设计目标 ≈560）；
 *  ④ 跨切面：本阶段不产出 settings.json（归 stage-73）；
 *  ⑤ Claude agents 数 == opencode agents 数（均 9，含 feel，**非 −1**）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { splitFrontmatter } from '../../src/core/managed-region.js';

const ROOT = process.cwd();
const CLAUDE_DIR = join(ROOT, 'src', 'core', 'templates-data', 'claude');
const OPENCODE_DIR = join(ROOT, 'src', 'core', 'templates-data', 'opencode');
const LANGS = ['zh-CN', 'en'];

describe('Claude 适配器跨切面（stage-69 T7.5b）', () => {
  it('name == 文件名（9×2）', () => {
    for (const lang of LANGS) {
      const dir = join(CLAUDE_DIR, 'agents', lang);
      const files = readdirSync(dir).filter((f) => f.endsWith('.md'));
      for (const f of files) {
        const content = readFileSync(join(dir, f), 'utf-8');
        const split = splitFrontmatter(content);
        expect(split, `${lang}/${f} frontmatter 可解析`).not.toBeNull();
        expect(split!.frontmatter.name, `${lang}/${f} name`).toBe(basename(f, '.md'));
      }
    }
  });

  it('frontmatter model: inherit（供应商中立）', () => {
    for (const lang of LANGS) {
      const dir = join(CLAUDE_DIR, 'agents', lang);
      const files = readdirSync(dir).filter((f) => f.endsWith('.md'));
      for (const f of files) {
        const split = splitFrontmatter(readFileSync(join(dir, f), 'utf-8'));
        expect(split!.frontmatter.model, `${lang}/${f} model`).toBe('inherit');
      }
    }
  });

  it('CLAUDE.md 体量软上限 ≤ 700 行（zh-CN/en）', () => {
    for (const lang of LANGS) {
      const content = readFileSync(join(CLAUDE_DIR, 'constraint', `${lang}.md`), 'utf-8');
      const lines = content.split('\n').length;
      expect(lines, `${lang}.md 行数 ${lines}`).toBeLessThanOrEqual(700);
    }
  });

  it('跨切面：本阶段不产出 settings.json', () => {
    // ① claude-settings.ts 归 stage-73，本阶段不建
    expect(existsSync(join(ROOT, 'src', 'core', 'claude-settings.ts'))).toBe(false);
    // ② build.js 本阶段不产出 settings（不含 settings.json 引用）
    const buildSrc = readFileSync(join(ROOT, 'build.js'), 'utf-8');
    expect(buildSrc).not.toContain('settings.json');
    // ③ Claude 源树下无 settings.json
    expect(existsSync(join(CLAUDE_DIR, 'settings.json'))).toBe(false);
  });

  it('agents 数 == opencode 数（= 9，含 feel，非 −1）', () => {
    for (const lang of LANGS) {
      const claudeCount = readdirSync(join(CLAUDE_DIR, 'agents', lang)).filter((f) => f.endsWith('.md')).length;
      const opencodeCount = readdirSync(join(OPENCODE_DIR, 'agents', lang)).filter((f) => f.endsWith('.md')).length;
      expect(claudeCount, `${lang} claude vs opencode`).toBe(opencodeCount);
      expect(claudeCount).toBe(9);
    }
  });
});
