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

/** pipeline.yaml 的完整 Schema */
export const PipelineConfigSchema = z.object({
  phases: z.array(z.string()),
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
