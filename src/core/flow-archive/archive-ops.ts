/**
 * 归档读写原语与索引管理 — 归档引擎的 IO 层
 * 职责：归档文件路径单点 / 写盘（独立锁 flow-archive + 原子写）/ 读取（宽容） / 列举 / meta.archived_versions 管理（纯内存）
 *       + pipeline 处置（纯内存）。
 * 写盘与锁复用 src/core/fs/ 工具层（原子写模式 + 建议性文件锁模式）；
 * 归档锁名 `flow-archive` 与 flow 锁**不嵌套**（裁定 P；核验 A19）。
 */
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { atomicWriteFileSync } from '../fs/atomic-write.js';
import { withFileLock, projectLockPath } from '../fs/file-lock.js';
import { versionOfStageId } from './grouping.js';
import type { FlowData, MetaPhase } from '../flow-manager.js';
import type { ArchiveFile } from './archive-file.js';

/** 归档写盘锁名（独立于 flow 锁；锁文件落 .openfeel/tmp/locks/flow-archive.lock） */
const ARCHIVE_LOCK_NAME = 'flow-archive';

/** 归档目录：{projectPath}/.openfeel/flow-archive（Q2 定稿：不纳入 WORKSPACE_DIRS，按需 mkdir 幂等创建） */
export function getArchiveDir(projectPath: string): string {
  return join(projectPath, '.openfeel', 'flow-archive');
}

/**
 * 归档文件路径：{archiveDir}/{version}.json（路径单点）。
 *
 * ⚠️ 仅接受**已校验**的版本字符串（经 `isValidArchiveVersion`，REV-78-011）：
 * 本函数只做拼接、不做合法性/路径穿越校验；调用方须先走 `isValidArchiveVersion`
 * 或使用上游已校验入口（`writeArchiveFile` / `readArchiveFile` / `listArchiveVersions`）。
 */
export function getArchiveFilePath(projectPath: string, version: string): string {
  return join(getArchiveDir(projectPath), `${version}.json`);
}

/**
 * 版本字符串合法性（探针法复用 parseStageId，禁自写正则）：
 * `${s}-stage-00` 可被 parseStageId 解析且版本段恒等 → 合法；空串/含路径分隔符/非版本形态 → 非法。
 *
 * 导出版（原私有版本校验函数重命名并导出），供命令层复用——REV-79-004。
 */
export function isValidArchiveVersion(s: string): boolean {
  if (s.length === 0) {
    return false;
  }
  return versionOfStageId(`${s}-stage-00`) === s;
}

/**
 * 版本号归一（输入前缀兼容）：trim → 去单个前导 `v`（如有）→ 补 `v` → 经 `isValidArchiveVersion` 校验。
 * 归一方向恒为「去 v 再加 v」：引擎键恒带 `v`（与 `versionOfStageId` 输出同形态；REV-79-004）。
 * **禁**复用 `normalizeVersion`（`src/core/plan/roadmap.ts:17`，方向相反：去 `v`）。
 *
 * 错误路径返回 null 的触发条件：空串 / 探针校验失败（非 vX.Y[.Z] 形态、含路径分隔符等）。
 */
export function normalizeArchiveVersion(input: string): string | null {
  const trimmed = input.trim();
  // 去单个前导 v（如 `vv1.1.7` 去后剩 `v1.1.7`，仍带 v → 校验失败 → null，防双前缀）
  const body = trimmed.startsWith('v') ? trimmed.slice(1) : trimmed;
  const candidate = `v${body}`;
  return isValidArchiveVersion(candidate) ? candidate : null;
}

/**
 * 写归档文件（覆盖写 = 同版本幂等；backup:false，D8 定稿）。
 * 独立锁 `flow-archive` 内原子写（同目录 temp + fsync + rename）；目录按需 mkdir（幂等）。
 * @throws 版本字符串非法（路径穿越防御，D9）或写盘失败
 */
export function writeArchiveFile(projectPath: string, file: ArchiveFile): void {
  if (!isValidArchiveVersion(file.version)) {
    // 破坏性写路径默认拒绝：非法版本（含路径分隔符/非版本形态）零写盘
    throw new Error(`归档版本非法：${file.version}`);
  }
  const filePath = getArchiveFilePath(projectPath, file.version);
  mkdirSync(getArchiveDir(projectPath), { recursive: true });
  const lockPath = projectLockPath(projectPath, ARCHIVE_LOCK_NAME);
  withFileLock(lockPath, () => {
    atomicWriteFileSync(filePath, JSON.stringify(file, null, 2) + '\n', { backup: false });
  });
}

/**
 * 列举已归档版本（目录扫描 + 文件名合法校验）。
 * 目录不存在 → []；仅收 `{version}.json` 且 version 通过 isValidArchiveVersion 者；返回字典序排序（非语义版本序）。
 */
export function listArchiveVersions(projectPath: string): string[] {
  const dir = getArchiveDir(projectPath);
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => name.slice(0, -'.json'.length))
    .filter((stem) => isValidArchiveVersion(stem))
    .sort();
}

/**
 * 读取归档文件。
 * 缺失 / 损坏（JSON 解析失败）/ 非法版本（路径穿越防御）/ 内容非对象 → null（不抛）；
 * 未知键保留（不重建对象）；缺 counts → 按实际长度回填（读时计算，不写盘）。
 */
export function readArchiveFile(projectPath: string, version: string): ArchiveFile | null {
  if (!isValidArchiveVersion(version)) {
    return null; // 读侧宽容：非法版本不抛，视同不可读
  }
  const filePath = getArchiveFilePath(projectPath, version);
  if (!existsSync(filePath)) {
    return null;
  }
  try {
    const raw = readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    // 合法 JSON 但非对象（null / 数组 / 数字 / 字符串）→ 视同损坏（契约：缺失/损坏/非法 → null，REV-78-012）
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    return withCountsFallback(parsed as ArchiveFile);
  } catch {
    // 损坏（解析失败）：返回 null 不崩溃（读侧宽容；kb 读侧分类范式）
    return null;
  }
}

/** 读侧宽容：counts 三段齐全则原样返回；否则按实际长度回填（读时计算，不写盘） */
function withCountsFallback(file: ArchiveFile): ArchiveFile {
  const counts = file.counts;
  if (
    counts &&
    typeof counts.stages === 'number' &&
    typeof counts.reviews === 'number' &&
    typeof counts.log === 'number'
  ) {
    return file;
  }
  const stages = file.stages ?? {};
  const reviews = file.reviews ?? [];
  const log = file.log ?? [];
  return {
    ...file,
    stages,
    reviews,
    log,
    counts: {
      stages: Object.keys(stages).length,
      reviews: reviews.length,
      log: log.length,
    },
  };
}

/**
 * 读取已归档版本索引（快照副本，防外部改内存；缺失/非数组 → []）。
 */
export function getArchivedVersions(data: FlowData): string[] {
  const list = data.meta?.archived_versions;
  return Array.isArray(list) ? [...list] : [];
}

/**
 * 追加已归档版本（幂等去重；**纯内存**，不写盘——持久化由命令层 save() 承担）。
 * @returns 是否新增（false = 已存在，no-op 不追加）
 */
export function addArchivedVersion(data: FlowData, version: string): boolean {
  if (!data.meta) {
    // 防御：缺 meta 的存量/损坏数据（与 save() 的 ??= 兜底同字面量）
    data.meta = { version: '1.0', project: '', updated: '', revision: 0 };
  }
  const existing = getArchivedVersions(data);
  if (existing.includes(version)) {
    return false; // 幂等：重复登记不追加
  }
  data.meta.archived_versions = [...existing, version];
  return true;
}

/**
 * 归档后 pipeline 处置（**纯内存**，不 IO；save 由调用方统一（裁定 P））。
 *
 * 前置条件：须在 stages 移除**之后**调用（phase 按归档后活跃集重算）。
 * - `pipeline.current.stage` 属被归档版本 → 置空 `{ stage: '', op: '' }`（currentCleared = true）。
 * - `pipeline.phase` 按活跃集重算：非空且全部 done → `'done'`，否则 `'active'`
 *   （**空集 → active**，与 `flow-manager.ts:1495-1496` 空集守卫同效；REV-79-005）。
 *
 * @returns currentCleared = current 是否命中被归档版本；phase = 处置后的 pipeline.phase
 */
export function applyArchivePipelineDisposition(
  data: FlowData,
  version: string,
): { currentCleared: boolean; phase: MetaPhase } {
  const current = data.pipeline?.current;
  // 命中被归档版本 → 置空 current（stage 与 op 同清；versionOfStageId('') === null 故空串永不命中）
  const currentCleared = !!current && versionOfStageId(current.stage) === version;
  if (currentCleared && data.pipeline) {
    data.pipeline.current = { stage: '', op: '' };
  }
  // 宏观 done 判定（空集守卫：无阶段视为非全 done → active）
  const allDone = Object.keys(data.stages).length > 0
    && Object.values(data.stages).every((s) => s.phase === 'done');
  data.pipeline.phase = allDone ? 'done' : 'active';
  return { currentCleared, phase: data.pipeline.phase };
}
