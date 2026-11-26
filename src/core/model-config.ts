/**
 * 模型配置核心模块（stage-40；v1.6.3 / REQ-070 改为两层语义）
 * 提供「全局 / 当前项目」两层级 agent 模型的读写与校验，
 * 供 CLI（openfeel model）与内部 API（Model not found 报错时自动修复）共用。
 *
 * 本模块属 opencode 适配器实现；下文 opencode / opencode.jsonc / ~/.config/opencode 均为该适配器细节。
 *
 * ── 两层落点（v1.6.3 / REQ-070：default 层已移除）──
 *  - global：~/.config/opencode/opencode.jsonc 的 agent.<name>.model（加锁 + 原子写，只改 model 键）
 *  - project：项目根 opencode.jsonc 的 agent.<name>.model（原子写，不加锁）
 * 框架不再预设任何模型：opencode agent 模板 frontmatter 不带 `model` 键，框架也不再向用户
 * opencode.jsonc 注入 agent 默认；模型由平台/会话选择，或由用户按需在上述两层显式配置。
 *
 * ── 解析优先级（v1.6.3 / REQ-070）──
 * opencode 官方配置源优先级为「project config < .opencode 目录（agents 等）」，故 agent markdown
 * frontmatter 覆盖 jsonc；但框架部署的 agent 模板不带 `model` 键，故 frontmatter 不再产生默认来源。
 * 生效链因此收窄为：
 *     项目 opencode.jsonc agent.model > 全局 opencode.jsonc agent.model > 平台默认
 *
 * 本模块为纯函数，不直接 console 输出，返回结构化结果。
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { atomicWriteFileSync } from './fs/atomic-write.js';
import { withFileLock, globalLockPath } from './fs/file-lock.js';
import { getGlobalOpencodeJsoncPath, getAuthJsonPath } from './global-paths.js';
import { parseJsonc } from './opencode-config.js';
import { listAgentIds } from './template-loader.js';
import { normalizeAgentName } from './flow-manager.js';
import { loadGlobalUpdateState, saveGlobalUpdateState, createGlobalUpdateState, updateFileHash } from './update-state.js';

// ─── 类型 ─────────────────────────────────────────────────────────

/**
 * scope 值域（v1.6.3 / REQ-070）。
 * `default` 键保留以稳住 JSON 契约（`byScope.default` 恒为 null），但写入路径已移除：
 * `set --scope default` 明确拒绝，`get --scope default` 返回未显式设置。
 */
export type ModelScope = 'default' | 'global' | 'project';

/** set 结果 */
export interface SetModelResult {
  ok: boolean;
  scope: ModelScope;
  agentId: string;
  model: string;
  changedFiles: string[];   // 实际写盘的文件绝对路径
  needsBuild?: boolean;     // 历史字段：default 层写入已移除，当前恒不设置
  warning?: string;         // 软校验提示（model-id 无法离线核对）
}

/** get 结果 */
export interface GetModelResult {
  agentId: string;
  effective?: string;                                 // 生效值（project > global 首个非空；default 层已移除）
  byScope: Partial<Record<ModelScope, string | null>>; // 各 scope 显式值（default 恒 null = 未显式）
  inconsistent?: boolean;                              // 历史字段：default 层多源比对已移除，当前恒 false
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
  // （v1.6.3 / REQ-070）移除 frameworkRoot：default 层读取框架源（templates-data frontmatter 与
  // opencode-config.ts 注入段）的路径推导已随 default 层一并删除。
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
    throw new Error(`平台适配器配置文件（opencode.jsonc）解析失败（可能含 /* */ 块注释），已放弃写入保护原文件：${(err as Error).message}`);
  }
  const agentObj = isPlainObject(obj.agent) ? (obj.agent as Record<string, unknown>) : {};
  const existing = isPlainObject(agentObj[agentId]) ? (agentObj[agentId] as Record<string, unknown>) : {};
  agentObj[agentId] = { ...existing, model }; // 仅覆盖 model，保留其他字段（REV-1507）
  obj.agent = agentObj;
  atomicWriteFileSync(filePath, JSON.stringify(obj, null, 2) + '\n');
}

// ─── 公开 API ─────────────────────────────────────────────────────

/**
 * 写指定 scope 的 agent model。
 * v1.6.3 / REQ-070：default 层已移除——框架不再预设模型，`set --scope default` 明确拒绝并提示改用两层。
 * global 层：加锁 + 原子写；project 层：仅原子写。
 */
export function setAgentModel(
  scope: ModelScope,
  agentIdRaw: string,
  model: string,
  opts?: ModelConfigOptions,
): SetModelResult {
  if (scope === 'default') {
    throw new Error('default 层已移除（v1.6.3 / REQ-070）：框架不再预设模型，请改用 --scope global（本机全局）或 --scope project（当前项目）');
  }
  const agentId = normalizeAgentId(agentIdRaw);
  const changedFiles: string[] = [];
  const validation = validateModel(model);
  if (!validation.ok) {
    throw new Error(`${validation.error}${validation.providers ? `；可用 provider：${validation.providers.join(', ')}` : ''}`);
  }

  if (scope === 'global') {
    const p = getGlobalOpencodeJsoncPath();
    withFileLock(globalLockPath('global-opencode-jsonc'), () => writeJsoncAgentModel(p, agentId, model));
    // REV-1803：与 update.ts 写盘后逻辑一致，同步全局 update_state 的 hash，
    // 避免后续 update 将本次 model 变更误判为用户外部修改
    const globalState = loadGlobalUpdateState() ?? createGlobalUpdateState({});
    updateFileHash(globalState, p, readFileSync(p, 'utf-8'));
    globalState.last_update = new Date().toISOString();
    saveGlobalUpdateState(globalState);
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
 * 读 agent model。始终返回完整 byScope（三键固定：project / global / default，default 恒 null）。
 * scope 指定时 effective=该 scope 值；未指定时 effective=project > global 首个非空（v1.6.3 起 default 层已移除）。
 */
export function getAgentModel(agentIdRaw: string, scope?: ModelScope, opts?: ModelConfigOptions): GetModelResult {
  const agentId = normalizeAgentId(agentIdRaw);
  const projectPath = resolve(opts?.projectPath ?? process.cwd());
  const project = readJsoncAgentModel(join(projectPath, 'opencode.jsonc'), agentId);
  const global = readJsoncAgentModel(getGlobalOpencodeJsoncPath(), agentId);

  // default 键保留（JSON 契约稳定；v1.6.4 起仅内部保留，CLI 不再打印阴影提示），值恒 null = 「未显式设置，走平台默认」
  const byScope: Partial<Record<ModelScope, string | null>> = {
    project,
    global,
    default: null,
  };
  // 生效链（v1.6.3 / REQ-070）：项目 jsonc > 全局 jsonc > 平台默认
  const effective = scope
    ? (byScope[scope] ?? undefined)
    : (project ?? global ?? undefined);
  // inconsistent 字段保留（JSON 契约稳定；v1.6.4 起仅内部保留）：default 层多源比对已移除，恒为 false
  return { agentId, effective, byScope, inconsistent: false };
}

/** 列出所有 10 个 agent 的模型（REV-1507：始终返回完整 byScope，scope 仅透传给 get） */
export function listAgentModels(scope?: ModelScope, opts?: ModelConfigOptions): GetModelResult[] {
  return listAgentIds('zh-CN').map((id) => getAgentModel(id, scope, opts));
}
