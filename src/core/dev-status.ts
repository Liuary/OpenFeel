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
import { stageRequirementIds } from './req/stage-links.js';   // 阶段↔需求关联读取单点（v1.5.8 / REQ-028；零运行时环）

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
  /** 首个关联需求（单值兼容面；多值请看 requirements） */
  requirement: string | null;
  /** 关联需求列表（v1.5.24 / REQ-048：多需求阶段不再少报） */
  requirements: string[];
  /** 关联需求完成度（done / total） */
  requirementProgress: { done: number; total: number };
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
  requirements: string[]; requirementProgress: { done: number; total: number };
  lastAction: string | null; lastActionAt: string | null; stageCount: number;
} {
  const empty = {
    stage: null, phase: null, requirement: null,
    requirements: [] as string[], requirementProgress: { done: 0, total: 0 },
    lastAction: null, lastActionAt: null, stageCount: 0,
  };
  try {
    const flow = JSON.parse(readFileSync(join(projectPath, '.openfeel', 'flow.json'), 'utf-8')) as {
      stages?: Record<string, {
        phase?: string;
        requirement_id?: string | null;
        // v1.5.8 / REQ-028 多值关联（原始 JSON 读取面；经 stageRequirementIds 单点兜底旧字段）
        requirements?: Array<{ id?: string } | null>;
      }>;
      requirements?: Array<{ id?: string; status?: string }>;
      log?: Array<{ time?: string; action?: string }>;
    };
    const stages = flow.stages ?? {};
    const active = Object.entries(stages).find(([, s]) => s.phase !== 'done');
    const lastLog = Array.isArray(flow.log) && flow.log.length > 0 ? flow.log[flow.log.length - 1] : null;
    // v1.5.24 / REQ-048：关联需求取**全部**（读侧单点 stageRequirementIds，兼容旧单值字段）
    const requirements = active ? stageRequirementIds(active[1]) : [];
    const statusById = new Map<string, string>();
    for (const req of Array.isArray(flow.requirements) ? flow.requirements : []) {
      if (typeof req?.id === 'string') statusById.set(req.id, typeof req.status === 'string' ? req.status : '');
    }
    const done = requirements.filter((id) => statusById.get(id) === 'done').length;
    return {
      stage: active?.[0] ?? null,
      phase: active?.[1]?.phase ?? null,
      // 单值兼容面：首个关联需求
      requirement: requirements[0] ?? null,
      requirements,
      requirementProgress: { done, total: requirements.length },
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
    requirements: brief.requirements,
    requirementProgress: brief.requirementProgress,
    lastAction: brief.lastAction,
    lastActionAt: brief.lastActionAt,
  };
}

/** 生成受管 AUTO 块（保持极简，避免上下文膨胀） */
function renderAutoBlock(status: DevStatus, note: string | undefined, syncedAt: string): string {
  const stageLine = status.stage === null
    ? '无'
    : `\`${status.stage}\` / \`${status.phase ?? '?'}\``;
  const reqLine = status.requirements.length === 0
    ? '无'
    : `${status.requirements.map((id) => `\`${id}\``).join(', ')}（${status.requirementProgress.done}/${status.requirementProgress.total} 完成）`;
  const lastLine = status.lastAction === null
    ? '无'
    : `\`${status.lastAction}\`${status.lastActionAt ? ` @ ${status.lastActionAt}` : ''}`;
  const lines = [
    AUTO_BEGIN,
    '## 自动状态（CLI 维护，勿手改）',
    // v1.5.24 / REQ-047：这行只在**状态变化**时刷新（状态未变时 syncDevStatus 跳过整块重写，
    // 避免噪音），所以它表示「状态更新于」而非「本次同步时间」——后者看 `.openfeel/dev/.sync.json`。
    `- 状态更新于：${syncedAt}`,
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

/** current.md 路径（团队文件；v1.5.24 / REQ-048 起也带 AUTO 块） */
export function currentMdPath(projectPath: string): string {
  return join(devDir(projectPath), 'current.md');
}

/** 将 AUTO 块写入指定文件（替换既有块或插入首个标题前；不触碰手写内容） */
function writeAutoBlock(file: string, block: string, fallbackHeader: string): void {
  const dir = dirname(file);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  let content = existsSync(file) ? readFileSync(file, 'utf-8') : fallbackHeader;
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

/** 单文件「块是否变化」（忽略状态更新行；旧「同步时间」标签会触发一次迁移重写） */
function blockChanged(file: string, block: string): boolean {
  if (!existsSync(file)) return true;
  const existing = readFileSync(file, 'utf-8');
  const begin = existing.indexOf(AUTO_BEGIN);
  const end = existing.indexOf(AUTO_END);
  if (begin === -1 || end === -1 || end <= begin) return true;
  const oldBlock = existing.slice(begin, end + AUTO_END.length);
  const stateKey = (text: string): string => text
    .split('\n')
    .filter((line) => !line.startsWith('- 状态更新于：'))
    .join('\n');
  return stateKey(oldBlock) !== stateKey(block);
}

/**
 * 执行同步：写 AUTO 块（`dev_last.md` + `dev/current.md`）+ 刷新 `.sync.json`。
 *
 * v1.5.24 / REQ-048：状态类文件应当**自动维护**，否则 AI 检查时会读到过期内容。
 * `current.md` 不再停留在模板/上古内容——它同样吃受管块，手写的「近期提交记录」区段不受影响。
 * 状态未变时跳过对应文件的重写（减少噪音）；任一文件被重写则 `changed=true`。
 */
export function syncDevStatus(
  projectPath: string,
  options: { note?: string; now?: Date } = {},
): { status: DevStatus; file: string; syncedAt: string; changed: boolean } {
  const now = options.now ?? new Date();
  const status = getDevStatus(projectPath, now);
  const syncedAt = now.toISOString();
  const block = renderAutoBlock(status, options.note, syncedAt);

  let changed = false;
  const targets = [
    { file: devLastPath(projectPath), header: '# dev_last — 索引\n\n> v1.5.0：自动状态由 CLI 维护；手写交接摘要放在「公共交接区」。\n\n## 公共交接区\n\n' },
    { file: currentMdPath(projectPath), header: '# 当前进度\n\n> （CLI 自动状态块；手写「近期提交记录」不受影响）\n' },
  ];
  for (const target of targets) {
    if (!blockChanged(target.file, block)) continue;
    // current.md 不凭空创建：项目没这个东西就只维护 dev_last（存量项目兼容）
    if (target.file === currentMdPath(projectPath) && !existsSync(target.file)) continue;
    writeAutoBlock(target.file, block, target.header);
    changed = true;
  }

  const dev = devDir(projectPath);
  if (!existsSync(dev)) mkdirSync(dev, { recursive: true });
  const meta: DevSyncMeta = {
    version: 1,
    last_sync: syncedAt,
    interval_minutes: DEFAULT_SYNC_INTERVAL_MINUTES,
  };
  writeFileSync(syncMetaPath(projectPath), `${JSON.stringify(meta, null, 2)}\n`, 'utf-8');
  return { status: { ...status, lastSync: syncedAt, due: false }, file: devLastPath(projectPath), syncedAt, changed };
}

/** 是否处于「节点」（开始 / 转折 / 结束）：需要主动同步 */
export function isSyncNodePhase(phase: string | null): boolean {
  return phase === 'exec_running'
    || phase === 'review_passed'
    || phase === 'archiving'
    || phase === 'done';
}
