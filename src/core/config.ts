/**
 * 配置文件读写
 * 管理项目下的 .openfeel/config.yaml 文件，使用 yaml.parse() + Zod Schema 校验。
 * 同时管理全局用户画像 ~/.config/openfeel/profile.yaml（跨项目共享偏好）。
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { atomicWriteFileSync } from './fs/atomic-write.js';
import { withFileLock, globalLockPath } from './fs/file-lock.js';
import { getGlobalProfilePath } from './global-paths.js';
import { z } from 'zod';
import { parse as parseYaml, parseDocument, stringify as stringifyYaml } from 'yaml';
import { getUserName } from './workspace/identity.js';
import { t, getCliLang } from './i18n.js';

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
  merge_mode: z.enum(['manual', 'auto']).optional().default('manual'),
}).passthrough();

/** 逐层解包 ZodDefault / ZodOptional / ZodNullable，取得底层类型（schema 驱动的类型判定用） */
function unwrapSchema(schema: unknown): unknown {
  let current: unknown = schema;
  for (let i = 0; i < 8 && current; i++) {
    const unwrap = (current as { unwrap?: unknown }).unwrap;
    if (typeof unwrap !== 'function') {
      break;
    }
    current = (unwrap as () => unknown).call(current);
  }
  return current;
}

/**
 * 从 ConfigDefaultsSchema 派生某键的合法字符串值集合（T36/R3）。
 * enum → options；boolean → ['true','false']；未知键或无限定类型 → null。
 */
export function getConfigFieldLegalValues(key: string): string[] | null {
  const fieldSchema = ConfigDefaultsSchema.shape[key as keyof typeof ConfigDefaultsSchema.shape];
  if (!fieldSchema) {
    return null;
  }
  const inner = unwrapSchema(fieldSchema);
  if (inner instanceof z.ZodEnum) {
    return [...(inner.options as string[])];
  }
  if (inner instanceof z.ZodBoolean) {
    return ['true', 'false'];
  }
  return null;
}

/**
 * 受管配置键 → 阶段 status.md 字段名映射（单一来源）。
 * 仅包含**阶段级字段**键；无阶段字段的键（如 merge_mode）不在此表，
 * 批量同步时按 skipped-no-field 跳过并报告（D-config 裁定）。
 */
export const STAGE_FIELD_BY_CONFIG_KEY: Record<string, string> = {
  auto_advance: '自动推进',
  execution_mode: '执行模式',
};

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

// ── 全局用户画像 Profile Schema（v5.0 记忆体系第一层） ──

/** 用户基础信息 Schema：姓名 + 偏好语言（passthrough：保全自定义扩展键，遗留 #7） */
export const ProfileUserSchema = z.object({
  name: z.string().optional(),
  lang: z.enum(['zh-CN', 'en']).optional(),
}).passthrough();

/** 用户偏好 Schema：工作流偏好（全部可选，缺失时使用默认值；passthrough：保全自定义扩展键，遗留 #7） */
export const ProfilePreferencesSchema = z.object({
  auto_advance: z.enum(['enabled', 'disabled']).optional(),
  review_mode: z.enum(['full', 'skip_small_changes']).optional(),
  communication: z.enum(['concise', 'detailed']).optional(),
  confirm_threshold: z.enum(['low', 'medium', 'high']).optional(),
}).passthrough();

/** 历史记录 Schema：最近项目信息（passthrough：保全自定义扩展键，遗留 #7） */
export const ProfileHistorySchema = z.object({
  last_project: z.string().optional(),
  recent_projects: z.array(z.string()).optional(),
}).passthrough();

/** 完整 Profile Schema：组合三块，全部可选，允许扩展字段 */
export const ProfileSchema = z.object({
  user: ProfileUserSchema.optional(),
  preferences: ProfilePreferencesSchema.optional(),
  history: ProfileHistorySchema.optional(),
}).passthrough();

// ── 类型 ──

/** 全局用户画像结构（Zod inferred） */
export type Profile = z.infer<typeof ProfileSchema>;
/** 用户基础信息结构 */
export type UserProfile = z.infer<typeof ProfileUserSchema>;
/** 用户偏好结构 */
export type Preferences = z.infer<typeof ProfilePreferencesSchema>;
/** 历史记录结构 */
export type History = z.infer<typeof ProfileHistorySchema>;

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
  defaults?: { execution_mode?: 'manual' | 'auto'; auto_advance?: 'disabled' | 'enabled'; merge_mode?: 'manual' | 'auto'; [key: string]: unknown };
  models?: ModelsConfig;
  // 向后兼容：扁平字段（由 normalizeConfig 从 defaults 提升）
  execution_mode?: 'manual' | 'auto';
  auto_advance?: 'disabled' | 'enabled';
  merge_mode?: 'manual' | 'auto';
  [key: string]: unknown;
}

/** 默认配置值（导出供 flow-manager 作为级联 builtin 层取值，保持单一权威） */
export const DEFAULT_CONFIG: Config = {
  execution_mode: 'manual',
  auto_advance: 'disabled',
  merge_mode: 'manual',
};

/** 配置默认值解析结果（三键；不返回已移除的 test_enabled） */
export interface ResolvedConfigDefaults {
  execution_mode: 'manual' | 'auto';
  auto_advance: 'disabled' | 'enabled';
  merge_mode: 'manual' | 'auto';
}

/**
 * 配置键名归一：剥离 `defaults.` 前缀，使 `defaults.X` 与 `X` 等价（单一来源）。
 * 仅剥离一次前缀；`defaults.` 单独出现归一为空串（由白名单拒绝）。
 * 供 commands/config.ts 与 resolveConfigDefaults 共用；`--global` 的 profile 键域不受影响。
 */
export function normalizeConfigKey(key: string): string {
  const prefix = 'defaults.';
  return key.startsWith(prefix) ? key.slice(prefix.length) : key;
}

/**
 * 解析项目 config.yaml 的 defaults 块为**骨架初值**（不读 status.md、不做 effective 合并）。
 * 逐键经 ConfigDefaultsSchema 校验；缺失/非法逐键回退 DEFAULT_CONFIG。
 * @param projectPath 项目根路径
 * @returns 三键默认值（execution_mode / auto_advance / merge_mode）
 */
export function resolveConfigDefaults(projectPath: string): ResolvedConfigDefaults {
  const result: ResolvedConfigDefaults = {
    execution_mode: DEFAULT_CONFIG.execution_mode as ResolvedConfigDefaults['execution_mode'],
    auto_advance: DEFAULT_CONFIG.auto_advance as ResolvedConfigDefaults['auto_advance'],
    merge_mode: DEFAULT_CONFIG.merge_mode as ResolvedConfigDefaults['merge_mode'],
  };
  const configPath = resolve(projectPath, '.openfeel', 'config.yaml');
  if (!existsSync(configPath)) {
    return result; // 无 config.yaml → 全默认
  }
  try {
    const raw = parseYaml(readFileSync(configPath, 'utf-8')) as Record<string, unknown> | null;
    const defaults = (raw?.defaults ?? {}) as Record<string, unknown>;
    // 以字符串记录表赋值，规避 TS 联合键索引赋值推导为 never 的限制
    const target = result as unknown as Record<string, string>;
    for (const key of ['execution_mode', 'auto_advance', 'merge_mode'] as const) {
      const parsed = ConfigDefaultsSchema.shape[key].safeParse(defaults[key]);
      // 仅接受 schema 校验通过的字符串值；失败/非字符串保持 DEFAULT_CONFIG
      if (parsed.success && typeof parsed.data === 'string') {
        target[key] = parsed.data;
      }
    }
  } catch {
    // 错误路径：YAML 语法/读取失败 → 保持全默认（骨架初值安全回退）
  }
  return result;
}

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

// ── 全局用户画像 Profile 读写（v5.0 记忆体系第一层） ──

/** 默认全局 Profile（所有字段安全默认值，向后兼容的可选配置字段模式） */
const DEFAULT_PROFILE: Profile = {
  user: { name: '', lang: 'zh-CN' },
  preferences: {
    auto_advance: 'disabled',
    review_mode: 'full',
    communication: 'concise',
    confirm_threshold: 'medium',
  },
  history: { last_project: '', recent_projects: [] },
};

/**
 * 构造全局 profile.yaml 的路径
 * @returns ~/.config/openfeel/profile.yaml 的绝对路径
 */
function getProfilePath(): string {
  // 委托 global-paths 作为全局路径唯一权威（N4 收口）
  return getGlobalProfilePath();
}

/**
 * 深拷贝 DEFAULT_PROFILE，确保返回值与模块级常量完全隔离（T28）。
 * structuredClone 不可用时回退 JSON 深拷贝。
 */
function cloneDefaultProfile(): Profile {
  if (typeof structuredClone === 'function') {
    return structuredClone(DEFAULT_PROFILE);
  }
  return JSON.parse(JSON.stringify(DEFAULT_PROFILE)) as Profile;
}

/**
 * 读取全局用户画像 ~/.config/openfeel/profile.yaml
 * 文件不存在时返回默认 Profile（空用户名、zh-CN、disabled、full、concise、medium、空数组）。
 * 文件存在时用 yaml.parse() 解析 + ProfileSchema.parse() 校验，
 * 缺失字段回填默认值，返回带完整默认值的 Profile。
 * @returns 带默认值的完整 Profile
 */
export function readProfile(): Profile & { parseError?: string } {
  const profilePath = getProfilePath();
  if (!existsSync(profilePath)) {
    // 深拷贝：避免调用方原位修改污染模块级 DEFAULT_PROFILE（T28）
    return cloneDefaultProfile();
  }

  try {
    const content = readFileSync(profilePath, 'utf-8');
    const raw = parseYaml(content) as Record<string, unknown> | null;
    if (!raw || typeof raw !== 'object') {
      // 错误路径：顶层非对象（含空文件 / 标量）→ 标记 parseError，供调用方跳过写回（遗留 #8）
      return { ...cloneDefaultProfile(), parseError: `profile.yaml 顶层非对象：${profilePath}` };
    }
    const parsed = ProfileSchema.parse(raw) as Profile;
    // 与默认值深度合并：缺失字段回填默认值，同时保留顶层 passthrough 扩展字段
    // （避免后续 writeProfile 全量写回时抹除用户自定义扩展字段，REV-002）
    return {
      ...parsed,
      user: { ...DEFAULT_PROFILE.user, ...(parsed.user ?? {}) },
      preferences: { ...DEFAULT_PROFILE.preferences, ...(parsed.preferences ?? {}) },
      history: { ...DEFAULT_PROFILE.history, ...(parsed.history ?? {}) },
    };
  } catch (err) {
    // 错误路径：YAML 语法 / Zod 校验失败 → 标记 parseError（不写回），返回默认值保持可用性（遗留 #8）
    return {
      ...cloneDefaultProfile(),
      parseError: `profile.yaml 解析失败（${err instanceof Error ? err.message : String(err)}）：${profilePath}`,
    };
  }
}

/**
 * 写入全局用户画像到 ~/.config/openfeel/profile.yaml
 * 自动创建父目录 ~/.config/openfeel/（不存在时）。
 * @param profile 要写入的 Profile 对象
 */
export function writeProfile(profile: Profile): void {
  const profilePath = getProfilePath();
  // 序列化为 YAML（保留块结构可读性）
  const content = stringifyYaml(profile);
  // 全局跨项目共享文件：加锁 + 原子写（mkdirSync 由 atomicWriteFileSync 内部完成）
  withFileLock(globalLockPath('global-config'), () => {
    atomicWriteFileSync(profilePath, content);
  });
}

/**
 * 确保全局 Profile 关键字段已自动填充
 * 首次使用时 user.name 与 history.last_project 可能为空。
 * 填充规则：
 * 1. user.name 为空时：优先从 .openfeel/.info.json 的 user 字段读取，回退 git config user.name（复用 getUserName）
 * 2. history.last_project 更新为当前 projectPath
 * 3. projectPath 追加到 history.recent_projects 头部（去重，保留最近 5 个）
 * 仅在发生变更时写盘，避免无谓 IO。
 * @param projectPath 当前项目根路径
 */
export function ensureProfileDefaults(projectPath: string): void {
  // 路径规范化：统一分隔符、消除 . / ..，避免 recent_projects 因路径形式差异产生重复（REV-003）
  const normalizedPath = resolve(projectPath);
  const profile = readProfile();
  // 错误路径：profile.yaml 非法 → 不覆盖用户文件（遗留 #8；解析失败属用户可修复态，覆盖才是不可逆伤害）
  if (profile.parseError) {
    console.warn(t('config.profile.parseErrorSkipTmpl', getCliLang(projectPath), { err: profile.parseError }));
    return;
  }
  let changed = false;

  // 1. user.name 为空时自动填充（.info.json → git config 回退）
  if (!profile.user?.name) {
    profile.user = { ...(profile.user ?? {}), name: getUserName(normalizedPath) };
    changed = true;
  }

  // 2. 更新 last_project
  if (profile.history?.last_project !== normalizedPath) {
    profile.history = { ...(profile.history ?? {}), last_project: normalizedPath };
    changed = true;
  }

  // 3. recent_projects 去重追加（新项目置顶，保留最近 5 个）
  // 去重比较大小写不敏感 + 分隔符归一（T32：Windows 下 c:\x 与 C:\x 视为同一；存储保留原样）
  const normalizeKey = (p: string): string => p.replace(/\\/g, '/').toLowerCase();
  const normalizedKey = normalizeKey(normalizedPath);
  const recent = profile.history?.recent_projects ?? [];
  const deduped = [normalizedPath, ...recent.filter((p) => normalizeKey(p) !== normalizedKey)].slice(0, 5);
  if (deduped.length !== recent.length || deduped.some((p, i) => p !== recent[i])) {
    profile.history = { ...(profile.history ?? {}), recent_projects: deduped };
    changed = true;
  }

  if (changed) {
    try {
      writeProfile(profile);
    } catch (err) {
      // 写盘失败（权限不足、磁盘满、只读挂载等）时静默降级：仅告警，不阻断 Feel 启动（REV-001）
      console.warn(t('config.profile.writeFailSkipTmpl', getCliLang(projectPath), { err: err instanceof Error ? err.message : String(err) }));
    }
  }
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
  version: 1.1.4
  project: OpenFeel
  tech_stack: TypeScript

# ---- 工作流默认配置 ----
# 所有阶段 status.md 的初始值由此处写入
# 默认值来自框架 DEFAULT_CONFIG；项目可在 defaults 中覆盖（status.md 局部优先级更高）

defaults:
  # 执行模式：manual=人工流程，agent 不自动接管
  #          auto=Agent 可按状态机自动推进
  execution_mode: ${DEFAULT_CONFIG.execution_mode}

  # 自动推进：disabled=关闭自动闭环
  #          enabled=在 execution_mode=auto 时允许自动调度
  auto_advance: ${DEFAULT_CONFIG.auto_advance}

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
    # 快速模型：openfeel-executor、事务官 等执行类 Agent
    fast:
      provider: deepseek
      model_name: deepseek-flash
    # 异种模型：openfeel-reviewer 交叉审查用（GLM 系列，与 DeepSeek 不同架构）
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
  version: 1.1.4
  project: OpenFeel
  tech_stack: TypeScript

# ---- Workflow Defaults ----
# Initial values for all stage status.md are written from here
# Defaults come from framework DEFAULT_CONFIG; override per project (status.md wins locally)

defaults:
  # Execution mode: manual=human workflow, agent does not automatically take over
  #                auto=Agent can advance automatically according to the state machine
  execution_mode: ${DEFAULT_CONFIG.execution_mode}

  # Auto advance: disabled=auto-closed-loop off
  #              enabled=allows auto-scheduling when execution_mode=auto
  auto_advance: ${DEFAULT_CONFIG.auto_advance}

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
    # Fast model: openfeel-executor, openfeel-utility Agent and other execution-type Agents
    fast:
      provider: deepseek
      model_name: deepseek-flash
    # Cross-review model: openfeel-reviewer (GLM series, different architecture from DeepSeek)
    cross_model:
      provider: zhipu
      model_name: glm-5.1
`;

/**
 * 写入默认配置到 .openfeel/config.yaml（**整体覆盖**）。
 * ⚠️ 契约：调用方须先自行守卫（如 `init` 已存在则不调用，见 stage-47 BUG-002 语义修复），
 *    本函数不做「是否存在」判定，不应被无守卫地用于既有用户配置。
 * @param projectPath 项目路径
 * @param lang 语言，'zh-CN' 或 'en'，默认 'zh-CN'
 */
export function writeDefaultConfig(projectPath: string, lang: 'zh-CN' | 'en' = 'zh-CN'): void {
  const configPath = resolve(projectPath, '.openfeel', 'config.yaml');
  const content = lang === 'en' ? CONFIG_TEMPLATE_EN : CONFIG_TEMPLATE_ZH;
  // 项目内 config.yaml，init 一次性写入：仅原子写，不加锁
  atomicWriteFileSync(configPath, content);
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
  // 2. 按 schema 归一值类型：boolean 键把 'true'/'false' 转真布尔，enum 键保持字符串（R3）
  //    否则布尔键会被写成字符串 "true"，后续 ConfigDefaultsSchema.parse 语义错误
  const isBooleanField = unwrapSchema(fieldSchema) instanceof z.ZodBoolean;
  const coerced: unknown = isBooleanField ? (value === 'true') : value;

  // 3. 校验归一后的值
  fieldSchema.parse(coerced);

  // 4. 读取原始 YAML（绕过 normalizeConfig，保留注释与原始结构；文件不存在则创建空文档）
  const doc = existsSync(configPath)
    ? parseDocument(readFileSync(configPath, 'utf-8'))
    : parseDocument('');

  // 5. 写入 defaults[key]（setIn 原地修改，路径不存在时自动创建节点；写入归一后的布尔/字符串）
  doc.setIn(['defaults', key], coerced);

  // 6. 序列化并写回
  atomicWriteFileSync(configPath, doc.toString());
}
