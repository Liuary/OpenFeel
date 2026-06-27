/**
 * 流水线配置 Zod Schema
 * 定义 pipeline.yaml 的数据结构，用于校验和类型推导。
 */
import { z } from 'zod';

/** pipeline.yaml 的完整 Schema */
export const PipelineConfigSchema = z.object({
  phases: z.array(z.string()),
  transitions: z.record(z.string(), z.array(z.string())),
  checkpoint_mapping: z.record(z.string(), z.string()),
  phase_corrections: z.record(z.string(), z.string()).default({}),
});

/** pipeline.yaml 解析后的类型 */
export type PipelineConfig = z.infer<typeof PipelineConfigSchema>;
