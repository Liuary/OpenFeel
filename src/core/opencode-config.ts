/**
 * 全局 opencode 配置内容与合并逻辑
 * 提供框架级全局 opencode.jsonc 的内容对象、项目最小覆盖内容，
 * 以及 JSONC 解析 / 深度合并 / 序列化，供 init（首次写入）与 update（深度合并）共用。
 */
import { getGlobalCoreMdPath } from './global-paths.js';

/** 判断是否为纯对象（排除数组/null） */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** 框架级全局 opencode.jsonc 内容对象（N7；全局 AGENTS.md 由约定自动加载承载约束，故不写 instructions） */
export function buildGlobalOpencodeFrameworkObj(): Record<string, unknown> {
  return {
    $schema: 'https://opencode.ai/config.json',
    default_agent: 'feel',
    agent: {
      'openfeel-vision': { model: 'deepseek/deepseek-flash' },
      'openfeel-reviewer': { model: 'zhipuai/glm-5.3-flash' },
    },
    // N3：experimental.agent_manager_tool 已被移除（op-000 实测 schema 未定义 + 静默丢弃），故不写
    // v1.1.1：instructions 已移除——op-000 实测全局 AGENTS.md 自动加载（YES），约束无需显式 instructions 引用
  };
}

/** 项目 opencode.jsonc 最小覆盖内容（N7：仅 $schema，不写 instructions/skills/default_agent） */
export function buildProjectOpencodeJsoncObj(): Record<string, unknown> {
  return { $schema: 'https://opencode.ai/config.json' };
}

/**
 * 解析 JSONC 文本为对象（去 // 行注释后 JSON.parse）。
 * 迁移自 update.ts 的 parseJsonc（op-003 删本地副本改 import 本函数）。
 */
export function parseJsonc(text: string): Record<string, unknown> {
  const normalized = text.replace(/\r/g, '');
  let result = '';
  let inString = false;
  let inEscape = false;
  let i = 0;
  while (i < normalized.length) {
    const ch = normalized[i];
    const next = normalized[i + 1];
    if (inEscape) { result += ch; inEscape = false; i++; continue; }
    if (ch === '\\' && inString) { result += ch; inEscape = true; i++; continue; }
    if (ch === '"') { inString = !inString; result += ch; i++; continue; }
    if (!inString && ch === '/' && next === '/') {
      i += 2;
      while (i < normalized.length && normalized[i] !== '\n') { i++; }
      if (i < normalized.length && normalized[i] === '\n') { result += '\n'; i++; }
      continue;
    }
    result += ch;
    i++;
  }
  return JSON.parse(result);
}

/**
 * 框架 agent 默认值合并（REV-703 修订：粒度为 agent 级）。
 * 仅在用户完全未定义该 agent key 时补入整条 { model }；用户定义了该 agent key
 * 即视为完整自定义，框架不补、不覆盖其内部任何字段（如 model）。
 * 与 stage-40 接口兼容：只增补缺失 agent，不重写既有 agent 内字段。
 */
function mergeAgentDefaults(
  baseVal: unknown,
  overlayVal: Record<string, unknown>,
): Record<string, unknown> {
  const base = isPlainObject(baseVal) ? baseVal : {};
  const result: Record<string, unknown> = { ...base };
  for (const [name, agentOverlay] of Object.entries(overlayVal)) {
    if (!(name in result)) { result[name] = agentOverlay; }
  }
  return result;
}

/**
 * 深度合并两个 opencode 配置对象（overlay=框架 覆盖 base=用户）。
 * 逐字段规则见 op-001 关键设计决策表；用户未知字段 passthrough 保留。
 */
export function deepMergeJsonc(
  base: Record<string, unknown>,
  overlay: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };
  for (const [key, overlayVal] of Object.entries(overlay)) {
    if (key === 'instructions' && Array.isArray(overlayVal)) {
      const baseVal = Array.isArray(base[key]) ? (base[key] as unknown[]) : [];
      result[key] = Array.from(new Set([...overlayVal, ...baseVal]));
    } else if (key === 'agent' && isPlainObject(overlayVal)) {
      result[key] = mergeAgentDefaults(base[key], overlayVal);
    } else if (key === 'skills') {
      // 框架不写 skills（N6），保留用户已有（result.skills 不动）
    } else if (isPlainObject(overlayVal) && isPlainObject(base[key])) {
      result[key] = deepMergeJsonc(
        base[key] as Record<string, unknown>,
        overlayVal as Record<string, unknown>,
      );
    } else {
      result[key] = overlayVal;
    }
  }
  return result;
}

/** 合并全局 opencode.jsonc：解析→深度合并→清理废弃 core.md 引用→序列化（保留用户字段，注释不保留） */
export function mergeGlobalOpencodeJsonc(raw: string): string {
  const base = parseJsonc(raw);
  const merged = deepMergeJsonc(base, buildGlobalOpencodeFrameworkObj());
  // 移除已废弃的 core.md instructions 引用（v1.1.1：core.md 已并入全局 AGENTS.md）
  const instr = merged.instructions;
  if (Array.isArray(instr)) {
    const stale = getGlobalCoreMdPath();
    const filtered = instr.filter((p) => p !== stale);
    if (filtered.length === 0) {
      delete merged.instructions;
    } else {
      merged.instructions = filtered;
    }
  }
  return JSON.stringify(merged, null, 2) + '\n';
}
