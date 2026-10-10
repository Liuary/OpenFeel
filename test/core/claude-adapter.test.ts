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
import { loadClaudeConstraintTemplate } from '../../src/core/template-loader.js';

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

  it('constraint 无小写工具名 / `question` 工具残留（zh-CN/en）', () => {
    // 精确判定：仅锁定**反引号包裹的整词小写工具名**（闭引号锚定，规避 `readProfile()` 等函数名）
    // 与 Claude 侧不存在的 `question` 工具；不匹配合法出现的「主会话（Feel 角色）」/ agent 名 / `Edit`·`Write`·`Read`（已 PascalCase）。
    const lowerTool = /`(read|glob|grep|edit|write|bash|todowrite)`/;
    for (const lang of LANGS) {
      const c = loadClaudeConstraintTemplate(lang);
      const m = c.match(lowerTool);
      expect(m, `${lang} constraint 残留小写工具名：${m?.[0] ?? ''}`).toBeNull();
      expect(c, `${lang} constraint 残留 question 工具`).not.toContain('`question`');
    }
  });
});
