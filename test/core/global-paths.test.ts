/**
 * global-paths 单元测试
 * mock homedir 隔离全局路径，断言各函数返回基于主目录的期望绝对路径。
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { join } from 'node:path';

// mock homedir（vi.hoisted 变体，避免模块加载顺序问题；回调内不可引用外层 import）
const mockHome = vi.hoisted(() => ({ dir: '/mock/home' }));
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => mockHome.dir };
});

import {
  getOpencodeGlobalDir,
  getGlobalAgentsDir,
  getGlobalSkillsDir,
  getGlobalOpencodeJsoncPath,
  getGlobalCoreMdPath,
  getGlobalAgentsMdPath,
  getGlobalUpdateStatePath,
  getGlobalUpdateInfosPath,
  getAuthJsonPath,
  getGlobalBackupRootPath,
  getClaudeConfigDir,
  getClaudeAgentsDir,
  getClaudeSkillsDir,
  getClaudeMdPath,
  getClaudeSettingsPath,
} from '../../src/core/global-paths.js';

describe('global-paths 全局路径解析', () => {
  const home = mockHome.dir;
  const opencodeDir = join(home, '.config', 'opencode');

  it('getOpencodeGlobalDir 应返回 ~/.config/opencode', () => {
    expect(getOpencodeGlobalDir()).toBe(opencodeDir);
  });

  it('getGlobalAgentsDir 应返回 ~/.config/opencode/agents', () => {
    expect(getGlobalAgentsDir()).toBe(join(opencodeDir, 'agents'));
  });

  it('getGlobalSkillsDir 应返回 ~/.config/opencode/skills', () => {
    expect(getGlobalSkillsDir()).toBe(join(opencodeDir, 'skills'));
  });

  it('getGlobalOpencodeJsoncPath 应返回 ~/.config/opencode/opencode.jsonc', () => {
    expect(getGlobalOpencodeJsoncPath()).toBe(join(opencodeDir, 'opencode.jsonc'));
  });

  it('getGlobalCoreMdPath 应返回 ~/.config/opencode/openfeel/core.md', () => {
    expect(getGlobalCoreMdPath()).toBe(join(opencodeDir, 'openfeel', 'core.md'));
  });

  it('getGlobalAgentsMdPath 应返回 ~/.config/opencode/AGENTS.md', () => {
    expect(getGlobalAgentsMdPath()).toBe(join(opencodeDir, 'AGENTS.md'));
  });

  it('getGlobalUpdateStatePath 应返回 ~/.openfeel/update_state.json', () => {
    expect(getGlobalUpdateStatePath()).toBe(join(home, '.openfeel', 'update_state.json'));
  });

  it('getGlobalUpdateInfosPath 应返回 ~/.openfeel/update_infos.md', () => {
    expect(getGlobalUpdateInfosPath()).toBe(join(home, '.openfeel', 'update_infos.md'));
  });

  it('getAuthJsonPath 应返回 ~/.local/share/opencode/auth.json', () => {
    expect(getAuthJsonPath()).toBe(join(home, '.local', 'share', 'opencode', 'auth.json'));
  });

  it('getGlobalBackupRootPath 应返回 ~/.openfeel/backup（stage-46）', () => {
    expect(getGlobalBackupRootPath()).toBe(join(home, '.openfeel', 'backup'));
  });
});

describe('global-paths Claude 路径（stage-71 T1）', () => {
  const home = mockHome.dir;
  const originalConfigDir = process.env.CLAUDE_CONFIG_DIR;

  afterEach(() => {
    // 恢复 env，避免用例间泄漏
    if (originalConfigDir === undefined) {
      delete process.env.CLAUDE_CONFIG_DIR;
    } else {
      process.env.CLAUDE_CONFIG_DIR = originalConfigDir;
    }
  });

  it('未设 CLAUDE_CONFIG_DIR → 回落 ~/.claude，5 函数分别落位', () => {
    delete process.env.CLAUDE_CONFIG_DIR;
    const configDir = join(home, '.claude');
    expect(getClaudeConfigDir()).toBe(configDir);
    expect(getClaudeAgentsDir()).toBe(join(configDir, 'agents'));
    expect(getClaudeSkillsDir()).toBe(join(configDir, 'skills'));
    expect(getClaudeMdPath()).toBe(join(configDir, 'CLAUDE.md'));
    expect(getClaudeSettingsPath()).toBe(join(configDir, 'settings.json'));
  });

  it('设为 /custom/claude → 尊重 env，派生路径基于该目录', () => {
    process.env.CLAUDE_CONFIG_DIR = '/custom/claude';
    expect(getClaudeConfigDir()).toBe('/custom/claude');
    expect(getClaudeAgentsDir()).toBe(join('/custom/claude', 'agents'));
    expect(getClaudeSkillsDir()).toBe(join('/custom/claude', 'skills'));
    expect(getClaudeMdPath()).toBe(join('/custom/claude', 'CLAUDE.md'));
    expect(getClaudeSettingsPath()).toBe(join('/custom/claude', 'settings.json'));
  });

  it('空串 / 纯空白 → 回落 ~/.claude', () => {
    process.env.CLAUDE_CONFIG_DIR = '';
    expect(getClaudeConfigDir()).toBe(join(home, '.claude'));

    process.env.CLAUDE_CONFIG_DIR = '   ';
    expect(getClaudeConfigDir()).toBe(join(home, '.claude'));
  });
});
