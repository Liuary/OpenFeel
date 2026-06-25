/**
 * 配置文件读写
 * 管理项目下的 .openfeel/config.yaml 文件，使用简单手写 YAML 解析。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/** 配置文件结构 */
export interface Config {
  meta?: { version?: string };
  execution_mode?: 'manual' | 'auto';
  auto_advance?: 'disabled' | 'enabled';
  test_enabled?: boolean;
  merge_mode?: 'manual' | 'auto';
}

/** 默认配置值 */
const DEFAULT_CONFIG: Config = {
  execution_mode: 'manual',
  auto_advance: 'disabled',
  test_enabled: false,
  merge_mode: 'manual',
};

/**
 * 读取项目下的 .openfeel/config.yaml
 * 解析简单 key: value 格式 YAML，忽略注释和空行。
 * 若文件不存在，返回空对象。
 */
export function readConfig(projectPath: string): Config {
  const configPath = resolve(projectPath, '.openfeel', 'config.yaml');
  if (!existsSync(configPath)) {
    return {};
  }

  const content = readFileSync(configPath, 'utf-8');
  const config: Config = {};
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    // 跳过注释行和空行
    if (trimmed === '' || trimmed.startsWith('#')) {
      continue;
    }

    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) {
      continue;
    }

    const key = trimmed.substring(0, colonIdx).trim();
    const val = trimmed.substring(colonIdx + 1).trim();

    // 跳过只有 key 没有 value 的行（如 "defaults:" 块标记）
    if (val === '') {
      continue;
    }

    // 按 key 赋值
    switch (key) {
      case 'version':
        if (!config.meta) {
          config.meta = {};
        }
        config.meta.version = val;
        break;
      case 'execution_mode':
        if (val === 'manual' || val === 'auto') {
          config.execution_mode = val;
        }
        break;
      case 'auto_advance':
        if (val === 'disabled' || val === 'enabled') {
          config.auto_advance = val;
        }
        break;
      case 'test_enabled':
        config.test_enabled = val === 'true';
        break;
      case 'merge_mode':
        if (val === 'manual' || val === 'auto') {
          config.merge_mode = val;
        }
        break;
      // 未知 key 静默忽略
    }
  }

  return config;
}

/**
 * 写入默认配置到 .openfeel/config.yaml
 */
export function writeDefaultConfig(projectPath: string): void {
  const configPath = resolve(projectPath, '.openfeel', 'config.yaml');
  const content = `# OpenFeel 项目配置
execution_mode: ${DEFAULT_CONFIG.execution_mode}
auto_advance: ${DEFAULT_CONFIG.auto_advance}
test_enabled: ${String(DEFAULT_CONFIG.test_enabled)}
merge_mode: ${DEFAULT_CONFIG.merge_mode}
`;
  writeFileSync(configPath, content, 'utf-8');
}
