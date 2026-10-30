/**
 * 宿主已加载适配器标记（v1.3.4）
 *
 * 目的：让 `openfeel setup --check` 能区分
 * - 「磁盘适配器旧」→ mismatch（应重跑 setup）
 * - 「磁盘已新，但运行中的宿主仍加载旧模块」→ restart-required（应完全重启宿主）
 *
 * 本文件在 DSH 宿主 `apply()`（启动）时由适配器调用 `writeHostMarker()` 写入；
 * 指纹算法必须与 CLI 侧 `src/core/adapter-hash.ts` **逐字节一致**（见该文件注释）：
 * `lib/**` 全部文件按相对 POSIX 路径排序 → 逐文件 CRLF→LF 后 sha256 → 拼接 `${rel}\n${hex}\n` → 再 sha256。
 *
 * 零依赖、只读/写一个 JSON；任何异常都吞掉（标记缺失时 CLI 会落到 restart-required，
 * 属可操作提示，不应让宿主挂载失败）。
 *
 * @module openfeel-dsh/host-state
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';

/**
 * 默认标记路径：`~/.openfeel/adapter-host-dsh.json`。
 * `OPENFEEL_ADAPTER_HOST_PATH` 可覆盖（测试隔离用）。
 * @returns {string}
 */
export function defaultMarkerPath() {
  const override = process.env.OPENFEEL_ADAPTER_HOST_PATH;
  if (typeof override === 'string' && override.trim() !== '') return override;
  return join(homedir(), '.openfeel', 'adapter-host-dsh.json');
}

/** CRLF / CR → LF */
function normalizeEol(content) {
  return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/**
 * 递归收集普通文件（不跟随符号链接目录）。
 * @param {string} dir
 * @param {string[]} out
 */
function collectFiles(dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) collectFiles(full, out);
    else if (entry.isFile()) out.push(full);
  }
}

/**
 * 计算适配器 `lib/` 目录指纹（与 CLI 侧 `hashAdapterFiles` 同算法）。
 * @param {string} adapterRoot 适配器根目录（含 `lib/`）
 * @returns {string} 64 位 hex；不可读时返回空串
 */
export function hashLoadedAdapter(adapterRoot) {
  try {
    const libDir = join(adapterRoot, 'lib');
    const files = [];
    collectFiles(libDir, files);
    if (files.length === 0) return '';
    const entries = files
      .map((file) => ({ rel: relative(adapterRoot, file).split(sep).join('/'), abs: file }))
      .sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
    const sha = createHash('sha256');
    for (const entry of entries) {
      const content = normalizeEol(readFileSync(entry.abs, 'utf-8'));
      const fileHash = createHash('sha256').update(content, 'utf-8').digest('hex');
      sha.update(`${entry.rel}\n${fileHash}\n`, 'utf-8');
    }
    return sha.digest('hex');
  } catch {
    return '';
  }
}

/**
 * 写入宿主已加载标记（best-effort）。
 * @param {{ adapterRoot: string, version: string, markerPath?: string }} options
 * @returns {{ adapter: string, version: string, loaded_hash: string, started_at: string } | null}
 */
export function writeHostMarker(options) {
  try {
    const markerPath = options.markerPath ?? defaultMarkerPath();
    const marker = {
      adapter: 'dsh',
      version: options.version,
      loaded_hash: hashLoadedAdapter(options.adapterRoot),
      started_at: new Date().toISOString(),
    };
    mkdirSync(dirname(markerPath), { recursive: true });
    writeFileSync(markerPath, JSON.stringify(marker, null, 2) + '\n', 'utf-8');
    return marker;
  } catch {
    return null;
  }
}

/**
 * 读取宿主已加载标记（只读；缺失/损坏 → null）。
 * @param {string} [markerPath]
 * @returns {{ adapter?: string, version?: string, loaded_hash?: string, started_at?: string } | null}
 */
export function readHostMarker(markerPath) {
  try {
    const raw = JSON.parse(readFileSync(markerPath ?? defaultMarkerPath(), 'utf-8'));
    return typeof raw === 'object' && raw !== null ? raw : null;
  } catch {
    return null;
  }
}
