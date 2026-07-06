/**
 * 配置文件读写
 * 管理项目下的 .openfeel/config.yaml 文件，使用 yaml.parse() + Zod Schema 校验。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { parse as parseYaml } from 'yaml';

// ── Zod Schema ──

/** meta 块 Schema（允许扩展字段） */
export const ConfigMetaSchema = z.object({
  version: z.string().optional(),
  project: z.string().optional(),
  tech_stack: z.string().optional(),
}).passthrough();

/** defaults 块 Schema（允许扩展字段） */
export const ConfigDefaultsSchema = z.object({
  execution_mode: z.enum(['manual', 'auto']).optional().default('manual'),
  auto_advance: z.enum(['disabled', 'enabled']).optional().default('disabled'),
  test_enabled: z.boolean().optional().default(false),
  merge_mode: z.enum(['manual', 'auto']).optional().default('manual'),
}).passthrough();

/** 单个模型配置 Schema */
export const ModelConfigSchema = z.object({
  provider: z.string(),      // deepseek / openai / anthropic / zhipu / qwen
  model_name: z.string(),    // 具体模型 ID
  base_url: z.string().optional(),
  api_key_env: z.string().optional(),  // 环境变量名
});

/** 模型配置节 Schema */
export const ModelsSchema = z.object({
  default: ModelConfigSchema,                           // 兜底（必填）
  agents: z.record(z.string(), ModelConfigSchema).optional(),  // Agent 级覆盖
  roles: z.record(z.string(), ModelConfigSchema).optional(),   // 角色级覆盖
});

/** 完整的 config.yaml Schema */
export const ConfigSchema = z.object({
  meta: ConfigMetaSchema.optional(),
  defaults: ConfigDefaultsSchema.optional(),
  models: ModelsSchema.optional(),
}).passthrough();

// ── 类型 ──

/** 模型配置结构 */
export interface ModelConfig {
  provider: string;
  model_name: string;
  base_url?: string;
  api_key_env?: string;
}

/** 模型配置节结构 */
export interface ModelsConfig {
  default: ModelConfig;
  agents?: Record<string, ModelConfig>;
  roles?: Record<string, ModelConfig>;
}

/** 配置文件结构（backward-compatible: 扁平字段 + 嵌套结构并存） */
export interface Config {
  meta?: { version?: string; project?: string; tech_stack?: string; [key: string]: unknown };
  defaults?: { execution_mode?: 'manual' | 'auto'; auto_advance?: 'disabled' | 'enabled'; test_enabled?: boolean; merge_mode?: 'manual' | 'auto'; [key: string]: unknown };
  models?: ModelsConfig;
  // 向后兼容：扁平字段（由 normalizeConfig 从 defaults 提升）
  execution_mode?: 'manual' | 'auto';
  auto_advance?: 'disabled' | 'enabled';
  test_enabled?: boolean;
  merge_mode?: 'manual' | 'auto';
  [key: string]: unknown;
}

/** 默认配置值 */
const DEFAULT_CONFIG: Config = {
  execution_mode: 'manual',
  auto_advance: 'disabled',
  test_enabled: false,
  merge_mode: 'manual',
};

// ── 工具函数 ──

/**
 * 将 Config 的嵌套 defaults 字段提升到顶层
 * 向后兼容旧代码中 config.execution_mode 等扁平访问方式
 */
function normalizeConfig(parsed: Config): Config {
  const result: Config = { ...parsed };
  // 若存在 defaults 块，将其字段提升到顶层（不覆盖已有的顶层值）
  if (result.defaults) {
    const defaults = result.defaults;
    // 提升所有 defaults 字段
    for (const [key, value] of Object.entries(defaults)) {
      if (!(key in result)) {
        (result as Record<string, unknown>)[key] = value;
      }
    }
  }
  return result;
}

// ── 公开 API ──

/**
 * 读取项目下的 .openfeel/config.yaml
 * 使用 yaml.parse() 解析嵌套结构，Zod Schema 校验，自动规范化
 * 若文件不存在，返回空对象。
 */
export function readConfig(projectPath: string): Config {
  const configPath = resolve(projectPath, '.openfeel', 'config.yaml');
  if (!existsSync(configPath)) {
    return {};
  }

  const content = readFileSync(configPath, 'utf-8');
  const raw = parseYaml(content); // yaml.parse() 自动处理嵌套结构

  // 预处理：将应为对象但值为 null 的字段转为 {}（兼容 "defaults:\n" 等空块）
  const preprocessed = { ...raw } as Record<string, unknown>;
  if (preprocessed.meta === null) {
    preprocessed.meta = {};
  }
  if (preprocessed.defaults === null) {
    preprocessed.defaults = {};
  }
  if (preprocessed.models === null) {
    delete preprocessed.models;  // models 节为 null 时直接删除，让其走 optional 逻辑
  }

  const parsed = ConfigSchema.parse(preprocessed) as Config;
  return normalizeConfig(parsed);
}

/**
 * 写入默认配置到 .openfeel/config.yaml
 */
export function writeDefaultConfig(projectPath: string): void {
  const configPath = resolve(projectPath, '.openfeel', 'config.yaml');
  const content = `# .openfeel/config.yaml
# OpenFeel 项目全局工作流配置
# 级联优先级：用户指令 > status.md 局部覆盖 > 本文件 defaults
# 本文件为所有阶段提供默认值，status.md 可覆盖

meta:
  version: 1.0.0
  project: OpenFeel
  tech_stack: TypeScript

# ---- 工作流默认配置 ----
# 所有阶段 status.md 的初始值由此处写入
# 部署模板默认 auto+enabled，仓库自身默认 manual+disabled

defaults:
  # 执行模式：manual=人工流程，agent 不自动接管
  #          auto=Agent 可按状态机自动推进
  execution_mode: ${DEFAULT_CONFIG.execution_mode}

  # 自动推进：disabled=关闭自动闭环
  #          enabled=在 execution_mode=auto 时允许自动调度
  auto_advance: ${DEFAULT_CONFIG.auto_advance}

  # 测试阶段：true=review_passed 后进入 test_writing→testing→bug_fixing 链路
  #          false=review_passed 直接转 done，跳过测试链路
  test_enabled: ${String(DEFAULT_CONFIG.test_enabled)}

  # Worktree 合并模式：manual=手动确认合并
  #                   auto=Feel 自动 git merge + cleanup
  merge_mode: ${DEFAULT_CONFIG.merge_mode}

# ---- 模型配置 ----
# 配置 Agent 使用的模型后端。支持 Agent/角色 级精细化覆盖。
# 注：实际模型由平台层分配，此处为 Awareness 目的。
models:
  # 默认模型（兜底配置，所有未显式配置的 Agent 使用此模型）
  default:
    provider: deepseek
    model_name: deepseek-v4-pro
  # Agent 级覆盖（可选）：为特定 Agent ID 分配不同模型
  # agents:
  #   feel:
  #     provider: deepseek
  #     model_name: deepseek-v4-pro
  # 角色级覆盖（可选）：按 Agent frontmatter model 字段匹配
  roles:
    # 快速模型：Executor、事务官 等执行类 Agent
    fast:
      provider: deepseek
      model_name: deepseek-v4-flash
    # 异种模型：Reviewer 交叉审查用（GLM 系列，与 DeepSeek 不同架构）
    cross_model:
      provider: zhipu
      model_name: glm-5.2
`;
  writeFileSync(configPath, content, 'utf-8');
}
