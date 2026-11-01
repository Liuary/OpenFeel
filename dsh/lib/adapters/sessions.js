/**
 * 多会话登记（v1.5.8 / REQ-029 P0）— DSH 适配器侧
 *
 * 与 CLI 侧 `src/core/dev/sessions.ts` **共享同一份文件格式与路径**：
 *   `<project>/.openfeel/dev/sessions.json`
 *   `{ schemaVersion: 1, sessions: [{ id, cwd, lastSeen, stage }] }`
 *
 * 职责：每次 feel_* 工具执行时 upsert 一条本会话心跳，使 `feel_status.sessions`
 * 能看见「同一工作树上还有哪些会话在跑」，并让 CLI 的 `autoCommitOnDone`
 * 在检测到并发会话时**跳过自动提交**（防提交污染）。
 *
 * 纪律：
 * - 读写**全部 try/catch 静默**——会话登记是观测手段，绝不得阻断工具主流程；
 * - 会话标识沿用 CLI 的三级链语义（env → 项目续接文件 → 进程兜底），
 *   同一宿主的 env 命中时两侧 id 一致（`env:<value>`）；
 * - 只登记，不做租约：这里没有 TTL / 抢占语义（见研究稿 P1）。
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';

/** 文件 schema 版本（与 CLI 侧一致） */
export const SESSIONS_SCHEMA_VERSION = 1;

/** 存活会话窗口（10 分钟；与 CLI 侧 LIVE_WINDOW_MS 一致） */
export const LIVE_WINDOW_MS = 10 * 60_000;

/** 登记保留时长（24h；超龄条目在下次心跳时清理） */
export const PRUNE_OLDER_THAN_MS = 24 * 60 * 60_000;

/** env 候选（与 CLI 侧 `SESSION_ENV_CANDIDATES` + `OPENFEEL_SESSION_ID` 兜底） */
const SESSION_ENV_CANDIDATES = ['CLAUDE_CODE_SESSION_ID', 'OPENFEEL_SESSION_ID'];

/** 按 projectRoot memoize（同进程内会话标识稳定） */
const cache = new Map();

/**
 * 会话登记文件路径。
 * @param {string} projectRoot
 * @returns {string}
 */
export function sessionsFilePath(projectRoot) {
  return join(projectRoot, '.openfeel', 'dev', 'sessions.json');
}

/**
 * 读取项目续接文件里的 session_id（`.openfeel/tmp/session.json`，CLI 写入）。
 * @param {string} projectRoot
 * @returns {string|null}
 */
function readProjectSessionId(projectRoot) {
  try {
    const raw = JSON.parse(readFileSync(join(projectRoot, '.openfeel', 'tmp', 'session.json'), 'utf-8'));
    const value = typeof raw?.session_id === 'string' ? raw.session_id.trim() : '';
    return value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

/**
 * 解析当前会话标识（env → 项目续接文件 → `proc-<pid>` 兜底；按 projectRoot memoize）。
 * @param {string} projectRoot
 * @returns {string}
 */
export function resolveSessionId(projectRoot) {
  const cached = cache.get(projectRoot);
  if (cached !== undefined) return cached;

  let id = '';
  for (const name of SESSION_ENV_CANDIDATES) {
    const value = String(process.env[name] ?? '').trim();
    if (value !== '') {
      id = `env:${value}`;
      break;
    }
  }
  if (id === '') {
    const projectId = readProjectSessionId(projectRoot);
    id = projectId !== null ? `project:${projectId}` : `proc-${process.pid}`;
  }
  cache.set(projectRoot, id);
  return id;
}

/**
 * 清空会话标识 memo（测试用）。
 */
export function resetSessionIdCache() {
  cache.clear();
}

/**
 * 读会话登记（只读，不建目录、不写盘）。
 * @param {string} projectRoot
 * @returns {Array<{ id: string, cwd: string, lastSeen: string, stage: string|null }>}
 */
export function readSessions(projectRoot) {
  try {
    const parsed = JSON.parse(readFileSync(sessionsFilePath(projectRoot), 'utf-8'));
    const list = Array.isArray(parsed?.sessions) ? parsed.sessions : [];
    return list
      .filter((raw) => raw !== null && typeof raw === 'object')
      .map((raw) => ({
        id: typeof raw.id === 'string' ? raw.id : '',
        cwd: typeof raw.cwd === 'string' ? raw.cwd : '',
        lastSeen: typeof raw.lastSeen === 'string' ? raw.lastSeen : '',
        stage: typeof raw.stage === 'string' ? raw.stage : null,
      }))
      .filter((entry) => entry.id !== '' && Number.isFinite(Date.parse(entry.lastSeen)));
  } catch {
    return [];
  }
}

/**
 * 原子写会话登记（同目录 temp + rename；失败抛出由调用方静默）。
 * @param {string} projectRoot
 * @param {Array<{ id: string, cwd: string, lastSeen: string, stage: string|null }>} sessions
 */
function writeSessions(projectRoot, sessions) {
  const file = sessionsFilePath(projectRoot);
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  writeFileSync(tmp, `${JSON.stringify({ schemaVersion: SESSIONS_SCHEMA_VERSION, sessions }, null, 2)}\n`, 'utf-8');
  renameSync(tmp, file);
}

/**
 * 登记 / 刷新本会话心跳（失败静默）。
 *
 * - 同 id 覆盖 `cwd` / `lastSeen`，其它会话条目原样保留；
 * - 入参 `stage` 为空时**保留**该条目已有的非空阶段（其它工具无快照心跳不抹空阶段信息）；
 * - 顺带清理超龄条目（> 24h），避免文件无界增长。
 *
 * @param {string} projectRoot
 * @param {string|null} [stage] 当前活跃阶段（无 → ''）
 * @param {number} [now] 当前时间（毫秒；注入以便单测）
 */
export function touchSession(projectRoot, stage = '', now = Date.now()) {
  try {
    const id = resolveSessionId(projectRoot);
    const nextStage = typeof stage === 'string' && stage !== '' ? stage : null;
    const current = readSessions(projectRoot);
    const previous = current.find((entry) => entry.id === id);
    const kept = current.filter(
      (entry) => entry.id !== id && now - Date.parse(entry.lastSeen) <= PRUNE_OLDER_THAN_MS,
    );
    kept.push({
      id,
      cwd: projectRoot,
      lastSeen: new Date(now).toISOString(),
      stage: nextStage ?? previous?.stage ?? null,
    });
    writeSessions(projectRoot, kept);
  } catch {
    // 静默：登记失败（权限 / 磁盘 / 竞态）不影响工具主流程
  }
}

/**
 * 存活会话判定（`now - lastSeen <= windowMs`；边界含端点，保守判定）。
 * @param {Array<{ id: string, lastSeen: string }>} sessions
 * @param {number} [now]
 * @param {number} [windowMs]
 * @returns {Array<{ id: string, lastSeen: string }>}
 */
export function liveSessions(sessions, now = Date.now(), windowMs = LIVE_WINDOW_MS) {
  return sessions.filter((entry) => {
    const at = Date.parse(entry.lastSeen);
    return Number.isFinite(at) && now - at <= windowMs;
  });
}

/** 是否存在「除本会话外」的存活会话（只读）。 */
export function hasConcurrentSessions(projectRoot, now = Date.now()) {
  try {
    const self = resolveSessionId(projectRoot);
    return liveSessions(readSessions(projectRoot), now).some((entry) => entry.id !== self);
  } catch {
    return false;
  }
}
