/**
 * 多会话登记单测（v1.5.8 / REQ-029 P0）
 *
 * 覆盖：upsert 幂等（同 id 覆盖、异 id 保留）/ prune 保留窗口 / live 判定窗口边界 /
 *       坏文件降级为空 / shouldAutoCommit 三态（并发 / 无改动 / 无仓库 / ok）。
 * 纪律：所有用例都在 os.tmpdir() 副本上跑；env 显式 stub（执行环境真实存在 CLAUDE_CODE_SESSION_ID）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  LIVE_WINDOW_MS,
  PRUNE_OLDER_THAN_MS,
  SESSIONS_SCHEMA_VERSION,
  liveSessions,
  pruneSessions,
  readSessions,
  sessionsFilePath,
  shouldAutoCommit,
  touchSession,
  upsertSession,
  type SessionEntry,
} from '../../../src/core/dev/sessions.js';
import { resetSessionCache } from '../../../src/core/session.js';

/** 固定基准时刻（避免真实时钟抖动影响窗口边界断言） */
const BASE = Date.parse('2026-01-01T00:00:00.000Z');

/** 构造条目 */
function entry(overrides: Partial<SessionEntry> = {}): SessionEntry {
  return {
    id: 'env:other-session',
    cwd: 'C:/work/proj',
    lastSeen: new Date(BASE).toISOString(),
    stage: 'v1.0.0-stage-01',
    ...overrides,
  };
}

describe('dev/sessions（v1.5.8 / REQ-029 P0）', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-sessions-'));
    resetSessionCache();
    vi.stubEnv('CLAUDE_CODE_SESSION_ID', 'self-session');
    vi.stubEnv('OPENFEEL_SESSION_ID', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetSessionCache();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('文件缺失 → readSessions 降级为空数组（不建目录、不写盘）', () => {
    expect(readSessions(tmpDir)).toEqual([]);
    expect(existsSync(sessionsFilePath(tmpDir))).toBe(false);
    expect(existsSync(join(tmpDir, '.openfeel', 'dev'))).toBe(false);
  });

  it('upsert 落盘 schema 形状：{ schemaVersion, sessions } + 原子写', () => {
    upsertSession(tmpDir, entry({ id: 'env:a' }));
    const raw = JSON.parse(readFileSync(sessionsFilePath(tmpDir), 'utf-8')) as {
      schemaVersion: number;
      sessions: SessionEntry[];
    };
    expect(raw.schemaVersion).toBe(SESSIONS_SCHEMA_VERSION);
    expect(raw.sessions).toHaveLength(1);
    expect(raw.sessions[0]).toEqual(entry({ id: 'env:a' }));
  });

  it('upsert 幂等：同 id 两次 → 单条且 lastSeen/stage 覆盖为新值', () => {
    upsertSession(tmpDir, entry({ id: 'env:a', lastSeen: new Date(BASE).toISOString(), stage: 's-1' }));
    upsertSession(tmpDir, entry({
      id: 'env:a',
      lastSeen: new Date(BASE + 5_000).toISOString(),
      stage: 's-2',
      cwd: 'C:/work/other',
    }));

    const sessions = readSessions(tmpDir);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ id: 'env:a', stage: 's-2', cwd: 'C:/work/other' });
    expect(sessions[0].lastSeen).toBe(new Date(BASE + 5_000).toISOString());
  });

  it('upsert 不误删其它会话条目（多会话共存）', () => {
    upsertSession(tmpDir, entry({ id: 'env:a' }));
    upsertSession(tmpDir, entry({ id: 'env:b' }));
    upsertSession(tmpDir, entry({ id: 'env:a', lastSeen: new Date(BASE + 1_000).toISOString() }));

    const ids = readSessions(tmpDir).map((s) => s.id).sort();
    expect(ids).toEqual(['env:a', 'env:b']);
  });

  it('坏文件 / 非法条目 → 静默降级（合法条目仍读出）', () => {
    mkdirSync(join(tmpDir, '.openfeel', 'dev'), { recursive: true });
    writeFileSync(sessionsFilePath(tmpDir), '{ not json', 'utf-8');
    expect(readSessions(tmpDir)).toEqual([]);

    writeFileSync(
      sessionsFilePath(tmpDir),
      JSON.stringify({
        schemaVersion: 1,
        sessions: [
          { id: '', cwd: 'x', lastSeen: new Date(BASE).toISOString(), stage: null },       // 空 id → 丢弃
          { id: 'env:bad', cwd: 'x', lastSeen: 'not-a-date', stage: null },                  // 时间非法 → 丢弃
          { id: 'env:ok', cwd: 'x', lastSeen: new Date(BASE).toISOString() },                // 合法（stage 缺失 → null）
        ],
      }),
      'utf-8',
    );
    const sessions = readSessions(tmpDir);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ id: 'env:ok', stage: null });
  });

  it('pruneSessions 只清理超龄条目并返回清理数', () => {
    const now = BASE + 30 * 60 * 60_000; // 30h 后
    upsertSession(tmpDir, entry({ id: 'env:old', lastSeen: new Date(BASE).toISOString() }));            // 30h 前
    upsertSession(tmpDir, entry({ id: 'env:fresh', lastSeen: new Date(now - 60_000).toISOString() })); // 1min 前

    expect(pruneSessions(tmpDir, PRUNE_OLDER_THAN_MS, now)).toBe(1);
    expect(readSessions(tmpDir).map((s) => s.id)).toEqual(['env:fresh']);
    // 幂等：再跑一次不再清理
    expect(pruneSessions(tmpDir, PRUNE_OLDER_THAN_MS, now)).toBe(0);
  });

  it('liveSessions：窗口边界含端点（恰好 10 分钟 → 存活；多 1ms → 非存活）', () => {
    const at = new Date(BASE).toISOString();
    const sessions = [entry({ id: 'env:a', lastSeen: at }), entry({ id: 'env:b', lastSeen: at })];

    const exactly = liveSessions(sessions, BASE + LIVE_WINDOW_MS);
    expect(exactly.map((s) => s.id)).toEqual(['env:a', 'env:b']);

    const over = liveSessions(sessions, BASE + LIVE_WINDOW_MS + 1);
    expect(over).toEqual([]);

    // 未来时间戳（时钟回拨）按存活处理
    const future = liveSessions(sessions, BASE - 60_000);
    expect(future).toHaveLength(2);
  });

  it('liveSessions：时间不可解析的条目视为非存活', () => {
    expect(liveSessions([entry({ lastSeen: 'garbage' })], BASE)).toEqual([]);
  });

  it('touchSession 复用 getSessionId（env 命中 → env:<value>）并记录 stage', () => {
    touchSession(tmpDir, 'v1.0.0-stage-07');

    const sessions = readSessions(tmpDir);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe('env:self-session');
    expect(sessions[0].stage).toBe('v1.0.0-stage-07');
    expect(sessions[0].cwd).toBe(tmpDir);
    expect(Number.isFinite(Date.parse(sessions[0].lastSeen))).toBe(true);
  });

  describe('shouldAutoCommit 三态', () => {
    it('无其它会话 + 探针乐观 → ok（allowed=true）', () => {
      const decision = shouldAutoCommit(tmpDir, 'env:self-session', BASE);
      expect(decision).toEqual({ allowed: true, reason: 'ok', liveSessions: [] });
    });

    it('存在其它存活会话 → concurrent-sessions（allowed=false 且列出对端 id）', () => {
      upsertSession(tmpDir, entry({ id: 'env:other-session', lastSeen: new Date(BASE - 60_000).toISOString() }));
      // 自身条目不应被算作「并发」
      upsertSession(tmpDir, entry({ id: 'env:self-session', lastSeen: new Date(BASE - 60_000).toISOString() }));

      const decision = shouldAutoCommit(tmpDir, 'env:self-session', BASE);
      expect(decision.reason).toBe('concurrent-sessions');
      expect(decision.allowed).toBe(false);
      expect(decision.liveSessions).toEqual(['env:other-session']);
    });

    it('并发判定的短路优先：命中并发时不调用 git 探针', () => {
      upsertSession(tmpDir, entry({ id: 'env:other-session', lastSeen: new Date(BASE).toISOString() }));
      const inRepo = vi.fn(() => true);
      const hasChanges = vi.fn(() => true);

      const decision = shouldAutoCommit(tmpDir, 'env:self-session', BASE, { inRepo, hasChanges });
      expect(decision.reason).toBe('concurrent-sessions');
      expect(inRepo).not.toHaveBeenCalled();
      expect(hasChanges).not.toHaveBeenCalled();
    });

    it('其它会话已超窗（> 10 分钟）→ 不视为并发', () => {
      upsertSession(tmpDir, entry({ id: 'env:other-session', lastSeen: new Date(BASE - LIVE_WINDOW_MS - 1).toISOString() }));
      expect(shouldAutoCommit(tmpDir, 'env:self-session', BASE).reason).toBe('ok');
    });

    it('探针 inRepo=false → no-repo', () => {
      const decision = shouldAutoCommit(tmpDir, 'env:self-session', BASE, { inRepo: () => false });
      expect(decision).toEqual({ allowed: false, reason: 'no-repo', liveSessions: [] });
    });

    it('探针 hasChanges=false → no-changes', () => {
      const decision = shouldAutoCommit(tmpDir, 'env:self-session', BASE, {
        inRepo: () => true,
        hasChanges: () => false,
      });
      expect(decision).toEqual({ allowed: false, reason: 'no-changes', liveSessions: [] });
    });
  });
});
