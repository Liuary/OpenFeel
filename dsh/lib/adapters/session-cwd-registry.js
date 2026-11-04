/**
 * 会话 → 工作区 cwd 登记表（v1.5.11 D-126-01 / P1-4）
 *
 * 目的：给写入门禁的 cwd 解析链补上第 3 环。**只按 `sessionId` 存**，
 * 不存任何「进程级最近一次 cwd」（`registry-last`）：后者在多窗口/多项目时
 * 会跨项目串味——窗口 A 在 P1（`exec_running`）登记过，窗口 B 在 P2
 * （`review_pending`）拿不到 cwd 时就会用 P1 的 cwd 去判 B 的写入，
 * 等于「按别的项目放行」，比静默放行更危险（plan §D-126-01 P1-4）。
 *
 * 纪律：
 * - 纯内存、零依赖、全 try/catch —— 登记失败绝不影响工具/提示主流程；
 * - 上限 64，LRU 淘汰（`get` 也算一次使用）；
 * - 只有 `sessionId` 与 `cwd` 都非空才写入（写入点不产生误记）。
 *
 * @module openfeel-dsh/session-cwd-registry
 */

/** 登记上限（LRU）。 */
export const CWD_REGISTRY_LIMIT = 64;

/** @type {Map<string, { cwd: string, at: number }>} */
const registry = new Map();

/**
 * 登记 / 刷新某会话的工作区。
 * @param {unknown} sessionId
 * @param {unknown} cwd
 * @returns {void}
 */
export function touchSession(sessionId, cwd) {
  try {
    if (typeof sessionId !== 'string' || sessionId.trim() === '') return;
    if (typeof cwd !== 'string' || cwd.trim() === '') return;
    const key = sessionId.trim();
    // 重新插入以刷新 LRU 顺序
    registry.delete(key);
    registry.set(key, { cwd: cwd.trim(), at: Date.now() });
    while (registry.size > CWD_REGISTRY_LIMIT) {
      const oldest = registry.keys().next().value;
      if (oldest === undefined) break;
      registry.delete(oldest);
    }
  } catch {
    /* 登记是观测手段，失败不影响主流程 */
  }
}

/**
 * 读取某会话登记的工作区（命中即刷新 LRU 顺序）。
 * @param {unknown} sessionId
 * @returns {string | null}
 */
export function getSessionCwd(sessionId) {
  try {
    if (typeof sessionId !== 'string' || sessionId.trim() === '') return null;
    const key = sessionId.trim();
    const entry = registry.get(key);
    if (entry === undefined) return null;
    registry.delete(key);
    registry.set(key, entry);
    return entry.cwd;
  } catch {
    return null;
  }
}

/**
 * 当前登记的会话数（测试/诊断用）。
 * @returns {number}
 */
export function cwdRegistrySize() {
  return registry.size;
}

/** 清空登记表（测试用）。 */
export function resetCwdRegistry() {
  registry.clear();
}

/* 与 plan §3.3 的命名对齐（两种名字同义，避免各调用点各写一套）。 */
export const recordSessionCwd = touchSession;
export const lookupSessionCwd = getSessionCwd;
