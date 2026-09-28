/**
 * setup 命令核心模块（v1.1.1）
 * 纯全局部署：全局 AGENTS.md + 9 agent + 16 skill + 全局平台适配器配置文件（opencode.jsonc）。
 * 不建立项目 .openfeel/；复用 deployGlobalAsset（受管区三态，幂等可重跑）。
 */
import { mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { listAgentIds, loadAgentTemplate, loadTemplate } from './template-loader.js';
import { loadGlobalUpdateState, saveGlobalUpdateState, createGlobalUpdateState, updateFileHash, type UpdateState } from './update-state.js';
import { deployGlobalAsset, SKILL_DEFINITIONS } from './update.js';
import { mergeGlobalOpencodeJsonc } from './opencode-config.js';
import { getGlobalAgentsMdPath, getGlobalAgentsDir, getGlobalSkillsDir, getGlobalOpencodeJsoncPath } from './global-paths.js';
import { atomicWriteFileSync } from './fs/atomic-write.js';
import { withFileLock, globalLockPath } from './fs/file-lock.js';

/** setup 部署结果 */
export interface SetupResult {
  created: string[];
  updated: string[];
  skipped: string[];
  appended: string[];
}

/** 纯全局部署（首次全量，幂等）；不建立项目 .openfeel/ */
export function setupGlobalFramework(lang: 'zh-CN' | 'en' = 'zh-CN'): SetupResult {
  const created: string[] = [];
  const updated: string[] = [];
  const skipped: string[] = [];
  const appended: string[] = [];
  const push = (action: string, path: string) => {
    if (action === 'created') created.push(path);
    else if (action === 'updated') updated.push(path);
    else if (action === 'skipped') skipped.push(path);
    else appended.push(path);
  };

  const globalState: UpdateState = loadGlobalUpdateState() ?? createGlobalUpdateState({});

  // 1. 全局 AGENTS.md（框架约束唯一权威）
  push(deployGlobalAsset(getGlobalAgentsMdPath(), loadTemplate(lang, 'agents-md'), globalState), getGlobalAgentsMdPath());

  // 2. 9 agent → 全局 agents 目录
  const agentsDir = getGlobalAgentsDir();
  mkdirSync(agentsDir, { recursive: true });
  for (const id of listAgentIds(lang)) {
    const p = join(agentsDir, `${id}.md`);
    push(deployGlobalAsset(p, loadAgentTemplate(lang, id), globalState), p);
  }

  // 3. 16 skill → 全局 skills 目录
  const skillsDir = getGlobalSkillsDir();
  mkdirSync(skillsDir, { recursive: true });
  for (const [name, content] of Object.entries(SKILL_DEFINITIONS)) {
    mkdirSync(join(skillsDir, name), { recursive: true });
    const p = join(skillsDir, name, 'SKILL.md');
    push(deployGlobalAsset(p, content, globalState), p);
  }

  // 4. 全局平台适配器配置文件（opencode.jsonc）：深度合并（保留用户字段），加全局锁 + 原子写
  const jsoncPath = getGlobalOpencodeJsoncPath();
  const merged = withFileLock(globalLockPath('global-opencode-jsonc'), () => {
    const current = existsSync(jsoncPath) ? readFileSync(jsoncPath, 'utf-8') : '{}\n';
    let out: string;
    try {
      out = mergeGlobalOpencodeJsonc(current);
    } catch (err) {
      // 解析失败时保留原文件，避免破坏用户配置
      console.warn(`[setup] 全局平台适配器配置（opencode.jsonc）解析失败，跳过合并保留原文件: ${(err as Error).message}`);
      out = current;
    }
    atomicWriteFileSync(jsoncPath, out);
    return out;
  });
  updateFileHash(globalState, jsoncPath, merged);

  // 5. 写盘全局 state + 记录已部署 hash
  for (const p of [...created, ...updated, ...appended]) {
    if (existsSync(p)) updateFileHash(globalState, p, readFileSync(p, 'utf-8'));
  }
  globalState.last_update = new Date().toISOString();
  saveGlobalUpdateState(globalState);

  return { created, updated, skipped, appended };
}
