/**
 * update 单元测试
 * 测试 updateProject 在临时目录中的完整行为
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { updateProject, AgentsMdLangConflictError } from '../../src/core/update.js';
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('updateProject', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-update-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('应创建 9 个 Agent 定义文件', () => {
    updateProject(tmpDir);
    const agentsDir = join(tmpDir, '.opencode', 'agents');

    expect(existsSync(join(agentsDir, 'feel.md'))).toBe(true);
    expect(existsSync(join(agentsDir, 'planner.md'))).toBe(true);
    expect(existsSync(join(agentsDir, 'schemer.md'))).toBe(true);
    expect(existsSync(join(agentsDir, 'executor.md'))).toBe(true);
    expect(existsSync(join(agentsDir, 'reviewer.md'))).toBe(true);
    expect(existsSync(join(agentsDir, 'feel-tester.md'))).toBe(true);
    expect(existsSync(join(agentsDir, 'archiver.md'))).toBe(true);
    expect(existsSync(join(agentsDir, 'utility.md'))).toBe(true);
    expect(existsSync(join(agentsDir, 'vision.md'))).toBe(true);
  });

  it('feel.md 应包含 mode: primary 和正确的 YAML frontmatter', () => {
    updateProject(tmpDir);
    const feelContent = readFileSync(
      join(tmpDir, '.opencode', 'agents', 'feel.md'),
      'utf-8',
    );

    // 验证 YAML frontmatter 存在
    expect(feelContent).toContain('---');
    expect(feelContent).toContain('mode: primary');
    expect(feelContent).toContain('color: "#8B5CF6"');
    expect(feelContent).toContain('你是 Feel');
  });

  it('应创建 8 个 Skill 定义文件', () => {
    updateProject(tmpDir);
    const skillsDir = join(tmpDir, '.opencode', 'skills');

    const expectedSkills = [
      'bug-acceptance',
      'check-kb',
      'get-bugs',
      'get-stage-status',
      'model-check',
      'search-kb',
      'sync-status',
      'update-stage-status',
    ];

    for (const skillName of expectedSkills) {
      const skillFile = join(skillsDir, skillName, 'SKILL.md');
      expect(existsSync(skillFile)).toBe(true);
    }
  });

  it('SKILL.md 应包含正确的 YAML frontmatter', () => {
    updateProject(tmpDir);
    const skillContent = readFileSync(
      join(tmpDir, '.opencode', 'skills', 'bug-acceptance', 'SKILL.md'),
      'utf-8',
    );

    expect(skillContent).toContain('name: bug-acceptance');
    expect(skillContent).toContain('description: 标准化 Bug 验收流程');
  });

  it('应创建 opencode.jsonc 并设置 default_agent 为 feel（无前置文件时）', () => {
    updateProject(tmpDir);
    const jsoncPath = join(tmpDir, 'opencode.jsonc');

    expect(existsSync(jsoncPath)).toBe(true);

    const content = readFileSync(jsoncPath, 'utf-8');
    expect(content).toContain('"default_agent": "feel"');
    expect(content).toContain('"bug-acceptance"');
    expect(content).toContain('"check-kb"');
  });

  it('应更新已有的 opencode.jsonc：修改 default_agent 和添加 skills', () => {
    // 先创建一个已有的 opencode.jsonc
    const existing = `{
  "$schema": "https://opencode.openfeel/config.json",
  "default_agent": "code",
  "instructions": [
    "AGENTS.md",
    ".opencode/instructions/core.md"
  ],
  "skills": {
    "get-bugs": ".opencode/skills/get-bugs"
  }
}
`;
    writeFileSync(join(tmpDir, 'opencode.jsonc'), existing, 'utf-8');

    updateProject(tmpDir);

    const content = readFileSync(join(tmpDir, 'opencode.jsonc'), 'utf-8');
    expect(content).toContain('"default_agent": "feel"');
    expect(content).toContain('"get-bugs": ".opencode/skills/get-bugs"');
    expect(content).toContain('"bug-acceptance": ".opencode/skills/bug-acceptance"');
  });

  it('保留已有 opencode.jsonc 中的 experimental 字段', () => {
    const existing = `{
  "$schema": "https://opencode.openfeel/config.json",
  "default_agent": "code",
  "instructions": [
    "AGENTS.md"
  ],
  "skills": {},
  "experimental": {
    "agent_manager_tool": true
  }
}
`;
    writeFileSync(join(tmpDir, 'opencode.jsonc'), existing, 'utf-8');

    updateProject(tmpDir);

    const content = readFileSync(join(tmpDir, 'opencode.jsonc'), 'utf-8');
    expect(content).toContain('"experimental"');
    expect(content).toContain('"agent_manager_tool": true');
    expect(content).toContain('"default_agent": "feel"');
  });

  it('重复调用不重复创建，第二次全部 skipped', () => {
    const result1 = updateProject(tmpDir);
    // 第一次调用应有创建
    expect(result1.created.length).toBeGreaterThan(0);
    expect(result1.updated.length).toBe(0);

    const result2 = updateProject(tmpDir);
    // 第二次调用 — 所有内容一致，应全部 skipped
    expect(result2.created.length).toBe(0);
    expect(result2.updated.length).toBe(0);
    // 应有 9+8+1+1+1 = 20 个文件被跳过（agents + skills + opencode.jsonc + instructions/core.md + AGENTS.md）
    expect(result2.skipped.length).toBe(20);
  });

  it('修改已有 agent 内容后应正确更新', () => {
    // 第一次创建
    updateProject(tmpDir);

    // 手动修改 planner.md 的内容
    const plannerPath = join(tmpDir, '.opencode', 'agents', 'planner.md');
    writeFileSync(plannerPath, 'modified content', 'utf-8');

    // 第二次调用 — planner.md 应被更新回原始内容
    const result2 = updateProject(tmpDir);
    expect(result2.updated).toContain('.opencode/agents/planner.md');

    // 验证内容已恢复为原始定义
    const restored = readFileSync(plannerPath, 'utf-8');
    expect(restored).toContain('你是 Planner（计划官）');
  });

  it('返回的 created 列表应包含正确的文件路径', () => {
    const result = updateProject(tmpDir);

    // Agent 文件
    expect(result.created).toContain('.opencode/agents/feel.md');
    expect(result.created).toContain('.opencode/agents/planner.md');
    expect(result.created).toContain('.opencode/agents/feel-tester.md');

    // Skill 文件
    expect(result.created).toContain('.opencode/skills/bug-acceptance/SKILL.md');
    expect(result.created).toContain('.opencode/skills/check-kb/SKILL.md');

    // opencode.jsonc
    expect(result.created).toContain('opencode.jsonc');
  });

  it('更新已有的 opencode.jsonc 时 skills 正确归入 updated 列表', () => {
    // 先创建已有 opencode.jsonc（不包含新 skills）
    const existing = `{
  "$schema": "https://opencode.openfeel/config.json",
  "default_agent": "code",
  "instructions": ["AGENTS.md"],
  "skills": {}
}
`;
    writeFileSync(join(tmpDir, 'opencode.jsonc'), existing, 'utf-8');

    const result = updateProject(tmpDir);

    // opencode.jsonc 应被更新（因为 default_agent 从 code 改为 feel）
    expect(result.updated).toContain('opencode.jsonc');
  });

  // ── AGENTS.md 语言同步逻辑测试 ──

  it('首次部署 + --lang=en 应创建英文版 AGENTS.md', () => {
    updateProject(tmpDir, ['opencode'], 'en', { lang: 'en' });
    const agentsMdPath = join(tmpDir, 'AGENTS.md');
    expect(existsSync(agentsMdPath)).toBe(true);
    const content = readFileSync(agentsMdPath, 'utf-8');
    expect(content).toContain('This document is the core constraint layer');
    expect(content).not.toContain('核心约束层');
  });

  it('已有 agents 目录但 AGENTS.md 被删 + --lang 应重新创建 (REV-002)', () => {
    // 模拟已有 agents 目录（有内容）
    const agentsDir = join(tmpDir, '.opencode', 'agents');
    mkdirSync(agentsDir, { recursive: true });
    writeFileSync(join(agentsDir, 'feel.md'), 'dummy', 'utf-8');

    // AGENTS.md 不存在（手动删除）

    const result = updateProject(tmpDir, ['opencode'], 'en', { lang: 'en' });
    const agentsMdPath = join(tmpDir, 'AGENTS.md');
    expect(existsSync(agentsMdPath)).toBe(true);
    expect(result.created).toContain('AGENTS.md');
    const content = readFileSync(agentsMdPath, 'utf-8');
    expect(content).toContain('This document is the core constraint layer');
  });

  it('语言冲突交互模式跳过 AGENTS.md 但继续更新其他文件 (REV-004)', () => {
    // 模拟已有 .info.json（项目语言为 zh-CN）
    const infoDir = join(tmpDir, '.openfeel');
    mkdirSync(infoDir, { recursive: true });
    writeFileSync(join(infoDir, '.info.json'), JSON.stringify({ user: 'test', lang: 'zh-CN' }), 'utf-8');

    // 模拟已有 AGENTS.md（中文版）
    const agentsMdContent = '# 测试项目\n\n> 本文档为 测试项目 核心约束层';
    writeFileSync(join(tmpDir, 'AGENTS.md'), agentsMdContent, 'utf-8');

    // 交互模式 + --lang=en，语言冲突 → 不应 throw，应跳过 AGENTS.md
    const result = updateProject(tmpDir, ['opencode'], 'zh-CN', {
      lang: 'en',
      interactive: true,
    });

    // AGENTS.md 内容不变（跳过）
    expect(readFileSync(join(tmpDir, 'AGENTS.md'), 'utf-8')).toBe(agentsMdContent);
    expect(result.skipped).toContain('AGENTS.md (language conflict)');

    // 其他文件正常创建（不因语言冲突中断）
    expect(existsSync(join(tmpDir, '.opencode', 'agents', 'feel.md'))).toBe(true);
    expect(existsSync(join(tmpDir, '.opencode', 'skills', 'check-kb', 'SKILL.md'))).toBe(true);
    expect(result.created.length).toBeGreaterThan(5);
  });

  it('AgentsMdLangConflictError 应包含正确的语言信息', () => {
    const err = new AgentsMdLangConflictError('zh-CN', 'en');
    expect(err.name).toBe('AgentsMdLangConflictError');
    expect(err.projectLang).toBe('zh-CN');
    expect(err.requestedLang).toBe('en');
    expect(err.message).toContain('zh-CN');
    expect(err.message).toContain('en');
  });

  it('子命令正确注册（程序包含 update 命令）', async () => {
    // 动态导入 CLI 程序，验证 update 命令已注册
    const { program } = await import('../../src/cli/index.js');
    const commands = program.commands.map((cmd: { name: () => string }) => cmd.name());
    expect(commands).toContain('update');
  });
});
