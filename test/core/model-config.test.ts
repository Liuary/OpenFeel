/**
 * model-config 单元测试（stage-40 / op-001）
 * 覆盖三层级读写 / 校验 / 幂等 / frontmatter 合并 / 生效值解析。
 * mock homedir 隔离全局路径与 auth.json（REV-1505）；default 层复制仓库源到 tmp（REV-1506）。
 *
 * 注：effective 解析断言采用「实测修正链」（REV-1606）：default(frontmatter) > project(jsonc) > global(jsonc)。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// mock homedir（REV-1505：getAuthJsonPath / getGlobalOpencodeJsoncPath 走本 mock）
const mockHome = vi.hoisted(() => ({ dir: '' }));
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => mockHome.dir };
});

import {
  setAgentModel, getAgentModel, listAgentModels, validateModel, readAuthProviders,
} from '../../src/core/model-config.js';
import {
  readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, readdirSync, statSync, copyFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { parseJsonc } from '../../src/core/opencode-config.js';

/** 递归复制目录（复制仓库 templates-data 到 tmp） */
function copyDirSync(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true });
  for (const name of readdirSync(src)) {
    const s = join(src, name);
    const d = join(dest, name);
    if (statSync(s).isDirectory()) {
      copyDirSync(s, d);
    } else {
      copyFileSync(s, d);
    }
  }
}

/** 建立隔离的框架源码根（含 src/core/templates-data/opencode/agents + src/core/opencode-config.ts） */
function setupFrameworkTmp(): string {
  const root = mkdtempSync(join(tmpdir(), 'model-config-fw-'));
  const srcCore = resolve(process.cwd(), 'src', 'core');
  copyDirSync(
    join(srcCore, 'templates-data', 'opencode', 'agents'),
    join(root, 'src', 'core', 'templates-data', 'opencode', 'agents'),
  );
  mkdirSync(join(root, 'src', 'core'), { recursive: true });
  copyFileSync(join(srcCore, 'opencode-config.ts'), join(root, 'src', 'core', 'opencode-config.ts'));
  return root;
}

/** 写 mock auth.json（含指定 provider） */
function writeAuthJson(providers: string[]): void {
  const p = join(mockHome.dir, '.local', 'share', 'opencode', 'auth.json');
  mkdirSync(join(mockHome.dir, '.local', 'share', 'opencode'), { recursive: true });
  writeFileSync(p, JSON.stringify(Object.fromEntries(providers.map((k) => [k, { type: 'api', key: 'x' }]))));
}

describe('model-config', () => {
  let homeDir: string;
  let fwRoots: string[];
  let projectDirs: string[];

  beforeEach(() => {
    homeDir = mkdtempSync(join(tmpdir(), 'model-config-home-'));
    mockHome.dir = homeDir;
    fwRoots = [];
    projectDirs = [];
  });
  afterEach(() => {
    for (const d of fwRoots) {
      rmSync(d, { recursive: true, force: true });
    }
    for (const d of projectDirs) {
      rmSync(d, { recursive: true, force: true });
    }
    rmSync(homeDir, { recursive: true, force: true });
  });

  describe('readAuthProviders / validateModel', () => {
    it('auth.json 含三 provider 时返回三者；缺文件返回 null', () => {
      expect(readAuthProviders()).toBeNull();
      writeAuthJson(['deepseek', 'zhipuai', 'alibaba-cn']);
      expect(readAuthProviders()).toEqual(['deepseek', 'zhipuai', 'alibaba-cn']);
    });

    it('provider 硬校验：不在 auth.json 拒绝并附 provider 列表', () => {
      writeAuthJson(['deepseek', 'zhipuai', 'alibaba-cn']);
      const r = validateModel('unknown/model');
      expect(r.ok).toBe(false);
      expect(r.providers).toEqual(['deepseek', 'zhipuai', 'alibaba-cn']);
    });

    it('model-id 软校验：合法 provider + 合法格式 → ok + warning（不硬 block）', () => {
      writeAuthJson(['deepseek']);
      const r = validateModel('deepseek/deepseek-flash');
      expect(r.ok).toBe(true);
      expect(r.warning).toBeTruthy();
    });

    it('格式非法拒绝：空 / 缺斜杠 / 含空白', () => {
      writeAuthJson(['deepseek']);
      expect(validateModel('deepseek').ok).toBe(false);
      expect(validateModel('').ok).toBe(false);
      expect(validateModel('deepseek/ bad id').ok).toBe(false);
    });
  });

  describe('default 层', () => {
    it('executor（仅 frontmatter）写双语 frontmatter，保留其他字段与正文', () => {
      const fw = setupFrameworkTmp();
      fwRoots.push(fw);
      const r = setAgentModel('default', 'executor', 'deepseek/new-model', { frameworkRoot: fw });
      expect(r.needsBuild).toBe(true);
      expect(r.changedFiles).toHaveLength(2);
      for (const lang of ['zh-CN', 'en']) {
        const p = join(fw, 'src', 'core', 'templates-data', 'opencode', 'agents', lang, 'openfeel-executor.md');
        const content = readFileSync(p, 'utf-8');
        expect(content).toContain('model: deepseek/new-model');
        // 其他字段与正文保留
        expect(content).toContain('mode: subagent');
        expect(content).toContain('description:');
      }
      const zh = readFileSync(join(fw, 'src', 'core', 'templates-data', 'opencode', 'agents', 'zh-CN', 'openfeel-executor.md'), 'utf-8');
      expect(zh).toContain('你是 openfeel-executor');
    });

    it('openfeel-vision（frontmatter + opencode-config.ts）改 3 处且结构化定位不误伤 reviewer', () => {
      const fw = setupFrameworkTmp();
      fwRoots.push(fw);
      const r = setAgentModel('default', 'openfeel-vision', 'deepseek/deepseek-flash', { frameworkRoot: fw });
      expect(r.changedFiles).toHaveLength(3);
      const cfg = readFileSync(join(fw, 'src', 'core', 'opencode-config.ts'), 'utf-8');
      expect(cfg).toContain("'openfeel-vision': { model: 'deepseek/deepseek-flash' }");
      // reviewer 条目不变
      expect(cfg).toContain("'openfeel-reviewer': { model: 'zhipuai/glm-5.2' }");
    });

    it('无显式 model 的 agent（feel）抛错，不产生文件变更', () => {
      const fw = setupFrameworkTmp();
      fwRoots.push(fw);
      expect(() => setAgentModel('default', 'feel', 'x/y', { frameworkRoot: fw }))
        .toThrow(/无框架默认 model/);
    });

    it('不传 frameworkRoot 时 default 层路径推导正确（真实项目根，REV-1601）', () => {
      writeAuthJson(['deepseek', 'zhipuai', 'alibaba-cn']);
      // 只读验证：不传 frameworkRoot，依赖 resolveFrameworkRoot 从 MODULE_DIR 上溯两级定位真实仓库源。
      // 旧实现只上溯一级 → 拼出 src/src/core/... 双重 src，existsSync 失败 → default 读不到为 null。
      const r = getAgentModel('executor', 'default', {});
      // 路径正确 → 读到真实仓库源 frontmatter 的显式 model（executor 属「有显式 model 的 4 agent」）
      expect(r.byScope.default).toBeTruthy();
    });
  });

  describe('global / project 层', () => {
    it('global 写 ~/.config/opencode/opencode.jsonc，只改 model 键、保留同 agent 其他字段（REV-1507）', () => {
      const jsonc = join(mockHome.dir, '.config', 'opencode', 'opencode.jsonc');
      mkdirSync(join(mockHome.dir, '.config', 'opencode'), { recursive: true });
      writeFileSync(jsonc, JSON.stringify({ agent: { 'openfeel-executor': { model: 'a/b', mode: 'subagent' } } }));
      const r = setAgentModel('global', 'executor', 'deepseek/flash', {});
      expect(r.changedFiles).toEqual([jsonc]);
      const obj = parseJsonc(readFileSync(jsonc, 'utf-8')) as { agent: Record<string, unknown> };
      expect(obj.agent['openfeel-executor']).toEqual({ model: 'deepseek/flash', mode: 'subagent' });
    });

    it('project 写项目根 opencode.jsonc（原子写，不加锁）', () => {
      const proj = mkdtempSync(join(tmpdir(), 'model-config-proj-'));
      projectDirs.push(proj);
      const r = setAgentModel('project', 'openfeel-executor', 'deepseek/flash', { projectPath: proj });
      expect(r.changedFiles).toEqual([join(proj, 'opencode.jsonc')]);
      const obj = parseJsonc(readFileSync(join(proj, 'opencode.jsonc'), 'utf-8')) as { agent: Record<string, unknown> };
      expect(obj.agent['openfeel-executor']).toEqual({ model: 'deepseek/flash' });
    });
  });

  describe('get / list / 生效值解析', () => {
    it('无 scope 时 effective 按 default > project > global 取首个非空（实测修正链 REV-1606）', () => {
      writeAuthJson(['deepseek', 'zhipuai', 'alibaba-cn']);
      const proj = mkdtempSync(join(tmpdir(), 'model-config-proj-'));
      projectDirs.push(proj);
      const fw = setupFrameworkTmp();
      fwRoots.push(fw);
      // executor 有框架默认 frontmatter model → default 最高，遮蔽 project/global jsonc（opencode 实测语义）
      setAgentModel('global', 'executor', 'deepseek/global-v', {});
      setAgentModel('project', 'executor', 'deepseek/proj-v', { projectPath: proj });
      const rex = getAgentModel('executor', undefined, { projectPath: proj, frameworkRoot: fw });
      expect(rex.effective).toBe('deepseek/deepseek-flash'); // default 覆盖 project/global
      expect(rex.byScope.project).toBe('deepseek/proj-v');
      expect(rex.byScope.global).toBe('deepseek/global-v');

      // feel 无框架默认 model → 由 project/global jsonc 补位，project > global
      expect(getAgentModel('feel', undefined, { projectPath: proj, frameworkRoot: fw }).effective).toBeUndefined();
      setAgentModel('global', 'feel', 'deepseek/global-f', {});
      expect(getAgentModel('feel', undefined, { projectPath: proj, frameworkRoot: fw }).effective).toBe('deepseek/global-f');
      setAgentModel('project', 'feel', 'deepseek/proj-f', { projectPath: proj });
      expect(getAgentModel('feel', undefined, { projectPath: proj, frameworkRoot: fw }).effective).toBe('deepseek/proj-f');
    });

    it('default 层多源不一致时置 inconsistent 且 effective 取 frontmatter 值（REV-1606 修正）', () => {
      writeAuthJson(['alibaba-cn', 'zhipuai']);
      const fw = setupFrameworkTmp();
      fwRoots.push(fw);
      // frontmatter 改 vision 为 A，opencode-config.ts 保持 B → 不一致
      setAgentModel('default', 'openfeel-vision', 'alibaba-cn/fm-only', { frameworkRoot: fw });
      // 恢复 opencode-config.ts 为原值以制造不一致：重新复制原 opencode-config.ts
      copyFileSync(resolve(process.cwd(), 'src', 'core', 'opencode-config.ts'), join(fw, 'src', 'core', 'opencode-config.ts'));
      const r = getAgentModel('openfeel-vision', 'default', { frameworkRoot: fw });
      expect(r.inconsistent).toBe(true);
      // 实测修正链：agent markdown frontmatter 覆盖 opencode.jsonc（opencode-config.ts 侧），故取 frontmatter 值
      expect(r.effective).toBe('alibaba-cn/fm-only');
    });

    it('listAgentModels 返回 9 条，每条 byScope 完整（REV-1507）', () => {
      writeAuthJson(['deepseek', 'zhipuai', 'alibaba-cn']);
      const proj = mkdtempSync(join(tmpdir(), 'model-config-proj-'));
      projectDirs.push(proj);
      const fw = setupFrameworkTmp();
      fwRoots.push(fw);
      const list = listAgentModels(undefined, { projectPath: proj, frameworkRoot: fw });
      expect(list).toHaveLength(9);
      for (const item of list) {
        expect(item.byScope).toHaveProperty('project');
        expect(item.byScope).toHaveProperty('global');
        expect(item.byScope).toHaveProperty('default');
      }
    });

    it('agent 名归一化：executor → openfeel-executor，openfeel-executor 幂等', () => {
      writeAuthJson(['deepseek']);
      const proj = mkdtempSync(join(tmpdir(), 'model-config-proj-'));
      projectDirs.push(proj);
      setAgentModel('project', 'executor', 'deepseek/flash', { projectPath: proj });
      const obj = parseJsonc(readFileSync(join(proj, 'opencode.jsonc'), 'utf-8')) as { agent: Record<string, unknown> };
      expect(obj.agent['openfeel-executor']).toEqual({ model: 'deepseek/flash' });
    });
  });

  describe('幂等', () => {
    it('重复 set 同一值不漂移（frontmatter 不产生多余 model 行、jsonc 结构不变）', () => {
      writeAuthJson(['deepseek']);
      const fw = setupFrameworkTmp();
      fwRoots.push(fw);
      const p = join(fw, 'src', 'core', 'templates-data', 'opencode', 'agents', 'zh-CN', 'openfeel-executor.md');
      setAgentModel('default', 'executor', 'deepseek/x', { frameworkRoot: fw });
      const first = readFileSync(p, 'utf-8');
      setAgentModel('default', 'executor', 'deepseek/x', { frameworkRoot: fw });
      expect(readFileSync(p, 'utf-8')).toBe(first);
    });

    it('重复 set project 同一值不漂移', () => {
      writeAuthJson(['deepseek']);
      const proj = mkdtempSync(join(tmpdir(), 'model-config-proj-'));
      projectDirs.push(proj);
      setAgentModel('project', 'executor', 'deepseek/x', { projectPath: proj });
      const first = readFileSync(join(proj, 'opencode.jsonc'), 'utf-8');
      setAgentModel('project', 'executor', 'deepseek/x', { projectPath: proj });
      expect(readFileSync(join(proj, 'opencode.jsonc'), 'utf-8')).toBe(first);
    });
  });
});
