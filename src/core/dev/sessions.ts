/**
 * 多会话登记（v1.5.8 / REQ-029 P0）
 *
 * 目的：让「同时有几个会话在写同一个工作树」变得**可观测**，并据此保护自动提交，
 * 避免一个会话的阶段 done 把另一个会话的未完成改动一起扫进归档 commit
 * （见 docs/research/multi-session-convergence.md 事故 #1）。
 *
 * 文件：`.openfeel/dev/sessions.json`（与 `.sync.json` 同目录；**运行时状态**，.gitignore 忽略）
 * schema：`{ schemaVersion: 1, sessions: [{ id, cwd, lastSeen, stage }] }`
 *
 * 设计边界：
 * - **全部 IO try/catch 静默**：会话登记是观测手段，任何失败都不得中断 CLI（best-effort）。
 * - **单一会话标识来源**：复用 `src/core/session.ts` 的 `getSessionId()`（env / project / proc 三级链），
 *   本模块**不新造第二套会话解析**。
 * - **判定函数纯**：`shouldAutoCommit` 不执行任何 git / 子进程调用（git 探针由调用方注入），
 *   `now` 可注入 ⇒ vitest 无 git / 无 TTY 时仍可判定。
 * - **不 import flow-manager**（flow-manager 是本模块消费方，防 import 环）。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { atomicWriteFileSync } from '../fs/atomic-write.js';
import { withFileLock, projectLockPath } from '../fs/file-lock.js';
import { getSessionId } from '../session.js';

/** 会话登记文件 schema 版本（当前唯一合法值） */
export const SESSIONS_SCHEMA_VERSION = 1;

/** 「存活会话」窗口（10 分钟；与 Feel 的「先读后写」窗口同量级） */
export const LIVE_WINDOW_MS = 10 * 60_000;

/** 登记条目保留时长（24h；超过即视为已离开的会话，可清理） */
export const PRUNE_OLDER_THAN_MS = 24 * 60 * 60_000;

/** 会话登记条目 */
export interface SessionEntry {
  /** 会话标识（复用 `getSessionId()`；含 `env:` / `project:` / `proc:` 来源前缀） */
  id: string;
  /** 会话所在工作目录（项目根或子目录） */
  cwd: string;
  /** 最近一次心跳时间（ISO 8601） */
  lastSeen: string;
  /** 该会话最近一次记录的活跃阶段（无则为 null / 空串） */
  stage: string | null;
}

/** 会话登记文件结构 */
export interface SessionsFile {
  schemaVersion: typeof SESSIONS_SCHEMA_VERSION;
  sessions: SessionEntry[];
}

/** 自动提交决策原因（`ok` = 可提交） */
export type AutoCommitReason = 'ok' | 'concurrent-sessions' | 'no-repo' | 'no-changes';

/** 自动提交决策 */
export interface AutoCommitDecision {
  /** 是否可执行自动提交（仅 `reason === 'ok'` 时为 true） */
  allowed: boolean;
  /** 决策原因 */
  reason: AutoCommitReason;
  /** 除本会话外的存活会话 id（空集 = 无并发） */
  liveSessions: string[];
}

/**
 * git 状态探针（**注入**，使决策函数保持纯函数）。
 *
 * 缺省 = 乐观假定（在仓库内 / 有改动）⇒ 未注入时 `shouldAutoCommit` 只按会话并发判定，
 * 真实 git 探测由调用方（FlowManager.autoCommitOnDone）提供。
 */
export interface AutoCommitProbe {
  /** 是否位于 git 工作树；缺省 → true（乐观） */
  inRepo?: () => boolean;
  /** 工作树是否有改动；缺省 → true（乐观） */
  hasChanges?: () => boolean;
}

/** 会话登记文件绝对路径 */
export function sessionsFilePath(projectPath: string): string {
  return join(projectPath, '.openfeel', 'dev', 'sessions.json');
}

/** 会话登记锁（跨进程读改写互斥；`sessions` 名与 .sync.json 无冲突） */
function sessionsLockPath(projectPath: string): string {
  return projectLockPath(projectPath, 'dev-sessions');
}

/** 单条条目规范化（非法字段降级；`stage` 非字符串 → null） */
function normalizeEntry(raw: unknown): SessionEntry | null {
  if (raw === null || typeof raw !== 'object') {
    return null;
  }
  const obj = raw as Record<string, unknown>;
  const id = typeof obj.id === 'string' ? obj.id.trim() : '';
  const lastSeen = typeof obj.lastSeen === 'string' ? obj.lastSeen.trim() : '';
  // id / lastSeen 是判定存活的必需字段：缺失或不可解析 → 丢弃（不臆造时间）
  if (id === '' || !Number.isFinite(Date.parse(lastSeen))) {
    return null;
  }
  return {
    id,
    cwd: typeof obj.cwd === 'string' ? obj.cwd : '',
    lastSeen,
    stage: typeof obj.stage === 'string' ? obj.stage : null,
  };
}

/**
 * 读取会话登记（**只读**，不建目录、不写盘）。
 * @param projectPath 项目根（`.openfeel/` 所在目录）
 * @returns 条目数组；文件缺失 / JSON 损坏 / 字段非法 → 降级为空数组（静默）
 */
export function readSessions(projectPath: string): SessionEntry[] {
  try {
    const raw = readFileSync(sessionsFilePath(projectPath), 'utf-8');
    const parsed = JSON.parse(raw) as { sessions?: unknown };
    const list = Array.isArray(parsed?.sessions) ? parsed.sessions : [];
    return list.map(normalizeEntry).filter((s): s is SessionEntry => s !== null);
  } catch {
    // 文件缺失 / JSON 损坏 / 读取失败 → 空集（调用方按「无并发」处理）
    return [];
  }
}

/**
 * 写入会话登记（原子写 + 文件锁；失败抛错由调用方决定是否静默）。
 * @param projectPath 项目根
 * @param sessions 条目数组（整份覆盖）
 */
function writeSessionsFile(projectPath: string, sessions: SessionEntry[]): void {
  const file: SessionsFile = { schemaVersion: SESSIONS_SCHEMA_VERSION, sessions };
  atomicWriteFileSync(sessionsFilePath(projectPath), JSON.stringify(file, null, 2) + '\n');
}

/**
 * 登记 / 刷新一条会话心跳。
 *
 * 语义：**同 id 覆盖** `lastSeen` / `cwd` / `stage`，其它会话条目原样保留（不误删他人）；
 * 文件缺失时创建。任何失败（锁超时 / 权限 / 磁盘）静默——绝不阻断主流程。
 * @param projectPath 项目根
 * @param entry 会话条目
 */
export function upsertSession(projectPath: string, entry: SessionEntry): void {
  try {
    withFileLock(sessionsLockPath(projectPath), () => {
      const next = readSessions(projectPath).filter((s) => s.id !== entry.id);
      next.push({ ...entry, stage: entry.stage ?? null });
      writeSessionsFile(projectPath, next);
    });
  } catch {
    // 静默降级：登记失败不影响任何业务流程
  }
}

/**
 * 清理超过保留时长的登记条目。
 *
 * 时间不可判定的条目已被 `readSessions` 过滤，故此处只需按年龄过滤。
 * @param projectPath 项目根
 * @param olderThanMs 保留时长（默认 24h）
 * @param now 当前时间（注入以便单测）
 * @returns 被清理的条目数（失败 → 0）
 */
export function pruneSessions(
  projectPath: string,
  olderThanMs: number = PRUNE_OLDER_THAN_MS,
  now: number = Date.now(),
): number {
  try {
    return withFileLock(sessionsLockPath(projectPath), () => {
      const before = readSessions(projectPath);
      const kept = before.filter((s) => now - Date.parse(s.lastSeen) <= olderThanMs);
      const removed = before.length - kept.length;
      if (removed > 0) {
        writeSessionsFile(projectPath, kept);
      }
      return removed;
    });
  } catch {
    return 0;
  }
}

/**
 * 筛选存活会话（`now - lastSeen <= windowMs`）。
 *
 * 边界：**恰好等于窗口**视为存活（含端点，保守判定——宁可多报并发也不误放自动提交）；
 * 时钟回拨产生的未来时间戳同样按存活处理。
 * @param sessions 条目数组
 * @param now 当前毫秒时间戳（默认 Date.now()）
 * @param windowMs 存活窗口（默认 10 分钟）
 */
export function liveSessions(
  sessions: SessionEntry[],
  now: number = Date.now(),
  windowMs: number = LIVE_WINDOW_MS,
): SessionEntry[] {
  return sessions.filter((s) => {
    const at = Date.parse(s.lastSeen);
    if (!Number.isFinite(at)) {
      return false;
    }
    return now - at <= windowMs;
  });
}

/**
 * 自动提交决策（**纯函数**：不执行任何 git / 子进程调用）。
 *
 * 判定顺序（短路）：
 * 1. 存在**其它**存活会话 → `concurrent-sessions`（拒绝，调用方**不得**执行 `git add -A`）；
 * 2. 不在 git 工作树（探针 `inRepo`）→ `no-repo`；
 * 3. 工作树无改动（探针 `hasChanges`）→ `no-changes`；
 * 4. 其余 → `ok`。
 *
 * @param projectPath 项目根
 * @param sessionId 本会话标识（用于排除自身）
 * @param now 当前毫秒时间戳（注入以便单测）
 * @param probe git 状态探针（缺省乐观：视为在仓库内且有改动）
 * @returns 决策结果（含其它存活会话 id 列表）
 */
export function shouldAutoCommit(
  projectPath: string,
  sessionId: string,
  now: number = Date.now(),
  probe: AutoCommitProbe = {},
): AutoCommitDecision {
  const live = liveSessions(readSessions(projectPath), now)
    .filter((s) => s.id !== sessionId)
    .map((s) => s.id);
  if (live.length > 0) {
    return { allowed: false, reason: 'concurrent-sessions', liveSessions: live };
  }
  const inRepo = probe.inRepo ?? (() => true);
  if (!inRepo()) {
    return { allowed: false, reason: 'no-repo', liveSessions: live };
  }
  const hasChanges = probe.hasChanges ?? (() => true);
  if (!hasChanges()) {
    return { allowed: false, reason: 'no-changes', liveSessions: live };
  }
  return { allowed: true, reason: 'ok', liveSessions: live };
}

/**
 * 便捷入口：登记本会话心跳（`id` 复用 `getSessionId()`；失败静默）。
 * @param projectPath 项目根
 * @param stage 当前活跃阶段（无 → null）
 * @param cwd 会话工作目录（默认 = projectPath）
 */
export function touchSession(projectPath: string, stage: string | null = null, cwd?: string): void {
  try {
    upsertSession(projectPath, {
      id: getSessionId({ projectPath }),
      cwd: cwd ?? projectPath,
      lastSeen: new Date().toISOString(),
      stage: stage ?? null,
    });
  } catch {
    // 静默：登记失败不影响调用方
  }
}
