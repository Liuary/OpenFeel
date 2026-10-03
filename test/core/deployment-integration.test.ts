/**
 * deployment-integration 端到端测试（stage-66）
 * 验证 D-A「写入侧刷新 + 读取侧检测」成对闭环；隔离 HOME，不触碰真实 ~/.openfeel/。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const mockHome = vi.hoisted(() => ({ dir: '' }));
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => mockHome.dir };
});

import { setupGlobalFramework } from '../../src/core/setup.js';
import { updateProject } from '../../src/core/update.js';
import { checkGlobalDeployment } from '../../src/core/deployment-check.js';
import { getOpenfeelVersion } from '../../src/core/update-state.js';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/** 全局 state 路径（基于 mock home） */
function globalStatePath(): string {
  return join(mockHome.dir, '.openfeel', 'update_state.json');
}
/** 预置全局 state（旧版本），模拟升级 CLI 后尚未重跑部署的现场 */
function seedStaleGlobalState(version = '1.0.0'): void {
  mkdirSync(join(mockHome.dir, '.openfeel'), { recursive: true });
  writeFileSync(
    globalStatePath(),
    JSON.stringify({ version: '1.0', last_update: '', openfeel_version: version, files: {} }, null, 2) + '\n',
    'utf-8',
  );
}

describe('stage-66 端到端：刷新 + 检测成对闭环', () => {
  let projectDir: string;

  beforeEach(() => {
    mockHome.dir = mkdtempSync(join(tmpdir(), 'openfeel-deployint-home-'));
    projectDir = mkdtempSync(join(tmpdir(), 'openfeel-deployint-proj-'));
  });
  afterEach(() => {
    rmSync(mockHome.dir, { recursive: true, force: true });
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('场景 A：旧版本 state → mismatch → setup → ok（决定性）', () => {
    seedStaleGlobalState('1.0.0');
    expect(checkGlobalDeployment({ currentVersion: getOpenfeelVersion() }).status).toBe('mismatch');

    setupGlobalFramework('zh-CN');

    const r = checkGlobalDeployment({ currentVersion: getOpenfeelVersion() });
    expect(r.status).toBe('ok');
    expect(r.deployedVersion).toBe(getOpenfeelVersion());
  });

  it('场景 B：旧版本 state → update → ok', () => {
    seedStaleGlobalState('0.0.1');
    updateProject(projectDir);

    const r = checkGlobalDeployment({ currentVersion: getOpenfeelVersion() });
    expect(r.status).toBe('ok');
    expect(r.deployedVersion).toBe(getOpenfeelVersion());
  });

  it('场景 C：无 state → missing → setup → ok（npm 升级后未 setup 现场）', () => {
    expect(checkGlobalDeployment({ currentVersion: getOpenfeelVersion() }).status).toBe('missing');
    setupGlobalFramework('zh-CN');
    expect(checkGlobalDeployment({ currentVersion: getOpenfeelVersion() }).status).toBe('ok');
  });

  it('场景 D：检测全程只读（mismatch 检测不改写 stale state）', () => {
    seedStaleGlobalState('1.0.0');
    const before = readFileSync(globalStatePath(), 'utf-8');
    checkGlobalDeployment({ currentVersion: getOpenfeelVersion() });
    expect(readFileSync(globalStatePath(), 'utf-8')).toBe(before);
  });
});
