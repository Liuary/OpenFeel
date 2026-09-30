/**
 * update-infos 单元测试
 * 覆盖 update_infos.md 的 append / load / resolve / clear 生命周期、
 * 路径二元组（REV-903）、损坏降级与多次追加。
 * mock homedir 隔离，不污染真实 ~/.openfeel/update_infos.md。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// mock homedir（须在 import 被测模块之前声明）
const mockHome = vi.hoisted(() => ({ dir: '' }));
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => mockHome.dir };
});

import {
  loadUpdateInfos,
  appendUpdateInfo,
  resolveUpdateInfo,
  clearUpdateInfos,
} from '../../src/core/update-infos.js';
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/** update_infos.md 路径（基于 mock home） */
function infosPath(): string {
  return join(mockHome.dir, '.openfeel', 'update_infos.md');
}

describe('update-infos', () => {
  let homeDir: string;

  beforeEach(() => {
    homeDir = mkdtempSync(join(tmpdir(), 'openfeel-infos-'));
    mockHome.dir = homeDir;
  });

  afterEach(() => {
    rmSync(homeDir, { recursive: true, force: true });
  });

  it('loadUpdateInfos 文件不存在 → []', () => {
    expect(loadUpdateInfos()).toEqual([]);
  });

  it('appendUpdateInfo（全局绝对路径）→ 写入追加节、回读字段一致', () => {
    const absolutePath = join(mockHome.dir, '.config', 'opencode', 'agents', 'feel.md');
    appendUpdateInfo('appended', { absolutePath });

    expect(existsSync(infosPath())).toBe(true);
    const raw = readFileSync(infosPath(), 'utf-8');
    expect(raw).toContain('## 追加');
    expect(raw).toContain(absolutePath);

    const entries = loadUpdateInfos();
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe('appended');
    expect(entries[0].absolutePath).toBe(absolutePath);
    expect(entries[0].projectRoot).toBeNull();
    expect(entries[0].relativePath).toBeNull();
    expect(entries[0].resolved).toBe(false);
    expect(entries[0].timestamp).toBeTruthy();
  });

  it('appendUpdateInfo（项目根 + 相对路径）→ display 二元组、回读还原（REV-903）', () => {
    const projectRoot = join(mockHome.dir, 'projects', 'p1');
    appendUpdateInfo('appended', { projectRoot, relativePath: 'AGENTS.md' });

    const raw = readFileSync(infosPath(), 'utf-8');
    expect(raw).toContain(`AGENTS.md (项目: ${projectRoot})`);

    const entries = loadUpdateInfos();
    expect(entries[0].absolutePath).toBeNull();
    expect(entries[0].projectRoot).toBe(projectRoot);
    expect(entries[0].relativePath).toBe('AGENTS.md');
  });

  it('appendUpdateInfo（anomaly）→ 落异常节、kind=anomaly', () => {
    appendUpdateInfo('anomaly', { absolutePath: '/x/y/SKILL.md' });
    const raw = readFileSync(infosPath(), 'utf-8');
    expect(raw).toContain('## 异常');
    const entries = loadUpdateInfos();
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe('anomaly');
    expect(entries[0].resolved).toBe(false);
  });

  it('resolveUpdateInfo 匹配条目 resolved → true；不匹配不报错无变化', () => {
    const absolutePath = join(mockHome.dir, 'a.md');
    appendUpdateInfo('appended', { absolutePath });
    appendUpdateInfo('anomaly', { absolutePath: join(mockHome.dir, 'b.md') });

    resolveUpdateInfo({ absolutePath });
    const entries = loadUpdateInfos();
    expect(entries.find((e) => e.absolutePath === absolutePath)?.resolved).toBe(true);
    expect(entries.find((e) => e.absolutePath === join(mockHome.dir, 'b.md'))?.resolved).toBe(false);

    // 不匹配 target：无变化、不抛错
    expect(() => resolveUpdateInfo({ absolutePath: '/no/match.md' })).not.toThrow();
    expect(loadUpdateInfos()).toHaveLength(2);
  });

  it('resolveUpdateInfo（项目二元组）匹配', () => {
    appendUpdateInfo('appended', { projectRoot: '/proj', relativePath: 'AGENTS.md' });
    resolveUpdateInfo({ projectRoot: '/proj', relativePath: 'AGENTS.md' });
    expect(loadUpdateInfos()[0].resolved).toBe(true);
  });

  it('clearUpdateInfos → 仅含骨架、无条目行', () => {
    appendUpdateInfo('appended', { absolutePath: '/a.md' });
    clearUpdateInfos();
    expect(loadUpdateInfos()).toEqual([]);
    const raw = readFileSync(infosPath(), 'utf-8');
    expect(raw).toContain('# OpenFeel 增量更新记录');
    expect(raw).not.toContain('- [');
  });

  it('损坏（路径为目录，读取失败）→ 降级 [] 且 console.warn 被调用', () => {
    mkdirSync(infosPath(), { recursive: true });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(loadUpdateInfos()).toEqual([]);
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('多次追加：条目数等于追加次数、文件未损坏', async () => {
    const tasks: Promise<void>[] = [];
    for (let i = 0; i < 10; i++) {
      tasks.push(Promise.resolve().then(() => appendUpdateInfo('appended', { absolutePath: `/f/${i}.md` })));
    }
    await Promise.all(tasks);
    expect(loadUpdateInfos()).toHaveLength(10);
  });

  // ── stage-46：第三类「备份」+ note 成因 + 向后兼容 ──

  it('backed（全局）→ 落备份节、往返 kind=backed（不被误归 anomaly，REV-003）', () => {
    const abs = join(mockHome.dir, '.config', 'opencode', 'AGENTS.md');
    appendUpdateInfo('backed', { absolutePath: abs, backupRel: 'global/.config/opencode/AGENTS.md', command: 'setup' });

    const raw = readFileSync(infosPath(), 'utf-8');
    expect(raw).toContain('## 备份');
    expect(raw).toContain('（备份: `global/.config/opencode/AGENTS.md`，来源: setup）');

    const entries = loadUpdateInfos();
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe('backed');
    expect(entries[0].backupRel).toBe('global/.config/opencode/AGENTS.md');
    expect(entries[0].command).toBe('setup');
    expect(entries[0].note).toBeNull();
  });

  it('backed（项目二元组）→ 往返 path 与 backupRel/command 正确', () => {
    const projectRoot = join(mockHome.dir, 'projects', 'p1');
    appendUpdateInfo('backed', { projectRoot, relativePath: '.openfeel/config.yaml', backupRel: 'project/p1-abc12345/.openfeel/config.yaml', command: 'init' });

    const raw = readFileSync(infosPath(), 'utf-8');
    expect(raw).toContain(`.openfeel/config.yaml (项目: ${projectRoot})`);

    const e = loadUpdateInfos()[0];
    expect(e.kind).toBe('backed');
    expect(e.projectRoot).toBe(projectRoot);
    expect(e.relativePath).toBe('.openfeel/config.yaml');
    expect(e.backupRel).toBe('project/p1-abc12345/.openfeel/config.yaml');
    expect(e.command).toBe('init');
  });

  it('anomaly + note=backup_failed → 往返 note 正确', () => {
    appendUpdateInfo('anomaly', { projectRoot: '/p', relativePath: '.openfeel/config.yaml', note: 'backup_failed' });

    const raw = readFileSync(infosPath(), 'utf-8');
    expect(raw).toContain('（原因: backup_failed）');

    const e = loadUpdateInfos()[0];
    expect(e.kind).toBe('anomaly');
    expect(e.note).toBe('backup_failed');
    expect(e.backupRel).toBeNull();
    expect(e.command).toBeNull();
  });

  it('旧格式（仅追加/异常，无尾部段）→ 正常解析，新字段为 null（向后兼容）', () => {
    mkdirSync(join(mockHome.dir, '.openfeel'), { recursive: true });
    writeFileSync(infosPath(), [
      '# OpenFeel 增量更新记录',
      '',
      '## 追加（无标记 → 末尾追加受管区）',
      '- [ ] `/old/appended.md`（2026-01-01T00:00:00.000Z）',
      '',
      '## 异常（标记解析失败 → 未写入，需人工修复标记）',
      '- [x] `old.md (项目: /proj)`（2026-01-02T00:00:00.000Z）',
      '',
    ].join('\n'), 'utf-8');

    const entries = loadUpdateInfos();
    expect(entries).toHaveLength(2);
    expect(entries[0].kind).toBe('appended');
    expect(entries[0].absolutePath).toBe('/old/appended.md');
    expect(entries[0].backupRel).toBeNull();
    expect(entries[0].command).toBeNull();
    expect(entries[0].note).toBeNull();
    expect(entries[1].kind).toBe('anomaly');
    expect(entries[1].resolved).toBe(true);
    expect(entries[1].projectRoot).toBe('/proj');
  });

  it('- [ ]→- [x] 勾选后三类均 resolved=true', () => {
    appendUpdateInfo('appended', { absolutePath: join(mockHome.dir, 'a.md') });
    appendUpdateInfo('anomaly', { absolutePath: join(mockHome.dir, 'b.md') });
    appendUpdateInfo('backed', { absolutePath: join(mockHome.dir, 'c.md'), backupRel: 'global/c.md', command: 'update' });

    const raw = readFileSync(infosPath(), 'utf-8')
      .split('\n')
      .map((l) => (l.startsWith('- [ ]') ? l.replace('- [ ]', '- [x]') : l))
      .join('\n');
    writeFileSync(infosPath(), raw, 'utf-8');

    const entries = loadUpdateInfos();
    expect(entries).toHaveLength(3);
    expect(entries.every((e) => e.resolved)).toBe(true);
  });

  it('三节顺序稳定（appended → anomaly → backed）且 kind 归属正确', () => {
    appendUpdateInfo('backed', { absolutePath: '/c.md', backupRel: 'r', command: 'setup' });
    appendUpdateInfo('anomaly', { absolutePath: '/b.md' });
    appendUpdateInfo('appended', { absolutePath: '/a.md' });

    const raw = readFileSync(infosPath(), 'utf-8');
    expect(raw.indexOf('## 追加')).toBeLessThan(raw.indexOf('## 异常'));
    expect(raw.indexOf('## 异常')).toBeLessThan(raw.indexOf('## 备份'));

    expect(loadUpdateInfos().map((e) => e.kind)).toEqual(['appended', 'anomaly', 'backed']);
  });

  it('backed 不去重：连续两条同路径 backed 均保留', () => {
    appendUpdateInfo('backed', { absolutePath: '/x.md', backupRel: 'r1', command: 'setup' });
    appendUpdateInfo('backed', { absolutePath: '/x.md', backupRel: 'r2', command: 'update' });
    expect(loadUpdateInfos()).toHaveLength(2);
  });

  it('T47：anomaly 同路径二次 append 跳过（不重复累积，REV-1103）', () => {
    appendUpdateInfo('anomaly', { absolutePath: '/same.md' });
    appendUpdateInfo('anomaly', { absolutePath: '/same.md' });
    expect(loadUpdateInfos()).toHaveLength(1);
  });

  it('T47：anomaly 被 resolved 后可再次记录（不永久屏蔽）', () => {
    appendUpdateInfo('anomaly', { absolutePath: '/again.md' });
    resolveUpdateInfo({ absolutePath: '/again.md' });
    appendUpdateInfo('anomaly', { absolutePath: '/again.md' });
    // 旧条已 resolved 不再算重复 → 新增一条，共 2 条
    expect(loadUpdateInfos().filter((e) => e.absolutePath === '/again.md')).toHaveLength(2);
  });

  it('T47：anomaly 项目二元组同路径二次 append 跳过；不同相对路径各自记录', () => {
    const projectRoot = join(mockHome.dir, 'p');
    appendUpdateInfo('anomaly', { projectRoot, relativePath: 'a.md' });
    appendUpdateInfo('anomaly', { projectRoot, relativePath: 'a.md' });
    expect(loadUpdateInfos()).toHaveLength(1);
    appendUpdateInfo('anomaly', { projectRoot, relativePath: 'b.md' });
    expect(loadUpdateInfos()).toHaveLength(2);
  });
});
