/**
 * claude-settings 单元测试（stage-73 T6.1~T6.4，纯函数层）
 * 验证框架注入片段、严格 JSON 深合并（用户键逐字保留 + 框架自有键覆盖）、
 * 稳定序列化幂等与解析失败类型；不写盘（写盘路径由 op-002 集成测覆盖）。
 * mock homedir 隔离，不污染真实主目录。
 */
import { describe, it, expect, vi } from 'vitest';

// mock homedir（与 test/core/opencode-config.test.ts 同法；回调内不可引用外层 import）
const mockHome = vi.hoisted(() => ({ dir: '/mock/home' }));
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => mockHome.dir };
});

import {
  buildClaudeSettingsFragment,
  mergeClaudeSettings,
  ClaudeSettingsParseError,
} from '../../src/core/claude-settings.js';

const EMPTY_MERGED = '{\n  "agent": "feel",\n  "permissions": {\n    "defaultMode": "auto"\n  }\n}\n';

describe('claude-settings（stage-73 纯函数层）', () => {
  it('T6.1：buildClaudeSettingsFragment 返回框架注入片段', () => {
    expect(buildClaudeSettingsFragment()).toEqual({
      agent: 'feel',
      permissions: { defaultMode: 'auto' },
    });
  });

  it('T6.1：空输入 / 空对象 → 逐字等于注入片段（含末尾换行）', () => {
    expect(mergeClaudeSettings('')).toBe(EMPTY_MERGED);
    expect(mergeClaudeSettings('{}\n')).toBe(EMPTY_MERGED);
    expect(mergeClaudeSettings('   \n')).toBe(EMPTY_MERGED);
  });

  it('T6.2：用户键逐字保留 + 注入键到位（D-SET / D-SET2）', () => {
    const input = JSON.stringify({
      env: { ANTHROPIC_BASE_URL: 'http://127.0.0.1:15721' },
      model: 'ccs-claude-deepseek--deepseek-flash[1M]',
      theme: 'dark',
      apiKeyHelper: 'echo x',
      agent: 'other',
      permissions: { allow: ['Bash'], deny: ['WebFetch'] },
    });
    const out = mergeClaudeSettings(input);
    const obj = JSON.parse(out);

    // 用户键逐字保留
    expect(obj.env).toEqual({ ANTHROPIC_BASE_URL: 'http://127.0.0.1:15721' });
    expect(obj.model).toBe('ccs-claude-deepseek--deepseek-flash[1M]');
    expect(obj.theme).toBe('dark');
    expect(obj.apiKeyHelper).toBe('echo x');
    expect(obj.permissions.allow).toEqual(['Bash']);
    expect(obj.permissions.deny).toEqual(['WebFetch']);
    // 框架自有键覆盖
    expect(obj.agent).toBe('feel');
    expect(obj.permissions.defaultMode).toBe('auto');
    // 保序：用户键插入序在输出中保持
    expect(out.indexOf('"env"')).toBeLessThan(out.indexOf('"agent"'));
  });

  it('T6.3：二次合并字节幂等 + 末尾换行 + 2 空格缩进（D-SET3）', () => {
    const inputs = [
      '',
      JSON.stringify({
        env: { A: '1' },
        agent: 'other',
        permissions: { allow: ['Bash'] },
      }),
    ];
    for (const x of inputs) {
      const once = mergeClaudeSettings(x);
      expect(mergeClaudeSettings(once)).toBe(once);
      expect(once.endsWith('\n')).toBe(true);
      expect(once.includes('\n  "agent"')).toBe(true);
    }
  });

  it('T6.4：含行注释 → 抛 ClaudeSettingsParseError', () => {
    expect(() => mergeClaudeSettings('{\n  // c\n  "a": 1\n}')).toThrow(ClaudeSettingsParseError);
  });

  it('T6.4：trailing comma → 抛 ClaudeSettingsParseError', () => {
    expect(() => mergeClaudeSettings('{"a": 1,}')).toThrow(ClaudeSettingsParseError);
  });

  it('T6.4：顶层非对象（数组 / null / 数字）→ 抛 ClaudeSettingsParseError', () => {
    for (const bad of ['[1]', 'null', '42', '"str"']) {
      expect(() => mergeClaudeSettings(bad)).toThrow(ClaudeSettingsParseError);
    }
  });

  it('T6.4：截断 JSON → 抛 ClaudeSettingsParseError 且 instanceof Error', () => {
    expect(() => mergeClaudeSettings('{')).toThrow(ClaudeSettingsParseError);
    expect(() => mergeClaudeSettings('{')).toThrow(Error);
  });
});
