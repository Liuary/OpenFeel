/**
 * model-config 单元测试（stage-40 / op-001；v1.6.3 / REQ-070 改为两层级）
 * 覆盖两层（global / project）读写 / 校验 / 幂等 / 生效值解析。
 * default 层已移除（v1.6.3 / REQ-070）：`get --scope default` 恒 null（未显式设置），`set --scope default` 明确拒绝。
 * mock homedir 隔离全局路径与 auth.json（REV-1505）。
 *
 * 注：effective 解析断言（v1.6.3）：project(jsonc) > global(jsonc) > 平台默认（两者都空 → undefined）。
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
  existsSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseJsonc } from '../../src/core/opencode-config.js';

/** 写 mock auth.json（含指定 provider） */
function writeAuthJson(providers: string[]): void {
  const p = join(mockHome.dir, '.local', 'share', 'opencode', 'auth.json');
  mkdirSync(join(mockHome.dir, '.local', 'share', 'opencode'), { recursive: true });
  writeFileSync(p, JSON.stringify(Object.fromEntries(providers.map((k) => [k, { type: 'api', key: 'x' }]))));
}

describe('model-config', () => {
  let homeDir: string;
  let projectDirs: string[];

  beforeEach(() => {
    homeDir = mkdtempSync(join(tmpdir(), 'model-config-home-'));
    mockHome.dir = homeDir;
    projectDirs = [];
  });
  afterEach(() => {
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

  describe('default 层已移除（v1.6.3 / REQ-070）', () => {
    it('set --scope default 明确拒绝（提示 global / project，零写盘）', () => {
      writeAuthJson(['deepseek']);
      const proj = mkdtempSync(join(tmpdir(), 'model-config-proj-'));
      projectDirs.push(proj);
      expect(() => setAgentModel('default', 'openfeel-executor', 'deepseek/any', { projectPath: proj }))
        .toThrow(/default 层已移除/);
      expect(() => setAgentModel('default', 'openfeel-executor', 'deepseek/any', { projectPath: proj }))
        .toThrow(/--scope global.*--scope project/);
      // 零写盘：不创建项目 opencode.jsonc
      expect(existsSync(join(proj, 'opencode.jsonc'))).toBe(false);
    });

    it('get --scope default 恒 null（未显式设置；不再读模板 frontmatter / 框架注入段）', () => {
      writeAuthJson(['deepseek']);
      const proj = mkdtempSync(join(tmpdir(), 'model-config-proj-'));
      projectDirs.push(proj);
      writeFileSync(join(proj, 'opencode.jsonc'), JSON.stringify({
        agent: { 'openfeel-executor': { model: 'deepseek/proj-v' } },
      }, null, 2) + '\n', 'utf-8');
      const r = getAgentModel('executor', 'default', { projectPath: proj });
      expect(r.byScope.default).toBeNull();
      expect(r.effective).toBeUndefined();
      expect(r.inconsistent).toBe(false);
    });

    it('byScope 保留 default 键（JSON 契约稳定）且 inconsistent 恒 false', () => {
      writeAuthJson(['deepseek']);
      const proj = mkdtempSync(join(tmpdir(), 'model-config-proj-'));
      projectDirs.push(proj);
      const r = getAgentModel('openfeel-vision', undefined, { projectPath: proj });
      expect(Object.keys(r.byScope)).toEqual(['project', 'global', 'default']);
      expect(r.byScope.default).toBeNull();
      expect(r.inconsistent).toBe(false);
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
    it('无 scope 时 effective 按 project > global 取首个非空（v1.6.3 两层链）', () => {
      writeAuthJson(['deepseek', 'zhipuai', 'alibaba-cn']);
      const proj = mkdtempSync(join(tmpdir(), 'model-config-proj-'));
      projectDirs.push(proj);
      // 两 scope 都空 → 平台默认（undefined）
      expect(getAgentModel('executor', undefined, { projectPath: proj }).effective).toBeUndefined();
      // 仅 global → global 生效
      setAgentModel('global', 'executor', 'deepseek/global-v', {});
      expect(getAgentModel('executor', undefined, { projectPath: proj }).effective).toBe('deepseek/global-v');
      // project 显式 → project 优先
      setAgentModel('project', 'executor', 'deepseek/proj-v', { projectPath: proj });
      const r = getAgentModel('executor', undefined, { projectPath: proj });
      expect(r.effective).toBe('deepseek/proj-v');
      expect(r.byScope.project).toBe('deepseek/proj-v');
      expect(r.byScope.global).toBe('deepseek/global-v');
      expect(r.byScope.default).toBeNull();
    });

    it('listAgentModels 返回 10 条，每条 byScope 完整（REV-1507 + v1.6.3 三键保留）', () => {
      writeAuthJson(['deepseek', 'zhipuai', 'alibaba-cn']);
      const proj = mkdtempSync(join(tmpdir(), 'model-config-proj-'));
      projectDirs.push(proj);
      const list = listAgentModels(undefined, { projectPath: proj });
      expect(list).toHaveLength(10);
      for (const item of list) {
        expect(item.byScope).toHaveProperty('project');
        expect(item.byScope).toHaveProperty('global');
        expect(item.byScope).toHaveProperty('default');
        expect(item.byScope.default).toBeNull();
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
    it('重复 set global 同一值不漂移（jsonc 结构不变）', () => {
      writeAuthJson(['deepseek']);
      setAgentModel('global', 'executor', 'deepseek/x', {});
      const p = join(mockHome.dir, '.config', 'opencode', 'opencode.jsonc');
      const first = readFileSync(p, 'utf-8');
      setAgentModel('global', 'executor', 'deepseek/x', {});
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
