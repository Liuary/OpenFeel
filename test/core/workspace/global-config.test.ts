/**
 * 全局配置单元测试
 *
 * 验证 getGlobalConfig / setGlobalConfig / isFirstUse 功能。
 * 注意：这些测试会在真实 ~/.openfeel/config.json 上操作，
 * 执行前会备份并恢复现有配置。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getGlobalConfig,
  setGlobalConfig,
  isFirstUse,
  DEFAULT_GLOBAL_CONFIG,
} from '../../../src/core/workspace/identity.js';
import { existsSync, rmSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

describe('全局配置 - getGlobalConfig/setGlobalConfig/isFirstUse', () => {
  const configPath = join(homedir(), '.openfeel', 'config.json');
  const configDir = dirname(configPath);

  // 在测试前保存现有配置的备份
  let backup: string | null = null;

  beforeEach(() => {
    if (existsSync(configPath)) {
      backup = readFileSync(configPath, 'utf-8');
    } else {
      backup = null;
    }
  });

  afterEach(() => {
    // 恢复备份
    if (backup !== null) {
      try {
        writeFileSync(configPath, backup, 'utf-8');
      } catch {
        // 忽略
      }
    } else {
      // 创建前不存在，测试后清理
      try {
        rmSync(configPath, { force: true });
      } catch {
        // 忽略
      }
    }
  });

  it('isFirstUse() 在文件不存在时返回 true', () => {
    // 确保配置文件不存在
    if (existsSync(configPath)) {
      rmSync(configPath, { force: true });
    }
    expect(isFirstUse()).toBe(true);
  });

  it('isFirstUse() 在文件存在时返回 false', () => {
    setGlobalConfig(DEFAULT_GLOBAL_CONFIG);
    expect(isFirstUse()).toBe(false);
  });

  it('getGlobalConfig() 在无文件时返回默认配置', () => {
    if (existsSync(configPath)) {
      rmSync(configPath, { force: true });
    }
    const config = getGlobalConfig();
    expect(config.lang).toBe('zh-CN');
    expect(config.projects).toEqual({});
  });

  it('setGlobalConfig() 后 getGlobalConfig() 返回写入的配置', () => {
    setGlobalConfig({ lang: 'en', projects: {} });
    const config = getGlobalConfig();
    expect(config.lang).toBe('en');
  });

  it('getGlobalConfig() 缺失字段应回退默认值', () => {
    // 确保目录存在
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }
    // 写入不完整的配置（缺失 lang 字段）
    writeFileSync(configPath, JSON.stringify({ projects: { '/test': 'en' } }), 'utf-8');
    const config = getGlobalConfig();
    expect(config.lang).toBe('zh-CN'); // 缺失 lang 字段，回退默认值
    expect(config.projects).toEqual({ '/test': 'en' });
  });
});
