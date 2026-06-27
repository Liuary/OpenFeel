/**
 * 跨平台路径工具
 * 处理 file:// URL 与本地文件系统路径的相互转换
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

/**
 * 将 file:// URL 或普通路径解析为规范化文件系统路径。
 * Windows 兼容：处理 file:///C:/... 格式。
 *
 * @param urlOrPath - file:// URL 或文件系统路径
 * @returns 规范化后的绝对路径
 *
 * @example
 * resolveFileUrl('file:///C:/project/src/index.ts') // Windows → 'C:\\project\\src\\index.ts'
 * resolveFileUrl('file:///home/user/project/src/index.ts') // Linux → '/home/user/project/src/index.ts'
 * resolveFileUrl('./src/index.ts') // 相对路径 → 相对于 cwd 的绝对路径
 */
export function resolveFileUrl(urlOrPath: string): string {
  if (urlOrPath.startsWith('file://')) {
    // 处理 Windows 路径：file:///C:/... → C:/...
    return fileURLToPath(urlOrPath as `file://${string}`);
  }
  return resolve(urlOrPath);
}

/**
 * 将文件系统路径转换为 file:// URL。
 * Windows 兼容：C:\project\src → file:///C:/project/src
 *
 * @param filePath - 文件系统路径（绝对或相对）
 * @returns file:// URL 字符串
 */
export function toFileUrl(filePath: string): string {
  const absolutePath = resolve(filePath);
  return pathToFileURL(absolutePath).href;
}
