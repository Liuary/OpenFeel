/**
 * update-state 单元测试（stage-39 / op-002）
 * 覆盖旧格式（含 .opencode/... 旧框架 key）加载不丢记录，以及 isLegacyFrameworkKey 识别。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isLegacyFrameworkKey, loadUpdateState, saveUpdateState } from '../../src/core/update-state.js';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/** 写入项目 update_state.json（自动建 .openfeel 目录） */
function writeState(projectPath: string, files: Record<string, { hash: string; status: 'clean' | 'conflict' }>): void {
  mkdirSync(join(projectPath, '.openfeel'), { recursive: true });
  writeFileSync(
    join(projectPath, '.openfeel', 'update_state.json'),
    JSON.stringify({ version: '1.0', last_update: '2020-01-01T00:00:00.000Z', openfeel_version: '1.0.0', files }, null, 2) + '\n',
    'utf-8',
  );
}

describe('isLegacyFrameworkKey', () => {
  it('.opencode/ 前缀（含 Windows 反斜杠）返回 true', () => {
    expect(isLegacyFrameworkKey('.opencode/agents/planner.md')).toBe(true);
    expect(isLegacyFrameworkKey('.opencode\\agents\\planner.md')).toBe(true);
    expect(isLegacyFrameworkKey('.opencode/skills/check-kb/SKILL.md')).toBe(true);
    expect(isLegacyFrameworkKey('.opencode/instructions/core.md')).toBe(true);
  });

  it('项目资产 key / 绝对路径返回 false', () => {
    expect(isLegacyFrameworkKey('AGENTS.md')).toBe(false);
    expect(isLegacyFrameworkKey('opencode.jsonc')).toBe(false);
    expect(isLegacyFrameworkKey('/abs/path/to/file')).toBe(false);
    expect(isLegacyFrameworkKey('C:\\Users\\x\\.config\\opencode\\agents\\feel.md')).toBe(false);
    expect(isLegacyFrameworkKey('')).toBe(false);
  });
});

describe('loadUpdateState 旧格式降级', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-update-state-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('含 .opencode/... 旧框架 key 的 state 返回非 null，键集完整不丢记录（REV-1202）', () => {
    writeState(tmpDir, {
      '.opencode/agents/planner.md': { hash: 'h1', status: 'clean' },
      '.opencode/skills/check-kb/SKILL.md': { hash: 'h2', status: 'clean' },
      '.opencode/instructions/core.md': { hash: 'h3', status: 'clean' },
      'AGENTS.md': { hash: 'h4', status: 'clean' },
    });
    const state = loadUpdateState(tmpDir);
    expect(state).not.toBeNull();
    expect(Object.keys(state!.files).sort()).toEqual([
      '.opencode/agents/planner.md',
      '.opencode/instructions/core.md',
      '.opencode/skills/check-kb/SKILL.md',
      'AGENTS.md',
    ]);
  });

  it('不存在 → null；saveUpdateState 往返保持 files', () => {
    expect(loadUpdateState(tmpDir)).toBeNull();
    saveUpdateState(tmpDir, {
      version: '1.0',
      last_update: '2020-01-01T00:00:00.000Z',
      openfeel_version: '1.0.0',
      files: { 'AGENTS.md': { hash: 'h', status: 'clean' } },
    });
    const roundTrip = loadUpdateState(tmpDir);
    expect(roundTrip!.files['AGENTS.md']).toEqual({ hash: 'h', status: 'clean' });
  });
});
