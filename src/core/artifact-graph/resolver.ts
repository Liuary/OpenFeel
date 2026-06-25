/**
 * Schema 多层解析器 — 按优先级查找并加载 Schema 文件
 * 查找顺序：项目本地 > 用户家目录 > 包内置
 */
import path from 'node:path';
import { existsSync } from 'node:fs';
import os from 'node:os';
import { loadSchema, type Schema } from '../schema.js';

/**
 * 按优先级查找并加载工作流 Schema
 * @param name Schema 名称（对应 schemas/{name}/ 目录）
 * @param projectPath 项目根路径
 * @returns 验证后的 Schema 对象
 * @throws 所有路径均未找到时抛出异常
 */
export async function resolveSchema(
  name: string,
  projectPath: string
): Promise<Schema> {
  const paths = [
    // 1. 项目本地 .openfeel/schemas/{name}/schema.yaml
    path.join(projectPath, '.openfeel', 'schemas', name, 'schema.yaml'),
    // 2. 用户家目录 ~/.openfeel/schemas/{name}/schema.yaml
    path.join(os.homedir(), '.openfeel', 'schemas', name, 'schema.yaml'),
    // 3. 包内置 node_modules/openfeel/schemas/{name}/schema.yaml
    path.join(projectPath, 'node_modules', 'openfeel', 'schemas', name, 'schema.yaml'),
  ];

  for (const p of paths) {
    if (existsSync(p)) {
      return loadSchema(p);
    }
  }

  throw new Error(
    `找不到 Schema "${name}": 已搜索路径 ${paths.join(', ')}`
  );
}
