/**
 * 原子序号分配工具 — O_EXCL 独占创建 + 冲突递增重试
 *
 * 目的：消除「先算 max+1 再写」的跨进程竞态（公共日志 NNN、op-NNN 序号重号）。
 * 原理：
 *   - 候选起点由 nextSequence（max+1）计算，仅作单进程快速路径；
 *   - 逐个候选文件名 openSync(path, 'wx') 独占创建，成功即占号；
 *   - 已存在（EEXIST）则递增重试，直至上限；
 *   - 调用方拿到已独占创建的空文件路径后，用原子写写入内容。
 *
 * 空文件占位语义（REV-009）：若在占号与写内容之间崩溃会留下空文件，
 *   但其文件名仍含有效序号，下游 max+1 扫描仍能取到并递增，不重号、不回退。
 *
 * 仅依赖 node:fs / node:path，不引入第三方依赖。
 */
import { closeSync, mkdirSync, openSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** 默认最大尝试次数 */
export const SEQUENCE_MAX_ATTEMPTS_DEFAULT = 1000;

/** 序号分配选项 */
export interface ReserveSequenceOptions {
  /** 目标目录（不存在时自动创建） */
  dir: string;
  /** 候选文件名生成器：入参为序号（1 基），返回完整文件名（含扩展名） */
  candidate: (seq: number) => string;
  /**
   * 从已有文件名解析序号，用于计算候选起点。
   * 返回 null 表示该文件不匹配本序号空间。
   * 注意：必须只解析文件名，禁止读取文件内容（保证空文件占位语义）。
   */
  parse: (fileName: string) => number | null;
  /** 起始序号；缺省时由 nextSequence(dir, parse) 计算（max+1 快速路径） */
  start?: number;
  /** 最大尝试次数，默认 1000 */
  maxAttempts?: number;
}

/** 已分配的序号 */
export interface ReservedSequence {
  /** 序号（1 基） */
  seq: number;
  /** 已独占创建的文件名 */
  fileName: string;
  /** 已独占创建的文件绝对路径（空文件，待调用方写入内容） */
  path: string;
}

/**
 * 纯计算：扫描目录，返回「最大已用序号 + 1」（空目录/不可读返回 1）。
 * 仅作 reserveSequence 的候选起点，不承担分配职责。
 */
export function nextSequence(
  dir: string,
  parse: (fileName: string) => number | null,
): number {
  let max = 0;
  try {
    for (const entry of readdirSync(dir)) {
      const seq = parse(entry);
      if (seq !== null && seq > max) {
        max = seq;
      }
    }
  } catch {
    return 1; // 目录不存在/不可读 → 从 1 开始
  }
  return max + 1;
}

/**
 * 纯计算：返回「文件序号集合 ∪ 注册序号集合」中的**最小未用正整数**（1 基）。
 * 空集 → 1。用于 `plan scheme create` 的序号起点（空位回填，防注册键与文件序列脱节跳号）。
 * 仅计算起点；实际占号仍由 reserveSequence 的 O_EXCL 决定（竞态兜底）。
 */
export function nextSchemeSequence(fileSeqs: Set<number>, registeredSeqs: Set<number>): number {
  const used = new Set<number>([...fileSeqs, ...registeredSeqs]);
  let n = 1;
  while (used.has(n)) {
    n++;
  }
  return n;
}

/**
 * 原子分配一个序号（O_EXCL 独占创建空文件占位）。
 *
 * @param options 目录 / 候选名生成器 / 解析器 / 起点 / 尝试上限
 * @returns 已独占创建的序号、文件名与路径
 * @throws 连续 maxAttempts 次候选均被占用时抛出；其它文件系统错误原样抛出
 */
export function reserveSequence(options: ReserveSequenceOptions): ReservedSequence {
  const {
    dir,
    candidate,
    parse,
    start,
    maxAttempts = SEQUENCE_MAX_ATTEMPTS_DEFAULT,
  } = options;

  mkdirSync(dir, { recursive: true });

  // 候选起点：显式 start 优先，否则 max+1（仅快速路径，最终以 O_EXCL 为准）
  const base = start ?? nextSequence(dir, parse);

  for (let i = 0; i < maxAttempts; i++) {
    const seq = base + i;
    const fileName = candidate(seq);
    const path = join(dir, fileName);
    try {
      const fd = openSync(path, 'wx'); // O_EXCL：已存在则 EEXIST，不覆盖
      closeSync(fd); // 先占位（空文件），内容由调用方原子写
      return { seq, fileName, path };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
        continue; // 序号被占用，递增重试
      }
      throw err; // 权限/目录等错误直接抛出
    }
  }

  throw new Error(`序号分配失败：连续 ${maxAttempts} 次候选均被占用（dir=${dir}）`);
}
