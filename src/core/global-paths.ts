/**
 * 全局路径模块
 * 集中解析「平台适配器」与 openfeel 的全局路径（基于用户主目录），
 * 作为 init/update 全局部署的路径基础。
 * 仅此模块 import node:os 的 homedir（N4）：测试 mock 一处即隔离全部全局路径。
 */
import { join } from 'node:path';
import { homedir } from 'node:os';

/**
 * 获取当前用户主目录（单点入口）。
 * 测试通过 vi.mock('node:os') 隔离，禁止其他模块直接调用 os.homedir()（T27）。
 */
export function getHomedir(): string {
  return homedir();
}

/** 全局配置根目录（opencode 适配器：~/.config/opencode） */
export function getOpencodeGlobalDir(): string {
  return join(homedir(), '.config', 'opencode');
}

/** 全局 agents 目录（opencode 适配器） */
export function getGlobalAgentsDir(): string {
  return join(getOpencodeGlobalDir(), 'agents');
}

/** 全局 skills 目录（opencode 适配器） */
export function getGlobalSkillsDir(): string {
  return join(getOpencodeGlobalDir(), 'skills');
}

/** 全局平台适配器配置文件路径（opencode 适配器：opencode.jsonc） */
export function getGlobalOpencodeJsoncPath(): string {
  return join(getOpencodeGlobalDir(), 'opencode.jsonc');
}

/** 全局框架约束 core.md 路径（opencode 适配器遗留：~/.config/opencode/openfeel/core.md；v1.1.1 起废弃，仅兼容检测/清理） */
export function getGlobalCoreMdPath(): string {
  return join(getOpencodeGlobalDir(), 'openfeel', 'core.md');
}

/** 全局规则文件路径（opencode 适配器：~/.config/opencode/AGENTS.md；框架约束唯一权威，v1.1.1） */
export function getGlobalAgentsMdPath(): string {
  return join(getOpencodeGlobalDir(), 'AGENTS.md');
}

/** 全局 update_state.json 路径（~/.openfeel/update_state.json） */
export function getGlobalUpdateStatePath(): string {
  return join(homedir(), '.openfeel', 'update_state.json');
}

/** 全局 update_infos.md 路径（~/.openfeel/update_infos.md；读写属 stage-38，本阶段仅解析路径） */
export function getGlobalUpdateInfosPath(): string {
  return join(homedir(), '.openfeel', 'update_infos.md');
}

/** 全局 auth.json 路径（opencode 适配器：~/.local/share/opencode/auth.json；模型 provider 校验依据，REV-1505） */
export function getAuthJsonPath(): string {
  return join(homedir(), '.local', 'share', 'opencode', 'auth.json');
}

/** 全局锁文件路径（~/.openfeel/locks/{name}.lock；跨项目全局写入用，REV-1801） */
export function getGlobalLockPath(name: string): string {
  return join(homedir(), '.openfeel', 'locks', `${name}.lock`);
}

/** 全局配置文件路径（~/.openfeel/config.json，跨平台兼容，REV-1801） */
export function getGlobalOpenfeelConfigPath(): string {
  return join(homedir(), '.openfeel', 'config.json');
}

/** 全局用户画像路径（~/.config/openfeel/profile.yaml，跨项目共享偏好，REV-1801） */
export function getGlobalProfilePath(): string {
  return join(homedir(), '.config', 'openfeel', 'profile.yaml');
}

/** 全局 Schema 目录（~/.openfeel/schemas，Schema 家目录查找层，REV-1801） */
export function getGlobalSchemasDir(): string {
  return join(homedir(), '.openfeel', 'schemas');
}

/** 全局备份根目录（~/.openfeel/backup；部署覆盖前备份统一根，stage-46） */
export function getGlobalBackupRootPath(): string {
  return join(homedir(), '.openfeel', 'backup');
}
