/**
 * 模板管线多源化迁移不变量测试（stage-68 op-002 / T4）
 *
 * 断言：
 *   ① skill 权威源已迁中立共享源 templates-data/skills（18 目录，各含 SKILL.md）；
 *   ② 双注入对象 SKILL_DEFINITIONS ≡ OPENCODE_SKILL_DEFINITIONS 键集，均为 18；
 *   ③ 冗余旧树 templates-data/opencode/skills 不存在（防复活）；
 *   ④ 注入内容与共享源逐字节一致（零内容变更的生成侧复核）。
 *
 * 说明：T4.4「内容零 diff」的**源侧**证明由 op-001 的 `git mv`（纯重命名）+
 * `npm run build` ×2 幂等承担（见 op-002 门禁与自测 S2/S3），本文件提供生成侧复核。
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { listOpencodeSkillNames } from '../../src/core/template-loader.js';
import { SKILL_DEFINITIONS } from '../../src/core/update.js';

const ROOT = process.cwd();
const SHARED_SKILLS_DIR = join(ROOT, 'src', 'core', 'templates-data', 'skills');
const LEGACY_SKILLS_DIR = join(ROOT, 'src', 'core', 'templates-data', 'opencode', 'skills');

/** 归一化行尾（与 build 注入一致，避免 CRLF 误报） */
const norm = (s: string) => s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

describe('stage-68 T4：skill 源迁移不变量（零内容变更）', () => {
  it('T4.1 共享源含 18 个 skill 目录，且各含 SKILL.md', () => {
    expect(existsSync(SHARED_SKILLS_DIR), '共享源目录存在').toBe(true);
    const dirs = readdirSync(SHARED_SKILLS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    expect(dirs.length, 'skill 目录数').toBe(18);
    for (const d of dirs) {
      expect(existsSync(join(SHARED_SKILLS_DIR, d, 'SKILL.md')), `${d}/SKILL.md`).toBe(true);
    }
  });

  it('T4.2 双注入对象键集一致且均为 18', () => {
    const fromUpdate = Object.keys(SKILL_DEFINITIONS).sort();
    const fromLoader = listOpencodeSkillNames().sort();
    expect(fromUpdate.length, 'SKILL_DEFINITIONS 键数').toBe(18);
    expect(fromLoader.length, 'OPENCODE_SKILL_DEFINITIONS 键数').toBe(18);
    expect(fromUpdate, '两对象键集一致').toEqual(fromLoader);
  });

  it('T4.3 冗余旧树 templates-data/opencode/skills 不存在（防复活）', () => {
    expect(existsSync(LEGACY_SKILLS_DIR), '旧树必须不存在').toBe(false);
  });

  it('T4.4 注入内容与共享源逐字节一致（全量抽样）', () => {
    for (const name of Object.keys(SKILL_DEFINITIONS)) {
      const src = norm(readFileSync(join(SHARED_SKILLS_DIR, name, 'SKILL.md'), 'utf-8'));
      expect(norm(SKILL_DEFINITIONS[name]), `${name} 内容一致`).toBe(src);
      expect(src.length, `${name} 非空`).toBeGreaterThan(0);
    }
  });
});
