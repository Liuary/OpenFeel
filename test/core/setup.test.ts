/**
 * setup 单元测试（v1.1.1）
 * 验证 setupGlobalFramework 纯全局部署：全局 AGENTS.md + 9 agent + 16 skill + 全局 opencode.jsonc，
 * 不建立项目 .openfeel/，且幂等可重跑。
 * mock homedir 隔离，不污染真实主目录。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// mock homedir（vi.hoisted 变体；回调内不可引用外层 import）
const mockHome = vi.hoisted(() => ({ dir: '' }));
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => mockHome.dir };
});

import { setupGlobalFramework } from '../../src/core/setup.js';
import { getGlobalAgentsMdPath, getGlobalAgentsDir, getGlobalSkillsDir, getGlobalOpencodeJsoncPath } from '../../src/core/global-paths.js';
import { existsSync, readFileSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('setupGlobalFramework', () => {
  let homeDir: string;

  beforeEach(() => {
    homeDir = mkdtempSync(join(tmpdir(), 'openfeel-setup-home-'));
    mockHome.dir = homeDir;
  });

  afterEach(() => {
    rmSync(homeDir, { recursive: true, force: true });
  });

  it('部署全局 AGENTS.md + 9 agent + 16 skill + 全局 opencode.jsonc', () => {
    const r = setupGlobalFramework('zh-CN');

    expect(existsSync(getGlobalAgentsMdPath())).toBe(true);
    expect(r.created).toContain(getGlobalAgentsMdPath());

    const agentFiles = readdirSync(getGlobalAgentsDir()).filter((f) => f.endsWith('.md'));
    expect(agentFiles).toHaveLength(9);

    const skillDirs = readdirSync(getGlobalSkillsDir(), { withFileTypes: true }).filter((d) => d.isDirectory());
    expect(skillDirs).toHaveLength(16);

    expect(existsSync(getGlobalOpencodeJsoncPath())).toBe(true);
    const jsonc = JSON.parse(readFileSync(getGlobalOpencodeJsoncPath(), 'utf-8'));
    expect(jsonc.$schema).toBe('https://opencode.ai/config.json');
    expect(jsonc.default_agent).toBe('feel');
    expect('instructions' in jsonc).toBe(false);
  });

  it('全局 AGENTS.md 内容 == loadTemplate(agents-md)（含受管区标记）', async () => {
    setupGlobalFramework('zh-CN');
    const { loadTemplate } = await import('../../src/core/template-loader.js');
    const content = readFileSync(getGlobalAgentsMdPath(), 'utf-8');
    expect(content).toContain('<!-- openfeel:begin -->');
    expect(content).toContain(loadTemplate('zh-CN', 'agents-md'));
  });

  it('二次调用幂等：created 为空，全部 skipped', () => {
    setupGlobalFramework('zh-CN');
    const r2 = setupGlobalFramework('zh-CN');

    expect(r2.created).toHaveLength(0);
    expect(r2.updated).toHaveLength(0);
    // 9 agents + 16 skills + 1 全局 AGENTS.md = 26（opencode.jsonc 走 merge，不计入返回列表）
    expect(r2.skipped.length).toBe(26);
  });

  it('不建立项目 .openfeel/（setup 纯全局部署）', () => {
    // 记录 set up 前 cwd 下是否已有 .openfeel/，setup 后状态不变
    const before = existsSync(join(process.cwd(), '.openfeel'));
    setupGlobalFramework('zh-CN');
    expect(existsSync(join(process.cwd(), '.openfeel'))).toBe(before);
  });

  it('getGlobalAgentsMdPath 落点为 ~/.config/opencode/AGENTS.md', () => {
    expect(getGlobalAgentsMdPath()).toBe(join(homeDir, '.config', 'opencode', 'AGENTS.md'));
  });
});
