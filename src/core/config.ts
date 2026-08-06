/**
 * 配置文件读写
 * 管理项目下的 .openfeel/config.yaml 文件，使用 yaml.parse() + Zod Schema 校验。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { parse as parseYaml, parseDocument } from 'yaml';

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

/** 中文版 config.yaml 模板 */
const CONFIG_TEMPLATE_ZH = `# .openfeel/config.yaml
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
      model_name: glm-5.1
`;

/** 英文版 config.yaml 模板 */
const CONFIG_TEMPLATE_EN = `# .openfeel/config.yaml
# OpenFeel project global workflow configuration
# Cascade priority: user instructions > status.md local overrides > this file defaults
# This file provides defaults for all stages; status.md can override

meta:
  version: 1.0.0
  project: OpenFeel
  tech_stack: TypeScript

# ---- Workflow Defaults ----
# Initial values for all stage status.md are written from here
# Deployment template defaults to auto+enabled, repo itself defaults to manual+disabled

defaults:
  # Execution mode: manual=human workflow, agent does not automatically take over
  #                auto=Agent can advance automatically according to the state machine
  execution_mode: ${DEFAULT_CONFIG.execution_mode}

  # Auto advance: disabled=auto-closed-loop off
  #              enabled=allows auto-scheduling when execution_mode=auto
  auto_advance: ${DEFAULT_CONFIG.auto_advance}

  # Test enabled: true=after review_passed, enters test_writing→testing→bug_fixing chain
  #               false=review_passed directly transitions to done, skipping test chain
  test_enabled: ${String(DEFAULT_CONFIG.test_enabled)}

  # Worktree merge mode: manual=manually confirm merge
  #                      auto=Feel auto git merge + cleanup
  merge_mode: ${DEFAULT_CONFIG.merge_mode}

# ---- Model Configuration ----
# Configure the model backend used by Agents. Supports Agent/role level fine-grained overrides.
# Note: Actual models are allocated by the platform layer; this is for Awareness purposes.
models:
  # Default model (fallback configuration, all Agents without explicit config use this model)
  default:
    provider: deepseek
    model_name: deepseek-v4-pro
  # Agent-level override (optional): assign a different model for a specific Agent ID
  # agents:
  #   feel:
  #     provider: deepseek
  #     model_name: deepseek-v4-pro
  # Role-level override (optional): matches by Agent frontmatter model field
  roles:
    # Fast model: Executor, Utility Agent and other execution-type Agents
    fast:
      provider: deepseek
      model_name: deepseek-v4-flash
    # Cross-review model: Reviewer (GLM series, different architecture from DeepSeek)
    cross_model:
      provider: zhipu
      model_name: glm-5.1
`;

/**
 * 写入默认配置到 .openfeel/config.yaml
 * @param projectPath 项目路径
 * @param lang 语言，'zh-CN' 或 'en'，默认 'zh-CN'
 */
export function writeDefaultConfig(projectPath: string, lang: 'zh-CN' | 'en' = 'zh-CN'): void {
  const configPath = resolve(projectPath, '.openfeel', 'config.yaml');
  const content = lang === 'en' ? CONFIG_TEMPLATE_EN : CONFIG_TEMPLATE_ZH;
  writeFileSync(configPath, content, 'utf-8');
}

/**
 * 读取项目 config.yaml 中 defaults 块的指定 key
 * @param projectPath 项目根路径
 * @param key 配置键名（如 'auto_advance'）
 * @returns 配置值（string），未设置时返回 null
 */
export function getConfigValue(projectPath: string, key: string): string | null {
  const config = readConfig(projectPath);
  if (!config.defaults) {
    return null;
  }
  const value = (config.defaults as Record<string, unknown>)[key];
  if (value === undefined || value === null) {
    return null;
  }
  return String(value);
}

/**
 * 向项目 config.yaml 的 defaults 块写入指定 key
 * 使用 Zod Schema 局部校验 value，通过 yaml.Document 增量修改写回（保留注释与原始结构）
 * @param projectPath 项目根路径
 * @param key 配置键名（当前仅支持 ConfigDefaultsSchema 中定义的键）
 * @param value 配置值
 */
export function setConfigValue(projectPath: string, key: string, value: string): void {
  const configPath = resolve(projectPath, '.openfeel', 'config.yaml');

  // 1. 通过 ConfigDefaultsSchema.shape 做局部校验
  const fieldSchema = ConfigDefaultsSchema.shape[key as keyof typeof ConfigDefaultsSchema.shape];
  if (!fieldSchema) {
    throw new Error(`Unknown config key: ${key}`);
  }
  // 对 enum 字段尝试直接解析值（如 'enabled'/'disabled' → Zod enum 通过）
  fieldSchema.parse(value);

  // 2. 读取原始 YAML（绕过 normalizeConfig，保留注释与原始结构；文件不存在则创建空文档）
  const doc = existsSync(configPath)
    ? parseDocument(readFileSync(configPath, 'utf-8'))
    : parseDocument('');

  // 3. 写入 defaults[key]（setIn 原地修改，路径不存在时自动创建节点）
  doc.setIn(['defaults', key], value);

  // 4. 序列化并写回
  writeFileSync(configPath, doc.toString(), 'utf-8');
}
