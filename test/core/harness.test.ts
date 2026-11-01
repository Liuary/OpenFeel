/**
 * harness 探测单元测试（v1.5.8 / REQ-024）
 *
 * 隔离硬要求：项目标记建在 mkdtemp 临时项目内；全局标记经 vi.mock('node:os') 的 homedir
 * 指向临时 HOME（与 test/commands/knowledge.test.ts 同写法），不触碰真实用户目录。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const mockHome = vi.hoisted(() => ({ dir: '' }));
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => mockHome.dir };
});

import { detectHarnesses } from '../../src/core/harness.js';

/** 在临时项目内建目录（支持 a/b 多级） */
function mkdirIn(root: string, rel: string): void {
  mkdirSync(join(root, ...rel.split('/')), { recursive: true });
}

describe('detectHarnesses（v1.5.8 / REQ-024）', () => {
  let projDir: string;
  let homeDir: string;

  beforeEach(() => {
    projDir = mkdtempSync(join(tmpdir(), 'openfeel-harness-proj-'));
    homeDir = mkdtempSync(join(tmpdir(), 'openfeel-harness-home-'));
    mockHome.dir = homeDir;
    // 隔离开发机可能存在的 CLAUDE_CONFIG_DIR（空串 → 回落 ~/.claude，与生产分支一致）
    vi.stubEnv('CLAUDE_CONFIG_DIR', '');
  });

  afterEach(() => {
    rmSync(projDir, { recursive: true, force: true });
    rmSync(homeDir, { recursive: true, force: true });
    mockHome.dir = '';
    vi.unstubAllEnvs();
  });

  // ── ① 项目标记 ──

  it('项目三标记齐全 → 固定顺序 dsh / claude / opencode，skillDir 正确', () => {
    mkdirIn(projDir, '.dsh');
    mkdirIn(projDir, '.claude');
    mkdirIn(projDir, '.opencode');

    expect(detectHarnesses(projDir)).toEqual([
      { id: 'dsh', skillDir: '.dsh/skills' },
      { id: 'claude', skillDir: '.claude/skills' },
      { id: 'opencode', skillDir: '.opencode/skills' },
    ]);
  });

  it('项目标记顺序与创建顺序无关（dsh 优先于 claude）', () => {
    mkdirIn(projDir, '.opencode');
    mkdirIn(projDir, '.claude');
    mkdirIn(projDir, '.dsh');

    expect(detectHarnesses(projDir).map((h) => h.id)).toEqual(['dsh', 'claude', 'opencode']);
  });

  it('项目仅 .claude → 只返回 claude；全局标记不再参与', () => {
    mkdirIn(projDir, '.claude');
    // 全局三标记齐全，但项目已声明 → 不得混入
    mkdirIn(homeDir, '.openfeel');
    writeFileSync(join(homeDir, '.openfeel', 'adapter-host-dsh.json'), '{}', 'utf-8');
    mkdirIn(homeDir, '.config/opencode');

    expect(detectHarnesses(projDir)).toEqual([{ id: 'claude', skillDir: '.claude/skills' }]);
  });

  it('项目只有同名文件而非目录 → 不算标记（落到全局/回退）', () => {
    writeFileSync(join(projDir, '.dsh'), 'not a dir', 'utf-8');
    expect(detectHarnesses(projDir).map((h) => h.id)).toEqual(['opencode']);
  });

  // ── ② 全局标记回退 ──

  it('项目无标记 + 全局 dsh 标记 → dsh', () => {
    mkdirIn(homeDir, '.openfeel');
    writeFileSync(join(homeDir, '.openfeel', 'adapter-host-dsh.json'), '{}', 'utf-8');

    expect(detectHarnesses(projDir)).toEqual([{ id: 'dsh', skillDir: '.dsh/skills' }]);
  });

  it('项目无标记 + 全局 claude / opencode → 按 dsh→claude→opencode 保序', () => {
    mkdirIn(homeDir, '.claude');
    mkdirIn(homeDir, '.config/opencode');

    expect(detectHarnesses(projDir)).toEqual([
      { id: 'claude', skillDir: '.claude/skills' },
      { id: 'opencode', skillDir: '.opencode/skills' },
    ]);
  });

  it('项目无标记 + 全局三标记 → 三者全部返回（去重后各一次）', () => {
    mkdirIn(homeDir, '.openfeel');
    writeFileSync(join(homeDir, '.openfeel', 'adapter-host-dsh.json'), '{}', 'utf-8');
    mkdirIn(homeDir, '.claude');
    mkdirIn(homeDir, '.config/opencode');

    const result = detectHarnesses(projDir);
    expect(result.map((h) => h.id)).toEqual(['dsh', 'claude', 'opencode']);
    expect(new Set(result.map((h) => h.id)).size).toBe(result.length);
  });

  it('全局 openfeel 目录存在但缺少 adapter-host-dsh.json → 不算 dsh 标记', () => {
    mkdirIn(homeDir, '.openfeel');
    mkdirIn(homeDir, '.claude');

    expect(detectHarnesses(projDir).map((h) => h.id)).toEqual(['claude']);
  });

  // ── ③ 全无 → 回退 opencode ──

  it('项目与全局均无标记 → 回退 opencode', () => {
    expect(detectHarnesses(projDir)).toEqual([{ id: 'opencode', skillDir: '.opencode/skills' }]);
  });

  it('纯只读：探测不创建任何目录（项目与 HOME 均保持空）', () => {
    detectHarnesses(projDir);
    expect(readdirSync(projDir)).toEqual([]);
    expect(readdirSync(homeDir)).toEqual([]);
    // 回退不落盘，重复探测结果稳定
    expect(detectHarnesses(projDir)).toEqual([{ id: 'opencode', skillDir: '.opencode/skills' }]);
  });
});
