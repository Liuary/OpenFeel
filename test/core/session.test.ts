/**
 * session 三级链单测（v1.2.1-stage-86 op-002 · T2）
 * 覆盖：env 命中 + 续接文件 / env 空值回落 / project 级复用 / proc 兜底不落盘 /
 *       memoize / resetSessionCache / 续接文件损坏容错。
 * 环境解耦硬要求：显式 vi.stubEnv 控制候选变量（执行环境真实存在 CLAUDE_CODE_SESSION_ID）；afterEach 归位。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getSessionIdentity, getSessionId, resetSessionCache } from '../../src/core/session.js';

describe('session 三级链（stage-86 op-002）', () => {
  let tmpDir: string;
  const sessionFile = (): string => join(tmpDir, '.openfeel', 'tmp', 'session.json');

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-session-'));
    resetSessionCache();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetSessionCache();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('① env 命中 → env: 前缀 + 续接文件生成（session_id/source/started_at）', () => {
    vi.stubEnv('CLAUDE_CODE_SESSION_ID', 'test-env-id');
    const identity = getSessionIdentity({ projectPath: tmpDir });

    expect(identity).toEqual({ id: 'env:test-env-id', source: 'env' });
    expect(getSessionId({ projectPath: tmpDir })).toBe('env:test-env-id');

    expect(existsSync(sessionFile())).toBe(true);
    const obj = JSON.parse(readFileSync(sessionFile(), 'utf-8')) as {
      session_id: string; source: string; started_at: string;
    };
    expect(obj.session_id).toBe('test-env-id');
    expect(obj.source).toBe('env');
    expect(Number.isNaN(Date.parse(obj.started_at))).toBe(false);
  });

  it('② env 空串 / 纯空白 → 未命中（回落下一级）', () => {
    vi.stubEnv('CLAUDE_CODE_SESSION_ID', '   ');
    expect(getSessionIdentity({ projectPath: tmpDir }).source).toBe('proc');

    vi.unstubAllEnvs();
    resetSessionCache();
    vi.stubEnv('CLAUDE_CODE_SESSION_ID', '');
    expect(getSessionIdentity({ projectPath: tmpDir }).source).toBe('proc');
    // 未命中 env 时不得写续接文件（proc 级不落盘）
    expect(existsSync(sessionFile())).toBe(false);
  });

  it('③ env 未命中 + 续接文件存在 → project: 前缀（复用）', () => {
    vi.stubEnv('CLAUDE_CODE_SESSION_ID', '');
    mkdirSync(join(tmpDir, '.openfeel', 'tmp'), { recursive: true });
    writeFileSync(
      sessionFile(),
      JSON.stringify({ session_id: 'carried-id', source: 'env', started_at: '2026-01-01T00:00:00.000Z' }),
      'utf-8',
    );

    expect(getSessionIdentity({ projectPath: tmpDir })).toEqual({ id: 'project:carried-id', source: 'project' });
  });

  it('④ 全无 → proc: 前缀 8 位 + 不写文件', () => {
    vi.stubEnv('CLAUDE_CODE_SESSION_ID', '');
    const identity = getSessionIdentity({ projectPath: tmpDir });

    expect(identity.source).toBe('proc');
    expect(identity.id).toMatch(/^proc:[0-9a-f]{8}$/);
    expect(existsSync(sessionFile())).toBe(false);
  });

  it('⑤ memoize：同 projectPath 两次调用返回同值（env 变更不重算）', () => {
    vi.stubEnv('CLAUDE_CODE_SESSION_ID', 'memo-id');
    const a = getSessionIdentity({ projectPath: tmpDir });

    vi.stubEnv('CLAUDE_CODE_SESSION_ID', 'other-id');
    const b = getSessionIdentity({ projectPath: tmpDir });

    expect(b).toBe(a);
    expect(b.id).toBe('env:memo-id');
  });

  it('⑥ resetSessionCache() 后重算（新 env 值生效）', () => {
    vi.stubEnv('CLAUDE_CODE_SESSION_ID', 'first-id');
    expect(getSessionIdentity({ projectPath: tmpDir }).id).toBe('env:first-id');

    vi.stubEnv('CLAUDE_CODE_SESSION_ID', 'second-id');
    resetSessionCache();
    expect(getSessionIdentity({ projectPath: tmpDir }).id).toBe('env:second-id');
  });

  it('⑦ 续接文件损坏 / session_id 空 → 不命中 project（回落 proc）', () => {
    vi.stubEnv('CLAUDE_CODE_SESSION_ID', '');
    mkdirSync(join(tmpDir, '.openfeel', 'tmp'), { recursive: true });
    writeFileSync(sessionFile(), '{ not json', 'utf-8');
    expect(getSessionIdentity({ projectPath: tmpDir }).source).toBe('proc');

    resetSessionCache();
    writeFileSync(sessionFile(), JSON.stringify({ session_id: '   ' }), 'utf-8');
    expect(getSessionIdentity({ projectPath: tmpDir }).source).toBe('proc');
  });
});
