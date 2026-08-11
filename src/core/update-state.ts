/**
 * update_state.json 读写模块
 * 负责管理 .openfeel/update_state.json 的 hash 追踪和冲突标记状态，
 * 为 openfeel update 的增量更新 + 冲突检测机制提供基础。
 *
 * hash 算法：SHA-256（Node.js 内置 crypto），不引入新 npm 依赖。
 * 降级策略：loadUpdateState() 返回 null 时，调用方回退到"全量覆盖 + 重建 state"模式。
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { z } from 'zod';

// ─── Zod Schema ──────────────────────────────────────────────────────

/** 单文件状态 */
const FileStateSchema = z.object({
  hash: z.string(),
  status: z.enum(['clean', 'conflict']),
});

/** update_state.json 顶层 Schema */
export const UpdateStateSchema = z.object({
  version: z.literal('1.0'),
  last_update: z.string(),
  openfeel_version: z.string(),
  files: z.record(z.string(), FileStateSchema),
});

export type UpdateState = z.infer<typeof UpdateStateSchema>;
export type FileState = z.infer<typeof FileStateSchema>;

// ─── 常量 ────────────────────────────────────────────────────────────

/** update_state.json 在项目中的相对路径 */
const STATE_FILE = '.openfeel/update_state.json';

// ─── 公开 API ────────────────────────────────────────────────────────

/**
 * 计算字符串的 SHA-256 哈希（hex 编码）
 *
 * REV-002：行尾归一化（CRLF → LF），避免跨平台行尾符差异导致误报
 */
export function hashContent(content: string): string {
  // 行尾归一化：CRLF / CR → LF（参见 kb/patterns.md #跨平台构建管线中的行尾归一化模式）
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return createHash('sha256').update(normalized, 'utf-8').digest('hex');
}

/**
 * 获取 OpenFeel 工具自身版本号
 * 通过 createRequire 从工具自身 package.json 读取（src/core/ 下相对 ../../package.json，
 * 编译产物 dist/core/ 下同样相对 ../../package.json，两个环境路径一致）。
 */
export function getOpenfeelVersion(): string {
  // 工具自身 package.json（src/core/update-state.ts → ../../package.json = 项目根）
  const require = createRequire(import.meta.url);
  const pkg = require('../../package.json') as { version: string };
  return pkg.version;
}

/** 获取 update_state.json 的绝对路径 */
function getStatePath(projectPath: string): string {
  return resolve(projectPath, STATE_FILE);
}

/**
 * 读取 update_state.json
 * 不存在或校验失败 → 返回 null（降级为"全量覆盖"模式）
 */
export function loadUpdateState(projectPath: string): UpdateState | null {
  const statePath = getStatePath(projectPath);
  if (!existsSync(statePath)) {
    return null;
  }
  try {
    const raw = readFileSync(statePath, 'utf-8');
    const data = JSON.parse(raw);
    const result = UpdateStateSchema.safeParse(data);
    if (!result.success) {
      console.warn(
        `[update] update_state.json schema mismatch, treating as first update: ${result.error.message}`,
      );
      return null;
    }
    return result.data;
  } catch {
    // parse 失败 → 降级
    return null;
  }
}

/**
 * 写入 update_state.json（缩进 JSON，末尾换行）
 */
export function saveUpdateState(
  projectPath: string,
  state: UpdateState,
): void {
  const statePath = getStatePath(projectPath);
  mkdirSync(dirname(statePath), { recursive: true });
  writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n', 'utf-8');
}

/**
 * 首次 update 时创建初始状态
 * @param projectPath 目标项目路径
 * @param files 受管文件的 { 相对路径 → 文件内容 } 映射
 */
export function createUpdateState(
  projectPath: string,
  files: Record<string, string>,
): UpdateState {
  const fileEntries: Record<string, FileState> = {};
  for (const [path, content] of Object.entries(files)) {
    fileEntries[path] = {
      hash: hashContent(content),
      status: 'clean',
    };
  }
  // 确保其父目录存在（首次 write 时 .openfeel 可能已存在也可能不存在）
  mkdirSync(dirname(getStatePath(projectPath)), { recursive: true });

  return {
    version: '1.0',
    last_update: new Date().toISOString(),
    openfeel_version: getOpenfeelVersion(),
    files: fileEntries,
  };
}

/**
 * 原地更新 state 中单个文件的 hash，status 标记为 clean
 */
export function updateFileHash(
  state: UpdateState,
  relativePath: string,
  content: string,
): void {
  state.files[relativePath] = {
    hash: hashContent(content),
    status: 'clean',
  };
}

/**
 * 原地标记单个文件的 status 为 conflict
 */
export function markFileConflict(
  state: UpdateState,
  relativePath: string,
): void {
  state.files[relativePath] = {
    hash: state.files[relativePath]?.hash ?? '',
    status: 'conflict',
  };
}
