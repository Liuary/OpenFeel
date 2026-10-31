/**
 * 观测摘要（v1.5.6-stage-116，适配器侧只读）
 *
 * 把已由顶层字段暴露的三项事实组合成一段摘要：`preflight` 年龄 / `statusSync.due` / `stale`。
 * **纯函数：零 I/O、零副作用、绝不抛**。
 *
 * 硬约束（计划 §3.1 / INV-8）：
 * - `preflightAgeMs` / `preflightOk` **只复制**顶层 `preflight` 的同名字段，**禁止重算阈值**
 *   （`readPreflightInfo` 已用核心的 `PREFLIGHT_MAX_AGE_MS` 判定；JS 侧重算 10 分钟必然漂移）；
 * - `statusSync` **原样三键**（`due` / `lastSync` / `intervalMinutes`），不可用时为 `null`；
 * - **不复制对象**：本模块输出内**不得**出现嵌套 `preflight`；
 * - 顶层 `observability` 恒为对象（调用点在异常时另给完整降级对象，见 `tools/index.js`）。
 *
 * ⚠ REV-022：本模块不读盘；读取次序（`readPreflightInfo` 必须早于 `readSnapshot`）由调用点保证。
 */

/** 摘要文案里的时长格式（**仅展示**，不参与任何阈值判定）。 */
export function formatAge(ms) {
  const safe = typeof ms === 'number' && Number.isFinite(ms) ? ms : 0;
  const totalSec = Math.floor(Math.max(0, safe) / 1000);
  const s = totalSec % 60;
  const m = Math.floor((totalSec % 3600) / 60);
  const h = Math.floor((totalSec % 86400) / 3600);
  const d = Math.floor(totalSec / 86400);
  if (totalSec < 60) return `${s}s`;
  if (totalSec < 3600) return s === 0 ? `${m}m` : `${m}m ${s}s`;
  if (totalSec < 86400) return m === 0 ? `${h}h` : `${h}h ${m}m`;
  return `${d}d ${h}h`;
}

/**
 * 组合观测摘要。
 * @param {object} [input]
 * @param {{ ok?: boolean, ageMs?: number|null }|null} [input.preflight] 顶层 `preflight`（readPreflightInfo 结果）
 * @param {{ due?: boolean, lastSync?: string|null, intervalMinutes?: number }|null} [input.statusSync] 顶层 `statusSync`
 * @param {boolean} [input.stale] 顶层 `stale`
 * @returns {{ schemaVersion: number, stale: boolean, preflightAgeMs: number|null, preflightOk: boolean, statusSync: { due: boolean, lastSync: string|null, intervalMinutes: number }|null, summary: string }}
 */
export function buildObservability({ preflight, statusSync, stale } = {}) {
  // stale 缺失 → false（不谎报降级）
  const staleFlag = stale === true;

  // 只复制，不重算（INV-8）
  const preflightAgeMs = preflight && typeof preflight.ageMs === 'number' ? preflight.ageMs : null;
  const preflightOk = preflight !== null && typeof preflight === 'object' && preflight.ok === true;
  // `readPreflightInfo` 的两种「无年龄」形态必须区分（REV-024）：
  //   at === null  ⇒ 账本缺失 / `at` 非字符串 ⇒ 从未读过状态
  //   at 非空      ⇒ 账本存在但时间戳不可解析   ⇒ 账本损坏（异常类别，不能并进「无记录」）
  const preflightAt = preflight !== null && typeof preflight === 'object' && typeof preflight.at === 'string'
    ? preflight.at
    : null;

  // statusSync 三键原样（校验齐全才复制，否则降级为 null）
  let sync = null;
  if (
    statusSync !== null
    && typeof statusSync === 'object'
    && typeof statusSync.due === 'boolean'
    && typeof statusSync.intervalMinutes === 'number'
    && (statusSync.lastSync === null || typeof statusSync.lastSync === 'string')
  ) {
    sync = {
      due: statusSync.due,
      lastSync: statusSync.lastSync,
      intervalMinutes: statusSync.intervalMinutes,
    };
  }

  let preflightPart;
  if (preflightAgeMs === null && preflightAt === null) {
    preflightPart = 'preflight 无记录（未调用过 flow next / flow status）';
  } else if (preflightAgeMs === null) {
    // 与 CLI 侧 `describePreflight` 的四态对齐：at 有值但不可解析 ⇒ 单独一档
    preflightPart = `preflight 时间戳不可解析（${preflightAt}）`;
  } else {
    preflightPart = `preflight ${formatAge(preflightAgeMs)} 前（${preflightOk ? '有效' : '已过期'}）`;
  }
  const syncPart = sync === null ? '状态同步: 不可用' : (sync.due ? '状态记录已到期' : '状态记录有效');
  const stalePart = staleFlag ? '快照为降级' : '快照=权威';

  return {
    schemaVersion: 1,
    stale: staleFlag,
    preflightAgeMs,
    preflightOk,
    statusSync: sync,
    summary: `${preflightPart} · ${syncPart} · ${stalePart}`,
  };
}
