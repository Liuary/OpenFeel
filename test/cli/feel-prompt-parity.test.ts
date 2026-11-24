/**
 * 提示词正文副本一致性（v1.6.0-stage-132 / T10，plan §5.2）
 *
 * `dsh/lib/surface/prompt.js` 是**源**（`FEEL_BODY_ZH` / `FEEL_BODY_EN`）。
 * 四份同源副本 + 构建产物必须逐字镜像同一段正文，否则提示词再次分叉
 * （`prompt-adherence.md` §4 T1 的代价）：
 *
 *   1. src/core/template-loader.ts                     （build.js 生成，含 3 个常量 × 2 语言 = 6 块）
 *   2. src/core/templates-data/claude/agents/zh-CN/feel.md
 *   3. src/core/templates-data/claude/agents/en/feel.md
 *   4. src/core/templates-data/opencode/agents/zh-CN/feel.md
 *   5. src/core/templates-data/opencode/agents/en/feel.md
 *
 * 比对口径：正文块由 `<!-- feel-prompt-parity:begin/end -->` 包住，按 sha256 逐块比对。
 * template-loader.ts 里的内容是模板字符串字面量（`\`` / `\${` / `\\\\` 被转义），
 * 提取后按 build.js `escapeForTemplateString()` 的逆序解码再比对。
 */
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { FEEL_BODY_EN, FEEL_BODY_ZH } from '../../dsh/lib/surface/prompt.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** 副本清单（文件相对仓库根）。 */
const COPIES = [
  'src/core/template-loader.ts',
  'src/core/templates-data/claude/agents/zh-CN/feel.md',
  'src/core/templates-data/claude/agents/en/feel.md',
  'src/core/templates-data/opencode/agents/zh-CN/feel.md',
  'src/core/templates-data/opencode/agents/en/feel.md',
] as const;

const BLOCK_RE = /<!-- feel-prompt-parity:begin -->\n([\s\S]*?)<!-- feel-prompt-parity:end -->/g;

/** build.js `escapeForTemplateString()` 的逆变换（顺序必须与转义相反）。 */
function unescapeTemplateLiteral(text: string): string {
  return text
    .replace(/\\\$\{/g, '${')
    .replace(/\\`/g, '`')
    .replace(/\\\\/g, '\\');
}

/**
 * 提取一个文件里的全部正文块。
 * @param relativePath 仓库根相对路径
 * @returns 正文块原文（template-loader.ts 已解码）
 */
function extractBlocks(relativePath: string): string[] {
  const absolute = join(ROOT, relativePath);
  expect(existsSync(absolute), `副本缺失：${relativePath}`).toBe(true);
  const source = readFileSync(absolute, 'utf-8');
  const blocks: string[] = [];
  for (const match of source.matchAll(BLOCK_RE)) {
    blocks.push(relativePath.endsWith('template-loader.ts') ? unescapeTemplateLiteral(match[1]) : match[1]);
  }
  return blocks;
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf-8').digest('hex');
}

describe('Feel 提示词正文副本一致性（plan §5.2）', () => {
  const zhHash = sha256(FEEL_BODY_ZH);
  const enHash = sha256(FEEL_BODY_EN);

  it('源正文非空且带三个检查点（防止对齐到空块）', () => {
    expect(FEEL_BODY_ZH.length).toBeGreaterThan(200);
    expect(FEEL_BODY_EN.length).toBeGreaterThan(200);
    expect(FEEL_BODY_ZH).toContain('三个检查点');
    expect(FEEL_BODY_ZH).toContain('feel_dispatch');
    expect(FEEL_BODY_EN).toContain('Three checkpoints');
    expect(FEEL_BODY_EN).toContain('feel_dispatch');
  });

  it('5 处副本都带 parity 标记块（缺块 = 分叉起点）', () => {
    for (const copy of COPIES) {
      expect(extractBlocks(copy).length, `${copy} 缺少 feel-prompt-parity 标记块`).toBeGreaterThan(0);
    }
  });

  it('4 份 feel.md 副本与其语言源正文 sha256 相同', () => {
    const cases: Array<[string, string, string]> = [
      ['src/core/templates-data/claude/agents/zh-CN/feel.md', FEEL_BODY_ZH, zhHash],
      ['src/core/templates-data/claude/agents/en/feel.md', FEEL_BODY_EN, enHash],
      ['src/core/templates-data/opencode/agents/zh-CN/feel.md', FEEL_BODY_ZH, zhHash],
      ['src/core/templates-data/opencode/agents/en/feel.md', FEEL_BODY_EN, enHash],
    ];
    for (const [copy, source, expectedHash] of cases) {
      const blocks = extractBlocks(copy);
      expect(blocks, `${copy} 应恰有 1 个正文块`).toHaveLength(1);
      expect(blocks[0], `${copy} 正文与源不一致`).toBe(source);
      expect(sha256(blocks[0]), `${copy} sha256 与源不一致`).toBe(expectedHash);
    }
  });

  it('template-loader.ts 的 6 个正文块（3 常量 × 2 语言）全部与源同哈希', () => {
    const blocks = extractBlocks('src/core/template-loader.ts');
    // AGENT_TEMPLATES / OPENCODE_AGENT_TEMPLATES / CLAUDE_AGENT_TEMPLATES 各含 zh-CN + en
    expect(blocks, 'template-loader.ts 应有 6 个正文块（重跑 npm run build 后再试）').toHaveLength(6);
    const hashes = blocks.map(sha256);
    expect(hashes.filter((hash) => hash === zhHash)).toHaveLength(3);
    expect(hashes.filter((hash) => hash === enHash)).toHaveLength(3);
    for (const [index, block] of blocks.entries()) {
      if (sha256(block) === zhHash) expect(block).toBe(FEEL_BODY_ZH);
      else if (sha256(block) === enHash) expect(block).toBe(FEEL_BODY_EN);
      else expect.fail(`template-loader.ts 第 ${index + 1} 个正文块与源不一致（sha256=${sha256(block)}）`);
    }
  });

  it('4 份 feel.md 的正文块 sha256 互相一致（同语言）', () => {
    const zhBlocks = [
      extractBlocks('src/core/templates-data/claude/agents/zh-CN/feel.md'),
      extractBlocks('src/core/templates-data/opencode/agents/zh-CN/feel.md'),
    ].map((blocks) => sha256(blocks[0]));
    const enBlocks = [
      extractBlocks('src/core/templates-data/claude/agents/en/feel.md'),
      extractBlocks('src/core/templates-data/opencode/agents/en/feel.md'),
    ].map((blocks) => sha256(blocks[0]));
    expect(new Set(zhBlocks).size, 'zh 副本 sha256 不一致').toBe(1);
    expect(new Set(enBlocks).size, 'en 副本 sha256 不一致').toBe(1);
  });
});
