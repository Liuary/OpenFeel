/**
 * 会话标识模块（v1.2.1-stage-86 op-002 · T2）
 *
 * 职责：为 CLI 运行日志（start/done 行）与流水线审计（跨会话恢复标注）提供**会话标识**。
 * 三级链（优先级降序；`projectPath` 缺省 = `process.cwd()`）：
 *   1. `env`     —— harness 环境变量实测命中（`SESSION_ENV_CANDIDATES`）
 *   2. `project` —— 项目续接文件 `<projectPath>/.openfeel/tmp/session.json`
 *   3. `proc`    —— 单进程兜底（随机 UUID 短前缀；**不写文件**）
 * 标识值含来源前缀（`env:` / `project:` / `proc:`），机器可判人工 vs 自动化。
 *
 * 设计边界：
 * - **全部 IO try/catch 静默**：本模块任何失败都不得中断 CLI（best-effort）。
 * - **`proc` 级不落盘**：保持「单进程」语义，防把自动化进程固化成跨进程会话。
 * - **禁止 TTL 猜测**：无过期 / 无轮换逻辑；轮换仅由「env 值变化」驱动。
 * - **不 import runtime-log / flow-manager**（二者均为本模块消费方，防 import 环 R-86-7）。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

/** 会话标识来源：env（harness 环境）/ project（项目续接文件）/ proc（单进程兜底） */
export type SessionSource = 'env' | 'project' | 'proc';

/** 会话标识：id 含来源前缀（env: / project: / proc:），机器可判人工 vs 自动化 */
export interface SessionIdentity {
  id: string;
  source: SessionSource;
}

/** env 候选清单（仅录入实机实测命中者；R-86-3——执行期实测为准增删） */
const SESSION_ENV_CANDIDATES: readonly string[] = ['CLAUDE_CODE_SESSION_ID'];

/** 续接文件相对路径（项目域；`tmp/` 处 `.gitignore` 忽略范围） */
const SESSION_FILE_REL = join('.openfeel', 'tmp', 'session.json');

/** 按 projectPath memoize（同进程内稳定；resetSessionCache 清零） */
const cache = new Map<string, SessionIdentity>();

/** 续接文件完整路径 */
function sessionFilePath(projectPath: string): string {
  return join(projectPath, SESSION_FILE_REL);
}

/**
 * 读取续接文件内的 `session_id`。
 * @returns trim 后非空的 session_id；文件缺失 / JSON 损坏 / 值非法 → null（调用方回落下一级）
 */
function readProjectSessionId(projectPath: string): string | null {
  try {
    const raw = readFileSync(sessionFilePath(projectPath), 'utf-8');
    const parsed = JSON.parse(raw) as { session_id?: unknown };
    const value = typeof parsed?.session_id === 'string' ? parsed.session_id.trim() : '';
    // 空值 / 非字符串 → 视为无续接
    return value.length > 0 ? value : null;
  } catch {
    // 文件缺失 / JSON 损坏 / 读取失败 → 视为无续接
    return null;
  }
}

/**
 * best-effort 维护续接文件（env 命中时调用；文件缺失或值不一致时更新）。
 * 任何失败静默——会话标识仍以 env 值返回，绝不中断 CLI。
 */
function writeProjectSession(projectPath: string, sessionId: string): void {
  try {
    if (existsSync(sessionFilePath(projectPath)) && readProjectSessionId(projectPath) === sessionId) {
      return; // 已一致 → 不重复写
    }
    const filePath = sessionFilePath(projectPath);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(
      filePath,
      JSON.stringify({ session_id: sessionId, source: 'env', started_at: new Date().toISOString() }, null, 2) + '\n',
      'utf-8',
    );
  } catch {
    // 写续接文件失败（权限 / 磁盘 / 路径非法）→ 静默
  }
}

/**
 * 解析当前会话标识（三级链；按 projectPath memoized）。
 * @param opts.env 环境变量表（缺省 = process.env；注入以便单测）
 * @param opts.projectPath 项目根路径（缺省 = process.cwd()）
 */
export function getSessionIdentity(opts: { env?: NodeJS.ProcessEnv; projectPath?: string } = {}): SessionIdentity {
  const env = opts.env ?? process.env;
  const projectPath = resolve(opts.projectPath ?? process.cwd());

  const cached = cache.get(projectPath);
  if (cached) {
    return cached;
  }

  // 1) env：harness 环境变量（值须非空且 trim 非空才命中）
  for (const name of SESSION_ENV_CANDIDATES) {
    const value = (env[name] ?? '').trim();
    if (value.length === 0) {
      continue;
    }
    const identity: SessionIdentity = { id: 'env:' + value, source: 'env' };
    writeProjectSession(projectPath, value);  // best-effort 续接（失败静默）
    cache.set(projectPath, identity);
    return identity;
  }

  // 2) project：项目续接文件
  const projectId = readProjectSessionId(projectPath);
  if (projectId !== null) {
    const identity: SessionIdentity = { id: 'project:' + projectId, source: 'project' };
    cache.set(projectPath, identity);
    return identity;
  }

  // 3) proc：单进程兜底（不写文件——保持「单进程」语义）
  const identity: SessionIdentity = { id: 'proc:' + randomUUID().slice(0, 8), source: 'proc' };
  cache.set(projectPath, identity);
  return identity;
}

/** 会话标识字符串（= `getSessionIdentity().id`，含来源前缀） */
export function getSessionId(opts?: { env?: NodeJS.ProcessEnv; projectPath?: string }): string {
  return getSessionIdentity(opts).id;
}

/** 清空 memo（测试用——模块态隔离） */
export function resetSessionCache(): void {
  cache.clear();
}
