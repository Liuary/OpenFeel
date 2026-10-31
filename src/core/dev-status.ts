/**
 * dev 状态同步（v1.5.0）
 *
 * 目标：把「dev_last / 进度记录」从模型每次主动维护，降级为：
 * - CLI 在节点（阶段开始 / 转折 / 结束）与定期检查（默认 30 分钟）时自动写一段**简要状态块**；
 * - 模型只在开始 / 转折 / 结束写「交接摘要」，不再写流水账；
 * - 子 agent 完全不读写这些文件（信息由 Feel 的调度/交接文档传递）。
 *
 * 文件：
 * - `.openfeel/dev/.sync.json`            同步元数据（last_sync / interval_minutes）
 * - `.openfeel/users/{user}/dev_last.md`  受管 AUTO 块（其余内容不动）
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { atomicWriteFileSync } from './fs/atomic-write.js';

/** 默认同步间隔（分钟） */
export const DEFAULT_SYNC_INTERVAL_MINUTES = 30;

const AUTO_BEGIN = '<!-- openfeel:auto:begin -->';
const AUTO_END = '<!-- openfeel:auto:end -->';

/** 同步元数据 */
export interface DevSyncMeta {
  version: number;
  last_sync: string;
  interval_minutes: number;
}

/** dev 状态快照 */
export interface DevStatus {
  lastSync: string | null;
  intervalMinutes: number;
  due: boolean;
  stage: string | null;
  phase: string | null;
  requirement: string | null;
  lastAction: string | null;
  lastActionAt: string | null;
}

/** dev 目录 */
function devDir(projectPath: string): string {
  return join(projectPath, '.openfeel', 'dev');
}

/** 同步元数据文件 */
function syncMetaPath(projectPath: string): string {
  return join(devDir(projectPath), '.sync.json');
}

/** 用户名（.info.json → 环境变量 → 'user'） */
function username(projectPath: string): string {
  try {
    const info = JSON.parse(readFileSync(join(projectPath, '.openfeel', '.info.json'), 'utf-8')) as { user?: string };
    if (typeof info.user === 'string' && info.user.trim() !== '') return info.user.trim();
  } catch {
    /* fallthrough */
  }
  return process.env.OPENFEEL_USER ?? 'user';
}

/** dev_last.md 路径 */
export function devLastPath(projectPath: string): string {
  return join(projectPath, '.openfeel', 'users', username(projectPath), 'dev_last.md');
}

/** 读取同步元数据（缺失/损坏 → null） */
export function readSyncMeta(projectPath: string): DevSyncMeta | null {
  const file = syncMetaPath(projectPath);
  if (!existsSync(file)) return null;
  try {
    const raw = JSON.parse(readFileSync(file, 'utf-8')) as Partial<DevSyncMeta>;
    if (typeof raw.last_sync !== 'string') return null;
    return {
      version: typeof raw.version === 'number' ? raw.version : 1,
      last_sync: raw.last_sync,
      interval_minutes: typeof raw.interval_minutes === 'number' && raw.interval_minutes > 0
        ? raw.interval_minutes
        : DEFAULT_SYNC_INTERVAL_MINUTES,
    };
  } catch {
    return null;
  }
}

/** 读取流水线简要状态（直接读 flow.json，避免循环依赖） */
function readPipelineBrief(projectPath: string): {
  stage: string | null; phase: string | null; requirement: string | null;
  lastAction: string | null; lastActionAt: string | null; stageCount: number;
} {
  const empty = { stage: null, phase: null, requirement: null, lastAction: null, lastActionAt: null, stageCount: 0 };
  try {
    const flow = JSON.parse(readFileSync(join(projectPath, '.openfeel', 'flow.json'), 'utf-8')) as {
      stages?: Record<string, { phase?: string; requirement_id?: string | null }>;
      log?: Array<{ time?: string; action?: string }>;
    };
    const stages = flow.stages ?? {};
    const active = Object.entries(stages).find(([, s]) => s.phase !== 'done');
    const lastLog = Array.isArray(flow.log) && flow.log.length > 0 ? flow.log[flow.log.length - 1] : null;
    return {
      stage: active?.[0] ?? null,
      phase: active?.[1]?.phase ?? null,
      requirement: active?.[1]?.requirement_id ?? null,
      lastAction: lastLog?.action ?? null,
      lastActionAt: lastLog?.time ?? null,
      stageCount: Object.keys(stages).length,
    };
  } catch {
    return empty;
  }
}

/** 只读状态：是否到期 + 简要流水线信息 */
export function getDevStatus(projectPath: string, now: Date = new Date()): DevStatus {
  const meta = readSyncMeta(projectPath);
  const brief = readPipelineBrief(projectPath);
  const interval = meta?.interval_minutes ?? DEFAULT_SYNC_INTERVAL_MINUTES;
  let due = true;
  if (meta !== null) {
    const last = Date.parse(meta.last_sync);
    due = !Number.isFinite(last) || now.getTime() - last >= interval * 60_000;
  }
  return {
    lastSync: meta?.last_sync ?? null,
    intervalMinutes: interval,
    due,
    stage: brief.stage,
    phase: brief.phase,
    requirement: brief.requirement,
    lastAction: brief.lastAction,
    lastActionAt: brief.lastActionAt,
  };
}

/** 生成受管 AUTO 块（保持极简，避免上下文膨胀） */
function renderAutoBlock(status: DevStatus, note: string | undefined, syncedAt: string): string {
  const stageLine = status.stage === null
    ? '无'
    : `\`${status.stage}\` / \`${status.phase ?? '?'}\``;
  const reqLine = status.requirement === null ? '无' : `\`${status.requirement}\``;
  const lastLine = status.lastAction === null
    ? '无'
    : `\`${status.lastAction}\`${status.lastActionAt ? ` @ ${status.lastActionAt}` : ''}`;
  const lines = [
    AUTO_BEGIN,
    '## 自动状态（CLI 维护，勿手改）',
    `- 同步时间：${syncedAt}`,
    `- 活跃阶段：${stageLine}`,
    `- 关联需求：${reqLine}`,
    `- 最近操作：${lastLine}`,
  ];
  if (note !== undefined && note.trim() !== '') {
    lines.push(`- 备注：${note.trim()}`);
  }
  lines.push(AUTO_END);
  return lines.join('\n');
}

/** 将 AUTO 块写入 dev_last.md（替换既有块或插入；不触碰手写内容） */
function writeAutoBlock(projectPath: string, block: string): void {
  const file = devLastPath(projectPath);
  const dir = dirname(file);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  let content = existsSync(file)
    ? readFileSync(file, 'utf-8')
    : '# dev_last — 索引\n\n> v1.5.0：自动状态由 CLI 维护；手写交接摘要放在「公共交接区」。\n\n## 公共交接区\n\n';
  const begin = content.indexOf(AUTO_BEGIN);
  const end = content.indexOf(AUTO_END);
  if (begin !== -1 && end !== -1 && end > begin) {
    content = `${content.slice(0, begin)}${block}${content.slice(end + AUTO_END.length)}`;
  } else {
    const firstHeading = content.indexOf('\n## ');
    content = firstHeading !== -1
      ? `${content.slice(0, firstHeading)}\n\n${block}\n${content.slice(firstHeading)}`
      : `${content}\n${block}\n`;
  }
  atomicWriteFileSync(file, content);
}

/** 执行同步：写 AUTO 块 + 刷新 .sync.json */
export function syncDevStatus(
  projectPath: string,
  options: { note?: string; now?: Date } = {},
): { status: DevStatus; file: string; syncedAt: string } {
  const now = options.now ?? new Date();
  const status = getDevStatus(projectPath, now);
  const syncedAt = now.toISOString();
  writeAutoBlock(projectPath, renderAutoBlock(status, options.note, syncedAt));
  const dev = devDir(projectPath);
  if (!existsSync(dev)) mkdirSync(dev, { recursive: true });
  const meta: DevSyncMeta = {
    version: 1,
    last_sync: syncedAt,
    interval_minutes: DEFAULT_SYNC_INTERVAL_MINUTES,
  };
  writeFileSync(syncMetaPath(projectPath), `${JSON.stringify(meta, null, 2)}\n`, 'utf-8');
  return { status: { ...status, lastSync: syncedAt, due: false }, file: devLastPath(projectPath), syncedAt };
}

/** 是否处于「节点」（开始 / 转折 / 结束）：需要主动同步 */
export function isSyncNodePhase(phase: string | null): boolean {
  return phase === 'exec_running'
    || phase === 'review_passed'
    || phase === 'archiving'
    || phase === 'done';
}
