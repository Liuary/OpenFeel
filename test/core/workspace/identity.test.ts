/**
 * identity 单元测试
 * 测试 ensureInfoJson 和 getLang 的语言配置读写逻辑
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { ensureInfoJson, getLang, recordProjectLang, getGlobalConfig } from '../../../src/core/workspace/identity.js';

describe('getLang', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-identity-test-'));
    mkdirSync(join(tmpDir, '.openfeel'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('无 .info.json 时返回 zh-CN', () => {
    const lang = getLang(tmpDir);
    expect(lang).toBe('zh-CN');
  });

  it('.info.json 中有 lang=en 时返回 en', () => {
    const infoPath = join(tmpDir, '.openfeel', '.info.json');
    writeFileSync(infoPath, JSON.stringify({ user: 'test', lang: 'en' }), 'utf-8');
    const lang = getLang(tmpDir);
    expect(lang).toBe('en');
  });

  it('.info.json 中 lang=fr（非法值）时回退返回 zh-CN', () => {
    const infoPath = join(tmpDir, '.openfeel', '.info.json');
    writeFileSync(infoPath, JSON.stringify({ user: 'test', lang: 'fr' }), 'utf-8');
    const lang = getLang(tmpDir);
    expect(lang).toBe('zh-CN');
  });

  it('.info.json 中无 lang 字段时返回 zh-CN', () => {
    const infoPath = join(tmpDir, '.openfeel', '.info.json');
    writeFileSync(infoPath, JSON.stringify({ user: 'test' }), 'utf-8');
    const lang = getLang(tmpDir);
    expect(lang).toBe('zh-CN');
  });
});

describe('ensureInfoJson', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-identity-test-'));
    mkdirSync(join(tmpDir, '.openfeel'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('.info.json 不存在时创建文件含 lang: zh-CN 和 user', () => {
    ensureInfoJson(tmpDir);
    const infoPath = join(tmpDir, '.openfeel', '.info.json');
    expect(existsSync(infoPath)).toBe(true);
    const info = JSON.parse(readFileSync(infoPath, 'utf-8'));
    expect(info.lang).toBe('zh-CN');
    expect(info.user).toBeTruthy();
  });

  it('.info.json 存在但无 lang 时补充写入 zh-CN，不覆盖 user', () => {
    const infoPath = join(tmpDir, '.openfeel', '.info.json');
    writeFileSync(infoPath, JSON.stringify({ user: 'test-user' }), 'utf-8');

    ensureInfoJson(tmpDir);

    const info = JSON.parse(readFileSync(infoPath, 'utf-8'));
    expect(info.lang).toBe('zh-CN');
    expect(info.user).toBe('test-user');
  });

  it('.info.json 已有 lang=en 时保留不变', () => {
    const infoPath = join(tmpDir, '.openfeel', '.info.json');
    writeFileSync(infoPath, JSON.stringify({ user: 'test', lang: 'en' }), 'utf-8');

    ensureInfoJson(tmpDir);

    const info = JSON.parse(readFileSync(infoPath, 'utf-8'));
    expect(info.lang).toBe('en');
    expect(info.user).toBe('test');
  });
});

describe('recordProjectLang', () => {
  let tmpDir: string;
  let globalConfigPath: string;
  let savedConfig: string | null = null;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-identity-record-'));
    globalConfigPath = join(homedir(), '.openfeel', 'config.json');
    // 保存现有的全局配置内容，测试后恢复
    if (existsSync(globalConfigPath)) {
      savedConfig = readFileSync(globalConfigPath, 'utf-8');
    }
  });

  afterEach(() => {
    // 清理测试写入的全局配置
    if (savedConfig !== null) {
      writeFileSync(globalConfigPath, savedConfig, 'utf-8');
    } else {
      try {
        const config = JSON.parse(readFileSync(globalConfigPath, 'utf-8'));
        delete config.projects[tmpDir];
        if (Object.keys(config.projects).length === 0) {
          delete config.projects;
        }
        writeFileSync(globalConfigPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
      } catch {
        // 忽略清理失败
      }
    }
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('应记录项目语言到全局配置', () => {
    recordProjectLang(tmpDir, 'en');
    const config = getGlobalConfig();
    expect(config.projects[tmpDir]).toBe('en');
  });

  it('语言相同时应跳过写入（幂等性）', () => {
    recordProjectLang(tmpDir, 'en');
    const config1 = JSON.parse(readFileSync(globalConfigPath, 'utf-8'));
    const mtime1 = JSON.stringify(config1);

    recordProjectLang(tmpDir, 'en');
    const config2 = JSON.parse(readFileSync(globalConfigPath, 'utf-8'));
    const mtime2 = JSON.stringify(config2);

    expect(mtime2).toBe(mtime1);
  });

  it('语言不同时应更新映射', () => {
    recordProjectLang(tmpDir, 'en');
    recordProjectLang(tmpDir, 'zh-CN');
    const config = getGlobalConfig();
    expect(config.projects[tmpDir]).toBe('zh-CN');
  });
});
