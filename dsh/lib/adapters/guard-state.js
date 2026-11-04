/**
 * 门禁自检状态（v1.5.11 D-126-04 / P0-4）
 *
 * 目的：让「门禁到底有没有生效、用哪个 cwd 判的、是不是旧进程/旧适配器」
 * 成为**可查证据**，而不是靠「工具没报错」猜。两处落点：
 *
 * 1. 工作区：`<project>/.openfeel/dev/guard-state.json`
 * 2. 全局：`os.tmpdir()/openfeel-guard/guard-state.json`
 *
 * **cwd 解析失败时必须落全局路径**（`root = null`）：绝不用 `process.cwd()`
 * （那会把宿主启动目录当成会话工作区，正是原 bug 的形态），也绝不静默丢弃——
 * 那恰好是最需要证据的时刻。
 *
 * 失败策略：写盘失败要**出声**（stderr），但不阻塞判定（best-effort）。
 * 读取顺序：工作区 → 全局（全局命中时 `source='global-fallback'`、`degraded=true`）。
 *
 * @module openfeel-dsh/guard-state
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

/** 文件 schema 版本（后续字段演进用）。 */
export const GUARD_STATE_SCHEMA_VERSION = 1;

/**
 * 进程内 HMAC 密钥（op-005 / P1-6）：**只在内存里**，绝不落盘、绝不写日志。
 *
 * 为什么需要：`guard-state.json` 是普通 JSON，agent 可以用 P0-1 的写通道整体重写它
 * （伪造 `pid` / `lastDecision` / `stale` 三键），让 `feel_status` 显示「门禁正常」。
 * 加一个只有**当前进程**知道的密钥签名后：
 * - 本进程写的状态 → 校验通过；
 * - 别的进程（含重启前的自己/被伪造的文件）写的状态 → 校验失败 → `stale: true`
 *   （文案「门禁状态被篡改或来自旧进程」）。
 *
 * 代价：跨进程共享时必然 stale —— 这恰好是「状态是否由**正在服务的进程**写出」的
 * 正确语义，不是缺陷。
 */
const STATE_HMAC_KEY = randomBytes(32);

/** 递归稳定序列化（键排序），保证同一对象在写入/校验两侧得到同一字符串。 */
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value).filter((key) => value[key] !== undefined).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/**
 * 计算状态签名（排除 `hmac` 与读取时附加的 `source`）。
 * @param {Record<string, any>} state
 * @returns {string}
 */
function signState(state) {
  const { hmac: _hmac, source: _source, ...rest } = state;
  return createHmac('sha256', STATE_HMAC_KEY).update(stableStringify(rest)).digest('hex');
}

/**
 * 校验状态签名（op-005 / P1-6）。
 * @param {Record<string, any> | null} state
 * @returns {boolean}
 */
export function verifyGuardStateSignature(state) {
  if (state === null || typeof state !== 'object') return false;
  const actual = state.hmac;
  if (typeof actual !== 'string' || actual === '') return false;
  const expected = signState(state);
  if (actual.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(actual, 'utf8'), Buffer.from(expected, 'utf8'));
  } catch {
    return false;
  }
}

/** 注册段字段（从全局文件播种到工作区文件时只带这些，避免把别的项目的 lastDecision 带进来）。 */
const REGISTRATION_KEYS = [
  'schemaVersion',
  'registered',
  'enforce',
  'shellGate',
  'hostStartedAt',
  'loaded_hash',
  'pid',
  'resolvedAt',
];

/**
 * 工作区 guard-state 路径。
 * @param {string} root 项目根
 * @returns {string}
 */
export function guardStatePath(root) {
  return join(root, '.openfeel', 'dev', 'guard-state.json');
}

/** 全局落点目录（cwd 不可解析时用）。 @returns {string} */
export function globalGuardDir() {
  return join(tmpdir(), 'openfeel-guard');
}

/** 全局 guard-state 路径。 @returns {string} */
export function globalGuardStatePath() {
  return join(globalGuardDir(), 'guard-state.json');
}

/**
 * 全局审计落点（`recordGuardAudit(null)` 用）。
 *
 * 与 guard.js 的 `.openfeel/log/guard-audit.jsonl` 同名同格式：
 * cwd 解析失败时证据不会丢，只是换了目录。
 * @returns {string}
 */
export function globalGuardAuditPath() {
  return join(globalGuardDir(), 'guard-audit.jsonl');
}

/**
 * 读一个 state 文件（缺失/损坏 → null）。
 * @param {string} file
 * @returns {Record<string, any> | null}
 */
function readStateFile(file) {
  try {
    const raw = JSON.parse(readFileSync(file, 'utf-8'));
    return typeof raw === 'object' && raw !== null ? raw : null;
  } catch {
    return null;
  }
}

/**
 * 读取 guard-state（工作区优先，缺失/root=null 时回退全局）。
 *
 * @param {string | null} root 项目根（null = 只看全局）
 * @returns {(Record<string, any> & { source: 'workspace'|'global-fallback' }) | null}
 */
export function readGuardState(root) {
  if (typeof root === 'string' && root !== '') {
    const workspace = readStateFile(guardStatePath(root));
    if (workspace !== null) return { ...workspace, source: 'workspace' };
  }
  const global = readStateFile(globalGuardStatePath());
  if (global !== null) return { ...global, source: 'global-fallback' };
  return null;
}

/**
 * 写入 guard-state（best-effort；失败出声、不阻塞）。
 *
 * `root = null` → 固定写全局路径（**绝不**用 `process.cwd()`）。
 * 工作区文件不存在时，用全局文件的注册段播种（registered/enforce/…），
 * 这样第一次判定写出的工作区文件同样带自证三键。
 *
 * 失败时：stderr 打文件与原因；给了 `fallback`（at/tool/reason/cwdSource）时
 * 再打两行结构化的判定现场 —— 「最需要证据的时候」绝不静默（D-126-04）。
 *
 * @param {string | null} root
 * @param {Record<string, any>} patch
 * @param {{ at?: string, tool?: string, reason?: string, decision?: string, cwdSource?: string } | null} [fallback]
 * @returns {boolean} 是否写入成功
 */
export function writeGuardState(root, patch, fallback = null) {
  const isGlobal = typeof root !== 'string' || root === '';
  const file = isGlobal ? globalGuardStatePath() : guardStatePath(root);
  try {
    const globalRaw = readStateFile(globalGuardStatePath());
    const workspaceRaw = isGlobal ? null : readStateFile(file);
    const seed = globalRaw === null
      ? {}
      : Object.fromEntries(REGISTRATION_KEYS.filter((key) => globalRaw[key] !== undefined).map((key) => [key, globalRaw[key]]));
    const next = {
      ...seed,
      ...(workspaceRaw ?? {}),
      ...patch,
      schemaVersion: GUARD_STATE_SCHEMA_VERSION,
      source: undefined,
      updatedAt: new Date().toISOString(),
    };
    delete next.source;
    delete next.hmac;
    next.hmac = signState(next);
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, 'utf-8');
    renameSync(tmp, file);
    return true;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[guard] guard-state-unavailable：${file}（${reason}）\n`);
    if (fallback !== null && typeof fallback === 'object') {
      process.stderr.write(
        `[guard]   at=${fallback.at ?? ''} tool=${fallback.tool ?? ''} reason=${fallback.reason ?? ''}\n`,
      );
      process.stderr.write(`[guard]   cwdSource=${fallback.cwdSource ?? ''} decision=${fallback.decision ?? ''}\n`);
    }
    return false;
  }
}

/**
 * 删除 guard-state / 全局审计（测试用）。
 * @param {string | null} root
 */
export function clearGuardState(root) {
  try {
    if (typeof root === 'string' && root !== '') rmSync(guardStatePath(root), { force: true });
  } catch {
    /* ignore */
  }
  try {
    rmSync(globalGuardStatePath(), { force: true });
    rmSync(globalGuardAuditPath(), { force: true });
  } catch {
    /* ignore */
  }
}

/**
 * 可信度判定（op-005 / P1-6）：返回不可信的原因，可信时返回 null。
 *
 * 顺序很重要 —— **先验签**：签名不过说明文件不是本进程写的（被 agent 重写、
 * 或来自旧进程），后面所有自证字段都不可信，没必要再看。
 *
 * @param {Record<string, any> | null} state
 * @param {Record<string, any> | null} hostMarker
 * @param {number} pid
 * @returns {{ reason: string, message?: string } | null}
 */
export function guardStateDistrust(state, hostMarker = null, pid = process.pid) {
  if (state === null || typeof state !== 'object') return null;
  if (!verifyGuardStateSignature(state)) {
    return {
      reason: 'hmac',
      message: '门禁状态被篡改或来自旧进程（guard-state 签名校验失败）：请重启宿主后确认 feel_status.guard.stale === false。',
    };
  }
  if (!Number.isFinite(state.pid)) {
    return {
      reason: 'pid-missing',
      message: '门禁状态缺少 pid（无法证明由当前进程写入）：请重启宿主后确认 feel_status.guard.stale === false。',
    };
  }
  if (state.pid !== pid) return { reason: 'pid' };
  if (hostMarker === null || typeof hostMarker !== 'object') return null;
  if (
    typeof state.loaded_hash === 'string' && state.loaded_hash !== ''
    && typeof hostMarker.loaded_hash === 'string' && hostMarker.loaded_hash !== ''
    && state.loaded_hash !== hostMarker.loaded_hash
  ) return { reason: 'loaded-hash' };
  const stateAt = Date.parse(state.hostStartedAt);
  const markerAt = Date.parse(hostMarker.started_at);
  if (Number.isFinite(stateAt) && Number.isFinite(markerAt) && stateAt < markerAt) return { reason: 'host-started-at' };
  return null;
}

/**
 * stale 判定（P0-4 / op-005 P1-6）：状态不可信 → true。
 *
 * - **HMAC 校验失败** → 被篡改或来自旧进程（新增，防伪造）；
 * - **缺 `pid`** → 不可信（旧实现「无证据不冤枉」，但状态文件可被整体重写，
 *   所以缺 pid 必须当 stale）；
 * - `pid` 与当前进程不符 → 状态来自旧进程；
 * - `loaded_hash` 与标记不符 → 适配器文件已更新但宿主没重启；
 * - `hostStartedAt` 早于标记的 `started_at` → 状态来自更早的宿主启动。
 *
 * @param {Record<string, any> | null} state
 * @param {Record<string, any> | null} hostMarker
 * @param {number} [pid]
 * @returns {boolean}
 */
export function computeGuardStale(state, hostMarker, pid = process.pid) {
  return guardStateDistrust(state, hostMarker, pid) !== null;
}

/**
 * 组装 `feel_status` / `feel_next` 的 `guard` 段。
 *
 * 两处都缺 → `{ registered:false, cwd:null, cwdSource:null, stale:false }`（计划口径：
 * 不再假装生效）。`live` 是调用方用**同一条 cwd 解析链**现算的结果，仅用于
 * 填补「还没有第一条判定」时的显示空缺（状态里已有 cwd 时以状态为准）。
 *
 * @param {{ root: string | null, hostMarker?: Record<string, any> | null, pid?: number, live?: { cwd: string | null, source: string, degraded: boolean } | null }} input
 * @returns {Record<string, any>}
 */
export function buildGuardSection({ root, hostMarker = null, pid = process.pid, live = null }) {
  const state = readGuardState(root);
  if (state === null) {
    return { registered: false, cwd: null, cwdSource: null, stale: false };
  }
  const distrust = guardStateDistrust(state, hostMarker, pid);
  const stale = distrust !== null;
  const section = {
    registered: state.registered === true,
    enforce: typeof state.enforce === 'string' ? state.enforce : undefined,
    shellGate: typeof state.shellGate === 'string' ? state.shellGate : undefined,
    cwd: typeof state.cwd === 'string' && state.cwd !== '' ? state.cwd : null,
    cwdSource: typeof state.cwdSource === 'string' && state.cwdSource !== '' ? state.cwdSource : null,
    degraded: state.degraded === true || state.source === 'global-fallback',
    resolvedAt: state.resolvedAt ?? null,
    hostStartedAt: state.hostStartedAt ?? null,
    loaded_hash: state.loaded_hash ?? null,
    pid: Number.isFinite(state.pid) ? state.pid : null,
    lastDecision: state.lastDecision ?? null,
    stale,
    // op-005 / P1-6：不可信的原因与文案（`hmac` = 被篡改或来自旧进程）。
    ...(stale ? { staleReason: distrust.reason, staleMessage: distrust.message ?? null } : {}),
    source: state.source,
  };
  // 只在「还没有任何判定」时用现场解析填补显示。**已有 lastDecision 时以状态为准**：
  // fail-closed 那次判定写的是 `cwd:null / unresolved`，如果这里用同类链再解析一次
  // （比如落到 process/config 环）就会把「已 fail-closed」粉饰成正常 —— 那正是
  // D-126-04 要杜绝的「静默失效」。
  const hasDecision = state.lastDecision !== null && typeof state.lastDecision === 'object';
  if (!hasDecision && section.cwd === null && live !== null && typeof live.cwd === 'string' && live.cwd !== '') {
    section.cwd = live.cwd;
    section.cwdSource = live.source;
    section.degraded = live.degraded === true;
    section.source = 'live-resolution';
  }
  return section;
}
