/**
 * template-loader 单元测试
 * 验证中英文模板加载函数的正确性和回退逻辑
 */
import { describe, it, expect } from 'vitest';
import {
  loadAgentTemplate,
  listAgentIds,
  listOpencodeAgentIds,
  listOpencodeSkillNames,
  loadTemplate,
} from '../../src/core/template-loader.js';

describe('loadAgentTemplate', () => {
  it('zh-CN feel 返回非空字符串，含中文内容', () => {
    const result = loadAgentTemplate('zh-CN', 'feel');
    expect(result).toBeTruthy();
    expect(result).toContain('总统领');
  });

  it('en feel 返回非空字符串，含英文内容，含 Orchestrator', () => {
    const result = loadAgentTemplate('en', 'feel');
    expect(result).toBeTruthy();
    expect(result).toContain('Orchestrator');
  });

  it('zh-CN openfeel-archiver 返回中文 openfeel-archiver 模板', () => {
    const result = loadAgentTemplate('zh-CN', 'openfeel-archiver');
    expect(result).toBeTruthy();
    expect(result).toContain('归档官');
    expect(result).toContain('openfeel-archiver');
  });

  it('en openfeel-archiver 返回英文 openfeel-archiver 模板', () => {
    const result = loadAgentTemplate('en', 'openfeel-archiver');
    expect(result).toBeTruthy();
    expect(result).toContain('openfeel-archiver');
    expect(result).toContain('finalizer');
  });

  it('fr feel 回退到 zh-CN，返回中文内容', () => {
    const result = loadAgentTemplate('fr', 'feel');
    expect(result).toBeTruthy();
    expect(result).toContain('总统领');
  });

  it('en nonexistent 抛出 Error，信息含 actual lang=en', () => {
    expect(() => loadAgentTemplate('en', 'nonexistent')).toThrowError(
      /actual lang=en/
    );
  });
});

describe('listAgentIds', () => {
  it('zh-CN 返回 9 个 Agent ID 数组', () => {
    const ids = listAgentIds('zh-CN');
    expect(ids).toHaveLength(9);
    expect(ids).toContain('feel');
    expect(ids).toContain('openfeel-executor');
    expect(ids).toContain('openfeel-planner');
    expect(ids).toContain('openfeel-schemer');
    expect(ids).toContain('openfeel-reviewer');
    expect(ids).toContain('openfeel-feel-tester');
    expect(ids).toContain('openfeel-archiver');
    expect(ids).toContain('openfeel-utility');
    expect(ids).toContain('openfeel-vision');
  });

  it('en 返回 9 个 Agent ID 数组（与 zh-CN 相同）', () => {
    const zhIds = listAgentIds('zh-CN');
    const enIds = listAgentIds('en');
    expect(enIds).toHaveLength(9);
    expect(enIds).toEqual(zhIds);
  });

  it('fr 回退到 zh-CN，仍返回 9 个 ID', () => {
    const ids = listAgentIds('fr');
    expect(ids).toHaveLength(9);
  });
});

describe('命名前缀完整性', () => {
  it('listAgentIds 返回 9 项：feel 不带前缀、其余 8 项带 openfeel-', () => {
    const ids = listAgentIds('zh-CN');
    expect(ids).toHaveLength(9);
    expect(ids).toContain('feel');
    expect(ids.filter((id) => id.startsWith('openfeel-'))).toHaveLength(8);
    expect(ids.every((id) => id === 'feel' || id.startsWith('openfeel-'))).toBe(true);
  });

  it('listOpencodeAgentIds 双语均返回 9 项且 8 项带前缀', () => {
    for (const lang of ['zh-CN', 'en']) {
      const ids = listOpencodeAgentIds(lang);
      expect(ids).toHaveLength(9);
      expect(ids).toContain('feel');
      expect(ids.filter((id) => id.startsWith('openfeel-'))).toHaveLength(8);
    }
  });

  it('listOpencodeSkillNames 返回 14 项全部带 openfeel- 前缀', () => {
    const names = listOpencodeSkillNames();
    expect(names).toHaveLength(14);
    expect(names.every((n) => n.startsWith('openfeel-'))).toBe(true);
  });
});

describe('loadTemplate', () => {
  it('zh-CN agents-md 返回 UTF-8 明文中文模板', () => {
    const result = loadTemplate('zh-CN', 'agents-md');
    expect(result).toBeTruthy();
    expect(result).toContain('你应当以中文思维思考问题');
  });

  it('en agents-md 返回 UTF-8 明文英文模板', () => {
    const result = loadTemplate('en', 'agents-md');
    expect(result).toBeTruthy();
    expect(result).toContain('You should think in English');
  });

  it('zh-CN core-instructions 返回 UTF-8 明文（非 Base64）', () => {
    const result = loadTemplate('zh-CN', 'core-instructions');
    expect(result).toBeTruthy();
    // 验证是明文而非 Base64（Base64 字符串只含 [A-Za-z0-9+/=]）
    expect(result).toContain('.openfeel');
    // 验证不是 Base64（包含中文等非 Base64 字符）
    expect(result).toMatch(/[\u4e00-\u9fff]/);
  });

  it('en core-instructions 返回 UTF-8 明文英文模板', () => {
    const result = loadTemplate('en', 'core-instructions');
    expect(result).toBeTruthy();
    expect(result).toContain('Public Domain');
    expect(result).toMatch(/[a-zA-Z]/);
  });

  it('fr core-instructions 回退到 zh-CN', () => {
    const result = loadTemplate('fr', 'core-instructions');
    expect(result).toBeTruthy();
    expect(result).toContain('.openfeel');
  });
});
