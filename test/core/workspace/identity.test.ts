/**
 * identity 单元测试
 * 测试 ensureInfoJson 和 getLang 的语言配置读写逻辑
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ensureInfoJson, getLang } from '../../../src/core/workspace/identity.js';

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
