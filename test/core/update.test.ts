/**
 * update 单元测试
 * 测试 updateProject 在隔离 HOME 下的全局部署行为（~/.config/opencode、~/.openfeel）。
 * mock homedir 隔离，不污染真实主目录。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// mock homedir（vi.hoisted 变体；回调内不可引用外层 import）
const mockHome = vi.hoisted(() => ({ dir: '' }));
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => mockHome.dir };
});

import { updateProject, AgentsMdLangConflictError } from '../../src/core/update.js';
import { createUpdateState, saveUpdateState } from '../../src/core/update-state.js';
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/** 全局 opencode 目录（基于 mock home） */
function globalOpencodeDir(): string {
  return join(mockHome.dir, '.config', 'opencode');
}
/** 全局 agents 目录 */
function globalAgentsDir(): string {
  return join(globalOpencodeDir(), 'agents');
}
/** 全局 skills 目录 */
function globalSkillsDir(): string {
  return join(globalOpencodeDir(), 'skills');
}
/** 全局 core.md 路径 */
function globalCoreMdPath(): string {
  return join(globalOpencodeDir(), 'openfeel', 'core.md');
}
/** 全局 opencode.jsonc 路径 */
function globalJsoncPath(): string {
  return join(globalOpencodeDir(), 'opencode.jsonc');
}

describe('updateProject', () => {
  let tmpDir: string;
  let homeDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-update-test-'));
    homeDir = mkdtempSync(join(tmpdir(), 'openfeel-home-'));
    mockHome.dir = homeDir;
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    rmSync(homeDir, { recursive: true, force: true });
  });

  it('应创建 9 个全局 Agent 定义文件', () => {
    updateProject(tmpDir);
    const agentsDir = globalAgentsDir();

    expect(existsSync(join(agentsDir, 'feel.md'))).toBe(true);
    expect(existsSync(join(agentsDir, 'openfeel-planner.md'))).toBe(true);
    expect(existsSync(join(agentsDir, 'openfeel-schemer.md'))).toBe(true);
    expect(existsSync(join(agentsDir, 'openfeel-executor.md'))).toBe(true);
    expect(existsSync(join(agentsDir, 'openfeel-reviewer.md'))).toBe(true);
    expect(existsSync(join(agentsDir, 'openfeel-feel-tester.md'))).toBe(true);
    expect(existsSync(join(agentsDir, 'openfeel-archiver.md'))).toBe(true);
    expect(existsSync(join(agentsDir, 'openfeel-utility.md'))).toBe(true);
    expect(existsSync(join(agentsDir, 'openfeel-vision.md'))).toBe(true);

    // 项目精简：无 .opencode/
    expect(existsSync(join(tmpDir, '.opencode'))).toBe(false);
  });

  it('feel.md 应包含 mode: primary 和正确的 YAML frontmatter', () => {
    updateProject(tmpDir);
    const feelContent = readFileSync(join(globalAgentsDir(), 'feel.md'), 'utf-8');

    expect(feelContent).toContain('---');
    expect(feelContent).toContain('mode: primary');
    expect(feelContent).toContain('color: "#8B5CF6"');
    expect(feelContent).toContain('你是 Feel');
  });

  it('应创建全部 14 个 Skill 定义文件（全局）', () => {
    updateProject(tmpDir);
    const skillsDir = globalSkillsDir();

    const expectedSkills = [
      'openfeel-bug-acceptance',
      'openfeel-check-kb',
      'openfeel-get-bugs',
      'openfeel-get-stage-status',
      'openfeel-model-check',
      'openfeel-search-kb',
      'openfeel-sync-status',
      'openfeel-update-stage-status',
      'openfeel-agent-model-check',
      'openfeel-model-config',
      'openfeel-recover',
      'openfeel-roadmap',
      'openfeel-health',
      'openfeel-wizard',
    ];

    for (const skillName of expectedSkills) {
      const skillFile = join(skillsDir, skillName, 'SKILL.md');
      expect(existsSync(skillFile)).toBe(true);
    }
  });

  it('SKILL.md 应包含正确的 YAML frontmatter', () => {
    updateProject(tmpDir);
    const skillContent = readFileSync(
      join(globalSkillsDir(), 'openfeel-bug-acceptance', 'SKILL.md'),
      'utf-8',
    );

    expect(skillContent).toContain('name: openfeel-bug-acceptance');
    expect(skillContent).toContain('description: 标准化 Bug 验收流程');
  });

  it('应创建全局 core.md 与全局/项目 opencode.jsonc（无前置文件时）', () => {
    updateProject(tmpDir);

    // 全局 core.md
    expect(existsSync(globalCoreMdPath())).toBe(true);

    // 全局 opencode.jsonc = 框架级
    expect(existsSync(globalJsoncPath())).toBe(true);
    const globalJsonc = JSON.parse(readFileSync(globalJsoncPath(), 'utf-8'));
    expect(globalJsonc.$schema).toBe('https://opencode.ai/config.json');
    expect(globalJsonc.default_agent).toBe('feel');
    expect(globalJsonc.instructions).toEqual([globalCoreMdPath()]);
    expect(globalJsonc.skills).toBeUndefined();
    expect(globalJsonc.experimental).toBeUndefined();

    // 项目 opencode.jsonc = 最小覆盖（仅 $schema）
    const projectJsoncPath = join(tmpDir, 'opencode.jsonc');
    expect(existsSync(projectJsoncPath)).toBe(true);
    const projectJsonc = JSON.parse(readFileSync(projectJsoncPath, 'utf-8'));
    expect(projectJsonc).toEqual({ $schema: 'https://opencode.ai/config.json' });
    expect(projectJsonc.instructions).toBeUndefined();
    expect(projectJsonc.skills).toBeUndefined();
    expect(projectJsonc.default_agent).toBeUndefined();
  });

  it('应合并已有全局 opencode.jsonc：保留用户字段 + 覆盖 default_agent + instructions 拼接去重 + 注释去除', () => {
    // 预置含用户自定义字段与注释的全局 opencode.jsonc
    mkdirSync(join(globalOpencodeDir()), { recursive: true });
    const existing = `{
  // 用户注释
  "$schema": "https://opencode.ai/config.json",
  "default_agent": "code",
  "permission": "allow",
  "instructions": ["/user/custom.md"],
  "agent": { "custom": { "model": "x/y" } },
  "experimental": { "foo": true }
}
`;
    writeFileSync(globalJsoncPath(), existing, 'utf-8');

    updateProject(tmpDir);

    const content = readFileSync(globalJsoncPath(), 'utf-8');
    expect(content).not.toContain('// 用户注释');
    const parsed = JSON.parse(content);
    // 用户字段保留（passthrough）
    expect(parsed.permission).toBe('allow');
    expect(parsed.agent.custom).toEqual({ model: 'x/y' });
    expect(parsed.experimental.foo).toBe(true);
    // default_agent 覆盖为 feel
    expect(parsed.default_agent).toBe('feel');
    // instructions 拼接（框架 core.md 在前）+ 去重
    expect(parsed.instructions[0]).toBe(globalCoreMdPath());
    expect(parsed.instructions).toContain('/user/custom.md');
    expect(new Set(parsed.instructions).size).toBe(parsed.instructions.length);
    // 框架不写 skills
    expect(parsed.skills).toBeUndefined();
    // 无 agent_manager_tool
    expect(parsed.experimental.agent_manager_tool).toBeUndefined();
  });

  it('已有项目 opencode.jsonc 时保留不动（不写 instructions/skills）', () => {
    const existing = `{
  "$schema": "https://opencode.ai/config.json",
  "agent": { "custom": { "model": "x/y" } }
}
`;
    writeFileSync(join(tmpDir, 'opencode.jsonc'), existing, 'utf-8');

    updateProject(tmpDir);

    const parsed = JSON.parse(readFileSync(join(tmpDir, 'opencode.jsonc'), 'utf-8'));
    expect(parsed.agent.custom).toEqual({ model: 'x/y' });
    expect(parsed.instructions).toBeUndefined();
    expect(parsed.skills).toBeUndefined();
  });

  it('重复调用不重复创建，第二次全部 skipped（26）', () => {
    const result1 = updateProject(tmpDir);
    expect(result1.created.length).toBeGreaterThan(0);
    expect(result1.updated.length).toBe(0);

    const result2 = updateProject(tmpDir);
    expect(result2.created.length).toBe(0);
    expect(result2.updated.length).toBe(0);
    // 24 全局部署文件（9 agents + 14 skills + 1 core.md）+ 项目 opencode.jsonc + AGENTS.md = 26
    // （全局 opencode.jsonc 走 merge + state hash，不计入返回列表）
    expect(result2.skipped.length).toBe(26);
  });

  it('手动修改全局 agent 内容后第二次 update 应标记冲突且不覆盖（REV-001）', () => {
    updateProject(tmpDir);

    // 手动修改全局 openfeel-planner.md（模拟用户本地修改）
    const plannerPath = join(globalAgentsDir(), 'openfeel-planner.md');
    const modified = 'modified content';
    writeFileSync(plannerPath, modified, 'utf-8');

    const result2 = updateProject(tmpDir);
    expect(result2.conflicts).toContain(plannerPath);
    expect(result2.updated).not.toContain(plannerPath);

    // 用户修改内容未被覆盖
    expect(readFileSync(plannerPath, 'utf-8')).toBe(modified);
  });

  it('REV-001：有冲突时其他 updated 文件 hash 仍同步更新到全局 update_state.json', () => {
    updateProject(tmpDir);

    // 修改全局 openfeel-planner.md（冲突）
    const plannerPath = join(globalAgentsDir(), 'openfeel-planner.md');
    writeFileSync(plannerPath, 'user modified openfeel-planner', 'utf-8');

    // 修改全局 openfeel-executor.md 并删除全局 state 中记录（降级 → 安全覆盖 → updated）
    const executorPath = join(globalAgentsDir(), 'openfeel-executor.md');
    writeFileSync(executorPath, 'user modified openfeel-executor', 'utf-8');
    const globalStatePath = join(mockHome.dir, '.openfeel', 'update_state.json');
    const state = JSON.parse(readFileSync(globalStatePath, 'utf-8'));
    delete state.files[executorPath];
    writeFileSync(globalStatePath, JSON.stringify(state), 'utf-8');

    const result2 = updateProject(tmpDir);
    expect(result2.conflicts).toContain(plannerPath);
    expect(result2.updated).toContain(executorPath);

    // REV-001 核心：即使有冲突，updated 文件 hash 也更新到全局 state
    const newState = JSON.parse(readFileSync(globalStatePath, 'utf-8'));
    expect(newState.files[executorPath].status).toBe('clean');
    expect(newState.files[plannerPath].status).toBe('conflict');

    // 第三次调用（无修改）→ executor 内容已与模板一致 → skipped
    const result3 = updateProject(tmpDir);
    expect(result3.updated).not.toContain(executorPath);
  });

  it('REV-003 场景 2：空全局 state 文件行为同首次 update', () => {
    const globalOpenfeelDir = join(mockHome.dir, '.openfeel');
    mkdirSync(globalOpenfeelDir, { recursive: true });
    writeFileSync(
      join(globalOpenfeelDir, 'update_state.json'),
      JSON.stringify({ version: '1.0', last_update: '', openfeel_version: '', files: {} }),
      'utf-8',
    );

    const result = updateProject(tmpDir);
    expect(result.created.length).toBeGreaterThan(0);
    expect(existsSync(join(globalAgentsDir(), 'feel.md'))).toBe(true);

    const newState = JSON.parse(readFileSync(join(globalOpenfeelDir, 'update_state.json'), 'utf-8'));
    expect(newState.files[join(globalAgentsDir(), 'feel.md')].status).toBe('clean');
  });

  it('冲突时写入全局 ~/.openfeel/update_conflicts/ 标记文件（Git 风格）', () => {
    updateProject(tmpDir);

    const plannerPath = join(globalAgentsDir(), 'openfeel-planner.md');
    writeFileSync(plannerPath, 'user modified openfeel-planner', 'utf-8');

    const result = updateProject(tmpDir);
    expect(result.conflicts).toContain(plannerPath);

    // 全局冲突文件路径：~/.openfeel/update_conflicts/agents/openfeel-planner.md
    const conflictPath = join(mockHome.dir, '.openfeel', 'update_conflicts', 'agents', 'openfeel-planner.md');
    expect(existsSync(conflictPath)).toBe(true);

    const content = readFileSync(conflictPath, 'utf-8');
    expect(content).toContain('<<<<<<< CURRENT (用户修改版)');
    expect(content).toContain('=======');
    expect(content).toContain('>>>>>>> INCOMING');
    expect(content).toContain('user modified openfeel-planner');
    expect(content).toContain('你是 openfeel-planner（计划官）');
  });

  it('无冲突时不写入 update_conflicts/ 目录', () => {
    updateProject(tmpDir);
    expect(existsSync(join(mockHome.dir, '.openfeel', 'update_conflicts'))).toBe(false);
    expect(existsSync(join(tmpDir, '.openfeel', 'update_conflicts'))).toBe(false);
  });

  it('UpdateResult 包含 conflicts 字段（类型与运行时）', () => {
    const result = updateProject(tmpDir);
    expect(Array.isArray(result.conflicts)).toBe(true);
    expect(result.conflicts.length).toBe(0);
  });

  it('返回的 created 列表应包含全局绝对路径与项目 opencode.jsonc', () => {
    const result = updateProject(tmpDir);

    expect(result.created).toContain(join(globalAgentsDir(), 'feel.md'));
    expect(result.created).toContain(join(globalAgentsDir(), 'openfeel-planner.md'));
    expect(result.created).toContain(join(globalAgentsDir(), 'openfeel-feel-tester.md'));

    expect(result.created).toContain(join(globalSkillsDir(), 'openfeel-bug-acceptance', 'SKILL.md'));
    expect(result.created).toContain(join(globalSkillsDir(), 'openfeel-check-kb', 'SKILL.md'));

    expect(result.created).toContain('opencode.jsonc');
  });

  it('update_state 双份：全局资产落 ~/.openfeel，项目资产落项目 .openfeel', () => {
    updateProject(tmpDir);

    const globalStatePath = join(mockHome.dir, '.openfeel', 'update_state.json');
    const projectStatePath = join(tmpDir, '.openfeel', 'update_state.json');
    expect(existsSync(globalStatePath)).toBe(true);
    expect(existsSync(projectStatePath)).toBe(true);

    const globalState = JSON.parse(readFileSync(globalStatePath, 'utf-8'));
    // 全局 state key 为绝对路径
    expect(globalState.files[join(globalAgentsDir(), 'feel.md')]).toBeDefined();
    expect(globalState.files[globalCoreMdPath()]).toBeDefined();
    expect(globalState.files[globalJsoncPath()]).toBeDefined();

    const projectState = JSON.parse(readFileSync(projectStatePath, 'utf-8'));
    expect(projectState.files['opencode.jsonc']).toBeDefined();
    // 项目 state 不含全局绝对路径
    expect(projectState.files[join(globalAgentsDir(), 'feel.md')]).toBeUndefined();
  });

  it('legacy 布局：项目含 .opencode/agents 时输出 migrate 提示且不迁移/删除', () => {
    const legacyDir = join(tmpDir, '.opencode', 'agents');
    mkdirSync(legacyDir, { recursive: true });
    writeFileSync(join(legacyDir, 'feel.md'), 'legacy content', 'utf-8');

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      updateProject(tmpDir);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('openfeel migrate'));
    } finally {
      warnSpy.mockRestore();
    }

    // 不删除/迁移 legacy 目录
    expect(existsSync(join(legacyDir, 'feel.md'))).toBe(true);
    expect(readFileSync(join(legacyDir, 'feel.md'), 'utf-8')).toBe('legacy content');
  });

  it('schema 校验：全局 jsonc 无 skills 映射、无 agent_manager_tool、$schema 正确', () => {
    updateProject(tmpDir);
    const raw = readFileSync(globalJsoncPath(), 'utf-8');
    const parsed = JSON.parse(raw);
    expect(raw).not.toContain('.opencode/skills/');
    expect(parsed.$schema).toBe('https://opencode.ai/config.json');
    expect(parsed.skills).toBeUndefined();
    expect(parsed.experimental?.agent_manager_tool).toBeUndefined();
  });

  // ── AGENTS.md 语言同步逻辑测试（项目级资产） ──

  it('首次部署 + --lang=en 应创建英文版 AGENTS.md', () => {
    updateProject(tmpDir, ['opencode'], 'en', { lang: 'en' });
    const agentsMdPath = join(tmpDir, 'AGENTS.md');
    expect(existsSync(agentsMdPath)).toBe(true);
    const content = readFileSync(agentsMdPath, 'utf-8');
    expect(content).toContain('This document is the core constraint layer');
    expect(content).not.toContain('核心约束层');
  });

  it('已有旧布局 agents 目录但 AGENTS.md 被删 + --lang 应重新创建 (REV-002)', () => {
    // 模拟项目内旧布局 agents 目录（有内容）
    const agentsDir = join(tmpDir, '.opencode', 'agents');
    mkdirSync(agentsDir, { recursive: true });
    writeFileSync(join(agentsDir, 'feel.md'), 'dummy', 'utf-8');

    const result = updateProject(tmpDir, ['opencode'], 'en', { lang: 'en' });
    const agentsMdPath = join(tmpDir, 'AGENTS.md');
    expect(existsSync(agentsMdPath)).toBe(true);
    expect(result.created).toContain('AGENTS.md');
    const content = readFileSync(agentsMdPath, 'utf-8');
    expect(content).toContain('This document is the core constraint layer');
  });

  it('语言冲突交互模式跳过 AGENTS.md 但继续更新其他文件 (REV-004)', () => {
    const infoDir = join(tmpDir, '.openfeel');
    mkdirSync(infoDir, { recursive: true });
    writeFileSync(join(infoDir, '.info.json'), JSON.stringify({ user: 'test', lang: 'zh-CN' }), 'utf-8');

    const agentsMdContent = '# 测试项目\n\n> 本文档为 测试项目 核心约束层';
    writeFileSync(join(tmpDir, 'AGENTS.md'), agentsMdContent, 'utf-8');

    const result = updateProject(tmpDir, ['opencode'], 'zh-CN', {
      lang: 'en',
      interactive: true,
    });

    expect(readFileSync(join(tmpDir, 'AGENTS.md'), 'utf-8')).toBe(agentsMdContent);
    expect(result.skipped).toContain('AGENTS.md (language conflict)');

    // 其他文件正常创建（全局）
    expect(existsSync(join(globalAgentsDir(), 'feel.md'))).toBe(true);
    expect(existsSync(join(globalSkillsDir(), 'openfeel-check-kb', 'SKILL.md'))).toBe(true);
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
    const infoDir = join(tmpDir, '.openfeel');
    mkdirSync(infoDir, { recursive: true });
    writeFileSync(join(infoDir, '.info.json'), JSON.stringify({ user: 'test', lang: 'zh-CN' }), 'utf-8');

    writeFileSync(join(tmpDir, 'AGENTS.md'), '# 旧版 AGENTS.md\n\n缺少 9 Agent 体系总览', 'utf-8');

    const result = updateProject(tmpDir, ['opencode'], 'zh-CN', { lang: 'zh-CN' });

    expect(result.updated).toContain('AGENTS.md');
    const content = readFileSync(join(tmpDir, 'AGENTS.md'), 'utf-8');
    expect(content).toContain('9 Agent 体系总览');
  });

  it('无 --lang 参数但 AGENTS.md 内容与模板不一致时应覆盖部署（REV: 部署传播）', () => {
    writeFileSync(join(tmpDir, 'AGENTS.md'), '# 旧版 AGENTS.md\n\n缺少 9 Agent 体系总览', 'utf-8');

    const result = updateProject(tmpDir, ['opencode'], 'zh-CN', {});

    expect(result.updated).toContain('AGENTS.md');
    const content = readFileSync(join(tmpDir, 'AGENTS.md'), 'utf-8');
    expect(content).toContain('9 Agent 体系总览');
  });

  it('AGENTS.md 内容与模板一致时仍跳过（语言相同分支）', () => {
    updateProject(tmpDir, ['opencode'], 'zh-CN', { lang: 'zh-CN' });

    const result = updateProject(tmpDir, ['opencode'], 'zh-CN', { lang: 'zh-CN' });
    expect(result.updated).not.toContain('AGENTS.md');
    expect(result.skipped).toContain('AGENTS.md (language unchanged)');
  });

  it('子命令正确注册（程序包含 update 命令）', async () => {
    const { program } = await import('../../src/cli/index.js');
    const commands = program.commands.map((cmd: { name: () => string }) => cmd.name());
    expect(commands).toContain('update');
  });

  it('saveUpdateState 写出合法 JSON（原子写）', () => {
    // 覆盖 createUpdateState 使用 mock homedir 下的临时项目（getStatePath 用 projectPath，无全局依赖）
    const state = createUpdateState(tmpDir, { 'a.md': 'x' });
    saveUpdateState(tmpDir, state);
    const raw = readFileSync(join(tmpDir, '.openfeel', 'update_state.json'), 'utf-8');
    expect(raw.endsWith('\n')).toBe(true);
    expect(() => JSON.parse(raw)).not.toThrow();
  });
});
