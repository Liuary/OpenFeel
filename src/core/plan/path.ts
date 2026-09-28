/**
 * 阶段路径映射工具 — stageId ↔ plan 目录双向映射的唯一权威
 *
 * 统一规则（决策 1/2）：
 * - plan 目录结构：.openfeel/plan/{series}/stage-{NN}/
 * - {series} = 大版本系列 = v{MAJOR}（如 v1、v4）
 * - {stage} = 阶段目录名 = stage-{NN}（不含版本前缀）
 * - flow.json stageId 是权威标识（唯一键），目录名是派生组织单位
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import fastGlob from 'fast-glob';

/** 短名（无版本前缀）默认系列 */
export const DEFAULT_SERIES = 'v1';

/** 短名规范化为完整 stageId 时的默认四级版本前缀（与 init 示例阶段一致） */
export const DEFAULT_STAGE_VERSION = 'v1.0.0';

/** stageId 解析结果 */
export interface ParsedStageId {
  /** 大版本系列，如 v1 */
  series: string;
  /** 阶段目录名，如 stage-34 */
  stageDir: string;
  /** 规范化后的完整 stageId（短名补齐版本前缀） */
  fullStageId: string;
}

/**
 * 解析 stageId → { series, stageDir, fullStageId }
 *
 * 支持三种格式（决策 2 正向映射）：
 * - 完整：v1.0.0-stage-34 → { series: 'v1', stageDir: 'stage-34', fullStageId: 'v1.0.0-stage-34' }
 * - 历史：v4-stage-04    → { series: 'v4', stageDir: 'stage-04', fullStageId: 'v4-stage-04' }
 * - 短名：stage-01       → { series: 'v1', stageDir: 'stage-01', fullStageId: 'v1.0.0-stage-01' }
 *
 * 无法解析（如 'foo'、'v1'、空字符串）返回 null。
 * 注意 stageDir 保留原始数字格式（stage-04 不丢前导零），NN 用捕获组原样保留，不做 parseInt。
 */
export function parseStageId(stageId: string): ParsedStageId | null {
  // 完整/历史格式：{version}-stage-{NN}，version 可为 v1.0.0（四级）或 v4（仅主版本）
  const full = stageId.match(/^(v\d+(?:\.\d+)*)-stage-(\d+)$/);
  if (full) {
    const version = full[1];          // v1.0.0 或 v4
    const stageDir = `stage-${full[2]}`;
    const series = version.split('.')[0]; // v1 或 v4
    return { series, stageDir, fullStageId: stageId };
  }

  // 短名格式：stage-{NN}
  const short = stageId.match(/^stage-(\d+)$/);
  if (short) {
    const stageDir = `stage-${short[1]}`;
    return {
      series: DEFAULT_SERIES,
      stageDir,
      fullStageId: `${DEFAULT_STAGE_VERSION}-${stageDir}`,
    };
  }

  return null;
}

/**
 * stageId → plan 相对目录（不含 .openfeel 前缀）
 * 例：v1.0.0-stage-34 → 'plan/v1/stage-34/'；stage-01 → 'plan/v1/stage-01/'
 * 无法解析返回 null。
 */
export function stageIdToPlanDir(stageId: string): string | null {
  const parsed = parseStageId(stageId);
  if (!parsed) {
    return null;
  }
  return `plan/${parsed.series}/${parsed.stageDir}/`;
}

/**
 * 短名/完整 stageId → 规范化完整 stageId
 * 短名 stage-01 → v1.0.0-stage-01；完整/历史格式原样返回。
 * 无法解析返回 null。
 */
export function normalizeStageId(stageId: string): string | null {
  const parsed = parseStageId(stageId);
  return parsed ? parsed.fullStageId : null;
}

/** stageId 校验结果 */
export interface StageIdValidation {
  ok: boolean;
  /** 校验失败原因（中文，供 CLI 直接展示） */
  reason?: string;
}

/**
 * 校验 stageId 是否为合法格式（stage-NN / vX.Y.Z-stage-NN / vX-stage-NN）。
 * 空字符串、'foo'、'v1' 等无法被 parseStageId 解析者判为非法。
 *
 * @param input 待校验的阶段 ID
 * @returns 校验结果；失败时附带中文原因
 */
export function validateStageId(input: string): StageIdValidation {
  if (!input || !input.trim()) {
    return { ok: false, reason: '阶段 ID 不能为空' };
  }
  if (!parseStageId(input)) {
    return { ok: false, reason: `非法阶段 ID：「${input}」（应为 stage-NN 或 vX.Y.Z-stage-NN）` };
  }
  return { ok: true };
}

/**
 * 为非法/非规范输入推导建议名。
 *
 * 规则：
 * - 输入形如版本号（vX / vX.Y / vX.Y.Z，正则 /^v\d+(?:\.\d+)*$/）→ 建议 `{版本}-stage-{NN}`，
 *   其中 series = 版本首段（vX），NN = 该 series 内已用编号 max+1（两位补零）。
 * - 其它无法识别版本前缀的输入 → 回退 DEFAULT_STAGE_VERSION / DEFAULT_SERIES（v1.0.0 / v1）。
 *
 * NN 计算范围：flow.json.stages 键 ∪ .openfeel/plan/{series}/stage-NN/ 目录，**仅限目标 series**，不跨系列。
 *
 * @param projectPath 项目根路径
 * @param input 原始输入（可为非法值）
 * @returns 建议的规范化 stageId
 */
export function suggestStageId(projectPath: string, input: string): string {
  const versionMatch = (input ?? '').trim().match(/^(v\d+(?:\.\d+)*)$/);
  const version = versionMatch ? versionMatch[1] : DEFAULT_STAGE_VERSION;
  const series = version.split('.')[0]; // v1 / v4

  // 收集该 series 下已用的 NN
  const used = new Set<number>();

  // 来源 1：flow.json stages 键
  const flowPath = resolve(projectPath, '.openfeel', 'flow.json');
  if (existsSync(flowPath)) {
    try {
      const flowData = JSON.parse(readFileSync(flowPath, 'utf-8')) as { stages?: Record<string, unknown> };
      for (const key of Object.keys(flowData.stages ?? {})) {
        const parsed = parseStageId(key);
        if (parsed && parsed.series === series) {
          used.add(parseInt(parsed.stageDir.replace(/^stage-/, ''), 10));
        }
      }
    } catch {
      // flow.json 不可读时忽略该来源（建议名降级为目录来源 / 从 01 起）
    }
  }

  // 来源 2：.openfeel/plan/{series}/stage-NN/ 目录
  const seriesDir = resolve(projectPath, '.openfeel', 'plan', series);
  if (existsSync(seriesDir)) {
    try {
      for (const name of readdirSync(seriesDir)) {
        const m = name.match(/^stage-(\d+)$/);
        if (m) {
          used.add(parseInt(m[1], 10));
        }
      }
    } catch {
      // 目录不可读时忽略
    }
  }

  const nextSeq = used.size > 0 ? Math.max(...used) + 1 : 1;
  return `${version}-stage-${String(nextSeq).padStart(2, '0')}`;
}

/**
 * 查找与给定 stageId 映射「同一 (series, stageDir)」的其它 stageId。
 *
 * 例：flow.json 已有 `v4-stage-04`，传入 `v4.0.0-stage-04` → 返回 'v4-stage-04'；
 * 二者 stageId 不同但映射同一目录 .openfeel/plan/v4/stage-04/。
 *
 * @param projectPath 项目根路径
 * @param stageId 待检查的阶段 ID
 * @returns 冲突的其它 stageId；无冲突或输入无法解析时返回 null
 */
export function findStageDirConflict(projectPath: string, stageId: string): string | null {
  const parsed = parseStageId(stageId);
  if (!parsed) {
    return null;
  }
  const flowPath = resolve(projectPath, '.openfeel', 'flow.json');
  if (!existsSync(flowPath)) {
    return null;
  }
  let flowData: { stages?: Record<string, unknown> };
  try {
    flowData = JSON.parse(readFileSync(flowPath, 'utf-8'));
  } catch {
    return null; // flow.json 不可读时不做冲突判定（不阻塞主流程）
  }
  for (const key of Object.keys(flowData.stages ?? {})) {
    if (key === stageId) {
      continue;
    }
    const other = parseStageId(key);
    if (other && other.series === parsed.series && other.stageDir === parsed.stageDir) {
      return key;
    }
  }
  return null;
}

/**
 * 目录名（stage-NN）→ 完整 stageId（反向映射，回查 flow.json stages 键）
 *
 * 目录名 stage-33 无法唯一还原版本前缀，须回查 flow.json 匹配 `*-stage-33`。
 * 去歧义规则（遗留风险 1）：若多个 stageId 匹配 `*-stage-{NN}`，
 *   1. 优先 pipeline.current.stage（若在匹配集中）；
 *   2. 否则按版本前缀字典序降序取最新（v1.0.0 > v0.9 > v0.5）。
 * 注：同 stage-NN 跨多版本前缀重复在理论上不应发生，此规则仅兜底。
 *
 * @returns 完整 stageId，找不到匹配或 flow.json 不可读时返回 null
 */
export function planDirToStageId(projectPath: string, stageDir: string): string | null {
  const flowPath = resolve(projectPath, '.openfeel', 'flow.json');
  if (!existsSync(flowPath)) {
    return null;
  }

  let flowData: { stages?: Record<string, unknown>; pipeline?: { current?: { stage?: string } } };
  try {
    flowData = JSON.parse(readFileSync(flowPath, 'utf-8'));
  } catch {
    return null;
  }

  const stages = flowData.stages ?? {};
  const suffix = `-${stageDir}`; // -stage-33
  const matches = Object.keys(stages).filter((k) => k.endsWith(suffix));
  if (matches.length === 0) {
    return null;
  }
  if (matches.length === 1) {
    return matches[0];
  }

  // 去歧义：优先当前阶段，否则取版本字典序最新
  const current = flowData.pipeline?.current?.stage;
  if (current && matches.includes(current)) {
    return current;
  }
  return matches.slice().sort().at(-1) ?? matches[0];
}

/**
 * 三级回退查找 status.md（决策 4，供 flow-manager 与命令层复用）
 *
 * 1. plan/{series}/stage-NN/status.md（解析 stageId → 精确路径，首选）
 * 2. plan/ 下递归搜索 stage-NN/status.md（fast-glob 递归，兼容 series 变化/旧平铺）
 * 3. stages/{stageId}/status.md（历史遗留，只读兜底）
 *
 * 性能说明（遗留风险 3）：第 1 级精确路径命中率最高（新写入均在此），
 * 第 2 级 fast-glob 仅在精确未命中时触发（兼容旧数据/系列变化的罕见场景），
 * 因此对 flow status 高频调用性能影响可控；本 stage 不做缓存，留作后续观察。
 *
 * @returns status.md 绝对路径，三级均未命中返回 null
 */
export function findStageStatusPath(projectPath: string, stageId: string): string | null {
  const parsed = parseStageId(stageId);

  if (parsed) {
    // 1. 精确路径 plan/{series}/stage-NN/status.md
    const exact = resolve(projectPath, '.openfeel', 'plan', parsed.series, parsed.stageDir, 'status.md');
    if (existsSync(exact)) {
      return exact;
    }

    // 2. 递归搜索 plan/**/stage-NN/status.md
    const planDir = resolve(projectPath, '.openfeel', 'plan');
    if (existsSync(planDir)) {
      const matches = fastGlob.sync(`**/${parsed.stageDir}/status.md`, {
        cwd: planDir,
        onlyFiles: true,
        caseSensitiveMatch: true,
      });
      if (matches.length > 0) {
        return resolve(planDir, matches[0]);
      }
    }
  }

  // 3. 历史兜底 stages/{stageId}/status.md
  const legacy = resolve(projectPath, '.openfeel', 'stages', stageId, 'status.md');
  if (existsSync(legacy)) {
    return legacy;
  }

  return null;
}
