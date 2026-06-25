/**
 * config 单元测试
 * 测试 readConfig 和 writeDefaultConfig 的 YAML 解析行为
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readConfig, writeDefaultConfig } from '../../src/core/config.js';
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('readConfig', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-config-test-'));
    // 创建 .openfeel 目录
    mkdirSync(join(tmpDir, '.openfeel'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('应正确解析 config.yaml 所有字段', () => {
    const content = `# 测试配置
execution_mode: auto
auto_advance: enabled
test_enabled: true
merge_mode: auto
`;
    writeFileSync(join(tmpDir, '.openfeel', 'config.yaml'), content, 'utf-8');
    const config = readConfig(tmpDir);
    expect(config.execution_mode).toBe('auto');
    expect(config.auto_advance).toBe('enabled');
    expect(config.test_enabled).toBe(true);
    expect(config.merge_mode).toBe('auto');
  });

  it('应对不存在的文件返回空对象', () => {
    const config = readConfig(tmpDir);
    expect(config).toEqual({});
  });

  it('应忽略注释行（以 # 开头）', () => {
    const content = `# 这是一行注释
execution_mode: manual
# 这也是一行注释
auto_advance: disabled
`;
    writeFileSync(join(tmpDir, '.openfeel', 'config.yaml'), content, 'utf-8');
    const config = readConfig(tmpDir);
    // 注释不影响解析结果
    expect(config.execution_mode).toBe('manual');
    expect(config.auto_advance).toBe('disabled');
  });

  it('应忽略空行', () => {
    const content = `

execution_mode: manual

auto_advance: disabled

`;
    writeFileSync(join(tmpDir, '.openfeel', 'config.yaml'), content, 'utf-8');
    const config = readConfig(tmpDir);
    expect(config.execution_mode).toBe('manual');
    expect(config.auto_advance).toBe('disabled');
  });

  it('应忽略没有 value 的 key（如块标记 "defaults:"）', () => {
    const content = `defaults:
execution_mode: manual
`;
    writeFileSync(join(tmpDir, '.openfeel', 'config.yaml'), content, 'utf-8');
    const config = readConfig(tmpDir);
    // "defaults:" 行没有 value，应被忽略
    expect(config.execution_mode).toBe('manual');
    // defaults 不是已知 key，不会被赋值
    expect((config as Record<string, unknown>).defaults).toBeUndefined();
  });

  it('test_enabled 应正确解析 true/false 布尔值', () => {
    // 测试 true
    const contentTrue = 'test_enabled: true\n';
    writeFileSync(join(tmpDir, '.openfeel', 'config.yaml'), contentTrue, 'utf-8');
    expect(readConfig(tmpDir).test_enabled).toBe(true);

    // 测试 false
    const contentFalse = 'test_enabled: false\n';
    writeFileSync(join(tmpDir, '.openfeel', 'config.yaml'), contentFalse, 'utf-8');
    expect(readConfig(tmpDir).test_enabled).toBe(false);
  });

  it('应正确解析 meta.version', () => {
    const content = `version: 1.0
execution_mode: manual
`;
    writeFileSync(join(tmpDir, '.openfeel', 'config.yaml'), content, 'utf-8');
    const config = readConfig(tmpDir);
    expect(config.meta).toBeDefined();
    expect(config.meta!.version).toBe('1.0');
  });
});

describe('writeDefaultConfig', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-config-write-test-'));
    mkdirSync(join(tmpDir, '.openfeel'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('应写入正确的默认值', () => {
    writeDefaultConfig(tmpDir);
    const configPath = join(tmpDir, '.openfeel', 'config.yaml');
    expect(existsSync(configPath)).toBe(true);

    const content = readFileSync(configPath, 'utf-8');
    expect(content).toContain('execution_mode: manual');
    expect(content).toContain('auto_advance: disabled');
    expect(content).toContain('test_enabled: false');
    expect(content).toContain('merge_mode: manual');
  });

  it('readConfig 应能正确解析 writeDefaultConfig 写入的内容', () => {
    writeDefaultConfig(tmpDir);
    const config = readConfig(tmpDir);
    expect(config.execution_mode).toBe('manual');
    expect(config.auto_advance).toBe('disabled');
    expect(config.test_enabled).toBe(false);
    expect(config.merge_mode).toBe('manual');
  });
});
