/**
 * 模型配置核心模块（stage-40）
 * 提供「工具默认 / 全局 / 当前项目」三层级 agent 模型的读写与校验，
 * 供 CLI（openfeel model）与内部 API（Model not found 报错时自动修复）共用。
 *
 * 三层级落点：
 *  - default（工具默认）：有显式 model 的 4 个 agent（executor/utility/reviewer/vision）
 *    改 src/core/templates-data/opencode/agents/{zh-CN,en}/*.md frontmatter `model:`（双语）；
 *    其中 vision/reviewer 额外改 src/core/opencode-config.ts buildGlobalOpencodeFrameworkObj()
 *    的 agent.<name>.model。无显式 model 的 5 个 agent（feel/planner/schemer/feel-tester/archiver）
 *    报错提示改用 global/project，不新增框架默认条目。
 *  - global：~/.config/opencode/opencode.jsonc 的 agent.<name>.model（加锁 + 原子写，只改 model 键）
 *  - project：项目根 opencode.jsonc 的 agent.<name>.model（原子写，不加锁）
 *
 * ── 解析优先级（实测勘误，REV-1606）──
 * plan.md §二原写「项目 jsonc > 全局 jsonc > frontmatter > 默认」，op-001 步骤 0 前置实测
 * （隔离 HOME + opencode 1.18.30 `debug config`）推翻该结论。opencode 官方配置源优先级为
 * 「project config < .opencode 目录（agents 等）」，故 agent markdown frontmatter 覆盖 jsonc：
 *     项目 agents/*.md frontmatter > 全局 agents/*.md frontmatter >
 *     项目 opencode.jsonc agent.model > 全局 opencode.jsonc agent.model > opencode 默认
 * 本模块以框架默认源（templates-data frontmatter）代表 default 层（部署后落于全局 agents），
 * 故 effective 解析修正为 `default > project > global`（取首个非空显式值），
 * 且 default 层多源不一致时以 frontmatter 值生效（frontmatter 覆盖 opencode-config.ts 侧）。
 *
 * 本模块为纯函数，不直接 console 输出，返回结构化结果。
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { atomicWriteFileSync } from './fs/atomic-write.js';
import { withFileLock, globalLockPath } from './fs/file-lock.js';
import { getGlobalOpencodeJsoncPath, getAuthJsonPath } from './global-paths.js';
import { parseJsonc } from './opencode-config.js';
import { splitFrontmatter, mergeFrontmatter, serializeFrontmatter } from './managed-region.js';
import { listAgentIds } from './template-loader.js';
import { normalizeAgentName } from './flow-manager.js';

// ─── 类型 ─────────────────────────────────────────────────────────

/** 三层级 scope */
export type ModelScope = 'default' | 'global' | 'project';

/** set 结果 */
export interface SetModelResult {
  ok: boolean;
  scope: ModelScope;
  agentId: string;
  model: string;
  changedFiles: string[];   // 实际写盘的文件绝对路径
  needsBuild?: boolean;     // default scope 时为 true（需 npm run build 重生成）
  warning?: string;         // 软校验提示（model-id 无法离线核对）
}

/** get 结果 */
export interface GetModelResult {
  agentId: string;
  effective?: string;                                 // 生效值（default > project > global 解析，修正链）
  byScope: Partial<Record<ModelScope, string | null>>; // 各 scope 显式值（null=未显式）
  inconsistent?: boolean;                              // default 层多源（frontmatter + opencode-config.ts）不一致
}

/** 校验结果 */
export interface ModelValidation {
  ok: boolean;
  error?: string;     // 校验失败原因（中文，供 CLI 直接展示）
  warning?: string;   // 软校验提示
  providers?: string[]; // 合法 provider 列表（provider 不匹配时附带）
}

/** 可注入路径（测试隔离用，REV-1506） */
export interface ModelConfigOptions {
  /** project 层级定位用：项目根路径，默认 process.cwd() */
  projectPath?: string;
  /** default 层级定位用：框架源码根（含 src/core/templates-data 与 src/core/opencode-config.ts），默认由模块位置推导 */
  frameworkRoot?: string;
  // （REV-1604 修订）移除原 build 字段：build 由 CLI 层（commands/model.ts）读取并触发 npm run build，
  // setAgentModel 不消费该字段，故不作为 ModelConfigOptions 注入项，避免死参数。default 写入后的 needsBuild 恒为 true。
}

// ─── 路径解析 ─────────────────────────────────────────────────────

/** 模块自身目录（src/core 或 dist/core） */
const MODULE_DIR = dirname(fileURLToPath(import.meta.url));

/** default 层级框架源码根：默认由模块位置推导（src/core → 上溯两级到项目根） */
function resolveFrameworkRoot(opts?: ModelConfigOptions): string {
  if (opts?.frameworkRoot) {
    return resolve(opts.frameworkRoot);
  }
  // model-config 位于 <项目根>/src/core/ 下，框架源码根 = 上溯两级到项目根（含 src/core/templates-data、src/core/opencode-config.ts）
  // 注意：编译到 dist/ 时本目录为 dist/core/，templates-data 不随 tsc 复制，故 default scope 仅在源码仓运行
  // （REV-1601 修订：原 resolve(MODULE_DIR, '..') 只上溯一级到 <项目根>/src，导致拼出 src/src/core/... 双重 src）
  return resolve(MODULE_DIR, '..', '..');
}

/** agent 模板目录（zh-CN/en 双语） */
function agentsTemplatesDir(opts?: ModelConfigOptions): string {
  return join(resolveFrameworkRoot(opts), 'src', 'core', 'templates-data', 'opencode', 'agents');
}

/** 指定 agent 的模板文件路径（lang ∈ zh-CN | en） */
function agentTemplatePath(agentId: string, lang: 'zh-CN' | 'en', opts?: ModelConfigOptions): string {
  return join(agentsTemplatesDir(opts), lang, `${agentId}.md`);
}

/** opencode-config.ts 源码路径 */
function opencodeConfigTsPath(opts?: ModelConfigOptions): string {
  return join(resolveFrameworkRoot(opts), 'src', 'core', 'opencode-config.ts');
}

/**
 * 判断框架源码是否就位（default scope 预判用，REV-1703）。
 * 路径推导复用 resolveFrameworkRoot（基于 MODULE_DIR），与 core 层落点一致，
 * 避免 CLI 层用 process.cwd() 推导在子目录运行时误报。
 */
export function isFrameworkSourceReady(opts?: ModelConfigOptions): boolean {
  return existsSync(agentsTemplatesDir(opts));
}

// ─── agent 名归一化 ───────────────────────────────────────────────

/** 归一化 agent 名（旧名 → openfeel-* 新名；幂等） */
function normalizeAgentId(agentId: string): string {
  return normalizeAgentName(agentId);
}

/** 判断是否为纯对象 */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// ─── 校验 ─────────────────────────────────────────────────────────

/** 读取 auth.json 顶层 provider key 集合；缺文件/解析失败返回 null（REV-1505） */
export function readAuthProviders(): string[] | null {
  const p = getAuthJsonPath();
  if (!existsSync(p)) {
    return null;
  }
  try {
    const obj = JSON.parse(readFileSync(p, 'utf-8'));
    return Array.isArray(obj) ? null : Object.keys(obj);
  } catch {
    // auth.json 内容非法 JSON：视为无法核对 provider，降级返回 null
    return null;
  }
}

/**
 * 校验模型名格式 + provider（对照 auth.json）。
 * 格式：{provider}/{model-id}，两者均非空、不含空白（provider 取自首个 `/` 之前，天然不含 `/`）。
 * provider 硬校验（auth.json key）；model-id 软校验（仅格式，提示以 Did you mean 为准）。
 */
export function validateModel(model: string): ModelValidation {
  if (typeof model !== 'string' || model.trim() === '') {
    return { ok: false, error: '模型名不能为空，格式应为 {provider}/{model-id}' };
  }
  const m = model.trim();
  const slashIdx = m.indexOf('/');
  if (slashIdx <= 0 || slashIdx === m.length - 1) {
    return { ok: false, error: `模型名格式非法：应为 {provider}/{model-id}，实际为 "${m}"` };
  }
  const provider = m.slice(0, slashIdx);
  const modelId = m.slice(slashIdx + 1);
  // provider 取自第一个 "/" 之前，天然不含 "/"，故仅需校验空白（REV-1704 移除冗余 includes 判断）
  if (/\s/.test(provider)) {
    return { ok: false, error: `provider 非法（含空白）："${provider}"` };
  }
  if (modelId.trim() === '' || /\s/.test(modelId)) {
    return { ok: false, error: `model-id 非法（为空或含空白）："${modelId}"` };
  }
  // provider 硬校验
  const providers = readAuthProviders();
  if (providers !== null && !providers.includes(provider)) {
    return {
      ok: false,
      error: `provider "${provider}" 不在 auth.json 中`,
      providers,
    };
  }
  const warning = 'model-id 无法离线核对，请以 "Model not found" 报错中的 Did you mean 建议为准';
  if (providers === null) {
    return { ok: true, warning: `${warning}（且未找到 auth.json，无法核对 provider）` };
  }
  return { ok: true, warning };
}

// ─── frontmatter 读写（default 层，双语） ─────────────────────────

/** 读取某语言模板的 frontmatter model；无 frontmatter / 无 model 返回 null */
function readFrontmatterModel(agentId: string, lang: 'zh-CN' | 'en', opts?: ModelConfigOptions): string | null {
  const p = agentTemplatePath(agentId, lang, opts);
  if (!existsSync(p)) {
    return null;
  }
  const split = splitFrontmatter(readFileSync(p, 'utf-8'));
  if (!split) {
    return null;
  }
  const v = split.frontmatter.model;
  return typeof v === 'string' && v !== '' ? v : null;
}

/** 写某语言模板的 frontmatter model（保留其他字段与正文，REV-1501/控制区标记模式） */
function writeFrontmatterModel(agentId: string, lang: 'zh-CN' | 'en', model: string, opts?: ModelConfigOptions): string {
  const p = agentTemplatePath(agentId, lang, opts);
  if (!existsSync(p)) {
    throw new Error(`agent 模板不存在：${p}`);
  }
  const content = readFileSync(p, 'utf-8');
  const split = splitFrontmatter(content);
  if (!split) {
    throw new Error(`agent 模板缺少 frontmatter：${p}`);
  }
  const merged = mergeFrontmatter(split.frontmatter, { model });
  atomicWriteFileSync(p, serializeFrontmatter(merged) + split.body);
  return p;
}

// ─── opencode-config.ts 读写（default 层，结构化定位） ────────────

/**
 * 读 opencode-config.ts 源码中 agent.<name>.model（结构化定位，与写对称）。
 * 用文件文本 + agent 键锚定（非 import 函数），保证写→读往返一致且支持测试隔离（REV-1506）。
 * 无该 agent 条目返回 null。
 */
function readOpencodeConfigAgentModel(agentId: string, opts?: ModelConfigOptions): string | null {
  const p = opencodeConfigTsPath(opts);
  if (!existsSync(p)) {
    return null;
  }
  const text = readFileSync(p, 'utf-8');
  const escaped = agentId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`['"]${escaped}['"]\\s*:\\s*\\{\\s*model\\s*:\\s*(['"])([^'"]*?)\\1`, 'g');
  const m = re.exec(text);
  return m ? m[2] : null;
}

/**
 * 写 opencode-config.ts 的 agent.<name>.model（REV-1502 结构化定位）。
 * 按 agent 键精确锚定 `'openfeel-vision': { model: '...' }` 条目行替换，避免裸正则误伤。
 * 无该 agent 条目 → 抛错（本阶段 default scope 不新增 opencode-config 条目）。
 */
function writeOpencodeConfigAgentModel(agentId: string, model: string, opts?: ModelConfigOptions): string {
  const p = opencodeConfigTsPath(opts);
  const text = readFileSync(p, 'utf-8');
  const escaped = agentId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(['"]${escaped}['"]\\s*:\\s*\\{\\s*model\\s*:\\s*)(['"])([^'"]*?)(\\2)`, 'g');
  if (!re.test(text)) {
    throw new Error(`opencode-config.ts 无 agent.${agentId}.model 条目，无法更新工具默认模型`);
  }
  re.lastIndex = 0;
  // 用 replacer 函数避免 model 值中的 `$` 被 String.replace 解释为特殊引用
  const updated = text.replace(re, (_match, prefix, q, _old, q2) => `${prefix}${q}${model}${q2}`);
  atomicWriteFileSync(p, updated);
  return p;
}

// ─── jsonc 读写（global / project 层） ────────────────────────────

/** 读 jsonc 的 agent.<name>.model；文件缺失/无条目/解析失败返回 null（REV-1603 修订：补 try/catch） */
function readJsoncAgentModel(filePath: string, agentId: string): string | null {
  if (!existsSync(filePath)) {
    return null;
  }
  let obj: Record<string, unknown>;
  try {
    obj = parseJsonc(readFileSync(filePath, 'utf-8'));
  } catch {
    // 解析失败（如含 /* */ 块注释）视为无条目，保护读取路径
    return null;
  }
  const agentObj = isPlainObject(obj.agent) ? (obj.agent as Record<string, unknown>) : null;
  if (!agentObj) {
    return null;
  }
  const entry = agentObj[agentId];
  if (!isPlainObject(entry)) {
    return null;
  }
  const v = entry.model;
  return typeof v === 'string' && v !== '' ? v : null;
}

/**
 * 写 jsonc 的 agent.<name>.model（REV-1507 只改 model 键，保留同 agent 其他字段与其他 agent）。
 * parse 失败抛错不写盘（保护用户文件，参照 migrate.ts 降级原则）。
 */
function writeJsoncAgentModel(filePath: string, agentId: string, model: string): void {
  const raw = existsSync(filePath) ? readFileSync(filePath, 'utf-8') : '{}\n';
  let obj: Record<string, unknown>;
  try {
    obj = parseJsonc(raw);
  } catch (err) {
    throw new Error(`opencode.jsonc 解析失败（可能含 /* */ 块注释），已放弃写入保护原文件：${(err as Error).message}`);
  }
  const agentObj = isPlainObject(obj.agent) ? (obj.agent as Record<string, unknown>) : {};
  const existing = isPlainObject(agentObj[agentId]) ? (agentObj[agentId] as Record<string, unknown>) : {};
  agentObj[agentId] = { ...existing, model }; // 仅覆盖 model，保留其他字段（REV-1507）
  obj.agent = agentObj;
  atomicWriteFileSync(filePath, JSON.stringify(obj, null, 2) + '\n');
}

// ─── default 层读写编排 ───────────────────────────────────────────

/** 判定 agent 在 default 层是否可写；返回各源是否存在显式 model */
function defaultScopeSources(agentId: string, opts?: ModelConfigOptions): { frontmatter: boolean; opencodeConfig: boolean } {
  const fmZh = readFrontmatterModel(agentId, 'zh-CN', opts);
  const fmEn = readFrontmatterModel(agentId, 'en', opts);
  const occ = readOpencodeConfigAgentModel(agentId, opts);
  return { frontmatter: fmZh !== null || fmEn !== null, opencodeConfig: occ !== null };
}

/**
 * 读取 default 层多源值（REV-1503 + REV-1606 修正链）。
 * frontmatter（agent markdown）加载优先级高于 opencode.jsonc（opencode-config.ts 侧），
 * 故不一致时以 frontmatter 值生效（原方案误以 opencode-config 值生效，实测勘误）。
 */
function getDefaultScopeValue(agentId: string, opts?: ModelConfigOptions): { value: string | null; inconsistent: boolean } {
  const fmZh = readFrontmatterModel(agentId, 'zh-CN', opts);
  const fmEn = readFrontmatterModel(agentId, 'en', opts);
  const occ = readOpencodeConfigAgentModel(agentId, opts);
  const fm = fmZh ?? fmEn;
  const inconsistent = (occ !== null && fm !== null && occ !== fm) || (fmZh !== fmEn);
  return { value: fm ?? occ, inconsistent };
}

// ─── 公开 API ─────────────────────────────────────────────────────

/**
 * 写指定 scope 的 agent model。
 * default 层：4 有显式 model 的 agent 改 frontmatter 双语 +（vision/reviewer 额外）opencode-config.ts；
 *             5 无显式 model 的 agent 抛错提示用 global/project。
 * global 层：加锁 + 原子写；project 层：仅原子写。
 */
export function setAgentModel(
  scope: ModelScope,
  agentIdRaw: string,
  model: string,
  opts?: ModelConfigOptions,
): SetModelResult {
  const agentId = normalizeAgentId(agentIdRaw);
  const changedFiles: string[] = [];
  const validation = validateModel(model);
  if (!validation.ok) {
    throw new Error(`${validation.error}${validation.providers ? `；可用 provider：${validation.providers.join(', ')}` : ''}`);
  }

  if (scope === 'default') {
    const sources = defaultScopeSources(agentId, opts);
    if (!sources.frontmatter && !sources.opencodeConfig) {
      throw new Error(`agent "${agentId}" 无框架默认 model，请改用 --scope global（本机全局）或 --scope project（当前项目）`);
    }
    if (sources.frontmatter) {
      changedFiles.push(writeFrontmatterModel(agentId, 'zh-CN', model, opts));
      changedFiles.push(writeFrontmatterModel(agentId, 'en', model, opts));
    }
    if (sources.opencodeConfig) {
      changedFiles.push(writeOpencodeConfigAgentModel(agentId, model, opts));
    }
    return { ok: true, scope, agentId, model, changedFiles, needsBuild: true, warning: validation.warning };
  }

  if (scope === 'global') {
    const p = getGlobalOpencodeJsoncPath();
    withFileLock(globalLockPath('global-opencode-jsonc'), () => writeJsoncAgentModel(p, agentId, model));
    changedFiles.push(p);
    return { ok: true, scope, agentId, model, changedFiles, warning: validation.warning };
  }

  // project
  const projectPath = resolve(opts?.projectPath ?? process.cwd());
  const p = join(projectPath, 'opencode.jsonc');
  writeJsoncAgentModel(p, agentId, model);
  changedFiles.push(p);
  return { ok: true, scope, agentId, model, changedFiles, warning: validation.warning };
}

/**
 * 读 agent model。始终返回完整 byScope（三 scope 显式值）。
 * scope 指定时 effective=该 scope 值；未指定时 effective=default > project > global 首个非空（修正链）。
 */
export function getAgentModel(agentIdRaw: string, scope?: ModelScope, opts?: ModelConfigOptions): GetModelResult {
  const agentId = normalizeAgentId(agentIdRaw);
  const projectPath = resolve(opts?.projectPath ?? process.cwd());
  const project = readJsoncAgentModel(join(projectPath, 'opencode.jsonc'), agentId);
  const global = readJsoncAgentModel(getGlobalOpencodeJsoncPath(), agentId);
  const def = getDefaultScopeValue(agentId, opts);

  const byScope: Partial<Record<ModelScope, string | null>> = {
    project,
    global,
    default: def.value,
  };
  // 修正链（REV-1606）：agent markdown frontmatter（default 层）> 项目 jsonc > 全局 jsonc
  const effective = scope
    ? (byScope[scope] ?? undefined)
    : (def.value ?? project ?? global ?? undefined);
  return { agentId, effective, byScope, inconsistent: def.inconsistent };
}

/** 列出所有 9 个 agent 的模型（REV-1507：始终返回完整 byScope，scope 仅透传给 get） */
export function listAgentModels(scope?: ModelScope, opts?: ModelConfigOptions): GetModelResult[] {
  return listAgentIds('zh-CN').map((id) => getAgentModel(id, scope, opts));
}
