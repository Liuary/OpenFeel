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
import { existsSync, readFileSync, mkdirSync, rmSync, mkdtempSync } from 'node:fs';
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
});
