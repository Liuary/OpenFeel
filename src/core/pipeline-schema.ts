/**
 * 流水线配置 Zod Schema
 * 定义 pipeline.yaml 的数据结构，用于校验和类型推导。
 *
 * 变更摘要 (stage-01: flow.json 鲁棒性加固):
 * - 新增 PIPELINE_PHASES 枚举常量，硬编码 15 个合法流水线阶段
 * - 新增 PipelinePhaseSchema (Zod enum)，用于运行时校验 phase 值的合法性
 * - 新增 PipelinePhase 类型，替代此前的动态 string 类型
 * - PipelineConfigSchema 保持 string 泛型以兼容自定义 YAML，phase 值校验由 PipelinePhaseSchema 负责
 */
import { z } from 'zod';

/** 合法的流水线阶段枚举常量 */
export const PIPELINE_PHASES = [
  'plan_pending', 'plan_review', 'plan_passed',
  'scheme_pending', 'scheme_review', 'scheme_passed',
  'exec_running', 'review_pending', 'review_failed',
  'review_passed', 'test_pending', 'test_failed',
  'test_passed', 'archiving', 'done',
] as const;

/** 流水线阶段 Zod 枚举 Schema，用于运行时校验 phase 值 */
export const PipelinePhaseSchema = z.enum(PIPELINE_PHASES);

/** 流水线阶段类型（从 Zod enum 推导，替代此前动态 string） */
export type PipelinePhase = z.infer<typeof PipelinePhaseSchema>;

/** 流水线全局宏观状态枚举常量 */
export const META_PHASES = ['active', 'paused', 'done'] as const;

/** 全局宏观状态 Zod 枚举 Schema，用于运行时校验 */
export const MetaPhaseSchema = z.enum(META_PHASES);

/** 全局宏观状态类型 */
export type MetaPhase = z.infer<typeof MetaPhaseSchema>;

/**
 * 组合转换条件分隔符
 * transitions 的 key 可用 '|' 组合多个源 phase，任一源 phase 匹配即可推进到目标（多 Agent 并行场景）。
 * 示例: `'test_passed|review_passed': ['archiving']` → 审查或测试任一通过即可归档。
 */
export const TRANSITION_OR_SEPARATOR = '|';

/**
 * 将 transitions 的 key 解析为条件 phase 列表
 * 简单 key（如 'review_pending'）返回单个条件；组合 key（如 'test_passed|review_passed'）按 '|' 分割返回多个条件。
 * @param key 转换 key（transitions 的键）
 * @returns 条件 phase 列表（已去空、去空白）
 */
export function parseTransitionKey(key: string): string[] {
  return key
    .split(TRANSITION_OR_SEPARATOR)
    .map((c) => c.trim())
    .filter(Boolean);
}

/** 判断某 phase 是否匹配转换 key（组合条件下任一条件匹配即 true，简单 key 为精确相等） */
export function transitionKeyMatches(key: string, phase: string): boolean {
  return parseTransitionKey(key).includes(phase);
}

/** pipeline.yaml 的完整 Schema（transitions key 允许 '|' 组合条件） */
export const PipelineConfigSchema = z.object({
  phases: z.array(z.string()),
  // transitions: { fromPhase | "fromA|fromB": [toPhase, ...] }，key 可含 '|' 组合多个源 phase
  transitions: z.record(z.string(), z.array(z.string())),
  checkpoint_mapping: z.record(z.string(), z.string()),
  phase_corrections: z.record(z.string(), z.string()).default({}),
});

/** pipeline.yaml 解析后的类型 */
export type PipelineConfig = z.infer<typeof PipelineConfigSchema>;

/** 阶段耗时统计 */
export interface StageStats {
  /** 阶段开始时间（ISO 8601） */
  start_time: string;
  /** 阶段结束时间（ISO 8601），未完成时为空字符串 */
  end_time: string;
  /** 阶段耗时（毫秒），未完成时为 0 */
  duration_ms: number;
}

/** 阶段级流水线阶段（从 PipelineMeta 移到 StageData 内） */
