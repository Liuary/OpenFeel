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

// 备份失败注入开关（op-005 集成层：备份失败 → 目标未写入 + anomaly）
const backupMock = vi.hoisted(() => ({ failFor: null as string | null }));
vi.mock('../../src/core/backup.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/backup.js')>();
  return {
    ...actual,
    backupFileBeforeWrite: (absPath: string, opts: Parameters<typeof actual.backupFileBeforeWrite>[1]) => {
      if (backupMock.failFor && absPath === backupMock.failFor) {
        throw new actual.BackupError(absPath, new Error('injected backup failure'));
      }
      return actual.backupFileBeforeWrite(absPath, opts);
    },
  };
});

import { updateProject } from '../../src/core/update.js';
import { resetBackupSetCache } from '../../src/core/backup.js';
import { createUpdateState, saveUpdateState, hashContent, getOpenfeelVersion } from '../../src/core/update-state.js';
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
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
/** 全局旧 core.md 路径（v1.1.1 废弃，仅兼容检测/清理断言用） */
function globalCoreMdPath(): string {
  return join(globalOpencodeDir(), 'openfeel', 'core.md');
}
/** 全局 AGENTS.md 路径（v1.1.1 约束唯一权威） */
function globalAgentsMdPath(): string {
  return join(globalOpencodeDir(), 'AGENTS.md');
}
/** 全局 opencode.jsonc 路径 */
function globalJsoncPath(): string {
  return join(globalOpencodeDir(), 'opencode.jsonc');
}
/** 全局 update_infos.md 路径（基于 mock home） */
function updateInfosPath(): string {
  return join(mockHome.dir, '.openfeel', 'update_infos.md');
}

/** 去除文件中控制区标记行（模拟 stage-37 存量无标记文件） */
function stripMarkers(filePath: string): void {
  const content = readFileSync(filePath, 'utf-8');
  const stripped = content
    .split('\n')
    .filter((l) => {
      const t = l.trim();
      return t !== '<!-- openfeel:begin -->' && t !== '<!-- openfeel:end -->';
    })
    .join('\n');
  writeFileSync(filePath, stripped, 'utf-8');
}

/** 去除全部全局受管文件的控制区标记（agents + skills + AGENTS.md） */
function stripAllGlobalMarkers(): void {
  for (const dir of [globalAgentsDir(), globalSkillsDir()]) {
    if (!existsSync(dir)) {
      continue;
    }
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = entry.isDirectory() ? join(dir, entry.name, 'SKILL.md') : join(dir, entry.name);
      if (existsSync(p)) {
        stripMarkers(p);
      }
    }
  }
  if (existsSync(globalAgentsMdPath())) {
    stripMarkers(globalAgentsMdPath());
  }
}

describe('updateProject', () => {
  let tmpDir: string;
  let homeDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-update-test-'));
    homeDir = mkdtempSync(join(tmpdir(), 'openfeel-home-'));
    mockHome.dir = homeDir;
    backupMock.failFor = null;
    resetBackupSetCache();
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

  it('应创建全部 16 个 Skill 定义文件（全局）', () => {
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
      'openfeel-workspace',
      'openfeel-tool-usage',
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

  it('应创建全局 AGENTS.md 与全局/项目 opencode.jsonc（无前置文件时）', () => {
    updateProject(tmpDir);

    // 全局 AGENTS.md（约束唯一权威）
    expect(existsSync(globalAgentsMdPath())).toBe(true);
    // 全局旧 core.md 不再创建
    expect(existsSync(globalCoreMdPath())).toBe(false);

    // 全局 opencode.jsonc = 框架级（无 instructions：全局 AGENTS.md 自动加载）
    expect(existsSync(globalJsoncPath())).toBe(true);
    const globalJsonc = JSON.parse(readFileSync(globalJsoncPath(), 'utf-8'));
    expect(globalJsonc.$schema).toBe('https://opencode.ai/config.json');
    expect(globalJsonc.default_agent).toBe('feel');
    expect(globalJsonc.instructions).toBeUndefined();
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

  it('应合并已有全局 opencode.jsonc：保留用户字段 + 覆盖 default_agent + 清理废弃 core.md 引用', () => {
    // 预置含用户自定义字段、注释、废弃 core.md instructions 的全局 opencode.jsonc
    mkdirSync(join(globalOpencodeDir()), { recursive: true });
    const existing = `{
  // 用户注释
  "$schema": "https://opencode.ai/config.json",
  "default_agent": "code",
  "permission": "allow",
  "instructions": ["${globalCoreMdPath().replace(/\\/g, '\\\\')}", "/user/custom.md"],
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
    // 废弃 core.md 引用被清理，用户自定义 instructions 保留
    expect(parsed.instructions).toContain('/user/custom.md');
    expect(parsed.instructions).not.toContain(globalCoreMdPath());
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

  it('重复调用不重复创建，第二次全部 skipped（27）', () => {
    const result1 = updateProject(tmpDir);
    expect(result1.created.length).toBeGreaterThan(0);
    expect(result1.updated.length).toBe(0);

    const result2 = updateProject(tmpDir);
    expect(result2.created.length).toBe(0);
    expect(result2.updated.length).toBe(0);
    // 26 全局部署文件（9 agents + 16 skills + 1 全局 AGENTS.md）+ 项目 opencode.jsonc = 27
    // （全局 opencode.jsonc 走 merge + state hash，不计入返回列表）
    expect(result2.skipped.length).toBe(27);
  });

  it('手动修改全局 agent（无标记）第二次 update 追加受管区而非冲突（三态）', () => {
    updateProject(tmpDir);

    // 手动改写全局 openfeel-planner.md（模拟用户本地修改，去除标记）
    const plannerPath = join(globalAgentsDir(), 'openfeel-planner.md');
    const modified = 'modified content\n';
    writeFileSync(plannerPath, modified, 'utf-8');

    const result2 = updateProject(tmpDir);
    expect(result2.conflicts).not.toContain(plannerPath);
    expect(result2.appended).toContain(plannerPath);
    expect(result2.updated).not.toContain(plannerPath);

    // 用户内容保留在标记区外，框架内容以受管区追加
    const content = readFileSync(plannerPath, 'utf-8');
    expect(content.startsWith('modified content')).toBe(true);
    expect(content).toContain('<!-- openfeel:begin -->');
    expect(content).toContain('你是 openfeel-planner（计划官）');
  });

  it('REV-001（三态）：追加后 hash 同步更新到全局 state，第三次走区内替换（updated）', () => {
    updateProject(tmpDir);

    // 改写全局 openfeel-planner.md（无标记）→ 追加
    const plannerPath = join(globalAgentsDir(), 'openfeel-planner.md');
    writeFileSync(plannerPath, 'user modified openfeel-planner\n', 'utf-8');

    const result2 = updateProject(tmpDir);
    expect(result2.appended).toContain(plannerPath);

    // 追加后 state 记录 clean + 新 hash（D38-1）
    const globalStatePath = join(mockHome.dir, '.openfeel', 'update_state.json');
    const state = JSON.parse(readFileSync(globalStatePath, 'utf-8'));
    expect(state.files[plannerPath].status).toBe('clean');

    // 第三次：文件已含标记（追加即建区）→ 不再重复追加，走区内替换
    const result3 = updateProject(tmpDir);
    expect(result3.appended).not.toContain(plannerPath);
    expect(result3.updated).toContain(plannerPath);
    const content3 = readFileSync(plannerPath, 'utf-8');
    expect(content3).toContain('你是 openfeel-planner（计划官）');
    expect(content3).toContain('user modified openfeel-planner');
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

  it('无标记 hash 不匹配 → 追加 + 写 update_infos.md（不再写 update_conflicts）', () => {
    updateProject(tmpDir);

    const plannerPath = join(globalAgentsDir(), 'openfeel-planner.md');
    writeFileSync(plannerPath, 'user modified openfeel-planner\n', 'utf-8');

    const result = updateProject(tmpDir);
    expect(result.appended).toContain(plannerPath);
    expect(result.conflicts).toHaveLength(0);

    // update_infos.md 记录追加条目（绝对路径）
    expect(existsSync(updateInfosPath())).toBe(true);
    const infos = readFileSync(updateInfosPath(), 'utf-8');
    expect(infos).toContain('## 追加');
    expect(infos).toContain(plannerPath);

    // 三态下不再产生 update_conflicts/ 标记文件
    expect(existsSync(join(mockHome.dir, '.openfeel', 'update_conflicts'))).toBe(false);
    // 区外用户内容保留
    expect(readFileSync(plannerPath, 'utf-8').startsWith('user modified openfeel-planner')).toBe(true);
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
    expect(globalState.files[globalAgentsMdPath()]).toBeDefined();
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

  // ── v1.1.1：update 收敛（不再部署项目 AGENTS.md；全局约束改全局 AGENTS.md） ──

  it('update 不写项目 AGENTS.md，全局部署目标为全局 AGENTS.md', () => {
    updateProject(tmpDir, ['opencode'], 'zh-CN', { lang: 'zh-CN' });
    // 项目根不产生 AGENTS.md
    expect(existsSync(join(tmpDir, 'AGENTS.md'))).toBe(false);
    // 全局 AGENTS.md 已部署，旧 core.md 不存在
    expect(existsSync(globalAgentsMdPath())).toBe(true);
    expect(existsSync(globalCoreMdPath())).toBe(false);
  });

  it('存量项目 AGENTS.md 保留不动（属用户项目约束）', () => {
    const existing = '# 用户项目约束\n\n> 本文档为 测试项目 核心约束层';
    writeFileSync(join(tmpDir, 'AGENTS.md'), existing, 'utf-8');

    const result = updateProject(tmpDir, ['opencode'], 'zh-CN', { lang: 'en' });

    expect(readFileSync(join(tmpDir, 'AGENTS.md'), 'utf-8')).toBe(existing);
    expect(result.created).not.toContain('AGENTS.md');
    expect(result.updated).not.toContain('AGENTS.md');
    expect(result.appended).not.toContain('AGENTS.md');
    // 全局资产正常更新
    expect(existsSync(join(globalAgentsDir(), 'feel.md'))).toBe(true);
  });

  it('全局 state 的 core.md key → 全局 AGENTS.md key 一次性重映射（REV-1910）', () => {
    mkdirSync(join(mockHome.dir, '.openfeel'), { recursive: true });
    writeFileSync(
      join(mockHome.dir, '.openfeel', 'update_state.json'),
      JSON.stringify({
        version: '1.0', last_update: '', openfeel_version: getOpenfeelVersion(),
        files: { [globalCoreMdPath()]: { hash: 'deadbeef', status: 'clean' } },
      }),
      'utf-8',
    );

    updateProject(tmpDir);

    const state = JSON.parse(readFileSync(join(mockHome.dir, '.openfeel', 'update_state.json'), 'utf-8'));
    expect(state.files[globalCoreMdPath()]).toBeUndefined();
    expect(state.files[globalAgentsMdPath()]).toBeDefined();
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

  // ── 三态（控制区标记 + hash 兜底）测试 ──

  it('created：全局 agent/skill/AGENTS.md 均含控制区标记', () => {
    const result = updateProject(tmpDir);

    const feelPath = join(globalAgentsDir(), 'feel.md');
    expect(result.created).toContain(feelPath);
    const feel = readFileSync(feelPath, 'utf-8');
    expect(feel).toContain('<!-- openfeel:begin -->');
    expect(feel).toContain('<!-- openfeel:end -->');

    expect(readFileSync(globalAgentsMdPath(), 'utf-8')).toContain('<!-- openfeel:begin -->');
    expect(readFileSync(join(globalSkillsDir(), 'openfeel-check-kb', 'SKILL.md'), 'utf-8')).toContain('<!-- openfeel:begin -->');
  });

  it('含标记文件：篡改区内 + 区外用户内容 → 只替换区内、区外逐字符保留（updated）', () => {
    updateProject(tmpDir);

    const feelPath = join(globalAgentsDir(), 'feel.md');
    const original = readFileSync(feelPath, 'utf-8');
    const tampered =
      original.replace('<!-- openfeel:begin -->\n', '<!-- openfeel:begin -->\nINJECTED_TAMPER\n') +
      '\n## 用户自定义区外内容\n用户段落\n';
    writeFileSync(feelPath, tampered, 'utf-8');

    const result = updateProject(tmpDir);
    expect(result.updated).toContain(feelPath);

    const after = readFileSync(feelPath, 'utf-8');
    expect(after).not.toContain('INJECTED_TAMPER');
    expect(after).toContain('你是 Feel');
    // 区外后缀逐字符保留
    expect(after).toContain('\n## 用户自定义区外内容\n用户段落\n');
  });

  it('含标记且区内与 incoming 一致 → skipped（REV-901）', () => {
    updateProject(tmpDir);
    const feelPath = join(globalAgentsDir(), 'feel.md');
    const before = readFileSync(feelPath, 'utf-8');

    const result2 = updateProject(tmpDir);
    expect(result2.skipped).toContain(feelPath);
    expect(result2.updated).not.toContain(feelPath);
    expect(readFileSync(feelPath, 'utf-8')).toBe(before);
  });

  it('无标记 + hash 匹配 → adopt（写带标记新框架内容，updated）', () => {
    const feelPath = join(globalAgentsDir(), 'feel.md');
    mkdirSync(globalAgentsDir(), { recursive: true });
    const legacy = '# legacy feel\n用户旧内容\n';
    writeFileSync(feelPath, legacy, 'utf-8');

    // 预置合法全局 state，记录该文件 hash（模拟 stage-37 部署、框架上次写未改）
    mkdirSync(join(mockHome.dir, '.openfeel'), { recursive: true });
    writeFileSync(
      join(mockHome.dir, '.openfeel', 'update_state.json'),
      JSON.stringify({
        version: '1.0',
        last_update: '',
        openfeel_version: getOpenfeelVersion(),
        files: { [feelPath]: { hash: hashContent(legacy), status: 'clean' } },
      }),
      'utf-8',
    );

    const result = updateProject(tmpDir);
    expect(result.updated).toContain(feelPath);
    const content = readFileSync(feelPath, 'utf-8');
    expect(content).toContain('<!-- openfeel:begin -->');
    expect(content).toContain('你是 Feel');
    // stage-46：adopt 覆盖前备份 → update_infos 含 backed 条目（command='update'）
    expect(existsSync(updateInfosPath())).toBe(true);
    const infos = readFileSync(updateInfosPath(), 'utf-8');
    expect(infos).toContain('## 备份');
    expect(infos).toContain(feelPath);
    expect(infos).toContain('来源: update');
  });

  // ── stage-46：部署覆盖前备份 + backed 条目 ──

  it('stage-46：含标记文件内容变化 → 覆盖前备份落 global 分区 + backed 条目（command=update）', () => {
    updateProject(tmpDir); // 首次部署（created，无备份）
    const feelPath = join(globalAgentsDir(), 'feel.md');
    const original = readFileSync(feelPath, 'utf-8');
    const tampered = original.replace('<!-- openfeel:begin -->\n', '<!-- openfeel:begin -->\nTAMPER\n');
    writeFileSync(feelPath, tampered, 'utf-8');

    const result = updateProject(tmpDir);
    expect(result.updated).toContain(feelPath);

    const backupRootPath = join(mockHome.dir, '.openfeel', 'backup');
    expect(existsSync(backupRootPath)).toBe(true);
    const tsDirs = readdirSync(backupRootPath);
    const rel = join('global', relative(mockHome.dir, feelPath));
    expect(tsDirs.some((d) => existsSync(join(backupRootPath, d, rel)))).toBe(true);

    const infos = readFileSync(updateInfosPath(), 'utf-8');
    expect(infos).toContain('## 备份');
    expect(infos).toContain('来源: update');
    expect(infos).toContain(feelPath);
  });

  it('stage-46：全新 HOME 的 created 路径不产生备份', () => {
    updateProject(tmpDir);
    expect(existsSync(join(mockHome.dir, '.openfeel', 'backup'))).toBe(false);
    if (existsSync(updateInfosPath())) {
      expect(readFileSync(updateInfosPath(), 'utf-8')).not.toContain('## 备份');
    }
  });

  it('stage-46：全局 opencode.jsonc 已存在 → 覆盖前备份 + backed（command=update）', () => {
    updateProject(tmpDir); // 首次：jsonc 不存在，无备份
    updateProject(tmpDir); // 二次：jsonc 存在 → 备份
    const infos = readFileSync(updateInfosPath(), 'utf-8');
    expect(infos).toContain('## 备份');
    expect(infos).toContain('来源: update');
    expect(infos).toContain(globalJsoncPath());
  });

  it('stage-46：备份失败 → 目标未写入 + anomaly(backup_failed) + skipped', () => {
    updateProject(tmpDir);
    const feelPath = join(globalAgentsDir(), 'feel.md');
    const original = readFileSync(feelPath, 'utf-8');
    const tampered = original.replace('<!-- openfeel:begin -->\n', '<!-- openfeel:begin -->\nTAMPER\n');
    writeFileSync(feelPath, tampered, 'utf-8');

    backupMock.failFor = feelPath;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const result = updateProject(tmpDir);
      expect(result.skipped).toContain(feelPath);
      expect(result.updated).not.toContain(feelPath);
      // 目标文件未被覆盖
      expect(readFileSync(feelPath, 'utf-8')).toBe(tampered);
      const infos = readFileSync(updateInfosPath(), 'utf-8');
      expect(infos).toContain('## 异常');
      expect(infos).toContain('原因: backup_failed');
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('无标记 + 无 state 记录 → 追加受管区 + update_infos.md；二次 update 幂等（N2）', () => {
    const feelPath = join(globalAgentsDir(), 'feel.md');
    mkdirSync(globalAgentsDir(), { recursive: true });
    writeFileSync(feelPath, 'user only content\n', 'utf-8');

    const result = updateProject(tmpDir);
    expect(result.appended).toContain(feelPath);
    const content = readFileSync(feelPath, 'utf-8');
    expect(content.startsWith('user only content')).toBe(true);
    expect(content).toContain('<!-- openfeel:begin -->');
    expect(readFileSync(updateInfosPath(), 'utf-8')).toContain(feelPath);

    // 幂等：追加即建区，二次 update 不再重复追加
    const result2 = updateProject(tmpDir);
    expect(result2.appended).not.toContain(feelPath);
    expect(readFileSync(feelPath, 'utf-8').match(/<!-- openfeel:begin -->/g)?.length).toBe(1);
  });

  it('malformed（两对标记）→ 不写盘不追加，记 anomaly，结果 skipped（REV-1001）', () => {
    const feelPath = join(globalAgentsDir(), 'feel.md');
    mkdirSync(globalAgentsDir(), { recursive: true });
    const malformed =
      '<!-- openfeel:begin -->\na\n<!-- openfeel:end -->\n<!-- openfeel:begin -->\nb\n<!-- openfeel:end -->\n';
    writeFileSync(feelPath, malformed, 'utf-8');

    const result = updateProject(tmpDir);
    expect(result.skipped).toContain(feelPath);
    expect(result.appended).not.toContain(feelPath);
    expect(readFileSync(feelPath, 'utf-8')).toBe(malformed);
    const infos = readFileSync(updateInfosPath(), 'utf-8');
    expect(infos).toContain('## 异常');
    expect(infos).toContain(feelPath);

    // 二次 update 幂等：仍不写盘、不追加
    const result2 = updateProject(tmpDir);
    expect(readFileSync(feelPath, 'utf-8')).toBe(malformed);
    expect(result2.appended).not.toContain(feelPath);

    // 手动修复为单对完整标记 → 第三次走含标记正常路径（updated），不再 skipped
    writeFileSync(feelPath, '<!-- openfeel:begin -->\nold\n<!-- openfeel:end -->\n', 'utf-8');
    const result3 = updateProject(tmpDir);
    expect(result3.skipped).not.toContain(feelPath);
    expect(result3.updated).toContain(feelPath);
  });

  it('conflicts 恒空（三态下无标记 hash 不匹配改为追加）', () => {
    const result = updateProject(tmpDir);
    expect(result.conflicts).toHaveLength(0);
    expect(Array.isArray(result.appended)).toBe(true);
  });

  it('REV-911：全局 state 损坏 + 存量无标记全局文件 → 全量追加（不覆盖用户内容）', () => {
    updateProject(tmpDir);
    // 去除全部全局受管文件标记（模拟 stage-37 存量无标记文件）
    stripAllGlobalMarkers();
    const feelPath = join(globalAgentsDir(), 'feel.md');
    const before = readFileSync(feelPath, 'utf-8');

    // 损坏全局 state（非法 JSON）
    writeFileSync(join(mockHome.dir, '.openfeel', 'update_state.json'), '{ not valid json', 'utf-8');

    const result = updateProject(tmpDir);
    expect(result.appended.length).toBeGreaterThan(10);
    expect(result.appended).toContain(feelPath);
    // 用户原内容保留在追加区之前
    const after = readFileSync(feelPath, 'utf-8');
    expect(after.startsWith(before)).toBe(true);
    expect(after).toContain('<!-- openfeel:begin -->');
  });

  it('含标记 agent 文件：框架字段覆盖 + 用户自定义字段保留（frontmatter 合并）', () => {
    updateProject(tmpDir);
    const plannerPath = join(globalAgentsDir(), 'openfeel-planner.md');
    const c = readFileSync(plannerPath, 'utf-8');
    // 用户自定义字段 model（框架无）应保留；用户篡改框架字段 description 应被框架值覆盖
    const tampered = c.replace(/^description:.*$/m, 'model: user/custom-model\ndescription: OLD-USER-DESCRIPTION');
    writeFileSync(plannerPath, tampered, 'utf-8');

    const result = updateProject(tmpDir);
    expect(result.updated).toContain(plannerPath);
    const after = readFileSync(plannerPath, 'utf-8');
    // 用户自定义字段 passthrough 保留
    expect(after).toContain('model: user/custom-model');
    // 框架字段覆盖用户篡改值
    expect(after).not.toContain('OLD-USER-DESCRIPTION');
    expect(after).toMatch(/^description: openfeel-planner/m);
  });

  it('存量项目 AGENTS.md 不纳入 update state（update 不再管理项目 AGENTS.md）', () => {
    writeFileSync(join(tmpDir, 'AGENTS.md'), '# 用户项目约束\n', 'utf-8');

    updateProject(tmpDir, ['opencode'], 'zh-CN', {});

    const projectState = JSON.parse(readFileSync(join(tmpDir, '.openfeel', 'update_state.json'), 'utf-8'));
    expect(projectState.files['AGENTS.md']).toBeUndefined();
    // 项目 opencode.jsonc 仍纳入项目 state
    expect(projectState.files['opencode.jsonc']).toBeDefined();
  });

  it('REV-911 命令层：appended > 10 时输出大量追加警告', async () => {
    // 首次部署生成全局文件 → 去标记 → 损坏 state
    updateProject(tmpDir);
    stripAllGlobalMarkers();
    writeFileSync(join(mockHome.dir, '.openfeel', 'update_state.json'), '{ broken', 'utf-8');
    // 项目已初始化（避免命令层 auto-init）
    mkdirSync(join(tmpDir, '.openfeel'), { recursive: true });

    const { Command } = await import('commander');
    const { registerUpdateCommand } = await import('../../src/commands/update.js');
    const program = new Command();
    program.exitOverride();
    registerUpdateCommand(program);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await program.parseAsync(['node', 'openfeel', 'update', tmpDir]);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('追加'));
    } finally {
      warnSpy.mockRestore();
      logSpy.mockRestore();
    }
  });
});
