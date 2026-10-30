/**
 * 适配器文件指纹（v1.3.4）
 *
 * 用于回答「磁盘上的适配器是哪个版本」与「宿主进程实际加载的是不是这一份」。
 * CLI 侧（本模块）与 DSH 适配器侧（`dsh/lib/adapters/host-state.js`）必须**逐字节同算法**：
 *
 * 1. 遍历 `<adapterRoot>/lib/**` 下全部普通文件（递归，路径按 POSIX `/` 归一）；
 * 2. 相对路径按字典序排序；
 * 3. 每个文件内容做 CRLF→LF 归一后取 sha256（hex），拼成 `${relPath}\n${hex}\n`；
 * 4. 对拼接结果再取 sha256（hex）作为目录指纹。
 *
 * 任何读取失败（权限/竞态删除）→ 返回空串（调用方降级为版本比较，不抛）。
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** CRLF / CR → LF（与 update-state 的 hashContent 同语义） */
function normalizeEol(content: string): string {
  return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/** 递归收集普通文件绝对路径（不跟随目录符号链接，防环） */
function collectFiles(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(full, out);
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
}

/**
 * 计算适配器 `lib/` 目录指纹（v1.3.4）。
 * @param adapterRoot 适配器根目录（含 `lib/`），如 `<pkg>/dsh`
 * @returns 64 位 hex；不可读时返回空串
 */
export function hashAdapterFiles(adapterRoot: string): string {
  try {
    const libDir = join(adapterRoot, 'lib');
    const files: string[] = [];
    collectFiles(libDir, files);
    if (files.length === 0) {
      return '';
    }
    const entries = files
      .map((file) => ({
        rel: relative(adapterRoot, file).split(sep).join('/'),
        abs: file,
      }))
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
