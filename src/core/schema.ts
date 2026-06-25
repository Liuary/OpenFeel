/**
 * 核心 Schema 引擎 — Zod 类型定义与 YAML Schema 加载验证
 * 定义 Artifact（构建产物）、Dependency（依赖关系）和 Schema（工作流模式）的数据模型
 */
import { z } from 'zod';
import { parse as parseYaml } from 'yaml';
import { readFile } from 'node:fs/promises';

// ─── Zod Schema 定义 ────────────────────────────────────────────

/** 单个依赖关系定义 */
const DependencySchema = z.object({
  artifact: z.string(),                                // 依赖的 artifact ID
  type: z.enum(['hard', 'soft']).default('hard'),     // 硬依赖（阻塞）或软依赖（仅提示）
  description: z.string().optional(),                  // 依赖说明
});

/** 构建产物（Artifact）定义 */
const ArtifactSchema = z.object({
  id: z.string(),                                      // 唯一标识
  description: z.string().optional(),                  // 产物描述
  generates: z.string(),                               // 产物文件路径（支持 glob 模式）
  template: z.string().optional(),                     // 模板文件路径
  requires: z.array(DependencySchema).default([]),     // 前置依赖（支持硬/软类型）
  dependsOn: z.array(z.string()).default([]),          // 简写：直接写 artifact ID（视为 hard 依赖）
  instruction: z.string().optional(),                  // 给 AI Agent 的指令
  metadata: z.record(z.string(), z.unknown()).default({}),
});

/** 工作流 Schema 顶层定义 */
export const SchemaSchema = z.object({
  name: z.string(),                                    // Schema 名称
  version: z.string().default('1.0'),                  // 版本号
  description: z.string().optional(),                  // 描述
  artifacts: z.array(ArtifactSchema),                  // 产物列表
}).superRefine((data, ctx) => {
  // 检查 artifact ID 唯一性
  const seen = new Set<string>();
  for (let i = 0; i < data.artifacts.length; i++) {
    const artifact = data.artifacts[i];
    if (seen.has(artifact.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Artifact ID "${artifact.id}" 重复出现，ID 必须唯一`,
        path: ['artifacts', i, 'id'],
      });
    } else {
      seen.add(artifact.id);
    }
  }
});

// ─── TypeScript 类型导出 ────────────────────────────────────────

/** 依赖关系类型 */
export type Dependency = z.infer<typeof DependencySchema>;

/** 构建产物类型 */
export type Artifact = z.infer<typeof ArtifactSchema>;

/** 工作流 Schema 类型 */
export type Schema = z.infer<typeof SchemaSchema>;

// ─── Schema 加载与验证 ──────────────────────────────────────────

/**
 * 从 YAML 文件加载并验证 Schema
 * @param filePath YAML 文件路径
 * @returns 验证后的 Schema 对象
 * @throws 文件不存在或格式校验失败时抛出异常
 */
export async function loadSchema(filePath: string): Promise<Schema> {
  const content = await readFile(filePath, 'utf-8');
  const raw = parseYaml(content);       // yaml.parse 解析
  return SchemaSchema.parse(raw);       // Zod 校验
}
