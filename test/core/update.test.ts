/**
 * update 单元测试
 * 测试 updateProject 在临时目录中的完整行为
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { updateProject } from '../../src/core/update.js';
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
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

  it('应创建 7 个 Agent 定义文件', () => {
    updateProject(tmpDir);
    const agentsDir = join(tmpDir, '.opencode', 'agents');

    expect(existsSync(join(agentsDir, 'feel.md'))).toBe(true);
    expect(existsSync(join(agentsDir, 'planner.md'))).toBe(true);
    expect(existsSync(join(agentsDir, 'schemer.md'))).toBe(true);
    expect(existsSync(join(agentsDir, 'executor.md'))).toBe(true);
    expect(existsSync(join(agentsDir, 'reviewer.md'))).toBe(true);
    expect(existsSync(join(agentsDir, 'feel-tester.md'))).toBe(true);
    expect(existsSync(join(agentsDir, 'archiver.md'))).toBe(true);
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
      'opfx-flow',
      'opfx-plan',
      'opfx-scheme',
      'opfx-code',
      'opfx-view',
      'opfx-test',
      'opfx-archive',
      'opfx-kb',
    ];

    for (const skillName of expectedSkills) {
      const skillFile = join(skillsDir, skillName, 'SKILL.md');
      expect(existsSync(skillFile)).toBe(true);
    }
  });

  it('SKILL.md 应包含正确的 YAML frontmatter', () => {
    updateProject(tmpDir);
    const skillContent = readFileSync(
      join(tmpDir, '.opencode', 'skills', 'opfx-flow', 'SKILL.md'),
      'utf-8',
    );

    expect(skillContent).toContain('name: opfx-flow');
    expect(skillContent).toContain('description: 查询和推进');
  });

  it('应创建 opencode.jsonc 并设置 default_agent 为 feel（无前置文件时）', () => {
    updateProject(tmpDir);
    const jsoncPath = join(tmpDir, 'opencode.jsonc');

    expect(existsSync(jsoncPath)).toBe(true);

    const content = readFileSync(jsoncPath, 'utf-8');
    expect(content).toContain('"default_agent": "feel"');
    expect(content).toContain('"opfx-flow"');
    expect(content).toContain('"opfx-kb"');
  });

  it('应更新已有的 opencode.jsonc：修改 default_agent 和添加 skills', () => {
    // 先创建一个已有的 opencode.jsonc
    const existing = `{
  "$schema": "https://opencode.ai/config.json",
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
    expect(content).toContain('"opfx-flow": ".opencode/skills/opfx-flow"');
  });

  it('保留已有 opencode.jsonc 中的 experimental 字段', () => {
    const existing = `{
  "$schema": "https://opencode.ai/config.json",
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
    // 应有 7+8+1 = 16 个文件被跳过（agents + skills + opencode.jsonc）
    expect(result2.skipped.length).toBe(16);
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
    expect(result.created).toContain('.opencode/skills/opfx-flow/SKILL.md');
    expect(result.created).toContain('.opencode/skills/opfx-kb/SKILL.md');

    // opencode.jsonc
    expect(result.created).toContain('opencode.jsonc');
  });

  it('更新已有的 opencode.jsonc 时 skills 正确归入 updated 列表', () => {
    // 先创建已有 opencode.jsonc（不包含新 skills）
    const existing = `{
  "$schema": "https://opencode.ai/config.json",
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

  it('子命令正确注册（程序包含 update 命令）', async () => {
    // 动态导入 CLI 程序，验证 update 命令已注册
    const { program } = await import('../../src/cli/index.js');
    const commands = program.commands.map((cmd: { name: () => string }) => cmd.name());
    expect(commands).toContain('update');
  });
});
