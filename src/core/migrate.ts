/**
 * openfeel migrate 命令核心模块（stage-39 / P6）
 * 检测 legacy 布局 → 备份（manifest）→ 全局部署 → update_state 拆分/重键
 * → 清理 legacy 项目文件（逐项比对框架清单，保留项目自定义）→ flow.json assignee 报告（可选改写）。
 * 支持 --dry-run 预览与 rollback 回滚。
 */
import { existsSync, readFileSync, readdirSync, mkdirSync, rmSync, copyFileSync } from 'node:fs';
import { resolve, join, dirname, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { atomicWriteFileSync } from './fs/atomic-write.js';
import { withFileLock, globalLockPath } from './fs/file-lock.js';
import {
  loadUpdateState, saveUpdateState, loadGlobalUpdateState, saveGlobalUpdateState,
  updateFileHash, getOpenfeelVersion, isLegacyFrameworkKey, type UpdateState,
} from './update-state.js';
import {
  getGlobalAgentsDir, getGlobalSkillsDir, getGlobalCoreMdPath, getGlobalOpencodeJsoncPath,
} from './global-paths.js';
import { loadAgentTemplate, listAgentIds, loadTemplate } from './template-loader.js';
import { mergeGlobalOpencodeJsonc, parseJsonc } from './opencode-config.js';
import { normalizeAgentName } from './flow-manager.js';
import { deployGlobalAsset, SKILL_DEFINITIONS } from './update.js';

// ─── 类型 ─────────────────────────────────────────────────────────

/** legacy 检测报告（M3 五条判据） */
export interface LegacyReport {
  projectOpendirAgents: boolean;      // ① .opencode/agents/ 含「框架同源」.md（项目自定义不计，REV-007）
  projectOpendirSkills: boolean;      // ② .opencode/skills/ 含「框架同源」skill（项目自定义不计）
  projectOpendirInstructions: boolean;// ③ .opencode/instructions/core.md 存在
  legacyJsoncSkillsMapping: boolean;  // ④ opencode.jsonc 非法 skills 映射
  legacyJsoncInstructions: boolean;   // ④ opencode.jsonc 含 instructions 字段
  mixedUpdateState: boolean;          // ⑤ update_state.json 含 .opencode/... 旧 key
  isLegacy: boolean;                  // 任一为 true
}

/** manifest 单条记录 */
export interface ManifestEntry {
  op: 'delete' | 'modify';   // delete=删除源文件；modify=改写源文件（jsonc/state/flow.json）
  source: string;            // 源路径（相对 projectPath 或绝对路径，见下）
  backupPath: string;        // 备份路径（相对备份根）
  hash: string;              // 改写前内容 hash（delete 场景为删除前 hash）
  note?: string;             // 附加说明（如 flow.json assignee 改写快照）
}

/** manifest 元数据 */
export interface Manifest {
  version: '1.0';
  openfeel_version: string;
  createdAt: string;
  projectPath: string;
  legacy: LegacyReport;
  entries: ManifestEntry[];
  /** REV-1302：本次 migrate 新增/写入的全局 state key（rollback 仅删这些，不触碰历史全局条目） */
  globalStateKeys: string[];
}

/** 迁移结果 */
export interface MigrateResult {
  legacy: LegacyReport;
  backupDir: string | null;          // 实际执行时非 null；dry-run 为 null
  deployed: string[];                // 全局部署的文件路径
  stateSplit: SplitStateResult;      // state 拆分结果
  cleaned: string[];                 // 清理的 framework 文件
  keptCustom: string[];              // 保留的项目自定义资产
  jsoncCleaned: boolean;             // 项目 opencode.jsonc 是否清理了非法字段
  assigneeReport: { oldName: string; newName: string; count: number }[];
  remapped: boolean;                 // 是否执行了 assignee 改写
}

/** state 拆分结果 */
export interface SplitStateResult {
  movedToGlobal: string[];   // 移入全局 state 的新 key（绝对路径）
  keptInProject: string[];   // 保留项目 state 的 key
  unmapped: string[];        // 无法映射、保留项目 state 待人工处理的 key
}

// ─── 常量 ─────────────────────────────────────────────────────────

/** 备份目录相对项目根的前缀 */
const BACKUP_DIR = '.openfeel/backup';

// ─── 检测 ─────────────────────────────────────────────────────────
// 注：isLegacyFrameworkKey（旧框架 key 识别）由 op-002 在 update-state.ts 提供；
// op-004 回归统一 import（REV-1304），消除 op-001 阶段的内联 fallback 双实现。

/** legacy 判据 5 条（M3） */
export function detectLegacy(projectPath: string): LegacyReport {
  const agentsDir = resolve(projectPath, '.opencode', 'agents');
  const skillsDir = resolve(projectPath, '.opencode', 'skills');
  const instrCore = resolve(projectPath, '.opencode', 'instructions', 'core.md');
  const jsoncPath = resolve(projectPath, 'opencode.jsonc');

  // 框架同源集合（新名）：判据 ①/② 仅认「框架同源」旧布局资产（REV-007）；
  // 项目自定义 agent/skill 迁移后仍保留原位，不应使其恒为 legacy（否则幂等 REV-1204① 不成立）。
  const agentNames = new Set(listAgentIds('zh-CN'));
  const skillNames = new Set(Object.keys(SKILL_DEFINITIONS));

  let projectOpendirAgents = false;
  if (existsSync(agentsDir)) {
    try {
      projectOpendirAgents = readdirSync(agentsDir)
        .filter((n) => n.endsWith('.md'))
        .some((n) => agentNames.has(normalizeAgentName(n.replace(/\.md$/, ''))));
    } catch { projectOpendirAgents = false; }
  }
  let projectOpendirSkills = false;
  if (existsSync(skillsDir)) {
    try {
      projectOpendirSkills = readdirSync(skillsDir).some((d) => {
        if (!existsSync(join(skillsDir, d, 'SKILL.md'))) return false;
        const mapped = remapSkillName(d);
        return mapped !== null && skillNames.has(mapped);
      });
    } catch { projectOpendirSkills = false; }
  }
  const projectOpendirInstructions = existsSync(instrCore);

  let legacyJsoncSkillsMapping = false;
  let legacyJsoncInstructions = false;
  if (existsSync(jsoncPath)) {
    try {
      const obj = parseJsonc(readFileSync(jsoncPath, 'utf-8'));
      // 非法 skills 映射：skills 为对象且不含 paths/urls 结构（旧 {name:path} 形式）
      const skills = obj.skills;
      legacyJsoncSkillsMapping = typeof skills === 'object' && skills !== null
        && !Array.isArray(skills) && !('paths' in skills) && !('urls' in skills);
      legacyJsoncInstructions = 'instructions' in obj;
    } catch { /* parse 失败不视为 legacy jsonc（交由 detect 后续按存在性处理） */ }
  }

  const state = loadUpdateState(projectPath);
  const mixedUpdateState = state !== null && Object.keys(state.files).some(isLegacyFrameworkKey);

  const isLegacy = projectOpendirAgents || projectOpendirSkills || projectOpendirInstructions
    || legacyJsoncSkillsMapping || legacyJsoncInstructions || mixedUpdateState;
  return {
    projectOpendirAgents, projectOpendirSkills, projectOpendirInstructions,
    legacyJsoncSkillsMapping, legacyJsoncInstructions, mixedUpdateState, isLegacy,
  };
}

// ─── 框架清单比对（REV-007） ─────────────────────────────────────

/**
 * 列出 legacy 项目文件，按「框架同源 / 项目自定义」分类。
 * framework = 文件名归一化后命中框架清单（9 agent + 14 skill + core.md）；
 * custom = 其余（项目自定义 agent/skill），保留原位不迁移不删除。
 * 旧名（planner.md 等）经 normalizeAgentName 归一化后再比对（P5 兼容）。
 */
export function listLegacyFiles(
  projectPath: string,
  lang: 'zh-CN' | 'en' = 'zh-CN',
): { framework: string[]; custom: string[] } {
  const framework: string[] = [];
  const custom: string[] = [];
  // 框架 agent 名集合（新名）
  const agentNames = new Set(listAgentIds(lang));
  // 框架 skill 名集合（新名，含 openfeel- 前缀）
  const skillNames = new Set(Object.keys(SKILL_DEFINITIONS));

  const agentsDir = resolve(projectPath, '.opencode', 'agents');
  if (existsSync(agentsDir)) {
    for (const f of readdirSync(agentsDir)) {
      if (!f.endsWith('.md')) continue;
      const normalized = normalizeAgentName(f.replace(/\.md$/, ''));
      const abs = join(agentsDir, f);
      (agentNames.has(normalized) ? framework : custom).push(abs);
    }
  }
  const skillsDir = resolve(projectPath, '.opencode', 'skills');
  if (existsSync(skillsDir)) {
    for (const d of readdirSync(skillsDir)) {
      const skillMd = join(skillsDir, d, 'SKILL.md');
      if (!existsSync(skillMd)) continue;
      // 旧无前缀名经 remapSkillName 归一化后与新名集合比对（REV-1303），避免旧名 skill 误归 custom
      const mapped = remapSkillName(d);
      (mapped !== null && skillNames.has(mapped) ? framework : custom).push(skillMd);
    }
  }
  const instrCore = resolve(projectPath, '.opencode', 'instructions', 'core.md');
  if (existsSync(instrCore)) framework.push(instrCore);
  return { framework, custom };
}

// ─── 备份（M2） ─────────────────────────────────────────────────

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}

/** 备份将被删除/改写的项目文件到 .openfeel/backup/{ts}/ 并生成 manifest.json */
export function backupLegacy(
  projectPath: string,
  report: LegacyReport,
  opts?: { remapAssignee?: boolean },
): { backupDir: string; manifest: Manifest } {
  const ts = new Date().toISOString().replace(/[-:T]/g, '').replace(/\..*$/, '').replace(/Z$/, '');
  const backupDir = resolve(projectPath, BACKUP_DIR, ts);
  mkdirSync(backupDir, { recursive: true });

  const { framework } = listLegacyFiles(projectPath);
  const entries: ManifestEntry[] = [];

  // 1. legacy 框架文件（删除型）
  for (const abs of framework) {
    const rel = relative(projectPath, abs);
    const backupPath = join(backupDir, rel);
    mkdirSync(dirname(backupPath), { recursive: true });
    copyFileSync(abs, backupPath);
    entries.push({ op: 'delete', source: rel, backupPath: rel, hash: sha256(readFileSync(abs, 'utf-8')) });
  }

  // 2. 项目 opencode.jsonc（若含非法字段，改写型）
  const jsoncPath = resolve(projectPath, 'opencode.jsonc');
  if (existsSync(jsoncPath) && (report.legacyJsoncSkillsMapping || report.legacyJsoncInstructions)) {
    const rel = 'opencode.jsonc';
    copyFileSync(jsoncPath, join(backupDir, rel));
    entries.push({ op: 'modify', source: rel, backupPath: rel, hash: sha256(readFileSync(jsoncPath, 'utf-8')), note: 'remove legacy skills/instructions' });
  }

  // 3. 项目 update_state.json（若含旧框架 key，改写型）
  const stateRel = '.openfeel/update_state.json';
  const statePath = resolve(projectPath, stateRel);
  if (existsSync(statePath) && report.mixedUpdateState) {
    mkdirSync(join(backupDir, '.openfeel'), { recursive: true });
    copyFileSync(statePath, join(backupDir, stateRel));
    entries.push({ op: 'modify', source: stateRel, backupPath: stateRel, hash: sha256(readFileSync(statePath, 'utf-8')), note: 'split update_state' });
  }

  // 4. flow.json（仅 --remap-assignee 时，改写型；REV-1201）
  if (opts?.remapAssignee) {
    const flowRel = '.openfeel/flow.json';
    const flowPath = resolve(projectPath, flowRel);
    if (existsSync(flowPath)) {
      mkdirSync(join(backupDir, '.openfeel'), { recursive: true });
      copyFileSync(flowPath, join(backupDir, flowRel));
      entries.push({ op: 'modify', source: flowRel, backupPath: flowRel, hash: sha256(readFileSync(flowPath, 'utf-8')), note: 'remap assignee' });
    }
  }

  const manifest: Manifest = {
    version: '1.0',
    openfeel_version: getOpenfeelVersion(),
    createdAt: new Date().toISOString(),
    projectPath,
    legacy: report,
    entries,
    globalStateKeys: [],  // REV-1302：备份时先置空，migrateProject 全局部署/拆分后回填
  };
  atomicWriteFileSync(join(backupDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return { backupDir, manifest };
}

// ─── state 拆分重键（D39-2） ────────────────────────────────────

/**
 * 旧项目 state 框架条目 → 全局 state 重键；项目条目保留。
 * 重键规则：旧 key（.opencode/agents/planner.md）→ normalizeAgentName(文件名) 得新名
 * → 拼全局绝对路径（agentsDir/{新名}.md / skillsDir/{新名}/SKILL.md / core.md）。
 * 无法映射的条目保留项目 state 并记 unmapped 待人工处理。
 * @param globalStateIn 可选：调用方已加载的全局 state（REV-1402 复用避免重复 load）
 */
export function splitUpdateState(
  projectPath: string,
  lang: 'zh-CN' | 'en' = 'zh-CN',
  globalStateIn?: UpdateState,
): SplitStateResult {
  const state = loadUpdateState(projectPath);
  if (!state) return { movedToGlobal: [], keptInProject: [], unmapped: [] };
  // REV-1402：优先复用调用方已加载的全局 state（migrateProject 已 load 一次），
  // 避免重复 IO；未传入时回退内部加载以保持独立可用性。
  const globalState = globalStateIn
    ?? loadGlobalUpdateState()
    ?? { version: '1.0' as const, last_update: new Date().toISOString(), openfeel_version: getOpenfeelVersion(), files: {} };

  const movedToGlobal: string[] = [];
  const keptInProject: string[] = [];
  const unmapped: string[] = [];

  for (const [key, fileState] of Object.entries(state.files)) {
    if (!isLegacyFrameworkKey(key)) { keptInProject.push(key); continue; }
    const mapped = remapLegacyKey(key, lang);
    if (mapped) {
      // 移入全局 state：hash 沿用（旧文件内容 hash 与新全局内容不同时由后续 update 重新计算；
      // 此处仅保留记录，避免「无记录」触发全量追加，REV-911 安全行为）
      globalState.files[mapped] = fileState;
      delete state.files[key];
      movedToGlobal.push(mapped);
    } else {
      unmapped.push(key);  // 无法映射 → 保留项目 state 待人工处理
      keptInProject.push(key);
    }
  }

  saveUpdateState(projectPath, state);
  saveGlobalUpdateState(globalState);
  return { movedToGlobal, keptInProject, unmapped };
}

/** skill 旧名（无前缀）→ 新名（openfeel- 前缀）映射（REV-1303，全 14 skill 无例外） */
const LEGACY_SKILL_NAME_MAP: Record<string, string> = {
  'agent-model-check': 'openfeel-agent-model-check',
  'bug-acceptance': 'openfeel-bug-acceptance',
  'check-kb': 'openfeel-check-kb',
  'get-bugs': 'openfeel-get-bugs',
  'get-stage-status': 'openfeel-get-stage-status',
  health: 'openfeel-health',
  'model-check': 'openfeel-model-check',
  'model-config': 'openfeel-model-config',
  recover: 'openfeel-recover',
  roadmap: 'openfeel-roadmap',
  'search-kb': 'openfeel-search-kb',
  'sync-status': 'openfeel-sync-status',
  'update-stage-status': 'openfeel-update-stage-status',
  wizard: 'openfeel-wizard',
};

/** skill 旧名归一化（REV-1303）：旧无前缀名 → openfeel- 新名；已是新名幂等返回；未知返回 null */
function remapSkillName(name: string): string | null {
  if (name.startsWith('openfeel-')) return name;  // 幂等：不二次前缀化
  return LEGACY_SKILL_NAME_MAP[name] ?? null;
}

/** 旧框架 key → 全局绝对路径 key；无法映射返回 null */
function remapLegacyKey(key: string, lang: 'zh-CN' | 'en'): string | null {
  const norm = key.replace(/\\/g, '/');
  // .opencode/agents/{name}.md → agentsDir/{newName}.md
  if (norm.startsWith('.opencode/agents/') && norm.endsWith('.md')) {
    const name = norm.slice('.opencode/agents/'.length, -3);
    const normalized = normalizeAgentName(name);
    if (!normalized || normalized === name) return null;  // 无法归一化（非 agent 旧名）
    return join(getGlobalAgentsDir(), `${normalized}.md`);
  }
  // .opencode/skills/{name}/SKILL.md → skillsDir/{newName}/SKILL.md（REV-1303：旧名补 openfeel- 前缀）
  if (norm.startsWith('.opencode/skills/') && norm.endsWith('/SKILL.md')) {
    const name = norm.slice('.opencode/skills/'.length, -'/SKILL.md'.length);
    const mapped = remapSkillName(name);
    if (!mapped) return null;  // 非 14 skill 旧名（项目自定义 skill）
    return join(getGlobalSkillsDir(), mapped, 'SKILL.md');
  }
  // .opencode/instructions/core.md → 全局 core.md
  if (norm === '.opencode/instructions/core.md') {
    return getGlobalCoreMdPath();
  }
  return null;
}

// ─── 清理项目 opencode.jsonc ────────────────────────────────────

/** 移除项目 opencode.jsonc 的非法 skills 映射与 instructions 字段，保留用户自定义字段 */
function cleanProjectJsonc(projectPath: string): boolean {
  const jsoncPath = resolve(projectPath, 'opencode.jsonc');
  if (!existsSync(jsoncPath)) return false;
  const obj = parseJsonc(readFileSync(jsoncPath, 'utf-8'));
  let changed = false;
  // REV-1305：仅删非法 skills 映射（旧 {name:path} 对象形式）；合法 {paths,urls} 结构保留，避免误删
  if ('skills' in obj) {
    const skills = obj.skills;
    const illegalSkills = typeof skills === 'object' && skills !== null
      && !Array.isArray(skills) && !('paths' in skills) && !('urls' in skills);
    if (illegalSkills) { delete obj.skills; changed = true; }
  }
  if ('instructions' in obj) { delete obj.instructions; changed = true; }
  if (changed) {
    atomicWriteFileSync(jsoncPath, JSON.stringify(obj, null, 2) + '\n');
  }
  return changed;
}

// ─── assignee 报告 / 改写（M5） ─────────────────────────────────

/** 扫描 flow.json 旧 assignee，报告旧名→新名映射；dryRun 仅报告不写 */
export function remapAssignees(projectPath: string, dryRun: boolean): { changes: string[]; count: number } {
  const flowPath = resolve(projectPath, '.openfeel', 'flow.json');
  if (!existsSync(flowPath)) return { changes: [], count: 0 };
  const data = JSON.parse(readFileSync(flowPath, 'utf-8'));
  const changes: string[] = [];
  let count = 0;
  // REV-1301：flow.json 的 stages 为 Record<string, StageData>、stage.ops 为 Record<string, Op>（对象，非数组），
  // 须用 Object.values 遍历，for...of 对象会抛 TypeError。stage 标识用 name 字段（StageData 无 id）。
  for (const stage of Object.values(data.stages ?? {})) {
    for (const op of Object.values((stage as { ops?: Record<string, { assignee?: string; id?: string }> }).ops ?? {})) {
      if (op.assignee && normalizeAgentName(op.assignee) !== op.assignee) {
        const oldName = op.assignee;
        const newName = normalizeAgentName(op.assignee);
        changes.push(`${(stage as { name?: string }).name}.${op.id}: ${oldName} → ${newName}`);
        count++;
        if (!dryRun) op.assignee = newName;
      }
    }
  }
  if (!dryRun && count > 0) {
    atomicWriteFileSync(flowPath, JSON.stringify(data, null, 2) + '\n');
  }
  return { changes, count };
}

// ─── 备份清理（REV-1206） ───────────────────────────────────────

/** 保留最近 keep 次备份，删除更早的备份目录 */
export function cleanOldBackups(projectPath: string, keep: number = 5): string[] {
  const root = resolve(projectPath, BACKUP_DIR);
  if (!existsSync(root)) return [];
  const dirs = readdirSync(root).filter((d) => /^\d{14}$/.test(d)).sort();
  const removed: string[] = [];
  while (dirs.length > keep) {
    const oldest = dirs.shift()!;
    rmSync(join(root, oldest), { recursive: true, force: true });
    removed.push(oldest);
  }
  return removed;
}

// ─── 主流程（M4） ───────────────────────────────────────────────

/** 迁移主流程：检测→备份→全局部署→state 拆分→清理→assignee 报告 */
export function migrateProject(
  projectPath: string,
  opts?: { dryRun?: boolean; remapAssignee?: boolean; lang?: 'zh-CN' | 'en' },
): MigrateResult {
  const lang = opts?.lang ?? 'zh-CN';
  const dryRun = opts?.dryRun ?? false;
  const remap = opts?.remapAssignee ?? false;

  const legacy = detectLegacy(projectPath);
  const { framework, custom } = listLegacyFiles(projectPath, lang);

  // REV-1307：不论 remap 与否都先扫描报告（remapAssignees(..., true) 仅扫描不写）；
  // 否则 --remap-assignee 时 assigneeReport 为空，dry-run 预览缺 assignee 报告。
  const assigneeReport = (() => {
    const r = remapAssignees(projectPath, true);  // 仅扫描报告（不写）
    return aggregateAssignee(r);
  })();

  if (dryRun) {
    // 预览：不写盘，返回计划
    return {
      legacy, backupDir: null, deployed: [], stateSplit: { movedToGlobal: [], keptInProject: [], unmapped: [] },
      cleaned: framework, keptCustom: custom, jsoncCleaned: legacy.legacyJsoncSkillsMapping || legacy.legacyJsoncInstructions,
      assigneeReport, remapped: false,
    };
  }

  if (!legacy.isLegacy) {
    return { legacy, backupDir: null, deployed: [], stateSplit: { movedToGlobal: [], keptInProject: [], unmapped: [] }, cleaned: [], keptCustom: [], jsoncCleaned: false, assigneeReport, remapped: false };
  }

  // 1. 备份
  const { backupDir, manifest } = backupLegacy(projectPath, legacy, { remapAssignee: remap });

  // 2. 全局部署（复用 update 能力；REV-1201 全局资产不纳入回滚）
  const deployed: string[] = [];
  const globalStateKeys: string[] = [];  // REV-1302：记录本次写入的全局 state key（rollback 仅删这些）
  const globalState = loadGlobalUpdateState() ?? { version: '1.0' as const, last_update: new Date().toISOString(), openfeel_version: getOpenfeelVersion(), files: {} };
  let stateSplit: SplitStateResult = { movedToGlobal: [], keptInProject: [], unmapped: [] };
  // REV-1405：全局部署 + state 拆分纳入 try/finally。步骤 2 中途抛异常时仍回填
  // manifest.globalStateKeys（已部署 key），避免 rollback 无法清理已写入的全局 state 记录。
  try {
    const corePath = getGlobalCoreMdPath();
    deployGlobalAsset(corePath, loadTemplate(lang, 'core-instructions'), globalState);
    deployed.push(corePath);
    globalStateKeys.push(corePath);
    const agentsDir = getGlobalAgentsDir();
    for (const name of listAgentIds(lang)) {
      const p = join(agentsDir, `${name}.md`);
      deployGlobalAsset(p, loadAgentTemplate(lang, name), globalState);
      deployed.push(p);
      globalStateKeys.push(p);
    }
    const skillsDir = getGlobalSkillsDir();
    for (const [name, content] of Object.entries(SKILL_DEFINITIONS)) {
      mkdirSync(join(skillsDir, name), { recursive: true });
      const p = join(skillsDir, name, 'SKILL.md');
      deployGlobalAsset(p, content, globalState);
      deployed.push(p);
      globalStateKeys.push(p);
    }
    // REV-1804：框架资产（core.md / agents / skills）写盘后同步全局 state hash，与 update.ts 末尾循环一致；
    // 避免迁移后 hash 缺失导致下次 update 误判为外部修改。global jsonc 的 hash 在下方单独更新，不重复。
    for (const p of deployed) {
      if (existsSync(p)) {
        updateFileHash(globalState, p, readFileSync(p, 'utf-8'));
      }
    }
    // 全局 opencode.jsonc 深度合并（REV-1306：复用 update.ts 的 try-catch 降级，parse 失败保留原文件+告警）
    const globalJsoncPath = getGlobalOpencodeJsoncPath();
    let merged: string;
    try {
      merged = mergeGlobalOpencodeJsonc(existsSync(globalJsoncPath) ? readFileSync(globalJsoncPath, 'utf-8') : '{}\n');
    } catch (err) {
      console.warn(`[migrate] 全局 opencode.jsonc 解析失败（可能含块注释），跳过合并保留原文件: ${(err as Error).message}`);
      merged = existsSync(globalJsoncPath) ? readFileSync(globalJsoncPath, 'utf-8') : '{}\n';
    }
    withFileLock(globalLockPath('global-opencode-jsonc'), () => atomicWriteFileSync(globalJsoncPath, merged));
    updateFileHash(globalState, globalJsoncPath, merged);
    saveGlobalUpdateState(globalState);
    globalStateKeys.push(globalJsoncPath);

    // 3. state 拆分/重键（REV-1402：复用上面已加载的 globalState，避免重复 IO）
    stateSplit = splitUpdateState(projectPath, lang, globalState);
    globalStateKeys.push(...stateSplit.movedToGlobal);  // REV-1302：拆分移入全局的 key 纳入 rollback 范围
  } finally {
    // REV-1302 / REV-1405：无论部署是否成功，均回填 manifest.globalStateKeys
    //（rollback 据此仅删本次写入的全局 state key）。
    manifest.globalStateKeys = globalStateKeys;
    atomicWriteFileSync(join(backupDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  }

  // 4. 清理 legacy 框架文件（framework 删除，custom 保留）
  for (const abs of framework) {
    rmSync(abs, { force: true });
    // 删除后清理空的父目录（如 skills/{name}/ 空子目录），避免残留导致 legacy 判据 ② 恒真
    const parent = dirname(abs);
    try {
      if (existsSync(parent) && readdirSync(parent).length === 0) {
        rmSync(parent, { recursive: true, force: true });
      }
    } catch { /* 忽略 */ }
  }
  // 清理空目录（agents/skills/instructions 若无剩余则删除）
  for (const d of ['.opencode/agents', '.opencode/skills', '.opencode/instructions']) {
    const dir = resolve(projectPath, d);
    try { if (existsSync(dir) && readdirSync(dir).length === 0) rmSync(dir, { recursive: true, force: true }); } catch { /* 忽略 */ }
  }

  // 5. 清理项目 opencode.jsonc
  const jsoncCleaned = cleanProjectJsonc(projectPath);

  // 6. assignee 改写（可选）
  let remapped = false;
  const finalAssigneeReport = remap ? (() => { const r = remapAssignees(projectPath, false); remapped = r.count > 0; return aggregateAssignee(r); })() : assigneeReport;

  // 7. 备份清理（REV-1206）
  cleanOldBackups(projectPath, 5);

  return {
    legacy, backupDir, deployed, stateSplit,
    cleaned: framework, keptCustom: custom, jsoncCleaned,
    assigneeReport: finalAssigneeReport, remapped,
  };
}

/** 将 remapAssignees 的 changes 聚合为 { oldName, newName, count }[] */
function aggregateAssignee(r: { changes: string[]; count: number }): { oldName: string; newName: string; count: number }[] {
  const map = new Map<string, { oldName: string; newName: string; count: number }>();
  for (const c of r.changes) {
    const m = c.match(/^(.*): (.*) → (.*)$/);
    if (!m) continue;
    const key = `${m[2]}→${m[3]}`;
    const cur = map.get(key) ?? { oldName: m[2], newName: m[3], count: 0 };
    cur.count++; map.set(key, cur);
  }
  return [...map.values()];
}

// ─── 回滚（D39-3 / REV-1201） ──────────────────────────────────

/** 回滚最近一次迁移：按 manifest 逆向恢复项目文件 + 还原全局 state 新增条目 */
export function rollbackMigration(projectPath: string, backupTs?: string): { restored: string[]; stateRestored: boolean } {
  const root = resolve(projectPath, BACKUP_DIR);
  let backupDir: string;
  if (backupTs) {
    backupDir = join(root, backupTs);
  } else {
    const dirs = readdirSync(root).filter((d) => /^\d{14}$/.test(d)).sort();
    if (dirs.length === 0) throw new Error('无可回滚的备份');
    backupDir = join(root, dirs[dirs.length - 1]);
  }
  const manifestPath = join(backupDir, 'manifest.json');
  if (!existsSync(manifestPath)) throw new Error(`备份 manifest 缺失: ${manifestPath}`);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as Manifest;

  const restored: string[] = [];
  // 逆向恢复：delete 型 = 源文件已被删，从备份复制回；modify 型 = 源文件被改写，从备份覆盖回
  for (const e of manifest.entries) {
    const sourceAbs = resolve(projectPath, e.source);
    const backupAbs = join(backupDir, e.backupPath);
    if (!existsSync(backupAbs)) continue;
    mkdirSync(dirname(sourceAbs), { recursive: true });
    copyFileSync(backupAbs, sourceAbs);
    restored.push(e.source);
  }

  // 全局 state 还原：仅移除本次 migrate 写入的 key（REV-1302：以 manifest.globalStateKeys 为准，
  // 不触碰历史全局框架条目；REV-1201 不还原全局文件，仅还原 state）
  let stateRestored = false;
  const globalState = loadGlobalUpdateState();
  if (globalState) {
    const keysToRemove = manifest.globalStateKeys ?? [];
    for (const k of keysToRemove) { delete globalState.files[k]; }
    saveGlobalUpdateState(globalState);
    stateRestored = true;
  }

  return { restored, stateRestored };
}

/** 回滚预览（REV-1309）：读取最新 manifest，返回 entries 列表（source + op 类型），不写盘 */
export function previewRollback(projectPath: string, backupTs?: string): { op: 'delete' | 'modify'; source: string }[] {
  const root = resolve(projectPath, BACKUP_DIR);
  let backupDir: string;
  if (backupTs) {
    backupDir = join(root, backupTs);
  } else {
    const dirs = readdirSync(root).filter((d) => /^\d{14}$/.test(d)).sort();
    if (dirs.length === 0) throw new Error('无可回滚的备份');
    backupDir = join(root, dirs[dirs.length - 1]);
  }
  const manifestPath = join(backupDir, 'manifest.json');
  if (!existsSync(manifestPath)) throw new Error(`备份 manifest 缺失: ${manifestPath}`);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as Manifest;
  return manifest.entries.map((e) => ({ op: e.op, source: e.source }));
}
