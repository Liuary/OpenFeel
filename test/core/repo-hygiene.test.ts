/**
 * 仓库卫生（v1.5.23 / REQ-041）测试
 *
 * 覆盖：.gitignore 补条目（幂等、不重排既有内容）；已跟踪运行态文件的列出与
 * 索引移除（保留工作区文件）；非 git 仓库降级。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  RUNTIME_STATE_ENTRIES,
  ensureRuntimeIgnoreEntries,
  isGitRepository,
  listTrackedRuntimeFiles,
  untrackRuntimeFiles,
} from '../../src/core/repo-hygiene.js';

describe('repo-hygiene（v1.5.23 / REQ-041）', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'openfeel-hygiene-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function gitInit(): void {
    execFileSync('git', ['init', '-q'], { cwd: dir, stdio: 'ignore' });
  }

  function seedRuntimeFiles(): void {
    mkdirSync(join(dir, '.openfeel', 'dev'), { recursive: true });
    mkdirSync(join(dir, '.openfeel', 'log'), { recursive: true });
    for (const entry of RUNTIME_STATE_ENTRIES) {
      writeFileSync(join(dir, entry), '{}\n', 'utf-8');
    }
  }

  it('ensureRuntimeIgnoreEntries：文件不存在时新建并写入全部条目', () => {
    const result = ensureRuntimeIgnoreEntries(dir);
    expect(result.added).toEqual([...RUNTIME_STATE_ENTRIES]);
    const content = readFileSync(join(dir, '.gitignore'), 'utf-8');
    for (const entry of RUNTIME_STATE_ENTRIES) {
      expect(content.split(/\r?\n/)).toContain(entry);
    }
  });

  it('ensureRuntimeIgnoreEntries：幂等（第二次零新增），且不重排既有内容', () => {
    writeFileSync(join(dir, '.gitignore'), 'node_modules/\n# 手写规则\n.openfeel/dev/sessions.json\n', 'utf-8');
    const first = ensureRuntimeIgnoreEntries(dir);
    expect(first.added).not.toContain('.openfeel/dev/sessions.json');
    expect(first.added).toContain('.openfeel/dev/.sync.json');
    const after = readFileSync(join(dir, '.gitignore'), 'utf-8');
    expect(after.startsWith('node_modules/\n# 手写规则\n')).toBe(true);
    expect(ensureRuntimeIgnoreEntries(dir).added).toEqual([]);
    expect(readFileSync(join(dir, '.gitignore'), 'utf-8')).toBe(after);
  });

  it('listTrackedRuntimeFiles / untrackRuntimeFiles：移出索引但保留工作区文件', () => {
    gitInit();
    seedRuntimeFiles();
    expect(isGitRepository(dir)).toBe(true);
    execFileSync('git', ['add', '-A'], { cwd: dir, stdio: 'ignore' });
    expect(listTrackedRuntimeFiles(dir).sort()).toEqual([...RUNTIME_STATE_ENTRIES].sort());

    const dry = untrackRuntimeFiles(dir, { dryRun: true });
    expect(dry.dryRun).toBe(true);
    expect(dry.applied).toBe(false);
    expect(listTrackedRuntimeFiles(dir).length).toBe(RUNTIME_STATE_ENTRIES.length);

    const real = untrackRuntimeFiles(dir);
    expect(real.applied).toBe(true);
    expect(listTrackedRuntimeFiles(dir)).toEqual([]);
    // 工作区文件必须还在（--cached 不删文件）
    for (const entry of RUNTIME_STATE_ENTRIES) {
      expect(existsSync(join(dir, entry))).toBe(true);
    }
    // 幂等：再跑一次无事发生
    expect(untrackRuntimeFiles(dir).files).toEqual([]);
  });

  it('非 git 仓库：isGitRepository=false，索引接口降级为空', () => {
    seedRuntimeFiles();
    expect(isGitRepository(dir)).toBe(false);
    expect(listTrackedRuntimeFiles(dir)).toEqual([]);
    expect(untrackRuntimeFiles(dir).files).toEqual([]);
  });
});
