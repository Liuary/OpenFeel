/**
 * 发布元数据校验（stage-49 B3/B4）
 *
 * 迁移自 test/core/opencode-instance.test.ts 的 `describe('发布元数据（stage-49 B3/B4）')`。
 * 原文件因仓库根 `.opencode/` 受管实例于 stage-55 移除而删除；
 * 本组断言对象（package.json / scripts/patch-inquirer.js / dist/index.js）仍然有效，故整体迁移，断言逐字保留。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

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

  // ── v1.3.0-stage-101：单包分发 DSH 适配器 ─────────────────────────

  it('v1.3.0：files 含 dsh 运行文件与 ADAPTER.md', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8')) as { files: string[] };
    for (const entry of [
      'dsh/lib',
      'dsh/cordis.patch.yml',
      'dsh/package.json',
      'dsh/README.md',
      'dsh/ADAPTER.md',
      'dsh/docs',
    ]) {
      expect(pkg.files).toContain(entry);
    }
    expect(pkg.files).not.toContain('dsh/test');
  });

  it('v1.3.0：dsh/package.json 与根版本 lockstep，requiresCli 同步，仍 private', () => {
    const rootPkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8')) as { version: string };
    const dshPkg = JSON.parse(readFileSync(join(ROOT, 'dsh', 'package.json'), 'utf-8')) as {
      version: string;
      private: boolean;
      openfeel: { requiresCli: string };
    };
    expect(dshPkg.version).toBe(rootPkg.version);
    expect(dshPkg.private).toBe(true);
    expect(dshPkg.openfeel.requiresCli).toBe(`>=${rootPkg.version}`);
  });
});
