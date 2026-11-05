/**
 * dsh 测试的 guard 状态隔离（v1.5.12 / stage-127；op-005 加固）
 *
 * 背景：`apply()` 会写真实 `~/.openfeel/adapter-host-dsh.json` 与
 * `os.tmpdir()/openfeel-guard/`，四个离线测试脚本若不隔离就会**改写真实宿主状态**
 * （并发跑还会互相干扰）。本模块把两个 env 指向 `mkdtempSync` 临时目录：
 * - `OPENFEEL_ADAPTER_HOST_PATH`（沿用）→ 临时 marker
 * - `OPENFEEL_GUARD_DIR`（新增）→ 临时全局 guard 目录
 *
 * 同时提供「真实状态未被测试改写」的确定性断言（V4 三分支，op-005 P2-2 加固）：
 * 目录比对**逐文件内容**（name + size + mtime + sha256）：
 * - 任一已存在文件**内容变化** → FAIL（真实污染，不看条目集合是否相同）；
 * - 仅新增/删除文件、mtime 变化、或 marker `started_at` 变化 → `skip: host-active`；
 * - 全不变 → PASS；marker `loaded_hash` 变化 → FAIL。
 *
 * `node dsh/test/guard-isolation.js` 会跑本模块自带语义自测（P2-2/P2-3/P2-4/P2-5/P3-2）；
 * 被其它测试 import 时**不**执行自测。
 *
 * **非安全边界**：env 只用于测试隔离；宿主启动前设置即可。
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  buildGuardSection,
  clearGuardState,
  globalGuardDir,
  guardStatePath,
  maybeSelfHealGuardState,
  readGuardSelfHealStats,
  repairGuardState,
  resetGuardSelfHealState,
  setGuardRuntimeIdentity,
} from '../lib/adapters/guard-state.js';
import { defaultMarkerPath } from '../lib/adapters/host-state.js';

/**
 * 在「真实」env 下执行（临时清掉两个隔离变量）。
 * @template T
 * @param {() => T} fn
 * @returns {T}
 */
function withRealGuardEnv(fn) {
  const savedGuardDir = process.env.OPENFEEL_GUARD_DIR;
  const savedMarkerPath = process.env.OPENFEEL_ADAPTER_HOST_PATH;
  delete process.env.OPENFEEL_GUARD_DIR;
  delete process.env.OPENFEEL_ADAPTER_HOST_PATH;
  try {
    return fn();
  } finally {
    if (savedGuardDir === undefined) delete process.env.OPENFEEL_GUARD_DIR;
    else process.env.OPENFEEL_GUARD_DIR = savedGuardDir;
    if (savedMarkerPath === undefined) delete process.env.OPENFEEL_ADAPTER_HOST_PATH;
    else process.env.OPENFEEL_ADAPTER_HOST_PATH = savedMarkerPath;
  }
}

/**
 * 把 guard 状态与宿主 marker 指向本次测试的临时目录（进程级，退出时清理）。
 * @returns {{ isoRoot: string, guardDir: string, markerPath: string }}
 */
export function installIsolatedGuardEnv() {
  const isoRoot = mkdtempSync(join(tmpdir(), 'feel-guard-iso-'));
  const guardDir = join(isoRoot, 'guard');
  const markerPath = join(isoRoot, 'adapter-host-dsh.json');
  process.env.OPENFEEL_GUARD_DIR = guardDir;
  process.env.OPENFEEL_ADAPTER_HOST_PATH = markerPath;
  process.once('exit', () => {
    try {
      rmSync(isoRoot, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });
  return { isoRoot, guardDir, markerPath };
}

/**
 * 读取一个目录的**内容快照**（逐文件 name + size + mtimeMs + sha256）。
 * @param {string} dir
 * @returns {Array<{ name: string, size?: number, mtimeMs?: number, sha256?: string, dir?: boolean, unreadable?: boolean }>}
 */
function snapshotDir(dir) {
  /** @type {Array<Record<string, any>>} */
  const entries = [];
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (!entry.isFile()) {
        entries.push({ name: entry.name, dir: true });
        continue;
      }
      try {
        const stat = statSync(full);
        const sha256 = createHash('sha256').update(readFileSync(full)).digest('hex');
        entries.push({ name: entry.name, size: stat.size, mtimeMs: stat.mtimeMs, sha256 });
      } catch {
        entries.push({ name: entry.name, unreadable: true });
      }
    }
  } catch {
    /* 目录不存在 → 空快照 */
  }
  return entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/**
 * 读取**真实**状态快照（marker 两键 + 全局目录逐文件内容）。
 * @returns {{ entries: Array<Record<string, any>>, marker: { started_at: string | null, loaded_hash: string | null } | null }}
 */
export function snapshotRealGuardState() {
  return withRealGuardEnv(() => {
    const entries = snapshotDir(globalGuardDir());
    let marker = null;
    try {
      const raw = JSON.parse(readFileSync(defaultMarkerPath(), 'utf-8'));
      if (raw !== null && typeof raw === 'object') {
        marker = {
          started_at: typeof raw.started_at === 'string' ? raw.started_at : null,
          loaded_hash: typeof raw.loaded_hash === 'string' ? raw.loaded_hash : null,
        };
      }
    } catch {
      marker = null;
    }
    return { entries, marker };
  });
}

/**
 * 比对两次真实状态快照（纯函数，便于自测）。
 *
 * @param {{ entries?: Array<Record<string, any>>, marker?: { started_at?: string | null, loaded_hash?: string | null } | null }} before
 * @param {{ entries?: Array<Record<string, any>>, marker?: { started_at?: string | null, loaded_hash?: string | null } | null }} after
 * @returns {{ verdict: 'PASS' | 'skip: host-active' | 'FAIL', reason?: string }}
 */
export function compareRealGuardStates(before, after) {
  const beforeHash = before?.marker?.loaded_hash ?? null;
  const afterHash = after?.marker?.loaded_hash ?? null;
  if (beforeHash !== afterHash) return { verdict: 'FAIL', reason: `marker-loaded-hash:${beforeHash}→${afterHash}` };
  const toMap = (entries) => new Map((Array.isArray(entries) ? entries : []).map((entry) => [entry.name, entry]));
  const beforeMap = toMap(before?.entries);
  const afterMap = toMap(after?.entries);
  let activity = false;
  for (const [name, entry] of beforeMap) {
    const next = afterMap.get(name);
    if (next === undefined) {
      activity = true; // 文件被删除：只判活动（不判污染）
      continue;
    }
    if (entry.dir === true || next.dir === true) {
      if (entry.dir !== next.dir) activity = true;
      continue;
    }
    if (entry.unreadable === true || next.unreadable === true) {
      if (entry.unreadable !== next.unreadable) activity = true;
      continue;
    }
    // P2-2：条目集合相同 ≠ 没被改写 —— 内容变化必须 FAIL。
    if (entry.sha256 !== next.sha256) return { verdict: 'FAIL', reason: `content:${name}` };
    if (entry.size !== next.size) return { verdict: 'FAIL', reason: `size:${name}` };
    if (entry.mtimeMs !== next.mtimeMs) activity = true;
  }
  if (afterMap.size !== beforeMap.size) activity = true; // 新增文件
  if ((before?.marker?.started_at ?? null) !== (after?.marker?.started_at ?? null)) activity = true;
  return { verdict: activity ? 'skip: host-active' : 'PASS' };
}

/**
 * 断言真实状态未被本测试改写（V4：内容变 → FAIL；仅新增/删除/时间变 → skip；全不变 → PASS）。
 *
 * @param {{ entries: Array<Record<string, any>>, marker: { started_at: string | null, loaded_hash: string | null } | null }} before
 * @param {{ markerPath?: string }} [iso]
 * @returns {'PASS' | 'skip: host-active'}
 */
export function assertRealGuardUntouched(before, iso = undefined) {
  const after = snapshotRealGuardState();
  const comparison = compareRealGuardStates(before, after);
  if (comparison.verdict === 'FAIL') {
    throw new Error(`真实 guard 状态被测试改写（${comparison.reason ?? 'unknown'}）：测试隔离失效`);
  }
  // 隔离副本存在时，其 started_at 必须与真实 marker 不同（证明写入确实去了临时目录）。
  if (iso !== undefined && typeof iso?.markerPath === 'string') {
    let isoMarker = null;
    try {
      isoMarker = JSON.parse(readFileSync(iso.markerPath, 'utf-8'));
    } catch {
      isoMarker = null;
    }
    if (
      isoMarker !== null
      && typeof isoMarker.started_at === 'string'
      && typeof after.marker?.started_at === 'string'
      && isoMarker.started_at === after.marker.started_at
    ) {
      throw new Error('隔离副本 marker 与真实 marker 的 started_at 相同：env 覆盖未生效');
    }
  }
  return comparison.verdict;
}

/* ════════════════════════════════════════════════════════════════
 * 自测（只有 `node dsh/test/guard-isolation.js` 直接运行才执行）
 * ════════════════════════════════════════════════════════════════ */

/** @param {{ isoRoot: string }} iso @param {string} name */
function makeProject(iso, name) {
  const dir = join(iso.isoRoot, name);
  mkdirSync(join(dir, '.openfeel', 'dev'), { recursive: true });
  return dir;
}

/** @param {Record<string, any>} marker */
function writeMarkerFile(marker) {
  const file = defaultMarkerPath();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify({ adapter: 'dsh', version: 'test', ...marker }, null, 2)}\n`, 'utf8');
}

/** @param {string} dir @param {Record<string, any>} state */
function writeRawState(dir, state) {
  writeFileSync(guardStatePath(dir), `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

/** 自测主体。 */
function runSelfTests() {
  const iso = installIsolatedGuardEnv();
  let passed = 0;
  let failed = 0;
  /** @param {string} label @param {() => void} fn */
  const check = (label, fn) => {
    try {
      fn();
      passed += 1;
      process.stdout.write(`  ok  ${label}\n`);
    } catch (error) {
      failed += 1;
      process.stdout.write(`  FAIL ${label}\n       ${error instanceof Error ? error.message : String(error)}\n`);
    }
  };
  const completeMarker = () => ({ started_at: new Date().toISOString(), loaded_hash: 'hash-new' });
  const deadOldState = (dir) => ({
    registered: true,
    cwd: dir,
    cwdSource: 'agent-session',
    hostStartedAt: '2020-01-01T00:00:00.000Z',
    loaded_hash: 'hash-old',
    pid: 2147483647,
  });

  process.stdout.write('\nOpenFeel × DSH — guard 隔离 / 自愈语义自测（op-005）\n');
  process.stdout.write('='.repeat(60) + '\n\n');

  // ── P2-3：同 pid + hash 失配不得自动修 ──────────────────────────
  check('P2-3：同 pid + loaded_hash 失配 → 不自动修、stale 保持（显式入口仍可修）', () => {
    resetGuardSelfHealState();
    setGuardRuntimeIdentity(null);
    clearGuardState(null);
    const marker = completeMarker();
    writeMarkerFile(marker);
    const dir = makeProject(iso, 'same-pid-hash');
    writeRawState(dir, {
      registered: true,
      cwd: dir,
      cwdSource: 'agent-session',
      hostStartedAt: marker.started_at,
      loaded_hash: 'hash-old',
      pid: process.pid,
    });
    const before = readFileSync(guardStatePath(dir), 'utf8');
    const heal = maybeSelfHealGuardState(dir);
    assert.equal(heal.checked, true, '应完成检查');
    assert.equal(heal.healed, false, '同 pid hash 失配不得自动修');
    assert.equal(heal.reason, 'loaded-hash-mismatch');
    assert.equal(readFileSync(guardStatePath(dir), 'utf8'), before, '不得改写 state');
    const section = buildGuardSection({ root: dir, hostMarker: marker });
    assert.equal(section.stale, true, '展示必须保留「宿主未重启」信号');
    assert.equal(section.staleReason, 'loaded-hash');
    // 显式入口仍可修（人确认重启/修复后）
    const repaired = repairGuardState(dir, { hostMarker: marker });
    assert.equal(repaired.ok, true);
    assert.equal(repaired.changed, true);
    assert.equal(buildGuardSection({ root: dir, hostMarker: marker }).stale, false);
    clearGuardState(dir);
  });

  // ── P2-4：marker 不完整 / state 缺 hash ─────────────────────────
  check('P2-4：marker 不完整（可解析但缺键）→ repair/auto 均 marker-incomplete 且零写盘', () => {
    resetGuardSelfHealState();
    const dir = makeProject(iso, 'incomplete-marker');
    writeRawState(dir, deadOldState(dir));
    writeMarkerFile({}); // 有 adapter/version，但缺 started_at / loaded_hash
    const before = readFileSync(guardStatePath(dir), 'utf8');
    const direct = repairGuardState(dir, { hostMarker: {} });
    assert.equal(direct.ok, false);
    assert.equal(direct.reason, 'marker-incomplete');
    assert.equal(readFileSync(guardStatePath(dir), 'utf8'), before, 'marker 不完整必须零写盘');
    const heal = maybeSelfHealGuardState(dir);
    assert.equal(heal.healed, false);
    assert.equal(heal.reason, 'marker-incomplete');
    assert.equal(readFileSync(guardStatePath(dir), 'utf8'), before, '自动自愈也不得写');
    clearGuardState(dir);
  });

  check('P2-4：state 缺 loaded_hash → staleReason=loaded-hash-missing（不再伪装可信）', () => {
    const marker = completeMarker();
    const dir = makeProject(iso, 'missing-hash');
    writeRawState(dir, {
      registered: true,
      cwd: dir,
      cwdSource: 'agent-session',
      hostStartedAt: marker.started_at,
      pid: process.pid,
    });
    const section = buildGuardSection({ root: dir, hostMarker: marker });
    assert.equal(section.stale, true);
    assert.equal(section.staleReason, 'loaded-hash-missing');
    assert.equal(section.hmacWarn, undefined);
    clearGuardState(dir);
  });

  // ── P2-2：真实目录比对按「逐文件内容」 ─────────────────────────
  const entry = (name, sha256) => ({ name, size: 10, mtimeMs: 100, sha256 });
  check('P2-2：同一文件内容变化（条目集合不变）→ FAIL', () => {
    const before = { entries: [entry('guard-state.json', 'aaa')], marker: { started_at: 't1', loaded_hash: 'h1' } };
    const after = { entries: [entry('guard-state.json', 'bbb')], marker: { started_at: 't1', loaded_hash: 'h1' } };
    const verdict = compareRealGuardStates(before, after);
    assert.equal(verdict.verdict, 'FAIL');
    assert.equal(verdict.reason, 'content:guard-state.json');
  });

  check('P2-2：新增/删除文件或 marker started_at 变 → skip: host-active', () => {
    const empty = { entries: [], marker: { started_at: 't1', loaded_hash: 'h1' } };
    const added = { entries: [entry('guard-audit.jsonl', 'x')], marker: { started_at: 't1', loaded_hash: 'h1' } };
    assert.equal(compareRealGuardStates(empty, added).verdict, 'skip: host-active');
    assert.equal(compareRealGuardStates(added, empty).verdict, 'skip: host-active');
    const laterStart = { entries: added.entries, marker: { started_at: 't2', loaded_hash: 'h1' } };
    assert.equal(compareRealGuardStates(added, laterStart).verdict, 'skip: host-active');
  });

  check('P2-2：全不变 → PASS；marker loaded_hash 变 → FAIL', () => {
    const snapshot = { entries: [entry('guard-state.json', 'aaa')], marker: { started_at: 't1', loaded_hash: 'h1' } };
    assert.equal(compareRealGuardStates(snapshot, JSON.parse(JSON.stringify(snapshot))).verdict, 'PASS');
    const changedHash = { entries: snapshot.entries, marker: { started_at: 't1', loaded_hash: 'h2' } };
    const verdict = compareRealGuardStates(snapshot, changedHash);
    assert.equal(verdict.verdict, 'FAIL');
    assert.match(String(verdict.reason), /marker-loaded-hash/);
  });

  // ── P2-5：读次数口径（含写盘内部两次读） ───────────────────────
  check('P2-5：单次自动修复读次数 = 4（state 1 + marker 1 + 写盘 2），缓存命中 3', () => {
    resetGuardSelfHealState();
    const marker = completeMarker();
    writeMarkerFile(marker);
    const first = makeProject(iso, 'read-count-a');
    writeRawState(first, deadOldState(first));
    const heal = maybeSelfHealGuardState(first);
    assert.equal(heal.healed, true);
    let stats = readGuardSelfHealStats();
    assert.equal(stats.stateReads, 1);
    assert.equal(stats.markerReads, 1);
    assert.equal(stats.writeReads, 2);
    assert.ok(
      stats.stateReads + stats.markerReads + stats.writeReads <= 4,
      `单次自动修复应 ≤4 次同步读，实际 state=${stats.stateReads} marker=${stats.markerReads} write=${stats.writeReads}`,
    );
    const second = makeProject(iso, 'read-count-b');
    writeRawState(second, deadOldState(second));
    assert.equal(maybeSelfHealGuardState(second).healed, true);
    stats = readGuardSelfHealStats();
    assert.equal(stats.markerReads, 1, 'marker mtime+size 未变 → 缓存命中，不再读内容');
    assert.equal(stats.writeReads, 4);
    assert.equal(stats.checks, 2);
    clearGuardState(first);
    clearGuardState(second);
  });

  // ── P3-2：节流成功后写入 + LRU 上限 ────────────────────────────
  check('P3-2：节流在检查成功后生效；LRU 上限 64（最早 root 会被淘汰）', () => {
    resetGuardSelfHealState();
    const marker = completeMarker();
    writeMarkerFile(marker);
    const dir = makeProject(iso, 'throttle-lru');
    writeRawState(dir, deadOldState(dir));
    assert.equal(maybeSelfHealGuardState(dir).healed, true);
    writeRawState(dir, deadOldState(dir));
    const throttled = maybeSelfHealGuardState(dir);
    assert.equal(throttled.checked, false);
    assert.equal(throttled.reason, 'throttled');
    for (let index = 0; index < 70; index += 1) {
      maybeSelfHealGuardState(join(iso.isoRoot, `lru-${index}`));
    }
    const again = maybeSelfHealGuardState(dir);
    assert.equal(again.checked, true, 'LRU 淘汰后应重新检查');
    assert.notEqual(again.reason, 'throttled');
    clearGuardState(dir);
  });

  process.stdout.write('\n' + '='.repeat(60) + '\n');
  process.stdout.write(`通过 ${passed} / ${passed + failed}\n`);
  if (failed > 0) process.exitCode = 1;
  try {
    rmSync(iso.isoRoot, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

const isDirectRun = (() => {
  if (typeof process.argv[1] !== 'string' || process.argv[1] === '') return false;
  try {
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    return false;
  }
})();

if (isDirectRun) runSelfTests();
