/**
 * 派发台账（v1.6.0 / REQ-057；v1.7.0 / REQ-066 增闭环 closing）— DSH 适配器侧
 *
 * 文件：`<project>/.openfeel/dev/dispatch.jsonl`（UTF-8 / LF，一行一条 JSON）。
 * 行 schema（plan §5.4）：
 *   { dispatchId, ts, leadSessionId, origin, stage, phase,
 *     targetAgent, role, taskId, goal, files[], returnFormat, dispatchDepth }
 * 可选闭环字段（v1.7.0 / REQ-066 A66.1，由 `closeDispatch` 原地补写）：
 *   closing: { status: 'done'|'failed', artifacts: string[], durationMs: number, summary: string }
 *   closedAt: ISO 时间（**行的顶层字段**——A66.1 要求 closing 恰 4 键，时间戳不进 closing）
 *
 * 职责：把「派给谁、派什么、允许写哪些文件」变成可审计的记录，并在完成后补上
 * 产物/耗时/失败原因，供 `feel_status.dispatch` 汇总（提示级，不做硬拦——用户裁定 ②）。
 *
 * 纪律：
 * - 只有适配器进程直接 fs 写；该文件在 `PROTECTED_OPENFEEL_PATHS` 里，
 *   agent 的工具写（write/edit/shell）会被 guard 拒绝（防伪造「已派发」证据）。
 * - 读写全部 best-effort：台账是观测手段，任何异常都不得阻断 `feel_*` 主流程。
 * - 原子写沿用 `sessions.js` 的习惯：同目录 temp + rename（整文件重写，顺带 prune）。
 * - 并发语义与 `sessions.js` 相同：无文件锁，读-改-写之间可能有丢行风险；
 *   台账每行独立、去重按 `leadSessionId+taskId+goal`，丢一行只影响审计完整性，
 *   不影响门禁判定（因此不引入锁）。
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';

/** 台账相对项目根的路径（POSIX 风格，供提示与测试断言）。 */
export const DISPATCH_LEDGER_REL_PATH = '.openfeel/dev/dispatch.jsonl';

/** 合法角色闭集（`feel_dispatch.role` 枚举同源）。 */
export const DISPATCH_ROLES = Object.freeze(['planner', 'executor', 'reviewer', 'tester', 'archiver']);

/** 台账保留时长（24h；超龄行在下次写入时清理）。 */
export const DISPATCH_RETENTION_MS = 24 * 60 * 60_000;

/** 台账行数上限（超出只保留最近 200 行）。 */
export const DISPATCH_MAX_RECORDS = 200;

/** 去重窗口（同 `leadSessionId+taskId+goal` 5 分钟内视为重复）。 */
export const DISPATCH_DEDUP_WINDOW_MS = 5 * 60_000;

/** 缺省返回格式（plan §5.4 的派发契约）。 */
export const DEFAULT_RETURN_FORMAT = '≤10 行：结论/改动文件/验证/阻塞';

/**
 * 台账文件绝对路径。
 * @param {string} projectPath
 * @returns {string}
 */
export function dispatchLedgerPath(projectPath) {
  return join(projectPath, '.openfeel', 'dev', 'dispatch.jsonl');
}

/**
 * 取字符串字段（缺省 → ''）。
 * @param {unknown} value
 * @returns {string}
 */
function asString(value) {
  return typeof value === 'string' ? value : '';
}

/**
 * 取字符串数组（过滤非字符串 / 空串）。
 * @param {unknown} value
 * @returns {string[]}
 */
function asStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry) => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
}

/**
 * 归一化闭环段（v1.7.0 / REQ-066 A66.1）。
 *
 * 输出**恰 4 键**且键序固定：`status` / `artifacts` / `durationMs` / `summary`
 * （`closedAt` 落行的顶层，见文件头注释——A66.1 不允许第 5 键混进 closing）。
 * 非法输入（非对象 / status 不在闭集）→ `undefined`（读侧丢弃；写侧由调用方报错）。
 *
 * @param {unknown} raw
 * @returns {{ status: 'done'|'failed', artifacts: string[], durationMs: number, summary: string } | undefined}
 */
function normalizeClosing(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const status = raw.status === 'done' ? 'done' : raw.status === 'failed' ? 'failed' : '';
  if (status === '') return undefined;
  const durationMs = typeof raw.durationMs === 'number' && Number.isFinite(raw.durationMs) && raw.durationMs >= 0
    ? Math.round(raw.durationMs)
    : 0;
  return {
    status,
    artifacts: asStringArray(raw.artifacts),
    durationMs,
    summary: asString(raw.summary),
  };
}

/**
 * 归一化一条台账记录（字段齐全、类型稳定）。
 * @param {Record<string, unknown>} raw
 * @returns {Record<string, any>}
 */
function normalizeRecord(raw) {
  const depth = Number.isInteger(raw?.dispatchDepth) && raw.dispatchDepth >= 0 ? raw.dispatchDepth : 1;
  const closing = normalizeClosing(raw?.closing);
  const closedAt = asString(raw?.closedAt);
  return {
    dispatchId: asString(raw?.dispatchId),
    ts: asString(raw?.ts),
    leadSessionId: asString(raw?.leadSessionId),
    origin: asString(raw?.origin) || 'root',
    stage: asString(raw?.stage),
    phase: asString(raw?.phase),
    targetAgent: asString(raw?.targetAgent),
    role: asString(raw?.role),
    taskId: asString(raw?.taskId),
    goal: asString(raw?.goal),
    files: asStringArray(raw?.files),
    returnFormat: asString(raw?.returnFormat) || DEFAULT_RETURN_FORMAT,
    dispatchDepth: depth,
    // 可选闭环字段只增不改：未闭环的行不写这两个键（存量行字节不变）
    ...(closing !== undefined ? { closing } : {}),
    ...(closedAt !== '' ? { closedAt } : {}),
  };
}

/**
 * 读全部记录（文件缺失 / 单行损坏 → 跳过，绝不抛错）。
 * @param {string} projectPath
 * @returns {Array<Record<string, any>>}
 */
function readAllDispatches(projectPath) {
  let text;
  try {
    text = readFileSync(dispatchLedgerPath(projectPath), 'utf-8');
  } catch {
    return [];
  }
  const records = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === '') continue;
    try {
      const parsed = JSON.parse(line);
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
      records.push(normalizeRecord(parsed));
    } catch {
      // 损坏行跳过：台账是观测数据，不因一行坏掉丢失全部证据
    }
  }
  return records;
}

/**
 * 读台账（按文件顺序，最多返回最近 `limit` 条）。
 * @param {string} projectPath
 * @param {{ limit?: number }} [options]
 * @returns {Array<Record<string, any>>}
 */
export function readDispatches(projectPath, options = {}) {
  const all = readAllDispatches(projectPath);
  const limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : null;
  return limit === null ? all : all.slice(-limit);
}

/**
 * 24h / 200 行清理（纯函数，便于单测）。
 * @param {Array<Record<string, any>>} records
 * @param {number} now 毫秒时间戳
 * @returns {Array<Record<string, any>>}
 */
function pruneRecords(records, now) {
  const cutoff = now - DISPATCH_RETENTION_MS;
  const kept = records.filter((record) => {
    const at = Date.parse(record.ts);
    // 时间戳不可解析的行没有审计价值（也无法判断新旧），按陈旧丢弃
    return Number.isFinite(at) && at >= cutoff;
  });
  return kept.length > DISPATCH_MAX_RECORDS ? kept.slice(-DISPATCH_MAX_RECORDS) : kept;
}

/**
 * 原子写整份台账（同目录 temp + rename；目录不存在时幂等创建）。
 * @param {string} projectPath
 * @param {Array<Record<string, any>>} records
 * @returns {string} 台账绝对路径
 */
function writeDispatches(projectPath, records) {
  const file = dispatchLedgerPath(projectPath);
  mkdirSync(dirname(file), { recursive: true });
  const body = records.map((record) => JSON.stringify(record)).join('\n');
  const tmp = `${file}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  writeFileSync(tmp, body === '' ? '' : `${body}\n`, 'utf-8');
  renameSync(tmp, file);
  return file;
}

/**
 * 推下一条 `dispatchId`（`d-0001` 形式；读现有记录的最大序号 +1）。
 * @param {Array<Record<string, any>>} records
 * @returns {string}
 */
function nextDispatchId(records) {
  let max = 0;
  for (const record of records) {
    const match = /^d-(\d+)$/.exec(record.dispatchId);
    if (match !== null) max = Math.max(max, Number(match[1]));
  }
  return `d-${String(max + 1).padStart(4, '0')}`;
}

/**
 * 追加一条派发记录（顺带 24h / 200 行清理）。
 *
 * 去重：同 `leadSessionId + taskId + goal` 且时间差 ≤ 5 分钟 → 返回既有记录
 * 的 `dispatchId`，**不追加新行**（防模型重试造成假派发证据）。
 *
 * @param {string} projectPath
 * @param {Record<string, unknown>} record
 * @param {{ now?: number }} [options] `now` 注入便于单测（缺省 `Date.now()`）
 * @returns {{ dispatchId: string, path: string, duplicate: boolean }}
 */
export function appendDispatch(projectPath, record = {}, options = {}) {
  const now = Number.isFinite(options.now) ? /** @type {number} */ (options.now) : Date.now();
  const incoming = normalizeRecord({
    ...record,
    ts: asString(record.ts) || new Date(now).toISOString(),
  });

  const existing = readAllDispatches(projectPath);

  for (let index = existing.length - 1; index >= 0; index -= 1) {
    const previous = existing[index];
    if (
      previous.leadSessionId === incoming.leadSessionId
      && previous.taskId === incoming.taskId
      && previous.goal === incoming.goal
    ) {
      const at = Date.parse(previous.ts);
      if (Number.isFinite(at) && Math.abs(now - at) <= DISPATCH_DEDUP_WINDOW_MS) {
        return { dispatchId: previous.dispatchId, path: dispatchLedgerPath(projectPath), duplicate: true };
      }
    }
  }

  incoming.dispatchId = nextDispatchId(existing);
  const kept = pruneRecords([...existing, incoming], now);
  const path = writeDispatches(projectPath, kept);
  return { dispatchId: incoming.dispatchId, path, duplicate: false };
}

/**
 * 读台账的**原始行**（不归一化；用于 `closeDispatch` 的原地补写，保证未命中行字节不变）。
 * @param {string} projectPath
 * @returns {string[]}
 */
function readRawLedgerLines(projectPath) {
  let text;
  try {
    text = readFileSync(dispatchLedgerPath(projectPath), 'utf-8');
  } catch {
    return [];
  }
  return text.split(/\r?\n/).filter((line) => line.trim() !== '');
}

/**
 * 关闭一条派发（v1.7.0 / REQ-066 A66.1）：按 `dispatchId` **原地补写** `closing` + 顶层 `closedAt`。
 *
 * 契约：
 * - **行数 / 行序不变**，未命中的行字节不变（只对目标行 JSON.parse → 补键 → stringify）；
 * - **幂等**：同 id 重复 finish 且 `status` / `artifacts` / `summary` 相同 → `changed:false`，
 *   `ts` / `closing` / `closedAt` 都不二次改写（`durationMs` 未显式给出时沿用既有值，
 *   避免「重复调用 = 耗时变大」）；
 * - `durationMs` 缺省 = `now - Date.parse(ts)`（非负整数；ts 不可解析 → 0）；
 * - 未知 id → `{ ok:false, code:'not_found' }` 且**零写盘**；status 非法 → `invalid_closing`。
 *
 * @param {string} projectPath
 * @param {string} dispatchId
 * @param {{ status?: 'done'|'failed', artifacts?: string[], durationMs?: number, summary?: string }} closing
 * @param {{ now?: number }} [options] `now` 注入便于单测（缺省 `Date.now()`）
 * @returns {{ ok: true, dispatchId: string, closedAt: string, changed: boolean, path: string }
 *   | { ok: false, code: 'not_found'|'invalid_closing', path: string }}
 */
export function closeDispatch(projectPath, dispatchId, closing = {}, options = {}) {
  const file = dispatchLedgerPath(projectPath);
  const id = asString(dispatchId).trim();
  if (id === '') return { ok: false, code: 'not_found', path: file };

  const now = Number.isFinite(options.now) ? /** @type {number} */ (options.now) : Date.now();
  const lines = readRawLedgerLines(projectPath);
  /** @type {Array<Record<string, any> | null>} */
  const parsed = [];
  let targetIndex = -1;
  for (let index = 0; index < lines.length; index += 1) {
    let value = null;
    try {
      const candidate = JSON.parse(lines[index]);
      if (candidate !== null && typeof candidate === 'object' && !Array.isArray(candidate)) value = candidate;
    } catch {
      // 损坏行保持原样：不因一行坏掉改写整份台账
    }
    parsed.push(value);
    if (targetIndex === -1 && value !== null && value.dispatchId === id) targetIndex = index;
  }
  if (targetIndex === -1) return { ok: false, code: 'not_found', path: file };

  const target = /** @type {Record<string, any>} */ (parsed[targetIndex]);
  const existing = normalizeClosing(target.closing);
  const existingClosedAt = asString(target.closedAt);
  const explicitDuration = typeof closing.durationMs === 'number'
    && Number.isFinite(closing.durationMs)
    && closing.durationMs >= 0;
  const tsMs = Date.parse(asString(target.ts));
  // 幂等关键：未显式给 durationMs 时优先沿用既有值（否则重复调用会因 now 变化而「改写」）。
  const durationMs = explicitDuration
    ? Math.round(/** @type {number} */ (closing.durationMs))
    : existing !== undefined
      ? existing.durationMs
      : Number.isFinite(tsMs)
        ? Math.max(0, Math.round(now - tsMs))
        : 0;
  const next = normalizeClosing({ ...closing, durationMs });
  if (next === undefined) return { ok: false, code: 'invalid_closing', path: file };

  const sameClosing = existing !== undefined && JSON.stringify(existing) === JSON.stringify(next);
  if (sameClosing && existingClosedAt !== '') {
    return { ok: true, dispatchId: id, closedAt: existingClosedAt, changed: false, path: file };
  }

  const closedAt = sameClosing && existingClosedAt !== '' ? existingClosedAt : new Date(now).toISOString();
  target.closing = next;
  target.closedAt = closedAt;

  const body = parsed
    .map((value, index) => (value === null ? lines[index] : JSON.stringify(value)))
    .join('\n');
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  writeFileSync(tmp, body === '' ? '' : `${body}\n`, 'utf-8');
  renameSync(tmp, file);
  return { ok: true, dispatchId: id, closedAt, changed: true, path: file };
}

/**
 * 清理超龄 / 超上限记录（无变化时不重写文件）。
 * @param {string} projectPath
 * @param {{ now?: number }} [options]
 * @returns {{ path: string, total: number, kept: number, removed: number }}
 */
export function pruneDispatches(projectPath, options = {}) {
  const now = Number.isFinite(options.now) ? /** @type {number} */ (options.now) : Date.now();
  const records = readAllDispatches(projectPath);
  const kept = pruneRecords(records, now);
  if (kept.length !== records.length) writeDispatches(projectPath, kept);
  return {
    path: dispatchLedgerPath(projectPath),
    total: records.length,
    kept: kept.length,
    removed: records.length - kept.length,
  };
}

/** `feel_status.dispatch.records` 暴露的最近条数（足够证明「派发过」，不撑上下文）。 */
export const DISPATCH_STATUS_RECENT = 5;

/**
 * 台账里一条记录的摘要（`feel_status.dispatch.records` 的元素）。
 *
 * v1.7.0 / REQ-066 A66.2：透出 `closing`（无闭环 → null）与顶层 `closedAt`，
 * 让「这条派发到底完成没有」在状态快照里可直接读。
 *
 * @param {Record<string, any>} record 已归一化的台账行
 * @returns {Record<string, any>}
 */
function summarizeDispatch(record) {
  return {
    dispatchId: record.dispatchId,
    ts: record.ts,
    stage: record.stage,
    phase: record.phase,
    targetAgent: record.targetAgent,
    role: record.role,
    taskId: record.taskId,
    goal: record.goal,
    closing: record.closing ?? null,
    closedAt: record.closedAt ?? null,
  };
}

/**
 * 派发汇总（`feel_status.dispatch` 的数据源；v1.7.0 / REQ-066 A66.2 增 `open[]` / `closedRatio`）。
 *
 * - `required`：恒 `true`——**提示级**（用户裁定 ②：只做台账 + 强提示，不做硬拦）；
 * - `total`：台账总行数；
 * - `sincePhase`：当前 `stage` + `phase` 范围内的派发条数；
 * - `open[]`：当前 `stage` 范围内**未闭环**的派发（无 `closing` 或 `closing.status!=='done'`；
 *   跨相位保留——早期相位没做完的派发不该因相位推进而「消失」）；
 * - `closedRatio`：全台账 `closing.status==='done'` 条数 / `total`（`total===0` → `null`，不出现 NaN）；
 * - `missingRoles`：当前 `stage` + `phase` 范围内**没有 `closing.status==='done'` 记录**的角色
 *   （五个闭集角色，固定顺序；v1.6.0 的「有 record 即算」口径已作废——A66.2）；
 * - `records`：最近 `DISPATCH_STATUS_RECENT` 条派发摘要（含 `closing` / `closedAt`）。
 *
 * @param {string} projectPath
 * @param {{ stage?: string, phase?: string }} [options]
 * @returns {{ required: true, total: number, sincePhase: number, open: Array<Record<string, any>>, closedRatio: number | null, missingRoles: string[], records: Array<Record<string, any>> }}
 */
export function dispatchSummary(projectPath, options = {}) {
  const records = readAllDispatches(projectPath);
  const stage = typeof options.stage === 'string' ? options.stage : '';
  const phase = typeof options.phase === 'string' ? options.phase : '';

  const stageScoped = stage === '' ? records : records.filter((record) => record.stage === stage);
  const phaseScoped = phase === '' ? stageScoped : stageScoped.filter((record) => record.phase === phase);
  const isClosedDone = (record) => record.closing !== undefined && record.closing !== null && record.closing.status === 'done';
  const doneRoles = new Set(phaseScoped.filter(isClosedDone).map((record) => record.role));
  const doneCount = records.filter(isClosedDone).length;

  return {
    required: true,
    total: records.length,
    sincePhase: phaseScoped.length,
    open: stageScoped.filter((record) => !isClosedDone(record)).map(summarizeDispatch),
    closedRatio: records.length === 0 ? null : doneCount / records.length,
    missingRoles: DISPATCH_ROLES.filter((role) => !doneRoles.has(role)),
    records: records.slice(-DISPATCH_STATUS_RECENT).map(summarizeDispatch),
  };
}
