/**
 * 工作区目录创建
 * 负责创建项目下的 .openfeel/ 目录结构（v1.3.3 P2-4：核心必需 + 其余惰性）。
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

/**
 * 核心必需目录（init 时创建；被 flow / plan / kb / dev 模板直接依赖）。
 * v1.3.3 P2-4：由 10 个固定目录瘦身为 4 核心 + 6 惰性，降低冷启动前置开销。
 */
export const CORE_WORKSPACE_DIRS = ['plan', 'kb', 'dev', 'log'] as const;

/**
 * 惰性目录：首次使用时按需 `mkdir -p`（写路径已有/新增 `ensureLazyDir` 兜底）。
 * 不参与 init 冷启动；缺失不视为工作区损坏。
 */
export const LAZY_WORKSPACE_DIRS = [
  'code_review',
  'bugs',
  'users',
  'tmp',
  'manual',
  'update_conflicts',
] as const;

/**
 * 惰性目录清单（导出供 lint / 文档 / 测试复用）。
 */
export const WORKSPACE_LAZY_DIRS: readonly string[] = LAZY_WORKSPACE_DIRS;

/**
 * dev/ 下的子目录清单
 * - `note`：团队共享开发笔记
 * - `current_archive`：`current.md` 轮换归档目录（**公共域**，纳入版本管理；承载被轮换出的旧记录）
 */
const DEV_SUB_DIRS = ['note', 'current_archive'];

/**
 * 按需确保 `.openfeel/{name}` 惰性目录存在（幂等；仅接受 LAZY_WORKSPACE_DIRS 内的名字）。
 * 供写路径在首次落盘前调用；未知目录名直接忽略（防御，不建任意目录）。
 */
export function ensureLazyDir(projectPath: string, name: string): void {
  if (!(LAZY_WORKSPACE_DIRS as readonly string[]).includes(name)) {
    return;
  }
  ensureDir(resolve(projectPath, '.openfeel', name));
}

/**
 * 创建 .openfeel/ 目录结构（核心必需 + dev 子目录；惰性目录不建）。
 * @returns 本次新建的目录相对路径列表（既有目录不重复计入）
 */
export function createWorkspace(projectPath: string): string[] {
  const base = resolve(projectPath, '.openfeel');
  const created: string[] = [];

  // 确保根目录存在
  if (!existsSync(base)) {
    mkdirSync(base, { recursive: true });
    created.push('.openfeel/');
  }

  // 创建核心子目录
  for (const dir of CORE_WORKSPACE_DIRS) {
    const fullPath = resolve(base, dir);
    if (!existsSync(fullPath)) {
      mkdirSync(fullPath, { recursive: true });
      created.push(`.openfeel/${dir}/`);
    }
  }

  // 创建 dev 下的子目录
  const devBase = resolve(base, 'dev');
  for (const subDir of DEV_SUB_DIRS) {
    const fullPath = resolve(devBase, subDir);
    if (!existsSync(fullPath)) {
      mkdirSync(fullPath, { recursive: true });
      created.push(`.openfeel/dev/${subDir}/`);
    }
  }

  return created;
}
