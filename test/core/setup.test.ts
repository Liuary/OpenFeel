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
import { resetBackupSetCache } from '../../src/core/backup.js';
import { getGlobalAgentsMdPath, getGlobalAgentsDir, getGlobalSkillsDir, getGlobalOpencodeJsoncPath } from '../../src/core/global-paths.js';
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';

describe('setupGlobalFramework', () => {
  let homeDir: string;

  beforeEach(() => {
    homeDir = mkdtempSync(join(tmpdir(), 'openfeel-setup-home-'));
    mockHome.dir = homeDir;
    backupMock.failFor = null;
    resetBackupSetCache();
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
});
