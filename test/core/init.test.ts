/**
 * init 单元测试
 * 测试 initProject 在临时目录中的完整行为
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initProject, deployOpencode, initDemo } from '../../src/core/init.js';
import { readConfig } from '../../src/core/config.js';
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { tmpdir } from 'node:os';

describe('initProject', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-init-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('应创建 .openfeel/ 目录结构', async () => {
    const result = await initProject(tmpDir);
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

  it('应创建 config.yaml 并包含正确默认值', async () => {
    await initProject(tmpDir);
    const configPath = join(tmpDir, '.openfeel', 'config.yaml');
    expect(existsSync(configPath)).toBe(true);

    const content = readFileSync(configPath, 'utf-8');
    expect(content).toContain('execution_mode: manual');
    expect(content).toContain('auto_advance: disabled');
    expect(content).toContain('test_enabled: false');
    expect(content).toContain('merge_mode: manual');
  });

  it('readConfig 应能正确解析 config.yaml', async () => {
    await initProject(tmpDir);
    const config = readConfig(tmpDir);
    expect(config.execution_mode).toBe('manual');
    expect(config.auto_advance).toBe('disabled');
    expect(config.test_enabled).toBe(false);
    expect(config.merge_mode).toBe('manual');
  });

  it('应创建 flow.json 并包含正确结构', async () => {
    await initProject(tmpDir);
    const flowPath = join(tmpDir, '.openfeel', 'flow.json');
    expect(existsSync(flowPath)).toBe(true);

    const flowData = JSON.parse(readFileSync(flowPath, 'utf-8'));
    expect(flowData.meta.version).toBe('1.0');
    expect(flowData.meta.project).toBe('OpenFeel');
    expect(flowData.pipeline.phase).toBe('active');
    expect(flowData.pipeline.retry).toBe(0);
    expect(Array.isArray(flowData.reviews)).toBe(true);
    expect(Array.isArray(flowData.log)).toBe(true);
    expect(typeof flowData.stages).toBe('object');
  });

  it('应创建 .info.json 包含用户信息', async () => {
    await initProject(tmpDir);
    const infoPath = join(tmpDir, '.openfeel', '.info.json');
    expect(existsSync(infoPath)).toBe(true);

    const info = JSON.parse(readFileSync(infoPath, 'utf-8'));
    expect(info).toHaveProperty('user');
    expect(typeof info.user).toBe('string');
    expect(info.user.length).toBeGreaterThan(0);
  });

  it('已存在 .openfeel/ 时不覆盖已有文件（只更新）', async () => {
    // 第一次初始化
    const result1 = await initProject(tmpDir);
    expect(result1.created.length).toBeGreaterThan(0);

    // 第二次初始化 — 目录已存在，不会重复创建
    const result2 = await initProject(tmpDir);
    // 第二次初始化时 created 应该为空（所有文件和目录都已存在）
    expect(result2.created.length).toBe(0);
  });

  it('readConfig 对不存在的文件应返回空对象', () => {
    const config = readConfig(tmpDir);
    expect(config).toEqual({});
  });

  it('应返回正确的 created 列表', async () => {
    const result = await initProject(tmpDir);

    // 验证 created 包含关键条目
    expect(result.created.some((e) => e === '.openfeel/config.yaml')).toBe(true);
    expect(result.created.some((e) => e === '.openfeel/flow.json')).toBe(true);
    expect(result.created.some((e) => e === '.openfeel/.info.json')).toBe(true);
  });

  it('应生成 .openfeel/dev/decisions.md（ADR 模板骨架）', async () => {
    const result = await initProject(tmpDir);
    const decisionsPath = join(tmpDir, '.openfeel', 'dev', 'decisions.md');
    expect(existsSync(decisionsPath)).toBe(true);
    expect(result.created.some((e) => e === '.openfeel/dev/decisions.md')).toBe(true);

    const content = readFileSync(decisionsPath, 'utf-8');
    // ADR 骨架四要素：决策 / 理由 / 日期 / 状态
    expect(content).toContain('决策');
    expect(content).toContain('理由');
    expect(content).toContain('日期');
    expect(content).toContain('状态');
  });
});

describe('initProject — opencode deployment', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-init-opencode-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('应替换 AGENTS.md 中的 {项目名称} 占位符为目录名', async () => {
    await initProject(tmpDir, 'zh-CN');
    const content = readFileSync(join(tmpDir, 'AGENTS.md'), 'utf-8');
    const dirName = basename(tmpDir);
    expect(content).not.toContain('{项目名称}');
    expect(content).toContain(dirName);
  });

  it('deployOpencode 首次部署应创建完整的 opencode 适配器文件', () => {
    // 直接调用导出的 deployOpencode（不依赖 initProject 交互流程）
    const result = deployOpencode(tmpDir, 'zh-CN');

    // 创建数：9 Agent + 14 Skill + instructions + opencode.jsonc + ADAPTER + .gitignore = 27
    // 注意 opencode.jsonc 部署到项目根目录
    expect(result.created).toBe(27);
    expect(result.skipped).toBe(0);

    // 验证关键文件存在
    expect(existsSync(join(tmpDir, '.opencode', 'agents', 'feel.md'))).toBe(true);
    expect(existsSync(join(tmpDir, '.opencode', 'skills', 'check-kb', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(tmpDir, '.opencode', 'instructions', 'core.md'))).toBe(true);
    expect(existsSync(join(tmpDir, 'opencode.jsonc'))).toBe(true);
    expect(existsSync(join(tmpDir, '.opencode', 'ADAPTER.zh-CN.md'))).toBe(true);
    expect(existsSync(join(tmpDir, '.opencode', '.gitignore'))).toBe(true);

    // REV-001：不部署 package.json
    expect(existsSync(join(tmpDir, '.opencode', 'package.json'))).toBe(false);

    // Agent 数量 9 个
    const agentFiles = readdirSync(join(tmpDir, '.opencode', 'agents')).filter((f) => f.endsWith('.md'));
    expect(agentFiles.length).toBe(9);

    // 再次部署 → 全部 skipped（已存在不覆盖）
    const result2 = deployOpencode(tmpDir, 'zh-CN');
    expect(result2.created).toBe(0);
    expect(result2.skipped).toBe(27);
  });

  it('非交互模式应跳过 opencode 部署', async () => {
    // vitest 运行时 stdout.isTTY 为 false → promptOpencodeDeploy 返回 false
    const result = await initProject(tmpDir, 'zh-CN');
    const opencodeDir = join(tmpDir, '.opencode');
    expect(existsSync(opencodeDir)).toBe(false);
    expect(result.opencode).toBeUndefined();
  });

  it('opencode.jsonc 中不应包含 {项目名称} 占位符', () => {
    deployOpencode(tmpDir, 'zh-CN');
    const opencodeJsonPath = join(tmpDir, 'opencode.jsonc');
    expect(existsSync(opencodeJsonPath)).toBe(true);
    const content = readFileSync(opencodeJsonPath, 'utf-8');
    expect(content).not.toContain('{项目名称}');
  });
});

describe('initDemo', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-init-demo-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('应部署多级示例阶段 plan/v1/stage-01/status.md', async () => {
    // 先初始化工作区（确保 flow.json 存在）
    await initProject(tmpDir);
    initDemo(tmpDir, 'zh-CN');

    // 断言多级路径存在
    expect(existsSync(join(tmpDir, '.openfeel', 'plan', 'v1', 'stage-01', 'status.md'))).toBe(true);

    // 断言 flow.json 注册完整 stageId
    const flowData = JSON.parse(readFileSync(join(tmpDir, '.openfeel', 'flow.json'), 'utf-8'));
    expect(flowData.stages['v1.0.0-stage-01']).toBeDefined();
    expect(flowData.stages['stage-01']).toBeUndefined();

    // 断言 status.md 标题为完整 stageId
    const statusContent = readFileSync(join(tmpDir, '.openfeel', 'plan', 'v1', 'stage-01', 'status.md'), 'utf-8');
    expect(statusContent).toContain('# v1.0.0-stage-01 状态');
  });
});
