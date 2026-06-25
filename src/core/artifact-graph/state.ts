/**
 * 文件系统状态检测 — 扫描产物文件判断 artifact 是否已完成
 * 使用 fast-glob 支持 glob 模式匹配
 */
import fg from 'fast-glob';
import type { Schema } from '../schema.js';

/**
 * 扫描文件系统，检查每个 artifact 的 generates 产物是否存在
 * @param schema 工作流 Schema
 * @param basePath 项目根路径（glob 搜索的基准目录）
 * @returns 产物已存在的 artifact ID 集合
 */
export async function detectCompletedArtifacts(
  schema: Schema,
  basePath: string
): Promise<Set<string>> {
  const completed = new Set<string>();

  for (const artifact of schema.artifacts) {
    const pattern = artifact.generates;
    // 使用 fast-glob 匹配产物文件
    const files = await fg(pattern, { cwd: basePath, onlyFiles: true });
    if (files.length > 0) {
      completed.add(artifact.id);
    }
  }

  return completed;
}
