/**
 * .opencode/ 自举实例与构建产物校验（stage-36 / D36-3）
 *
 * 覆盖：
 *  - agent / skill 重命名后的实例目录前缀完整性
 *  - 生成物标记（openfeel:generated）位置正确
 *  - 生成模板串无 CRLF（跨平台可复现）
 *
 * 依赖 `npm run build` 已执行（.opencode/ 与生成文件为构建产物）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const MARK = '<!-- openfeel:generated';

/** 收集 .opencode/ 下全部受管文件（agents + skills + ADAPTER.md；v1.1.1 移除 instructions/core.md） */
function managedFiles(): string[] {
  const files: string[] = [];
  const agentsDir = join(ROOT, '.opencode', 'agents');
  for (const f of readdirSync(agentsDir)) {
    if (f.endsWith('.md')) {
      files.push(join(agentsDir, f));
    }
  }
  const skillsDir = join(ROOT, '.opencode', 'skills');
  for (const d of readdirSync(skillsDir, { withFileTypes: true })) {
    if (d.isDirectory()) {
      files.push(join(skillsDir, d.name, 'SKILL.md'));
    }
  }
  files.push(join(ROOT, '.opencode', 'ADAPTER.md'));
  return files;
}

describe('.opencode/ 自举实例', () => {
  it('agents 目录含 8 个 openfeel-* + feel.md，无旧名残留', () => {
    const files = readdirSync(join(ROOT, '.opencode', 'agents')).filter((f) => f.endsWith('.md'));
    expect(files).toHaveLength(9);
    expect(files).toContain('feel.md');
    expect(files.filter((f) => f.startsWith('openfeel-'))).toHaveLength(8);
    for (const old of ['planner.md', 'schemer.md', 'executor.md', 'reviewer.md', 'feel-tester.md', 'utility.md', 'vision.md', 'archiver.md']) {
      expect(files).not.toContain(old);
    }
  });

  it('skills 目录含 17 个 openfeel-*，无旧名目录', () => {
    const dirs = readdirSync(join(ROOT, '.opencode', 'skills'), { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    expect(dirs).toHaveLength(17);
    expect(dirs.every((d) => d.startsWith('openfeel-'))).toBe(true);
  });

  it('受管文件（27）均含 openfeel:generated 标记', () => {
    const files = managedFiles();
    expect(files).toHaveLength(27);
    for (const f of files) {
      expect(readFileSync(f, 'utf-8')).toContain(MARK);
    }
  });

  it('frontmatter 文件的生成标记位于闭合 --- 之后', () => {
    for (const f of managedFiles()) {
      const c = readFileSync(f, 'utf-8');
      const markIdx = c.indexOf(MARK);
      expect(markIdx).toBeGreaterThanOrEqual(0);
      if (c.startsWith('---\n')) {
        const closeIdx = c.indexOf('\n---', 3);
        expect(closeIdx).toBeGreaterThan(-1);
        expect(markIdx).toBeGreaterThan(closeIdx);
      }
    }
  });

  it('生成模板串无 CRLF（跨平台可复现）', () => {
    for (const f of ['src/core/template-loader.ts', 'src/core/update.ts']) {
      const c = readFileSync(join(ROOT, f), 'utf-8');
      expect(c.includes('\r\n')).toBe(false);
    }
  });

  it('agents 自举实例均含 external_directory（stage-44 权限补键）', () => {
    const dir = join(ROOT, '.opencode', 'agents');
    const files = readdirSync(dir).filter((f) => f.endsWith('.md'));
    expect(files).toHaveLength(9);
    for (const f of files) {
      expect(readFileSync(join(dir, f), 'utf-8'), f).toContain('external_directory');
    }
  });

  it('自举 openfeel-reviewer.md 含工具异常独立取证纪律节（stage-48 op-001）', () => {
    const c = readFileSync(join(ROOT, '.opencode', 'agents', 'openfeel-reviewer.md'), 'utf-8');
    expect(c).toContain('工具调用异常');
    expect(c).toContain('独立取证');
  });
});

describe('发布元数据（stage-49 B3/B4）', () => {
  it('package.json 无 postinstall；engines.node 收窄；files 不含 scripts', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8')) as {
      scripts: Record<string, string>;
      engines: { node: string };
      files: string[];
    };
    // B3：postinstall 补丁移除 + engines 对齐 @inquirer/core + files 去除 scripts
    expect(pkg.scripts.postinstall).toBeUndefined();
    expect(pkg.engines.node).toBe('>=20.17.0');
    expect(pkg.files).not.toContain('scripts');
  });

  it('scripts/patch-inquirer.js 已删除', () => {
    expect(existsSync(join(ROOT, 'scripts', 'patch-inquirer.js'))).toBe(false);
  });

  it('dist/index.js 不再导出 VERSION（B4 死导出移除）', async () => {
    const distPath = join(ROOT, 'dist', 'index.js');
    // build 未执行时跳过（dist 为构建产物）
    if (!existsSync(distPath)) {
      return;
    }
    const mod = await import(pathToFileURL(distPath).href);
    expect('VERSION' in mod).toBe(false);
  });
});
