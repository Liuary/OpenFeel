/**
 * 派发台账（v1.6.0 / REQ-057）— DSH 适配器侧
 *
 * 文件：`<project>/.openfeel/dev/dispatch.jsonl`（UTF-8 / LF，一行一条 JSON）。
 * 行 schema（plan §5.4）：
 *   { dispatchId, ts, leadSessionId, origin, stage, phase,
 *     targetAgent, role, taskId, goal, files[], returnFormat, dispatchDepth }
 *
 * 职责：把「派给谁、派什么、允许写哪些文件」变成可审计的记录，供
 * `feel_status.dispatch` 汇总（提示级，不做硬拦——用户裁定 ②）。
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
 * 归一化一条台账记录（字段齐全、类型稳定）。
 * @param {Record<string, unknown>} raw
 * @returns {Record<string, any>}
 */
function normalizeRecord(raw) {
  const depth = Number.isInteger(raw?.dispatchDepth) && raw.dispatchDepth >= 0 ? raw.dispatchDepth : 1;
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
  };
}

/**
 * 派发汇总（`feel_status.dispatch` 的数据源）。
 *
 * - `required`：恒 `true`——**提示级**（用户裁定 ②：只做台账 + 强提示，不做硬拦）；
 * - `total`：台账总行数；
 * - `sincePhase`：当前 `stage` + `phase` 范围内的派发条数；
 * - `missingRoles`：当前 `stage` + `phase` 范围内**尚未出现**的角色
 *   （五个闭集角色，固定顺序）；
 * - `records`：最近 `DISPATCH_STATUS_RECENT` 条派发摘要（A7 的 `records` 证据面）。
 *
 * @param {string} projectPath
 * @param {{ stage?: string, phase?: string }} [options]
 * @returns {{ required: true, total: number, sincePhase: number, missingRoles: string[], records: Array<Record<string, any>> }}
 */
export function dispatchSummary(projectPath, options = {}) {
  const records = readAllDispatches(projectPath);
  const stage = typeof options.stage === 'string' ? options.stage : '';
  const phase = typeof options.phase === 'string' ? options.phase : '';

  const stageScoped = stage === '' ? records : records.filter((record) => record.stage === stage);
  const phaseScoped = phase === '' ? stageScoped : stageScoped.filter((record) => record.phase === phase);
  const roles = new Set(phaseScoped.map((record) => record.role));

  return {
    required: true,
    total: records.length,
    sincePhase: phaseScoped.length,
    missingRoles: DISPATCH_ROLES.filter((role) => !roles.has(role)),
    records: records.slice(-DISPATCH_STATUS_RECENT).map(summarizeDispatch),
  };
}
