/**
 * template-loader 单元测试
 * 验证中英文模板加载函数的正确性和回退逻辑
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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

  it('listOpencodeSkillNames 返回 16 项全部带 openfeel- 前缀', () => {
    const names = listOpencodeSkillNames();
    expect(names).toHaveLength(16);
    expect(names.every((n) => n.startsWith('openfeel-'))).toBe(true);
    expect(names).toContain('openfeel-workspace');
    expect(names).toContain('openfeel-tool-usage');
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

  it('zh-CN agents-md 含工作区结构约束（core.md 内容已并入）', () => {
    const result = loadTemplate('zh-CN', 'agents-md');
    expect(result).toBeTruthy();
    expect(result).toContain('.openfeel');
    expect(result).toContain('项目特有约束（可选化）');
    expect(result).toMatch(/[\u4e00-\u9fff]/);
    expect(result).not.toContain('{项目名称}');
  });

  it('en agents-md 含对应工作区结构约束', () => {
    const result = loadTemplate('en', 'agents-md');
    expect(result).toBeTruthy();
    expect(result).toContain('Public Domain');
    expect(result).toContain('Project-Specific Constraints');
    expect(result).toMatch(/[a-zA-Z]/);
    expect(result).not.toContain('{项目名称}');
  });

  it('fr agents-md 回退到 zh-CN', () => {
    const result = loadTemplate('fr', 'agents-md');
    expect(result).toBeTruthy();
    expect(result).toContain('.openfeel');
  });
});

/**
 * op-003 模板静态断言（REV-907：仅静态断言，不做行为级 E2E）
 * 读取模板源文件（src/core/templates-data/...），断言会话启动修复规则已落地。
 */
describe('update_infos 会话启动修复规则（模板静态断言）', () => {
  const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf-8');

  it('feel.md（zh-CN）含 update_infos 检查修复节 + edit 工具勾选措辞 + 重启提醒', () => {
    const content = read('../../src/core/templates-data/opencode/agents/zh-CN/feel.md');
    expect(content).toContain('update_infos');
    expect(content).toContain('`- [ ]`');
    expect(content).toContain('`- [x]`');
    expect(content).toContain('edit 工具');
    expect(content).toContain('重启会话');
    // REV-1003：Feel 不能 import TS 模块，不得出现 resolveUpdateInfo/clearUpdateInfos 调用
    expect(content).not.toContain('resolveUpdateInfo');
    expect(content).not.toContain('clearUpdateInfos');
  });

  it('feel.md（en）含对应节 + edit 工具勾选措辞 + 重启提醒', () => {
    const content = read('../../src/core/templates-data/opencode/agents/en/feel.md');
    expect(content).toContain('update_infos');
    expect(content).toContain('`- [ ]`');
    expect(content).toContain('`- [x]`');
    expect(content).toContain('edit tool');
    expect(content).toContain('restart');
    expect(content).not.toContain('resolveUpdateInfo');
    expect(content).not.toContain('clearUpdateInfos');
  });

  it('openfeel-workspace skill 含提示性约束且不自行修改（REV-902）', () => {
    const content = read('../../src/core/templates-data/opencode/skills/openfeel-workspace/SKILL.md');
    expect(content).toContain('update_infos.md');
    expect(content).toContain('不自行修改');
    expect(content).not.toContain('resolveUpdateInfo');
    expect(content).not.toContain('clearUpdateInfos');
  });

  it('agents-md（en）为全局约束层且不含 update info 内部函数调用', () => {
    const content = read('../../src/core/templates-data/agents-md/en.md');
    expect(content).toContain('Global Behavioral Constraints');
    expect(content).not.toContain('resolveUpdateInfo');
    expect(content).not.toContain('clearUpdateInfos');
  });
});
