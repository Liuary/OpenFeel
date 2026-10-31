/**
 * 恢复包（v1.5.3）
 *
 * 只读聚合：active stage/phase + 最近一次阶段转换 + `dev_last` 的交接摘要。
 * 目标：新会话一次 `feel_status` 就能拿到恢复所需的最小信息，不必先读全文状态文件。
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const HANDOFF_HEADINGS = ['## 交接摘要', '## 公共交接区'];
const MAX_HANDOFF_CHARS = 600;

/** @param {string} projectRoot */
function username(projectRoot) {
  try {
    const info = JSON.parse(readFileSync(join(projectRoot, '.openfeel', '.info.json'), 'utf-8'));
    if (typeof info.user === 'string' && info.user.trim() !== '') return info.user.trim();
  } catch {
    /* fallthrough */
  }
  return process.env.OPENFEEL_USER ?? 'user';
}

/**
 * 读取 `dev_last.md` 的交接摘要段（优先「交接摘要」，否则「公共交接区」）。
 * @param {string} projectRoot
 * @returns {string|null}
 */
export function readHandoff(projectRoot) {
  const file = join(projectRoot, '.openfeel', 'users', username(projectRoot), 'dev_last.md');
  let content;
  try {
    if (!existsSync(file)) return null;
    content = readFileSync(file, 'utf-8');
  } catch {
    return null;
  }
  let start = -1;
  for (const heading of HANDOFF_HEADINGS) {
    const idx = content.indexOf(heading);
    if (idx !== -1 && (start === -1 || idx < start)) start = idx;
  }
  if (start === -1) return null;
  const rest = content.slice(start);
  const nextHeading = rest.indexOf('\n## ', 1);
  const section = nextHeading === -1 ? rest : rest.slice(0, nextHeading);
  const text = section.trim();
  if (text === '') return null;
  return text.length > MAX_HANDOFF_CHARS ? `${text.slice(0, MAX_HANDOFF_CHARS)}…` : text;
}

/**
 * @param {string} projectRoot
 * @returns {{
 *   stage: string|null, phase: string|null, requirement: string|null,
 *   lastTransition: {action:string,time:string,stage:string|null,from:string|null,to:string|null}|null,
 *   handoff: string|null, hasDevLast: boolean
 * }}
 */
export function readRecovery(projectRoot) {
  const result = {
    stage: null,
    phase: null,
    requirement: null,
    lastTransition: null,
    lastError: null,
    resumeCount: 0,
    handoff: readHandoff(projectRoot),
    hasDevLast: existsSync(join(projectRoot, '.openfeel', 'users', username(projectRoot), 'dev_last.md')),
  };
  try {
    const flow = JSON.parse(readFileSync(join(projectRoot, '.openfeel', 'flow.json'), 'utf-8'));
    const stages = flow.stages ?? {};
    const active = Object.entries(stages).find(([, stage]) => stage.phase !== 'done');
    if (active) {
      result.stage = active[0];
      result.phase = active[1]?.phase ?? null;
      result.requirement = active[1]?.requirement_id ?? null;
    }
    const log = Array.isArray(flow.log) ? flow.log : [];
    // v1.5.4：活跃阶段的最近失败 / resume 次数（从 200 条日志派生，不新增存储）
    if (result.stage !== null) {
      for (const entry of log) {
        const detail = entry?.detail ?? {};
        if (detail.stageName !== result.stage && detail.stage !== result.stage) continue;
        if (entry.action === 'advance_stage_phase' && (detail.to === 'review_failed' || detail.to === 'test_failed')) {
          result.lastError = { phase: detail.to, time: entry.time ?? '' };
        }
        if (detail.resumed === true) result.resumeCount += 1;
      }
    }
    for (let i = log.length - 1; i >= 0; i -= 1) {
      const entry = log[i];
      if (entry?.action === 'advance_stage_phase') {
        const detail = entry.detail ?? {};
        result.lastTransition = {
          action: entry.action,
          time: entry.time ?? '',
          stage: typeof detail.stageName === 'string' ? detail.stageName : null,
          from: typeof detail.from === 'string' ? detail.from : null,
          to: typeof detail.to === 'string' ? detail.to : null,
        };
        break;
      }
    }
    if (result.lastTransition === null && log.length > 0) {
      const last = log[log.length - 1];
      result.lastTransition = {
        action: last.action ?? '',
        time: last.time ?? '',
        stage: null,
        from: null,
        to: null,
      };
    }
  } catch {
    /* 损坏时降级为 handoff only */
  }
  return result;
}
