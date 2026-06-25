/**
 * 用户身份识别
 * 管理项目下的 .openfeel/.info.json 文件。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

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
 * 确保 .openfeel/.info.json 存在
 * 若不存在则创建并写入当前用户名。若已存在则保留不覆盖。
 */
export function ensureInfoJson(projectPath: string): void {
  const infoPath = resolve(projectPath, '.openfeel', '.info.json');

  if (existsSync(infoPath)) {
    return;
  }

  const userName = getUserName(projectPath);
  const content = JSON.stringify({ user: userName }, null, 2) + '\n';
  writeFileSync(infoPath, content, 'utf-8');
}
