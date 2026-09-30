/**
 * 统一原子写工具 — 同目录唯一名 temp + rename
 *
 * 目的：替换高风险路径的裸 writeFileSync，避免进程中断导致目标文件半写/损坏。
 * 原理：
 *   - 在同一目录写唯一名临时文件 → fsync 落盘 → rename 覆盖目标；
 *   - 同目录保证 rename 同卷原子（跨卷 rename 非原子）；
 *   - 唯一名（pid + 随机）避免多进程临时文件互相覆盖；
 *   - rename 覆盖在 Windows / Linux 均为原子替换。
 *
 * 约束：仅依赖 node:fs / node:crypto / node:path，不引入第三方依赖（S1）。
 * 内容零改写：不对内容做行尾归一化或字符增删，原样落盘。
 */
import {
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { randomBytes } from 'node:crypto';
import { basename, dirname, join } from 'node:path';

/** 原子写选项 */
export interface AtomicWriteOptions {
  /** 文本编码，默认 'utf-8'（Buffer 内容忽略此值） */
  encoding?: BufferEncoding;
  /** 是否 fsync 落盘，默认 true（关闭可提速，但断电可能丢数据） */
  fsync?: boolean;
  /**
   * 写入前是否将旧目标复制为 `{filePath}.bak`，默认 false。
   * 注意：写成功后不再触碰 .bak，因此 .bak 始终保留「上一个已落盘版本」（S5）。
   */
  backup?: boolean;
}

/**
 * 构造同目录唯一临时文件名：`.{basename}.{pid}.{random}.tmp`
 * 导出仅供测试与诊断使用（验证唯一性与残留清理）。
 */
export function buildTempName(filePath: string): string {
  const dir = dirname(filePath);
  const name = basename(filePath);
  const rand = randomBytes(6).toString('hex');
  return join(dir, `.${name}.${process.pid}.${rand}.tmp`);
}

/**
 * 原子写入文件（同步）
 *
 * @param filePath 目标文件绝对路径
 * @param content  文本或 Buffer 内容（原样写入，不做行尾/字符改写）
 * @param options  编码 / fsync / 写前备份
 * @throws 写入或 rename 失败时抛出原错误（已尽力清理临时文件）
 */
export function atomicWriteFileSync(
  filePath: string,
  content: string | Buffer,
  options: AtomicWriteOptions = {},
): void {
  const { encoding = 'utf-8', fsync = true, backup = false } = options;

  // 确保父目录存在（rename 要求目标目录已存在）
  mkdirSync(dirname(filePath), { recursive: true });

  // 写前备份旧文件（S5）：仅当旧文件存在时复制；复制失败不阻塞写入
  if (backup && existsSync(filePath)) {
    try {
      copyFileSync(filePath, `${filePath}.bak`);
    } catch {
      // 备份失败不阻塞写入（与既有 FlowManager.save 行为保持一致）
    }
  }

  const tmpPath = buildTempName(filePath);
  try {
    const fd = openSync(tmpPath, 'w');
    try {
      writeFileSync(fd, content, encoding);
      if (fsync) {
        fsyncSync(fd);
      }
    } finally {
      closeSync(fd);
    }
    // rename 覆盖目标（同目录、同卷，原子替换）
    renameSync(tmpPath, filePath);
  } catch (err) {
    // 失败时清理临时文件，避免残留（清理失败忽略：可能已被 rename 或本就不存在）
    try {
      unlinkSync(tmpPath);
    } catch {
      // 忽略清理失败
    }
    throw err;
  }
}

/**
 * 原子写入 JSON（缩进 2 + 末尾换行，与项目既有 JSON 写盘格式一致）
 *
 * **预留 API**：供 backup 类后续复用；当前仅测试引用（atomic-write.test.ts）。
 * 如需移除，须同步删除对应自测（T23）。
 */
export function atomicWriteJson(
  filePath: string,
  obj: unknown,
  options: AtomicWriteOptions = {},
): void {
  atomicWriteFileSync(filePath, JSON.stringify(obj, null, 2) + '\n', options);
}
