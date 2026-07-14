/**
 * 用户身份识别
 * 管理项目下的 .openfeel/.info.json 文件。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

/** .info.json 的类型定义 */
export interface InfoJson {
  user: string;
  lang: 'zh-CN' | 'en';
}

/** 合法的语言值列表 */
const VALID_LANGS = ['zh-CN', 'en'] as const;

/** 默认语言 */
const DEFAULT_LANG: 'zh-CN' = 'zh-CN';

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
