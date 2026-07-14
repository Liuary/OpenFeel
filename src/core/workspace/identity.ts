/**
 * 用户身份识别
 * 管理项目下的 .openfeel/.info.json 文件。
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { execSync } from 'node:child_process';
import { homedir } from 'node:os';

/** .info.json 的类型定义 */
export interface InfoJson {
  user: string;
  lang: 'zh-CN' | 'en';
}

/** 合法的语言值列表 */
const VALID_LANGS = ['zh-CN', 'en'] as const;

/** 默认语言 */
const DEFAULT_LANG: 'zh-CN' = 'zh-CN';

/** 全局配置类型（~/.openfeel/config.json） */
export interface GlobalConfig {
  /** 用户全局默认语言偏好 */
  lang: 'zh-CN' | 'en';
  /** 项目路径→使用语言的 KV 映射（由 openfeel update 自动记录） */
  projects: Record<string, 'zh-CN' | 'en'>;
}

/** 全局配置默认值（首次使用时的初始配置） */
export const DEFAULT_GLOBAL_CONFIG: GlobalConfig = {
  lang: 'zh-CN',
  projects: {} as Record<string, 'zh-CN' | 'en'>,
};

/**
 * 获取用户名
 * 优先读取 .openfeel/.info.json，若不存在则尝试从 git config 获取，
 * 均失败则返回默认值 'unknown'。
 */
export function getUserName(projectPath: string): string {
  const infoPath = resolve(projectPath, '.openfeel', '.info.json');

  // 尝试从 .info.json 读取
  if (existsSync(infoPath)) {
    try {
      const content = readFileSync(infoPath, 'utf-8');
      const info = JSON.parse(content) as { user?: string };
      if (info.user && info.user.length > 0) {
        return info.user;
      }
    } catch {
      // JSON 解析失败，忽略，回退到 git config
    }
  }

  // 尝试从 git config 获取
  try {
    const name = execSync('git config user.name', {
      encoding: 'utf-8',
      cwd: projectPath,
    }).trim();
    if (name.length > 0) {
      return name;
    }
  } catch {
    // git 命令执行失败，忽略
  }

  return 'unknown';
}

/**
 * 获取语言配置
 * 读取 .openfeel/.info.json 中的 lang 字段。
 * lang 不存在或非法值时回退返回 'zh-CN'。
 * 本函数只读不写，补充写入在 ensureInfoJson 中完成。
 */
export function getLang(projectPath: string): 'zh-CN' | 'en' {
  const infoPath = resolve(projectPath, '.openfeel', '.info.json');
  if (!existsSync(infoPath)) {
    return DEFAULT_LANG;
  }
  try {
    const content = readFileSync(infoPath, 'utf-8');
    const info = JSON.parse(content) as InfoJson;
    if (info.lang && VALID_LANGS.includes(info.lang as any)) {
      return info.lang;
    }
  } catch {
    // JSON 解析失败，忽略
  }
  return DEFAULT_LANG;
}

/**
 * 确保 .openfeel/.info.json 存在
 * 若不存在则创建并写入当前用户名和默认语言。
 * 若已存在则检查 lang 字段，不存在或为空时补充写入默认值 zh-CN。
 * 不会覆盖已有的 user 和 lang 值。
 */
export function ensureInfoJson(projectPath: string): void {
  const infoPath = resolve(projectPath, '.openfeel', '.info.json');

  if (!existsSync(infoPath)) {
    const userName = getUserName(projectPath);
    const content = JSON.stringify({ user: userName, lang: 'zh-CN' }, null, 2) + '\n';
    writeFileSync(infoPath, content, 'utf-8');
    return;
  }

  // 文件已存在，检查 lang 字段
  try {
    const content = readFileSync(infoPath, 'utf-8');
    const info = JSON.parse(content) as InfoJson;
    if (!info.lang || !VALID_LANGS.includes(info.lang as any)) {
      info.lang = 'zh-CN';
      writeFileSync(infoPath, JSON.stringify(info, null, 2) + '\n', 'utf-8');
    }
    // lang 已存在且有效，保留不变（向后兼容）
  } catch {
    // JSON 解析失败，不做修改
  }
}

/** 获取全局配置文件路径（~/.openfeel/config.json，跨平台兼容） */
function getGlobalConfigPath(): string {
  return join(homedir(), '.openfeel', 'config.json');
}

/**
 * 读取全局配置文件（~/.openfeel/config.json）。
 * 文件不存在时返回默认配置（DEFAULT_GLOBAL_CONFIG），不创建文件。
 * JSON 解析失败时返回默认配置并 console.warn。
 */
export function getGlobalConfig(): GlobalConfig {
  const path = getGlobalConfigPath();
  if (!existsSync(path)) {
    // 文件不存在，返回默认配置（深拷贝）
    return { ...DEFAULT_GLOBAL_CONFIG, projects: { ...DEFAULT_GLOBAL_CONFIG.projects } };
  }
  try {
    const content = readFileSync(path, 'utf-8');
    const config = JSON.parse(content) as Partial<GlobalConfig>;
    // 合并默认值保证缺失字段兜底
    return {
      lang: config.lang && ['zh-CN', 'en'].includes(config.lang) ? config.lang : DEFAULT_GLOBAL_CONFIG.lang,
      projects: config.projects ?? {},
    };
  } catch {
    // JSON 解析失败
    console.warn('[i18n] 全局配置 JSON 解析失败，使用默认值');
    return { ...DEFAULT_GLOBAL_CONFIG, projects: { ...DEFAULT_GLOBAL_CONFIG.projects } };
  }
}

/**
 * 写入全局配置文件（~/.openfeel/config.json）。
 * 自动创建父目录（~/.openfeel/）。
 * 写入失败时 throw Error。
 */
export function setGlobalConfig(config: GlobalConfig): void {
  const path = getGlobalConfigPath();
  // 确保父目录存在
  mkdirSync(dirname(path), { recursive: true });
  // 写入文件
  writeFileSync(path, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

/**
 * 检测是否为首次使用 OpenFeel（全局配置文件不存在）。
 * @returns true 表示首次使用，需要语言选择提示
 */
export function isFirstUse(): boolean {
  return !existsSync(getGlobalConfigPath());
}
