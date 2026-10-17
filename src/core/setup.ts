/**
 * setup 命令核心模块（v1.1.1）
 * 纯全局部署：全局 AGENTS.md + 9 agent + 18 skill + 全局平台适配器配置文件（opencode.jsonc）。
 * 不建立项目 .openfeel/；复用 deployGlobalAsset（受管区三态，幂等可重跑）。
 */
import { mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { listAgentIds, loadAgentTemplate, loadTemplate, loadClaudeConstraintTemplate, loadClaudeAgentTemplate, listClaudeAgentIds } from './template-loader.js';
import { loadGlobalUpdateState, saveGlobalUpdateState, createGlobalUpdateState, updateFileHash, getOpenfeelVersion, type UpdateState } from './update-state.js';
import { deployGlobalAsset, SKILL_DEFINITIONS } from './update.js';
import { appendUpdateInfo } from './update-infos.js';
import { backupFileBeforeWrite, notifyBackupIfTTY, BackupError } from './backup.js';
import { mergeGlobalOpencodeJsonc } from './opencode-config.js';
import { applyClaudeSettings } from './claude-settings.js';
import { t } from './i18n.js';
import { getGlobalAgentsMdPath, getGlobalAgentsDir, getGlobalSkillsDir, getGlobalOpencodeJsoncPath, getClaudeAgentsDir, getClaudeSkillsDir, getClaudeMdPath, getClaudeSettingsPath } from './global-paths.js';
import { atomicWriteFileSync } from './fs/atomic-write.js';
import { readJsoncFile } from './fs/safe-read.js';
import { withFileLock, globalLockPath } from './fs/file-lock.js';
import { planDshDeployment, applyDshDeployment, type DshProfileResult } from './dsh-profile.js';

/** setup 部署结果 */
export interface SetupResult {
  created: string[];
  updated: string[];
  skipped: string[];
  appended: string[];
  /** DSH profile 部署结果（仅 `--tools dsh` 时出现；不进入全局资产 hash/update_state） */
  dsh?: {
    home: string;
    adapterDir: string;
    profiles: DshProfileResult[];
  };
}

/** `--tools dsh` 的额外选项 */
export interface SetupOptions {
  dshProfile?: string;
}

/** 纯全局部署（首次全量，幂等）；不建立项目 .openfeel/；按 tools 门控分支（默认仅 opencode） */
export function setupGlobalFramework(
  lang: 'zh-CN' | 'en' = 'zh-CN',
  tools: string[] = ['opencode'],
  options: SetupOptions = {},
): SetupResult {
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

  // DSH 预检必须先于任何写盘（含 opencode/claude 分支）：profile/结构/adapter 校验
  const dshPlan = tools.includes('dsh')
    ? planDshDeployment({ dshProfile: options.dshProfile })
    : undefined;

  const globalState: UpdateState = loadGlobalUpdateState() ?? createGlobalUpdateState({});

  // opencode 分支（步骤 1~4）——原样保留，最小 diff
  if (tools.includes('opencode')) {
    // 1. 全局 AGENTS.md（框架约束唯一权威）
    push(deployGlobalAsset(getGlobalAgentsMdPath(), loadTemplate(lang, 'agents-md'), globalState, 'setup'), getGlobalAgentsMdPath());

    // 2. 9 agent → 全局 agents 目录
    const agentsDir = getGlobalAgentsDir();
    mkdirSync(agentsDir, { recursive: true });
    for (const id of listAgentIds(lang)) {
      const p = join(agentsDir, `${id}.md`);
      push(deployGlobalAsset(p, loadAgentTemplate(lang, id), globalState, 'setup'), p);
    }

    // 3. 18 skill → 全局 skills 目录
    const skillsDir = getGlobalSkillsDir();
    mkdirSync(skillsDir, { recursive: true });
    for (const [name, content] of Object.entries(SKILL_DEFINITIONS)) {
      mkdirSync(join(skillsDir, name), { recursive: true });
      const p = join(skillsDir, name, 'SKILL.md');
      push(deployGlobalAsset(p, content, globalState, 'setup'), p);
    }

    // 4. 全局平台适配器配置文件（opencode.jsonc）：深度合并（保留用户字段），加全局锁 + 原子写
    const jsoncPath = getGlobalOpencodeJsoncPath();
    try {
      // 写前备份（B3）：备份须在 jsonc 锁之外（之前）完成，避免 backup 锁与 jsonc 锁嵌套
      const jsoncBackup = backupFileBeforeWrite(jsoncPath, { command: 'setup' });
      if (jsoncBackup) {
        appendUpdateInfo('backed', { absolutePath: jsoncPath, backupRel: jsoncBackup.backupRel, command: 'setup' });
        notifyBackupIfTTY(jsoncBackup.backupRel);
      }
      const merged = withFileLock(globalLockPath('global-opencode-jsonc'), () => {
        // 安全读取（T50）：目录占位/不可读 → null，跳过合并与写入，按空配置继续
        const current = readJsoncFile(jsoncPath);
        if (current === null) {
          return null;
        }
        let out: string;
        try {
          out = mergeGlobalOpencodeJsonc(current);
        } catch (err) {
          // 解析失败时保留原文件，避免破坏用户配置
          console.warn(t('setup.globalJsoncParseSkipTmpl', lang, { err: (err as Error).message }));
          out = current;
        }
        atomicWriteFileSync(jsoncPath, out);
        return out;
      });
      if (merged !== null) {
        updateFileHash(globalState, jsoncPath, merged);
      }
    } catch (err) {
      if (err instanceof BackupError) {
        // 备份失败（REV-011-A）：跳过全局 jsonc 写入、记 anomaly、继续其余步骤（对齐 B3 幂等语义）
        appendUpdateInfo('anomaly', { absolutePath: jsoncPath, note: 'backup_failed' });
        console.warn(t('setup.globalJsoncWriteSkipTmpl', lang, { err: err.message }));
      } else {
        throw err; // 非备份错误照旧上抛（锁超时等不回退）
      }
    }
  }

  // claude 分支：CLAUDE.md + 9 agent + 18 共享 skill + settings.json（stage-73）
  if (tools.includes('claude')) {
    // 1c. 全局约束 CLAUDE.md（受管区三态复用 deployGlobalAsset）
    const claudeMd = getClaudeMdPath();
    push(deployGlobalAsset(claudeMd, loadClaudeConstraintTemplate(lang), globalState, 'setup'), claudeMd);

    // 2c. 9 个 Claude agent（含 feel）→ ~/.claude/agents/
    const claudeAgentsDir = getClaudeAgentsDir();
    mkdirSync(claudeAgentsDir, { recursive: true });
    for (const id of listClaudeAgentIds(lang)) {
      const p = join(claudeAgentsDir, `${id}.md`);
      push(deployGlobalAsset(p, loadClaudeAgentTemplate(lang, id), globalState, 'setup'), p);
    }

    // 3c. 18 个共享 skill → ~/.claude/skills/
    const claudeSkillsDir = getClaudeSkillsDir();
    mkdirSync(claudeSkillsDir, { recursive: true });
    for (const [name, content] of Object.entries(SKILL_DEFINITIONS)) {
      mkdirSync(join(claudeSkillsDir, name), { recursive: true });
      const p = join(claudeSkillsDir, name, 'SKILL.md');
      push(deployGlobalAsset(p, content, globalState, 'setup'), p);
    }

    // 4c. settings.json：读-深合并-写回（注入 agent:"feel" + permissions.defaultMode:"auto"；用户键保留）
    const settingsPath = getClaudeSettingsPath();
    push(applyClaudeSettings(globalState, 'setup', lang), settingsPath);
  }

  // DSH 分支：锁外备份 + 锁内重读/合并/按需写 + 解锁后 install（fail-fast）
  let dsh: SetupResult['dsh'];
  if (dshPlan !== undefined) {
    const profiles = applyDshDeployment(dshPlan);
    // REV-003：DSH profile 不属于受管全局资产，只放 result.dsh，不进入 created/updated/skipped
    dsh = { home: dshPlan.home, adapterDir: dshPlan.adapterDir, profiles };
  }

  // 5. 写盘全局 state + 记录已部署 hash（N3：纯 dsh 不刷新全局部署版本事实）
  const touchesGlobalAssets = tools.includes('opencode') || tools.includes('claude');
  if (touchesGlobalAssets) {
    for (const p of [...created, ...updated, ...appended]) {
      if (existsSync(p)) updateFileHash(globalState, p, readFileSync(p, 'utf-8'));
    }
    globalState.last_update = new Date().toISOString();
    // stage-66/D-A：部署完成即刷新「已部署版本」事实源（每次 setup 刷新，语义=当前已部署全局资产的版本）
    globalState.openfeel_version = getOpenfeelVersion();
    saveGlobalUpdateState(globalState);
  }

  return { created, updated, skipped, appended, ...(dsh === undefined ? {} : { dsh }) };
}
