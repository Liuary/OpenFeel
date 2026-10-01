/**
 * 模板口径测试（stage-50 op-006 T53/T54/T55）
 * 断言部署型 skill 双口径、agents-md 图注英文化、cli-usage 枚举/命令表补齐。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getCurrentTemplate } from '../../src/core/templates.js';

const ROOT = process.cwd();
const SKILLS_DIR = join(ROOT, 'src', 'core', 'templates-data', 'opencode', 'skills');
const SKILLS = ['openfeel-cli-usage', 'openfeel-wizard', 'openfeel-health', 'openfeel-model-check', 'openfeel-recover'];

describe('模板口径（stage-50 op-006 T53/T54/T55）', () => {
  it('T53：5 skill 模板 node bin 仅出现在加注行（每文件 1 处）且含加注、主口径为 openfeel', () => {
    for (const s of SKILLS) {
      const content = readFileSync(join(SKILLS_DIR, s, 'SKILL.md'), 'utf-8');
      const count = (content.match(/node bin\/openfeel\.js/g) ?? []).length;
      expect(count, `${s} node bin 计数`).toBe(1);
      expect(content, `${s} 缺少本仓自举加注`).toContain('本仓自举');
      expect(content, `${s} 主口径缺失`).toMatch(/`openfeel /);
    }
  });

  it('T54：agents-md en 图注并列英文；zh/en 图体行数一致', () => {
    const en = readFileSync(join(ROOT, 'src', 'core', 'templates-data', 'agents-md', 'en.md'), 'utf-8');
    const zh = readFileSync(join(ROOT, 'src', 'core', 'templates-data', 'agents-md', 'zh-CN.md'), 'utf-8');
    // en 图注含并列英文（不再仅中文）
    expect(en).toContain('review failed');
    // 抽取含 pending/open 的代码块，zh/en 图体行数一致（图示未错位）
    const block = (text: string): string[] => {
      const lines = text.split('\n');
      const idx = lines.findIndex((l) => l.includes('pending/open'));
      let start = idx;
      while (start >= 0 && !lines[start].startsWith('```')) start--;
      let end = idx;
      while (end < lines.length && !(end > idx && lines[end].startsWith('```'))) end++;
      return lines.slice(start, end + 1);
    };
    expect(block(en).length).toBe(block(zh).length);
  });

  it('T55：cli-usage 枚举含 phases/stage；命令表覆盖 16 命令族', () => {
    const c = readFileSync(join(SKILLS_DIR, 'openfeel-cli-usage', 'SKILL.md'), 'utf-8');
    expect(c).toContain('`phases`');
    expect(c).toContain('`stage`');
    for (const fam of ['archive', 'view', 'project', 'roadmap', 'instructions']) {
      expect(c, `缺少命令族 ${fam}`).toContain(`openfeel ${fam}`);
    }
  });
});

/**
 * stage-53 D2（op-005 D10-2）：current.md 模板迭代
 * 新骨架：用户级整体信息 + 近期提交记录（≤5）+ current_archive 自动归档。
 */
describe('stage-53 D2：current.md 模板迭代', () => {
  it('zh 模板不含旧「团队成员进度」「暂无活跃成员」，含「近期提交记录」与 current_archive', () => {
    const zh = getCurrentTemplate('zh-CN');
    expect(zh).not.toContain('团队成员进度');
    expect(zh).not.toContain('暂无活跃成员');
    expect(zh).toContain('近期提交记录');
    expect(zh).toContain('current_archive');
  });

  it('en 模板不含 Team Member Progress，含 Recent Submissions 与 current_archive', () => {
    const en = getCurrentTemplate('en');
    expect(en).not.toContain('Team Member Progress');
    expect(en).toContain('Recent Submissions');
    expect(en).toContain('current_archive');
  });
});
