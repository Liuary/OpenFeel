/**
 * Harness 探测模块（v1.5.8 / REQ-024 归档官增强）
 *
 * 职责：判定当前项目应把开发 skill 写到哪个工具目录（dsh / claude / opencode）。
 * 纯只读：只做 existsSync 探测，不做任何写盘，也不改变项目状态。
 *
 * 探测顺序（③ 级回退，去重保序）：
 *   ① 项目标记：项目根存在 `.dsh/` / `.claude/` / `.opencode/` 目录（按此顺序收集）；
 *   ② 项目无任何标记时用全局标记：`~/.openfeel/adapter-host-dsh.json` → dsh、
 *      `~/.claude/` → claude、`~/.config/opencode/` → opencode；
 *   ③ 仍为空 → 回退 `['opencode']`（历史默认 harness）。
 *
 * 边界：全局路径一律经 `global-paths.ts` 解析（`homedir` 的单一 import 点，N4 / T27），
 * 本模块**不得**直接 import `node:os`，否则测试无法单点隔离 HOME。
 */
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  getClaudeConfigDir,
  getGlobalAdapterHostPath,
  getOpencodeGlobalDir,
} from './global-paths.js';

/** 宿主 harness 标识（与 skill 目录一一对应） */
export type HarnessId = 'dsh' | 'claude' | 'opencode';

/** 探测结果：harness 标识 + skill 目录（相对项目根，POSIX 分隔符） */
export interface HarnessInfo {
  id: HarnessId;
  skillDir: string;
}

/** harness → skill 目录（相对项目根；唯一权威表） */
const SKILL_DIRS: Record<HarnessId, string> = {
  dsh: '.dsh/skills',
  claude: '.claude/skills',
  opencode: '.opencode/skills',
};

/** 项目级标记目录（收集顺序即输出顺序） */
const PROJECT_MARKERS: ReadonlyArray<{ id: HarnessId; dir: string }> = [
  { id: 'dsh', dir: '.dsh' },
  { id: 'claude', dir: '.claude' },
  { id: 'opencode', dir: '.opencode' },
];

/** 无任何标记时的回退 harness（历史默认） */
const FALLBACK_HARNESS: HarnessId = 'opencode';

/** 目录存在性判定（文件同名不算标记；不可读/不存在一律 false） */
function isDirectory(targetPath: string): boolean {
  try {
    return statSync(targetPath).isDirectory();
  } catch {
    return false;
  }
}

/**
 * 探测项目可用 harness（纯只读）。
 *
 * @param projectPath 项目根路径
 * @returns HarnessInfo[]，按 dsh → claude → opencode 固定顺序去重；至少一项（回退 opencode）
 */
export function detectHarnesses(projectPath: string): HarnessInfo[] {
  const found: HarnessId[] = [];

  // ① 项目标记
  for (const marker of PROJECT_MARKERS) {
    if (isDirectory(join(projectPath, marker.dir))) {
      found.push(marker.id);
    }
  }

  // ② 项目无任何标记 → 全局标记（仅当 ① 为空才探测，避免全局环境干扰项目声明）
  if (found.length === 0) {
    if (existsSync(getGlobalAdapterHostPath())) {
      found.push('dsh');
    }
    if (isDirectory(getClaudeConfigDir())) {
      found.push('claude');
    }
    if (isDirectory(getOpencodeGlobalDir())) {
      found.push('opencode');
    }
  }

  // ③ 仍为空 → 回退
  if (found.length === 0) {
    found.push(FALLBACK_HARNESS);
  }

  // 去重保序（同一 id 不会重复 push，此处防御未来标记表扩展）
  return [...new Set(found)].map((id) => ({ id, skillDir: SKILL_DIRS[id] }));
}
