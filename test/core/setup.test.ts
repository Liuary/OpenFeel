/**
 * setup 单元测试（v1.1.1）
 * 验证 setupGlobalFramework 纯全局部署：全局 AGENTS.md + 9 agent + 18 skill + 全局 opencode.jsonc，
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

import { setupGlobalFramework } from '../../src/core/setup.js';
import { getOpenfeelVersion } from '../../src/core/update-state.js';
import { resetBackupSetCache } from '../../src/core/backup.js';
import { getGlobalAgentsMdPath, getGlobalAgentsDir, getGlobalSkillsDir, getGlobalOpencodeJsoncPath, getClaudeMdPath, getClaudeAgentsDir, getClaudeSkillsDir, getClaudeSettingsPath } from '../../src/core/global-paths.js';
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync, readdirSync, mkdirSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { tmpdir } from 'node:os';

describe('setupGlobalFramework', () => {
  let homeDir: string;

  beforeEach(() => {
    homeDir = mkdtempSync(join(tmpdir(), 'openfeel-setup-home-'));
    mockHome.dir = homeDir;
    backupMock.failFor = null;
    resetBackupSetCache();
    delete process.env.CLAUDE_CONFIG_DIR;
  });

  afterEach(() => {
    rmSync(homeDir, { recursive: true, force: true });
    delete process.env.CLAUDE_CONFIG_DIR;
  });

  it('部署全局 AGENTS.md + 9 agent + 18 skill + 全局 opencode.jsonc', () => {
    const r = setupGlobalFramework('zh-CN');

    expect(existsSync(getGlobalAgentsMdPath())).toBe(true);
    expect(r.created).toContain(getGlobalAgentsMdPath());

    const agentFiles = readdirSync(getGlobalAgentsDir()).filter((f) => f.endsWith('.md'));
    expect(agentFiles).toHaveLength(9);

    const skillDirs = readdirSync(getGlobalSkillsDir(), { withFileTypes: true }).filter((d) => d.isDirectory());
    expect(skillDirs).toHaveLength(18);

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
    // 9 agents + 18 skills + 1 全局 AGENTS.md = 28（opencode.jsonc 走 merge，不计入返回列表）
    expect(r2.skipped.length).toBe(28);
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

  // ── stage-46：部署覆盖前备份 ──

  it('stage-46：二次 setup（AGENTS.md 内容变化）→ 覆盖前备份 + backed（command=setup）', () => {
    setupGlobalFramework('zh-CN');
    const md = getGlobalAgentsMdPath();
    const original = readFileSync(md, 'utf-8');
    writeFileSync(md, original.replace('<!-- openfeel:begin -->\n', '<!-- openfeel:begin -->\nTAMPER\n'), 'utf-8');

    const r = setupGlobalFramework('zh-CN');
    expect(r.updated).toContain(md);

    const backupRootPath = join(homeDir, '.openfeel', 'backup');
    expect(existsSync(backupRootPath)).toBe(true);
    const rel = join('global', relative(homeDir, md));
    expect(readdirSync(backupRootPath).some((d) => existsSync(join(backupRootPath, d, rel)))).toBe(true);

    const infos = readFileSync(join(homeDir, '.openfeel', 'update_infos.md'), 'utf-8');
    expect(infos).toContain('## 备份');
    expect(infos).toContain('来源: setup');
  });

  it('stage-46：首次 setup（created）不产生备份', () => {
    setupGlobalFramework('zh-CN');
    expect(existsSync(join(homeDir, '.openfeel', 'backup'))).toBe(false);
  });

  it('stage-46：备份失败 → AGENTS.md 未写入 + anomaly(backup_failed) + skipped', () => {
    setupGlobalFramework('zh-CN');
    const md = getGlobalAgentsMdPath();
    const original = readFileSync(md, 'utf-8');
    const tampered = original.replace('<!-- openfeel:begin -->\n', '<!-- openfeel:begin -->\nTAMPER\n');
    writeFileSync(md, tampered, 'utf-8');

    backupMock.failFor = md;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const r = setupGlobalFramework('zh-CN');
      expect(r.skipped).toContain(md);
      expect(r.updated).not.toContain(md);
      expect(readFileSync(md, 'utf-8')).toBe(tampered);
      const infos = readFileSync(join(homeDir, '.openfeel', 'update_infos.md'), 'utf-8');
      expect(infos).toContain('原因: backup_failed');
    } finally {
      warnSpy.mockRestore();
    }
  });

  // ── stage-47：jsonc 备份失败 → 跳过继续（REV-011-A）──

  it('stage-47/REV-011：全局 jsonc 备份失败 → 跳过 jsonc 写 + anomaly(backup_failed) + 继续其余步骤', () => {
    setupGlobalFramework('zh-CN');
    const jsoncPath = getGlobalOpencodeJsoncPath();
    const custom = '{\n  "$schema": "https://opencode.ai/config.json",\n  "user_field": "keep-me"\n}\n';
    writeFileSync(jsoncPath, custom, 'utf-8');

    backupMock.failFor = jsoncPath;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      // 不应抛错（备份失败被捕获，命令继续）
      setupGlobalFramework('zh-CN');
      // jsonc 未被写入（原样保留）
      expect(readFileSync(jsoncPath, 'utf-8')).toBe(custom);
      const infos = readFileSync(join(homeDir, '.openfeel', 'update_infos.md'), 'utf-8');
      expect(infos).toContain('原因: backup_failed');
      expect(infos).toContain('opencode.jsonc');
      // 其余步骤继续（全局 AGENTS.md 仍在）
      expect(existsSync(getGlobalAgentsMdPath())).toBe(true);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('stage-48：全局 AGENTS.md 含 opencode 平台默认 ask 权限限定（op-004）', () => {
    setupGlobalFramework('zh-CN');
    const content = readFileSync(getGlobalAgentsMdPath(), 'utf-8');
    expect(content).toContain('平台默认为 `ask`');
  });

  // ── stage-66/D-A：写入侧刷新 openfeel_version ──

  it('stage-66/T4.1：既有全局 state（旧 openfeel_version）→ setup 后刷新为当前 CLI 版本', () => {
    const statePath = join(homeDir, '.openfeel', 'update_state.json');
    mkdirSync(dirname(statePath), { recursive: true });
    writeFileSync(statePath, JSON.stringify({
      version: '1.0', last_update: '', openfeel_version: '1.0.0', files: {},
    }, null, 2) + '\n', 'utf-8');

    setupGlobalFramework('zh-CN');

    const after = JSON.parse(readFileSync(statePath, 'utf-8'));
    expect(after.openfeel_version).toBe(getOpenfeelVersion());
    expect(after.openfeel_version).not.toBe('1.0.0');
  });

  it('stage-66/T4.3：首次（无全局 state）→ setup 后 openfeel_version == 当前 CLI 版本', () => {
    setupGlobalFramework('zh-CN');
    const after = JSON.parse(readFileSync(join(homeDir, '.openfeel', 'update_state.json'), 'utf-8'));
    expect(after.openfeel_version).toBe(getOpenfeelVersion());
  });

  // ── stage-71/T2：claude 分支 + 门控 ──

  it('stage-71/T2：默认（仅 opencode）setup 不触 ~/.claude（零触）', () => {
    setupGlobalFramework('zh-CN');
    expect(existsSync(join(homeDir, '.claude'))).toBe(false);
  });

  it('stage-71/T2：双 harness setup → CLAUDE.md + 9 agents + 18 skills + settings.json', () => {
    const r = setupGlobalFramework('zh-CN', ['opencode', 'claude']);

    expect(existsSync(getClaudeMdPath())).toBe(true);
    expect(r.created).toContain(getClaudeMdPath());

    const claudeAgents = readdirSync(getClaudeAgentsDir()).filter((f) => f.endsWith('.md'));
    expect(claudeAgents).toHaveLength(9);
    expect(existsSync(join(getClaudeAgentsDir(), 'feel.md'))).toBe(true);

    const claudeSkills = readdirSync(getClaudeSkillsDir(), { withFileTypes: true }).filter((d) => d.isDirectory());
    expect(claudeSkills).toHaveLength(18);

    // settings.json 于 stage-73 落地
    expect(existsSync(getClaudeSettingsPath())).toBe(true);
  });

  it('stage-71/T2：CLAUDE.md 含受管区标记且内容 == loadClaudeConstraintTemplate(zh-CN)', async () => {
    setupGlobalFramework('zh-CN', ['opencode', 'claude']);
    const { loadClaudeConstraintTemplate } = await import('../../src/core/template-loader.js');
    const content = readFileSync(getClaudeMdPath(), 'utf-8');
    expect(content).toContain('<!-- openfeel:begin -->');
    expect(content).toContain(loadClaudeConstraintTemplate('zh-CN'));
  });

  it('stage-71/T2：双 harness 二次 setup 幂等 → created/updated 空 + skipped === 57', () => {
    setupGlobalFramework('zh-CN', ['opencode', 'claude']);
    const r2 = setupGlobalFramework('zh-CN', ['opencode', 'claude']);
    expect(r2.created).toHaveLength(0);
    expect(r2.updated).toHaveLength(0);
    // 1 CLAUDE.md + 9 claude agents + 18 claude skills + 1 settings.json + 28 opencode = 57
    expect(r2.skipped.length).toBe(57);
  });

  // ── stage-73/T6：settings.json 注入（设置合并 / 备份 / 越界） ──

  it('stage-73/T6.1：claude 单装（无 settings）→ 生成 agent/permissions 且 created', () => {
    const r = setupGlobalFramework('zh-CN', ['claude']);
    const p = getClaudeSettingsPath();
    expect(existsSync(p)).toBe(true);
    expect(r.created).toContain(p);
    const obj = JSON.parse(readFileSync(p, 'utf-8'));
    expect(obj.agent).toBe('feel');
    expect(obj.permissions.defaultMode).toBe('auto');
  });

  it('stage-73/T6.2：预置用户键 → 逐字保留 + 注入键到位（D-SET/D-SET2）', () => {
    mkdirSync(join(homeDir, '.claude'), { recursive: true });
    const user = {
      env: { ANTHROPIC_BASE_URL: 'http://127.0.0.1:15721' },
      model: 'ccs-claude-deepseek--deepseek-flash[1M]',
      modelPicker: {}, theme: 'dark', apiKeyHelper: 'echo x', agent: 'other',
      permissions: { allow: ['Bash'], deny: ['WebFetch'] },
    };
    writeFileSync(getClaudeSettingsPath(), JSON.stringify(user, null, 2) + '\n', 'utf-8');
    const r = setupGlobalFramework('zh-CN', ['claude']);
    const obj = JSON.parse(readFileSync(getClaudeSettingsPath(), 'utf-8'));
    expect(obj.env).toEqual(user.env);
    expect(obj.model).toBe(user.model);
    expect(obj.modelPicker).toEqual({});
    expect(obj.theme).toBe(user.theme);
    expect(obj.apiKeyHelper).toBe(user.apiKeyHelper);
    expect(obj.permissions.allow).toEqual(['Bash']);
    expect(obj.permissions.deny).toEqual(['WebFetch']);
    expect(obj.agent).toBe('feel');
    expect(obj.permissions.defaultMode).toBe('auto');
    expect(r.updated).toContain(getClaudeSettingsPath());
  });

  it('stage-73/T6.3：二次运行 settings 无变化 → skipped + 字节不变', () => {
    setupGlobalFramework('zh-CN', ['claude']);
    const p = getClaudeSettingsPath();
    const before = readFileSync(p, 'utf-8');
    const r2 = setupGlobalFramework('zh-CN', ['claude']);
    expect(r2.skipped).toContain(p);
    expect(readFileSync(p, 'utf-8')).toBe(before);
  });

  it('stage-73/T6.4：严格 JSON（含注释）→ 不写盘 + anomaly(parse_failed) + skipped', () => {
    mkdirSync(join(homeDir, '.claude'), { recursive: true });
    const bad = '{\n  // comment\n  "agent": "x"\n}\n';
    writeFileSync(getClaudeSettingsPath(), bad, 'utf-8');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const r = setupGlobalFramework('zh-CN', ['claude']);
      expect(readFileSync(getClaudeSettingsPath(), 'utf-8')).toBe(bad);     // 未写盘
      expect(r.skipped).toContain(getClaudeSettingsPath());
      expect(readFileSync(join(homeDir, '.openfeel', 'update_infos.md'), 'utf-8')).toContain('原因: parse_failed');
    } finally { warnSpy.mockRestore(); }
  });

  it('stage-73/T6.6：预置 settings → 写入前备份 + backed；备份失败 → 跳过 + anomaly', () => {
    setupGlobalFramework('zh-CN', ['claude']);
    const p = getClaudeSettingsPath();
    const obj = JSON.parse(readFileSync(p, 'utf-8'));
    obj.agent = 'other';                                                   // 篡改 → 触发变化
    writeFileSync(p, JSON.stringify(obj, null, 2) + '\n', 'utf-8');
    setupGlobalFramework('zh-CN', ['claude']);
    const infos = readFileSync(join(homeDir, '.openfeel', 'update_infos.md'), 'utf-8');
    expect(infos).toContain('## 备份');
    expect(infos).toContain('来源: setup');

    // 备份失败 → 跳过 + anomaly(backup_failed) + 字节不变
    const before = readFileSync(p, 'utf-8');
    backupMock.failFor = p;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const r = setupGlobalFramework('zh-CN', ['claude']);
      expect(r.skipped).toContain(p);
      expect(readFileSync(p, 'utf-8')).toBe(before);
      expect(readFileSync(join(homeDir, '.openfeel', 'update_infos.md'), 'utf-8')).toContain('原因: backup_failed');
    } finally { warnSpy.mockRestore(); backupMock.failFor = null; }
  });

  it('stage-73/T6.7：CLAUDE_CONFIG_DIR 越界（HOME 外）→ 仍写回，备份走 global-external', () => {
    const ext = mkdtempSync(join(tmpdir(), 'openfeel-claude-ext-'));
    try {
      process.env.CLAUDE_CONFIG_DIR = ext;
      writeFileSync(join(ext, 'settings.json'), '{"env":{"A":"1"}}\n', 'utf-8');
      setupGlobalFramework('zh-CN', ['claude']);
      const obj = JSON.parse(readFileSync(join(ext, 'settings.json'), 'utf-8'));
      expect(obj.agent).toBe('feel');
      expect(obj.env).toEqual({ A: '1' });
      const backupRoot = join(homeDir, '.openfeel', 'backup');
      const hasExternal = readdirSync(backupRoot).some((d) => existsSync(join(backupRoot, d, 'global-external')));
      expect(hasExternal).toBe(true);
    } finally {
      delete process.env.CLAUDE_CONFIG_DIR;
      rmSync(ext, { recursive: true, force: true });
    }
  });
});
