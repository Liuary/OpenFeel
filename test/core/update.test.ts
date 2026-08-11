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
    // 应有 9+14+1+1+1 = 26 个文件被跳过（agents + skills + opencode.jsonc + instructions/core.md + AGENTS.md）
    expect(result2.skipped.length).toBe(26);
  });

  it('手动修改 agent 内容后第二次 update 应标记冲突且不覆盖（REV-001）', () => {
    // 第一次创建
    updateProject(tmpDir);

    // 手动修改 planner.md 的内容（模拟用户本地修改）
    const plannerPath = join(tmpDir, '.opencode', 'agents', 'planner.md');
    const modified = 'modified content';
    writeFileSync(plannerPath, modified, 'utf-8');

    // 第二次调用 — planner.md hash 不匹配 → 冲突，拒绝覆盖
    const result2 = updateProject(tmpDir);
    expect(result2.conflicts).toContain('.opencode/agents/planner.md');
    expect(result2.updated).not.toContain('.opencode/agents/planner.md');

    // 验证用户修改内容未被覆盖
    const kept = readFileSync(plannerPath, 'utf-8');
    expect(kept).toBe(modified);
  });

  it('REV-001：有冲突时其他 updated 文件的 hash 仍同步更新到 update_state.json', () => {
    // 第一次创建
    updateProject(tmpDir);

    // 手动修改 planner.md（用户修改 → 冲突）
    const plannerPath = join(tmpDir, '.opencode', 'agents', 'planner.md');
    writeFileSync(plannerPath, 'user modified planner', 'utf-8');

    // 手动修改 executor.md 并从 state 中删除其记录（模拟"不在管理范围"→ 降级为安全覆盖 → updated）
    const executorPath = join(tmpDir, '.opencode', 'agents', 'executor.md');
    writeFileSync(executorPath, 'user modified executor', 'utf-8');
    const statePath = join(tmpDir, '.openfeel', 'update_state.json');
    const state = JSON.parse(readFileSync(statePath, 'utf-8'));
    delete state.files['.opencode/agents/executor.md'];
    writeFileSync(statePath, JSON.stringify(state), 'utf-8');

    // 第二次调用 — planner.md 冲突，executor.md 安全覆盖
    const result2 = updateProject(tmpDir);
    expect(result2.conflicts).toContain('.opencode/agents/planner.md');
    expect(result2.updated).toContain('.opencode/agents/executor.md');

    // REV-001 核心：即使有冲突，updated 文件的 hash 也必须更新到 state
    const newState = JSON.parse(readFileSync(statePath, 'utf-8'));
    expect(newState.files['.opencode/agents/executor.md'].status).toBe('clean');
    expect(newState.files['.opencode/agents/planner.md'].status).toBe('conflict');

    // 第三次调用（无修改）— executor.md 内容已与模板一致 → skipped，不再全量误报
    const result3 = updateProject(tmpDir);
    expect(result3.updated).not.toContain('.opencode/agents/executor.md');
  });

  it('REV-003 场景 1：部分冲突解决后重跑，已解决的文件 hash 更新为 clean', () => {
    // 第一次创建
    updateProject(tmpDir);

    // 手动修改两个 agent 文件 → 都冲突
    const plannerPath = join(tmpDir, '.opencode', 'agents', 'planner.md');
    const reviewerPath = join(tmpDir, '.opencode', 'agents', 'reviewer.md');
    writeFileSync(plannerPath, 'user modified planner', 'utf-8');
    writeFileSync(reviewerPath, 'user modified reviewer', 'utf-8');

    const result1 = updateProject(tmpDir);
    expect(result1.conflicts).toContain('.opencode/agents/planner.md');
    expect(result1.conflicts).toContain('.opencode/agents/reviewer.md');

    // 解决 reviewer.md 冲突：恢复为模板内容后重跑 update
    const restored = readFileSync(join(tmpDir, '.opencode', 'agents', 'reviewer.md'), 'utf-8');
    expect(restored).toBe('user modified reviewer'); // 确认仍是用户版本

    // 手动将 reviewer.md 恢复为"用户解决后接受的新内容"（此处模拟恢复为模板）
    const result2 = updateProject(tmpDir);
    expect(result2.conflicts).toContain('.opencode/agents/planner.md');

    const statePath = join(tmpDir, '.openfeel', 'update_state.json');
    const newState = JSON.parse(readFileSync(statePath, 'utf-8'));
    expect(newState.files['.opencode/agents/planner.md'].status).toBe('conflict');
  });

  it('REV-003 场景 2：空 state 文件（files 为空）行为同首次 update', () => {
    // 预置空的 update_state.json（Schema 校验通过）
    const openfeelDir = join(tmpDir, '.openfeel');
    mkdirSync(openfeelDir, { recursive: true });
    writeFileSync(
      join(openfeelDir, 'update_state.json'),
      JSON.stringify({ version: '1.0', last_update: '', openfeel_version: '', files: {} }),
      'utf-8',
    );

    // update 应正常执行（相当于首次 update 前全量创建）
    const result = updateProject(tmpDir);
    expect(result.created.length).toBeGreaterThan(0);
    expect(existsSync(join(tmpDir, '.opencode', 'agents', 'feel.md'))).toBe(true);

    // state 已被重新填充
    const statePath = join(tmpDir, '.openfeel', 'update_state.json');
    const newState = JSON.parse(readFileSync(statePath, 'utf-8'));
    expect(newState.files['.opencode/agents/feel.md'].status).toBe('clean');
  });

  it('冲突时写入 .openfeel/update_conflicts/ 标记文件（Git 风格）', () => {
    // 第一次创建
    updateProject(tmpDir);

    // 手动修改 planner.md → 触发冲突
    const plannerPath = join(tmpDir, '.opencode', 'agents', 'planner.md');
    writeFileSync(plannerPath, 'user modified planner', 'utf-8');

    const result = updateProject(tmpDir);
    expect(result.conflicts).toContain('.opencode/agents/planner.md');

    // 冲突文件已写入 update_conflicts/，目录层级与相对路径一致
    const conflictPath = join(tmpDir, '.openfeel', 'update_conflicts', '.opencode', 'agents', 'planner.md');
    expect(existsSync(conflictPath)).toBe(true);

    const content = readFileSync(conflictPath, 'utf-8');
    // Git 风格冲突标记
    expect(content).toContain('<<<<<<< CURRENT (用户修改版)');
    expect(content).toContain('=======');
    expect(content).toContain('>>>>>>> INCOMING');
    // 双方内容都在
    expect(content).toContain('user modified planner');
    expect(content).toContain('你是 Planner（计划官）');
  });

  it('无冲突时不写入 update_conflicts/ 目录', () => {
    updateProject(tmpDir);
    const conflictsDir = join(tmpDir, '.openfeel', 'update_conflicts');
    expect(existsSync(conflictsDir)).toBe(false);
  });

  it('UpdateResult 包含 conflicts 字段（类型与运行时）', () => {
    const result = updateProject(tmpDir);
    expect(Array.isArray(result.conflicts)).toBe(true);
    expect(result.conflicts.length).toBe(0);
  });

  it('REV-003 场景 3：混合场景分类正确（1 冲突 + 其余正常）', () => {
    // 第一次创建全部文件
    updateProject(tmpDir);

    // 修改 1 个 agent → 冲突
    const plannerPath = join(tmpDir, '.opencode', 'agents', 'planner.md');
    writeFileSync(plannerPath, 'user modified planner', 'utf-8');

    // 第二次 update：1 个冲突，其余全部 skipped（内容一致）
    const result = updateProject(tmpDir);
    expect(result.conflicts.length).toBe(1);
    expect(result.conflicts).toContain('.opencode/agents/planner.md');
    expect(result.created.length).toBe(0);
    // 其余文件内容一致 → skipped（含 AGENTS.md 与核心指令等）
    expect(result.skipped.length).toBeGreaterThan(20);
    // update_state.json 中冲突文件已标记
    const statePath = join(tmpDir, '.openfeel', 'update_state.json');
    const newState = JSON.parse(readFileSync(statePath, 'utf-8'));
    expect(newState.files['.opencode/agents/planner.md'].status).toBe('conflict');
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

  it('语言相同但 AGENTS.md 内容与模板不一致时应覆盖部署（REV: 部署传播）', () => {
    // 模拟已有 .info.json（项目语言为 zh-CN）
    const infoDir = join(tmpDir, '.openfeel');
    mkdirSync(infoDir, { recursive: true });
    writeFileSync(join(infoDir, '.info.json'), JSON.stringify({ user: 'test', lang: 'zh-CN' }), 'utf-8');

    // 模拟已有 AGENTS.md（旧版内容，缺少最新模板章节）
    writeFileSync(join(tmpDir, 'AGENTS.md'), '# 旧版 AGENTS.md\n\n缺少 9 Agent 体系总览', 'utf-8');

    // 语言相同（zh-CN）+ --lang=zh-CN → 应比较内容并覆盖
    const result = updateProject(tmpDir, ['opencode'], 'zh-CN', {
      lang: 'zh-CN',
    });

    expect(result.updated).toContain('AGENTS.md');
    const content = readFileSync(join(tmpDir, 'AGENTS.md'), 'utf-8');
    expect(content).toContain('9 Agent 体系总览');
  });

  it('无 --lang 参数但 AGENTS.md 内容与模板不一致时应覆盖部署（REV: 部署传播）', () => {
    // 模拟已有 AGENTS.md（旧版内容）
    writeFileSync(join(tmpDir, 'AGENTS.md'), '# 旧版 AGENTS.md\n\n缺少 9 Agent 体系总览', 'utf-8');

    // 无 --lang 参数 → 应比较内容并覆盖
    const result = updateProject(tmpDir, ['opencode'], 'zh-CN', {});

    expect(result.updated).toContain('AGENTS.md');
    const content = readFileSync(join(tmpDir, 'AGENTS.md'), 'utf-8');
    expect(content).toContain('9 Agent 体系总览');
  });

  it('AGENTS.md 内容与模板一致时仍跳过（语言相同分支）', () => {
    // 先正常部署一次，得到与模板一致的 AGENTS.md
    updateProject(tmpDir, ['opencode'], 'zh-CN', { lang: 'zh-CN' });

    // 再次部署，内容一致 → 应跳过
    const result = updateProject(tmpDir, ['opencode'], 'zh-CN', { lang: 'zh-CN' });
    expect(result.updated).not.toContain('AGENTS.md');
    expect(result.skipped).toContain('AGENTS.md (language unchanged)');
  });

  it('子命令正确注册（程序包含 update 命令）', async () => {
    // 动态导入 CLI 程序，验证 update 命令已注册
    const { program } = await import('../../src/cli/index.js');
    const commands = program.commands.map((cmd: { name: () => string }) => cmd.name());
    expect(commands).toContain('update');
  });
});
