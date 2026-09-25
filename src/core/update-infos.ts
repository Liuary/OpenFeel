/**
 * update_infos.md 读写模块
 * 记录 openfeel update 因目标文件无控制区标记而追加的受管内容，
 * 以及标记解析异常（malformed）未写入、待人工修复的文件，供会话启动时检查并修复（op-003 消费）。
 *
 * 路径二元组（REV-903）：全局资产记绝对路径；项目资产记「项目根 + 相对路径」。
 * 写入走全局文件锁 + 原子写（跨项目共享，N7）。
 */
import { existsSync, readFileSync } from 'node:fs';
import { atomicWriteFileSync } from './fs/atomic-write.js';
import { withFileLock, globalLockPath } from './fs/file-lock.js';
import { getGlobalUpdateInfosPath } from './global-paths.js';

/** 条目类型：追加（无标记）/ 异常（标记解析失败，未写入待人工修复） */
export type UpdateInfoKind = 'appended' | 'anomaly';

/** 单条记录 */
export interface UpdateInfoEntry {
  kind: UpdateInfoKind;
  absolutePath: string | null;   // 全局资产：绝对路径；项目资产：null
  projectRoot: string | null;    // 项目资产：项目根绝对路径；全局资产：null
  relativePath: string | null;   // 项目资产：相对路径；全局资产：null
  timestamp: string;             // ISO 时间戳
  resolved: boolean;             // - [x] 已复核 / - [ ] 待复核
}

/** 追加目标（绝对路径 或 项目根+相对路径 二元组，二选一） */
export interface UpdateInfoTarget {
  absolutePath?: string;
  projectRoot?: string;
  relativePath?: string;
}

/** 节标题（追加 / 异常） */
const SECTION_TITLES: Record<UpdateInfoKind, string> = {
  appended: '## 追加（无标记 → 末尾追加受管区）',
  anomaly: '## 异常（标记解析失败 → 未写入，需人工修复标记）',
};

const FILE_HEADER = [
  '# OpenFeel 增量更新记录',
  '',
  '> 本文件记录 `openfeel update` 因目标文件无控制区标记而追加的受管内容，',
  '> 以及标记解析异常（malformed）未写入、待人工修复的文件，',
  '> 供会话启动时检查并修复。修复完成后勾选对应条目。',
  '',
].join('\n');

/** 生成条目展示路径（项目资产二元组形式） */
function displayPath(e: UpdateInfoEntry): string {
  if (e.absolutePath !== null) {
    return e.absolutePath;
  }
  return `${e.relativePath} (项目: ${e.projectRoot})`;
}

/** 序列化全部条目为 markdown 文本 */
function serialize(entries: UpdateInfoEntry[]): string {
  const byKind = (k: UpdateInfoKind) => entries.filter((e) => e.kind === k);
  const section = (k: UpdateInfoKind) => {
    const list = byKind(k)
      .map((e) => `- [${e.resolved ? 'x' : ' '}] \`${displayPath(e)}\`（${e.timestamp}）`)
      .join('\n');
    return `${SECTION_TITLES[k]}\n${list}`;
  };
  return `${FILE_HEADER}\n${section('appended')}\n\n${section('anomaly')}\n`;
}

/** 从条目行解析 path 与 timestamp（容错，解析失败返回 null） */
function parseLine(line: string, kind: UpdateInfoKind): UpdateInfoEntry | null {
  const m = line.match(/^- \[([ x])\] `(.+)`（(.+)）$/);
  if (!m) {
    return null;
  }
  const display = m[2];
  const projMatch = display.match(/^(.*) \(项目: (.*)\)$/);
  if (projMatch) {
    return { kind, absolutePath: null, projectRoot: projMatch[2], relativePath: projMatch[1], timestamp: m[3], resolved: m[1] === 'x' };
  }
  return { kind, absolutePath: display, projectRoot: null, relativePath: null, timestamp: m[3], resolved: m[1] === 'x' };
}

/**
 * 读取 update_infos.md 并解析为条目列表。
 * 不存在 → []；解析失败（损坏）→ 警告 + []（降级，不中断）。
 */
export function loadUpdateInfos(): UpdateInfoEntry[] {
  const path = getGlobalUpdateInfosPath();
  if (!existsSync(path)) {
    return [];
  }
  try {
    const text = readFileSync(path, 'utf-8');
    const entries: UpdateInfoEntry[] = [];
    let currentKind: UpdateInfoKind = 'appended';
    for (const line of text.split('\n')) {
      if (line.startsWith('## 追加')) { currentKind = 'appended'; continue; }
      if (line.startsWith('## 异常')) { currentKind = 'anomaly'; continue; }
      if (!line.startsWith('- [')) {
        continue;
      }
      const e = parseLine(line, currentKind);
      if (e) {
        entries.push(e);
      }
    }
    return entries;
  } catch {
    // 读取失败（损坏/权限）：降级为空条目，不中断
    console.warn('[update] update_infos.md 解析失败，视为无条目');
    return [];
  }
}

/**
 * 追加一条记录（加锁 + 原子写全量重写）。
 * target：全局资产传 { absolutePath }；项目资产传 { projectRoot, relativePath }。
 */
export function appendUpdateInfo(kind: UpdateInfoKind, target: UpdateInfoTarget): void {
  withFileLock(globalLockPath('update-infos'), () => {
    const entries = loadUpdateInfos();
    // anomaly 类按路径去重：同路径已有未修复（resolved=false）的 anomaly 条目则跳过，避免每次 update 无限累积（REV-1103）
    if (kind === 'anomaly') {
      const dup = entries.some((e) => {
        if (e.kind !== 'anomaly' || e.resolved) {
          return false;
        }
        return target.absolutePath
          ? e.absolutePath === target.absolutePath
          : e.projectRoot === target.projectRoot && e.relativePath === target.relativePath;
      });
      if (dup) {
        return;
      }
    }
    const entry: UpdateInfoEntry = {
      kind,
      absolutePath: target.absolutePath ?? null,
      projectRoot: target.projectRoot ?? null,
      relativePath: target.relativePath ?? null,
      timestamp: new Date().toISOString(),
      resolved: false,
    };
    entries.push(entry);
    atomicWriteFileSync(getGlobalUpdateInfosPath(), serialize(entries));
  });
}

/** 标记匹配 target 的条目为已复核（resolved）；无匹配则忽略 */
export function resolveUpdateInfo(target: UpdateInfoTarget): void {
  withFileLock(globalLockPath('update-infos'), () => {
    const entries = loadUpdateInfos();
    let changed = false;
    for (const e of entries) {
      const match = target.absolutePath
        ? e.absolutePath === target.absolutePath
        : e.projectRoot === target.projectRoot && e.relativePath === target.relativePath;
      if (match && !e.resolved) {
        e.resolved = true;
        changed = true;
      }
    }
    if (changed) {
      atomicWriteFileSync(getGlobalUpdateInfosPath(), serialize(entries));
    }
  });
}

/** 清空全部条目（写空骨架） */
export function clearUpdateInfos(): void {
  withFileLock(globalLockPath('update-infos'), () => {
    atomicWriteFileSync(getGlobalUpdateInfosPath(), serialize([]));
  });
}
