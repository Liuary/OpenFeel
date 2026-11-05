/**
 * 门禁自检状态（v1.5.11 D-126-04 / P0-4；v1.5.12 stage-127 / op-001 身份自证 + 自愈）
 *
 * 目的：让「门禁到底有没有生效、用哪个 cwd 判的、是不是旧进程/旧适配器」
 * 成为**可查证据**，而不是靠「工具没报错」猜。两处落点：
 *
 * 1. 工作区：`<project>/.openfeel/dev/guard-state.json`
 * 2. 全局：`os.tmpdir()/openfeel-guard/guard-state.json`（`OPENFEEL_GUARD_DIR` 可覆盖，测试隔离用）
 *
 * **cwd 解析失败时必须落全局路径**（`root = null`）：绝不用 `process.cwd()`
 * （那会把宿主启动目录当成会话工作区，正是原 bug 的形态），也绝不静默丢弃——
 * 那恰好是最需要证据的时刻。
 *
 * 失败策略：写盘失败要**出声**（stderr），但不阻塞判定（best-effort）。
 * 读取顺序：工作区 → 全局（全局命中时 `source='global-fallback'`、`degraded=true`）。
 *
 * **身份三键（stage-127 / op-001）**：`hostStartedAt` / `loaded_hash` / `pid` 只来自
 * 「当前进程的注册事实」（`setGuardRuntimeIdentity`，`index.js` 启动时用当前 marker 设置），
 * 或注册段的显式 patch；**旧工作区文件里的身份一律剥离、绝不继承**——那是重启后
 * `stale` 恒 true 的根因（旧 `hostStartedAt` 覆盖新 seed）。
 *
 * **stale 只认 `pid` + `loaded_hash`**（`loaded_hash` 缺失也算不可信，`loaded-hash-missing`）：
 * `hostStartedAt` 仅作诊断字段（marker 每次 `apply()` 重写、多 profile/多宿主下时间比较必然误报且永不恢复）。
 * HMAC 失配降级为 `hmacWarn:true`（可见、不门禁、不置 stale）。
 *
 * @module openfeel-dsh/guard-state
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { defaultMarkerPath, readHostMarker } from './host-state.js';

/** 文件 schema 版本（后续字段演进用）。 */
export const GUARD_STATE_SCHEMA_VERSION = 1;

/**
 * 进程内 HMAC 密钥（op-005 / P1-6）：**只在内存里**，绝不落盘、绝不写日志。
 *
 * 为什么需要：`guard-state.json` 是普通 JSON，agent 可以用 P0-1 的写通道整体重写它
 * （伪造 `pid` / `lastDecision` / `stale` 三键），让 `feel_status` 显示「门禁正常」。
 * 加一个只有**当前进程**知道的密钥签名后：
 * - 本进程写的状态 → 校验通过；
 * - 别的进程（含重启前的自己/被伪造的文件）写的状态 → 校验失败 → `hmacWarn: true`
 *   （**可见但不置 stale**：跨进程识别由 `pid` 覆盖，见 D2）。
 *
 * 代价：跨进程共享时签名必然失配 —— 这恰好是「状态是否由**正在服务的进程**写出」的
 * 证据之一，判别交给 `pid`；签名只作为**可见性**信号，不再门禁。
 */
const STATE_HMAC_KEY = randomBytes(32);

/** 身份三键：只由当前进程/显式 patch 提供，旧工作区文件绝不继承（stage-127 / D1）。 */
const IDENTITY_KEYS = ['hostStartedAt', 'loaded_hash', 'pid'];

/** 当前进程的运行时身份（`setGuardRuntimeIdentity` 登记；只在内存）。 */
let runtimeIdentity = null;

/** 「本进程未登记身份」的 stderr 只警告一次。 */
let identityWarned = false;

/**
 * 自动自愈的 `guard_repair` 审计：每宿主启动至多一条（防审计无界增长）。
 *
 * 取舍（stage-127 / op-005 P3-1）：多 root 场景下只有**第一条**自动修复进审计，
 * 后续自动修复仍写 state 但不追加审计；显式 `feel_verify health fix=true` 每次实际
 * 变更各记一条。这样审计体积有界；需要逐 root 追溯时用显式入口。
 */
let autoRepairAudited = false;

/** 自动自愈节流：同一 root 60s 内只检查一次；表带上限（LRU）防无界增长。 */
const SELF_HEAL_THROTTLE_MS = 60_000;
const SELF_HEAL_THROTTLE_LIMIT = 64;
const selfHealLastCheck = new Map();

/**
 * 记录一次**成功完成**的检查（P3-2：异常路径不写节流，避免该 root 静默 60s）。
 * Map 按插入序 LRU：最新在后，超过上限淘汰最旧。
 * @param {string} root
 * @param {number} at
 */
function touchSelfHealThrottle(root, at) {
  selfHealLastCheck.delete(root);
  selfHealLastCheck.set(root, at);
  while (selfHealLastCheck.size > SELF_HEAL_THROTTLE_LIMIT) {
    const oldest = selfHealLastCheck.keys().next().value;
    if (oldest === undefined) break;
    selfHealLastCheck.delete(oldest);
  }
}

/** marker 内容缓存：`{path, mtimeMs, size}` 未变时零内容读盘。 */
let markerCache = null;

/**
 * 自愈读次数观测（op-005 P2-5 口径修正）：
 * - `stateReads`：读 guard-state（工作区；缺失时还会回退读全局）；
 * - `markerReads`：读宿主 marker（缓存命中时 0）；
 * - `writeReads`：修复写盘内部 `writeGuardState` 的两次读（global seed + workspace 继承）。
 * 单次自动修复上限 = 1 + 1 + 2 = **4**；marker 缓存命中时 3。
 */
const selfHealStats = { checks: 0, stateReads: 0, markerReads: 0, writeReads: 0 };

/**
 * 自愈读次数归集器：`{phase: 'state'|'write', stateReads, writeReads}`。
 * `readStateFile` 按当前 phase 记账（P2-5：写盘内部两次读也要计入，不能自证口径）。
 * @type {{ phase: 'state'|'write', stateReads: number, writeReads: number } | null}
 */
let readCapture = null;

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

/**
 * 登记当前进程的运行时身份（stage-127 / D1）。**只在内存**，绝不落盘。
 *
 * 缺项丢弃（`pid` 必须有限数字、其余必须非空字符串）；非对象 → 清空。
 * 重复调用以最后一次为准（测试用 `setGuardRuntimeIdentity(null)` 复位）。
 *
 * @param {{ pid?: number, hostStartedAt?: string, loaded_hash?: string } | null} identity
 */
export function setGuardRuntimeIdentity(identity) {
  if (identity === null || typeof identity !== 'object') {
    runtimeIdentity = null;
    return;
  }
  /** @type {Record<string, any>} */
  const picked = {};
  for (const key of IDENTITY_KEYS) {
    const value = identity[key];
    if (value === undefined || value === null) continue;
    if (key === 'pid') {
      if (Number.isFinite(value)) picked.pid = value;
      continue;
    }
    if (typeof value === 'string' && value !== '') picked[key] = value;
  }
  runtimeIdentity = Object.keys(picked).length === 0 ? null : picked;
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

/**
 * 全局落点目录（cwd 不可解析时用）。
 * `OPENFEEL_GUARD_DIR` 可覆盖（测试隔离用；非安全边界）。
 * @returns {string}
 */
export function globalGuardDir() {
  const override = process.env.OPENFEEL_GUARD_DIR;
  if (typeof override === 'string' && override.trim() !== '') return override;
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
 * 工作区审计落点（与 guard.js 的落点同名同格式）。
 * @param {string} root
 * @returns {string}
 */
export function guardAuditPath(root) {
  return join(root, '.openfeel', 'log', 'guard-audit.jsonl');
}

/**
 * 读一个 state 文件（缺失/损坏 → null）。
 * @param {string} file
 * @returns {Record<string, any> | null}
 */
function readStateFile(file) {
  if (readCapture !== null) {
    if (readCapture.phase === 'write') readCapture.writeReads += 1;
    else readCapture.stateReads += 1;
  }
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
 *
 * **合并顺序（stage-127 / D1，不可颠倒）**：
 * `seed`（全局注册段弱兜底，身份可能来自旧宿主 → 会 stale，属降级事实）
 * → `inherited`（工作区**易变字段**：`lastDecision`/`cwd`/`cwdSource`/`resolvedAt` 等）
 * → `runtimeIdentity`（当前进程注册事实，**覆盖 seed**）
 * → `patch`（显式传入，优先级最高）。
 * **`workspaceRaw` 的身份三键一律剥离**——旧工作区文件绝不提供身份。
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
    const inherited = workspaceRaw === null
      ? {}
      : Object.fromEntries(Object.entries(workspaceRaw).filter(([key]) => !IDENTITY_KEYS.includes(key)));
    // 显式 patch 里 `undefined` 不参与覆盖（避免 `{hostStartedAt: undefined}` 意外抹掉身份）。
    const patchClean = Object.fromEntries(Object.entries(patch ?? {}).filter(([, value]) => value !== undefined));
    const next = {
      ...seed,
      ...inherited,
      ...(runtimeIdentity ?? {}),
      ...patchClean,
      schemaVersion: GUARD_STATE_SCHEMA_VERSION,
      updatedAt: new Date().toISOString(),
    };
    // 降级告警：合并后仍然没有任何身份事实 → 状态必然按不可信处理，必须出声（只一次）。
    const identityPresent = Number.isFinite(next.pid)
      && typeof next.hostStartedAt === 'string' && next.hostStartedAt !== ''
      && typeof next.loaded_hash === 'string' && next.loaded_hash !== '';
    if (!identityPresent && !identityWarned) {
      identityWarned = true;
      process.stderr.write('[guard] guard-identity-unavailable：本进程未登记身份且全局段缺失，状态将按不可信处理。\n');
    }
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
 * 可信度判定（op-005 / P1-6；stage-127 / D2 重排）。
 *
 * 顺序很重要：
 * 1. 缺 `pid` → `pid-missing`（fail-closed，状态可被整体重写，无证据不能算可信）；
 * 2. `pid` 与当前进程不符 → `pid`（状态来自旧进程）；
 * 3. 缺 `loaded_hash` → `loaded-hash-missing`（P2-4：无法证明代码版本；旧实现「空 hash 跳过
 *    比对」会让「marker 不完整 → repair 写入空 hash」变成 `stale:false`，与告警相反）；
 * 4. `loaded_hash`（双方非空）不符 → `loaded-hash`（适配器文件已更新但宿主没重启）；
 * 5. 以上都过但验签失败 → `hmac` + `severity:'warn'`（**不 stale**，仅 `hmacWarn` 可见）；
 * 6. `hostStartedAt` **不参与判定**（P1-3：marker 每次 `apply()` 重写，时间比较必然误报）。
 *
 * @param {Record<string, any> | null} state
 * @param {Record<string, any> | null} hostMarker
 * @param {number} pid
 * @returns {{ reason: string, severity: 'stale'|'warn', message?: string } | null}
 */
export function guardStateDistrust(state, hostMarker = null, pid = process.pid) {
  if (state === null || typeof state !== 'object') return null;
  if (!Number.isFinite(state.pid)) {
    return {
      reason: 'pid-missing',
      severity: 'stale',
      message: '门禁状态缺少 pid（无法证明由当前进程写入）：请重启宿主后确认 feel_status.guard.stale === false。',
    };
  }
  if (state.pid !== pid) return { reason: 'pid', severity: 'stale' };
  if (typeof state.loaded_hash !== 'string' || state.loaded_hash === '') {
    return {
      reason: 'loaded-hash-missing',
      severity: 'stale',
      message: '门禁状态缺少 loaded_hash（无法证明适配器版本）：请重启宿主，或用 feel_verify action=health fix=true 修复。',
    };
  }
  if (
    hostMarker !== null && typeof hostMarker === 'object'
    && typeof hostMarker.loaded_hash === 'string' && hostMarker.loaded_hash !== ''
    && state.loaded_hash !== hostMarker.loaded_hash
  ) return { reason: 'loaded-hash', severity: 'stale' };
  if (!verifyGuardStateSignature(state)) {
    return {
      reason: 'hmac',
      severity: 'warn',
      message: '门禁状态签名失配（可能来自旧进程或被重写）：仅提示，不影响判定。如显示异常可完全重启宿主。',
    };
  }
  return null;
}

/**
 * stale 判定（P0-4 / op-005 P1-6 / stage-127 D2）：只有 `severity:'stale'` 才算 stale。
 *
 * - **缺 `pid`** → 不可信；
 * - `pid` 与当前进程不符 → 状态来自旧进程；
 * - `loaded_hash` 与标记不符 → 适配器文件已更新但宿主没重启；
 * - **HMAC 失配不判 stale**（`hmacWarn` 可见）；
 * - **`hostStartedAt` 永不参与**（仅诊断字段）。
 *
 * @param {Record<string, any> | null} state
 * @param {Record<string, any> | null} hostMarker
 * @param {number} [pid]
 * @returns {boolean}
 */
export function computeGuardStale(state, hostMarker, pid = process.pid) {
  const distrust = guardStateDistrust(state, hostMarker, pid);
  return distrust !== null && distrust.severity === 'stale';
}

/**
 * 组装 `feel_status` / `feel_next` 的 `guard` 段。
 *
 * 两处都缺 → `{ registered:false, cwd:null, cwdSource:null, stale:false }`（恰 4 键；
 * 计划口径：不再假装生效）。`live` 是调用方用**同一条 cwd 解析链**现算的结果，仅用于
 * 填补「还没有第一条判定」时的显示空缺（状态里已有 cwd 时以状态为准）。
 *
 * 非空分支新增 `signature:'valid'|'mismatch'`；仅当三元组（pid/loaded_hash）通过且
 * 验签失败时加 `hmacWarn:true`（不置 stale、不进 workflowGate）。
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
  const stale = distrust !== null && distrust.severity === 'stale';
  const signatureValid = verifyGuardStateSignature(state);
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
    signature: signatureValid ? 'valid' : 'mismatch',
    // 不可信的原因与文案（只在 stale 时写；`hmac` 不再出现在 staleReason 枚举里）。
    ...(stale ? { staleReason: distrust.reason, staleMessage: distrust.message ?? null } : {}),
    source: state.source,
  };
  // HMAC 失配：三元组通过才降级为可见告警（不置 stale、不门禁）。
  if (!stale && !signatureValid) section.hmacWarn = true;
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

/* ════════════════════════════════════════════════════════════════
 * 受支持的自愈（stage-127 / §3-F）
 *
 * 为什么需要：跨进程 HMAC 与「旧工作区身份」在重启后必然让 state 不可信；
 * 官方修复路径**不要求用户删文件**。修复只发生在适配器进程内（握有 marker +
 * 当前 `process.pid`），身份**不接受任何工具参数**——agent 无法注入任意 pid/hash。
 *
 * 兼容性：`.openfeel/dev/guard-state.json` 是**受保护路径**（针对 `write`/`edit`
 * 等工具写），这里用适配器进程内的 `fs` 直写，不经过 guard，因此不存在自锁；
 * 安全性由「身份只能来自 marker + 当前 pid」保证。
 * ════════════════════════════════════════════════════════════════ */

/**
 * 追加一行门禁审计（best-effort：写失败不阻断修复）。
 * @param {string} root
 * @param {Record<string, any>} record
 * @returns {boolean}
 */
function appendGuardAudit(root, record) {
  try {
    const file = guardAuditPath(root);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(record)}\n`, { encoding: 'utf-8', flag: 'a' });
    return true;
  } catch {
    return false;
  }
}

/**
 * 修复 guard-state 的身份（显式入口 `feel_verify action=health fix=true` 与自动自愈共用）。
 *
 * - `hostMarker` 为空/null → `{ ok:false, reason:'marker-missing' }`，**零写盘**；
 * - `hostMarker` 可解析但**不完整**（缺 `started_at` 或 `loaded_hash` 为空）→
 *   `{ ok:false, reason:'marker-incomplete' }`，**零写盘**（P2-4：否则会把空 hash 写进 state，
 *   让「无法证明版本」伪装成可信）；
 * - 新身份只来自 `marker` + **当前 `process.pid`**（不接受外部传入的身份值）；
 * - 若旧 state 三键已与新身份一致 → `{ ok:true, changed:false }`（幂等，不写盘、不审计）；
 * - 写盘借助 `writeGuardState` 的合并语义**保留** `lastDecision`/`cwd`/`cwdSource`；
 *   `state === null` 时补 `registered:true` / `cwd:root` / `cwdSource:'repair'`；
 * - 追加 `guard-audit.jsonl`：`event:'guard_repair'`，含 old/new；自动自愈每宿主启动至多 1 条。
 *
 * @param {string} root
 * @param {{ hostMarker?: Record<string, any> | null, auto?: boolean, actor?: string, tool?: string, state?: Record<string, any> | null }} [options]
 * @returns {{ ok: boolean, changed?: boolean, reason?: string, old?: Record<string, any>, next?: Record<string, any>, audited?: boolean }}
 */
export function repairGuardState(root, options = {}) {
  if (typeof root !== 'string' || root === '') return { ok: false, reason: 'root-missing' };
  const hostMarker = options.hostMarker ?? null;
  if (hostMarker === null || typeof hostMarker !== 'object') return { ok: false, reason: 'marker-missing' };
  // P2-4：marker 完整性校验（可解析 ≠ 可信任）。缺键/空 hash 一律拒绝修复，零写盘。
  if (
    typeof hostMarker.started_at !== 'string' || hostMarker.started_at === ''
    || typeof hostMarker.loaded_hash !== 'string' || hostMarker.loaded_hash === ''
  ) return { ok: false, reason: 'marker-incomplete' };
  const auto = options.auto === true;
  const pid = process.pid; // 身份只能来自当前宿主进程，绝不接受工具参数
  const nextIdentity = {
    pid,
    hostStartedAt: hostMarker.started_at,
    loaded_hash: hostMarker.loaded_hash,
  };
  // 自动自愈把已读的 state 传进来，避免重复读盘。
  const state = options.state !== undefined ? options.state : readGuardState(root);
  const old = {
    pid: Number.isFinite(state?.pid) ? state.pid : null,
    loaded_hash: typeof state?.loaded_hash === 'string' ? state.loaded_hash : null,
    hostStartedAt: typeof state?.hostStartedAt === 'string' ? state.hostStartedAt : null,
  };
  const unchanged = state !== null && state.source === 'workspace'
    && old.pid === nextIdentity.pid
    && old.loaded_hash === nextIdentity.loaded_hash
    && old.hostStartedAt === nextIdentity.hostStartedAt;
  if (unchanged) return { ok: true, changed: false, old, next: nextIdentity };

  const now = new Date().toISOString();
  /** @type {Record<string, any>} */
  const patch = {
    ...nextIdentity,
    repairedAt: now,
    repairSource: auto ? 'self-heal' : 'feel_verify',
  };
  if (state === null) {
    patch.registered = true;
    patch.cwd = root;
    patch.cwdSource = 'repair';
  }
  const written = writeGuardState(root, patch);
  if (!written) return { ok: false, reason: 'write-failed', old, next: nextIdentity };

  const record = {
    time: now,
    event: 'guard_repair',
    decision: 'allow',
    reason: 'guard-repair',
    tool: typeof options.tool === 'string' && options.tool !== '' ? options.tool : 'feel_verify',
    auto,
    old,
    new: { ...nextIdentity },
    cwdSource: typeof state?.cwdSource === 'string' && state.cwdSource !== '' ? state.cwdSource : 'repair',
  };
  let audited = false;
  if (!auto) {
    audited = appendGuardAudit(root, record);
  } else if (!autoRepairAudited) {
    autoRepairAudited = true;
    audited = appendGuardAudit(root, record);
  }
  return { ok: true, changed: true, old, next: nextIdentity, audited };
}

/**
 * 读 marker（带 `{path, mtimeMs, size}` 缓存）：未变化时零内容读盘。
 * @returns {Record<string, any> | null}
 */
function readMarkerCached() {
  const path = defaultMarkerPath();
  let stat = null;
  try {
    stat = statSync(path);
  } catch {
    markerCache = null;
    return null;
  }
  if (
    markerCache !== null
    && markerCache.path === path
    && markerCache.mtimeMs === stat.mtimeMs
    && markerCache.size === stat.size
  ) {
    return markerCache.marker;
  }
  selfHealStats.markerReads += 1;
  const marker = readHostMarker(path);
  markerCache = { path, mtimeMs: stat.mtimeMs, size: stat.size, marker };
  return marker;
}

/**
 * 自动自愈（`target()` 每个 `feel_*` 公共入口调用一次）。
 *
 * 约束（少一条就会变成多宿主 ping-pong 写）：
 * - `OPENFEEL_GUARD_SELF_HEAL=off` 时直接返回（测试/逃生阀）；
 * - 同一 root **60s 内只检查一次**；**成功完成检查后**才记节流（异常不占用窗口，P3-2），
 *   节流表上限 64（LRU）；
 * - marker 按 mtime+size 缓存，未变时零内容读盘；
 * - **只对「`pid` 缺失 / `pid` 已死（ESRCH）」自动修**：
 *   - 活着的异 pid（`process.kill(pid,0)` 成功或抛 `EPERM`）→ 跳过（多宿主不互相覆盖）；
 *   - **同 pid 的 `loaded_hash` 失配绝不自动修**（P2-3）：那正是「适配器已更新但宿主没重启」
 *     的信号，必须在展示前保留；交由完全重启或显式 `feel_verify action=health fix=true`；
 * - 每次检查 ≤4 次同步小 JSON 读（state 1 + marker 0~1 + 修复写盘内部 2，见 `selfHealStats`）；
 * - 异常一律吞掉（best-effort，绝不阻断 `feel_*`），且不写节流时间戳。
 *
 * @param {string} root
 * @returns {{ checked: boolean, healed?: boolean, reason: string, result?: Record<string, any> }}
 */
export function maybeSelfHealGuardState(root) {
  if (process.env.OPENFEEL_GUARD_SELF_HEAL === 'off') return { checked: false, reason: 'disabled' };
  if (typeof root !== 'string' || root === '') return { checked: false, reason: 'no-root' };
  const last = selfHealLastCheck.get(root);
  if (last !== undefined && Date.now() - last < SELF_HEAL_THROTTLE_MS) return { checked: false, reason: 'throttled' };
  selfHealStats.checks += 1;
  const capture = { phase: /** @type {'state'|'write'} */ ('state'), stateReads: 0, writeReads: 0 };
  readCapture = capture;
  let outcome;
  let failed = false;
  try {
    outcome = selfHealCheck(root);
  } catch (error) {
    failed = true;
    outcome = { checked: true, healed: false, reason: error instanceof Error ? error.message : 'error' };
  } finally {
    selfHealStats.stateReads += capture.stateReads;
    selfHealStats.writeReads += capture.writeReads;
    readCapture = null;
  }
  // P3-2：只有检查正常完成才写节流；异常下一轮可立即重试，不让该 root 静默 60s。
  if (!failed) touchSelfHealThrottle(root, Date.now());
  return outcome;
}

/**
 * 自动自愈的单次检查（不含节流/异常兜底；读次数由调用方的 `readCapture` 归集）。
 *
 * @param {string} root
 * @returns {{ checked: boolean, healed?: boolean, reason: string, result?: Record<string, any> }}
 */
function selfHealCheck(root) {
  const state = readGuardState(root);
  if (state === null || state.source !== 'workspace') return { checked: true, healed: false, reason: 'no-workspace-state' };
  if (Number.isFinite(state.pid) && state.pid !== process.pid) {
    let alive = true;
    try {
      process.kill(state.pid, 0);
    } catch (error) {
      alive = error?.code === 'EPERM';
    }
    // 活着的异 pid 不自动修：两个活宿主共享同一工程会互相覆盖（显式入口才修）。
    if (alive) return { checked: true, healed: false, reason: 'foreign-pid-alive' };
  }
  const marker = readMarkerCached();
  if (marker === null || typeof marker !== 'object') return { checked: true, healed: false, reason: 'marker-missing' };
  if (Number.isFinite(state.pid) && state.pid === process.pid) {
    // 同 pid：pid 已自证；loaded_hash 失配**不自动修**（P2-3：保留「宿主未重启」信号）。
    if (
      typeof marker.loaded_hash === 'string' && marker.loaded_hash !== ''
      && state.loaded_hash === marker.loaded_hash
    ) {
      return { checked: true, healed: false, reason: 'trusted' };
    }
    return { checked: true, healed: false, reason: 'loaded-hash-mismatch' };
  }
  // 到这里只可能是「pid 缺失」或「pid 已死（ESRCH）」→ 允许自动修复。
  if (readCapture !== null) readCapture.phase = 'write';
  const result = repairGuardState(root, { hostMarker: marker, auto: true, state });
  return {
    checked: true,
    healed: result.ok === true && result.changed === true,
    reason: result.ok === true ? (result.changed === true ? 'repaired' : 'unchanged') : (result.reason ?? 'repair-failed'),
    result,
  };
}

/**
 * 复位自愈的模块级状态（测试用：节流 / marker 缓存 / 审计上限 / 读计数）。
 */
export function resetGuardSelfHealState() {
  selfHealLastCheck.clear();
  markerCache = null;
  autoRepairAudited = false;
  selfHealStats.checks = 0;
  selfHealStats.stateReads = 0;
  selfHealStats.markerReads = 0;
  selfHealStats.writeReads = 0;
  readCapture = null;
}

/**
 * 读自愈读计数（op-005 P2-5：含写盘内部两次读，单次自动修复上限 4）。
 * @returns {{ checks: number, stateReads: number, markerReads: number, writeReads: number }}
 */
export function readGuardSelfHealStats() {
  return { ...selfHealStats };
}
