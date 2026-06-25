/**
 * 工作区目录创建
 * 负责创建项目下的 .openfeel/ 完整目录结构。
 */
import { mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * 递归创建目录（若不存在）
 */
export function ensureDir(path: string): void {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

/** .openfeel/ 下的子目录清单 */
const WORKSPACE_DIRS = [
  'roadmap',
  'stages',
  'kb',
  'dev',
  'log',
  'code_review',
  'bugs',
  'tmp',
];

/**
 * 创建 .openfeel/ 完整目录结构
 */
export function createWorkspace(projectPath: string): string[] {
  const base = resolve(projectPath, '.openfeel');
  const created: string[] = [];

  // 确保根目录存在
  if (!existsSync(base)) {
    mkdirSync(base, { recursive: true });
    created.push('.openfeel/');
  }

  // 创建子目录
  for (const dir of WORKSPACE_DIRS) {
    const fullPath = resolve(base, dir);
    if (!existsSync(fullPath)) {
      mkdirSync(fullPath, { recursive: true });
      created.push(`.openfeel/${dir}/`);
    }
  }

  return created;
}
