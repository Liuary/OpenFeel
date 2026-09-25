/**
 * global-paths 单元测试
 * mock homedir 隔离全局路径，断言各函数返回基于主目录的期望绝对路径。
 */
import { describe, it, expect, vi } from 'vitest';
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
  getGlobalUpdateStatePath,
  getGlobalUpdateInfosPath,
  getAuthJsonPath,
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

  it('getGlobalUpdateStatePath 应返回 ~/.openfeel/update_state.json', () => {
    expect(getGlobalUpdateStatePath()).toBe(join(home, '.openfeel', 'update_state.json'));
  });

  it('getGlobalUpdateInfosPath 应返回 ~/.openfeel/update_infos.md', () => {
    expect(getGlobalUpdateInfosPath()).toBe(join(home, '.openfeel', 'update_infos.md'));
  });

  it('getAuthJsonPath 应返回 ~/.local/share/opencode/auth.json', () => {
    expect(getAuthJsonPath()).toBe(join(home, '.local', 'share', 'opencode', 'auth.json'));
  });
});
