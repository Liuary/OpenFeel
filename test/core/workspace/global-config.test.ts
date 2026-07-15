/**
 * 全局配置单元测试
 *
 * 验证 getGlobalConfig / setGlobalConfig / isFirstUse 功能。
 * 使用 mock homedir() + 临时目录完全隔离，不碰触真实 ~/.openfeel/config.json。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getGlobalConfig,
  setGlobalConfig,
  isFirstUse,
  DEFAULT_GLOBAL_CONFIG,
} from '../../../src/core/workspace/identity.js';
import { existsSync, rmSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

describe('全局配置 - getGlobalConfig/setGlobalConfig/isFirstUse', () => {
  // 创建临时目录作为 mock home
  let tempHome: string;
  let configPath: string;
  let configDir: string;

  beforeEach(() => {
    // 创建临时目录
    tempHome = mkdtempSync(join(tmpdir(), 'openfeel-test-'));
    configDir = join(tempHome, '.openfeel');
    configPath = join(configDir, 'config.json');
    // Mock homedir() 返回临时目录
    vi.mock('node:os', () => ({
      ...vi.importActual('node:os'),
      homedir: () => tempHome,
    }));
  });

  afterEach(() => {
    // 清理临时目录
    rmSync(tempHome, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('isFirstUse() 在文件不存在时返回 true', () => {
    expect(isFirstUse()).toBe(true);
  });

  it('isFirstUse() 在文件存在时返回 false', () => {
    setGlobalConfig(DEFAULT_GLOBAL_CONFIG);
    expect(isFirstUse()).toBe(false);
  });

  it('getGlobalConfig() 在无文件时返回默认配置', () => {
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
