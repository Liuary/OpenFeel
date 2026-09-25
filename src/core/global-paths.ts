/**
 * 全局路径模块
 * 集中解析 opencode 与 openfeel 的全局路径（基于用户主目录），
 * 作为 init/update 全局部署的路径基础。
 * 仅此模块 import node:os 的 homedir（N4）：测试 mock 一处即隔离全部全局路径。
 */
import { join } from 'node:path';
import { homedir } from 'node:os';

/** 全局 opencode 配置根目录（~/.config/opencode） */
export function getOpencodeGlobalDir(): string {
  return join(homedir(), '.config', 'opencode');
}

/** 全局 opencode agents 目录 */
export function getGlobalAgentsDir(): string {
  return join(getOpencodeGlobalDir(), 'agents');
}

/** 全局 opencode skills 目录 */
export function getGlobalSkillsDir(): string {
  return join(getOpencodeGlobalDir(), 'skills');
}

/** 全局 opencode.jsonc 路径 */
export function getGlobalOpencodeJsoncPath(): string {
  return join(getOpencodeGlobalDir(), 'opencode.jsonc');
}

/** 全局框架约束 core.md 路径（~/.config/opencode/openfeel/core.md） */
export function getGlobalCoreMdPath(): string {
  return join(getOpencodeGlobalDir(), 'openfeel', 'core.md');
}

/** 全局 update_state.json 路径（~/.openfeel/update_state.json） */
export function getGlobalUpdateStatePath(): string {
  return join(homedir(), '.openfeel', 'update_state.json');
}

/** 全局 update_infos.md 路径（~/.openfeel/update_infos.md；读写属 stage-38，本阶段仅解析路径） */
export function getGlobalUpdateInfosPath(): string {
  return join(homedir(), '.openfeel', 'update_infos.md');
}

/** 全局 auth.json 路径（~/.local/share/opencode/auth.json；模型 provider 校验依据，REV-1505） */
export function getAuthJsonPath(): string {
  return join(homedir(), '.local', 'share', 'opencode', 'auth.json');
}
