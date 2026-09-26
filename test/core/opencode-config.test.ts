/**
 * opencode-config 单元测试
 * 验证框架/项目配置对象、JSONC 解析、深度合并与全局合并序列化。
 */
import { describe, it, expect, vi } from 'vitest';
import { join } from 'node:path';

// mock homedir：隔离 global-paths 的 homedir 依赖（回调内不可引用外层 import）
const mockHome = vi.hoisted(() => ({ dir: '/mock/home' }));
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => mockHome.dir };
});

import {
  buildGlobalOpencodeFrameworkObj,
  buildProjectOpencodeJsoncObj,
  parseJsonc,
  deepMergeJsonc,
  mergeGlobalOpencodeJsonc,
} from '../../src/core/opencode-config.js';
import { getGlobalCoreMdPath } from '../../src/core/global-paths.js';

describe('buildGlobalOpencodeFrameworkObj', () => {
  const obj = buildGlobalOpencodeFrameworkObj();

  it('应包含正确的 $schema 与 default_agent', () => {
    expect(obj.$schema).toBe('https://opencode.ai/config.json');
    expect(obj.default_agent).toBe('feel');
  });

  it('不应包含 instructions（全局 AGENTS.md 由约定自动加载，op-000 实测 YES）', () => {
    expect('instructions' in obj).toBe(false);
  });

  it('应包含 vision/reviewer 两个模型默认键', () => {
    expect(obj.agent).toEqual({
      'openfeel-vision': { model: 'deepseek/deepseek-flash' },
      'openfeel-reviewer': { model: 'zhipuai/glm-5.3-flash' },
    });
  });

  it('不应包含 skills 与 experimental.agent_manager_tool', () => {
    expect('skills' in obj).toBe(false);
    expect('experimental' in obj).toBe(false);
  });
});

describe('buildProjectOpencodeJsoncObj', () => {
  it('仅含 $schema，不含 instructions/skills/default_agent', () => {
    expect(buildProjectOpencodeJsoncObj()).toEqual({
      $schema: 'https://opencode.ai/config.json',
    });
  });
});

describe('parseJsonc', () => {
  it('应去除行注释但保留字符串内 //', () => {
    const text = '{\n  // comment\n  "a": "https://x.ai/config.json"\n}\n';
    expect(parseJsonc(text)).toEqual({ a: 'https://x.ai/config.json' });
  });

  it('应容忍 CRLF', () => {
    const text = '{\r\n  "a": 1 // c\r\n}\r\n';
    expect(parseJsonc(text)).toEqual({ a: 1 });
  });
});

describe('deepMergeJsonc 字段规则', () => {
  it('instructions 拼接 + 去重（框架在前）', () => {
    const base = { instructions: ['/user/local.md'] };
    const overlay = { instructions: ['/framework/core.md'] };
    expect(deepMergeJsonc(base, overlay).instructions).toEqual([
      '/framework/core.md',
      '/user/local.md',
    ]);
  });

  it('instructions 同名去重为 1 项', () => {
    const base = { instructions: ['/shared.md'] };
    const overlay = { instructions: ['/shared.md'] };
    expect(deepMergeJsonc(base, overlay).instructions).toEqual(['/shared.md']);
  });

  it('agent 为 agent 级：用户定义的 agent 不被覆盖，缺失 agent 补默认', () => {
    const base = { agent: { 'openfeel-vision': { model: 'user/custom' } } };
    const overlay = {
      agent: {
        'openfeel-vision': { model: 'deepseek/deepseek-flash' },
        'openfeel-reviewer': { model: 'zhipuai/glm-5.3-flash' },
      },
    };
    const merged = deepMergeJsonc(base, overlay) as { agent: Record<string, unknown> };
    // 用户已定义 vision → 完整自定义，框架不补 model
    expect(merged.agent['openfeel-vision']).toEqual({ model: 'user/custom' });
    // 用户未定义 reviewer → 补入框架默认
    expect(merged.agent['openfeel-reviewer']).toEqual({ model: 'zhipuai/glm-5.3-flash' });
  });

  it('skills：框架不写，用户已有保留', () => {
    const base = { skills: { foo: '/user/skills/foo' } };
    const merged = deepMergeJsonc(base, { $schema: 'x' }) as { skills: unknown };
    expect(merged.skills).toEqual({ foo: '/user/skills/foo' });
  });

  it('未知字段 passthrough 保留', () => {
    const base = { permission: 'allow', custom: { a: 1 } };
    const merged = deepMergeJsonc(base, { $schema: 'x' }) as Record<string, unknown>;
    expect(merged.permission).toBe('allow');
    expect(merged.custom).toEqual({ a: 1 });
  });

  it('递归合并嵌套对象且框架覆盖同名字段', () => {
    const base = { nested: { a: 1, keep: true } };
    const overlay = { nested: { a: 2 } };
    expect(deepMergeJsonc(base, overlay).nested).toEqual({ a: 2, keep: true });
  });
});

describe('mergeGlobalOpencodeJsonc', () => {
  it('保留用户字段、补全框架字段、去除注释、末尾换行、幂等', () => {
    const raw = `{
  // 用户注释
  "$schema": "https://opencode.ai/config.json",
  "permission": "allow",
  "agent": { "custom": { "model": "x/y" } },
  "experimental": { "foo": true }
}
`;
    const out1 = mergeGlobalOpencodeJsonc(raw);
    expect(out1.endsWith('\n')).toBe(true);
    expect(out1).not.toContain('// 用户注释');
    const parsed = JSON.parse(out1) as Record<string, unknown>;
    expect(parsed.permission).toBe('allow');
    expect((parsed.agent as Record<string, unknown>).custom).toEqual({ model: 'x/y' });
    expect((parsed.experimental as Record<string, unknown>).foo).toBe(true);
    expect(parsed.default_agent).toBe('feel');
    expect('instructions' in parsed).toBe(false);
    expect('skills' in parsed).toBe(false);
    // 幂等：二次合并输出一致
    expect(mergeGlobalOpencodeJsonc(out1)).toBe(out1);
  });

  it('清理已废弃的全局 core.md instructions 引用，保留用户其他 instructions（v1.1.1）', () => {
    const stale = getGlobalCoreMdPath();
    const raw = JSON.stringify({ instructions: [stale, 'custom.md'] });
    const parsed = JSON.parse(mergeGlobalOpencodeJsonc(raw)) as Record<string, unknown>;
    expect(parsed.instructions).toEqual(['custom.md']);
  });

  it('仅含废弃 core.md 引用时删除 instructions 键', () => {
    const raw = JSON.stringify({ instructions: [getGlobalCoreMdPath()] });
    const parsed = JSON.parse(mergeGlobalOpencodeJsonc(raw)) as Record<string, unknown>;
    expect('instructions' in parsed).toBe(false);
  });

  it('空对象输入可生成框架级配置', () => {
    const parsed = JSON.parse(mergeGlobalOpencodeJsonc('{}\n')) as Record<string, unknown>;
    expect(parsed.$schema).toBe('https://opencode.ai/config.json');
    expect(parsed.default_agent).toBe('feel');
  });
});
