/**
 * 跨进程文件锁（建议性 / advisory lock）
 *
 * 协议：
 *   1. openSync(lockPath, 'wx') 独占创建成功 → 持锁，写入 {pid, time, token}；
 *   2. 已存在（EEXIST）→ 指数退避重试，直至 timeoutMs；
 *   3. 陈旧锁（mtime 年龄 > staleMs）→ 原子 rename 抢占后重试；
 *   4. finally 释放：读回 token 校验归属，一致才 unlinkSync。
 *
 * TTL 定值依据（REV-006）：实测最长临界区 P99 ≈ 8.14ms（本机 NTFS），
 *   staleMs = 3000ms ≈ 368×P99，且 staleMs < timeoutMs 保证崩溃残留可在等待窗口内被抢占。
 *   心跳续期对同步临界区不可行（事件循环被阻塞），故采用静态大余量 TTL。
 *
 * 仅依赖 node:fs / node:path / node:os / node:crypto，不引入第三方依赖。
 */
import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { randomBytes } from 'node:crypto';

/** 获取锁总超时（ms） */
export const LOCK_TIMEOUT_MS_DEFAULT = 5000;
/** 陈旧锁判定阈值（ms），依据实测临界区 P99 设定，见文件头说明 */
export const LOCK_STALE_MS_DEFAULT = 3000;
/** 退避初始间隔（ms） */
export const LOCK_INITIAL_BACKOFF_MS_DEFAULT = 10;
/** 退避上限（ms） */
export const LOCK_MAX_BACKOFF_MS_DEFAULT = 500;

/** 文件锁选项 */
export interface FileLockOptions {
  /** 获取锁总超时（ms），默认 5000 */
  timeoutMs?: number;
  /** 陈旧锁判定阈值（ms），默认 3000 */
  staleMs?: number;
  /** 退避初始间隔（ms），默认 10 */
  initialBackoffMs?: number;
  /** 退避上限（ms），默认 500 */
  maxBackoffMs?: number;
}

/** 锁文件内容 */
interface LockInfo {
  pid: number;
  time: number;
  token: string;
}

/** 项目级锁文件路径：{projectPath}/.openfeel/tmp/locks/{name}.lock（S6） */
export function projectLockPath(projectPath: string, name: string): string {
  return join(projectPath, '.openfeel', 'tmp', 'locks', `${name}.lock`);
}

/** 全局锁文件路径：~/.openfeel/locks/{name}.lock（跨项目全局写入用） */
export function globalLockPath(name: string): string {
  return join(homedir(), '.openfeel', 'locks', `${name}.lock`);
}

/** 同步睡眠（阻塞当前 JS 线程，不空转 CPU） */
function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** 读取锁文件内容；读取/解析失败返回 null */
function readLockInfo(lockPath: string): LockInfo | null {
  try {
    return JSON.parse(readFileSync(lockPath, 'utf-8')) as LockInfo;
  } catch {
    return null;
  }
}

/**
 * 尝试抢占陈旧锁：rename 到唯一名（原子，只有一个进程成功），随后 best-effort 删除。
 * @returns 是否成功抢占（false 表示未过期 / 已被他人抢占 / Windows 占用）
 */
function tryReclaimStale(lockPath: string, staleMs: number): boolean {
  let mtimeMs: number;
  try {
    mtimeMs = statSync(lockPath).mtimeMs;
  } catch {
    return false; // 锁已被释放/抢占
  }
  if (Date.now() - mtimeMs <= staleMs) {
    return false; // 未过期
  }

  const stalePath = `${lockPath}.stale.${process.pid}.${randomBytes(4).toString('hex')}`;
  try {
    renameSync(lockPath, stalePath); // 原子抢占：并发者只有一个成功
  } catch {
    // ENOENT（他人已抢占）/ EPERM、EBUSY（Windows 占用，持锁者仍活跃）→ 交回重试
    return false;
  }
  try {
    unlinkSync(stalePath);
  } catch {
    // 清理失败忽略（残留为唯一名，不阻塞后续加锁）
  }
  return true;
}

/**
 * 在文件锁保护下同步执行 fn。
 *
 * @param lockPath 锁文件绝对路径（用 projectLockPath / globalLockPath 构造）
 * @param fn       临界区函数
 * @param options  超时 / TTL / 退避配置
 * @returns fn 的返回值
 * @throws 超过 timeoutMs 仍无法获取锁时抛出；fn 自身抛错原样透传
 */
export function withFileLock<T>(
  lockPath: string,
  fn: () => T,
  options: FileLockOptions = {},
): T {
  const {
    timeoutMs = LOCK_TIMEOUT_MS_DEFAULT,
    staleMs = LOCK_STALE_MS_DEFAULT,
    initialBackoffMs = LOCK_INITIAL_BACKOFF_MS_DEFAULT,
    maxBackoffMs = LOCK_MAX_BACKOFF_MS_DEFAULT,
  } = options;

  mkdirSync(dirname(lockPath), { recursive: true });

  const token = randomBytes(8).toString('hex');
  const deadline = Date.now() + timeoutMs;
  let backoff = initialBackoffMs;

  // ── 获取锁 ──
  for (;;) {
    try {
      const fd = openSync(lockPath, 'wx'); // O_EXCL 独占创建
      try {
        const info: LockInfo = { pid: process.pid, time: Date.now(), token };
        writeFileSync(fd, JSON.stringify(info), 'utf-8');
      } finally {
        closeSync(fd);
      }
      break; // 持锁成功
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw err; // 权限/目录等错误直接抛出
      }
    }

    // 已存在：先尝试抢占陈旧锁
    tryReclaimStale(lockPath, staleMs);

    // 超时判定
    if (Date.now() >= deadline) {
      throw new Error(`获取文件锁超时（${timeoutMs}ms）：${lockPath}`);
    }

    // 指数退避 + ±20% 抖动，避免多进程同频重试
    const jitter = 1 + (Math.random() - 0.5) * 0.4;
    sleepSync(Math.min(backoff, maxBackoffMs) * jitter);
    backoff = Math.min(backoff * 2, maxBackoffMs);
  }

  // ── 执行临界区并释放 ──
  try {
    return fn();
  } finally {
    // 归属校验：仅当锁文件仍属于本 token 时删除，避免误删他人/抢占后的新锁
    const info = readLockInfo(lockPath);
    if (info?.token === token) {
      try {
        unlinkSync(lockPath);
      } catch {
        // Windows 占用/已删除：释放失败静默忽略，残留锁由 TTL 兜底（见方案说明）
      }
    }
  }
}
