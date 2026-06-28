/**
 * init 单元测试
 * 测试 initProject 在临时目录中的完整行为
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initProject } from '../../src/core/init.js';
import { readConfig } from '../../src/core/config.js';
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('initProject', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-init-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('应创建 .openfeel/ 目录结构', () => {
    const result = initProject(tmpDir);
    const base = join(tmpDir, '.openfeel');

    expect(existsSync(base)).toBe(true);
    expect(existsSync(join(base, 'plan'))).toBe(true);
    expect(existsSync(join(base, 'kb'))).toBe(true);
    expect(existsSync(join(base, 'dev'))).toBe(true);
    expect(existsSync(join(base, 'log'))).toBe(true);
    expect(existsSync(join(base, 'code_review'))).toBe(true);
    expect(existsSync(join(base, 'bugs'))).toBe(true);
    expect(existsSync(join(base, 'tmp'))).toBe(true);

    // 验证返回的创建列表包含目录
    expect(result.created.some((item) => item.includes('.openfeel/'))).toBe(true);
  });

  it('应创建 config.yaml 并包含正确默认值', () => {
    initProject(tmpDir);
    const configPath = join(tmpDir, '.openfeel', 'config.yaml');
    expect(existsSync(configPath)).toBe(true);

    const content = readFileSync(configPath, 'utf-8');
    expect(content).toContain('execution_mode: manual');
    expect(content).toContain('auto_advance: disabled');
    expect(content).toContain('test_enabled: false');
    expect(content).toContain('merge_mode: manual');
  });

  it('readConfig 应能正确解析 config.yaml', () => {
    initProject(tmpDir);
    const config = readConfig(tmpDir);
    expect(config.execution_mode).toBe('manual');
    expect(config.auto_advance).toBe('disabled');
    expect(config.test_enabled).toBe(false);
    expect(config.merge_mode).toBe('manual');
  });

  it('应创建 flow.json 并包含正确结构', () => {
    initProject(tmpDir);
    const flowPath = join(tmpDir, '.openfeel', 'flow.json');
    expect(existsSync(flowPath)).toBe(true);

    const flowData = JSON.parse(readFileSync(flowPath, 'utf-8'));
    expect(flowData.meta.version).toBe('1.0');
    expect(flowData.meta.project).toBe('OpenFeel');
    expect(flowData.pipeline.phase).toBe('plan_pending');
    expect(flowData.pipeline.retry).toBe(0);
    expect(Array.isArray(flowData.reviews)).toBe(true);
    expect(Array.isArray(flowData.log)).toBe(true);
    expect(typeof flowData.stages).toBe('object');
  });

  it('应创建 .info.json 包含用户信息', () => {
    initProject(tmpDir);
    const infoPath = join(tmpDir, '.openfeel', '.info.json');
    expect(existsSync(infoPath)).toBe(true);

    const info = JSON.parse(readFileSync(infoPath, 'utf-8'));
    expect(info).toHaveProperty('user');
    expect(typeof info.user).toBe('string');
    expect(info.user.length).toBeGreaterThan(0);
  });

  it('应更新 .gitignore 包含 .openfeel/', () => {
    initProject(tmpDir);
    const gitignorePath = join(tmpDir, '.gitignore');

    expect(existsSync(gitignorePath)).toBe(true);
    const content = readFileSync(gitignorePath, 'utf-8');
    expect(content).toContain('.openfeel/');
  });

  it('已有 .gitignore 且不含 .openfeel/ 时应追加', () => {
    // 先创建一个初始 .gitignore
    const gitignorePath = join(tmpDir, '.gitignore');
    writeFileSync(gitignorePath, 'node_modules/\n', 'utf-8');

    // 然后初始化
    initProject(tmpDir);

    const content = readFileSync(gitignorePath, 'utf-8');
    expect(content).toContain('node_modules/');
    expect(content).toContain('.openfeel/');
  });

  it('已存在 .openfeel/ 时不覆盖已有文件（只更新）', () => {
    // 第一次初始化
    const result1 = initProject(tmpDir);
    expect(result1.created.length).toBeGreaterThan(0);

    // 第二次初始化 — 目录已存在，不会重复创建
    const result2 = initProject(tmpDir);
    // 第二次初始化时 created 应该为空（所有文件和目录都已存在）
    expect(result2.created.length).toBe(0);
  });

  it('readConfig 对不存在的文件应返回空对象', () => {
    const config = readConfig(tmpDir);
    expect(config).toEqual({});
  });

  it('应返回正确的 created 列表', () => {
    const result = initProject(tmpDir);

    // 验证 created 包含关键条目
    expect(result.created.some((e) => e === '.openfeel/config.yaml')).toBe(true);
    expect(result.created.some((e) => e === '.openfeel/flow.json')).toBe(true);
    expect(result.created.some((e) => e === '.openfeel/.info.json')).toBe(true);
  });
});
